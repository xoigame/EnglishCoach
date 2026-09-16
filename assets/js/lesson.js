// Renders the three non-conversation panes: preparation, drills, exercises.

import { speak, scoreSpeech, scoreClass, scoreLabel } from './speech.js';
import { captureOnce, asrSupported } from './mic.js';
import { setProgress } from './store.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderPrep(el, lesson) {
  const parts = [];

  if (lesson.goals.length) {
    parts.push(`<div class="tip"><b>🎯 Sau bài này bạn sẽ:</b><ul>${
      lesson.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`);
  }

  if (lesson.vocab.length) {
    parts.push(`<h3>🔤 Từ vựng cốt lõi</h3><div class="vocab-list">${lesson.vocab.map(v => `
      <div class="vocab-item">
        <button class="speak" data-say="${esc(v.en)}">🔊</button>
        <div>
          <div class="en">${esc(v.en)} ${v.ipa ? `<span class="ipa">${esc(v.ipa)}</span>` : ''}</div>
          <div class="vi">${esc(v.vi)}</div>
          ${v.example ? `<div class="vi"><i>“${esc(v.example)}”</i></div>` : ''}
        </div>
      </div>`).join('')}</div>`);
  }

  if (lesson.patterns.length) {
    parts.push(`<h3>🧩 Mẫu câu</h3><div class="pattern-list">${lesson.patterns.map(p => `
      <div class="pattern-item">
        <button class="speak" data-say="${esc(p.en)}">🔊</button>
        <div>
          <div class="en">${esc(p.en)}</div>
          <div class="vi">${esc(p.vi)}${p.note ? ` · <i>${esc(p.note)}</i>` : ''}</div>
        </div>
      </div>`).join('')}</div>`);
  }

  if (lesson.commonMistakes.length) {
    parts.push(`<h3>⚠️ Lỗi người Việt hay mắc ở chủ đề này</h3><div class="pattern-list">${
      lesson.commonMistakes.map(m => `
      <div class="pattern-item">
        <button class="speak" data-say="${esc(m.right)}">🔊</button>
        <div>
          <div class="en"><span class="w-bad">${esc(m.wrong)}</span> → <span class="w-ok">${esc(m.right)}</span></div>
          <div class="vi">${esc(m.vi)}</div>
        </div>
      </div>`).join('')}</div>`);
  }

  if (lesson.variations.length) {
    parts.push(`<h3>🎚️ Cùng một ý, hai mức trang trọng</h3>
      <p class="muted">Người Việt hay dịch đúng nghĩa nhưng sai mức độ trang trọng. Nghe cả hai để cảm được khác biệt.</p>
      ${lesson.variations.map(v => `
      <div class="variation">
        <div class="vsit">${esc(v.situation)}</div>
        <div class="vrow">
          <button class="speak" data-say="${esc(v.formal)}">🔊</button>
          <span class="vtag formal">Trang trọng</span>
          <span>${esc(v.formal)}</span>
        </div>
        <div class="vrow">
          <button class="speak" data-say="${esc(v.casual)}">🔊</button>
          <span class="vtag casual">Thân mật</span>
          <span>${esc(v.casual)}</span>
        </div>
        <div class="vi">${esc(v.vi)}</div>
      </div>`).join('')}`);
  }

  if (lesson.culture.length) {
    parts.push(`<h3>🌏 Khác biệt văn hoá cần biết</h3>${
      lesson.culture.map(c => `<div class="tip culture">${esc(c)}</div>`).join('')}`);
  }

  if (lesson.pronunciation.length) {
    parts.push(`<h3>🗣️ Lưu ý phát âm</h3>${lesson.pronunciation.map(p => `
      <div class="tip">
        <b>${esc(p.focus)}</b> — ${esc(p.tip)}
        ${p.words.length ? `<div class="row">${p.words.map(w =>
          `<button class="speak" data-say="${esc(w)}">🔊 ${esc(w)}</button>`).join('')}</div>` : ''}
      </div>`).join('')}`);
  }

  el.innerHTML = parts.join('') || '<p class="muted">Giáo án này chưa có phần chuẩn bị.</p>';
  el.querySelectorAll('[data-say]').forEach(b =>
    b.addEventListener('click', () => speak(b.dataset.say)));
}

