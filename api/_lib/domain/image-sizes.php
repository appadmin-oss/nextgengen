<?php
declare(strict_types=1);

/**
 * Image sizes — one registry, one address function, sizes made once.
 *
 * The owner's decision (HANDOFF, "Photos at fixed sizes, made once"):
 *  - A photo is shown from NGG's own storage at a FIXED, NAMED size that the
 *    server made ONCE with PHP GD and kept. Not a Cloudinary transformation per
 *    view, which is where the credits went.
 *  - Cloudinary stays for edits (the card-face framing, the print box, a video
 *    poster, the upload-time cap) and for images that still live there today;
 *    those keep working through Cloudinary, but through the SAME named sizes.
 *  - One function gives an image's address at a size, here and in the browser
 *    (imgUrl in components.jsx). The two registries are pinned equal by
 *    tests/image-sizes.test.js.
 *
 * A named size is a LONG-EDGE cap in pixels. Never an upscale, never a crop: a
 * photo smaller than the size is served as it is, and the screen crops with
 * CSS object-fit, so one made file serves a square avatar and a tall card alike.
 *
 * Where the made files live:
 *  - A photo-store original (`<32hex>.<ext>`): beside it, as
 *    `<32hex>-<px>.<jpg|png>`. The store's scanners all match the ORIGINAL's
 *    exact name (`^[0-9a-f]{32}\.(jpg|png|webp)$`), so a size can never be
 *    counted, copied, backed up or swept as an original; deleting an original
 *    deletes its sizes (img_variants_forget), and the sweep collects any size
 *    whose original is gone (img_variants_sweep_dir).
 *  - A bucket image (object-store.php, ours by store_hosted): fetched ONCE by
 *    its key (a signed GET of OUR bucket — never an arbitrary URL, so this is
 *    not a fetch-anything endpoint) and the sizes kept on local disk in
 *    img_bucket_dir(), a deny-all folder beside the photo store. Local, not
 *    written back to the bucket: a write costs a signed PUT and a second
 *    egress per size, needs the bucket's write key on a public read path, and
 *    the copies are disposable — they can always be made again from the
 *    bucket's original, which is never touched.
 */

/** The named display sizes. `px` is the long edge; `cld` is the same size as a
 *  Cloudinary delivery transform, for an image that still lives there. The
 *  Cloudinary strings are the ones the screens already asked for (cmOpt's four
 *  widths), so no derived copy Cloudinary already holds is made again. */
const IMG_SIZES = [
    'avatar' => ['px' => 128,  'cld' => 'f_auto,q_auto,w_128,c_limit'],
    'thumb'  => ['px' => 320,  'cld' => 'f_auto,q_auto,w_320,c_limit'],
    'feed'   => ['px' => 640,  'cld' => 'f_auto,q_auto,w_640,c_limit'],
    'wide'   => ['px' => 1280, 'cld' => 'f_auto,q_auto,w_1280,c_limit'],
    'print'  => ['px' => 1200, 'cld' => 'f_jpg,q_auto:good,w_1200,c_limit'],
];

/**
 * The named EDITS — Cloudinary transforms that change what the picture is
 * (framing, padding, a still from a video, the cap applied at upload), not how
 * big it is delivered. In the same registry so there is one place to read them,
 * and kept apart from the sizes because they are not interchangeable with one.
 * `{x}` is a value the caller supplies (img_edit).
 */
