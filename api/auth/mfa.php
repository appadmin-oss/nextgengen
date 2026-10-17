<?php
/**
 * Two-step sign-in (domain/mfa.php) for whoever is signed in: a member, a
 * card-holding volunteer/instructor/mentor, or (?who=family) a guardian.
 * Reachable by a session that still OWES its second step — this is where it
 * pays it — and passing (or a desk's ten-minute let-in) re-signs the cookie.
 *
 * GET                       status: kind, methods, enrolled, policy, pending
 * POST action=challenge     what to ask (and sends the email code)
 * POST action=verify        {answer}
 * POST action=start         {type}         begin setting up
 * POST action=enroll        {type, question, answer | pin | code, current}
 * POST action=off           {current}
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
session_allow_mfa_pending();
$family = (string)($_GET['who'] ?? '') === 'family';
if ($family) {
    $f = require_family();
    $id = $f['gid']; $who = 'guardian'; $pending = $f['mfaP'];
} else {
    $s = require_session();
    if (!empty($s['kiosk'])) json_error('forbidden', 403);
    $id = (string)$s['mid'];
    $who = function_exists('session_is_cardholder') && session_is_cardholder($s) ? (strtolower((string)($s['role'] ?? '')) === 'volunteer' ? 'volunteer' : 'student') : 'member';
    if ($who === 'student') json_error('not_available', 400);
    $pending = (string)($s['mfaP'] ?? '');
}
$base = ['requesterId' => $id, 'who' => $who, 'ip' => client_ip()];
/** The step is passed: re-sign the cookie so every route opens. */
$clear = function () use ($family, &$f, &$s) {
    if ($family) family_session_mfa_clear($f['payload']); else session_mfa_clear($s);
};
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('mfa.status', $base);
    // Let in by the desk while this screen was open: nothing is owed any more.
    if (!empty($res['ok']) && $pending !== '' && (int)($res['bypassUntil'] ?? 0) > time()) { $clear(); $pending = ''; }
    if (!empty($res['ok'])) $res['pending'] = $pending;
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'challenge') {
        $res = gs_call('mfa.challenge', $base);
    } elseif ($action === 'verify') {
        if ($pending === '' || $pending === 'enroll') json_error('nothing_to_verify', 400);
        $res = gs_call('mfa.verify', $base + ['answer' => v_safe_text((string)($b['answer'] ?? ''), 120)]);
        if (!empty($res['ok'])) $clear();
    } elseif ($action === 'start') {
        $res = gs_call('mfa.enroll.start', $base + ['type' => (string)($b['type'] ?? '')]);
    } elseif ($action === 'enroll') {
        // A session owing a step it has never set up proves the current one by setting it.
        if ($pending !== '' && $pending !== 'enroll') json_error('mfa_required', 401);
        $res = gs_call('mfa.enroll.finish', $base + ['pendingEnroll' => $pending === 'enroll']
            + array_intersect_key($b, array_flip(['type', 'question', 'answer', 'pin', 'code', 'current'])));
        if (!empty($res['ok']) && $pending === 'enroll') $clear();
    } elseif ($action === 'off') {
        if ($pending !== '') json_error('mfa_required', 401);
        $res = gs_call('mfa.off', $base + ['current' => (string)($b['current'] ?? '')]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'too_many_attempts' ? 429 : 400);
unset($res['ok']); json_ok($res);
