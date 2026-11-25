import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const HOME = process.env.DSH_HOME && process.env.DSH_HOME.trim()
  ? process.env.DSH_HOME.trim()
  : path.join(os.homedir(), '.dsh');

function engineCandidates() {
  return [
    process.env.DSH_SCISIDEBAND_LATEX_ENGINE,
    path.join(HOME, 'sci-sideband', 'bin', process.platform === 'win32' ? 'tectonic.exe' : 'tectonic'),
    path.join(ROOT, 'bin', process.platform === 'win32' ? 'tectonic.exe' : 'tectonic'),
    'tectonic',
    'pdflatex',
  ].filter(Boolean);
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function runProcess(command, args, { cwd, timeoutMs = 180000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

export async function findLatexEngine() {
  for (const candidate of engineCandidates()) {
    if (candidate === 'tectonic' || candidate === 'pdflatex') return { command: candidate, kind: candidate === 'tectonic' ? 'tectonic' : 'pdflatex' };
    if (await fileExists(candidate)) {
      return { command: candidate, kind: /tectonic/i.test(candidate) ? 'tectonic' : 'pdflatex' };
    }
  }
  return null;
}

export async function compileLatexPdf(latex, { timeoutMs = 180000 } = {}) {
  const engine = await findLatexEngine();
  if (!engine) throw new Error('未找到 LaTeX 引擎。请安装 Tectonic 或 TeX Live，并把 tectonic.exe 放到 ~/.dsh/sci-sideband/bin/。');
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-sci-pdf-'));
  const texFile = path.join(workDir, 'main.tex');
  const pdfFile = path.join(workDir, 'main.pdf');
  await fs.writeFile(texFile, latex, 'utf8');
  const args = engine.kind === 'tectonic'
    ? ['--outdir', workDir, '--keep-logs', texFile]
    : ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', workDir, texFile];
  const result = await runProcess(engine.command, args, { cwd: workDir, timeoutMs });
  let pdf;
  try {
    pdf = await fs.readFile(pdfFile);
  } catch {
    pdf = null;
  }
  let log = '';
  try {
    log = await fs.readFile(path.join(workDir, 'main.log'), 'utf8');
  } catch {
    log = `${result.stdout}\n${result.stderr}`;
  }
  if (!result.ok || !pdf) {
    throw new Error(`LaTeX 编译失败（${engine.kind}）：${(log || result.stderr || '').slice(-2000)}`);
  }
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  return { pdf, engine: engine.command, log };
}