const IMG_EDITS = [
    // The card face: a tidy, face-framed 600×750 crop with a free auto-improve
    // (photos.php cloudinary_edit / cloudinary_edit_manual; buildEditTransform).
    'card_face'       => 'c_fill,g_{g},w_600,h_750,f_auto,q_auto:good,e_improve:30',
    // The capture preview and its "before" (components.jsx PhotoCapture).
    'capture_enhance' => 'c_thumb,g_face,w_600,h_750,e_improve,q_auto',
    'capture_plain'   => 'c_thumb,g_face,w_600,h_750,q_auto',
    // A face-gravity crop makes Cloudinary report the landmarks (card-photo.jsx).
    'face_detect'     => 'c_thumb,g_face,w_200,h_200',
    // The printed card's photo box (card-photo.jsx cphCardUrl).
    'print_pad'       => 'c_pad,w_{w},h_{h},b_auto:predominant_gradient,f_jpg,q_auto:good',
    // A video, delivered as exactly the rendition made at upload (eager), so it is transcoded once.
    'video'           => 'f_auto,q_auto:eco,w_1280,c_limit',
    // A still from a video: the player's poster, and the frame AI screening reads.
    'video_poster'    => 'so_0,f_jpg,q_auto,w_900,c_limit',
    'screen_frame'    => 'so_1,f_jpg,q_auto,w_640,c_limit',
    // Applied by Cloudinary BEFORE storing (upload-sign.php, media-storage.php).
    'upload_incoming' => 'c_limit,w_1600,q_auto:good,f_auto',
    'media_incoming'  => 'c_limit,w_{m},h_{m},q_auto:good',
    // What the framing job fetches to find a face (photo-framing.php).
    'frame_fetch'     => 'c_limit,w_{m},h_{m},f_jpg,q_auto',
];

const IMG_JPEG_QUALITY  = 82;
const IMG_TICK_MAX      = 40;        // originals per web-cron tick
const IMG_TICK_SECONDS  = 15;        // and never longer than this per tick
const IMG_MAX_PIXELS    = 24000000;  // above this GD would need more memory than a shared host gives
const IMG_FETCH_MAX     = 15 * 1024 * 1024;
const IMG_STATE_KEY     = 'img_sizes_state';
const IMG_SKIP_LIST_MAX = 50;

/** An edit's transform with its values filled in. Unknown name → ''. */
function img_edit(string $name, array $vars = []): string {
    $t = IMG_EDITS[$name] ?? '';
    foreach ($vars as $k => $v) $t = str_replace('{' . $k . '}', (string)$v, $t);
    return $t;
}

function img_size_known(string $size): bool { return isset(IMG_SIZES[$size]); }

/**
 * Insert a delivery transform into a Cloudinary URL AFTER any edits already in
 * it (before the version marker), so a resize never re-runs an edit and then
 * blows it up. No version marker: right after /upload/. (cmOpt's rule.)
 */
function img_cld_insert(string $url, string $tf): string {
    if ($tf === '' || strpos($url, '/upload/') === false) return $url;
    if (preg_match('#/upload/(?:[^/]+/)*?v\d+/#', $url)) {
        return (string)preg_replace('#(/upload/(?:[^/]+/)*?)(v\d+/)#', '${1}' . $tf . '/${2}', $url, 1);
    }
    return (string)preg_replace('#/upload/#', '/upload/' . $tf . '/', $url, 1);
}

/** Does a bucket key name an image GD can size? Videos and documents are left alone. */
function img_key_is_image(string $key): bool {
    return (bool)preg_match('/\.(jpe?g|png|webp)$/i', $key);
}

/**
 * THE address of an image at a named size.
 *  - Cloudinary: the size's transform, after any edits in the URL (a video gets
 *    its one rendition whatever the size).
 *  - The photo store: `&s=<size>` on the store URL; photo.php serves the made file.
 *  - Our bucket (images only): photo.php?u=<url>&s=<size>.
 *  - Anything else, an unknown size, or an empty URL: unchanged.
 */
function img_url(string $url, string $size): string {
    if ($url === '' || !img_size_known($size)) return $url;
    if (preg_match('#^https?://res\.cloudinary\.com/#', $url) && strpos($url, '/upload/') !== false) {
        return img_cld_insert($url, strpos($url, '/video/upload/') !== false ? IMG_EDITS['video'] : IMG_SIZES[$size]['cld']);
    }
    if (preg_match('#^((?:https?://[^/]+)?/api/public/photo\.php\?p=[0-9a-f]{32}\.(?:jpg|png|webp))(?:&s=[a-z]+)?$#', $url, $m)) {
        return $m[1] . '&s=' . $size;
    }
    if (function_exists('store_key_of') && ($key = store_key_of($url)) !== '' && img_key_is_image($key)) {
        return '/api/public/photo.php?u=' . rawurlencode($url) . '&s=' . $size;
    }
    return $url;
}

