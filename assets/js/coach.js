// Turns a wrong answer into something the learner can hear and fix.

import { scoreSpeech, tokenize } from './speech.js';

/**
 * Find the lesson's known Vietnamese-learner mistake that best matches what was said.
 * @returns {{wrong:string, right:string, vi:string}|null}
 */
export function matchKnownMistake(spoken, mistakes = []) {
  let best = null;
  for (const m of mistakes) {
    const said = scoreSpeech(m.wrong, spoken).score;
    if (said >= 60 && (!best || said > best.score)) best = { ...m, score: said };
  }
  return best;
}

/**
 * Build the coaching reply for one attempt.
 *
 * @param {{expected:string, spoken:string, score:number, words:Array, attempt:number,
 *          lastChance:boolean, mistakes?:Array}} ctx
 * @returns {{say:string[], vi:string, showModel:boolean}}
 *   say — các câu sẽ được đọc lên, theo thứ tự ({text, rate})
 */
export function buildCorrection(ctx) {
  const { expected, spoken, score, words, lastChance, mistakes = [] } = ctx;
  const known = matchKnownMistake(spoken, mistakes);
  const wrongWords = words.filter(w => !w.ok).map(w => w.w);

  // Lỗi đã được ghi sẵn trong giáo án — sửa đúng trọng tâm nhất.
  if (known) {
    return {
      say: [
        { text: `Almost. Instead of "${known.wrong}", say: ${known.right}`, rate: 0.85 },
        { text: known.right, rate: 0.7 },
        { text: lastChance ? 'Let us move on.' : 'Now you try.', rate: 0.9 },
      ],
      vi: `📝 ${known.vi}`,
      showModel: true,
    };
  }

  // Nói gần đúng, chỉ trượt vài từ.
  if (score >= 55) {
    const focus = wrongWords.slice(0, 3).join(', ');
    return {
      say: [
        { text: focus ? `Close. Watch these words: ${focus}.` : 'Close. One more time, a bit clearer.', rate: 0.85 },
        { text: expected, rate: 0.68 },
        { text: lastChance ? 'Good effort. Let us continue.' : 'Try again.', rate: 0.9 },
      ],
      vi: focus
        ? '📝 Gần đúng rồi. Nói chậm lại và bật rõ âm cuối ở những từ bên dưới.'
        : '📝 Nói to và rõ hơn một chút nhé.',
      showModel: true,
    };
  }

  // Lệch nhiều: nghe lại mẫu, chia đôi câu cho dễ nhắc lại.
  return {
    say: [
      { text: 'Not quite. Listen carefully.', rate: 0.9 },
      { text: expected, rate: 0.62 },
      ...(halves(expected)?.map(h => ({ text: h, rate: 0.62 })) || []),
      { text: lastChance ? 'We will come back to this one later.' : 'Your turn.', rate: 0.9 },
    ],
    vi: '📝 Lệch khá nhiều. Nghe mẫu rồi nhắc lại từng nửa câu một.',
    showModel: true,
  };
}

/** Split a long sentence in two so it is easier to shadow. */
function halves(sentence) {
  const words = sentence.split(/\s+/);
  if (words.length < 8) return null;
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/** Short spoken praise, varied so it does not feel robotic. */
export function praise(score) {
  const strong = ['Perfect.', 'That is exactly right.', 'Very natural.'];
  const good = ['Good.', 'Nice one.', 'That works.'];
  const pool = score >= 95 ? strong : good;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Words the learner has struggled with across a session, most frequent first. */
export function weakWords(history, limit = 6) {
  const counts = new Map();
  for (const words of history) {
    for (const w of words) {
      if (w.ok) continue;
      counts.set(w.w, (counts.get(w.w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, n]) => ({ word, n }));
}

/** True when the learner clearly answered something else entirely. */
export function isOffTopic(expected, spoken) {
  const a = new Set(tokenize(expected));
  const b = tokenize(spoken);
  if (!b.length) return false;
  const overlap = b.filter(w => a.has(w)).length / b.length;
  return overlap < 0.2;
}
