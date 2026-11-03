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
 * ── NO NEW CONNECTION: THE ATTENDANCE ONE ───────────────────────────────────
 *
 * The owner's decision of 2026-10-31 (cacentre-site `cac/docs/wifi.md` §2):
 * NGG's Wi-Fi rides the **attendance** connection, not the person
 * directory's. NGG already shares one secret with the gate — the one its card
 * lookups and attendance reports are signed with — so:
 *
 *   NGG  --signed with hooks.attendance_secret-->  the gate
 *   the gate  --signed with its own `wifi` key-->  CACENTRE
 *
 * `POST {gate}/v1/issuers/ngg/wifi`, signed exactly as NGG's attendance calls
 * are: `X-NGG-Timestamp` and `X-NGG-Signature: sha256=<hex HMAC of ts.body>`.
 * The gate says who is asking, never the caller, so NGG can only ever speak
 * for NGG's people.
 *
 * **Wi-Fi works wherever attendance works.** There is no key to add and
 * nothing to set up. `DIR_PUSH_SECRET_NGG` carries the person directory and
 * ONLY the person directory — an earlier draft of this file rode that one,
 * and it was wrong.
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

/** The gate's door for this issuer. */
const WIFI_GATE_PATH = '/v1/issuers/ngg/wifi';

/** The gate refuses a bigger body (WIFI_BODY_MAX in gate/src/wifi.ts). */
const WIFI_BODY_MAX = 4500000;

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


/* ── The connection ───────────────────────────────────────────────────────── */

/** The secret NGG already shares with the gate. One secret, both directions. */
function wifi_secret(): string {
    return trim((string)($GLOBALS['CONFIG']['hooks']['attendance_secret'] ?? ''));
}

/** Configured means: attendance is configured. There is nothing else to set. */
function wifi_ready(): bool {
    $s = wifi_secret();
    return strlen($s) >= 16 && !preg_match('/^(your|changeme|replace|example|todo)/i', $s);
}

/** Where the gate is. The same host the gate's own routes are published on. */
function wifi_gate_url(): string {
    $b = trim((string)(getenv('NGG_GATE_URL') ?: ($GLOBALS['CONFIG']['hooks']['gate_url'] ?? '')));
    if ($b === '') $b = 'https://cacentre.afrovanguard.org.ng';
    return rtrim($b, '/') . WIFI_GATE_PATH;
}

/**
 * Post one signed document to the gate.
 *
 * Signed the way NGG's attendance calls are — `hex(HMAC_SHA256(secret,
 * ts . "." . body))` — because that is the point of riding this connection:
 * one signing scheme, one secret, already working.
 *
 * THE GATE SPENDS A SIGNATURE ONCE. A captured roster or "set my password"
 * cannot be replayed within its five minutes, which also means a retry must
 * be signed afresh rather than resent byte for byte. Every call here signs at
 * the moment it is sent, so that holds.
 *
 * Never throws: the Wi-Fi is not allowed to be the reason anything else here
 * falls over.
 *
 * @param array<string,mixed> $body
 * @return array<string,mixed>
 */
