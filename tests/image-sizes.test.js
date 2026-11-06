#!/usr/bin/env node
/* ============================================================================
   Image sizes: the browser's registry IS the server's.

   One address function with named sizes, in two languages
   (api/_lib/domain/image-sizes.php img_url, components.jsx imgUrl). They are
   duplicated because the browser needs the names before any request answers,
   so this pins them: the same size names, the same pixels, the same Cloudinary
   strings; every edit the browser carries equal to the server's; and the two
   functions giving the same address for every kind of URL.

   Run:  node tests/image-sizes.test.js     (needs php on the PATH)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

const BASE = 'https://files.example.org';
const URLS = [
  'https://res.cloudinary.com/ngg/image/upload/v17/ngg/headshot/abc.jpg',
  'https://res.cloudinary.com/ngg/image/upload/c_fill,g_face,w_600,h_750/e_background_removal/v17/ngg/a.jpg',
  'https://res.cloudinary.com/ngg/image/upload/ngg/no-version.jpg',
  'https://res.cloudinary.com/ngg/video/upload/v3/ngg/clip.mp4',
  '/api/public/photo.php?p=0123456789abcdef0123456789abcdef.jpg',
  '/api/public/photo.php?p=0123456789abcdef0123456789abcdef.png&s=thumb',
  'https://ngg.example.org/api/public/photo.php?p=0123456789abcdef0123456789abcdef.webp',
  BASE + '/ngg/u1/photo-1.jpg',
  BASE + '/ngg/u1/clip.mp4',
  BASE + '/ngg/../escape.jpg',
  'https://elsewhere.example.org/a.jpg',
  'data:image/png;base64,AAAA',
  '',
];
const SIZES = ['avatar', 'thumb', 'feed', 'wide', 'print', 'nonsense'];

// The server's registry and answers, from PHP itself.
const php = `
require ${JSON.stringify(path.join(root, 'api/_lib/object-store.php'))};
$GLOBALS['CONFIG'] = ['storage' => ['public_base' => ${JSON.stringify(BASE)}]];
require ${JSON.stringify(path.join(root, 'api/_lib/domain/image-sizes.php'))};
$urls = json_decode(${JSON.stringify(JSON.stringify(URLS))}, true);
$sizes = json_decode(${JSON.stringify(JSON.stringify(SIZES))}, true);
$out = [];
foreach ($urls as $u) foreach ($sizes as $s) $out[] = img_url($u, $s);
echo json_encode(['sizes' => IMG_SIZES, 'edits' => IMG_EDITS, 'urls' => $out,
  'edit' => [img_edit('card_face', ['g' => 'north']), img_edit('print_pad', ['w' => 404, 'h' => 512])]], JSON_UNESCAPED_SLASHES);
`;
const S = JSON.parse(execFileSync('php', ['-r', php], { encoding: 'utf8' }));

// The browser's, from components.jsx — the block between the registry and its first use.
const comp = fs.readFileSync(path.join(root, 'components.jsx'), 'utf8');
const a = comp.indexOf('const IMG_SIZES = {'), b = comp.indexOf('function cldEnhance(');
const T = { window: {} };
vm.createContext(T);
vm.runInContext(comp.slice(a, b) + '\n;Object.assign(this, { IMG_SIZES, IMG_EDITS, imgUrl, imgEdit, imgSizeFor });', T);

console.log('the registry');
chk('the same size names, in the same order', JSON.stringify(Object.keys(T.IMG_SIZES)) === JSON.stringify(Object.keys(S.sizes)));
for (const k of Object.keys(S.sizes)) {
  chk(k + ': the same long edge and the same Cloudinary string', T.IMG_SIZES[k] && T.IMG_SIZES[k].px === S.sizes[k].px && T.IMG_SIZES[k].cld === S.sizes[k].cld);
}
chk('every edit the browser carries is the server’s, character for character',
  Object.keys(T.IMG_EDITS).length > 0 && Object.keys(T.IMG_EDITS).every(k => S.edits[k] === T.IMG_EDITS[k]));
chk('…and filling one in gives the same transform', T.imgEdit('card_face', { g: 'north' }) === S.edit[0] && T.imgEdit('print_pad', { w: 404, h: 512 }) === S.edit[1]);
chk('the sizes are never a new width per screen: a box maps to one of the four display sizes',
  T.imgSizeFor(40) === 'avatar' && T.imgSizeFor(128) === 'avatar' && T.imgSizeFor(129) === 'thumb' && T.imgSizeFor(700) === 'wide' && T.imgSizeFor(5000) === 'wide');

console.log('one address, both sides');
let i = 0, same = 0;
const diff = [];
for (const u of URLS) for (const s of SIZES) {
  const js = T.imgUrl(u, s, BASE), want = S.urls[i++];
  if (js === want) same++; else diff.push(u + ' @' + s + ' → js ' + js + ' | php ' + want);
}
chk('imgUrl and img_url agree on every URL kind at every size (' + same + '/' + URLS.length * SIZES.length + ')', diff.length === 0);
if (diff.length) console.error(diff.slice(0, 6).join('\n'));
chk('Cloudinary: the size goes after the edits already in the URL, before the version',
  T.imgUrl(URLS[1], 'avatar', BASE) === 'https://res.cloudinary.com/ngg/image/upload/c_fill,g_face,w_600,h_750/e_background_removal/f_auto,q_auto,w_128,c_limit/v17/ngg/a.jpg');
chk('a video on Cloudinary gets its one rendition, whatever the size', T.imgUrl(URLS[3], 'thumb', BASE).indexOf('/upload/f_auto,q_auto:eco,w_1280,c_limit/v3/') > 0);
chk('the photo store: &s=<size>, replacing one already there', T.imgUrl(URLS[5], 'feed', BASE) === '/api/public/photo.php?p=0123456789abcdef0123456789abcdef.png&s=feed');
chk('our bucket: through photo.php with the URL and the size', T.imgUrl(URLS[7], 'thumb', BASE) === '/api/public/photo.php?u=' + encodeURIComponent(URLS[7]) + '&s=thumb');
chk('…but a bucket video, a climbing key, a stranger’s URL or a data URL is left alone',
  [8, 9, 10, 11].every(k => T.imgUrl(URLS[k], 'thumb', BASE) === URLS[k]));
chk('an unknown size is the URL unchanged', T.imgUrl(URLS[4], 'nonsense', BASE) === URLS[4]);
chk('with no bucket address known yet, a bucket URL is shown as it is (the original)', T.imgUrl(URLS[7], 'thumb', '') === URLS[7]);

console.log('');
console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (image sizes)');
process.exit(failed ? 1 : 0);
