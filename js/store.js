// IndexedDB persistence, mirrored in memory: cards (SRS state per item), log (every answer), kv (everything else).
export const cards = new Map(), log = [], kv = {};
let db;

const req = r => new Promise((ok, err) => { r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); });
const os = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);

export async function init() {
  const open = indexedDB.open('c1-c2-forge', 1);
  open.onupgradeneeded = () => {
    const d = open.result;
    d.createObjectStore('cards', { keyPath: 'id' });
    d.createObjectStore('log', { autoIncrement: true });
    d.createObjectStore('kv');
  };
  db = await req(open);
  await reload();
}

async function reload() {
  cards.clear(); log.length = 0; for (const k in kv) delete kv[k];
  for (const c of await req(os('cards').getAll())) cards.set(c.id, c);
  log.push(...await req(os('log').getAll()));
  const [keys, vals] = await Promise.all([req(os('kv').getAllKeys()), req(os('kv').getAll())]);
  keys.forEach((k, i) => { kv[k] = vals[i]; });
}

export const saveCard = c => { cards.set(c.id, c); return req(os('cards', 'readwrite').put(c)); };
export const addLog = e => { log.push(e); return req(os('log', 'readwrite').add(e)); };
export const set = (k, v) => { kv[k] = v; return req(os('kv', 'readwrite').put(v, k)); };

// The Claude API key never leaves the device in an export.
export const exportAll = () => ({ app: 'c1-c2-forge', version: 1, exportedAt: new Date().toISOString(), cards: [...cards.values()], log, kv: { ...kv, settings: { ...kv.settings, key: undefined } } });

export async function importAll(data) {
  // Validate before wiping anything: a bad file must not destroy current progress.
  if (data?.app !== 'c1-c2-forge' || !Array.isArray(data.cards) || !Array.isArray(data.log) || typeof data.kv !== 'object')
    throw new Error('This is not a C1→C2 Forge progress file.');
  if (data.cards.some(c => typeof c?.id !== 'string' || !Number.isFinite(c.s) || !Number.isFinite(c.due)))
    throw new Error('The progress file has damaged cards.');
  data.kv.settings = { ...data.kv.settings, key: kv.settings?.key };
  const t = db.transaction(['cards', 'log', 'kv'], 'readwrite');
  ['cards', 'log', 'kv'].forEach(n => t.objectStore(n).clear());
  data.cards.forEach(c => t.objectStore('cards').put(c));
  data.log.forEach(e => t.objectStore('log').add(e));
  Object.entries(data.kv).forEach(([k, v]) => t.objectStore('kv').put(v, k));
  await new Promise((ok, err) => { t.oncomplete = ok; t.onerror = () => err(t.error); });
  await reload();
}

export async function wipe() {
  const t = db.transaction(['cards', 'log', 'kv'], 'readwrite');
  ['cards', 'log', 'kv'].forEach(n => t.objectStore(n).clear());
  await new Promise((ok, err) => { t.oncomplete = ok; t.onerror = () => err(t.error); });
  await reload();
}
