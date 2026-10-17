<?php
declare(strict_types=1);

/**
 * Family accounts — a parent's or guardian's own sign-in, and the NGG members
 * they look after ("wards").
 *
 * The Anchor Circle (circle.php) already gives a guardian a read-only window
 * on ONE child through a device token. This is the account behind it: an
 * email address the guardian has proved they hold, several wards on one
 * dashboard, and the things a family actually needs to DO — tell the centre a
 * child will be away, appeal a charge, ask for a new card — rather than only
 * watch. Every family email is always on (FAMILY_NOTIFY_DEFAULT).
 *
 * Three rules, each closing a specific hole:
 *
 *  1. A guardian is not a member. Own table, own cookie (session.php), no
 *     capability. Every read of a ward goes through an ACTIVE link owned by
 *     the signed-in guardian, checked on the way in (family_link()).
 *  2. A ward is never linked on an email alone. `parentEmail` on a record was
 *     typed by somebody at registration; holding that inbox proves the inbox,
 *     not the relationship. So a record match only ASKS — staff with `people`
 *     at the child's centre approve it. The child's Anchor code plus their
 *     name (circle_match) is the child's own consent and links at once.
 *  3. The ward is told. A link made with a stolen code is a stranger watching
 *     a child; the mail to the child is what makes that visible.
 *
 * What a guardian can NOT see, by construction (the ops do not exist): the
 * member's journal, reflections, coach chats, notes, mentor messages, the
 * member's own requests (only those the guardian raised), and curriculum
 * answers.
 */

const FAMILY_WARDS_MAX = 8;
const FAMILY_RELATIONSHIPS = ['parent' => 'Parent', 'guardian' => 'Guardian', 'carer' => 'Carer', 'relative' => 'Relative'];
const FAMILY_NOTIFY_KEYS = ['checkin', 'weekly', 'alerts'];
/* Every family notification is part of membership and always on: check-in
 * and check-out, the weekly summary, and alerts. A guardian cannot switch one
 * off — a child's attendance and safety reaching home is not a preference.
 * Stored `guardian_wards.notify` values from before this rule are ignored,
 * not migrated; family_notify_prefs() is the one place that decides. */
const FAMILY_NOTIFY_DEFAULT = ['checkin' => true, 'weekly' => true, 'alerts' => true];
/* The requests a guardian may raise for a ward. Not `payment`: an offline
   payment claim needs a verified receipt, and that path is the member's. */
const FAMILY_REQUEST_KINDS = ['leave', 'appeal', 'idcard'];
const FAMILY_WEEKLY_BATCH = 40;

function family_email_norm(string $e): string {
    $e = strtolower(trim($e));
    return ($e !== '' && strlen($e) <= 190 && filter_var($e, FILTER_VALIDATE_EMAIL)) ? $e : '';
}

