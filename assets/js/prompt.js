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
  "commonMistakes": [
    { "wrong": "I want book a room.", "right": "I'd like to book a room.", "vi": "Sau want phải có to, và I'd like nghe lịch sự hơn." }
  ],
  "variations": [
    {
      "situation": "Hỏi giá phòng",
      "formal": "Could you tell me the rate for a double room, please?",
      "casual": "How much is a double room?",
      "vi": "Câu trên dùng khi nói với lễ tân khách sạn lớn, câu dưới dùng ở nhà nghỉ nhỏ hoặc với người quen."
    }
  ],
  "culture": [
    "Ở Mỹ và Anh, khách thường chào lại nhân viên bằng một câu ngắn chứ không im lặng gật đầu."
  ],
  "nativeSwaps": [
    { "bookish": "I understand.", "native": "I see.", "vi": "Người bản xứ hiếm khi nói I understand trong hội thoại thường; I see hoặc Got it tự nhiên hơn nhiều." },
    { "bookish": "It is not a problem.", "native": "No worries.", "vi": "Ngắn và thân thiện hơn, dùng khắp nơi trong đời thường." }
  ],
  "glossary": [
    { "en": "reservation", "vi": "việc đặt phòng trước" },
    { "en": "double", "vi": "đôi, dành cho hai người" }
  ],
  "listening": {
    "title": "Tin nhắn thoại từ khách sạn",
    "passage": "Hello, this is Sea Breeze Hotel calling about your booking for Friday. We have you down for a double room for two nights. Breakfast is served from six thirty to ten. Please call us back if you need a late check-in.",
    "vi": "Xin chào, đây là khách sạn Sea Breeze gọi về đặt phòng thứ Sáu của bạn...",
    "questions": [
      {
        "q": "How many nights is the booking for?",
        "choices": ["One night", "Two nights", "Three nights"],
        "answer": 1,
        "vi": "Câu chốt là 'a double room for two nights'."
      }
    ]
  },
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
    "goal": "Người học nhận phòng và hỏi về bữa sáng."
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
3. Mọi phần giải thích, nghĩa, gợi ý, "goal" đều viết bằng tiếng Việt; chỉ câu thoại, ví dụ, "persona" và "opener" là tiếng Anh.
4. 8-12 từ vựng, 4-6 mẫu câu, 2-3 lưu ý phát âm đúng lỗi người Việt hay mắc ở chủ đề này.
5. Trường "hint" của những lượt người học nói: mẹo ngắn bằng tiếng Việt (có thể để chuỗi rỗng nếu câu quá dễ).
6. 5-8 câu drill dịch Việt → Anh, bám sát từ vựng và mẫu câu ở trên.
7. Câu thoại sẽ được đọc bằng text-to-speech, nên tránh ký hiệu lạ, emoji, hay chữ viết tắt khó đọc.
8. "commonMistakes": 3-5 lỗi người Việt hay mắc ở CHÍNH chủ đề này — "wrong" là câu sai thường gặp, "right" là câu đúng tương ứng, "vi" giải thích ngắn. Ứng dụng dùng phần này để sửa lỗi cho người học ngay khi họ nói.
8b. "variations": 3-4 cặp câu cùng một ý nhưng khác sắc thái — "formal" dùng với người lạ/cấp trên/nơi trang trọng, "casual" dùng với bạn bè/đồng nghiệp thân; "vi" nói rõ khi nào dùng cái nào. Đây là chỗ người học hay sai nhất: dịch đúng nghĩa nhưng sai mức độ trang trọng.
8c. "culture": 2-3 ghi chú tiếng Việt về thói quen giao tiếp của người bản xứ ở tình huống này mà người Việt hay bất ngờ (khoảng cách, tip, cách từ chối, mức độ thẳng thắn, im lặng…). Không phải mẹo ngữ pháp.
8e. "nativeSwaps": 4-6 cặp câu — "bookish" là cách người Việt hay nói vì học trong sách, "native" là cách người bản xứ thật sự nói ở tình huống này, "vi" giải thích vì sao. ĐÂY LÀ PHẦN QUAN TRỌNG: người học nói đúng ngữ pháp nhưng nghe ra ngay là học sách vở. Ví dụ "I understand" -> "I see"; "It is not a problem" -> "No worries"; "I would like to ask a question" -> "Quick question". Chọn đúng những câu xuất hiện trong chủ đề này.
8f. "glossary": nghĩa tiếng Việt của TỪNG TỪ có nghĩa xuất hiện trong hội thoại và bài nghe của bài này, để ứng dụng hiện nghĩa word-by-word khi người học bấm vào một câu. Bao gồm cả từ ghép ("check in", "key card") và dạng biến đổi thực tế xuất hiện trong bài ("booked", "nights", "staying"). Bỏ qua các từ chức năng quá cơ bản (a, the, of, is, to, and, in, you, I). Khoảng 40-80 mục. "en" viết chữ thường.
8d. "listening": MỘT đoạn nghe độc thoại 45-90 từ, đúng trình độ, KHÁC với hội thoại ở trên nhưng cùng bối cảnh — ví dụ tin nhắn thoại, thông báo loa, hướng dẫn, review của khách. Kèm 3 câu hỏi trắc nghiệm tiếng Anh, mỗi câu 3 lựa chọn, "answer" là chỉ số từ 0, "vi" giải thích vì sao đáp án đó đúng và chỉ ra chỗ trong bài nghe. Đoạn này sẽ được đọc bằng text-to-speech và người học KHÔNG nhìn thấy chữ, nên phải nghe là hiểu được, đừng nhồi số liệu rối rắm. "vi" của listening là bản dịch tiếng Việt cả đoạn (hiện sau khi trả lời xong).
9. Lượt đầu tiên trong "turns" PHẢI là "speaker": "a" (AI mở lời trước), hai vai nói xen kẽ, và "userRole" là "b".
10. "persona" viết bằng tiếng Anh ở ngôi thứ hai ("You are a ..."), mô tả rõ vai, nơi chốn, thái độ — nó được dùng làm system prompt khi AI đóng vai nói chuyện trực tiếp với người học.

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
