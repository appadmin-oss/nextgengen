<?php
/**
 * The one HTTP contract for support cases, shared by the member and family
 * routes, which have already decided `$who` from their own session. Kept in
 * one file so the two portals cannot drift into different rules.
 */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$source = $who['kind'] === 'guardian' ? 'family' : 'portal';
if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'meta');
    if ($view === 'file') {
        $r = backend_dispatch('support.file', ['who' => $who, 'caseNo' => (int)($_GET['caseNo'] ?? 0), 'fileId' => (string)($_GET['f'] ?? '')]);
        if (empty($r['ok'])) json_error($r['error'] ?? 'not_found', 404);
        header('Content-Type: ' . $r['type']);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        header('Content-Disposition: ' . ($r['type'] === 'application/pdf' ? 'attachment' : 'inline') . '; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $r['name']) . '"');
        readfile($r['path']); exit;
    }
    $res = match ($view) {
        'suggest' => gs_call('support.suggest', ['q' => (string)($_GET['q'] ?? ''), 'category' => (string)($_GET['category'] ?? '')]),
        'mine'    => gs_call('support.mine', ['who' => $who]),
        'case'    => gs_call('support.case', ['who' => $who, 'caseNo' => (int)($_GET['caseNo'] ?? 0)]),
        default   => gs_call('support.meta', ['who' => $who]),
    };
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $base = ['who' => $who, 'ip' => client_ip()];
    if ($action === 'open') {
        rate_limit_check_actor('support.open', $who['id']);
        $src = ($b['source'] ?? '') === 'community' && $source === 'portal' ? 'community' : $source;
        $res = gs_call('support.open', $base + array_intersect_key($b, array_flip(['category', 'subcategory', 'priority', 'subject', 'body', 'memberId', 'files', 'pageUrl']))
            + ['userAgent' => (string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 'source' => $src]);
    } elseif (in_array($action, ['reply', 'solve', 'rate'], true)) {
        rate_limit_check_actor('support.write', $who['id']);
        $res = gs_call('support.' . $action, $base + ['caseNo' => (int)($b['caseNo'] ?? 0), 'body' => (string)($b['body'] ?? ''),
            'files' => is_array($b['files'] ?? null) ? $b['files'] : [], 'rating' => (int)($b['rating'] ?? 0), 'note' => (string)($b['note'] ?? '')]);
    } else json_error('unknown_action', 400);
} else json_error('method_not_allowed', 405);
if (empty($res['ok'])) { http_response_code(($res['error'] ?? '') === 'not_found' ? 404 : 400); echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES); exit; }
unset($res['ok']); json_ok($res);
