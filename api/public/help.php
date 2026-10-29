<?php
/** The public help centre's answers and categories (domain/support.php). Opens no case: cases live in the portals. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$q = trim((string)($_GET['q'] ?? ''));
$res = $q !== '' ? gs_call('support.suggest', ['q' => $q, 'category' => (string)($_GET['category'] ?? '')]) : gs_call('support.meta', ['who' => support_nobody()]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok'], $res['who'], $res['subjects'], $res['limits']);
json_ok($res);
