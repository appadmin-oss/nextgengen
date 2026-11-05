<?php
/**
 * Two-step sign-in for the portals, with a different second step for each kind
 * of person, because the people are different:
 *
 *   member    — a child or young person on an NGG (or Summer) account. Often no
 *               phone of their own and no authenticator app, so the second
 *               step is something they know: a private question.
 *   team      — instructors, volunteers and mentors. Adults holding a child's
 *               record, so a real second factor: an authenticator app, or a
 *               code emailed to the address on their record.
 *   guardian  — a parent or carer on the family portal. They already sign in
 *               with an emailed code, so asking for another email is no second
 *               step at all; theirs is a six-digit family PIN.
 *   staff     — Control Room roles. Already held to an authenticator app at the
 *               console door (auth_totp_*); reported here, never re-asked.
 *
 * A Summer participant signing in with their card is out of scope: the card
 * plus the guardian's phone already is the two things, and the account ends
 * with the season.
 *
 * Everything lives in member_state, keyed by the person's own id (memberId,
 * volunteerId or guardianId — disjoint spaces), so there is no migration. The
 * `mfa*` keys are refused by the public member.state.get/set (members.php):
 * a hashed answer is still not something a page should be able to read back.
 *
 * Admin powers (people), the two Google Workspace gives its admins for a
 * person who cannot pass their second step (Directory > Users > Security):
 *
 *   · LET IN FOR 10 MINUTES ("Login challenge > Turn off for 10 minutes"). The
 *     next sign-in inside the window skips the second step, and a step screen
 *     already open on their device opens by itself. Per person, one at a
 *     time, the length fixed (Google's is fixed too), audited, and the owner is
 *     told (email + push), because the account is weaker for those minutes.
 *     It lets in ONE sign-in: the window closes when it is used, so a second
 *     sign-in in the same minutes (someone else holding the first factor)
 *     still owes the step.
 *   · A ONE-TIME CODE ("Get backup verification codes"): 8 characters, shown
 *     once to the member of staff, stored as a hash, good for 10 minutes and
 *     spent by its first use, typed on the person's own step screen. For when
 *     the person is not at the desk (read out over the phone).
 *
 * Either way in opens a REPLACE window (MFA_LETIN_TTL): a lost step is
 * replaced without being asked for, and setting the new one closes it.
 * Until 5 Nov 2026 the window let EVERY sign-in through for ten minutes, a
 * step screen already open never noticed it, and a person who had lost the
 * step could still not replace it: changing it asked for the old one.
 *
 * Also: reset it so they set a new one, require it of one person, and send a
 * reminder. Policy per kind (settings): off | optional | required.
 */

const MFA_KINDS        = ['member', 'team', 'guardian'];
const MFA_POLICY_VALS  = ['off', 'optional', 'required'];
const MFA_POLICY_DEFAULT = ['member' => 'optional', 'team' => 'optional', 'guardian' => 'optional'];
/* What each kind of person MAY choose, first being the one suggested. An
 * admin can narrow any kind's list (setting mfa_methods, Members › Sign-in
 * security); never widen it past this. A child is offered the question first
 * because it needs no phone; the team the app, because it needs no inbox. */
const MFA_METHODS = [
    'member'   => ['question', 'pin', 'app', 'email', 'sms'],
    'team'     => ['app', 'email', 'pin', 'sms'],
    'guardian' => ['pin', 'app', 'question', 'sms'],
];
const MFA_METHOD_INFO = [
    'question' => ['label' => 'A private question', 'blurb' => 'Pick a question only you can answer. We ask it when you sign in.'],
    'pin'      => ['label' => 'A 6-digit PIN', 'blurb' => 'Six digits only you know, asked each time you sign in. Not a birthday or 123456.'],
    'app'      => ['label' => 'An authenticator app', 'blurb' => 'Google Authenticator, Microsoft Authenticator or similar shows a new 6-digit code every 30 seconds.'],
    'email'    => ['label' => 'A code by email', 'blurb' => 'We email a 6-digit code to the address on your record when you sign in. Not asked again if you signed in with an emailed code.'],
    'sms'      => ['label' => 'A code by text message', 'blurb' => 'We text a 6-digit code to your phone when you sign in — on Telegram instead, free, if you have connected it to NGG.'],
];
/* 'sms' is offered only while a text channel is configured (sms_enabled():
 * Telegram, the programme's phone, or a paid provider). An enrolment made
 * while it was on stays checkable: the code is sent, and if the channel has
 * since gone, the challenge says so and the backup codes are the way in. */
/* One-time backup codes, issued whenever a step is set up: the way in when the
 * phone is lost or the answer forgotten, without waiting for the desk. */
const MFA_BACKUP_N = 8;
const MFA_QUESTIONS = [
    'What was the name of your first teacher?',
    'What is the name of the street you grew up on?',
    'What was the name of your first pet or favourite toy?',
    'Which town was your mother or father born in?',
    'What is a word only you and your best friend use?',
];
const MFA_FAIL_MAX       = 5;
const MFA_FAIL_LOCK      = 900;
const MFA_LETIN_TTL      = 600;    // a desk code lives 10 minutes; so does the replace window it opens
const MFA_BULK_MAX       = 200;
const MFA_CODE_TTL       = 600;
const MFA_NUDGE_QUIET    = 3 * 86400;

/* ── Storage ─────────────────────────────────────────────────────────────── */

function mfa_get(string $id, string $key) {
    $v = db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [$id, $key])['stateValue'] ?? null;
    if ($v === null) return null;
    $j = json_decode((string)$v, true);
    return $j === null ? (string)$v : $j;
}
function mfa_put(string $id, string $key, $value): void {
    $json = json_encode($value, JSON_UNESCAPED_SLASHES);
    db_upsert('member_state', ['memberId' => $id, 'stateKey' => $key, 'stateValue' => $json, 'updatedAt' => now_iso()],
        ['memberId', 'stateKey'], ['stateValue' => $json, 'updatedAt' => now_iso()]);
}
function mfa_del(string $id, string $key): void {
    db_exec('DELETE FROM member_state WHERE memberId = ? AND stateKey = ?', [$id, $key]);
}
/** Keys the public state op must never read or write. */
function mfa_private_key(string $key): bool {
    return strncasecmp($key, 'mfa', 3) === 0;   // any case: MySQL compares keys case-insensitively
}

/* ── Who is this ─────────────────────────────────────────────────────────── */

/**
 * The person behind a session, and which kind of second step they get.
 * $who is what the session says it is: 'member' (a member account),
 * 'volunteer' (a card or emailed-code staff session), 'guardian'.
 */
