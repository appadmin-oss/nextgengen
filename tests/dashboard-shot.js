#!/usr/bin/env node
/* ============================================================================
   Member dashboard — render the real production bundle and photograph it.

   Same approach as chess-shot.js: mount the shipped bundle with the shipped CSS
   against a stubbed NGGApi. What comes out is the actual component, not a
   mock-up of it.

   TWO fixtures, because the account card was the only thing this script had
   ever photographed — one card out of fourteen — and an audit of the dashboard
   had to build its own harness before it could look at the screen a member
   actually lands on. That harness is now here.

   `_dash_fixture` is deliberately a member who owes REAL money (dues + a fine)
   and who also has a training place the programme covers — because the whole
   point of that work is that those two must never read as one number.

   `_dashfull_fixture` is the WHOLE dashboard, and every shape in it is copied
   from the function that really produces it: public_session, public_mentor,
   public_event, public_notification, assignment_list_for_member and
   momentum_signals. An audit that measures a fixture instead of the product
   reports defects that do not exist — this one did, four times, before the
   shapes were made faithful.

   Run:  node tests/dashboard-shot.js
   Out:  tests/screens/dashboard-*.png
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DASH_PORT || 8213;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_dash_fixture.html');
const FULLFIX = path.join(ROOT, 'tests', '_dashfull_fixture.html');
const OUT = path.join(ROOT, 'tests', 'screens');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* ── The whole-dashboard fixture ──────────────────────────────────────────
   Every shape below is copied from the function that really produces it, and
   that matters more than it sounds: an audit run against a fixture invented
   from the component's property names reported four defects that did not
   exist — a session reading "week 6/undefined", a mission that vanished, a
   mentor with no name, an XP total off by 750 — all of them the fixture, none
   of them the product. The keys here are the server's, not the component's. */
