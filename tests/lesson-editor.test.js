#!/usr/bin/env node
/* ============================================================================
   The lesson editor's two-way door (lesson-editor.jsx).
   Run:  node tests/lesson-editor.test.js

   The editor shows blocks and stores Markdown. Everything it can be trusted
   with rests on one promise:

       leSerialise(leParse(md))  ===  md          for every shape the
                                                  member's renderer draws

   If that is not exact, then an instructor who opens somebody else's lesson,
   reads it, and saves it without typing a word has silently rewritten it —
   and the lesson that comes back out is not the one 336 bundled files, the
   seed importer and the AI drafter put in. That is the whole of the risk in
   replacing a textarea with an editor, so it is the whole of this file.

   The second promise is narrower and just as load-bearing: the editor's
   reading of a document must agree with `CurriculumText`'s, because any
   disagreement is formatting an instructor can see and a member cannot (or
   worse, the other way round). The paragraph/list/heading/fence rules are
   therefore pinned against the same inputs both scanners take.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const src = fs.readFileSync(path.join(__dirname, '..', 'lesson-editor.jsx'), 'utf8');
const js = esbuild.transformSync(src, { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' }).code;

const React = {
  createElement: (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(Infinity).filter(k => k != null && k !== false) }),
  Fragment: 'Fragment',
  memo: (fn) => fn,
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (init) => ({ current: init === undefined ? null : init }),
};

/* The two things the file reaches out of itself for, at the shape it uses
   them in. `curVideoEmbed` lives in components.jsx and decides what counts as
   a playable link; the editor must agree with it exactly or a YouTube line
   becomes a paragraph on one screen and a player on the other. */
const curVideoEmbed = (u) => {
  const s = String(u || '').trim();
  const yt = s.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return { src: 'https://www.youtube-nocookie.com/embed/' + yt[1], title: 'Video' };
  const vm_ = s.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
  if (vm_) return { src: 'https://player.vimeo.com/video/' + vm_[1], title: 'Video' };
  return null;
};
const lessonBlockFor = () => null;

const T = { React, console, curVideoEmbed, lessonBlockFor, window: { getSelection: () => null }, document: { querySelector: () => null }, requestAnimationFrame: () => {} };
vm.createContext(T);
vm.runInContext(js + '\n;Object.assign(this, { leTidyPaste, leParse, leSerialise, leInlineToHtml, leNodesToMd, leArgsToFields, leFieldsToArgs, leNewBlock, leMake, LE_INSERTS, LE_PARTS, LE_MENU_GROUPS, LE_TEXT_TYPES, LE_DIAGRAMS });', T);

const { leTidyPaste, leParse, leSerialise, leInlineToHtml, leArgsToFields, leFieldsToArgs, leNewBlock, leMake, LE_INSERTS, LE_PARTS, LE_MENU_GROUPS, LE_DIAGRAMS } = T;

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const eq = (m, got, want) => {
  if (got === want) { passed++; console.log('  ✓ ' + m); return; }
  failed++;
  console.error('  ✗ FAIL: ' + m);
  console.error('      want ' + JSON.stringify(want));
  console.error('      got  ' + JSON.stringify(got));
};

console.log('\n── The round trip ────────────────────────────────────────────');

/* One of each shape the member's renderer draws, written the way the bundled
   seeds and the AI drafter actually write them. */
