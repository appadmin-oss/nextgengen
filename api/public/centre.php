<?php
/** Public: one published Summer School centre's immersive page, by slug. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.centre', ['slug' => (string)($_GET['slug'] ?? '')], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
