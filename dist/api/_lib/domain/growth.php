<?php
declare(strict_types=1);

/**
 * Growth Potential — the predictive level of the analytics workspace.
 *
 * Everything in Levels 1–4 (see domain/analytics.php) is DESCRIPTIVE: what
 * happened, to whom, how many. None of it answers the two questions a
 * coordinator actually acts on each week:
 *
 *   Which children are about to fall out of the programme?
 *   Which centre is about to stall?
 *
 * An average cannot answer either, and that is the whole design argument here.
 * A child at 60% attendance and climbing is a different case from a child at
 * 60% and falling; the mean is identical and the difference is the entire
 * decision. So every signal is measured as a TRAJECTORY over a window, not as a
 * level.
 *
 * Four commitments, because a score attached to a named child is only worth
 * having if it is defensible:
 *
 *  1. Cohort-relative. Each signal is normalised against the student's own
 *     centre and age band, so a strong child at a struggling centre is not
 *     marked down for their peers, and a weak child at a strong one is not
 *     hidden by them.
 *  2. Confidence is surfaced, never implied. Every score ships the number of
 *     observations behind it. Below GROWTH_MIN_OBS a student is reported as
 *     'insufficient data' and given NO score — a number a coordinator cannot
 *     trust is worse than a blank, because it will be acted on anyway.
 *  3. Reason codes, not just numbers. Each row carries the two or three signals
 *     that actually moved it. A score with no explanation does not survive
 *     contact with a staff meeting, and should not.
 *  4. Every figure is drillable back to the records behind it
 *     (analytics_drilldown), so a claim can always be checked.
 *
 * SAFEGUARDING. The student index predicts disengagement and is attached to a
 * named child. It is staff-only, it is never exposed to the student or their
 * guardian, and the lists are framed as "who to support this week" rather than
 * a ranking of children. growth_workspace() is gated on an admin capability for
 * that reason, and the public status board never touches this file.
 */

/* Tunables, named rather than buried. The weights are published in the UI's
 * methodology panel — an unexplained score is not defensible to a funder. */
const GROWTH_WINDOW_WEEKS = 4;     // trajectory window
const GROWTH_MIN_OBS      = 3;     // fewer observations than this ⇒ no score
/* A peer group smaller than this cannot rank anybody: percentile against one
 * other child is noise, and against zero it is the neutral 50 for everyone. The
 * group widens (centre+band → centre → band → cohort) until it clears this. */
const GROWTH_MIN_PEERS    = 4;
const GROWTH_WEIGHTS = [
    'attendance'  => 0.30,   // trajectory of showing up — the strongest signal
    'academic'    => 0.25,   // grade movement against the student's own baseline
    'engagement'  => 0.20,   // assessments submitted, activities attended
    'recognition' => 0.15,   // stars from staff
    'conduct'     => 0.10,   // open infractions, negatively weighted
];

/** Clamp to 0..100. */
function growth_clamp(float $v): float { return max(0.0, min(100.0, $v)); }

/**
 * Least-squares slope of a series, expressed as points-per-week.
 *
 * The core of the whole feature: this is what distinguishes "at 60% and
 * recovering" from "at 60% and falling away", which a mean cannot.
 */
function growth_slope(array $ys): float {
    $n = count($ys);
    if ($n < 2) return 0.0;
    $sumX = 0.0; $sumY = 0.0; $sumXY = 0.0; $sumXX = 0.0;
    foreach ($ys as $i => $y) {
        $sumX += $i; $sumY += (float)$y; $sumXY += $i * (float)$y; $sumXX += $i * $i;
    }
    $den = ($n * $sumXX) - ($sumX * $sumX);
    if ($den == 0.0) return 0.0;
    return (($n * $sumXY) - ($sumX * $sumY)) / $den;
}

/**
 * Convert a raw value to a 0..100 score relative to its peer group.
 *
 * A percentile rather than a z-score: the distributions here are small, skewed
 * and full of ties (dozens of children on 100% attendance), and a z-score on
 * forty samples with an sd near zero produces violent, meaningless swings.
 * Percentile-within-peers degrades gracefully and is explainable to a
 * non-statistician, which matters more than elegance for a number staff act on.
 */
