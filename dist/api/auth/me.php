<?php
require_once __DIR__ . '/../_lib/bootstrap.php';

// /auth/me is the canonical "rotate CSRF token" endpoint. Every page load
// hits it; we re-issue a fresh CSRF cookie alongside the membership check.
$csrf = csrf_issue();

$s = session_read();
if (!$s) json_ok(['member' => null, 'csrf' => $csrf]);

// This is the endpoint the client heartbeats on, so it is where an active
// session's idle clock is reset. Without it a staff session expired after 30
// minutes of reading rather than 30 minutes of absence. It cannot fail the
// request — see session_touch().
session_touch($s);

$res = gs_call('auth.me', ['memberId' => $s['mid'] ?? '']);
if (empty($res['ok'])) json_ok(['member' => null, 'csrf' => $csrf]);

json_ok([
    'member'  => $res['member'],
    'adminOk' => (bool)($s['adminOk'] ?? false),
    'impersonating' => !empty($s['imp']) ? (string)$s['imp'] : null,
    'sessionExp' => (int)($s['exp'] ?? 0),  // unix seconds — lets the UI show a friendly expiry
    'csrf'    => $csrf,
]);
