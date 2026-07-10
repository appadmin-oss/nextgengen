<?php
/** Public: volunteer registration context — role taxonomy + the course
 *  catalogue instructors can offer (served from the live form definition). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.volunteer.context', []);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 400);
unset($res['ok']);
json_ok($res);
