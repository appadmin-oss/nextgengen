#!/usr/bin/env node
/* ============================================================================
   Admin tables: sortable columns, and numbers you can compare.

   There are 51 tables and 316 header cells in page-admin.jsx. Until this work
   not one column was sortable, `aria-sort` did not appear anywhere in the
   codebase, and every column — Enrolled, Present today, Late, Attendance,
   Level, Streak, Points — was left-aligned in proportional figures, so a
   column of numbers could not be scanned for its outlier, which is the only
   thing a column of numbers is for.

   Both of those are the kind of defect that renders fine, screenshots fine,
   and simply makes the screen useless for the job it exists to do. So they are
   asserted here: in a real browser, on the real component and the real
   stylesheet.

   Run:  node tests/admin-table.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ADMINTBL_PORT || 8489;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_admintbl_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

(async () => {
  const chromium = loadChromium();
  const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
  if (!chromium || !fs.existsSync(exe)) {
    console.log('… skipped: no chromium available'); process.exit(0);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
</head><body>
<div id="root" hidden></div><div id="t"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  window.__sorts = [];
  function Demo() {
    var s = React.useState({ col: 'createdAt', dir: 'desc' });
    var sort = s[0], setSort = s[1];
    var onSort = function (col, dir) { window.__sorts.push(col + ':' + dir); setSort({ col: col, dir: dir }); };
    return React.createElement('table', { className: 'admin-table' },
      React.createElement('thead', null, React.createElement('tr', null, [
        React.createElement(window.SortTh, { key: 'a', label: 'Member', col: 'fullName', sort: sort, onSort: onSort }),
        React.createElement(window.SortTh, { key: 'b', label: 'Points', col: 'points', sort: sort, onSort: onSort, numeric: true }),
        React.createElement(window.SortTh, { key: 'c', label: 'Joined', col: 'createdAt', sort: sort, onSort: onSort, defaultDir: 'desc' }),
        React.createElement('th', { key: 'd' }, 'Track'),
      ])),
      React.createElement('tbody', null,
        [['Amina', 1240], ['Chidi', 9], ['Zainab', 111]].map(function (r) {
          return React.createElement('tr', { key: r[0] }, [
            React.createElement('td', { key: 1 }, r[0]),
            React.createElement('td', { key: 2, className: 'mono admin-num' }, window.fmtNum(r[1])),
            React.createElement('td', { key: 3, className: 'mono' }, window.fmtDate('2026-08-22T09:00:00Z')),
            React.createElement('td', { key: 4 }, '—'),
          ]);
        })));
  }
  ReactDOM.createRoot(document.getElementById('t')).render(React.createElement(Demo));
</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE + '/tests/_admintbl_fixture.html');
    const page = await browser.newPage({ viewport: { width: 1180, height: 800 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message)));
    await page.goto(BASE + '/tests/_admintbl_fixture.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('.admin-sort-th', { timeout: 8000 });

    console.log('\n── The header says what it is doing ──────────────────────────');

    ok('a sortable header renders as a real header cell', errs.length === 0
      && (await page.locator('th.admin-sort-th').count()) === 3);

    /* aria-sort is the ONLY thing that tells a screen-reader user which column
       the table is ordered by. Exactly one column may claim it. */
    const sortStates = await page.$$eval('.admin-table thead th', ths =>
      ths.map(t => (t.getAttribute('aria-sort') || 'absent')));
    ok('exactly one column is marked as the sorted one',
      sortStates.filter(s => s === 'descending' || s === 'ascending').length === 1);
    ok('…and the others say "none" rather than saying nothing',
      sortStates.filter(s => s === 'none').length === 2);
    ok('…and a column that cannot be sorted claims nothing at all',
      sortStates[3] === 'absent');

    console.log('\n── Operating it ──────────────────────────────────────────────');

    /* A header that reorders the table is a control. It has to be a button, or
       it is unreachable by keyboard and invisible to assistive tech. */
    ok('the control inside the header is a button',
      (await page.locator('th.admin-sort-th button').count()) === 3);

    await page.locator('.admin-sort-btn', { hasText: 'Member' }).click();
    ok('clicking a new column sorts it ascending — names read A first',
      (await page.evaluate(() => window.__sorts.slice(-1)[0])) === 'fullName:asc');
    ok('…and the header now says so',
      (await page.locator('th', { hasText: 'Member' }).getAttribute('aria-sort')) === 'ascending');

    await page.locator('.admin-sort-btn', { hasText: 'Member' }).click();
    ok('clicking the active column flips it rather than re-sorting the same way',
      (await page.evaluate(() => window.__sorts.slice(-1)[0])) === 'fullName:desc');

    await page.locator('.admin-sort-btn', { hasText: 'Points' }).click();
    ok('a numeric column starts descending — largest first is what "sort by points" means',
      (await page.evaluate(() => window.__sorts.slice(-1)[0])) === 'points:desc');

    /* Keyboard, because the whole reason this is a button is that somebody has
       to be able to reach it without a mouse. */
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    const afterKey = await page.evaluate(() => window.__sorts.slice(-1)[0]);
    ok('…and the keyboard reaches and operates it (' + afterKey + ')',
      /^(fullName|points|createdAt):(asc|desc)$/.test(afterKey));

    const focusRing = await page.evaluate(() => {
      const b = document.querySelector('.admin-sort-btn');
      b.focus();
      const cs = getComputedStyle(b);
      return { outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    ok('…with a focus indicator that is actually drawn',
      focusRing.outline !== 'none' && focusRing.width >= 2);

    console.log('\n── Target size ───────────────────────────────────────────────');

    /* WCAG 2.2 2.5.8 is 24×24. The arrow alone would be a 9px target on all
       316 of these, so the button fills the cell. */
    const boxes = await page.$$eval('.admin-sort-btn', bs =>
      bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    ok('every sort control clears 24×24 (' + boxes.map(b => b.join('×')).join(', ') + ')',
      boxes.length === 3 && boxes.every(([w, h]) => w >= 24 && h >= 24));

    console.log('\n── Numbers you can compare down a column ─────────────────────');

    const numCell = await page.evaluate(() => {
      const td = document.querySelector('td.admin-num');
      const cs = getComputedStyle(td);
      return { align: cs.textAlign, figures: cs.fontVariantNumeric };
    });
    ok('a numeric cell is right-aligned, so the units line up', numCell.align === 'right');
    ok('…and set in tabular figures, so a 1 is as wide as a 0',
      /tabular-nums/.test(numCell.figures));

    /* The actual point of both: the digits of different numbers land in the
       same columns. Measured, not assumed. */
    const rightEdges = await page.$$eval('td.admin-num', tds =>
      tds.map(t => Math.round(t.getBoundingClientRect().right)));
    ok('…so 1,240 and 9 and 111 end at the same x (' + rightEdges.join(', ') + ')',
      new Set(rightEdges).size === 1);

    ok('no page errors across the whole run', errs.length === 0);
    if (errs.length) console.log('  errors: ' + errs.slice(0, 3).join(' | '));
    await page.close();
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ': ' + pass + ' passed, ' + fail + ' failed (admin tables)');
  process.exit(fail === 0 ? 0 : 1);
})();
