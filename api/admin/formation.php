<?php
/**
 * Admin: the Saturday Formation Schedule (domain/saturday-formation.php).
 * GET ?scope= one version of the day with its checks, every version and every Saturday off.
 * POST action = save | add | remove | move | shift | version.create | version.delete | day.set
 * (capability: content; a centre-scoped admin, their own centres' days only).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
const FORMATION_ACTIONS = [
    'save' => ['admin.formation.save', ['scope', 'key', 'start', 'end', 'title', 'flow', 'purpose', 'quote', 'for', 'kind', 'ripple']],
    'add' => ['admin.formation.add', ['scope', 'after', 'title', 'start', 'end', 'minutes', 'kind', 'flow', 'purpose', 'quote', 'for', 'copyOf', 'ripple']],
    'remove' => ['admin.formation.remove', ['scope', 'key', 'close']],
    'move' => ['admin.formation.move', ['scope', 'key', 'dir']],
    'shift' => ['admin.formation.shift', ['scope', 'minutes', 'startAt', 'from']],
    'version.create' => ['admin.formation.version.create', ['scope']],
    'version.delete' => ['admin.formation.version.delete', ['scope']],
    'day.set' => ['admin.formation.day.set', ['date', 'centre', 'off', 'note']],
];
if ($method === 'GET') {
    $res = gs_call('admin.formation.list', ['requesterId' => $s['mid'], 'scope' => (string)($_GET['scope'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $a = FORMATION_ACTIONS[(string)($b['action'] ?? '')] ?? null;
    if (!$a) json_error('unknown_action', 400);
    $res = gs_call($a[0], ['requesterId' => $s['mid'], 'ip' => client_ip()] + array_intersect_key($b, array_flip($a[1])));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
