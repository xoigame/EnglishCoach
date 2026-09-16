// Text-to-speech, speech recognition, and pronunciation scoring.

const SETTINGS_KEY = 'ec.settings';

export const settings = {
  voiceURI: '',
  rate: 0.92,
  asrLang: 'en-US',
  passScore: 80,      // % tối thiểu để tính là nói đạt
  coachAloud: true,   // đọc phần sửa lỗi bằng giọng nói
  maxTries: 2,        // số lần thử lại trước khi đi tiếp
  autoListen: true,   // tự bật micro khi tới lượt bạn
  ...safeParse(localStorage.getItem(SETTINGS_KEY)),
};

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ TTS */

let voices = [];

export function loadVoices() {
  return new Promise(resolve => {
    const read = () => {
      voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'));
      if (voices.length) resolve(voices);
    };
    read();
    if (!voices.length) {
      speechSynthesis.addEventListener('voiceschanged', read, { once: true });
      setTimeout(() => resolve(voices), 1500); // some browsers never fire the event
    }
  });
}

export function getVoices() { return voices; }

function pickVoice(uri) {
  if (!voices.length) return null;
  return (uri && voices.find(v => v.voiceURI === uri))
    || voices.find(v => v.voiceURI === settings.voiceURI)
    || voices.find(v => v.lang === settings.asrLang)
    || voices.find(v => /en-US/i.test(v.lang))
    || voices[0];
}

/**
 * Hai giọng khác nhau cho hai vai hội thoại. Trả về [giọng vai A, giọng vai B];
 * máy chỉ có một giọng tiếng Anh thì cả hai vai dùng chung, phân biệt bằng tốc độ.
 */
export function voicePair() {
  const mine = pickVoice();
  if (voices.length < 2) return [mine?.voiceURI || '', mine?.voiceURI || ''];
  // Ưu tiên giọng khác giới tính hoặc khác tên hẳn để tai dễ phân biệt.
  const other = voices.find(v => v.voiceURI !== mine.voiceURI && v.lang === mine.lang)
    || voices.find(v => v.voiceURI !== mine.voiceURI);
  return [mine.voiceURI, other.voiceURI];
}

/*
 * VÌ SAO PHẦN NÀY PHỨC TẠP HƠN MỘT LỜI GỌI speechSynthesis.speak():
 *
 * 1. Chrome cắt ngang những câu dài (khoảng 15 giây trở lên). Mẹo phổ biến
 *    trên mạng là gọi pause()/resume() mỗi vài giây để "giữ hàng đợi sống" —
 *    nhưng chính nó làm giọng đọc bị ngắt quãng nghe rất gợn. Cách đúng là
 *    TÁCH văn bản thành từng câu rồi đọc lần lượt.
 *
 * 2. onend đôi khi không bao giờ kích hoạt, nhất là khi cancel() chạy sát
 *    ngay trước speak(). Nếu không có đồng hồ canh chừng thì lời hứa không
 *    bao giờ hoàn tất, và chỗ nào đang await sẽ đứng vĩnh viễn — đó là lúc
 *    trình phát hoặc phần hội thoại "bị đứng".
 *
 * 3. Sau cancel(), Chrome cần một nhịp mới nhận utterance mới. Gọi speak()
 *    ngay lập tức thì câu đó có thể bị nuốt mất: không có tiếng, cũng không
 *    có onend.
 */

let activeSettle = null;   // kết thúc lượt đọc đang chạy, dù vì lý do gì

/** Tách thành từng câu đủ ngắn để Chrome không cắt giữa chừng. */
function chunk(text) {
  const parts = String(text)
    .split(/(?<=[.!?])\s+/)
    .flatMap(sentence => {
      if (sentence.length <= 160) return [sentence];
      // Câu quá dài thì cắt tiếp ở dấu phẩy, rồi mới cắt cứng theo từ.
      const byComma = sentence.split(/(?<=,)\s+/);
      return byComma.flatMap(piece => {
        if (piece.length <= 160) return [piece];
        const words = piece.split(/\s+/);
        const out = [];
        let line = '';
        for (const w of words) {
          if ((line + ' ' + w).trim().length > 160) { out.push(line.trim()); line = w; }
          else line = (line + ' ' + w).trim();
        }
        if (line) out.push(line);
        return out;
      });
    });
  return parts.map(p => p.trim()).filter(Boolean);
}

/** Thời gian tối đa hợp lý cho một đoạn, để canh chừng khi onend mất tích. */
function watchdogMs(text, rate) {
  const words = text.split(/\s+/).length;
  const perWord = 400 / Math.max(0.5, rate);   // ~150 từ/phút ở tốc độ 1.0
  return Math.max(4000, words * perWord + 3000);
}

const nextTick = () => new Promise(r => setTimeout(r, 60));

