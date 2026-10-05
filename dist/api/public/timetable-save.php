<?php
/**
 * Public: keep a timetable without an account.
 *   POST {email, settings, entries, exceptions}  mints a 30-day link and emails it
 *   POST {k, settings, entries, exceptions}      saves through a live link
 *   GET  ?k=<token>                               the timetable behind a link
 * The token is a bearer secret; failures are rate-limited, and only its hash is kept.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    rate_limit_check('timetable.load');
    $res = gs_call('public.timetableLoad', ['k' => (string)($_GET['k'] ?? '')]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'link_expired', 404);
    unset($res['ok']); json_ok($res);
}
require_method('POST');
$body = read_json_body();
$k = (string)($body['k'] ?? '');
rate_limit_check($k === '' ? 'timetable.save' : 'timetable.load');
$res = gs_call('public.timetableSave', [
    'k' => $k, 'email' => (string)($body['email'] ?? ''), 'settings' => $body['settings'] ?? null,
    'entries' => $body['entries'] ?? null, 'exceptions' => $body['exceptions'] ?? [],
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'link_expired' ? 404 : 400);
unset($res['ok']); json_ok($res);
