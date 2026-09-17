#!/usr/bin/env node
// Soạn cả lộ trình trong data/curriculum.json bằng AI CLI.
//
//   node tools/gen-series.mjs                 # soạn mọi bài còn thiếu
//   node tools/gen-series.mjs --level A2      # chỉ một trình độ
//   node tools/gen-series.mjs --only dat-phong-khach-san,di-taxi-va-grab
//   node tools/gen-series.mjs --limit 5 --jobs 3
//   node tools/gen-series.mjs --list          # xem bài nào đã có, bài nào chưa

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { generateLesson, lessonExists, ROOT } from './generate.mjs';
import { prettyCli, AiCliError } from './ai-cli.mjs';
import { buildIndex } from './build-index.mjs';

const { values } = parseArgs({
  options: {
    level: { type: 'string', default: '' },
    only: { type: 'string', default: '' },
    limit: { type: 'string', default: '0' },
    jobs: { type: 'string', default: '2' },
    force: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  console.log(`
Soạn hàng loạt giáo án theo data/curriculum.json.

  --level  A1..C1        Chỉ soạn một trình độ
  --only   id1,id2       Chỉ soạn các id này
  --limit  <n>           Dừng sau n bài (0 = không giới hạn)
  --jobs   <n>           Số bài chạy song song (mặc định 2)
  --force                Soạn lại cả bài đã có
  --list                 Chỉ liệt kê trạng thái, không gọi AI
`.trim());
  process.exit(0);
}

const curriculum = JSON.parse(await readFile(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
const onlyIds = values.only ? new Set(values.only.split(',').map(s => s.trim()).filter(Boolean)) : null;

const turnsByLevel = curriculum.turnsByLevel || {};
const all = curriculum.themes.flatMap(theme =>
  theme.topics.map(t => ({
    id: t.id,
    topic: t.topic,
    level: t.level,
    partner: t.partner || '',
    turns: t.turns || turnsByLevel[t.level] || 12,
    notes: t.notes || '',
    unit: theme.name,
  })));

const selected = all.filter(t =>
  (!values.level || t.level === values.level.toUpperCase()) &&
  (!onlyIds || onlyIds.has(t.id)));

if (values.list) {
  let have = 0;
  for (const theme of curriculum.themes) {
    console.log(`\n${theme.name}`);
    for (const t of theme.topics) {
      const ok = lessonExists(t.id);
      if (ok) have++;
      console.log(`  ${ok ? '✅' : '⬜'} [${t.level}] ${t.id}  —  ${t.topic}`);
    }
  }
  console.log(`\n${have}/${all.length} bài đã soạn.`);
  process.exit(0);
}

const todo = values.force ? selected : selected.filter(t => !lessonExists(t.id));
const limit = Number(values.limit) || 0;
const queue = limit ? todo.slice(0, limit) : todo;

if (!queue.length) {
  console.log('✨ Không còn bài nào cần soạn. Dùng --force để soạn lại.');
  process.exit(0);
}

const jobs = Math.max(1, Math.min(4, Number(values.jobs) || 2));
console.log(`⏳ Soạn ${queue.length} bài, ${jobs} luồng song song.`);
console.log(`   ${prettyCli()}`);
console.log(`   Transcript từng bài: logs/gen-<id>.log\n`);

const started = Date.now();
const done = [];
const failed = [];
let next = 0;
let halted = '';   // hết quota cả tài khoản: dừng, chạy tiếp cũng vô ích

await Promise.all(Array.from({ length: jobs }, async () => {
  while (next < queue.length && !halted) {
    const task = queue[next++];
    const n = `${done.length + failed.length + 1}/${queue.length}`;
    try {
      const { lesson } = await generateLesson({ ...task, force: true });
      done.push(task.id);
      console.log(`✅ ${n} ${task.level} ${task.id} — ${lesson.dialogue.turns.length} lượt, ${lesson.vocab.length} từ, ${lesson.commonMistakes.length} lỗi hay gặp`);
    } catch (err) {
      failed.push({ id: task.id, msg: err.message });
      console.error(`❌ ${n} ${task.level} ${task.id} — ${err.message.split('\n')[0]}`);
      if (err instanceof AiCliError && err.tail) {
        console.error(err.tail.split('\n').map(l => `   ${l}`).join('\n'));
      }
      if (err instanceof AiCliError && err.kind === 'quota') {
        halted = 'Tài khoản hết quota hoặc bị giới hạn tốc độ — dừng cả loạt, chờ reset rồi chạy lại.';
      }
    }
    await buildIndex(ROOT).catch(() => {});
  }
}));

const mins = ((Date.now() - started) / 60000).toFixed(1);
const count = await buildIndex(ROOT);
console.log(`\n🏁 Xong sau ${mins} phút · ${done.length} thành công · ${failed.length} lỗi · index có ${count} bài.`);
if (halted) console.log(`\n⛔ ${halted}`);
const left = queue.length - done.length - failed.length;
if (left > 0) console.log(`   Còn ${left} bài chưa chạy — chạy lại lệnh cũ, bài đã có sẽ tự bỏ qua.`);
if (failed.length) {
  console.log('\nSoạn lại các bài lỗi:');
  console.log(`  node tools/gen-series.mjs --only ${failed.map(f => f.id).join(',')}`);
  process.exit(1);
}
