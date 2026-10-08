<?php
declare(strict_types=1);

/**
 * Photo pipeline — a governed image asset with its own lifecycle.
 *
 * Division of labour (cost-aware):
 *   • FREE vision AI (ai_photo_review) *points out problems* → gives Cloudinary
 *     a clear, minimal job and keeps analysis off Cloudinary's credit meter.
 *   • Cloudinary does the EDITING only: always a general optimization pass
 *     (exposure, colour, sharpness, face-framed crop), plus a credit-costed
 *     background replacement when the free analysis flags a busy background AND
 *     credits remain. Editing ENHANCES but never ALTERS the person — no
 *     generative face reconstruction (see cloudinary_edit's identity rule).
 *   • A human can still review any edit later; serious flags route to the
 *     editor queue before use.
 *   • Any failure — credit exhaustion, provider down — alerts humans on every
 *     integrated channel (email + Google Chat + webhooks, via the bus).
 *
 * Issuance (QR + printed ID) is gated on an approved asset elsewhere.
 */

/* Fill colour behind a background-removed headshot. A soft neutral grey (not
 * stark white) so the subject reads as a studio portrait against the card
 * rather than floating on the white card stock. Mirrored in components.jsx. */
const ID_BG_GREY = 'eceef2';

/* ── Cloudinary editing (delivery-URL transforms) ─────────────────────────── */

/** Insert a transform chain right after /upload/ in a Cloudinary delivery URL. */
function cloudinary_apply(string $url, string $transform): string {
    if ($transform === '' || strpos($url, '/upload/') === false) return $url;
    return preg_replace('#/upload/#', '/upload/' . $transform . '/', $url, 1) ?? $url;
}

/**
 * Build the edited delivery URL. The base is ALWAYS a professional-grade
 * optimization + face crop; the only credit-costed AI step is background
 * replacement (added when recommended and $creditsOk). Returns
 * [url, transforms, aiUsed].
 *
 * IDENTITY-PRESERVATION RULE (non-negotiable): the pipeline may ENHANCE a
 * photo but must never ALTER the person. Every transform here is either a
 * non-generative adjustment of the *existing* pixels (exposure, colour,
 * sharpness, reframing) or a background swap that leaves the subject untouched.
 * We deliberately do NOT use generative operations — no e_gen_restore, no
 * generative upscale, no gen_replace/recolor — because those reconstruct
 * facial detail and can change how a face looks. A soft but real face is
 * always preferred over a sharpened but invented one; genuinely unusable
 * images are sent back for a retake by a human, not "fixed" by generative AI.
 */
function cloudinary_edit(string $sourceUrl, array $rec, bool $creditsOk): array {
    // General optimization + a tidy, face-framed crop — always applied and all
    // non-generative (they reframe/adjust the existing pixels only).
    $base = 'c_fill,g_face,w_600,h_750,f_auto,q_auto:good,e_improve:30';
    if (!empty($rec['brighten'])) $base .= ',e_brightness:18';
    // Perceived-detail recovery for soft/low-res captures — an unsharp mask,
    // NOT generative reconstruction. Enhances edges that are already there.
    if (!empty($rec['sharpen']))  $base .= ',e_sharpen:80';
    $chain = [$base];
    $aiUsed = false;
    if ($creditsOk) {
        // Background replacement isolates the subject against a clean studio
        // backdrop — it changes the environment, never the face. Identity safe.
        if (!empty($rec['removeBackground'])) { $chain[] = 'e_background_removal'; $chain[] = 'b_rgb:' . ID_BG_GREY; $aiUsed = true; }
    }
    $transforms = implode('/', $chain);
    return ['url' => cloudinary_apply($sourceUrl, $transforms), 'transforms' => $transforms, 'aiUsed' => $aiUsed];
}

/**
 * Strip any transform segment(s) between /upload/ and the version marker, so a
 * re-edit always derives from the CLEAN original rather than stacking transforms
 * on top of an already-edited URL. Leaves non-Cloudinary URLs untouched.
 */
function cloudinary_base(string $url): string {
    if (strpos($url, '/upload/') === false) return $url;
    // .../upload/<transforms>/v123/<publicid> → .../upload/v123/<publicid>
    $stripped = preg_replace('#(/upload/).*?(v\d+/)#', '$1$2', $url, 1);
    return is_string($stripped) && $stripped !== '' ? $stripped : $url;
}

/**
 * Admin-driven manual edit: build a delivery transform from an EXPLICIT spec
 * (gravity/zoom/brighten/sharpen/removeBg) rather than the AI recommendation.
 * Same identity-preservation rule as cloudinary_edit — reframe/adjust only,
 * background swap is the only credit-costed step, never generative. Returns
 * ['url','transforms'].
 */
function cloudinary_edit_manual(string $sourceUrl, array $spec): array {
    $g = (string)($spec['gravity'] ?? 'face');
    if (!in_array($g, ['face', 'faces', 'center', 'north', 'south', 'auto'], true)) $g = 'face';
    $parts = ['c_fill', 'g_' . $g, 'w_600', 'h_750', 'f_auto', 'q_auto:good', 'e_improve:30'];
    if (!empty($spec['brighten'])) $parts[] = 'e_brightness:18';
    if (!empty($spec['sharpen']))  $parts[] = 'e_sharpen:80';
    $chain = [implode(',', $parts)];
    // Zoom is a fractional crop CHAINED BEFORE the fill, not Cloudinary's z_.
    // z_ is silently ignored here — verified against Cloudinary: c_fill with
    // z_1.6 returns byte-identical output to no zoom, for g_face as well as
    // the fixed gravities — so the slider moved and nothing happened. Cropping
    // 1/zoom of the source about the same gravity and then filling gives the
    // same framing z_ was meant to, and works for every gravity.
    if (isset($spec['zoom'])) {
        $z = max(1.0, min(2.5, (float)$spec['zoom']));
        if ($z > 1.005) {
            // Fractional w/h must stay below 1.0 or Cloudinary reads them as pixels.
            $f = max(0.2, min(0.99, round(1.0 / $z, 3)));
            array_unshift($chain, 'c_crop,g_' . $g . ',w_' . $f . ',h_' . $f);
        }
    }
    if (!empty($spec['removeBg']) && cloudinary_credits_ok()) { $chain[] = 'e_background_removal'; $chain[] = 'b_rgb:' . ID_BG_GREY; }
    $tf = implode('/', $chain);
    return ['url' => cloudinary_apply(cloudinary_base($sourceUrl), $tf), 'transforms' => $tf];
}

/* ── Credit guard + refresh ───────────────────────────────────────────────── */

/** Cheap read of the cached credit state. Defaults to OK (never blocks blind). */
function cloudinary_credits_ok(): bool {
    return setting_raw('cloudinary_credits') !== 'exhausted';
}

/**
 * Poll Cloudinary's usage (Admin API) and cache an OK/exhausted flag; alert
 * once when it crosses the threshold. Admin-triggerable + cron-friendly.
 * Test seam: $GLOBALS['__cloudinary_usage_mock'] → returns a 0–100 percent.
 */
function cloudinary_refresh_usage(): array {
    $cfg = $GLOBALS['CONFIG']['cloudinary'] ?? [];
    $guard = $cfg['credit_guard'] ?? [];
    if (empty($guard['enabled'])) return ['ok' => true, 'checked' => false];
    $threshold = (int)($guard['threshold_pct'] ?? 90);
    $pct = null;
    if (isset($GLOBALS['__cloudinary_usage_mock']) && is_callable($GLOBALS['__cloudinary_usage_mock'])) {
        $pct = (int)($GLOBALS['__cloudinary_usage_mock'])();
    } elseif (!empty($cfg['cloud_name']) && !empty($cfg['api_key']) && !empty($cfg['api_secret']) && function_exists('curl_init')) {
        $ch = curl_init('https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/usage');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_USERPWD => $cfg['api_key'] . ':' . $cfg['api_secret']]);
        $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        if ($out !== false && $code >= 200 && $code < 300) {
            $j = json_decode((string)$out, true);
            $used = (float)($j['credits']['usage'] ?? 0);
            $limit = (float)($j['credits']['limit'] ?? 0);
            if ($limit > 0) $pct = (int)round($used / $limit * 100);
        } elseif ($code === 420 || $code === 429) {
            $pct = 100; // rate/credit ceiling hit
        }
    }
    if ($pct === null) return ['ok' => true, 'checked' => false];
    $exhausted = $pct >= $threshold;
    setting_set('cloudinary_credits', $exhausted ? 'exhausted' : 'ok', 'system');
    setting_set('cloudinary_credits_pct', (string)$pct, 'system');
    if ($exhausted) photo_pipeline_alert('cloudinary_credits_low', ['usagePct' => $pct, 'threshold' => $threshold]);
    return ['ok' => true, 'checked' => true, 'pct' => $pct, 'exhausted' => $exhausted];
}

/* ── Alerts — email + Google Chat + every integrated platform ─────────────── */

/**
 * Notify humans of a pipeline problem on every channel. Throttled to once per
 * reason per hour so a sustained failure doesn't flood inboxes.
 */
