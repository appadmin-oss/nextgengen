/* ============================================================================
   NGG Anchor Journal — service worker (scope /journal/).
   App-shell precache + offline navigation fallback. NEVER caches /api/* —
   sessions, CSRF and live data must stay fresh. CACHE_VERSION is rewritten to
   the build id by build.js so each deploy invalidates the old shell.
   ============================================================================ */

const CACHE_VERSION = 'aj-4f916e16fa';
const SHELL = CACHE_VERSION + '-shell';

const PRECACHE = [
  '/journal/',
  '/journal/index.html',
  '/journal/app.css',
  '/journal/app.min.js',
  '/journal/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/maskable-512.png',
  '/assets/icons/apple-touch-180.png',
  '/journal/vendor/phosphor/phosphor.css',
  '/journal/vendor/phosphor/Phosphor-Fill.woff2',
  '/journal/vendor/phosphor/Phosphor-Bold.woff2',
  '/assets/fonts/fonts.css',
  '/assets/fonts/bricolage-grotesque-latin-600-normal.woff2',
  '/assets/fonts/bricolage-grotesque-latin-700-normal.woff2',
  '/assets/fonts/bricolage-grotesque-latin-800-normal.woff2',
  '/assets/fonts/space-grotesk-latin-400-normal.woff2',
  '/assets/fonts/space-grotesk-latin-500-normal.woff2',
  '/assets/fonts/space-grotesk-latin-600-normal.woff2',
  '/assets/fonts/space-grotesk-latin-700-normal.woff2',
  '/assets/fonts/space-mono-latin-400-normal.woff2',
  '/assets/fonts/space-mono-latin-700-normal.woff2',
  '/vendor/react.production.min.js',
  '/vendor/react-dom.production.min.js',
  '/api-client.js',
  '/assets/logo.png',
  '/assets/seasonal-icon.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => {/* offline-tolerant install */})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // let CDN fonts pass through
  if (url.pathname.startsWith('/api/')) return;        // never cache live data

  // Navigations → network-first, fall back to the cached app shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/journal/index.html').then(r => r || caches.match('/journal/'))));
    return;
  }

  // Shell assets → cache-first, then network (and cache the result).
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
