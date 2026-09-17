#!/usr/bin/env node
// Soạn 10 hội thoại mẫu cho mỗi chủ đề, ghi vào data/packs/<id>.json.
//
// Mỗi chủ đề là MỘT lần gọi Codex cho cả 10 hội thoại, không phải 10 lần —
// rẻ hơn nhiều và 10 hội thoại trong cùng một lần sinh thì không bị trùng ý.
//
//   node tools/gen-packs.mjs                      # mọi chủ đề còn thiếu
//   node tools/gen-packs.mjs --level A1 --jobs 2
//   node tools/gen-packs.mjs --only dat-phong-khach-san
//   node tools/gen-packs.mjs --list
//   node tools/gen-packs.mjs --only X --dry-run    # chỉ in prompt

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { LEVELS } from '../assets/js/prompt.js';
import { runAi, AiCliError, prettyCli } from './ai-cli.mjs';
import { ROOT, LESSON_DIR } from './generate.mjs';

export const PACK_DIR = path.join(ROOT, 'data', 'packs');
const SCHEMA = path.join(ROOT, 'tools', 'pack.schema.json');
const COUNT = 10;

export function packPath(id) { return path.join(PACK_DIR, `${id}.json`); }
export function packExists(id) { return existsSync(packPath(id)); }

