<?php
declare(strict_types=1);

/**
 * NGG'S HALF OF THE ESTATE'S WI-FI.
 *
 * CACENTRE runs the network and is the authority (`cac/docs/wifi.md` in
 * cacentre-site: *"CACENTRE controls it... the super admins still have a say,
 * but CACENTRE is the authority"*). Routers fetch their list from CACENTRE,
 * not from here. NGG's job is smaller and entirely about its own people:
 *
 *   1. SAY WHO OUR PEOPLE ARE, and what we think of each — `wifi.roster`.
 *   2. SHOW ONE PERSON THEIR OWN WI-FI — `wifi.card`.
 *
 * ── NO NEW CONNECTION ───────────────────────────────────────────────────────
 *
 * Both ride the connection this estate already has with CACENTRE: the
 * `DirectoryEnvelope` wire, the key `DIR_PUSH_SECRET_NGG`, CACENTRE's
 * address. Only the document type differs, and CACENTRE refuses a token of
 * one type at another's door. That is why everything here goes through
 * `dirpush_token()` / `dirpush_call()` rather than signing anything itself —
 * one signer, so the wire cannot drift from theirs.
 *
 * ── WHAT NGG DOES NOT DO ────────────────────────────────────────────────────
 *
 * - **No PIN is held here.** CACENTRE mints and keeps every PIN; a member's
 *   screen asks for theirs and shows what comes back. Nothing is cached:
 *   a PIN in this database is a second place it can leak from.
 * - **No access decision is made here.** This side sends a VERDICT — its say
 *   — and CACENTRE decides. A CACENTRE block beats anything NGG sends.
 * - **No router is talked to.** Shared hosting cannot reach one behind NAT,
 *   which is the whole reason the authority moved.
 *
 * ── THE VERDICT IS DERIVED, NEVER STORED ────────────────────────────────────
 *
 * `wifi_verdict_for()` reads the member row each time. A stored verdict is a
 * copy that goes stale the moment somebody is suspended, and the gap between
 * the two is somebody on the internet who should not be.
 */

const WIFI_TYP_ROSTER = 'wifi.roster';
const WIFI_TYP_CARD   = 'wifi.card';

/** CACENTRE refuses a longer roster whole rather than cutting it (`too_many`). */
const WIFI_ROSTER_MAX = 5000;

/** Rows per partial push. Well under the cap, and a page that fails goes again. */
const WIFI_PUSH_BATCH = 1000;

/** The kinds CACENTRE accepts from this issuer (Wifi::KINDS['ngg']). */
const WIFI_KINDS = ['member', 'staff', 'participant'];

/** CACENTRE's Wifi::ACCESS, in its order of severity. */
const WIFI_ACCESS = ['on', 'limited', 'off'];

/** Where the last push's answer is kept, for the Control Room to show. */
const WIFI_STATE_KEY = 'wifi_push';

/* ── Our say about one person ─────────────────────────────────────────────── */

/**
 * NGG's verdict on one of its own, as the agreed access table has it.
 *
 * Order matters: the first case that applies decides, worst first, so that a
 * suspended member who also owes fees is `off` rather than `limited`.
 *
 * @param array<string,mixed> $m a `members` row
 * @return array{kind:string, verdict:string, why:string, validUntil:string}
 */
