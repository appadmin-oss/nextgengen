<?php
declare(strict_types=1);

/**
 * AI layer — free-tier providers (Groq / Google Gemini) behind named,
 * per-purpose PROFILES so one leaked or exhausted key degrades one feature,
 * not all of them. Entirely opt-in: with no key configured callers fall back
 * to deterministic behaviour. Provider hosts are fixed constants (no SSRF).
 *
 * Pro allocation (config.php):
 *   'ai' => [
 *     // Legacy single-key block — still honoured as the 'default' profile:
 *     'provider'       => 'groq',
 *     'groq_api_key'   => '…', 'groq_model'   => 'llama-3.1-8b-instant',
 *     'gemini_api_key' => '…', 'gemini_model' => 'gemini-1.5-flash',
 *
 *     // Per-purpose profiles. Each has its own provider + key (+ optional
 *     // fallback). A missing profile falls back to the default block above.
 *     'profiles' => [
 *       'coach'      => ['provider' => 'gemini', 'api_key' => '…', 'model' => 'gemini-1.5-flash',
 *                        'fallback' => ['provider' => 'groq', 'api_key' => '…', 'model' => 'llama-3.1-8b-instant']],
 *       'behaviour'  => ['provider' => 'groq',   'api_key' => '…', 'model' => 'llama-3.1-8b-instant',
 *                        'fallback' => ['provider' => 'gemini', 'api_key' => '…', 'model' => 'gemini-1.5-flash']],
 *       'analysis'   => ['provider' => 'gemini', 'api_key' => '…', 'model' => 'gemini-1.5-flash'],
 *       'moderation' => ['provider' => 'groq',   'api_key' => '…', 'model' => 'llama-3.1-8b-instant'],
 *     ],
 *   ]
 */

/* Every provider a profile may name. Fixed constants with fixed https hosts —
 * a profile supplies a KEY and a MODEL, never a URL, so no configuration change
 * can point this at an arbitrary server.
 *
 * openrouter is the one that scales: a single key reaches hundreds of models
 * from every major lab, so adding a model is a config line rather than a
 * deploy. anthropic is direct because a programme paying for it should not be
 * paying a proxy margin too. */
const AI_PROVIDERS = ['groq', 'gemini', 'anthropic', 'openrouter'];
const AI_DEFAULT_MODEL = [
    'groq'       => 'llama-3.1-8b-instant',
    'gemini'     => 'gemini-1.5-flash',
    'anthropic'  => 'claude-haiku-4-5-20251001',
    'openrouter' => 'meta-llama/llama-3.1-8b-instruct',
];

function ai_config(): array {
    $cfg = $GLOBALS['CONFIG']['ai'] ?? null;
    return is_array($cfg) ? $cfg : [];
}

/** Legacy default-profile candidates derived from the flat key block. */
function ai_default_candidates(): array {
    $c = ai_config();
    $out = [];
    $pref = strtolower((string)($c['provider'] ?? ''));
    /* Every provider the flat block can name, preference first and the rest as
     * fallbacks. It used to know only two, so a deployment that set an Anthropic
     * or OpenRouter key here and nothing else read as "AI disabled" — with no
     * message saying so, because a missing key is a legitimate state. */
    $byName = [];
    foreach (AI_PROVIDERS as $prov) {
        $key = (string)($c[$prov . '_api_key'] ?? '');
        if ($key === '') continue;
        $byName[$prov] = ['provider' => $prov, 'api_key' => $key,
                          'model' => (string)($c[$prov . '_model'] ?? AI_DEFAULT_MODEL[$prov])];
    }
    if ($pref !== '' && isset($byName[$pref])) { $out[] = $byName[$pref]; unset($byName[$pref]); }
    foreach ($byName as $p) $out[] = $p;
    return $out;
}

/**
 * Resolve a profile to an ordered list of provider candidates:
 * profile → its fallback → the default block. Invalid entries are skipped.
 */
