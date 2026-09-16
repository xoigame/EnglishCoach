// 100 bài tập cho mỗi chủ đề, xào trộn ngẫu nhiên.
//
// KHÔNG gọi AI: mỗi giáo án đã có sẵn ~130 mảnh nội dung (từ vựng, mẫu câu,
// lỗi hay mắc, cặp trang trọng/thân mật, lượt thoại, drill, bài nghe, và 10
// hội thoại mẫu nếu đã soạn). Tổ hợp chúng qua 9 dạng đề là ra hàng trăm bài
// khác nhau — sinh tức thì, chạy offline, và không bao giờ lệch nội dung bài.
//
// Mỗi lần vào là một đề khác: thứ tự câu, thứ tự đáp án và cả việc chọn mảnh
// nội dung nào đều được trộn lại.

import { speak, scoreSpeech, scoreClass, scoreLabel } from './speech.js';
import { captureOnce, asrSupported } from './mic.js';
import { esc, micError } from './lesson.js';
import { setProgress, getProgress } from './store.js';
import { loadPhrasebook, relevantTo } from './phrasebook.js';

const TARGET = 100;

/* ------------------------------------------------------------ tiện ích */

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Ba đáp án sai lấy từ cùng nhóm nội dung, nên nhìn không ra ngay đáp án đúng. */
function distractors(pool, correct, n = 3) {
  const others = pool.filter(x => x && x !== correct);
  return shuffle(others).slice(0, n);
}

/** Bài trắc nghiệm với đáp án đã trộn vị trí. */
function choiceItem({ kind, prompt, sub, correct, wrong, say, why }) {
  const choices = shuffle([correct, ...wrong]);
  return {
    kind, prompt, sub, say, why,
    mode: 'choice',
    choices,
    answer: choices.indexOf(correct),
  };
}

/* --------------------------------------------------- các dạng bài tập */

const BUILDERS = [
  // 1. Từ tiếng Anh nghĩa là gì
  function vocabEnVi(src) {
    return src.vocab.map(v => choiceItem({
      kind: 'Nghĩa của từ',
      prompt: v.en,
      sub: v.ipa,
      say: v.en,
      correct: v.vi,
      wrong: distractors(src.vocab.map(x => x.vi), v.vi),
    }));
  },

  // 2. Tiếng Việt này nói bằng từ nào
  function vocabViEn(src) {
    return src.vocab.map(v => choiceItem({
      kind: 'Chọn từ đúng',
      prompt: v.vi,
      correct: v.en,
      wrong: distractors(src.vocab.map(x => x.en), v.en),
    }));
  },

  // 3. Nghe rồi chọn đúng từ đã nghe
  function listenWord(src) {
    return src.vocab.map(v => choiceItem({
      kind: 'Nghe và chọn từ',
      prompt: '🔊 Bấm nghe rồi chọn từ bạn nghe được',
      say: v.en,
      correct: v.en,
      wrong: distractors(src.vocab.map(x => x.en), v.en),
    }));
  },

  // 4. Điền từ còn thiếu vào câu ví dụ
  function fillBlank(src) {
    return src.vocab
      .filter(v => v.example && new RegExp(escapeRe(v.en), 'i').test(v.example))
      .map(v => choiceItem({
        kind: 'Điền vào chỗ trống',
        prompt: v.example.replace(new RegExp(escapeRe(v.en), 'i'), '______'),
        sub: v.vi,
        correct: v.en,
        wrong: distractors(src.vocab.map(x => x.en), v.en),
        say: v.example,
      }));
  },

  // 5. Câu nào đúng — lấy từ đúng lỗi người Việt hay mắc ở chủ đề này
  function fixMistake(src) {
    return src.mistakes.map(m => choiceItem({
      kind: 'Câu nào đúng?',
      prompt: 'Chọn câu đúng ngữ pháp',
      correct: m.right,
      wrong: [m.wrong, ...distractors(src.mistakes.map(x => x.wrong), m.wrong, 2)],
      say: m.right,
      why: m.vi,
    }));
  },

  // 6. Câu nào trang trọng hơn
  function register(src) {
    return src.variations.flatMap(v => [
      choiceItem({
        kind: 'Mức trang trọng',
        prompt: `${v.situation} — câu nào TRANG TRỌNG hơn?`,
        correct: v.formal,
        wrong: [v.casual],
        say: v.formal,
        why: v.vi,
      }),
      choiceItem({
        kind: 'Mức trang trọng',
        prompt: `${v.situation} — câu nào THÂN MẬT hơn?`,
        correct: v.casual,
        wrong: [v.formal],
        say: v.casual,
        why: v.vi,
      }),
    ]);
  },

  // 7. Sắp xếp từ thành câu đúng
  function unscramble(src) {
    return src.lines
      .filter(l => { const n = l.en.split(/\s+/).length; return n >= 4 && n <= 9; })
      .map(l => ({
        kind: 'Sắp xếp thành câu',
        mode: 'order',
        prompt: l.vi || 'Sắp xếp các từ thành câu đúng',
        words: shuffle(l.en.replace(/[.,!?]/g, '').split(/\s+/)),
        answer: l.en,
        say: l.en,
      }));
  },

  // 8. Nghe câu rồi chọn đúng câu đã nghe
  function listenSentence(src) {
    return src.lines
      .filter(l => l.en.split(/\s+/).length >= 4)
      .map(l => choiceItem({
        kind: 'Nghe và chọn câu',
        prompt: '🔊 Bấm nghe rồi chọn câu bạn nghe được',
        say: l.en,
        correct: l.en,
        wrong: distractors(src.lines.map(x => x.en), l.en),
      }));
  },

  // 9. Mẫu câu này nghĩa là gì
  function patternMeaning(src) {
    return src.patterns.map(p => choiceItem({
      kind: 'Mẫu câu',
      prompt: p.en,
      say: p.en.replace(/_+/g, ' something '),
      correct: p.vi,
      wrong: distractors(src.patterns.map(x => x.vi), p.vi),
      why: p.note,
    }));
  },

  // 10. Thành ngữ / cách nói bản xứ này nghĩa là gì
  function phraseMeaning(src) {
    return src.phrases.map(p => choiceItem({
      kind: p.kind === 'idiom' ? 'Thành ngữ' : 'Cách nói bản xứ',
      prompt: p.en,
      say: p.example || p.en,
      correct: p.vi,
      wrong: distractors(src.phrases.map(x => x.vi), p.vi),
      why: p.note || p.example,
    }));
  },

  // 11. Tình huống này nói thế nào cho tự nhiên
  function phraseUse(src) {
    return src.phrases.filter(p => p.note).map(p => choiceItem({
      kind: 'Dùng khi nào?',
      prompt: p.vi,
      correct: p.en,
      wrong: distractors(src.phrases.map(x => x.en), p.en),
      say: p.en,
      why: p.note,
    }));
  },

  // 12. Dịch rồi NÓI ra — dạng duy nhất dùng micro
  function speakIt(src) {
    return [...src.drills, ...src.lines.filter(l => l.vi)].map(d => ({
      kind: 'Nói câu này',
      mode: 'speak',
      prompt: d.vi,
      answer: d.en,
      alts: d.alts || [],
      say: d.en,
    }));
  },
];

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ------------------------------------------------------- gom nội dung */