function photo_pipeline_alert(string $reason, array $detail = []): void {
    $key = 'palert_' . preg_replace('/[^a-z_]/', '', $reason);
    $lastAt = (int)(setting_raw($key) ?: 0);
    if (time() - $lastAt < 3600) { // still emit to the bus (deduped downstream), skip repeat email
        @event_emit('photo.pipeline_alert', ['reason' => $reason, 'detail' => $detail, 'throttled' => true]);
        return;
    }
    setting_set($key, (string)time(), 'system');
    $titles = [
        'cloudinary_credits_low' => 'Cloudinary credits are running low',
        'ai_unavailable'         => 'Photo analysis AI is unavailable',
        'pipeline_error'         => 'A photo failed to process',
    ];
    $title = $titles[$reason] ?? 'Photo pipeline alert';
    $lines = [];
    foreach ($detail as $k => $v) $lines[] = '<b>' . esc_html((string)$k) . ':</b> ' . esc_html(is_scalar($v) ? (string)$v : json_encode($v));
    // Bus fan-out → Google Chat, webhooks, Sheets — everything wired.
    @event_emit('photo.pipeline_alert', ['reason' => $reason, 'title' => $title, 'detail' => $detail]);
    // Email the admissions inbox.
    if (function_exists('intake_admin_alert')) {
        intake_admin_alert('[Photo pipeline] ' . $title, [
            'title' => $title,
            'intro' => 'The registration photo pipeline needs attention.',
            'bodyHtml' => '<p style="margin:0 0 10px">Reason: <b>' . esc_html($reason) . '</b></p>'
                . ($lines ? '<p style="margin:0">' . implode('<br>', $lines) . '</p>' : ''),
            'footNote' => 'Automatic alert from the photo pipeline.',
        ]);
    }
    audit('photo.alert', null, $reason, $detail, '');
}

/* ── Local image store ──────────────────────────────────────────────────────
 * Cloudinary is opt-in: it needs three keys in config.php, and until somebody
 * sets them there is nowhere to host an image. Everything above assumes a
 * hosted URL, which was fine for every surface that uploads directly — and
 * silently wrong for the one that does not.
 *
 * The public self-registration form posts its headshot INLINE, as a data: URL,
 * because it has no session and cannot use the signed upload path. That data
 * URL cannot go in `summer_students.photoUrl` (VARCHAR(512), and MySQL is
 * strict), and `photo_ingest` refuses anything that is not https — so on a
 * deployment without Cloudinary the bytes had nowhere to go and were dropped.
 * The registration succeeded and the reviewer got an empty frame, which is
 * exactly the wrong failure: the one thing the review desk exists to look at.
 *
 * So we hold the original ourselves. Content-addressed, so re-sending the same
 * photo stores it once and the URL never has to change; served by
 * api/public/photo.php with a one-year immutable cache.
 *
 * The id is an HMAC of the bytes under the app's cookie secret, not a bare
 * hash. A bare hash would let anyone holding a copy of a child's photograph
 * confirm it is in the system and fetch it back; keyed, the id is
 * unguessable without the secret, so the URL behaves as a capability. Nothing
 * enumerable, and no database round trip to serve an image.
 */
const PHOTO_STORE_MAX_BYTES = 6000000;   // a resampled headshot is ~150KB
const PHOTO_STORE_TYPES = ['jpeg' => 'jpg', 'jpg' => 'jpg', 'png' => 'png', 'webp' => 'webp'];

/**
 * Where originals live, and a fallback for the host that will not let us write
 * there.
 *
 * The intended home is `api/storage/photos`. On a badly-permissioned shared
 * host — and "the web user cannot write to a directory you uploaded by FTP" is
 * the single most common way a PHP deploy is broken — `@mkdir` fails silently,
 * `file_put_contents` fails silently, and the only trace was a line in a PHP
 * error log nobody reads. A registration then succeeded with an empty photo
 * frame, which is indistinguishable from no photo having been sent.
 *
 * So: fall back to the cache directory, which MUST already be writable or rate
 * limiting could not work at all, and record that we did. A photo in a
 * second-choice directory is worth far more than a lost one — but it is not
 * fine, so `photo_store_where()` reports it and the diagnostics screen says so
 * out loud rather than leaving the deployment quietly degraded.
 */
function photo_store_dir(): string {
    static $resolved = null;
    if ($resolved !== null) return $resolved;

    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    $primary = ($base !== '' ? dirname($base) : (__DIR__ . '/../../storage')) . '/photos';
    $cache = (string)($GLOBALS['CONFIG']['cache_dir'] ?? '');
    $candidates = [$primary];
    if ($cache !== '') $candidates[] = rtrim($cache, '/') . '/photos';

    foreach ($candidates as $i => $dir) {
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        if (!is_dir($dir) || !is_writable($dir)) continue;
        // Whichever directory wins, it must not be browsable. The primary is
        // already covered by api/storage/.htaccess; the cache fallback is not.
        $ht = $dir . '/.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
                . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n");
        }
        $GLOBALS['__photo_store_where'] = $i === 0 ? 'storage' : 'cache_fallback';
        return $resolved = $dir;
    }
    // Nothing writable. Return the primary anyway so callers get a real path in
    // their error, and let photo_store_put report the failure properly.
    $GLOBALS['__photo_store_where'] = 'unwritable';
    return $resolved = $primary;
}

/** 'storage' | 'cache_fallback' | 'unwritable' — for the diagnostics screen. */
function photo_store_where(): string {
    photo_store_dir();
    return (string)($GLOBALS['__photo_store_where'] ?? 'unknown');
}

/**
 * Can we actually store and read back an image on this host, right now?
 *
 * A real round trip — write a tiny PNG, resolve it the way the serving route
 * does, read it back, delete it — because every part of that chain is something
 * a host can break independently, and the symptom of any of them is the same
 * blank frame. Answers the question an admin actually has ("why is there no
 * photo?") instead of the one the code can see ("write_failed").
 */
function photo_store_selftest(): array {
    $dir = photo_store_dir();
    $out = ['dir' => $dir, 'where' => photo_store_where(),
            'exists' => is_dir($dir), 'writable' => is_dir($dir) && is_writable($dir),
            'files' => 0, 'bytes' => 0];
    if (is_dir($dir)) {
        foreach ((array)@scandir($dir) as $f) {
            if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', (string)$f)) continue;
            $out['files']++;
            $out['bytes'] += (int)@filesize($dir . '/' . $f);
        }
    }
    /* A 24×24 PNG, written and read back through the very same helpers a
     * submission uses — no shortcut, or the probe would pass on a host where a
     * real photo fails. Deliberately not a 1×1: photo_store_put refuses
     * anything under 100 bytes as an icon or a blank, so the smallest possible
     * PNG fails the probe for a reason that has nothing to do with the host. */
    $png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAmElEQVQ4ja3Tyw6DIBBA0Wtr37UVpPT//7QLKyEiOgwmdzFsTgYSGuCxRy0GaOoL0KGyGDrWNINadSl00rUInRXloEtpK9C1qHXoJm8TuguTQKJPIoSem8mhLp+Hrgh6Jbkwl0LvqCE+KqAeerDT8E8HmTQFZMGAnVUKDdNGFoa4IshFVxshF1K/UYA+Y3LI5yEPfpeNPHx/JEAT8G7byQ4AAAAASUVORK5CYII=';
    $r = photo_store_put($png);
    if (empty($r['ok'])) return $out + ['ok' => false, 'stage' => 'write', 'error' => (string)($r['error'] ?? 'failed')];
    $path = photo_store_path((string)$r['id']);
    $readable = $path !== '' && is_file($path) && @filesize($path) > 0;
    // Clean up: the probe is not somebody's headshot and must not survive as one.
    if ($path !== '') @unlink($path);
    return $out + ($readable
        ? ['ok' => true, 'stage' => 'read', 'url' => (string)$r['url']]
        : ['ok' => false, 'stage' => 'read', 'error' => 'written_but_unreadable']);
}

/** The on-disk path for a store id. Validated, so a crafted id cannot escape. */
function photo_store_path(string $id): string {
    if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', $id)) return '';
    return photo_store_dir() . '/' . $id;
}

function photo_store_url(string $id): string {
    return $id === '' ? '' : '/api/public/photo.php?p=' . rawurlencode($id);
}

/**
 * Every directory a stored image could be in — not just the one a fresh write
 * would pick. photo_store_dir() returns a SINGLE winner (the first writable
 * candidate), which is right for writing but wrong for reading: an image
 * written to the cache fallback while api/storage was briefly unwritable, or
 * one written before the store's base path last moved, then 404s from the
 * serving route even though its id is still on the record. This lists them all
 * so the reader can look everywhere. Read-only apart from the dir photo_store_dir
 * itself would create.
 */
function photo_store_dirs(): array {
    $dirs = [];
    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    if ($base !== '') $dirs[] = dirname($base) . '/photos';   // primary (data dir)
    $dirs[] = __DIR__ . '/../../storage/photos';              // canonical fallback base
    $cache = (string)($GLOBALS['CONFIG']['cache_dir'] ?? '');
    if ($cache !== '') $dirs[] = rtrim($cache, '/') . '/photos'; // degraded (cache) fallback
    $dirs[] = photo_store_dir();                               // whatever a write would pick now
    // De-dupe, preferring realpath so two spellings of one directory collapse.
    $seen = []; $out = [];
    foreach ($dirs as $d) {
        if ($d === '') continue;
        $key = @realpath($d) ?: $d;
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $out[] = $d;
    }
    return $out;
}

