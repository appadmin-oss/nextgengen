<?php
/**
 * Why is there no photograph?
 *
 * On a deployment without Cloudinary every headshot is written to disk. When the
 * web user cannot write to that directory — the commonest way a PHP deploy is
 * broken — a registration still succeeds and the review desk shows a blank
 * frame, which looks exactly like a family who sent no photo. Two people then
 * disagree about whether photos "save", with nothing to point at.
 *
 * This answers it in one command, from the host, with no admin session and no
 * browser cache in the way:
 *
 *   php api/tools/check-photos.php
 *
 * It reports where images are meant to go, whether that directory is writable,
 * whether a real write-and-read-back round trip works, how many images are held,
 * and how many recent sign-ups actually have one. Exit code 0 = healthy, 1 = a
 * fault it names, 2 = it could not even start.
 *
 * Writes nothing except a temporary probe image, which it deletes.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(2); }

$root = dirname(__DIR__);
if (!file_exists($root . '/config.php')) { fwrite(STDERR, "config_missing — create api/config.php first\n"); exit(2); }
$GLOBALS['CONFIG'] = require $root . '/config.php';
date_default_timezone_set('UTC');
require $root . '/_lib/response.php';
require $root . '/_lib/db.php';
require $root . '/_lib/util.php';
require $root . '/_lib/domain/photos.php';

$line = str_repeat('─', 62);
echo "NGG · photo storage check\n$line\n";

$cld = $GLOBALS['CONFIG']['cloudinary'] ?? [];
$hasCloud = !empty($cld['cloud_name']) && !empty($cld['api_key']) && !empty($cld['api_secret']);
$hasUnsigned = !empty($cld['cloud_name']) && !empty($cld['unsigned_preset']);
printf("Cloudinary        : %s%s\n",
    $hasCloud ? 'configured (signed)' : 'NOT configured',
    $hasUnsigned ? ' + unsigned preset' : '');
if (!$hasCloud && !$hasUnsigned) {
    echo "                    → every headshot is stored on this host, so the\n"
       . "                      directory below has to be writable.\n";
}

$st = photo_store_selftest();
printf("Image directory   : %s\n", $st['dir']);
printf("  exists          : %s\n", !empty($st['exists']) ? 'yes' : 'NO');
printf("  writable        : %s\n", !empty($st['writable']) ? 'yes' : 'NO');
printf("  images held     : %d (%.1f MB)\n", (int)$st['files'], ((int)$st['bytes']) / 1048576);
printf("  location        : %s\n", (string)$st['where']);
if (($st['where'] ?? '') === 'cache_fallback') {
    echo "                    → DEGRADED. api/storage is not writable, so images are\n"
       . "                      going to the cache directory instead. They work, but\n"
       . "                      fix api/storage permissions.\n";
}

printf("Write + read back : %s\n", !empty($st['ok']) ? 'OK' : 'FAILED at ' . ($st['stage'] ?? '?') . ' (' . ($st['error'] ?? '?') . ')');

/* What is actually on the records. A passing self-test with photoless rows means
 * something else is dropping them — a cloud that refuses, or a request body
 * truncated by a limit in front of PHP (see docs/SETUP.md → Request body size). */
/* Guarded, because a host that will not let PHP write to a directory will often
   not let it write to the SQLite file either — and a diagnostic that dies with a
   stack trace while diagnosing is worse than useless. A read-only database is
   itself a finding, so say it and carry on. */
$rows = [];
$dbErr = '';
try {
    $rows = db_all("SELECT studentId, enrolledAt, photoUrl FROM summer_students
                    WHERE submittedVia != '' ORDER BY id DESC LIMIT 20");
} catch (Throwable $e) {
    $dbErr = preg_match('/readonly|read-only/i', $e->getMessage())
        ? 'the database is READ-ONLY on this host — nothing can be saved at all, photos included'
        : 'could not read the registrations table: ' . $e->getMessage();
}
$blank = 0;
foreach ($rows as $r) if (trim((string)$r['photoUrl']) === '') $blank++;
echo $line . "\n";
if ($dbErr !== '') {
    echo "Recent sign-ups   : could not check\n  · $dbErr\n";
} else {
    printf("Recent sign-ups   : %d checked, %d with NO photo\n", count($rows), $blank);
}
foreach ($rows as $r) {
    $u = trim((string)$r['photoUrl']);
    $where = $u === '' ? 'MISSING'
        : (photo_is_stored_locally($u) ? (is_file(photo_store_path(substr($u, strrpos($u, '=') + 1))) ? 'on disk' : 'URL ON ROW BUT FILE GONE')
        : 'hosted');
    printf("  %-16s %-10s %s\n", (string)$r['studentId'], substr((string)$r['enrolledAt'], 0, 10), $where);
}

$problems = [];
if (empty($st['writable']))                    $problems[] = 'the image directory is not writable';
if (empty($st['ok']))                          $problems[] = 'a test image could not be written and read back';
if (($st['where'] ?? '') === 'cache_fallback') $problems[] = 'images are going to the cache directory, not api/storage';
if ($blank > 0)                                $problems[] = $blank . ' recent sign-up(s) have no photo on the record';
if ($dbErr !== '')                             $problems[] = $dbErr;

echo $line . "\n";
if (!$problems) {
    echo "✓ Photo storage is healthy on this host.\n";
    exit(0);
}
echo "✗ " . count($problems) . " problem(s):\n";
foreach ($problems as $p) echo "  · $p\n";
echo "\nMost likely fix — make the directory writable by the web user:\n"
   . "  chmod 775 " . escapeshellarg(dirname((string)$st['dir'])) . " " . escapeshellarg((string)$st['dir']) . "\n"
   . "(755 is enough when PHP runs as the directory's owner, which is usual on cPanel.)\n"
   . "Then re-run this check. Sign-ups that arrived while it was broken have no\n"
   . "image and need a retake link — Admin → Registrations → the child → Photo.\n";
exit(1);
