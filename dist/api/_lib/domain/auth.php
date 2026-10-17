<?php
declare(strict_types=1);

/**
 * Auth domain — magic link + OTP sign-in, plus TOTP 2FA for admins.
 * (Rate limiting is enforced at the route edge via rate_limit_check.)
 */

/* ── Password hashing — Argon2id when the PHP build has it, bcrypt otherwise ── */
function password_algo_best() {
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}
function password_hash_best(string $pw): string {
    return password_hash($pw, password_algo_best());
}

/* ── Account-level lockout (edge rate limits still apply per-IP) ─────────── */
const AUTH_LOCK_AFTER = 8;        // consecutive failures…
const AUTH_LOCK_MINUTES = 15;     // …buys this long a lock

function auth_locked(array $m): bool {
    return !empty($m['lockedUntil']) && strtotime((string)$m['lockedUntil']) > time();
}
function auth_fail_bump(array $m, string $ip): void {
    $n = (int)($m['failedLogins'] ?? 0) + 1;
    $upd = ['failedLogins' => $n, 'updatedAt' => now_iso()];
    if ($n >= AUTH_LOCK_AFTER) {
        $upd['failedLogins'] = 0;
        $upd['lockedUntil'] = gmdate('Y-m-d\TH:i:s\Z', time() + AUTH_LOCK_MINUTES * 60);
        audit('login.lockout', $m['memberId'], (string)$m['memberId'], ['minutes' => AUTH_LOCK_MINUTES], $ip);
    }
    db_update('members', $upd, ['id' => $m['id']]);
}
function auth_fail_reset(array $m): void {
    db_update('members', ['failedLogins' => 0, 'lockedUntil' => '', 'lastLoginAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => $m['id']]);
}

/**
 * Sign-in gateway — given an identifier, say which methods apply so the
 * client shows ONE right next step. Unknown and passwordless accounts answer
 * identically (['code']) so nothing about account existence — or staffness —
 * leaks from this endpoint. Staff simply look like members with a password.
 */
/* ── Who is signing in: honest to people, worthless to bots ────────────────
 * Two promises that pull against each other: a parent who typed last year's
 * address must not sit waiting for a code that is never coming, and a
 * stranger must not be able to ask "is this email an NGG member?" — for a
 * children's programme that is a safeguarding fact, and OWASP's rule is one
 * response whatever the account. So:
 *
 *   - A browser that has SIGNED IN HERE BEFORE (device_trust_id(), a signed
 *     cookie that outlives sign-out) is told plainly: `no_account`. It has
 *     already proven itself, and it gets AUTH_HONEST_PER_DAY plain answers a
 *     day, so even an insider's browser is no enumeration tool.
 *   - Anybody else gets the same neutral screen for a real and an unknown
 *     account ("if there's an account for…, we've emailed it a code"), and
 *     the TRUTH goes to the inbox: an address with no account is sent one
 *     short "there's no NGG account for this email" note, at most one a day
 *     (auth_notify_no_account()). Only the owner of the address learns it.
 *   - Misses are counted per network ADDRESS (attempt_guard 'auth.miss');
 *     the AUTH_MISS_MAX-th pauses it for AUTH_MISS_LOCK seconds, and while
 *     paused EVERY lookup is refused before the database is read, real or
 *     not, so the pause is not an oracle either. A hit never clears the
 *     count, or a bot would interleave a known address.
 *   - One person is emailed at most AUTH_CODES_PER_HOUR codes an hour; past
 *     that the answer is unchanged and nothing more is sent.
 *   - Suspended accounts answer like any other.
 *   - The routes add per-minute and per-hour buckets and a honeypot field. */
const AUTH_MISS_MAX       = 8;
const AUTH_MISS_LOCK      = 1800;
const AUTH_CODES_PER_HOUR = 5;
const AUTH_HONEST_PER_DAY = 5;

/**
 * Look up an identifier for the sign-in door.
 *   ['ok'=>false,'error'=>'too_many_misses']      this address is paused
 *   ['ok'=>true,'member'=>row]                    found
 *   ['ok'=>true,'member'=>null,'honest'=>bool]    not found; honest = this
 *                                                 known device may be told so
 * $countMiss: the step that answers uniformly and SENDS something counts every
 * miss; the gateway, which sends nothing, counts only the misses it answers
 * plainly — otherwise one typo cost two misses.
 */
function auth_find_member(string $identifier, string $ip, string $via, string $device = '', bool $countMiss = true): array {
    if ($ip !== '' && attempt_locked('auth.miss', $ip)) {
        audit('login.miss.locked', null, $identifier, ['via' => $via], $ip);
        return ['ok' => false, 'error' => 'too_many_misses'];
    }
    // trim() on the stored side too: a record typed with a trailing space is still that person.
    $member = db_row("SELECT * FROM members WHERE lower(trim(memberId)) = ? OR lower(trim(email)) = ? OR (displayId <> '' AND lower(trim(displayId)) = ?) LIMIT 1", [$identifier, $identifier, $identifier]);
    if ($member) return ['ok' => true, 'member' => $member];
    /* Not a member account: the Volunteer Vanguard. Instructors, mentors and
     * coordinators hold a volunteers row (or only a mentors row), and this
     * door used to know nothing but `members` — so every one of them typed
     * their own email, was told a code was on its way, and never got one. */
    $staff = auth_find_volunteer($identifier);
    if ($staff && ($staff['kind'] ?? '') === 'ambiguous') return ['ok' => true, 'member' => null, 'ambiguous' => true];
    if ($staff) return ['ok' => true, 'member' => null, 'staff' => $staff];

    $honest = $device !== '' && !attempt_locked('auth.honest', $device);
    if ($honest) attempt_fail('auth.honest', $device, AUTH_HONEST_PER_DAY, 86400);
    $paused = ($countMiss || $honest) ? attempt_fail('auth.miss', $ip, AUTH_MISS_MAX, AUTH_MISS_LOCK) : false;
    audit('login.fail.unknown', null, $identifier, ['identifier' => $identifier, 'via' => $via, 'told' => $honest, 'paused' => $paused], $ip);
    return ['ok' => true, 'member' => null, 'honest' => $honest];
}

/**
 * What a person typed at the door, the way the records hold it. Phones and
 * copy-paste bring their own characters: a trailing space, a non-breaking
 * space, a zero-width joiner, an en dash from a card printed in Word
 * ("VOL–INS–26–001"), spaces inside an ID ("VOL INS 26 001"), a stray full
 * stop after an email, a mailto: prefix. Each of those once read as "no
 * account". Lowercased, because every lookup compares lowercased.
 */
function auth_clean_identifier(string $raw): string {
    $s = preg_replace('/[\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', $raw) ?? $raw;
    $s = preg_replace('/[\x{00A0}\x{2007}\x{202F}]/u', ' ', $s) ?? $s;
    $s = preg_replace('/[\x{2010}-\x{2015}\x{2212}]/u', '-', $s) ?? $s;
    $s = trim(mb_strtolower($s));
    $s = preg_replace('/^mailto:/', '', $s) ?? $s;
    if (strpos($s, '@') !== false) {
        $s = preg_replace('/\s+/', '', $s) ?? $s;
        return rtrim($s, '.,;');
    }
    // An ID: spaces, underscores and full stops between its parts are dashes; repeated dashes are one.
    $s = preg_replace('/[\s_.]+/', '-', $s) ?? $s;
    return trim(preg_replace('/-{2,}/', '-', $s) ?? $s, '-');
}

/** Any identifier the sign-in door accepts: an email, or an ID as it is
 *  printed — NGG-2025-0042 (account), 026-014 (member card), VOL-INS-26-001
 *  (volunteer card). The old pattern took only the first, so a card's own
 *  number was refused as "not an email or member ID" before any lookup. */
function auth_identifier_ok(string $s): bool {
    $s = trim($s);
    return (bool)filter_var($s, FILTER_VALIDATE_EMAIL)
        || (bool)preg_match('/^[A-Z0-9]{2,8}(-[A-Z0-9]{1,8}){1,3}$/i', $s);
}

/**
 * A volunteer, instructor or mentor at the main door, by card number or email:
 *   ['kind' => 'volunteer', 'id' => volunteerId, 'row' => volunteers row]
 *   ['kind' => 'mentor',    'id' => mentorId,    'row' => mentors row]   — a
 *     mentor added straight to the mentors table, bound to nobody yet; they
 *     are given a volunteer record once the emailed code proves the address
 *     (auth_staff_principal), never on a lookup.
 * An email shared by two active volunteers answers nobody: the card number is
 * unambiguous and the door says to use it, rather than picking one.
 */
function auth_find_volunteer(string $identifier): ?array {
    $id = strtolower(trim($identifier));
    if ($id === '') return null;
    // Active, whatever case or spacing the status was saved with.
    $live = "lower(trim(COALESCE(status,''))) = 'active'";
    if (strpos($id, '@') === false) {
        $v = db_row("SELECT * FROM volunteers WHERE lower(trim(volunteerId)) = ? AND $live LIMIT 1", [$id]);
        return $v ? ['kind' => 'volunteer', 'id' => (string)$v['volunteerId'], 'row' => $v] : null;
    }
    $rows = db_all("SELECT * FROM volunteers WHERE lower(trim(email)) = ? AND $live ORDER BY id", [$id]);
    if (count($rows) === 1) return ['kind' => 'volunteer', 'id' => (string)$rows[0]['volunteerId'], 'row' => $rows[0]];
    /* Two active records on one email is nearly always one person twice — a
     * Summer School volunteer carried into NGG keeps the old card, and the
     * conversion leaves both rows. Answering nobody told that person "there is
     * no account". The code goes to the address they typed either way, so
     * pick the record they work under now: an NGG one over a Summer one, then
     * the one with an instructor/mentor role, then the newest. */
    if (count($rows) > 1) {
        /* …but only when the rows are provably ONE person — the same name, or
         * the same member account. Two adults sharing a family inbox are two
         * people; picking one would sign whoever reads the code in as the
         * other, with that person's children. Those are told, at that address,
         * to use their card number (auth_request), never resolved. */
        $who = static fn($r) => trim((string)($r['memberId'] ?? '')) !== '' ? 'm:' . strtolower(trim((string)$r['memberId']))
            : 'n:' . preg_replace('/\s+/', ' ', mb_strtolower(trim((string)($r['fullName'] ?? ''))));
        if (count(array_unique(array_map($who, $rows))) > 1) return ['kind' => 'ambiguous', 'id' => '', 'row' => [], 'shared' => count($rows)];
        usort($rows, static function ($a, $b) {
            $score = static fn($r) => (strtolower((string)($r['programme'] ?? '')) === 'ngg' ? 4 : 0)
                + (in_array(strtolower((string)($r['role'] ?? '')), ['instructor', 'mentor', 'coordinator', 'lead'], true) ? 2 : 0);
            return [$score($b), (string)($b['updatedAt'] ?? $b['createdAt'] ?? ''), (int)$b['id']] <=> [$score($a), (string)($a['updatedAt'] ?? $a['createdAt'] ?? ''), (int)$a['id']];
        });
        return ['kind' => 'volunteer', 'id' => (string)$rows[0]['volunteerId'], 'row' => $rows[0], 'shared' => count($rows)];
    }
    $m = function_exists('mentor_rows_for_email') ? mentor_rows_for_email($id) : [];
    if (count($m) !== 1) return null;
    // Bound to a member account: that account is the door, not this one.
    if (trim((string)($m[0]['memberId'] ?? '')) !== '') return null;
    $vid = trim((string)($m[0]['volunteerId'] ?? ''));
    if ($vid !== '') {
        $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$vid]);
        return $v ? ['kind' => 'volunteer', 'id' => $vid, 'row' => $v] : null;
    }
    return ['kind' => 'mentor', 'id' => (string)$m[0]['mentorId'], 'row' => $m[0]];
}

