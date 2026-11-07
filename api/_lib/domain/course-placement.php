<?php
/**
 * course-placement.php — a member's courses as a stored fact.
 *
 * A child's courses used to be worked out on every read, from free text (the
 * track, the card's interests, an old division), separately in the lessons,
 * the channels, the timetable and the instructors' class lists; each reader
 * guessed a little differently, and a Tech child ended up with a Media course.
 *
 * Now:
 *   - `members.courses` is the placement. Staff confirm it here; a member whose
 *     courses were chosen before this existed is already placed.
 *   - For a member nobody has placed, the record's suggestion is STORED
 *     (`coursesProposed`, with why: `coursesReason`, and `coursesFlag` when a
 *     person should look), recomputed whenever the inputs change
 *     (`coursesInputs`). Every reader, PHP or SQL, sees the same courses.
 *   - The member sees proposed courses marked "not confirmed yet".
 *
 * Ops: admin.courses.placement (list), admin.courses.set (bulk, capped),
 * admin.courses.health (every course: children, instructors, lessons, class
 * times, channel; and what is missing).
 */

const COURSES_BULK_MAX = 500;
const COURSES_PAGE = 50;
const COURSES_STATUSES = ['all', 'unplaced', 'flagged', 'none', 'placed'];

/** What a proposal depends on: the record's words and the course list. */
function members_courses_inputs(array $m, string $catalogueSig): string {
    /* 'p2': the inference rule itself (one course, not a division's worth — 7 Nov 2026). A changed RULE must
       recompute every stored proposal just as changed inputs do, or the old wall of courses stays stored. */
    return sha1(json_encode(['p2', (string)($m['track'] ?? ''), (string)($m['disciplines'] ?? ''), (string)($m['division'] ?? ''), $catalogueSig]));
}

function members_courses_catalogue_sig(): string {
    return sha1(json_encode([curriculum_courses(), function_exists('club_catalogue') ? club_catalogue() : []]));
}

/**
 * Store a proposal for every unplaced member whose inputs changed. One read of
 * the unplaced members; inference only for the ones that moved. Cheap when
 * nothing changed, so readers call it freely (member_course_sql does).
 */
function members_courses_backfill(): int {
    static $busy = false, $atGen = -1;
    // Nothing written since the last pass: nothing to re-propose. A list that
    // checks every row costs one pass, not one per row.
    if ($busy || $atGen === db_write_gen()) return 0;
    $busy = true;
    try {
        $sig = members_courses_catalogue_sig();
        $rows = db_all("SELECT memberId, track, disciplines, division, coursesInputs FROM members WHERE COALESCE(courses,'') IN ('', '[]')");
        $ctx = null; $n = 0;
        foreach ($rows as $m) {
            $in = members_courses_inputs($m, $sig);
            if ((string)($m['coursesInputs'] ?? '') === $in) continue;
            $ctx ??= curriculum_course_ctx();
            $p = curriculum_member_courses_infer($m, $ctx);
            db_update('members', ['coursesProposed' => $p['courses'] ? json_encode($p['courses'], JSON_UNESCAPED_UNICODE) : '',
                'coursesFlag' => $p['flag'], 'coursesReason' => json_encode(['from' => $p['from'], 'dropped' => $p['dropped'], 'alternatives' => $p['alternatives'] ?? []], JSON_UNESCAPED_UNICODE),
                'coursesInputs' => $in], ['memberId' => (string)$m['memberId']]);
            $n++;
        }
        return $n;
    } finally { $busy = false; $atGen = db_write_gen(); }
}

/** A member row's placement, as every screen should describe it. */
function member_courses_state(array $m): array {
    $chosen = member_courses_of($m);
    if ($chosen) return ['status' => 'placed', 'courses' => $chosen, 'flag' => '', 'confirmedAt' => (string)($m['coursesConfirmedAt'] ?? '')];
    $prop = json_decode((string)($m['coursesProposed'] ?? ''), true);
    $prop = is_array($prop) ? array_values(array_map('strval', $prop)) : [];
    $why = json_decode((string)($m['coursesReason'] ?? ''), true) ?: [];
    return ['status' => $prop ? 'unplaced' : 'none', 'courses' => $prop, 'flag' => (string)($m['coursesFlag'] ?? ''),
            'from' => (string)($why['from'] ?? ''), 'dropped' => (array)($why['dropped'] ?? []), 'alternatives' => (array)($why['alternatives'] ?? []), 'confirmedAt' => ''];
}

