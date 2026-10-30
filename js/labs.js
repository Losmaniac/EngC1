// Module extras that are not plain spaced-repetition items.
import { h, mount, toast, fmtPct } from './ui.js';
import * as store from './store.js';
import { kv, log } from './store.js';
import { shuffle, dayKey } from './core.js';
import { items, srsItems, addXp, addItem, recordAnswer, onLeave, leave } from './actions.js';
import { askClaude } from './claude.js';
import { STRUCTURES, PARTS } from './modules.js';

const view = () => document.getElementById('view');
const byModule = m => [...items.values()].filter(i => i.module === m && (i.kind === 'task' || i.kind === 'passage'));
const ext = (url, text) => h('a', { href: url, target: '_blank', rel: 'noopener' }, `${text} ↗`);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A grammar structure counts as mastered after 6 correct answers at 80%+ accuracy.
export function mastery(tag) {
  const es = log.filter(e => e.tags.includes(tag)), ok = es.filter(e => e.ok).length;
  const done = ok >= 6 && ok / es.length >= 0.8;
  return { done, text: done ? `Mastered · ${fmtPct(ok / es.length)}` : `${Math.min(ok, 6)}/6 correct${es.length ? ` · ${fmtPct(ok / es.length)}` : ''}` };
}

export const LABS = {
  collocation: () => h('a.card', { href: '#/pairup' }, h('span.big-emoji', '🧩'), h('div', {}, h('strong', 'Pair-up'), h('small', 'Match 5 collocates against the clock-free board'))),

  power: () => h('section.panel', {}, h('h2', 'Structure badges'), h('div.badges', {}, Object.entries(STRUCTURES).map(([k, name]) => {
    const m = mastery(k);
    return h('div.badge', { class: m.done ? 'got' : '' }, h('span', m.done ? '🏅' : '🔒'), h('strong', name), h('small', m.text));
  }))),

  reading: () => [
    h('h2', 'Texts with questions'),
    h('div.cards', {}, byModule('reading').map(p => h('a.card', { href: `#/read/${p.id}` }, h('span.big-emoji', '📰'), h('div', {}, h('strong', p.title), h('small', `${p.questions.length} questions · ${PARTS[p.examPart] || 'Reading'}`))))),
    h('p.muted.small', {}, 'Paragraph-order tasks (Part 7) run in the practice button above. For more authentic texts: ', ext('https://linguapress.com/advanced', 'Linguapress Advanced'), '.'),
  ],

  listening: () => h('section.panel', {},
    h('p', 'Dictation and speaker-attitude items use your browser’s built-in voice — set the speed in Settings.'),
    !('speechSynthesis' in window) && h('p.notice', 'This browser has no text-to-speech; the items will show the text instead.'),
    h('h2', 'Native-speed input'),
    h('ul.links', {}, [
      ['https://www.bbc.co.uk/learningenglish/english/features/6-minute-english', 'BBC 6 Minute English (transcripts + quiz)'],
      ['https://learnenglish.britishcouncil.org/free-resources/listening/c1', 'British Council C1 listening'],
      ['http://ropecast.uni-saarland.de/', 'RoPeCast (CC BY)'],
      ['https://lingorank.com/', 'LingoRank — TED talks filtered to C1'],
      ['http://esl-bits.net/', 'ESL Bits audiobooks with text'],
    ].map(([u, t]) => h('li', ext(u, t))))),

  writing: () => [
    h('div.cards', {}, byModule('writing').map(t => h('a.card', { href: `#/write/${t.id}` }, h('span.big-emoji', '📝'), h('div', {}, h('strong', t.title), h('small', `${t.type} · ${t.words?.join('–') || '220–260'} words`), kv.drafts?.[t.id] && h('small.done', 'Draft saved'))))),
    h('p.muted.small', {}, 'Free automatic feedback outside the app: ', ext('https://writeandimprove.com/free', 'Write & Improve'), '.'),
  ],

  speaking: () => h('div.cards', {}, byModule('speaking').map(t => h('a.card', { href: `#/speak/${t.id}` }, h('span.big-emoji', '🎤'), h('div', {}, h('strong', t.title), h('small', `${PARTS[t.examPart] || 'Speaking'} · ${t.time || 60} s`))))),

  chunk: () => {
    const phrase = h('input', { required: true, placeholder: 'e.g. a foregone conclusion', 'aria-label': 'Phrase' });
    const ctx = h('textarea', { rows: 2, placeholder: 'The sentence where you met it (optional)', 'aria-label': 'Context sentence' });
    const gloss = h('input', { placeholder: 'Czech gloss (optional)', 'aria-label': 'Czech gloss' });
    const src = h('input', { placeholder: 'Source: podcast, article… (optional)', 'aria-label': 'Source' });
    const list = h('ul.chunks'), btn = h('button.btn.primary', { type: 'submit' }, 'Catch it 🧲');
    const draw = () => mount(list, (kv.chunks || []).slice().reverse().map(ch => h('li', {}, h('div', {}, h('strong', ch.back), ch.glossCs && h('span.muted', ` — ${ch.glossCs}`), ch.example && h('small', ch.example)),
      h('button.icon', { 'aria-label': `Delete ${ch.back}`, onclick: async () => {
        if (!confirm(`Delete “${ch.back}”?`)) return;
        await store.set('chunks', kv.chunks.filter(x => x.id !== ch.id));
        items.delete(ch.id); draw();
      } }, '🗑'))));
    draw();
    return [
      h('form.panel.stack', {
        onsubmit: async e => {
          e.preventDefault();
          const p = phrase.value.trim();
          if (!p) return;
          const item = { id: `chunk-${Date.now().toString(36)}`, module: 'chunk', kind: 'flash', back: p, example: ctx.value.trim() || null, glossCs: gloss.value.trim() || null, source: src.value.trim() || null, tags: ['chunk'], at: Date.now() };
          await store.set('chunks', [...(kv.chunks || []), item]);
          addItem(item);
          e.target.reset(); draw(); addXp(3, btn);
          toast('Caught! It will come back in your sessions.');
        },
      }, h('h2', 'Catch a phrase from real input'), phrase, ctx, gloss, src, btn),
      h('h2', 'Your chunks'), list,
    ];
  },
};

