<?php
/**
 * domain/wifi-cacentre.php — NGG's people, and NGG's say about each, sent to
 * CACENTRE, which runs the Wi-Fi for the whole estate.
 *
 * CACENTRE is the authority: it holds the PINs, the routers fetch from it, and
 * its blocks and overrides win. NGG keeps a say — its access table and its
 * per-person overrides become a VERDICT on each person (on | limited | off,
 * with a reason in words), and CACENTRE never loosens past it. A child NGG
 * suspends is off at CACENTRE at the next push.
 *
 * We PUSH (the estate's rule: CACENTRE reads nobody's database). The roster
 * travels inside a signed envelope, the same v1.<payload>.<mac> shape as the
 * directory push, with its own key: WIFI_SECRET_NGG here and the same value in
 * CACENTRE's includes/.env. A Wi-Fi key is never the directory's key.
 *
 * WHAT TRAVELS: id, kind, name, email, the printed ID (their sign-in name),
 * the centre's card code as the home site, the verdict and its reason, and a
 * participant's edition end date. Nothing about money beyond "fees owing" as a
 * reason, nothing medical, no guardian details.
 *
 * Data allowances are CACENTRE's now: NGG's own usage is left out of the
 * verdict, or the same megabytes would be counted against somebody twice.
 */

/** Must match WifiStore::ROSTER_MAX at CACENTRE: one push carries at most this many. */
const WIFI_CAC_MAX = 5000;
const WIFI_CAC_TTL = 300;          // WifiEnvelope::TTL
const WIFI_CAC_EVERY = 900;        // seconds between pushes from the web-cron tick
const WIFI_CAC_LAST = 'wifi_cac_last';

function wifi_cac_secret(): string {
    $v = getenv('WIFI_SECRET_NGG');
    if ($v !== false && trim((string)$v) !== '') return trim((string)$v);
    return trim((string)($GLOBALS['CONFIG']['wifi']['cacentre_secret'] ?? ''));
}

/** Configured? A placeholder or a short key counts as absent (as dirpush_ready). */
function wifi_cac_ready(): bool {
    $s = wifi_cac_secret();
    return strlen($s) >= 32 && !preg_match('/^<.*>$/s', $s) && !preg_match('/x{8,}/i', $s)
        && !preg_match('/^(your|changeme|replace|example|todo)/i', $s);
}

function wifi_cac_base(): string {
    $b = trim((string)(getenv('WIFI_CACENTRE_URL') ?: ($GLOBALS['CONFIG']['wifi']['cacentre_url'] ?? ($GLOBALS['CONFIG']['dir_push_url'] ?? ''))));
    return rtrim($b !== '' ? $b : 'https://cacentre.afrovanguard.org.ng', '/');
}

function wifi_cac_b64(string $raw): string { return rtrim(strtr(base64_encode($raw), '+/', '-_'), '='); }

/** The signed envelope CACENTRE's WifiEnvelope::verify() reads. */
function wifi_cac_mint(string $typ, array $claims, ?string $secret = null, ?int $now = null): string {
    $now = $now ?? time();
    $body = wifi_cac_b64((string)json_encode($claims + ['iss' => 'ngg', 'typ' => $typ, 'nonce' => bin2hex(random_bytes(12)), 'iat' => $now, 'exp' => $now + WIFI_CAC_TTL],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    return 'v1.' . $body . '.' . wifi_cac_b64(hash_hmac('sha256', $body, $secret ?? wifi_cac_secret(), true));
}

/** POST a token to one of CACENTRE's Wi-Fi endpoints. Never throws. */
function wifi_cac_post(string $path, string $token): array {
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init(wifi_cac_base() . $path);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['token' => $token], JSON_UNESCAPED_SLASHES)]);
    $body = curl_exec($ch); $err = curl_error($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err !== '' || $body === false) { error_log('[wifi-cac] ' . ($err ?: 'no response')); return ['ok' => false, 'error' => 'unreachable']; }
    $j = json_decode((string)$body, true);
    if (!is_array($j)) return ['ok' => false, 'error' => 'bad_response', 'http' => $code];
    if (empty($j['ok'])) error_log('[wifi-cac] HTTP ' . $code . ' ' . substr((string)$body, 0, 300));
    return $j + ['http' => $code];
}

/** The reason CACENTRE shows a person, in NGG's words, for a case of the access table. */
function wifi_cac_why(string $case, string $access): string {
    if ($access === 'on' && in_array($case, ['member', 'staff', 'summer'], true)) return '';
    return WIFI_CASE_WORDS[$case] ?? $case;
}

/**
 * Everybody NGG speaks for, with NGG's verdict on each. One read per
 * population, policy, fees and overrides batched — never a query per person.
 * Summer-type member rows are not sent: those people are participants, sent
 * from summer_students within their edition's dates.
 */