export function renderDrill(el, lesson, onScore) {
  const turns = lesson.dialogue.turns;
  const roleName = k => lesson.dialogue.roles[k];

  el.innerHTML = `
    <p class="muted">Nghe mẫu → bấm 🎤 nhắc lại. Điểm dựa trên độ khớp từ mà trình duyệt nghe được,
    nên hãy nói rõ và ở nơi yên tĩnh.</p>
    ${!asrSupported ? '<div class="tip">⚠️ Trình duyệt này không hỗ trợ nhận diện giọng nói. Dùng Chrome hoặc Edge để chấm điểm.</div>' : ''}
    ${turns.map((t, i) => `
      <div class="drill-row" data-i="${i}">
        <div class="muted" style="font-size:12px">${esc(roleName(t.speaker))}</div>
        <div class="en" data-target="${esc(t.en)}">${esc(t.en)}</div>
        ${t.vi ? `<div class="vi">${esc(t.vi)}</div>` : ''}
        <div class="actions">
          <button class="ghost act-listen">🔊 Nghe</button>
          <button class="ghost act-slow">🐢 Chậm</button>
          <button class="ghost act-rec" ${asrSupported ? '' : 'disabled'}>🎤 Nhắc lại</button>
          <span class="score-pill hidden"></span>
        </div>
        <div class="heard"></div>
      </div>`).join('')}`;

  const scores = new Array(turns.length).fill(null);

  el.querySelectorAll('.drill-row').forEach(row => {
    const i = Number(row.dataset.i);
    const target = turns[i].en;
    const pill = row.querySelector('.score-pill');
    const heard = row.querySelector('.heard');
    const enLine = row.querySelector('.en');

    row.querySelector('.act-listen').addEventListener('click', () => speak(target));
    row.querySelector('.act-slow').addEventListener('click', () => speak(target, { rate: 0.65 }));

    row.querySelector('.act-rec').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      heard.textContent = '';
      try {
        const text = await captureOnce({
          onStart: () => { btn.textContent = '⏺ Đang nghe…'; btn.disabled = true; },
          onStop: () => { btn.textContent = '🎤 Nhắc lại'; btn.disabled = false; },
          onInterim: t => { heard.textContent = `… ${t}`; },
        });
        if (!text) { heard.textContent = 'Không nghe thấy gì. Thử lại nhé.'; return; }

        const { score, words } = scoreSpeech(target, text);
        scores[i] = score;
        pill.className = `score-pill ${scoreClass(score)}`;
        pill.textContent = `${score}% · ${scoreLabel(score)}`;
        enLine.innerHTML = words.map(w =>
          `<span class="${w.ok ? 'w-ok' : 'w-bad'}">${esc(w.w)}</span>`).join(' ');
        heard.textContent = `Bạn đã nói: “${text}”`;
        row.classList.toggle('done', score >= 80);

        const done = scores.filter(s => s !== null);
        const avg = Math.round(done.reduce((a, b) => a + b, 0) / done.length);
        setProgress(lesson.id, { drillAvg: avg, drillDone: done.length, drillTotal: turns.length });
        onScore?.(avg);
      } catch (err) {
        heard.textContent = micError(err);
        btn.textContent = '🎤 Nhắc lại';
        btn.disabled = false;
      }
    });
  });
}

/** Listening comprehension: a monologue the learner only ever hears, plus questions. */
function listeningBlock(lesson) {
  const l = lesson.listening;
  if (!l) return '';
  return `
    <div class="card listen-card">
      <h3>🎧 ${esc(l.title)}</h3>
      <p class="muted">Nghe đoạn này rồi trả lời. Chữ được giấu cho tới khi bạn trả lời xong —
      nghe lại bao nhiêu lần cũng được.</p>
      <div class="row">
        <button class="primary act-play">▶ Nghe</button>
        <button class="ghost act-play-slow">🐢 Nghe chậm</button>
        <button class="ghost act-script">📄 Hiện lời thoại</button>
      </div>
      <div class="passage hidden">${esc(l.passage)}${l.vi ? `<div class="vi">${esc(l.vi)}</div>` : ''}</div>
      ${l.questions.map((q, i) => `
        <div class="quiz-q" data-q="${i}">
          <div class="q">${i + 1}. ${esc(q.q)}</div>
          <div class="choices">${q.choices.map((c, j) =>
            `<button class="choice" data-c="${j}">${esc(c)}</button>`).join('')}</div>
          <div class="why hidden">${esc(q.vi)}</div>
        </div>`).join('')}
      <div class="listen-score muted"></div>
    </div>`;
}

