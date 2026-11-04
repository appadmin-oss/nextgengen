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
 * THE CONNECTION IS ATTENDANCE'S (owner, 2026-10-31). NGG already shares one
 * secret with the gate at CACENTRE — hooks.attendance_secret here, NGG_SECRET on
 * the gate — for card lookups and check-ins. The Wi-Fi rides it: every call is a
 * JSON POST to the gate (CACENTRE's address, /v1/issuers/ngg/wifi), signed the way
 * the gate signs to NGG (X-NGG-Timestamp, X-NGG-Signature = sha256=HMAC(secret,
 * ts.body)). The gate checks it, spends the signature once, and passes it to
 * CACENTRE. So the Wi-Fi works wherever attendance does: no key of its own, and the
 * directory key carries the directory only. `typ` is `wifi.roster` for the people
 * and NGG's say, `wifi.card` for one member's Wi-Fi (and the starting-password list).
 *
 * PASSWORDS: CACENTRE gives everybody a starting password and holds it sealed. A
 * member sees theirs on their dashboard until they choose their own; a member with
 * no email is handed it at the gate when they check in, or by an admin from the
 * starting-password list (admin_wifi_cac_starts).
 */

/** Must match WifiStore::ROSTER_MAX at CACENTRE: one push carries at most this many. */
const WIFI_CAC_MAX = 5000;

/**
 * The most a single push may weigh, in bytes.
 *
 * Not CACENTRE's limit — the HOST'S. CACENTRE sits on cPanel, and
 * ModSecurity's `SecRequestBodyNoFilesLimit` defaults to 131072 bytes and
 * REJECTS a larger body in phase 2, before PHP runs. cPanel's rules deny with
 * `status:406`, so what comes back is an error page, not JSON, and the gate
 * could only report "CACENTRE answered 406". A roster of 1,200 people is
 * ~218KB: every push failed, so nothing was applied at all.
 *
 * 96 KiB leaves room for the envelope and for a host that trims the limit
 * further. Raise it with `$CONFIG['wifi']['cac_body_max']` if the host's
 * limit has been raised to match — the number that matters is theirs.
 */
const WIFI_CAC_BODY_MAX = 98304;

/** Room for {"typ":…,"full":…,"people":[]} and the replay nonce. */
const WIFI_CAC_ENVELOPE = 160;
const WIFI_CAC_EVERY = 900;        // seconds between pushes from the web-cron tick
const WIFI_CAC_LAST = 'wifi_cac_last';
const WIFI_CAC_ROUTER_FRESH = 86400; // an NGG gateway heard from within this still serves its centre

/** The attendance secret NGG shares with the gate; empty while attendance is not connected. */
function wifi_cac_secret(): string {
    $s = trim((string)(getenv('NGG_GATE_SECRET') ?: ($GLOBALS['CONFIG']['hooks']['attendance_secret'] ?? '')));
    return strlen($s) >= 16 ? $s : '';
}

function wifi_cac_ready(): bool { return wifi_cac_secret() !== '' && function_exists('curl_init'); }

/**
 * One Wi-Fi call, as the gate checks it (gate/src/wifi.ts): the body, and its
 * signature over "ts.body" with the attendance secret — NGG's own scheme.
 *
 * @return array{url:string, body:string, headers:list<string>}
 */
function wifi_cac_request(string $typ, array $claims, string $secret, int $ts): array {
    /* `n`: two identical calls in one second must not look like a replay to the gate. */
    $body = json_encode(['typ' => $typ] + $claims + ['n' => bin2hex(random_bytes(8))], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return ['url' => dirpush_base() . '/v1/issuers/ngg/wifi', 'body' => $body, 'headers' => ['Content-Type: application/json', 'Accept: application/json',
        'X-NGG-Timestamp: ' . $ts, 'X-NGG-Signature: sha256=' . hash_hmac('sha256', $ts . '.' . $body, $secret)]];
}

/** POST one Wi-Fi call to the gate, on the attendance connection. */
function wifi_cac_post(string $typ, array $claims, int $timeout = 20): array {
    $secret = wifi_cac_secret();
    if ($secret === '') return ['ok' => false, 'error' => 'not_configured'];
    $rq = wifi_cac_request($typ, $claims, $secret, time());
    $ch = curl_init($rq['url']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => $rq['headers'], CURLOPT_POSTFIELDS => $rq['body'],
    ]);
    $raw = curl_exec($ch); $err = curl_error($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err !== '' || $raw === false) { error_log('[wifi-cac] ' . ($err ?: 'no response')); return ['ok' => false, 'error' => 'unreachable']; }
    $json = json_decode((string)$raw, true);
    /* The gate answers JSON on this route, always. Anything else came from somewhere
       that does not know the route — a gate not yet redeployed proxies an unknown
       /v1 path through to the site, which answers with a web page. */
    if (!is_array($json)) return ['ok' => false, 'error' => 'gate_not_updated', 'http' => $code];
    if (empty($json['ok'])) {
        error_log('[wifi-cac] HTTP ' . $code . ' ' . json_encode($json));
        if (!isset($json['error']) && isset($json['code'])) $json['error'] = $json['code'];
    }
    return $json + ['http' => $code];
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
    foreach ($members as $m) $out[] = wifi_cac_member_row($m, $codes, $policy, $owing, $acc);
    foreach ($parts as $s) {
        $id = (string)$s['studentId']; $ed = $eds[(string)$s['cohortId']] ?? null;
        $d = wifi_access_for_participant($s, $ed, ['settings' => wifi_settings((string)$s['centre']), 'account' => $acc['summer|' . $id] ?? null, 'today' => $today, 'usage' => null]);
        $out[] = wifi_cac_trim(['id' => 'summer-' . $id, 'kind' => 'participant', 'name' => trim((string)$s['fullName']), 'email' => '',
            'printedId' => wifi_username_for('summer', $s), 'homeSite' => $codes[(string)$s['centre']] ?? '',
            'verdict' => $d['access'], 'why' => wifi_cac_why($d['case'], $d['access']), 'validUntil' => (string)($ed['endDate'] ?? '')]);
    }
    return $out;
}

/** One member's roster row: the same row the push sends, built for one person. */
/**
 * Drop the fields that are empty anyway.
 *
 * CACENTRE reads every optional field as `$r['x'] ?? ''`, so an absent one
 * and an empty one mean exactly the same thing there — but the empty one
 * still costs its name and quotes in every row, and what the roster is paged
 * against is counted in BYTES. `"why":"","validUntil":""` alone is 24 bytes
 * a person; on a roster of 1,200 that is a page of its own.
 *
 * `id`, `kind` and `verdict` always travel, and that is not tidiness:
 * CACENTRE refuses a row without the first two, and an ABSENT verdict reads
 * there as `on` (`$r['verdict'] ?? 'on'`) — so dropping an empty one would
 * quietly put somebody on the internet.
 */
function wifi_cac_trim(array $row): array {
    foreach ($row as $k => $v) {
        if ($v === '' && !in_array($k, ['id', 'kind', 'verdict'], true)) unset($row[$k]);
    }
    return $row;
}

function wifi_cac_member_row(array $m, array $codes, array $policy, array $owing, array $acc): array {
    $id = (string)$m['memberId']; $staff = wifi_is_staff($m);
    $d = wifi_access_for($m, ['settings' => wifi_settings((string)$m['centre']), 'policy' => $policy[$id] ?? null, 'feesOwing' => !empty($owing[$id]),
        'account' => $acc['member|' . $id] ?? null, 'usage' => null]);
    return wifi_cac_trim(['id' => $id, 'kind' => $staff ? 'staff' : 'member', 'name' => trim((string)$m['fullName']), 'email' => strtolower(trim((string)$m['email'])),
        'printedId' => wifi_username_for('member', $m), 'homeSite' => $staff ? '' : ($codes[(string)$m['centre']] ?? ''),
        'verdict' => $d['access'], 'why' => wifi_cac_why($d['case'], $d['access']), 'validUntil' => '']);
}

/** The row for one member, read fresh, for CACENTRE to add them at once if it has not been sent them yet. */
function wifi_cac_me(array $m): ?array {
    if (!member_is_ngg($m) && !wifi_is_staff($m)) return null;
    $id = (string)$m['memberId'];
    $c = db_row('SELECT code FROM centres WHERE name = ? LIMIT 1', [(string)($m['centre'] ?? '')]);
    $codes = [(string)($m['centre'] ?? '') => strtolower(trim((string)($c['code'] ?? '')))];
    $policy = function_exists('policy_states_for') ? policy_states_for([$id], 'member') : [];
    $acc = wifi_accounts_existing([['member', $id, '']]);
    return wifi_cac_member_row($m, $codes, $policy, wifi_fees_owing([$id]), $acc);
}

/**
 * The roster, cut into pushes that fit through the host's door.
 *
 * By BYTES, not by a count of people: a count cannot know how long anybody's
 * name or email is, and the limit that rejects us is counted in bytes. Each
 * row is measured as it will actually be encoded.
 *
 * `WIFI_CAC_MAX` still bounds a page as well — CACENTRE refuses a longer list
 * outright (`too_many`) — so whichever runs out first ends the page.
 *
 * A single row bigger than the budget cannot be split, so it goes alone and
 * is refused honestly by the host rather than silently dropped here.
 *
 * @param  list<array<string,mixed>> $people
 * @return list<list<array<string,mixed>>>  at least one page, possibly empty
 */
function wifi_cac_pages(array $people, ?int $budget = null): array {
    $budget = $budget ?? (int)($GLOBALS['CONFIG']['wifi']['cac_body_max'] ?? WIFI_CAC_BODY_MAX);
    $budget = max(4096, $budget) - WIFI_CAC_ENVELOPE;
    $pages = []; $cur = []; $size = 0;
    foreach ($people as $row) {
        $n = strlen((string)json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) + 1;  // +1 for the comma
        if ($cur !== [] && ($size + $n > $budget || count($cur) >= WIFI_CAC_MAX)) {
            $pages[] = $cur; $cur = []; $size = 0;
        }
        $cur[] = $row; $size += $n;
    }
    if ($cur !== [] || $pages === []) $pages[] = $cur;
    return $pages;
}

/**
 * Send everybody. One full push when the list fits (anybody NGG no longer
 * sends loses Wi-Fi there); several partial pushes when it does not, which
 * withdraw nobody — said so in the result rather than hidden.
 */
function wifi_cac_push(string $by = 'cron'): array {
    if (!wifi_cac_ready()) return ['ok' => false, 'error' => 'not_configured'];
    $people = wifi_cac_people();
    $chunks = wifi_cac_pages($people);
    /* `full` says "this is everybody", and CACENTRE withdraws anyone of ours
       missing from it — so it may only be said when the whole roster went in
       ONE push. Paged, it is false and nobody is withdrawn; the result says
       so rather than leaving it to be inferred. */
    $full = count($chunks) === 1;
    $r = ['ok' => true, 'at' => now_iso(), 'by' => $by, 'sent' => count($people), 'full' => $full, 'applied' => 0, 'refused' => 0, 'gone' => 0,
          'unknownSites' => [], 'refusals' => [], 'error' => ''];
    foreach ($chunks as $chunk) {
        $res = wifi_cac_post('wifi.roster', ['full' => $full, 'people' => $chunk]);
        if (empty($res['ok'])) { $r['ok'] = false; $r['error'] = (string)($res['error'] ?? 'refused'); $r['http'] = (int)($res['http'] ?? 0); break; }
        $r['applied'] += (int)($res['applied'] ?? 0); $r['refused'] += (int)($res['refused'] ?? 0); $r['gone'] += (int)($res['gone'] ?? 0);
        foreach ((array)($res['unknownSites'] ?? []) as $code => $n) $r['unknownSites'][(string)$code] = ($r['unknownSites'][(string)$code] ?? 0) + (int)$n;
        foreach ((array)($res['results'] ?? []) as $x) if (empty($x['ok']) && count($r['refusals']) < 20) $r['refusals'][] = ['id' => (string)($x['id'] ?? ''), 'error' => (string)($x['error'] ?? '')];
    }
    $r['partial'] = !$r['ok'] || $r['refused'] > 0;
    $r['pages'] = count($chunks);
    /* Paged means `full` could not be said, so CACENTRE withdrew nobody. Said
       here in words, because the difference only shows up as somebody who
       left still being on the Wi-Fi, which nothing else would explain. */
    if ($r['ok'] && !$full) {
        $r['note'] = 'Sent in ' . $r['pages'] . ' parts because the roster is larger than one request may carry, so nobody was withdrawn. '
            . 'Anybody suspended is still sent as off. Raise the host\'s request-body limit, or wifi.cac_body_max, to send it whole.';
    }
    setting_set(WIFI_CAC_LAST, $r, $by);
    return $r;
}

/** The web-cron tick: nothing at all until a key is set. */
function wifi_cac_tick(): array {
    if (!wifi_cac_ready()) return ['skipped' => 'no key'];
    $r = wifi_cac_push('cron');
    try { $r['startMail'] = wifi_cac_mail_starts(); } catch (Throwable $e) { $r['startMail'] = ['ok' => false, 'error' => $e->getMessage()]; }
    return $r;
}

/**
 * Starting passwords CACENTRE could not email (its mail failing, or its own
 * tick not running), sent by NGG with NGG's own mail to the member — or, for
 * a Summer School participant, to their parent — and reported back so nobody
 * is sent it twice. Three failed sends in a row stop the run: NGG's mail is
 * down too, and the rest wait for the next tick.
 */
function wifi_cac_mail_starts(): array {
    $r = wifi_cac_post('wifi.card', ['op' => 'startPending'], 20);
    if (empty($r['ok'])) return ['ok' => false, 'error' => (string)($r['error'] ?? 'unreachable')];
    $sent = []; $failed = 0; $failRun = 0;
    foreach ((array)($r['people'] ?? []) as $x) {
        if ($failRun >= 3) break;
        $id = (string)($x['id'] ?? ''); $user = (string)($x['username'] ?? ''); $code = (string)($x['code'] ?? '');
        if ($id === '' || $user === '' || $code === '') continue;
        if (str_starts_with($id, 'summer-')) {
            $s = db_row('SELECT fullName, parentEmail FROM summer_students WHERE studentId = ? LIMIT 1', [substr($id, 7)]);
            [$to, $name, $forChild] = [(string)($s['parentEmail'] ?? ''), (string)($s['fullName'] ?? ''), true];
        } else {
            $m = db_row('SELECT fullName, email FROM members WHERE memberId = ? LIMIT 1', [$id]);
            [$to, $name, $forChild] = [(string)($m['email'] ?? ''), (string)($m['fullName'] ?? ''), false];
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) continue;
        $e = static fn(string $v): string => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
        $first = trim(explode(' ', trim($name))[0] ?? '');
        $html = '<p>Hello' . ($forChild ? '' : ($first !== '' ? ' ' . $e($first) : '')) . ',</p>'
              . '<p>' . ($forChild ? $e($name !== '' ? $name : 'Your child') . ' is' : 'You are') . ' on the Wi-Fi at the NGG centres, which CACENTRE runs. Keep this email: these are needed to sign in, and there is no internet until then.</p>'
              . '<p>Username: <b>' . $e($user) . '</b><br>Starting password: <b>' . $e($code) . '</b></p>'
              . '<p>Join the centre’s Wi-Fi, and when the sign-in page opens, type both exactly as they are here. '
              . ($forChild ? 'Ask the centre team if you need a new one.' : 'You can keep this password, or choose your own in the NGG app under Me → Wi-Fi. Never share it: anything done on the Wi-Fi with it counts as you.') . '</p>';
        if (send_mail($to, 'Wi-Fi sign-in for ' . ($forChild && $name !== '' ? $name : 'you'), $html)) { $sent[] = ['id' => $id, 'code' => $code]; $failRun = 0; }
        else { $failed++; $failRun++; }
    }
    $marked = 0;
    if ($sent) {
        $c = wifi_cac_post('wifi.card', ['op' => 'startSent', 'sent' => $sent], 20);
        $marked = (int)($c['marked'] ?? 0);
    }
    return ['ok' => true, 'sent' => count($sent), 'failed' => $failed, 'marked' => $marked];
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
    return ['ok' => true, 'configured' => wifi_cac_ready(), 'url' => dirpush_base() . '/v1/issuers/ngg/wifi', 'routersUrl' => dirpush_base() . '/admin/wifi.php', 'every' => WIFI_CAC_EVERY,
            'sites' => (object)array_filter(array_map(fn($c) => strtolower(trim((string)$c['code'])), array_column(db_all('SELECT name, code FROM centres'), null, 'name'))),
            'canSend' => $g['scope'] === null, 'last' => is_array($last) ? $last : null];
}

/**
 * Everybody still on a starting password, for admins to hand out (owner,
 * 2026-10-31): members with no email, or whose email never arrives, are given
 * theirs by a person. Within the admin's own centres. Never a chosen password.
 */
function admin_wifi_cac_starts(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    if (!wifi_cac_ready()) return ['ok' => false, 'error' => 'not_configured'];
    $r = wifi_cac_post('wifi.card', ['op' => 'startList'], 30);
    if (empty($r['ok'])) return ['ok' => false, 'error' => (string)($r['error'] ?? 'unreachable')];
    $centre = array_column(db_all('SELECT memberId, centre FROM members'), 'centre', 'memberId');
    $out = [];
    foreach ((array)($r['people'] ?? []) as $x) {
        $c = (string)($centre[(string)($x['id'] ?? '')] ?? '');
        if (!wifi_scope_has($g['scope'], $c)) continue;
        $out[] = ['id' => (string)$x['id'], 'name' => (string)($x['name'] ?? ''), 'printedId' => (string)($x['printedId'] ?? ''),
                  'username' => (string)($x['username'] ?? ''), 'code' => (string)($x['code'] ?? ''), 'centre' => $c];
    }
    usort($out, fn($a, $b) => [$a['centre'], $a['name']] <=> [$b['centre'], $b['name']]);
    audit('wifi.cacentre.starts', (string)$g['requester']['memberId'], 'ngg', ['n' => count($out)]);
    return ['ok' => true, 'people' => $out];
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
 * PIN that router knows. Marking the router moved (admin.wifi.gateway.moved)
 * flips it at once; a router simply re-pointed flips it within a day.
 */
function wifi_cac_serves(string $centre, bool $staff): bool {
    if (!wifi_cac_ready()) return false;
    $since = gmdate('Y-m-d\TH:i:s', time() - WIFI_CAC_ROUTER_FRESH);
    $live = $staff
        ? db_row("SELECT 1 x FROM wifi_gateways WHERE (removedAt = '' OR removedAt IS NULL) AND (movedAt = '' OR movedAt IS NULL) AND lastSeenAt >= ? LIMIT 1", [$since])
        : db_row("SELECT 1 x FROM wifi_gateways WHERE centre = ? AND (removedAt = '' OR removedAt IS NULL) AND (movedAt = '' OR movedAt IS NULL) AND lastSeenAt >= ? LIMIT 1", [$centre, $since]);
    return !$live;
}

/**
 * CACENTRE's card for one of NGG's people. op: show | setPassword (with the
 * password they chose, signed into the POST body — never a URL). `me` is their
 * own roster row, so CACENTRE adds a person it has not been sent yet at once.
 */
function wifi_cac_card(string $localId, string $op = 'show', string $password = '', ?array $me = null): array {
    $claims = ['id' => $localId, 'op' => in_array($op, ['setPassword', 'newStartCode'], true) ? $op : 'show'];
    if ($op === 'setPassword') $claims['password'] = $password;
    if ($me !== null) $claims['me'] = $me;
    return wifi_cac_post('wifi.card', $claims, 15);
}

/**
 * The desk's view of one person where CACENTRE runs their centre's Wi-Fi:
 * NGG's own view, with CACENTRE's sign-in name and password state over it —
 * the starting password staff hand over at registration, until the person
 * chooses their own. `newStartCode` makes a new one (somebody who forgot
 * theirs). CACENTRE unreachable leaves NGG's view, saying so.
 */
function wifi_cac_desk(string $type, array $row, array $view, string $op = 'show'): array {
    $staff = $type === 'member' && wifi_is_staff($row);
    if (!wifi_cac_serves((string)($row['centre'] ?? ''), $staff)) return $view;
    $localId = $type === 'summer' ? 'summer-' . (string)$row['studentId'] : (string)$row['memberId'];
    $r = wifi_cac_card($localId, $op, '', $type === 'member' ? wifi_cac_me($row) : null);
    $c = !empty($r['ok']) && is_array($r['card'] ?? null) ? $r['card'] : null;
    if ($c === null) return $view + ['cacentre' => true, 'cacentreError' => empty($r['ok']) ? 'unreachable' : 'not_listed', 'startCode' => '', 'ownPassword' => false];
    return array_merge($view, ['cacentre' => true, 'cacentreError' => '', 'username' => (string)$c['username'], 'hasPassword' => !empty($c['hasPassword']),
        'pinSetAt' => (string)($c['pinSetAt'] ?? ''), 'startCode' => (string)($c['startCode'] ?? ''), 'ownPassword' => !empty($c['ownPassword'])]);
}

/** CACENTRE's case names, as the member screen already reads them. */
const WIFI_CAC_CASES = ['over_limit' => 'overLimit', 'on' => 'member'];

/**
 * The member screen's view, from CACENTRE's card: the same shape as
 * wifi_view(), so Me → Wi-Fi draws it unchanged. Throws when CACENTRE can't
 * be reached — the caller says so with a retry, never an NGG PIN that the
 * routers no longer know.
 */
function wifi_cac_member_view(array $m, string $op = 'show', string $password = ''): array {
    $r = wifi_cac_card((string)$m['memberId'], $op, $password, wifi_cac_me($m));
    if (empty($r['ok'])) {
        /* CACENTRE's own sentence for a password it refused says what to change. */
        if (in_array((string)($r['error'] ?? ''), ['weak', 'too_many'], true) && (string)($r['message'] ?? '') !== '') throw new RuntimeException('msg:' . (string)$r['message']);
        throw new RuntimeException((string)($r['error'] ?? 'cacentre_unreachable'));
    }
    $c = $r['card'] ?? null;
    if (!is_array($c)) return ['username' => '', 'pin' => '', 'hasPassword' => false, 'passwordMin' => WIFI_PASSWORD_MIN, 'pinSetAt' => '', 'access' => 'off', 'profile' => '', 'limits' => null, 'case' => 'not_listed',
        'why' => 'Not on CACENTRE’s Wi-Fi list', 'override' => null, 'resetsLeft' => 0, 'centre' => (string)($m['centre'] ?? ''),
        'centreHasWifi' => false, 'usage' => null, 'source' => 'cacentre'];
    /* CACENTRE words a reason for its staff ("Next Generation Genius has no
       Wi-Fi for them: Suspended…"). On the member's own screen NGG's part is
       just NGG's reason, the same words wifi_view() would have shown. */
    $why = rtrim((string)($c['why'] ?? ''), '.');
    if (in_array((string)($c['case'] ?? ''), ['issuer_off', 'issuer_limited'], true) && ($k = strpos($why, ': ')) !== false) $why = substr($why, $k + 2);
    if ($why === 'On') $why = '';
    $sp = is_array($c['speed'] ?? null) ? $c['speed'] : null;
    $u = is_array($c['usage'] ?? null) ? $c['usage'] : null;
    return ['username' => (string)$c['username'], 'pin' => '', 'hasPassword' => !empty($c['hasPassword']), 'passwordMin' => WIFI_PASSWORD_MIN, 'pinSetAt' => (string)($c['pinSetAt'] ?? ''),
        /* The starting password CACENTRE made, until they choose their own (never their own). */
        'startCode' => (string)($c['startCode'] ?? ''), 'ownPassword' => !empty($c['ownPassword']),
        'access' => in_array($c['access'] ?? '', WIFI_ACCESS, true) ? (string)$c['access'] : 'off', 'profile' => '',
        'limits' => $sp ? ['down' => (int)$sp['down'], 'devices' => (int)$sp['devices'], 'hours' => (string)($sp['hours'] ?? '')] : null,
        'case' => WIFI_CAC_CASES[(string)($c['case'] ?? '')] ?? (string)($c['case'] ?? ''), 'why' => $why,
        'override' => null, 'resetsLeft' => (int)($c['resetsLeft'] ?? 0), 'centre' => (string)($m['centre'] ?? ''), 'centreHasWifi' => !empty($c['hasRouter']),
        'usage' => $u ? ['today' => (int)$u['today'], 'month' => (int)$u['month'], 'dayMb' => (int)$u['dayMb'], 'monthMb' => (int)$u['monthMb'], 'over' => (string)($u['over'] ?? ''), 'days' => []] : null,
        'source' => 'cacentre'];
}

/* ── Moving a centre's router to CACENTRE ─────────────────────────────── */

/**
 * admin.wifi.gateway.moved {gatewayId, undo?} — this router now runs from
 * CACENTRE (its one line there removes NGG's script). NGG stops watching it,
 * its centre's members see CACENTRE's PIN at once, and if NGG's script is in
 * fact still on it, its fetch is answered "moved" and it keeps its people.
 * Undo puts it back on NGG with a full list at its next fetch.
 */
function admin_wifi_gateway_moved(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $f = wifi_gateway_for($g, (string)($p['gatewayId'] ?? '')); if (!$f['ok']) return $f;
    $r = $f['row']; $undo = !empty($p['undo']);
    if (!$undo && !wifi_cac_ready()) return ['ok' => false, 'error' => 'cacentre_not_connected', 'message' => 'NGG isn’t connected to CACENTRE yet, so there is nowhere for this router to move to.'];
    if ($undo === ((string)($r['movedAt'] ?? '') === '')) return ['ok' => true, 'unchanged' => true, 'gateway' => wifi_gateway_out($r)];
    db_update('wifi_gateways', $undo ? ['movedAt' => '', 'ackedJson' => '', 'pendingJson' => '', 'pendingVersion' => 0, 'lastFullAt' => '', 'silentAlertAt' => '']
                                    : ['movedAt' => now_iso()], ['id' => (int)$r['id']]);
    audit($undo ? 'wifi.gateway.back' : 'wifi.gateway.moved', (string)$g['requester']['memberId'], (string)$r['gatewayId'], ['centre' => (string)$r['centre']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'gateway' => wifi_gateway_out(wifi_gateway_live((string)$r['gatewayId']))];
}

/** Where a router is added and moved to at CACENTRE, and the site code its centre goes under there. */
function wifi_cac_site_code(string $centre): string {
    $c = db_row('SELECT code FROM centres WHERE name = ? LIMIT 1', [$centre]);
    return strtolower(trim((string)($c['code'] ?? '')));
}

