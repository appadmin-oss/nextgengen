<?php
declare(strict_types=1);

/**
 * Quote of the week.
 *
 * One saying a week on the home page — a Hausa riddle (kacici-kacici), an Igbo
 * proverb (ilụ), a Yoruba proverb (òwe) — in a FIXED language rotation:
 * Hausa, Igbo, Yoruba, Hausa, Igbo, Yoruba… Each language walks its own list in
 * `position` order, so adding a Yoruba saying never changes which Hausa one is
 * next.
 *
 * The rotation is derived from the calendar, not stored. There is no cron on
 * shared hosting to "advance" it, and a derived week cannot get stuck: every
 * request computes the same answer for the same Monday.
 *
 * Audio. Each saying carries up to TWO stored clips, played one after the
 * other on the home page: the saying in its own language (`audioFile`), then
 * its English translation (`audioFileEn`), so a child who does not speak Hausa
 * still hears what the riddle says.
 *   · The native clip is either a staff voice-over (`custom`) — a person
 *     reading it is the gold standard and is never replaced without asking —
 *     or a TTS rendering (`tts`).
 *   · TTS clips are generated ONCE and saved. wisdom_tts_clip() keys every
 *     clip by exactly what determines it (language, voice, speed, script) in
 *     wisdom_tts_clips; the same request is answered from disk forever after.
 *     Generation happens when a saying is saved, from "Voice everything
 *     missing", and at most once per saying as a backstop when this week's
 *     saying is first read without a clip. A visitor never causes a second
 *     call, and a failed backstop is not retried — staff press Generate.
 * The provider is Spitch (spitch.app), a Nigerian speech company whose voices
 * are trained on native Hausa, Igbo, Yorùbá and Nigerian-English speech.
 * Three things make it read fluently rather than merely audibly:
 *   · natural pace and a cleaned script (punctuation is prosody);
 *   · a "how it should be read" spelling staff can give — tone marks and
 *     all — without changing what the page shows (`spokenText`);
 *   · a listen-back: each new clip is transcribed by Spitch's own
 *     speech-to-text in the same language and scored against the script.
 *     A stumble tries the language's next native voice, the best is kept,
 *     and the score is shown to staff. Spitch diacritizes Yorùbá itself.
 * Staff can also clone a native speaker's voice from a short recording (with
 * their consent) and use it for every saying.
 */

const WISDOM_LANGS = ['hausa', 'igbo', 'yoruba'];
const WISDOM_KINDS = ['riddle', 'proverb', 'quote'];
/* The Monday the rotation counts from (Lagos time). Week 0 is Hausa's first. */
const WISDOM_ANCHOR = '2026-09-21T00:00:00+01:00';
const WISDOM_AUDIO_MAX = 4 * 1024 * 1024;
const WISDOM_LANG_CODE = ['hausa' => 'ha', 'igbo' => 'ig', 'yoruba' => 'yo', 'english' => 'en'];
/* Spitch's system voices, by the language each was designed around. Any voice
 * can speak any language, but a voice reads best in its own. First = default. */
const WISDOM_VOICES = [
    'hausa'   => ['amina', 'zainab', 'aliyu', 'hasan'],
    'igbo'    => ['ngozi', 'amara', 'obinna', 'ebuka'],
    'yoruba'  => ['sade', 'funmi', 'segun', 'femi'],
    'english' => ['lucy', 'kingsley', 'remi', 'john', 'kani', 'jude', 'henry', 'lina'],
];
/* How many sayings one "Voice everything" press may voice. Each is up to two
 * provider calls of a few seconds; forty keeps one press inside a shared
 * host's request limit. Press again for the rest. */
const WISDOM_VOICE_ALL_MAX = 40;
/* Normal speaking pace. Slowed speech is what makes a TTS voice sound read
 * rather than spoken. */
const WISDOM_TTS_SPEED = 1.0;
/* Listen-back: a clip whose transcript matches the script this closely is a
 * fluent read; below it the next native voice is tried, at most this many. */
const WISDOM_TTS_GOOD = 0.85;
const WISDOM_TTS_TRIES = 4;

/* ── Seed ─────────────────────────────────────────────────────────────── */

function wisdom_seed_rows(): array {
    return [
        ['hausa', 'riddle', 'Na tura yaron da bai da ƙafa, ya dawo mini da saƙo.',
         'I sent a servant who has no legs, and he returned with a message.',
         'Muryar mutum / Iska', 'A person’s voice / Wind',
         'This riddle tests the understanding of intangible forces. Sound and wind can travel across distances and deliver something without having a physical body or legs.'],
        ['hausa', 'riddle', 'Tsoho a daji, yana ci gaba da cin abinci amma ba ya ƙoshi; idan aka ba shi ruwa, sai ya mutu.',
         'An old man in the forest keeps eating but never gets full; if you give him water, he dies.',
         'Wuta', 'Fire',
         'Fire continuously consumes fuel without becoming satisfied, yet water can extinguish it. The riddle highlights the contrast between strength and vulnerability.'],
        ['hausa', 'riddle', 'Shanuna dubu, amma madaurinsu ɗaya ne.',
         'My cattle are a thousand, but they share a single tethering rope.',
         'Tsintsiya', 'A broom',
         'It demonstrates unity and collective strength. Individual strands may be weak on their own, but when bound together, they can accomplish a greater purpose.'],
        ['hausa', 'riddle', 'Na gani guda ɗaya, amma kowa na ganin kansa a ciki.',
         'I see only one thing, yet everyone sees themselves inside it.',
         'Madubi', 'A mirror',
         'It encourages self-reflection. The mirror is one object, but everyone who looks into it sees their own image and reality.'],
        ['igbo', 'proverb', 'A ma ka mmiri si were baa n\'opi ugboguru?',
         'Who knows how water managed to enter the stem of the pumpkin?', '', '',
         'Life contains mysteries that human beings cannot always explain. Some processes remain beyond human understanding, reminding us of the limits of human knowledge.'],
        ['igbo', 'proverb', 'Onye buru ozu enyi anaghi eji ukwu akpa mpuzu.',
         'A person carrying the carcass of an elephant does not search for crickets with their feet.', '', '',
         'Focus on your major responsibility or goal. Do not allow small details or trivial distractions to divert your attention from something much more important.'],
        ['igbo', 'proverb', 'Ọkụko na-arọgọrọ ite ọnụ, chetekwe mma gburu ya.',
         'The chicken complains about the cooking pot while forgetting the knife that killed it.', '', '',
         'People sometimes blame the visible or immediate manifestation of a problem while ignoring its root cause.'],
    ];
}

