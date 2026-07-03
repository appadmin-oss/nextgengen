/**
 * NGG — Google Sheets export sink (read-only admin mirror).
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

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const sig = (e && e.parameter && e.parameter.sig) || '';
    if (!verifySignature_(raw, sig)) return json_({ ok: false, error: 'bad_signature' });

    const payload = JSON.parse(raw);
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