function collect(lesson, pack) {
  // Bài nghe hiểu là một đoạn văn; tách thành câu để dùng làm nguồn đề.
  const passage = (lesson.listening?.passage || '')
    .split(/(?<=[.!?])\s+/)
    .map(en => en.trim())
    .filter(en => en.split(/\s+/).length >= 4)
    .map(en => ({ en, vi: '' }));

  const lines = [
    ...lesson.dialogue.turns.map(t => ({ en: t.en, vi: t.vi })),
    ...passage,
    ...(pack?.dialogues || []).flatMap(d => d.turns.map(t => ({ en: t.en, vi: t.vi }))),
  ].filter(l => l.en);

  return {
    vocab: lesson.vocab,
    patterns: lesson.patterns,
    mistakes: lesson.commonMistakes,
    variations: lesson.variations,
    drills: lesson.drills,
    phrases: lesson._phrases || [],
    lines,
  };
}

/**
 * Sinh tối đa `TARGET` bài tập, trộn đều các dạng.
 * Lấy vòng tròn từng dạng một để 100 bài không dồn hết vào một kiểu.
 */
export function buildExercises(lesson, pack, target = TARGET) {
  const src = collect(lesson, pack);
  const make = () => BUILDERS
    .map(fn => { try { return shuffle(fn(src)); } catch { return []; } })
    .filter(b => b.length);

  const out = [];

  // Vòng đầu: lấy xen kẽ từng dạng một, để đề không dồn hết vào một kiểu.
  const buckets = make();
  if (!buckets.length) return [];
  for (let round = 0; out.length < target && buckets.some(b => b.length > round); round++) {
    for (const bucket of buckets) {
      if (out.length >= target) break;
      if (bucket[round]) out.push(bucket[round]);
    }
  }

  // Chưa đủ 100 thì dựng lại: cùng mảnh nội dung nhưng đáp án sai và vị trí
  // đáp án đúng đều khác, nên gặp lại vẫn phải suy nghĩ chứ không nhớ chỗ bấm.
  // Bài ít nội dung (vd chưa soạn 10 hội thoại mẫu) nhờ vậy vẫn đủ đề.
  for (let pass = 0; out.length < target && pass < 12; pass++) {
    for (const bucket of make()) {
      for (const item of bucket) {
        if (out.length >= target) break;
        out.push(item);
      }
      if (out.length >= target) break;
    }
  }

  return shuffle(out).slice(0, target);
}

