<?php
declare(strict_types=1);

/**
 * SMS layer — textbee (your own Android phone's SIM, via textbee.dev), Termii
 * (Nigeria-first) and Twilio (everything else / fallback).
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
    return !empty($c['textbee']['api_key']) || !empty($c['termii']['api_key']) || (!empty($c['twilio']['sid']) && !empty($c['twilio']['token']));
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

/**
 * Provider order for a number. A Nigerian number goes out on textbee first —
 * the programme's own phone and SIM, at local rates and from a number parents
 * recognise — then Termii, then Twilio. Anything else goes Twilio first; the
 * phone's SIM (international rates) and Termii are the fallbacks.
 */
function sms_provider_order(string $e164): array {
    $c = sms_config();
    $textbee = !empty($c['textbee']['api_key']);
    $termii = !empty($c['termii']['api_key']);
    $twilio = !empty($c['twilio']['sid']) && !empty($c['twilio']['token']);
    $order = [];
    if (strpos($e164, '+234') === 0) { if ($textbee) $order[] = 'textbee'; if ($termii) $order[] = 'termii'; if ($twilio) $order[] = 'twilio'; }
    else { if ($twilio) $order[] = 'twilio'; if ($textbee) $order[] = 'textbee'; if ($termii) $order[] = 'termii'; }
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

/**
 * textbee.dev — POST https://api.textbee.dev/api/v1/gateway/send-sms with the
 * `x-api-key` header and {recipients: [E.164], message, deviceId?,
 * simSubscriptionId?}. A 200 means QUEUED on the phone, not delivered
 * (`data.success`, `data.smsBatchId`); 400 is no enabled device, 401 a bad
 * key, 429 a plan limit — each falls through to the next provider.
 */
function sms_send_textbee(string $to, string $text): array {
    $c = sms_config()['textbee'] ?? [];
    $body = ['recipients' => [$to], 'message' => $text];
    if (trim((string)($c['device_id'] ?? '')) !== '') $body['deviceId'] = trim((string)$c['device_id']);
    if (trim((string)($c['sim'] ?? '')) !== '' && ctype_digit(trim((string)$c['sim']))) $body['simSubscriptionId'] = (int)$c['sim'];
    $r = sms_http('https://api.textbee.dev/api/v1/gateway/send-sms', [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-api-key: ' . (string)($c['api_key'] ?? '')],
    ]);
    if (empty($r['ok'])) return $r;
    $j = json_decode((string)($r['body'] ?? ''), true);
    if (!is_array($j) || empty($j['data']['success'])) return ['ok' => false, 'error' => 'textbee_not_queued', 'detail' => substr((string)($r['body'] ?? ''), 0, 200)];
    return ['ok' => true, 'body' => (string)$r['body'], 'ref' => (string)($j['data']['smsBatchId'] ?? '')];
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
        $r = $prov === 'textbee' ? sms_send_textbee($to, $text) : ($prov === 'termii' ? sms_send_termii($to, $text) : sms_send_twilio($to, $text));
        if (!empty($r['ok'])) {
            try { audit('sms.sent', null, $to, ['provider' => $prov, 'chars' => mb_strlen($text)] + (!empty($r['ref']) ? ['ref' => $r['ref']] : []), ''); } catch (Throwable $e) {}
            return ['ok' => true, 'provider' => $prov, 'to' => $to];
        }
        $last = $r;
    }
    try { audit('sms.failed', null, $to, ['error' => (string)($last['error'] ?? '')], ''); } catch (Throwable $e) {}
    return ['ok' => false, 'error' => (string)($last['error'] ?? 'sms_failed'), 'to' => $to];
}
