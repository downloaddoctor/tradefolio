const CACHE = 'tp-v1';
const LOCAL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './src/js/main.js',
  './src/js/app.js',
  './src/js/format.js',
  './src/js/parse.js',
  './src/js/compute.js',
  './src/js/db.js',
  './src/js/columns.js',
  './src/js/sample.js',
  './src/js/chart.js',
  './src/js/market.js',
  './src/js/components.js',
  './src/css/style.css'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/dexie@4.0.8/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js',
  'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'
];

const cacheable = (res) => res && (res.ok || res.type === 'opaque');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all([
        ...LOCAL.map((u) => c.add(u).catch(() => null)),
        ...CDN.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => (cacheable(r) ? c.put(u, r) : null)).catch(() => null))
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  const u = new URL(req.url);
  const same = u.origin === location.origin;
  if (!same && !CDN.includes(req.url)) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: same }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (cacheable(res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
