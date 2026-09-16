// Single source of truth for the lesson-generation prompt.
// Imported by the web generator (browser) and by tools/gen-lesson.mjs (Node).

export const LEVELS = {
  A1: 'A1 — người mới bắt đầu: câu 4-7 từ, thì hiện tại đơn, từ vựng sinh hoạt hằng ngày.',
  A2: 'A2 — cơ bản: câu 6-12 từ, hiện tại/quá khứ đơn, cụm từ giao tiếp thông dụng.',
  B1: 'B1 — trung cấp: câu 10-18 từ, nhiều thì, biết diễn đạt lý do và ý kiến.',
  B2: 'B2 — trên trung bình: câu phức, thành ngữ thông dụng, tranh luận và thương lượng.',
  C1: 'C1 — nâng cao: sắc thái, collocation tự nhiên, giọng điệu trang trọng/thân mật linh hoạt.',
};

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'lesson';
}

const SCHEMA = `{
  "id": "kebab-case-slug",
  "title": "Tên bài học bằng tiếng Việt",
  "topic": "Chủ đề ngắn gọn",
  "level": "A1|A2|B1|B2|C1",
  "summary": "1-2 câu tiếng Việt mô tả tình huống",
  "goals": ["Mục tiêu 1 (tiếng Việt)", "Mục tiêu 2", "Mục tiêu 3"],
  "vocab": [
    { "en": "boarding pass", "ipa": "/ˈbɔːrdɪŋ pæs/", "vi": "thẻ lên máy bay", "example": "Please show me your boarding pass." }
  ],
  "patterns": [
    { "en": "Could you ___, please?", "vi": "Bạn có thể ___ được không?", "note": "Lịch sự hơn 'Can you'" }
  ],
  "pronunciation": [
    { "focus": "âm /θ/", "tip": "Đặt đầu lưỡi giữa hai hàm răng rồi thổi hơi ra.", "words": ["three", "think", "thank"] }
  ],
  "dialogue": {
    "roles": { "a": "Vai của AI (tiếng Việt)", "b": "Vai của người học (tiếng Việt)" },
    "userRole": "b",
    "turns": [
      { "speaker": "a", "en": "Good morning! How can I help you?", "vi": "Chào buổi sáng! Tôi có thể giúp gì?", "hint": "" },
      { "speaker": "b", "en": "Hi, I'd like to check in, please.", "vi": "Chào, tôi muốn làm thủ tục.", "hint": "Dùng I'd like để nói lịch sự" }
    ]
  },
  "roleplay": {
    "persona": "You are a friendly hotel receptionist in Da Nang.",
    "opener": "Good morning! Welcome to Sea Breeze Hotel. How can I help you?",
    "goal": "The learner checks in and asks about breakfast."
  },
  "drills": [
    { "vi": "Tôi muốn đặt một phòng đôi.", "en": "I'd like to book a double room.", "alts": ["I want to book a double room."] }
  ],
  "homework": ["Ghi âm lại toàn bộ hội thoại và nghe lại", "Đặt 3 câu với mẫu 'Could you ___?'"]
}`;

/**
 * @param {{topic:string, level:string, partner?:string, turns?:number|string, notes?:string, id?:string}} opts
 * @returns {string} the prompt to hand to an AI CLI
 */
export function buildPrompt({ topic, level = 'A2', partner = '', turns = 12, notes = '', id = '' } = {}) {
  const n = Math.max(6, Math.min(30, Number(turns) || 12));
  const lessonId = id || slugify(topic);

  return `Bạn là giáo viên tiếng Anh giao tiếp cho người Việt, đồng thời là người soạn dữ liệu cho một ứng dụng luyện nói.

Hãy soạn MỘT giáo án hội thoại tiếng Anh theo yêu cầu:
- Chủ đề: ${topic}
- Trình độ: ${LEVELS[level] || level}
- Vai của AI trong hội thoại: ${partner || 'tự chọn cho phù hợp tình huống'}
- Số lượt hội thoại: khoảng ${n} lượt, xen kẽ hai vai, kết thúc trọn vẹn tình huống
- id của bài: "${lessonId}"
${notes ? `- Yêu cầu thêm: ${notes}` : ''}

Nguyên tắc nội dung:
1. Tiếng Anh phải tự nhiên như người bản xứ nói ngoài đời, KHÔNG phải tiếng Anh sách giáo khoa cứng nhắc.
2. Độ khó tăng dần: những lượt đầu ngắn và dễ, những lượt sau dài hơn và có thêm cấu trúc mới.
3. Mọi phần giải thích, nghĩa, gợi ý đều viết bằng tiếng Việt; chỉ câu thoại và ví dụ là tiếng Anh.
4. 8-12 từ vựng, 4-6 mẫu câu, 2-3 lưu ý phát âm đúng lỗi người Việt hay mắc ở chủ đề này.
5. Trường "hint" của những lượt người học nói: mẹo ngắn bằng tiếng Việt (có thể để chuỗi rỗng nếu câu quá dễ).
6. 5-8 câu drill dịch Việt → Anh, bám sát từ vựng và mẫu câu ở trên.
7. Câu thoại sẽ được đọc bằng text-to-speech, nên tránh ký hiệu lạ, emoji, hay chữ viết tắt khó đọc.

ĐỊNH DẠNG ĐẦU RA — quan trọng:
Chỉ in ra DUY NHẤT một object JSON hợp lệ, không có lời dẫn, không có giải thích, không bọc trong dấu \`\`\`.
Theo đúng schema sau (giá trị là ví dụ, hãy thay bằng nội dung thật):

${SCHEMA}`;
}

/** The exact shell command that regenerates this lesson locally. */
export function buildCommand({ topic, level = 'A2', partner = '', turns = 12, notes = '' } = {}) {
  const q = s => `"${String(s).replace(/(["$`\\])/g, '\\$1')}"`;
  const parts = ['node tools/gen-lesson.mjs', `--topic ${q(topic)}`, `--level ${level}`];
  if (partner) parts.push(`--partner ${q(partner)}`);
  parts.push(`--turns ${Math.max(6, Math.min(30, Number(turns) || 12))}`);
  if (notes) parts.push(`--notes ${q(notes)}`);
  return parts.join(' ');
}
