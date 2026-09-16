#!/usr/bin/env node
// Web server tĩnh, không cần cài gì thêm (npx serve phải tải về mỗi lần).
//
// Kèm một API nhỏ chỉ chạy ở máy bạn, để chế độ "Hội thoại tự do" trên trang
// web nói chuyện được với Codex CLI mà không cần API key nào:
//     GET  /api/status   trang web dò xem có đang chạy ở máy không
//     POST /api/chat     một lượt hội thoại, trả về {en, fix, tip, threadId}
//
// Server chỉ bind vào 127.0.0.1 nên không ai trong cùng mạng LAN gọi được
// Codex qua máy bạn. Trên GitHub Pages không có API này, và trang web tự
// quay về chế độ Kịch bản.
//
//   node tools/serve.mjs            → http://localhost:4173
//   node tools/serve.mjs --port 8080
//   node tools/serve.mjs --no-api   → tắt hẳn phần gọi Codex

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { ROOT } from './generate.mjs';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '4173' },
    'no-api': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log('node tools/serve.mjs [--port 4173] [--no-api]');
  process.exit(0);
}

const apiOn = !values['no-api'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    if (!apiOn) return json(res, 404, { error: 'API đang tắt (--no-api).' });
    return handleApi(url, req, res);
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';

  // Chỉ phục vụ file nằm trong thư mục dự án.
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) throw new Error('directory');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(`404 — không có ${rel}`);
  }
});

/* ---------------------------------------------------------------- API */

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) { req.destroy(); reject(new Error('Yêu cầu quá lớn.')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleApi(url, req, res) {
  const { chatTurn, isRunning } = await import('./codex-chat.mjs');
  const { describeCli, resolveCommand } = await import('./ai-cli.mjs');

  if (url.pathname === '/api/status') {
    const { cmd } = describeCli();
    return json(res, 200, {
      ok: true,
      cli: cmd,
      installed: Boolean(resolveCommand(cmd)),
      warm: isRunning(),
    });
  }

  if (url.pathname === '/api/chat') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Dùng POST.' });
    try {
      const { lesson, userText, threadId } = JSON.parse(await readBody(req));
      if (!lesson?.dialogue || !userText) return json(res, 400, { error: 'Thiếu lesson hoặc userText.' });
      const turn = await chatTurn({ lesson, userText, threadId });
      console.log(`   💬 ${turn.ms} ms — "${String(userText).slice(0, 40)}"`);
      return json(res, 200, turn);
    } catch (err) {
      console.error(`   ⚠️  ${err.message}`);
      return json(res, 500, { error: err.message });
    }
  }

  return json(res, 404, { error: 'Không có endpoint này.' });
}

/* ------------------------------------------------------------- khởi động */

const port = Number(values.port) || 4173;

// Chỉ 127.0.0.1: máy khác trong mạng không gọi được Codex qua máy bạn.
server.listen(port, '127.0.0.1', () => {
  console.log(`🌐 http://localhost:${port}`);
  console.log(`   phục vụ ${ROOT}`);
  if (apiOn) {
    const { cmd } = describeCliSync();
    console.log(`   🤖 Hội thoại tự do dùng ${cmd} CLI — không cần API key.`);
  } else {
    console.log('   🤖 API Codex đang tắt (--no-api).');
  }
  console.log('   Ctrl+C để dừng. Dùng Chrome hoặc Edge để micro hoạt động.');
});

function describeCliSync() {
  return { cmd: process.env.AI_CLI || 'codex' };
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (apiOn) {
      try { (await import('./codex-chat.mjs')).shutdown(); } catch { /* chưa nạp */ }
    }
    process.exit(0);
  });
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Cổng ${port} đang bận. Thử: node tools/serve.mjs --port ${port + 1}`);
    process.exit(1);
  }
  throw err;
});
