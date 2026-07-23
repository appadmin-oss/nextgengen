<?php
/** Public: channel list only — powers the signed-out community teaser. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$view = (string)($_GET['view'] ?? 'channels');
$res = $view === 'showcase' ? gs_call('community.showcase', [], true) : gs_call('community.channels', []);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
json_ok($res);
