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
    // Every file shared in a channel — the Files screen.
    elseif ($view === 'files')     $res = gs_call('community.files', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? '', 'kind' => $_GET['kind'] ?? 'all']);
    // The Today screen's filter-chip counts, in one request rather than three.
    elseif ($view === 'today')     $res = gs_call('community.today', ['memberId' => $s['mid']]);
    // One post by id — deep links (a shared url, a notification) resolve here.
    elseif ($view === 'post')      $res = gs_call('community.post.get', ['memberId' => $s['mid'], 'postId' => $_GET['postId'] ?? '']);
    // Homework: one task (the widget and the tracker screen) or the channel's list.
    elseif ($view === 'homework')  $res = gs_call('community.homework', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? '', 'homeworkId' => $_GET['homeworkId'] ?? '']);
    elseif ($view === 'homeworkList') $res = gs_call('community.homeworkList', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? '']);
    // Who is typing. Read on the channel's existing poll — no extra timer.
    elseif ($view === 'typing')    $res = gs_call('community.typingWho', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? '']);
    // Community v3: the viewer, once; the home carousel; homework as a board;
    // files across the viewer's channels; a video's chapters and captions.
    elseif ($view === 'v3boot')    $res = gs_call('community.v3boot', ['memberId' => $s['mid']]);
    elseif ($view === 'home')      $res = gs_call('community.home', ['memberId' => $s['mid']]);
    elseif ($view === 'hwBoard')   $res = gs_call('community.hwBoard', ['memberId' => $s['mid']]);
    elseif ($view === 'v3files')   $res = gs_call('community.v3files', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? '']);
    elseif ($view === 'media')     $res = gs_call('community.media', ['memberId' => $s['mid'], 'postId' => $_GET['postId'] ?? '']);
    elseif ($view === 'videoPoints') $res = gs_call('community.videoPoints', ['memberId' => $s['mid'], 'postId' => $_GET['postId'] ?? '']);
    else                           $res = gs_call('community.feed', ['memberId' => $s['mid'], 'channel' => $_GET['channel'] ?? 'all', 'sort' => $_GET['sort'] ?? 'latest', 'page' => (int)($_GET['page'] ?? 0), 'scope' => $_GET['scope'] ?? '']);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'post') {
        // Two buckets: a generous ceiling on the shared centre address, and the
        // real limit on the person. Keyed on the member so one busy classroom
        // cannot lock out the rest of the room.
        rate_limit_check('community.post.ip');
        rate_limit_check('community.post', $s['mid']);
        $res = gs_call('community.post', ['memberId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => client_ip()]);
    } elseif ($action === 'react') {
        $res = gs_call('community.react', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'emoji' => $b['emoji'] ?? '']);
    } elseif ($action === 'comment') {
        rate_limit_check('community.post.ip');
        rate_limit_check('community.post', $s['mid']);
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
    } elseif ($action === 'homework') {
        $res = gs_call('community.homeworkSet', ['memberId' => $s['mid'], 'data' => $b['data'] ?? []]);
    } elseif ($action === 'homeworkSeen') {
        $res = gs_call('community.homeworkSeen', ['memberId' => $s['mid'], 'homeworkId' => $b['homeworkId'] ?? '']);
    } elseif ($action === 'homeworkSubmit') {
        $res = gs_call('community.homeworkSubmit', ['memberId' => $s['mid'], 'homeworkId' => $b['homeworkId'] ?? '', 'note' => $b['note'] ?? '', 'postId' => $b['postId'] ?? '']);
    } elseif ($action === 'homeworkReview') {
        $res = gs_call('community.homeworkReview', ['memberId' => $s['mid'], 'homeworkId' => $b['homeworkId'] ?? '', 'who' => $b['who'] ?? '']);
    } elseif ($action === 'homeworkNudge') {
        /* Rate limited twice over: once per mentor here so a script cannot
           hammer the endpoint, and once per child per day in the domain, which
           is the rule the screen actually states. */
        rate_limit_check('community.nudge', $s['mid']);
        $res = gs_call('community.homeworkNudge', ['memberId' => $s['mid'], 'homeworkId' => $b['homeworkId'] ?? '', 'who' => $b['who'] ?? '', 'all' => !empty($b['all'])]);
    } elseif ($action === 'typing') {
        /* Written only while somebody is really typing, throttled on the client
           and again in the domain. The bucket here is the runaway-script
           ceiling, sized well above a fast typist's one write per 3s. */
        rate_limit_check('community.typing', $s['mid']);
        $res = empty($b['stop'])
            ? gs_call('community.typingPing', ['memberId' => $s['mid'], 'channel' => $b['channel'] ?? ''])
            : gs_call('community.typingStop', ['memberId' => $s['mid'], 'channel' => $b['channel'] ?? '']);
    } elseif ($action === 'answer') {
        $res = gs_call('community.answer', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'commentId' => $b['commentId'] ?? '']);
    } elseif ($action === 'videoPos') {
        $res = gs_call('community.videoPos', ['memberId' => $s['mid'], 'postId' => $b['postId'] ?? '', 'pos' => $b['pos'] ?? 0, 'dur' => $b['dur'] ?? 0]);
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
