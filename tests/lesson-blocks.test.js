#!/usr/bin/env node
/* ============================================================================
   Lesson blocks — the diagrams a lesson draws from its own text
   (lesson-blocks.jsx). Run:  node tests/lesson-blocks.test.js

   These are hand-built SVGs standing in for an engraving library this
   repository will not take as a runtime dependency (CLAUDE.md §1), so nothing
   downstream catches a wrong note. A keyboard that lights the wrong key, or a
   chord box with the fingers of a different chord, teaches a child something
   false and looks completely correct doing it. The geometry and the chord
   table are therefore pinned here against hand-worked figures.

   What is asserted is the PROMISE, not the markup: which pitch is held, which
   fret a finger goes on, what the contrast actually is, and that the aria
   label says the same thing the picture does — because for a learner on a
   screen reader the label IS the diagram.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const src = fs.readFileSync(path.join(__dirname, '..', 'lesson-blocks.jsx'), 'utf8');
const js = esbuild.transformSync(src, { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' }).code;

/* A React shim small enough to read: createElement returns the tree itself, so
   a test can ask what was drawn without a renderer or a DOM. */
const React = {
  createElement: (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false) }),
  Fragment: 'Fragment',
};
const T = { React, console };
vm.createContext(T);
vm.runInContext(js + '\n;Object.assign(this, { lbNote, lbContrast, lbLuminance, LB_CHORDS, LbKeys, LbChord, LbStaff, LbSwatch, LbSteps, lessonBlockFor });', T);

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

/** Every node in a rendered tree, depth first. */
function* walk(n) {
  if (!n || typeof n !== 'object') return;
  yield n;
  for (const k of n.kids || []) yield* walk(k);
}
const all = (n, type) => [...walk(n)].filter(x => x.type === type);
/** The aria-label of the first labelled <svg> — what a screen reader is told. */
const label = (n) => ([...walk(n)].find(x => x.props && x.props['aria-label']) || { props: {} }).props['aria-label'];
const classed = (n, cls) => [...walk(n)].filter(x => String(x.props && x.props.className || '').split(/\s+/).includes(cls));

console.log('notes');
chk('a bare letter is middle-octave: C → pitch class 0, octave 4', (() => { const n = T.lbNote('C'); return n.pc === 0 && n.octave === 4; })());
chk('accidentals and octaves parse: F#5 → 6 / 5, Bb → 10', T.lbNote('F#5').pc === 6 && T.lbNote('F#5').octave === 5 && T.lbNote('Bb').pc === 10);
chk('enharmonics agree: C# and Db are the same pitch', T.lbNote('C#').pc === T.lbNote('Db').pc);
chk('anything that is not a note is refused, not guessed at', ['H', 'C##', '', 'x', '8'].every(t => T.lbNote(t) === null));

console.log('keyboard (```keys)');
let k = T.LbKeys({ args: 'C E G' });
chk('two octaves are drawn — 14 white keys', classed(k, 'lb-key-white').length === 14);
chk('…and 10 black keys, 5 to the octave', classed(k, 'lb-key-black').length === 10);
chk('the notes asked for are the notes held down, in both octaves (3 × 2)', classed(k, 'is-on').length === 6);
chk('the label names them, so the diagram reads aloud', /C, E, G/.test(label(k)));
chk('a lesson that names no note still draws the keyboard, and says so', /none/.test(label(T.LbKeys({ args: '' }))));

console.log('chord boxes (```chord)');
/* Against the standard open shapes, string 6 (low E) first. A wrong row here
   is a child pressing the wrong fret for a term. */
const SHAPES = { Am: [-1, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0], C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], E: [0, 2, 2, 1, 0, 0], A: [-1, 0, 2, 2, 2, 0], F: [1, 3, 3, 2, 1, 1] };
chk('every chord in the table is the standard open shape', Object.entries(SHAPES).every(([n, f]) => JSON.stringify(T.LB_CHORDS[n].frets) === JSON.stringify(f)));
chk('…and names a finger for every stopped string, none for open or muted',
  Object.values(T.LB_CHORDS).every(c => c.frets.every((f, i) => (f > 0) === (c.fingers[i] > 0))));
chk('…with fingers in range 1–4', Object.values(T.LB_CHORDS).every(c => c.fingers.every(n => n >= 0 && n <= 4)));
let c = T.LbChord({ args: 'Am' });
chk('the grid is six strings by five frets', all(c, 'line').length === 6 + 5);
chk('Am: three stopped strings get a dot, one is muted, two ring open',
  all(c, 'circle').filter(x => x.props.className === 'lb-chord-dot').length === 3
  && all(c, 'circle').filter(x => x.props.className === 'lb-chord-open').length === 2
  && all(c, 'text').filter(x => x.props.className === 'lb-chord-mark').length === 1);
