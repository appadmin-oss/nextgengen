<?php
declare(strict_types=1);

/**
 * The photo quality gate — NGG does not take low-quality photos.
 *
 * A member's photo is printed on an ID card and shown on every roster, so a
 * blurred, tiny, dark or washed-out photo is refused where it comes in, not
 * found at the cutter. The browser runs the same rules first (apfPhotoQa in
 * components.jsx) so the family is told at once and can retake; the server
 * never trusts that verdict and measures the pixels again, wherever the photo
 * lives:
 *
 *   data: URL        the bytes in the request
 *   our local store  /api/public/photo.php?p=… read from disk
 *   our bucket       an S3-compatible object (R2 / B2), read with store_http
 *   Cloudinary       the configured cloud, fetched (bounded)
 *
 * THE RULES (PHOTO_QA; the browser's PHOTO_QA_RULES must match, and
 * tests/photo-quality.test.js fails when they differ):
 *
 *   size       at least 600 × 800 (short × long side). Nothing is enlarged to
 *              reach it: a thumbnail, a WhatsApp preview or a screenshot of a
 *              photo is too small, and blowing it up only hides that.
 *   exposure   judged on the FACE ZONE (x 18–82 %, y 8–62 %), not the frame,
 *              so a passport photo on a white wall is not "too bright":
 *              mean 50–215, the face itself not blown out or crushed
 *              (≤ 30 % of the inner face pixels at the ends), std-dev ≥ 22.
 *   sharpness  the no-reference blur score of Crete et al. (2007, "The blur
 *              effect"): re-blur the face zone with a 9-px box and measure how
 *              much edge detail that removes. A sharp photo loses a lot (score
 *              near 0); one already soft — shaken, out of focus, or enlarged
 *              from a thumbnail — loses little (near 1). It does not depend on
 *              contrast or on how busy the background is. Refused above 0.58.
 *
 *   Calibration (docs/PHOTO_QUALITY.md), real portraits cropped 3:4 and saved
 *   as the form saves them (600 × 800, JPEG q86): sharp originals 0.18–0.50,
 *   the same through WhatsApp compression 0.20–0.49, a 2 px blur 0.64–0.76,
 *   a 3 px blur 0.72–0.82.
 *
 * Analysis always runs on a 600-wide copy (as the form uploads), so a large
 * original from a staff upload is judged on the same scale as the form's.
 */

const PHOTO_QA = [
    'minShort'   => 600,
    'minLong'    => 800,
    'maxBytes'   => 12 * 1024 * 1024,
    'workWidth'  => 600,
    'zone'       => [0.18, 0.08, 0.82, 0.62],   // x0, y0, x1, y1 as fractions
    'inner'      => [0.35, 0.20, 0.65, 0.50],   // the face itself, for blown / crushed
    'minMean'    => 50,
    'maxMean'    => 215,
    'maxClipped' => 0.30,
    'minStd'     => 22,
    'maxBlur'    => 0.58,
    'blurKernel' => 9,
    // Two JPEG decoders round differently. The server allows this much over
    // maxBlur so a photo the browser passed is not bounced on that noise.
    'serverSlack' => 0.02,
];
const PHOTO_QA_FETCH_MAX = 12 * 1024 * 1024;

/** What the family is told, one line per problem. The browser has the same words. */
const PHOTO_QA_WORDS = [
    'too_small'    => 'This photo is too small to print sharply. Use the camera, not a WhatsApp forward or a screenshot.',
    'too_dark'     => 'The face is too dark. Stand facing a window or a light and retake.',
    'too_bright'   => 'The face is washed out. Move out of direct sunlight or away from the flash and retake.',
    'clipped'      => 'Part of the face is pure white or black. Even out the light and retake.',
    'low_contrast' => 'The photo looks flat or foggy. Wipe the lens and retake in better light.',
    'blurry'       => 'The photo is blurry. Hold the phone steady, tap the face to focus, and retake.',
    'unreadable'   => 'We could not open this photo. Take it again as a JPG or PNG.',
    'unavailable'  => 'We could not check the photo just now. Try again in a minute.',
];

/**
 * Judge raw image bytes. Pure: no output, no globals except PHOTO_QA.
 * Returns ['ok', 'issues' => [], 'metrics' => [...]].
 */
