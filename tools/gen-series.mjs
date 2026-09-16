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
import { describeCli } from './ai-cli.mjs';
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

const all = curriculum.units.flatMap(unit =>
  unit.topics.map(t => ({
    id: t.id,
    topic: t.topic,
    level: t.level || unit.level,
    partner: t.partner || '',
    turns: t.turns || unit.turns || 12,
    notes: t.notes || '',
    unit: unit.name,
  })));

const selected = all.filter(t =>
  (!values.level || t.level === values.level.toUpperCase()) &&
  (!onlyIds || onlyIds.has(t.id)));

if (values.list) {
  let have = 0;
  for (const unit of curriculum.units) {
    console.log(`\n${unit.level} · ${unit.name}`);
    for (const t of unit.topics) {
      const ok = lessonExists(t.id);
      if (ok) have++;
      console.log(`  ${ok ? '✅' : '⬜'} ${t.id}  —  ${t.topic}`);
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

const { cmd, args } = describeCli();
const jobs = Math.max(1, Math.min(4, Number(values.jobs) || 2));
console.log(`⏳ Soạn ${queue.length} bài bằng "${cmd} ${args.join(' ')}", ${jobs} luồng song song.\n`);

const started = Date.now();
const done = [];
const failed = [];
let next = 0;

await Promise.all(Array.from({ length: jobs }, async () => {
  while (next < queue.length) {
    const task = queue[next++];
    const n = `${done.length + failed.length + 1}/${queue.length}`;
    try {
      const { lesson } = await generateLesson({ ...task, force: true });
      done.push(task.id);
      console.log(`✅ ${n} ${task.level} ${task.id} — ${lesson.dialogue.turns.length} lượt, ${lesson.vocab.length} từ, ${lesson.commonMistakes.length} lỗi hay gặp`);
    } catch (err) {
      failed.push({ id: task.id, msg: err.message });
      console.error(`❌ ${n} ${task.level} ${task.id} — ${err.message.split('\n')[0]}`);
    }
    await buildIndex(ROOT).catch(() => {});
  }
}));

const mins = ((Date.now() - started) / 60000).toFixed(1);
const count = await buildIndex(ROOT);
console.log(`\n🏁 Xong sau ${mins} phút · ${done.length} thành công · ${failed.length} lỗi · index có ${count} bài.`);
if (failed.length) {
  console.log('\nSoạn lại các bài lỗi:');
  console.log(`  node tools/gen-series.mjs --only ${failed.map(f => f.id).join(',')}`);
  process.exit(1);
}
