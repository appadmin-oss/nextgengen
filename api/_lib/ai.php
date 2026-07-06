<?php
declare(strict_types=1);

/**
 * Optional AI layer — Groq (OpenAI-compatible) or Google Gemini, both on their
 * free tiers. Entirely opt-in: with no key configured the callers fall back to
 * a deterministic, rule-based summary, so nothing breaks and no network call is
 * made. Provider hosts are fixed constants (no SSRF surface).
 *
 * Configure in config.php:
 *   'ai' => [
 *     'provider'      => 'groq',            // or 'gemini' (optional preference)
 *     'groq_api_key'  => '…', 'groq_model'   => 'llama-3.1-8b-instant',
 *     'gemini_api_key'=> '…', 'gemini_model' => 'gemini-1.5-flash',
 *   ],
 */

function ai_config(): array {
    $cfg = $GLOBALS['CONFIG']['ai'] ?? null;
    return is_array($cfg) ? $cfg : [];
}

function ai_enabled(): bool {
    $c = ai_config();
    return !empty($c['groq_api_key']) || !empty($c['gemini_api_key']);
}

/** Which provider will actually be used (honours preference, falls back). */
function ai_provider(): string {
    $c = ai_config();
    $pref = strtolower((string)($c['provider'] ?? ''));
    if ($pref === 'gemini' && !empty($c['gemini_api_key'])) return 'gemini';
    if ($pref === 'groq' && !empty($c['groq_api_key'])) return 'groq';
    if (!empty($c['groq_api_key'])) return 'groq';
    if (!empty($c['gemini_api_key'])) return 'gemini';
    return '';
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

/**
 * Single-shot completion. Returns ['ok'=>true,'text'=>…,'provider'=>…] or
 * ['ok'=>false,'error'=>…]. Never throws.
 */
function ai_complete(string $system, string $user, int $maxTokens = 400): array {
    $c = ai_config();
    $prov = ai_provider();
    if ($prov === '') return ['ok' => false, 'error' => 'ai_disabled'];

    if ($prov === 'groq') {
        $model = (string)($c['groq_model'] ?? 'llama-3.1-8b-instant');
        $body = json_encode([
            'model' => $model, 'max_tokens' => $maxTokens, 'temperature' => 0.4,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
        ], JSON_UNESCAPED_SLASHES);
        $r = ai_http_post('https://api.groq.com/openai/v1/chat/completions', $body, [
            'Authorization: Bearer ' . $c['groq_api_key'], 'Content-Type: application/json',
        ]);
        if (!$r['ok']) return $r;
        $j = json_decode($r['body'], true);
        $text = $j['choices'][0]['message']['content'] ?? '';
        return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'groq'] : ['ok' => false, 'error' => 'ai_empty'];
    }

    // Gemini
    $model = (string)($c['gemini_model'] ?? 'gemini-1.5-flash');
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . urlencode((string)$c['gemini_api_key']);
    $body = json_encode([
        'systemInstruction' => ['parts' => [['text' => $system]]],
        'contents' => [['parts' => [['text' => $user]]]],
        'generationConfig' => ['maxOutputTokens' => $maxTokens, 'temperature' => 0.4],
    ], JSON_UNESCAPED_SLASHES);
    $r = ai_http_post($url, $body, ['Content-Type: application/json']);
    if (!$r['ok']) return $r;
    $j = json_decode($r['body'], true);
    $text = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
    return $text !== '' ? ['ok' => true, 'text' => trim($text), 'provider' => 'gemini'] : ['ok' => false, 'error' => 'ai_empty'];
}
