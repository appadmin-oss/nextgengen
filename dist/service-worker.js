/* ================================================================
   NGG — service worker.
   - Network-first for HTML AND the app's fixed-name bundles (app.min.js,
     api-client.js, outbox.js, data.js, photos.js, styles). Same name across
     deploys, so caching them first is exactly what makes "my changes aren't
     showing" happen. Online → always fresh; offline → last-good from cache.
   - Cache-first ONLY for truly immutable assets (vendored libs, fonts, images).
   - Skip /api/ entirely — auth and live data must never be cached.
   - On a new build, delete old caches AND reload open tabs so the fresh app
     runs immediately (no stale admin).
   ================================================================ */

const CACHE_VERSION = 'ngg-e0001cbc4e';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

// Fixed-name entry bundles — always revalidated against the network.
const NETWORK_FIRST = /\/(index\.html|app\.min\.js|api-client\.js|outbox\.js|data\.js|photos\.js|styles\.css|styles-app\.css)$/;

const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/styles-app.css',
  '/data.js',
  '/photos.js',
  '/api-client.js',
  '/outbox.js',
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter(k => !k.startsWith(CACHE_VERSION));
    await Promise.all(stale.map(k => caches.delete(k)));
    await self.clients.claim();
    // If this activation REPLACED a previous build (old caches existed), reload
    // every open tab so it runs the new bundle right away — this is what makes
    // a deploy actually show without the user hunting for a hard-refresh. On a
    // first-ever install there are no old caches, so nothing is disturbed.
    if (stale.length > 0) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) { try { await c.navigate(c.url); } catch (_) {} }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept /api/* — sessions, CSRF, live data
  if (url.pathname.startsWith('/api/')) return;
  // Skip cross-origin (fonts, unsplash) — let the browser handle them
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigations AND the fixed-name app bundles: always
  // try the network, fall back to cache only when offline.
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNav || NETWORK_FIRST.test(url.pathname)) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || (isNav ? caches.match('/index.html') : undefined)))
    );
    return;
  }

  // Everything else (vendored libs, fonts, images) is immutable → cache-first.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      // This branch is only reached when the cache MISSED (hit was falsy) and
      // the network then failed, so the old `() => hit` resolved with undefined
      // — which rejects the respondWith and surfaces as an opaque fetch error
      // rather than a response. Answer with a real one instead.
      new Response('', { status: 504, statusText: 'Offline and not cached' })
    ))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
