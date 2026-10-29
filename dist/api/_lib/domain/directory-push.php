<?php
/**
 * domain/directory-push.php — telling CACENTRE's person directory who is here.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 * The estate runs five apps over fourteen identity stores with no common key.
 * One human is routinely several rows — an NGG member who is also a
 * volunteer, a CACENTRE staff record and an Afrovanguard learner is four, and
 * nothing joins them. CACENTRE keeps one record per person; this is NGG's
 * share of saying so.
 *
 * We PUSH. CACENTRE reads no database of ours — the estate's posture for
 * money (CFIS ADR 22) applied to people, and the reason a break-in there
 * cannot reach this programme's children.
 *
 * ── EVERY ROW OF THIS LANDS IN REVIEW, AND THAT IS THE POINT ───────────────
 * Both NGG stores are ❌ for auto-linking and the schemas are why:
 *
 *     members.email     VARCHAR(200), INDEX idx_members_email  — not unique
 *     volunteers.email  VARCHAR(200), INDEX idx_vol_email      — not unique
 *
 * `members.email` carries no UNIQUE constraint deliberately (schema-mysql.sql
 * says so in as many words), and the population makes it worse than a missing
 * key usually is: SIBLINGS SHARE A PARENT'S INBOX. Two children on one
 * address auto-linked is two people merged into one, and the evidence that
 * they were two is exactly what the merge destroyed — so nobody reports it.
 * The volunteers are the same shape: a couple volunteering together, a parent
 * with a teenager, a school office address on four helpers.
 *
 * So CACENTRE proposes and a human decides. That is slower and it is the only
 * safe direction for this app's data.
 *
 * ── WHAT TRAVELS ───────────────────────────────────────────────────────────
 * Name, address, the role the source records, status. NOT `passwordHash`,
 * NOT `totpSecret`, NOT the volunteer's `token`, NOT `dob`, NOT `phone`, NOT
 * `parentEmail`, NOT `parentPhone`, NOT `school`, NOT `notes`. This programme
 * holds children's data; the directory asks who somebody is and gets that and
 * nothing else. CACENTRE refuses a field it did not ask for rather than
 * ignoring it, so an addition here fails loudly on the next run.
 *
 * ── A KNOWN ASSERTION THIS DOES NOT YET CARRY ──────────────────────────────
 * `volunteers.memberId` is a same-person link somebody already recorded, and
 * the agreed payload has nowhere to put it — so a volunteer and their member
 * record arrive as two unlinked identities and wait for an operator who has
 * to re-decide what the database already knows. That is safe and it is extra
 * clicks. Carrying asserted links is a change to the wire format, in both
 * repositories, and belongs in its own piece of work rather than smuggled in
 * here. Written down so it is a decision and not an oversight.
 */

/** Who NGG is in the directory's app registry. */
const DIRPUSH_APP = 'ngg';

/** The two stores this key may write. */
const DIRPUSH_STORES = ['members', 'volunteers'];

/** Rows per batch. CACENTRE refuses a larger one and names this number. */
const DIRPUSH_BATCH = 500;

/** Must match DirectoryEnvelope::TTL on the receiving side. */
const DIRPUSH_TTL = 300;

const DIRPUSH_TYP = 'dir.push';

/**
 * The push secret, or ''.
 *
 * `api/config.php` is not in the repository and is where this estate keeps
 * every secret; the environment is checked first so a host that can set one
 * does not need the file edited.
 */
function dirpush_secret(): string {
    $v = getenv('DIR_PUSH_SECRET_NGG');
    if ($v !== false && trim((string)$v) !== '') return trim((string)$v);

    return trim((string)($GLOBALS['CONFIG']['dir_push_secret'] ?? ''));
}

/**
 * Is the push configured?
 *
 * A half-set key counts as absent. This is an optional integration and
 * nothing here depends on it, so it must never be the reason a cron tick
 * reports a failure — but it must also not look configured when it is not.
 */
function dirpush_ready(): bool {
    $s = dirpush_secret();
    if (strlen($s) < 32) return false;

    return !preg_match('/^<.*>$/s', $s)
        && !preg_match('/x{8,}/i', $s)
        && !preg_match('/^(your|changeme|replace|example|todo)/i', $s);
}

/** Where CACENTRE is. The one address NGG reaches it at, for the directory and the Wi-Fi alike. */
function dirpush_base(): string {
    $base = trim((string)(getenv('DIR_PUSH_URL') ?: ($GLOBALS['CONFIG']['dir_push_url'] ?? '')));
    if ($base === '') $base = 'https://cacentre.afrovanguard.org.ng';

    return rtrim($base, '/');
}

