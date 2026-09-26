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
 * Audio. Each saying may carry ONE stored clip:
 *   · `custom` — a staff voice-over, uploaded or recorded in the browser. A
 *     native speaker reading it is the gold standard and always wins.
 *   · `tts`    — generated ONCE by the TTS provider when staff press Generate,
 *     then stored. Visitors never trigger a provider call: that would put the
 *     API key's bill in the hands of anyone with a refresh button.
 * The provider is Spitch (spitch.app), a Nigerian speech company whose voices
 * are trained on native Hausa, Igbo and Yoruba speech, including tone marks —
 * the generic cloud voices either lack these languages or read them as English.
 */

const WISDOM_LANGS = ['hausa', 'igbo', 'yoruba'];
const WISDOM_KINDS = ['riddle', 'proverb', 'quote'];
/* The Monday the rotation counts from (Lagos time). Week 0 is Hausa's first. */
const WISDOM_ANCHOR = '2026-09-21T00:00:00+01:00';
const WISDOM_AUDIO_MAX = 4 * 1024 * 1024;
const WISDOM_LANG_CODE = ['hausa' => 'ha', 'igbo' => 'ig', 'yoruba' => 'yo'];
/* Spitch's voices per language, female first. The first is the default. */
const WISDOM_VOICES = [
    'hausa'  => ['amina', 'zainab', 'aliyu', 'hasan'],
    'igbo'   => ['ngozi', 'amara', 'obinna', 'ebuka'],
    'yoruba' => ['sade', 'funmi', 'segun', 'femi'],
];

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
        'langCode' => WISDOM_LANG_CODE[(string)$r['language']] ?? '',
    ];
    if ($admin) {
        $out += ['position' => (int)($r['position'] ?? 0), 'status' => (string)($r['status'] ?? 'live'),
                 'voice' => (string)($r['voice'] ?? ''), 'updatedAt' => (string)($r['updatedAt'] ?? '')];
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
    if (db_row('SELECT id FROM wisdom_sayings WHERE audioFile = ? LIMIT 1', [$name])) return;
    $path = wisdom_audio_path($name);
    if ($path !== '' && is_file($path)) @unlink($path);
}

/* ── TTS (Spitch) ─────────────────────────────────────────────────────── */

function wisdom_tts_key(): string {
    $k = (string)($GLOBALS['CONFIG']['tts']['spitch_key'] ?? '');
    if ($k === '') $k = (string)(getenv('SPITCH_API_KEY') ?: '');
    return trim($k);
}

