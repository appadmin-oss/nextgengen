<?php
/**
 * Export a read-only snapshot of key DB tables to the Google Sheets mirror.
 *
 * CLI only. Wire on a host cron, e.g. every 30 min (crontab):
 *   30 * * * *  php /home/USER/public_html/api/tools/export-sheets.php >/dev/null 2>&1
 *
 * No-op (exit 0) if `apps_script_url` is empty — the mirror is optional.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$root = dirname(__DIR__);
if (!file_exists($root . '/config.php')) { fwrite(STDERR, "config_missing\n"); exit(1); }
$CONFIG = require $root . '/config.php';
$GLOBALS['CONFIG'] = $CONFIG;
require $root . '/_lib/db.php';

$url = trim((string)($CONFIG['apps_script_url'] ?? ''));
$secret = (string)($CONFIG['shared_secret'] ?? '');
if ($url === '') { echo "mirror disabled (no apps_script_url) — skipping\n"; exit(0); }

// Tables to mirror + the column order shown in the Sheet. Sensitive columns
// (totpSecret, auth tokens/otps) are deliberately excluded.
$spec = [
    'Members'     => ['table' => 'members', 'cols' => ['memberId','fullName','email','phone','type','status','role','centre','track','cohort','joinDate','createdAt']],
    'Mentors'     => ['table' => 'mentors', 'cols' => ['mentorId','fullName','email','status','tracks','centre','createdAt']],
    'Sessions'    => ['table' => 'sessions', 'cols' => ['sessionId','code','year','name','startDate','endDate','theme','isActive']],
    'Missions'    => ['table' => 'anchor_missions', 'cols' => ['missionId','week','orderIndex','theme','title','proof','xp','type','isActive']],
    'Assignments' => ['table' => 'assignments', 'cols' => ['assignmentId','title','track','centre','week','dueAt','points','status','createdAt']],
    'Submissions' => ['table' => 'assignment_submissions', 'cols' => ['submissionId','assignmentId','memberId','status','grade','submittedAt','gradedAt']],
    'Events'      => ['table' => 'events', 'cols' => ['eventId','title','kind','centre','startAt','status','isPublic']],
    'Posts'       => ['table' => 'posts', 'cols' => ['postId','slug','kind','title','status','publishAt']],
    'Newsletter'  => ['table' => 'newsletter', 'cols' => ['email','source','status','createdAt']],
    'Applications'=> ['table' => 'applications', 'cols' => ['kind','name','age','centre','track','email','status','createdAt']],
];

$tables = [];
foreach ($spec as $tab => $def) {
    $rows = db_all('SELECT ' . implode(',', $def['cols']) . ' FROM ' . $def['table'] . ' ORDER BY id DESC LIMIT 5000');
    $matrix = [];
    foreach ($rows as $r) {
        $line = [];
        foreach ($def['cols'] as $c) $line[] = (string)($r[$c] ?? '');
        $matrix[] = $line;
    }
    $tables[$tab] = ['headers' => $def['cols'], 'rows' => $matrix];
}

$body = json_encode(['op' => 'mirror.push', 'tables' => $tables], JSON_UNESCAPED_SLASHES);
$sig = hash_hmac('sha256', $body, $secret);

$ch = curl_init($url . '?sig=' . $sig);
curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60,
]);
$res = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($err) { fwrite(STDERR, "export failed: $err\n"); exit(1); }
$data = json_decode((string)$res, true);
if (!is_array($data) || empty($data['ok'])) { fwrite(STDERR, "export rejected (http $code): " . substr((string)$res, 0, 300) . "\n"); exit(1); }
echo "mirror updated: " . json_encode($data['written'] ?? []) . "\n";
exit(0);
