#!/usr/bin/env node
/* ============================================================================
   The Timetable Maker's model (src/modules/timetable/tt-core.jsx), on its own.
   Holds the rules the handoff marks MUST (TIMETABLE.md §12): the quick-add
   parser table, freeSlot, fixing by splitting, the study planner, folding
   (monotonic, nothing inside a fold), the calendar file, the exception rules
   for now/next, v1 links and v1 storage, and the smart print options.

   Run:  node tests/timetable-core.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'timetable', 'tt-core.jsx'), 'utf8');
const ctx = { console, Date, Math, JSON, Set, Object, Array, String, Number, RegExp, parseInt, encodeURIComponent, decodeURIComponent, escape, unescape,
  btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary') };
vm.createContext(ctx);
// Top-level consts do not land on the context object, so the ones the tests read are handed over explicitly.
vm.runInContext(src + '\n;Object.assign(this, { TT_DEFAULTS, TT_THEMES, TT_MODES, TT_DAYS });', ctx);
const T = ctx;

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const E = (id, title, days, start, end, x) => Object.assign({ id, title, days, start, end, place: '', color: 0 }, x || {});

/* ── Quick add: the table in §7.2, case by case ── */
const q = (text, extra) => T.ttQuick(text, Object.assign({ entries: [], mode: 'school', defDay: 1, today: 1 }, extra || {}));
let r = q('Maths Mon Wed 8-9 room 4');
chk('"Maths Mon Wed 8-9 room 4" → Maths, Mon Wed, 08:00–09:00, Room 4, class', r.e.title === 'Maths' && eq(r.e.days, [1, 3]) && r.e.start === '08:00' && r.e.end === '09:00' && r.e.place === 'Room 4' && r.e.kind === 'class');
r = q('Football Tue Thu 4–5:30pm at the field');
chk('"Football Tue Thu 4–5:30pm at the field" → 16:00–17:30 at The field, an activity', r.e.title === 'Football' && eq(r.e.days, [2, 4]) && r.e.start === '16:00' && r.e.end === '17:30' && r.e.place === 'The field' && r.e.kind === 'activity');
r = q('MTH 201 lecture Tue Thu 10–12 in LT2');
chk('"MTH 201 lecture Tue Thu 10–12 in LT2" → 10:00–12:00 in LT2', r.e.title === 'MTH 201 lecture' && eq(r.e.days, [2, 4]) && r.e.start === '10:00' && r.e.end === '12:00' && r.e.place === 'LT2');
r = q('Maths test Thu 10am this week');
chk('"Maths test Thu 10am this week" → a one-off on Thursday, 10:00 for the mode\'s length', r.e.once === true && eq(r.e.days, [4]) && r.e.start === '10:00' && r.e.end === '10:40' && r.e.kind === 'class');
r = q('Study daily 7-8pm');
chk('"Study daily 7-8pm" → every day, 19:00–20:00, study', eq(r.e.days, [1, 2, 3, 4, 5, 6, 7]) && r.e.start === '19:00' && r.e.end === '20:00' && r.e.kind === 'study');
r = q('Piano sat 10-2pm');
chk('"Piano sat 10-2pm" → Saturday 10:00–14:00 (the start stays morning)', eq(r.e.days, [6]) && r.e.start === '10:00' && r.e.end === '14:00');
r = q('Reading for 45 min', { defDay: 2, entries: [E('a', 'Club', [2], '16:00', '17:00')] });
chk('"Reading for 45 min" → the default day, the next free 45 minutes from 16:00, study, guessed', eq(r.e.days, [2]) && r.e.start === '17:00' && r.e.end === '17:45' && r.e.kind === 'study' && r.guessed);
chk('a bare number is never a time, so "Room 4" stays a place', q('Chess club Room 4').e.place === 'Room 4' && q('Chess club Room 4').guessed);
chk('a line that names nothing is not parseable', q('Mon 8-9') === null && q('   ') === null);
chk('am/pm typed is noticed, for the print options', q('Piano sat 10-2pm').hadAmPm && !q('Maths Mon 8-9').hadAmPm);
r = q('Maths fri 11-12', { entries: [E('m', 'Maths', [1], '08:00', '09:00', { place: 'Room 4', color: 5 })] });
chk('a title already in the timetable lends its place and colour', r.e.place === 'Room 4' && r.e.color === 5);
chk('weekdays and weekends are understood', eq(q('Gym weekdays 6-7am').e.days, [1, 2, 3, 4, 5]) && eq(q('Chores weekends 9-10').e.days, [6, 7]));
chk('today and tomorrow are relative to today', eq(q('Swim today 4-5pm', { today: 7 }).e.days, [7]) && eq(q('Swim tomorrow 4-5pm', { today: 7 }).e.days, [1]));
chk('a break with no length is 30 minutes', ttLenOf(q('Break Mon 10:30').e) === 30);
function ttLenOf(e) { return T.ttLen(e); }

