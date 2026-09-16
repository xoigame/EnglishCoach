// The 1-1 conversation pane: scripted role-play (offline) and free chat (bring-your-own-key).
// Both modes correct the learner out loud, not just on screen.

import { speak, stopSpeaking, scoreSpeech, scoreClass, scoreLabel, settings } from './speech.js';
import { captureOnce, stopCapture, isRecording, asrSupported } from './mic.js';
import { esc, micError } from './lesson.js';
import { buildCorrection, praise, weakWords } from './coach.js';
import { getApiKey, setProgress } from './store.js';

const MODEL = 'claude-opus-5';

export function createRoleplay({ lesson, els, onScore }) {
  const { roles, userRole, turns } = lesson.dialogue;
  const partnerRole = userRole === 'a' ? 'b' : 'a';
  let mode = 'script';
  let idx = 0;
  let attempt = 0;
  let scores = [];
  let wordHistory = [];
  let history = [];
  let awaiting = false;
  let speaking = false;
  let pending = '';
  let lastSpoken = '';

  /* ------------------------------------------------------------- UI bits */

  const bubble = (who, html) => {
    const div = document.createElement('div');
    div.className = `bubble ${who}`;
    div.innerHTML = html;
    els.chatLog.appendChild(div);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
    return div;
  };

  const status = text => { els.interim.textContent = text; };

  /** Speak a queue of lines in order; skipped entirely when coaching aloud is off. */
  async function sayAll(lines, { force = false } = {}) {
    if (!force && !settings.coachAloud) return;
    speaking = true;
    els.micBtn.disabled = true;
    for (const line of lines) await speak(line.text, { rate: line.rate });
    speaking = false;
    els.micBtn.disabled = !asrSupported;
  }

  async function partnerSays(en, vi) {
    lastSpoken = en;
    bubble('ai', `${esc(en)}${vi ? `<span class="vi">${esc(vi)}</span>` : ''}`);
    await sayAll([{ text: en }], { force: true });
  }

  /* --------------------------------------------------------- script mode */

  async function advanceScript() {
    while (idx < turns.length && turns[idx].speaker !== userRole) {
      const t = turns[idx];
      await partnerSays(t.en, t.vi);
      idx++;
    }
    if (idx >= turns.length) return finishScript();
    attempt = 0;
    awaiting = true;
    status(`Tới lượt bạn (${roles[userRole]}). Bấm 🎤 rồi nói. Cần gợi ý thì bấm 💡.`);
    flushPending();
  }

  function finishScript() {
    awaiting = false;
    if (!scores.length) { bubble('sys', '🏁 Hết hội thoại.'); return; }

    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const weak = weakWords(wordHistory);
    bubble('sys', `🏁 Hoàn thành — điểm trung bình <b>${avg}%</b> qua ${scores.length} lượt nói.` +
      (weak.length ? `<br>Từ cần luyện thêm: ${weak.map(w => `<b>${esc(w.word)}</b>`).join(', ')}` : ''));

    setProgress(lesson.id, { talkAvg: avg, talkAt: Date.now() });
    onScore?.(avg);
    sayAll([{ text: avg >= settings.passScore ? 'Great session. Well done.' : 'Good work. Let us practise this one again soon.', rate: 0.9 }]);
    status('Xong! Bấm ↺ để luyện lại, hoặc chuyển sang chế độ tự do.');
  }

  async function judgeScript(text) {
    const expected = turns[idx].en;
    const { score, words } = scoreSpeech(expected, text);
    const pass = score >= settings.passScore;
    const lastChance = attempt + 1 >= settings.maxTries;

    const wrongWords = words.filter(w => !w.ok).map(w => w.w);
    bubble('me', `${esc(text)}<span class="fb">${pass ? '✅' : '📝'} ${score}% · ${scoreLabel(score)}</span>`);

    if (pass) {
      scores.push(score);
      wordHistory.push(words);
      idx++;
      await sayAll([{ text: praise(score), rate: 0.95 }]);
      return advanceScript();
    }

    // Sai — sửa bằng giọng nói rồi cho thử lại.
    const fix = buildCorrection({
      expected, spoken: text, score, words,
      attempt, lastChance, mistakes: lesson.commonMistakes,
    });
    bubble('coach', `🧑‍🏫 <b>Sửa lỗi</b><br>${fix.vi}` +
      (fix.showModel ? `<span class="fb">Câu mẫu: <b>${esc(expected)}</b>` +
        (wrongWords.length ? `<br>Từ chưa khớp: <span class="w-bad">${wrongWords.map(esc).join(', ')}</span>` : '') +
        '</span>' : ''));
    await sayAll(fix.say);

    attempt++;
    if (lastChance) {
      scores.push(score);
      wordHistory.push(words);
      idx++;
      return advanceScript();
    }
    awaiting = true;
    status(`Thử lại lần ${attempt + 1}/${settings.maxTries} — bấm 🎤.`);
  }

  /* ----------------------------------------------------------- live mode */

  function systemPrompt() {
    const mistakes = lesson.commonMistakes.slice(0, 5)
      .map(m => `- "${m.wrong}" -> "${m.right}"`).join('\n');
    return [
      lesson.roleplay.persona,
      `You are role-playing with a Vietnamese learner of English at CEFR level ${lesson.level}.`,
      `Scene: ${lesson.topic}. You play "${roles[partnerRole]}"; the learner plays "${roles[userRole]}".`,
      lesson.roleplay.goal ? `Conversation goal: ${lesson.roleplay.goal}` : '',
      `You already opened the conversation with: "${lesson.roleplay.opener}"`,
      mistakes ? `\nMistakes this lesson targets:\n${mistakes}` : '',
      '',
      'Rules:',
      `- Stay in character. Keep each reply to 1-2 short sentences suited to ${lesson.level}.`,
      '- Ask a follow-up question most turns so the learner keeps talking.',
      '- Never write Vietnamese in the EN or FIX lines.',
      '- The learner speaks through speech recognition, so ignore missing punctuation, capitalisation and obvious transcription noise. Only correct real grammar, word-choice or word-order errors.',
      '',
      'Answer in exactly this format:',
      'EN: <your in-character reply>',
      'FIX: <if the learner made a real mistake, one short spoken correction in English, e.g. Small fix: we say "I would like to book a room". Otherwise write NONE>',
      'TIP: <one short Vietnamese note explaining the fix, or a short Vietnamese compliment if there was no mistake>',
    ].filter(Boolean).join('\n');
  }

  let clientPromise = null;
  function getClient(key) {
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@anthropic-ai/sdk')
        .then(m => new m.default({ apiKey: key, dangerouslyAllowBrowser: true }))
        .catch(err => { clientPromise = null; throw err; });
    }
    return clientPromise;
  }

  async function liveReply(userText) {
    const key = getApiKey();
    if (!key) {
      bubble('sys', '🔑 Chưa có API key. Vào tab ⚙️ Cài đặt để dán key, hoặc quay lại chế độ Kịch bản.');
      return;
    }
    const thinking = bubble('ai', '<i>…đang soạn câu trả lời</i>');
    try {
      const client = await getClient(key);
      history.push({ role: 'user', content: userText });

      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 600,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemPrompt(),
        messages: history,
      });

      if (res.stop_reason === 'refusal') {
        thinking.remove();
        history.pop();
        bubble('sys', '⚠️ AI từ chối trả lời lượt này. Thử đổi cách diễn đạt.');
        return;
      }

      const raw = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      history.push({ role: 'assistant', content: raw });

      const en = (raw.match(/^EN:\s*(.+)$/mi)?.[1] || raw.split('\n')[0] || '').trim();
      const fixLine = (raw.match(/^FIX:\s*(.+)$/mi)?.[1] || '').trim();
      const tip = (raw.match(/^TIP:\s*(.+)$/mi)?.[1] || '').trim();
      const fix = /^none\.?$/i.test(fixLine) ? '' : fixLine;

      thinking.remove();
      lastSpoken = en;
      bubble('ai', esc(en));
      if (fix || tip) {
        bubble('coach', `🧑‍🏫 ${fix ? `<b>${esc(fix)}</b><br>` : ''}${esc(tip)}`);
      }

      await sayAll([{ text: en }], { force: true });
      if (fix) await sayAll([{ text: fix, rate: 0.82 }]);
      status('Tới lượt bạn — bấm 🎤 và trả lời tự nhiên.');
    } catch (err) {
      thinking.remove();
      history.pop();
      bubble('sys', `⚠️ ${apiError(err)}`);
    }
  }

  function apiError(err) {
    const s = err?.status;
    if (s === 401) return 'API key không hợp lệ hoặc đã bị thu hồi.';
    if (s === 429) return 'Bị giới hạn tốc độ (429). Chờ một chút rồi thử lại.';
    if (s === 400) return `Yêu cầu không hợp lệ: ${err?.message || ''}`;
    if (err?.message?.includes('Failed to fetch')) {
      return 'Không gọi được api.anthropic.com từ trình duyệt (mạng hoặc CORS). Kiểm tra kết nối.';
    }
    return err?.message || 'Lỗi không xác định khi gọi API.';
  }

  /* ------------------------------------------------------------ actions */

  /** Câu người học gửi khi AI còn đang nói — xử lý ngay khi tới lượt họ. */
  function flushPending() {
    if (!pending || !awaiting) return;
    const text = pending;
    pending = '';
    submitUserText(text);
  }

  function submitUserText(text) {
    if (!text) return;
    if (mode === 'script') {
      if (!awaiting) { pending = text; status(`Đã ghi nhận “${text}” — chờ AI nói xong.`); return; }
      awaiting = false;
      judgeScript(text);
    } else {
      bubble('me', esc(text));
      liveReply(text);
    }
  }

  async function listen() {
    if (speaking) { stopSpeaking(); speaking = false; }
    if (isRecording()) { stopCapture(); return; }
    try {
      const text = await captureOnce({
        onStart: () => { els.micBtn.classList.add('listening'); status('⏺ Đang nghe…'); },
        onStop: () => { els.micBtn.classList.remove('listening'); },
        onInterim: t => status(`… ${t}`),
      });
      if (!text) { status('Không nghe thấy gì. Bấm 🎤 thử lại.'); return; }
      status(`Bạn nói: “${text}”`);
      submitUserText(text);
    } catch (err) {
      els.micBtn.classList.remove('listening');
      status(micError(err));
    }
  }

  function hint() {
    if (mode === 'live') {
      bubble('sys', '💡 Chế độ tự do không có câu mẫu — cứ nói theo ý bạn, AI sẽ sửa sau mỗi câu.');
      return;
    }
    if (!awaiting) return;
    const t = turns[idx];
    bubble('sys', `💡 Gợi ý: <b>${esc(t.en)}</b>${t.vi ? ` — ${esc(t.vi)}` : ''}${t.hint ? `<br>${esc(t.hint)}` : ''}`);
    sayAll([{ text: t.en, rate: 0.68 }], { force: true });
  }

  function replay() { if (lastSpoken) sayAll([{ text: lastSpoken }], { force: true }); }

  function skip() {
    if (mode !== 'script' || !awaiting) return;
    awaiting = false;
    bubble('me', `<i>(bỏ qua)</i><span class="fb">Câu mẫu: ${esc(turns[idx].en)}</span>`);
    idx++;
    advanceScript();
  }

  function start(nextMode) {
    stopSpeaking();
    stopCapture();
    speaking = false;
    mode = nextMode || mode;
    idx = 0;
    attempt = 0;
    scores = [];
    wordHistory = [];
    history = [];
    awaiting = false;
    pending = '';
    els.chatLog.innerHTML = '';
    els.roleInfo.innerHTML = `Bạn đóng vai <b>${esc(roles[userRole])}</b> · AI đóng vai <b>${esc(roles[partnerRole])}</b>` +
      (asrSupported ? '' : ' · <span class="w-bad">micro không khả dụng, hãy gõ ở ô bên dưới</span>');
    els.micBtn.disabled = !asrSupported;

    if (mode === 'script') {
      bubble('sys', `Chế độ kịch bản — ${turns.length} lượt. Nói sai sẽ được sửa bằng giọng nói và cho nói lại (tối đa ${settings.maxTries} lần).`);
      advanceScript();
    } else {
      bubble('sys', 'Chế độ tự do — AI đóng vai, trả lời theo ý bạn nói và sửa lỗi bằng giọng nói sau mỗi câu.');
      partnerSays(lesson.roleplay.opener, '');
      status('Tới lượt bạn — bấm 🎤 và trả lời tự nhiên.');
    }
  }

  function destroy() { stopSpeaking(); stopCapture(); }

  return { start, listen, hint, replay, skip, submitUserText, destroy, get mode() { return mode; } };
}
