/**
 * Anchor 12 — missions, submissions, verification, journal.
 */

function Anchor_weeks(p, e) {
  const memberId = String(p.memberId || '');
  const sessionRes = Session_current({}, null);
  const session = sessionRes.current || sessionRes.next;
  const sessionId = session ? session.sessionId : '';

  const missions = filterRows_('AnchorMissions', m => m.isActive !== false);
  const progress = memberId
    ? filterRows_('MemberProgress', r => String(r.memberId) === memberId && String(r.sessionId) === sessionId)
    : [];
  const progressBy = {};
  progress.forEach(p => { progressBy[p.missionId] = p; });

  // Group by week
  const byWeek = {};
  for (const m of missions) {
    const w = Number(m.week);
    if (!byWeek[w]) byWeek[w] = { week: w, theme: m.theme, missions: [] };
    byWeek[w].missions.push({
      missionId: m.missionId,
      title: m.title,
      prompt: m.prompt,
      xp: Number(m.xp || 0),
      type: m.type,
      proof: m.proof,
      bookPage: Number(m.bookPage || 0),
      estimatedMin: Number(m.estimatedMin || 0),
      order: Number(m.order || 0),
      status: (progressBy[m.missionId] && progressBy[m.missionId].status) || 'todo',
    });
  }
  Object.values(byWeek).forEach(w => w.missions.sort((a, b) => a.order - b.order));
  const weeks = Object.values(byWeek).sort((a, b) => a.week - b.week);

  return { ok: true, session: session, weeks: weeks };
}

function Anchor_missionSubmit(p, e) {
  const memberId = String(p.memberId || '');
  const missionId = String(p.missionId || '');
  const sessionRes = Session_current({}, null);
  const session = sessionRes.current;
  if (!session) return { ok: false, error: 'no_active_session' };

  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member) return { ok: false, error: 'member_not_found' };

  const mission = findRow_('AnchorMissions', m => String(m.missionId) === missionId);
  if (!mission) return { ok: false, error: 'mission_not_found' };

  let row = findRow_('MemberProgress', r =>
    String(r.memberId) === memberId &&
    String(r.missionId) === missionId &&
    String(r.sessionId) === session.sessionId);

  const proofUrl = String(p.proofUrl || '');
  const note = String(p.note || '');

  if (!row) {
    appendRow_('MemberProgress', {
      memberId: memberId,
      missionId: missionId,
      sessionId: session.sessionId,
      status: mission.proof === 'none' ? 'verified' : 'submitted',
      proofUrl: proofUrl,
      note: note,
      startedAt: nowIso_(),
      submittedAt: nowIso_(),
      xpAwarded: mission.proof === 'none' ? Number(mission.xp || 0) : 0,
      verifiedAt: mission.proof === 'none' ? nowIso_() : '',
      verifiedBy: mission.proof === 'none' ? 'auto' : '',
    });
  } else {
    patchRow_('MemberProgress', row.__rowNumber, {
      status: mission.proof === 'none' ? 'verified' : 'submitted',
      proofUrl: proofUrl,
      note: note,
      submittedAt: nowIso_(),
      xpAwarded: mission.proof === 'none' ? Number(mission.xp || 0) : 0,
      verifiedAt: mission.proof === 'none' ? nowIso_() : '',
      verifiedBy: mission.proof === 'none' ? 'auto' : '',
    });
  }

  // Recompute stats if auto-verified
  if (mission.proof === 'none') {
    recomputeMemberStats_(memberId);
    pushNotification_(memberId, {
      kind: 'mission',
      title: '+' + mission.xp + ' XP — ' + mission.title,
      body: 'Mission complete. Keep the streak.',
      linkPage: 'anchor',
    });
  } else {
    pushNotification_(memberId, {
      kind: 'mission',
      title: 'Submitted for review',
      body: 'Your mentor will verify "' + mission.title + '" soon.',
      linkPage: 'anchor',
    });
  }

  audit_('mission.submit', memberId, missionId, { sessionId: session.sessionId }, String(p.ip || ''));
  return { ok: true, status: mission.proof === 'none' ? 'verified' : 'submitted' };
}

function Anchor_missionVerify(p, e) {
  // Mentor / admin verifies a submission.
  const verifierId = String(p.verifierId || '');
  const memberId = String(p.memberId || '');
  const missionId = String(p.missionId || '');
  const approve = !!p.approve;

  const verifier = findRow_('Members', r => String(r.memberId) === verifierId);
  if (!verifier) return { ok: false, error: 'verifier_not_found' };
  const mentor = findRow_('Mentors', r => String(r.email) === String(verifier.email));
  if (!mentor && !isAdminRole_(verifier.role)) return { ok: false, error: 'forbidden' };

  const sessionRes = Session_current({}, null);
  const session = sessionRes.current;
  if (!session) return { ok: false, error: 'no_active_session' };

  const row = findRow_('MemberProgress', r =>
    String(r.memberId) === memberId &&
    String(r.missionId) === missionId &&
    String(r.sessionId) === session.sessionId);
  if (!row) return { ok: false, error: 'submission_not_found' };

  const mission = findRow_('AnchorMissions', m => String(m.missionId) === missionId);
  const xp = approve ? Number(mission.xp || 0) : 0;
  patchRow_('MemberProgress', row.__rowNumber, {
    status: approve ? 'verified' : 'rejected',
    verifiedBy: verifierId,
    verifiedAt: nowIso_(),
    xpAwarded: xp,
  });

  if (approve) {
    recomputeMemberStats_(memberId);
    pushNotification_(memberId, {
      kind: 'mission',
      title: '+' + xp + ' XP — ' + (mission.title || 'Mission verified'),
      body: 'Verified by your mentor. Great work.',
      linkPage: 'anchor',
    });
  } else {
    pushNotification_(memberId, {
      kind: 'mission',
      title: 'Needs another pass — ' + (mission.title || 'Mission'),
      body: p.note || 'Have another go. Your mentor left feedback.',
      linkPage: 'anchor',
    });
  }
  audit_(approve ? 'mission.verify' : 'mission.reject', verifierId, memberId + '/' + missionId, { sessionId: session.sessionId }, String(p.ip || ''));
  return { ok: true };
}