function wifi_verdict_for(array $m): array {
    $status = strtolower(trim((string)($m['status'] ?? '')));
    $role   = strtolower(trim((string)($m['role'] ?? 'member')));
    $isNgg  = function_exists('member_is_ngg') ? member_is_ngg($m) : true;
    $kind   = !$isNgg ? 'participant' : ($role !== '' && $role !== 'member' ? 'staff' : 'member');

    /* Off, and nothing else matters. A record that is not active is not a
       person this programme is putting on the internet. */
    if (in_array($status, ['suspended', 'inactive', 'withdrawn', 'deactivated', 'deleted'], true)) {
        return ['kind' => $kind, 'verdict' => 'off', 'why' => 'Their membership is ' . $status . '.', 'validUntil' => ''];
    }
    if (in_array($status, ['graduated-ngg', 'graduated-vanguard'], true)) {
        return ['kind' => $kind, 'verdict' => 'off', 'why' => 'They have graduated.', 'validUntil' => ''];
    }

    /* A Summer participant is on only inside their edition's dates, and the
       date travels with the row so CACENTRE withdraws them on the day
       without anybody here having to remember to. */
    if (!$isNgg) {
        $w = function_exists('programme_edition_window') ? programme_edition_window() : [];
        $end = (string)($w['end'] ?? $w['endDate'] ?? '');
        $start = (string)($w['start'] ?? $w['startDate'] ?? '');
        $today = gmdate('Y-m-d');
        if ($start !== '' && $today < $start) {
            return ['kind' => 'participant', 'verdict' => 'off', 'why' => 'Their Summer School edition has not started.', 'validUntil' => ''];
        }
        if ($end !== '' && $today > $end) {
            return ['kind' => 'participant', 'verdict' => 'off', 'why' => 'Their Summer School edition has ended.', 'validUntil' => ''];
        }
        return ['kind' => 'participant', 'verdict' => 'on', 'why' => 'A Summer School participant, within their edition.', 'validUntil' => $end];
    }

    /* Conduct: the programme's own sanction ladder. Dormant is limited, not
       off — the point of the Dormant Track is that somebody is still with us. */
    if (function_exists('policy_state')) {
        try {
            $st = policy_state((string)($m['memberId'] ?? ''), 'member');
            $state = (string)($st['state'] ?? 'clear');
            if (in_array($state, ['evicted', 'suspended'], true)) {
                return ['kind' => $kind, 'verdict' => 'off', 'why' => 'On the conduct ladder: ' . $state . '.', 'validUntil' => ''];
            }
            if ($state === 'dormant') {
                return ['kind' => $kind, 'verdict' => 'limited', 'why' => 'On the Dormant Track.', 'validUntil' => ''];
            }
        } catch (\Throwable $e) { /* conduct unavailable: fall through to the plain record */ }
    }

    /* Money is a limit, never a cut-off. A child who owes fees is still a
       child of this programme, and taking the internet off them is not how
       this programme collects. Staff are not limited for fees. */
    if ($kind === 'member' && wifi_owes_fees($m)) {
        return ['kind' => $kind, 'verdict' => 'limited', 'why' => 'Fees are outstanding.', 'validUntil' => ''];
    }

    return $kind === 'staff'
        ? ['kind' => 'staff', 'verdict' => 'on', 'why' => 'NGG staff, mentor or instructor.', 'validUntil' => '']
        : ['kind' => 'member', 'verdict' => 'on', 'why' => 'An active NGG member.', 'validUntil' => ''];
}

/** Does this member owe? False whenever fees are not configured or cannot be read. */
function wifi_owes_fees(array $m): bool {
    if (!function_exists('fees_balance')) return false;
    try {
        $b = fees_balance($m);
        return (float)($b['balance'] ?? $b['owing'] ?? 0) > 0.009;
    } catch (\Throwable $e) { return false; }
}

/**
 * The home site: the member's centre as its CODE, lower-cased.
 *
 * CACENTRE names its sites by the same code the printed card carries, so
 * `EG` → `eg`. A centre CACENTRE has no site for comes back in the push's
 * reply as `unknownSites` and is shown in the Control Room — those people
 * sign in at the hubs until somebody adds the site there.
 */
function wifi_home_site(array $m): string {
    $centre = trim((string)($m['centre'] ?? ''));
    if ($centre === '') return '';
    $row = db_row("SELECT code FROM centres WHERE name = ? OR code = ? LIMIT 1", [$centre, strtoupper($centre)]);
    $code = $row ? (string)$row['code'] : '';
    return $code !== '' ? strtolower($code) : strtolower($centre);
}

/* ── The roster: who we have, and our say about each ──────────────────────── */

