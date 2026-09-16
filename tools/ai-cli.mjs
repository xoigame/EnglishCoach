// Runs an AI CLI non-interactively: prompt in on stdin, final answer out.
//
// Preset chosen with AI_CLI (codex | claude | <lệnh bất kỳ>).
// Với lệnh tự đặt, dùng AI_CLI_ARGS và hai placeholder:
//   {{OUT}}     file chứa câu trả lời cuối (nếu có, stdout bị bỏ qua)
//   {{SCHEMA}}  đường dẫn tools/lesson.schema.json

import { spawn } from 'node:child_process';
import { readFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.join(HERE, 'lesson.schema.json');

const PRESETS = {
  codex: {
    cmd: 'codex',
    args: ['exec', '--skip-git-repo-check', '-s', 'read-only', '--color', 'never',
      '--output-schema', '{{SCHEMA}}', '-o', '{{OUT}}', '-'],
  },
  claude: { cmd: 'claude', args: ['-p'] },
};

export function describeCli() {
  const name = process.env.AI_CLI || 'codex';
  const preset = PRESETS[name];
  const cmd = preset ? preset.cmd : name;
  const args = process.env.AI_CLI_ARGS ? process.env.AI_CLI_ARGS.split(' ').filter(Boolean)
    : preset ? preset.args : ['-p'];
  return { cmd, args };
}

/**
 * @param {string} prompt
 * @param {{timeoutMs?: number, onLog?: (line: string) => void}} [opts]
 * @returns {Promise<string>} câu trả lời cuối cùng của model
 */
export async function runAi(prompt, { timeoutMs = 15 * 60_000, onLog } = {}) {
  const { cmd, args: template } = describeCli();

  const needsOut = template.some(a => a.includes('{{OUT}}'));
  const dir = needsOut ? await mkdtemp(path.join(tmpdir(), 'english-coach-')) : null;
  const outFile = needsOut ? path.join(dir, 'answer.txt') : null;
  const args = template.map(a =>
    a.replace('{{OUT}}', outFile ?? '').replace('{{SCHEMA}}', SCHEMA_PATH));

  const stdout = await spawnCli(cmd, args, prompt, timeoutMs, onLog);

  if (!outFile) return stdout;
  try {
    return await readFile(outFile, 'utf8');
  } catch {
    // CLI thoát 0 nhưng không ghi file — quay về dùng stdout.
    return stdout;
  } finally {
    await unlink(outFile).catch(() => {});
  }
}

function spawnCli(cmd, args, prompt, timeoutMs, onLog) {
  return new Promise((resolve, reject) => {
    // Windows cần shell để chạy các .cmd shim do npm cài; gộp thành một chuỗi
    // để Node không cảnh báo về shell args chưa escape.
    const win = process.platform === 'win32';
    const child = win
      ? spawn([cmd, ...args].join(' '), [], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`"${cmd}" chạy quá ${Math.round(timeoutMs / 60000)} phút, đã huỷ.`));
    }, timeoutMs);

    child.stdout.on('data', d => {
      const text = String(d);
      out += text;
      if (onLog) text.split('\n').filter(Boolean).forEach(onLog);
    });
    child.stderr.on('data', d => { err += d; });

    child.on('error', e => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT'
        ? `Không tìm thấy lệnh "${cmd}". Cài đặt nó hoặc đặt env AI_CLI.`
        : e.message));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = (err || out).trim().split('\n').slice(-12).join('\n');
        return reject(new Error(`"${cmd}" thoát với mã ${code}.\n${tail}`));
      }
      resolve(out);
    });

    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
