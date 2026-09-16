#!/usr/bin/env node
// Validate every file in data/lessons/ against the lesson schema.
//   node tools/validate.mjs

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLesson } from '../assets/js/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'lessons');

const files = (await readdir(DIR)).filter(f => f.endsWith('.json'));
let bad = 0;

for (const file of files) {
  const id = path.basename(file, '.json');
  try {
    const lesson = normalizeLesson(JSON.parse(await readFile(path.join(DIR, file), 'utf8')));
    if (lesson.id !== id) throw new Error(`"id" là "${lesson.id}" nhưng tên file là "${id}.json"`);
    const userTurns = lesson.dialogue.turns.filter(t => t.speaker === lesson.dialogue.userRole).length;
    if (!userTurns) throw new Error('người học không có lượt nói nào (kiểm tra "userRole").');

    // Bài nghe hiểu: câu hỏi phải có đáp án nằm trong danh sách lựa chọn.
    for (const [i, q] of (lesson.listening?.questions || []).entries()) {
      if (q.answer < 0 || q.answer >= q.choices.length) {
        throw new Error(`câu hỏi nghe thứ ${i + 1} có "answer" ngoài phạm vi lựa chọn.`);
      }
    }

    const extras = [
      lesson.listening ? `nghe ${lesson.listening.questions.length} câu` : null,
      lesson.variations.length ? `${lesson.variations.length} sắc thái` : null,
      lesson.culture.length ? `${lesson.culture.length} văn hoá` : null,
    ].filter(Boolean).join('  ');
    console.log(`✅ ${file}  ${lesson.level}  ${lesson.dialogue.turns.length} lượt  ${lesson.vocab.length} từ  ${extras}`);
  } catch (err) {
    bad++;
    console.error(`❌ ${file}: ${err.message}`);
  }
}

console.log(`\n${files.length - bad}/${files.length} giáo án hợp lệ.`);
process.exit(bad ? 1 : 0);
