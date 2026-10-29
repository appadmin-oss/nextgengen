<?php
/** Admin: safeguarding cases. Only staff holding the `safeguarding`
 *  capability, within their centre scope; every read is audited. The report
 *  itself is never edited — notes and status are added beside it. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $caseNo = (string)($_GET['caseNo'] ?? '');
    $res = $caseNo !== ''
        ? gs_call('admin.sg.case', ['requesterId' => $s['mid'], 'caseNo' => $caseNo])
        : gs_call('admin.sg.cases', ['requesterId' => $s['mid'], 'centre' => (string)($_GET['centre'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('admin.sg.note', ['requesterId' => $s['mid'], 'caseNo' => $b['caseNo'] ?? '', 'note' => $b['note'] ?? '', 'status' => $b['status'] ?? '']);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
