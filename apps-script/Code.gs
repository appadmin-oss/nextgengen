/**
 * NGG — email sender (MailApp) and Google Sheets export sink (read-only admin mirror).
 *
 * EMAIL ONLY: a new standalone Apps Script project is enough — paste this file,
 * set SHARED_SECRET in Project Settings → Script properties, Deploy → New
 * deployment → Web app (Execute as: Me · Who has access: Anyone), authorise,
 * and paste the /exec URL and the secret into Control Room → Settings → API
 * keys → Google Apps Script. SPREADSHEET_ID is only needed for the mirror.
 *
 * The NGG platform now runs entirely on PHP + a database on the shared host
 * (that is the source of truth). This Apps Script is OPTIONAL: it exists only
 * so admins keep a familiar spreadsheet view. `api/tools/export-sheets.php`
 * pushes a snapshot of key tables here on a cron; nothing reads from it.
 *
 * Deploy as a Web App (Execute as: Me, Access: Anyone). It authenticates the
 * PHP exporter with the same HMAC-SHA256 shared secret scheme as before — set
 * SHARED_SECRET in Script Properties (must match api/config.php `shared_secret`).
 *
 * Protocol (POST, ?sig=HMAC-SHA256(body, SHARED_SECRET)):
 *   { "op": "mirror.push", "tables": { "Members": { "headers": [...], "rows": [[...],...] }, ... } }
 * Each named tab is fully replaced (cleared, then headers + rows written).
 */

/* The Africa GATES protocol — {action, token, data}. The token is the SECRET in
   Script properties (Project Settings → Script properties → SECRET), and the
   NGG Control Room holds the same value (Settings → API keys → Google Apps
   Script). An Africa GATES deployment answers these too, so either works. */
function gatesAction_(body) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!secret) return gatesRespond_(false, 'This Apps Script has no SECRET set, so mail is refused. Set SECRET in Script properties and the same value in the Control Room.');
  if (body.token !== secret) return gatesRespond_(false, 'Bad token');
  const d = body.data || {};
  if (body.action === 'mail.quota') return gatesRespond_(true, 'Quota', { ok: true, remaining: MailApp.getRemainingDailyQuota(), account: Session.getEffectiveUser().getEmail() });
  if (body.action === 'mail.send') {
    const to = String(d.to || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return gatesRespond_(false, 'No valid recipient.', { ok: false });
    if (MailApp.getRemainingDailyQuota() < 1) return gatesRespond_(false, 'Apps Script daily email quota exceeded for this Google account.', { ok: false, remaining: 0 });
    const opts = { to: to, subject: String(d.subject || '').slice(0, 250), htmlBody: String(d.html || ''),
                   body: String(d.text || '') || 'This message is best read in an email app that shows HTML.', name: String(d.name || 'Next Generation Genius').slice(0, 80) };
    if (d.reply_to) opts.replyTo = String(d.reply_to);
    MailApp.sendEmail(opts);
    return gatesRespond_(true, 'Sent', { ok: true, remaining: MailApp.getRemainingDailyQuota() });
  }
  return gatesRespond_(false, 'Unknown action: ' + body.action);
}
function gatesRespond_(success, message, extra) {
  const o = Object.assign({ success: success, message: message, timestamp: new Date().toISOString() }, extra || {});
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    try { const b = JSON.parse(raw); if (b && b.action) return gatesAction_(b); } catch (_) {}
    const sig = (e && e.parameter && e.parameter.sig) || '';
    if (!verifySignature_(raw, sig)) return json_({ ok: false, error: 'bad_signature' });

    const payload = JSON.parse(raw);

    // Transactional email — Google relays it from the authenticated account,
    // so it delivers where shared-host SMTP/mail() fail (this is how the STS
    // CEO site sends). Needs the Mail scope (accepted on first run/deploy).
    if (String(payload.op) === 'sendMail') return handleSendMail_(payload);
    // Settings → API keys → Test: proves the URL and the secret, and says how
    // much of today's Gmail allowance is left (100 a day on a consumer account,
    // 1,500 on Workspace).
    if (String(payload.op) === 'ping') return json_({ ok: true, quota: MailApp.getRemainingDailyQuota(), account: Session.getEffectiveUser().getEmail() });

    if (String(payload.op) !== 'mirror.push') return json_({ ok: false, error: 'unknown_op' });

    const tables = payload.tables || {};
    const ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID'));
    const lock = LockService.getScriptLock();
    lock.tryLock(20000);
    const written = {};
    try {
      for (const name in tables) {
        const t = tables[name] || {};
        const headers = t.headers || [];
        const rows = t.rows || [];
        let sh = ss.getSheetByName(name);
        if (!sh) sh = ss.insertSheet(name);
        sh.clear();
        if (headers.length) {
          sh.getRange(1, 1, 1, headers.length).setValues([headers])
            .setBackground('#0c1432').setFontColor('#f5b026').setFontWeight('bold');
          sh.setFrozenRows(1);
        }
        if (rows.length && headers.length) {
          sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
        }
        written[name] = rows.length;
      }
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }
    return json_({ ok: true, written: written, at: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: 'internal', detail: String(err && err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'ngg-sheets-mirror' });
}

/**
 * Send one HTML email via Google's MailApp. The signature is already verified
 * by doPost. `from` is fixed to the account running the script (Google won't
 * spoof arbitrary senders); we set the display name + reply-to instead.
 */
function handleSendMail_(p) {
  const to = String((p && p.to) || '').trim();
  if (!to) return json_({ ok: false, error: 'no_recipient' });
  const opts = {
    to: to,
    subject: String((p && p.subject) || ''),
    htmlBody: String((p && p.html) || ''),
    name: String((p && p.fromName) || 'Next Generation Genius'),
  };
  if (p && p.text) opts.body = String(p.text);
  if (p && p.replyTo) opts.replyTo = String(p.replyTo);
  if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'quota_exhausted' });
  MailApp.sendEmail(opts);
  return json_({ ok: true, sent: 1, at: new Date().toISOString() });
}

function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('missing_property:' + k);
  return v;
}

function verifySignature_(rawBody, providedSig) {
  if (!providedSig) return false;
  const secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!secret) throw new Error('SHARED_SECRET not configured');
  const mac = Utilities.computeHmacSha256Signature(rawBody, secret);
  const hex = mac.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  const a = hex, b = String(providedSig).toLowerCase();
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