export function pairUp() {
  const seen = new Set();
  const pool = shuffle(srsItems('collocation').filter(i => i.target && new RegExp(`\\b${esc(i.answer)}\\b`, 'i').test(i.target)))
    .filter(i => !seen.has(i.answer.toLowerCase()) && seen.add(i.answer.toLowerCase())).slice(0, 5);
  const pairs = pool.map((it, k) => ({ k, left: it.answer, right: it.target.replace(new RegExp(`\\b${esc(it.answer)}\\b`, 'i'), '…') }));
  let sel = null, matched = 0, misses = 0;
  const btn = (p, side) => h('button.tile', { onclick: e => pick(p, side, e.currentTarget) }, side === 'l' ? p.left : p.right);
  const L = h('div.pcol', {}, shuffle(pairs).map(p => btn(p, 'l'))), R = h('div.pcol', {}, shuffle(pairs).map(p => btn(p, 'r')));
  const status = h('p.muted', 'Tap a word, then the phrase it completes.');
  mount(view(), h('a.back', { href: '#/m/collocation' }, '← Collocation Forge'), h('h1', 'Pair-up 🧩'), status, h('div.pairup', {}, L, R));
  function pick(p, side, el) {
    if (side === 'l') { L.querySelectorAll('.sel').forEach(b => b.classList.remove('sel')); el.classList.add('sel'); sel = { p, el }; return; }
    if (!sel) return;
    if (sel.p.k === p.k) {
      for (const b of [sel.el, el]) { b.classList.remove('sel'); b.classList.add('is-right'); b.disabled = true; }
      sel = null;
      if (++matched === pairs.length) {
        addXp(Math.max(2, 10 - misses * 2), el);
        mount(status, `All matched with ${misses} miss${misses === 1 ? '' : 'es'}. `, h('a', { href: '#/pairup', onclick: () => setTimeout(pairUp) }, 'Play again'));
      }
    } else {
      misses++;
      el.classList.add('is-wrong');
      setTimeout(() => el.classList.remove('is-wrong'), 450);
    }
  }
}

