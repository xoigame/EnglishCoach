// Phát cả hội thoại liền mạch như một đoạn audio: hai vai hai giọng, tạm dừng,
// tốc độ, loop, và chế độ "ẩn vai tôi" để bạn tự đọc lượt của mình.

import { speak, stopSpeaking, settings, voicePair, onHardStop } from './speech.js';

// Tự khai báo thay vì import từ lesson.js: lesson.js sẽ import file này,
// nên nhập ngược lại là tạo vòng import.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MODES = {
  both: 'Cả hai vai',
  partner: 'Chỉ vai AI (bạn tự đọc lượt mình)',
};

export function createPlayer({ lesson, mount }) {
  const { turns, roles, userRole } = lesson.dialogue;
  const partnerRole = userRole === 'a' ? 'b' : 'a';

  let playing = false;
  let paused = false;
  let idx = 0;
  let token = 0;          // tăng mỗi lần dừng/phát lại để bỏ vòng lặp cũ
  let mode = 'both';
  let loop = false;
  let gapMs = 350;

  mount.innerHTML = `
    <div class="player">
      <div class="player-bar">
        <button class="primary p-play">▶ Phát cả bài</button>
        <button class="ghost p-pause" disabled>⏸ Tạm dừng</button>
        <button class="ghost p-stop" disabled>⏹ Dừng</button>
        <label class="p-loop"><input type="checkbox"> 🔁 Lặp lại</label>
      </div>
      <div class="player-bar">
        <label class="p-speed">Tốc độ <input type="range" min="0.5" max="1.2" step="0.05" value="${settings.rate}"> <span>${Number(settings.rate).toFixed(2)}×</span></label>
        <label class="p-gap">Nghỉ giữa câu <input type="range" min="0" max="3000" step="250" value="350"> <span>0,4s</span></label>
      </div>
      <div class="player-bar">
        <label class="p-mode">Chế độ <select>${Object.entries(MODES)
          .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      </div>
      <ol class="script">${turns.map((t, i) => `
        <li class="line ${t.speaker === userRole ? 'mine' : 'theirs'}" data-i="${i}">
          <span class="who">${esc(roles[t.speaker])}</span>
          <span class="en">${esc(t.en)}</span>
          ${t.vi ? `<span class="vi">${esc(t.vi)}</span>` : ''}
        </li>`).join('')}</ol>
    </div>`;

  const el = sel => mount.querySelector(sel);
  const playBtn = el('.p-play');
  const pauseBtn = el('.p-pause');
  const stopBtn = el('.p-stop');
  const lines = [...mount.querySelectorAll('.line')];

  /* ------------------------------------------------------------ vòng phát */

  function highlight(i) {
    lines.forEach((li, k) => li.classList.toggle('now', k === i));
    if (i >= 0) lines[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function run(startAt = 0) {
    const mine = token;
    playing = true;
    paused = false;
    playBtn.textContent = '▶ Đang phát…';
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;

    const [voiceA, voiceB] = voicePair();

    for (idx = startAt; idx < turns.length; idx++) {
      if (token !== mine) return;                 // đã bị dừng
      while (paused && token === mine) await sleep(120);
      if (token !== mine) return;

      const t = turns[idx];
      highlight(idx);

      // "Chỉ vai AI": lượt của bạn chỉ chừa khoảng lặng đủ để bạn tự đọc.
      if (mode === 'partner' && t.speaker === userRole) {
        await sleep(Math.max(1200, t.en.split(/\s+/).length * 320));
        continue;
      }

      await speak(t.en, {
        rate: Number(el('.p-speed input').value),
        voiceURI: t.speaker === partnerRole ? voiceA : voiceB,
        pitch: t.speaker === partnerRole ? 1 : 1.08,
      });
      if (token !== mine) return;
      await sleep(gapMs);
    }

    if (token !== mine) return;
    if (loop) return run(0);
    finish();
  }

  function finish() {
    playing = false;
    paused = false;
    highlight(-1);
    playBtn.textContent = '▶ Phát cả bài';
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = '⏸ Tạm dừng';
    stopBtn.disabled = true;
  }

  function stop() {
    token++;
    stopSpeaking();
    finish();
  }

  // Nút Dừng ở thanh phát cuối trang: dừng hẳn cả bài, không chỉ câu đang đọc.
  onHardStop(() => { if (playing) stop(); });

  /* -------------------------------------------------------------- điều khiển */

  playBtn.addEventListener('click', () => { token++; run(0); });

  pauseBtn.addEventListener('click', () => {
    if (!playing) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
    if (paused) stopSpeaking();
    else { token++; run(idx); }   // phát lại từ đúng câu đang dừng
  });

  stopBtn.addEventListener('click', stop);

  el('.p-loop input').addEventListener('change', e => { loop = e.target.checked; });

  el('.p-speed input').addEventListener('input', e => {
    el('.p-speed span').textContent = `${Number(e.target.value).toFixed(2)}×`;
  });

  el('.p-gap input').addEventListener('input', e => {
    gapMs = Number(e.target.value);
    el('.p-gap span').textContent = `${(gapMs / 1000).toFixed(1).replace('.', ',')}s`;
  });

  el('.p-mode select').addEventListener('change', e => { mode = e.target.value; });

  // Bấm một câu để nghe riêng câu đó.
  lines.forEach(li => li.addEventListener('click', () => {
    if (playing) return;
    const t = turns[Number(li.dataset.i)];
    const [voiceA, voiceB] = voicePair();
    highlight(Number(li.dataset.i));
    speak(t.en, {
      rate: Number(el('.p-speed input').value),
      voiceURI: t.speaker === partnerRole ? voiceA : voiceB,
    }).then(() => highlight(-1));
  }));

  return { stop };
}
