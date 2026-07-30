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
