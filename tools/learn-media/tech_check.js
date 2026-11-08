/* Check the Coding and Technology Foundations diagrams in a real browser, and the lessons that use them.

     node tools/learn-media/tech_check.js [png-dir]

   For every SVG in assets/learn-media/{coding,tech}/:
     - no text runs outside the picture;
     - text drawn inside a box (<g data-fit="x y w h">, see tech_draw.py) stays inside that box;
     - no two pieces of text overlap.
   Then every `media:coding/…` and `media:tech/…` reference in the two seed files must exist on disk, and every
   diagram on disk must be used. With a png-dir, each diagram is also rendered there at 2x, for looking at. */
const fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['coding', 'tech'];
const SEEDS = { coding: 'curriculum-practical-coding-2026.json', tech: 'curriculum-tech-foundations-2026.json' };

(async () => {
  const pngDir = process.argv[2];
  if (pngDir) fs.mkdirSync(pngDir, { recursive: true });
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 800 }, deviceScaleFactor: 2 });
  const problems = [];
  const onDisk = new Set();
  for (const d of DIRS) {
    const dir = path.join(ROOT, 'assets', 'learn-media', d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort()) {
      onDisk.add(d + '/' + f);
      await page.goto('file://' + path.join(dir, f));
      await page.evaluate(() => document.fonts.ready);
      const found = await page.evaluate(() => {
        const svg = document.documentElement, o = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal, out = [];
        const box = el => { const r = el.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; };
        const texts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim());
        const bb = texts.map(box);
        texts.forEach((t, i) => {
          const b = bb[i], s = t.textContent.trim().slice(0, 40);
          if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > vb.width + 0.5 || b.y + b.h > vb.height + 0.5) out.push(`outside the picture: "${s}"`);
          const g = t.closest('[data-fit]');
          if (g) {
            const [x, y, w, h] = g.getAttribute('data-fit').split(' ').map(Number);
            if (b.x < x + 1 || b.x + b.w > x + w - 1 || b.y < y || b.y + b.h > y + h) out.push(`spills out of its box: "${s}"`);
          }
        });
        // glyph boxes include the font's line gap, so shrink each a little before testing for a collision
        const k = b => ({ x: b.x + 1, y: b.y + b.h * 0.18, w: b.w - 2, h: b.h * 0.64 });
        for (let i = 0; i < bb.length; i++) for (let j = i + 1; j < bb.length; j++) {
          const a = k(bb[i]), c = k(bb[j]);
          if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h)
            out.push(`text overlaps: "${texts[i].textContent.trim().slice(0, 30)}" / "${texts[j].textContent.trim().slice(0, 30)}"`);
        }
        return out;
      });
      found.forEach(p => problems.push(`${d}/${f}: ${p}`));
      if (pngDir) await (await page.$('svg')).screenshot({ path: path.join(pngDir, d + '-' + f.replace(/\.svg$/, '.png')) });
    }
  }
  await browser.close();
  const used = new Set();
  for (const [d, file] of Object.entries(SEEDS)) {
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', '_lib', 'seeds', file), 'utf8'));
    for (const L of seed.lessons) for (const m of L.body.matchAll(/\]\(media:((?:coding|tech)\/[^)\s]+)\)/g)) {
      used.add(m[1]);
      if (!fs.existsSync(path.join(ROOT, 'assets', 'learn-media', m[1]))) problems.push(`missing file for ${L.course} wk${L.week}.${L.position}: media:${m[1]}`);
    }
  }
  for (const f of onDisk) if (!used.has(f)) problems.push(`on disk but used by no lesson: ${f}`);
  console.log(`${onDisk.size} diagrams checked, ${used.size} referenced by lessons`);
  problems.forEach(p => console.log('  ✗ ' + p));
  console.log(problems.length ? `${problems.length} problem(s)` : 'all clear');
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
