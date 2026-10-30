<?php
/** Admin: official notices — write, preview, publish, correct, withdraw; who has read and acknowledged them. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'readers') $res = gs_call('admin.notices.readers', ['requesterId' => $mid, 'noticeId' => (string)($_GET['noticeId'] ?? '')]);
    else $res = gs_call('admin.notices.list', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $map = ['parse' => 'admin.notices.parse', 'preview' => 'admin.notices.preview', 'save' => 'admin.notices.save', 'delete' => 'admin.notices.delete',
            'publish' => 'admin.notices.publish', 'withdraw' => 'admin.notices.withdraw', 'remind' => 'admin.notices.remind'];
    $action = (string)($b['action'] ?? '');
    if (!isset($map[$action])) json_error('unknown_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    // The refusal carries its field and words, so a form can put them where they belong.
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], is_array($res) ? $res : []), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
