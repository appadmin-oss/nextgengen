#!/usr/bin/env node
/* ============================================================================
   ID Card Studio — the model (src/modules/idcards/ids-core.jsx), ID_CARD_STUDIO.md §9.

   The sheet maths decides where a cutter's blade goes on two hundred cards,
   so it is held to the millimetre against hand-worked figures, not against
   itself. Run:  node tests/ids-core.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/modules/idcards/ids-core.jsx'), 'utf8');
const T = {};
vm.createContext(T);
vm.runInContext(src + '\n;Object.assign(this, { IDS_SIZES, IDS_PAPERS, IDS_SCENARIOS });', T);

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const G = (size, paper, x) => T.idsGrid(Object.assign({ size, paper, margin: 10, gap: 4 }, x || {}));

console.log('grid maths (§3.4)');
// A4 210×297, margin 10, gap 4 → usable 190×277. CR80p 53.98×85.6: cols floor(194/57.98)=3, rows floor(281/89.6)=3.
let g = G('cr80p', 'a4');
chk('CR80 portrait on A4: 3 × 3 = 9', g.cols === 3 && g.rows === 3 && g.per === 9);
chk('…the block is centred: offsets from (usable − block) / 2', near(g.ox, 10 + (190 - (3 * 53.98 + 2 * 4)) / 2) && near(g.oy, 10 + (277 - (3 * 85.6 + 2 * 4)) / 2));
chk('…and the margins either side of the block are equal', near(g.ox, 210 - (g.ox + 3 * 53.98 + 2 * 4)) && near(g.oy, 297 - (g.oy + 3 * 85.6 + 2 * 4)));
g = G('cr80l', 'a4');
chk('CR80 landscape on A4: 2 × 4 = 8 (rows floor(281 / 57.98) = 4)', g.cols === 2 && g.rows === 4 && g.per === 8);
g = G('a6p', 'a4');
chk('A6 portrait on A4: 1 × 1 (two would need 214 mm across)', g.cols === 1 && g.rows === 1 && g.per === 1);
chk('A6 portrait on A3: 2 × 2', G('a6p', 'a3').per === 4);
chk('CR80 portrait on Letter: 3 × 2 (a third row needs 264.8 of 259.4)', G('cr80p', 'letter').cols === 3 && G('cr80p', 'letter').rows === 2);
chk('CR80 portrait on A3: 4 × 4 = 16', G('cr80p', 'a3').per === 16);
chk('a custom card that does not fit gives 0 per sheet', G('custom', 'a4', { customW: 200, customH: 280 }).per === 0);
chk('…custom sizes are clamped to what the inputs allow', near(G('custom', 'a4', { customW: 5, customH: 999 }).cw, 20) && near(G('custom', 'a4', { customW: 5, customH: 999 }).ch, 280));
chk('margin and gap are clamped (3–30, 0–20)', G('cr80p', 'a4', { margin: 0, gap: -5 }).m === 3 && G('cr80p', 'a4', { margin: 0, gap: -5 }).g === 0);
chk('slot i: col = i % cols, row = floor(i / cols)', (() => { const p = T.idsSlotPos(G('cr80p', 'a4'), 5); return p.col === 2 && p.row === 1; })());

console.log('sheets, skip and group breaks');
chk('sheets = ceil((skip + cards) / per)', T.idsSheetCount(9, 0, 18) === 2 && T.idsSheetCount(9, 2, 18) === 3 && T.idsSheetCount(9, 0, 0) === 0 && T.idsSheetCount(0, 0, 5) === 0);
const cards = ['E', 'E', 'E', 'E', 'A', 'A', 'O'].map((c, i) => ({ id: i, c }));
let L = T.idsLayout(cards, 9, 0, x => x.c);
chk('a group break pads to the next sheet: Egbeda 4, pads 5, then Ayobo', L.slots.length === 9 + 9 + 1 && L.slots[4].pad && L.slots[8].pad && L.slots[9].c === 'A');
chk('…and every group starts at a sheet boundary', L.slots[11].pad === true && L.slots[18].c === 'O');
L = T.idsLayout(cards, 9, 2, x => x.c);
chk('with 2 used slots, the first sheet holds 7 before the break', L.slots.findIndex(s => s.c === 'A') === 7);
chk('no grouping, no pads', T.idsLayout(cards, 9, 0, null).pads === 0);

console.log('mirroring for backs');
g = G('cr80p', 'a4');
const f0 = T.idsSlotPos(g, 0), bl = T.idsSlotPos(g, 0, 'long'), bs = T.idsSlotPos(g, 0, 'short');
chk('long edge mirrors the columns: slot 1’s back is in the last column, same row', bl.col === 2 && bl.row === 0 && near(bl.x, g.ox + 2 * (g.cw + g.g)));
chk('short edge mirrors the rows', bs.col === 0 && bs.row === 2);
chk('a mirrored back lands exactly behind its front once the sheet is flipped left to right', near(210 - (bl.x + g.cw), f0.x));
chk('cut marks: 2 per card edge across and down (6 x-edges, 6 y-edges, each ticked twice)', T.idsCutMarks(g).length === 24);
chk('…all outside the card block', T.idsCutMarks(g).every(m => m.y + m.h <= g.oy || m.y >= g.oy + 3 * g.ch + 2 * g.g || m.x + m.w <= g.ox || m.x >= g.ox + 3 * g.cw + 2 * g.g));

console.log('uploaded images');
const cr = [53.98, 85.6];
chk('effective dpi is the smaller direction: 638×1011 on CR80p ≈ 300', T.idsEffDpi({ w: 638, h: 1011, rot: 0 }, ...cr) === 300);
chk('…rotated 90°, width and height swap', T.idsEffDpi({ w: 1011, h: 638, rot: 90 }, ...cr) === 300);
chk('dpi chips: ok from 90% of the target, warn from 150, else blurry', T.idsDpiChip(271, 300).tone === 'ok' && T.idsDpiChip(269, 300).label === '≈269 dpi · may look soft' && T.idsDpiChip(149, 300).label === '≈149 dpi · blurry');
chk('a landscape image on a portrait card is "Sideways · rotate it"', T.idsFitChip({ w: 1011, h: 638, rot: 0 }, ...cr).label === 'Sideways · rotate it');
chk('…and fits once rotated', T.idsFitChip({ w: 1011, h: 638, rot: 90 }, ...cr).label === 'Fits the card');
chk('a square image fills with cropped edges, or fits with white bars', /^Edges cropped \d+%$/.test(T.idsFitChip({ w: 800, h: 800, rot: 0, fit: 'cover' }, ...cr).label) && /^White bars \d+%$/.test(T.idsFitChip({ w: 800, h: 800, rot: 0, fit: 'contain' }, ...cr).label));
chk('within 3% is a fit', T.idsFitChip({ w: 640, h: 1000, rot: 0 }, ...cr).label === 'Fits the card');

const ups = ['anna-front.png', 'anna-back.png', 'bayo.jpg', 'bayo_back.jpg', 'chi.webp', 'chi back.webp', 'dan.png', 'dan-b.png', 'eve-back.png'].map((name, i) => ({ uid: 'u' + i, name }));
const P = T.idsPairUploads(ups);
chk('auto-pairing: -back, _back, " back" and -b each find their front', P.paired === 4 && P.uploads[0].back === 'u1' && P.uploads[2].back === 'u3' && P.uploads[4].back === 'u5' && P.uploads[6].back === 'u7');
chk('…a back with no front stays unpaired, and nothing is mutated', !P.uploads[8].backOf && !ups[0].back);
chk('a front never takes two backs', T.idsPairUploads([{ uid: 'a', name: 'x.png' }, { uid: 'b', name: 'x-back.png' }, { uid: 'c', name: 'x_back.png' }]).paired === 1);

console.log('the run');
chk('auto reason: proof wins, then uploads only, all reprints, some, new', T.idsAutoReason('proof', 5, 5) === 'proof' && T.idsAutoReason('batch', 0, 0) === 'external'
  && T.idsAutoReason('batch', 3, 3) === 'reprint' && T.idsAutoReason('batch', 3, 1) === 'mixed' && T.idsAutoReason('batch', 3, 0) === 'new');
chk('batches of 10 over 33 sheets: 1–10, 11–20, 21–30, 31–33', JSON.stringify(T.idsBatches(33, 10)) === '[[1,10],[11,20],[21,30],[31,33]]');
chk('a range is clamped and ordered', JSON.stringify(T.idsRange(33, 40, 3)) === '[3,33]' && JSON.stringify(T.idsRange(33, 5, 3)) === '[3,5]');
const slots = T.idsLayout(Array.from({ length: 20 }, (_, i) => ({ i })), 9, 2, null).slots;
chk('cards in sheets 1–2 with 2 used slots: 7 + 9', T.idsCardsInRange(slots, 9, 2, 1, 2) === 16 && T.idsCardsInRange(slots, 9, 2, 3, 3) === 4);
chk('stock: 286 cards at 9 a sheet double-sided = 32 sheets, 64 sides', (() => { const s = T.idsStock(286, 286, 9, 0, 'long'); return s.sheets === 32 && s.sides === 64 && s.used === 99; })());
chk('every scenario sets source, order and reason, and has its hint', T.IDS_SCENARIOS.length === 5 && T.IDS_SCENARIOS.every(s => s.src && s.order && s.reason && s.hint));
chk('sort by centre keeps names in order within a centre', T.idsSort([{ c: 'B', n: 'z' }, { c: 'A', n: 'y' }, { c: 'B', n: 'a' }], 'centre', x => ({ centre: x.c, name: x.n })).map(x => x.n).join() === 'y,a,z');

console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (ID card studio core)`);
process.exit(failed ? 1 : 0);
