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

module.exports = { waitForServer };
