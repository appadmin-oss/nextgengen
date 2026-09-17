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
    return ['ok' => true, 'g' => $g, 'subject' => $s];
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

    $goals = db_all("SELECT id, goal, dueOn, status, closedOn, setById, setByName, createdAt
                     FROM mentor_goals WHERE subjectId = ?
                     ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, dueOn, id DESC LIMIT 60", [$id]);
    $today = gmdate('Y-m-d');
    foreach ($goals as &$gl) {
        $gl['id'] = (int)$gl['id'];
        $gl['overdue'] = $gl['status'] === 'open' && trim((string)$gl['dueOn']) !== '' && (string)$gl['dueOn'] < $today;
    }
    unset($gl);

    /* The Courage Index, on the same call as everything else. This screen is
       opened with the child in front of the mentor, and the brief puts courage
       beside the meetings and the goals rather than behind another tap. */
    $courage = courage_index($id, 40);

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
        return ['ok' => true, 'id' => $id];
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
    if ($concern) {
        foreach (mentoring_leads((string)($s['centre'] ?? ''), $me) as $leadId) {
            push_notification($leadId, ['kind' => 'mentor',
                'title' => 'A mentor has raised a concern',
                'body' => (string)$s['fullName'] . ' — logged by ' . (string)($g['mentor']['fullName'] ?? 'a mentor') . '.',
                'linkPage' => 'mentor']);
        }
    }
    return ['ok' => true, 'id' => $newId];
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

    $goal = trim((string)($p['goal'] ?? ''));
    if ($goal === '') return ['ok' => false, 'error' => 'empty'];
    if (mb_strlen($goal) > 500) return ['ok' => false, 'error' => 'too_long'];
    $dueOn = trim((string)($p['dueOn'] ?? ''));
    if ($dueOn !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueOn)) $dueOn = '';
    $now = now_iso();
    $id = (int)($p['id'] ?? 0);

    if ($id > 0) {
        $row = db_row('SELECT * FROM mentor_goals WHERE id = ? LIMIT 1', [$id]);
        if (!$row) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'wrong_subject'];
        db_update('mentor_goals', ['goal' => $goal, 'dueOn' => $dueOn, 'updatedAt' => $now], ['id' => $id]);
        audit('mentor.goal.update', $me, (string)$s['id'], ['id' => $id], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'id' => $id];
    }

    $newId = db_insert('mentor_goals', [
        'subjectId' => (string)$s['id'], 'subjectType' => (string)$s['kind'], 'goal' => $goal,
        'setById' => $me, 'setByName' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''),
        'dueOn' => $dueOn, 'status' => 'open', 'closedOn' => '', 'closedById' => '',
        'centre' => (string)($s['centre'] ?? ''), 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('mentor.goal.add', $me, (string)$s['id'], ['id' => $newId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'id' => $newId];
}

/**
 * Close or reopen a goal.
 *
 * 'dropped' exists on purpose. Without it the only way to clear a goal that
 * stopped being the right goal is to mark it done, and a record where
 * everything is always achieved is a record nobody believes.
 */
function mentor_goal_status(array $p): array {
    $o = mentoring_open($p);
    if (empty($o['ok'])) return $o;
    $g = $o['g']; $s = $o['subject'];
    $me = (string)$g['member']['memberId'];
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['open', 'done', 'dropped'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $row = db_row('SELECT * FROM mentor_goals WHERE id = ? LIMIT 1', [$id]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['subjectId'] !== (string)$s['id']) return ['ok' => false, 'error' => 'wrong_subject'];
    db_update('mentor_goals', [
        'status' => $status,
        'closedOn' => $status === 'open' ? '' : gmdate('Y-m-d'),
        'closedById' => $status === 'open' ? '' : $me,
        'updatedAt' => now_iso(),
    ], ['id' => $id]);
    audit('mentor.goal.status', $me, (string)$s['id'], ['id' => $id, 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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

    $in = '(' . implode(',', array_fill(0, count($use), '?')) . ')';
    $since = gmdate('Y-m-d', time() - 60 * 86400);
    $concerns = db_all("SELECT id, subjectId, subjectType, metOn, kind, discussed, agreed, mentorName, centre
                        FROM mentor_meetings WHERE concern = 1 AND centre IN $in AND metOn >= ?
                        ORDER BY metOn DESC, id DESC LIMIT 60", array_merge($use, [$since]));
    $today = gmdate('Y-m-d');
    $overdue = db_all("SELECT id, subjectId, goal, dueOn, setByName, centre FROM mentor_goals
                       WHERE status = 'open' AND dueOn <> '' AND dueOn < ? AND centre IN $in
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
