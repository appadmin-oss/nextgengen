/**
 * Admin endpoints — every call enforces requesterId has admin role.
 *
 * Note: PHP proxy also enforces this, but never trust the client. The
 * Apps Script side re-checks via `requireAdmin_` on every call.
 */

function requireAdmin_(p) {
  const requesterId = String(p.requesterId || '');
  const requester = findRow_('Members', r => String(r.memberId) === requesterId);
  if (!requester) return { ok: false, error: 'no_requester' };
  if (!isAdminRole_(requester.role)) return { ok: false, error: 'forbidden' };
  return { ok: true, requester: requester };
}

function requireSuperAdmin_(p) {
  const r = requireAdmin_(p);
  if (!r.ok) return r;
  if (String(r.requester.role).toLowerCase() !== 'super_admin') return { ok: false, error: 'forbidden' };
  return r;
}

// ---------- Members ----------

function Admin_membersList(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const q = String(p.q || '').toLowerCase();
  const centre = String(p.centre || '');
  const status = String(p.status || '');
  const type = String(p.type || '');

  let rows = readSheet_('Members').rows.slice();
  if (q) rows = rows.filter(r =>
    String(r.fullName || '').toLowerCase().includes(q) ||
    String(r.memberId || '').toLowerCase().includes(q) ||
    String(r.email || '').toLowerCase().includes(q)
  );
  if (centre) rows = rows.filter(r => String(r.centre) === centre);
  if (status) rows = rows.filter(r => String(r.status) === status);
  if (type)   rows = rows.filter(r => String(r.type) === type);

  return { ok: true, total: rows.length, members: rows.map(publicMember_) };
}

function Admin_membersUpsert(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const data = p.data || {};
  const memberId = String(data.memberId || '').trim();
  const existing = memberId ? findRow_('Members', r => String(r.memberId) === memberId) : null;

  // Only super_admin can set/change role.
  if (data.role && !requireSuperAdmin_(p).ok) delete data.role;

  if (existing) {
    const patch = Object.assign({}, data, { updatedAt: nowIso_() });
    delete patch.memberId; delete patch.createdAt;
    if (patch.socials && typeof patch.socials === 'object') patch.socials = JSON.stringify(patch.socials);
    patchRow_('Members', existing.__rowNumber, patch);
    audit_('admin.member.update', gate.requester.memberId, memberId, { keys: Object.keys(patch) }, String(p.ip || ''));
    return { ok: true, memberId: memberId };
  }

  const newId = newId_(data.type === 'Summer' ? 'SUM' : 'NGG');
  const insert = Object.assign({}, data, {
    memberId: newId,
    status: data.status || 'active',
    role: data.role || 'member',
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
  });
  if (insert.socials && typeof insert.socials === 'object') insert.socials = JSON.stringify(insert.socials);
  appendRow_('Members', insert);
  audit_('admin.member.create', gate.requester.memberId, newId, {}, String(p.ip || ''));
  return { ok: true, memberId: newId };
}

// ---------- Mentors ----------

function Admin_mentorsList(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const rows = readSheet_('Mentors').rows;
  return { ok: true, mentors: rows.map(publicMentor_) };
}

function Admin_mentorsUpsert(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const data = p.data || {};
  const mentorId = String(data.mentorId || '').trim();
  const existing = mentorId ? findRow_('Mentors', r => String(r.mentorId) === mentorId) : null;
  if (existing) {
    const patch = Object.assign({}, data, { updatedAt: nowIso_() });
    delete patch.mentorId; delete patch.createdAt;
    if (patch.availability && typeof patch.availability === 'object') patch.availability = JSON.stringify(patch.availability);
    patchRow_('Mentors', existing.__rowNumber, patch);
    audit_('admin.mentor.update', gate.requester.memberId, mentorId, {}, String(p.ip || ''));
    return { ok: true, mentorId: mentorId };
  }
  const newId = newId_('MEN');
  const insert = Object.assign({}, data, {
    mentorId: newId,
    status: data.status || 'pending-checks',
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
  });
  if (insert.availability && typeof insert.availability === 'object') insert.availability = JSON.stringify(insert.availability);
  appendRow_('Mentors', insert);
  audit_('admin.mentor.create', gate.requester.memberId, newId, {}, String(p.ip || ''));
  return { ok: true, mentorId: newId };
}

