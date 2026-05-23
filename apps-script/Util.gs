/**
 * Shared utilities — sheet I/O, rate limiting, ID generation, indexes.
 */

// ============================================================================
// Sheet access — every read goes through cached row maps to avoid repeated
// full-sheet reads (Apps Script's getValues is ~500-2000ms per call).
// ============================================================================

function ss_() {
  if (!CONFIG.spreadsheetId) throw new Error('SPREADSHEET_ID not configured');
  return SpreadsheetApp.openById(CONFIG.spreadsheetId);
}

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('missing_sheet:' + name);
  return s;
}

/**
 * Read all rows from a sheet as array of objects keyed by header.
 * Cached per-execution (Apps Script kills the cache between invocations).
 */
const READ_CACHE = {};
function readSheet_(name, opts) {
  opts = opts || {};
  const fresh = !!opts.fresh;
  if (!fresh && READ_CACHE[name]) return READ_CACHE[name];

  const s = sheet_(name);
  const last = s.getLastRow();
  if (last < 2) {
    const headers = (s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0] || []).map(String);
    READ_CACHE[name] = { headers: headers, rows: [], indexByCol: indexHeaders_(headers), sheet: s };
    return READ_CACHE[name];
  }
  const range = s.getRange(1, 1, last, s.getLastColumn());
  const values = range.getValues();
  const headers = values[0].map(String);
  const idx = indexHeaders_(headers);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      row[h] = values[r][c];
    }
    row.__rowNumber = r + 1;
    rows.push(row);
  }
  READ_CACHE[name] = { headers: headers, rows: rows, indexByCol: idx, sheet: s };
  return READ_CACHE[name];
}

function indexHeaders_(headers) {
  const m = {};
  for (let i = 0; i < headers.length; i++) m[headers[i]] = i + 1; // 1-based
  return m;
}

function invalidate_(name) { delete READ_CACHE[name]; }

/**
 * Append a row keyed by header. Missing headers are silently ignored.
 * Returns the row number created.
 */
function appendRow_(sheetName, obj) {
  const t = readSheet_(sheetName);
  const row = new Array(t.headers.length).fill('');
  for (const k in obj) {
    if (t.indexByCol[k]) row[t.indexByCol[k] - 1] = obj[k];
  }
  t.sheet.appendRow(row);
  invalidate_(sheetName);
  return t.sheet.getLastRow();
}

/**
 * Patch a single row by row number. Only writes provided keys.
 */
function patchRow_(sheetName, rowNumber, patch) {
  const t = readSheet_(sheetName);
  for (const k in patch) {
    const col = t.indexByCol[k];
    if (!col) continue;
    t.sheet.getRange(rowNumber, col).setValue(patch[k]);
  }
  invalidate_(sheetName);
}

/** Find first row matching predicate. */
function findRow_(sheetName, predicate) {
  const t = readSheet_(sheetName);
  for (let i = 0; i < t.rows.length; i++) {
    if (predicate(t.rows[i])) return t.rows[i];
  }
  return null;
}

function filterRows_(sheetName, predicate) {
  return readSheet_(sheetName).rows.filter(predicate);
}

// ============================================================================
// IDs, timestamps, random strings
// ============================================================================

function nowIso_() { return new Date().toISOString(); }

function randHex_(bytes) {
  const a = new Array(bytes);
  for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return a.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function newId_(prefix) {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return prefix + '-' + year + '-' + seq;
}

function newOtp_() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ============================================================================
// Audit
// ============================================================================

function audit_(event, actorId, subject, meta, ip) {
  try {
    appendRow_('AuditLog', {
      at: nowIso_(),
      actorId: actorId || 'system',
      event: event,
      subject: subject || '',
      ip: ip || '',
      meta: meta ? JSON.stringify(meta) : '',
    });
  } catch (e) {
    // never let audit failures break the user request
    console.warn('audit_failed', e);
  }
}

// ============================================================================
// Rate limiting (per-IP, per-op) using CacheService.
// ============================================================================

function rateLimit_(key, max, windowSec) {
  const cache = CacheService.getScriptCache();
  const v = cache.get(key);
  const n = v ? parseInt(v, 10) + 1 : 1;
  cache.put(key, String(n), windowSec);
  return n <= max;
}

// ============================================================================
// Email
// ============================================================================

function sendMail_(to, subject, html, textFallback) {
  MailApp.sendEmail({
    to: to,
    subject: subject,
    htmlBody: html,
    body: textFallback || html.replace(/<[^>]+>/g, ''),
    name: CONFIG.mailFromName,
    replyTo: CONFIG.mailReplyTo || undefined,
  });
}

// ============================================================================
// Drive image URL normalization
// Converts a `https://drive.google.com/file/d/<id>/view` to a directly-embeddable
// `https://drive.google.com/uc?export=view&id=<id>` URL.
// ============================================================================

function normalizeImageUrl_(url) {
  if (!url) return '';
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  return String(url);
}