/** The WHERE for a placement status (names only; values never reach SQL text). */
function members_courses_status_sql(string $status): string {
    $placed = "COALESCE(courses,'') NOT IN ('', '[]')";
    return match ($status) {
        'placed'   => $placed,
        'unplaced' => "NOT ($placed)",
        'flagged'  => "NOT ($placed) AND COALESCE(coursesFlag,'') <> ''",
        'none'     => "NOT ($placed) AND COALESCE(coursesProposed,'') IN ('', '[]')",
        default    => '1 = 1',
    };
}

/** The NGG members a requester may place: active, NGG, in their centres. */
function members_courses_scope_sql(array $requester, string $centre = ''): array {
    $where = ["status = 'active'", "lower(COALESCE(type,'NGG')) = 'ngg'", "COALESCE(role,'member') IN ('', 'member')"]; $args = [];
    $scope = admin_centre_names_in_scope($requester);
    if ($scope !== null) {
        if (!$scope) $scope = ['__none__'];
        $where[] = 'centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    if ($centre !== '') { $where[] = 'centre = ?'; $args[] = $centre; }
    return [implode(' AND ', $where), $args];
}

/**
 * admin.courses.placement — who is placed, who is only proposed (and why), who
 * has nothing. Flagged first by default: those are the ones a person decides.
 * Params: status, centre, q, page; ids=1 returns every matching id (≤ 2000).
 */
function admin_courses_placement(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    members_courses_backfill();
    $status = in_array((string)($p['status'] ?? ''), COURSES_STATUSES, true) ? (string)$p['status'] : 'unplaced';
    [$w, $args] = members_courses_scope_sql($g['requester'], trim((string)($p['centre'] ?? '')));
    $counts = [];
    foreach (COURSES_STATUSES as $st) $counts[$st] = (int)(db_row("SELECT COUNT(*) c FROM members WHERE $w AND " . members_courses_status_sql($st), $args)['c'] ?? 0);
    $where = "$w AND " . members_courses_status_sql($status);
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    if ($q !== '') { $where .= ' AND (lower(fullName) LIKE ? OR lower(memberId) LIKE ? OR lower(COALESCE(displayId,\'\')) LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%"); }
    if (!empty($p['ids'])) {
        return ['ok' => true, 'ids' => array_column(db_all("SELECT memberId FROM members WHERE $where ORDER BY fullName LIMIT 2000", $args), 'memberId')];
    }
    $total = (int)(db_row("SELECT COUNT(*) c FROM members WHERE $where", $args)['c'] ?? 0);
    $page = max(0, (int)($p['page'] ?? 0));
    $per = (int)($p['pageSize'] ?? COURSES_PAGE); if ($per < 1 || $per > 100) $per = COURSES_PAGE;
    $rows = db_all("SELECT memberId, displayId, fullName, centre, track, disciplines, division, courses, coursesProposed, coursesFlag, coursesReason, coursesConfirmedAt
                    FROM members WHERE $where ORDER BY (COALESCE(coursesFlag,'') = '') , fullName LIMIT " . $per . ' OFFSET ' . ($page * $per), $args);
    $out = [];
    foreach ($rows as $m) {
        $st = member_courses_state($m);
        $out[] = ['memberId' => (string)$m['memberId'], 'displayId' => (string)($m['displayId'] ?? ''), 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre'],
                  'track' => (string)$m['track'], 'interests' => (string)($m['disciplines'] ?? '')] + $st;
    }
    $byDivision = [];
    if (function_exists('nggc_divisions')) {
        $ctx = curriculum_course_ctx();
        foreach (nggc_divisions() as $d) $byDivision[] = ['division' => $d['name'], 'courses' => array_values(array_unique(array_merge(curriculum_division_courses($d['id'], $ctx), ['Chess'])))];
    }
    return ['ok' => true, 'rows' => $out, 'total' => $total, 'page' => $page, 'pageSize' => $per, 'status' => $status, 'counts' => $counts,
            'catalogue' => $byDivision, 'max' => COURSES_BULK_MAX];
}

/**
 * admin.courses.set — place members. actions:
 *   confirm         their proposal becomes their courses;
 *   set {courses}   exactly these courses;
 *   add / remove {course}  one course, keeping the rest.
 * Validated before any write; capped; per-row verdicts (out_of_scope,
 * not_a_member, nothing_proposed, unchanged); one audit event per run.
 */
function admin_courses_set(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $action = (string)($p['action'] ?? '');
    if (!in_array($action, ['confirm', 'set', 'add', 'remove'], true)) return ['ok' => false, 'error' => 'unknown_action'];
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > COURSES_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => COURSES_BULK_MAX];
    // The whole payload is checked before anything is written.
    $want = [];
    foreach ($action === 'set' ? (array)($p['courses'] ?? []) : ($action === 'confirm' ? [] : [(string)($p['course'] ?? '')]) as $c) {
        $canon = mb_strtolower(trim((string)$c)) === 'chess' ? 'Chess' : curriculum_course_canonical((string)$c);
        if (!$canon) return ['ok' => false, 'error' => 'unknown_course', 'course' => (string)$c, 'suggest' => curriculum_course_suggest((string)$c)];
        if (!in_array($canon, $want, true)) $want[] = $canon;
    }
    if (in_array($action, ['add', 'remove'], true) && !$want) return ['ok' => false, 'error' => 'course_required'];
    if ($action === 'set' && !$want) return ['ok' => false, 'error' => 'course_required'];
    members_courses_backfill();
    $by = (string)$g['requester']['memberId']; $now = now_iso();
    $results = []; $applied = 0; $unchanged = 0; $refused = 0;
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $rows = []; foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $ids) as $r) $rows[(string)$r['memberId']] = $r;
    foreach ($ids as $id) {
        $m = $rows[$id] ?? null;
        if (!$m) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; $refused++; continue; }
        if (!admin_centre_allowed($g['requester'], (string)$m['centre'])) { $results[] = ['id' => $id, 'name' => $m['fullName'], 'ok' => false, 'error' => 'out_of_scope']; $refused++; continue; }
        if (!member_is_ngg($m)) { $results[] = ['id' => $id, 'name' => $m['fullName'], 'ok' => false, 'error' => 'not_a_member']; $refused++; continue; }
        $st = member_courses_state($m);
        $cur = $st['status'] === 'placed' ? $st['courses'] : [];
        $next = match ($action) {
            'confirm' => $st['status'] === 'placed' ? $cur : $st['courses'],
            'set'     => $want,
            'add'     => array_values(array_unique(array_merge($cur ?: $st['courses'], $want))),
            'remove'  => array_values(array_filter($cur ?: $st['courses'], static fn($c) => !in_array(mb_strtolower($c), array_map('mb_strtolower', $want), true))),
        };
        if (!$next) { $results[] = ['id' => $id, 'name' => $m['fullName'], 'ok' => false, 'error' => $action === 'confirm' ? 'nothing_proposed' : 'no_courses_left']; $refused++; continue; }
        if ($st['status'] === 'placed' && $next === $cur) { $results[] = ['id' => $id, 'name' => $m['fullName'], 'ok' => true, 'unchanged' => true]; $unchanged++; continue; }
        db_update('members', ['courses' => json_encode($next, JSON_UNESCAPED_UNICODE), 'coursesConfirmedAt' => $now, 'coursesConfirmedBy' => $by, 'updatedAt' => $now], ['memberId' => $id]);
        $results[] = ['id' => $id, 'name' => $m['fullName'], 'ok' => true, 'courses' => $next]; $applied++;
    }
    audit('admin.courses.' . $action, $by, '', ['count' => count($ids), 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'courses' => $want], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'results' => $results];
}

