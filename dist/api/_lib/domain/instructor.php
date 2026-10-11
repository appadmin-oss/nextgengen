<?php
declare(strict_types=1);

/**
 * The teaching record — what an instructor knows that nobody else does.
 *
 * A mentor observes CHARACTER across a centre. An instructor observes
 * LEARNING inside one course, with the same twenty children twice a week for
 * ninety minutes. The portal gave both the same tool — stars and a weekly V3 —
 * which is right for the first job and thin for the second. Stars answer "how
 * did they behave today". Nothing answered "can this child do the thing I
 * taught them", which is the only question a certificate should be built on.
 *
 * Three objects, in the order they matter:
 *
 *   SESSION LOG  one row per course per centre per day. This is what makes an
 *                instructor's screen a class rather than a list of children.
 *   REMARKS      a running, timestamped thread per child, shared with the
 *                mentor and admin — never with parents.
 *   SKILL MARKS  named competencies per course, four levels, no numbers.
 *
 * Everything here reuses mentor_gate() for reach, so an instructor sees their
 * courses, a mentor their centre, and an admin whatever their capabilities
 * allow — one access model, not a second one that drifts.
 */

/* ── The competency catalogue ────────────────────────────────────────────────
 * Verb-led and observable: "plays hands together", not "musicality". An
 * instructor should be able to answer each one from the room without
 * interpretation, and a child should recognise the description of what they
 * just learned to do.
 *
 * These are a starting point for the coordinators to correct, not a
 * curriculum — admin-editable in exactly the way the behaviour presets and
 * the course catalogue are.
 */
const COURSE_SKILL_DEFAULTS = [
    'Practical Coding' => [
        'Reads an error message and acts on it',
        'Writes a loop that does what they meant',
        'Breaks a problem into steps before coding',
        'Names variables so someone else can read them',
        'Finishes a small program end to end',
    ],
    'AI Tools Application & Digital Problem Solving' => [
        'Writes a prompt that gets a usable answer',
        'Checks an AI answer against a real source',
        'Picks the right tool for the task',
        'Says what the tool cannot be trusted with',
        'Solves a real task start to finish with one',
    ],
    'Google Workspace' => [
        'Creates and shares a document safely',
        'Builds a sheet with a working formula',
        'Makes a deck that reads from the back of the room',
        'Keeps files and folders findable',
        'Uses comments to work with someone else',
    ],
    'Graphics Design' => [
        'Aligns to a grid',
        'Chooses type that can actually be read',
        'Builds a palette that holds together',
        'Exports at the right size and format',
        'Takes feedback into a second version',
    ],
    'Video Editing' => [
        'Cuts so the story carries',
        'Balances audio so speech is clear',
        'Adds titles that stay legible',
        'Corrects colour between shots',
        'Exports for the platform asked for',
    ],
    'Tie & Dye' => [
        'Prepares fabric and workspace safely',
        'Folds and binds for a chosen pattern',
        'Mixes dye to the right strength',
        'Controls timing and rinsing',
        'Finishes a piece good enough to sell',
    ],
    'Catering' => [
        'Works clean and handles food safely',
        'Measures and follows a recipe',
        'Controls heat and timing',
        'Plates with care',
        'Works out what a dish costs',
    ],
    'Dance / Acting' => [
        'Holds a rhythm or a beat',
        'Remembers and performs a sequence',
        'Uses voice and body deliberately',
        'Works with a partner or ensemble',
        'Performs in front of other people',
    ],
    'Drawing & Visual Design' => [
        'Observes and draws proportion',
        'Uses light and shadow',
        'Composes within the frame',
        'Develops an idea through sketches',
        'Finishes a piece rather than abandoning it',
    ],
    'Talking Drums' => [
        'Holds a steady pulse',
        'Plays the core patterns cleanly',
        'Follows and answers a call',
        'Changes tone with tension',
        'Plays in time with the ensemble',
    ],
    'Piano' => [
        'Names notes and finds them',
        'Plays hands together',
        'Keeps time through a whole piece',
        'Reads simple notation',
        'Performs a piece start to finish',
    ],
    'Guitar' => [
        'Tunes the instrument',
        'Forms the core chords cleanly',
        'Changes chord in time',
        'Keeps a strumming pattern steady',
        'Plays a song start to finish',
    ],
];

/* Four levels, deliberately not a score out of anything. A number invites a
 * ranking between children; these describe what one child can now do. */
const SKILL_LEVELS = [1 => 'not yet', 2 => 'getting there', 3 => 'can do it', 4 => 'can teach it'];

/** The skills for one course — admin overrides first, seeded defaults second,
 *  empty if the course is not one we have named skills for. */
