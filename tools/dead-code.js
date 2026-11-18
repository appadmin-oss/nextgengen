'use strict';
/* ============================================================================
   Dead code: what the site ships but nothing uses (owner, 18 Nov 2026: "Remove
   everything that is irrelevant", then "Please create a test for that").

   A top-level function, class or variable in a shipped source file is DEAD
   when its name appears nowhere else in the product — not in another file, not
   in a string, not in a window export, not in PHP that names a component, not
   in a test.
   Declarations are read with the vendored Babel parser (never a regex: a
   function written inside a template string is text, not code). Docs do not
   keep code alive.

   The same rule covers self-hosted font files: one that no stylesheet or code
   names can never be downloaded, so it is only weight in the deploy.

   Used by tests/dead-code.test.js, and as `node tools/dead-code.js --prune`
   to remove what it finds (whole declarations with their own leading comment,
   repeated until nothing new is orphaned).
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* Tests DO count as a reference: tested code is deliberate API (ids-core's pure helpers), and removing
   a panel a test still renders would mean deleting the test with it — that is a decision, not a sweep. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.build', 'docs', 'vendor', 'screens']);

/** The shipped sources: the build ORDER plus the plain scripts index.html loads. */
function shippedFiles() {
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  // ORDER is a literal list of quoted paths: read the strings, never execute the file.
  const order = [...src.match(/const ORDER = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  return order.concat(['data.js', 'photos.js', 'api-client.js', 'outbox.js']).filter(f => fs.existsSync(path.join(ROOT, f)));
}

/** Every product source as text (code, markup, server), for counting names. */
function corpus() {
  const out = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (SKIP_DIRS.has(f) || p.startsWith(path.join(ROOT, 'assets', 'learn-media'))) continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(jsx|js|php|html|css|json|gs)$/.test(f)) out.push([path.relative(ROOT, p), fs.readFileSync(p, 'utf8')]);
    }
  })(ROOT);
  return out;
}

let _babel = null;
function parse(code) {
  if (!_babel) _babel = require(path.join(ROOT, 'vendor', 'babel.min.js'));
  return _babel.transform(code, { ast: true, code: false, presets: ['react'], sourceType: 'script', configFile: false, babelrc: false }).ast.program;
}

/** Top-level declarations of one file: [{ name, start, end }] (a destructured or multi-name declaration is skipped). */
function declarations(code) {
  const out = [];
  for (const n of parse(code).body) {
    let name = null;
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) name = n.id.name;
    else if (n.type === 'VariableDeclaration' && n.declarations.length === 1 && n.declarations[0].id.type === 'Identifier') name = n.declarations[0].id.name;
    if (!name) continue;
    const lead = (n.leadingComments || []).filter(c => /^\s*$/.test(code.slice(c.end, n.start)) || c.end <= n.start);
    // Only the comment block that sits directly on the declaration is its own.
    let start = n.start;
    for (let i = lead.length - 1; i >= 0; i--) { if (/^\s*$/.test(code.slice(lead[i].end, start)) && !/\n\s*\n/.test(code.slice(lead[i].end, start))) start = lead[i].start; else break; }
    out.push({ name, start, end: n.end });
  }
  return out;
}

/** How many times each identifier-like word appears across the product. */
function wordCounts(texts) {
  const counts = new Map();
  for (const [, t] of texts) for (const m of t.matchAll(/[A-Za-z_$][\w$]*/g)) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  return counts;
}

/** [{ file, name, bytes }] — declared once and named nowhere else. */
function findDead() {
  const texts = corpus(), counts = wordCounts(texts), dead = [];
  for (const f of shippedFiles()) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const d of declarations(code)) if ((counts.get(d.name) || 0) === 1) dead.push({ file: f, name: d.name, bytes: d.end - d.start });
  }
  return dead;
}

/** Self-hosted font files nothing names. */
function findDeadFonts() {
  const texts = corpus(), dead = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f), st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(woff2?|ttf|otf)$/.test(f) && !texts.some(([q, t]) => q !== path.relative(ROOT, p) && t.includes(f))) dead.push(path.relative(ROOT, p));
    }
  })(path.join(ROOT, 'assets'));
  return dead;
}

function prune() {
  let removed = [];
  for (let round = 0; round < 20; round++) {
    const dead = findDead();
    if (!dead.length) break;
    const byFile = {};
    dead.forEach(d => (byFile[d.file] = byFile[d.file] || new Set()).add(d.name));
    for (const [f, names] of Object.entries(byFile)) {
      const p = path.join(ROOT, f);
      let code = fs.readFileSync(p, 'utf8');
      const cut = declarations(code).filter(d => names.has(d.name)).sort((a, b) => b.start - a.start);
      for (const d of cut) {
        let e = d.end; if (code[e] === '\n') e++;
        code = code.slice(0, d.start) + code.slice(e);
        removed.push(f + ' ' + d.name);
      }
      parse(code);   // still valid, or this throws and nothing is written
      fs.writeFileSync(p, code);
    }
  }
  return removed;
}

module.exports = { findDead, findDeadFonts, declarations, shippedFiles, prune };

if (require.main === module && process.argv.includes('--prune')) {
  const r = prune();
  console.log(r.length ? 'removed:\n  ' + r.join('\n  ') : 'nothing dead');
}
