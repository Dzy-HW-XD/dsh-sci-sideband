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
    enabled: entry.enabled !== false,
    role: entry.role || '',
    priority: entry.priority || 0,
    overlaps: Array.isArray(entry.overlaps) ? entry.overlaps : [],
  };
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readRegistryData() {
  try {
    return JSON.parse(await fs.readFile(REGISTRY, 'utf8'));
  } catch {
    return { policy: '', primary: '', skills: [] };
  }
}

export async function setSkillEnabled(id, enabled) {
  const registry = await readRegistryData();
  registry.skills = Array.isArray(registry.skills) ? registry.skills : [];
  let row = registry.skills.find((item) => item.id === id);
  if (!row) {
    row = { id, role: 'custom', priority: 99, overlaps: [] };
    registry.skills.push(row);
  }
  row.enabled = enabled !== false;
  await writeJson(REGISTRY, registry);
  return listSkills();
}

export async function addSkill(input = {}) {
  const id = String(input.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) throw new Error('skill id 只能用小写字母、数字和连字符。');
  const relative = String(input.path || `skills/${id}`).replace(/\\/g, '/');
  if (!relative.startsWith('skills/') || relative.includes('..')) throw new Error('skill 路径必须在 skills/ 下。');
  const full = path.join(ROOT, relative);
  try {
    await fs.access(path.join(full, 'SKILL.md'));
  } catch {
    throw new Error(`没有找到 ${relative}/SKILL.md。`);
  }
  const manifest = await readManifest();
  if (manifest.skills.some((item) => item.id === id)) throw new Error('这个 skill id 已存在。');
  manifest.skills.push({
    id,
    name: String(input.name || id),
    path: relative,
    version: String(input.version || '1.0.0'),
    license: String(input.license || 'local'),
    repo: '',
    branch: '',
    remotePath: '',
    commit: '',
    source: String(input.source || 'local'),
  });
  await writeJson(MANIFEST, { checkedAt: manifest.checkedAt, skills: manifest.skills });
  const registry = await readRegistryData();
  registry.skills = Array.isArray(registry.skills) ? registry.skills : [];
  registry.skills.push({
    id,
    role: String(input.role || 'custom'),
    priority: Number(input.priority) || 99,
    enabled: true,
    overlaps: [],
    reason: 'Added from the skill manager.',
  });
  await writeJson(REGISTRY, registry);
  return listSkills();
}

export async function deleteSkill(id, removeFiles = false) {
  const manifest = await readManifest();
  const row = manifest.skills.find((item) => item.id === id);
  if (!row) throw new Error('没有这个 skill。');
  manifest.skills = manifest.skills.filter((item) => item.id !== id);
  await writeJson(MANIFEST, { checkedAt: manifest.checkedAt, skills: manifest.skills });
  const registry = await readRegistryData();
  registry.skills = (Array.isArray(registry.skills) ? registry.skills : []).filter((item) => item.id !== id);
  await writeJson(REGISTRY, registry);
  if (removeFiles) {
    const relative = String(row.path || '').replace(/\\/g, '/');
    if (relative.startsWith('skills/') && !relative.includes('..')) {
      await fs.rm(path.join(ROOT, relative), { recursive: true, force: true });
    }
  }
  return listSkills();
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
