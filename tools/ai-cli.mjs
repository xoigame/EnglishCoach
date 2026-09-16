// Runs an AI CLI non-interactively: prompt in, final answer out.
//
// Cách nối CLI ở đây học từ factory/providers/base.py của AI-Unity-Game-Factory,
// nơi ba thứ dưới đây đã được trả giá bằng những lần "chạy xong mà không ra gì":
//
//   1. Windows cài CLI qua npm dưới dạng .cmd shim, spawn('codex') báo ENOENT
//      dù `where codex` vẫn thấy. Phải tự dò ra đường dẫn đầy đủ KÈM đuôi —
//      và trên Node còn phải đi thêm một bước nữa, xem resolveCommand() bên
//      dưới. Mục đích là spawn thẳng, KHÔNG qua shell, để prompt không bao giờ
//      bị escape sai dấu nháy.
//   2. Prompt đi bằng ARGV, không bằng stdin. Phiên headless mà stdin đã bị
//      prompt chiếm thì mọi câu hỏi xin quyền của CLI không ai trả lời được:
//      thao tác bị từ chối im lặng, CLI vẫn thoát 0, và ta tưởng là thành công.
//   3. Hết token có hai kiểu khác hẳn nhau: hết quota cả tài khoản (phải dừng
//      cả loạt, chờ reset) và tràn context của riêng lượt đó (chỉ bài đó hỏng).
//      Phân biệt được thì mới biết nên dừng hay chạy tiếp.
//
// Preset chọn bằng AI_CLI (codex | claude | <lệnh bất kỳ>).
// Với lệnh tự đặt, dùng AI_CLI_ARGS và các placeholder:
//   {{PROMPT}}  prompt (không có placeholder này thì prompt đi qua stdin)
//   {{OUT}}     file chứa câu trả lời cuối (nếu có, stdout bị bỏ qua)
//   {{SCHEMA}}  đường dẫn tools/lesson.schema.json
//   {{CWD}}     thư mục gốc dự án

import { spawn } from 'node:child_process';
import { readFile, unlink, mkdtemp, mkdir, open } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const SCHEMA_PATH = path.join(HERE, 'lesson.schema.json');

const PRESETS = {
  codex: {
    cmd: 'codex',
    args: ['exec', '--cd', '{{CWD}}', '--skip-git-repo-check', '-s', 'read-only',
      '--color', 'never', '--output-schema', '{{SCHEMA}}', '-o', '{{OUT}}', '{{PROMPT}}'],
  },
  claude: { cmd: 'claude', args: ['-p', '{{PROMPT}}'] },
};

export function describeCli() {
  const name = process.env.AI_CLI || 'codex';
  const preset = PRESETS[name];
  const cmd = preset ? preset.cmd : name;
  const args = process.env.AI_CLI_ARGS ? process.env.AI_CLI_ARGS.split(' ').filter(Boolean)
    : preset ? preset.args : ['-p', '{{PROMPT}}'];
  return { cmd, args };
}

/** Dòng lệnh dạng người đọc được, cho log và màn hình. */
export function prettyCli() {
  const { cmd, args } = describeCli();
  const shown = args.map(a => a
    .replace('{{PROMPT}}', '<prompt>')
    .replace('{{OUT}}', '<file kết quả>')
    .replace('{{SCHEMA}}', 'tools/lesson.schema.json')
    .replace('{{CWD}}', '.'));
  return `${cmd} ${shown.join(' ')}`;
}

/** Full path of `cmd` including the extension Windows needs (npm .cmd shims). */
export function which(cmd) {
  if (cmd.includes('/') || cmd.includes('\\')) return existsSync(cmd) ? cmd : null;
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

/**
 * Cái gì thực sự được spawn.
 *
 * Node >= 20 từ chối spawn .cmd/.bat nếu không bật shell (CVE-2024-27980) —
 * khác Python, nên mẹo "dò ra đường dẫn đầy đủ rồi spawn thẳng" của
 * AI-Unity-Game-Factory phải đi thêm một bước trên Windows: đọc luôn shim để
 * lấy file .js thật rồi chạy bằng chính node đang chạy. Nhờ vậy vẫn không cần
 * shell, tức là vẫn không có chuyện escape sai dấu nháy trong prompt.
 *
 * @returns {{exe: string, prefixArgs: string[]}|null}
 */
export function resolveCommand(cmd) {
  const found = which(cmd);
  if (!found) return null;
  if (!/\.(cmd|bat)$/i.test(found)) return { exe: found, prefixArgs: [] };

  let shim = '';
  try { shim = readFileSync(found, 'utf8'); } catch { return null; }

  const dir = path.dirname(found);
  const expand = p => path.normalize(p.replace(/%~?dp0%/gi, dir + path.sep));

  const js = shim.match(/"([^"]*%~?dp0%[^"]*\.js)"/i) || shim.match(/"([^"]*\.js)"/i);
  if (js) return { exe: process.execPath, prefixArgs: [expand(js[1])] };

  const exe = shim.match(/"([^"]*%~?dp0%[^"]*\.exe)"/i);
  if (exe && !/node\.exe$/i.test(exe[1])) {
    const full = expand(exe[1]);
    if (existsSync(full)) return { exe: full, prefixArgs: [] };
  }
  return null;
}