/* ── freeSlot and the fix ── */
const week = [E('a', 'Maths', [1], '08:00', '09:00'), E('b', 'English', [1], '09:00', '10:00'), E('c', 'Piano', [1, 6], '09:30', '10:30')];
chk('freeSlot finds the first gap that fits, on a 5-minute grid', T.ttFreeSlot(week, 1, 60, 8 * 60, 22 * 60) === 10 * 60 + 30);
chk('freeSlot answers null when nothing fits before the end', T.ttFreeSlot(week, 1, 60, 8 * 60, 10 * 60) === null);
chk('freeSlot can ignore one entry', T.ttFreeSlot(week, 1, 60, 9 * 60 + 30, 22 * 60, [], 'c') === 10 * 60);
let fx = T.ttFixFor(week, week[2], 1);
const split = fx.apply(week, 'new');
chk('fixing an overlap on a repeating entry splits it: that day moves, the others stay', fx.start === 10 * 60 && eq(split.find(e => e.id === 'c').days, [6]) && split.find(e => e.id === 'new').start === '10:00' && eq(split.find(e => e.id === 'new').days, [1]));
const one = [E('a', 'Maths', [2], '08:00', '09:00'), E('p', 'Piano', [2], '08:30', '09:00')];
fx = T.ttFixFor(one, one[1], 2);
chk('an entry on one day just moves', fx.apply(one).find(e => e.id === 'p').start === '09:00' && fx.apply(one).length === 2);
chk('an official entry never gets a fix', T.ttFixFor(one, Object.assign({}, one[1], { official: true }), 2) === null);
chk('overlaps keep the shared weekdays', eq(T.ttOverlaps(week).c[0].ds, [1]));

/* ── The study planner ── */
const busy = [E('m', 'Mathematics', [1, 2, 3, 4, 5], '08:00', '14:00', { color: 2 }), E('e', 'English', [1, 3], '14:00', '15:00')];
let plan = T.ttPlanStudy(busy, { subjects: ['Mathematics', 'English'], per: 3, len: 45, win: 'after' });
chk('the planner places one session per slot asked for, after school', plan.length === 3 && plan.every(p => p.start === '16:00' && p.kind === 'study' && p.place === 'Home'));
chk('…spread across the week (days 1, 2 and 4 for three in five)', eq(plan.map(p => p.days[0]), [1, 2, 4]));
chk('…subjects in turn, each in its subject\'s colour', plan[0].title === 'Study: Mathematics' && plan[1].title === 'Study: English' && plan[0].color === 2 && plan[1].color === 0);
plan = T.ttPlanStudy([E('x', 'Club', [6, 7], '09:00', '13:00')], { subjects: ['Maths'], per: 3, len: 60, win: 'weekend' });
chk('a window with no free time places nothing', plan.length === 0);
chk('the subject pool ranks classes by weekly minutes', eq(T.ttSubjectPool(busy).slice(0, 2), ['Mathematics', 'English']) && eq(T.ttSubjectPool([]), ['Mathematics', 'English', 'Basic Science', 'Social Studies']));
chk('study is suggested in revision mode before any study exists', T.ttStudyHint([], 'revision').show && !T.ttStudyHint([E('s', 'Study', [1], '16:00', '17:00')], 'revision').show);

/* ── Folding ── */
const fr = { days: [], from: 8 * 60, to: 18 * 60 };
const fm = T.ttFoldMap([E('a', 'A', [1], '08:00', '10:00'), E('b', 'B', [1], '15:00', '18:00')], fr, true);
const ps = []; for (let q2 = fr.from; q2 <= fr.to; q2 += 5) ps.push(fm.pos(q2));
chk('folded positions only ever go forward', ps.every((p, i) => i === 0 || p >= ps[i - 1]));
chk('the empty run 10:00–15:00 is folded to 36 minutes of drawing', fm.runs.some(r2 => r2.folded && r2.a === 600 && r2.b === 900 && r2.w === 36) && fm.span === 120 + 36 + 180);
chk('no block\'s start or end falls inside a fold', [480, 600, 900, 1080].every(m => !fm.runs.some(r2 => r2.folded && m > r2.a && m < r2.b)));
chk('hour labels sit on both edges of a fold and every hour of a busy run', fm.hours.includes(600) && fm.hours.includes(900) && !fm.hours.includes(720));
chk('an empty timetable folds nothing', T.ttFoldMap([], fr, true).runs.every(r2 => !r2.folded));

