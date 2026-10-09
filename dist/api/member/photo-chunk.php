<?php
/**
 * A photo, uploaded in pieces — for a host whose firewall refuses large bodies.
 *
 * Without an image cloud, a headshot used to travel INSIDE the save that used
 * it (a member's record, the editor's photo field): a few hundred KB of base64
 * in one JSON body, which this host's firewall refused (403, or a reset
 * connection) before PHP saw it — so the whole save failed, not just the
 * photo. Now the photo goes first, in small pieces each well under the limit,
 * is stored by photo_store_put(), and the save carries only its short URL.
 *
 * Signed-in only. POST { uploadId, index, total, mime, data } — `data` is one
 * piece of the image's base64. The last piece answers { url }.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_member_session();
$b = read_json_body();
$res = gs_call('photo.chunk', [
    'memberId' => $s['mid'],
    'uploadId' => (string)($b['uploadId'] ?? ''),
    'index'    => (int)($b['index'] ?? -1),
    'total'    => (int)($b['total'] ?? 0),
    'mime'     => (string)($b['mime'] ?? ''),
    'data'     => (string)($b['data'] ?? ''),
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['detail'] ?? null);
unset($res['ok']);
json_ok($res);
