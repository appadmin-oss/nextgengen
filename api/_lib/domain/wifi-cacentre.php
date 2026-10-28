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
 * We PUSH (the estate's rule: CACENTRE reads nobody's database), over the
 * connection NGG already has with CACENTRE — see below.
 *
 * WHAT TRAVELS: id, kind, name, email, the printed ID (their sign-in name),
 * the centre's card code as the home site, the verdict and its reason, and a
 * participant's edition end date. Nothing about money beyond "fees owing" as a
 * reason, nothing medical, no guardian details.
 *
 * Data allowances are CACENTRE's now: NGG's own usage is left out of the
 * verdict, or the same megabytes would be counted against somebody twice.
 */

/*
 * THE CONNECTION IS THE DIRECTORY'S (domain/directory-push.php). Same key
 * (DIR_PUSH_SECRET_NGG / dir_push_secret), same CACENTRE address
 * (dir_push_url), same signer and sender. Only the document type differs:
 * `wifi.roster` for the people and NGG's say, `wifi.card` for one member's
 * Wi-Fi to show on their own dashboard. There is no Wi-Fi key of its own.
 *
 * PINS STAY ON THE MEMBER'S DASHBOARD. CACENTRE holds them and decides; the
 * member still opens Me → Wi-Fi in this app, which asks CACENTRE for their
 * card (wifi_cac_member_view) — nobody is sent to another site for a PIN.
 */

/** Must match WifiStore::ROSTER_MAX at CACENTRE: one push carries at most this many. */
const WIFI_CAC_MAX = 5000;
const WIFI_CAC_EVERY = 900;        // seconds between pushes from the web-cron tick
const WIFI_CAC_LAST = 'wifi_cac_last';
const WIFI_CAC_ROUTER_FRESH = 86400; // an NGG gateway heard from within this still serves its centre

function wifi_cac_ready(): bool { return dirpush_ready(); }

/** POST one Wi-Fi document over the directory's connection. */
function wifi_cac_post(string $path, string $typ, array $claims, int $timeout = 60): array {
    return dirpush_post(dirpush_base() . $path, dirpush_sign($typ, $claims), $timeout);
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
        $res = wifi_cac_post('/api/wifi-roster.php?issuer=ngg', 'wifi.roster', ['full' => $full, 'people' => $chunk]);
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
    return ['ok' => true, 'configured' => wifi_cac_ready(), 'url' => dirpush_base(), 'every' => WIFI_CAC_EVERY,
            'canSend' => $g['scope'] === null, 'last' => is_array($last) ? $last : null];
}

function admin_wifi_cac_push(array $p): array {
    $g = wifi_cac_gate($p); if (!$g['ok']) return $g;
    $r = wifi_cac_push((string)$g['requester']['memberId']);
    audit('wifi.cacentre.push', (string)$g['requester']['memberId'], 'ngg', ['sent' => $r['sent'] ?? 0, 'applied' => $r['applied'] ?? 0, 'refused' => $r['refused'] ?? 0, 'error' => $r['error'] ?? '']);
    return $r;
}

/* ── The member's own dashboard: their PIN, from CACENTRE ─────────────── */

/**
 * Does CACENTRE serve this person's Wi-Fi yet? Once NGG is connected — and
 * while no NGG gateway is still serving where they sign in (their centre; any
 * centre, for staff) — yes. That second half is the move: a centre whose
 * router still fetches from NGG keeps showing NGG's PIN, because that is the
 * PIN that router knows. Re-pointing the router flips it within a day.
 */
function wifi_cac_serves(string $centre, bool $staff): bool {
    if (!wifi_cac_ready()) return false;
    $since = gmdate('Y-m-d\TH:i:s', time() - WIFI_CAC_ROUTER_FRESH);
    $live = $staff
        ? db_row("SELECT 1 x FROM wifi_gateways WHERE (removedAt = '' OR removedAt IS NULL) AND lastSeenAt >= ? LIMIT 1", [$since])
        : db_row("SELECT 1 x FROM wifi_gateways WHERE centre = ? AND (removedAt = '' OR removedAt IS NULL) AND lastSeenAt >= ? LIMIT 1", [$centre, $since]);
    return !$live;
}

/** CACENTRE's card for one of NGG's people. op: show | newPin. */
function wifi_cac_card(string $localId, string $op = 'show'): array {
    return wifi_cac_post('/api/wifi-card.php?issuer=ngg', 'wifi.card', ['id' => $localId, 'op' => $op === 'newPin' ? 'newPin' : 'show'], 15);
}

/** CACENTRE's case names, as the member screen already reads them. */
const WIFI_CAC_CASES = ['over_limit' => 'overLimit', 'on' => 'member'];

/**
 * The member screen's view, from CACENTRE's card: the same shape as
 * wifi_view(), so Me → Wi-Fi draws it unchanged. Throws when CACENTRE can't
 * be reached — the caller says so with a retry, never an NGG PIN that the
 * routers no longer know.
 */
function wifi_cac_member_view(array $m, string $op = 'show'): array {
    $r = wifi_cac_card((string)$m['memberId'], $op);
    if (empty($r['ok'])) throw new RuntimeException((string)($r['error'] ?? 'cacentre_unreachable'));
    $c = $r['card'] ?? null;
    if (!is_array($c)) return ['username' => '', 'pin' => '', 'pinSetAt' => '', 'access' => 'off', 'profile' => '', 'limits' => null, 'case' => 'not_listed',
        'why' => 'Not on CACENTRE’s Wi-Fi list yet; it is sent every 15 minutes', 'override' => null, 'resetsLeft' => 0, 'centre' => (string)($m['centre'] ?? ''),
        'centreHasWifi' => false, 'usage' => null, 'source' => 'cacentre'];
    /* CACENTRE words a reason for its staff ("Next Generation Genius has no
       Wi-Fi for them: Suspended…"). On the member's own screen NGG's part is
       just NGG's reason, the same words wifi_view() would have shown. */
    $why = rtrim((string)($c['why'] ?? ''), '.');
    if (in_array((string)($c['case'] ?? ''), ['issuer_off', 'issuer_limited'], true) && ($k = strpos($why, ': ')) !== false) $why = substr($why, $k + 2);
    if ($why === 'On') $why = '';
    $sp = is_array($c['speed'] ?? null) ? $c['speed'] : null;
    $u = is_array($c['usage'] ?? null) ? $c['usage'] : null;
    return ['username' => (string)$c['username'], 'pin' => (string)($c['pin'] ?? ''), 'pinSetAt' => (string)($c['pinSetAt'] ?? ''),
        'access' => in_array($c['access'] ?? '', WIFI_ACCESS, true) ? (string)$c['access'] : 'off', 'profile' => '',
        'limits' => $sp ? ['down' => (int)$sp['down'], 'devices' => (int)$sp['devices'], 'hours' => (string)($sp['hours'] ?? '')] : null,
        'case' => WIFI_CAC_CASES[(string)($c['case'] ?? '')] ?? (string)($c['case'] ?? ''), 'why' => $why,
        'override' => null, 'resetsLeft' => (int)($c['resetsLeft'] ?? 0), 'centre' => (string)($m['centre'] ?? ''), 'centreHasWifi' => !empty($c['hasRouter']),
        'usage' => $u ? ['today' => (int)$u['today'], 'month' => (int)$u['month'], 'dayMb' => (int)$u['dayMb'], 'monthMb' => (int)$u['monthMb'], 'over' => (string)($u['over'] ?? ''), 'days' => []] : null,
        'source' => 'cacentre'];
}