/** Seed once per deployment. A flag, not "is the table empty", so staff who
 *  delete every saying are not handed the seed back. */
function wisdom_ensure_seeded(): void {
    if (setting_get('wisdom.seeded')) return;
    $pos = [];
    $now = now_iso();
    foreach (wisdom_seed_rows() as [$lang, $kind, $text, $tr, $ans, $ansTr, $meaning]) {
        $pos[$lang] = ($pos[$lang] ?? 0) + 1;
        db_insert('wisdom_sayings', [
            'wisdomId' => 'WS-' . strtoupper(rand_hex(5)), 'language' => $lang, 'kind' => $kind,
            'text' => $text, 'translation' => $tr, 'answer' => $ans, 'answerTranslation' => $ansTr,
            'meaning' => $meaning, 'position' => $pos[$lang], 'status' => 'live',
            'createdAt' => $now, 'updatedAt' => $now,
        ]);
    }
    setting_set('wisdom.seeded', ['at' => $now], 'system');
}

/* ── Shape + rotation ─────────────────────────────────────────────────── */

function wisdom_shape(array $r, bool $admin = false): array {
    $out = [
        'wisdomId' => (string)$r['wisdomId'],
        'language' => (string)$r['language'],
        'kind' => (string)$r['kind'],
        'text' => (string)$r['text'],
        'translation' => (string)($r['translation'] ?? ''),
        'answer' => (string)($r['answer'] ?? ''),
        'answerTranslation' => (string)($r['answerTranslation'] ?? ''),
        'meaning' => (string)($r['meaning'] ?? ''),
        'audioUrl' => wisdom_audio_url((string)($r['audioFile'] ?? '')),
        'audioSource' => (string)($r['audioSource'] ?? ''),
        'audioUrlEn' => wisdom_audio_url((string)($r['audioFileEn'] ?? '')),
        'langCode' => WISDOM_LANG_CODE[(string)$r['language']] ?? '',
    ];
    if ($admin) {
        $out += ['position' => (int)($r['position'] ?? 0), 'status' => (string)($r['status'] ?? 'live'),
                 'voice' => (string)($r['voice'] ?? ''), 'voiceEn' => (string)($r['voiceEn'] ?? ''),
                 'spokenText' => (string)($r['spokenText'] ?? ''),
                 'ttsScore' => isset($r['ttsScore']) && $r['ttsScore'] !== null && $r['audioSource'] === 'tts' ? (float)$r['ttsScore'] : null,
                 'ttsScoreEn' => isset($r['ttsScoreEn']) && $r['ttsScoreEn'] !== null && ($r['audioFileEn'] ?? '') !== '' ? (float)$r['ttsScoreEn'] : null,
                 'updatedAt' => (string)($r['updatedAt'] ?? '')];
    }
    return $out;
}

/** Live sayings grouped by language, each list in its own order. */
function wisdom_live_by_lang(): array {
    $by = array_fill_keys(WISDOM_LANGS, []);
    foreach (db_all("SELECT * FROM wisdom_sayings WHERE status = 'live' ORDER BY position, id") as $r) {
        if (isset($by[$r['language']])) $by[$r['language']][] = $r;
    }
    return $by;
}

function wisdom_week_index(?int $ts = null): int {
    $ts = $ts ?? time();
    return (int)floor(($ts - strtotime(WISDOM_ANCHOR)) / 604800);
}

/**
 * Which saying week $w shows. Languages cycle in WISDOM_LANGS order; a
 * language with nothing live is skipped rather than leaving a blank week. The
 * n-th turn of a language shows the n-th saying of its list, wrapping.
 */
function wisdom_pick(array $byLang, int $w): ?array {
    $active = array_values(array_filter(WISDOM_LANGS, fn($l) => !empty($byLang[$l])));
    $n = count($active);
    if ($n === 0) return null;
    $slot = (($w % $n) + $n) % $n;
    $turn = intdiv($w - $slot, $n);
    $list = $byLang[$active[$slot]];
    $c = count($list);
    return $list[(($turn % $c) + $c) % $c];
}

function wisdom_week_monday(int $w): string {
    return gmdate('Y-m-d', strtotime(WISDOM_ANCHOR) + $w * 604800 + 3600);
}

