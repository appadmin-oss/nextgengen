<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');

$s = session_read();
if (!$s) json_error('unauthorized', 401);
$role = strtolower((string)($s['role'] ?? ''));
if ($role !== 'admin' && $role !== 'super_admin') json_error('forbidden', 403);

$res = gs_call('auth.totpSetup', [
    'memberId' => $s['mid'] ?? '',
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'totp_setup_failed', 400);

// backupCodes are returned ONCE, at setup, and never again — the domain only
// stores their hashes. Dropping them here left an admin with no recovery codes
// and no way to recover a lost authenticator.
json_ok([
    'secret'      => $res['secret']      ?? '',
    'otpauth'     => $res['otpauth']     ?? '',
    'backupCodes' => $res['backupCodes'] ?? [],
]);
