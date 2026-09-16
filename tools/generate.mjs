// generateLesson(): prompt -> AI CLI -> JSON -> data/lessons/<id>.json

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPrompt, slugify } from '../assets/js/prompt.js';
// normalizeLesson is pure (no browser globals at import time) so Node can reuse it.
import { normalizeLesson } from '../assets/js/store.js';
import { runAi, AiCliError } from './ai-cli.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LESSON_DIR = path.join(ROOT, 'data', 'lessons');

export function lessonPath(id) { return path.join(LESSON_DIR, `${id}.json`); }
export function lessonExists(id) { return existsSync(lessonPath(id)); }

/**
 * @param {{topic:string, level?:string, partner?:string, turns?:number, notes?:string,
 *          id?:string, force?:boolean, raw?:string, onLog?:(l:string)=>void}} opts
 * @returns {Promise<{lesson:object, file:string}>}
 */
export async function generateLesson(opts) {
  const level = String(opts.level || 'A2').toUpperCase();
  if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(level)) {
    throw new Error(`level phải là A1..C1 (nhận được "${opts.level}").`);
  }
  const id = opts.id || slugify(opts.topic);
  const file = lessonPath(id);

  if (existsSync(file) && !opts.force && opts.raw === undefined) {
    throw new Error(`đã có ${path.relative(ROOT, file)} — dùng --force để ghi đè.`);
  }

  const raw = opts.raw ?? await runAi(buildPrompt({ ...opts, level, id }), {
    onLog: opts.onLog,
    logFile: path.join(ROOT, 'logs', `gen-${id}.log`),
  });

  let lesson;
  try {
    lesson = normalizeLesson(JSON.parse(extractJson(raw)));
  } catch (err) {
    const dump = path.join(ROOT, 'data', `.last-raw-${id}.txt`);
    await writeFile(dump, raw, 'utf8').catch(() => {});
    const wrapped = new AiCliError(
      `${err.message} (nguyên văn output lưu ở ${path.relative(ROOT, dump)})`);
    wrapped.kind = err instanceof AiCliError ? err.kind : null;
    throw wrapped;
  }

  lesson.id = id;   // keep filename and id in sync
  lesson.level = level;
  await mkdir(LESSON_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(lesson, null, 2) + '\n', 'utf8');
  return { lesson, file };
}

/** Pull the lesson object out of a reply that may carry fences or chatter. */
export function extractJson(text) {
  const candidates = [];
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/g) || [];
  for (const block of fenced) candidates.push(block.replace(/```(?:json)?/g, '').trim());
  candidates.push(String(text));

  for (const body of candidates) {
    for (const slice of balancedObjects(body)) {
      try {
        const parsed = JSON.parse(slice);
        if (parsed && typeof parsed === 'object' && parsed.dialogue) return slice;
      } catch { /* thử ứng viên tiếp theo */ }
    }
  }
  throw new Error('không tìm thấy object JSON giáo án nào trong output');
}

/** Every balanced {...} span in `text`, longest first. */
function balancedObjects(text) {
  const spans = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inStr = false, escaped = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { spans.push(text.slice(i, j + 1)); break; }
    }
  }
  return spans.sort((a, b) => b.length - a.length);
}
