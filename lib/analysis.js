import {
  asString,
  htmlToText,
  normalizeConfidence,
  normalizeRelevance,
  parseJsonObject,
  truncate,
  toStringArray,
} from './util.js';

const ANALYSIS_SYSTEM = `You are a meticulous research analyst working inside a scientific literature workbench.
You extract only what the supplied paper actually says. Never invent authors, numbers, methods, formulas, or citations.
Return exactly one JSON object and no markdown fence or commentary.`;

const REPORT_SYSTEM = `You are an academic writer and evidence synthesist.
You may use only the supplied paper summaries, findings, and data points. Do not add facts, numbers, or references that are not present in the input.
Cite supplied sources with their bracketed numbers such as [1]. Return exactly one JSON object and no markdown fence or commentary.`;

const SUGGESTION_SYSTEM = `You are a research proposal writer and experimental-design advisor embedded in a research sideband.
Write concise, hypothesis-driven research proposals in the structure used by scientific funding applications: research question/objectives, hypothesis, approach and experimental design, variables and controls, readouts and success criteria, resources and timeline, risks and mitigation, expected outcomes.
You never claim an experiment was performed, never invent results, and never present a guess as a measured fact.
Every proposal must be traceable to the supplied sources or explicitly labelled as an untested hypothesis.
Return exactly one JSON object and no markdown fence or commentary.`;

const METRIC_UNITS =
  '%|‰|mg|g|kg|µg|μg|ng|ml|mL|L|μl|µL|μmol|µmol|mmol|mol|nm|μm|µm|um|mm|cm|km|m|ms|s|min|h|d|K|°C|Pa|kPa|MPa|GPa|eV|Hz|kHz|MHz|GHz|V|mV|mA|A|W|kW|J|kJ|cal|kcal|Da|kDa|bp|kb|rpm|×|x';

function service(lab, name) {
  try {
    return lab.pickService(name);
  } catch {
    return undefined;
  }
}

function normalizeProvider(row) {
  if (!row) return null;
  const provider = asString(row.provider || row.id, 120);
  if (!provider) return null;
  return { provider, name: asString(row.displayName || row.name, 160) || provider };
}

async function resolveModel(lab) {
  const defaults = service(lab, 'agentDefaultModel');
  if (defaults && typeof defaults.currentSelection === 'function') {
    try {
      const selection = defaults.currentSelection();
      if (selection && selection.provider && selection.model) {
        return {
          provider: asString(selection.provider, 120),
          model: asString(selection.model, 160),
          reasoningEffort: selection.reasoningEffort,
          source: 'default',
        };
      }
    } catch {
      /* fall through to provider discovery */
    }
  }

  const llm = service(lab, 'llm');
  if (!llm) throw new Error('宿主没有 llm 服务，无法调用模型。');

  let providers = [];
  if (typeof llm.listConfigurableProviders === 'function') {
    try {
      providers = (await llm.listConfigurableProviders()).map(normalizeProvider).filter(Boolean);
    } catch {
      /* try the runtime registry below */
    }
  }
  if (!providers.length && typeof llm.listProviders === 'function') {
    providers = (await llm.listProviders()).map(normalizeProvider).filter(Boolean);
  }

  const problems = [];
  for (const provider of providers) {
    try {
      const models = await llm.listModels(provider.provider);
      const first = (models || [])[0];
      if (first && first.id) {
        return { provider: provider.provider, model: asString(first.id, 160), source: 'discovered' };
      }
    } catch (error) {
      problems.push(`${provider.provider}: ${error && error.message ? error.message : error}`);
    }
  }

  throw new Error(
    `没有可用的对话模型。请到「设置 → 模型」配置提供方和模型后重试。${
      problems.length ? `（${problems.join('；')}）` : ''
    }`,
  );
}

export async function llmComplete(lab, { system, prompt, maxTokens = 8000, timeoutMs = 240000, reasoningEffort, temperature }) {
  const llm = service(lab, 'llm');
  if (!llm || typeof llm.stream !== 'function') throw new Error('宿主没有可用的 llm.stream，无法调用模型。');
  const model = await resolveModel(lab);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text = '';
  let blockText = '';
  let reasoning = '';
  let finish = null;
  try {
    const stream = llm.stream({
      provider: model.provider,
      model: model.model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      system,
      maxTokens,
      signal: controller.signal,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });
    for await (const chunk of stream) {
      if (!chunk) continue;
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
      else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') reasoning += chunk.text;
      else if (chunk.type === 'block-end') {
        const block = chunk.block;
        if (block && block.type === 'text' && typeof block.text === 'string') blockText += block.text;
      } else if (chunk.type === 'finish') finish = chunk.reason || null;
    }
  } finally {
    clearTimeout(timer);
  }

  if (!text && blockText) text = blockText;
  if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
    const failure = finish.failure || {};
    const detail = [failure.message, failure.code, failure.status].filter(Boolean).join(' / ');
    throw new Error(`${finish.kind === 'aborted' ? '模型调用被中止' : '模型调用失败'}：${detail || '宿主没有给出原因'}`);
  }
  if (!text.trim()) {
    throw new Error(
      `模型没有返回正文（finish=${finish && finish.kind ? finish.kind : 'none'}，推理 ${reasoning.length} 字，输出上限 ${maxTokens}）。` +
        '可能推理占满了输出预算；请换一个模型或在「设置 → 模型」里降低推理强度后重试。',
    );
  }
  return { text: text.trim(), model, finish: finish && finish.kind ? finish.kind : 'stop' };
}

export async function llmStatus(lab) {
  try {
    const llm = service(lab, 'llm');
    if (!llm) return { available: false, reason: '宿主没有 llm 服务' };
    const model = await resolveModel(lab);
    return { available: true, provider: model.provider, model: model.model, source: model.source };
  } catch (error) {
    return { available: false, reason: String((error && error.message) || error) };
  }
}

function stripForFetch(result) {
  if (!result || typeof result !== 'object') return { text: '', status: 0, truncated: false };
  const body = result.body || {};
  const content = typeof body.content === 'string' ? body.content : '';
  const text = body.kind === 'html' ? htmlToText(content) : content.trim();
  return { text, status: Number(result.statusCode) || 0, truncated: Boolean(result.truncated) };
}

