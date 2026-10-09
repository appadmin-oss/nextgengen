<?php
/** Admin: site settings. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    if ((string)($_GET['view'] ?? '') === 'aiKeys') {
        $res = gs_call('admin.ai.keys.get', ['requesterId' => $s['mid']]);
    } elseif ((string)($_GET['view'] ?? '') === 'ai') {
        // ?probe=1 sends one real request per live profile — the only way to
        // tell a working key from a merely present one.
        $res = gs_call('admin.ai.status', ['requesterId' => $s['mid'], 'probe' => !empty($_GET['probe']), 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.settings.get', ['requesterId' => $s['mid']]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    if (($b['action'] ?? '') === 'aiKeys') {
        $res = gs_call('admin.ai.keys.set', array_merge($b, ['requesterId' => $s['mid'], 'ip' => client_ip()]));
    } elseif (($b['action'] ?? '') === 'aiKeysTest') {
        $res = gs_call('admin.ai.keys.test', ['requesterId' => $s['mid'], 'ip' => client_ip()]);
    } elseif (($b['action'] ?? '') === 'testMail') {
        $res = gs_call('admin.mail.test', ['requesterId' => $s['mid'], 'to' => (string)($b['to'] ?? ''), 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.settings.set', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? $b, 'ip' => client_ip()]);
    }
} else { json_error('method_not_allowed', 405); }
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
