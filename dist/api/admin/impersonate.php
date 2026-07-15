<?php
/** Super-admin: view the app as another member (audited). Stop restores the
 *  original admin session. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_session();
$b = read_json_body();
$action = (string)($b['action'] ?? 'start');

if ($action === 'stop') {
    $impBy = (string)($s['imp'] ?? '');
    if ($impBy === '') json_error('not_impersonating', 400);
    $admin = gs_call('auth.me', ['memberId' => $impBy]);
    if (empty($admin['ok'])) json_error('admin_gone', 400);
    // Restore the admin's session (already 2FA-cleared before they started).
    session_issue(['memberId' => $impBy, 'role' => $admin['member']['role'] ?? '', 'type' => $admin['member']['type'] ?? '', 'status' => 'active'], true);
    audit('admin.impersonate.stop', $impBy, (string)($s['mid'] ?? ''), [], client_ip());
    json_ok(['ok' => true, 'stopped' => true]);
}

// start — super-admin only, and never impersonate another super-admin.
if (strtolower((string)($s['role'] ?? '')) !== 'super_admin') json_error('forbidden', 403);
$target = (string)($b['memberId'] ?? '');
$m = db_row('SELECT memberId, role, type, status FROM members WHERE memberId = ? LIMIT 1', [$target]);
if (!$m) json_error('not_found', 404);
if (strtolower((string)$m['role']) === 'super_admin') json_error('cannot_impersonate_super', 400);
session_issue($m, false, (string)($s['mid'] ?? ''));
audit('admin.impersonate.start', (string)($s['mid'] ?? ''), $target, [], client_ip());
json_ok(['ok' => true, 'memberId' => $target]);