/** One member, shaped exactly as CACENTRE's `rosterIngest()` reads a row. */
function wifi_row(array $m): array {
    $v = wifi_verdict_for($m);
    return [
        'id'         => (string)$m['memberId'],
        'kind'       => $v['kind'],
        'name'       => (string)($m['fullName'] ?? ''),
        'email'      => (string)($m['email'] ?? ''),
        /* The printed ID they already carry — `026-014` or `EG-26-001`. It is
           what CACENTRE builds their sign-in name from, so a person keeps one
           name across the estate instead of being issued a second identity. */
        'printedId'  => (string)($m['displayId'] ?? ''),
        'homeSite'   => wifi_home_site($m),
        'verdict'    => $v['verdict'],
        'why'        => $v['why'],
        'validUntil' => $v['validUntil'],
    ];
}

/**
 * Everybody NGG speaks for, in id order.
 *
 * Deleted records are not sent at all — not even as `off`. A withdrawn person
 * belongs to CACENTRE's `gone_at`, which a `full` push does for us.
 *
 * @return list<array<string,mixed>>
 */
function wifi_roster_rows(int $limit = WIFI_ROSTER_MAX, int $offset = 0): array {
    $rows = db_all(
        "SELECT * FROM members WHERE COALESCE(status, '') <> 'deleted' ORDER BY id ASC LIMIT ? OFFSET ?",
        [max(1, $limit), max(0, $offset)]);
    return array_map('wifi_row', $rows);
}

function wifi_count(): int {
    return (int)(db_row("SELECT COUNT(*) c FROM members WHERE COALESCE(status, '') <> 'deleted'")['c'] ?? 0);
}

function wifi_state(): array { $s = setting_get(WIFI_STATE_KEY); return is_array($s) ? $s : []; }

/**
 * Push the roster to CACENTRE.
 *
 * `full` means "this is everybody", and CACENTRE withdraws anyone of ours it
 * does not see in it. So a full push is only ever sent when the WHOLE roster
 * fits in one — past that it goes as several partial pushes, which withdraw
 * nobody, and CACENTRE's own `too_many` refusal is the backstop if this side
 * ever gets the arithmetic wrong.
 *
 * @return array<string,mixed>
 */
function wifi_push_run(bool $full = true): array {
    if (!function_exists('dirpush_ready') || !dirpush_ready()) {
        return ['ok' => false, 'error' => 'not_configured',
                'message' => 'No CACENTRE key is set (DIR_PUSH_SECRET_NGG). The Wi-Fi roster rides the person directory\'s connection, so setting that key turns both on.'];
    }
    $total = wifi_count();
    $url = dirpush_base() . '/api/wifi-roster.php?issuer=' . DIRPUSH_APP;
    $now = now_iso();

    /* One push, and it may say "this is everybody". */
    if ($full && $total <= WIFI_ROSTER_MAX) {
        $r = dirpush_call($url, ['full' => true, 'people' => wifi_roster_rows(WIFI_ROSTER_MAX, 0)], WIFI_TYP_ROSTER, 60);
        return wifi_remember($r, ['at' => $now, 'full' => true, 'sent' => min($total, WIFI_ROSTER_MAX)]);
    }

    /* Too many for one. Several partial pushes: nobody is withdrawn, and a
       page that fails is reported rather than silently skipped. */
    $sent = 0; $applied = 0; $refused = 0; $unknown = []; $fail = null;
    for ($off = 0; $off < $total; $off += WIFI_PUSH_BATCH) {
        $page = wifi_roster_rows(WIFI_PUSH_BATCH, $off);
        if (!$page) break;
        $r = dirpush_call($url, ['full' => false, 'people' => $page], WIFI_TYP_ROSTER, 60);
        if (empty($r['ok'])) { $fail = $r; break; }
        $sent += count($page);
        $applied += (int)($r['applied'] ?? 0);
        $refused += (int)($r['refused'] ?? 0);
        foreach ((array)($r['unknownSites'] ?? []) as $k => $n) $unknown[$k] = ($unknown[$k] ?? 0) + (int)$n;
    }
    $res = $fail ?? ['ok' => true, 'applied' => $applied, 'refused' => $refused, 'gone' => 0,
                     'partial' => $refused > 0, 'unknownSites' => $unknown];
    return wifi_remember($res, ['at' => $now, 'full' => false, 'sent' => $sent, 'pages' => (int)ceil($total / WIFI_PUSH_BATCH)]);
}

