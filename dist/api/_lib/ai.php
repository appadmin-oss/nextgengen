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
 *     'gemini_api_key' => '…', 'gemini_model' => '' (automatic),
 *
 *     // Per-purpose profiles. Each has its own provider + key (+ optional
 *     // fallback). A missing profile falls back to the default block above.
 *     'profiles' => [
 *       'coach'      => ['provider' => 'gemini', 'api_key' => '…', 'model' => '',
 *                        'fallback' => ['provider' => 'groq', 'api_key' => '…', 'model' => 'llama-3.1-8b-instant']],
 *       'behaviour'  => ['provider' => 'groq',   'api_key' => '…', 'model' => 'llama-3.1-8b-instant',
 *                        'fallback' => ['provider' => 'gemini', 'api_key' => '…', 'model' => '']],
 *       'analysis'   => ['provider' => 'gemini', 'api_key' => '…', 'model' => ''],
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
 * deploy. anthropic and openai are direct because a programme paying for
 * them should not be paying a proxy margin too. */
const AI_PROVIDERS = ['groq', 'gemini', 'anthropic', 'openai', 'openrouter',
                      'cerebras', 'mistral', 'deepseek', 'together', 'github', 'custom'];
const AI_DEFAULT_MODEL = [
    'groq'       => 'llama-3.1-8b-instant',
    // Blank: the best Gemini model the key can use, asked of Google (gemini_pick_model).
    'gemini'     => '',
    // A paid provider only does hard thinking (ai_route), so its default is the capable model.
    'anthropic'  => 'claude-opus-5-5',
    'openai'     => 'gpt-4.1-mini',
    'openrouter' => 'meta-llama/llama-3.1-8b-instruct',
    'cerebras'   => 'llama-3.3-70b',
    'mistral'    => 'mistral-small-latest',
    'deepseek'   => 'deepseek-chat',
    'together'   => 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'github'     => 'gpt-4o-mini',
    'custom'     => '',
];

/* ── The OpenAI-shaped providers ─────────────────────────────────────────────
 *
 * Chat Completions is the shape most of the industry settled on, so these all
 * differ in exactly two things: where the request goes and which key signs
 * it. One branch serves all of them (ai_call_candidate), because five copies
 * of the same twelve lines is five places for one of them to drift.
 *
 * `free` marks the ones with a genuine free tier at the time of writing —
 * which is what a programme on shared hosting in Nigeria actually needs, and
 * what the Study drills are written to run on. Rates and terms are theirs to
 * change; this flag is a signpost for whoever sets the keys, not a promise.
 *
 * `custom` is the escape hatch: any OpenAI-compatible endpoint — a
 * self-hosted Ollama or vLLM, a provider that did not exist when this was
 * written — by naming `base_url` on the candidate. No deploy needed.
 */
const AI_OAI_COMPAT = [
    'groq'     => ['url' => 'https://api.groq.com/openai/v1/chat/completions', 'label' => 'Groq',           'free' => true],
    'openai'   => ['url' => 'https://api.openai.com/v1/chat/completions',      'label' => 'OpenAI',         'free' => false],
    'cerebras' => ['url' => 'https://api.cerebras.ai/v1/chat/completions',     'label' => 'Cerebras',       'free' => true],
    'mistral'  => ['url' => 'https://api.mistral.ai/v1/chat/completions',      'label' => 'Mistral',        'free' => true],
    'deepseek' => ['url' => 'https://api.deepseek.com/chat/completions',       'label' => 'DeepSeek',       'free' => false],
    'together' => ['url' => 'https://api.together.xyz/v1/chat/completions',    'label' => 'Together AI',    'free' => true],
    'github'   => ['url' => 'https://models.inference.ai.azure.com/chat/completions', 'label' => 'GitHub Models', 'free' => true],
    'custom'   => ['url' => '',                                               'label' => 'Self-hosted / other', 'free' => true],
];

/** Where an OpenAI-shaped candidate's request goes; '' when it cannot be known. */
function ai_oai_endpoint(array $cand): string {
    $prov = (string)($cand['provider'] ?? '');
    $base = trim((string)($cand['base_url'] ?? ''));
    if ($base !== '') {
        // A base URL may be given whole, or as the root to append the path to.
        return preg_match('~/chat/completions$~', $base) ? $base : rtrim($base, '/') . '/chat/completions';
    }
    return (string)(AI_OAI_COMPAT[$prov]['url'] ?? '');
}

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
                          'model' => (string)($c[$prov . '_model'] ?? AI_DEFAULT_MODEL[$prov]),
                          'base_url' => (string)($c[$prov . '_base_url'] ?? '')];
    }
    if ($pref !== '' && isset($byName[$pref])) { $out[] = $byName[$pref]; unset($byName[$pref]); }
    foreach ($byName as $p) $out[] = $p;
    return $out;
}

/** The providers a profile may USE, in order: its configured chain, routed for its job (ai_route). */
function ai_profile_candidates(string $profile = 'default'): array {
    return ai_route($profile, ai_profile_chain($profile));
}

