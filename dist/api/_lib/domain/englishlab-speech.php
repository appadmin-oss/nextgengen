<?php
declare(strict_types=1);

/**
 * English Lab — speaking (owner, 6 Nov 2026: "Speaking … Articulation … a bit of Duolingo features.
 * Do not use a shitty voice please").
 *
 * WHAT THE RESEARCH SAYS, AND WHAT IT BECAME
 *   · Hearing a contrast precedes saying it: perception training with MANY VOICES (high-variability
 *     phonetic training) improves both perception and production (meta-analyses, medium effects).
 *     → "Hear the difference": a minimal pair spoken in several voices; the learner picks the word.
 *   · Articulation must be taught, not just modelled: where the tongue and lips go, voice on or off.
 *     → "How to say it" cards, and articulation questions (voiceless dental fricative …), which the
 *       senior paper asks too.
 *   · Saying it, with feedback on what came through. → "Say it": the learner hears the model, records
 *     themself, and Spitch's speech-to-text (trained on Nigerian speech, so a Nigerian accent is not
 *     marked down for being Nigerian) says which words were understood.
 *
 * THE VOICE IS NOT THE BROWSER'S. Spitch (the provider Quote of the Week already uses, domain/wisdom.php)
 * reads in Nigerian-English voices; each clip is generated ONCE and kept (wisdom_tts_clip()), so a
 * sentence costs one provider call ever. Only text in this file can be voiced — a member cannot make
 * the platform spend credit on arbitrary text. Several voices are used on purpose (variability).
 * Without a key the client falls back to the device's best NATURAL voice (never a robotic default).
 */

/** Spitch's English voices used for the Lab, in turn. Several talkers is the point (HVPT). */
const ENG_VOICES = ['lucy', 'kingsley', 'remi', 'john'];
/** The largest recording "Say it" accepts (a sentence is a few seconds). */
const ENG_LISTEN_MAX = 1500000;

/**
 * Per topic: 'how' => [[sound, how to make it, example word]], 'pairs' => [[word, word]] (a minimal
 * pair: the words differ in one sound), 'say' => [sentences to say]. Append-only within each list.
 */
