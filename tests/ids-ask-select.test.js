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
  + '\n;Object.assign(this, { idsPlanSelect, idsPlanGapNote, idsPlanActs, idsAskAnswer, idsClosest, idsPlanWhat, idsAskNameFrag, idsAskPasteList, idsAskIsPhotoReq, idsAskIsRemind, idsAskIsExport, idsPhotoReqAnswer, idsAskIsQuestion });', T);

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
s = T.idsPlanSelect({ names: ['ayomide abubakar'], ids: ['m2'] }, ctx);
const typed = T.idsPlanWhat({ names: ['ayomide abubakar'], ids: ['m2'] }, s).map(w => w.label);
chk('a typed name that matched one person is shown as the record has it, not as typed', typed.includes('Ayomide Abubakar') && !typed.includes('ayomide abubakar'));
chk('a number is shown with whose it is', typed.includes('m2 · Idi Oluwadarasimi'));
s = T.idsPlanSelect({ names: ['Badmus Onoopemipo', 'nobody here'] }, ctx);
const two = T.idsPlanWhat({ names: ['Badmus Onoopemipo', 'nobody here'] }, s).map(w => w.label);
chk('a name nobody has stays as typed', two.includes('nobody here'));

console.log('the composer');
const fr = T.idsAskNameFrag('Reprint ayomide ab');
chk('a name being typed is looked up without an @, request words left out', fr.length && fr[0].q === 'ayomide ab' && fr[0].at === 8);
chk('nothing is looked up while a request word is being typed', T.idsAskNameFrag('New cards for every member').length === 0);
const ex = q => all.filter(r => r.name.toLowerCase() === q.toLowerCase()).map(r => Object.assign({ displayId: '026-' + r.key }, r));
const L = T.idsAskPasteList('Reprint these:\n1. Idi Oluwadarasimi\n2) Taiwo Ayomide\n- Someone New', ex);
chk('a pasted numbered list becomes one request, numbering gone, the instruction leading', L && /^Reprint these /.test(L.text) && L.n === 3 && !/\d\./.test(L.text));
chk('…a line naming exactly one record becomes its ID, an unknown name stays as typed', /026-m2/.test(L.text) && /026-s4/.test(L.text) && /Someone New/.test(L.text) && L.matched === 2);
const R = T.idsAskPasteList('1\tAgbalaya Habeebat\tJSS2\n2\tBola Ade\tSS1', null);
chk('rows copied from a spreadsheet read the name column', R && R.text === 'Cards for Agbalaya Habeebat and Bola Ade');
chk('one line is not a list', T.idsAskPasteList('Bola Ade', null) === null);

console.log('filters the rules now read');
{
  const R2 = [
    rec('a1', 'Ade One', 'member', { displayId: '026-001', seq: 1, day: '2026-01-10' }),
    rec('a2', 'Ade Two', 'member', { displayId: '026-040', seq: 40, day: '2026-03-02' }),
    rec('a3', 'Ade Three', 'member', { displayId: '025-007', seq: 7, day: '2025-05-01' }),
    rec('a4', 'Ade Four', 'member', { displayId: '026-041', seq: 41, day: '2026-09-30', centre: 'Ijaiye' }),
    rec('v1', 'Vol One', 'volunteer', { centre: 'Ikorodu', day: '2026-02-01' }),
    rec('v2', 'Vol Two', 'volunteer', { centre: 'Yaba Hub', day: '2026-02-01' }),
    rec('n1', 'No Photo', 'member', { photoUrl: '', hasPhoto: false, day: '2026-10-01' }),
  ].map(r => Object.assign(r, { hasPhoto: r.hasPhoto === undefined ? true : r.hasPhoto }));
  const c2 = { pool: R2, all: R2, isBlocked: r => !r.photoUrl };
  const k2 = sel => sel.pick.map(r => r.key).sort().join(',');
  chk('"026-001 to 026-040" is that year\'s block, not 025-007', k2(T.idsPlanSelect({ kind: 'member', numFrom: 1, numTo: 40, numPrefix: '026' }, c2)) === 'a1,a2');
  chk('…without a prefix, a block is every year\'s', k2(T.idsPlanSelect({ kind: 'member', numFrom: 1, numTo: 40 }, c2)) === 'a1,a2,a3');
  chk('several centres: people at any of them', k2(T.idsPlanSelect({ centres: ['Ijaiye', 'Ikorodu'] }, c2)) === 'a4,v1');
  const off = T.idsPlanSelect({ names: ['Vol Two'], centres: ['Ijaiye', 'Ikorodu'] }, c2);
  chk('…and somebody named elsewhere is told which centres this is', off.filtered.length === 1 && /Ijaiye and Ikorodu only/.test(off.filtered[0].why));
  chk('"the last 2 who joined": the newest two, not the first two', k2(T.idsPlanSelect({ kind: 'member', limit: 2, latest: true, hasPhoto: true }, c2)) === 'a2,a4');
  chk('"with a photo" leaves out who has none', !T.idsPlanSelect({ kind: 'member', hasPhoto: true }, c2).pick.some(r => r.key === 'n1'));
  chk('"without a photo" is who has none (held back from printing, ready to be asked)', T.idsPlanSelect({ hasPhoto: false }, c2).blocked.map(r => r.key).join() === 'n1');
  const what = T.idsPlanWhat({ centres: ['Ijaiye', 'Ikorodu'], hasPhoto: false, numFrom: 1, numTo: 40, numPrefix: '026', limit: 20, latest: true }, null).map(x => x.label);
  chk('the plan reads back in words: both centres, the photo filter, the block and the newest', what.includes('Ijaiye') && what.includes('Ikorodu') && what.includes('no photo yet')
    && what.includes('numbers 026-001–026-040') && what.includes('the 20 most recent'));
  const one = T.idsPlanWhat({ centres: ['Ijaiye', 'Ikorodu'] }, null).find(x => x.label === 'Ijaiye').drop({ centres: ['Ijaiye', 'Ikorodu'] });
  chk('…and removing one of two centres leaves a plain one-centre plan', one.centre === 'Ikorodu' && !one.centres);
}

