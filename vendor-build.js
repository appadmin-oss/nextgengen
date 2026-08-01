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
};

/* Copied verbatim from the published tarball: package path → vendor filename. */
const COPY = [
  ['fabric', 'dist/index.min.js', 'fabric.min.js'],
  ['tui-image-editor', 'dist/tui-image-editor.min.js', 'tui-image-editor.min.js'],
  ['tui-image-editor', 'dist/tui-image-editor.min.css', 'tui-image-editor.min.css'],
  ['tui-color-picker', 'dist/tui-color-picker.min.js', 'tui-color-picker.min.js'],
  ['tui-color-picker', 'dist/tui-color-picker.min.css', 'tui-color-picker.min.css'],
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
      if (fs.existsSync(p)) { fs.copyFileSync(p, path.join(LICENSES, pkg + '-LICENSE.txt')); break; }
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
}

const OUTPUTS = [
  'fabric.min.js', 'tui-image-editor.min.js', 'tui-image-editor.min.css',
  'tui-color-picker.min.js', 'tui-color-picker.min.css',
  'filerobot-image-editor.min.js', 'filerobot-image-editor.min.css',
];

if (CHECK) {
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
  if (bad) { console.error(`\n❌ ${bad} vendored file(s) do not match this recipe.`); process.exit(1); }
  console.log('\n✅ vendored design libraries match vendor-build.js');
} else {
  build(VENDOR);
  for (const f of OUTPUTS) {
    const p = path.join(VENDOR, f);
    if (fs.existsSync(p)) log(f, Math.round(fs.statSync(p).size / 1024) + 'KB', sha(fs.readFileSync(p)));
  }
  log('done — commit vendor/ (the host has no Node, so dist/ must ship the built files)');
}
