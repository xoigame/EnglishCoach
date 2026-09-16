// Sổ tay thành ngữ và cách nói bản xứ — dùng chung cho cả thư viện.
//
// Để ở data/phrasebook.json chứ không nhân bản vào 114 giáo án: "I see" hay
// "on the same page" đúng ở mọi chủ đề. Bài học chỉ lọc ra phần liên quan theo
// trình độ và thẻ chủ đề.

import { speak, scoreSpeech, scoreClass, scoreLabel } from './speech.js';
import { captureOnce, asrSupported } from './mic.js';
import { esc, micError } from './lesson.js';

const LEVEL_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

let cached = null;

export async function loadPhrasebook() {
  if (cached) return cached;
  const res = await fetch('data/phrasebook.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cached = await res.json();
  return cached;
}

/**
 * Phần sổ tay liên quan tới một bài: cùng mức trình độ trở xuống, và trùng thẻ
 * chủ đề với tiêu đề hoặc nội dung bài.
 */
export function relevantTo(book, lesson, limit = 8) {
  const max = LEVEL_ORDER[lesson.level] ?? 4;
  const haystack = `${lesson.title} ${lesson.topic} ${lesson.summary}`.toLowerCase();

  const score = item => {
    let s = 0;
    for (const tag of item.tags || []) if (haystack.includes(tag.toLowerCase())) s += 3;
    // Ưu tiên mục đúng tầm trình độ, không quá dễ mà cũng không quá khó.
    s += 2 - Math.abs((LEVEL_ORDER[item.level] ?? 0) - max);
    return s;
  };

  return [...(book.expressions || []), ...(book.idioms || [])]
    .filter(i => (LEVEL_ORDER[i.level] ?? 0) <= max)
    .map(i => ({ ...i, _s: score(i) }))
    .sort((a, b) => b._s - a._s)
    .slice(0, limit);
}

/* ------------------------------------------------- màn hình Sổ tay */

export async function renderPhrasebook(el) {
  el.innerHTML = '<p class="muted">Đang tải sổ tay…</p>';

  let book;
  try {
    book = await loadPhrasebook();
  } catch (err) {
    el.innerHTML = `<p class="msg bad">Không tải được sổ tay: ${esc(err.message)}</p>`;
    return;
  }

  const all = [
    ...(book.expressions || []).map(x => ({ ...x, kind: 'expression' })),
    ...(book.idioms || []).map(x => ({ ...x, kind: 'idiom' })),
  ];
  const tags = [...new Set(all.flatMap(x => x.tags || []))].sort((a, b) => a.localeCompare(b, 'vi'));

  el.innerHTML = `
    <h1>📕 Sổ tay nói như người bản xứ</h1>
    <p class="muted">${book.expressions.length} cách nói thường ngày và ${book.idioms.length} thành ngữ
    mà người bản xứ dùng thật. Bấm 🔊 để nghe, 🎤 để đọc lại và chấm phát âm.</p>

    <div class="toolbar">
      <input id="pbSearch" type="search" placeholder="Tìm: I see, deadline, từ chối, thành ngữ về tiền…">
      <div class="chips" id="pbKind">
        <button class="chip active" data-kind="all">Tất cả</button>
        <button class="chip" data-kind="expression">💬 Cách nói thường ngày</button>
        <button class="chip" data-kind="idiom">🎭 Thành ngữ</button>
      </div>
      <div class="chips" id="pbLevel">
        <button class="chip active" data-level="all">Mọi trình độ</button>
        ${Object.keys(LEVEL_ORDER).map(l => `<button class="chip" data-level="${l}">${l}</button>`).join('')}
      </div>
      <div class="chips scroll-x" id="pbTag">
        <button class="chip active" data-tag="all">Mọi chủ đề</button>
        ${tags.map(t => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
    </div>

    <p id="pbCount" class="muted"></p>
    <div id="pbList" class="pb-list"></div>`;

  const filter = { text: '', kind: 'all', level: 'all', tag: 'all' };

  const draw = () => {
    const q = filter.text.trim().toLowerCase();
    const items = all.filter(x =>
      (filter.kind === 'all' || x.kind === filter.kind) &&
      (filter.level === 'all' || x.level === filter.level) &&
      (filter.tag === 'all' || (x.tags || []).includes(filter.tag)) &&
      (!q || `${x.en} ${x.vi} ${x.note || ''} ${x.example || ''} ${(x.tags || []).join(' ')}`
        .toLowerCase().includes(q)));

    el.querySelector('#pbCount').textContent = `${items.length} mục`;
    el.querySelector('#pbList').innerHTML = items.map(cardHtml).join('')
      || '<p class="empty">Không có mục nào khớp.</p>';
    wireCards(el.querySelector('#pbList'));
  };

  el.querySelector('#pbSearch').addEventListener('input', e => { filter.text = e.target.value; draw(); });
  for (const [id, key] of [['#pbKind', 'kind'], ['#pbLevel', 'level'], ['#pbTag', 'tag']]) {
    el.querySelectorAll(`${id} .chip`).forEach(chip => chip.addEventListener('click', () => {
      el.querySelectorAll(`${id} .chip`).forEach(c => c.classList.toggle('active', c === chip));
      filter[key] = chip.dataset[key];
      draw();
    }));
  }

  draw();
}

function cardHtml(item) {
  return `
    <div class="pb-card" data-say="${esc(item.en)}">
      <div class="pb-top">
        <span class="pb-en">${esc(item.en)}</span>
        <span class="badge">${esc(item.level)}</span>
        <span class="badge ${item.kind === 'idiom' ? 'draft' : ''}">${item.kind === 'idiom' ? 'thành ngữ' : 'cách nói'}</span>
      </div>
      <div class="pb-vi">${esc(item.vi)}</div>
      ${item.note ? `<div class="pb-note">${esc(item.note)}</div>` : ''}
      ${item.example ? `<div class="pb-example" data-say="${esc(item.example)}">“${esc(item.example)}”</div>` : ''}
      <div class="actions">
        <button class="ghost act-say">🔊 Nghe</button>
        <button class="ghost act-slow">🐢 Chậm</button>
        <button class="ghost act-rec" ${asrSupported ? '' : 'disabled'}>🎤 Đọc lại</button>
        <span class="score-pill hidden"></span>
      </div>
      <div class="heard"></div>
    </div>`;
}

function wireCards(root) {
  root.querySelectorAll('.pb-card').forEach(card => {
    const target = card.dataset.say;
    const pill = card.querySelector('.score-pill');
    const heard = card.querySelector('.heard');

    card.querySelector('.act-say').addEventListener('click', () => speak(target));
    card.querySelector('.act-slow').addEventListener('click', () => speak(target, { rate: 0.65 }));
    card.querySelector('.pb-example')?.addEventListener('click', ev =>
      speak(ev.currentTarget.dataset.say));

    card.querySelector('.act-rec').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      try {
        const text = await captureOnce({
          onStart: () => { btn.textContent = '⏺ Đang nghe…'; btn.disabled = true; },
          onStop: () => { btn.textContent = '🎤 Đọc lại'; btn.disabled = false; },
          onInterim: t => { heard.textContent = `… ${t}`; },
        });
        if (!text) { heard.textContent = 'Không nghe thấy gì.'; return; }
        const { score } = scoreSpeech(target, text);
        pill.className = `score-pill ${scoreClass(score)}`;
        pill.textContent = `${score}% · ${scoreLabel(score)}`;
        heard.textContent = `Bạn đã nói: “${text}”`;
        if (score < 80) speak(target, { rate: 0.65 });
      } catch (err) {
        heard.textContent = micError(err);
        btn.textContent = '🎤 Đọc lại';
        btn.disabled = false;
      }
    });
  });
}

/* ------------------------------- khối gắn vào bước Chuẩn bị của bài học */

export async function renderLessonPhrases(el, lesson) {
  let book;
  try { book = await loadPhrasebook(); } catch { return; }

  const items = relevantTo(book, lesson);
  if (!items.length) return;

  const box = document.createElement('div');
  box.innerHTML = `
    <h3>📕 Cách nói bản xứ hợp với bài này</h3>
    <p class="muted">Lấy từ sổ tay chung, lọc theo trình độ và chủ đề của bài.
    Xem đầy đủ ở tab <b>📕 Sổ tay</b>.</p>
    <div class="pb-list compact">${items.map(cardHtml).join('')}</div>`;
  el.appendChild(box);
  wireCards(box);
}