/* ── Public ───────────────────────────────────────────────────────────── */

function public_wisdom_week(array $p): array {
    wisdom_ensure_seeded();
    $w = wisdom_week_index();
    $row = wisdom_pick(wisdom_live_by_lang(), $w);
    if ($row && wisdom_tts_missing($row) && wisdom_tts_key() !== '' && (string)($row['ttsTriedAt'] ?? '') === '') {
        /* Once per saying, ever. The stamp is written first and is the lock: a
         * burst of visitors produces one attempt, not one each, and a failed
         * attempt is not retried by visitors at all — staff press Generate. */
        db_update('wisdom_sayings', ['ttsTriedAt' => now_iso()], ['wisdomId' => $row['wisdomId']]);
        wisdom_tts_fill($row);
        $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [$row['wisdomId']]);
    }
    return ['ok' => true, 'week' => wisdom_week_monday($w),
            'saying' => $row ? wisdom_shape($row) : null];
}

/* ── Audio store ──────────────────────────────────────────────────────── */

function wisdom_audio_dir(): string {
    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    $dir = ($base !== '' ? dirname($base) : (__DIR__ . '/../../storage')) . '/wisdom';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $ht = $dir . '/.htaccess';
    if (is_dir($dir) && !is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n");
    }
    return $dir;
}

function wisdom_audio_path(string $name): string {
    if (!preg_match('/^[0-9a-f]{32}\.(mp3|m4a|wav|ogg|webm)$/', $name)) return '';
    return wisdom_audio_dir() . '/' . $name;
}

function wisdom_audio_url(string $name): string {
    return $name === '' ? '' : '/api/public/wisdom-audio.php?a=' . rawurlencode($name);
}

/** Identify an audio file by its bytes, never by a client-supplied type. */
function wisdom_audio_ext(string $bytes): string {
    $h = substr($bytes, 0, 12);
    if (strncmp($h, 'ID3', 3) === 0) return 'mp3';
    if (strlen($h) >= 2 && ord($h[0]) === 0xFF && (ord($h[1]) & 0xE0) === 0xE0) return 'mp3';
    if (strncmp($h, 'RIFF', 4) === 0 && substr($h, 8, 4) === 'WAVE') return 'wav';
    if (strncmp($h, 'OggS', 4) === 0) return 'ogg';
    if (strncmp($h, "\x1A\x45\xDF\xA3", 4) === 0) return 'webm';
    if (substr($h, 4, 4) === 'ftyp') return 'm4a';
    return '';
}

/** Store bytes; returns the file name or '' if refused. */
function wisdom_audio_put(string $bytes): string {
    $ext = wisdom_audio_ext($bytes);
    if ($ext === '' || strlen($bytes) > WISDOM_AUDIO_MAX) return '';
    $name = substr(hash('sha256', $bytes), 0, 32) . '.' . $ext;
    $path = wisdom_audio_dir() . '/' . $name;
    if (!is_file($path) && @file_put_contents($path, $bytes) === false) return '';
    return $name;
}

/** Drop a clip no saying points at any more. */
function wisdom_audio_release(string $name): void {
    if ($name === '') return;
    if (db_row('SELECT id FROM wisdom_sayings WHERE audioFile = ? OR audioFileEn = ? LIMIT 1', [$name, $name])) return;
    // A generated clip is saved for good: throwing it away would mean paying to make it again.
    if (db_row('SELECT cacheKey FROM wisdom_tts_clips WHERE file = ? LIMIT 1', [$name])) return;
    $path = wisdom_audio_path($name);
    if ($path !== '' && is_file($path)) @unlink($path);
}

/* ── TTS (Spitch) ─────────────────────────────────────────────────────── */

function wisdom_tts_key(): string {
    $k = (string)($GLOBALS['CONFIG']['tts']['spitch_key'] ?? '');
    if ($k === '') $k = (string)(getenv('SPITCH_API_KEY') ?: '');
    return trim($k);
}

/** One request to Spitch. JSON in; audio bytes or JSON out. Tests replace the
 *  transport through $GLOBALS['__wisdom_http'] so no suite talks to the network. */
function wisdom_spitch(string $method, string $path, $body, bool $multipart = false): array {
    if (isset($GLOBALS['__wisdom_http']) && is_callable($GLOBALS['__wisdom_http'])) {
        return ($GLOBALS['__wisdom_http'])($method, $path, $body);
    }
    $key = wisdom_tts_key();
    if ($key === '') return ['code' => 0, 'body' => '', 'error' => 'tts_not_configured'];
    if (!function_exists('curl_init')) return ['code' => 0, 'body' => '', 'error' => 'no_curl'];
    $ch = curl_init('https://api.spitch.app' . $path);
    $headers = ['Authorization: Bearer ' . $key];
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_CUSTOMREQUEST => $method];
    if ($body !== null) {
        if ($multipart) { $opts[CURLOPT_POSTFIELDS] = $body; }
        else { $headers[] = 'Content-Type: application/json'; $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE); }
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;
    curl_setopt_array($ch, $opts);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => $out === false ? '' : (string)$out];
}

/**
 * The words the voice is actually given: the staff's "how it should be read"
 * spelling if there is one, else the saying. Clean punctuation is much of what
 * separates a fluent read from a halting one — a curly apostrophe or a double
 * space can be read as a hitch, and a sentence with no full stop runs into
 * silence without the falling tone that ends it. (Spitch diacritizes Yorùbá
 * itself before synthesis, so unmarked Yorùbá needs no call of ours.)
 */