function dirpush_endpoint(): string {
    return dirpush_base() . '/api/directory-push.php?app=' . DIRPUSH_APP;
}

/**
 * One member row, shaped.
 *
 * `members` holds BOTH populations — `type` is `NGG` or `Summer` — and the
 * agreed payload has no field for which. `local_role` carries it, because
 * the distinction IS role-shaped in this programme's own vocabulary: a
 * Summer person is a **participant**, never a student and never a member,
 * and an operator deciding whether two records are one human needs to know
 * which of the two they are looking at. An NGG row keeps its own `role`.
 *
 * `members.cohort` is NOT sent and would be meaningless there: on a member
 * row it is the intake year, not a Summer School edition. One word, two
 * meanings, and the directory has no use for either.
 *
 * @param array<string,mixed> $r a `members` row
 * @return array<string,mixed>
 */
function dirpush_from_member(array $r): array {
    $type = trim((string)($r['type'] ?? ''));

    return [
        'store' => 'members',
        'local_id' => (string)($r['id'] ?? ''),
        'email' => strtolower(trim((string)($r['email'] ?? ''))),
        /* No verification concept on this table at all — null is the third
           state, "not tracked". Sending false would mark every child in the
           programme unverified on a screen that is not about them. */
        'email_verified' => null,
        'name' => trim((string)($r['fullName'] ?? '')),
        'local_role' => $type === 'Summer' ? 'participant' : trim((string)($r['role'] ?? 'member')),
        'local_status' => trim((string)($r['status'] ?? '')),
        'last_seen_at' => null,
    ];
}

/**
 * One volunteer row, shaped.
 *
 * `token` is a credential and does not travel. Neither does `photoUrl` or
 * `dob`. `safeguarding` is a clearance state and is deliberately left here:
 * it is a safeguarding judgement about a person working with children, it
 * belongs on the screen that can act on it, and a copy of it on another host
 * is a copy nobody will remember to withdraw.
 *
 * @param array<string,mixed> $r a `volunteers` row
 * @return array<string,mixed>
 */
function dirpush_from_volunteer(array $r): array {
    return [
        'store' => 'volunteers',
        'local_id' => (string)($r['id'] ?? ''),
        'email' => strtolower(trim((string)($r['email'] ?? ''))),
        'email_verified' => null,
        'name' => trim((string)($r['fullName'] ?? '')),
        'local_role' => trim((string)($r['role'] ?? 'volunteer')),
        'local_status' => trim((string)($r['status'] ?? '')),
        'last_seen_at' => null,
    ];
}

/**
 * One page of a store, and where the cursor goes next.
 *
 * A rolling sweep rather than a diff. Both tables carry `updatedAt`, and it
 * is a VARCHAR written by several code paths over the years — exactly the
 * column that quietly stops being comparable. Rather than trust it and
 * silently miss every row it gets wrong, this walks the table in id order and
 * starts again at the top. Every row is re-sent once a sweep and upserts on
 * its source key over there.
 *
 * @return array{rows:list<array<string,mixed>>, cursor:int, wrapped:bool}
 */
function dirpush_batch(string $store, int $cursor, int $limit = DIRPUSH_BATCH): array {
    $limit = max(1, min(DIRPUSH_BATCH, $limit));
    if (!in_array($store, DIRPUSH_STORES, true)) {
        return ['rows' => [], 'cursor' => 0, 'wrapped' => true];
    }

    $sql = $store === 'members'
        ? 'SELECT id, fullName, email, type, role, status FROM members WHERE id > ? ORDER BY id ASC LIMIT ' . (int)$limit
        : 'SELECT id, fullName, email, role, status FROM volunteers WHERE id > ? ORDER BY id ASC LIMIT ' . (int)$limit;

    $rows = [];
    $last = $cursor;
    try {
        foreach (db_all($sql, [$cursor]) as $r) {
            $rows[] = $store === 'members' ? dirpush_from_member($r) : dirpush_from_volunteer($r);
            $last = (int)$r['id'];
        }
    } catch (Throwable $e) {
        error_log('[dirpush] ' . $store . ': ' . $e->getMessage());

        return ['rows' => [], 'cursor' => $cursor, 'wrapped' => true];
    }

    $wrapped = count($rows) < $limit;
    if ($wrapped) $last = 0;

    return ['rows' => $rows, 'cursor' => $last, 'wrapped' => $wrapped];
}

