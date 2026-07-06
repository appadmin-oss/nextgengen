<?php
/** Public: a summer student's standard profile, by QR token or handle. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.summerProfile', [
    'token'  => (string)($_GET['token'] ?? $_GET['q'] ?? ''),
    'handle' => (string)($_GET['handle'] ?? ''),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
