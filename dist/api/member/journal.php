<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    /* view=mine is the §8a screen in one request — strip, prompt, stats,
       filters, timeline and the year-ago card. The older shape stays exactly
       as it was for the anchor reflection flow that still calls it. */
    if (($_GET['view'] ?? '') === 'mine') {
        $res = gs_call('journal.mine', ['memberId' => $s['mid'], 'skip' => (int)($_GET['skip'] ?? 0)]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
        unset($res['ok']);
        json_ok($res);
    }
    // Scope strictly to the caller's own journal. A client-supplied ?memberId
    // let any authenticated member read another member's non-private entries
    // (IDOR). Admin/mentor review runs through the admin routes, not here.
    $res = gs_call('anchor.journal.list', [
        'memberId'    => $s['mid'],
        'requesterId' => $s['mid'],
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $act = (string)($body['action'] ?? '');
    if ($act === 'save' || $act === 'mood' || $act === 'delete') {
        rate_limit_check('journal.write', $s['mid']);
        $res = $act === 'save'
            ? gs_call('journal.mine.save', ['memberId' => $s['mid'], 'data' => $body['data'] ?? [], 'ip' => client_ip()])
            : ($act === 'mood'
                ? gs_call('journal.mine.mood', ['memberId' => $s['mid'], 'mood' => $body['mood'] ?? 0])
                : gs_call('journal.mine.delete', ['memberId' => $s['mid'], 'entryId' => $body['entryId'] ?? '', 'ip' => client_ip()]));
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
        unset($res['ok']);
        json_ok($res);
    }
    $res = gs_call('anchor.journal.create', [
        'memberId' => $s['mid'],
        'mood'     => $body['mood']     ?? '',
        'body'     => $body['body']     ?? '',
        'private'  => $body['private']  ?? true,
        'ip'       => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
