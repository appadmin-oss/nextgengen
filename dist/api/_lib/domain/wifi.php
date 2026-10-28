<?php
declare(strict_types=1);

/**
 * Wi-Fi at the centres — accounts, the access table and the gateways' feed.
 *
 * A centre's Wi-Fi is run by a GATEWAY: a MikroTik router, an OpenWrt router
 * running openNDS, or a small RADIUS bridge that serves any controller that
 * speaks RADIUS (UniFi, TP-Link Omada, pfSense, OPNsense, Ruckus, Aruba…).
 * Shared hosting can neither run RADIUS nor reach a box behind NAT, so the
 * GATEWAY PULLS: every few minutes it fetches its centre's list from
 * wifi.feed with its own key, in the format its platform reads, and applies it.
 *
 * Access is DERIVED, never stored. wifi_access_for() is the one place the
 * table lives: a record's status, conduct, role and edition dates decide it;
 * the only stored decision is an override, with who made it and why. So a
 * suspension needs no Wi-Fi step — the next fetch removes them and the gateway
 * ends their session.
 *
 * The feed is computed, not logged. Each fetch builds the centre's current
 * list and compares it with what this gateway last CONFIRMED (ackedJson). The
 * gateway confirms by sending back the version it was handed; a fetch it failed
 * to apply is sent again. Nothing has to remember to "bump" anything when a
 * record changes, which is exactly where such feeds drift.
 *
 * The profiles' speeds, devices and hours ride the feed too, so a change in
 * the Control Room reaches every gateway without anybody re-running a setup.
 *
 * PINs are sealed (AES-256-GCM, key derived from the app secret), not hashed:
 * the gateway has to be handed them. They are for Wi-Fi only, never a password.
 */

/* ── The platforms ────────────────────────────────────────────────────────
   What each can do decides what the screens offer and what the diagnosis
   checks; `format` is what its feed is written in. */
const WIFI_PLATFORMS = [
    'mikrotik' => ['label' => 'MikroTik (RouterOS 7)', 'format' => 'text', 'delta' => true, 'status' => 'pilot',
        'can' => ['profiles' => true, 'kick' => true, 'devices' => true, 'remember' => true, 'filter' => true, 'usage' => true],
        'needs' => 'A MikroTik router on RouterOS 7 (7.19 or newer trusts NGG’s certificate with nothing to import) with its hotspot on the members’ network. The setup uses the router’s own hotspot users, not the User Manager package.',
        'pilot' => 'The script follows MikroTik’s RouterOS 7 manual. Run it on one centre’s router and watch it for a week before the others.'],
    'radius'   => ['label' => 'RADIUS bridge (UniFi, Omada, pfSense, OPNsense…)', 'format' => 'radius', 'delta' => false, 'status' => 'pilot',
        'can' => ['profiles' => true, 'kick' => false, 'devices' => true, 'remember' => false, 'filter' => false, 'usage' => false],
        'needs' => 'A small always-on Linux machine at the centre (a Raspberry Pi is enough) running FreeRADIUS, and a Wi-Fi controller or firewall whose guest portal can check sign-ins against a RADIUS server.',
        'pilot' => 'Sign-in works with any controller that sends its portal sign-ins to RADIUS. Speed limits are confirmed for pfSense and Omada; test UniFi’s before relying on them. Removing somebody takes effect at their next sign-in, or within a minute on pfSense with re-authentication on.'],
    'openwrt'  => ['label' => 'OpenWrt with openNDS', 'format' => 'text', 'delta' => true, 'status' => 'pilot',
        'can' => ['profiles' => true, 'kick' => true, 'devices' => false, 'remember' => false, 'filter' => true, 'usage' => false],
        'needs' => 'OpenWrt 23.05 or newer with the opennds, ca-bundle and libustream-mbedtls packages.',
        'pilot' => 'The list and the sign-out work as documented by openNDS; the sign-in page that asks for the ID and PIN must be proven on one router first.'],
    'generic'  => ['label' => 'Anything else (JSON feed)', 'format' => 'json', 'delta' => true, 'status' => 'ready',
        'can' => ['profiles' => true, 'kick' => true, 'devices' => true, 'remember' => true, 'filter' => false, 'usage' => true],
        'needs' => 'Your own script or controller integration that can fetch HTTPS with two headers and apply a JSON list.',
        'pilot' => ''],
];

const WIFI_PROFILES = ['ngg-member', 'ngg-staff', 'ngg-limited', 'ngg-summer', 'ngg-guest'];
/* Speeds in Mbit/s, devices per person, an optional daily window, a short
   burst (twice the speed for the first seconds, so pages open fast while a
   long download still gets the steady rate), and a priority from 1 (first)
   to 8 (last) for when the line is busy. dayMb / monthMb: the data allowance
   (0 for none); over it, the access table's "overLimit" case applies
   (domain/wifi-usage.php). */
const WIFI_PROFILE_DEFAULTS = [
    'ngg-member'  => ['down' => 10, 'up' => 5,  'devices' => 1, 'hours' => '', 'burst' => true,  'priority' => 5, 'dayMb' => 0, 'monthMb' => 0],
    'ngg-staff'   => ['down' => 25, 'up' => 10, 'devices' => 2, 'hours' => '', 'burst' => true,  'priority' => 2, 'dayMb' => 0, 'monthMb' => 0],
    'ngg-limited' => ['down' => 1,  'up' => 1,  'devices' => 1, 'hours' => '', 'burst' => false, 'priority' => 8, 'dayMb' => 0, 'monthMb' => 0],
    'ngg-summer'  => ['down' => 5,  'up' => 2,  'devices' => 1, 'hours' => '', 'burst' => true,  'priority' => 6, 'dayMb' => 0, 'monthMb' => 0],
    'ngg-guest'   => ['down' => 2,  'up' => 1,  'devices' => 1, 'hours' => '', 'burst' => false, 'priority' => 7, 'dayMb' => 0, 'monthMb' => 0],
];
const WIFI_SLOW_MBPS = 5;              // a line measured below this is called slow
const WIFI_SPEED_BYTES_MAX = 25000000; // the most one speed-test download may ask for
const WIFI_ACCESS = ['on', 'limited', 'off'];
/* The cases of the access table, with their defaults. `blocked` is fixed:
   a suspended, evicted or inactive record is off, whatever the table says. */
const WIFI_CASE_DEFAULTS = [
    'member'    => 'on',
    'staff'     => 'on',
    'dormant'   => 'limited',
    'graduated' => 'off',
    'summer'    => 'on',
    'feesOwing' => 'limited',
    'overLimit' => 'limited',
    'blocked'   => 'off',
];
const WIFI_CASE_LOCKED = ['blocked'];
const WIFI_CASE_WORDS = [
    'member'    => 'An active NGG member',
    'staff'     => 'Staff, mentors and instructors',
    'dormant'   => 'On the Dormant Track',
    'graduated' => 'Graduated',
    'summer'    => 'A Summer School participant, within their edition’s dates',
    'feesOwing' => 'Fees owing (only when that rule is switched on)',
    'overLimit' => 'Used up their data allowance (for today or this month)',
    'blocked'   => 'Suspended, evicted or inactive',
    'override'  => 'Set by hand for this person',
    'outside'   => 'Outside their edition’s dates',
    'not_member'=> 'Not an NGG member record',
    'no_id'     => 'No printed ID yet',
];
const WIFI_PIN_RESETS_PER_DAY = 3;
const WIFI_FULL_EVERY = 86400;          // a full list at least daily, whatever the deltas say
const WIFI_STALE_AFTER = 3600;          // a gateway silent this long is a problem
const WIFI_POLL = ['busy' => 60, 'warm' => 120, 'idle' => 300];   // seconds; the feed says which
const WIFI_STAFF_ROLES_EXTRA = ['mentor', 'instructor'];
const WIFI_LIST_TTL = 60;              // seconds a centre's computed list is kept (config: wifi.list_ttl)

/* ── Who sees which centres' Wi-Fi ─────────────────────────────────────────
   A super admin: every centre. A Wi-Fi region lead: their regions' centres.
   Anybody else holding `network`: the centres in their centreScope, or — with
   none — their own centre only. An NGG admin manages their centre's Wi-Fi,
   never the whole network's. Returns null (every centre) or the names. */
