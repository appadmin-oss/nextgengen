<?php
/**
 * Sync the Afrovanguard mentor / volunteer pool into NGG's mentors table.
 *
 * NGG is an Afrovanguard programme; its mentorship runs inside the wider
 * Street-To-Stardom network. This pulls Afrovanguard's APPROVED mentor
 * directory (integrations API, scope mentors:read) and mirrors it locally as
 * mentors with source='afrovanguard', so the admin console and public mentor
 * strip show one combined pool. Afrovanguard stays the source of truth for
 * those rows; NGG's own (source='ngg') mentors are never touched.
 *
 * CLI + cron. Wire e.g. every 6h:
 *   0 *&#47;6 * * *  php /home/USER/public_html/api/tools/sync-afrovanguard.php >/dev/null 2>&1
 *
 * No-op (exit 0) when afrovanguard.api_token is empty — the sync is optional.
 *
 * Flags: --dry-run (fetch + report, write nothing)  --quiet
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$root = dirname(__DIR__);
if (!file_exists($root . '/config.php')) { fwrite(STDERR, "config_missing\n"); exit(1); }
$CONFIG = require $root . '/config.php';
$GLOBALS['CONFIG'] = $CONFIG;
date_default_timezone_set('UTC');
require $root . '/_lib/db.php';
require $root . '/_lib/util.php';

$dry   = in_array('--dry-run', $argv, true);
$quiet = in_array('--quiet', $argv, true);
$say = function (string $m) use ($quiet) { if (!$quiet) echo $m . "\n"; };

$av = (array)($CONFIG['afrovanguard'] ?? []);
$base  = rtrim((string)($av['api_base'] ?? ''), '/');
$token = (string)($av['api_token'] ?? '');
$program = (string)($av['mentor_program'] ?? 'Street-To-Stardom');
if ($base === '' || $token === '') { $say('sync disabled (no afrovanguard.api_token) — skipping'); exit(0); }

// ---- fetch the approved directory ----
$url = $base . (str_contains($base, '?') ? '&' : '?') . 'action=mentors.directory&limit=500';
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Accept: application/json'],
]);
$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($resp === false)        { fwrite(STDERR, "fetch failed: {$err}\n"); exit(1); }
if ($code === 401 || $code === 403) { fwrite(STDERR, "auth failed (HTTP {$code}) — check api_token has the mentors:read scope\n"); exit(1); }
if ($code !== 200)          { fwrite(STDERR, "unexpected HTTP {$code}: " . substr((string)$resp, 0, 300) . "\n"); exit(1); }

$data = json_decode((string)$resp, true);
if (!is_array($data) || empty($data['ok']) || !isset($data['mentors']) || !is_array($data['mentors'])) {
    fwrite(STDERR, "bad payload: " . substr((string)$resp, 0, 300) . "\n"); exit(1);
}
$remote = $data['mentors'];
$say('fetched ' . count($remote) . ' approved Afrovanguard mentor(s)' . ($dry ? ' [dry-run]' : ''));

// ---- upsert each into mentors (keyed by the stable ref = mentorId) ----
$now = now_iso();
$seenRefs = [];
$created = 0; $updated = 0;
foreach ($remote as $m) {
    if (!is_array($m)) continue;
    $ref = trim((string)($m['ref'] ?? ''));
    if ($ref === '') continue;
    $seenRefs[] = $ref;

    $bioParts = array_filter([trim((string)($m['headline'] ?? '')), trim((string)($m['focus'] ?? ''))]);
    $row = [
        'mentorId'        => $ref,
        'fullName'        => (string)($m['name'] ?? ''),
        'email'           => (string)($m['email'] ?? ''),
        'status'          => !empty($m['accepting']) ? 'active' : 'inactive',
        'tracks'          => (string)($m['focus'] ?? ''),
        'bio'             => implode(' — ', $bioParts),
        'skills'          => (string)($m['focus'] ?? ''),
        'maxMentees'      => (int)($m['capacity'] ?? 0),
        'source'          => 'afrovanguard',
        'program'         => $program,
        'afrovanguardRef' => $ref,
        'checkedAt'       => $now,
        'updatedAt'       => $now,
    ];

    $existing = db_row('SELECT id FROM mentors WHERE mentorId = ? LIMIT 1', [$ref]);
    if ($dry) { $existing ? $updated++ : $created++; continue; }

    if ($existing) {
        db_update('mentors', $row, ['id' => $existing['id']]);
        $updated++;
    } else {
        $row['joinedAt']  = $now;
        $row['createdAt'] = $now;
        db_insert('mentors', $row);
        $created++;
    }
}

// ---- retire Afrovanguard-sourced mentors that dropped out of the pool ----
$retired = 0;
$existingAv = db_all("SELECT mentorId FROM mentors WHERE source = 'afrovanguard'");
foreach ($existingAv as $e) {
    $mid = (string)$e['mentorId'];
    if (in_array($mid, $seenRefs, true)) continue;
    $retired++;
    if (!$dry) db_update('mentors', ['status' => 'inactive', 'updatedAt' => $now], ['mentorId' => $mid]);
}

if (!$dry) audit('sync.afrovanguard', null, 'mentors', ['created' => $created, 'updated' => $updated, 'retired' => $retired], '');
$say("done: {$created} created, {$updated} updated, {$retired} retired" . ($dry ? ' [dry-run — nothing written]' : ''));