export async function fetchSourceContent(lab, source) {
  const web = service(lab, 'web');
  if (!web || typeof web.fetch !== 'function') throw new Error('宿主没有 web 服务，无法抓取论文页面。');
  const url = asString(source.url, 2000) || (source.doi ? `https://doi.org/${encodeURIComponent(source.doi)}` : '');
  if (!url) throw new Error('这条科研内容没有 URL 或 DOI，无法抓取；请直接粘贴原文。');
  const result = await web.fetch({ url });
  const { text, status } = stripForFetch(result);
  if (status && (status < 200 || status >= 300)) {
    throw new Error(`抓取返回 HTTP ${status}：${truncate(text, 200) || url}`);
  }
  if (!text || text.length < 80) throw new Error('抓取到的正文太短，可能是登录页或脚本页；请粘贴全文或换一个可访问链接。');
  return { content: text, url, status };
}

function paperHeading(source) {
  const lines = [];
  lines.push(`标题：${asString(source.title, 400) || '(未命名)'}`);
  if (source.authors) lines.push(`作者：${asString(source.authors, 400)}`);
  if (source.year) lines.push(`年份：${asString(source.year, 20)}`);
  if (source.venue) lines.push(`期刊/会议：${asString(source.venue, 300)}`);
  if (source.doi) lines.push(`DOI：${asString(source.doi, 200)}`);
  if (source.url) lines.push(`URL：${asString(source.url, 2000)}`);
  if (source.abstract) lines.push(`摘要：${asString(source.abstract, 5000)}`);
  return lines.join('\n');
}

function topicLines(topics) {
  const rows = (topics || [])
    .map((topic) => `- ${asString(topic.title, 200)}${topic.question ? `：${asString(topic.question, 500)}` : ''}`)
    .filter(Boolean);
  return rows.length ? rows.join('\n') : '- （无需预先拆题；围绕研究兴趣、已有成果与来源内容提取可核查证据）';
}

export function buildAnalysisPrompt(task, topics, source) {
  const body = truncate(source.content || '', 28000);
  return [
    '【科研项目】',
    `标题：${asString(task.title, 300)}`,
    `研究兴趣 / 目的：${asString(task.objective, 6000)}`,
    task.currentState ? `已有成果 / 当前进展：${asString(task.currentState, 6000)}` : '',
    task.field ? `领域：${asString(task.field, 200)}` : '',
    '',
    '【分析焦点（可选，用户未拆题时围绕总目标提取）】',
    topicLines(topics),
    '',
    '【待分析内容（论文 / 报告 / 项目页等）】',
    paperHeading(source),
    '',
    '【正文（可能被截断）】',
    body || '(没有正文，只能依据标题与摘要)',
    '',
    '请输出严格符合以下结构的 JSON，只保留这五个字段：',
    '{',
    '  "problem": "这篇论文要解决的具体问题（1-3句）",',
    '  "method": "论文提出的核心方法/技术路线（1-3句）",',
    '  "achievements": ["关键成果/主要发现，最多 5 条；有数字就保留"],',
    '  "critique": ["批判性思考与局限：假设、边界、复现性、资源、外部效度等，最多 4 条"],',
    '  "keyFormulas": [{"formula": "论文中的关键公式（LaTeX 或原文符号）", "meaning": "这个公式在方法中起什么作用"}]',
    '}',
    '不要输出摘要、关键词、相关性、数据表或其他字段。没有关键公式就给空数组。只提取论文中真实出现的信息。',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function normalizeAnalysis(raw, meta) {
  const dataPoints = Array.isArray(raw && raw.dataPoints)
    ? raw.dataPoints
        .map((point) => ({
          label: asString(point && (point.label || point.name), 300),
          value: asString(point && (point.value ?? point.result), 200),
          unit: asString(point && point.unit, 50),
          context: asString(point && (point.context || point.condition), 800),
          confidence: normalizeConfidence(point && point.confidence),
        }))
        .filter((point) => point.label || point.value)
        .slice(0, 24)
    : [];
  const findings = Array.isArray(raw && raw.findings)
    ? raw.findings
        .map((finding) => ({
          claim: asString(finding && (finding.claim || finding.text), 1000),
          evidence: asString(finding && finding.evidence, 1500),
          quote: asString(finding && (finding.quote || finding.quotation), 600),
        }))
        .filter((finding) => finding.claim)
        .slice(0, 12)
    : [];
  const achievements = toStringArray(raw && raw.achievements, 5, 600);
  const critique = toStringArray(raw && raw.critique, 4, 700);
  const problem = asString(raw && (raw.problem || raw.researchQuestion || raw.summary || raw.abstract), 2000);
  const method = asString(raw && (raw.method || (Array.isArray(raw.methods) ? raw.methods.join('；') : '')), 2000);
  const keyFormulas = (Array.isArray(raw && raw.keyFormulas) ? raw.keyFormulas : [])
    .map((item) => {
      if (item && typeof item === 'object') {
        return {
          formula: asString(item.formula || item.equation || item.text, 1000),
          meaning: asString(item.meaning || item.note, 500),
        };
      }
      return { formula: asString(item, 1000), meaning: '' };
    })
    .filter((item) => item.formula)
    .slice(0, 5);
  const summary =
    asString(raw && raw.summary, 4000) ||
    [problem, method, ...achievements].filter(Boolean).join(' ').slice(0, 3000) ||
    '';
  const derivedFindings =
    findings.length || !achievements.length
      ? findings
      : achievements.map((claim) => ({ claim, evidence: '', quote: '' }));
  return {
    problem,
    method,
    achievements,
    critique,
    keyFormulas,
    summary,
    researchQuestion: asString(raw && (raw.researchQuestion || raw.question), 1000) || problem,
    methods: Array.isArray(raw && raw.methods) ? toStringArray(raw.methods, 10, 400) : method ? [method] : [],
    findings: derivedFindings,
    dataPoints,
    limitations: (Array.isArray(raw && raw.limitations) ? toStringArray(raw.limitations, 8, 600) : []).length
      ? toStringArray(raw.limitations, 8, 600)
      : critique,
    relevance: normalizeRelevance(raw && raw.relevance),
    relevanceNote: asString(raw && (raw.relevanceNote || raw.relevance_note), 2000),
    topics: toStringArray(raw && raw.topics, 8, 200),
    mode: meta.mode,
    model: meta.model || null,
    analyzedAt: meta.analyzedAt,
    note: meta.note || '',
  };
}

const SENTENCE_SPLIT = /(?<=[。！？!?；;])\s*|(?<=\.)\s+(?=[A-Z0-9])/u;

function sentencesOf(text) {
  return String(text || '')
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 18)
    .slice(0, 4000);
}

function keywordHits(task, topics, text) {
  const words = new Set();
  for (const value of [task.title, task.field, ...(topics || []).map((topic) => `${topic.title} ${topic.question || ''}`)]) {
    String(value || '')
      .split(/[\s,，、;；:：/|()（）\[\]【】]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && word.length <= 24)
      .forEach((word) => words.add(word.toLowerCase()));
  }
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const word of words) if (haystack.includes(word)) hits += 1;
  return { hits, total: words.size };
}

