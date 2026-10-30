// Offline-first: precache the app, serve from cache, refresh the cache in the background.
const CACHE = 'forge-v2';
// Keep in sync with the files the app loads (js/actions.js lists the data files).
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  ...['app', 'actions', 'core', 'store', 'ui', 'exercise', 'labs', 'modules', 'claude'].map(f => `js/${f}.js`),
  ...['collocations', 'gaps', 'wordsmith', 'transforms', 'power', 'nuance', 'register', 'reading', 'listening', 'writing', 'speaking', 'generated'].map(f => `data/${f}.json`)];

// GitHub Pages lets browsers cache files for 10 minutes; 'reload'/'no-cache' make sure we store what is actually deployed.
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    if (hit) { e.waitUntil(fresh); return hit; }
    return fresh.then(r => r || cache.match('index.html'));
  }));
});
