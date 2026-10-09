<?php
declare(strict_types=1);

/* ============================================================================
   Smart headshot framing — Gemini finds the person, the card frames them.

   A card's photo box has a fixed shape (54 × 85 mm member card, the Summer
   School lanyard, a volunteer card) and the photographs people send do not:
   passport photos, half-length phone shots, a child in a group. Cloudinary's
   face detector gives eyes and a mouth, which is enough to know WHERE a face
   is but not how much head and hair surround it, and nothing at all for a
   photo held in the local store. This asks a vision model for the geometry an
   ID headshot is built from, once per photograph:

     - the HEAD box: crown of the hair to the chin, ear to ear (hair included)
     - the FACE box: brow to chin
     - the two eyes, and the line of the shoulders
     - whether there is one clear subject, and how many people are in it

   in Gemini's own detection convention — [ymin, xmin, ymax, xmax] normalised
   to 0–1000 — which is what its spatial understanding is trained to produce,
   with thinking off and temperature 0, because that is how detection is most
   accurate. The answer is checked for plausibility (the face inside the head,
   the eyes inside the face, a head shaped like a head); one that fails is asked
   again with the SECOND key, told what was wrong. Two keys, two jobs: the first
   frames, the second checks photos and backs the first up.

   The geometry is stored (photo_framing) against the photograph, not against a
   card, so every card shape is framed from the same measurement in the browser
   (cphFrameAi in card-photo.jsx): the head takes a fixed share of the box, a
   fixed margin above the crown, centred on the eyes — never stretched, and
   never cut through the head. A person can then adjust it (zoom, move, or show
   the whole photo); that adjustment is stored beside it and wins.

   No key, or no answer: nothing changes — the card falls back to Cloudinary's
   landmarks, then to the whole photo. A photograph the model was never asked
   about is framed exactly as before.
   ========================================================================== */

const PFRAME_MODEL_DEFAULT = '';   // blank: the best model the key can use (gemini_pick_model)
const PFRAME_ENSURE_MAX = 40;     // photographs one "frame these" request may analyse
const PFRAME_BACKLOG_STEP = 10;   // photographs one backlog press analyses
const PFRAME_READ_MAX = 80;       // photographs one public read may ask about
const PFRAME_IMG_MAX = 1024;      // the longest side sent to the model

/* ── The keys, entered on screen ──────────────────────────────────────────

   Kept in the settings table, sealed with a key derived from the app secret
   (AES-256-GCM), so a database copy alone does not hand them out. Never sent
   back to a browser: the screen sees "set, ending …1a2b", and replacing one is
   the only edit. */

function ai_ui_cipher_key(): string {
    return hash('sha256', 'ai-ui-keys|' . (string)($GLOBALS['CONFIG']['cookie_secret'] ?? ''), true);
}
function ai_ui_seal(string $plain): string {
    if ($plain === '' || !function_exists('openssl_encrypt')) return '';
    $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', ai_ui_cipher_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return $ct === false ? '' : 'v1:' . base64_encode($iv . $tag . $ct);
}
function ai_ui_open(string $sealed): string {
    if (strncmp($sealed, 'v1:', 3) !== 0 || !function_exists('openssl_decrypt')) return '';
    $raw = base64_decode(substr($sealed, 3), true);
    if ($raw === false || strlen($raw) < 29) return '';
    $pt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', ai_ui_cipher_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $pt === false ? '' : $pt;
}
/** The two keys and the model, opened. */
function ai_ui_keys(): array {
    $s = setting_get('ai_ui_keys');
    $s = is_array($s) ? $s : [];
    $model = (string)($s['model'] ?? '');
    return [
        'framing' => ai_ui_open((string)($s['framing'] ?? '')),
        'second'  => ai_ui_open((string)($s['second'] ?? '')),
        'model'   => preg_match('/^gemini-[a-z0-9.\-]{1,60}$/', $model) ? $model : PFRAME_MODEL_DEFAULT,   // '' = automatic
        'meta'    => is_array($s['meta'] ?? null) ? $s['meta'] : [],
    ];
}
/**
 * Candidates the screen's keys add to a profile, ahead of api/config.php's:
 * framing → the framing key, then the second; photo → the second, then the
 * framing key. Read by ai_profile_candidates().
 */
