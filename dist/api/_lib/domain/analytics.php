<?php
/**
 * Analytics workspace — the M&E / donor-reporting engine behind the modern
 * Summer School Analytics experience. One read op (`analytics.workspace`)
 * assembles four levels of insight from the live data:
 *
 *   Level 1 · Executive   — headline KPIs for directors & sponsors
 *   Level 2 · Operations  — the coordinator's working numbers
 *   Level 3 · Research    — impact measurement (gender/age/longitudinal/stats)
 *   Level 4 · Evidence    — donor-grade supporting artefacts per activity
 *
 * Everything respects per-centre admin scoping and an optional global filter
 * (week / day / centre / department / category). A companion `analytics.drilldown`
 * returns the underlying records behind any KPI, and `analytics.activity.add`
 * logs an activity with its evidence attachments.
 *
 * This is the admin console — names are allowed here (unlike the public status
 * board). Access is still gated to admin tiers only.
 */

// ── small stats helpers ──────────────────────────────────────────────────────
function analytics_stats(array $xs): array {
    $xs = array_values(array_filter(array_map('floatval', $xs), fn($v) => $v === $v)); // drop NaN
    $n = count($xs);
    if (!$n) return ['n' => 0, 'mean' => 0, 'median' => 0, 'sd' => 0, 'min' => 0, 'max' => 0];
    sort($xs);
    $mean = array_sum($xs) / $n;
    $mid = intdiv($n, 2);
    $median = $n % 2 ? $xs[$mid] : ($xs[$mid - 1] + $xs[$mid]) / 2;
    $var = 0.0; foreach ($xs as $x) $var += ($x - $mean) ** 2;
    $sd = $n > 1 ? sqrt($var / ($n - 1)) : 0.0;
    return [
        'n' => $n,
        'mean' => round($mean, 1),
        'median' => round($median, 1),
        'sd' => round($sd, 1),
        'min' => round($xs[0], 1),
        'max' => round($xs[$n - 1], 1),
    ];
}

/** Resolve the analytics date range from the filter payload. */
function analytics_range(array $p): array {
    $day = trim((string)($p['day'] ?? ''));
    $week = trim((string)($p['week'] ?? ''));
    if ($day !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        return ['from' => $day, 'to' => $day, 'label' => $day, 'grain' => 'day'];
    }
    if ($week !== '' && preg_match('/^(\d{4})-W(\d{2})$/', $week, $m)) {
        $dt = new DateTime('now', new DateTimeZone('UTC'));
        $dt->setISODate((int)$m[1], (int)$m[2]);
        $from = $dt->format('Y-m-d');
        $dt->modify('+6 days');
        return ['from' => $from, 'to' => $dt->format('Y-m-d'), 'label' => $week, 'grain' => 'week'];
    }
    $min = db_row('SELECT MIN(date) d FROM attendance')['d'] ?? null;
    return [
        'from' => $min ?: gmdate('Y-m-d', time() - 59 * 86400),
        'to' => gmdate('Y-m-d'),
        'label' => 'All weeks',
        'grain' => 'all',
    ];
}

/** Centres visible to this requester, narrowed by an optional centre filter. */
function analytics_centres(array $requester, string $centreFilter): array {
    $scope = admin_centre_names_in_scope($requester); // null = unscoped
    $rows = db_all("SELECT centreId, name, code, color FROM centres WHERE status = 'active' ORDER BY name");
    $out = [];
    foreach ($rows as $r) {
        $n = (string)$r['name'];
        if ($scope !== null && !in_array($n, $scope, true)) continue;
        if ($centreFilter !== '' && $n !== $centreFilter) continue;
        $out[] = $r;
    }
    return $out;
}

/** ISO-week key for a Y-m-d string. */
function analytics_week_of(string $date): string {
    $t = strtotime($date . ' UTC');
    return $t ? gmdate('o-\WW', $t) : '';
}

