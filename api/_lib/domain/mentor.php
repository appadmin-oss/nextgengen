<?php
declare(strict_types=1);

/**
 * Mentor Portal — the surface where the adults in the room record what they
 * saw. Stars are 1..3, capped at ONE rating per student per day (whichever
 * adult gets there first), the same ledger-guard shape used by
 * volunteer_points. Each star also drops a positive behaviour_logs row so it
 * shows in the existing M&E trend for free.
 *
 * WHO GETS IN. Three kinds of people work with these children every session,
 * and until now only one of them could open the portal:
 *
 *   ADMIN      — console staff. Reach follows their capabilities: `people`
 *                covers both cohorts, `summer` and `club` cover one each, and
 *                a scoped admin is held to their centreScope.
 *   MENTOR     — a `mentors` row, or someone who came in through volunteer
 *                registration as a mentor. Their centre, narrowed to their
 *                department / faculty if they have one.
 *   INSTRUCTOR — a volunteer teaching named courses. Their centre, narrowed
 *                to the courses they actually teach.
 *
 * Instructors could not even reach the "not a mentor account" screen: they
 * hold a volunteer card rather than a member account, so the gate's first
 * lookup (members by memberId) came back empty and answered no_requester.
 *
 * SCOPE is two nullable lists — `centres` and `courses`, where null means "no
 * limit" — rather than the single `centre` string it replaces, because an
 * admin legitimately covers several centres and an instructor several courses.
 * Every write checks them through mentor_scope_ok(); scoping only the roster
 * would be cosmetic, since the subject id is posted by the client.
 */

/* The signed-in person, from whichever table they live in. Members hold
 * accounts; instructors and volunteer mentors hold a card and have no members
 * row at all, which is the whole reason they were locked out. */
function mentor_requester(string $mid): ?array {
    if ($mid === '') return null;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if ($m) return $m;
    $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$mid]);
    if (!$v) return null;
    return [
        'memberId' => (string)$v['volunteerId'],
        'fullName' => (string)($v['fullName'] ?? ''),
        'email'    => (string)($v['email'] ?? ''),
        'role'     => 'volunteer',
        /* Granted per person by a super admin, never by the role. 'volunteer'
         * carries no role capability, so whatever is here is the whole of what
         * they hold — which is why filling in the self-service form still
         * grants nothing. */
        'capsExtra' => (string)($v['capsExtra'] ?? ''),
        '__volunteer' => $v,
    ];
}

/* Which cohorts an admin's capabilities cover. `people` is the mentorship and
 * behaviour capability, so it spans both; the two portal caps cover their own
 * programme only. Anything else (content, inbox, audit) is not a reason to be
 * standing over a child's behaviour record. */
function mentor_admin_programmes(array $caps): array {
    if (in_array('people', $caps, true)) return ['summer', 'ngg'];
    $out = [];
    if (in_array('summer', $caps, true)) $out[] = 'summer';
    if (in_array('club', $caps, true))   $out[] = 'ngg';
    return $out;
}

/* ── One email, one mentor ─────────────────────────────────────────────────
 *
 * `mentors.email` carries no UNIQUE constraint and deliberately still does not
 * — see the note in db/schema-mysql.sql. What it does have is this pair of
 * functions, because the column decides something that matters: the gate falls
 * back to email when a mentor holds no member or volunteer link, and two rows
 * answering to one address means the gate is choosing between two different
 * people's classes with no way to tell them apart.
 *
 * The obvious fix — ORDER BY something and take the first — is the wrong one.
 * Ordering makes the choice repeatable, not correct: it would still hand
 * somebody another adult's children, just consistently. This codebase already
 * knows the reason, in mentor_gate's own comment: two different people can
 * share a mailbox. So the resolution fails closed instead.
 */

/** Active mentor rows answering to an email, optionally excluding one record.
 *  Lowercased on both sides, because rosters have arrived in every casing. */
function mentor_rows_for_email(string $email, string $exceptMentorId = ''): array {
    $e = mb_strtolower(trim($email));
    if ($e === '') return [];
    $sql = "SELECT * FROM mentors WHERE lower(trim(email)) = ? AND lower(trim(COALESCE(status,''))) = 'active'";
    $args = [$e];
    if ($exceptMentorId !== '') { $sql .= " AND mentorId <> ?"; $args[] = $exceptMentorId; }
    return db_all($sql . " ORDER BY id", $args);
}

/** Does this email already belong to a DIFFERENT active mentor? The one check
 *  every write path runs before it creates or re-points a record. */
function mentor_email_taken(string $email, string $exceptMentorId = ''): bool {
    return count(mentor_rows_for_email($email, $exceptMentorId)) > 0;
}

/* ── Mentor dormancy (owner, 28 Nov 2026, voice note) ─────────────────────────────────────────────────────
 *
 * "We already said that mentors can be here just two times in the month. So I don't think we should shut down
 *  mentors from not being available … when they are not available, they should be able to assess their mentees.
 *  But when it falls into complacency, or dormancy, after maybe two or three months … as a protocol, then he or
 *  she will not be able to assess."
 *
 * So a mentor is never held to a daily or weekly register (policy_sweep_absences skips them — see
 * policy_volunteer_is_mentor). What closes their reach is a long silence: no check-in at any centre for
 * MENTOR_DORMANT_DAYS. Then they keep the portal (to read why, do the Academy, report a concern) but reach no
 * child's record until they check in at a centre again, which reopens it the same moment. The clock starts no
 * earlier than the day this rule first ran (`mentor_dormancy_since`), so nobody is locked out on the day it ships
 * for months nobody was asked to record. */
const MENTOR_DORMANT_DAYS = 90;   // "two or three months": three, so nobody is shut out at the edge of it

function mentor_dormancy(array $mentor, ?string $today = null): array {
    $today = $today ?? (function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'));
    $since = (string)(setting_raw('mentor_dormancy_since') ?? '');
    if ($since === '') { $since = $today; if (function_exists('setting_set')) setting_set('mentor_dormancy_since', $since, 'system'); }
    $ids = array_values(array_filter([trim((string)($mentor['volunteerId'] ?? '')), trim((string)($mentor['memberId'] ?? ''))], fn($x) => $x !== ''));
    $last = '';
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $last = (string)(db_row("SELECT MAX(date) d FROM attendance WHERE studentId IN ($ph)", $ids)['d'] ?? '');
    }
    $joined = substr((string)($mentor['joinedAt'] ?? '') ?: (string)($mentor['createdAt'] ?? ''), 0, 10);
    $from = max($last, $since, preg_match('/^\d{4}-\d{2}-\d{2}$/', $joined) ? $joined : '');
    $days = (int)floor((strtotime($today . ' 00:00:00 UTC') - strtotime($from . ' 00:00:00 UTC')) / 86400);
    return ['dormant' => $days > MENTOR_DORMANT_DAYS, 'lastSeen' => $last, 'days' => max(0, $days), 'limitDays' => MENTOR_DORMANT_DAYS];
}

