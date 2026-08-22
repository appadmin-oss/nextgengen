#!/usr/bin/env node
/* ============================================================================
   Ink and contrast.

   One function, inkOn(), decides the text colour on every coloured thing in
   this product: avatar initials, rank chips, channel chips, the centre band on
   a printed ID card. It used to pick by `L > 0.42`, which is more than twice
   the luminance at which the two inks are equally legible, so every background
   in between got white text when black was the better choice.

   That is not a rounding difference. #76B043 — the DEFAULT centre colour, what
   a new centre gets before anybody picks one — measured 2.60:1 with white and
   measures 7.13:1 with black. Six of the eight roster avatar colours and four
   of the five community ones were on the wrong side of the line, two of them
   below 3:1, and the same function inks cards that go to a printer, where
   nobody finds out until a box arrives.

   This suite exists because the failure is invisible to every other test we
   have: the markup is correct, the component renders, the screenshot looks
   plausible, and the text is simply hard to read. It is arithmetic, so it is
   checked as arithmetic — in node, against the real palettes, read out of the
   sources so that ADDING a colour to one is what fails the build.

   Run:  node tests/contrast.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

/* The same arithmetic components.jsx uses, written out independently. A test
   that imported the implementation could only prove it agrees with itself. */
function lum(hex) {
  const h = String(hex).replace('#', '').trim();
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const rgb = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
  const lin = rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const DARK = '#10131a';          // the dark ink inkOn hands out
const LIGHT = '#fff';
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('\n── The threshold itself ──────────────────────────────────────');

const components = src('components.jsx');
const declared = Number((components.match(/const INK_CROSSOVER_L = ([\d.]+)/) || [])[1]);

/* Where the two inks are equally good:
     1.05 / (L + 0.05) = (L + 0.05) / (L_dark + 0.05)
     L = sqrt(1.05 × (L_dark + 0.05)) − 0.05                                  */
const trueCrossover = Math.sqrt(1.05 * (lum(DARK) + 0.05)) - 0.05;

ok('inkOn declares a crossover constant rather than a magic number',
   Number.isFinite(declared));
ok('…and it is the luminance where black and white are equally legible ('
   + trueCrossover.toFixed(4) + ')',
   Math.abs(declared - trueCrossover) < 0.0005);
ok('…which is the best either ink can do: 4.31:1 at the crossover',
   Math.abs(1.05 / (trueCrossover + 0.05) - 4.31) < 0.01);

/* The property that actually matters, independent of what the number is: for
   ANY background, inkOn must never hand back the worse of its two inks. A
   sweep rather than a handful of samples, because the old bug lived in a band
   of luminances nobody had a named colour in. */
function inkFor(L) { return L > declared ? DARK : LIGHT; }
let worseCount = 0, worst = null;
for (let r = 0; r < 256; r += 5) {
  for (let g = 0; g < 256; g += 5) {
    for (let b = 0; b < 256; b += 51) {
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      const chosen = inkFor(lum(hex));
      const other = chosen === DARK ? LIGHT : DARK;
      if (ratio(hex, other) > ratio(hex, chosen) + 1e-9) {
        worseCount++;
        if (!worst) worst = hex;
      }
    }
  }
}
ok('over a sweep of the colour cube, inkOn never picks the worse of its two inks'
   + (worseCount ? ' (' + worseCount + ' do, e.g. ' + worst + ')' : ''),
   worseCount === 0);

console.log('\n── The palettes people actually see ──────────────────────────');

/* Read the palettes OUT OF THE SOURCE. Hard-coding the list here would let a
   new avatar colour be added tomorrow with nothing to catch it. */
function hexesFromArray(file, name) {
  const text = src(file);
  const m = text.match(new RegExp(name + '\\s*=\\s*\\[([^\\]]*)\\]'));
  if (!m) return null;
  return (m[1].match(/#[0-9a-fA-F]{3,6}/g) || []);
}

const palettes = [
  ['community avatars (CM_AVATAR_CYCLE)', hexesFromArray('page-club.jsx', 'CM_AVATAR_CYCLE')],
  ['roster avatars (PALETTE)', hexesFromArray('page-club.jsx', 'const PALETTE')],
];

/* The two colours cmColor hands out by ROLE rather than by hash. They are not
   in the cycle and were the two most visible avatars in the app. */
const roleColours = (src('page-club.jsx').match(/if \(role === "(?:mentor|you)"\) return "(#[0-9a-fA-F]{6})"/g) || [])
  .map(s => (s.match(/#[0-9a-fA-F]{6}/) || [])[0]);
palettes.push(['avatar role colours (mentor, you)', roleColours]);

palettes.forEach(([label, list]) => {
  ok('found the ' + label + ' palette in the source', !!list && list.length > 0);
  if (!list || !list.length) return;
  const bad = list.filter(h => ratio(h, inkFor(lum(h))) < 4.5)
                  .map(h => h + ' at ' + ratio(h, inkFor(lum(h))).toFixed(2) + ':1');
  /* 4.5:1, not 3:1. These are initials set at 13–16px in several places
     (page-club.jsx:778 is 15px), which is below the 18.66px bold that would
     make the large-text allowance apply. */
  ok(label + ': every colour reads at 4.5:1 with the ink we give it'
     + (bad.length ? ' — ' + bad.join(', ') : ''),
     bad.length === 0);
});

console.log('\n── The default centre colour ─────────────────────────────────');

/* The colour that inks the band across the bottom of every card printed by a
   centre nobody has configured. It appears as a fallback in three files and
   they have to agree, or a card renders one colour and previews another. */
const defaults = {
  'card-template.jsx (the {{centre.color}} fallback)':
    (src('card-template.jsx').match(/centre\.color\)\s*\|\|\s*"(#[0-9a-fA-F]{6})"/) || [])[1],
  'registration.php (what the API serves)':
    (src('api/_lib/domain/registration.php').match(/'color'\s*=>\s*\$ctr\['color'\]\s*\?\?\s*'(#[0-9a-fA-F]{6})'/) || [])[1],
};
Object.keys(defaults).forEach(where => {
  const hex = defaults[where];
  ok('the default centre colour is readable in ' + where
     + (hex ? ' (' + hex + ' at ' + ratio(hex, inkFor(lum(hex))).toFixed(2) + ':1)' : ' — NOT FOUND'),
     !!hex && ratio(hex, inkFor(lum(hex))) >= 4.5);
});
const uniq = Object.keys(defaults).map(k => (defaults[k] || '').toLowerCase()).filter(Boolean);
ok('…and every copy of it is the same colour',
   uniq.length > 1 && uniq.every(h => h === uniq[0]));

console.log('\n── inkContrast, as a measuring tool ──────────────────────────');

/* Exported so preflight and the colour pickers measure with the same function
   the renderer inks with. Two known values and one impossible one. */
ok('black on white is 21:1', Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01);
ok('a colour against itself is 1:1', Math.abs(ratio('#76B043', '#76B043') - 1) < 0.001);
ok('inkContrast is exported for preflight and the pickers to use',
   /inkOn, inkLum, inkContrast, inkIsLegible/.test(components));

/* Some colours are legible with NEITHER ink — white has gone too dark and
   black has not gone light enough. inkIsLegible is what a picker asks. */
const noInk = ['#D64545', '#4C6FFF'].filter(h => Math.max(ratio(h, LIGHT), ratio(h, DARK)) < 4.5);
ok('there really are colours no ink reads on, so the picker needs to say so ('
   + noInk.join(', ') + ')', noInk.length === 2);

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ': ' + pass + ' passed, ' + fail + ' failed (ink and contrast)');
process.exit(fail === 0 ? 0 : 1);
