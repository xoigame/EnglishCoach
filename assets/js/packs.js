// Mười hội thoại mẫu cho mỗi chủ đề: nghe cả bài, rồi đọc từng câu và được
// chấm phát âm. Nội dung nằm ở data/packs/<id>.json, tải khi mở tab chứ không
// nhét vào file giáo án — mỗi bộ nặng hơn cả bài học gốc.

import { speak, scoreSpeech, scoreClass, scoreLabel } from './speech.js';
import { captureOnce, asrSupported } from './mic.js';
import { esc, micError, wireGloss } from './lesson.js';
import { createPlayer } from './player.js';
import { setProgress, getProgress } from './store.js';

export async function renderPacks(el, lesson) {
  el.innerHTML = '<p class="muted">Đang tải bộ hội thoại…</p>';

  let pack;
  try {
    const res = await fetch(`data/packs/${encodeURIComponent(lesson.id)}.json`, { cache: 'no-cache' });
    if (res.status === 404) return notYet(el, lesson);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pack = await res.json();
  } catch (err) {
    el.innerHTML = `<p class="msg bad">Không tải được bộ hội thoại: ${esc(err.message)}</p>`;
    return;
  }

  const dialogues = pack.dialogues || [];
  const progress = getProgress(lesson.id)?.packs || {};

  el.innerHTML = `
    <p class="muted">${dialogues.length} tình huống khác nhau của cùng chủ đề, xếp từ dễ tới khó.
    Mở một tình huống, nghe cả bài, rồi bấm 🎤 đọc lại từng câu để chấm phát âm.</p>
    <div class="pack-list">${dialogues.map((d, i) => `
      <details class="pack" data-i="${i}">
        <summary>
          <span class="pack-n">${i + 1}</span>
          <span class="pack-title">${esc(d.title)}</span>
          <span class="pack-score ${progress[i] ? scoreClass(progress[i]) : 'hidden'}">${progress[i] ? `${progress[i]}%` : ''}</span>
        </summary>
        <div class="pack-body"></div>
      </details>`).join('')}</div>`;

  // Nội dung mỗi tình huống chỉ dựng khi mở lần đầu: 10 bộ × 8 lượt là quá
  // nhiều DOM để dựng hết ngay, nhất là trên điện thoại.
  el.querySelectorAll('.pack').forEach(node => {
    node.addEventListener('toggle', () => {
      if (!node.open || node.dataset.built) return;
      node.dataset.built = '1';
      buildBody(node, dialogues[Number(node.dataset.i)], Number(node.dataset.i), lesson, el);
    });
  });
}

function notYet(el, lesson) {
  el.innerHTML = `
    <div class="tip">
      <b>Chủ đề này chưa có bộ 10 hội thoại mẫu.</b>
      <p class="muted">Soạn bằng Codex ở máy bạn:</p>
      <pre class="code"><code>node tools/gen-packs.mjs --only ${esc(lesson.id)}</code></pre>
      <p class="muted">Hoặc soạn cả lộ trình: <code>node tools/gen-packs.mjs --jobs 2</code></p>
    </div>`;
}

function buildBody(node, dlg, index, lesson, root) {
  const body = node.querySelector('.pack-body');
  const roles = lesson.dialogue.roles;
  const userRole = lesson.dialogue.userRole;

  body.innerHTML = `
    ${dlg.situation ? `<p class="pack-situation">${esc(dlg.situation)}</p>` : ''}
    <div class="pack-player"></div>
    <h4>Đọc lại từng câu</h4>
    ${dlg.turns.map((t, i) => `
      <div class="drill-row pack-row" data-i="${i}">
        <div class="muted" style="font-size:12px">${esc(roles[t.speaker] || t.speaker)}${
          t.speaker === userRole ? ' · lượt của bạn' : ''}</div>
        <div class="en">${esc(t.en)}</div>
        ${t.vi ? `<div class="vi">${esc(t.vi)}</div>` : ''}
        <div class="actions">
          <button class="ghost act-listen">🔊 Nghe</button>
          <button class="ghost act-slow">🐢 Chậm</button>
          <button class="ghost act-rec" ${asrSupported ? '' : 'disabled'}>🎤 Đọc lại</button>
          <button class="ghost act-gloss">📖 Từng từ</button>
          <span class="score-pill hidden"></span>
        </div>
        <div class="gloss hidden"></div>
        <div class="heard"></div>
      </div>`).join('')}`;

  // Trình phát dùng lại nguyên code của bài gốc: hai giọng, loop, tốc độ,
  // chế độ chừa khoảng lặng cho bạn tự đọc.
  createPlayer({
    lesson: { dialogue: { turns: dlg.turns, roles, userRole } },
    mount: body.querySelector('.pack-player'),
  });
  wireGloss(body, lesson);

  const scores = new Array(dlg.turns.length).fill(null);

  body.querySelectorAll('.pack-row').forEach(row => {
    const i = Number(row.dataset.i);
    const target = dlg.turns[i].en;
    const pill = row.querySelector('.score-pill');
    const heard = row.querySelector('.heard');
    const line = row.querySelector('.en');

    row.querySelector('.act-listen').addEventListener('click', () => speak(target));
    row.querySelector('.act-slow').addEventListener('click', () => speak(target, { rate: 0.65 }));

    row.querySelector('.act-rec').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      heard.textContent = '';
      try {
        const text = await captureOnce({
          onStart: () => { btn.textContent = '⏺ Đang nghe…'; btn.disabled = true; },
          onStop: () => { btn.textContent = '🎤 Đọc lại'; btn.disabled = false; },
          onInterim: t => { heard.textContent = `… ${t}`; },
        });
        if (!text) { heard.textContent = 'Không nghe thấy gì. Thử lại nhé.'; return; }

        const { score, words } = scoreSpeech(target, text);
        scores[i] = score;
        pill.className = `score-pill ${scoreClass(score)}`;
        pill.textContent = `${score}% · ${scoreLabel(score)}`;
        line.innerHTML = words.map(w =>
          `<span class="${w.ok ? 'w-ok' : 'w-bad'}">${esc(w.w)}</span>`).join(' ');
        heard.textContent = `Bạn đã nói: “${text}”`;
        row.classList.toggle('done', score >= 80);
        if (score < 80) speak(target, { rate: 0.65 });

        saveAverage(lesson, index, scores, node, root);
      } catch (err) {
        heard.textContent = micError(err);
        btn.textContent = '🎤 Đọc lại';
        btn.disabled = false;
      }
    });
  });
}

function saveAverage(lesson, index, scores, node, root) {
  const done = scores.filter(s => s !== null);
  if (!done.length) return;
  const avg = Math.round(done.reduce((a, b) => a + b, 0) / done.length);

  const badge = node.querySelector('.pack-score');
  badge.className = `pack-score ${scoreClass(avg)}`;
  badge.textContent = `${avg}%`;

  const packs = { ...(getProgress(lesson.id)?.packs || {}), [index]: avg };
  setProgress(lesson.id, { packs });

  // Điểm chung của bài lấy điểm tốt nhất trong mọi phần luyện.
  const all = Object.values(packs);
  root.dispatchEvent(new CustomEvent('pack-score', {
    bubbles: true,
    detail: { best: Math.max(...all) },
  }));
}