/**
 * The volunteers row a verified staff sign-in becomes. A mentor who has only
 * a mentors row is given one here — the card-holder session, the mentor gate
 * and the portal all key on a volunteerId, and a mentor with neither a member
 * nor a volunteer id had no identity anything could resolve.
 */
function auth_staff_principal(string $id): ?array {
    $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND lower(trim(COALESCE(status,''))) = 'active' LIMIT 1", [$id]);
    if ($v) return $v;
    $m = db_row("SELECT * FROM mentors WHERE mentorId = ? AND status = 'active' LIMIT 1", [$id]);
    if (!$m || trim((string)($m['memberId'] ?? '')) !== '') return null;
    $bound = trim((string)($m['volunteerId'] ?? ''));
    if ($bound !== '') return db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$bound]) ?: null;
    $tier = function_exists('vol_tier_for') ? vol_tier_for('mentor') : ['code' => 'MEN'];
    $vid = volunteer_display_id((string)($tier['code'] ?? 'MEN'));
    db_insert('volunteers', [
        'volunteerId' => $vid, 'fullName' => (string)($m['fullName'] ?? ''), 'email' => (string)($m['email'] ?? ''),
        'phone' => (string)($m['phone'] ?? ''), 'role' => 'mentor', 'centre' => (string)($m['centre'] ?? ''),
        'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_update('mentors', ['volunteerId' => $vid, 'updatedAt' => now_iso()], ['mentorId' => (string)$m['mentorId']]);
    audit('volunteer.provision.mentor', $vid, (string)$m['mentorId'], ['via' => 'signin'], '');
    return db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$vid]) ?: null;
}

