/* Wait for a spawned `php -S` to actually accept connections.
 *
 * All three browser suites used to spawn the server and then sleep a fixed
 * 1000–1200ms before pointing Chromium at it. That is fine on an idle machine
 * and a coin-flip when four suites run back to back on a shared container:
 * PHP takes longer than the sleep to bind, every fetch in the run fails, and
 * the suite reports a real-looking failure that vanishes on a re-run. A test
 * that fails for a reason unrelated to the code is worse than no test — it
 * teaches you to ignore red.
 *
 * Polls until the port answers, then returns. Throws if it never does, so a
 * genuinely dead server is still a hard failure rather than a hang.
 */
/* NOTE ON PARALLELISM: the kiosk, scanner and journal suites each write a
 * throwaway `api/config.php` and delete it on exit. They must run in SEQUENCE
 * — `npm run test:all` chains them with && for that reason. Running two at
 * once has one suite deleting the other's config mid-run, which shows up as
 * unrelated assertions failing on a codebase that is fine. */
const http = require('http');

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(700, () => { req.destroy(); resolve(false); });
  });
}

/** Resolve once `base` responds, polling every 100ms up to `timeoutMs`. */
async function waitForServer(base, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  for (;;) {
    if (await ping(base + '/robots.txt')) return;
    if (Date.now() > deadline) throw new Error('server at ' + base + ' never came up');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/* Wait for the SPA to actually mount.
 *
 * The browser suites serve the SOURCE tree, not `dist/`, so index.html pulls
 * in ~17 `type="text/babel"` files and Chromium transpiles every one of them
 * in-page before React mounts. That is deliberate — a failure then points at
 * the file you just edited instead of at a stale build artifact — but it is
 * slow, and it gets slower every time the app grows.
 *
 * Measured on this container: 13.3–14.0s. The suites used to allow 15s, which
 * is not a margin, it is a coin flip — and it duly started failing at random
 * once page-admin.jsx and page-other.jsx grew. Nothing was wrong with the app.
 *
 * So the budget is deliberately far above the observed cost. A boot that takes
 * 20s is not a bug worth failing a suite over; a boot that never happens is,
 * and that still fails — with a message that says what was being waited for
 * rather than a bare Playwright timeout.
 */
const BOOT_TIMEOUT = 60000;

async function waitForBoot(page, timeoutMs) {
  try {
    await page.waitForFunction(() => !!window.__navigate, null, { timeout: timeoutMs || BOOT_TIMEOUT });
  } catch (e) {
    const n = await page.evaluate(() => (document.getElementById('root') || {}).childElementCount || 0).catch(() => -1);
    throw new Error('SPA never mounted (window.__navigate absent after '
      + Math.round((timeoutMs || BOOT_TIMEOUT) / 1000) + 's; #root has ' + n
      + ' children). Usually a JSX syntax error — check the page console output above.');
  }
}

module.exports = { waitForServer, waitForBoot, BOOT_TIMEOUT };