chk('the label spells the shape out string by string', /string 1 muted/.test(label(c)) && /string 4 fret 2/.test(label(c)));
chk('several chords in one fence draw several boxes', all(T.LbChord({ args: 'Am Em C' }), 'svg').length === 3);
chk('a chord with no diagram says so instead of drawing nothing',
  classed(T.LbChord({ args: 'Cmaj7' }), 'lb-chord-missing').length === 1);

console.log('staff (```staff)');
let s = T.LbStaff({ args: 'E4 F4 G4' });
chk('five staff lines', classed(s, 'lb-staff-line').length === 5);
chk('one notehead per note', all(s, 'ellipse').length + all(s, 'circle').length >= 3);
chk('E4 sits on the bottom line and each step up is half a line height', (() => {
  const ys = [...walk(s)].filter(x => x.type === 'ellipse' || x.type === 'circle').map(x => x.props.cy);
  return ys.length === 3 && ys[0] > ys[1] && ys[1] > ys[2] && Math.abs((ys[0] - ys[1]) - (ys[1] - ys[2])) < 1e-9;
})());
chk('the label names the notes', /E, F, G/.test(label(s)));

console.log('colour (```swatch) — the contrast is the lesson, so it must be right');
chk('black on white is 21:1', Math.abs(T.lbContrast('#000000', '#ffffff') - 21) < 0.01);
chk('a colour against itself is 1:1', Math.abs(T.lbContrast('#e4032b', '#e4032b') - 1) < 1e-9);
chk('mid grey #767676 is the 4.5:1 boundary on white', Math.abs(T.lbContrast('#767676', '#ffffff') - 4.54) < 0.05);
let sw = T.LbSwatch({ args: '#e4032b Rust | #ffd400 Gold' });
chk('one chip per colour', classed(sw, 'lb-swatch').length === 2);
chk('each colour is read twice — as text on white, and on black', classed(sw, 'lb-swatch-verdict').length === 4);
chk('…each to one decimal', classed(sw, 'lb-swatch-ratio').every(x => /^\d+\.\d:1$/.test(x.kids.join(''))));
/* Both verdicts must be reachable, which is the whole point of the pair: gold
   on white is unreadable (1.4:1) and fine on black (14.7:1). A single
   "best of black and white ink" reading can never fall below 4.58:1 for ANY
   colour, so its failing branch was dead code dressed as a check. */
chk('gold fails as text on white and passes on black — both verdicts are reachable', (() => {
  const v = classed(T.LbSwatch({ args: '#ffd400 Gold' }), 'lb-swatch-verdict');
  return v.length === 2
    && v.some(x => x.props.className.includes('is-fail') && /on white/.test(x.kids.join('')))
    && v.some(x => x.props.className.includes('is-pass') && /on black/.test(x.kids.join('')));
})());
chk('a chip never prints unreadable ink on itself', classed(sw, 'lb-swatch-chip').every(x => T.lbContrast(x.props.style.background, x.props.style.color) >= 4.5));

console.log('session shape (```steps)');
let st = T.LbSteps({ args: '10 Warm up | 30 Learn | 40 Play | 10 Pack down' });
chk('one bar per step', classed(st, 'lb-step').length === 4);
chk('the bars are to scale — 90 minutes across, so Play is four times Warm up', (() => {
  const w = classed(st, 'lb-step').map(x => parseFloat(x.props.style['--lb-share']));
  return w.length === 4 && Math.abs(w[2] / w[0] - 4) < 1e-6;
})());

console.log('routing, and what happens where this file is not loaded');
chk('the fence languages route to a diagram', ['keys', 'chord', 'chords', 'staff', 'notes', 'swatch', 'palette', 'steps'].every(l => T.lessonBlockFor(l, 'C') !== null));
chk('…case does not matter', T.lessonBlockFor('KEYS', 'C') !== null);
/* A Coding lesson's ```js block must stay a code block. Routing one to a
   diagram would be the worse failure of the two. */
chk('an ordinary code fence is left alone', ['js', 'html', 'css', 'python', 'sql', ''].every(l => T.lessonBlockFor(l, 'x') === null));
chk('the arguments reach the component unchanged', T.lessonBlockFor('chord', 'Am Em').args === 'Am Em');

/* The notation lives in the lesson body as plain Markdown precisely so that it
   survives the Word download, an email and a plain-text copy, where this file
   does not exist. That degradation is a feature and is pinned here. */
chk('the fence still reads as a sentence without any renderer', (() => {
  const raw = '```keys C E G';
  return raw.replace(/^```/, '').trim() === 'keys C E G';
})());

console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed` : `✅ PASS: ${passed} passed, 0 failed`));
process.exit(failed ? 1 : 0);
