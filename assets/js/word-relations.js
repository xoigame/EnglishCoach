// Đồng nghĩa, trái nghĩa và từ dễ nhầm lẫn — dùng chung cho cả thư viện.
//
// Cùng cách làm như phrasebook.js: một file dữ liệu chung thay vì nhân bản
// vào 115 giáo án, vì "affect/effect" hay "big/large/huge" đúng ở mọi chủ đề.

import { speak } from './speech.js';
import { esc } from './lesson.js';

const LEVEL_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

let cached = null;

export async function loadWordRelations() {
  if (cached) return cached;
  const res = await fetch('data/word-relations.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cached = await res.json();
  return cached;
}

/** Mọi mục, gắn thêm "kind" để lọc và hiển thị đồng nhất. */
function flatten(book) {
  return [
    ...(book.synonyms || []).map(s => ({ ...s, kind: 'synonym' })),
    ...(book.antonyms || []).map(a => ({ ...a, kind: 'antonym' })),
    ...(book.confusables || []).map(c => ({ ...c, kind: 'confusable' })),
  ];
}

/** Từ khoá để so khớp một mục với một bài học (không phân biệt kind). */
function wordsOf(item) {
  if (item.kind === 'antonym') return [item.a.en, item.b.en];
  return (item.words || []).map(w => w.en);
}

/**
 * Các mục liên quan tới một bài: từ trong "vocab"/"patterns" của bài trùng
 * với một trong hai/ba từ của mục, hoặc thẻ chủ đề trùng với tiêu đề bài.
 */
export function relevantTo(book, lesson, limit = 8) {
  const max = LEVEL_ORDER[lesson.level] ?? 4;
  const lessonWords = new Set([
    ...lesson.vocab.map(v => v.en.toLowerCase()),
    ...lesson.patterns.map(p => p.en.toLowerCase()),
  ]);
  const haystack = `${lesson.title} ${lesson.topic} ${lesson.summary}`.toLowerCase();

  const score = item => {
    let s = 0;
    for (const w of wordsOf(item)) if (lessonWords.has(w.toLowerCase())) s += 5;
    for (const tag of item.tags || []) if (haystack.includes(tag.toLowerCase())) s += 2;
    s += 2 - Math.abs((LEVEL_ORDER[item.level] ?? 0) - max);
    return s;
  };

  return flatten(book)
    .map(i => ({ ...i, _s: score(i) }))
    .filter(i => i._s > 0 && (LEVEL_ORDER[i.level] ?? 0) <= max + 1)
    .sort((a, b) => b._s - a._s)
    .slice(0, limit);
}

/* ------------------------------------------------------------ hiển thị */

const KIND_LABEL = { synonym: 'Đồng nghĩa', antonym: 'Trái nghĩa', confusable: 'Dễ nhầm' };

function cardHtml(item) {
  const label = KIND_LABEL[item.kind];
  let head;
  if (item.kind === 'antonym') {
    head = `
      <button class="wr-word" data-say="${esc(item.a.en)}">${esc(item.a.en)} <i>${esc(item.a.vi)}</i></button>
      <span class="wr-vs">↔</span>
      <button class="wr-word" data-say="${esc(item.b.en)}">${esc(item.b.en)} <i>${esc(item.b.vi)}</i></button>`;
  } else {
    const sep = item.kind === 'confusable' ? '<span class="wr-vs">≠</span>' : '<span class="wr-vs">≈</span>';
    head = item.words.map((w, i) =>
      `${i > 0 ? sep : ''}<button class="wr-word" data-say="${esc(w.en)}">${esc(w.en)} <i>${esc(w.vi)}</i></button>`
    ).join('');
  }

  return `
    <div class="wr-card wr-${item.kind}">
      <div class="wr-top">
        <span class="badge ${item.kind === 'confusable' ? 'draft' : ''}">${label}</span>
        <span class="badge">${esc(item.level)}</span>
      </div>
      <div class="wr-words">${head}</div>
      ${item.note ? `<div class="wr-note">${esc(item.note)}</div>` : ''}
    </div>`;
}

function wireCards(root) {
  root.querySelectorAll('.wr-word').forEach(btn =>
    btn.addEventListener('click', () => speak(btn.dataset.say)));
}

/* ------------------------------------------------------- trang So sánh từ */

export async function renderWordRelations(el) {
  el.innerHTML = '<p class="muted">Đang tải…</p>';

  let book;
  try {
    book = await loadWordRelations();
  } catch (err) {
    el.innerHTML = `<p class="msg bad">Không tải được dữ liệu: ${esc(err.message)}</p>`;
    return;
  }

  const all = flatten(book);
  const tags = [...new Set(all.flatMap(x => x.tags || []))].sort((a, b) => a.localeCompare(b, 'vi'));

  el.innerHTML = `
    <h1>🔀 So sánh từ vựng</h1>
    <p class="muted">${book.synonyms.length} nhóm đồng nghĩa, ${book.antonyms.length} cặp trái nghĩa,
    ${book.confusables.length} nhóm từ dễ nhầm lẫn. Bấm vào từ để nghe.</p>

    <div class="toolbar">
      <input id="wrSearch" type="search" placeholder="Tìm: affect, big, borrow, lose…">
      <div class="chips" id="wrKind">
        <button class="chip active" data-kind="all">Tất cả</button>
        <button class="chip" data-kind="synonym">≈ Đồng nghĩa</button>
        <button class="chip" data-kind="antonym">↔ Trái nghĩa</button>
        <button class="chip" data-kind="confusable">≠ Dễ nhầm</button>
      </div>
      <div class="chips" id="wrLevel">
        <button class="chip active" data-level="all">Mọi trình độ</button>
        ${Object.keys(LEVEL_ORDER).map(l => `<button class="chip" data-level="${l}">${l}</button>`).join('')}
      </div>
      <div class="chips scroll-x" id="wrTag">
        <button class="chip active" data-tag="all">Mọi chủ đề</button>
        ${tags.map(t => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
    </div>

    <p id="wrCount" class="muted"></p>
    <div id="wrList" class="wr-list"></div>`;

  const filter = { text: '', kind: 'all', level: 'all', tag: 'all' };

  const draw = () => {
    const q = filter.text.trim().toLowerCase();
    const items = all.filter(x =>
      (filter.kind === 'all' || x.kind === filter.kind) &&
      (filter.level === 'all' || x.level === filter.level) &&
      (filter.tag === 'all' || (x.tags || []).includes(filter.tag)) &&
      (!q || `${wordsOf(x).join(' ')} ${x.note || ''} ${(x.tags || []).join(' ')}`.toLowerCase().includes(q)));

    el.querySelector('#wrCount').textContent = `${items.length} mục`;
    el.querySelector('#wrList').innerHTML = items.map(cardHtml).join('')
      || '<p class="empty">Không có mục nào khớp.</p>';
    wireCards(el.querySelector('#wrList'));
  };

  el.querySelector('#wrSearch').addEventListener('input', e => { filter.text = e.target.value; draw(); });
  for (const [id, key] of [['#wrKind', 'kind'], ['#wrLevel', 'level'], ['#wrTag', 'tag']]) {
    el.querySelectorAll(`${id} .chip`).forEach(chip => chip.addEventListener('click', () => {
      el.querySelectorAll(`${id} .chip`).forEach(c => c.classList.toggle('active', c === chip));
      filter[key] = chip.dataset[key];
      draw();
    }));
  }

  draw();
}

/* --------------------------------- khối gắn vào bước Chuẩn bị của bài học */

export async function renderLessonWordRelations(el, lesson) {
  let book;
  try { book = await loadWordRelations(); } catch { return; }

  const items = relevantTo(book, lesson);
  if (!items.length) return;

  const box = document.createElement('div');
  box.innerHTML = `
    <h3>🔀 Từ dễ nhầm và so sánh nghĩa</h3>
    <p class="muted">Lấy từ sổ tay so sánh từ vựng chung, lọc theo từ vựng của bài này.
    Xem đầy đủ ở tab <b>🔀 So sánh từ</b>.</p>
    <div class="wr-list compact">${items.map(cardHtml).join('')}</div>`;
  el.appendChild(box);
  wireCards(box);
}
