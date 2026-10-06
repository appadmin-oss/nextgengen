<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');

/* Lock the Control Room: the same person stays signed in, but the cookie loses
 * its 2FA clearance, so every admin call is refused until the code is entered
 * again (auth/admin-2fa.php). Locking only in the browser left the cleared
 * cookie in place — a reload, or any request, went straight back in. The old
 * device session is revoked so a copy of the cleared cookie dies with it. */
$s = session_read();
if (!$s) json_error('unauthorized', 401);
if (!is_admin_role($s['role'] ?? '')) json_error('forbidden', 403);

gs_call('auth.lock', ['memberId' => $s['mid'] ?? '', 'sid' => (string)($s['sid'] ?? ''), 'ip' => client_ip()]);
session_issue([
    'memberId' => $s['mid'],
    'role'     => $s['role'],
    'type'     => $s['type'] ?? '',
    'status'   => $s['status'] ?? '',
], false);
json_ok(['locked' => true]);
