<?php
/** After a PUT to the bucket: the server reads the object back and, if its hash matches, lets the next identical upload reuse it (media-objects.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
require_method('POST');
rate_limit_check('upload.sign');
$b = read_json_body();
$res = gs_call('member.upload.done', ['memberId' => (string)($s['mid'] ?? ''), 'key' => (string)($b['key'] ?? ''), 'sha256' => (string)($b['sha256'] ?? '')]);
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 400);
json_ok(['verified' => !empty($res['verified'])]);
