<?php
/** Admin: ID Card Studio (/club/id-cards) — the queue state, the reprint queue,
 *  single-person photo asks, after-print failures, and minting printed IDs.
 *  Each op checks the capability that owns the subject (summer | people).
 *  See _lib/domain/id-studio.php. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.ids.state', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $base = ['requesterId' => $s['mid'], 'ip' => client_ip()];
    switch ((string)($b['action'] ?? '')) {
        case 'reprint':   $res = gs_call('admin.ids.reprint.request', $base + ['items' => $b['items'] ?? []]); break;
        case 'printed':   $res = gs_call('admin.ids.reprint.done', $base + ['items' => $b['items'] ?? [], 'runId' => (string)($b['runId'] ?? '')]); break;
        case 'failed':    $res = gs_call('admin.ids.run.failed', $base + ['items' => $b['items'] ?? [], 'runId' => (string)($b['runId'] ?? '')]); break;
        case 'askPhoto':  $res = gs_call('admin.ids.photo.ask', $base + ['items' => $b['items'] ?? null, 'force' => !empty($b['force'])]); break;
        case 'design':    $res = gs_call('admin.ids.design.set', $base + ['kind' => (string)($b['kind'] ?? ''), 'templateId' => (string)($b['templateId'] ?? '')]); break;
        // Printed IDs for exactly the members about to be printed.
        case 'mintIds':   $res = gs_call('admin.ids.mint', $base + ['memberIds' => $b['memberIds'] ?? []]); break;
        default: json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