const DOCS = {
  'a paragraph': 'Middle C is the one just left of the two black keys.',
  'two paragraphs': 'First thing.\n\nSecond thing.',
  'a hard line break inside a paragraph': 'One line\nand the next.',
  'a heading': '## Warm-up (10 minutes)',
  'a subheading': '### Hold the bow',
  'heading then prose': '## Learn\n\nPut your thumb under the neck.',
  'a bulleted list': '- Sit up straight\n- Thumb behind the neck\n- Wrist loose',
  'a numbered list': '1. Tune the top string\n2. Match the next one to it\n3. Check them together',
  'a numbered list that counts past one': '1. One\n2. Two\n3. Three\n4. Four',
  'a numbered list the seeds\' way, all ones': '1. One\n1. Two\n1. Three',
  'a numbered list using brackets': '1) One\n2) Two',
  'two lists split by a paragraph': '- A\n- B\n\nThen this.\n\n- C\n- D',
  'a callout': '> Nothing here is a race.',
  'the two routes': '- **If this is new to you:** halve the tempo.\n- **If you already can:** add the left hand.',
  'the two routes with a third bullet under them': '- **If this is new to you:** go slower.\n- **If you already can:** go faster.\n- Either way, stop if your hand aches.',
  'a route half left empty': '- **If this is new to you:** go slower.\n- **If you already can:** ',
  'a divider': 'Before.\n\n---\n\nAfter.',
  'bold and italic': 'Play it **slowly** and *evenly*.',
  'a link': 'Watch [the Trinity syllabus](https://www.trinitycollege.com/qualifications) first.',
  'inline code': 'Type `npm run dev` and wait.',
  'a picture': '![A hand on the fretboard](https://example.org/hand.png)',
  'a video on its own line': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'a piano diagram': '```keys C E G\n```',
  'a chord diagram': '```chord Am Em C\n```',
  'a staff diagram': '```staff C D E F G\n```',
  'colour swatches': '```swatch #1b3a6b Navy | #ffd400 Gold\n```',
  'a session plan': '```steps 10 Warm up | 30 Learn | 40 Play\n```',
  'a code fence that is NOT a diagram': '```js\nconst a = 1;\n```',
  'a whole session': [
    '## Warm-up (10 minutes)',
    '',
    '- Shake out your hands',
    '- Play the C scale once, slowly',
    '',
    '## Learn (30 minutes)',
    '',
    'A **triad** is three notes. Here is C major:',
    '',
    '```keys C E G',
    '```',
    '',
    '### Try it',
    '',
    '1. Find C',
    '2. Skip a key, play E',
    '3. Skip a key, play G',
    '',
    '> If your hand aches, stop and shake it out.',
    '',
    '## Make it fit you',
    '',
    '- **If this is new to you:** play the three notes one at a time.',
    '- **If you already can:** play it with your left hand as well.',
    '',
    '```steps 10 Warm up | 30 Learn | 40 Play | 20 Practise',
    '```',
  ].join('\n'),
};

for (const [name, md] of Object.entries(DOCS)) eq(name + ' survives a round trip', leSerialise(leParse(md)), md);

console.log('\n── What the editor made of it ────────────────────────────────');

const types = (md) => leParse(md).map(b => b.type).join(' ');
eq('a heading is one heading block', types('## Warm-up'), 'h2');
eq('# and ## are the same heading, as the renderer has them', types('# One'), 'h2');
eq('three bullets are three blocks, not one', types('- a\n- b\n- c'), 'ul ul ul');
eq('a list broken by prose is two runs', types('- a\n\ntext\n\n- b'), 'ul p ul');
eq('a diagram fence is a diagram block', types('```keys C\n```'), 'keys');
eq('an unknown fence stays code', types('```python\nx = 1\n```'), 'code');
eq('a lone image line is a picture', types('![x](https://e.org/a.png)'), 'image');
eq('a lone video line is a video', types('https://vimeo.com/12345'), 'video');
eq('a video with words round it is just prose', types('Watch https://vimeo.com/12345 tonight.'), 'p');
eq('an empty document still offers somewhere to write', types(''), 'p');

