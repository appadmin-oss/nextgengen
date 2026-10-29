#!/usr/bin/env node
/* ============================================================================
   The PHP suite again, on MySQL.

   WHY THIS IS IN test:all. The repository ships two schemas — the SQLite
   ladder in api/_lib/db.php and the hand-written mirror in
   db/schema-mysql.sql — and every production deployment above a single site
   runs the second one. Until now only the first was ever tested, and in one
   session that gap hid two real defects, both of the same shape: SQLite
   tolerating something MySQL does not.

     · community.search was a hard SQL syntax error on MySQL. "ESCAPE '\\'" in
       PHP is ESCAPE '\' in SQL, where the backslash escapes the closing quote
       and the statement runs on. Community search returned a 500 on every
       MySQL deployment while its test passed on SQLite.

     · A peer mentor could see children's shared journal entries. The privacy
       guard ran its query with an EMPTY parameter list against IN (?,?,?)
       instead of skipping it; SQLite tolerated the mismatch and returned
       nothing, which looked exactly like the guard working.

   Neither was findable on SQLite at any effort. That is the argument.

   WITHOUT A SERVER, this reports loudly and passes. Hard-failing every
   machine that has no MySQL would get `npm run test:all` abandoned, and a
   suite nobody runs protects nothing. Set NGG_REQUIRE_MYSQL=1 — in CI, or
   before a release — to turn the skip into a failure.
   ========================================================================== */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DSN  = process.env.NGG_TEST_DSN  || 'mysql:host=127.0.0.1;dbname=ngg_test;charset=utf8mb4';
const USER = process.env.NGG_TEST_DB_USER || 'ngg';
const PASS = process.env.NGG_TEST_DB_PASS || 'nggpass';
const REQUIRED = process.env.NGG_REQUIRE_MYSQL === '1';

/* Reach the server and hand run.php an EMPTY database.

   run.php drops the tables it can see, which is nearly enough — but a row
   left behind by a crashed or interrupted run survives, and the next run
   fails on a duplicate key a long way from the cause. Dropping the database
   outright is the only state that is reproducible.

   GUARDED, because NGG_TEST_DSN is an environment variable and this statement
   destroys a database. It refuses any name that does not look like a test
   database, so pointing it at production by mistake stops here rather than
   somewhere irreversible. */
const prep = spawnSync('php', ['-r', `
  $dsn = getenv('D'); $user = getenv('U'); $pass = getenv('P');
  if (!preg_match('/dbname=([A-Za-z0-9_]+)/', $dsn, $m)) { fwrite(STDERR, "no dbname in DSN\\n"); exit(2); }
  $db = $m[1];
  if (!preg_match('/test/i', $db)) {
      fwrite(STDERR, "refusing to drop '$db': this runner recreates the database, so its name must contain \\"test\\"\\n");
      exit(4);
  }
  $server = preg_replace('/dbname=[A-Za-z0-9_]+;?/', '', $dsn);
  try {
      $pdo = new PDO($server, $user ?: null, $pass ?: null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
      /* $db is already constrained to [A-Za-z0-9_]+ by the match above, so it
         needs no quoting — and a quoted identifier here is one escaping layer
         too many through php -r. */
      $pdo->exec("DROP DATABASE IF EXISTS $db");
      $pdo->exec("CREATE DATABASE $db DEFAULT CHARACTER SET utf8mb4");
      echo $db;
  } catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\\n"); exit(3); }
`], { cwd: ROOT, env: { ...process.env, D: DSN, U: USER, P: PASS }, encoding: 'utf8' });

if (prep.status !== 0) {
  const why = (prep.stderr || '').trim().split('\n')[0] || 'unknown error';
  if (REQUIRED) {
    console.error('\n❌ MySQL suite REQUIRED (NGG_REQUIRE_MYSQL=1) but no usable server was found.');
    console.error('   DSN: ' + DSN + '\n   ' + why);
    process.exit(1);
  }
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('⚠  MySQL suite SKIPPED — no usable server.');
  console.log('   DSN: ' + DSN);
  console.log('   ' + why);
  console.log('   The MySQL mirror (db/schema-mysql.sql) is what production runs,');
  console.log('   and these tests are the only thing that exercises it. Start a');
  console.log('   MySQL/MariaDB and re-run, or set NGG_REQUIRE_MYSQL=1 to make');
  console.log('   this a failure instead of a notice.');
  console.log('────────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

console.log('\n[mysql-suite] running api/tests/run.php against ' + DSN);
const run = spawnSync('php', ['api/tests/run.php'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, NGG_TEST_DSN: DSN, NGG_TEST_DB_USER: USER, NGG_TEST_DB_PASS: PASS },
});
process.exit(run.status === null ? 1 : run.status);
