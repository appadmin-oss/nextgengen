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
  whole === 'https://res.cloudinary.com/ngg/image/upload/e_improve,q_auto/c_pad,w_638,h_446,b_auto:predominant_gradient,f_jpg,q_auto:good/v17/ngg/headshot/abc.jpg');
chk('cropped: the crop in pixels, before the pad', T.cphCardUrl(P, 600, 600, { x: 1, y: 2, w: 300, h: 300 }).indexOf('/e_improve,q_auto/c_crop,x_1,y_2,w_300,h_300/c_pad,w_600,h_600,') !== -1);
const urls = T.cphInfoUrls(P);
chk('the face lookup asks for the landmarks only (no paid background removal re-run, no second request without a zoom)',
  urls.faces === 'https://res.cloudinary.com/ngg/image/upload/c_thumb,g_face,w_200,h_200,fl_getinfo/v17/ngg/headshot/abc.jpg' && urls.size === '' && urls.nSteps === 0);

console.log('never stretched');
// The drawn width in box pixels, and the height the browser gives it at the picture's own aspect.
const drawn = (g, natW, natH, boxW) => ({ w: g.width / 100 * boxW, h: g.width / 100 * boxW * natH / natW });
for (const [nw, nh, bw, bh] of [[600, 750, 404, 318], [1200, 400, 300, 300], [300, 900, 638, 446], [1000, 1000, 54, 85]]) {
  const c = T.cphPlace(nw, nh, bw, bh, null, 'cover'), d = drawn(c, nw, nh, bw);
  chk(`cover ${nw}×${nh} in ${bw}×${bh}: fills the box with no gap and keeps the picture's shape`,
    d.w >= bw - 0.01 && d.h >= bh - 0.01 && c.left <= 0.0001 && c.top <= 0.0001 && c.left / 100 * bw + d.w >= bw - 0.01 && c.top / 100 * bh + d.h >= bh - 0.01);
  const k = T.cphPlace(nw, nh, bw, bh, null, 'contain'), e = drawn(k, nw, nh, bw);
  chk(`contain ${nw}×${nh} in ${bw}×${bh}: all of it inside the box, centred`,
    e.w <= bw + 0.01 && e.h <= bh + 0.01 && (Math.abs(e.w - bw) < 0.01 || Math.abs(e.h - bh) < 0.01)
    && Math.abs(k.left / 100 * bw + e.w / 2 - bw / 2) < 0.01 && Math.abs(k.top / 100 * bh + e.h / 2 - bh / 2) < 0.01);
}
const reg = T.cphPlace(600, 1800, 404, 318, { x: 100, y: 120, w: 400, h: 315 }, 'cover'), rd = drawn(reg, 600, 1800, 404);
chk('a head-and-shoulders region fills the box: its top-left at the box’s corner, scaled by the region, not the picture',
  Math.abs(rd.w - 600 * 404 / 400) < 0.5 && Math.abs(reg.left / 100 * 404 + 100 * 404 / 400) < 0.5 && Math.abs(reg.top / 100 * 318 + 120 * 404 / 400) < 0.5);
chk('nothing measured yet: the box, never a guess', JSON.stringify(T.cphPlace(0, 0, 10, 10, null, 'cover')) === JSON.stringify({ left: 0, top: 0, width: 100, height: 100 }));

console.log('the browser’s own face detector');
const fb = T.cphFaceFromDetector([{ boundingBox: { x: 100, y: 200, width: 100, height: 120 } }, { boundingBox: { x: 400, y: 50, width: 200, height: 240 } }]);
chk('a bare bounding box: the larger face, eyes 40% down it, 42% of its width apart', fb && fb.cx === 500 && Math.abs(fb.eyeY - 146) < 0.01 && Math.abs(fb.e - 84) < 0.01);
const fl = T.cphFaceFromDetector([{ boundingBox: { x: 0, y: 0, width: 100, height: 100 },
  landmarks: [{ type: 'eye', locations: [{ x: 30, y: 40 }] }, { type: 'eye', locations: [{ x: 70, y: 44 }] }, { type: 'mouth', locations: [{ x: 50, y: 80 }] }] }]);
