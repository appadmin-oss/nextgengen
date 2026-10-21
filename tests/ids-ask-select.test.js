#!/usr/bin/env node
/* ============================================================================
   ID Card Studio — the assistant's own reading of a plan (src/modules/idcards/
   ids-ask.jsx): who a named request puts on the sheet, and what it says about
   everyone it does not. Pinned to the conversation that showed it going wrong
   (four names read as "3 cards", two Summer School participants reported as
   "Not found", "help position the image" answered with the help text).
   Run:  node tests/ids-ask-select.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = f => esbuild.transformSync(read(f), { loader: 'jsx' }).code;
const T = { React: { useState: () => [] } };
vm.createContext(T);
vm.runInContext(js('src/modules/idcards/ids-core.jsx') + '\n' + js('src/modules/idcards/ids-ask.jsx')
  + '\n;Object.assign(this, { idsPlanSelect, idsPlanGapNote, idsPlanActs, idsAskAnswer, idsClosest, idsPlanWhat });', T);

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

const rec = (key, name, kind, x) => Object.assign({ key, id: key, name, kind, centre: 'Egbeda', reason: 'new', printedBefore: false, photoUrl: 'p.jpg' }, x || {});
const all = [
  rec('m1', 'Agbalaya Habeebat', 'member', { photoUrl: '' }),
  rec('m2', 'Idi Oluwadarasimi', 'member'),
  rec('m3', 'Badmus Onoopemipo', 'member'),
  rec('s3', 'Badmus Onoopemipo', 'summer'),
  rec('s4', 'Taiwo Ayomide', 'summer'),
  rec('s5', 'Ayomide Abubakar', 'summer'),
  rec('m6', 'Bola Ade', 'member', { centre: 'Ijaiye' }),
];
const ctx = { pool: all, all, isBlocked: r => !r.photoUrl };
const names = ['Agbalaya Habeebat', 'Idi Oluwadarasimi', 'Badmus Onoopemipo', 'Taiwo Ayomide'];
const keys = s => s.pick.map(r => r.key).sort().join(',');

console.log('a named list');
let s = T.idsPlanSelect({ names }, ctx);
chk('four names: everyone with a photo goes on, and the one without is said by name', keys(s) === 'm2,m3,s3,s4' && s.blocked.map(r => r.name).join() === 'Agbalaya Habeebat');
chk('…a person on two lists is reported, so two cards for one person is never silent', s.twoLists.length === 1 && s.twoLists[0].name === 'Badmus Onoopemipo' && s.twoLists[0].kinds.sort().join() === 'member,summer');
s = T.idsPlanSelect({ names, kindOf: { Badmus: 'member' } }, ctx);
chk('"Badmus should be NGG" keeps his NGG card only, and touches nobody else', keys(s) === 'm2,m3,s4' && !s.twoLists.length);
chk('…and the count says why it is three of four named', T.idsPlanGapNote(s) === '4 named: 1 no photo yet');

console.log('narrowed by the plan');
s = T.idsPlanSelect({ names, kind: 'member' }, ctx);
const tf = s.filtered.find(f => f.name === 'Taiwo Ayomide');
chk('"NGG members only": a named Summer School participant is kept off — and said to be one, never "not found"', !s.missing.length && tf && /Summer School participant, and this is NGG members only/.test(tf.why));
s = T.idsPlanSelect({ names, notKinds: ['summer'] }, ctx);
chk('"exclude summer" leaves out Summer School records, keeping the NGG ones', keys(s) === 'm2,m3' && s.filtered.some(f => f.name === 'Taiwo Ayomide' && /and those are left out/.test(f.why)));
s = T.idsPlanSelect({ names: ['Bola Ade'], centre: 'Egbeda' }, ctx);
chk('a named person at another centre is kept off with the centre named', s.filtered.length === 1 && /is at Ijaiye, and this is Egbeda only/.test(s.filtered[0].why));
s = T.idsPlanSelect({ names: ['Taiwo Ayomide'], kind: 'member', kindOf: { 'Taiwo Ayomide': 'summer' } }, ctx);
chk('"put them on too" (their own kind, for them alone) puts them on', keys(s) === 's4');

console.log('names nobody has');
s = T.idsPlanSelect({ names: ['Taiwo Abubakar'] }, ctx);
chk('a name nobody has is "not found", with the closest names on the lists', s.missing.join() === 'Taiwo Abubakar' && s.suggest[0].near.map(r => r.name).includes('Ayomide Abubakar'));
chk('the closest name is found whichever way round it was typed', T.idsClosest('Abubakar Ayomide', all, 1)[0].name === 'Ayomide Abubakar');

console.log('acts and chips');
chk('one act or several, in order', T.idsPlanActs({ do: 'improvePhotos', acts: ['improvePhotos', 'askPhotos'] }).join() === 'improvePhotos,askPhotos'
  && T.idsPlanActs({ do: 'fill' }).join() === 'fill' && T.idsPlanActs({}).length === 0);
const what = T.idsPlanWhat({ names: ['Ada'], notKinds: ['summer'], kindOf: { Badmus: 'member' } }).map(w => w.label);
chk('the chips say "no Summer School" and "Badmus as NGG member", each with a ×', what.includes('no summer school') && what.includes('Badmus as NGG member'));

console.log('questions answered here');
const c = { n: 2, sheets: 1, lookup: () => [], blockedList: [], onSheet: [], byCentre: [], stock: { sheets: 1, sides: 2, used: 20 }, bad: [], warn: [] };
chk('"what can you do?" is the help', /I set up the sheet/.test(T.idsAskAnswer('What can you do?', c)));
chk('"can you help position the image?" is a request about a photo, not the help text', T.idsAskAnswer('Can you help position the image?', c) === null);
chk('…and the help mentions photos and choosing the AI', /📎/.test(T.idsAskAnswer('What can you do?', c)) && /use Gemini/.test(T.idsAskAnswer('What can you do?', c)));

console.log(failed ? `\n❌ FAIL: ${passed} passed, ${failed} failed` : `\n✅ PASS: ${passed} passed, 0 failed (ids assistant)`);
process.exit(failed ? 1 : 0);
