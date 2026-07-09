<?php
declare(strict_types=1);

/**
 * SMS layer — Termii (Nigeria-first) + Twilio (everything else / fallback).
 * Entirely opt-in; with no provider configured sms_enabled() is false and
 * callers fall back to email-only. Never throws into a request path.
 *
 * config.php:
 *   'sms' => [
 *     'default_country' => 'NG',   // for numbers written as 080…
 *     'termii' => ['api_key' => '', 'sender' => 'NGG'],
 *     'twilio' => ['sid' => '', 'token' => '', 'from' => '+1…'],
 *   ]
 */

function sms_config(): array {
    $c = $GLOBALS['CONFIG']['sms'] ?? null;
    return is_array($c) ? $c : [];
}

function sms_enabled(): bool {
    $c = sms_config();
    return !empty($c['termii']['api_key']) || (!empty($c['twilio']['sid']) && !empty($c['twilio']['token']));
}

/**
 * Normalise to E.164-ish. '08031234567' (NG default) → '+2348031234567';
 * '234803…' → '+234803…'; already-+ numbers pass through. Returns '' when
 * it can't be made into a plausible number.
 */
function sms_normalize(string $raw, string $defaultCountry = ''): string {
    $c = sms_config();
    $cc = strtoupper($defaultCountry ?: (string)($c['default_country'] ?? 'NG'));
    $n = preg_replace('/[^\d+]/', '', trim($raw));
    if ($n === '' || $n === '+') return '';
    if ($n[0] === '+') { $d = substr($n, 1); return (strlen($d) >= 8 && strlen($d) <= 15 && ctype_digit($d)) ? $n : ''; }
    if (!ctype_digit($n)) return '';
    if ($cc === 'NG') {
        if (strlen($n) === 11 && $n[0] === '0') return '+234' . substr($n, 1);
        if (strlen($n) === 13 && strpos($n, '234') === 0) return '+' . $n;
        if (strlen($n) === 10 && in_array($n[0], ['7', '8', '9'], true)) return '+234' . $n;
    }
    // Other countries: only accept full international digits (8–15).
    return (strlen($n) >= 8 && strlen($n) <= 15) ? '+' . $n : '';
}

/** Provider order for a number: Termii first for +234, Twilio first else. */
function sms_provider_order(string $e164): array {
    $c = sms_config();
    $termii = !empty($c['termii']['api_key']);
    $twilio = !empty($c['twilio']['sid']) && !empty($c['twilio']['token']);
    $order = [];
    if (strpos($e164, '+234') === 0) { if ($termii) $order[] = 'termii'; if ($twilio) $order[] = 'twilio'; }
    else { if ($twilio) $order[] = 'twilio'; if ($termii) $order[] = 'termii'; }
    return $order;
}

function sms_http(string $url, array $opts): array {
    if (isset($GLOBALS['__sms_http_mock']) && is_callable($GLOBALS['__sms_http_mock'])) {
        return ($GLOBALS['__sms_http_mock'])($url, $opts);
    }
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, $opts + [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
    ]);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($out === false) return ['ok' => false, 'error' => 'network'];
    if ($code < 200 || $code >= 300) return ['ok' => false, 'error' => 'http_' . $code, 'detail' => substr((string)$out, 0, 200)];
    return ['ok' => true, 'body' => (string)$out];
}

function sms_send_termii(string $to, string $text): array {
    $c = sms_config()['termii'] ?? [];
    $body = json_encode([
        'to' => ltrim($to, '+'),
        'from' => (string)($c['sender'] ?? 'NGG'),
        'sms' => $text, 'type' => 'plain', 'channel' => 'generic',
        'api_key' => (string)($c['api_key'] ?? ''),
    ], JSON_UNESCAPED_SLASHES);
    return sms_http('https://api.ng.termii.com/api/sms/send', [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ]);
}

function sms_send_twilio(string $to, string $text): array {
    $c = sms_config()['twilio'] ?? [];
    $sid = (string)($c['sid'] ?? '');
    return sms_http('https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages.json', [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['To' => $to, 'From' => (string)($c['from'] ?? ''), 'Body' => $text]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_USERPWD => $sid . ':' . (string)($c['token'] ?? ''),
    ]);
}

/**
 * Send one SMS. Routes Termii-first for Nigerian numbers, Twilio-first
 * otherwise, and falls through to the other provider on failure.
 * Returns ['ok'=>bool, 'provider'=>…, 'to'=>…] — audited either way.
 */
function sms_send(string $rawTo, string $text): array {
    $to = sms_normalize($rawTo);
    if ($to === '') return ['ok' => false, 'error' => 'bad_number'];
    if (!sms_enabled()) return ['ok' => false, 'error' => 'sms_disabled'];
    $text = mb_substr($text, 0, 450);
    $last = ['ok' => false, 'error' => 'sms_disabled'];
    foreach (sms_provider_order($to) as $prov) {
        $r = $prov === 'termii' ? sms_send_termii($to, $text) : sms_send_twilio($to, $text);
        if (!empty($r['ok'])) {
            try { audit('sms.sent', null, $to, ['provider' => $prov, 'chars' => mb_strlen($text)], ''); } catch (Throwable $e) {}
            return ['ok' => true, 'provider' => $prov, 'to' => $to];
        }
        $last = $r;
    }
    try { audit('sms.failed', null, $to, ['error' => (string)($last['error'] ?? '')], ''); } catch (Throwable $e) {}
    return ['ok' => false, 'error' => (string)($last['error'] ?? 'sms_failed'), 'to' => $to];
}