function wireListening(el, lesson) {
  const l = lesson.listening;
  if (!l) return;
  const card = el.querySelector('.listen-card');
  const passage = card.querySelector('.passage');
  const answered = new Array(l.questions.length).fill(null);

  card.querySelector('.act-play').addEventListener('click', () => speak(l.passage));
  card.querySelector('.act-play-slow').addEventListener('click', () => speak(l.passage, { rate: 0.7 }));
  card.querySelector('.act-script').addEventListener('click', ev => {
    passage.classList.toggle('hidden');
    ev.currentTarget.textContent = passage.classList.contains('hidden')
      ? '📄 Hiện lời thoại' : '🙈 Ẩn lời thoại';
  });

  card.querySelectorAll('.quiz-q').forEach(block => {
    const i = Number(block.dataset.q);
    const q = l.questions[i];
    block.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
      if (answered[i] !== null) return;
      const picked = Number(btn.dataset.c);
      answered[i] = picked;
      block.querySelectorAll('.choice').forEach((b, j) => {
        b.disabled = true;
        if (j === q.answer) b.classList.add('right');
        else if (j === picked) b.classList.add('wrong');
      });
      block.querySelector('.why').classList.remove('hidden');

      const done = answered.filter(a => a !== null).length;
      const correct = answered.filter((a, k) => a === l.questions[k].answer).length;
      card.querySelector('.listen-score').textContent = `Đúng ${correct}/${done} câu`;
      if (done === l.questions.length) passage.classList.remove('hidden');
    }));
  });
}

/** Dictation: hear the sentence with the text hidden, then write or say it back. */
export function renderListen(el, lesson) {
  const items = [
    ...lesson.dialogue.turns.map(t => ({ en: t.en, vi: t.vi })),
    ...lesson.drills.map(d => ({ en: d.en, vi: d.vi })),
  ].slice(0, 16);

  el.innerHTML = `
    ${listeningBlock(lesson)}
    <h3>✍️ Nghe chép chính tả</h3>
    <p class="muted">Bấm 🔊 để nghe (chữ bị che), rồi gõ hoặc nói lại đúng câu bạn nghe được.
    Đây là phần rèn tai nghe — đừng bấm 👁 xem đáp án quá sớm.</p>
    ${items.map((it, i) => `
      <div class="drill-row listen-row" data-i="${i}">
        <div class="masked">Câu ${i + 1} · ${'▁ '.repeat(Math.min(12, it.en.split(/\s+/).length)).trim()}</div>
        <div class="actions">
          <button class="ghost act-listen">🔊 Nghe</button>
          <button class="ghost act-slow">🐢 Chậm</button>
          <button class="ghost act-rec" ${asrSupported ? '' : 'disabled'}>🎤 Nói lại</button>
          <button class="ghost act-show">👁 Đáp án</button>
          <span class="score-pill hidden"></span>
        </div>
        <input class="dictation" type="text" placeholder="Gõ câu bạn nghe được rồi Enter…">
        <div class="reveal hidden"></div>
        <div class="heard"></div>
      </div>`).join('')}`;

  wireListening(el, lesson);

  el.querySelectorAll('.listen-row').forEach(row => {
    const i = Number(row.dataset.i);
    const target = items[i].en;
    const pill = row.querySelector('.score-pill');
    const reveal = row.querySelector('.reveal');
    const heard = row.querySelector('.heard');
    const input = row.querySelector('.dictation');

    const check = answer => {
      if (!answer) return;
      const { score, words } = scoreSpeech(target, answer);
      pill.className = `score-pill ${scoreClass(score)}`;
      pill.textContent = `${score}%`;
      reveal.classList.remove('hidden');
      reveal.innerHTML = words.map(w =>
        `<span class="${w.ok ? 'w-ok' : 'w-bad'}">${esc(w.w)}</span>`).join(' ') +
        (items[i].vi ? `<div class="vi">${esc(items[i].vi)}</div>` : '');
      row.classList.toggle('done', score >= 80);
      if (score < 80) speak(target, { rate: 0.65 });
    };

    row.querySelector('.act-listen').addEventListener('click', () => speak(target));
    row.querySelector('.act-slow').addEventListener('click', () => speak(target, { rate: 0.6 }));
    row.querySelector('.act-show').addEventListener('click', () => {
      reveal.classList.remove('hidden');
      reveal.innerHTML = `${esc(target)}${items[i].vi ? `<div class="vi">${esc(items[i].vi)}</div>` : ''}`;
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') check(input.value.trim());
    });

    row.querySelector('.act-rec').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      try {
        const text = await captureOnce({
          onStart: () => { btn.textContent = '⏺ Đang nghe…'; btn.disabled = true; },
          onStop: () => { btn.textContent = '🎤 Nói lại'; btn.disabled = false; },
          onInterim: t => { heard.textContent = `… ${t}`; },
        });
        if (!text) { heard.textContent = 'Không nghe thấy gì.'; return; }
        heard.textContent = `Bạn nói: “${text}”`;
        check(text);
      } catch (err) {
        heard.textContent = micError(err);
        btn.textContent = '🎤 Nói lại';
        btn.disabled = false;
      }
    });
  });
}

