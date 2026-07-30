/* ================================================================
   NGG — intake outbox.

   Persist a submission BEFORE trying to send it, then keep trying until the
   server has actually accepted it.

   Why this exists
   ---------------
   Every intake form used to save a *draft* to localStorage and lose the
   *submission* the moment a send failed. The copy said "nothing you typed has
   been lost", which was true of the typing and false of the thing the family
   had just spent ten minutes on: the send itself was gone, and the only
   recovery was to press the button again and hope.

   That is the wrong shape for the conditions these forms are filled in under —
   a phone on a mobile connection at the back of a hall, a field desk on a
   tethered hotspot. So a submission is written to storage first and only
   removed once the server has confirmed it. A dead battery, a closed tab, a
   crashed browser or a sixty-second timeout no longer costs anybody a re-type.

   The requirement was "save offline even when online", and that is the design:
   this does NOT wait for navigator.onLine to be false. Every submission is
   banked, every time, because the failure that actually loses work is not the
   obvious offline case — it is the request that looks fine and then times out.

   Retry safety
   ------------
   Retrying a registration is only safe because the server is idempotent: each
   entry carries a submissionId minted once when the form was opened, and
   api/_lib/util.php intake_once() replays the original result rather than
   registering a second child. Never retry a payload without one.

   What is NOT retried
   -------------------
   A refusal is not a network fault. A 4xx with a named code — a validation
   error, a revoked gate, a rejected photo — means the server considered the
   submission and said no; retrying it will produce the same no for ever, and
   the queue would never drain. Those dequeue and surface to the caller. Only
   "we never got an answer" retries: status 0, network, timeout, 5xx, 429.
   The kiosk queue learned this the hard way (see page-admin.jsx) — a silently
   dropped scan left a desk believing somebody was checked in who was not.

   Storage
   -------
   IndexedDB when available, localStorage otherwise. Registration payloads
   carry a base64 photo, and localStorage's ~5MB ceiling is a real limit that a
   couple of queued registrations can genuinely hit.

   API
   ---
     outbox.submissionId(formKey)   → stable id for this form fill (minted once)
     outbox.resetSubmissionId(k)    → new id; call after a SUCCESSFUL send
     outbox.send(op, payload, opts) → bank, then attempt. Resolves with the
                                      server result, or rejects with a refusal.
     outbox.flush()                 → drain everything queued
     outbox.pending(op)             → how many are waiting
     outbox.subscribe(fn)           → called whenever the queue moves
   ================================================================ */