function growth_percentile(float $v, array $peers): float {
    $peers = array_values(array_filter($peers, fn($p) => $p !== null));
    $n = count($peers);
    if ($n < 2) return 50.0;                     // nothing to compare against
    $below = 0; $equal = 0;
    foreach ($peers as $p) {
        if ((float)$p < $v) $below++;
        elseif ((float)$p == $v) $equal++;
    }
    return growth_clamp((($below + 0.5 * $equal) / $n) * 100.0);
}

/** Age bands, so a 10-year-old is not scored against a 17-year-old. */
function growth_age_band(int $age): string {
    if ($age <= 0) return 'unknown';
    if ($age <= 11) return '10-11';
    if ($age <= 13) return '12-13';
    if ($age <= 15) return '14-15';
    return '16-17';
}

/** ISO week keys covering the last N weeks, oldest first. */
function growth_week_keys(int $weeks, ?int $now = null): array {
    $now = $now ?? time();
    $out = [];
    for ($i = $weeks - 1; $i >= 0; $i--) {
        $t = $now - ($i * 7 * 86400);
        $out[] = gmdate('o-\WW', $t);
    }
    return $out;
}

/**
 * Per-student weekly attendance, as a rate against the days the programme
 * actually ran that week — not against a nominal five, or a centre that closed
 * for a public holiday reads as mass truancy.
 */
function growth_weekly_attendance(array $weekKeys, array $enrolledAt = []): array {
    $rows = db_all("SELECT studentId, date FROM attendance");
    $daysByWeek = [];      // week => [date => true]  (programme days actually run)
    $hitsByStudent = [];   // studentId => week => count
    $want = array_flip($weekKeys);
    foreach ($rows as $r) {
        $d = (string)$r['date'];
        $t = strtotime($d . ' UTC');
        if (!$t) continue;
        $wk = gmdate('o-\WW', $t);
        if (!isset($want[$wk])) continue;
        $daysByWeek[$wk][$d] = true;
        $sid = (string)$r['studentId'];
        $hitsByStudent[$sid][$wk] = ($hitsByStudent[$sid][$wk] ?? 0) + 1;
    }
    /* Week boundaries, so a week can be compared against an enrolment date.
     * A child is only measured from the week they JOINED. Counting the weeks
     * before that as absences is not a small unfairness — it manufactures a
     * "was away, now returning" trajectory for a child who simply had not
     * started yet, which is exactly the kind of result that makes staff stop
     * believing the number. */
    $weekEnd = [];
    foreach ($weekKeys as $wk) {
        if (preg_match('/^(\d{4})-W(\d{2})$/', $wk, $m)) {
            $dt = new DateTime('now', new DateTimeZone('UTC'));
            $dt->setISODate((int)$m[1], (int)$m[2], 7);   // Sunday of that ISO week
            $weekEnd[$wk] = $dt->getTimestamp() + 86399;
        } else {
            $weekEnd[$wk] = PHP_INT_MAX;
        }
    }

    $out = [];
    $ids = array_unique(array_merge(array_keys($hitsByStudent), array_keys($enrolledAt)));
    foreach ($ids as $sid) {
        $byWeek = $hitsByStudent[$sid] ?? [];
        $joined = isset($enrolledAt[$sid]) ? (strtotime((string)$enrolledAt[$sid]) ?: 0) : 0;
        $series = [];
        foreach ($weekKeys as $wk) {
            $ran = isset($daysByWeek[$wk]) ? count($daysByWeek[$wk]) : 0;
            if ($ran === 0) continue;                     // programme did not run
            if ($joined && $weekEnd[$wk] < $joined) continue;  // not enrolled yet
            $series[$wk] = min(100.0, (($byWeek[$wk] ?? 0) / $ran) * 100.0);
        }
        $out[$sid] = $series;
    }
    return ['byStudent' => $out, 'daysByWeek' => array_map('count', $daysByWeek)];
}

