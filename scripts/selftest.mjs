import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResearchLab } from '../lib/lab.js';

const ANALYSIS = {
  summary: '该文研究了界面改性对固态电解质循环寿命的影响，报告了电导率与循环次数的变化。',
  researchQuestion: '界面改性是否能提升循环寿命？',
  methods: ['磁控溅射', '电化学阻抗谱', '恒流充放电'],
  findings: [
    { claim: '界面改性使循环寿命提升约 40%', evidence: '1000 次循环后容量保持 82%', quote: 'capacity retention reached 82% after 1000 cycles' },
  ],
  dataPoints: [
    { label: '离子电导率', value: '1.2', unit: 'mS/cm', context: '室温', confidence: 'high' },
    { label: '容量保持率', value: '82', unit: '%', context: '1000 次循环后', confidence: 'medium' },
  ],
  limitations: ['只测试了一种改性层厚度'],
  relevance: 'high',
  relevanceNote: '直接回答循环寿命与界面改性关系。',
  topics: ['界面改性与循环寿命'],
};

const REPORT = {
  title: '界面改性对固态电解质循环寿命的影响：证据综合',
  abstract: '本文综合分析了界面改性对固态电解质循环寿命的影响。结果表明界面改性可显著提升容量保持率。',
  keywords: ['固态电解质', '界面改性', '循环寿命'],
  sections: [
    { heading: '1. 引言', paragraphs: ['固态电解质的界面问题限制了循环寿命。'] },
    { heading: '2. 相关研究', paragraphs: ['已有研究采用磁控溅射进行界面改性 [1]。'] },
    { heading: '3. 结果与讨论', paragraphs: ['界面改性后容量保持率达到 82% [1]。'] },
    { heading: '4. 结论与展望', paragraphs: ['现有证据支持界面改性的作用，但仍需更多独立复现。'] },
  ],
  references: [{ label: '[1]', text: 'mock' }],
};

const SUGGESTIONS = {
  items: [
    {
      title: '检验改性层厚度对循环寿命的剂量效应',
      hypothesis: '在相同界面化学条件下，改性层厚度存在最优区间，过厚会提高阻抗。',
      rationale: '已有研究报告 1000 次循环后 82% 容量保持，但只测试了一种厚度 [1]。',
      design: '设置 3 个厚度水平与未改性对照，随机分配，控制批次与温度，进行 1000 次循环。',
      variables: { independent: '改性层厚度', dependent: '1000 次循环容量保持率', controls: '未改性对照、同批次、同温度' },
      readouts: ['容量保持率', '界面阻抗', '库仑效率'],
      risks: ['厚度工艺窗口可能不足', '样本量需先做功效分析'],
      priority: 'high',
      citations: ['[1]'],
      evidence: [{ label: '[1] Mock paper', quote: 'capacity retention reached 82% after 1000 cycles' }],
    },
    {
      title: '复现长循环条件下的界面稳定性',
      hypothesis: '更长的循环会暴露短期测试未发现的界面退化。',
      rationale: '现有证据只覆盖 1000 次循环 [1]。',
      design: '将循环延长至 3000 次，并每 500 次做阻抗谱。',
      variables: { independent: '循环次数', dependent: '界面阻抗增长', controls: '同批次对照' },
      readouts: ['阻抗增长率', '容量衰减曲线'],
      risks: ['测试周期长'],
      priority: 'medium',
      citations: ['[1]'],
      evidence: [],
    },
  ],
};

const ARXIV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2601.00001v1</id>
    <published>2026-01-02T00:00:00Z</published>
    <title>Interfacial coating thickness and cycling stability</title>
    <summary>We study a 10 nm coating and report 88% capacity retention after 1000 cycles.</summary>
    <author><name>Alice Example</name></author>
    <author><name>Bob Example</name></author>
    <arxiv:doi>10.1000/arxiv.example</arxiv:doi>
  </entry>
