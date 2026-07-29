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
        present: 30, enrolled: 40, rate: 75, registered: 47, pending: 6, capacity: 60, fill: 78 },
      { centreId: 'EG', code: 'EG', name: 'Egbeda', color: '#2f9e44', need: 30, filled: 22, gap: 8,
        present: 66, enrolled: 80, rate: 83, registered: 90, pending: 13, capacity: 120, fill: 75 },
    ],
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
    ],
    faculties: ['Tech', 'Arts'],
    directory: [], deltas: {}, page: { published: true },
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

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  boards: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  // Mount the built bundle directly: React, a stubbed NGGApi, then render the
  // board under test into a root div. No API, no router, no service worker.
  fs.writeFileSync(FIX, `<!doctype html><html><head>
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
             // #13 has no centre at all — the shape a partial row arrives in.
             centre: n === 13 ? undefined : { name: n % 2 ? 'Ijaiye' : 'Egbeda', color: '#76B043' } };
  }) };
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
      volunteerCards: function () { return window.__fail === 'all' ? offline() : Promise.resolve({ program: PROGRAM, cards: [] }); },
      centres: function () { return Promise.resolve({ centres: [] }); },
      // A secondary endpoint failing must not take the roster down with it.
      hierarchy: function () { return window.__fail ? offline() : Promise.resolve({ tiers: [] }); },
    }) }),
    public: deep({
    status: stub('status', ${JSON.stringify(STATUS)}),
    leaderboard: stub('leaderboard', ${JSON.stringify(LEADERBOARD)}),
    volunteerStatus: stub('volunteerStatus', ${JSON.stringify(STATUS)}),
  }) });
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
            : b === 'consent' ? 'MemberConsentEditor'
            : b === 'checkin' ? 'GateCheckin'
            : b === 'roster' ? 'SummerRoster'
            : b === 'summer' ? 'SummerPage' : b === 'club' ? 'ClubPage' : 'StatusPage';
  var props;
  if (b === 'photo') {
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
    props = { photoUrl: '', setPhotoUrl: function (u) { window.__photo = u; }, onBack: function () {}, onNext: function () {},
              card: {}, gold: '#f5b026', goldInk: '#2b2100', mut: {} };
  } else if (b === 'capture') {
    window.__uploaded = [];
    window.NGGApi.uploadFile = function (f) { window.__uploaded.push(f.name || 'blob'); return Promise.resolve({ url: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg' }); };
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
    ];
    window.NGGApi.admin.summer = {
      students: function () { return Promise.resolve({ students: KIDS }); },
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
    window.NGGApi.admin.summer = {
      attendance: function () { return Promise.resolve({ attendance: {
        cohort: { cohortId: 'C1', name: 'Summer 2026' },
        today: 2, absentToday: CLOSED ? 0 : 3, activeStudents: 5, sessionDays: 10,
        days: Array.from({ length: 14 }, function (_, i) {
          return { date: '2026-07-' + ('0' + (i + 6)).slice(-2), present: (i % 7 === 5 || i % 7 === 6) ? 0 : 4,
                   programmeDay: !(i % 7 === 5 || i % 7 === 6) };
        }),
        roster: [
          { studentId: 'SUM-1', fullName: 'Amina Alpha', track: 'Music', centre: 'Ijaiye', present: 10, halfDays: 0, lates: 0, lastSeen: TODAY2, presentToday: true,  rate: 100, state: 'clear',   absences: 0 },
          { studentId: 'SUM-2', fullName: 'Bode Beta',   track: 'Tech',  centre: 'Egbeda', present: 4,  halfDays: 2, lates: 3, lastSeen: '2026-07-14', presentToday: false, rate: 30,  state: 'dormant', absences: 2 },
          { studentId: 'SUM-3', fullName: 'Chidi Gamma', track: 'Arts',  centre: 'Ijaiye', present: 9,  halfDays: 0, lates: 1, lastSeen: '2026-07-16', presentToday: false, rate: 90,  state: 'warned',  absences: 1 },
        ],
        atRisk: [{ studentId: 'SUM-2', fullName: 'Bode Beta', rate: 30 }],
        recent: [], 
        programme: NOCAL
          ? { enabled: false, isProgrammeDay: true, today: TODAY2, nextDay: '', scannedDays: 10, termStart: '', termEnd: '', remaining: 0 }
          : { enabled: true, isProgrammeDay: !CLOSED, today: TODAY2, nextDay: '2026-07-20', scannedDays: 9,
              termStart: '2026-07-06', termEnd: '2026-08-28', remaining: 30 },
      } }); },
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
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window[which], props));
  } catch (e) { window.__errors.push(String(e && e.message)); }
</script></body></html>`);

  fs.writeFileSync(path.join(ROOT, 'tests', '_upload_fixture.html'),
    '<!doctype html><html><body><script src="/dist/api-client.js"></script></body></html>');

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await waitForServer(BASE);
  let pass = 0, fail = 0;
  const ok = (l, c) => { c ? pass++ : (fail++, console.error('  ✗ ' + l)); };
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
       summerStars.length === 3 && !/Future Music Producer|Tech Explorer/.test(summerTxt));
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
    await cp.close();

    ok('the Club page mounts with no script error', cpErrs.length === 0);
    if (cpErrs.length) console.error('       ', cpErrs.slice(0, 3).join(' | '));
    ok('two real members are NOT replaced by the twelve-strong demo roster',
       /MEMBER DIRECTORY · 2/.test(clubTxt) && !/Kwame|Nneka|Hadiza|Chinedu/.test(clubTxt));
    ok('…and no invented statistics are printed as fact',
       !/Earned by \d+%/i.test(clubTxt) && !/126 \/ 164/.test(clubTxt));
    ok('…the leaderboard names them', /Adaeze O\./.test(clubTxt) && /Tunde B\./.test(clubTxt));
    ok('…and shows stars beside XP on the featured member', /★ 12/.test(clubTxt) && /2,980 XP/.test(clubTxt));

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
    ok('/cards is not blank', body.trim().length > 200 && /verified student/.test(body));
    ok('/cards offers the bulk exports', /PNG \(all, \.zip\)/.test(body) && /Print-ready PDF/.test(body));
    await studio.close();

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
      && await pol.getByRole('button', { name: 'Mon', exact: true }).count() === 1);
    const dowOn = await pol.evaluate(() => Array.from(document.querySelectorAll('[aria-pressed]'))
      .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.trim()));
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
    await pol.getByRole('button', { name: 'Fri', exact: true }).click();
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
    ok('…lists the whole roster by default (' + await rows() + ')', await rows() === 3);
    await att.selectOption('select[aria-label="Filter the roster"]', 'absent');
    await att.waitForTimeout(120);
    ok('…filters to absent-today', await rows() === 2);
    await att.fill('input[aria-label="Search the roster"]', 'bode');
    await att.waitForTimeout(120);
    ok('…and a search narrows inside the filter, rather than replacing it', await rows() === 1);
    await att.fill('input[aria-label="Search the roster"]', 'zzz');
    await att.waitForTimeout(120);
    ok('…says so when nothing matches', /No student matches/.test(await att.evaluate(() => document.body.innerText)));
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
    ok('all three children are listed', await roRows() === 3);
    await ro.selectOption('select[aria-label="Filter children"]', 'pending');
    await ro.waitForTimeout(150);
    ok('filtering to awaiting-parent narrows to the one', await roRows() === 1);
    await ro.selectOption('select[aria-label="Filter children"]', 'noconsent');
    await ro.waitForTimeout(150);
    ok('filtering to missing-consent finds both', await roRows() === 2);
    await ro.selectOption('select[aria-label="Filter children"]', 'all');
    await ro.waitForTimeout(150);

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
    // Stand the community's own markup up; the classes are what carry the CSS.
    await cmP.evaluate(() => {
      document.body.className = 'cm-app';
      document.body.innerHTML = '<div class="page cm-slack-page"><div class="cm-slack">'
        + '<aside class="cm-sb"><nav class="cm-sb-nav">'
        + '<button class="cm-sb-item cm-sb-chan"><span class="cm-sb-hash">#</span><span class="cm-sb-name">Practical Coding</span></button>'
        + '</nav></aside>'
        + '<main class="cm-col"><header class="cm-hd">'
        + '<button class="cm-hd-burger">☰</button>'
        + '<div class="cm-hd-title"><div class="cm-hd-line"><span class="cm-hd-name">Commons</span></div></div>'
        + '<div class="cm-hd-actions"><button class="cm-hd-sortbtn">New</button>'
        + '<button class="cm-hd-btn cm-hd-btn-ai">✨</button>'
        + '<button class="cm-hd-btn cm-hd-btn-info">ⓘ</button></div></header>'
        + '<div class="cm-stream is-feed"><div class="cm-cardfeed"><article class="cm-card">'
        + '<div class="cm-card-body">Hello</div><div class="cm-card-foot">'
        + '<button class="cm-chip-react">👏 3</button>'
        + '<button class="cm-card-reply">2 replies</button>'
        + '<button class="cm-menu-btn">⋯</button></div></article></div></div></main>'
        + '</div></div>';
    });
    await cmP.waitForTimeout(250);

    /* Hittable area, not painted box: a chip 28px tall whose ::after reaches 44
       IS a 44px target, and measuring the box would report a problem that is
       not there while missing one that is. */
    const tiny = await cmP.evaluate(() => {
      const out = [];
      document.querySelectorAll('.cm-col button, .cm-sb button').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        /* The sidebar is parked off-canvas on a phone until the burger opens
           it. elementFromPoint over an off-screen element reports whatever is
           painted there instead, so measuring it says nothing about the
           target — it is measured when it is open, not while it is away. */
        if (r.right <= 0 || r.left >= window.innerWidth) return;
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        /* An ancestor at the probe point is the ancestor being hit, not the
           control — crediting it reports a 38px button as 49px because the row
           around it is tall. A ::after that widens the hit area still returns
           the element itself, so real extensions are still credited. */
        const owns = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
        let up = 0, down = 0;
        for (let d = 1; d <= 24; d++) { if (owns(cx, cy - d)) up = d; else break; }
        for (let d = 1; d <= 24; d++) { if (owns(cx, cy + d)) down = d; else break; }
        if (up + down + 1 < 40 || r.width < 40) out.push(String(el.className).split(' ')[0] + ' ' + Math.round(r.width) + 'x' + (up + down + 1));
      });
      return out;
    });
    ok('the community has controls to measure on a phone (control)',
       await cmP.evaluate(() => document.querySelectorAll('.cm-col button').length) >= 5);
    ok('…and every one of them is a 40px+ target (' + (tiny.length ? tiny.join(', ') : 'all pass') + ')',
       tiny.length === 0);
    /* Details has no other entry point. Catch-up does — the sidebar footer —
       so it is the one that may give up its space. */
    ok('channel Details can still be opened on a phone',
       await cmP.evaluate(() => {
         const b = document.querySelector('.cm-hd-btn-info');
         return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0;
       }));
    ok('…while AI catch-up yields its space, since the sidebar still offers it',
       await cmP.evaluate(() => getComputedStyle(document.querySelector('.cm-hd-btn-ai')).display === 'none'));
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
        public: {
          selfreg: {
            context: () => Promise.resolve({ open: true, selfServe: true, gate: { name: 'Public link' },
              form: { version: 2, fields: [
                { key: 'firstName', label: 'First name', type: 'text', required: true },
                { key: 'lastName', label: 'Last name', type: 'text', required: true },
                { key: 'faculty', label: 'Faculty', type: 'choice', options: ['Music'], required: true },
                { key: 'course', label: 'Course', type: 'choice', optionsFrom: 'faculty', optionsBy: { Music: ['Piano'] }, required: true },
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

    await srP.fill('input[type="text"] >> nth=0', 'Ada');
    await srP.fill('input[type="text"] >> nth=1', 'Obi');
    await srP.getByRole('button', { name: /Continue → Photo/ }).click();
    await srP.waitForTimeout(300);
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
    await srP.waitForTimeout(600);
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
          { studentId: 'RC1-0101', fullName: 'Ada Obi', age: 13, centre: 'Egbeda', course: 'Piano', guardianName: 'Mrs Obi',
            guardianPhone: '+2348031112222', parentEmail: 'obi@example.com', photoUrl: '', regStatus: 'self_pending',
            photo: { verdict: 'check', score: 52, issues: ['too_dark'], source: 'ai' }, possibleDuplicate: false },
          { studentId: 'RC1-0102', fullName: 'Bola Eze', age: 12, centre: 'Egbeda', course: 'Piano', guardianName: 'Mr Eze',
            guardianPhone: '', parentEmail: 'eze@example.com', photoUrl: '', regStatus: 'self_pending',
            photo: { verdict: 'pass', score: 88, issues: [], source: 'ai' }, possibleDuplicate: true },
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
    await rvP.fill('input[aria-label="Review desk password"]', 'right');
    await rvP.getByRole('button', { name: /Unlock/ }).click();
    await rvP.waitForTimeout(900);
    const rvText = await rvP.evaluate(() => document.body.innerText);
    ok('…and unlocks to the queue', /2 waiting/.test(rvText) && /Ada Obi/.test(rvText));
    /* The verdict is next to the photo, not instead of it — and it is not the
       decision, so the wording has to read as advice. */
    ok('…showing each photo verdict and the duplicate warning',
       /check photo/.test(rvText) && /photo ok/.test(rvText) && /possible duplicate/.test(rvText));
    ok('…and saying plainly that approving is what emails the family',
       /Approving is what emails the guardian/.test(rvText));
    await rvP.close(); await rvT.close();
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_apply_fixture.html')); } catch (_) {}

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

  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  // KEEP_FIX=1 leaves tests/_boards_fixture.html on disk so a failing board can
  // be opened by hand under `php -S`. Off by default; the fixture is generated.
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { if (!process.env.KEEP_FIX) fs.unlinkSync(FIX); } catch (_) {}
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_upload_fixture.html')); } catch (_) {}  }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (UI smoke: boards + card studio)');
  process.exit(fail ? 1 : 0);
})();
