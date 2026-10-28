<?php
declare(strict_types=1);

/**
 * Anchor — the week a member's circle of adults can see and support: the
 * systems they held each day, how many days they reflected, their streak, and
 * the days an adult confirmed their conduct. Not their words: a parent never
 * sees those, and a mentor reads them in the journal (member.mentor.journal).
 *
 * Who is in a member's circle (2026-10-28; it used to be a no-account portal
 * at /circle, paired with a code and kept in a browser token):
 *   - their PARENTS, through the family account's own link (guardian_wards);
 *   - their MENTORS, connected by being assigned: the mentor portal shows it
 *     for every child in the mentor's caseload, with no code.
 * The member's six-digit code (members.anchorCode) is what a parent types,
 * with the child's name, to connect (circle_match).
 */

function circle_monday(): string {
    $t = time();
    $dow = (int)gmdate('N', $t); // 1=Mon..7=Sun
    return gmdate('Y-m-d', $t - ($dow - 1) * 86400);
}

/** Ensure the member has a unique 6-digit invite code; return it. */
function circle_ensure_code(string $memberId): string {
    $m = db_row('SELECT anchorCode FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if ($m && !empty($m['anchorCode'])) return (string)$m['anchorCode'];
    for ($i = 0; $i < 30; $i++) {
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        if (!db_row('SELECT id FROM members WHERE anchorCode = ?', [$code])) {
            db_update('members', ['anchorCode' => $code], ['memberId' => $memberId]);
            return $code;
        }
    }
    return '';
}

// ── Student stat helpers (read-only aggregates; never expose private text) ──
function circle_week_stats(string $memberId): array {
    $mon = circle_monday();
    $end = gmdate('Y-m-d', strtotime($mon) + 7 * 86400);
    // Systems held per day this week (from member_state systems:DATE JSON).
    $rows = db_all("SELECT stateKey, stateValue FROM member_state WHERE memberId = ? AND stateKey LIKE 'systems:%'", [$memberId]);
    $byDay = [];
    foreach ($rows as $r) {
        $date = substr((string)$r['stateKey'], 8);
        if ($date < $mon || $date >= $end) continue;
        $v = json_decode((string)$r['stateValue'], true);
        $held = 0;
        if (is_array($v)) foreach ($v as $k => $val) { if ($k !== 'mood' && $val === true) $held++; }
        $byDay[$date] = $held;
    }
    /* Out of however many systems there ARE.
     *
     * This used to divide by a hardcoded six while the journal scored against
     * the live, admin-editable list (SYSTEMS.length || 6). Trim a centre's list
     * to four and a child who held every one of them read 4/4 in their own
     * journal while the report their guardian receives showed 67% — and the
     * number that starts a conversation was the wrong one. The total travels
     * with the bars so nobody has to assume it. */
    $total = 6;
    if (function_exists('anchor_content')) {
        $c = anchor_content();
        if (is_array($c['systems'] ?? null) && count($c['systems']) > 0) $total = count($c['systems']);
    }
    $bars = []; $sum = 0; $cnt = 0;
    for ($i = 0; $i < 7; $i++) {
        $d = gmdate('Y-m-d', strtotime($mon) + $i * 86400);
        $held = $byDay[$d] ?? 0;
        $bars[] = ['date' => $d, 'held' => $held, 'pct' => (int)round(min(1, $held / $total) * 100)];
        if (isset($byDay[$d])) { $sum += $held; $cnt++; }
    }
    $avg = $cnt ? round($sum / $cnt, 1) : 0;
    return ['bars' => $bars, 'avgSystems' => $avg, 'systemsTotal' => $total];
}

function circle_streak(string $memberId): int {
    $rows = db_all('SELECT DISTINCT substr(createdAt,1,10) d FROM journal WHERE memberId = ? ORDER BY d DESC LIMIT 400', [$memberId]);
    $days = [];
    foreach ($rows as $r) $days[(string)$r['d']] = true;
    $n = 0; $t = time();
    if (!isset($days[gmdate('Y-m-d', $t)])) { $t -= 86400; if (!isset($days[gmdate('Y-m-d', $t)])) return 0; }
    while (isset($days[gmdate('Y-m-d', $t)])) { $n++; $t -= 86400; }
    return $n;
}

function circle_student_stats(string $memberId): array {
    $mon = circle_monday();
    $end = gmdate('Y-m-d', strtotime($mon) + 7 * 86400);
    $ws = circle_week_stats($memberId);
    $reflections = (int)(db_row("SELECT COUNT(DISTINCT substr(createdAt,1,10)) c FROM journal WHERE memberId = ? AND substr(createdAt,1,10) >= ? AND substr(createdAt,1,10) < ?", [$memberId, $mon, $end])['c'] ?? 0);
    // Conduct = share of the 7-day week confirmed by ANY guardian.
    $confirmed = (int)(db_row("SELECT COUNT(DISTINCT date) c FROM circle_confirmations WHERE memberId = ? AND date >= ? AND date < ?", [$memberId, $mon, $end])['c'] ?? 0);
    // Behavioural read (from the shared momentum engine) so the guardian sees the
    // same at-risk signal the member does — enabling a timely, gentle intervention.
    $m = momentum_signals($memberId);
    $atRisk = $m['streak'] === 0 || $m['consistency'] < 40 || $m['trend'] === 'dipping';
    return [
        'avgSystems' => $ws['avgSystems'], 'systemsTotal' => $ws['systemsTotal'], 'weekBars' => $ws['bars'],
        'reflections' => $reflections, 'streak' => $m['streak'],
        'conduct' => (int)round($confirmed / 7 * 100),
        'consistency' => $m['consistency'], 'trend' => $m['trend'],
        'longestStreak' => $m['longestStreak'], 'atRisk' => $atRisk,
    ];
}

/** A short, role-aware, non-judgmental action the guardian can take now. */
function circle_suggestion(string $role, array $stats): string {
    if (!($stats['atRisk'] ?? false)) {
        return "They're consistent right now — a specific word of praise reinforces it.";
    }
    switch ($role) {
        case 'mentor':  return "Momentum is dipping — a short check-in call this week can help them begin again.";
        default:        return "Reflection has slowed. Ask warmly about their study time today, without pressure.";
    }
}

// ── Member (student) side ────────────────────────────────────────────────────
/** member.circle — the member's code, who follows their Anchor, and what they wrote to them. */
function member_circle(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    if (!db_row('SELECT id FROM members WHERE memberId = ?', [$mid])) return ['ok' => false, 'error' => 'member_gone'];
    $code = circle_ensure_code($mid);
    $family = function_exists('family_links_for_member') ? family_links_for_member($mid) : [];
    $mentors = array_map(static fn($r) => ['name' => (string)$r['fullName'], 'relation' => 'Mentor', 'since' => (string)$r['startedAt']],
        db_all("SELECT m.fullName, a.startedAt FROM mentor_assignments a JOIN mentors m ON m.mentorId = a.mentorId WHERE a.memberId = ? AND a.status = 'active' ORDER BY a.id", [$mid]));
    $remarks = db_all("SELECT role, text, weekStart, createdAt FROM circle_remarks WHERE memberId = ? ORDER BY id DESC LIMIT 20", [$mid]);
    $family = array_map(static fn($f) => $f + ['relation' => $f['relationship']], $family);
    return ['ok' => true, 'code' => $code, 'connected' => array_merge(array_map(static fn($f) => ['name' => $f['name'], 'relation' => $f['relation'], 'since' => $f['since']], $family), $mentors),
        'remarks' => $remarks, 'family' => $family, 'circle' => ['parent' => (bool)$family, 'mentor' => (bool)$mentors]];
}

function member_circle_rotate(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    db_update('members', ['anchorCode' => null], ['memberId' => $mid]);
    $code = circle_ensure_code($mid);
    audit('circle.rotate', $mid, $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'code' => $code];
}

// ── Portal (guardian) side — code-based, no account ─────────────────────────

/**
 * Resolve a pairing code, but ONLY to someone who can already name the child.
 *
 * The code is six digits, which is a keyspace of 10^6 and typed by hand for
 * good reason — a guardian has to be able to read it off a slip. On its own
 * that is fine. What was not fine is what a correct guess bought: `lookup`
 * answered with the child's full legal name, and `connect` then minted a
 * guardian portal token carrying attendance, streaks, at-risk state and
 * mentor remarks. Rate limiting raises the cost of walking the space from one
 * address; it does nothing about a hundred addresses, and it is the wrong
 * control for an oracle anyway.
 *
 * So the name is no longer something this endpoint TELLS you. It is something
 * you must already know for it to answer at all: supply the child's name
 * alongside the code and the server confirms or denies. A guessed code with no
 * name attached now yields exactly nothing, which is the property that
 * actually closes the hole.
 *
 * Any part of the name counts. Guardians type what they call the child, and
 * families order their names differently — insisting on "the surname" would
 * fail honest people while doing nothing to an attacker, who has to know a
 * name either way.
 *
 * Wrong code and wrong name return the SAME error. Distinguishing them would
 * hand back the oracle in the other direction: "right code, wrong name" tells
 * you a code is live and worth attacking.
 *
 * A happy side effect: a mistyped code that collides with another child's now
 * fails instead of quietly pairing a stranger to that child's dashboard.
 */
function circle_match(string $code, string $name): ?array {
    $code = preg_replace('/\D/', '', $code);
    if (strlen($code) !== 6) return null;
    $given = trim(preg_replace('/\s+/', ' ', $name));
    // Two characters is not a name; without a floor, "a" would match almost
    // any record and the check would be decorative.
    if (mb_strlen($given) < 2) return null;
    $m = db_row('SELECT memberId, fullName FROM members WHERE anchorCode = ? LIMIT 1', [$code]);
    if (!$m) return null;
    $parts = preg_split('/\s+/', mb_strtolower(trim((string)$m['fullName']))) ?: [];
    $want = mb_strtolower($given);
    // The whole name typed out is accepted too, not just one part of it.
    if ($want === mb_strtolower(trim((string)$m['fullName']))) return $m;
    foreach ($parts as $part) if ($part !== '' && $part === $want) return $m;
    return null;
}

/* Guessing a child's invite code, bounded.
 *
 * The code is six digits and it resolves — with a matching name part — to a
 * child's name and member id. config.example.php calls the IP bucket in front
 * of this a "safeguarding throttle", and until client_ip() stopped believing
 * forwarded headers that is all it was: a limit the caller could opt out of by
 * changing a header between requests.
 *
 * Counted against the CODE. That bounds the case this most needs bounding —
 * somebody who knows which child they are after and is working through the
 * codes that could be theirs. Broad enumeration across many codes is bounded by
 * the IP bucket instead, which is now worth something. (The deeper fix for
 * enumeration is more entropy in the code itself; that is a change to something
 * printed on paper and handed to families, so it is not made here.)
 */
function circle_guess_guard(string $code): ?array {
    $key = preg_replace('/\D/', '', $code);
    if ($key !== '' && attempt_locked('circle.code', $key)) {
        return ['ok' => false, 'error' => 'too_many_attempts'];
    }
    return null;
}
function circle_guess_failed(string $code, string $ip = ''): void {
    $key = preg_replace('/\D/', '', $code);
    if ($key === '') return;
    /* Ten, and fifteen minutes — deliberately not tighter.
     *
     * A lock keyed on the code protects that child, and can also be used
     * AGAINST them: anybody who can fail ten times can keep a real guardian
     * from connecting for as long as they keep failing. So the number has to
     * hold two things at once, and the guessing side has enormous headroom to
     * give away. Ten per fifteen minutes is forty an hour against a million
     * codes — some three thousand years to walk the space — while a locked-out
     * family waits a quarter of an hour rather than until tomorrow. */
    if (attempt_fail('circle.code', $key, 10, 900)) {
        audit('circle.code_lockout', 'guardian', substr($key, 0, 2) . '••••', [], $ip);
    }
}

function circle_lookup(array $p): array {
    $code = (string)($p['code'] ?? '');
    if ($blocked = circle_guess_guard($code)) return $blocked;
    $m = circle_match($code, (string)($p['name'] ?? ''));
    if (!$m) { circle_guess_failed($code, (string)($p['ip'] ?? '')); return ['ok' => false, 'error' => 'not_found']; }
    attempt_reset('circle.code', preg_replace('/\D/', '', $code));
    return ['ok' => true, 'student' => ['name' => $m['fullName'], 'memberId' => $m['memberId']]];
}

/**
 * The old Anchor Circle portal's ops (connect, dashboard, confirm, remark,
 * cohort, report). Its tokens and links are retired (migration 193); an old
 * page still open somewhere is told where things went, not given an error it
 * cannot act on. circle.lookup stays internal: it is the code-and-name check
 * itself, which the family connection runs.
 */
function circle_moved(array $p): array {
    return ['ok' => false, 'error' => 'moved', 'detail' => 'Anchor Circle is now part of the NGG family account. Parents: sign in at /family. Mentors: your mentees are in the mentor portal.'];
}

// ── The Anchor week, for whoever is in the circle ───────────────────────────

const ANCHOR_REMARKS_PER_WEEK = 5;      // per adult per child: a word, not a stream

/**
 * One child's Anchor week as `$key` (the adult's link: a family link or the
 * mentor) sees it. Each adult sees the days THEY
 * confirmed and the remarks THEY wrote; the conduct figure counts any adult's
 * confirmation. Another adult's words to the child are the child's, not theirs.
 */
function anchor_week(string $mid, string $key, string $role): array {
    $m = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $stats = circle_student_stats($mid);
    $mon = circle_monday(); $today = gmdate('Y-m-d');
    $mine = array_flip(array_column(db_all('SELECT date FROM circle_confirmations WHERE linkId = ? AND date >= ?', [$key, $mon]), 'date'));
    $any = array_flip(array_column(db_all('SELECT DISTINCT date FROM circle_confirmations WHERE memberId = ? AND date >= ?', [$mid, $mon]), 'date'));
    $days = [];
    for ($i = 0; $i < 7; $i++) {
        $d = gmdate('Y-m-d', (int)strtotime($mon . ' 12:00:00 UTC') + $i * 86400);
        $days[] = ['date' => $d, 'label' => gmdate('D', (int)strtotime($d . ' 12:00:00 UTC')), 'mine' => isset($mine[$d]), 'any' => isset($any[$d]), 'future' => $d > $today,
                   'held' => (int)($stats['weekBars'][$i]['held'] ?? 0)];
    }
    $remarks = array_map(static fn($r) => ['text' => (string)$r['text'], 'at' => (string)$r['createdAt']],
        db_all('SELECT text, createdAt FROM circle_remarks WHERE linkId = ? ORDER BY id DESC LIMIT 6', [$key]));
    $left = ANCHOR_REMARKS_PER_WEEK - (int)(db_row('SELECT COUNT(*) c FROM circle_remarks WHERE linkId = ? AND weekStart = ?', [$key, $mon])['c'] ?? 0);
    return ['ok' => true, 'role' => $role, 'student' => ['name' => (string)$m['fullName'], 'first' => explode(' ', trim((string)$m['fullName']))[0] ?? ''],
        'stats' => $stats, 'suggestion' => circle_suggestion($role, $stats), 'weekStart' => $mon, 'days' => $days,
        'remarks' => $remarks, 'remarksLeft' => max(0, $left)];
}

/** Confirm (or take back) a day this week, up to today. */
function anchor_confirm(string $mid, string $key, string $role, string $date, bool $on): array {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    if ($date < circle_monday() || $date > gmdate('Y-m-d')) return ['ok' => false, 'error' => 'not_this_week', 'detail' => 'Only this week’s days, up to today, can be confirmed.'];
    $exists = db_row('SELECT id FROM circle_confirmations WHERE linkId = ? AND date = ?', [$key, $date]);
    if ($on && !$exists) db_insert('circle_confirmations', ['linkId' => $key, 'memberId' => $mid, 'role' => $role, 'date' => $date, 'createdAt' => now_iso()]);
    elseif (!$on && $exists) db_exec('DELETE FROM circle_confirmations WHERE linkId = ? AND date = ?', [$key, $date]);
    return ['ok' => true, 'date' => $date, 'on' => $on, 'unchanged' => (bool)$exists === $on];
}

/** A word to the child. They read it in their app (member.circle) and are told it came. */
function anchor_remark(string $mid, string $key, string $role, string $text, string $by, string $ip = ''): array {
    $text = trim($text);
    if (mb_strlen($text) < 2) return ['ok' => false, 'error' => 'empty', 'detail' => 'Write a few words first.'];
    if (mb_strlen($text) > 600) return ['ok' => false, 'error' => 'too_long', 'detail' => 'Keep it under 600 characters.'];
    $mon = circle_monday();
    if ((int)(db_row('SELECT COUNT(*) c FROM circle_remarks WHERE linkId = ? AND weekStart = ?', [$key, $mon])['c'] ?? 0) >= ANCHOR_REMARKS_PER_WEEK)
        return ['ok' => false, 'error' => 'week_limit', 'detail' => 'That is ' . ANCHOR_REMARKS_PER_WEEK . ' notes this week. Save the next for Monday.'];
    db_insert('circle_remarks', ['linkId' => $key, 'memberId' => $mid, 'role' => $role, 'weekStart' => $mon, 'text' => $text, 'createdAt' => now_iso()]);
    $from = ['parent' => 'your family', 'mentor' => 'your mentor'][$role] ?? 'your circle';
    if (function_exists('push_notification')) {
        try { push_notification($mid, ['kind' => 'anchor', 'title' => 'A note from ' . $from, 'body' => mb_substr($text, 0, 140), 'linkPage' => 'dashboard']); } catch (Throwable $e) {}
    }
    audit('circle.remark', $by, $mid, ['role' => $role], $ip);
    return ['ok' => true];
}

/** A parent's family link — the family account's way into one child's Anchor. */
function anchor_family_link(string $gid, string $linkId): ?array {
    if ($gid === '' || $linkId === '' || !function_exists('family_link')) return null;
    $l = family_link($gid, $linkId);
    return $l ? ['memberId' => (string)$l['memberId'], 'key' => $linkId, 'role' => 'parent'] : null;
}

/** family.anchor — the week, for a parent of this child. */
function family_anchor(array $p): array {
    $l = anchor_family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? ''));
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    return anchor_week($l['memberId'], $l['key'], $l['role']);
}
function family_anchor_confirm(array $p): array {
    $l = anchor_family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? ''));
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    return anchor_confirm($l['memberId'], $l['key'], $l['role'], (string)($p['date'] ?? ''), !empty($p['on']));
}
function family_anchor_remark(array $p): array {
    $l = anchor_family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? ''));
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    return anchor_remark($l['memberId'], $l['key'], $l['role'], (string)($p['text'] ?? ''), 'guardian:' . (string)$p['guardianId'], (string)($p['ip'] ?? ''));
}

