#!/usr/bin/env node
/**
 * Generate the format-1 plugin-market index for dsh-sci-sideband.
 *
 * The market installs a git source pinned to an exact commit. Publish order:
 *   1. commit the plugin code and tag it (for example v0.1.0)
 *   2. node scripts/make-market-index.mjs --commit v0.1.0
 *   3. commit market/index.json
 *
 * Usage:
 *   node scripts/make-market-index.mjs [--commit <sha|ref>] [--stdout]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_SLUG = 'Dzy-HW-XD/dsh-sci-sideband';
const REPO_URL = `https://github.com/${REPO_SLUG}`;
const PKG_NAME = 'dsh-sci-sideband';
const OUT_FILE = 'market/index.json';
const DSH_RANGE = '>=0.2.2-rc.1 <0.3.0-0';

const ARGV = process.argv.slice(2);
const STDOUT = ARGV.includes('--stdout');

function argValue(flag, fallback) {
  const i = ARGV.indexOf(flag);
  if (i === -1) return fallback;
  const value = ARGV[i + 1];
  if (!value || value.startsWith('--')) {
    console.error(`missing value after ${flag}`);
    process.exit(2);
  }
  return value;
}

function git(args) {
  const result = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function resolveCommit(ref) {
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    console.error(`cannot resolve commit: ${ref}`);
    process.exit(2);
  }
  return sha;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.name !== PKG_NAME) {
  console.error(`package.json name is ${JSON.stringify(pkg.name)}, expected ${JSON.stringify(PKG_NAME)}`);
  process.exit(2);
}

const explicit = argValue('--commit', '');
const explicitEpoch = Number(argValue('--epoch', ''));
const version = pkg.version;
const ref = explicit || (git(['rev-parse', '--verify', `v${version}^{commit}`]) ? `v${version}` : 'HEAD');
const commit = /^[0-9a-f]{40}$/.test(explicit) ? explicit : resolveCommit(ref);
const epoch = Number.isInteger(explicitEpoch) && explicitEpoch > 0
  ? explicitEpoch
  : Number(git(['show', '-s', '--format=%ct', commit]));
if (!Number.isInteger(epoch) || epoch <= 0) {
  console.error(`cannot read commit timestamp for ${commit}; pass --epoch <unix-seconds>`);
  process.exit(2);
}

let previous = null;
try {
  previous = JSON.parse(fs.readFileSync(path.join(ROOT, OUT_FILE), 'utf8'));
} catch {
  /* first index */
}

const previousEntry = previous && Array.isArray(previous.plugins)
  ? previous.plugins.find((row) => row && row.name === PKG_NAME)
  : null;
const previousVersions = previousEntry && Array.isArray(previousEntry.versions)
  ? previousEntry.versions.filter(
      (row) =>
        row &&
        typeof row.version === 'string' &&
        row.source &&
        row.source.type === 'git' &&
        /^[0-9a-f]{40}$/.test(row.source.commit),
    )
  : [];

const versions = previousVersions.filter((row) => row.version !== version);
versions.push({
  version,
  publishTimestamp: epoch,
  source: { type: 'git', url: REPO_URL, commit },
  engines: { dsh: DSH_RANGE },
});
versions.sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));

const index = {
  format: 1,
  title: { en: 'Sci Sideband plugins', zh: '科研探索边带' },
  description: {
    en: 'A research-exploration sideband for DeepSeek Harness: projects, content sources, traceable evidence, experiment suggestions, and review articles.',
    zh: 'DeepSeek Harness 的科研探索边带：项目管理、科研内容探索、可核查证据、实验建议与综述论述。',
  },
  metadata: {
    categories: {
      knowledge: { title: { en: 'Knowledge & research', zh: '知识与研究' } },
    },
    labels: {
      plugin: { title: { en: 'Plugin', zh: '插件' } },
    },
  },
  plugins: [
    {
      name: PKG_NAME,
      title: { en: 'Sci Sideband', zh: '科研探索边带' },
      icon: 'icons/sci-sideband.svg',
      author: 'Dzy-HW-XD',
      homepage: `${REPO_URL}#readme`,
      repository: { url: REPO_URL },
      metadata: {
        category: 'knowledge',
        labels: ['plugin'],
        keywords: [
          'dsh',
          'dsh-plugin',
          'deepseek-harness',
          'research',
          'literature',
          'evidence',
          'experiment-design',
          'review',
        ],
      },
      versions,
      description: {
        en: 'Manage research interests and current results, analyze source content in the background, capture traceable evidence, suggest experiments, and compose review articles. It does not run experiments or process raw experimental data.',
        zh: '管理研究兴趣与已有成果，后台分析科研内容，沉淀可核查证据，生成实验建议与综述论述；不执行实验，也不处理原始实验数据。',
      },
    },
  ],
};

const text = `${JSON.stringify(index, null, 2)}\n`;
if (STDOUT) {
  process.stdout.write(text);
} else {
  const out = path.join(ROOT, OUT_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, 'utf8');
  console.log(`wrote ${path.relative(ROOT, out)} for ${version} @ ${commit}`);
}