export function readingPage(id) {
  const p = items.get(id);
  if (!p) { location.hash = '#/m/reading'; return; }
  const qs = p.questions.map((q, qi) => ({ q, qi, chosen: null }));
  const list = h('ol.questions');
  for (const x of qs) {
    const opts = h('div.options');
    for (const o of shuffle(x.q.options)) opts.append(h('button.opt', { onclick: e => { x.chosen = o; for (const b of opts.children) b.classList.toggle('sel', b === e.currentTarget); } }, o));
    x.opts = opts; x.fb = h('div.feedback');
    list.append(h('li.q', {}, h('p.prompt', x.q.q), opts, x.fb));
  }
  const btn = h('button.btn.primary', { onclick: check }, 'Check answers');
  mount(view(), h('a.back', { href: '#/m/reading' }, '← Reading Detective'), h('h1', p.title),
    h('article.passage', {}, p.text.map(t => h('p', t))), h('h2', 'Questions'), list, h('div.actions', {}, btn));

  async function check() {
    if (qs.some(x => !x.chosen) && !confirm('Some questions are unanswered. Check anyway?')) return;
    btn.disabled = true;
    let right = 0;
    for (const x of qs) {
      const ok = x.chosen === x.q.answer;
      right += ok;
      for (const b of x.opts.children) { b.disabled = true; b.classList.toggle('is-right', b.textContent === x.q.answer); b.classList.toggle('is-wrong', !ok && b.textContent === x.chosen); }
      mount(x.fb, x.q.explanation && h('p.expl', x.q.explanation));
      await recordAnswer({ id: `${p.id}#${x.qi}`, module: 'reading', examPart: p.examPart || 'R5', tags: x.q.tags || ['reading'] }, { ok, sc: +ok }, { srs: false });
    }
    await addXp(right * 10 + (qs.length - right) * 2, btn);
    btn.replaceWith(h('p.verdict', `${right} / ${qs.length} correct`), h('a.btn', { href: '#/m/reading' }, 'More texts'));
  }
}

const RUBRIC = [
  ['content', 'Content', 'Everything is relevant and the reader ends up fully informed.'],
  ['communicative', 'Communicative achievement', 'The conventions of this task type are used well; complex ideas come across and the tone fits the reader.'],
  ['organisation', 'Organisation', 'Clear structure, varied linking and cohesive devices, paragraphs that each do one job.'],
  ['language', 'Language', 'Precise, less common vocabulary and collocations; a wide range of structures with control; only rare slips.'],
];

const str = { type: 'string' };
const FEEDBACK = {
  type: 'object', additionalProperties: false, required: ['scores', 'summary', 'strengths', 'fixes', 'upgrades'],
  properties: {
    scores: { type: 'object', additionalProperties: false, required: RUBRIC.map(r => r[0]), properties: Object.fromEntries(RUBRIC.map(r => [r[0], { type: 'integer' }])) },
    summary: str, strengths: { type: 'array', items: str }, upgrades: { type: 'array', items: str },
    fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quote', 'better', 'why'], properties: { quote: str, better: str, why: str } } },
  },
};

