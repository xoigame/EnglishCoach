// Lesson loading (published JSON + local drafts) and progress tracking.

const DRAFTS_KEY = 'ec.drafts';
const PROGRESS_KEY = 'ec.progress';
const KEY_KEY = 'ec.apiKey';

const cache = new Map();

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/* ----------------------------------------------------------------- Drafts */

export function listDrafts() { return read(DRAFTS_KEY, {}); }

export function saveDraft(lesson) {
  const drafts = listDrafts();
  drafts[lesson.id] = lesson;
  return write(DRAFTS_KEY, drafts);
}

export function clearDrafts() {
  try { localStorage.removeItem(DRAFTS_KEY); } catch { /* ignore */ }
}

/* --------------------------------------------------------------- Progress */

export function getProgress(id) { return read(PROGRESS_KEY, {})[id] || null; }

export function setProgress(id, patch) {
  const all = read(PROGRESS_KEY, {});
  all[id] = { ...(all[id] || {}), ...patch, at: Date.now() };
  write(PROGRESS_KEY, all);
}

/* ------------------------------------------------------------------ Key */

export function getApiKey() { try { return localStorage.getItem(KEY_KEY) || ''; } catch { return ''; } }
export function setApiKey(v) { try { v ? localStorage.setItem(KEY_KEY, v) : localStorage.removeItem(KEY_KEY); } catch { /* ignore */ } }

/* -------------------------------------------------------------- Library */

/** Published lessons from data/index.json, merged with local drafts. */
export async function loadLibrary() {
  let published = [];
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      published = (json.lessons || []).map(l => ({ ...l, draft: false }));
    }
  } catch {
    // offline, or opened over file:// — drafts still work
  }
  const drafts = Object.values(listDrafts()).map(l => ({
    id: l.id, title: l.title, topic: l.topic, level: l.level,
    summary: l.summary, turns: l.dialogue?.turns?.length || 0, draft: true,
  }));
  const seen = new Set(drafts.map(d => d.id));
  return [...drafts, ...published.filter(p => !seen.has(p.id))];
}

export async function getLesson(id) {
  if (cache.has(id)) return cache.get(id);
  const draft = listDrafts()[id];
  if (draft) { cache.set(id, draft); return draft; }
  const res = await fetch(`data/lessons/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Không tải được giáo án "${id}" (HTTP ${res.status})`);
  const lesson = normalizeLesson(await res.json());
  cache.set(id, lesson);
  return lesson;
}

export function dropFromCache(id) { cache.delete(id); }

/* ------------------------------------------------------------ Validation */

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Throws a human-readable error when a pasted/generated lesson is malformed. */
export function normalizeLesson(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('JSON không phải là một object.');
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };

  need(typeof raw.id === 'string' && /^[a-z0-9-]+$/.test(raw.id),
    'Thiếu "id" hoặc id không hợp lệ (chỉ chữ thường, số và dấu gạch ngang).');
  need(typeof raw.title === 'string' && raw.title.trim(), 'Thiếu "title".');
  need(LEVELS.includes(raw.level), `"level" phải là một trong ${LEVELS.join(', ')}.`);
  need(raw.dialogue && Array.isArray(raw.dialogue.turns) && raw.dialogue.turns.length >= 4,
    '"dialogue.turns" phải có ít nhất 4 lượt.');

  const roles = raw.dialogue.roles || {};
  const userRole = raw.dialogue.userRole === 'a' ? 'a' : 'b';
  const turns = raw.dialogue.turns.map((t, i) => {
    need(typeof t.en === 'string' && t.en.trim(), `Lượt thứ ${i + 1} thiếu "en".`);
    return {
      speaker: t.speaker === 'a' ? 'a' : 'b',
      en: t.en.trim(),
      vi: (t.vi || '').trim(),
      hint: (t.hint || '').trim(),
    };
  });

  return {
    id: raw.id,
    title: raw.title.trim(),
    topic: (raw.topic || raw.title).trim(),
    level: raw.level,
    summary: (raw.summary || '').trim(),
    goals: arr(raw.goals),
    vocab: arr(raw.vocab).map(v => ({
      en: v.en || v.term || '', ipa: v.ipa || '', vi: v.vi || '', example: v.example || '',
    })).filter(v => v.en),
    patterns: arr(raw.patterns).map(p => ({ en: p.en || '', vi: p.vi || '', note: p.note || '' })).filter(p => p.en),
    pronunciation: arr(raw.pronunciation).map(p => ({
      focus: p.focus || '', tip: p.tip || '', words: arr(p.words),
    })).filter(p => p.focus || p.tip),
    dialogue: { roles: { a: roles.a || 'Partner', b: roles.b || 'You' }, userRole, turns },
    roleplay: {
      persona: raw.roleplay?.persona || `You are ${roles[userRole === 'a' ? 'b' : 'a'] || 'a friendly English partner'}.`,
      opener: raw.roleplay?.opener || turns.find(t => t.speaker !== userRole)?.en || 'Hello!',
      goal: raw.roleplay?.goal || '',
    },
    drills: arr(raw.drills).map(d => ({
      vi: d.vi || d.prompt_vi || '', en: d.en || d.answer_en || '', alts: arr(d.alts),
    })).filter(d => d.en),
    homework: arr(raw.homework),
  };
}

function arr(v) { return Array.isArray(v) ? v : []; }
