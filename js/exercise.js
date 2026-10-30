// One renderer per item kind. Each reports opts.onResult({ ok, sc, grade, hinted, answer }, anchorEl) once,
// then opts.onDone() when the learner moves on. Exam mode has no feedback or hints and moves on at once.
import { h, mount, speak } from './ui.js';
import { checkText, transformScore, dictationScore, sameOrder, shuffle } from './core.js';
import { MOD, PARTS } from './modules.js';
import { kv } from './store.js';

const PRAISE = ['Spot on!', 'Nailed it', 'C2 move!', 'Exactly right', 'Sharp!', 'Clean.'];
const blanked = s => String(s).split('___').flatMap((p, i) => (i ? [h('span.blank', { 'aria-label': 'gap' }, '   '), p] : [p]));

export function render(item, { exam = false, onResult = () => {}, onDone }) {
  const card = h('article.ex'), body = h('div.ex-body'), fb = h('div.feedback', { 'aria-live': 'polite' }), actions = h('div.actions');
  const gloss = item.glossCs && !exam ? h('p.gloss', { hidden: true }, `🇨🇿 ${item.glossCs}`) : null;
  mount(card,
    h('div.ex-head', {}, h('span.chip', `${MOD[item.module]?.icon || ''} ${MOD[item.module]?.name || ''}`), item.examPart && h('span.chip.soft', PARTS[item.examPart] || item.examPart),
      gloss && h('button.chip.cz', { onclick: () => { gloss.hidden = !gloss.hidden; }, 'aria-label': 'Show Czech gloss' }, 'CZ')),
    body, gloss, fb, actions);
  KINDS[item.kind]({ item, exam, onResult, onDone, card, body, fb, actions });
  return card;
}

function finish(c, res, ...extra) {
  if (c.exam) { c.onResult(res, c.card); return c.onDone(); }
  c.card.classList.add(res.ok ? 'right' : 'wrong');
  const verdict = h('p.verdict', res.ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : res.sc > 0 ? 'Partly there' : 'Not quite');
  mount(c.fb, verdict, ...extra, c.item.explanation && h('p.expl', c.item.explanation));
  const next = h('button.btn.primary', { onclick: () => c.onDone() }, 'Continue →');
  mount(c.actions, next);
  next.focus({ preventScroll: true });
  c.onResult(res, verdict);
}

function selfGrade(c) {
  const labels = ['Again', 'Hard', 'Good', 'Easy'];
  mount(c.actions, h('p.muted.small', 'How well did you know it?'), h('div.grades', {}, labels.map((l, i) =>
    h('button.btn.grade', { class: `g${i + 1}`, onclick: e => { c.onResult({ ok: i > 0, sc: [0, 0.5, 1, 1][i], grade: i + 1 }, e.currentTarget); c.onDone(); } }, l))));
}

// Hint ladder shared by typed answers: step through `steps`, then the last press gives up.
function hintButton(c, steps, giveUp) {
  let n = 0;
  const b = h('button.btn.ghost', {
    onclick: () => {
      if (n < steps.length) { steps[n++](); b.textContent = n < steps.length ? '💡 More help' : '🙈 Show answer'; }
      else giveUp();
    },
  }, '💡 Hint');
  return { b, used: () => n };
}

function listenBar(text, c) {
  const rate = kv.settings?.rate || 1;
  if (!('speechSynthesis' in window)) {
    c.body.append(h('p.notice', 'This browser has no text-to-speech, so here is the text:'), h('p.context', text));
    return;
  }
  c.body.append(h('div.listen', {},
    h('button.btn.play', { onclick: () => speak(text, rate) }, '▶ Play'),
    h('button.btn.ghost', { onclick: () => speak(text, rate * 0.8) }, '🐢 Slower')),
    ...(IOS ? [h('p.muted.small', 'No sound? Switch the iPhone’s Ring/Silent switch to ring and turn the volume up.')] : []));
}
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const input = (props) => h('input.gap', { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...props });
// preventDefault stops the same Enter press from also clicking the Continue button that takes focus.
const onEnter = fn => e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