function family_origin(): string { return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'); }

function family_guardian_public(array $g): array {
    return ['guardianId' => (string)$g['guardianId'], 'email' => (string)$g['email'], 'fullName' => (string)($g['fullName'] ?? ''),
            'phone' => (string)($g['phone'] ?? ''), 'createdAt' => (string)($g['createdAt'] ?? '')];
}

function family_notify_prefs(?string $json): array {
    return FAMILY_NOTIFY_DEFAULT;   // always on; see FAMILY_NOTIFY_DEFAULT
}

function family_link_public(array $l, ?array $m = null): array {
    $out = ['linkId' => (string)$l['linkId'], 'memberId' => (string)$l['memberId'], 'status' => (string)$l['status'],
            'relationship' => (string)$l['relationship'], 'relationshipLabel' => FAMILY_RELATIONSHIPS[(string)$l['relationship']] ?? 'Parent',
            'via' => (string)$l['via'], 'notify' => family_notify_prefs($l['notify'] ?? ''), 'note' => (string)($l['note'] ?? ''),
            'createdAt' => (string)$l['createdAt'], 'decidedAt' => (string)($l['decidedAt'] ?? '')];
    if ($m) $out += ['fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                     'centre' => (string)($m['centre'] ?? ''), 'photoUrl' => (string)($m['photoUrl'] ?? '')];
    return $out;
}

/** The guardian's own active link to a ward, or null. The one gate every ward read passes. */
function family_link(string $gid, string $linkId): ?array {
    if ($gid === '' || $linkId === '') return null;
    return db_row("SELECT * FROM guardian_wards WHERE linkId = ? AND guardianId = ? AND status = 'active' LIMIT 1", [$linkId, $gid]) ?: null;
}

function family_mail(string $to, string $subject, array $tpl): void {
    if (family_email_norm($to) === '' || !function_exists('send_mail') || !function_exists('email_template')) return;
    @send_mail($to, $subject, email_template($tpl + ['eyebrow' => 'NGG · Family account']));
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

/**
 * family.request — email a sign-in code. Answers the same whether or not an
 * account exists: one is made on the first verified sign-in, so there is
 * nothing to enumerate, but the answer stays uniform all the same.
 */
function family_request(array $p): array {
    $email = family_email_norm((string)($p['email'] ?? ''));
    if ($email === '') return ['ok' => false, 'error' => 'bad_email'];
    $g = db_row('SELECT status FROM guardians WHERE email = ? LIMIT 1', [$email]);
    if ($g && (string)$g['status'] !== 'active') return ['ok' => true, 'masked' => mask_email($email), 'delivery' => true];
    $token = rand_hex(32); $otp = new_otp(); $now = time();
    db_insert('auth_sessions', [
        'token' => $token, 'memberId' => '', 'email' => $email, 'otp' => $otp, 'attempts' => 0, 'purpose' => 'family_login',
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z', $now), 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $now + 15 * 60),
        'verifiedAt' => '', 'ip' => (string)($p['ip'] ?? ''), 'userAgent' => substr((string)($p['userAgent'] ?? ''), 0, 255),
    ]);
    $html = email_template([
        'eyebrow' => 'NGG · Family account', 'title' => 'Sign in to your family account',
        'intro' => 'Tap the button to sign in — or type the code below. Both are good for 15 minutes.',
        'ctaLabel' => 'Sign in', 'ctaUrl' => family_origin() . '/family?fsignin=' . rawurlencode($token), 'otp' => $otp,
        'footNote' => 'Somebody asked to sign in to an NGG family account with this address. If it was not you, ignore this email.',
    ]);
    $ok = function_exists('send_mail') ? send_mail($email, 'Your NGG family account sign-in', $html) : false;
    audit($ok ? 'family.login.request' : 'family.login.mail_fail', null, mask_email($email), [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'masked' => mask_email($email), 'delivery' => (bool)$ok];
}

/**
 * family.verify — a magic-link token, or email + code. Creates the account on
 * the first success. Guessing is bounded twice: five tries per code (claimed
 * with a relative increment, so concurrent guesses cannot all read "0"), and
 * a lock on the ADDRESS, because re-requesting codes resets the first.
 */
function family_verify(array $p): array {
    $ip = (string)($p['ip'] ?? '');
    $token = trim((string)($p['token'] ?? ''));
    $email = family_email_norm((string)($p['email'] ?? ''));
    $otp = preg_replace('/\D/', '', (string)($p['otp'] ?? ''));
    if ($token !== '') {
        $ch = db_row("SELECT * FROM auth_sessions WHERE token = ? AND purpose = 'family_login' LIMIT 1", [$token]);
        if (!$ch) return ['ok' => false, 'error' => 'invalid'];
    } elseif ($email !== '' && strlen($otp) === 6) {
        if (attempt_locked('family.otp', $email)) return ['ok' => false, 'error' => 'too_many_attempts'];
        $ch = db_row("SELECT * FROM auth_sessions WHERE email = ? AND purpose = 'family_login' AND (verifiedAt = '' OR verifiedAt IS NULL) ORDER BY id DESC LIMIT 1", [$email]);
        if (!$ch) { attempt_fail('family.otp', $email, 10, 900); return ['ok' => false, 'error' => 'invalid']; }
        if (!db_exec('UPDATE auth_sessions SET attempts = attempts + 1 WHERE id = ? AND attempts < 5', [(int)$ch['id']])) {
            return ['ok' => false, 'error' => 'too_many_attempts'];
        }
        if (!hash_equals((string)$ch['otp'], $otp)) {
            if (attempt_fail('family.otp', $email, 10, 900)) audit('family.login.lockout', null, mask_email($email), [], $ip);
            return ['ok' => false, 'error' => 'invalid'];
        }
    } else {
        return ['ok' => false, 'error' => 'missing_credentials'];
    }
    if (strtotime((string)$ch['expiresAt']) < time()) return ['ok' => false, 'error' => 'expired'];
    if (!empty($ch['verifiedAt'])) return ['ok' => false, 'error' => 'already_used'];
    if (!db_exec("UPDATE auth_sessions SET verifiedAt = ? WHERE id = ? AND (verifiedAt = '' OR verifiedAt IS NULL)", [now_iso(), (int)$ch['id']])) {
        return ['ok' => false, 'error' => 'already_used'];
    }
    $email = (string)$ch['email'];
    attempt_reset('family.otp', $email);
    $g = db_row('SELECT * FROM guardians WHERE email = ? LIMIT 1', [$email]);
    if ($g && (string)$g['status'] !== 'active') return ['ok' => false, 'error' => 'suspended'];
    if (!$g) {
        try {
            db_insert('guardians', ['guardianId' => 'GDN-' . strtoupper(rand_hex(5)), 'email' => $email, 'status' => 'active', 'sessionEpoch' => 1,
                                    'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'lastSeenAt' => now_iso()]);
        } catch (\Throwable $e) { /* a double tap made it first */ }
        $g = db_row('SELECT * FROM guardians WHERE email = ? LIMIT 1', [$email]);
        audit('family.account.create', (string)$g['guardianId'], (string)$g['guardianId'], [], $ip);
    }
    audit('family.login', (string)$g['guardianId'], (string)$g['guardianId'], [], $ip);
    return ['ok' => true, 'guardian' => $g,
            'mfa' => function_exists('mfa_need') ? mfa_need((string)$g['guardianId'], 'guardian', ['email']) : ''];
}

/** family.signout_all — end every session this account holds. */
function family_signout_all(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    db_exec('UPDATE guardians SET sessionEpoch = sessionEpoch + 1, updatedAt = ? WHERE guardianId = ?', [now_iso(), $gid]);
    audit('family.signout_all', $gid, $gid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── The account ─────────────────────────────────────────────────────────────

/**
 * family.me — the guardian, their wards (active and pending), and the NGG
 * records that name this address as the parent's but are not linked yet. Those
 * are shown by first name and centre only, and can only be ASKED for.
 */
function family_me(array $p): array {
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)($p['guardianId'] ?? '')]);
    if (!$g) return ['ok' => false, 'error' => 'not_found'];
    $links = db_all("SELECT w.*, m.fullName, m.displayId, m.centre, m.photoUrl FROM guardian_wards w JOIN members m ON m.memberId = w.memberId
                      WHERE w.guardianId = ? AND w.status IN ('active','pending','refused') ORDER BY w.status, m.fullName", [(string)$g['guardianId']]);
    $linked = array_flip(array_map(static fn($l) => (string)$l['memberId'], array_filter($links, static fn($l) => $l['status'] !== 'refused')));
    $suggest = [];
    foreach (db_all("SELECT memberId, fullName, centre, type FROM members WHERE lower(parentEmail) = ? AND status = 'active' LIMIT 20", [(string)$g['email']]) as $m) {
        if (!member_is_ngg($m) || isset($linked[(string)$m['memberId']])) continue;
        $suggest[] = ['memberId' => (string)$m['memberId'], 'firstName' => explode(' ', trim((string)$m['fullName']))[0] ?? '', 'centre' => (string)$m['centre']];
    }
    return ['ok' => true, 'guardian' => family_guardian_public($g),
            'wards' => array_map(static fn($l) => family_link_public($l, $l), $links),
            'suggestions' => $suggest, 'relationships' => FAMILY_RELATIONSHIPS, 'max' => FAMILY_WARDS_MAX];
}

/** family.profile — the guardian's own name and phone. The email IS the sign-in, so it is not editable here. */
function family_profile(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $name = trim(preg_replace('/\s+/', ' ', (string)($p['fullName'] ?? '')));
    $phone = trim((string)($p['phone'] ?? ''));
    if (mb_strlen($name) > 120) return ['ok' => false, 'error' => 'name_too_long'];
    if ($phone !== '' && !preg_match('/^[+0-9 ()-]{7,24}$/', $phone)) return ['ok' => false, 'error' => 'bad_phone'];
    db_update('guardians', ['fullName' => $name, 'phone' => $phone, 'updatedAt' => now_iso()], ['guardianId' => $gid]);
    return family_me(['guardianId' => $gid]);
}

/**
 * family.ward.add — two ways in.
 *   code:   the child's Anchor code + a part of their name. The child gave the
 *           code, so the link is active at once, and the child is told.
 *   record: an NGG record that names this account's address as the parent's.
 *           Pending until staff with `people` at the child's centre approve.
 */
function family_ward_add(array $p): array {
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)($p['guardianId'] ?? '')]);
    if (!$g) return ['ok' => false, 'error' => 'not_found'];
    $gid = (string)$g['guardianId'];
    $rel = (string)($p['relationship'] ?? 'parent');
    if (!isset(FAMILY_RELATIONSHIPS[$rel])) $rel = 'parent';
    $held = (int)db_row("SELECT COUNT(*) c FROM guardian_wards WHERE guardianId = ? AND status IN ('active','pending')", [$gid])['c'];
    if ($held >= FAMILY_WARDS_MAX) return ['ok' => false, 'error' => 'too_many_wards', 'detail' => 'A family account holds up to ' . FAMILY_WARDS_MAX . ' members.'];
    $ip = (string)($p['ip'] ?? '');
    $method = (string)($p['method'] ?? 'code');

    if ($method === 'record') {
        $m = db_row("SELECT * FROM members WHERE memberId = ? AND lower(parentEmail) = ? AND status = 'active' LIMIT 1",
                    [(string)($p['memberId'] ?? ''), (string)$g['email']]);
        if (!$m || !member_is_ngg($m)) return ['ok' => false, 'error' => 'not_found'];
        $status = 'pending';
    } else {
        $code = (string)($p['code'] ?? '');
        if ($blocked = circle_guess_guard($code)) return $blocked;
        $hit = circle_match($code, (string)($p['name'] ?? ''));
        if (!$hit) { circle_guess_failed($code, $ip); return ['ok' => false, 'error' => 'not_found']; }
        attempt_reset('circle.code', preg_replace('/\D/', '', $code));
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$hit['memberId']]);
        if (!$m || !member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg_member'];
        if ((string)$m['status'] !== 'active') return ['ok' => false, 'error' => 'member_inactive'];
        $status = 'active'; $method = 'code';
    }

    $mid = (string)$m['memberId'];
    $existing = db_row("SELECT * FROM guardian_wards WHERE guardianId = ? AND memberId = ? AND status IN ('active','pending') LIMIT 1", [$gid, $mid]);
    if ($existing) return ['ok' => false, 'error' => 'already_linked', 'link' => family_link_public($existing, $m)];
    $row = ['linkId' => 'GW-' . strtoupper(rand_hex(6)), 'guardianId' => $gid, 'memberId' => $mid, 'relationship' => $rel,
            'status' => $status, 'via' => $method, 'notify' => json_encode(FAMILY_NOTIFY_DEFAULT),
            'createdAt' => now_iso(), 'updatedAt' => now_iso()];
    if ($status === 'active') { $row['decidedBy'] = 'code'; $row['decidedAt'] = now_iso(); }
    db_insert('guardian_wards', $row);
    audit('family.ward.' . ($status === 'active' ? 'link' : 'ask'), $gid, $row['linkId'], ['memberId' => $mid, 'via' => $method], $ip);

    $who = trim((string)$g['fullName']) !== '' ? (string)$g['fullName'] : mask_email((string)$g['email']);
    if ($status === 'active') {
        family_tell_ward($m, $who, $rel);
    } else {
        $centre = (string)($m['centre'] ?? '');
        notify_people(staff_with_cap('people', [], static fn($s) => admin_centre_allowed($s, $centre)), [
            'kind' => 'approval', 'title' => 'A family account is asking to connect',
            'intro' => $who . ' asked to connect to ' . (string)$m['fullName'] . ' as their ' . strtolower(FAMILY_RELATIONSHIPS[$rel]) . '.',
            'body' => 'Their address matches the parent email on ' . (string)$m['fullName'] . "'s record. Confirm the relationship before approving.\n\nDecide it in Control Room → People → Families.",
            'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=families', 'ctaLabel' => 'Review it →']);
    }
    return ['ok' => true, 'link' => family_link_public($row, $m)];
}

/** Tell a member that a family account now follows their record. */
function family_tell_ward(array $m, string $who, string $rel): void {
    notify_people([$m], ['kind' => 'account', 'eyebrow' => 'NGG · Your account',
        'title' => 'A family account is connected to you',
        'intro' => $who . ' is now connected to your NGG record as your ' . strtolower(FAMILY_RELATIONSHIPS[$rel] ?? 'parent') . '.',
        'body' => "They can see your attendance, conduct, fees, lesson progress and your weekly check-in. They cannot read your journal, reflections, coach chats or messages.\n\nIf you do not know who this is, tell the Club desk straight away.",
        'linkPage' => 'dashboard', 'ctaPath' => '/dashboard', 'ctaLabel' => 'Open my dashboard →']);
}

/** family.ward.remove — the guardian lets go of a link (active or still pending). */
function family_ward_remove(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $n = db_exec("UPDATE guardian_wards SET status = 'removed', updatedAt = ? WHERE linkId = ? AND guardianId = ? AND status IN ('active','pending','refused')",
                 [now_iso(), (string)($p['linkId'] ?? ''), $gid]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('family.ward.remove', $gid, (string)$p['linkId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** family.ward.notify — which mails arrive for this ward. */
function family_ward_notify(array $p): array {
    $l = family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? ''));
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    // Kept so an older page does not error; nothing is written, and the answer is that all are on.
    return ['ok' => true, 'notify' => FAMILY_NOTIFY_DEFAULT, 'required' => true, 'unchanged' => true];
}

// ── One ward ────────────────────────────────────────────────────────────────

/**
 * family.ward — everything a guardian may see about one ward, from the same
 * functions the member's own dashboard reads, so the two cannot disagree.
 * Read-only: nothing here starts a lesson or writes an assessment.
 */
function family_ward(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $l = family_link($gid, (string)($p['linkId'] ?? ''));
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $mid = (string)$m['memberId'];
    $today = attendance_today();

    $t = db_row('SELECT checkInAt, checkOutAt, status, lateMinutes FROM attendance WHERE studentId = ? AND date = ? LIMIT 1', [$mid, $today]);
    $rec = member_records(['memberId' => $mid]);
    $att = $rec['attendance'] ?? [];
    $late = db_all("SELECT date, lateMinutes FROM attendance WHERE studentId = ? AND status IN ('late','tardy') ORDER BY date DESC LIMIT 5", [$mid]);

    $conduct = member_compliance(['memberId' => $mid]);
    $fees = function_exists('member_fees_account') ? member_fees_account(['memberId' => $mid]) : ['enabled' => false];
    $acct = $fees['account'] ?? null;

    $learn = function_exists('curriculum_for_member') ? curriculum_for_member($m) : ['units' => [], 'total' => 0, 'completed' => 0, 'overdue' => 0, 'pct' => 0];
    $next = array_values(array_filter($learn['units'], static fn($u) => !($u['progress'] && $u['progress']['status'] === 'completed')));
    usort($next, static fn($a, $b) => [(int)!$a['overdueDays'], (string)$a['dueDate'] ?: '9999'] <=> [(int)!$b['overdueDays'], (string)$b['dueDate'] ?: '9999']);

    $comp = db_row('SELECT * FROM member_assessments WHERE memberId = ? ORDER BY period DESC LIMIT 1', [$mid]);
    $reqs = db_all('SELECT * FROM member_requests WHERE memberId = ? AND raisedBy = ? ORDER BY id DESC LIMIT 10', [$mid, 'guardian:' . $gid]);

    return ['ok' => true, 'link' => family_link_public($l, $m),
        'member' => ['fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
                     'track' => (string)($m['track'] ?? ''), 'level' => (string)($m['level'] ?? ''), 'status' => (string)$m['status'],
                     'joinDate' => (string)($m['joinDate'] ?? ''), 'photoUrl' => (string)($m['photoUrl'] ?? '')],
        'today' => ['date' => $today, 'in' => $t ? substr((string)$t['checkInAt'], 11, 5) : '', 'out' => $t ? substr((string)($t['checkOutAt'] ?? ''), 11, 5) : '',
                    'status' => $t ? (string)($t['status'] ?: 'present') : '', 'lateMinutes' => $t ? (int)$t['lateMinutes'] : 0],
        'attendance' => ['present' => (int)($att['present'] ?? 0), 'daysRan' => (int)($att['daysRan'] ?? 0), 'rate' => $att['rate'] ?? null,
                         'rateKnown' => !empty($att['rateKnown']), 'recent' => array_slice($att['days'] ?? [], 0, 14),
                         'late' => array_map(static fn($r) => ['date' => (string)$r['date'], 'minutes' => (int)$r['lateMinutes']], $late)],
        'conduct' => ['enabled' => !empty($conduct['enabled']), 'state' => (string)($conduct['state'] ?? ''), 'until' => (string)($conduct['until'] ?? ''),
                      'reason' => (string)($conduct['reason'] ?? ''), 'finesOwed' => (int)($conduct['finesOwed'] ?? 0),
                      'fines' => array_slice($conduct['fines'] ?? [], 0, 6)],
        'fees' => $acct ? ['enabled' => true, 'outstanding' => (int)$acct['outstanding'], 'payable' => (int)$acct['payable'],
                           'currency' => (string)($acct['currency'] ?? ''),
                           'outstandingText' => fees_money_text((int)$acct['outstanding']), 'payableText' => fees_money_text((int)$acct['payable']),
                           'recent' => array_slice($acct['entries'] ?? [], 0, 6), 'payOnline' => !empty($acct['payOnline'])]
                        : ['enabled' => false],
        'learning' => ['total' => (int)$learn['total'], 'completed' => (int)$learn['completed'], 'overdue' => (int)$learn['overdue'], 'pct' => (int)$learn['pct'],
                       'next' => array_map(static fn($u) => ['title' => (string)$u['title'], 'course' => (string)$u['course'], 'week' => (int)$u['week'],
                           'dueDate' => (string)$u['dueDate'], 'overdueDays' => (int)$u['overdueDays'],
                           'status' => $u['progress'] ? (string)$u['progress']['status'] : 'not_started'], array_slice($next, 0, 5))],
        'timetable' => function_exists('tt_for_centre') ? tt_for_centre((string)($m['centre'] ?? ''), true, (string)($m['track'] ?? '')) : null,
        'companion' => function_exists('companion_public') ? companion_public($comp ?: null) : null,
        'requests' => array_map('member_request_public', $reqs),
        'kinds' => array_combine(FAMILY_REQUEST_KINDS, array_map(static fn($k) => MEMBER_REQUEST_KINDS[$k], FAMILY_REQUEST_KINDS)),  // leave first: the commonest thing a parent tells the desk
        'charges' => array_map(static fn($e) => ['entryId' => (string)$e['entryId'], 'note' => (string)$e['note'], 'amount' => (int)$e['amount'], 'createdAt' => (string)$e['createdAt']],
            db_all("SELECT entryId, note, amount, createdAt FROM member_ledger WHERE memberId = ? AND direction = 'debit' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY id DESC LIMIT 10", [$mid])),
    ];
}

/**
 * family.request.create — a guardian tells the desk something about a ward:
 * an absence, an appeal, a lost card. It IS a member request (the desk has one
 * queue, one set of guards, one decision path) marked with who raised it.
 */
function family_request_create(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $l = family_link($gid, (string)($p['linkId'] ?? ''));
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $kind = (string)($p['kind'] ?? '');
    if (!in_array($kind, FAMILY_REQUEST_KINDS, true)) return ['ok' => false, 'error' => 'unknown_kind'];
    $g = db_row('SELECT fullName, email FROM guardians WHERE guardianId = ? LIMIT 1', [$gid]);
    return member_request_create([
        'memberId' => (string)$l['memberId'], 'kind' => $kind,
        'subject' => (string)($p['subject'] ?? ''), 'body' => (string)($p['body'] ?? ''),
        'fromDate' => (string)($p['fromDate'] ?? ''), 'toDate' => (string)($p['toDate'] ?? ''),
        'refEntryId' => (string)($p['refEntryId'] ?? ''), 'ip' => (string)($p['ip'] ?? ''),
        'raisedBy' => 'guardian:' . $gid,
        'raisedByName' => trim((string)($g['fullName'] ?? '')) !== '' ? (string)$g['fullName'] : 'A parent (' . mask_email((string)($g['email'] ?? '')) . ')',
    ]);
}

/** family.request.withdraw — only one this guardian raised, only while open. */
function family_request_withdraw(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $n = db_exec("UPDATE member_requests SET status = 'withdrawn', updatedAt = ? WHERE requestId = ? AND raisedBy = ? AND status = 'open'",
                 [now_iso(), (string)($p['requestId'] ?? ''), 'guardian:' . $gid]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('family.request.withdraw', $gid, (string)$p['requestId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Mail hooks ──────────────────────────────────────────────────────────────

/** Addresses of guardians actively linked to a member who opted in to `$pref`. */
function family_guardian_emails(string $memberId, string $pref): array {
    if (!in_array($pref, FAMILY_NOTIFY_KEYS, true)) return [];
    $out = [];
    foreach (db_all("SELECT g.email, w.notify FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                      WHERE w.memberId = ? AND w.status = 'active' AND g.status = 'active'", [$memberId]) as $r) {
        if (!empty(family_notify_prefs($r['notify'] ?? '')[$pref]) && family_email_norm((string)$r['email']) !== '') $out[] = strtolower((string)$r['email']);
    }
    return array_values(array_unique($out));
}

/** A fine was issued — tell the guardians who asked for alerts. Called from policy_issue(). */
function family_alert_fine(string $memberId, int $amount, string $reason): void {
    $to = family_guardian_emails($memberId, 'alerts');
    if (!$to) return;
    $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m) return;
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'Your ward';
    $amt = function_exists('fees_money_text') ? fees_money_text($amount) : (string)$amount;
    foreach ($to as $addr) family_mail($addr, "A fine for {$first}: {$amt}", [
        'title' => 'A fine was issued', 'intro' => "{$first} was fined {$amt}.",
        'bodyHtml' => '<p style="margin:0 0 10px">' . esc_html($reason !== '' ? $reason : 'Under the programme policy.') . '</p>'
            . '<p style="margin:0 0 10px">If you think it is wrong, you can appeal it from your family account.</p>',
        'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family',
        'footNote' => 'You get this because fines and alerts are on for this member in your family account.',
    ]);
}

/** One ward's last week, in numbers — the body of the weekly mail. */
function family_week_summary(array $m, string $from, string $to): array {
    $mid = (string)$m['memberId'];
    $cal = function_exists('member_calendar_for') ? member_calendar_for($m) : ['enabled' => false];
    $days = !empty($cal['enabled']) ? programme_days_between($from, $to, $cal) : [];
    $scans = db_all('SELECT date, status FROM attendance WHERE studentId = ? AND date BETWEEN ? AND ?', [$mid, $from, $to]);
    $flip = array_flip($days);
    $present = count(array_filter($scans, static fn($s) => isset($flip[(string)$s['date']])));
    $late = count(array_filter($scans, static fn($s) => in_array((string)$s['status'], ['late', 'tardy'], true)));
    $fines = db_row("SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM sanctions WHERE personId = ? AND kind = 'fine' AND status IN ('active','pending') AND substr(issuedAt,1,10) BETWEEN ? AND ?", [$mid, $from, $to]);
    $learn = function_exists('curriculum_for_member') ? curriculum_for_member($m) : ['overdue' => 0, 'completed' => 0, 'total' => 0];
    $comp = db_row('SELECT rating, summary FROM member_assessments WHERE memberId = ? ORDER BY period DESC LIMIT 1', [$mid]);
    return ['days' => count($days), 'present' => $present, 'late' => $late, 'fines' => (int)$fines['c'], 'finesAmount' => (int)$fines['s'],
            'overdue' => (int)$learn['overdue'], 'completed' => (int)$learn['completed'], 'total' => (int)$learn['total'],
            'rating' => (string)($comp['rating'] ?? ''), 'summary' => (string)($comp['summary'] ?? '')];
}

/**
 * The Monday family mail — one per guardian per week, covering every ward they
 * asked it for. Claimed per guardian BEFORE sending (weeklySentFor), so two
 * cron ticks cannot both mail the same family.
 */
function family_weekly_run(?string $today = null, int $limit = FAMILY_WEEKLY_BATCH): array {
    $today = $today ?? attendance_today();
    $t = strtotime($today . ' 00:00:00 UTC');
    $monday = gmdate('Y-m-d', $t - ((int)gmdate('N', $t) - 1) * 86400);
    $from = gmdate('Y-m-d', strtotime($monday . ' -7 days')); $to = gmdate('Y-m-d', strtotime($monday . ' -1 day'));
    $rows = db_all("SELECT DISTINCT g.* FROM guardians g JOIN guardian_wards w ON w.guardianId = g.guardianId AND w.status = 'active'
                     WHERE g.status = 'active' AND COALESCE(g.weeklySentFor,'') <> ? ORDER BY g.id LIMIT " . max(1, $limit), [$monday]);
    $sent = 0;
    foreach ($rows as $g) {
        if (!db_exec("UPDATE guardians SET weeklySentFor = ? WHERE id = ? AND COALESCE(weeklySentFor,'') <> ?", [$monday, (int)$g['id'], $monday])) continue;
        $parts = [];
        foreach (db_all("SELECT w.notify, m.* FROM guardian_wards w JOIN members m ON m.memberId = w.memberId WHERE w.guardianId = ? AND w.status = 'active'", [(string)$g['guardianId']]) as $m) {
            if (empty(family_notify_prefs($m['notify'] ?? '')['weekly'])) continue;
            $s = family_week_summary($m, $from, $to);
            $first = esc_html(explode(' ', trim((string)$m['fullName']))[0] ?: 'Your ward');
            $lines = [];
            $lines[] = $s['days'] > 0 ? "Attended <b>{$s['present']} of {$s['days']}</b> programme day" . ($s['days'] === 1 ? '' : 's') : 'No programme days last week.';
            if ($s['late']) $lines[] = "Late <b>{$s['late']}</b> time" . ($s['late'] === 1 ? '' : 's');
            if ($s['fines']) $lines[] = "<b>{$s['fines']}</b> new fine" . ($s['fines'] === 1 ? '' : 's') . ' (' . esc_html(fees_money_text($s['finesAmount'])) . ')';
            if ($s['total']) $lines[] = "Lessons: <b>{$s['completed']} of {$s['total']}</b> done" . ($s['overdue'] ? ", <b>{$s['overdue']}</b> overdue" : '');
            $rating = ['on_track' => 'On track', 'watch' => 'Worth watching', 'at_risk' => 'Needs support'][$s['rating']] ?? '';
            $parts[] = '<h3 style="margin:18px 0 6px;font-size:16px">' . $first . ($rating !== '' ? ' · ' . esc_html($rating) : '') . '</h3>'
                . '<ul style="margin:0 0 6px;padding-left:18px">' . implode('', array_map(static fn($x) => "<li>{$x}</li>", $lines)) . '</ul>'
                . ($s['summary'] !== '' ? '<p style="margin:0 0 6px;color:#555">' . esc_html(mb_substr($s['summary'], 0, 400)) . '</p>' : '');
        }
        if (!$parts) continue;
        family_mail((string)$g['email'], 'Your family\'s week at NGG', [
            'title' => 'The week at NGG', 'intro' => 'Here is last week (' . $from . ' to ' . $to . ') for the members you follow.',
            'bodyHtml' => implode('', $parts), 'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family',
            'footNote' => 'Family emails are part of membership and always on. Questions? Reply to this email.',
        ]);
        $sent++;
    }
    return ['sent' => $sent, 'period' => $monday];
}

// ── Staff ───────────────────────────────────────────────────────────────────

/** admin.families.list — links by status, scoped to the requester's centres. */
function admin_families_list(array $p): array {
    $gate = admin_cap_gate($p, 'people'); if (!$gate['ok']) return $gate;
    $status = (string)($p['status'] ?? 'pending');
    if (!in_array($status, ['pending', 'active', 'revoked', 'refused', 'removed'], true)) $status = 'pending';
    $scope = admin_centre_names_in_scope($gate['requester']);
    $where = 'w.status = ?'; $args = [$status];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'rows' => [], 'counts' => ['pending' => 0, 'active' => 0], 'scoped' => true];
        $where .= ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    $q = trim((string)($p['q'] ?? ''));
    $qArgs = [];
    $qSql = '';
    if ($q !== '') { $qSql = ' AND (m.fullName LIKE ? OR g.email LIKE ? OR g.fullName LIKE ?)'; $like = '%' . str_replace(['%', '_'], '', $q) . '%'; $qArgs = [$like, $like, $like]; }
    $rows = db_all("SELECT w.*, m.fullName mFullName, m.displayId, m.centre, m.parentEmail, m.parentName, g.email, g.fullName gFullName, g.phone
                      FROM guardian_wards w JOIN members m ON m.memberId = w.memberId JOIN guardians g ON g.guardianId = w.guardianId
                     WHERE $where$qSql ORDER BY w.id DESC LIMIT 300", array_merge($args, $qArgs));
    $countWhere = $scope !== null ? ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')' : '';
    $counts = array_map('intval', array_column(db_all("SELECT w.status, COUNT(*) n FROM guardian_wards w JOIN members m ON m.memberId = w.memberId WHERE 1=1$countWhere GROUP BY w.status", $scope ?? []), 'n', 'status'));
    return ['ok' => true, 'scoped' => $scope !== null, 'counts' => $counts + ['pending' => 0, 'active' => 0],
        'rows' => array_map(static fn($r) => family_link_public($r) + [
            'fullName' => (string)$r['mFullName'], 'displayId' => (string)$r['displayId'], 'centre' => (string)$r['centre'],
            'recordParentEmail' => (string)($r['parentEmail'] ?? ''), 'recordParentName' => (string)($r['parentName'] ?? ''),
            'guardianId' => (string)$r['guardianId'], 'guardianEmail' => (string)$r['email'], 'guardianName' => (string)$r['gFullName'], 'guardianPhone' => (string)$r['phone'],
            'decidedBy' => (string)$r['decidedBy']], $rows)];
}

/**
 * admin.families.decide — approve or refuse pending links, or revoke active
 * ones. One op, per-row verdicts, scope per row, one audit event per run.
 */
function admin_families_decide(array $p): array {
    $gate = admin_cap_gate($p, 'people'); if (!$gate['ok']) return $gate;
    $req = $gate['requester'];
    $action = (string)($p['action'] ?? '');
    if (!in_array($action, ['approve', 'refuse', 'revoke'], true)) return ['ok' => false, 'error' => 'bad_action'];
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['linkIds'] ?? null) ? $p['linkIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'no_ids'];
    if (count($ids) > MEMBERS_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . MEMBERS_BULK_MAX . ' at a time.'];
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 400));
    if ($action !== 'approve' && $note === '') return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Say why — the family is told.'];
    $from = $action === 'revoke' ? 'active' : 'pending';
    $to = ['approve' => 'active', 'refuse' => 'refused', 'revoke' => 'revoked'][$action];
    $by = (string)($req['memberId'] ?? '');
    $results = []; $done = 0;
    foreach ($ids as $id) {
        $l = db_row('SELECT w.*, m.fullName, m.centre, m.email mEmail, g.email gEmail, g.fullName gName FROM guardian_wards w
                       JOIN members m ON m.memberId = w.memberId JOIN guardians g ON g.guardianId = w.guardianId WHERE w.linkId = ? LIMIT 1', [$id]);
        if (!$l) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!admin_centre_allowed($req, (string)$l['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if ((string)$l['status'] !== $from) { $results[] = ['id' => $id, 'ok' => false, 'error' => (string)$l['status'] === $to ? 'unchanged' : 'wrong_state']; continue; }
        db_update('guardian_wards', ['status' => $to, 'note' => $note, 'decidedBy' => $by, 'decidedAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$l['id']]);
        $first = explode(' ', trim((string)$l['fullName']))[0] ?: 'the member';
        if ($action === 'approve') {
            family_mail((string)$l['gEmail'], "You are connected to {$first}", ['title' => 'Connection approved',
                'intro' => "The NGG desk confirmed you as {$first}'s " . strtolower(FAMILY_RELATIONSHIPS[(string)$l['relationship']] ?? 'parent') . '.',
                'bodyHtml' => '<p style="margin:0 0 10px">Their attendance, conduct, fees and progress are now on your family account.</p>',
                'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family']);
            $mrow = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
            if ($mrow) family_tell_ward($mrow, trim((string)$l['gName']) !== '' ? (string)$l['gName'] : mask_email((string)$l['gEmail']), (string)$l['relationship']);
        } else {
            family_mail((string)$l['gEmail'], $action === 'refuse' ? 'Your connection request was not approved' : "Your connection to {$first} has ended", [
                'title' => $action === 'refuse' ? 'Not approved' : 'Connection ended',
                'intro' => $action === 'refuse' ? "The NGG desk could not confirm your connection to {$first}." : "The NGG desk ended your family account's connection to {$first}.",
                'bodyHtml' => '<p style="margin:0 0 10px">' . esc_html($note) . '</p><p style="margin:0">If this is a mistake, contact the centre.</p>',
                'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family']);
        }
        $results[] = ['id' => $id, 'ok' => true]; $done++;
    }
    $refused = array_values(array_filter($results, static fn($r) => !$r['ok']));
    audit('family.links.' . $action, $by, (string)$done, ['count' => $done, 'refused' => array_map(static fn($r) => $r['id'] . ':' . $r['error'], $refused)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'done' => $done, 'results' => $results];
}

/** Guardians linked to a member — shown on the member's own Circle screen, so a link is never invisible to the child. */
function family_links_for_member(string $memberId): array {
    return array_map(static fn($r) => ['name' => trim((string)$r['fullName']) !== '' ? (string)$r['fullName'] : mask_email((string)$r['email']),
            'relationship' => FAMILY_RELATIONSHIPS[(string)$r['relationship']] ?? 'Parent', 'since' => (string)$r['decidedAt']],
        db_all("SELECT g.fullName, g.email, w.relationship, w.decidedAt FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                 WHERE w.memberId = ? AND w.status = 'active' ORDER BY w.id", [$memberId]));
}