function course_skills(string $course): array {
    $saved = setting_get('course_skills');
    if (is_array($saved) && isset($saved[$course]) && is_array($saved[$course])) {
        $out = [];
        foreach ($saved[$course] as $s) {
            $s = trim((string)$s);
            if ($s !== '' && mb_strlen($s) <= 120 && !in_array($s, $out, true)) $out[] = $s;
        }
        // An empty override is a real answer — "this course has no skill list"
        // — and must not silently fall back to the seed.
        return array_slice($out, 0, 12);
    }
    return COURSE_SKILL_DEFAULTS[$course] ?? [];
}

/** Every course's skills, for the admin editor. Courses come from the live
 *  catalogue, so a course added there appears here with its seed or blank. */
function course_skills_all(): array {
    $out = [];
    foreach (academy_courses() as $c) $out[$c] = course_skills($c);
    return $out;
}

function admin_course_skills_save(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $in = is_array($p['skills'] ?? null) ? $p['skills'] : [];
    $clean = [];
    foreach ($in as $course => $skills) {
        $course = trim((string)$course);
        if ($course === '' || !is_array($skills)) continue;
        $list = [];
        foreach ($skills as $s) {
            $s = trim((string)$s);
            if ($s !== '' && mb_strlen($s) <= 120 && !in_array($s, $list, true)) $list[] = $s;
        }
        $clean[$course] = array_slice($list, 0, 12);
    }
    setting_set('course_skills', $clean, (string)$g['requester']['memberId']);
    audit('summer.skills.set', (string)$g['requester']['memberId'], '', ['courses' => count($clean)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'skills' => course_skills_all()];
}


/* ── Session log ─────────────────────────────────────────────────────────────
 * Two taps to file: what we covered, and how the room went.
 *
 * Attendance is already recorded at the gate, so the log stores only the
 * EXCEPTIONS an instructor corrected — the child the scanner missed, the one
 * who left at half time. Storing the roll itself would fork the truth: the
 * gate would say one thing, the log another, and there would be no way to
 * know which was right an hour later.
 */

/** Which course this person is filing for, and whether they may. */
function instructor_course_ok(array $g, string $course): bool {
    if ($course === '') return false;
    $courses = $g['courses'] ?? null;
    return $courses === null || in_array($course, $courses, true);
}

/** The class for one course on one day: who the gate says was here, plus any
 *  correction already filed, plus the log itself if it exists. */
function instructor_session_get(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $course = trim((string)($p['course'] ?? ''));
    $centre = trim((string)($p['centre'] ?? ''));
    $date   = trim((string)($p['date'] ?? '')) ?: gmdate('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    if (!instructor_course_ok($g, $course)) return ['ok' => false, 'error' => 'not_your_course'];
    // A centre must be named and inside reach — an instructor's own centre is
    // filled in by the client, an admin picks one.
    $reach = $g['centres'] ?? null;
    if ($centre === '' && $reach !== null && count($reach) === 1) $centre = $reach[0];
    if ($centre === '') return ['ok' => false, 'error' => 'no_centre'];
    if ($reach !== null && !in_array($centre, $reach, true)) return ['ok' => false, 'error' => 'not_your_centre'];

    $roster = db_all("SELECT studentId, fullName, photoUrl FROM summer_students
                      WHERE status = 'active' AND centre = ? AND track = ? ORDER BY fullName LIMIT 200",
                     [$centre, $course]);
    $ids = array_column($roster, 'studentId');
    $scanned = [];
    if ($ids) {
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT studentId FROM attendance WHERE date = ? AND studentId IN $in",
                        array_merge([$date], $ids)) as $r) $scanned[(string)$r['studentId']] = true;
    }

    $log = db_row("SELECT * FROM course_sessions WHERE course = ? AND centre = ? AND date = ? LIMIT 1",
                  [$course, $centre, $date]);
    $addP = $log ? (safe_json((string)$log['markedPresent']) ?: []) : [];
    $addA = $log ? (safe_json((string)$log['markedAbsent']) ?: []) : [];

    $students = [];
    foreach ($roster as $r) {
        $id = (string)$r['studentId'];
        // Gate scan first, then the instructor's correction on top of it.
        $here = isset($scanned[$id]);
        if (in_array($id, $addP, true)) $here = true;
        if (in_array($id, $addA, true)) $here = false;
        $students[] = [
            'studentId' => $id, 'fullName' => (string)$r['fullName'], 'photoUrl' => (string)($r['photoUrl'] ?? ''),
            'present' => $here,
            // So the UI can show WHY someone is marked the way they are — a
            // scan and an override look identical otherwise.
            'scanned' => isset($scanned[$id]),
            'overridden' => in_array($id, $addP, true) || in_array($id, $addA, true),
        ];
    }

    return ['ok' => true, 'course' => $course, 'centre' => $centre, 'date' => $date,
        'role' => (string)($g['role'] ?? 'mentor'),
        'courses' => $g['courses'] ?? academy_courses(),
        'students' => $students,
        'log' => $log ? [
            'sessionLogId' => (string)$log['sessionLogId'],
            'covered' => (string)$log['covered'],
            'roomScore' => (int)$log['roomScore'],
            'presentCount' => (int)$log['presentCount'],
            'absentCount' => (int)$log['absentCount'],
            'instructorName' => (string)$log['instructorName'],
            'updatedAt' => (string)$log['updatedAt'],
        ] : null,
        'skills' => course_skills($course),
        'levels' => SKILL_LEVELS];
}