/* --------------------------------------------------------------- UI */

export async function renderExercises(el, lesson, onScore) {
  el.innerHTML = '<p class="muted">Đang dựng đề…</p>';

  let pack = null;
  try {
    const res = await fetch(`data/packs/${encodeURIComponent(lesson.id)}.json`, { cache: 'no-cache' });
    if (res.ok) pack = await res.json();
  } catch { /* chưa có bộ hội thoại mẫu thì thôi */ }

  // Thành ngữ và cách nói bản xứ hợp với bài cũng thành nguồn ra đề.
  try {
    const book = await loadPhrasebook();
    lesson._phrases = relevantTo(book, lesson, 14).map(p => ({
      ...p, kind: (book.idioms || []).some(i => i.en === p.en) ? 'idiom' : 'expression',
    }));
  } catch { lesson._phrases = []; }

  let items = buildExercises(lesson, pack);
  if (!items.length) {
    el.innerHTML = '<p class="muted">Bài này chưa có nội dung để sinh bài tập.</p>';
    return;
  }

  const best = getProgress(lesson.id)?.quizBest;

  el.innerHTML = `
    <div class="quiz-head">
      <div>
        <b>${items.length} bài tập</b>
        <span class="muted"> · trộn từ ${countSources(lesson, pack)} mảnh nội dung của bài${
          pack ? ', 10 hội thoại mẫu' : ''} và sổ tay bản xứ</span>
        ${best ? `<span class="badge done">Tốt nhất ${best}%</span>` : ''}
      </div>
      <div class="row">
        <button class="ghost act-reshuffle">🔀 Xào lại đề</button>
      </div>
    </div>
    <div class="quiz-progress"><div class="bar"></div></div>
    <div class="quiz-stage"></div>
    ${lesson.homework.length ? `<h3>🏠 Bài về nhà</h3><ul class="homework">${
      lesson.homework.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}`;

  let i = 0;
  let right = 0;
  const stage = el.querySelector('.quiz-stage');
  const bar = el.querySelector('.bar');

  el.querySelector('.act-reshuffle').addEventListener('click', () => {
    items = buildExercises(lesson, pack);
    i = 0; right = 0;
    show();
  });

  function show() {
    bar.style.width = `${(i / items.length) * 100}%`;
    if (i >= items.length) return finish();
    stage.innerHTML = '';
    stage.appendChild(renderOne(items[i], answered => {
      if (answered) right++;
      i++;
      bar.style.width = `${(i / items.length) * 100}%`;
    }, () => show()));
  }

  function finish() {
    const pct = Math.round((right / items.length) * 100);
    stage.innerHTML = `
      <div class="card" style="text-align:center">
        <h3>🏁 Xong ${items.length} bài</h3>
        <p style="font-size:26px;font-weight:700" class="${scoreClass(pct)}">${right}/${items.length} · ${pct}%</p>
        <button class="primary act-again">🔀 Làm đề mới</button>
      </div>`;
    stage.querySelector('.act-again').addEventListener('click', () => {
      items = buildExercises(lesson, pack);
      i = 0; right = 0;
      show();
    });

    if (!best || pct > best) {
      setProgress(lesson.id, { quizBest: pct });
      onScore?.(pct);
    }
  }

  show();
}

function countSources(lesson, pack) {
  const src = collect(lesson, pack);
  return src.vocab.length + src.patterns.length + src.mistakes.length +
    src.variations.length + src.drills.length + src.lines.length + src.phrases.length;
}

/** Một bài tập; gọi `done(đúng?)` rồi `next()` khi người học bấm Tiếp. */
function renderOne(item, done, next) {
  const box = document.createElement('div');
  box.className = 'quiz-card card';
  let settled = false;

  const head = `
    <div class="quiz-kind">${esc(item.kind)}</div>
    <div class="q">${esc(item.prompt)}</div>
    ${item.sub ? `<div class="vi">${esc(item.sub)}</div>` : ''}
    ${item.say ? '<button class="ghost act-say">🔊 Nghe</button>' : ''}`;

  const footer = () => `
    <div class="quiz-after hidden">
      ${item.why ? `<div class="why">${esc(item.why)}</div>` : ''}
      <button class="primary act-next">Tiếp →</button>
    </div>`;

  if (item.mode === 'choice') {
    box.innerHTML = `${head}
      <div class="choices">${item.choices.map((c, j) =>
        `<button class="choice" data-c="${j}">${esc(c)}</button>`).join('')}</div>
      ${footer()}`;

    box.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
      if (settled) return;
      settled = true;
      const picked = Number(btn.dataset.c);
      box.querySelectorAll('.choice').forEach((b, j) => {
        b.disabled = true;
        if (j === item.answer) b.classList.add('right');
        else if (j === picked) b.classList.add('wrong');
      });
      if (item.say) speak(item.say);
      reveal(picked === item.answer);
    }));
  }

  if (item.mode === 'order') {
    box.innerHTML = `${head}
      <div class="order-slot"></div>
      <div class="order-bank">${item.words.map((w, j) =>
        `<button class="word" data-w="${j}">${esc(w)}</button>`).join('')}</div>
      <div class="row"><button class="ghost act-undo">↩ Bỏ từ cuối</button>
        <button class="primary act-check">Kiểm tra</button></div>
      ${footer()}`;

    const slot = box.querySelector('.order-slot');
    const chosen = [];
    const paint = () => { slot.textContent = chosen.map(c => c.word).join(' ') || '…'; };
    paint();

    box.querySelectorAll('.word').forEach(btn => btn.addEventListener('click', () => {
      if (settled || btn.disabled) return;
      btn.disabled = true;
      chosen.push({ word: btn.textContent, btn });
      paint();
    }));
    box.querySelector('.act-undo').addEventListener('click', () => {
      if (settled) return;
      const last = chosen.pop();
      if (last) last.btn.disabled = false;
      paint();
    });
    box.querySelector('.act-check').addEventListener('click', () => {
      if (settled) return;
      settled = true;
      const said = chosen.map(c => c.word).join(' ');
      const ok = scoreSpeech(item.answer, said).score >= 95;
      slot.classList.add(ok ? 'w-ok' : 'w-bad');
      if (!ok) slot.innerHTML = `${esc(said)}<div class="vi">Câu đúng: <b>${esc(item.answer)}</b></div>`;
      speak(item.answer);
      reveal(ok);
    });
  }

  if (item.mode === 'speak') {
    box.innerHTML = `${head}
      <div class="row">
        <button class="ghost act-rec" ${asrSupported ? '' : 'disabled'}>🎤 Nói</button>
        <button class="ghost act-show">👁 Đáp án</button>
        <span class="score-pill hidden"></span>
      </div>
      <div class="heard"></div>
      <div class="reveal hidden">${esc(item.answer)}</div>
      ${footer()}`;

    const pill = box.querySelector('.score-pill');
    const heard = box.querySelector('.heard');
    const rev = box.querySelector('.reveal');

    box.querySelector('.act-show').addEventListener('click', () => {
      rev.classList.remove('hidden');
      speak(item.answer);
      if (!settled) { settled = true; reveal(false); }
    });

    box.querySelector('.act-rec').addEventListener('click', async ev => {
      if (settled) return;
      const btn = ev.currentTarget;
      try {
        const text = await captureOnce({
          onStart: () => { btn.textContent = '⏺ Đang nghe…'; btn.disabled = true; },
          onStop: () => { btn.textContent = '🎤 Nói'; btn.disabled = false; },
          onInterim: t => { heard.textContent = `… ${t}`; },
        });
        if (!text) { heard.textContent = 'Không nghe thấy gì.'; return; }
        settled = true;
        const scored = [item.answer, ...item.alts]
          .map(a => scoreSpeech(a, text))
          .reduce((x, y) => (y.score > x.score ? y : x));
        pill.className = `score-pill ${scoreClass(scored.score)}`;
        pill.textContent = `${scored.score}% · ${scoreLabel(scored.score)}`;
        heard.textContent = `Bạn đã nói: “${text}”`;
        rev.classList.remove('hidden');
        speak(item.answer);
        reveal(scored.score >= 80);
      } catch (err) {
        heard.textContent = micError(err);
        btn.textContent = '🎤 Nói';
        btn.disabled = false;
      }
    });
  }

  box.querySelector('.act-say')?.addEventListener('click', () => speak(item.say));

  function reveal(ok) {
    const after = box.querySelector('.quiz-after');
    after.classList.remove('hidden');
    after.insertAdjacentHTML('afterbegin',
      `<div class="verdict ${ok ? 'w-ok' : 'w-bad'}">${ok ? '✅ Đúng' : '❌ Chưa đúng'}</div>`);
    done(ok);
    after.querySelector('.act-next').addEventListener('click', next);
    after.querySelector('.act-next').focus();
  }

  return box;
}
