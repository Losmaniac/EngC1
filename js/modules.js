export const MODULES = [
  { id: 'collocation', name: 'Collocation Forge', icon: '🔗', trains: 'UoE Part 1 · collocations & idioms', tag: 'collocation' },
  { id: 'gap', name: 'Gap Hunter', icon: '🎯', trains: 'UoE Part 2 · grammar words', tag: 'grammar-word' },
  { id: 'wordsmith', name: 'Word Smith', icon: '⚒️', trains: 'UoE Part 3 · word formation', tag: 'word-formation' },
  { id: 'transform', name: 'Transformer', icon: '🔁', trains: 'UoE Part 4 · key word transformations', tag: 'transformation' },
  { id: 'power', name: 'Power Moves', icon: '⚡', trains: 'Inversion, clefts, conditionals, hedging…', tag: 'grammar' },
  { id: 'nuance', name: 'Nuance Duel', icon: '⚔️', trains: 'Shades of meaning & hedging', tag: 'nuance' },
  { id: 'register', name: 'Register Switch', icon: '🎩', trains: 'Formal ↔ informal business English', tag: 'register' },
  { id: 'reading', name: 'Reading Detective', icon: '🔍', trains: 'Parts 5–8 · tone, implication, structure', tag: 'reading' },
  { id: 'listening', name: 'Listening Lab', icon: '🎧', trains: 'Dictation & speaker attitude', tag: 'listening' },
  { id: 'writing', name: 'Writing Lab', icon: '✍️', trains: 'Essay, email, report, proposal, review', tag: 'writing' },
  { id: 'speaking', name: 'Speaking Sprint', icon: '🎙️', trains: 'Long turn & discussion', tag: 'speaking' },
  { id: 'chunk', name: 'Chunk Catcher', icon: '🧲', trains: 'Your own phrases from real input', tag: 'chunk' },
];
export const MOD = Object.fromEntries(MODULES.map(m => [m.id, m]));

export const PARTS = {
  UoE1: 'UoE 1 · Multiple-choice cloze', UoE2: 'UoE 2 · Open cloze', UoE3: 'UoE 3 · Word formation', UoE4: 'UoE 4 · Transformations',
  R5: 'Reading 5 · Detail & tone', R7: 'Reading 7 · Gapped text', L: 'Listening · Dictation', L1: 'Listening 1 · Attitude',
  W: 'Writing', S2: 'Speaking 2 · Long turn', S3: 'Speaking 3 · Discussion', S4: 'Speaking 4 · Opinion',
};

// Kinds the spaced-repetition scheduler can run inside a daily session.
export const SRS_KINDS = new Set(['mc', 'gap', 'transform', 'order', 'rewrite', 'flash', 'dictation']);

// Power Moves structures that earn a badge once mastered.
export const STRUCTURES = {
  inversion: 'Inversion', cleft: 'Cleft sentences', 'mixed-conditional': 'Mixed conditionals', passive: 'Advanced passives',
  participle: 'Participle clauses', nominalisation: 'Nominalisation', hedging: 'Hedging', ellipsis: 'Ellipsis', subjunctive: 'Subjunctive',
};
