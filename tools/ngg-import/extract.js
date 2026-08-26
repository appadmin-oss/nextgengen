#!/usr/bin/env node
/**
 * Turn the NGG members workbook into the roster file api/tools/seed-members.php
 * reads.
 *
 *   node tools/ngg-import/extract.js ~/Downloads/NGG_Members.xlsx
 *   node tools/ngg-import/extract.js book.xlsx --out /tmp/roster.json --quiet
 *
 * The output holds real children's names, birthdays, addresses and guardians'
 * phone numbers, so it defaults to api/storage/ — which .gitignore excludes —
 * and must not be committed. Move it to the server, run the seeder, delete it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readWorkbook } = require('./xlsx');
const { extractMembers } = require('./members');

const REPO = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(REPO, 'api/storage/seed/ngg-members.json');

function parseArgs(argv) {
  const opts = { workbook: '', out: DEFAULT_OUT, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('-')) throw new Error('unknown option ' + a);
    else opts.workbook = a;
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.workbook) {
    process.stderr.write('usage: node tools/ngg-import/extract.js <workbook.xlsx> [--out FILE] [--quiet]\n');
    return opts.help ? 0 : 1;
  }

  const wb = readWorkbook(opts.workbook);
  const { members, warnings, stats } = extractMembers(wb);

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify({
    source: path.basename(opts.workbook),
    extractedAt: new Date().toISOString(),
    stats,
    warnings,
    members,
  }, null, 2) + '\n');

  if (!opts.quiet) {
    const line = '─'.repeat(64);
    process.stderr.write(`\n${line}\n  NGG roster extract — ${path.basename(opts.workbook)}\n${line}\n`);
    process.stderr.write(`  Members            ${stats.total}\n`);
    process.stderr.write(`    active ${stats.active} · inactive ${stats.inactive} · suspended ${stats.suspended} · graduated ${stats.graduated}\n`);
    process.stderr.write(`    ${Object.entries(stats.byCentre).map(([c, n]) => `${c} ${n}`).join(' · ')}\n`);
    process.stderr.write(`  Contactable        email ${stats.withEmail} · phone ${stats.withPhone} · guardian ${stats.withGuardian}\n`);
    process.stderr.write(`  Profile depth      birthday ${stats.withDob} · school ${stats.withSchool}\n`);
    process.stderr.write(`  Cross-referenced   ${stats.matchedIntake} registrations · ${stats.matchedState} status entries\n`);
    process.stderr.write(`${line}\n`);
    if (warnings.length) {
      process.stderr.write(`  ${warnings.length} thing${warnings.length === 1 ? '' : 's'} the desk should look at:\n`);
      for (const w of warnings) process.stderr.write(`   · ${w}\n`);
      process.stderr.write(`${line}\n`);
    }
    process.stderr.write(`  Written to ${opts.out}\n`);
    process.stderr.write(`  Contains personal data about children — do NOT commit it.\n`);
    process.stderr.write(`  Next: php api/tools/seed-members.php --file ${opts.out}\n${line}\n\n`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write('extract failed: ' + err.message + '\n');
    process.exit(1);
  }
}

module.exports = { main, DEFAULT_OUT };