/* ── Making a size with GD ─────────────────────────────────────────────────── */

function img_gd_ok(): bool {
    return function_exists('imagecreatefromstring') && function_exists('imagecopyresampled') && function_exists('imagejpeg');
}

/** The EXIF orientation (1–8) of JPEG bytes, read by hand so it works without
 *  the exif extension. Browsers honour it when showing the original, so a made
 *  size that ignored it would come out on its side. */
function img_jpeg_orientation(string $raw): int {
    if (strncmp($raw, "\xFF\xD8", 2) !== 0) return 1;
    $i = 2; $n = min(strlen($raw), 65536 * 2);
    while ($i + 4 < $n) {
        if ($raw[$i] !== "\xFF") return 1;
        $marker = ord($raw[$i + 1]);
        $len = (ord($raw[$i + 2]) << 8) | ord($raw[$i + 3]);
        if ($marker === 0xE1 && substr($raw, $i + 4, 6) === "Exif\0\0") {
            $t = $i + 10;
            $le = substr($raw, $t, 2) === 'II';
            $u16 = fn(int $o) => $le ? (ord($raw[$o]) | ord($raw[$o + 1]) << 8) : (ord($raw[$o]) << 8 | ord($raw[$o + 1]));
            $u32 = fn(int $o) => $le ? ($u16($o) | $u16($o + 2) << 16) : ($u16($o) << 16 | $u16($o + 2));
            if ($t + 8 > $n) return 1;
            $ifd = $t + $u32($t + 4);
            if ($ifd + 2 > $n) return 1;
            $count = $u16($ifd);
            for ($k = 0; $k < $count; $k++) {
                $e = $ifd + 2 + $k * 12;
                if ($e + 12 > $n) return 1;
                if ($u16($e) === 0x0112) { $o = $u16($e + 8); return $o >= 1 && $o <= 8 ? $o : 1; }
            }
            return 1;
        }
        if ($marker === 0xDA) return 1;   // image data: no EXIF before it
        $i += 2 + $len;
    }
    return 1;
}

/** Apply an EXIF orientation to a GD image. */
function img_gd_orient($im, int $o) {
    if ($o <= 1 || !function_exists('imagerotate') || !function_exists('imageflip')) return $im;
    // GD rotates counter-clockwise: 270 is a quarter turn clockwise.
    $flip = [2 => IMG_FLIP_HORIZONTAL, 4 => IMG_FLIP_VERTICAL, 5 => IMG_FLIP_VERTICAL, 7 => IMG_FLIP_HORIZONTAL][$o] ?? null;
    $deg  = [3 => 180, 5 => 270, 6 => 270, 7 => 270, 8 => 90][$o] ?? 0;
    if ($flip !== null) imageflip($im, $flip);
    if ($deg) { $r = imagerotate($im, $deg, 0); if ($r) { imagedestroy($im); $im = $r; } }
    return $im;
}

/**
 * Make one size of an image's bytes. Returns ['bytes' => …, 'ext' => 'jpg'|'png']
 * or ['skip' => reason]: 'small' (already within the size — never upscaled),
 * 'no_gd', 'undecodable', 'too_big'.
 */
