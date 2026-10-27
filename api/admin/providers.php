<?php
/**
 * Admin: the awarding bodies outside NGG, what each awards, and who holds one
 * (domain/providers.php).
 *   GET  ?view=list|board|member
 *   POST action=save|delete|award|awardDelete|credential|credentialClear
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'board') $res = gs_call('admin.providers.board', ['requesterId' => $mid]);
    elseif ($view === 'member') $res = gs_call('admin.providers.member', ['requesterId' => $mid, 'memberId' => (string)($_GET['memberId'] ?? '')]);
    else $res = gs_call('admin.providers.list', ['requesterId' => $mid, 'withRetired' => !empty($_GET['withRetired'])]);
} else {
    $b = read_json_body();
    $a = (string)($b['action'] ?? '');
    $base = ['requesterId' => $mid, 'ip' => client_ip()];
    if ($a === 'save') $res = gs_call('admin.providers.save', $base + ['data' => (array)($b['data'] ?? [])]);
    elseif ($a === 'delete') $res = gs_call('admin.providers.delete', $base + ['providerId' => (string)($b['providerId'] ?? ''),
        'retire' => !empty($b['retire']), 'force' => !empty($b['force'])]);
    elseif ($a === 'award') $res = gs_call('admin.providers.award.save', $base + ['data' => (array)($b['data'] ?? [])]);
    elseif ($a === 'awardDelete') $res = gs_call('admin.providers.award.delete', $base + ['awardId' => (string)($b['awardId'] ?? ''),
        'retire' => !empty($b['retire']), 'force' => !empty($b['force'])]);
    elseif ($a === 'credential') $res = gs_call('admin.providers.credential.set', $base + ['memberId' => (string)($b['memberId'] ?? ''),
        'data' => (array)($b['data'] ?? [])]);
    elseif ($a === 'credentialClear') $res = gs_call('admin.providers.credential.clear', $base + ['credId' => (string)($b['credId'] ?? '')]);
    elseif ($a === 'seed') $res = gs_call('admin.providers.seed', $base);
    else $res = ['ok' => false, 'error' => 'unknown_action'];
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
