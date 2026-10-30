// Generation step: Claude turns words from data/words.json into Collocation Forge items with definitions and Czech glosses.
// Usage: ANTHROPIC_API_KEY=... node scripts/enrich.mjs [count=30]
// Appends to data/generated.json after every batch, so an interrupted run keeps what it already paid for.
import { readFileSync, writeFileSync } from 'node:fs';
import { askClaude } from '../js/claude.js';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('Set ANTHROPIC_API_KEY first.'); process.exit(1); }

const WORDS = new URL('../data/words.json', import.meta.url);
const OUT = new URL('../data/generated.json', import.meta.url);
const count = Number(process.argv[2] || 30), BATCH = 15;

const out = JSON.parse(readFileSync(OUT, 'utf8'));
const done = new Set(out.items.map(i => `${i.word}|${i.pos}`));
// C1 academic words first, then the rest of C1, then C2.
const rank = w => (w.cefr === 'C1' ? 0 : w.cefr === 'C2' ? 2 : 1) - (w.nawl ? 0.5 : 0);
const todo = JSON.parse(readFileSync(WORDS, 'utf8'))
  .filter(w => ['noun', 'verb', 'adjective', 'adverb'].includes(w.pos) && !done.has(`${w.w}|${w.pos}`) && (w.cefr?.startsWith('C') || w.nawl))
  .sort((a, b) => rank(a) - rank(b))
  .slice(0, count);

const str = { type: 'string' };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['word', 'pos', 'definition', 'glossCs', 'target', 'prompt', 'options', 'answer', 'explanation', 'tags'],
        properties: { word: str, pos: str, definition: str, glossCs: str, target: str, prompt: str, options: { type: 'array', items: str }, answer: str, explanation: str, tags: { type: 'array', items: str } },
      },
    },
  },
};

const prompt = batch => `You write Cambridge C1 Advanced "Use of English Part 1" (multiple-choice cloze) items for a Czech professional moving from C1 to C2.
For each word below, write ONE item that tests a strong, natural collocation containing that word:
- target: the collocation, e.g. "strike a balance".
- prompt: one natural business or general sentence with the tested word replaced by "___" (exactly one gap).
- options: 4 single words: the correct one plus 3 near-miss distractors that are plausible but wrong in this collocation. Exactly one may fit.
- answer: the correct option, exactly as it appears in options and in the right form for the gap.
- explanation: one sentence on why the answer fits and the distractors do not.
- definition: a short learner-dictionary definition of the word in this sense.
- glossCs: a short Czech translation of the target collocation.
- tags: 1-3 of: collocation, idiom, phrasal-verb, preposition, register, business, academic.
Words (headword | part of speech | notes):
${batch.map(w => `${w.w} | ${w.pos}${w.note ? ` | ${w.note}` : ''}`).join('\n')}`;

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const { items } = await askClaude({ key, prompt: prompt(batch), schema: SCHEMA });
  let kept = 0;
  for (const it of items) {
    const src = batch.find(w => w.w === it.word);
    // Drop anything that would break the exercise.
    if (!src || it.options.length !== 4 || !it.options.includes(it.answer) || it.prompt.split('___').length !== 2) continue;
    out.items.push({
      id: `gen-${src.w}-${src.pos}`, word: src.w, pos: src.pos, cefr: src.cefr, target: it.target, prompt: it.prompt,
      options: it.options, answer: it.answer, explanation: it.explanation, def: it.definition, glossCs: it.glossCs,
      tags: it.tags, ...(src.ex && { examples: src.ex }), license: 'generated',
    });
    kept++;
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`batch ${i / BATCH + 1}: kept ${kept}/${batch.length}`);
}
console.log(`generated.json now has ${out.items.length} items`);