const KINDS = {
  mc(c) {
    const { item, body } = c;
    if (item.text) body.append(h('p.context', item.text));
    if (item.speak) listenBar(item.speak, c);
    body.append(h('p.prompt', blanked(item.prompt)));
    const opts = h('div.options');
    for (const o of shuffle(item.options)) opts.append(h('button.opt', { onclick: e => choose(o, e.currentTarget) }, o));
    body.append(opts);
    function choose(o, btn) {
      const ok = o === item.answer;
      for (const b of opts.children) { b.disabled = true; if (b.textContent === item.answer) b.classList.add('is-right'); }
      if (!ok) btn.classList.add('is-wrong');
      finish(c, { ok, sc: +ok, grade: ok ? 3 : 1, answer: o }, !ok && h('p', 'Answer: ', h('strong', item.answer)), item.speak && h('p.transcript', `“${item.speak}”`));
    }
  },

  gap(c) {
    const { item, body } = c, inputs = [];
    const p = h('p.prompt.gaptext');
    item.text.split(/\{([^}]+)\}/).forEach((s, i) => {
      if (i % 2 === 0) return s && p.append(s);
      const accepts = s.split('|');
      const el = input({ size: Math.max(4, ...accepts.map(a => a.length)) + 1, 'aria-label': `Gap ${inputs.length + 1}`, onkeydown: onEnter(() => check()) });
      el.accepts = accepts;
      inputs.push(el); p.append(el);
    });
    if (item.prompt) body.append(h('p.muted', item.prompt));
    body.append(p);
    const open = () => inputs.filter(el => !checkText(el.value, el.accepts));
    const hint = hintButton(c, [
      () => open().forEach(el => { el.placeholder = `${el.accepts[0][0]}…`; }),
      () => { open().forEach(el => { el.placeholder = el.accepts[0][0] + '·'.repeat(el.accepts[0].length - 1); }); if (item.hint) mount(c.fb, h('p.hint', item.hint)); },
    ], () => check(true));
    mount(c.actions, !c.exam && hint.b, h('button.btn.primary', { onclick: () => check() }, c.exam ? 'Next →' : 'Check'));
    setTimeout(() => inputs[0]?.focus({ preventScroll: true }));
    function check(gaveUp) {
      const res = inputs.map(el => !gaveUp && checkText(el.value, el.accepts));
      inputs.forEach((el, i) => { el.disabled = true; el.classList.add(res[i] ? 'is-right' : 'is-wrong'); if (!res[i]) el.after(h('span.fix', el.accepts[0])); });
      const sc = res.filter(Boolean).length / res.length, ok = sc === 1;
      finish(c, { ok, sc, grade: ok ? (hint.used() ? 2 : 3) : 1, hinted: hint.used() > 0, answer: inputs.map(el => el.value || '—').join(' / ') });
    }
  },

  transform(c) {
    const { item, body } = c;
    const [pre, post] = item.stem.split('___');
    const el = input({ class: 'wide', 'aria-label': 'Your 3 to 6 words', onkeydown: onEnter(check) });
    body.append(h('p.context', item.first), h('div.key', {}, h('span', item.key)), h('p.prompt', pre, el, post), h('p.muted.small', 'Use 3–6 words, including the key word.'));
    const hint = hintButton(c, [
      () => mount(c.fb, h('p.hint', item.hint || 'Think about which structure the key word forces.')),
      () => { el.placeholder = `${item.chunks[0][0]} …`; },
    ], () => { el.value = ''; check(); });
    mount(c.actions, !c.exam && hint.b, h('button.btn.primary', { onclick: check }, c.exam ? 'Next →' : 'Check'));
    setTimeout(() => el.focus({ preventScroll: true }));
    function check() {
      const score = transformScore(el.value, item);
      el.disabled = true;
      el.classList.add(score === 2 ? 'is-right' : 'is-wrong');
      finish(c, { ok: score === 2, sc: score / 2, grade: score === 2 ? (hint.used() ? 2 : 3) : score ? 2 : 1, hinted: hint.used() > 0, answer: el.value || '—' },
        h('p', h('strong', `${score}/2 marks`), ' · model answer: ', h('em', item.answer)));
    }
  },

  order(c) {
    const { item, body } = c;
    if (item.text) body.append(h('p.context', item.text));
    body.append(h('p.prompt', item.prompt));
    const line = h('div.tiles.line', { class: item.block ? 'blocks' : '' }), pool = h('div.tiles.pool', { class: item.block ? 'blocks' : '' });
    let mix = shuffle([...item.tiles, ...(item.extra || [])]);
    while (item.tiles.length > 1 && sameOrder(mix.slice(0, item.tiles.length), item) && !item.extra) mix = shuffle(mix);
    for (const t of mix) {
      const b = h('button.tile', { onclick: () => (b.parentNode === pool ? line : pool).append(b) }, t);
      pool.append(b);
    }
    body.append(h('p.muted.small', item.block ? 'Tap the paragraphs in the right order.' : 'Tap the tiles in order. Tap again to remove.'), line, pool);
    mount(c.actions, h('button.btn.primary', { onclick: check }, c.exam ? 'Next →' : 'Check'));
    function check() {
      const seq = [...line.children].map(b => b.textContent);
      const ok = sameOrder(seq, item);
      for (const b of [...line.children, ...pool.children]) b.disabled = true;
      finish(c, { ok, sc: +ok, grade: ok ? 3 : 1, answer: seq.join(' ') || '—' },
        !ok && (item.block ? h('ol.answer', {}, item.tiles.map(t => h('li', t))) : h('p', 'Answer: ', h('strong', item.tiles.join(' ')))));
    }
  },

  rewrite(c) {
    const { item, body } = c;
    const ta = h('textarea', { rows: 5, placeholder: 'Your version…', 'aria-label': 'Your rewrite' });
    body.append(h('p.muted', item.prompt || `Rewrite it in a ${item.direction} register.`), h('blockquote', item.source), ta);
    mount(c.actions, h('button.btn.primary', {
      onclick: () => {
        ta.readOnly = true;
        mount(c.fb, h('p.verdict', 'Compare'), h('p', h('strong', 'Model: '), item.model), item.keyChanges && h('ul.checks', {}, item.keyChanges.map(k => h('li', k))));
        selfGrade(c);
      },
    }, 'Compare with model'));
  },

  flash(c) {
    const { item, body } = c;
    const front = item.front || (item.example && item.back && item.example.toLowerCase().includes(item.back.toLowerCase())
      ? item.example.replace(new RegExp(item.back.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____')
      : item.glossCs ? `🇨🇿 ${item.glossCs}` : 'Recall the chunk');
    body.append(h('p.prompt', front));
    if (item.source) body.append(h('p.muted.small', `from ${item.source}`));
    mount(c.actions, h('button.btn.primary', {
      onclick: () => {
        mount(c.fb, h('p.reveal', item.back), item.def && h('p', item.def), item.example && h('p.muted', item.example), item.glossCs && h('p.muted', `🇨🇿 ${item.glossCs}`));
        selfGrade(c);
      },
    }, 'Show'));
  },

  dictation(c) {
    const { item, body } = c;
    listenBar(item.text, c);
    const ta = h('textarea', { rows: 3, placeholder: 'Type exactly what you hear…', 'aria-label': 'Dictation', spellcheck: 'false' });
    body.append(ta);
    mount(c.actions, h('button.btn.primary', { onclick: check }, c.exam ? 'Next →' : 'Check'));
    function check() {
      const r = dictationScore(ta.value, item.text);
      ta.readOnly = true;
      const ok = r.acc >= 0.9;
      finish(c, { ok, sc: r.acc, grade: r.acc === 1 ? 3 : ok ? 2 : 1, answer: ta.value },
        h('p.dict', {}, r.words.map((w, i) => h('span', { class: r.hit[i] ? 'hit' : 'miss' }, w, ' '))), h('p.muted.small', `${Math.round(r.acc * 100)}% of words`));
    }
  },
};
