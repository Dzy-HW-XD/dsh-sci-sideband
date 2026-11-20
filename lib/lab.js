import path from 'node:path';
import { Store, defaultDataDir } from './store.js';
import {
  analyzeSource,
  composeReport,
  composeSuggestions,
  fetchSourceContent,
  llmStatus,
} from './analysis.js';
import {
  DEFAULT_CHANNEL_IDS,
  candidateKey,
  candidateKeys,
  channelCatalog,
  discoverSources,
  findCitationNeighbors,
  normalizeChannels,
  normalizeDoi,
  sourceKey,
} from './discovery.js';
import {
  asString,
  newId,
  normalizeConfidence,
  nowIso,
  oneOf,
  truncate,
} from './util.js';

const SOURCE_TYPES = ['paper', 'preprint', 'report', 'dataset', 'project', 'patent', 'blog', 'other'];
const TASK_STATUS = ['active', 'paused', 'done'];
const TOPIC_STATUS = ['open', 'focus', 'done'];
const JOB_ERRORS_MAX = 30;

function errorMessage(error) {
  return String((error && error.message) || error || '未知错误');
}

const CITATION_STOPWORDS = new Set([
  'about', 'after', 'also', 'among', 'analysis', 'and', 'are', 'based', 'been', 'between', 'both',
  'can', 'could', 'does', 'during', 'each', 'evidence', 'find', 'for', 'from', 'has', 'have', 'how',
  'into', 'its', 'large', 'language', 'more', 'most', 'not', 'our', 'over', 'recent', 'research',
  'sensitivity', 'should', 'show', 'study', 'such', 'than', 'that', 'their', 'these', 'they', 'this',
  'through', 'under', 'using', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'with',
  'would', 'model', 'models', 'effect', 'effects',
]);

function citationTerms(task, phrases) {
  const text = [task.objective, task.title, task.field]
    .concat(Array.isArray(phrases) ? phrases : [])
    .map((value) => asString(value, 2000))
    .join(' ');
  const terms = [];
  for (const word of text.match(/[A-Za-z][A-Za-z0-9-]{3,}/g) || []) {
    const lower = word.toLowerCase();
    if (CITATION_STOPWORDS.has(lower)) continue;
    if (!terms.some((value) => value.toLowerCase() === lower)) terms.push(word);
  }
  return terms.slice(0, 8);
}

function citationRelevant(item, task, phrases) {
  const terms = citationTerms(task, phrases);
  if (!terms.length) return true;
  const haystack = `${item.title || ''} ${item.abstract || ''}`.toLowerCase();
  const hits = terms.filter((term) => haystack.includes(term.toLowerCase())).length;
  return hits >= (terms.length >= 3 ? 2 : 1);
}

function fail(code, message, details) {
  return { ok: false, error: { code, message, details: details || {} } };
}