/**
 * Sign a batch.
 *
 * The estate's `v1.<base64url payload>.<base64url HMAC-SHA256>` envelope, and
 * the claims go in a FIXED ORDER: a MAC is over serialised bytes, so the
 * order of the keys is part of the format whether anybody intended it to be
 * or not. Held to shared vectors that three other repositories assert.
 *
 * @param list<array<string,mixed>> $rows
 */
function dirpush_mint(array $rows, ?string $secret = null, ?int $now = null): string {
    return dirpush_sign(DIRPUSH_TYP, ['rows' => array_values($rows)], $secret, $now);
}

/**
 * Sign any document this connection carries. CACENTRE's DirectoryEnvelope
 * knows three: `dir.push` (above), and the Wi-Fi's `wifi.roster` and
 * `wifi.card` (domain/wifi-cacentre.php). Same key, same wire; `typ` keeps
 * them apart at the other end.
 *
 * @param array<string,mixed> $claims
 */
function dirpush_sign(string $typ, array $claims, ?string $secret = null, ?int $now = null): string {
    $now = $now ?? time();
    $payload = json_encode($claims + [
        'iss'   => DIRPUSH_APP,
        'typ'   => $typ,
        'nonce' => bin2hex(random_bytes(16)),
        'iat'   => $now,
        'exp'   => $now + DIRPUSH_TTL,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $body = rtrim(strtr(base64_encode((string)$payload), '+/', '-_'), '=');
    $mac  = hash_hmac('sha256', $body, $secret ?? dirpush_secret(), true);

    return 'v1.' . $body . '.' . rtrim(strtr(base64_encode($mac), '+/', '-_'), '=');
}

/**
 * Send one batch.
 *
 * @param  list<array<string,mixed>> $rows
 * @return array<string,mixed>
 */
function dirpush_send(array $rows): array {
    if (!dirpush_ready()) return ['ok' => false, 'error' => 'not-configured'];
    if ($rows === [])     return ['ok' => true, 'written' => 0];

    return dirpush_post(dirpush_endpoint(), dirpush_mint($rows));
}

/**
 * POST one signed token to CACENTRE. Never throws.
 *
 * @return array<string,mixed>
 */
function dirpush_post(string $url, string $token, int $timeout = 30): array {
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        /* The batch is inside the token and the token is in the body. Not a
           header: five hundred rows is far past the 8KB a server allows
           there, and that is a limit met on the first real run. */
        CURLOPT_POSTFIELDS => json_encode(['token' => $token], JSON_UNESCAPED_SLASHES),
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err !== '' || $body === false) {
        error_log('[dirpush] ' . ($err ?: 'no response'));

        return ['ok' => false, 'error' => 'unreachable'];
    }

    $json = json_decode((string)$body, true);
    if (!is_array($json)) return ['ok' => false, 'error' => 'bad-response', 'http' => $code];

    if (empty($json['ok'])) {
        /* The reason CACENTRE gave, kept: "expired" and "bad_signature" are
           a clock and a key, two different afternoons. */
        error_log('[dirpush] HTTP ' . $code . ' ' . json_encode($json));
    }

    return $json + ['http' => $code];
}

/**
 * One page of each store, from wherever the last tick stopped.
 *
 * The cursor advances only on a push CACENTRE accepted — a page lost to a
 * timeout goes again rather than being skipped, because a skipped page is a
 * silent hole in the directory until the sweep comes round again.
 *
 * @return array<string,mixed>
 */
function dirpush_tick(int $limit = DIRPUSH_BATCH): array {
    if (!dirpush_ready()) return ['skipped' => 'no key'];

    $out = ['sent' => 0, 'written' => 0, 'refused' => 0];

    foreach (DIRPUSH_STORES as $store) {
        $key = 'dirpush_cursor_' . $store;
        $cursor = (int)(setting_raw($key) ?? '0');
        $b = dirpush_batch($store, $cursor, $limit);
        if ($b['rows'] === []) {
            if ($cursor !== 0) setting_set($key, '0');
            continue;
        }

        $out['sent'] += count($b['rows']);
        $res = dirpush_send($b['rows']);
        $out['written'] += (int)($res['written'] ?? 0);
        $out['refused'] += (int)($res['refused'] ?? 0);

        if (empty($res['ok'])) {
            $out['error'] = (string)($res['error'] ?? 'refused');
            /* Leave the cursor and stop: the next store would be sent into
               the same refusal, and whatever is wrong is wrong for both. */
            break;
        }
        setting_set($key, (string)$b['cursor']);
    }

    return $out;
}