/** Đọc `text`; hoàn tất khi đọc xong, khi bị dừng, hoặc khi hết giờ canh chừng. */
export function speak(text, { rate, voiceURI, pitch } = {}) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve();

  // Lượt đọc trước phải được kết thúc tử tế, nếu không chỗ đang await nó sẽ treo.
  activeSettle?.();

  const speed = rate ?? settings.rate;
  const pieces = chunk(text);

  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (activeSettle === finish) activeSettle = null;
      resolve();
    };
    activeSettle = finish;

    (async () => {
      speechSynthesis.cancel();
      await nextTick();          // Chrome cần một nhịp sau cancel()
      if (done) return;

      for (const piece of pieces) {
        if (done) return;
        await new Promise(next => {
          let moved = false;
          const step = () => { if (!moved) { moved = true; clearTimeout(pieceTimer); next(); } };

          const u = new SpeechSynthesisUtterance(piece);
          const v = pickVoice(voiceURI);
          if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = settings.asrLang; }
          u.rate = speed;
          if (pitch) u.pitch = pitch;
          u.onend = step;
          u.onerror = step;

          // Canh chừng riêng cho từng đoạn: onend mất tích thì vẫn đi tiếp.
          const pieceTimer = setTimeout(step, watchdogMs(piece, speed));
          speechSynthesis.speak(u);
        });
      }
      finish();
    })();
  });
}

export function stopSpeaking() {
  if (!('speechSynthesis' in window)) return;
  // Kết thúc lời hứa TRƯỚC khi cancel, để chỗ đang await không bị treo.
  activeSettle?.();
  speechSynthesis.cancel();
}

/* ------------------------------------------------------ Speech recognition */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const asrSupported = Boolean(SR);

export class Listener {
  constructor({ onInterim, onFinal, onError, onEnd } = {}) {
    this.onInterim = onInterim || (() => {});
    this.onFinal = onFinal || (() => {});
    this.onError = onError || (() => {});
    this.onEnd = onEnd || (() => {});
    this.active = false;
    this.rec = null;
  }

  start() {
    if (!SR) { this.onError('no-support'); return; }
    if (this.active) return;
    stopSpeaking(); // never record our own voice
    const rec = new SR();
    rec.lang = settings.asrLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    let best = '';

    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) best += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      if (interim) this.onInterim(interim.trim());
    };
    rec.onerror = e => this.onError(e.error || 'error');
    rec.onend = () => {
      this.active = false;
      this.rec = null;
      const text = best.trim();
      if (text) this.onFinal(text);
      this.onEnd();
    };

    this.rec = rec;
    this.active = true;
    try { rec.start(); } catch { this.active = false; }
  }

  stop() { if (this.rec) { try { this.rec.stop(); } catch { /* already stopped */ } } }
  abort() { if (this.rec) { try { this.rec.abort(); } catch { /* already stopped */ } } this.active = false; }
}

/* --------------------------------------------------------------- Scoring */

const CONTRACTIONS = {
  "i'm": 'i am', "you're": 'you are', "he's": 'he is', "she's": 'she is',
  "it's": 'it is', "we're": 'we are', "they're": 'they are', "that's": 'that is',
  "there's": 'there is', "what's": 'what is', "let's": 'let us', "i've": 'i have',
  "i'd": 'i would', "i'll": 'i will', "don't": 'do not', "doesn't": 'does not',
  "didn't": 'did not', "can't": 'can not', "cannot": 'can not', "won't": 'will not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "haven't": 'have not', "hasn't": 'has not', "wouldn't": 'would not',
  "couldn't": 'could not', "shouldn't": 'should not', "you'll": 'you will',
  "we'll": 'we will', "he'll": 'he will', "she'll": 'she will', "they'll": 'they will',
  "you've": 'you have', "we've": 'we have', "they've": 'they have',
};

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .map(w => CONTRACTIONS[w.replace(/[^a-z']/g, '')] || w)
    .join(' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level alignment (Levenshtein backtrace) between target and spoken text. */
export function scoreSpeech(target, spoken) {
  const a = tokenize(target);
  const b = tokenize(spoken);
  if (!a.length) return { score: 0, words: [], missed: [] };
  if (!b.length) return { score: 0, words: a.map(w => ({ w, ok: false })), missed: a };

  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }

  const words = [];
  let i = n, j = m, hits = 0;
  while (i > 0) {
    if (j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      const ok = a[i - 1] === b[j - 1];
      if (ok) hits++;
      words.unshift({ w: a[i - 1], ok });
      i--; j--;
    } else if (d[i][j] === d[i - 1][j] + 1) {
      words.unshift({ w: a[i - 1], ok: false });
      i--;
    } else {
      j--; // extra word spoken; not penalised beyond the length ratio below
    }
  }

  const lengthPenalty = Math.min(1, a.length / Math.max(a.length, b.length));
  const score = Math.round((hits / a.length) * lengthPenalty * 100);
  return { score, words, missed: words.filter(x => !x.ok).map(x => x.w) };
}

export function scoreClass(score) {
  return score >= 80 ? 'good' : score >= 55 ? 'mid' : 'low';
}

export function scoreLabel(score) {
  if (score >= 90) return 'Tuyệt vời!';
  if (score >= 80) return 'Tốt';
  if (score >= 55) return 'Tạm được — thử lại nhé';
  return 'Chưa khớp, nghe mẫu rồi nói lại';
}
