<?php
/** Public: this term's first and last day, for the Timetable Maker's calendar file. ['',''] when no calendar is set. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.timetableTerm', []);
unset($res['ok']);
json_ok($res);