function ai_ui_candidates(string $profile): array {
    if (!in_array($profile, ['framing', 'photo'], true)) return [];
    $k = ai_ui_keys();
    $order = $profile === 'framing' ? [$k['framing'], $k['second']] : [$k['second'], $k['framing']];
    $out = [];
    foreach ($order as $key) if ($key !== '') $out[] = ['provider' => 'gemini', 'api_key' => $key, 'model' => $k['model']];
    return $out;
}

function ai_ui_key_view(string $key, array $meta, string $slot): array {
    return ['set' => $key !== '', 'ending' => $key !== '' ? substr($key, -4) : '',
            'updatedAt' => (string)($meta[$slot]['at'] ?? ''), 'updatedBy' => (string)($meta[$slot]['byName'] ?? '')];
}

/** admin.ai.keys.get — what is set (never the keys themselves). */
function admin_ai_keys_get(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $k = ai_ui_keys();
    return ['ok' => true, 'framing' => ai_ui_key_view($k['framing'], $k['meta'], 'framing'), 'second' => ai_ui_key_view($k['second'], $k['meta'], 'second'),
            'model' => $k['model'], 'defaultModel' => PFRAME_MODEL_DEFAULT, 'sealed' => function_exists('openssl_encrypt'),
            'framed' => (int)(db_row("SELECT COUNT(*) c FROM photo_framing WHERE status = 'ok'")['c'] ?? 0),
            'backlog' => count(photo_frame_backlog_urls(5000))];
}

/** admin.ai.keys.set — replace or clear a key, or change the model. A blank field leaves its key as it is. */
function admin_ai_keys_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    if (!function_exists('openssl_encrypt')) return ['ok' => false, 'error' => 'no_openssl', 'detail' => 'This server cannot encrypt the keys (PHP openssl is missing), so they are not stored.'];
    $by = (string)$g['requester']['memberId'];
    $cur = setting_get('ai_ui_keys'); $cur = is_array($cur) ? $cur : [];
    $meta = is_array($cur['meta'] ?? null) ? $cur['meta'] : [];
    $changed = [];
    foreach (['framing', 'second'] as $slot) {
        if (!empty($p['clear' . ucfirst($slot)])) { $cur[$slot] = ''; $meta[$slot] = ['at' => now_iso(), 'byName' => membership_staff_name($by)]; $changed[] = $slot . ':cleared'; continue; }
        $v = trim((string)($p[$slot . 'Key'] ?? ''));
        if ($v === '') continue;
        /* Both of Google AI Studio's formats: the older "AIza…" keys and the
           newer "AQ.…" ones, which carry a dot. Letters, digits and . _ - only. */
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._\-]{19,199}$/', $v)) return ['ok' => false, 'error' => 'bad_key', 'field' => $slot, 'detail' => 'That doesn’t look like a Gemini API key from Google AI Studio (they start “AQ.” or “AIza”). Paste it without spaces.'];
        $cur[$slot] = ai_ui_seal($v);
        $meta[$slot] = ['at' => now_iso(), 'byName' => membership_staff_name($by)];
        $changed[] = $slot;
    }
    if (array_key_exists('model', $p)) {
        $m = trim((string)$p['model']);
        if ($m !== '' && !preg_match('/^gemini-[a-z0-9.\-]{1,60}$/', $m)) return ['ok' => false, 'error' => 'bad_model', 'detail' => 'A Gemini model name, such as gemini-3.8-flash — or leave it blank to use the best one each key can.'];
        if ($m !== (string)($cur['model'] ?? '')) { $cur['model'] = $m; $changed[] = 'model'; }
    }
    $cur['meta'] = $meta;
    setting_set('ai_ui_keys', $cur, $by);
    // The slots changed, never the values.
    audit('ai.keys.set', $by, '', ['changed' => $changed], (string)($p['ip'] ?? ''));
    return admin_ai_keys_get($p) + ['changed' => $changed];
}