function ai_profile_candidates(string $profile = 'default'): array {
    $c = ai_config();
    $out = [];
    $push = function ($p) use (&$out) {
        if (is_array($p) && !empty($p['api_key']) && in_array(($p['provider'] ?? ''), AI_PROVIDERS, true)) {
            $out[] = [
                'provider' => (string)$p['provider'],
                'api_key' => (string)$p['api_key'],
                'model' => (string)($p['model'] ?? (AI_DEFAULT_MODEL[$p['provider']] ?? '')),
            ];
        }
    };
    // Keys entered on screen (Settings → Photo framing) come first for their profiles.
    if (function_exists('ai_ui_candidates')) foreach (ai_ui_candidates($profile) as $p) $push($p);
    if ($profile !== 'default') {
        $prof = $c['profiles'][$profile] ?? null;
        if (is_array($prof)) { $push($prof); $push($prof['fallback'] ?? null); }
    }
    foreach (ai_default_candidates() as $p) $out[] = $p;
    if (in_array($profile, AI_CAPABLE_ONLY_PROFILES, true)) {
        $out = array_values(array_filter($out, static fn($p) => ai_model_is_capable((string)$p['model'])));
    }
    // De-dup identical provider+key+model entries while preserving order.
    $seen = []; $uniq = [];
    foreach ($out as $p) {
        $k = $p['provider'] . '|' . $p['api_key'] . '|' . $p['model'];
        if (isset($seen[$k])) continue;
        $seen[$k] = true; $uniq[] = $p;
    }
    return $uniq;
}

/* Profiles that may only run on a CAPABLE model. Marking a child's open answer
 * is a judgement that lands on their record, so it is never handed to a small,
 * fast model — and that includes every provider's default here (an 8B Llama,
 * Flash, Haiku). The profile, its fallback and the default block are all
 * considered, filtered to capable models; with none, the profile is off and
 * the answer waits for a person. */
const AI_CAPABLE_ONLY_PROFILES = ['marking'];
/** Name parts that mark a small, fast tier — matched as whole tokens, so
 *  "gemini" is not "mini" and "70b" is not "7b". */
const AI_LIGHT_MODEL_TOKENS = ['haiku', 'flash', 'gemma', 'instant', 'nano', 'tiny', 'mini', 'lite', 'small', 'micro'];

/** Is this model one we trust with a judgement? Small and fast tiers are not,
 *  nor any open model under 30B parameters. */
function ai_model_is_capable(string $model): bool {
    $m = strtolower(trim($model));
    if ($m === '') return false;
    foreach (preg_split('/[\/\-_.:@\s]+/', $m) as $tok) {
        if (in_array($tok, AI_LIGHT_MODEL_TOKENS, true)) return false;
        if (preg_match('/^(\d+(?:\.\d+)?)b$/', $tok, $x) && (float)$x[1] < 30) return false;
    }
    return true;
}

function ai_enabled(string $profile = 'default'): bool {
    return count(ai_profile_candidates($profile)) > 0;
}

/** Which provider would answer first for a profile (for status displays). */
function ai_provider(string $profile = 'default'): string {
    $c = ai_profile_candidates($profile);
    return $c ? $c[0]['provider'] : '';
}

/** POST to a fixed, https-only provider endpoint. */
function ai_http_post(string $url, string $body, array $headers): array {
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        CURLOPT_REDIR_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
    ]);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($out === false) return ['ok' => false, 'error' => 'ai_network', 'detail' => $err];
    if ($code < 200 || $code >= 300) return ['ok' => false, 'error' => 'ai_http_' . $code];
    return ['ok' => true, 'body' => (string)$out];
}

