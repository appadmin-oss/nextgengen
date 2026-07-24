<?php
require_once __DIR__ . '/../_lib/bootstrap.php';

// /auth/me is the canonical "rotate CSRF token" endpoint. Every page load
// hits it; we re-issue a fresh CSRF cookie alongside the membership check.
$csrf = csrf_issue();

$s = session_read();
if (!$s) json_ok(['member' => null, 'csrf' => $csrf]);

$res = gs_call('auth.me', ['memberId' => $s['mid'] ?? '']);
if (empty($res['ok'])) json_ok(['member' => null, 'csrf' => $csrf]);

json_ok([
    'member'  => $res['member'],
    'adminOk' => (bool)($s['adminOk'] ?? false),
    'impersonating' => !empty($s['imp']) ? (string)$s['imp'] : null,
    'sessionExp' => (int)($s['exp'] ?? 0),  // unix seconds — lets the UI show a friendly expiry
    'csrf'    => $csrf,
]);
