/**
 * Time-driven triggers. Set these up once in the Apps Script editor under
 * Triggers (clock icon in left rail) — or call `Triggers_install()` from
 * the editor to install them programmatically.
 */

function Triggers_install() {
  // Clear any pre-existing triggers we own.
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Daily 02:00 — GC expired auth sessions, flip scheduled posts, recompute
  // session activeness, trim audit log to last 5000 rows.
  ScriptApp.newTrigger('Trigger_dailyMaintenance')
    .timeBased().atHour(2).everyDays(1).create();

  // Hourly — flip scheduled posts, expire promotions.
  ScriptApp.newTrigger('Trigger_hourly')
    .timeBased().everyHours(1).create();
}

function Trigger_hourly() {
  flipScheduledPosts_();
  expirePromotions_();
}

function Trigger_dailyMaintenance() {
  gcAuthSessions_();
  Session_ensureYear_({ year: new Date().getFullYear() });
  flipScheduledPosts_();
  expirePromotions_();
  trimAuditLog_(5000);
}

function gcAuthSessions_() {
  const sheet = sheet_('AuthSessions');
  const last = sheet.getLastRow();
  if (last < 2) return;
  const t = readSheet_('AuthSessions');
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000); // keep 24h of history
  const keep = t.rows.filter(r => new Date(r.expiresAt) > cutoff);

  // Clear all then re-append the keepers.
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  invalidate_('AuthSessions');
  for (const r of keep) {
    appendRow_('AuthSessions', r);
  }
}

function expirePromotions_() {
  const t = readSheet_('Settings');
  const row = t.rows.find(r => r.key === 'homepage_promo');
  if (!row || !row.value) return;
  try {
    const promo = JSON.parse(row.value);
    if (promo.expires && new Date(promo.expires) < new Date()) {
      patchRow_('Settings', row.__rowNumber, { value: '', updatedAt: nowIso_() });
    }
  } catch (_) {}
}

function trimAuditLog_(max) {
  const sheet = sheet_('AuditLog');
  const last = sheet.getLastRow();
  if (last <= max + 1) return;
  const removeCount = last - 1 - max;
  sheet.deleteRows(2, removeCount);
  invalidate_('AuditLog');
}

// ============================================================================
// One-time setup helper — call from the Apps Script editor once to create
// every required sheet with the right headers.
// ============================================================================

function Setup_createAllSheets() {
  const s = ss_();
  const tabs = {
    Members: ['memberId','fullName','email','phone','type','status','role','centre','photoUrl','track','cohort','joinDate','dob','parentName','parentEmail','parentPhone','school','bio','socials','totpSecret','notes','createdAt','updatedAt'],
    Mentors: ['mentorId','fullName','email','phone','status','tracks','centre','bio','photoUrl','maxMentees','availability','checkedAt','joinedAt','createdAt','updatedAt'],
    MentorAssignments: ['memberId','mentorId','track','sessionId','status','startedAt','endedAt'],
    Sessions: ['sessionId','code','year','name','startDate','endDate','theme','isActive','coverUrl','notes','createdAt','updatedAt'],
    AnchorMissions: ['missionId','week','order','theme','title','prompt','proof','xp','type','estimatedMin','bookPage','isActive','createdAt','updatedAt'],
    MemberProgress: ['memberId','missionId','sessionId','status','proofUrl','verifiedBy','verifiedAt','xpAwarded','note','startedAt','submittedAt'],
    MemberStats: ['memberId','xpTotal','level','badgeCount','badges','streak','lastActiveAt','currentWeek','completedThisSession','updatedAt'],
    Events: ['eventId','title','kind','sessionId','startAt','endAt','centre','location','coverUrl','body','capacity','isPublic','status','createdBy','createdAt','updatedAt'],
    EventRSVPs: ['eventId','memberId','status','rsvpAt','attendedAt'],
    Posts: ['postId','slug','kind','title','excerpt','body','coverUrl','category','authorId','tags','status','publishAt','featured','promoCta','promoUrl','promoExpires','createdAt','updatedAt'],
    Notifications: ['notifId','memberId','kind','title','body','linkPage','readAt','createdAt'],
    Journal: ['entryId','memberId','sessionId','week','mood','body','private','createdAt'],
    AuthSessions: ['token','memberId','email','otp','attempts','createdAt','expiresAt','verifiedAt','ip','userAgent'],
    AuditLog: ['at','actorId','event','subject','ip','meta'],
    Settings: ['key','value','updatedAt','updatedBy'],
  };

  for (const name in tabs) {
    let sh = s.getSheetByName(name);
    if (!sh) sh = s.insertSheet(name);
    const headers = tabs[name];
    const existing = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].filter(v => v);
    if (existing.length === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length)
        .setBackground('#0c1432').setFontColor('#f5b026').setFontWeight('bold');
    }
  }

  // Seed current year sessions if empty.
  Session_ensureYear_({ year: new Date().getFullYear() });

  return { ok: true, tabs: Object.keys(tabs) };
}

// ============================================================================
// Demo seed — 6 sample members for testing the auth flow.
// IMPORTANT: only run once on a fresh sheet — it inserts new rows every call.
// Edit emails before running so you receive the magic links.
// ============================================================================

function Setup_seedDemo() {
  const demos = [
    { memberId: 'NGG-2025-0001', fullName: 'Tunde Okonkwo',  email: 'tunde@example.com',  type: 'NGG',    status: 'active', centre: 'Egbeda', track: 'Tech',            role: '' },
    { memberId: 'NGG-2025-0002', fullName: 'Zara Adamu',     email: 'zara@example.com',   type: 'NGG',    status: 'active', centre: 'Ayobo',  track: 'Public Speaking', role: '' },
    { memberId: 'NGG-2025-0003', fullName: 'Adaeze Nkemdi',  email: 'adaeze@example.com', type: 'NGG',    status: 'active', centre: 'Egbeda', track: 'Music',           role: '' },
    { memberId: 'SUM-2025-0004', fullName: 'Kwame Asante',   email: 'kwame@example.com',  type: 'Summer', status: 'active', centre: 'Ayobo',  track: 'Leadership',      role: '' },
    { memberId: 'NGG-2025-0005', fullName: 'Bayo Adeyemi',   email: 'bayo@example.com',   type: 'NGG',    status: 'active', centre: 'Egbeda', track: 'Leadership',      role: '' },
    { memberId: 'NGG-2025-0099', fullName: 'Admin User',     email: 'admin@example.com',  type: 'NGG',    status: 'active', centre: 'Egbeda', track: '',                role: 'super_admin' },
  ];
  for (const d of demos) {
    const exists = findRow_('Members', r => String(r.memberId) === d.memberId);
    if (exists) continue;
    appendRow_('Members', Object.assign({}, d, {
      createdAt: nowIso_(), updatedAt: nowIso_(),
    }));
  }
  return { ok: true, seeded: demos.length };
}
