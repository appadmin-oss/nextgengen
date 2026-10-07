<?php
/**
 * Admin: the NGG Club curriculum (domain/curriculum.php).
 * GET  ?view=list|get|report|schedule|submissions|seed|courses   POST action=upsert|status|import|ai|schedule|review|file|courses
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'get') $res = gs_call('admin.curriculum.get', ['requesterId' => $mid, 'unitId' => (string)($_GET['unitId'] ?? '')]);
    elseif ($view === 'seed') $res = gs_call('admin.curriculum.seed', ['requesterId' => $mid, 'key' => (string)($_GET['key'] ?? '')]);
    elseif ($view === 'courses') $res = gs_call('admin.club.catalogue.get', ['requesterId' => $mid]);
    elseif ($view === 'schedule') $res = gs_call('admin.curriculum.schedule', ['requesterId' => $mid]);
    elseif ($view === 'submissions') $res = gs_call('admin.curriculum.submissions', ['requesterId' => $mid, 'status' => (string)($_GET['status'] ?? 'pending')]);
    elseif ($view === 'report') $res = gs_call('admin.curriculum.report', ['requesterId' => $mid, 'course' => (string)($_GET['course'] ?? ''), 'memberId' => (string)($_GET['memberId'] ?? '')]);
    else $res = gs_call('admin.curriculum.list', ['requesterId' => $mid, 'course' => (string)($_GET['course'] ?? ''),
        'status' => (string)($_GET['status'] ?? ''), 'q' => (string)($_GET['q'] ?? '')]);
} elseif ($method === 'POST') {
    // A material file arrives as multipart; everything else is JSON.
    if (!empty($_FILES['file'])) {
        $f = $_FILES['file'];
        if ((int)($f['error'] ?? 1) !== UPLOAD_ERR_OK) json_send(['ok' => false, 'error' => (int)($f['error'] ?? 1) === UPLOAD_ERR_INI_SIZE ? 'too_large' : 'upload_failed'], 400);
        $res = gs_call('admin.curriculum.file', ['requesterId' => $mid, 'tmp' => (string)$f['tmp_name'], 'name' => (string)$f['name'], 'ip' => client_ip()]);
    } else {
        $b = read_json_body();
        /* The lessons may arrive as ONE string value (`rowsJson`) rather than a
           nested array. This host's firewall counts the values in a JSON body and
           refuses one with a few thousand — which a bundled course (48-72 lessons,
           each with materials and checks) always is, and the refusal never reaches
           PHP. The same workaround the roster import uses (admin/members.php). */
        if (is_string($b['rowsJson'] ?? null) && trim($b['rowsJson']) !== '') {
            $decoded = json_decode($b['rowsJson'], true);
            if (!is_array($decoded)) json_error('bad_rows_json', 400, 'The lessons could not be read. Choose the file again.');
            $b['rows'] = array_values($decoded);
        }
        $action = (string)($b['action'] ?? '');
        $res = match ($action) {
            'upsert' => gs_call('admin.curriculum.upsert', ['requesterId' => $mid, 'data' => is_array($b['data'] ?? null) ? $b['data'] : [],
                         'allowNewCourse' => !empty($b['allowNewCourse']), 'ip' => client_ip()]),
            'status' => gs_call('admin.curriculum.status', ['requesterId' => $mid, 'action' => (string)($b['status'] ?? ''),
                         'unitIds' => is_array($b['unitIds'] ?? null) ? $b['unitIds'] : [], 'ip' => client_ip()]),
            'import' => gs_call('admin.curriculum.import', ['requesterId' => $mid, 'rows' => is_array($b['rows'] ?? null) ? $b['rows'] : [],
                         'dryRun' => !empty($b['dryRun']), 'digest' => (string)($b['digest'] ?? ''), 'allowNewCourse' => !empty($b['allowNewCourse']),
                         'publish' => !empty($b['publish']), 'ip' => client_ip()]),
            'ai'     => gs_call('admin.curriculum.ai', ['requesterId' => $mid, 'title' => (string)($b['title'] ?? ''), 'text' => (string)($b['text'] ?? ''),
                         'course' => (string)($b['course'] ?? ''), 'level' => (string)($b['level'] ?? ''), 'checks' => (int)($b['checks'] ?? 5), 'ip' => client_ip()]),
            'review' => gs_call('admin.curriculum.review', ['requesterId' => $mid, 'decision' => (string)($b['decision'] ?? ''),
                         'materialIds' => is_array($b['materialIds'] ?? null) ? $b['materialIds'] : [], 'note' => (string)($b['note'] ?? ''), 'ip' => client_ip()]),
            'schedule' => gs_call('admin.curriculum.schedule', ['requesterId' => $mid, 'data' => is_array($b['data'] ?? null) ? $b['data'] : [], 'ip' => client_ip()]),
            'courses' => gs_call('admin.club.catalogue.set', ['requesterId' => $mid, 'catalogue' => $b['catalogue'] ?? null, 'reset' => !empty($b['reset']), 'ip' => client_ip()]),
            default  => ['ok' => false, 'error' => 'unknown_action'],
        };
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
