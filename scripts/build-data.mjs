// Converts the downloaded word lists in /data-src into /data/words.json (the input for scripts/enrich.mjs).
// Usage: node scripts/build-data.mjs
// Optional: put Tatoeba's eng_sentences.tsv (id<TAB>lang<TAB>text) in /data-src to attach real example sentences.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../data-src/', import.meta.url);
const OUT = new URL('../data/words.json', import.meta.url);

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(Boolean));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const read = f => parseCsv(readFileSync(new URL(f, SRC), 'utf8'));
const POS = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', vern: 'verb' };
const pos = p => POS[p] || p;

function build() {
  const words = new Map();
  const key = (w, p) => `${w.toLowerCase()}|${p}`;

  for (const r of read('octanove-vocabulary-profile-c1c2-1.0.csv')) {
    if (!r.headword) continue;
    const k = key(r.headword, pos(r.pos));
    // Octanove lists some words twice with different senses; keep the senses as notes.
    const prev = words.get(k);
    if (prev) { if (r.notes) prev.note = [prev.note, r.notes].filter(Boolean).join('; '); continue; }
    words.set(k, { w: r.headword, pos: pos(r.pos), cefr: r.CEFR, src: 'octanove', ...(r.notes && { note: r.notes }) });
  }

  // CEFR-J only lends a level to NAWL words; its headwords look like "a.m./A.M./am/AM".
  const cefrj = new Map();
  for (const r of read('cefrj-vocabulary-profile-1.5.csv'))
    for (const w of r.headword.split('/')) cefrj.set(key(w, r.pos), r.CEFR);

  for (const r of read('NAWL_12_with_en_definitions.csv')) {
    const w = r.Meanings, p = pos(r.POS);
    if (!w) continue;
    const k = key(w, p);
    const hit = words.get(k);
    if (hit) { hit.def = r['English Definition']; hit.nawl = true; continue; }
    words.set(k, { w, pos: p, cefr: cefrj.get(k) || null, src: 'nawl', nawl: true, def: r['English Definition'] });
  }

  const list = [...words.values()];
  const tsv = new URL('eng_sentences.tsv', SRC);
  if (existsSync(tsv)) attachExamples(list, readFileSync(tsv, 'utf8'));
  list.sort((a, b) => a.w.localeCompare(b.w));
  writeFileSync(OUT, JSON.stringify(list, null, 0).replace(/},{/g, '},\n{') + '\n');
  console.log(`words.json: ${list.length} words (${list.filter(x => x.ex).length} with Tatoeba examples)`);
}

function attachExamples(list, tsv) {
  const want = new Map(list.map(x => [x.w.toLowerCase(), x]));
  for (const line of tsv.split('\n')) {
    const [id, lang, text] = line.split('\t');
    if (lang !== 'eng' || !text || text.length < 40 || text.length > 140) continue;
    for (const tok of new Set(text.toLowerCase().match(/[a-z'-]+/g))) {
      const x = want.get(tok);
      if (x && (x.ex ??= []).length < 2) x.ex.push({ text: text.trim(), source: `tatoeba:${id}` });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