function analytics_workspace(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $requester = $g['requester'];

    $centreFilter = trim((string)($p['centre'] ?? ''));
    $deptFilter   = trim((string)($p['department'] ?? ''));
    $catFilter    = trim((string)($p['category'] ?? ''));
    $range = analytics_range($p);
    [$from, $to] = [$range['from'], $range['to']];

    $centres = analytics_centres($requester, $centreFilter);
    $cNames = array_map(fn($c) => (string)$c['name'], $centres);
    $today = gmdate('Y-m-d');

    // Filter-option catalogue (always the full scope, not the current selection).
    $allCentres = analytics_centres($requester, '');
    $weekRows = db_all('SELECT DISTINCT date FROM attendance ORDER BY date DESC');
    $weeks = [];
    foreach ($weekRows as $wr) { $wk = analytics_week_of((string)$wr['date']); if ($wk && !in_array($wk, $weeks, true)) $weeks[] = $wk; }
    $depts = array_values(array_filter(array_map(
        fn($r) => (string)$r['department'],
        db_all("SELECT DISTINCT department FROM mentors WHERE department IS NOT NULL AND department != '' ORDER BY department")
    )));
    $cats = array_values(array_filter(array_map(
        fn($r) => (string)$r['category'],
        db_all("SELECT DISTINCT category FROM activities WHERE category != '' ORDER BY category")
    )));
    if (!$cats) $cats = ['lesson', 'assessment', 'activity', 'excursion', 'workshop'];

    $filters = [
        'week' => $range['grain'] === 'week' ? $range['label'] : '',
        'day' => $range['grain'] === 'day' ? $range['label'] : '',
        'centre' => $centreFilter, 'department' => $deptFilter, 'category' => $catFilter,
        'rangeLabel' => $range['label'], 'from' => $from, 'to' => $to,
        'options' => ['weeks' => $weeks, 'centres' => array_map(fn($c) => $c['name'], $allCentres), 'departments' => $depts, 'categories' => $cats],
    ];

    // No visible centres (a scoped admin with an empty scope) → empty shell.
    if (!$cNames) {
        return ['ok' => true, 'workspace' => [
            'filters' => $filters, 'generatedAt' => now_iso(),
            'executive' => [], 'operations' => [], 'research' => [], 'evidence' => ['byType' => [], 'gallery' => []],
            'rankings' => [], 'timeline' => [],
        ]];
    }

    $cIn = '(' . implode(',', array_fill(0, count($cNames), '?')) . ')';

    // ── per-student rollups (attendance + academic) over the range ───────────
    $students = db_all("SELECT studentId, fullName, centre, age, gender, track FROM summer_students WHERE status = 'active' AND centre IN $cIn", $cNames);
    $schoolDays = (int)(db_row('SELECT COUNT(DISTINCT date) c FROM attendance WHERE date BETWEEN ? AND ?', [$from, $to])['c'] ?? 0);
    $attRows = db_all('SELECT studentId, COUNT(DISTINCT date) c FROM attendance WHERE date BETWEEN ? AND ? GROUP BY studentId', [$from, $to]);
    $attById = []; foreach ($attRows as $r) $attById[(string)$r['studentId']] = (int)$r['c'];
    $gradeRows = db_all('SELECT memberId sid, AVG(grade) g, COUNT(*) n FROM assignment_submissions WHERE grade IS NOT NULL GROUP BY memberId');
    $gradeById = []; foreach ($gradeRows as $r) $gradeById[(string)$r['sid']] = ['avg' => round((float)$r['g'], 1), 'n' => (int)$r['n']];

    $perStudent = [];
    foreach ($students as $s) {
        $sid = (string)$s['studentId'];
        $days = $attById[$sid] ?? 0;
        $rate = $schoolDays ? (int)round($days / $schoolDays * 100) : 0;
        $perStudent[] = [
            'studentId' => $sid, 'name' => (string)$s['fullName'], 'centre' => (string)$s['centre'],
            'age' => (int)$s['age'], 'gender' => (string)($s['gender'] ?? ''), 'track' => (string)$s['track'],
            'daysPresent' => $days, 'attendanceRate' => $rate,
            'avgGrade' => $gradeById[$sid]['avg'] ?? null, 'assessments' => $gradeById[$sid]['n'] ?? 0,
        ];
    }
    $enrolled = count($perStudent);

    // ── per-centre rollups ───────────────────────────────────────────────────
    $byCentre = [];
    foreach ($centres as $c) {
        $name = (string)$c['name'];
        $rows = array_values(array_filter($perStudent, fn($x) => $x['centre'] === $name));
        $en = count($rows);
        $rates = array_map(fn($x) => $x['attendanceRate'], $rows);
        $grades = array_values(array_filter(array_map(fn($x) => $x['avgGrade'], $rows), fn($v) => $v !== null));
        $presentToday = (int)(db_row('SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE s.centre = ? AND a.date = ?', [$name, $today])['c'] ?? 0);
        $acts = (int)(db_row("SELECT COUNT(*) c FROM activities WHERE centre = ? AND date BETWEEN ? AND ?" . ($catFilter ? ' AND category = ?' : ''), $catFilter ? [$name, $from, $to, $catFilter] : [$name, $from, $to])['c'] ?? 0);
        $stars = (int)(db_row('SELECT COALESCE(SUM(stars),0) c FROM member_stars WHERE centre = ? AND date BETWEEN ? AND ?', [$name, $from, $to])['c'] ?? 0);
        $byCentre[] = [
            'centreId' => $c['centreId'], 'name' => $name, 'code' => $c['code'], 'color' => $c['color'],
            'enrolled' => $en, 'presentToday' => $presentToday,
            'attendanceRate' => $en ? (int)round(array_sum($rates) / $en) : 0,
            'avgGrade' => $grades ? round(array_sum($grades) / count($grades), 1) : null,
            'activities' => $acts, 'stars' => $stars,
        ];
    }

    // ── daily attendance series over the range ───────────────────────────────
    $dailyRows = db_all("SELECT a.date date, COUNT(DISTINCT a.studentId) present, SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) late FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date BETWEEN ? AND ? AND s.centre IN $cIn GROUP BY a.date ORDER BY a.date", array_merge([$from, $to], $cNames));
    $daily = array_map(fn($r) => [
        'date' => (string)$r['date'], 'present' => (int)$r['present'], 'late' => (int)$r['late'],
        'rate' => $enrolled ? (int)round((int)$r['present'] / $enrolled * 100) : 0,
    ], $dailyRows);

    // Attendance rate over the range = mean of daily rates.
    $attendanceRate = $daily ? (int)round(array_sum(array_map(fn($d) => $d['rate'], $daily)) / count($daily)) : 0;
    $presentToday = (int)(db_row("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ? AND s.centre IN $cIn", array_merge([$today], $cNames))['c'] ?? 0);

    // Weekly growth = this ISO week distinct present vs last ISO week.
    $wkThisFrom = gmdate('Y-m-d', strtotime('monday this week', time()));
    $wkLastFrom = gmdate('Y-m-d', strtotime('monday last week', time()));
    $wkLastTo   = gmdate('Y-m-d', strtotime('sunday last week', time()));
    $presThis = (int)(db_row("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date >= ? AND s.centre IN $cIn", array_merge([$wkThisFrom], $cNames))['c'] ?? 0);
    $presLast = (int)(db_row("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date BETWEEN ? AND ? AND s.centre IN $cIn", array_merge([$wkLastFrom, $wkLastTo], $cNames))['c'] ?? 0);
    $weeklyGrowth = $presLast ? (int)round(($presThis - $presLast) / $presLast * 100) : ($presThis ? 100 : 0);

    // ── assessments (assignments + submissions) ──────────────────────────────
    $assignTotal = (int)(db_row('SELECT COUNT(*) c FROM assignments')['c'] ?? 0);
    $gradedTotal = (int)(db_row('SELECT COUNT(*) c FROM assignment_submissions WHERE grade IS NOT NULL')['c'] ?? 0);
    $submittedTotal = (int)(db_row('SELECT COUNT(*) c FROM assignment_submissions')['c'] ?? 0);
    $pendingGrade = $submittedTotal - $gradedTotal;
    $dueSoon = db_all("SELECT assignmentId, title, dueAt, centre, week FROM assignments WHERE status = 'open' AND dueAt >= ? ORDER BY dueAt ASC LIMIT 8", [$today]);
    $activitiesTotal = (int)(db_row('SELECT COUNT(*) c FROM activities WHERE date BETWEEN ? AND ?' . ($catFilter ? ' AND category = ?' : ''), $catFilter ? [$from, $to, $catFilter] : [$from, $to])['c'] ?? 0);

    // ── departments & teacher activity ───────────────────────────────────────
    $deptCount = (int)(db_row("SELECT COUNT(DISTINCT department) c FROM mentors WHERE department IS NOT NULL AND department != ''")['c'] ?? 0);
    $mentorRows = db_all("SELECT mentorId, fullName, centre, department FROM mentors WHERE status = 'active'" . ($deptFilter ? ' AND department = ?' : ''), $deptFilter ? [$deptFilter] : []);
    $teacherActivity = [];
    foreach ($mentorRows as $m) {
        if ($cNames && $m['centre'] && !in_array((string)$m['centre'], $cNames, true)) continue;
        $mid = (string)$m['mentorId'];
        $starsGiven = (int)(db_row('SELECT COUNT(*) c FROM member_stars WHERE givenById = ? AND date BETWEEN ? AND ?', [$mid, $from, $to])['c'] ?? 0);
        $ratings = (int)(db_row('SELECT COUNT(*) c FROM v3_scores WHERE givenById = ?', [$mid])['c'] ?? 0);
        $acts = (int)(db_row('SELECT COUNT(*) c FROM activities WHERE facilitatorId = ? AND date BETWEEN ? AND ?', [$mid, $from, $to])['c'] ?? 0);
        $teacherActivity[] = ['name' => (string)$m['fullName'], 'department' => (string)($m['department'] ?? ''), 'centre' => (string)$m['centre'], 'starsGiven' => $starsGiven, 'ratings' => $ratings, 'activities' => $acts, 'score' => $starsGiven + $ratings + $acts];
    }
    usort($teacherActivity, fn($a, $b) => $b['score'] <=> $a['score']);

    // Missing reports: active centres with no activity logged today.
    $missingReports = [];
    foreach ($centres as $c) {
        $has = (int)(db_row('SELECT COUNT(*) c FROM activities WHERE centre = ? AND date = ?', [(string)$c['name'], $today])['c'] ?? 0);
        if (!$has) $missingReports[] = (string)$c['name'];
    }

    // Student engagement over the range.
    $starsInRange = (int)(db_row("SELECT COUNT(*) c FROM member_stars WHERE date BETWEEN ? AND ?" . ($cNames ? " AND centre IN $cIn" : ''), array_merge([$from, $to], $cNames))['c'] ?? 0);
    $studentsStarred = (int)(db_row("SELECT COUNT(DISTINCT subjectId) c FROM member_stars WHERE date BETWEEN ? AND ?" . ($cNames ? " AND centre IN $cIn" : ''), array_merge([$from, $to], $cNames))['c'] ?? 0);
    $engagementPct = $enrolled ? (int)round($studentsStarred / $enrolled * 100) : 0;

    // ── research: gender / age / longitudinal / stats / scatter ──────────────
    $genderAgg = [];
    foreach ($perStudent as $x) {
        $key = $x['gender'] !== '' ? $x['gender'] : 'Not recorded';
        $genderAgg[$key] ??= ['gender' => $key, 'count' => 0, '_rate' => [], '_grade' => []];
        $genderAgg[$key]['count']++;
        $genderAgg[$key]['_rate'][] = $x['attendanceRate'];
        if ($x['avgGrade'] !== null) $genderAgg[$key]['_grade'][] = $x['avgGrade'];
    }
    $genderAnalysis = array_values(array_map(function ($v) {
        $r = $v['_rate']; $gr = $v['_grade'];
        return ['gender' => $v['gender'], 'count' => $v['count'],
            'attendanceRate' => $r ? (int)round(array_sum($r) / count($r)) : 0,
            'avgGrade' => $gr ? round(array_sum($gr) / count($gr), 1) : null];
    }, $genderAgg));

    $bands = [['label' => '≤10', 'lo' => 0, 'hi' => 10], ['label' => '11–13', 'lo' => 11, 'hi' => 13], ['label' => '14–16', 'lo' => 14, 'hi' => 16], ['label' => '17+', 'lo' => 17, 'hi' => 200]];
    $ageAnalysis = [];
    foreach ($bands as $b) {
        $rows = array_values(array_filter($perStudent, fn($x) => $x['age'] >= $b['lo'] && $x['age'] <= $b['hi']));
        $r = array_map(fn($x) => $x['attendanceRate'], $rows);
        $gr = array_values(array_filter(array_map(fn($x) => $x['avgGrade'], $rows), fn($v) => $v !== null));
        $ageAnalysis[] = ['band' => $b['label'], 'count' => count($rows),
            'attendanceRate' => $r ? (int)round(array_sum($r) / count($r)) : 0,
            'avgGrade' => $gr ? round(array_sum($gr) / count($gr), 1) : null];
    }

    $longRows = db_all('SELECT a.week w, AVG(sub.grade) g, COUNT(*) n FROM assignment_submissions sub JOIN assignments a ON a.assignmentId = sub.assignmentId WHERE sub.grade IS NOT NULL GROUP BY a.week ORDER BY a.week');
    $longitudinal = array_map(fn($r) => ['week' => (int)$r['w'], 'avgGrade' => round((float)$r['g'], 1), 'n' => (int)$r['n']], $longRows);
    $intervention = null;
    if (count($longitudinal) >= 2) {
        $pre = $longitudinal[0]; $post = $longitudinal[count($longitudinal) - 1];
        $delta = round($post['avgGrade'] - $pre['avgGrade'], 1);
        $intervention = ['preWeek' => $pre['week'], 'preGrade' => $pre['avgGrade'], 'postWeek' => $post['week'], 'postGrade' => $post['avgGrade'], 'delta' => $delta, 'improvementPct' => $pre['avgGrade'] ? (int)round($delta / $pre['avgGrade'] * 100) : 0];
    }

    $scatter = array_values(array_map(fn($x) => ['x' => $x['attendanceRate'], 'y' => $x['avgGrade'], 'centre' => $x['centre']],
        array_filter($perStudent, fn($x) => $x['avgGrade'] !== null)));
    // Pearson r between attendance and grade.
    $corr = null;
    if (count($scatter) >= 3) {
        $xs = array_map(fn($p) => $p['x'], $scatter); $ys = array_map(fn($p) => $p['y'], $scatter);
        $n = count($xs); $mx = array_sum($xs) / $n; $my = array_sum($ys) / $n;
        $num = 0; $dx = 0; $dy = 0;
        for ($i = 0; $i < $n; $i++) { $num += ($xs[$i] - $mx) * ($ys[$i] - $my); $dx += ($xs[$i] - $mx) ** 2; $dy += ($ys[$i] - $my) ** 2; }
        $corr = ($dx > 0 && $dy > 0) ? round($num / sqrt($dx * $dy), 2) : null;
    }

    $statSummary = [
        'attendance' => analytics_stats(array_map(fn($x) => $x['attendanceRate'], $perStudent)),
        'grades' => analytics_stats(array_values(array_filter(array_map(fn($x) => $x['avgGrade'], $perStudent), fn($v) => $v !== null))),
    ];

    // ── rankings & awards ────────────────────────────────────────────────────
    $ranking = $byCentre;
    usort($ranking, fn($a, $b) => $b['attendanceRate'] <=> $a['attendanceRate']);
    $bestCentre = $ranking[0] ?? null;
    $topStudents = $perStudent;
    usort($topStudents, function ($a, $b) {
        return [$b['attendanceRate'], $b['avgGrade'] ?? 0] <=> [$a['attendanceRate'], $a['avgGrade'] ?? 0];
    });
    $bestStudent = $topStudents[0] ?? null;
    $awardRows = db_all('SELECT name, subjectId, tier, centre, period FROM awards ORDER BY mintedAt DESC LIMIT 12');
    $weeklyAwards = array_map(function ($a) {
        $s = db_row('SELECT fullName FROM summer_students WHERE studentId = ?', [(string)$a['subjectId']]);
        return ['name' => (string)$a['name'], 'subject' => $s['fullName'] ?? (string)$a['subjectId'], 'tier' => (int)$a['tier'], 'centre' => (string)$a['centre'], 'period' => (string)$a['period']];
    }, $awardRows);

    // V3 (Verbal·Vocal·Visual) champions for the current ISO week — a per-centre
    // leaderboard the Governing Council can mint into non-monetary awards.
    $period = iso_week_period();
    $v3 = function_exists('v3_leaderboard') ? v3_leaderboard($period) : ['period' => $period, 'byCentre' => [], 'overall' => [], 'rated' => 0];
    if ($cNames) {
        foreach (array_keys($v3['byCentre']) as $cn) if (!in_array($cn, $cNames, true)) unset($v3['byCentre'][$cn]);
        $v3['overall'] = array_values(array_filter($v3['overall'], fn($x) => in_array($x['centre'], $cNames, true)));
    }
    $v3Minted = (int)(db_row("SELECT COUNT(*) c FROM awards WHERE period = ? AND name LIKE 'V3 Champion%'", [$period])['c'] ?? 0);
    $canMint = (bool)array_intersect(['people'], member_effective_caps($requester)) || strtolower((string)($requester['role'] ?? '')) === 'super_admin';

    // ── today's programme timeline ───────────────────────────────────────────
    $timeline = [];
    foreach (db_all('SELECT title, category, centre, facilitatorName FROM activities WHERE date = ? ORDER BY createdAt', [$today]) as $a) {
        $timeline[] = ['kind' => 'activity', 'title' => (string)$a['title'], 'meta' => trim(((string)$a['category']) . ' · ' . (string)$a['centre']), 'by' => (string)$a['facilitatorName']];
    }
    foreach ($dueSoon as $a) {
        if (substr((string)$a['dueAt'], 0, 10) === $today) $timeline[] = ['kind' => 'due', 'title' => (string)$a['title'] . ' — due', 'meta' => (string)$a['centre'], 'by' => ''];
    }

    // ── evidence gallery (Level 4) ───────────────────────────────────────────
    $evRows = db_all('SELECT activityId, title, category, centre, department, date, facilitatorName, evidence FROM activities WHERE date BETWEEN ? AND ?' . ($catFilter ? ' AND category = ?' : '') . ($cNames ? " AND (centre = '' OR centre IN $cIn)" : '') . ' ORDER BY date DESC, id DESC LIMIT 40',
        array_merge([$from, $to], $catFilter ? [$catFilter] : [], $cNames));
    $gallery = []; $byType = [];
    foreach ($evRows as $r) {
        $ev = safe_json((string)($r['evidence'] ?? '[]')); if (!is_array($ev)) $ev = [];
        foreach ($ev as $e) { $t = (string)($e['type'] ?? 'file'); $byType[$t] = ($byType[$t] ?? 0) + 1; }
        $gallery[] = ['activityId' => (string)$r['activityId'], 'title' => (string)$r['title'], 'category' => (string)$r['category'], 'centre' => (string)$r['centre'], 'department' => (string)$r['department'], 'date' => (string)$r['date'], 'facilitator' => (string)$r['facilitatorName'], 'evidence' => array_values($ev), 'count' => count($ev)];
    }
    $byTypeArr = []; foreach ($byType as $k => $v) $byTypeArr[] = ['type' => $k, 'count' => $v];
    usort($byTypeArr, fn($a, $b) => $b['count'] <=> $a['count']);

    return ['ok' => true, 'workspace' => [
        'filters' => $filters,
        'generatedAt' => now_iso(),
        'executive' => [
            'totalStudents' => $enrolled,
            'centres' => count($centres),
            'departments' => $deptCount,
            'attendanceRate' => $attendanceRate,
            'assessments' => ['total' => $assignTotal, 'graded' => $gradedTotal, 'pending' => $pendingGrade],
            'activities' => $activitiesTotal,
            'weeklyGrowth' => $weeklyGrowth,
            'presentToday' => $presentToday,
            'bestCentre' => $bestCentre ? ['name' => $bestCentre['name'], 'rate' => $bestCentre['attendanceRate'], 'color' => $bestCentre['color']] : null,
            'bestStudent' => $bestStudent ? ['name' => $bestStudent['name'], 'centre' => $bestStudent['centre'], 'attendanceRate' => $bestStudent['attendanceRate'], 'avgGrade' => $bestStudent['avgGrade']] : null,
        ],
        'operations' => [
            'daily' => $daily,
            'teacherActivity' => array_slice($teacherActivity, 0, 8),
            'lessonCompletion' => ['submitted' => $submittedTotal, 'assignments' => $assignTotal, 'graded' => $gradedTotal, 'pending' => $pendingGrade, 'completionPct' => $assignTotal ? (int)round($submittedTotal / max(1, $assignTotal * max(1, $enrolled)) * 100) : 0],
            'assessmentsDue' => array_map(fn($a) => ['title' => (string)$a['title'], 'dueAt' => (string)$a['dueAt'], 'centre' => (string)$a['centre'], 'week' => (int)$a['week']], $dueSoon),
            'missingReports' => $missingReports,
            'volunteers' => ['active' => (int)(db_row("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'")['c'] ?? 0), 'cleared' => (int)(db_row("SELECT COUNT(*) c FROM volunteers WHERE status = 'active' AND safeguarding = 'cleared'")['c'] ?? 0)],
            'engagement' => ['starsInRange' => $starsInRange, 'studentsStarred' => $studentsStarred, 'engagementPct' => $engagementPct, 'avgStarsPerStudent' => $enrolled ? round($starsInRange / $enrolled, 1) : 0],
        ],
        'research' => [
            'scatter' => $scatter,
            'correlation' => $corr,
            'gender' => $genderAnalysis,
            'age' => $ageAnalysis,
            'centreComparison' => $byCentre,
            'longitudinal' => $longitudinal,
            'intervention' => $intervention,
            'stats' => $statSummary,
        ],
        'evidence' => ['byType' => $byTypeArr, 'gallery' => $gallery, 'total' => array_sum(array_column($byTypeArr, 'count'))],
        'rankings' => ['centres' => $ranking, 'topStudents' => array_slice($topStudents, 0, 5), 'awards' => $weeklyAwards,
            'v3' => ['period' => $period, 'overall' => $v3['overall'], 'byCentre' => $v3['byCentre'], 'rated' => $v3['rated'], 'minted' => $v3Minted, 'canMint' => $canMint]],
        'timeline' => $timeline,
    ]];
}

