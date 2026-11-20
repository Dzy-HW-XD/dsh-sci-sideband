/**
 * Default source discovery.
 *
 * The sideband does not need a hand-written topic list: it searches a small set
 * of open-access / metadata providers from the project objective, then imports
 * the best matching records as research content. Paywalled journal records are
 * kept as metadata/abstract; full text is fetched only when the provider offers
 * an open-access link.
 */
import { asString, htmlToText, parseJsonObject, truncate } from './util.js';
import { llmComplete } from './analysis.js';

export const CHANNELS = [
  { id: 'arxiv', title: 'arXiv', access: 'open', note: '预印本 / 开放全文' },
  { id: 'openalex', title: 'OpenAlex', access: 'open', note: '开放获取与元数据' },
  { id: 'crossref', title: 'Crossref', access: 'meta', note: '期刊元数据 / 摘要' },
  { id: 'europepmc', title: 'Europe PMC', access: 'open', note: 'PubMed / PMC 全文' },
  { id: 'doaj', title: 'DOAJ', access: 'open', note: '开放获取期刊' },
  { id: 'semanticscholar', title: 'Semantic Scholar', access: 'open', note: '开放获取与引用' },
];

export const DEFAULT_CHANNEL_IDS = CHANNELS.map((channel) => channel.id);

const CHANNEL_IDS = new Set(DEFAULT_CHANNEL_IDS);

export function channelCatalog() {
  return CHANNELS;
}

export function normalizeChannels(value) {
  const list = Array.isArray(value) ? value : [];
  const ids = [...new Set(list.map((item) => String(item || '').trim()).filter((id) => CHANNEL_IDS.has(id)))];
  return ids.length ? ids : [...DEFAULT_CHANNEL_IDS];
}

