#!/usr/bin/env node
// Kiểm tra sức khoẻ dự án trước khi soạn bài hoặc trước khi push.
//   node tools/doctor.mjs
//
// Thoát mã 1 nếu có lỗi thật (❌). Cảnh báo (⚠️) không làm đỏ CI.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { normalizeLesson } from '../assets/js/store.js';
import { ROOT, LESSON_DIR } from './generate.mjs';
import { describeCli, resolveCommand, prettyCli, SCHEMA_PATH } from './ai-cli.mjs';

let errors = 0;
let warnings = 0;

const ok = m => console.log(`✅ ${m}`);
const warn = m => { warnings++; console.log(`⚠️  ${m}`); };
const bad = m => { errors++; console.log(`❌ ${m}`); };
const head = m => console.log(`\n── ${m} ──`);

/* ----------------------------------------------------------- môi trường */

head('Môi trường');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} — cần Node 20 trở lên (parseArgs, fetch, --output-schema).`);

// Trong CI không ai soạn bài, chỉ kiểm tra dữ liệu — thiếu CLI ở đó là bình thường.
const inCi = Boolean(process.env.CI);
const { cmd } = describeCli();
const resolved = resolveCommand(cmd);
if (!resolved) {
  const msg = `Không chạy được "${cmd}". Cài bằng: npm install -g @openai/codex`;
  if (inCi) warn(`${msg} (bỏ qua vì đang chạy trong CI)`);
  else bad(msg);
} else {
  const via = resolved.prefixArgs.length ? ` (qua ${path.basename(resolved.prefixArgs[0])})` : '';
  ok(`Tìm thấy "${cmd}"${via}`);
  const version = await run(resolved, ['--version'], 20_000);
  if (version.code === 0) ok(`Phiên bản: ${version.out.trim().split('\n')[0]}`);
  else warn(`"${cmd} --version" thoát mã ${version.code} — CLI có thể chưa dùng được.`);
}
console.log(`   Lệnh sẽ gọi: ${prettyCli()}`);

if (existsSync(SCHEMA_PATH)) {
  try {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    ok(`Schema hợp lệ, ${schema.required.length} trường bắt buộc`);
  } catch (err) { bad(`tools/lesson.schema.json hỏng: ${err.message}`); }
} else bad('Thiếu tools/lesson.schema.json');

/* ------------------------------------------------------------ lộ trình */

head('Lộ trình');

const curriculum = JSON.parse(await readFile(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
const planned = new Map();
const dupes = [];
for (const unit of curriculum.units) {
  for (const t of unit.topics) {
    if (planned.has(t.id)) dupes.push(t.id);
    planned.set(t.id, { ...t, level: t.level || unit.level });
  }
}
if (dupes.length) bad(`Trùng id trong curriculum.json: ${dupes.join(', ')}`);
else ok(`${planned.size} chủ đề, không trùng id`);

const files = (await readdir(LESSON_DIR)).filter(f => f.endsWith('.json'));
const have = new Set(files.map(f => path.basename(f, '.json')));
const missing = [...planned.keys()].filter(id => !have.has(id));
const orphans = [...have].filter(id => !planned.has(id));

if (missing.length) warn(`${missing.length} bài chưa soạn: ${preview(missing)}\n   → node tools/gen-series.mjs`);
else ok('Mọi chủ đề trong lộ trình đều đã có giáo án');
if (orphans.length) warn(`${orphans.length} file không còn trong lộ trình: ${preview(orphans)}`);

/* ------------------------------------------------------------ giáo án */

head('Giáo án');

let noListening = 0, noVariations = 0, noCulture = 0, shortDialogue = 0;

for (const file of files) {
  const id = path.basename(file, '.json');
  try {
    const lesson = normalizeLesson(JSON.parse(await readFile(path.join(LESSON_DIR, file), 'utf8')));
    if (lesson.id !== id) bad(`${file}: "id" là "${lesson.id}" nhưng tên file là "${id}"`);
    if (!lesson.dialogue.turns.some(t => t.speaker === lesson.dialogue.userRole)) {
      bad(`${file}: người học không có lượt nói nào`);
    }
    if (!lesson.listening) noListening++;
    if (!lesson.variations.length) noVariations++;
    if (!lesson.culture.length) noCulture++;
    if (lesson.dialogue.turns.length < 8) shortDialogue++;

    const want = planned.get(id);
    if (want && want.level !== lesson.level) {
      warn(`${file}: lộ trình ghi ${want.level} nhưng giáo án ghi ${lesson.level}`);
    }
  } catch (err) {
    bad(`${file}: ${err.message}`);
  }
}

if (!errors) ok(`${files.length} giáo án đều hợp lệ`);
if (noListening) warn(`${noListening} bài chưa có phần nghe hiểu → node tools/gen-series.mjs --force`);
if (noVariations) warn(`${noVariations} bài chưa có phần trang trọng/thân mật`);
if (noCulture) warn(`${noCulture} bài chưa có ghi chú văn hoá`);
if (shortDialogue) warn(`${shortDialogue} bài có hội thoại dưới 8 lượt`);

/* ------------------------------------------------- 10 hội thoại mẫu */

head('Bộ 10 hội thoại mẫu');

const PACK_DIR = path.join(ROOT, 'data', 'packs');
let packFiles = [];
try { packFiles = (await readdir(PACK_DIR)).filter(f => f.endsWith('.json')); } catch { /* chưa có */ }

let packDialogues = 0;
let packTurns = 0;
let thin = 0;

for (const file of packFiles) {
  const id = path.basename(file, '.json');
  try {
    const pack = JSON.parse(await readFile(path.join(PACK_DIR, file), 'utf8'));
    if (pack.id !== id) bad(`packs/${file}: "id" là "${pack.id}" nhưng tên file là "${id}"`);
    if (!have.has(id)) bad(`packs/${file}: không có giáo án tương ứng data/lessons/${id}.json`);
    if (!Array.isArray(pack.dialogues) || !pack.dialogues.length) {
      bad(`packs/${file}: thiếu "dialogues"`);
      continue;
    }
    if (pack.dialogues.length < 10) thin++;
    for (const [i, d] of pack.dialogues.entries()) {
      if (!d.title) bad(`packs/${file}: hội thoại ${i + 1} thiếu "title"`);
      if (!Array.isArray(d.turns) || d.turns.length < 4) {
        bad(`packs/${file}: hội thoại ${i + 1} có dưới 4 lượt`);
        continue;
      }
      if (d.turns[0].speaker !== 'a') warn(`packs/${file}: hội thoại ${i + 1} không bắt đầu bằng vai a`);
      for (const [j, t] of d.turns.entries()) {
        if (!t.en) bad(`packs/${file}: hội thoại ${i + 1} lượt ${j + 1} thiếu "en"`);
        if (!t.vi) warn(`packs/${file}: hội thoại ${i + 1} lượt ${j + 1} thiếu bản dịch`);
      }
      packDialogues++;
      packTurns += d.turns.length;
    }
  } catch (err) {
    bad(`packs/${file}: ${err.message}`);
  }
}

if (packFiles.length) {
  ok(`${packFiles.length}/${planned.size} chủ đề có bộ hội thoại · ${packDialogues} hội thoại · ${packTurns} lượt`);
} else {
  warn('Chưa chủ đề nào có bộ 10 hội thoại mẫu');
}
if (thin) warn(`${thin} bộ có dưới 10 hội thoại`);
const noPack = planned.size - packFiles.length;
if (noPack > 0) warn(`${noPack} chủ đề chưa có bộ hội thoại mẫu`);

/* -------------------------------------------------------------- index */

head('Danh mục & web');

const indexPath = path.join(ROOT, 'data', 'index.json');
if (!existsSync(indexPath)) bad('Thiếu data/index.json → node tools/build-index.mjs');
else {
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const listed = new Set(index.lessons.map(l => l.id));
  const drift = [...have].filter(id => !listed.has(id)).concat([...listed].filter(id => !have.has(id)));
  if (drift.length) bad(`index.json lệch với data/lessons: ${preview(drift)} → node tools/build-index.mjs`);
  else ok(`index.json khớp, ${index.lessons.length} bài`);
}

for (const f of ['index.html', 'assets/js/app.js', 'assets/css/style.css', '.nojekyll']) {
  if (!existsSync(path.join(ROOT, f))) bad(`Thiếu ${f}`);
}

/* ------------------------------------------------------------- tổng kết */

console.log(`\n${errors ? '❌' : '✅'} ${errors} lỗi · ${warnings} cảnh báo`);
process.exit(errors ? 1 : 0);

/* ------------------------------------------------------------- helpers */

function preview(list, n = 4) {
  return list.slice(0, n).join(', ') + (list.length > n ? `, … (+${list.length - n})` : '');
}

function run({ exe, prefixArgs }, args, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(exe, [...prefixArgs, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, out }); }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, out }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
  });
}