console.log('photo requests, after they went');
chk('"how is the photo request going?" and "who has sent a photo?" are about the requests', T.idsAskIsPhotoReq('How is the photo request going?') && T.idsAskIsPhotoReq('who has sent their photo?') && T.idsAskIsPhotoReq('any photos in yet?'));
chk('…"who hasn’t been asked for a photo yet?" is about the waiting list, not the requests', !T.idsAskIsPhotoReq('Who hasn’t been asked for a photo yet?'));
chk('…"ask the ones with no photo for photos" is still a request to ask, not a question about one', !T.idsAskIsPhotoReq('ask the ones with no photo for photos') && !T.idsAskIsRemind('ask the ones with no photo for photos'));
chk('"remind the ones who haven’t sent one" is the reminder', T.idsAskIsRemind('remind the ones who haven’t sent a photo') && T.idsAskIsRemind('chase the parents'));
chk('"download the list of who has no photo" is the export', T.idsAskIsExport('download the list of who has no photo') && T.idsAskIsExport('export the waiting list as csv') && !T.idsAskIsExport('fronts only'));
{
  const ago = d => new Date(Date.now() - d * 864e5).toISOString();
  const a = T.idsPhotoReqAnswer([{ campaignId: 'PC-1', createdAt: ago(3), people: 412, status: 'done', counts: { queued: 0, sent: 380, unreachable: 32, skipped: 0 }, arrived: 120, stillWaiting: 292, remindedAt: '', canRemind: true, remindFrom: ago(1), waiting: [] },
    { campaignId: 'PC-0', createdAt: ago(20), people: 12, status: 'done', counts: { queued: 0, sent: 12, unreachable: 0, skipped: 0 }, arrived: 10, stillWaiting: 2, remindedAt: ago(15), canRemind: false, remindFrom: ago(18), waiting: [] }]);
  chk('the answer counts, never lists: photos in, still waiting, who needs asking in person, and the one reminder', /\*\*120 photos in\*\*/.test(a.text) && /292 still waiting/.test(a.text) && /32 of them have no email/.test(a.text)
    && /one reminder\*\* now to the 260/.test(a.text) && /Earlier: .*12 asked, 10 in/.test(a.text));
  chk('…with the reminder and the download as buttons', a.btns.map(b => b.act).join() === 'remind,csvCampaign');
  const b = T.idsPhotoReqAnswer([{ campaignId: 'PC-2', createdAt: ago(0), people: 60, status: 'sending', counts: { queued: 35, sent: 25, unreachable: 0, skipped: 0 }, arrived: 0, stillWaiting: 60, remindedAt: '', canRemind: false, remindFrom: ago(-2), waiting: [] }]);
  chk('a request still going out says so, and no reminder is offered', /35 messages are still going out/.test(b.text) && !b.btns.some(x => x.act === 'remind'));
  chk('with no request yet, it says how to start one', /No photo request has been sent/.test(T.idsPhotoReqAnswer([]).text));
}

console.log('questions answered here');
const c = { n: 2, sheets: 1, lookup: () => [], blockedList: [], onSheet: [], byCentre: [], stock: { sheets: 1, sides: 2, used: 20 }, bad: [], warn: [] };
chk('"what can you do?" is the help', /I set up the sheet/.test(T.idsAskAnswer('What can you do?', c)));
chk('"can you help position the image?" is a request about a photo, not the help text', T.idsAskAnswer('Can you help position the image?', c) === null);
chk('…and the help mentions photos, and does not advertise choosing an AI (it is routed automatically)', /📎/.test(T.idsAskAnswer('What can you do?', c)) && !/use Gemini|Groq|OpenAI|Claude/.test(T.idsAskAnswer('What can you do?', c)));

console.log(failed ? `\n❌ FAIL: ${passed} passed, ${failed} failed` : `\n✅ PASS: ${passed} passed, 0 failed (ids assistant)`);
process.exit(failed ? 1 : 0);
