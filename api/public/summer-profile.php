<?php
/** Public: a summer student's standard profile, by QR token or handle. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
// A minor's name + photo + attendance history, reachable by a short handle —
// throttle it on the safeguarding budget so the handle can't be enumerated.
rate_limit_check('summer.profile');
$res = gs_call('public.summerProfile', [
    'token'  => (string)($_GET['token'] ?? $_GET['q'] ?? ''),
    'handle' => (string)($_GET['handle'] ?? ''),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