/**
 * Resolve a profile to an ordered list of provider candidates as CONFIGURED:
 * profile → its fallback → the default block. Invalid entries are skipped.
 * Not routed: ai_profile_candidates() is what may actually be called.
 */
function ai_profile_chain(string $profile = 'default'): array {
    $c = ai_config();
    $out = [];
    $push = function ($p) use (&$out) {
        /* A key, or — for a self-hosted endpoint, which is the whole point
           of `custom` — an address. An Ollama or vLLM box on the same network
           has no key to give, and requiring one made it unconfigurable. */
        $hasAuth = is_array($p) && (!empty($p['api_key']) || (($p['provider'] ?? '') === 'custom' && !empty($p['base_url'])));
        if ($hasAuth && in_array(($p['provider'] ?? ''), AI_PROVIDERS, true)) {
            $out[] = [
                'provider' => (string)$p['provider'],
                'api_key' => (string)($p['api_key'] ?? ''),
                'model' => (string)($p['model'] ?? (AI_DEFAULT_MODEL[$p['provider']] ?? '')),
                // Only `custom` (and a proxy standing in for a known provider) needs one.
                'base_url' => (string)($p['base_url'] ?? ''),
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
/** The providers a profile can reach, in the order they would be tried (names only, never keys). */
function ai_providers_for(string $profile = 'default'): array {
    return array_values(array_unique(array_map(static fn($c) => (string)$c['provider'], ai_profile_candidates($profile))));
}
function ai_provider(string $profile = 'default'): string {
    $c = ai_profile_candidates($profile);
    return $c ? $c[0]['provider'] : '';
}

/** POST to a fixed, https-only provider endpoint. */
function ai_http_post(string $url, string $body, array $headers): array {
    // Test seam: fn($url, $body, $headers) => ['ok'=>…, 'body'=>…]. Never set in production.
    if (isset($GLOBALS['__ai_http']) && is_callable($GLOBALS['__ai_http'])) return ($GLOBALS['__ai_http'])($url, $body, $headers);
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
    if ($code < 200 || $code >= 300) return ['ok' => false, 'error' => 'ai_http_' . $code, 'status' => $code, 'detail' => ai_provider_message((string)$out)];
    return ['ok' => true, 'body' => (string)$out];
}

/** The provider's own words for a refusal ("API key not valid", "model not found"), trimmed — never the request. */
function ai_provider_message(string $body): string {
    $j = json_decode($body, true);
    $m = is_array($j) ? (string)($j['error']['message'] ?? ($j['error']['status'] ?? ($j['message'] ?? ''))) : '';
    return mb_substr(trim(preg_replace('/\s+/', ' ', $m)), 0, 240);
}

/** GET from a fixed, https-only provider endpoint. */
function ai_http_get(string $url, array $headers, int $timeout = 15): array {
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => max(1, $timeout), CURLOPT_CONNECTTIMEOUT => min(8, max(1, $timeout)),
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
    ]);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($out === false) return ['ok' => false, 'error' => 'ai_network', 'detail' => $err];
    if ($code < 200 || $code >= 300) return ['ok' => false, 'error' => 'ai_http_' . $code, 'status' => $code, 'detail' => ai_provider_message((string)$out)];
    return ['ok' => true, 'body' => (string)$out];
}

/* ── Gemini ────────────────────────────────────────────────────────────────

   One door for every Gemini request, because Google moves underneath it:

   - Keys. Google AI Studio now issues "AQ." auth keys as well as the older
     "AIza" ones. Both go in the x-goog-api-key header (never the URL, where
     they would land in logs); nothing else differs.
   - Models. Models are retired or closed to new projects (in September 2026
     the 2.5 models were limited to accounts that had used them, so a new key
     got 404 for gemini-2.5-flash). So the model is not hard-coded: the key's
     own model list is asked (models.list, cached a day per key) and the best
     available is used — the one configured if the key can use it, else the
     newest Flash. A 404 re-asks and retries once, so the next retirement
     heals itself instead of switching a feature off.
   - Settings. 3.x models take a thinking LEVEL (3.7/3.8 Flash start at
     "low"; others have "minimal") and have temperature deprecated; 2.5 takes
     a thinking BUDGET. A request is shaped for the model it goes to, and a
     400 naming a setting is retried once without it. */
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_PREFERRED = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

function gemini_http(string $method, string $path, string $key, ?array $body = null): array {
    if (isset($GLOBALS['__gemini_http']) && is_callable($GLOBALS['__gemini_http'])) return ($GLOBALS['__gemini_http'])($method, $path, $body);
    $h = ['x-goog-api-key: ' . $key];
    return $method === 'GET' ? ai_http_get(GEMINI_API . $path, $h)
        : ai_http_post(GEMINI_API . $path, json_encode($body, JSON_UNESCAPED_SLASHES), array_merge($h, ['Content-Type: application/json']));
}

/** The models this key may call generateContent on (ids without "models/"). Cached a day per key; [] when it cannot be asked. */
function gemini_models(string $key, bool $fresh = false, ?array &$err = null): array {
    $ck = 'gemini.models.' . substr(hash('sha256', 'gm|' . $key), 0, 20);
    if (!$fresh && function_exists('cache_get')) { $c = cache_get($ck, 86400); if (is_array($c) && isset($c['ids'])) return $c['ids']; }
    $ids = [];
    $page = '';
    for ($i = 0; $i < 5; $i++) {
        $r = gemini_http('GET', '/models?pageSize=200' . ($page !== '' ? '&pageToken=' . rawurlencode($page) : ''), $key);
        if (empty($r['ok'])) { $err = $r; break; }
        $j = json_decode((string)$r['body'], true) ?: [];
        foreach ((array)($j['models'] ?? []) as $m) {
            $id = preg_replace('#^models/#', '', (string)($m['name'] ?? ''));
            if ($id !== '' && in_array('generateContent', (array)($m['supportedGenerationMethods'] ?? []), true)) $ids[] = $id;
        }
        $page = (string)($j['nextPageToken'] ?? '');
        if ($page === '') break;
    }
    if ($ids && function_exists('cache_put')) cache_put($ck, ['ids' => $ids]);
    return $ids;
}

/** The model to use: the one wanted if the key has it, else the best Flash it has. */
function gemini_pick_model(string $key, string $wanted, bool $fresh = false): string {
    $have = gemini_models($key, $fresh);
    if (!$have) return $wanted !== '' ? $wanted : GEMINI_PREFERRED[0];
    if ($wanted !== '' && in_array($wanted, $have, true)) return $wanted;
    foreach (GEMINI_PREFERRED as $m) if (in_array($m, $have, true)) return $m;
    // A newer Flash than this list knows: the highest-numbered plain Flash.
    $flash = array_values(array_filter($have, static fn($m) => (bool)preg_match('/^gemini-\d+(\.\d+)?-flash(-lite)?$/', $m)));
    usort($flash, static fn($a, $b) => version_compare(preg_replace('/^gemini-([\d.]+).*/', '$1', $b), preg_replace('/^gemini-([\d.]+).*/', '$1', $a)) ?: strcmp($a, $b));
    return $flash[0] ?? ($wanted !== '' ? $wanted : $have[0]);
}

/** generationConfig for this model: $o = ['maxTokens', 'temperature', 'thinking' => 'off'|'low'|'', 'json' => schema|null]. */
function gemini_gen_config(string $model, array $o): array {
    $g = ['maxOutputTokens' => (int)($o['maxTokens'] ?? 400)];
    $three = (bool)preg_match('/^gemini-(\d+)/', $model, $mm) && (int)$mm[1] >= 3;
    if (!$three && isset($o['temperature'])) $g['temperature'] = (float)$o['temperature'];
    $t = (string)($o['thinking'] ?? '');
    if ($t !== '') {
        if ($three) $g['thinkingConfig'] = ['thinkingLevel' => $t === 'off' ? (preg_match('/^gemini-3\.[78]/', $model) ? 'low' : 'minimal') : $t];
        elseif (preg_match('/^gemini-2\.5/', $model)) $g['thinkingConfig'] = ['thinkingBudget' => $t === 'off' ? 0 : 1024];
        // Thinking counts against the output allowance; leave room for the answer.
        $g['maxOutputTokens'] += $three ? 2048 : 0;
    }
    if (!empty($o['json'])) { $g['responseMimeType'] = 'application/json'; if (is_array($o['json'])) $g['responseSchema'] = $o['json']; }
    return $g;
}

/**
 * One generateContent request. $parts: the user's parts ([['text'=>…], ['inline_data'=>…]]).
 * Returns ['ok', 'text', 'model'] or ['ok' => false, 'error', 'detail'].
 */
function gemini_generate(array $cand, string $system, array $contents, array $o): array {
    $key = (string)$cand['api_key'];
    $model = gemini_pick_model($key, (string)($cand['model'] ?? ''));
    $tries = 0; $strip = [];
    while (true) {
        $tries++;
        $gen = gemini_gen_config($model, $o);
        foreach ($strip as $f) unset($gen[$f]);
        $body = ['contents' => $contents, 'generationConfig' => $gen];
        if ($system !== '') $body['systemInstruction'] = ['parts' => [['text' => $system]]];
        $r = gemini_http('POST', '/models/' . rawurlencode($model) . ':generateContent', $key, $body);
        if (!empty($r['ok'])) {
            $j = json_decode((string)$r['body'], true) ?: [];
            $text = '';
            foreach ((array)($j['candidates'][0]['content']['parts'] ?? []) as $p) if (empty($p['thought'])) $text .= (string)($p['text'] ?? '');
            $um = $j['usageMetadata'] ?? null;
            $usage = is_array($um) ? [(int)($um['promptTokenCount'] ?? 0), (int)($um['candidatesTokenCount'] ?? 0) + (int)($um['thoughtsTokenCount'] ?? 0)] : null;
            return $text !== '' ? ['ok' => true, 'text' => trim($text), 'model' => $model, 'provider' => 'gemini', 'usage' => $usage]
                : ['ok' => false, 'error' => 'ai_empty', 'detail' => (string)($j['candidates'][0]['finishReason'] ?? ($j['promptFeedback']['blockReason'] ?? '')), 'model' => $model];
        }
        if ($tries >= 3) return $r + ['model' => $model];
        $status = (int)($r['status'] ?? 0);
        // The model went away: ask again what this key may use, and use that.
        if ($status === 404) {
            $next = gemini_pick_model($key, '', true);
            if ($next === $model) return $r + ['model' => $model];
            $model = $next; continue;
        }
        // A setting this model does not take: once more without it.
        if ($status === 400) {
            $d = strtolower((string)($r['detail'] ?? ''));
            $fields = array_keys(array_filter(['thinkingConfig' => 'think', 'responseSchema' => 'schema', 'temperature' => 'temperature'], static fn($n) => str_contains($d, $n)));
            $fields = array_diff($fields, $strip);
            if ($fields) { $strip = array_merge($strip, $fields); continue; }
        }
        return $r + ['model' => $model];
    }
}

/** [input, output] tokens from an OpenAI-shaped reply (OpenAI, Groq, OpenRouter), or null. */
function ai_oai_usage(array $j): ?array {
    return isset($j['usage']) && is_array($j['usage']) ? [(int)($j['usage']['prompt_tokens'] ?? 0), (int)($j['usage']['completion_tokens'] ?? 0)] : null;
}

/** An OpenAI reasoning model (o1, o3, o4-mini, gpt-5…): fixed temperature. */
function ai_openai_is_reasoning(string $model): bool {
    return (bool)preg_match('/^(o\d|gpt-5)/i', trim($model));
}


/* ── Automatic routing and the spend limit ────────────────────────────────
 *
 * The operator does not choose a provider. Every profile is one of two jobs:
 *   · everyday work (classifying, screening, photo checks, coaching replies,
 *     summaries, the ID assistant) runs on FREE models only — Groq, Gemini,
 *     and OpenRouter models ending ":free";
 *   · hard thinking (marking a child's written answer, the Analyst's answers,
 *     its lenses and its synthesis) tries the PAID models first — Claude,
 *     OpenAI, OpenRouter's paid models — and falls back to free ones.
 * Paid models run only under a monthly spend limit set in Settings
 * (setting `ai_routing.monthlyLimitUsd`; unset or 0 = paid models off). Every
 * call is logged with its tokens and estimated cost (ai_usage, migration
 * 167); a paid call that would cross the limit is skipped, and the job is
 * answered by a free model or by the feature's own rules.
 */
const AI_BRAIN_PROFILES = ['marking', 'insight_answer', 'insight_synth', 'insight_mechanism', 'insight_action', 'insight_risk', 'insight_equity'];
const AI_PAID_PROVIDERS = ['anthropic', 'openai'];
/* USD per million tokens [input, output], matched by the longest prefix of
 * the model name. Estimates for a budget, not an invoice: an unknown paid
 * model is priced HIGH on purpose, so a guess stops spending early rather
 * than late. Settings can override any model (`ai_routing.prices`). */
const AI_PRICES = [
    'claude-fable-5' => [10.0, 50.0], 'claude-mythos-5' => [10.0, 50.0],
    'claude-opus-5-5' => [4.0, 20.0], 'claude-opus-5' => [5.0, 25.0], 'claude-opus-4-6' => [5.0, 25.0], 'claude-opus-4-7' => [5.0, 25.0], 'claude-opus-4-8' => [5.0, 25.0],
    'claude-opus-4' => [15.0, 75.0], 'claude-sonnet-5' => [2.0, 10.0], 'claude-sonnet-4' => [3.0, 15.0], 'claude-haiku-5' => [0.10, 0.50], 'claude-haiku-4' => [1.0, 5.0], 'claude-3' => [3.0, 15.0],
    'gpt-5-nano' => [0.05, 0.40], 'gpt-5-mini' => [0.25, 2.0], 'gpt-5' => [1.25, 10.0], 'gpt-4.1-nano' => [0.10, 0.40], 'gpt-4.1-mini' => [0.40, 1.60], 'gpt-4.1' => [2.0, 8.0],
    'gpt-4o-mini' => [0.15, 0.60], 'gpt-4o' => [2.5, 10.0], 'o4-mini' => [1.10, 4.40], 'o3' => [2.0, 8.0],
];
const AI_PRICE_UNKNOWN_PAID = [15.0, 75.0];

/** everyday | brain */
function ai_profile_job(string $profile): string { return in_array($profile, AI_BRAIN_PROFILES, true) ? 'brain' : 'everyday'; }
/** free | paid — by provider, and for OpenRouter by the model's ":free" suffix. */
function ai_candidate_tier(array $c): string {
    $prov = (string)($c['provider'] ?? '');
    if (in_array($prov, AI_PAID_PROVIDERS, true)) return 'paid';
    if ($prov === 'openrouter') return str_ends_with(strtolower((string)($c['model'] ?? '')), ':free') ? 'free' : 'paid';
    return 'free';
}
/** The operator's routing settings: the monthly limit (USD), whether paid models may do everyday work when no free one is set up, price overrides. */
function ai_routing_settings(): array {
    $s = function_exists('setting_get') ? setting_get('ai_routing') : null;
    $s = is_array($s) ? $s : [];
    $prices = [];
    foreach ((array)($s['prices'] ?? []) as $m => $pr) if (is_string($m) && is_array($pr) && count($pr) === 2) $prices[strtolower($m)] = [max(0.0, (float)$pr[0]), max(0.0, (float)$pr[1])];
    return ['monthlyLimitUsd' => max(0.0, (float)($s['monthlyLimitUsd'] ?? 0)), 'paidEveryday' => !empty($s['paidEveryday']), 'prices' => $prices];
}
/** [input, output] USD per million tokens for one candidate. Free tiers cost nothing. */
function ai_price_for(array $c): array {
    if (ai_candidate_tier($c) === 'free') return [0.0, 0.0];
    $m = strtolower((string)($c['model'] ?? ''));
    $best = null; $len = -1;
    foreach (ai_routing_settings()['prices'] + AI_PRICES as $prefix => $pr) if (str_starts_with($m, $prefix) && strlen($prefix) > $len) { $best = $pr; $len = strlen($prefix); }
    return $best ?? AI_PRICE_UNKNOWN_PAID;
}
function ai_cost_micros(array $c, int $in, int $out): int {
    [$pi, $po] = ai_price_for($c);
    return (int)ceil(($in * $pi + $out * $po));   // USD per 1M tokens × tokens = micro-USD
}
/** Estimated spend this month, in micro-USD (USD × 1,000,000). Read once per request. */
function ai_month_spend_micros(?string $month = null): int {
    $month = $month ?? gmdate('Y-m');
    if (isset($GLOBALS['__ai_spend'][$month])) return $GLOBALS['__ai_spend'][$month];
    try { $v = (int)(db_row('SELECT COALESCE(SUM(costMicros), 0) c FROM ai_usage WHERE month = ?', [$month])['c'] ?? 0); } catch (\Throwable $e) { $v = 0; }
    return $GLOBALS['__ai_spend'][$month] = $v;
}
function ai_limit_micros(): int { return (int)round(ai_routing_settings()['monthlyLimitUsd'] * 1000000); }
/** May paid models run at all right now? */
function ai_paid_open(): bool { $l = ai_limit_micros(); return $l > 0 && ai_month_spend_micros() < $l; }

/** Order and filter a profile's candidates for its job. Every candidate comes back tagged with its tier. */
function ai_route(string $profile, array $cands): array {
    foreach ($cands as $i => $c) $cands[$i]['tier'] = ai_candidate_tier($c);
    $free = array_values(array_filter($cands, static fn($c) => $c['tier'] === 'free'));
    $paid = array_values(array_filter($cands, static fn($c) => $c['tier'] === 'paid'));
    $open = $paid && ai_paid_open();
    if (ai_profile_job($profile) === 'brain') return $open ? array_merge($paid, $free) : $free;
    if ($free) return $free;
    return $open && ai_routing_settings()['paidEveryday'] ? $paid : [];
}
/** Why a profile has the providers it has, in words for the Settings table. */
function ai_route_note(string $profile): string {
    $all = array_map('ai_candidate_tier', ai_profile_chain($profile));
    $hasPaid = in_array('paid', $all, true); $hasFree = in_array('free', $all, true);
    $brain = ai_profile_job($profile) === 'brain';
    if ($brain && $hasPaid && !ai_paid_open()) return ai_limit_micros() > 0 ? 'This month’s AI limit is reached, so paid models wait until next month.' : 'Paid models are off until a monthly limit is set.';
    if (!$brain && !$hasFree && $hasPaid && !ai_routing_settings()['paidEveryday']) return 'Everyday work runs on free models only, and none is set up.';
    return '';
}

/** Rough token count for a budget estimate: four characters a token. */
function ai_estimate_tokens(string $s): int { return (int)ceil(mb_strlen($s) / 4); }
/** One line in the usage log. Never breaks the request it measures. */
function ai_log_usage(string $profile, array $cand, array $r, int $in, int $out, bool $estimated, string $month): void {
    $cost = isset($r['costMicros']) ? max(0, (int)$r['costMicros']) : ai_cost_micros($cand, $in, $out);
    try {
        db_insert('ai_usage', ['at' => now_iso(), 'month' => $month, 'profile' => $profile, 'job' => ai_profile_job($profile), 'provider' => (string)$cand['provider'],
            'model' => (string)($r['model'] ?? $cand['model'] ?? ''), 'tier' => (string)($cand['tier'] ?? ai_candidate_tier($cand)), 'inTokens' => $in, 'outTokens' => $out,
            'costMicros' => $cost, 'estimated' => $estimated ? 1 : 0, 'ok' => !empty($r['ok']) ? 1 : 0, 'error' => empty($r['ok']) ? mb_substr((string)($r['error'] ?? ''), 0, 60) : '']);
        $GLOBALS['__ai_spend'][$month] = ai_month_spend_micros($month) + $cost;
    } catch (\Throwable $e) { /* the log must never break the request it measures */ }
}

/* Current Claude models (Opus/Sonnet 4.6+, every 5.x) think on every request,
 * reject `temperature`, and take an effort level instead. Their thinking is
 * written out of max_tokens, so a small allowance can return no text at all:
 * they get at least AI_CLAUDE_MIN_OUT. Older models keep the classic shape. */
const AI_CLAUDE_MIN_OUT = 4096;
function ai_anthropic_modern(string $model): bool {
    return (bool)preg_match('/^claude-(?:(?:opus|sonnet)-4-[6-9]|(?:opus|sonnet|haiku|fable|mythos)-5)/', strtolower(trim($model)));
}
/** The output tokens a call may use — what the budget check prices. */
function ai_out_allowance(array $cand, int $maxTokens): int {
    return ($cand['provider'] ?? '') === 'anthropic' && ai_anthropic_modern((string)($cand['model'] ?? '')) ? max($maxTokens, AI_CLAUDE_MIN_OUT) : $maxTokens;
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
        $req = ['model' => $cand['model'], 'max_tokens' => ai_out_allowance($cand, $maxTokens), 'system' => $system, 'messages' => $msgs];
        if (ai_anthropic_modern((string)$cand['model'])) $req['output_config'] = ['effort' => ($cand['job'] ?? '') === 'brain' ? 'high' : 'low'];
        else $req['temperature'] = $temp;
        $body = json_encode($req, JSON_UNESCAPED_SLASHES);
        $r = ai_http_post('https://api.anthropic.com/v1/messages', $body, [
            'x-api-key: ' . $cand['api_key'], 'anthropic-version: 2023-06-01', 'Content-Type: application/json',
        ]);
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $usage = isset($j['usage']) ? [(int)($j['usage']['input_tokens'] ?? 0) + (int)($j['usage']['cache_creation_input_tokens'] ?? 0) + (int)($j['usage']['cache_read_input_tokens'] ?? 0), (int)($j['usage']['output_tokens'] ?? 0)] : null;
        // A declined request is a failure to answer, so the chain moves on to the next provider.
        if (($j['stop_reason'] ?? '') === 'refusal') return ['ok' => false, 'error' => 'ai_refused', 'usage' => $usage];
        $text = '';
        foreach ((array)($j['content'] ?? []) as $blk) {
            if (($blk['type'] ?? '') === 'text') $text .= (string)($blk['text'] ?? '');
        }
        return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'anthropic', 'model' => (string)($j['model'] ?? $cand['model']), 'usage' => $usage] : ['ok' => false, 'error' => 'ai_empty', 'usage' => $usage];
    }

    /* OpenRouter — OpenAI-shaped, and the reason "and much more" needs no
     * further code: one key reaches hundreds of models from every major lab,
     * so a new model is a config change rather than a deploy. The two extra
     * headers are its attribution convention, not authentication. */
    if ($cand['provider'] === 'openrouter') {
        $msgs = [['role' => 'system', 'content' => $system]];
        foreach ($turns as $t) $msgs[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'assistant' : 'user'), 'content' => (string)($t['text'] ?? '')];
        // usage.include: OpenRouter reports what the call actually cost, so the budget is not an estimate.
        $body = json_encode(['model' => $cand['model'], 'max_tokens' => $maxTokens, 'temperature' => $temp, 'messages' => $msgs, 'usage' => ['include' => true]], JSON_UNESCAPED_SLASHES);
        $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
        $r = ai_http_post('https://openrouter.ai/api/v1/chat/completions', $body, array_filter([
            'Authorization: Bearer ' . $cand['api_key'], 'Content-Type: application/json',
            $origin !== '' ? 'HTTP-Referer: ' . $origin : null,
            'X-Title: Next Generation Genius',
        ]));
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = $j['choices'][0]['message']['content'] ?? '';
        $usage = ai_oai_usage($j);
        $extra = ['usage' => $usage] + (isset($j['usage']['cost']) && is_numeric($j['usage']['cost']) ? ['costMicros' => (int)ceil((float)$j['usage']['cost'] * 1000000)] : []);
        return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'openrouter'] + $extra : ['ok' => false, 'error' => 'ai_empty'] + $extra;
    }

    /* OpenAI, direct. Chat Completions: `max_completion_tokens`, because the
     * reasoning models (o-series, gpt-5) refuse `max_tokens`, and no
     * temperature for them either: they accept only their default. */
    if ($cand['provider'] === 'openai') {
        $msgs = [['role' => 'system', 'content' => $system]];
        foreach ($turns as $t) $msgs[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'assistant' : 'user'), 'content' => (string)($t['text'] ?? '')];
        $req = ['model' => $cand['model'], 'max_completion_tokens' => $maxTokens, 'messages' => $msgs];
        if (!ai_openai_is_reasoning((string)$cand['model'])) $req['temperature'] = $temp;
        $r = ai_http_post('https://api.openai.com/v1/chat/completions', json_encode($req, JSON_UNESCAPED_SLASHES), [
            'Authorization: Bearer ' . $cand['api_key'], 'Content-Type: application/json',
        ]);
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = $j['choices'][0]['message']['content'] ?? '';
        return $text !== '' ? ['ok' => true, 'text' => trim((string)$text), 'provider' => 'openai', 'usage' => ai_oai_usage($j)] : ['ok' => false, 'error' => 'ai_empty', 'usage' => ai_oai_usage($j)];
    }

    /* Every other OpenAI-shaped provider — Groq, Cerebras, Mistral, DeepSeek,
     * Together, GitHub Models, and whatever `custom` points at. They differ in
     * the endpoint and the key and in nothing else, so they share this. */
    if (isset(AI_OAI_COMPAT[$cand['provider']])) {
        $url = ai_oai_endpoint($cand);
        if ($url === '') return ['ok' => false, 'error' => 'ai_no_endpoint'];
        $msgs = [['role' => 'system', 'content' => $system]];
        foreach ($turns as $t) $msgs[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'assistant' : 'user'), 'content' => (string)($t['text'] ?? '')];
        $body = json_encode(['model' => $cand['model'], 'max_tokens' => $maxTokens, 'temperature' => $temp, 'messages' => $msgs], JSON_UNESCAPED_SLASHES);
        $r = ai_http_post($url, $body, array_filter([
            // A self-hosted endpoint may need no key at all.
            trim((string)($cand['api_key'] ?? '')) !== '' ? 'Authorization: Bearer ' . $cand['api_key'] : null,
            'Content-Type: application/json',
        ]));
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = $j['choices'][0]['message']['content'] ?? '';
        return $text !== '' ? ['ok' => true, 'text' => trim((string)$text), 'provider' => (string)$cand['provider'], 'usage' => ai_oai_usage($j)]
                            : ['ok' => false, 'error' => 'ai_empty', 'usage' => ai_oai_usage($j)];
    }

    // Gemini (gemini_generate: the model the key can use, shaped for it)
    $contents = [];
    foreach ($turns as $t) $contents[] = ['role' => (($t['role'] ?? '') === 'coach' ? 'model' : 'user'), 'parts' => [['text' => (string)($t['text'] ?? '')]]];
    if (!$contents) $contents[] = ['role' => 'user', 'parts' => [['text' => '']]];
    return gemini_generate($cand, $system, $contents, ['maxTokens' => $maxTokens, 'temperature' => $temp, 'thinking' => 'off']);
}