function photo_qa_bytes(string $bytes, bool $serverSide = true): array {
    if ($bytes === '' || strlen($bytes) > PHOTO_QA['maxBytes']) return ['ok' => false, 'issues' => ['unreadable'], 'metrics' => ['bytes' => strlen($bytes)]];
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array((string)($info['mime'] ?? ''), ['image/jpeg', 'image/png', 'image/webp'], true))
        return ['ok' => false, 'issues' => ['unreadable'], 'metrics' => ['bytes' => strlen($bytes)]];
    /* A host without GD cannot read pixels. It still enforces the size (getimagesize
       needs no GD) and leaves exposure and sharpness to the browser's identical check,
       rather than refusing every family on that host. Said once in the error log. */
    if (!function_exists('imagecreatefromstring')) {
        static $said = false; if (!$said) { $said = true; error_log('[photo-quality] GD is not installed: only the size rule is enforced on the server.'); }
        $small = min($info[0], $info[1]) < PHOTO_QA['minShort'] || max($info[0], $info[1]) < PHOTO_QA['minLong'];
        return ['ok' => !$small, 'issues' => $small ? ['too_small'] : [], 'metrics' => ['width' => $info[0], 'height' => $info[1], 'gd' => false]];
    }
    $img = @imagecreatefromstring($bytes);
    if (!$img) return ['ok' => false, 'issues' => ['unreadable'], 'metrics' => []];
    $r = photo_qa_image($img, $serverSide);
    imagedestroy($img);
    return $r;
}

/** Judge a GD image. */
function photo_qa_image($img, bool $serverSide = true): array {
    $w = imagesx($img); $h = imagesy($img);
    $issues = [];
    if (min($w, $h) < PHOTO_QA['minShort'] || max($w, $h) < PHOTO_QA['minLong']) $issues[] = 'too_small';
    // The analysis copy: 600 wide, as the form uploads. Never enlarged.
    $ww = min($w, PHOTO_QA['workWidth']); $wh = max(1, (int)round($h * $ww / $w));
    $work = imagecreatetruecolor($ww, $wh);
    imagecopyresampled($work, $img, 0, 0, 0, 0, $ww, $wh, $w, $h);
    $m = photo_qa_measure($work);
    imagedestroy($work);
    $m['width'] = $w; $m['height'] = $h;
    $issues = array_merge($issues, photo_qa_judge($m, $serverSide));
    return ['ok' => !$issues, 'issues' => array_values(array_unique($issues)), 'metrics' => $m];
}

/** Thresholds → issues. Mirrors apfPhotoQaJudge() in the browser. */
function photo_qa_judge(array $m, bool $serverSide): array {
    $out = [];
    if ($m['mean'] < PHOTO_QA['minMean']) $out[] = 'too_dark';
    if ($m['mean'] > PHOTO_QA['maxMean']) $out[] = 'too_bright';
    if ($m['clipped'] > PHOTO_QA['maxClipped']) $out[] = 'clipped';
    if ($m['std'] < PHOTO_QA['minStd']) $out[] = 'low_contrast';
    if ($m['blur'] > PHOTO_QA['maxBlur'] + ($serverSide ? PHOTO_QA['serverSlack'] : 0)) $out[] = 'blurry';
    return $out;
}

/** Luma of the face zone, its exposure, and the blur score. Mirrors apfPhotoQaMeasure(). */
function photo_qa_measure($img): array {
    $w = imagesx($img); $h = imagesy($img);
    [$a, $b, $c, $d] = PHOTO_QA['zone'];
    $x0 = (int)floor($w * $a); $y0 = (int)floor($h * $b); $x1 = (int)floor($w * $c); $y1 = (int)floor($h * $d);
    [$ia, $ib, $ic, $id] = PHOTO_QA['inner'];
    $ix0 = (int)floor($w * $ia); $iy0 = (int)floor($h * $ib); $ix1 = (int)floor($w * $ic); $iy1 = (int)floor($h * $id);
    $zw = $x1 - $x0; $zh = $y1 - $y0;
    $L = []; $sum = 0.0; $sq = 0.0; $clip = 0; $inner = 0;
    for ($y = $y0; $y < $y1; $y++) {
        for ($x = $x0; $x < $x1; $x++) {
            $c = imagecolorat($img, $x, $y);
            $v = 0.299 * (($c >> 16) & 0xFF) + 0.587 * (($c >> 8) & 0xFF) + 0.114 * ($c & 0xFF);
            $L[] = $v; $sum += $v; $sq += $v * $v;
            if ($x >= $ix0 && $x < $ix1 && $y >= $iy0 && $y < $iy1) { $inner++; if ($v <= 8 || $v >= 247) $clip++; }
        }
    }
    $n = max(1, $zw * $zh);
    $mean = $sum / $n;
    return [
        'mean'    => round($mean, 1),
        'std'     => round(sqrt(max(0.0, $sq / $n - $mean * $mean)), 1),
        'clipped' => round($inner ? $clip / $inner : 0, 3),
        'blur'    => round(photo_qa_blur($L, $zw, $zh), 3),
    ];
}

