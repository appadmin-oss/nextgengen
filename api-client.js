/* ================================================================
   NGG — API client.
   Thin wrapper around fetch with credentials + JSON handling.
   ================================================================ */

(function (global) {
  const BASE = '/api';

  async function request(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, {
      method: opts.method || (body ? 'POST' : 'GET'),
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

  const API = {
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
    },
    public: {
      stats:   () => request('/public/stats.php'),
      events:  () => request('/public/events.php'),
      posts:   (kind, tag) => request('/public/posts.php' + qs({ kind, tag })),
      post:    (slug) => request('/public/post.php' + qs({ slug })),
      session: () => request('/public/session.php'),
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
        upsert: (data) => request('/admin/events.php', { body: data }),
      },
      posts: {
        upsert: (data) => request('/admin/posts.php', { body: data }),
      },
      promotions: {
        set: (promo) => request('/admin/promotions.php', { body: { promo } }),
      },
      broadcast: (data) => request('/admin/broadcast.php', { body: data }),
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
