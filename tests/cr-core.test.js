#!/usr/bin/env node
/* ============================================================================
   Control Room v2 — the rules (src/modules/control/cr-core.jsx), CONTROL_ROOM.md §8.

   Held against hand-worked figures, not against themselves: the span rules
   at 899 / 900 / 1179 / 1180, table sort (string, number, progress), filter
   and select-all, palette ranking and scopes, queue j/k, resolve and all
   clear, form validation, and density changing padding only.
   Run:  node tests/cr-core.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/modules/control/cr-core.jsx'), 'utf8');
const T = {};
vm.createContext(T);
vm.runInContext(src + '\n;Object.assign(this, { CR_BP, CR_DENSITY, CR_DENSITY_IDS, CR_SCOPES, CR_SIDE_W, CR_RAIL_W, CR_ASK_W });', T);

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('breakpoints and the shell (§1)');
chk('599 is the phone tree, 600 the desktop', T.crLayout(599).tree === 'phone' && T.crLayout(600).tree === 'desktop');
chk('600–899 forces the 64px rail, even if the person expanded it', T.crLayout(899, { collapsed: false }).sideW === 64 && T.crLayout(899).railForced);
chk('900 and up: a 248px sidebar the person can collapse', T.crLayout(900).sideW === 248 && T.crLayout(900, { collapsed: true }).sideW === 64);
chk('the main area is the root minus the sidebar', T.crLayout(1280).mainW === 1280 - 248);
chk('Ask pushes the main area when 360 still leaves 760 (1440 − 248 − 360 = 832)', T.crLayout(1440, { ask: true }).ask === 'side' && T.crLayout(1440, { ask: true }).mainW === 832);
chk('…and overlays it below that — 1024 would leave 416 (§4.4 MUST)', T.crLayout(1024, { ask: true }).ask === 'overlay' && T.crLayout(1024, { ask: true }).mainW === 1024 - 248);
chk('…the line is exact: 1368 pushes (760), 1367 overlays (759)', T.crLayout(1368, { ask: true }).ask === 'side' && T.crLayout(1367, { ask: true }).ask === 'overlay');
chk('on a phone Ask is a sheet', T.crLayout(390, { ask: true }).ask === 'sheet');

console.log('block spans (§3) — main-area width');
chk('1180: span 4 stays 4, span 2 stays 2', T.crSpan(4, 1180) === 4 && T.crSpan(2, 1180) === 2);
chk('1179: span 4 → 6, span 2 → 3', T.crSpan(4, 1179) === 6 && T.crSpan(2, 1179) === 3);
chk('899: everything is 6', [2, 3, 4, 6].every(s => T.crSpan(s, 899) === 6));
chk('900: span 4 → 6', T.crSpan(4, 900) === 6);
chk('900: span 2 → 3, span 3 and 6 unchanged', T.crSpan(2, 900) === 3 && T.crSpan(3, 900) === 3 && T.crSpan(6, 900) === 6);
chk('with Ask pushing, the main area never drops under 760, so no block is squeezed below its design', (() => { for (let w = 600; w <= 2400; w += 3) { const L = T.crLayout(w, { ask: true }); if (L.ask === 'side' && L.mainW < 760) return false; } return true; })());
chk('a block’s width at a main width is the grid’s (1180: span 4 = 706.7px)', Math.abs(T.crBlockWidth(4, 1180) - ((1116 - 80) / 6 * 4 + 48)) < 1e-9);
chk('the top bar hides the crumb group under 760 and View site under 860', T.crTopbar(759).showGroup === false && T.crTopbar(760).showGroup && !T.crTopbar(859).showViewSite && T.crTopbar(860).showViewSite);

console.log('table (§3 table)');
const P = (t, s) => ({ k: 'person', t, s }), N = (t, v) => ({ k: 'num', t, v }), G = p => ({ k: 'progress', pct: p, t: p + '%' }), S = (t, tone) => ({ k: 'status', t, tone });
const rows = [
  { key: 'a', cells: [P('Tobi Adeyemi', '026-001'), { k: 'text', t: 'Egbeda' }, G(94), N('₦0', 0), S('Active', 'ok')] },
  { key: 'b', cells: [P('Chiamaka Eze', '026-002'), { k: 'text', t: 'Ayobo' }, G(88), N('₦4,500', 4500), S('Active', 'ok')] },
  { key: 'c', cells: [P('Kelechi Obi', '026-003'), { k: 'text', t: 'Ayobo' }, G(71), N('₦9,000', 9000), S('Warning', 'warn')] },
  { key: 'd', cells: [P('Precious Etim', '026-004'), { k: 'text', t: 'Egbeda' }, G(52), N('₦12,000', 12000), S('Suspended', 'bad')] },
];
const names = v => v.map(x => x.r.cells[0].t.split(' ')[0]).join(',');
chk('string sort ascending', names(T.crTableView(rows, { sort: { ci: 0, dir: 'asc' } })) === 'Chiamaka,Kelechi,Precious,Tobi');
chk('number sort descending reads the value, not the text (₦12,000 > ₦9,000)', names(T.crTableView(rows, { sort: { ci: 3, dir: 'desc' } })) === 'Precious,Kelechi,Chiamaka,Tobi');
chk('progress sorts by its percentage', names(T.crTableView(rows, { sort: { ci: 2, dir: 'asc' } })) === 'Precious,Kelechi,Chiamaka,Tobi');
chk('a text column of numbers sorts as text unless it is a num cell', T.crCellValue({ k: 'text', t: '10' }) === '10' && T.crCellValue(N('10')) === 10);
chk('header cycle for text: off → asc → desc → off', eq(T.crNextSort(null, 0, false), { ci: 0, dir: 'asc' }) && eq(T.crNextSort({ ci: 0, dir: 'asc' }, 0, false), { ci: 0, dir: 'desc' }) && T.crNextSort({ ci: 0, dir: 'desc' }, 0, false) === null);
chk('header cycle for numbers starts descending', eq(T.crNextSort(null, 3, true), { ci: 3, dir: 'desc' }) && eq(T.crNextSort({ ci: 3, dir: 'desc' }, 3, true), { ci: 3, dir: 'asc' }) && T.crNextSort({ ci: 3, dir: 'asc' }, 3, true) === null);
chk('pressing another column starts that one fresh', eq(T.crNextSort({ ci: 0, dir: 'desc' }, 1, false), { ci: 1, dir: 'asc' }));
chk('search matches a cell’s sub-line (the mono ID)', names(T.crTableView(rows, { q: '026-003' })) === 'Kelechi');
chk('a filter is an exact cell value', names(T.crTableView(rows, { filters: { 1: 'Ayobo' } })) === 'Chiamaka,Kelechi');
chk('filters and search combine', names(T.crTableView(rows, { q: 'precious', filters: { 1: 'Ayobo' } })) === '');
chk('a cleared filter value means no filter', T.crTableView(rows, { filters: { 1: '' } }).length === 4);
chk('rows keep their original index through a sort, so selection holds', T.crTableView(rows, { sort: { ci: 0, dir: 'asc' } })[0].ri === 1);
chk('filter options are the distinct values with counts', eq(T.crFilterOptions(rows, 1), [{ l: 'Ayobo', n: 2 }, { l: 'Egbeda', n: 2 }]));
let sel = T.crToggleAll({}, ['a', 'b']);
chk('select-all selects what is visible', sel.a && sel.b && !sel.c && T.crSelState(sel, ['a', 'b']).all);
chk('…keeps selections outside the view', T.crToggleAll({ d: true }, ['a', 'b']).d === true);
chk('…and pressed again clears only the visible ones', eq(T.crToggleAll(Object.assign({ d: true }, sel), ['a', 'b']), { d: true }));
chk('a partial selection is indeterminate', T.crSelState({ a: true }, ['a', 'b']).some && !T.crSelState({ a: true }, ['a', 'b']).all);

console.log('palette (§4.1)');
const pages = [{ l: 'Members' }, { l: 'Money' }, { l: 'Members › Families', sub: true }, { l: 'Settings › Audit log', sub: true, keywords: 'history changes' }];
const acts = [{ l: 'Add member' }, { l: 'Record a payment' }];
let r = T.crPaletteResults('', 'all', pages, acts, []);
chk('with nothing typed: top-level pages and actions, no sub-tabs, no members', r.length === 2 && r[0].h === 'Go to' && r[0].items.length === 2 && r[1].h === 'Actions');
r = T.crPaletteResults('mem', 'all', pages, acts, [{ l: 'Tobi Adeyemi' }]);
chk('typed: starts-with ranks above word-starts, sub-tabs appear, members appear', r[0].items[0].l === 'Members' && r[0].items.some(x => x.l === 'Members › Families') && r.some(g => g.h === 'Members'));
chk('a word inside the label counts (“fam” → Members › Families)', T.crPaletteResults('fam', 'pages', pages, acts, [])[0].items[0].l === 'Members › Families');
chk('keywords count too (“history” → Audit log)', T.crPaletteResults('history', 'pages', pages, acts, [])[0].items[0].l === 'Settings › Audit log');
chk('scope Actions shows actions only', eq(T.crPaletteResults('', 'actions', pages, acts, []).map(g => g.h), ['Actions']));
chk('scope Members shows members even with nothing typed', T.crPaletteResults('', 'people', pages, acts, [{ l: 'Tobi' }])[0].h === 'Members');
chk('no match is no groups (the “Nothing called …” state)', T.crPaletteResults('zzz', 'all', pages, acts, []).length === 0);
chk('Tab cycles All → Pages → Actions → Members → All; Shift+Tab goes back', T.crNextScope('all') === 'pages' && T.crNextScope('people') === 'all' && T.crNextScope('all', true) === 'people');
chk('match score: start 3, word 2, contains 1, none 0', T.crMatchScore('Record a payment', 'rec') === 3 && T.crMatchScore('Record a payment', 'pay') === 2 && T.crMatchScore('Record a payment', 'ayme') === 1 && T.crMatchScore('Record a payment', 'x') === 0);

console.log('queue (§3 queue)');
const ids = ['m1', 'a1', 'a2', 'p1'];
chk('j moves down, k up, both stop at the ends', T.crQueueMove(ids, 'a1', 1) === 'a2' && T.crQueueMove(ids, 'a1', -1) === 'm1' && T.crQueueMove(ids, 'p1', 1) === 'p1' && T.crQueueMove(ids, 'm1', -1) === 'm1');
chk('resolving selects the next item', T.crQueueAfterResolve(ids, 'a1') === 'a2');
chk('…the previous one when it was the last', T.crQueueAfterResolve(ids, 'p1') === 'a2');
chk('…and nothing when it was the only one (all clear)', T.crQueueAfterResolve(['x'], 'x') === null);
chk('progress text is “N left · M done this session”', T.crQueueProgress(5, 2).text === '3 left · 2 done this session' && T.crQueueProgress(5, 2).pct === 40);
chk('queue filter reads who, title and kind', T.crQueueFilter([{ who: 'Mrs Adeyemi', title: 'Pick-up', kind: 'Message' }, { who: 'Bello', title: 'Link', kind: 'Family link' }], 'family').length === 1);
chk('resolve verbs: Reject → Declined, Waitlist → Done, Approve → Approved', T.crResolveVerb('Reject') === 'Declined' && T.crResolveVerb('Waitlist') === 'Done' && T.crResolveVerb('Approve link') === 'Approved');
chk('danger labels are recognised', T.crIsDanger('Decline') && T.crIsDanger('Delete & block') && !T.crIsDanger('Approve'));

console.log('form validation (§4.3)');
const F = [{ id: 'member', l: 'Member', req: true }, { id: 'amount', l: 'Amount (₦)', req: true, num: true, money: true }, { id: 'email', l: 'Work email', email: true }, { id: 'ref', l: 'Reference' }];
let fe = T.crValidate(F, {});
chk('a required field says “Enter <label>.” without the bracket', fe.member === 'Enter member.' && fe.amount === 'Enter amount.' && !fe.ref);
fe = T.crValidate(F, { member: 'Tobi', amount: '0', email: 'tobi@x' });
chk('an amount must be above ₦0, an email must be complete', fe.amount === 'Enter an amount above ₦0.' && fe.email === 'That email looks incomplete.' && !fe.member);
chk('a valid form has no errors', Object.keys(T.crValidate(F, { member: 'Tobi', amount: '4,500', email: 'tobi@afrovanguard.org.ng' })).length === 0);
chk('a custom check runs last', T.crValidate([{ id: 'x', l: 'X', check: v => v === 'no' ? 'Not that.' : '' }], { x: 'no' }).x === 'Not that.');

console.log('density (§3) changes padding only');
chk('compact 6 / balanced 10 / comfortable 14', T.crDensity('compact').pad === 6 && T.crDensity('balanced').pad === 10 && T.crDensity('comfortable').pad === 14);
chk('table font 13 / 13.5 / 13.5', T.crDensity('compact').font === 13 && T.crDensity('balanced').font === 13.5 && T.crDensity('comfortable').font === 13.5);
chk('an unknown density is balanced', T.crDensity('huge').pad === 10);
chk('density has nothing to say about content: only pad and font', T.CR_DENSITY_IDS.every(k => eq(Object.keys(T.CR_DENSITY[k]).sort(), ['font', 'pad'])));

console.log('formatters and charts');
chk('initials drop honorifics', T.crInitials('Mrs Funke Adeyemi') === 'FA' && T.crInitials('Tobi') === 'T');
const now = Date.parse('2026-10-06T12:00:00Z');
chk('ago: 40m, 3h, 4d, 3w', T.crAgo('2026-10-06T11:20:00Z', now) === '40m' && T.crAgo('2026-10-06T09:00:00Z', now) === '3h' && T.crAgo('2026-10-02T12:00:00Z', now) === '4d' && T.crAgo('2026-09-15T12:00:00Z', now) === '3w');
let sc = T.crColumnsScale([72, 87], true);
chk('a percentage chart tops out at a round number, capped at 100', sc.top === 90 && sc.yTop === '90%' && sc.yMid === '45%' && sc.yZero === '0%');
sc = T.crColumnsScale([610, 968], false);
chk('a count chart rounds its top up to a half step (968 → 1,000)', sc.top === 1000 && sc.yTop === '1,000' && sc.yMid === '500');
chk('a zero bar is still drawn 2% tall so the week is visible', sc.h(0) === 2);
chk('SMS parts count the “NGG: ” prefix (155 + 5 = 1 part; 156 + 5 = 2)', T.crSmsParts('x'.repeat(155)) === 1 && T.crSmsParts('x'.repeat(156)) === 2);

console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (control room core)`);
process.exit(failed ? 1 : 0);
