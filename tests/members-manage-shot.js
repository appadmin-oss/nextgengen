#!/usr/bin/env node
/* ============================================================================
   Member management — render the real bundle and photograph it.

   The dashboard screens say what is wrong. These four are what you do about
   it: the segments that turn a figure into a list, the merge
   preview and a member's history.

   Every one of them shipped once with ZERO callers — written, lint-clean,
   not required by the bootstrap, not in the dispatch table, unreachable
   from any URL. Rendering them is the cheapest way to find out that a thing
   exists on screen rather than only in the source.

   The fixtures are deliberately awkward: a
   merge blocked on money, a member with no recorded history. A screen that
   only looks right on the happy path is a screen nobody has tested.

   Run:  node tests/members-manage-shot.js
   Out:  tests/screens/members-manage-*.png
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MEMMANAGE_PORT || 8221;
const BASE = 'http://127.0.0.1:' + PORT;
/* At the ROOT, not in tests/: a relative asset path in the shared chrome
   resolves against the page's own directory, and from tests/ that is a
   404 for every screen. */
const FIX = path.join(ROOT, '_memmanage_fixture.html');
const OUT = path.join(ROOT, 'tests', 'screens');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  member management shots: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined)
    || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

  fs.mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:var(--cream-50,#fdf9f0);padding:22px;}</style>
</head><body><div id="root" hidden></div><div id="fx"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script src="/dist/${manifest.more.file}"></script>
<script>
/* In a function, so nothing here shadows a bundle global: the bundle is
   one concatenated script in global scope and a bare var at top level
   replaces whatever it happens to share a name with. */
(function () {
  var Q = new URLSearchParams(location.search);
  var view = Q.get('view') || 'segments';
  var state = Q.get('state') || '';

  var SEGMENTS = state === 'clean'
    ? [['no_email','No email address',0],['no_phone','No phone number',0],['no_centre','Not in any centre',0],
       ['unknown_centre','Centre no longer exists',0],['no_dob','No date of birth',0],
       ['minor_no_guardian','Under 18 with no guardian contact',0],
       ['dormant','Active but nothing recorded for 60 days',0],['no_consent','No publication consent recorded',0]]
    : [['no_email','No email address',214],['no_phone','No phone number',86],['no_centre','Not in any centre',55],
       ['unknown_centre','Centre no longer exists',31],['no_dob','No date of birth',142],
       ['minor_no_guardian','Under 18 with no guardian contact',19],
       ['dormant','Active but nothing recorded for 60 days',184],['no_consent','No publication consent recorded',0]];

  var MERGE_PREVIEW = {
    keep:  { memberId: 'NGG-2025-0412', fullName: 'Ada Obi', centre: 'Egbeda', createdAt: '2025-02-11' },
    merge: { memberId: 'NGG-2026-0088', fullName: 'Ada Obi', centre: 'Egbeda', createdAt: '2026-01-19' },
    moves: { journal: { move: 14, collide: 0 }, member_progress: { move: 9, collide: 3 },
             assignment_submissions: { move: 6, collide: 0 }, event_rsvps: { move: 2, collide: 1 } },
    fieldsFilled: { phone: '08012345678', dob: '2010-04-02' },
    notesAppended: true,
    discarded: { auth_sessions: 2, member_stats: 1 },
    blocked: {}
  };

  window.NGGApi = window.NGGApi || {};
  /* The PUBLIC side has to exist even though none of these screens use
     it. The bundle's shared hooks (useSession, useSiteContent) fire their
     effects on mount, and with NGGApi.public missing they threw before a
     line of the component ran — twelve screens, one cause, none of it
     anything to do with member management. dist/data.js does not provide
     it; the api client does, and a component fixture does not load it. */
  window.NGGApi.public = Object.assign({
    session: function () { return Promise.resolve({ current: null, next: null }); },
    stats: function () { return Promise.resolve({}); },
    centres: function () { return Promise.resolve({ centres: [] }); },
    content: function () { return Promise.resolve({}); },
    siteContent: function () { return Promise.resolve({ content: {} }); },
  }, window.NGGApi.public);
  window.NGGApi.admin = Object.assign({}, window.NGGApi.admin, {
    membersSegments: function () {
      return Promise.resolve({ segments: SEGMENTS.map(function (s) { return { key: s[0], label: s[1], count: s[2] }; }) });
    },
    membersBulk: function (ids, action, value) {
      /* A PARTIAL result on purpose. "423 updated" that silently skipped
         twelve is the shape this screen exists to prevent. */
      return Promise.resolve({
        changed: ids.length - 3, changedIds: ids.slice(3), action: action, value: value,
        skipped: { 'NGG-2025-0001': 'already_set', 'NGG-2025-0099': 'cannot_suspend_self',
                   'NGG-2025-0AY1': 'forbidden' }
      });
    },
    membersMerge: function (keepId, mergeId, confirm) {
      if (state === 'blocked') {
        var e = new Error('merge_blocked');
        e.code = 'merge_blocked';
        e.detail = 'Both records have ledger entries for the same period. Combining them '
                 + 'automatically would be inventing an account — void or transfer the '
                 + 'overlapping entries first.';
        e.data = { preview: Object.assign({}, MERGE_PREVIEW, {
          blocked: { member_ledger: { rows: [11, 12], on: ['kind', 'periodKey'], examples: ['dues/2026-01', 'training/2026-01'] } }
        }) };
        return Promise.reject(e);
      }
      return Promise.resolve({ dryRun: !confirm, preview: MERGE_PREVIEW });
    },
    membersIdDuplicates: function () {
      if (state === 'clean') return Promise.resolve({ shared: [], twoIds: [], claims: true });
      return Promise.resolve({ claims: true,
        shared: [{ displayId: '024-016', claimedBy: 'NGG-2024-0016', samePerson: false, members: [
          { memberId: 'NGG-2024-0016', fullName: 'Anthony Adams', dob: '2011-02-03', centre: 'Egbeda', status: 'active' },
          { memberId: 'NGG-2025-0140', fullName: 'Tobi Adeyemi', dob: '2012-07-21', centre: 'Ayobo', status: 'active' }] }],
        twoIds: [{ dobKnown: true, members: [
          { memberId: 'NGG-2023-0007', fullName: 'Ada Obi', dob: '2010-04-02', displayId: '023-007', centre: 'Egbeda', status: 'active' },
          { memberId: 'NGG-2026-0088', fullName: 'Ada Obi', dob: '2010-04-02', displayId: '026-019', centre: 'Egbeda', status: 'inactive' }] }] });
    },
    memberTimeline: function () {
      if (state === 'empty') return Promise.resolve({ events: [] });
      return Promise.resolve({ events: [
        { at: '2026-09-30T14:02', event: 'admin.members.merged', by: 'Tola Admin', what: 'Merged with NGG-2026-0088' },
        { at: '2026-08-14T09:41', event: 'member.status.changed', by: 'Tola Admin', what: 'Status changed from active to inactive' },
        { at: '2026-07-02T16:20', event: 'member.centre.changed', by: 'Bisi Officer', what: 'Centre changed from Ikotun to Egbeda' },
        { at: '2026-06-11T11:08', event: 'admin.member.consent', by: 'Bisi Officer', what: 'Consent recorded — site_visibility granted (paper)' },
        { at: '2026-03-04T08:00', event: 'admin.member.update', by: 'System', what: 'Edited: email, phone' },
        { at: '2025-02-11T10:15', event: 'admin.member.create', by: 'Tola Admin', what: 'Record created' }
      ] });
    }
  });

  var h = React.createElement;
  var VIEWS = {
    segments: function () { return h(MembersSegments, { onFilter: function () {} }); },
    merge: function () {
      return h(AdminMemberMerge, { keepId: 'NGG-2025-0412', mergeId: 'NGG-2026-0088',
                                   onClose: function () {}, onDone: function () {} });
    },
    timeline: function () { return h(MemberTimeline, { memberId: 'NGG-2025-0412' }); },
    iddupes: function () {
      return h(MembersIdDuplicates, { onOpen: function () {},
        onMerge: function (a, b) { window.__merge = [a, b]; } });
    }
  };

  ReactDOM.createRoot(document.getElementById('fx')).render(h(VIEWS[view] || VIEWS.segments));
})();
</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  let shots = 0; const problems = [];
  try {
    await waitForServer(BASE + '/_memmanage_fixture.html');
    const shoot = async (name, query, viewport, act) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      /* Console errors too, but only the page's own. A missing favicon is
         reported by the browser as a console error and says nothing about
         the component; failed requests are collected separately so a real
         missing asset is still named rather than swallowed. */
      const missing = [];
      page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
      page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/Failed to load resource/.test(m.text())) return;
        errs.push(m.text());
      });
      await page.goto(BASE + '/_memmanage_fixture.html?' + query, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      if (act) { await act(page); await page.waitForTimeout(350); }

      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(name + ': ' + overflow + 'px of horizontal overflow');
      const realMissing = missing.filter(u => !/favicon|apple-touch|manifest\.json/.test(u));
      if (realMissing.length) problems.push(name + ': 404 ' + realMissing[0]);

      await page.screenshot({ path: path.join(OUT, 'members-manage-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 members-manage-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')'
        + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };

    const press = (label) => async (page) => {
      const b = page.locator('button', { hasText: label }).first();
      if (await b.count()) await b.click();
    };

    await shoot('segments',        'view=segments',             { width: 1180, height: 900 });
    await shoot('segments-clear',  'view=segments&state=clean', { width: 1180, height: 900 });
    await shoot('segments-phone',  'view=segments',             { width: 390, height: 844 });
    await shoot('merge',           'view=merge',                { width: 1180, height: 1000 });
    await shoot('merge-blocked',   'view=merge&state=blocked',  { width: 1180, height: 1000 });
    await shoot('merge-phone',     'view=merge',                { width: 390, height: 844 });
    await shoot('timeline',        'view=timeline',             { width: 1180, height: 600 });
    await shoot('timeline-empty',  'view=timeline&state=empty', { width: 1180, height: 400 });
    await shoot('timeline-phone',  'view=timeline',             { width: 390, height: 844 });
    /* Printed IDs that are not one person. The merge offered on a shared ID
       keeps the record the database gave the ID to. */
    await shoot('id-dupes',        'view=iddupes',              { width: 1180, height: 900 }, async (page) => {
      const t = await page.evaluate(() => document.body.innerText);
      if (!/2 records carry member ID\s*024-016/i.test(t)) problems.push('id-dupes: the shared ID is not named');
      if (!/One person, 2 member IDs/i.test(t)) problems.push('id-dupes: one person with two IDs is not shown');
      if (!/different children/i.test(t)) problems.push('id-dupes: two different children are not told apart from one child twice');
      await page.locator('button', { hasText: 'Same person?' }).first().click();
      const m = await page.evaluate(() => window.__merge || []);
      if (m[0] !== 'NGG-2024-0016') problems.push('id-dupes: the merge does not keep the record that holds the ID (' + m.join(' ← ') + ')');
    });
    await shoot('id-dupes-clear',  'view=iddupes&state=clean',  { width: 1180, height: 400 }, async (page) => {
      if (!/belongs to one record/i.test(await page.evaluate(() => document.body.innerText))) problems.push('id-dupes-clear: the empty state says nothing');
    });
    await shoot('id-dupes-phone',  'view=iddupes',              { width: 390, height: 844 });
  } finally {
    await browser.close();
    try { process.kill(srv.pid); } catch (_) {}
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); console.log('❌ FAIL (member management)'); process.exit(1); }
  console.log('✅ PASS: ' + shots + ' member management shots, no page errors, no overflow');
})();