/**
 * Resolve a store id to an existing file, searching every candidate directory.
 * A bad id and a file that is genuinely absent everywhere both return '' — the
 * caller must not be able to tell them apart (no "which photos exist" oracle),
 * exactly as photo_store_path intends.
 */
function photo_store_find(string $id): string {
    if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', $id)) return '';
    foreach (photo_store_dirs() as $dir) {
        $path = $dir . '/' . $id;
        if (is_file($path)) return $path;
    }
    return '';
}

/** The directories we treat as DURABLE — the store's data location and the
 *  canonical storage fallback, but never the cache directory, which exists to
 *  be purged. These are the targets a heal copies INTO. */
function photo_store_durable_dirs(): array {
    $dirs = [];
    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    if ($base !== '') $dirs[] = dirname($base) . '/photos';
    $dirs[] = __DIR__ . '/../../storage/photos';
    $seen = []; $out = [];
    foreach ($dirs as $d) { $k = @realpath($d) ?: $d; if (isset($seen[$k])) continue; $seen[$k] = true; $out[] = $d; }
    return $out;
}

/**
 * Self-heal on view: if a served image is living somewhere disposable (the
 * cache fallback) while a durable directory is writable, copy it into the
 * durable one so a cache purge can no longer lose it. The store writes to the
 * cache only while api/storage is unwritable; the day that is fixed, the next
 * view of each stranded photo migrates it — no re-upload, no shell.
 *
 * Best-effort and silent: this is a bonus on top of a read that already
 * succeeded, and must never turn one into an error. Content-addressed + atomic
 * (temp then rename), so concurrent views healing the same id race harmlessly
 * to identical bytes. Returns the durable path if it healed (or the file was
 * already durable), else ''.
 */
function photo_store_heal(string $id, string $foundPath): string {
    if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', $id)) return '';
    $foundReal = @realpath($foundPath) ?: $foundPath;
    foreach (photo_store_durable_dirs() as $dir) {
        $target = $dir . '/' . $id;
        // Already durable — here or in an earlier durable dir. Nothing to do.
        if ((@realpath($target) ?: $target) === $foundReal) return $target;
        if (is_file($target)) return $target;
        if (!is_dir($dir) && !@mkdir($dir, 0775, true)) continue;
        if (!is_writable($dir)) continue;
        // A newly-created durable dir must not be browsable — same guard
        // photo_store_dir() applies to the dir it picks.
        $ht = $dir . '/.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
                . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n");
        }
        $rnd = function_exists('rand_hex') ? rand_hex(4) : bin2hex(random_bytes(4));
        $tmp = $target . '.' . $rnd . '.part';
        if (@copy($foundPath, $tmp) && @rename($tmp, $target)) return $target;
        @unlink($tmp);
    }
    return '';
}

/** Absolute form, for anything off-site that has to FETCH the image — the
 *  vision model and Cloudinary both do. Empty when no origin is configured,
 *  which is the honest answer rather than a URL nobody can resolve. */
function photo_store_absolute(string $relOrId): string {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    if ($origin === '' || $relOrId === '') return '';
    if (preg_match('#^https?://#i', $relOrId)) return $relOrId;
    return $origin . (strpos($relOrId, '/') === 0 ? $relOrId : photo_store_url($relOrId));
}

/**
 * Persist an inline data: URL and return its stable URL.
 *
 * Validated on the bytes, not on the declared type: a `data:image/jpeg` header
 * costs nothing to write and this is an unauthenticated intake path. The
 * extension we store under comes from what getimagesize actually found.
 */
/* ── A photo uploaded in pieces (api/member/photo-chunk.php) ─────────────────
 * For a host whose firewall refuses a large request body: the image's base64
 * arrives in pieces small enough to pass, is joined here, and is stored by
 * photo_store_put(). Pieces wait in the cache directory, keyed by who is
 * uploading and an id they chose, so two people cannot write into one upload.
 * Validated piece by piece; nothing is stored until the last piece arrives and
 * the whole is a real image. */
const PHOTO_CHUNK_MAX_PIECES = 80;
const PHOTO_CHUNK_MAX_CHARS  = 96000;     // base64 per piece — far under any body limit

function photo_chunk_dir(): string {
    $base = rtrim((string)($GLOBALS['CONFIG']['cache_dir'] ?? sys_get_temp_dir()), '/') . '/photo-chunks';
    if (!is_dir($base)) @mkdir($base, 0775, true);
    return $base;
}

function photo_chunk_put(array $p): array {
    $who = (string)($p['memberId'] ?? '');
    $id = (string)($p['uploadId'] ?? '');
    $i = (int)($p['index'] ?? -1); $n = (int)($p['total'] ?? 0);
    $mime = strtolower((string)($p['mime'] ?? ''));
    $data = (string)($p['data'] ?? '');
    if ($who === '') return ['ok' => false, 'error' => 'unauthorized'];
    if (!preg_match('/^[a-f0-9]{16,40}$/', $id)) return ['ok' => false, 'error' => 'bad_upload_id'];
    if ($n < 1 || $n > PHOTO_CHUNK_MAX_PIECES || $i < 0 || $i >= $n) return ['ok' => false, 'error' => 'bad_piece'];
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) return ['ok' => false, 'error' => 'photo_format'];
    if ($data === '' || strlen($data) > PHOTO_CHUNK_MAX_CHARS || !preg_match('#^[A-Za-z0-9+/=]+$#', $data)) return ['ok' => false, 'error' => 'bad_piece'];

    $dir = photo_chunk_dir();
    if (!is_dir($dir) || !is_writable($dir)) return ['ok' => false, 'error' => 'storage_unwritable'];
    // Pieces nobody finished are swept after an hour.
    if (mt_rand(1, 20) === 1) {
        foreach (glob($dir . '/*.part*') ?: [] as $old) { if (@filemtime($old) < time() - 3600) @unlink($old); }
    }
    $key = hash('sha256', $who . '|' . $id);
    if (@file_put_contents($dir . '/' . $key . '.part' . $i, $data) === false) return ['ok' => false, 'error' => 'storage_unwritable'];
    if ($i < $n - 1) return ['ok' => true, 'received' => $i + 1, 'total' => $n];

    // The last piece: every piece must be here, in order.
    $all = '';
    for ($k = 0; $k < $n; $k++) {
        $f = $dir . '/' . $key . '.part' . $k;
        if (!is_file($f)) return ['ok' => false, 'error' => 'missing_piece', 'detail' => 'Piece ' . ($k + 1) . ' of ' . $n . ' never arrived. Try the photo again.'];
        $all .= (string)file_get_contents($f);
        if (strlen($all) > (int)ceil(PHOTO_STORE_MAX_BYTES * 4 / 3) + 8) { photo_chunk_clear($dir, $key, $n); return ['ok' => false, 'error' => 'too_large']; }
    }
    photo_chunk_clear($dir, $key, $n);
    $st = photo_store_put('data:' . $mime . ';base64,' . $all);
    if (empty($st['ok'])) return ['ok' => false, 'error' => (string)($st['error'] ?? 'photo_failed') === 'too_large' ? 'too_large' : 'photo_format'];
    return ['ok' => true, 'url' => (string)$st['url'], 'id' => (string)$st['id']];
}

function photo_chunk_clear(string $dir, string $key, int $n): void {
    for ($k = 0; $k < $n; $k++) @unlink($dir . '/' . $key . '.part' . $k);
}

