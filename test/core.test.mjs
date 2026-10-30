import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, retrievability, isDue, checkText, transformScore, dictationScore, sameOrder, estimateScale, levelFromXp, touchStreak, liveStreak, weekKey, hashId } from '../js/core.js';
import { parseCsv } from '../scripts/build-data.mjs';

const DAY = 864e5, T0 = new Date(2026, 9, 29, 10).getTime();

test('FSRS: retention is 0.9 after S days', () => {
  assert.ok(Math.abs(retrievability(5, 5) - 0.9) < 1e-9);
});

test('FSRS: better grades give longer intervals, lapses shrink stability', () => {
  const [again, hard, good, easy] = [1, 2, 3, 4].map(g => review(undefined, g, T0));
  assert.ok(again.s < hard.s && hard.s < good.s && good.s < easy.s);
  assert.equal(again.due, T0 + DAY);
  const g2 = review(good, 3, good.due);
  assert.ok(g2.s > good.s * 2, 'second Good review should grow stability a lot');
  const lapse = review(g2, 1, g2.due);
  assert.ok(lapse.s < g2.s && lapse.lapses === 1 && lapse.reps === 3);
  assert.ok(isDue(again, T0 + DAY) && !isDue(good, T0));
});

test('checkText ignores case, curly quotes and trailing punctuation', () => {
  assert.ok(checkText(' Whose. ', ['whose']));
  assert.ok(checkText('it’s', ["it's"]));
  assert.ok(!checkText('who', ['whose']));
});

test('transformScore marks 0/1/2 like the exam', () => {
  const item = { key: 'NOT', chunks: [['not only did'], ['drop', 'fall']] };
  assert.equal(transformScore('not only did sales drop', item), 2);
  assert.equal(transformScore('Not only did sales go down', item), 1);
  assert.equal(transformScore('only did sales drop', item), 0, 'key word missing');
  assert.equal(transformScore('not only did the sales really drop a lot', item), 0, 'over six words');
});

test('dictationScore aligns words and flags misses', () => {
  const r = dictationScore('the margins were squeezed', 'The margins were badly squeezed.');
  assert.deepEqual(r.hit, [true, true, true, false, true]);
  assert.equal(r.acc, 4 / 5);
  assert.equal(dictationScore('the margins were badly squeezed', 'The margins were badly squeezed.').acc, 1);
});

test('sameOrder accepts the answer or an alternative order', () => {
  const item = { tiles: ['a', 'b', 'c'], alts: [['b', 'a', 'c']] };
  assert.ok(sameOrder(['a', 'b', 'c'], item) && sameOrder(['b', 'a', 'c'], item) && !sameOrder(['c', 'b', 'a'], item));
});

test('estimateScale is monotonic across the bands', () => {
  assert.equal(estimateScale(0.2), 160);
  assert.equal(estimateScale(0.6), 180);
  assert.equal(estimateScale(0.8), 197);
  assert.equal(estimateScale(1), 210);
});

test('levelFromXp starts at 180 and caps at 210', () => {
  assert.deepEqual(levelFromXp(0), { level: 180, into: 0, need: 150 });
  assert.equal(levelFromXp(150).level, 181);
  assert.equal(levelFromXp(1e9).level, 210);
});

test('streaks grow on consecutive days and break after a gap', () => {
  let s = touchStreak({}, T0);
  assert.equal(s.streak, 1);
  assert.equal(touchStreak(s, T0 + 3600e3).streak, 1, 'same day');
  s = touchStreak(s, T0 + DAY);
  assert.equal(s.streak, 2);
  assert.equal(liveStreak(s, T0 + 3 * DAY), 0);
  assert.equal(touchStreak(s, T0 + 3 * DAY).streak, 1);
});

test('weekKey follows ISO weeks', () => {
  assert.equal(weekKey(new Date(2026, 9, 29).getTime()), '2026-W44');
  assert.equal(weekKey(new Date(2027, 0, 1).getTime()), '2026-W53');
});

test('hashId is stable', () => assert.equal(hashId('x', 'abc'), hashId('x', 'abc')));

test('parseCsv handles quotes, commas and a BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n'), [{ a: 'x, y', b: 'say "hi"' }]);
});
