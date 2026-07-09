<?php
/**
 * Provision (or repair) NGG's DEFAULT super admin and print the credentials.
 * CLI only. Safe to run repeatedly (idempotent).
 *
 *   php api/tools/seed-admin.php            # ensure + show credentials
 *   php api/tools/seed-admin.php --reveal   # just show a pending generated password
 *
 * Configure the account in api/config.php → 'super_admin' => ['email','name','password'].
 * Leave 'password' empty to have a strong one generated once (shown here).
 *
 * (For ADDITIONAL, arbitrarily-named admins, use create-admin.php instead.)
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$root = dirname(__DIR__);
if (!file_exists($root . '/config.php')) { fwrite(STDERR, "config_missing — copy api/config.example.php to api/config.php first\n"); exit(1); }
$CONFIG = require $root . '/config.php';
$GLOBALS['CONFIG'] = $CONFIG;
date_default_timezone_set('UTC');
require $root . '/_lib/db.php';
require $root . '/_lib/util.php';
require $root . '/_lib/superadmin.php';

db_conn(); // ensure schema exists (SQLite auto-migrates)

if (in_array('--reveal', $argv, true)) {
    $pw = ngg_superadmin_pending_password();
    $cfg = ngg_superadmin_config();
    if ($pw === '') { echo "No pending generated password (an explicit password is configured, or it was already revealed).\n"; exit(0); }
    echo "Super Admin email:    {$cfg['email']}\n";
    echo "Super Admin password: {$pw}\n";
    exit(0);
}

$res = ensure_super_admin();
$cfg = ngg_superadmin_config();
$pw  = $res['password'] ?? ngg_superadmin_pending_password();

$line = str_repeat('-', 60);
echo "\n{$line}\n  NGG (Next Gen Genius) — Default Super Admin\n{$line}\n";
echo "  Status:   " . ($res['created'] ? 'created' : 'ensured (already present)') . "\n";
echo "  Role:     super_admin (content, people, inbox, settings, rbac, summer, club)\n";
echo "  Email:    {$cfg['email']}\n";
if ($cfg['password'] !== '') {
    echo "  Password: (using config.php → super_admin.password)\n";
} elseif ($pw !== '') {
    echo "  Password: {$pw}\n";
    echo "            ^ generated once. Save it now, then change it after signing in.\n";
} else {
    echo "  Password: (already set on a previous run — set super_admin.password in\n";
    echo "             config.php and re-run to reset it)\n";
}
echo "{$line}\n";
echo "  Sign in:  POST to /api/auth/login with this email + password, then set up\n";
echo "            the authenticator (TOTP) on the first Control Room visit.\n";
echo "            (Magic-link/OTP sign-in also works if email is configured.)\n";
echo "{$line}\n\n";
