#!/usr/bin/env node
// Những từ trong giáo án mà chức năng "📖 Từng từ" chưa tra được nghĩa.
//
//   node tools/gloss-report.mjs              # tổng quan + 60 từ hụt nhiều nhất
//   node tools/gloss-report.mjs --min 3      # mọi từ xuất hiện từ 3 lần
//   node tools/gloss-report.mjs --lesson X   # xem riêng một bài
//   node tools/gloss-report.mjs --stub       # in sẵn dòng JS để dán vào gloss-domain.js
//
// Thêm từ vào assets/js/gloss-domain.js là phủ luôn cả thư viện, không phải
// sửa từng giáo án.

import { readdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { glossSentence } from '../assets/js/gloss.js';
import { normalizeLesson } from '../assets/js/store.js';
import { LESSON_DIR } from './generate.mjs';

const { values } = parseArgs({
  options: {
    min: { type: 'string', default: '1' },
    lesson: { type: 'string', default: '' },
    stub: { type: 'boolean', default: false },
    top: { type: 'string', default: '60' },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  console.log('node tools/gloss-report.mjs [--min 3] [--lesson <id>] [--stub] [--top 60]');
  process.exit(0);
}

const files = (await readdir(LESSON_DIR))
  .filter(f => f.endsWith('.json'))
  .filter(f => !values.lesson || f === `${values.lesson}.json`);

if (!files.length) {
  console.error(`❌ Không có giáo án nào khớp "${values.lesson}".`);
  process.exit(1);
}

const missing = new Map();
const perLesson = [];
let total = 0;
let known = 0;

for (const file of files) {
  const lesson = normalizeLesson(JSON.parse(await readFile(path.join(LESSON_DIR, file), 'utf8')));
  const sentences = [
    ...lesson.dialogue.turns.map(t => t.en),
    ...(lesson.listening ? [lesson.listening.passage] : []),
    ...lesson.drills.map(d => d.en),
    ...lesson.vocab.map(v => v.example).filter(Boolean),
  ];

  let lt = 0;
  let lk = 0;
  for (const sentence of sentences) {
    for (const part of glossSentence(sentence, lesson)) {
      lt++;
      if (part.vi) { lk++; continue; }
      const key = part.word.toLowerCase().replace(/[^a-z']/g, '');
      if (key.length > 1) missing.set(key, (missing.get(key) || 0) + 1);
    }
  }
  total += lt;
  known += lk;
  perLesson.push({ id: path.basename(file, '.json'), pct: Math.round((lk / lt) * 100) });
}

const min = Number(values.min) || 1;
const gaps = [...missing.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);

console.log(`📖 Phủ sóng word-by-word: ${Math.round((known / total) * 100)}%  (${known}/${total} từ, ${files.length} bài)`);
console.log(`   Từ chưa có nghĩa: ${missing.size} từ khác nhau, ${gaps.length} từ xuất hiện >= ${min} lần`);

const worst = perLesson.sort((a, b) => a.pct - b.pct).slice(0, 5);
if (files.length > 1) {
  console.log(`\nBài phủ sóng thấp nhất:`);
  for (const l of worst) console.log(`  ${String(l.pct).padStart(3)}%  ${l.id}`);
}

if (values.stub) {
  console.log(`\n// Dán vào assets/js/gloss-domain.js rồi điền nghĩa:`);
  for (const [word, n] of gaps) console.log(`  ${/^[a-z]+$/.test(word) ? word : `'${word}'`}: '',   // ${n} lần`);
} else {
  const top = Number(values.top) || 60;
  console.log(`\n${Math.min(top, gaps.length)} từ hụt nhiều nhất:`);
  console.log('  ' + gaps.slice(0, top).map(([w, n]) => `${w}(${n})`).join(' '));
  console.log(`\nDùng --stub để in sẵn dòng JS dán vào assets/js/gloss-domain.js`);
}
