<?php
declare(strict_types=1);

/* ============================================================================
   Files in the storage bucket: stored once, and swept when nothing uses them.

   Two savings, neither of which touches a pixel:

   STORED ONCE. The same photo is shared to the community by five people, the
   same worksheet PDF is handed in by a whole class: each was a separate copy.
   Now the browser sends the file's SHA-256 with its upload request, and when
   the bucket already holds a file with that hash and size, the signer hands
   back the existing address and nothing is uploaded at all — no storage, no
   data spent on the family's bundle.

   The hash a dedupe trusts is never the browser's word. A hash is recorded
   only after the SERVER has read the object back from the bucket and hashed
   it itself (media_obj_confirm) — otherwise one person could register a
   picture of their choosing under the hash of a common file, and everybody
   who later "uploaded" that file would be handed theirs.

   SWEPT WHEN UNUSED. A photo picked and then abandoned, a post deleted, a
   hand-in replaced: the file stayed in the bucket forever. Every signed upload
   is recorded here, and the nightly job deletes one that is a week old and
   that nothing in the database mentions any more (the same whole-schema
   search the photo store uses, photo_store_live_refs). When that search
   cannot answer, nothing is deleted.

   Only the bucket (object-store.php). Cloudinary is being retired and reading
   files back from it would spend the very credits that ran out.
   ========================================================================== */

const MEDIA_OBJ_GRACE_DAYS = 7;          // an upload unused for a week is an orphan
const MEDIA_OBJ_SWEEP_MAX = 150;         // objects examined per nightly run
const MEDIA_OBJ_REF_SKIP = ['audit_log', 'photo_assets', 'media_objects'];

/** Record a presigned upload, so it can be confirmed, reused or swept. */
function media_obj_record_signed(array $spec, string $ownerId, string $kind): void {
    if (empty($spec['key'])) return;
    try {
        db_insert('media_objects', ['storeKey' => (string)$spec['key'], 'url' => (string)$spec['publicUrl'], 'sha256' => '', 'bytes' => (int)($spec['size'] ?? 0),
            'mediaKind' => (string)($spec['resourceType'] ?? ''), 'kind' => substr($kind, 0, 40), 'ownerId' => substr($ownerId, 0, 64), 'status' => 'signed',
            'reuses' => 0, 'createdAt' => now_iso(), 'verifiedAt' => '', 'checkedAt' => '', 'deletedAt' => '']);
    } catch (\Throwable $e) { /* a duplicate key is impossible (random keys); never fail an upload over the ledger */ }
}

/**
 * A verified object with this hash and size whose type this upload may store,
 * or null. $formats: the extensions the asking kind takes (store_formats()).
 */
function media_obj_find_dup(string $sha, int $bytes, array $formats): ?array {
    if (!preg_match('/^[0-9a-f]{64}$/', $sha) || $bytes <= 0 || !store_configured()) return null;
    $rows = db_all("SELECT * FROM media_objects WHERE sha256 = ? AND bytes = ? AND status = 'ok' ORDER BY id LIMIT 5", [$sha, $bytes]);
    foreach ($rows as $r) {
        // Still one of OUR objects at the address in use now (a bucket can be changed in Settings).
        if (store_key_of((string)$r['url']) !== (string)$r['storeKey']) continue;
        $ext = strtolower((string)pathinfo((string)$r['storeKey'], PATHINFO_EXTENSION));
        if (in_array($ext, $formats, true)) return $r;
    }
    return null;
}

/** The answer an upload signer gives when the file is already stored: the browser uploads nothing. */
function media_obj_reuse_answer(array $r): array {
    db_exec('UPDATE media_objects SET reuses = reuses + 1 WHERE id = ?', [(int)$r['id']]);
    $ext = strtolower((string)pathinfo((string)$r['storeKey'], PATHINFO_EXTENSION));
    return ['ok' => true, 'provider' => 'existing', 'publicUrl' => (string)$r['url'], 'key' => (string)$r['storeKey'], 'format' => $ext,
            'size' => (int)$r['bytes'], 'resourceType' => (string)($r['mediaKind'] ?: 'image')];
}

/**
 * SHA-256 and length of an object as the world reads it, streamed (never held
 * in memory), stopping past $max bytes. Test seam: $GLOBALS['__media_fetch_mock'].
 */
function media_obj_hash_url(string $url, int $max): ?array {
    if (isset($GLOBALS['__media_fetch_mock']) && is_callable($GLOBALS['__media_fetch_mock'])) {
        $body = ($GLOBALS['__media_fetch_mock'])($url);
        return is_string($body) ? ['sha256' => hash('sha256', $body), 'bytes' => strlen($body)] : null;
    }
    if (!function_exists('curl_init') || !store_hosted($url)) return null;
    $ctx = hash_init('sha256'); $n = 0;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use ($ctx, &$n, $max) { $n += strlen($chunk); if ($n > $max) return 0; hash_update($ctx, $chunk); return strlen($chunk); }] + store_curl_tls());
    $ok = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($ok === false || $code !== 200 || $n > $max) return null;
    return ['sha256' => hash_final($ctx), 'bytes' => $n];
}

