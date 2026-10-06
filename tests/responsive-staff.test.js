#!/usr/bin/env node
/* ============================================================================
   The staff consoles, measured at the widths people actually hold them at.

   The public sweep (responsive.test.js) covers the marketing site. This covers
   the other half — the Control Room's forty-one sections, the Mentor Portal,
   the guardian Circle, the gate desk and the member dashboard — using the same
   two measurements from the same module.

   WHY THESE NEED THEIR OWN SUITE. Every surface here is behind a sign-in, and
   several cannot render at all without a session, so they cannot be reached by
   navigating the router the way the public sweep does. The established pattern
   in this repo is to mount the component directly against stubs — that is what
   mentor-shot.js and dashboard-shot.js do — and that is what happens below:
   `useAuth` is replaced after the bundle has defined it, with a super_admin
   holding every capability.

   WHAT IS AND IS NOT MEASURED, stated plainly because it bounds the claim.
   The API is not configured in this harness, so what renders is each section's
   chrome plus its loading, empty and error states. Those are real states — an
   admin on a bad connection sees exactly this, and CLAUDE.md §9 makes all
   three mandatory — and they are where the nav, the section headers, the
   filters and the action bars live. What this does NOT exercise is a populated
   table, which is the other place a staff surface can overflow. dashboard-shot
   and mentor-shot cover populated states for the two surfaces that have
   faithful fixtures; building forty-one more would mean inventing fixture
   shapes, and dashboard-shot's own comment records what that costs — an audit
   run against an invented fixture reported four defects that did not exist.

   Run:  node tests/responsive-staff.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const { PROBE, WIDTHS, chromiumPath, loadChromium } = require('./_responsive-probe');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RESPSTAFF_PORT || 8229;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_respstaff_fixture.html');

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

/* The Control Room's own registry, read rather than hand-listed — CLAUDE.md
   §6 and §11: the sidebar, the palette and the deep-link resolver are all
   generated from ADMIN_SECTIONS, and a responsive suite that quietly stops
   covering a new section is worse than one that never covered it. */
function adminSections() {
  const src = fs.readFileSync(path.join(ROOT, 'page-admin.jsx'), 'utf8');
  const block = src.slice(src.indexOf('const ADMIN_SECTIONS = ['),
                          src.indexOf('\n];', src.indexOf('const ADMIN_SECTIONS = [')));
  const out = [];
  for (const line of block.split('\n')) {
    const m = line.match(/\{\s*id:\s*"([^"]+)"/);
    if (m) out.push(m[1]);
  }
  return out;
}

/* The staff surfaces that mount standalone. Each is a global in the
   concatenated bundle (no module closures — CLAUDE.md §1), so naming it is
   enough. `admin` is handled separately because it has forty-one sections
   behind one component. */
const PORTALS = [
  { id: 'mentor',       component: 'MentorPortal',      label: 'Mentor Portal' },
  { id: 'circle',       component: 'CirclePortal',      label: 'Circle (guardian)' },
  { id: 'summer-admin', component: 'SummerAdminPortal', label: 'Summer School staff portal' },
  { id: 'club-admin',   component: 'ClubAdminPortal',   label: 'Club staff portal' },
  { id: 'gate',         component: 'GatePage',          label: 'The Gate desk' },
  { id: 'apply',        component: 'SelfRegisterPage',  label: 'Direct Apply' },
  { id: 'review',       component: 'ReviewDeskPage',    label: 'Review desk' },
  { id: 'designer',     component: 'DesignerPage',      label: 'Design Studio' },
];

