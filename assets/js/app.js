// Router + wiring for every view.

import { settings, saveSettings, loadVoices, getVoices, speak, stopSpeaking } from './speech.js';
import { asrSupported } from './mic.js';
import * as store from './store.js';
import { renderPrep, renderDrill, renderListen, esc } from './lesson.js';
import { createRoleplay } from './roleplay.js';
import { renderMindmap } from './mindmap.js';
import { renderPacks } from './packs.js';
import { renderExercises } from './exercises.js';
import { renderPhrasebook, renderLessonPhrases } from './phrasebook.js';
import { renderWordRelations, renderLessonWordRelations } from './word-relations.js';
import { buildPrompt, buildCommand, slugify } from './prompt.js';
import { initPlayerBar } from './player-bar.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let library = [];
let filter = { text: '', level: 'all' };
let current = null;   // { lesson, roleplay }

/* ------------------------------------------------------------- routing */

function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('#mainNav .tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  if (name !== 'lesson') {
    current?.roleplay.destroy();
    current = null;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [what, arg] = hash.split('/');
  if (what === 'lesson' && arg) return openLesson(decodeURIComponent(arg));
  const view = ['library', 'generator', 'settings', 'phrasebook', 'words'].includes(what) ? what : 'library';
  showView(view);
  if (view === 'phrasebook' && !$('#view-phrasebook').children.length) {
    renderPhrasebook($('#view-phrasebook'));
  }
  if (view === 'words' && !$('#view-words').children.length) {
    renderWordRelations($('#view-words'));
  }
}

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------- library */

function renderLibrary() {
  const grid = $('#lessonGrid');
  const q = filter.text.trim().toLowerCase();
  const items = library.filter(l =>
    (filter.level === 'all' || l.level === filter.level) &&
    (!q || `${l.title} ${l.topic} ${l.summary || ''}`.toLowerCase().includes(q)));

  grid.innerHTML = items.map(l => {
    const p = store.getProgress(l.id);
    const best = p ? Math.max(p.drillAvg || 0, p.talkAvg || 0) : 0;
    return `<button class="lesson-card" data-id="${esc(l.id)}">
      <b>${esc(l.title)}</b>
      <span class="muted">${esc(l.summary || l.topic || '')}</span>
      <span class="meta">
        <span class="badge">${esc(l.level)}</span>
        ${l.draft ? '<span class="badge draft">Nháp</span>' : ''}
        ${best ? `<span class="badge done">${best}%</span>` : ''}
        ${l.turns ? `<span class="muted" style="font-size:12px">${l.turns} lượt</span>` : ''}
      </span>
    </button>`;
  }).join('');

  $('#libraryEmpty').classList.toggle('hidden', items.length > 0);
  grid.querySelectorAll('.lesson-card').forEach(c =>
    c.addEventListener('click', () => { location.hash = `#/lesson/${encodeURIComponent(c.dataset.id)}`; }));
}

async function refreshLibrary() {
  library = await store.loadLibrary();
  renderLibrary();
}

/* -------------------------------------------------------------- lesson */

async function openLesson(id) {
  showView('lesson');
  $('#lsTitle').textContent = 'Đang tải…';
  ['prep', 'drill', 'listen', 'packs', 'quiz', 'map'].forEach(p => { $(`#pane-${p}`).innerHTML = ''; });
  $('#chatLog').innerHTML = '';

  let lesson;
  try {
    lesson = await store.getLesson(id);
  } catch (err) {
    $('#lsTitle').textContent = 'Không mở được bài học';
    $('#lsSummary').textContent = err.message;
    return;
  }

  $('#lsLevel').textContent = lesson.level;
  $('#lsTitle').textContent = lesson.title;
  $('#lsSummary').textContent = lesson.summary;
  setScore(Math.max(store.getProgress(id)?.drillAvg || 0, store.getProgress(id)?.talkAvg || 0));

  renderPrep($('#pane-prep'), lesson);
  renderLessonWordRelations($('#pane-prep'), lesson);
  renderLessonPhrases($('#pane-prep'), lesson);
  renderDrill($('#pane-drill'), lesson, setScore);
  renderListen($('#pane-listen'), lesson);
  renderMindmap($('#pane-map'), lesson);
  // 10 hội thoại và 100 bài tập chỉ dựng khi mở tab: cả hai đều nặng, và trên
  // điện thoại thì dựng sẵn cả sáu pane là thừa.

  const roleplay = createRoleplay({
    lesson,
    onScore: setScore,
    els: {
      chatLog: $('#chatLog'), interim: $('#interim'), micBtn: $('#micBtn'), roleInfo: $('#roleInfo'),
    },
  });
  current = { lesson, roleplay };

  switchPane('prep');
  $$('input[name=talkMode]').forEach(r => { r.checked = r.value === 'script'; });
}