function img_make_bytes(string $raw, int $px): array {
    if (!img_gd_ok()) return ['skip' => 'no_gd'];
    $info = @getimagesizefromstring($raw);
    if (!is_array($info) || empty($info[0]) || empty($info[1])) return ['skip' => 'undecodable'];
    $w = (int)$info[0]; $h = (int)$info[1]; $type = (int)$info[2];
    $orient = $type === IMAGETYPE_JPEG ? img_jpeg_orientation($raw) : 1;
    if ($orient >= 5) [$w, $h] = [$h, $w];   // a quarter turn swaps the edges
    if (max($w, $h) <= $px) return ['skip' => 'small'];
    if ((int)$info[0] * (int)$info[1] > IMG_MAX_PIXELS) return ['skip' => 'too_big'];
    $src = @imagecreatefromstring($raw);
    if (!$src) return ['skip' => 'undecodable'];
    $src = img_gd_orient($src, $orient);
    $sw = imagesx($src); $sh = imagesy($src);
    $scale = $px / max($sw, $sh);
    $dw = max(1, (int)round($sw * $scale)); $dh = max(1, (int)round($sh * $scale));
    // PNG keeps PNG only when it really has transparency; everything else is a JPEG.
    $alpha = $type === IMAGETYPE_PNG && img_gd_has_alpha($src);
    $dst = imagecreatetruecolor($dw, $dh);
    if ($alpha) { imagealphablending($dst, false); imagesavealpha($dst, true); }
    else { imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $dw, $dh, $sw, $sh);
    imagedestroy($src);
    ob_start();
    if (!$alpha && function_exists('imageinterlace')) imageinterlace($dst, true);   // progressive: a slow phone sees it sooner
    $ok = $alpha ? imagepng($dst, null, 6) : imagejpeg($dst, null, IMG_JPEG_QUALITY);
    $bytes = (string)ob_get_clean();
    imagedestroy($dst);
    if (!$ok || $bytes === '') return ['skip' => 'undecodable'];
    return ['bytes' => $bytes, 'ext' => $alpha ? 'png' : 'jpg', 'w' => $dw, 'h' => $dh];
}

/** Does a GD image use transparency anywhere? Sampled on a grid, which is
 *  enough to tell a cut-out from a PNG screenshot. */
function img_gd_has_alpha($im): bool {
    if (imageistruecolor($im) === false) { if (imagecolortransparent($im) >= 0) return true; }
    $w = imagesx($im); $h = imagesy($im);
    $step = max(1, (int)floor(min($w, $h) / 48));
    for ($y = 0; $y < $h; $y += $step) for ($x = 0; $x < $w; $x += $step) {
        if (((imagecolorat($im, $x, $y) >> 24) & 0x7F) > 0) return true;
    }
    return false;
}

/** Write bytes atomically (temp, then rename), so two views racing to make the
 *  same size both land identical bytes and nobody reads half a file. */
function img_write_atomic(string $path, string $bytes): bool {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.part';
    if (@file_put_contents($tmp, $bytes) === false) { @unlink($tmp); return false; }
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}

/* ── The photo store's sizes ───────────────────────────────────────────────── */

/** The made file for a store original at a size, if it exists ('' if not). */
function img_variant_existing(string $origPath, int $px): string {
    $stem = preg_replace('/\.(jpg|png|webp)$/', '', $origPath);
    foreach (['jpg', 'png'] as $e) { $p = $stem . '-' . $px . '.' . $e; if (is_file($p)) return $p; }
    return '';
}

/**
 * The file to serve for a store original at a named size: the made size,
 * made now if it is not yet (once — a second call finds it), or the original
 * itself when the size would not be smaller, GD is missing, or the image will
 * not decode. Never '' for an original that exists: an image is never broken
 * by sizing it.
 */
function img_store_variant(string $origPath, string $size): string {
    if (!img_size_known($size) || !is_file($origPath)) return $origPath;
    $px = (int)IMG_SIZES[$size]['px'];
    $have = img_variant_existing($origPath, $px);
    if ($have !== '') return $have;
    $r = img_store_make($origPath, $px);
    return $r['path'] ?? $origPath;
}

/** Make (if needed) one size beside a store original. ['path'] or ['skip']. */
function img_store_make(string $origPath, int $px): array {
    $have = img_variant_existing($origPath, $px);
    if ($have !== '') return ['path' => $have, 'made' => false];
    if (!is_writable(dirname($origPath))) return ['skip' => 'unwritable'];
    $raw = @file_get_contents($origPath);
    if ($raw === false || $raw === '') return ['skip' => 'unreadable'];
    try { $r = img_make_bytes($raw, $px); } catch (Throwable $e) { return ['skip' => 'undecodable']; }
    if (!isset($r['bytes'])) return $r;
    $path = preg_replace('/\.(jpg|png|webp)$/', '', $origPath) . '-' . $px . '.' . $r['ext'];
    if (!img_write_atomic($path, $r['bytes'])) return ['skip' => 'unwritable'];
    return ['path' => $path, 'made' => true, 'bytes' => strlen($r['bytes'])];
}

