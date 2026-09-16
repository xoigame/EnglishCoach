#!/usr/bin/env node
// Rebuild data/index.json from every file in data/lessons/.
//   node tools/build-index.mjs

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVEL_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

export async function buildIndex(root) {
  const dir = path.join(root, 'data', 'lessons');
  await mkdir(dir, { recursive: true });

  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  const lessons = [];

  for (const file of files) {
    try {
      const l = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      lessons.push({
        id: l.id || path.basename(file, '.json'),
        title: l.title || file,
        topic: l.topic || '',
        level: l.level || 'A2',
        summary: l.summary || '',
        turns: l.dialogue?.turns?.length || 0,
      });
    } catch (err) {
      console.warn(`⚠️  Bỏ qua ${file}: ${err.message}`);
    }
  }

  lessons.sort((a, b) =>
    (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) || a.title.localeCompare(b.title, 'vi'));

  await writeFile(
    path.join(root, 'data', 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), lessons }, null, 2) + '\n',
    'utf8');

  return lessons.length;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-index.mjs')) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const n = await buildIndex(root);
  console.log(`📇 data/index.json: ${n} bài học`);
}
