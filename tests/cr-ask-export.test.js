#!/usr/bin/env node
/* ============================================================================
   The Analyst's export request (src/modules/control/cr-layers.jsx,
   crAskExportIntent): which questions are a request for a list of members, and
   how it is grouped. "Send me an export of the members grouped by their
   divisions" once came back as "No answer came back"; it is the roster export.
   A question about the figures must NOT be taken for one.
   Run:  node tests/cr-ask-export.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/modules/control/cr-layers.jsx'), 'utf8');
const a = src.indexOf('const CR_ASK_GROUPS'), b = src.indexOf('async function crAskMembersExport');
if (a < 0 || b < 0) { console.error('  ✗ FAIL: crAskExportIntent not found in cr-layers.jsx'); process.exit(1); }
const T = {}; vm.createContext(T);
vm.runInContext(src.slice(a, b) + '\n;this.crAskExportIntent = crAskExportIntent;', T);

let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const by = t => { const r = T.crAskExportIntent(t); return r ? r.by : null; };

chk('the owner’s question is an export grouped by division', by('Can you send me an export of the members with their names grouped by their divisions?') === 'division');
chk('…by centre, level, status, programme', by('Download the roster by centre') === 'centre' && by('Export members grouped by level') === 'level'
  && by('give me a CSV of members by status') === 'status' && by('export all members by programme') === 'type');
chk('…and with no grouping, name order', by('export the members') === '' && by('Send me a spreadsheet of the children') === '');
chk('a question about the figures is not an export', by('Which centre needs attention?') === null && by('Summarise this page in two lines') === null
  && by('How many members joined in the last 30 days?') === null && by('What changed most since last week?') === null);
chk('…nor an export of something that is not people', by('export the attendance chart') === null);

console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (analyst export)` : `✅ PASS: ${passed} passed, 0 failed (analyst export)`));
process.exit(failed ? 1 : 0);