</feed>`;

const DEEPEN_WORK = {
  id: 'https://openalex.org/W100',
  doi: 'https://doi.org/10.1000/seed',
  title: 'Seed paper on silent data corruption',
  publication_year: 2024,
  authorships: [{ author: { display_name: 'Seed Author' } }],
  primary_location: { source: { display_name: 'Seed Journal' }, landing_page_url: 'https://example.org/seed' },
  open_access: {},
  best_oa_location: {},
  abstract_inverted_index: { Seed: [0], abstract: [1] },
  referenced_works: ['https://openalex.org/W101'],
};

const DEEPEN_REF = {
  id: 'https://openalex.org/W101',
  doi: 'https://doi.org/10.1000/ref',
  title: 'Referenced paper on quantization faults',
  publication_year: 2023,
  authorships: [{ author: { display_name: 'Ref Author' } }],
  primary_location: { source: { display_name: 'Ref Journal' }, landing_page_url: 'https://example.org/ref' },
  open_access: {},
  best_oa_location: {},
  abstract_inverted_index: { Referenced: [0], paper: [1], about: [2], quantization: [3], and: [4], silent: [5], data: [6], corruption: [7] },
};

const DEEPEN_CITE = {
  id: 'https://openalex.org/W102',
  doi: 'https://doi.org/10.1000/cite',
  title: 'Citing paper on SDC sensitivity',
  publication_year: 2025,
  authorships: [{ author: { display_name: 'Cite Author' } }],
  primary_location: { source: { display_name: 'Cite Journal' }, landing_page_url: 'https://example.org/cite' },
  open_access: {},
  best_oa_location: {},
  abstract_inverted_index: { Citing: [0], paper: [1], on: [2], silent: [3], data: [4], corruption: [5], sensitivity: [6] },
};

const OPENALEX_JSON = {
  results: [
    {
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.1000/openalex.example',
      title: 'Long-cycle coating stability of solid electrolytes',
      publication_year: 2025,
      authorships: [{ author: { display_name: 'Carol Example' } }],
      primary_location: { source: { display_name: 'Journal of Mock Electrolytes' }, landing_page_url: 'https://example.org/openalex' },
      open_access: { oa_url: 'https://example.org/openalex.pdf' },
      best_oa_location: { pdf_url: 'https://example.org/openalex.pdf' },
      abstract_inverted_index: { We: [0], test: [1], long: [2], cycling: [3] },
    },
  ],
};

const CROSSREF_JSON = {
  message: {
    items: [
      {
        DOI: '10.1000/crossref.example',
        title: ['Journal article on coating interfaces'],
        author: [{ given: 'Dana', family: 'Example' }],
        issued: { 'date-parts': [[2024]] },
        'container-title': ['Journal of Mock Interfaces'],
        URL: 'https://example.org/crossref',
        abstract: '<jats:p>Journal metadata abstract about coating thickness.</jats:p>',
        link: [{ 'content-type': 'application/pdf', URL: 'https://example.org/crossref.pdf' }],
      },
    ],
  },
};

const EUROPEPMC_JSON = {
  resultList: {
    result: [
      {
        id: 'PMC123',
        source: 'MED',
        pmcid: 'PMC123',
        title: 'Europe PMC coating study',
        authorString: 'Eve Example',
        pubYear: '2023',
        journalTitle: 'Mock PMC Journal',
        doi: '10.1000/pmc.example',
        abstractText: 'Abstract about interface resistance.',
        isOpenAccess: 'Y',
      },
    ],
  },
};

const DOAJ_JSON = {
  results: [
    {
      id: 'doaj1',
      bibjson: {
        title: 'DOAJ open access coating study',
        author: [{ name: 'Frank Example' }],
        year: '2022',
        journal: { title: 'Mock OA Journal' },
        identifier: [{ type: 'doi', id: '10.1000/doaj.example' }],
        link: [{ type: 'fulltext', url: 'https://example.org/doaj' }],
        abstract: 'Open access abstract about cycling.',
      },
    },
  ],
};

const S2_JSON = {
  data: [
    {
      paperId: 's2-1',
      title: 'Semantic Scholar coating review',
      authors: [{ name: 'Grace Example' }],
      year: 2021,
      venue: 'Mock S2 Venue',
      abstract: 'Semantic abstract about interface.',
      externalIds: { DOI: '10.1000/s2.example' },
      openAccessPdf: { url: 'https://example.org/s2.pdf' },
      url: 'https://example.org/s2',
    },
  ],
};

function mockWeb() {
  return {
    async fetch({ url }) {
      if (url.includes('export.arxiv.org')) {
        return { statusCode: 200, body: { kind: 'text', content: ARXIV_XML } };
      }
      if (url.includes('api.openalex.org')) {
        if (url.includes('/works/https://doi.org/') || /\/works\/W\d+$/.test(url)) {
          return { statusCode: 200, body: { kind: 'text', content: JSON.stringify(DEEPEN_WORK) } };
        }
        if (url.includes('filter=cites:')) {
          return { statusCode: 200, body: { kind: 'text', content: JSON.stringify({ results: [DEEPEN_CITE] }) } };
        }
        if (url.includes('filter=openalex_id')) {
          return { statusCode: 200, body: { kind: 'text', content: JSON.stringify({ results: [DEEPEN_REF] }) } };
        }
        return { statusCode: 200, body: { kind: 'text', content: JSON.stringify(OPENALEX_JSON) } };
      }
      if (url.includes('api.crossref.org')) {
        return { statusCode: 200, body: { kind: 'text', content: JSON.stringify(CROSSREF_JSON) } };
      }
      if (url.includes('europepmc') || url.includes('ebi.ac.uk')) {
        return { statusCode: 200, body: { kind: 'text', content: JSON.stringify(EUROPEPMC_JSON) } };
      }
      if (url.includes('doaj.org')) {
        return { statusCode: 200, body: { kind: 'text', content: JSON.stringify(DOAJ_JSON) } };
      }
      if (url.includes('api.semanticscholar.org')) {
        return { statusCode: 200, body: { kind: 'text', content: JSON.stringify(S2_JSON) } };
      }
      throw new Error(`unexpected URL ${url}`);
    },
  };
}

let lastPrompt = '';

function mockLlm() {
  return {
    async listConfigurableProviders() {
      return [{ provider: 'mock', displayName: 'Mock' }];
    },
    async listModels() {
      return [{ id: 'mock-1', name: 'Mock 1' }];
    },
    stream(options) {
      const prompt = options.messages?.[0]?.content?.[0]?.text || '';
      lastPrompt = prompt;
      const isAnalysis = prompt.includes('【待分析内容');
      const isSuggestion = prompt.includes('科研 proposal') || (prompt.includes('请提出') && prompt.includes('实验建议'));
      const isPhrases = prompt.includes('Return 2-4 English phrases');
      const payload = isAnalysis
        ? ANALYSIS
        : isSuggestion
          ? SUGGESTIONS
          : isPhrases
            ? { phrases: ['coating'] }
            : REPORT;
      const text = JSON.stringify(payload);
      return (async function* stream() {
        await new Promise((resolve) => setTimeout(resolve, 25));
        for (let i = 0; i < text.length; i += 120) {
          yield { type: 'text-delta', index: 0, text: text.slice(i, i + 120) };
        }
        yield { type: 'finish', reason: { kind: 'stop' } };
      })();
    },
  };
}

function mockCtx({ withLlm }) {
  return {
    get(name) {
      if (name === 'llm' && withLlm) return mockLlm();
      if (name === 'web') return mockWeb();
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'mock', model: 'mock-1' }) };
      return undefined;
    },
  };
}

function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'rw-selftest-'));
}

async function waitJob(lab, taskId, timeoutMs = 5000) {
  const started = Date.now();
  for (;;) {
    const job = lab.exploreStatus({ taskId });
    if (job && job.status !== 'running') return job;
    if (Date.now() - started > timeoutMs) throw new Error(`job timeout: ${JSON.stringify(job)}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

