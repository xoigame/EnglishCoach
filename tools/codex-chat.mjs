// Codex CLI làm đối tác hội thoại 1-1.
//
// VÌ SAO KHÔNG GỌI `codex exec` MỖI LƯỢT: đo thực tế trên máy này, một lần
// `codex exec` mất ~11 giây kể cả với prompt "Reply with PONG" — tức là gần
// như toàn bộ là chi phí khởi động tiến trình, không phải thời gian suy nghĩ.
// Mỗi lượt hội thoại 13-16 giây thì không còn là hội thoại nữa.
//
// `codex mcp-server` giữ một tiến trình sống và cho nối tiếp hội thoại theo
// thread. Đo được:
//     khởi tạo thread   13,2 giây  (một lần cho cả buổi)
//     mỗi lượt sau đó    2,5 giây  (codex-reply)
//
// 2,5 giây là nói chuyện được. Đây cũng là giao thức MCP chuẩn, không phải
// `app-server`/`exec-server` đang gắn nhãn experimental.

import { spawn } from 'node:child_process';
import { resolveCommand } from './ai-cli.mjs';

const IDLE_TIMEOUT_MS = 20 * 60_000;   // không ai nói chuyện 20 phút thì tắt

let server = null;

/* ------------------------------------------------------- tiến trình MCP */

function startServer() {
  const resolved = resolveCommand(process.env.AI_CLI || 'codex');
  if (!resolved) {
    throw new Error('Không tìm thấy Codex CLI. Cài bằng: npm install -g @openai/codex');
  }

  const child = spawn(resolved.exe, [...resolved.prefixArgs, 'mcp-server'],
    { stdio: ['pipe', 'pipe', 'pipe'] });

  const state = {
    child,
    nextId: 1,
    pending: new Map(),
    buf: '',
    stderr: '',
    ready: null,
    lastUsed: Date.now(),
  };

  child.stdout.on('data', chunk => {
    state.buf += chunk;
    let i;
    while ((i = state.buf.indexOf('\n')) >= 0) {
      const line = state.buf.slice(0, i).trim();
      state.buf = state.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const waiter = msg.id != null && state.pending.get(msg.id);
      if (waiter) { state.pending.delete(msg.id); waiter(msg); }
    }
  });

  // Codex ghi log và cảnh báo ra stderr; giữ lại phần cuối để báo lỗi cho dễ hiểu.
  child.stderr.on('data', d => { state.stderr = (state.stderr + d).slice(-4000); });

  child.on('exit', code => {
    for (const waiter of state.pending.values()) {
      waiter({ error: { message: `codex mcp-server đã thoát (mã ${code}).` } });
    }
    state.pending.clear();
    if (server === state) server = null;
  });

  state.ready = rpc(state, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'english-coach', version: '1.0.0' },
  }).then(res => {
    if (res.error) throw new Error(res.error.message || 'initialize thất bại');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return res.result;
  });

  return state;
}

function rpc(state, method, params, timeoutMs = 180_000) {
  const id = state.nextId++;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      resolve({ error: { message: `"${method}" không phản hồi sau ${Math.round(timeoutMs / 1000)}s.` } });
    }, timeoutMs);
    state.pending.set(id, msg => { clearTimeout(timer); resolve(msg); });
    state.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function getServer() {
  if (server && !server.child.killed) { server.lastUsed = Date.now(); return server; }
  server = startServer();
  await server.ready;
  scheduleIdleShutdown();
  return server;
}

let idleTimer = null;
function scheduleIdleShutdown() {
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (server && Date.now() - server.lastUsed > IDLE_TIMEOUT_MS) {
      shutdown();
    }
  }, 60_000);
  idleTimer.unref?.();
}

export function shutdown() {
  clearInterval(idleTimer);
  if (server) { try { server.child.kill(); } catch { /* đã tắt */ } server = null; }
}

export function isRunning() { return Boolean(server && !server.child.killed); }

/* ---------------------------------------------------------- hội thoại */

const REPLY_FORMAT = `Reply with ONLY a JSON object, no prose and no code fence:
{"en":"<your in-character reply, 1-2 short sentences>","fix":"<one short spoken English correction if the learner made a real grammar, word-choice or word-order mistake, else an empty string>","tip":"<one short Vietnamese coaching note; if there was no mistake, a short Vietnamese compliment>"}`;

