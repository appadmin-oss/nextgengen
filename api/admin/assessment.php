<?php
/**
 * Admin: baseline/endline learning measurement.
 *
 * Instruments, administration windows, the score sheet, and the paired
 * analysis. See api/_lib/domain/assessment.php for why each of those is a
 * separate thing.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'instruments');
    if ($view === 'instruments')   $res = gs_call('admin.assessment.instruments', ['requesterId' => $s['mid']]);
    elseif ($view === 'windows')   $res = gs_call('admin.assessment.windows', ['requesterId' => $s['mid']]);
    elseif ($view === 'sheet')     $res = gs_call('admin.assessment.sheet', ['requesterId' => $s['mid'],
        'windowId' => (string)($_GET['windowId'] ?? ''), 'centre' => (string)($_GET['centre'] ?? '')]);
    elseif ($view === 'gains')     $res = gs_call('admin.assessment.gains', ['requesterId' => $s['mid'],
        'instrumentId' => (string)($_GET['instrumentId'] ?? '')]);
    elseif ($view === 'catalogue') $res = gs_call('admin.assessment.catalogue', ['requesterId' => $s['mid']]);
    else json_error('unknown_view', 400);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'instrument_save')        $res = gs_call('admin.assessment.instrument.save', ['requesterId' => $s['mid'],
        'instrumentId' => $b['instrumentId'] ?? '', 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'instrument_revise')  $res = gs_call('admin.assessment.instrument.revise', ['requesterId' => $s['mid'],
        'instrumentId' => $b['instrumentId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'window_save')        $res = gs_call('admin.assessment.window.save', ['requesterId' => $s['mid'],
        'windowId' => $b['windowId'] ?? '', 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'record')             $res = gs_call('admin.assessment.record', ['requesterId' => $s['mid'],
        'windowId' => $b['windowId'] ?? '', 'results' => $b['results'] ?? [], 'ip' => $ip]);
    elseif ($action === 'adopt')              $res = gs_call('admin.assessment.adopt', ['requesterId' => $s['mid'],
        'keys' => $b['keys'] ?? [], 'ip' => $ip]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    /* These refusals carry detail the screen has to show: WHICH children were
       rejected and why an instrument would not save. A bare code sends a
       coordinator to the logs for something we can simply say. */
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
