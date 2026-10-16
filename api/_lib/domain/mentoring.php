<?php
declare(strict_types=1);

/**
 * The mentoring record — the child, over time.
 *
 * WHAT WAS MISSING. A mentor's only trace on a child was a star for today and
 * a V3 rating for this week. Both are scores, both are transient, and neither
 * records a conversation. So a mentor could not answer the question their whole
 * role rests on — "how is this child actually doing, compared with three months
 * ago, and what did we agree last time?" — and a mentor taking over a class
 * inherited nothing but numbers.
 *
 * This adds the two things that make it a record rather than a scoreboard:
 * MEETINGS (what was discussed, what was agreed, whether it needs a lead's
 * attention) and GOALS (something specific, with a date, that can be closed).
 *
 * ON READING AND WRITING ABOUT CHILDREN. Everything here is gated by
 * mentor_gate and then by mentor_scope_ok on the subject — the same two checks
 * that govern who may star a child — so nobody reaches a record for a child
 * outside their centre and cohort. Every write is audited. None of it is ever
 * returned to the child's own portal: these are staff notes, and a child
 * reading a safeguarding concern written about them is a different and much
 * worse product.
 */

const MENTOR_MEETING_KINDS = ['one-to-one', 'group', 'call', 'guardian', 'check-in'];
const MENTOR_TEXT_MAX = 4000;

