// Pure logic (no DOM) so Node can test it: node --test

// ---------- FSRS-4.5 scheduler, default weights, desired retention 0.9 ----------
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81, DAY = 864e5;
const clampD = d => Math.min(10, Math.max(1, d));
const d0 = g => clampD(W[4] - (g - 3) * W[5]);

export const retrievability = (days, s) => Math.pow(1 + FACTOR * days / s, DECAY);

// grade: 1 Again, 2 Hard, 3 Good, 4 Easy. Returns a new card; `card` may be undefined for a new item.
export function review(card, grade, now = Date.now()) {
  let s, d;
  if (!card) { s = W[grade - 1]; d = d0(grade); }
  else {
    const r = retrievability(Math.max(0, (now - card.last) / DAY), card.s);
    d = clampD(W[7] * d0(3) + (1 - W[7]) * (card.d - W[6] * (grade - 3)));
    s = grade === 1
      ? Math.min(card.s, W[11] * Math.pow(card.d, -W[12]) * (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)))
      : card.s * (1 + Math.exp(W[8]) * (11 - card.d) * Math.pow(card.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1)
        * (grade === 2 ? W[15] : 1) * (grade === 4 ? W[16] : 1));
  }
  // At retention 0.9 the interval equals stability. Lapses come back tomorrow; same-day relearning is the session re-queue.
  const days = grade === 1 ? 1 : Math.min(730, Math.max(1, Math.round(s)));
  return { s, d, last: now, due: now + days * DAY, reps: (card?.reps || 0) + 1, lapses: (card?.lapses || 0) + (grade === 1 ? 1 : 0) };
}

export const isDue = (card, now = Date.now()) => card.due <= endOfDay(now);
const endOfDay = t => { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime(); };

// ---------- answer checking ----------
export const norm = s => String(s ?? '').toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[.,!?;:"]+/g, ' ').replace(/\s+/g, ' ').trim();

export const checkText = (input, accepts) => accepts.some(a => norm(a) === norm(input));

const hasPhrase = (text, phrase) => ` ${norm(text)} `.includes(` ${norm(phrase)} `);

// Key word transformation, marked like the exam: 1 point per correct chunk, 0 if the key word is missing or >6 words.
export function transformScore(input, { key, chunks }) {
  const words = norm(input).split(' ').filter(Boolean);
  if (!words.length || words.length > 6 || !hasPhrase(input, key)) return 0;
  return chunks.filter(alts => alts.some(a => hasPhrase(input, a))).length;
}

// Dictation: word-level LCS. acc in 0..1, hit[i] says whether target word i was typed.
export function dictationScore(input, target) {
  const a = norm(target).split(' ').filter(Boolean), b = norm(input).split(' ').filter(Boolean);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = []; let i = 0, j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) { hit.push(true); i++; j++; }
    else if (j < b.length && L[i][j + 1] >= L[i + 1][j]) j++;
    else { hit.push(false); i++; }
  }
  return { acc: a.length ? L[0][0] / Math.max(a.length, b.length) : 0, hit, words: norm(target).split(' ') };
}

export const sameOrder = (seq, item) => [item.tiles, ...(item.alts || [])].some(ans => ans.length === seq.length && ans.every((t, i) => t === seq[i]));

// ---------- progress maths ----------
// shortcut: hand-tuned map from Use of English accuracy to the Cambridge Scale; recalibrate against your official sample-test scores.
const SCALE = [[0.4, 160], [0.6, 180], [0.75, 193], [0.85, 200], [1, 210]];
export function estimateScale(acc) {
  if (acc <= SCALE[0][0]) return SCALE[0][1];
  for (let i = 1; i < SCALE.length; i++) {
    const [a0, s0] = SCALE[i - 1], [a1, s1] = SCALE[i];
    if (acc <= a1) return Math.round(s0 + (acc - a0) / (a1 - a0) * (s1 - s0));
  }
  return 210;
}

// XP levels are labelled 180..210 like the Cambridge Scale.
export function levelFromXp(xp) {
  let n = 0, need = 150;
  while (n < 30 && xp >= need) { xp -= need; n++; need = 150 + 30 * n; }
  return { level: 180 + n, into: n === 30 ? need : xp, need };
}

export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function touchStreak({ streak = 0, lastDay = null }, now = Date.now()) {
  const today = dayKey(now);
  if (lastDay === today) return { streak, lastDay };
  return { streak: lastDay === dayKey(now - DAY) ? streak + 1 : 1, lastDay: today };
}

// Streak as shown: it is broken once a whole day was missed.
export const liveStreak = ({ streak = 0, lastDay = null }, now = Date.now()) =>
  lastDay === dayKey(now) || lastDay === dayKey(now - DAY) ? streak : 0;

export function weekKey(t = Date.now()) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const y = d.getFullYear(), w1 = new Date(y, 0, 4);
  return `${y}-W${String(1 + Math.round(((d - w1) / DAY - 3 + (w1.getDay() + 6) % 7) / 7)).padStart(2, '0')}`;
}

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Stable id for items authored without one (editing the prompt resets that item's progress).
export function hashId(prefix, s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return `${prefix}-${(h >>> 0).toString(36)}`;
}
