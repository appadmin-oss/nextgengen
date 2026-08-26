/**
 * Minimal .xlsx reader — zero dependencies, matching this repo's buildless
 * philosophy (see build.js). Reads the ZIP container directly and pulls the
 * cell grid out of the SpreadsheetML, which is all a roster import needs.
 *
 * Deliberately NOT a general xlsx library: no styles, no number formats, no
 * charts. Dates therefore arrive as raw Excel serials and are converted by the
 * caller, which knows which columns are dates.
 */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

/* ── ZIP container ──────────────────────────────────────────────────────────
   Entries are read through the central directory rather than by scanning for
   local headers: a local header may carry zeroed sizes with the real ones in a
   trailing data descriptor, and the central directory always has them. */
function unzip(buf) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory at ' + p);
    const method   = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen  = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen   = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name     = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + cmtLen;

    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('corrupt local header for ' + name);
    const lNameLen  = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    if (method === 0)      files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, zlib.inflateRawSync(raw));
    else throw new Error('unsupported compression method ' + method + ' for ' + name);
  }
  return files;
}

/* ── XML ────────────────────────────────────────────────────────────────────
   Regex rather than a parser: SpreadsheetML written by Excel/Sheets is machine
   generated and flat, and the shapes matched below are the only ones that
   carry cell values. */
const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
function unescapeXml(s) {
  return s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (m, e) => {
    if (ENTITIES[e]) return ENTITIES[e];
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10));
    return m;
  });
}

/** Column reference ("AB") → zero-based index. */
function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Concatenate the <t> runs inside one shared-string or inline-string item. */
function textRuns(xml) {
  let out = '';
  for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return unescapeXml(out);
}

/**
 * Read a workbook into `{ sheetName: string[][] }`.
 *
 * Every cell is a string: numbers keep their serialised form (so an Excel date
 * serial or a phone number stored as a float survives intact for the caller to
 * interpret), and empty cells are ''.
 */
function readWorkbook(filePath) {
  const files = unzip(fs.readFileSync(filePath));
  const get = (name) => {
    const b = files.get(name);
    if (!b) throw new Error('missing ' + name + ' — not an xlsx workbook?');
    return b.toString('utf8');
  };

  const shared = [];
  if (files.has('xl/sharedStrings.xml')) {
    for (const m of get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));
  }

  const rels = new Map();
  for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels.set(m[1], m[2].replace(/^\/?xl\//, ''));
  }

  const out = {};
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const name = (attrs.match(/\bname="([^"]*)"/) || [])[1];
    const rid  = (attrs.match(/\br:id="([^"]*)"/) || [])[1];
    const target = rels.get(rid);
    if (name === undefined || !target) continue;
    out[unescapeXml(name)] = readSheet(get('xl/' + target), shared);
  }
  return out;
}

function readSheet(xml, shared) {
  const rows = [];
  let lastRow = 0;

  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = parseInt((rm[1].match(/\br="(\d+)"/) || [])[1], 10);
    if (!rowNum) continue;
    const cells = [];

    // Both forms in one pass: `<c .../>` (empty, styled) and `<c ...>…</c>`.
    // Matching only the second treats an empty cell as an opening tag and
    // swallows the NEXT cell's value, shifting every later column left.
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/\st="([^"]+)"/) || [])[1] || 'n';

      let value = '';
      if (type === 'inlineStr') {
        value = textRuns(body);
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/);
        if (v) value = type === 's' ? (shared[Number(v[1])] ?? '') : unescapeXml(v[1]);
      }
      if (value === '') continue;
      cells[colIndex(ref)] = value;
    }

    if (cells.length) {
      rows[rowNum - 1] = Array.from(cells, (c) => (c === undefined ? '' : c));
      lastRow = Math.max(lastRow, rowNum);
    }
  }

  return Array.from({ length: lastRow }, (_, i) => rows[i] || []);
}

module.exports = { readWorkbook };