const { values } = parseArgs({
  options: {
    level: { type: 'string', default: '' },
    only: { type: 'string', default: '' },
    limit: { type: 'string', default: '0' },
    jobs: { type: 'string', default: '2' },
    force: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help) {
  console.log(`
Soạn 10 hội thoại mẫu cho mỗi chủ đề trong data/curriculum.json.

  --level  A1..C1   Chỉ một trình độ
  --only   id1,id2  Chỉ vài chủ đề
  --limit  <n>      Dừng sau n chủ đề
  --jobs   <n>      Số chủ đề chạy song song (mặc định 2, tối đa 4)
  --force           Soạn lại cả chủ đề đã có
  --list            Liệt kê trạng thái, không gọi AI
  --dry-run         Chỉ in prompt

CLI: ${prettyCli()}
`.trim());
  process.exit(0);
}

/* ---------------------------------------------------------------- prompt */

export function buildPackPrompt(lesson) {
  const d = lesson.dialogue;
  const roleA = d.roles[d.userRole === 'a' ? 'b' : 'a'];
  const roleB = d.roles[d.userRole];

  return `Bạn là giáo viên tiếng Anh giao tiếp cho người Việt, đang soạn thêm hội thoại luyện tập cho một bài đã có.

Bài học: "${lesson.title}" — chủ đề ${lesson.topic}, trình độ ${LEVELS[lesson.level] || lesson.level}.
Vai "a" là ${roleA}. Vai "b" là ${roleB} — đây là vai NGƯỜI HỌC sẽ đóng.

Hội thoại gốc của bài (để bạn nắm giọng điệu, ĐỪNG lặp lại nó):
${d.turns.map(t => `${t.speaker}: ${t.en}`).join('\n')}

Từ vựng bài đang dạy: ${lesson.vocab.map(v => v.en).join(', ')}
Mẫu câu bài đang dạy: ${lesson.patterns.map(p => p.en).join(' | ')}

NHIỆM VỤ: soạn ${COUNT} hội thoại mẫu MỚI, mỗi hội thoại 6-8 lượt.

Nguyên tắc:
1. ${COUNT} hội thoại là ${COUNT} TÌNH HUỐNG KHÁC NHAU trong cùng chủ đề, không phải ${COUNT} cách nói lại một tình huống. Ví dụ với chủ đề khách sạn: đặt phòng thường, hết phòng, đổi phòng vì ồn, nhận phòng sớm, mất thẻ phòng, phàn nàn điều hoà, hỏi gửi hành lý, trả phòng muộn, đặt hộ người khác, xử lý tính sai hoá đơn.
2. Xếp từ dễ tới khó: hội thoại 1-3 sát bài gốc và dùng lại từ vựng ở trên; 4-7 thêm tình huống phát sinh; 8-10 có chỗ ngoài dự đoán để người học phải xoay xở.
3. Luôn bắt đầu bằng "speaker": "a" và hai vai nói xen kẽ.
4. Tiếng Anh tự nhiên như người bản xứ nói ngoài đời, đúng trình độ ${lesson.level}.
5. "vi" là bản dịch tiếng Việt của câu đó, tự nhiên chứ không dịch máy.
6. "title" là tên tình huống bằng tiếng Việt, ngắn. "situation" là một câu tiếng Việt mô tả bối cảnh.
7. Câu thoại sẽ được đọc bằng text-to-speech và người học sẽ đọc lại để chấm phát âm, nên tránh ký hiệu lạ, emoji, chữ viết tắt khó đọc, và đừng viết số dạng "$80" mà viết "eighty dollars".

Chỉ in ra một object JSON: { "id": "${lesson.id}", "level": "${lesson.level}", "dialogues": [ ... ${COUNT} mục ... ] }`;
}

/* ----------------------------------------------------------- chuẩn hoá */

export function normalizePack(raw, lesson) {
  if (!raw || !Array.isArray(raw.dialogues)) throw new Error('thiếu "dialogues".');

  const dialogues = raw.dialogues.map((dlg, i) => {
    const turns = (Array.isArray(dlg.turns) ? dlg.turns : [])
      .map(t => ({
        speaker: t.speaker === 'a' ? 'a' : 'b',
        en: String(t.en || '').trim(),
        vi: String(t.vi || '').trim(),
      }))
      .filter(t => t.en);
    if (turns.length < 4) throw new Error(`hội thoại ${i + 1} chỉ có ${turns.length} lượt.`);
    return {
      title: String(dlg.title || `Tình huống ${i + 1}`).trim(),
      situation: String(dlg.situation || '').trim(),
      turns,
    };
  }).filter(d => d.turns.length);

  if (dialogues.length < 4) throw new Error(`chỉ có ${dialogues.length} hội thoại dùng được.`);

  return { id: lesson.id, level: lesson.level, dialogues };
}

function extractObject(text) {
  const body = String(text);
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  for (const c of [fenced?.[1], body]) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try { return JSON.parse(c.slice(start, end + 1)); } catch { /* thử tiếp */ }
  }
  throw new Error('không tìm thấy JSON trong output.');
}

/* -------------------------------------------------------------- chạy */

const curriculum = JSON.parse(await readFile(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
const onlyIds = values.only ? new Set(values.only.split(',').map(s => s.trim()).filter(Boolean)) : null;

const all = curriculum.themes.flatMap(th => th.topics.map(t => ({ id: t.id, level: t.level })));
const selected = all.filter(t =>
  (!values.level || t.level === values.level.toUpperCase()) &&
  (!onlyIds || onlyIds.has(t.id)) &&
  existsSync(path.join(LESSON_DIR, `${t.id}.json`)));

if (values.list) {
  let have = 0;
  for (const theme of curriculum.themes) {
    console.log(`\n${theme.name}`);
    for (const t of theme.topics) {
      const ok = packExists(t.id);
      if (ok) have++;
      let n = '';
      if (ok) {
        try { n = ` (${JSON.parse(await readFile(packPath(t.id), 'utf8')).dialogues.length} hội thoại)`; }
        catch { n = ' (file hỏng)'; }
      }
      console.log(`  ${ok ? '✅' : '⬜'} ${t.id}${n}`);
    }
  }
  console.log(`\n${have}/${all.length} chủ đề đã có bộ hội thoại mẫu.`);
  process.exit(0);
}

const todo = values.force ? selected : selected.filter(t => !packExists(t.id));
const limit = Number(values.limit) || 0;
const queue = limit ? todo.slice(0, limit) : todo;

if (!queue.length) {
  console.log('✨ Không còn chủ đề nào cần soạn. Dùng --force để soạn lại.');
  process.exit(0);
}

if (values['dry-run']) {
  const lesson = JSON.parse(await readFile(path.join(LESSON_DIR, `${queue[0].id}.json`), 'utf8'));
  console.log(buildPackPrompt(lesson));
  process.exit(0);
}

await mkdir(PACK_DIR, { recursive: true });

const jobs = Math.max(1, Math.min(4, Number(values.jobs) || 2));
console.log(`⏳ Soạn ${COUNT} hội thoại mẫu cho ${queue.length} chủ đề, ${jobs} luồng song song.`);
console.log(`   ${prettyCli()}`);
console.log(`   Transcript: logs/pack-<id>.log\n`);

const started = Date.now();
const done = [];
const failed = [];
let next = 0;
let halted = '';

await Promise.all(Array.from({ length: jobs }, async () => {
  while (next < queue.length && !halted) {
    const task = queue[next++];
    const n = `${done.length + failed.length + 1}/${queue.length}`;
    try {
      const lesson = JSON.parse(await readFile(path.join(LESSON_DIR, `${task.id}.json`), 'utf8'));
      const raw = await runAi(buildPackPrompt(lesson), {
        schemaPath: SCHEMA,
        logFile: path.join(ROOT, 'logs', `pack-${task.id}.log`),
      });
      const pack = normalizePack(extractObject(raw), lesson);
      await writeFile(packPath(task.id), JSON.stringify(pack, null, 2) + '\n', 'utf8');
      done.push(task.id);
      const turns = pack.dialogues.reduce((a, d) => a + d.turns.length, 0);
      console.log(`✅ ${n} ${task.level} ${task.id} — ${pack.dialogues.length} hội thoại, ${turns} lượt`);
    } catch (err) {
      failed.push(task.id);
      console.error(`❌ ${n} ${task.level} ${task.id} — ${err.message.split('\n')[0]}`);
      if (err instanceof AiCliError && err.kind === 'quota') {
        halted = 'Tài khoản Codex hết lượt — dừng cả loạt, chờ reset rồi chạy lại lệnh cũ.';
      }
    }
  }
}));

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n🏁 Xong sau ${mins} phút · ${done.length} thành công · ${failed.length} lỗi.`);
if (halted) console.log(`\n⛔ ${halted}`);
const left = queue.length - done.length - failed.length;
if (left > 0) console.log(`   Còn ${left} chủ đề chưa chạy — chạy lại lệnh cũ, chủ đề đã có sẽ tự bỏ qua.`);
if (failed.length) {
  console.log(`\nSoạn lại các chủ đề lỗi:\n  node tools/gen-packs.mjs --only ${failed.join(',')}`);
  process.exit(1);
}
