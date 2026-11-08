/*
 * Proves the business_arts.py diagrams in a real browser, and renders PNGs to look at.
 *
 *   node tools/learn-media/ba_check.js [outDir] [filter]
 *
 * For every SVG in assets/learn-media/{business,divisions,medialab,arts}/:
 *   - no text under 16px (read from the drawn element, not the source);
 *   - every text box lies inside the canvas;
 *   - no two pieces of text overlap (bounding boxes, 1px tolerance);
 *   - every text that starts inside a rectangle ends inside it too (words do not spill out of their box).
 * Every media: reference in the four seed files must exist on disk.
 * With outDir, each diagram is also written there as a PNG at 1x.
 */
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..", "..");
const DIRS = ["business", "divisions", "medialab", "arts"];
const SEEDS = ["curriculum-business-tool-first-2026.json", "curriculum-divisions-2026.json", "curriculum-media-lab-2026.json", "curriculum-studio-trades-2026.json"];

(async () => {
  const out = process.argv[2], filter = process.argv[3] || "";
  if (out) fs.mkdirSync(out, { recursive: true });
  let bad = 0, n = 0;
  for (const s of SEEDS) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, "api/_lib/seeds", s), "utf8"));
    for (const l of j.lessons) for (const m of l.body.matchAll(/\]\(media:([a-z0-9/_.-]+)\)/g)) {
      if (!fs.existsSync(path.join(ROOT, "assets/learn-media", m[1]))) { console.log("MISSING", s, m[1]); bad++; }
    }
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const d of DIRS) {
    const dir = path.join(ROOT, "assets/learn-media", d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".svg") && f.includes(filter)).sort()) {
      n++;
      const svg = fs.readFileSync(path.join(dir, f), "utf8");
      await page.setContent(`<!doctype html><body style="margin:0;background:#fff">${svg}</body>`);
      const probs = await page.evaluate(() => {
        const P = [], s = document.querySelector("svg"), vb = s.viewBox.baseVal;
        const T = [...s.querySelectorAll("text")].map(e => ({ e, b: e.getBBox(), s: e.textContent }));
        const R = [...s.querySelectorAll("rect")].map(e => e.getBBox()).filter(b => b.width < vb.width - 10 && b.height > 18 && b.width > 30);
        for (const t of T) {
          const fs_ = parseFloat(getComputedStyle(t.e).fontSize);
          if (fs_ < 16) P.push(`small ${fs_}px: ${t.s}`);
          const b = t.b;
          if (t.e.closest("[transform]")) continue;
          if (b.x < 1 || b.y < 1 || b.x + b.width > vb.width - 1 || b.y + b.height > vb.height - 1) P.push(`off canvas: ${t.s}`);
          const cx = b.x + 2, cy = b.y + b.height / 2;
          const inside = R.filter(r => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
          if (inside.length) {
            const r = inside.reduce((a, c) => (c.width * c.height < a.width * a.height ? c : a));
            if (b.x + b.width > r.x + r.width + 1 || b.x < r.x - 1) P.push(`spills box: ${t.s}`);
          }
        }
        for (let i = 0; i < T.length; i++) for (let k = i + 1; k < T.length; k++) {
          if (T[i].e.closest("[transform]") || T[k].e.closest("[transform]")) continue;   // rotated labels: getBBox is pre-transform
          const a = T[i].b, c = T[k].b;
          const ox = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x), oy = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
          if (ox > 1 && oy > 3) P.push(`overlap: "${T[i].s}" × "${T[k].s}"`);
        }
        return P;
      });
      if (probs.length) { bad += probs.length; console.log(`${d}/${f}\n  ` + probs.join("\n  ")); }
      if (out) {
        const el = await page.$("svg");
        await el.screenshot({ path: path.join(out, `${d}__${f.replace(".svg", ".png")}`) });
      }
    }
  }
  await browser.close();
  console.log(`${n} diagrams checked, ${bad} problem(s)`);
  process.exit(bad ? 1 : 0);
})();
