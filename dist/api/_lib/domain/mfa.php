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
 * Admin powers (people): let someone in without their second step for ten
 * minutes (a child who forgot their answer, standing at the desk), reset it so
 * they set a new one, require it of one person, and send a reminder. Policy
 * per kind (settings): off | optional | required.
 */

const MFA_KINDS        = ['member', 'team', 'guardian'];
const MFA_POLICY_VALS  = ['off', 'optional', 'required'];
const MFA_POLICY_DEFAULT = ['member' => 'optional', 'team' => 'optional', 'guardian' => 'optional'];
const MFA_METHODS = [
    'member'   => ['question'],
    'team'     => ['app', 'email'],
    'guardian' => ['pin'],
];
const MFA_METHOD_INFO = [
    'question' => ['label' => 'A private question', 'blurb' => 'Pick a question only you can answer. We ask it when you sign in.'],
    'app'      => ['label' => 'An authenticator app', 'blurb' => 'Google Authenticator, Microsoft Authenticator or similar shows a new 6-digit code every 30 seconds.'],
    'email'    => ['label' => 'A code by email', 'blurb' => 'We email a 6-digit code to the address on your record each time you sign in with your card.'],
    'pin'      => ['label' => 'A family PIN', 'blurb' => 'Six digits only you know, asked after the emailed sign-in code.'],
];
const MFA_QUESTIONS = [
    'What was the name of your first teacher?',
    'What is the name of the street you grew up on?',
    'What was the name of your first pet or favourite toy?',
    'Which town was your mother or father born in?',
    'What is a word only you and your best friend use?',
];
const MFA_FAIL_MAX       = 5;
const MFA_FAIL_LOCK      = 900;
const MFA_BYPASS_DEFAULT = 600;
const MFA_BYPASS_MAX     = 3600;
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
    return strncmp($key, 'mfa', 3) === 0;
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
                     'email' => (string)($g['email'] ?? ''), 'centre' => ''] : null;
    }
    if ($who === 'volunteer') {
        $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1", [$id]);
        return $v ? ['id' => $id, 'who' => 'volunteer', 'kind' => 'team', 'name' => (string)($v['fullName'] ?? ''),
                     'email' => (string)($v['email'] ?? ''), 'centre' => (string)($v['centre'] ?? ''), 'role' => (string)($v['role'] ?? '')] : null;
    }
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return null;
    $base = ['id' => $id, 'who' => 'member', 'name' => (string)($m['fullName'] ?? ''), 'email' => (string)($m['email'] ?? ''),
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

function mfa_enrolment(string $id): ?array {
    $e = mfa_get($id, 'mfa');
    return is_array($e) && !empty($e['type']) ? $e : null;
}

function mfa_required_for(array $pr): bool {
    if (!in_array($pr['kind'], MFA_KINDS, true)) return false;
    return mfa_policy()[$pr['kind']] === 'required' || (string)mfa_get($pr['id'], 'mfa.req') === '1';
}

function mfa_bypass_until(string $id): int {
    $b = mfa_get($id, 'mfa.bypass');
    $until = is_array($b) ? (int)($b['until'] ?? 0) : 0;
    return $until > time() ? $until : 0;
}

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
    if (mfa_bypass_until($id) > 0) {
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

/** Email a one-off code for $purpose ('signin' | 'enroll'). */
function mfa_send_code(array $pr, string $purpose): array {
    if ($pr['email'] === '') return ['ok' => false, 'error' => 'no_email_on_file'];
    $prev = mfa_get($pr['id'], 'mfa.code');
    if (is_array($prev) && (int)($prev['at'] ?? 0) > time() - 30) return ['ok' => true, 'masked' => mfa_mask_email($pr['email']), 'resent' => false];
    $code = new_otp();
    mfa_put($pr['id'], 'mfa.code', ['h' => password_hash($code, PASSWORD_DEFAULT), 'exp' => time() + MFA_CODE_TTL, 'at' => time(), 'p' => $purpose]);
    $first = explode(' ', $pr['name'])[0] ?? '';
    $html = email_template([
        'eyebrow' => 'Two-step sign-in',
        'title'   => $purpose === 'enroll' ? 'Confirm your email for two-step sign-in' : 'Your second sign-in step',
        'intro'   => 'Hi ' . ($first ?: 'there') . ', here is your code. It is good for 10 minutes.',
        'otp'     => $code,
        'footNote'=> 'If you did not just sign in to Next Generation Genius, someone may have your ID card. Tell your coordinator.',
    ]);
    $sent = send_mail($pr['email'], 'Your NGG sign-in code', $html);
    return ['ok' => true, 'masked' => mfa_mask_email($pr['email']), 'delivery' => $sent];
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
        case 'email':    return mfa_code_ok($id, $input, 'signin');
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
        'methods' => array_map(fn($m) => ['id' => $m] + MFA_METHOD_INFO[$m], MFA_METHODS[$kind]),
        'questions' => $kind === 'member' ? MFA_QUESTIONS : [],
        'email' => mfa_mask_email($pr['email']),
        'bypassUntil' => mfa_bypass_until($pr['id']),
        'locked' => attempt_locked('mfa', $pr['id'])];
}

/** Begin setting up: an app gets a fresh secret to scan; email gets a code. */
function mfa_enroll_start(array $p): array {
    $pr = mfa_self($p);
    if (!$pr || !in_array($pr['kind'], MFA_KINDS, true)) return ['ok' => false, 'error' => 'not_available'];
    $type = (string)($p['type'] ?? '');
    if (!in_array($type, MFA_METHODS[$pr['kind']], true)) return ['ok' => false, 'error' => 'bad_type'];
    if ($type === 'app') {
        $secret = rand_base32(20);
        mfa_put($pr['id'], 'mfa.pend', ['type' => 'app', 'secret' => $secret, 'exp' => time() + 1800]);
        $label = rawurlencode('NGG:' . ($pr['email'] !== '' ? $pr['email'] : $pr['id']));
        return ['ok' => true, 'type' => 'app', 'secret' => $secret,
                'otpauth' => 'otpauth://totp/' . $label . '?secret=' . $secret . '&issuer=NGG&digits=6&period=30'];
    }
    if ($type === 'email') {
        $r = mfa_send_code($pr, 'enroll');
        return $r['ok'] ? $r + ['type' => 'email'] : $r;
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
    if (!in_array($type, MFA_METHODS[$pr['kind']], true)) return ['ok' => false, 'error' => 'bad_type'];
    $have = mfa_enrolment($id);
    if ($have && empty($p['pendingEnroll'])) {
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
    }
    mfa_put($id, 'mfa', $rec);
    attempt_reset('mfa', $id);
    audit($have ? 'mfa.change' : 'mfa.enroll', $id, $id, ['type' => $type, 'kind' => $pr['kind']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'type' => $type];
}

/** What to show on the second-step screen; sends the email code when that is the step. */
function mfa_challenge(array $p): array {
    $pr = mfa_self($p);
    if (!$pr) return ['ok' => false, 'error' => 'no_requester'];
    $e = mfa_enrolment($pr['id']);
    if (!$e) return ['ok' => true, 'type' => 'enroll'];
    $out = ['ok' => true, 'type' => (string)$e['type'], 'locked' => attempt_locked('mfa', $pr['id'])];
    if ($e['type'] === 'question') $out['question'] = (string)($e['q'] ?? '');
    if ($e['type'] === 'email' && !$out['locked']) {
        $r = mfa_send_code($pr, 'signin');
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
    if (!mfa_check($id, $e, trim((string)($p['answer'] ?? '')))) {
        $locked = attempt_fail('mfa', $id, MFA_FAIL_MAX, MFA_FAIL_LOCK);
        audit('mfa.fail', $id, $id, ['type' => $e['type'], 'locked' => $locked], (string)($p['ip'] ?? ''));
        if ($locked && $pr['kind'] === 'member') mfa_tell_staff_locked($pr);
        return ['ok' => false, 'error' => $locked ? 'too_many_attempts' : 'wrong_answer'];
    }
    attempt_reset('mfa', $id);
    audit('mfa.pass', $id, $id, ['type' => $e['type']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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
    mfa_del($pr['id'], 'mfa');
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
    $until = is_array($by) ? (int)($by['until'] ?? 0) : 0;
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
    if ($q !== '') { $from .= ' AND (lower(t.fullName) LIKE ? OR lower(' . explode(' ', $sel)[0] . ') LIKE ?)'; $args[] = '%' . $q . '%'; $args[] = '%' . $q . '%'; }
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
        'methods' => array_map(fn($ms) => array_map(fn($m) => ['id' => $m] + MFA_METHOD_INFO[$m], $ms), MFA_METHODS),
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
    if ($next === $cur) return ['ok' => true, 'policy' => $cur, 'unchanged' => true];
    setting_set('mfa_policy', $next, (string)$g['requester']['memberId']);
    audit('admin.mfa.policy', (string)$g['requester']['memberId'], 'mfa_policy', ['from' => $cur, 'to' => $next], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'policy' => $next];
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
    if (!in_array($action, ['bypass', 'reset', 'require', 'unrequire', 'remind'], true)) return ['ok' => false, 'error' => 'bad_action'];
    $people = is_array($p['people'] ?? null) ? array_values($p['people']) : [];
    if (!$people) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($people) > MFA_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . MFA_BULK_MAX . ' people at a time.', 'max' => MFA_BULK_MAX];
    if ($action === 'bypass' && count($people) > 1) return ['ok' => false, 'error' => 'one_at_a_time', 'detail' => 'Letting somebody in without their second step is for one person at the desk, not a list.'];
    $secs = MFA_BYPASS_DEFAULT;
    if ($action === 'bypass' && isset($p['minutes'])) {
        $m = (int)$p['minutes'];
        if ($m < 1 || $m * 60 > MFA_BYPASS_MAX) return ['ok' => false, 'error' => 'bad_minutes', 'detail' => 'Between 1 and ' . (MFA_BYPASS_MAX / 60) . ' minutes.'];
        $secs = $m * 60;
    }
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
                mfa_put($id, 'mfa.bypass', ['until' => time() + $secs, 'by' => $me]);
                attempt_reset('mfa', $id);
                $results[] = $res + ['ok' => true, 'until' => time() + $secs];
                break;
            case 'reset':
                if (!$e) { $results[] = $res + ['ok' => true, 'unchanged' => true]; break; }
                mfa_del($id, 'mfa'); mfa_del($id, 'mfa.pend'); attempt_reset('mfa', $id);
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
        'minutes' => $action === 'bypass' ? intdiv($secs, 60) : null,
    ], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'action' => $action, 'applied' => $done, 'results' => $results];
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
