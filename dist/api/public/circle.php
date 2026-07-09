<?php
/**
 * Anchor Circle portal (guardian / teacher / mentor) — code-based, read-only.
 * No account: pairing with a 6-digit code mints a signed portal token that the
 * portal presents on every subsequent call. Reads use GET; mutations use POST.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? '');
    if ($view === 'lookup')         $res = gs_call('circle.lookup', ['code' => $_GET['code'] ?? '']);
    elseif ($view === 'dashboard')  $res = gs_call('circle.dashboard', ['token' => $_GET['token'] ?? '']);
    elseif ($view === 'report')     $res = gs_call('circle.report', ['token' => $_GET['token'] ?? '']);
    else                            json_error('unknown_view', 400);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'connect')      $res = gs_call('circle.connect', array_merge($b, ['ip' => $ip]));
    elseif ($action === 'confirm')  $res = gs_call('circle.confirm', $b);
    elseif ($action === 'remark')   $res = gs_call('circle.remark', array_merge($b, ['ip' => $ip]));
    elseif ($action === 'cohort')   $res = gs_call('circle.cohort', $b); // POST: token list stays out of URLs/logs
    else                            json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
