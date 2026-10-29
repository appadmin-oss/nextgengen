<?php
/**
 * A photo of a school report, uploaded by a parent in pieces — the same piece
 * store a member's upload uses (photo_chunk_put), under the family's own
 * cookie. The last piece answers { url }, which family.results.upload takes.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$f = require_family();
rate_limit_check('family.upload', $f['gid']);
$b = read_json_body();
$res = gs_call('photo.chunk', [
    'memberId' => 'guardian:' . $f['gid'],
    'uploadId' => (string)($b['uploadId'] ?? ''),
    'index'    => (int)($b['index'] ?? -1),
    'total'    => (int)($b['total'] ?? 0),
    'mime'     => (string)($b['mime'] ?? ''),
    'data'     => (string)($b['data'] ?? ''),
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['detail'] ?? null);
unset($res['ok']); json_ok($res);
