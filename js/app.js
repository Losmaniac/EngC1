import { h, mount, toast, confetti, fmtPct } from './ui.js';
import * as store from './store.js';
import { cards, log, kv } from './store.js';
import { isDue, shuffle, levelFromXp, liveStreak, estimateScale, dayKey, weekKey } from './core.js';
import { MODULES, MOD, PARTS, STRUCTURES } from './modules.js';
import { render } from './exercise.js';
import { items, loadContent, srsItems, dueItems, addXp, recordAnswer, xpFor, onLeave, leave, renderHeader, addItem } from './actions.js';
import { LABS, readingPage, writingPage, speakingPage, pairUp, mastery } from './labs.js';

const view = document.getElementById('view');
const DAY = 864e5;
const size = () => kv.settings?.size || 20;

// Free native-level input from the brief, linked out (never copied).
export const INPUT = [
  { name: 'BBC Learning English · 6 Minute English', url: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english', todo: 'Listen to one episode at full speed, then catch 2 chunks.' },
  { name: 'British Council · C1 listening', url: 'https://learnenglish.britishcouncil.org/free-resources/listening/c1', todo: 'Do one interview, lecture or meeting task.' },
  { name: 'British Council · C1 reading', url: 'https://learnenglish.britishcouncil.org/free-resources/reading/c1', todo: 'Read one long text and note 3 collocations.' },
  { name: 'Linguapress Advanced', url: 'https://linguapress.com/advanced', todo: 'Read one article and do its word-formation task.' },
  { name: 'RoPeCast (Saarland University)', url: 'http://ropecast.uni-saarland.de/', todo: 'Listen to one episode without the transcript.' },
  { name: 'LingoRank · TED talks rated C1', url: 'https://lingorank.com/', todo: 'Watch one C1-rated talk without subtitles.' },
  { name: 'LibriVox public-domain audiobooks', url: 'https://librivox.org/', todo: '20 minutes of extensive listening along with the text.' },
];

// ---------- choosing what to practise ----------
function interleave(list) {
  const groups = new Map();
  for (const it of list) { if (!groups.has(it.module)) groups.set(it.module, []); groups.get(it.module).push(it); }
  const out = [], gs = [...groups.values()];
  while (out.length < list.length) for (const g of gs) if (g.length) out.push(g.shift());
  return out;
}

// Due cards first (most overdue first), then new items, then the weakest known items as extra practice.
function pickItems(pool, n) {
  const due = dueItems(pool).sort((a, b) => cards.get(a.id).due - cards.get(b.id).due);
  const fresh = shuffle(pool.filter(i => !cards.has(i.id)));
  const weak = pool.filter(i => cards.has(i.id) && !isDue(cards.get(i.id))).sort((a, b) => cards.get(a.id).s - cards.get(b.id).s);
  const take = interleave(due).slice(0, n);
  take.push(...interleave(fresh).slice(0, n - take.length));
  take.push(...weak.slice(0, n - take.length));
  return interleave(take);
}

// ---------- session runner (daily, module practice, drills, boss) ----------
function runQueue(list, { exam = null, again = null } = {}) {
  if (!list.length) return mount(view, h('div.empty', {}, h('p', 'Nothing to practise here yet.'), h('a.btn', { href: '#/' }, 'Home')));
  const queue = [...list], results = [];
  let i = 0, xp = 0, timer = null, over = false;
  const fill = h('i'), count = h('span.count'), clock = h('span.clock'), stage = h('div.stage');
  mount(view, h('div.session', {}, h('div.session-top', {}, h('a.icon', { href: '#/', 'aria-label': 'Quit session' }, '✕'), h('div.progress', {}, fill), exam ? clock : count), stage));
  onLeave(() => { over = true; clearInterval(timer); globalThis.speechSynthesis?.cancel(); });

  if (exam) {
    const end = Date.now() + exam.min * 60e3;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      clock.textContent = `⏱ ${Math.floor(left / 60e3)}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')}`;
      clock.classList.toggle('low', left < 60e3);
      if (!left) {
        while (results.length < list.length) results.push({ item: list[results.length], res: { ok: false, sc: 0, grade: 1, answer: '(time up)' } });
        finishSession();
      }
    };
    tick(); timer = setInterval(tick, 1000);
  }
  next();

  function next() {
    if (over) return;
    if (i >= queue.length) return finishSession();
    fill.style.width = `${(i / queue.length) * 100}%`;
    count.textContent = `${i + 1} / ${queue.length}`;
    const item = queue[i], retry = i >= list.length;
    mount(stage, render(item, { exam: !!exam, onResult: (res, anchor) => answered(item, res, anchor, retry), onDone: () => { i++; next(); } }));
    stage.scrollIntoView({ block: 'nearest' });
  }

  function answered(item, res, anchor, retry) {
    if (exam) return results.push({ item, res });
    // A wrong answer comes back once at the end of the session; the retry only earns a little XP.
    if (!retry) { results.push({ item, res }); recordAnswer(item, res); if (!res.ok) queue.push(item); }
    const gain = retry ? (res.ok ? 3 : 0) : xpFor(res);
    xp += gain;
    addXp(gain, anchor);
  }

  async function finishSession() {
    if (over) return;
    over = true; clearInterval(timer); leave();
    fill.style.width = '100%';
    const main = results.slice(0, list.length);
    const acc = main.reduce((s, r) => s + r.res.sc, 0) / main.length;
    let headline = fmtPct(acc), sub = `accuracy · +${xp} XP · ${liveStreak(kv.streak || {})}-day streak`;
    if (exam) {
      for (const r of main) await recordAnswer(r.item, r.res);
      const w = exam.part === 'UoE4' ? 2 : 1, score = Math.round(main.reduce((s, r) => s + r.res.sc * w, 0)), max = main.length * w;
      const first = !(kv.boss || []).some(b => b.week === weekKey());
      await store.set('boss', [...(kv.boss || []), { week: weekKey(), part: exam.part, score, max, at: Date.now() }]);
      const gain = first ? score * 15 + (score / max >= 0.75 ? 50 : 0) : 0;
      await addXp(gain);
      headline = `${score} / ${max}`;
      sub = `${PARTS[exam.part]} · ${first ? `+${gain} XP` : 'replay, no XP this time'}`;
    }
    const review = (exam ? main : main.filter(r => !r.res.ok));
    mount(view, h('section.summary', {},
      h('div.big-emoji', acc >= 0.8 ? '🏆' : acc >= 0.6 ? '🎉' : '💪'),
      h('h1', headline), h('p.muted', sub),
      review.length > 0 && h('div.review', {}, h('h2', exam ? 'Your answers' : 'Worth another look'), review.map(({ item, res }) =>
        h('div.rev', { class: res.ok ? 'ok' : 'bad' }, h('p', summaryOf(item)), h('p.small', h('span.muted', 'You: '), res.answer ?? '—', h('span.muted', ' · Answer: '), h('strong', solutionOf(item))), item.explanation && h('p.small.muted', item.explanation)))),
      h('div.actions', {}, h('a.btn.primary', { href: '#/' }, 'Home'), again && h('button.btn', { onclick: again }, 'Another round'))));
    if (acc >= 0.6) confetti();
  }
}