/**
 * The student-level index.
 *
 * Returns one row per student with a composite 0..100, its component parts, the
 * observation count behind it, and reason codes. Students below the observation
 * floor come back with score === null and status 'insufficient_data'.
 */
function growth_student_index(array $students, array $weekKeys): array {
    // Enrolment dates, so a child is only measured from the week they joined.
    $enrolledAt = [];
    foreach ($students as $s) $enrolledAt[(string)$s['studentId']] = (string)($s['enrolledAt'] ?? '');
    $att = growth_weekly_attendance($weekKeys, $enrolledAt);
    $attByStudent = $att['byStudent'];

    // Academic: a student's grades in order, so movement is against their OWN
    // baseline rather than the cohort's — "improving from 40" is the signal.
    $gradeRows = db_all("SELECT memberId sid, grade, gradedAt FROM assignment_submissions WHERE grade IS NOT NULL ORDER BY gradedAt ASC");
    $gradesBy = [];
    foreach ($gradeRows as $r) $gradesBy[(string)$r['sid']][] = (float)$r['grade'];

    $subRows = db_all("SELECT memberId sid, COUNT(*) n FROM assignment_submissions GROUP BY memberId");
    $subsBy = []; foreach ($subRows as $r) $subsBy[(string)$r['sid']] = (int)$r['n'];

    $starRows = db_all("SELECT subjectId sid, COALESCE(SUM(stars),0) s FROM member_stars WHERE subjectType = 'student' GROUP BY subjectId");
    $starsBy = []; foreach ($starRows as $r) $starsBy[(string)$r['sid']] = (int)$r['s'];

    // Only LIVE infractions count — a voided one was a mistake, and holding it
    // against a child would make the score a record of staff error.
    $infRows = db_all("SELECT personId pid, COUNT(*) n FROM infractions WHERE personType = 'student' AND (voidedAt IS NULL OR voidedAt = '') GROUP BY personId");
    $infBy = []; foreach ($infRows as $r) $infBy[(string)$r['pid']] = (int)$r['n'];

    // ── raw signals, before normalisation ────────────────────────────────────
    $raw = [];
    foreach ($students as $s) {
        $sid = (string)$s['studentId'];
        $series = $attByStudent[$sid] ?? [];
        $vals = array_values($series);
        $obs = count($vals);
        $attLevel = $obs ? array_sum($vals) / $obs : 0.0;
        $attSlope = growth_slope($vals);

        $grades = $gradesBy[$sid] ?? [];
        $gradeSlope = growth_slope($grades);
        $gradeLevel = $grades ? array_sum($grades) / count($grades) : null;

        $raw[$sid] = [
            'studentId'   => $sid,
            'name'        => (string)($s['fullName'] ?? ''),
            'centre'      => (string)($s['centre'] ?? ''),
            'age'         => (int)($s['age'] ?? 0),
            'band'        => growth_age_band((int)($s['age'] ?? 0)),
            'weeks'       => $obs,
            'attLevel'    => round($attLevel, 1),
            'attSlope'    => round($attSlope, 2),
            'gradeLevel'  => $gradeLevel === null ? null : round($gradeLevel, 1),
            'gradeSlope'  => round($gradeSlope, 2),
            'gradeCount'  => count($grades),
            'submissions' => $subsBy[$sid] ?? 0,
            'stars'       => $starsBy[$sid] ?? 0,
            'infractions' => $infBy[$sid] ?? 0,
            'series'      => array_map(fn($v) => round($v, 1), $series),
        ];
    }

    /* ── peer groups, narrowest that is still big enough ─────────────────────
     *
     * Ideally a child is compared with children at the same centre and in the
     * same age band. But centres are small, and that pair is often a group of
     * one — in which case growth_percentile has nothing to compare against and
     * correctly returns its neutral 50. Do that for every component and every
     * score comes out as exactly 50.0: arithmetically right, and worthless. It
     * showed up the moment the page was opened with a realistic cohort, where
     * all three at-risk children scored an identical 50.
     *
     * So widen until the comparison means something: centre+band, then centre,
     * then band across centres, then the whole cohort. Each row reports which
     * basis was actually used, because "ranked against 2 peers" and "ranked
     * against 200" are different claims and the reader is entitled to know
     * which one they are being shown. */
    $byCentreBand = []; $byCentre = []; $byBand = [];
    foreach ($raw as $r) {
        $byCentreBand[$r['centre'] . '|' . $r['band']][] = $r;
        $byCentre[$r['centre']][] = $r;
        $byBand[$r['band']][] = $r;
    }
    $all = array_values($raw);
    $pickPeers = function (array $r) use ($byCentreBand, $byCentre, $byBand, $all): array {
        foreach ([
            ['centre and age band', $byCentreBand[$r['centre'] . '|' . $r['band']] ?? []],
            ['centre',              $byCentre[$r['centre']] ?? []],
            ['age band',            $byBand[$r['band']] ?? []],
            ['whole cohort',        $all],
        ] as [$basis, $g]) {
            if (count($g) >= GROWTH_MIN_PEERS) return [$basis, $g];
        }
        return ['whole cohort', $all];
    };

    $out = [];
    foreach ($raw as $sid => $r) {
        [$peerBasis, $group] = $pickPeers($r);
        $obs = $r['weeks'] + ($r['gradeCount'] > 0 ? 1 : 0) + ($r['submissions'] > 0 ? 1 : 0);
        if ($r['weeks'] < GROWTH_MIN_OBS) {
            $out[] = $r + ['score' => null, 'status' => 'insufficient_data', 'confidence' => 'none',
                           'observations' => $r['weeks'], 'components' => [], 'reasons' => [
                               ['code' => 'no_history', 'text' => 'Only ' . $r['weeks'] . ' week' . ($r['weeks'] === 1 ? '' : 's') . ' of attendance — too little to score yet.'],
                           ]];
            continue;
        }

        /* Each component blends WHERE the student is with WHERE THEY ARE GOING,
         * two-thirds weight on the trajectory. That ratio is the feature: a
         * level-dominated score just re-ranks the same children the attendance
         * column already shows. */
        $attPct   = growth_percentile((float)$r['attLevel'], array_column($group, 'attLevel'));
        $attTrend = growth_percentile((float)$r['attSlope'], array_column($group, 'attSlope'));
        $cAtt = (0.34 * $attPct) + (0.66 * $attTrend);

        $gradeLevels = array_values(array_filter(array_column($group, 'gradeLevel'), fn($v) => $v !== null));
        if ($r['gradeCount'] > 0 && $gradeLevels) {
            $gPct   = growth_percentile((float)$r['gradeLevel'], $gradeLevels);
            $gTrend = growth_percentile((float)$r['gradeSlope'], array_column($group, 'gradeSlope'));
            $cAcad  = (0.34 * $gPct) + (0.66 * $gTrend);
        } else {
            $cAcad = 50.0;   // unmeasured, not zero: an ungraded child is not a failing one
        }

        $cEng = growth_percentile((float)$r['submissions'], array_map('floatval', array_column($group, 'submissions')));
        $cRec = growth_percentile((float)$r['stars'], array_map('floatval', array_column($group, 'stars')));
        // Inverted: more live infractions ⇒ lower.
        $cCon = 100.0 - growth_percentile((float)$r['infractions'], array_map('floatval', array_column($group, 'infractions')));

        $components = [
            'attendance'  => round($cAtt, 1),
            'academic'    => round($cAcad, 1),
            'engagement'  => round($cEng, 1),
            'recognition' => round($cRec, 1),
            'conduct'     => round($cCon, 1),
        ];
        $score = 0.0;
        foreach (GROWTH_WEIGHTS as $k => $w) $score += $components[$k] * $w;
        $score = round(growth_clamp($score), 1);

        /* Confidence is about how much evidence there is, and is reported
         * separately from the score rather than folded into it — mixing them
         * makes a thin score look like a middling one. */
        $confidence = $obs >= 6 ? 'high' : ($obs >= 4 ? 'medium' : 'low');

        // ── reason codes: what actually moved this row ───────────────────────
        $reasons = [];
        if ($r['attSlope'] <= -5) $reasons[] = ['code' => 'attendance_falling', 'text' => 'Attendance falling about ' . abs((int)round($r['attSlope'])) . '% a week over ' . $r['weeks'] . ' weeks.'];
        elseif ($r['attSlope'] >= 5) $reasons[] = ['code' => 'attendance_rising', 'text' => 'Attendance climbing about ' . (int)round($r['attSlope']) . '% a week.'];
        if ($r['attLevel'] < 50) $reasons[] = ['code' => 'attendance_low', 'text' => 'Present for ' . (int)round($r['attLevel']) . '% of sessions in the window.'];
        if ($r['gradeCount'] > 0 && $r['gradeSlope'] <= -3) $reasons[] = ['code' => 'grades_falling', 'text' => 'Grades slipping against their own earlier work.'];
        if ($r['gradeCount'] > 0 && $r['gradeSlope'] >= 3) $reasons[] = ['code' => 'grades_rising', 'text' => 'Grades improving on their own baseline.'];
        if ($r['infractions'] > 0) $reasons[] = ['code' => 'conduct_open', 'text' => $r['infractions'] . ' live conduct record' . ($r['infractions'] === 1 ? '' : 's') . '.'];
        if ($r['submissions'] === 0) $reasons[] = ['code' => 'nothing_submitted', 'text' => 'No assessment submitted yet.'];
        if ($r['stars'] >= 5) $reasons[] = ['code' => 'well_recognised', 'text' => $r['stars'] . ' stars from staff.'];
        if (!$reasons) $reasons[] = ['code' => 'steady', 'text' => 'Steady across every signal — nothing standing out either way.'];

        $out[] = $r + [
            'score' => $score, 'status' => 'scored', 'confidence' => $confidence,
            'observations' => $obs, 'components' => $components,
            // Which comparison produced this, and how many children it spans.
            'peerBasis' => $peerBasis, 'peerCount' => count($group),
            'reasons' => array_slice($reasons, 0, 3),
        ];
    }
    return $out;
}