function Anchor_journalCreate(p, e) {
  const memberId = String(p.memberId || '');
  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member) return { ok: false, error: 'not_found' };

  const sessionRes = Session_current({}, null);
  const session = sessionRes.current;
  const week = session ? weekOfSession_(session) : 1;

  appendRow_('Journal', {
    entryId: 'JNL-' + new Date().getFullYear() + '-' + randHex_(4),
    memberId: memberId,
    sessionId: session ? session.sessionId : '',
    week: Math.min(12, week),
    mood: String(p.mood || ''),
    body: String(p.body || ''),
    private: typeof p.private === 'undefined' ? true : !!p.private,
    createdAt: nowIso_(),
  });
  audit_('journal.create', memberId, memberId, {}, String(p.ip || ''));
  return { ok: true };
}

function Anchor_journalList(p, e) {
  const memberId = String(p.memberId || '');
  const requesterId = String(p.requesterId || memberId);
  const requester = findRow_('Members', r => String(r.memberId) === requesterId);
  if (!requester) return { ok: false, error: 'not_found' };

  // Members can read their own; admins can read any; mentors can read
  // entries marked non-private for their assigned mentees.
  const isOwn = requesterId === memberId;
  const isAdmin = isAdminRole_(requester.role);

  const rows = filterRows_('Journal', r => String(r.memberId) === memberId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const filtered = rows.filter(r => isOwn || isAdmin || !r.private);
  return { ok: true, entries: filtered.map(r => ({
    entryId: r.entryId,
    sessionId: r.sessionId,
    week: Number(r.week),
    mood: r.mood,
    body: r.body,
    createdAt: r.createdAt,
  })) };
}

// ----------------------------------------------------------------------------
// Stats recompute — keeps MemberStats denormalized cache fresh.
// ----------------------------------------------------------------------------

function recomputeMemberStats_(memberId) {
  const sessionRes = Session_current({}, null);
  const sessionId = (sessionRes.current && sessionRes.current.sessionId) || '';
  const all = filterRows_('MemberProgress', r => String(r.memberId) === memberId);
  const thisSession = all.filter(r => String(r.sessionId) === sessionId);

  let xp = 0;
  for (const r of all) xp += Number(r.xpAwarded || 0);

  const level = Math.floor(xp / 250) + 1;
  const completed = thisSession.filter(r => String(r.status) === 'verified');

  // Streak: count distinct ISO-dates with any verified mission, going backward
  // from today, breaking at first missing day.
  const verifiedDates = new Set(all
    .filter(r => String(r.status) === 'verified' && r.verifiedAt)
    .map(r => String(r.verifiedAt).slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  while (streak < 365) {
    const key = cursor.toISOString().slice(0, 10);
    if (verifiedDates.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // allow today to be empty — only break the streak if yesterday was empty
      if (streak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        const key2 = cursor.toISOString().slice(0, 10);
        if (!verifiedDates.has(key2)) break;
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
  }

  // Badges (simple thresholds for now)
  const badges = [];
  if (xp >= 100) badges.push('first-mission');
  if (xp >= 500) badges.push('half-k-club');
  if (xp >= 1000) badges.push('one-k-club');
  if (streak >= 7) badges.push('week-streak');
  if (streak >= 30) badges.push('month-streak');
  if (completed.length >= 12) badges.push('week-finisher');

  const existing = findRow_('MemberStats', r => String(r.memberId) === memberId);
  const lastActiveAt = nowIso_();
  const currentWeek = sessionRes.current ? weekOfSession_(sessionRes.current) : 1;
  const patch = {
    memberId: memberId,
    xpTotal: xp,
    level: level,
    badgeCount: badges.length,
    badges: JSON.stringify(badges),
    streak: streak,
    lastActiveAt: lastActiveAt,
    currentWeek: Math.min(12, currentWeek),
    completedThisSession: completed.length,
    updatedAt: lastActiveAt,
  };
  if (existing) patchRow_('MemberStats', existing.__rowNumber, patch);
  else appendRow_('MemberStats', patch);
}

function pushNotification_(memberId, n) {
  appendRow_('Notifications', {
    notifId: 'N-' + new Date().getFullYear() + '-' + randHex_(4),
    memberId: memberId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    linkPage: n.linkPage || '',
    readAt: '',
    createdAt: nowIso_(),
  });
}