function eng_speak(): array {
    return [
    'EN-014' => ['say' => ['You are coming, aren’t you?', 'She can swim, can’t she?', 'Let’s go home, shall we?', 'They didn’t call, did they?']],
    'EN-021' => [
        'how' => [['/iː/', 'Long. Spread your lips as if smiling, tongue high at the front. Hold the sound.', 'seat'],
                  ['/ɪ/', 'Short and relaxed. Lips loose, tongue a little lower and further back. Say it quickly.', 'sit'],
                  ['/uː/', 'Long. Round your lips tightly and push them forward.', 'pool'],
                  ['/ʊ/', 'Short. Lips only loosely rounded. Quick.', 'pull']],
        'pairs' => [['seat', 'sit'], ['sheep', 'ship'], ['leave', 'live'], ['feet', 'fit'], ['pool', 'pull'], ['fool', 'full']],
        'say' => ['Please sit on this seat.', 'The sheep are on the ship.', 'Do not leave; live here with us.'],
    ],
    'EN-022' => [
        'how' => [['/eɪ/', 'Start at /e/ and glide up towards /ɪ/. Two parts, one sound.', 'late'],
                  ['/aɪ/', 'Start with an open mouth and glide up towards /ɪ/.', 'time'],
                  ['/əʊ/', 'Start neutral and glide to rounded lips.', 'go']],
        'pairs' => [['late', 'let'], ['main', 'men'], ['coat', 'cot'], ['road', 'rod'], ['fail', 'fell']],
        'say' => ['The late train came again.', 'I like to fly my kite at night.', 'Go home and close the window.'],
    ],
    'EN-023' => [
        'how' => [['/θ/', 'Put the tip of your tongue lightly between your teeth and blow. Voice OFF: your throat does not buzz.', 'thin'],
                  ['/ð/', 'The same tongue position, voice ON: feel your throat buzz.', 'this'],
                  ['/t/', 'Tongue tip behind the top teeth (not between them): stop the air, then let it go.', 'tin'],
                  ['/d/', 'Like /t/, but with your voice on.', 'day']],
        'pairs' => [['thin', 'tin'], ['three', 'tree'], ['thank', 'tank'], ['they', 'day'], ['those', 'dose'], ['bath', 'bat']],
        'say' => ['I think these three things are mine.', 'Thank you for the thick bread.', 'This is their mother.'],
    ],
    'EN-024' => [
        'how' => [['/ʃ/', 'Push your lips forward, tongue near the roof of your mouth, and let out a steady hiss. Voice off.', 'ship'],
                  ['/tʃ/', 'Start like /t/, then release it into /ʃ/ — one quick sound.', 'chip'],
                  ['/dʒ/', '/tʃ/ with your voice on.', 'jeep'],
                  ['/ʒ/', '/ʃ/ with your voice on: a buzzing hiss.', 'measure']],
        'pairs' => [['ship', 'chip'], ['sheep', 'cheap'], ['shoe', 'chew'], ['share', 'chair'], ['jeep', 'cheap']],
        'say' => ['She sells fresh fish in the shop.', 'Choose a cheap chair for the church.', 'Usually we measure the treasure.'],
    ],
    'EN-025' => [
        'how' => [['kn-', 'The k is silent: start straight on /n/.', 'knife'], ['wr-', 'The w is silent: start on /r/.', 'write'], ['-mb', 'The b is silent: end on /m/.', 'thumb']],
        'say' => ['I know the knight wrote a letter.', 'Listen to the whistle at the castle.', 'An honest man waited an hour.'],
    ],
    'EN-026' => [
        'how' => [['stress', 'A stressed syllable is LOUDER, LONGER and HIGHER. The others go quick and light.', 'photograph']],
        'say' => ['Information is important.', 'My photographer took a photograph.', 'Education begins at home.'],
    ],
    'EN-027' => [
        'how' => [['noun', 'Most two-syllable nouns: stress the first part — a RE-cord, an EX-port.', 'record'], ['verb', 'The verb: stress the second part — to re-CORD, to ex-PORT.', 'export']],
        'say' => ['Please record the record for us.', 'We export cocoa; cocoa is our export.', 'The students will protest; the protest is today.'],
    ],
    'EN-028' => ['say' => ['The cat sat on the mat.', 'Late at night, the kite took flight.', 'Through the blue sky flew a bird.']],
    'EN-030' => [
        'how' => [['rise', 'Yes/no questions usually go UP at the end.', 'Are you coming?'], ['fall', 'Wh- questions and statements usually go DOWN at the end.', 'Where are you going?']],
        'say' => ['Are you coming?', 'Where are you going?', 'It’s a lovely day, isn’t it?'],
    ],
    'EN-075' => ['say' => ['Strength comes from practice.', 'Our school examination starts tomorrow.', 'The queen laughed at the phone.']],
    'EN-076' => [
        'how' => [['clusters', 'Say every consonant, and put NO vowel between them: “street”, not “sitrit”.', 'street']],
        'say' => ['The street is straight and strong.', 'She asked for the texts next month.', 'Six splendid splashes.'],
    ],
    ];
}

/* ── The recorded voice (owner, 6 Nov 2026: "free, dependable, professional and articulate") ──────
 * Every clip is RECORDED ONCE, in development, with Kokoro — an open-weights neural voice (Apache-2.0)
 * whose British voices read the model taught in Nigerian schools — and committed as a static file
 * under assets/audio/english/. The host only serves files: free, the same voice on every phone, no
 * provider to fail at the moment a child presses play. tools/english-voices.py records whatever is
 * missing; a test fails if any speaking text has no recording.
 *
 * The four voices are two women and two men: the ear is trained on several talkers (HVPT). Minimal-
 * pair words get all four; sentences and examples the first two. */
const ENG_KOKORO_VOICES = ['bf_emma', 'bm_george', 'bf_isabella', 'bm_lewis'];

/**
 * Where the voice's own reading would be wrong, the exact phonemes to read instead. Its automatic
 * transcription cannot tell the verb "record" from the noun, and a stress lesson must not model it
 * wrong; "photograph" is given the southern British /ɑː/.
 */
