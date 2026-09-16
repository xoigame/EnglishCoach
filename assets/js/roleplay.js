// The 1-1 conversation pane: scripted role-play (offline) and free chat (bring-your-own-key).

import { speak, stopSpeaking, scoreSpeech, scoreClass, scoreLabel } from './speech.js';
import { captureOnce, stopCapture, isRecording, asrSupported } from './mic.js';
import { esc, micError } from './lesson.js';
import { getApiKey, setProgress } from './store.js';

const MODEL = 'claude-opus-5';

export function createRoleplay({ lesson, els, onScore }) {
  const { roles, userRole, turns } = lesson.dialogue;
  const partnerRole = userRole === 'a' ? 'b' : 'a';
  let mode = 'script';
  let idx = 0;
  let scores = [];
  let history = [];
  let awaiting = false;
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

  async function partnerSays(en, vi) {
    lastSpoken = en;
    bubble('ai', `${esc(en)}${vi ? `<span class="vi">${esc(vi)}</span>` : ''}`);
    await speak(en);
  }

  /* --------------------------------------------------------- script mode */

  async function advanceScript() {
    while (idx < turns.length && turns[idx].speaker !== userRole) {
      const t = turns[idx];
      await partnerSays(t.en, t.vi);
      idx++;
    }
    if (idx >= turns.length) return finishScript();
    awaiting = true;
    status(`Tới lượt bạn (${roles[userRole]}). Bấm 🎤 rồi nói. Cần gợi ý thì bấm 💡.`);
  }

  function finishScript() {
    awaiting = false;
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    bubble('sys', scores.length
      ? `🏁 Hoàn thành hội thoại — điểm trung bình <b>${avg}%</b> (${scores.length} lượt nói).`
      : '🏁 Hết hội thoại.');
    if (scores.length) {
      setProgress(lesson.id, { talkAvg: avg, talkAt: Date.now() });
      onScore?.(avg);
    }
    status('Xong! Bấm ↺ để luyện lại, hoặc chuyển sang chế độ tự do.');
  }

  function judgeScript(text) {
    const expected = turns[idx].en;
    const { score, words } = scoreSpeech(expected, text);
    scores.push(score);

    const coloured = words.map(w => `<span class="${w.ok ? 'w-ok' : 'w-bad'}">${esc(w.w)}</span>`).join(' ');
    bubble('me', `${esc(text)}<span class="fb">${score >= 80 ? '✅' : '📝'} ${score}% · ${scoreLabel(score)}` +
      (score >= 95 ? '' : `<br>Câu mẫu: ${coloured}`) + '</span>');

    idx++;
    advanceScript();
  }

  /* ----------------------------------------------------------- live mode */

  function systemPrompt() {
    return [
      lesson.roleplay.persona,
      `You are role-playing with a Vietnamese learner of English whose level is CEFR ${lesson.level}.`,
      `Scene: ${lesson.topic}. You play "${roles[partnerRole]}"; the learner plays "${roles[userRole]}".`,
      lesson.roleplay.goal ? `Conversation goal: ${lesson.roleplay.goal}` : '',
      `You already opened the conversation with: "${lesson.roleplay.opener}"`,
      '',
      'Rules:',
      `- Stay in character. Keep each reply to 1-2 short sentences suited to ${lesson.level}.`,
      '- Never switch to Vietnamese inside your spoken line.',
      '- Ask a follow-up question most turns so the learner keeps talking.',
      '- The learner speaks through speech recognition, so expect missing punctuation and small transcription errors. Do not comment on those.',
      '',
      'Answer in exactly this format, nothing else:',
      'EN: <your in-character reply>',
      'TIP: <one short Vietnamese coaching note: sửa lỗi ngữ pháp/từ vựng nếu có, nếu câu đã tốt thì khen ngắn gọn>',
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
        bubble('sys', '⚠️ AI từ chối trả lời lượt này. Thử đổi cách diễn đạt.');
        history.pop();
        return;
      }

      const raw = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      history.push({ role: 'assistant', content: raw });

      const en = (raw.match(/^EN:\s*(.+)$/mi)?.[1] || raw.split('\n')[0] || '').trim();
      const tip = (raw.match(/^TIP:\s*(.+)$/mi)?.[1] || '').trim();

      thinking.remove();
      lastSpoken = en;
      bubble('ai', `${esc(en)}${tip ? `<span class="fb">📝 ${esc(tip)}</span>` : ''}`);
      await speak(en);
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

  function submitUserText(text) {
    if (!text) return;
    if (mode === 'script') {
      if (!awaiting) return;
      awaiting = false;
      judgeScript(text);
    } else {
      bubble('me', esc(text));
      liveReply(text);
    }
  }

  async function listen() {
    if (isRecording()) { stopCapture(); return; }
    stopSpeaking();
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
      bubble('sys', '💡 Chế độ tự do không có câu mẫu — cứ nói theo ý bạn, AI sẽ sửa ở phần 📝.');
      return;
    }
    if (!awaiting) return;
    const t = turns[idx];
    bubble('sys', `💡 Gợi ý: <b>${esc(t.en)}</b>${t.vi ? ` — ${esc(t.vi)}` : ''}${t.hint ? `<br>${esc(t.hint)}` : ''}`);
    speak(t.en, { rate: 0.7 });
  }

  function replay() { if (lastSpoken) speak(lastSpoken); }

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
    mode = nextMode || mode;
    idx = 0;
    scores = [];
    history = [];
    awaiting = false;
    els.chatLog.innerHTML = '';
    els.roleInfo.innerHTML = `Bạn đóng vai <b>${esc(roles[userRole])}</b> · AI đóng vai <b>${esc(roles[partnerRole])}</b>` +
      (asrSupported ? '' : ' · <span class="w-bad">micro không khả dụng, hãy gõ ở ô bên dưới</span>');
    els.micBtn.disabled = !asrSupported;

    if (mode === 'script') {
      bubble('sys', `Chế độ kịch bản — ${turns.length} lượt. Nói theo câu mẫu, hệ thống chấm độ khớp.`);
      advanceScript();
    } else {
      bubble('sys', 'Chế độ tự do — AI trả lời trực tiếp và sửa lỗi cho bạn sau mỗi câu.');
      partnerSays(lesson.roleplay.opener, '');
      status('Tới lượt bạn — bấm 🎤 và trả lời tự nhiên.');
    }
  }

  function destroy() { stopSpeaking(); stopCapture(); }

  return { start, listen, hint, replay, skip, submitUserText, destroy, get mode() { return mode; } };
}
