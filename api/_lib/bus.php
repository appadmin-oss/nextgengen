<?php
declare(strict_types=1);

/**
 * Integration bus — one outbox, many destinations.
 *
 *   event_emit('registration.created', [...])        → outbox + fan-out
 *   php api/tools/dispatch-events.php                 → delivers with retries
 *
 * Destinations (admin-configured `integrations` rows):
 *   gchat   — Google Chat incoming webhook (cards for digests, text else)
 *   webhook — generic signed JSON POST (X-NGG-Signature: HMAC-SHA256)
 *   sheets  — Google Apps Script bridge (the Sheets mirror; DB stays the
 *             source of truth — the sheet is a one-way projection)
 *
 * Subscriptions: each integration lists event kinds ('*' matches all,
 * 'attendance.*' matches the prefix). Deliveries retry with exponential
 * backoff (max 8 attempts → dead) and every attempt is inspectable in the
 * deliveries log. Nothing here ever throws into a request path.
 */

const BUS_MAX_ATTEMPTS = 8;

/* ── Emit ─────────────────────────────────────────────────────────────────── */

function event_emit(string $kind, array $payload): string {
    try {
        $eventId = 'EV-' . strtoupper(rand_hex(8));
        db_insert('outbox', ['eventId' => $eventId, 'kind' => $kind, 'payload' => json_encode($payload, JSON_UNESCAPED_SLASHES), 'createdAt' => now_iso()]);
        foreach (db_all("SELECT integrationId, events FROM integrations WHERE status = 'active'") as $i) {
            if (!bus_subscribed((string)$i['events'], $kind)) continue;
            db_insert('deliveries', ['eventId' => $eventId, 'integrationId' => $i['integrationId'], 'status' => 'pending', 'attempts' => 0, 'nextAttemptAt' => now_iso(), 'createdAt' => now_iso()]);
        }
        return $eventId;
    } catch (Throwable $e) { return ''; }
}

function bus_subscribed(string $eventsJson, string $kind): bool {
    $list = json_decode($eventsJson, true);
    if (!is_array($list) || !$list) return false;
    foreach ($list as $pat) {
        $pat = (string)$pat;
        if ($pat === '*' || $pat === $kind) return true;
        if (substr($pat, -2) === '.*' && strpos($kind, substr($pat, 0, -1)) === 0) return true;
    }
    return false;
}

/* ── HTTP (https-only, private ranges blocked — admin-entered URLs) ───────── */

function bus_http_post(string $url, string $body, array $headers = []): array {
    // Test hook: the suite injects a mock so no network happens in CI.
    if (isset($GLOBALS['__bus_http_mock']) && is_callable($GLOBALS['__bus_http_mock'])) {
        return ($GLOBALS['__bus_http_mock'])($url, $body, $headers);
    }
    $p = parse_url($url);
    if (($p['scheme'] ?? '') !== 'https' || empty($p['host'])) return ['ok' => false, 'error' => 'bad_url'];
    $host = (string)$p['host'];
    $ipCheck = filter_var($host, FILTER_VALIDATE_IP) ? $host : null;
    if ($ipCheck && !filter_var($ipCheck, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return ['ok' => false, 'error' => 'private_host'];
    }
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
    ]);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($out === false) return ['ok' => false, 'error' => 'network', 'detail' => $err];
    // Apps Script answers 302 to a googleusercontent result URL on success.
    if ($code >= 300 && $code < 400 && strpos($url, 'script.google.com') !== false) return ['ok' => true, 'body' => ''];
    if ($code < 200 || $code >= 300) return ['ok' => false, 'error' => 'http_' . $code, 'detail' => substr((string)$out, 0, 300)];
    return ['ok' => true, 'body' => (string)$out];
}

/* ── Adapters ─────────────────────────────────────────────────────────────── */

