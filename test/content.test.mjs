// Checks every authored item can actually be answered correctly in the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hashId, transformScore, checkText } from '../js/core.js';

const dir = new URL('../data/', import.meta.url);
const items = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'words.json').flatMap(f => {
  const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  return p.items.map(it => {
    const x = { module: p.module, kind: p.kind, examPart: p.examPart ?? null, file: f, ...it };
    x.id ??= hashId(x.module, [x.prompt, x.text, x.first, x.title, x.source, x.speak, x.tiles?.join(' ')].filter(Boolean).join('|'));
    return x;
  });
});

test('ids are unique', () => {
  const seen = new Map();
  for (const x of items) { assert.ok(!seen.has(x.id), `${x.id} in ${x.file} duplicates ${seen.get(x.id)}`); seen.set(x.id, x.file); }
});

test('every item is answerable', () => {
  for (const x of items) {
    const where = `${x.file}: ${x.prompt || x.text || x.first || x.title}`;
    if (x.kind === 'mc') {
      assert.ok(x.options.includes(x.answer), `answer not in options — ${where}`);
      assert.equal(new Set(x.options).size, x.options.length, `duplicate options — ${where}`);
    } else if (x.kind === 'gap') {
      const gaps = [...x.text.matchAll(/\{([^}]+)\}/g)].map(m => m[1].split('|'));
      assert.ok(gaps.length, `no gap — ${where}`);
      for (const g of gaps) assert.ok(checkText(g[0], g), where);
    } else if (x.kind === 'transform') {
      assert.equal(x.stem.split('___').length, 2, `stem needs one ___ — ${where}`);
      const model = x.answer.replace(/[()]/g, '');
      assert.equal(transformScore(model, x), 2, `model answer doesn't score 2 — ${where}`);
      assert.equal(transformScore(x.chunks.map(c => c[0]).join(' '), x), 2, `first chunks don't score 2 — ${where}`);
    } else if (x.kind === 'order') {
      assert.ok(x.tiles.length >= 2, where);
    } else if (x.kind === 'rewrite') {
      assert.ok(x.source && x.model && ['formal', 'informal'].includes(x.direction), where);
    } else if (x.kind === 'dictation') {
      assert.ok(x.text.split(' ').length >= 8, where);
    } else if (x.kind === 'passage') {
      assert.ok(x.text.length >= 3, where);
      for (const q of x.questions) assert.ok(q.options.includes(q.answer), `${where}: ${q.q}`);
    } else if (x.kind === 'task') {
      assert.ok(x.title && x.prompt, where);
    } else assert.fail(`unknown kind ${x.kind} — ${where}`);
  }
});

test('the weekly boss has enough questions for every Use of English part', () => {
  for (const [part, n] of [['UoE1', 8], ['UoE2', 8], ['UoE3', 8], ['UoE4', 6]])
    assert.ok(items.filter(x => x.examPart === part).length >= n, part);
});
