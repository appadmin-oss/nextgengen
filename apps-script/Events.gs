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
  const members = filterRows_('Members', r => String(r.status) === 'active');
  const summer = members.filter(m => String(m.type) === 'Summer').length;
  const ngg = members.filter(m => String(m.type) === 'NGG').length;
  const graduates = filterRows_('Members', r =>
    String(r.status) === 'graduated-ngg' || String(r.status) === 'graduated-vanguard').length;

  return {
    ok: true,
    stats: {
      activeMembers: members.length,
      summer: summer,
      ngg: ngg,
      graduates: graduates,
      centres: 2,
    },
  };
}
