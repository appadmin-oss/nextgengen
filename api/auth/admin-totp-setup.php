<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');

/* Deliberately NOT require_admin(): that gate demands `adminOk`, and an admin
 * enrolling for the FIRST time has no second factor to have passed yet. The
 * protection this endpoint needs is therefore not "have you done 2FA" but "is
 * there an enrolment to overwrite" — enforced in auth_totp_setup(), which
 * refuses once a secret exists. Without that refusal this was a 2FA bypass:
 * a password alone could re-issue the secret and then satisfy the gate with it.
 * A lost authenticator is a super-admin reset, not a self-service re-issue. */
$s = session_read();
if (!$s) json_error('unauthorized', 401);
$role = strtolower((string)($s['role'] ?? ''));
if ($role !== 'admin' && $role !== 'super_admin') json_error('forbidden', 403);
// Minting a secret is cheap but not free, and this runs pre-2FA.
rate_limit_check('auth.verify');

$res = gs_call('auth.totpSetup', [
    'memberId' => $s['mid'] ?? '',
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) {
    $err = (string)($res['error'] ?? 'totp_setup_failed');
    // 409: the request is well-formed; this account is simply already enrolled.
    json_error($err, $err === 'already_enrolled' ? 409 : 400);
}

// backupCodes are returned ONCE, at setup, and never again — the domain only
// stores their hashes. Dropping them here left an admin with no recovery codes
// and no way to recover a lost authenticator.
json_ok([
    'secret'      => $res['secret']      ?? '',
    'otpauth'     => $res['otpauth']     ?? '',
    'backupCodes' => $res['backupCodes'] ?? [],
]);
