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
      const err = new Error(aborted ? 'timeout' : 'network');
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
      sc.addEventListener('load', () => res(window.ImageTools), { once: true });
      sc.addEventListener('error', () => rej(new Error('image_tools_unavailable')), { once: true });
      setTimeout(() => rej(new Error('image_tools_timeout')), 20000);
    });
    return _toolsPromise;
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

  const API = {
    config: getConfig,
    // Lazily loads /vendor/image-tools.js (pica + Cropper.js) and resolves to
    // window.ImageTools. Shared so the photo studio and the upload shrinker
    // load it once between them.
    imageTools: ensureImageTools,
    uploadFile: uploadFile,
    uploadPublic: uploadPublic,
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
      coach:        (messages) => request('/member/coach.php', { body: { messages } }),
      circle:       () => request('/member/circle.php'),
      circleRotate: () => request('/member/circle.php', { body: { action: 'rotate' } }),
      circleRevoke: (linkId) => request('/member/circle.php', { body: { action: 'revoke', linkId } }),
      react:               (post, emoji) => request('/member/engage.php', { body: { action: 'react', post, emoji } }),
      comment:             (post, body) => request('/member/engage.php', { body: { action: 'comment', post, body } }),
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
      siteContent: () => request('/public/site.php'),
      instructorRoster: (token, email) => request('/public/instructor.php', { body: { token, email } }),
      contact:    (data) => request('/public/contact.php', { body: data }),
      gate: {
        context:  (g) => request('/public/gate.php' + qs({ g })),
        register: (gate, data, photoUrl, force, opts) => request('/public/gate.php', { body: {
          action: 'register', gate, data, photoUrl, force,
          lat: opts && opts.lat, lng: opts && opts.lng, geoOverride: !!(opts && opts.geoOverride),
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
      verify: {
        context: (t) => request('/public/verify.php' + qs({ t })),
        submit:  (t, consents, actorName, feedback, signature) => request('/public/verify.php', { body: { t, consents, actorName, feedback, signature } }),
      },
      reshoot: {
        context: (t) => request('/public/reshoot.php' + qs({ t })),
        submit:  (t, photoUrl) => request('/public/reshoot.php', { body: { t, photoUrl } }),
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
      dashboard:    () => request('/admin/dashboard.php'),
      statusPages:  () => request('/admin/status-pages.php'),
      statusPagesSet: (data) => request('/admin/status-pages.php', { body: { data } }),
      analytics:    (filters) => request('/admin/analytics.php' + qs(filters || {})),
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
      },
      summer: {
        overview:     () => request('/admin/summer.php?view=overview'),
        students:     (q, cohortId) => request('/admin/summer.php' + qs({ view: 'students', q, cohortId })),
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
        attendance:   (cohortId) => request('/admin/summer.php' + qs({ view: 'attendance', cohortId })),
        insights:     (cohortId) => request('/admin/summer.php' + qs({ view: 'insights', cohortId })),
        archive:      (cohortId, compress) => request('/admin/summer.php', { body: { action: 'archive', cohortId, compress: !!compress } }),
        issueCerts:   (status, cohortId) => request('/admin/summer.php', { body: { action: 'issueCerts', status: status || 'graduated', cohortId: cohortId || '' } }),
        revokeCert:   (certId, restore) => request('/admin/summer.php', { body: { action: 'revokeCert', certId, restore: !!restore } }),
        checkout:     (token) => request('/admin/summer.php', { body: { action: 'checkout', token } }),
        consent:      (studentId) => request('/admin/summer.php' + qs({ view: 'consent', studentId })),
        absenceAlert: (studentId, cohortId) => request('/admin/summer.php', { body: { action: 'absenceAlert', studentId: studentId || '', cohortId: cohortId || '' } }),
        importStudents: (rows) => request('/admin/summer.php', { body: { action: 'import', rows } }),
      },
      /* Programme calendar + Institutional Policy enforcement. The calendar
         decides which days count; the policy engine decides what a missed one
         costs. Both live behind the same 'summer' capability. */
      policy: {
        settings:  () => request('/admin/policy.php' + qs({ view: 'settings' })),
        board:     () => request('/admin/policy.php' + qs({ view: 'board' })),
        person:    (personId, personType) => request('/admin/policy.php' + qs({ view: 'person', personId, personType })),
        save:      (programme, policy) => request('/admin/policy.php', { body: { action: 'save', programme, policy } }),
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
      },
      /* Staff, not children: who has filed what, over what window, next to how
         many children they are responsible for. */
      staff: {
        performance: (days) => request('/admin/staff.php?view=performance&days=' + (days || 30)),
        ackRemark:   (remarkId) => request('/admin/staff.php', { body: { action: 'ack', remarkId } }),
        skills:      () => request('/admin/staff.php?view=skills'),
        saveSkills:  (skills) => request('/admin/staff.php', { body: { action: 'skills', skills } }),
      },
      volunteers: {
        list:    () => request('/admin/volunteers.php'),
        approve: (id) => request('/admin/volunteers.php', { body: { action: 'approve', id } }),
        decline: (id, reason) => request('/admin/volunteers.php', { body: { action: 'decline', id, reason: reason || '' } }),
        safeguard: (volunteerId, status) => request('/admin/volunteers.php', { body: { action: 'safeguard', volunteerId, status } }),
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
      },
      registration: {
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

  global.NGGApi = API;
  global.NGGApiBase = BASE;
})(window);
