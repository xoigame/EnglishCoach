#!/usr/bin/env node
// Soạn lại MỘT phần của một giáo án, giữ nguyên phần còn lại.
//
// Rẻ hơn hẳn soạn lại cả bài: chỉ phần được yêu cầu mới đi qua model, và
// --output-schema được cắt đúng phần đó nên không có cách nào model trả về
// thừa hay thiếu trường.
//
//   node tools/rewrite.mjs --id dat-phong-khach-san --part listening
//   node tools/rewrite.mjs --id phong-van-xin-viec --part drills --notes "khó hơn, thêm số liệu"
//   node tools/rewrite.mjs --id goi-mon-o-nha-hang --part vocab --dry-run

import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { normalizeLesson } from '../assets/js/store.js';
import { LEVELS } from '../assets/js/prompt.js';
import { runAi, SCHEMA_PATH, prettyCli } from './ai-cli.mjs';
import { ROOT, lessonPath, lessonExists } from './generate.mjs';
import { buildIndex } from './build-index.mjs';

const PARTS = {
  vocab: 'từ vựng cốt lõi (8-12 mục)',
  patterns: 'mẫu câu (4-6 mục)',
  pronunciation: 'lưu ý phát âm cho người Việt (2-3 mục)',
  commonMistakes: 'lỗi người Việt hay mắc ở chủ đề này (3-5 mục)',
  variations: 'cặp câu trang trọng / thân mật (3-4 mục)',
  culture: 'ghi chú khác biệt văn hoá (2-3 mục, tiếng Việt)',
  listening: 'bài nghe hiểu độc thoại 45-90 từ kèm 3 câu hỏi trắc nghiệm',
  drills: 'câu drill dịch Việt sang Anh (5-8 câu)',
  homework: 'bài về nhà (3 mục, tiếng Việt)',
  goals: 'mục tiêu bài học (3 mục, tiếng Việt)',
  roleplay: 'cấu hình đóng vai: persona tiếng Anh, opener tiếng Anh, goal tiếng Việt',
  dialogue: 'toàn bộ hội thoại (giữ nguyên số lượt và vai)',
};

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    part: { type: 'string' },
    notes: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
});

if (values.help || !values.id || !values.part) {
  console.log(`
Soạn lại một phần của giáo án, giữ nguyên phần còn lại.

  --id     <slug>   id giáo án (bắt buộc)
  --part   <tên>    phần cần soạn lại (bắt buộc)
  --notes  <text>   yêu cầu cụ thể cho lần soạn lại này
  --dry-run         chỉ in prompt, không gọi CLI

Các phần soạn lại được:
${Object.entries(PARTS).map(([k, v]) => `  ${k.padEnd(16)} ${v}`).join('\n')}

CLI đang dùng: ${prettyCli()}
`.trim());
  process.exit(values.help ? 0 : 1);
}

if (!PARTS[values.part]) {
  console.error(`❌ Không soạn lại được phần "${values.part}". Chọn một trong: ${Object.keys(PARTS).join(', ')}`);
  process.exit(1);
}
if (!lessonExists(values.id)) {
  console.error(`❌ Không có data/lessons/${values.id}.json`);
  process.exit(1);
}

const file = lessonPath(values.id);
const lesson = normalizeLesson(JSON.parse(await readFile(file, 'utf8')));
const part = values.part;

/* Cắt schema xuống đúng phần cần — model không thể trả thừa hay thiếu. */
const full = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
const subSchema = {
  type: 'object',
  additionalProperties: false,
  required: [part],
  properties: { [part]: full.properties[part] },
};

const prompt = `Bạn là giáo viên tiếng Anh giao tiếp cho người Việt, đang chỉnh sửa một giáo án đã có.

Giáo án: "${lesson.title}" — chủ đề ${lesson.topic}, trình độ ${LEVELS[lesson.level] || lesson.level}.
Người học đóng vai "${lesson.dialogue.roles[lesson.dialogue.userRole]}", AI đóng vai "${lesson.dialogue.roles[lesson.dialogue.userRole === 'a' ? 'b' : 'a']}".

Hội thoại hiện tại để bạn nắm bối cảnh và giữ đúng giọng điệu:
${lesson.dialogue.turns.map(t => `${t.speaker === lesson.dialogue.userRole ? 'Người học' : 'AI'}: ${t.en}`).join('\n')}

Từ vựng đang dùng trong bài: ${lesson.vocab.map(v => v.en).join(', ') || '(chưa có)'}

NHIỆM VỤ: soạn lại DUY NHẤT phần "${part}" — ${PARTS[part]}.
${values.notes ? `Yêu cầu cho lần soạn lại này: ${values.notes}` : ''}

Nội dung "${part}" hiện tại (soạn cái mới TỐT HƠN, đừng chép lại):
${JSON.stringify(lesson[part], null, 2)}

Nguyên tắc giữ nguyên như cả bộ giáo án:
- Tiếng Anh tự nhiên như người bản xứ nói ngoài đời, đúng trình độ ${lesson.level}.
- Mọi giải thích, nghĩa, ghi chú viết bằng tiếng Việt; chỉ câu tiếng Anh và ví dụ là tiếng Anh.
- Nội dung sẽ được đọc bằng text-to-speech, tránh ký hiệu lạ và emoji.
- Bám sát bối cảnh và từ vựng của bài ở trên, đừng lạc sang chủ đề khác.

Chỉ in ra một object JSON có đúng một khoá "${part}", không giải thích gì thêm.`;

if (values['dry-run']) {
  console.log(prompt);
  process.exit(0);
}

const dir = await mkdtemp(path.join(tmpdir(), 'english-coach-part-'));
const schemaFile = path.join(dir, `${part}.schema.json`);
await writeFile(schemaFile, JSON.stringify(subSchema, null, 2), 'utf8');

console.error(`⏳ soạn lại "${part}" của ${values.id}…`);

try {
  const raw = await runAi(prompt, {
    schemaPath: schemaFile,
    logFile: path.join(ROOT, 'logs', `rewrite-${values.id}-${part}.log`),
  });

  const patch = JSON.parse(extractObject(raw));
  if (patch[part] === undefined) throw new Error(`model không trả về khoá "${part}".`);

  const before = JSON.stringify(lesson[part]);
  const merged = normalizeLesson({ ...lesson, [part]: patch[part] });
  if (JSON.stringify(merged[part]) === before) {
    console.log('⚠️  Nội dung mới giống hệt nội dung cũ — không ghi gì.');
    process.exit(0);
  }

  await writeFile(file, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  await buildIndex(ROOT);

  console.log(`✅ Đã cập nhật "${part}" trong ${path.relative(ROOT, file)}`);
  console.log(`   trước: ${summarize(lesson[part])}`);
  console.log(`   sau:   ${summarize(merged[part])}`);
  console.log(`\nXem lại: node tools/serve.mjs  →  http://localhost:4173/#/lesson/${values.id}`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

function extractObject(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : String(text);
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('không tìm thấy JSON trong output.');
  return body.slice(start, end + 1);
}

function summarize(value) {
  if (Array.isArray(value)) return `${value.length} mục`;
  if (value && typeof value === 'object') return Object.keys(value).join(', ');
  return String(value).slice(0, 60);
}