(function (global) {
  'use strict';

  var LS_KEY = 'ngg_outbox_v1';
  var SID_KEY = 'ngg_outbox_sid_v1';
  var DB_NAME = 'ngg-outbox';
  var STORE = 'queue';
  // 2s, 4s, 8s, 16s, then every 30s. Long enough to ride out a lift or a
  // tunnel, short enough that a family watching the screen sees it resolve.
  var BACKOFF = [2000, 4000, 8000, 16000];
  var MAX_BACKOFF = 30000;

  var listeners = [];
  var timer = null;
  var draining = false;

  function uid() {
    try {
      if (global.crypto && global.crypto.randomUUID) return 'sub_' + global.crypto.randomUUID().replace(/-/g, '');
      if (global.crypto && global.crypto.getRandomValues) {
        var a = new Uint8Array(16);
        global.crypto.getRandomValues(a);
        return 'sub_' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      }
    } catch (_) {}
    return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  /* ── storage ───────────────────────────────────────────────────────────── */

  function idb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('no-idb'));
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb-open')); };
    });
  }

  function lsRead() {
    try { return JSON.parse(global.localStorage.getItem(LS_KEY)) || []; } catch (_) { return []; }
  }
  function lsWrite(rows) {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(rows)); return true; }
    catch (_) { return false; }   // quota — caller decides what to tell the user
  }

  function readAll() {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).getAll();
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { reject(rq.error); };
      });
    }).catch(function () { return lsRead(); });
  }

  function put(row) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () {
      var rows = lsRead();
      var i = rows.findIndex(function (r) { return r.id === row.id; });
      if (i >= 0) rows[i] = row; else rows.push(row);
      return lsWrite(rows);
    });
  }

  function drop(id) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () {
      return lsWrite(lsRead().filter(function (r) { return r.id !== id; }));
    });
  }

  /* ── submission ids ────────────────────────────────────────────────────── */

  function sidMap() {
    try { return JSON.parse(global.localStorage.getItem(SID_KEY)) || {}; } catch (_) { return {}; }
  }
  function sidSave(m) { try { global.localStorage.setItem(SID_KEY, JSON.stringify(m)); } catch (_) {} }

  /* One id per form fill, stable across retries AND across a page reload —
     which is the case that matters: reloading after a timeout and pressing
     send again must replay, not register a second child. */
  function submissionId(formKey) {
    var m = sidMap();
    if (!m[formKey]) { m[formKey] = uid(); sidSave(m); }
    return m[formKey];
  }
  function resetSubmissionId(formKey) {
    var m = sidMap();
    delete m[formKey];
    sidSave(m);
  }

  /* ── classification ────────────────────────────────────────────────────── */

  /* Retry only when we cannot know whether the server acted. A named refusal
     is an answer, and re-sending an answer just fills the queue for ever. */
  function isRetryable(err) {
    if (!err) return false;
    if (err.status === 0 || err.status === 429) return true;
    if (err.status >= 500) return true;
    var c = String(err.code || err.message || '');
    if (/^(network|timeout)$/.test(c)) return true;
    // A 4xx with a code is the server declining on purpose.
    if (err.status >= 400 && err.status < 500) return false;
    return /network|failed to fetch|load failed/i.test(c);
  }

  function notify() {
    readAll().then(function (rows) {
      listeners.forEach(function (fn) { try { fn(rows); } catch (_) {} });
    });
  }

  /* ── sending ───────────────────────────────────────────────────────────── */

  function attempt(row) {
    var api = global.NGGApi;
    var fn = api && api.__outboxOps && api.__outboxOps[row.op];
    if (!fn) return Promise.reject(new Error('outbox: unknown op ' + row.op));
    return fn(row.payload);
  }

  /**
   * Bank the submission, then try to send it.
   *
   * Resolves with the server's result on success. Rejects with the server's
   * refusal (so the form can highlight fields) — and for a network failure,
   * rejects with `queued: true` set on the error, which tells the caller the
   * work is safe and will go on its own rather than being lost.
   */
  function send(op, payload, opts) {
    opts = opts || {};
    var row = {
      id: uid(),
      op: op,
      payload: payload,
      tries: 0,
      at: Date.now(),
      label: opts.label || '',
    };
    // Storage FIRST. This is the whole point of the module: if the tab dies
    // between here and the response, the submission still exists.
    return put(row).then(function () {
      notify();
      return attempt(row).then(function (res) {
        return drop(row.id).then(function () { notify(); return res; });
      }, function (err) {
        if (!isRetryable(err)) {
          // The server said no. Nothing to retry; hand the reason back.
          return drop(row.id).then(function () { notify(); throw err; });
        }
        row.tries = 1;
        row.lastError = String(err && (err.code || err.message) || 'network');
        return put(row).then(function () {
          schedule();
          notify();
          var e = err || new Error('network');
          e.queued = true;      // "safe on this device, will send itself"
          throw e;
        });
      });
    });
  }

  function delayFor(tries) {
    return tries < BACKOFF.length ? BACKOFF[tries] : MAX_BACKOFF;
  }

  function schedule() {
    if (timer) return;
    readAll().then(function (rows) {
      if (!rows.length) return;
      var wait = Math.min.apply(null, rows.map(function (r) { return delayFor(r.tries || 0); }));
      timer = global.setTimeout(function () { timer = null; flush(); }, wait);
    });
  }

  /** Drain the queue oldest-first. Stops on the first still-unreachable entry. */
  function flush() {
    if (draining) return Promise.resolve();
    draining = true;
    return readAll().then(function (rows) {
      rows.sort(function (a, b) { return a.at - b.at; });
      var chain = Promise.resolve();
      var stop = false;
      rows.forEach(function (row) {
        chain = chain.then(function () {
          if (stop) return;
          return attempt(row).then(function () {
            return drop(row.id);
          }, function (err) {
            if (!isRetryable(err)) return drop(row.id);   // refused: stop carrying it
            // Still unreachable — leave it queued and stop the pass, so a long
            // queue does not hammer a dead network entry by entry.
            row.tries = (row.tries || 0) + 1;
            row.lastError = String(err && (err.code || err.message) || 'network');
            stop = true;
            return put(row);
          });
        });
      });
      return chain;
    }).then(function () {
      draining = false;
      notify();
      return readAll().then(function (rows) { if (rows.length) schedule(); });
    }, function () { draining = false; });
  }

  function pending(op) {
    return readAll().then(function (rows) {
      return op ? rows.filter(function (r) { return r.op === op; }).length : rows.length;
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    notify();
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  // Coming back online is the strongest signal there is; the interval covers
  // the case the browser never fires it (a captive portal, a flaky tether).
  if (global.addEventListener) {
    global.addEventListener('online', function () { flush(); });
  }
  if (global.setInterval) {
    global.setInterval(function () {
      if (global.navigator && global.navigator.onLine === false) return;
      readAll().then(function (rows) { if (rows.length) flush(); });
    }, 20000);
  }

  /**
   * The whole pattern in one call: mint-or-reuse the id for this form, attach
   * it, bank, send, and clear the id once the server has accepted.
   *
   * Every intake form wants exactly this, and doing it by hand at six call
   * sites is six chances to forget the id — which would silently turn a retry
   * back into a duplicate record. `formKey` should be stable for one fill
   * (usually the draft key) and distinct per form.
   */
  function intake(op, payload, formKey) {
    var sid = submissionId(formKey);
    return send(op, Object.assign({}, payload, { submissionId: sid }))
      .then(function (res) { resetSubmissionId(formKey); return res; });
  }

  global.outbox = {
    send: send,
    intake: intake,
    flush: flush,
    pending: pending,
    subscribe: subscribe,
    submissionId: submissionId,
    resetSubmissionId: resetSubmissionId,
    isRetryable: isRetryable,
  };
})(typeof window !== 'undefined' ? window : this);