/** Walk the profile's candidate chain until one answers. Never throws.
 *
 *  Test seam: $GLOBALS['__ai_mock'] — fn($profile, $system, $turns) => result.
 *  Multi-model orchestration cannot be verified against live providers (cost,
 *  network, and answers that differ every run), and the parts worth testing —
 *  which lens got which provider, what survives synthesis, what happens when one
 *  provider is down — are all above the HTTP call. Mirrors the __ai_photo_mock
 *  seam that already exists for the photo pipeline. */
/** `$prefer` puts one provider first when it is configured for the profile; the rest stay as fallbacks.
 *  `$budget` (seconds, 0 = none) stops trying further fallbacks once spent, so a caller with a deadline
 *  of its own — a browser waiting on a request — hears "the AI was slow" instead of timing out. */
function ai_run(string $profile, string $system, array $turns, int $maxTokens, float $temp, string $prefer = '', int $budget = 0): array {
    if (isset($GLOBALS['__ai_mock']) && is_callable($GLOBALS['__ai_mock'])) {
        $r = ($GLOBALS['__ai_mock'])($profile, $system, $turns);
        if ($prefer !== '' && !empty($r['ok'])) $r['provider'] = $prefer;
        return $r;
    }
    $cands = ai_profile_candidates($profile);
    if (!$cands) return ['ok' => false, 'error' => ai_route_note($profile) !== '' ? 'ai_not_routed' : 'ai_disabled'];
    // A provider named in the request (the ID assistant's "use Gemini") goes first among the ones this job may use; it cannot add a paid one.
    if ($prefer !== '') usort($cands, static fn($a, $b) => ($b['provider'] === $prefer) <=> ($a['provider'] === $prefer));
    $last = ['ok' => false, 'error' => 'ai_disabled'];
    $t0 = microtime(true);
    $month = gmdate('Y-m');
    $inEst = ai_estimate_tokens($system) + array_sum(array_map(static fn($t) => ai_estimate_tokens((string)($t['text'] ?? '')), $turns));
    $job = ai_profile_job($profile);
    foreach ($cands as $i => $cand) {
        if ($budget > 0 && $i > 0 && microtime(true) - $t0 > $budget) return ['ok' => false, 'error' => 'ai_slow', 'tried' => $i];
        $cand['job'] = $job;
        // A paid call that could cross the limit is not made: estimated at its full output allowance.
        if (($cand['tier'] ?? '') === 'paid' && ai_month_spend_micros($month) + ai_cost_micros($cand, $inEst, ai_out_allowance($cand, $maxTokens)) > ai_limit_micros()) {
            $last = ['ok' => false, 'error' => 'ai_limit_reached'];
            ai_log_usage($profile, $cand, $last, 0, 0, false, $month);   // costs nothing; counted as a job the limit held back
            continue;
        }
        $r = isset($GLOBALS['__ai_call_mock']) && is_callable($GLOBALS['__ai_call_mock'])
            ? ($GLOBALS['__ai_call_mock'])($cand, $system, $turns, $maxTokens)
            : ai_call_candidate($cand, $system, $turns, $maxTokens, $temp);
        $u = is_array($r['usage'] ?? null) ? $r['usage'] : null;
        $in = $u ? (int)($u[0] ?? 0) : $inEst;
        $out = $u ? (int)($u[1] ?? 0) : (!empty($r['ok']) ? ai_estimate_tokens((string)($r['text'] ?? '')) : 0);
        ai_log_usage($profile, $cand, $r, $in, $out, $u === null, $month);
        if (!empty($r['ok'])) { unset($r['usage'], $r['costMicros']); return $r + ['tier' => (string)($cand['tier'] ?? '')]; }
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
function ai_classify(string $instructions, string $input, int $maxTokens = 300, string $profile = 'behaviour', string $prefer = '', int $budget = 0): array {
    $system = $instructions . "\nRespond with ONLY a single JSON object — no prose, no markdown fences.";
    $r = ai_run($profile, $system, [['role' => 'me', 'text' => $input]], $maxTokens, 0.1, $prefer, $budget);
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
    $bucket = function_exists('store_hosted') && store_hosted($url);   // our own bucket's public address (object-store.php)
    if ($host !== 'res.cloudinary.com' && !$bucket && ($own === '' || $host !== $own)) return ['ok' => false, 'error' => 'bad_host'];
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
    $r = gemini_generate($cand, $system, [['role' => 'user', 'parts' => [
            ['inline_data' => ['mime_type' => $img['mime'], 'data' => $img['b64']]],
            ['text' => 'Inspect this headshot for use on a printed ID card.'],
        ]]], ['maxTokens' => 320, 'temperature' => 0.1, 'thinking' => 'off', 'json' => true]);
    if (empty($r['ok'])) return $r;
    $text = (string)$r['text'];
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
            'job' => ai_profile_job($profile),
            'tier' => $cands ? (string)($cands[0]['tier'] ?? '') : '',
            'routeNote' => ai_route_note($profile),
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

/** This month's AI use for Settings: the limit, what was spent, and by whom. Names and numbers only — never keys. */
function ai_spend_summary(?string $month = null): array {
    $month = $month ?? gmdate('Y-m');
    $rs = ai_routing_settings();
    $rows = [];
    try {
        $rows = db_all("SELECT provider, model, tier, COUNT(*) calls, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) okCalls, SUM(CASE WHEN error = 'ai_limit_reached' THEN 1 ELSE 0 END) held,
                               SUM(inTokens) inTokens, SUM(outTokens) outTokens, SUM(costMicros) costMicros, MAX(estimated) estimated
                          FROM ai_usage WHERE month = ? GROUP BY provider, model, tier ORDER BY SUM(costMicros) DESC, COUNT(*) DESC", [$month]);
    } catch (\Throwable $e) { $rows = []; }
    $spent = array_sum(array_map(static fn($r) => (int)$r['costMicros'], $rows));
    $limit = ai_limit_micros();
    return ['month' => $month, 'limitUsd' => $rs['monthlyLimitUsd'], 'spentUsd' => round($spent / 1000000, 4), 'leftUsd' => $limit > 0 ? round(max(0, $limit - $spent) / 1000000, 4) : 0.0,
        'paidOpen' => $limit > 0 && $spent < $limit, 'paidEveryday' => $rs['paidEveryday'],
        'prices' => array_map(static fn($m, $p) => ['model' => $m, 'in' => $p[0], 'out' => $p[1]], array_keys($rs['prices']), array_values($rs['prices'])),
        'held' => array_sum(array_map(static fn($r) => (int)$r['held'], $rows)),
        'byModel' => array_map(static fn($r) => ['provider' => (string)$r['provider'], 'model' => (string)$r['model'], 'tier' => (string)$r['tier'], 'calls' => (int)$r['calls'], 'ok' => (int)$r['okCalls'],
            'held' => (int)$r['held'], 'inTokens' => (int)$r['inTokens'], 'outTokens' => (int)$r['outTokens'], 'costUsd' => round((int)$r['costMicros'] / 1000000, 4), 'estimated' => (bool)$r['estimated']], $rows)];
}

