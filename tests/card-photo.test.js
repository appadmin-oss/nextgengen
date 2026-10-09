#!/usr/bin/env node
/* ============================================================================
   Card photos (card-photo.jsx): the whole photograph, unless it holds more
   than a head and shoulders.

   Held: a Cloudinary URL is read into its parts and anything else is left
   alone; the machine's framing (c_thumb / c_fill face crops) is taken out and
   a person's edits (colour fixes, a removed background, an editor zoom) stay;
   landmarks are carried through the stored chain's own resize steps; a
   passport photo is shown whole, and a full-length or wide photo is cropped
   to the head and shoulders, inside the picture, at the box's shape. The
   landmark figures are Cloudinary's own answer for its demo image.

   Run:  node tests/card-photo.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'card-photo.jsx'), 'utf8');
const T = { React: {}, fetch: () => Promise.reject(new Error('offline')) };
vm.createContext(T);
vm.runInContext(src + '\n;Object.assign(this, { CPH_ABOVE, CPH_BELOW, CPH_WIDE });', T);

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

// fl_getinfo for res.cloudinary.com/demo/image/upload/c_thumb,g_face,w_200,h_200,fl_getinfo/woman.jpg
const WOMAN = { input: { width: 1000, height: 688 }, landmarks: [[{ r_eye: { x: 306, y: 196 }, l_eye: { x: 403, y: 210 }, nose_tip: { x: 353, y: 263 }, mouth_r: { x: 297, y: 290 }, mouth_l: { x: 385, y: 302 } }]],
  resize: [{ x: 132, y: 23, width: 420, height: 420 }, { x_factor: 0.238, y_factor: 0.238 }], output: { width: 200, height: 200 } };

console.log('reading a URL');
const P = T.cphCloudinary('https://res.cloudinary.com/ngg/image/upload/c_thumb,g_face,w_600,h_750,e_improve,q_auto/v17/ngg/headshot/abc.jpg');
chk('a Cloudinary URL splits into prefix, transformation chain and the rest', P && P.prefix === 'https://res.cloudinary.com/ngg/image/upload/'
  && P.chain.length === 1 && P.rest === 'v17/ngg/headshot/abc.jpg');
chk('…a URL with no transformation has an empty chain', T.cphCloudinary('https://res.cloudinary.com/ngg/image/upload/v1/x.jpg').chain.length === 0);
chk('any other URL is not Cloudinary’s (the local store, a site path)', T.cphCloudinary('/api/public/photo.php?p=0123.jpg') === null && T.cphCloudinary('https://example.org/upload/x.jpg') === null);

console.log('what is kept of the stored edits');
chk('the face crop and its size go; the colour fix and quality stay', JSON.stringify(T.cphKeepChain(P.chain)) === JSON.stringify(['e_improve,q_auto']));
chk('a removed background and its replacement colour stay', JSON.stringify(T.cphKeepChain(['c_fill,g_face,w_600,h_750,f_auto,q_auto:good,e_improve:30', 'e_background_removal', 'b_rgb:eceef2']))
  === JSON.stringify(['f_auto,q_auto:good,e_improve:30', 'e_background_removal', 'b_rgb:eceef2']));
chk('the photo editor’s zoom (a fractional crop) is a person’s choice and stays whole', T.cphKeepChain(['c_crop,g_face,w_0.625,h_0.625', 'c_fill,g_face,w_600,h_750'])[0] === 'c_crop,g_face,w_0.625,h_0.625');
chk('…and only the zoom counts as geometry for the face lookup', JSON.stringify(T.cphGeoChain(T.cphKeepChain(['c_crop,g_face,w_0.625,h_0.625', 'e_improve']))) === JSON.stringify(['c_crop,g_face,w_0.625,h_0.625']));

console.log('finding the face');
const F = T.cphFace(WOMAN, 0);
chk('the face is read in the stored image’s coordinates: eye midpoint and eye distance', F && Math.abs(F.cx - 354.5) < 0.01 && Math.abs(F.eyeY - 203) < 0.01 && Math.abs(F.e - Math.hypot(97, 14)) < 0.01);
const Z = T.cphFace(Object.assign({}, WOMAN, { resize: [{ x: 100, y: 50, width: 600, height: 600 }, { x_factor: 0.5, y_factor: 0.5 }, { x: 9, y: 9, width: 1, height: 1 }] }), 2);
chk('…through a zoom’s crop and scale, and not through the detector’s own steps after them', Math.abs(Z.cx - (354.5 - 100) * 0.5) < 0.01 && Math.abs(Z.eyeY - (203 - 50) * 0.5) < 0.01);
chk('no landmarks, no face', T.cphFace({ input: { width: 10, height: 10 } }, 0) === null);
const two = T.cphFace({ landmarks: [[WOMAN.landmarks[0][0], { r_eye: { x: 10, y: 10 }, l_eye: { x: 20, y: 10 } }]] }, 0);
chk('with two faces, the larger (nearer) one is the subject', Math.abs(two.cx - 354.5) < 0.01);

console.log('whole, or head and shoulders');
// A passport photo: eyes 120px apart in a 600×750 portrait — the frame is 708 tall, so it is head and shoulders.
const passport = { cx: 300, eyeY: 300, e: 120 };
chk('a passport photo is shown whole', T.cphFrame(passport, 600, 750, 54 / 37.8) === null);
// A full-length photo: eyes 40px apart in a 600×1800 picture — far more than a head and shoulders.
const full = { cx: 300, eyeY: 260, e: 40 };
const c = T.cphFrame(full, 600, 1800, 404 / 318);
chk('a full-length photo is cropped', !!c);
chk('…to the box’s shape', c && Math.abs(c.w / c.h - 404 / 318) < 0.02);
chk('…from just above the head to the upper chest', c && Math.abs(c.y - (260 - 2.3 * 40)) <= 1 && c.y + c.h >= 260 + 3.6 * 40 - 1);
chk('…centred on the face and inside the picture', c && Math.abs(c.x + c.w / 2 - 300) <= 1 && c.x >= 0 && c.x + c.w <= 600 && c.y >= 0 && c.y + c.h <= 1800);
const edge = T.cphFrame({ cx: 30, eyeY: 50, e: 40 }, 2000, 1500, 1);
chk('a face near the corner is cropped without leaving the picture', edge && edge.x === 0 && edge.y === 0);
chk('a wide scene with the person in it is cropped too', !!T.cphFrame({ cx: 900, eyeY: 400, e: 60 }, 1800, 900, 1));
chk('no face found: shown whole', T.cphFrame(null, 600, 1800, 1) === null);

console.log('the delivered URL');
const whole = T.cphCardUrl(P, 638, 446, null);
chk('shown whole: the stored edits, then padded to the box with the photo’s own edge colours',
  whole === 'https://res.cloudinary.com/ngg/image/upload/e_improve,q_auto/c_pad,w_638,h_446,b_auto:predominant_gradient,f_auto,q_auto:good/v17/ngg/headshot/abc.jpg');
chk('cropped: the crop in pixels, before the pad', T.cphCardUrl(P, 600, 600, { x: 1, y: 2, w: 300, h: 300 }).indexOf('/e_improve,q_auto/c_crop,x_1,y_2,w_300,h_300/c_pad,w_600,h_600,') !== -1);
const urls = T.cphInfoUrls(P);
chk('the face lookup asks for the landmarks only (no paid background removal re-run, no second request without a zoom)',
  urls.faces === 'https://res.cloudinary.com/ngg/image/upload/c_thumb,g_face,w_200,h_200,fl_getinfo/v17/ngg/headshot/abc.jpg' && urls.size === '' && urls.nSteps === 0);

console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (card photos)`);
process.exit(failed ? 1 : 0);
