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
    $member = db_row('SELECT passwordHash, status FROM members WHERE lower(memberId) = ? OR lower(email) = ? LIMIT 1', [$identifier, $identifier]);
    $methods = ['code'];
    if ($member && !empty($member['passwordHash']) && (string)$member['status'] !== 'suspended') {
        $methods[] = 'password';
    }
    return ['ok' => true, 'methods' => $methods];
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
        return ['ok' => true, 'masked' => $masked];
    }
    if ((string)$member['status'] === 'suspended') {
        audit('login.fail.suspended', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => true, 'masked' => $masked];
    }

    $token = rand_hex(32);
    $otp = new_otp();
    $now = time();
    db_insert('auth_sessions', [
        'token' => $token, 'memberId' => $member['memberId'], 'email' => $member['email'],
        'otp' => $otp, 'attempts' => 0,
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $now + 15 * 60),
        'verifiedAt' => '', 'ip' => $ip, 'userAgent' => (string)($p['userAgent'] ?? ''),
    ]);

    global $CONFIG;
    $link = ($CONFIG['app_origin'] ?? '') . '/?signin=' . rawurlencode($token);
    $first = explode(' ', (string)$member['fullName'])[0] ?? '';
    $html = email_template([
        'title' => 'Sign in to NGG',
        'intro' => 'Hi ' . ($first ?: 'there') . ', here is your secure sign-in.',
        'bodyHtml' => '<p style="margin:0 0 10px">Enter this code in the app:</p>'
            . '<div style="font-family:monospace;font-size:32px;font-weight:800;letter-spacing:6px;color:#0c1432;margin:0 0 8px">' . esc_html($otp) . '</div>'
            . '<p style="margin:12px 0 0;color:#8a93b8;font-size:12px">This link and code expire in 15 minutes. If you didn\'t request this, ignore it.</p>',
        'ctaLabel' => 'Sign in →', 'ctaUrl' => $link,
    ]);
    if (!send_mail((string)$member['email'], 'Your sign-in to Next Generation Genius', $html)) {
        audit('login.mail_fail', $member['memberId'], (string)$member['memberId'], [], $ip);
        return ['ok' => false, 'error' => 'mail_failed'];
    }

    audit('login.request', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'masked' => $masked];
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
        $ch = db_row('SELECT * FROM auth_sessions WHERE token = ? LIMIT 1', [$token]);
    } elseif ($memberId !== '' && $otp !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE memberId = ? AND otp = ? AND (verifiedAt = '' OR verifiedAt IS NULL) ORDER BY id DESC LIMIT 1", [$memberId, $otp]);
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

    auth_fail_reset($member);
    audit('login.success', $member['memberId'], (string)$member['memberId'], [], $ip);
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
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'member' => public_member($member)];
}

function auth_logout(array $p): array {
    audit('logout', (string)($p['memberId'] ?? '') ?: null, (string)($p['memberId'] ?? ''), [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function auth_totp_setup(array $p): array {
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];
    if (!is_admin_role($member['role'])) return ['ok' => false, 'error' => 'forbidden'];

    $secret = rand_base32(20);
    db_update('members', ['totpSecret' => $secret, 'updatedAt' => now_iso()], ['id' => $member['id']]);
    audit('admin.totp.setup', $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
    $otpauth = 'otpauth://totp/NGG%20Admin:' . rawurlencode((string)$member['email'])
        . '?secret=' . $secret . '&issuer=NGG%20Admin&algorithm=SHA1&digits=6&period=30';
    return ['ok' => true, 'secret' => $secret, 'otpauth' => $otpauth];
}

function auth_totp_verify(array $p): array {
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$member || empty($member['totpSecret'])) return ['ok' => false, 'error' => 'no_totp'];
    if (!is_admin_role($member['role'])) return ['ok' => false, 'error' => 'forbidden'];

    if (totp_verify((string)$member['totpSecret'], (string)($p['code'] ?? ''), 1)) {
        audit('admin.totp.ok', $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
        return ['ok' => true];
    }
    audit('admin.totp.fail', $member['memberId'], (string)$member['memberId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => false, 'error' => 'invalid_code'];
}