function fixture(manifest) {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>
  /* The bundle mounts the whole App into #root on load — app.jsx ends with its
     own createRoot. Measuring into that same container means TWO React roots on
     one node, which does not error cleanly: it blanks the container and throws
     "Rendered fewer hooks than expected" from whatever the App was rendering.
     That looked exactly like a crash in the surface under test, and cost a
     bisect to disprove. So the App keeps #root, hidden, and every measurement
     mounts into #probe. */
  #root { display: none !important; }
</style>
</head><body><div id="root"></div><div id="probe"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script>
  /* BEFORE the bundle. app.jsx ends by mounting the whole SPA into #root, and
     that tree is neither measured nor renderable here: replacing useAuth
     below changes how many hooks NavBell calls between renders, so the App
     throws "Rendered fewer hooks than expected" from a subtree we are not
     looking at — which reads exactly like a crash in the surface under test.
     It cost a git bisect to disprove once; it is neutralised at the source
     now. The App's createRoot gets a stub; every other caller, including
     __mount below, gets the real one. (No backticks in this comment:
     the whole fixture is a template literal.) */
  window.__realCreateRoot = ReactDOM.createRoot;
  ReactDOM.createRoot = function (el) {
    if (el && el.id === 'root') return { render: function () {}, unmount: function () {} };
    return window.__realCreateRoot.apply(ReactDOM, arguments);
  };
</script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  ReactDOM.createRoot = window.__realCreateRoot;
  /* Replace the auth hook AFTER the bundle has defined it. A top-level
     \`function useAuth\` in a classic script creates a writable global, so a
     later assignment is what every subsequent call resolves to — which is the
     only way in to a surface that is gated on a session this harness has no
     way to mint. A super_admin holding every capability, so no section is
     skipped for want of a permission. */
  window.useAuth = function () {
    return {
      /* caps as a real array, not just hasCap(): the topbar renders its
         Summer and Club jumps off member.caps directly, so a stub without it
         leaves two of the console's most-reached controls unmeasured. */
      member: { memberId: 'NGG-2025-0099', fullName: 'Ada Admin', email: 'ada@example.com',
                role: 'super_admin', centre: 'Egbeda', type: 'NGG', status: 'active',
                caps: ['content','people','inbox','settings','rbac','summer','club','audit','journal','fees'] },
      isAdmin: true, adminOk: true, isSignedIn: true, loading: false,
      sessionExp: Math.floor(Date.now() / 1000) + 86400 * 3, lockAdmin: function () {},
      openSignIn: function () {}, setAdminOk: function () {}, signOut: function () {},
      refresh: function () {}, hasCap: function () { return true; }
    };
  };
  window.__mount = function (name, props) {
    var el = document.getElementById('probe');
    try {
      if (window.__root) { window.__root.unmount(); }
      el.innerHTML = '';
      window.__root = ReactDOM.createRoot(el);
      window.__root.render(React.createElement(window[name] || eval(name), props || {}));
      return '';
    } catch (e) { return String((e && e.message) || e); }
  };
</script></body></html>`;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  responsive-staff: skipped (playwright not installed)'); process.exit(0); }
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('  ✗ dist/ missing — run node build.js first'); process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));
  fs.writeFileSync(FIX, fixture(manifest));

  const sections = adminSections();
  console.log('Sweeping the Control Room (' + sections.length + ' sections) + '
    + PORTALS.length + ' portals × ' + WIDTHS.length + ' widths\n');

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  const clipped = [], tiny = [], broken = [];
  try {
    await waitForServer(BASE + '/tests/_respstaff_fixture.html', 20000);
    browser = await chromium.launch({ executablePath: chromiumPath(fs), args: ['--no-sandbox'] });

    for (const vp of WIDTHS) {
      console.log('  ' + vp.label);
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h },
                                           hasTouch: vp.w < 900, isMobile: vp.w < 900 });
      /* Console noise is expected and ignored: the API is unconfigured here on
         purpose, so every data call fails. A PAGE error is different — it means
         the surface did not render, and a surface that did not render cannot be
         said to have passed. */
      const crashed = [];
      page.on('pageerror', e => crashed.push(String(e && e.message).slice(0, 120)));
      await page.goto(BASE + '/tests/_respstaff_fixture.html', { waitUntil: 'networkidle' });

      const measure = async (label, mountName, props, after) => {
        const err = await page.evaluate(([n, p]) => window.__mount(n, p), [mountName, props || {}]);
        if (err) { broken.push({ label, w: vp.w, err }); return; }
        await page.waitForTimeout(320);
        if (after) { await after(page); await page.waitForTimeout(220); }
        /* 44 everywhere, except inside `.admin-main`, where styles-app.css
           holds a documented 40px for the buttons in its dense lists — "at 44
           every row of a forty-row roster grows, and 40 still clears a
           fingertip". That is a decision with a reason, so this suite measures
           against it rather than against a number I would prefer. Anything
           BELOW 40 in there is still a finding. */
        const r = await page.evaluate(PROBE, { sel: '#probe *', floor: 44,
                                               denseSel: '.admin-main', denseFloor: 40 });
        const text = await page.evaluate(() => (document.getElementById('probe').innerText || '').trim());
        if (!text) { broken.push({ label, w: vp.w, err: 'rendered nothing' }); return; }
        if (r.strays.length) clipped.push({ label, w: vp.w, n: r.strays.length, sample: r.strays.slice(0, 3) });
        if (r.small.length) tiny.push({ label, w: vp.w, n: r.small.length, sample: r.small.slice(0, 4) });
      };

      // ── The Control Room, section by section ──
      for (const id of sections) {
        await measure('nextadmin/' + id, 'AdminPage', {}, async (pg) => {
          await pg.evaluate((s) => window.__adminSection && window.__adminSection(s), id);
        });
      }
      // ── The standalone portals and desks ──
      for (const p of PORTALS) await measure(p.id + ' — ' + p.label, p.component, {});
      // ── The member dashboard, which is noindex rather than own-chrome ──
      await measure('dashboard', 'DashboardPage', {});

      if (crashed.length) broken.push({ label: 'page', w: vp.w, err: crashed[0] });
      await page.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('');
  ok('every staff surface renders', broken.length === 0);
  for (const b of broken.slice(0, 10)) console.error('      ' + b.label + ' @' + b.w + 'px — ' + b.err);

  ok('nothing is clipped off the side of any staff surface', clipped.length === 0);
  for (const c of clipped.slice(0, 14)) {
    console.error('      ' + c.label + ' @' + c.w + 'px — ' + c.n + ' element(s) past the edge');
    c.sample.forEach(s => console.error('         · ' + s));
  }

  ok('every standalone control on every staff surface meets the 44px touch floor', tiny.length === 0);
  for (const t of tiny.slice(0, 14)) {
    console.error('      ' + t.label + ' @' + t.w + 'px — ' + t.n + ' control(s)');
    t.sample.forEach(s => console.error('         · ' + s));
  }

  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (responsive — staff)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
