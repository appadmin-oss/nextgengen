#!/usr/bin/env node
/* ============================================================================
   How the roster gets to the server.

   The import was refused with **406 Not Acceptable** — by the host's firewall,
   not by this application, which sends no 406 anywhere. Measured against the
   live site with unauthenticated posts (PHP answers those at the CSRF gate, so
   `csrf_failed` means the request got through):

     6.5KB of roster JSON, ~90 values          →  reached PHP
      55KB of roster JSON, 3201 values         →  406
     322KB in 161 values                       →  reached PHP
     multipart, any file part, even ~200 bytes  →  406
     whole roster as ONE string value, 736KB    →  reached PHP

   It counts the VALUES in a JSON body. A 136-member roster posted as an array
   of objects is around 3000 of them, so it was always going to hit that wall
   and did as the roster grew; and posting the file as an upload instead — the
   obvious fix — is refused outright on the same host. So the roster travels as
   one value: `rosterJson`, the text of the file. This suite is that decision,
   pinned:

     · the roster goes as ONE value, carrying the file's text unaltered
     · a refusal from something that is not this application falls back to the
       old array-of-objects shape, so a server that predates this still works
     · a refusal that IS this application (roster_changed, forbidden) is never
       retried — retrying an apply the server just refused is the one thing
       this must not do
     · when both shapes are refused, the operator is told what refused them

   No browser and no server: the real api-client.js runs against a stub fetch,
   which is what makes the request itself assertable.

   Run:  node tests/roster-import-transport.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'api-client.js');

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

/* The client is a browser IIFE ending in `})(window)`. Handing it the globals
   it needs as arguments loads the real file with nothing stubbed inside it. */
function loadClient(fetchImpl) {
  const src = fs.readFileSync(SRC, 'utf8');
  const win = { crypto: {} };
  const doc = { cookie: 'ngg_csrf=csrf-token-123' };
  const load = new Function('window', 'document', 'navigator', 'fetch',
    'XMLHttpRequest', 'CustomEvent', src);
  load(win, doc, {}, fetchImpl, function () {}, function () {});
  return win.NGGApi;
}

/** A reply, shaped the way `request()` reads one. */
const reply = (status, data) => ({
  ok: status >= 200 && status < 300,
  status: status,
  json: async () => { if (data === undefined) throw new Error('not json'); return data; },
});

/* What a WAF sends: an HTML page, so `res.json()` throws and no error code of
   ours ever reaches the caller. That absence is the whole signal. */
const wafRefusal = (status) => reply(status, undefined);

/** Records every call and answers from a script of replies. */
function stubFetch(replies) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: url, init: init, body: init.body, headers: init.headers });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return typeof r === 'function' ? r(calls.length) : r;
  };
  fn.calls = calls;
  return fn;
}

const ROSTER = {
  source: 'NGG_Members.xlsx',
  extractedAt: '2026-08-01T09:00:00Z',
  members: [
    { displayId: '024-000', fullName: 'Example Member', status: 'active', centre: 'Egbeda' },
    { displayId: '024-001', fullName: 'Second Example', status: 'inactive', centre: 'Ayobo' },
  ],
};
const TEXT = JSON.stringify(ROSTER, null, 2) + '\n';
/* What the drawer holds after reading the file: the parsed roster for the counts
   it shows, and the file's text, which is what actually travels. */
const fileState = () => ({
  source: ROSTER.source,
  members: ROSTER.members,
  warnings: [],
  fileSha: 'a'.repeat(64),
  text: TEXT,
  bytes: Buffer.byteLength(TEXT),
});

const OK = { applied: false, created: 2, updated: 0, unchanged: 0, failed: 0,
             digest: 'd'.repeat(64), rows: [] };

