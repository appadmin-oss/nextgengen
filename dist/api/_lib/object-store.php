<?php
declare(strict_types=1);

/* ============================================================================
   File storage on an S3-compatible bucket — Cloudflare R2, Backblaze B2,
   Amazon S3, Wasabi, or any other store that speaks the S3 API.

   Cloudinary's free plan is a credit budget that storage, bandwidth and every
   transformation draw on, and it ran out. A bucket is plain storage at a flat,
   far lower price (R2: 10 GB free, no charge at all for downloads; B2: 10 GB
   free, then about $6 a TB-month), so once one is set here every NEW upload
   goes to it. What Cloudinary already holds stays where it is and keeps
   working; nothing is migrated, nothing breaks.

   How an upload works, and why it is safe on shared hosting:
     · The browser asks this server for a PRESIGNED PUT URL (store_upload_spec).
       The URL is signed with AWS Signature V4 for ONE object key, ONE content
       type and ONE exact byte length, and lasts STORE_PUT_TTL seconds.
     · The browser PUTs the file straight to the bucket. The secret key never
       leaves PHP, and the file never passes through this host (no upload size
       limit, no PHP memory, no timeout to worry about).
     · The key is chosen HERE — folder, date, random id, a cleaned name — so a
       caller can never overwrite somebody else's file or write outside its
       folder. The content type comes from an allow-list keyed by extension, so
       nothing is stored as HTML or SVG to be served from the bucket's domain.

   Config (api/config.php, or Control Room → Settings → API keys → File storage):
     'storage' => [
       'endpoint'    => 'https://<account-id>.r2.cloudflarestorage.com',   // B2: https://s3.<region>.backblazeb2.com
       'region'      => 'auto',                                           // B2: the region in the endpoint, e.g. us-west-004
       'bucket'      => 'ngg-media',
       'access_key'  => '…', 'secret_key' => '…',
       'public_base' => 'https://pub-<hash>.r2.dev',                      // B2: https://f004.backblazeb2.com/file/ngg-media
       'folder'      => 'ngg',                                            // optional key prefix
     ]
   Requests are path-style (endpoint/bucket/key), which every one of these
   stores accepts. The bucket needs a CORS rule allowing PUT from this site's
   origin — docs/SETUP.md has the exact JSON for R2 and B2.
   ========================================================================== */

const STORE_PUT_TTL = 900;                       // a presigned upload lasts 15 minutes
const STORE_MAX_BYTES = 25 * 1024 * 1024;        // default ceiling, as Cloudinary's
const STORE_HEADSHOT_MAX_BYTES = 8 * 1024 * 1024;

/* Extension → the content type it is stored with, per media kind. The type is
   OURS, not the browser's: a file is stored as what its extension says it is,
   from this list, or it is refused. No html, svg, js or xml — a bucket domain
   that served those would be a place to host a page. */