export class ResearchLab {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.config = config && typeof config === 'object' ? config : {};
    this.dir = this.config.dataDir ? path.resolve(String(this.config.dataDir)) : defaultDataDir();
    this.store = new Store(this.dir);
    this.readyPromise = null;
    this.looping = new Set();
    this.reporting = new Set();
    this.suggesting = new Set();
    this.discovering = new Set();
    this.deepening = new Set();
    this.pending = new Set();
  }

  pickService(name) {
    const ctx = this.ctx;
    if (!ctx) return undefined;
    try {
      if (typeof ctx.get === 'function') {
        const value = ctx.get(name);
        if (value) return value;
      }
      if (ctx[name]) return ctx[name];
    } catch {
      /* service absent or not ready */
    }
    return undefined;
  }

  async ready() {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        await this.store.init();
        await this.#recoverJobs();
      })();
    }
    return this.readyPromise;
  }

  async #recoverJobs() {
    const state = this.store.getState();
    const stale = Object.entries(state.jobs || {}).filter(([, job]) => job && job.status === 'running');
    if (!stale.length) return;
    await this.store.update((draft) => {
      for (const [taskId] of stale) {
        const job = draft.jobs[taskId];
        if (!job || job.status !== 'running') continue;
        job.status = 'interrupted';
        job.current = null;
        job.finishedAt = nowIso();
        job.note = '上次运行在 Harness 关闭时中断，可重新开始探索。';
      }
    });
  }

  state() {
    return this.store.getState();
  }

  #task(state, taskId) {
    const id = asString(taskId, 80);
    const task = state.tasks.find((row) => row.id === id);
    if (!task) throw new Error('找不到这个科研任务（可能已被删除）。');
    return task;
  }

  #source(state, sourceId) {
    const id = asString(sourceId, 80);
    const source = state.sources.find((row) => row.id === id);
    if (!source) throw new Error('找不到这条科研内容（可能已被删除）。');
    return source;
  }

  #counts(state, taskId) {
    const sources = state.sources.filter((row) => row.taskId === taskId);
    return {
      topics: state.topics.filter((row) => row.taskId === taskId).length,
      sources: sources.length,
      analyzed: sources.filter((row) => row.status === 'analyzed').length,
      withAnalysis: sources.filter((row) => row.analysis).length,
      pending: sources.filter((row) => row.status !== 'analyzed').length,
      extractions: state.extractions.filter((row) => row.taskId === taskId).length,
      reports: state.reports.filter((row) => row.taskId === taskId).length,
      suggestions: (state.suggestions || []).filter((row) => row.taskId === taskId).length,
    };
  }

  #touch(draft, taskId) {
    const task = draft.tasks.find((row) => row.id === taskId);
    if (task) task.updatedAt = nowIso();
  }

  #quickLlm() {
    try {
      const defaults = this.pickService('agentDefaultModel');
      const selection = defaults && typeof defaults.currentSelection === 'function' ? defaults.currentSelection() : null;
      if (selection && selection.provider && selection.model) {
        return { available: true, provider: selection.provider, model: selection.model, source: 'default' };
      }
    } catch {
      /* the explicit llm.status action reports the real reason */
    }
    return { available: false, provider: null, model: null, reason: '模型可用性将在调用时解析' };
  }

  publicState() {
    const state = this.store.getState();
    const tasks = state.tasks
      .map((task) => ({ ...task, counts: this.#counts(state, task.id), job: state.jobs[task.id] || null }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const sources = state.sources
      .map((source) => {
        const { content, ...rest } = source;
        return { ...rest, contentChars: typeof content === 'string' ? content.length : 0 };
      })
      .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
    const reports = state.reports
      .map(({ markdown, ...rest }) => rest)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const suggestions = (state.suggestions || [])
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return {
      dataDir: this.dir,
      llm: this.#quickLlm(),
      tasks,
      topics: state.topics,
      sources,
      extractions: state.extractions,
      reports,
      suggestions,
      jobs: state.jobs,
      stats: {
        tasks: state.tasks.length,
        topics: state.topics.length,
        sources: state.sources.length,
        analyzed: state.sources.filter((row) => row.status === 'analyzed').length,
        extractions: state.extractions.length,
        reports: state.reports.length,
        suggestions: (state.suggestions || []).length,
      },
    };
  }

  async handle(payload) {
    try {
      const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      const action = asString(body.action, 120);
      const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {};
      const value = await this.run(action, args);
      return { ok: true, value };
    } catch (error) {
      return fail(error && error.code ? error.code : 'action-failed', errorMessage(error));
    }
  }

  async run(action, args = {}) {
    await this.ready();
    switch (action) {
      case 'state.get':
        return this.publicState();
      case 'llm.status':
        return llmStatus(this);
      case 'task.list':
        return this.publicState().tasks;
      case 'task.create':
        return this.createTask(args);
      case 'task.update':
        return this.updateTask(args);
      case 'task.delete':
        return this.deleteTask(args);
      case 'channels.list':
        return { channels: channelCatalog(), defaults: DEFAULT_CHANNEL_IDS };
      case 'topic.list':
        return this.listTopics(args);
      case 'topic.create':
        return this.createTopic(args);
      case 'topic.update':
        return this.updateTopic(args);
      case 'topic.delete':
        return this.deleteTopic(args);
      case 'source.list':
        return this.publicState().sources.filter((row) => !args.taskId || row.taskId === args.taskId);
      case 'source.create':
        return this.createSource(args);
      case 'source.discover':
        return this.discoverTaskSources(args);
      case 'source.deepen':
        return this.deepenTaskSources(args);
      case 'source.refresh':
        return this.refreshSource(args);
      case 'source.delete':
        return this.deleteSource(args);
      case 'explore.start':
        return this.startExplore(args);
      case 'explore.status':
        return this.exploreStatus(args);
      case 'extraction.list':
        return this.listExtractions(args);
      case 'extraction.add':
        return this.addExtraction(args);
      case 'extraction.update':
        return this.updateExtraction(args);
      case 'extraction.delete':
        return this.deleteExtraction(args);
      case 'report.list':
        return this.publicState().reports.filter((row) => !args.taskId || row.taskId === args.taskId);
      case 'report.compose':
        return this.createReport(args);
      case 'report.get':
        return this.getReport(args);
      case 'report.delete':
        return this.deleteReport(args);
      case 'suggestion.list':
        return this.listSuggestions(args);
      case 'suggestion.generate':
        return this.createSuggestions(args);
      case 'suggestion.delete':
        return this.deleteSuggestion(args);
      default:
        throw new Error(`未知动作：${action || '(空)'}`);
    }
  }

  async createTask(args) {
    const title = asString(args.title, 300);
    if (!title) throw new Error('科研项目需要一个标题。');
    const objective = asString(args.objective, 12000);
    if (objective.length < 8) throw new Error('请填写研究兴趣/目的（至少 8 个字符），自动发现和分析都依赖它。');
    const task = {
      id: newId('task'),
      title,
      objective,
      currentState: asString(args.currentState, 12000),
      field: asString(args.field, 200),
      experimentBrief: asString(args.experimentBrief, 4000),
      status: oneOf(args.status, TASK_STATUS, 'active'),
      channels: normalizeChannels(args.channels),
      discovery: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.store.update((state) => {
      state.tasks.push(task);
    });
    return { ...task, counts: this.#counts(this.store.getState(), task.id), job: null };
  }

  async updateTask(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId || args.id);
    const patch = {};
    if (args.title !== undefined) {
      const title = asString(args.title, 300);
      if (!title) throw new Error('标题不能为空。');
      patch.title = title;
    }
    if (args.objective !== undefined) patch.objective = asString(args.objective, 12000);
    if (args.currentState !== undefined) patch.currentState = asString(args.currentState, 12000);
    if (args.field !== undefined) patch.field = asString(args.field, 200);
    if (args.experimentBrief !== undefined) patch.experimentBrief = asString(args.experimentBrief, 4000);
    if (args.channels !== undefined) patch.channels = normalizeChannels(args.channels);
    if (args.status !== undefined) patch.status = oneOf(args.status, TASK_STATUS, task.status);
    await this.store.update((draft) => {
      const row = draft.tasks.find((item) => item.id === task.id);
      Object.assign(row, patch, { updatedAt: nowIso() });
    });
    return this.publicState().tasks.find((row) => row.id === task.id);
  }

  async deleteTask(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId || args.id);
    await this.store.update((draft) => {
      draft.tasks = draft.tasks.filter((row) => row.id !== task.id);
      draft.topics = draft.topics.filter((row) => row.taskId !== task.id);
      draft.sources = draft.sources.filter((row) => row.taskId !== task.id);
      draft.extractions = draft.extractions.filter((row) => row.taskId !== task.id);
      draft.reports = draft.reports.filter((row) => row.taskId !== task.id);
      draft.suggestions = (draft.suggestions || []).filter((row) => row.taskId !== task.id);
      delete draft.jobs[task.id];
    });
    return { deleted: true, taskId: task.id };
  }

  listTopics(args) {
    const taskId = asString(args.taskId, 80);
    return this.state().topics.filter((row) => !taskId || row.taskId === taskId);
  }

  async createTopic(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    const title = asString(args.title, 300);
    if (!title) throw new Error('题目需要一个标题。');
    const topic = {
      id: newId('topic'),
      taskId: task.id,
      title,
      question: asString(args.question, 4000),
      status: oneOf(args.status, TOPIC_STATUS, 'open'),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.store.update((draft) => {
      draft.topics.push(topic);
      this.#touch(draft, task.id);
    });
    return topic;
  }

  async updateTopic(args) {
    const state = this.state();
    const topic = state.topics.find((row) => row.id === asString(args.topicId || args.id, 80));
    if (!topic) throw new Error('找不到这个题目。');
    const patch = {};
    if (args.title !== undefined) {
      const title = asString(args.title, 300);
      if (!title) throw new Error('题目标题不能为空。');
      patch.title = title;
    }
    if (args.question !== undefined) patch.question = asString(args.question, 4000);
    if (args.status !== undefined) patch.status = oneOf(args.status, TOPIC_STATUS, topic.status);
    await this.store.update((draft) => {
      const row = draft.topics.find((item) => item.id === topic.id);
      Object.assign(row, patch, { updatedAt: nowIso() });
      this.#touch(draft, topic.taskId);
    });
    return this.publicState().topics.find((row) => row.id === topic.id);
  }

  async deleteTopic(args) {
    const state = this.state();
    const topic = state.topics.find((row) => row.id === asString(args.topicId || args.id, 80));
    if (!topic) throw new Error('找不到这个题目。');
    await this.store.update((draft) => {
      draft.topics = draft.topics.filter((row) => row.id !== topic.id);
      this.#touch(draft, topic.taskId);
    });
    return { deleted: true, topicId: topic.id };
  }

  async createSource(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    const rawText = asString(args.rawText || args.text, 600000);
    const url = asString(args.url, 3000);
    const doi = normalizeDoi(args.doi);
    if (!rawText && !url && !doi) throw new Error('科研内容至少要有 URL、DOI 或粘贴的全文。');
    const title =
      asString(args.title, 500) ||
      (rawText ? truncate(rawText.split(/\r?\n/).find((line) => line.trim()) || '未命名科研内容', 160) : '') ||
      doi ||
      url;
    const source = {
      id: newId('src'),
      taskId: task.id,
      type: oneOf(args.type, SOURCE_TYPES, 'paper'),
      title,
      url,
      doi,
      authors: asString(args.authors, 600),
      year: asString(args.year, 20),
      venue: asString(args.venue, 400),
      abstract: asString(args.abstract, 12000),
      content: rawText ? truncate(rawText, 600000) : '',
      status: rawText ? 'ready' : 'new',
      contentChars: rawText ? Math.min(rawText.length, 600000) : 0,
      queued: Boolean(args.autoExplore),
      provider: 'manual',
      access: rawText ? 'open' : 'unknown',
      externalId: '',
      analysis: null,
      error: null,
      addedAt: nowIso(),
      fetchedAt: rawText ? nowIso() : null,
      analyzedAt: null,
    };
    const duplicate = state.sources.find(
      (row) => row.taskId === task.id && sourceKey(row) === sourceKey(source),
    );
    if (duplicate) throw new Error('这条科研内容已经在项目中（DOI 或标题重复）。');
    await this.store.update((draft) => {
      draft.sources.push(source);
      this.#touch(draft, task.id);
    });
    let job = null;
    if (args.autoExplore) {
      job = await this.startExplore({ taskId: task.id, sourceIds: [source.id] });
    }
    const { content, ...rest } = source;
    return { ...rest, contentChars: content.length, job };
  }

  async discoverTaskSources(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    if (asString(task.objective, 12000).length < 8) {
      throw new Error('请先填写研究兴趣/目的（至少 8 个字符），再自动发现来源。');
    }
    if (this.discovering.has(task.id)) {
      throw new Error('这个项目正在发现来源，请等当前检索结束。');
    }
    this.discovering.add(task.id);
    try {
      return await this.#discoverTaskSourcesInner(task, args);
    } finally {
      this.discovering.delete(task.id);
    }
  }

  async #discoverTaskSourcesInner(task, args) {
    const state = this.state();
    const channels = normalizeChannels(args.channels || task.channels);
    const perProvider = Math.max(1, Math.min(50, Number(args.perProvider) || 20));
    const minSimilarity = Math.max(0.05, Math.min(0.9, Number(args.minSimilarity) || 0.3));
    const autoAnalyze = args.autoAnalyze !== false;
    const existing = state.sources.filter((row) => row.taskId === task.id);
    const existingKeys = new Set();
    for (const row of existing) {
      for (const key of candidateKeys(row)) existingKeys.add(key);
    }
    const result = await discoverSources(this, task, channels, perProvider, minSimilarity);
    const added = [];
    let skipped = 0;

    for (const item of result.items) {
      const keys = candidateKeys(item);
      if (!keys.length || keys.some((key) => existingKeys.has(key))) {
        skipped += 1;
        continue;
      }
      // A metadata-only record with no abstract and no open link would be added
      // only to fail analysis; skip it instead of polluting the content list.
      if (!item.abstract && (item.provider === 'crossref' || item.access !== 'open')) {
        skipped += 1;
        continue;
      }
      for (const key of keys) existingKeys.add(key);
      added.push({
        id: newId('src'),
        taskId: task.id,
        type: oneOf(item.type, SOURCE_TYPES, 'paper'),
        title: asString(item.title, 500),
        url: asString(item.url, 3000),
        doi: asString(item.doi, 300),
        authors: asString(item.authors, 600),
        year: asString(item.year, 20),
        venue: asString(item.venue, 400),
        abstract: asString(item.abstract, 12000),
        content: '',
        contentChars: 0,
        status: 'new',
        queued: autoAnalyze,
        provider: item.provider,
        access: item.access || 'meta',
        similarity: item.similarity || 0,
        externalId: item.externalId || '',
        analysis: null,
        error: null,
        addedAt: nowIso(),
        discoveredAt: nowIso(),
        fetchedAt: null,
        analyzedAt: null,
      });
    }

    const discovery = {
      at: nowIso(),
      query: result.query,
      queryExpanded: Boolean(result.expanded),
      phrases: result.phrases || [],
      channels: result.channels,
      minSimilarity: result.minSimilarity,
      providerStats: result.providerStats || [],
      added: added.length,
      skipped,
      errors: result.errors.slice(0, 8),
    };
    await this.store.update((draft) => {
      const row = draft.tasks.find((item) => item.id === task.id);
      if (!row) throw new Error('任务在发现过程中被删除。');
      row.channels = channels;
      row.discovery = discovery;
      draft.sources.push(...added);
      this.#touch(draft, task.id);
    });

    let job = null;
    if (autoAnalyze && added.length) {
      job = await this.startExplore({ taskId: task.id, sourceIds: added.map((row) => row.id) });
    }
    return {
      ...discovery,
      autoAnalyze,
      sources: added.map(({ content, ...rest }) => rest),
      job,
    };
  }

  async deepenTaskSources(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    if (asString(task.objective, 12000).length < 8) {
      throw new Error('请先填写研究兴趣/目的，再按引用深入探索。');
    }
    if (this.deepening.has(task.id)) throw new Error('这个项目正在做引用探索，请稍候。');
    this.deepening.add(task.id);
    try {
      const perSource = Math.max(1, Math.min(8, Number(args.perSource) || 4));
      const maxTotal = Math.max(1, Math.min(24, Number(args.maxTotal) || 12));
      const autoAnalyze = args.autoAnalyze !== false;
      const phrases = Array.isArray(task.discovery && task.discovery.phrases)
        ? task.discovery.phrases
        : [];
      const wanted = Array.isArray(args.sourceIds)
        ? new Set(args.sourceIds.map((value) => String(value)))
        : null;
      const targets = state.sources
        .filter((row) => row.taskId === task.id && row.analysis)
        .filter((row) => !wanted || wanted.has(row.id))
        .filter((row) => (row.depth || 0) < 3)
        .slice(0, 6);
      if (!targets.length) {
        throw new Error('先完成至少一条内容的分析，再按它的参考文献/引用做深度探索。');
      }

      const existingKeys = new Set(
        state.sources.filter((row) => row.taskId === task.id).map((row) => sourceKey(row)),
      );
      const added = [];
      const errors = [];
      for (const target of targets) {
        if (added.length >= maxTotal) break;
        try {
          const result = await findCitationNeighbors(this, target, perSource);
          errors.push(...(result.errors || []));
          for (const item of result.items) {
            if (added.length >= maxTotal) break;
            const key = candidateKey(item);
            if (!key || existingKeys.has(key)) continue;
            if (!item.abstract && item.access !== 'open') continue;
            if (!citationRelevant(item, task, phrases)) continue;
            existingKeys.add(key);
            added.push({
              id: newId('src'),
              taskId: task.id,
              type: oneOf(item.type, SOURCE_TYPES, 'paper'),
              title: asString(item.title, 500),
              url: asString(item.url, 3000),
              doi: asString(item.doi, 300),
              authors: asString(item.authors, 600),
              year: asString(item.year, 20),
              venue: asString(item.venue, 400),
              abstract: asString(item.abstract, 12000),
              content: '',
              contentChars: 0,
              status: 'new',
              queued: autoAnalyze,
              provider: item.provider,
              access: item.access || 'meta',
              externalId: item.externalId || '',
              relation: item.relation || 'citation',
              parentSourceId: target.id,
              depth: (target.depth || 0) + 1,
              analysis: null,
              error: null,
              addedAt: nowIso(),
              discoveredAt: nowIso(),
              fetchedAt: null,
              analyzedAt: null,
            });
          }
        } catch (error) {
          errors.push({ channel: 'citation', message: errorMessage(error) });
        }
      }

      const summary = {
        at: nowIso(),
        targets: targets.map((row) => ({ id: row.id, title: row.title })),
        added: added.length,
        errors: errors.slice(0, 8),
      };
      await this.store.update((draft) => {
        const row = draft.tasks.find((item) => item.id === task.id);
        if (!row) throw new Error('任务在引用探索过程中被删除。');
        row.deepening = summary;
        draft.sources.push(...added);
        this.#touch(draft, task.id);
      });
      let job = null;
      if (autoAnalyze && added.length) {
        job = await this.startExplore({ taskId: task.id, sourceIds: added.map((row) => row.id) });
      }
      return {
        ...summary,
        autoAnalyze,
        sources: added.map(({ content, ...rest }) => rest),
        job,
      };
    } finally {
      this.deepening.delete(task.id);
    }
  }

  async refreshSource(args) {
    const state = this.state();
    const source = this.#source(state, args.sourceId || args.id);
    await this.store.update((draft) => {
      const row = draft.sources.find((item) => item.id === source.id);
      row.status = 'fetching';
      row.error = null;
      this.#touch(draft, source.taskId);
    });
    try {
      const fetched = await fetchSourceContent(this, source);
      await this.store.update((draft) => {
        const row = draft.sources.find((item) => item.id === source.id);
        row.content = truncate(fetched.content, 600000);
        row.contentChars = row.content.length;
        row.url = row.url || fetched.url;
        row.status = 'ready';
        row.fetchedAt = nowIso();
        row.error = null;
        this.#touch(draft, source.taskId);
      });
    } catch (error) {
      await this.store.update((draft) => {
        const row = draft.sources.find((item) => item.id === source.id);
        row.status = 'failed';
        row.error = errorMessage(error);
        this.#touch(draft, source.taskId);
      });
      throw error;
    }
    const { content, ...rest } = this.#source(this.state(), source.id);
    return { ...rest, contentChars: content.length };
  }

  async deleteSource(args) {
    const state = this.state();
    const source = this.#source(state, args.sourceId || args.id);
    await this.store.update((draft) => {
      draft.sources = draft.sources.filter((row) => row.id !== source.id);
      draft.extractions = draft.extractions.filter((row) => row.sourceId !== source.id);
      this.#touch(draft, source.taskId);
    });
    return { deleted: true, sourceId: source.id };
  }

  exploreStatus(args) {
    const state = this.state();
    const taskId = asString(args.taskId, 80);
    if (taskId) return state.jobs[taskId] || { status: 'idle', total: 0, done: 0, current: null };
    return state.jobs;
  }

  async startExplore(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    const requested = Array.isArray(args.sourceIds) ? args.sourceIds.map((id) => asString(id, 80)).filter(Boolean) : [];
    const running = state.jobs[task.id];
    if (running && running.status === 'running') {
      // Queue only what this request actually asked for. The active loop scans
      // `queued` sources, so an explicitly saved source is never pulled in and a
      // historical failure is not retried behind the user's back.
      const queue = state.sources.filter((source) => {
        if (source.taskId !== task.id) return false;
        if (requested.length) return requested.includes(source.id);
        return source.status !== 'analyzed';
      });
      if (queue.length) {
        const ids = new Set(queue.map((source) => source.id));
        await this.store.update((draft) => {
          for (const row of draft.sources) {
            if (ids.has(row.id)) row.queued = true;
          }
          this.#touch(draft, task.id);
        });
      }
      this.pending.add(task.id);
      return running;
    }

    const candidates = state.sources.filter((source) => {
      if (source.taskId !== task.id) return false;
      if (requested.length) return requested.includes(source.id);
      return source.status !== 'analyzed';
    });
    if (!candidates.length) {
      return {
        status: 'idle',
        taskId: task.id,
        total: 0,
        done: 0,
        current: null,
        message: requested.length ? '选中的科研内容都已经分析过。' : '没有待分析的科研内容。',
      };
    }

    const queuedIds = new Set(candidates.map((source) => source.id));
    const job = {
      status: 'running',
      taskId: task.id,
      total: candidates.length,
      done: 0,
      current: null,
      currentTitle: null,
      startedAt: nowIso(),
      finishedAt: null,
      errors: [],
    };
    await this.store.update((draft) => {
      draft.jobs[task.id] = job;
      for (const row of draft.sources) {
        if (queuedIds.has(row.id)) row.queued = true;
      }
      this.#touch(draft, task.id);
    });
    void this.#exploreLoop(task.id, candidates.map((source) => source.id));
    return job;
  }

  async #exploreLoop(taskId, sourceIds) {
    this.looping.add(taskId);
    const processed = new Set();
    const queue = [];
    for (const sourceId of sourceIds) {
      processed.add(sourceId);
      queue.push(sourceId);
    }
    try {
      while (queue.length) {
        const sourceId = queue.shift();
        const state = this.state();
        const task = state.tasks.find((row) => row.id === taskId);
        if (!task) break;
        const source = state.sources.find((row) => row.id === sourceId);
        if (!source) {
          await this.#bumpJob(taskId, null, '这条科研内容已被删除。');
          continue;
        }
        await this.store.update((draft) => {
          const job = draft.jobs[taskId];
          if (job && job.status === 'running') {
            job.current = source.id;
            job.currentTitle = source.title;
          }
          const row = draft.sources.find((item) => item.id === source.id);
          if (row) row.queued = false;
        });

        try {
          const content = source.content || '';
          await this.store.update((draft) => {
            const row = draft.sources.find((item) => item.id === source.id);
            if (row) {
              row.status = 'analyzing';
              row.error = null;
            }
            this.#touch(draft, taskId);
          });

          const latestState = this.state();
          const latestTask = latestState.tasks.find((row) => row.id === taskId);
          const latestSource = latestState.sources.find((row) => row.id === source.id);
          const topics = latestState.topics.filter((row) => row.taskId === taskId);
          if (!latestTask || !latestSource) throw new Error('任务或科研内容在分析过程中被删除。');
          const result = await analyzeSource(this, latestTask, topics, { ...latestSource, content });

          await this.store.update((draft) => {
            const row = draft.sources.find((item) => item.id === source.id);
            if (!row) return;
            row.content = truncate(result.content || row.content || '', 600000);
            row.contentChars = row.content.length;
            row.status = 'analyzed';
            row.analysis = result.analysis;
            row.analyzedAt = result.analysis.analyzedAt;
            row.error = null;
            draft.extractions = draft.extractions.filter(
              (item) => !(item.sourceId === source.id && item.auto === true && item.edited !== true),
            );
            const editedLabels = new Set(
              draft.extractions
                .filter((item) => item.sourceId === source.id && item.edited === true)
                .map((item) => item.label),
            );
            for (const point of result.analysis.dataPoints || []) {
              const label = point.label || '观测指标';
              if (editedLabels.has(label)) continue;
              draft.extractions.push({
                id: newId('ext'),
                taskId,
                sourceId: source.id,
                kind: 'metric',
                label,
                value: point.value || '',
                unit: point.unit || '',
                context: point.context || '',
                quote: '',
                confidence: normalizeConfidence(point.confidence),
                auto: true,
                mode: result.mode,
                createdAt: nowIso(),
              });
            }
            for (const finding of result.analysis.findings || []) {
              const label = finding.claim || '可引用结论';
              if (editedLabels.has(label)) continue;
              draft.extractions.push({
                id: newId('ext'),
                taskId,
                sourceId: source.id,
                kind: 'finding',
                label,
                value: '',
                unit: '',
                context: finding.evidence || '',
                quote: finding.quote || '',
                confidence: 'medium',
                auto: true,
                mode: result.mode,
                createdAt: nowIso(),
              });
            }
            const job = draft.jobs[taskId];
            if (job) {
              job.done = (job.done || 0) + 1;
              job.mode = result.mode;
            }
            this.#touch(draft, taskId);
          });
        } catch (error) {
          await this.store.update((draft) => {
            const row = draft.sources.find((item) => item.id === source.id);
            if (row) {
              row.status = 'failed';
              row.error = errorMessage(error);
            }
            const job = draft.jobs[taskId];
            if (job) {
              job.done = (job.done || 0) + 1;
              if (job.errors.length < JOB_ERRORS_MAX) {
                job.errors.push({ sourceId, title: source.title, message: errorMessage(error) });
              }
            }
            this.#touch(draft, taskId);
          });
        }

        // A source can be added while this job is running; pick it up instead of
        // leaving it pending behind a job that looks busy.
        const fresh = this.state().sources.filter(
          (row) => row.taskId === taskId && row.queued === true && !processed.has(row.id),
        );
        for (const row of fresh) {
          processed.add(row.id);
          queue.push(row.id);
          await this.store.update((draft) => {
            const job = draft.jobs[taskId];
            if (job && job.status === 'running') job.total = (job.total || 0) + 1;
          });
        }
      }
    } finally {
      await this.store.update((draft) => {
        const job = draft.jobs[taskId];
        if (job && job.status === 'running') {
          job.status = job.errors.length && job.done === 0 ? 'failed' : 'done';
          job.current = null;
          job.currentTitle = null;
          job.finishedAt = nowIso();
        }
      });
      this.looping.delete(taskId);
      const restart = this.pending.delete(taskId);
      if (restart) {
        const queuedIds = this.state()
          .sources.filter((row) => row.taskId === taskId && row.queued === true)
          .map((row) => row.id);
        if (queuedIds.length) {
          try {
            await this.startExplore({ taskId, sourceIds: queuedIds });
          } catch {
            /* the next user action reports any remaining failure */
          }
        }
      }
    }
  }

  async #bumpJob(taskId, sourceId, message) {
    await this.store.update((draft) => {
      const job = draft.jobs[taskId];
      if (!job) return;
      job.done = (job.done || 0) + 1;
      if (job.errors.length < JOB_ERRORS_MAX) job.errors.push({ sourceId, title: '', message });
    });
  }

  listExtractions(args) {
    const taskId = asString(args.taskId, 80);
    const sourceId = asString(args.sourceId, 80);
    return this.state().extractions.filter(
      (row) => (!taskId || row.taskId === taskId) && (!sourceId || row.sourceId === sourceId),
    );
  }

  async addExtraction(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    const label = asString(args.label, 400);
    if (!label) throw new Error('证据需要一个指标名。');
    let sourceId = asString(args.sourceId, 80);
    if (sourceId && !state.sources.some((row) => row.id === sourceId)) sourceId = '';
    const row = {
      id: newId('ext'),
      taskId: task.id,
      sourceId,
      kind: oneOf(args.kind, ['metric', 'finding', 'method', 'limitation', 'note'], 'metric'),
      label,
      value: asString(args.value, 400),
      unit: asString(args.unit, 80),
      context: asString(args.context, 2000),
      quote: asString(args.quote, 1000),
      confidence: normalizeConfidence(args.confidence),
      auto: false,
      mode: 'manual',
      createdAt: nowIso(),
    };
    await this.store.update((draft) => {
      draft.extractions.push(row);
      this.#touch(draft, task.id);
    });
    return row;
  }

  async updateExtraction(args) {
    const state = this.state();
    const id = asString(args.extractionId || args.id, 80);
    const row = state.extractions.find((item) => item.id === id);
    if (!row) throw new Error('找不到这条证据。');
    const patch = {};
    if (args.label !== undefined) {
      const label = asString(args.label, 400);
      if (!label) throw new Error('指标名不能为空。');
      patch.label = label;
    }
    if (args.value !== undefined) patch.value = asString(args.value, 400);
    if (args.unit !== undefined) patch.unit = asString(args.unit, 80);
    if (args.context !== undefined) patch.context = asString(args.context, 2000);
    if (args.quote !== undefined) patch.quote = asString(args.quote, 1000);
    if (args.confidence !== undefined) patch.confidence = normalizeConfidence(args.confidence);
    if (args.sourceId !== undefined) {
      const sourceId = asString(args.sourceId, 80);
      patch.sourceId = sourceId && state.sources.some((source) => source.id === sourceId) ? sourceId : '';
    }
    if (args.kind !== undefined) {
      patch.kind = oneOf(args.kind, ['metric', 'finding', 'method', 'limitation', 'note'], row.kind || 'metric');
    }
    await this.store.update((draft) => {
      const target = draft.extractions.find((item) => item.id === id);
      Object.assign(target, patch, { updatedAt: nowIso(), edited: true });
      this.#touch(draft, row.taskId);
    });
    return this.state().extractions.find((item) => item.id === id);
  }

  async deleteExtraction(args) {
    const state = this.state();
    const id = asString(args.extractionId || args.id, 80);
    const row = state.extractions.find((item) => item.id === id);
    if (!row) throw new Error('找不到这条证据。');
    await this.store.update((draft) => {
      draft.extractions = draft.extractions.filter((item) => item.id !== id);
      this.#touch(draft, row.taskId);
    });
    return { deleted: true, extractionId: id };
  }

  async createReport(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    if (this.reporting.has(task.id)) throw new Error('这个任务正在生成论述，请等当前生成结束再试。');
    this.reporting.add(task.id);
    try {
      const topics = state.topics.filter((row) => row.taskId === task.id);
      const sources = state.sources.filter((row) => row.taskId === task.id);
      const extractions = state.extractions.filter((row) => row.taskId === task.id);
      const generated = await composeReport(this, task, topics, sources, extractions);
      const title = asString(args.title, 300) || generated.title;
      const markdown =
        title === generated.title ? generated.markdown : generated.markdown.replace(/^# .*$/m, `# ${title}`);
      const report = {
        id: newId('rpt'),
        taskId: task.id,
        title,
        abstract: generated.abstract,
        keywords: generated.keywords,
        sections: generated.sections,
        references: generated.references,
        markdown,
        mode: generated.mode,
        model: generated.model || null,
        note: generated.note || '',
        sourceCount: sources.filter((row) => row.analysis).length,
        dataPointCount: extractions.length,
        createdAt: nowIso(),
      };
      await this.store.update((draft) => {
        // The model call can outlive the task; never persist an orphan report.
        if (!draft.tasks.some((row) => row.id === task.id)) {
          throw new Error('任务在生成过程中被删除，论述未保存。');
        }
        draft.reports.push(report);
        this.#touch(draft, task.id);
      });
      return report;
    } finally {
      this.reporting.delete(task.id);
    }
  }

  getReport(args) {
    const state = this.state();
    const report = state.reports.find((row) => row.id === asString(args.reportId || args.id, 80));
    if (!report) throw new Error('找不到这份报告（可能已被删除）。');
    return report;
  }

  async deleteReport(args) {
    const state = this.state();
    const report = state.reports.find((row) => row.id === asString(args.reportId || args.id, 80));
    if (!report) throw new Error('找不到这份报告（可能已被删除）。');
    await this.store.update((draft) => {
      draft.reports = draft.reports.filter((row) => row.id !== report.id);
      this.#touch(draft, report.taskId);
    });
    return { deleted: true, reportId: report.id };
  }

  listSuggestions(args) {
    const taskId = asString(args.taskId, 80);
    return (this.state().suggestions || [])
      .filter((row) => !taskId || row.taskId === taskId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async createSuggestions(args) {
    const state = this.state();
    const task = this.#task(state, args.taskId);
    if (this.suggesting.has(task.id)) throw new Error('这个任务正在生成实验建议，请稍等。');
    const topics = state.topics.filter((row) => row.taskId === task.id);
    const sources = state.sources.filter((row) => row.taskId === task.id);
    const extractions = state.extractions.filter((row) => row.taskId === task.id);
    if (!sources.some((row) => row.analysis)) {
      throw new Error('还没有已分析的科研内容：先添加内容源并完成一次后台探索，再生成实验建议。');
    }
    const count = Math.max(1, Math.min(6, Number(args.count) || 4));
    const experimentBrief = asString(
      args.experimentBrief !== undefined ? args.experimentBrief : task.experimentBrief,
      4000,
    );
    this.suggesting.add(task.id);
    try {
      const generated = await composeSuggestions(this, task, topics, sources, extractions, count, experimentBrief);
      const batchId = newId('batch');
      const batchAt = nowIso();
      const seen = new Set();
      const items = (generated.items || [])
        .filter((item) => {
          const key = String(item.hypothesis || item.title || '').trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, count);
      if (!items.length) throw new Error('模型没有给出可用的实验建议，请换一个模型或稍后重试。');
      const rows = items.map((item) => ({
        id: newId('exp'),
        taskId: task.id,
        batchId,
        batchAt,
        title: item.title,
        hypothesis: item.hypothesis,
        rationale: item.rationale,
        design: item.design,
        resources: item.resources || '',
        variables: item.variables || {},
        readouts: item.readouts || [],
        risks: item.risks || [],
        priority: item.priority || 'medium',
        citations: item.citations || [],
        evidence: item.evidence || [],
        mode: generated.mode,
        model: generated.model || null,
        note: generated.note || '',
        createdAt: batchAt,
      }));
      await this.store.update((draft) => {
        if (!draft.tasks.some((row) => row.id === task.id)) {
          throw new Error('任务在生成过程中被删除，实验建议未保存。');
        }
        draft.suggestions = draft.suggestions || [];
        if (args.replace !== false) {
          draft.suggestions = draft.suggestions.filter((row) => row.taskId !== task.id);
        }
        const taskRow = draft.tasks.find((row) => row.id === task.id);
        if (taskRow) taskRow.experimentBrief = experimentBrief;
        draft.suggestions.push(...rows);
        this.#touch(draft, task.id);
      });
      return {
        items: rows,
        mode: generated.mode,
        model: generated.model || null,
        note: generated.note || '',
        requested: count,
        returned: rows.length,
        batchId,
        batchAt,
      };
    } finally {
      this.suggesting.delete(task.id);
    }
  }

  async deleteSuggestion(args) {
    const state = this.state();
    const id = asString(args.suggestionId || args.id, 80);
    const row = (state.suggestions || []).find((item) => item.id === id);
    if (!row) throw new Error('找不到这条实验建议。');
    await this.store.update((draft) => {
      draft.suggestions = (draft.suggestions || []).filter((item) => item.id !== id);
      this.#touch(draft, row.taskId);
    });
    return { deleted: true, suggestionId: id };
  }
}