export function writingPage(id) {
  const t = items.get(id);
  if (!t) { location.hash = '#/m/writing'; return; }
  const [min, max] = t.words || [220, 260];
  const wc = h('span.wc'), clock = h('span.clock'), aiBox = h('div.ai');
  const ta = h('textarea.essay', { rows: 14, value: kv.drafts?.[id] || '', placeholder: 'Write here…', 'aria-label': 'Your answer', oninput: () => { count(); saveSoon(); } });
  let saveT, timer, ai = null;
  const save = () => store.set('drafts', { ...kv.drafts, [id]: ta.value });
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 600); };
  const count = () => {
    const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    wc.textContent = `${n} words (aim ${min}–${max})`;
    wc.className = `wc ${n >= min && n <= max ? 'ok' : n > max ? 'over' : ''}`;
    return n;
  };
  onLeave(() => { clearInterval(timer); clearTimeout(saveT); save(); });
  const checks = RUBRIC.map(([k, name, desc]) => h('label.check', {}, h('input', { type: 'checkbox', value: k }), h('span', {}, h('strong', name), h('small', desc))));

  mount(view(), h('a.back', { href: '#/m/writing' }, '← Writing Lab'),
    h('h1', t.title), h('p.chip.soft', t.type),
    h('section.panel', {}, h('p', t.prompt), t.points && h('ul', {}, t.points.map(p => h('li', p)))),
    h('div.row.wrap', {}, h('button.btn', { onclick: startTimer }, '⏱ 45-min timer'), clock, wc),
    ta,
    h('section.panel', {}, h('h2', 'Self-check (C1 Advanced criteria)'), checks),
    h('div.row.wrap', {}, h('button.btn', { onclick: feedback }, '🤖 AI feedback'), h('button.btn.primary', { onclick: done }, 'Finish & log')),
    aiBox);
  count();

  function startTimer() {
    clearInterval(timer);
    const end = Date.now() + 45 * 60e3;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      clock.textContent = `⏱ ${Math.floor(left / 60e3)}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')}`;
      clock.classList.toggle('low', left < 5 * 60e3);
      if (!left) { clearInterval(timer); toast('Time! In the exam you would stop here.'); }
    };
    tick(); timer = setInterval(tick, 1000);
  }

  async function feedback() {
    if (!kv.settings?.key) return mount(aiBox, h('p.notice', {}, 'Add your Claude API key in ', h('a', { href: '#/settings' }, 'Settings'), ' to get AI feedback.'));
    if (count() < 50) return toast('Write a bit more first.');
    mount(aiBox, h('p.muted', 'Marking… (this can take a little while)'));
    try {
      ai = await askClaude({
        key: kv.settings.key, schema: FEEDBACK,
        prompt: `You are an experienced Cambridge C1 Advanced writing examiner. The candidate is a Czech professional at C1 aiming for C2.
Mark the answer on the four C1 Advanced subscales (Content, Communicative Achievement, Organisation, Language), each an integer 0-5.
Then give: a two-sentence summary; up to 3 strengths; up to 6 fixes, each quoting the candidate's exact words with a better version and why; up to 5 specific "C2 upgrades" (phrases or structures that would lift it toward C2).
Task type: ${t.type}. Target length: ${min}-${max} words.
<task>${t.prompt}${t.points ? `\n${t.points.join('\n')}` : ''}</task>
<answer>${ta.value}</answer>`,
      });
      const total = RUBRIC.reduce((s, [k]) => s + ai.scores[k], 0);
      mount(aiBox, h('section.panel', {}, h('h2', `AI feedback · ${total}/20`),
        h('div.tiles4', {}, RUBRIC.map(([k, name]) => h('div.stat', {}, h('small', name), h('strong', `${ai.scores[k]}/5`)))),
        h('p', ai.summary),
        ai.strengths.length > 0 && [h('h3', 'Strengths'), h('ul', {}, ai.strengths.map(s => h('li', s)))],
        ai.fixes.length > 0 && [h('h3', 'Fixes'), h('ul.fixes', {}, ai.fixes.map(f => h('li', {}, h('s', f.quote), ' → ', h('strong', f.better), h('small', f.why))))],
        ai.upgrades.length > 0 && [h('h3', 'C2 upgrades'), h('ul', {}, ai.upgrades.map(s => h('li', s)))]));
    } catch (err) {
      mount(aiBox, h('p.notice', `AI feedback failed: ${err.message}`));
    }
  }

  async function done() {
    const n = count();
    if (n < 50) return toast('Write at least a short draft before logging it.');
    save();
    const self = checks.filter(c => c.querySelector('input').checked).length / RUBRIC.length;
    const sc = ai ? RUBRIC.reduce((s, [k]) => s + ai.scores[k], 0) / 20 : self;
    const first = !log.some(e => e.id === id && dayKey(e.t) === dayKey());
    await recordAnswer({ id, module: 'writing', examPart: 'W', tags: ['writing'] }, { ok: sc >= 0.6, sc }, { srs: false });
    if (first) await addXp(n >= min && n <= max ? 40 : 25);
    toast(first ? 'Logged — great work ✍️' : 'Logged again (XP once per task per day)');
  }
}

