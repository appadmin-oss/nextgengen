<?php
declare(strict_types=1);

/**
 * HOW DID TODAY GO — asked after every lesson, answered in one tap.
 *
 * This and `domain/testimonials.php` were once one thing, and the one thing
 * was wrong. A member is asked for a TESTIMONIAL after every session — the
 * twelve-week block, four a year, a considered sentence that may end up on
 * the public site. That is not a question you can ask somebody twenty-four
 * times a term. What you ask every Saturday is smaller and entirely private:
 * did that land?
 *
 * ── WHY A SIGNAL AND NOT A BOX ──────────────────────────────────────────────
 *
 * A text box at the end of every lesson gets answered twice and then never
 * again, and what it collects is unusable anyway: forty paragraphs an
 * instructor has no time to read. A child taps one of three words in two
 * seconds, every week, and what comes out is a distribution — which is the
 * only form of this that a person can act on before next Saturday.
 *
 *   got    I could do it
 *   mostly I could follow, but I'd need help
 *   lost   I could not follow
 *
 * The words are optional and asked for SECOND, and only one question is put:
 * what was hard. A child who taps "lost" and writes nothing has still told
 * the programme the most important thing about that lesson.
 *
 * ── THE RULES ───────────────────────────────────────────────────────────────
 *
 * 1. NEVER PUBLISHED, ever, by anybody. There is no publish op on this file
 *    and there must never be one. This is a child saying they did not
 *    understand; it belongs to the people who teach them and nowhere else.
 * 2. SEEN BY THE PEOPLE WHO CAN ACT. Their instructor, for their own courses
 *    and centre, and admins holding `curriculum` within their centre scope.
 * 3. ONE PER MEMBER PER LESSON, changeable. A child who taps "lost", then
 *    reads it again and gets it, taps "got" — that is the same answer
 *    corrected, not a second one.
 * 4. NEVER REQUIRED, and never a gate. Skipping is not recorded as anything.
 * 5. IT MUST PAY FOR ITSELF. `staff_lesson_feedback()` does not hand back a
 *    list of rows to read. It answers the question the instructor actually
 *    has — WHICH LESSONS ARE NOT LANDING — worst first, with the words from
 *    the children who were lost attached to the lesson they were lost in.
 *    Feedback nobody reads is worse than no feedback: it costs the child the
 *    tap and buys them nothing.
 */

const LFB_SIGNALS = ['got', 'mostly', 'lost'];
const LFB_BODY_MAX = 400;
/** A lesson needs this many answers before its score means anything. */
const LFB_MIN_VOICES = 3;
/** Rows a staff screen will pull back at once. */
const LFB_BOARD_MAX = 120;

/** What each tap says, in the words the member reads. One place, so the
 *  screen and the staff board cannot drift into describing it differently. */
const LFB_SIGNAL_LABEL = [
    'got'    => 'I could do it',
    'mostly' => 'I could follow, but I would need help',
    'lost'   => 'I could not follow',
];

/** How badly a lesson landed, 0 (everyone got it) to 100 (nobody did). */
function lfb_miss_pct(array $tally): int {
    $n = (int)($tally['got'] ?? 0) + (int)($tally['mostly'] ?? 0) + (int)($tally['lost'] ?? 0);
    if ($n === 0) return 0;
    /* A "mostly" is half a miss. A lesson most of a class could only follow
       with help has not been taught yet either, and counting only `lost`
       hides exactly that lesson. */
    return (int)round(((int)($tally['lost'] ?? 0) + (int)($tally['mostly'] ?? 0) / 2) * 100 / $n);
}

/** One row as the member sees their own. */
function lfb_mine(?array $r): ?array {
    if (!$r) return null;
    return ['signal' => (string)$r['signal'], 'body' => (string)$r['body'], 'at' => (string)$r['updatedAt']];
}

/**
 * The member answers. An empty signal takes the answer back entirely — the
 * same escape the testimonial has, for the same reason: a child who said
 * "lost" in a bad mood and does not want it on their record may remove it.
 */
function member_lesson_feedback_give(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];

    $unitId = (string)($p['unitId'] ?? '');
    $units = function_exists('curriculum_member_units') ? curriculum_member_units($m) : [];
    if ($unitId === '' || !isset($units[$unitId])) return ['ok' => false, 'error' => 'not_found'];

    $signal = (string)($p['signal'] ?? '');
    $body = function_exists('curriculum_clean_text')
        ? curriculum_clean_text($p['body'] ?? '', LFB_BODY_MAX)
        : mb_substr(trim((string)($p['body'] ?? '')), 0, LFB_BODY_MAX);
    $existing = db_row('SELECT * FROM lesson_feedback WHERE memberId = ? AND unitId = ? LIMIT 1', [(string)$m['memberId'], $unitId]);

    if ($signal === '') {
        if ($existing) { db_exec('DELETE FROM lesson_feedback WHERE id = ?', [$existing['id']]); return ['ok' => true, 'removed' => true]; }
        return ['ok' => false, 'error' => 'no_signal'];
    }
    if (!in_array($signal, LFB_SIGNALS, true)) return ['ok' => false, 'error' => 'bad_signal'];

    $now = now_iso();
    $row = ['signal' => $signal, 'body' => $body, 'course' => (string)($units[$unitId]['unit']['course'] ?? ''),
            'centre' => (string)($m['centre'] ?? ''), 'updatedAt' => $now];
    if ($existing) db_update('lesson_feedback', $row, ['id' => $existing['id']]);
    else db_insert('lesson_feedback', $row + ['fid' => 'LFB-' . strtoupper(rand_hex(5)), 'memberId' => (string)$m['memberId'],
                                              'unitId' => $unitId, 'createdAt' => $now]);
    return ['ok' => true, 'mine' => lfb_mine(db_row('SELECT * FROM lesson_feedback WHERE memberId = ? AND unitId = ?', [(string)$m['memberId'], $unitId]))];
}

