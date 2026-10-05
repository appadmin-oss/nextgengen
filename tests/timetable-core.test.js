#!/usr/bin/env node
/* ============================================================================
   Timetable Maker v5 — the model, without a browser.

   Loads src/modules/timetable/tt-core.jsx on its own (it has no JSX and no
   DOM) and holds the rules the handoff marks MUST: the quick-add table,
   freeSlot, the overlap fix that splits a repeating class, the study planner,
   the calendar file (EXDATEs, one-offs, alarms), now/next across skips and
   one-offs, v1 link and storage compatibility, and folding (positions are
   monotonic and no block falls inside a fold).

   Run:  node tests/timetable-core.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = { console, Date, Math, JSON, Set, Object, Array, String, Number, RegExp, parseInt, btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'), unescape, escape, encodeURIComponent, decodeURIComponent };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/modules/timetable/tt-core.jsx'), 'utf8') + '\n;this.__=({ttQuick,ttFreeSlot,ttFixFor,ttPlanStudy,ttIcs,ttNowNext,ttDecode,ttEncode,ttClean,ttFromV1,ttOverlaps,ttParseRows,ttWithWeek,ttWeekKey,ttFrame,ttSlug,ttPrintOptions,ttStudyHint,ttLanes,ttMin,ttFoldMap});', ctx);
const T = ctx.__;

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n── Quick add: the specification\'s table (§7.2) ─────────────');
const q = (text, extra) => T.ttQuick(text, Object.assign({ entries: [], mode: 'school', defDay: 1, today: 1 }, extra || {}));
let r = q('Maths Mon Wed 8-9 room 4');
chk('“Maths Mon Wed 8-9 room 4” → Maths, Mon Wed, 08:00–09:00, Room 4, class',
  r.e.title === 'Maths' && same(r.e.days, [1, 3]) && r.e.start === '08:00' && r.e.end === '09:00' && r.e.place === 'Room 4' && r.e.kind === 'class');
r = q('Football Tue Thu 4–5:30pm at the field');
chk('“Football Tue Thu 4–5:30pm at the field” → 16:00–17:30, The field, activity',
  r.e.title === 'Football' && same(r.e.days, [2, 4]) && r.e.start === '16:00' && r.e.end === '17:30' && r.e.place === 'The field' && r.e.kind === 'activity');
r = q('MTH 201 lecture Tue Thu 10–12 in LT2');
chk('“MTH 201 lecture Tue Thu 10–12 in LT2” → 10:00–12:00, LT2', r.e.title === 'MTH 201 lecture' && same(r.e.days, [2, 4]) && r.e.start === '10:00' && r.e.end === '12:00' && r.e.place === 'LT2');
r = q('Maths test Thu 10am this week');
chk('“Maths test Thu 10am this week” → a one-off on Thu, 10:00 for the mode’s length, class',
  r.e.once === true && same(r.e.days, [4]) && r.e.start === '10:00' && r.e.end === '10:40' && r.e.kind === 'class' && r.e.title === 'Maths test');
r = q('Study daily 7-8pm');
chk('“Study daily 7-8pm” → every day, 19:00–20:00, study', same(r.e.days, [1, 2, 3, 4, 5, 6, 7]) && r.e.start === '19:00' && r.e.end === '20:00' && r.e.kind === 'study');
r = q('Piano sat 10-2pm');
chk('“Piano sat 10-2pm” → Sat 10:00–14:00 (the start is am)', same(r.e.days, [6]) && r.e.start === '10:00' && r.e.end === '14:00');
r = q('Reading for 45 min', { defDay: 3 });
chk('“Reading for 45 min” → the default day, the next free slot from 16:00, 45 min, study, guessed',
  same(r.e.days, [3]) && r.e.start === '16:00' && r.e.end === '16:45' && r.e.kind === 'study' && r.guessed === true);
chk('a bare number is never a time: “Room 4” stays a place', q('Chess Mon room 4').e.place === 'Room 4' && q('Chess Mon room 4').guessed === true);
chk('nothing left for a name → not parseable', q('Mon 8-9') === null);
const known = [{ id: 'a', title: 'Piano', days: [6], start: '10:00', end: '11:30', place: 'Music room', color: 5, kind: 'activity' }];
r = q('piano Wed', { entries: known });
chk('a title already in the timetable lends its length, place, colour and type', r.e.end === '17:30' && r.e.place === 'Music room' && r.e.color === 5 && r.e.kind === 'activity');
chk('am/pm typed is noticed (for the 12-hour hint)', q('Gym Tue 6pm').hadAmPm === true && q('Gym Tue 18:00').hadAmPm === false);

console.log('\n── Free slots and fixes (§7.5) ─────────────────────────────');
const E = [
  { id: 'm', title: 'Maths', days: [1, 3], start: '08:00', end: '09:00', place: '', color: 0 },
  { id: 'e', title: 'English', days: [1], start: '09:00', end: '10:00', place: '', color: 1 },
  { id: 'p', title: 'Piano', days: [1, 6], start: '08:30', end: '09:30', place: '', color: 2 },
];
chk('freeSlot finds the first gap on a 5-minute grid', T.ttFreeSlot(E, 1, 30, 8 * 60, 22 * 60) === 10 * 60);
chk('…and says null when nothing fits', T.ttFreeSlot(E, 1, 60, 8 * 60, 10 * 60) === null);
chk('overlaps keep the days they share', same(T.ttOverlaps(E).p.map(x => x.ds), [[1], [1]]));
const fix = T.ttFixFor(E, E[2], 1);
const fixed = fix.apply(E, 'n1');
const pMon = fixed.find(x => x.id === 'n1'), pRest = fixed.find(x => x.id === 'p');
chk('a repeating class is SPLIT: Monday moves to the first free slot, Saturday keeps its time',
  T.ttMin(pMon.start) === 600 && same(pMon.days, [1]) && same(pRest.days, [6]) && pRest.start === '08:30');
const single = [E[0], Object.assign({}, E[1], { id: 'x', days: [3], start: '08:30', end: '09:00' })];
const f2 = T.ttFixFor(single, single[1], 3).apply(single);
chk('a one-day class just moves', f2.length === 2 && f2[1].start === '09:00' && f2[1].id === 'x');
chk('an official session never gets a fix', T.ttFixFor(E, Object.assign({}, E[2], { official: true }), 1) === null);

console.log('\n── Study planner (§7.6) ────────────────────────────────────');
const plan = T.ttPlanStudy(E, { subjects: ['Maths', 'English'], per: 3, len: 45, win: 'after' });
chk('three sessions, spread across the window, named after the subjects, at home',
  plan.length === 3 && plan.every(p => p.kind === 'study' && p.place === 'Home' && /^Study: /.test(p.title)) && new Set(plan.map(p => p.days[0])).size === 3);
chk('each starts at 16:00 or later and ends by 20:00', plan.every(p => T.ttMin(p.start) >= 960 && T.ttMin(p.end) <= 1200));
const busy = [{ id: 'z', title: 'Club', days: [6, 7], start: '09:00', end: '13:00', place: '', color: 0 }];
chk('no free time in the window → nothing planned', T.ttPlanStudy(busy, { subjects: ['Maths'], per: 2, len: 45, win: 'weekend' }).length === 0);

console.log('\n── Weeks, skips and one-offs (§7.4, §7.14) ─────────────────');
// Monday 5 Oct 2026, 08:30 local.
const now = new Date(2026, 9, 5, 8, 30);
const wk = T.ttWeekKey(0, now);
chk('a week is keyed by its local Monday', wk === '2026-10-05');
let ex = T.ttWithWeek({}, 0, w => { w.skip['m:1'] = true; return w; }, now);
let nn = T.ttNowNext(E, ex, now);
chk('a skipped class is not "now": Piano is on at 08:30, Maths is off', nn.now && nn.now.title === 'Piano');
ex = T.ttWithWeek(ex, 0, w => { w.once.push({ id: 'o1', title: 'Maths test', days: [1], start: '11:00', end: '11:40', place: '', color: 0, once: true }); return w; }, now);
const late = new Date(2026, 9, 5, 10, 30);
nn = T.ttNowNext(E, ex, late);
chk('a one-off counts for "next"', nn.next && nn.next.e.title === 'Maths test' && nn.next.k === 0);
const sun = new Date(2026, 9, 11, 20, 0);
nn = T.ttNowNext(E, T.ttWithWeek({}, 1, w => { w.skip['m:1'] = true; return w; }, sun), sun);
chk('"next" crosses into next week and honours that week’s skips', nn.next && nn.next.e.title === 'Piano' && nn.next.k === 1);

console.log('\n── Calendar file (§7.8) ────────────────────────────────────');
const doc = { s: { title: 'Tobi’s week' }, entries: E.slice(0, 1), ex };
const ics = T.ttIcs(doc, { from: '2026-10-05', until: '2026-12-18', remind: 10, stamp: '20261005T000000Z' });
chk('weekly events repeat until the last day of term', /RRULE:FREQ=WEEKLY;UNTIL=20261218T225959Z/.test(ics));
chk('Lagos time, with a VTIMEZONE for WAT', /X-WR-TIMEZONE:Africa\/Lagos/.test(ics) && /TZNAME:WAT/.test(ics) && /DTSTART;TZID=Africa\/Lagos:20261005T080000/.test(ics));
chk('a skipped day is an EXDATE', /EXDATE;TZID=Africa\/Lagos:20261005T080000/.test(ics));
chk('a one-off is a single event with no RRULE', /SUMMARY:Maths test/.test(ics) && ics.split('BEGIN:VEVENT').length === 4 && (ics.match(/RRULE/g) || []).length === 2);
chk('a reminder is a VALARM', /TRIGGER:-PT10M/.test(ics));
chk('lines end CRLF', /\r\n$/.test(ics) && !/[^\r]\n/.test(ics));

console.log('\n── Sharing and storage (§7.8, §7.11) ───────────────────────');
const v1 = Buffer.from(JSON.stringify({ settings: { title: 'Old week', template: 'midnight', clock: '12' }, entries: [{ title: 'Chess', days: [6], start: '10:00', end: '11:00', place: 'Hall', color: 2 }] })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const d1 = T.ttDecode(v1);
chk('a v1 #t= link still opens: title, colours and classes carry over', d1 && d1.doc.s.title === 'Old week' && d1.doc.s.theme === 'navy' && d1.doc.s.clock === '12' && d1.doc.entries[0].title === 'Chess' && d1.doc.entries[0].kind === 'activity');
const round = T.ttDecode(T.ttEncode({ s: Object.assign({}, d1.doc.s, { look: 'notebook' }), entries: d1.doc.entries }, 'Mrs Okafor'));
chk('a v5 link round-trips, with who shared it, and ids are not in the link', round.doc.s.look === 'notebook' && round.sharedBy === 'Mrs Okafor' && !/"id"/.test(Buffer.from(T.ttEncode(d1.doc).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()));
chk('a broken link is null, not an exception', T.ttDecode('%%%') === null);
const dirty = T.ttClean({ s: { theme: 'neon', title: 'x'.repeat(200) }, entries: [{ title: 'A', days: [9], start: '08:00', end: '09:00' }, { title: 'B', days: [1], start: '10:00', end: '09:00' }, { title: 'C', days: [2, 2], start: '8:00', end: '9:00' }], ex: { 'nope': {}, '2026-10-05': { skip: { 'a:1': true, 'x': true } } } });
chk('cleaning drops impossible entries and keys, and caps lengths', dirty.s.theme === 'paper' && dirty.s.title.length === 60 && dirty.entries.length === 1 && dirty.entries[0].title === 'C' && same(dirty.entries[0].days, [2]) && same(Object.keys(dirty.ex), ['2026-10-05']) && same(Object.keys(dirty.ex['2026-10-05'].skip), ['a:1']));
chk('the file name slug: apostrophes removed, max 40, fallback', T.ttSlug('Tobi’s week!') === 'tobis-week' && T.ttSlug('') === 'timetable' && T.ttSlug('a'.repeat(80)).length === 40);

console.log('\n── Paste import (§7.7) ─────────────────────────────────────');
const pr = T.ttParseRows('Mon/Wed\t4pm\t5pm\tPiano\tHall\nTue\t16:00-17:30\tCoding club\tLab 2\nFriday\t9\tnot a time\tBroken\nPE', 0);
chk('rows are read in any column order; bad lines are named with the reason', pr.rows.length === 2 && pr.rows[0].title === 'Piano' && same(pr.rows[0].days, [1, 3]) && pr.rows[1].start === '16:00' && pr.skipped.length === 2 && /line 3: needs a start and end time/.test(pr.skipped[0]) && /line 4: no day/.test(pr.skipped[1]));

console.log('\n── Print options and suggestions (§7.13, §7.6) ─────────────');
const po = T.ttPrintOptions({ s: { layout: 'timeline', showPlace: false, legend: true, large: false, fold: false, hideBreaks: false, clock: '24', weekStart: 1 }, entries: E }, 'landscape', true);
chk('rooms are disabled with "No rooms added yet" when there are none', po.rows.find(x => x.key === 'showPlace').disabled && po.rows.find(x => x.key === 'showPlace').desc === 'No rooms added yet');
chk('am/pm typed suggests 12-hour', po.hintSuggested && /12-hour would match/.test(po.hint));
const many = Array.from({ length: 5 }, (_, i) => ({ id: 'c' + i, title: 'Class ' + i, days: [i + 1], start: '08:00', end: '09:00', place: 'Room', color: 0 }));
chk('study suggestion: >3 entries, no study, free hours after 4pm on 2+ weekdays', T.ttStudyHint(many, 'school').show && T.ttStudyHint(many, 'school').freeDays === 5);

console.log('\n── Folding empty hours (§8.3) ──────────────────────────────');
const day = [{ id: 'a', title: 'A', days: [1], start: '07:00', end: '08:00', place: '', color: 0 }, { id: 'b', title: 'B', days: [1], start: '15:00', end: '16:00', place: '', color: 0 }, { id: 'c', title: 'C', days: [2], start: '19:00', end: '21:00', place: '', color: 0 }];
const fm = T.ttFoldMap(day, T.ttFrame(day, 1), true);
const ps = []; for (let q = 420; q <= 1260; q += 5) ps.push(fm.pos(q));
chk('positions never go backwards', ps.every((v, i) => i === 0 || v >= ps[i - 1]));
chk('a long empty run is folded to 36 minutes of drawing', fm.runs.some(r => r.folded && r.w === 36) && fm.span < 1260 - 420);
chk('no block starts or ends inside a fold', day.every(e => fm.runs.filter(r => r.folded).every(r => !(T.ttMin(e.start) > r.a && T.ttMin(e.start) < r.b) && !(T.ttMin(e.end) > r.a && T.ttMin(e.end) < r.b))));
chk('a folded run is labelled at both its edges', fm.runs.filter(r => r.folded).every(r => fm.hours.includes(r.a) && fm.hours.includes(r.b)));
chk('with folding off, nothing folds', !T.ttFoldMap(day, T.ttFrame(day, 1), false).runs.some(r => r.folded));

console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (timetable core)`);
process.exit(failed ? 1 : 0);
