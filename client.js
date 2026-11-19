/**
 * Sci Sideband — browser half.
 *
 * Registers a sidebar panel icon and the matching keyed `main` panel, following
 * the same central-panel pattern as the host's built-in panels. Data travels over
 * the authenticated Connection fetch route registered by index.js:
 *   ctx.get('connection').rpc.call('/api', 'sci-sideband/call', { action, args })
 *
 * Plain AMD-style module, no build step: the platform supplies React.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sci-sideband',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useCallback, useRef } = React;

    const PANEL_ID = 'sci-sideband';
    const ENDPOINT = 'sci-sideband/call';
    const CHANNEL = '/api';
    const NS = 'sci-sideband';
    const DISCOVERY_CHANNELS = [
      { id: 'arxiv', label: 'arXiv', access: 'open' },
      { id: 'openalex', label: 'OpenAlex', access: 'open' },
      { id: 'crossref', label: 'Crossref', access: 'meta' },
      { id: 'europepmc', label: 'Europe PMC', access: 'open' },
      { id: 'doaj', label: 'DOAJ', access: 'open' },
      { id: 'semanticscholar', label: 'Semantic Scholar', access: 'open' },
    ];
    const DEFAULT_CHANNEL_IDS = DISCOVERY_CHANNELS.map((channel) => channel.id);

    /* ------------------------------------------------------------------ i18n */

    const ZH = {
      'panel.title': '科研探索边带',
      'panel.subtitle': '给出兴趣 · 自动发现源 · 沉淀证据 · 建议实验',
      'panel.refresh': '刷新',
      'panel.newTask': '新建科研项目',
      'panel.editTask': '编辑项目',
      'panel.model': '模型',
      'panel.modelUnknown': '模型待解析',
      'panel.modelUnavailable': '模型不可用',
      'panel.dataDir': '数据目录',
      'panel.noTask': '左侧还没有科研项目。新建一个项目，写下研究兴趣与已有成果；边带会从默认开放源自动发现相关论文并后台分析，不需要先拆题目。',
      'panel.loading': '正在读取科研边带…',
      'rail.tasks': '科研项目',
      'rail.new': '新建',
      'rail.empty': '还没有项目',
      'task.status.active': '进行中',
      'task.status.paused': '已暂停',
      'task.status.done': '已完成',
      'task.counts': '{sources} 内容 · {analyzed} 已分析 · {suggestions} 建议',
      'task.objectiveEmpty': '还没有写研究兴趣/目的。',
      'task.currentStateEmpty': '还没有记录已有成果/当前进展。',
      'task.edit': '编辑',
      'tabs.overview': '概览',
      'tabs.topics': '题目（可选）',
      'tabs.sources': '科研内容',
      'tabs.data': '证据与结果',
      'tabs.experiments': '实验建议',
      'tabs.reports': '综述论述',
      'common.add': '添加',
      'common.cancel': '取消',
      'common.save': '保存',
      'common.delete': '删除',
      'common.close': '关闭',
      'common.retry': '重试',
      'common.copy': '复制 Markdown',
      'common.copied': '已复制',
      'common.download': '下载 .md',
      'common.analyze': '开始分析',
      'common.reanalyze': '重新分析',
      'common.analyzing': '分析中…',
      'common.expand': '展开分析',
      'common.collapse': '收起',
      'common.optional': '可选',
      'common.none': '无',
      'common.loading': '加载中…',
      'common.confirm': '确认',
      'common.back': '返回',
      'common.viewAll': '查看全部',
      'status.new': '待探索',
      'status.fetching': '抓取中',
      'status.ready': '已就绪',
      'status.analyzing': '分析中',
      'status.analyzed': '已分析',
      'status.failed': '失败',
      'mode.model': '模型分析',
      'mode.heuristic': '本地规则',
      'mode.fallback': '规则兜底',
      'mode.evidence': '证据拼装',
      'relevance.high': '高',
      'relevance.medium': '中',
      'relevance.low': '低',
      'overview.objective': '研究兴趣 / 目的',
      'overview.currentState': '已有成果 / 当前进展',
      'overview.stats.topics': '题目',
      'overview.stats.sources': '科研内容',
      'overview.stats.analyzed': '已分析',
      'overview.stats.extractions': '证据',
      'overview.stats.suggestions': '实验建议',
      'overview.stats.reports': '综述',
      'overview.next': '下一步',
      'overview.nextTopics': '先拆题目：把研究兴趣拆成 2–5 个可回答的子问题。',
      'overview.nextSources': '添加科研内容：贴 URL、DOI，或直接粘贴原文。',
      'overview.nextDiscover': '给出研究兴趣后，直接点「从默认源发现并分析」，让边带自动检索 arXiv、OpenAlex、Crossref、Europe PMC、DOAJ、Semantic Scholar。',
      'overview.nextExplore': '运行后台探索：逐条抓取、分析并沉淀可核查证据。',
      'overview.nextExperiments': '证据够了：生成可执行的实验建议。',
      'overview.nextReport': '把证据组合成综述：一键生成连贯的研究论述。',
      'overview.topics': '题目',
      'overview.recent': '最近科研内容',
      'overview.empty': '这个任务还是空的。',
      'job.running': '后台探索进行中',
      'job.done': '本轮探索完成',
      'job.failed': '本轮探索失败',
      'job.interrupted': '上次探索被中断',
      'job.progress': '{done}/{total}',
      'job.current': '正在处理：{title}',
      'job.errors': '{n} 篇失败',
      'job.idle': '还没有运行过探索',
      'job.restart': '重新开始',
      'job.note': '分析在插件后台运行，关闭面板不会中断；完成后回到这里刷新即可。',
      'topics.hint': '把总目标拆成可回答的子问题。分析论文时会围绕这些题目提取证据。',
      'topics.addTitle': '题目名称',
      'topics.addQuestion': '这个题目要回答什么？',
      'topics.add': '添加题目',
      'topics.empty': '还没有题目。先加一个，分析会更有针对性。',
      'topics.status.open': '待研究',
      'topics.status.focus': '聚焦',
      'topics.status.done': '已覆盖',
      'topics.question': '待回答',
      'topics.deleteHint': '删除这个题目？',
      'sources.hint': '无需先拆题目。给出研究兴趣/目的后，可直接从默认开放源检索相关论文并加入科研内容，随后后台分析；也可以手动贴 URL/DOI 或粘贴原文。',
      'sources.discoverHint': '默认检索 arXiv、OpenAlex、Crossref、Europe PMC、DOAJ、Semantic Scholar。开放获取内容会抓取全文；付费墙期刊只取元数据/摘要，全文取决于是否开放。',
      'sources.discover': '从默认源发现并分析',
      'sources.discovering': '正在检索默认开放源…',
      'sources.channels': '默认检索源',
      'sources.discoverySummary': '发现 {added} 条，跳过 {skipped} 条重复；{errors} 个源失败。',
      'sources.discoveryEmpty': '没有发现新的可加入内容；可以换关键词、勾选更多源，或手动添加 URL/DOI。',
      'sources.autoDiscover': '创建后自动从默认源发现并分析',
      'sources.access.open': '开放全文',
      'sources.access.meta': '元数据/摘要',
      'sources.add': '添加科研内容',
      'sources.addTitle': '论文标题（留空则尝试从正文首行推断）',
      'sources.url': 'URL',
      'sources.doi': 'DOI',
      'sources.raw': '粘贴原文（论文 / 报告 / 项目页）',
      'sources.authors': '作者（用分号分隔）',
      'sources.year': '年份',
      'sources.venue': '期刊 / 会议',
      'sources.abstract': '摘要',
      'sources.type': '类型',
      'sources.auto': '加入后立即在后台探索',
      'sources.addOnly': '仅保存',
      'sources.empty': '还没有科研内容。',
      'sources.analyzeAll': '后台探索全部待分析文献',
      'sources.summary': '摘要与结论',
      'sources.methods': '方法',
      'sources.findings': '可引用结论',
      'sources.dataPoints': '提取的证据',
      'sources.limitations': '局限',
      'sources.relevance': '与本研究的相关性',
      'sources.noAnalysis': '还没有分析结果。',
      'sources.error': '上次失败原因',
      'sources.meta': '{authors} · {year} · {venue}',
      'sources.pasteHint': '如果 URL 需要登录或抓不到正文，直接把 PDF 里的正文粘贴到这里最可靠。',
      'sources.analyzeHint': '分析会调用当前模型；没有可用模型时自动退回本地规则抽取，并明确标注。',
      'sources.deleteHint': '删除这条科研内容及其证据？',
      'sources.progress': '{analyzed}/{total} 已分析',
      'sources.chars': '{n} 字符',
      'data.hint': '从已分析内容中沉淀的可核查证据（指标、结论、条件、引文），以及手工补充的记录。生成综述与实验建议时会把它们作为依据；这里不处理原始实验数据。',
      'data.add': '手工添加证据',
      'data.label': '指标 / 结论',
      'data.value': '数值',
      'data.unit': '单位',
      'data.context': '条件 / 上下文',
      'data.source': '来源文献',
      'data.confidence': '置信度',
      'data.kind': '类型',
      'data.empty': '还没有证据记录。运行一次后台探索，或手工添加。',
      'data.manual': '手工',
      'data.auto': '自动',
      'data.edited': '已人工修正',
      'data.deleteHint': '删除这条证据？',
      'data.kind.metric': '指标',
      'data.kind.finding': '结论',
      'data.kind.method': '方法',
      'data.kind.limitation': '局限',
      'data.kind.note': '备注',
      'data.edit': '编辑证据',
      'data.quote': '原文引文',
      'confidence.high': '高',
      'confidence.medium': '中',
      'confidence.low': '低',
      'reports.hint': '把研究兴趣、已有成果、已分析内容与证据组合成一篇连贯的综述论述。没有可用模型时会退回“证据拼装”模式，仍会生成可编辑的 Markdown。',
      'reports.generate': '生成综述论述',
      'reports.generating': '正在综合证据并撰写…',
      'reports.empty': '还没有生成过综述。',
      'reports.abstract': '摘要',
      'reports.keywords': '关键词',
      'reports.references': '参考文献',
      'reports.meta': '{sources} 条内容 · {points} 条证据 · {mode}',
      'reports.sourceCount': '{n} 条内容',
      'reports.dataCount': '{n} 条证据',
      'reports.mode.model': '模型撰写',
      'reports.mode.fallback': '证据拼装',
      'reports.selectHint': '点击一份综述查看全文。',
      'reports.deleteHint': '删除这份综述？',
      'reports.downloadName': '科研综述',
      'experiments.hint': '基于研究兴趣、已有成果和已分析内容，提出可检验的实验设计建议。边带只做设计建议，不执行实验、不处理原始实验数据。',
      'experiments.generate': '生成实验建议',
      'experiments.generating': '正在把证据转成实验设计…',
      'experiments.empty': '还没有实验建议。先完成内容分析，再生成一版设计建议。',
      'experiments.count': '生成数量',
      'experiments.priority.high': '高优先级',
      'experiments.priority.medium': '中优先级',
      'experiments.priority.low': '低优先级',
      'experiments.hypothesis': '待验证假设',
      'experiments.rationale': '依据',
      'experiments.design': '建议设计',
      'experiments.variables': '变量与对照',
      'experiments.independent': '自变量',
      'experiments.dependent': '因变量',
      'experiments.controls': '对照 / 混杂控制',
      'experiments.readouts': '读端指标',
      'experiments.risks': '风险与边界',
      'experiments.citations': '证据',
      'experiments.deleteHint': '删除这条实验建议？',
      'experiments.requiresEvidence': '先完成至少一条科研内容的分析，才能生成实验建议。',
      'experiments.note': '这些是设计建议，不是实验结果；执行前需人工论证、预注册与伦理审查。',
      'experiments.mode.template': '模板建议',
      'experiments.returned': '请求 {requested} 条，实际返回 {returned} 条。',
      'modal.createTask': '新建科研项目',
      'modal.editTask': '编辑科研项目',
      'modal.confirm': '请确认',
      'modal.deleteTask': '删除科研项目',
      'modal.deleteTaskHint': '删除这个项目及其全部题目、科研内容、证据、实验建议和综述？此操作不可撤销。',
      'form.title': '项目标题',
      'form.objective': '研究兴趣 / 核心问题',
      'form.currentState': '已有成果 / 当前进展',
      'form.currentStateHint': '记录已经做过的实验、已有数据、结论或资源限制；生成建议时会参考。',
      'form.field': '领域',
      'form.status': '状态',
      'form.hint': '研究兴趣写得越具体，后台提取与实验建议越有针对性。',
      'form.required': '此项必填',
      'errors.connection': '面板无法连接宿主：连接服务尚未就绪。请稍后刷新，或重启 Harness。',
      'errors.load': '读取科研库失败',
      'errors.loadHint': '请确认 Harness 仍在运行，然后重试；已保存的数据不会被清空。',
      'errors.action': '操作失败',
      'source.type.paper': '期刊论文',
      'source.type.preprint': '预印本',
      'source.type.report': '报告 / 白皮书',
      'source.type.dataset': '数据集',
      'source.type.project': '项目页 / 研究主页',
      'source.type.patent': '专利',
      'source.type.blog': '博客 / 技术文章',
      'source.type.other': '其他网页 / 内容',
    };

    const EN = {
      'panel.title': 'Sci Sideband',
      'panel.subtitle': 'Give an interest · auto-discover sources · capture evidence · suggest experiments',
      'panel.refresh': 'Refresh',
      'panel.newTask': 'New research project',
      'panel.editTask': 'Edit project',
      'panel.model': 'Model',
      'panel.modelUnknown': 'Model resolved on demand',
      'panel.modelUnavailable': 'Model unavailable',
      'panel.dataDir': 'Data folder',
      'panel.noTask': 'No research project yet. Create one with the interest and current results; the sideband discovers relevant papers from open sources and analyzes them in the background. No topics are needed.',
      'panel.loading': 'Reading the sideband…',
      'rail.tasks': 'Research projects',
      'rail.new': 'New',
      'rail.empty': 'No projects',
      'task.status.active': 'Active',
      'task.status.paused': 'Paused',
      'task.status.done': 'Done',
      'task.counts': '{sources} sources · {analyzed} analyzed · {suggestions} ideas',
      'task.objectiveEmpty': 'No objective yet.',
      'task.currentStateEmpty': 'No current results recorded yet.',
      'task.edit': 'Edit',
      'tabs.overview': 'Overview',
      'tabs.topics': 'Topics (optional)',
      'tabs.sources': 'Content',
      'tabs.data': 'Evidence',
      'tabs.experiments': 'Experiment ideas',
      'tabs.reports': 'Reviews',
      'common.add': 'Add',
      'common.cancel': 'Cancel',
      'common.save': 'Save',
      'common.delete': 'Delete',
      'common.close': 'Close',
      'common.retry': 'Retry',
      'common.copy': 'Copy Markdown',
      'common.copied': 'Copied',
      'common.download': 'Download .md',
      'common.analyze': 'Analyze',
      'common.reanalyze': 'Analyze again',
      'common.analyzing': 'Analyzing…',
      'common.expand': 'Show analysis',
      'common.collapse': 'Hide',
      'common.optional': 'optional',
      'common.none': 'None',
      'common.loading': 'Loading…',
      'common.confirm': 'Confirm',
      'common.back': 'Back',
      'common.viewAll': 'View all',
      'status.new': 'Pending',
      'status.fetching': 'Fetching',
      'status.ready': 'Ready',
      'status.analyzing': 'Analyzing',
      'status.analyzed': 'Analyzed',
      'status.failed': 'Failed',
      'mode.model': 'Model analysis',
      'mode.heuristic': 'Local rules',
      'mode.fallback': 'Rule fallback',
      'mode.evidence': 'Evidence assembly',
      'relevance.high': 'High',
      'relevance.medium': 'Medium',
      'relevance.low': 'Low',
      'overview.objective': 'Research interest / objective',
      'overview.currentState': 'Current results / progress',
      'overview.stats.topics': 'Topics',
      'overview.stats.sources': 'Content',
      'overview.stats.analyzed': 'Analyzed',
      'overview.stats.extractions': 'Evidence',
      'overview.stats.suggestions': 'Experiment ideas',
      'overview.stats.reports': 'Reviews',
      'overview.next': 'Next step',
      'overview.nextTopics': 'Split the interest into 2–5 answerable sub-questions.',
      'overview.nextSources': 'Add content: URL, DOI, or paste the source text.',
      'overview.nextDiscover': 'With the interest set, click “Discover and analyze” to search arXiv, OpenAlex, Crossref, Europe PMC, DOAJ, and Semantic Scholar automatically.',
      'overview.nextExplore': 'Run background exploration to fetch, analyze, and capture traceable evidence.',
      'overview.nextExperiments': 'Evidence is ready: generate actionable experiment suggestions.',
      'overview.nextReport': 'Synthesize the evidence into a coherent review article.',
      'overview.topics': 'Topics',
      'overview.recent': 'Recent content',
      'overview.empty': 'This task is empty.',
      'job.running': 'Background exploration running',
      'job.done': 'Exploration finished',
      'job.failed': 'Exploration failed',
      'job.interrupted': 'Exploration was interrupted',
      'job.progress': '{done}/{total}',
      'job.current': 'Working on: {title}',
      'job.errors': '{n} failed',
      'job.idle': 'No exploration has run yet',
      'job.restart': 'Run again',
      'job.note': 'Analysis runs in the plugin background; closing the panel does not stop it.',
      'topics.hint': 'Split the objective into answerable sub-questions. Source analysis extracts evidence against them.',
      'topics.addTitle': 'Topic title',
      'topics.addQuestion': 'What must this topic answer?',
      'topics.add': 'Add topic',
      'topics.empty': 'No topics yet. Add one to focus source analysis.',
      'topics.status.open': 'Open',
      'topics.status.focus': 'Focus',
      'topics.status.done': 'Covered',
      'topics.question': 'Question',
      'topics.deleteHint': 'Delete this topic?',
      'sources.hint': 'No topics are required. Give the research interest/objective and discover relevant papers from default open sources, or add a URL/DOI/pasted text manually.',
      'sources.discoverHint': 'Searches arXiv, OpenAlex, Crossref, Europe PMC, DOAJ, and Semantic Scholar. Open-access records may include full text; paywalled journals contribute metadata/abstract only.',
      'sources.discover': 'Discover and analyze',
      'sources.discovering': 'Searching default open sources…',
      'sources.channels': 'Discovery channels',
      'sources.discoverySummary': 'Found {added}, skipped {skipped} duplicates; {errors} sources failed.',
      'sources.discoveryEmpty': 'No new records were found. Try different keywords, more channels, or add a URL/DOI manually.',
      'sources.autoDiscover': 'Discover and analyze after creating the project',
      'sources.access.open': 'Open full text',
      'sources.access.meta': 'Metadata / abstract',
      'sources.add': 'Add content',
      'sources.addTitle': 'Paper title (leave blank to infer from the first line)',
      'sources.url': 'URL',
      'sources.doi': 'DOI',
      'sources.raw': 'Paste source text (paper / report / project page)',
      'sources.authors': 'Authors (separated by semicolons)',
      'sources.year': 'Year',
      'sources.venue': 'Journal / venue',
      'sources.abstract': 'Abstract',
      'sources.type': 'Type',
      'sources.auto': 'Start background exploration after adding',
      'sources.addOnly': 'Save only',
      'sources.empty': 'No content yet.',
      'sources.analyzeAll': 'Explore all pending sources',
      'sources.summary': 'Summary and findings',
      'sources.methods': 'Methods',
      'sources.findings': 'Citable findings',
      'sources.dataPoints': 'Captured evidence',
      'sources.limitations': 'Limitations',
      'sources.relevance': 'Relevance to this research',
      'sources.noAnalysis': 'No analysis yet.',
      'sources.error': 'Last failure',
      'sources.meta': '{authors} · {year} · {venue}',
      'sources.pasteHint': 'If the URL is behind a login or returns no body, paste the paper text here instead.',
      'sources.analyzeHint': 'Analysis uses the configured chat model; without one it falls back to local rules and labels the result.',
      'sources.deleteHint': 'Delete this content and its evidence?',
      'sources.progress': '{analyzed}/{total} analyzed',
      'sources.chars': '{n} chars',
      'data.hint': 'Traceable evidence captured from analyzed content (metrics, claims, conditions, quotes) plus manual notes. Reviews and experiment suggestions use it as evidence; raw experimental data is out of scope.',
      'data.add': 'Add evidence',
      'data.label': 'Metric / claim',
      'data.value': 'Value',
      'data.unit': 'Unit',
      'data.context': 'Condition / context',
      'data.source': 'Source paper',
      'data.confidence': 'Confidence',
      'data.kind': 'Kind',
      'data.empty': 'No evidence yet. Run exploration or add a row by hand.',
      'data.manual': 'Manual',
      'data.auto': 'Auto',
      'data.edited': 'Edited',
      'data.deleteHint': 'Delete this evidence row?',
      'data.kind.metric': 'Metric',
      'data.kind.finding': 'Finding',
      'data.kind.method': 'Method',
      'data.kind.limitation': 'Limitation',
      'data.kind.note': 'Note',
      'data.edit': 'Edit evidence',
      'data.quote': 'Verbatim quote',
      'confidence.high': 'High',
      'confidence.medium': 'Medium',
      'confidence.low': 'Low',
      'reports.hint': 'Combine the research interest, current results, analyzed content, and captured evidence into a coherent review article. Without a model it falls back to deterministic evidence assembly.',
      'reports.generate': 'Compose review article',
      'reports.generating': 'Synthesizing evidence and writing…',
      'reports.empty': 'No report has been generated yet.',
      'reports.abstract': 'Abstract',
      'reports.keywords': 'Keywords',
      'reports.references': 'References',
      'reports.meta': '{sources} sources · {points} evidence rows · {mode}',
      'reports.sourceCount': '{n} sources',
      'reports.dataCount': '{n} evidence rows',
      'reports.mode.model': 'model-written',
      'reports.mode.fallback': 'evidence assembly',
      'reports.selectHint': 'Select a review to read it.',
      'reports.deleteHint': 'Delete this review?',
      'reports.downloadName': 'research-review',
      'experiments.hint': 'Turn the research interest, current results, and analyzed content into testable experiment designs. The sideband only suggests designs; it does not run experiments or process raw experimental data.',
      'experiments.generate': 'Generate experiment ideas',
      'experiments.generating': 'Turning evidence into experiment designs…',
      'experiments.empty': 'No experiment suggestions yet. Analyze content first, then generate a set.',
      'experiments.count': 'How many',
      'experiments.priority.high': 'High priority',
      'experiments.priority.medium': 'Medium priority',
      'experiments.priority.low': 'Low priority',
      'experiments.hypothesis': 'Hypothesis to test',
      'experiments.rationale': 'Rationale',
      'experiments.design': 'Suggested design',
      'experiments.variables': 'Variables and controls',
      'experiments.independent': 'Independent',
      'experiments.dependent': 'Dependent',
      'experiments.controls': 'Controls / confounders',
      'experiments.readouts': 'Readouts',
      'experiments.risks': 'Risks and limits',
      'experiments.citations': 'Evidence',
      'experiments.deleteHint': 'Delete this experiment suggestion?',
      'experiments.requiresEvidence': 'Analyze at least one content source before generating experiment suggestions.',
      'experiments.note': 'These are design suggestions, not results. Validate, pre-register, and review ethics before running anything.',
      'experiments.mode.template': 'Template suggestion',
      'experiments.returned': 'Requested {requested}, received {returned}.',
      'modal.createTask': 'New research project',
      'modal.editTask': 'Edit research project',
      'modal.confirm': 'Please confirm',
      'modal.deleteTask': 'Delete research project',
      'modal.deleteTaskHint': 'Delete this project with all topics, content, evidence, experiment suggestions, and reviews? This cannot be undone.',
      'form.title': 'Project title',
      'form.objective': 'Research interest / core question',
      'form.currentState': 'Current results / progress',
      'form.currentStateHint': 'Record experiments already done, existing data, conclusions, or resource constraints; suggestions use this.',
      'form.field': 'Field',
      'form.status': 'Status',
      'form.hint': 'The more concrete the interest, the more targeted the extraction and experiment suggestions.',
      'form.required': 'Required',
      'errors.connection': 'The panel cannot reach the host: the connection service is not ready. Refresh later or restart Harness.',
      'errors.load': 'Failed to read the research library',
      'errors.loadHint': 'Make sure Harness is still running, then retry. Saved data is not cleared.',
      'errors.action': 'Action failed',
      'source.type.paper': 'Journal paper',
      'source.type.preprint': 'Preprint',
      'source.type.report': 'Report / white paper',
      'source.type.dataset': 'Dataset',
      'source.type.project': 'Project / lab page',
      'source.type.patent': 'Patent',
      'source.type.blog': 'Blog / technical post',
      'source.type.other': 'Other web content',
    };

    function makeT(ctx) {
      let bound = null;
      try {
        if (ctx.locale && typeof ctx.locale.register === 'function' && typeof ctx.locale.bind === 'function') {
          const register = (locale, dict) => {
            try {
              const dispose = ctx.locale.register(NS, locale, dict);
              if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
                ctx.effect(() => dispose, `sci-sideband locale ${locale}`);
              }
            } catch {
              /* already registered by a hot reload */
            }
          };
          register('zh', ZH);
          register('en', EN);
          bound = ctx.locale.bind(NS);
        }
      } catch {
        bound = null;
      }
      return (key, vars) => {
        let text;
        try {
          const value = bound ? bound(key) : '';
          text = value && value !== key ? value : ZH[key] || key;
        } catch {
          text = ZH[key] || key;
        }
        if (vars && typeof vars === 'object') {
          for (const [name, value] of Object.entries(vars)) {
            text = text.split(`{${name}}`).join(String(value));
          }
        }
        return text;
      };
    }

    /* ---------------------------------------------------------------- style */

    const CSS = `
.rw-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:"Noto Sans SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
.rw-root *{box-sizing:border-box}
.rw-root *:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}
.rw-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;background:var(--dsw-alias-bg-base)}
.rw-head__title{display:flex;align-items:center;gap:12px;min-width:0}
.rw-mark{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-brand-primary);flex:0 0 auto}
.rw-head h1{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.rw-head p{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.rw-head__actions{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}
.rw-body{display:flex;flex:1 1 auto;min-height:0}
.rw-rail{width:280px;flex:0 0 280px;border-right:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-base)}
.rw-rail__head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}
.rw-rail__list{flex:1 1 auto;overflow:auto;padding:0 8px 12px;display:flex;flex-direction:column;gap:4px}
.rw-task{appearance:none;text-align:left;font:inherit;color:inherit;background:transparent;border:1px solid transparent;border-radius:10px;padding:10px 10px 9px;cursor:pointer;display:flex;flex-direction:column;gap:4px;width:100%}
.rw-task:hover{background:var(--dsw-alias-bg-layer-1)}
.rw-task.is-active{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.rw-task__top{display:flex;align-items:center;gap:8px;min-width:0}
.rw-task__title{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto}
.rw-task__meta{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.rw-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-state-idle-primary)}
.rw-dot.is-running{background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.rw-dot.is-done{background:var(--dsw-alias-state-success-primary)}
.rw-dot.is-paused{background:var(--dsw-alias-state-warn-primary)}
.rw-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;min-height:0}
.rw-taskhead{padding:16px 24px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.rw-taskhead__row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.rw-taskhead h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em;line-height:1.35}
.rw-taskhead__objective{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;white-space:pre-wrap;max-width:900px}
.rw-tabs{display:flex;align-items:center;gap:4px;padding:0 24px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;overflow-x:auto}
.rw-tab{appearance:none;font:inherit;font-size:13px;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-bottom:2px solid transparent;padding:10px 10px 9px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px}
.rw-tab:hover{color:var(--dsw-alias-label-primary)}
.rw-tab.is-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.rw-count{font-size:11px;line-height:1;padding:2px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.rw-content{flex:1 1 auto;overflow:auto;padding:20px 24px 48px;min-height:0}
.rw-section{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.rw-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;max-width:900px}
.rw-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px}
.rw-card--tight{padding:12px 14px}
.rw-card__title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px;font-size:13px;font-weight:600}
.rw-btn{appearance:none;font:inherit;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:8px 12px;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease}
.rw-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.rw-btn:disabled{opacity:.5;cursor:not-allowed}
.rw-btn--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.rw-btn--primary:hover{filter:brightness(1.05)}
.rw-btn--ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.rw-btn--ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.rw-btn--danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,var(--dsw-alias-border-l1))}
.rw-btn--small{padding:5px 8px;font-size:12px;border-radius:7px}
.rw-btn--block{width:100%}
.rw-iconbtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.rw-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.rw-input,.rw-textarea,.rw-select{width:100%;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;line-height:1.5}
.rw-textarea{resize:vertical;min-height:84px}
.rw-input::placeholder,.rw-textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.75}
.rw-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.rw-field__label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.rw-field__label em{font-style:normal;font-weight:400;opacity:.8}
.rw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.rw-grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}
.rw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rw-row--end{justify-content:flex-end}
.rw-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.rw-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px}
.rw-stat b{display:block;font-size:22px;line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.rw-stat span{display:block;font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.rw-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:1;padding:3px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.rw-chip--ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,var(--dsw-alias-border-l1))}
.rw-chip--warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,var(--dsw-alias-border-l1))}
.rw-chip--err{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,var(--dsw-alias-border-l1))}
.rw-chip--brand{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l1))}
.rw-list{display:flex;flex-direction:column;gap:8px}
.rw-item{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.rw-item__top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
.rw-item__title{font-weight:600;font-size:13px;min-width:0;overflow-wrap:anywhere}
.rw-item__meta{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.rw-item__body{font-size:13px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.rw-quote{margin:0;padding:8px 10px;border-left:2px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:0 6px 6px 0;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.rw-table{width:100%;border-collapse:collapse;font-size:13px}
.rw-table th,.rw-table td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top}
.rw-table th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary);font-weight:600;background:var(--dsw-alias-bg-layer-2)}
.rw-table tr:last-child td{border-bottom:0}
.rw-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:28px 20px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}
.rw-progress{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin:8px 0 4px}
.rw-progress>i{display:block;height:100%;background:var(--dsw-alias-brand-primary);border-radius:999px;transition:width .3s ease}
.rw-error{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary);border-radius:10px;padding:10px 12px;font-size:12px}
.rw-busy{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);padding:6px 24px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.rw-spin{width:13px;height:13px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;display:inline-block;animation:rw-spin .8s linear infinite;flex:0 0 auto}
@keyframes rw-spin{to{transform:rotate(360deg)}}
.rw-modal{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px}
.rw-modal__card{width:min(600px,100%);max-height:min(86vh,820px);overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.28);display:flex;flex-direction:column}
.rw-modal__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.rw-modal__head h3{margin:0;font-size:15px;font-weight:600}
.rw-modal__body{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.rw-modal__foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px;border-top:1px solid var(--dsw-alias-border-l1)}
.rw-report{display:flex;flex-direction:column;gap:14px;max-width:900px}
.rw-report h2{margin:0;font-size:20px;line-height:1.35;letter-spacing:-.01em}
.rw-report h3{margin:0;font-size:15px;font-weight:600}
.rw-report p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.rw-report__sections{display:flex;flex-direction:column;gap:14px}
.rw-report__section{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.rw-meta{font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rw-kv{display:flex;flex-wrap:wrap;gap:6px}
.rw-divider{height:1px;background:var(--dsw-alias-border-l1);margin:2px 0}
.rw-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
.rw-mono{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:12px}
.rw-link{color:var(--dsw-alias-brand-primary);text-decoration:none;overflow-wrap:anywhere}
.rw-link:hover{text-decoration:underline}
.rw-reportlist{display:flex;flex-direction:column;gap:6px}
.rw-reportrow{appearance:none;font:inherit;text-align:left;color:inherit;background:transparent;border:1px solid transparent;border-radius:9px;padding:9px 10px;cursor:pointer;display:flex;flex-direction:column;gap:3px}
.rw-reportrow:hover{background:var(--dsw-alias-bg-layer-2)}
.rw-reportrow.is-active{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
@media (max-width:900px){
  .rw-stats{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rw-grid,.rw-grid--3{grid-template-columns:1fr}
  .rw-head{padding:12px 16px}
}
@media (max-width:820px){
  .rw-body{flex-direction:column}
  .rw-rail{width:auto;flex:0 0 auto;max-height:190px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}
  .rw-content{padding:16px}
  .rw-taskhead,.rw-tabs,.rw-head{padding-left:16px;padding-right:16px}
}
`;

    /* ------------------------------------------------------------- utilities */

    function cls(...values) {
      return values.filter(Boolean).join(' ');
    }

    function messageOf(error) {
      if (!error) return '';
      if (typeof error === 'string') return error;
      return String(error.message || error);
    }

    function fmtTime(value) {
      if (!value) return '';
      const text = String(value);
      return text.replace('T', ' ').slice(0, 16);
    }

    function safeName(title) {
      return String(title || 'report').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'report';
    }

    function suggestionModeLabel(t, mode) {
      return mode === 'model' ? t('mode.model') : t('experiments.mode.template');
    }

    function createCall(ctx, t) {
      return async function call(action, args) {
        const connection = ctx && typeof ctx.get === 'function' ? ctx.get('connection') : ctx && ctx.connection;
        const rpc = connection && connection.rpc;
        if (!rpc || typeof rpc.call !== 'function') {
          throw new Error(t('errors.connection'));
        }
        let result;
        try {
          result = await rpc.call(CHANNEL, ENDPOINT, { action, args: args || {} });
        } catch (error) {
          throw new Error(messageOf(error) || `action failed: ${action}`);
        }
        if (!result || typeof result !== 'object') throw new Error('host returned no result');
        if (result.ok !== true) {
          const failure = result.error || {};
          throw new Error(failure.message || `action failed: ${action}`);
        }
        return result.value;
      };
    }

    function statusTone(status) {
      if (status === 'analyzed') return 'ok';
      if (status === 'failed' || status === 'interrupted') return 'err';
      if (status === 'analyzing' || status === 'fetching' || status === 'ready') return 'warn';
      if (status === 'running') return 'brand';
      return '';
    }

    function analysisModeLabel(t, mode) {
      if (mode === 'model') return t('mode.model');
      if (mode === 'heuristic') return t('mode.heuristic');
      if (mode === 'heuristic-fallback') return t('mode.fallback');
      if (mode === 'fallback') return t('mode.evidence');
      if (mode === 'manual' || !mode) return t('data.manual');
      return mode;
    }

    /* ---------------------------------------------------------------- icons */

    function Icon({ name, size = 16 }) {
      const paths = {
        plus: ['M8 3v10M3 8h10'],
        refresh: ['M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3'],
        trash: ['M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4', 'M6.8 6.5v4M9.2 6.5v4'],
        edit: ['M3 13h2l7-7-2-2-7 7v2Z', 'M9.5 5.5l1 1'],
        close: ['M4 4l8 8M12 4l-8 8'],
        play: ['M5 3l8 5-8 5V3Z'],
        doc: ['M4 2h5l3 3v9H4V2Z', 'M9 2v3h3', 'M6 8h4M6 10h4'],
        copy: ['M6 5V3h7v7h-2', 'M3 6h7v7H3V6Z'],
        download: ['M8 2v8M5 7l3 3 3-3', 'M3 13h10'],
        chevron: ['M4 6l4 4 4-4'],
        check: ['M3 8l3 3 7-7'],
        spark: ['M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2'],
        search: ['M7 2a5 5 0 1 0 0 10A5 5 0 0 0 7 2Z', 'M10.5 10.5L14 14'],
        flask: ['M6 2h4', 'M6.5 2v4.2L3.6 12a1.4 1.4 0 0 0 1.2 2h6.4a1.4 1.4 0 0 0 1.2-2L9.5 6.2V2', 'M5 10h6'],
        chevronRight: ['M6 4l4 4-4 4'],
        alert: ['M8 2l6 11H2L8 2Z', 'M8 6v3M8 11v.5'],
      };
      const data = paths[name] || paths.doc;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block', flex: '0 0 auto' },
        },
        data.map((d, index) => h('path', { key: index, d })),
      );
    }

    function PanelIcon({ size = 20 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        [
          h('path', { key: 'a', d: 'M6 3h6l4 4v14H6V3Z' }),
          h('path', { key: 'b', d: 'M12 3v4h4' }),
          h('path', { key: 'c', d: 'M9 12h4M9 15h6' }),
          h('circle', { key: 'd', cx: 16.5, cy: 16.5, r: 2.5 }),
          h('path', { key: 'e', d: 'M16.5 14v-1.5M16.5 19v1.5M18.5 16.5H20M13 16.5h-1.5' }),
        ],
      );
    }

    function Btn({ children, variant, size, onClick, disabled, title, type = 'button', style }) {
      return h(
        'button',
        {
          type,
          className: cls('rw-btn', variant && `rw-btn--${variant}`, size && `rw-btn--${size}`),
          onClick,
          disabled,
          title,
          style,
        },
        children,
      );
    }

    function Chip({ tone, children }) {
      return h('span', { className: cls('rw-chip', tone && `rw-chip--${tone}`) }, children);
    }

    function Spinner() {
      return h('span', { className: 'rw-spin', 'aria-hidden': 'true' });
    }

    function Field({ label, hint, children }) {
      return h(
        'label',
        { className: 'rw-field' },
        h('span', { className: 'rw-field__label' }, label, hint ? h('em', null, ` ${hint}`) : null),
        children,
      );
    }

    function Modal({ title, children, footer, onClose }) {
      const cardRef = useRef(null);
      const closeRef = useRef(onClose);
      closeRef.current = onClose;

      useEffect(() => {
        const previous = document.activeElement;
        const card = cardRef.current;
        const focusables = () =>
          card
            ? Array.from(
                card.querySelectorAll(
                  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
                ),
              )
            : [];
        const first = focusables()[0];
        const preferred = (card && card.querySelector('input,textarea,select')) || first;
        if (preferred) preferred.focus();
        const handler = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeRef.current();
            return;
          }
          if (event.key !== 'Tab') return;
          const items = focusables();
          if (!items.length) return;
          const firstItem = items[0];
          const lastItem = items[items.length - 1];
          if (event.shiftKey && document.activeElement === firstItem) {
            event.preventDefault();
            lastItem.focus();
          } else if (!event.shiftKey && document.activeElement === lastItem) {
            event.preventDefault();
            firstItem.focus();
          }
        };
        window.addEventListener('keydown', handler);
        return () => {
          window.removeEventListener('keydown', handler);
          if (previous && typeof previous.focus === 'function') previous.focus();
        };
      }, []);

      return h(
        'div',
        {
          className: 'rw-modal',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': title,
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'rw-modal__card', ref: cardRef },
          h(
            'div',
            { className: 'rw-modal__head' },
            h('h3', null, title),
            h('button', { type: 'button', className: 'rw-iconbtn', onClick: onClose, 'aria-label': 'Close' }, h(Icon, { name: 'close' })),
          ),
          h('div', { className: 'rw-modal__body' }, children),
          footer ? h('div', { className: 'rw-modal__foot' }, footer) : null,
        ),
      );
    }

    function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, t }) {
      return h(
        Modal,
        {
          title,
          onClose,
          footer: [
            h(Btn, { key: 'c', onClick: onClose }, t('common.cancel')),
            h(Btn, { key: 'd', variant: 'danger', onClick: onConfirm }, confirmLabel || t('common.delete')),
          ],
        },
        h('p', { className: 'rw-item__body' }, message),
      );
    }

    function Empty({ title, hint, action }) {
      return h(
        'div',
        { className: 'rw-empty' },
        h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 4 } }, title),
        hint ? h('div', null, hint) : null,
        action ? h('div', { style: { marginTop: 12 } }, action) : null,
      );
    }

    function StatusChip({ status, t }) {
      return h(Chip, { tone: statusTone(status) }, t(`status.${status}`) || status);
    }

    function JobBanner({ job, t }) {
      if (!job || !job.status) return null;
      const total = Number(job.total) || 0;
      const done = Number(job.done) || 0;
      const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
      const tone = job.status === 'running' ? 'brand' : job.status === 'failed' ? 'err' : job.status === 'interrupted' ? 'warn' : 'ok';
      const label = t(`job.${job.status}`) || job.status;
      return h(
        'div',
        { className: 'rw-card rw-card--tight', role: 'status', 'aria-live': 'polite' },
        h(
          'div',
          { className: 'rw-row' },
          h(Chip, { tone }, job.status === 'running' ? h(Spinner) : null, label),
          total ? h('span', { className: 'rw-sub' }, t('job.progress', { done, total })) : null,
          job.errors && job.errors.length ? h(Chip, { tone: 'err' }, t('job.errors', { n: job.errors.length })) : null,
        ),
        total
          ? h(
              'div',
              {
                className: 'rw-progress',
                role: 'progressbar',
                'aria-valuemin': 0,
                'aria-valuemax': total,
                'aria-valuenow': done,
              },
              h('i', { style: { width: `${percent}%` } }),
            )
          : null,
        job.currentTitle ? h('div', { className: 'rw-sub' }, t('job.current', { title: job.currentTitle })) : null,
        job.status === 'running' ? h('div', { className: 'rw-sub', style: { marginTop: 4 } }, t('job.note')) : null,
        job.note ? h('div', { className: 'rw-sub', style: { marginTop: 4 } }, job.note) : null,
        job.errors && job.errors.length
          ? h(
              'ul',
              { className: 'rw-sub', style: { margin: '6px 0 0', paddingLeft: 18 } },
              job.errors.slice(-4).map((row, index) => h('li', { key: index }, `${row.title || row.sourceId || ''} ${row.message}`.trim())),
            )
          : null,
      );
    }

    /* ------------------------------------------------------------- task form */

    function TaskDialog({ mode, task, onClose, onSubmit, t }) {
      const [title, setTitle] = useState(task ? task.title : '');
      const [objective, setObjective] = useState(task ? task.objective : '');
      const [currentState, setCurrentState] = useState(task ? task.currentState : '');
      const [field, setField] = useState(task ? task.field : '');
      const [status, setStatus] = useState(task ? task.status : 'active');
      const [autoDiscover, setAutoDiscover] = useState(mode !== 'edit');
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState('');

      const submit = async () => {
        if (!title.trim()) {
          setError(t('form.required'));
          return;
        }
        setSaving(true);
        setError('');
        try {
          const value = await onSubmit({ title, objective, currentState, field, status, autoDiscover });
          if (value) onClose();
        } catch (failure) {
          setError(messageOf(failure));
        } finally {
          setSaving(false);
        }
      };

      return h(
        Modal,
        {
          title: mode === 'edit' ? t('modal.editTask') : t('modal.createTask'),
          onClose,
          footer: [
            h(Btn, { key: 'c', onClick: onClose }, t('common.cancel')),
            h(Btn, { key: 's', variant: 'primary', onClick: submit, disabled: saving }, saving ? t('common.loading') : t('common.save')),
          ],
        },
        error ? h('div', { className: 'rw-error' }, error) : null,
        h(Field, { label: t('form.title') }, h('input', { className: 'rw-input', value: title, onChange: (e) => setTitle(e.target.value), autoFocus: true })),
        h(
          Field,
          { label: t('form.objective'), hint: t('form.hint') },
          h('textarea', {
            className: 'rw-textarea',
            rows: 5,
            value: objective,
            onChange: (e) => setObjective(e.target.value),
            placeholder: '例如：固态电解质界面改性对循环寿命的影响；想找到可复现的关键条件。',
          }),
        ),
        h(
          Field,
          { label: t('form.currentState'), hint: t('form.currentStateHint') },
          h('textarea', {
            className: 'rw-textarea',
            rows: 4,
            value: currentState,
            onChange: (e) => setCurrentState(e.target.value),
            placeholder: '例如：已完成 3 组溅射厚度实验，1000 次循环保持率 82%；缺少对照与长循环数据。',
          }),
        ),
        mode !== 'edit'
          ? h(
              'label',
              { className: 'rw-row', style: { cursor: 'pointer', marginTop: 2 } },
              h('input', { type: 'checkbox', checked: autoDiscover, onChange: (e) => setAutoDiscover(e.target.checked) }),
              h('span', { className: 'rw-sub' }, t('sources.autoDiscover')),
            )
          : null,
        h(
          'div',
          { className: 'rw-grid' },
          h(Field, { label: t('form.field') }, h('input', { className: 'rw-input', value: field, onChange: (e) => setField(e.target.value) })),
          h(
            Field,
            { label: t('form.status') },
            h(
              'select',
              { className: 'rw-select', value: status, onChange: (e) => setStatus(e.target.value) },
              ['active', 'paused', 'done'].map((value) => h('option', { key: value, value }, t(`task.status.${value}`))),
            ),
          ),
        ),
      );
    }

    /* ---------------------------------------------------------------- panel */

    function Panel({ ctx, t }) {
      const call = useMemo(() => createCall(ctx, t), [ctx, t]);
      const [snap, setSnap] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      const [busy, setBusy] = useState('');
      const [taskId, setTaskId] = useState(null);
      const [tab, setTab] = useState('overview');
      const [dialog, setDialog] = useState(null);
      const [confirm, setConfirm] = useState(null);
      const [llmStatus, setLlmStatus] = useState(null);
      const pollFailures = useRef(0);

      const refresh = useCallback(async () => {
        const next = await call('state.get');
        setSnap(next);
        setTaskId((current) => {
          if (current && next.tasks.some((task) => task.id === current)) return current;
          return next.tasks[0] ? next.tasks[0].id : null;
        });
        return next;
      }, [call]);

      const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
          await refresh();
        } catch (failure) {
          setError(messageOf(failure));
        } finally {
          setLoading(false);
        }
      }, [refresh]);

      useEffect(() => {
        void load();
      }, [load]);

      useEffect(() => {
        let alive = true;
        call('llm.status')
          .then((value) => {
            if (alive) setLlmStatus(value);
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [call]);

      const task = snap && taskId ? snap.tasks.find((row) => row.id === taskId) || null : null;
      const job = task && snap && snap.jobs ? snap.jobs[task.id] : null;

      useEffect(() => {
        if (!job || job.status !== 'running') return undefined;
        const timer = setInterval(() => {
          refresh()
            .then(() => {
              if (pollFailures.current > 0) {
                pollFailures.current = 0;
                setError('');
              }
            })
            .catch((failure) => {
              pollFailures.current += 1;
              if (pollFailures.current >= 2) setError(messageOf(failure));
            });
        }, 2200);
        return () => clearInterval(timer);
      }, [job && job.status, job && job.done, refresh]);

      const attempt = useCallback(
        async (label, operation) => {
          setBusy(label);
          setError('');
          try {
            const value = await operation();
            await refresh();
            return value;
          } catch (failure) {
            const message = messageOf(failure);
            setError(message);
            throw new Error(message);
          } finally {
            setBusy('');
          }
        },
        [refresh],
      );

      const run = useCallback(
        async (label, operation) => {
          try {
            return await attempt(label, operation);
          } catch {
            return undefined;
          }
        },
        [attempt],
      );

      const onCreateTask = useCallback(
        async (fields) => {
          const created = await attempt(t('common.save'), () =>
            call('task.create', {
              title: fields.title,
              objective: fields.objective,
              currentState: fields.currentState,
              field: fields.field,
              status: fields.status,
            }),
          );
          if (created && fields.autoDiscover) {
            void run(t('sources.discovering'), () => call('source.discover', { taskId: created.id }));
          }
          return created;
        },
        [attempt, run, call, t],
      );

      const onUpdateTask = useCallback(
        (fields) =>
          attempt(t('common.save'), () =>
            call('task.update', {
              taskId: task.id,
              title: fields.title,
              objective: fields.objective,
              currentState: fields.currentState,
              field: fields.field,
              status: fields.status,
            }),
          ),
        [attempt, call, task, t],
      );

      const onDeleteTask = useCallback(() => {
        setConfirm({
          title: t('modal.deleteTask'),
          message: t('modal.deleteTaskHint'),
          onConfirm: async () => {
            setConfirm(null);
            await run(t('common.delete'), () => call('task.delete', { taskId: task.id }));
          },
        });
      }, [call, run, task, t]);

      if (loading) {
        return h(
          'div',
          { className: 'rw-root' },
          h('style', null, CSS),
          h('div', { className: 'rw-empty', style: { margin: 'auto' } }, h(Spinner), ' ', t('panel.loading')),
        );
      }

      if (!snap) {
        return h(
          'div',
          { className: 'rw-root' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'rw-empty', style: { margin: 'auto', maxWidth: 520 }, role: 'alert' },
            h(Icon, { name: 'alert', size: 22 }),
            h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', margin: '8px 0 4px' } }, error || t('errors.load')),
            h('div', null, t('errors.loadHint')),
            h('div', { style: { marginTop: 12 } }, h(Btn, { variant: 'primary', onClick: load }, h(Icon, { name: 'refresh', size: 14 }), t('common.retry'))),
          ),
        );
      }

      const modelInfo = llmStatus || snap.llm || null;
      const tabs = [
        ['overview', 'tabs.overview', null],
        ['sources', 'tabs.sources', task ? task.counts.sources : 0],
        ['data', 'tabs.data', task ? task.counts.extractions : 0],
        ['experiments', 'tabs.experiments', task ? task.counts.suggestions : 0],
        ['reports', 'tabs.reports', task ? task.counts.reports : 0],
      ];

      return h(
        'div',
        { className: 'rw-root' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'rw-head' },
          h(
            'div',
            { className: 'rw-head__title' },
            h('div', { className: 'rw-mark' }, h(PanelIcon, { size: 19 })),
            h('div', null, h('h1', null, t('panel.title')), h('p', null, t('panel.subtitle'))),
          ),
          h(
            'div',
            { className: 'rw-head__actions' },
            h(
              Chip,
              {
                tone: modelInfo && modelInfo.available ? 'brand' : '',
                title: (modelInfo && modelInfo.reason) || '',
              },
              modelInfo && modelInfo.available
                ? `${modelInfo.provider}/${modelInfo.model}`
                : modelInfo && modelInfo.reason
                  ? t('panel.modelUnavailable')
                  : t('panel.modelUnknown'),
            ),
            h(
              Btn,
              {
                size: 'small',
                onClick: load,
              },
              h(Icon, { name: 'refresh', size: 14 }),
              t('panel.refresh'),
            ),
            h(Btn, { variant: 'primary', size: 'small', onClick: () => setDialog({ type: 'create' }) }, h(Icon, { name: 'plus', size: 14 }), t('panel.newTask')),
          ),
        ),
        busy
          ? h('div', { className: 'rw-busy', role: 'status', 'aria-live': 'polite' }, h(Spinner), busy)
          : null,
        error
          ? h(
              'div',
              { className: 'rw-busy', role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)' } },
              h(Icon, { name: 'alert', size: 14 }),
              h('span', { style: { flex: '1 1 auto' } }, error),
              h('button', { type: 'button', className: 'rw-iconbtn', onClick: () => setError(''), 'aria-label': t('common.close') }, h(Icon, { name: 'close', size: 13 })),
            )
          : null,
        h(
          'div',
          { className: 'rw-body' },
          h(
            'aside',
            { className: 'rw-rail' },
            h(
              'div',
              { className: 'rw-rail__head' },
              h('span', null, t('rail.tasks')),
              h('button', { type: 'button', className: 'rw-iconbtn', title: t('rail.new'), 'aria-label': t('rail.new'), onClick: () => setDialog({ type: 'create' }) }, h(Icon, { name: 'plus', size: 15 })),
            ),
            h(
              'div',
              { className: 'rw-rail__list' },
              snap && snap.tasks.length
                ? snap.tasks.map((row) =>
                    h(
                      'button',
                      {
                        key: row.id,
                        type: 'button',
                        className: cls('rw-task', row.id === taskId && 'is-active'),
                        onClick: () => setTaskId(row.id),
                      },
                      h(
                        'span',
                        { className: 'rw-task__top' },
                        h('span', {
                          className: cls(
                            'rw-dot',
                            row.job && row.job.status === 'running' && 'is-running',
                            row.status === 'done' && 'is-done',
                            row.status === 'paused' && 'is-paused',
                          ),
                        }),
                        h('span', { className: 'rw-task__title' }, row.title),
                      ),
                      h(
                        'span',
                        { className: 'rw-task__meta' },
                        t('task.counts', {
                          topics: row.counts.topics,
                          sources: row.counts.sources,
                          analyzed: row.counts.withAnalysis ?? row.counts.analyzed,
                          suggestions: row.counts.suggestions,
                        }),
                      ),
                    ),
                  )
                : h('div', { className: 'rw-sub', style: { padding: '12px 10px' } }, t('rail.empty')),
            ),
          ),
          h(
            'div',
            { className: 'rw-main' },
            task
              ? [
                  h(
                    'div',
                    { key: 'head', className: 'rw-taskhead' },
                    h(
                      'div',
                      { className: 'rw-taskhead__row' },
                      h(
                        'div',
                        { style: { minWidth: 0 } },
                        h(
                          'div',
                          { className: 'rw-row' },
                          h('h2', null, task.title),
                          h(Chip, { tone: task.status === 'done' ? 'ok' : task.status === 'paused' ? 'warn' : 'brand' }, t(`task.status.${task.status}`)),
                          h(
                            'button',
                            { type: 'button', className: 'rw-iconbtn', title: t('task.edit'), 'aria-label': t('task.edit'), onClick: () => setDialog({ type: 'edit', task }) },
                            h(Icon, { name: 'edit', size: 14 }),
                          ),
                        ),
                        h('p', { className: 'rw-taskhead__objective' }, task.objective || t('task.objectiveEmpty')),
                      ),
                      h(
                        'div',
                        { className: 'rw-row' },
                        h(Btn, { size: 'small', variant: 'ghost', onClick: onDeleteTask }, h(Icon, { name: 'trash', size: 14 }), t('common.delete')),
                      ),
                    ),
                  ),
                  h(
                    'nav',
                    { key: 'tabs', className: 'rw-tabs', role: 'tablist' },
                    tabs.map(([id, label, count]) =>
                      h(
                        'button',
                        {
                          key: id,
                          type: 'button',
                          role: 'tab',
                          id: `rw-tab-${id}`,
                          'aria-controls': `rw-panel-${id}`,
                          'aria-selected': tab === id,
                          className: cls('rw-tab', tab === id && 'is-active'),
                          onClick: () => setTab(id),
                        },
                        t(label),
                        count ? h('span', { className: 'rw-count' }, count) : null,
                      ),
                    ),
                  ),
                  h(
                    'div',
                    { key: 'content', className: 'rw-content', id: `rw-panel-${tab}`, role: 'tabpanel', 'aria-labelledby': `rw-tab-${tab}` },
                    tab === 'overview'
                      ? h(Overview, { key: task.id, task, snap, job, t, onTab: setTab, onNewTask: () => setDialog({ type: 'create' }) })
                      : tab === 'sources'
                        ? h(SourcesView, { key: task.id, task, snap, job, call, run, attempt, t })
                        : tab === 'data'
                          ? h(DataView, { key: task.id, task, snap, call, run, attempt, t })
                          : tab === 'experiments'
                            ? h(ExperimentsView, { key: task.id, task, snap, call, run, t })
                            : h(ReportsView, { key: task.id, task, snap, call, run, t }),
                  ),
                ]
              : h(
                  'div',
                  { className: 'rw-content' },
                  h(
                    Empty,
                    {
                      title: t('panel.noTask'),
                      action: h(Btn, { variant: 'primary', onClick: () => setDialog({ type: 'create' }) }, t('panel.newTask')),
                    },
                  ),
                ),
          ),
        ),
        dialog
          ? h(TaskDialog, {
              mode: dialog.type,
              task: dialog.task || null,
              t,
              onClose: () => setDialog(null),
              onSubmit: dialog.type === 'edit' ? onUpdateTask : onCreateTask,
            })
          : null,
        confirm
          ? h(ConfirmModal, {
              title: confirm.title,
              message: confirm.message,
              onConfirm: confirm.onConfirm,
              onClose: () => setConfirm(null),
              t,
            })
          : null,
      );
    }

    /* ------------------------------------------------------------- overview */

    function Overview({ task, snap, job, t, onTab }) {
      const sources = snap.sources.filter((row) => row.taskId === task.id);
      const analyzedCount = task.counts.withAnalysis ?? task.counts.analyzed;
      const next = !sources.length
        ? 'overview.nextDiscover'
        : analyzedCount < sources.length
          ? 'overview.nextExplore'
          : !task.counts.suggestions
            ? 'overview.nextExperiments'
            : 'overview.nextReport';

      return h(
        'div',
        { className: 'rw-section' },
        h(
          'div',
          { className: 'rw-stats' },
          [
            ['overview.stats.sources', task.counts.sources],
            ['overview.stats.analyzed', analyzedCount],
            ['overview.stats.extractions', task.counts.extractions],
            ['overview.stats.suggestions', task.counts.suggestions],
            ['overview.stats.reports', task.counts.reports],
          ].map(([label, value]) => h('div', { key: label, className: 'rw-stat' }, h('b', null, value), h('span', null, t(label)))),
        ),
        job ? h(JobBanner, { job, t }) : null,
        h(
          'div',
          { className: 'rw-grid' },
          h(
            'div',
            { className: 'rw-card' },
            h('div', { className: 'rw-card__title' }, t('overview.objective')),
            h('p', { className: 'rw-item__body' }, task.objective || t('task.objectiveEmpty')),
          ),
          h(
            'div',
            { className: 'rw-card' },
            h('div', { className: 'rw-card__title' }, t('overview.currentState')),
            h('p', { className: 'rw-item__body' }, task.currentState || t('task.currentStateEmpty')),
          ),
        ),
        h(
          'div',
          { className: 'rw-grid' },
          h(
            'div',
            { className: 'rw-card' },
            h(
              'div',
              { className: 'rw-card__title' },
              t('sources.channels'),
              h(Btn, { size: 'small', variant: 'ghost', onClick: () => onTab('sources') }, t('sources.discover')),
            ),
            h(
              'div',
              { className: 'rw-kv', style: { marginBottom: 8 } },
              DISCOVERY_CHANNELS.map((channel) => h(Chip, { key: channel.id, tone: channel.access === 'open' ? 'brand' : '' }, channel.label)),
            ),
            task.discovery
              ? h('div', { className: 'rw-sub' }, t('sources.discoverySummary', {
                  added: task.discovery.added || 0,
                  skipped: task.discovery.skipped || 0,
                  errors: (task.discovery.errors || []).length,
                }))
              : h('div', { className: 'rw-sub' }, t('sources.discoverHint')),
          ),
          h(
            'div',
            { className: 'rw-card' },
            h(
              'div',
              { className: 'rw-card__title' },
              t('overview.recent'),
              h(Btn, { size: 'small', variant: 'ghost', onClick: () => onTab('sources') }, t('common.viewAll')),
            ),
            sources.length
              ? h(
                  'div',
                  { className: 'rw-list' },
                  sources.slice(0, 5).map((source) =>
                    h(
                      'div',
                      { key: source.id, className: 'rw-item rw-card--tight' },
                      h('div', { className: 'rw-item__top' }, h('div', { className: 'rw-item__title' }, source.title), h(StatusChip, { status: source.status, t })),
                    ),
                  ),
                )
              : h(Empty, { title: t('sources.empty') }),
          ),
        ),
        h(
          'div',
          { className: 'rw-card' },
          h('div', { className: 'rw-card__title' }, t('overview.next')),
          h('p', { className: 'rw-item__body' }, t(next)),
        ),
        h('div', { className: 'rw-sub' }, `${t('panel.dataDir')}: ${snap.dataDir}`),
      );
    }

    /* --------------------------------------------------------------- topics */

    function TopicsView({ task, snap, call, run, t }) {
      const [title, setTitle] = useState('');
      const [question, setQuestion] = useState('');
      const topics = snap.topics.filter((row) => row.taskId === task.id);

      const add = async () => {
        if (!title.trim()) return;
        const created = await run(t('topics.add'), () => call('topic.create', { taskId: task.id, title, question }));
        if (created) {
          setTitle('');
          setQuestion('');
        }
      };

      return h(
        'div',
        { className: 'rw-section' },
        h('p', { className: 'rw-hint' }, t('topics.hint')),
        h(
          'div',
          { className: 'rw-card' },
          h(
            'div',
            { className: 'rw-grid' },
            h(Field, { label: t('topics.addTitle') }, h('input', { className: 'rw-input', value: title, onChange: (e) => setTitle(e.target.value), placeholder: '例如：界面改性如何影响离子电导率？' })),
            h(Field, { label: t('topics.addQuestion') }, h('textarea', { className: 'rw-textarea', rows: 2, value: question, onChange: (e) => setQuestion(e.target.value), placeholder: t('common.optional') })),
          ),
          h('div', { className: 'rw-row rw-row--end', style: { marginTop: 10 } }, h(Btn, { variant: 'primary', size: 'small', onClick: add, disabled: !title.trim() }, h(Icon, { name: 'plus', size: 14 }), t('topics.add'))),
        ),
        topics.length
          ? h(
              'div',
              { className: 'rw-list' },
              topics.map((topic) =>
                h(
                  'div',
                  { key: topic.id, className: 'rw-item' },
                  h(
                    'div',
                    { className: 'rw-item__top' },
                    h('div', { className: 'rw-item__title' }, topic.title),
                    h(
                      'div',
                      { className: 'rw-row' },
                      h(Chip, { tone: topic.status === 'done' ? 'ok' : topic.status === 'focus' ? 'brand' : '' }, t(`topics.status.${topic.status}`)),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'rw-iconbtn',
                          title: t('common.delete'),
                          onClick: async () => {
                            if (window.confirm(t('topics.deleteHint'))) {
                              await run(t('common.delete'), () => call('topic.delete', { topicId: topic.id }));
                            }
                          },
                        },
                        h(Icon, { name: 'trash', size: 14 }),
                      ),
                    ),
                  ),
                  topic.question ? h('div', { className: 'rw-item__meta' }, `${t('topics.question')}: ${topic.question}`) : null,
                ),
              ),
            )
          : h(Empty, { title: t('topics.empty') }),
      );
    }

    /* -------------------------------------------------------------- sources */

    function SourceDetail({ source, t }) {
      const analysis = source.analysis;
      if (!analysis) return h('p', { className: 'rw-sub' }, t('sources.noAnalysis'));
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 } },
        analysis.summary ? h('p', { className: 'rw-item__body' }, analysis.summary) : null,
        analysis.researchQuestion ? h('div', { className: 'rw-sub' }, `${t('topics.question')}: ${analysis.researchQuestion}`) : null,
        analysis.methods && analysis.methods.length
          ? h(
              'div',
              null,
              h('div', { className: 'rw-field__label' }, t('sources.methods')),
              h('div', { className: 'rw-kv', style: { marginTop: 4 } }, analysis.methods.map((method, index) => h(Chip, { key: index }, method))),
            )
          : null,
        analysis.findings && analysis.findings.length
          ? h(
              'div',
              null,
              h('div', { className: 'rw-field__label' }, t('sources.findings')),
              h(
                'ul',
                { style: { margin: '4px 0 0', paddingLeft: 18 } },
                analysis.findings.map((finding, index) =>
                  h(
                    'li',
                    { key: index, style: { marginBottom: 6 } },
                    h('div', null, finding.claim),
                    finding.quote ? h('blockquote', { className: 'rw-quote' }, finding.quote) : null,
                  ),
                ),
              ),
            )
          : null,
        analysis.dataPoints && analysis.dataPoints.length
          ? h(
              'div',
              null,
              h('div', { className: 'rw-field__label' }, t('sources.dataPoints')),
              h(
                'table',
                { className: 'rw-table', style: { marginTop: 4 } },
                h('thead', null, h('tr', null, h('th', null, t('data.label')), h('th', null, t('data.value')), h('th', null, t('data.context')))),
                h(
                  'tbody',
                  null,
                  analysis.dataPoints.map((point, index) =>
                    h(
                      'tr',
                      { key: index },
                      h('td', null, point.label),
                      h('td', { className: 'rw-mono' }, `${point.value || ''}${point.unit ? ` ${point.unit}` : ''}`),
                      h('td', { className: 'rw-sub' }, point.context || ''),
                    ),
                  ),
                ),
              ),
            )
          : null,
        analysis.limitations && analysis.limitations.length
          ? h(
              'div',
              null,
              h('div', { className: 'rw-field__label' }, t('sources.limitations')),
              h('ul', { style: { margin: '4px 0 0', paddingLeft: 18 } }, analysis.limitations.map((item, index) => h('li', { key: index }, item))),
            )
          : null,
        h(
          'div',
          { className: 'rw-row' },
          h(Chip, { tone: analysis.relevance === 'high' ? 'ok' : analysis.relevance === 'medium' ? 'warn' : '' }, `${t('sources.relevance')}: ${t(`relevance.${analysis.relevance || 'low'}`)}`),
          analysis.mode ? h(Chip, { tone: analysis.mode === 'model' ? 'brand' : 'warn' }, analysisModeLabel(t, analysis.mode)) : null,
        ),
        analysis.relevanceNote ? h('div', { className: 'rw-sub' }, analysis.relevanceNote) : null,
        analysis.note ? h('div', { className: 'rw-sub' }, analysis.note) : null,
      );
    }

    function SourceForm({ task, onCreate, onCancel, t }) {
      const draftKey = `sci-sideband:source-draft:${task.id}`;
      const saved = useMemo(() => {
        try {
          return JSON.parse(window.localStorage.getItem(draftKey) || 'null') || {};
        } catch {
          return {};
        }
      }, [draftKey]);
      const [title, setTitle] = useState(saved.title || '');
      const [url, setUrl] = useState(saved.url || '');
      const [doi, setDoi] = useState(saved.doi || '');
      const [rawText, setRawText] = useState(saved.rawText || '');
      const [authors, setAuthors] = useState(saved.authors || '');
      const [year, setYear] = useState(saved.year || '');
      const [venue, setVenue] = useState(saved.venue || '');
      const [abstract, setAbstract] = useState(saved.abstract || '');
      const [type, setType] = useState(saved.type || 'paper');
      const [autoExplore, setAutoExplore] = useState(saved.autoExplore !== false);
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState('');

      useEffect(() => {
        try {
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({ title, url, doi, rawText, authors, year, venue, abstract, type, autoExplore }),
          );
        } catch {
          /* storage unavailable: the form still works for this mount */
        }
      }, [draftKey, title, url, doi, rawText, authors, year, venue, abstract, type, autoExplore]);

      const clearDraft = () => {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
      };

      const cancel = () => {
        clearDraft();
        onCancel();
      };

      const submit = async (explore) => {
        if (!url.trim() && !doi.trim() && !rawText.trim()) {
          setError(t('sources.hint'));
          return;
        }
        setSaving(true);
        setError('');
        try {
          const created = await onCreate({
            taskId: task.id,
            title,
            url,
            doi,
            rawText,
            authors,
            year,
            venue,
            abstract,
            type,
            autoExplore: explore,
          });
          if (created) {
            clearDraft();
            onCancel();
          }
        } catch (failure) {
          setError(messageOf(failure));
        } finally {
          setSaving(false);
        }
      };

      return h(
        'div',
        { className: 'rw-card' },
        h('div', { className: 'rw-card__title' }, t('sources.add')),
        error ? h('div', { className: 'rw-error', style: { marginBottom: 10 } }, error) : null,
        h(
          'div',
          { className: 'rw-grid' },
          h(Field, { label: t('sources.addTitle') }, h('input', { className: 'rw-input', value: title, onChange: (e) => setTitle(e.target.value) })),
          h(
            Field,
            { label: t('sources.type') },
            h(
              'select',
              { className: 'rw-select', value: type, onChange: (e) => setType(e.target.value) },
              ['paper', 'preprint', 'report', 'dataset', 'project', 'patent', 'blog', 'other'].map((value) => h('option', { key: value, value }, t(`source.type.${value}`))),
            ),
          ),
          h(Field, { label: t('sources.url') }, h('input', { className: 'rw-input', value: url, onChange: (e) => setUrl(e.target.value), placeholder: 'https://…' })),
          h(Field, { label: t('sources.doi') }, h('input', { className: 'rw-input', value: doi, onChange: (e) => setDoi(e.target.value), placeholder: '10.…' })),
          h(Field, { label: t('sources.authors') }, h('input', { className: 'rw-input', value: authors, onChange: (e) => setAuthors(e.target.value) })),
          h(Field, { label: t('sources.year') }, h('input', { className: 'rw-input', value: year, onChange: (e) => setYear(e.target.value) })),
          h(Field, { label: t('sources.venue') }, h('input', { className: 'rw-input', value: venue, onChange: (e) => setVenue(e.target.value) })),
        ),
        h(
          Field,
          { label: t('sources.abstract') },
          h('textarea', { className: 'rw-textarea', rows: 3, value: abstract, onChange: (e) => setAbstract(e.target.value) }),
        ),
        h(
          Field,
          { label: t('sources.raw'), hint: t('sources.pasteHint') },
          h('textarea', { className: 'rw-textarea', rows: 6, value: rawText, onChange: (e) => setRawText(e.target.value) }),
        ),
        h(
          'label',
          { className: 'rw-row', style: { cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: autoExplore, onChange: (e) => setAutoExplore(e.target.checked) }),
          h('span', { className: 'rw-sub' }, t('sources.auto')),
        ),
        h('p', { className: 'rw-sub', style: { margin: '4px 0 0' } }, t('sources.analyzeHint')),
        h(
          'div',
          { className: 'rw-row rw-row--end', style: { marginTop: 10 } },
          h(Btn, { onClick: cancel }, t('common.cancel')),
          autoExplore ? h(Btn, { onClick: () => submit(false), disabled: saving }, t('sources.addOnly')) : null,
          h(Btn, { variant: 'primary', onClick: () => submit(autoExplore), disabled: saving }, saving ? t('common.loading') : autoExplore ? t('common.analyze') : t('common.add')),
        ),
      );
    }

    function SourcesView({ task, snap, job, call, run, attempt, t }) {
      const [adding, setAdding] = useState(false);
      const [expanded, setExpanded] = useState({});
      const [channels, setChannels] = useState(() =>
        Array.isArray(task.channels) && task.channels.length ? task.channels : DEFAULT_CHANNEL_IDS,
      );
      const [discovering, setDiscovering] = useState(false);
      const [discoveryNote, setDiscoveryNote] = useState(() =>
        task.discovery
          ? t('sources.discoverySummary', {
              added: task.discovery.added || 0,
              skipped: task.discovery.skipped || 0,
              errors: (task.discovery.errors || []).length,
            })
          : '',
      );
      const sources = snap.sources.filter((row) => row.taskId === task.id);
      const pending = sources.filter((row) => row.status !== 'analyzed');

      const add = async (payload) => {
        const created = await attempt(t('sources.add'), () => call('source.create', payload));
        if (created) {
          setAdding(false);
          setExpanded((current) => ({ ...current, [created.id]: true }));
        }
        return created;
      };

      const explore = (sourceIds) =>
        run(t('common.analyze'), () => call('explore.start', { taskId: task.id, sourceIds }));

      const toggleChannel = (id) => {
        setChannels((current) =>
          current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );
      };

      const discover = async () => {
        if (discovering || !channels.length) return;
        setDiscovering(true);
        setDiscoveryNote('');
        try {
          const result = await run(t('sources.discovering'), () =>
            call('source.discover', { taskId: task.id, channels, perProvider: 2 }),
          );
          if (result) {
            setDiscoveryNote(
              result.added
                ? t('sources.discoverySummary', {
                    added: result.added,
                    skipped: result.skipped || 0,
                    errors: (result.errors || []).length,
                  })
                : t('sources.discoveryEmpty'),
            );
            if (Array.isArray(result.channels) && result.channels.length) setChannels(result.channels);
          }
        } finally {
          setDiscovering(false);
        }
      };

      return h(
        'div',
        { className: 'rw-section' },
        h('p', { className: 'rw-hint' }, t('sources.hint')),
        h(
          'div',
          { className: 'rw-card' },
          h(
            'div',
            { className: 'rw-card__title', style: { marginBottom: 4 } },
            t('sources.discover'),
            h(
              Btn,
              { size: 'small', variant: 'primary', onClick: discover, disabled: discovering || !channels.length },
              discovering ? h(Spinner) : h(Icon, { name: 'search', size: 14 }),
              discovering ? t('sources.discovering') : t('sources.discover'),
            ),
          ),
          h('p', { className: 'rw-sub', style: { margin: '0 0 8px' } }, t('sources.discoverHint')),
          h(
            'div',
            { className: 'rw-kv' },
            DISCOVERY_CHANNELS.map((channel) =>
              h(
                'label',
                { key: channel.id, className: 'rw-chip', style: { cursor: 'pointer', gap: 4 } },
                h('input', { type: 'checkbox', checked: channels.includes(channel.id), onChange: () => toggleChannel(channel.id) }),
                channel.label,
                h('span', { className: 'rw-sub' }, t(`sources.access.${channel.access}`)),
              ),
            ),
          ),
          discoveryNote ? h('div', { className: 'rw-sub', style: { marginTop: 8 } }, discoveryNote) : null,
          task.discovery && task.discovery.errors && task.discovery.errors.length
            ? h(
                'div',
                { className: 'rw-sub', style: { marginTop: 4 } },
                task.discovery.errors.map((row) => `${row.channel}: ${row.message}`).join(' · '),
              )
            : null,
        ),
        h(
          'div',
          { className: 'rw-row' },
          h(Btn, { size: 'small', onClick: () => setAdding((value) => !value) }, h(Icon, { name: 'plus', size: 14 }), t('sources.add')),
          h(Btn, { size: 'small', onClick: () => explore([]), disabled: !pending.length || (job && job.status === 'running') }, h(Icon, { name: 'spark', size: 14 }), t('sources.analyzeAll')),
          h('span', { className: 'rw-sub' }, t('sources.progress', { analyzed: task.counts.withAnalysis ?? task.counts.analyzed, total: sources.length })),
        ),
        adding ? h(SourceForm, { task, onCreate: add, onCancel: () => setAdding(false), t }) : null,
        job ? h(JobBanner, { job, t }) : null,
        sources.length
          ? h(
              'div',
              { className: 'rw-list' },
              sources.map((source) => {
                const isOpen = Boolean(expanded[source.id]);
                return h(
                  'div',
                  { key: source.id, className: 'rw-item' },
                  h(
                    'div',
                    { className: 'rw-item__top' },
                    h(
                      'div',
                      { style: { minWidth: 0 } },
                      h('div', { className: 'rw-item__title' }, source.title),
                      h(
                        'div',
                        { className: 'rw-item__meta' },
                        [
                          t(`source.type.${source.type}`),
                          source.provider ? source.provider : '',
                          source.access === 'open' || source.access === 'meta' ? t(`sources.access.${source.access}`) : '',
                          source.authors ? source.authors : '',
                          source.year,
                          source.venue,
                          t('sources.chars', { n: source.contentChars || 0 }),
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                      source.url
                        ? h(
                            'a',
                            { className: 'rw-link rw-mono', href: source.url, target: '_blank', rel: 'noreferrer' },
                            source.url.length > 90 ? `${source.url.slice(0, 90)}…` : source.url,
                          )
                        : null,
                      source.doi
                        ? h(
                            'a',
                            {
                              className: 'rw-link rw-mono',
                              href: `https://doi.org/${encodeURIComponent(source.doi)}`,
                              target: '_blank',
                              rel: 'noreferrer',
                            },
                            `DOI ${source.doi}`,
                          )
                        : null,
                    ),
                    h(
                      'div',
                      { className: 'rw-row', style: { flex: '0 0 auto' } },
                      h(StatusChip, { status: source.status, t }),
                      source.analysis
                        ? h(Chip, { tone: source.analysis.mode === 'model' ? 'brand' : 'warn' }, analysisModeLabel(t, source.analysis.mode))
                        : null,
                      h(
                        Btn,
                        {
                          size: 'small',
                          onClick: () => explore([source.id]),
                          disabled: job && job.status === 'running',
                        },
                        source.status === 'analyzed' ? t('common.reanalyze') : t('common.analyze'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'rw-iconbtn',
                          title: isOpen ? t('common.collapse') : t('common.expand'),
                          'aria-label': isOpen ? t('common.collapse') : t('common.expand'),
                          onClick: () => setExpanded((current) => ({ ...current, [source.id]: !isOpen })),
                        },
                        h(Icon, { name: isOpen ? 'chevron' : 'chevronRight', size: 14 }),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'rw-iconbtn',
                          title: t('common.delete'),
                          'aria-label': t('common.delete'),
                          onClick: async () => {
                            if (window.confirm(t('sources.deleteHint'))) {
                              await run(t('common.delete'), () => call('source.delete', { sourceId: source.id }));
                            }
                          },
                        },
                        h(Icon, { name: 'trash', size: 14 }),
                      ),
                    ),
                  ),
                  source.error ? h('div', { className: 'rw-error' }, `${t('sources.error')}: ${source.error}`) : null,
                  isOpen
                    ? source.analysis
                      ? h(SourceDetail, { source, t })
                      : h('p', { className: 'rw-sub' }, t('sources.noAnalysis'))
                    : null,
                );
              }),
            )
          : h(Empty, { title: t('sources.empty'), action: h(Btn, { variant: 'primary', onClick: () => setAdding(true) }, t('sources.add')) }),
      );
    }

    /* ----------------------------------------------------------------- data */

    function DataEditDialog({ row, sources, onClose, onSubmit, t }) {
      const [label, setLabel] = useState(row.label || '');
      const [value, setValue] = useState(row.value || '');
      const [unit, setUnit] = useState(row.unit || '');
      const [context, setContext] = useState(row.context || '');
      const [quote, setQuote] = useState(row.quote || '');
      const [kind, setKind] = useState(row.kind || 'metric');
      const [confidence, setConfidence] = useState(row.confidence || 'medium');
      const [sourceId, setSourceId] = useState(row.sourceId || '');
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState('');

      const submit = async () => {
        if (!label.trim()) {
          setError(t('form.required'));
          return;
        }
        setSaving(true);
        setError('');
        try {
          const updated = await onSubmit({
            extractionId: row.id,
            label,
            value,
            unit,
            context,
            quote,
            kind,
            confidence,
            sourceId,
          });
          if (updated) onClose();
        } catch (failure) {
          setError(messageOf(failure));
        } finally {
          setSaving(false);
        }
      };

      return h(
        Modal,
        {
          title: t('data.edit'),
          onClose,
          footer: [
            h(Btn, { key: 'c', onClick: onClose }, t('common.cancel')),
            h(Btn, { key: 's', variant: 'primary', onClick: submit, disabled: saving }, saving ? t('common.loading') : t('common.save')),
          ],
        },
        error ? h('div', { className: 'rw-error' }, error) : null,
        h(
          'div',
          { className: 'rw-grid rw-grid--3' },
          h(Field, { label: t('data.label') }, h('input', { className: 'rw-input', value: label, onChange: (e) => setLabel(e.target.value), autoFocus: true })),
          h(Field, { label: t('data.value') }, h('input', { className: 'rw-input', value, onChange: (e) => setValue(e.target.value) })),
          h(Field, { label: t('data.unit') }, h('input', { className: 'rw-input', value: unit, onChange: (e) => setUnit(e.target.value) })),
        ),
        h(
          'div',
          { className: 'rw-grid rw-grid--3' },
          h(
            Field,
            { label: t('data.kind') },
            h(
              'select',
              { className: 'rw-select', value: kind, onChange: (e) => setKind(e.target.value) },
              ['metric', 'finding', 'method', 'limitation', 'note'].map((item) => h('option', { key: item, value: item }, t(`data.kind.${item}`))),
            ),
          ),
          h(
            Field,
            { label: t('data.confidence') },
            h(
              'select',
              { className: 'rw-select', value: confidence, onChange: (e) => setConfidence(e.target.value) },
              ['high', 'medium', 'low'].map((item) => h('option', { key: item, value: item }, t(`confidence.${item}`))),
            ),
          ),
          h(
            Field,
            { label: t('data.source') },
            h(
              'select',
              { className: 'rw-select', value: sourceId, onChange: (e) => setSourceId(e.target.value) },
              h('option', { value: '' }, t('common.none')),
              sources.map((source) => h('option', { key: source.id, value: source.id }, source.title)),
            ),
          ),
        ),
        h(Field, { label: t('data.context') }, h('textarea', { className: 'rw-textarea', rows: 3, value: context, onChange: (e) => setContext(e.target.value) })),
        h(Field, { label: t('data.quote'), hint: t('common.optional') }, h('textarea', { className: 'rw-textarea', rows: 2, value: quote, onChange: (e) => setQuote(e.target.value) })),
      );
    }

    function DataView({ task, snap, call, run, attempt, t }) {
      const [adding, setAdding] = useState(false);
      const [editing, setEditing] = useState(null);
      const [label, setLabel] = useState('');
      const [value, setValue] = useState('');
      const [unit, setUnit] = useState('');
      const [context, setContext] = useState('');
      const [sourceId, setSourceId] = useState('');
      const [confidence, setConfidence] = useState('medium');
      const rows = snap.extractions.filter((row) => row.taskId === task.id);
      const sources = snap.sources.filter((row) => row.taskId === task.id);
      const sourceName = (id) => {
        const source = sources.find((row) => row.id === id);
        return source ? source.title : '—';
      };

      const add = async () => {
        if (!label.trim()) return;
        const created = await run(t('data.add'), () =>
          call('extraction.add', { taskId: task.id, label, value, unit, context, sourceId, confidence }),
        );
        if (created) {
          setLabel('');
          setValue('');
          setUnit('');
          setContext('');
          setSourceId('');
          setConfidence('medium');
          setAdding(false);
        }
      };

      const save = async (payload) => {
        const updated = await attempt(t('common.save'), () => call('extraction.update', payload));
        if (updated) setEditing(null);
        return updated;
      };

      return h(
        'div',
        { className: 'rw-section' },
        h('p', { className: 'rw-hint' }, t('data.hint')),
        h(
          'div',
          { className: 'rw-row' },
          h(Btn, { variant: 'primary', size: 'small', onClick: () => setAdding((current) => !current) }, h(Icon, { name: 'plus', size: 14 }), t('data.add')),
          h('span', { className: 'rw-sub' }, `${rows.length}`),
        ),
        adding
          ? h(
              'div',
              { className: 'rw-card' },
              h(
                'div',
                { className: 'rw-grid rw-grid--3' },
                h(Field, { label: t('data.label') }, h('input', { className: 'rw-input', value: label, onChange: (e) => setLabel(e.target.value), autoFocus: true })),
                h(Field, { label: t('data.value') }, h('input', { className: 'rw-input', value, onChange: (e) => setValue(e.target.value) })),
                h(Field, { label: t('data.unit') }, h('input', { className: 'rw-input', value: unit, onChange: (e) => setUnit(e.target.value) })),
              ),
              h(
                'div',
                { className: 'rw-grid', style: { marginTop: 10 } },
                h(
                  Field,
                  { label: t('data.source') },
                  h(
                    'select',
                    { className: 'rw-select', value: sourceId, onChange: (e) => setSourceId(e.target.value) },
                    h('option', { value: '' }, t('common.none')),
                    sources.map((source) => h('option', { key: source.id, value: source.id }, source.title)),
                  ),
                ),
                h(
                  Field,
                  { label: t('data.confidence') },
                  h(
                    'select',
                    { className: 'rw-select', value: confidence, onChange: (e) => setConfidence(e.target.value) },
                    ['high', 'medium', 'low'].map((value) => h('option', { key: value, value }, t(`confidence.${value}`))),
                  ),
                ),
              ),
              h(Field, { label: t('data.context') }, h('textarea', { className: 'rw-textarea', rows: 2, value: context, onChange: (e) => setContext(e.target.value) })),
              h(
                'div',
                { className: 'rw-row rw-row--end', style: { marginTop: 10 } },
                h(Btn, { onClick: () => setAdding(false) }, t('common.cancel')),
                h(Btn, { variant: 'primary', onClick: add, disabled: !label.trim() }, t('common.save')),
              ),
            )
          : null,
        rows.length
          ? h(
              'div',
              { className: 'rw-card', style: { padding: 0, overflow: 'hidden' } },
              h(
                'table',
                { className: 'rw-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', null, t('data.label')),
                    h('th', null, t('data.kind')),
                    h('th', null, t('data.value')),
                    h('th', null, t('data.source')),
                    h('th', null, t('data.context')),
                    h('th', null, t('data.confidence')),
                    h('th', null, ''),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  rows.map((row) =>
                    h(
                      'tr',
                      { key: row.id },
                      h('td', null, h('div', { style: { fontWeight: 600 } }, row.label), h('span', { className: 'rw-sub' }, `${analysisModeLabel(t, row.mode)}${row.edited ? ` · ${t('data.edited')}` : ''}`)),
                      h('td', null, h(Chip, { tone: (row.kind || 'metric') === 'metric' ? 'brand' : '' }, t(`data.kind.${row.kind || 'metric'}`) || row.kind)),
                      h('td', { className: 'rw-mono' }, `${row.value || ''}${row.unit ? ` ${row.unit}` : ''}`),
                      h('td', { className: 'rw-sub', style: { maxWidth: 220 } }, sourceName(row.sourceId)),
                      h('td', { className: 'rw-sub', style: { maxWidth: 300 } }, row.context || ''),
                      h('td', null, h(Chip, { tone: row.confidence === 'high' ? 'ok' : row.confidence === 'low' ? 'warn' : '' }, t(`confidence.${row.confidence || 'medium'}`))),
                      h(
                        'td',
                        null,
                        h(
                          'div',
                          { className: 'rw-row', style: { flexWrap: 'nowrap' } },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'rw-iconbtn',
                              title: t('data.edit'),
                              'aria-label': t('data.edit'),
                              onClick: () => setEditing(row),
                            },
                            h(Icon, { name: 'edit', size: 14 }),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'rw-iconbtn',
                              title: t('common.delete'),
                              'aria-label': t('common.delete'),
                              onClick: async () => {
                                if (window.confirm(t('data.deleteHint'))) {
                                  await run(t('common.delete'), () => call('extraction.delete', { extractionId: row.id }));
                                }
                              },
                            },
                            h(Icon, { name: 'trash', size: 14 }),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : h(Empty, { title: t('data.empty') }),
        editing
          ? h(DataEditDialog, {
              row: editing,
              sources,
              onClose: () => setEditing(null),
              onSubmit: save,
              t,
            })
          : null,
      );
    }

    /* ----------------------------------------------------------- experiments */

    function ExperimentsView({ task, snap, call, run, t }) {
      const [count, setCount] = useState(4);
      const [generating, setGenerating] = useState(false);
      const [batchNote, setBatchNote] = useState('');
      const suggestions = (snap.suggestions || []).filter((row) => row.taskId === task.id);
      const analyzedSources = snap.sources.filter((row) => row.taskId === task.id && row.analysis);
      const citationTitle = new Map(analyzedSources.map((source, index) => [`[${index + 1}]`, source.title]));
      const canGenerate = (task.counts.withAnalysis ?? task.counts.analyzed) > 0;

      const generate = async () => {
        if (generating) return;
        setGenerating(true);
        setBatchNote('');
        try {
          const result = await run(t('experiments.generating'), () => call('suggestion.generate', { taskId: task.id, count }));
          if (result && result.returned < result.requested) {
            setBatchNote(t('experiments.returned', { requested: result.requested, returned: result.returned }));
          }
        } finally {
          setGenerating(false);
        }
      };

      const remove = async (row) => {
        if (!window.confirm(t('experiments.deleteHint'))) return;
        await run(t('common.delete'), () => call('suggestion.delete', { suggestionId: row.id }));
      };

      return h(
        'div',
        { className: 'rw-section' },
        h('p', { className: 'rw-hint' }, t('experiments.hint')),
        h(
          'div',
          { className: 'rw-card' },
          h(
            'div',
            { className: 'rw-row', style: { justifyContent: 'space-between' } },
            h(
              'div',
              { style: { minWidth: 0 } },
              h('div', { className: 'rw-card__title', style: { margin: 0 } }, t('experiments.generate')),
              h('div', { className: 'rw-sub' }, `${t('sources.progress', { analyzed: task.counts.withAnalysis ?? task.counts.analyzed, total: task.counts.sources })} · ${t('reports.dataCount', { n: task.counts.extractions })}`),
            ),
            h(
              'div',
              { className: 'rw-row' },
              h(
                'label',
                { className: 'rw-row', style: { gap: 6 } },
                h('span', { className: 'rw-sub' }, t('experiments.count')),
                h(
                  'select',
                  { className: 'rw-select', style: { width: 74 }, value: count, onChange: (e) => setCount(Number(e.target.value)) },
                  [1, 2, 3, 4, 5, 6].map((value) => h('option', { key: value, value }, value)),
                ),
              ),
              h(
                Btn,
                { variant: 'primary', onClick: generate, disabled: !canGenerate || generating },
                generating ? h(Spinner) : h(Icon, { name: 'spark', size: 14 }),
                generating ? t('experiments.generating') : t('experiments.generate'),
              ),
            ),
          ),
          !canGenerate ? h('p', { className: 'rw-sub', style: { margin: '8px 0 0' } }, t('experiments.requiresEvidence')) : null,
        ),
        h('p', { className: 'rw-sub' }, t('experiments.note')),
        batchNote ? h('p', { className: 'rw-sub' }, batchNote) : null,
        suggestions.length
          ? h(
              'div',
              { className: 'rw-list' },
              suggestions.map((row) =>
                h(
                  'div',
                  { key: row.id, className: 'rw-item' },
                  h(
                    'div',
                    { className: 'rw-item__top' },
                    h(
                      'div',
                      { style: { minWidth: 0 } },
                      h('div', { className: 'rw-item__title' }, row.title),
                      h(
                        'div',
                        { className: 'rw-row', style: { gap: 6, marginTop: 4 } },
                        h(Chip, { tone: row.priority === 'high' ? 'ok' : row.priority === 'low' ? 'warn' : 'brand' }, t(`experiments.priority.${row.priority}`)),
                        h(Chip, { tone: row.mode === 'model' ? 'brand' : 'warn' }, suggestionModeLabel(t, row.mode)),
                        h('span', { className: 'rw-sub' }, fmtTime(row.batchAt || row.createdAt)),
                      ),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'rw-iconbtn',
                        title: t('common.delete'),
                        'aria-label': t('common.delete'),
                        onClick: () => remove(row),
                      },
                      h(Icon, { name: 'trash', size: 14 }),
                    ),
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 } },
                    h(
                      'div',
                      null,
                      h('div', { className: 'rw-field__label' }, t('experiments.hypothesis')),
                      h('p', { className: 'rw-item__body' }, row.hypothesis),
                    ),
                    row.rationale
                      ? h('div', null, h('div', { className: 'rw-field__label' }, t('experiments.rationale')), h('p', { className: 'rw-item__body' }, row.rationale))
                      : null,
                    row.design
                      ? h('div', null, h('div', { className: 'rw-field__label' }, t('experiments.design')), h('p', { className: 'rw-item__body' }, row.design))
                      : null,
                    h(
                      'div',
                      null,
                      h('div', { className: 'rw-field__label' }, t('experiments.variables')),
                      h(
                        'div',
                        { className: 'rw-grid rw-grid--3', style: { marginTop: 4 } },
                        [
                          ['experiments.independent', row.variables && row.variables.independent],
                          ['experiments.dependent', row.variables && row.variables.dependent],
                          ['experiments.controls', row.variables && row.variables.controls],
                        ].map(([label, value]) =>
                          h(
                            'div',
                            { key: label, className: 'rw-card rw-card--tight' },
                            h('div', { className: 'rw-field__label' }, t(label)),
                            h('div', { className: 'rw-sub', style: { marginTop: 2 } }, value || '—'),
                          ),
                        ),
                      ),
                    ),
                    row.readouts && row.readouts.length
                      ? h(
                          'div',
                          null,
                          h('div', { className: 'rw-field__label' }, t('experiments.readouts')),
                          h('ul', { style: { margin: '4px 0 0', paddingLeft: 18 } }, row.readouts.map((item, index) => h('li', { key: index }, item))),
                        )
                      : null,
                    row.risks && row.risks.length
                      ? h(
                          'div',
                          null,
                          h('div', { className: 'rw-field__label' }, t('experiments.risks')),
                          h('ul', { style: { margin: '4px 0 0', paddingLeft: 18 } }, row.risks.map((item, index) => h('li', { key: index }, item))),
                        )
                      : null,
                    (row.citations && row.citations.length) || (row.evidence && row.evidence.length)
                      ? h(
                          'div',
                          null,
                          h('div', { className: 'rw-field__label' }, t('experiments.citations')),
                          h(
                            'div',
                            { className: 'rw-row', style: { marginTop: 4 } },
                            (row.citations || []).map((item, index) => h(Chip, { key: `c${index}`, tone: 'brand', title: citationTitle.get(item) || '' }, item)),
                          ),
                          (row.evidence || []).map((item, index) =>
                            h('blockquote', { key: `e${index}`, className: 'rw-quote', style: { marginTop: 6 } }, `${item.label}${item.quote ? `：${item.quote}` : ''}`),
                          ),
                        )
                      : null,
                    row.note ? h('div', { className: 'rw-sub' }, row.note) : null,
                  ),
                ),
              ),
            )
          : h(Empty, { title: t('experiments.empty') }),
      );
    }

    /* -------------------------------------------------------------- reports */

    function ReportView({ task, reportId, call, run, t }) {
      const [report, setReport] = useState(null);
      const [error, setError] = useState('');
      const [copied, setCopied] = useState(false);

      useEffect(() => {
        let alive = true;
        setReport(null);
        setError('');
        call('report.get', { reportId })
          .then((value) => {
            if (alive) setReport(value);
          })
          .catch((failure) => {
            if (alive) setError(messageOf(failure));
          });
        return () => {
          alive = false;
        };
      }, [call, reportId]);

      const copy = async () => {
        if (!report) return;
        try {
          await navigator.clipboard.writeText(report.markdown || '');
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch (failure) {
          setError(messageOf(failure));
        }
      };

      const download = () => {
        if (!report) return;
        const blob = new Blob([report.markdown || ''], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName(report.title || t('reports.downloadName'))}.md`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };

      if (error) return h('div', { className: 'rw-error' }, error);
      if (!report) return h('div', { className: 'rw-empty' }, h(Spinner), ' ', t('common.loading'));

      return h(
        'div',
        { className: 'rw-report' },
        h(
          'div',
          { className: 'rw-row', style: { justifyContent: 'space-between' } },
          h('div', { className: 'rw-meta' }, h(Chip, { tone: report.mode === 'model' ? 'brand' : 'warn' }, t(report.mode === 'model' ? 'reports.mode.model' : 'reports.mode.fallback')), h('span', null, fmtTime(report.createdAt)), h('span', null, t('reports.sourceCount', { n: report.sourceCount })), h('span', null, t('reports.dataCount', { n: report.dataPointCount }))),
          h(
            'div',
            { className: 'rw-row' },
            h(Btn, { size: 'small', onClick: copy }, h(Icon, { name: copied ? 'check' : 'copy', size: 14 }), copied ? t('common.copied') : t('common.copy')),
            h(Btn, { size: 'small', onClick: download }, h(Icon, { name: 'download', size: 14 }), t('common.download')),
            h(
              Btn,
              {
                size: 'small',
                variant: 'danger',
                onClick: async () => {
                  if (window.confirm(t('reports.deleteHint'))) {
                    await run(t('common.delete'), () => call('report.delete', { reportId: report.id }));
                  }
                },
              },
              h(Icon, { name: 'trash', size: 14 }),
              t('common.delete'),
            ),
          ),
        ),
        h('h2', null, report.title),
        report.note ? h('div', { className: 'rw-error' }, report.note) : null,
        report.abstract ? h('div', null, h('h3', null, t('reports.abstract')), h('p', null, report.abstract)) : null,
        report.keywords && report.keywords.length ? h('div', { className: 'rw-row' }, h('span', { className: 'rw-sub' }, t('reports.keywords')), report.keywords.map((keyword, index) => h(Chip, { key: index }, keyword))) : null,
        h('div', { className: 'rw-divider' }),
        h(
          'div',
          { className: 'rw-report__sections' },
          (report.sections || []).map((section, index) =>
            h(
              'div',
              { key: index, className: 'rw-report__section' },
              h('h3', null, section.heading),
              (section.paragraphs || []).map((paragraph, paragraphIndex) => h('p', { key: paragraphIndex }, paragraph)),
            ),
          ),
        ),
        report.references && report.references.length
          ? h(
              'div',
              { className: 'rw-report__section' },
              h('h3', null, t('reports.references')),
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                report.references.map((reference, index) =>
                  h('div', { key: index, className: 'rw-sub' }, `${reference.label} ${reference.text}`),
                ),
              ),
            )
          : null,
      );
    }

    function ReportsView({ task, snap, call, run, t }) {
      const [reportId, setReportId] = useState(null);
      const [composing, setComposing] = useState(false);
      const reports = snap.reports.filter((row) => row.taskId === task.id);
      const canCompose = (task.counts.withAnalysis ?? task.counts.analyzed) > 0;

      useEffect(() => {
        if (reportId && !reports.some((row) => row.id === reportId)) setReportId(null);
      }, [reports, reportId]);

      const compose = async () => {
        if (composing) return;
        setComposing(true);
        try {
          const created = await run(t('reports.generating'), () => call('report.compose', { taskId: task.id }));
          if (created) setReportId(created.id);
        } finally {
          setComposing(false);
        }
      };

      return h(
        'div',
        { className: 'rw-section' },
        h('p', { className: 'rw-hint' }, t('reports.hint')),
        h(
          'div',
          { className: 'rw-card' },
          h(
            'div',
            { className: 'rw-row', style: { justifyContent: 'space-between' } },
            h(
              'div',
              null,
              h('div', { className: 'rw-card__title', style: { margin: 0 } }, t('reports.generate')),
              h('div', { className: 'rw-sub' }, `${t('sources.progress', { analyzed: task.counts.withAnalysis ?? task.counts.analyzed, total: task.counts.sources })} · ${t('reports.dataCount', { n: task.counts.extractions })}`),
            ),
            h(
              Btn,
              { variant: 'primary', onClick: compose, disabled: !canCompose || composing },
              composing ? h(Spinner) : h(Icon, { name: 'doc', size: 14 }),
              composing ? t('reports.generating') : t('reports.generate'),
            ),
          ),
          !canCompose ? h('p', { className: 'rw-sub', style: { margin: '8px 0 0' } }, t('overview.nextExplore')) : null,
        ),
        reports.length
          ? h(
              'div',
              { className: 'rw-grid' },
              h(
                'div',
                { className: 'rw-card' },
                h('div', { className: 'rw-card__title' }, `${t('tabs.reports')} (${reports.length})`),
                h(
                  'div',
                  { className: 'rw-reportlist' },
                  reports.map((report) =>
                    h(
                      'button',
                      {
                        key: report.id,
                        type: 'button',
                        className: cls('rw-reportrow', report.id === reportId && 'is-active'),
                        onClick: () => setReportId(report.id),
                      },
                      h('div', { className: 'rw-item__title' }, report.title),
                      h(
                        'div',
                        { className: 'rw-row', style: { gap: 6 } },
                        h(Chip, { tone: report.mode === 'model' ? 'brand' : 'warn' }, analysisModeLabel(t, report.mode)),
                        h(
                          'span',
                          { className: 'rw-item__meta' },
                          `${fmtTime(report.createdAt)} · ${t('reports.sourceCount', { n: report.sourceCount })} · ${t('reports.dataCount', { n: report.dataPointCount })}`,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'rw-card' },
                reportId ? h(ReportView, { task, reportId, call, run, t }) : h(Empty, { title: t('reports.selectHint') }),
              ),
            )
          : h(Empty, { title: t('reports.empty') }),
      );
    }

    /* ---------------------------------------------------------------- apply */

    function apply(ctx) {
      const t = makeT(ctx);
      let slots = null;
      try {
        slots = ctx && typeof ctx.get === 'function' ? ctx.get('slots') : ctx && ctx.slots;
      } catch {
        slots = null;
      }
      if (!slots || typeof slots.register !== 'function' || typeof slots.inject !== 'function') {
        console.error('[sci-sideband] slots service is unavailable; panel not registered');
        return;
      }

      function MainPanel() {
        return h(Panel, { ctx, t });
      }

      const keep = (disposer) => {
        if (typeof disposer !== 'function') return;
        try {
          if (typeof ctx.effect === 'function') ctx.effect(() => disposer, 'sci-sideband client slot');
        } catch {
          /* the inject itself owns the registration in most builds */
        }
      };

      keep(
        slots.inject('sidebar.panellist', () =>
          slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 43, label: () => t('panel.title') },
            PanelIcon,
          ),
        ),
      );
      keep(
        slots.inject('main', () =>
          slots.register({ name: 'main', key: PANEL_ID }, MainPanel),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply,
    };
  },
});
