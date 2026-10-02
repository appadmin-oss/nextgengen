<?php
/** Admin: community moderation + channel management. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    if ($view === 'queue') $res = gs_call('admin.community.queue', ['requesterId' => $s['mid'], 'status' => $_GET['status'] ?? 'pending']);
    // Safeguarding cases are their own screen, never folded into the moderation
    // queue: "four things to review" and "a child said something about hurting
    // themselves" must not read as one number.
    elseif ($view === 'safeguarding') $res = gs_call('admin.community.safeguarding', ['requesterId' => $s['mid'], 'status' => $_GET['status'] ?? 'open']);
    else                   $res = gs_call('admin.community.overview', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'channel') {
        $res = gs_call('admin.community.channel.upsert', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => client_ip()]);
    } elseif ($action === 'safeguardingAck') {
        $res = gs_call('admin.community.safeguarding.ack', ['requesterId' => $s['mid'], 'caseId' => $b['caseId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'moderate') {
        $res = gs_call('admin.community.moderate', ['requesterId' => $s['mid'], 'kind' => $b['kind'] ?? 'post', 'id' => $b['id'] ?? '', 'action' => $b['do'] ?? '', 'ip' => client_ip()]);
    } elseif (($b['action'] ?? '') === 'moderation') {
        // How hard the feed is screened. Super-admin only, enforced in the
        // domain layer, and audited — see admin_community_moderation_set.
        $res = gs_call('admin.community.moderation', ['requesterId' => $s['mid'], 'mode' => $b['mode'] ?? '', 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
/* Featuring, hiding or removing a post changes the public Showcase, which is a
   cached read — moderating something offensive and having it stay on the public
   page for the rest of the TTL is the failure that matters here. */
if ($method === 'POST') cache_invalidate('community');
unset($res['ok']);
json_ok($res);