const ENG_SAY_PHONEMES = [
    'Please record the record for us.' => 'plˈiːz ɹɪkˈɔːd ðə ɹˈɛkɔːd fɔːɹ ˌʌs.',
    'My photographer took a photograph.' => 'maɪ fətˈɒɡɹəfə tˈʊk ɐ fˈəʊtəɡɹˌɑːf.',
];

/** The recording's file name: a hash of exactly what it says, so a changed sentence is a new recording. */
function eng_audio_name(string $text, string $voice): string {
    return substr(sha1($text . "\x1F" . (ENG_SAY_PHONEMES[$text] ?? '')), 0, 12) . '-' . $voice . '.mp3';
}

/** What to record: [text, voices, phonemes or ''] for every speaking text. Read by tools/english-voices.py. */
function eng_audio_jobs(): array {
    $pairWords = [];
    foreach (eng_speak() as $x) foreach ($x['pairs'] ?? [] as $pr) foreach ($pr as $w) $pairWords[$w] = true;
    $out = [];
    foreach (array_keys(eng_speak_texts()) as $t) {
        $out[] = [$t, isset($pairWords[$t]) ? ENG_KOKORO_VOICES : array_slice(ENG_KOKORO_VOICES, 0, 2), ENG_SAY_PHONEMES[$t] ?? ''];
    }
    return $out;
}

/** text => [url per recorded voice] for the texts of one topic's speaking material (only files that exist). */
function eng_audio_urls(array $speak): array {
    $dir = dirname(__DIR__, 3) . '/assets/audio/english/';
    $texts = array_merge($speak['say'] ?? [], array_column($speak['how'] ?? [], 2));
    foreach ($speak['pairs'] ?? [] as $pr) foreach ($pr as $w) $texts[] = $w;
    $out = [];
    foreach (array_unique($texts) as $t) {
        foreach (ENG_KOKORO_VOICES as $v) if (is_file($dir . eng_audio_name($t, $v))) $out[$t][] = '/assets/audio/english/' . eng_audio_name($t, $v);
    }
    return $out;
}

/** Every text the Lab may voice: the allow-list for mlb_voice(). */
function eng_speak_texts(): array {
    static $t = null;
    if ($t !== null) return $t;
    $t = [];
    foreach (eng_speak() as $s) {
        foreach ($s['say'] ?? [] as $x) $t[$x] = true;
        foreach ($s['pairs'] ?? [] as $pr) foreach ($pr as $x) $t[$x] = true;
        foreach ($s['how'] ?? [] as $h) $t[$h[2]] = true;
    }
    return $t;
}

/**
 * mathslab.voice — the clip for one allowed text, in one of the Lab's voices. Generated once, kept for
 * ever (wisdom_tts_clip). Refuses text that is not the Lab's own; says plainly when no voice is set up,
 * so the client can fall back to the device's natural voice.
 */
function mlb_voice(array $p): array {
    $text = trim((string)($p['text'] ?? ''));
    if (!isset(eng_speak_texts()[$text])) return ['ok' => false, 'error' => 'not_lab_text'];
    if (!function_exists('wisdom_tts_key') || wisdom_tts_key() === '') return ['ok' => false, 'error' => 'tts_not_configured'];
    $voice = ENG_VOICES[((int)($p['voice'] ?? 0) % count(ENG_VOICES) + count(ENG_VOICES)) % count(ENG_VOICES)];
    $c = wisdom_tts_clip($text, 'english', $voice);
    if (empty($c['ok'])) return ['ok' => false, 'error' => (string)($c['error'] ?? 'tts_failed')];
    return ['ok' => true, 'url' => wisdom_audio_url((string)$c['file']), 'voice' => $voice];
}

/**
 * Word by word: which words of the target were understood. A longest-common-subsequence alignment of
 * the normalised words, so one missed word does not mark every later word wrong.
 *
 * @return list<array{w:string, ok:bool}>
 */
