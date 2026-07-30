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

function photo_store_dir(): string {
    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    $dir = ($base !== '' ? dirname($base) : (__DIR__ . '/../../storage')) . '/photos';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

/** The on-disk path for a store id. Validated, so a crafted id cannot escape. */
function photo_store_path(string $id): string {
    if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', $id)) return '';
    return photo_store_dir() . '/' . $id;
}

function photo_store_url(string $id): string {
    return $id === '' ? '' : '/api/public/photo.php?p=' . rawurlencode($id);
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
        if (@file_put_contents($tmp, $raw) === false) return ['ok' => false, 'error' => 'write_failed'];
        if (!@rename($tmp, $path)) { @unlink($tmp); return ['ok' => false, 'error' => 'write_failed']; }
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
 *  - Every column that can hold one of these URLs is consulted, and if ANY of
 *    those reads throws, the sweep does nothing at all. Deleting a child's only
 *    photograph because a query failed is not a tradeoff worth making.
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

    /* Everywhere a stored URL can legitimately live. A column missed here is a
     * photo deleted while something still shows it, so this list is the whole
     * safety of the sweep — hence the all-or-nothing failure below. */
    $sources = [
        ['summer_students', 'photoUrl'],
        ['volunteers', 'photoUrl'],
        ['applications', 'photoUrl'],
        ['photo_assets', 'sourceUrl'],
        ['photo_assets', 'editedUrl'],
        ['members', 'photoUrl'],
    ];
    $referenced = [];
    foreach ($sources as [$table, $col]) {
        try {
            foreach (db_all("SELECT $col v FROM $table WHERE $col LIKE '%/api/public/photo.php?p=%'") as $r) {
                if (preg_match('/p=([0-9a-f]{32}\.(?:jpg|png|webp))/', (string)$r['v'], $m)) $referenced[$m[1]] = true;
            }
        } catch (Throwable $e) {
            // A missing column or a broken connection means we do not know what
            // is referenced. Do nothing rather than guess.
            error_log('[photo_store_sweep] aborted, cannot read ' . $table . '.' . $col . ': ' . $e->getMessage());
            return 0;
        }
    }

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
    $subjectType = in_array($subjectType, ['student', 'volunteer'], true) ? $subjectType : 'student';
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
        photo_after_approve($a);
        @event_emit('photo.approved', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'auto' => true]);
    }
    return ['ok' => true, 'status' => $row['status'], 'score' => $score, 'flags' => $flags, 'aiUsed' => $edit['aiUsed'], 'editedUrl' => $edit['url']];
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
    return ['ok' => true, 'queue' => array_map('photo_public', $rows), 'pending' => count($rows)];
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
    photo_after_approve($a);
    audit('photo.approved', $g['requester']['memberId'], $assetId, [], (string)($p['ip'] ?? ''));
    @event_emit('photo.approved', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'auto' => false]);
    return ['ok' => true];
}

/** Once a photo is approved, retry the issuance gate for its student subject —
 *  the ID is bound if consent is already in (photo_gate_issuance flow). */
function photo_after_approve(array $a): void {
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
    return ['ok' => true];
}

/**
 * Admin re-edit of ANY image — including already-live ones. Accepts an assetId
 * (review queue) OR a subjectType+subjectId (a live card photo with no open
 * asset). Rebuilds the delivery transform from the clean source per the given
 * spec, updates the asset if one exists, and always re-applies to the subject
 * so the card/profile update immediately. Returns the new URL for preview.
 */
function admin_photo_edit(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $spec = is_array($p['spec'] ?? null) ? $p['spec'] : [];
    $assetId = (string)($p['assetId'] ?? '');
    $subjectType = (string)($p['subjectType'] ?? '');
    $subjectId = (string)($p['subjectId'] ?? '');

    $a = null;
    if ($assetId !== '') $a = db_row('SELECT * FROM photo_assets WHERE assetId = ? LIMIT 1', [$assetId]);
    elseif ($subjectType !== '' && $subjectId !== '') $a = db_row("SELECT * FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status NOT IN ('rejected') ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);

    if ($a) { $source = (string)$a['sourceUrl']; $subjectType = (string)$a['subjectType']; $subjectId = (string)$a['subjectId']; }
    else {
        // No asset — derive the clean source from the subject's current photo.
        $tbl = $subjectType === 'volunteer' ? 'volunteers' : 'summer_students';
        $col = $subjectType === 'volunteer' ? 'volunteerId' : 'studentId';
        $row = ($subjectId !== '') ? db_row("SELECT photoUrl FROM $tbl WHERE $col = ? LIMIT 1", [$subjectId]) : null;
        if (!$row || empty($row['photoUrl'])) return ['ok' => false, 'error' => 'no_photo'];
        $source = cloudinary_base((string)$row['photoUrl']);
    }
    if (strpos($source, '/upload/') === false) return ['ok' => false, 'error' => 'not_editable']; // non-Cloudinary photo

    $edit = cloudinary_edit_manual($source, $spec);
    if ($a) db_update('photo_assets', ['editedUrl' => $edit['url'], 'transforms' => $edit['transforms'], 'updatedAt' => now_iso()], ['assetId' => $a['assetId']]);
    photo_apply_to_subject(['subjectType' => $subjectType, 'subjectId' => $subjectId, 'editedUrl' => $edit['url']]);
    audit('photo.edited', $g['requester']['memberId'], ($subjectType . ':' . $subjectId), ['spec' => $spec, 'assetId' => $a['assetId'] ?? ''], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'url' => $edit['url'], 'transforms' => $edit['transforms']];
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
    } catch (Throwable $e) { /* subject may not exist yet in tests */ }
}

/** Is a subject's current photo approved? (The issuance gate reads this.) */
function photo_approved_for(string $subjectType, string $subjectId): bool {
    return (bool)db_row("SELECT id FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status = 'approved' ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);
}
