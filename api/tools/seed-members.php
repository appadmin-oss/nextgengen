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
 *   --apply        write the changes instead of describing them
 *   --overwrite    replace values a member already has (default: fill blanks only)
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
         'overwrite' => false, 'emitEvents' => false, 'verbose' => false];
for ($i = 1; $i < $argc; $i++) {
    $a = $argv[$i];
    if ($a === '--file' && isset($argv[$i + 1])) { $opts['file'] = $argv[++$i]; }
    elseif ($a === '--apply')       $opts['apply'] = true;
    elseif ($a === '--overwrite')   $opts['overwrite'] = true;
    elseif ($a === '--emit-events') $opts['emitEvents'] = true;
    elseif ($a === '--verbose')     $opts['verbose'] = true;
    elseif ($a === '--help' || $a === '-h') {
        fwrite(STDERR, "usage: php api/tools/seed-members.php [--file PATH] [--apply] [--overwrite] [--emit-events] [--verbose]\n");
        exit(0);
    } else { fwrite(STDERR, "unknown option: {$a}\n"); exit(1); }
}

if (!is_readable($opts['file'])) {
    fwrite(STDERR, "cannot read {$opts['file']}\n"
        . "Produce it first:  node tools/ngg-import/extract.js <workbook.xlsx>\n");
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

$parsed = members_import_parse((string)file_get_contents($opts['file']));
if (empty($parsed['ok'])) {
    fwrite(STDERR, "{$opts['file']} is not a roster file ({$parsed['error']}).\n"
        . "Produce one with:  node tools/ngg-import/extract.js <workbook.xlsx>\n");
    exit(1);
}

$report = members_import_run($parsed['members'], [
    'apply' => $opts['apply'], 'overwrite' => $opts['overwrite'],
    'emitEvents' => $opts['emitEvents'], 'actor' => 'cli:seed-members',
]);

$line = str_repeat('-', 68);
$mode = $opts['apply'] ? 'APPLIED' : 'DRY RUN — nothing written';
echo "\n{$line}\n  NGG roster import — {$mode}\n{$line}\n";
echo '  Roster file:  ' . $opts['file'] . "\n";
if ($parsed['source'] !== '')      echo '  From:         ' . $parsed['source'] . "\n";
if ($parsed['extractedAt'] !== '') echo '  Extracted:    ' . $parsed['extractedAt'] . "\n";
echo '  Mode:         ' . ($opts['overwrite'] ? 'overwrite existing values' : 'fill blanks only')
   . ($opts['emitEvents'] ? ', events on' : '') . "\n";
echo "{$line}\n";
printf("  new %d · updated %d · already current %d · unusable %d\n",
    $report['created'], $report['updated'], $report['unchanged'], $report['failed']);
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
