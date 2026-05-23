/**
 * Sessions — TONI, MEDI, SUMMER, DOMI.
 *
 * Hybrid model:
 *   - Defaults below are seeded for any year that has no rows yet.
 *   - Admin can edit any row on the sheet — those overrides win.
 *   - `isActive` is computed daily by a time-driven trigger (see Triggers.gs)
 *     and on every `session.current` call as a safety net.
 */

const SESSION_DEFAULTS = {
  TONI:   { startMonth: 1, startDay: 6,  endMonth: 3,  endDay: 29, name: 'TONI'   },
  MEDI:   { startMonth: 4, startDay: 6,  endMonth: 6,  endDay: 28, name: 'MEDI'   },
  SUMMER: { startMonth: 7, startDay: 6,  endMonth: 8,  endDay: 30, name: 'SUMMER' },
  DOMI:   { startMonth: 9, startDay: 7,  endMonth: 12, endDay: 13, name: 'DOMI'   },
};

function Session_current(p, e) {
  const year = new Date().getFullYear();
  Session_ensureYear_({ year: year });
  const all = filterRows_('Sessions', r => Number(r.year) === year);
  const today = new Date();

  let current = null;
  let next = null;
  for (const s of all) {
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    if (today >= start && today <= end) current = s;
    if (today < start && (!next || start < new Date(next.startDate))) next = s;
  }

  return {
    ok: true,
    current: current ? publicSession_(current) : null,
    next: next ? publicSession_(next) : null,
    all: all.map(publicSession_),
  };
}

function Session_list(p, e) {
  const year = Number(p.year || new Date().getFullYear());
  Session_ensureYear_({ year: year });
  const all = filterRows_('Sessions', r => Number(r.year) === year);
  return { ok: true, sessions: all.map(publicSession_) };
}

function Session_ensureYear(p, e) {
  return Session_ensureYear_(p);
}

function Session_ensureYear_(p) {
  const year = Number(p.year || new Date().getFullYear());
  const existing = filterRows_('Sessions', r => Number(r.year) === year);
  const haveCodes = {};
  existing.forEach(s => { haveCodes[String(s.code).toUpperCase()] = true; });

  let created = 0;
  for (const code of ['TONI', 'MEDI', 'SUMMER', 'DOMI']) {
    if (haveCodes[code]) continue;
    const d = SESSION_DEFAULTS[code];
    const start = new Date(Date.UTC(year, d.startMonth - 1, d.startDay));
    const end = new Date(Date.UTC(year, d.endMonth - 1, d.endDay));
    appendRow_('Sessions', {
      sessionId: code + '-' + year,
      code: code,
      year: year,
      name: d.name,
      startDate: isoDate_(start),
      endDate: isoDate_(end),
      theme: '',
      isActive: false,
      coverUrl: '',
      notes: 'Auto-seeded with defaults — edit dates and theme as needed.',
      createdAt: nowIso_(),
      updatedAt: nowIso_(),
    });
    created++;
  }

  if (created) invalidate_('Sessions');

  // Recompute isActive on all rows for this year.
  const today = new Date();
  const all = filterRows_('Sessions', r => Number(r.year) === year);
  for (const s of all) {
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    const wantActive = (today >= start && today <= end);
    if (Boolean(s.isActive) !== wantActive) {
      patchRow_('Sessions', s.__rowNumber, { isActive: wantActive, updatedAt: nowIso_() });
    }
  }

  return { ok: true, created: created };
}

function publicSession_(s) {
  return {
    sessionId: s.sessionId,
    code: s.code,
    year: Number(s.year),
    name: s.name || s.code,
    startDate: isoDate_(s.startDate),
    endDate: isoDate_(s.endDate),
    theme: s.theme || '',
    isActive: Boolean(s.isActive),
    coverUrl: normalizeImageUrl_(s.coverUrl),
    // Computed week-of-session for client-side progress headers.
    weekOf: weekOfSession_(s),
    totalWeeks: totalWeeks_(s),
  };
}

function weekOfSession_(s) {
  const start = new Date(s.startDate);
  const today = new Date();
  if (today < start) return 0;
  const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  const w = Math.floor(diffDays / 7) + 1;
  return Math.max(1, w);
}

function totalWeeks_(s) {
  const start = new Date(s.startDate);
  const end = new Date(s.endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil(days / 7));
}

function isoDate_(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toISOString().slice(0, 10);
}

function Public_session(p, e) {
  // Public-safe version: only current + next, no notes.
  const r = Session_current(p, e);
  return { ok: true, current: r.current, next: r.next };
}
