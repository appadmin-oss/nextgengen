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

  /* The CSRF token is a cookie that only GET /auth/me.php mints. A write made
     * without it is refused 403 csrf_failed, and every screen then showed its
     * generic "Something went wrong" — a staff member's edit or import silently
     * failing because the cookie had expired or this tab never called me.php.
     * So: mint one before a write that has none, and mint-and-retry once if the
     * server still says csrf_failed (the cookie was rotated by another tab). */
  async function mintCsrf() {
    try { await fetch(BASE + '/auth/me.php', { credentials: 'include', cache: 'no-store' }); } catch (_) {}
    return getCookie('ngg_csrf');
  }
  /* A saved change, said out loud: screens that show records (the ID Card
     Studio) read them again when one is made — here, or in another tab of the
     same browser (the storage event). Only writes that change records: staff
     writes and a person's own photo or profile, not a typing ping. At most one
     announcement every two seconds. */
  const CHANGE_PATHS = /^\/(admin\/|member\/(profile|photo|account)|public\/reshoot)/;
  let changeAt = 0;
  function announceChange(path) {
    if (!CHANGE_PATHS.test(String(path || ''))) return;
    const now = Date.now();
    if (now - changeAt < 2000) return;
    changeAt = now;
    try { window.dispatchEvent(new CustomEvent('ngg:changed', { detail: { path } })); } catch (_) {}
    try { localStorage.setItem('ngg.changed', now + ' ' + String(path).split('?')[0]); } catch (_) {}
  }
  async function request(path, opts) {
    const o = opts || {};
    const m = o.method || (o.body ? 'POST' : 'GET');
    const write = m !== 'GET' && m !== 'HEAD';
    if (write && !getCookie('ngg_csrf')) await mintCsrf();
    try { const r = await requestRaw(path, opts); if (write) announceChange(path); return r; }
    catch (e) {
      if (write && e && e.code === 'csrf_failed' && await mintCsrf()) return await requestRaw(path, opts);
      /* The record drive locked this member's account until their record is
         complete (domain/profile-drive.php): tell the app, which shows the
         form, whatever screen asked. */
      /* A session that still owes its second sign-in step (domain/mfa.php):
         every route but the step itself answers mfa_required, and the app
         opens the step wherever it was asked from. */
      if (e && e.code === 'mfa_required') { try { window.dispatchEvent(new CustomEvent('ngg:mfa-required', { detail: { path } })); } catch (_) {} }
      if (e && e.code === 'record_incomplete') { try { window.dispatchEvent(new CustomEvent('ngg:record-incomplete')); if (window.__onRecordIncomplete) window.__onRecordIncomplete(); } catch (_) {} }
      throw e;
    }
  }

  /* Which of the signed-in person's own roles a portal is acting as. A person
     who both mentors and teaches is an instructor in the Instructor Portal
     (mentor_gate reads X-NGG-As); it never adds a role they do not hold. Set
     while that portal is mounted, cleared when it unmounts. */
  let portalAs = '';
  async function requestRaw(path, opts) {
    opts = opts || {};
    const method = opts.method || (opts.body ? 'POST' : 'GET');
    const headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    if (portalAs) headers['X-NGG-As'] = portalAs;
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
      /* Say WHY in the console. The browser's own line ("Failed to load
         resource: 400") names the status and nothing else, and that line is
         what people copy into a support message — so the reason has to sit
         beside it, or a refusal on a live site cannot be diagnosed at all. */
      try { console.warn('[NGG] ' + method + ' ' + path.split('?')[0] + ' refused (HTTP ' + res.status + '): ' + (data.error || '(no error code — something in front of the site answered)') + (data.detail ? ' — ' + data.detail : '') + (data.message ? ' — ' + data.message : '')); } catch (_) {}
      const err = new Error(data.error || ('http_' + res.status));
      err.status = res.status;
      /* An expired or revoked session is not a per-screen problem, and every
         screen discovering it separately is why it surfaced as a raw code in a
         red toast beside a half-filled form. Announce it once; the auth layer
         decides what the user sees. Sign-in endpoints are exempt — a failed
         sign-in attempt is a 401 too, and it must not look like an expiry.
         A family-account 401 is a different principal's cookie entirely and
         says nothing about the member session. */
      if (res.status === 401 && !/\/auth\/(login|verify|pick|request|gateway|reset)/.test(path) && !/^\/family\//.test(path)) {
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

  /* ── "Who's signing in?" ──────────────────────────────────────────────────
   * An email is often on several member accounts (brothers and sisters on a
   * parent's address). The server checks the code, link or password first,
   * then answers { pick, pickToken } instead of a session; this asks which
   * account, and auth/pick.php opens it. It lives here, under auth.verify and
   * auth.login, so every sign-in screen (the site, the journal, the portals,
   * the timetable) gets it without each one learning a new step.
   * Built from DOM nodes with textContent, never markup from a name. Escape
   * or Cancel rejects with pick_cancelled; focus goes back where it was. */
  function authPickDialog(people) {
    return new Promise(resolve => {
      const prev = document.activeElement;
      const back = document.createElement('div'); back.className = 'ngg-pick-back';
      const box = document.createElement('div'); box.className = 'ngg-pick';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ngg-pick-h'); box.setAttribute('aria-describedby', 'ngg-pick-p');
      const h = document.createElement('h2'); h.id = 'ngg-pick-h'; h.className = 'ngg-pick-h'; h.textContent = 'Who’s signing in?';
      const p = document.createElement('p'); p.id = 'ngg-pick-p'; p.className = 'ngg-pick-p';
      p.textContent = 'This email is on ' + people.length + ' NGG accounts. Choose yours.';
      const list = document.createElement('ul'); list.className = 'ngg-pick-list';
      const done = id => { document.removeEventListener('keydown', onKey, true); back.remove(); try { prev && prev.focus && prev.focus(); } catch (_) {} resolve(id); };
      people.forEach(x => {
        const li = document.createElement('li');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ngg-pick-who';
        const face = document.createElement('span'); face.className = 'ngg-pick-face'; face.setAttribute('aria-hidden', 'true');
        if (x.photoUrl) { const img = document.createElement('img'); img.src = x.photoUrl; img.alt = ''; img.onerror = () => { img.remove(); face.textContent = x.initials || '?'; }; face.appendChild(img); }
        else face.textContent = x.initials || '?';
        const t = document.createElement('span'); t.className = 'ngg-pick-t';
        const n = document.createElement('b'); n.textContent = x.name || x.first || 'Account';
        const sub = document.createElement('small'); sub.textContent = [x.displayId, x.centre].filter(Boolean).join(' · ') || ' ';
        t.appendChild(n); t.appendChild(sub);
        b.appendChild(face); b.appendChild(t);
        b.addEventListener('click', () => done(x.memberId));
        li.appendChild(b); list.appendChild(li);
      });
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ngg-pick-cancel'; cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => done(null));
      box.appendChild(h); box.appendChild(p); box.appendChild(list); box.appendChild(cancel);
      back.appendChild(box);
      back.addEventListener('click', e => { if (e.target === back) done(null); });
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); return; }
        if (e.key !== 'Tab') return;
        const f = Array.from(box.querySelectorAll('button'));
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(back);
      const first = box.querySelector('.ngg-pick-who'); if (first) first.focus();
    });
  }
  async function withPick(r, remember) {
    if (!r || !Array.isArray(r.pick)) return r;
    const id = await authPickDialog(r.pick);
    if (!id) { const e = new Error('pick_cancelled'); e.code = 'pick_cancelled'; e.status = 0; throw e; }
    return request('/auth/pick.php', { body: { pickToken: r.pickToken, memberId: id, remember: !!remember } });
  }

  // ---- Cloudinary direct upload -------------------------------------------
  // Ask the PHP proxy for a short-lived signature, then POST the file straight
  // to Cloudinary. The api_secret never touches the browser.
  let _configCache = null;
  async function getConfig() {
    if (_configCache) return _configCache;
    /* site-config.php first: a host firewall refuses any path ending in
       config.php (403 before PHP runs), which left the app thinking no image
       cloud existed. The old name stays as the fallback for an older server. */
    try { _configCache = await request('/public/site-config.php'); }
    catch (_) {
      try { _configCache = await request('/public/config.php'); }
      catch (__) { _configCache = { uploads: { enabled: false } }; }
    }
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
    /* Community posts and hand-ins: the same size and quality setting as
       before, encoded as WebP when that is smaller (it usually is, by a
       quarter to a third), and a photo already small enough keeps its own
       pixels with only its hidden data (camera, GPS) removed — lossless.
       Headshots stay JPEG: they are print artwork for the card pipeline. */
    post: { maxPx: 1600, quality: 0.82, webp: true },
    proof: { maxPx: 2000, quality: 0.82, webp: true },
    /* For an image that travels INSIDE a JSON submission rather than as its own
       upload. Sized against nginx's 1MB client_max_body_size default, which is
       the tightest limit in common use — a 413 on a form's last tap is the
       worst possible place to discover a body limit. */
    inline: { maxPx: 1000, quality: 0.78 },
    /* A promotion's picture is drawn about 320px wide beside two lines of
       text, and it ships inside every promo the members fetch when there is no
       image cloud to put it on. Anything bigger is data nobody sees, paid for
       by somebody's bundle. */
    promo: { maxPx: 640, quality: 0.72 },
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
      const type = r.blob.type || 'image/jpeg';
      const name = String(file.name || 'photo').replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : type === 'image/png' ? '.png' : '.jpg');
      return new File([r.blob], name, { type, lastModified: Date.now() });
    } catch (_) {
      return file;   // optimiser unavailable — send the original rather than fail
    }
  }

  /* What is this file, in the four terms the signer understands?
   *
   * This used to be one line — video, or else image — and "or else image" is
   * what turned every shared PDF into a PNG: the server signed an image upload
   * with an `f_auto` incoming transformation, and Cloudinary dutifully
   * rasterised page one and stored that instead of the document.
   *
   * MIME type first, because the file picker and the camera both set it, then
   * the extension, because a file dragged from some Android file managers
   * arrives with an empty `type`. A document must be recognised by either
   * route — being wrong here silently destroys the thing the member attached.
   */
  const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|csv|rtf|odt|ods|odp|zip)$/i;
  function mediaKindOf(file) {
    const type = (file && file.type) || '';
    const name = (file && file.name) || '';
    // Cloudinary stores audio as a `video` resource: a voice note is a recording, not a document.
    if (/^(video|audio)\//.test(type) || /\.(mp3|m4a|wav|ogg|oga|aac|weba)$/i.test(name)) return 'video';
    if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
    if (/^image\//.test(type)) return 'image';
    if (DOC_EXT.test(name) || /^(application|text)\//.test(type)) return 'raw';
    return 'image';
  }

  async function uploadFile(file, kind, onProgress) {
    kind = kind || 'proof';
    if (onProgress) onProgress(0);
    file = await shrinkForUpload(file, kind);
    // Headshots are captured on PUBLIC surfaces (apply, gate registration, the
    // guardian reshoot page) where there is no session — so they sign through
    // the public headshot endpoint. Everything else uses the member endpoint.
    const mediaKind = mediaKindOf(file);
    /* name, type and size travel too: a bucket upload (R2 / B2) is signed for
       one content type and one exact length, so the server must know both. */
    const about = { name: file.name || '', contentType: file.type || '', size: file.size || 0 };
    /* The file's fingerprint: if the bucket already holds these exact bytes,
       the server says so and nothing is uploaded (api/_lib/domain/media-objects.php). */
    const sha256 = kind === 'headshot' ? '' : await fileSha256(file);
    if (sha256) about.sha256 = sha256;
    const signFor = (refused) => kind === 'headshot'
      ? request('/public/upload-headshot-sign.php', { body: Object.assign({ refused }, about) })
      : request('/member/upload-sign.php', { body: Object.assign({ kind, mediaKind, refused }, about) });
    const sig = await signFor(undefined);
    if (sig.provider === 'existing') {
      if (onProgress) onProgress(100);
      return { url: sig.publicUrl, publicId: sig.key, resourceType: sig.resourceType, format: sig.format, bytes: sig.size,
               mediaKind: mediaKind, pages: 0, originalName: file.name || '', reused: true };
    }
    if (sig.provider === 's3') {
      const done = await putToStore(file, sig, mediaKind, onProgress);
      // Let the server read it back and fingerprint it, so the next identical upload can reuse it. Best effort.
      if (sha256) request('/member/upload-done.php', { body: { key: sig.key, sha256 } }).catch(() => {});
      return done;
    }
    try {
      return await postToCloudinary(file, sig, mediaKind, onProgress);
    } catch (e) {
      /* The account uploads go to may be spent. Say so when asking for a fresh
         signature: the server checks the account itself and, if it is, signs
         for the backup — then this one upload is tried once more there. */
      if (!e.cldStatus || !QUOTA_RE.test(e.cldStatus + ' ' + e.message)) throw e;
      let again = null;
      try { again = await signFor({ cloud: sig.cloudName, status: e.cldStatus, message: e.message.slice(0, 300) }); } catch (_) { throw e; }
      if (!again || again.provider === 'existing' || again.cloudName === sig.cloudName) throw e;
      if (again.provider === 's3') return await putToStore(file, again, mediaKind, onProgress);
      if (onProgress) onProgress(0);
      return await postToCloudinary(file, again, mediaKind, onProgress);
    }
  }

  /* What a spent Cloudinary plan answers with: 420/429, or words about limits. */
  const QUOTA_RE = /^(420|429)\b|limit|quota|credit|exceed|disabled|suspend|plan/i;

  /* One signed POST straight to Cloudinary. A refusal rejects with Cloudinary's
     own message and the HTTP status (`cldStatus`), so the caller can tell a
     spent plan from a bad file. */
  function postToCloudinary(file, sig, mediaKind, onProgress) {
    return new Promise((resolve, reject) => {
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
      // Documents keep the member's own filename, so the delivered URL still
      // ends in the real extension. Signed server-side — must match exactly.
      if (sig.useFilename) { fd.append('use_filename', 'true'); fd.append('unique_filename', 'true'); }
      // The formats this signature allows — signed server-side, so it must be sent exactly.
      if (sig.allowedFormats) fd.append('allowed_formats', sig.allowedFormats);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', sig.uploadUrl);
      if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && d.secure_url) {
          /* `format` is what Cloudinary decided it stored, and it is the honest
             answer to "did the document survive the trip". A caller that asked
             to upload a PDF and is handed back format 'png' has been given a
             picture of page one — worth knowing at the call site rather than
             three screens later when somebody tries to open it. */
          resolve({ url: d.secure_url, publicId: d.public_id, resourceType: d.resource_type,
                    format: d.format, bytes: d.bytes, mediaKind: mediaKind,
                    pages: d.pages || 0, originalName: file.name || '' });
        } else {
          const err = new Error((d.error && d.error.message) || ('upload_failed_' + xhr.status));
          err.cldStatus = xhr.status;
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('upload_network_error'));
      xhr.send(fd);
    });
  }

  /* SHA-256 of a file, hex, or '' where the browser cannot (an http:// page has no crypto.subtle). */
  async function fileSha256(file) {
    try {
      if (!(window.crypto && crypto.subtle && file && file.arrayBuffer) || file.size > 30 * 1024 * 1024) return '';
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      return Array.prototype.map.call(h, b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { return ''; }
  }

  /* A presigned PUT straight to the bucket. The URL is good for one key, one
     content type and one byte length: the type is the server's (from its
     allow-list), never the browser's guess, and the length is the file's. */
  function putToStore(file, sig, mediaKind, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(sig.method || 'PUT', sig.uploadUrl);
      const h = sig.headers || {};
      Object.keys(h).forEach((k) => xhr.setRequestHeader(k, h[k]));
      if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ url: sig.publicUrl, publicId: sig.key, resourceType: sig.resourceType, format: sig.format,
                    bytes: file.size, mediaKind: mediaKind, pages: 0, originalName: file.name || '' });
        } else {
          /* S3 answers in XML: <Code>SignatureDoesNotMatch</Code>, AccessDenied… */
          const code = (String(xhr.responseText || '').match(/<Code>([^<]+)<\/Code>/) || [])[1];
          reject(new Error(code ? 'storage_' + code : ('upload_failed_' + xhr.status)));
        }
      };
      // A refused CORS preflight lands here too: the bucket's CORS rule must allow PUT from this site.
      xhr.onerror = () => reject(new Error('upload_network_error'));
      xhr.send(file);
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
    /* Signed first: the signer compresses the image before Cloudinary stores
       it and refuses when storage is full. The unsigned preset does neither,
       so it is only the fallback for a host with no signing keys. */
    if (canSigned) {
      try { return Object.assign({ inline: false }, await uploadFile(file, kind, onProgress)); }
      catch (e) { why = 'signed: ' + (e && e.message || 'failed'); }
    }
    if (canPublic && !canSigned) {
      try { return Object.assign({ inline: false }, await uploadPublic(await shrinkForUpload(file, kind), onProgress)); }
      catch (e) { why = (why ? why + '; ' : '') + 'public: ' + (e && e.message || 'failed'); }
    }
    if (onProgress) onProgress(50);
    const url = await inlineImage(file);
    // Only a fault when a cloud was configured and still could not be used. No
    // cloud at all is a supported way to run this and must not cry wolf.
    if (why && (canPublic || canSigned)) reportUploadFallback(kind, why);
    /* Store it on this server, in pieces, before anything uses it. Sent inline,
       the photo rode inside the save that used it — a member's record — and a
       body that large is what this host's firewall refuses (403, or a reset
       connection), failing the whole save. Signed-in only; a public form with
       no session keeps the inline photo, which its own endpoint stores. */
    try {
      const stored = await storeInPieces(url, p => { if (onProgress) onProgress(50 + Math.round(p * 50)); });
      if (stored) return { url: stored, inline: false, local: true, fallbackReason: why };
    } catch (_) { /* not signed in, or the store refused: the inline image still works */ }
    if (onProgress) onProgress(100);
    return { url: url, inline: true, bytes: url.length, fallbackReason: why };
  }

  const PHOTO_PIECE = 60000;   // base64 characters per request — far under any body limit
  async function storeInPieces(dataUrl, onPart) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
    if (!m) return '';
    const mime = m[1], b64 = m[2];
    const total = Math.ceil(b64.length / PHOTO_PIECE);
    if (total < 1 || total > 80) return '';
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    const uploadId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    let last = null;
    for (let i = 0; i < total; i++) {
      last = await request('/member/photo-chunk.php', { body: { uploadId, index: i, total, mime, data: b64.slice(i * PHOTO_PIECE, (i + 1) * PHOTO_PIECE) }, timeout: 60000 });
      if (onPart) onPart((i + 1) / total);
    }
    return (last && last.url) || '';
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

  /* ── Roster import: the roster is ONE value on the wire ───────────────────
   *
   * The import was refused with 406, by the host's firewall rather than by this
   * application — measured against the live site, which counts the values in a
   * JSON body and rejects a request carrying a few thousand of them. A
   * 136-member roster posted as an array of objects is about 3000 values, so it
   * was always going to hit that wall and did as the roster grew. Size is not
   * the problem: 322KB in 161 values goes through, 55KB in 3201 values does
   * not. File uploads are refused outright on the same host, so posting the
   * file as an upload is not the way out either.
   *
   * So the roster travels as `rosterJson` — the file's own text, one value
   * however many members it holds. That also hands the server the file instead
   * of the browser's summary of it: the server parses it, hashes it, and takes
   * the workbook name from inside it, none of which it could do before.
   *
   * The older shape stays as the fallback, for a server that predates this and
   * for a host with nothing in the way. Both send the same file, so the digest
   * that holds an apply to its dry run is unaffected either way.
   */
  function rosterOneValueBody(file, opts) {
    return { action: 'import', rosterJson: file.text,
      // Only a fallback for the workbook name: the file names itself inside.
      source: (file && file.source) || '',
      apply: !!opts.apply, overwrite: !!opts.overwrite,
      expectDigest: opts.expectDigest || '',
      /* These two were missing, so the drawer's card-format picker was ignored
         on the main route and the server always used its default. */
      cardFormat: opts.cardFormat === undefined ? 'member-number' : opts.cardFormat,
      idStrict: !!opts.idStrict };
  }

  function rosterRowsBody(file, opts) {
    return Object.assign({ action: 'import', members: (file && file.members) || file,
      source: (file && file.source) || '', fileSha: (file && file.fileSha) || '' }, opts);
  }

  /* Refused by something that is not this application — the reply carried no
     error code of ours, so nothing in PHP answered. `no_members_array` is the
     one app code that belongs here too: it is what a server too old to know
     about `rosterJson` says about a body that only carries one. */
  function rosterOtherDoor(e) {
    return !!e && e.status >= 400 && (!e.code || e.code === 'no_members_array');
  }

  function rosterBlocked(e) {
    const err = new Error('blocked_upstream');
    err.code = 'blocked_upstream';
    err.status = e.status;
    err.detail = 'The host refused the request with HTTP ' + e.status + ' before it reached the site, so '
      + 'this is its web application firewall and not the importer — a 406 is what mod_security answers '
      + 'with on cPanel. Ask the host to allow POSTs to /api/admin/members.php, or run the import from a '
      + 'shell: php api/tools/seed-members.php --file <roster>.';
    return err;
  }

  async function importRoster(file, opts) {
    opts = opts || {};
    // No file text (an older caller, or a roster handed over as a bare array):
    // there is nothing to send as one value, so the rows are the only route.
    if (!file || !file.text) return await request('/admin/members.php', { body: rosterRowsBody(file, opts) });
    try {
      return await request('/admin/members.php', { body: rosterOneValueBody(file, opts) });
    } catch (e) {
      if (!rosterOtherDoor(e)) throw e;
      try {
        return await request('/admin/members.php', { body: rosterRowsBody(file, opts) });
      } catch (e2) {
        // Both shapes refused by something in front of PHP. Say so in terms the
        // person can act on — the alternative is a red toast reading http_406.
        throw e2.code ? e2 : rosterBlocked(e2);
      }
    }
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
    /* A photo of a document (a school report) as a data URL, at the size the
       'proof' preset uses: every score on it has to stay readable, which the
       1000px inline size does not promise. Never above 3.5MB of base64, the
       most the family piece store takes (80 pieces). */
    documentToDataUrl: async (file) => {
      let out = file;
      try { const tools = await ensureImageTools(); const prep = await tools.prepare(file, SHRINK.proof); if (!prep.skipped && prep.blob) out = prep.blob; } catch (_) {}
      let url = typeSendable(out && out.type) ? await blobToDataUrl(out) : '';
      for (const step of [{ maxPx: 2000, quality: 0.8 }, { maxPx: 1600, quality: 0.74 }, { maxPx: 1300, quality: 0.7 }]) {
        if (url && url.length <= 3500000 && /^data:image\/(jpeg|png|webp);/.test(url)) break;
        const shrunk = await canvasShrink(file, step.maxPx, step.quality, 320);
        if (!shrunk) break;
        url = await blobToDataUrl(shrunk);
      }
      return url;
    },
    /* Act as one of the person's own roles ('instructor') while a portal is open; '' clears it. */
    setPortalAs: (v) => { portalAs = v === 'instructor' ? 'instructor' : ''; },
    // Exposed for the browser test: the no-network fallback shrink, which
    // decides whether a photo is accepted when the optimiser cannot be fetched.
    __canvasShrink: canvasShrink,
    // …and the classifier that decides what a file IS. Worth testing directly:
    // getting this wrong does not fail an upload, it silently stores something
    // other than what the member chose.
    __mediaKindOf: mediaKindOf,
    auth: {
      // `hp` is the sign-in form's honeypot: empty from a person, filled by a
      // script that types into every field (see bot_trap_tripped()).
      gateway: (identifier, hp) => request('/auth/gateway.php', { body: { identifier, hp: hp || '' } }),
      request: (identifier, hp) => request('/auth/request.php', { body: { identifier, hp: hp || '' } }),
      login:   (identifier, password, remember, hp) => request('/auth/login.php', { body: { identifier, password, remember: !!remember, hp: hp || '' } }).then(r => withPick(r, remember)),
      resetRequest: (identifier, hp) => request('/auth/reset-request.php', { body: { identifier, hp: hp || '' } }),
      resetConfirm: (creds) => request('/auth/reset-confirm.php', { body: creds }),
      setPassword: (password, current) => request('/auth/set-password.php', { body: { password, current: current || '' } }),
      verify:  (creds) => request('/auth/verify.php', { body: creds }).then(r => withPick(r, creds && creds.remember)),
      studentLogin: (creds) => request('/auth/student-login.php', { body: creds }),
      me:      () => request('/auth/me.php'),
      /* Two-step sign-in, for whoever is signed in; family: true for a guardian. */
      mfa: {
        status:    (family) => request('/auth/mfa.php' + (family ? '?who=family' : '')),
        challenge: (family) => request('/auth/mfa.php' + (family ? '?who=family' : ''), { body: { action: 'challenge' } }),
        verify:    (answer, family) => request('/auth/mfa.php' + (family ? '?who=family' : ''), { body: { action: 'verify', answer } }),
        start:     (type, family, phone) => request('/auth/mfa.php' + (family ? '?who=family' : ''), { body: Object.assign({ action: 'start', type }, phone ? { phone } : {}) }),
        enroll:    (data, family) => request('/auth/mfa.php' + (family ? '?who=family' : ''), { body: Object.assign({ action: 'enroll' }, data) }),
        off:       (current, family) => request('/auth/mfa.php' + (family ? '?who=family' : ''), { body: { action: 'off', current } }),
        backup:    (current, family) => request('/auth/mfa.php' + (family ? '?who=family' : ''), { body: { action: 'backup', current } }),
      },
      logout:  () => request('/auth/logout.php', { method: 'POST' }),
      adminTotpSetup:  () => request('/auth/admin-totp-setup.php', { method: 'POST' }),
      adminTotpVerify: (code) => request('/auth/admin-2fa.php', { body: { code } }),
      // Lock: the cookie loses its 2FA clearance on the server, not only in the page.
      adminLock:       () => request('/auth/admin-lock.php', { method: 'POST' }),
    },
    member: {
      record:      () => request('/member/record.php'),
      recordSave:  (values) => request('/member/record.php', { body: { values } }),
      dashboard:     () => request('/member/dashboard.php'),
      anchor:        () => request('/member/anchor.php'),
      /* Mentor Portal — the mentor's pod (and the mentee's own offer and
         relationship check). read(view): today | case | academy | policy | offer. */
      pod: {
        read: (view, memberId) => request('/member/pod.php' + qs({ view, memberId: memberId || '' })),
        act:  (action, body) => request('/member/pod.php', { body: Object.assign({ action }, body || {}) }),
      },
      mentorRoster:  (centre, scope, programme) => request('/member/mentor.php' + qs({ centre: centre || '', scope: scope || '', programme: programme || '' })),
      // The mentoring record for one child: history, meetings, goals.
      mentorChild:   (subjectId) => request('/member/mentor.php' + qs({ view: 'child', subjectId })),
      mentorChildLessons: (subjectId) => request('/member/mentor.php' + qs({ view: 'lessons', subjectId })),
      // Open a record that is not my mentee's, for a week, saying why.
      mentorCover:   (subjectId, reason) => request('/member/mentor.php', { body: { action: 'cover', subjectId, reason } }),
      mentorAttention: (centre) => request('/member/mentor.php' + qs({ view: 'attention', centre: centre || '' })),
      mentorMeeting: (subjectId, m) => request('/member/mentor.php', { body: Object.assign({ action: 'meeting', subjectId }, m || {}) }),
      mentorMeetingDelete: (subjectId, id) => request('/member/mentor.php', { body: { action: 'meetingDelete', subjectId, id } }),
      mentorGoal:    (subjectId, g) => request('/member/mentor.php', { body: Object.assign({ action: 'goal', subjectId }, g || {}) }),
      mentorGoalStatus: (subjectId, id, status) => request('/member/mentor.php', { body: { action: 'goalStatus', subjectId, id, status } }),
      starGive:      (subjectId, stars, category, note) => request('/member/mentor.php', { body: { action: 'star', subjectId, stars, category, note } }),
      v3Rate:        (subjectId, verbal, vocal, visual, note) => request('/member/mentor.php', { body: { action: 'v3', subjectId, verbal, vocal, visual, note } }),
      /* One observed instance on the 1-5 courage ladder (NGGC brief §14).
         `evidence` is what the mentor watched happen and the server rejects
         the mark without it — a score with no instance behind it is the
         impression-of-a-child this index replaces. `observedOn` defaults to
         today server-side; pass it when writing up an earlier session. */
      courageMark:   (subjectId, m) => request('/member/mentor.php', { body: Object.assign({ action: 'courage', subjectId }, m || {}) }),
      /* The mentor's weekly review (brief §18) — twelve questions for one
         child for one week. Amends in place: answering four on Saturday and
         the rest on Sunday is one review, not two. */
      mentorReview:  (subjectId, r) => request('/member/mentor.php', { body: Object.assign({ action: 'review', subjectId }, r || {}) }),
      /* Who nobody has reviewed this week — the question §18 exists to ask. */
      mentorReviewsDue: (opts) => request('/member/mentor.php' + qs(Object.assign({ view: 'due' }, opts || {}))),
      bulkAward: (subjectIds, opts) => request('/member/mentor.php', { body: Object.assign({ action: 'bulk', subjectIds }, opts || {}) }),
      /* The Mentor Portal (design handoff v14). Reads are ?view=, writes are
         an action; every one is gated by mentor_gate on the server. */
      mentorView:    (view, opts) => request('/member/mentor.php' + qs(Object.assign({ view }, opts || {}))),
      mentorAct:     (action, body) => request('/member/mentor.php', { body: Object.assign({ action }, body || {}) }),
      mentorWeek:    (centre) => request('/member/mentor.php' + qs({ view: 'week', centre: centre || '' })),
      mentorCaseload: (centre) => request('/member/mentor.php' + qs({ view: 'caseload', centre: centre || '' })),
      mentorMentee:  (subjectId, centre) => request('/member/mentor.php' + qs({ view: 'mentee', subjectId, centre: centre || '' })),
      mentorScorecard: (subjectId, month) => request('/member/mentor.php' + qs({ view: 'scorecard', subjectId, month: month || '' })),
      mentorScorecardSave: (subjectId, month, scores) => request('/member/mentor.php', { body: { action: 'scorecard', subjectId, month, scores } }),
      mentorIndex:   (centre, month) => request('/member/mentor.php' + qs({ view: 'index', centre: centre || '', month: month || '' })),
      mentorGoalCheckin: (subjectId, goalId, progress, note) => request('/member/mentor.php', { body: { action: 'goalCheckin', subjectId, goalId, progress, note: note || '' } }),
      mentorSession: (body) => request('/member/mentor.php', { body: Object.assign({ action: 'session' }, body || {}) }),
      mentorSessionDelete: (id) => request('/member/mentor.php', { body: { action: 'sessionDelete', id } }),
      mentorSessions: (centre) => request('/member/mentor.php' + qs({ view: 'sessions', centre: centre || '' })),
      mentorRelCheck: (subjectId, answers) => request('/member/mentor.php', { body: { action: 'relCheck', subjectId, answers } }),
      mentorRelFit:  (subjectId) => request('/member/mentor.php', { body: { action: 'relFit', subjectId } }),
      mentorFamilySend: (subjectId, body, draftId) => request('/member/mentor.php', { body: { action: 'familySend', subjectId, body, draftId: draftId || 0 } }),
      mentorConcern: (subjectId, category, body) => request('/member/mentor.php', { body: { action: 'concern', subjectId, category, body } }),
      mentorCommitments: (month) => request('/member/mentor.php' + qs({ view: 'commitments', month: month || '' })),
      mentorSupervisionPrep: (answers) => request('/member/mentor.php', { body: { action: 'supervisionPrep', answers } }),
      mentorRetreatBook: (retreatId) => request('/member/mentor.php', { body: { action: 'retreatBook', retreatId } }),
      mentorTeam:    (centre) => request('/member/mentor.php' + qs({ view: 'team', centre: centre || '' })),
      mentorSupervisionBook: (mentorId) => request('/member/mentor.php', { body: { action: 'supervisionBook', mentorId } }),
      mentorAcademy: () => request('/member/mentor.php' + qs({ view: 'academy' })),
      // One mentee's growth report, or (no id) the pod at a glance.
      mentorGrowth: (subjectId) => request('/member/mentor.php' + qs(subjectId ? { view: 'growth', subjectId } : { view: 'growth' })),
      mentorAcademyResult: (moduleId, answers) => request('/member/mentor.php', { body: { action: 'academyResult', moduleId, answers } }),
      mentorSaturday: (date, centre) => request('/member/mentor.php' + qs({ view: 'saturday', date: date || '', centre: centre || '' })),
      mentorMessages: () => request('/member/mentor.php' + qs({ view: 'messages' })),
      /* Growth plans waiting for the mentor, and one mentee's term (results + plan + history). */
      mentorPlans:   (centre) => request('/member/mentor.php' + qs({ view: 'plans', centre: centre || '' })),
      mentorPlan:    (subjectId, term) => request('/member/mentor.php' + qs({ view: 'plan', subjectId, term: term || '' })),
      mentorPlanApprove: (planId, note, items) => request('/member/mentor.php', { body: { action: 'planApprove', planId, note: note || '', items: items || [] } }),
      mentorPlanCheer: (planId, note) => request('/member/mentor.php', { body: { action: 'planCheer', planId, note } }),
      mentorPlanReturn:  (planId, note) => request('/member/mentor.php', { body: { action: 'planReturn', planId, note } }),
      /* School results and the growth plan — the member's own (Grow → School results). */
      today:          () => request('/member/today.php'),
      chat:           () => request('/member/chat.php'),
      chatSend:       (body, media) => request('/member/chat.php', { body: Object.assign({ body }, media && media.length ? { media } : {}) }),
      results:        (term) => request('/member/results.php' + qs({ term: term || '' })),
      resultsUpload:  (term, fileUrl, mime, size) => request('/member/results.php', { body: { action: 'upload', term, fileUrl, mime, size } }),
      resultsRead:    (uploadId) => request('/member/results.php', { body: { action: 'read', uploadId } }),
      resultsConfirm: (uploadId, subjects) => request('/member/results.php', { body: { action: 'confirm', uploadId, subjects } }),
      resultsDraft:   (uploadId, fresh) => request('/member/results.php', { body: { action: 'draft', uploadId, fresh: !!fresh } }),
      resultsSave:    (plan) => request('/member/results.php', { body: Object.assign({ action: 'save' }, plan || {}) }),
      resultsSend:    (plan) => request('/member/results.php', { body: Object.assign({ action: 'send' }, plan || {}) }),
      resultsTick:    (itemId, delta) => request('/member/results.php', { body: { action: 'tick', itemId, delta: delta < 0 ? -1 : 1 } }),
      /* The teaching record. One endpoint, three views — an instructor's day
         is one screen that switches between the class, a child and the grid. */
      session:      (course, centre, date) => request('/member/teaching.php?view=session&course=' + encodeURIComponent(course || '') + '&centre=' + encodeURIComponent(centre || '') + '&date=' + encodeURIComponent(date || '')),
      sessionSave:  (data) => request('/member/teaching.php', { body: Object.assign({ action: 'session' }, data || {}) }),
      skillsBoard:  (course, centre) => request('/member/teaching.php?view=skills&course=' + encodeURIComponent(course || '') + '&centre=' + encodeURIComponent(centre || '')),
      skillsMark:   (subjectId, course, marks, evidence) => request('/member/teaching.php', { body: { action: 'skills', subjectId, course, marks, evidence: evidence || {} } }),
      remarks:      (subjectId) => request('/member/teaching.php?view=remarks&subjectId=' + encodeURIComponent(subjectId || '')),
      remarkAdd:    (subjectId, kind, body) => request('/member/teaching.php', { body: { action: 'remark', subjectId, kind, body } }),
      /* The instructor's Today, and one Club class's Saturday in teaching order. */
      teachToday:  (o) => request('/member/teaching.php' + qs(Object.assign({ view: 'today' }, o || {}))),
      teachClass:  (o) => request('/member/teaching.php' + qs(Object.assign({ view: 'class' }, o || {}))),
      /* The Instructor Academy: "Start here" (how to use this portal) and the training. */
      teachAcademy:       () => request('/member/teaching.php?view=academy'),
      // How children address this staff member (title + surname). GET reads, POST sets.
      staffTitle:         () => request('/member/staff-title.php'),
      staffTitleSet:      (honorific) => request('/member/staff-title.php', { body: { honorific } }),
      teachAcademyResult: (moduleId, answers) => request('/member/teaching.php', { body: { action: 'academyResult', moduleId, answers } }),
      classRoll:   (slot, marks, close, awayRest) => request('/member/teaching.php', { body: Object.assign({ action: 'classRoll', marks: marks || {}, close: !!close, awayRest: !!awayRest }, slot || {}) }),
      classPlan:   (slot, plan) => request('/member/teaching.php', { body: Object.assign({ action: 'classPlan', plan }, slot || {}) }),
      classHinge:  (slot, h) => request('/member/teaching.php', { body: Object.assign({ action: 'classHinge' }, slot || {}, h || {}) }),
      classExit:   (slot, x) => request('/member/teaching.php', { body: Object.assign({ action: 'classExit' }, slot || {}, x || {}) }),
      classHistory: (slot) => request('/member/teaching.php' + qs(Object.assign({ view: 'history' }, slot || {}))),
      teachStudent: (studentId, course) => request('/member/teaching.php' + qs({ view: 'student', studentId, course: course || '' })),
      classLog:    (slot, l) => request('/member/teaching.php', { body: Object.assign({ action: 'classLog' }, slot || {}, l || {}) }),
      /* The class's school results (Progress → School results). Filtered and paged on the server. */
      classResults:  (o) => request('/member/teaching.php' + qs(Object.assign({ view: 'results' }, o || {}))),
      classResult:   (studentId, term) => request('/member/teaching.php' + qs({ view: 'result', studentId, term })),
      resultNote:    (studentId, term, text) => request('/member/teaching.php', { body: { action: 'resultNote', studentId, term, text } }),
      resultSeen:    (studentId, term) => request('/member/teaching.php', { body: { action: 'resultSeen', studentId, term } }),
      resultRemind:  (studentId, term) => request('/member/teaching.php', { body: { action: 'resultRemind', studentId, term } }),
      submitMission: (data) => request('/member/mission.php', { body: data }),
      journal:       () => request('/member/journal.php'),
      /* "Mine" — §8a in one request, and the writer's three verbs. */
      journalMine:   (skip) => request('/member/journal.php' + qs({ view: 'mine', skip: skip || 0 })),
      journalSave:   (data) => request('/member/journal.php', { body: { action: 'save', data } }),
      journalMood:   (mood) => request('/member/journal.php', { body: { action: 'mood', mood } }),
      journalRemove: (entryId) => request('/member/journal.php', { body: { action: 'delete', entryId } }),
      journalCreate: (data) => request('/member/journal.php', { body: data }),
      rsvp:          (data) => request('/member/rsvp.php', { body: data }),
      notifications: () => request('/member/notifications.php'),
      /* Support cases from My NGG (api/member/support.php, domain/support.php). */
      support: supportApi('/member/support.php'),
      markRead:      (notifId, unread) => request('/member/notifications.php', { body: { notifId, unread: !!unread } }),
      markAllRead:   () => request('/member/notifications.php', { body: { all: true } }),
      dismissNotif:  (notifId, undo) => request('/member/notifications.php', { body: { action: 'dismiss', notifId, undo: !!undo } }),
      updateProfile: (data) => request('/member/profile.php', { body: data }),
      /* The photo is changed by asking: the new photo goes to the desk, which approves or declines it. */
      photoChange: {
        mine:     () => request('/member/photo-change.php'),
        ask:      (photoUrl, reason) => request('/member/photo-change.php', { body: { photoUrl, reason: reason || '' } }),
        withdraw: () => request('/member/photo-change.php', { body: { action: 'withdraw' } }),
      },
      assignments:      () => request('/member/assignments.php'),
      /* An instructor's assignments desk — the same calls as the Control Room's, through the member door. */
      assignDesk:       () => assignDesk('/member/assign-desk.php'),
      submitAssignment: (data) => request('/member/assignments.php', { body: data }),
      /* The NGG Club curriculum (domain/curriculum.php). The member reads and
         sits lessons; an instructor or mentor reads their view and marks the
         written answers waiting on them. */
      curriculum:        () => request('/member/curriculum.php'),
      curriculumUnit:    (unitId) => request('/member/curriculum.php' + qs({ unit: unitId })),
      curriculumSubmit:  (unitId, answers) => request('/member/curriculum.php', { body: { action: 'submit', unitId, answers }, timeout: 90000 }),
      curriculumStaff:   () => request('/member/curriculum.php' + qs({ view: 'staff' })),
      curriculumStaffMember: (memberId) => request('/member/curriculum.php' + qs({ view: 'staff', memberId })),
      /* Place a class in the curriculum: the list with suggested years, and one save for all. */
      curriculumPlacement: (course) => request('/member/curriculum.php' + qs({ view: 'placement', course: course || '' })),
      curriculumLesson: (o) => request('/member/curriculum.php', { body: Object.assign({ action: 'lesson' }, o) }),
      curriculumPlace: (placements) => request('/member/curriculum.php', { body: { action: 'place', placements } }),
      curriculumConfirm: (memberId, unitIds, done) => request('/member/curriculum.php', { body: { action: 'confirm', memberId, unitIds, done: done !== false } }),
      /* `history` is the conversation so far ([{role:'me'|'ai', text}]). Without
         it every question was cold, so "I still don't get it" meant nothing. */
      curriculumAsk:     (unitId, question, history) => request('/member/curriculum.php', { body: { action: 'ask', unitId, question, history: history || [] }, timeout: 60000 }),
      /* What they thought of the session. An empty body withdraws one. */
      testimonialGive:   (o) => request('/member/curriculum.php', { body: Object.assign({ action: 'testimonial' }, o) }),
      /* How today's lesson went. A tap, never published — the testimonial
         above is the other question, asked once a session. */
      lessonFeedback:    (unitId, signal, body) => request('/member/curriculum.php', { body: { action: 'feedback', unitId, signal, body: body || '' } }),
      /* Studying for school: one session of the growth plan. The questions
         come back without their answers — marking happens on the server. */
      studyPlan:         () => request('/member/curriculum.php' + qs({ view: 'study' })),
      studyStart:        (itemId, topic, exam) => request('/member/curriculum.php', { body: { action: 'drill', itemId, topic: topic || '', exam: exam || '' }, timeout: 60000 }),
      studyMark:         (drillId, answers) => request('/member/curriculum.php', { body: { action: 'drill', drillId, answers } }),
      /* Whether the term question is open, which session it is about, and
         what they already said — one call, because the screen needs all
         three before it draws anything. */
      testimonialMine:   () => request('/member/curriculum.php' + qs({ view: 'testimonial' })),
      curriculumYear:    (memberId, year) => request('/member/curriculum.php', { body: { action: 'year', memberId, year } }),
      curriculumMark:    (progressId, marks) => request('/member/curriculum.php', { body: { action: 'mark', progressId, marks } }),
      // An instructor's material for a lesson — a link, or a file uploaded first.
      curriculumMaterial: (data) => request('/member/curriculum.php', { body: Object.assign({ action: 'material' }, data) }),
      curriculumUpload:   (file) => { const fd = new FormData(); fd.append('file', file); return request('/member/curriculum.php', { body: fd, timeout: 180000 }); },
      stateGet:  (keys) => request('/member/state.php' + qs({ keys: Array.isArray(keys) ? keys.join(',') : keys })),
      stateSet:  (key, value) => request('/member/state.php', { body: { key, value } }),
      tools: {
        decks:   () => request('/member/tools.php?view=decks'),
        deck:    (deckId) => request('/member/tools.php' + qs({ view: 'deck', deckId })),
        due:     (deckId) => request('/member/tools.php' + qs({ view: 'due', deckId })),
        stats:   () => request('/member/tools.php?view=stats'),
        lessons: () => request('/member/tools.php?view=lessons'),
        save:    (deck) => request('/member/tools.php', { body: Object.assign({ action: 'save' }, deck) }),
        remove:  (deckId) => request('/member/tools.php', { body: { action: 'delete', deckId } }),
        review:  (cardId, grade) => request('/member/tools.php', { body: { action: 'review', cardId, grade } }),
        log:     (entry) => request('/member/tools.php', { body: Object.assign({ action: 'log' }, entry) }),
        aiCards: (unitId) => request('/member/tools.php', { body: { action: 'ai', unitId } }),
        quiz:    (unitId) => request('/member/tools.php', { body: { action: 'quiz', unitId } }),
        notes:   (text) => request('/member/tools.php', { body: { action: 'notes', text } }),
      },
      momentum:     () => request('/member/momentum.php'),
      /* Read-only. There is no member-side write to the ledger. */
      fees:         () => request('/member/fees.php'),
      feesPay:      () => request('/member/fees.php', { body: { action: 'pay' } }),
      /* Self-service. No memberId travels in any of these — the server reads it
         from the session, which is what keeps them from being an enumeration
         endpoint over children. */
      statement:    () => request('/member/self.php?view=statement'),
      records:      () => request('/member/self.php?view=records'),
      /* A member's own Courage Index — theirs to read, unlike the mentoring
         record (meetings, goals) which is staff notes and never leaves the
         portal. */
      courage:      () => request('/member/self.php?view=courage'),
      requests:     () => request('/member/self.php?view=requests'),
      timetable:    () => request('/member/timetable.php'),
      myTimetable:  () => request('/member/my-timetable.php'),
      saveMyTimetable: (doc) => request('/member/my-timetable.php', { body: doc }),
      raiseRequest: (data) => request('/member/self.php', { body: data }),
      // An idea, a change, something they love (member_feedback_create); anonymous keeps their name off it.
      feedback: (topic, body, anonymous, rating) => request('/member/self.php', { body: { action: 'feedback', topic, body, anonymous: !!anonymous, rating: rating || 0 } }),
      // Projects and activities a mentor or lead put me on (domain/projects.php).
      projects:     () => request('/member/projects.php'),
      projectMark:  (projectId, status, note) => request('/member/projects.php', { body: { projectId, status, note: note || '' } }),
      withdrawRequest: (requestId) => request('/member/self.php', { body: { action: 'withdraw', requestId } }),
      compliance:   () => request('/member/compliance.php'),
      coach:        (messages) => request('/member/coach.php', { body: { messages } }),
      companion:    () => request('/member/companion.php'),
      /* Opportunities that fit me (domain/opportunities.php); save toggles my bookmark. */
      opps:         () => request('/member/opps.php'),
      oppsSave:     (oppId) => request('/member/opps.php', { body: { action: 'save', oppId } }),
      /* What I still have to do across my roles (domain/duties.php), and "remind me later". */
      duties:       (role) => request('/member/duties.php' + qs({ role: role || '' })),
      dutiesSnooze: (hours) => request('/member/duties.php', { body: { action: 'snooze', hours: hours || 4 } }),
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
        /* §8c — the Programme record. Following is a toggle; an update is
           append-only; proposing is what a member without the capability does
           instead of publishing. */
        follow:   (entryId) => request('/member/program-journal.php', { body: { action: 'follow', entryId } }),
        updates:  (entryId) => request('/member/program-journal.php' + qs({ view: 'updates', entryId })),
        addUpdate: (entryId, body) => request('/member/program-journal.php', { body: { action: 'update', entryId, body } }),
        propose:  (d) => request('/member/program-journal.php', { body: Object.assign({ action: 'propose' }, d || {}) }),
        publish:  (entryId) => request('/member/program-journal.php', { body: { action: 'publish', entryId } }),
      },
      community: {
        channels: () => request('/member/community.php' + qs({ view: 'channels' })),
        feed:     (channel, sort, page) => request('/member/community.php' + qs({ view: 'feed', channel: channel || 'all', sort: sort || 'latest', page: page || 0 })),
        comments: (postId) => request('/member/community.php' + qs({ view: 'comments', postId })),
        digest:   (channel) => request('/member/community.php' + qs({ view: 'digest', channel: channel || 'all' })),
        post:     (data) => request('/member/community.php', { body: { action: 'post', data } }),
        react:    (postId, emoji) => request('/member/community.php', { body: { action: 'react', postId, emoji } }),
        comment:  (postId, body, replyTo) => request('/member/community.php', { body: { action: 'comment', postId, body, replyTo: replyTo || '' } }),
        commentReact: (commentId, emoji) => request('/member/community.php', { body: { action: 'commentReact', commentId, emoji } }),
        bookmark: (postId) => request('/member/community.php', { body: { action: 'bookmark', postId } }),
        report:   (targetType, targetId, reason) => request('/member/community.php', { body: { action: 'report', targetType, targetId, reason: reason || '' } }),
        remove:   (targetType, targetId) => request('/member/community.php', { body: { action: 'delete', targetType, targetId } }),
        vote:     (postId, choice) => request('/member/community.php', { body: { action: 'vote', postId, choice } }),
        star:     (postId) => request('/member/community.php', { body: { action: 'star', postId } }),
        mentions: (q) => request('/member/community.php' + qs({ view: 'mention', q })),
        search:   (q, channel, author) => request('/member/community.php' + qs({ view: 'search', q, channel: channel || 'all', author: author || '' })),
        members:  (channel) => request('/member/community.php' + qs({ view: 'members', channel })),
        files:    (channel, kind) => request('/member/community.php' + qs({ view: 'files', channel, kind: kind || 'all' })),
        markRead: (channel) => request('/member/community.php', { body: { action: 'markRead', channel } }),
        /* Homework. `homework` reads one task — the newest in a channel, or a
           named one; the per-child roster inside it is served only to mentors. */
        homework:       (channel, homeworkId) => request('/member/community.php' + qs({ view: 'homework', channel: channel || '', homeworkId: homeworkId || '' })),
        homeworkList:   (channel) => request('/member/community.php' + qs({ view: 'homeworkList', channel })),
        homeworkSet:    (data) => request('/member/community.php', { body: { action: 'homework', data } }),
        homeworkSeen:   (homeworkId) => request('/member/community.php', { body: { action: 'homeworkSeen', homeworkId } }),
        homeworkSubmit: (homeworkId, note, postId) => request('/member/community.php', { body: { action: 'homeworkSubmit', homeworkId, note: note || '', postId: postId || '' } }),
        homeworkReview: (homeworkId, who) => request('/member/community.php', { body: { action: 'homeworkReview', homeworkId, who } }),
        homeworkNudge:  (homeworkId, who, all) => request('/member/community.php', { body: { action: 'homeworkNudge', homeworkId, who: who || '', all: !!all } }),
        /* Typing. `typingPing` is sent only while somebody is really typing;
           `typingStop` on send, blur, or leaving the channel. */
        typingWho:  (channel) => request('/member/community.php' + qs({ view: 'typing', channel })),
        typingPing: (channel) => request('/member/community.php', { body: { action: 'typing', channel } }),
        typingStop: (channel) => request('/member/community.php', { body: { action: 'typing', channel, stop: true } }),
        // One post by id — what a shared link or a notification resolves to.
        post_get: (postId) => request('/member/community.php' + qs({ view: 'post', postId })),
        // Filter-chip counts for the Today screen (unread / mentions / saved).
        today:    () => request('/member/community.php' + qs({ view: 'today' })),
        /* Community v3 (domain/community-v3.php). */
        v3boot:     () => request('/member/community.php' + qs({ view: 'v3boot' })),
        v3feed:     (channel, page) => request('/member/community.php' + qs({ view: 'feed', channel: channel || 'all', sort: 'latest', page: page || 0, scope: 'mine' })),
        home:       () => request('/member/community.php' + qs({ view: 'home' })),
        hwBoard:    () => request('/member/community.php' + qs({ view: 'hwBoard' })),
        v3files:    (channel) => request('/member/community.php' + qs({ view: 'v3files', channel: channel || '' })),
        media:      (postId) => request('/member/community.php' + qs({ view: 'media', postId })),
        videoPoints:(postId) => request('/member/community.php' + qs({ view: 'videoPoints', postId }), { timeout: 60000 }),
        videoPos:   (postId, pos, dur) => request('/member/community.php', { body: { action: 'videoPos', postId, pos: Math.floor(pos || 0), dur: Math.floor(dur || 0) } }),
        answer:     (postId, commentId) => request('/member/community.php', { body: { action: 'answer', postId, commentId: commentId || '' } }),
      },
      arcade: {
        home:   () => request('/member/arcade.php' + qs({ view: 'home' })),
        board:  (game, scope) => request('/member/arcade.php' + qs({ view: 'board', game: game || '', scope: scope || 'week' })),
        start:  (game) => request('/member/arcade.php', { body: { action: 'start', game } }),
        submit: (roundId, answers) => request('/member/arcade.php', { body: { action: 'submit', roundId, answers } }),
      },
      // Math Lab — levels that unlock, JSS number work up to Further Maths.
      mathlab: {
        board:  () => request('/member/arcade.php' + qs({ view: 'mathlab' })),
        start:  (level) => request('/member/arcade.php', { body: { action: 'mathStart', level } }),
        submit: (roundId, answers) => request('/member/arcade.php', { body: { action: 'mathSubmit', roundId, answers } }),
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
        /* Every move carries an id the client generates, so a retry after a
           dropped response replays the original outcome rather than failing on
           a move that already landed — or playing it twice. */
        move: (matchId, move, clientMoveId) => request('/member/match.php', { body: { action: 'move', matchId, move, clientMoveId: clientMoveId || '' } }),
        resign:  (matchId) => request('/member/match.php', { body: { action: 'resign', matchId } }),
        /* offer | accept | decline. One verb, because the three are the same
           conversation and the server decides what pressing Draw means when an
           offer is already on the table. */
        draw:    (matchId, act) => request('/member/match.php', { body: { action: 'draw', matchId, do: act || 'offer' } }),
        react:   (matchId, reaction) => request('/member/match.php', { body: { action: 'react', matchId, reaction } }),
        report:  (matchId) => request('/member/match.php', { body: { action: 'report', matchId } }),

        /* Finding a game — design turn 6A. Search a player, post or take a
           challenge, read your own standing. Playing the computer is not here
           at all: it happens on the device and touches no endpoint. */
        players:   (q) => request('/member/match.php' + qs(Object.assign({ view: 'players' }, q || {}))),
        chess:     () => request('/member/match.php' + qs({ view: 'chess' })),
        challenges: () => request('/member/match.php' + qs({ view: 'challenges' })),
        /* The lobby tick. A few dozen bytes and a signature — the screen only
           reloads when something actually changed. CmChess used to load once
           on mount and never again, so an accepted challenge was invisible
           until the member navigated away and came back. */
        lobby: () => request('/member/match.php' + qs({ view: 'lobby' })),
        /* After-game review. The engine runs in the browser — there is none
           on shared hosting — so these two only fetch and keep the result. */
        review:        (matchId) => request('/member/match.php' + qs({ view: 'review', matchId })),
        reviewSave:    (matchId, data) => request('/member/match.php', { body: { action: 'reviewSave', matchId, data } }),
        reviewHistory: () => request('/member/match.php' + qs({ view: 'reviewHistory' })),
        /* A house promotion for a placement — NGG's own programmes, first
           party only. `track` counts once per person, not per render. */
        promo: (placement, shape) => request('/member/match.php' + qs({ view: 'promo', placement: placement || 'chess', shape: shape || 'card' })),
        promoTrack: (promoId, event) => request('/member/match.php', { body: { action: 'promoTrack', promoId, event } }),
        challenge: (d) => request('/member/match.php', { body: Object.assign({ action: 'challenge' }, d || {}) }),
        answer:    (challengeId, answer) => request('/member/match.php', { body: { action: 'challengeRespond', challengeId, answer } }),
      },
      // A player's own tournaments and their next game in each.
      tournaments: {
        mine: () => request('/member/match.php' + qs({ view: 'tournaments' })),
        /* Every tournament a member can SEE. There was no such call, which is
           why a created tournament reflected nowhere. */
        browse:    () => request('/member/match.php' + qs({ view: 'trnBrowse' })),
        /* What has a pulse right now — boards in play and moves in the last
           few hours, with each event's top of the table. */
        ladder:    () => request('/member/match.php' + qs({ view: 'trnLadder' })),
        standings: (tournamentId) => request('/member/match.php' + qs({ view: 'trnStandings', tournamentId })),
        rounds:    (tournamentId) => request('/member/match.php' + qs({ view: 'trnRounds', tournamentId })),
        join:      (tournamentId) => request('/member/match.php', { body: { action: 'trnJoin', tournamentId } }),
        leave:     (tournamentId) => request('/member/match.php', { body: { action: 'trnLeave', tournamentId } }),
        // Directors run an event from the chess screen; the capability check
        // is the same one the admin console uses, inside the domain op.
        create:    (data) => request('/member/match.php', { body: Object.assign({ action: 'trnCreate' }, data) }),
        draw:      (tournamentId) => request('/member/match.php', { body: { action: 'trnDraw', tournamentId } }),
        enter:     (tournamentId, playerId) => request('/member/match.php', { body: { action: 'trnEnter', tournamentId, playerId } }),
        /* Ask everybody the tournament's own rules already allow. dryRun
           returns the count without sending anything. */
        inviteAll: (tournamentId, dryRun) => request('/member/match.php', { body: { action: 'trnInviteAll', tournamentId, dryRun: !!dryRun } }),
        directory: (opts) => request('/member/match.php', { body: Object.assign({ action: 'trnDirectory' }, opts || {}) }),
      },
      changeEmail:         (email) => request('/member/account.php', { body: { action: 'change_email', email } }),
      exportData:          () => request('/member/account.php'),
      deleteAccount:       () => request('/member/account.php', { body: { action: 'delete' } }),
      security:            () => request('/member/security.php'),
      securityRevoke:      (sid) => request('/member/security.php', { body: { action: 'revoke', sid } }),
      securityRevokeOthers: () => request('/member/security.php', { body: { action: 'revoke_others' } }),
    },
    public: {
      /* The help centre's answers (api/public/help.php). No case is opened publicly. */
      help: (q) => request('/public/help.php' + (q ? qs({ q }) : '')),
      telegram:   () => request('/public/telegram.php'),
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
      /* Everything /summer needs to let somebody find their way in — the live
         edition and its dates, the academies and their courses, and the
         centres with what actually runs at each. One read, cacheable, no PII. */
      summer:     () => request('/public/summer.php'),
      centre:     (slug) => request('/public/centre.php' + qs({ slug })),
      communityChannels: () => request('/public/community.php'),
      communityShowcase: () => request('/public/community.php' + qs({ view: 'showcase' })),
      newsletter: (email, source) => request('/public/newsletter.php', { body: { email, source: source || 'site' } }),
      apply:      (data) => request('/public/apply.php', { body: data }),
      summerSignup: (centre) => request('/public/summer-signup.php' + (centre ? '?centre=' + encodeURIComponent(centre) : ''), { method: 'GET' }),
      schools:    (q) => request('/public/schools.php?q=' + encodeURIComponent(q), { method: 'GET' }),
      applyCheck: (email, dob) => request('/public/apply-check.php', { body: { email, dob, program: 'anchor' } }),
      volunteer:  { context: () => request('/public/volunteer.php') },
      cert:       (id) => request('/public/cert.php' + qs({ id })),
      // A shared journal entry. Resolves only while the entry is public, so
      // narrowing it revokes every link already sent.
      journalEntry: (t) => request('/public/journal-entry.php' + qs({ t })),
      siteContent: () => request('/public/site.php'),
      wisdomWeek: () => request('/public/wisdom.php'),
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
        checkout: (gate, token, scannedAt) => request('/public/gate.php', { body: { action: 'checkout', gate, token, scannedAt } }),
        dutyClose:(gate) => request('/public/gate.php', { body: { action: 'duty_close', gate } }),
        faceLog:  (gate, token, r) => request('/public/gate.php', { body: Object.assign({ action: 'face', gate, token }, r || {}) }),
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
      timetable: (centre) => request('/public/timetable.php' + qs({ centre: centre || '' })),
      formation: (audience) => request('/public/formation.php' + qs({ audience: audience || 'member' })),
      timetableSave: (body) => request('/public/timetable-save.php', { body }),
      timetableLoad: (k) => request('/public/timetable-save.php' + qs({ k })),
      timetableTerm: () => request('/public/timetable-term.php'),
      // One programme's own courses and centres, for the join form.
      programme: (program) => request('/public/programme.php' + qs({ program: program === 'summer' ? 'summer' : 'anchor' })),
      testimonials: () => request('/public/testimonials.php'),
      // A family's joining invoice, by its private token (/pay/<token>).
      membershipInvoice: (token) => request('/public/membership-pay.php' + qs({ token })),
      photoFraming:      (urls) => request('/public/photo-framing.php' + qs({ u: JSON.stringify(urls) })),
      membershipPay:     (token) => request('/public/membership-pay.php', { body: { action: 'init', token } }),
      membershipVerify:  (token, reference) => request('/public/membership-pay.php', { body: { action: 'verify', token, reference } }),
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
    /* Family accounts — a parent's own sign-in (its own cookie; never a member session). */
    family: {
      /* Support cases from the Family account — the same contract as the member's. */
      support: supportApi('/family/support.php'),
      me:       () => request('/family/me.php'),
      request:  (email) => request('/family/request.php', { body: { email } }),
      verify:   (data) => request('/family/verify.php', { body: data }),
      logout:   (everywhere) => request('/family/logout.php', { body: { everywhere: !!everywhere } }),
      ward:     (linkId) => request('/family/ward.php' + qs({ link: linkId })),
      pay:      (linkId) => request('/family/pay.php', { body: { link: linkId } }),
      act:      (action, data) => request('/family/account.php', { body: Object.assign({ action }, data || {}) }),
      inbox:    (cat, cursor) => request('/family/inbox.php' + qs({ cat: cat || '', cursor: cursor || '' })),
      events:   () => request('/family/events.php'),
      /* A photo of a school report, stored in pieces under the family's own
         cookie (a member's piece store refuses a family session). Answers the
         stored URL; family.results.upload then takes only that. */
      uploadReport: async (dataUrl, onPart) => {
        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
        if (!m) throw Object.assign(new Error('bad_type'), { code: 'bad_type' });
        const PIECE = 60000, b64 = m[2], total = Math.ceil(b64.length / PIECE);
        if (total > 80) throw Object.assign(new Error('too_large'), { code: 'too_large' });
        const bytes = new Uint8Array(12); window.crypto.getRandomValues(bytes);
        const uploadId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        let last = null;
        for (let i = 0; i < total; i++) {
          last = await request('/family/upload-chunk.php', { body: { uploadId, index: i, total, mime: m[1], data: b64.slice(i * PIECE, (i + 1) * PIECE) }, timeout: 60000 });
          if (onPart) onPart((i + 1) / total);
        }
        return { url: last && last.url, mime: m[1], size: Math.floor(b64.length * 3 / 4) };
      },
    },
    admin: {
      /* Support cases, answered from the Control Room (api/admin/support.php; cap `support`). */
      support: {
        list: (opts) => request('/admin/support.php' + qs(opts || {})),
        get: (caseNo) => request('/admin/support.php' + qs({ caseNo })),
        reply: (caseNo, body, opts) => request('/admin/support.php', { body: Object.assign({ action: 'reply', caseNo, body }, opts || {}), timeout: 60000 }),
        bulk: (op, caseNos, value) => request('/admin/support.php', { body: { action: 'bulk', op, caseNos, value } }),
        open: (payload) => request('/admin/support.php', { body: Object.assign({ action: 'open' }, payload || {}) }),
        fileUrl: (caseNo, f) => BASE + '/admin/support-file.php' + qs({ caseNo, f }),
      },
      /* The accounts desk: who cannot sign in, and the members behind each
         number. Nothing here ends an account — that is the MoU's question. */
      accounts: {
        overview: () => request('/admin/accounts.php'),
        unlock:   (memberId) => request('/admin/accounts.php', { body: { action: 'unlock', memberId } }),
      },
      members: {
        list:   (q) => request('/admin/members.php' + qs(q || {})),
        upsert: (data) => request('/admin/members.php', { body: data }),
        /* One action over many members. PARTIAL by design: the reply carries a
           per-row verdict in `results` alongside applied/refused, and a caller
           that reads only `ok` will report a run where most rows were refused
           as a success. The guards (own account, staff accounts, centre scope,
           batch bound) are in api/_lib/domain/members-bulk.php. */
        bulk:   (op, memberIds, payload) => request('/admin/members.php', {
                  body: Object.assign({ action: 'bulk', op, memberIds }, payload || {}),
                  timeout: 120000 }),
        /* Every id matching the current filters, so "apply to all N matching"
           can name them. Resolved server-side from the same filters the page
           was built with — a client-side union of the pages it happens to have
           loaded is a different set. */
        ids:    (q) => request('/admin/members.php' + qs(Object.assign({ view: 'ids' }, q || {}))),
        // The four divisions (id, name, mandate) with member counts, for the editor's picker.
        divisions: () => request('/admin/members.php' + qs({ view: 'divisions' })),
        suggest: (q) => request('/admin/members.php' + qs({ view: 'suggest', q })),
        /* Cards the CACENTRE gate reads: the secure MEMQR- card, and the
           printed formats older cards are decoded by (domain/member-cards.php). */
        cards: {
          formats:   () => request('/admin/member-cards.php'),
          of:        (memberId) => request('/admin/member-cards.php' + qs({ memberId })),
          derive:    (example, number) => request('/admin/member-cards.php', { body: { action: 'derive', example, number } }),
          test:      (template, mask, sample) => request('/admin/member-cards.php', { body: { action: 'test', template, mask, sample } }),
          saveFormat:(f) => request('/admin/member-cards.php', { body: Object.assign({ action: 'saveFormat' }, f) }),
          /* Declare an ID shape from one example ("NGG/23/042"), so an import
             accepts members carrying it and the gate reads their cards. */
          // year: the intake year `example` belongs to, so older IDs say theirs.
          declareIdFormat: (example, label, lettersVary, year) => request('/admin/member-cards.php', { body: { action: 'declareIdFormat', example, label: label || '', lettersVary: !!lettersVary, year: year ? Number(year) : 0 } }),
          reissue:   (memberId, voidPrinted) => request('/admin/member-cards.php', { body: { action: 'reissue', memberId, voidPrinted: !!voidPrinted } }),
          backfill:  (format) => request('/admin/member-cards.php', { body: { action: 'backfill', format: format === undefined ? 'member-number' : format }, timeout: 120000 }),
        },
        // Everybody already promoted to NGV → their NGV account on Afrovanguard.
        ngvPortalSync: () => request('/admin/members.php', { body: { action: 'ngvPortalSync' }, timeout: 120000 }),
        reset2fa: (memberId) => request('/admin/members.php', { body: { action: 'reset2fa', memberId } }),
        resetPassword: (memberId) => request('/admin/members.php', { body: { action: 'resetPassword', memberId } }),
        // Record a guardian's publication decision. `method` is how it was
        // obtained (paper form, phone, in person) and the server requires it.
        consent:       (memberId, type, status, method) => request('/admin/members.php', { body: { action: 'consent', memberId, type, status, method } }),
        paperConsents: (apply) => request('/admin/members.php', { body: { action: 'paperConsents', apply: !!apply } }),
        remove: (memberId) => request('/admin/members.php', { body: { action: 'delete', memberId } }),
        // Promote an NGG member into the NGV / volunteer tier — auto-provisions
        // their volunteer record + ID card (idempotent).
        /* §20: a NEW promotion carries the evidence of formation it was made
           on. Re-sending an ID for somebody already NGV does not — that path
           returns before the check, which is why `opts.sendId` alone still
           works with no evidence. */
        promoteNgv: (memberId, role, opts) => request('/admin/members.php', { body: Object.assign({ action: 'promoteNgv', memberId, role },
          (opts && opts.evidence) ? { evidence: opts.evidence } : {},
          (opts && opts.sendId !== undefined) ? { sendId: opts.sendId } : {}) }),
        /* The formation record behind the decision, and the history of every
           transition this member has made. */
        readiness:  (memberId) => request('/admin/members.php', { body: { action: 'readiness', memberId } }),
        promotions: (memberId) => request('/admin/members.php', { body: { action: 'promotions', memberId } }),
        // Reverse an NGV promotion: deactivate the volunteer record + unlink the
        // member (non-destructive; a later promoteNgv re-activates the same record).
        demoteNgv: (memberId) => request('/admin/members.php', { body: { action: 'demoteNgv', memberId } }),
        // Roster import from the members workbook (tools/ngg-import/extract.js).
        // `apply` false is a dry run and returns exactly what would change.
        // `file.text` is the file as read, and travels as one value (see
        // rosterOneValueBody above); `expectDigest` (in opts, on an apply)
        // holds the write to the roster the dry run described.
        importRoster: (file, opts) => importRoster(file, opts),
        setCaps: (memberId, caps, centreScope) => request('/admin/members.php', { body: Object.assign({ action: 'setCaps', memberId, caps }, centreScope !== undefined ? { centreScope } : {}) }),
        impersonate: (memberId) => request('/admin/impersonate.php', { body: { action: 'start', memberId } }),
        stopImpersonate: () => request('/admin/impersonate.php', { body: { action: 'stop' } }),
      },
      formation: {
        list: () => request('/admin/formation.php'),
        save: (block) => request('/admin/formation.php', { body: Object.assign({ action: 'save' }, block || {}) }),
      },
      /* Opportunities shown to members (Learning → Opportunities). Capability: content. */
      /* Sign-in & security (domain/mfa.php): who has a second step, the policy per kind, and the desk's actions. */
      mfa: {
        overview: (q) => request('/admin/mfa.php?' + new URLSearchParams(q || {}).toString()),
        policy:   (policy, methods) => request('/admin/mfa.php', { body: { action: 'policy', policy, methods } }),
        act:      (action, people, extra) => request('/admin/mfa.php', { body: Object.assign({ action, people }, extra || {}) }),
      },
      opps: {
        list: () => request('/admin/opps.php'),
        save: (o) => request('/admin/opps.php', { body: Object.assign({ action: 'save' }, o || {}) }),
      },
      timetable: {
        list:   (centreId) => request('/admin/timetable.php' + qs({ centreId: centreId || '' })),
        save:   (data) => request('/admin/timetable.php', { body: { action: 'save', data } }),
        remove: (slotIds) => request('/admin/timetable.php', { body: { action: 'remove', slotIds } }),
      },
      families: {
        list:   (q) => request('/admin/families.php' + qs(q || {})),
        decide: (action, linkIds, note) => request('/admin/families.php', { body: { action, linkIds, note: note || '' } }),
        /* Who may collect one member: read by their family, written only here. */
        collectors:    (memberId) => request('/admin/families.php' + qs({ collectors: memberId })),
        collectorsSet: (memberId, collectors) => request('/admin/families.php', { body: { action: 'collectors', memberId, collectors } }),
      },
      requests: {
        list:   (q) => request('/admin/requests.php' + qs(q || {})),
        decide: (requestId, approve, decision, amount) => request('/admin/requests.php',
          { body: Object.assign({ requestId, approve, decision }, amount !== undefined ? { amount } : {}) }),
        // Feedback is answered, not decided: 'thank' closes it with a reply, 'pass' sends it to the centre lead.
        answer: (requestId, answer, note) => request('/admin/requests.php', { body: { requestId, answer, decision: note || '' } }),
      },
      mentors: {
        list:   () => request('/admin/mentors.php'),
        upsert: (data) => request('/admin/mentors.php', { body: data }),
        /* Active mentor records sharing an email. The portal gate refuses to
           resolve an ambiguous address, so everybody in a pair is locked out
           until the desk separates them — and cannot report it themselves.
           On `mentors`, beside the roster reads it belongs with: it was first
           written onto `mentor` (singular, the promote/demote object), where
           the caller could never find it and the Mentors section threw on
           every visit. */
        duplicates: () => request('/admin/mentors.php' + qs({ view: 'duplicates' })),
      },
      /* Mentorship workspace — Anchor Pods (domain/mentorship-pods.php).
         read(view): overview | queue | relationships | match | checkins |
         nudges | interventions | impact | pipeline. act(action, body): see
         MSW_WRITES in api/admin/mentorship-pods.php. */
      pods: {
        read: (view, opts) => request('/admin/mentorship-pods.php' + qs(Object.assign({ view }, opts || {}))),
        act:  (action, body) => request('/admin/mentorship-pods.php', { body: Object.assign({ action }, body || {}) }),
      },
      /* Mentorship automations — the Mentor Portal's background jobs
         (domain/mentor-automations.php). Global changes need an unscoped admin;
         a centre-scoped one may switch an unlocked job off for their centres. */
      mentorAutomations: {
        list:   () => request('/admin/mentor-automations.php' + qs({ view: 'list' })),
        update: (job, patch) => request('/admin/mentor-automations.php', { body: Object.assign({ action: 'update', job: job || '' }, patch || {}) }),
        thresholds: (thresholds) => request('/admin/mentor-automations.php', { body: { action: 'update', thresholds } }),
        log:    (opts) => request('/admin/mentor-automations.php' + qs(Object.assign({ view: 'log' }, opts || {}))),
        run:    (job) => request('/admin/mentor-automations.php', { body: { action: 'run', job } }),
        retreats: () => request('/admin/mentor-automations.php' + qs({ view: 'retreats' })),
        retreatSave: (r) => request('/admin/mentor-automations.php', { body: Object.assign({ action: 'retreat' }, r || {}) }),
        scorecardUnlock: (subjectId, month) => request('/admin/mentor-automations.php', { body: { action: 'unlock', subjectId, month } }),
      },
      // Safeguarding cases: the `safeguarding` capability only; every read is audited.
      safeguarding: {
        list: (centre) => request('/admin/safeguarding.php' + qs({ centre: centre || '' })),
        get:  (caseNo) => request('/admin/safeguarding.php' + qs({ caseNo })),
        note: (caseNo, note, status) => request('/admin/safeguarding.php', { body: { caseNo, note: note || '', status: status || '' } }),
      },
      /* Mentorship › Projects (domain/projects.php): every project in the
         requester's centres, who may be put on one at a centre, and the writes. */
      projects: {
        list:   (centre) => request('/admin/projects.php' + qs({ centre: centre || '' })),
        people: (centre) => request('/admin/projects.php' + qs({ view: 'people', centre })),
        save:   (data) => request('/admin/projects.php', { body: Object.assign({ action: 'save' }, data) }),
        mark:   (data) => request('/admin/projects.php', { body: Object.assign({ action: 'mark' }, data) }),
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
      companion: {
        board:  (rating) => request('/admin/companion.php' + qs({ rating: rating || '' })),
        assess: (memberIds) => request('/admin/companion.php', { body: { action: 'assess', memberIds } }),
      },
      curriculum: {
        // The Club's own course list (not Summer School's academy catalogue).
        courses:      () => request('/admin/curriculum.php' + qs({ view: 'courses' })),
        coursesSet:   (catalogue) => request('/admin/curriculum.php', { body: { action: 'courses', catalogue } }),
        coursesReset: () => request('/admin/curriculum.php', { body: { action: 'courses', reset: true } }),
        list:    (f) => request('/admin/curriculum.php' + qs(Object.assign({ view: 'list' }, f || {}))),
        get:     (unitId) => request('/admin/curriculum.php' + qs({ view: 'get', unitId })),
        report:  (f) => request('/admin/curriculum.php' + qs(Object.assign({ view: 'report' }, f || {}))),
        coverage: () => request('/admin/curriculum.php' + qs({ view: 'coverage' })),
        /* What members said about their own sessions, and the one act that
           puts any of it on the public site. */
        feedback: (course) => request('/admin/curriculum.php' + qs({ view: 'feedback', course: course || '' })),
        divisions: () => request('/admin/curriculum.php' + qs({ view: 'divisions' })),
        testimonials: (status) => request('/admin/curriculum.php' + qs({ view: 'testimonials', status: status || 'new' })),
        testimonialDecide: (tid, status, note) => request('/admin/curriculum.php', { body: { action: 'testimonial', tid, status, note: note || '' } }),
        plan:    (o) => request('/admin/curriculum.php', { body: Object.assign({ action: 'plan' }, o || {}), timeout: 120000 }),
        year:    (memberId, year) => request('/admin/curriculum.php', { body: { action: 'year', memberId, year } }),
        submissions: (status) => request('/admin/curriculum.php' + qs({ view: 'submissions', status: status || 'pending' })),
        review:  (decision, materialIds, note) => request('/admin/curriculum.php', { body: { action: 'review', decision, materialIds, note: note || '' } }),
        schedule: () => request('/admin/curriculum.php' + qs({ view: 'schedule' })),
        scheduleSave: (data) => request('/admin/curriculum.php', { body: { action: 'schedule', data } }),
        upsert:  (data, allowNewCourse) => request('/admin/curriculum.php', { body: { action: 'upsert', data, allowNewCourse: !!allowNewCourse } }),
        status:  (status, unitIds) => request('/admin/curriculum.php', { body: { action: 'status', status, unitIds } }),
        seed:    (key) => request('/admin/curriculum.php' + qs({ view: 'seed', key: key || '' })),
        /* The lessons travel as ONE string value first (`rowsJson`): the host's
           firewall refuses a body with thousands of JSON values before PHP sees
           it, and a bundled course is exactly that. If something in front of PHP
           still refuses (no error code of ours), the nested shape is tried, and
           a refusal of both is named for what it is. */
        importRows: async (rows, opts) => {
          const rest = Object.assign({ action: 'import' }, opts || {});
          const send = (b) => request('/admin/curriculum.php', { body: Object.assign({}, rest, b), timeout: 180000 });
          try { return await send({ rowsJson: JSON.stringify(rows) }); }
          catch (e) {
            if (!(e && e.status >= 400 && !e.code)) throw e;
            try { return await send({ rows }); }
            catch (e2) {
              if (e2 && e2.code) throw e2;
              const err = new Error('blocked_upstream'); err.code = 'blocked_upstream'; err.status = e2 && e2.status;
              err.detail = 'The host refused the request with HTTP ' + (e2 && e2.status) + ' before it reached the site (its firewall, not the importer).';
              throw err;
            }
          }
        },
        ai:      (data) => request('/admin/curriculum.php', { body: Object.assign({ action: 'ai' }, data), timeout: 90000 }),
        /* A material file, stored on this server. Multipart, so it bypasses the
           JSON body; the CSRF header still travels. */
        upload:  (file) => { const fd = new FormData(); fd.append('file', file); return request('/admin/curriculum.php', { body: fd, timeout: 180000 }); },
      },
      assignments: {
        desk:        () => assignDesk('/admin/assignments.php'),
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
      engagementPortal: (opts) => request('/admin/engagement.php' + qs(Object.assign({ view: 'portal' }, opts || {}))),
      /* Whether the community is a community: reply rate, distinct voices,
         reach, return rate, answer speed, and the posts nobody answered. */
      communityEngagement: (opts) => request('/admin/engagement.php' + qs(Object.assign({ view: 'community' }, opts || {}))),
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
      // The member dashboard — totals, growth, and what is wrong with the
      // records. Separate from `dashboard`, which is summer attendance.
      membersOverview:   () => request('/admin/members-overview.php'),
      membersDuplicates: () => request('/admin/members-duplicates.php'),
      // The segments the dashboard counts, each with a live total, so a
      // finding leads to the records behind it rather than to a poster.
      membersSegments:   () => request('/admin/members-segments.php'),
      memberTimeline:    (memberId) => request('/admin/member-timeline.php' + qs({ memberId })),
      // Preview by default — a merge is irreversible, so confirm is a
      // second deliberate call with the same arguments.
      membersMerge:      (keepId, mergeId, confirm) =>
        request('/admin/members-merge.php', { body: { keepId, mergeId, confirm: !!confirm } }),
      // Printed IDs held by two records, and one person holding two IDs.
      membersIdDuplicates: () => request('/admin/members-id-duplicates.php'),
      assignMentor: (data) => request('/admin/assign-mentor.php', { body: data }),
      // A supporting mentor beside the primary (domain/mentor-supports.php): {memberId, mentorId, focus, endsOn} or {memberId, mentorId, end: true}.
      mentorSupport: (data) => request('/admin/mentor-support.php', { body: data }),
      applications: {
        list:    (q) => request('/admin/applications.php' + qs(q || {})),
        status:  (id, status) => request('/admin/applications.php', { body: { id, status } }),
        // `startDate` prices the first month's commitment fee (only the meeting days left are charged).
        convert: (id, startDate) => request('/admin/applications.php', { body: { action: 'convert', id, startDate: startDate || '' } }),
        update:  (id, data) => request('/admin/applications.php', { body: { action: 'update', id, data } }),
        remove:  (id) => request('/admin/applications.php', { body: { action: 'delete', id } }),
      },
      newsletter:   () => request('/admin/newsletter.php'),
      newsletterSend: (subject, body) => request('/admin/newsletter.php', { body: { subject, body } }),
      donations:    () => request('/admin/donations.php'),
      comments:     (status) => request('/admin/comments.php' + qs({ status: status || 'pending' })),
      commentModerate: (commentId, act) => request('/admin/comments.php', { body: { commentId, do: act } }),
      promos: {
        list:   () => request('/admin/promos.php'),
        save:   (data) => request('/admin/promos.php', { body: { action: 'save', data } }),
        remove: (promoId) => request('/admin/promos.php', { body: { action: 'delete', promoId } }),
      },
      /* ID Card Studio (/club/id-cards): who has a card, the reprint queue,
         one-person photo asks, after-print failures, printed IDs. */
      memberRecords: {
        get:      () => request('/admin/member-records.php'),
        set:      (cfg) => request('/admin/member-records.php', { body: Object.assign({ action: 'set' }, cfg) }),
        remind:   (memberIds) => request('/admin/member-records.php', { body: { action: 'remind', memberIds } }),
        joinDate: (memberId, date, reason) => request('/admin/member-records.php', { body: { action: 'joindate', memberId, date, reason } }),
      },
      idStudio: {
        state:     () => request('/admin/id-studio.php'),
        reprint:   (items) => request('/admin/id-studio.php', { body: { action: 'reprint', items } }),
        printed:   (items, runId) => request('/admin/id-studio.php', { body: { action: 'printed', items, runId } }),
        failed:    (runId, items) => request('/admin/id-studio.php', { body: { action: 'failed', runId, items } }),
        askPhoto:  (items, force) => request('/admin/id-studio.php', { body: { action: 'askPhoto', items, force: !!force } }),
        // What a photo request would send, to whom, in what words — sending nothing.
        askPhotoPreview: (items, force) => request('/admin/id-studio.php', { body: { action: 'askPhoto', items, force: !!force, preview: true } }),
        photoCampaigns: () => request('/admin/id-studio.php?view=photoCampaigns'),
        remindPhoto: (campaignId) => request('/admin/id-studio.php', { body: { action: 'remindPhoto', campaignId } }),
        design:    (kind, templateId) => request('/admin/id-studio.php', { body: { action: 'design', kind, templateId: templateId || '' } }),
        // Printed IDs for those with none, and every member's secure card code; `codesOnly` for a proof.
        // Print from a prompt: the request read into a plan ({plan, notes, by, provider}); nothing is selected or printed by the server.
        // `provider` asks for one AI first (Gemini, Groq…); the server says when it isn't set up and who read it instead.
        plan:      (prompt, current, provider) => request('/admin/id-studio.php', { body: { action: 'plan', prompt, current: current || null, provider: provider || '' }, timeout: 40000 }),
        mintIds:   (memberIds, codesOnly) => request('/admin/id-studio.php', { body: { action: 'mintIds', memberIds, codesOnly: !!codesOnly } }),
        // Afrovanguard member cards: who has one, the card's stylesheet (fonts inlined, ~3 MB, cached per design), each card's markup.
        avCards:   (q) => request('/admin/id-studio.php?view=av' + (q ? '&q=' + encodeURIComponent(q) : ''), { timeout: 40000 }),
        avStyle:   (design) => request('/admin/id-studio.php?view=avStyle&design=' + encodeURIComponent(design || ''), { timeout: 60000 }),
        avFaces:   (ids) => request('/admin/id-studio.php', { body: { action: 'avFaces', ids }, timeout: 60000 }),
      },
      wisdom: {
        list:     () => request('/admin/wisdom.php'),
        save:     (data) => request('/admin/wisdom.php', { body: { action: 'save', data } }),
        remove:   (wisdomId) => request('/admin/wisdom.php', { body: { action: 'delete', wisdomId } }),
        move:     (wisdomId, dir) => request('/admin/wisdom.php', { body: { action: 'move', wisdomId, dir } }),
        generate: (wisdomId, opts) => request('/admin/wisdom.php', { body: Object.assign({ action: 'generate', wisdomId }, opts || {}) }),
        upload:   (wisdomId, audio) => request('/admin/wisdom.php', { body: { action: 'upload', wisdomId, audio } }),
        clearVoice: (wisdomId, which) => request('/admin/wisdom.php', { body: { action: 'clearVoice', wisdomId, which: which || 'both' } }),
        voiceAll: () => request('/admin/wisdom.php', { body: { action: 'voiceAll' } }),
        voiceDefaults: (defaults) => request('/admin/wisdom.php', { body: { action: 'voiceDefaults', defaults } }),
        cloneVoice: (data) => request('/admin/wisdom.php', { body: Object.assign({ action: 'cloneVoice' }, data) }),
        deleteVoice: (voiceId) => request('/admin/wisdom.php', { body: { action: 'deleteVoice', voiceId } }),
      },
      community: {
        overview:      () => request('/admin/community.php' + qs({ view: 'overview' })),
        queue:         (status) => request('/admin/community.php' + qs({ view: 'queue', status: status || 'pending' })),
        channelUpsert: (data) => request('/admin/community.php', { body: { action: 'channel', data } }),
        // `extra` carries `body` (edit & approve), `note` (message, escalate) and `severity` (escalate).
        moderate:      (kind, id, act, extra) => request('/admin/community.php', { body: Object.assign({ action: 'moderate', kind, id, do: act }, extra || {}) }),
        stats:         () => request('/admin/community.php' + qs({ view: 'stats' })),
        health:        () => request('/admin/community.php' + qs({ view: 'health' })),
        // Trained safeguarding leads: take a case, set its severity, move it on.
        safeguardingUpdate: (caseId, change) => request('/admin/community.php', { body: Object.assign({ action: 'safeguardingUpdate', caseId }, change || {}) }),
        // How hard the feed is screened: 'strict' | 'flag' | 'off'. Super admin.
        moderation:    (mode) => request('/admin/community.php', { body: { action: 'moderation', mode } }),
        /* Crisis disclosures the screen caught. A queue of its own, never
           folded into moderation — see the domain comment on why. */
        safeguarding:    (status) => request('/admin/community.php' + qs({ view: 'safeguarding', status: status || 'open' })),
        safeguardingAck: (caseId) => request('/admin/community.php', { body: { action: 'safeguardingAck', caseId } }),
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
        aiKeys:       () => request('/admin/settings.php' + qs({ view: 'aiKeys' })),
        // Every outside service's keys (domain/service-keys.php).
        keys:         () => request('/admin/settings.php' + qs({ view: 'keys' })),
        keysSet:      (service, values, clear) => request('/admin/settings.php', { body: { action: 'keysSet', service, values: values || {}, clear: clear || [] } }),
        keysConfirm:  (confirm) => request('/admin/settings.php', { body: { action: 'keysConfirm', confirm } }),
        keysCancel:   () => request('/admin/settings.php', { body: { action: 'keysCancel' } }),
        keysTest:     (service) => request('/admin/settings.php', { body: { action: 'keysTest', service }, timeout: 60000 }),
        aiKeysSet:    (data) => request('/admin/settings.php', { body: Object.assign({ action: 'aiKeys' }, data) }),
        aiKeysTest:   () => request('/admin/settings.php', { body: { action: 'aiKeysTest' }, timeout: 60000 }),
        aiRouting:    (data) => request('/admin/settings.php', { body: Object.assign({ action: 'aiRouting' }, data) }),
        qrList:       (status, batch) => request('/admin/summer.php' + qs({ view: 'qr', status, batch })),
        qrVoid:       (token) => request('/admin/summer.php', { body: { action: 'qr_void', token } }),
        qrReassign:   (token, studentId) => request('/admin/summer.php', { body: { action: 'qr_reassign', token, studentId } }),
        mint:         (count) => request('/admin/summer.php', { body: { action: 'mint', count } }),
        enroll:       (data) => request('/admin/summer.php', { body: { action: 'enroll', data } }),
        /* An EDITION is one season of Summer School (its id is the `cohortId`
           every other summer table carries); a GROUP is a class within an
           edition — a centre, a course, a lead, its own dates and its own
           capacity. `cohort` is the pre-edition name for the same save and is
           kept so an older cached bundle keeps working. */
        cohort:       (data) => request('/admin/summer.php', { body: { action: 'cohort', data } }),
        editions:     () => request('/admin/summer.php?view=editions'),
        editionSave:  (data) => request('/admin/summer.php', { body: { action: 'editionSave', data } }),
        // A past edition's register, checked then imported (domain/summer-history.php).
        historyImport: (payload) => request('/admin/summer.php', { body: Object.assign({ action: 'historyImport' }, payload), timeout: 180000 }),
        editionStatus:(editionId, status) => request('/admin/summer.php', { body: { action: 'editionStatus', editionId, status } }),
        groups:       (editionId) => request('/admin/summer.php' + qs({ view: 'groups', editionId: editionId || '' })),
        groupSave:    (data) => request('/admin/summer.php', { body: { action: 'groupSave', data } }),
        groupDelete:  (groupId, opts) => request('/admin/summer.php', { body: Object.assign({ action: 'groupDelete', groupId }, opts || {}) }),
        /* Bulk, and PARTIAL by design: forty children into a group with twelve
           seats places twelve and NAMES the twenty-eight. The caller must read
           `results`, not just `ok`. */
        groupAssign:  (groupId, studentIds) => request('/admin/summer.php', { body: { action: 'groupAssign', groupId: groupId || '', studentIds }, timeout: 120000 }),
        groupReport:  (editionId) => request('/admin/summer.php' + qs({ view: 'group-report', editionId: editionId || '' })),
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
        // earlyReason: an admin letting somebody go before closing time (recorded).
        checkout:     (token, opts) => request('/admin/summer.php', { body: Object.assign({ action: 'checkout', token }, opts || {}) }),
        consent:      (studentId) => request('/admin/summer.php' + qs({ view: 'consent', studentId })),
        absenceAlert: (studentId, cohortId) => request('/admin/summer.php', { body: { action: 'absenceAlert', studentId: studentId || '', cohortId: cohortId || '' } }),
        importStudents: (rows) => request('/admin/summer.php', { body: { action: 'import', rows } }),
        /* Summer School Portal v3 (domain/summer-portal.php). `part` names the
           screen — boot | today | people | register | child | consent | cards |
           desk — and `opts` its filters, which the server allow-lists. */
        portal:       (part, opts) => request('/admin/summer.php' + qs(Object.assign({ view: 'portal', part: part || 'boot' }, opts || {}))),
        search:       (q) => request('/admin/summer.php' + qs({ view: 'search', q })),
        recent:       () => request('/admin/summer.php' + qs({ view: 'recent' })),
        // A code, a printed ID or a name in; the one check-in/out op runs on the child's card.
        desk:         (q, mode, earlyReason) => request('/admin/summer.php', { body: { action: 'desk', q, mode: mode || 'in', earlyReason: earlyReason || '' } }),
        alertAbsent:  (defer, cohortId) => request('/admin/summer.php', { body: { action: 'absenceAlert', studentId: '', cohortId: cohortId || '', defer: defer || 0 } }),
        graduatesInvoice: (memberIds, startDate, defer) => request('/admin/summer.php', { body: { action: 'graduatesInvoice', memberIds, startDate: startDate || '', defer: defer || 0 }, timeout: 180000 }),
        // A parked act (`pendingId`): cancel it inside its Undo window, or commit it now.
        pendingCancel: (pendingId) => request('/admin/summer.php', { body: { action: 'pendingCancel', pendingId } }),
        pendingFlush:  (pendingId) => request('/admin/summer.php', { body: { action: 'pendingFlush', pendingId } }),
        // Incidents: a Safeguarding one is filed as a case for the lead (domain/summer-incidents.php).
        incidentSave:  (data) => request('/admin/summer.php', { body: Object.assign({ action: 'incidentSave' }, data || {}) }),
        incidentTell:  (incidentId) => request('/admin/summer.php', { body: { action: 'incidentTell', incidentId } }),
        incidentClose: (incidentId) => request('/admin/summer.php', { body: { action: 'incidentClose', incidentId } }),
        // A template to an audience, parked for its undo window when `defer` is set.
        messageSend:   (data, defer) => request('/admin/summer.php', { body: Object.assign({ action: 'messageSend', defer: defer || 0 }, data || {}), timeout: 180000 }),
      },
      /* Member obligations — membership fee, monthly dues, training fee.
         A LEDGER: `payment` RECORDS money somebody already handed over by cash
         or transfer. There is no gateway behind any of these. */
      /* Joining invoices, and offline payments held until a second member of
         staff verifies them against their evidence (domain/membership-pay.php). */
      /* Smart headshot framing (domain/photo-framing.php): Gemini measures each
         photograph once; every card frames it from that measurement. */
      photoFrame: {
        frame:   (urls, force) => request('/admin/photo-framing.php', { body: { action: 'frame', urls, force: !!force }, timeout: 180000 }),
        backlog: () => request('/admin/photo-framing.php', { body: { action: 'backlog' }, timeout: 180000 }),
        adjust:  (url, adjust, reset) => request('/admin/photo-framing.php', { body: { action: 'adjust', url, adjust: adjust || null, reset: !!reset } }),
        // Lost photo files: search this hosting account, or restore from a backup (domain/photos.php).
        recover: () => request('/admin/photo-framing.php', { body: { action: 'recover' }, timeout: 180000 }),
        lost:    () => request('/admin/photo-framing.php', { body: { action: 'lost' }, timeout: 120000 }),
        restore: (name, data) => request('/admin/photo-framing.php', { body: { action: 'restore', name, data }, timeout: 120000 }),
      },
      membership: {
        list:     (status) => request('/admin/membership.php' + qs({ status: status || '' })),
        create:   (memberId, startDate, send) => request('/admin/membership.php', { body: { action: 'create', memberId, startDate: startDate || '', send: !!send } }),
        resend:   (invoiceId) => request('/admin/membership.php', { body: { action: 'resend', invoiceId } }),
        void:     (invoiceId, reason) => request('/admin/membership.php', { body: { action: 'void', invoiceId, reason } }),
        bank:     (bank) => request('/admin/membership.php', { body: { action: 'bank', bank } }),
        bankConfirm: (confirmAccountNumber) => request('/admin/membership.php', { body: { action: 'bankConfirm', confirmAccountNumber } }),
        bankCancel:  () => request('/admin/membership.php', { body: { action: 'bankCancel' } }),
        // The evidence travels as a data URL, compressed in the browser first (a host refuses big bodies).
        record:   (data) => request('/admin/membership.php', { body: Object.assign({ action: 'record' }, data), timeout: 120000 }),
        verify:   (paymentId, confirmReference, confirmAmount, checked) => request('/admin/membership.php', { body: { action: 'verify', paymentId, confirmReference, confirmAmount, checked: !!checked } }),
        reject:   (paymentId, reason) => request('/admin/membership.php', { body: { action: 'reject', paymentId, reason } }),
        evidenceUrl: (paymentId) => BASE + '/admin/membership.php' + qs({ view: 'evidence', paymentId }),
      },
      fees: {
        settings:    () => request('/admin/fees.php'),
        settingsSet: (data) => request('/admin/fees.php', { body: { action: 'settings', data } }),
        member:      (memberId) => request('/admin/fees.php' + qs({ view: 'member', memberId })),
        arrears:     (limit) => request('/admin/fees.php' + qs({ view: 'arrears', limit })),
        training: (q) => request('/admin/fees.php' + qs(Object.assign({ view: 'training' }, q || {}))),
        /* Find anybody's account, not only a debtor's — the arrears list holds
           people who owe, so it could never answer "has Ada paid?". */
        lookup:      (q) => request('/admin/fees.php' + qs({ view: 'lookup', q })),
        payment:     (memberId, amount, method, reference, note) => request('/admin/fees.php', { body: { action: 'payment', memberId, amount, method, reference, note } }),
        void:        (entryId, reason) => request('/admin/fees.php', { body: { action: 'void', entryId, reason } }),
        mou:         (memberId) => request('/admin/fees.php', { body: { action: 'mou', memberId } }),
        remindOff:   (memberId, off) => request('/admin/fees.php', { body: { action: 'remindOff', memberId, off } }),
        charge:      (memberId, kind, amount, reason, note) => request('/admin/fees.php', { body: { action: 'charge', memberId, kind, amount, reason, note } }),
        fineImport:  (rows, opts) => request('/admin/fees.php', { body: Object.assign({ action: 'fineImport', rows }, opts || {}) }),
        waive:       (memberId, amount, reason) => request('/admin/fees.php', { body: { action: 'waive', memberId, amount, reason } }),
        // Settled up to a date: clears unpaid membership and dues to it, and stops them being charged again.
        settle:      (memberId, date, reason) => request('/admin/fees.php', { body: { action: 'settle', memberId, date, reason } }),
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
      /* Club portal v3 (api/admin/club-portal.php → domain/club-portal.php):
         one route, the op named in the body. */
      clubp: (op, args) => request('/admin/club-portal.php', { body: Object.assign({}, args || {}, { op: op }), timeout: op === 'brief' ? 60000 : undefined }),
      club: {
        overview:   () => request('/admin/club.php?view=overview'),
        /* Both lists are searched, filtered and PAGED server-side now. The
           promotable list used to arrive whole — a 400-child edition as one
           payload, each row costing an attendance query and a profile lookup. */
        promotable: (opts) => request('/admin/club.php' + qs(Object.assign({ view: 'promotable' }, opts || {}))),
        /* `opts` rather than a bare `q`: the roster takes status, centre, sort
           and paging. Omitting `status` means active — the domain's default and
           what this screen has always shown; pass 'all' for every status. */
        members:    (opts) => request('/admin/club.php' + qs(Object.assign({ view: 'members' },
                      typeof opts === 'string' ? { q: opts } : (opts || {})))),
        /* `defer` (seconds) parks the move for an Undo window (domain/pending.php):
           the reply is `{ deferred, pendingId }` and nothing has happened yet. */
        promote:    (studentId, centre, defer) => request('/admin/club.php', { body: { action: 'promote', studentId, centre: centre || '', defer: defer || 0 } }),
        // Into NGG: the edition's graduates by stage (domain/summer-portal.php).
        graduates:  (opts) => request('/admin/club.php' + qs(Object.assign({ view: 'graduates' }, opts || {}))),
        // The NGG centres to offer for one participant, nearest first (domain/centres-ngg.php).
        promoteOptions: (studentId) => request('/admin/club.php' + qs({ view: 'promoteOptions', studentId }), { timeout: 60000 }),
        /* Bulk, and PARTIAL: read `results` for the per-row verdicts, not just
           `ok`. Each promotion goes through the single promote path, so the
           bulk cannot drift from it. */
        promoteBulk: (studentIds, centres, defer) => request('/admin/club.php', { body: { action: 'promoteBulk', studentIds, centres: centres || {}, defer: defer || 0 }, timeout: 180000 }),
        bulk:       (op, memberIds, payload) => request('/admin/club.php', {
                      body: Object.assign({ action: 'bulk', op, memberIds }, payload || {}), timeout: 120000 }),
      },
      contact: {
        list:   (q) => request('/admin/contact.php' + qs(q || {})),
        status: (id, status) => request('/admin/contact.php', { body: { id, status } }),
        reply:  (id, body, close) => request('/admin/contact.php', { body: { action: 'reply', id, body, close: !!close } }),
      },
      behaviour: {
        list:   (q) => request('/admin/behaviour.php' + qs(q || {})),
        log:    (subjectId, note, category, severity) => request('/admin/behaviour.php', { body: { action: 'log', subjectId, note, category, severity } }),
        review: (logId) => request('/admin/behaviour.php', { body: { action: 'review', logId } }),
      },
      /* Is it broken, and did anyone notice. */
      media: {
        usage:   (refresh) => request('/admin/media.php' + (refresh ? '?refresh=1' : '')),
        account: (use) => request('/admin/media.php', { body: { action: 'account', use } }),
        purge:   (confirm) => request('/admin/media.php', { body: { action: 'purgeDerived', confirm } }),
        objects: () => request('/admin/media.php?view=objects'),
        sweep:   () => request('/admin/media.php', { body: { action: 'sweepObjects' } }),
        accounts:      () => request('/admin/media.php?view=accounts'),
        accountSave:   (a) => request('/admin/media.php', { body: Object.assign({ action: 'accountSave' }, a) }),
        accountRemove: (id) => request('/admin/media.php', { body: { action: 'accountRemove', id } }),
        accountMove:   (id, dir) => request('/admin/media.php', { body: { action: 'accountMove', id, dir } }),
        accountCheck:  (id) => request('/admin/media.php', { body: { action: 'accountCheck', id } }),
      },
      ops: {
        status: () => request('/admin/ops.php'),
        clear:  (id) => request('/admin/ops.php', { body: { action: 'clear', id: id || 0 } }),
        run:    (job) => request('/admin/ops.php', { body: { action: 'run', job: job || 'all' } }),
      },
      /* Staff, not children: who has filed what, over what window, next to how
         many children they are responsible for. */
      // The staff role registry — the only list of roles the screen uses.
      roles: () => request('/admin/roles.php'),
      // The status board: members, centres, mentors, instructors, centre leads, staff.
      status: () => request('/admin/status.php'),
      // One member's whole record, for the Members desk.
      memberRecord: (memberId) => request('/admin/member-record.php' + qs({ memberId })),
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
        /* The full specification. The old signature took a name, a game and a
           programme, which is why every tournament was a centre cup with no
           clock — there was nowhere to say otherwise. Kept variadic-friendly:
           pass an object for the new form, or the old three arguments. */
        create:   (data, game, programme) => request('/admin/tournaments.php', {
          body: typeof data === 'string'
            ? { action: 'create', name: data, game: game || 'chess', programme: programme || '' }
            : Object.assign({ action: 'create', game: 'chess' }, data) }),
        draw:     (tournamentId) => request('/admin/tournaments.php', { body: { action: 'draw', tournamentId } }),
        standings:(tournamentId) => request('/admin/tournaments.php' + qs({ view: 'standings', tournamentId })),
        rounds:   (tournamentId) => request('/admin/tournaments.php' + qs({ view: 'rounds', tournamentId })),
        directory:(opts) => request('/admin/tournaments.php', { body: Object.assign({ action: 'directory' }, opts || {}) }),
        /* Ask everybody the tournament's own rules already allow. Pass
           dryRun to get the count without sending anything. */
        inviteAll:(tournamentId, dryRun) => request('/admin/tournaments.php', { body: { action: 'inviteAll', tournamentId, dryRun: !!dryRun } }),
        enter:    (tournamentId, playerId) => request('/admin/tournaments.php', { body: { action: 'enter', tournamentId, playerId } }),
        withdraw: (tournamentId, playerId) => request('/admin/tournaments.php', { body: { action: 'withdraw', tournamentId, playerId } }),
        advance:  (tournamentId) => request('/admin/tournaments.php', { body: { action: 'advance', tournamentId } }),
        replay:   (tournamentId, matchId) => request('/admin/tournaments.php', { body: { action: 'replay', tournamentId, matchId } }),
        cancel:   (tournamentId) => request('/admin/tournaments.php', { body: { action: 'cancel', tournamentId } }),
      },
      volunteers: {
        list:    (programme) => request('/admin/volunteers.php' + qs({ programme: programme || '' })),
        approve: (id) => request('/admin/volunteers.php', { body: { action: 'approve', id } }),
        decline: (id, reason) => request('/admin/volunteers.php', { body: { action: 'decline', id, reason: reason || '' } }),
        safeguard: (volunteerId, status) => request('/admin/volunteers.php', { body: { action: 'safeguard', volunteerId, status } }),
        // Portal access, granted per person by a super admin. caps ⊆ ['summer','club'].
        caps:      (volunteerId, caps) => request('/admin/volunteers.php', { body: { action: 'caps', volunteerId, caps } }),
        update:  (volunteerId, data) => request('/admin/volunteers.php', { body: { action: 'update', volunteerId, data } }),
        academy: (volunteerId, on) => request('/admin/volunteers.php', { body: { action: 'academy', volunteerId, on: !!on } }),
        /* Summer School → NGG: the open NGG centres nearest their Summer venue,
           then the move (keepSummer = they serve both). */
        nggOptions: (volunteerId) => request('/admin/volunteers.php' + qs({ view: 'nggOptions', volunteerId })),
        promoteNgg: (volunteerId, centre, keepSummer, newCard) => request('/admin/volunteers.php', { body: { action: 'promoteNgg', volunteerId, centre: centre || '', keepSummer: !!keepSummer, newCard: !!newCard } }),
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
        editBulk: (items, spec) => request('/admin/photos.php', { body: { action: 'edit_bulk', items, spec } }),
        secure:   () => request('/admin/photos.php', { body: { action: 'secure' } }),
        // Edited photos still stored as a Cloudinary chain → plain images, a batch at a time (photo_materialise).
        materialise: (dryRun) => request('/admin/photos.php', { body: { action: 'materialise', dryRun: !!dryRun } }),
        // The photos of these people, copied off a spent Cloudinary account just before they are used (admin_photos_relocate).
        relocate: (subjects) => request('/admin/photos.php', { body: { action: 'relocate', subjects: subjects || [] } }),
        replace: (subjectType, subjectId, sourceUrl) => request('/admin/photos.php', { body: { action: 'replace', subjectType, subjectId, sourceUrl } }),
        // Members' asks to change their photo (photo_change_requests).
        changes: () => request('/admin/photos.php' + qs({ view: 'changes' })),
        changeDecide: (requestId, decision, note) => request('/admin/photos.php', { body: { action: 'change_decide', requestId, decision, note: note || '' } }),
        /* Children with NO photograph on file — a different question from the
           review queue, which can only show photos that exist. */
        missing: (limit) => request('/admin/photos.php' + qs({ view: 'missing', limit })),
        requestMissing: (limit, quietDays) => request('/admin/photos.php', { body: { action: 'request_missing', limit, quietDays } }),
      },
      /* A club admin's sensitive actions wait here for a second admin
         (domain/approvals.php). `list` is the queue — a club admin sees their
         own requests; `decide` approves (runs it, as the requester) or rejects. */
      approvals: {
        list:     (status) => request('/admin/approvals.php' + qs({ status: status || 'pending' })),
        decide:   (approvalId, decision, reason) => request('/admin/approvals.php', { body: { action: 'decide', approvalId, decision, reason: reason || '' } }),
        withdraw: (approvalId) => request('/admin/approvals.php', { body: { action: 'withdraw', approvalId } }),
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
        // Which of these tokens have no hosted QR yet: [token, …] in, { missing } out. Nothing is sent but the tokens.
        qrMissing: (tokens) => request('/admin/registration.php', { body: { action: 'qr_warm', probe: true, items: tokens.map(token => ({ token })) }, timeout: 60000 }),
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
        gates:      (scope) => request('/admin/registration.php' + qs({ view: 'gates', scope: scope || '' })),
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
        /* Refused while member records, summer participants, groups or
           volunteers still point at the centre, and the refusal says how many
           of each. `{ retire: true }` keeps the row (records still resolve, the
           centre stops being offered); `{ force: true }` really removes it. */
        centreDelete: (centreId, opts) => request('/admin/registration.php', { body: Object.assign({ action: 'centre_delete', centreId }, opts || {}) }),
        catalogue:    () => request('/admin/registration.php' + qs({ view: 'catalogue' })),
        catalogueSet: (catalogue) => request('/admin/registration.php', { body: { action: 'catalogue_set', catalogue } }),
        catalogueReset: () => request('/admin/registration.php', { body: { action: 'catalogue_set', reset: true } }),
        cards:        (studentId) => request('/admin/registration.php' + qs({ view: 'cards', studentId })),
        hierarchy:       () => request('/admin/registration.php' + qs({ view: 'hierarchy' })),
        hierarchyUpsert: (data) => request('/admin/registration.php', { body: { action: 'hierarchy_upsert', data } }),
        hierarchyDelete: (tierId) => request('/admin/registration.php', { body: { action: 'hierarchy_delete', tierId } }),
        volunteerCards:  (volunteerId) => request('/admin/registration.php' + qs({ view: 'vcards', volunteerId })),
        /* NGG member card rows, in the same shape as cards()/volunteerCards()
           so the Card Studio can hold three modes and one renderer path. */
        memberCards:     (memberId) => request('/admin/registration.php' + qs({ view: 'mcards', memberId })),
        /* ID card designs. `save` writes a draft; `publish` freezes the copy a
           print run reads, and refuses on a preflight error — a check that only
           ran in the browser is one a crafted request skips, and what it guards
           is three hundred pieces of card. */
        templates:       (kind) => request('/admin/registration.php' + qs({ view: 'templates', kind: kind || '' })),
        /* ── The print log ──────────────────────────────────────────────────
           Recorded after the browser has produced the file. The template
           VERSION comes from the server's template row, not from this body:
           the client reporting a number about itself is not a record. */
        cardRun:     (data) => request('/admin/registration.php', { body: Object.assign({ action: 'card_run' }, data || {}) }),
        cardRuns:    (opts) => request('/admin/registration.php' + qs(Object.assign({ view: 'card-runs' }, opts || {}))),
        cardRunGet:  (runId) => request('/admin/registration.php' + qs({ view: 'card-run', runId })),
        /* One person's card history, and whether the published design has
           moved on since the card in their hand was printed — the difference
           between "reprint it" and "it's fine". */
        cardHistory: (subjectId, subjectType) => request('/admin/registration.php'
                       + qs({ view: 'card-history', subjectId, subjectType: subjectType || 'member' })),
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
                        issued: (f && f.issued) || '', limit: (f && f.limit) || 0,
                        sort: (f && f.sort) || '', dir: (f && f.dir) || '' })),
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

  /* The assignments desk (api/_lib/assign-desk-route.php) behind either door. */
  function assignDesk(path) {
    return {
      list:        (status) => request(path + qs({ status: status || '' })),
      submissions: (assignmentId) => request(path + qs({ assignmentId })),
      audience:    (a) => request(path + qs({ audience: 1, track: a.track || '', centre: a.centre || '', sessionId: a.sessionId || '' })),
      save:        (data, notify) => request(path, { body: { action: 'save', data, notify: !!notify } }),
      status:      (to, ids) => request(path, { body: { action: 'status', to, ids } }),
      remind:      (assignmentId, force) => request(path, { body: { action: 'remind', assignmentId, force: !!force } }),
      grade:       (submissionId, grade, feedback, email) => request(path, { body: { action: 'grade', submissionId, grade, feedback: feedback || '', email: !!email } }),
      giveBack:    (submissionId, feedback) => request(path, { body: { action: 'return', submissionId, feedback } }),
      suggest:     (submissionId) => request(path, { body: { action: 'suggest', submissionId }, timeout: 90000 }),
      draft:       (unitId, ai) => request(path, { body: { action: 'draft', unitId, ai: !!ai }, timeout: 90000 }),
      auto:        (on) => request(path, { body: { action: 'auto', on: !!on }, timeout: 60000 }),
    };
  }
  /* One support desk, two doors: a member's and a family's route share the
     contract (api/_lib/support-route.php), so one client serves both. */
  function supportApi(base) {
    return {
      meta: () => request(base + '?view=meta'),
      suggest: (q, category) => request(base + qs({ view: 'suggest', q: q || '', category: category || '' })),
      mine: () => request(base + '?view=mine'),
      get: (caseNo) => request(base + qs({ view: 'case', caseNo })),
      open: (payload) => request(base, { body: Object.assign({ action: 'open' }, payload || {}), timeout: 90000 }),
      reply: (caseNo, body, files) => request(base, { body: { action: 'reply', caseNo, body, files: files || [] }, timeout: 90000 }),
      solve: (caseNo) => request(base, { body: { action: 'solve', caseNo } }),
      rate: (caseNo, rating, note) => request(base, { body: { action: 'rate', caseNo, rating, note: note || '' } }),
      fileUrl: (caseNo, f) => BASE + base + qs({ view: 'file', caseNo, f }),
    };
  }
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
    /* Mentor Portal writes that must survive a Saturday with no signal: the
       register, weekly reviews and session notes. Each is an upsert or a
       single row on the server, so a replay after a dropped reply is safe. */
    'mentor.act':     (p) => request('/member/mentor.php', { body: p }),
    /* The instructor's Saturday: roll, plan, hinge tally, exit ticket, log and
       skill marks. Each is an upsert on the server, so a replay is safe. */
    'teaching.act':   (p) => request('/member/teaching.php', { body: p }),
  };
  /* Time on the portal (engagement.php portal_time_beat). */
  API.portalBeat = (portal, seconds) => request('/member/beat.php', { body: { portal: portal, seconds: seconds } });

  global.NGGApi = API;
  global.NGGApiBase = BASE;

  /* How long people actually use the portals. Time counts only while the page
     is visible AND someone touched it in the last two minutes, so a tab left
     open overnight adds nothing; it is sent once a minute. A signed-out page
     gets one refusal and stops asking for five minutes. */
  var BEAT_PORTALS = { dashboard: 'member', member: 'member', profile: 'member', 'journal-entry': 'member', circle: 'member',
                       mentor: 'mentor', instructor: 'instructor', community: 'community', family: 'family' };
  var beatInput = Date.now(), beatTick = Date.now(), beatOwed = 0, beatOffAt = 0;
  function beatPortal() {
    var seg = (global.location.pathname || '/').split('/')[1] || '';
    return BEAT_PORTALS[seg] || '';
  }
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, function () { beatInput = Date.now(); }, { passive: true, capture: true });
  });
  global.setInterval(function () {
    var now = Date.now(), gap = Math.min(60, Math.round((now - beatTick) / 1000));
    beatTick = now;
    var portal = beatPortal();
    if (!portal || document.visibilityState !== 'visible' || now - beatInput > 120000) return;
    if (now - beatOffAt < 300000) return;
    beatOwed += gap;
    if (beatOwed < 60) return;
    var send = beatOwed; beatOwed = 0;
    API.portalBeat(portal, send).catch(function (e) {
      if (e && (e.status === 401 || e.status === 403 || e.code === 'not_signed_in' || e.code === 'forbidden' || e.code === 'unauthenticated')) beatOffAt = Date.now();
    });
  }, 15000);
})(window);
