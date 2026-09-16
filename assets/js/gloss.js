// Nghĩa từng từ (word by word) cho một câu tiếng Anh.
//
// Ba nguồn nghĩa, xét theo thứ tự:
//   1. "glossary" của giáo án — chính xác theo ngữ cảnh bài, do AI soạn
//   2. từ vựng của bài ("vocab"), kể cả cụm nhiều từ như "check in"
//   3. từ điển dựng sẵn dưới đây — từ chức năng và từ thông dụng
//
// Nhờ nguồn 3 mà chức năng này chạy được ngay trên mọi bài, kể cả bài soạn
// trước khi có trường "glossary".

const BUILT_IN = {
  // đại từ
  i: 'tôi', you: 'bạn', he: 'anh ấy', she: 'cô ấy', it: 'nó', we: 'chúng tôi',
  they: 'họ', me: 'tôi', him: 'anh ấy', her: 'cô ấy', us: 'chúng tôi', them: 'họ',
  my: 'của tôi', your: 'của bạn', his: 'của anh ấy', our: 'của chúng tôi',
  their: 'của họ', its: 'của nó', mine: 'của tôi', yours: 'của bạn',
  this: 'này', that: 'đó', these: 'những cái này', those: 'những cái đó',
  who: 'ai', what: 'gì', where: 'ở đâu', when: 'khi nào', why: 'tại sao',
  which: 'cái nào', how: 'như thế nào', someone: 'ai đó', something: 'điều gì đó',
  anything: 'bất cứ gì', everything: 'mọi thứ', nothing: 'không gì cả',
  everyone: 'mọi người', anyone: 'bất cứ ai', myself: 'chính tôi',

  // trợ động từ và động từ to be
  am: 'thì, là', is: 'thì, là', are: 'thì, là', was: 'đã là', were: 'đã là',
  be: 'là', been: 'đã là', being: 'đang là',
  do: 'làm', does: 'làm', did: 'đã làm', done: 'đã xong',
  have: 'có', has: 'có', had: 'đã có', having: 'đang có',
  will: 'sẽ', would: 'sẽ (lịch sự)', can: 'có thể', could: 'có thể (lịch sự)',
  shall: 'sẽ', should: 'nên', may: 'có thể', might: 'có lẽ', must: 'phải',
  'll': 'sẽ', 've': 'đã', 'd': 'sẽ / đã', 're': 'thì, là', 'm': 'thì, là',
  not: 'không', don: 'không', doesn: 'không', didn: 'không', isn: 'không',
  aren: 'không', wasn: 'không', won: 'sẽ không', can_t: 'không thể',
  let: 'hãy để', 's': '(của / là)',

  // giới từ và liên từ
  a: 'một', an: 'một', the: '(mạo từ xác định)',
  of: 'của', to: 'đến, để', in: 'trong', on: 'trên', at: 'tại',
  for: 'cho, trong', with: 'với', without: 'không có', from: 'từ',
  by: 'bởi, bằng', about: 'về', into: 'vào', over: 'trên, hơn',
  under: 'dưới', after: 'sau', before: 'trước', during: 'trong lúc',
  until: 'cho đến', since: 'từ khi', between: 'giữa', near: 'gần',
  next: 'kế tiếp', behind: 'phía sau', across: 'băng qua', through: 'qua',
  and: 'và', or: 'hoặc', but: 'nhưng', so: 'nên, vậy', because: 'vì',
  if: 'nếu', then: 'rồi, thì', than: 'hơn', as: 'như', also: 'cũng',
  too: 'cũng, quá', very: 'rất', really: 'thật sự', just: 'chỉ, vừa mới',
  only: 'chỉ', still: 'vẫn', already: 'đã rồi', yet: 'chưa', again: 'lại',
  always: 'luôn luôn', usually: 'thường', often: 'thường xuyên',
  sometimes: 'thỉnh thoảng', never: 'chưa bao giờ', now: 'bây giờ',
  today: 'hôm nay', tomorrow: 'ngày mai', yesterday: 'hôm qua',
  here: 'ở đây', there: 'ở đó', maybe: 'có lẽ', please: 'làm ơn',
  thanks: 'cảm ơn', 'thank': 'cảm ơn', sorry: 'xin lỗi', yes: 'vâng', no: 'không',
  ok: 'được', okay: 'được', sure: 'chắc chắn', of_course: 'tất nhiên',

  // động từ thông dụng
  go: 'đi', goes: 'đi', went: 'đã đi', going: 'đang đi', come: 'đến',
  came: 'đã đến', get: 'lấy, nhận', got: 'đã lấy', give: 'cho', gave: 'đã cho',
  take: 'lấy, nhận', took: 'đã lấy', make: 'làm ra', made: 'đã làm',
  want: 'muốn', need: 'cần', like: 'thích, giống', love: 'yêu, rất thích',
  know: 'biết', knew: 'đã biết', think: 'nghĩ', thought: 'đã nghĩ',
  see: 'thấy', saw: 'đã thấy', look: 'nhìn', watch: 'xem', hear: 'nghe',
  heard: 'đã nghe', listen: 'lắng nghe', say: 'nói', said: 'đã nói',
  tell: 'kể, nói cho', told: 'đã nói cho', ask: 'hỏi', asked: 'đã hỏi',
  answer: 'trả lời', speak: 'nói', spoke: 'đã nói', talk: 'nói chuyện',
  help: 'giúp', work: 'làm việc', worked: 'đã làm việc', use: 'dùng',
  used: 'đã dùng', find: 'tìm thấy', found: 'đã tìm thấy', try: 'thử',
  call: 'gọi', called: 'đã gọi', put: 'đặt', keep: 'giữ', leave: 'rời, để lại',
  left: 'đã rời, bên trái', stay: 'ở lại', wait: 'chờ', start: 'bắt đầu',
  finish: 'kết thúc', stop: 'dừng', open: 'mở', close: 'đóng', pay: 'trả tiền',
  paid: 'đã trả', buy: 'mua', bought: 'đã mua', sell: 'bán', bring: 'mang đến',
  send: 'gửi', show: 'cho xem', check: 'kiểm tra', change: 'đổi', book: 'đặt chỗ',
  booked: 'đã đặt', meet: 'gặp', met: 'đã gặp', live: 'sống', eat: 'ăn',
  drink: 'uống', sleep: 'ngủ', feel: 'cảm thấy', felt: 'đã cảm thấy',
  mean: 'nghĩa là', meant: 'đã có nghĩa', understand: 'hiểu', learn: 'học',
  teach: 'dạy', read: 'đọc', write: 'viết', wrote: 'đã viết', remember: 'nhớ',
  forget: 'quên', hope: 'hy vọng', mind: 'thấy phiền, tâm trí', let_me: 'để tôi',
  arrive: 'đến nơi', return: 'trả lại, quay lại', explain: 'giải thích',
  agree: 'đồng ý', decide: 'quyết định', prefer: 'thích hơn', offer: 'đề nghị',
  recommend: 'giới thiệu', suggest: 'đề xuất', confirm: 'xác nhận',
  apologise: 'xin lỗi', apologize: 'xin lỗi', manage: 'quản lý, xoay xở',

  // tính từ và danh từ thông dụng
  good: 'tốt', great: 'tuyệt', fine: 'ổn', bad: 'tệ', better: 'tốt hơn',
  best: 'tốt nhất', new: 'mới', old: 'cũ, già', big: 'to', small: 'nhỏ',
  long: 'dài', short: 'ngắn', early: 'sớm', late: 'muộn', fast: 'nhanh',
  slow: 'chậm', easy: 'dễ', hard: 'khó, cứng', busy: 'bận', free: 'rảnh, miễn phí',
  ready: 'sẵn sàng', sure_adj: 'chắc chắn', right: 'đúng, bên phải', wrong: 'sai',
  same: 'giống nhau', different: 'khác nhau', other: 'khác', another: 'một cái khác',
  more: 'nhiều hơn', most: 'nhiều nhất', less: 'ít hơn', few: 'ít', many: 'nhiều',
  much: 'nhiều', some: 'một vài', any: 'bất kỳ', all: 'tất cả', both: 'cả hai',
  each: 'mỗi', every: 'mọi', first: 'đầu tiên', last: 'cuối cùng', one: 'một',
  two: 'hai', three: 'ba', four: 'bốn', five: 'năm', six: 'sáu', seven: 'bảy',
  eight: 'tám', nine: 'chín', ten: 'mười',
  time: 'thời gian, lần', day: 'ngày', week: 'tuần', month: 'tháng',
  year: 'năm', morning: 'buổi sáng', afternoon: 'buổi chiều', evening: 'buổi tối',
  night: 'đêm', hour: 'giờ', minute: 'phút', people: 'mọi người',
  person: 'người', man: 'người đàn ông', woman: 'người phụ nữ', name: 'tên',
  place: 'chỗ', room: 'phòng', home: 'nhà', house: 'ngôi nhà', money: 'tiền',
  price: 'giá', thing: 'thứ', way: 'cách, đường', problem: 'vấn đề',
  question: 'câu hỏi', idea: 'ý tưởng', reason: 'lý do', number: 'số',
  phone: 'điện thoại', email: 'thư điện tử', card: 'thẻ', bag: 'túi',
  food: 'thức ăn', water: 'nước', coffee: 'cà phê', ticket: 'vé',
  company: 'công ty', job: 'công việc', team: 'nhóm', office: 'văn phòng',
  customer: 'khách hàng', service: 'dịch vụ', order: 'đơn hàng, gọi món',
  welcome: 'chào mừng', hello: 'xin chào', hi: 'chào', bye: 'tạm biệt',
};

