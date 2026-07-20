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
    // Headshots are captured on PUBLIC surfaces (apply, gate registration, the
    // guardian reshoot page) where there is no session — so they sign through
    // the public headshot endpoint. Everything else uses the member endpoint.
    const sig = kind === 'headshot'
      ? await request('/public/upload-headshot-sign.php', { body: {} })
      : await request('/member/upload-sign.php', { body: { kind } });
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
    uploadFile: uploadFile,
    uploadPublic: uploadPublic,
    auth: {
      gateway: (identifier) => request('/auth/gateway.php', { body: { identifier } }),
      request: (identifier) => request('/auth/request.php', { body: { identifier } }),
      login:   (identifier, password) => request('/auth/login.php', { body: { identifier, password } }),
      resetRequest: (identifier) => request('/auth/reset-request.php', { body: { identifier } }),
      resetConfirm: (creds) => request('/auth/reset-confirm.php', { body: creds }),
      setPassword: (password, current) => request('/auth/set-password.php', { body: { password, current: current || '' } }),
      verify:  (creds) => request('/auth/verify.php', { body: creds }),
      me:      () => request('/auth/me.php'),
      logout:  () => request('/auth/logout.php', { method: 'POST' }),
      adminTotpSetup:  () => request('/auth/admin-totp-setup.php', { method: 'POST' }),
      adminTotpVerify: (code) => request('/auth/admin-2fa.php', { body: { code } }),
    },
    member: {
      dashboard:     () => request('/member/dashboard.php'),
      anchor:        () => request('/member/anchor.php'),
      mentorRoster:  () => request('/member/mentor.php'),
      starGive:      (subjectId, stars, category, note) => request('/member/mentor.php', { body: { action: 'star', subjectId, stars, category, note } }),
      v3Rate:        (subjectId, verbal, vocal, visual, note) => request('/member/mentor.php', { body: { action: 'v3', subjectId, verbal, vocal, visual, note } }),
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
        checkin:  (gate, token) => request('/public/gate.php', { body: { action: 'checkin', gate, token } }),
        dutyClose:(gate) => request('/public/gate.php', { body: { action: 'duty_close', gate } }),
        // Kiosk unlock — mints a gate-scoped session so field staff run the
        // desk without an admin login (see /public/gate-unlock.php).
        unlock:   (gate, password) => request('/public/gate-unlock.php', { body: { gate, password } }),
      },
      verify: {
        context: (t) => request('/public/verify.php' + qs({ t })),
        submit:  (t, consents, actorName, feedback) => request('/public/verify.php', { body: { t, consents, actorName, feedback } }),
      },
      reshoot: {
        context: (t) => request('/public/reshoot.php' + qs({ t })),
        submit:  (t, photoUrl) => request('/public/reshoot.php', { body: { t, photoUrl } }),
      },
      circle: {
        lookup:    (code) => request('/public/circle.php' + qs({ view: 'lookup', code })),
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
      summer: {
        overview:     () => request('/admin/summer.php?view=overview'),
        students:     (q, cohortId) => request('/admin/summer.php' + qs({ view: 'students', q, cohortId })),
        qrList:       (status, batch) => request('/admin/summer.php' + qs({ view: 'qr', status, batch })),
        qrVoid:       (token) => request('/admin/summer.php', { body: { action: 'qr_void', token } }),
        qrReassign:   (token, studentId) => request('/admin/summer.php', { body: { action: 'qr_reassign', token, studentId } }),
        mint:         (count) => request('/admin/summer.php', { body: { action: 'mint', count } }),
        enroll:       (data) => request('/admin/summer.php', { body: { action: 'enroll', data } }),
        cohort:       (data) => request('/admin/summer.php', { body: { action: 'cohort', data } }),
        studentStatus:(studentId, status) => request('/admin/summer.php', { body: { action: 'studentStatus', studentId, status } }),
        studentUpdate:(studentId, data) => request('/admin/summer.php', { body: { action: 'studentUpdate', studentId, data } }),
        studentDelete:(studentId) => request('/admin/summer.php', { body: { action: 'studentDelete', studentId } }),
        checkin:      (token, method, device) => request('/admin/summer.php', { body: { action: 'checkin', token, method, device } }),
        attendance:   (cohortId) => request('/admin/summer.php' + qs({ view: 'attendance', cohortId })),
        insights:     (cohortId) => request('/admin/summer.php' + qs({ view: 'insights', cohortId })),
        archive:      (cohortId, compress) => request('/admin/summer.php', { body: { action: 'archive', cohortId, compress: !!compress } }),
        issueCerts:   (status, cohortId) => request('/admin/summer.php', { body: { action: 'issueCerts', status: status || 'graduated', cohortId: cohortId || '' } }),
        revokeCert:   (certId, restore) => request('/admin/summer.php', { body: { action: 'revokeCert', certId, restore: !!restore } }),
        checkout:     (token) => request('/admin/summer.php', { body: { action: 'checkout', token } }),
        absenceAlert: (studentId, cohortId) => request('/admin/summer.php', { body: { action: 'absenceAlert', studentId: studentId || '', cohortId: cohortId || '' } }),
        importStudents: (rows) => request('/admin/summer.php', { body: { action: 'import', rows } }),
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
        gateCreate: (name, expiresAt, password, centreId) => request('/admin/registration.php', { body: { action: 'gate_create', name, expiresAt, password: password || '', centreId: centreId || '' } }),
        gateSetpass: (gateId, password) => request('/admin/registration.php', { body: { action: 'gate_setpass', gateId, password: password || '' } }),
        gateRevoke: (gateId) => request('/admin/registration.php', { body: { action: 'gate_revoke', gateId } }),
        list:       () => request('/admin/registration.php' + qs({ view: 'registrations' })),
        remind:     (studentId) => request('/admin/registration.php', { body: { action: 'remind', studentId } }),
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
        projectDelete: (id) => request('/admin/profiles.php', { body: { action: 'project_delete', id } }),
        noteUpsert:   (data) => request('/admin/profiles.php', { body: Object.assign({ action: 'note_upsert' }, data) }),
        noteDelete:   (id) => request('/admin/profiles.php', { body: { action: 'note_delete', id } }),
      },
      integrations: {
        list:     () => request('/admin/integrations.php'),
        upsert:   (data) => request('/admin/integrations.php', { body: { action: 'upsert', data } }),
        remove:   (integrationId) => request('/admin/integrations.php', { body: { action: 'delete', integrationId } }),
        test:     (integrationId) => request('/admin/integrations.php', { body: { action: 'test', integrationId } }),
        dispatch: () => request('/admin/integrations.php', { body: { action: 'dispatch' } }),
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
