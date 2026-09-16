#!/usr/bin/env node
// Thống kê nội dung toàn bộ giáo án.
//   node tools/stats.mjs
//   node tools/stats.mjs --level B1
//   node tools/stats.mjs --words          # những từ vựng lặp lại nhiều nhất

import { readdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { normalizeLesson } from '../assets/js/store.js';
import { ROOT, LESSON_DIR } from './generate.mjs';

const { values } = parseArgs({
  options: {
    level: { type: 'string', default: '' },
    words: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  console.log('node tools/stats.mjs [--level A2] [--words]');
  process.exit(0);
}

const files = (await readdir(LESSON_DIR)).filter(f => f.endsWith('.json'));
const lessons = [];
for (const f of files) {
  try {
    const l = normalizeLesson(JSON.parse(await readFile(path.join(LESSON_DIR, f), 'utf8')));
    if (!values.level || l.level === values.level.toUpperCase()) lessons.push(l);
  } catch { /* doctor lo phần file hỏng */ }
}

if (!lessons.length) {
  console.log('Chưa có giáo án nào khớp.');
  process.exit(0);
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const sum = (arr, f) => arr.reduce((a, l) => a + f(l), 0);

const rows = LEVELS.map(level => {
  const ls = lessons.filter(l => l.level === level);
  if (!ls.length) return null;
  return {
    level,
    bài: ls.length,
    lượt: sum(ls, l => l.dialogue.turns.length),
    từ: sum(ls, l => l.vocab.length),
    mẫu: sum(ls, l => l.patterns.length),
    lỗi: sum(ls, l => l.commonMistakes.length),
    'sắc thái': sum(ls, l => l.variations.length),
    'văn hoá': sum(ls, l => l.culture.length),
    nghe: ls.filter(l => l.listening).length,
    'câu hỏi': sum(ls, l => l.listening?.questions.length || 0),
    drill: sum(ls, l => l.drills.length),
  };
}).filter(Boolean);

console.table(rows);

const words = sum(lessons, l =>
  l.dialogue.turns.reduce((a, t) => a + t.en.split(/\s+/).length, 0) +
  (l.listening ? l.listening.passage.split(/\s+/).length : 0));

console.log(`\nTổng: ${lessons.length} bài · ${words.toLocaleString('vi')} từ tiếng Anh để nghe và nói.`);
console.log(`Nghe hết một lượt ở tốc độ nói thường (~130 từ/phút): khoảng ${Math.round(words / 130)} phút.`);

const gaps = lessons.filter(l => !l.listening).map(l => l.id);
if (gaps.length) console.log(`\n${gaps.length} bài chưa có phần nghe hiểu: ${gaps.slice(0, 6).join(', ')}${gaps.length > 6 ? '…' : ''}`);

if (values.words) {
  const count = new Map();
  for (const l of lessons) {
    for (const v of l.vocab) {
      const k = v.en.toLowerCase();
      if (!count.has(k)) count.set(k, { n: 0, vi: v.vi, levels: new Set() });
      count.get(k).n++;
      count.get(k).levels.add(l.level);
    }
  }
  const repeated = [...count.entries()].filter(([, v]) => v.n > 1).sort((a, b) => b[1].n - a[1].n);
  console.log(`\nTừ vựng xuất hiện ở nhiều bài (${repeated.length} từ) — lặp lại là tốt cho trí nhớ:`);
  for (const [word, v] of repeated.slice(0, 20)) {
    console.log(`  ${String(v.n).padStart(2)}×  ${word.padEnd(22)} ${v.vi}  [${[...v.levels].sort().join(',')}]`);
  }
}
