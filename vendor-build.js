#!/usr/bin/env node
/**
 * Rebuild the vendored design-editor libraries — run on a laptop, never on the host.
 *
 *   node vendor-build.js          # fetch + build everything into vendor/
 *   node vendor-build.js --check  # verify what is committed matches this recipe
 *
 * Three of the libraries in vendor/ ship a UMD file we can copy verbatim. The
 * fourth does not, and that is the whole reason this script exists.
 *
 * Filerobot Image Editor 5 is published as ESM only, importing react,
 * react-dom/client, react-konva, konva and styled-components. Dropping it into a
 * page that loads classic scripts is not possible, so we bundle it ourselves —
 * and while bundling, we point `react` and `react-dom` at the copies this app
 * ALREADY loads (window.React / window.ReactDOM, 18.3.1, which is exactly the
 * version range Filerobot 5 asks for). Without that alias the bundle carries a
 * second React: 140KB of duplicate download, and — worse — two Reacts in one
 * page, which breaks hooks in ways that surface as blank panels rather than
 * errors. The shims below are the tweak; everything else is stock.
 *
 * The output is committed, because the host has no Node and `dist/` must be a
 * complete deploy target. `--check` is what keeps a committed blob honest: it
 * rebuilds into a temp dir and compares, so nobody can hand-edit vendor/ and
 * have it survive review.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const VENDOR = path.join(ROOT, 'vendor');
const LICENSES = path.join(VENDOR, 'licenses');
const CHECK = process.argv.includes('--check');

/* Pinned to the exact version, never a range. A vendored file that changes
   because somebody re-ran a script on a different day is not vendored. */
const PACKAGES = {
  'fabric': '7.4.0',
  'tui-image-editor': '3.15.3',
  'tui-color-picker': '2.2.6',
  'filerobot-image-editor': '5.0.0',
  /* Real .docx, for the Analyst pane's report draft. A finding that a
     coordinator has to retype into Word is a finding that arrives paraphrased,
     and the alternative — an .html file named .doc — is a file Word opens with
     a security warning and Google Docs refuses. Published as ESM+CJS with no
     UMD build, so it goes through the same bundle step as Filerobot. */
  'docx': '9.7.1',
  /* PDF.js — the community's document reader.
   *
   * The LEGACY build, deliberately. The default build targets recent evergreen
   * browsers; the legacy one is transpiled down and is what renders on the
   * older Android WebViews that a shared centre phone actually runs. 50KB more
   * for a document that opens instead of one that throws.
   *
   * Published ESM-only, so both halves go through esbuild below: the library
   * as an IIFE exposing window.pdfjsLib, and the worker as a CLASSIC worker
   * script, because `new Worker(url)` without {type:'module'} is the form every
   * target browser supports. */
  'pdfjs-dist': '5.4.624',
};

/* THE TWEAK THAT MAKES FILEROBOT WORK HERE.
 *
 * filerobot-image-editor@5.0.0 declares react-konva ^18.2.10, but its own
 * dependency react-filerobot-image-editor resolves react-konva 19 — and
 * react-konva 19 throws at module scope on React 18:
 *
 *   "react-konva version 19 is only compatible with React 19."
 *
 * The bundle therefore dies during evaluation, before the line that assigns its
 * global, and the only symptom is a photo editor that never appears: the script
 * tag fires `load` normally, because a script that throws still loads. It took a
 * standalone page to see the message at all.
 *
 * We pin the React-18 line rather than upgrading the app to React 19, which
 * would be a change to every screen in the product to satisfy one admin tool.
 * npm `overrides` is what forces it through the transitive dependency. */
const OVERRIDES = {
  'react': '18.3.1',
  'react-dom': '18.3.1',
  'react-konva': '18.2.10',
  /* The ID Card Studio's face renderer. Measured against Chromium's own
     screenshot of every card type at 300 dpi, it was the only renderer with no
     pixel off (html2canvas: 5–6%, squashing letter-spaced text), and the
     fastest (16–40 ms a face). It renders through the browser's own layout
     engine via SVG foreignObject, so a card prints as the screen draws it. */
  '@zumer/snapdom': '3.3.0',
};

/* Copied verbatim from the published tarball: package path → vendor filename. */
const COPY = [
  ['fabric', 'dist/index.min.js', 'fabric.min.js'],
  ['tui-image-editor', 'dist/tui-image-editor.min.js', 'tui-image-editor.min.js'],
  ['tui-image-editor', 'dist/tui-image-editor.min.css', 'tui-image-editor.min.css'],
  ['tui-color-picker', 'dist/tui-color-picker.min.js', 'tui-color-picker.min.js'],
  ['tui-color-picker', 'dist/tui-color-picker.min.css', 'tui-color-picker.min.css'],
  ['@zumer/snapdom', 'dist/snapdom.js', 'snapdom.js'],
];