function mfa_principal(string $id, string $who): ?array {
    if ($id === '') return null;
    if ($who === 'guardian') {
        $g = db_row("SELECT * FROM guardians WHERE guardianId = ? LIMIT 1", [$id]);
        return $g ? ['id' => $id, 'who' => 'guardian', 'kind' => 'guardian', 'name' => (string)($g['fullName'] ?? ''),
                     'email' => (string)($g['email'] ?? ''), 'phone' => (string)($g['phone'] ?? ''), 'centre' => ''] : null;
    }
    if ($who === 'volunteer') {
        $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1", [$id]);
        return $v ? ['id' => $id, 'who' => 'volunteer', 'kind' => 'team', 'name' => (string)($v['fullName'] ?? ''),
                     'email' => (string)($v['email'] ?? ''), 'phone' => (string)($v['phone'] ?? ''), 'centre' => (string)($v['centre'] ?? ''), 'role' => (string)($v['role'] ?? '')] : null;
    }
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return null;
    $base = ['id' => $id, 'who' => 'member', 'name' => (string)($m['fullName'] ?? ''), 'email' => (string)($m['email'] ?? ''), 'phone' => (string)($m['phone'] ?? ''),
             'centre' => (string)($m['centre'] ?? ''), 'role' => (string)($m['role'] ?? '')];
    if (is_admin_role((string)($m['role'] ?? ''))) return $base + ['kind' => 'staff', 'staffApp' => trim((string)($m['totpSecret'] ?? '')) !== ''];
    // An adult member who mentors holds children's records: the team's step, not a child's.
    $mentor = db_row("SELECT mentorId FROM mentors WHERE memberId = ? AND status = 'active' LIMIT 1", [$id]);
    return $base + ['kind' => $mentor ? 'team' : 'member'];
}

function mfa_policy(): array {
    $set = setting_get('mfa_policy');
    $out = MFA_POLICY_DEFAULT;
    if (is_array($set)) foreach (MFA_KINDS as $k) {
        if (in_array((string)($set[$k] ?? ''), MFA_POLICY_VALS, true)) $out[$k] = (string)$set[$k];
    }
    return $out;
}

/** The methods this kind may choose now: the admin's subset of MFA_METHODS, never empty. */
function mfa_methods_for(string $kind): array {
    $all = MFA_METHODS[$kind] ?? [];
    $set = setting_get('mfa_methods');
    if (!function_exists('sms_enabled') || !sms_enabled()) $all = array_values(array_diff($all, ['sms']));
    $pick = is_array($set) && is_array($set[$kind] ?? null) ? array_values(array_intersect($all, $set[$kind])) : [];
    return $pick ?: $all;
}
function mfa_method_rows(string $kind): array {
    return array_map(fn($m) => ['id' => $m] + MFA_METHOD_INFO[$m], mfa_methods_for($kind));
}

/* ── Backup codes ── */
function mfa_backup_issue(string $id): array {
    $codes = []; $rows = [];
    for ($i = 0; $i < MFA_BACKUP_N; $i++) {
        $c = strtoupper(substr(bin2hex(random_bytes(4)), 0, 4) . '-' . substr(bin2hex(random_bytes(4)), 0, 4));
        $codes[] = $c; $rows[] = ['h' => password_hash(str_replace('-', '', $c), PASSWORD_DEFAULT), 'u' => 0];
    }
    mfa_put($id, 'mfa.backup', $rows);
    return $codes;
}
function mfa_backup_left(string $id): int {
    $b = mfa_get($id, 'mfa.backup');
    return is_array($b) ? count(array_filter($b, fn($r) => is_array($r) && empty($r['u']))) : 0;
}
/** Spend one backup code; true when it was good and unused. */
function mfa_backup_use(string $id, string $input): bool {
    $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $input) ?? '');
    if (!preg_match('/^[A-F0-9]{8}$/', $c)) return false;
    $b = mfa_get($id, 'mfa.backup');
    if (!is_array($b)) return false;
    foreach ($b as $i => $r) {
        if (is_array($r) && empty($r['u']) && password_verify($c, (string)($r['h'] ?? ''))) {
            $b[$i]['u'] = time(); mfa_put($id, 'mfa.backup', $b);
            return true;
        }
    }
    return false;
}

function mfa_enrolment(string $id): ?array {
    $e = mfa_get($id, 'mfa');
    return is_array($e) && !empty($e['type']) ? $e : null;
}

function mfa_required_for(array $pr): bool {
    if (!in_array($pr['kind'], MFA_KINDS, true)) return false;
    return mfa_policy()[$pr['kind']] === 'required' || (string)mfa_get($pr['id'], 'mfa.req') === '1';
}

/* ── The desk's two ways past a lost step ──
 * 'mfa.bypass' — the 10-minute window {until, by, at, used: 0|unix, rep: replace-until}
 * 'mfa.code1'  — the one-time code      {h, exp, by, at, used: 0|unix, rep: replace-until} */
function mfa_letin_code_new(): string {
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I: it is read out at a desk
    $c = '';
    for ($i = 0; $i < 8; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)];
    return substr($c, 0, 4) . '-' . substr($c, 4);
}
function mfa_letin_norm(string $in): string {
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $in) ?? '');
}
/**
 * Mark a desk grant used, in one guarded write: two sign-ins at the same moment
 * must not both get through. The stored value changes (it gains `used`), so the
 * claim matches once on MySQL as on SQLite. Opens the replace window.
 */
function mfa_grant_claim(string $id, string $key, array $b): bool {
    $old = json_encode($b, JSON_UNESCAPED_SLASHES);
    $b['used'] = time(); $b['rep'] = time() + MFA_LETIN_TTL;
    $new = json_encode($b, JSON_UNESCAPED_SLASHES);
    return db_exec('UPDATE member_state SET stateValue = ?, updatedAt = ? WHERE memberId = ? AND stateKey = ? AND stateValue = ?', [$new, now_iso(), $id, $key, $old]) === 1;
}
/** The 10-minute window, if open and not yet used: its end, else 0. */
function mfa_window_open(string $id): int {
    $b = mfa_get($id, 'mfa.bypass');
    return is_array($b) && empty($b['used']) && (int)($b['until'] ?? 0) > time() ? (int)$b['until'] : 0;
}
/** Let ONE sign-in through the window. True when this one took it. */
function mfa_window_take(string $id): bool {
    $b = mfa_get($id, 'mfa.bypass');
    if (!is_array($b) || !empty($b['used']) || (int)($b['until'] ?? 0) <= time()) return false;
    return mfa_grant_claim($id, 'mfa.bypass', $b);
}
/** Spend the desk code: true once, for the right code, inside its ten minutes. */
function mfa_letin_use(string $id, string $input): bool {
    $b = mfa_get($id, 'mfa.code1');
    $c = mfa_letin_norm($input);
    if (!is_array($b) || empty($b['h']) || !empty($b['used']) || (int)($b['exp'] ?? 0) < time() || strlen($c) !== 8) return false;
    if (!password_verify($c, (string)$b['h'])) return false;
    return mfa_grant_claim($id, 'mfa.code1', $b);
}
/** The replace window a used grant opened, or 0. Never a way in by itself. */
function mfa_bypass_until(string $id): int {
    $u = 0;
    foreach (['mfa.bypass', 'mfa.code1'] as $k) {
        $b = mfa_get($id, $k);
        if (is_array($b) && !empty($b['used'])) $u = max($u, (int)($b['rep'] ?? 0));
    }
    return $u > time() ? $u : 0;
}
/** Close every grant: the new step is set. */
function mfa_grants_close(string $id): void { mfa_del($id, 'mfa.bypass'); mfa_del($id, 'mfa.code1'); }