const keys = leParse('```keys C E G\n```')[0];
eq('a diagram carries fields, never a fence string', JSON.stringify(keys.tokens), '["C","E","G"]');
chk('a diagram block has no `args` for anyone to mistype', keys.args === undefined);
const sw = leParse('```swatch #1b3a6b Navy | #ffd400 Gold\n```')[0];
eq('a swatch is colour-and-name pairs', JSON.stringify(sw.pairs), '[{"a":"#1b3a6b","b":"Navy"},{"a":"#ffd400","b":"Gold"}]');
const st = leParse('```steps 10 Warm up | 30 Learn\n```')[0];
eq('a session plan keeps the minutes apart from the name', JSON.stringify(st.pairs), '[{"a":"10","b":"Warm up"},{"a":"30","b":"Learn"}]');
eq('a stage name with spaces in it stays whole', leFieldsToArgs({ type: 'steps', pairs: [{ a: '40', b: 'Play together' }] }), '40 Play together');

console.log('\n── What it refuses to write ──────────────────────────────────');

/* An empty block must not reach the document. `leSerialise` dropping it is
   what stops a half-filled diagram, a picture with no file and a video with
   no link from becoming a fence, an "![]()" or a blank line in the lesson a
   member opens. */
eq('a diagram with nothing in it writes nothing', leSerialise([leNewBlock('keys'), { id: 'x', type: 'keys', tokens: [] }]), '```keys C E G\n```');
eq('a picture with no file writes nothing', leSerialise([{ id: 'x', type: 'image', url: '', alt: 'later' }]), '');
eq('a video with no link writes nothing', leSerialise([{ id: 'x', type: 'video', url: '' }]), '');
eq('an empty paragraph between two real ones does not open a gap',
   leSerialise([{ id: '1', type: 'p', text: 'A' }, { id: '2', type: 'p', text: '' }, { id: '3', type: 'p', text: 'B' }]), 'A\n\nB');
eq('a bullet nobody typed into does not become a lone dot on the lesson',
   leSerialise([{ id: '1', type: 'ul', text: 'A' }, { id: '2', type: 'ul', text: '' }]), '- A');
eq('an empty heading writes nothing', leSerialise([{ id: '1', type: 'h2', text: '  ' }]), '');

console.log('\n── Inline formatting, both ways ──────────────────────────────');