function eng_word_match(string $target, string $heard): array {
    $norm = static fn(string $s) => array_values(array_filter(preg_split('/\s+/u', trim((string)preg_replace('/[^\p{L}\p{N}\s]+/u', '', mb_strtolower(str_replace(['’', "'"], '', $s))))) ?: [], 'strlen'));
    $shown = preg_split('/\s+/u', trim($target)) ?: [];
    $a = $norm($target); $b = $norm($heard);
    $n = count($a); $m = count($b);
    $L = array_fill(0, $n + 1, array_fill(0, $m + 1, 0));
    for ($i = $n - 1; $i >= 0; $i--) for ($j = $m - 1; $j >= 0; $j--) $L[$i][$j] = $a[$i] === $b[$j] ? $L[$i + 1][$j + 1] + 1 : max($L[$i + 1][$j], $L[$i][$j + 1]);
    $ok = array_fill(0, $n, false);
    for ($i = 0, $j = 0; $i < $n && $j < $m;) {
        if ($a[$i] === $b[$j]) { $ok[$i] = true; $i++; $j++; }
        elseif ($L[$i + 1][$j] >= $L[$i][$j + 1]) $i++; else $j++;
    }
    $out = [];
    foreach ($shown as $k => $w) $out[] = ['w' => $w, 'ok' => $ok[$k] ?? false];
    return $out;
}

/**
 * mathslab.listen — "Say it": transcribe the learner's recording with Spitch (trained on Nigerian
 * speech) and report, word by word, what came through. Nothing is stored. The target sentence is
 * looked up from the topic, never taken from the client.
 */
function mlb_listen(array $p): array {
    $comp = (string)($p['comp'] ?? ''); $i = (int)($p['index'] ?? -1);
    $target = eng_speak()[$comp]['say'][$i] ?? null;
    if ($target === null) return ['ok' => false, 'error' => 'not_found'];
    if (!function_exists('wisdom_tts_key') || wisdom_tts_key() === '') return ['ok' => false, 'error' => 'stt_not_configured'];
    $b64 = (string)($p['audio'] ?? '');
    $bytes = base64_decode(preg_replace('/^data:[^,]*,/', '', $b64), true);
    if ($bytes === false || $bytes === '') return ['ok' => false, 'error' => 'no_audio'];
    if (strlen($bytes) > ENG_LISTEN_MAX) return ['ok' => false, 'error' => 'too_long'];
    $mime = (string)($p['mime'] ?? 'audio/webm');
    $ext = str_contains($mime, 'mp4') ? 'm4a' : (str_contains($mime, 'ogg') ? 'ogg' : (str_contains($mime, 'wav') ? 'wav' : 'webm'));
    $tmp = tempnam(sys_get_temp_dir(), 'eng');
    file_put_contents($tmp, $bytes);
    try {
        $r = wisdom_spitch('POST', '/v1/transcriptions', ['content' => class_exists('CURLFile') ? new CURLFile($tmp, preg_replace('/;.*$/', '', $mime), 'say.' . $ext) : $tmp, 'language' => 'en'], true);
    } finally { @unlink($tmp); }
    $j = ($r['code'] ?? 0) === 200 ? json_decode((string)$r['body'], true) : null;
    if (!is_array($j) || !isset($j['text'])) return ['ok' => false, 'error' => 'stt_failed'];
    $heard = mb_substr((string)$j['text'], 0, 400);
    $words = eng_word_match($target, $heard);
    $got = count(array_filter($words, static fn($w) => $w['ok']));
    return ['ok' => true, 'heard' => $heard, 'words' => $words, 'score' => count($words) ? round($got / count($words), 2) : 0.0];
}

/* ── Articulation questions: how a consonant is made ───────────────────────────────────────── */

