#!/usr/bin/env node
/* nggImg (photos.js): a photo in the bucket whose sizes have been made (`?nv=1`)
   is served as its size FROM THE BUCKET — never through Cloudinary on a view; a
   photo stored in Cloudinary gets its size after any edit; anything else is left
   exactly as it was. nggImgFetchParts is the print-only fetch base.
   Run: node tests/img-delivery.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let passed = 0, failed = 0;
const chk = (l, c) => { if (c) { passed++; console.log('  ✓ ' + l); } else { failed++; console.log('  ✗ FAIL: ' + l); } };

function load(cfg) {
  const store = { ngg_img: cfg ? JSON.stringify(cfg) : null };
  const ctx = { console, URL, encodeURIComponent, JSON, location: { origin: 'https://next.afrovanguard.org.ng' },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'photos.js'), 'utf8'), ctx);
  return ctx;
}
const w = load({ cloud: 'nggcloud', hosts: ['pub-x.r2.dev', 'next.afrovanguard.org.ng'] });
const img = w.nggImg;
const bucket = 'https://pub-x.r2.dev/ngg/photos/abc.jpg';
chk('an optimised bucket photo is served as its size, from the bucket', img(bucket + '?nv=1', 'headshot') === 'https://pub-x.r2.dev/ngg/photos/abc__headshot.webp');
chk('…for every named size', Object.keys(w.NGG_IMG_SIZES).every(s => img(bucket + '?nv=1', s) === 'https://pub-x.r2.dev/ngg/photos/abc__' + s + '.webp'));
chk('a view never goes through Cloudinary for a bucket photo', !/cloudinary/.test(img(bucket + '?nv=1', 'avatar')) && !/cloudinary/.test(img(bucket, 'avatar')));
chk('a bucket photo whose sizes are not made yet is shown as it is', img(bucket, 'headshot') === bucket);
chk('an unknown size falls back to card, never to nothing', img(bucket + '?nv=1', 'nope') === 'https://pub-x.r2.dev/ngg/photos/abc__card.webp');
const cl = 'https://res.cloudinary.com/acc/image/upload/c_fill,g_face,w_600,h_750,e_improve:30/v17/ngg/headshot/p1.jpg';
chk('a photo stored in Cloudinary keeps its edit and is sized after it, before the version',
  img(cl, 'face') === 'https://res.cloudinary.com/acc/image/upload/c_fill,g_face,w_600,h_750,e_improve:30/f_auto,q_auto,c_fill,g_face,w_240,h_240/v17/ngg/headshot/p1.jpg');
chk('another site, data: and blob: are left alone', img('https://evil.example/x.jpg', 'card') === 'https://evil.example/x.jpg' && img('data:image/png;base64,AAA', 'card') === 'data:image/png;base64,AAA' && img('blob:x', 'card') === 'blob:x');
const fp = w.nggImgFetchParts(bucket + '?nv=1');
chk('for PRINTING, a bucket photo splits into a Cloudinary fetch base and its address', fp && fp.prefix === 'https://res.cloudinary.com/nggcloud/image/fetch/' && fp.rest === encodeURIComponent(bucket));
chk('…but not a Cloudinary or foreign photo, and not with no cloud named', w.nggImgFetchParts(cl) === null && w.nggImgFetchParts('https://evil.example/x.jpg') === null && load(null).nggImgFetchParts(bucket) === null);
console.log('\n' + (failed ? '❌ FAIL: ' + passed + ' passed, ' + failed + ' failed' : '✅ PASS: ' + passed + ' passed, 0 failed') + ' (image delivery)');
process.exit(failed ? 1 : 0);