/* ------------------------------------------------------- hết token ở đâu */

const QUOTA_RE = /rate[\s_-]?limit|too many requests|\b429\b|quota|insufficient_quota|usage limit|billing|overloaded|capacity|not logged in|unauthorized|\b401\b/i;
const CONTEXT_RE = /context[\s_-]?length|maximum context|context_length_exceeded|context window|reduce the length|too many tokens|token limit|prompt is too long/i;

/** 'quota' (dừng cả loạt) | 'context' (chỉ bài này) | null */
export function classifyExhaustion(text) {
  if (!text) return null;
  if (QUOTA_RE.test(text)) return 'quota';
  if (CONTEXT_RE.test(text)) return 'context';
  return null;
}

export class AiCliError extends Error {
  constructor(message, { kind = null, tail = '' } = {}) {
    super(message);
    this.name = 'AiCliError';
    this.kind = kind;     // null | 'quota' | 'context'
    this.tail = tail;
  }
}

/* -------------------------------------------------------------- chạy CLI */

/**
 * @param {string} prompt
 * @param {{timeoutMs?: number, logFile?: string, onLog?: (line: string) => void}} [opts]
 * @returns {Promise<string>} câu trả lời cuối cùng của model
 */
export async function runAi(prompt, { timeoutMs = 15 * 60_000, logFile, onLog } = {}) {
  const { cmd, args: template } = describeCli();

  const resolved = resolveCommand(cmd);
  if (!resolved) {
    throw new AiCliError(
      `Không chạy được lệnh "${cmd}". Cài nó (npm i -g @openai/codex) hoặc đặt env AI_CLI.`);
  }

  const needsOut = template.some(a => a.includes('{{OUT}}'));
  const dir = needsOut ? await mkdtemp(path.join(tmpdir(), 'english-coach-')) : null;
  const outFile = needsOut ? path.join(dir, 'answer.txt') : null;

  const viaArgv = template.some(a => a.includes('{{PROMPT}}'));
  const args = template.map(a => a
    .replace('{{OUT}}', outFile ?? '')
    .replace('{{SCHEMA}}', SCHEMA_PATH)
    .replace('{{CWD}}', ROOT)
    .replace('{{PROMPT}}', prompt));

  const stdout = await spawnCli(resolved.exe, [...resolved.prefixArgs, ...args],
    viaArgv ? null : prompt, { timeoutMs, logFile, onLog, label: cmd });

  if (!outFile) return stdout;
  try {
    return await readFile(outFile, 'utf8');
  } catch {
    return stdout;   // CLI thoát 0 nhưng không ghi file — quay về dùng stdout.
  } finally {
    await unlink(outFile).catch(() => {});
  }
}

async function spawnCli(exe, args, stdinText, { timeoutMs, logFile, onLog, label }) {
  // Ghi transcript ra file để xem TRỰC TIẾP trong lúc chạy:
  //   PowerShell:  Get-Content logs/<file>.log -Wait
  let log = null;
  if (logFile) {
    await mkdir(path.dirname(logFile), { recursive: true });
    log = await open(logFile, 'w');
    const shown = args.map(a => (a.length <= 120 ? a : a.slice(0, 120) + '…')).join(' ');
    await log.write(`$ ${exe} ${shown}\n\n`);
  }

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(exe, args, {
        cwd: ROOT,
        // stdin để trống: phiên headless không ai trả lời được câu hỏi xin quyền,
        // nên đừng để CLI tưởng còn kênh tương tác.
        stdio: [stdinText ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });

      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new AiCliError(`"${label}" chạy quá ${Math.round(timeoutMs / 60000)} phút, đã huỷ.`));
      }, timeoutMs);

      const absorb = (chunk, isErr) => {
        const text = String(chunk);
        if (isErr) err += text; else out += text;
        log?.write(text).catch(() => {});
        if (onLog) text.split('\n').filter(Boolean).forEach(onLog);
      };
      child.stdout.on('data', d => absorb(d, false));
      child.stderr.on('data', d => absorb(d, true));

      child.on('error', e => {
        clearTimeout(timer);
        reject(new AiCliError(`Không chạy được "${label}": ${e.message}`));
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) return resolve(out);
        const blob = `${err}\n${out}`;
        reject(new AiCliError(`"${label}" thoát với mã ${code}.`, {
          kind: classifyExhaustion(blob),
          tail: meaningfulTail(blob),
        }));
      });

      if (stdinText) {
        child.stdin.on('error', () => {});
        child.stdin.write(stdinText);
        child.stdin.end();
      }
    });
  } finally {
    await log?.close().catch(() => {});
  }
}

/** Phần output thật sự đáng đọc khi CLI lỗi — bỏ ANSI và stack frame của node. */
function meaningfulTail(text) {
  return String(text)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.trim() && !/^\s*at\s/.test(l))
    .slice(-8)
    .join('\n');
}