/** One call against one concrete provider candidate. $turns: [{role,text}]. */
function ai_call_candidate(array $cand, string $system, array $turns, int $maxTokens, float $temp): array {
    /* Anthropic. Its own shape: the system prompt is a top-level field rather
     * than a message, and the reply is a content BLOCK LIST — taking
     * choices[0].message.content off it would silently return nothing. */
    if ($cand['provider'] === 'anthropic') {
        $msgs = [];
        foreach ($turns as $t) $msgs[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'assistant' : 'user'), 'content' => (string)($t['text'] ?? '')];
        if (!$msgs) $msgs[] = ['role' => 'user', 'content' => ''];
        $body = json_encode(['model' => $cand['model'], 'max_tokens' => $maxTokens, 'temperature' => $temp,
                             'system' => $system, 'messages' => $msgs], JSON_UNESCAPED_SLASHES);
        $r = ai_http_post('https://api.anthropic.com/v1/messages', $body, [
            'x-api-key: ' . $cand['api_key'], 'anthropic-version: 2023-06-01', 'Content-Type: application/json',
        ]);
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = '';
        foreach ((array)($j['content'] ?? []) as $blk) {
            if (($blk['type'] ?? '') === 'text') $text .= (string)($blk['text'] ?? '');
        }
        return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'anthropic'] : ['ok' => false, 'error' => 'ai_empty'];
    }

    /* OpenRouter — OpenAI-shaped, and the reason "and much more" needs no
     * further code: one key reaches hundreds of models from every major lab,
     * so a new model is a config change rather than a deploy. The two extra
     * headers are its attribution convention, not authentication. */
    if ($cand['provider'] === 'openrouter') {
        $msgs = [['role' => 'system', 'content' => $system]];
        foreach ($turns as $t) $msgs[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'assistant' : 'user'), 'content' => (string)($t['text'] ?? '')];
        $body = json_encode(['model' => $cand['model'], 'max_tokens' => $maxTokens, 'temperature' => $temp, 'messages' => $msgs], JSON_UNESCAPED_SLASHES);
        $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
        $r = ai_http_post('https://openrouter.ai/api/v1/chat/completions', $body, array_filter([
            'Authorization: Bearer ' . $cand['api_key'], 'Content-Type: application/json',
            $origin !== '' ? 'HTTP-Referer: ' . $origin : null,
            'X-Title: Next Generation Genius',
        ]));
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = $j['choices'][0]['message']['content'] ?? '';
        return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'openrouter'] : ['ok' => false, 'error' => 'ai_empty'];
    }

    if ($cand['provider'] === 'groq') {
        $msgs = [['role' => 'system', 'content' => $system]];
        foreach ($turns as $t) $msgs[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'assistant' : 'user'), 'content' => (string)($t['text'] ?? '')];
        $body = json_encode(['model' => $cand['model'], 'max_tokens' => $maxTokens, 'temperature' => $temp, 'messages' => $msgs], JSON_UNESCAPED_SLASHES);
        $r = ai_http_post('https://api.groq.com/openai/v1/chat/completions', $body, [
            'Authorization: Bearer ' . $cand['api_key'], 'Content-Type: application/json',
        ]);
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = $j['choices'][0]['message']['content'] ?? '';
        return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'groq'] : ['ok' => false, 'error' => 'ai_empty'];
    }

    // Gemini
    $contents = [];
    foreach ($turns as $t) $contents[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'model' : 'user'), 'parts' => [['text' => (string)($t['text'] ?? '')]]];
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($cand['model']) . ':generateContent';
    $body = json_encode([
        'systemInstruction' => ['parts' => [['text' => $system]]],
        'contents' => $contents,
        'generationConfig' => ['maxOutputTokens' => $maxTokens, 'temperature' => $temp],
    ], JSON_UNESCAPED_SLASHES);
    $r = ai_http_post($url, $body, ['Content-Type: application/json', 'x-goog-api-key: ' . $cand['api_key']]);
    if (!$r['ok']) return $r;
    $j = json_decode($r['body'], true);
    $text = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
    return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'gemini'] : ['ok' => false, 'error' => 'ai_empty'];
}

/** Walk the profile's candidate chain until one answers. Never throws.
 *
 *  Test seam: $GLOBALS['__ai_mock'] — fn($profile, $system, $turns) => result.
 *  Multi-model orchestration cannot be verified against live providers (cost,
 *  network, and answers that differ every run), and the parts worth testing —
 *  which lens got which provider, what survives synthesis, what happens when one
 *  provider is down — are all above the HTTP call. Mirrors the __ai_photo_mock
 *  seam that already exists for the photo pipeline. */
function ai_run(string $profile, string $system, array $turns, int $maxTokens, float $temp): array {
    if (isset($GLOBALS['__ai_mock']) && is_callable($GLOBALS['__ai_mock'])) {
        return ($GLOBALS['__ai_mock'])($profile, $system, $turns);
    }
    $cands = ai_profile_candidates($profile);
    if (!$cands) return ['ok' => false, 'error' => 'ai_disabled'];
    $last = ['ok' => false, 'error' => 'ai_disabled'];
    foreach ($cands as $cand) {
        $r = ai_call_candidate($cand, $system, $turns, $maxTokens, $temp);
        if (!empty($r['ok'])) return $r;
        $last = $r;
    }
    return $last;
}

/**
 * Single-shot completion. Returns ['ok'=>true,'text'=>…,'provider'=>…] or
 * ['ok'=>false,'error'=>…]. Never throws.
 */
function ai_complete(string $system, string $user, int $maxTokens = 400, string $profile = 'default'): array {
    return ai_run($profile, $system, [['role' => 'me', 'text' => $user]], $maxTokens, 0.4);
}

/**
 * Multi-turn chat. $turns is [{role:'me'|'coach', text}, …] in order. Same
 * shape/return as ai_complete; used by the Reflection Coach.
 */
function ai_chat(string $system, array $turns, int $maxTokens = 220, string $profile = 'default'): array {
    return ai_run($profile, $system, $turns, $maxTokens, 0.6);
}

/**
 * Classification helper — asks for strict JSON and parses it. Returns
 * ['ok'=>true,'data'=>array] or ['ok'=>false,…]. Used by the behaviour
 * monitor and registration analysis; callers must handle 'ok'=false with a
 * deterministic fallback.
 */