/** Deterministic, clearly-labelled extraction used when no model is available. */
export function heuristicAnalysis(task, topics, source) {
  const text = `${source.abstract || ''}\n${source.content || ''}`.trim();
  const sentences = sentencesOf(text);
  const metric = new RegExp(`(${METRIC_UNITS})`, 'i');
  const numeric = /\b\d+(?:[.,]\d+)?\s*(?:%|‰|mg|g|kg|µg|μg|ng|ml|mL|L|μl|µL|μmol|µmol|mmol|mol|nm|μm|µm|um|mm|cm|km|m|ms|s|min|h|K|°C|Pa|kPa|MPa|GPa|eV|Hz|kHz|MHz|GHz|V|mV|mA|A|W|kW|J|kJ|cal|kcal|Da|kDa|bp|kb|rpm|×|x)\b/i;

  const findings = [];
  const dataPoints = [];
  const methods = [];
  const limitations = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (dataPoints.length < 12 && numeric.test(sentence)) {
      const match = numeric.exec(sentence);
      dataPoints.push({
        label: truncate(sentence.replace(numeric, '').replace(/\s+/g, ' ').trim(), 160) || '观测指标',
        value: match ? match[0] : '',
        unit: match && metric.test(match[0]) ? '' : '',
        context: sentence,
        confidence: 'low',
      });
    }
    if (findings.length < 8 && /(we (found|show|demonstrate|report|observe)|results? (show|indicate|suggest)|our (study|results)|表明|发现|显示|证实)/i.test(lower)) {
      findings.push({ claim: truncate(sentence, 400), evidence: sentence, quote: '' });
    }
    if (methods.length < 6 && /(we (used|applied|developed|propose)|method|approach|dataset|采用|方法|模型|实验)/i.test(lower)) {
      methods.push(truncate(sentence, 300));
    }
    if (limitations.length < 5 && /(limitation|caveat|future work|further stud|局限|不足|未来|有待)/i.test(lower)) {
      limitations.push(truncate(sentence, 300));
    }
  }

  const { hits, total } = keywordHits(task, topics, text);
  const ratio = total ? hits / total : 0;
  const relevance = ratio >= 0.35 ? 'high' : ratio >= 0.15 ? 'medium' : 'low';
  return normalizeAnalysis(
    {
      summary: truncate(source.abstract || sentences.slice(0, 3).join(' ') || text, 1800),
      problem: truncate(sentences[0] || source.abstract || '', 800),
      method: truncate(methods.slice(0, 3).join(' '), 1200),
      achievements: findings.slice(0, 5).map((row) => row.claim),
      critique: limitations.slice(0, 4),
      keyFormulas: [],
      researchQuestion: truncate(sentences[0] || '', 500),
      methods,
      findings,
      dataPoints,
      limitations,
      relevance,
      relevanceNote: `未配置模型，使用本地规则抽取（关键词命中 ${hits}/${total}）。请人工核对后再引用。`,
      topics: [],
    },
    { mode: 'heuristic', model: null, analyzedAt: new Date().toISOString(), note: '本地规则抽取，未调用模型' },
  );
}

export async function analyzeSource(lab, task, topics, source) {
  let content = source.content || '';
  let fetchError = '';
  if (!content && (source.url || source.doi)) {
    try {
      const fetched = await fetchSourceContent(lab, source);
      content = fetched.content;
    } catch (error) {
      fetchError = `全文抓取失败，已改用摘要分析：${String((error && error.message) || error)}`;
    }
  }
  if (!content && source.abstract) content = source.abstract;
  if (!content) {
    throw new Error(
      fetchError
        ? `没有可直接分析的正文，且摘要为空。${fetchError}`
        : '没有正文或摘要可分析：请粘贴原文，或提供一个可抓取的 URL/DOI。',
    );
  }

  const llm = service(lab, 'llm');
  if (!llm) {
    const heuristic = heuristicAnalysis(task, topics, { ...source, content });
    if (fetchError) heuristic.note = `${heuristic.note}；${fetchError}`;
    return { analysis: heuristic, content, mode: 'heuristic' };
  }

  try {
    const result = await llmComplete(lab, {
      system: ANALYSIS_SYSTEM,
      prompt: buildAnalysisPrompt(task, topics, { ...source, content }),
      maxTokens: 8000,
    });
    const parsed = parseJsonObject(result.text);
    if (!parsed) {
      throw new Error(
        `模型返回的内容不是可解析的 JSON（finish=${result.finish}，长度=${result.text.length}）：${truncate(result.text, 400)}`,
      );
    }
    return {
      analysis: normalizeAnalysis(parsed, {
        mode: 'model',
        model: `${result.model.provider}/${result.model.model}`,
        analyzedAt: new Date().toISOString(),
        note: fetchError,
      }),
      content,
      mode: 'model',
    };
  } catch (error) {
    if (!content) throw error;
    const fallback = heuristicAnalysis(task, topics, { ...source, content });
    fallback.note = `模型分析失败，已退回本地规则抽取：${String((error && error.message) || error)}${fetchError ? `；${fetchError}` : ''}`;
    return { analysis: fallback, content, mode: 'heuristic-fallback' };
  }
}

