/* tests/ids-photo-shape.test.js — the framing dialog shows each card's real photo box.
 *
 * The ID Card Studio's "Frame this photo" dialog once kept its own list of
 * shapes: "Member card" was a 0.82 portrait no card has, "Summer School" was
 * the volunteer card's 404 × 318 box, and the Summer School card's circle was
 * called "Round". A photo was framed against the wrong card. The shapes are now
 * declared beside each renderer and read from there; this holds both ends.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const chk = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const tpl = read('card-template.jsx'), other = read('page-other.jsx'), make = read('src/modules/idcards/ids-make.jsx');

/* Pull the plain-JS pieces out of the JSX files and run them together. */
const grab = (src, re, what) => { const m = src.match(re); if (!m) throw new Error('not found: ' + what); return m[0]; };
const fnSrc = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('unbalanced: ' + name);
};
const code = [
  grab(tpl, /const NGGC_PHOTO_MM = \{[^}]*\};/, 'NGGC_PHOTO_MM'), fnSrc(tpl, 'tplPhotoBox'),
  grab(other, /const CARD_FRONT_PHOTO = \{[^}]*\};/, 'CARD_FRONT_PHOTO'), grab(other, /const VOL_CARD_PHOTO = \{[^}]*\};/, 'VOL_CARD_PHOTO'),
  'const IDS_KINDS = { member: "Member", summer: "Summer School", volunteer: "Volunteer", afrovanguard: "Afrovanguard" };',
  fnSrc(make, 'idsPhotoShape'), fnSrc(make, 'idsFrameShapes'),
  'Object.assign(this, { NGGC_PHOTO_MM, VOL_CARD_PHOTO, idsPhotoShape, idsFrameShapes, tplPhotoBox });',
].join('\n');
const T = {}; vm.createContext(T); vm.runInContext(code, T);

console.log('Each card type frames against the box it prints');
const near = (a, b) => Math.abs(a - b) < 0.001;
const m = T.idsPhotoShape('member', null), s = T.idsPhotoShape('summer', null), v = T.idsPhotoShape('volunteer', null);
chk('the member card is its full-bleed 54 × 37.8 mm photo: landscape, not a portrait', near(m.ar, 54 / 37.8) && m.ar > 1 && !m.round);
chk('the Summer School card is its circle', s.round === true && s.ar === 1);
chk('the volunteer card is its 404 × 318 box', near(v.ar, 404 / 318) && !v.round);
chk('no two card types share a shape', new Set([m, s, v].map(x => x.ar.toFixed(3) + x.round)).size === 3);

const round = { published: { elements: [{ type: 'image', src: '{{photo}}', w: 320, h: 320, radius: 160 }] } };
const tall = { published: { elements: [{ type: 'image', src: '{{ photo }}', w: 300, h: 400, radius: 10 }, { type: 'image', src: '{{logo}}', w: 10, h: 10 }] } };
const hidden = { published: { elements: [{ type: 'image', src: '{{photo}}', w: 300, h: 400, hidden: true }] } };
chk('a type with an assigned design frames against that design’s photo box', near(T.idsPhotoShape('member', tall).ar, 0.75) && T.idsPhotoShape('member', tall).design === true);
chk('…a round one is round', T.idsPhotoShape('volunteer', round).round === true);
chk('…a hidden photo layer is not the box, so the standard card’s is used', near(T.idsPhotoShape('member', hidden).ar, 54 / 37.8));

const f = T.idsFrameShapes({ kind: 'volunteer' }, k => (k === 'member' ? tall : null));
chk('the person’s own card comes first, marked, and named for what it is', f[0].own === true && f[0].key === 'volunteer' && f[0].label === 'Volunteer card' && near(f[0].ar, 404 / 318));
chk('…then the other cards, each under its own name and shape', f.length === 3 && f[1].label === 'Member card · its design' && f[2].label === 'Summer School card' && f[2].round);
chk('a card type with no studio photo (Afrovanguard) shows the standard cards only, none marked as its own', T.idsFrameShapes({ kind: 'afrovanguard' }, null).every(x => !x.own));

console.log('The renderers print the shapes they declare');
chk('the member card draws its photo from NGGC_PHOTO_MM', /photoW: NGGC_PHOTO_MM\.w, photoH: NGGC_PHOTO_MM\.h/.test(tpl));
chk('the volunteer card scales its photo on VOL_CARD_PHOTO’s aspect', /phH \* VOL_CARD_PHOTO\.w \/ VOL_CARD_PHOTO\.h/.test(other));
chk('the Summer School card’s photo is the round ring', /<CardCentreRing centre=\{centre\} size=\{photoD\} px=\{px\} radius="50%">/.test(other));
chk('the dialog keeps no shape list of its own', !/IDS_FRAME_SHAPES/.test(make) && /idsFrameShapes\(rec, designOfKind\)/.test(make));

console.log('\n' + (fail ? '❌ FAIL: ' + pass + ' passed, ' + fail + ' failed' : '✅ PASS: ' + pass + ' passed, 0 failed') + ' (ID photo shapes)');
process.exit(fail ? 1 : 0);
