import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MANIFEST = path.join(ROOT, 'skills', 'manifest.json');
const REGISTRY = path.join(ROOT, 'skills', 'registry.json');

async function readRegistry() {
  try {
    const data = JSON.parse(await fs.readFile(REGISTRY, 'utf8'));
    return new Map((Array.isArray(data.skills) ? data.skills : []).map((row) => [row.id, row]));
  } catch {
    return new Map();
  }
}

function withRegistry(skill, registry) {
  const entry = registry.get(skill.id) || {};
  return {
    ...skill,
    role: entry.role || '',
    priority: entry.priority || 0,
    overlaps: Array.isArray(entry.overlaps) ? entry.overlaps : [],
  };
}

async function readManifest() {
  try {
    const raw = await fs.readFile(MANIFEST, 'utf8');
    const data = JSON.parse(raw);
    return { checkedAt: data.checkedAt || null, skills: Array.isArray(data.skills) ? data.skills : [] };
  } catch {
    return { checkedAt: null, skills: [] };
  }
}

export async function listSkills() {
  const manifest = await readManifest();
  const registry = await readRegistry();
  const skills = [];
  for (const skill of manifest.skills) {
    let exists = false;
    try {
      await fs.access(path.join(ROOT, skill.path, 'SKILL.md'));
      exists = true;
    } catch {
      exists = false;
    }
    skills.push(withRegistry({ ...skill, installed: exists }, registry));
  }
  return { checkedAt: manifest.checkedAt, skills };
}

async function latestCommit(repo, branch, remotePath) {
  const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(remotePath)}&sha=${encodeURIComponent(branch || 'main')}&per_page=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-sci-sideband' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      commit: String(row.sha || ''),
      date: row.commit && row.commit.author ? row.commit.author.date : null,
      url: row.html_url || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSkills() {
  const manifest = await readManifest();
  const registry = await readRegistry();
  const skills = [];
  for (const skill of manifest.skills) {
    if (!skill.repo || !skill.remotePath) {
      skills.push(withRegistry({ ...skill, latest: null, available: false, error: null }, registry));
      continue;
    }
    try {
      const latest = await latestCommit(skill.repo, skill.branch, skill.remotePath);
      const available = Boolean(latest && latest.commit && latest.commit !== skill.commit);
      skills.push(withRegistry({ ...skill, latest, available, error: null }, registry));
    } catch (error) {
      skills.push(withRegistry({
        ...skill,
        latest: null,
        available: false,
        error: String((error && error.message) || error),
      }, registry));
    }
  }
  return { checkedAt: new Date().toISOString(), skills };
}