/** File (or refile) the log. Upsert on course+centre+date, because an
 *  instructor who realises at 6pm they forgot a line should edit today's
 *  entry, not create a second one. */
function instructor_session_save(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $me = $g['member'];
    $course = trim((string)($p['course'] ?? ''));
    $centre = trim((string)($p['centre'] ?? ''));
    $date   = trim((string)($p['date'] ?? '')) ?: gmdate('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    if (!instructor_course_ok($g, $course)) return ['ok' => false, 'error' => 'not_your_course'];
    $reach = $g['centres'] ?? null;
    if ($centre === '' && $reach !== null && count($reach) === 1) $centre = $reach[0];
    if ($centre === '') return ['ok' => false, 'error' => 'no_centre'];
    if ($reach !== null && !in_array($centre, $reach, true)) return ['ok' => false, 'error' => 'not_your_centre'];

    $covered = substr(trim((string)($p['covered'] ?? '')), 0, 1000);
    $room = (int)($p['roomScore'] ?? 0);
    if ($room !== 0 && ($room < 1 || $room > 5)) return ['ok' => false, 'error' => 'bad_score'];
    // A log with neither is not a log. Filing an empty one would tick the
    // "did they record today" box while saying nothing at all.
    if ($covered === '' && $room === 0) return ['ok' => false, 'error' => 'nothing_to_record'];

    /* Corrections are only accepted for children actually in this class.
     * Anything else is a typo or a script, and either way must not create a
     * record about a child the instructor does not teach. */
    $valid = array_column(db_all("SELECT studentId FROM summer_students
                                  WHERE status = 'active' AND centre = ? AND track = ?", [$centre, $course]), 'studentId');
    $clean = function ($v) use ($valid) {
        $v = is_array($v) ? $v : [];
        return array_values(array_unique(array_filter(array_map('strval', $v), fn($x) => in_array($x, $valid, true))));
    };
    $addP = $clean($p['markedPresent'] ?? []);
    $addA = $clean($p['markedAbsent'] ?? []);
    // A child cannot be both. The later list wins rather than the record
    // holding a contradiction nobody can resolve afterwards.
    $addP = array_values(array_diff($addP, $addA));

    $scanned = [];
    if ($valid) {
        $in = '(' . implode(',', array_fill(0, count($valid), '?')) . ')';
        foreach (db_all("SELECT studentId FROM attendance WHERE date = ? AND studentId IN $in",
                        array_merge([$date], $valid)) as $r) $scanned[(string)$r['studentId']] = true;
    }
    $present = 0;
    foreach ($valid as $id) {
        $here = isset($scanned[$id]);
        if (in_array($id, $addP, true)) $here = true;
        if (in_array($id, $addA, true)) $here = false;
        if ($here) $present++;
    }

    $now = now_iso();
    $row = [
        'course' => $course, 'centre' => $centre, 'date' => $date,
        'instructorId' => (string)$me['memberId'],
        'instructorName' => (string)($g['mentor']['fullName'] ?? $me['fullName'] ?? ''),
        'covered' => $covered, 'roomScore' => $room,
        'presentCount' => $present, 'absentCount' => max(0, count($valid) - $present),
        'markedPresent' => json_encode($addP, JSON_UNESCAPED_SLASHES),
        'markedAbsent' => json_encode($addA, JSON_UNESCAPED_SLASHES),
        'updatedAt' => $now,
    ];
    $existing = db_row("SELECT id, sessionLogId FROM course_sessions WHERE course = ? AND centre = ? AND date = ? LIMIT 1",
                       [$course, $centre, $date]);
    if ($existing) {
        db_update('course_sessions', $row, ['id' => (int)$existing['id']]);
        $id = (string)$existing['sessionLogId'];
    } else {
        $id = new_id('CS', 'course_sessions', 'sessionLogId');
        db_insert('course_sessions', $row + ['sessionLogId' => $id, 'createdAt' => $now]);
    }
    audit('instructor.session.save', (string)$me['memberId'], $id,
          ['course' => $course, 'centre' => $centre, 'date' => $date, 'present' => $present], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sessionLogId' => $id, 'presentCount' => $present,
            'absentCount' => max(0, count($valid) - $present)];
}


/* ── Remarks ─────────────────────────────────────────────────────────────────
 * Deliberately not a behaviour_log and deliberately not a star.
 *
 * A star is capped at one per child per day, because it is a reward. A
 * behaviour_log is one classified observation with a review workflow. A remark
 * is neither: "she finally got recursion" and "he was quiet again" are both
 * worth writing on the same afternoon, and the mentor who talks to that child
 * on Saturday should arrive already knowing what the coding instructor saw.
 *
 * The AI categorises and flags. It never writes the remark — the words are
 * the point, and a generated observation about a child is worth nothing.
 */

const REMARK_KINDS = ['progress', 'concern', 'strength', 'parent-worthy'];

/** Resolve a child the author may write about, in whichever cohort. */
function remark_subject(array $g, string $subjectId): ?array {
    $s = null;
    if (mentor_covers($g, 'summer')) {
        $s = db_row("SELECT studentId, fullName, centre, track FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
        if ($s) $s['kind'] = 'student';
    }
    if (!$s && mentor_covers($g, 'ngg')) {
        $s = db_row("SELECT memberId studentId, fullName, centre, track FROM members WHERE memberId = ? AND type = 'NGG' LIMIT 1", [$subjectId]);
        if ($s) $s['kind'] = 'member';
    }
    if (!$s || !mentor_scope_ok($g, $s)) return null;
    return $s;
}

function remark_add(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $me = $g['member'];
    $kind = (string)($p['kind'] ?? '');
    if (!in_array($kind, REMARK_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'empty_remark'];
    $body = mb_substr($body, 0, 1200);

    $s = remark_subject($g, (string)($p['subjectId'] ?? ''));
    // Same reasoning as the star path: 'not_found' rather than 'not_yours', so
    // a probe cannot learn that an id it may not touch exists.
    if (!$s) return ['ok' => false, 'error' => 'not_found'];

    /* Classification is advisory. A "concern" the author typed stays a
     * concern whatever the model thinks — the author was in the room. What the
     * classifier adds is the safeguarding flag, which is the one thing nobody
     * should have to remember to tick. */
    $cls = behaviour_classify($body);
    $safeguarding = ($cls['severity'] === 'urgent' || $cls['category'] === 'wellbeing') ? 1 : 0;

    $id = new_id('RMK', 'student_remarks', 'remarkId');
    db_insert('student_remarks', [
        'remarkId' => $id,
        'subjectId' => (string)$s['studentId'], 'subjectName' => (string)$s['fullName'],
        'subjectType' => (string)$s['kind'],
        'course' => (string)($s['track'] ?? ''), 'centre' => (string)($s['centre'] ?? ''),
        'authorId' => (string)$me['memberId'],
        'authorName' => (string)($g['mentor']['fullName'] ?? $me['fullName'] ?? ''),
        'authorRole' => (string)($g['role'] ?? 'mentor'),
        'kind' => $kind, 'body' => $body,
        'category' => (string)$cls['category'], 'severity' => (string)$cls['severity'],
        'aiSource' => (string)($cls['aiSource'] ?? 'rules'),
        'safeguarding' => $safeguarding, 'status' => 'open',
        'createdAt' => now_iso(),
    ]);

    /* A safeguarding flag has to reach a human who can act tonight, and
     * 'behaviour.flagged' is the event the admins are already subscribed to.
     * Writing the flag into a row nobody is watching is the same as not
     * raising it — and a second event name would need every integration
     * reconfigured before anyone saw one. */
    if ($safeguarding) {
        event_emit('behaviour.flagged', [
            'ref' => $id, 'subject' => (string)$s['fullName'], 'subjectId' => (string)$s['studentId'],
            'category' => (string)$cls['category'], 'severity' => (string)$cls['severity'],
            'by' => (string)($g['mentor']['fullName'] ?? $me['fullName'] ?? ''),
        ]);
    }
    audit('remark.add', (string)$me['memberId'], (string)$s['studentId'],
          ['kind' => $kind, 'safeguarding' => $safeguarding], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'remarkId' => $id, 'safeguarding' => (bool)$safeguarding,
            'category' => (string)$cls['category'], 'severity' => (string)$cls['severity'],
            'aiSource' => (string)($cls['aiSource'] ?? 'rules')];
}

/** The thread for one child. Staff-only, and gated by the same reach as
 *  everything else — an instructor reads the mentor's remarks about a child
 *  they share, which is the whole point of the thread. */
function remark_list(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $s = remark_subject($g, (string)($p['subjectId'] ?? ''));
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    $rows = db_all("SELECT remarkId, kind, body, authorName, authorRole, category, severity,
                           safeguarding, status, acknowledgedBy, acknowledgedAt, course, createdAt
                    FROM student_remarks WHERE subjectId = ? ORDER BY id DESC LIMIT 100", [(string)$s['studentId']]);
    foreach ($rows as &$r) { $r['safeguarding'] = (bool)$r['safeguarding']; }
    unset($r);
    return ['ok' => true, 'subjectId' => (string)$s['studentId'], 'subjectName' => (string)$s['fullName'],
            'kinds' => REMARK_KINDS, 'remarks' => $rows];
}

/** Acknowledge a flagged remark — an admin saying "seen, handled". Only the
 *  people who can act on a safeguarding flag may close one. */
function remark_ack(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = trim((string)($p['remarkId'] ?? ''));
    $r = db_row("SELECT id, subjectId FROM student_remarks WHERE remarkId = ? LIMIT 1", [$id]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    db_update('student_remarks', ['status' => 'acknowledged',
        'acknowledgedBy' => (string)$g['requester']['memberId'], 'acknowledgedAt' => now_iso()], ['id' => (int)$r['id']]);
    audit('remark.ack', (string)$g['requester']['memberId'], (string)$r['subjectId'], ['remarkId' => $id], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}


/* ── Skill marks ─────────────────────────────────────────────────────────────
 * One row per child per course per named skill, latest level wins. Marking is
 * idempotent: an instructor revising "getting there" to "can do it" in week
 * six should overwrite, not append, because the question is what the child
 * can do NOW.
 */

function instructor_skills_mark(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $me = $g['member'];
    $course = trim((string)($p['course'] ?? ''));
    if (!instructor_course_ok($g, $course)) return ['ok' => false, 'error' => 'not_your_course'];
    $known = course_skills($course);
    if (!$known) return ['ok' => false, 'error' => 'no_skills_for_course'];

    $s = remark_subject($g, (string)($p['subjectId'] ?? ''));
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    // The course has to be the child's own. Marking a Piano skill on a child
    // who takes Guitar is not a permission question, it is a nonsense record.
    if (trim((string)($s['track'] ?? '')) !== $course) return ['ok' => false, 'error' => 'not_their_course'];

    $in = is_array($p['marks'] ?? null) ? $p['marks'] : [];
    if (!$in) return ['ok' => false, 'error' => 'no_marks'];
    $evidence = is_array($p['evidence'] ?? null) ? $p['evidence'] : [];
    $now = now_iso(); $saved = 0;
    /* Moving a child UP a level needs a line of evidence — what they did that
     * showed it (RESEARCH R8: a bare number without a descriptor and evidence
     * is not a reliable mark). Checked for the whole payload before any write,
     * so a half-saved board never happens. Holding or lowering a level does not. */
    $plan = []; $needs = [];
    foreach ($in as $skill => $level) {
        $skill = trim((string)$skill);
        $level = (int)$level;
        // A skill not in the course's list, or a level outside the four, is a
        // stale client — skip it rather than storing a mark nothing can read.
        if (!in_array($skill, $known, true)) continue;
        if (!isset(SKILL_LEVELS[$level])) continue;
        $ex = db_row("SELECT id, level, evidence FROM skill_marks WHERE subjectId = ? AND course = ? AND skill = ? LIMIT 1",
                     [(string)$s['studentId'], $course, $skill]);
        $prev = $ex ? (int)$ex['level'] : 0;
        $ev = mb_substr(trim((string)($evidence[$skill] ?? '')), 0, 400);
        if ($level > $prev && $prev > 0 && mb_strlen($ev) < 4) { $needs[] = $skill; continue; }
        $plan[] = [$skill, $level, $prev, $ev, $ex];
    }
    if ($needs) return ['ok' => false, 'error' => 'evidence_required', 'skills' => $needs, 'subjectId' => (string)$s['studentId']];
    foreach ($plan as [$skill, $level, $prev, $ev, $ex]) {
        if ($ex && (int)$ex['level'] === $level && $ev === '') continue;
        $row = ['level' => $level, 'prevLevel' => $ex ? $prev : null, 'markedById' => (string)$me['memberId'],
                'markedByName' => (string)($g['mentor']['fullName'] ?? $me['fullName'] ?? ''),
                'centre' => (string)($s['centre'] ?? ''), 'updatedAt' => $now];
        if ($ev !== '') $row['evidence'] = $ev;
        if ($ex) db_update('skill_marks', $row, ['id' => (int)$ex['id']]);
        else db_insert('skill_marks', $row + ['subjectId' => (string)$s['studentId'], 'course' => $course, 'skill' => $skill]);
        $saved++;
    }
    if (!$saved && $plan) return ['ok' => true, 'saved' => 0, 'unchanged' => true];
    if (!$saved) return ['ok' => false, 'error' => 'no_valid_marks'];
    audit('instructor.skills.mark', (string)$me['memberId'], (string)$s['studentId'],
          ['course' => $course, 'skills' => $saved], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'saved' => $saved];
}

/** Where a whole class stands on every named skill — the grid an instructor
 *  fills in and the answer to "what did this cohort actually get". */
function instructor_skills_board(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $course = trim((string)($p['course'] ?? ''));
    if (!instructor_course_ok($g, $course)) return ['ok' => false, 'error' => 'not_your_course'];
    $centre = trim((string)($p['centre'] ?? ''));
    $reach = $g['centres'] ?? null;
    if ($centre === '' && $reach !== null && count($reach) === 1) $centre = $reach[0];
    if ($centre === '') return ['ok' => false, 'error' => 'no_centre'];
    if ($reach !== null && !in_array($centre, $reach, true)) return ['ok' => false, 'error' => 'not_your_centre'];

    $skills = course_skills($course);
    $roster = mentor_covers($g, 'summer') ? db_all("SELECT studentId, fullName FROM summer_students
                      WHERE status = 'active' AND centre = ? AND track = ? ORDER BY fullName LIMIT 200", [$centre, $course]) : [];
    /* The Club's class too: NGG members of this centre and course — children
     * only (results_in_loop), the same class the Saturday screens read. */
    if (mentor_covers($g, 'ngg') && function_exists('results_in_loop')) {
        foreach (db_all("SELECT memberId, fullName, role, dob FROM members WHERE status = 'active' AND COALESCE(type,'NGG') <> 'Summer' AND centre = ? AND track = ? ORDER BY fullName LIMIT 200", [$centre, $course]) as $mm)
            if (results_in_loop($mm)) $roster[] = ['studentId' => (string)$mm['memberId'], 'fullName' => (string)$mm['fullName']];
    }
    $ids = array_column($roster, 'studentId');
    // One read for the whole grid, not one per child — the same mistake the
    // roster made before it was batched.
    $marks = []; $evid = [];
    if ($ids) {
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT subjectId, skill, level, evidence FROM skill_marks WHERE course = ? AND subjectId IN $in",
                        array_merge([$course], $ids)) as $r) {
            $marks[(string)$r['subjectId']][(string)$r['skill']] = (int)$r['level'];
            if ((string)($r['evidence'] ?? '') !== '') $evid[(string)$r['subjectId']][(string)$r['skill']] = (string)$r['evidence'];
        }
    }
    $students = [];
    foreach ($roster as $r) {
        $id = (string)$r['studentId'];
        $mine = $marks[$id] ?? [];
        $students[] = ['studentId' => $id, 'fullName' => (string)$r['fullName'],
            'marks' => $mine, 'evidence' => $evid[$id] ?? (object)[], 'marked' => count($mine), 'of' => count($skills)];
    }
    return ['ok' => true, 'course' => $course, 'centre' => $centre,
            'skills' => $skills, 'levels' => SKILL_LEVELS, 'students' => $students];
}


/* ── Staff performance ───────────────────────────────────────────────────────
 * What the programme knows about the adults, not the children.
 *
 * Deliberately activity, not judgement. Every figure here is a count of
 * something the person actually filed, over a window, next to how many
 * children they are responsible for — because "twelve stars" means one thing
 * for a mentor with eight mentees and another for one with forty. There is no
 * score and no ranking: a coordinator reading this should be able to see who
 * has gone quiet and go and ask them why, which is the only use of it that
 * helps anybody.
 *
 * The one judgement it does make is coverage — the share of a person's own
 * children they have recorded anything about in the window. A mentor who
 * stars the same three keen kids every week and never the other twenty is the
 * pattern this exists to surface.
 */
function admin_staff_performance(array $p): array {
    /* A lead mentor sees this for their own centre. "Who has gone quiet at
     * Egbeda" is the lead's job, not head office's, and routing them through
     * the console would mean handing a lead mentor an admin capability to see
     * the people they already supervise. They get their centre and no more. */
    $lead = null;
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) {
        $mg = mentor_gate($p);
        if (!empty($mg['ok']) && ($mg['rank'] ?? '') !== 'lead') {
            // Somebody we plainly know, who simply may not see this. Answering
            // "we do not know you" would send an instructor to check their
            // sign-in over a permission they were never going to have.
            return ['ok' => false, 'error' => 'forbidden', 'detail' => 'not_a_lead'];
        }
        if (empty($mg['ok'])) return $g;
        $lead = $mg;
        $g = ['ok' => true, 'requester' => $mg['member']];
    }
    $days = max(1, min(180, (int)($p['days'] ?? 30)));
    $since = gmdate('Y-m-d', time() - $days * 86400);
    $scope = $lead ? ($lead['centres'] ?? null) : admin_centre_names_in_scope($g['requester']);
    // A lead with no centre on their record supervises nobody in particular;
    // that must not silently widen to the whole programme.
    if ($lead && $scope === null) return ['ok' => false, 'error' => 'no_centre'];

    /* The staff list is mentors and instructors together, because the question
     * "who has gone quiet" does not care which table someone lives in. */
    $staff = [];
    foreach (db_all("SELECT mentorId id, fullName, email, centre, department, programme, status, rank FROM mentors ORDER BY fullName") as $m) {
        if ($scope !== null && trim((string)$m['centre']) !== '' && !in_array((string)$m['centre'], $scope, true)) continue;
        $staff[] = ['staffId' => (string)$m['id'], 'kind' => ($m['rank'] ?? '') === 'lead' ? 'lead mentor' : 'mentor',
            'fullName' => (string)$m['fullName'],
            'email' => strtolower(trim((string)$m['email'])), 'centre' => (string)$m['centre'],
            'focus' => (string)($m['department'] ?? ''), 'programme' => (string)($m['programme'] ?? 'summer'),
            'status' => (string)$m['status'], 'courses' => []];
    }
    foreach (db_all("SELECT volunteerId id, fullName, email, centre, faculty, courses, role, status FROM volunteers
                     WHERE role IN ('mentor','instructor') AND status = 'active' ORDER BY fullName") as $v) {
        if ($scope !== null && trim((string)$v['centre']) !== '' && !in_array((string)$v['centre'], $scope, true)) continue;
        $courses = array_values(array_filter(array_map('strval', json_decode((string)($v['courses'] ?? ''), true) ?: [])));
        $staff[] = ['staffId' => (string)$v['id'], 'kind' => (string)$v['role'], 'fullName' => (string)$v['fullName'],
            'email' => strtolower(trim((string)$v['email'])), 'centre' => (string)$v['centre'],
            'focus' => (string)$v['role'] === 'instructor' ? implode(' · ', $courses) : (string)($v['faculty'] ?? ''),
            'programme' => 'summer', 'status' => (string)$v['status'], 'courses' => $courses];
    }
    if (!$staff) return ['ok' => true, 'days' => $days, 'since' => $since, 'staff' => [], 'totals' => []];

    /* Activity is filed under the SIGNED-IN id, which is a memberId for a
     * mentor with an account and a volunteerId for a cardholder. So each staff
     * row needs the set of ids their work could be under: their own, plus the
     * member account matching their email. Without that, every mentor who
     * signs in with an account shows zero activity — the numbers would look
     * like a dead programme rather than a wrong join. */
    $emails = array_values(array_filter(array_column($staff, 'email')));
    $byEmail = [];
    if ($emails) {
        $in = '(' . implode(',', array_fill(0, count($emails), '?')) . ')';
        foreach (db_all("SELECT memberId, lower(email) e FROM members WHERE lower(email) IN $in", $emails) as $r) {
            $byEmail[(string)$r['e']][] = (string)$r['memberId'];
        }
    }
    $idsOf = [];
    foreach ($staff as $i => $s) {
        $ids = [$s['staffId']];
        foreach ($byEmail[$s['email']] ?? [] as $mid) if (!in_array($mid, $ids, true)) $ids[] = $mid;
        $idsOf[$i] = $ids;
    }
    $allIds = array_values(array_unique(array_merge(...array_values($idsOf))));
    $inAll = '(' . implode(',', array_fill(0, count($allIds), '?')) . ')';

    /* Five grouped reads for the whole staff list. Per-person queries here
     * would be one screen costing 5 × staff round trips, which is exactly the
     * shape that made the old roster 800 queries deep. */
    $tally = function (string $sql, array $args) use ($allIds): array {
        $out = [];
        foreach (db_all($sql, array_merge($allIds, $args)) as $r) $out[(string)$r['k']] = (int)$r['c'];
        return $out;
    };
    $stars     = $tally("SELECT givenById k, COUNT(*) c FROM member_stars WHERE givenById IN $inAll AND date >= ? GROUP BY givenById", [$since]);
    $starKids  = $tally("SELECT givenById k, COUNT(DISTINCT subjectId) c FROM member_stars WHERE givenById IN $inAll AND date >= ? GROUP BY givenById", [$since]);
    $remarks   = $tally("SELECT authorId k, COUNT(*) c FROM student_remarks WHERE authorId IN $inAll AND createdAt >= ? GROUP BY authorId", [$since]);
    $flags     = $tally("SELECT authorId k, COUNT(*) c FROM student_remarks WHERE authorId IN $inAll AND safeguarding = 1 AND createdAt >= ? GROUP BY authorId", [$since]);
    $sessions  = $tally("SELECT instructorId k, COUNT(*) c FROM course_sessions WHERE instructorId IN $inAll AND date >= ? GROUP BY instructorId", [$since]);
    $skills    = $tally("SELECT markedById k, COUNT(*) c FROM skill_marks WHERE markedById IN $inAll AND updatedAt >= ? GROUP BY markedById", [$since]);
    $v3        = $tally("SELECT givenById k, COUNT(*) c FROM v3_scores WHERE givenById IN $inAll AND createdAt >= ? GROUP BY givenById", [$since]);
    $lastSeen  = [];
    foreach (db_all("SELECT givenById k, MAX(date) d FROM member_stars WHERE givenById IN $inAll GROUP BY givenById", $allIds) as $r) $lastSeen[(string)$r['k']] = (string)$r['d'];
    foreach (db_all("SELECT authorId k, MAX(substr(createdAt,1,10)) d FROM student_remarks WHERE authorId IN $inAll GROUP BY authorId", $allIds) as $r) {
        $k = (string)$r['k'];
        if (!isset($lastSeen[$k]) || (string)$r['d'] > $lastSeen[$k]) $lastSeen[$k] = (string)$r['d'];
    }
    foreach (db_all("SELECT instructorId k, MAX(date) d FROM course_sessions WHERE instructorId IN $inAll GROUP BY instructorId", $allIds) as $r) {
        $k = (string)$r['k'];
        if (!isset($lastSeen[$k]) || (string)$r['d'] > $lastSeen[$k]) $lastSeen[$k] = (string)$r['d'];
    }

    /* Class size per staff member: their centre, narrowed to their courses.
     * Grouped once by (centre, track) so a hundred centres cost one read. */
    $classOf = [];
    foreach (db_all("SELECT centre, track, COUNT(*) c FROM summer_students WHERE status = 'active' GROUP BY centre, track") as $r) {
        $classOf[(string)$r['centre'] . '|' . (string)$r['track']] = (int)$r['c'];
        $classOf[(string)$r['centre'] . '|*'] = ($classOf[(string)$r['centre'] . '|*'] ?? 0) + (int)$r['c'];
    }
    foreach (db_all("SELECT centre, COUNT(*) c FROM members WHERE status = 'active' AND type = 'NGG' GROUP BY centre") as $r) {
        $classOf['ngg|' . (string)$r['centre']] = (int)$r['c'];
    }

    $today = gmdate('Y-m-d');
    $out = [];
    foreach ($staff as $i => $s) {
        $ids = $idsOf[$i];
        $sum = function (array $t) use ($ids) { $n = 0; foreach ($ids as $id) $n += $t[$id] ?? 0; return $n; };
        $last = '';
        foreach ($ids as $id) if (isset($lastSeen[$id]) && $lastSeen[$id] > $last) $last = $lastSeen[$id];

        $classSize = 0;
        if ($s['centre'] === '') $classSize = 0;               // unscoped: no denominator to be honest about
        elseif ($s['courses']) { foreach ($s['courses'] as $c) $classSize += $classOf[$s['centre'] . '|' . $c] ?? 0; }
        elseif ($s['focus'] !== '' && $s['kind'] === 'mentor') $classSize = $classOf[$s['centre'] . '|' . $s['focus']] ?? 0;
        else $classSize = $classOf[$s['centre'] . '|*'] ?? 0;
        if ($s['programme'] === 'ngg') $classSize = $classOf['ngg|' . $s['centre']] ?? 0;

        $reached = $sum($starKids);
        $out[] = [
            'staffId' => $s['staffId'], 'kind' => $s['kind'], 'fullName' => $s['fullName'],
            'centre' => $s['centre'], 'focus' => $s['focus'], 'status' => $s['status'],
            'classSize' => $classSize,
            'stars' => $sum($stars), 'childrenStarred' => $reached,
            'remarks' => $sum($remarks), 'flags' => $sum($flags),
            'sessions' => $sum($sessions), 'skillMarks' => $sum($skills), 'v3' => $sum($v3),
            /* The share of their own children they have recorded ANYTHING
             * about. The pattern worth catching is the mentor who stars the
             * same three keen kids every week. */
            'coverage' => $classSize > 0 ? (int)round(100 * min($reached, $classSize) / $classSize) : null,
            'lastActive' => $last,
            'quietDays' => $last === '' ? null : max(0, (int)floor((strtotime($today) - strtotime($last)) / 86400)),
        ];
    }
    // Quietest first: this screen exists to find the people who have stopped,
    // and sorting by the busiest buries them at the bottom.
    usort($out, function ($a, $b) {
        $aq = $a['lastActive'] === '' ? '' : $a['lastActive'];
        $bq = $b['lastActive'] === '' ? '' : $b['lastActive'];
        if ($aq === $bq) return strcmp($a['fullName'], $b['fullName']);
        return strcmp($aq, $bq);
    });

    $totals = [
        'staff' => count($out),
        'silent' => count(array_filter($out, fn($s) => $s['lastActive'] === '')),
        'stars' => array_sum(array_column($out, 'stars')),
        'remarks' => array_sum(array_column($out, 'remarks')),
        'flags' => array_sum(array_column($out, 'flags')),
        'sessions' => array_sum(array_column($out, 'sessions')),
        'skillMarks' => array_sum(array_column($out, 'skillMarks')),
    ];
    return ['ok' => true, 'days' => $days, 'since' => $since, 'staff' => $out, 'totals' => $totals,
        'scope' => $lead ? 'lead' : 'admin', 'centres' => centre_palette()];
}