function sourceReference(source, index, withLabel = false) {
  const authors = asString(source.authors, 300) || '未知作者';
  const year = asString(source.year, 20) || 'n.d.';
  const venue = asString(source.venue, 300);
  const title = asString(source.title, 500) || '未命名文献';
  const link = asString(source.url, 2000) || (source.doi ? `https://doi.org/${asString(source.doi, 200)}` : '');
  return `${withLabel ? `[${index}] ` : ''}${authors} (${year}). ${title}.${venue ? ` ${venue}.` : ''}${link ? ` ${link}` : ''}`;
}

function evidenceForSource(source, extractions) {
  return (extractions || []).filter((row) => row.sourceId === source.id);
}

function evidenceLine(row) {
  const value = `${row.value || ''}${row.unit ? ` ${row.unit}` : ''}`.trim();
  const context = row.context ? `（${row.context}）` : '';
  const quote = row.quote ? `（原文：${row.quote}）` : '';
  if (row.kind === 'metric') return `- [指标] ${row.label}${value ? `：${value}` : ''}${context}`;
  if (row.kind === 'finding') return `- [结论] ${row.label}${context}${quote}`;
  if (row.kind === 'method') return `- [方法] ${row.label}${context}`;
  if (row.kind === 'limitation') return `- [局限] ${row.label}${context}`;
  return `- [备注] ${row.label}${context}`;
}

function buildReportCorpus(task, topics, sources, extractions) {
  const blocks = [];
  blocks.push('【科研项目】');
  blocks.push(`标题：${asString(task.title, 300)}`);
  blocks.push(`研究兴趣 / 目的：${asString(task.objective, 6000)}`);
  if (task.currentState) blocks.push(`已有成果 / 当前进展：${asString(task.currentState, 6000)}`);
  if (task.field) blocks.push(`领域：${asString(task.field, 200)}`);
  blocks.push('');
  blocks.push('【分析焦点（可选）】');
  blocks.push(topicLines(topics));
  blocks.push('');
  blocks.push('【已分析内容与证据表】');

  let index = 0;
  for (const source of sources) {
    index += 1;
    const analysis = source.analysis || {};
    const rows = evidenceForSource(source, extractions);
    blocks.push('');
    blocks.push(`内容 [${index}]：${asString(source.title, 400)}`);
    blocks.push(sourceReference(source, index, true));
    if (source.year) blocks.push(`年份：${source.year}`);
    blocks.push(`摘要：${asString(analysis.summary, 3000) || '(无)'}`);
    if (analysis.methods && analysis.methods.length) blocks.push(`方法（分析摘要）：${analysis.methods.join('；')}`);
    if (rows.length) {
      blocks.push('证据表（这是本任务最终采信的证据，包含人工修正）：');
      for (const row of rows.slice(0, 30)) blocks.push(evidenceLine(row));
    } else {
      if (analysis.findings && analysis.findings.length) {
        blocks.push('结论（未进入证据表，按分析原文使用）：');
        for (const finding of analysis.findings.slice(0, 8)) {
          blocks.push(`- ${finding.claim}${finding.quote ? `（原文：${finding.quote}）` : ''}`);
        }
      }
      if (analysis.dataPoints && analysis.dataPoints.length) {
        blocks.push('数据点（未进入证据表，按分析原文使用）：');
        for (const point of analysis.dataPoints.slice(0, 16)) {
          blocks.push(`- ${point.label}：${point.value}${point.unit ? ` ${point.unit}` : ''}${point.context ? `（${point.context}）` : ''}`);
        }
      }
    }
    const limitationRows = rows.filter((row) => row.kind === 'limitation');
    const limitations = [
      ...(analysis.limitations || []),
      ...limitationRows.map((row) => row.label),
    ];
    if (limitations.length) blocks.push(`局限：${limitations.join('；')}`);
    blocks.push(`相关性：${analysis.relevance || 'low'}${analysis.relevanceNote ? `（${analysis.relevanceNote}）` : ''}`);
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  const unassigned = (extractions || []).filter((row) => !row.sourceId || !sourceIds.has(row.sourceId));
  if (unassigned.length) {
    blocks.push('');
    blocks.push('【未归属到具体内容的证据 / 用户手工补充】');
    for (const row of unassigned.slice(0, 30)) blocks.push(evidenceLine(row));
  }

  return truncate(blocks.join('\n'), 52000);
}

export function buildReportPrompt(task, topics, sources, extractions) {
  const corpus = buildReportCorpus(task, topics, sources, extractions);
  return [
    corpus,
    '',
    '请基于以上材料，写一篇完整、连贯、可读的中文科研论述（不是材料罗列）。要求：',
    '1. 只使用以上材料中的事实与数字；用 [1]、[2] 这样的编号引用文献。',
    '2. 结构至少包含：摘要、引言、相关研究、研究方法、结果与讨论、结论与展望。',
    '3. 摘要 200-300 字；正文 1500-3000 字；每一节 2-5 段。',
    '4. 明确指出证据之间的分歧、空白和局限，不要夸大结论。',
    '5. 输出严格 JSON：',
    '{',
    '  "title": "文章标题",',
    '  "abstract": "摘要",',
    '  "keywords": ["关键词，3-6 个"],',
    '  "sections": [{"heading": "1. 引言", "paragraphs": ["段落1", "段落2"]}],',
    '  "references": [{"label": "[1]", "text": "文献信息"}]',
    '}',
  ].join('\n');
}

function normalizeSections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((section) => ({
      heading: asString(section && (section.heading || section.title), 200),
      paragraphs: Array.isArray(section && section.paragraphs)
        ? section.paragraphs.map((paragraph) => asString(paragraph, 8000)).filter(Boolean)
        : asString(section && (section.content || section.text), 12000)
          ? [asString(section.content || section.text, 12000)]
          : [],
    }))
    .filter((section) => section.heading && section.paragraphs.length)
    .slice(0, 16);
}