function wisdom_tts_script(string $text, string $lang): string {
    $t = str_replace(["\u{2019}", "\u{2018}", "\u{201C}", "\u{201D}", "\u{2026}"], ["'", "'", '"', '"', '...'], $text);
    $t = trim(preg_replace('/\s+/u', ' ', $t));
    if ($t !== '' && !preg_match('/[.!?]["\']?$/u', $t)) $t .= '.';
    return $t;
}

/** Letters only, no tone marks or case: what a listener would hear as "the same words". */
function wisdom_norm_words(string $t): string {
    $t = mb_strtolower($t);
    $t = strtr($t, ['ɗ' => 'd', 'ƙ' => 'k', 'ɓ' => 'b', 'ƴ' => 'y', "'" => '']);
    if (class_exists('Normalizer')) $t = (string)Normalizer::normalize($t, Normalizer::FORM_D);
    $t = preg_replace('/\p{Mn}+/u', '', $t);
    $t = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $t);
    return trim($t);
}

/** 0..1 — how closely a transcript matches the script, by character edit distance. */
function wisdom_match_score(string $script, string $heard): float {
    $a = preg_split('//u', str_replace(' ', '', wisdom_norm_words($script)), -1, PREG_SPLIT_NO_EMPTY);
    $b = preg_split('//u', str_replace(' ', '', wisdom_norm_words($heard)), -1, PREG_SPLIT_NO_EMPTY);
    $n = count($a); $m = count($b);
    if ($n === 0) return 0.0;
    $prev = range(0, $m);
    for ($i = 1; $i <= $n; $i++) {
        $cur = [$i];
        for ($j = 1; $j <= $m; $j++) {
            $cur[$j] = min($prev[$j] + 1, $cur[$j - 1] + 1, $prev[$j - 1] + ($a[$i - 1] === $b[$j - 1] ? 0 : 1));
        }
        $prev = $cur;
    }
    return round(max(0.0, 1 - $prev[$m] / max($n, $m)), 3);
}

/**
 * Listen back: transcribe a clip with Spitch's speech-to-text in the same
 * language and compare it with what the voice was asked to say. A voice that
 * mispronounces a word is heard as a different word, so a low match is how a
 * clumsy reading is caught BEFORE it reaches the home page — not after a
 * parent points it out. Null if the check could not run.
 */
function wisdom_tts_check(string $bytes, string $lang, string $script): ?array {
    if (!class_exists('CURLFile') && !isset($GLOBALS['__wisdom_http'])) return null;
    $tmp = tempnam(sys_get_temp_dir(), 'wck');
    file_put_contents($tmp, $bytes);
    try {
        $r = wisdom_spitch('POST', '/v1/transcriptions', [
            'content' => class_exists('CURLFile') ? new CURLFile($tmp, 'audio/mpeg', 'clip.mp3') : $tmp,
            'language' => WISDOM_LANG_CODE[$lang] ?? 'en',
        ], true);
    } finally { @unlink($tmp); }
    $j = $r['code'] === 200 ? json_decode($r['body'], true) : null;
    if (!is_array($j) || !isset($j['text'])) return null;
    return ['score' => wisdom_match_score($script, (string)$j['text']), 'heard' => mb_substr((string)$j['text'], 0, 600)];
}

/**
 * One clip for one script in one voice — generated ONCE, ever.
 *
 * Every generated clip is recorded in wisdom_tts_clips under a key made of
 * exactly what determines the audio (language, voice, speed, script). Asking
 * again for the same thing returns the saved file without calling the
 * provider: pressing Generate twice, re-saving an unchanged saying, deleting
 * and re-adding it, or switching back to a voice already tried costs nothing.
 * The files are kept for the same reason — a saved clip is never thrown away
 * and made again.
 */
function wisdom_tts_clip(string $text, string $lang, string $voice): array {
    $script = wisdom_tts_script($text, $lang);
    if ($script === '') return ['ok' => false, 'error' => 'nothing_to_say'];
    $key = hash('sha256', implode("\x1F", [WISDOM_LANG_CODE[$lang] ?? 'en', $voice, (string)WISDOM_TTS_SPEED, $script]));
    $hit = db_row('SELECT * FROM wisdom_tts_clips WHERE cacheKey = ?', [$key]);
    if ($hit && is_file(wisdom_audio_path((string)$hit['file']))) {
        return ['ok' => true, 'file' => (string)$hit['file'], 'score' => $hit['score'] === null ? null : (float)$hit['score'],
                'heard' => (string)$hit['heard'], 'cached' => true, 'voice' => $voice];
    }
    if (wisdom_tts_key() === '' && !isset($GLOBALS['__wisdom_http'])) return ['ok' => false, 'error' => 'tts_not_configured'];
    $r = wisdom_spitch('POST', '/v1/speech', ['language' => WISDOM_LANG_CODE[$lang] ?? 'en', 'text' => $script,
        'voice' => $voice, 'speed' => WISDOM_TTS_SPEED, 'format' => 'mp3', 'bitrate' => '128k']);
    if ($r['code'] !== 200 || $r['body'] === '') {
        error_log('[wisdom] tts http ' . $r['code'] . ' ' . substr($r['body'], 0, 200));
        return ['ok' => false, 'error' => $r['error'] ?? 'tts_failed', 'message' => 'The voice service answered ' . $r['code'] . '.'];
    }
    $file = wisdom_audio_put($r['body']);
    if ($file === '') return ['ok' => false, 'error' => 'tts_bad_audio'];
    $chk = wisdom_tts_check($r['body'], $lang, $script);
    db_exec('DELETE FROM wisdom_tts_clips WHERE cacheKey = ?', [$key]);
    db_insert('wisdom_tts_clips', ['cacheKey' => $key, 'file' => $file, 'language' => $lang, 'voice' => $voice,
        'script' => $script, 'score' => $chk ? $chk['score'] : null, 'heard' => $chk ? $chk['heard'] : '', 'createdAt' => now_iso()]);
    return ['ok' => true, 'file' => $file, 'score' => $chk ? $chk['score'] : null, 'heard' => $chk ? $chk['heard'] : '',
            'cached' => false, 'voice' => $voice];
}