function openingPrompt(lesson, userText) {
  const d = lesson.dialogue;
  const partnerRole = d.userRole === 'a' ? 'b' : 'a';
  const mistakes = (lesson.commonMistakes || []).slice(0, 5)
    .map(m => `- "${m.wrong}" -> "${m.right}"`).join('\n');

  return [
    lesson.roleplay?.persona || 'You are a friendly English conversation partner.',
    `You are role-playing with a Vietnamese learner of English at CEFR level ${lesson.level}.`,
    `Scene: ${lesson.topic}. You play "${d.roles[partnerRole]}"; the learner plays "${d.roles[d.userRole]}".`,
    lesson.roleplay?.goal ? `Conversation goal: ${lesson.roleplay.goal}` : '',
    `You already opened with: "${lesson.roleplay?.opener || 'Hello!'}"`,
    mistakes ? `\nMistakes this lesson targets:\n${mistakes}` : '',
    '',
    'Rules:',
    `- Stay in character. Keep each reply to 1-2 short sentences suited to ${lesson.level}.`,
    '- Ask a follow-up question most turns so the learner keeps talking.',
    '- The learner speaks through speech recognition, so ignore missing punctuation, capitalisation and obvious transcription noise. Only correct real mistakes.',
    '- Never write Vietnamese in "en" or "fix".',
    '- Do not read or write any files. Do not run any commands. Just answer.',
    '',
    REPLY_FORMAT,
    '',
    `The learner said: "${userText}"`,
  ].filter(Boolean).join('\n');
}

/**
 * Một lượt hội thoại.
 * @param {{lesson: object, userText: string, threadId?: string}} opts
 * @returns {Promise<{en: string, fix: string, tip: string, threadId: string, ms: number}>}
 */
export async function chatTurn({ lesson, userText, threadId }) {
  const started = Date.now();
  const state = await getServer();
  state.lastUsed = Date.now();

  const res = threadId
    ? await rpc(state, 'tools/call', {
      name: 'codex-reply',
      arguments: { threadId, prompt: `${REPLY_FORMAT}\n\nThe learner said: "${userText}"` },
    })
    : await rpc(state, 'tools/call', {
      name: 'codex',
      arguments: {
        prompt: openingPrompt(lesson, userText),
        sandbox: 'read-only',
        'approval-policy': 'never',
        config: { model_reasoning_effort: 'low' },
      },
    });

  if (res.error) throw new Error(friendly(res.error.message, state.stderr));

  const structured = res.result?.structuredContent || {};
  const text = structured.content
    ?? res.result?.content?.map(c => c.text).filter(Boolean).join('\n')
    ?? '';

  if (ERROR_TEXT.test(String(text))) throw new Error(friendly(String(text), state.stderr));

  const parsed = parseReply(text);
  if (!parsed) throw new Error(friendly(`Codex trả về dữ liệu không đọc được: ${String(text).slice(0, 200)}`, state.stderr));

  return {
    ...parsed,
    threadId: structured.threadId || threadId || '',
    ms: Date.now() - started,
  };
}

// Codex báo hết quota / chưa đăng nhập bằng cách trả về MỘT CÂU VĂN THƯỜNG
// trong phần nội dung, không phải lỗi JSON-RPC. Nếu không bắt ở đây thì câu
// "You've hit your usage limit..." sẽ được đọc lên như lời của nhân vật.
const ERROR_TEXT = /hit your (?:usage|rate) limit|usage limit|purchase more credits|insufficient quota|not logged in|codex login|unauthorized|forbidden|401|429/i;

function parseReply(text) {
  const body = String(text);
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], body];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      const obj = JSON.parse(c.slice(start, end + 1));
      if (typeof obj.en === 'string' && obj.en.trim()) {
        return { en: obj.en.trim(), fix: String(obj.fix || '').trim(), tip: String(obj.tip || '').trim() };
      }
    } catch { /* thử ứng viên tiếp theo */ }
  }
  // Codex đôi khi trả văn xuôi thay vì JSON — vẫn dùng được làm câu thoại.
  const plain = body.trim();
  return plain ? { en: plain.split('\n')[0].slice(0, 300), fix: '', tip: '' } : null;
}

/** Biến lỗi thô của Codex thành câu người dùng hiểu được. */
function friendly(message, stderr = '') {
  const blob = `${message}\n${stderr}`;
  if (/usage limit|quota|rate limit|429/i.test(blob)) {
    const at = blob.match(/try again at ([0-9: ]+(?:AM|PM)?)/i);
    return `Tài khoản Codex đã hết lượt dùng${at ? `, thử lại sau ${at[1].trim()}` : ''}. Trong lúc chờ, dùng chế độ Kịch bản (không cần quota).`;
  }
  if (/not logged in|unauthorized|401|auth/i.test(blob)) {
    return 'Codex chưa đăng nhập. Chạy: codex login';
  }
  if (/ENOENT|Không tìm thấy Codex/i.test(blob)) {
    return 'Không tìm thấy Codex CLI. Cài bằng: npm install -g @openai/codex';
  }
  return message;
}
