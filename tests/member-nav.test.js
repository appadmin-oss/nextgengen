#!/usr/bin/env node
/* ============================================================================
   The member portal's one menu (portals v10): PARITY after the navigation
   redesign — every screen the portal has is still reachable from the menu, for
   every age and in both views, and the menu is the design's, in its order.
   Reads the real code (mp9Areas, MP9_PATHS); no browser, runs in a second.
   Run:  node tests/member-nav.test.js
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'src/modules/member9', f), 'utf8');
const more = src('mp9-more.jsx'), app = src('mp9-app.jsx');
const grab = (s, re) => { const m = s.match(re); if (!m) throw new Error('not found: ' + re); return m[0]; };
const ctx = {};
new Function('ctx', grab(more, /function mp9Areas\([\s\S]*?\n}\n/) + grab(more, /const MP9_TABS = [^\n]*\n/)
  + grab(app, /const MP9_PATHS = \{[\s\S]*?\};/) + '\nctx.areas = mp9Areas; ctx.tabs = MP9_TABS; ctx.paths = MP9_PATHS;')(ctx);

let fail = 0;
const chk = (name, ok) => { console.log((ok ? '  ✓ ' : '  ✗ FAIL: ') + name); if (!ok) fail++; };
const DESIGN = ['Home', 'Missions', 'Learn', 'Mentor', 'Progress', 'Community', 'My Genius ID', 'Help'];
for (const older of [false, true]) for (const simple of [false, true]) {
  const a = ctx.areas(older, simple), ids = new Set([].concat(...a.map(x => x[2].map(k => k[0]))));
  const who = (older ? '14+' : 'under 14') + ', ' + (simple ? 'simple' : 'full') + ' view';
  const screens = Object.keys(ctx.paths).filter(k => k !== 'more' && (k !== 'opps' || older) && (k !== 'money' || older || !simple));
  const lost = screens.filter(k => !ids.has(k));
  chk(who + ': every screen is in the menu' + (lost.length ? ' — lost: ' + lost.join(', ') : ''), !lost.length);
  const labels = a.map(x => x[0]);
  const want = older ? DESIGN.slice(0, 6).concat(['Opportunities'], DESIGN.slice(6)) : DESIGN;
  chk(who + ': the design\'s menu, in its order', JSON.stringify(labels) === JSON.stringify(want));
  chk(who + ': no name appears twice', new Set(labels).size === labels.length);
  chk(who + ': at most nine places, never more than four under one', labels.length <= 9 && a.every(x => x[2].length <= 4));
}
chk('Phone bar: the design\'s five (four here, plus "Me" for the rest)', JSON.stringify(ctx.tabs) === JSON.stringify(['Home', 'Missions', 'Learn', 'Mentor']));
chk('One menu: the old simple-view menu is gone', !/function mp9SimpleAreas/.test(more));
console.log(fail ? '❌ FAIL: ' + fail : '✅ member menu: all checks passed');
process.exit(fail ? 1 : 0);
