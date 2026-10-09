<?php
/** NGG Club coordinator — roster + Summer→Club promotion. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    if ($view === 'promoteOptions') {
        $res = gs_call('admin.club.promote.options', ['requesterId' => $mid, 'studentId' => (string)($_GET['studentId'] ?? '')]);
    } elseif ($view === 'promotable') {
        $res = gs_call('admin.club.promotable', ['requesterId' => $mid,
            'q' => $_GET['q'] ?? '', 'centre' => $_GET['centre'] ?? '', 'track' => $_GET['track'] ?? '',
            'editionId' => $_GET['editionId'] ?? '', 'groupId' => $_GET['groupId'] ?? '',
            'page' => $_GET['page'] ?? null, 'pageSize' => $_GET['pageSize'] ?? null]);
    } elseif ($view === 'members') {
        /* `status` is forwarded only when the caller SENT it, so the domain's
           "absent means active" default survives — forwarding '' would turn
           every request into "every status" and quietly change what the roster
           shows. */
        $args = ['requesterId' => $mid, 'q' => $_GET['q'] ?? '', 'centre' => $_GET['centre'] ?? '',
                 'sort' => $_GET['sort'] ?? '', 'dir' => $_GET['dir'] ?? '',
                 'page' => $_GET['page'] ?? null, 'pageSize' => $_GET['pageSize'] ?? null,
                 'all' => $_GET['all'] ?? null];
        if (array_key_exists('status', $_GET)) $args['status'] = (string)$_GET['status'];
        $res = gs_call('admin.club.members', $args);
    }
    else                         $res = gs_call('admin.club.overview', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'promote') {
        $res = gs_call('admin.club.promote', ['requesterId' => $mid, 'studentId' => $b['studentId'] ?? '', 'centre' => (string)($b['centre'] ?? ''), 'ip' => client_ip()]);
    } elseif ($action === 'promoteBulk') {
        $res = gs_call('admin.club.promote.bulk', ['requesterId' => $mid, 'studentIds' => $b['studentIds'] ?? [], 'centres' => is_array($b['centres'] ?? null) ? $b['centres'] : [], 'ip' => client_ip()]);
    } elseif ($action === 'bulk') {
        // `action` on the wire picks the route branch; `op` names the bulk
        // action, so one key never has to mean two things.
        $res = gs_call('admin.club.members.bulk', array_merge(is_array($b) ? $b : [],
            ['action' => (string)($b['op'] ?? ''), 'requesterId' => $mid, 'ip' => client_ip()]));
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