/* ── Weeks, skips, one-offs and now/next ── */
const now = new Date('2026-10-05T10:40:00');   // a Monday
const ents = [E('m', 'Maths', [1, 3], '08:00', '09:00'), E('b', 'Break', [1], '10:30', '11:00'), E('f', 'French', [1], '11:00', '12:00')];
chk('weeks key on the local Monday', T.ttWeekKey(0, now) === '2026-10-05' && T.ttWeekKey(1, now) === '2026-10-12' && T.ttWeekKey(0, new Date('2026-10-11T23:30:00')) === '2026-10-05');
let nn = T.ttNowNext(ents, {}, now);
chk('now is what is on; next is the earliest start after now today', nn.now.id === 'b' && nn.next.e.id === 'f' && nn.next.k === 0);
let ex = T.ttWithWeek({}, 0, w => { w.skip['f:1'] = true; return w; }, now);
nn = T.ttNowNext(ents, ex, now);
chk('a skipped occurrence is never next; the next one is found later in the week', nn.next.e.id === 'm' && nn.next.k === 2);
ex = T.ttWithWeek(ex, 0, w => { w.skip['b:1'] = true; return w; }, now);
chk('a skipped occurrence is never now', T.ttNowNext(ents, ex, now).now === null);
const ex2 = T.ttWithWeek({}, 0, w => { w.once.push(E('t', 'Test', [1], '10:30', '11:15', { once: true })); return w; }, now);
chk('a one-off counts as now on its date', T.ttNowNext([], ex2, now).now.id === 't');
const ex3 = T.ttWithWeek({}, 1, w => { w.once.push(E('t', 'Trip', [1], '09:00', '10:00', { once: true })); return w; }, now);
nn = T.ttNowNext([], ex3, new Date('2026-10-07T12:00:00'));
chk('next can be a one-off in the following week', nn.next.e.id === 't' && nn.next.k === 5);
chk('emptying a week removes its key', eq(T.ttWithWeek(ex2, 0, w => { w.once = []; return w; }, now), {}));
chk('a day lists what is on: weekly ones not skipped, plus one-offs', T.ttOnDay(ents, ex2, 1, 0, now).length === 4 && T.ttOnDay(ents, ex, 1, 0, now).length === 1);

/* ── The calendar file ── */
const doc = { s: Object.assign({}, T.TT_DEFAULTS, { title: 'Tobi’s week' }), entries: [E('m', 'Maths, Room 4', [1, 3], '08:00', '09:00', { place: 'Room 4' })],
  ex: { '2026-10-05': { skip: { 'm:3': true }, once: [E('t', 'Test', [4], '14:00', '15:00', { once: true })] } } };
const ics = T.ttIcs(doc, { from: '2026-10-05', until: '2026-12-18', remind: 10, stamp: '20261001T000000Z' });
const lines = ics.split('\r\n');
chk('the calendar file is CRLF, Lagos time, with a WAT timezone', ics.endsWith('END:VCALENDAR\r\n') && lines.includes('X-WR-TIMEZONE:Africa/Lagos') && lines.includes('TZNAME:WAT'));
chk('each weekday of a weekly entry repeats weekly until the last day of term', lines.filter(l => l === 'RRULE:FREQ=WEEKLY;UNTIL=20261218T225959Z').length === 2
  && lines.includes('DTSTART;TZID=Africa/Lagos:20261005T080000') && lines.includes('DTSTART;TZID=Africa/Lagos:20261007T080000'));
chk('a skip is an EXDATE on that weekday\'s event', lines.includes('EXDATE;TZID=Africa/Lagos:20261007T080000') && lines.filter(l => l.startsWith('EXDATE')).length === 1);
const onceAt = lines.indexOf('UID:t@timetable.nextgengenius');
chk('a one-off is one event with no rule', onceAt > 0 && lines[onceAt + 2] === 'DTSTART;TZID=Africa/Lagos:20261008T140000' && !lines.slice(onceAt, lines.indexOf('END:VEVENT', onceAt)).some(l => l.startsWith('RRULE')));
chk('commas and semicolons are escaped; a reminder fires 10 minutes before', lines.includes('SUMMARY:Maths\\, Room 4') && lines.filter(l => l === 'TRIGGER:-PT10M').length === 3);
chk('no reminder when none is asked for', !T.ttIcs(doc, { from: '2026-10-05', until: '2026-12-18', remind: 0 }).includes('VALARM'));