function photo_store_put(string $dataUrl): array {
    if (!preg_match('#^data:image/([a-z0-9.+-]+);base64,#i', $dataUrl, $m)) return ['ok' => false, 'error' => 'not_data_url'];
    $raw = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1) ?: '', true);
    if ($raw === false || strlen($raw) < 100) return ['ok' => false, 'error' => 'unreadable'];
    if (strlen($raw) > PHOTO_STORE_MAX_BYTES) return ['ok' => false, 'error' => 'too_large'];

    $ext = '';
    if (function_exists('getimagesizefromstring')) {
        $info = @getimagesizefromstring($raw);
        $byType = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
        if (is_array($info) && isset($byType[(int)($info[2] ?? 0)])) $ext = $byType[(int)$info[2]];
    }
    // No GD/exif build to ask? Fall back to the declared type, but only for the
    // three we are willing to serve — never to whatever the caller wrote.
    if ($ext === '') $ext = PHOTO_STORE_TYPES[strtolower($m[1])] ?? '';
    if ($ext === '') return ['ok' => false, 'error' => 'unsupported_type'];

    $secret = (string)($GLOBALS['CONFIG']['cookie_secret'] ?? 'ngg');
    $id = substr(hash_hmac('sha256', $raw, $secret), 0, 32) . '.' . $ext;
    $path = photo_store_path($id);
    if ($path === '') return ['ok' => false, 'error' => 'bad_id'];
    // Content-addressed: an identical re-send is already on disk. Writing it
    // again would be correct but pointless, and a partial write would not be.
    if (!is_file($path)) {
        $tmp = $path . '.' . rand_hex(4) . '.part';
        $wrote = @file_put_contents($tmp, $raw) !== false && @rename($tmp, $path);
        if (!$wrote) {
            @unlink($tmp);
            /* Loud, not a log line.
             *
             * This is the failure that made "photos don't display" impossible to
             * diagnose: the write fails on an unwritable directory, the caller
             * gets '' for a photoUrl, the registration succeeds, and the review
             * desk shows an empty frame that looks exactly like a family who
             * sent no photo. The only trace was error_log, which on a shared
             * host nobody reads.
             *
             * ops_record puts it in the Diagnostics journal where an admin will
             * see it; photo_pipeline_alert pages the same channels a Cloudinary
             * outage does, because losing a child's headshot is the same class
             * of problem. Guarded because this runs on a public intake path and
             * must not turn a storage fault into a 500. */
            $dir = photo_store_dir();
            $detail = 'dir=' . $dir . ' writable=' . (is_writable($dir) ? 'yes' : 'no')
                    . ' exists=' . (is_dir($dir) ? 'yes' : 'no') . ' bytes=' . strlen($raw);
            error_log('[photo_store_put] write failed: ' . $detail);
            try {
                if (function_exists('ops_record')) {
                    ops_record('error', 'photo.store', 'Could not save an uploaded photo — the image directory is not writable.', $detail);
                }
                if (function_exists('photo_pipeline_alert')) {
                    photo_pipeline_alert('photo_store_unwritable', ['dir' => $dir, 'writable' => is_writable($dir)]);
                }
            } catch (Throwable $e) { /* never let reporting break an intake */ }
            return ['ok' => false, 'error' => 'write_failed'];
        }
    }
    return ['ok' => true, 'id' => $id, 'url' => photo_store_url($id),
            'absolute' => photo_store_absolute($id), 'bytes' => strlen($raw), 'ext' => $ext];
}

/** Is this one of ours? Accepts either form, because the pipeline is handed the
 *  absolute URL (an outside service has to fetch it) and hands back whatever it
 *  was given. */
function photo_is_stored_locally(string $url): bool {
    return (bool)preg_match('#(?:^|://[^/]+)/api/public/photo\.php\?p=[0-9a-f]{32}\.(?:jpg|png|webp)$#', $url);
}

/** Store the RELATIVE form on a record. A saved absolute URL bakes in today's
 *  hostname, so moving the site — or serving it on both a bare and a www
 *  domain — silently breaks every photo already on file. The absolute form is
 *  built on demand for the two things that genuinely need it: an email, and an
 *  outside service that has to fetch the image. */
function photo_store_relativise(string $url): string {
    if (!photo_is_stored_locally($url)) return $url;
    $q = strpos($url, '/api/public/photo.php');
    return $q === false ? $url : substr($url, $q);
}

/**
 * Every column that could be holding one of these URLs, asked of the database
 * rather than written out here.
 *
 * This list used to be six columns in the sweep below, under a comment saying
 * that a column missed was a photo deleted while something still showed it.
 * Several were missed, and the store is used by more of the product every
 * release:
 *
 *   · `design_assets.url` — everything uploaded to the ID designer. It reuses
 *     this store on purpose (see dasset_upload), and a card template embeds the
 *     URL in its schemaJson, which is not a column anybody would have listed.
 *   · `member_progress.proofUrl` — a mission proof photographed on a phone.
 *     member_self_progress explicitly serves a `/api/public/photo.php` value
 *     from that column, so it is unambiguously one of ours.
 *   · `member_requests.proofUrl`, `mentors.photoUrl`, `promos.imageUrl`,
 *     `profile_projects.imageUrl` — the same shape, reached from other screens.
 *
 * Each of those was a file the sweep deleted seven days after it was stored,
 * from under a record that still pointed at it: the image 404s from then on and
 * nothing in the product says why.
 *
 * So every text-ish column in the schema is read. That is broader than
 * necessary — an audit row quoting a URL now counts as a reference and keeps a
 * file alive — and that is the right direction to be wrong in: the cost is a
 * stale file on disk, against a child's only photograph. A column added next
 * year is covered on the day it is added.
 *
 * Returns [] when the schema cannot be enumerated, which the sweep treats the
 * same as a failed read: do nothing.
 */