/** Cụm hai từ hay đi liền nhau, phải tra trước khi tách từng từ. */
const PHRASES = {
  'check in': 'làm thủ tục nhận',
  'check out': 'làm thủ tục trả',
  'of course': 'tất nhiên rồi',
  'thank you': 'cảm ơn bạn',
  'excuse me': 'xin lỗi cho hỏi',
  'i see': 'tôi hiểu rồi',
  'no worries': 'không sao đâu',
  'got it': 'hiểu rồi',
  'right now': 'ngay bây giờ',
  'a lot': 'rất nhiều',
  'a little': 'một chút',
  'at all': 'chút nào',
  'as well': 'cũng vậy',
  'by the way': 'nhân tiện thì',
  'in fact': 'thật ra',
  'for example': 'ví dụ',
  'i would like': 'tôi muốn (lịch sự)',
  'would you like': 'bạn có muốn',
  'how much': 'bao nhiêu (tiền/lượng)',
  'how many': 'bao nhiêu (số đếm)',
  'how long': 'bao lâu',
  'there is': 'có',
  'there are': 'có',
  'let me': 'để tôi',
};

/** Bỏ đuôi thường gặp để tra được dạng gốc. */
function stems(word) {
  const out = [word];
  const rules = [
    [/ies$/, 'y'], [/es$/, ''], [/s$/, ''],
    [/ied$/, 'y'], [/ed$/, ''], [/ed$/, 'e'],
    [/ing$/, ''], [/ing$/, 'e'],
    [/est$/, ''], [/er$/, ''],
  ];
  for (const [re, rep] of rules) {
    if (re.test(word)) out.push(word.replace(re, rep));
  }
  return out;
}