/** The consonants of the British model: [symbol, voicing, place, manner, example word]. */
function eng_consonants(): array {
    return [
        ['/p/', 'voiceless', 'bilabial', 'plosive', 'pen'], ['/b/', 'voiced', 'bilabial', 'plosive', 'bed'],
        ['/t/', 'voiceless', 'alveolar', 'plosive', 'tea'], ['/d/', 'voiced', 'alveolar', 'plosive', 'day'],
        ['/k/', 'voiceless', 'velar', 'plosive', 'cat'], ['/g/', 'voiced', 'velar', 'plosive', 'go'],
        ['/f/', 'voiceless', 'labiodental', 'fricative', 'fan'], ['/v/', 'voiced', 'labiodental', 'fricative', 'van'],
        ['/θ/', 'voiceless', 'dental', 'fricative', 'thin'], ['/ð/', 'voiced', 'dental', 'fricative', 'this'],
        ['/s/', 'voiceless', 'alveolar', 'fricative', 'sun'], ['/z/', 'voiced', 'alveolar', 'fricative', 'zoo'],
        ['/ʃ/', 'voiceless', 'palato-alveolar', 'fricative', 'ship'], ['/ʒ/', 'voiced', 'palato-alveolar', 'fricative', 'measure'],
        ['/tʃ/', 'voiceless', 'palato-alveolar', 'affricate', 'chip'], ['/dʒ/', 'voiced', 'palato-alveolar', 'affricate', 'jam'],
    ];
}

/**
 * Two articulation forms, built from the table. Each wrong option changes ONE feature — the voicing,
 * the place or the manner — and says which, so the feedback names the exact confusion.
 */
function eng_articulation_forms(): array {
    $flip = static fn(string $v) => $v === 'voiced' ? 'voiceless' : 'voiced';
    $places = ['bilabial', 'labiodental', 'dental', 'alveolar', 'palato-alveolar', 'velar'];
    $manners = ['plosive', 'fricative', 'affricate'];
    $describe = static fn(array $c) => $c[1] . ' ' . $c[2] . ' ' . $c[3];
    $wrongs = static function (MlbRng $r, array $c) use ($flip, $places, $manners): array {
        $pl = $r->pick(array_values(array_diff($places, [$c[2]])));
        $mn = $r->pick(array_values(array_diff($manners, [$c[3]])));
        return [[$flip($c[1]) . ' ' . $c[2] . ' ' . $c[3], 'The voicing is wrong: put a hand on your throat — does ' . $c[0] . ' buzz?'],
                [$c[1] . ' ' . $pl . ' ' . $c[3], 'The place is wrong: where do the tongue and lips meet for ' . $c[0] . '?'],
                [$c[1] . ' ' . $c[2] . ' ' . $mn, 'The manner is wrong: is the air stopped (plosive), squeezed (fricative), or stopped then squeezed (affricate)?']];
    };
    $how = [
        eng_derive(eng_consonants(), static function (MlbRng $r, array $c) use ($describe, $wrongs): array {
            return mlb_mcq($r, 'How is the first sound of “' . $c[4] . '”, ' . $c[0] . ', made?', $describe($c), $wrongs($r, $c),
                [$c[0] . ' is a ' . $describe($c) . ' consonant: voice ' . ($c[1] === 'voiced' ? 'on' : 'off') . ', made at the ' . $c[2] . ' position, and the air is ' . ['plosive' => 'stopped and released', 'fricative' => 'squeezed through a narrow gap', 'affricate' => 'stopped, then released through a narrow gap'][$c[3]] . '.'],
                'Three questions: voice on or off? Where? How does the air get out?', 'concept', 40);
        }),
        eng_derive(eng_consonants(), static function (MlbRng $r, array $c) use ($describe, $wrongs): array {
            $others = array_values(array_filter(eng_consonants(), static fn($o) => $o[0] !== $c[0] && ($o[1] === $c[1]) + ($o[2] === $c[2]) + ($o[3] === $c[3]) === 2));
            $w = array_map(static fn($o) => [$o[0], 'That is the ' . $o[1] . ' ' . $o[2] . ' ' . $o[3] . ': one feature differs.'], array_slice($r->shuffle($others), 0, 3));
            if (count($w) < 2) $w[] = ['/h/', 'That is the voiceless glottal fricative.'];
            return mlb_mcq($r, 'Which sound is the ' . $describe($c) . '?', $c[0], $w,
                ['The ' . $describe($c) . ' is ' . $c[0] . ', as in “' . $c[4] . '”.'], 'Build it: voice, then place, then manner.', 'concept', 40);
        }),
    ];
    // Appended to the topics they deepen (append-only: after each topic's existing forms).
    return ['EN-023' => $how, 'EN-024' => $how];
}