chk('with landmarks, the eyes themselves', fl && fl.cx === 50 && fl.eyeY === 42 && Math.abs(fl.e - Math.hypot(40, 4)) < 0.01);
chk('no faces: nothing', T.cphFaceFromDetector([]) === null && T.cphFaceFromDetector(null) === null);
const det = T.cphFrame(fb, 1000, 2400, 404 / 318);
chk('a full-length photo framed by the browser’s detector is cropped to the head and shoulders', !!det && det.y < 146 && det.y + det.h > 146);

console.log('framed from Gemini’s measurement');
// A half-length phone photo, 1000 × 1500: head from y 300 to 520 (crown to chin), x 400–580, eyes at y 420.
const G = { subject: true, head: { x0: 0.40, y0: 0.20, x1: 0.58, y1: 520 / 1500 }, face: { x0: 0.42, y0: 0.24, x1: 0.56, y1: 520 / 1500 },
  eyes: [{ x: 0.45, y: 0.28 }, { x: 0.53, y: 0.28 }] };
const box = 404 / 318;
const f1 = T.cphFrameAi(G, 1000, 1500, box, null);
const headH = 520 - 300;
chk('the head takes its share of the frame, with room above the hair', f1 && Math.abs(headH / f1.h - 0.56) < 0.02 && Math.abs((300 - f1.y) / f1.h - 0.11) < 0.02);
chk('…at the box’s exact shape — nothing to stretch', f1 && Math.abs(f1.w / f1.h - box) < 0.01);
chk('…centred between the eyes', f1 && Math.abs(f1.x + f1.w / 2 - 490) <= 1);
chk('…and the whole head is in it', f1 && f1.x <= 400 && f1.x + f1.w >= 580 && f1.y <= 300 && f1.y + f1.h >= 520);
const tight = T.cphFrameAi({ subject: true, head: { x0: 0.1, y0: 0.02, x1: 0.9, y1: 0.85 }, face: { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.85 } }, 600, 750, 54 / 85 * 1.6, null);
chk('a passport photo tighter than the ideal frame: the frame shrinks to fit inside it, keeping its shape', tight && tight.x >= 0 && tight.y >= 0 && tight.x + tight.w <= 600 && tight.y + tight.h <= 750 && Math.abs(tight.w / tight.h - 54 / 85 * 1.6) < 0.02);
const edgeHead = T.cphFrameAi({ subject: true, head: { x0: 0.0, y0: 0.0, x1: 0.2, y1: 0.15 }, face: { x0: 0.02, y0: 0.03, x1: 0.18, y1: 0.15 } }, 1000, 1500, 1, null);
chk('a head at the corner of the photo: the frame stays inside the picture', edgeHead && edgeHead.x === 0 && edgeHead.y === 0);
const zin = T.cphFrameAi(G, 1000, 1500, box, { zoom: 2 }), zout = T.cphFrameAi(G, 1000, 1500, box, { zoom: 0.6 });
chk('a person’s zoom: in makes the head larger, out shows more — and neither ever cuts the head', zin.h < f1.h && zout.h > f1.h && zin.y <= 300 && zin.y + zin.h >= 520 && zin.x <= 400 && zin.x + zin.w >= 580);
const moved = T.cphFrameAi(G, 1000, 1500, box, { dx: 0.2, dy: 0.1 });
chk('…and a move shifts the frame, still around the head', moved.x > f1.x && moved.x <= 400 && moved.y + moved.h >= 520);
chk('no subject, or no measurement: nothing — the card falls back to the landmarks or the whole photo', T.cphFrameAi({ subject: false }, 100, 100, 1, null) === null && T.cphFrameAi(null, 100, 100, 1, null) === null);

console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (card photos)`);
process.exit(failed ? 1 : 0);