/* ── Voices: defaults and cloned voices ───────────────────────────────── */

/** Staff-cloned voices: [{voiceId, name, language, createdAt}]. */
function wisdom_custom_voices(): array {
    $v = setting_get('wisdom.customVoices');
    return is_array($v) ? array_values(array_filter($v, 'is_array')) : [];
}

function wisdom_voice_valid(string $voice): bool {
    foreach (WISDOM_VOICES as $list) if (in_array($voice, $list, true)) return true;
    foreach (wisdom_custom_voices() as $c) if (($c['voiceId'] ?? '') === $voice) return true;
    return false;
}

/** The voice each language is read in unless a saying names its own. */
function wisdom_voice_defaults(): array {
    $saved = setting_get('wisdom.voiceDefaults');
    $out = [];
    foreach (WISDOM_VOICES as $lang => $list) {
        $v = is_array($saved) ? (string)($saved[$lang] ?? '') : '';
        $out[$lang] = ($v !== '' && wisdom_voice_valid($v)) ? $v : $list[0];
    }
    return $out;
}

/** Is a clip this saying should have not there yet? A staff voice-over counts. */
function wisdom_tts_missing(array $row): bool {
    if ((string)($row['audioFile'] ?? '') === '') return true;
    return trim((string)($row['translation'] ?? '')) !== '' && (string)($row['audioFileEn'] ?? '') === '';
}

/**
 * The best native reading, chosen once. With no voice named, the language's
 * default is tried first and, if the listen-back says it stumbled, the other
 * native voices of that language after it — each clip made once and kept —
 * and the closest match wins. With a voice named, that voice, and only it.
 */
function wisdom_tts_best(string $text, string $lang, string $voice): array {
    if ($voice !== '') return wisdom_tts_clip($text, $lang, $voice);
    $first = wisdom_voice_defaults()[$lang];
    $order = array_values(array_unique(array_merge([$first], WISDOM_VOICES[$lang] ?? [])));
    $best = null; $err = null;
    foreach (array_slice($order, 0, WISDOM_TTS_TRIES) as $v) {
        $r = wisdom_tts_clip($text, $lang, $v);
        if (!$r['ok']) { $err = $err ?? $r; if (($r['error'] ?? '') === 'tts_not_configured') break; continue; }
        if ($best === null || ($r['score'] ?? -1) > ($best['score'] ?? -1)) $best = $r;
        // No listen-back available, or it read well: stop spending.
        if ($r['score'] === null || $r['score'] >= WISDOM_TTS_GOOD) break;
    }
    return $best ?? $err ?? ['ok' => false, 'error' => 'tts_failed'];
}

/**
 * Give a saying the clips it is missing (or, with $which, those named).
 * Never overwrites a staff voice-over unless $replaceCustom. Returns what it
 * made and the first error, so a partial success is reported as one.
 */
function wisdom_tts_fill(array $row, array $which = [], string $voice = '', string $voiceEn = '', bool $replaceCustom = false): array {
    $made = []; $err = null; $patch = [];
    $wantNative = in_array('native', $which, true) || ($which === [] && (string)$row['audioFile'] === '');
    if ($wantNative && $row['audioSource'] === 'custom' && !$replaceCustom) $wantNative = false;
    $hasTr = trim((string)($row['translation'] ?? '')) !== '';
    $wantEn = $hasTr && (in_array('english', $which, true) || ($which === [] && (string)($row['audioFileEn'] ?? '') === ''));
    $spoken = trim((string)($row['spokenText'] ?? '')) !== '' ? (string)$row['spokenText'] : (string)$row['text'];

    if ($wantNative) {
        $v = wisdom_voice_valid($voice) ? $voice : (wisdom_voice_valid((string)$row['voice']) ? (string)$row['voice'] : '');
        $r = wisdom_tts_best($spoken, (string)$row['language'], $v);
        if ($r['ok']) {
            $patch += ['audioFile' => $r['file'], 'audioSource' => 'tts', 'voice' => $r['voice'], 'ttsScore' => $r['score']];
            $made[] = 'native';
        } else $err = $r;
    }
    if ($wantEn) {
        $v = wisdom_voice_valid($voiceEn) ? $voiceEn
           : (wisdom_voice_valid((string)($row['voiceEn'] ?? '')) ? (string)$row['voiceEn'] : wisdom_voice_defaults()['english']);
        $r = wisdom_tts_clip((string)$row['translation'], 'english', $v);
        if ($r['ok']) { $patch += ['audioFileEn' => $r['file'], 'voiceEn' => $v, 'ttsScoreEn' => $r['score']]; $made[] = 'english'; }
        else $err = $err ?? $r;
    }
    if ($patch) {
        db_update('wisdom_sayings', $patch + ['updatedAt' => now_iso()], ['wisdomId' => $row['wisdomId']]);
        foreach (['audioFile', 'audioFileEn'] as $col) {
            if (isset($patch[$col]) && (string)($row[$col] ?? '') !== $patch[$col]) wisdom_audio_release((string)($row[$col] ?? ''));
        }
    }
    return $err && !$made ? $err : ['ok' => true, 'made' => $made, 'partial' => $err ? ($err['error'] ?? 'failed') : null];
}

