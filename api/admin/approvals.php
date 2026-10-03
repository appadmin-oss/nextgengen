<?php
/**
 * Admin: approvals — a club admin's sensitive actions waiting for a second
 * admin (domain/approvals.php). GET lists; POST decides or withdraws.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.approvals.list', ['requesterId' => $s['mid'], 'status' => (string)($_GET['status'] ?? 'pending')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'decide') {
        $res = gs_call('admin.approvals.decide', ['requesterId' => $s['mid'], 'approvalId' => (string)($b['approvalId'] ?? ''),
            'decision' => (string)($b['decision'] ?? ''), 'reason' => (string)($b['reason'] ?? ''), 'ip' => client_ip()]);
    } elseif ($action === 'withdraw') {
        $res = gs_call('admin.approvals.withdraw', ['requesterId' => $s['mid'], 'approvalId' => (string)($b['approvalId'] ?? ''), 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