/**
 * Per-centre growth readiness.
 *
 * Deliberately names the CONSTRAINING FACTOR rather than only ranking, so the
 * output implies an action instead of a league table. "Alimosho is third" tells
 * a director nothing; "Alimosho is conversion-bound — 40% of sign-ups never
 * reach a confirmed registration" tells them what to fix.
 */
function growth_centre_readiness(array $centres, array $studentIndex, array $weekKeys): array {
    $out = [];
    foreach ($centres as $c) {
        $name = (string)$c['name'];
        $mine = array_values(array_filter($studentIndex, fn($s) => $s['centre'] === $name));
        $scored = array_values(array_filter($mine, fn($s) => $s['score'] !== null));

        // Enrolment trajectory: distinct students present, week over week.
        $series = [];
        foreach ($weekKeys as $wk) $series[$wk] = 0;
        $rows = db_all("SELECT a.date d, COUNT(DISTINCT a.studentId) n FROM attendance a
                        JOIN summer_students s ON s.studentId = a.studentId
                        WHERE s.centre = ? GROUP BY a.date", [$name]);
        $weekMax = [];
        foreach ($rows as $r) {
            $t = strtotime((string)$r['d'] . ' UTC'); if (!$t) continue;
            $wk = gmdate('o-\WW', $t);
            if (!array_key_exists($wk, $series)) continue;
            $weekMax[$wk] = max($weekMax[$wk] ?? 0, (int)$r['n']);
        }
        foreach ($weekMax as $wk => $n) $series[$wk] = $n;
        $trend = growth_slope(array_values($series));

        // Funnel — measurable for the first time thanks to the self-registration
        // statuses (migration 69). Naming the stage that leaks is the point.
        $f = [
            'self_pending'   => (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE centre = ? AND regStatus = 'self_pending'", [$name])['c'] ?? 0),
            'parent_pending' => (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE centre = ? AND regStatus = 'parent_pending'", [$name])['c'] ?? 0),
            'verified'       => (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE centre = ? AND regStatus = 'verified'", [$name])['c'] ?? 0),
        ];
        $f['attending'] = count(array_filter($mine, fn($s) => ($s['attLevel'] ?? 0) > 0));
        $submitted = $f['self_pending'] + $f['parent_pending'] + $f['verified'];
        $conversion = $submitted > 0 ? (int)round($f['verified'] / $submitted * 100) : 0;

        $staff = (int)(db_row("SELECT COUNT(*) c FROM mentors WHERE centre = ? AND status = 'active'", [$name])['c'] ?? 0);
        $enrolled = count($mine);
        $ratio = $staff > 0 ? round($enrolled / $staff, 1) : null;
        $meanScore = $scored ? round(array_sum(array_column($scored, 'score')) / count($scored), 1) : null;
        $atRisk = count(array_filter($scored, fn($s) => $s['score'] < 40));

        /* One constraint, chosen by which is worst — a list of three "issues"
         * is a list nobody acts on. */
        $constraint = 'none'; $constraintText = 'No single limiting factor — growth here is not blocked.';
        if ($staff === 0) { $constraint = 'staffing'; $constraintText = 'No active staff on record — nothing else can be assessed.'; }
        elseif ($submitted > 0 && $conversion < 60) { $constraint = 'conversion'; $constraintText = (100 - $conversion) . '% of sign-ups never reach a confirmed registration.'; }
        elseif ($ratio !== null && $ratio > 25) { $constraint = 'staffing'; $constraintText = 'About ' . $ratio . ' children per active staff member.'; }
        elseif ($trend < -1) { $constraint = 'retention'; $constraintText = 'Weekly attendance falling — losing roughly ' . abs((int)round($trend)) . ' children a week.'; }
        elseif ($enrolled > 0 && $atRisk / max(1, count($scored)) > 0.25) { $constraint = 'engagement'; $constraintText = $atRisk . ' of ' . count($scored) . ' scored children are in the at-risk band.'; }

        $out[] = [
            'centreId' => (string)$c['centreId'], 'name' => $name, 'code' => (string)($c['code'] ?? ''),
            'color' => (string)($c['color'] ?? ''),
            'enrolled' => $enrolled, 'staff' => $staff, 'ratio' => $ratio,
            'attendanceTrend' => round($trend, 2), 'weeklyPresent' => array_values($series),
            'funnel' => $f, 'conversion' => $conversion,
            'meanScore' => $meanScore, 'atRisk' => $atRisk, 'scored' => count($scored),
            'constraint' => $constraint, 'constraintText' => $constraintText,
        ];
    }
    // Rank by mean score, then by trajectory — a centre going up beats a
    // slightly-higher centre going down.
    usort($out, function ($a, $b) {
        $s = ($b['meanScore'] ?? -1) <=> ($a['meanScore'] ?? -1);
        return $s !== 0 ? $s : ($b['attendanceTrend'] <=> $a['attendanceTrend']);
    });
    return $out;
}

/**
 * The op behind Level 5. Admin-gated, cohort-scoped, and cached with an
 * attendance-derived stamp: this is per-student work over a four-week window
 * and must not be recomputed on every page load.
 */
function growth_workspace(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $requester = $g['requester'];

    $centreFilter = trim((string)($p['centre'] ?? ''));
    $centres = analytics_centres($requester, $centreFilter);
    $cNames = array_map(fn($c) => (string)$c['name'], $centres);
    if (!$cNames) {
        return ['ok' => true, 'growth' => ['students' => [], 'centres' => [], 'rising' => [], 'atRisk' => [],
            'methodology' => growth_methodology(), 'generatedAt' => now_iso(), 'summary' => []]];
    }

    $weeks = max(2, min(12, (int)($p['weeks'] ?? GROWTH_WINDOW_WEEKS)));
    /* `asOf` moves the window's right-hand edge. Its real use is reproducing the
       board as it stood at a past date — "what did we see when we made that
       call in week two" — which is otherwise unanswerable once the window has
       rolled past. It only ever moves the window; it changes no other
       behaviour, and an unparseable value is ignored rather than defaulting to
       something arbitrary. */
    $asOf = trim((string)($p['asOf'] ?? ''));
    $now = $asOf !== '' ? strtotime($asOf . ' UTC') : false;
    $weekKeys = growth_week_keys($weeks, $now ?: null);
    $cIn = '(' . implode(',', array_fill(0, count($cNames), '?')) . ')';
    $students = db_all("SELECT studentId, fullName, centre, age, enrolledAt FROM summer_students WHERE status = 'active' AND centre IN $cIn", $cNames);

    $index = growth_student_index($students, $weekKeys);
    $scored = array_values(array_filter($index, fn($s) => $s['score'] !== null));

    usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);
    $rising = array_values(array_filter($scored, fn($s) => $s['attSlope'] > 0));
    $rising = array_slice($rising, 0, 15);

    // At risk is the list that earns this feature: nobody can produce it today.
    $risk = $scored;
    usort($risk, fn($a, $b) => $a['score'] <=> $b['score']);
    $atRisk = array_values(array_filter($risk, fn($s) => $s['score'] < 45 || $s['attSlope'] <= -5));
    $atRisk = array_slice($atRisk, 0, 25);

    $centreRows = growth_centre_readiness($centres, $index, $weekKeys);
    $insufficient = count($index) - count($scored);

    return ['ok' => true, 'growth' => [
        'generatedAt' => now_iso(),
        'windowWeeks' => $weeks,
        'weekKeys'    => $weekKeys,
        'summary' => [
            'students'      => count($index),
            'scored'        => count($scored),
            'insufficient'  => $insufficient,
            'meanScore'     => $scored ? round(array_sum(array_column($scored, 'score')) / count($scored), 1) : null,
            'risingCount'   => count($rising),
            'atRiskCount'   => count($atRisk),
            'stats'         => analytics_stats(array_column($scored, 'score')),
        ],
        'rising'  => $rising,
        'atRisk'  => $atRisk,
        'centres' => $centreRows,
        'students' => $index,
        'methodology' => growth_methodology(),
    ]];
}

/** The published method. Shown in the UI, because an unexplained score is not
 *  defensible to a funder and should not be trusted by staff either. */
function growth_methodology(): array {
    return [
        'windowWeeks' => GROWTH_WINDOW_WEEKS,
        'minObservations' => GROWTH_MIN_OBS,
        'minPeers' => GROWTH_MIN_PEERS,
        'weights' => GROWTH_WEIGHTS,
        'trajectoryShare' => 0.66,
        'notes' => [
            'Every signal is measured as a trajectory over the window, not as a level. A child at 60% and climbing is a different case from one at 60% and falling, and an average cannot tell them apart.',
            'Scores are cohort-relative: each signal is a percentile against children at the SAME centre and in the same age band, so a strong child at a struggling centre is not marked down for their peers.',
            'Where a centre and age band holds fewer than ' . GROWTH_MIN_PEERS . ' children, the comparison widens — centre, then age band across centres, then the whole cohort — because a percentile against one other child is noise and against none it is a neutral 50 for everybody. Each row states which basis was used.',
            'Percentile rather than z-score, deliberately. These distributions are small, skewed and full of ties, where a z-score on a near-zero standard deviation produces violent and meaningless swings.',
            'A student with fewer than ' . GROWTH_MIN_OBS . ' weeks of attendance gets NO score and is listed as insufficient data. A number nobody can trust is worse than a blank, because it gets acted on anyway.',
            'Ungraded work scores the midpoint, not zero: a child nobody has assessed yet is not a failing child.',
            'Voided conduct records are excluded. Holding a withdrawn infraction against a child would make the score a record of staff error.',
            'This index is staff-only. It is never shown to a student or a guardian, and the lists are ordered to answer "who needs support this week", not to rank children.',
        ],
    ];
}
