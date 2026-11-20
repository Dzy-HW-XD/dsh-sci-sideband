/**
 * Agent-facing tools. Every tool calls the same ResearchLab action layer as the
 * panel, so an operation has exactly one implementation.
 */

function textRender(args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

function tool(def) {
  return {
    ...def,
    output: {
      schema: { type: 'object' },
      render: textRender,
    },
  };
}

const taskActions = ['list', 'create', 'update', 'delete'];

export function registerResearchTools(tools, lab, logger) {
  const disposers = [];
  const note = (level, message) => {
    try {
      if (logger && typeof logger[level] === 'function') logger[level](`sci-sideband: ${message}`);
    } catch {
      /* logging must not break registration */
    }
  };

  function add(definition) {
    try {
      disposers.push(tools.register(definition));
    } catch (error) {
      note('warn', `工具 ${definition.name} 注册失败：${(error && error.message) || error}`);
    }
  }

  add(
    tool({
      name: 'sci_task',
      description:
        'Manage research projects in the Sci Sideband panel (sidebar icon "科研探索边带"). A project carries the research interest/objective, current results/progress, discovery channels, source content, evidence, experiment suggestions, and review reports. Topics are optional and no longer required for discovery or analysis. Actions: list, create, update, delete.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: taskActions, description: 'Operation to perform.' },
          taskId: { type: 'string', description: 'Target task id (required for update/delete).' },
          title: { type: 'string', description: 'Project title.' },
          objective: { type: 'string', description: 'Research interest / objective the project must explore.' },
          currentState: { type: 'string', description: 'Existing results, current progress, constraints, or prior findings.' },
          field: { type: 'string', description: 'Research field or domain.' },
          experimentBrief: { type: 'string', description: 'Lab constraints/resources used when suggesting experiments, e.g. "one A100 80GB".' },
          autoScan: { type: 'boolean', description: 'Periodically discover and analyze new sources while DSH is running.' },
          scanHours: { type: 'integer', description: 'Auto-scan interval in hours, 6-168 (default 24).' },
          channels: {
            type: 'array',
            items: { type: 'string', enum: ['arxiv', 'openalex', 'crossref', 'europepmc', 'doaj', 'semanticscholar'] },
            description: 'Default discovery channels.',
          },
          status: { type: 'string', enum: ['active', 'paused', 'done'] },
        },
        required: ['action'],
      },
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {};
        const action = String(input.action || '');
        if (action === 'list') return lab.run('task.list', {});
        if (action === 'create') {
          return lab.run('task.create', {
            title: input.title,
            objective: input.objective,
            currentState: input.currentState,
            field: input.field,
            channels: input.channels,
            experimentBrief: input.experimentBrief,
            autoScan: input.autoScan,
            scanHours: input.scanHours,
            status: input.status,
          });
        }
        if (action === 'update') return lab.run('task.update', input);
        if (action === 'delete') return lab.run('task.delete', input);
        throw new Error(`sci_task 不支持 action=${action}`);
      },
      timeoutMs: 30000,
      isConcurrencySafe: () => false,
    }),
  );

  add(
    tool({
      name: 'sci_source',
      description:
        'Manage research content and discover it from default open sources. Actions: list, create, discover, deepen, refresh, delete, explore. "create" accepts a URL, DOI, or pasted text. "discover" searches arXiv, OpenAlex, Crossref, Europe PMC, DOAJ, and Semantic Scholar from the project objective, imports unique records, and starts background analysis; no topics are required. "deepen" follows the references and citations of analyzed sources one level deeper.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create', 'discover', 'deepen', 'refresh', 'delete', 'explore'],
          },
          taskId: { type: 'string', description: 'Owning research task id.' },
          sourceId: { type: 'string', description: 'Target source id (refresh/delete/explore).' },
          sourceIds: { type: 'array', items: { type: 'string' }, description: 'Specific sources to analyze or deepen.' },
          channels: {
            type: 'array',
            items: { type: 'string', enum: ['arxiv', 'openalex', 'crossref', 'europepmc', 'doaj', 'semanticscholar'] },
            description: 'Discovery channels; defaults to the project channels or all six.',
          },
          perProvider: { type: 'integer', description: 'Retrieval depth per provider, 1-50 (default 20). Results are not capped at this number; similarity filtering decides what is imported.' },
          minSimilarity: { type: 'number', description: 'Similarity threshold 0.05-0.9 (default 0.3); higher means stricter matching.' },
          perSource: { type: 'integer', description: 'Reference/citation neighbors per source for deepen, 1-8 (default 4).' },
          maxTotal: { type: 'integer', description: 'Maximum new sources per deepen run, 1-24 (default 12).' },
          autoAnalyze: { type: 'boolean', description: 'Start background analysis after discovery/deepen (default true).' },
          title: { type: 'string' },
          url: { type: 'string' },
          doi: { type: 'string' },
          authors: { type: 'string' },
          year: { type: 'string' },
          venue: { type: 'string' },
          abstract: { type: 'string' },
          rawText: { type: 'string', description: 'Pasted source text (used when no accessible URL exists).' },
          type: { type: 'string', enum: ['paper', 'preprint', 'report', 'dataset', 'project', 'patent', 'blog', 'other'] },
          autoExplore: { type: 'boolean', description: 'Start background analysis right after creation.' },
        },
        required: ['action'],
      },
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {};
        const action = String(input.action || '');
        if (action === 'list') return lab.run('source.list', input);
        if (action === 'create') return lab.run('source.create', input);
        if (action === 'discover') return lab.run('source.discover', input);
        if (action === 'deepen') return lab.run('source.deepen', input);
        if (action === 'refresh') return lab.run('source.refresh', input);
        if (action === 'delete') return lab.run('source.delete', input);
        if (action === 'explore') return lab.run('explore.start', input);
        throw new Error(`sci_source 不支持 action=${action}`);
      },
      timeoutMs: 120000,
      isConcurrencySafe: () => false,
    }),
  );

  add(
    tool({
      name: 'sci_status',
      description:
        'Read the sideband state: projects with counts, source content with analysis, captured evidence, experiment suggestions, review reports, and background exploration progress. Use action="job" for one project\'s exploration job, action="data" for evidence rows, action="suggestions" for experiment suggestions, action="state" for everything.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['state', 'job', 'data', 'suggestions'] },
          taskId: { type: 'string', description: 'Restrict to one task where applicable.' },
        },
        required: ['action'],
      },
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {};
        const action = String(input.action || 'state');
        if (action === 'job') return lab.run('explore.status', input);
        if (action === 'data') return lab.run('extraction.list', input);
        if (action === 'suggestions') return lab.run('suggestion.list', input);
        return lab.run('state.get', {});
      },
      timeoutMs: 30000,
      isConcurrencySafe: () => true,
    }),
  );

  add(
    tool({
      name: 'sci_report',
      description:
        'Compose or retrieve a review article that synthesizes a task\'s analyzed sources and captured evidence. Actions: list, compose (returns a saved report with markdown), get, delete. "compose" uses the configured chat model and falls back to deterministic evidence assembly when the model fails.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'compose', 'get', 'delete'] },
          taskId: { type: 'string', description: 'Task to synthesize (compose).' },
          reportId: { type: 'string', description: 'Target report id (get/delete).' },
          title: { type: 'string', description: 'Optional report title override.' },
        },
        required: ['action'],
      },
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {};
        const action = String(input.action || '');
        if (action === 'list') return lab.run('report.list', input);
        if (action === 'compose') return lab.run('report.compose', input);
        if (action === 'get') return lab.run('report.get', input);
        if (action === 'delete') return lab.run('report.delete', input);
        throw new Error(`sci_report 不支持 action=${action}`);
      },
      timeoutMs: 360000,
      isConcurrencySafe: () => false,
    }),
  );

  add(
    tool({
      name: 'sci_data',
      description:
        'Manage the evidence table captured from analyzed sources. Actions: list, add, update, delete. Rows come from source analysis (auto=true) or manual notes (auto=false). This is literature-derived evidence, not raw experimental data; use update to correct a value without re-adding it.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'update', 'delete'] },
          taskId: { type: 'string' },
          sourceId: { type: 'string' },
          extractionId: { type: 'string' },
          label: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          context: { type: 'string' },
          quote: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          kind: { type: 'string', enum: ['metric', 'finding', 'method', 'limitation', 'note'] },
        },
        required: ['action'],
      },
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {};
        const action = String(input.action || '');
        if (action === 'list') return lab.run('extraction.list', input);
        if (action === 'add') return lab.run('extraction.add', input);
        if (action === 'update') return lab.run('extraction.update', input);
        if (action === 'delete') return lab.run('extraction.delete', input);
        throw new Error(`sci_data 不支持 action=${action}`);
      },
      timeoutMs: 30000,
      isConcurrencySafe: () => false,
    }),
  );

  add(
    tool({
      name: 'sci_experiment',
      description:
        'Generate, list, or delete experiment suggestions for a research project. Suggestions are concise research-proposal style designs (question, hypothesis, approach, variables, readouts, resources/timeline, risks, expected outcome) grounded in analyzed sources, the evidence table, the research objective, and optional user constraints (experimentBrief). This plugin does NOT run experiments or process raw experimental data. Actions: list, generate, delete. Generate replaces the previous batch by default.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'generate', 'delete'] },
          taskId: { type: 'string', description: 'Project to generate suggestions for (generate) or filter by (list).' },
          suggestionId: { type: 'string', description: 'Target suggestion id (delete).' },
          count: { type: 'integer', description: 'How many suggestions to generate, 1-6 (default 4).' },
          experimentBrief: { type: 'string', description: 'User constraints/resources for the proposal, e.g. "only one A100 80GB, 20 GPU-hours/week".' },
          replace: { type: 'boolean', description: 'Replace the previous suggestion batch (default true).' },
        },
        required: ['action'],
      },
      async execute(args) {
        const input = args && typeof args === 'object' ? args : {};
        const action = String(input.action || '');
        if (action === 'list') return lab.run('suggestion.list', input);
        if (action === 'generate') return lab.run('suggestion.generate', input);
        if (action === 'delete') return lab.run('suggestion.delete', input);
        throw new Error(`sci_experiment 不支持 action=${action}`);
      },
      timeoutMs: 360000,
      isConcurrencySafe: () => false,
    }),
  );

  note('info', `${disposers.length} 个工具已注册`);
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* unloading is best effort */
      }
    }
  };
}