/**
 * admin.courses.health — every course, and whether it can actually be taught:
 * children (placed and only proposed), instructors, published lessons (its own,
 * and ones filed under its parts), class times, a channel. Each gap is named
 * with what to do. Centre-scoped. Readable by people, club or curriculum.
 */
function admin_courses_health(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'club', 'curriculum']); if (!$g['ok']) return $g;
    members_courses_backfill();
    // Every course has a channel; make sure before saying one is missing.
    if (function_exists('community_ensure_channels')) community_ensure_channels();
    [$w, $args] = members_courses_scope_sql($g['requester'], trim((string)($p['centre'] ?? '')));
    $kids = [];   // lower(course) => [placed, proposed]
    foreach (db_all("SELECT courses, coursesProposed FROM members WHERE $w", $args) as $m) {
        $st = member_courses_state($m);
        foreach ($st['courses'] as $c) { $k = mb_strtolower($c); $kids[$k] ??= [0, 0]; $kids[$k][$st['status'] === 'placed' ? 0 : 1]++; }
    }
    $teach = [];
    $vw = "status = 'active' AND role = 'instructor'"; $va = [];
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) { $vw .= ' AND centre IN (' . implode(',', array_fill(0, max(1, count($scope)), '?')) . ')'; $va = $scope ?: ['__none__']; }
    foreach (db_all("SELECT courses FROM volunteers WHERE $vw", $va) as $v)
        foreach ((json_decode((string)$v['courses'], true) ?: []) as $c) { $k = mb_strtolower((string)$c); $teach[$k] = ($teach[$k] ?? 0) + 1; }
    $lessons = [];
    foreach (db_all("SELECT lower(course) c, COUNT(*) n FROM curriculum_units WHERE status = 'published' AND course <> '' GROUP BY lower(course)") as $r) $lessons[(string)$r['c']] = (int)$r['n'];
    $slots = [];
    foreach (db_all("SELECT lower(course) c, COUNT(*) n FROM timetable_slots WHERE status = 'active' GROUP BY lower(course)") as $r) $slots[(string)$r['c']] = (int)$r['n'];
    $chan = [];
    foreach (db_all("SELECT lower(name) c FROM community_channels WHERE kind = 'course' AND status = 'active'") as $r) $chan[(string)$r['c']] = true;

    // Lesson files a lost folder took (curriculum_missing_files): per course, to upload again.
    $lost = []; $lostList = [];
    if (function_exists('curriculum_missing_files')) foreach (curriculum_missing_files() as $x) {
        $k = mb_strtolower($x['course']); $lost[$k] = ($lost[$k] ?? 0) + 1;
        if (count($lostList[$k] ?? []) < 30) $lostList[$k][] = 'Week ' . $x['week'] . ' · ' . $x['title'] . ' — ' . $x['label'];
    }
    $ctx = curriculum_course_ctx(); $out = []; $seen = [];
    $divs = function_exists('nggc_divisions') ? nggc_divisions() : [];
    foreach ($divs as $d) foreach (curriculum_division_courses($d['id'], $ctx) as $c) {
        $k = mb_strtolower($c); if ($k === 'chess' || isset($seen[$k])) continue; $seen[$k] = true;
        $own = $lessons[$k] ?? 0; $fam = 0;
        if (!$own) foreach (curriculum_course_family($c) as $f) if (mb_strtolower($f) !== $k) $fam += $lessons[mb_strtolower($f)] ?? 0;
        [$placed, $proposed] = $kids[$k] ?? [0, 0];
        $n = $placed + $proposed; $gaps = [];
        if ($n && !$own && !$fam) $gaps[] = ['no_lessons', 'No lessons published. Write the first one in Curriculum, or let its instructor write it from their portal.'];
        if ($n && !($teach[$k] ?? 0)) $gaps[] = ['no_instructor', 'No instructor teaches it. Add the course to an instructor in Mentors & volunteers.'];
        if ($n && !($slots[$k] ?? 0)) $gaps[] = ['no_class_time', 'No class time on the timetable, so children cannot see when it meets.'];
        if ($proposed) $gaps[] = ['unconfirmed', $proposed . ' child' . ($proposed === 1 ? ' is' : 'ren are') . ' only proposed. Confirm them in Members → Courses.'];
        if (!$n && ($own || ($teach[$k] ?? 0))) $gaps[] = ['no_children', 'Nobody is placed in it yet.'];
        if ($lost[$k] ?? 0) $gaps[] = ['missing_files', $lost[$k] . ' lesson file' . ($lost[$k] === 1 ? ' is' : 's are') . ' missing from the server (a diagram, picture, GIF or recording). Upload ' . ($lost[$k] === 1 ? 'it' : 'them') . ' again in Curriculum.'];
        $out[] = ['course' => $c, 'division' => $d['name'], 'placed' => $placed, 'proposed' => $proposed, 'instructors' => $teach[$k] ?? 0,
                  'lessons' => $own, 'lessonsFromParts' => $fam, 'classTimes' => $slots[$k] ?? 0, 'channel' => isset($chan[$k]), 'missingFiles' => $lostList[$k] ?? [], 'gaps' => array_map(static fn($x) => ['code' => $x[0], 'say' => $x[1]], $gaps)];
    }
    // The courses with children and gaps first: those are the ones that are failing someone.
    usort($out, static fn($a, $b) => [-(($a['placed'] + $a['proposed']) > 0 && $a['gaps'] ? 1 : 0), -($a['placed'] + $a['proposed']), $a['course']]
                                    <=> [-(($b['placed'] + $b['proposed']) > 0 && $b['gaps'] ? 1 : 0), -($b['placed'] + $b['proposed']), $b['course']]);
    $sum = ['courses' => count($out), 'withChildren' => count(array_filter($out, fn($c) => $c['placed'] + $c['proposed'] > 0)),
            'failing' => count(array_filter($out, fn($c) => $c['placed'] + $c['proposed'] > 0 && array_filter($c['gaps'], fn($x) => $x['code'] !== 'unconfirmed')))];
    return ['ok' => true, 'courses' => $out, 'summary' => $sum];
}
