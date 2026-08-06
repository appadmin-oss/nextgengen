/* ================================================================
   NGG — service worker.

   Freshness rests on FILENAMES, not on this worker being clever. build.js ships
   the entry files under a name containing a hash of their own contents
   (app.<hash>.min.js, styles.<hash>.css…) and index.html — the only thing served
   no-cache — points at the current set. So:

   - A cache hit on a hashed name is BY DEFINITION the right bytes: the name says
     which bytes it is. Cache-first, forever, no revalidation.
   - HTML navigations are network-first, because that is where the current asset
     names come from. Offline, they fall back to the cached shell.
   - The plain fixed names still ship for anything that hard-codes them; they are
     network-first too, since a fixed name whose contents change is exactly the
     thing that must not be cached.
   - /api/ is never touched. Auth, CSRF and live data are not cacheable.
   - On a new build the old caches are deleted and open tabs are reloaded, so a
     deploy shows up without anybody hunting for a hard refresh.
   ================================================================ */

const CACHE_VERSION = 'ngg-9b1de68302';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

/* Fixed-name entry bundles — always revalidated against the network. The
   fingerprinted copies are deliberately NOT in here: their whole point is that
   they never need revalidating. */
const NETWORK_FIRST = /\/(index\.html|app\.min\.js|api-client\.js|outbox\.js|data\.js|photos\.js|styles\.css|styles-app\.css)$/;

/* A name carrying a 10-hex content tag: app.4f2a1b9c33.min.js, styles.<tag>.css.
   Immutable by construction — a different build is a different URL. */
const FINGERPRINTED = /\.[0-9a-f]{10}\.(?:min\.)?(?:js|css)$/;

/* build.js rewrites these to the fingerprinted names at deploy time, so the
   shell a first visit precaches is the shell it will actually run. */
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.fbe3e529ae.css',
  '/styles-app.cb210d1d5a.css',
  '/data.29d3739700.js',
  '/photos.fffb7d55bb.js',
  '/api-client.6a9e92bf67.js',
  '/outbox.042a8c9122.js',
  '/app.9181079f5d.min.js',
  '/vendor/react.production.min.js',
  '/vendor/react-dom.production.min.js',
  '/assets/logo.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    /* One request at a time, and failures tolerated INDIVIDUALLY.
     *
     * cache.addAll() is a single promise over the whole list, so one entry that
     * 404s rejects it and nothing at all gets cached — with the rejection
     * swallowed by an offline-tolerant catch, leaving a worker that is installed,
     * active, and holding an empty cache. The first offline navigation then had
     * no shell to fall back to and answered 504 "Offline and not cached" on a
     * URL that was perfectly ordinary. A renamed asset, a trimmed vendor file or
     * a host that 403s one path was enough to do it, which is why it looked
     * random. */
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (_) { /* this one entry is simply not cached */ }
    }));
    await self.skipWaiting();
  })());
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

/** The app shell, for an offline navigation to any route. */
async function shellResponse() {
  // ignoreSearch, because every route that matters carries a query string —
  // /review?g=…, /apply?g=…, /q/<token>. Matching the request URL exactly could
  // only ever hit for a URL somebody had visited before, offline, twice; the
  // shell is the same document for all of them.
  return (await caches.match('/index.html', { ignoreSearch: true }))
      || (await caches.match('/', { ignoreSearch: true }));
}

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · NGG</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;color:#eef2fb;
font:400 16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{margin:0;color:rgba(230,238,255,.7);max-width:32ch}
button{margin-top:20px;padding:12px 22px;border:0;border-radius:12px;background:#ffce54;color:#2b2100;font:700 15px inherit;cursor:pointer}</style>
<h1>You're offline</h1><p>This page hasn't been opened on this device before, so there's no copy saved here yet. Anything you'd already filled in is safe.</p>
<button onclick="location.reload()">Try again</button>`;

/* A SLOW server is not an offline browser, and answering as though it were is
 * how a struggling deploy becomes a dead site.
 *
 * `fetch()` here had no ceiling, so when the origin stopped answering — a deploy
 * replaying schema, a full PHP-FPM pool, anything — every navigation sat pending
 * for minutes and then reported "Offline and not cached" while a perfectly good
 * shell sat in the cache the whole time. The browser's own network panel showed
 * it plainly: 28 requests, 1.7 kB transferred, five minutes to finish.
 *
 * So the network gets a deadline, and missing it is treated exactly like being
 * offline: serve what we have. The deadline is generous enough that a slow phone
 * on a slow link still wins the race, and short enough that a stuck origin does
 * not hold the screen hostage. Only for documents and fixed-name bundles — /api/
 * is never intercepted, so live data keeps whatever timeout the client sets. */
const SW_NET_TIMEOUT_MS = 9000;

/* The status line is the only diagnostic that reaches somebody's network panel
 * on a phone, and "Offline and not cached" sent everybody hunting a connection
 * problem while the origin was the thing that was stuck. Name which happened. */
function swWhy(err) {
  return (err && err.message === 'sw_network_timeout')
    ? 'Server did not answer in time'
    : 'Offline and not cached';
}

function fetchWithin(req, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('sw_network_timeout'));
    }, ms);
    fetch(req).then(
      (res) => { if (settled) return; settled = true; clearTimeout(timer); resolve(res); },
      (err) => { if (settled) return; settled = true; clearTimeout(timer); reject(err); },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept /api/* — sessions, CSRF, live data
  if (url.pathname.startsWith('/api/')) return;
  // Skip cross-origin (fonts, unsplash) — let the browser handle them
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  /* Fingerprinted assets: cache-first and never revalidated. The name is a
     content hash, so a hit cannot be stale, and a miss is a file this browser
     has genuinely never seen. Checked BEFORE the network-first rule so a hashed
     app.<tag>.min.js is not caught by the plain-name pattern. */
  if (!isNav && FINGERPRINTED.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetchWithin(req, SW_NET_TIMEOUT_MS);
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: swWhy(e) });
      }
    })());
    return;
  }

  // Network-first for HTML navigations AND the fixed-name bundles: always
  // try the network, fall back to cache only when offline.
  if (isNav || NETWORK_FIRST.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const res = await fetchWithin(req, SW_NET_TIMEOUT_MS);
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        }
        return res;
      } catch (e) {
        const hit = await caches.match(req, { ignoreSearch: isNav });
        if (hit) return hit;
        if (!isNav) return new Response('', { status: 504, statusText: swWhy(e) });
        /* A navigation ALWAYS gets a document. Falling through to a 504 here
           renders the browser's own "site can't be reached" page over a working
           offline app, and it did so for any route the shell had not been cached
           under — which, with the precache silently empty, was all of them.
           A last-resort inline page is still an answer somebody can read. */
        return (await shellResponse())
            || new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
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
    }).catch((e) =>
      // This branch is only reached when the cache MISSED (hit was falsy) and
      // the network then failed, so the old `() => hit` resolved with undefined
      // — which rejects the respondWith and surfaces as an opaque fetch error
      // rather than a response. Answer with a real one instead.
      new Response('', { status: 504, statusText: swWhy(e) })
    ))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