function ai_classify(string $instructions, string $input, int $maxTokens = 300, string $profile = 'behaviour'): array {
    $system = $instructions . "\nRespond with ONLY a single JSON object — no prose, no markdown fences.";
    $r = ai_run($profile, $system, [['role' => 'me', 'text' => $input]], $maxTokens, 0.1);
    if (empty($r['ok'])) return $r;
    $text = trim((string)$r['text']);
    // Tolerate accidental fences or leading text around the JSON object.
    if (preg_match('/\{.*\}/s', $text, $m)) $text = $m[0];
    $data = json_decode($text, true);
    if (!is_array($data)) return ['ok' => false, 'error' => 'ai_bad_json'];
    return ['ok' => true, 'data' => $data, 'provider' => $r['provider']];
}

/** Fetch an https image and inline it as base64 for a vision request. */
function ai_fetch_image(string $url): array {
    if (!preg_match('#^https://#', $url)) return ['ok' => false, 'error' => 'bad_url'];
    /* Only where our photographs live: Cloudinary, and this site. Any other
       host — and any redirect — would let a submitted URL make this server
       fetch from inside its own network. */
    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    $own = strtolower((string)parse_url((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), PHP_URL_HOST));
    if ($host !== 'res.cloudinary.com' && ($own === '' || $host !== $own)) return ['ok' => false, 'error' => 'bad_host'];
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
    ]);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $mime = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    if ($out === false || $code < 200 || $code >= 300) return ['ok' => false, 'error' => 'image_http_' . $code];
    if (strlen($out) > 8 * 1024 * 1024) return ['ok' => false, 'error' => 'image_too_large'];
    return ['ok' => true, 'mime' => explode(';', $mime)[0] ?: 'image/jpeg', 'b64' => base64_encode($out)];
}

/**
 * Vision photo review — the FREE analysis half of the photo pipeline. It
 * *points out problems* in a headshot so Cloudinary's (credit-costed) editing
 * has a clear, minimal job. Uses a vision-capable Gemini candidate from the
 * 'photo' profile. Never throws — on any failure the caller routes the photo
 * to human review. Returns ['ok'=>true,'data'=>{score,issues[],flags[],
 * recommend{}},'provider'] or ['ok'=>false,'error'].
 * Test seam: $GLOBALS['__ai_photo_mock'].
 */
function ai_photo_review(string $imageUrl): array {
    if (isset($GLOBALS['__ai_photo_mock']) && is_callable($GLOBALS['__ai_photo_mock'])) {
        return ($GLOBALS['__ai_photo_mock'])($imageUrl);
    }
    $cand = null;
    foreach (ai_profile_candidates('photo') as $c) { if ($c['provider'] === 'gemini') { $cand = $c; break; } }
    if (!$cand) return ['ok' => false, 'error' => 'no_vision_provider'];
    $img = ai_fetch_image($imageUrl);
    if (empty($img['ok'])) return $img;
    $system = 'You are a passport-photo quality inspector for a children\'s program ID card. '
        . 'You ONLY inspect and report problems — you never edit the photo, and downstream enhancement never alters the person. '
        . 'Assess the single headshot and reply with ONLY a JSON object: '
        . '{"score":0-100,"issues":["short strings"],"flags":["..."],"recommend":{"crop":true,"brighten":false,"sharpen":false,"removeBackground":false}}. '
        . 'flags may include any of: no_face, multiple_faces, not_a_child_headshot, inappropriate, too_dark, too_blurry, low_resolution, busy_background. '
        . 'Flag genuinely unusable photos (heavy blur, very low resolution) so a human requests a fresh capture — do not assume detail can be reconstructed. '
        . 'score is overall usability for a printed ID (100 = perfect).';
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($cand['model']) . ':generateContent';
    $body = json_encode([
        'systemInstruction' => ['parts' => [['text' => $system]]],
        'contents' => [['role' => 'user', 'parts' => [
            ['inline_data' => ['mime_type' => $img['mime'], 'data' => $img['b64']]],
            ['text' => 'Inspect this headshot for use on a printed ID card.'],
        ]]],
        'generationConfig' => ['maxOutputTokens' => 320, 'temperature' => 0.1],
    ], JSON_UNESCAPED_SLASHES);
    $r = ai_http_post($url, $body, ['Content-Type: application/json', 'x-goog-api-key: ' . $cand['api_key']]);
    if (!$r['ok']) return $r;
    $j = json_decode($r['body'], true);
    $text = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (preg_match('/\{.*\}/s', $text, $m)) $text = $m[0];
    $data = json_decode($text, true);
    if (!is_array($data)) return ['ok' => false, 'error' => 'ai_bad_json'];
    return ['ok' => true, 'data' => $data, 'provider' => 'gemini'];
}