/**
 * Tách câu thành từng từ kèm nghĩa.
 * @returns {Array<{word: string, vi: string, source: 'glossary'|'vocab'|'phrase'|'builtin'|''}>}
 */
export function glossSentence(sentence, lesson) {
  const fromLesson = new Map();
  for (const g of lesson?.glossary || []) fromLesson.set(g.en, { vi: g.vi, source: 'glossary' });
  for (const v of lesson?.vocab || []) {
    const key = String(v.en).toLowerCase().trim();
    if (!fromLesson.has(key)) fromLesson.set(key, { vi: v.vi, source: 'vocab' });
  }

  const raw = String(sentence).split(/\s+/).filter(Boolean);
  const out = [];

  for (let i = 0; i < raw.length; i++) {
    // Thử cụm ba từ rồi hai từ trước khi tra từ đơn.
    let matched = false;
    for (const size of [3, 2]) {
      if (i + size > raw.length) continue;
      const chunk = raw.slice(i, i + size);
      const key = chunk.join(' ').toLowerCase().replace(/[^a-z' ]/g, '').trim();
      const hit = fromLesson.get(key) || (PHRASES[key] && { vi: PHRASES[key], source: 'phrase' });
      if (hit) {
        out.push({ word: chunk.join(' '), vi: hit.vi, source: hit.source });
        i += size - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const word = raw[i];
    const key = word.toLowerCase().replace(/[^a-z']/g, '');
    let hit = fromLesson.get(key);
    if (!hit) {
      for (const stem of stems(key)) {
        if (fromLesson.has(stem)) { hit = { ...fromLesson.get(stem), stemmed: true }; break; }
        if (BUILT_IN[stem]) { hit = { vi: BUILT_IN[stem], source: 'builtin', stemmed: stem !== key }; break; }
      }
    }
    out.push({ word, vi: hit?.vi || '', source: hit?.source || '' });
  }

  return out;
}

/** Bao nhiêu phần trăm từ trong câu tra được nghĩa. */
export function coverage(sentence, lesson) {
  const parts = glossSentence(sentence, lesson);
  if (!parts.length) return 0;
  return Math.round((parts.filter(p => p.vi).length / parts.length) * 100);
}
