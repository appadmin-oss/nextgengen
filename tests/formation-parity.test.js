#!/usr/bin/env node
/* ============================================================================
   The formation doctrine, in two languages, saying the same thing.

   The NGGC 2040 brief exists twice in this repo on purpose:

     formation.jsx            so the About page, the mentor portal and a
                              member's dashboard can render a division's
                              mandate or the courage ladder without a round
                              trip;
     api/_lib/domain/formation.php
                              so a closed set is enforced where it can actually
                              be enforced, and so the four divisions are
                              countable in a report.

   Neither can be derived from the other: the host has no Node, and a PHP file
   is not loadable from a browser. So the pair is pinned here instead. Without
   this, the failure is the quiet kind — the roster importer accepts a division
   the About page has never heard of, or a "five-point index" grows a sixth
   rung on one side only, and nothing breaks until somebody reads a report.

   Asserted as VALUES, by evaluating both files, rather than by comparing the
   two sources as text: they are different languages and will never match as
   text, and a test that compares comments fails on a typo fix.

   Run:  node tests/formation-parity.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

/* The JS side: formation.jsx is data ending in an Object.assign onto `window`,
   so it evaluates in a sandbox with that one global. */
function loadJs() {
  const src = fs.readFileSync(path.join(ROOT, 'formation.jsx'), 'utf8');
  const w = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(w);
  return w;
}

/* The PHP side: the file is pure functions over literals and requires no
   bootstrap, no config and no database — which is the property that makes it
   safe to evaluate here. If it ever stops being true, this test is the thing
   that will say so, loudly, rather than the doctrine drifting unnoticed. */
function loadPhp() {
  const script = `<?php
    require_once ${JSON.stringify(path.join(ROOT, 'api/_lib/domain/formation.php'))};
    echo json_encode([
      'divisions'   => nggc_divisions(),
      'divisionIds' => nggc_division_ids(),
      'ladder'      => courage_ladder(),
      'prompts'     => courage_prompts(),
      'weekly'      => nggc_weekly_review(),
      'weeklyKeys'  => nggc_weekly_review_keys(),
    ]);`;
  const out = execFileSync('php', ['-r', script.replace(/^<\?php/, '')], { encoding: 'utf8' });
  return JSON.parse(out);
}

(() => {
  let js, php;
  try { js = loadJs(); } catch (e) { console.error('  ✗ formation.jsx did not evaluate: ' + e.message); process.exit(1); }
  try { php = loadPhp(); } catch (e) { console.error('  ✗ formation.php did not evaluate: ' + e.message); process.exit(1); }

  console.log('\nThe four divisions (brief §5)');
  ok('both sides carry four divisions',
     js.NGGC_DIVISIONS.length === 4 && php.divisions.length === 4);
  ok('the ids agree, and in the same order',
     js.NGGC_DIVISIONS.map(d => d.id).join() === php.divisionIds.join());

  js.NGGC_DIVISIONS.forEach((d, i) => {
    const p = php.divisions[i];
    ok(`${d.id}: the code agrees (${d.code})`, d.code === p.code);
    ok(`${d.id}: the name agrees`, d.name === p.name);
    /* The mandate is the sentence a parent reads on the About page and the one
       a report prints beside a headcount. Two wordings is two promises. */
    ok(`${d.id}: the mandate agrees word for word`, d.mandate === p.mandate);
    ok(`${d.id}: the ${d.courses.length} courses agree, in order`,
       d.courses.join('|') === p.courses.join('|'));
  });

  ok('chess is compulsory on both sides, in all four lists',
     js.NGGC_DIVISIONS.every(d => d.courses.includes('Chess'))
     && php.divisions.every(d => d.courses.includes('Chess')));

  console.log('\nThe Courage Index (brief §14)');
  ok('the ladder is five rungs on both sides',
     js.NGGC_COURAGE_LADDER.length === 5 && php.ladder.length === 5);
  ok('every rung agrees on score and wording',
     js.NGGC_COURAGE_LADDER.every((r, i) =>
       r.score === php.ladder[i].score && r.label === php.ladder[i].label));
  ok('the ten observations agree, in order',
     js.NGGC_COURAGE_PROMPTS.join('|') === php.prompts.join('|'));

  console.log("\nThe mentor's weekly review (brief §18)");
  ok('twelve questions on both sides',
     js.NGGC_WEEKLY_REVIEW.length === 12 && php.weekly.length === 12);
  ok('the questions agree, in order',
     js.NGGC_WEEKLY_REVIEW.join('|') === php.weekly.map(q => q.q).join('|'));
  /* The keys are what a stored answer is filed under. Reordering or reusing
     one silently re-labels every answer already written against it, which is
     why they are asserted as a set AND as a sequence. */
  ok('the twelve keys are unique', new Set(php.weeklyKeys).size === 12);
  ok('the keys run 1..12 in the brief\'s order',
     php.weekly.map(q => q.n).join() === '1,2,3,4,5,6,7,8,9,10,11,12');

  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (formation parity)');
  process.exit(fail ? 1 : 0);
})();