/**
 * Drill-down: the underlying records behind a KPI. Admin-only (names allowed).
 * metric ∈ present-today | absent-today | low-attendance | top-students |
 *          pending-grading | missing-reports | activities
 */
function analytics_drilldown(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $metric = (string)($p['metric'] ?? '');
    $range = analytics_range($p);
    [$from, $to] = [$range['from'], $range['to']];
    $centres = analytics_centres($g['requester'], trim((string)($p['centre'] ?? '')));
    $cNames = array_map(fn($c) => (string)$c['name'], $centres);
    if (!$cNames) return ['ok' => true, 'metric' => $metric, 'rows' => []];
    $cIn = '(' . implode(',', array_fill(0, count($cNames), '?')) . ')';
    $today = gmdate('Y-m-d');
    $rows = [];

    switch ($metric) {
        case 'present-today':
            $rows = db_all("SELECT s.fullName name, s.centre, s.track FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ? AND s.centre IN $cIn ORDER BY s.centre, s.fullName", array_merge([$today], $cNames));
            break;
        case 'absent-today':
            $rows = db_all("SELECT s.fullName name, s.centre, s.track FROM summer_students s WHERE s.status = 'active' AND s.centre IN $cIn AND s.studentId NOT IN (SELECT studentId FROM attendance WHERE date = ?) ORDER BY s.centre, s.fullName", array_merge($cNames, [$today]));
            break;
        case 'pending-grading':
            $rows = db_all("SELECT sub.memberId name, a.title, sub.submittedAt FROM assignment_submissions sub JOIN assignments a ON a.assignmentId = sub.assignmentId WHERE sub.grade IS NULL ORDER BY sub.submittedAt DESC LIMIT 100");
            break;
        case 'activities':
            $rows = db_all("SELECT title name, category, centre, date, facilitatorName FROM activities WHERE date BETWEEN ? AND ? AND (centre = '' OR centre IN $cIn) ORDER BY date DESC LIMIT 100", array_merge([$from, $to], $cNames));
            break;
        case 'missing-reports':
            foreach ($centres as $c) {
                $has = (int)(db_row('SELECT COUNT(*) c FROM activities WHERE centre = ? AND date = ?', [(string)$c['name'], $today])['c'] ?? 0);
                if (!$has) $rows[] = ['name' => (string)$c['name'], 'note' => 'No activity logged today'];
            }
            break;
        default:
            return ['ok' => false, 'error' => 'unknown_metric'];
    }
    return ['ok' => true, 'metric' => $metric, 'rows' => $rows];
}

