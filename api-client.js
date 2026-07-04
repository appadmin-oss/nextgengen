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
    const res = await fetch(BASE + path, {
      method: method,
      credentials: 'include',
      headers: headers,
      body: body,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || ('http_' + res.status));
      err.status = res.status;
      err.detail = data.detail;
      err.code = data.error;
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

  async function uploadFile(file, kind, onProgress) {
    kind = kind || 'proof';
    const sig = await request('/member/upload-sign.php', { body: { kind } });
    return await new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', sig.apiKey);
      fd.append('timestamp', sig.timestamp);
      fd.append('signature', sig.signature);
      fd.append('folder', sig.folder);
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

  const API = {
    config: getConfig,
    uploadFile: uploadFile,
    auth: {
      request: (identifier) => request('/auth/request.php', { body: { identifier } }),
      verify:  (creds) => request('/auth/verify.php', { body: creds }),
      me:      () => request('/auth/me.php'),
      logout:  () => request('/auth/logout.php', { method: 'POST' }),
      adminTotpSetup:  () => request('/auth/admin-totp-setup.php', { method: 'POST' }),
      adminTotpVerify: (code) => request('/auth/admin-2fa.php', { body: { code } }),
    },
    member: {
      dashboard:     () => request('/member/dashboard.php'),
      anchor:        () => request('/member/anchor.php'),
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
    },
    public: {
      stats:      () => request('/public/stats.php'),
      events:     () => request('/public/events.php'),
      posts:      (kind, tag) => request('/public/posts.php' + qs({ kind, tag })),
      post:       (slug) => request('/public/post.php' + qs({ slug })),
      session:    () => request('/public/session.php'),
      anchorContent: () => request('/public/anchor-content.php'),
      newsletter: (email, source) => request('/public/newsletter.php', { body: { email, source: source || 'site' } }),
      apply:      (data) => request('/public/apply.php', { body: data }),
    },
    admin: {
      members: {
        list:   (q) => request('/admin/members.php' + qs(q || {})),
        upsert: (data) => request('/admin/members.php', { body: data }),
      },
      mentors: {
        list:   () => request('/admin/mentors.php'),
        upsert: (data) => request('/admin/mentors.php', { body: data }),
      },
      sessions: {
        list:   (year) => request('/admin/sessions.php' + qs({ year })),
        upsert: (data) => request('/admin/sessions.php', { body: data }),
      },
      missions: {
        list:   () => request('/admin/missions.php'),
        upsert: (data) => request('/admin/missions.php', { body: data }),
      },
      events: {
        list:   () => request('/admin/events.php'),
        upsert: (data) => request('/admin/events.php', { body: data }),
      },
      posts: {
        list:   () => request('/admin/posts.php'),
        get:    (postId) => request('/admin/posts.php' + qs({ postId })),
        upsert: (data) => request('/admin/posts.php', { body: data }),
      },
      promotions: {
        set: (promo) => request('/admin/promotions.php', { body: { promo } }),
      },
      assignments: {
        list:        () => request('/admin/assignments.php'),
        submissions: (assignmentId) => request('/admin/assignments.php' + qs({ assignmentId })),
        upsert:      (data) => request('/admin/assignments.php', { body: data }),
        grade:       (data) => request('/admin/assignments.php', { body: data }),
      },
      broadcast: (data) => request('/admin/broadcast.php', { body: data }),
      anchor: {
        get: () => request('/admin/anchor.php'),
        set: (data) => request('/admin/anchor.php', { body: { data } }),
      },
      audit:     (limit) => request('/admin/audit.php' + qs({ limit })),
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
