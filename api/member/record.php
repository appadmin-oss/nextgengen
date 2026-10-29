<?php
/** Member: the record drive — what is missing from my record, and completing it (domain/profile-drive.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('member.profile.status', ['memberId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('member.profile.complete', ['memberId' => $s['mid'], 'values' => is_array($b['values'] ?? null) ? $b['values'] : [], 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
// Field-by-field reasons go back with the refusal, so the form can point at each one.
if (empty($res['ok'])) json_send(['ok' => false, 'error' => $res['error'] ?? 'failed', 'errors' => $res['errors'] ?? null], 400);
unset($res['ok']); json_ok($res);