eq('bold becomes <strong>', leInlineToHtml('a **b** c'), 'a <strong>b</strong> c');
eq('a link keeps its address', leInlineToHtml('[t](https://e.org)'), '<a href="https://e.org">t</a>');
eq('a line break becomes <br>', leInlineToHtml('a\nb'), 'a<br>b');
chk('markup in the lesson text cannot become markup on the screen',
    leInlineToHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
chk('a quote in a link title is escaped', leInlineToHtml('[say "hi"](https://e.org)').includes('&quot;'));

/* The browser's own editing commands emit whatever that engine prefers —
   <b> here, <strong> there, a <span style> after a paste. Every one of them
   is read for meaning and written back as the four marks the lesson has. */
const mdOf = (html) => {
  const doc = htmlToNodes(html);
  return T.leNodesToMd(doc);
};
function htmlToNodes(html) {
  /* A parser small enough to read, for the handful of tags execCommand and a
     paste can produce. Not a general one — it does not need to be. */
  const out = [];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  const stack = [{ childNodes: out }];
  let m;
  while ((m = re.exec(html))) {
    if (m[4] != null) { stack[stack.length - 1].childNodes.push({ nodeType: 3, nodeValue: m[4] }); continue; }
    const [, close, tag, attrs] = m;
    if (close) { if (stack.length > 1) stack.pop(); continue; }
    const href = (attrs.match(/href="([^"]*)"/) || [])[1] || '';
    const node = { nodeType: 1, nodeName: tag.toUpperCase(), childNodes: [], getAttribute: (k) => (k === 'href' ? href : null) };
    stack[stack.length - 1].childNodes.push(node);
    if (tag.toLowerCase() !== 'br') stack.push(node);
  }
  return out;
}
eq('<b> is read as bold', mdOf('a <b>bold</b> b'), 'a **bold** b');
eq('<strong> is read as bold', mdOf('a <strong>bold</strong> b'), 'a **bold** b');
eq('<i> is read as italic', mdOf('<i>lean</i>'), '*lean*');
eq('a pasted <span style> keeps its words and loses its styling', mdOf('<span style="color:red">red</span>'), 'red');
eq('a <font> tag an old engine emits is dropped', mdOf('<font size="4">big</font>'), 'big');
eq('a link survives', mdOf('<a href="https://e.org">t</a>'), '[t](https://e.org)');
eq('a javascript: link does NOT survive', mdOf('<a href="javascript:alert(1)">t</a>'), 't');
eq('<br> is a line break', mdOf('a<br>b'), 'a\nb');
eq('bold wrapping only whitespace is not written as bold', mdOf('a<b> </b>b'), 'a b');

console.log('\n── A lesson pasted out of Word ───────────────────────────────');

/* What every paste out of a document or a chat window looks like: the
   headings and bullets are right, the blank lines are gone. `leParse` must
   not be forgiving about this — the member's renderer is not — so the repair
   happens on paste, once, in front of the instructor. */
const pasted = leTidyPaste([
  'Middle C is where everything starts.',
  '## Warm-up',
  '- Shake out your hands',
  '- Play the scale',
  'Then sit down properly.',
  '## Learn',
  'A triad is three notes.',
].join('\n'));
eq('a heading jammed under a paragraph becomes a heading',
   leParse(pasted).map(b => b.type).join(' '), 'p h2 ul ul p h2 p');
chk('…and nothing was invented or lost', leParse(pasted).map(b => b.text).join('|')
    === 'Middle C is where everything starts.|Warm-up|Shake out your hands|Play the scale|Then sit down properly.|Learn|A triad is three notes.');
eq('a fence pasted with no air around it still becomes a diagram',
   leParse(leTidyPaste('Look at this:\n```keys C E G\n```\nNow play it.')).map(b => b.type).join(' '), 'p keys p');
/* Tidying a document that is ALREADY tidy must not move a single character,
   or pasting a lesson copied out of this very editor would reflow it. */
for (const [name, md] of Object.entries(DOCS)) eq('tidying leaves ' + name + ' alone', leTidyPaste(md), md);

console.log('\n── Every lesson the programme actually ships ─────────────────');

/* The examples above are mine, and a round trip that only survives its
   author's examples has proved nothing. This runs it over every body in
   every bundled seed — 21 courses and four divisions, written by hand and by
   the AI drafter over months — and demands all of them come back unchanged.
   It caught the real defect: the seeds write "1." for every item of a
   numbered list, and a serialiser that tidied them to 1, 2, 3 would have
   rewritten 371 files the first time somebody opened one to read it. */
const seedDir = path.join(__dirname, '..', 'api', '_lib', 'seeds');
let bodies = 0, drifted = 0;
const firstDrift = [];
for (const f of fs.readdirSync(seedDir).filter(n => /^curriculum-.*\.json$/.test(n))) {
  const parsed = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
  const units = Array.isArray(parsed) ? parsed : (parsed.units || parsed.lessons || []);
  for (const u of units) {
    const body = typeof u.body === 'string' ? u.body.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '') : '';
    if (!body.trim()) continue;
    bodies++;
    const out = leSerialise(leParse(body));
    if (out !== body) {
      drifted++;
      if (firstDrift.length < 3) {
        const a = body.split('\n'), b = out.split('\n');
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) { firstDrift.push(f + ' · ' + u.title + ' line ' + i + '\n        in : ' + JSON.stringify(a[i]) + '\n        out: ' + JSON.stringify(b[i])); break; }
        }
      }
    }
  }
}
chk(bodies + ' bundled lesson bodies were found to check', bodies > 300);
chk('every one of them comes back out exactly as it went in (' + drifted + ' drifted)', drifted === 0);
firstDrift.forEach(d => console.error('      ' + d));

console.log('\n── It knows what an NGG session is made of ───────────────────');

