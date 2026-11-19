'use strict';
/* ============================================================================
   A test photo for the browser suites, drawn in the page.

   The photo quality gate (api/_lib/domain/photo-quality.php, photoQa* in
   components.jsx) refuses blurred, small, dark, washed-out and flat photos, so
   a flat grey square is no longer a "usable photo". This draws a portrait-like
   one — background, shoulders, hair, a face, eyes, a mouth, and fine texture —
   that passes, and the same photo degraded the ways the gate must refuse:

     testPhoto(page)                       → passes  (900 × 1200 JPEG)
     testPhoto(page, { blur: 4 })          → blurry
     testPhoto(page, { w: 420, h: 560 })   → too small
     testPhoto(page, { dark: 0.85 })       → too dark

   Returns a Playwright file payload for setInputFiles.
   ========================================================================== */

async function testPhoto(page, opts) {
  const o = Object.assign({ w: 900, h: 1200, blur: 0, dark: 0, name: 'photo.jpg' }, opts || {});
  const b64 = await page.evaluate(o => {
    const { w, h } = o;
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, 'rgb(200,205,210)'); bg.addColorStop(1, 'rgb(160,165,210)');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const ell = (x, y, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
    const cx = w / 2, cy = h * 0.38;
    ell(cx, h * 0.95, w * 0.45, h * 0.3, 'rgb(30,50,110)');
    ell(cx, cy - h * 0.07, w * 0.21, h * 0.15, 'rgb(25,20,18)');
    ell(cx, cy, w * 0.18, h * 0.17, 'rgb(150,100,70)');
    for (const s of [-1, 1]) { ell(cx + s * w * 0.07, cy - h * 0.02, w * 0.028, h * 0.011, 'rgb(245,245,240)'); ell(cx + s * w * 0.07, cy - h * 0.02, w * 0.012, w * 0.012, 'rgb(20,15,10)'); }
    g.fillStyle = 'rgb(90,40,35)'; g.fillRect(cx - w * 0.066, cy + h * 0.09, w * 0.133, h * 0.012);
    // Fine texture: what a sharp camera keeps and a blur takes away.
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < w * h / 6; i++) {
      const p = (Math.floor(rnd() * h) * w + Math.floor(rnd() * w)) * 4, k = Math.round(rnd() * 56 - 28);
      d[p] = Math.max(0, Math.min(255, d[p] + k)); d[p + 1] = Math.max(0, Math.min(255, d[p + 1] + k)); d[p + 2] = Math.max(0, Math.min(255, d[p + 2] + k));
    }
    g.putImageData(img, 0, 0);
    let out = c;
    if (o.blur) { const b = document.createElement('canvas'); b.width = w; b.height = h; const bg2 = b.getContext('2d'); bg2.filter = 'blur(' + o.blur + 'px)'; bg2.drawImage(c, 0, 0); out = b; }
    if (o.dark) { const k = out.getContext('2d'); k.fillStyle = 'rgba(0,0,0,' + o.dark + ')'; k.fillRect(0, 0, w, h); }
    return out.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, o);
  return { name: o.name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

module.exports = { testPhoto };