function reportMarkdown({ title, abstract, keywords, sections, references, meta }) {
  const lines = [`# ${title}`, ''];
  if (meta) lines.push(`> ${meta}`, '');
  if (abstract) lines.push('## 摘要', '', abstract, '');
  if (keywords && keywords.length) lines.push(`**关键词：** ${keywords.join('；')}`, '');
  for (const section of sections) {
    lines.push(`## ${section.heading}`, '');
    for (const paragraph of section.paragraphs) lines.push(paragraph, '');
  }
  if (references && references.length) {
    lines.push('## 参考文献', '');
    for (const reference of references) lines.push(`${reference.label} ${reference.text}`, '');
  }
  return lines.join('\n').trim();
}

function fallbackReport(task, topics, sources, extractions) {
  const analyzed = sources.filter((source) => source.analysis);
  const evidenceBySource = analyzed.map((source, index) => ({
    source,
    index: index + 1,
    rows: evidenceForSource(source, extractions),
  }));

  const allFindings = evidenceBySource.flatMap(({ source, index, rows }) => {
    const fromTable = rows
      .filter((row) => row.kind === 'finding')
      .slice(0, 3)
      .map((row) => ({ claim: row.label, evidence: row.context, quote: row.quote, index }));
    if (fromTable.length) return fromTable;
    return (source.analysis.findings || []).slice(0, 3).map((finding) => ({ ...finding, index }));
  });
  const allPoints = evidenceBySource.flatMap(({ source, index, rows }) => {
    const fromTable = rows
      .filter((row) => row.kind === 'metric')
      .slice(0, 6)
      .map((row) => ({ label: row.label, value: row.value, unit: row.unit, context: row.context, index }));
    if (fromTable.length) return fromTable;
    return (source.analysis.dataPoints || []).slice(0, 6).map((point) => ({ ...point, index }));
  });
  const allLimitations = evidenceBySource.flatMap(({ source, rows }) => {
    const fromTable = rows
      .filter((row) => row.kind === 'limitation')
      .slice(0, 2)
      .map((row) => ({ text: row.label, title: source.title }));
    const fromAnalysis = (source.analysis.limitations || []).slice(0, 2).map((text) => ({ text, title: source.title }));
    return [...fromTable, ...fromAnalysis].slice(0, 3);
  });

  const refs = analyzed.map((source, index) => ({ label: `[${index + 1}]`, text: sourceReference(source, index + 1) }));
  const objective = asString(task.objective, 3000);
  const abstracts = analyzed
    .map((source, index) => `内容 [${index + 1}]（${asString(source.title, 200) || '未命名'}）${asString(source.analysis.summary, 600)}`)
    .join('\n\n');
  const otherEvidence = (extractions || [])
    .filter((row) => row.kind === 'method' || row.kind === 'note' || !row.sourceId)
    .slice(0, 8)
    .map((row) => `${row.label}${row.value ? `：${row.value}${row.unit ? ` ${row.unit}` : ''}` : ''}${row.context ? `（${row.context}）` : ''}`);

  const sections = [
    {
      heading: '1. 引言',
      paragraphs: [
        `本研究围绕“${asString(task.title, 300)}”展开。${objective ? `研究兴趣/目的是：${objective}` : ''}`,
        task.currentState ? `已有成果/当前进展：${asString(task.currentState, 2000)}` : '',
        topics.length
          ? `为拆解这一目标，边带登记了 ${topics.length} 个题目：${topics.map((topic) => asString(topic.title, 120)).filter(Boolean).join('、')}。以下论述依据这些题目组织证据。`
          : '未预拆题目，按研究兴趣、已有成果与证据表直接组织。',
      ].filter(Boolean),
    },
    {
      heading: '2. 相关研究',
      paragraphs: abstracts ? [abstracts] : ['尚无已分析的内容。'],
    },
    {
      heading: '3. 研究方法与证据',
      paragraphs: [
        analyzed.length
          ? `本论述综合了 ${analyzed.length} 条已分析内容，采信了 ${allPoints.length} 条指标证据。内容采用的方法包括：${analyzed.flatMap((source) => source.analysis.methods || []).slice(0, 12).join('；') || '原文未明确说明'}。`
          : '尚无已分析内容，无法形成方法层面的综合。',
        allPoints.length
          ? allPoints
              .map(
                (point) =>
                  `- ${point.label}：${point.value}${point.unit ? ` ${point.unit}` : ''}${point.context ? `（${point.context}）` : ''} [${point.index}]`,
              )
              .join('\n')
          : '暂无可核查的指标证据。',
        otherEvidence.length ? `其他证据记录：${otherEvidence.join('；')}。` : '',
      ].filter(Boolean),
    },
    {
      heading: '4. 结果与讨论',
      paragraphs: allFindings.length
        ? allFindings.map((finding) => `${finding.claim} [${finding.index}]${finding.evidence ? ` 证据：${finding.evidence}` : ''}${finding.quote ? `（原文：${finding.quote}）` : ''}`)
        : ['已分析内容没有给出可引用的结论。'],
    },
    {
      heading: '5. 结论与展望',
      paragraphs: [
        analyzed.length
          ? `围绕“${asString(task.title, 200)}”，现有证据覆盖了 ${analyzed.length} 条内容。综合来看，${allFindings.slice(0, 3).map((finding) => finding.claim).join('；') || '证据仍不足以形成稳定结论'}。`
          : '当前证据不足，建议先补充科研内容并完成后台分析。',
        allLimitations.length
          ? `需要正视的局限包括：${allLimitations.map((row) => `${row.text}（${asString(row.title, 120)}）`).join('；')}。后续工作应优先补齐这些空白。`
          : '后续工作应补充更多独立来源，并对关键证据做交叉核对。',
      ],
    },
  ];

  return {
    title: `${asString(task.title, 200) || '科研项目'}：研究现状与证据综合`,
    abstract: `本报告围绕“${asString(task.title, 200)}”，整合了 ${analyzed.length} 条已分析内容与 ${allPoints.length} 条指标证据。${
      allFindings[0] ? `主要证据显示：${allFindings[0].claim}` : '现有证据尚不足以形成稳定结论。'
    }报告同时列出证据空白与局限，供后续实验设计参考。`,
    keywords: [asString(task.field, 60), '文献综述', '证据综合'].filter(Boolean),
    sections,
    references: refs,
    mode: 'fallback',
    note: '未使用模型：按证据表确定性拼装。',
  };
}

