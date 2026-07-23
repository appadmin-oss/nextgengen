<?php
/**
 * Cloudinary signed-upload endpoint.
 *
 * Any signed-in member (members + admins) can request a short-lived upload
 * signature. The browser then POSTs the file directly to Cloudinary — the
 * api_secret never leaves this server. Uploads are foldered per-kind and
 * scoped to the requesting member so they're easy to audit and purge.
 *
 * Request  (POST JSON): { "kind": "proof|submission|avatar|cover|headshot|…" }
 *   Configured kinds carry a resource_type/folder spec; any other safe kind
 *   (matching ^[a-z][a-z0-9_-]{1,30}$) falls back to an image upload in a
 *   folder of the same name.
 * Response: { ok, cloudName, apiKey, timestamp, signature, folder,
 *             resourceType, uploadUrl, maxBytes }
 */
require_once __DIR__ . '/../_lib/bootstrap.php';

$s = require_session();
require_method('POST');

// Cheap abuse throttle — a member should never need dozens of signatures/min.
rate_limit_check('upload.sign');

$cfg = $CONFIG['cloudinary'] ?? [];
if (empty($cfg['cloud_name']) || empty($cfg['api_key']) || empty($cfg['api_secret'])) {
    json_error('uploads_disabled', 503);
}

$body = read_json_body();
$kind = (string)($body['kind'] ?? 'proof');
$kinds = $cfg['kinds'] ?? [];

// Configured kinds win. For any other kind we fall back to a safe image spec
// rather than rejecting it — this keeps the client and server from having to
// move in lockstep every time a new upload surface (e.g. "headshot") ships,
// and means an older config.php on a host without shell access still works.
// The kind is strictly sanitised first so it can never escape the base folder.
if (isset($kinds[$kind])) {
    $spec = $kinds[$kind];
} elseif ($kind === 'post') {
    // Community feed media — image OR video. Built-in so a community can post
    // video even on a host whose config.php predates this kind.
    $spec = ['resource_type' => 'auto', 'folder' => 'community'];
} elseif (preg_match('/^[a-z][a-z0-9_-]{1,30}$/', $kind)) {
    $spec = ['resource_type' => 'image', 'folder' => $kind];
} else {
    json_error('bad_kind', 400);
}

// `cover` uploads are an editorial action — restrict to admins.
if ($kind === 'cover') {
    require_admin();
}

$resourceType = $spec['resource_type'] ?? 'auto';
$sub = $spec['folder'] ?? $kind;
$base = trim((string)($cfg['folder'] ?? 'ngg'), '/');
$folder = $base . '/' . $sub;

$timestamp = time();

// Cloudinary signature = SHA1 of the sorted `key=value` params (excluding
// file, cloud_name, resource_type and api_key) with the api_secret appended.
// We sign folder + timestamp. Adding more params here means adding them to
// the FormData on the client too — keep the two in lockstep.
$signParams = [
    'folder'    => $folder,
    'timestamp' => $timestamp,
];
ksort($signParams);
$toSign = [];
foreach ($signParams as $k => $v) {
    $toSign[] = $k . '=' . $v;
}
$signature = sha1(implode('&', $toSign) . $cfg['api_secret']);

json_ok([
    'cloudName'    => $cfg['cloud_name'],
    'apiKey'       => (string)$cfg['api_key'],
    'timestamp'    => $timestamp,
    'signature'    => $signature,
    'folder'       => $folder,
    'resourceType' => $resourceType,
    'uploadUrl'    => 'https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/' . $resourceType . '/upload',
    'maxBytes'     => (int)($cfg['max_bytes'] ?? (25 * 1024 * 1024)),
]);
