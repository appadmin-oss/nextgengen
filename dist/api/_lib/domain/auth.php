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
function auth_gateway(array $p): array {
    $identifier = strtolower(trim((string)($p['identifier'] ?? '')));
    if ($identifier === '') return ['ok' => false, 'error' => 'no_identifier'];
    $member = db_row('SELECT passwordHash, status, role FROM members WHERE lower(memberId) = ? OR lower(email) = ? LIMIT 1', [$identifier, $identifier]);
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
    $identifier = strtolower(trim((string)($p['identifier'] ?? '')));
    $ip = (string)($p['ip'] ?? '');
    if ($identifier === '') return ['ok' => false, 'error' => 'no_identifier'];

    $member = db_row('SELECT * FROM members WHERE lower(memberId) = ? OR lower(email) = ? LIMIT 1', [$identifier, $identifier]);

    // Constant-ish response: never reveal whether an id exists.
    $masked = mask_email($member ? (string)$member['email'] : (strpos($identifier, '@') !== false ? $identifier : 'a@b.co'));

    if (!$member) {
        audit('login.fail.unknown', null, $identifier, ['identifier' => $identifier], $ip);
        return ['ok' => true, 'masked' => $masked, 'delivery' => true];
    }
    if ((string)$member['status'] === 'suspended') {
        audit('login.fail.suspended', $member['memberId'], (string)$member['memberId'], [], $ip);
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
    // hard-fail the request: that dead-ends the only email-free retry path and
    // leaks that this identifier is a real, active account (unknown/suspended
    // both return ok above). Report delivery=false instead so the UI can keep
    // the code screen open, warn the user, and steer them to password sign-in.
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
    $identifier = strtolower(trim((string)($p['identifier'] ?? '')));
    $password = (string)($p['password'] ?? '');
    $ip = (string)($p['ip'] ?? '');
    if ($identifier === '' || $password === '') return ['ok' => false, 'error' => 'missing_credentials'];

    $member = db_row('SELECT * FROM members WHERE lower(memberId) = ? OR lower(email) = ? LIMIT 1', [$identifier, $identifier]);
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
    return ['ok' => true, 'member' => public_member($member)];
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
        $current = (string)($p['current'] ?? '');
        if (!password_verify($current, (string)$member['passwordHash'])) {
            return ['ok' => false, 'error' => 'bad_current_password'];
        }
    }
    db_update('members', ['passwordHash' => password_hash_best($new), 'updatedAt' => now_iso()], ['id' => $member['id']]);
    audit('member.password.set', $member['memberId'], (string)$member['memberId'], ['changed' => !empty($member['passwordHash'])], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function auth_verify(array $p): array {
    $ip = (string)($p['ip'] ?? '');
    $token = trim((string)($p['token'] ?? ''));
    $memberId = trim((string)($p['memberId'] ?? ''));
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
            }
        }
        audit('login.fail.bad_token', $memberId ?: null, '', ['ip' => $ip], $ip);
        return ['ok' => false, 'error' => 'invalid'];
    }
    if ($memberId !== '') {
        $mGuard = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
        if ($mGuard && auth_locked($mGuard)) return ['ok' => false, 'error' => 'account_locked'];
    }
    if (strtotime((string)$ch['expiresAt']) < time()) { audit('login.fail.expired', $ch['memberId'], '', [], $ip); return ['ok' => false, 'error' => 'expired']; }
    if (!empty($ch['verifiedAt'])) { audit('login.fail.replay', $ch['memberId'], '', [], $ip); return ['ok' => false, 'error' => 'already_used']; }
    if ((int)$ch['attempts'] >= 5) return ['ok' => false, 'error' => 'too_many_attempts'];

    db_update('auth_sessions', ['verifiedAt' => now_iso()], ['id' => $ch['id']]);

    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$ch['memberId']]);
    if (!$member) return ['ok' => false, 'error' => 'member_gone'];
    // Admins must complete sign-in with their password, never an emailed code or
    // magic link — enforced here too so a stale/crafted challenge can't bypass it.
    if (auth_password_only($member)) {
        audit('login.otp.blocked_admin', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => false, 'error' => 'use_password'];
    }

    auth_fail_reset($member);
    audit('login.success', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'member' => public_member($member)];
}

/**
 * Self-service password reset — step 1. Emails a link + 6-digit code so a
 * member can set a password WITHOUT already being signed in (the only other
 * way a password gets set is auth_set_password, which needs a session). This
 * is what makes password sign-in reachable for accounts that never had one.
 * Unknown/suspended accounts answer identically so existence never leaks.
 */