function wifi_cac_people(): array {
    $codes = [];
    foreach (db_all('SELECT name, code FROM centres') as $c) $codes[(string)$c['name']] = strtolower(trim((string)$c['code']));
    $members = db_all('SELECT memberId, displayId, fullName, email, role, status, type, centre FROM members');
    $members = array_values(array_filter($members, fn($m) => member_is_ngg($m) || wifi_is_staff($m)));
    $ids = array_map(fn($m) => (string)$m['memberId'], $members);
    $policy = function_exists('policy_states_for') ? policy_states_for($ids, 'member') : [];
    $owing = wifi_fees_owing($ids);

    $today = attendance_today();
    $eds = $parts = [];
    foreach (db_all("SELECT cohortId, startDate, endDate FROM summer_cohorts WHERE startDate <= ? AND endDate >= ? AND startDate <> '' AND endDate <> ''", [$today, $today]) as $e) $eds[(string)$e['cohortId']] = $e;
    if ($eds) {
        $ph = implode(',', array_fill(0, count($eds), '?'));
        $parts = db_all("SELECT studentId, displayId, fullName, cohortId, status, regStatus, centre FROM summer_students WHERE cohortId IN ($ph)", array_keys($eds));
    }

    $subjects = array_merge(array_map(fn($m) => ['member', (string)$m['memberId']], $members), array_map(fn($s) => ['summer', (string)$s['studentId']], $parts));
    $acc = wifi_accounts_existing($subjects);

    $out = [];
    foreach ($members as $m) {
        $id = (string)$m['memberId']; $staff = wifi_is_staff($m);
        $d = wifi_access_for($m, ['settings' => wifi_settings((string)$m['centre']), 'policy' => $policy[$id] ?? null, 'feesOwing' => !empty($owing[$id]),
            'account' => $acc['member|' . $id] ?? null, 'usage' => null]);
        $out[] = ['id' => $id, 'kind' => $staff ? 'staff' : 'member', 'name' => trim((string)$m['fullName']), 'email' => strtolower(trim((string)$m['email'])),
            'printedId' => wifi_username_for('member', $m), 'homeSite' => $staff ? '' : ($codes[(string)$m['centre']] ?? ''),
            'verdict' => $d['access'], 'why' => wifi_cac_why($d['case'], $d['access']), 'validUntil' => ''];
    }
    foreach ($parts as $s) {
        $id = (string)$s['studentId']; $ed = $eds[(string)$s['cohortId']] ?? null;
        $d = wifi_access_for_participant($s, $ed, ['settings' => wifi_settings((string)$s['centre']), 'account' => $acc['summer|' . $id] ?? null, 'today' => $today, 'usage' => null]);
        $out[] = ['id' => 'summer-' . $id, 'kind' => 'participant', 'name' => trim((string)$s['fullName']), 'email' => '',
            'printedId' => wifi_username_for('summer', $s), 'homeSite' => $codes[(string)$s['centre']] ?? '',
            'verdict' => $d['access'], 'why' => wifi_cac_why($d['case'], $d['access']), 'validUntil' => (string)($ed['endDate'] ?? '')];
    }
    return $out;
}

/**
 * Send everybody. One full push when the list fits (anybody NGG no longer
 * sends loses Wi-Fi there); several partial pushes when it does not, which
 * withdraw nobody — said so in the result rather than hidden.
 */
function wifi_cac_push(string $by = 'cron'): array {
    if (!wifi_cac_ready()) return ['ok' => false, 'error' => 'not_configured'];
    $people = wifi_cac_people();
    $chunks = array_chunk($people, WIFI_CAC_MAX) ?: [[]];
    $full = count($chunks) === 1;
    $r = ['ok' => true, 'at' => now_iso(), 'by' => $by, 'sent' => count($people), 'full' => $full, 'applied' => 0, 'refused' => 0, 'gone' => 0,
          'unknownSites' => [], 'refusals' => [], 'error' => ''];
    foreach ($chunks as $chunk) {
        $res = wifi_cac_post('/api/wifi-roster.php?issuer=ngg', wifi_cac_mint('wifi.roster', ['full' => $full, 'people' => $chunk]));
        if (empty($res['ok'])) { $r['ok'] = false; $r['error'] = (string)($res['error'] ?? 'refused'); break; }
        $r['applied'] += (int)($res['applied'] ?? 0); $r['refused'] += (int)($res['refused'] ?? 0); $r['gone'] += (int)($res['gone'] ?? 0);
        foreach ((array)($res['unknownSites'] ?? []) as $code => $n) $r['unknownSites'][(string)$code] = ($r['unknownSites'][(string)$code] ?? 0) + (int)$n;
        foreach ((array)($res['results'] ?? []) as $x) if (empty($x['ok']) && count($r['refusals']) < 20) $r['refusals'][] = ['id' => (string)($x['id'] ?? ''), 'error' => (string)($x['error'] ?? '')];
    }
    $r['partial'] = !$r['ok'] || $r['refused'] > 0;
    setting_set(WIFI_CAC_LAST, $r, $by);
    return $r;
}

/** The web-cron tick: nothing at all until a key is set. */
function wifi_cac_tick(): array {
    if (!wifi_cac_ready()) return ['skipped' => 'no key'];
    return wifi_cac_push('cron');
}

/** Only somebody who sees every centre's Wi-Fi speaks for all of NGG's people. */
function wifi_cac_gate(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    if ($g['scope'] !== null) return ['ok' => false, 'error' => 'super_admin_only'];
    return $g;
}

function admin_wifi_cac_status(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $last = setting_get(WIFI_CAC_LAST);
    return ['ok' => true, 'configured' => wifi_cac_ready(), 'url' => wifi_cac_base(), 'every' => WIFI_CAC_EVERY,
            'canSend' => $g['scope'] === null, 'last' => is_array($last) ? $last : null];
}

function admin_wifi_cac_push(array $p): array {
    $g = wifi_cac_gate($p); if (!$g['ok']) return $g;
    $r = wifi_cac_push((string)$g['requester']['memberId']);
    audit('wifi.cacentre.push', (string)$g['requester']['memberId'], 'ngg', ['sent' => $r['sent'] ?? 0, 'applied' => $r['applied'] ?? 0, 'refused' => $r['refused'] ?? 0, 'error' => $r['error'] ?? '']);
    return $r;
}
