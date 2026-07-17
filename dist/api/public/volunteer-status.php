<?php
/** Public: volunteer fulfilment board (/v-status). PII-free aggregates only —
 *  need vs filled per centre × role × faculty × course. No volunteer names. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.volunteer.status', []);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 400);
unset($res['ok']);
json_ok($res);