/**
 * member.upload.done — {key, sha256} after a PUT finished. The server reads
 * the object back and hashes it; only a match makes it reusable. The answer
 * is the same either way (the browser has nothing to do with it).
 */
function media_obj_confirm(array $p): array {
    $key = (string)($p['key'] ?? ''); $sha = strtolower((string)($p['sha256'] ?? ''));
    $owner = (string)($p['memberId'] ?? '');
    if ($key === '' || !preg_match('/^[0-9a-f]{64}$/', $sha)) return ['ok' => false, 'error' => 'bad_request'];
    $r = db_row("SELECT * FROM media_objects WHERE storeKey = ? AND status = 'signed' LIMIT 1", [$key]);
    if (!$r || ((string)$r['ownerId'] !== '' && (string)$r['ownerId'] !== $owner)) return ['ok' => true, 'verified' => false];
    $h = media_obj_hash_url((string)$r['url'], max(1, (int)$r['bytes']));
    $match = $h && hash_equals($h['sha256'], $sha) && $h['bytes'] === (int)$r['bytes'];
    db_update('media_objects', $match ? ['sha256' => $sha, 'status' => 'ok', 'verifiedAt' => now_iso()] : ['checkedAt' => now_iso()], ['id' => (int)$r['id']]);
    return ['ok' => true, 'verified' => $match];
}

/**
 * The nightly sweep: a week-old object nothing mentions is deleted from the
 * bucket. Unknown (the search could not run) keeps it. Returns what it did.
 */
function media_obj_sweep(int $limit = MEDIA_OBJ_SWEEP_MAX): array {
    $out = ['checked' => 0, 'deleted' => 0, 'freed' => 0, 'kept' => 0];
    if (!store_configured()) return $out;
    $cut = gmdate('c', time() - MEDIA_OBJ_GRACE_DAYS * 86400);
    $day = gmdate('c', time() - 86400);
    $rows = db_all("SELECT * FROM media_objects WHERE status IN ('signed', 'ok') AND createdAt < ? AND (checkedAt = '' OR checkedAt < ?) ORDER BY checkedAt, id LIMIT " . max(1, min(1000, $limit)), [$cut, $day]);
    foreach ($rows as $r) {
        $out['checked']++;
        $key = (string)$r['storeKey'];
        $refs = photo_store_live_refs($key, MEDIA_OBJ_REF_SKIP);
        if ($refs === []) {
            if (store_delete($key)) {
                db_update('media_objects', ['status' => 'deleted', 'deletedAt' => now_iso(), 'checkedAt' => now_iso()], ['id' => (int)$r['id']]);
                $out['deleted']++; $out['freed'] += (int)$r['bytes'];
                continue;
            }
        }
        $out['kept']++;
        db_update('media_objects', ['checkedAt' => now_iso()], ['id' => (int)$r['id']]);
    }
    if ($out['deleted']) audit('media.swept', null, '', $out, '');
    return $out;
}

/** admin.media.objects — what the bucket holds, what dedupe and the sweep saved, the biggest files. `sweep` runs it now. */
function admin_media_objects(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $swept = !empty($p['sweep']) ? media_obj_sweep(MEDIA_OBJ_SWEEP_MAX) : null;
    if ($swept) audit('media.sweep_now', (string)$g['requester']['memberId'], '', $swept, (string)($p['ip'] ?? ''));
    $live = "status IN ('signed', 'ok')";
    $tot = db_row("SELECT COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM media_objects WHERE $live");
    $byKind = db_all("SELECT kind, COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM media_objects WHERE $live GROUP BY kind ORDER BY b DESC");
    $saved = db_row("SELECT COALESCE(SUM(reuses), 0) n, COALESCE(SUM(reuses * bytes), 0) b FROM media_objects");
    $freed = db_row("SELECT COUNT(*) n, COALESCE(SUM(bytes), 0) b FROM media_objects WHERE status = 'deleted'");
    $big = db_all("SELECT o.storeKey, o.url, o.bytes, o.kind, o.mediaKind, o.ownerId, o.createdAt, o.reuses, m.fullName
                   FROM media_objects o LEFT JOIN members m ON m.memberId = o.ownerId WHERE o.$live ORDER BY o.bytes DESC LIMIT 20");
    return ['ok' => true, 'configured' => store_configured(), 'graceDays' => MEDIA_OBJ_GRACE_DAYS,
            'total' => ['files' => (int)$tot['n'], 'bytes' => (int)$tot['b']],
            'byKind' => array_map(static fn($r) => ['kind' => (string)$r['kind'], 'files' => (int)$r['n'], 'bytes' => (int)$r['b']], $byKind),
            'deduped' => ['uploads' => (int)$saved['n'], 'bytes' => (int)$saved['b']],
            'swept' => ['files' => (int)$freed['n'], 'bytes' => (int)$freed['b']],
            'largest' => array_map(static fn($r) => ['key' => (string)$r['storeKey'], 'url' => (string)$r['url'], 'bytes' => (int)$r['bytes'], 'kind' => (string)$r['kind'],
                'owner' => (string)($r['fullName'] ?? ''), 'createdAt' => (string)$r['createdAt'], 'reuses' => (int)$r['reuses']], $big),
            'ran' => $swept];
}