/* ── Is the AI actually on? ──────────────────────────────────────────────────
 * Every AI feature here degrades to a deterministic rules path when no key is
 * configured, which is the right behaviour and a genuinely invisible one: the
 * behaviour monitor keeps classifying, the moderation queue keeps deciding,
 * and nothing anywhere says the intelligent half is switched off. An operator
 * can run for months believing observations are being read by a model when
 * they are being pattern-matched on a word list.
 *
 * This reports, per profile, whether a provider would answer and which one —
 * and can send one real request to prove the key works rather than merely
 * being present. A key that is set but rejected looks identical to a working
 * one from the config alone, and that is exactly the failure worth catching.
 *
 * Never returns the key, or any part of it.
 */
/* Per profile: what it does, and — the part an operator acts on — what happens
 * when no provider answers. Most features here degrade to a deterministic rules
 * path and keep working. The Analyst (the insight_* profiles) does NOT: it has
 * no rules fallback and simply becomes unavailable, so `ai_disabled` on the
 * board and a silent word-list on the moderation queue are genuinely different
 * failures and must not read the same on this screen. */
const AI_RULES_FALLBACK = 'Falls back to fixed rules — still works, just not intelligent.';
const AI_NO_FALLBACK = 'No rules fallback — the Analyst is simply unavailable until a key is configured.';
const AI_PROFILE_USES = [
    'behaviour'         => ['Classifies mentor observations into category and severity.', AI_RULES_FALLBACK],
    'moderation'        => ['Screens community posts before they publish.', AI_RULES_FALLBACK],
    'coach'             => ['The Anchor Journal coaching replies.', AI_RULES_FALLBACK],
    'analysis'          => ['Narrative summaries on the analytics boards.', AI_RULES_FALLBACK],
    'photo'             => ['Checks uploaded headshots are usable.', AI_RULES_FALLBACK],
    'framing'           => ['Measures each headshot (head, face, eyes, shoulders) so every card frames it as an accurate headshot.', 'Cards frame photos from Cloudinary’s face landmarks, or show the whole photo.'],
    'marking'           => ['Marks open curriculum answers (written, essay, reflection, project, code) — capable models only; otherwise an instructor marks.', 'Left for the instructor to mark.'],
    // The Analyst (Level 7). Listed so an operator seeing "the analyst is
    // unavailable" on the board can tell here whether a key is missing or a
    // provider is rejecting it — none of these was visible before.
    'insight_router'    => ['Analyst — plans each question (which lenses to run).', AI_NO_FALLBACK],
    'insight_answer'    => ['Analyst — answers each question and composes the reply.', AI_NO_FALLBACK],
    'insight_mechanism' => ['Analyst panel — the “why is this happening” lens.', AI_NO_FALLBACK],
    'insight_action'    => ['Analyst panel — the “what to do about it” lens.', AI_NO_FALLBACK],
    'insight_risk'      => ['Analyst panel — the “what could go wrong” lens.', AI_NO_FALLBACK],
    'insight_equity'    => ['Analyst panel — the “who is left out” lens.', AI_NO_FALLBACK],
    'insight_synth'     => ['Analyst — synthesises the panel and multi-finding reports.', AI_NO_FALLBACK],
];

function ai_status(bool $probe = false): array {
    $out = [];
    foreach (AI_PROFILE_USES as $profile => $use) {
        [$what, $off] = is_array($use) ? $use : [$use, AI_RULES_FALLBACK];
        $cands = ai_profile_candidates($profile);
        $row = [
            'profile' => $profile,
            'what' => $what,
            'enabled' => count($cands) > 0,
            'provider' => $cands ? (string)$cands[0]['provider'] : '',
            'model' => $cands ? (string)$cands[0]['model'] : '',
            'fallbacks' => max(0, count($cands) - 1),
            // What actually happens today, in words an operator can act on.
            'behaviourWhenOff' => $off,
        ];
        if ($probe && $row['enabled']) {
            // One tiny real request. Cheap, and the only way to tell a working
            // key from a present one.
            $t0 = microtime(true);
            $r = ai_classify('Reply with {"ok":true} and nothing else.', 'ping', 20, $profile);
            $row['probe'] = [
                'ok' => !empty($r['ok']),
                'error' => empty($r['ok']) ? (string)($r['error'] ?? 'failed') : '',
                'ms' => (int)round((microtime(true) - $t0) * 1000),
            ];
        }
        $out[] = $row;
    }
    return $out;
}