/** Crete et al. blur score of a row-major luma array, 0 (sharp) … 1 (blurred): the worse axis. */
function photo_qa_blur(array $L, int $w, int $h): float {
    if ($w < 12 || $h < 12) return 1.0;
    $k = PHOTO_QA['blurKernel']; $r = intdiv($k, 2);
    $scores = [];
    foreach ([true, false] as $horiz) {
        $B = [];
        if ($horiz) {
            for ($y = 0; $y < $h; $y++) {
                $row = $y * $w; $acc = 0.0;
                for ($i = -$r; $i <= $r; $i++) $acc += $L[$row + min($w - 1, max(0, $i))];
                for ($x = 0; $x < $w; $x++) {
                    $B[$row + $x] = $acc / $k;
                    $acc += $L[$row + min($w - 1, $x + $r + 1)] - $L[$row + max(0, $x - $r)];
                }
            }
        } else {
            for ($x = 0; $x < $w; $x++) {
                $acc = 0.0;
                for ($i = -$r; $i <= $r; $i++) $acc += $L[min($h - 1, max(0, $i)) * $w + $x];
                for ($y = 0; $y < $h; $y++) {
                    $B[$y * $w + $x] = $acc / $k;
                    $acc += $L[min($h - 1, $y + $r + 1) * $w + $x] - $L[max(0, $y - $r) * $w + $x];
                }
            }
        }
        $step = $horiz ? 1 : $w; $sF = 0.0; $sV = 0.0;
        for ($y = $horiz ? 0 : 1; $y < $h; $y++) {
            for ($x = $horiz ? 1 : 0; $x < $w; $x++) {
                $i = $y * $w + $x;
                $dF = abs($L[$i] - $L[$i - $step]); $dB = abs($B[$i] - $B[$i - $step]);
                $sF += $dF; if ($dF > $dB) $sV += $dF - $dB;
            }
        }
        $scores[] = $sF > 0 ? ($sF - $sV) / $sF : 1.0;
    }
    return max($scores);
}

/**
 * The bytes behind a photo URL we hold, or null when it is not ours or cannot
 * be read. Only our own places are read: a data: URL, the local store, our
 * bucket, and the configured Cloudinary cloud. Never an arbitrary host.
 */
function photo_qa_fetch(string $url): ?string {
    $url = trim($url);
    if ($url === '') return null;
    if (isset($GLOBALS['__photo_qa_fetch_mock']) && is_callable($GLOBALS['__photo_qa_fetch_mock'])) {
        $r = ($GLOBALS['__photo_qa_fetch_mock'])($url);
        if ($r !== false) return $r;
    }
    if (preg_match('#^data:image/(?:jpeg|png|webp);base64,(.+)$#s', $url, $m)) {
        $b = base64_decode($m[1], true);
        return $b === false ? null : $b;
    }
    if (function_exists('photo_is_stored_locally') && photo_is_stored_locally($url)) {
        parse_str((string)parse_url($url, PHP_URL_QUERY), $q);
        $path = function_exists('photo_store_find') ? photo_store_find((string)($q['p'] ?? '')) : '';
        return $path !== '' && is_file($path) && filesize($path) <= PHOTO_QA_FETCH_MAX ? (string)file_get_contents($path) : null;
    }
    if (function_exists('store_hosted') && store_hosted($url)) {
        $r = store_http('GET', store_key_of($url));
        return (int)($r['code'] ?? 0) === 200 && $r['body'] !== '' && strlen($r['body']) <= PHOTO_QA_FETCH_MAX ? $r['body'] : null;
    }
    if (preg_match('#^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/#', $url) && function_exists('curl_init')) {
        $ch = curl_init($url);
        $got = '';
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$got) { $got .= $chunk; return strlen($got) > PHOTO_QA_FETCH_MAX ? 0 : strlen($chunk); }]);
        curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        return $code === 200 && $got !== '' && strlen($got) <= PHOTO_QA_FETCH_MAX ? $got : null;
    }
    return null;
}

/**
 * The gate for a photo arriving on a record. Returns null when it passes (or
 * there is no photo), else a refusal the routes return as is:
 *   {ok:false, error:'photo_low_quality', issues:[…], message:'…'}
 * A photo we cannot read is refused too ('unavailable') — never waved through.
 */
function photo_qa_gate(string $url): ?array {
    if (trim($url) === '' || !photo_qa_enforced()) return null;
    $bytes = photo_qa_fetch($url);
    $r = $bytes === null ? ['ok' => false, 'issues' => ['unavailable'], 'metrics' => []] : photo_qa_bytes($bytes, true);
    if ($r['ok']) return null;
    $issues = $r['issues'];
    return ['ok' => false, 'error' => 'photo_low_quality', 'field' => 'photo', 'issues' => $issues, 'metrics' => $r['metrics'],
            'message' => implode(' ', array_map(static fn($i) => PHOTO_QA_WORDS[$i] ?? '', array_slice($issues, 0, 2)))];
}

/** On unless a super-admin turns it off (setting `photo_quality_gate` = off), e.g. during a storage outage. */
function photo_qa_enforced(): bool {
    $v = function_exists('setting_raw') ? strtolower(trim((string)setting_raw('photo_quality_gate'))) : '';
    return !in_array($v, ['off', '0', 'false'], true);
}