function fullFixture(manifest) {
  const MEMBER = {
    memberId: 'NGG-2024-0117', fullName: 'Temiloluwa Adeyemi', email: 'guardian@example.com',
    type: 'NGG', status: 'active', role: 'member', centre: 'Egbeda', photoUrl: '', track: 'Builder',
    displayId: 'NGG-2024-0117', disciplines: 'Chess, Robotics', cohort: '2024', bio: '', socials: null,
    phone: '', school: 'Ayobo Grammar', joinDate: '2024-09-01', parentEmail: 'guardian@example.com',
    hasPassword: true, caps: [], capsExtra: [], centreScope: [], needsTotp: false,
  };
  const DATA = {
    member: MEMBER,
    stats: { xp: 1860, level: 5, streak: 11,
      badges: ['first-mission', 'half-k-club'],
      badgeLabels: { 'first-mission': 'First mission', 'half-k-club': '500 XP club' },
      badgeCount: 2, currentWeek: 6, completedThisSession: 23, lastActiveAt: '2026-08-24T18:00:00Z' },
    // public_session() — code and totalWeeks included, because it sends them.
    session: { sessionId: 'DOMI-2026', code: 'DOMI', year: 2026, name: 'Domi 2026',
      startDate: '2026-07-13', endDate: '2026-10-05', theme: 'Build in public',
      isActive: true, coverUrl: '', weekOf: 6, totalWeeks: 12 },
    // member_dashboard()'s `today` — statuses are todo | submitted | verified | rejected.
    today: [
      { missionId: 'AM-W06', title: 'Write the week’s systems down',
        prompt: 'Three you will actually hold. Not ten.', xp: 40, type: 'Reflect', proof: 'text',
        bookPage: 44, estimatedMin: 10, status: 'todo' },
      { missionId: 'AM-W06b', title: 'Twenty minutes of deliberate practice',
        prompt: 'One skill. Timer on. No phone.', xp: 60, type: 'Practice', proof: 'photo',
        bookPage: 47, estimatedMin: 20, status: 'verified' },
      { missionId: 'AM-W06c', title: 'Ask one person a real question',
        prompt: 'And write down what they said.', xp: 30, type: 'Field', proof: 'text',
        bookPage: 51, estimatedMin: 15, status: 'todo' },
    ],
    // public_event() — note it carries NO myRsvp, which is exactly why the
    // dashboard's RSVP button can never show that you already said yes.
    events: [
      { eventId: 'E-1', title: 'Egbeda build night', kind: 'session', startAt: '2026-08-27T16:00:00Z',
        endAt: '2026-08-27T19:00:00Z', centre: 'Egbeda', location: 'Ayobo hall', coverUrl: '',
        body: '', capacity: 40, isPublic: true },
      { eventId: 'E-2', title: 'Parents’ showcase', kind: 'showcase', startAt: '2026-09-05T14:00:00Z',
        endAt: '2026-09-05T16:00:00Z', centre: 'Both', location: 'Online', coverUrl: '',
        body: '', capacity: 0, isPublic: true },
    ],
    notifications: [
      { notifId: 'N-1', kind: 'community', title: 'Coach Bisi gave your post a Genius Star',
        body: 'A mentor recognised your work.', linkPage: 'community', linkRef: '',
        createdAt: '2026-08-24T09:00:00Z', readAt: '' },
      { notifId: 'N-2', kind: 'mission', title: 'Week 6 missions are live', body: 'Three this week.',
        linkPage: 'anchor', linkRef: '', createdAt: '2026-08-23T07:00:00Z', readAt: '' },
    ],
    // public_mentor() — fullName, not name.
    mentor: { mentorId: 'MN-1', fullName: 'Coach Bisi Adeyemi', tracks: ['Builder', 'Chess'],
      centre: 'Egbeda', photoUrl: '', bio: 'Teaches the Thursday build night. Ask her about circuits.' },
    ngv: null,
    assignments: [{ assignmentId: 'A-1', title: 'Bring your eight-bar notes',
      instructions: 'Thursday, before the session.', track: 'Builder', week: 6,
      dueAt: '2026-08-27T14:00:00Z', points: 20, proof: 'text', attachmentUrl: '', submission: null }],
  };
  /* momentum_signals(): `xp` is the position WITHIN the level (0..250), and
     `totalReflections * 60` is the cumulative the rank is read off. Passing a
     cumulative as `xp` is what put 2,590 on a screen whose server said 1,860. */
  const MOMENTUM = { streak: 11, longestStreak: 19, reflectedToday: false, consistency: 63,
    weekCount: 4, prevWeekCount: 3, trend: 'steady', bestHour: 17, bestHourReliable: true,
    totalReflections: 31, xp: 110, xpToNext: 140, level: 5, levelName: 'Vanguard',
    nudges: [{ type: 'streak', tone: 'gentle', text: 'Eight more days and you beat your best run.' }] };

  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:var(--paper,#fbf7ed);}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  var DATA = ${JSON.stringify(DATA)};
  NGGApi.member.momentum = () => Promise.resolve({ momentum: ${JSON.stringify(MOMENTUM)} });
  NGGApi.member.fees = () => Promise.resolve({ enabled: true, account: {
    memberId: 'NGG-2024-0117', payable: 4500, outstanding: 229500, charged: 231500, credited: 2000,
    realCharged: 6500, realCredited: 2000, programmeCost: 225000, programmeCovered: 50000,
    trainingCharged: 225000, trainingEarned: 50000, trainingWrittenOff: 0, trainingFeePerSession: 75000,
    schedule: [], mouAt: '', currency: 'NGN', remindOff: false,
    tenure: { start: '2024-09-01', months: 22, phase: 'service', trainingMonths: 18, serviceMonths: 18,
              servedMonths: 4, complete: false, trainingEndsAt: '2026-03-01', standing: 'clear',
              creditPausedAt: '', creditStopped: false },
    entries: [] } });
  NGGApi.member.compliance = () => Promise.resolve({ state: 'clear', finesOwed: 0, fines: [], awaitingReview: false });
  NGGApi.member.activity = () => Promise.resolve({ items: [] });
  NGGApi.member.journal = () => Promise.resolve({ ok: true, entries: [] });
  NGGApi.member.rsvp = () => Promise.resolve({ ok: true });
  NGGApi.member.markRead = () => Promise.resolve({ ok: true });
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(window.DashboardLive, { data: DATA, setPage: function () {}, refreshing: false,
      mutateSeq: 0, onMutate: function () {}, onSignOut: function () {} }));
</script>
</body></html>`;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  dashboard shots: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:var(--cream-50,#fdf9f0);padding:22px;}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  var Q = new URLSearchParams(location.search);
  var paused = Q.get('state') === 'paused';
  var settled = Q.get('state') === 'settled';

  /* Real money: ₦6,000 dues + ₦500 fine, less a ₦2,000 payment = ₦4,500.
     Notional: a ₦75,000 training place the programme covers, ₦18,000 of it
     earned off by four months of service. */
  var ACC = {
    memberId: 'NGG-2024-0117',
    payable: settled ? 0 : 4500,
    /* Coherent with the schedule below: THREE sessions charged at ₦75,000 is a
       ₦225,000 place, and four of eighteen service months have earned off
       floor(225000 × 4/18) = ₦50,000. A screenshot whose figures do not add up
       is a good way to ship a broken card and not notice. */
    outstanding: 229500, charged: 231500, credited: 2000,
    realCharged: 6500, realCredited: settled ? 6500 : 2000,
    programmeCost: 225000, programmeCovered: 50000,
    trainingCharged: 225000, trainingEarned: 50000, trainingWrittenOff: 0,
    trainingFeePerSession: 75000,
    schedule: [
      { sessionId: 'TONI-2025', name: 'Toni 2025', startDate: '2025-01-06', amount: 75000, state: 'charged' },
      { sessionId: 'MEDI-2025', name: 'Medi 2025', startDate: '2025-04-07', amount: 75000, state: 'charged' },
      { sessionId: 'SUMMER-2025', name: 'Summer 2025', startDate: '2025-07-07', amount: 75000, state: 'charged' },
      { sessionId: 'DOMI-2025', name: 'Domi 2025', startDate: '2025-09-08', amount: 75000, state: 'due' },
      { sessionId: 'TONI-2026', name: 'Toni 2026', startDate: '2026-01-05', amount: 75000, state: 'upcoming' }
    ],
    mouAt: '', currency: 'NGN', remindOff: false,
    tenure: { start: '2024-09-01', months: 22, phase: 'service',
              trainingMonths: 18, serviceMonths: 18, servedMonths: 4, complete: false,
              trainingEndsAt: '2026-03-01',
              standing: paused ? 'suspended' : 'clear',
              creditPausedAt: paused ? '2026-05-14' : '',
              creditStopped: false },
    entries: [
      { kind: 'payment', direction: 'credit', amount: 2000, note: '', createdAt: '2026-07-02T09:00:00Z', void: false },
      { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — Summer 2025', createdAt: '2025-07-07T09:00:00Z', void: false },
      { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — Medi 2025', createdAt: '2025-04-07T09:00:00Z', void: false },
      { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — Toni 2025', createdAt: '2025-01-06T09:00:00Z', void: false },
      { kind: 'dues', direction: 'charge', amount: 6000, note: 'Monthly dues 2026-05', createdAt: '2026-05-12T09:00:00Z', void: false },
      { kind: 'fine', direction: 'charge', amount: 500, note: 'Late arrival — three times in August', createdAt: '2026-05-11T09:00:00Z', void: false }
    ]
  };
  ReactDOM.createRoot(document.getElementById('root'))
    .render(React.createElement(DashboardObligations, { account: ACC }));
</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  let shots = 0, problems = [];
  try {
    await waitForServer(BASE + '/tests/_dash_fixture.html');
    const shoot = async (name, query, viewport, expand) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      await page.goto(BASE + '/tests/_dash_fixture.html?' + query, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      if (expand) {
        const btn = page.locator('button', { hasText: 'See every entry' });
        if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(250); }
      }
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      await page.screenshot({ path: path.join(OUT, 'dashboard-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 dashboard-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')' + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };
    await shoot('account',         '',                 { width: 520, height: 900 });
    await shoot('account-open',    '',                 { width: 520, height: 900 }, true);
    await shoot('account-phone',   '',                 { width: 390, height: 844 });
    await shoot('account-paused',  'state=paused',     { width: 520, height: 900 });
    await shoot('account-settled', 'state=settled',    { width: 520, height: 900 });

    /* ── The whole dashboard ──────────────────────────────────────────────
       Everything above is one card. This is the page. */
    fs.writeFileSync(FULLFIX, fullFixture(manifest));
    const shootFull = async (name, viewport) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      await page.goto(BASE + '/tests/_dashfull_fixture.html', { waitUntil: 'load' });
      await page.waitForTimeout(900);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      /* A placeholder printed at a child is the failure this catches: the
         session KPI concatenates `weekOf + "/" + totalWeeks` with no guard, and
         a payload missing either one puts the word "undefined" on the screen. */
      if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) {
        problems.push(name + ': a placeholder reached the screen — ' +
          (text.match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/) || [])[0]);
      }
      await page.screenshot({ path: path.join(OUT, 'dashboard-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 dashboard-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')' + (errs.length ? '  ⚠ ' + errs[0] : ''));

      /* Touch targets, reported rather than asserted. WCAG 2.2 (2.5.8) asks
         24×24 and every one of these clears it; the 44px line is the
         convention the rest of the product holds, and the two controls the
         screen exists for — submitting a mission, saving a journal line — are
         under it. Printed so the number is visible rather than argued about. */
      if (viewport.width < 600) {
        const small = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('button, a[href], input, select, textarea, [role=button]').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            if (r.height < 43.5) out.push(Math.round(r.width) + '×' + Math.round(r.height) + ' ' +
              JSON.stringify((el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24)));
          });
          return out;
        });
        console.log('     ' + small.length + ' control(s) under 44px on a phone'
          + (small.length ? ': ' + small.slice(0, 3).join(', ') + (small.length > 3 ? ' …' : '') : ''));
      }
      await page.close();
    };
    await shootFull('full-desktop', { width: 1440, height: 1000 });
    await shootFull('full-phone',   { width: 390,  height: 844 });
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
    try { fs.unlinkSync(FULLFIX); } catch (_) {}
  }
  if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); console.log('\n❌ DASHBOARD SHOTS: ' + problems.length + ' problem(s)'); process.exit(1); }
  console.log('\n✅ DASHBOARD SHOTS: ' + shots + ' screens rendered clean into tests/screens/');
})();
