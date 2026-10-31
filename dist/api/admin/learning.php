<?php
/**
 * Admin: learning outside NGG, and achievements (domain/achievements.php).
 *   GET  ?view=list&status=pending|confirmed|returned[&memberId]
 *   GET  ?view=overview[&centre]          how each member is doing
 *   GET  ?view=achievements&memberId      one member's achievements
 *   POST action=review, entryIds, decision=confirmed|returned, note
 *   POST action=import, platform, rows, apply
 *   POST action=award, memberId, name, category, period, note
 *   POST action=awardRemove, awardId
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'overview') $res = gs_call('admin.learning.overview', ['requesterId' => $mid, 'centre' => (string)($_GET['centre'] ?? '')]);
    elseif ($view === 'achievements') $res = gs_call('admin.members.achievements', ['requesterId' => $mid, 'memberId' => (string)($_GET['memberId'] ?? '')]);
    else $res = gs_call('admin.learning.list', ['requesterId' => $mid, 'status' => (string)($_GET['status'] ?? 'pending'), 'memberId' => (string)($_GET['memberId'] ?? '')]);
} else {
    $b = read_json_body();
    $a = (string)($b['action'] ?? '');
    $base = ['requesterId' => $mid, 'ip' => client_ip()];
    if ($a === 'review') $res = gs_call('admin.learning.review', $base + ['entryIds' => (array)($b['entryIds'] ?? []), 'decision' => (string)($b['decision'] ?? ''), 'note' => (string)($b['note'] ?? '')]);
    elseif ($a === 'import') $res = gs_call('admin.learning.import', $base + ['platform' => (string)($b['platform'] ?? ''), 'rows' => (array)($b['rows'] ?? []), 'apply' => !empty($b['apply'])]);
    elseif ($a === 'award') $res = gs_call('admin.members.award.add', $base + ['memberId' => (string)($b['memberId'] ?? ''), 'name' => (string)($b['name'] ?? ''),
        'category' => (string)($b['category'] ?? ''), 'period' => (string)($b['period'] ?? ''), 'note' => (string)($b['note'] ?? '')]);
    elseif ($a === 'awardRemove') $res = gs_call('admin.members.award.remove', $base + ['awardId' => (string)($b['awardId'] ?? '')]);
    else $res = ['ok' => false, 'error' => 'unknown_action'];
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
