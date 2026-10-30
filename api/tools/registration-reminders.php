<?php
/**
 * Parent-verification reminder cadence — run hourly from cron:
 *
 *   0 * * * * php /path/to/site/api/tools/registration-reminders.php
 *
 * Policy (never more than two automated nudges):
 *   >24h unverified, one send so far  → resend on the second channel too
 *   >48h unverified                   → emit registration.stalled ONCE
 *                                       (lands in the admin "Needs you" list
 *                                       and any subscribed Chat space)
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$ROOT = dirname(__DIR__);
if (!file_exists($ROOT . '/config.php')) { fwrite(STDERR, "api/config.php missing\n"); exit(1); }
$GLOBALS['CONFIG'] = require $ROOT . '/config.php';

require $ROOT . '/_lib/response.php';
require $ROOT . '/_lib/db.php';
require $ROOT . '/_lib/util.php';
require $ROOT . '/_lib/mailer.php';
require $ROOT . '/_lib/bus.php';
require $ROOT . '/_lib/sms.php';
require $ROOT . '/_lib/object-store.php';
require $ROOT . '/_lib/telegram.php';
require $ROOT . '/_lib/anchor-content.php';
require $ROOT . '/_lib/ai.php';
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2', 'mentorship', 'summer', 'club', 'circle', 'momentum', 'integrations', 'registration', 'hooks', 'behaviour', 'make'] as $d) require $ROOT . "/_lib/domain/$d.php";
require $ROOT . '/_lib/backend.php';

$reminded = 0; $stalled = 0;
$pending = db_all("SELECT * FROM summer_students WHERE regStatus = 'parent_pending' ORDER BY id ASC LIMIT 500");
foreach ($pending as $s) {
    $ageH = (time() - (strtotime((string)$s['enrolledAt']) ?: time())) / 3600;
    $lastSend = strtotime((string)($s['remindedAt'] ?: $s['enrolledAt'])) ?: time();
    $sinceSendH = (time() - $lastSend) / 3600;

    if ($ageH >= 24 && $sinceSendH >= 24) {
        // remindedAt within (enrolledAt, enrolledAt+2h] ⇒ only the initial
        // send has happened; one reminder is still allowed.
        $initial = strtotime((string)$s['enrolledAt']) ?: 0;
        $remindTs = strtotime((string)($s['remindedAt'] ?: '')) ?: 0;
        if ($remindTs <= $initial + 2 * 3600) {
            registration_send_verification((string)$s['studentId']);
            $reminded++;
        }
    }
    if ($ageH >= 48) {
        $already = db_row("SELECT id FROM audit_log WHERE event = 'registration.stalled' AND subject = ? LIMIT 1", [(string)$s['studentId']]);
        if (!$already) {
            audit('registration.stalled', null, (string)$s['studentId'], ['hours' => (int)$ageH], '');
            event_emit('registration.stalled', ['ref' => (string)$s['studentId'], 'name' => (string)$s['fullName'], 'hoursPending' => (int)$ageH]);
            make_registration_stalled_emit($s, (int)$ageH);
            $stalled++;
        }
    }
}
echo json_encode(['pending' => count($pending), 'reminded' => $reminded, 'stalled' => $stalled]) . PHP_EOL;
