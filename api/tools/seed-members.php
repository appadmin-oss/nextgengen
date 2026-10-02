<?php
/**
 * Seed the NGG roster from the members workbook. CLI only, idempotent.
 *
 *   node tools/ngg-import/extract.js NGG_Members.xlsx        # sheet → roster file
 *   php api/tools/seed-members.php                           # show what it would do
 *   php api/tools/seed-members.php --apply                   # do it
 *
 * It reports and changes nothing until you pass --apply, because the first run
 * of a roster import against live records is a thing to read, not a thing to
 * trust. Run it, read the summary, then run it again with --apply.
 *
 *   --file PATH    roster file (default api/storage/seed/ngg-members.json)
 *   --expect-sha H the file's sha256, as printed by extract.js. Refuses to run
 *                  if the file on disk does not match — check it when the file
 *                  has travelled (SFTP, a file manager, an email to yourself)
 *                  and you are about to rewrite the membership table with it.
 *   --apply        write the changes instead of describing them
 *   --overwrite    replace values a member already has (default: fill blanks only)
 *   --card-format ID  how the cards these members already hold read (default member-number:
 *                  the number printed on them); '' records none. Every member gets a
 *                  secure MEMQR- card either way.
 *   --emit-events  fan member.created/updated out to the outbox and any
 *                  integrations. Off by default: a backfill of the whole roster
 *                  is not news every webhook subscriber needs at once.
 *   --verbose      list every row, not just the ones that change
 *
 * Safe to run repeatedly: members are matched on their printed ID, so a second
 * run updates the same people rather than issuing them new member IDs.
 *
 * @see api/_lib/domain/members-import.php — the import itself
 * @see tools/ngg-import/extract.js        — turns the .xlsx into the roster file
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$root = dirname(__DIR__);
if (!file_exists($root . '/config.php')) {
    fwrite(STDERR, "config_missing — copy api/config.example.php to api/config.php first\n");
    exit(1);
}

$opts = ['file' => $root . '/storage/seed/ngg-members.json', 'apply' => false,
         'overwrite' => false, 'emitEvents' => false, 'verbose' => false, 'expectSha' => '', 'cardFormat' => 'member-number'];
for ($i = 1; $i < $argc; $i++) {
    $a = $argv[$i];
    if ($a === '--file' && isset($argv[$i + 1])) { $opts['file'] = $argv[++$i]; }
    elseif ($a === '--expect-sha' && isset($argv[$i + 1])) { $opts['expectSha'] = strtolower(trim($argv[++$i])); }
    elseif ($a === '--apply')       $opts['apply'] = true;
    elseif ($a === '--overwrite')   $opts['overwrite'] = true;
    elseif ($a === '--card-format' && isset($argv[$i + 1])) { $opts['cardFormat'] = trim($argv[++$i]); }
    elseif ($a === '--emit-events') $opts['emitEvents'] = true;
    elseif ($a === '--verbose')     $opts['verbose'] = true;
    elseif ($a === '--help' || $a === '-h') {
        fwrite(STDERR, "usage: php api/tools/seed-members.php [--file PATH] [--expect-sha HEX] [--apply] [--overwrite] [--card-format ID|''] [--emit-events] [--verbose]\n");
        exit(0);
    } else { fwrite(STDERR, "unknown option: {$a}\n"); exit(1); }
}

if (!is_readable($opts['file'])) {
    fwrite(STDERR, "cannot read {$opts['file']}\n"
        . "Produce it first:  node tools/ngg-import/extract.js <workbook.xlsx>\n");
    exit(1);
}

/* The file's own SHA-256, the number extract.js printed when it wrote it.
 *
 * A roster file travels from a laptop to a shared host by whatever route is to
 * hand — SFTP, a file manager, an email to yourself. --expect-sha is how you
 * check that what arrived is what left, before it rewrites the membership
 * table. Without the flag it is reported and not enforced, because most runs
 * are on a file that never moved.
 *
 * Checked HERE, ahead of the config load and the database connection: a file
 * that is not the one you meant should stop the run before it opens anything,
 * and "config_missing" is a poor way to learn your roster is wrong. */
$raw = (string)file_get_contents($opts['file']);
$fileSha = hash('sha256', $raw);
if ($opts['expectSha'] !== '' && !hash_equals($fileSha, $opts['expectSha'])) {
    fwrite(STDERR, "roster file does not match --expect-sha.\n"
        . "  expected  {$opts['expectSha']}\n"
        . "  on disk   {$fileSha}\n"
        . "This is not the file the extractor made. Nothing was written.\n");
    exit(1);
}

