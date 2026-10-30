# C1→C2 Forge

An offline-first PWA that pushes a working C1 English user toward C2 by drilling the skills Cambridge C1 Advanced tests:
collocations, open cloze, word formation, key word transformations, advanced grammar, nuance, register, reading, listening, writing and speaking.
Short daily sessions use spaced repetition (FSRS), with XP, streaks, a weekly boss battle, badges and an estimated Cambridge Scale score.

Vanilla HTML/CSS/JS, no build step, no dependencies.

## Run it

```bash
python -m http.server 8080
```

Then open http://localhost:8080. (It must be served over http, not opened as a file.)

## Deploy to GitHub Pages

Push this folder to a GitHub repository, then go to Settings → Pages → Deploy from branch → `main` / root.
The app uses relative paths, so it works under `https://<user>.github.io/<repo>/`.

The service worker serves the cached copy first and refreshes it in the background, so a new version shows up on the second load after a deploy.
If you add or rename files, update the list in `sw.js` and bump `CACHE`.

## Data

| Command | What it does |
|---|---|
| `npm run data` | Converts the word lists in `data-src/` (Octanove C1/C2, CEFR-J, NAWL) into `data/words.json`. Put Tatoeba's `eng_sentences.tsv` in `data-src/` to attach real example sentences. |
| `ANTHROPIC_API_KEY=… npm run enrich -- 30` | Has Claude turn the next 30 words into Collocation Forge items (definition, Czech gloss, distractors) and appends them to `data/generated.json`. In PowerShell: `$env:ANTHROPIC_API_KEY="…"; npm run enrich -- 30`. |
| `npm run icons` | Redraws the app icons. |
| `npm test` | Unit tests for the scheduler and marking, plus a check that every content item can be answered correctly. |

The hand-written exercises live in `data/*.json`; the format is in [SCHEMA.md](SCHEMA.md).

## Privacy

All progress stays in the browser (IndexedDB). Export/import a JSON backup in Settings.
The optional Claude API key for writing feedback is stored only on the device and never included in exports — keep it personal and give it a low spending limit.

## Licences

Word lists: Octanove Vocabulary Profile (CC BY-SA 4.0), CEFR-J Wordlist 1.5 (free with citation, © Tono Laboratory, TUFS), New Academic Word List 1.2 (CC BY-SA 4.0).
The exercises are original and shared under CC BY-SA 4.0. Cambridge, Oxford, BBC, British Council and Linguapress materials are linked, never copied.