/**
 * What a fresh sign-in still owes, or '' for nothing:
 *   'question' | 'app' | 'email' | 'pin'  — answer it before the portal opens
 *   'enroll'                               — required and not yet set up
 * $proven: factors the sign-in itself already showed ('email' for an emailed
 * code or link). A team member whose second step is email and who signed in
 * with an emailed code is not asked for a second email — that would be the
 * same thing twice.
 */
function mfa_need(string $id, string $who, array $proven = []): string {
    $pr = mfa_principal($id, $who);
    if (!$pr || !in_array($pr['kind'], MFA_KINDS, true)) return '';
    if (mfa_policy()[$pr['kind']] === 'off' && (string)mfa_get($id, 'mfa.req') !== '1') return '';
    /* The desk's 10-minute window lets ONE sign-in through, then closes. A
       desk code is not a pass here: it is typed on the step screen. */
    if (mfa_window_take($id)) {
        audit('mfa.bypass.used', $id, $id, ['kind' => $pr['kind']], '');
        return '';
    }
    $e = mfa_enrolment($id);
    if ($e) return in_array((string)$e['type'], $proven, true) ? '' : (string)$e['type'];
    return mfa_required_for($pr) ? 'enroll' : '';
}

/* ── Checking an answer ───────────────────────────────────────────────────── */

/** Answers are compared as words: case, spacing and punctuation never decide. */
function mfa_norm_answer(string $a): string {
    $a = mb_strtolower(trim($a));
    $a = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $a) ?? '';
    return trim(preg_replace('/\s+/', ' ', $a) ?? '');
}

function mfa_mask_email(string $e): string {
    return $e !== '' && function_exists('mask_email') ? mask_email($e) : '';
}

function mfa_mask_phone(string $e164): string {
    $d = preg_replace('/\D/', '', $e164) ?? '';
    return strlen($d) >= 7 ? '+' . substr($d, 0, 3) . ' ••• ••• ' . substr($d, -4) : '';
}

/**
 * Send a one-off code for $purpose ('signin' | 'enroll') by email, or by text
 * to $to (an E.164 number) when $channel is 'sms'. One code at a time, never
 * re-sent inside 30 seconds.
 */
function mfa_send_code(array $pr, string $purpose, string $channel = 'email', string $to = ''): array {
    $isSms = $channel === 'sms';
    if ($isSms) {
        if ($to === '') return ['ok' => false, 'error' => 'no_phone_on_file'];
        if (!function_exists('sms_enabled') || !sms_enabled()) return ['ok' => false, 'error' => 'sms_disabled'];
    } elseif ($pr['email'] === '') return ['ok' => false, 'error' => 'no_email_on_file'];
    $masked = $isSms ? mfa_mask_phone($to) : mfa_mask_email($pr['email']);
    $prev = mfa_get($pr['id'], 'mfa.code');
    if (is_array($prev) && (int)($prev['at'] ?? 0) > time() - 30 && (string)($prev['p'] ?? '') === $purpose && (string)($prev['to'] ?? '') === ($isSms ? $to : '')) return ['ok' => true, 'masked' => $masked, 'resent' => false];
    $code = new_otp();
    mfa_put($pr['id'], 'mfa.code', ['h' => password_hash($code, PASSWORD_DEFAULT), 'exp' => time() + MFA_CODE_TTL, 'at' => time(), 'p' => $purpose, 'to' => $isSms ? $to : '']);
    if ($isSms) {
        // No link in the text: a code someone reads out is the only thing in it.
        $r = sms_send($to, 'NGG: your sign-in code is ' . $code . '. It is good for 10 minutes. Never share it — NGG staff will not ask for it.');
        if (empty($r['ok'])) { mfa_del($pr['id'], 'mfa.code'); return ['ok' => false, 'error' => 'sms_failed', 'detail' => (string)($r['error'] ?? '')]; }
        return ['ok' => true, 'masked' => $masked, 'delivery' => true, 'via' => (string)($r['provider'] ?? '')];
    }
    $first = explode(' ', $pr['name'])[0] ?? '';
    $html = email_template([
        'eyebrow' => 'Two-step sign-in',
        'title'   => $purpose === 'enroll' ? 'Confirm your email for two-step sign-in' : 'Your second sign-in step',
        'intro'   => 'Hi ' . ($first ?: 'there') . ', here is your code. It is good for 10 minutes.',
        'otp'     => $code,
        'footNote'=> 'If you did not just sign in to Next Generation Genius, someone may have your ID card. Tell your coordinator.',
    ]);
    $sent = send_mail($pr['email'], 'Your NGG sign-in code', $html);
    return ['ok' => true, 'masked' => $masked, 'delivery' => $sent];
}

function mfa_code_ok(string $id, string $code, string $purpose): bool {
    $c = mfa_get($id, 'mfa.code');
    if (!is_array($c) || (int)($c['exp'] ?? 0) < time() || (string)($c['p'] ?? '') !== $purpose) return false;
    $code = preg_replace('/\D/', '', $code) ?? '';
    if (strlen($code) !== 6 || !password_verify($code, (string)($c['h'] ?? ''))) return false;
    mfa_del($id, 'mfa.code');
    return true;
}

/** Does $input satisfy this enrolment? */
function mfa_check(string $id, array $e, string $input): bool {
    switch ((string)$e['type']) {
        case 'question': return $input !== '' && password_verify(mfa_norm_answer($input), (string)($e['a'] ?? ''));
        case 'pin':      return preg_match('/^\d{6}$/', $input) === 1 && password_verify($input, (string)($e['a'] ?? ''));
        case 'app':      return totp_verify((string)($e['secret'] ?? ''), $input, 1);
        case 'email':
        case 'sms':      return mfa_code_ok($id, $input, 'signin');
    }
    return false;
}

/* ── The person's own ops ─────────────────────────────────────────────────── */

function mfa_self(array $p): ?array {
    return mfa_principal((string)($p['requesterId'] ?? ''), (string)($p['who'] ?? 'member'));
}