/** Log an activity with evidence attachments (Level 4). Requires 'people' or 'content'. */
function analytics_activity_add(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $caps = member_effective_caps($g['requester']);
    if (!array_intersect(['people', 'content', 'summer'], $caps)) return ['ok' => false, 'error' => 'forbidden'];
    $title = trim((string)($p['title'] ?? ''));
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    $centre = trim((string)($p['centre'] ?? ''));
    if (!admin_centre_allowed($g['requester'], $centre === '' ? null : $centre) && $centre !== '') return ['ok' => false, 'error' => 'centre_out_of_scope'];
    $evidence = $p['evidence'] ?? [];
    if (!is_array($evidence)) $evidence = [];
    $clean = [];
    foreach ($evidence as $e) {
        $url = trim((string)($e['url'] ?? '')); if ($url === '') continue;
        $clean[] = ['type' => (string)($e['type'] ?? 'file'), 'url' => $url, 'label' => (string)($e['label'] ?? '')];
    }
    $id = 'ACT-' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 9));
    db_insert('activities', [
        'activityId' => $id, 'title' => $title,
        'category' => (string)($p['category'] ?? 'lesson'), 'centre' => $centre,
        'department' => (string)($p['department'] ?? ''), 'date' => (string)($p['date'] ?? gmdate('Y-m-d')),
        'facilitatorId' => (string)($p['facilitatorId'] ?? ($g['requester']['memberId'] ?? '')),
        'facilitatorName' => (string)($p['facilitatorName'] ?? ($g['requester']['fullName'] ?? '')),
        'notes' => (string)($p['notes'] ?? ''), 'evidence' => json_encode(array_values($clean)),
        'participants' => (int)($p['participants'] ?? 0),
        'createdBy' => (string)($g['requester']['memberId'] ?? ''), 'createdAt' => now_iso(),
    ]);
    audit('activity.add', $g['requester']['memberId'] ?? '', $id, ['title' => $title, 'evidence' => count($clean)]);
    return ['ok' => true, 'activityId' => $id];
}