const summaryOf = it => (it.prompt || it.text?.replace(/\{[^}]+\}/g, '___') || it.first || it.source || it.speak || '').slice(0, 160);
const solutionOf = it => it.kind === 'gap' ? [...it.text.matchAll(/\{([^}|]+)/g)].map(m => m[1]).join(' / ')
  : it.kind === 'order' ? it.tiles.join(' ') : it.kind === 'flash' ? it.back : it.kind === 'rewrite' ? it.model : it.kind === 'dictation' ? it.text : it.answer;

// ---------- screens ----------
const BOSS = { UoE1: { n: 8, min: 10 }, UoE2: { n: 8, min: 10 }, UoE3: { n: 8, min: 10 }, UoE4: { n: 6, min: 12 } };
const bossPart = () => Object.keys(BOSS)[Number(weekKey().slice(-2)) % 4];

function topErrors(days = 7) {
  const since = Date.now() - days * DAY, count = new Map();
  for (const e of log) if (!e.ok && e.t >= since) for (const t of e.tags) count.set(t, (count.get(t) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 5);
}
const tagLabel = t => STRUCTURES[t] || t.replace(/-/g, ' ');

function home() {
  const pool = srsItems(), n = size();
  const due = Math.min(dueItems(pool).length, n), fresh = Math.min(pool.filter(i => !cards.has(i.id)).length, n - due);
  const streak = liveStreak(kv.streak || {}), doneToday = log.some(e => dayKey(e.t) === dayKey());
  const part = bossPart(), beaten = (kv.boss || []).find(b => b.week === weekKey());
  const [weak] = topErrors(), input = INPUT[Math.floor(Date.now() / DAY) % INPUT.length];
  mount(view,
    h('section.hero', {}, h('p.eyebrow', new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', doneToday ? 'Nice work today 👏' : streak ? `Keep your ${streak}-day streak alive` : 'From C1 to C2, one rep at a time')),
    h('a.cta', { href: '#/session' }, h('span.cta-icon', '🔥'), h('span', {}, h('strong', doneToday ? 'Another daily session' : 'Start daily session'),
      h('small', `${due} due · ${fresh} new · about ${Math.max(1, Math.round((due + fresh) * 0.6))} min`))),
    h('div.cards', {},
      h('a.card', { href: '#/boss' }, h('span.big-emoji', '🐉'), h('div', {}, h('strong', 'Weekly boss battle'),
        h('small', `${PARTS[part]} · ${BOSS[part].n} questions · ${BOSS[part].min} min`), beaten && h('small.done', `✔ Beaten this week: ${beaten.score}/${beaten.max}`))),
      weak && h('a.card', { href: `#/drill/${encodeURIComponent(weak[0])}` }, h('span.big-emoji', '🩹'), h('div', {}, h('strong', `Weak spot: ${tagLabel(weak[0])}`), h('small', `${weak[1]} misses this week · drill 10`))),
      h('a.card', { href: input.url, target: '_blank', rel: 'noopener' }, h('span.big-emoji', '📻'), h('div', {}, h('strong', `Today's input: ${input.name}`), h('small', `${input.todo} ↗`)))),
    h('h2', 'Modules'), moduleGrid());
}

function moduleGrid() {
  return h('div.grid', {}, MODULES.map(m => {
    const pool = srsItems(m.id), learned = pool.filter(i => cards.has(i.id)).length;
    return h('a.mod', { href: `#/m/${m.id}` }, h('span.mod-icon', m.icon), h('strong', m.name), h('small', m.trains),
      pool.length > 0 && h('span.meter', { title: `${learned} of ${pool.length} learned` }, h('i', { style: `width:${(learned / pool.length) * 100}%` })));
  }));
}

function modulePage(id) {
  const m = MOD[id];
  if (!m) return home();
  const pool = srsItems(id), learned = pool.filter(i => cards.has(i.id)).length;
  mount(view,
    h('header.mhead', {}, h('span.big-emoji', m.icon), h('div', {}, h('h1', m.name), h('p.muted', m.trains))),
    pool.length > 0 && h('div.card.row', {}, h('div', {}, h('strong', `${learned} / ${pool.length} learned`), h('small', `${dueItems(pool).length} due today`)),
      h('a.btn.primary', { href: `#/practice/${id}` }, 'Practise 10')),
    LABS[id]?.());
}

function boss() {
  const part = bossPart(), cfg = BOSS[part];
  const pool = srsItems().filter(i => i.examPart === part);
  const beaten = (kv.boss || []).find(b => b.week === weekKey());
  mount(view, h('section.summary', {}, h('div.big-emoji', '🐉'), h('h1', 'Boss battle'),
    h('p', `${PARTS[part]} — ${cfg.n} questions in ${cfg.min} minutes, exam rules: no hints, no feedback until the end.`),
    h('p.muted', beaten ? `You beat it this week (${beaten.score}/${beaten.max}). Replays earn no XP.` : 'First clear this week: 15 XP per mark, +50 for 75% or more.'),
    h('div.actions', {}, h('button.btn.primary', { onclick: () => runQueue(shuffle(pool).slice(0, cfg.n), { exam: { part, min: cfg.min } }) }, 'Fight ⚔️'), h('a.btn', { href: '#/' }, 'Not now'))));
}

function drill(tag) {
  const pool = srsItems().filter(i => i.tags.includes(tag));
  const missed = new Set(log.filter(e => !e.ok && e.tags.includes(tag)).map(e => e.id));
  runQueue([...shuffle(pool.filter(i => missed.has(i.id))), ...shuffle(pool.filter(i => !missed.has(i.id)))].slice(0, 10), { again: () => drill(tag) });
}

const practice = id => runQueue(pickItems(srsItems(id), 10), { again: () => practice(id) });
const session = () => runQueue(pickItems(srsItems(), size()), { again: session });

function progress() {
  const uoe = log.filter(e => e.p?.startsWith('UoE')).slice(-200);
  const acc = uoe.length ? uoe.reduce((s, e) => s + e.sc, 0) / uoe.length : 0;
  const est = uoe.length >= 20 ? estimateScale(acc) : null;
  const lv = levelFromXp(kv.xp || 0), streak = liveStreak(kv.streak || {});
  const band = s => (s >= 200 ? 'C2 · Grade A' : s >= 193 ? 'C1 · Grade B' : s >= 180 ? 'C1 · Grade C' : 'B2');

  const since = Date.now() - 30 * DAY, byPart = new Map();
  for (const e of log) if (e.t >= since) {
    const k = e.p || e.m, r = byPart.get(k) || { n: 0, sc: 0 };
    r.n++; r.sc += e.sc; byPart.set(k, r);
  }
  const days = [...Array(14)].map((_, i) => dayKey(Date.now() - (13 - i) * DAY));
  const perDay = Object.fromEntries(days.map(d => [d, 0]));
  for (const e of log) { const d = dayKey(e.t); if (d in perDay) perDay[d]++; }
  const maxDay = Math.max(1, ...Object.values(perDay));
  const errors = topErrors();

  mount(view,
    h('h1', 'Progress'),
    h('div.tiles4', {},
      tile('Estimated score', est ?? '—', est ? band(est) : `after ${20 - uoe.length} more UoE answers`),
      tile('Streak', streak, streak === 1 ? 'day' : 'days'),
      tile('Level', lv.level, `${lv.into} / ${lv.need} XP`),
      tile('Due today', dueItems(srsItems()).length, `${cards.size} items learned`)),
    h('section.panel', {}, h('h2', 'Accuracy by exam part'), h('p.muted.small', 'Last 30 days'),
      byPart.size ? h('div.bars', {}, [...byPart].sort().map(([k, r]) => {
        const a = r.sc / r.n, label = PARTS[k] || MOD[k]?.name || k;
        return h('div.bar-row', { tabindex: 0, 'data-tip': `${label}: ${fmtPct(a)} over ${r.n} answers` },
          h('span.bar-label', label), h('span.bar-track', {}, h('i', { style: `width:${a * 100}%` })), h('span.bar-val', `${fmtPct(a)} · ${r.n}`));
      })) : h('p.muted', 'Answer a few questions and your accuracy shows up here.')),
    h('section.panel', {}, h('h2', 'Answers per day'), h('p.muted.small', `Last 14 days · busiest day ${maxDay}`),
      h('div.cols', {}, days.map(d => {
        const n = perDay[d], date = new Date(`${d}T12:00`);
        return h('div.col', { tabindex: 0, 'data-tip': `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${n} answers` },
          h('span.col-bar', { style: `height:${(n / maxDay) * 100}%`, class: n ? '' : 'zero' }), h('span.col-day', date.toLocaleDateString('en-GB', { weekday: 'narrow' })));
      }))),
    h('section.panel', {}, h('h2', 'Top 5 mistakes this week'),
      errors.length ? h('ol.errors', {}, errors.map(([t, n]) => h('li', {}, h('a', { href: `#/drill/${encodeURIComponent(t)}` }, tagLabel(t)), h('span.muted', ` · ${n} misses · drill →`))))
        : h('p.muted', 'No mistakes logged this week. Suspicious… 😉')),
    h('section.panel', {}, h('h2', 'Badges'), h('div.badges', {},
      Object.entries(STRUCTURES).map(([k, name]) => { const m = mastery(k); return h('div.badge', { class: m.done ? 'got' : '', title: m.text }, h('span', m.done ? '🏅' : '🔒'), h('strong', name), h('small', m.text)); }),
      h('div.badge', { class: (kv.boss || []).length ? 'got' : '' }, h('span', '🐉'), h('strong', 'Boss slayer'), h('small', `${new Set((kv.boss || []).map(b => b.week)).size} weeks`)))),
    officialTests());
}

const tile = (label, value, sub) => h('div.stat', {}, h('small', label), h('strong', String(value)), h('span.muted.small', sub));

function officialTests() {
  const list = kv.official || [];
  const date = h('input', { type: 'date', value: dayKey(), required: true, 'aria-label': 'Test date' });
  const paper = h('select', { 'aria-label': 'Paper' }, ['Overall', 'Reading & Use of English', 'Writing', 'Listening', 'Speaking'].map(p => h('option', p)));
  const score = h('input', { type: 'number', min: 80, max: 230, placeholder: 'e.g. 186', required: true, 'aria-label': 'Cambridge Scale score' });
  return h('section.panel', {}, h('h2', 'Official sample tests'),
    h('p.muted.small', {}, 'Take the free ', h('a', { href: 'https://www.cambridgeenglish.org/exams-and-tests/advanced/preparation/', target: '_blank', rel: 'noopener' }, 'Cambridge sample tests ↗'), ' as an entry diagnostic and every quarter, then log the Cambridge Scale score here.'),
    h('form.row.wrap', {
      onsubmit: async e => {
        e.preventDefault();
        const s = Number(score.value);
        if (!(s >= 80 && s <= 230)) return toast('Cambridge Scale scores run from 80 to 230.');
        await store.set('official', [...list, { date: date.value, paper: paper.value, score: s }].sort((a, b) => a.date.localeCompare(b.date)));
        progress();
      },
    }, date, paper, score, h('button.btn.primary', { type: 'submit' }, 'Log')),
    list.length > 0 && h('table.tbl', {}, h('thead', {}, h('tr', {}, h('th', 'Date'), h('th', 'Paper'), h('th', 'Score'), h('th', ''))),
      h('tbody', {}, [...list].reverse().map(t => h('tr', {}, h('td', t.date), h('td', t.paper), h('td', h('strong', t.score)),
        h('td', h('button.icon', { 'aria-label': 'Delete entry', onclick: async () => { await store.set('official', list.filter(x => x !== t)); progress(); } }, '🗑')))))));
}

function settings() {
  const s = kv.settings || {};
  const save = async patch => { await store.set('settings', { ...kv.settings, ...patch }); applyTheme(); };
  const key = h('input', { type: 'password', value: s.key || '', placeholder: 'sk-ant-…', autocomplete: 'off', 'aria-label': 'Claude API key' });
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importFile });
  mount(view, h('h1', 'Settings'),
    h('section.panel', {}, h('h2', 'Practice'),
      h('label.field', {}, 'Daily session size', h('select', { onchange: e => save({ size: Number(e.target.value) }) }, [10, 20, 30].map(n => h('option', { value: n, selected: (s.size || 20) === n }, `${n} items`)))),
      h('label.field', {}, 'Voice speed', h('select', { onchange: e => save({ rate: Number(e.target.value) }) }, [[0.9, 'Calm'], [1, 'Native'], [1.15, 'Fast native']].map(([v, l]) => h('option', { value: v, selected: (s.rate || 1) === v }, l)))),
      h('label.field', {}, 'Theme', h('select', { onchange: e => save({ theme: e.target.value }) }, ['auto', 'light', 'dark'].map(t => h('option', { value: t, selected: (s.theme || 'auto') === t }, t))))),
    h('section.panel', {}, h('h2', 'AI writing feedback (optional)'),
      h('p.small', 'Paste your own Claude API key to get examiner-style feedback in the Writing Lab. It is stored only in this browser, is sent only to api.anthropic.com, and is left out of progress exports. Anyone using this browser profile could read it, so use a key with a low spending limit and keep this personal.'),
      h('div.row', {}, key, h('button.btn.primary', { onclick: async () => { await save({ key: key.value.trim() }); toast(key.value.trim() ? 'Key saved on this device' : 'Key removed'); } }, 'Save'))),
    h('section.panel', {}, h('h2', 'Your data'),
      h('p.small', 'Everything lives in this browser (IndexedDB). Export a backup now and then, or to move to another device.'),
      h('div.row.wrap', {},
        h('button.btn', { onclick: exportFile }, '⬇ Export progress'),
        h('button.btn', { onclick: () => file.click() }, '⬆ Import progress'), file,
        h('button.btn.danger', { onclick: resetAll }, 'Reset everything'))));
}

function exportFile() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(store.exportAll())], { type: 'application/json' }));
  h('a', { href: url, download: `c1c2-forge-${dayKey()}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || !confirm('Importing replaces all progress on this device with the file. Continue?')) return;
  try {
    await store.importAll(JSON.parse(await f.text()));
    for (const ch of kv.chunks || []) addItem(ch);
    toast('Progress imported'); renderHeader(); applyTheme(); settings();
  } catch (err) { toast(`Import failed: ${err.message}`, 5000); }
}

async function resetAll() {
  if (!confirm('Delete ALL progress, XP, chunks and settings on this device? Export first if unsure.')) return;
  if (!confirm('Really? This cannot be undone.')) return;
  await store.wipe();
  for (const [id, it] of items) if (it.module === 'chunk') items.delete(id);
  toast('Everything reset'); renderHeader(); applyTheme(); home();
}

function about() {
  const src = [
    ['Octanove Vocabulary Profile C1/C2 1.0', 'Octanove Labs', 'CC BY-SA 4.0', 'https://github.com/openlanguageprofiles/olp-en-cefrj'],
    ['CEFR-J Wordlist 1.5', 'Yukio Tono, Tokyo University of Foreign Studies (cefr-j.org)', 'Free with citation', 'https://github.com/openlanguageprofiles/olp-en-cefrj'],
    ['New Academic Word List 1.2', 'Browne, Culligan & Phillips', 'CC BY-SA 4.0', 'https://www.newgeneralservicelist.com/new-academic-word-list'],
    ['Tatoeba example sentences (when used)', 'Tatoeba contributors', 'CC BY 2.0 FR', 'https://tatoeba.org/en/downloads'],
  ];
  mount(view, h('h1', 'About'),
    h('section.panel', {}, h('p', 'C1→C2 Forge drills the exact skills Cambridge C1 Advanced tests — collocation precision, word formation, transformations, nuance and register — in short daily sessions with spaced repetition (FSRS).'),
      h('p.small.muted', 'The estimated Cambridge Scale score is a rough guide from your Use of English accuracy, not an official result.')),
    h('section.panel', {}, h('h2', 'Data & licences'), h('ul.links', {}, src.map(([n, by, lic, url]) => h('li', {}, h('a', { href: url, target: '_blank', rel: 'noopener' }, n), ` — ${by}. ${lic}.`))),
      h('p.small', 'All exercises are original, written with Claude for this app, and shared under CC BY-SA 4.0 in keeping with the share-alike word lists they draw on.')),
    h('section.panel', {}, h('h2', 'Free practice, linked not copied'), h('ul.links', {},
      [['Cambridge C1 Advanced preparation (official sample tests)', 'https://www.cambridgeenglish.org/exams-and-tests/advanced/preparation/'],
        ['C1 Advanced Handbook for Teachers (PDF)', 'https://www.cambridgeenglish.org/Images/167804-c1-advanced-handbook.pdf'],
        ['Write & Improve with Cambridge', 'https://writeandimprove.com/free'],
        ['British Council LearnEnglish C1', 'https://learnenglish.britishcouncil.org/level/understand-your-level/c1-advanced'],
        ...INPUT.map(x => [x.name, x.url])].map(([n, u]) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, n))))));
}

// ---------- routing & start-up ----------
const routes = {
  '': home, session, m: modulePage, practice, drill: t => drill(decodeURIComponent(t)), boss, progress, settings, about,
  modules: () => mount(view, h('h1', 'Modules'), moduleGrid()), read: readingPage, write: writingPage, speak: speakingPage, pairup: pairUp,
};

function route() {
  leave();
  const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  (routes[name] || home)(arg);
  for (const a of document.querySelectorAll('nav.tabs a')) a.toggleAttribute('aria-current', a.getAttribute('href') === `#/${name}` || (!name && a.getAttribute('href') === '#/'));
  scrollTo(0, 0);
}

function applyTheme() {
  const t = kv.settings?.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

async function start() {
  try {
    await store.init();
    await loadContent();
  } catch (err) {
    mount(view, h('div.empty', {}, h('p', `Could not start: ${err.message}`), h('p.muted.small', 'Serve the folder over http (not file://), or check that IndexedDB is allowed.')));
    throw err;
  }
  applyTheme(); renderHeader();
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
}
start();