function wisdom_next_position(string $lang): int {
    $r = db_row('SELECT IFNULL(MAX(position),0) AS m FROM wisdom_sayings WHERE language = ?', [$lang]);
    return 1 + (int)($r['m'] ?? 0);
}

/* ── Admin ────────────────────────────────────────────────────────────── */

function admin_wisdom_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    wisdom_ensure_seeded();
    $rows = db_all('SELECT * FROM wisdom_sayings ORDER BY position, id');
    $by = wisdom_live_by_lang();
    $w = wisdom_week_index();
    // The number each saying holds in its own language's list, for the strip.
    $num = [];
    foreach ($by as $list) foreach ($list as $k => $r) $num[$r['wisdomId']] = $k + 1;
    $schedule = [];
    for ($i = 0; $i < 9; $i++) {
        $r = wisdom_pick($by, $w + $i);
        if ($r) $schedule[] = ['week' => wisdom_week_monday($w + $i), 'wisdomId' => (string)$r['wisdomId'],
                               'language' => (string)$r['language'], 'number' => $num[$r['wisdomId']] ?? 0,
                               'text' => (string)$r['text']];
    }
    $missing = 0;
    foreach ($rows as $r) if ($r['status'] === 'live' && wisdom_tts_missing($r)) $missing++;
    return ['ok' => true, 'sayings' => array_map(fn($r) => wisdom_shape($r, true), $rows),
            'schedule' => $schedule, 'languages' => WISDOM_LANGS, 'kinds' => WISDOM_KINDS,
            'voices' => WISDOM_VOICES, 'customVoices' => wisdom_custom_voices(),
            'voiceDefaults' => wisdom_voice_defaults(), 'missingVoice' => $missing,
            'voiceAllMax' => WISDOM_VOICE_ALL_MAX,
            'ttsReady' => wisdom_tts_key() !== '', 'audioMax' => WISDOM_AUDIO_MAX];
}

function admin_wisdom_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $lang = (string)($d['language'] ?? '');
    if (!in_array($lang, WISDOM_LANGS, true)) return ['ok' => false, 'error' => 'bad_language'];
    $kind = (string)($d['kind'] ?? 'proverb');
    if (!in_array($kind, WISDOM_KINDS, true)) $kind = 'proverb';
    $text = mb_substr(trim((string)($d['text'] ?? '')), 0, 600);
    if (mb_strlen($text) < 3) return ['ok' => false, 'error' => 'text_required'];
    $row = [
        'language' => $lang, 'kind' => $kind, 'text' => $text,
        'translation' => mb_substr(trim((string)($d['translation'] ?? '')), 0, 600),
        'answer' => mb_substr(trim((string)($d['answer'] ?? '')), 0, 200),
        'answerTranslation' => mb_substr(trim((string)($d['answerTranslation'] ?? '')), 0, 200),
        'meaning' => mb_substr(trim((string)($d['meaning'] ?? '')), 0, 1200),
        'spokenText' => mb_substr(trim((string)($d['spokenText'] ?? '')), 0, 600),
        'status' => ($d['status'] ?? 'live') === 'hidden' ? 'hidden' : 'live',
        'updatedAt' => now_iso(),
    ];
    $id = (string)($d['wisdomId'] ?? '');
    $old = $id !== '' ? db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [$id]) : null;
    $release = [];
    if ($old) {
        // A generated clip reads the old words; once the words change it is wrong.
        if ($old['audioSource'] === 'tts' && ($old['text'] !== $text || $old['language'] !== $lang
                || (string)($old['spokenText'] ?? '') !== $row['spokenText'])) {
            $row += ['audioFile' => '', 'audioSource' => '']; $release[] = (string)$old['audioFile'];
        }
        if ((string)$old['translation'] !== $row['translation']) {
            $row += ['audioFileEn' => '']; $release[] = (string)($old['audioFileEn'] ?? '');
        }
        if ($old['language'] !== $lang) $row['position'] = wisdom_next_position($lang);
        db_update('wisdom_sayings', $row, ['wisdomId' => $id]);
        foreach ($release as $f) wisdom_audio_release($f);
    } else {
        $id = 'WS-' . strtoupper(rand_hex(5));
        $row['position'] = wisdom_next_position($lang);
        db_insert('wisdom_sayings', $row + ['wisdomId' => $id, 'createdAt' => now_iso()]);
    }
    audit('wisdom.upsert', (string)($g['requester']['memberId'] ?? ''), $id, ['language' => $lang], (string)($p['ip'] ?? ''));
    /* Voice it now, while staff are looking, so a fault is seen on this
     * screen rather than discovered on the home page. A failure never fails
     * the save — the words are what matter; the clip can be made again. */
    $voice = null;
    if (wisdom_tts_key() !== '') {
        $fresh = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [$id]);
        if ($fresh && wisdom_tts_missing($fresh)) $voice = wisdom_tts_fill($fresh);
    }
    return ['ok' => true, 'wisdomId' => $id, 'voice' => $voice];
}

