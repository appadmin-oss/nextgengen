<?php
/** One notice, read by a guardian for the children it is for — and acknowledged with `ack`. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$f = require_family();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') $res = gs_call('family.notice', ['guardianId' => $f['gid'], 'noticeId' => (string)($_GET['noticeId'] ?? '')]);
elseif ($method === 'POST') { $b = read_json_body(); $res = gs_call('family.notice', ['guardianId' => $f['gid'], 'noticeId' => (string)($b['noticeId'] ?? ''), 'ack' => !empty($b['ack'])]); }
else json_error('method_not_allowed', 405);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']); json_ok($res);