// ---------- Sessions ----------

function Admin_sessionsUpsert(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const data = p.data || {};
  const sessionId = String(data.sessionId || '').trim();
  const existing = sessionId ? findRow_('Sessions', r => String(r.sessionId) === sessionId) : null;
  const patch = Object.assign({}, data, { updatedAt: nowIso_() });
  delete patch.createdAt;
  if (existing) {
    patchRow_('Sessions', existing.__rowNumber, patch);
    audit_('admin.session.update', gate.requester.memberId, sessionId, {}, String(p.ip || ''));
    return { ok: true, sessionId: sessionId };
  }
  patch.createdAt = nowIso_();
  appendRow_('Sessions', patch);
  audit_('admin.session.create', gate.requester.memberId, sessionId, {}, String(p.ip || ''));
  return { ok: true, sessionId: sessionId };
}

// ---------- Missions ----------

function Admin_missionsList(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const rows = readSheet_('AnchorMissions').rows.slice().sort((a, b) =>
    Number(a.week) - Number(b.week) || Number(a.order || 0) - Number(b.order || 0));
  return { ok: true, missions: rows };
}

function Admin_missionsUpsert(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const data = p.data || {};
  const missionId = String(data.missionId || '').trim();
  const existing = missionId ? findRow_('AnchorMissions', r => String(r.missionId) === missionId) : null;
  const patch = Object.assign({}, data, { updatedAt: nowIso_() });
  if (existing) {
    delete patch.createdAt;
    patchRow_('AnchorMissions', existing.__rowNumber, patch);
  } else {
    patch.missionId = missionId || ('ANCH-W' + String(data.week || 0).padStart(2, '0') + '-M' + randHex_(2));
    patch.createdAt = nowIso_();
    appendRow_('AnchorMissions', patch);
  }
  audit_('admin.mission.upsert', gate.requester.memberId, patch.missionId, {}, String(p.ip || ''));
  return { ok: true, missionId: patch.missionId };
}

// ---------- Events ----------

function Admin_eventsUpsert(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const data = p.data || {};
  const eventId = String(data.eventId || '').trim();
  const existing = eventId ? findRow_('Events', r => String(r.eventId) === eventId) : null;
  const patch = Object.assign({}, data, { updatedAt: nowIso_(), createdBy: gate.requester.memberId });
  if (existing) {
    delete patch.createdAt;
    patchRow_('Events', existing.__rowNumber, patch);
    audit_('admin.event.update', gate.requester.memberId, eventId, {}, String(p.ip || ''));
    return { ok: true, eventId: eventId };
  }
  const newId = 'EVT-' + new Date().getFullYear() + '-' + randHex_(4);
  patch.eventId = newId;
  patch.createdAt = nowIso_();
  appendRow_('Events', patch);
  audit_('admin.event.create', gate.requester.memberId, newId, {}, String(p.ip || ''));
  return { ok: true, eventId: newId };
}

// Admin event list — ALL events regardless of status/visibility/date, so
// drafts, internal (non-public) and past events are all manageable. The
// public events endpoint filters to published+public+future, which is
// wrong for an editing surface. Newest first.
function Admin_eventsList(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const rows = readSheet_('Events').rows.slice()
    .sort((a, b) => new Date(b.startAt || b.createdAt || 0) - new Date(a.startAt || a.createdAt || 0));
  return { ok: true, total: rows.length, events: rows.map(adminEvent_) };
}

// Full editable event record — includes status (which publicEvent_ drops,
// causing every edit to silently force-publish).
function adminEvent_(e) {
  return {
    eventId: e.eventId,
    title: e.title,
    kind: e.kind,
    status: e.status || 'draft',
    startAt: e.startAt,
    endAt: e.endAt,
    centre: e.centre,
    location: e.location,
    coverUrl: e.coverUrl || '',
    body: e.body || '',
    capacity: Number(e.capacity || 0),
    isPublic: Boolean(e.isPublic),
  };
}

// ---------- Posts ----------

