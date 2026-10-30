# Item schema

Each file in `data/` is one pack: `{ "module", "kind", "examPart", "items": [...] }`.
The pack values are defaults; any item can override `kind` or `examPart`.
`id` is optional — without one it is a hash of the item's text, so editing the text resets that item's progress.
`tags` feed the error log ("Top 5 mistakes") and the Power Moves badges; without tags an item gets its module's tag.
`glossCs` (optional, any kind) adds the tap-to-reveal Czech gloss.

| kind | fields | used by |
|---|---|---|
| `mc` | `prompt` (`___` marks the gap), `options`, `answer`, `explanation`, optional `text` (context) or `speak` (read aloud, text hidden) | Collocation Forge, Nuance Duel, Listening attitude |
| `gap` | `text` with gaps as `{answer|alternative}`, optional `prompt`, `hint` | Gap Hunter, Word Smith |
| `transform` | `first`, `key`, `stem` (one `___`), `chunks` (one list of accepted alternatives per mark), `answer`, `hint` | Transformer |
| `order` | `prompt`, `tiles` in the right order, optional `extra` (distractor tiles), `alts` (other right orders), `block: true` for paragraphs | Power Moves, hedging scales, Reading Part 7 |
| `rewrite` | `prompt`, `source`, `direction` (`formal`/`informal`), `model`, `keyChanges` | Register Switch |
| `dictation` | `text` | Listening Lab |
| `flash` | `back` (the phrase), optional `front`, `example`, `def`, `source` | Chunk Catcher (created in the app) |
| `passage` | `title`, `text` (paragraphs), `questions` [{`q`, `options`, `answer`, `explanation`}] | Reading Detective |
| `task` | `title`, `prompt`, `points`; writing: `type`, `words`; speaking: `prep`, `time` (seconds) | Writing Lab, Speaking Sprint |

`examPart` values: `UoE1`–`UoE4`, `R5`, `R7`, `L`, `L1`, `W`, `S2`–`S4`, or `null` for skills outside the exam format.
Run `npm test` after editing content: it checks that every item can be answered correctly.

Example (`mc`):

```json
{
  "target": "strike a balance",
  "prompt": "We need to ___ a balance between margin and volume.",
  "options": ["strike", "hit", "make", "reach"],
  "answer": "strike",
  "explanation": "Fixed collocation; 'reach a balance' is rare and sounds unnatural.",
  "glossCs": "najít rovnováhu",
  "tags": ["collocation", "business"]
}
```