export async function composeReport(lab, task, topics, sources, extractions) {
  const analyzed = sources.filter((source) => source.analysis);
  if (!analyzed.length) throw new Error('还没有已分析的文献：先添加科研内容并完成一次后台探索。');

  const llm = service(lab, 'llm');
  if (llm) {
    try {
      const result = await llmComplete(lab, {
        system: REPORT_SYSTEM,
        prompt: buildReportPrompt(task, topics, analyzed, extractions),
        maxTokens: 9000,
        timeoutMs: 300000,
      });
      const parsed = parseJsonObject(result.text);
      if (!parsed) throw new Error('模型返回的内容不是可解析的 JSON');
      const sections = normalizeSections(parsed.sections);
      if (!sections.length) throw new Error('模型没有给出有效的章节');
      const title = asString(parsed.title, 300) || `${asString(task.title, 200)}：研究现状与证据综合`;
      const abstract = asString(parsed.abstract, 3000);
      const keywords = toStringArray(parsed.keywords, 8, 40);
      const references = analyzed.map((source, index) => ({ label: `[${index + 1}]`, text: sourceReference(source, index + 1) }));
      const meta = `由科研探索边带生成 · ${new Date().toISOString().slice(0, 10)} · 模型 ${result.model.provider}/${result.model.model} · ${analyzed.length} 篇文献`;
      return {
        title,
        abstract,
        keywords,
        sections,
        references,
        markdown: reportMarkdown({ title, abstract, keywords, sections, references, meta }),
        mode: 'model',
        model: `${result.model.provider}/${result.model.model}`,
        note: '',
      };
    } catch (error) {
      const fallback = fallbackReport(task, topics, analyzed, extractions);
      fallback.note = `模型生成失败，已退回证据拼装：${String((error && error.message) || error)}`;
      fallback.markdown = reportMarkdown({
        ...fallback,
        meta: `由科研探索边带生成 · ${new Date().toISOString().slice(0, 10)} · 证据拼装模式`,
      });
      return fallback;
    }
  }

  const fallback = fallbackReport(task, topics, analyzed, extractions);
  fallback.markdown = reportMarkdown({
    ...fallback,
    meta: `由科研探索边带生成 · ${new Date().toISOString().slice(0, 10)} · 证据拼装模式`,
  });
  return fallback;
}

function normalizeSuggestion(raw, index, sources) {
  if (!raw || typeof raw !== 'object') return null;
  const title = asString(raw.title, 300);
  const question = asString(raw.question || raw.objective || raw.aim || raw.specificAim, 240);
  const hypothesis = asString(raw.hypothesis || raw.question, 320);
  if (!title && !hypothesis) return null;
  const variablesRaw = raw.variables && typeof raw.variables === 'object' && !Array.isArray(raw.variables) ? raw.variables : {};
  const approach = toStringArray(raw.approach || raw.steps || raw.methods || raw.procedure, 6, 160);
  const design = asString(raw.design || raw.protocol, 500) || approach.join('；');
  const citations = new Set();
  for (const value of Array.isArray(raw.citations) ? raw.citations : []) {
    const match = String(value).match(/\[(\d+)\]/);
    if (match) {
      const n = Number(match[1]);
      if (n >= 1 && n <= sources.length) citations.add(`[${n}]`);
    }
  }
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : [])
    .map((row) => {
      const label = asString(row && (row.label || row.title || row.source), 300);
      const quote = asString(row && (row.quote || row.evidence), 800);
      const match = label.match(/\[(\d+)\]/);
      if (match) {
        const n = Number(match[1]);
        if (n >= 1 && n <= sources.length) citations.add(`[${n}]`);
      }
      return { label, quote };
    })
    .filter((row) => row.label || row.quote)
    .slice(0, 6);
  const priority = ['high', 'medium', 'low'].includes(String(raw.priority || '').toLowerCase())
    ? String(raw.priority).toLowerCase()
    : 'medium';
  return {
    title: title || `实验建议 ${index + 1}`,
    question,
    hypothesis: hypothesis || '待验证假设（需要人工细化）',
    rationale: asString(raw.rationale || raw.reason, 260),
    approach,
    design,
    resources: asString(raw.resources || raw.resourcesNeeded || raw.constraints, 220),
    timeline: asString(raw.timeline || raw.duration, 80),
    expectedOutcome: asString(raw.expectedOutcome || raw.outcome || raw.successCriteria, 240),
    variables: {
      independent: asString(variablesRaw.independent || variablesRaw.factor || raw.independent, 300),
      dependent: asString(variablesRaw.dependent || variablesRaw.outcome || raw.dependent, 300),
      controls: asString(variablesRaw.controls || variablesRaw.control || raw.controls, 360),
    },
    readouts: toStringArray(raw.readouts || raw.measurements, 3, 160),
    risks: toStringArray(raw.risks || raw.caveats, 2, 200),
    priority,
    citations: [...citations],
    evidence,
  };
}

function buildSuggestionPrompt(task, topics, sources, extractions, count, experimentBrief) {
  const corpus = buildReportCorpus(task, topics, sources, extractions);
  return [
    corpus,
    '',
    '【用户定向问题 / 关注点】',
    experimentBrief || '用户未指定；请围绕项目研究目的，提出一个最值得优先验证的关键问题。',
    '',
    `请提出 ${count} 个互补、可执行的科研 proposal。优先围绕上面的“用户定向问题”设计；如果用户问题较宽，拆成互补的子问题。按资助申请书的结构写，但只保留一页以内的核心内容。`,
    '每条 proposal 必须包含：研究问题/目标、可证伪假设、方法与 3–4 步设计、变量与对照、读端/成功标准、资源与时间线、风险与备选、预期结果。',
    '1. 这是设计建议，不是实验执行；不要声称已经做过实验，不要编造结果或数值。',
    '2. “question”字段必须直接回应用户的定向问题；项目研究目的只作为背景，不要简单复述。',
    '3. 如果用户同时写了机器/数据/时间限制，把它们写进 resources 与 timeline；没有写就明确资源假设。',
    '4. 文字精简：每节 1–3 句或 2–4 个短条目；单条 proposal 约 300–450 中文字，避免重复背景。',
    '5. 优先填补证据空白、解决分歧、验证边界条件；区分“已有证据支持”与“待验证假设”。',
    '6. 输出严格 JSON：',
    '{',
    '  "items": [{',
    '    "title": "一句话 proposal 标题",',
    '    "question": "直接回应用户定向问题的研究问题/目标，≤60字",',
    '    "hypothesis": "可证伪假设，≤80字",',
    '    "rationale": "为什么值得做，引用 [n]，≤100字",',
    '    "approach": ["步骤1", "步骤2", "步骤3"],',
    '    "variables": {"independent": "自变量", "dependent": "因变量", "controls": "对照与混杂控制"},',
    '    "readouts": ["2-3 个主要/次要读端或成功标准"],',
    '    "resources": "需要的 GPU/数据/人员，结合用户约束，≤70字",',
    '    "timeline": "预计周期，例如 2 周 / 3 个实验批次",',
    '    "risks": ["1-2 个主要风险及备选"],',
    '    "expectedOutcome": "可观察的预期结果/决策价值，≤80字",',
    '    "priority": "high|medium|low",',
    '    "citations": ["[1]"],',
    '    "evidence": [{"label": "[1] 论文短名", "quote": "原文或摘要依据"}]',
    '  }]',
    '}',
  ].join('\n');
}