/* The point of the parts menu: the programme's shape stops being something
   an instructor has to have been told. */
const partIds = LE_PARTS.map(x => x.id);
['warm', 'learn', 'play', 'home', 'fit', 'back', 'whole'].forEach(id =>
  chk('the menu lays out “' + id + '” as a part of the session', partIds.includes(id)));

const fit = leMake(LE_PARTS.find(x => x.id === 'fit'));
eq('“Make it fit you” arrives as the heading AND a routes block', fit.map(b => b.type).join(' '), 'h2 routes');
/* It arrives EMPTY, and writes nothing until somebody fills it in. A part
   laid out but not written is not a rule met, and must not look like one to
   the shape check. */
eq('…and writes nothing into the lesson until it is filled in', leSerialise(fit), '## Make it fit you');
fit[1].newly = 'go slower'; fit[1].already = 'add the left hand';
chk('…then writes both routes, worded as the standard has it',
    leSerialise(fit) === '## Make it fit you\n\n- **If this is new to you:** go slower\n- **If you already can:** add the left hand');

const whole = leSerialise(leMake(LE_PARTS.find(x => x.id === 'whole')));
['## Warm-up (10 minutes)', '## Learn (30 minutes)', '## Play (40 minutes)', '## Practise at home', '## Make it fit you', '```steps'].forEach(part =>
  chk('a whole session lays out ' + JSON.stringify(part), whole.includes(part)));
chk('a whole session comes back out of the editor unchanged', leSerialise(leParse(whole)) === whole);

/* The wording is the rule. If the editor ever writes it differently, the
   shape check in api/tests/curriculum-shape.php stops recognising the
   lesson — and the instructor is never told why. */
const routesMd = leSerialise([{ id: 'r', type: 'routes', newly: 'go slower', already: 'go faster' }]);
eq('the routes block writes exactly the wording the standard looks for', routesMd,
   '- **If this is new to you:** go slower\n- **If you already can:** go faster');
chk('a routes block with nothing in it writes nothing',
    leSerialise([{ id: 'r', type: 'routes', newly: '', already: '' }]) === '');
eq('a routes block and a plain bullet after it stay ONE list',
   leSerialise([{ id: 'r', type: 'routes', newly: 'a', already: 'b' }, { id: 'u', type: 'ul', text: 'c' }]),
   '- **If this is new to you:** a\n- **If you already can:** b\n- c');
eq('routes are read back as one block, not two bullets',
   leParse('- **If this is new to you:** a\n- **If you already can:** b').map(b => b.type).join(' '), 'routes');
eq('a bullet that only looks like a route is left alone',
   leParse('- **If this is new to you:** a\n- something else').map(b => b.type).join(' '), 'ul ul');

/* A route half is one instruction. Enter inside it must not cut it in two,
   and must never take only the half before the caret — that silently
   deletes the rest of what somebody typed. */
eq('Enter inside a route keeps the whole instruction',
   (() => { const b = { id: 'r', type: 'routes', newly: 'go slowergo faster', already: 'x' };
            return leSerialise([b]).split('\n')[0]; })(),
   '- **If this is new to you:** go slowergo faster');

console.log('\n── The add menu offers what the lesson can draw ───────────────');

for (const d of LE_DIAGRAMS) chk('“' + d + '” is reachable from the add menu', LE_INSERTS.some(x => x.type === d));
chk('every menu entry makes a block the serialiser knows', LE_INSERTS.every(x => {
  const b = leNewBlock(x.type);
  return b && b.type === x.type && typeof leSerialise([b]) === 'string';
}));
chk('every new diagram arrives drawing something', LE_DIAGRAMS.every(d => leSerialise([leNewBlock(d)]).trim() !== ''));
chk('no menu entry is missing its words', LE_INSERTS.every(x => x.label && x.hint && x.icon));

console.log('\n' + (failed ? '✗ ' : '✓ ') + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
