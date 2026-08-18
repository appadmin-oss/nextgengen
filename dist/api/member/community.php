<?php
/** Member: the community feed — channels, posts, reactions, comments, bookmarks. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'feed');
    if ($view === 'channels')      $res = gs_call('community.channels', ['memberId' => $s['mid']]);
    elseif ($view === 'comments')  $res = gs_call('community.comments', ['memberId' => $s['mid'], 'postId' => $_GET['postId'] ?? '']);
    elseif ($view === 'digest')    $res = gs_call('community.digest', ['channel' => $_GET['channel'] ?? 'all']);
    elseif ($view === 'mention')   $res = gs_call('community.mentionSearch', ['q' => $_GET['q'] ?? '', 'memberId' => $s['mid']]);
    elseif ($view === 'search')    $res = gs_call('community.search', ['memberId' => $s['mid'], 'q' => $_GET['q'] ?? '', 'channel' => $_GET['channel'] ?? '']);
    elseif ($view === 'members')   $res = gs_call('community.channelMembers', ['channel' => $_GET['channel'] ?? '']);
    // The Today screen's filter-chip counts, in one request rather than three.
    elseif ($view === 'today')     $res = gs_call('community.today', ['memberId' => $s['mid']]);
    else                           $res = gs_call('community.feed', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? 'all', 'sort' => $_GET['sort'] ?? 'latest', 'page' => (int)($_GET['page'] ?? 0)]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'post') {
        rate_limit_check('community.post');
        $res = gs_call('community.post', ['memberId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => client_ip()]);
    } elseif ($action === 'react') {
        $res = gs_call('community.react', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'emoji' => $b['emoji'] ?? '']);
    } elseif ($action === 'comment') {
        rate_limit_check('community.post');
        $res = gs_call('community.comment', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'body' => $b['body'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'bookmark') {
        $res = gs_call('community.bookmark', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '']);
    } elseif ($action === 'vote') {
        $res = gs_call('community.pollVote', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'choice' => $b['choice'] ?? -1]);
    } elseif ($action === 'report') {
        $res = gs_call('community.report', ['memberId' => $s['mid'], 'targetType' => $b['targetType'] ?? 'post', 'targetId' => $b['targetId'] ?? '', 'reason' => $b['reason'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        $res = gs_call('community.delete', ['memberId' => $s['mid'], 'targetType' => $b['targetType'] ?? 'post', 'targetId' => $b['targetId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'markRead') {
        $res = gs_call('community.markRead', ['memberId' => $s['mid'], 'channel' => $b['channel'] ?? '']);
    } elseif ($action === 'star') {
        $res = gs_call('community.star', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
