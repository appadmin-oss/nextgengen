<?php
/** Admin: programme calendar + Institutional Policy enforcement.
 *  Reads the settings/board, writes calendar days, infractions and sanctions. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'settings');
    if ($view === 'board')       $res = gs_call('admin.policy.board', ['requesterId' => $mid]);
    elseif ($view === 'integrity') $res = gs_call('admin.attendance.integrity', ['requesterId' => $mid]);
    elseif ($view === 'correctives') $res = gs_call('admin.policy.correctives', ['requesterId' => $mid]);
    elseif ($view === 'rules')   $res = gs_call('admin.policy.rules', ['requesterId' => $mid]);
    elseif ($view === 'person')  $res = gs_call('admin.policy.person', ['requesterId' => $mid, 'personId' => $_GET['personId'] ?? '', 'personType' => $_GET['personType'] ?? '']);
    else                         $res = gs_call('admin.policy.settings', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $map = [
        'save'           => 'admin.policy.save',
        'dayToggle'      => 'admin.policy.day.toggle',
        'infraction'     => 'admin.policy.infraction',
        'ruleBreach'     => 'admin.policy.ruleBreach',
        'rulebookSave'   => 'admin.policy.rulebookSave',
        'void'           => 'admin.policy.void',
        'sanctionIssue'  => 'admin.policy.sanction.issue',
        'sanctionUpdate' => 'admin.policy.sanction.update',
        'reinstate'      => 'admin.policy.reinstate',
        'sweep'          => 'admin.policy.sweep',
        'heldDecide'     => 'admin.attendance.held.decide',
        'unmatchedMatch' => 'admin.attendance.unmatched.match',
        'repair'         => 'admin.policy.absence.repair',
        'halfday'        => 'admin.policy.halfday.run',
        'prelate'        => 'admin.policy.prelate.run',
        'freshStart'     => 'admin.policy.fresh_start',
        'correctivesDone' => 'admin.policy.correctives.done',
    ];
    if (!isset($map[$action])) json_error('unknown_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    // Reinstatement answers "why not" with a list of unmet conditions, and the
    // absence alert with the next programme day. json_error() carries a single
    // string, so emit the structured refusal directly rather than throwing the
    // reason away and leaving the screen to say "failed".
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], is_array($res) ? $res : []), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