const MOVES = [
  'Framed my answer (“What strikes me first is…”)',
  'Compared rather than described (“whereas”, “by contrast”)',
  'Speculated with modals (might well, can’t have, must have)',
  'Used a cleft or inversion for emphasis',
  'Hedged an opinion (arguably, to some extent)',
  'Used a precise collocation or idiom',
  'Rounded off with a conclusion',
];

export function speakingPage(id) {
  const t = items.get(id);
  if (!t) { location.hash = '#/m/speaking'; return; }
  let stream = null, rec = null, chunks = [], timer = null, audioUrl = null;
  const clock = h('div.bigclock', `${t.time || 60}s`), stage = h('div.stack');
  const stopAll = () => { clearInterval(timer); if (rec?.state === 'recording') rec.stop(); stream?.getTracks().forEach(tr => tr.stop()); };
  onLeave(() => { stopAll(); if (audioUrl) URL.revokeObjectURL(audioUrl); });
  mount(view(), h('a.back', { href: '#/m/speaking' }, '← Speaking Sprint'), h('h1', t.title),
    h('section.panel', {}, h('p', t.prompt), t.points && h('ul', {}, t.points.map(p => h('li', p)))), clock, stage);
  mount(stage, h('button.btn.primary', { onclick: begin }, `▶ Start (${t.prep ?? 15} s to prepare)`), h('p.muted.small', 'Recording stays in this tab only and is never uploaded.'));

  function countdown(secs, label, then) {
    clearInterval(timer);
    const end = Date.now() + secs * 1000;
    const tick = () => {
      const left = Math.ceil(Math.max(0, end - Date.now()) / 1000);
      clock.textContent = `${label} ${left}s`;
      clock.classList.toggle('low', label === 'Speak!' && left <= 10);
      if (!left) { clearInterval(timer); then(); }
    };
    tick(); timer = setInterval(tick, 250);
  }

  async function begin() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { stream = null; toast('No microphone access — you can still do the timed turn.'); }
    mount(stage, h('button.btn', { onclick: talk }, 'Skip preparation'));
    countdown(t.prep ?? 15, 'Prepare', talk);
  }

  function talk() {
    if (stream && 'MediaRecorder' in window) {
      rec = new MediaRecorder(stream);
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = review;
      rec.start();
    }
    mount(stage, h('button.btn.danger', { onclick: stop }, '■ Stop'), rec && h('p.rec', '● Recording'));
    countdown(t.time || 60, 'Speak!', stop);
  }

  function stop() {
    const recording = rec?.state === 'recording';
    stopAll();
    clock.textContent = 'Done';
    if (!recording) review();
  }

  function review() {
    if (chunks.length) audioUrl = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
    const moves = t.moves || MOVES;
    const boxes = moves.map(m => h('label.check', {}, h('input', { type: 'checkbox' }), h('span', m)));
    mount(stage, audioUrl && h('audio', { controls: true, src: audioUrl }),
      h('section.panel', {}, h('h2', 'Which C1 moves did you use?'), boxes),
      h('div.row', {}, h('button.btn.primary', {
        onclick: async e => {
          const ticked = boxes.filter(b => b.querySelector('input').checked).length;
          await recordAnswer({ id, module: 'speaking', examPart: t.examPart, tags: ['speaking'] }, { ok: ticked >= 3, sc: ticked / moves.length }, { srs: false });
          await addXp(20 + 3 * ticked, e.currentTarget);
          e.currentTarget.replaceWith(h('a.btn', { href: '#/m/speaking' }, 'Next prompt'));
        },
      }, 'Log it'), h('button.btn', { onclick: () => { leave(); speakingPage(id); } }, 'Try again')));
  }
}