const STORE_TYPES = [
    'image' => ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'],
    'pdf'   => ['pdf' => 'application/pdf'],
    'video' => ['mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm', 'm4v' => 'video/mp4',
                'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'aac' => 'audio/aac', 'weba' => 'audio/webm'],
    'raw'   => ['doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'odt' => 'application/vnd.oasis.opendocument.text', 'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
                'odp' => 'application/vnd.oasis.opendocument.presentation', 'rtf' => 'application/rtf', 'txt' => 'text/plain', 'csv' => 'text/csv',
                'zip' => 'application/zip'],
];

function store_cfg(): array { return (array)($GLOBALS['CONFIG']['storage'] ?? []); }

/** Every field an upload needs is set, and the two URLs are https. */
function store_configured(): bool {
    $c = store_cfg();
    foreach (['endpoint', 'bucket', 'access_key', 'secret_key', 'public_base'] as $k) if (trim((string)($c[$k] ?? '')) === '') return false;
    return (bool)preg_match('#^https://[^/\s]+#i', (string)$c['endpoint']) && (bool)preg_match('#^https://[^/\s]+#i', (string)$c['public_base']);
}

function store_region(): string { $r = trim((string)(store_cfg()['region'] ?? '')); return $r !== '' ? $r : 'auto'; }
function store_endpoint(): string { return rtrim(trim((string)(store_cfg()['endpoint'] ?? '')), '/'); }
function store_bucket(): string { return trim((string)(store_cfg()['bucket'] ?? ''), " /"); }
function store_public_base(): string { return rtrim(trim((string)(store_cfg()['public_base'] ?? '')), '/'); }
function store_folder(): string { $f = trim((string)(store_cfg()['folder'] ?? 'ngg'), " /"); return preg_match('#^[A-Za-z0-9_-]{1,40}$#', $f) ? $f : 'ngg'; }

/** RFC 3986 encoding as SigV4 wants it; '/' kept in a path. */
function store_uri_encode(string $s, bool $keepSlash = false): string {
    $e = rawurlencode($s);
    return $keepSlash ? str_replace('%2F', '/', $e) : $e;
}

/** The path-style URL of one object: endpoint/bucket/key. */
function store_object_url(string $key, string $endpoint = '', string $bucket = ''): string {
    return ($endpoint !== '' ? $endpoint : store_endpoint()) . '/' . store_uri_encode($bucket !== '' ? $bucket : store_bucket()) . '/' . store_uri_encode($key, true);
}

/** Where the world reads one object. */
function store_public_url(string $key): string { return store_public_base() . '/' . store_uri_encode($key, true); }

function store_signing_key(string $secret, string $date, string $region, string $service = 's3'): string {
    $k = hash_hmac('sha256', $date, 'AWS4' . $secret, true);
    $k = hash_hmac('sha256', $region, $k, true);
    $k = hash_hmac('sha256', $service, $k, true);
    return hash_hmac('sha256', 'aws4_request', $k, true);
}

/**
 * A presigned URL (SigV4, query auth). $headers are signed as well as `host`
 * and must then be sent exactly — that is how an upload is held to one content
 * type and one byte length. Pure: every input is a parameter, so the AWS
 * documentation's own example is a test (api/tests/run.php).
 */
function store_presign(string $method, string $url, array $headers, int $expires, string $accessKey, string $secret, string $region, int $now): string {
    $p = parse_url($url);
    $host = strtolower((string)$p['host']) . (isset($p['port']) ? ':' . $p['port'] : '');
    $path = (string)($p['path'] ?? '/');
    $amzDate = gmdate('Ymd\THis\Z', $now); $date = substr($amzDate, 0, 8);
    $scope = $date . '/' . $region . '/s3/aws4_request';
    $hdrs = ['host' => $host];
    foreach ($headers as $k => $v) $hdrs[strtolower((string)$k)] = trim((string)$v);
    ksort($hdrs);
    $signed = implode(';', array_keys($hdrs));
    $q = ['X-Amz-Algorithm' => 'AWS4-HMAC-SHA256', 'X-Amz-Credential' => $accessKey . '/' . $scope, 'X-Amz-Date' => $amzDate,
          'X-Amz-Expires' => (string)$expires, 'X-Amz-SignedHeaders' => $signed];
    ksort($q);
    $qs = implode('&', array_map(static fn($k, $v) => store_uri_encode($k) . '=' . store_uri_encode($v), array_keys($q), $q));
    $canon = $method . "\n" . $path . "\n" . $qs . "\n" . implode('', array_map(static fn($k, $v) => $k . ':' . $v . "\n", array_keys($hdrs), $hdrs)) . "\n" . $signed . "\nUNSIGNED-PAYLOAD";
    $sts = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $scope . "\n" . hash('sha256', $canon);
    $sig = hash_hmac('sha256', $sts, store_signing_key($secret, $date, $region), true);
    return $p['scheme'] . '://' . $host . $path . '?' . $qs . '&X-Amz-Signature=' . bin2hex($sig);
}

/**
 * A server-side request with header auth (delete, the health check). Returns
 * ['code' => int, 'body' => string]. Test seam: $GLOBALS['__store_http_mock'].
 */
function store_http(string $method, string $key, string $body = '', array $extra = []): array {
    if (isset($GLOBALS['__store_http_mock']) && is_callable($GLOBALS['__store_http_mock'])) return ($GLOBALS['__store_http_mock'])($method, $key, $body, $extra);
    if (!store_configured() || !function_exists('curl_init')) return ['code' => 0, 'body' => '', 'error' => 'not_configured'];
    $c = store_cfg();
    $url = store_object_url($key);
    $send = store_auth_headers($method, $url, $body, $extra, (string)$c['access_key'], (string)$c['secret_key'], store_region(), time());
    $ch = curl_init($url);
    $opt = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $send,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2];
    if ($method === 'HEAD') $opt[CURLOPT_NOBODY] = true;
    if ($body !== '') $opt[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($ch, $opt + store_curl_tls());
    $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return ['code' => $code, 'body' => is_string($out) ? $out : '', 'error' => $err];
}

/**
 * Header auth (SigV4) for one request: the headers to send, Authorization
 * last. Pure, like store_presign — the AWS GET-object example is its test.
 */
function store_auth_headers(string $method, string $url, string $body, array $extra, string $accessKey, string $secret, string $region, int $now): array {
    $p = parse_url($url);
    $host = strtolower((string)$p['host']) . (isset($p['port']) ? ':' . $p['port'] : '');
    $amzDate = gmdate('Ymd\THis\Z', $now); $date = substr($amzDate, 0, 8);
    $hash = hash('sha256', $body);
    $hdrs = ['host' => $host, 'x-amz-content-sha256' => $hash, 'x-amz-date' => $amzDate];
    foreach ($extra as $k => $v) $hdrs[strtolower((string)$k)] = trim((string)$v);
    ksort($hdrs);
    $signed = implode(';', array_keys($hdrs));
    $canon = $method . "\n" . (string)($p['path'] ?? '/') . "\n" . (string)($p['query'] ?? '') . "\n"
           . implode('', array_map(static fn($k, $v) => $k . ':' . $v . "\n", array_keys($hdrs), $hdrs)) . "\n" . $signed . "\n" . $hash;
    $scope = $date . '/' . $region . '/s3/aws4_request';
    $sts = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $scope . "\n" . hash('sha256', $canon);
    $sig = bin2hex(hash_hmac('sha256', $sts, store_signing_key($secret, $date, $region), true));
    $send = [];
    foreach ($hdrs as $k => $v) if ($k !== 'host') $send[] = $k . ': ' . $v;
    $send[] = 'Authorization: AWS4-HMAC-SHA256 Credential=' . $accessKey . '/' . $scope . ', SignedHeaders=' . $signed . ', Signature=' . $sig;
    return $send;
}

/** The extension a file is stored with, from its name, then its type; '' when the kind does not take it. */
function store_ext_for(string $mediaKind, string $name, string $type): string {
    $types = STORE_TYPES[$mediaKind] ?? [];
    $ext = strtolower((string)pathinfo($name, PATHINFO_EXTENSION));
    if ($ext !== '' && isset($types[$ext])) return $ext;
    $byType = array_search(strtolower(trim($type)), $types, true);
    return $byType === false ? '' : (string)$byType;
}

/** A new object key: folder/sub/YYYY/MM/random[-name].ext — chosen here, never by a caller. */
function store_new_key(string $sub, string $ext, string $name = '', string $owner = ''): string {
    $sub = preg_match('#^[a-z][a-z0-9_-]{1,30}$#', $sub) ? $sub : 'files';
    if ($owner !== '' && preg_match('#^u[0-9a-f]{16}$#', $owner)) $sub .= '/' . $owner;
    $stem = strtolower((string)preg_replace('/[^A-Za-z0-9]+/', '-', (string)pathinfo($name, PATHINFO_FILENAME)));
    $stem = trim(substr(trim($stem, '-'), 0, 48), '-');
    return store_folder() . '/' . $sub . '/' . gmdate('Y/m') . '/' . bin2hex(random_bytes(12)) . ($stem !== '' ? '-' . $stem : '') . '.' . $ext;
}

/**
 * What the browser needs to PUT one file: {ok, provider:'s3', uploadUrl,
 * method, headers, publicUrl, key, resourceType, format, maxBytes}.
 * $sub is the folder (already sanitised by the caller's kind rules).
 */
function store_upload_spec(string $sub, string $mediaKind, string $name, string $type, $size, int $maxBytes, string $owner = ''): array {
    if (!store_configured()) return ['ok' => false, 'error' => 'uploads_disabled'];
    $mediaKind = isset(STORE_TYPES[$mediaKind]) ? $mediaKind : 'image';
    $ext = store_ext_for($mediaKind, $name, $type);
    if ($ext === '') return ['ok' => false, 'error' => 'bad_file_type', 'detail' => 'That kind of file cannot be uploaded here.'];
    if (!is_numeric($size) || (int)$size <= 0) return ['ok' => false, 'error' => 'bad_size', 'detail' => 'The file is empty.'];
    $size = (int)$size;
    if ($size > $maxBytes) return ['ok' => false, 'error' => 'too_large', 'detail' => 'The file is larger than ' . (int)round($maxBytes / 1048576) . ' MB.', 'maxBytes' => $maxBytes];
    $ctype = STORE_TYPES[$mediaKind][$ext];
    $key = store_new_key($sub, $ext, $mediaKind === 'image' ? '' : $name, $owner);
    $c = store_cfg();
    $url = store_presign('PUT', store_object_url($key), ['content-type' => $ctype, 'content-length' => (string)$size], STORE_PUT_TTL,
                         (string)$c['access_key'], (string)$c['secret_key'], store_region(), time());
    return ['ok' => true, 'provider' => 's3', 'uploadUrl' => $url, 'method' => 'PUT', 'headers' => ['Content-Type' => $ctype],
            'publicUrl' => store_public_url($key), 'key' => $key, 'format' => $ext, 'size' => $size, 'maxBytes' => $maxBytes,
            'resourceType' => $mediaKind === 'video' ? 'video' : ($mediaKind === 'raw' ? 'raw' : 'image')];
}

/** cURL options every request to the bucket shares: a private CA file for a self-hosted store (MinIO with its own certificate). */
function store_curl_tls(): array {
    $ca = trim((string)(store_cfg()['ca_file'] ?? ''));
    return $ca !== '' && is_readable($ca) ? [CURLOPT_CAINFO => $ca] : [];
}

/** The extensions a media kind may be stored as — the same list for the bucket and for Cloudinary's `allowed_formats`. */
function store_formats(string $mediaKind): array { return array_keys(STORE_TYPES[$mediaKind] ?? STORE_TYPES['image']); }

/**
 * The folder segment for one uploader: a keyed hash, not the member id, so a
 * file URL never carries a child's id, but every file one person uploaded is
 * under one prefix — to audit, or to purge when their record is erased.
 */
function store_owner_segment(string $memberId): string {
    if ($memberId === '') return '';
    return 'u' . substr(hash_hmac('sha256', 'upload-owner|' . $memberId, (string)($GLOBALS['CONFIG']['cookie_secret'] ?? '')), 0, 16);
}

/** Is this URL one of OUR bucket's objects? */
function store_hosted(string $url): bool { return store_key_of($url) !== ''; }

/** The object key behind one of our public URLs, or '' (another host, or a path that climbs). */
function store_key_of(string $url): string {
    $base = store_public_base();
    if ($base === '' || strncmp($url, $base . '/', strlen($base) + 1) !== 0) return '';
    $key = rawurldecode((string)strtok(substr($url, strlen($base) + 1), '?#'));
    if ($key === '' || strpos($key, '..') !== false || !preg_match('#^[A-Za-z0-9_./-]{3,300}$#', $key)) return '';
    return $key;
}

/** The host our public files are served from ('' when none is set). */
function store_public_host(): string { return strtolower((string)parse_url(store_public_base(), PHP_URL_HOST)); }

/** Delete one of our objects. A missing object counts as deleted (S3 answers 204 either way). */
function store_delete(string $key): bool {
    if ($key === '' || strpos($key, '..') !== false) return false;
    $r = store_http('DELETE', $key);
    return in_array((int)$r['code'], [200, 204, 404], true);
}

/**
 * The health check: write a tiny file, read it back from the PUBLIC address,
 * delete it. Each step can fail for its own reason, and each says which —
 * wrong keys, a bucket that does not exist, a public address that is not
 * public — because "storage failed" would not tell anybody what to fix.
 */
function store_health(): array {
    if (!store_configured()) return ['pass' => false, 'detail' => 'Set the endpoint, bucket, both keys and the public address (all https).'];
    $key = store_folder() . '/_health/' . bin2hex(random_bytes(6)) . '.txt';
    $put = store_http('PUT', $key, 'ngg storage check', ['content-type' => 'text/plain']);
    $code = (int)$put['code'];
    if ($code < 200 || $code >= 300) {
        $why = $code === 403 ? 'the keys were refused — check the access key, the secret, and that the key may write to this bucket'
             : ($code === 404 ? 'no bucket of that name at this endpoint' : ($code === 0 ? 'the endpoint did not answer' . ($put['error'] ? ' (' . $put['error'] . ')' : '') : 'HTTP ' . $code));
        return ['pass' => false, 'detail' => 'Could not write a test file: ' . $why . '.'];
    }
    $read = isset($GLOBALS['__store_public_mock']) && is_callable($GLOBALS['__store_public_mock']) ? (int)($GLOBALS['__store_public_mock'])(store_public_url($key)) : store_public_status(store_public_url($key));
    $del = store_delete($key);
    if ($read !== 200) return ['pass' => false, 'detail' => 'Files upload, but the public address did not serve one (HTTP ' . $read . '). Make the bucket public (R2: Settings → Public access; B2: Bucket type Public) and paste that address.'];
    return ['pass' => true, 'detail' => 'Wrote a test file, read it from the public address, and ' . ($del ? 'deleted it.' : 'could not delete it (the key may lack delete permission).')];
}

function store_public_status(string $url): int {
    if (!function_exists('curl_init')) return 0;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_NOBODY => false, CURLOPT_FOLLOWLOCATION => false,
                            CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2]);
    curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return $code;
}
