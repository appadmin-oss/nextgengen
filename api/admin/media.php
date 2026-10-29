<?php
/** Admin: Cloudinary storage — the usage breakdown, a fresh read, and freeing space (media-storage.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' && ($_GET['view'] ?? '') === 'objects') {
    $res = gs_call('admin.media.objects', ['requesterId' => $s['mid']]);
} elseif ($method === 'GET' && ($_GET['view'] ?? '') === 'accounts') {
    $res = gs_call('admin.media.accounts', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST' && in_array((string)(($b = read_json_body())['action'] ?? ''), ['accountSave', 'accountRemove', 'accountMove', 'accountCheck'], true)) {
    rate_limit_check_actor('media.accounts', (string)$s['mid']);
    $res = gs_call('admin.media.' . (string)$b['action'], ['requesterId' => $s['mid'], 'ip' => client_ip(),
        'id' => (string)($b['id'] ?? ''), 'label' => $b['label'] ?? null, 'cloudName' => $b['cloudName'] ?? null, 'apiKey' => $b['apiKey'] ?? null,
        'apiSecret' => (string)($b['apiSecret'] ?? ''), 'dir' => (string)($b['dir'] ?? '')] + (array_key_exists('enabled', $b) ? ['enabled' => !empty($b['enabled'])] : []));
} elseif ($method === 'GET') {
    $res = gs_call('admin.media.usage', ['requesterId' => $s['mid'], 'refresh' => !empty($_GET['refresh'])]);
} elseif ($method === 'POST' && (string)(($b = $b ?? read_json_body())['action'] ?? '') === 'sweepObjects') {
    rate_limit_check_actor('media.purge', (string)$s['mid']);
    $res = gs_call('admin.media.objects', ['requesterId' => $s['mid'], 'sweep' => true, 'ip' => client_ip()]);
} elseif ($method === 'POST' && (string)($b['action'] ?? '') === 'account') {
    $res = gs_call('admin.media.account', ['requesterId' => $s['mid'], 'use' => (string)($b['use'] ?? ''), 'ip' => client_ip()]);
} elseif ($method === 'POST') {
    if ((string)($b['action'] ?? '') !== 'purgeDerived') json_error('unknown_action', 400);
    rate_limit_check_actor('media.purge', (string)$s['mid']);
    $res = gs_call('admin.media.purgeDerived', ['requesterId' => $s['mid'], 'confirm' => (string)($b['confirm'] ?? ''), 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false, 'error' => $res['error'] ?? 'failed'] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
