<?php
/** Public: a centre's timetable by slug (no instructor names), or the centres that have one. Cached; purged by the `timetable` and `centres` topics. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$slug = preg_replace('/[^a-z0-9-]/', '', strtolower((string)($_GET['centre'] ?? '')));
$res = gs_call('public.timetable', ['slug' => $slug], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