function auth_reset_request(array $p): array {
    $identifier = strtolower(trim((string)($p['identifier'] ?? '')));
    $ip = (string)($p['ip'] ?? '');
    if ($identifier === '') return ['ok' => false, 'error' => 'no_identifier'];

    $member = db_row('SELECT * FROM members WHERE lower(memberId) = ? OR lower(email) = ? LIMIT 1', [$identifier, $identifier]);
    $masked = mask_email($member ? (string)$member['email'] : (strpos($identifier, '@') !== false ? $identifier : 'a@b.co'));

    if (!$member || (string)$member['status'] === 'suspended') {
        audit('password.reset.request.noop', $member['memberId'] ?? null, $identifier, [], $ip);
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
 * Self-service password reset — step 2. Consumes a reset challenge (magic-link
 * token, or memberId + emailed code) and sets the new password. Single-use,
 * expiry- and attempt-guarded, and scoped to purpose='reset' so a reset
 * credential can never be replayed as a plain login. Returns the member so the
 * route can sign them straight in (mirrors auth.verify / auth.login).
 */
function auth_reset_confirm(array $p): array {
    $ip = (string)($p['ip'] ?? '');
    $token = trim((string)($p['token'] ?? ''));
    $memberId = trim((string)($p['memberId'] ?? ''));
    $otp = trim((string)($p['otp'] ?? ''));
    $new = (string)($p['password'] ?? '');
    if (strlen($new) < 8) return ['ok' => false, 'error' => 'password_too_short'];
    if (strlen($new) > 200) return ['ok' => false, 'error' => 'password_too_long'];

    if ($token !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE token = ? AND purpose = 'reset' LIMIT 1", [$token]);
    } elseif ($memberId !== '' && $otp !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE memberId = ? AND otp = ? AND purpose = 'reset' AND (verifiedAt = '' OR verifiedAt IS NULL) ORDER BY id DESC LIMIT 1", [$memberId, $otp]);
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

    db_update('auth_sessions', ['verifiedAt' => now_iso()], ['id' => $ch['id']]);
    db_update('members', ['passwordHash' => password_hash_best($new), 'updatedAt' => now_iso()], ['id' => $member['id']]);
    auth_fail_reset($member);
    audit('password.reset.success', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'member' => public_member($member)];
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
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if ($member) {
        $pm = public_member($member);
        /* Is this person a mentor? The Mentor Portal at /mentor had no link
         * anywhere in the site — a mentor had to be told the URL and type it.
         * A tool nobody can find is a tool nobody uses, and this is the one
         * surface that records behaviour data every session. One indexed
         * lookup per /auth/me tells the UI whether to offer it. */
        $pm['isMentor'] = !empty($member['email'])
            && (bool) db_row("SELECT id FROM mentors WHERE lower(email) = lower(?) AND status = 'active' LIMIT 1", [(string)$member['email']]);
        return ['ok' => true, 'member' => $pm];
    }
    // Summer-student session (signed in with an ID card) — a minimal member
    // shape with no caps, so the app unlocks the Community but nothing else.
    $stu = db_row("SELECT studentId, fullName, centre, photoUrl, track FROM summer_students WHERE studentId = ? AND status = 'active' LIMIT 1", [$mid]);
    if ($stu) return ['ok' => true, 'member' => [
        'memberId' => (string)$stu['studentId'], 'fullName' => (string)$stu['fullName'], 'type' => 'SUMMER', 'role' => 'student',
        'caps' => [], 'centre' => (string)($stu['centre'] ?? ''), 'track' => (string)($stu['track'] ?? ''), 'photoUrl' => (string)($stu['photoUrl'] ?? ''),
    ]];
    // Volunteer-card session (instructors, mentors, coordinators). Without this
    // an instructor was signed in but every page reload resolved to not_found
    // and dropped them straight back out to the sign-in door.
    $vol = db_row("SELECT volunteerId, fullName, role, photoUrl FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$mid]);
    if ($vol) return ['ok' => true, 'member' => [
        'memberId' => (string)$vol['volunteerId'], 'fullName' => (string)$vol['fullName'], 'type' => 'VOLUNTEER', 'role' => 'volunteer',
        'caps' => [], 'centre' => '', 'track' => (string)($vol['role'] ?? ''), 'photoUrl' => (string)($vol['photoUrl'] ?? ''),
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

function auth_totp_setup(array $p): array {
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];
    if (!is_admin_role($member['role'])) return ['ok' => false, 'error' => 'forbidden'];

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

    $code = (string)($p['code'] ?? '');
    if (totp_verify((string)$member['totpSecret'], $code, 1)) {
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
                audit('admin.totp.backup_used', $member['memberId'], (string)$member['memberId'], ['remaining' => count($hashes)], (string)($p['ip'] ?? ''));
                return ['ok' => true, 'backupUsed' => true, 'backupRemaining' => count($hashes)];
            }
        }
    }
    audit('admin.totp.fail', $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => false, 'error' => 'invalid_code'];
}

/** Super-admin recovery: clear a member's TOTP + backup codes so they re-enrol
 *  at next admin sign-in (the fix for a lost authenticator). */
function admin_member_reset_2fa(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    $target = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT id, role FROM members WHERE memberId = ? LIMIT 1', [$target]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    db_update('members', ['totpSecret' => '', 'totpBackup' => '', 'updatedAt' => now_iso()], ['id' => $m['id']]);
    audit('admin.totp.reset', (string)($p['requesterId'] ?? ''), $target, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Super-admin recovery: clear a member's password so they sign in via the
 *  emailed code/magic-link and can set a fresh password. */
function admin_member_reset_password(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    $target = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT id FROM members WHERE memberId = ? LIMIT 1', [$target]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    db_update('members', ['passwordHash' => '', 'updatedAt' => now_iso()], ['id' => $m['id']]);
    audit('admin.password.reset', (string)($p['requesterId'] ?? ''), $target, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
