/**
 * Members + Mentors + Dashboard.
 */

function Member_dashboard(p, e) {
  const memberId = String(p.memberId || '');
  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member) return { ok: false, error: 'not_found' };

  // Stats (denormalized)
  const stats = findRow_('MemberStats', r => String(r.memberId) === memberId) || {};

  // Current session + week
  const sessionRes = Session_current({}, null);
  const session = sessionRes.current || sessionRes.next || null;

  // Today's missions (week-aligned, not completed yet by this member)
  const week = session ? weekOfSession_(session) : 1;
  const missions = filterRows_('AnchorMissions', m => Number(m.week) === Math.min(12, week) && m.isActive !== false);
  const progress = filterRows_('MemberProgress', r =>
    String(r.memberId) === memberId &&
    String(r.sessionId) === String(session && session.sessionId));
  const progressByMission = {};
  progress.forEach(p => { progressByMission[p.missionId] = p; });

  const today = missions.map(m => ({
    missionId: m.missionId,
    title: m.title,
    prompt: m.prompt,
    xp: Number(m.xp || 0),
    type: m.type,
    proof: m.proof,
    bookPage: Number(m.bookPage || 0),
    estimatedMin: Number(m.estimatedMin || 0),
    status: (progressByMission[m.missionId] && progressByMission[m.missionId].status) || 'todo',
  }));

  // Upcoming events (next 30 days, this member's centre OR Both)
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 86400 * 1000);
  const events = filterRows_('Events', r => {
    if (String(r.status) !== 'published') return false;
    const c = String(r.centre);
    if (c !== 'Both' && c !== 'Online' && c !== String(member.centre)) return false;
    const start = new Date(r.startAt);
    return start >= now && start <= horizon;
  }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .slice(0, 5)
    .map(publicEvent_);

  // Unread notifications
  const notes = filterRows_('Notifications', r =>
    (String(r.memberId) === memberId || String(r.memberId) === '*') && !r.readAt
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
   .slice(0, 8)
   .map(publicNotification_);

  // Assigned mentor (if any, this session)
  let mentor = null;
  if (session) {
    const link = findRow_('MentorAssignments', r =>
      String(r.memberId) === memberId &&
      String(r.sessionId) === String(session.sessionId) &&
      String(r.status) === 'active'
    );
    if (link) {
      const m = findRow_('Mentors', r => String(r.mentorId) === String(link.mentorId));
      if (m) mentor = publicMentor_(m);
    }
  }

  return {
    ok: true,
    member: publicMember_(member),
    stats: {
      xp: Number(stats.xpTotal || 0),
      level: Number(stats.level || 1),
      streak: Number(stats.streak || 0),
      badges: safeJson_(stats.badges) || [],
      badgeCount: Number(stats.badgeCount || 0),
      currentWeek: week,
      completedThisSession: Number(stats.completedThisSession || 0),
      lastActiveAt: stats.lastActiveAt || '',
    },
    session: session,
    today: today,
    events: events,
    notifications: notes,
    mentor: mentor,
  };
}

function Member_update(p, e) {
  const memberId = String(p.memberId || '');
  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member) return { ok: false, error: 'not_found' };

  const allowed = ['bio', 'photoUrl', 'socials', 'phone', 'parentEmail', 'parentPhone', 'school', 'fullName'];
  const patch = { updatedAt: nowIso_() };
  for (const k of allowed) {
    if (typeof p[k] !== 'undefined') {
      patch[k] = (k === 'socials' && typeof p[k] === 'object') ? JSON.stringify(p[k]) : p[k];
    }
  }
  patchRow_('Members', member.__rowNumber, patch);
  audit_('member.update', memberId, memberId, { keys: Object.keys(patch) }, String(p.ip || ''));
  return { ok: true };
}

function Member_notifications(p, e) {
  const memberId = String(p.memberId || '');
  const rows = filterRows_('Notifications', r =>
    String(r.memberId) === memberId || String(r.memberId) === '*'
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
   .slice(0, 50);
  return { ok: true, notifications: rows.map(publicNotification_) };
}

function Member_notificationRead(p, e) {
  const memberId = String(p.memberId || '');
  const notifId = String(p.notifId || '');
  const row = findRow_('Notifications', r => String(r.notifId) === notifId && (String(r.memberId) === memberId || String(r.memberId) === '*'));
  if (!row) return { ok: false, error: 'not_found' };
  patchRow_('Notifications', row.__rowNumber, { readAt: nowIso_() });
  return { ok: true };
}

function publicEvent_(e) {
  return {
    eventId: e.eventId,
    title: e.title,
    kind: e.kind,
    startAt: e.startAt,
    endAt: e.endAt,
    centre: e.centre,
    location: e.location,
    coverUrl: normalizeImageUrl_(e.coverUrl),
    body: e.body,
    capacity: Number(e.capacity || 0),
    isPublic: Boolean(e.isPublic),
  };
}

function publicNotification_(n) {
  return {
    notifId: n.notifId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    linkPage: n.linkPage,
    readAt: n.readAt || '',
    createdAt: n.createdAt,
  };
}

function publicMentor_(m) {
  return {
    mentorId: m.mentorId,
    fullName: m.fullName,
    tracks: String(m.tracks || '').split(',').map(s => s.trim()).filter(Boolean),
    centre: m.centre,
    bio: m.bio,
    photoUrl: normalizeImageUrl_(m.photoUrl),
  };
}
