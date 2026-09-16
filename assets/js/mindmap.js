// Sơ đồ tư duy của một bài: từ vựng, mẫu câu, lỗi hay mắc và sắc thái trang
// trọng/thân mật trong cùng một hình. Bấm vào nhánh nào là nghe câu đó.
//
// Bố cục cây từ trái sang phải chứ không phải toả tròn: nhiều mục thì vẫn đọc
// được, và trên điện thoại chỉ cần cuộn dọc.

import { speak } from './speech.js';

const BRANCHES = [
  { key: 'vocab', label: 'Từ vựng', colour: 'var(--accent)' },
  { key: 'patterns', label: 'Mẫu câu', colour: 'var(--accent-2)' },
  { key: 'variations', label: 'Sắc thái', colour: 'var(--ok)' },
  { key: 'commonMistakes', label: 'Lỗi hay mắc', colour: 'var(--bad)' },
];

const ROW = 30;          // chiều cao một lá
const GROUP_GAP = 22;    // khoảng cách giữa hai nhánh
const X_ROOT = 14;
const X_BRANCH = 176;
const X_LEAF = 330;
const WIDTH = 860;

export function renderMindmap(el, lesson) {
  const groups = BRANCHES
    .map(b => ({ ...b, items: leavesFor(lesson, b.key) }))
    .filter(g => g.items.length);

  if (!groups.length) {
    el.innerHTML = '<p class="muted">Bài này chưa có dữ liệu để vẽ sơ đồ.</p>';
    return;
  }

  // Xếp chỗ trước rồi mới vẽ, để đường nối trùng đúng tâm mỗi lá.
  let y = 24;
  for (const g of groups) {
    g.items.forEach(item => { item.y = y; y += ROW; });
    g.y = (g.items[0].y + g.items[g.items.length - 1].y) / 2;
    y += GROUP_GAP;
  }
  const height = y + 10;
  const rootY = height / 2;

  const paths = groups.map(g => [
    curve(X_ROOT + 96, rootY, X_BRANCH - 4, g.y, g.colour, 2),
    ...g.items.map(item => curve(X_BRANCH + 74, g.y, X_LEAF - 6, item.y, g.colour, 1.2)),
  ].join('')).join('');

  const branchNodes = groups.map(g => `
    <g>
      <rect x="${X_BRANCH}" y="${g.y - 13}" width="74" height="26" rx="13"
            fill="${g.colour}" opacity="0.18" stroke="${g.colour}" stroke-width="1"/>
      <text x="${X_BRANCH + 37}" y="${g.y + 4}" text-anchor="middle"
            font-size="12" font-weight="600" fill="${g.colour}">${escXml(g.label)}</text>
    </g>`).join('');

  const leafNodes = groups.map(g => g.items.map(item => `
    <g class="leaf" data-say="${escXml(item.say)}" tabindex="0" role="button">
      <rect x="${X_LEAF}" y="${item.y - 12}" width="${WIDTH - X_LEAF - 12}" height="24" rx="6"
            fill="var(--card)" stroke="var(--line)"/>
      <text x="${X_LEAF + 10}" y="${item.y + 4}" font-size="12.5" fill="var(--fg)">
        <tspan font-weight="600">${escXml(clip(item.main, 46))}</tspan>
        <tspan fill="var(--muted)" dx="8">${escXml(clip(item.sub, 52))}</tspan>
      </text>
    </g>`).join('')).join('');

  el.innerHTML = `
    <p class="muted">Bấm vào ô nào là nghe câu đó. Cuộn ngang nếu chữ bị cắt.</p>
    <div class="mindmap-wrap">
      <svg class="mindmap" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}"
           xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Sơ đồ tư duy bài ${escXml(lesson.title)}">
        ${paths}
        <g>
          <rect x="${X_ROOT}" y="${rootY - 22}" width="96" height="44" rx="10"
                fill="var(--accent)" opacity="0.2" stroke="var(--accent)"/>
          ${wrapText(lesson.topic, X_ROOT + 48, rootY, 14)}
        </g>
        ${branchNodes}
        ${leafNodes}
      </svg>
    </div>`;

  el.querySelectorAll('.leaf').forEach(node => {
    const say = () => speak(node.dataset.say);
    node.addEventListener('click', say);
    node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(); } });
  });
}

/* ------------------------------------------------------------------ dữ liệu */

function leavesFor(lesson, key) {
  if (key === 'vocab') {
    return lesson.vocab.map(v => ({ main: v.en, sub: v.vi, say: v.example || v.en }));
  }
  if (key === 'patterns') {
    return lesson.patterns.map(p => ({ main: p.en, sub: p.vi, say: p.en.replace(/_+/g, ' something ') }));
  }
  if (key === 'variations') {
    return lesson.variations.flatMap(v => [
      { main: v.formal, sub: `trang trọng · ${v.situation}`, say: v.formal },
      { main: v.casual, sub: `thân mật · ${v.situation}`, say: v.casual },
    ]);
  }
  if (key === 'commonMistakes') {
    return lesson.commonMistakes.map(m => ({ main: m.right, sub: `đừng nói: ${m.wrong}`, say: m.right }));
  }
  return [];
}

/* ------------------------------------------------------------------- vẽ SVG */

function curve(x1, y1, x2, y2, colour, width) {
  const mid = (x1 + x2) / 2;
  return `<path d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"
    fill="none" stroke="${colour}" stroke-width="${width}" opacity="0.5"/>`;
}

/** Tên chủ đề dài thì chia hai dòng cho vừa hộp gốc. */
function wrapText(text, cx, cy, size) {
  const words = String(text).split(/\s+/);
  const lines = [''];
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > 13 && lines.length < 3) lines.push(w);
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim();
  }
  const start = cy - ((lines.length - 1) * size) / 2 + 4;
  return lines.map((line, i) =>
    `<text x="${cx}" y="${start + i * size}" text-anchor="middle" font-size="11.5"
       font-weight="700" fill="var(--fg)">${escXml(line)}</text>`).join('');
}

function clip(text, n) {
  const s = String(text ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function escXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
