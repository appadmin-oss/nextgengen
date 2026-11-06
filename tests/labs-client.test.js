#!/usr/bin/env node
/* The Labs have two halves: LABS in api/_lib/domain/labs.php (the content and the rules) and
   NGG_LABS in src/modules/tools/tools-core.jsx (the tabs and addresses the browser needs before any
   request returns). Two lists are a drift waiting to happen (CLAUDE.md §11), so this holds them to
   one another: the same Labs, in the same order, at the same addresses, with the same titles, the
   same daily-problem names, and exam papers offered on exactly the same side. It also holds the API
   client's rule for naming the Lab from the address against every Lab's path. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const chk = (l, c, d) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ FAIL: ' + l + (d ? ' — ' + d : '')); } };
const server = JSON.parse(execFileSync('php', ['-r', 'require "api/_lib/domain/labs.php"; echo json_encode(array_values(LABS), JSON_UNESCAPED_UNICODE);'], { cwd: ROOT, encoding: 'utf8' }));
const src = fs.readFileSync(path.join(ROOT, 'src/modules/tools/tools-core.jsx'), 'utf8');
const block = src.match(/const NGG_LABS = (\[[\s\S]*?\n\]);/);
chk('tools-core.jsx declares NGG_LABS', !!block);
const client = block ? Function('return ' + block[1])() : [];
chk('the same Labs, in the same order', JSON.stringify(client.map(l => l.id)) === JSON.stringify(server.map(l => l.id)), client.map(l => l.id) + ' vs ' + server.map(l => l.id));
for (const s of server) {
  const c = client.find(x => x.id === s.id) || {};
  chk(s.id + ': the address is the same (' + s.path + ')', '/study/' + c.seg === s.path);
  chk(s.id + ': the title is the same', c.title === s.title, c.title + ' vs ' + s.title);
  chk(s.id + ': exam papers are offered on both sides or neither', !!c.exams === s.features.includes('exams'));
  chk(s.id + ': the daily problem has the same name', !s.features.includes('daily') || c.daily === s.dailyName, c.daily + ' vs ' + s.dailyName);
  chk(s.id + ': the icon is the same', c.icon === s.icon);
}
// The API client names the Lab from the address: /study/<seg> → <seg>, except the first Lab's /study/lab → maths.
const api = fs.readFileSync(path.join(ROOT, 'api-client.js'), 'utf8');
const fn = api.match(/function mlabLab\(\) \{[\s\S]*?\n  \}/);
chk('api-client.js has mlabLab()', !!fn);
if (fn) {
  const make = p => Function('location', fn[0] + '; return mlabLab();')({ pathname: p });
  for (const s of server) chk('the API client names ' + s.path + '/map as ' + s.id, make(s.path + '/map') === s.id && make(s.path) === s.id);
  chk('anywhere else is Maths (the Club page asks the Maths Lab)', make('/club') === 'maths' && make('/') === 'maths');
}
console.log((fail ? '❌ FAIL: ' : '✅ PASS: ') + pass + ' passed, ' + fail + ' failed (labs: client and server agree)');
process.exit(fail ? 1 : 0);
