<?php
/**
 * Push notifications for whoever is signed in — a member (and staff, who are
 * members), or a family account. domain/push.php does the work.
 *
 * The subject is taken from the SESSION on every call, never from the body:
 * `?surface=family` chooses which session to read, not whose. There is no way
 * to subscribe, read or change anybody's notifications but your own.
 *
 *   GET  ?surface=member|family|admin[&endpoint=…]   key, preferences, devices
 *   POST {action: subscribe|unsubscribe|prefs|seen|test, surface, …}
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$b = $method === 'POST' ? read_json_body() : [];
$surface = (string)($method === 'POST' ? ($b['surface'] ?? '') : ($_GET['surface'] ?? ''));
if ($surface === 'family') {
    $f = require_family();
    $subject = 'g:' . $f['gid'];
} elseif ($surface === 'admin') {
    $s = require_admin();
    $subject = 'm:' . $s['mid'];
} else {
    $surface = 'member';
    $s = require_member_session();
    $subject = 'm:' . $s['mid'];
}

if ($method === 'GET') {
    $res = gs_call('push.prefs', ['subject' => $subject, 'surface' => $surface, 'endpoint' => (string)($_GET['endpoint'] ?? '')]);
} elseif ($method === 'POST') {
    $action = (string)($b['action'] ?? '');
    $base = ['subject' => $subject, 'surface' => $surface, 'ip' => client_ip()];
    if ($action === 'subscribe') {
        rate_limit_check('push.subscribe', $subject);
        $res = gs_call('push.subscribe', $base + ['sub' => is_array($b['sub'] ?? null) ? $b['sub'] : [], 'userAgent' => (string)($_SERVER['HTTP_USER_AGENT'] ?? '')]);
    } elseif ($action === 'unsubscribe') {
        $res = gs_call('push.unsubscribe', $base + ['endpoint' => (string)($b['endpoint'] ?? ''), 'all' => !empty($b['all'])]);
    } elseif ($action === 'prefs') {
        $res = gs_call('push.prefs.save', $base + ['prefs' => is_array($b['prefs'] ?? null) ? $b['prefs'] : []]);
    } elseif ($action === 'seen') {
        $res = gs_call('push.seen', $base);
    } elseif ($action === 'test') {
        rate_limit_check('push.test', $subject);
        $res = gs_call('push.test', $base);
    } else json_error('unknown_action', 400);
} else json_error('method_not_allowed', 405);

if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']);
json_ok($res);
