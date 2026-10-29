<?php
/**
 * Admin: course placement and course health (domain/course-placement.php).
 *   GET  ?view=placement&status=&centre=&q=&page=   (ids=1 → every matching id)
 *   GET  ?view=health&centre=
 *   POST {action: confirm|set|add|remove, memberIds[], courses[] | course}
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = ($_GET['view'] ?? '') === 'health'
        ? gs_call('admin.courses.health', ['requesterId' => $s['mid'], 'centre' => $_GET['centre'] ?? ''])
        : gs_call('admin.courses.placement', ['requesterId' => $s['mid'], 'status' => $_GET['status'] ?? '', 'centre' => $_GET['centre'] ?? '',
                                              'q' => $_GET['q'] ?? '', 'page' => $_GET['page'] ?? 0, 'pageSize' => $_GET['pageSize'] ?? 0, 'ids' => !empty($_GET['ids'])]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('admin.courses.set', ['requesterId' => $s['mid'], 'action' => $b['action'] ?? '', 'memberIds' => $b['memberIds'] ?? [],
                                         'courses' => $b['courses'] ?? [], 'course' => $b['course'] ?? '', 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'forbidden' ? 403 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']);
json_ok($res);