function mentor_gate(array $p): array {
    $m = mentor_requester((string)($p['requesterId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'no_requester'];
    $email = strtolower(trim((string)($m['email'] ?? '')));

    /* Admin first. "Full access depending on admin type" means an admin who
     * also holds a mentor record gets the admin's reach, not the narrower
     * one — otherwise a coordinator who mentors one class would find the
     * console's own portal showing them that class and nothing else. */
    $progs = mentor_admin_programmes(member_effective_caps($m));
    if ($progs) {
        $centres = admin_centre_names_in_scope($m);
        /* A VOLUNTEER holding a granted capability is not an admin, and must
         * not inherit an admin's reach. `admin_centre_names_in_scope` is
         * null-means-everywhere, so without this a granted Ops volunteer at
         * Egbeda would open the portal onto every child in the programme.
         * Their reach is the centre written on their own record — and a
         * volunteer with no centre gets [], which the roster's IN-list turns
         * into `AND 1 = 0`. Fails closed, not open. */
        if (isset($m['__volunteer'])) {
            $own = trim((string)($m['__volunteer']['centre'] ?? ''));
            $centres = $own !== '' ? [$own] : [];
        }
        /* An admin who ALSO holds a mentor record keeps their own mentees.
         * Their reach is the admin's, but "the children assigned to me" is a
         * different question from "the children I may see", and a coordinator
         * who mentors a class of six should still be able to open that six. */
        $ownMentor = db_row("SELECT mentorId FROM mentors WHERE status = 'active' AND (memberId = ? OR volunteerId = ?) LIMIT 1",
                            [(string)$m['memberId'], (string)$m['memberId']]);
        return ['ok' => true, 'member' => $m, 'role' => 'admin', 'rank' => 'admin', 'screened' => true,
            'mentorId' => (string)($ownMentor['mentorId'] ?? ''),
            'mentor' => ['fullName' => (string)($m['fullName'] ?? ''), 'centre' => (string)($m['__volunteer']['centre'] ?? ''), 'department' => '', 'rank' => 'admin'],
            'programmes' => $progs,
            'centres' => $centres,
            'courses' => null];
    }

    /* Find their mentor record by the id they actually signed in with, then
     * fall back to email. Email alone was the only match, which fails outright
     * for anyone holding an ID card — a card carries no email — and quietly
     * pairs two different people who share a mailbox. */
    $mid = (string)$m['memberId'];
    $mentor = db_row("SELECT * FROM mentors WHERE status = 'active' AND (memberId = ? OR volunteerId = ?) LIMIT 1", [$mid, $mid]);
    if (!$mentor && $email !== '') {
        /* FAILS CLOSED. `LIMIT 1` over an unconstrained column was picking
         * whichever row the engine happened to return, so two active mentors
         * sharing a mailbox got each other's reach at random — a different
         * class on a different request, with nothing on screen to say so.
         *
         * When the address is ambiguous the honest answer is that the system
         * does not know which of them this is, and the safe one is to say so.
         * An adult locked out of the portal with a named cause is a support
         * ticket; an adult handed another adult's children is a safeguarding
         * incident. The ops event is what turns the first into something
         * somebody actually fixes. */
        $rows = mentor_rows_for_email($email);
        if (count($rows) > 1) {
            if (function_exists('ops_record')) {
                ops_record('warn', 'mentor.gate', 'Two active mentor records share one email',
                           'requester=' . $mid . ' matches=' . count($rows));
            }
            return ['ok' => false, 'error' => 'mentor_record_ambiguous'];
        }
        /* Email is a fallback for a record nobody has claimed, never a key to
         * one somebody has. A mentor row already bound to a member or a
         * volunteer belongs to THAT person; a different account that happens
         * to carry the same address (a sibling, a shared family inbox, a typo
         * fixed the wrong way) must not inherit their caseload. */
        $cand = $rows[0] ?? null;
        if ($cand && (trim((string)($cand['memberId'] ?? '')) !== '' || trim((string)($cand['volunteerId'] ?? '')) !== '')) {
            if (function_exists('ops_record')) {
                ops_record('warn', 'mentor.gate', 'An email matched a mentor record bound to someone else',
                           'requester=' . $mid . ' mentor=' . (string)$cand['mentorId']);
            }
            return ['ok' => false, 'error' => 'mentor_record_ambiguous'];
        }
        $mentor = $cand;
    }
    /* ONE PERSON, TWO ROLES. Someone who teaches a class AND mentors children
     * has a `mentors` row and an instructor volunteer record. The mentor row
     * was always found first, so in the instructor portal they were a mentor:
     * the instructor ops refused them (forbidden_role) and /instructor/ngg
     * quietly showed the old Mentor Portal. Asked as an instructor (`as`), the
     * instructor record answers; the Mentor Portal still gets the mentor. */
    // `as` from the op, else the portal's X-NGG-As header (api-client setPortalAs). It only chooses among records the person holds.
    if ($mentor && (string)($p['as'] ?? ($_SERVER['HTTP_X_NGG_AS'] ?? '')) === 'instructor') {
        $vi = $m['__volunteer'] ?? null;
        if (!$vi && trim((string)($mentor['volunteerId'] ?? '')) !== '')
            $vi = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [(string)$mentor['volunteerId']]);
        if (!$vi || (string)($vi['role'] ?? '') !== 'instructor')
            $vi = db_row("SELECT * FROM volunteers WHERE memberId = ? AND status = 'active' AND role = 'instructor' ORDER BY id LIMIT 1", [(string)$m['memberId']]) ?: $vi;
        if ((!$vi || (string)($vi['role'] ?? '') !== 'instructor') && $email !== '')
            $vi = db_row("SELECT * FROM volunteers WHERE lower(email) = ? AND status = 'active' AND role = 'instructor' ORDER BY id LIMIT 1", [$email]);
        if ($vi && (string)($vi['role'] ?? '') === 'instructor') { $mentor = null; $m['__volunteer'] = $vi; }
    }
    if ($mentor) {
        $centre = trim((string)($mentor['centre'] ?? ''));
        $dept   = trim((string)($mentor['department'] ?? ''));
        /* A lead mentor runs a centre, not a class. Their department stops
         * narrowing who they can see, because "who has gone quiet at Egbeda"
         * is their job — a lead held to one department is a lead in name. */
        $isLead = trim((string)($mentor['rank'] ?? 'mentor')) === 'lead';
        /* SCREENED, OR NO REACH. The gate still opens — an unscreened mentor
         * has to be able to reach the Academy and the policy, which is how
         * they become screened — but it opens onto nobody. `centres` and
         * `courses` of [] are "no centre, no course" to every consumer (the
         * roster's IN-list, mentor_scope_ok, the curriculum board), so each
         * legacy action fails closed here rather than at forty call sites
         * that each have to remember. */
        $screened = function_exists('ms_clearance') ? (bool)ms_clearance($mentor)['screened'] : trim((string)($mentor['checkedAt'] ?? '')) !== '';
        /* Dormant (no check-in at a centre for MENTOR_DORMANT_DAYS): the portal opens, onto nobody — the same
           fail-closed shape as unscreened. A check-in at a centre reopens it. */
        $dorm = mentor_dormancy($mentor);
        $reach = $screened && !$dorm['dormant'];
        return ['ok' => true, 'member' => $m, 'role' => 'mentor', 'screened' => $screened, 'dormancy' => $dorm,
            'rank' => $isLead ? 'lead' : 'mentor',
            /* Carried so the roster can answer "who is assigned to ME". It was
             * absent, which is why the pairing an admin makes had no effect on
             * the mentor's own screen — see mentor_roster. */
            'mentorId' => (string)($mentor['mentorId'] ?? ''),
            'mentor' => ['fullName' => (string)($mentor['fullName'] ?? ''), 'centre' => $centre,
                         'department' => $isLead ? '' : $dept, 'rank' => $isLead ? 'lead' : 'mentor'],
            'programmes' => mentor_programmes($mentor),
            /* Fail CLOSED: a mentor whose record has no centre reaches no centre
             * (it used to read as "every centre"). An admin fixes the record. A
             * lead mentor's null courses — every department — is by design. */
            'centres' => !$reach ? [] : ($centre !== '' ? [$centre] : []),
            // A mentor with no department mentors across courses (that is the role); only the centre fails closed.
            'courses' => !$reach ? [] : ((!$isLead && $dept !== '') ? [$dept] : null),
            // Their own centre, kept for one purpose: filing a concern
            // (member_mp_concern). Reporting is not reading a record.
            'reportCentres' => $centre !== '' ? [$centre] : null,
            'reportCourses' => (!$isLead && $dept !== '') ? [$dept] : null];
    }

    /* The volunteer lane. A volunteer who registered as "Admin / Ops" is NOT
     * console staff and does not land here — that lane is a self-service form,
     * and a console capability is the only thing that actually says someone
     * was given oversight of behaviour data. */
    $v = $m['__volunteer'] ?? null;
    if (!$v && $email !== '') {
        /* The same rule as the mentor lane: `ORDER BY id DESC LIMIT 1` picked
         * the newest of several volunteers sharing a mailbox, so the reach a
         * member account got depended on who had registered last. Two matches
         * is an answer the system does not have — fail closed and say so. */
        $vs = db_all("SELECT * FROM volunteers WHERE lower(email) = ? AND status = 'active'
                      AND role IN ('mentor','instructor','admin') ORDER BY id LIMIT 2", [$email]);
        if (count($vs) > 1) return ['ok' => false, 'error' => 'mentor_record_ambiguous'];
        $v = $vs[0] ?? null;
    }
    /* Every volunteer lane is gated on safeguarding, not only Ops. A mentor or
     * an instructor is a role somebody ticks on a public form; clearing them is
     * the staff action that says they may be handed a child's record.
     *
     * Gated, not refused: an instructor whose check is still pending gets in
     * and sees their own COURSES — the lessons and materials they will teach —
     * and no child. Refusing outright left them with an empty portal and no
     * idea why ("the instructors cannot see the courses"). Their reach is
     * centres [] (nobody), exactly as an unscreened mentor's is. */
    if ($v && in_array((string)($v['role'] ?? ''), ['mentor', 'instructor'], true)) {
        $volCleared = (string)($v['safeguarding'] ?? 'pending') === 'cleared';
        $isInstructor = (string)$v['role'] === 'instructor';
        $centre  = trim((string)($v['centre'] ?? ''));
        $faculty = trim((string)($v['faculty'] ?? ''));
        /* An instructor's reach is the courses named on their record. A
         * volunteer mentor belongs to a faculty, so theirs is that faculty's
         * courses — the same narrowing a `mentors` row gets from its
         * department, expressed in the vocabulary the volunteer form uses. */
        $courses = $isInstructor
            ? array_values(array_filter(array_map('strval', json_decode((string)($v['courses'] ?? ''), true) ?: [])))
            : ($faculty !== '' ? academy_courses_for($faculty) : []);
        $volMentor = db_row("SELECT mentorId FROM mentors WHERE status = 'active' AND volunteerId = ? LIMIT 1",
                            [(string)($v['volunteerId'] ?? '')]);
        return ['ok' => true, 'member' => $m, 'role' => $isInstructor ? 'instructor' : 'mentor', 'rank' => 'mentor', 'screened' => $volCleared,
            'clearance' => $volCleared ? 'cleared' : 'pending',
            'reportCentres' => $centre !== '' ? [$centre] : null, 'reportCourses' => $courses ?: null,
            'mentorId' => (string)($volMentor['mentorId'] ?? ''),
            'mentor' => ['fullName' => (string)($v['fullName'] ?? ''), 'centre' => $centre,
                         'department' => $isInstructor ? implode(' · ', $courses) : $faculty, 'rank' => 'mentor'],
            /* The programme their volunteer record says they serve. This was
             * ['summer'] for every volunteer, so an instructor recruited for
             * the year-round Club could see no Club member and none of its
             * curriculum. volunteers.programme speaks the mentors' vocabulary
             * (summer | ngg | both), and mentor_programmes() reads it. */
            'programmes' => mentor_programmes(['programme' => volunteer_programme($v)]),
            // Fail closed, as above: no centre on the record is no centre; an instructor with no courses teaches none.
            'centres' => !$volCleared ? [] : ($centre !== '' ? [$centre] : []),
            'courses' => $courses ?: ($isInstructor ? [] : null)];
    }

    /* The centre Ops lane.
     *
     * 'admin' is one of the three roles the volunteer form offers (VOL_ROLES)
     * and it does not mean console staff — it means somebody running a CENTRE.
     * Their job is the place, not a class, so they get the centre entire: both
     * cohorts, and no narrowing by faculty or course the way a mentor or an
     * instructor is narrowed.
     *
     * GATED ON SAFEGUARDING, NOT ON WHAT THE APPLICANT TYPED. The volunteer
     * form is public and anybody can tick "Admin / Ops"; clearing safeguarding
     * is a staff action, and it is already the bar this codebase applies before
     * a volunteer may so much as take attendance. Without it, a public form
     * would be a route into children's records.
     *
     * Still their OWN centre. A grant is not an admin's reach, and neither is a
     * role: this opens the whole of one centre, not the programme.
     */
    if ($v && (string)($v['role'] ?? '') === 'admin') {
        $centre = trim((string)($v['centre'] ?? ''));
        if ((string)($v['safeguarding'] ?? 'pending') !== 'cleared') return ['ok' => false, 'error' => 'not_cleared'];
        // No centre means no answer to "the whole of WHICH centre", and an
        // empty roster reads as a broken portal rather than a missing field.
        if ($centre === '') return ['ok' => false, 'error' => 'no_centre'];
        $opsMentor = db_row("SELECT mentorId FROM mentors WHERE status = 'active' AND volunteerId = ? LIMIT 1",
                            [(string)($v['volunteerId'] ?? '')]);
        return ['ok' => true, 'member' => $m, 'role' => 'admin', 'rank' => 'admin', 'screened' => true,
            'mentorId' => (string)($opsMentor['mentorId'] ?? ''),
            'mentor' => ['fullName' => (string)($v['fullName'] ?? ''), 'centre' => $centre,
                         'department' => '', 'rank' => 'admin'],
            'programmes' => ['summer', 'ngg'],
            'centres' => [$centre],
            'courses' => null];
    }

    return ['ok' => false, 'error' => 'not_a_mentor'];
}

/** Which Mentor Portal view this person gets — 'admin' | 'mentor' |
 *  'instructor', or '' for everyone else. Called on /auth/me so the nav can
 *  offer the portal to the people who can use it: an admin resolves without
 *  touching the database at all, and nobody costs more than two indexed reads. */
function mentor_portal_role(string $memberId): string {
    $g = mentor_gate(['requesterId' => $memberId]);
    return !empty($g['ok']) ? (string)($g['role'] ?? 'mentor') : '';
}

/* Is this child inside the signed-in person's reach?
 *
 * Both lists are null-means-everything. The course check used to not exist:
 * a mentor with a department saw only their department in the roster but
 * could star anyone in the centre by posting the id, which is exactly the
 * hole the programme check above was written to close. */
function mentor_scope_ok(array $g, array $subject): bool {
    $centres = $g['centres'] ?? null;
    if ($centres !== null && !in_array(trim((string)($subject['centre'] ?? '')), $centres, true)) return false;
    $courses = $g['courses'] ?? null;
    if ($courses !== null && !member_takes_any($subject, $courses)) return false;
    return true;
}

/* Which cohorts this mentor supervises.
 *
 * NGG and the Summer School run side by side, in the same centres, often with
 * overlapping staff — so "a mentor at Egbeda" is not enough to say whose
 * children they are responsible for. Without this, an NGG mentor opened the
 * portal and saw summer students (the roster only ever queried that table),
 * could star them, and the Club members they were actually assigned to were
 * invisible. Both halves of that are wrong.
 *
 * 'both' is a real answer, not a fudge: plenty of people genuinely cover both,
 * and the alternative is duplicate mentor records that drift apart.
 */
function mentor_programmes(array $mentor): array {
    $p = trim((string)($mentor['programme'] ?? 'summer'));
    if ($p === 'both') return ['summer', 'ngg'];
    return in_array($p, ['summer', 'ngg'], true) ? [$p] : ['summer'];
}

/** Does this mentor supervise that cohort? */
function mentor_covers(array $g, string $programme): bool {
    return in_array($programme, $g['programmes'] ?? ['summer'], true);
}

/** The centres this person may pick between — their scope if they have one,
 *  otherwise every active centre. An admin covering the whole programme needs
 *  a picker; a mentor at one centre needs nothing. */
function mentor_scope_centres(array $g): array {
    $centres = $g['centres'] ?? null;
    if ($centres !== null) return array_values($centres);
    /* Narrowed to one programme (the roster's `programme`), an admin picks
     * only among the centres that run it: a Summer School portal offering an
     * NGG-only centre is the clash this exists to prevent. */
    $only = $g['onlyProgramme'] ?? '';
    $rows = db_all("SELECT name, programmes FROM centres WHERE status = 'active' ORDER BY name");
    if ($only !== '') $rows = array_filter($rows, static fn($r) => in_array($only, array_map('trim', explode(',', (string)($r['programmes'] ?: 'ngg,summer'))), true));
    return array_values(array_column($rows, 'name'));
}

/** The class for today — children in reach, each with today's star state so
 *  the portal can show what has already been given. */
function mentor_roster(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    /* `programme` (ngg | summer) narrows the roster to one programme. An
     * admin covers both, and one list holding NGG members and Summer School
     * participants side by side is how a star meant for one landed on the
     * other. Asking for a programme you do not cover is refused, not widened. */
    $prog = (string)($p['programme'] ?? '');
    if ($prog === 'ngg' || $prog === 'summer') {
        if (!mentor_covers($g, $prog)) return ['ok' => false, 'error' => 'not_this_programme'];
        $g['programmes'] = [$prog]; $g['onlyProgramme'] = $prog;
    }
    $today  = gmdate('Y-m-d');

    /* Whose children these are. `centres`/`courses` are null-means-everything,
     * so a single-centre mentor is filtered exactly as before while an admin
     * spanning the programme is not filtered at all — which is why the next
     * paragraph exists. */
    $centres = $g['centres'] ?? null;
    $courses = $g['courses'] ?? null;
    $pickable = mentor_scope_centres($g);

    /* One centre at a time, always.
     *
     * An unscoped admin reaches every child in the programme, and "every child
     * in the programme" truncated to the first 400 by name is not a roster —
     * it is an arbitrary slice that silently hides the rest. So when more than
     * one centre is in reach the caller must name one; the response carries the
     * list to choose from. Somebody who covers exactly one centre never sees
     * this and lands straight on their class. */
    $want = trim((string)($p['centre'] ?? ''));
    if ($want !== '' && !in_array($want, $pickable, true)) return ['ok' => false, 'error' => 'not_your_centre'];
    if ($want === '' && count($pickable) === 1) $want = $pickable[0];
    if ($want !== '') $centres = [$want];

    $needsCentre = ($want === '' && count($pickable) !== 1);

    /* MY MENTEES, or the whole centre.
     *
     * `mentor_assignments` has always been written — an admin pairs a child
     * with a mentor and the child's own dashboard says who their mentor is —
     * but nothing on the MENTOR's side ever read it. So the portal showed every
     * active child in the centre, and the pairing an admin had carefully made
     * changed nothing about what the mentor saw. Two features that were meant
     * to be one.
     *
     * `scope=mine` is that link. It is the default whenever this person has
     * mentees, because "the children I am responsible for" is the question a
     * mentor opens the portal to answer; the centre list stays one tap away for
     * the register, and stays the default for anyone with no pairings so nobody
     * lands on an empty screen. */
    $mentorId = trim((string)($g['mentorId'] ?? ''));
    $mineIds = [];
    if ($mentorId !== '') {
        $sc = session_current();
        $sessionId = (string)($sc['current']['sessionId'] ?? '');
        $sql = "SELECT memberId FROM mentor_assignments WHERE mentorId = ? AND status = 'active'";
        $args = [$mentorId];
        // Scoped to the running session when there is one: last year's mentees
        // are not this year's class.
        if ($sessionId !== '') { $sql .= ' AND sessionId = ?'; $args[] = $sessionId; }
        $mineIds = array_values(array_unique(array_map('strval', array_column(db_all($sql, $args), 'memberId'))));
        /* A pairing made without a session (or before this one) is still a
           pairing. Reading only this session's made such a mentor "have no
           mentees", and the portal showed the whole centre as their class. */
        if (!$mineIds && $sessionId !== '')
            $mineIds = array_values(array_unique(array_map('strval', array_column(db_all("SELECT memberId FROM mentor_assignments WHERE mentorId = ? AND status = 'active'", [$mentorId]), 'memberId'))));
    }
    $scope = (string)($p['scope'] ?? '');
    if ($scope !== 'mine' && $scope !== 'centre') $scope = $mineIds ? 'mine' : 'centre';
    if ($scope === 'mine' && !$mineIds) $scope = 'centre';
    // Naming a mentee list answers the centre question too — you are not being
    // asked to pick a centre in order to see six named children.
    if ($scope === 'mine') $needsCentre = false;

    /* The roster is whichever cohorts this person supervises — and ONLY those.
     * It used to read summer_students unconditionally, so an NGG mentor was
     * shown summer children they had no business seeing while their own Club
     * members did not appear at all. Each row is tagged with its kind, because
     * everything downstream (starring, permission checks) has to know which
     * table a subject lives in. */
    $rows = [];
    $inList = function (?array $vals, string $col, string &$where, array &$args): void {
        if ($vals === null) return;
        if (!$vals) { $where .= ' AND 1 = 0'; return; }
        $where .= " AND $col IN (" . implode(',', array_fill(0, count($vals), '?')) . ')';
        foreach ($vals as $v) $args[] = $v;
    };
    /* In `mine` the assignment IS the scope: a mentor keeps a child who has
     * moved centre or changed track, and re-filtering by centre would drop them
     * off their own list without saying so.
     *
     * The summer branch is queried the same way even though nothing pairs a
     * summer student today — `admin_assign_mentor` writes member ids only, so
     * this returns nothing for that cohort. Written this way rather than
     * skipped so that pairing summer students is a change in one place, and so
     * this does not quietly start showing the whole centre if it ever is. */
    if (!$needsCentre && mentor_covers($g, 'summer')) {
        $where = "status = 'active'"; $args = [];
        if ($scope === 'mine') { $inList($mineIds, 'studentId', $where, $args); }
        else { $inList($centres, 'centre', $where, $args); $inList($courses, 'track', $where, $args); }
        foreach (db_all("SELECT studentId, fullName, track, centre, photoUrl FROM summer_students WHERE $where ORDER BY fullName LIMIT 400", $args) as $r) {
            $r['kind'] = 'student';
            $rows[] = $r;
        }
    }
    if (!$needsCentre && mentor_covers($g, 'ngg')) {
        $where = "status = 'active' AND type = 'NGG'"; $args = [];
        if ($scope === 'mine') { $inList($mineIds, 'memberId', $where, $args); }
        else { $inList($centres, 'centre', $where, $args); $inList($courses, 'track', $where, $args); }
        foreach (db_all("SELECT memberId studentId, fullName, track, centre, photoUrl FROM members WHERE $where ORDER BY fullName LIMIT 400", $args) as $r) {
            $r['kind'] = 'member';
            $rows[] = $r;
        }
    }

    $period = iso_week_period();

    /* Two batched reads, not two per child.
     *
     * This ran a star lookup and a V3 lookup inside the loop — 800 queries for
     * a 400-student centre, on the one screen a mentor opens with thirty
     * children in front of them. Fetch both sets once and index them. */
    $starOf = []; $v3Of = [];
    if ($rows) {
        $ids = array_column($rows, 'studentId');
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT subjectId, stars, note, category, givenById FROM member_stars WHERE date = ? AND subjectId IN $in",
                        array_merge([$today], $ids)) as $r2) $starOf[(string)$r2['subjectId']] = $r2;
        foreach (db_all("SELECT subjectId, verbal, vocal, visual, note FROM v3_scores WHERE period = ? AND subjectId IN $in",
                        array_merge([$period], $ids)) as $r2) $v3Of[(string)$r2['subjectId']] = $r2;
    }

    $students = [];
    foreach ($rows as $r) {
        $star = $starOf[(string)$r['studentId']] ?? null;
        $v3 = $v3Of[(string)$r['studentId']] ?? null;
        $students[] = [
            'studentId'    => $r['studentId'],
            'kind'         => $r['kind'],
            'fullName'     => $r['fullName'],
            'track'        => $r['track'],
            'photoUrl'     => $r['photoUrl'],
            'starredToday' => $star ? (int)$star['stars'] : 0,
            'note'         => $star['note'] ?? '',
            'byMe'         => $star ? ($star['givenById'] === (string)$g['member']['memberId']) : false,
            'v3'           => $v3 ? ['verbal' => (int)$v3['verbal'], 'vocal' => (int)$v3['vocal'], 'visual' => (int)$v3['visual'], 'note' => (string)$v3['note']] : null,
        ];
    }
    return ['ok' => true, 'today' => $today, 'period' => $period, 'categories' => BEHAVIOUR_CATEGORIES,
        'presets' => behaviour_presets(),
        /* `role` is what makes the portal look different for the three people
         * who open it; `centres`/`needsCentre` are what the picker is built
         * from. The `mentor` block keeps its old shape so nothing that reads it
         * has to change. */
        'role' => (string)($g['role'] ?? 'mentor'),
        'rank' => (string)($g['rank'] ?? 'mentor'),
        'centre' => $want,
        'centres' => $pickable,
        'needsCentre' => $needsCentre,
        'scope' => $scope,
        'mineCount' => count($mineIds),
        'programme' => $prog === 'ngg' || $prog === 'summer' ? $prog : '',
        'mentor' => ['name' => (string)($g['mentor']['fullName'] ?? ''),
                     'centre' => $want !== '' ? $want : (string)($g['mentor']['centre'] ?? ''),
                     'department' => (string)($g['mentor']['department'] ?? ''),
                     'programmes' => $g['programmes']],
        'students' => $students];
}

/** Weekly V3 rating (Verbal · Vocal · Visual, each 1..5) for a student — one
 *  row per student per ISO-week period, upserted so a mentor can refine it
 *  during the week. Same-centre gate, mirroring mentor_star_give. */
function mentor_v3_rate(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $me = $g['member'];
    $subjectId = (string)($p['subjectId'] ?? '');
    $verbal = (int)($p['verbal'] ?? 0); $vocal = (int)($p['vocal'] ?? 0); $visual = (int)($p['visual'] ?? 0);
    foreach (['verbal' => $verbal, 'vocal' => $vocal, 'visual' => $visual] as $v) if ($v < 1 || $v > 5) return ['ok' => false, 'error' => 'bad_score'];
    /* Resolve the subject in whichever cohort this mentor supervises — the same
     * control mentor_star_give applies, and for the same reason: the subject id
     * is posted by the client, so scoping the roster alone would be cosmetic.
     *
     * This read summer_students and NOTHING ELSE, which is the bug the roster
     * had fixed and this did not. An NGG mentor could list their Club members
     * and star them, but every V3 rating came back 'not_found' — so the one
     * cohort-wide score that the Champions board is computed from could not be
     * given to a Club member at all. */
    $s = null;
    if (mentor_covers($g, 'summer')) {
        $s = db_row("SELECT studentId, centre, track FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
    }
    if (!$s && mentor_covers($g, 'ngg')) {
        $s = db_row("SELECT memberId studentId, centre, track FROM members WHERE memberId = ? AND type = 'NGG' LIMIT 1", [$subjectId]);
    }
    // 'not_found' rather than 'wrong_programme': a mentor has no business
    // learning whether an id they cannot supervise exists at all.
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (!mentor_scope_ok($g, $s)) return ['ok' => false, 'error' => 'not_your_centre'];
    $period = iso_week_period();
    $note = substr(trim((string)($p['note'] ?? '')), 0, 300);
    $existing = db_row("SELECT id FROM v3_scores WHERE subjectId = ? AND period = ? LIMIT 1", [$subjectId, $period]);
    if ($existing) db_update('v3_scores', ['verbal' => $verbal, 'vocal' => $vocal, 'visual' => $visual, 'note' => $note, 'givenById' => (string)$me['memberId']], ['id' => (int)$existing['id']]);
    else db_insert('v3_scores', ['subjectId' => $subjectId, 'givenById' => (string)$me['memberId'], 'verbal' => $verbal, 'vocal' => $vocal, 'visual' => $visual, 'period' => $period, 'note' => $note, 'centre' => (string)$s['centre'], 'createdAt' => now_iso()]);
    audit('mentor.v3.rate', (string)$me['memberId'], $subjectId, ['period' => $period, 'total' => $verbal + $vocal + $visual], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'period' => $period, 'total' => $verbal + $vocal + $visual];
}

/* ── V3 Champions — the weekly recognition drawn from V3 scores ──────────────
   A champion is the top V3 composite (verbal+vocal+visual, max 15) in a centre
   for an ISO-week period, plus one overall champion. Awards are non-monetary
   (valueNaira 0) and idempotent per (subject, period, award name). */

function v3_leaderboard(string $period): array {
    $rows = db_all("SELECT v.subjectId, v.centre, v.verbal, v.vocal, v.visual, (v.verbal + v.vocal + v.visual) total, s.fullName
                    FROM v3_scores v LEFT JOIN summer_students s ON s.studentId = v.subjectId
                    WHERE v.period = ? ORDER BY total DESC, s.fullName", [$period]);
    $byCentre = [];
    foreach ($rows as $r) {
        $c = (string)$r['centre'];
        $byCentre[$c] ??= [];
        $byCentre[$c][] = ['studentId' => (string)$r['subjectId'], 'name' => (string)($r['fullName'] ?? $r['subjectId']), 'centre' => $c,
            'verbal' => (int)$r['verbal'], 'vocal' => (int)$r['vocal'], 'visual' => (int)$r['visual'], 'total' => (int)$r['total']];
    }
    $overall = array_map(fn($r) => ['studentId' => (string)$r['subjectId'], 'name' => (string)($r['fullName'] ?? $r['subjectId']), 'centre' => (string)$r['centre'], 'total' => (int)$r['total']], array_slice($rows, 0, 5));
    return ['period' => $period, 'byCentre' => $byCentre, 'overall' => $overall, 'rated' => count($rows)];
}

function admin_champions_board(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $period = trim((string)($p['period'] ?? '')) ?: iso_week_period();
    $lb = v3_leaderboard($period);
    $minted = db_all("SELECT subjectId, name, centre FROM awards WHERE period = ? AND name LIKE 'V3 Champion%'", [$period]);
    return ['ok' => true, 'board' => $lb, 'minted' => $minted];
}

function admin_champions_mint(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $period = trim((string)($p['period'] ?? '')) ?: iso_week_period();
    $lb = v3_leaderboard($period);
    $minted = [];
    $mint = function (array $win, string $name, string $centre) use ($period, $g, &$minted) {
        if (db_row("SELECT id FROM awards WHERE subjectId = ? AND period = ? AND name = ? LIMIT 1", [$win['studentId'], $period, $name])) return;
        $id = 'AWD-' . strtoupper(rand_hex(5));
        db_insert('awards', ['awardId' => $id, 'subjectId' => $win['studentId'], 'subjectType' => 'student', 'name' => $name, 'tier' => 0, 'valueNaira' => 0, 'period' => $period, 'centre' => $centre, 'note' => 'V3 composite ' . $win['total'] . '/15', 'eligibilityStatus' => 'eligible', 'mintedAt' => now_iso(), 'createdBy' => (string)$g['requester']['memberId']]);
        $minted[] = ['awardId' => $id, 'subject' => $win['name'], 'name' => $name, 'centre' => $centre];
    };
    foreach ($lb['byCentre'] as $centre => $list) { if ($list) $mint($list[0], 'V3 Champion — ' . $centre, $centre); }
    if (!empty($lb['overall'])) { $top = $lb['overall'][0]; $mint($top, 'V3 Champion of the Week', (string)$top['centre']); }
    audit('champions.mint', (string)$g['requester']['memberId'], $period, ['minted' => count($minted)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'period' => $period, 'minted' => $minted];
}

/** Award 1..3 stars to a student — assigned mentor / same centre only, one per
 *  student per day. Mirrors into behaviour_logs so the M&E feed sees it. */
function mentor_star_give(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $mentor = $g['mentor']; $me = $g['member'];
    $subjectId = (string)($p['subjectId'] ?? '');
    $stars = (int)($p['stars'] ?? 0);
    if ($stars < 1 || $stars > 3) return ['ok' => false, 'error' => 'bad_stars'];
    /* Resolve the subject in whichever cohort this mentor actually supervises.
     * Scoping the ROSTER alone would be cosmetic — the subject id is posted by
     * the client, so an NGG mentor could still star a summer child simply by
     * sending their id. This is the control; the roster is the convenience. */
    $s = null; $kind = '';
    if (mentor_covers($g, 'summer')) {
        $s = db_row("SELECT studentId, fullName, centre, track FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
        if ($s) $kind = 'student';
    }
    if (!$s && mentor_covers($g, 'ngg')) {
        $s = db_row("SELECT memberId studentId, fullName, centre, track FROM members WHERE memberId = ? AND type = 'NGG' LIMIT 1", [$subjectId]);
        if ($s) $kind = 'member';
    }
    // Deliberately 'not_found' rather than 'wrong_programme': a mentor has no
    // business learning whether an id they cannot supervise exists at all.
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    // Permission: the child must be inside this person's centres and courses.
    if (!mentor_scope_ok($g, $s)) return ['ok' => false, 'error' => 'not_your_centre'];
    $today = gmdate('Y-m-d');
    if (db_row("SELECT id FROM member_stars WHERE subjectId = ? AND date = ? LIMIT 1", [$subjectId, $today])) return ['ok' => false, 'error' => 'already_starred_today'];
    $cat = in_array(($p['category'] ?? ''), BEHAVIOUR_CATEGORIES, true) ? (string)$p['category'] : '';
    $note = substr(trim((string)($p['note'] ?? '')), 0, 300);
    db_insert('member_stars', [
        'subjectId' => $subjectId, 'subjectType' => $kind, 'givenById' => (string)$me['memberId'],
        'stars' => $stars, 'category' => $cat, 'note' => $note, 'centre' => (string)$s['centre'],
        'date' => $today, 'createdAt' => now_iso(),
    ]);
    // Mirror into the qualitative feed (free M&E visibility).
    if (function_exists('rand_hex')) {
        db_insert('behaviour_logs', [
            'logId' => 'BL-' . strtoupper(rand_hex(6)), 'subjectId' => $subjectId, 'subjectName' => (string)$s['fullName'],
            'observerId' => (string)$me['memberId'], 'observerName' => (string)$mentor['fullName'],
            'note' => '★×' . $stars . ($note !== '' ? ' — ' . $note : ''), 'category' => ($cat ?: 'commendation'),
            'severity' => 'positive', 'sentiment' => 'positive', 'aiSource' => 'manual', 'status' => 'open', 'createdAt' => now_iso(),
        ]);
    }
    audit('mentor.star.give', (string)$me['memberId'], $subjectId, ['stars' => $stars, 'category' => $cat], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'stars' => $stars];
}

/* ── Bulk: one observation, many children ────────────────────────────────────
 * The single-student sheet is right for a considered note and wrong for the
 * end of a session, where a mentor wants to say "these eleven all did well"
 * and move on. Doing that eleven times over a phone connection is how the
 * data stops getting recorded at all.
 *
 * Reuses mentor_star_give per subject rather than reimplementing the rules —
 * the same-centre check, the one-rating-per-day guard, the behaviour_logs
 * mirror and the audit line all have to hold identically whether a star is
 * given one at a time or thirty at once. Anything else drifts.
 *
 * Partial success is the normal case, not an error: some of a selection will
 * already have been starred today by another mentor. Each subject reports its
 * own outcome so the UI can say which ones did not take, instead of failing
 * the batch and leaving the mentor to guess what landed.
 */
function mentor_bulk_award(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;

    $ids = is_array($p['subjectIds'] ?? null) ? $p['subjectIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), $ids))));
    if (!$ids) return ['ok' => false, 'error' => 'no_subjects'];
    // Bounded: a mentor's class, not the whole programme. Anything larger is a
    // mistake or a script, and either way should not run in one request.
    if (count($ids) > 200) return ['ok' => false, 'error' => 'too_many_subjects'];

    // A preset carries its own stars/category — that is the whole point of it.
    // Explicit values still win, so the UI can offer "preset, but 3 stars".
    $preset = null;
    $presetId = trim((string)($p['presetId'] ?? ''));
    if ($presetId !== '') {
        foreach (behaviour_presets() as $pr) if ($pr['id'] === $presetId) { $preset = $pr; break; }
        if (!$preset) return ['ok' => false, 'error' => 'unknown_preset'];
    }
    $stars = array_key_exists('stars', $p) ? (int)$p['stars'] : (int)($preset['stars'] ?? 0);
    $category = (string)($p['category'] ?? ($preset['category'] ?? ''));
    $severity = (string)($p['severity'] ?? ($preset['severity'] ?? 'info'));
    $note = substr(trim((string)($p['note'] ?? '')), 0, 300);
    if ($note === '' && $preset) $note = (string)$preset['label'];

    // Stars are optional here: a concern preset ("disrupted the session")
    // records an observation and awards nothing. Zero must not mean "give
    // zero stars", it must mean "no star row at all".
    if ($stars !== 0 && ($stars < 1 || $stars > 3)) return ['ok' => false, 'error' => 'bad_stars'];
    if ($stars === 0 && $note === '') return ['ok' => false, 'error' => 'nothing_to_record'];

    $results = []; $awarded = 0; $skipped = 0; $logged = 0;
    foreach ($ids as $sid) {
        if ($stars > 0) {
            $r = mentor_star_give(['requesterId' => (string)($p['requesterId'] ?? ''), 'subjectId' => $sid,
                'stars' => $stars, 'category' => $category, 'note' => $note, 'ip' => (string)($p['ip'] ?? '')]);
            if (!empty($r['ok'])) { $awarded++; $results[] = ['subjectId' => $sid, 'ok' => true, 'stars' => $stars]; }
            else { $skipped++; $results[] = ['subjectId' => $sid, 'ok' => false, 'error' => (string)($r['error'] ?? 'failed')]; }
            continue;
        }
        // Observation only — still centre-gated, same as a star.
        $s = null;
        if (mentor_covers($g, 'summer')) $s = db_row("SELECT studentId, fullName, centre, track, cohortId FROM summer_students WHERE studentId = ? LIMIT 1", [$sid]);
        if (!$s && mentor_covers($g, 'ngg')) $s = db_row("SELECT memberId studentId, fullName, centre, track, '' cohortId FROM members WHERE memberId = ? AND type = 'NGG' LIMIT 1", [$sid]);
        if (!$s) { $skipped++; $results[] = ['subjectId' => $sid, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!mentor_scope_ok($g, $s)) { $skipped++; $results[] = ['subjectId' => $sid, 'ok' => false, 'error' => 'not_your_centre']; continue; }
        $logId = 'BL-' . strtoupper(rand_hex(6));
        db_insert('behaviour_logs', [
            'logId' => $logId, 'subjectId' => $sid, 'subjectName' => (string)$s['fullName'], 'cohortId' => (string)($s['cohortId'] ?? ''),
            'observerId' => (string)$g['member']['memberId'], 'observerName' => (string)$g['mentor']['fullName'],
            'note' => $note,
            'category' => in_array($category, BEHAVIOUR_CATEGORIES, true) ? $category : 'participation',
            'severity' => in_array($severity, BEHAVIOUR_SEVERITIES, true) ? $severity : 'info',
            'sentiment' => $severity === 'positive' ? 'positive' : ($severity === 'info' ? 'neutral' : 'negative'),
            'aiSource' => $preset ? 'preset' : 'manual', 'status' => 'open', 'createdAt' => now_iso(),
        ]);
        $logged++;
        $results[] = ['subjectId' => $sid, 'ok' => true, 'logId' => $logId];
        // A wellbeing or urgent observation pages the admins immediately, and
        // must do so per child even when thirty were logged in one action —
        // a batch is not a reason for a safeguarding flag to go unseen.
        if ((in_array($category, BEHAVIOUR_CATEGORIES, true) && $category === 'wellbeing') || $severity === 'urgent') {
            behaviour_flag_emit(['ref' => $logId, 'subject' => (string)$s['fullName'], 'subjectId' => $sid,
                'category' => $category, 'severity' => $severity, 'by' => (string)$g['mentor']['fullName']]);
        }
    }
    audit('mentor.bulk.award', (string)$g['member']['memberId'], '',
        ['count' => count($ids), 'awarded' => $awarded, 'logged' => $logged, 'skipped' => $skipped, 'preset' => $presetId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'awarded' => $awarded, 'logged' => $logged, 'skipped' => $skipped, 'results' => $results];
}

/**
 * Active mentor records that share an email with another.
 *
 * The half the machine cannot do. New collisions are refused at every write
 * path and the gate refuses to resolve an old one — but resolving it means
 * deciding whether two rows are one person with a duplicate record or two
 * people on a shared mailbox, and only somebody who knows them can say. This
 * puts the question in front of them.
 *
 * Deliberately not a merge op. `merge.php` exists for members and the
 * temptation is to point it at this; the difference is that a member merge is
 * reconciling two records of one person established by other means, whereas
 * here the premise itself is what is in doubt. Getting it wrong hands an adult
 * another adult's children, which is the failure the whole change exists to
 * prevent — so the desk picks, edits one of the addresses, and the collision
 * is gone.
 *
 * Every affected adult is locked out of the portal until this is done, so the
 * count is worth showing even when it is zero-shaped: they cannot report it
 * themselves, because the thing that is broken is their way in.
 */
function admin_mentors_duplicates(array $p): array {
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) return $g;

    /* One grouped query, then one read for the rows — not a query per group.
       Blank emails are excluded: a mentor with no address never reaches the
       gate's email fallback, so two of them are not a collision. */
    $groups = db_all("SELECT lower(email) e, COUNT(*) c FROM mentors
                      WHERE status = 'active' AND email IS NOT NULL AND email <> ''
                      GROUP BY lower(email) HAVING COUNT(*) > 1
                      ORDER BY c DESC, e LIMIT 100");
    if (!$groups) return ['ok' => true, 'duplicates' => [], 'mentors' => 0];

    $emails = array_map(static fn($r) => (string)$r['e'], $groups);
    $in = '(' . implode(',', array_fill(0, count($emails), '?')) . ')';
    $rows = db_all("SELECT mentorId, fullName, email, centre, department, `rank`, programme,
                           memberId, volunteerId, source, createdAt
                    FROM mentors WHERE status = 'active' AND lower(email) IN $in ORDER BY lower(email), id", $emails);

    $byEmail = [];
    foreach ($rows as $r) {
        $e = mb_strtolower((string)$r['email']);
        $byEmail[$e][] = [
            'mentorId' => (string)$r['mentorId'], 'fullName' => (string)$r['fullName'],
            'centre' => (string)($r['centre'] ?? ''), 'department' => (string)($r['department'] ?? ''),
            'rank' => (string)($r['rank'] ?? 'mentor'), 'programme' => (string)($r['programme'] ?? 'summer'),
            /* Whether the record is LINKED is the fact that resolves most of
               these: a row carrying a memberId or volunteerId is reached by
               that id and never by the email fallback, so it is usually the
               one to keep. */
            'linked' => trim((string)($r['memberId'] ?? '')) !== '' || trim((string)($r['volunteerId'] ?? '')) !== '',
            'source' => (string)($r['source'] ?? ''), 'createdAt' => (string)($r['createdAt'] ?? ''),
        ];
    }

    $out = [];
    $affected = 0;
    foreach ($emails as $e) {
        $set = $byEmail[$e] ?? [];
        if (count($set) < 2) continue;
        $affected += count($set);
        /* The consequence, said per group rather than left to be inferred:
           these people cannot open the Mentor Portal at all unless their row
           carries a member or volunteer link. */
        $lockedOut = count(array_filter($set, static fn($m) => !$m['linked']));
        $out[] = ['email' => $e, 'count' => count($set), 'lockedOut' => $lockedOut, 'records' => $set];
    }
    return ['ok' => true, 'duplicates' => $out, 'mentors' => $affected];
}
