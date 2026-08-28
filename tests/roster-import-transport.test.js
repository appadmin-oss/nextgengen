#!/usr/bin/env node
/* ============================================================================
   How the roster gets to the server.

   The import posts the whole roster — 136 members is ~110KB of names, dates of
   birth, home addresses and guardians' phone numbers, and the importer's own
   ceiling is 2000 rows, ~1.6MB. Sent as a JSON request BODY that is past
   mod_security's SecRequestBodyNoFilesLimit (131072 bytes, Reject by default),
   so a stock cPanel host answers **406 Not Acceptable** itself and PHP never
   sees the request. On the shared host this drawer exists for — no SSH, so the
   drawer is the only way in — the import simply stopped working as the roster
   grew, and all the UI could say about it was `http_406`.

   So the bytes travel as a multipart file part, which is bounded by a far
   larger limit and is not scanned as a request argument. This suite is that
   decision, pinned:

     · the file goes as a file, and the bytes on the wire are the bytes on disk
     · a refusal from something that is not this application falls back to the
       old JSON body, so a host where multipart is the problem still works
     · a refusal that IS this application (roster_changed, forbidden) is never
       retried — retrying an apply the server just refused is the one thing
       this must not do
     · when both doors are shut, the operator is told what shut them

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
const BYTES = Buffer.from(JSON.stringify(ROSTER, null, 2) + '\n', 'utf8');
/* What the drawer holds after reading the file: the parsed roster for the
   counts it shows, and the raw bytes, which are what actually travel. */
const fileState = () => ({
  source: ROSTER.source,
  members: ROSTER.members,
  warnings: [],
  fileSha: 'a'.repeat(64),
  raw: BYTES.buffer.slice(BYTES.byteOffset, BYTES.byteOffset + BYTES.byteLength),
  bytes: BYTES.length,
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
    chk('the dry run is one request, to the members endpoint',
      fetchImpl.calls.length === 1 && /\/api\/admin\/members\.php$/.test(call.url));
    chk('…carrying a multipart form, not a JSON body',
      call.body instanceof FormData);
    chk('…with no Content-Type of ours, so fetch can set the boundary',
      !call.headers['Content-Type']);
    chk('…and the CSRF header the write gate requires',
      call.headers['X-NGG-CSRF'] === 'csrf-token-123');
    chk('the server is told which action this is, since a form body has no JSON',
      call.body.get('action') === 'import');

    const part = call.body.get('roster');
    chk('the roster is a file part, named after the workbook',
      part && typeof part.text === 'function' && part.name === 'NGG_Members.xlsx');
    /* The bytes must be the bytes on disk. Re-serialising them here would break
       the file hash the server now computes from what it received — and the
       whole point of a file part is that it is the file. */
    chk('…and the bytes on the wire are the bytes that were on disk',
      Buffer.from(await part.arrayBuffer()).equals(BYTES));
    chk('a dry run says so in a way text cannot fumble',
      call.body.get('apply') === '0' && call.body.get('overwrite') === '0');
    chk('…and nothing pretends to a digest it has not been given',
      call.body.get('expectDigest') === null);
    chk('the report comes back to the caller unchanged', res.created === 2 && res.digest === OK.digest);
  }

  // ── An apply ──
  {
    const fetchImpl = stubFetch([reply(200, Object.assign({ ok: true }, OK, { applied: true }))]);
    const api = loadClient(fetchImpl);
    await api.admin.members.importRoster(fileState(),
      { apply: true, overwrite: true, expectDigest: 'd'.repeat(64) });
    const fd = fetchImpl.calls[0].body;
    chk('an apply carries apply, overwrite and the digest of its own dry run',
      fd.get('apply') === '1' && fd.get('overwrite') === '1' && fd.get('expectDigest') === 'd'.repeat(64));
  }

  // ── The 406 this suite exists for, on the other door ──
  {
    const fetchImpl = stubFetch([wafRefusal(406), reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    const res = await api.admin.members.importRoster(fileState(), { apply: false });

    chk('a 406 from something that is not this application is retried, not surfaced',
      fetchImpl.calls.length === 2 && res.created === 2);
    const second = fetchImpl.calls[1];
    chk('…over the JSON body, which is the only other door',
      typeof second.body === 'string' && second.headers['Content-Type'] === 'application/json');
    chk('…carrying the same roster, so the retry is the same import',
      JSON.parse(second.body).members.length === 2
      && JSON.parse(second.body).action === 'import');
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

  // ── A host with file uploads switched off ──
  {
    const fetchImpl = stubFetch([reply(400, { ok: false, error: 'no_roster_file' }),
                                 reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    const res = await api.admin.members.importRoster(fileState(), { apply: false });
    chk('a host that accepts no uploads at all falls back too',
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

  // ── An older caller with no bytes ──
  {
    const fetchImpl = stubFetch([reply(200, Object.assign({ ok: true }, OK))]);
    const api = loadClient(fetchImpl);
    await api.admin.members.importRoster({ source: 'x.json', members: ROSTER.members }, { apply: false });
    chk('a caller holding no raw bytes still imports, over the body',
      typeof fetchImpl.calls[0].body === 'string'
      && JSON.parse(fetchImpl.calls[0].body).members.length === 2);
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (roster import transport)');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
