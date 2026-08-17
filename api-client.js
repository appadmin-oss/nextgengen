/* ================================================================
   NGG — API client.
   Thin wrapper around fetch with credentials + JSON handling.
   ================================================================ */

(function (global) {
  const BASE = '/api';

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function request(path, opts) {
    opts = opts || {};
    const method = opts.method || (opts.body ? 'POST' : 'GET');
    const headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    // Echo the CSRF cookie back as a header on every write — required by
    // the PHP `csrf_require()` middleware. GETs are exempt.
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = getCookie('ngg_csrf');
      if (csrf) headers['X-NGG-CSRF'] = csrf;
    }
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    // Bound every call. A dead origin makes the browser sit on the socket for
    // a minute or more before it gives up, which reads as a frozen app rather
    // than a failure — so we abort first and surface a real error code.
    // GETs are idempotent and abort cheaply; writes get a much longer ceiling
    // because aborting one that is still running server-side would leave the
    // user staring at an error next to work that actually succeeded.
    const isRead = method === 'GET' || method === 'HEAD';
    const ms = opts.timeout != null ? opts.timeout : (isRead ? 20000 : 60000);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ms && ctl ? setTimeout(() => ctl.abort(), ms) : null;
    /* A caller may also want to cancel. The timeout above is the machine's
       patience; this is the person's — the analyst chat runs two model rounds
       and can take half a minute, and somebody who has changed their mind
       should not have to wait it out. Composed rather than replacing the
       timeout, so a cancellable call is still bounded. */
    if (ctl && opts.signal) {
      if (opts.signal.aborted) ctl.abort();
      else opts.signal.addEventListener('abort', () => ctl.abort(), { once: true });
    }
    let res;
    try {
      res = await fetch(BASE + path, {
        method: method,
        credentials: 'include',
        headers: headers,
        body: body,
        // Third layer of the same guarantee. The server sends no-store and
        // .htaccess enforces it for /api/, but a fetch left on the default
        // cache mode will still hand back a stored response when one exists
        // — from an older deploy, a proxy that rewrote the headers, or a
        // browser that cached before this fix shipped. Reads are the ones
        // that go stale; writes are never cached anyway, but there is no
        // reason to exempt them.
        cache: 'no-store',
        signal: ctl ? ctl.signal : undefined,
      });
    } catch (e) {
      // Aborted, DNS failure, refused connection, TLS error — the request never
      // reached a response. Callers can tell this apart from an API error.
      const aborted = e && (e.name === 'AbortError' || (ctl && ctl.signal.aborted));
      /* "Cancelled" and "timed out" are different events and the caller has to
         tell them apart: one deserves an error message, the other is the user
         getting what they asked for. */
      const byCaller = !!(opts.signal && opts.signal.aborted);
      const err = new Error(aborted ? (byCaller ? 'cancelled' : 'timeout') : 'network');
      err.code = err.message;
      err.status = 0;
      err.detail = e && e.message;
      throw err;
    } finally { if (timer) clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || ('http_' + res.status));
      err.status = res.status;
      /* An expired or revoked session is not a per-screen problem, and every
         screen discovering it separately is why it surfaced as a raw code in a
         red toast beside a half-filled form. Announce it once; the auth layer
         decides what the user sees. Sign-in endpoints are exempt — a failed
         sign-in attempt is a 401 too, and it must not look like an expiry. */
      if (res.status === 401 && !/\/auth\/(login|verify|request|gateway|reset)/.test(path)) {
        try { window.dispatchEvent(new CustomEvent('ngg:session-expired', { detail: { code: data.error || '' } })); } catch (_) {}
      }
      err.detail = data.detail;
      err.code = data.error;
      // Some refusals carry structured context the caller needs to act on —
      // which reinstatement conditions are unmet, who the refused scan was.
      // Without this the screen can only say "failed" and throw the rest away.
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---- Cloudinary direct upload -------------------------------------------
  // Ask the PHP proxy for a short-lived signature, then POST the file straight
  // to Cloudinary. The api_secret never touches the browser.
  let _configCache = null;
  async function getConfig() {
    if (_configCache) return _configCache;
    try { _configCache = await request('/public/config.php'); }
    catch (_) { _configCache = { uploads: { enabled: false } }; }
    return _configCache;
  }

  /* ── Shrink before sending ────────────────────────────────────────────────
   * Uploads used to put the raw camera file on the wire. A current phone photo
   * is 3–12 MB, so on a mobile connection that is minutes of waiting — and the
   * first thing done with it was to shrink it to 1600px anyway, so every one of
   * those megabytes was paid for in the visitor's data and time and then thrown
   * away. Resampling here first takes a typical 8 MB photo to roughly 300 KB
   * for the same delivered pixels.
   *
   * This sits inside uploadFile rather than at the call sites so every path —
   * the camera, the file picker, the photo editor's Replace, the media
   * uploader — gets it, and a new caller cannot forget. It never blocks an
   * upload: anything undecodable, animated, vector, or already small goes up
   * exactly as it arrived. */
  const SHRINK = {
    headshot: { maxPx: 1600, quality: 0.86 },   // card art is delivered at 900px
    post: { maxPx: 1600, quality: 0.82 },       // matches the server incoming transform
    proof: { maxPx: 2000, quality: 0.82 },
    /* For an image that travels INSIDE a JSON submission rather than as its own
       upload. Sized against nginx's 1MB client_max_body_size default, which is
       the tightest limit in common use — a 413 on a form's last tap is the
       worst possible place to discover a body limit. */
    inline: { maxPx: 1000, quality: 0.78 },
  };
  let _toolsPromise = null;
  function ensureImageTools() {
    if (window.ImageTools) return Promise.resolve(window.ImageTools);
    if (_toolsPromise) return _toolsPromise;
    _toolsPromise = new Promise((res, rej) => {
      let sc = document.getElementById('ngg-imagetools');
      if (!sc) {
        sc = document.createElement('script');
        sc.id = 'ngg-imagetools'; sc.src = '/vendor/image-tools.js';
        document.head.appendChild(sc);
      }
      let timer = setTimeout(() => rej(new Error('image_tools_timeout')), 20000);
      sc.addEventListener('load', () => { clearTimeout(timer); res(window.ImageTools); }, { once: true });
      sc.addEventListener('error', () => { clearTimeout(timer); rej(new Error('image_tools_unavailable')); }, { once: true });
    });
    /* A FAILED load must not be remembered as the answer.
     *
     * The rejected promise was cached, so one dropped request for
     * /vendor/image-tools.js — a flaky mobile signal, a proxy, a cold cache on
     * a bad connection — made every photo attempt for the rest of the page
     * session fail identically. Retaking, picking another file, pressing the
     * button again: all refused, because nothing was retrying anything. That
     * is exactly why the rejections looked random and then became total.
     *
     * The <script> element is dropped with it, so the next attempt fetches
     * again rather than re-listening to a tag that already errored. */
    _toolsPromise.catch(() => {
      _toolsPromise = null;
      const sc = document.getElementById('ngg-imagetools');
      if (sc && sc.parentNode) sc.parentNode.removeChild(sc);
    });
    return _toolsPromise;
  }

  /* Shrink with nothing but a canvas.
   *
   * The optimiser is lazy-loaded from /vendor, and when that request does not
   * arrive there was no plan B: the raw 3–12MB camera file went at the wall,
   * hit the inline size guard and came back "that photo is too large" — for a
   * photo the device could have shrunk itself, without the network, in about a
   * frame. Pica's Lanczos pass gives visibly better print pixels and stays the
   * preferred path; this is the difference between a slightly softer headshot
   * and no registration.
   *
   * `minShortPx` is the server's print floor. Shrinking is meant to get a photo
   * ACCEPTED, so it must never be what pushes one under the size the gate
   * refuses — a tall image scaled by its long side can do exactly that.
   */
  async function canvasShrink(file, maxPx, quality, minShortPx) {
    let src = null, url = '', w = 0, h = 0;
    try {
      if (typeof createImageBitmap === 'function') {
        src = await createImageBitmap(file);
        w = src.width; h = src.height;
      } else {
        url = URL.createObjectURL(file);
        src = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('undecodable'));
          im.src = url;
        });
        w = src.naturalWidth; h = src.naturalHeight;
      }
      if (!w || !h) return null;
      let scale = Math.min(1, maxPx / Math.max(w, h));
      const short = Math.min(w, h);
      if (minShortPx && short * scale < minShortPx) scale = Math.min(1, minShortPx / short);
      const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, cw, ch);
      return await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    } catch (_) {
      return null;
    } finally {
      if (src && src.close) { try { src.close(); } catch (_) {} }
      if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
    }
  }
  async function shrinkForUpload(file, kind) {
    const type = (file && file.type) || '';
    // GIF loses its animation and SVG is already tiny; neither benefits.
    if (!/^image\//.test(type) || /^image\/(gif|svg\+xml)$/.test(type)) return file;
    try {
      const tools = await ensureImageTools();
      const r = await tools.prepare(file, SHRINK[kind] || SHRINK.proof);
      if (r.skipped || !r.blob) return file;
      const name = String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
      return new File([r.blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (_) {
      return file;   // optimiser unavailable — send the original rather than fail
    }
  }

  async function uploadFile(file, kind, onProgress) {
    kind = kind || 'proof';
    if (onProgress) onProgress(0);
    file = await shrinkForUpload(file, kind);
    // Headshots are captured on PUBLIC surfaces (apply, gate registration, the
    // guardian reshoot page) where there is no session — so they sign through
    // the public headshot endpoint. Everything else uses the member endpoint.
    const mediaKind = /^video\//.test(file.type || '') ? 'video' : 'image';
    const sig = kind === 'headshot'
      ? await request('/public/upload-headshot-sign.php', { body: {} })
      : await request('/member/upload-sign.php', { body: { kind, mediaKind } });
    return await new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', sig.apiKey);
      fd.append('timestamp', sig.timestamp);
      fd.append('signature', sig.signature);
      fd.append('folder', sig.folder);
      // Eager web-optimized derivative + incoming compression (signed
      // server-side; the FormData must match the signed params exactly).
      if (sig.eager) { fd.append('eager', sig.eager); if (sig.eagerAsync) fd.append('eager_async', 'true'); }
      if (sig.transformation) fd.append('transformation', sig.transformation);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', sig.uploadUrl);
      if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && d.secure_url) {
          resolve({ url: d.secure_url, publicId: d.public_id, resourceType: d.resource_type, format: d.format, bytes: d.bytes });
        } else {
          reject(new Error((d.error && d.error.message) || ('upload_failed_' + xhr.status)));
        }
      };
      xhr.onerror = () => reject(new Error('upload_network_error'));
      xhr.send(fd);
    });
  }

  // ---- Cloudinary unsigned upload (public, no session) --------------------
  // For prospective applicants who don't have an account yet. Requires an
  // unsigned upload preset (see api/config.php). Returns {} silently disabled
  // when the server hasn't configured a public preset.
  async function uploadPublic(file, onProgress) {
    const cfg = await getConfig();
    const pu = (cfg && cfg.publicUpload) || {};
    if (!pu.enabled) throw new Error('public_upload_disabled');
    return await new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', pu.preset);
      if (pu.folder) fd.append('folder', pu.folder);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + pu.cloudName + '/image/upload');
      if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && d.secure_url) {
          resolve({ url: d.secure_url, publicId: d.public_id, format: d.format, bytes: d.bytes });
        } else {
          reject(new Error((d.error && d.error.message) || ('upload_failed_' + xhr.status)));
        }
      };
      xhr.onerror = () => reject(new Error('upload_network_error'));
      xhr.send(fd);
    });
  }

  /* ── Upload, or carry the image yourself ──────────────────────────────────
   * Cloudinary is opt-in: it needs three keys in api/config.php, and until
   * somebody sets them there is nothing to upload to. Every headshot surface
   * used to treat that as an error — "photo uploads aren't set up on this
   * server yet, skip for now" — so on a fresh deployment nobody could attach a
   * photograph anywhere, and the review desk existed to look at photographs.
   *
   * There is a third option, and it is the one the public registration form has
   * always used: put the image in the submission and let the server hold it.
   * photo_intake_url on the server accepts either shape, so a caller does not
   * have to know which happened — it gets a `url` back and stores it.
   *
   * Order matters. A real upload is still preferred when one is possible: a
   * hosted image gets the CDN, the derivative transforms and the AI edit, and
   * it keeps the bytes out of the database request. Inline is the fallback, not
   * the default, and it is shrunk harder because it has to fit in a request
   * body rather than a file upload.
   */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('unreadable_image'));
      r.readAsDataURL(blob);
    });
  }

  /* Formats the server's photo gate accepts. Kept here as well as in
     image-tools because this is the last point before the bytes leave. */
  const INLINE_OK_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const typeSendable = (t) => INLINE_OK_TYPES.indexOf(String(t || '').toLowerCase()) !== -1;

  /* The body ceiling. nginx's 1MB client_max_body_size default is the tightest
     limit in common use, and a 413 on a form's last tap destroys the error
     message along with the request — so the fit has to be made here. */
  const INLINE_MAX_CHARS = 1400000;
  /* Fallback ladder, tried in order until one fits. The first is the size the
     optimiser would have produced; the rest trade print sharpness for a
     registration that completes, which is always the right trade. */
  const INLINE_LADDER = [
    { maxPx: 1000, quality: 0.78 },
    { maxPx: 900,  quality: 0.7 },
    { maxPx: 750,  quality: 0.62 },
    { maxPx: 600,  quality: 0.55 },
  ];

  async function inlineImage(file) {
    let out = file;
    let prep = null;
    try {
      const tools = await ensureImageTools();
      prep = await tools.prepare(file, SHRINK.inline);
      if (!prep.skipped && prep.blob) out = prep.blob;
    } catch (_) { /* optimiser unavailable — the canvas ladder below covers it */ }

    let dataUrl = typeSendable(out && out.type) ? await blobToDataUrl(out) : '';
    /* TRY BEFORE REFUSING.
       Two ways to arrive here needing work: the optimiser never loaded, so
       `out` is still the raw 3–12MB camera file; or it loaded, skipped, and the
       result is a format the gate will not take. Both used to be a flat
       refusal. The device can fix both without the network. */
    if (dataUrl === '' || dataUrl.length > INLINE_MAX_CHARS) {
      for (const step of INLINE_LADDER) {
        const shrunk = await canvasShrink(file, step.maxPx, step.quality, 320);
        if (!shrunk) break;                      // undecodable — nothing to try
        const candidate = await blobToDataUrl(shrunk);
        if (candidate.length <= INLINE_MAX_CHARS) { out = shrunk; dataUrl = candidate; break; }
        dataUrl = candidate;                     // keep the smallest we reached
        out = shrunk;
      }
    }
    /* An iPhone on "High Efficiency" saves HEIC, which Chrome on Android cannot
       decode at all — so neither the optimiser nor the canvas can convert it,
       and there is nothing left to try. Named here rather than posted for the
       server to answer `not_an_image` to, so the family gets advice they can
       act on instead of a rejection at the end of a five-step form. */
    if (!typeSendable(out && out.type)) {
      const e = new Error('photo_format');
      e.code = 'photo_format';
      e.photoType = (out && out.type) || (file && file.type) || '';
      e.undecodable = !!(prep && prep.reason === 'undecodable');
      throw e;
    }
    if (!dataUrl || dataUrl.length > INLINE_MAX_CHARS) throw new Error('photo_too_large');
    return dataUrl;
  }

  /**
   * Resolve a chosen file to something a form can submit as `photoUrl`.
   * `{url, inline}` — `inline` is true when the url IS the image.
   */
  async function uploadOrInline(file, kind, onProgress) {
    kind = kind || 'headshot';
    const cfg = await getConfig();
    const canPublic = !!(cfg && cfg.publicUpload && cfg.publicUpload.enabled);
    const canSigned = !!(cfg && cfg.uploads && cfg.uploads.enabled);
    /* WHY the cloud was not used, carried back to the caller and reported.
     *
     * These catches used to be bare. Falling back is right — a family must be
     * able to finish registering at 9pm whatever Cloudinary is doing — but
     * swallowing the reason meant a disconnected cloud looked identical to a
     * working one from every screen in the product, for as long as nobody
     * happened to open the Cloudinary dashboard. The fallback stays; the silence
     * does not. */
    let why = '';
    if (canPublic) {
      try { return Object.assign({ inline: false }, await uploadPublic(await shrinkForUpload(file, kind), onProgress)); }
      catch (e) { why = 'public: ' + (e && e.message || 'failed'); }
    }
    if (canSigned) {
      try { return Object.assign({ inline: false }, await uploadFile(file, kind, onProgress)); }
      catch (e) { why = (why ? why + '; ' : '') + 'signed: ' + (e && e.message || 'failed'); }
    }
    if (onProgress) onProgress(50);
    const url = await inlineImage(file);
    if (onProgress) onProgress(100);
    // Only a fault when a cloud was configured and still could not be used. No
    // cloud at all is a supported way to run this and must not cry wolf.
    if (why && (canPublic || canSigned)) reportUploadFallback(kind, why);
    return { url: url, inline: true, bytes: url.length, fallbackReason: why };
  }

  /* Tell the server, once per page, that a configured cloud refused an upload.
     Fire-and-forget and never allowed to break the thing the user was doing —
     the whole point of the fallback is that the registration still completes. */
  let _fallbackTold = false;
  function reportUploadFallback(kind, why) {
    if (_fallbackTold) return;
    _fallbackTold = true;
    try {
      const body = JSON.stringify({ kind: kind, reason: String(why).slice(0, 300) });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BASE + "/public/upload-fallback.php", new Blob([body], { type: 'application/json' }));
      } else {
        fetch(BASE + "/public/upload-fallback.php", { method: 'POST', body: body, keepalive: true }).catch(() => {});
      }
    } catch (_) { /* never let telemetry break an upload */ }
  }

  const API = {
    config: getConfig,
    // Lazily loads /vendor/image-tools.js (pica + Cropper.js) and resolves to
    // window.ImageTools. Shared so the photo studio and the upload shrinker
    // load it once between them.
    imageTools: ensureImageTools,
    uploadFile: uploadFile,
    uploadPublic: uploadPublic,
    /* The one every headshot surface should call: uploads when there is a cloud,
       hands back the image inline when there is not. Never fails because
       Cloudinary is unconfigured. */
    uploadOrInline: uploadOrInline,
    // Exposed for the browser test: the no-network fallback shrink, which
    // decides whether a photo is accepted when the optimiser cannot be fetched.
    __canvasShrink: canvasShrink,
    auth: {
      gateway: (identifier) => request('/auth/gateway.php', { body: { identifier } }),
      request: (identifier) => request('/auth/request.php', { body: { identifier } }),
      login:   (identifier, password, remember) => request('/auth/login.php', { body: { identifier, password, remember: !!remember } }),
      resetRequest: (identifier) => request('/auth/reset-request.php', { body: { identifier } }),
      resetConfirm: (creds) => request('/auth/reset-confirm.php', { body: creds }),
      setPassword: (password, current) => request('/auth/set-password.php', { body: { password, current: current || '' } }),
      verify:  (creds) => request('/auth/verify.php', { body: creds }),
      studentLogin: (creds) => request('/auth/student-login.php', { body: creds }),
      me:      () => request('/auth/me.php'),
      logout:  () => request('/auth/logout.php', { method: 'POST' }),
      adminTotpSetup:  () => request('/auth/admin-totp-setup.php', { method: 'POST' }),
      adminTotpVerify: (code) => request('/auth/admin-2fa.php', { body: { code } }),
    },
    member: {
      dashboard:     () => request('/member/dashboard.php'),
      anchor:        () => request('/member/anchor.php'),
      mentorRoster:  (centre) => request('/member/mentor.php' + (centre ? '?centre=' + encodeURIComponent(centre) : '')),
      starGive:      (subjectId, stars, category, note) => request('/member/mentor.php', { body: { action: 'star', subjectId, stars, category, note } }),
      v3Rate:        (subjectId, verbal, vocal, visual, note) => request('/member/mentor.php', { body: { action: 'v3', subjectId, verbal, vocal, visual, note } }),
      bulkAward: (subjectIds, opts) => request('/member/mentor.php', { body: Object.assign({ action: 'bulk', subjectIds }, opts || {}) }),
      /* The teaching record. One endpoint, three views — an instructor's day
         is one screen that switches between the class, a child and the grid. */
      session:      (course, centre, date) => request('/member/teaching.php?view=session&course=' + encodeURIComponent(course || '') + '&centre=' + encodeURIComponent(centre || '') + '&date=' + encodeURIComponent(date || '')),
      sessionSave:  (data) => request('/member/teaching.php', { body: Object.assign({ action: 'session' }, data || {}) }),
      skillsBoard:  (course, centre) => request('/member/teaching.php?view=skills&course=' + encodeURIComponent(course || '') + '&centre=' + encodeURIComponent(centre || '')),
      skillsMark:   (subjectId, course, marks) => request('/member/teaching.php', { body: { action: 'skills', subjectId, course, marks } }),
      remarks:      (subjectId) => request('/member/teaching.php?view=remarks&subjectId=' + encodeURIComponent(subjectId || '')),
      remarkAdd:    (subjectId, kind, body) => request('/member/teaching.php', { body: { action: 'remark', subjectId, kind, body } }),
      submitMission: (data) => request('/member/mission.php', { body: data }),
      journal:       () => request('/member/journal.php'),
      journalCreate: (data) => request('/member/journal.php', { body: data }),
      rsvp:          (data) => request('/member/rsvp.php', { body: data }),
      notifications: () => request('/member/notifications.php'),
      markRead:      (notifId) => request('/member/notifications.php', { body: { notifId } }),
      updateProfile: (data) => request('/member/profile.php', { body: data }),
      assignments:      () => request('/member/assignments.php'),
      submitAssignment: (data) => request('/member/assignments.php', { body: data }),
      stateGet:  (keys) => request('/member/state.php' + qs({ keys: Array.isArray(keys) ? keys.join(',') : keys })),
      stateSet:  (key, value) => request('/member/state.php', { body: { key, value } }),
      momentum:     () => request('/member/momentum.php'),
      /* Read-only. There is no member-side write to the ledger. */
      fees:         () => request('/member/fees.php'),
      compliance:   () => request('/member/compliance.php'),
      coach:        (messages) => request('/member/coach.php', { body: { messages } }),
      circle:       () => request('/member/circle.php'),
      circleRotate: () => request('/member/circle.php', { body: { action: 'rotate' } }),
      circleRevoke: (linkId) => request('/member/circle.php', { body: { action: 'revoke', linkId } }),
      react:               (post, emoji) => request('/member/engage.php', { body: { action: 'react', post, emoji } }),
      comment:             (post, body) => request('/member/engage.php', { body: { action: 'comment', post, body } }),
      /* The Programme Journal — the programme's durable record, living as a
         destination inside the Community. Distinct from `journal`, which is a
         member's own private Anchor reflections. */
      programJournal: {
        feed:     (q) => request('/member/program-journal.php' + qs(Object.assign({ view: 'feed' }, q || {}))),
        memories: () => request('/member/program-journal.php' + qs({ view: 'memories' })),
        person:   (personId) => request('/member/program-journal.php' + qs({ view: 'person', personId })),
        save:     (data) => request('/member/program-journal.php', { body: Object.assign({ action: 'save' }, data) }),
        // Widening who can see an entry is its own call, and audited: an entry
        // can name a child, so this is not a field on a form.
        visibility: (entryId, visibility) => request('/member/program-journal.php', { body: { action: 'visibility', entryId, visibility } }),
        share:    (entryId, revoke) => request('/member/program-journal.php', { body: { action: 'share', entryId, revoke: !!revoke } }),
        remove:   (entryId) => request('/member/program-journal.php', { body: { action: 'delete', entryId } }),
      },
      community: {
        channels: () => request('/member/community.php' + qs({ view: 'channels' })),
        feed:     (channel, sort, page) => request('/member/community.php' + qs({ view: 'feed', channel: channel || 'all', sort: sort || 'latest', page: page || 0 })),
        comments: (postId) => request('/member/community.php' + qs({ view: 'comments', postId })),
        digest:   (channel) => request('/member/community.php' + qs({ view: 'digest', channel: channel || 'all' })),
        post:     (data) => request('/member/community.php', { body: { action: 'post', data } }),
        react:    (postId, emoji) => request('/member/community.php', { body: { action: 'react', postId, emoji } }),
        comment:  (postId, body) => request('/member/community.php', { body: { action: 'comment', postId, body } }),
        bookmark: (postId) => request('/member/community.php', { body: { action: 'bookmark', postId } }),
        report:   (targetType, targetId, reason) => request('/member/community.php', { body: { action: 'report', targetType, targetId, reason: reason || '' } }),
        remove:   (targetType, targetId) => request('/member/community.php', { body: { action: 'delete', targetType, targetId } }),
        vote:     (postId, choice) => request('/member/community.php', { body: { action: 'vote', postId, choice } }),
        star:     (postId) => request('/member/community.php', { body: { action: 'star', postId } }),
        mentions: (q) => request('/member/community.php' + qs({ view: 'mention', q })),
        search:   (q, channel) => request('/member/community.php' + qs({ view: 'search', q, channel: channel || 'all' })),
        members:  (channel) => request('/member/community.php' + qs({ view: 'members', channel })),
        markRead: (channel) => request('/member/community.php', { body: { action: 'markRead', channel } }),
      },
      arcade: {
        home:   () => request('/member/arcade.php' + qs({ view: 'home' })),
        board:  (game, scope) => request('/member/arcade.php' + qs({ view: 'board', game: game || '', scope: scope || 'week' })),
        start:  (game) => request('/member/arcade.php', { body: { action: 'start', game } }),
        submit: (roundId, answers) => request('/member/arcade.php', { body: { action: 'submit', roundId, answers } }),
      },
      // Two-player, turn-based matches. There is no "send message" here by
      // design — react() takes one of a fixed set of reactions and nothing else.
      match: {
        list:    () => request('/member/match.php' + qs({ view: 'list' })),
        get:     (matchId) => request('/member/match.php' + qs({ view: 'get', matchId })),
        staff:   (flagged) => request('/member/match.php' + qs({ view: 'staff', flagged: flagged ? 1 : '' })),
        // The live tick: ply only, plus the position when it moved.
        poll:    (matchId, since) => request('/member/match.php' + qs({ view: 'poll', matchId, since })),
        // Games anyone can watch.
        watch:   () => request('/member/match.php' + qs({ view: 'watch' })),
        invite:  (game, opponentId) => request('/member/match.php', { body: { action: 'invite', game, opponentId } }),
        respond: (matchId, accept) => request('/member/match.php', { body: { action: 'respond', matchId, accept } }),
        move:    (matchId, move) => request('/member/match.php', { body: { action: 'move', matchId, move } }),
        resign:  (matchId) => request('/member/match.php', { body: { action: 'resign', matchId } }),
        react:   (matchId, reaction) => request('/member/match.php', { body: { action: 'react', matchId, reaction } }),
        report:  (matchId) => request('/member/match.php', { body: { action: 'report', matchId } }),
      },
      // A player's own tournaments and their next game in each.
      tournaments: {
        mine: () => request('/member/match.php' + qs({ view: 'tournaments' })),
      },
      changeEmail:         (email) => request('/member/account.php', { body: { action: 'change_email', email } }),
      exportData:          () => request('/member/account.php'),
      deleteAccount:       () => request('/member/account.php', { body: { action: 'delete' } }),
      security:            () => request('/member/security.php'),
      securityRevoke:      (sid) => request('/member/security.php', { body: { action: 'revoke', sid } }),
      securityRevokeOthers: () => request('/member/security.php', { body: { action: 'revoke_others' } }),
    },
    public: {
      stats:      () => request('/public/stats.php'),
      status:     () => request('/public/status.php'),
      volunteerStatus: () => request('/public/volunteer-status.php'),
      leaderboard: (limit) => request('/public/leaderboard.php' + qs(limit ? { limit } : {})),
      applicationStatus: (ref, email) => request('/public/application-status.php', { body: { ref, email } }),
      donate: (data) => request('/public/donate.php', { body: data }),
      postEngagement: (post) => request('/public/engagement.php' + qs({ post })),
      events:     () => request('/public/events.php'),
      posts:      (kind, tag) => request('/public/posts.php' + qs({ kind, tag })),
      post:       (slug) => request('/public/post.php' + qs({ slug })),
      session:    () => request('/public/session.php'),
      anchorContent: () => request('/public/anchor-content.php'),
      mentors:    () => request('/public/mentors.php'),
      summerProfile: (q) => request('/public/summer-profile.php' + qs(q || {})),
      centres:    () => request('/public/centres.php'),
      centre:     (slug) => request('/public/centre.php' + qs({ slug })),
      communityChannels: () => request('/public/community.php'),
      communityShowcase: () => request('/public/community.php' + qs({ view: 'showcase' })),
      newsletter: (email, source) => request('/public/newsletter.php', { body: { email, source: source || 'site' } }),
      apply:      (data) => request('/public/apply.php', { body: data }),
      volunteer:  { context: () => request('/public/volunteer.php') },
      cert:       (id) => request('/public/cert.php' + qs({ id })),
      // A shared journal entry. Resolves only while the entry is public, so
      // narrowing it revokes every link already sent.
      journalEntry: (t) => request('/public/journal-entry.php' + qs({ t })),
      siteContent: () => request('/public/site.php'),
      instructorRoster: (token, email) => request('/public/instructor.php', { body: { token, email } }),
      contact:    (data) => request('/public/contact.php', { body: data }),
      gate: {
        context:  (g) => request('/public/gate.php' + qs({ g })),
        register: (gate, data, photoUrl, force, opts) => request('/public/gate.php', { body: {
          action: 'register', gate, data, photoUrl, force,
          lat: opts && opts.lat, lng: opts && opts.lng, geoOverride: !!(opts && opts.geoOverride),
          // Retry key. Without it a re-send after a timeout registers the child
          // a second time; with it the server replays the original result.
          submissionId: (opts && opts.submissionId) || '',
        } }),
        // scannedAt is only set when flushing a scan banked while offline, so
        // punctuality is graded at the moment the card was presented rather
        // than whenever the signal came back. Clamped server-side to 24h.
        checkin:  (gate, token, scannedAt) => request('/public/gate.php', { body: { action: 'checkin', gate, token, scannedAt } }),
        dutyClose:(gate) => request('/public/gate.php', { body: { action: 'duty_close', gate } }),
        // Kiosk unlock — mints a gate-scoped session so field staff run the
        // desk without an admin login (see /public/gate-unlock.php).
        unlock:   (gate, password) => request('/public/gate-unlock.php', { body: { gate, password } }),
      },
      /* The public self-registration link: no session at all, because it is a
         link a family opens on their own phone. */
      selfreg: {
        context: (g) => request('/public/selfreg.php' + qs({ g })),
        submit:  (body) => request('/public/selfreg.php', { body }),
      },
      /* The desk that checks those submissions. Same kiosk unlock as the gate,
         bound to its own link and its own password. */
      review: {
        queue:       (g, q) => request('/public/review.php' + qs(Object.assign({ g }, q || {}))),
        approve:     (g, studentId, note) => request('/public/review.php', { body: { action: 'approve', gate: g, studentId, note } }),
        approveBulk: (g, studentIds) => request('/public/review.php', { body: { action: 'approveBulk', gate: g, studentIds } }),
        reject:      (g, studentId, note) => request('/public/review.php', { body: { action: 'reject', gate: g, studentId, note } }),
      },
      verify: {
        context: (t) => request('/public/verify.php' + qs({ t })),
        submit:  (t, consents, actorName, feedback, signature) => request('/public/verify.php', { body: { t, consents, actorName, feedback, signature } }),
      },
      reshoot: {
        context: (t) => request('/public/reshoot.php' + qs({ t })),
        submit:  (t, photoUrl, submissionId) => request('/public/reshoot.php', { body: { t, photoUrl, submissionId: submissionId || '' } }),
      },
      circle: {
        // The child's name is required, not optional: the code alone no longer
        // resolves to anything, so a guessed code cannot reveal who it belongs to.
        lookup:    (code, name) => request('/public/circle.php' + qs({ view: 'lookup', code, name })),
        connect:   (data) => request('/public/circle.php', { body: Object.assign({ action: 'connect' }, data) }),
        dashboard: (token) => request('/public/circle.php' + qs({ view: 'dashboard', token })),
        report:    (token) => request('/public/circle.php' + qs({ view: 'report', token })),
        confirm:   (token, date, on) => request('/public/circle.php', { body: { action: 'confirm', token, date, on } }),
        remark:    (token, text) => request('/public/circle.php', { body: { action: 'remark', token, text } }),
        cohort:    (tokens) => request('/public/circle.php', { body: { action: 'cohort', tokens } }),
      },
    },
    admin: {
      members: {
        list:   (q) => request('/admin/members.php' + qs(q || {})),
        upsert: (data) => request('/admin/members.php', { body: data }),
        reset2fa: (memberId) => request('/admin/members.php', { body: { action: 'reset2fa', memberId } }),
        resetPassword: (memberId) => request('/admin/members.php', { body: { action: 'resetPassword', memberId } }),
        // Record a guardian's publication decision. `method` is how it was
        // obtained (paper form, phone, in person) and the server requires it.
        consent:       (memberId, type, status, method) => request('/admin/members.php', { body: { action: 'consent', memberId, type, status, method } }),
        remove: (memberId) => request('/admin/members.php', { body: { action: 'delete', memberId } }),
        // Promote an NGG member into the NGV / volunteer tier — auto-provisions
        // their volunteer record + ID card (idempotent).
        promoteNgv: (memberId, role, opts) => request('/admin/members.php', { body: Object.assign({ action: 'promoteNgv', memberId, role }, (opts && opts.sendId !== undefined) ? { sendId: opts.sendId } : {}) }),
        // Reverse an NGV promotion: deactivate the volunteer record + unlink the
        // member (non-destructive; a later promoteNgv re-activates the same record).
        demoteNgv: (memberId) => request('/admin/members.php', { body: { action: 'demoteNgv', memberId } }),
        setCaps: (memberId, caps, centreScope) => request('/admin/members.php', { body: Object.assign({ action: 'setCaps', memberId, caps }, centreScope !== undefined ? { centreScope } : {}) }),
        impersonate: (memberId) => request('/admin/impersonate.php', { body: { action: 'start', memberId } }),
        stopImpersonate: () => request('/admin/impersonate.php', { body: { action: 'stop' } }),
      },
      mentors: {
        list:   () => request('/admin/mentors.php'),
        upsert: (data) => request('/admin/mentors.php', { body: data }),
      },
      mentorship: {
        overview: () => request('/admin/mentorship.php?view=overview'),
        roster:   (sessionId) => request('/admin/mentorship.php' + qs({ view: 'roster', sessionId })),
        convertApp: (id) => request('/admin/mentorship.php', { body: { action: 'convert', id } }),
        assign:   (memberId, mentorId, sessionId) => request('/admin/mentorship.php', { body: { action: 'assign', memberId, mentorId, sessionId } }),
        unassign: (memberId, sessionId) => request('/admin/mentorship.php', { body: { action: 'assign', memberId, mentorId: '', sessionId } }),
      },
      sessions: {
        list:   (year) => request('/admin/sessions.php' + qs({ year })),
        upsert: (data) => request('/admin/sessions.php', { body: data }),
      },
      missions: {
        list:   () => request('/admin/missions.php'),
        upsert: (data) => request('/admin/missions.php', { body: data }),
        // Proof-review queue: list submitted missions and verify/reject them.
        submissions: () => request('/admin/missions.php' + qs({ view: 'submissions' })),
        verify: (memberId, missionId, approve, note) => request('/admin/missions.php', { body: { action: 'verify', memberId, missionId, approve, note } }),
      },
      events: {
        list:   () => request('/admin/events.php'),
        upsert: (data) => request('/admin/events.php', { body: data }),
        markAttendance: (eventId, memberId, clear) => request('/admin/events.php', { body: { action: 'attendance', eventId, memberId, clear: !!clear } }),
      },
      posts: {
        list:   () => request('/admin/posts.php'),
        get:    (postId) => request('/admin/posts.php' + qs({ postId })),
        upsert: (data) => request('/admin/posts.php', { body: data }),
      },
      promotions: {
        get: () => request('/admin/promotions.php'),
        set: (promo) => request('/admin/promotions.php', { body: { promo } }),
      },
      assignments: {
        list:        () => request('/admin/assignments.php'),
        submissions: (assignmentId) => request('/admin/assignments.php' + qs({ assignmentId })),
        upsert:      (data) => request('/admin/assignments.php', { body: data }),
        grade:       (data) => request('/admin/assignments.php', { body: data }),
        returnForRevision: (submissionId, feedback) => request('/admin/assignments.php', { body: { action: 'return', submissionId, feedback: feedback || '' } }),
      },
      broadcast: (data) => request('/admin/broadcast.php', { body: data }),
      broadcastHistory: () => request('/admin/broadcast.php'),
      anchor: {
        get:      () => request('/admin/anchor.php'),
        defaults: () => request('/admin/anchor.php?defaults=1'),
        set:      (data) => request('/admin/anchor.php', { body: { data } }),
      },
      overview:     () => request('/admin/overview.php'),
      engagement:   (opts) => request('/admin/engagement.php' + qs(opts || {})),
      engagementTrends: (opts) => request('/admin/engagement.php' + qs(Object.assign({ view: 'trends' }, opts || {}))),
      dashboard:    () => request('/admin/dashboard.php'),
      statusPages:  () => request('/admin/status-pages.php'),
      statusPagesSet: (data) => request('/admin/status-pages.php', { body: { data } }),
      analytics:    (filters) => request('/admin/analytics.php' + qs(filters || {})),
      // Level 5 · Growth Potential — its own fetch so Levels 1-4 never pay for
      // per-student trajectory scoring nobody has asked to see.
      analyticsGrowth: (centre, weeks) => request('/admin/analytics.php' + qs({ view: 'growth', centre: centre || '', weeks: weeks || '' })),
      // Level 6 · comparison, segmentation, rigour, narrative.
      analyticsDepth: (q) => request('/admin/analytics.php' + qs(Object.assign({ view: 'depth' }, q || {}))),
      /* Level 7 — several model calls per run, so it is asked for explicitly
         and never fetched with the page. `force` re-runs a cached panel. The
         longer timeout is the point of it: a panel of four analysts plus a
         synthesis pass will not finish inside the default write ceiling. */
      analyticsInsight: (q, force) => request('/admin/analytics.php' + qs(Object.assign({ view: 'insight', force: force ? '1' : '' }, q || {})), { timeout: 180000 }),
      /* Level 7b · the analyst chat. Reads are cheap GETs; asking is a POST
         because it spends money and writes a turn. The same long timeout as the
         panel and for the same reason — a router pass, up to three lenses and a
         composition will not finish inside the default write ceiling, and a
         client that gives up at 30s bills for work it then discards. */
      // `archived` lists the put-away threads instead of the active ones, so
      // archiving is recoverable rather than a one-way trip.
      insightChatThreads: (archived) => request('/admin/analytics.php' + qs({ view: 'chat', op: 'threads', archived: archived ? '1' : '' })),
      insightChatThread: (threadId) => request('/admin/analytics.php' + qs({ view: 'chat', op: 'thread', threadId })),
      /* `signal` so the pane can offer Stop. A question that takes half a minute
         and cannot be abandoned is a frozen screen with a spinner on it. */
      insightChatAsk: (data, signal) => request('/admin/analytics.php', { body: { action: 'insight.ask', ...(data || {}) }, timeout: 180000, signal }),
      // `restore: true` un-archives a thread; omit to archive.
      insightChatArchive: (threadId, restore) => request('/admin/analytics.php', { body: { action: 'insight.archive', threadId, restore: !!restore } }),
      insightChatRename: (threadId, title) => request('/admin/analytics.php', { body: { action: 'insight.rename', threadId, title } }),
      insightChatReport: (threadId, seqs) => request('/admin/analytics.php', { body: { action: 'insight.report', threadId, seqs: seqs || [] }, timeout: 120000 }),
      /* Baseline/endline learning measurement. The gains read is the only one
         a funder ever sees; the rest is how the scores get in. */
      assessInstruments: () => request('/admin/assessment.php' + qs({ view: 'instruments' })),
      assessWindows:     () => request('/admin/assessment.php' + qs({ view: 'windows' })),
      assessSheet:       (windowId, centre) => request('/admin/assessment.php' + qs({ view: 'sheet', windowId, centre: centre || '' })),
      assessGains:       (instrumentId) => request('/admin/assessment.php' + qs({ view: 'gains', instrumentId: instrumentId || '' })),
      assessCatalogue:   () => request('/admin/assessment.php' + qs({ view: 'catalogue' })),
      assessAdopt:       (keys) => request('/admin/assessment.php', { body: { action: 'adopt', keys } }),
      assessInstrumentSave:   (instrumentId, data) => request('/admin/assessment.php', { body: { action: 'instrument_save', instrumentId: instrumentId || '', data } }),
      assessInstrumentRevise: (instrumentId) => request('/admin/assessment.php', { body: { action: 'instrument_revise', instrumentId } }),
      assessWindowSave:  (windowId, data) => request('/admin/assessment.php', { body: { action: 'window_save', windowId: windowId || '', data } }),
      // A whole register in one save — forty children typed off a paper sheet.
      assessRecord:      (windowId, results) => request('/admin/assessment.php', { body: { action: 'record', windowId, results }, timeout: 120000 }),
      analyticsDrill: (metric, filters) => request('/admin/analytics.php', { body: { action: 'drilldown', metric, ...(filters || {}) } }),
      activityAdd:  (data) => request('/admin/analytics.php', { body: { action: 'activity.add', ...data } }),
      championsMint: (period) => request('/admin/analytics.php', { body: { action: 'champions.mint', period: period || '' } }),
      memberDetail: (memberId) => request('/admin/member-detail.php' + qs({ memberId })),
      assignMentor: (data) => request('/admin/assign-mentor.php', { body: data }),
      applications: {
        list:    (q) => request('/admin/applications.php' + qs(q || {})),
        status:  (id, status) => request('/admin/applications.php', { body: { id, status } }),
        convert: (id) => request('/admin/applications.php', { body: { action: 'convert', id } }),
        update:  (id, data) => request('/admin/applications.php', { body: { action: 'update', id, data } }),
        remove:  (id) => request('/admin/applications.php', { body: { action: 'delete', id } }),
      },
      newsletter:   () => request('/admin/newsletter.php'),
      newsletterSend: (subject, body) => request('/admin/newsletter.php', { body: { subject, body } }),
      donations:    () => request('/admin/donations.php'),
      comments:     (status) => request('/admin/comments.php' + qs({ status: status || 'pending' })),
      commentModerate: (commentId, act) => request('/admin/comments.php', { body: { commentId, do: act } }),
      community: {
        overview:      () => request('/admin/community.php' + qs({ view: 'overview' })),
        queue:         (status) => request('/admin/community.php' + qs({ view: 'queue', status: status || 'pending' })),
        channelUpsert: (data) => request('/admin/community.php', { body: { action: 'channel', data } }),
        moderate:      (kind, id, act) => request('/admin/community.php', { body: { action: 'moderate', kind, id, do: act } }),
        // How hard the feed is screened: 'strict' | 'flag' | 'off'. Super admin.
        moderation:    (mode) => request('/admin/community.php', { body: { action: 'moderation', mode } }),
      },
      summer: {
        overview:     () => request('/admin/summer.php?view=overview'),
        // `opts` rather than another positional: the roster's filters are
        // server-side now, and a fourth, fifth and sixth argument is how a call
        // site ends up passing them in the wrong order.
        /* `opts` carries the facets — centre, track, schoolType, status,
           consent, id, sex — and they compose with AND on the server. Passed as
           an object rather than positionally because there are seven of them and
           a seventh positional argument is how a call site gets them crossed. */
        students:     (q, cohortId, opts) => request('/admin/summer.php' + qs(Object.assign({ view: 'students', q, cohortId }, opts || {}))),
        consentDocSave: (doc) => request('/admin/summer.php', { body: { action: 'consentDoc', doc } }),
        aiStatus:     (probe) => request('/admin/settings.php' + qs({ view: 'ai', probe: probe ? 1 : '' })),
        qrList:       (status, batch) => request('/admin/summer.php' + qs({ view: 'qr', status, batch })),
        qrVoid:       (token) => request('/admin/summer.php', { body: { action: 'qr_void', token } }),
        qrReassign:   (token, studentId) => request('/admin/summer.php', { body: { action: 'qr_reassign', token, studentId } }),
        mint:         (count) => request('/admin/summer.php', { body: { action: 'mint', count } }),
        enroll:       (data) => request('/admin/summer.php', { body: { action: 'enroll', data } }),
        cohort:       (data) => request('/admin/summer.php', { body: { action: 'cohort', data } }),
        studentStatus:(studentId, status) => request('/admin/summer.php', { body: { action: 'studentStatus', studentId, status } }),
        studentUpdate:(studentId, data) => request('/admin/summer.php', { body: { action: 'studentUpdate', studentId, data } }),
        studentDelete:(studentId) => request('/admin/summer.php', { body: { action: 'studentDelete', studentId } }),
        // scannedAt is only sent for a scan the kiosk took while offline and is
        // flushing later. The server clamps it to the last 24h so punctuality
        // is graded at the moment the card was presented, not at flush time.
        checkin:      (token, method, device, scannedAt) => request('/admin/summer.php', { body: { action: 'checkin', token, method, device, scannedAt } }),
        attendance:   (cohortId, opts) => request('/admin/summer.php' + qs(Object.assign({ view: 'attendance', cohortId }, opts || {}))),
        volunteerAttendance: (opts) => request('/admin/summer.php' + qs(Object.assign({ view: 'volunteer-attendance' }, opts || {}))),
        attendanceDay: (date, opts) => request('/admin/summer.php' + qs(Object.assign({ view: 'attendance-day', date }, opts || {}))),
        insights:     (cohortId) => request('/admin/summer.php' + qs({ view: 'insights', cohortId })),
        archive:      (cohortId, compress) => request('/admin/summer.php', { body: { action: 'archive', cohortId, compress: !!compress } }),
        issueCerts:   (status, cohortId) => request('/admin/summer.php', { body: { action: 'issueCerts', status: status || 'graduated', cohortId: cohortId || '' } }),
        revokeCert:   (certId, restore) => request('/admin/summer.php', { body: { action: 'revokeCert', certId, restore: !!restore } }),
        checkout:     (token) => request('/admin/summer.php', { body: { action: 'checkout', token } }),
        consent:      (studentId) => request('/admin/summer.php' + qs({ view: 'consent', studentId })),
        absenceAlert: (studentId, cohortId) => request('/admin/summer.php', { body: { action: 'absenceAlert', studentId: studentId || '', cohortId: cohortId || '' } }),
        importStudents: (rows) => request('/admin/summer.php', { body: { action: 'import', rows } }),
      },
      /* Member obligations — membership fee, monthly dues, training fee.
         A LEDGER: `payment` RECORDS money somebody already handed over by cash
         or transfer. There is no gateway behind any of these. */
      fees: {
        settings:    () => request('/admin/fees.php'),
        settingsSet: (data) => request('/admin/fees.php', { body: { action: 'settings', data } }),
        member:      (memberId) => request('/admin/fees.php' + qs({ view: 'member', memberId })),
        arrears:     (limit) => request('/admin/fees.php' + qs({ view: 'arrears', limit })),
        /* Find anybody's account, not only a debtor's — the arrears list holds
           people who owe, so it could never answer "has Ada paid?". */
        lookup:      (q) => request('/admin/fees.php' + qs({ view: 'lookup', q })),
        payment:     (memberId, amount, method, reference, note) => request('/admin/fees.php', { body: { action: 'payment', memberId, amount, method, reference, note } }),
        void:        (entryId, reason) => request('/admin/fees.php', { body: { action: 'void', entryId, reason } }),
        mou:         (memberId) => request('/admin/fees.php', { body: { action: 'mou', memberId } }),
        remindOff:   (memberId, off) => request('/admin/fees.php', { body: { action: 'remindOff', memberId, off } }),
        charge:      (memberId, kind, amount, reason, note) => request('/admin/fees.php', { body: { action: 'charge', memberId, kind, amount, reason, note } }),
        waive:       (memberId, amount, reason) => request('/admin/fees.php', { body: { action: 'waive', memberId, amount, reason } }),
        accrue:      (limit) => request('/admin/fees.php', { body: { action: 'accrue', limit } }),
        remindPreview: () => request('/admin/fees.php', { body: { action: 'remindPreview' } }),
        remindRun:     (limit) => request('/admin/fees.php', { body: { action: 'remindRun', limit } }),
        upratePreview: () => request('/admin/fees.php', { body: { action: 'upratePreview' } }),
        uprateApply:   () => request('/admin/fees.php', { body: { action: 'uprateApply' } }),
      },
      /* Programme calendar + Institutional Policy enforcement. The calendar
         decides which days count; the policy engine decides what a missed one
         costs. Both live behind the same 'summer' capability. */
      policy: {
        settings:  () => request('/admin/policy.php' + qs({ view: 'settings' })),
        board:     () => request('/admin/policy.php' + qs({ view: 'board' })),
        person:    (personId, personType) => request('/admin/policy.php' + qs({ view: 'person', personId, personType })),
        save:      (programme, policy, memberProgramme) => request('/admin/policy.php', { body: { action: 'save', programme, policy, memberProgramme } }),
        dayToggle: (date, runs) => request('/admin/policy.php', { body: { action: 'dayToggle', date, runs } }),
        infraction:(personId, personType, kind, date, note) => request('/admin/policy.php', { body: { action: 'infraction', personId, personType, kind, date, note } }),
        void:      (infractionId, reason) => request('/admin/policy.php', { body: { action: 'void', infractionId, reason } }),
        issue:     (personId, personType, kind, reason, opts) => request('/admin/policy.php', { body: Object.assign({ action: 'sanctionIssue', personId, personType, kind, reason }, opts || {}) }),
        update:    (sanctionId, status, note) => request('/admin/policy.php', { body: { action: 'sanctionUpdate', sanctionId, status, note } }),
        reinstate: (personId, personType, opts) => request('/admin/policy.php', { body: Object.assign({ action: 'reinstate', personId, personType }, opts || {}) }),
        sweep:     () => request('/admin/policy.php', { body: { action: 'sweep' } }),
      },
      // Attendance-taker rotation + gamified attendance duty.
      attendance: {
        board:    (date) => request('/admin/attendance.php' + qs({ view: 'board', date })),
        admin:    (date) => request('/admin/attendance.php' + qs({ view: 'admin', date })),
        set:      (date, centre, volunteerId) => request('/admin/attendance.php', { body: { action: 'set', date, centre, volunteerId } }),
        complete: (date, centre, volunteerId) => request('/admin/attendance.php', { body: { action: 'complete', date, centre, volunteerId } }),
        leaderboard: () => request('/admin/attendance.php' + qs({ view: 'leaderboard' })),
      },
      club: {
        overview:   () => request('/admin/club.php?view=overview'),
        promotable: () => request('/admin/club.php?view=promotable'),
        members:    (q) => request('/admin/club.php' + qs({ view: 'members', q })),
        promote:    (studentId) => request('/admin/club.php', { body: { action: 'promote', studentId } }),
      },
      contact: {
        list:   (q) => request('/admin/contact.php' + qs(q || {})),
        status: (id, status) => request('/admin/contact.php', { body: { id, status } }),
      },
      behaviour: {
        list:   (q) => request('/admin/behaviour.php' + qs(q || {})),
        log:    (subjectId, note, category, severity) => request('/admin/behaviour.php', { body: { action: 'log', subjectId, note, category, severity } }),
        review: (logId) => request('/admin/behaviour.php', { body: { action: 'review', logId } }),
      },
      /* Is it broken, and did anyone notice. */
      ops: {
        status: () => request('/admin/ops.php'),
        clear:  (id) => request('/admin/ops.php', { body: { action: 'clear', id: id || 0 } }),
        run:    (job) => request('/admin/ops.php', { body: { action: 'run', job: job || 'all' } }),
      },
      /* Staff, not children: who has filed what, over what window, next to how
         many children they are responsible for. */
      staff: {
        performance: (days) => request('/admin/staff.php?view=performance&days=' + (days || 30)),
        ackRemark:   (remarkId) => request('/admin/staff.php', { body: { action: 'ack', remarkId } }),
        skills:      () => request('/admin/staff.php?view=skills'),
        saveSkills:  (skills) => request('/admin/staff.php', { body: { action: 'skills', skills } }),
      },
      mentor: {
        /* There was no way to make somebody a mentor at all — records only
           appeared by converting a mentor APPLICATION, so anyone already in
           the programme had to have one invented for them. */
        candidates: (q) => request('/admin/mentors.php?view=candidates&q=' + encodeURIComponent(q || '')),
        promote:    (personId, opts) => request('/admin/mentors.php', { body: Object.assign({ action: 'promote', personId }, opts || {}) }),
        demote:     (mentorId) => request('/admin/mentors.php', { body: { action: 'demote', mentorId } }),
      },
      // Tournaments. Centre rounds, then the centre champions meet.
      tournaments: {
        list:     () => request('/admin/tournaments.php' + qs({ view: 'list' })),
        bracket:  (tournamentId) => request('/admin/tournaments.php' + qs({ view: 'bracket', tournamentId })),
        create:   (name, game, programme) => request('/admin/tournaments.php', { body: { action: 'create', name, game: game || 'chess', programme: programme || '' } }),
        enter:    (tournamentId, playerId) => request('/admin/tournaments.php', { body: { action: 'enter', tournamentId, playerId } }),
        withdraw: (tournamentId, playerId) => request('/admin/tournaments.php', { body: { action: 'withdraw', tournamentId, playerId } }),
        advance:  (tournamentId) => request('/admin/tournaments.php', { body: { action: 'advance', tournamentId } }),
        replay:   (tournamentId, matchId) => request('/admin/tournaments.php', { body: { action: 'replay', tournamentId, matchId } }),
        cancel:   (tournamentId) => request('/admin/tournaments.php', { body: { action: 'cancel', tournamentId } }),
      },
      volunteers: {
        list:    () => request('/admin/volunteers.php'),
        approve: (id) => request('/admin/volunteers.php', { body: { action: 'approve', id } }),
        decline: (id, reason) => request('/admin/volunteers.php', { body: { action: 'decline', id, reason: reason || '' } }),
        safeguard: (volunteerId, status) => request('/admin/volunteers.php', { body: { action: 'safeguard', volunteerId, status } }),
        // Portal access, granted per person by a super admin. caps ⊆ ['summer','club'].
        caps:      (volunteerId, caps) => request('/admin/volunteers.php', { body: { action: 'caps', volunteerId, caps } }),
        update:  (volunteerId, data) => request('/admin/volunteers.php', { body: { action: 'update', volunteerId, data } }),
        remove:  (volunteerId) => request('/admin/volunteers.php', { body: { action: 'delete', volunteerId } }),
        needsList:  () => request('/admin/volunteers.php?view=needs'),
        needUpsert: (centreId, role, faculty, needCount) => request('/admin/volunteers.php', { body: { action: 'need_upsert', centreId, role, faculty: faculty || '', needCount } }),
        needDelete: (centreId, role, faculty) => request('/admin/volunteers.php', { body: { action: 'need_delete', centreId, role, faculty: faculty || '' } }),
        itemUpsert: (centreId, item, needCount, filledCount, unit, note) => request('/admin/volunteers.php', { body: { action: 'item_upsert', centreId, item, needCount, filledCount, unit: unit || '', note: note || '' } }),
        itemDelete: (centreId, item) => request('/admin/volunteers.php', { body: { action: 'item_delete', centreId, item } }),
      },
      photos: {
        queue:   () => request('/admin/photos.php'),
        claim:   (assetId) => request('/admin/photos.php', { body: { action: 'claim', assetId } }),
        approve: (assetId, editedUrl, note) => request('/admin/photos.php', { body: { action: 'approve', assetId, editedUrl: editedUrl || '', note: note || '' } }),
        retake:  (assetId, reason) => request('/admin/photos.php', { body: { action: 'retake', assetId, reason } }),
        reject:  (assetId, reason) => request('/admin/photos.php', { body: { action: 'reject', assetId, reason } }),
        // Re-edit ANY image (by assetId, or by subject for already-live photos).
        edit:    (target, spec) => request('/admin/photos.php', { body: Object.assign({ action: 'edit', spec }, target) }),
        replace: (subjectType, subjectId, sourceUrl) => request('/admin/photos.php', { body: { action: 'replace', subjectType, subjectId, sourceUrl } }),
        /* Children with NO photograph on file — a different question from the
           review queue, which can only show photos that exist. */
        missing: (limit) => request('/admin/photos.php' + qs({ view: 'missing', limit })),
        requestMissing: (limit, quietDays) => request('/admin/photos.php', { body: { action: 'request_missing', limit, quietDays } }),
      },
      registration: {
        /* Consent given off-line — on paper, in person or by phone.
           `consents(studentId)` returns what is already on file plus the
           permission list; `consentRecord` writes one child's; `consentBulk`
           writes an explicitly selected list of them. None of these is a
           "verify" call: each carries which permissions were granted, who gave
           them and how, because that is what a consent is and a boolean in its
           place would destroy the only record the programme has. */
        /* Hand over QR images the screen has already drawn, so an ID issued with
           no browser present (a parent clicking a consent link at 2am) can still
           embed a scannable code rather than only a link. */
        qrWarm: (items) => request('/admin/registration.php', { body: { action: 'qr_warm', items }, timeout: 120000 }),
        /* How many verified families are holding an ID email with no scannable
           code, and the action that fixes it. Read first, send second — a bulk
           whose size you cannot see before pressing it is one people press once. */
        qrGaps: () => request('/admin/registration.php' + qs({ view: 'qrgaps' })),
        resendIdBulk: (scope, centre) => request('/admin/registration.php', { body: { action: 'resend_id_bulk', scope, centre: centre || '' }, timeout: 120000 }),
        consents: (studentId) => request('/admin/registration.php' + qs({ view: 'consents', studentId })),
        consentRecord: (data) => request('/admin/registration.php', { body: { action: 'consent_record', ...(data || {}) } }),
        consentBulk: (data) => request('/admin/registration.php', { body: { action: 'consent_bulk', ...(data || {}) }, timeout: 120000 }),
        formsList:  () => request('/admin/registration.php' + qs({ view: 'forms' })),
        form:       (formId) => request('/admin/registration.php' + qs({ view: 'form', formId: formId || 'summer-reg' })),
        publishForm: (formId, fields, name) => request('/admin/registration.php', { body: { action: 'publish_form', formId, fields, name } }),
        gates:      () => request('/admin/registration.php' + qs({ view: 'gates' })),
        gateCreate: (name, expiresAt, password, centreId, opts) => request('/admin/registration.php', { body: Object.assign({ action: 'gate_create', name, expiresAt, password: password || '', centreId: centreId || '' }, opts || {}) }),
        gateSetpass: (gateId, password, generate) => request('/admin/registration.php', { body: { action: 'gate_setpass', gateId, password: password || '', generate: !!generate } }),
        gateValidity: (gateId, opts) => request('/admin/registration.php', { body: Object.assign({ action: 'gate_validity', gateId }, opts || {}) }),
        gateRotate: (gateId) => request('/admin/registration.php', { body: { action: 'gate_rotate', gateId } }),
        gateRotation: (gateId, rotateDays, notifyEmail, expiryDays) => request('/admin/registration.php', { body: { action: 'gate_rotation', gateId, rotateDays, notifyEmail: notifyEmail || '', expiryDays: expiryDays || 0 } }),
        gateRevoke: (gateId) => request('/admin/registration.php', { body: { action: 'gate_revoke', gateId } }),
        gateDelete: (gateId) => request('/admin/registration.php', { body: { action: 'gate_delete', gateId } }),
        /* The public sign-up door.
           The normal way to close it is the LINK'S OWN end date (gateValidity) —
           per-intake, already in the UI, and what an admin reaches for. These
           two are the global override for pausing every public link at once, and
           for the note families read on the closed screen. */
        selfregState: () => request('/admin/registration.php' + qs({ view: 'selfreg' })),
        selfregSetOpen: (open, note) => request('/admin/registration.php', { body: { action: 'selfreg_open', open: !!open, note: note || '' } }),
        // Search/filter/page are server-side: at a hundred centres the cohort is
        // far too large to ship to the browser and filter there.
        list:       (opts) => request('/admin/registration.php' + qs(Object.assign({ view: 'registrations' }, opts || {}))),
        remind:     (studentId) => request('/admin/registration.php', { body: { action: 'remind', studentId } }),
        remindBulk: (opts) => request('/admin/registration.php', { body: Object.assign({ action: 'remind_bulk' }, opts || {}) }),
        centres:      () => request('/admin/registration.php' + qs({ view: 'centres' })),
        centreUpsert: (data) => request('/admin/registration.php', { body: { action: 'centre_upsert', data } }),
        centreDelete: (centreId) => request('/admin/registration.php', { body: { action: 'centre_delete', centreId } }),
        catalogue:    () => request('/admin/registration.php' + qs({ view: 'catalogue' })),
        catalogueSet: (catalogue) => request('/admin/registration.php', { body: { action: 'catalogue_set', catalogue } }),
        catalogueReset: () => request('/admin/registration.php', { body: { action: 'catalogue_set', reset: true } }),
        cards:        (studentId) => request('/admin/registration.php' + qs({ view: 'cards', studentId })),
        hierarchy:       () => request('/admin/registration.php' + qs({ view: 'hierarchy' })),
        hierarchyUpsert: (data) => request('/admin/registration.php', { body: { action: 'hierarchy_upsert', data } }),
        hierarchyDelete: (tierId) => request('/admin/registration.php', { body: { action: 'hierarchy_delete', tierId } }),
        volunteerCards:  (volunteerId) => request('/admin/registration.php' + qs({ view: 'vcards', volunteerId })),
        /* ID card designs. `save` writes a draft; `publish` freezes the copy a
           print run reads, and refuses on a preflight error — a check that only
           ran in the browser is one a crafted request skips, and what it guards
           is three hundred pieces of card. */
        templates:       (kind) => request('/admin/registration.php' + qs({ view: 'templates', kind: kind || '' })),
        template:        (templateId) => request('/admin/registration.php' + qs({ view: 'template', templateId })),
        templateSave:    (templateId, template) => request('/admin/registration.php', { body: { action: 'template_save', templateId: templateId || '', template } }),
        templatePublish: (templateId) => request('/admin/registration.php', { body: { action: 'template_publish', templateId } }),
        templateCheck:   (template) => request('/admin/registration.php', { body: { action: 'template_check', template } }),
        templateDelete:  (templateId) => request('/admin/registration.php', { body: { action: 'template_delete', templateId } }),
        /* The design asset library. An image placed in a design is a URL into
           here, never bytes inside the design — a design is capped at 512KB and
           one 1600px photograph is 548KB base64, so inlining meant a poster with
           a photo on it could not be saved at all. */
        assets:       (folder, q) => request('/admin/registration.php' + qs({ view: 'assets', folder: folder || '', q: q || '' })),
        assetUsage:   (assetId) => request('/admin/registration.php' + qs({ view: 'assetUsage', assetId })),
        assetUpload:  (data) => request('/admin/registration.php', { body: { action: 'asset_upload', ...(data || {}) }, timeout: 120000 }),
        assetRename:  (assetId, name) => request('/admin/registration.php', { body: { action: 'asset_rename', assetId, name } }),
        assetDelete:  (assetId, force) => request('/admin/registration.php', { body: { action: 'asset_delete', assetId, force: !!force } }),
        /* Data merge: the people one design run covers. NOT the card payload —
           that one only returns children who already hold an ID, which is the
           wrong population for a certificate. See api/_lib/domain/merge.php. */
        mergeRows:    (f) => request('/admin/registration.php' + qs({ view: 'merge',
                        audience: (f && f.audience) || 'students', centre: (f && f.centre) || '',
                        track: (f && f.track) || '', role: (f && f.role) || '', q: (f && f.q) || '',
                        from: (f && f.from) || '', to: (f && f.to) || '',
                        attendedMin: (f && f.attendedMin) || 0, photo: (f && f.photo) || '',
                        issued: (f && f.issued) || '', limit: (f && f.limit) || 0 })),
        // Resend a student's or volunteer's ID (email + SMS where on file).
        // qrPng (optional data URL) is cached server-side so the email can embed
        // the scannable QR via the hosted /api/public/qr.php image.
        resendId:    (kind, id, qrPng) => request('/admin/registration.php', { body: { action: 'resend_id', kind, id, qrPng } }),
      },
      // A member's public projects + mentor notes (subjectType: student|volunteer).
      profiles: {
        extras:       (subjectType, subjectId) => request('/admin/profiles.php' + qs({ subjectType, subjectId })),
        projectUpsert: (data) => request('/admin/profiles.php', { body: Object.assign({ action: 'project_upsert' }, data) }),
        // Delete is scoped to the subject server-side, so pass the subject too.
        projectDelete: (subjectType, subjectId, id) => request('/admin/profiles.php', { body: { action: 'project_delete', subjectType, subjectId, id } }),
        noteUpsert:   (data) => request('/admin/profiles.php', { body: Object.assign({ action: 'note_upsert' }, data) }),
        noteDelete:   (subjectType, subjectId, id) => request('/admin/profiles.php', { body: { action: 'note_delete', subjectType, subjectId, id } }),
      },
      integrations: {
        list:     () => request('/admin/integrations.php'),
        upsert:   (data) => request('/admin/integrations.php', { body: { action: 'upsert', data } }),
        remove:   (integrationId) => request('/admin/integrations.php', { body: { action: 'delete', integrationId } }),
        test:     (integrationId) => request('/admin/integrations.php', { body: { action: 'test', integrationId } }),
        dispatch: () => request('/admin/integrations.php', { body: { action: 'dispatch' } }),
        retry:    (integrationId = "") => request('/admin/integrations.php', { body: { action: 'retry', integrationId } }),
        syncMembers: () => request('/admin/integrations.php', { body: { action: 'sync_members' } }),
      },
      settings: {
        get: () => request('/admin/settings.php'),
        set: (data) => request('/admin/settings.php', { body: { data } }),
        testMail: (to) => request('/admin/settings.php', { body: { action: 'testMail', to } }),
      },
      audit:     (q) => request('/admin/audit.php' + qs(typeof q === 'object' && q ? q : { limit: q })),
    },
  };

  function qs(obj) {
    const parts = [];
    for (const k in obj) {
      if (obj[k] === undefined || obj[k] === null || obj[k] === '') continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  /* Replayable intake ops, addressed by name.
   *
   * The outbox persists a queued submission across reloads, so it cannot hold a
   * function reference — it stores an op NAME and a plain payload, and looks the
   * sender up here when it drains. Each takes exactly one serialisable object
   * for that reason.
   *
   * These names match the server's intake list in api/_lib/backend.php, which
   * is what makes a replay idempotent: every payload carries a submissionId and
   * intake_once() returns the original result instead of acting twice. Adding an
   * op here without adding it there would make retries duplicate records. */
  API.__outboxOps = {
    'selfreg.submit': (p) => request('/public/selfreg.php', { body: p }),
    'gate.register':  (p) => request('/public/gate.php', { body: Object.assign({ action: 'register' }, p) }),
    'public.apply':   (p) => request('/public/apply.php', { body: p }),
    'public.contact': (p) => request('/public/contact.php', { body: p }),
    'reshoot.submit': (p) => request('/public/reshoot.php', { body: p }),
  };

  global.NGGApi = API;
  global.NGGApiBase = BASE;
})(window);