function wifi_scope(array $requester): ?array {
    if (strtolower((string)($requester['role'] ?? '')) === 'super_admin') return null;
    $names = admin_centre_names_in_scope($requester) ?? [];
    foreach (db_all("SELECT rc.centre FROM wifi_region_leads l JOIN wifi_regions g ON g.regionId = l.regionId AND (g.removedAt = '' OR g.removedAt IS NULL)
                     JOIN wifi_region_centres rc ON rc.regionId = l.regionId WHERE l.memberId = ?", [(string)$requester['memberId']]) as $r) $names[] = (string)$r['centre'];
    if (!$names && (string)($requester['centre'] ?? '') !== '') $names[] = (string)$requester['centre'];
    return array_values(array_unique($names));
}
function wifi_scope_has(?array $scope, string $centre): bool { return $scope === null || in_array($centre, $scope, true); }

/** The `network` gate with the Wi-Fi scope attached ($g['scope']). */
function wifi_gate(array $p): array {
    $g = admin_cap_gate($p, 'network'); if (!$g['ok']) return $g;
    $g['scope'] = wifi_scope($g['requester']);
    return $g;
}

/** A gateway the requester may act on, or a refusal. */
function wifi_gateway_for(array $g, string $id): array {
    $r = wifi_gateway_live($id);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if (!wifi_scope_has($g['scope'], (string)$r['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    return ['ok' => true, 'row' => $r];
}

/* ── Settings: the access table and the profiles ──────────────────────── */

/**
 * The settings for a centre: the network's access table and profiles, with the
 * profiles of the centre's Wi-Fi region laid over them, and the centre's own
 * laid over that (wifi_profile_overrides). Only overrides are stored, so a
 * change to the network's default reaches every centre that has not set its
 * own. With no centre: the network's. The access table itself is the
 * network's only — who gets Wi-Fi is one rule for the programme.
 */
function wifi_settings(?string $centre = null): array {
    $memo = &$GLOBALS['__wifi_settings_memo'];
    $k = $centre ?? '';
    if (isset($memo[$k])) return $memo[$k];
    $base = wifi_settings_base();
    if ($centre === null || $centre === '') return $memo[$k] = $base;
    $region = wifi_region_of($centre);
    $layers = [];
    if ($region !== '') $layers['region'] = db_row("SELECT profilesJson FROM wifi_profile_overrides WHERE regionId = ? AND centre = '' LIMIT 1", [$region]);
    $layers['centre'] = db_row("SELECT profilesJson FROM wifi_profile_overrides WHERE regionId = '' AND centre = ? LIMIT 1", [$centre]);
    $from = array_fill_keys(array_keys($base['profiles']), 'network');
    foreach ($layers as $layer => $row) {
        foreach ($row ? (json_decode((string)$row['profilesJson'], true) ?: []) : [] as $name => $v) {
            if (!isset($base['profiles'][$name]) || !is_array($v)) continue;
            $merged = $v + $base['profiles'][$name];
            if (wifi_profile_check($merged) !== '') continue;
            $base['profiles'][$name] = wifi_profile_norm($merged);
            $from[$name] = $layer;
        }
    }
    $base['profilesFrom'] = $from;
    $base['regionId'] = $region;
    return $memo[$k] = $base;
}

/** Forget this request's settings, after one is saved. */
function wifi_settings_forget(): void { $GLOBALS['__wifi_settings_memo'] = []; }

/** The centre's Wi-Fi region id, or ''. */
function wifi_region_of(string $centre): string {
    $r = db_row("SELECT rc.regionId FROM wifi_region_centres rc JOIN wifi_regions g ON g.regionId = rc.regionId AND (g.removedAt = '' OR g.removedAt IS NULL) WHERE rc.centre = ? LIMIT 1", [$centre]);
    return $r ? (string)$r['regionId'] : '';
}

/** The network's own access table and profiles. */
function wifi_settings_base(): array {
    $s = setting_get('wifi_access');
    $s = is_array($s) ? $s : [];
    $cases = WIFI_CASE_DEFAULTS;
    foreach ((array)($s['cases'] ?? []) as $k => $v) {
        if (isset($cases[$k]) && !in_array($k, WIFI_CASE_LOCKED, true) && in_array($v, WIFI_ACCESS, true)) $cases[$k] = $v;
    }
    $profiles = WIFI_PROFILE_DEFAULTS;
    foreach ((array)($s['profiles'] ?? []) as $k => $v) {
        if (isset($profiles[$k]) && is_array($v) && wifi_profile_check($v + $profiles[$k]) === '') $profiles[$k] = wifi_profile_norm($v + $profiles[$k]);
    }
    return ['cases' => $cases, 'feesRule' => !empty($s['feesRule']), 'profiles' => $profiles];
}

function wifi_profile_norm(array $v): array {
    return ['down' => (int)$v['down'], 'up' => (int)$v['up'], 'devices' => (int)$v['devices'], 'hours' => trim((string)($v['hours'] ?? '')),
            'burst' => !empty($v['burst']), 'priority' => (int)($v['priority'] ?? 5), 'dayMb' => (int)($v['dayMb'] ?? 0), 'monthMb' => (int)($v['monthMb'] ?? 0)];
}
/** '' when the profile is usable, else what is wrong with it. */
function wifi_profile_check(array $v): string {
    foreach (['down', 'up'] as $k) if (!isset($v[$k]) || !is_numeric($v[$k]) || (int)$v[$k] < 1 || (int)$v[$k] > 1000) return 'Speeds are whole Mbit/s from 1 to 1000.';
    if (!isset($v['devices']) || !is_numeric($v['devices']) || (int)$v['devices'] < 1 || (int)$v['devices'] > 5) return 'Devices is 1 to 5.';
    $h = trim((string)($v['hours'] ?? ''));
    if (isset($v['priority']) && (!is_numeric($v['priority']) || (int)$v['priority'] < 1 || (int)$v['priority'] > 8)) return 'Priority is 1 (first) to 8 (last).';
    foreach (['dayMb', 'monthMb'] as $k) if (isset($v[$k]) && (!is_numeric($v[$k]) || (int)$v[$k] < 0 || (int)$v[$k] > 10000000)) return 'A data allowance is whole MB from 0 (none) to 10,000,000.';
    if ((int)($v['dayMb'] ?? 0) > 0 && (int)($v['monthMb'] ?? 0) > 0 && (int)$v['dayMb'] > (int)$v['monthMb']) return 'The daily allowance can’t be more than the monthly one.';
    if ($h !== '' && (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/', $h, $m) || $m[1] . $m[2] >= $m[3] . $m[4])) return 'Hours are blank (all day) or like 08:00-18:00.';
    return '';
}

/* ── PINs ─────────────────────────────────────────────────────────────── */

function wifi_cipher_key(): string {
    return hash('sha256', 'wifi-pin|' . (string)($GLOBALS['CONFIG']['cookie_secret'] ?? ''), true);
}
function wifi_pin_seal(string $pin): string {
    $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($pin, 'aes-256-gcm', wifi_cipher_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return $ct === false ? '' : 'v1:' . base64_encode($iv . $tag . $ct);
}
function wifi_pin_open(string $sealed): string {
    if (strncmp($sealed, 'v1:', 3) !== 0) return '';
    $raw = base64_decode(substr($sealed, 3), true);
    if ($raw === false || strlen($raw) < 29) return '';
    $pt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', wifi_cipher_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $pt === false ? '' : $pt;
}
function wifi_pin_new(): string { return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); }

/* ── Who is who ───────────────────────────────────────────────────────── */

function wifi_is_staff(array $m): bool {
    $role = strtolower((string)($m['role'] ?? ''));
    return is_admin_role($role) || in_array($role, WIFI_STAFF_ROLES_EXTRA, true);
}

/** The sign-in name: the printed ID, or the record id while there is none. */
function wifi_username_for(string $type, array $row): string {
    $u = trim((string)($row['displayId'] ?? ''));
    if ($u === '') $u = trim((string)($type === 'summer' ? ($row['studentId'] ?? '') : ($row['memberId'] ?? '')));
    return preg_match('/^[A-Za-z0-9._-]{1,64}$/', $u) ? $u : '';
}

/**
 * THE access table. $m is a members row; $ctx carries what a roster already
 * read in one batch: 'policy' (policy_states_for), 'feesOwing', 'account'
 * (its wifi_accounts row, for an override) and 'settings'.
 * Returns ['access' => on|limited|off, 'profile' => …|'', 'case' => …].
 */
function wifi_access_for(array $m, array $ctx = []): array {
    $cfg = $ctx['settings'] ?? wifi_settings();
    $acc = $ctx['account'] ?? null;
    $staff = wifi_is_staff($m);
    $status = strtolower((string)($m['status'] ?? 'active'));
    $conduct = (string)(($ctx['policy'] ?? [])['state'] ?? 'clear');
    if (in_array($status, ['suspended', 'inactive'], true) || in_array($conduct, ['suspended', 'evicted'], true)) $case = 'blocked';
    elseif ($staff) $case = 'staff';
    elseif (!member_is_ngg($m)) $case = 'not_member';
    elseif (strpos($status, 'graduated') === 0) $case = 'graduated';
    elseif ($conduct === 'dormant') $case = 'dormant';
    elseif ($cfg['feesRule'] && !empty($ctx['feesOwing'])) $case = 'feesOwing';
    else $case = 'member';
    $access = $cfg['cases'][$case] ?? 'off';
    // Over their data allowance (for the profile they would have): the table's overLimit case.
    if ($access === 'on') {
        $use = array_key_exists('usage', $ctx) ? $ctx['usage'] : (wifi_usage_totals(['member|' . $m['memberId']])['member|' . $m['memberId']] ?? null);
        $over = wifi_usage_over($cfg['profiles'][wifi_profile('on', $staff ? 'staff' : 'member')] ?? null, $use);
        if ($over !== '' && ($cfg['cases']['overLimit'] ?? 'limited') !== 'on') { $case = 'overLimit'; $access = $cfg['cases']['overLimit'] ?? 'limited'; }
    }
    // A hand-set override wins, except over a block: a suspension is not undone from the Wi-Fi screen.
    if ($acc && in_array((string)$acc['override'], WIFI_ACCESS, true) && $case !== 'blocked') { $access = (string)$acc['override']; $case = 'override'; }
    return ['access' => $access, 'profile' => wifi_profile($access, $staff ? 'staff' : 'member'), 'case' => $case];
}

/** A Summer School participant: on within their edition's dates, if the table says so. */
function wifi_access_for_participant(array $s, ?array $edition, array $ctx = []): array {
    $cfg = $ctx['settings'] ?? wifi_settings();
    $acc = $ctx['account'] ?? null;
    $today = $ctx['today'] ?? attendance_today();
    $st = strtolower((string)($s['status'] ?? 'active'));
    $reg = (string)($s['regStatus'] ?? 'verified');
    if (!in_array($st, ['active', ''], true) || !in_array($reg, ['verified', ''], true)) $case = 'blocked';
    elseif (!$edition || (string)($edition['startDate'] ?? '') === '' || (string)($edition['endDate'] ?? '') === ''
        || $today < (string)$edition['startDate'] || $today > (string)$edition['endDate']) $case = 'outside';
    else $case = 'summer';
    $access = $case === 'summer' ? $cfg['cases']['summer'] : 'off';
    if ($access === 'on') {
        $k = 'summer|' . (string)($s['studentId'] ?? '');
        $use = array_key_exists('usage', $ctx) ? $ctx['usage'] : (wifi_usage_totals([$k])[$k] ?? null);
        if (wifi_usage_over($cfg['profiles']['ngg-summer'] ?? null, $use) !== '' && ($cfg['cases']['overLimit'] ?? 'limited') !== 'on') { $case = 'overLimit'; $access = $cfg['cases']['overLimit'] ?? 'limited'; }
    }
    if ($acc && in_array((string)$acc['override'], WIFI_ACCESS, true) && $case !== 'blocked') { $access = (string)$acc['override']; $case = 'override'; }
    return ['access' => $access, 'profile' => wifi_profile($access, 'summer'), 'case' => $case];
}

function wifi_profile(string $access, string $who): string {
    if ($access === 'limited') return 'ngg-limited';
    if ($access !== 'on') return '';
    return $who === 'staff' ? 'ngg-staff' : ($who === 'summer' ? 'ngg-summer' : 'ngg-member');
}

/* ── Accounts ─────────────────────────────────────────────────────────── */

/** Existing accounts for these subjects ([[type, id, username], …]), "type|id" => row. */
function wifi_accounts_existing(array $subjects): array {
    $out = [];
    foreach (array_chunk($subjects, 300) as $chunk) {
        $where = implode(' OR ', array_fill(0, count($chunk), '(subjectType = ? AND subjectId = ?)'));
        $args = [];
        foreach ($chunk as $s) { $args[] = $s[0]; $args[] = $s[1]; }
        foreach (db_all("SELECT * FROM wifi_accounts WHERE $where", $args) as $r) $out[$r['subjectType'] . '|' . $r['subjectId']] = $r;
    }
    return $out;
}

/**
 * The accounts for these subjects, made where missing (with a PIN) and given
 * the current sign-in name where the printed ID has since been minted.
 */
function wifi_accounts_ensure(array $subjects): array {
    $out = wifi_accounts_existing($subjects);
    $now = now_iso();
    foreach ($subjects as [$type, $id, $username]) {
        $k = $type . '|' . $id;
        if ($username === '') continue;
        if (!isset($out[$k])) {
            if (db_row('SELECT id FROM wifi_accounts WHERE username = ? LIMIT 1', [$username])) $username = $id;   // never two people on one name
            try {
                db_insert('wifi_accounts', ['subjectType' => $type, 'subjectId' => $id, 'username' => $username, 'pinSealed' => wifi_pin_seal(wifi_pin_new()),
                    'pinSetAt' => $now, 'createdAt' => $now, 'updatedAt' => $now]);
            } catch (Throwable $e) { /* a concurrent fetch made it first */ }
            $row = db_row('SELECT * FROM wifi_accounts WHERE subjectType = ? AND subjectId = ? LIMIT 1', [$type, $id]);
            if ($row) $out[$k] = $row;
        } elseif ((string)$out[$k]['username'] !== $username && !db_row('SELECT id FROM wifi_accounts WHERE username = ? LIMIT 1', [$username])) {
            db_update('wifi_accounts', ['username' => $username, 'updatedAt' => $now], ['id' => (int)$out[$k]['id']]);
            $out[$k]['username'] = $username;
        }
    }
    return $out;
}

function wifi_account_one(string $type, string $id, string $username): ?array {
    return wifi_accounts_ensure([[$type, $id, $username]])[$type . '|' . $id] ?? null;
}

/* ── A centre's list ──────────────────────────────────────────────────── */

/**
 * Everybody with access at this centre, as username => [pin, profile].
 * Members of the centre, every staff account (staff work at every centre),
 * and the participants of a live edition at the centre. One read per
 * population, policy and fees batched — never a query per person.
 */
function wifi_centre_lines(string $centre, ?array $settings = null): array {
    $cfg = $settings ?? wifi_settings($centre);
    /* At hundreds of centres, each gateway fetching every two minutes, this
       list is the cost. It is kept for WIFI_LIST_TTL seconds per centre — the
       PINs SEALED, never in the clear — and keyed on the settings, so a speed
       change is not served stale. A change to one person's Wi-Fi made here
       (an override, a new PIN) drops their centre's copy at once; a change to
       a record elsewhere (a suspension) reaches the list within the TTL. */
    $ttl = (int)($GLOBALS['CONFIG']['wifi']['list_ttl'] ?? WIFI_LIST_TTL);
    $ckey = 'wifi-lines-' . md5($centre);
    $stamp = md5(json_encode([$cfg['cases'], $cfg['feesRule'], $cfg['profiles']]));
    $raw = $ttl > 0 ? cache_get($ckey, $ttl, $stamp) : null;
    if (!is_array($raw)) {
        $raw = wifi_centre_lines_raw($centre, $cfg);
        if ($ttl > 0) cache_put($ckey, $raw, $stamp);
    }
    $lines = [];
    $clock = wifi_local_clock();
    foreach ($raw as $u => [$sealed, $profile]) {
        /* Hours are kept here, for every platform: outside their profile's
           window somebody is left off the list, so the next fetch signs them
           out. (No gateway this supports keeps a daily window reliably itself.) */
        if (!wifi_in_hours($cfg['profiles'][$profile]['hours'] ?? '', $clock)) continue;
        $pin = wifi_pin_open((string)$sealed);
        if ($pin === '') continue;
        $lines[(string)$u] = ['pin' => $pin, 'profile' => $profile];
    }
    ksort($lines, SORT_STRING);
    return $lines;
}

/** Drop a centre's kept list, so the next fetch recomputes it. */
function wifi_lines_forget(string $centre): void { if ($centre !== '') cache_delete('wifi-lines-' . md5($centre)); }

/** The centre's list before hours: username => [sealed PIN, profile]. */
function wifi_centre_lines_raw(string $centre, array $cfg): array {
    $staffRoles = array_merge(staff_role_names(), WIFI_STAFF_ROLES_EXTRA);
    $ph = implode(',', array_fill(0, count($staffRoles), '?'));
    $members = db_all("SELECT memberId, displayId, role, status, type, centre FROM members
                        WHERE centre = ? OR LOWER(role) IN ($ph)", array_merge([$centre], $staffRoles));
    $ids = array_map(fn($m) => (string)$m['memberId'], $members);
    $policy = function_exists('policy_states_for') ? policy_states_for($ids, 'member') : [];
    $owing = $cfg['feesRule'] ? wifi_fees_owing($ids) : [];

    $parts = [];
    $today = attendance_today();
    $eds = [];
    foreach (db_all("SELECT cohortId, startDate, endDate FROM summer_cohorts WHERE startDate <= ? AND endDate >= ? AND startDate <> '' AND endDate <> ''", [$today, $today]) as $e) $eds[(string)$e['cohortId']] = $e;
    if ($eds) {
        $eph = implode(',', array_fill(0, count($eds), '?'));
        $parts = db_all("SELECT studentId, displayId, cohortId, status, regStatus, centre FROM summer_students WHERE centre = ? AND cohortId IN ($eph)", array_merge([$centre], array_keys($eds)));
    }

    // Everybody's use this month, read once for the whole list (domain/wifi-usage.php).
    $usage = wifi_usage_totals(array_merge(array_map(fn($m) => 'member|' . $m['memberId'], $members), array_map(fn($s) => 'summer|' . $s['studentId'], $parts)));
    $subjects = $decide = [];
    foreach ($members as $m) {
        $subjects[] = ['member', (string)$m['memberId'], wifi_username_for('member', $m)];
        $decide['member|' . $m['memberId']] = fn($acc) => wifi_access_for($m, ['settings' => $cfg, 'policy' => $policy[(string)$m['memberId']] ?? null, 'feesOwing' => !empty($owing[(string)$m['memberId']]), 'account' => $acc, 'usage' => $usage['member|' . $m['memberId']] ?? null]);
    }
    foreach ($parts as $s) {
        $subjects[] = ['summer', (string)$s['studentId'], wifi_username_for('summer', $s)];
        $decide['summer|' . $s['studentId']] = fn($acc) => wifi_access_for_participant($s, $eds[(string)$s['cohortId']] ?? null, ['settings' => $cfg, 'account' => $acc, 'today' => $today, 'usage' => $usage['summer|' . $s['studentId']] ?? null]);
    }
    // Existing accounts first (an override may turn somebody on); only people who will be on the list are given one.
    $existing = wifi_accounts_existing($subjects);
    $need = [];
    foreach ($subjects as $sub) {
        $k = $sub[0] . '|' . $sub[1];
        if ($sub[2] !== '' && ($decide[$k])($existing[$k] ?? null)['access'] !== 'off') $need[] = $sub;
    }
    $accounts = wifi_accounts_ensure($need);
    $raw = [];
    foreach ($need as $sub) {
        $k = $sub[0] . '|' . $sub[1];
        $acc = $accounts[$k] ?? null;
        if (!$acc) continue;
        $d = ($decide[$k])($acc);
        if ($d['access'] === 'off' || $d['profile'] === '') continue;
        $raw[(string)$acc['username']] = [(string)$acc['pinSealed'], $d['profile']];
    }
    return $raw;
}

/** The centre's local time as HH:MM — the same clock attendance uses. */
function wifi_local_clock(?int $at = null): string {
    $off = function_exists('attendance_settings') ? (int)(attendance_settings()['tzOffset'] ?? 60) : 60;
    return gmdate('H:i', ($at ?? time()) + $off * 60);
}
function wifi_in_hours(string $hours, string $clock): bool {
    if ($hours === '' || !preg_match('/^(\d\d:\d\d)-(\d\d:\d\d)$/', $hours, $m)) return true;
    return $clock >= $m[1] && $clock < $m[2];
}
/** Seconds until the next hours boundary of any profile (null when none is set), so a gateway asks again right after it. */
function wifi_secs_to_boundary(array $profiles, ?int $at = null): ?int {
    $now = wifi_local_clock($at);
    [$h, $mi] = array_map('intval', explode(':', $now));
    $cur = $h * 60 + $mi;
    $best = null;
    foreach ($profiles as $p) {
        if (!preg_match('/^(\d\d):(\d\d)-(\d\d):(\d\d)$/', (string)($p['hours'] ?? ''), $m)) continue;
        foreach ([(int)$m[1] * 60 + (int)$m[2], (int)$m[3] * 60 + (int)$m[4]] as $b) {
            $d = ($b - $cur + 1440) % 1440;
            if ($d === 0) $d = 1440;
            $best = $best === null ? $d : min($best, $d);
        }
    }
    return $best === null ? null : $best * 60 - (int)gmdate('s', $at ?? time());
}

/** memberId => true for those with a payable balance — the ledger read once, balances only for those who owe. */
function wifi_fees_owing(array $ids): array {
    if (!$ids || !function_exists('fees_balance')) return [];
    $want = array_flip($ids);
    $net = [];
    foreach (db_all("SELECT memberId, direction, amount FROM member_ledger WHERE voidedAt = '' OR voidedAt IS NULL") as $e) {
        $id = (string)$e['memberId'];
        if (!isset($want[$id])) continue;
        $net[$id] = ($net[$id] ?? 0) + ((string)$e['direction'] === 'charge' ? 1 : -1) * (int)$e['amount'];
    }
    $owe = array_keys(array_filter($net, fn($v) => $v > 0));
    $out = [];
    if (!$owe) return $out;
    $cfg = fees_settings();
    foreach (array_chunk($owe, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $chunk) as $m) {
            if ((int)(fees_balance($m, $cfg)['payable'] ?? 0) > 0) $out[(string)$m['memberId']] = true;
        }
    }
    return $out;
}

/** A line's signature: its PIN, its profile, and that profile's settings — so a speed change re-sends the line. */
function wifi_line_sig(array $l, array $profiles): string {
    return substr(hash('sha256', $l['pin'] . '|' . $l['profile'] . '|' . json_encode($profiles[$l['profile']] ?? [])), 0, 12);
}

/* ── The gateways' feed ───────────────────────────────────────────────── */

function wifi_gateway_by_key(string $gatewayId, string $key): ?array {
    if (!preg_match('/^G[0-9a-f]{8}$/', $gatewayId) || $key === '') return null;
    $r = db_row("SELECT * FROM wifi_gateways WHERE gatewayId = ? AND (removedAt = '' OR removedAt IS NULL) LIMIT 1", [$gatewayId]);
    if (!$r || (string)$r['keyHash'] === '' || !hash_equals((string)$r['keyHash'], hash('sha256', $key))) return null;
    return $r;
}

/**
 * wifi.feed — what one gateway should hold. Args: gatewayId, key, since (the
 * version the gateway last APPLIED), os, error (what went wrong last time,
 * if anything), full.
 *
 * A full list is sent on first contact, when asked, when the gateway's
 * version is not the one last confirmed, at least daily, and always to a
 * platform that cannot take deltas; on a full list the gateway removes every
 * NGG user not on it. Otherwise only what changed. `next` is when to ask
 * again: sooner while things are changing.
 */
function wifi_feed(array $p): array {
    $r = wifi_gateway_by_key((string)($p['gatewayId'] ?? ''), (string)($p['key'] ?? ''));
    if (!$r) {
        audit('wifi.feed.bad_key', null, substr(preg_replace('/[^\w]/', '', (string)($p['gatewayId'] ?? '')), 0, 16), [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'bad_key'];
    }
    $plat = WIFI_PLATFORMS[(string)$r['platform']] ?? WIFI_PLATFORMS['generic'];
    $cfg = wifi_settings((string)$r['centre']);
    $since = max(0, (int)($p['since'] ?? 0));
    $page = max(1, (int)($p['page'] ?? 1));
    $acked = json_decode((string)$r['ackedJson'], true) ?: [];
    $lastVersion = (int)$r['lastVersion'];
    $base = ['ok' => true, 'platform' => (string)$r['platform'], 'format' => $plat['format'], 'centre' => (string)$r['centre'], 'profiles' => $cfg['profiles']];
    /* Page 2 onwards is the rest of the list page 1 started: the same version
       and the same full-or-not, re-read, with nothing moved on. */
    if ($page > 1) {
        $pend = json_decode((string)$r['pendingJson'], true) ?: [];
        if ((int)$r['pendingVersion'] === 0 || $since !== $lastVersion) return ['ok' => false, 'error' => 'start_again'];
        $lines = wifi_centre_lines((string)$r['centre'], $cfg);
        $d = wifi_feed_diff($lines, $acked, !empty($pend['#full']), $cfg['profiles']);
        db_update('wifi_gateways', ['lastSeenAt' => now_iso(), 'silentAlertAt' => ''], ['id' => (int)$r['id']]);
        return $base + ['version' => (int)$r['pendingVersion'], 'full' => !empty($pend['#full']), 'changed' => $d['changed'], 'unchanged' => false,
                        'next' => WIFI_POLL['busy'], 'test' => false, 'users' => $d['users'], 'count' => count($lines)];
    }
    // The gateway confirms the list it was last handed by sending its version back.
    if ($since > 0 && $since === (int)$r['pendingVersion']) {
        $acked = json_decode((string)$r['pendingJson'], true) ?: [];
        unset($acked['#full']);
        $lastVersion = $since;
    }
    $lines = wifi_centre_lines((string)$r['centre'], $cfg);
    $now = time();
    $full = !$plat['delta'] || !empty($p['full']) || $since === 0 || $since !== $lastVersion
        || (string)$r['lastFullAt'] === '' || $now - (int)strtotime((string)$r['lastFullAt']) >= WIFI_FULL_EVERY;
    $d = wifi_feed_diff($lines, $acked, $full, $cfg['profiles']);
    $cur = $d['cur']; $users = $d['users']; $changed = $d['changed'];
    /* A platform that always takes the whole list is told "unchanged" when it
       already holds this one, so it does not rewrite and reload for nothing. */
    $unchanged = !$plat['delta'] && !$changed && $since > 0 && $since === $lastVersion && empty($p['full']);
    $send = !$unchanged && ($full || $users);
    $version = $send ? max($lastVersion, (int)$r['pendingVersion']) + 1 : $lastVersion;
    $recent = (string)$r['lastChangeAt'] !== '' && $now - (int)strtotime((string)$r['lastChangeAt']) < 900;
    $next = $changed ? WIFI_POLL['busy'] : ($recent ? WIFI_POLL['warm'] : WIFI_POLL['idle']);
    $edge = wifi_secs_to_boundary($cfg['profiles']);
    if ($edge !== null && $edge + 5 < $next) $next = max(WIFI_POLL['busy'], $edge + 5);
    // A fetch ends a silence: the next one is told again (wifi_silent_digest).
    $patch = ['lastSeenAt' => now_iso(), 'silentAlertAt' => '', 'lastVersion' => $lastVersion, 'ackedJson' => json_encode((object)$acked),
              'osVersion' => substr(preg_replace('/[^\w .()\/-]/', '', (string)($p['os'] ?? $r['osVersion'])), 0, 64),
              'lastError' => substr(preg_replace('/[\x00-\x1f]/', '', (string)($p['error'] ?? '')), 0, 255),
              'pendingJson' => $send ? json_encode((object)($full ? $cur + ['#full' => 1] : $cur)) : '', 'pendingVersion' => $send ? $version : 0];
    if ($full && !$unchanged) $patch['lastFullAt'] = now_iso();
    $tele = wifi_telemetry_record($r, $p);
    if ($tele) $patch['lastStatsJson'] = json_encode($tele);
    // A speed test asked for from the Control Room rides the next reply; a reported result clears it.
    $test = (int)($r['testAsked'] ?? 0) === 1;
    if (isset($p['dl']) && is_numeric($p['dl'])) { $patch['testAsked'] = 0; $test = false; }
    if ($changed) $patch['lastChangeAt'] = now_iso();
    db_update('wifi_gateways', $patch, ['id' => (int)$r['id']]);
    return $base + ['version' => $version, 'full' => $full, 'changed' => $changed, 'unchanged' => $unchanged, 'next' => $test ? WIFI_POLL['busy'] : $next,
                    'test' => $test, 'users' => $users, 'count' => count($lines)];
}

/** The lines to send: everybody (as adds) on a full list, else what differs from what the gateway confirmed. */
function wifi_feed_diff(array $lines, array $acked, bool $full, array $profiles): array {
    $cur = [];
    foreach ($lines as $u => $l) $cur[$u] = wifi_line_sig($l, $profiles);
    $users = [];
    $changed = false;
    foreach ($lines as $u => $l) {
        $act = !isset($acked[$u]) ? 'add' : ($acked[$u] !== $cur[$u] ? 'set' : '');
        if ($act !== '') $changed = true;
        if ($full) $users[] = ['username' => $u, 'pin' => $l['pin'], 'profile' => $l['profile'], 'action' => 'add'];
        elseif ($act !== '') $users[] = ['username' => $u, 'pin' => $l['pin'], 'profile' => $l['profile'], 'action' => $act];
    }
    foreach ($acked as $u => $_) if (!isset($cur[$u])) { $changed = true; if (!$full) $users[] = ['username' => (string)$u, 'pin' => '', 'profile' => '', 'action' => 'remove']; }
    return ['cur' => $cur, 'users' => $users, 'changed' => $changed];
}

/* RouterOS's /tool fetch hands a script at most 64,512 bytes and cuts a
   longer reply without an error, so a text list is paged under that: every
   page carries the header and the profiles, the users are split between them,
   and the gateway applies nothing until it has every page and each one ends
   with #end. */
const WIFI_TEXT_PAGE_BYTES = 56000;

/**
 * The feed as the platform reads it. $page counts from 1 (text only).
 *  text   (MikroTik, OpenWrt): ';'-separated lines a router script can split —
 *         "#ngg-wifi;v=…;full=…;count=…;next=…;page=…;pages=…",
 *         "p;profile;down;up;devices;hours", "u;username;pin;profile;add|set|remove",
 *         then "#end", so a reply cut off in transit is never applied.
 *  radius (FreeRADIUS users file): the whole file, or "# unchanged" when the
 *         bridge already holds this version so it skips the reload.
 *  json:  the same data, as JSON.
 */
function wifi_feed_render(array $res, int $page = 1): array {
    if ($res['format'] === 'json') {
        return ['type' => 'application/json', 'body' => json_encode(['version' => $res['version'], 'full' => $res['full'], 'next' => $res['next'], 'test' => !empty($res['test']),
            'count' => $res['count'], 'profiles' => $res['profiles'], 'users' => $res['users']], JSON_UNESCAPED_SLASHES)];
    }
    if ($res['format'] === 'radius') {
        $t = '# ngg-wifi v=' . $res['version'] . ' count=' . $res['count'] . ' next=' . $res['next'] . ' centre=' . preg_replace('/[\r\n]/', ' ', $res['centre']) . "\n";
        if (!empty($res['unchanged'])) return ['type' => 'text/plain', 'body' => $t . "# unchanged\n# end\n"];
        $clock = wifi_local_clock();
        foreach ($res['users'] as $u) {
            $pr = $res['profiles'][$u['profile']] ?? WIFI_PROFILE_DEFAULTS['ngg-member'];
            /* A bridge cannot sign anybody out, so every session has an end:
               the close of the profile's hours, and never more than 8 hours,
               which is how long a removal can take to bite at worst. */
            $st = 28800;
            if (preg_match('/-(\d\d):(\d\d)$/', (string)$pr['hours'], $m)) {
                [$h, $mi] = array_map('intval', explode(':', $clock));
                $st = min($st, max(60, (((int)$m[1] * 60 + (int)$m[2]) - ($h * 60 + $mi)) * 60));
            }
            $t .= $u['username'] . ' Cleartext-Password := "' . $u['pin'] . '", Simultaneous-Use := ' . (int)$pr['devices'] . "\n"
                . "\tClass = \"" . $u['profile'] . "\",\n"
                . "\tSession-Timeout = " . $st . ",\n"
                . "\tWISPr-Bandwidth-Max-Down = " . ((int)$pr['down'] * 1000000) . ",\n"
                . "\tWISPr-Bandwidth-Max-Up = " . ((int)$pr['up'] * 1000000) . "\n\n";
        }
        return ['type' => 'text/plain', 'body' => $t . "# end\n"];
    }
    $prof = '';
    foreach ($res['profiles'] as $name => $pr) $prof .= 'p;' . $name . ';' . (int)$pr['down'] . ';' . (int)$pr['up'] . ';' . (int)$pr['devices'] . ';' . $pr['hours'] . ';' . (!empty($pr['burst']) ? 1 : 0) . ';' . (int)($pr['priority'] ?? 5) . "\n";
    $pages = [[]]; $size = 0;
    foreach ($res['users'] as $u) {
        $l = 'u;' . $u['username'] . ';' . $u['pin'] . ';' . $u['profile'] . ';' . $u['action'] . "\n";
        if ($size + strlen($l) > WIFI_TEXT_PAGE_BYTES - strlen($prof) - 200) { $pages[] = []; $size = 0; }
        $pages[count($pages) - 1][] = $l; $size += strlen($l);
    }
    $n = count($pages);
    $page = max(1, min($n, $page));
    $t = '#ngg-wifi;v=' . $res['version'] . ';full=' . ($res['full'] ? 1 : 0) . ';count=' . $res['count'] . ';next=' . $res['next'] . ';test=' . (!empty($res['test']) ? 1 : 0) . ';page=' . $page . ';pages=' . $n . "\n";
    return ['type' => 'text/plain', 'body' => $t . $prof . implode('', $pages[$page - 1]) . "#end\n"];
}

/* ── The member's own Wi-Fi ───────────────────────────────────────────── */

function wifi_view_member(array $m, bool $withPin): array {
    $id = (string)$m['memberId'];
    $cfg = wifi_settings((string)($m['centre'] ?? ''));
    $username = wifi_username_for('member', $m);
    $existing = wifi_accounts_existing([['member', $id, $username]])['member|' . $id] ?? null;
    $policy = (function_exists('policy_states_for') ? policy_states_for([$id], 'member') : [])[$id] ?? null;
    $owing = $cfg['feesRule'] ? !empty(wifi_fees_owing([$id])[$id]) : false;
    $d = wifi_access_for($m, ['settings' => $cfg, 'policy' => $policy, 'feesOwing' => $owing, 'account' => $existing]);
    $acc = $d['access'] !== 'off' && $username !== '' ? wifi_account_one('member', $id, $username) : $existing;
    // What they have used, against the allowance of the profile they have when on.
    return wifi_view($acc, $d, (string)($m['centre'] ?? ''), $withPin, $username === '' ? 'no_id' : '', $cfg, wifi_is_staff($m))
        + ['usage' => wifi_usage_for('member', $id, $cfg['profiles'][wifi_profile('on', wifi_is_staff($m) ? 'staff' : 'member')] ?? null)];
}

function wifi_view(?array $acc, array $d, string $centre, bool $withPin, string $why = '', ?array $cfg = null, bool $staff = false): array {
    $cfg = $cfg ?? wifi_settings();
    $today = gmdate('Y-m-d');
    $resets = $acc && (string)$acc['pinResetDay'] === $today ? (int)$acc['pinResets'] : 0;
    // Staff sign in at every centre; anybody else where their centre has a gateway.
    $gw = $staff ? (int)(db_row("SELECT COUNT(*) c FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL")['c'] ?? 0)
        : ($centre !== '' ? (int)(db_row("SELECT COUNT(*) c FROM wifi_gateways WHERE centre = ? AND (removedAt = '' OR removedAt IS NULL)", [$centre])['c'] ?? 0) : 0);
    $case = $why !== '' ? $why : $d['case'];
    $access = $why !== '' ? 'off' : $d['access'];
    $profile = $why !== '' ? '' : $d['profile'];
    return [
        'username' => $acc ? (string)$acc['username'] : '',
        'pin' => $withPin && $acc && $access !== 'off' ? wifi_pin_open((string)$acc['pinSealed']) : '',
        'pinSetAt' => $acc ? (string)$acc['pinSetAt'] : '',
        'access' => $access, 'profile' => $profile, 'limits' => $profile !== '' ? ($cfg['profiles'][$profile] ?? null) : null,
        'case' => $case, 'why' => WIFI_CASE_WORDS[$case] ?? '',
        'override' => $acc && (string)$acc['override'] !== '' ? ['access' => (string)$acc['override'], 'why' => (string)$acc['overrideWhy'], 'by' => (string)$acc['overrideBy'], 'at' => (string)$acc['overrideAt']] : null,
        'resetsLeft' => max(0, WIFI_PIN_RESETS_PER_DAY - $resets),
        'centre' => $centre, 'centreHasWifi' => $gw > 0,
    ];
}

/** Drop the kept list of every centre this person is on: their own, or every centre for staff. */
function wifi_subject_lists_forget(string $type, string $id): void {
    $row = $type === 'summer' ? db_row('SELECT centre FROM summer_students WHERE studentId = ?', [$id]) : db_row('SELECT centre, role FROM members WHERE memberId = ?', [$id]);
    if (!$row) return;
    if ($type === 'member' && wifi_is_staff($row)) { foreach (db_all("SELECT DISTINCT centre FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL") as $c) wifi_lines_forget((string)$c['centre']); return; }
    wifi_lines_forget((string)($row['centre'] ?? ''));
}

/** Reset a PIN, at most WIFI_PIN_RESETS_PER_DAY a day (for the member and the desk alike). */
function wifi_pin_reset(array $acc, string $by, string $ip = ''): array {
    $today = gmdate('Y-m-d');
    $n = (string)$acc['pinResetDay'] === $today ? (int)$acc['pinResets'] : 0;
    if ($n >= WIFI_PIN_RESETS_PER_DAY) return ['ok' => false, 'error' => 'too_many_resets', 'message' => 'A Wi-Fi PIN can be changed ' . WIFI_PIN_RESETS_PER_DAY . ' times a day. Try again tomorrow.'];
    db_update('wifi_accounts', ['pinSealed' => wifi_pin_seal(wifi_pin_new()), 'pinSetAt' => now_iso(), 'pinResetDay' => $today, 'pinResets' => $n + 1, 'updatedAt' => now_iso()], ['id' => (int)$acc['id']]);
    wifi_subject_lists_forget((string)$acc['subjectType'], (string)$acc['subjectId']);
    audit('wifi.pin.reset', $by, (string)$acc['subjectType'] . ':' . (string)$acc['subjectId'], ['resetsToday' => $n + 1], $ip);
    return ['ok' => true];
}

function member_wifi_get(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'wifi' => wifi_view_member($m, true)];
}

function member_wifi_reset(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $v = wifi_view_member($m, false);
    if ($v['access'] === 'off') return ['ok' => false, 'error' => 'wifi_off', 'message' => $v['why']];
    $acc = db_row("SELECT * FROM wifi_accounts WHERE subjectType = 'member' AND subjectId = ? LIMIT 1", [(string)$m['memberId']]);
    if (!$acc) return ['ok' => false, 'error' => 'not_found'];
    $r = wifi_pin_reset($acc, (string)$m['memberId'], (string)($p['ip'] ?? ''));
    if (!$r['ok']) return $r;
    return ['ok' => true, 'wifi' => wifi_view_member($m, true)];
}

/* ── The desk: one person's Wi-Fi ─────────────────────────────────────── */

/** Gate by who owns the record (members: people; participants: summer), and its centre. */
function wifi_subject_gate(array $p): array {
    $type = (string)($p['subjectType'] ?? 'member');
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($type, ['member', 'summer'], true) || $id === '') return ['ok' => false, 'error' => 'bad_subject'];
    $g = admin_cap_gate($p, $type === 'summer' ? 'summer' : 'people'); if (!$g['ok']) return $g;
    $row = $type === 'summer'
        ? db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$id])
        : db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($row['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    return ['ok' => true, 'requester' => $g['requester'], 'type' => $type, 'id' => $id, 'row' => $row];
}

function wifi_view_subject(string $type, array $row): array {
    if ($type === 'member') return wifi_view_member($row, true);
    $id = (string)$row['studentId'];
    $username = wifi_username_for('summer', $row);
    $existing = wifi_accounts_existing([['summer', $id, $username]])['summer|' . $id] ?? null;
    $ed = db_row('SELECT cohortId, startDate, endDate FROM summer_cohorts WHERE cohortId = ? LIMIT 1', [(string)($row['cohortId'] ?? '')]);
    $d = wifi_access_for_participant($row, $ed, ['account' => $existing]);
    $acc = $d['access'] !== 'off' && $username !== '' ? wifi_account_one('summer', $id, $username) : $existing;
    $cfg = wifi_settings((string)($row['centre'] ?? ''));
    return wifi_view($acc, $d, (string)($row['centre'] ?? ''), true, $username === '' ? 'no_id' : '')
        + ['usage' => wifi_usage_for('summer', $id, $cfg['profiles']['ngg-summer'] ?? null)];
}

function admin_wifi_member(array $p): array {
    $g = wifi_subject_gate($p); if (!$g['ok']) return $g;
    return ['ok' => true, 'wifi' => wifi_view_subject($g['type'], $g['row'])];
}

/** op: override {access, why} | clear | resetPin. (`op`, because the route's `action` names this whole op.) */
function admin_wifi_member_set(array $p): array {
    $g = wifi_subject_gate($p); if (!$g['ok']) return $g;
    $me = (string)$g['requester']['memberId'];
    if ($g['type'] === 'member' && $g['id'] === $me) return ['ok' => false, 'error' => 'own_account'];
    $action = (string)($p['op'] ?? '');
    if (!in_array($action, ['override', 'clear', 'resetPin'], true)) return ['ok' => false, 'error' => 'bad_action'];
    if ($action === 'override') {
        if (!in_array((string)($p['access'] ?? ''), WIFI_ACCESS, true)) return ['ok' => false, 'error' => 'bad_access'];
        if (trim((string)($p['why'] ?? '')) === '') return ['ok' => false, 'error' => 'reason_required'];
    }
    $username = wifi_username_for($g['type'], $g['row']);
    if ($username === '') return ['ok' => false, 'error' => 'no_printed_id'];
    $acc = wifi_account_one($g['type'], $g['id'], $username);
    if (!$acc) return ['ok' => false, 'error' => 'failed'];
    $ip = (string)($p['ip'] ?? '');
    $subject = $g['type'] . ':' . $g['id'];
    if ($action === 'resetPin') {
        $r = wifi_pin_reset($acc, $me, $ip); if (!$r['ok']) return $r;
    } elseif ($action === 'override') {
        $why = substr(trim((string)$p['why']), 0, 255);
        db_update('wifi_accounts', ['override' => (string)$p['access'], 'overrideWhy' => $why, 'overrideBy' => $me, 'overrideAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$acc['id']]);
        audit('wifi.override', $me, $subject, ['access' => (string)$p['access'], 'why' => $why], $ip);
        wifi_subject_lists_forget($g['type'], $g['id']);
    } else {
        if ((string)$acc['override'] === '') return ['ok' => true, 'unchanged' => true, 'wifi' => wifi_view_subject($g['type'], $g['row'])];
        db_update('wifi_accounts', ['override' => '', 'overrideWhy' => '', 'overrideBy' => $me, 'overrideAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$acc['id']]);
        audit('wifi.override.clear', $me, $subject, ['was' => (string)$acc['override']], $ip);
        wifi_subject_lists_forget($g['type'], $g['id']);
    }
    return ['ok' => true, 'wifi' => wifi_view_subject($g['type'], $g['row'])];
}

/* ── Systems: the access table, the profiles and the gateways ─────────────
   All of it is the `network` capability: the people who look after the
   centres' equipment. Never bundled into Admin (CLAUDE.md §4). */

function admin_wifi_overview(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $scope = $g['scope'];
    $s = wifi_settings();
    $cases = [];
    foreach ($s['cases'] as $k => $v) $cases[] = ['case' => $k, 'access' => $v, 'default' => WIFI_CASE_DEFAULTS[$k], 'locked' => in_array($k, WIFI_CASE_LOCKED, true), 'words' => WIFI_CASE_WORDS[$k]];
    $rows = array_values(array_filter(db_all("SELECT * FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL ORDER BY centre, label"), fn($r) => wifi_scope_has($scope, (string)$r['centre'])));
    $centres = array_values(array_filter(array_map(fn($c) => (string)$c['name'], db_all("SELECT name FROM centres WHERE status IS NULL OR status <> 'retired' ORDER BY name")), fn($c) => wifi_scope_has($scope, $c)));
    $platforms = [];
    foreach (WIFI_PLATFORMS as $k => $v) $platforms[] = ['id' => $k, 'label' => $v['label'], 'can' => $v['can'], 'needs' => $v['needs'], 'delta' => $v['delta'], 'status' => $v['status'], 'pilot' => $v['pilot']];
    $bad = wifi_bad_key_counts();
    $hc = wifi_health_context($rows) + ['profiles' => $s['profiles']];
    $tests = array_map(fn($t) => ['centre' => (string)$t['centre'], 'source' => (string)$t['source'], 'downMbps' => (float)$t['downMbps'], 'upMbps' => (float)$t['upMbps'],
        'rttMs' => (int)$t['rttMs'], 'by' => (string)($t['byName'] ?? ''), 'note' => (string)$t['note'], 'at' => (string)$t['at']],
        array_slice(array_values(array_filter(db_all("SELECT t.*, m.fullName byName FROM wifi_speed_tests t LEFT JOIN members m ON m.memberId = t.byId ORDER BY t.at DESC, t.id DESC LIMIT 400"), fn($t) => wifi_scope_has($scope, (string)$t['centre']))), 0, 40));
    return ['ok' => true, 'cases' => $cases, 'feesRule' => $s['feesRule'], 'profiles' => $s['profiles'], 'profileDefaults' => WIFI_PROFILE_DEFAULTS,
            'slowMbps' => WIFI_SLOW_MBPS, 'speedTests' => $tests, 'speedBytesMax' => WIFI_SPEED_BYTES_MAX,
            'gateways' => array_map(fn($r) => wifi_gateway_out($r, $bad, $hc), $rows), 'centres' => $centres, 'platforms' => $platforms,
            'feedUrl' => wifi_feed_url(), 'staleAfter' => WIFI_STALE_AFTER,
            'scope' => ['all' => $scope === null, 'centres' => $scope === null ? null : count($scope), 'canNetwork' => $scope === null,
                        'regions' => function_exists('wifi_regions_allowed') && wifi_regions_allowed($g['requester'])]];
}

/** The address a gateway fetches, from the deployment's own base URL. */
function wifi_feed_url(): string {
    $base = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? $GLOBALS['CONFIG']['site_url'] ?? ''), '/');
    if ($base === '') {
        $host = (string)($_SERVER['HTTP_HOST'] ?? '');
        $base = $host !== '' ? 'https://' . $host : '';
    }
    return $base . '/api/hooks/wifi-feed.php';
}

function admin_wifi_access_set(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    // The network's table and defaults are the network's: a centre or a region sets its own under Speeds for…
    if ($g['scope'] !== null) return ['ok' => false, 'error' => 'network_wide_only', 'message' => 'Only somebody who looks after every centre changes the network’s table. Set your centre’s or region’s own speeds instead.'];
    $in = (array)($p['cases'] ?? []);
    $prof = (array)($p['profiles'] ?? []);
    // The whole payload is checked before anything is saved.
    foreach ($in as $k => $v) {
        if (!isset(WIFI_CASE_DEFAULTS[$k])) return ['ok' => false, 'error' => 'bad_case', 'case' => (string)$k];
        if (!in_array($v, WIFI_ACCESS, true)) return ['ok' => false, 'error' => 'bad_access', 'case' => (string)$k];
        if (in_array($k, WIFI_CASE_LOCKED, true) && $v !== WIFI_CASE_DEFAULTS[$k]) return ['ok' => false, 'error' => 'case_locked', 'case' => (string)$k];
    }
    foreach ($prof as $k => $v) {
        if (!isset(WIFI_PROFILE_DEFAULTS[$k]) || !is_array($v)) return ['ok' => false, 'error' => 'bad_profile', 'profile' => (string)$k];
        $why = wifi_profile_check($v + (wifi_settings()['profiles'][$k] ?? []));
        if ($why !== '') return ['ok' => false, 'error' => 'bad_profile', 'profile' => (string)$k, 'message' => $why];
    }
    $cur = wifi_settings();
    $cases = array_merge($cur['cases'], $in);
    $profiles = $cur['profiles'];
    foreach ($prof as $k => $v) $profiles[$k] = wifi_profile_norm($v + $profiles[$k]);
    $fees = array_key_exists('feesRule', $p) ? to_bool($p['feesRule']) : $cur['feesRule'];
    $me = (string)$g['requester']['memberId'];
    setting_set('wifi_access', ['cases' => $cases, 'feesRule' => $fees, 'profiles' => $profiles], $me);
    wifi_settings_forget();
    audit('wifi.access.set', $me, 'wifi_access', ['cases' => $in, 'profiles' => array_keys($prof), 'feesRule' => $fees], (string)($p['ip'] ?? ''));
    return admin_wifi_overview($p);
}

/** gatewayId => wrong-key attempts in the last day — one grouped read. */
function wifi_bad_key_counts(): array {
    $out = [];
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
    foreach (db_all("SELECT subject, COUNT(*) c FROM audit_log WHERE event = 'wifi.feed.bad_key' AND at >= ? GROUP BY subject", [$since]) as $r) $out[(string)$r['subject']] = (int)$r['c'];
    return $out;
}

/**
 * What is wrong with a gateway, if anything, in words with the fix — read
 * from what it reported, when it was last heard, and what its platform can do.
 * Worst first. Each: { tone: bad|warn|ok, title, fix }.
 */
function wifi_gateway_diagnose(array $r, array $badKeys = [], array $hc = []): array {
    $out = [];
    $seen = (string)$r['lastSeenAt'];
    $age = $seen === '' ? null : time() - (int)strtotime($seen);
    $plat = (string)$r['platform'];
    $bad = (int)($badKeys[(string)$r['gatewayId']] ?? 0);
    $live = $age !== null && $age <= WIFI_STALE_AFTER;
    if ($age === null) {
        $out[] = ['tone' => 'warn', 'title' => 'Not connected yet', 'fix' => 'Open its setup guide and run the steps on the gateway. It shows as working after its first fetch.'];
    } elseif (!$live) {
        $out[] = ['tone' => 'bad', 'title' => 'Silent for ' . wifi_ago($age), 'fix' => 'Check the gateway has power and internet. Until it fetches again it keeps the people it already has: nobody new can sign in and nobody suspended since is removed.'];
    }
    if ($bad > 0) {
        // Somebody else trying this id is worth knowing; it is not this gateway failing while it still fetches.
        $out[] = ['tone' => $live ? 'warn' : 'bad', 'title' => $bad . ' fetch' . ($bad === 1 ? '' : 'es') . ' with the wrong key today',
            'fix' => 'If the key was rotated, run the setup again with the new key. If it wasn’t, something else has this gateway’s id: rotate the key.'];
    }
    if ((string)$r['lastError'] !== '') {
        $out[] = ['tone' => 'bad', 'title' => 'The gateway reported a problem', 'fix' => wifi_error_words((string)$r['lastError'], $plat)];
    }
    if ($plat === 'mikrotik' && preg_match('/^(\d+)\.(\d+)/', (string)$r['osVersion'], $m)) {
        $v = (int)$m[1] * 100 + (int)$m[2];
        if ($v < 700) $out[] = ['tone' => 'bad', 'title' => 'RouterOS ' . $m[0] . ' is too old', 'fix' => 'Upgrade to RouterOS 7 (System → Packages → Check for updates), then run the setup again.'];
        elseif ($v < 719 && !$live) $out[] = ['tone' => 'warn', 'title' => 'RouterOS ' . $m[0] . ' needs NGG’s certificate imported', 'fix' => 'Before 7.19 a router does not trust public certificates on its own. Upgrade, or follow the certificate step in the setup guide.'];
    }
    // What it reported of itself, and the line it is on.
    $stats = json_decode((string)($r['lastStatsJson'] ?? ''), true) ?: [];
    $gid = (string)$r['gatewayId'];
    $speed = $hc['speed'][(string)$r['centre']] ?? null;
    $peak = (int)($hc['peak'][$gid] ?? 0);
    $profiles = $hc['profiles'] ?? wifi_settings()['profiles'];
    if ($speed && $speed['downMbps'] < WIFI_SLOW_MBPS) {
        $out[] = ['tone' => 'warn', 'title' => 'Slow line: ' . $speed['downMbps'] . ' Mbit/s measured', 'fix' => 'Measured ' . wifi_ago(max(1, time() - (int)strtotime($speed['at']))) . ' ago. Below ' . WIFI_SLOW_MBPS . ' Mbit/s pages and lessons stall. Ask the provider, or test again away from busy hours to see if it is the line or the crowd.'];
    }
    $fair = wifi_fair_share($speed ? (float)$speed['downMbps'] : null, $peak, $profiles);
    if ($fair && $fair['suggestMember'] < (int)$profiles['ngg-member']['down']) {
        $out[] = ['tone' => 'warn', 'title' => 'More promised than the line can give', 'fix' => 'At the busiest hour this week ' . $peak . ' people shared ' . $fair['line'] . ' Mbit/s — about ' . $fair['each'] . ' each — while members may use up to ' . $profiles['ngg-member']['down'] . '. About ' . $fair['suggestMember'] . ' Mbit/s for members, with burst on, keeps it fair. Change it under Who gets on, or upgrade the line.'];
    }
    if (($hc['cpu'][$gid] ?? 0) >= 90) {
        $out[] = ['tone' => 'warn', 'title' => 'Working hard: CPU reached ' . (int)$hc['cpu'][$gid] . '% today', 'fix' => 'A router at full CPU drops speed for everybody. Lower the number of people per gateway, turn off what it does not need, or use a bigger router for this centre.'];
    }
    if (isset($stats['memFree']) && $stats['memFree'] !== null && $stats['memFree'] > 0 && $stats['memFree'] < 16) {
        $out[] = ['tone' => 'warn', 'title' => 'Low on memory: ' . $stats['memFree'] . ' MB free', 'fix' => 'Restart it out of hours; if it keeps happening, this router is too small for the centre.'];
    }
    if ($live && isset($stats['uptime']) && $stats['uptime'] !== null && $stats['uptime'] < 3600) {
        $out[] = ['tone' => 'ok', 'title' => 'Restarted ' . wifi_ago(max(1, (int)$stats['uptime'])) . ' ago', 'fix' => 'If nobody restarted it, check its power supply: repeated restarts are usually power.'];
    }
    if ($live && !array_filter($out, fn($x) => $x['tone'] === 'bad')) {
        array_unshift($out, ['tone' => 'ok', 'title' => 'Working', 'fix' => 'Last fetched ' . wifi_ago($age) . ' ago.']);
    }
    return $out;
}

/** What a gateway's own error word means, and what to do. */
function wifi_error_words(string $e, string $plat): string {
    $k = strtolower($e);
    if (strpos($k, 'certificate') !== false || strpos($k, 'ssl') !== false || strpos($k, 'tls') !== false)
        return 'It could not check NGG’s certificate (“' . $e . '”). Check the gateway’s clock is right (NTP); on RouterOS before 7.19, import the certificate as the setup guide shows.';
    if (strpos($k, 'truncated') !== false || strpos($k, 'incomplete') !== false)
        return 'A reply arrived cut short, so nothing was applied and the gateway kept its people. It usually passes on the next fetch; if it keeps happening, the connection is dropping.';
    if (strpos($k, 'fetch') !== false || strpos($k, 'resolv') !== false || strpos($k, 'timeout') !== false || strpos($k, 'connect') !== false)
        return 'It could not reach NGG (“' . $e . '”). Check the gateway’s internet and DNS. It keeps the people it already has meanwhile.';
    if (strpos($k, 'reload') !== false) return 'FreeRADIUS would not reload the list (“' . $e . '”). Run “sudo freeradius -XC” on the bridge to see why.';
    return 'It said: “' . $e . '”.';
}

function wifi_ago(int $s): string {
    if ($s < 90) return $s . ' seconds';
    if ($s < 5400) return round($s / 60) . ' minutes';
    if ($s < 172800) return round($s / 3600) . ' hours';
    return round($s / 86400) . ' days';
}

function wifi_gateway_out(array $r, array $badKeys = [], array $hc = []): array {
    $acked = json_decode((string)$r['ackedJson'], true) ?: [];
    $diag = wifi_gateway_diagnose($r, $badKeys, $hc);
    $stats = json_decode((string)($r['lastStatsJson'] ?? ''), true) ?: null;
    $speed = $hc['speed'][(string)$r['centre']] ?? null;
    $peak = (int)($hc['peak'][(string)$r['gatewayId']] ?? 0);
    $worst = in_array('bad', array_column($diag, 'tone'), true) ? 'bad' : (in_array('warn', array_column($diag, 'tone'), true) ? 'warn' : 'ok');
    return [
        'gatewayId' => (string)$r['gatewayId'], 'platform' => (string)$r['platform'],
        'platformLabel' => WIFI_PLATFORMS[(string)$r['platform']]['label'] ?? (string)$r['platform'],
        'centre' => (string)$r['centre'], 'label' => (string)$r['label'],
        'keyTail' => (string)$r['keyTail'], 'keySetAt' => (string)$r['keySetAt'],
        'lastSeenAt' => (string)$r['lastSeenAt'], 'lastFullAt' => (string)$r['lastFullAt'], 'lastChangeAt' => (string)$r['lastChangeAt'],
        'osVersion' => (string)$r['osVersion'], 'lastError' => (string)$r['lastError'],
        'version' => (int)$r['lastVersion'], 'users' => count($acked), 'createdAt' => (string)$r['createdAt'],
        'health' => $worst, 'diagnosis' => $diag,
        'pilot' => (WIFI_PLATFORMS[(string)$r['platform']]['status'] ?? '') === 'pilot',
        'stats' => $stats, 'speed' => $speed, 'peak7' => $peak, 'testAsked' => (int)($r['testAsked'] ?? 0) === 1,
        'fair' => wifi_fair_share($speed ? (float)$speed['downMbps'] : null, $peak, $hc['profiles'] ?? wifi_settings()['profiles']),
    ];
}

function wifi_key_new(): string { return bin2hex(random_bytes(20)); }

function wifi_gateway_live(string $id): ?array {
    return db_row("SELECT * FROM wifi_gateways WHERE gatewayId = ? AND (removedAt = '' OR removedAt IS NULL) LIMIT 1", [$id]);
}

/** Create (no gatewayId) or edit {platform, centre, label}. A new gateway's key is returned once, here, and never again. */
function admin_wifi_gateway_save(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $me = (string)$g['requester']['memberId'];
    $centre = trim((string)($p['centre'] ?? ''));
    $label = trim(mb_substr((string)($p['label'] ?? ''), 0, 120));
    $platform = (string)($p['platform'] ?? '');
    if (!isset(WIFI_PLATFORMS[$platform])) return ['ok' => false, 'error' => 'bad_platform'];
    if ($centre === '' || !db_row("SELECT id FROM centres WHERE name = ? AND (status IS NULL OR status <> 'retired') LIMIT 1", [$centre])) return ['ok' => false, 'error' => 'bad_centre'];
    if (!wifi_scope_has($g['scope'], $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
    $gid = (string)($p['gatewayId'] ?? '');
    $ip = (string)($p['ip'] ?? '');
    if ($gid === '') {
        do { $gid = 'G' . bin2hex(random_bytes(4)); } while (db_row('SELECT id FROM wifi_gateways WHERE gatewayId = ?', [$gid]));
        $key = wifi_key_new();
        db_insert('wifi_gateways', ['gatewayId' => $gid, 'platform' => $platform, 'centre' => $centre, 'label' => $label !== '' ? $label : $centre,
            'keyHash' => hash('sha256', $key), 'keyTail' => substr($key, -4), 'keySetAt' => now_iso(),
            'ackedJson' => '', 'pendingJson' => '', 'lastStatsJson' => '', 'createdAt' => now_iso(), 'createdBy' => $me]);
        audit('wifi.gateway.add', $me, $gid, ['centre' => $centre, 'platform' => $platform], $ip);
        return ['ok' => true, 'gateway' => wifi_gateway_out(wifi_gateway_live($gid)), 'key' => $key];
    }
    $f = wifi_gateway_for($g, $gid); if (!$f['ok']) return $f;
    $r = $f['row'];
    $patch = ['label' => $label !== '' ? $label : (string)$r['label'], 'centre' => $centre, 'platform' => $platform];
    // Moved to another centre or platform: its next fetch is a full list.
    if ($centre !== (string)$r['centre'] || $platform !== (string)$r['platform']) $patch += ['ackedJson' => '', 'pendingJson' => '', 'pendingVersion' => 0, 'lastFullAt' => ''];
    db_update('wifi_gateways', $patch, ['id' => (int)$r['id']]);
    audit('wifi.gateway.save', $me, $gid, ['centre' => $centre, 'platform' => $platform, 'from' => (string)$r['centre']], $ip);
    return ['ok' => true, 'gateway' => wifi_gateway_out(wifi_gateway_live($gid))];
}

function admin_wifi_gateway_rotate(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $f = wifi_gateway_for($g, (string)($p['gatewayId'] ?? '')); if (!$f['ok']) return $f;
    $r = $f['row'];
    $key = wifi_key_new();
    db_update('wifi_gateways', ['keyHash' => hash('sha256', $key), 'keyTail' => substr($key, -4), 'keySetAt' => now_iso()], ['id' => (int)$r['id']]);
    audit('wifi.gateway.rotate', (string)$g['requester']['memberId'], (string)$r['gatewayId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'gateway' => wifi_gateway_out(wifi_gateway_live((string)$r['gatewayId'])), 'key' => $key];
}

function admin_wifi_gateway_remove(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $f = wifi_gateway_for($g, (string)($p['gatewayId'] ?? '')); if (!$f['ok']) return $f;
    $r = $f['row'];
    db_update('wifi_gateways', ['removedAt' => now_iso(), 'keyHash' => ''], ['id' => (int)$r['id']]);
    audit('wifi.gateway.remove', (string)$g['requester']['memberId'], (string)$r['gatewayId'], ['centre' => (string)$r['centre']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * What a gateway would be sent right now, without sending it or moving its
 * version: the "will this person get on?" check, and the count per profile.
 * PINs are masked — this is a diagnosis, not a way to read people's PINs.
 */
function admin_wifi_gateway_preview(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $f = wifi_gateway_for($g, (string)($p['gatewayId'] ?? '')); if (!$f['ok']) return $f;
    $r = $f['row'];
    $lines = wifi_centre_lines((string)$r['centre']);
    $acked = json_decode((string)$r['ackedJson'], true) ?: [];
    $byProfile = [];
    foreach ($lines as $l) $byProfile[$l['profile']] = ($byProfile[$l['profile']] ?? 0) + 1;
    $q = strtolower(trim((string)($p['q'] ?? '')));
    $hits = [];
    if ($q !== '') foreach ($lines as $u => $l) if (strpos(strtolower($u), $q) !== false && count($hits) < 20) $hits[] = ['username' => $u, 'profile' => $l['profile'], 'onGateway' => isset($acked[$u])];
    return ['ok' => true, 'count' => count($lines), 'byProfile' => $byProfile, 'pendingAdds' => count(array_diff_key($lines, $acked)),
            'pendingRemoves' => count(array_diff_key($acked, $lines)), 'matches' => $hits];
}

/**
 * "Why can't this person get on?" — find people by printed ID, record id or
 * name, and say for each whether they have Wi-Fi and why. A read, so any of
 * the desks that look after people may ask (CLAUDE.md §4: never a write);
 * centre-scoped per row; never a PIN — the desk that owns the record resets it.
 */
function admin_wifi_lookup(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer', 'network']); if (!$g['ok']) return $g;
    $caps = member_effective_caps($g['requester']);
    $q = trim(str_replace(['%', '_'], '', (string)($p['q'] ?? '')));
    if (mb_strlen($q) < 2) return ['ok' => true, 'results' => [], 'q' => $q];
    $like = '%' . mb_strtolower($q) . '%';
    $out = [];
    $cfg = wifi_settings();
    $mine = (string)$g['requester']['memberId'];
    foreach (db_all("SELECT * FROM members WHERE LOWER(displayId) LIKE ? OR LOWER(memberId) LIKE ? OR LOWER(fullName) LIKE ? ORDER BY fullName LIMIT 12", [$like, $like, $like]) as $m) {
        if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) continue;
        $v = wifi_view_member($m, false);
        $out[] = ['subjectType' => 'member', 'subjectId' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? ''),
                  'canChange' => in_array('people', $caps, true) && (string)$m['memberId'] !== $mine] + $v;
    }
    foreach (db_all("SELECT * FROM summer_students WHERE LOWER(displayId) LIKE ? OR LOWER(studentId) LIKE ? OR LOWER(fullName) LIKE ? ORDER BY fullName LIMIT 8", [$like, $like, $like]) as $s) {
        if (!admin_centre_allowed($g['requester'], (string)($s['centre'] ?? ''))) continue;
        $v = wifi_view_subject('summer', $s); $v['pin'] = '';
        $out[] = ['subjectType' => 'summer', 'subjectId' => (string)$s['studentId'], 'name' => (string)$s['fullName'], 'centre' => (string)($s['centre'] ?? ''),
                  'canChange' => in_array('summer', $caps, true)] + $v;
    }
    unset($cfg);
    return ['ok' => true, 'results' => $out, 'q' => $q];
}

/* ── Diagnosis: what gateways report, and speed tests ─────────────────────
   A gateway's fetch may carry what it can see of itself: people online now
   (act), CPU % (cpu), free memory in MB (mem), uptime in seconds (up), and —
   after a speed test — the measured line (dl/ul in Mbit/s, rtt in ms). It is
   kept as HOURLY SUMMARIES per gateway (peak people, peak CPU, least free
   memory), never per person and never what anybody browsed. A staff device at
   a centre can measure the line too, from the browser. */

/**
 * Every fetch is a heartbeat: the hour and the day it came in are counted
 * for the gateway, whatever it reports, so how much of the day a gateway was
 * there can be read for every platform. What it reports of itself rides
 * along. Hourly rows are kept 14 days; daily rows 400. Returns the latest
 * snapshot of what it reported, or null when it reported nothing.
 */
function wifi_telemetry_record(array $r, array $p): ?array {
    $num = fn($k, $max) => isset($p[$k]) && is_numeric($p[$k]) ? max(0, min($max, (float)$p[$k])) : null;
    $act = $num('act', 100000); $cpu = $num('cpu', 100); $mem = $num('mem', 1000000); $up = $num('up', 1e9);
    $dl = $num('dl', 100000); $ul = $num('ul', 100000); $rtt = $num('rtt', 60000);
    $gid = (string)$r['gatewayId'];
    $hour = gmdate('Y-m-d\TH'); $date = gmdate('Y-m-d');
    $row = db_row('SELECT * FROM wifi_gateway_stats WHERE gatewayId = ? AND hour = ? LIMIT 1', [$gid, $hour]);
    $newHour = !$row;
    if ($row) {
        db_update('wifi_gateway_stats', ['samples' => (int)$row['samples'] + 1, 'activeMax' => max((int)$row['activeMax'], (int)$act),
            'activeSum' => (int)$row['activeSum'] + (int)$act, 'activeSamples' => (int)$row['activeSamples'] + ($act === null ? 0 : 1),
            'cpuMax' => max((int)$row['cpuMax'], (int)$cpu),
            'memFreeMin' => $mem === null ? (int)$row['memFreeMin'] : ((int)$row['memFreeMin'] > 0 ? min((int)$row['memFreeMin'], (int)$mem) : (int)$mem)], ['id' => (int)$row['id']]);
    } else {
        try { db_insert('wifi_gateway_stats', ['gatewayId' => $gid, 'hour' => $hour, 'samples' => 1, 'activeMax' => (int)$act, 'activeSum' => (int)$act,
            'activeSamples' => $act === null ? 0 : 1, 'cpuMax' => (int)$cpu, 'memFreeMin' => (int)$mem]); }
        catch (Throwable $e) { $newHour = false; /* a concurrent fetch made the hour first */ }
    }
    $day = db_row('SELECT * FROM wifi_gateway_daily WHERE gatewayId = ? AND date = ? LIMIT 1', [$gid, $date]);
    if ($day) {
        db_update('wifi_gateway_daily', ['samples' => (int)$day['samples'] + 1, 'hoursUp' => (int)$day['hoursUp'] + ($newHour ? 1 : 0),
            'activePeak' => max((int)$day['activePeak'], (int)$act), 'activeSum' => (int)$day['activeSum'] + (int)$act,
            'activeSamples' => (int)$day['activeSamples'] + ($act === null ? 0 : 1), 'cpuMax' => max((int)$day['cpuMax'], (int)$cpu)], ['id' => (int)$day['id']]);
    } else {
        try { db_insert('wifi_gateway_daily', ['gatewayId' => $gid, 'date' => $date, 'samples' => 1, 'hoursUp' => 1, 'activePeak' => (int)$act,
            'activeSum' => (int)$act, 'activeSamples' => $act === null ? 0 : 1, 'cpuMax' => (int)$cpu]); }
        catch (Throwable $e) { /* a concurrent fetch made the day first */ }
    }
    if ($dl !== null && $dl > 0) {
        db_insert('wifi_speed_tests', ['centre' => (string)$r['centre'], 'gatewayId' => $gid, 'source' => 'gateway', 'downMbps' => round($dl, 2),
            'upMbps' => round((float)$ul, 2), 'rttMs' => (int)$rtt, 'byId' => '', 'note' => '', 'at' => now_iso()]);
    }
    if (random_int(1, 50) === 1) {
        db_exec('DELETE FROM wifi_gateway_stats WHERE hour < ?', [gmdate('Y-m-d\TH', time() - 14 * 86400)]);
        db_exec('DELETE FROM wifi_gateway_daily WHERE date < ?', [gmdate('Y-m-d', time() - 400 * 86400)]);
    }
    if ($act === null && $cpu === null && $mem === null && $up === null && $dl === null) return null;
    // A fetch that reports some things keeps the last word on the rest.
    $prev = json_decode((string)($r['lastStatsJson'] ?? ''), true) ?: [];
    $keep = fn($v, $k) => $v === null ? ($prev[$k] ?? null) : (int)$v;
    return ['at' => now_iso(), 'active' => $keep($act, 'active'), 'cpu' => $keep($cpu, 'cpu'), 'memFree' => $keep($mem, 'memFree'),
            'uptime' => $up === null ? (isset($prev['uptime'], $prev['at']) ? (int)$prev['uptime'] + max(0, time() - (int)strtotime((string)$prev['at'])) : null) : (int)$up];
}

/** For a list of gateways: their 7-day peak, their 24-hour peak CPU, and their centre's latest speed test — three grouped reads. */
function wifi_health_context(array $rows): array {
    $ids = array_map(fn($r) => (string)$r['gatewayId'], $rows);
    $out = ['peak' => [], 'cpu' => [], 'speed' => [], 'hours' => []];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT gatewayId, MAX(activeMax) p FROM wifi_gateway_stats WHERE gatewayId IN ($ph) AND hour >= ? GROUP BY gatewayId", array_merge($ids, [gmdate('Y-m-d\TH', time() - 7 * 86400)])) as $x) $out['peak'][(string)$x['gatewayId']] = (int)$x['p'];
        foreach (db_all("SELECT gatewayId, MAX(cpuMax) c FROM wifi_gateway_stats WHERE gatewayId IN ($ph) AND hour >= ? GROUP BY gatewayId", array_merge($ids, [gmdate('Y-m-d\TH', time() - 86400)])) as $x) $out['cpu'][(string)$x['gatewayId']] = (int)$x['c'];
    }
    // The latest test per centre in the last 30 days.
    foreach (db_all("SELECT * FROM wifi_speed_tests WHERE at >= ? ORDER BY at DESC, id DESC", [gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400)]) as $t) {
        $c = (string)$t['centre'];
        if (!isset($out['speed'][$c])) $out['speed'][$c] = ['downMbps' => (float)$t['downMbps'], 'upMbps' => (float)$t['upMbps'], 'rttMs' => (int)$t['rttMs'], 'source' => (string)$t['source'], 'at' => (string)$t['at']];
    }
    return $out;
}

/** What each person can expect at the busiest time, and a member speed that the line can actually give. */
function wifi_fair_share(?float $downMbps, int $peak, array $profiles): ?array {
    if (!$downMbps || $peak < 1) return null;
    $each = $downMbps / $peak;
    // Not everybody downloads at once: allowing about three times the even share keeps pages quick without promising what isn't there.
    $suggest = max(1, min((int)$profiles['ngg-member']['down'], (int)floor($each * 3)));
    return ['each' => round($each, 1), 'suggestMember' => $suggest, 'peak' => $peak, 'line' => $downMbps];
}

/** Ask a gateway to measure its line at its next fetch. */
function admin_wifi_gateway_test(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $f = wifi_gateway_for($g, (string)($p['gatewayId'] ?? '')); if (!$f['ok']) return $f;
    $r = $f['row'];
    db_update('wifi_gateways', ['testAsked' => 1], ['id' => (int)$r['id']]);
    return ['ok' => true];
}

/**
 * Save a speed test run from a staff device at a centre. Any staff member who
 * may see the centre can record one — a measurement changes nothing — and it
 * is kept with who ran it.
 */
function admin_wifi_speed_save(array $p): array {
    $g = admin_cap_gate_any($p, ['network', 'people', 'club', 'summer']); if (!$g['ok']) return $g;
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre === '' || !db_row("SELECT id FROM centres WHERE name = ? LIMIT 1", [$centre])) return ['ok' => false, 'error' => 'bad_centre'];
    if (!admin_centre_allowed($g['requester'], $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
    $num = fn($k, $max) => is_numeric($p[$k] ?? null) ? max(0, min($max, (float)$p[$k])) : -1;
    $down = $num('downMbps', 100000); $up = $num('upMbps', 100000); $rtt = $num('rttMs', 60000);
    if ($down <= 0) return ['ok' => false, 'error' => 'bad_result'];
    db_insert('wifi_speed_tests', ['centre' => $centre, 'gatewayId' => '', 'source' => 'device', 'downMbps' => round($down, 2), 'upMbps' => round(max(0, $up), 2),
        'rttMs' => (int)max(0, $rtt), 'byId' => (string)$g['requester']['memberId'], 'note' => mb_substr(trim((string)($p['note'] ?? '')), 0, 255), 'at' => now_iso()]);
    return ['ok' => true];
}

/**
 * Send $bytes of incompressible data for a speed test, straight to the
 * client: no output buffer, no compression (a compressed test measures the
 * compressor), never cached. A 64 KB random block repeats — longer than
 * gzip's 32 KB window, so even a proxy that compresses cannot shrink it.
 */
function wifi_speed_stream(int $bytes): void {
    $bytes = max(1, min(WIFI_SPEED_BYTES_MAX, $bytes));
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    @ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) @ob_end_clean();
    header('Content-Type: application/octet-stream');
    header('Content-Encoding: identity');
    header('Content-Length: ' . $bytes);
    header('X-Accel-Buffering: no');
    $block = random_bytes(65536);
    for ($left = $bytes; $left > 0; $left -= 65536) { echo $left >= 65536 ? $block : substr($block, 0, $left); }
    flush();
}