async function runWithModel() {
  const dir = await tempDir();
  const lab = new ResearchLab(mockCtx({ withLlm: true }), { dataDir: dir });
  await lab.ready();

  const task = await lab.run('task.create', {
    title: '界面改性对固态电解质循环寿命的影响',
    objective: '评估界面改性对循环寿命的影响，并找出关键实验条件。',
    currentState: '已完成 3 组溅射厚度实验，1000 次循环保持率 82%；缺少对照与长循环数据。',
    field: '材料科学',
  });
  assert.ok(task.id);
  assert.ok(task.currentState.includes('82%'));

  const topic = await lab.run('topic.create', {
    taskId: task.id,
    title: '界面改性与循环寿命',
    question: '改性层如何影响容量保持率？',
  });
  assert.ok(topic.id);

  const source = await lab.run('source.create', {
    taskId: task.id,
    title: 'Interfacial modification of solid electrolytes',
    authors: 'Zhang, Y.; Li, X.',
    year: '2024',
    venue: 'Journal of Mock Materials',
    rawText:
      'Interfacial modification of solid electrolytes improves capacity retention. The ionic conductivity reached 1.2 mS/cm at room temperature. After 1000 cycles, capacity retention reached 82% with the modified interface. A limitation is that only one coating thickness was tested.',
  });
  assert.ok(source.id);
  assert.equal(source.status, 'ready');

  const job = await lab.run('explore.start', { taskId: task.id, sourceIds: [source.id] });
  assert.equal(job.status, 'running');

  // Add a source while the job is already running: the active loop must pick it up.
  const late = await lab.run('source.create', {
    taskId: task.id,
    title: 'Late-added source',
    rawText: 'We found that the late-added source reached 77% retention after 500 cycles.',
    autoExplore: true,
  });
  assert.ok(late.id);

  // Saved with autoExplore=false: the running job must NOT pull it in.
  const manual = await lab.run('source.create', {
    taskId: task.id,
    title: 'Save-only source',
    rawText: 'Save-only source with a measured value of 9.9 units.',
    autoExplore: false,
  });
  assert.ok(manual.id);

  const finished = await waitJob(lab, task.id);
  assert.equal(finished.status, 'done');
  assert.equal(finished.total, 2);
  assert.equal(finished.done, 2);

  const snapshot = await lab.run('state.get', {});
  const analyzed = snapshot.sources.find((row) => row.id === source.id);
  assert.equal(analyzed.status, 'analyzed');
  assert.equal(analyzed.analysis.mode, 'model');
  assert.ok(analyzed.analysis.summary.length > 10);
  assert.ok(snapshot.sources.find((row) => row.id === late.id).analysis, 'late source must be analyzed too');
  const savedOnly = snapshot.sources.find((row) => row.id === manual.id);
  assert.equal(savedOnly.analysis, null, 'save-only source must not be analyzed by a running job');
  assert.equal(savedOnly.status, 'ready');
  assert.ok(snapshot.extractions.length >= 2, 'auto extractions should include data points');
  assert.ok(snapshot.extractions.some((row) => row.kind === 'finding'), 'findings should be captured as data rows');
  assert.equal(snapshot.tasks[0].counts.analyzed, 2);

  // An explicit single-source request analyzes exactly that source.
  const secondJob = await lab.run('explore.start', { taskId: task.id, sourceIds: [manual.id] });
  assert.equal(secondJob.total, 1);
  await waitJob(lab, task.id);
  const afterManual = await lab.run('state.get', {});
  assert.ok(afterManual.sources.find((row) => row.id === manual.id).analysis);
  assert.equal(afterManual.tasks[0].counts.analyzed, 3);

  const edited = await lab.run('extraction.update', {
    extractionId: afterManual.extractions[0].id,
    value: '0.99',
    confidence: 'high',
  });
  assert.equal(edited.value, '0.99');
  assert.equal(edited.confidence, 'high');

  const generated = await lab.run('suggestion.generate', { taskId: task.id, count: 2 });
  assert.equal(generated.mode, 'model');
  assert.equal(generated.items.length, 2);
  assert.ok(generated.items[0].hypothesis);
  assert.ok(generated.items[0].design);
  assert.ok(Array.isArray(generated.items[0].citations));

  const withSuggestions = await lab.run('state.get', {});
  assert.equal(withSuggestions.tasks[0].counts.suggestions, 2);

  const secondBatch = await lab.run('suggestion.generate', { taskId: task.id, count: 2 });
  assert.equal(secondBatch.returned, 2);
  assert.notEqual(secondBatch.batchId, generated.batchId);
  const afterReplace = await lab.run('state.get', {});
  assert.equal(afterReplace.tasks[0].counts.suggestions, 2, 'generate replaces the previous batch by default');

  const removedSuggestion = await lab.run('suggestion.delete', { suggestionId: secondBatch.items[0].id });
  assert.equal(removedSuggestion.deleted, true);

  const report = await lab.run('report.compose', { taskId: task.id });
  assert.equal(report.mode, 'model');
  assert.ok(lastPrompt.includes('0.99'), 'edited evidence value must reach the report corpus');
  assert.ok(lastPrompt.includes('已有成果'), 'currentState must reach the report corpus');
  assert.ok(report.sections.length >= 3);
  assert.ok(report.markdown.includes('# '));
  assert.ok(report.references.length >= 1);
  assert.ok(report.markdown.includes('[1]'));

  const titled = await lab.run('report.compose', { taskId: task.id, title: '自定义标题' });
  assert.ok(titled.markdown.startsWith('# 自定义标题'), 'title override must reach the markdown export');

  const full = await lab.run('report.get', { reportId: report.id });
  assert.equal(full.id, report.id);

  await lab.run('task.delete', { taskId: task.id });
  const after = await lab.run('state.get', {});
  assert.equal(after.tasks.length, 0);
  assert.equal(after.sources.length, 0);
  assert.equal(after.extractions.length, 0);
  assert.equal(after.reports.length, 0);
  assert.equal(after.suggestions.length, 0);

  await fs.rm(dir, { recursive: true, force: true });
  return { mode: 'model', extractions: snapshot.extractions.length };
}