/** The subject row, whichever table the child lives in, or null. */
function mentoring_subject(string $subjectId): ?array {
    $r = db_row("SELECT memberId id, fullName, centre, track, photoUrl, status, 'member' kind
                 FROM members WHERE memberId = ? LIMIT 1", [$subjectId]);
    if ($r) return $r;
    $r = db_row("SELECT studentId id, fullName, centre, track, photoUrl, status, 'student' kind
                 FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
    return $r ?: null;
}

/**
 * Gate + subject in one step, because every op below needs exactly this pair
 * and doing it once is what stops one of them being written without the second
 * check. Returns ['ok'=>false,...] or ['ok'=>true,'g'=>..,'subject'=>..].
 */
function mentoring_open(array $p): array {
    $g = mentor_gate($p);
    if (empty($g['ok'])) return $g;
    $subjectId = trim((string)($p['subjectId'] ?? ''));
    if ($subjectId === '') return ['ok' => false, 'error' => 'no_subject'];
    $s = mentoring_subject($subjectId);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    // The same scope test that governs starring. A record is at least as
    // sensitive as a star, so it is not gated more loosely.
    if (!mentor_scope_ok($g, $s)) return ['ok' => false, 'error' => 'not_your_centre'];
    if (!mentor_covers($g, $s['kind'] === 'member' ? 'ngg' : 'summer')) return ['ok' => false, 'error' => 'not_your_cohort'];
    /* No child's record reaches a mentor whose safeguarding screening is not
     * recorded. The v14 portal enforced this (mp_screened); when it was
     * withdrawn, these legacy ops became the only mentor path and they did
     * not. Stars and V3 do not come through here — a star is not a record. */
    if (!mentoring_screened($g)) return ['ok' => false, 'error' => 'not_screened'];
    return ['ok' => true, 'g' => $g, 'subject' => $s];
}

/** Staff and instructors are screened by their role; a mentor by their record. */
function mentoring_screened(array $g): bool {
    if (($g['role'] ?? '') !== 'mentor') return true;
    $row = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [(string)($g['mentorId'] ?? '')]);
    if (!$row) return false;
    return function_exists('ms_clearance') ? (bool)ms_clearance($row)['screened'] : trim((string)($row['checkedAt'] ?? '')) !== '';
}

/** The children actively paired with this mentor (any session). */
function mentoring_caseload(array $g): array {
    $mid = (string)($g['mentorId'] ?? '');
    if ($mid === '') return [];
    return array_map('strval', array_column(db_all("SELECT memberId FROM mentor_assignments WHERE mentorId = ? AND status = 'active'", [$mid]), 'memberId'));
}

/** ISO week periods, newest last — the x-axis of the V3 trend. */
function mentoring_periods(int $n): array {
    $out = [];
    for ($i = $n - 1; $i >= 0; $i--) {
        $t = time() - $i * 7 * 86400;
        $out[] = gmdate('o-\WW', $t);
    }
    return $out;
}

/**
 * Everything known about one child, for the mentor looking at them.
 *
 * Deliberately one call rather than six. This is the screen a mentor opens with
 * the child in front of them, and six round trips on a Lagos phone connection
 * is the difference between a tool that gets used and one that does not.
 */
function mentor_child(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $id = (string)$s['id'];

    // Stars — the last 90 days, newest first, with the running total.
    $since = gmdate('Y-m-d', time() - 90 * 86400);
    $stars = db_all("SELECT date, stars, category, note, givenById FROM member_stars
                     WHERE subjectId = ? AND date >= ? ORDER BY date DESC LIMIT 120", [$id, $since]);
    $starTotal = (int)(db_row('SELECT COALESCE(SUM(stars), 0) t FROM member_stars WHERE subjectId = ?', [$id])['t'] ?? 0);

    /* V3 over the last eight weeks, with the gaps kept as gaps.
     * A trend that silently drops the weeks nobody rated reads as eight weeks
     * of steady attention when it might be three. The missing weeks are the
     * finding. */
    $periods = mentoring_periods(8);
    $have = [];
    foreach (db_all("SELECT period, verbal, vocal, visual, note FROM v3_scores WHERE subjectId = ?", [$id]) as $r) {
        $have[(string)$r['period']] = $r;
    }
    $v3 = [];
    foreach ($periods as $per) {
        $r = $have[$per] ?? null;
        $v3[] = $r
            ? ['period' => $per, 'rated' => true, 'verbal' => (int)$r['verbal'], 'vocal' => (int)$r['vocal'],
               'visual' => (int)$r['visual'], 'note' => (string)$r['note']]
            : ['period' => $per, 'rated' => false, 'verbal' => 0, 'vocal' => 0, 'visual' => 0, 'note' => ''];
    }

    // Attendance, counted rather than listed — the number is the signal.
    $att = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$id])['c'] ?? 0);
    $attRecent = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ? AND date >= ?',
                              [$id, $since])['c'] ?? 0);
    $lastSeen = (string)(db_row('SELECT MAX(date) d FROM attendance WHERE studentId = ?', [$id])['d'] ?? '');

    $meetings = db_all("SELECT id, metOn, kind, discussed, agreed, concern, mentorId, mentorName, createdAt
                        FROM mentor_meetings WHERE subjectId = ? ORDER BY metOn DESC, id DESC LIMIT 60", [$id]);
    foreach ($meetings as &$m) {
        $m['id'] = (int)$m['id'];
        $m['concern'] = (int)$m['concern'] === 1;
        // Whose entry this is, so the UI can offer edit only where it applies.
        $m['mine'] = (string)$m['mentorId'] === (string)$g['member']['memberId'];
    }
    unset($m);

    $goals = db_all("SELECT id, goal, dueOn, status, closedOn, setById, setByName, createdAt, updatedAt, area, outcome, obstacle, plan, agreed, reviewBy
                     FROM mentor_goals WHERE subjectId = ?
                     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, id DESC LIMIT 60", [$id]);
    $today = gmdate('Y-m-d');
    $checks = mentor_goal_checks_for(array_map(static fn($x) => (int)$x['id'], $goals));
    foreach ($goals as &$gl) {
        $gl['id'] = (int)$gl['id'];
        $gl['agreed'] = (int)$gl['agreed'] === 1;
        $gl['checks'] = $checks[$gl['id']] ?? [];
        $due = trim((string)($gl['reviewBy'] ?: $gl['dueOn']));
        $gl['overdue'] = $gl['status'] === 'active' && $due !== '' && $due < $today;
        $gl['stalled'] = mentor_goal_stalled($gl, $today);
    }
    unset($gl);

    /* The Courage Index, on the same call as everything else. This screen is
       opened with the child in front of the mentor, and the brief puts courage
       beside the meetings and the goals rather than behind another tap. */
    $courage = courage_index($id, 40);
    /* Eight weeks of the weekly review, gaps kept as gaps — the weeks nobody
       reviewed are the finding, exactly as they are in the V3 trend above. */
    $reviews = mentoring_review_history($id, 8);

    // Who this child's assigned mentor is — the pairing an admin made.
    $sc = session_current();
    $sessionId = (string)($sc['current']['sessionId'] ?? '');
    $link = db_row("SELECT ma.mentorId, m.fullName FROM mentor_assignments ma
                    LEFT JOIN mentors m ON m.mentorId = ma.mentorId
                    WHERE ma.memberId = ? AND ma.status = 'active' ORDER BY ma.startedAt DESC LIMIT 1", [$id]);

    return ['ok' => true,
        'subject' => ['subjectId' => $id, 'kind' => (string)$s['kind'], 'fullName' => (string)$s['fullName'],
                      'centre' => (string)$s['centre'], 'track' => (string)$s['track'],
                      'photoUrl' => (string)($s['photoUrl'] ?? ''), 'status' => (string)$s['status']],
        'mentor' => ['mentorId' => (string)($link['mentorId'] ?? ''), 'name' => (string)($link['fullName'] ?? ''),
                     'isMine' => $link && (string)$link['mentorId'] === trim((string)($g['mentorId'] ?? '')) && trim((string)($g['mentorId'] ?? '')) !== ''],
        'stars' => ['total' => $starTotal, 'recent' => $stars],
        'v3' => $v3,
        'attendance' => ['total' => $att, 'last90' => $attRecent, 'lastSeen' => $lastSeen],
        'meetings' => $meetings,
        'goals' => $goals,
        'courage' => $courage,
        'courageLadder' => courage_ladder(),
        'couragePrompts' => courage_prompts(),
        'reviews' => $reviews,
        'reviewQuestions' => nggc_weekly_review(),
        'period' => iso_week_period(),
        'kinds' => MENTOR_MEETING_KINDS,
        'canWrite' => true,
        'role' => (string)($g['role'] ?? 'mentor'),
        'rank' => (string)($g['rank'] ?? 'mentor'),
        'sessionId' => $sessionId];
}

/* ── Meetings ─────────────────────────────────────────────────────────── */

function mentor_meeting_save(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $me = (string)$g['member']['memberId'];

    $discussed = trim((string)($p['discussed'] ?? ''));
    $agreed    = trim((string)($p['agreed'] ?? ''));
    if ($discussed === '' && $agreed === '') return ['ok' => false, 'error' => 'empty'];
    if (mb_strlen($discussed) > MENTOR_TEXT_MAX || mb_strlen($agreed) > MENTOR_TEXT_MAX) {
        return ['ok' => false, 'error' => 'too_long'];
    }

    $kind = (string)($p['kind'] ?? 'one-to-one');
    if (!in_array($kind, MENTOR_MEETING_KINDS, true)) $kind = 'one-to-one';

    /* Backdating is allowed — a write-up happens after the conversation — but
     * not into the future, which is either a typo or a record of something that
     * has not happened. */
    $metOn = trim((string)($p['metOn'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $metOn)) $metOn = gmdate('Y-m-d');
    if ($metOn > gmdate('Y-m-d')) $metOn = gmdate('Y-m-d');

    $concern = !empty($p['concern']) ? 1 : 0;
    $now = now_iso();
    $id = (int)($p['id'] ?? 0);
    /* A concern marked on a meeting opens a safeguarding case, the same as
     * the portal's Report-a-concern sheet (mp_concern_file): the officer is
     * told today, concernEscalate watches it, and a centre with no lead mentor
     * no longer means nobody hears. Once per note — editing a note that is
     * already a concern does not open a second case. */
    $fileCase = function () use ($g, $s, $kind, $metOn, $discussed, $agreed, $p) {
        if (!function_exists('mp_concern_file')) return null;
        $body = 'Raised from a mentor\'s meeting note (' . $kind . ', ' . $metOn . ").\n\n"
              . ($discussed !== '' ? "Discussed:\n" . $discussed . "\n\n" : '')
              . ($agreed !== '' ? "Agreed:\n" . $agreed : '');
        $r = mp_concern_file($g['member'], $s, 'Something they told me', trim($body), (string)($p['ip'] ?? ''), 'mentor.meeting');
        return !empty($r['ok']) ? (string)$r['ref'] : null;
    };

    if ($id > 0) {
        $row = db_row('SELECT * FROM mentor_meetings WHERE id = ? LIMIT 1', [$id]);
        if (!$row) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'wrong_subject'];
        /* Only the author may edit, whatever their rank. A lead rewriting
         * another mentor's account of a conversation they were not in is not
         * oversight — it is the record losing its author. A lead who disagrees
         * writes their own entry, and both stand. */
        if ((string)$row['mentorId'] !== $me) return ['ok' => false, 'error' => 'not_yours'];
        db_update('mentor_meetings', ['metOn' => $metOn, 'kind' => $kind, 'discussed' => $discussed,
            'agreed' => $agreed, 'concern' => $concern, 'updatedAt' => $now], ['id' => $id]);
        audit('mentor.meeting.update', $me, (string)$s['id'], ['id' => $id, 'concern' => $concern], (string)($p['ip'] ?? ''));
        $case = ($concern && !(int)$row['concern']) ? $fileCase() : null;
        if ($concern && !(int)$row['concern']) mentoring_tell_leads($s, $g, $me);
        return ['ok' => true, 'id' => $id, 'caseRef' => $case];
    }

    $newId = db_insert('mentor_meetings', [
        'subjectId' => (string)$s['id'], 'subjectType' => (string)$s['kind'],
        'mentorId' => $me, 'mentorName' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''),
        'metOn' => $metOn, 'kind' => $kind, 'discussed' => $discussed, 'agreed' => $agreed,
        'concern' => $concern, 'centre' => (string)($s['centre'] ?? ''),
        'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('mentor.meeting.add', $me, (string)$s['id'], ['id' => $newId, 'kind' => $kind, 'concern' => $concern], (string)($p['ip'] ?? ''));

    /* A concern is raised, not merely stored. The point of the flag is that
     * somebody senior finds out without the mentor having to know who that is
     * today. */
    $case = null;
    if ($concern) {
        $case = $fileCase();
        mentoring_tell_leads($s, $g, $me);
    }
    return ['ok' => true, 'id' => $newId, 'caseRef' => $case];
}

function mentoring_tell_leads(array $s, array $g, string $me): void {
    foreach (mentoring_leads((string)($s['centre'] ?? ''), $me) as $leadId) {
        push_notification($leadId, ['kind' => 'mentor',
            'title' => 'A mentor has raised a concern',
            'body' => (string)$s['fullName'] . ' — logged by ' . (string)($g['mentor']['fullName'] ?? 'a mentor') . '.',
            'linkPage' => 'mentor']);
    }
}

/** Lead mentors at a centre, minus the person who just wrote — nobody needs a
 *  notification about their own entry. */
function mentoring_leads(string $centre, string $exceptMemberId): array {
    if ($centre === '') return [];
    $out = [];
    foreach (db_all("SELECT memberId, volunteerId FROM mentors
                     WHERE status = 'active' AND rank = 'lead' AND centre = ?", [$centre]) as $r) {
        $id = trim((string)($r['memberId'] ?? '')) ?: trim((string)($r['volunteerId'] ?? ''));
        if ($id !== '' && $id !== $exceptMemberId) $out[$id] = true;
    }
    return array_keys($out);
}

function mentor_meeting_delete(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $me = (string)$g['member']['memberId'];
    $id = (int)($p['id'] ?? 0);
    $row = db_row('SELECT * FROM mentor_meetings WHERE id = ? LIMIT 1', [$id]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'wrong_subject'];
    if ((string)$row['mentorId'] !== $me) return ['ok' => false, 'error' => 'not_yours'];
    db_exec('DELETE FROM mentor_meetings WHERE id = ?', [$id]);
    // The text is gone but the fact that it existed is not — a deleted
    // safeguarding note is exactly the thing a review needs to be able to see.
    audit('mentor.meeting.delete', $me, (string)$s['id'],
          ['id' => $id, 'metOn' => (string)$row['metOn'], 'concern' => (int)$row['concern']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Goals ────────────────────────────────────────────────────────────── */

function mentor_goal_save(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $me = (string)$g['member']['memberId'];

    $id = (int)($p['id'] ?? 0);
    $row = $id > 0 ? db_row('SELECT * FROM mentor_goals WHERE id = ? LIMIT 1', [$id]) : null;
    if ($id > 0 && !$row) return ['ok' => false, 'error' => 'not_found'];
    if ($row && (string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'wrong_subject'];

    /* WOOP: the wish (`goal`), the best outcome, the obstacle inside them and
       an if–then plan. A new goal may start as an empty Draft ("New goal with
       Ada" creates one and opens it), so only what is sent is checked. */
    $f = [];
    foreach (['goal' => 500, 'outcome' => 600, 'obstacle' => 600, 'plan' => 600] as $k => $max) {
        if (!array_key_exists($k, $p)) continue;
        $v = trim((string)$p[$k]);
        if (mb_strlen($v) > $max) return ['ok' => false, 'error' => 'too_long', 'field' => $k];
        $f[$k] = $v;
    }
    if (array_key_exists('area', $p)) {
        if (!in_array((string)$p['area'], MENTOR_GOAL_AREAS, true)) return ['ok' => false, 'error' => 'bad_area'];
        $f['area'] = (string)$p['area'];
    }
    foreach (['reviewBy', 'dueOn'] as $k) if (array_key_exists($k, $p)) {
        $v = trim((string)$p[$k]);
        if ($v !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return ['ok' => false, 'error' => 'bad_date'];
        $f['reviewBy'] = $v; $f['dueOn'] = $v;
    }
    if (array_key_exists('agreed', $p)) $f['agreed'] = !empty($p['agreed']) ? 1 : 0;
    $now = now_iso();

    if ($row) {
        // A live goal keeps its wish: an Active goal with no wish is not a goal.
        if ((string)$row['status'] === 'active' && array_key_exists('goal', $f) && $f['goal'] === '') return ['ok' => false, 'error' => 'no_wish'];
        if ((string)$row['status'] === 'active' && array_key_exists('agreed', $f) && !$f['agreed']) return ['ok' => false, 'error' => 'active_needs_agreed'];
        if ($f) db_update('mentor_goals', $f + ['updatedAt' => $now], ['id' => $id]);
        audit('mentor.goal.update', $me, (string)$s['id'], ['id' => $id, 'fields' => array_keys($f)], (string)($p['ip'] ?? ''));
        if (!empty($f['agreed']) && empty($row['agreed']) && function_exists('push_notification') && (string)$s['kind'] === 'member') {
            push_notification((string)$s['id'], ['kind' => 'mentor', 'title' => 'A goal you agreed', 'body' => mb_substr((string)($f['goal'] ?? $row['goal']), 0, 140), 'linkPage' => 'dashboard']);
        }
        return ['ok' => true, 'id' => $id];
    }

    /* The first weeks of a match are for getting to know each other: no goal
     * before week 3 (mentor portal handoff; R5). Refused here as well as
     * hidden on screen, so an older page cannot set one either. */
    if (function_exists('ms_goals_locked') && (string)$s['kind'] === 'member' && ms_goals_locked((string)$s['id'])) {
        return ['ok' => false, 'error' => 'goals_locked_connect'];
    }
    $newId = db_insert('mentor_goals', [
        'subjectId' => (string)$s['id'], 'subjectType' => (string)$s['kind'], 'goal' => (string)($f['goal'] ?? ''),
        'setById' => $me, 'setByName' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''),
        'dueOn' => (string)($f['dueOn'] ?? ''), 'reviewBy' => (string)($f['reviewBy'] ?? ''), 'status' => 'draft', 'closedOn' => '', 'closedById' => '',
        'area' => (string)($f['area'] ?? 'Character'), 'outcome' => (string)($f['outcome'] ?? ''), 'obstacle' => (string)($f['obstacle'] ?? ''),
        'plan' => (string)($f['plan'] ?? ''), 'agreed' => (int)($f['agreed'] ?? 0),
        'centre' => (string)($s['centre'] ?? ''), 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('mentor.goal.add', $me, (string)$s['id'], ['id' => $newId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'id' => $newId, 'status' => 'draft'];
}

const MENTOR_GOAL_AREAS = ['Character', 'Competence', 'Wellbeing', 'Leadership'];
const MENTOR_GOAL_STATUSES = ['draft', 'active', 'achieved', 'paused'];
/* Older screens speak open / done / dropped; they mean active / achieved / paused. */
const MENTOR_GOAL_LEGACY = ['open' => 'active', 'done' => 'achieved', 'dropped' => 'paused'];
const MENTOR_GOAL_STALLED_DAYS = 21;

/** Check-ins for many goals, one read. goalId => [{at, progress, note, by}] oldest first. */
function mentor_goal_checks_for(array $goalIds): array {
    $goalIds = array_values(array_filter($goalIds));
    if (!$goalIds) return [];
    $ph = implode(',', array_fill(0, count($goalIds), '?'));
    $out = [];
    foreach (db_all("SELECT id, goalId, progress, note, byKind, checkedOn FROM mentor_goal_checkins WHERE goalId IN ($ph) ORDER BY checkedOn, id", $goalIds) as $c) {
        $out[(int)$c['goalId']][] = ['id' => (int)$c['id'], 'at' => (string)$c['checkedOn'], 'progress' => (int)$c['progress'], 'note' => (string)$c['note'], 'by' => (string)$c['byKind']];
    }
    return $out;
}

/**
 * Stalled (MTRules.goals.isStalled): an Active goal with no check-in for more
 * than 21 days, or three or more check-ins where the latest is no higher than
 * the one two before.
 */
function mentor_goal_stalled(array $goal, string $today): bool {
    if ((string)($goal['status'] ?? '') !== 'active') return false;
    $c = $goal['checks'] ?? [];
    $last = $c ? (string)end($c)['at'] : substr((string)($goal['updatedAt'] ?: $goal['createdAt'] ?: $today), 0, 10);
    if ((strtotime($today . 'T00:00:00Z') - strtotime(substr($last, 0, 10) . 'T00:00:00Z')) / 86400 > MENTOR_GOAL_STALLED_DAYS) return true;
    $n = count($c);
    return $n >= 3 && $c[$n - 1]['progress'] <= $c[$n - 3]['progress'];
}

/**
 * Change a goal's status. One Active goal per mentee: making one Active pauses
 * the other and says which (`pausedGoalId`). Active needs the wish and the
 * mentee's agreement. Paused exists on purpose: a record where every goal is
 * achieved is a record nobody believes.
 */
function mentor_goal_status(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $me = (string)$g['member']['memberId'];
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    $status = MENTOR_GOAL_LEGACY[$status] ?? $status;
    if (!in_array($status, MENTOR_GOAL_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    $row = db_row('SELECT * FROM mentor_goals WHERE id = ? LIMIT 1', [$id]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'wrong_subject'];
    $paused = null;
    if ($status === 'active') {
        if (trim((string)$row['goal']) === '') return ['ok' => false, 'error' => 'no_wish'];
        if ((int)$row['agreed'] !== 1 && empty($p['legacy'])) {
            // An older screen (open = active) never asked; a goal it set was agreed in the room.
            if (!in_array((string)($p['status'] ?? ''), ['open'], true)) return ['ok' => false, 'error' => 'not_agreed'];
        }
        $prev = db_row("SELECT id, goal FROM mentor_goals WHERE subjectId = ? AND status = 'active' AND id <> ? LIMIT 1", [(string)$s['id'], $id]);
        if ($prev) { db_update('mentor_goals', ['status' => 'paused', 'updatedAt' => now_iso()], ['id' => (int)$prev['id']]); $paused = ['id' => (int)$prev['id'], 'goal' => (string)$prev['goal']]; }
    }
    $closed = in_array($status, ['achieved'], true);
    db_update('mentor_goals', [
        'status' => $status,
        'closedOn' => $closed ? gmdate('Y-m-d') : '',
        'closedById' => $closed ? $me : '',
        'updatedAt' => now_iso(),
    ], ['id' => $id]);
    audit('mentor.goal.status', $me, (string)$s['id'], ['id' => $id, 'status' => $status, 'paused' => $paused['id'] ?? null], (string)($p['ip'] ?? ''));
    // R4: an achieved goal suggests the next, from this week's Anchor theme.
    if ($status === 'achieved' && (string)$row['status'] !== 'achieved') {
        if (function_exists('ms_on_goal_done')) ms_on_goal_done((string)$s['id'], $id);
        if ((string)$s['kind'] === 'member' && function_exists('push_notification')) {
            push_notification((string)$s['id'], ['kind' => 'mentor', 'title' => 'Goal achieved', 'body' => mb_substr((string)$row['goal'], 0, 140) . ' — it is in your growth passport.', 'linkPage' => 'dashboard']);
        }
    }
    return ['ok' => true, 'status' => $status, 'pausedGoalId' => $paused['id'] ?? null, 'pausedGoal' => $paused['goal'] ?? null];
}

/**
 * A goal check-in: "How close is Ada now?" 1–5 and a note. A 5 on an Active
 * goal marks it Achieved (MTRules.goals.addCheck). Written by the mentor, or
 * by the member on their own goal (byKind = member).
 */
function mentor_goal_checkin(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $row = db_row('SELECT * FROM mentor_goals WHERE id = ? LIMIT 1', [(int)($p['goalId'] ?? 0)]);
    if (!$row || (string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'not_found'];
    return mentor_goal_checkin_write($row, (int)($p['progress'] ?? 0), (string)($p['note'] ?? ''), 'mentor', (string)$g['member']['memberId'], (int)($p['sessionId'] ?? 0), (string)($p['ip'] ?? ''));
}
function mentor_goal_checkin_write(array $row, int $progress, string $note, string $by, string $byId, int $sessionId = 0, string $ip = ''): array {
    if ($progress < 1 || $progress > 5) return ['ok' => false, 'error' => 'bad_progress'];
    if (!in_array((string)$row['status'], ['active', 'draft', 'paused'], true)) return ['ok' => false, 'error' => 'goal_closed'];
    $now = now_iso();
    $cid = db_insert('mentor_goal_checkins', ['goalId' => (int)$row['id'], 'subjectId' => (string)$row['subjectId'], 'progress' => $progress,
        'note' => mb_substr(trim($note), 0, 400), 'byKind' => $by, 'byId' => $byId, 'sessionId' => $sessionId, 'checkedOn' => gmdate('Y-m-d'), 'createdAt' => $now]);
    $achieved = (string)$row['status'] === 'active' && $progress === 5;
    db_update('mentor_goals', ['updatedAt' => $now] + ($achieved ? ['status' => 'achieved', 'closedOn' => gmdate('Y-m-d'), 'closedById' => $byId] : []), ['id' => (int)$row['id']]);
    if ($achieved) {
        if (function_exists('ms_on_goal_done')) ms_on_goal_done((string)$row['subjectId'], (int)$row['id']);
        if (function_exists('push_notification') && $by === 'mentor') push_notification((string)$row['subjectId'], ['kind' => 'mentor', 'title' => 'Goal achieved', 'body' => mb_substr((string)$row['goal'], 0, 140), 'linkPage' => 'dashboard']);
    }
    audit('mentor.goal.checkin', $byId, (string)$row['subjectId'], ['goalId' => (int)$row['id'], 'progress' => $progress, 'achieved' => $achieved], $ip);
    return ['ok' => true, 'id' => $cid, 'progress' => $progress, 'status' => $achieved ? 'achieved' : (string)$row['status'], 'achieved' => $achieved];
}

/* ── What needs attention ─────────────────────────────────────────────── */

/**
 * The lead's queue: open concerns and overdue goals across the centre.
 *
 * A flag nobody has a screen for is a flag nobody sees. This is that screen —
 * scoped exactly like the roster, so a mentor at one centre gets that centre.
 */
function mentor_attention(array $p): array {
    $g = mentor_gate($p);
    if (empty($g['ok'])) return $g;
    $centres = mentor_scope_centres($g);
    $want = trim((string)($p['centre'] ?? ''));
    if ($want !== '' && !in_array($want, $centres, true)) return ['ok' => false, 'error' => 'not_your_centre'];
    $use = $want !== '' ? [$want] : $centres;
    if (!$use) return ['ok' => true, 'concerns' => [], 'overdue' => [], 'centres' => $centres, 'centre' => $want];

    // Unscreened: nothing about a child, as on the record itself.
    if (!mentoring_screened($g)) return ['ok' => true, 'concerns' => [], 'overdue' => [], 'centres' => $centres, 'centre' => $want, 'screened' => false];

    $in = '(' . implode(',', array_fill(0, count($use), '?')) . ')';
    $since = gmdate('Y-m-d', time() - 60 * 86400);
    /* What a concern says is for the people responsible for that child: leads
     * and staff for the centre, the mentor who wrote it, and the child's own
     * mentor. It was every mentor at the centre — peers included — reading
     * what another mentor wrote about somebody else's mentee. */
    $who = ''; $whoArgs = [];
    if (!in_array((string)($g['rank'] ?? ''), ['lead', 'admin'], true) && ($g['role'] ?? '') === 'mentor') {
        $mine = mentoring_caseload($g);
        $who = ' AND (mentorId = ?' . ($mine ? ' OR subjectId IN (' . implode(',', array_fill(0, count($mine), '?')) . ')' : '') . ')';
        $whoArgs = array_merge([(string)$g['member']['memberId']], $mine);
    }
    $concerns = db_all("SELECT id, subjectId, subjectType, metOn, kind, discussed, agreed, mentorName, centre
                        FROM mentor_meetings WHERE concern = 1 AND centre IN $in AND metOn >= ?$who
                        ORDER BY metOn DESC, id DESC LIMIT 60", array_merge($use, [$since], $whoArgs));
    $today = gmdate('Y-m-d');
    $overdue = db_all("SELECT id, subjectId, goal, dueOn, setByName, centre FROM mentor_goals
                       WHERE status = 'active' AND dueOn <> '' AND dueOn < ? AND centre IN $in
                       ORDER BY dueOn LIMIT 60", array_merge([$today], $use));

    // Names, in one read rather than one per row.
    $ids = array_values(array_unique(array_merge(array_column($concerns, 'subjectId'), array_column($overdue, 'subjectId'))));
    $nameOf = [];
    if ($ids) {
        $qin = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT memberId id, fullName FROM members WHERE memberId IN $qin", $ids) as $r) $nameOf[(string)$r['id']] = (string)$r['fullName'];
        foreach (db_all("SELECT studentId id, fullName FROM summer_students WHERE studentId IN $qin", $ids) as $r) $nameOf[(string)$r['id']] = (string)$r['fullName'];
    }
    foreach ($concerns as &$c) { $c['id'] = (int)$c['id']; $c['fullName'] = $nameOf[(string)$c['subjectId']] ?? '(removed)'; }
    unset($c);
    foreach ($overdue as &$d) { $d['id'] = (int)$d['id']; $d['fullName'] = $nameOf[(string)$d['subjectId']] ?? '(removed)'; }
    unset($d);

    return ['ok' => true, 'concerns' => $concerns, 'overdue' => $overdue,
            'centres' => $centres, 'centre' => $want, 'rank' => (string)($g['rank'] ?? 'mentor')];
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE COURAGE INDEX — NGGC 2040 brief §14

   "One of the most important things NGGC should measure." It was the only
   instrument in the brief with nothing behind it: musing lives in the journal,
   dues and fines in the fees ledger, the NGV rung on members.level. Courage
   was recorded nowhere, which meant the programme's own answer to "is this
   child becoming braver" was whatever the mentor remembered.

   Three constraints come straight out of the brief and shape everything here.

   1. COURAGE IS NOT LOUDNESS. The ladder is defined by what a child does with
      responsibility, not by how forward they are, and its top rung is
      other-directed ("acts courageously for the good of others"). The ladder
      is stored once, in formation.jsx, and mirrored here as the range check.

   2. A MARK NEEDS AN INSTANCE. The brief scores against ten specific observed
      things ("did they apologize when wrong?"), not against an impression. So
      evidence is required, not optional — a 4 with an empty box is rejected
      rather than stored, because a column that is usually empty is a column
      nobody reads.

   3. IT IS NOT A LEAGUE TABLE. "The objective is not to create reckless
      children." Nothing here ranks one child against another, and there is
      deliberately no centre-wide or cohort-wide courage board to build one
      from. The record belongs to the child's formation, and the child can see
      their own — unlike meetings and goals above, which are staff notes.
   ═══════════════════════════════════════════════════════════════════════════ */

const COURAGE_MIN = 1;
const COURAGE_MAX = 5;
const COURAGE_EVIDENCE_MIN = 8;      // shorter than this is "yes" or "good", not an instance
const COURAGE_EVIDENCE_MAX = 1200;
const COURAGE_WINDOW_DAYS = 120;     // what "currently" means when the index is computed
const COURAGE_PER_DAY_MAX = 4;       // a bound on volume, since the calendar is not the key

/* courage_ladder() and courage_prompts() used to live here. They are the
 * brief, not this child's record, so they moved to domain/formation.php
 * alongside the divisions and the weekly review — one file per language
 * holding the doctrine, pinned to formation.jsx by a parity test. The callers
 * below are unchanged. */

/**
 * The index for one child, computed from the marks rather than stored.
 *
 * `current` is the mean over COURAGE_WINDOW_DAYS, to one decimal. A mean and
 * not the latest mark: a single brave afternoon is not a courage level, and a
 * single bad one is not either. `rung` rounds that mean onto the ladder so a
 * surface can print a word instead of a number.
 *
 * `direction` compares the newer half of the window against the older half,
 * and is null until there are marks on both sides of it — which is most of the
 * first term for most children. Withheld rather than guessed, because "improving"
 * inferred from two entries is the kind of number that ends up in a report.
 */
function courage_index(string $subjectId, int $limit = 60): array {
    $since = gmdate('Y-m-d', time() - COURAGE_WINDOW_DAYS * 86400);
    $rows = db_all("SELECT id, score, prompt, evidence, markedById, markedByName, observedOn, createdAt
                    FROM courage_marks WHERE subjectId = ? AND observedOn >= ?
                    ORDER BY observedOn DESC, id DESC LIMIT " . max(1, min(200, $limit)),
                   [$subjectId, $since]);
    $total = (int)(db_row("SELECT COUNT(*) c FROM courage_marks WHERE subjectId = ?", [$subjectId])['c'] ?? 0);

    $marks = [];
    foreach ($rows as $r) {
        $marks[] = [
            'id' => (int)$r['id'], 'score' => (int)$r['score'],
            'prompt' => (string)$r['prompt'], 'evidence' => (string)$r['evidence'],
            'markedById' => (string)$r['markedById'], 'markedByName' => (string)$r['markedByName'],
            'observedOn' => (string)$r['observedOn'],
        ];
    }

    $scores = array_map(static fn($m) => $m['score'], $marks);
    $n = count($scores);
    $current = $n ? round(array_sum($scores) / $n, 1) : null;

    /* Halves of the window, oldest-first so "newer" is unambiguous. Needs at
     * least two marks on each side: one against one is noise wearing a trend's
     * clothes. */
    $direction = null;
    if ($n >= 4) {
        $chron = array_reverse($scores);
        $half = intdiv($n, 2);
        $older = array_slice($chron, 0, $half);
        $newer = array_slice($chron, $n - $half);
        $delta = (array_sum($newer) / count($newer)) - (array_sum($older) / count($older));
        $direction = $delta >= 0.5 ? 'rising' : ($delta <= -0.5 ? 'falling' : 'steady');
    }

    $rung = null;
    if ($current !== null) {
        $i = max(COURAGE_MIN, min(COURAGE_MAX, (int)round($current)));
        $rung = courage_ladder()[$i - 1];
    }

    return [
        'current' => $current, 'rung' => $rung, 'direction' => $direction,
        'inWindow' => $n, 'total' => $total, 'windowDays' => COURAGE_WINDOW_DAYS,
        'marks' => $marks,
    ];
}

/**
 * A mentor records one observation.
 *
 * Gated by mentoring_open — the same two checks (is this person a mentor, is
 * this child inside their centre and cohort) that govern starring and the
 * meeting record. A courage mark is at least as sensitive as either, so it is
 * not gated more loosely.
 */
function courage_mark_save(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $id = (string)$s['id'];

    $score = (int)($p['score'] ?? 0);
    if ($score < COURAGE_MIN || $score > COURAGE_MAX) return ['ok' => false, 'error' => 'bad_score'];

    /* The brief's rule, enforced rather than encouraged: a mark is recorded
     * against something observed. An empty or one-word box is not an instance,
     * and a score stored without one is exactly the impression-of-a-child this
     * index exists to replace. */
    $evidence = trim((string)($p['evidence'] ?? ''));
    if (mb_strlen($evidence) < COURAGE_EVIDENCE_MIN) return ['ok' => false, 'error' => 'evidence_required'];
    $evidence = mb_substr($evidence, 0, COURAGE_EVIDENCE_MAX);

    // A closed set: an unrecognised prompt is dropped, not stored, so the
    // column stays countable across a cohort.
    $prompt = trim((string)($p['prompt'] ?? ''));
    if ($prompt !== '' && !in_array($prompt, courage_prompts(), true)) $prompt = '';

    /* `observedOn` is the day it happened, which is not always today — a
     * mentor writing up Saturday's session on Sunday evening is the normal
     * case. Bounded to the last 30 days and never the future, so a typo cannot
     * park an entry outside every window that would ever show it. */
    $today = gmdate('Y-m-d');
    $observedOn = trim((string)($p['observedOn'] ?? '')) ?: $today;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $observedOn)) return ['ok' => false, 'error' => 'bad_date'];
    if ($observedOn > $today || $observedOn < gmdate('Y-m-d', time() - 30 * 86400)) {
        return ['ok' => false, 'error' => 'date_out_of_range'];
    }

    /* Volume bound. There is no one-per-day key here on purpose (two separate
     * acts of courage in an afternoon are two observations), so the ceiling is
     * per marker per child per day — enough for a real session, not enough to
     * manufacture a trend. */
    $mine = (int)(db_row("SELECT COUNT(*) c FROM courage_marks
                          WHERE subjectId = ? AND markedById = ? AND observedOn = ?",
                         [$id, (string)$g['member']['memberId'], $observedOn])['c'] ?? 0);
    if ($mine >= COURAGE_PER_DAY_MAX) return ['ok' => false, 'error' => 'too_many_today'];

    db_insert('courage_marks', [
        'subjectId' => $id,
        'subjectType' => (string)$s['kind'],
        'score' => $score,
        'prompt' => $prompt,
        'evidence' => $evidence,
        'markedById' => (string)$g['member']['memberId'],
        'markedByName' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''),
        'centre' => (string)($s['centre'] ?? ''),
        'observedOn' => $observedOn,
        'createdAt' => now_iso(),
    ]);

    /* The evidence is NOT mirrored into the audit meta. It is a sentence about
     * a named child's conduct, and the audit log has a wider readership than
     * the mentoring record does. The score and the day are enough to answer
     * "who marked what, when". */
    audit('courage.mark', (string)$g['member']['memberId'], $id,
          ['score' => $score, 'observedOn' => $observedOn], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'courage' => courage_index($id)];
}

/**
 * A member's own courage record.
 *
 * Unlike meetings and goals, this one IS the child's to see — the brief has the
 * index sitting on the member's own dashboard under Formation, and a ladder a
 * child is climbing without being told where they are is not formation, it is
 * assessment. The mentor's identity comes along (a child should know who is
 * watching); nothing about any other child does.
 */
function member_courage(array $p): array {
    $id = trim((string)($p['memberId'] ?? ''));
    if ($id === '') return ['ok' => false, 'error' => 'no_member'];
    if (!db_row('SELECT memberId FROM members WHERE memberId = ? LIMIT 1', [$id])) {
        return ['ok' => false, 'error' => 'not_found'];
    }
    return ['ok' => true, 'courage' => courage_index($id), 'ladder' => courage_ladder()] ;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE MENTOR'S WEEKLY REVIEW — NGGC 2040 brief §18

   Twelve questions a mentor should be able to answer for every assigned
   member, every week. Before this, a mentor's whole trace on a child was a
   star for today, a V3 rating for this week and whatever conversations they
   chose to write up — all of which record what happened, none of which record
   that somebody LOOKED.

   That distinction is the section. A child whose mentor has not reviewed them
   for three weeks is the finding the brief is asking the programme to surface,
   and it was not merely unsurfaced, it was unrecorded: there was nothing in
   the database that could have answered the question.

   So the review is stored per week, one row per (subject, period), and the
   read that matters is not any single review — it is `mentor_reviews_due`,
   the list of children nobody has reviewed. Everything else here exists to
   make that list trustworthy.
   ═══════════════════════════════════════════════════════════════════════════ */

const MENTOR_REVIEW_ANSWER_MAX = 2000;

/** The answers map for a stored row, keys guaranteed to be the brief's twelve
 *  and every one present (a missing key and an empty answer are the same thing
 *  to a reader, and a partial map makes every consumer write a fallback). */
function mentoring_review_answers($json): array {
    $raw = is_array($json) ? $json : (json_decode((string)$json, true) ?: []);
    $out = [];
    foreach (nggc_weekly_review_keys() as $k) {
        $out[$k] = is_string($raw[$k] ?? null) ? $raw[$k] : '';
    }
    return $out;
}

/** A stored review row as the client sees it. */
function mentoring_review_public(?array $r): ?array {
    if (!$r) return null;
    return [
        'period' => (string)$r['period'],
        'answers' => mentoring_review_answers($r['answers'] ?? ''),
        'answered' => (int)($r['answered'] ?? 0),
        'concern' => (int)($r['concern'] ?? 0) === 1,
        'mentorId' => (string)($r['mentorId'] ?? ''),
        'mentorName' => (string)($r['mentorName'] ?? ''),
        'updatedAt' => (string)($r['updatedAt'] ?? ''),
    ];
}

/**
 * Write (or amend) this week's review for one child.
 *
 * Gated by mentoring_open — the same centre-and-cohort pair that governs a
 * star, a meeting and a courage mark.
 *
 * AMENDS RATHER THAN APPENDS. A mentor who answers four questions on Saturday
 * and the rest on Sunday has written one review, not two, and the unique key
 * on (subjectId, period) is what makes "reviewed this week" answerable without
 * deciding which of several rows counts. A later mentor editing an earlier
 * one's review takes ownership of it — mentoring is a shared duty and the row
 * records who last looked, which is the fact the lead needs.
 */
function mentor_review_save(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $id = (string)$s['id'];

    $period = trim((string)($p['period'] ?? '')) ?: iso_week_period();
    if (!preg_match('/^\d{4}-W\d{2}$/', $period)) return ['ok' => false, 'error' => 'bad_period'];
    /* Not the future. A review written against next week is either a typo or
       somebody pre-filling a cadence they have not performed, and both make
       the "not reviewed" list lie in the direction that matters. */
    if ($period > iso_week_period()) return ['ok' => false, 'error' => 'period_ahead'];

    /* Only the brief's keys are stored. Anything else is dropped rather than
       kept, so the JSON column cannot quietly become a second, wider schema
       that no question in formation.php corresponds to. */
    $in = is_array($p['answers'] ?? null) ? $p['answers'] : [];
    $answers = [];
    $answered = 0;
    foreach (nggc_weekly_review_keys() as $k) {
        $v = trim((string)($in[$k] ?? ''));
        if ($v !== '') { $v = mb_substr($v, 0, MENTOR_REVIEW_ANSWER_MAX); $answered++; }
        $answers[$k] = $v;
    }
    /* An empty review is not a review. Saving one would let a mentor clear the
       "not reviewed" flag without answering anything, which is the one way
       this record could become worse than nothing. */
    if ($answered === 0) return ['ok' => false, 'error' => 'no_answers'];

    $now = now_iso();
    $row = [
        'answers' => json_encode($answers, JSON_UNESCAPED_UNICODE),
        'answered' => $answered,
        'concern' => !empty($p['concern']) ? 1 : 0,
        /* How they are doing against last week: better | same | worse. Two
           "worse" in a row alerts the lead (MENTORSHIP.md R3). */
        'trend' => in_array((string)($p['trend'] ?? ''), ['better', 'same', 'worse'], true) ? (string)$p['trend'] : '',
        'mentorId' => (string)$g['member']['memberId'],
        'mentorName' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''),
        'centre' => (string)($s['centre'] ?? ''),
        'updatedAt' => $now,
    ];
    $existing = db_row("SELECT id FROM mentor_reviews WHERE subjectId = ? AND period = ? LIMIT 1", [$id, $period]);
    if ($existing) {
        db_update('mentor_reviews', $row, ['id' => (int)$existing['id']]);
    } else {
        db_insert('mentor_reviews', $row + [
            'subjectId' => $id, 'subjectType' => (string)$s['kind'], 'period' => $period, 'createdAt' => $now,
        ]);
    }

    /* The answers stay out of the audit meta, as the courage evidence does:
       they are twelve sentences about a named child and the audit log has a
       wider readership than the mentoring record. */
    audit('mentor.review', (string)$g['member']['memberId'], $id,
          ['period' => $period, 'answered' => $answered, 'concern' => $row['concern']],
          (string)($p['ip'] ?? ''));

    return ['ok' => true, 'review' => mentoring_review_public(
        db_row("SELECT * FROM mentor_reviews WHERE subjectId = ? AND period = ? LIMIT 1", [$id, $period]))];
}

/** The last `n` weeks of review for one child, newest first, gaps included as
 *  gaps — an unreviewed week is the information, exactly as the V3 trend keeps
 *  its unrated weeks rather than closing them up. */
function mentoring_review_history(string $subjectId, int $weeks = 8): array {
    $rows = [];
    foreach (db_all("SELECT * FROM mentor_reviews WHERE subjectId = ? ORDER BY period DESC LIMIT ?",
                    [$subjectId, max(1, min(52, $weeks))]) as $r) {
        $rows[(string)$r['period']] = $r;
    }
    $out = [];
    for ($i = 0; $i < max(1, min(52, $weeks)); $i++) {
        $per = iso_week_period(time() - $i * 7 * 86400);
        $r = $rows[$per] ?? null;
        $out[] = $r ? ['period' => $per, 'reviewed' => true] + mentoring_review_public($r)
                    : ['period' => $per, 'reviewed' => false, 'answered' => 0, 'concern' => false];
    }
    return $out;
}

/**
 * Who has NOT been reviewed this week.
 *
 * The point of §18. Scoped exactly like the roster, so a mentor gets their own
 * class and a lead gets their centre, and it reuses mentor_roster rather than
 * re-deriving who is in reach — two answers to "whose children are these"
 * would drift, and the one that drifts silently is the one that decides
 * whether a child appears on a list nobody is watching.
 */
function mentor_reviews_due(array $p): array {
    $g = mentor_gate($p);
    if (empty($g['ok'])) return $g;

    $period = trim((string)($p['period'] ?? '')) ?: iso_week_period();
    if (!preg_match('/^\d{4}-W\d{2}$/', $period)) return ['ok' => false, 'error' => 'bad_period'];

    $roster = mentor_roster($p);
    if (empty($roster['ok'])) return $roster;
    $students = $roster['students'] ?? [];
    if (!$students) {
        return ['ok' => true, 'period' => $period, 'due' => [], 'done' => [],
                'total' => 0, 'reviewed' => 0, 'questions' => nggc_weekly_review()];
    }

    // One query for the whole class, not one per child.
    $ids = array_values(array_unique(array_map(static fn($s) => (string)$s['studentId'], $students)));
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $have = [];
    foreach (db_all("SELECT subjectId, answered, concern, mentorName, updatedAt
                     FROM mentor_reviews WHERE period = ? AND subjectId IN $in",
                    array_merge([$period], $ids)) as $r) {
        $have[(string)$r['subjectId']] = $r;
    }

    $due = []; $done = [];
    foreach ($students as $s) {
        $sid = (string)$s['studentId'];
        $base = ['subjectId' => $sid, 'fullName' => (string)($s['fullName'] ?? ''),
                 'centre' => (string)($s['centre'] ?? ''), 'kind' => (string)($s['kind'] ?? 'member')];
        if (isset($have[$sid])) {
            $r = $have[$sid];
            $done[] = $base + ['answered' => (int)$r['answered'], 'concern' => (int)$r['concern'] === 1,
                               'mentorName' => (string)$r['mentorName'], 'updatedAt' => (string)$r['updatedAt']];
        } else {
            $due[] = $base;
        }
    }

    return ['ok' => true, 'period' => $period, 'due' => $due, 'done' => $done,
            'total' => count($students), 'reviewed' => count($done),
            'questions' => nggc_weekly_review()];
}
