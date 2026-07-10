<?php
/** Public: editable site copy (homepage hero + taglines), merged over defaults. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.siteContent', []);
unset($res['ok']);
json_ok($res);
