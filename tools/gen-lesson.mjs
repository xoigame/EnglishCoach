#!/usr/bin/env node
// Generate one lesson by piping a prompt into an AI CLI, then write data/lessons/<id>.json
// and rebuild data/index.json.
//
//   node tools/gen-lesson.mjs --topic "Đặt phòng khách sạn" --level A2 --partner "Lễ tân" --turns 12
//   node tools/gen-lesson.mjs --topic "Phỏng vấn xin việc" --level B1 --dry-run   # chỉ in prompt
//   node tools/gen-lesson.mjs --topic "..." --from-file reply.json                # bỏ qua CLI
//
// Chọn CLI khác qua env:  AI_CLI=codex AI_CLI_ARGS="exec" node tools/gen-lesson.mjs ...

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPrompt, slugify } from '../assets/js/prompt.js';
// normalizeLesson is pure (no browser globals at import time) so Node can reuse it.
import { normalizeLesson } from '../assets/js/store.js';
import { buildIndex } from './build-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LESSON_DIR = path.join(ROOT, 'data', 'lessons');

const { values } = parseArgs({
  options: {
    topic: { type: 'string' },
    level: { type: 'string', default: 'A2' },
    partner: { type: 'string', default: '' },
    turns: { type: 'string', default: '12' },
    notes: { type: 'string', default: '' },
    id: { type: 'string', default: '' },
    'from-file': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help || (!values.topic && !values['from-file'])) {
  console.log(`
Soạn giáo án tiếng Anh bằng AI CLI.

  --topic      <text>   Chủ đề (bắt buộc)
  --level      A1..C1   Trình độ (mặc định A2)
  --partner    <text>   Vai của AI trong hội thoại
  --turns      <n>      Số lượt hội thoại (6-30, mặc định 12)
  --notes      <text>   Yêu cầu thêm
  --id         <slug>   Ghi đè id (mặc định tạo từ chủ đề)
  --from-file  <path>   Đọc JSON đã có sẵn thay vì gọi CLI
  --dry-run             Chỉ in prompt ra màn hình
  --force               Ghi đè bài đã tồn tại

Env: AI_CLI (mặc định "claude"), AI_CLI_ARGS (mặc định "-p")
`.trim());
  process.exit(values.help ? 0 : 1);
}

const level = String(values.level).toUpperCase();
if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(level)) {
  fail(`--level phải là A1, A2, B1, B2 hoặc C1 (nhận được "${values.level}").`);
}

const id = values.id || slugify(values.topic || 'lesson');
const prompt = buildPrompt({ ...values, level, id });

if (values['dry-run']) {
  console.log(prompt);
  process.exit(0);
}

const target = path.join(LESSON_DIR, `${id}.json`);
if (existsSync(target) && !values.force && !values['from-file']) {
  fail(`Đã có ${path.relative(ROOT, target)}. Dùng --force để ghi đè hoặc --id để đổi tên.`);
}

const raw = values['from-file']
  ? await readFile(path.resolve(values['from-file']), 'utf8')
  : await runCli(prompt);

let lesson;
try {
  lesson = normalizeLesson(JSON.parse(extractJson(raw)));
} catch (err) {
  const dump = path.join(ROOT, 'data', `.last-raw-${id}.txt`);
  await writeFile(dump, raw, 'utf8');
  fail(`AI trả về dữ liệu không dùng được: ${err.message}\nĐã lưu nguyên văn ở ${path.relative(ROOT, dump)}`);
}

if (lesson.id !== id) lesson.id = id;   // keep filename and id in sync

await mkdir(LESSON_DIR, { recursive: true });
await writeFile(target, JSON.stringify(lesson, null, 2) + '\n', 'utf8');
const count = await buildIndex(ROOT);

console.log(`✅ ${path.relative(ROOT, target)}`);
console.log(`   ${lesson.title} · ${lesson.level} · ${lesson.dialogue.turns.length} lượt · ${lesson.vocab.length} từ vựng`);
console.log(`📇 data/index.json: ${count} bài học`);
console.log(`\nXem thử:   npx serve .        rồi mở http://localhost:3000/#/lesson/${id}`);
console.log(`Đăng bài:  git add data && git commit -m "lesson: ${id}" && git push`);

/* ------------------------------------------------------------ helpers */

function runCli(text) {
  const cmd = process.env.AI_CLI || 'claude';
  const args = (process.env.AI_CLI_ARGS ?? '-p').split(' ').filter(Boolean);
  process.stderr.write(`⏳ Đang gọi: ${cmd} ${args.join(' ')} (prompt qua stdin)…\n`);

  return new Promise((resolve, reject) => {
    // Windows needs a shell to run the .cmd shims npm installs; passing the whole
    // line as one string keeps Node from warning about unescaped shell args.
    const useShell = process.platform === 'win32';
    const child = useShell
      ? spawn([cmd, ...args].join(' '), [], { shell: true, stdio: ['pipe', 'pipe', 'inherit'] })
      : spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('error', err => reject(new Error(
      err.code === 'ENOENT'
        ? `Không tìm thấy lệnh "${cmd}". Cài Claude Code CLI hoặc đặt env AI_CLI.`
        : err.message)));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`"${cmd}" thoát với mã ${code}.`));
      resolve(out);
    });
    child.stdin.write(text);
    child.stdin.end();
  }).catch(err => fail(err.message));
}

/** Pull the JSON object out of a reply that may be wrapped in prose or fences. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('không tìm thấy object JSON nào trong output.');
  return body.slice(start, end + 1);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