/** admin.ai.keys.test — one tiny real request per key, so a rejected key is seen now. */
function admin_ai_keys_test(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $k = ai_ui_keys();
    $out = [];
    foreach (['framing', 'second'] as $slot) {
        if ($k[$slot] === '') { $out[$slot] = ['ok' => false, 'error' => 'not_set']; continue; }
        $t = microtime(true);
        // First: does Google accept the key at all, and which models may it use?
        $err = null;
        $models = gemini_models($k[$slot], true, $err);
        if (!$models) {
            $out[$slot] = ['ok' => false, 'error' => (string)($err['error'] ?? 'no_models'), 'detail' => (string)($err['detail'] ?? 'Google listed no models this key can use.'), 'ms' => (int)round((microtime(true) - $t) * 1000)];
            continue;
        }
        // Then one small request on the model framing would use.
        $r = gemini_generate(['provider' => 'gemini', 'api_key' => $k[$slot], 'model' => $k['model']], 'Reply with the single word OK.',
            [['role' => 'user', 'parts' => [['text' => 'Test']]]], ['maxTokens' => 16, 'thinking' => 'off']);
        $out[$slot] = ['ok' => !empty($r['ok']), 'error' => empty($r['ok']) ? (string)($r['error'] ?? 'failed') : '', 'detail' => (string)($r['detail'] ?? ''),
                       'model' => (string)($r['model'] ?? ''), 'models' => count($models), 'ms' => (int)round((microtime(true) - $t) * 1000)];
    }
    audit('ai.keys.test', (string)$g['requester']['memberId'], '', ['framing' => $out['framing']['ok'], 'second' => $out['second']['ok']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'results' => $out, 'model' => $k['model']];
}

/* ── Which photograph, and its bytes ──────────────────────────────────────── */

/**
 * The photograph behind a photo URL, as it is measured: a Cloudinary image
 * with the stored edits a person chose (colour, background, an editor zoom)
 * and none of the automatic framing — the same image card-photo.jsx frames —
 * or a file in the local store. Anything else is not a photo we hold.
 * Returns ['key', 'kind', 'fetch' (a URL, Cloudinary), 'path' (local)] or null.
 */
function photo_frame_basis(string $url): ?array {
    $u = trim($url);
    if (preg_match('#^https://res\.cloudinary\.com/([A-Za-z0-9_\-]+)/image/upload/(.+)$#', $u, $m)) {
        $segs = explode('/', $m[2]);
        $chain = [];
        while (count($segs) > 1 && !preg_match('/^v\d+$/', $segs[0]) && preg_match('/^[a-z]{1,3}_/', $segs[0])) $chain[] = array_shift($segs);
        $rest = implode('/', $segs);
        if ($rest === '' || preg_match('#(^|/)\.\.(/|$)#', $rest)) return null;
        // What a person chose stays (mirrors cphKeepChain); what a machine chose goes.
        $keep = [];
        foreach ($chain as $seg) {
            $ps = explode(',', $seg);
            if (in_array('c_crop', $ps, true) && preg_grep('/^w_0?\.\d+$/', $ps)) { $keep[] = $seg; continue; }
            $kept = array_values(array_filter($ps, static fn($x) => $x !== '' && !preg_match('/^(c|g|w|h|ar|dpr|z|x|y|fl)_/', $x)));
            if ($kept) $keep[] = implode(',', $kept);
        }
        $base = 'https://res.cloudinary.com/' . $m[1] . '/image/upload/' . ($keep ? implode('/', $keep) . '/' : '');
        return ['key' => sha1($base . $rest), 'kind' => 'cloudinary',
                'fetch' => $base . 'c_limit,w_' . PFRAME_IMG_MAX . ',h_' . PFRAME_IMG_MAX . ',f_jpg,q_auto/' . $rest];
    }
    if (preg_match('#/api/public/photo\.php\?p=([0-9a-f]{32}\.(?:jpg|png|webp))$#', $u, $m)) {
        $path = function_exists('photo_store_find') ? photo_store_find($m[1]) : '';
        return ['key' => sha1('local:' . $m[1]), 'kind' => 'local', 'path' => $path];
    }
    return null;
}

/** The image as the model will see it: base64, its MIME type, and (local only) downscaled when it can be. */
function photo_frame_bytes(array $basis): array {
    if (isset($GLOBALS['__pframe_bytes']) && is_callable($GLOBALS['__pframe_bytes'])) return ($GLOBALS['__pframe_bytes'])($basis);
    if ($basis['kind'] === 'cloudinary') return ai_fetch_image((string)$basis['fetch']);
    $path = (string)($basis['path'] ?? '');
    if ($path === '' || !is_file($path)) return ['ok' => false, 'error' => 'photo_missing'];
    $bytes = (string)@file_get_contents($path);
    if ($bytes === '') return ['ok' => false, 'error' => 'photo_missing'];
    $mime = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? 'image/jpeg';
    // Smaller is faster and cheaper, and the coordinates are fractions, so the scale does not matter.
    if (function_exists('imagecreatefromstring') && strlen($bytes) > 400000) {
        $im = @imagecreatefromstring($bytes);
        if ($im) {
            $w = imagesx($im); $h = imagesy($im); $s = min(1, PFRAME_IMG_MAX / max($w, $h));
            if ($s < 1) {
                $dst = imagecreatetruecolor((int)round($w * $s), (int)round($h * $s));
                imagecopyresampled($dst, $im, 0, 0, 0, 0, imagesx($dst), imagesy($dst), $w, $h);
                ob_start(); imagejpeg($dst, null, 88); $bytes = (string)ob_get_clean(); $mime = 'image/jpeg';
                imagedestroy($dst);
            }
            imagedestroy($im);
        }
    }
    return ['ok' => true, 'mime' => $mime, 'b64' => base64_encode($bytes)];
}

/* ── Asking the model ──────────────────────────────────────────────────── */

const PFRAME_PROMPT = <<<'TXT'
You measure photographs for printed ID cards (a headshot: head and shoulders of one person).
Find the SUBJECT: the one person the photo is of — the largest, most central face turned towards the camera. Ignore people in the background, posters, screens and reflections.
Give every box as [ymin, xmin, ymax, xmax] and every point as [y, x], all normalised to 0-1000 over the whole image (0,0 is the top-left corner).
- head: the whole head INCLUDING all hair, a head-tie, cap or wrap: from the very top of the hair or headwear to the bottom of the chin, and from the outer edge of the hair or ear on one side to the other. Do not cut off hair.
- face: from the eyebrows to the bottom of the chin, cheek to cheek.
- leftEye and rightEye: the centre of each pupil, as they appear in the image (leftEye is the one nearer the left edge).
- shoulders: the y of the top of the shoulders, and the x of the outer edge of each shoulder; null if the shoulders are out of the picture.
- people: how many people's faces are visible at all.
- kind: "headshot" (head and shoulders fill the photo), "half" (to the waist), "full" (most of the body), "group" or "none".
- subjectFound: false when there is no clear single face to put on an ID card.
Be precise to the pixel. If the head touches or leaves the edge of the photo, give the box up to the edge.
TXT;

function photo_frame_schema(): array {
    $box = ['type' => 'ARRAY', 'items' => ['type' => 'INTEGER'], 'minItems' => 4, 'maxItems' => 4];
    $pt = ['type' => 'ARRAY', 'items' => ['type' => 'INTEGER'], 'minItems' => 2, 'maxItems' => 2];
    return ['type' => 'OBJECT', 'properties' => [
        'subjectFound' => ['type' => 'BOOLEAN'], 'people' => ['type' => 'INTEGER'],
        'kind' => ['type' => 'STRING', 'enum' => ['headshot', 'half', 'full', 'group', 'none']],
        'head' => $box, 'face' => $box, 'leftEye' => $pt, 'rightEye' => $pt,
        'shoulders' => ['type' => 'OBJECT', 'nullable' => true, 'properties' => ['y' => ['type' => 'INTEGER'], 'left' => ['type' => 'INTEGER'], 'right' => ['type' => 'INTEGER']]],
    ], 'required' => ['subjectFound', 'people', 'kind', 'head', 'face', 'leftEye', 'rightEye'],
       'propertyOrdering' => ['subjectFound', 'people', 'kind', 'head', 'face', 'leftEye', 'rightEye', 'shoulders']];
}

/** One request to one key. Returns ['ok', 'data'] or ['ok' => false, 'error']. */
function photo_frame_ask(array $cand, array $img, string $extra = ''): array {
    if (isset($GLOBALS['__pframe_mock']) && is_callable($GLOBALS['__pframe_mock'])) return ($GLOBALS['__pframe_mock'])($cand, $extra);
    // Detection is most accurate with thinking at its lowest; the schema keeps the answer to the shape we check.
    $r = gemini_generate($cand, PFRAME_PROMPT, [['role' => 'user', 'parts' => [
            ['inline_data' => ['mime_type' => $img['mime'], 'data' => $img['b64']]],
            ['text' => 'Measure the subject of this photograph.' . ($extra !== '' ? ' ' . $extra : '')],
        ]]], ['maxTokens' => 600, 'temperature' => 0, 'thinking' => 'off', 'json' => photo_frame_schema()]);
    if (empty($r['ok'])) return $r;
    $text = (string)$r['text'];
    if (preg_match('/\{.*\}/s', $text, $mm)) $text = $mm[0];
    $data = json_decode($text, true);
    return is_array($data) ? ['ok' => true, 'data' => $data] : ['ok' => false, 'error' => 'ai_bad_json'];
}

/**
 * The model's answer, made safe and checked. Returns ['ok', 'geom'] with every
 * value a fraction 0..1 (x across, y down), or ['ok' => false, 'why'] naming
 * what was implausible, which is what the second key is told.
 */
function photo_frame_clean(array $d): array {
    $f = static fn($v) => max(0.0, min(1.0, ((float)$v) / 1000));
    $box = static function ($b) use ($f) {
        if (!is_array($b) || count($b) !== 4) return null;
        [$y0, $x0, $y1, $x1] = array_map($f, array_values($b));
        if ($y1 < $y0) [$y0, $y1] = [$y1, $y0];
        if ($x1 < $x0) [$x0, $x1] = [$x1, $x0];
        return ($x1 - $x0) > 0.01 && ($y1 - $y0) > 0.01 ? ['x0' => $x0, 'y0' => $y0, 'x1' => $x1, 'y1' => $y1] : null;
    };
    $pt = static fn($p) => is_array($p) && count($p) === 2 ? ['y' => $f(array_values($p)[0]), 'x' => $f(array_values($p)[1])] : null;
    if (empty($d['subjectFound'])) return ['ok' => true, 'geom' => ['subject' => false, 'people' => (int)($d['people'] ?? 0), 'kind' => (string)($d['kind'] ?? 'none')]];
    $head = $box($d['head'] ?? null); $face = $box($d['face'] ?? null);
    $le = $pt($d['leftEye'] ?? null); $re = $pt($d['rightEye'] ?? null);
    if (!$head || !$face) return ['ok' => false, 'why' => 'The head or face box was missing.'];
    $tol = 0.03;
    if ($face['x0'] < $head['x0'] - $tol || $face['x1'] > $head['x1'] + $tol || $face['y0'] < $head['y0'] - $tol || $face['y1'] > $head['y1'] + $tol)
        return ['ok' => false, 'why' => 'The face box was not inside the head box; the head box must include all the hair and the chin.'];
    $hw = $head['x1'] - $head['x0']; $hh = $head['y1'] - $head['y0'];
    // Image coordinates are fractions of different sides, so this is a loose check of shape, not an exact ratio.
    if ($hh <= 0 || $hw / $hh > 4 || $hw / $hh < 0.2) return ['ok' => false, 'why' => 'The head box was not shaped like a head.'];
    if ($face['y1'] < $head['y1'] - 0.35 * $hh) return ['ok' => false, 'why' => 'The chin (bottom of the face box) must be at the bottom of the head box.'];
    if ($le && $re) {
        foreach ([$le, $re] as $e) if ($e['x'] < $face['x0'] - $tol || $e['x'] > $face['x1'] + $tol || $e['y'] < $face['y0'] - $tol || $e['y'] > $face['y1'] + $tol)
            return ['ok' => false, 'why' => 'An eye was outside the face box.'];
        if ($le['x'] > $re['x']) [$le, $re] = [$re, $le];
    }
    $sh = null;
    if (is_array($d['shoulders'] ?? null) && isset($d['shoulders']['y'])) {
        $sh = ['y' => $f($d['shoulders']['y']), 'x0' => $f($d['shoulders']['left'] ?? 0), 'x1' => $f($d['shoulders']['right'] ?? 1000)];
        if ($sh['y'] < $face['y1'] - 0.02) $sh = null;   // shoulders above the chin is a misread, not a pose
    }
    return ['ok' => true, 'geom' => ['subject' => true, 'people' => max(1, (int)($d['people'] ?? 1)), 'kind' => (string)($d['kind'] ?? 'headshot'),
        'head' => $head, 'face' => $face, 'eyes' => $le && $re ? [$le, $re] : null, 'shoulders' => $sh]];
}

/**
 * Measure one photograph: the framing key first, and the second key when the
 * first fails or answers implausibly (told what was wrong). Returns
 * ['ok', 'geom', 'model', 'tries'] or ['ok' => false, 'error'].
 */
function photo_frame_measure(array $basis): array {
    $cands = array_values(array_filter(ai_profile_candidates('framing'), static fn($c) => $c['provider'] === 'gemini'));
    if (!$cands) return ['ok' => false, 'error' => 'ai_disabled'];
    $img = photo_frame_bytes($basis);
    if (empty($img['ok'])) return ['ok' => false, 'error' => (string)($img['error'] ?? 'photo_unreadable')];
    $extra = ''; $last = ['ok' => false, 'error' => 'ai_failed']; $tries = 0;
    // Each key at most twice: a second look with the first answer's fault named.
    foreach (array_merge($cands, $cands) as $i => $cand) {
        if ($tries >= 3) break;
        $tries++;
        $r = photo_frame_ask($cand, $img, $extra);
        if (empty($r['ok'])) { $last = $r; continue; }
        $c = photo_frame_clean($r['data']);
        if (!empty($c['ok'])) return ['ok' => true, 'geom' => $c['geom'], 'model' => (string)($r['model'] ?? $cand['model']), 'tries' => $tries];
        $extra = 'A previous measurement was rejected: ' . $c['why'] . ' Measure again carefully.';
        $last = ['ok' => false, 'error' => 'implausible', 'detail' => $c['why']];
    }
    return $last;
}

/* ── The store ─────────────────────────────────────────────────────────── */

function photo_frame_row_out(array $r): array {
    $g = json_decode((string)($r['geomJson'] ?? ''), true);
    $a = json_decode((string)($r['adjustJson'] ?? ''), true);
    return ['status' => (string)$r['status'], 'geom' => is_array($g) ? $g : null, 'adjust' => is_array($a) ? $a : null,
            'model' => (string)($r['model'] ?? ''), 'at' => (string)($r['updatedAt'] ?? '')];
}

/** Measure (or re-measure) and store one photograph. Never throws. */
function photo_frame_ensure_one(string $url, bool $force, string $by): array {
    $b = photo_frame_basis($url);
    if (!$b) return ['ok' => false, 'error' => 'not_our_photo'];
    $row = db_row('SELECT * FROM photo_framing WHERE urlKey = ? LIMIT 1', [$b['key']]);
    // A failure is retried after a day; an answer is kept until somebody asks again.
    if ($row && !$force && ((string)$row['status'] === 'ok' || strtotime((string)$row['updatedAt']) > time() - 86400)) return ['ok' => true, 'cached' => true] + photo_frame_row_out($row);
    $m = photo_frame_measure($b);
    if (empty($m['ok']) && ($m['error'] ?? '') === 'ai_disabled') return $m;
    $now = now_iso();
    $data = ['status' => !empty($m['ok']) ? 'ok' : 'failed', 'geomJson' => !empty($m['ok']) ? json_encode($m['geom']) : '',
             'model' => (string)($m['model'] ?? ''), 'error' => empty($m['ok']) ? (string)($m['error'] ?? 'failed') : '', 'updatedAt' => $now, 'updatedBy' => $by];
    if ($row) db_update('photo_framing', $data, ['id' => (int)$row['id']]);
    else db_insert('photo_framing', $data + ['urlKey' => $b['key'], 'url' => mb_substr($url, 0, 500), 'adjustJson' => '', 'createdAt' => $now]);
    $row = db_row('SELECT * FROM photo_framing WHERE urlKey = ? LIMIT 1', [$b['key']]);
    return ['ok' => !empty($m['ok']), 'error' => $m['error'] ?? null] + photo_frame_row_out($row);
}

/** Who may spend the framing key: whoever prints cards. */
function photo_frame_gate(array $p): array {
    return admin_cap_gate_any($p, ['people', 'club', 'summer']);
}

/** admin.photos.frame — measure these photographs (those not measured yet, unless `force`). */
function admin_photos_frame(array $p): array {
    $g = photo_frame_gate($p); if (!$g['ok']) return $g;
    $urls = array_values(array_unique(array_filter(array_map(static fn($u) => trim((string)$u), (array)($p['urls'] ?? [])))));
    if (count($urls) > PFRAME_ENSURE_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . PFRAME_ENSURE_MAX . ' photos at a time.'];
    $by = (string)$g['requester']['memberId'];
    $out = []; $asked = 0; $failed = 0;
    foreach ($urls as $u) {
        $r = photo_frame_ensure_one($u, !empty($p['force']), $by);
        if (($r['error'] ?? '') === 'ai_disabled') return ['ok' => false, 'error' => 'ai_disabled', 'detail' => 'Add a Gemini key in Control Room → Settings → Photo framing.'];
        if (empty($r['cached'])) $asked++;
        if (empty($r['ok'])) $failed++;
        $out[$u] = $r;
    }
    if ($asked) audit('photos.frame', $by, '', ['asked' => $asked, 'failed' => $failed, 'force' => !empty($p['force'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'framing' => (object)$out, 'asked' => $asked, 'failed' => $failed];
}

/** Every photograph on a card that has never been measured. */
function photo_frame_backlog_urls(int $limit): array {
    $out = [];
    foreach ([['members', "status <> 'deleted'"], ['summer_students', "status = 'active'"], ['volunteers', "status = 'active'"]] as [$t, $w]) {
        try {
            foreach (db_all("SELECT photoUrl FROM $t WHERE photoUrl <> '' AND photoUrl IS NOT NULL AND $w ORDER BY id DESC LIMIT 4000") as $r) {
                $b = photo_frame_basis((string)$r['photoUrl']);
                if ($b && !isset($out[$b['key']])) $out[$b['key']] = (string)$r['photoUrl'];
            }
        } catch (\Throwable $e) {}
    }
    if (!$out) return [];
    $done = [];
    foreach (array_chunk(array_keys($out), 400) as $ch) foreach (db_all('SELECT urlKey FROM photo_framing WHERE urlKey IN (' . implode(',', array_fill(0, count($ch), '?')) . ')', $ch) as $r) $done[(string)$r['urlKey']] = true;
    return array_slice(array_values(array_diff_key($out, $done)), 0, $limit);
}

/** admin.photos.frame.backlog — measure the next few photographs nobody has measured (press again to continue). */
function admin_photos_frame_backlog(array $p): array {
    $g = photo_frame_gate($p); if (!$g['ok']) return $g;
    $urls = photo_frame_backlog_urls(PFRAME_BACKLOG_STEP);
    if (!$urls) return ['ok' => true, 'done' => 0, 'failed' => 0, 'remaining' => 0];
    $r = admin_photos_frame(['urls' => $urls] + $p);
    if (empty($r['ok'])) return $r;
    return ['ok' => true, 'done' => (int)$r['asked'], 'failed' => (int)$r['failed'], 'remaining' => count(photo_frame_backlog_urls(5000))];
}

/**
 * admin.photos.frame.adjust — a person's own framing for one photograph:
 * {zoom 0.6–2, dx/dy −0.5–0.5 of the box, whole: show the whole photo}, or
 * reset. Applies on every card that photograph appears on.
 */
function admin_photos_frame_adjust(array $p): array {
    $g = photo_frame_gate($p); if (!$g['ok']) return $g;
    $url = trim((string)($p['url'] ?? ''));
    $b = photo_frame_basis($url);
    if (!$b) return ['ok' => false, 'error' => 'not_our_photo'];
    $adj = '';
    if (empty($p['reset'])) {
        $a = is_array($p['adjust'] ?? null) ? $p['adjust'] : [];
        $num = static fn($v, $lo, $hi, $d) => is_numeric($v) ? max($lo, min($hi, round((float)$v, 3))) : $d;
        $adj = json_encode(['zoom' => $num($a['zoom'] ?? 1, 0.6, 2.0, 1.0), 'dx' => $num($a['dx'] ?? 0, -0.5, 0.5, 0.0), 'dy' => $num($a['dy'] ?? 0, -0.5, 0.5, 0.0), 'whole' => !empty($a['whole'])]);
    }
    $now = now_iso(); $by = (string)$g['requester']['memberId'];
    $row = db_row('SELECT id FROM photo_framing WHERE urlKey = ? LIMIT 1', [$b['key']]);
    if ($row) db_update('photo_framing', ['adjustJson' => $adj, 'updatedAt' => $now, 'updatedBy' => $by], ['id' => (int)$row['id']]);
    else db_insert('photo_framing', ['urlKey' => $b['key'], 'url' => mb_substr($url, 0, 500), 'status' => 'none', 'geomJson' => '', 'adjustJson' => $adj, 'model' => '', 'error' => '', 'createdAt' => $now, 'updatedAt' => $now, 'updatedBy' => $by]);
    audit('photos.frame.adjust', $by, '', ['reset' => !empty($p['reset'])], (string)($p['ip'] ?? ''));
    return ['ok' => true] + photo_frame_row_out(db_row('SELECT * FROM photo_framing WHERE urlKey = ? LIMIT 1', [$b['key']]));
}

/**
 * public.photos.framing — the stored framing for photographs a page is
 * showing. A read: it never asks the model. Answers only for photos we hold,
 * by the URL the caller already has.
 */
function public_photos_framing(array $p): array {
    $urls = array_slice(array_values(array_unique(array_filter(array_map(static fn($u) => trim((string)$u), (array)($p['urls'] ?? []))))), 0, PFRAME_READ_MAX);
    $keys = [];
    foreach ($urls as $u) { $b = photo_frame_basis($u); if ($b) $keys[$b['key']][] = $u; }
    $out = [];
    if ($keys) foreach (db_all('SELECT * FROM photo_framing WHERE urlKey IN (' . implode(',', array_fill(0, count($keys), '?')) . ')', array_keys($keys)) as $r) {
        $v = photo_frame_row_out($r);
        unset($v['model'], $v['at']);
        foreach ($keys[(string)$r['urlKey']] as $u) $out[$u] = $v;
    }
    return ['ok' => true, 'framing' => (object)$out];
}
