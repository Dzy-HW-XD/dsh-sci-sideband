import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nowIso } from './util.js';

export const STORE_VERSION = 4;

export function defaultDataDir() {
  const override = process.env.DSH_SCI_SIDEBAND_DATA;
  if (override && override.trim()) return path.resolve(override.trim());
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : path.join(os.homedir(), '.dsh');
  return path.join(home, 'sci-sideband');
}

export function emptyState() {
  const at = nowIso();
  return {
    version: STORE_VERSION,
    createdAt: at,
    updatedAt: at,
    tasks: [],
    topics: [],
    sources: [],
    extractions: [],
    reports: [],
    suggestions: [],
    cards: [],
    router: {
      enabled: true,
      status: 'idle',
      lastTickAt: null,
      lastRunAt: null,
      taskId: null,
      message: '',
    },
    jobs: {},
  };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

/** Bring older or hand-edited files to the current shape without losing fields. */
function migrate(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return {
    ...base,
    ...raw,
    version: STORE_VERSION,
    tasks: array(raw.tasks),
    topics: array(raw.topics),
    sources: array(raw.sources),
    extractions: array(raw.extractions),
    reports: array(raw.reports),
    suggestions: array(raw.suggestions),
    cards: array(raw.cards),
    router: raw.router && typeof raw.router === 'object' && !Array.isArray(raw.router) ? raw.router : base.router,
    jobs: raw.jobs && typeof raw.jobs === 'object' && !Array.isArray(raw.jobs) ? raw.jobs : {},
  };
}

export class Store {
  constructor(directory) {
    this.dir = directory;
    this.file = path.join(directory, 'data.json');
    this.state = null;
    this.chain = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    let raw = null;
    try {
      raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        const aside = `${this.file}.corrupt-${Date.now()}`;
        try {
          await fs.rename(this.file, aside);
          console.warn(`[sci-sideband] store is unreadable, moved to ${aside}: ${error.message}`);
        } catch {
          /* keep the original file; a fresh in-memory state still lets the panel open */
        }
      }
    }
    this.state = raw ? migrate(raw) : emptyState();
    if (!raw) await this.#write(this.state);
    return this.state;
  }

  getState() {
    return this.state;
  }

  /**
   * Serialize mutations: each caller gets a private draft, and later callers see
   * the result of earlier commits. A rejected mutation never poisons the queue.
   */
  async update(mutator) {
    const run = async () => {
      const draft = structuredClone(this.state);
      mutator(draft);
      draft.version = STORE_VERSION;
      draft.updatedAt = nowIso();
      await this.#write(draft);
      this.state = draft;
      return draft;
    };
    const task = this.chain.then(run, run);
    this.chain = task.catch(() => {});
    return task;
  }

  async #write(next) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, this.file);
  }
}