/** Call the provider. Returns ['ok'=>true,'bytes'=>…] or an error. */
function wisdom_tts_synth(string $text, string $lang, string $voice): array {
    $key = wisdom_tts_key();
    if ($key === '') return ['ok' => false, 'error' => 'tts_not_configured'];
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init('https://api.spitch.app/v1/speech');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['language' => WISDOM_LANG_CODE[$lang] ?? 'yo',
            'text' => $text, 'voice' => $voice, 'speed' => 0.9, 'format' => 'mp3'], JSON_UNESCAPED_UNICODE),
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code !== 200) {
        error_log('[wisdom] tts http ' . $code . ' ' . substr((string)$body, 0, 200));
        return ['ok' => false, 'error' => 'tts_failed', 'message' => 'The voice service answered ' . $code . '.'];
    }
    return ['ok' => true, 'bytes' => (string)$body];
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
    $schedule = [];
    for ($i = 0; $i < 9; $i++) {
        $r = wisdom_pick($by, $w + $i);
        if ($r) $schedule[] = ['week' => wisdom_week_monday($w + $i), 'wisdomId' => (string)$r['wisdomId'],
                               'language' => (string)$r['language'], 'text' => (string)$r['text']];
    }
    return ['ok' => true, 'sayings' => array_map(fn($r) => wisdom_shape($r, true), $rows),
            'schedule' => $schedule, 'languages' => WISDOM_LANGS, 'kinds' => WISDOM_KINDS,
            'voices' => WISDOM_VOICES, 'ttsReady' => wisdom_tts_key() !== '',
            'audioMax' => WISDOM_AUDIO_MAX];
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
        'status' => ($d['status'] ?? 'live') === 'hidden' ? 'hidden' : 'live',
        'updatedAt' => now_iso(),
    ];
    $id = (string)($d['wisdomId'] ?? '');
    $old = $id !== '' ? db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [$id]) : null;
    if ($old) {
        // A generated clip reads the old words; once the words change it is wrong.
        $stale = $old['audioSource'] === 'tts' && $old['text'] !== $text;
        if ($stale) $row += ['audioFile' => '', 'audioSource' => ''];
        if ($old['language'] !== $lang) {
            $row['position'] = wisdom_next_position($lang);
        }
        db_update('wisdom_sayings', $row, ['wisdomId' => $id]);
        if ($stale) wisdom_audio_release((string)$old['audioFile']);
    } else {
        $id = 'WS-' . strtoupper(rand_hex(5));
        $row['position'] = wisdom_next_position($lang);
        db_insert('wisdom_sayings', $row + ['wisdomId' => $id, 'createdAt' => now_iso()]);
    }
    audit('wisdom.upsert', (string)($g['requester']['memberId'] ?? ''), $id, ['language' => $lang], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'wisdomId' => $id];
}

function admin_wisdom_delete(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_exec('DELETE FROM wisdom_sayings WHERE wisdomId = ?', [$row['wisdomId']]);
    wisdom_audio_release((string)$row['audioFile']);
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

/** Generate the saying's clip with the TTS provider and store it. Refuses to
 *  overwrite a staff voice-over unless told to: a person's reading is better. */
function admin_wisdom_voice_generate(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ($row['audioSource'] === 'custom' && empty($p['replace'])) return ['ok' => false, 'error' => 'has_custom_voice'];
    $voices = WISDOM_VOICES[$row['language']] ?? [];
    $voice = in_array((string)($p['voice'] ?? ''), $voices, true) ? (string)$p['voice'] : ($voices[0] ?? '');
    $res = wisdom_tts_synth((string)$row['text'], (string)$row['language'], $voice);
    if (!$res['ok']) return $res;
    $name = wisdom_audio_put($res['bytes']);
    if ($name === '') return ['ok' => false, 'error' => 'tts_bad_audio'];
    db_update('wisdom_sayings', ['audioFile' => $name, 'audioSource' => 'tts', 'voice' => $voice, 'updatedAt' => now_iso()],
              ['wisdomId' => $row['wisdomId']]);
    if ($row['audioFile'] !== $name) wisdom_audio_release((string)$row['audioFile']);
    audit('wisdom.voice', (string)($g['requester']['memberId'] ?? ''), (string)$row['wisdomId'], ['source' => 'tts', 'voice' => $voice], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'audioUrl' => wisdom_audio_url($name)];
}

/** A staff voice-over: a data: URL from an upload or an in-browser recording. */
function admin_wisdom_voice_upload(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM wisdom_sayings WHERE wisdomId = ?', [(string)($p['wisdomId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $data = (string)($p['audio'] ?? '');
    if (!preg_match('#^data:[a-z0-9/.+-]*(;[a-z0-9=.-]+)*;base64,#i', $data, $m)) return ['ok' => false, 'error' => 'bad_audio'];
    $bytes = base64_decode(substr($data, strlen($m[0])), true);
    if ($bytes === false || $bytes === '') return ['ok' => false, 'error' => 'bad_audio'];
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
    db_update('wisdom_sayings', ['audioFile' => '', 'audioSource' => '', 'voice' => '', 'updatedAt' => now_iso()],
              ['wisdomId' => $row['wisdomId']]);
    wisdom_audio_release((string)$row['audioFile']);
    return ['ok' => true];
}
