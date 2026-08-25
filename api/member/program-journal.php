<?php
/**
 * The Programme Journal — feed, memories, and authoring.
 *
 * Not to be confused with member/journal.php, which is a member's own private
 * Anchor reflections. This is the PROGRAMME's record: advice given,
 * contributions made, issues raised and how they resolved.
 *
 * Reads are open to any signed-in member because visibility is enforced INSIDE
 * the handler against the viewer's level — a member's query never loads a
 * staff-only row, so there is nothing for a presentation bug to leak later.
 * Writes require the `journal` capability (the journalist role), gated in the
 * domain layer rather than here.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = (string)($s['mid'] ?? '');

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'feed');
    $common = ['requesterId' => $mid, 'signedIn' => true];
    if ($view === 'memories') {
        $res = gs_call('journal.memories', $common);
    } elseif ($view === 'person') {
        $res = gs_call('journal.person', $common + ['personId' => (string)($_GET['personId'] ?? '')]);
    } elseif ($view === 'updates') {
        $res = gs_call('journal.updates', ['memberId' => $mid, 'entryId' => (string)($_GET['entryId'] ?? '')]);
    } else {
        $res = gs_call('journal.feed', $common + [
            'kind'     => (string)($_GET['kind'] ?? ''),
            'status'   => (string)($_GET['status'] ?? ''),
            'centreId' => (string)($_GET['centreId'] ?? ''),
            'q'        => (string)($_GET['q'] ?? ''),
            // "Needs attention" — one word rather than two filters the client
            // has to remember to combine the same way every time.
            'need'     => (string)($_GET['need'] ?? ''),
            'page'     => (int)($_GET['page'] ?? 1),
            'per'      => (int)($_GET['per'] ?? 20),
        ]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? 'save');
    $ip = client_ip();
    if ($action === 'save') {
        $res = gs_call('journal.save', array_merge($b, ['requesterId' => $mid, 'ip' => $ip]));
    } elseif ($action === 'visibility') {
        $res = gs_call('journal.visibility', ['requesterId' => $mid, 'entryId' => $b['entryId'] ?? '',
            'visibility' => $b['visibility'] ?? '', 'ip' => $ip]);
    } elseif ($action === 'share') {
        $res = gs_call('journal.share', ['requesterId' => $mid, 'entryId' => $b['entryId'] ?? '',
            'revoke' => !empty($b['revoke']), 'ip' => $ip]);
    } elseif ($action === 'follow') {
        $res = gs_call('journal.follow', ['memberId' => $mid, 'entryId' => $b['entryId'] ?? '']);
    } elseif ($action === 'update') {
        $res = gs_call('journal.update.add', ['requesterId' => $mid, 'entryId' => $b['entryId'] ?? '',
            'body' => (string)($b['body'] ?? ''), 'ip' => $ip]);
    } elseif ($action === 'propose') {
        $res = gs_call('journal.propose', ['memberId' => $mid, 'title' => (string)($b['title'] ?? ''),
            'body' => (string)($b['body'] ?? ''), 'kind' => (string)($b['kind'] ?? 'note'),
            'centreId' => (string)($b['centreId'] ?? ''), 'ip' => $ip]);
    } elseif ($action === 'publish') {
        $res = gs_call('journal.publish', ['requesterId' => $mid, 'entryId' => $b['entryId'] ?? '', 'ip' => $ip]);
    } elseif ($action === 'delete') {
        $res = gs_call('journal.delete', ['requesterId' => $mid, 'entryId' => $b['entryId'] ?? '', 'ip' => $ip]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
/* Whole refusal, so a form can show which field the server objected to instead
 * of a bare code — see api/public/selfreg.php for what the lossy version cost. */
if (empty($res['ok'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