const SHIMS = {
  'shim-react.js': `const R = window.React;
export default R;
export const {
  Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
  cloneElement, createContext, createElement, createFactory, createRef, forwardRef,
  isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue,
  useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect,
  useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
  useTransition, version,
} = R;
/* react-reconciler (under react-konva) imports React's internals BY NAME, so the
   shim has to re-export them or it dies with "Cannot read properties of
   undefined (reading 'ReactCurrentBatchConfig')" — an error that names a React
   internal and points nowhere near the actual cause, which is this file. */
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
`,
  'shim-react-dom.js': `const D = window.ReactDOM;
export default D;
export const { createPortal, flushSync, render, unmountComponentAtNode, findDOMNode, version } = D;
// react-konva batches through this one; absent, it throws on the first update.
export const unstable_batchedUpdates = D.unstable_batchedUpdates;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = D.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
`,
  'shim-react-dom-client.js': `const D = window.ReactDOM;
export default D;
export const { createRoot, hydrateRoot } = D;
`,
  /* The modern JSX transform imports from `react/jsx-runtime`, which is a
     DIFFERENT specifier from `react` — alias only the latter and a second React
     is pulled in through the back door, which is what the guard below caught. */
  'shim-jsx-runtime.js': `const R = window.React;
const has = (k) => typeof R[k] === "function";
export const Fragment = R.Fragment;
export const jsx = has("jsx") ? R.jsx : (t, p, k) => {
  const { children, ...rest } = p || {};
  return k === undefined ? R.createElement(t, rest, children) : R.createElement(t, { ...rest, key: k }, children);
};
export const jsxs = jsx;
export const jsxDEV = jsx;
export default { Fragment, jsx, jsxs, jsxDEV };
`,
  // The global is what the lazy loader waits on — see loadVendor() in components.jsx.
  'entry.js': `import FilerobotImageEditor from "filerobot-image-editor";
window.FilerobotImageEditor = FilerobotImageEditor;
export default FilerobotImageEditor;
`,
  /* docx has no React in it and no globals to collide with, so it is a plain
     namespace bundle — everything the library exports, under one global. */
  'entry-docx.js': `import * as docx from "docx";
window.docx = docx;
export default docx;
`,
};