function Admin_postsUpsert(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const data = p.data || {};
  const postId = String(data.postId || '').trim();
  const existing = postId ? findRow_('Posts', r => String(r.postId) === postId) : null;
  const patch = Object.assign({}, data, { updatedAt: nowIso_(), authorId: data.authorId || gate.requester.memberId });
  if (existing) {
    delete patch.createdAt;
    patchRow_('Posts', existing.__rowNumber, patch);
    audit_('admin.post.update', gate.requester.memberId, postId, {}, String(p.ip || ''));
    return { ok: true, postId: postId };
  }
  const newId = 'POST-' + new Date().getFullYear() + '-' + randHex_(4);
  patch.postId = newId;
  patch.slug = data.slug || slugify_(data.title || newId);
  patch.createdAt = nowIso_();
  patch.status = data.status || 'draft';
  appendRow_('Posts', patch);
  audit_('admin.post.create', gate.requester.memberId, newId, {}, String(p.ip || ''));
  return { ok: true, postId: newId, slug: patch.slug };
}

// Admin post list — ALL posts regardless of status (drafts/archived too),
// newest first. Body omitted to keep the list light; the editor fetches
// the full record via admin.posts.get. The public posts endpoint only
// returns published, which hid every draft an admin created.
function Admin_postsList(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const rows = readSheet_('Posts').rows.slice()
    .sort((a, b) => new Date(b.publishAt || b.createdAt || 0) - new Date(a.publishAt || a.createdAt || 0));
  return { ok: true, total: rows.length, posts: rows.map(function (r) { return adminPost_(r, false); }) };
}

// Admin post fetch by id — any status, includes body. Lets admins open a
// draft to edit/publish; Post_get requires published and 404s on drafts.
function Admin_postsGet(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const id = String(p.postId || '').trim();
  const row = findRow_('Posts', r => String(r.postId) === id);
  if (!row) return { ok: false, error: 'not_found' };
  return { ok: true, post: adminPost_(row, true) };
}

// Full editable post record — raw stored values (not display-normalized),
// tags as the raw comma string the editor expects, and crucially `status`
// (which publicPost_ drops, so edits re-seeded status to "draft" and
// silently unpublished live posts).
function adminPost_(p, includeBody) {
  const out = {
    postId: p.postId,
    slug: p.slug,
    kind: p.kind,
    status: p.status || 'draft',
    title: p.title,
    excerpt: p.excerpt || '',
    coverUrl: p.coverUrl || '',
    category: p.category || '',
    tags: String(p.tags || ''),
    featured: Boolean(p.featured),
    authorId: p.authorId || '',
    publishAt: p.publishAt || '',
    createdAt: p.createdAt || '',
    promoCta: p.promoCta || '',
    promoUrl: p.promoUrl || '',
    promoExpires: p.promoExpires || '',
  };
  if (includeBody) out.body = p.body || '';
  return out;
}

function Admin_promotionsSet(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const promo = p.promo || null;
  const t = readSheet_('Settings');
  const row = t.rows.find(r => r.key === 'homepage_promo');
  if (row) patchRow_('Settings', row.__rowNumber, {
    value: promo ? JSON.stringify(promo) : '',
    updatedAt: nowIso_(),
    updatedBy: gate.requester.memberId,
  });
  else appendRow_('Settings', {
    key: 'homepage_promo',
    value: promo ? JSON.stringify(promo) : '',
    updatedAt: nowIso_(),
    updatedBy: gate.requester.memberId,
  });
  audit_('admin.promo.set', gate.requester.memberId, '', { promo }, String(p.ip || ''));
  return { ok: true };
}

function Admin_auditTail(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const limit = Math.min(500, Number(p.limit || 100));
  const rows = readSheet_('AuditLog').rows.slice(-limit).reverse();
  return { ok: true, audit: rows };
}

function Admin_broadcast(p, e) {
  const gate = requireAdmin_(p); if (!gate.ok) return gate;
  const title = String(p.title || '');
  const body = String(p.body || '');
  const linkPage = String(p.linkPage || '');
  appendRow_('Notifications', {
    notifId: 'N-' + new Date().getFullYear() + '-' + randHex_(4),
    memberId: '*',
    kind: 'announcement',
    title: title,
    body: body,
    linkPage: linkPage,
    readAt: '',
    createdAt: nowIso_(),
  });
  audit_('admin.broadcast', gate.requester.memberId, '', { title }, String(p.ip || ''));
  return { ok: true };
}

function slugify_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
