<?php
/**
 * Create (or promote) a super_admin member. CLI only.
 *
 *   php api/tools/create-admin.php "Ada Admin" admin@yourdomain.com [centre]
 *
 * If a member with that email exists they're promoted to super_admin;
 * otherwise a new active member is created. The admin then signs in normally
 * (magic link + OTP) and sets up TOTP on first /admin visit.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$name = $argv[1] ?? '';
$email = strtolower(trim($argv[2] ?? ''));
$centre = $argv[3] ?? 'Egbeda';
if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "usage: php api/tools/create-admin.php \"Full Name\" email@domain [centre]\n");
    exit(1);
}

$root = dirname(__DIR__);
if (!file_exists($root . '/config.php')) { fwrite(STDERR, "config_missing — copy api/config.example.php to api/config.php first\n"); exit(1); }
$CONFIG = require $root . '/config.php';
$GLOBALS['CONFIG'] = $CONFIG;
date_default_timezone_set('UTC');
require $root . '/_lib/db.php';
require $root . '/_lib/util.php';

$existing = db_row('SELECT * FROM members WHERE lower(email) = ? LIMIT 1', [$email]);
if ($existing) {
    db_update('members', ['role' => 'super_admin', 'status' => 'active', 'updatedAt' => now_iso()], ['id' => $existing['id']]);
    echo "Promoted existing member {$existing['memberId']} ({$email}) to super_admin.\n";
    exit(0);
}

$id = new_id('NGG');
db_insert('members', [
    'memberId' => $id, 'fullName' => $name, 'email' => $email, 'type' => 'NGG',
    'status' => 'active', 'role' => 'super_admin', 'centre' => $centre,
    'createdAt' => now_iso(), 'updatedAt' => now_iso(),
]);
echo "Created super_admin {$id} <{$email}>. Sign in at your site with this email.\n";
exit(0);