async function runDiscovery() {
  const dir = await tempDir();
  const lab = new ResearchLab(mockCtx({ withLlm: true }), { dataDir: dir });
  await lab.ready();
  const task = await lab.run('task.create', {
    title: 'Solid electrolyte interface',
    objective: 'Find open-access evidence on coating thickness and long-cycle stability.',
  });
  assert.deepEqual(task.channels, ['arxiv', 'openalex', 'crossref', 'europepmc', 'doaj', 'semanticscholar']);

  const discovery = await lab.run('source.discover', {
    taskId: task.id,
    channels: ['arxiv', 'openalex', 'crossref', 'europepmc', 'doaj', 'semanticscholar'],
    perProvider: 1,
  });
  if (discovery.added !== 6) console.error('discovery debug', JSON.stringify(discovery, null, 2));
  assert.equal(discovery.added, 6);
  assert.equal(discovery.errors.length, 0);
  assert.ok(discovery.job);
  assert.ok(discovery.query.includes('coating'));

  const finished = await waitJob(lab, task.id);
  assert.equal(finished.status, 'done');
  const snapshot = await lab.run('state.get', {});
  assert.equal(snapshot.sources.length, 6);
  assert.equal(snapshot.sources.filter((row) => row.analysis).length, 6);
  assert.ok(snapshot.sources.some((row) => row.provider === 'arxiv' && row.access === 'open'));
  assert.ok(snapshot.sources.some((row) => row.provider === 'openalex' && row.access === 'open'));
  assert.ok(snapshot.sources.some((row) => row.provider === 'crossref'));
  assert.ok(snapshot.sources.some((row) => row.provider === 'europepmc'));
  assert.ok(snapshot.sources.some((row) => row.provider === 'doaj'));
  assert.ok(snapshot.sources.some((row) => row.provider === 'semanticscholar'));

  const repeat = await lab.run('source.discover', {
    taskId: task.id,
    channels: ['arxiv', 'openalex', 'crossref', 'europepmc', 'doaj', 'semanticscholar'],
    perProvider: 1,
  });
  assert.equal(repeat.added, 0);
  assert.equal(repeat.skipped, 6);
  assert.equal(repeat.job, null);

  await lab.run('task.delete', { taskId: task.id });
  await fs.rm(dir, { recursive: true, force: true });
  return { mode: 'discovery', sources: snapshot.sources.length };
}

