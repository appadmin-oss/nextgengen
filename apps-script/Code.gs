/**
 * NGG Platform — Apps Script entry point.
 *
 * Deploy as a Web App (Execute as: ME, Access: Anyone — we authenticate
 * via shared secret with the PHP proxy, so this URL must NOT be made
 * public to humans).
 *
 * The PHP proxy is the only thing that should call this URL. It signs
 * every request with HMAC-SHA256 over the body using SHARED_SECRET.
 *
 * See docs/SETUP.md for deployment steps.
 */

// ============================================================================
// Config — set these in Script Properties (File → Project properties → Script
// properties), never hardcode. Apps Script preserves them across deploys.
// ============================================================================
//
//   SHARED_SECRET        — HMAC secret shared with PHP proxy. 64+ random bytes.
//   SPREADSHEET_ID       — the Sheet ID this script reads/writes
//   MAIL_FROM_NAME       — display name on outbound emails
//   MAIL_FROM_REPLY_TO   — reply-to address
//   APP_ORIGIN           — public site origin (used to build magic links)
//
// ============================================================================

const CONFIG = {
  get sharedSecret() { return PropertiesService.getScriptProperties().getProperty('SHARED_SECRET'); },
  get spreadsheetId() { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); },
  get mailFromName() { return PropertiesService.getScriptProperties().getProperty('MAIL_FROM_NAME') || 'Next Generation Genius'; },
  get mailReplyTo() { return PropertiesService.getScriptProperties().getProperty('MAIL_FROM_REPLY_TO') || ''; },
  get appOrigin() { return PropertiesService.getScriptProperties().getProperty('APP_ORIGIN') || ''; },
  authTtlSec: 15 * 60,
  rateLimitWindowSec: 60,
  rateLimitMax: 5,
};

// ============================================================================
// HTTP entry — single doPost dispatcher.
// ============================================================================

function doPost(e) {
  const startedAt = Date.now();
  let lock = null;
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const sigHeader = (e && e.parameter && e.parameter.sig) || '';
    if (!verifySignature_(raw, sigHeader)) {
      return jsonOut_({ ok: false, error: 'bad_signature' }, 401);
    }
    const payload = JSON.parse(raw);
    const op = String(payload.op || '').trim();
    if (!op) return jsonOut_({ ok: false, error: 'no_op' }, 400);

    const handler = DISPATCH[op];
    if (!handler) return jsonOut_({ ok: false, error: 'unknown_op:' + op }, 400);

    // Writes that mutate shared sheets need a script-level lock to avoid
    // racing concurrent invocations (Apps Script allows ~30 concurrent
    // executions). Reads are lock-free.
    if (OP_NEEDS_LOCK[op]) {
      lock = LockService.getScriptLock();
      const got = lock.tryLock(8000);
      if (!got) return jsonOut_({ ok: false, error: 'busy', detail: 'Try again in a moment.' }, 503);
    }

    const result = handler(payload, e);
    result.tookMs = Date.now() - startedAt;
    return jsonOut_(result, 200);
  } catch (err) {
    console.error('[doPost]', err && err.stack || err);
    return jsonOut_({ ok: false, error: 'internal', detail: String(err && err.message || err) }, 500);
  } finally {
    if (lock) try { lock.releaseLock(); } catch (_) {}
  }
}

// Ops that mutate sheets — guarded by ScriptLock.
const OP_NEEDS_LOCK = {
  'auth.request': true,
  'auth.verify': true,
  'auth.totpSetup': true,
  'member.update': true,
  'member.notificationRead': true,
  'anchor.mission.submit': true,
  'anchor.mission.verify': true,
  'anchor.journal.create': true,
  'event.rsvp': true,
  'session.ensureYear': true,
  'admin.members.upsert': true,
  'admin.mentors.upsert': true,
  'admin.sessions.upsert': true,
  'admin.missions.upsert': true,
  'admin.events.upsert': true,
  'admin.posts.upsert': true,
  'admin.promotions.set': true,
  'admin.broadcast': true,
  'public.newsletter': true,
  'public.apply': true,
};

function doGet(e) {
  // Health check only — never returns data.
  return jsonOut_({ ok: true, ts: new Date().toISOString(), service: 'ngg-apps-script' }, 200);
}

// ============================================================================
// Op dispatch table — extend here as new endpoints are added.
// ============================================================================

const DISPATCH = {
  // Auth
  'auth.request':           Auth_request,
  'auth.verify':            Auth_verify,
  'auth.me':                Auth_me,
  'auth.logout':            Auth_logout,
  'auth.totpSetup':         Auth_totpSetup,
  'auth.totpVerify':        Auth_totpVerify,

  // Members
  'member.dashboard':       Member_dashboard,
  'member.update':          Member_update,
  'member.notifications':   Member_notifications,
  'member.notificationRead':Member_notificationRead,

  // Anchor
  'anchor.weeks':           Anchor_weeks,
  'anchor.mission.submit':  Anchor_missionSubmit,
  'anchor.mission.verify':  Anchor_missionVerify,
  'anchor.journal.create':  Anchor_journalCreate,
  'anchor.journal.list':    Anchor_journalList,

  // Events
  'event.list':             Event_list,
  'event.rsvp':             Event_rsvp,

  // Posts
  'post.list':              Post_list,
  'post.get':               Post_get,

  // Sessions
  'session.current':        Session_current,
  'session.list':           Session_list,
  'session.ensureYear':     Session_ensureYear,

  // Admin (server enforces role on every call)
  'admin.members.list':     Admin_membersList,
  'admin.members.upsert':   Admin_membersUpsert,
  'admin.mentors.list':     Admin_mentorsList,
  'admin.mentors.upsert':   Admin_mentorsUpsert,
  'admin.sessions.upsert':  Admin_sessionsUpsert,
  'admin.missions.list':    Admin_missionsList,
  'admin.missions.upsert':  Admin_missionsUpsert,
  'admin.events.upsert':    Admin_eventsUpsert,
  'admin.posts.upsert':     Admin_postsUpsert,
  'admin.promotions.set':   Admin_promotionsSet,
  'admin.audit.tail':       Admin_auditTail,
  'admin.broadcast':        Admin_broadcast,

  // Public read-only (cached aggressively by PHP)
  'public.stats':           Public_stats,
  'public.events':          Public_events,
  'public.posts':           Public_posts,
  'public.session':         Public_session,
  'public.newsletter':      Public_newsletter,
  'public.apply':           Public_apply,
};

// ============================================================================
// HMAC verification — every request must carry sig=HMAC-SHA256(body, secret)
// in the URL parameter `sig`.
// ============================================================================

function verifySignature_(rawBody, providedSig) {
  if (!providedSig) return false;
  const secret = CONFIG.sharedSecret;
  if (!secret) throw new Error('SHARED_SECRET not configured');
  const mac = Utilities.computeHmacSha256Signature(rawBody, secret);
  const hex = mac.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  // Constant-time compare via length-aware fallback (Apps Script has no crypto.timingSafeEqual)
  return safeEqual_(hex, String(providedSig).toLowerCase());
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function jsonOut_(obj, status) {
  // Apps Script Web Apps always return 200; we encode status in body.
  const out = Object.assign({}, obj);
  if (typeof out.ok === 'undefined') out.ok = status >= 200 && status < 300;
  out._status = status || 200;
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
