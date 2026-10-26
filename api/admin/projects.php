<?php
/* Control Room › Mentorship › Projects (domain/projects.php). GET lists the
   projects in scope (or ?view=people&centre= for who may be put on one);
   POST {action: save|mark, …} sets one or a part of one. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $res = (string)($_GET['view'] ?? '') === 'people'
        ? gs_call('admin.projects.people', ['requesterId' => $s['mid'], 'centre' => (string)($_GET['centre'] ?? '')])
        : gs_call('admin.projects', ['requesterId' => $s['mid'], 'centre' => (string)($_GET['centre'] ?? '')]);
} else {
    $b = read_json_body();
    $act = (string)($b['action'] ?? '');
    $args = ['requesterId' => $s['mid'], 'ip' => client_ip()];
    if ($act === 'save') {
        foreach (['projectId', 'title', 'detail', 'startOn', 'dueOn', 'status', 'centre'] as $k) $args[$k] = (string)($b[$k] ?? '');
        $args['people'] = is_array($b['people'] ?? null) ? $b['people'] : [];
        $res = gs_call('admin.project.save', $args);
    } elseif ($act === 'mark') {
        foreach (['projectId', 'kind', 'personId', 'status', 'note'] as $k) $args[$k] = (string)($b[$k] ?? '');
        $res = gs_call('admin.project.mark', $args);
    } else json_error('unknown_action', 400);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']);
json_ok($res);
