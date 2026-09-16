#!/usr/bin/env node
// Web server tĩnh, không cần cài gì thêm (npx serve phải tải về mỗi lần).
//   node tools/serve.mjs            → http://localhost:4173
//   node tools/serve.mjs --port 8080

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { ROOT } from './generate.mjs';

const { values } = parseArgs({
  options: { port: { type: 'string', default: '4173' }, help: { type: 'boolean', short: 'h' } },
});

if (values.help) {
  console.log('node tools/serve.mjs [--port 4173]');
  process.exit(0);
}

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

const port = Number(values.port) || 4173;
server.listen(port, () => {
  console.log(`🌐 http://localhost:${port}`);
  console.log(`   phục vụ ${ROOT}`);
  console.log('   Ctrl+C để dừng. Dùng Chrome hoặc Edge để micro hoạt động.');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Cổng ${port} đang bận. Thử: node tools/serve.mjs --port ${port + 1}`);
    process.exit(1);
  }
  throw err;
});
