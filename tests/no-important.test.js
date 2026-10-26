#!/usr/bin/env node
/* ============================================================================
   No !important, anywhere in what this codebase writes.

   A stylesheet that needs !important is one fighting an inline style or its
   own specificity, and the fight never ends: the next rule needs it too. The
   site's phone layouts were built that way ([style*="…"] selectors with
   !important) and are now inline values with a variable per width
   (styles.css, RESPONSIVE LAYOUT LAYER); class-against-class wins come from
   specificity. This keeps it that way: the source stylesheets, every JSX file
   (inline <style> strings included), the PHP that prints HTML, and the design
   handoffs dc-compile reads.
   Run:  node tests/no-important.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SKIP = /(^|\/)(node_modules|dist|vendor|\.git|\.claude|api\/_cache|api\/storage|api\/logs)(\/|$)/;
const EXT = /\.(css|jsx|js|html|php|dc\.html)$/;
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, n.name), rel = path.relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    if (n.isDirectory()) walk(p); else if (EXT.test(n.name)) files.push(rel);
  }
})(ROOT);
let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; } else { failed++; console.error('  ✗ FAIL: ' + m); } };
/* Prose that names the flag (a comment explaining why it is not used, or the
   compiler that strips it from a design) is not a use of it. */
/* A browser test may INJECT the flag into a page it is driving — hiding a
   toast that sits over the control it needs to click. That is the harness
   overriding the product for one assertion, not the product shipping an
   override, which is what this file bans. */
const ALLOW = { 'tools/dc-compile.js': 3, 'tests/no-important.test.js': 99, 'tests/curriculum-ui.test.js': 1 };
let seen = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const hits = (src.match(/!\s*important/gi) || []).length;
  seen++;
  chk(f + ' has ' + hits + ' !important', hits <= (ALLOW[f] || 0));
}
chk('the scan read the stylesheets and the pages', files.includes('styles.css') && files.includes('styles-app.css') && files.includes('page-home.jsx'));
console.log(failed ? `\n❌ FAIL: ${passed} passed, ${failed} failed` : `\n✅ PASS: ${seen} files, no !important`);
process.exit(failed ? 1 : 0);