/**
 * What the code screen shows as "where it went": the address the person typed,
 * masked — never the account's own address, and nothing for a Member ID. A
 * real account and an unknown one therefore produce the same string (the old
 * fake "a•@b.co" for an unknown ID was itself a tell).
 */
function auth_masked_for(string $identifier): string {
    return strpos($identifier, '@') !== false ? mask_email($identifier) : '';
}

/**
 * The truth, delivered to the only person entitled to it: an email typed at
 * the door that has no account gets one short note saying so. At most one per
 * address per day ('auth.nobody'), so the door cannot be used to mail-bomb a
 * stranger; a Member ID has no inbox and gets nothing.
 */
function auth_notify_no_account(string $identifier, string $ip, string $via): void {
    if (!filter_var($identifier, FILTER_VALIDATE_EMAIL)) return;
    if (attempt_locked('auth.nobody', $identifier)) return;
    attempt_fail('auth.nobody', $identifier, 1, 86400);
    global $CONFIG;
    $origin = (string)($CONFIG['app_origin'] ?? '');
    $html = email_template([
        'eyebrow'  => $via === 'reset' ? 'Password reset' : 'Sign-in',
        'title'    => 'There’s no NGG account for this email',
        'intro'    => 'Someone, probably you, just tried to ' . ($via === 'reset' ? 'reset a password' : 'sign in')
                    . ' at Next Generation Genius with this email address, but no account uses it, so no code was sent.',
        'bodyHtml' => '<p style="margin:0 0 8px">Already a member? Try the email you joined with, or sign in with your Member ID (like NGG-2025-0042).</p>'
                    . '<p style="margin:0">New to NGG? You can apply to join.</p>',
        'ctaLabel' => 'Apply to join',
        'ctaUrl'   => $origin . '/join',
        'footNote' => 'Didn’t try to sign in? You can ignore this email. Nothing has been created or changed.',
    ]);
    $sent = send_mail($identifier, 'Sign-in attempt at Next Generation Genius', $html);
    audit($sent ? 'login.nobody.notified' : 'login.nobody.mail_fail', null, $identifier, ['via' => $via], $ip);
}

/** An email on two different people's volunteer records: sign in with the card number instead (one note a day). */
function auth_notify_shared_email(string $identifier, string $ip): void {
    if (!filter_var($identifier, FILTER_VALIDATE_EMAIL) || attempt_locked('auth.shared', $identifier)) return;
    attempt_fail('auth.shared', $identifier, 1, 86400);
    $html = email_template(['eyebrow' => 'Sign-in', 'title' => 'Sign in with your volunteer card number',
        'intro' => 'Someone, probably you, tried to sign in to Next Generation Genius with this email address. It is on more than one volunteer record, so we could not tell whose account to open.',
        'bodyHtml' => '<p style="margin:0">Sign in with the ID printed on your volunteer card instead (it looks like VOL-INS-26-001). If you have no card yet, ask your centre to give each person their own email on their record.</p>',
        'footNote' => 'Didn’t try to sign in? You can ignore this email. Nothing has been changed.']);
    $sent = send_mail($identifier, 'Sign in with your card number — Next Generation Genius', $html);
    audit($sent ? 'login.shared_email.notified' : 'login.shared_email.mail_fail', null, $identifier, [], $ip);
}

/** Codes of one purpose emailed to one person in the last hour. */
function auth_codes_last_hour(string $memberId, string $purpose): int {
    $r = db_row('SELECT COUNT(*) AS n FROM auth_sessions WHERE memberId = ? AND purpose = ? AND createdAt > ?',
                [$memberId, $purpose, gmdate('Y-m-d\TH:i:s\Z', time() - 3600)]);
    return (int)($r['n'] ?? 0);
}

function auth_gateway(array $p): array {
    $identifier = auth_clean_identifier((string)($p['identifier'] ?? ''));
    if ($identifier === '') return ['ok' => false, 'error' => 'no_identifier'];
    $found = auth_find_member($identifier, (string)($p['ip'] ?? ''), 'gateway', (string)($p['device'] ?? ''), false);
    if (empty($found['ok'])) return $found;
    // A known device is told plainly; anyone else cannot tell unknown,
    // suspended and passwordless apart — all answer ['code'].
    if (!empty($found['honest'])) return ['ok' => false, 'error' => 'no_account'];
    $member = $found['member'];
    $methods = ['code'];
    if ($member && !empty($member['passwordHash']) && (string)$member['status'] !== 'suspended') {
        // Staff/admin accounts are password-only: the config-provisioned password
        // is required and the emailed-code path is not offered to them, so the
        // client hides "email me a code". Regular members keep both methods.
        if (is_admin_role($member['role'])) {
            $methods = ['password'];
        } else {
            $methods[] = 'password';
        }
    }
    return ['ok' => true, 'methods' => $methods];
}

/**
 * Admins sign in with the config-provisioned password, never an emailed code.
 * True when this account holds a console role AND has a password set — used to
 * refuse the OTP/magic-link login path for staff. An admin somehow without a
 * password is left on the code path so a fresh deploy can never be locked out.
 */
function auth_password_only(?array $member): bool {
    return $member && !empty($member['passwordHash']) && is_admin_role($member['role'] ?? '');
}

