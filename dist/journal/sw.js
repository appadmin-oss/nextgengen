/* ============================================================================
   NGG Anchor Journal — service worker (scope /journal/).
   App-shell precache + offline navigation fallback. NEVER caches /api/* —
   sessions, CSRF and live data must stay fresh. CACHE_VERSION is rewritten to
   the build id by build.js so each deploy invalidates the old shell.
   ============================================================================ */

const CACHE_VERSION = 'aj-24bbcaf009';
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
  '/api-client.80cd2d66b9.js',
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
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter(k => !k.startsWith(CACHE_VERSION));
    await Promise.all(stale.map(k => caches.delete(k)));
    await self.clients.claim();
    if (stale.length > 0) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) { try { await c.navigate(c.url); } catch (_) {} }
    }
  })());
});

// Fixed-name journal bundles — always revalidated so a deploy shows immediately.
const AJ_NETWORK_FIRST = /\/journal\/(index\.html|app\.min\.js|app\.css)$/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // let CDN fonts pass through
  if (url.pathname.startsWith('/api/')) return;        // never cache live data

  // Network-first for navigations AND the fixed-name bundles; cache is the
  // offline fallback only.
  const isNav = req.mode === 'navigate';
  if (isNav || AJ_NETWORK_FIRST.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || (isNav ? caches.match('/journal/index.html').then(x => x || caches.match('/journal/')) : undefined)))
    );
    return;
  }

  // Immutable shell assets → cache-first, then network.
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
