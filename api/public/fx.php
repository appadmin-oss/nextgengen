<?php
/** The exchange rates the site uses to show a price in a family's own currency (domain/fx.php). Public: rates only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.fx', [], true);
header('Cache-Control: public, max-age=1800');
unset($res['ok']); json_ok($res);