/** Delete every made size of a store original, in one directory. Called
 *  wherever an original is deleted, so a size never outlives its photo. */
function img_variants_forget(string $dir, string $id): int {
    if (!preg_match('/^([0-9a-f]{32})\.(?:jpg|png|webp)$/', $id, $m)) return 0;
    $n = 0;
    $pxs = array_unique(array_map(fn($s) => (int)$s['px'], IMG_SIZES));
    foreach ($pxs as $px) foreach (['jpg', 'png'] as $e) {
        $p = $dir . '/' . $m[1] . '-' . $px . '.' . $e;
        if (is_file($p) && @unlink($p)) $n++;
    }
    return $n;
}

/** The name of a made size: `<32hex>-<px>.<jpg|png>` → [hash, px] or null. */
function img_variant_parse(string $name): ?array {
    return preg_match('/^([0-9a-f]{32})-(\d{2,5})\.(jpg|png)$/', $name, $m) ? [$m[1], (int)$m[2]] : null;
}

/**
 * Collect made sizes that no longer have an original beside them, or whose
 * size is no longer in the registry. Run by the store sweep. A size is derived
 * and can always be made again, so this is the one deletion in the store that
 * needs no reference check.
 */
function img_variants_sweep_dir(string $dir): int {
    if (!is_dir($dir)) return 0;
    $files = (array)@scandir($dir);
    $orig = [];
    foreach ($files as $f) if (preg_match('/^([0-9a-f]{32})\.(jpg|png|webp)$/', (string)$f, $m)) $orig[$m[1]] = true;
    $pxs = array_flip(array_map(fn($s) => (int)$s['px'], IMG_SIZES));
    $n = 0;
    foreach ($files as $f) {
        $v = img_variant_parse((string)$f);
        if (!$v) continue;
        if (!isset($orig[$v[0]]) || !isset($pxs[$v[1]])) { if (@unlink($dir . '/' . $f)) $n++; }
    }
    return $n;
}

/* ── Bucket images: fetched once, sized on local disk ──────────────────────── */

/** Where a bucket image's sizes are kept: a deny-all folder beside the store. */
function img_bucket_dir(): string {
    $dir = dirname(photo_store_dir()) . '/photo-sizes';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $ht = $dir . '/.htaccess';
    if (is_dir($dir) && !is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n");
    }
    return $dir;
}

/** The stem a bucket key's sizes are filed under (40 hex — never a store name). */
function img_bucket_stem(string $key): string { return sha1('store:' . $key); }

/**
 * A bucket image at a named size: the local made file, made now from ONE fetch
 * of the object by its key. ['path' => …] when there is one; ['skip' => reason]
 * when the caller should send the visitor to the original instead ('small',
 * 'no_gd', 'undecodable', 'fetch_failed', 'not_ours'). The URL must be ours
 * (store_key_of) — anything else is refused before any request is made.
 */