function wifi_gate_post(array $body, int $timeout = 30): array {
    if (!wifi_ready()) {
        return ['ok' => false, 'error' => 'not_configured',
                'message' => 'The gate connection is not set up (hooks.attendance_secret). Wi-Fi rides the same connection as check-in, so setting that up turns both on.'];
    }
    $raw = (string)json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (strlen($raw) > WIFI_BODY_MAX) return ['ok' => false, 'error' => 'too_large'];
    $ts  = (string)time();
    $sig = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, wifi_secret());

    $t = $GLOBALS['__wifi_transport'] ?? null;      // the test seam
    if (is_callable($t)) {
        $r = $t(wifi_gate_url(), $raw, $ts, $sig);
        $j = json_decode((string)($r['body'] ?? ''), true);
        return is_array($j) ? $j + ['http' => (int)($r['code'] ?? 0)]
                            : ['ok' => false, 'error' => 'bad_response', 'http' => (int)($r['code'] ?? 0)];
    }
    $ch = curl_init(wifi_gate_url());
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json',
                               'X-NGG-Timestamp: ' . $ts, 'X-NGG-Signature: ' . $sig],
        CURLOPT_POSTFIELDS => $raw,
    ]);
    $out = curl_exec($ch); $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err !== '' || $out === false) {
        error_log('[wifi] ' . ($body['typ'] ?? '?') . ' ' . ($err ?: 'no response'));
        return ['ok' => false, 'error' => 'unreachable'];
    }
    $j = json_decode((string)$out, true);
    if (!is_array($j)) return ['ok' => false, 'error' => 'bad_response', 'http' => $code];
    if (empty($j['ok'])) error_log('[wifi] ' . ($body['typ'] ?? '?') . ' HTTP ' . $code . ' ' . json_encode($j));
    return $j + ['http' => $code];
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
    if (!wifi_ready()) {
        return ['ok' => false, 'error' => 'not_configured',
                'message' => 'The gate connection is not set up (hooks.attendance_secret). Wi-Fi rides the same connection as check-in, so setting that up turns both on.'];
    }
    $total = wifi_count();
    $now = now_iso();

    /* One push, and it may say "this is everybody". */
    if ($full && $total <= WIFI_ROSTER_MAX) {
        $r = wifi_gate_post(['typ' => WIFI_TYP_ROSTER, 'full' => true, 'people' => wifi_roster_rows(WIFI_ROSTER_MAX, 0)], 60);
        return wifi_remember($r, ['at' => $now, 'full' => true, 'sent' => min($total, WIFI_ROSTER_MAX)]);
    }

    /* Too many for one. Several partial pushes: nobody is withdrawn, and a
       page that fails is reported rather than silently skipped. */
    $sent = 0; $applied = 0; $refused = 0; $unknown = []; $fail = null;
    for ($off = 0; $off < $total; $off += WIFI_PUSH_BATCH) {
        $page = wifi_roster_rows(WIFI_PUSH_BATCH, $off);
        if (!$page) break;
        $r = wifi_gate_post(['typ' => WIFI_TYP_ROSTER, 'full' => false, 'people' => $page], 60);
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
    if (!wifi_ready()) {
        return ['ok' => true, 'card' => null, 'configured' => false,
                'why' => 'The Wi-Fi is not connected on this site yet.'];
    }
    $op = (string)($p['op'] ?? 'show');
    if (!in_array($op, ['show', 'setPassword', 'newStartCode'], true)) return ['ok' => false, 'error' => 'unknown_op'];

    $body = ['typ' => WIFI_TYP_CARD, 'op' => $op, 'id' => $mid,
        /* Their own roster row travels WITH the call. CACENTRE applies it as a
           one-row partial roster — which withdraws nobody — so a member who
           joined since the last push is added the moment they look, instead of
           being told they are not on the list until the next tick. */
        'me' => wifi_row($m)];
    if ($op === 'setPassword') $body['password'] = (string)($p['password'] ?? '');

    $r = wifi_gate_post($body, 20);

    if (empty($r['ok'])) {
        /* CACENTRE's and the gate's refusals, in words a member can act on.
           `wifi_off` is not their fault and must not read like an error. */
        $code = (string)($r['error'] ?? $r['code'] ?? 'unreachable');
        $say = [
            'wifi_off'       => 'Your Wi-Fi is off at the moment, so a password would not let you on.',
            'too_many'       => 'That is enough password changes for today.',
            'not_configured' => 'The Wi-Fi is not connected on this site yet.',
            'bad_signature'  => 'This site could not prove who it was to the gate. Tell an admin.',
            'replayed'       => 'That went through already. Reload to see where you stand.',
            'unreachable'    => 'Could not reach the Wi-Fi service. Try again in a moment.',
        ][$code] ?? (string)($r['message'] ?? 'Could not load your Wi-Fi just now.');
        return ['ok' => false, 'error' => $code, 'message' => $say];
    }
    /* `card: null` is CACENTRE saying it has not been told about this person
       yet — a real answer, not a failure. */
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
    return ['ok' => true, 'configured' => wifi_ready(),
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