function admin_wisdom_delete(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_exec('DELETE FROM wisdom_sayings WHERE wisdomId = ?', [$row['wisdomId']]);
    wisdom_audio_release((string)$row['audioFile']);
    wisdom_audio_release((string)($row['audioFileEn'] ?? ''));
    audit('wisdom.delete', (string)($g['requester']['memberId'] ?? ''), (string)$row['wisdomId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Move one saying up or down within its own language's list. */
function admin_wisdom_move(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $list = db_all('SELECT wisdomId FROM wisdom_sayings WHERE language = ? ORDER BY position, id', [$row['language']]);
    $ids = array_column($list, 'wisdomId');
    $i = array_search($row['wisdomId'], $ids, true);
    $j = ($p['dir'] ?? '') === 'up' ? $i - 1 : $i + 1;
    if ($j < 0 || $j >= count($ids)) return ['ok' => true, 'unchanged' => true];
    [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]];
    foreach ($ids as $k => $wid) db_update('wisdom_sayings', ['position' => $k + 1], ['wisdomId' => $wid]);
    return ['ok' => true];
}

/** Remake one saying's clips in the voices chosen. `which` = native|english|both. */
function admin_wisdom_voice_generate(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    if (wisdom_tts_key() === '' && !isset($GLOBALS['__wisdom_http'])) return ['ok' => false, 'error' => 'tts_not_configured'];
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $which = ['native' => ['native'], 'english' => ['english']][(string)($p['which'] ?? '')] ?? ['native', 'english'];
    if (in_array('native', $which, true) && $row['audioSource'] === 'custom' && empty($p['replace'])) {
        return ['ok' => false, 'error' => 'has_custom_voice'];
    }
    $res = wisdom_tts_fill($row, $which, (string)($p['voice'] ?? ''), (string)($p['voiceEn'] ?? ''), !empty($p['replace']));
    if (!empty($res['ok'])) {
        audit('wisdom.voice', (string)($g['requester']['memberId'] ?? ''), (string)$row['wisdomId'],
              ['source' => 'tts', 'made' => $res['made']], (string)($p['ip'] ?? ''));
    }
    return $res;
}

/** Voice every live saying that is missing a clip, up to the cap per press. */
function admin_wisdom_voice_all(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    if (wisdom_tts_key() === '' && !isset($GLOBALS['__wisdom_http'])) return ['ok' => false, 'error' => 'tts_not_configured'];
    $todo = array_values(array_filter(db_all("SELECT * FROM wisdom_sayings WHERE status = 'live' ORDER BY position, id"), 'wisdom_tts_missing'));
    $done = 0; $failed = [];
    foreach (array_slice($todo, 0, WISDOM_VOICE_ALL_MAX) as $row) {
        $r = wisdom_tts_fill($row);
        if (!empty($r['ok']) && empty($r['partial'])) $done++;
        else $failed[] = ['wisdomId' => $row['wisdomId'], 'error' => $r['partial'] ?? ($r['error'] ?? 'failed')];
    }
    audit('wisdom.voice.all', (string)($g['requester']['memberId'] ?? ''), '',
          ['voiced' => $done, 'failed' => count($failed)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'voiced' => $done, 'failed' => $failed,
            'remaining' => max(0, count($todo) - WISDOM_VOICE_ALL_MAX), 'cap' => WISDOM_VOICE_ALL_MAX];
}

function admin_wisdom_voice_defaults_set(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $in = is_array($p['defaults'] ?? null) ? $p['defaults'] : [];
    $out = [];
    foreach (array_keys(WISDOM_VOICES) as $lang) {
        $v = (string)($in[$lang] ?? '');
        if ($v !== '' && !wisdom_voice_valid($v)) return ['ok' => false, 'error' => 'bad_voice', 'message' => $lang];
        if ($v !== '') $out[$lang] = $v;
    }
    setting_set('wisdom.voiceDefaults', $out, (string)($g['requester']['memberId'] ?? ''));
    return ['ok' => true, 'voiceDefaults' => wisdom_voice_defaults()];
}

/** Decode a data: URL to audio bytes, sniffed; null if it isn't audio. */
function wisdom_audio_from_data_url(string $data): ?string {
    if (!preg_match('#^data:[a-z0-9/.+-]*(;[a-z0-9=.-]+)*;base64,#i', $data, $m)) return null;
    $bytes = base64_decode(substr($data, strlen($m[0])), true);
    if ($bytes === false || $bytes === '' || wisdom_audio_ext($bytes) === '') return null;
    return $bytes;
}

/** A staff voice-over: a data: URL from an upload or an in-browser recording. */
function admin_wisdom_voice_upload(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $bytes = wisdom_audio_from_data_url((string)($p['audio'] ?? ''));
    if ($bytes === null) return ['ok' => false, 'error' => 'bad_audio'];
    if (strlen($bytes) > WISDOM_AUDIO_MAX) return ['ok' => false, 'error' => 'audio_too_big'];
    $name = wisdom_audio_put($bytes);
    if ($name === '') return ['ok' => false, 'error' => 'bad_audio'];
    db_update('wisdom_sayings', ['audioFile' => $name, 'audioSource' => 'custom', 'voice' => '', 'updatedAt' => now_iso()],
              ['wisdomId' => $row['wisdomId']]);
    if ($row['audioFile'] !== $name) wisdom_audio_release((string)$row['audioFile']);
    audit('wisdom.voice', (string)($g['requester']['memberId'] ?? ''), (string)$row['wisdomId'], ['source' => 'custom'], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'audioUrl' => wisdom_audio_url($name)];
}

function admin_wisdom_voice_clear(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $which = (string)($p['which'] ?? 'both');
    $patch = ['updatedAt' => now_iso()]; $drop = [];
    if ($which !== 'english') { $patch += ['audioFile' => '', 'audioSource' => '', 'voice' => '']; $drop[] = (string)$row['audioFile']; }
    if ($which !== 'native')  { $patch += ['audioFileEn' => '', 'voiceEn' => '']; $drop[] = (string)($row['audioFileEn'] ?? ''); }
    /* Cleared on purpose: don't let the visitor backstop regenerate it at once. */
    $patch['ttsTriedAt'] = now_iso();
    db_update('wisdom_sayings', $patch, ['wisdomId' => $row['wisdomId']]);
    foreach ($drop as $f) wisdom_audio_release($f);
    return ['ok' => true];
}

/**
 * Clone a voice from a short recording of a real person, so every saying can
 * be read by — in effect — a native speaker the programme knows. Spitch asks
 * for 2–30 seconds of one speaker, the exact transcript, and explicit consent;
 * so does this. Consent is recorded in the audit log with who pressed it.
 */
function admin_wisdom_voice_clone(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    if (wisdom_tts_key() === '' && !isset($GLOBALS['__wisdom_http'])) return ['ok' => false, 'error' => 'tts_not_configured'];
    if (empty($p['consent'])) return ['ok' => false, 'error' => 'consent_required'];
    $name = mb_substr(trim((string)($p['name'] ?? '')), 0, 120);
    $transcript = mb_substr(trim((string)($p['transcript'] ?? '')), 0, 2000);
    $lang = (string)($p['language'] ?? '');
    if ($name === '') return ['ok' => false, 'error' => 'name_required'];
    if ($transcript === '') return ['ok' => false, 'error' => 'transcript_required'];
    if (!isset(WISDOM_LANG_CODE[$lang])) return ['ok' => false, 'error' => 'bad_language'];
    if (count(wisdom_custom_voices()) >= 20) return ['ok' => false, 'error' => 'too_many_voices'];
    $bytes = wisdom_audio_from_data_url((string)($p['audio'] ?? ''));
    if ($bytes === null) return ['ok' => false, 'error' => 'bad_audio'];
    if (strlen($bytes) > 10 * 1024 * 1024) return ['ok' => false, 'error' => 'audio_too_big'];

    if (!class_exists('CURLFile')) return ['ok' => false, 'error' => 'no_curl'];
    $ext = wisdom_audio_ext($bytes);
    $tmp = tempnam(sys_get_temp_dir(), 'wvc');
    file_put_contents($tmp, $bytes);
    try {
        $mime = ['mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'webm' => 'audio/webm'][$ext];
        $r = wisdom_spitch('POST', '/v1/voices', [
            'audio' => new CURLFile($tmp, $mime, 'reference.' . $ext),
            'transcript' => $transcript, 'name' => $name, 'consent' => 'true',
            'language' => WISDOM_LANG_CODE[$lang],
        ], true);
    } finally { @unlink($tmp); }
    $j = json_decode($r['body'], true);
    $vid = is_array($j) ? (string)($j['voice_id'] ?? '') : '';
    if (!in_array($r['code'], [200, 201], true) || !preg_match('/^[A-Za-z0-9_-]{3,80}$/', $vid)) {
        error_log('[wisdom] clone http ' . $r['code'] . ' ' . substr($r['body'], 0, 200));
        $detail = is_array($j) ? (string)($j['detail'] ?? $j['message'] ?? '') : '';
        return ['ok' => false, 'error' => 'clone_failed', 'message' => $detail !== '' ? $detail : ('The voice service answered ' . $r['code'] . '.')];
    }
    $list = wisdom_custom_voices();
    $list[] = ['voiceId' => $vid, 'name' => $name, 'language' => $lang, 'createdAt' => now_iso()];
    setting_set('wisdom.customVoices', $list, (string)($g['requester']['memberId'] ?? ''));
    audit('wisdom.voice.clone', (string)($g['requester']['memberId'] ?? ''), $vid,
          ['name' => $name, 'language' => $lang, 'consent' => true], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'voiceId' => $vid];
}

function admin_wisdom_voice_clone_delete(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $vid = (string)($p['voiceId'] ?? '');
    $list = wisdom_custom_voices();
    $keep = array_values(array_filter($list, fn($c) => ($c['voiceId'] ?? '') !== $vid));
    if (count($keep) === count($list)) return ['ok' => false, 'error' => 'not_found'];
    // Best effort at the provider; the local list is the source of truth here.
    wisdom_spitch('DELETE', '/v1/voices/' . rawurlencode($vid), null);
    setting_set('wisdom.customVoices', $keep, (string)($g['requester']['memberId'] ?? ''));
    $defs = setting_get('wisdom.voiceDefaults');
    if (is_array($defs)) setting_set('wisdom.voiceDefaults', array_filter($defs, fn($v) => $v !== $vid), (string)($g['requester']['memberId'] ?? ''));
    audit('wisdom.voice.clone.delete', (string)($g['requester']['memberId'] ?? ''), $vid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