function fallbackSuggestions(task, topics, sources, extractions, count, experimentBrief) {
  const analyzed = sources.filter((source) => source.analysis);
  const findings = analyzed.flatMap((source, index) =>
    (source.analysis.findings || []).slice(0, 4).map((finding) => ({
      ...finding,
      index: index + 1,
      source,
    })),
  );
  const limitations = analyzed.flatMap((source, index) =>
    (source.analysis.limitations || []).slice(0, 3).map((text) => ({ text, index: index + 1, source })),
  );
  const baseTopics = topics.length ? topics : [{ title: task.title, question: task.objective }];
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const topic = baseTopics[i % baseTopics.length];
    const finding = findings.length ? findings[i % findings.length] : null;
    const limitation = limitations.length ? limitations[i % limitations.length] : null;
    const citation = finding ? `[${finding.index}]` : '';
    const approach = [
      '设置处理组与未处理对照，随机分配并控制批次/环境',
      `针对「${limitation ? asString(limitation.text, 100) : '关键边界条件'}」设置分层或敏感性分析`,
      '先做功效分析，再按预注册方案采集主要读端',
    ];
    items.push({
      title: `验证「${asString(topic.title, 100) || '核心假设'}」的对照实验`,
      question: asString(experimentBrief, 160) || asString(topic.question || task.objective, 160) || asString(task.title, 160),
      hypothesis: `在控制混杂因素后，${asString(topic.title, 140) || asString(task.title, 140)} 会对预先指定的主要结局产生可检测的影响。`,
      rationale: finding
        ? `已有证据：${asString(finding.claim, 160)}${citation ? ` ${citation}` : ''}`
        : '来自研究目的与已有成果的待验证假设；当前证据尚不足以给出方向性结论。',
      approach,
      design: approach.join('；'),
      resources: asString(experimentBrief, 300) || '需明确可用 GPU/数据/时间；建议先按现有资源做最小可行实验。',
      timeline: '先做 1 周预实验，再做 2–3 周主实验（按资源调整）',
      expectedOutcome: '得到主要结局的效应量、置信区间与可复现性证据，用于决定是否扩大实验。',
      variables: {
        independent: asString(topic.title, 160),
        dependent: '预先注册的主要结局指标',
        controls: '同批次样本、同环境、随机化与阴性对照',
      },
      readouts: ['主要结局的效应量与 95% 置信区间', '次要结局/安全性', '与已有报告的一致性'],
      risks: [
        limitation ? `证据边界：${asString(limitation.text, 140)}` : '现有证据不足以确定效应大小',
        '样本量与统计功效需要先做功效分析；需伦理审查与预注册',
      ],
      priority: i === 0 ? 'high' : i < 2 ? 'medium' : 'low',
      citations: citation ? [citation] : [],
      evidence: finding
        ? [{ label: `${citation} ${asString(finding.source.title, 160)}`, quote: asString(finding.quote || finding.evidence, 240) }]
        : [],
    });
  }
  return {
    items,
    mode: 'fallback',
    model: null,
    note: '未使用模型：按研究目的、已有成果、证据局限与用户资源约束生成确定性建议，需人工设计、预注册与伦理审查。',
  };
}

const REVIEWER_SYSTEM = `You are an independent scientific proposal reviewer.
You have no conversation history and no memory of the user; judge only the material in this prompt.
You review whether each proposal directly answers the stated user focus, follows the required proposal structure, cites real supplied papers, avoids fabricated results, and is feasible under the stated constraints.
Be strict but fair. Return exactly one JSON object and no markdown fence.`;

function buildReviewPrompt(task, focus, items, sources) {
  const sourceList = sources
    .map((source, index) => `[${index + 1}] ${source.title || ''} (${source.year || 'n.d.'}) ${source.doi || source.url || ''}`)
    .join('\n');
  return [
    `【用户定向问题】${focus || task.objective || task.title}`,
    '',
    '【可用论文引用】',
    sourceList || '（无）',
    '',
    '【待审核 proposal】',
    JSON.stringify(items, null, 2),
    '',
    '审核标准：',
    '1. 是否直接回答用户定向问题，而不是只复述项目目的；',
    '2. 是否包含研究问题、可证伪假设、方法/步骤、变量与对照、读端、资源与时间线、风险、预期结果；',
    '3. 引用编号是否来自可用论文列表，且与 proposal 的主张相关；',
    '4. 是否编造实验结果、数值或论文结论；',
    '5. 在给定资源/时间下是否可执行，风险是否有备选；',
    '6. 是否足够精简、没有空话。',
    '',
    '返回 JSON：',
    '{"summary":"一句话总体结论","items":[{"index":0,"approved":true,"score":8.5,"issues":["需要修改的点"],"citationIssues":["引用问题"]}]}',
  ].join('\n');
}

