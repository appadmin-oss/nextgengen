<?php
/** Public status board — PII-free programme aggregates for /status. Cached. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.status', [], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
json_ok($res);
