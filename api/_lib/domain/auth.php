<?php
declare(strict_types=1);

/**
 * Auth domain — magic link + OTP sign-in, plus TOTP 2FA for admins.
 * (Rate limiting is enforced at the route edge via rate_limit_check.)
 */

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

    if (!$ch) { audit('login.fail.bad_token', $memberId ?: null, '', ['ip' => $ip], $ip); return ['ok' => false, 'error' => 'invalid']; }
    if (strtotime((string)$ch['expiresAt']) < time()) { audit('login.fail.expired', $ch['memberId'], '', [], $ip); return ['ok' => false, 'error' => 'expired']; }
    if (!empty($ch['verifiedAt'])) { audit('login.fail.replay', $ch['memberId'], '', [], $ip); return ['ok' => false, 'error' => 'already_used']; }
    if ((int)$ch['attempts'] >= 5) return ['ok' => false, 'error' => 'too_many_attempts'];

    db_update('auth_sessions', ['verifiedAt' => now_iso()], ['id' => $ch['id']]);

    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$ch['memberId']]);
    if (!$member) return ['ok' => false, 'error' => 'member_gone'];

    audit('login.success', $member['memberId'], (string)$member['memberId'], [], $ip);
    return ['ok' => true, 'member' => public_member($member)];
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
