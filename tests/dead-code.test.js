#!/usr/bin/env node
/* ============================================================================
   Nothing irrelevant ships (owner, 18 Nov 2026: "Remove everything that is
   irrelevant" … "Please create a test for that").

   Fails when a shipped source file declares a top-level function, class or
   variable that nothing in the product (or its tests) refers to, or when a
   self-hosted font file is named by no stylesheet or code — the dead weight a
   phone downloads and parses for nothing. tools/dead-code.js holds the rule;
   `node tools/dead-code.js --prune` removes what this test finds.

   The detector is checked first, so a broken detector cannot pass silently:
   it must read declarations by PARSING (a function written inside a template
   string is text, not code) and must find a real one.

   Run:  node tests/dead-code.test.js
   ========================================================================== */
'use strict';

const { findDead, findDeadFonts, declarations, shippedFiles } = require('../tools/dead-code.js');

let passed = 0, failed = 0;
const ok = (label, cond, extra) => { if (cond) { passed++; console.log('  ✓ ' + label); } else { failed++; console.log('  ✗ FAIL: ' + label + (extra ? '\n      ' + extra : '')); } };

// 1. The detector.
const sample = 'const SHOWN = `\nfunction notCode() { return 1; }\n`;\n/** Mine. */\nfunction realOne() { return SHOWN; }\nconst [a, b] = [1, 2];\nclass Klass {}\n';
const names = declarations(sample).map(d => d.name);
ok('the detector reads real top-level declarations (function, const, class)', ['SHOWN', 'realOne', 'Klass'].every(n => names.includes(n)));
ok('…and not a function written inside a template string, which is text', !names.includes('notCode'));
const real = declarations(sample).find(d => d.name === 'realOne');
ok('…and a declaration takes its own comment with it', real && sample.slice(real.start, real.end).startsWith('/** Mine. */'));
ok('the detector reads every shipped file (the build ORDER plus the plain scripts)', shippedFiles().length >= 100 && shippedFiles().includes('components.jsx') && shippedFiles().includes('api-client.js'));

// 2. The product.
const dead = findDead();
ok('no shipped file declares something nothing uses (' + dead.length + ' found)', dead.length === 0,
  dead.slice(0, 25).map(d => d.file + ': ' + d.name + ' (' + d.bytes + ' bytes)').join('\n      ') + (dead.length ? '\n      Remove them with: node tools/dead-code.js --prune' : ''));
const fonts = findDeadFonts();
ok('no self-hosted font file is named by nothing', fonts.length === 0, fonts.join(', '));

console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (dead code)` : `✅ PASS: ${passed} passed, 0 failed (dead code)`));
process.exit(failed ? 1 : 0);