function img_bucket_variant(string $url, string $size): array {
    $key = function_exists('store_key_of') ? store_key_of($url) : '';
    if ($key === '' || !img_key_is_image($key)) return ['skip' => 'not_ours'];
    if (!img_size_known($size)) return ['skip' => 'unknown_size'];
    $px = (int)IMG_SIZES[$size]['px'];
    $dir = img_bucket_dir();
    $stem = $dir . '/' . img_bucket_stem($key) . '-' . $px;
    foreach (['jpg', 'png'] as $e) if (is_file($stem . '.' . $e)) return ['path' => $stem . '.' . $e, 'key' => $key];
    // "Too small to size" is remembered too, so the object is not fetched on every view.
    if (is_file($stem . '.orig')) return ['skip' => 'small', 'key' => $key];
    if (!img_gd_ok()) return ['skip' => 'no_gd', 'key' => $key];
    // A fetch that failed is not tried again for an hour, so a bucket outage
    // costs each image one slow request, not one per view.
    if (is_file($stem . '.fail') && (time() - (int)@filemtime($stem . '.fail')) < 3600) return ['skip' => 'fetch_failed', 'key' => $key];
    $r = store_http('GET', $key);
    $raw = (string)($r['body'] ?? '');
    if ((int)($r['code'] ?? 0) !== 200 || $raw === '' || strlen($raw) > IMG_FETCH_MAX) {
        if (is_writable($dir)) @touch($stem . '.fail');
        return ['skip' => 'fetch_failed', 'key' => $key];
    }
    @unlink($stem . '.fail');
    try { $m = img_make_bytes($raw, $px); } catch (Throwable $e) { $m = ['skip' => 'undecodable']; }
    if (!isset($m['bytes'])) {
        if (($m['skip'] ?? '') === 'small' && is_writable($dir)) @touch($stem . '.orig');
        return $m + ['key' => $key];
    }
    if (!is_writable($dir) || !img_write_atomic($stem . '.' . $m['ext'], $m['bytes'])) return ['skip' => 'unwritable', 'key' => $key];
    return ['path' => $stem . '.' . $m['ext'], 'key' => $key, 'made' => true];
}

/** Forget a deleted bucket object's sizes (store_delete calls this). */
function img_bucket_forget(string $key): int {
    if ($key === '') return 0;
    $dir = dirname(photo_store_dir()) . '/photo-sizes';
    if (!is_dir($dir)) return 0;
    $n = 0; $stem = $dir . '/' . img_bucket_stem($key);
    foreach (array_unique(array_map(fn($s) => (int)$s['px'], IMG_SIZES)) as $px)
        foreach (['jpg', 'png', 'orig', 'fail'] as $e) if (is_file($stem . '-' . $px . '.' . $e) && @unlink($stem . '-' . $px . '.' . $e)) $n++;
    return $n;
}

/* ── The background job: every stored photo, every size, a few at a time ───── */

/** Every original in the store, once each (the first directory that has it), sorted by name. */
function img_store_originals(): array {
    $out = [];
    foreach (photo_store_dirs() as $dir) {
        if (!is_dir($dir)) continue;
        foreach ((array)@scandir($dir) as $f) {
            if (!preg_match('/^[0-9a-f]{32}\.(jpg|png|webp)$/', (string)$f) || isset($out[$f])) continue;
            $out[$f] = $dir . '/' . $f;
        }
    }
    ksort($out, SORT_STRING);
    return $out;
}

function img_state(): array {
    $s = json_decode((string)(function_exists('setting_raw') ? setting_raw(IMG_STATE_KEY) : ''), true);
    $s = is_array($s) ? $s : [];
    return $s + ['cursor' => '', 'skipped' => [], 'passes' => 0, 'at' => '', 'lastMade' => 0];
}
function img_state_save(array $s): void { setting_set(IMG_STATE_KEY, json_encode($s, JSON_UNESCAPED_SLASHES), 'system'); }

/**
 * One batch: up to $max originals after the cursor, each given every named
 * size it needs. Resumable (the cursor is the last name finished), safe to run
 * again (a made size is found, not remade), and it never fails on one photo: a
 * missing or undecodable original is recorded in the skipped list and passed.
 * It never deletes or rewrites an original.
 */