async function runDeepen() {
  const dir = await tempDir();
  const lab = new ResearchLab(mockCtx({ withLlm: true }), { dataDir: dir });
  await lab.ready();
  const task = await lab.run('task.create', {
    title: 'Citation snowball',
    objective: 'Find evidence on silent data corruption and quantization sensitivity.',
    experimentBrief: 'Only one A100 80GB; 20 GPU-hours per week.',
  });
  const seed = await lab.run('source.create', {
    taskId: task.id,
    title: 'Seed paper on silent data corruption',
    doi: '10.1000/seed',
    abstract: 'Seed abstract about silent data corruption and quantization.',
    autoExplore: true,
  });
  assert.ok(seed.job);
  assert.equal((await waitJob(lab, task.id)).status, 'done');

  const deepened = await lab.run('source.deepen', {
    taskId: task.id,
    sourceIds: [seed.id],
    perSource: 4,
  });
  assert.equal(deepened.added, 2);
  assert.equal(deepened.targets.length, 1);
  assert.ok(deepened.job);
  assert.equal((await waitJob(lab, task.id)).status, 'done');

  const snapshot = await lab.run('state.get', {});
  assert.equal(snapshot.sources.length, 3);
  assert.ok(snapshot.sources.some((row) => row.relation === 'reference' && row.parentSourceId === seed.id));
  assert.ok(snapshot.sources.some((row) => row.relation === 'citation' && row.parentSourceId === seed.id));
  assert.equal(snapshot.sources.filter((row) => row.analysis).length, 3);
  assert.equal(snapshot.tasks[0].experimentBrief, 'Only one A100 80GB; 20 GPU-hours per week.');

  const suggestions = await lab.run('suggestion.generate', {
    taskId: task.id,
    count: 1,
    experimentBrief: 'Only one A100 80GB; 20 GPU-hours per week.',
  });
  assert.equal(suggestions.returned, 1);
  assert.ok(lastPrompt.includes('A100'), 'experiment brief must reach the proposal prompt');

  await lab.run('task.delete', { taskId: task.id });
  await fs.rm(dir, { recursive: true, force: true });
  return { mode: 'deepen', sources: snapshot.sources.length };
}