/** What this member already said about this lesson, so the taps show their answer. */
function member_lesson_feedback_mine(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    return ['ok' => true, 'mine' => lfb_mine(db_row('SELECT * FROM lesson_feedback WHERE memberId = ? AND unitId = ? LIMIT 1',
                                                    [(string)$m['memberId'], (string)($p['unitId'] ?? '')]))];
}

/**
 * The staff side, and the whole point of the feature.
 *
 * Returns the lessons their members answered about, **worst first**, each with
 * its tally, its miss score and the words from the children who struggled.
 * Three grouped queries for any number of lessons — a per-lesson query inside
 * this loop is the N+1 this codebase has had to undo twice.
 *
 * `$scope` is a resolved reach: ['centres' => null|list, 'courses' => null|list],
 * null meaning "everywhere" / "every course". Both gates below produce one.
 */
function lfb_board(array $scope, string $course = '', int $limit = LFB_BOARD_MAX): array {
    $where = '1 = 1'; $args = [];
    if (($scope['centres'] ?? null) !== null) {
        if (!$scope['centres']) return ['lessons' => [], 'voices' => 0];
        $where .= ' AND f.centre IN (' . implode(',', array_fill(0, count($scope['centres']), '?')) . ')';
        $args = array_merge($args, $scope['centres']);
    }
    if ($course !== '') { $where .= ' AND lower(f.course) = ?'; $args[] = mb_strtolower($course); }

    $rows = db_all("SELECT f.unitId, f.signal, COUNT(*) n FROM lesson_feedback f WHERE $where GROUP BY f.unitId, f.signal", $args);
    if (!$rows) return ['lessons' => [], 'voices' => 0];
    $tally = []; $voices = 0;
    foreach ($rows as $r) { $tally[(string)$r['unitId']][(string)$r['signal']] = (int)$r['n']; $voices += (int)$r['n']; }

    $ids = array_keys($tally);
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $units = [];
    foreach (db_all("SELECT unitId, course, level, week, title FROM curriculum_units WHERE unitId IN $in", $ids) as $u) {
        $units[(string)$u['unitId']] = $u;
    }
    /* The words, only from the children who did not follow. A "got it" with a
       nice note attached is pleasant and is not why anybody opened this. */
    $said = [];
    foreach (db_all("SELECT unitId, signal, body, updatedAt FROM lesson_feedback
                     WHERE unitId IN $in AND body <> '' AND signal IN ('lost','mostly') ORDER BY updatedAt DESC", $ids) as $r) {
        $u = (string)$r['unitId'];
        if (count($said[$u] ?? []) >= 8) continue;      // enough to see the pattern
        $said[$u][] = ['signal' => (string)$r['signal'], 'body' => (string)$r['body'], 'at' => (string)$r['updatedAt']];
    }

    $out = [];
    foreach ($tally as $unitId => $t) {
        $u = $units[$unitId] ?? null;
        if (!$u) continue;                                // a retired or deleted lesson
        if (($scope['courses'] ?? null) !== null && !in_array((string)$u['course'], (array)$scope['courses'], true)) continue;
        $n = (int)($t['got'] ?? 0) + (int)($t['mostly'] ?? 0) + (int)($t['lost'] ?? 0);
        $out[] = [
            'unitId' => (string)$unitId, 'title' => (string)$u['title'], 'course' => (string)$u['course'],
            'week' => (int)$u['week'], 'level' => (string)$u['level'],
            'got' => (int)($t['got'] ?? 0), 'mostly' => (int)($t['mostly'] ?? 0), 'lost' => (int)($t['lost'] ?? 0),
            'voices' => $n, 'missPct' => lfb_miss_pct($t),
            /* Said plainly, because "42% miss" is a number and "most of them
               could not follow this" is a thing to do something about. */
            'enough' => $n >= LFB_MIN_VOICES,
            'said' => $said[$unitId] ?? [],
        ];
    }
    /* Worst first, and a lesson too few people answered about never outranks
       one a whole class struggled with. */
    usort($out, static function ($a, $b) {
        if ($a['enough'] !== $b['enough']) return $a['enough'] ? -1 : 1;
        if ($a['missPct'] !== $b['missPct']) return $b['missPct'] <=> $a['missPct'];
        return $b['voices'] <=> $a['voices'];
    });
    return ['lessons' => array_slice($out, 0, max(1, $limit)), 'voices' => $voices];
}

/** staff.curriculum.feedback — the instructor's own courses and centre. */
function staff_lesson_feedback(array $p): array {
    $g = function_exists('curriculum_staff_gate') ? curriculum_staff_gate($p) : ['ok' => false, 'error' => 'forbidden'];
    if (!$g['ok']) return $g;
    $b = lfb_board(['centres' => $g['centres'] ?? null, 'courses' => $g['courses'] ?? null], (string)($p['course'] ?? ''));
    return ['ok' => true] + $b + ['labels' => LFB_SIGNAL_LABEL, 'minVoices' => LFB_MIN_VOICES];
}

/** admin.curriculum.feedback — the Control Room, within the admin's centres. */
function admin_lesson_feedback(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $centres = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    $b = lfb_board(['centres' => $centres, 'courses' => null], (string)($p['course'] ?? ''));
    return ['ok' => true] + $b + ['labels' => LFB_SIGNAL_LABEL, 'minVoices' => LFB_MIN_VOICES];
}