/* ── Links and storage ── */
const enc = T.ttEncode({ s: doc.s, entries: doc.entries }, 'Mrs Okafor');
const dec = T.ttDecode(enc);
chk('a share link round-trips, without ids, saying who shared it', dec.doc.entries[0].title === 'Maths, Room 4' && dec.sharedBy === 'Mrs Okafor' && !/"id"/.test(Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()));
const v1 = Buffer.from(JSON.stringify({ settings: { title: 'Old', template: 'midnight', clock: '12' }, entries: [{ title: 'Piano', days: [6], start: '10:00', end: '11:00', color: 3 }] })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const d1 = T.ttDecode(v1);
chk('a v1 link still opens, its template read as a theme', d1.doc.s.title === 'Old' && d1.doc.s.theme === 'navy' && d1.doc.s.clock === '12' && d1.doc.entries[0].kind === 'activity');
chk('a v1 stored timetable migrates the same way', T.ttFromV1({ settings: { template: 'chalkboard' }, entries: [] }).s.theme === 'chalk');
const cl = T.ttClean({ s: { theme: 'neon', clock: 12, weekStart: '7' }, entries: [E('a', '', [1], '08:00', '09:00'), E('b', 'Ok', [9], '08:00', '09:00'), E('c', 'Late', [1], '10:00', '09:00'), E('d', 'Fine', [3, 1, 3], '08:00', '09:00')] });
chk('clean drops bad entries rather than repairing them, and sorts days', cl.entries.length === 1 && eq(cl.entries[0].days, [1, 3]));
chk('clean keeps only known settings values', cl.s.theme === 'paper' && cl.s.clock === '12' && cl.s.weekStart === 7 && cl.s.look === 'classic');
chk('the file name is a slug of the title', T.ttSlug('Tobi’s Week: Term 1!') === 'tobis-week-term-1' && T.ttSlug('') === 'timetable');

/* ── The parser for pasted rows ── */
const pr = T.ttParseRows('Mon, Wed  8:00-9:00  Mathematics  Room 4\nTue 10-11 Civic\nFri  English\n\nSat 11:00-10:00 Bad', 0);
chk('pasted rows: days, times, name and room are read', pr.rows.length === 2 && eq(pr.rows[0].days, [1, 3]) && pr.rows[0].place === 'Room 4' && pr.rows[1].start === '10:00');
chk('…and the lines that cannot be read are named with why', eq(pr.skipped, ['line 3: needs a start and end time', 'line 5: ends before it starts']));
chk('day ranges are read', eq(T.ttParseDays('Mon-Fri'), [1, 2, 3, 4, 5]) && eq(T.ttParseDays('monday and friday'), [1, 5]) && T.ttParseDays('maths') === null);

/* ── Print options ── */
const pdoc = { s: Object.assign({}, T.TT_DEFAULTS, { showPlace: false, legend: false, fold: false }), entries: [E('a', 'Maths', [1], '08:00', '08:30', { place: 'Room 4' }), E('b', 'Art', [1], '08:30', '09:00'), E('c', 'Club', [1], '15:00', '16:00')], ex: {} };
const po = T.ttPrintOptions(pdoc, 'portrait', true);
const row = k => po.rows.find(x => x.key === k);
chk('rooms are suggested when places exist and they are hidden', row('showPlace').suggested && row('showPlace').desc === '1 place · 2 without one');
chk('the key is suggested when two short slots cannot hold their details', row('legend').suggested && /2 short slots are too small/.test(row('legend').desc));
chk('folding is suggested over a long gap, and says how much room it frees', row('fold').suggested && /^Shrinks 09:00–15:00 so classes get 75% more room$/.test(row('fold').desc));
chk('breaks cannot be left out when there are none', row('hideBreaks').disabled && !row('hideBreaks').suggested);
chk('am/pm typed suggests the 12-hour clock, counted in "use N suggestions"', po.clockSuggested && po.nApply === 5 && ttAll(po));
function ttAll(p) { const ns = T.ttApplySuggested(pdoc.s, p); return ns.clock === '12' && ns.showPlace && ns.legend && ns.large && ns.fold; }
chk('the summary names the paper, layout and clock', po.summary === 'A4 portrait · Timeline · 24-hour');
chk('note ideas come from the data and hide one already chosen', eq(T.ttNoteIdeas({ s: Object.assign({}, T.TT_DEFAULTS, { note: 'Term ends Fri 18 Dec' }), entries: [E('p', 'PE', [5], '11:00', '12:00')] }, '2026-12-18'), ['Bring kit on Fridays']));

console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (timetable core)`);
process.exit(failed ? 1 : 0);