(async () => {
  // ── The file goes as a file ──
  {
    const fetchImpl = stubFetch([reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    const res = await api.admin.members.importRoster(fileState(), { apply: false, overwrite: false });

    const call = fetchImpl.calls[0];
    const sent = JSON.parse(call.body);
    chk('the dry run is one request, to the members endpoint',
      fetchImpl.calls.length === 1 && /\/api\/admin\/members\.php$/.test(call.url));
    chk('…and the CSRF header the write gate requires',
      call.headers['X-NGG-CSRF'] === 'csrf-token-123');
    /* The whole point. Counting the values the way the firewall does: an object
       per member is thousands of them, the file as one string is one. */
    chk('the roster is ONE value, not one object per member',
      typeof sent.rosterJson === 'string' && sent.members === undefined);
    chk('…and it is the file\'s own text, unaltered',
      sent.rosterJson === TEXT);
    /* Re-serialising the roster here would break the file hash the server now
       computes from what it received, and lose whatever the extractor wrote. */
    chk('…so what the server parses is what the extractor produced',
      JSON.parse(sent.rosterJson).members.length === 2
      && JSON.parse(sent.rosterJson).source === 'NGG_Members.xlsx');
    chk('a dry run says so, as a real boolean rather than a string',
      sent.apply === false && sent.overwrite === false);
    chk('…and nothing pretends to a digest it has not been given', !sent.expectDigest);
    chk('the report comes back to the caller unchanged', res.created === 2 && res.digest === OK.digest);
  }

  // ── An apply ──
  {
    const fetchImpl = stubFetch([reply(200, Object.assign({ ok: true }, OK, { applied: true }))]);
    const api = loadClient(fetchImpl);
    await api.admin.members.importRoster(fileState(),
      { apply: true, overwrite: true, expectDigest: 'd'.repeat(64) });
    const sent = JSON.parse(fetchImpl.calls[0].body);
    chk('an apply carries apply, overwrite and the digest of its own dry run',
      sent.apply === true && sent.overwrite === true && sent.expectDigest === 'd'.repeat(64));
    chk('…and the same one value, so it is the same file the dry run read',
      sent.rosterJson === TEXT);
  }

  // ── The 406 this suite exists for, on the other door ──
  {
    const fetchImpl = stubFetch([wafRefusal(406), reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    const res = await api.admin.members.importRoster(fileState(), { apply: false });

    chk('a 406 from something that is not this application is retried, not surfaced',
      fetchImpl.calls.length === 2 && res.created === 2);
    const second = JSON.parse(fetchImpl.calls[1].body);
    chk('…over the older array-of-objects shape, which is the only other door',
      Array.isArray(second.members) && second.rosterJson === undefined);
    chk('…carrying the same roster, so the retry is the same import',
      second.members.length === 2 && second.action === 'import');
  }

  // ── Both doors shut ──
  {
    const fetchImpl = stubFetch([wafRefusal(406), wafRefusal(406)]);
    const api = loadClient(fetchImpl);
    let caught = null;
    try { await api.admin.members.importRoster(fileState(), { apply: false }); }
    catch (e) { caught = e; }
    chk('when both are refused it gives up rather than looping',
      fetchImpl.calls.length === 2 && !!caught);
    /* The bug this replaces: a red toast reading `http_406`, about a request the
       application never received, on the one screen that cannot be worked
       around because the host has no shell. */
    chk('…and says what refused it, and the two ways past it',
      caught.code === 'blocked_upstream'
      && /mod_security/.test(caught.detail) && /seed-members\.php/.test(caught.detail));
  }

  // ── A server that predates this shape ──
  {
    /* An older PHP finds no `members` in a body that only carries `rosterJson`,
       and says so. That is a signal to use the shape it does understand, not a
       failure to report. */
    const fetchImpl = stubFetch([reply(400, { ok: false, error: 'no_members_array' }),
                                 reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    const res = await api.admin.members.importRoster(fileState(), { apply: false });
    chk('a server too old to know the one-value shape falls back too',
      fetchImpl.calls.length === 2 && res.created === 2);
  }

  // ── A refusal that IS this application ──
  {
    const fetchImpl = stubFetch([reply(400, { ok: false, error: 'roster_changed',
      detail: 'This is not the file you previewed.' })]);
    const api = loadClient(fetchImpl);
    let caught = null;
    try {
      await api.admin.members.importRoster(fileState(), { apply: true, expectDigest: 'x'.repeat(64) });
    } catch (e) { caught = e; }
    /* Retrying here would re-post an apply the server has just refused. The
       reply carried one of our codes, which is how we know PHP answered. */
    chk('an apply the server refused is not tried again through the other door',
      fetchImpl.calls.length === 1);
    chk('…and its reason reaches the drawer intact',
      caught && caught.code === 'roster_changed' && /previewed/.test(caught.detail || ''));
  }

  {
    const fetchImpl = stubFetch([reply(403, { ok: false, error: 'forbidden',
      detail: 'Applying a roster import needs super-admin access.' })]);
    const api = loadClient(fetchImpl);
    let caught = null;
    try { await api.admin.members.importRoster(fileState(), { apply: true }); } catch (e) { caught = e; }
    chk('a refusal on capability is one request and one message, not a retry',
      fetchImpl.calls.length === 1 && caught.code === 'forbidden'
      && /super-admin/.test(caught.detail || ''));
  }

  // ── A timeout is not a closed door ──
  {
    const fetchImpl = stubFetch([() => { throw Object.assign(new Error('boom'), { name: 'AbortError' }); }]);
    const api = loadClient(fetchImpl);
    let caught = null;
    try { await api.admin.members.importRoster(fileState(), { apply: false }); } catch (e) { caught = e; }
    /* The request may well have reached the server and be running there. Sending
       the same roster a second time is exactly what must not happen. */
    chk('a request that never got an answer is not resent',
      fetchImpl.calls.length === 1 && caught && caught.status === 0);
  }

  // ── An older caller with no file text ──
  {
    const fetchImpl = stubFetch([reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    await api.admin.members.importRoster({ source: 'x.json', members: ROSTER.members }, { apply: false });
    chk('a caller holding no file text still imports, over the older shape',
      Array.isArray(JSON.parse(fetchImpl.calls[0].body).members));
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (roster import transport)');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