// ── Mentors: connected by being assigned ────────────────────────────────────

/**
 * The mentor portal's door into a mentee's Anchor. No code: a child in the
 * mentor's caseload (mp_caseload_ids — their active assignments, and a lead's
 * team) is connected because the programme assigned them. One key per mentor,
 * so two mentors of one child each see their own confirmations and notes.
 */
function anchor_mentor_ctx(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    return ['ok' => true, 'mid' => $id, 'key' => 'MT-' . (string)(($g['mentorId'] ?? '') ?: $g['me']), 'by' => (string)$g['me']];
}
function member_mp_anchor(array $p): array {
    $c = anchor_mentor_ctx($p); if (empty($c['ok'])) return $c;
    return anchor_week($c['mid'], $c['key'], 'mentor');
}
function member_mp_anchor_confirm(array $p): array {
    $c = anchor_mentor_ctx($p); if (empty($c['ok'])) return $c;
    return anchor_confirm($c['mid'], $c['key'], 'mentor', (string)($p['date'] ?? ''), !empty($p['on']));
}
function member_mp_anchor_remark(array $p): array {
    $c = anchor_mentor_ctx($p); if (empty($c['ok'])) return $c;
    return anchor_remark($c['mid'], $c['key'], 'mentor', (string)($p['text'] ?? ''), $c['by'], (string)($p['ip'] ?? ''));
}
