/* Render the core courses' worked-example pages (assets/learn-media/core/shots/*.html) to PNG beside them.
   Run after build.py:  node tools/learn-core/shots.js   (uses the pre-installed Chromium via playwright). */
const fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
(async () => {
  const dir = path.join(__dirname, '..', '..', 'assets', 'learn-media', 'core', 'shots');
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
    await page.goto('file://' + path.join(dir, f));
    const png = path.join(dir, f.replace(/\.html$/, '.png'));
    await page.screenshot({ path: png, fullPage: true });
    console.log('wrote', path.relative(process.cwd(), png));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