function cleanText(value, max = 4000) {
  return truncate(htmlToText(String(value || '')).replace(/\s+/g, ' ').trim(), max);
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function xmlTag(block, tag) {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return match ? decodeXml(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function normalizeDoi(value) {
  const text = asString(value, 500)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
  return text || '';
}

export { normalizeDoi };

function titleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function withUrl(candidate) {
  const url = asString(candidate.url, 3000);
  if (url) return url;
  const doi = normalizeDoi(candidate.doi);
  return doi ? `https://doi.org/${doi}` : '';
}

function normalizeCandidate(raw, channel, access) {
  const title = cleanText(raw.title, 500);
  if (!title) return null;
  const doi = normalizeDoi(raw.doi);
  const candidate = {
    title,
    authors: cleanText(raw.authors, 600),
    year: raw.year == null ? '' : String(raw.year).trim(),
    venue: cleanText(raw.venue, 300),
    doi,
    url: withUrl({ url: raw.url, doi }),
    abstract: cleanText(raw.abstract, 5000),
    type: raw.type || 'paper',
    provider: channel,
    access: access || 'meta',
    externalId: asString(raw.externalId, 300),
  };
  if (!candidate.url && !candidate.doi) return null;
  return candidate;
}

async function readText(lab, url, signal) {
  const web = lab.pickService('web');
  if (web && typeof web.fetch === 'function') {
    const result = await web.fetch({ url }, signal);
    const status = Number(result && result.statusCode) || 0;
    if (status && (status < 200 || status >= 300)) throw new Error(`HTTP ${status}`);
    const body = (result && result.body) || {};
    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) throw new Error('empty response');
    return content;
  }
  if (typeof fetch !== 'function') throw new Error('no HTTP fetch available');
  const response = await fetch(url, { signal, headers: { accept: 'application/json, application/atom+xml, text/xml, */*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function readJson(lab, url, signal) {
  const text = await readText(lab, url, signal);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('response is not JSON');
  }
}

function parseArxivXml(xml, limit) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, limit);
  return entries
    .map((match) => {
      const block = match[1];
      const id = xmlTag(block, 'id');
      const published = xmlTag(block, 'published');
      const authors = [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
        .map((author) => decodeXml(author[1]).trim())
        .filter(Boolean)
        .join('; ');
      return normalizeCandidate(
        {
          title: xmlTag(block, 'title'),
          authors,
          year: published.slice(0, 4),
          venue: 'arXiv',
          doi: xmlTag(block, 'arxiv:doi'),
          url: id.replace('http://', 'https://'),
          abstract: xmlTag(block, 'summary'),
          type: 'preprint',
          externalId: id,
        },
        'arxiv',
        'open',
      );
    })
    .filter(Boolean);
}

async function searchArxiv(lab, query, limit, signal, phrases = []) {
  const base = `https://export.arxiv.org/api/query?search_query=`;
  const tail = `&start=0&max_results=${Math.max(limit * 2, 4)}&sortBy=relevance`;
  const arxivQuery = phrases.length
    ? phrases.slice(0, 3).map((phrase) => `all:"${String(phrase).replace(/"/g, '')}"`).join(' AND ')
    : `all:${query}`;
  const xml = await readText(lab, `${base}${encodeURIComponent(arxivQuery)}${tail}`, signal);
  let rows = parseArxivXml(xml, Math.max(limit * 2, 4));
  if (!rows.length && phrases.length > 1) {
    const broad = phrases.slice(0, 3).map((phrase) => `all:"${String(phrase).replace(/"/g, '')}"`).join(' OR ');
    const fallbackXml = await readText(lab, `${base}${encodeURIComponent(broad)}${tail}`, signal);
    rows = parseArxivXml(fallbackXml, Math.max(limit * 2, 4));
  }
  return rows;
}

function abstractFromInverted(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of Array.isArray(positions) ? positions : []) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}

function openAlexRowToCandidate(row, provider = 'openalex') {
  const authors = (Array.isArray(row.authorships) ? row.authorships : [])
    .map((author) => (author && author.author ? author.author.display_name : ''))
    .filter(Boolean)
    .join('; ');
  const landing = row.primary_location && row.primary_location.landing_page_url;
  const pdf = row.best_oa_location && row.best_oa_location.pdf_url;
  const openUrl = pdf || (row.open_access && row.open_access.oa_url) || landing;
  return normalizeCandidate(
    {
      title: row.title,
      authors,
      year: row.publication_year,
      venue: row.primary_location && row.primary_location.source && row.primary_location.source.display_name,
      doi: row.doi,
      url: openUrl,
      abstract: abstractFromInverted(row.abstract_inverted_index),
      externalId: row.id,
    },
    provider,
    pdf ? 'open' : 'meta',
  );
}

async function searchOpenAlex(lab, query, limit, signal) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${Math.max(limit * 2, 4)}&select=id,doi,title,publication_year,authorships,primary_location,open_access,best_oa_location,abstract_inverted_index`;
  const data = await readJson(lab, url, signal);
  return (Array.isArray(data.results) ? data.results : [])
    .map((row) => openAlexRowToCandidate(row))
    .filter(Boolean);
}

async function searchCrossref(lab, query, limit, signal) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.max(limit * 2, 4)}&select=DOI,title,author,issued,container-title,URL,abstract,link`;
  const data = await readJson(lab, url, signal);
  const rows = data && data.message && Array.isArray(data.message.items) ? data.message.items : [];
  return rows
    .map((row) => {
      const authors = (Array.isArray(row.author) ? row.author : [])
        .map((author) => [author.given, author.family].filter(Boolean).join(' '))
        .filter(Boolean)
        .join('; ');
      const year = row.issued && row.issued['date-parts'] && row.issued['date-parts'][0] ? row.issued['date-parts'][0][0] : '';
      const link = (Array.isArray(row.link) ? row.link : []).find(
        (item) => /pdf/i.test(String(item['content-type'] || '')) || /\.pdf($|\?)/i.test(String(item.URL || '')),
      );
      return normalizeCandidate(
        {
          title: Array.isArray(row.title) ? row.title[0] : row.title,
          authors,
          year,
          venue: Array.isArray(row['container-title']) ? row['container-title'][0] : row['container-title'],
          doi: row.DOI,
          url: (link && link.URL) || row.URL,
          abstract: row.abstract,
        },
        'crossref',
        link ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchEuropePmc(lab, query, limit, signal) {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${Math.max(limit * 2, 4)}&resultType=core`;
  const data = await readJson(lab, url, signal);
  const rows = data && data.resultList && Array.isArray(data.resultList.result) ? data.resultList.result : [];
  return rows
    .map((row) => {
      const doi = normalizeDoi(row.doi);
      const urlValue = row.pmcid
        ? `https://europepmc.org/article/PMC/${row.pmcid}`
        : doi
          ? `https://doi.org/${doi}`
          : `https://europepmc.org/article/${row.source || 'MED'}/${row.id || ''}`;
      const open = Boolean(row.pmcid) || row.isOpenAccess === 'Y';
      return normalizeCandidate(
        {
          title: row.title,
          authors: row.authorString,
          year: row.pubYear,
          venue: (row.journalInfo && row.journalInfo.journal && row.journalInfo.journal.title) || row.journalTitle,
          doi,
          url: urlValue,
          abstract: row.abstractText,
          externalId: row.pmcid || row.id,
        },
        'europepmc',
        open ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchDoaj(lab, query, limit, signal) {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${Math.max(limit * 2, 4)}`;
  const data = await readJson(lab, url, signal);
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .map((row) => {
      const bib = row.bibjson || {};
      const identifiers = Array.isArray(bib.identifier) ? bib.identifier : [];
      const doiRow = identifiers.find((item) => String(item.type || '').toLowerCase() === 'doi');
      const links = Array.isArray(bib.link) ? bib.link : [];
      const fulltext = links.find((item) => /fulltext/i.test(String(item.type || ''))) || links[0];
      const authors = (Array.isArray(bib.author) ? bib.author : [])
        .map((author) => (author && (author.name || author)) || '')
        .filter(Boolean)
        .join('; ');
      return normalizeCandidate(
        {
          title: bib.title,
          authors,
          year: bib.year,
          venue: bib.journal && bib.journal.title,
          doi: doiRow && doiRow.id,
          url: fulltext && fulltext.url,
          abstract: bib.abstract,
          externalId: row.id,
        },
        'doaj',
        fulltext ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchSemanticScholar(lab, query, limit, signal) {
  const fields = 'title,authors,year,venue,abstract,externalIds,openAccessPdf,url';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.max(limit * 2, 4)}&fields=${fields}`;
  const data = await readJson(lab, url, signal);
  const rows = data && Array.isArray(data.data) ? data.data : [];
  return rows
    .map((row) => {
      const authors = (Array.isArray(row.authors) ? row.authors : [])
        .map((author) => author && author.name)
        .filter(Boolean)
        .join('; ');
      const doi = normalizeDoi(row.externalIds && row.externalIds.DOI);
      const pdf = row.openAccessPdf && row.openAccessPdf.url;
      return normalizeCandidate(
        {
          title: row.title,
          authors,
          year: row.year,
          venue: row.venue,
          doi,
          url: pdf || row.url,
          abstract: row.abstract,
          externalId: row.paperId,
        },
        'semanticscholar',
        pdf ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

function arxivIdFromUrl(url) {
  const match = String(url || '').match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v\d+)?/i);
  return match ? match[1] : '';
}

async function openAlexWorkForSource(lab, source, signal) {
  const external = String(source.externalId || '');
  const workId = (external.match(/W\d+/) || [])[0];
  if (workId) return readJson(lab, `https://api.openalex.org/works/${workId}`, signal);
  if (source.doi) {
    return readJson(lab, `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(source.doi)}`, signal);
  }
  return null;
}

async function fetchOpenAlexWorksByIds(lab, ids, limit, signal) {
  const clean = ids
    .map((value) => (String(value).match(/W\d+/) || [])[0])
    .filter(Boolean)
    .slice(0, limit);
  if (!clean.length) return [];
  const filter = clean.map((id) => `openalex_id:${id}`).join('|');
  const url = `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&per-page=${clean.length}&select=id,doi,title,publication_year,authorships,primary_location,open_access,best_oa_location,abstract_inverted_index`;
  const data = await readJson(lab, url, signal);
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchOpenAlexCitedBy(lab, workId, limit, signal) {
  if (!workId) return [];
  const url = `https://api.openalex.org/works?filter=cites:${workId}&per-page=${limit}&select=id,doi,title,publication_year,authorships,primary_location,open_access,best_oa_location,abstract_inverted_index`;
  const data = await readJson(lab, url, signal);
  return Array.isArray(data.results) ? data.results : [];
}

function s2Candidate(row, source, relation) {
  const authors = (Array.isArray(row.authors) ? row.authors : [])
    .map((author) => author && author.name)
    .filter(Boolean)
    .join('; ');
  const doi = normalizeDoi(row.externalIds && row.externalIds.DOI);
  const pdf = row.openAccessPdf && row.openAccessPdf.url;
  return normalizeCandidate(
    {
      title: row.title,
      authors,
      year: row.year,
      venue: row.venue,
      doi,
      url: pdf || row.url,
      abstract: row.abstract,
      externalId: row.paperId,
    },
    'semanticscholar-citation',
    pdf ? 'open' : 'meta',
  );
}

async function semanticScholarNeighbors(lab, source, limit, signal) {
  const arxivId = arxivIdFromUrl(source.url);
  const paperId = source.doi ? `DOI:${source.doi}` : arxivId ? `ARXIV:${arxivId}` : source.externalId;
  if (!paperId) return { items: [], errors: [] };
  const fields = 'title,authors,year,venue,abstract,externalIds,openAccessPdf,url';
  const items = [];
  const errors = [];
  for (const relation of ['references', 'citations']) {
    try {
      const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(paperId)}/${relation}?fields=${fields}&limit=${Math.max(1, Math.floor(limit / 2))}`;
      const data = await readJson(lab, url, signal);
      const rows = (Array.isArray(data.data) ? data.data : [])
        .map((row) => row.citedPaper || row.citingPaper)
        .filter(Boolean);
      for (const row of rows) {
        const relationName = relation === 'references' ? 'reference' : 'citation';
        const candidate = s2Candidate(row, source, relationName);
        if (candidate) items.push({ ...candidate, relation: relationName, parentSourceId: source.id });
      }
    } catch (error) {
      errors.push({ channel: 'semanticscholar-citation', message: String((error && error.message) || error) });
    }
  }
  return { items, errors };
}

export async function findCitationNeighbors(lab, source, limit = 4) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const work = await openAlexWorkForSource(lab, source, controller.signal);
    if (work) {
      const workId = (String(work.id || '').match(/W\d+/) || [])[0];
      const refIds = Array.isArray(work.referenced_works) ? work.referenced_works.slice(0, limit) : [];
      const [refs, cites] = await Promise.all([
        fetchOpenAlexWorksByIds(lab, refIds, limit, controller.signal),
        fetchOpenAlexCitedBy(lab, workId, Math.max(1, Math.floor(limit / 2)), controller.signal),
      ]);
      const items = [];
      for (const row of refs) {
        const candidate = openAlexRowToCandidate(row, 'openalex-citation');
        if (candidate) items.push({ ...candidate, relation: 'reference', parentSourceId: source.id });
      }
      for (const row of cites) {
        const candidate = openAlexRowToCandidate(row, 'openalex-citation');
        if (candidate) items.push({ ...candidate, relation: 'citation', parentSourceId: source.id });
      }
      if (items.length) return { items, errors: [] };
    }
  } catch {
    /* fall back to Semantic Scholar */
  } finally {
    clearTimeout(timer);
  }
  return semanticScholarNeighbors(lab, source, limit, undefined);
}

const SEARCHERS = {
  arxiv: searchArxiv,
  openalex: searchOpenAlex,
  crossref: searchCrossref,
  europepmc: searchEuropePmc,
  doaj: searchDoaj,
  semanticscholar: searchSemanticScholar,
};

export function buildSearchQuery(task) {
  const objective = asString(task.objective, 500);
  const title = asString(task.title, 200);
  const field = asString(task.field, 120);
  const currentState = asString(task.currentState, 200);
  // Prefer an English objective: most default providers index English metadata.
  // A Chinese title/currentState is still useful, but mixing it into the query
  // dilutes recall, so only add it when no Latin-script objective exists.
  const hasLatinObjective = /[A-Za-z]{3,}/.test(objective);
  const parts = hasLatinObjective ? [objective, field] : [title, field];
  if (!hasLatinObjective && /[A-Za-z]{3,}/.test(currentState)) parts.push(currentState);
  return truncate(parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), 600) || 'research';
}

const STOPWORDS = new Set([
  'about', 'after', 'also', 'among', 'analysis', 'and', 'are', 'based', 'been', 'between', 'both',
  'can', 'could', 'does', 'during', 'each', 'evidence', 'find', 'for', 'from', 'has', 'have', 'how',
  'into', 'its', 'more', 'most', 'not', 'our', 'over', 'recent', 'research', 'should', 'show', 'study',
  'such', 'than', 'that', 'their', 'these', 'they', 'this', 'through', 'under', 'using', 'was', 'were',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'effects', 'effect',
]);

function fallbackPhrases(raw) {
  const words = String(raw || '').match(/[A-Za-z][A-Za-z0-9-]{3,}/g) || [];
  const unique = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (!unique.some((value) => value.toLowerCase() === lower)) unique.push(word);
    if (unique.length >= 4) break;
  }
  return unique;
}

export async function resolveSearchQuery(lab, task) {
  const raw = buildSearchQuery(task);
  const text = [task.objective, task.title, task.currentState].map((value) => asString(value, 2000)).join(' ');
  const hasHan = /\p{Script=Han}/u.test(text);
  let phrases = [];
  let expanded = false;

  try {
    const result = await llmComplete(lab, {
      system:
        'You turn a research interest into 2-4 short English search phrases that a paper title or abstract would contain. Use AND semantics across phrases. Return only JSON: {"phrases":["...","..."]}. No boolean operators, quotes, or explanation.',
      prompt: `Research interest: ${asString(task.objective, 1500)}\nTitle: ${asString(task.title, 300)}\nCurrent results: ${asString(task.currentState, 1000)}\nField: ${asString(task.field, 200)}\n\nReturn 2-4 English phrases. If the interest is already English, keep its key noun phrases.`,
      maxTokens: 700,
      timeoutMs: 30000,
    });
    const parsed = parseJsonObject(result.text);
    const rows = parsed && Array.isArray(parsed.phrases) ? parsed.phrases : [];
    phrases = rows
      .map((value) => cleanText(value, 80))
      .filter((value) => /[A-Za-z]{3,}/.test(value))
      .slice(0, 4);
    if (phrases.length) expanded = true;
  } catch {
    /* fall through to the raw query */
  }

  if (!phrases.length) phrases = fallbackPhrases(raw);
  return {
    query: phrases.length ? phrases.join(' ') : raw,
    phrases,
    expanded,
    hasHan,
  };
}

const QUERY_STOPWORDS = new Set([
  ...STOPWORDS,
  'analysis', 'approach', 'based', 'large', 'language', 'long', 'method', 'methods', 'model', 'models',
  'novel', 'open', 'access', 'paper', 'papers', 'result', 'results', 'sensitivity', 'short', 'study',
  'using', 'with', 'without',
]);

function queryTerms(task, phrases) {
  const text = [task.objective, task.title, task.field]
    .concat(Array.isArray(phrases) ? phrases : [])
    .map((value) => asString(value, 2000))
    .join(' ');
  const unique = [];
  for (const word of text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || []) {
    const lower = word.toLowerCase();
    if (QUERY_STOPWORDS.has(lower)) continue;
    if (!unique.some((value) => value.toLowerCase() === lower)) unique.push(word);
    if (unique.length >= 12) break;
  }
  return unique;
}

export function similarityScore(candidate, task, phrases = []) {
  const terms = queryTerms(task, phrases);
  const title = String(candidate.title || '').toLowerCase();
  const haystack = `${title} ${String(candidate.abstract || '').toLowerCase()}`;
  const tokenHits = terms.filter((term) => haystack.includes(term.toLowerCase())).length;
  const titleHits = terms.filter((term) => title.includes(term.toLowerCase())).length;
  const phraseHits = (Array.isArray(phrases) ? phrases : []).filter((phrase) =>
    haystack.includes(String(phrase).toLowerCase()),
  ).length;
  const tokenScore = terms.length ? tokenHits / terms.length : 0;
  const titleScore = terms.length ? titleHits / terms.length : 0;
  const phraseScore = Array.isArray(phrases) && phrases.length ? phraseHits / phrases.length : 0;
  return Math.round((0.5 * tokenScore + 0.3 * phraseScore + 0.2 * titleScore) * 1000) / 1000;
}

export async function discoverSources(lab, task, channelIds, perProvider = 20, minSimilarity = 0.3) {
  const channels = normalizeChannels(channelIds);
  const count = Math.max(1, Math.min(50, Number(perProvider) || 20));
  const threshold = Math.max(0.05, Math.min(0.9, Number(minSimilarity) || 0.3));
  const { query, phrases, expanded, hasHan } = await resolveSearchQuery(lab, task);
  const items = [];
  const errors = [];
  const providerStats = [];

  await Promise.all(
    channels.map(async (channel) => {
      const searcher = SEARCHERS[channel];
      if (!searcher) return;
      const stat = { channel, candidates: 0, accepted: 0, error: null };
      providerStats.push(stat);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        try {
          const rows = await searcher(lab, query, count, controller.signal, phrases);
          stat.candidates = rows.length;
          for (const row of rows) {
            const similarity = similarityScore(row, task, phrases);
            if (similarity >= threshold) {
              stat.accepted += 1;
              items.push({ ...row, provider: channel, similarity });
            }
          }
          break;
        } catch (error) {
          const message = String((error && error.message) || error || 'unknown error');
          if (attempt === 0 && /429|rate limit|too many requests/i.test(message)) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          stat.error = message;
          errors.push({ channel, message });
          break;
        } finally {
          clearTimeout(timer);
        }
      }
    }),
  );

  const seen = new Set();
  const unique = [];
  for (const item of items.sort((a, b) => b.similarity - a.similarity)) {
    const keys = candidateKeys(item);
    if (!keys.length || keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    unique.push(item);
  }
  return {
    query,
    phrases,
    expanded,
    hasHan,
    channels,
    minSimilarity: threshold,
    providerStats,
    items: unique.slice(0, 120),
    errors,
  };
}

export function candidateKey(candidate) {
  return candidate && candidate.doi ? `doi:${candidate.doi.toLowerCase()}` : `title:${titleKey(candidate && candidate.title)}`;
}

export function candidateKeys(candidate) {
  if (!candidate) return [];
  const keys = [];
  if (candidate.doi) keys.push(`doi:${String(candidate.doi).toLowerCase()}`);
  const title = titleKey(candidate.title);
  if (title) keys.push(`title:${title}`);
  return keys;
}

export function sourceKey(source) {
  return source && source.doi ? `doi:${String(source.doi).toLowerCase()}` : `title:${titleKey(source && source.title)}`;
}
