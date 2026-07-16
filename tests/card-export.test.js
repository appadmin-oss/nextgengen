/* Library-backed ID-card export test (html2canvas + jsPDF + JSZip).
   Runs in real Chromium via Playwright, served by php -S so /vendor/* resolves.
   Skips with a pass if playwright-core isn't installed (like the kiosk E2E). */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8196, BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_export_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  card-export: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, '<!doctype html><html><body>'
    + '<div id="card" class="idcard" style="width:295px;height:502px;background:#fff;position:relative;font-family:Inter,sans-serif;overflow:hidden">'
    + '<div style="position:absolute;top:200px;left:0;right:0;text-align:center;font-weight:800;font-size:26px;color:#E4155F">ADAEZE</div>'
    + '<div style="position:absolute;left:0;right:0;bottom:0;height:14px;background:#B0143C"></div></div>'
    + '<script src="/vendor/card-export.js"></script></body></html>');

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1000));
  let pass = 0, fail = 0; const ok = (l, c) => { c ? pass++ : (fail++, console.error('  ✗ ' + l)); };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') console.error('    page:', m.text()); });
    await page.goto(BASE + '/tests/_export_fixture.html', { waitUntil: 'networkidle' });
    const r = await page.evaluate(async () => {
      const CE = window.CardExport; await CE.ensureDeps();
      const node = document.getElementById('card');
      const img = await CE.nodeToImage(node, { type: 'image/jpeg', scale: 3, quality: 0.94, bg: '#fff' });
      const png = await CE.nodeToImage(node, { scale: 2 });
      const zip = await CE.zipStore([{ name: 'a.png', bytes: png.bytes }]);
      const pdf = await CE.buildImpositionPDF([{ dataUrl: img.dataUrl }, { dataUrl: img.dataUrl }], { sheet: 'A4', marks: true });
      let latin = ''; for (let i = 0; i < pdf.length; i++) latin += String.fromCharCode(pdf[i]);
      // Uncompressed probe: prove setDrawColor(4 args) emits a DeviceCMYK op.
      const jd = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      jd.setDrawColor(0, 0, 0, 1); jd.line(10, 10, 40, 10);
      const pu = new Uint8Array(jd.output('arraybuffer'));
      let pl = ''; for (let i = 0; i < pu.length; i++) pl += String.fromCharCode(pu[i]);
      return {
        jpg: img.bytes[0] === 0xFF && img.bytes[1] === 0xD8 && img.bytes.length > 1500,
        zipPk: zip[0] === 0x50 && zip[1] === 0x4b && zip.length > 100,
        pdfHeader: latin.indexOf('%PDF') === 0, pdfEof: latin.trim().slice(-5) === '%%EOF', pdfLen: pdf.length,
        outputIntent: latin.indexOf('OutputIntent') !== -1 && latin.indexOf('FOGRA39') !== -1,
        cmyk: /(\d+\.?\d* ){4}K/.test(pl) && pl.indexOf(' 255. K') === -1, // 4-channel K op, in-range (0..1)
      };
    });
    ok('html2canvas rasterised the card to JPEG', r.jpg);
    ok('JSZip produced a valid .zip', r.zipPk);
    ok('jsPDF produced a valid PDF (%PDF … %%EOF, ' + r.pdfLen + ' bytes)', r.pdfHeader && r.pdfEof);
    ok('PDF carries a FOGRA39 CMYK OutputIntent', r.outputIntent);
    ok('marks drawn in DeviceCMYK (4-channel stroke operator)', r.cmyk);
  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(FIX); } catch (_) {} }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (card-export, library-backed)');
  process.exit(fail ? 1 : 0);
})();