function bus_deliver_one(array $integration, array $event): array {
    $cfg = json_decode((string)$integration['config'], true) ?: [];
    $kind = (string)$integration['kind'];
    $payload = json_decode((string)$event['payload'], true) ?: [];

    if ($kind === 'gchat') {
        $url = (string)($cfg['url'] ?? '');
        if (strpos($url, 'https://chat.googleapis.com/') !== 0) return ['ok' => false, 'error' => 'bad_gchat_url'];
        $msg = isset($payload['_gchat']) && is_array($payload['_gchat'])
            ? $payload['_gchat']                                    // pre-built card/text
            : ['text' => bus_gchat_text((string)$event['kind'], $payload)];
        return bus_http_post($url, json_encode($msg, JSON_UNESCAPED_SLASHES));
    }

    if ($kind === 'webhook') {
        $url = (string)($cfg['url'] ?? '');
        $secret = (string)($cfg['secret'] ?? '');
        $body = json_encode([
            'id' => $event['eventId'], 'event' => $event['kind'],
            'createdAt' => $event['createdAt'], 'data' => bus_strip_internal($payload),
        ], JSON_UNESCAPED_SLASHES);
        $ts = (string)time();
        $sig = hash_hmac('sha256', $ts . '.' . $body, $secret);
        return bus_http_post($url, $body, [
            'X-NGG-Event: ' . $event['kind'],
            'X-NGG-Delivery: ' . $event['eventId'],
            'X-NGG-Timestamp: ' . $ts,
            'X-NGG-Signature: sha256=' . $sig,
        ]);
    }

    if ($kind === 'sheets') {
        $url = (string)($cfg['url'] ?? '');
        if (strpos($url, 'https://script.google.com/') !== 0) return ['ok' => false, 'error' => 'bad_script_url'];
        $body = json_encode([
            'secret' => (string)($cfg['secret'] ?? ''),
            'event' => $event['kind'], 'id' => $event['eventId'],
            'createdAt' => $event['createdAt'], 'data' => bus_strip_internal($payload),
        ], JSON_UNESCAPED_SLASHES);
        return bus_http_post($url, $body);
    }

    return ['ok' => false, 'error' => 'unknown_kind'];
}

/** Keys prefixed with _ are adapter hints (e.g. _gchat), never delivered. */
function bus_strip_internal(array $payload): array {
    foreach (array_keys($payload) as $k) if (is_string($k) && $k !== '' && $k[0] === '_') unset($payload[$k]);
    return $payload;
}

/** Default, readable Chat line for events without a pre-built card. */
function bus_gchat_text(string $kind, array $p): string {
    $bits = [];
    foreach (bus_strip_internal($p) as $k => $v) {
        if (is_scalar($v)) $bits[] = $k . ': ' . $v;
        if (count($bits) >= 6) break;
    }
    return '*' . $kind . '*' . ($bits ? "\n" . implode(' · ', $bits) : '');
}

/* ── Dispatcher (cron / CLI) ──────────────────────────────────────────────── */

function deliveries_dispatch(int $limit = 25): array {
    $due = db_all("SELECT * FROM deliveries WHERE status IN ('pending','failed') AND nextAttemptAt <= ? ORDER BY id ASC LIMIT " . (int)$limit, [now_iso()]);
    $done = 0; $failed = 0;
    foreach ($due as $d) {
        $integration = db_row('SELECT * FROM integrations WHERE integrationId = ? LIMIT 1', [$d['integrationId']]);
        $event = db_row('SELECT * FROM outbox WHERE eventId = ? LIMIT 1', [$d['eventId']]);
        if (!$integration || !$event || $integration['status'] !== 'active') {
            db_update('deliveries', ['status' => 'dead', 'lastError' => 'destination_gone'], ['id' => $d['id']]);
            continue;
        }
        $r = bus_deliver_one($integration, $event);
        if (!empty($r['ok'])) {
            db_update('deliveries', ['status' => 'ok', 'deliveredAt' => now_iso(), 'lastError' => ''], ['id' => $d['id']]);
            $done++;
        } else {
            $attempts = (int)$d['attempts'] + 1;
            $dead = $attempts >= BUS_MAX_ATTEMPTS;
            db_update('deliveries', [
                'status' => $dead ? 'dead' : 'failed',
                'attempts' => $attempts,
                'lastError' => substr((string)($r['error'] ?? 'failed') . ' ' . (string)($r['detail'] ?? ''), 0, 300),
                'nextAttemptAt' => gmdate('Y-m-d\TH:i:s\Z', time() + min(3600, (2 ** $attempts) * 30)),
            ], ['id' => $d['id']]);
            $failed++;
        }
    }
    return ['ok' => true, 'attempted' => count($due), 'delivered' => $done, 'failed' => $failed];
}

/** Admin "Send test" — fires a synthetic event at ONE destination, now. */
function integration_test_fire(array $integration): array {
    $event = [
        'eventId' => 'EV-TEST-' . strtoupper(rand_hex(4)),
        'kind' => 'test.ping',
        'createdAt' => now_iso(),
        'payload' => json_encode(['message' => 'NGG test delivery — your destination is wired correctly.', 'site' => (string)($GLOBALS['CONFIG']['app_origin'] ?? '')]),
    ];
    return bus_deliver_one($integration, $event);
}
