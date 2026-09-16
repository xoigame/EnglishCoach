#!/usr/bin/env node
// Soạn MỘT giáo án bằng AI CLI (mặc định Codex).
//
//   node tools/gen-lesson.mjs --topic "Đặt phòng khách sạn" --level A2 --partner "Lễ tân"
//   node tools/gen-lesson.mjs --topic "Phỏng vấn" --level B1 --dry-run     # chỉ in prompt
//   node tools/gen-lesson.mjs --topic "..." --from-file reply.json         # bỏ qua CLI

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { buildPrompt, slugify } from '../assets/js/prompt.js';
import { generateLesson, ROOT } from './generate.mjs';
import { describeCli } from './ai-cli.mjs';
import { buildIndex } from './build-index.mjs';

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
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help || !values.topic) {
  const { cmd, args } = describeCli();
  console.log(`
Soạn một giáo án tiếng Anh bằng AI CLI.

  --topic      <text>   Chủ đề (bắt buộc)
  --level      A1..C1   Trình độ (mặc định A2)
  --partner    <text>   Vai của AI trong hội thoại
  --turns      <n>      Số lượt hội thoại (6-30, mặc định 12)
  --notes      <text>   Yêu cầu thêm
  --id         <slug>   Ghi đè id (mặc định tạo từ chủ đề)
  --from-file  <path>   Đọc JSON có sẵn thay vì gọi CLI
  --dry-run             Chỉ in prompt ra màn hình
  --force               Ghi đè bài đã tồn tại
  --quiet               Không in log của CLI

CLI đang dùng: ${cmd} ${args.join(' ')}
Đổi bằng env AI_CLI (codex | claude | lệnh khác) và AI_CLI_ARGS.
`.trim());
  process.exit(values.help ? 0 : 1);
}

if (values['dry-run']) {
  console.log(buildPrompt({ ...values, level: String(values.level).toUpperCase(), id: values.id || slugify(values.topic) }));
  process.exit(0);
}

const { cmd, args } = describeCli();
if (!values['from-file']) console.error(`⏳ ${cmd} ${args.join(' ')} — đang soạn "${values.topic}"…`);

try {
  const { lesson, file } = await generateLesson({
    ...values,
    turns: Number(values.turns),
    raw: values['from-file'] ? await readFile(path.resolve(values['from-file']), 'utf8') : undefined,
    onLog: values.quiet ? undefined : line => process.stderr.write(`   ${line}\n`),
  });
  const count = await buildIndex(ROOT);

  console.log(`✅ ${path.relative(ROOT, file)}`);
  console.log(`   ${lesson.title} · ${lesson.level} · ${lesson.dialogue.turns.length} lượt · ${lesson.vocab.length} từ vựng`);
  console.log(`📇 data/index.json: ${count} bài học`);
  console.log(`\nXem thử:  npx serve .   →  http://localhost:3000/#/lesson/${lesson.id}`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