function photo_store_ref_columns(): array
{
    static $cols = null;
    if ($cols !== null) return $cols;

    $ident = fn(string $s) => (bool)preg_match('/^[A-Za-z0-9_]+$/', $s);
    $out = [];
    try {
        // The MySQL side is the same question db_has_column() already asks of
        // information_schema on every migration, so it is not a new dependency.
        if (db_driver() === 'mysql') {
            /* Base tables only. A view this connection cannot select from would
               abort the whole scan — the sweep fails closed, which is right, but
               it would then never collect anything again. */
            $rows = db_all("SELECT c.TABLE_NAME t, c.COLUMN_NAME c FROM information_schema.COLUMNS c
                            JOIN information_schema.TABLES tb
                              ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME
                            WHERE c.TABLE_SCHEMA = DATABASE() AND tb.TABLE_TYPE = 'BASE TABLE'
                              AND c.DATA_TYPE IN ('varchar','char','text','tinytext','mediumtext','longtext')");
            foreach ($rows as $r) {
                if ($ident((string)$r['t']) && $ident((string)$r['c'])) $out[] = [(string)$r['t'], (string)$r['c']];
            }
        } else {
            foreach (db_all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'") as $t) {
                $table = (string)$t['name'];
                if (!$ident($table)) continue;
                foreach (db_all('PRAGMA table_info(' . $table . ')') as $c) {
                    $col = (string)($c['name'] ?? '');
                    // SQLite types are advisory and often blank; anything that is
                    // not declared numeric can hold text, so include those too.
                    $type = strtolower((string)($c['type'] ?? ''));
                    $numeric = (bool)preg_match('/int|real|floa|doub|num|dec|bool|date/', $type);
                    if ($ident($col) && !$numeric) $out[] = [$table, $col];
                }
            }
        }
    } catch (Throwable $e) {
        error_log('[photo_store_ref_columns] cannot enumerate the schema: ' . $e->getMessage());
        return $cols = [];
    }
    return $cols = $out;
}

/**
 * Every store id something in the database still points at.
 *
 * Returns null — not an empty array — when the scan could not be completed, so
 * a caller can tell "nothing references anything" from "I do not know". The
 * sweep must never read the second as the first.
 */
function photo_store_referenced(): ?array
{
    // Reachable in the suite, because "the scan failed" is the branch that
    // decides whether a failure deletes the store or leaves it alone, and a
    // branch that cannot be tested is a branch nobody has checked.
    if (!empty($GLOBALS['__photo_ref_force_fail'])) return null;

    $columns = photo_store_ref_columns();
    if (!$columns) return null;

    /* One query per TABLE, not per column: this schema has over a thousand text
       columns, and a round trip each was the difference between a scan worth
       running daily and one nobody would leave switched on. */
    $q = db_driver() === 'mysql' ? '`' : '"';
    $byTable = [];
    foreach ($columns as [$table, $col]) $byTable[$table][] = $col;

    $referenced = [];
    foreach ($byTable as $table => $cols) {
        $sel = implode(', ', array_map(fn($c) => $q . $c . $q, $cols));
        $where = implode(' OR ', array_map(
            fn($c) => $q . $c . $q . " LIKE '%/api/public/photo.php?p=%'", $cols));
        try {
            foreach (db_all("SELECT $sel FROM " . $q . $table . $q . " WHERE $where") as $row) {
                foreach ($row as $col => $v) {
                    if (!is_string($v) || strpos($v, '/api/public/photo.php?p=') === false) continue;
                    if (!preg_match_all('/p=([0-9a-f]{32}\.(?:jpg|png|webp))/', $v, $m)) continue;
                    foreach ($m[1] as $id) $referenced[$id] = $table . '.' . $col;
                }
            }
        } catch (Throwable $e) {
            /* A dropped column, a view we cannot select from, a broken
               connection: we no longer know what is referenced. Say so rather
               than guess — deleting a child's only photograph because a query
               failed is not a tradeoff worth making. */
            error_log('[photo_store_referenced] aborted, cannot read ' . $table . ': ' . $e->getMessage());
            return null;
        }
    }
    return $referenced;
}

/**
 * Ids something still points at whose bytes are gone — the 404 in a browser
 * console, counted.
 *
 * Nothing in the product could see this. The self-test answers "can this host
 * keep a photograph", the record check answers "did one arrive", and neither
 * notices a URL on a row whose file is no longer on disk: the card shows an
 * empty frame, the console shows a 404, and the two are never connected. It has
 * a cause worth naming — the sweep used to delete files it could not see a
 * reference to — and a remedy that needs knowing which children are affected.
 *
 * `scanned` is false when the reference scan could not be completed at all —
 * reported separately from "nothing is broken", because a check that cannot run
 * must not show up as a clean bill of health OR as a red light claiming zero
 * broken links out of zero.
 *
 * @return array{scanned: bool, ok: bool, checked: int, missing: int, where: array, ids: array}
 */
function photo_store_broken_refs(int $limit = 400): array
{
    $referenced = photo_store_referenced();
    if ($referenced === null) {
        return ['scanned' => false, 'ok' => false, 'checked' => 0, 'missing' => 0, 'where' => [], 'ids' => []];
    }

    $missing = 0; $where = []; $ids = []; $checked = 0;
    foreach ($referenced as $id => $place) {
        if ($checked >= $limit) break;
        $checked++;
        $path = photo_store_find($id);
        if ($path !== '' && is_file($path)) continue;
        $missing++;
        $where[$place] = (int)($where[$place] ?? 0) + 1;
        if (count($ids) < 10) $ids[] = $id;
    }
    return ['scanned' => true, 'ok' => $missing === 0, 'checked' => $checked,
            'missing' => $missing, 'where' => $where, 'ids' => $ids];
}

/**
 * Delete stored images nothing points at any more.
 *
 * The store is write-on-intake, and an intake can be refused after the bytes
 * have landed — a rejected application, a duplicate registration, a photo
 * replaced by a retake. Content-addressing means a re-send costs nothing, but
 * abandoned originals would accumulate forever on a shared host with a disk
 * quota, and "the site stopped working" from a full disk is a bad way to find
 * out about a design decision.
 *
 * Deliberately conservative:
 *  - A file must be older than $days before it is even a candidate, so a photo
 *    mid-flight between being stored and being written to its row is never
 *    swept out from under the request that is creating it.
 *  - Every column that can hold one of these URLs is consulted — every text
 *    column in the schema, asked of the database rather than listed by hand —
 *    and if ANY of those reads throws, the sweep does nothing at all. Deleting
 *    a child's only photograph because a query failed is not a tradeoff worth
 *    making, and neither is deleting one because nobody remembered that the ID
 *    designer stores its uploads here too.
 *  - Bounded per run, because this is driven by ordinary web traffic.
 */
function photo_store_sweep(int $days = 7, int $limit = 200): int {
    $dir = photo_store_dir();
    if (!is_dir($dir)) return 0;
    $cut = time() - max(1, $days) * 86400;

    $files = [];
    foreach ((array)@scandir($dir) as $f) {
        if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', (string)$f)) continue;
        $path = $dir . '/' . $f;
        if (!is_file($path) || @filemtime($path) > $cut) continue;
        $files[] = $f;
        if (count($files) >= $limit) break;
    }
    if (!$files) return 0;

    /* Everywhere a stored URL can legitimately live — discovered from the
     * schema, not listed here. A column missed is a photo deleted while
     * something still shows it, and several were missed while this was a list
     * (see photo_store_ref_columns). A null answer means the scan could not be
     * completed, which must never read as "nothing is referenced". */
    $referenced = photo_store_referenced();
    if ($referenced === null) return 0;

    $gone = 0;
    foreach ($files as $f) {
        if (isset($referenced[$f])) continue;
        if (@unlink($dir . '/' . $f)) $gone++;
    }
    if ($gone > 0) audit('photo.store.swept', null, '', ['deleted' => $gone], '');
    return $gone;
}

/**
 * The single door every intake path puts a photo through.
 *
 * A client hands over one of two things and the difference is not its problem:
 * a hosted URL, when a cloud is configured and the browser uploaded straight to
 * it, or the image itself as an inline data: URL, when there is no cloud to
 * upload to. Every endpoint that took a photo used to accept only the first —
 * apply.php truncated a data URL to 512 characters of nonsense, reshoot_submit
 * refused it as `bad_photo`, gate_register dropped it — so on a deployment
 * without Cloudinary, which is every deployment until somebody sets three keys,
 * photographs quietly did not work anywhere.
 *
 * Returns a URL that is safe to put in a VARCHAR(512), or '' if there was
 * nothing usable. Never throws: a photo is never worth failing a registration
 * over.
 */
function photo_intake_url(string $incoming, int $max = 512): string {
    $u = trim($incoming);
    if ($u === '') return '';
    if (preg_match('#^data:#i', $u)) {
        try {
            $st = photo_store_put($u);
            return !empty($st['ok']) ? (string)$st['url'] : '';
        } catch (Throwable $e) {
            error_log('[photo_intake_url] ' . $e->getMessage());
            return '';
        }
    }
    // Already hosted somewhere. Only http(s) and our own served path are URLs;
    // anything else (javascript:, file:, a bare filename) is not a photo.
    if (!preg_match('#^(https?://|/api/public/photo\.php\?)#i', $u)) return '';
    return substr($u, 0, $max);
}

/* ── Ingest + process ─────────────────────────────────────────────────────── */

/** Create a governed asset for a freshly captured image (versions on re-capture). */
function photo_ingest(string $subjectType, string $subjectId, string $sourceUrl, string $byId = ''): array {
    $subjectType = in_array($subjectType, ['student', 'volunteer', 'member'], true) ? $subjectType : 'student';
    if ($sourceUrl === '' || !preg_match('#^https://#', $sourceUrl)) return ['ok' => false, 'error' => 'bad_source'];
    $prev = db_row("SELECT id, version FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status NOT IN ('superseded','rejected') ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);
    $version = $prev ? ((int)$prev['version'] + 1) : 1;
    if ($prev) db_update('photo_assets', ['status' => 'superseded', 'updatedAt' => now_iso()], ['id' => $prev['id']]);
    $assetId = 'PH-' . strtoupper(rand_hex(6));
    while (db_row('SELECT id FROM photo_assets WHERE assetId = ?', [$assetId])) $assetId = 'PH-' . strtoupper(rand_hex(6));
    db_insert('photo_assets', [
        'assetId' => $assetId, 'subjectType' => $subjectType, 'subjectId' => $subjectId,
        'version' => $version, 'status' => 'captured', 'sourceUrl' => $sourceUrl,
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    audit('photo.captured', $byId, $assetId, ['subject' => $subjectType . ':' . $subjectId, 'v' => $version], '');
    @event_emit('photo.captured', ['ref' => $assetId, 'subjectType' => $subjectType, 'subjectId' => $subjectId, 'version' => $version]);
    return ['ok' => true, 'assetId' => $assetId, 'version' => $version];
}

/**
 * Run the pipeline for one asset: free AI analysis → Cloudinary edit
 * (credit-gated) → auto-approve clean images or route flagged ones to review.
 * Never throws; failures alert humans and fall through to human review.
 */
function photo_process(string $assetId): array {
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ? LIMIT 1', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array((string)$a['status'], ['captured', 'analyzing'], true)) return ['ok' => true, 'status' => $a['status'], 'noop' => true];
    db_update('photo_assets', ['status' => 'analyzing', 'updatedAt' => now_iso()], ['assetId' => $assetId]);

    $review = ai_photo_review((string)$a['sourceUrl']);
    $score = null; $flags = []; $issues = []; $rec = ['crop' => true]; $provider = '';
    if (!empty($review['ok']) && is_array($review['data'] ?? null)) {
        $d = $review['data'];
        $score = isset($d['score']) ? (int)$d['score'] : null;
        $flags = array_values(array_filter(array_map('strval', is_array($d['flags'] ?? null) ? $d['flags'] : [])));
        $issues = array_values(array_filter(array_map('strval', is_array($d['issues'] ?? null) ? $d['issues'] : [])));
        $rec = is_array($d['recommend'] ?? null) ? $d['recommend'] : $rec;
        $provider = (string)($review['provider'] ?? '');
    } else {
        // Analysis unavailable — Cloudinary still does a safe optimization,
        // but a human MUST review. Alert on the outage.
        $flags = ['ai_unavailable'];
        photo_pipeline_alert('ai_unavailable', ['error' => (string)($review['error'] ?? 'unknown'), 'asset' => $assetId]);
    }
    // Derive Cloudinary intents from flags. Softness/low-res are handled with a
    // non-generative unsharp mask (never generative restore/upscale — see the
    // identity-preservation rule in cloudinary_edit). Very low-res images that
    // sharpening can't save are flagged for a human retake, not reconstructed.
    if (in_array('too_blurry', $flags, true)) $rec['sharpen'] = true;
    if (in_array('low_resolution', $flags, true)) $rec['sharpen'] = true;
    if (in_array('too_dark', $flags, true)) $rec['brighten'] = true;
    // Every ID headshot gets a clean, uniform studio backdrop by default — it is
    // an environment swap that leaves the face untouched (identity safe), and it
    // makes the printed card look consistent regardless of where the photo was
    // taken. Still credit-gated below and switchable off via the setting.
    if (setting_raw('photo_bg_removal') !== '0') $rec['removeBackground'] = true;

    $creditsOk = cloudinary_credits_ok();
    $wantedAi = !empty($rec['removeBackground']);
    if ($wantedAi && !$creditsOk) photo_pipeline_alert('cloudinary_credits_low', ['asset' => $assetId, 'degraded' => true]);
    $edit = cloudinary_edit((string)$a['sourceUrl'], $rec, $creditsOk);

    $serious = array_intersect($flags, ['no_face', 'multiple_faces', 'not_a_child_headshot', 'inappropriate', 'ai_unavailable']);
    $threshold = (int)(setting_raw('photo_review_threshold') ?: 55);
    $autoOk = setting_raw('photo_autoapprove') !== '0';
    $needsHuman = !empty($serious) || ($score !== null && $score < $threshold) || !$autoOk;

    $findings = json_encode(['score' => $score, 'issues' => $issues, 'flags' => $flags, 'recommend' => $rec], JSON_UNESCAPED_SLASHES);
    $row = [
        'editedUrl' => $edit['url'], 'transforms' => $edit['transforms'],
        'aiScore' => $score, 'aiProvider' => $provider, 'aiFindings' => $findings,
        'updatedAt' => now_iso(),
    ];
    if ($needsHuman) {
        $row['status'] = 'pending_review';
    } else {
        $row['status'] = 'approved'; $row['autoApproved'] = 1;
        $row['reviewedBy'] = 'ai-auto'; $row['reviewedAt'] = now_iso();
    }
    db_update('photo_assets', $row, ['assetId' => $assetId]);
    audit('photo.' . ($needsHuman ? 'ai_analyzed' : 'auto_approved'), $provider ? 'ai:' . $provider : 'ai', $assetId, ['score' => $score, 'flags' => $flags, 'aiUsed' => $edit['aiUsed']], '');
    if (!$needsHuman) {
        photo_apply_to_subject(array_merge($a, ['editedUrl' => $edit['url']]));
        photo_retry_issuance($a);
        @event_emit('photo.approved', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'auto' => true]);
    }
    return ['ok' => true, 'status' => $row['status'], 'score' => $score, 'flags' => $flags, 'aiUsed' => $edit['aiUsed'], 'editedUrl' => $edit['url']];
}

/* ── Children whose photograph never made it ─────────────────────────────────
 * Every registration that arrived before the image store existed lost its
 * headshot at submit time: the bytes were handed to a pipeline that refused
 * anything that was not already hosted, and were dropped. Nothing can recover
 * them — the image was never written anywhere — so the only honest fix is to
 * ask those families again.
 *
 * That has to be findable and it has to be bulk. A coordinator is not going to
 * open two hundred records to notice which ones are blank, and the review desk
 * only shows what is still pending; children already approved and issued a card
 * are exactly the ones with a card that has no face on it.
 */

/** Everyone with no photograph on file, newest first, with whether they can
 *  actually be reached and when they were last asked. */
function admin_photos_missing(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $limit = max(1, min(500, (int)($p['limit'] ?? 200)));
    $rows = db_all("SELECT studentId, displayId, fullName, centre, track, regStatus, submittedVia,
                           parentEmail, guardianPhone, enrolledAt, photoAskedAt
                    FROM summer_students
                    WHERE (photoUrl IS NULL OR photoUrl = '') AND status != 'inactive'
                    ORDER BY id DESC LIMIT ?", [$limit]);
    $out = [];
    foreach ($rows as $r) {
        $email = trim((string)($r['parentEmail'] ?? ''));
        $out[] = [
            'studentId' => (string)$r['studentId'], 'displayId' => (string)($r['displayId'] ?? ''),
            'fullName' => (string)$r['fullName'], 'centre' => (string)($r['centre'] ?? ''),
            'course' => (string)($r['track'] ?? ''), 'regStatus' => (string)($r['regStatus'] ?? ''),
            // Self-registered means the family definitely SENT one — it was lost.
            // A desk registration may simply never have had a photo taken.
            'selfRegistered' => trim((string)($r['submittedVia'] ?? '')) !== '',
            'reachable' => $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) !== false,
            'parentEmail' => $email,
            'registeredAt' => (string)($r['enrolledAt'] ?? ''),
            'askedAt' => (string)($r['photoAskedAt'] ?? ''),
        ];
    }
    $total = (int)(db_row("SELECT COUNT(*) c FROM summer_students
                           WHERE (photoUrl IS NULL OR photoUrl = '') AND status != 'inactive'")['c'] ?? 0);
    return ['ok' => true, 'students' => $out, 'total' => $total, 'shown' => count($out)];
}

/**
 * Email those families a retake link.
 *
 * Bounded and resumable, because the realistic use is two hundred children and a
 * coordinator who will lose the connection halfway and press the button again:
 *
 *  - `quietDays` skips anyone already asked recently, so a second press
 *    continues rather than emailing the same families twice.
 *  - `limit` caps one run; the caller presses again for the next batch and the
 *    quiet period makes that safe.
 *  - photoAskedAt is stamped BEFORE the send, so a message that goes out and
 *    then times out is never sent twice. Better a family missed this round than
 *    one emailed four times about their child's photograph.
 *  - Nobody unreachable is counted as asked.
 */
function admin_photos_request_missing(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $limit = max(1, min(200, (int)($p['limit'] ?? 50)));
    $quietDays = max(0, min(90, (int)($p['quietDays'] ?? 3)));
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - $quietDays * 86400);

    $rows = db_all("SELECT studentId, fullName, parentEmail FROM summer_students
                    WHERE (photoUrl IS NULL OR photoUrl = '') AND status != 'inactive'
                      AND parentEmail != '' AND (photoAskedAt IS NULL OR photoAskedAt = '' OR photoAskedAt < ?)
                    ORDER BY id DESC LIMIT ?", [$cut, $limit]);
    if (!$rows) return ['ok' => true, 'asked' => 0, 'remaining' => 0, 'message' => 'Nobody is due — everyone reachable has been asked recently.'];

    $asked = 0; $failed = 0;
    foreach ($rows as $r) {
        $id = (string)$r['studentId'];
        db_update('summer_students', ['photoAskedAt' => now_iso()], ['studentId' => $id]);
        try {
            reshoot_notify_guardian($id, 'We do not have a photo on file for ' . explode(' ', (string)$r['fullName'])[0] . '.');
            $asked++;
        } catch (Throwable $e) { $failed++; error_log('[photos.request_missing] ' . $id . ': ' . $e->getMessage()); }
    }
    $remaining = (int)(db_row("SELECT COUNT(*) c FROM summer_students
                               WHERE (photoUrl IS NULL OR photoUrl = '') AND status != 'inactive'
                                 AND parentEmail != '' AND (photoAskedAt IS NULL OR photoAskedAt = '' OR photoAskedAt < ?)",
                              [$cut])['c'] ?? 0);
    audit('photos.request_missing', (string)$g['requester']['memberId'], '', ['asked' => $asked, 'failed' => $failed], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'asked' => $asked, 'failed' => $failed, 'remaining' => $remaining];
}

/* ── Editor queue + transitions ───────────────────────────────────────────── */

function photo_public(array $a): array {
    return [
        'assetId' => $a['assetId'], 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'],
        'version' => (int)$a['version'], 'status' => $a['status'],
        'sourceUrl' => $a['sourceUrl'], 'editedUrl' => $a['editedUrl'],
        'aiScore' => isset($a['aiScore']) ? (int)$a['aiScore'] : null,
        'aiFindings' => json_decode((string)($a['aiFindings'] ?? ''), true) ?: null,
        'claimedBy' => $a['claimedBy'], 'autoApproved' => (int)$a['autoApproved'],
        'reviewedBy' => $a['reviewedBy'], 'createdAt' => $a['createdAt'],
    ];
}

function admin_photo_queue(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM photo_assets WHERE status IN ('pending_review','in_review') ORDER BY (status='in_review'), createdAt LIMIT 300");
    /* Whose face it is. A reviewer deciding "is this the right child" was
       shown `student:SS-0412` and nothing else. One grouped read per subject
       type — never a query per row (CLAUDE.md §11). */
    $names = photo_subject_names($rows);
    $out = array_map(function ($r) use ($names) {
        $n = $names[$r['subjectType'] . ':' . $r['subjectId']] ?? null;
        return photo_public($r) + ['subjectName' => $n['name'] ?? '', 'subjectCentre' => $n['centre'] ?? ''];
    }, $rows);
    return ['ok' => true, 'queue' => $out, 'pending' => count($rows)];
}

/** "type:id" => [name, centre] for the subjects of these photo rows. */
function photo_subject_names(array $rows): array {
    $by = [];
    foreach ($rows as $r) $by[(string)$r['subjectType']][(string)$r['subjectId']] = true;
    $src = ['student' => ['summer_students', 'studentId', 'centre'], 'volunteer' => ['volunteers', 'volunteerId', null], 'member' => ['members', 'memberId', 'centre']];
    $out = [];
    foreach ($by as $type => $ids) {
        if (!isset($src[$type])) continue;
        [$table, $key, $centre] = $src[$type];
        $ids = array_keys($ids);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        try {
            foreach (db_all("SELECT $key k, fullName" . ($centre ? ", $centre c" : "") . " FROM $table WHERE $key IN ($ph)", $ids) as $x)
                $out[$type . ':' . $x['k']] = ['name' => (string)$x['fullName'], 'centre' => (string)($x['c'] ?? '')];
        } catch (Throwable $e) {}
    }
    return $out;
}

/** Atomic claim — only one editor can hold an item; guards against double review. */
function photo_claim(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $n = db_exec("UPDATE photo_assets SET status='in_review', claimedBy=?, claimedAt=? WHERE assetId=? AND status='pending_review'",
        [$g['requester']['memberId'], now_iso(), $assetId]);
    if (!$n) return ['ok' => false, 'error' => 'already_claimed'];
    audit('photo.claimed', $g['requester']['memberId'], $assetId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function photo_approve(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ?', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if ($a['status'] === 'approved') return ['ok' => true, 'already' => true];
    if (!in_array((string)$a['status'], ['pending_review', 'in_review', 'changes_requested'], true)) return ['ok' => false, 'error' => 'bad_state'];
    $edited = trim((string)($p['editedUrl'] ?? '')) ?: (string)$a['editedUrl'];
    db_update('photo_assets', ['status' => 'approved', 'editedUrl' => $edited, 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso(), 'decisionNote' => substr((string)($p['note'] ?? ''), 0, 300), 'autoApproved' => 0, 'updatedAt' => now_iso()], ['assetId' => $assetId]);
    photo_apply_to_subject(array_merge($a, ['editedUrl' => $edited]));
    photo_retry_issuance($a);
    audit('photo.approved', $g['requester']['memberId'], $assetId, [], (string)($p['ip'] ?? ''));
    @event_emit('photo.approved', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'auto' => false]);
    return ['ok' => true];
}

/** Retry the issuance gate for a photo's student subject.
 *
 *  Called after any decision that CHANGES whether the gate holds — approval
 *  (there is now an approved photo) and rejection (there is now no photo in the
 *  pipeline at all, which the gate treats the same as never having had one).
 *  Both release the hold; neither used to retry it on rejection, so half of the
 *  transitions out of "held" left the child held forever. */
function photo_retry_issuance(array $a): void {
    if (($a['subjectType'] ?? '') === 'student' && function_exists('registration_issue_id')) {
        try { registration_issue_id((string)$a['subjectId']); } catch (Throwable $e) {}
    }
}

function photo_request_retake(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $reason = substr(trim((string)($p['reason'] ?? '')), 0, 300);
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ?', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    db_update('photo_assets', ['status' => 'changes_requested', 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso(), 'decisionNote' => $reason, 'updatedAt' => now_iso()], ['assetId' => $assetId]);
    audit('photo.retake_requested', $g['requester']['memberId'], $assetId, ['reason' => $reason], (string)($p['ip'] ?? ''));
    @event_emit('photo.retake_requested', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'reason' => $reason]);
    // Email the guardian a re-shoot link (students only — volunteers re-upload
    // through the admin console).
    if (($a['subjectType'] ?? '') === 'student' && function_exists('reshoot_notify_guardian')) {
        try { reshoot_notify_guardian((string)$a['subjectId'], $reason); } catch (Throwable $e) {}
    }
    return ['ok' => true];
}

function photo_reject(array $p): array {
    // Hard reject needs the elevated 'people' capability (segregation of duties).
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $reason = substr(trim((string)($p['reason'] ?? '')), 0, 300);
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ?', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    db_update('photo_assets', ['status' => 'rejected', 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso(), 'decisionNote' => $reason, 'updatedAt' => now_iso()], ['assetId' => $assetId]);
    audit('photo.rejected', $g['requester']['memberId'], $assetId, ['reason' => $reason], (string)($p['ip'] ?? ''));
    /* Rejecting releases the issuance hold, because the gate's own rule says a
     * rejected photo is not a photo: it holds only while an asset is in the
     * pipeline, and 'rejected' is excluded from that set. Nothing retried the
     * gate here, so the rule and the behaviour disagreed — a verified child whose
     * photo was rejected sat in the roster with no ID for the rest of the
     * programme, and no screen said why, because "held on a photo" was no longer
     * true of them. Approval already retries; rejection has to as well. */
    photo_retry_issuance($a);
    return ['ok' => true];
}

/* ── Bringing a photo into Cloudinary ─────────────────────────────────────
 * Cloudinary's edits are delivery-URL transforms, so they only apply to an
 * image Cloudinary holds. A photo stored on this site (/api/public/photo.php)
 * or anywhere else used to be refused as `not_editable` — which, on a
 * deployment that keeps its photos locally, meant no photo could be edited at
 * all. Such a photo is uploaded once (signed, server side; the secret never
 * leaves PHP) and the edit is applied to the uploaded copy.
 * Test seam: $GLOBALS['__cloudinary_upload_mock'] = fn($file, $folder) => url. */
function cloudinary_configured(): bool {
    $c = $GLOBALS['CONFIG']['cloudinary'] ?? [];
    return !empty($c['cloud_name']) && !empty($c['api_key']) && !empty($c['api_secret']);
}
function cloudinary_hosted(string $url): bool {
    return (bool)preg_match('#^https://res\.cloudinary\.com/[^/]+/image/upload/#', $url);
}
function cloudinary_adopt(string $url): array {
    $url = trim($url);
    if ($url === '') return ['ok' => false, 'error' => 'no_photo'];
    if (cloudinary_hosted($url)) return ['ok' => true, 'url' => cloudinary_base($url), 'adopted' => false];
    if (!cloudinary_configured()) return ['ok' => false, 'error' => 'cloudinary_not_configured'];
    $file = '';
    if (photo_is_stored_locally($url) && preg_match('/p=([0-9a-f]{32}\.(jpg|png|webp))$/', $url, $m)) {
        $path = photo_store_find($m[1]);
        if ($path === '') return ['ok' => false, 'error' => 'photo_missing'];
        $mime = $m[2] === 'png' ? 'image/png' : ($m[2] === 'webp' ? 'image/webp' : 'image/jpeg');
        $file = 'data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($path));
    } elseif (preg_match('#^https://#', $url) || strpos($url, 'data:image/') === 0) {
        $file = $url;                              // Cloudinary fetches a public URL itself
    } else {
        return ['ok' => false, 'error' => 'no_photo'];
    }
    $cfg = $GLOBALS['CONFIG']['cloudinary'];
    $folder = trim((string)($cfg['folder'] ?? 'ngg'), '/') . '/photos';
    if (isset($GLOBALS['__cloudinary_upload_mock']) && is_callable($GLOBALS['__cloudinary_upload_mock'])) {
        $secure = (string)($GLOBALS['__cloudinary_upload_mock'])($file, $folder);
        return $secure !== '' ? ['ok' => true, 'url' => $secure, 'adopted' => true] : ['ok' => false, 'error' => 'upload_failed'];
    }
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'upload_failed'];
    $ts = time();
    $sig = sha1('folder=' . $folder . '&timestamp=' . $ts . $cfg['api_secret']);
    $ch = curl_init('https://api.cloudinary.com/v1_1/' . rawurlencode((string)$cfg['cloud_name']) . '/image/upload');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_POSTFIELDS => ['file' => $file, 'api_key' => (string)$cfg['api_key'], 'timestamp' => $ts, 'folder' => $folder, 'signature' => $sig]]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $j = is_string($raw) ? json_decode($raw, true) : null;
    $secure = is_array($j) ? (string)($j['secure_url'] ?? '') : '';
    if ($code !== 200 || $secure === '') return ['ok' => false, 'error' => 'upload_failed', 'detail' => is_array($j) ? (string)($j['error']['message'] ?? '') : ''];
    return ['ok' => true, 'url' => $secure, 'adopted' => true];
}

/** The table and key column holding a subject's photo. */
function photo_subject_table(string $subjectType): ?array {
    if ($subjectType === 'member') return ['members', 'memberId'];
    if ($subjectType === 'volunteer') return ['volunteers', 'volunteerId'];
    if ($subjectType === 'student') return ['summer_students', 'studentId'];
    return null;
}

/** A manual edit spec, cleaned: the same controls the editor offers. */
function photo_edit_spec(array $spec): array {
    $g = (string)($spec['gravity'] ?? 'face');
    return [
        'gravity'  => in_array($g, ['face', 'faces', 'center', 'north', 'south', 'auto'], true) ? $g : 'face',
        'zoom'     => max(1.0, min(2.5, (float)($spec['zoom'] ?? 1))),
        'brighten' => !empty($spec['brighten']), 'sharpen' => !empty($spec['sharpen']), 'removeBg' => !empty($spec['removeBg']),
    ];
}

/**
 * Edit one subject's photo with Cloudinary and put the result on the record.
 * The one implementation behind both the single edit and the bulk run, so the
 * two cannot drift. No gate and no audit — the callers own those.
 */
function photo_edit_subject(string $subjectType, string $subjectId, string $assetId, array $spec): array {
    $a = null;
    if ($assetId !== '') $a = db_row('SELECT * FROM photo_assets WHERE assetId = ? LIMIT 1', [$assetId]);
    elseif ($subjectType !== '' && $subjectId !== '') $a = db_row("SELECT * FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status NOT IN ('rejected') ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);
    if ($a) { $subjectType = (string)$a['subjectType']; $subjectId = (string)$a['subjectId']; }
    $tbl = photo_subject_table($subjectType);
    $row = ($tbl && $subjectId !== '') ? db_row("SELECT photoUrl FROM {$tbl[0]} WHERE {$tbl[1]} = ? LIMIT 1", [$subjectId]) : null;
    $before = $row ? (string)($row['photoUrl'] ?? '') : '';
    $source = $a ? (string)$a['sourceUrl'] : cloudinary_base($before);
    if ($source === '') return ['ok' => false, 'error' => 'no_photo'];
    $ad = cloudinary_adopt($source);
    if (empty($ad['ok'])) return $ad;
    $edit = cloudinary_edit_manual($ad['url'], $spec);
    if ($a) db_update('photo_assets', ($ad['adopted'] ? ['sourceUrl' => $ad['url']] : []) + ['editedUrl' => $edit['url'], 'transforms' => $edit['transforms'], 'updatedAt' => now_iso()], ['assetId' => $a['assetId']]);
    $unchanged = $before !== '' && photo_store_relativise($edit['url']) === $before;
    if (!$unchanged) photo_apply_to_subject(['subjectType' => $subjectType, 'subjectId' => $subjectId, 'editedUrl' => $edit['url']]);
    return ['ok' => true, 'url' => $edit['url'], 'transforms' => $edit['transforms'], 'unchanged' => $unchanged, 'adopted' => !empty($ad['adopted']),
        'subjectType' => $subjectType, 'subjectId' => $subjectId, 'assetId' => $a['assetId'] ?? ''];
}

/**
 * Admin edit — reframe/brighten/sharpen/remove the background of ONE photo.
 */
function admin_photo_edit(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $spec = photo_edit_spec(is_array($p['spec'] ?? null) ? $p['spec'] : []);
    $r = photo_edit_subject((string)($p['subjectType'] ?? ''), (string)($p['subjectId'] ?? ''), (string)($p['assetId'] ?? ''), $spec);
    if (empty($r['ok'])) return $r;
    audit('photo.edited', $g['requester']['memberId'], ($r['subjectType'] . ':' . $r['subjectId']), ['spec' => $spec, 'assetId' => $r['assetId'], 'adopted' => $r['adopted']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'url' => $r['url'], 'transforms' => $r['transforms'], 'unchanged' => $r['unchanged']];
}

const PHOTO_EDIT_BULK_MAX = 200;
/**
 * The same Cloudinary edit for many people at once (the ID Card Studio's
 * "Improve photos"). Capped; the whole payload is validated before any
 * write; centre scope refused per row; a background removal is refused up
 * front when credits are out rather than half-applied; `unchanged` reported
 * apart from applied; ONE audit event for the run. Each row goes through
 * photo_edit_subject, the same code as a single edit.
 */
function admin_photo_edit_bulk(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $items = $p['items'] ?? null;
    if (!is_array($items) || !$items) return ['ok' => false, 'error' => 'bad_items'];
    if (count($items) > PHOTO_EDIT_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => PHOTO_EDIT_BULK_MAX];
    $clean = []; $seen = [];
    foreach (array_values($items) as $i => $it) {
        $t = is_array($it) ? (string)($it['subjectType'] ?? '') : '';
        $id = is_array($it) ? trim((string)($it['subjectId'] ?? '')) : '';
        if (!photo_subject_table($t) || $id === '' || strlen($id) > 64) return ['ok' => false, 'error' => 'bad_item', 'index' => $i];
        if (isset($seen[$t . ':' . $id])) continue;
        $seen[$t . ':' . $id] = 1; $clean[] = [$t, $id];
    }
    $spec = photo_edit_spec(is_array($p['spec'] ?? null) ? $p['spec'] : []);
    if (!cloudinary_configured()) return ['ok' => false, 'error' => 'cloudinary_not_configured'];
    if ($spec['removeBg'] && !cloudinary_credits_ok()) return ['ok' => false, 'error' => 'credits_exhausted'];
    $results = []; $applied = 0; $unchanged = 0; $refused = [];
    foreach ($clean as [$t, $id]) {
        $tbl = photo_subject_table($t);
        $row = db_row("SELECT centre FROM {$tbl[0]} WHERE {$tbl[1]} = ? LIMIT 1", [$id]);
        if (!$row) { $results[] = ['subjectType' => $t, 'subjectId' => $id, 'ok' => false, 'error' => 'not_found']; $refused['not_found'] = ($refused['not_found'] ?? 0) + 1; continue; }
        if (!admin_centre_allowed($g['requester'], (string)($row['centre'] ?? ''))) { $results[] = ['subjectType' => $t, 'subjectId' => $id, 'ok' => false, 'error' => 'out_of_scope']; $refused['out_of_scope'] = ($refused['out_of_scope'] ?? 0) + 1; continue; }
        $r = photo_edit_subject($t, $id, '', $spec);
        if (empty($r['ok'])) { $e = (string)($r['error'] ?? 'failed'); $results[] = ['subjectType' => $t, 'subjectId' => $id, 'ok' => false, 'error' => $e]; $refused[$e] = ($refused[$e] ?? 0) + 1; continue; }
        if ($r['unchanged']) $unchanged++; else $applied++;
        $results[] = ['subjectType' => $t, 'subjectId' => $id, 'ok' => true, 'unchanged' => $r['unchanged'], 'url' => $r['url']];
    }
    audit('photo.edited.bulk', $g['requester']['memberId'], 'photos', ['count' => count($clean), 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'spec' => $spec], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ran' => count($clean), 'applied' => $applied, 'unchanged' => $unchanged, 'failed' => count($clean) - $applied - $unchanged, 'results' => $results];
}

/**
 * Admin replace — ingest a freshly-uploaded source for a subject and run it
 * through the pipeline (a new version). The admin uploads via the signed
 * endpoint, then passes the returned sourceUrl here.
 */
function admin_photo_replace(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $subjectType = (string)($p['subjectType'] ?? '');
    $subjectId = (string)($p['subjectId'] ?? '');
    /* Hosted URL or the image itself — the editor's browser sends whichever it
     * could manage, and with no cloud configured that is the image. Stored
     * first so there is always something to point the record at, even when the
     * governed pipeline cannot run. */
    $sourceUrl = photo_intake_url((string)($p['sourceUrl'] ?? ''));
    if ($subjectId === '') return ['ok' => false, 'error' => 'missing_subject'];
    if ($sourceUrl === '') return ['ok' => false, 'error' => 'bad_source'];
    $ing = photo_ingest($subjectType, $subjectId, photo_store_absolute($sourceUrl) ?: $sourceUrl, $g['requester']['memberId']);
    if (empty($ing['ok'])) {
        // No pipeline (no cloud, no reachable origin) is not a reason to refuse
        // an editor's replacement — apply it and say the edit did not run.
        photo_apply_to_subject(['subjectType' => $subjectType, 'subjectId' => $subjectId, 'editedUrl' => $sourceUrl]);
        audit('photo.replaced', $g['requester']['memberId'], ($subjectType . ':' . $subjectId),
            ['applied' => $sourceUrl, 'pipeline' => (string)($ing['error'] ?? 'failed')], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'assetId' => '', 'status' => 'captured', 'editedUrl' => $sourceUrl];
    }
    $proc = photo_process($ing['assetId']);
    // An admin-initiated replace is authoritative: apply it to the card/profile
    // straight away even when analysis routed it to review. Adult volunteer
    // photos in particular trip the child-headshot heuristic and would otherwise
    // sit in the queue forever with the OLD photo still on the card. The asset
    // still stays in the review queue for a post-hoc safeguarding look.
    $applied = (string)($proc['editedUrl'] ?? '') ?: $sourceUrl;
    if (($proc['status'] ?? '') !== 'approved' && $applied !== '') {
        photo_apply_to_subject(['subjectType' => $subjectType, 'subjectId' => $subjectId, 'editedUrl' => $applied]);
    }
    audit('photo.replaced', $g['requester']['memberId'], ($subjectType . ':' . $subjectId), ['assetId' => $ing['assetId'], 'applied' => $applied], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'assetId' => $ing['assetId'], 'status' => $proc['status'] ?? 'captured', 'editedUrl' => $applied];
}

/** Push the approved (edited) image back onto the subject's record so the ID
 *  card + profile always render the approved photo. Best-effort. */
function photo_apply_to_subject(array $a): void {
    // Relativised: the pipeline is handed the absolute URL because Cloudinary
    // and the vision model have to fetch it, and it hands the same string back.
    // Writing that into the row would bake today's hostname into every record.
    $url = photo_store_relativise((string)($a['editedUrl'] ?? '') ?: (string)($a['sourceUrl'] ?? ''));
    if ($url === '') return;
    try {
        if ($a['subjectType'] === 'student')        db_update('summer_students', ['photoUrl' => $url, 'updatedAt' => now_iso()], ['studentId' => $a['subjectId']]);
        elseif ($a['subjectType'] === 'volunteer')  db_update('volunteers', ['photoUrl' => $url, 'updatedAt' => now_iso()], ['volunteerId' => $a['subjectId']]);
        // Members too: an edited member photo never reached the record, so the card kept the old one.
        elseif ($a['subjectType'] === 'member')     db_update('members', ['photoUrl' => $url, 'updatedAt' => now_iso()], ['memberId' => $a['subjectId']]);
    } catch (Throwable $e) { /* subject may not exist yet in tests */ }
}

/** Is a subject's current photo approved? (The issuance gate reads this.) */
function photo_approved_for(string $subjectType, string $subjectId): bool {
    return (bool)db_row("SELECT id FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status = 'approved' ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);
}