function img_sizes_tick(int $max = IMG_TICK_MAX, int $seconds = IMG_TICK_SECONDS): array {
    $st = img_state();
    $all = img_store_originals();
    $names = array_keys($all);
    $start = microtime(true);
    $made = 0; $done = 0; $last = (string)$st['cursor'];
    $skipped = is_array($st['skipped']) ? $st['skipped'] : [];
    foreach ($names as $name) {
        if ($last !== '' && strcmp($name, $last) <= 0) continue;
        if ($done >= $max || (microtime(true) - $start) > $seconds) break;
        $path = $all[$name];
        $why = '';
        if (!is_file($path)) $why = 'missing';
        else foreach (IMG_SIZES as $s) {
            $r = img_store_make($path, (int)$s['px']);
            if (!empty($r['made'])) $made++;
            if (isset($r['skip']) && $r['skip'] !== 'small') { $why = (string)$r['skip']; break; }
        }
        if ($why !== '') $skipped[$name] = $why; else unset($skipped[$name]);
        $last = $name; $done++;
    }
    // Reached the end: the next pass starts again from the top (cheap — every
    // size it finds is already made) and picks up photos added since.
    $finished = !$names || $done === 0 || $last === end($names);
    if (count($skipped) > IMG_SKIP_LIST_MAX * 4) $skipped = array_slice($skipped, -IMG_SKIP_LIST_MAX * 4, null, true);
    $st = ['cursor' => $finished ? '' : $last, 'skipped' => $skipped, 'passes' => (int)$st['passes'] + ($finished ? 1 : 0),
           'at' => now_iso(), 'lastMade' => $made];
    img_state_save($st);
    return ['ok' => true, 'looked' => $done, 'made' => $made, 'finished' => $finished, 'cursor' => $st['cursor'], 'skipped' => count($skipped)];
}

/**
 * Where the sizes stand: originals with every size they need (done), those
 * still waiting (remaining), those the job could not size (skipped, with up to
 * 50 names and why), the made files' count and bytes, and the bytes a view of
 * each made size saves against sending the original (bytesSaved — one view of
 * every size of every photo).
 */
function img_sizes_status(): array {
    $st = img_state();
    $done = 0; $remaining = 0; $files = 0; $bytes = 0; $saved = 0;
    $skipped = is_array($st['skipped']) ? $st['skipped'] : [];
    $all = img_store_originals();
    foreach ($all as $name => $path) {
        if (isset($skipped[$name])) continue;
        $info = @getimagesize($path);
        $long = is_array($info) ? max((int)$info[0], (int)$info[1]) : 0;
        $osz = (int)@filesize($path);
        $need = false;
        foreach (IMG_SIZES as $s) {
            if ($long > 0 && $long <= (int)$s['px']) continue;    // never upscaled: nothing to make
            $v = img_variant_existing($path, (int)$s['px']);
            if ($v === '') { $need = true; continue; }
            $vb = (int)@filesize($v);
            $files++; $bytes += $vb; $saved += max(0, $osz - $vb);
        }
        if ($need) $remaining++; else $done++;
    }
    $list = [];
    foreach (array_slice($skipped, 0, IMG_SKIP_LIST_MAX, true) as $n => $why) $list[] = ['name' => (string)$n, 'why' => (string)$why];
    return ['ok' => true, 'gd' => img_gd_ok(), 'originals' => count($all), 'done' => $done, 'remaining' => $remaining,
            'skipped' => count($skipped), 'skippedList' => $list, 'files' => $files, 'bytes' => $bytes, 'bytesSaved' => $saved,
            'sizes' => array_map(fn($s) => (int)$s['px'], IMG_SIZES), 'at' => (string)$st['at'], 'passes' => (int)$st['passes'],
            'perTick' => IMG_TICK_MAX];
}

/** Control Room → System → Photo storage: where the sizes stand. */
function admin_images_sizes(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    return img_sizes_status();
}

/** "Make sizes now": one batch, now, under the web-cron's lock. One audit event per press. */
function admin_images_make(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $res = null;
    $ran = web_cron_run_now(['img_sizes' => function () use (&$res) { $res = img_sizes_tick(IMG_TICK_MAX, 20); }]);
    if (($ran['img_sizes'] ?? '') === 'busy') return ['ok' => false, 'error' => 'busy'];
    if (!is_array($res)) return ['ok' => false, 'error' => 'failed'];
    audit('photo.sizes.made', (string)$g['requester']['memberId'], '', ['looked' => $res['looked'], 'made' => $res['made'],
        'skipped' => $res['skipped'], 'finished' => $res['finished']], (string)($p['ip'] ?? ''));
    return $res + ['status' => img_sizes_status()];
}