export function renderQuiz(el, lesson) {
  if (!lesson.drills.length && !lesson.homework.length) {
    el.innerHTML = '<p class="muted">Giáo án này chưa có bài tập.</p>';
    return;
  }

  el.innerHTML = `
    ${lesson.drills.length ? `<h3>✍️ Dịch sang tiếng Anh rồi nói ra</h3>${lesson.drills.map((d, i) => `
      <div class="quiz-item" data-i="${i}">
        <div class="q">${esc(d.vi)}</div>
        <div class="actions row">
          <button class="ghost act-rec" ${asrSupported ? '' : 'disabled'}>🎤 Trả lời</button>
          <button class="ghost act-show">👁 Xem đáp án</button>
          <span class="score-pill hidden"></span>
        </div>
        <div class="reveal hidden">${esc(d.en)}${d.alts.length ? `<div class="vi">Cách khác: ${d.alts.map(esc).join(' · ')}</div>` : ''}</div>
        <div class="heard"></div>
      </div>`).join('')}` : ''}
    ${lesson.homework.length ? `<h3>🏠 Bài về nhà</h3><ul>${
      lesson.homework.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}`;

  el.querySelectorAll('.quiz-item').forEach(item => {
    const i = Number(item.dataset.i);
    const d = lesson.drills[i];
    const reveal = item.querySelector('.reveal');
    const pill = item.querySelector('.score-pill');
    const heard = item.querySelector('.heard');

    item.querySelector('.act-show').addEventListener('click', () => {
      reveal.classList.remove('hidden');
      speak(d.en);
    });

    item.querySelector('.act-rec').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      try {
        const text = await captureOnce({
          onStart: () => { btn.textContent = '⏺ Đang nghe…'; btn.disabled = true; },
          onStop: () => { btn.textContent = '🎤 Trả lời'; btn.disabled = false; },
          onInterim: t => { heard.textContent = `… ${t}`; },
        });
        if (!text) { heard.textContent = 'Không nghe thấy gì.'; return; }
        const best = [d.en, ...d.alts]
          .map(ans => scoreSpeech(ans, text))
          .reduce((a, b) => (b.score > a.score ? b : a));
        pill.className = `score-pill ${scoreClass(best.score)}`;
        pill.textContent = `${best.score}%`;
        heard.textContent = `Bạn đã nói: “${text}”`;
        if (best.score < 80) reveal.classList.remove('hidden');
      } catch (err) {
        heard.textContent = micError(err);
        btn.textContent = '🎤 Trả lời';
        btn.disabled = false;
      }
    });
  });
}

export function micError(err) {
  const code = err?.message || '';
  if (code === 'not-allowed' || code === 'service-not-allowed') return '🚫 Trình duyệt chặn micro. Cho phép quyền micro rồi thử lại.';
  if (code === 'no-support') return '🚫 Trình duyệt không hỗ trợ nhận diện giọng nói (hãy dùng Chrome/Edge).';
  if (code === 'network') return '🌐 Nhận diện giọng nói cần mạng. Kiểm tra kết nối.';
  if (code === 'audio-capture') return '🎤 Không tìm thấy micro.';
  return `Lỗi micro: ${code || 'không rõ'}`;
}
