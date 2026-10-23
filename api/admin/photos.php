<?php
/** Admin: photo review queue — the editor's console backend.
 *  Claim → edit → approve / request retake / (escalated) reject. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' && (string)($_GET['view'] ?? '') === 'backup') {
    // Every stored photo as one .zip, to keep before an update (photo_backup_zip).
    $res = gs_call('admin.photos.backup', ['requesterId' => $s['mid'], 'ip' => client_ip()]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $res['name'] . '"');
    header('Content-Length: ' . (string)filesize($res['path']));
    header('Cache-Control: no-store');
    readfile($res['path']);
    @unlink($res['path']);
    exit;
}
if ($method === 'GET') {
    // ?view=missing lists children with NO photograph on file — a different
    // question from the review queue, which only shows photos that exist.
    $res = (string)($_GET['view'] ?? '') === 'missing'
        ? gs_call('admin.photos.missing', ['requesterId' => $s['mid'], 'limit' => (int)($_GET['limit'] ?? 200)])
        : gs_call('admin.photo.queue', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    $base = ['requesterId' => $s['mid'], 'assetId' => $b['assetId'] ?? '', 'ip' => $ip];
    if ($action === 'claim')       $res = gs_call('admin.photo.claim', $base);
    elseif ($action === 'approve') $res = gs_call('admin.photo.approve', $base + ['editedUrl' => $b['editedUrl'] ?? '', 'note' => $b['note'] ?? '']);
    elseif ($action === 'retake')  $res = gs_call('admin.photo.retake', $base + ['reason' => $b['reason'] ?? '']);
    elseif ($action === 'reject')  $res = gs_call('admin.photo.reject', $base + ['reason' => $b['reason'] ?? '']);
    elseif ($action === 'edit')    $res = gs_call('admin.photo.edit', ['requesterId' => $s['mid'], 'ip' => $ip, 'assetId' => $b['assetId'] ?? '', 'subjectType' => $b['subjectType'] ?? '', 'subjectId' => $b['subjectId'] ?? '', 'spec' => $b['spec'] ?? []]);
    elseif ($action === 'secure')  $res = gs_call('admin.photos.secure', ['requesterId' => $s['mid'], 'ip' => $ip]);
    elseif ($action === 'materialise') $res = gs_call('admin.photos.materialise', ['requesterId' => $s['mid'], 'ip' => $ip, 'dryRun' => !empty($b['dryRun'])]);
    elseif ($action === 'relocate') $res = gs_call('admin.photos.relocate', ['requesterId' => $s['mid'], 'ip' => $ip, 'dryRun' => !empty($b['dryRun']), 'from' => (string)($b['from'] ?? '')]);
    elseif ($action === 'edit_bulk') $res = gs_call('admin.photo.edit.bulk', ['requesterId' => $s['mid'], 'ip' => $ip, 'items' => $b['items'] ?? [], 'spec' => $b['spec'] ?? []]);
    elseif ($action === 'request_missing') $res = gs_call('admin.photos.requestMissing', ['requesterId' => $s['mid'], 'ip' => $ip,
        'limit' => $b['limit'] ?? 50, 'quietDays' => $b['quietDays'] ?? 3]);
    elseif ($action === 'replace') $res = gs_call('admin.photo.replace', ['requesterId' => $s['mid'], 'ip' => $ip, 'subjectType' => $b['subjectType'] ?? '', 'subjectId' => $b['subjectId'] ?? '', 'sourceUrl' => $b['sourceUrl'] ?? '']);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