async function reviewSuggestions(lab, task, focus, items, sources) {
  try {
    const result = await llmComplete(lab, {
      system: REVIEWER_SYSTEM,
      prompt: buildReviewPrompt(task, focus, items, sources),
      maxTokens: 4000,
      reasoningEffort: 'off',
      temperature: 0,
      timeoutMs: 120000,
    });
    const parsed = parseJsonObject(result.text);
    if (!parsed) throw new Error('reviewer returned non-JSON');
    const rows = Array.isArray(parsed.items) ? parsed.items : [];
    const byIndex = new Map();
    for (const row of rows) {
      const index = Number(row && row.index);
      if (!Number.isInteger(index) || index < 0 || index >= items.length) continue;
      const score = Math.max(0, Math.min(10, Number(row.score) || 0));
      byIndex.set(index, {
        approved: row.approved === true || (row.approved === undefined && score >= 6),
        score,
        issues: Array.isArray(row.issues) ? row.issues.map((value) => asString(value, 300)).filter(Boolean).slice(0, 5) : [],
        citationIssues: Array.isArray(row.citationIssues)
          ? row.citationIssues.map((value) => asString(value, 300)).filter(Boolean).slice(0, 3)
          : [],
      });
    }
    return {
      items: items.map((_, index) =>
        byIndex.get(index) || { approved: false, score: 0, issues: ['reviewer 未返回该条结论'], citationIssues: [] },
      ),
      summary: asString(parsed.summary, 500),
      mode: 'model',
      model: result.model ? `${result.model.provider}/${result.model.model}` : null,
      temperature: 0,
    };
  } catch (error) {
    return {
      items: items.map(() => ({ approved: true, score: null, issues: [], citationIssues: [] })),
      summary: '',
      mode: 'unavailable',
      model: null,
      temperature: 0,
      note: `reviewer 不可用，未过滤：${String((error && error.message) || error)}`,
    };
  }
}

export async function reviewArtifact(lab, task, kind, payload, focus = '') {
  const result = await llmComplete(lab, {
    system: REVIEWER_SYSTEM,
    prompt: [
      `【任务】${task.title || ''}`,
      `【研究目的】${task.objective || ''}`,
      `【用户定向问题】${focus || '未指定'}`,
      `【审核对象】${kind === 'report' ? '综述/报告' : '证据表'}`,
      JSON.stringify(payload, null, 2).slice(0, 30000),
      '',
      '审核要求：',
      '- 证据：合并重复、删除无关或弱证据、指出缺失证据；每条操作给出目标 id 和理由。',
      '- 报告：检查研究问题/意义、证据覆盖与缺口、引用是否全部对应真实论文、结论是否越界、可行性、预期结果。',
      '返回严格 JSON：{"approved":true,"score":8,"summary":"...","evidenceOps":[{"op":"keep|merge|delete|add","id":"...","targetId":"...","reason":"..."}],"reportIssues":["..."],"citationIssues":["..."],"requiredFixes":["..."]}',
    ].join('\n'),
    maxTokens: 5000,
    reasoningEffort: 'off',
    temperature: 0,
    timeoutMs: 120000,
  });
  const parsed = parseJsonObject(result.text);
  if (!parsed) throw new Error('reviewer 返回的不是可解析 JSON');
  return {
    approved: parsed.approved === true,
    score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
    summary: asString(parsed.summary, 500),
    evidenceOps: Array.isArray(parsed.evidenceOps) ? parsed.evidenceOps.slice(0, 30) : [],
    reportIssues: Array.isArray(parsed.reportIssues) ? parsed.reportIssues.slice(0, 10) : [],
    citationIssues: Array.isArray(parsed.citationIssues) ? parsed.citationIssues.slice(0, 10) : [],
    requiredFixes: Array.isArray(parsed.requiredFixes) ? parsed.requiredFixes.slice(0, 10) : [],
    model: result.model ? `${result.model.provider}/${result.model.model}` : null,
    temperature: 0,
    mode: 'model',
  };
}

export async function composeSuggestions(lab, task, topics, sources, extractions, count = 4, experimentBrief = '') {
  const analyzed = sources.filter((source) => source.analysis);
  if (!analyzed.length) throw new Error('还没有已分析的科研内容：先完成一次后台探索。');
  const llm = service(lab, 'llm');
  if (llm) {
    try {
      const result = await llmComplete(lab, {
        system: SUGGESTION_SYSTEM,
        prompt: buildSuggestionPrompt(task, topics, analyzed, extractions, count, experimentBrief),
        maxTokens: 24000,
        reasoningEffort: 'low',
        timeoutMs: 300000,
      });
      const parsed = parseJsonObject(result.text);
      if (!parsed) throw new Error('模型返回的内容不是可解析的 JSON');
      const rawItems = Array.isArray(parsed.items)
        ? parsed.items
        : Array.isArray(parsed.suggestions)
          ? parsed.suggestions
          : Array.isArray(parsed.experiments)
            ? parsed.experiments
            : [];
      const items = rawItems
        .map((item, index) => normalizeSuggestion(item, index, analyzed))
        .filter(Boolean)
        .slice(0, count);
      if (!items.length) throw new Error('模型没有给出可用的实验建议');
      const review = await reviewSuggestions(lab, task, experimentBrief, items, analyzed);
      const reviewed = items.map((item, index) => ({
        ...item,
        review: review.items[index] || { approved: true, score: null, issues: [], citationIssues: [] },
      }));
      const approved = reviewed.filter((item) => item.review.approved !== false);
      if (!approved.length) {
        const failure = new Error(
          `Reviewer 未通过任何 proposal：${review.summary || review.note || '请调整“想探究的问题”或补充证据后重试。'}`,
        );
        failure.code = 'REVIEW_REJECTED';
        throw failure;
      }
      return {
        items: approved,
        review,
        mode: 'model',
        model: `${result.model.provider}/${result.model.model}`,
        note: review.note || '',
      };
    } catch (error) {
      if (error && error.code === 'REVIEW_REJECTED') throw error;
      const fallback = fallbackSuggestions(task, topics, analyzed, extractions, count, experimentBrief);
      fallback.note = `模型生成失败，已退回模板建议：${String((error && error.message) || error)}`;
      return fallback;
    }
  }
  return fallbackSuggestions(task, topics, analyzed, extractions, count, experimentBrief);
}