function mfa_status(array $p): array {
    $pr = mfa_self($p);
    if (!$pr) return ['ok' => false, 'error' => 'no_requester'];
    $kind = $pr['kind'];
    if ($kind === 'staff') {
        return ['ok' => true, 'kind' => 'staff', 'policy' => 'required', 'required' => true, 'enrolled' => !empty($pr['staffApp']),
                'type' => 'app', 'methods' => [['id' => 'app'] + MFA_METHOD_INFO['app']], 'managedBy' => 'console'];
    }
    $e = mfa_enrolment($pr['id']);
    $policy = mfa_policy()[$kind];
    return ['ok' => true, 'kind' => $kind, 'policy' => $policy, 'required' => mfa_required_for($pr),
        'enrolled' => (bool)$e, 'type' => $e ? (string)$e['type'] : '', 'since' => $e ? (string)($e['since'] ?? '') : '',
        'question' => $e && $e['type'] === 'question' ? (string)($e['q'] ?? '') : '',
        'methods' => mfa_method_rows($kind),
        'questions' => in_array('question', mfa_methods_for($kind), true) ? MFA_QUESTIONS : [],
        'backupLeft' => $e ? mfa_backup_left($pr['id']) : 0,
        'email' => mfa_mask_email($pr['email']),
        'phone' => ($ph = function_exists('sms_normalize') ? sms_normalize((string)($pr['phone'] ?? '')) : '') !== '' ? mfa_mask_phone($ph) : '',
        'sentTo' => $e && $e['type'] === 'sms' ? mfa_mask_phone((string)($e['to'] ?? '')) : '',
        'bypassUntil' => mfa_bypass_until($pr['id']),
        'locked' => attempt_locked('mfa', $pr['id'])];
}

/**
 * mfa.window — a step screen ALREADY OPEN when the desk let its owner in for
 * ten minutes. The window lets one sign-in through; this session, which has
 * already passed the first factor and is waiting on the step, takes it.
 */
function mfa_window_pass(array $p): array {
    $pr = mfa_self($p);
    if (!$pr) return ['ok' => false, 'error' => 'no_requester'];
    if (!mfa_window_take($pr['id'])) return ['ok' => true, 'taken' => false];
    audit('mfa.bypass.used', $pr['id'], $pr['id'], ['kind' => $pr['kind'], 'waiting' => true], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'taken' => true, 'replaceUntil' => mfa_bypass_until($pr['id'])];
}

/** Begin setting up: an app gets a fresh secret to scan; email gets a code. */
function mfa_enroll_start(array $p): array {
    $pr = mfa_self($p);
    if (!$pr || !in_array($pr['kind'], MFA_KINDS, true)) return ['ok' => false, 'error' => 'not_available'];
    $type = (string)($p['type'] ?? '');
    if (!in_array($type, mfa_methods_for($pr['kind']), true)) return ['ok' => false, 'error' => 'bad_type'];
    if ($type === 'app') {
        $secret = rand_base32(20);
        mfa_put($pr['id'], 'mfa.pend', ['type' => 'app', 'secret' => $secret, 'exp' => time() + 1800]);
        $label = rawurlencode('NGG:' . ($pr['email'] !== '' ? $pr['email'] : $pr['id']));
        return ['ok' => true, 'type' => 'app', 'secret' => $secret,
                'otpauth' => 'otpauth://totp/' . $label . '?secret=' . $secret . '&issuer=NGG&digits=6&period=30'];
    }
    if ($type === 'email') {
        if ($pr['email'] === '') return ['ok' => false, 'error' => 'no_email_on_file'];
        $r = mfa_send_code($pr, 'enroll');
        return $r['ok'] ? $r + ['type' => 'email'] : $r;
    }
    if ($type === 'sms') {
        // The number typed in now, or the one on the record. Either is proven
        // only by the code reaching it, so a typo cannot lock anybody out.
        $raw = trim((string)($p['phone'] ?? '')) !== '' ? (string)$p['phone'] : (string)($pr['phone'] ?? '');
        $to = sms_normalize($raw);
        if ($to === '') return ['ok' => false, 'error' => trim((string)($p['phone'] ?? '')) !== '' ? 'bad_number' : 'no_phone_on_file'];
        mfa_put($pr['id'], 'mfa.pend', ['type' => 'sms', 'to' => $to, 'exp' => time() + 1800]);
        $r = mfa_send_code($pr, 'enroll', 'sms', $to);
        return $r['ok'] ? $r + ['type' => 'sms'] : $r;
    }
    return ['ok' => true, 'type' => $type];
}

/**
 * Finish setting up (or switch method). Changing an existing step needs the
 * current one first: an unlocked tablet left in a classroom must not be a way
 * to replace somebody's answer.
 */
function mfa_enroll_finish(array $p): array {
    $pr = mfa_self($p);
    if (!$pr || !in_array($pr['kind'], MFA_KINDS, true)) return ['ok' => false, 'error' => 'not_available'];
    $id = $pr['id'];
    if (attempt_locked('mfa', $id)) return ['ok' => false, 'error' => 'too_many_attempts'];
    $type = (string)($p['type'] ?? '');
    if (!in_array($type, mfa_methods_for($pr['kind']), true)) return ['ok' => false, 'error' => 'bad_type'];
    $have = mfa_enrolment($id);
    /* Let in by the desk: the step is being REPLACED because it was lost (a new
       phone, a forgotten answer), so the old one cannot be asked for. That is
       the whole point of the ten minutes, and it was impossible: changing the
       step demanded the very thing the person had come to the desk without. */
    $letIn = mfa_bypass_until($id) > 0;
    if ($have && empty($p['pendingEnroll']) && !$letIn) {
        if (!mfa_check($id, $have, trim((string)($p['current'] ?? '')))) {
            attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
            return ['ok' => false, 'error' => 'current_wrong'];
        }
    }
    $rec = ['type' => $type, 'since' => now_iso()];
    if ($type === 'question') {
        $q = trim((string)($p['question'] ?? ''));
        $a = mfa_norm_answer((string)($p['answer'] ?? ''));
        if (mb_strlen($q) < 8 || mb_strlen($q) > 140) return ['ok' => false, 'error' => 'bad_question'];
        if (mb_strlen($a) < 3 || mb_strlen($a) > 80) return ['ok' => false, 'error' => 'answer_too_short'];
        // An answer that is the person's own name or id is no secret at all.
        $nm = mfa_norm_answer($pr['name']);
        if ($a === mfa_norm_answer($id) || ($nm !== '' && ($a === $nm || in_array($a, explode(' ', $nm), true)))) return ['ok' => false, 'error' => 'answer_is_name'];
        $rec += ['q' => $q, 'a' => password_hash($a, PASSWORD_DEFAULT)];
    } elseif ($type === 'pin') {
        $pin = trim((string)($p['pin'] ?? ''));
        if (!preg_match('/^\d{6}$/', $pin)) return ['ok' => false, 'error' => 'bad_pin'];
        if (preg_match('/^(\d)\1{5}$/', $pin) || in_array($pin, ['123456', '654321', '012345', '123123'], true)) return ['ok' => false, 'error' => 'pin_too_easy'];
        $rec += ['a' => password_hash($pin, PASSWORD_DEFAULT)];
    } elseif ($type === 'app') {
        $pend = mfa_get($id, 'mfa.pend');
        if (!is_array($pend) || (int)($pend['exp'] ?? 0) < time()) return ['ok' => false, 'error' => 'setup_expired'];
        if (!totp_verify((string)$pend['secret'], (string)($p['code'] ?? ''), 1)) {
            attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
            return ['ok' => false, 'error' => 'code_wrong'];
        }
        $rec += ['secret' => (string)$pend['secret']];
        mfa_del($id, 'mfa.pend');
    } elseif ($type === 'email') {
        if (!mfa_code_ok($id, (string)($p['code'] ?? ''), 'enroll')) {
            attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
            return ['ok' => false, 'error' => 'code_wrong'];
        }
    } elseif ($type === 'sms') {
        $pend = mfa_get($id, 'mfa.pend');
        if (!is_array($pend) || ($pend['type'] ?? '') !== 'sms' || (int)($pend['exp'] ?? 0) < time()) return ['ok' => false, 'error' => 'setup_expired'];
        if (!mfa_code_ok($id, (string)($p['code'] ?? ''), 'enroll')) {
            attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
            return ['ok' => false, 'error' => 'code_wrong'];
        }
        $rec += ['to' => (string)$pend['to']];
        mfa_del($id, 'mfa.pend');
    }
    mfa_put($id, 'mfa', $rec);
    attempt_reset('mfa', $id);
    // The let-in has done its job: a new step is set, so the window closes now.
    if ($letIn) mfa_grants_close($id);
    // A fresh set of backup codes with every setup or change, shown once.
    $codes = mfa_backup_issue($id);
    audit($have ? 'mfa.change' : 'mfa.enroll', $id, $id, ['type' => $type, 'kind' => $pr['kind'], 'letIn' => $letIn], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'type' => $type, 'backupCodes' => $codes];
}

