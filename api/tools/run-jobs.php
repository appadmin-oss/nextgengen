<?php
/**
 * Daily/periodic maintenance. Replaces the old Apps Script time-driven
 * triggers now that the backend is local.
 *
 * CLI only. Wire on a host cron, e.g. daily at 02:00:
 *   0 2 * * * php /home/USER/public_html/api/tools/run-jobs.php >/dev/null 2>&1
 *
 * Jobs: publish scheduled posts, expire promos, GC expired auth challenges,
 * ensure the current year's sessions exist, prune old sign-in noise from the
 * audit log, and (if a Sheets mirror is configured) push a fresh snapshot.
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

$now = now_iso();
$log = [];

// 1) Publish scheduled posts whose publishAt has passed.
$log['posts_published'] = db_exec("UPDATE posts SET status='published', updatedAt=? WHERE status='draft' AND publishAt != '' AND publishAt IS NOT NULL AND publishAt <= ?", [$now, $now]);

// 2) Expire the homepage promo if past its expiry.
$promo = setting_get('homepage_promo');
if (is_array($promo) && !empty($promo['expires']) && strtotime((string)$promo['expires']) < time()) {
    setting_set('homepage_promo', '', 'system');
    $log['promo_expired'] = 1;
}

// 3) GC auth challenges older than 24h.
$cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - 24 * 3600);
$log['auth_gc'] = db_exec('DELETE FROM auth_sessions WHERE expiresAt < ?', [$cutoff]);

// 4) Recompute session activeness / seed the current year.
$log['sessions_seeded'] = ensure_year((int)gmdate('Y'));

// 5) Drop sign-in noise older than its retention age; everything else is kept
//    (the rule lives in one place: AUDIT_NOISE_EVENTS in _lib/util.php).
$log['audit_trimmed'] = audit_prune();

// 6) Roll any desk password that has reached its rotation interval.
require_once $root . '/_lib/mailer.php';
require_once $root . '/_lib/domain/registration.php';
$log['gate_passwords'] = gates_rotate_due();

// 7) Log absences for programme days that have closed and re-evaluate policy.
require_once $root . '/_lib/domain/summer.php';
require_once $root . '/_lib/domain/policy.php';
$log['policy_sweep'] = policy_sweep_absences();
$log['policy_sweep_member'] = policy_sweep_member_absences();
$log['policy_mentor_repair'] = policy_mentor_absence_repair();
$log['policy_barred_repair'] = policy_barred_repair();
$log['policy_reentry_relink'] = policy_reentry_relink_all();
// 7a) Ask guardians about those absences; announce Summer School dates (domain/make.php).
require_once $root . '/_lib/bus.php';
require_once $root . '/_lib/sms.php';
require_once $root . '/_lib/domain/make.php';
$log['make_absences'] = make_absences_run();
$log['make_milestones'] = make_edition_milestones_run();

// 7b) Close any Summer School edition whose season has ended.
require_once $root . '/_lib/domain/summer-editions.php';
$log['editions_closed'] = summer_editions_close_elapsed();
for ($i = 0; $i < 50; $i++) { $t = summer_thanks_drain(); $log["volunteers_thanked"] = ($log["volunteers_thanked"] ?? 0) + $t["sent"]; if ($t["sent"] + $t["failed"] + $t["noEmail"] === 0) break; }

// 8) Push the Sheets mirror if configured.
if (trim((string)($CONFIG['apps_script_url'] ?? '')) !== '') {
    $out = [];
    @exec('php ' . escapeshellarg(__DIR__ . '/export-sheets.php') . ' 2>&1', $out, $rc);
    $log['mirror'] = $rc === 0 ? 'ok' : 'failed';
}

echo '[' . $now . '] jobs done: ' . json_encode($log, JSON_UNESCAPED_SLASHES) . "\n";
exit(0);
