/* ================================================================
   NGG — service worker.
   - Network-first for HTML (so deploys go live without forced refresh)
   - Cache-first for hashable assets (CSS, JS, fonts, images)
   - Skip /api/ entirely — auth and live data must never be cached
   - Bumping CACHE_VERSION invalidates everything on next visit
   ================================================================ */

const CACHE_VERSION = 'ngg-d014a0ecb5';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/styles-app.css',
  '/data.js',
  '/photos.js',
  '/api-client.js',
  '/app.min.js',
  '/vendor/react.production.min.js',
  '/vendor/react-dom.production.min.js',
  '/assets/logo.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => {/* offline-tolerant install */})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept /api/* — sessions, CSRF, live data
  if (url.pathname.startsWith('/api/')) return;
  // Skip cross-origin (fonts, unsplash) — let the browser handle them
  if (url.origin !== self.location.origin) return;

  // HTML: network-first, fall back to cache when offline
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Hashable assets: cache-first, then network
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      // Only cache successful responses
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