function log(...a) { console.log('[vendor]', ...a); }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16); }

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function build(outDir) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-vendor-'));
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({
    name: 'ngg-vendor-build', private: true, overrides: OVERRIDES,
  }));
  const specs = Object.entries(PACKAGES).map(([n, v]) => `${n}@${v}`);
  log('installing', specs.join(' '));
  run('npm', ['install', '--no-audit', '--no-fund', '--silent', ...specs], work);

  for (const [pkg, from, to] of COPY) {
    const src = path.join(work, 'node_modules', pkg, from);
    fs.copyFileSync(src, path.join(outDir, to));
    log('copied', to, '(' + Math.round(fs.statSync(src).size / 1024) + 'KB)');
  }

  for (const [name, body] of Object.entries(SHIMS)) fs.writeFileSync(path.join(work, name), body);
  const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
  log('bundling filerobot-image-editor with React aliased to the page globals');
  run(fs.existsSync(esbuild) ? esbuild : 'npx', [
    ...(fs.existsSync(esbuild) ? [] : ['esbuild']),
    path.join(work, 'entry.js'), '--bundle', '--minify', '--format=iife', '--target=es2019',
    '--alias:react=' + path.join(work, 'shim-react.js'),
    '--alias:react-dom=' + path.join(work, 'shim-react-dom.js'),
    '--alias:react-dom/client=' + path.join(work, 'shim-react-dom-client.js'),
    '--alias:react/jsx-runtime=' + path.join(work, 'shim-jsx-runtime.js'),
    '--alias:react/jsx-dev-runtime=' + path.join(work, 'shim-jsx-runtime.js'),
    '--define:process.env.NODE_ENV="production"',
    '--metafile=' + path.join(work, 'meta.json'),
    '--outfile=' + path.join(outDir, 'filerobot-image-editor.min.js'),
  ], work);

  /* PDF.js, in two pieces.
   *
   * The worker is not an optimisation here, it is the whole design: parsing and
   * rasterising a PDF on the main thread locks the page for as long as it takes,
   * and on the phones this is read on that is seconds per page. Bundled to IIFE
   * so it loads as a classic worker.
   *
   * `pdfjsLib` is assigned from the namespace rather than re-exported, because
   * the viewer reads `window.pdfjsLib.getDocument` and `GlobalWorkerOptions`. */
  fs.writeFileSync(path.join(work, 'entry-pdfjs.js'),
    'import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";\n'
    + 'window.pdfjsLib = pdfjsLib;\nexport default pdfjsLib;\n');
  log('bundling pdf.js (legacy build) + its worker');
  run(fs.existsSync(esbuild) ? esbuild : 'npx', [
    ...(fs.existsSync(esbuild) ? [] : ['esbuild']),
    path.join(work, 'entry-pdfjs.js'), '--bundle', '--minify', '--format=iife', '--target=es2019',
    '--define:process.env.NODE_ENV="production"',
    '--outfile=' + path.join(outDir, 'pdfjs.min.js'),
  ], work);
  run(fs.existsSync(esbuild) ? esbuild : 'npx', [
    ...(fs.existsSync(esbuild) ? [] : ['esbuild']),
    path.join(work, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    '--bundle', '--minify', '--format=iife', '--target=es2019',
    '--outfile=' + path.join(outDir, 'pdfjs.worker.min.js'),
  ], work);
  const pdfOut = fs.readFileSync(path.join(outDir, 'pdfjs.min.js'), 'utf8');
  for (const sym of ['getDocument', 'GlobalWorkerOptions']) {
    if (!pdfOut.includes(sym)) throw new Error('pdf.js bundle is missing ' + sym);
  }
  if (!pdfOut.includes('window.pdfjsLib')) throw new Error('pdf.js bundle does not publish window.pdfjsLib');

  /* Standard fonts, for PDFs that reference a base-14 font without embedding it
     — which is most things exported by older Word and by phone scanners. They
     are fetched ONE FILE AT A TIME, only when a document actually needs one, so
     the whole folder is never a download; it is 800KB of files that mostly sit
     there. cmaps (a further 1.7MB) are deliberately NOT shipped: they exist for
     CJK text, which this programme does not produce, and a reader who meets a
     Japanese PDF gets a clear failure rather than everyone paying for it. */
  const fontsSrc = path.join(work, 'node_modules', 'pdfjs-dist', 'standard_fonts');
  const fontsOut = path.join(outDir, 'pdfjs-standard-fonts');
  fs.rmSync(fontsOut, { recursive: true, force: true });
  fs.mkdirSync(fontsOut, { recursive: true });
  for (const f of fs.readdirSync(fontsSrc)) fs.copyFileSync(path.join(fontsSrc, f), path.join(fontsOut, f));
  log('copied', fs.readdirSync(fontsOut).length, 'standard fonts');

  log('bundling docx');
  run(fs.existsSync(esbuild) ? esbuild : 'npx', [
    ...(fs.existsSync(esbuild) ? [] : ['esbuild']),
    path.join(work, 'entry-docx.js'), '--bundle', '--minify', '--format=iife', '--target=es2019',
    '--define:process.env.NODE_ENV="production"',
    '--outfile=' + path.join(outDir, 'docx.min.js'),
  ], work);
  const docxOut = fs.readFileSync(path.join(outDir, 'docx.min.js'), 'utf8');
  /* The two exports the report writer uses. Asserted because a namespace bundle
     that silently loses a symbol produces "Document is not a constructor" at the
     moment somebody presses Export, on a machine that is not this one. */
  for (const sym of ['Packer', 'Document', 'Paragraph', 'TextRun', 'Table']) {
    if (!docxOut.includes(sym)) throw new Error('docx bundle is missing ' + sym);
  }

  /* The aliases are the point of this script, so they are verified rather than
     assumed — from esbuild's own metafile, not by grepping the output.
     Grepping was the first attempt and it was wrong twice over: it missed
     `react/jsx-runtime`, which is a different specifier from `react` and pulled
     a whole second React in through the back door, and it then false-positived
     on `__SECRET_INTERNALS_DO_NOT_USE`, which react-reconciler references by
     name whether or not React itself is bundled. The metafile lists exactly
     which files went in, so it can simply be asked. */
  const meta = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'));
  const dupes = Object.keys(meta.inputs).filter(k => /(^|\/)node_modules\/(react|react-dom)\//.test(k));
  if (dupes.length) {
    throw new Error('filerobot bundle carries a second copy of React (' + dupes.length
      + ' files, e.g. ' + dupes[0] + ') — an import specifier is missing an --alias');
  }
  const bundled = fs.readFileSync(path.join(outDir, 'filerobot-image-editor.min.js'), 'utf8');
  if (!bundled.includes('window.React')) throw new Error('filerobot bundle does not read window.React — the alias did not apply');
  /* React renamed its internals between 18 and 19, and the shim re-exports the
     18 name. If the vendored React ever moves, this is the line that says so
     instead of a runtime "Cannot read properties of undefined". */
  const reactUmd = fs.readFileSync(path.join(ROOT, 'vendor', 'react.production.min.js'), 'utf8');
  if (!reactUmd.includes('__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED')) {
    throw new Error('vendored React no longer exposes __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED — update shim-react.js');
  }
  /* And the version guard that actually bit us. react-konva 19 throws at module
     scope on React 18, so the bundle builds cleanly and dies on load — with the
     script tag still firing `load`, so the only symptom is an editor that never
     appears. Pinned by OVERRIDES; asserted here so a future bump cannot undo it
     silently. */
  if (/react-konva version 19/.test(bundled)) throw new Error('filerobot bundle pulled react-konva 19, which refuses React 18 — check OVERRIDES');

  for (const [pkg] of Object.entries(PACKAGES).map(([k]) => [k])) {
    for (const cand of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
      const p = path.join(work, 'node_modules', pkg, cand);
      if (fs.existsSync(p)) { fs.copyFileSync(p, path.join(LICENSES, pkg.replace(/^@/, '').replace(/\//g, '-') + '-LICENSE.txt')); break; }
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
}

const OUTPUTS = [
  'fabric.min.js', 'tui-image-editor.min.js', 'tui-image-editor.min.css',
  'tui-color-picker.min.js', 'tui-color-picker.min.css',
  'filerobot-image-editor.min.js', 'filerobot-image-editor.min.css',
  'docx.min.js', 'pdfjs.min.js', 'pdfjs.worker.min.js',
];

/* Verify vendor/VERSIONS.json against the bytes on disk.
 *
 * The recipe above can only speak for the five packages it builds. The other
 * eleven files in vendor/ — React, Babel, jspdf, jsQR, pica and the rest — are
 * committed blobs with no build step, and until VERSIONS.json existed they had
 * no recorded version, no integrity hash and nothing that would notice one
 * being edited by hand. This is the part of `--check` that covers them.
 *
 * Runs WITHOUT npm, so it works on a machine that cannot reach the registry —
 * which matters, because it is the only integrity check most of vendor/ has.
 */
function checkManifest() {
  const file = path.join(VENDOR, 'VERSIONS.json');
  if (!fs.existsSync(file)) { console.error('  ✗ vendor/VERSIONS.json is missing'); return 1; }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')).files || {};

  const onDisk = [];
  (function walk(dir, base) {
    for (const name of fs.readdirSync(dir).sort()) {
      const rel = base ? base + '/' + name : name;
      if (rel === 'VERSIONS.json') continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full, rel); else onDisk.push(rel);
    }
  })(VENDOR, '');

  let bad = 0;
  for (const rel of onDisk) {
    const entry = manifest[rel];
    if (!entry) { console.error('  ✗ ' + rel + ' is in vendor/ but not in VERSIONS.json'); bad++; continue; }
    const h = sha(fs.readFileSync(path.join(VENDOR, rel)));
    if (h !== entry.sha256) {
      console.error('  ✗ ' + rel + ' does not match VERSIONS.json (disk ' + h + ' vs manifest ' + entry.sha256 + ')');
      bad++;
    }
  }
  for (const rel of Object.keys(manifest)) {
    if (!onDisk.includes(rel)) { console.error('  ✗ ' + rel + ' is in VERSIONS.json but missing from vendor/'); bad++; }
  }
  if (!bad) {
    const unresolved = Object.entries(manifest).filter(([, e]) => e.package && !e.version).map(([k]) => k);
    console.log('  ✓ VERSIONS.json matches all ' + onDisk.length + ' files in vendor/');
    if (unresolved.length) {
      console.log('  · version still unestablished for: ' + unresolved.join(', '));
      console.log('    (identified by hash, not yet by version — see the note in VERSIONS.json)');
    }
  }
  return bad;
}

if (CHECK) {
  const manifestBad = checkManifest();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-vendor-check-'));
  build(tmp);
  let bad = 0;
  for (const f of OUTPUTS) {
    const a = path.join(VENDOR, f), b = path.join(tmp, f);
    if (!fs.existsSync(a)) { console.error('  ✗ missing from vendor/: ' + f); bad++; continue; }
    if (!fs.existsSync(b)) continue;                     // css emitted only alongside the js
    const ha = sha(fs.readFileSync(a)), hb = sha(fs.readFileSync(b));
    if (ha !== hb) { console.error(`  ✗ ${f} differs (vendor ${ha} vs rebuild ${hb})`); bad++; }
    else console.log(`  ✓ ${f} ${ha}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  bad += manifestBad;
  if (bad) { console.error(`\n❌ ${bad} vendored file(s) do not match this recipe or the manifest.`); process.exit(1); }
  console.log('\n✅ vendored libraries match vendor-build.js and VERSIONS.json');
} else {
  build(VENDOR);
  for (const f of OUTPUTS) {
    const p = path.join(VENDOR, f);
    if (fs.existsSync(p)) log(f, Math.round(fs.statSync(p).size / 1024) + 'KB', sha(fs.readFileSync(p)));
  }
  log('done — commit vendor/ (the host has no Node, so dist/ must ship the built files)');
}