function setScore(value) {
  const ring = $('#lsScoreRing');
  $('#lsScore').textContent = value ? `${value}%` : '—';
  ring.style.setProperty('--p', value || 0);
}

function switchPane(name) {
  $$('#lessonTabs .subtab').forEach(t => t.classList.toggle('active', t.dataset.pane === name));
  $$('#view-lesson .pane').forEach(p => p.classList.toggle('active', p.id === `pane-${name}`));
  stopSpeaking();
  if (!current) return;

  if (name === 'talk' && !$('#chatLog').children.length) {
    current.roleplay.start($('input[name=talkMode]:checked').value);
  }
  if (name === 'packs' && !$('#pane-packs').children.length) {
    renderPacks($('#pane-packs'), current.lesson);
  }
  if (name === 'quiz' && !$('#pane-quiz').children.length) {
    renderExercises($('#pane-quiz'), current.lesson, setScore);
  }
}

/* ----------------------------------------------------------- generator */

function wireGenerator() {
  const form = $('#genForm');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.topic.trim()) return;
    $('#cliOut').textContent = buildCommand(data);
    $('#promptOut').textContent = buildPrompt({ ...data, id: slugify(data.topic) });
  });

  $$('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = '✅ Đã copy';
      setTimeout(() => { btn.textContent = old; }, 1400);
    } catch {
      alert('Trình duyệt chặn clipboard — hãy bôi đen và copy thủ công.');
    }
  }));

  $('#roadmapBtn').addEventListener('click', async () => {
    const box = $('#roadmap');
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '<p class="muted">Đang tải lộ trình…</p>';
    try {
      const res = await fetch('data/curriculum.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const plan = await res.json();
      const have = new Set(library.map(l => l.id));
      box.innerHTML = plan.units.map(unit => `
        <h4>${esc(unit.level)} · ${esc(unit.name)}</h4>
        <ul class="roadmap-list">${unit.topics.map(t => have.has(t.id)
          ? `<li>✅ <a href="#/lesson/${encodeURIComponent(t.id)}">${esc(t.topic)}</a></li>`
          : `<li class="todo">⬜ ${esc(t.topic)} <code>--only ${esc(t.id)}</code></li>`).join('')}</ul>`).join('');
    } catch (err) {
      box.innerHTML = `<p class="msg bad">Không đọc được data/curriculum.json: ${esc(err.message)}</p>`;
    }
  });

  $('#importBtn').addEventListener('click', async () => {
    const msg = $('#importMsg');
    const raw = $('#pasteJson').value.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    if (!raw) { msg.className = 'msg bad'; msg.textContent = 'Chưa dán gì cả.'; return; }
    try {
      const lesson = store.normalizeLesson(JSON.parse(raw));
      if (!store.saveDraft(lesson)) throw new Error('Không ghi được localStorage (trình duyệt đang ở chế độ riêng tư?).');
      store.dropFromCache(lesson.id);
      await refreshLibrary();
      msg.className = 'msg ok';
      msg.innerHTML = `✅ Đã nạp “${esc(lesson.title)}”. <a href="#/lesson/${encodeURIComponent(lesson.id)}">Mở bài học →</a>`;
      $('#pasteJson').value = '';
    } catch (err) {
      msg.className = 'msg bad';
      msg.textContent = `❌ ${err instanceof SyntaxError ? 'JSON sai cú pháp: ' + err.message : err.message}`;
    }
  });

  $('#exportDraftsBtn').addEventListener('click', () => {
    const drafts = Object.values(store.listDrafts());
    if (!drafts.length) { $('#importMsg').textContent = 'Chưa có bản nháp nào.'; return; }
    drafts.forEach(d => {
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${d.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  $('#clearDraftsBtn').addEventListener('click', async () => {
    if (!confirm('Xoá toàn bộ giáo án nháp trong trình duyệt? Bài đã push lên repo không bị ảnh hưởng.')) return;
    store.clearDrafts();
    await refreshLibrary();
    $('#importMsg').className = 'msg ok';
    $('#importMsg').textContent = 'Đã xoá bản nháp.';
  });
}

/* ------------------------------------------------------------ settings */

async function wireSettings() {
  const sel = $('#voiceSelect');
  await loadVoices();
  const voices = getVoices();
  sel.innerHTML = voices.length
    ? voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} — ${esc(v.lang)}</option>`).join('')
    : '<option value="">(trình duyệt chưa có giọng tiếng Anh)</option>';
  if (settings.voiceURI) sel.value = settings.voiceURI;

  sel.addEventListener('change', () => { settings.voiceURI = sel.value; saveSettings(); });

  const rate = $('#rateRange');
  rate.value = settings.rate;
  $('#rateVal').textContent = `${Number(settings.rate).toFixed(2)}×`;
  rate.addEventListener('input', () => {
    settings.rate = Number(rate.value);
    $('#rateVal').textContent = `${settings.rate.toFixed(2)}×`;
    saveSettings();
  });

  $('#testVoice').addEventListener('click', () =>
    speak('Hello! Let us practise English together. How was your day?'));

  const pass = $('#passRange');
  pass.value = settings.passScore;
  $('#passVal').textContent = `${settings.passScore}%`;
  pass.addEventListener('input', () => {
    settings.passScore = Number(pass.value);
    $('#passVal').textContent = `${settings.passScore}%`;
    saveSettings();
  });

  const tries = $('#maxTries');
  tries.value = String(settings.maxTries);
  tries.addEventListener('change', () => { settings.maxTries = Number(tries.value); saveSettings(); });

  const aloud = $('#coachAloud');
  aloud.checked = settings.coachAloud;
  aloud.addEventListener('change', () => { settings.coachAloud = aloud.checked; saveSettings(); });

  const auto = $('#autoListen');
  auto.checked = settings.autoListen;
  auto.addEventListener('change', () => { settings.autoListen = auto.checked; saveSettings(); });

  const lang = $('#asrLang');
  lang.value = settings.asrLang;
  lang.addEventListener('change', () => { settings.asrLang = lang.value; saveSettings(); });

  $('#micSupport').className = asrSupported ? 'msg ok' : 'msg bad';
  $('#micSupport').textContent = asrSupported
    ? '✅ Trình duyệt này hỗ trợ nhận diện giọng nói.'
    : '❌ Trình duyệt này không hỗ trợ nhận diện giọng nói — hãy dùng Chrome hoặc Edge.';

  const keyInput = $('#apiKey');
  keyInput.value = store.getApiKey();
  $('#saveKey').addEventListener('click', () => {
    store.setApiKey(keyInput.value.trim());
    $('#keyMsg').className = 'msg ok';
    $('#keyMsg').textContent = keyInput.value.trim() ? '✅ Đã lưu key trong trình duyệt này.' : 'Đã xoá key.';
  });
  $('#clearKey').addEventListener('click', () => {
    store.setApiKey('');
    keyInput.value = '';
    $('#keyMsg').className = 'msg ok';
    $('#keyMsg').textContent = 'Đã xoá key.';
  });
}

/* ---------------------------------------------------------------- wire */

function wireShell() {
  $$('#mainNav .tab').forEach(t =>
    t.addEventListener('click', () => { location.hash = `#/${t.dataset.view}`; }));
  $$('[data-goto]').forEach(b =>
    b.addEventListener('click', () => { location.hash = `#/${b.dataset.goto}`; }));
  $('#backToLibrary').addEventListener('click', () => { location.hash = '#/library'; });

  $('#searchBox').addEventListener('input', e => { filter.text = e.target.value; renderLibrary(); });
  $$('#levelChips .chip').forEach(c => c.addEventListener('click', () => {
    $$('#levelChips .chip').forEach(x => x.classList.toggle('active', x === c));
    filter.level = c.dataset.level;
    renderLibrary();
  }));

  $$('#lessonTabs .subtab').forEach(t =>
    t.addEventListener('click', () => switchPane(t.dataset.pane)));

  $$('input[name=talkMode]').forEach(r => r.addEventListener('change', () => {
    if (r.checked) current?.roleplay.start(r.value);
  }));

  $('#micBtn').addEventListener('click', () => current?.roleplay.listen());
  $('#hintBtn').addEventListener('click', () => current?.roleplay.hint());
  $('#replayBtn').addEventListener('click', () => current?.roleplay.replay());
  $('#skipBtn').addEventListener('click', () => current?.roleplay.skip());
  $('#restartBtn').addEventListener('click', () =>
    current?.roleplay.start($('input[name=talkMode]:checked').value));

  $('#typeFallback').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const text = e.target.value.trim();
    if (!text) return;
    e.target.value = '';
    current?.roleplay.submitUserText(text);
  });

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.target.matches('input, textarea, select, button')) return;
    if (!$('#pane-talk').classList.contains('active')) return;
    e.preventDefault();
    current?.roleplay.listen();
  });
}

(async function init() {
  wireShell();
  wireGenerator();
  initPlayerBar();
  await wireSettings();
  await refreshLibrary();
  route();
})();