async function runWithoutModel() {
  const dir = await tempDir();
  const lab = new ResearchLab(mockCtx({ withLlm: false }), { dataDir: dir });
  await lab.ready();
  const task = await lab.run('task.create', { title: '无模型回退测试', objective: '测试本地规则抽取。' });
  const source = await lab.run('source.create', {
    taskId: task.id,
    title: 'Heuristic paper',
    rawText:
      'We found that the treated sample reached 95% efficiency at 25 °C. The method used a two-step coating. A limitation is the small sample size. The measured conductivity was 3.4 mS/cm.',
    autoExplore: true,
  });
  assert.ok(source.job);
  const finished = await waitJob(lab, task.id);
  assert.equal(finished.status, 'done');
  const snapshot = await lab.run('state.get', {});
  const analyzed = snapshot.sources.find((row) => row.id === source.id);
  assert.equal(analyzed.analysis.mode, 'heuristic');
  assert.ok(analyzed.analysis.dataPoints.length >= 1);
  const suggestions = await lab.run('suggestion.generate', { taskId: task.id, count: 2 });
  assert.equal(suggestions.mode, 'fallback');
  assert.ok(suggestions.items.length >= 1);
  assert.ok(suggestions.items[0].title);
  const report = await lab.run('report.compose', { taskId: task.id });
  assert.equal(report.mode, 'fallback');
  assert.ok(report.markdown.length > 100);
  await fs.rm(dir, { recursive: true, force: true });
  return { mode: 'heuristic', extractions: snapshot.extractions.length };
}

const results = [];
results.push(await runWithModel());
results.push(await runDiscovery());
results.push(await runDeepen());
results.push(await runWithoutModel());
console.log(JSON.stringify({ ok: true, results }, null, 2));