function auth_request(array $p): array {
    $identifier = auth_clean_identifier((string)($p['identifier'] ?? ''));
    $ip = (string)($p['ip'] ?? '');
    if ($identifier === '') return ['ok' => false, 'error' => 'no_identifier'];

    $found = auth_find_member($identifier, $ip, 'request', (string)($p['device'] ?? ''));
    if (empty($found['ok'])) return $found;
    $member = $found['member'];
    $masked = auth_masked_for($identifier);
    if (!$member && !empty($found['staff'])) {
        // A volunteer/instructor/mentor: the same code, mailed to the address
        // on their volunteer (or mentor) record, keyed by that record's id.
        $st = $found['staff'];
        $email = trim((string)($st['row']['email'] ?? ''));
        // Only reachable by the card number (an email lookup found the email):
        // the card is in their hand, so saying which door to use leaks nothing.
        if ($email === '') return ['ok' => false, 'error' => 'no_email_use_card'];
        $member = ['memberId' => $st['id'], 'email' => $email, 'fullName' => (string)($st['row']['fullName'] ?? ''), 'status' => 'active', 'role' => 'volunteer'];
    }
    if (!$member && !empty($found['ambiguous'])) {
        // Two different people's volunteer records share this inbox: say so, to that inbox only.
        auth_notify_shared_email($identifier, $ip);
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    if (!$member) {
        if (!empty($found['honest'])) return ['ok' => false, 'error' => 'no_account'];
        auth_notify_no_account($identifier, $ip, 'request');
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    if ((string)$member['status'] === 'suspended') {
        audit('login.fail.suspended', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    if (auth_codes_last_hour((string)$member['memberId'], 'login') >= AUTH_CODES_PER_HOUR) {
        audit('login.request.capped', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    // Admins must use their password — never an emailed sign-in code.
    if (auth_password_only($member)) {
        audit('login.otp.blocked_admin', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => false, 'error' => 'use_password'];
    }

    $token = rand_hex(32);
    $otp = new_otp();
    $now = time();
    db_insert('auth_sessions', [
        'token' => $token, 'memberId' => $member['memberId'], 'email' => $member['email'],
        'otp' => $otp, 'attempts' => 0, 'purpose' => 'login',
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $now + 15 * 60),
        'verifiedAt' => '', 'ip' => $ip, 'userAgent' => (string)($p['userAgent'] ?? ''),
    ]);

    global $CONFIG;
    $link = ($CONFIG['app_origin'] ?? '') . '/?signin=' . rawurlencode($token);
    $first = explode(' ', (string)$member['fullName'])[0] ?? '';
    $html = email_template([
        'eyebrow'  => 'Secure sign-in',
        'title'    => 'Sign in to NGG',
        'intro'    => 'Hi ' . ($first ?: 'there') . ', tap the button to sign in — or use the code below. Both are good for 15 minutes.',
        'ctaLabel' => 'Sign in',
        'ctaUrl'   => $link,
        'otp'      => $otp,
        'footNote' => 'You requested a sign-in to Next Generation Genius. Didn\'t request this? Ignore this email — your account stays secure.',
    ]);
    // The OTP/link row is already banked. If the mail relay fails we must NOT
    // hard-fail the request: that dead-ends the only email-free retry path.
    // Report delivery=false instead so the UI can keep the code screen open,
    // warn the user, and steer them to password sign-in.
    $delivered = send_mail((string)$member['email'], 'Your sign-in to Next Generation Genius', $html);
    audit($delivered ? 'login.request' : 'login.mail_fail', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'masked' => $masked, 'delivery' => $delivered];
}

/**
 * Standard email/ID + password sign-in. Passwords are opt-in — a member who
 * hasn't set one gets `no_password`, nudging them to the magic-link/OTP flow.
 * Session issuance + CSRF happen at the route (like auth.verify).
 */
function auth_login(array $p): array {
    $identifier = auth_clean_identifier((string)($p['identifier'] ?? ''));
    $password = (string)($p['password'] ?? '');
    $ip = (string)($p['ip'] ?? '');
    if ($identifier === '' || $password === '') return ['ok' => false, 'error' => 'missing_credentials'];

    $member = db_row('SELECT * FROM members WHERE lower(trim(memberId)) = ? OR lower(trim(email)) = ? LIMIT 1', [$identifier, $identifier]);
    // Uniform failure so we never reveal which accounts exist or have passwords.
    if (!$member || empty($member['passwordHash'])) {
        // Spend a hash cycle to keep timing roughly constant.
        password_verify($password, '$2y$10$usesomesillystringforsaltusesomesillystringu');
        audit('login.pw.fail', $member['memberId'] ?? null, $identifier, ['reason' => $member ? 'no_password' : 'unknown'], $ip);
        return ['ok' => false, 'error' => $member ? 'no_password' : 'invalid_login'];
    }
    if ((string)$member['status'] === 'suspended') {
        audit('login.pw.suspended', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => false, 'error' => 'suspended'];
    }
    if (auth_locked($member)) {
        audit('login.pw.locked', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => false, 'error' => 'account_locked'];
    }
    if (!password_verify($password, (string)$member['passwordHash'])) {
        auth_fail_bump($member, $ip);
        audit('login.pw.fail', $member['memberId'], (string)$member['memberId'], ['reason' => 'bad_password'], $ip);
        return ['ok' => false, 'error' => 'invalid_login'];
    }
    // Rehash-on-login if the cost/algorithm has moved on (standard hygiene).
    if (password_needs_rehash((string)$member['passwordHash'], password_algo_best())) {
        db_update('members', ['passwordHash' => password_hash_best($password), 'updatedAt' => now_iso()], ['id' => $member['id']]);
    }
    auth_fail_reset($member);
    audit('login.pw.success', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'member' => public_member($member),
        // The second sign-in step still owed, if any (mfa.php); the route marks the session with it.
        'mfa' => function_exists('mfa_need') ? mfa_need((string)$member['memberId'], 'member', []) : ''];
}

/**
 * Set or change the signed-in member's password. If one already exists, the
 * current password must be supplied (standard change-password guard). Callable
 * only from an authenticated session (memberId injected by the route).
 */
function auth_set_password(array $p): array {
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];
    $new = (string)($p['password'] ?? '');
    if (strlen($new) < 8) return ['ok' => false, 'error' => 'password_too_short'];
    if (strlen($new) > 200) return ['ok' => false, 'error' => 'password_too_long'];
    if (!empty($member['passwordHash'])) {
        /* The current password is a guess somebody holding the session can make — a
         * cookie lifted from a shared family laptop, a phone left signed in at a centre —
         * and before this the guesses were unlimited, so the session alone was enough to
         * find the password and then change it. Five wrong answers lock it for fifteen
         * minutes, on the same per-subject guard the sign-in codes use. */
        $mid = (string)$member['memberId'];
        if (attempt_locked('pw.current', $mid)) return ['ok' => false, 'error' => 'too_many_attempts'];
        $current = (string)($p['current'] ?? '');
        if (!password_verify($current, (string)$member['passwordHash'])) {
            if (attempt_fail('pw.current', $mid, 5, 900)) {
                audit('member.password.locked', $mid, $mid, [], (string)($p['ip'] ?? ''));
                return ['ok' => false, 'error' => 'too_many_attempts'];
            }
            return ['ok' => false, 'error' => 'bad_current_password'];
        }
        attempt_reset('pw.current', $mid);
    }
    db_update('members', ['passwordHash' => password_hash_best($new), 'updatedAt' => now_iso()], ['id' => $member['id']]);
    audit('member.password.set', $member['memberId'], (string)$member['memberId'], ['changed' => !empty($member['passwordHash'])], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** The emailed code is checked against a Member ID, and people sign in with
 *  their email as often as their ID. An email resolves to its member here; one
 *  with no account stays as typed, matches no challenge and reads "invalid",
 *  exactly like a wrong code — nothing says whether the email has an account. */
function auth_resolve_member_id(string $idOrEmail): string {
    $v = trim($idOrEmail);
    if ($v === '') return $v;
    $lv = strtolower($v);
    if (strpos($v, '@') === false) {
        /* The code was keyed by the record's own id; the person may have typed
         * it in lower case, or typed their card's number instead. */
        $m = db_row("SELECT memberId FROM members WHERE lower(memberId) = ? OR (displayId <> '' AND lower(displayId) = ?) ORDER BY id LIMIT 1", [$lv, $lv]);
        if ($m) return (string)$m['memberId'];
        $st = auth_find_volunteer($v);
        return $st && $st['id'] !== '' ? (string)$st['id'] : $v;
    }
    $m = db_row('SELECT memberId FROM members WHERE lower(trim(email)) = ? ORDER BY id LIMIT 1', [$lv]);
    if ($m) return (string)$m['memberId'];
    $st = auth_find_volunteer($v);
    return $st && $st['id'] !== '' ? (string)$st['id'] : $v;
}

function auth_verify(array $p): array {
    $ip = (string)($p['ip'] ?? '');
    $token = trim((string)($p['token'] ?? ''));
    $memberId = auth_resolve_member_id((string)($p['memberId'] ?? ''));
    $otp = trim((string)($p['otp'] ?? ''));

    if ($token !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE token = ? AND (purpose = 'login' OR purpose IS NULL) LIMIT 1", [$token]);
    } elseif ($memberId !== '' && $otp !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE memberId = ? AND otp = ? AND (purpose = 'login' OR purpose IS NULL) AND (verifiedAt = '' OR verifiedAt IS NULL) ORDER BY id DESC LIMIT 1", [$memberId, $otp]);
    } else {
        return ['ok' => false, 'error' => 'no_credentials'];
    }

    if (!$ch) {
        // Account-level guard for OTP guessing (the per-challenge attempts cap
        // can be sidestepped by re-requesting codes; this can't).
        if ($memberId !== '') {
            $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
            if ($m) {
                if (auth_locked($m)) return ['ok' => false, 'error' => 'account_locked'];
                auth_fail_bump($m, $ip);
            } elseif (attempt_fail('auth.staff', $memberId, 8, 1800)) {
                // A volunteer has no lock columns; the same cap lives in the attempt store.
                return ['ok' => false, 'error' => 'account_locked'];
            }
        }
        audit('login.fail.bad_token', $memberId ?: null, '', ['ip' => $ip], $ip);
        return ['ok' => false, 'error' => 'invalid'];
    }
    if ($memberId !== '') {
        $mGuard = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
        if ($mGuard && auth_locked($mGuard)) return ['ok' => false, 'error' => 'account_locked'];
        if (!$mGuard && attempt_locked('auth.staff', $memberId)) return ['ok' => false, 'error' => 'account_locked'];
    }
    if (strtotime((string)$ch['expiresAt']) < time()) { audit('login.fail.expired', $ch['memberId'], '', [], $ip); return ['ok' => false, 'error' => 'expired']; }
    if (!empty($ch['verifiedAt'])) { audit('login.fail.replay', $ch['memberId'], '', [], $ip); return ['ok' => false, 'error' => 'already_used']; }
    if ((int)$ch['attempts'] >= 5) return ['ok' => false, 'error' => 'too_many_attempts'];

    if (db_exec("UPDATE auth_sessions SET verifiedAt = ? WHERE id = ? AND (verifiedAt = '' OR verifiedAt IS NULL)", [now_iso(), (int)$ch['id']]) !== 1) {
        return ['ok' => false, 'error' => 'already_used'];
    }

    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$ch['memberId']]);
    if (!$member) {
        // A staff code: a volunteer, or a mentor about to be given a volunteer record.
        $v = auth_staff_principal((string)$ch['memberId']);
        if (!$v) return ['ok' => false, 'error' => 'member_gone'];
        if (function_exists('policy_gate_checkin')) {
            $gate = policy_gate_checkin((string)$v['volunteerId'], 'volunteer');
            if (empty($gate['ok'])) return ['ok' => false, 'error' => (string)$gate['error'], 'message' => (string)($gate['message'] ?? '')];
        }
        attempt_reset('auth.staff', (string)$ch['memberId']);
        audit('login.success', (string)$v['volunteerId'], (string)$v['volunteerId'], ['kind' => 'volunteer', 'via' => 'code'], $ip);
        return ['ok' => true, 'volunteer' => $v,
                'mfa' => function_exists('mfa_need') ? mfa_need((string)$v['volunteerId'], 'volunteer', ['email']) : ''];
    }
    // Admins must complete sign-in with their password, never an emailed code or
    // magic link — enforced here too so a stale/crafted challenge can't bypass it.
    if (auth_password_only($member)) {
        audit('login.otp.blocked_admin', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => false, 'error' => 'use_password'];
    }

    auth_fail_reset($member);
    audit('login.success', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'member' => public_member($member),
        // The second sign-in step still owed, if any (mfa.php); the route marks the session with it.
        'mfa' => function_exists('mfa_need') ? mfa_need((string)$member['memberId'], 'member', ['email']) : ''];
}

/**
 * Self-service password reset — step 1. Emails a link + 6-digit code so a
 * member can set a password WITHOUT already being signed in (the only other
 * way a password gets set is auth_set_password, which needs a session). This
 * is what makes password sign-in reachable for accounts that never had one.
 * Unknown/suspended accounts answer identically so existence never leaks.
 */
function auth_reset_request(array $p): array {
    $identifier = auth_clean_identifier((string)($p['identifier'] ?? ''));
    $ip = (string)($p['ip'] ?? '');
    if ($identifier === '') return ['ok' => false, 'error' => 'no_identifier'];

    $found = auth_find_member($identifier, $ip, 'reset', (string)($p['device'] ?? ''));
    if (empty($found['ok'])) return $found;
    $member = $found['member'];
    $masked = auth_masked_for($identifier);
    if (!$member) {
        if (!empty($found['honest'])) return ['ok' => false, 'error' => 'no_account'];
        auth_notify_no_account($identifier, $ip, 'reset');
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    if ((string)$member['status'] === 'suspended') {
        audit('password.reset.request.noop', $member['memberId'] ?? null, $identifier, [], $ip);
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    if (auth_codes_last_hour((string)$member['memberId'], 'reset') >= AUTH_CODES_PER_HOUR) {
        audit('password.reset.capped', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }

    $token = rand_hex(32);
    $otp = new_otp();
    $now = time();
    db_insert('auth_sessions', [
        'token' => $token, 'memberId' => $member['memberId'], 'email' => $member['email'],
        'otp' => $otp, 'attempts' => 0, 'purpose' => 'reset',
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $now + 30 * 60),
        'verifiedAt' => '', 'ip' => $ip, 'userAgent' => (string)($p['userAgent'] ?? ''),
    ]);

    global $CONFIG;
    $link = ($CONFIG['app_origin'] ?? '') . '/?reset=' . rawurlencode($token);
    $first = explode(' ', (string)$member['fullName'])[0] ?? '';
    $html = email_template([
        'eyebrow'  => 'Password reset',
        'title'    => 'Set your NGG password',
        'intro'    => 'Hi ' . ($first ?: 'there') . ', tap the button to set a new password — or use the code below. Both are good for 30 minutes.',
        'ctaLabel' => 'Set a password',
        'ctaUrl'   => $link,
        'otp'      => $otp,
        'footNote' => 'Didn\'t request this? Ignore this email — your password stays unchanged.',
    ]);
    $delivered = send_mail((string)$member['email'], 'Set your Next Generation Genius password', $html);
    audit($delivered ? 'password.reset.request' : 'password.reset.mail_fail', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'masked' => $masked, 'delivery' => $delivered];
}

/**
 * A welcome link that lets a new member set their own password.
 *
 * Reuses the reset challenge exactly — same table, same purpose, same
 * single-use consumption in auth_reset_confirm() — so there is one credential
 * type to reason about rather than two. What differs is the expiry: a reset a
 * member asked for two minutes ago can live for thirty minutes, but a welcome
 * link is emailed to a guardian who may hand it over that evening, or at the
 * weekend. Seven days.
 *
 * Why this exists at all: the apply form collects one email address and it is
 * the guardian's, so a converted member signs in with a code sent to their
 * parent's inbox, every single time. One password, set once, ends that.
 */
function auth_welcome_link(string $memberId, int $days = 7): string {
    $m = db_row('SELECT memberId, email FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m) return '';
    $token = rand_hex(32);
    $now = time();
    db_insert('auth_sessions', [
        'token' => $token, 'memberId' => (string)$m['memberId'], 'email' => (string)$m['email'],
        // Token only: a seven-day six-digit code that is never sent anywhere is
        // just a week-long target for guessing.
        'otp' => '', 'attempts' => 0, 'purpose' => 'reset',
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $now + max(1, $days) * 86400),
        'verifiedAt' => '', 'ip' => '', 'userAgent' => 'welcome',
    ]);
    return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/?reset=' . rawurlencode($token);
}

/**
 * Is a signed member session still what the database says? The cookie is
 * signed when it is issued and then carries its role and status for a week;
 * a suspension, a demotion or a deleted account has to end it at the next
 * request, not when it expires. Returns '' when it holds, else the refusal.
 * Kiosk and card sessions carry no member row and are not checked here.
 */
function session_still_valid(array $s): string {
    if (!empty($s['kiosk']) || !empty($s['stu']) || empty($s['sid'])) return '';
    $m = db_row('SELECT role, status FROM members WHERE memberId = ? LIMIT 1', [(string)($s['mid'] ?? '')]);
    if (!$m) return 'session_expired';
    if ((string)$m['status'] === 'suspended') return 'suspended';
    if (strtolower((string)$m['role']) !== strtolower((string)($s['role'] ?? ''))) return 'session_expired';
    return '';
}

/** A card holder (a participant or a volunteer signed in with their ID card) is not a member account. */
function session_is_cardholder(array $s): bool {
    return !empty($s['stu']) || !empty($s['kiosk']) || in_array(strtolower((string)($s['role'] ?? '')), ['student', 'volunteer', 'kiosk'], true);
}

/** End every live device session a member holds (a password reset, say). Returns how many. */
function auth_revoke_sessions(string $memberId, string $why = ''): int {
    if ($memberId === '') return 0;
    $n = db_exec("UPDATE device_sessions SET revokedAt = ? WHERE memberId = ? AND (revokedAt IS NULL OR revokedAt = '')", [now_iso(), $memberId]);
    if ($n > 0) audit('member.sessions.revoked', $memberId, $memberId, ['count' => $n, 'why' => $why], '');
    return $n;
}

/**
 * Self-service password reset — step 2. Consumes a reset challenge (magic-link
 * token, or memberId + emailed code) and sets the new password. Single-use,
 * expiry- and attempt-guarded, and scoped to purpose='reset' so a reset
 * credential can never be replayed as a plain login. Returns the member so the
 * route can sign them straight in (mirrors auth.verify / auth.login).
 */
function auth_reset_confirm(array $p): array {
    $ip = (string)($p['ip'] ?? '');
    $token = trim((string)($p['token'] ?? ''));
    $memberId = auth_resolve_member_id((string)($p['memberId'] ?? ''));
    $otp = trim((string)($p['otp'] ?? ''));
    $new = (string)($p['password'] ?? '');
    if (strlen($new) < 8) return ['ok' => false, 'error' => 'password_too_short'];
    if (strlen($new) > 200) return ['ok' => false, 'error' => 'password_too_long'];

    if ($token !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE token = ? AND purpose = 'reset' LIMIT 1", [$token]);
    } elseif ($memberId !== '' && $otp !== '') {
        // A six-digit code is guessable, and a match against ANY live code (as
        // this once was) let a guesser spread tries across every challenge and
        // every IP. So: only the newest emailed code counts, each wrong guess
        // spends one of its five attempts, and the account itself locks after
        // five misses whatever the challenge or address.
        if (attempt_locked('reset.otp', $memberId)) return ['ok' => false, 'error' => 'too_many_attempts'];
        $ch = db_row("SELECT * FROM auth_sessions WHERE memberId = ? AND purpose = 'reset' AND otp <> '' AND (verifiedAt = '' OR verifiedAt IS NULL) ORDER BY id DESC LIMIT 1", [$memberId]);
        if ($ch && (int)$ch['attempts'] < 5 && !hash_equals((string)$ch['otp'], $otp)) {
            db_exec('UPDATE auth_sessions SET attempts = attempts + 1 WHERE id = ?', [(int)$ch['id']]);
            $ch = null;
        }
        if (!$ch) attempt_fail('reset.otp', $memberId, 5, 1800);
    } else {
        return ['ok' => false, 'error' => 'no_credentials'];
    }

    if (!$ch) { audit('password.reset.fail.bad_token', $memberId ?: null, '', [], $ip); return ['ok' => false, 'error' => 'invalid']; }
    if (strtotime((string)$ch['expiresAt']) < time()) return ['ok' => false, 'error' => 'expired'];
    if (!empty($ch['verifiedAt'])) return ['ok' => false, 'error' => 'already_used'];
    if ((int)$ch['attempts'] >= 5) return ['ok' => false, 'error' => 'too_many_attempts'];

    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$ch['memberId']]);
    if (!$member) return ['ok' => false, 'error' => 'member_gone'];
    if ((string)$member['status'] === 'suspended') return ['ok' => false, 'error' => 'account_suspended'];

    // Consume it conditionally: two requests racing on one challenge must not both win.
    if (db_exec("UPDATE auth_sessions SET verifiedAt = ? WHERE id = ? AND (verifiedAt = '' OR verifiedAt IS NULL)", [now_iso(), (int)$ch['id']]) !== 1) {
        return ['ok' => false, 'error' => 'already_used'];
    }
    db_update('members', ['passwordHash' => password_hash_best($new), 'updatedAt' => now_iso()], ['id' => $member['id']]);
    auth_fail_reset($member);
    attempt_reset('reset.otp', (string)$member['memberId']);
    // A new password ends every session signed in with the old one.
    if (function_exists('auth_revoke_sessions')) auth_revoke_sessions((string)$member['memberId'], 'password_reset');
    audit('password.reset.success', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'member' => public_member($member),
        // The second sign-in step still owed, if any (mfa.php); the route marks the session with it.
        'mfa' => function_exists('mfa_need') ? mfa_need((string)$member['memberId'], 'member', ['email']) : ''];
}

/**
 * Security overview for the signed-in member: password state, last login and
 * the live device list (feeds "Me → Security" and the W10 first-run screen).
 */
function member_security(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    $m = db_row('SELECT memberId, type, role, passwordHash, lastLoginAt FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $cur = (string)($p['sid'] ?? '');
    $rows = db_all("SELECT sid, ip, userAgent, createdAt, lastSeenAt FROM device_sessions WHERE memberId = ? AND (revokedAt IS NULL OR revokedAt = '') ORDER BY id DESC LIMIT 20", [$mid]);
    $sessions = array_map(fn($r) => [
        'sid' => (string)$r['sid'],
        'ip' => (string)($r['ip'] ?? ''),
        'device' => substr((string)($r['userAgent'] ?? ''), 0, 140),
        'createdAt' => (string)($r['createdAt'] ?? ''),
        'lastSeenAt' => (string)($r['lastSeenAt'] ?? ''),
        'current' => $cur !== '' && $r['sid'] === $cur,
    ], $rows);
    return ['ok' => true,
        'hasPassword' => !empty($m['passwordHash']),
        'lastLoginAt' => (string)($m['lastLoginAt'] ?? ''),
        'strictMonitoring' => strtoupper((string)$m['type']) === 'NGG' || is_admin_role((string)$m['role']),
        'sessions' => $sessions];
}

/** Revoke one device session ({sid}) or every other one ({others:true}). */
function member_sessions_revoke(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    $cur = (string)($p['sid'] ?? '');
    if (!empty($p['others'])) {
        $rows = db_all("SELECT sid FROM device_sessions WHERE memberId = ? AND (revokedAt IS NULL OR revokedAt = '') AND sid != ?", [$mid, $cur]);
        foreach ($rows as $r) db_update('device_sessions', ['revokedAt' => now_iso()], ['sid' => $r['sid'], 'memberId' => $mid]);
        audit('security.sessions.revoke_others', $mid, $mid, ['count' => count($rows)], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'revoked' => count($rows)];
    }
    $target = (string)($p['targetSid'] ?? '');
    if ($target === '') return ['ok' => false, 'error' => 'no_sid'];
    $n = db_update('device_sessions', ['revokedAt' => now_iso()], ['sid' => $target, 'memberId' => $mid]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('security.sessions.revoke', $mid, $target, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'revoked' => 1];
}

function auth_me(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    /* A card session names its own table. A participant's id and a Summer
     * account's id were minted in overlapping spaces, so looking in `members`
     * first once handed a card holder somebody else's account. */
    $kind = (string)($p['kind'] ?? '');
    $member = in_array($kind, ['student', 'volunteer'], true) ? null : db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if ($member) {
        $pm = public_member($member);
        /* Which Mentor Portal view, if any. /mentor had no link anywhere in the
         * site — you had to be told the URL and type it. A tool nobody can find
         * is a tool nobody uses, and this is the one surface that records
         * behaviour data every session. This used to answer a bare "are they in
         * the mentors table", which hid the portal from the admins and
         * instructors who also belong there. */
        $pm['portal'] = mentor_portal_role((string)$member['memberId']);
        // Which Mentor Portal they get: pod | peer | instructor | lead | coord.
        $pm['mentorRole'] = $pm['portal'] !== '' && function_exists('mp_role_for') ? mp_role_for((string)$member['memberId']) : '';
        return ['ok' => true, 'member' => $pm];
    }
    // Summer-student session (signed in with an ID card) — a minimal member
    // shape with no caps, so the app unlocks the Community but nothing else.
    if ($kind === 'member') return ['ok' => false, 'error' => 'not_found'];
    $stu = $kind === 'volunteer' ? null : db_row("SELECT studentId, fullName, centre, photoUrl, track FROM summer_students WHERE studentId = ? AND status = 'active' LIMIT 1", [$mid]);
    if ($stu) return ['ok' => true, 'member' => [
        'memberId' => (string)$stu['studentId'], 'fullName' => (string)$stu['fullName'], 'type' => 'SUMMER', 'role' => 'student',
        'caps' => [], 'centre' => (string)($stu['centre'] ?? ''), 'track' => (string)($stu['track'] ?? ''), 'photoUrl' => (string)($stu['photoUrl'] ?? ''),
    ]];
    // Volunteer-card session (instructors, mentors, coordinators). Without this
    // an instructor was signed in but every page reload resolved to not_found
    // and dropped them straight back out to the sign-in door.
    $vol = $kind === 'student' ? null : db_row("SELECT volunteerId, fullName, role, centre, photoUrl FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$mid]);
    if ($vol) return ['ok' => true, 'member' => [
        'memberId' => (string)$vol['volunteerId'], 'fullName' => (string)$vol['fullName'], 'type' => 'VOLUNTEER', 'role' => 'volunteer',
        'caps' => [], 'centre' => (string)($vol['centre'] ?? ''), 'track' => (string)($vol['role'] ?? ''), 'photoUrl' => (string)($vol['photoUrl'] ?? ''),
        // An instructor holds a card, not an account — this is the only place
        // the app learns they have a portal to open.
        'portal' => mentor_portal_role((string)$vol['volunteerId']),
    ]];
    return ['ok' => false, 'error' => 'not_found'];
}

function auth_logout(array $p): array {
    // Revoke this device's server-side session so the sid can't be reused.
    $sid = (string)($p['sid'] ?? '');
    if ($sid !== '') { try { db_update('device_sessions', ['revokedAt' => now_iso()], ['sid' => $sid]); } catch (Throwable $e) {} }
    audit('logout', (string)($p['memberId'] ?? '') ?: null, (string)($p['memberId'] ?? ''), [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Lock: retire this device's cleared session; the route issues one without 2FA clearance. */
function auth_admin_lock(array $p): array {
    $sid = (string)($p['sid'] ?? '');
    if ($sid !== '') { try { db_update('device_sessions', ['revokedAt' => now_iso()], ['sid' => $sid]); } catch (Throwable $e) {} }
    audit('admin.lock', (string)($p['memberId'] ?? '') ?: null, (string)($p['memberId'] ?? ''), [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function auth_totp_setup(array $p): array {
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];
    if (!is_admin_role($member['role'])) return ['ok' => false, 'error' => 'forbidden'];

    /* ENROLMENT IS ONCE. Re-enrolment is a recovery, and recovery is not
     * self-service.
     *
     * This wrote a fresh secret over whatever was already there, and the
     * endpoint in front of it (auth/admin-totp-setup.php) runs on a session
     * that has NOT yet passed 2FA — because a first-time enrolling admin has no
     * second factor to pass. Those two facts together made the second factor
     * optional: sign in with the password alone, call setup, receive a secret
     * you chose the moment of, then satisfy the 2FA gate with it. The real
     * admin's authenticator stopped working at the same time, which is the only
     * reason anyone would have noticed.
     *
     * The rest of the system already assumed this could not happen. `needsTotp`
     * (util.php) is `is_admin_role && empty(totpSecret)`, and the admin client
     * only offers the setup panel when that is true — so a signed-in admin was
     * never MEANT to be able to reach this twice.
     *
     * A lost authenticator has its own door: admin_member_reset_2fa(), which is
     * super-admin-only, clears the secret, and lets the next sign-in enrol
     * afresh. That door has a human on the other side of it. This one does not,
     * so it only opens when there is nothing behind it.
     */
    if (!empty($member['totpSecret'])) {
        audit('admin.totp.setup_refused', (string)$member['memberId'], (string)$member['memberId'],
              ['reason' => 'already_enrolled'], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'already_enrolled'];
    }

    $secret = rand_base32(20);
    // Mint 8 one-time backup codes (shown once, stored hashed) so a lost
    // authenticator is recoverable without an admin.
    $codes = []; $hashes = [];
    for ($i = 0; $i < 8; $i++) {
        $c = strtoupper(rand_hex(2) . '-' . rand_hex(2)); // e.g. 3F9A-1C7B
        $codes[] = $c; $hashes[] = password_hash(strtoupper(str_replace('-', '', $c)), PASSWORD_DEFAULT);
    }
    db_update('members', ['totpSecret' => $secret, 'totpBackup' => json_encode($hashes, JSON_UNESCAPED_SLASHES), 'updatedAt' => now_iso()], ['id' => $member['id']]);
    audit('admin.totp.setup', $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
    $otpauth = 'otpauth://totp/NGG%20Admin:' . rawurlencode((string)$member['email'])
        . '?secret=' . $secret . '&issuer=NGG%20Admin&algorithm=SHA1&digits=6&period=30';
    return ['ok' => true, 'secret' => $secret, 'otpauth' => $otpauth, 'backupCodes' => $codes];
}

function auth_totp_verify(array $p): array {
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member || empty($member['totpSecret'])) return ['ok' => false, 'error' => 'no_totp'];
    if (!is_admin_role($member['role'])) return ['ok' => false, 'error' => 'forbidden'];

    /* Six digits, and a ±1 window, is a small enough space that the only thing
     * standing between it and a script is a ceiling on attempts. There was no
     * ceiling here — only the IP rate limit in front of the endpoint, which a
     * forwarded header could shed. Counted against the ADMIN, so rotating
     * addresses does not buy another eight guesses. */
    $mid = (string)$member['memberId'];
    if (attempt_locked('totp', $mid)) {
        audit('admin.totp.locked', $mid, $mid, [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'too_many_attempts'];
    }

    $code = (string)($p['code'] ?? '');
    if (totp_verify((string)$member['totpSecret'], $code, 1)) {
        attempt_reset('totp', $mid);
        audit('admin.totp.ok', $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
        return ['ok' => true];
    }
    // Fall back to a one-time backup code (case/format-insensitive), consumed on use.
    $norm = strtoupper(preg_replace('/[^0-9a-z]/i', '', $code));
    if (strlen($norm) >= 6) {
        $hashes = json_decode((string)($member['totpBackup'] ?? ''), true) ?: [];
        foreach ($hashes as $i => $h) {
            if (is_string($h) && password_verify($norm, $h)) {
                unset($hashes[$i]);
                db_update('members', ['totpBackup' => json_encode(array_values($hashes), JSON_UNESCAPED_SLASHES), 'updatedAt' => now_iso()], ['id' => $member['id']]);
                attempt_reset('totp', $mid);
                audit('admin.totp.backup_used', $member['memberId'], (string)$member['memberId'], ['remaining' => count($hashes)], (string)($p['ip'] ?? ''));
                return ['ok' => true, 'backupUsed' => true, 'backupRemaining' => count($hashes)];
            }
        }
    }
    // Eight wrong codes buys a fifteen-minute pause — the same shape as the
    // password lockout, so the two factors are guarded to the same standard.
    $locked = attempt_fail('totp', $mid, AUTH_LOCK_AFTER, AUTH_LOCK_MINUTES * 60);
    audit($locked ? 'admin.totp.lockout' : 'admin.totp.fail',
          $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => false, 'error' => $locked ? 'too_many_attempts' : 'invalid_code'];
}

/** Super-admin recovery: clear a member's TOTP + backup codes so they re-enrol
 *  at next admin sign-in (the fix for a lost authenticator). */
function admin_member_reset_2fa(array $p): array {
    $g = admin_cap_gate($p, 'rbac'); if (!$g['ok']) return $g;
    $target = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT id, role FROM members WHERE memberId = ? LIMIT 1', [$target]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    // Account recovery reaches no further than the operator's own level.
    if (!admin_may_manage($g['requester'], (string)($m['role'] ?? 'member'))) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'above_your_level'];
    db_update('members', ['totpSecret' => '', 'totpBackup' => '', 'updatedAt' => now_iso()], ['id' => $m['id']]);
    audit('admin.totp.reset', (string)($p['requesterId'] ?? ''), $target, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Super-admin recovery: clear a member's password so they sign in via the
 *  emailed code/magic-link and can set a fresh password. */
function admin_member_reset_password(array $p): array {
    $g = admin_cap_gate($p, 'rbac'); if (!$g['ok']) return $g;
    $target = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT id, role FROM members WHERE memberId = ? LIMIT 1', [$target]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    // Account recovery reaches no further than the operator's own level.
    if (!admin_may_manage($g['requester'], (string)($m['role'] ?? 'member'))) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'above_your_level'];
    db_update('members', ['passwordHash' => '', 'updatedAt' => now_iso()], ['id' => $m['id']]);
    audit('admin.password.reset', (string)($p['requesterId'] ?? ''), $target, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
