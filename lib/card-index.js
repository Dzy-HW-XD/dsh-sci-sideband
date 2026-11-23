const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'by', 'is', 'are',
  'this', 'that', 'we', 'our', 'it', 'as', 'at', 'from', 'be', 'can', 'not',
  '的', '了', '和', '与', '及', '是', '在', '对', '为', '中', '有', '并', '或', '一个', '一种',
]);

function tokenize(text) {
  const lower = String(text || '').toLowerCase();
  const out = [];
  for (const word of lower.match(/[a-z0-9][a-z0-9.+#_-]{1,}/g) || []) {
    if (!STOP.has(word) && word.length >= 2) out.push(word);
  }
  for (const run of lower.match(/[\u3400-\u9fff]+/g) || []) {
    for (let i = 0; i < run.length; i += 1) {
      const char = run[i];
      if (!STOP.has(char)) out.push(char);
      if (i + 1 < run.length) {
        const bigram = run.slice(i, i + 2);
        if (!STOP.has(bigram)) out.push(bigram);
      }
    }
  }
  return out;
}

function fieldText(card) {
  const data = card.data
    ? [card.data.label, card.data.value, card.data.unit, card.data.context].filter(Boolean).join(' ')
    : '';
  const figure = card.figure
    ? [card.figure.caption, card.figure.interpretation, card.figure.dataNeeded].filter(Boolean).join(' ')
    : '';
  return {
    title: card.title || '',
    theme: card.theme || '',
    tags: Array.isArray(card.tags) ? card.tags.join(' ') : '',
    claim: card.claim || '',
    data,
    figure,
    source: card.sourceTitle || '',
  };
}

function buildDoc(card) {
  const fields = fieldText(card);
  const fieldTokens = {};
  const counts = new Map();
  for (const [name, text] of Object.entries(fields)) {
    const tokens = tokenize(text);
    fieldTokens[name] = tokens;
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  }
  return {
    card,
    id: card.id,
    taskId: card.taskId,
    kind: card.kind,
    fieldTokens,
    counts,
    length: [...counts.values()].reduce((sum, value) => sum + value, 0),
    text: Object.values(fields).join(' ').toLowerCase(),
  };
}

export class CardIndex {
  constructor(cards = []) {
    this.docs = new Map();
    this.df = new Map();
    this.load(cards);
  }

  load(cards = []) {
    this.docs.clear();
    this.df.clear();
    for (const card of cards) this.#add(card);
    return this;
  }

  #add(card) {
    if (!card || !card.id) return;
    this.docs.set(card.id, buildDoc(card));
    for (const token of new Set(buildDoc(card).counts.keys())) {
      this.df.set(token, (this.df.get(token) || 0) + 1);
    }
  }

  upsert(card) {
    this.remove(card && card.id);
    this.#add(card);
    return this;
  }

  remove(cardId) {
    const id = String(cardId || '');
    if (!this.docs.has(id)) return this;
    this.docs.delete(id);
    this.#rebuildDf();
    return this;
  }

  removeSource(sourceId) {
    for (const [id, doc] of this.docs) {
      if (doc.card.sourceId === sourceId) this.docs.delete(id);
    }
    this.#rebuildDf();
    return this;
  }

  #rebuildDf() {
    this.df.clear();
    for (const doc of this.docs.values()) {
      for (const token of new Set(doc.counts.keys())) {
        this.df.set(token, (this.df.get(token) || 0) + 1);
      }
    }
  }

  search(query, { taskId, limit = 40, kinds } = {}) {
    const max = Math.max(1, Math.min(200, Number(limit) || 40));
    const wanted = new Set(Array.isArray(kinds) ? kinds : []);
    const docs = [...this.docs.values()].filter(
      (doc) => (!taskId || doc.taskId === taskId) && (!wanted.size || wanted.has(doc.kind)),
    );
    const queryText = String(query || '').trim().toLowerCase();
    const terms = [...new Set(tokenize(queryText))];
    if (!terms.length) {
      return docs
        .sort((a, b) => {
          const strength = { high: 2, medium: 1, low: 0 };
          return (strength[b.card.strength] || 0) - (strength[a.card.strength] || 0) ||
            String(b.card.updatedAt || '').localeCompare(String(a.card.updatedAt || ''));
        })
        .slice(0, max)
        .map((doc) => doc.card);
    }

    const total = docs.length || 1;
    const weights = { title: 6, theme: 5, tags: 4, claim: 3, data: 2, figure: 2, source: 1 };
    const scored = [];
    for (const doc of docs) {
      let score = 0;
      for (const term of terms) {
        const df = this.df.get(term) || 0;
        const idf = Math.log((total + 1) / (df + 1)) + 1;
        for (const [field, tokens] of Object.entries(doc.fieldTokens)) {
          let tf = 0;
          for (const token of tokens) if (token === term) tf += 1;
          if (tf) score += tf * idf * (weights[field] || 1);
        }
      }
      if (queryText && doc.text.includes(queryText)) score += 12;
      if (score > 0) {
        if (doc.card.strength === 'high') score += 1.5;
        else if (doc.card.strength === 'medium') score += 0.5;
        scored.push([score, doc]);
      }
    }
    const ranked = scored
      .sort((a, b) => b[0] - a[0] || String(b[1].card.updatedAt || '').localeCompare(String(a[1].card.updatedAt || '')))
      .map(([, doc]) => doc);
    if (ranked.length < max) {
      const picked = new Set(ranked.map((doc) => doc.id));
      const fallback = docs
        .filter((doc) => !picked.has(doc.id))
        .sort((a, b) => {
          const strength = { high: 2, medium: 1, low: 0 };
          return (strength[b.card.strength] || 0) - (strength[a.card.strength] || 0) ||
            String(b.card.updatedAt || '').localeCompare(String(a.card.updatedAt || ''));
        });
      for (const doc of fallback) {
        if (ranked.length >= max) break;
        ranked.push(doc);
      }
    }
    return ranked.slice(0, max).map((doc) => doc.card);
  }
}
