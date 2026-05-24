/**
 * Events, Posts, public reads.
 */

function Event_list(p, e) {
  const memberId = String(p.memberId || '');
  const member = memberId ? findRow_('Members', r => String(r.memberId) === memberId) : null;

  const now = new Date();
  const rows = filterRows_('Events', r => String(r.status) === 'published')
    .filter(r => {
      if (!member) return Boolean(r.isPublic);
      const c = String(r.centre);
      return c === 'Both' || c === 'Online' || c === String(member.centre);
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  // Attach RSVP status if member
  const rsvps = memberId
    ? filterRows_('EventRSVPs', r => String(r.memberId) === memberId)
    : [];
  const rsvpByEvent = {};
  rsvps.forEach(r => { rsvpByEvent[r.eventId] = r.status; });

  return {
    ok: true,
    events: rows.map(e => {
      const out = publicEvent_(e);
      out.myRsvp = rsvpByEvent[e.eventId] || null;
      out.isPast = new Date(e.endAt || e.startAt) < now;
      return out;
    }),
  };
}

function Event_rsvp(p, e) {
  const memberId = String(p.memberId || '');
  const eventId = String(p.eventId || '');
  const status = String(p.status || 'going');
  if (!['going', 'maybe', 'cancelled'].includes(status)) return { ok: false, error: 'bad_status' };

  const evt = findRow_('Events', r => String(r.eventId) === eventId);
  if (!evt) return { ok: false, error: 'event_not_found' };

  const existing = findRow_('EventRSVPs', r => String(r.eventId) === eventId && String(r.memberId) === memberId);
  if (existing) {
    patchRow_('EventRSVPs', existing.__rowNumber, { status: status, rsvpAt: nowIso_() });
  } else {
    appendRow_('EventRSVPs', {
      eventId: eventId,
      memberId: memberId,
      status: status,
      rsvpAt: nowIso_(),
      attendedAt: '',
    });
  }

  pushNotification_(memberId, {
    kind: 'event',
    title: 'RSVP: ' + evt.title,
    body: status === 'going' ? 'You\'re going. See you there.' : 'RSVP updated.',
    linkPage: 'events',
  });
  audit_('event.rsvp', memberId, eventId, { status }, String(p.ip || ''));
  return { ok: true, status };
}

function Public_events(p, e) {
  const rows = filterRows_('Events', r => String(r.status) === 'published' && r.isPublic)
    .filter(r => new Date(r.endAt || r.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .slice(0, 20);
  return { ok: true, events: rows.map(publicEvent_) };
}

// ============================================================================
// Posts (blog / news / updates / promos)
// ============================================================================

function Post_list(p, e) {
  const kind = String(p.kind || '');
  const tag = String(p.tag || '');
  flipScheduledPosts_();
  const rows = filterRows_('Posts', r => {
    if (String(r.status) !== 'published') return false;
    if (kind && String(r.kind) !== kind) return false;
    if (tag && !String(r.tags || '').toLowerCase().includes(tag.toLowerCase())) return false;
    return true;
  }).sort((a, b) => new Date(b.publishAt || b.createdAt) - new Date(a.publishAt || a.createdAt));

  return { ok: true, posts: rows.map(publicPost_) };
}

function Post_get(p, e) {
  flipScheduledPosts_();
  const slug = String(p.slug || '');
  const row = findRow_('Posts', r => String(r.slug) === slug && String(r.status) === 'published');
  if (!row) return { ok: false, error: 'not_found' };
  return { ok: true, post: publicPost_(row, true) };
}

function Public_posts(p, e) {
  return Post_list(p, e);
}

function flipScheduledPosts_() {
  const now = new Date();
  const rows = filterRows_('Posts', r =>
    String(r.status) === 'draft' && r.publishAt && new Date(r.publishAt) <= now);
  rows.forEach(r => patchRow_('Posts', r.__rowNumber, { status: 'published' }));
  if (rows.length) invalidate_('Posts');
}

function publicPost_(p, includeBody) {
  const out = {
    postId: p.postId,
    slug: p.slug,
    kind: p.kind,
    title: p.title,
    excerpt: p.excerpt,
    coverUrl: normalizeImageUrl_(p.coverUrl),
    category: p.category,
    authorId: p.authorId,
    tags: String(p.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    featured: Boolean(p.featured),
    publishAt: p.publishAt || p.createdAt,
    promo: p.kind === 'promo' ? {
      cta: p.promoCta,
      url: p.promoUrl,
      expires: p.promoExpires,
    } : null,
  };
  if (includeBody) out.body = p.body;
  return out;
}

// ============================================================================
// Public stats — homepage counts
// ============================================================================

function Public_stats(p, e) {
  // Members — split by type + grad status.
  const allMembers = readSheet_('Members').rows;
  const active = allMembers.filter(r => String(r.status) === 'active');
  const summer = active.filter(m => String(m.type) === 'Summer').length;
  const ngg    = active.filter(m => String(m.type) === 'NGG').length;
  const graduates = allMembers.filter(r =>
    String(r.status) === 'graduated-ngg' || String(r.status) === 'graduated-vanguard').length;

  // Mentors — count active mentors. Mentor sheet may not exist on a
  // brand-new install; guard against that.
  let mentors = 0;
  try {
    mentors = filterRows_('Mentors', r => String(r.status) === 'active').length;
  } catch (_) { mentors = 0; }

  // Anchor progress — total verified + completion rate.
  let missionsVerified = 0;
  let totalSubmitted = 0;
  try {
    const prog = readSheet_('MemberProgress').rows;
    for (const r of prog) {
      const st = String(r.status);
      if (st === 'submitted' || st === 'verified' || st === 'rejected') totalSubmitted++;
      if (st === 'verified') missionsVerified++;
    }
  } catch (_) { /* sheet missing */ }
  const completionRate = totalSubmitted > 0
    ? Math.round((missionsVerified / totalSubmitted) * 100)
    : 0;

  // Distinct centres in use among active members.
  const centreSet = {};
  for (const m of active) {
    const c = String(m.centre || '').trim();
    if (c) centreSet[c] = true;
  }
  const centres = Object.keys(centreSet).length || 0;

  return {
    ok: true,
    stats: {
      activeMembers:    active.length,
      summer:           summer,
      ngg:              ngg,
      graduates:        graduates,
      mentors:          mentors,
      missionsVerified: missionsVerified,
      missionsSubmitted:totalSubmitted,
      completionRate:   completionRate,
      centres:          centres,
    },
  };
}

// ============================================================================
// Newsletter — public subscribe (no auth). Idempotent by email.
// ============================================================================

function Public_newsletter(p, e) {
  const ip = String(p.ip || '');
  // Per-IP rate limit: 5 attempts per 5 minutes.
  if (!rateLimit_('rl:newsletter:' + ip, 5, 300)) {
    return { ok: false, error: 'rate_limited' };
  }
  const email = String(p.email || '').trim().toLowerCase();
  // RFC-tolerant minimal email check; the PHP layer does FILTER_VALIDATE_EMAIL too.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'bad_email' };
  }
  if (email.length > 200) return { ok: false, error: 'email_too_long' };

  // Ensure sheet exists. We create it lazily so a fresh install doesn't
  // need an extra Setup step.
  let sh = ss_().getSheetByName('Newsletter');
  if (!sh) {
    sh = ss_().insertSheet('Newsletter');
    sh.getRange(1, 1, 1, 6).setValues([['email', 'source', 'status', 'createdAt', 'updatedAt', 'ip']]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 6).setBackground('#0c1432').setFontColor('#f5b026').setFontWeight('bold');
    invalidate_('Newsletter');
  }

  // Idempotent upsert.
  const existing = findRow_('Newsletter', r => String(r.email || '').toLowerCase() === email);
  if (existing) {
    // Re-subscribing — flip status to active and bump updatedAt.
    patchRow_('Newsletter', existing.__rowNumber, {
      status: 'subscribed',
      updatedAt: nowIso_(),
    });
  } else {
    appendRow_('Newsletter', {
      email: email,
      source: String(p.source || 'site'),
      status: 'subscribed',
      createdAt: nowIso_(),
      updatedAt: nowIso_(),
      ip: ip,
    });
  }
  audit_('newsletter.subscribe', null, email, { source: p.source || 'site' }, ip);
  return { ok: true };
}
