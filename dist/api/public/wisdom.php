<?php
/** Public: this week's quote (Hausa → Igbo → Yoruba rotation). See domain/wisdom.php. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.wisdom.week', []);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
header('Cache-Control: public, max-age=300');
json_ok($res);