/** What to show on the second-step screen; sends the email code when that is the step. */
function mfa_challenge(array $p): array {
    $pr = mfa_self($p);
    if (!$pr) return ['ok' => false, 'error' => 'no_requester'];
    $e = mfa_enrolment($pr['id']);
    if (!$e) return ['ok' => true, 'type' => 'enroll'];
    $out = ['ok' => true, 'type' => (string)$e['type'], 'locked' => attempt_locked('mfa', $pr['id'])];
    if ($e['type'] === 'question') $out['question'] = (string)($e['q'] ?? '');
    if (($e['type'] === 'email' || $e['type'] === 'sms') && !$out['locked']) {
        $r = $e['type'] === 'sms' ? mfa_send_code($pr, 'signin', 'sms', (string)($e['to'] ?? '')) : mfa_send_code($pr, 'signin');
        if (empty($r['ok'])) return $r;
        $out += ['masked' => $r['masked'], 'delivery' => $r['delivery'] ?? true];
    }
    return $out;
}

function mfa_verify(array $p): array {
    $pr = mfa_self($p);
    if (!$pr) return ['ok' => false, 'error' => 'no_requester'];
    $id = $pr['id'];
    if (attempt_locked('mfa', $id)) return ['ok' => false, 'error' => 'too_many_attempts'];
    $e = mfa_enrolment($id);
    if (!$e) return ['ok' => false, 'error' => 'not_enrolled'];
    $in = trim((string)($p['answer'] ?? ''));
    // The step itself, or else one unused backup code (spent here, once).
    $passed = mfa_check($id, $e, $in);
    if (!$passed && mfa_letin_use($id, $in)) {
        attempt_reset('mfa', $id);
        audit('mfa.pass.letin', $id, $id, ['type' => $e['type'], 'by' => (string)(mfa_get($id, 'mfa.code1')['by'] ?? '')], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'letIn' => true, 'replaceUntil' => mfa_bypass_until($id)];
    }
    if (!$passed && mfa_backup_use($id, $in)) {
        attempt_reset('mfa', $id);
        $left = mfa_backup_left($id);
        audit('mfa.pass.backup', $id, $id, ['type' => $e['type'], 'left' => $left], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'backupUsed' => true, 'backupLeft' => $left];
    }
    if (!$passed) {
        $locked = attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
        audit('mfa.fail', $id, $id, ['type' => $e['type'], 'locked' => $locked], (string)($p['ip'] ?? ''));
        if ($locked && $pr['kind'] === 'member') mfa_tell_staff_locked($pr);
        return ['ok' => false, 'error' => $locked ? 'too_many_attempts' : 'wrong_answer'];
    }
    attempt_reset('mfa', $id);
    audit('mfa.pass', $id, $id, ['type' => $e['type']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** A new set of backup codes (the old ones stop working), with the current step first. */
function mfa_backup_new(array $p): array {
    $pr = mfa_self($p);
    if (!$pr || !in_array($pr['kind'], MFA_KINDS, true)) return ['ok' => false, 'error' => 'not_available'];
    $e = mfa_enrolment($pr['id']);
    if (!$e) return ['ok' => false, 'error' => 'not_enrolled'];
    if (attempt_locked('mfa', $pr['id'])) return ['ok' => false, 'error' => 'too_many_attempts'];
    if (!mfa_check($pr['id'], $e, trim((string)($p['current'] ?? '')))) {
        attempt_fail('mfa', $pr['id'], MFA_FAIL_MAX, MFA_FAIL_LOCK);
        return ['ok' => false, 'error' => 'current_wrong'];
    }
    $codes = mfa_backup_issue($pr['id']);
    audit('mfa.backup.new', $pr['id'], $pr['id'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'backupCodes' => $codes];
}

/** Turn it off — only where it is not required, and only with the current step. */
function mfa_off(array $p): array {
    $pr = mfa_self($p);
    if (!$pr || !in_array($pr['kind'], MFA_KINDS, true)) return ['ok' => false, 'error' => 'not_available'];
    if (mfa_required_for($pr)) return ['ok' => false, 'error' => 'mfa_required_by_policy'];
    $e = mfa_enrolment($pr['id']);
    if (!$e) return ['ok' => true, 'unchanged' => true];
    if (attempt_locked('mfa', $pr['id'])) return ['ok' => false, 'error' => 'too_many_attempts'];
    if (!mfa_check($pr['id'], $e, trim((string)($p['current'] ?? '')))) {
        attempt_fail('mfa', $pr['id'], MFA_FAIL_MAX, MFA_FAIL_LOCK);
        return ['ok' => false, 'error' => 'current_wrong'];
    }
    mfa_del($pr['id'], 'mfa'); mfa_del($pr['id'], 'mfa.backup');
    audit('mfa.off', $pr['id'], $pr['id'], ['type' => $e['type']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** A child locked out by their own question is a desk problem: tell the desk, once per lock. */
function mfa_tell_staff_locked(array $pr): void {
    if (function_exists('push_notification')) {
        try { push_notification($pr['id'], ['kind' => 'security', 'title' => 'Sign-in paused for 15 minutes',
            'body' => 'Too many wrong answers. Wait, or ask a coordinator to let you in.']); } catch (\Throwable $e) {}
    }
}

/* ── Control Room ────────────────────────────────────────────────────────── */

/** One row per person, the three populations in one shape. */
function mfa_admin_row(array $r, string $kind, string $who): array {
    $e = json_decode((string)($r['mfaState'] ?? ''), true);
    $by = json_decode((string)($r['mfaBypass'] ?? ''), true);
    // The desk sees an open, unused window; a used one has done its job.
    $until = is_array($by) && empty($by['used']) ? (int)($by['until'] ?? 0) : 0;
    return ['id' => (string)$r['pid'], 'who' => $who, 'kind' => $kind, 'name' => (string)($r['fullName'] ?? ''),
        'centre' => (string)($r['centre'] ?? ''), 'email' => mfa_mask_email((string)($r['email'] ?? '')),
        'type' => is_array($e) ? (string)($e['type'] ?? '') : '', 'since' => is_array($e) ? (string)($e['since'] ?? '') : '',
        'required' => (string)($r['mfaReq'] ?? '') === '"1"' || (string)($r['mfaReq'] ?? '') === '1',
        'bypassUntil' => $until > time() ? $until : 0];
}

/**
 * The sign-in & security desk. Server-side filter, search and paging over all
 * three kinds; centre scope applied on the way in for members and the team
 * (guardians have no centre of their own and are an unscoped admin's view).
 */
function admin_mfa_overview(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $kind  = in_array((string)($p['kind'] ?? ''), MFA_KINDS, true) ? (string)$p['kind'] : 'member';
    $state = in_array((string)($p['state'] ?? ''), ['none', 'enrolled', 'all'], true) ? (string)$p['state'] : 'all';
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $limit = max(10, min(200, (int)($p['limit'] ?? 50)));
    $offset = max(0, (int)($p['offset'] ?? 0));
    $scope = admin_centre_names_in_scope($g['requester']);

    $join = "LEFT JOIN member_state ms ON ms.memberId = %1\$s AND ms.stateKey = 'mfa'
             LEFT JOIN member_state mb ON mb.memberId = %1\$s AND mb.stateKey = 'mfa.bypass'
             LEFT JOIN member_state mr ON mr.memberId = %1\$s AND mr.stateKey = 'mfa.req'";
    $args = [];
    if ($kind === 'guardian') {
        $from = "FROM guardians t " . sprintf($join, 't.guardianId') . " WHERE t.status = 'active'";
        $sel  = "t.guardianId AS pid, t.fullName, '' AS centre, t.email";
        $who  = 'guardian';
        if ($scope !== null) $from .= ' AND 1 = 0';
    } elseif ($kind === 'team') {
        $from = "FROM volunteers t " . sprintf($join, 't.volunteerId') . " WHERE t.status = 'active'";
        $sel  = "t.volunteerId AS pid, t.fullName, t.centre, t.email";
        $who  = 'volunteer';
    } else {
        $from = "FROM members t " . sprintf($join, 't.memberId') . " WHERE t.status <> 'deleted'";
        // Staff are on the console's own authenticator, managed in Access & roles.
        $roles = staff_role_names();
        $from .= ' AND lower(t.role) NOT IN (' . implode(',', array_fill(0, count($roles), '?')) . ')'; $args = array_merge($args, $roles);
        $sel  = "t.memberId AS pid, t.fullName, t.centre, t.email";
        $who  = 'member';
    }
    if ($scope !== null && $kind !== 'guardian') {
        if (!$scope) $from .= ' AND 1 = 0';
        else { $from .= ' AND t.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope); }
    }
    /* Name, the record's own id and email — and for a member the PRINTED ID,
       which is the one on their card and the one they will read out. */
    $searchCols = ['t.fullName', explode(' ', $sel)[0], 't.email'];
    if ($who === 'member') $searchCols[] = 't.displayId';
    [$qSql, $qArgs] = sql_text_search($q, $searchCols);
    if ($qSql !== '') { $from .= ' AND ' . $qSql; $args = array_merge($args, $qArgs); }
    if ($state === 'none') $from .= ' AND ms.stateValue IS NULL';
    if ($state === 'enrolled') $from .= ' AND ms.stateValue IS NOT NULL';
    $total = (int)(db_row("SELECT COUNT(*) c $from", $args)['c'] ?? 0);
    $rows = db_all("SELECT $sel, ms.stateValue AS mfaState, mb.stateValue AS mfaBypass, mr.stateValue AS mfaReq $from ORDER BY t.fullName LIMIT $limit OFFSET $offset", $args);

    // Headline counts for the three kinds, same scope.
    $counts = [];
    foreach (['member' => ['members', 'memberId', "status <> 'deleted'"], 'team' => ['volunteers', 'volunteerId', "status = 'active'"], 'guardian' => ['guardians', 'guardianId', "status = 'active'"]] as $k => [$tb, $col, $wh]) {
        $cw = $wh; $ca = [];
        if ($k === 'member') {
            $roles = staff_role_names();
            $cw .= ' AND lower(role) NOT IN (' . implode(',', array_fill(0, count($roles), '?')) . ')'; $ca = $roles;
        }
        if ($scope !== null) {
            if ($k === 'guardian' || !$scope) $cw .= ' AND 1 = 0';
            else { $cw .= ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $ca = array_merge($ca, $scope); }
        }
        $all = (int)(db_row("SELECT COUNT(*) c FROM $tb WHERE $cw", $ca)['c'] ?? 0);
        $on  = (int)(db_row("SELECT COUNT(*) c FROM $tb t JOIN member_state s ON s.memberId = t.$col AND s.stateKey = 'mfa' WHERE " . preg_replace('/\b(status|role|centre)\b/', 't.$1', $cw), $ca)['c'] ?? 0);
        $counts[$k] = ['total' => $all, 'enrolled' => $on];
    }
    return ['ok' => true, 'kind' => $kind, 'state' => $state, 'total' => $total,
        'rows' => array_map(fn($r) => mfa_admin_row($r, $kind, $who), $rows),
        'counts' => $counts, 'policy' => mfa_policy(),
        // Per kind: every method it may be given, and which the desk allows now.
        'methods' => array_map(fn($k) => array_map(fn($m) => ['id' => $m, 'label' => MFA_METHOD_INFO[$m]['label'], 'on' => in_array($m, mfa_methods_for($k), true)], MFA_METHODS[$k]), array_combine(MFA_KINDS, MFA_KINDS)),
        'canPolicy' => in_array('settings', member_effective_caps($g['requester']), true)];
}

function admin_mfa_policy_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $in = is_array($p['policy'] ?? null) ? $p['policy'] : [];
    $cur = mfa_policy(); $next = $cur;
    foreach (MFA_KINDS as $k) {
        if (!array_key_exists($k, $in)) continue;
        if (!in_array((string)$in[$k], MFA_POLICY_VALS, true)) return ['ok' => false, 'error' => 'bad_policy', 'detail' => $k];
        $next[$k] = (string)$in[$k];
    }
    // Which methods each kind may choose: a non-empty subset of what it can be given.
    $mIn = is_array($p['methods'] ?? null) ? $p['methods'] : [];
    $mCur = []; foreach (MFA_KINDS as $k) $mCur[$k] = mfa_methods_for($k);
    $mNext = $mCur;
    foreach (MFA_KINDS as $k) {
        if (!array_key_exists($k, $mIn)) continue;
        $want = is_array($mIn[$k]) ? array_values(array_unique(array_map('strval', $mIn[$k]))) : [];
        if (array_diff($want, MFA_METHODS[$k])) return ['ok' => false, 'error' => 'bad_method', 'detail' => $k];
        if (!$want) return ['ok' => false, 'error' => 'no_method', 'detail' => 'Leave at least one way for ' . $k . '.'];
        $mNext[$k] = array_values(array_intersect(MFA_METHODS[$k], $want));
    }
    if ($next === $cur && $mNext === $mCur) return ['ok' => true, 'policy' => $cur, 'methods' => $mCur, 'unchanged' => true];
    $by = (string)$g['requester']['memberId'];
    if ($next !== $cur) setting_set('mfa_policy', $next, $by);
    if ($mNext !== $mCur) setting_set('mfa_methods', $mNext, $by);
    audit('admin.mfa.policy', $by, 'mfa_policy', ['from' => $cur, 'to' => $next, 'methodsFrom' => $mCur, 'methodsTo' => $mNext], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'policy' => $next, 'methods' => $mNext];
}

/**
 * One op, several declared actions, per-row verdicts, one audit event per run:
 *   bypass    — let them in without their second step for N minutes (default 10)
 *   reset     — clear what they set; they choose again at their next sign-in
 *   require   — require it of this person whatever the policy says
 *   unrequire — back to the policy
 *   remind    — email them how to set it up (quiet for 3 days unless force)
 */
function admin_mfa_act(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $action = (string)($p['action'] ?? '');
    if (!in_array($action, ['bypass', 'code', 'reset', 'require', 'unrequire', 'remind'], true)) return ['ok' => false, 'error' => 'bad_action'];
    $people = is_array($p['people'] ?? null) ? array_values($p['people']) : [];
    if (!$people) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($people) > MFA_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . MFA_BULK_MAX . ' people at a time.', 'max' => MFA_BULK_MAX];
    if (($action === 'bypass' || $action === 'code') && count($people) > 1) return ['ok' => false, 'error' => 'one_at_a_time', 'detail' => 'Letting somebody in without their second step is for one person at the desk, not a list.'];
    // The code's life is fixed, as Google fixes its own: the desk does not choose it.
    if (($action === 'bypass' || $action === 'code') && isset($p['minutes']) && (int)$p['minutes'] !== MFA_LETIN_TTL / 60) return ['ok' => false, 'error' => 'bad_minutes', 'detail' => 'A desk code lasts ' . (MFA_LETIN_TTL / 60) . ' minutes.'];
    $secs = MFA_LETIN_TTL;
    // Validate the whole payload before any write.
    foreach ($people as $x) {
        if (!is_array($x) || !in_array((string)($x['who'] ?? ''), ['member', 'volunteer', 'guardian'], true) || trim((string)($x['id'] ?? '')) === '') {
            return ['ok' => false, 'error' => 'bad_payload'];
        }
    }
    $me = (string)$g['requester']['memberId'];
    $scope = admin_centre_names_in_scope($g['requester']);
    $results = []; $done = 0; $refused = [];
    foreach ($people as $x) {
        $id = trim((string)$x['id']); $who = (string)$x['who'];
        $pr = mfa_principal($id, $who);
        $res = ['id' => $id, 'who' => $who];
        if (!$pr) { $results[] = $res + ['ok' => false, 'error' => 'not_found']; $refused[] = 'not_found'; continue; }
        if ($id === $me) { $results[] = $res + ['ok' => false, 'error' => 'own_account']; $refused[] = 'own_account'; continue; }
        if ($pr['kind'] === 'staff') { $results[] = $res + ['ok' => false, 'error' => 'staff_account', 'detail' => 'Staff authenticators are reset in Access & roles.']; $refused[] = 'staff_account'; continue; }
        if ($scope !== null && ($who === 'guardian' || !in_array($pr['centre'], $scope, true))) {
            $results[] = $res + ['ok' => false, 'error' => 'out_of_scope']; $refused[] = 'out_of_scope'; continue;
        }
        $e = mfa_enrolment($id);
        switch ($action) {
            case 'bypass':
            case 'code':
                /* One let-in, two doors, both for ten minutes:
                     · a step screen already open on their device opens by itself
                       (the window; only for somebody who has a second step);
                     · on the sign-in screen they type their ID and the CODE shown
                       to staff, with no password and no second step — the code,
                       made in person and spent once, is what proves it is them.
                   A window with no code would admit anybody typing their ID. */
                attempt_reset('mfa', $id);
                if ($e) mfa_put($id, 'mfa.bypass', ['until' => time() + $secs, 'at' => time(), 'by' => $me, 'used' => 0]);
                else mfa_del($id, 'mfa.bypass');
                $code = mfa_letin_code_new();
                mfa_put($id, 'mfa.code1', ['h' => password_hash(mfa_letin_norm($code), PASSWORD_DEFAULT), 'exp' => time() + $secs, 'at' => time(), 'by' => $me, 'used' => 0]);
                $told = mfa_tell_letin($pr, (string)($g['requester']['fullName'] ?? ''), true);
                // The code is in this response and nowhere else: shown once to the member of staff.
                $results[] = $res + ['ok' => true, 'code' => $code, 'expires' => time() + $secs, 'until' => time() + $secs,
                    'signInAs' => $pr['who'] === 'guardian' ? (string)$pr['email'] : mfa_signin_name($pr), 'told' => $told];
                break;
            case 'reset':
                if (!$e) { $results[] = $res + ['ok' => true, 'unchanged' => true]; break; }
                mfa_del($id, 'mfa'); mfa_del($id, 'mfa.pend'); mfa_del($id, 'mfa.backup'); attempt_reset('mfa', $id);
                $results[] = $res + ['ok' => true];
                break;
            case 'require':
            case 'unrequire':
                $want = $action === 'require';
                if (((string)mfa_get($id, 'mfa.req') === '1') === $want) { $results[] = $res + ['ok' => true, 'unchanged' => true]; break; }
                if ($want) mfa_put($id, 'mfa.req', '1'); else mfa_del($id, 'mfa.req');
                $results[] = $res + ['ok' => true];
                break;
            case 'remind':
                if ($e) { $results[] = $res + ['ok' => true, 'unchanged' => true, 'detail' => 'already_set_up']; break; }
                if ($pr['email'] === '') { $results[] = $res + ['ok' => false, 'error' => 'no_email_on_file']; $refused[] = 'no_email_on_file'; break; }
                $last = (int)(mfa_get($id, 'mfa.nudged') ?? 0);
                if ($last > time() - MFA_NUDGE_QUIET && empty($p['force'])) { $results[] = $res + ['ok' => false, 'error' => 'quiet_period']; $refused[] = 'quiet_period'; break; }
                $sent = mfa_mail_nudge($pr);
                if ($sent) mfa_put($id, 'mfa.nudged', time());
                $results[] = $res + ($sent ? ['ok' => true] : ['ok' => false, 'error' => 'mail_failed']);
                if (!$sent) $refused[] = 'mail_failed';
                break;
        }
        if (!empty(end($results)['ok']) && empty(end($results)['unchanged'])) $done++;
    }
    audit('admin.mfa.' . $action, $me, count($people) === 1 ? (string)$people[0]['id'] : '', [
        'count' => count($people), 'applied' => $done, 'refused' => array_count_values($refused),
        'minutes' => $action === 'bypass' || $action === 'code' ? intdiv($secs, 60) : null,
    ], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'action' => $action, 'applied' => $done, 'results' => $results];
}

/** What the person types beside the code: the ID on their card, else their email. */
function mfa_signin_name(array $pr): string {
    if ($pr['who'] === 'member') {
        $d = trim((string)(db_row('SELECT displayId FROM members WHERE memberId = ? LIMIT 1', [$pr['id']])['displayId'] ?? ''));
        return $d !== '' ? $d : $pr['id'];
    }
    return $pr['id'];
}

/**
 * auth.desk — sign in with the code staff made at the desk: the person's ID
 * (member ID, printed ID, volunteer ID or email) and the code. No password, no
 * emailed code and no second step: the code was made in person, for this one
 * account, lives ten minutes and is spent by its first use. A wrong code counts
 * against the account like a wrong second step. Unknown IDs and wrong codes get
 * the same answer.
 */
function auth_desk(array $p): array {
    $ip = (string)($p['ip'] ?? '');
    $ident = trim((string)($p['identifier'] ?? ''));
    $code = (string)($p['code'] ?? '');
    if ($ident === '' || strlen(mfa_letin_norm($code)) !== 8) return ['ok' => false, 'error' => 'invalid'];
    $who = ''; $id = '';
    $mid = function_exists('auth_resolve_member_id') ? auth_resolve_member_id($ident) : '';
    if ($mid === '') {
        $byDisplay = db_row('SELECT memberId FROM members WHERE lower(displayId) = ? LIMIT 1', [strtolower($ident)]);
        if ($byDisplay) $mid = (string)$byDisplay['memberId'];
    }
    if ($mid !== '' && db_row('SELECT 1 x FROM members WHERE memberId = ? LIMIT 1', [$mid])) { $who = 'member'; $id = $mid; }
    else {
        $v = function_exists('auth_find_volunteer') ? auth_find_volunteer($ident) : null;
        if ($v && ($v['kind'] ?? '') === 'volunteer') { $who = 'volunteer'; $id = (string)$v['id']; }
    }
    if ($id === '') { audit('login.fail.desk', null, '', ['ip' => $ip], $ip); return ['ok' => false, 'error' => 'invalid']; }
    if (attempt_locked('mfa', $id)) return ['ok' => false, 'error' => 'too_many_attempts'];
    if (!mfa_letin_use($id, $code)) {
        attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
        audit('login.fail.desk', $id, $id, ['ip' => $ip], $ip);
        return ['ok' => false, 'error' => 'invalid'];
    }
    attempt_reset('mfa', $id);
    // The window a waiting screen would have taken is spent too: one let-in, one way in.
    $w = mfa_get($id, 'mfa.bypass');
    if (is_array($w) && empty($w['used'])) mfa_del($id, 'mfa.bypass');
    if ($who === 'volunteer') {
        $vr = auth_staff_principal($id);
        if (!$vr) return ['ok' => false, 'error' => 'invalid'];
        audit('login.success', $id, $id, ['kind' => 'volunteer', 'via' => 'desk_code'], $ip);
        return ['ok' => true, 'volunteer' => $vr, 'replaceUntil' => mfa_bypass_until($id)];
    }
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m || in_array((string)$m['status'], ['deleted', 'suspended'], true)) return ['ok' => false, 'error' => 'invalid'];
    // Staff answer the console's own authenticator; a desk code is never theirs.
    if (function_exists('auth_password_only') && auth_password_only($m)) return ['ok' => false, 'error' => 'invalid'];
    auth_fail_reset($m);
    audit('login.success', $id, $id, ['via' => 'desk_code'], $ip);
    return ['ok' => true, 'member' => public_member($m), 'replaceUntil' => mfa_bypass_until($id)];
}

/** Tell the owner a desk code was issued, as Google alerts on new backup codes. Returns the channels that went. */
function mfa_tell_letin(array $pr, string $byName, bool $isCode = false): array {
    $sent = [];
    $first = explode(' ', $pr['name'])[0] ?? '';
    $by = trim(explode(' ', trim($byName))[0] ?? '');
    if ($pr['email'] !== '' && function_exists('send_mail') && function_exists('email_template')) {
        $html = email_template([
            'eyebrow' => 'Account security',
            'title'   => $isCode ? 'A one-time sign-in code was made for your account' : 'You can sign in without your second step for 10 minutes',
            'intro'   => 'Hi ' . ($first ?: 'there') . ', ' . ($by !== '' ? $by . ' at NGG' : 'NGG staff') . ($isCode
                ? ' just made a one-time code that signs you in once, with your ID and no password, for the next 10 minutes.'
                : ' just let your account sign in once without its second step, for the next 10 minutes.')
                . ' This is what happens when you ask at the desk because you forgot your answer or changed phones.',
            'bodyHtml'=> '<p>If that was not you, tell your coordinator today. ' . ($isCode ? 'The code works once.' : 'Only one sign-in is let through.') . ' After it, set up a new second step: you will not be asked for the old one.</p>',
            'footNote'=> 'Nobody from NGG will ever ask you to read this email\'s contents back to them.',
        ]);
        if (@send_mail($pr['email'], $isCode ? 'Security: a one-time sign-in code was made for your NGG account' : 'Security: your NGG account can sign in without its second step for 10 minutes', $html)) $sent[] = 'email';
    }
    try {
        if (function_exists('push_notification')) { push_notification($pr['id'], ['kind' => 'security', 'title' => $isCode ? 'One-time sign-in code made' : 'Second step off for 10 minutes',
            'body' => ($isCode ? 'Staff made a 10-minute code for your second step.' : 'Staff let one sign-in skip your second step for 10 minutes.') . ' Not you? Tell your coordinator.']); $sent[] = 'push'; }
    } catch (\Throwable $e) {}
    return $sent;
}

function mfa_mail_nudge(array $pr): bool {
    global $CONFIG;
    $first = explode(' ', $pr['name'])[0] ?? '';
    $how = $pr['kind'] === 'guardian' ? 'choose a six-digit family PIN'
         : ($pr['kind'] === 'team' ? 'link an authenticator app, or choose an emailed code' : 'choose a private question only you can answer');
    $html = email_template([
        'eyebrow' => 'Account security',
        'title'   => 'Add a second sign-in step',
        'intro'   => 'Hi ' . ($first ?: 'there') . ', your NGG account is protected only by what you sign in with. It takes a minute to ' . $how . '.',
        'ctaLabel'=> 'Set it up',
        'ctaUrl'  => ($CONFIG['app_origin'] ?? '') . ($pr['kind'] === 'guardian' ? '/family?mfa=setup' : '/?mfa=setup'),
        'footNote'=> 'Sent by your NGG coordinator. Nobody from NGG will ever ask you for your answer, PIN or code.',
    ]);
    return send_mail($pr['email'], 'Add a second sign-in step to your NGG account', $html);
}
