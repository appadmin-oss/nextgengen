<?php
/** Admin: analytics workspace (4-level M&E). Read + drill-down + activity log. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $in = read_json_body();
    $action = (string)($in['action'] ?? '');
    if ($action === 'drilldown') {
        $res = gs_call('analytics.drilldown', array_merge($in, ['requesterId' => $s['mid']]));
    } elseif ($action === 'activity.add') {
        $res = gs_call('analytics.activity.add', array_merge($in, ['requesterId' => $s['mid']]));
    } elseif ($action === 'champions.mint') {
        $res = gs_call('admin.champions.mint', ['requesterId' => $s['mid'], 'period' => $in['period'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'insight.ask') {
        /* Level 7b · asking the analyst panel a question. A POST because it
         * spends money on every call and writes a turn — neither belongs on
         * something a browser will replay from history or prefetch. */
        $res = gs_call('analytics.insight.ask', [
            'requesterId' => $s['mid'],
            'question' => $in['question'] ?? '',
            'threadId' => $in['threadId'] ?? '',
            'centre' => $in['centre'] ?? '',
            'week' => $in['week'] ?? '', 'range' => $in['week'] ?? '',
            // 'quick' caps the panel at one lens. Anything else means the router
            // decides, up to three.
            'depth' => $in['depth'] ?? '',
            'ip' => client_ip(),
        ]);
        if (empty($res['ok'])) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            /* These refusals carry detail the screen needs: WHICH field would
               have identified somebody, or that the hourly budget is spent. A
               bare code sends an admin to the logs for something we can say. */
            echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
            exit;
        }
    } elseif ($action === 'insight.archive') {
        $res = gs_call('analytics.insight.archive', ['requesterId' => $s['mid'], 'threadId' => $in['threadId'] ?? '']);
    } elseif ($action === 'insight.rename') {
        $res = gs_call('analytics.insight.rename', ['requesterId' => $s['mid'],
            'threadId' => $in['threadId'] ?? '', 'title' => $in['title'] ?? '']);
    } else {
        json_error('unknown_action', 400);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']); json_ok($res);
}

/* Level 5 · Growth Potential is fetched separately.
 *
 * It scores every active student over a four-week window, so folding it into
 * the main workspace read would make every visit to Levels 1–4 pay for work
 * nobody had asked to see. Memoised on top of that, stamped with the attendance
 * high-water mark: a new check-in is the only thing that can move a trajectory,
 * so the stamp invalidates precisely when the answer changes and not otherwise.
 */
/* Level 6 · depth — comparison, segmentation, rigour, narrative. Separate op and
 * separate cache for the same reason as growth: it walks every student over two
 * windows, and the descriptive levels must not pay for it. */
if (($_GET['view'] ?? '') === 'depth') {
    $centre = (string)($_GET['centre'] ?? '');
    $stamp = 'a' . (string)(db_row('SELECT COALESCE(MAX(id),0) v FROM attendance')['v'] ?? '0')
           . '.n' . (string)(db_row('SELECT COALESCE(MAX(id),0) v FROM summer_students')['v'] ?? '0');
    $key = 'depth_' . substr(hash('sha256', $s['mid'] . '|' . $centre . '|'
         . (string)($_GET['week'] ?? '') . '|' . (string)($_GET['rowDim'] ?? '') . '|' . (string)($_GET['colDim'] ?? '')), 0, 16);
    $res = cache_remember($key, 300, fn() => gs_call('analytics.depth', [
        'requesterId' => $s['mid'], 'centre' => $centre,
        'week' => $_GET['week'] ?? '', 'day' => $_GET['day'] ?? '',
        'rowDim' => $_GET['rowDim'] ?? '', 'colDim' => $_GET['colDim'] ?? '',
    ]), $stamp);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']); json_ok($res);
}

/* Level 7 · the analyst panel. Several model calls per run, so it is NEVER
 * fetched with the page: the client asks for it explicitly and can force a
 * re-run. Its own caching lives in the domain (fingerprinted on the evidence),
 * so there is deliberately no cache_remember wrapper here — two caches with
 * different rules over one expensive thing is how you get an answer nobody can
 * explain the age of. */
if (($_GET['view'] ?? '') === 'insight') {
    $res = gs_call('analytics.insight', [
        'requesterId' => $s['mid'], 'centre' => $_GET['centre'] ?? '',
        'week' => $_GET['week'] ?? '', 'range' => $_GET['week'] ?? '',
        'force' => ($_GET['force'] ?? '') === '1', 'ip' => client_ip(),
    ]);
    if (empty($res['ok'])) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        // The privacy refusal carries its reasons — an admin needs to see WHICH
        // field would have leaked, not just that something did.
        echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
        exit;
    }
    unset($res['ok']); json_ok($res);
}

/* Level 7b · the analyst chat.
 *
 * Reads are GETs and cheap. Asking is a POST — it spends money, it writes a
 * turn, and it must not be replayable from a link in a browser's history. No
 * cache_remember on any of it: a thread is a record of what was said, and a
 * cached thread would hide the turn that was just added to it. */
if (($_GET['view'] ?? '') === 'chat') {
    $op = (string)($_GET['op'] ?? 'threads');
    if ($op === 'threads') {
        $res = gs_call('analytics.insight.threads', ['requesterId' => $s['mid']]);
    } elseif ($op === 'thread') {
        $res = gs_call('analytics.insight.thread', ['requesterId' => $s['mid'], 'threadId' => $_GET['threadId'] ?? '']);
    } else {
        json_error('bad_op', 400);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']); json_ok($res);
}

if (($_GET['view'] ?? '') === 'growth') {
    $centre = (string)($_GET['centre'] ?? '');
    $weeks  = (string)($_GET['weeks'] ?? '');
    $stamp = 'a' . (string)(db_row('SELECT COALESCE(MAX(id),0) v FROM attendance')['v'] ?? '0')
           . '.s' . (string)(db_row('SELECT COALESCE(MAX(id),0) v FROM assignment_submissions')['v'] ?? '0');
    $key = 'growth_' . substr(hash('sha256', $s['mid'] . '|' . $centre . '|' . $weeks), 0, 16);
    $res = cache_remember($key, 300, fn() => gs_call('analytics.growth', [
        'requesterId' => $s['mid'], 'centre' => $centre, 'weeks' => $weeks,
    ]), $stamp);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']); json_ok($res);
}

$res = gs_call('analytics.workspace', [
    'requesterId' => $s['mid'],
    'week'       => $_GET['week'] ?? '',
    'day'        => $_GET['day'] ?? '',
    'centre'     => $_GET['centre'] ?? '',
    'department' => $_GET['department'] ?? '',
    'category'   => $_GET['category'] ?? '',
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