$CONFIG = require $root . '/config.php';
$GLOBALS['CONFIG'] = $CONFIG;
date_default_timezone_set('UTC');
require $root . '/_lib/response.php';
require $root . '/_lib/db.php';
require $root . '/_lib/qr-encode.php';
require $root . '/_lib/util.php';
require $root . '/_lib/bus.php';
require $root . '/_lib/sheets.php';
require $root . '/_lib/domain/members-import.php';

db_conn();   // migrate before the first write

$parsed = members_import_parse($raw);
if (empty($parsed['ok'])) {
    fwrite(STDERR, "{$opts['file']} is not a roster file ({$parsed['error']}).\n"
        . "Produce one with:  node tools/ngg-import/extract.js <workbook.xlsx>\n");
    exit(1);
}

$report = members_import_run($parsed['members'], [
    'apply' => $opts['apply'], 'overwrite' => $opts['overwrite'],
    'emitEvents' => $opts['emitEvents'], 'actor' => 'cli:seed-members',
    'source' => $parsed['source'], 'fileSha' => $fileSha, 'cardFormat' => $opts['cardFormat'],
    'applicants' => $parsed['applicants'],
]);
if (empty($report['ok'])) { fwrite(STDERR, ($report['detail'] ?? $report['error'] ?? 'failed') . "\n"); exit(1); }

$line = str_repeat('-', 68);
$mode = $opts['apply'] ? 'APPLIED' : 'DRY RUN — nothing written';
echo "\n{$line}\n  NGG roster import — {$mode}\n{$line}\n";
echo '  Roster file:  ' . $opts['file'] . "\n";
echo '  sha256:       ' . $fileSha . ($opts['expectSha'] !== '' ? '  (matches --expect-sha)' : '') . "\n";
echo '  Import id:    ' . substr($report['digest'], 0, 16) . "…  (what this roster would do)\n";
if (!empty($report['previous'])) {
    echo '  Already run:  this exact roster was applied on '
       . substr((string)$report['previous']['at'], 0, 10)
       . ' by ' . (string)$report['previous']['actorId'] . "\n";
}
if ($parsed['source'] !== '')      echo '  From:         ' . $parsed['source'] . "\n";
if ($parsed['extractedAt'] !== '') echo '  Extracted:    ' . $parsed['extractedAt'] . "\n";
echo '  Mode:         ' . ($opts['overwrite'] ? 'overwrite existing values' : 'fill blanks only')
   . ($opts['emitEvents'] ? ', events on' : '') . "\n";
echo "{$line}\n";
printf("  new %d · updated %d · already current %d · unusable %d\n",
    $report['created'], $report['updated'], $report['unchanged'], $report['failed']);
$c = $report['cards'];
if ($opts['apply']) printf("  cards: %d secure cards issued · %d printed cards recorded (%s)%s\n", $c['issued'], $c['printed'], $c['format'] ?: 'none',
    $c['taken'] ? ' · ' . $c['taken'] . ' printed codes already belong to somebody else' : '');
else printf("  cards: %d members would be given a secure card · printed cards read as %s\n", $c['wouldIssue'], $c['format'] ?: '(none)');
$ids = $report['ids'];
printf("  member IDs: %d kept · %d %s · %d read differently · %d refused\n", $ids['kept'], $ids['issued'],
    $opts['apply'] ? 'issued' : 'to issue', $ids['normalized'], $ids['refused']);
$ap = $report['applicants'];
if ($ap['filed'] || $ap['already'] || $ap['onRoster']) printf("  applicants: %d %s for the desk to confirm · %d filed before · %d already members\n",
    $ap['filed'], $opts['apply'] ? 'filed' : 'to file', $ap['already'], $ap['onRoster']);
echo "{$line}\n";

foreach ($report['rows'] as $r) {
    $interesting = $r['action'] !== 'unchanged' || !empty($r['warnings']);
    if (!$interesting && !$opts['verbose']) continue;
    $mark = ['create' => '+', 'update' => '~', 'unchanged' => '=', 'failed' => '!'][$r['action']] ?? '?';
    printf("  %s %-9s %-28s %s\n", $mark, $r['ref'], mb_substr((string)$r['name'], 0, 28),
        mb_substr((string)($r['detail'] ?? ''), 0, 90));
    foreach ($r['warnings'] ?? [] as $w) echo "      ↳ {$w}\n";
}

echo "{$line}\n";
if (!$opts['apply']) {
    echo "  Nothing was written. Re-run with --apply to make these changes.\n";
} else {
    echo "  Done. The roster file holds children's personal data — delete it from\n";
    echo "  the server now that it is in the database.\n";
}
echo "{$line}\n\n";
// A row the importer could not use is the one thing an operator must not miss,
// so it is an exit code and not only a line of output.
exit($report['failed'] > 0 ? 1 : 0);
