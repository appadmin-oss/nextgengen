<?php
/** Admin: joining invoices, and offline payments held until a second person verifies them (domain/membership-pay.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'evidence') {
        $res = gs_call('admin.membership.evidence', ['requesterId' => $mid, 'paymentId' => $_GET['paymentId'] ?? '', 'ip' => client_ip()]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 404);
        // Served as a download-safe inline file; never sniffed, never cached.
        header('Content-Type: ' . $res['type']);
        header('Content-Length: ' . filesize($res['path']));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        header('Content-Disposition: inline; filename="evidence-' . preg_replace('/[^A-Za-z0-9-]/', '', (string)($_GET['paymentId'] ?? '')) . '"');
        readfile($res['path']);
        exit;
    }
    // The legal details every invoice, receipt and certificate prints (domain/documents.php).
    if ($view === 'documents') $res = gs_call('admin.documents.settings', ['requesterId' => $mid]);
    else $res = gs_call('admin.membership.invoices', ['requesterId' => $mid, 'status' => $_GET['status'] ?? '']);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $map = [
        'create' => 'admin.membership.invoice.create', 'resend' => 'admin.membership.invoice.resend', 'void' => 'admin.membership.invoice.void',
        'bank' => 'admin.membership.bank.set', 'bankConfirm' => 'admin.membership.bank.confirm', 'bankCancel' => 'admin.membership.bank.cancel',
        'record' => 'admin.membership.offline.record',
        'documents' => 'admin.documents.settings',
        'verify' => 'admin.membership.offline.verify', 'reject' => 'admin.membership.offline.reject',
    ];
    $action = (string)($b['action'] ?? '');
    if (!isset($map[$action])) json_error('bad_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