/**
 * Keep what CACENTRE said, so a screen can show it without pushing again.
 *
 * The `unknownSites` it names are the ones worth acting on: a centre of ours
 * that CACENTRE has no site for means those members can only sign in at the
 * hubs, and nothing else would ever tell anybody that.
 */
function wifi_remember(array $r, array $meta): array {
    $state = $meta + [
        'ok'       => !empty($r['ok']),
        'error'    => (string)($r['error'] ?? ''),
        'applied'  => (int)($r['applied'] ?? 0),
        'refused'  => (int)($r['refused'] ?? 0),
        'gone'     => (int)($r['gone'] ?? 0),
        'unknownSites' => (array)($r['unknownSites'] ?? []),
    ];
    setting_set(WIFI_STATE_KEY, $state, 'system');
    return $r + ['state' => $state];
}

/* ── One person's own Wi-Fi ───────────────────────────────────────────────── */

/**
 * member.wifi.card — show this member their sign-in name, PIN and why.
 *
 * Asked of CACENTRE every time and never stored. `newPin` asks CACENTRE to
 * mint a new one; its own limit on resets is the limit, because a limit
 * enforced on this side as well is two limits that disagree.
 */
function member_wifi_card(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM members WHERE memberId = ?', [$mid]) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!function_exists('dirpush_ready') || !dirpush_ready()) {
        return ['ok' => true, 'card' => null, 'configured' => false,
                'why' => 'The Wi-Fi is not connected on this site yet.'];
    }
    $op = ($p['op'] ?? '') === 'newPin' ? 'newPin' : 'show';
    $r = dirpush_call(dirpush_base() . '/api/wifi-card.php?issuer=' . DIRPUSH_APP,
        ['id' => $mid, 'op' => $op], WIFI_TYP_CARD, 20);

    if (empty($r['ok'])) {
        /* CACENTRE's refusals, in words a member can act on. `wifi_off` is
           not an error on their part and must not read like one. */
        $code = (string)($r['error'] ?? 'unreachable');
        $say = [
            'wifi_off'       => 'Your Wi-Fi is off at the moment, so a new PIN would not let you on.',
            'not_configured' => 'The Wi-Fi is not connected on this site yet.',
            'unreachable'    => 'Could not reach the Wi-Fi service. Try again in a moment.',
        ][$code] ?? 'Could not load your Wi-Fi just now.';
        return ['ok' => false, 'error' => $code, 'message' => $say];
    }
    /* `card: null` is CACENTRE saying it has not been told about this person
       yet — a real answer, not a failure, and usually means the roster has
       not been pushed since they joined. */
    return ['ok' => true, 'configured' => true, 'card' => $r['card'] ?? null,
            'why' => (string)($r['why'] ?? ''), 'op' => $op];
}

/** admin.wifi.status — what the last push did, and what CACENTRE could not place. */
function admin_wifi_status(array $p): array {
    $g = admin_cap_gate_any($p, ['settings', 'people']); if (!$g['ok']) return $g;
    $state = wifi_state();
    $counts = ['on' => 0, 'limited' => 0, 'off' => 0];
    foreach (db_all("SELECT * FROM members WHERE COALESCE(status, '') <> 'deleted' LIMIT " . WIFI_ROSTER_MAX) as $m) {
        $counts[wifi_verdict_for($m)['verdict']] = ($counts[wifi_verdict_for($m)['verdict']] ?? 0) + 1;
    }
    return ['ok' => true, 'configured' => function_exists('dirpush_ready') && dirpush_ready(),
            'people' => wifi_count(), 'max' => WIFI_ROSTER_MAX, 'would' => $counts,
            'last' => $state, 'canPush' => admin_cap_gate($p, 'settings')['ok']];
}

/** admin.wifi.push — send the roster now (`settings`). */
function admin_wifi_push(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $r = wifi_push_run(true);
    audit('wifi.push', (string)$g['requester']['memberId'], '',
        ['ok' => !empty($r['ok']), 'applied' => (int)($r['applied'] ?? 0), 'error' => (string)($r['error'] ?? '')],
        (string)($p['ip'] ?? ''));
    return $r;
}
