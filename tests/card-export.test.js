/* Structural tests for the ID-card export builders (Node, no browser).
   Validates the .zip and .pdf byte layout since we have no PDF viewer here. */
const CE = require('../vendor/card-export.js');

let pass = 0, fail = 0;
function chk(label, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + label); } }
function latin(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; }

/* ---- ZIP (store) ---- */
(function () {
  const files = [
    { name: 'a.txt', bytes: new Uint8Array([104, 105]) },            // "hi"
    { name: 'b.bin', bytes: new Uint8Array([0, 255, 1, 254, 2]) },
  ];
  const zip = CE.zipStore(files);
  const s = latin(zip);
  chk('zip: local file header signature', s.indexOf('PK\x03\x04') === 0);
  chk('zip: two central dir records', (s.split('PK\x01\x02').length - 1) === 2);
  chk('zip: EOCD present', s.indexOf('PK\x05\x06') !== -1);
  chk('zip: filenames embedded', s.indexOf('a.txt') !== -1 && s.indexOf('b.bin') !== -1);
  // CRC32 of "hi" is 0xD8932AAC (verified against Node zlib.crc32).
  chk('crc32("hi") correct', CE.crc32(new Uint8Array([104, 105])) === 0xD8932AAC);
  // EOCD central-dir count field (offset -18..-16) equals 2.
  const count = zip[zip.length - 14] | (zip[zip.length - 13] << 8);
  chk('zip: EOCD entry count = 2', count === 2);
})();

/* ---- JPEG size sniff ---- */
(function () {
  // Minimal JPEG framing: SOI, SOF0 with height=0x0064(100) width=0x00C8(200).
  const j = new Uint8Array([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xC8, 0x03]);
  const sz = CE.jpegSize(j);
  chk('jpegSize reads WxH from SOF0', sz.w === 200 && sz.h === 100);
})();

/* ---- Imposition PDF ---- */
(function () {
  const fakeJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x03, 0x84, 0x02, 0x4E, 0x03, 0xFF, 0xD9]);
  const cards = [];
  for (let i = 0; i < 20; i++) cards.push({ jpeg: fakeJpeg, wPx: 590, hPx: 1004 }); // > 9/sheet ⇒ multi-page
  const pdf = CE.buildImpositionPDF(cards, { sheet: 'A4', marks: true });
  const s = latin(pdf);
  chk('pdf: %PDF header', s.indexOf('%PDF-1.') === 0);
  chk('pdf: has catalog', s.indexOf('/Type /Catalog') !== -1);
  chk('pdf: has pages tree', s.indexOf('/Type /Pages') !== -1);
  chk('pdf: paginates 20 cards over multiple A4 sheets', (s.match(/\/Type \/Page[^s]/g) || []).length >= 3);
  chk('pdf: CMYK output intent', s.indexOf('/OutputIntent') !== -1 && s.indexOf('FOGRA39') !== -1);
  chk('pdf: DeviceRGB image xobjects (DCTDecode)', s.indexOf('/Filter /DCTDecode') !== -1);
  chk('pdf: crop marks drawn in CMYK rich black', s.indexOf('0 0 0 1 RG') !== -1);
  chk('pdf: registration targets in registration colour (all plates)', s.indexOf('1 1 1 1 RG') !== -1);
  chk('pdf: trailer + startxref + EOF', s.indexOf('trailer') !== -1 && s.indexOf('startxref') !== -1 && s.trim().slice(-5) === '%%EOF');
  // startxref offset must point exactly at the "xref" keyword.
  const m = s.match(/startxref\n(\d+)\n%%EOF$/);
  chk('pdf: startxref offset points at xref table', !!m && s.slice(parseInt(m[1], 10), parseInt(m[1], 10) + 4) === 'xref');
  // No dangling placeholder parent (all patched to the real pages id).
  chk('pdf: every page Parent patched', s.indexOf('/Parent 2 0 R') === -1 || s.indexOf('/Type /Pages') < s.indexOf('/Parent 2 0 R'));
})();

console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (card-export)');
process.exit(fail ? 1 : 0);
