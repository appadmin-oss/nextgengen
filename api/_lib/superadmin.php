<?php
declare(strict_types=1);

/**
 * superadmin.php — NGG's default, always-present Super Admin.
 *
 * A fresh NGG deploy needs one staff account that can sign in and reach the
 * Control Room at the top tier. This provisions it idempotently the first time
 * anyone hits a sign-in route (login / request / verify) — no SSH, no SQL.
 *
 * It creates a `members` row with role='super_admin' (caps: content, people,
 * inbox, settings, rbac, summer, club — i.e. everything) and a usable password.
 * Sign-in is the standard flow: password (or magic-link/OTP), then the one-time
 * authenticator (TOTP) setup that every NGG admin does to unlock the console.
 *
 * This is SEPARATE from Afrovanguard's super admin — different site, different
 * database, its own credentials.
 *
 * Config (api/config.php → 'super_admin' block, all optional):
 *   'email'    default: mamcareer@afrovanguard.org.ng
 *   'name'     default: "Super Admin"
 *   'password' if set → used verbatim (recommended). If empty, a strong password
 *              is generated once and stashed in settings for a one-time reveal
 *              via `php api/tools/seed-admin.php`.
 */

const NGG_SUPERADMIN_MEMBER_ID = 'NGG-SUPER';
const NGG_SUPERADMIN_FP_KEY    = 'superadmin_seed_fp';
const NGG_SUPERADMIN_PW_KEY    = 'superadmin_initial_password';

function ngg_superadmin_config(): array {
    global $CONFIG;
    $c = (array)($CONFIG['super_admin'] ?? []);
    $email = strtolower(trim((string)($c['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $email = 'mamcareer@afrovanguard.org.ng';
    }
    $name = trim((string)($c['name'] ?? '')) ?: 'Super Admin';
    return ['email' => $email, 'name' => $name, 'password' => (string)($c['password'] ?? '')];
}

/**
 * Ensure the default Super Admin exists and is loginable. Idempotent + cheap
 * after the first apply (a single settings lookup). Never throws.
 *
 * @return array{created:bool,password:?string,email:string}
 */
function ensure_super_admin(): array {
    static $done = false;
    $cfg = ngg_superadmin_config();
    if ($done) return ['created' => false, 'password' => null, 'email' => $cfg['email']];

    try {
        $envPw = $cfg['password'];
        // Only re-apply when the target email or chosen password changes.
        $fp = hash('sha256', $cfg['email'] . '|' . ($envPw !== '' ? 'cfg:' . $envPw : 'auto'));
        if (setting_raw(NGG_SUPERADMIN_FP_KEY) === $fp) {
            $done = true;
            return ['created' => false, 'password' => null, 'email' => $cfg['email']];
        }

        $password = $envPw;
        $reveal = null;
        if ($password === '') { $password = ngg_superadmin_gen_password(); $reveal = $password; }
        $hash = password_hash($password, PASSWORD_DEFAULT);

        // Match an existing account by email first, else the stable memberId.
        $existing = db_row(
            'SELECT * FROM members WHERE lower(email) = ? OR memberId = ? LIMIT 1',
            [$cfg['email'], NGG_SUPERADMIN_MEMBER_ID]
        );

        $created = false;
        if ($existing) {
            db_update('members', [
                'role'         => 'super_admin',
                'status'       => 'active',
                'passwordHash' => $hash,
                'updatedAt'    => now_iso(),
            ], ['id' => $existing['id']]);
        } else {
            db_insert('members', [
                'memberId'     => NGG_SUPERADMIN_MEMBER_ID,
                'fullName'     => $cfg['name'],
                'email'        => $cfg['email'],
                'type'         => 'Staff',
                'status'       => 'active',
                'role'         => 'super_admin',
                'passwordHash' => $hash,
                'createdAt'    => now_iso(),
                'updatedAt'    => now_iso(),
            ]);
            $created = true;
        }

        ngg_setting_set(NGG_SUPERADMIN_PW_KEY, $reveal !== null ? $reveal : '');
        ngg_setting_set(NGG_SUPERADMIN_FP_KEY, $fp);
        $done = true;

        audit('superadmin.ensured', NGG_SUPERADMIN_MEMBER_ID, $cfg['email'], ['created' => $created], '');
        return ['created' => $created, 'password' => $reveal, 'email' => $cfg['email']];
    } catch (Throwable $e) {
        error_log('[superadmin] ensure: ' . $e->getMessage());
        $done = true;
        return ['created' => false, 'password' => null, 'email' => $cfg['email']];
    }
}

/** The one-time generated password, if one was minted and not yet cleared. */
function ngg_superadmin_pending_password(): string {
    try { return (string)(setting_raw(NGG_SUPERADMIN_PW_KEY) ?? ''); }
    catch (Throwable $e) { return ''; }
}

/** Forget the stashed generated password (after showing it once). */
function ngg_superadmin_forget_password(): void {
    try { ngg_setting_set(NGG_SUPERADMIN_PW_KEY, ''); } catch (Throwable $e) {}
}

/** Upsert a raw (non-JSON) settings value. Mirrors setting_raw()'s storage. */
function ngg_setting_set(string $key, string $value): void {
    db_upsert('settings',
        ['settingKey' => $key, 'settingValue' => $value, 'updatedAt' => now_iso()],
        ['settingKey'],
        ['settingValue' => $value, 'updatedAt' => now_iso()]
    );
}

/** A strong, human-typable password: mixed blocks, no ambiguous glyphs. */
function ngg_superadmin_gen_password(): string {
    $alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    $digit = '23456789';
    $sym   = '!@#$%&*?';
    $pick = static function (string $set, int $n): string {
        $out = ''; $max = strlen($set) - 1;
        for ($i = 0; $i < $n; $i++) $out .= $set[random_int(0, $max)];
        return $out;
    };
    return $pick($alpha, 4) . '-' . $pick($digit, 1) . $pick($alpha, 1) . $pick($digit, 1) . $pick($alpha, 1)
         . '-' . $pick($alpha, 4) . $sym[random_int(0, strlen($sym) - 1)];
}
