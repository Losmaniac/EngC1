// Shared app state and the few actions every screen needs.
import { h, mount, toast, floatXp } from './ui.js';
import { cards, kv, set, saveCard, addLog } from './store.js';
import { review, isDue, levelFromXp, touchStreak, liveStreak, hashId } from './core.js';
import { MOD, SRS_KINDS } from './modules.js';

const FILES = ['collocations', 'gaps', 'wordsmith', 'transforms', 'power', 'nuance', 'register', 'reading', 'listening', 'writing', 'speaking', 'generated'];
export const items = new Map();

export async function loadContent() {
  const packs = await Promise.all(FILES.map(async f => {
    const r = await fetch(`data/${f}.json`);
    if (!r.ok) throw new Error(`data/${f}.json: HTTP ${r.status}`);
    return r.json();
  }));
  for (const p of packs) for (const it of p.items) addItem({ module: p.module, kind: p.kind, examPart: p.examPart ?? null, ...it });
  for (const ch of kv.chunks || []) addItem(ch);
}

export function addItem(x) {
  x.id ??= hashId(x.module, [x.prompt, x.text, x.first, x.title, x.source, x.speak, x.tiles?.join(' ')].filter(Boolean).join('|'));
  x.tags ??= [MOD[x.module].tag];
  if (items.has(x.id)) console.warn('Duplicate item id, later one wins:', x.id);
  items.set(x.id, x);
}

export const srsItems = (module) => [...items.values()].filter(i => SRS_KINDS.has(i.kind) && (!module || i.module === module));
export const dueItems = pool => pool.filter(i => cards.has(i.id) && isDue(cards.get(i.id)));

export async function addXp(n, anchor) {
  if (!n) return;
  const before = levelFromXp(kv.xp || 0).level;
  await set('xp', (kv.xp || 0) + n);
  await set('streak', touchStreak(kv.streak || {}));
  floatXp(n, anchor);
  const after = levelFromXp(kv.xp).level;
  if (after > before) toast(`⬆️ Level up! You're now at ${after}`);
  renderHeader();
}

// Logs an answer and, for scheduler kinds, sets the next review.
export async function recordAnswer(item, res, { srs = true } = {}) {
  if (srs && SRS_KINDS.has(item.kind)) await saveCard({ id: item.id, ...review(cards.get(item.id), res.grade) });
  await addLog({ t: Date.now(), id: item.id, m: item.module, p: item.examPart || null, ok: !!res.ok, sc: res.sc ?? +!!res.ok, tags: item.tags || [] });
}

export const xpFor = res => (res.ok ? (res.hinted ? 6 : 10) : res.sc > 0 ? 5 : 2);

// Screens register a cleanup (timers, mic, speech) that runs on the next navigation.
let cleanup = null;
export const onLeave = fn => { cleanup = fn; };
export const leave = () => { const f = cleanup; cleanup = null; f?.(); };

export function renderHeader() {
  const lv = levelFromXp(kv.xp || 0), streak = liveStreak(kv.streak || {});
  mount(document.getElementById('hstats'),
    h('span.streak', { title: `${streak}-day streak`, class: streak ? 'on' : '' }, `🔥 ${streak}`),
    h('a.lvl', { href: '#/progress', title: `${lv.into} / ${lv.need} XP to the next level` },
      h('span', `Lv ${lv.level}`), h('span.lvlbar', {}, h('i', { style: `width:${(lv.into / lv.need) * 100}%` }))));
}
