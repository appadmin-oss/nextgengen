<?php
declare(strict_types=1);

/**
 * Analytics — depth: comparison, segmentation, rigour, narrative.
 *
 * Levels 1–4 report bare figures. "65% attendance" with nothing beside it is
 * not an insight, it is a reading — the viewer cannot tell whether it is good,
 * whether it moved, or whether the difference they are looking at is real. That
 * is what made the workspace feel thin, and it is not fixed by adding more bare
 * figures.
 *
 * Four things, and they are the four things a bare number is missing:
 *
 *  1. COMPARISON. Every headline metric carries the previous equal-length
 *     period, the programme average, and the delta — so a figure arrives already
 *     answering "up or down, and against what".
 *  2. SEGMENTATION. Real cross-tabs with margins, so "attendance for girls aged
 *     12–13 at Alimosho" is a cell rather than three separate flat tables the
 *     reader has to join in their head. Plus day-of-week × centre, which is
 *     where operational patterns actually live.
 *  3. RIGOUR. Wilson confidence intervals on every rate and a two-proportion
 *     test between groups. This matters more here than in most products: a
 *     centre with four children will routinely show 45% against another's 85%,
 *     and reporting that as a finding to a funder — or acting on it — is wrong.
 *     Small-n differences are explicitly marked as not yet distinguishable.
 *  4. NARRATIVE. Generated findings, in the style of Level 5's reason codes, so
 *     the page states what it thinks rather than leaving every reader to derive
 *     the same three conclusions independently.
 *
 * Sits beside domain/analytics.php rather than inside it: that file assembles
 * the four descriptive levels and is already the heaviest read in the console.
 * This is fetched separately and cached, so the levels do not pay for it.
 */

/* ── Statistics ───────────────────────────────────────────────────────────────
 * Implemented here rather than pulled in, because PHP ships no erf() without an
 * extension and a youth programme's shared host will not have one. Everything
 * below is standard and deliberately conservative at small n.
 */

/** Normal CDF via Abramowitz & Stegun 7.1.26. Max error ~1.5e-7 — far tighter
 *  than anything that could change a verdict here. */
function an_norm_cdf(float $z): float {
    $sign = $z < 0 ? -1.0 : 1.0;
    $x = abs($z) / sqrt(2.0);
    $t = 1.0 / (1.0 + 0.3275911 * $x);
    $y = 1.0 - ((((1.061405429 * $t - 1.453152027) * $t) + 1.421413741)
        * $t - 0.284496736) * $t * $t * exp(-$x * $x) - 0.254829592 * $t * exp(-$x * $x);
    // The series above is erf(x); fold the sign back in.
    $erf = $sign * $y;
    return 0.5 * (1.0 + $erf);
}

/**
 * Wilson score interval for a proportion.
 *
 * Not the textbook normal approximation, which is genuinely broken at the sizes
 * this programme works with: at n=4 and p=1.0 it produces the interval [1, 1],
 * asserting certainty from four observations. Wilson stays inside [0,1], never
 * collapses to a point, and is the standard recommendation for small samples.
 */
function an_ci(int $successes, int $n, float $z = 1.96): array {
    if ($n <= 0) return ['rate' => null, 'low' => null, 'high' => null, 'n' => 0, 'width' => null];
    $p = $successes / $n;
    $z2 = $z * $z;
    $den = 1.0 + $z2 / $n;
    $centre = ($p + $z2 / (2 * $n)) / $den;
    $half = ($z / $den) * sqrt(($p * (1 - $p) / $n) + ($z2 / (4 * $n * $n)));
    $low = max(0.0, $centre - $half);
    $high = min(1.0, $centre + $half);
    return [
        'rate' => round($p * 100, 1),
        'low' => round($low * 100, 1),
        'high' => round($high * 100, 1),
        'n' => $n,
        // How wide the honest answer is. A 60-point band is a way of saying
        // "we do not know yet", and the UI shows it as exactly that.
        'width' => round(($high - $low) * 100, 1),
    ];
}

/**
 * Two-proportion z-test with a plain-English verdict.
 *
 * The verdict is the point. A p-value in a table gets ignored or misread; "not
 * distinguishable yet at these numbers" is actionable, and stops a coordinator
 * being sent to fix a gap that is noise.
 */
/* A test needs enough CHILDREN, not merely enough child-days.
 *
 * This is the caveat that would otherwise make the whole panel indefensible.
 * The denominator here is child-days, and child-days are not independent
 * observations: a child who comes on Monday is far more likely than chance to
 * come on Tuesday. Three children over twenty days is 60 child-days, and a
 * z-test on 60 will happily return p=0.006 — a confident claim derived from
 * three people. Requiring a real number of distinct children on each side is
 * what stops the arithmetic outrunning the evidence. */
const AN_MIN_CHILDREN = 10;

function an_compare_rates(int $s1, int $n1, int $s2, int $n2, ?int $k1 = null, ?int $k2 = null): array {
    if ($n1 < 1 || $n2 < 1) {
        return ['ok' => false, 'verdict' => 'no_data', 'text' => 'Not enough data to compare.'];
    }
    $p1 = $s1 / $n1; $p2 = $s2 / $n2;
    $diff = ($p1 - $p2) * 100;
    // Clustering guard: too few distinct people, whatever the child-day count.
    if ($k1 !== null && $k2 !== null && ($k1 < AN_MIN_CHILDREN || $k2 < AN_MIN_CHILDREN)) {
        return ['ok' => false, 'verdict' => 'too_few_people', 'diff' => round($diff, 1),
            'n1' => $n1, 'n2' => $n2, 'k1' => $k1, 'k2' => $k2,
            'text' => 'A ' . abs(round($diff)) . '-point gap, but it rests on ' . $k1 . ' and ' . $k2
                    . ' children. Repeat visits by the same few people are not independent evidence, '
                    . 'so this cannot be tested yet. Treat as unknown.'];
    }
    // Below this, no test is worth running — the answer would be "unknown"
    // whatever it returned, and printing a p-value implies otherwise.
    if ($n1 < 10 || $n2 < 10) {
        return ['ok' => false, 'verdict' => 'too_small', 'diff' => round($diff, 1),
            'n1' => $n1, 'n2' => $n2,
            'text' => 'A ' . abs(round($diff)) . '-point gap, but on ' . $n1 . ' and ' . $n2
                    . ' observations it cannot be told apart from chance. Treat as unknown.'];
    }
    $pool = ($s1 + $s2) / ($n1 + $n2);
    $se = sqrt($pool * (1 - $pool) * (1 / $n1 + 1 / $n2));
    if ($se <= 0) {
        return ['ok' => false, 'verdict' => 'degenerate', 'diff' => round($diff, 1),
            'text' => 'Both groups are identical; nothing to test.'];
    }
    $z = ($p1 - $p2) / $se;
    $p = 2 * (1 - an_norm_cdf(abs($z)));
    $sig = $p < 0.05;
    return [
        'ok' => true,
        'diff' => round($diff, 1),
        'z' => round($z, 2),
        'p' => round($p, 4),
        'significant' => $sig,
        'n1' => $n1, 'n2' => $n2,
        'verdict' => $sig ? 'significant' : 'not_significant',
        'text' => $sig
            ? 'A ' . abs(round($diff)) . '-point gap that is unlikely to be chance (p=' . round($p, 3) . ').'
            : 'A ' . abs(round($diff)) . '-point gap, but not distinguishable from chance yet (p=' . round($p, 2) . ').',
    ];
}

/** Delta against a benchmark, with direction. Percentage POINTS for rates. */
function an_delta(?float $now, ?float $ref): array {
    if ($now === null || $ref === null) return ['delta' => null, 'dir' => 'flat', 'pct' => null];
    $d = $now - $ref;
    return [
        'delta' => round($d, 1),
        'dir' => $d > 0.5 ? 'up' : ($d < -0.5 ? 'down' : 'flat'),
        'pct' => $ref != 0.0 ? round(($d / abs($ref)) * 100, 1) : null,
    ];
}

/* ── Period arithmetic ───────────────────────────────────────────────────── */

/** The equal-length window immediately before [$from,$to]. */
function an_previous_period(string $from, string $to): array {
    $f = strtotime($from . ' UTC'); $t = strtotime($to . ' UTC');
    if (!$f || !$t || $t < $f) return ['from' => $from, 'to' => $to];
    $len = $t - $f + 86400;
    return ['from' => gmdate('Y-m-d', $f - $len), 'to' => gmdate('Y-m-d', $f - 86400)];
}

/* ── The measurable unit ─────────────────────────────────────────────────────
 * Attendance is (present days) / (opportunities), where an opportunity is a
 * programme day the child was enrolled for. Everything below shares this, so a
 * rate in one panel means the same thing as a rate in another — which is not
 * true of the existing levels, where one panel divides by school days and
 * another by enrolled headcount.
 */
function an_attendance_units(string $from, string $to, array $centres): array {
    $days = db_all("SELECT DISTINCT date FROM attendance WHERE date BETWEEN ? AND ? ORDER BY date", [$from, $to]);
    $dayList = array_map(fn($r) => (string)$r['date'], $days);
    if (!$dayList) return ['days' => [], 'students' => [], 'present' => []];

    $cIn = $centres ? '(' . implode(',', array_fill(0, count($centres), '?')) . ')' : '';
    $sql = "SELECT studentId, fullName, centre, age, gender, track, enrolledAt
            FROM summer_students WHERE status = 'active'" . ($centres ? " AND centre IN $cIn" : '');
    $students = db_all($sql, $centres);

    $presentRows = db_all("SELECT studentId, date FROM attendance WHERE date BETWEEN ? AND ?", [$from, $to]);
    $present = [];
    foreach ($presentRows as $r) $present[(string)$r['studentId']][(string)$r['date']] = true;

    return ['days' => $dayList, 'students' => $students, 'present' => $present];
}

/** Present-days and opportunity-days for one student over a day list. */
function an_student_units(array $s, array $dayList, array $present): array {
    $jt = strtotime((string)($s['enrolledAt'] ?? '')) ?: 0;
    /* Compared as DATES, not timestamps.
     *
     * Only days the child could actually have attended count — charging them for
     * days before they joined drags every new joiner's rate down and makes intake
     * look like absenteeism. But the obvious timestamp comparison excludes the
     * enrolment day itself whenever a child registers in the afternoon and is
     * marked present the same day: midnight of the attendance date is earlier
     * than a 14:00 enrolment. A 24-hour slack was the first attempt at that and
     * was worse — it let the day BEFORE enrolment back in. Comparing calendar
     * dates handles both without a fudge factor. */
    $joinDay = $jt ? gmdate('Y-m-d', $jt) : '';
    $sid = (string)$s['studentId'];
    $opp = 0; $hit = 0;
    foreach ($dayList as $d) {
        if ($joinDay !== '' && strcmp($d, $joinDay) < 0) continue;
        $opp++;
        if (isset($present[$sid][$d])) $hit++;
    }
    return [$hit, $opp];
}

/* ── Segmentation ────────────────────────────────────────────────────────────
 * A real cross-tab with margins. Gender and age currently live in two separate
 * flat tables, which cannot answer any question that involves both.
 */

function an_age_band(int $age): string {
    if ($age <= 0) return 'Unknown';
    if ($age <= 11) return '10–11';
    if ($age <= 13) return '12–13';
    if ($age <= 15) return '14–15';
    return '16–17';
}

function an_dim_value(array $s, string $dim): string {
    switch ($dim) {
        case 'gender': $g = strtoupper(trim((string)($s['gender'] ?? '')));
            return $g === 'M' ? 'Male' : ($g === 'F' ? 'Female' : 'Not recorded');
        case 'age':    return an_age_band((int)($s['age'] ?? 0));
        case 'track':  return trim((string)($s['track'] ?? '')) ?: 'Unassigned';
        case 'centre': return trim((string)($s['centre'] ?? '')) ?: 'Unassigned';
    }
    return 'All';
}

/**
 * Cross-tab of attendance rate by two dimensions, with row/column margins and a
 * confidence interval per cell. Cells are marked thin when the interval is too
 * wide to read anything into, which is most cells at this programme's size —
 * saying so is the honest presentation, and it is what stops a 100% cell from
 * three observations being read as a success story.
 */
function an_crosstab(array $units, string $rowDim, string $colDim): array {
    $cells = [];   // row => col => [hit, opp, students]
    $rows = []; $cols = [];
    foreach ($units['students'] as $s) {
        [$hit, $opp] = an_student_units($s, $units['days'], $units['present']);
        if ($opp === 0) continue;
        $r = an_dim_value($s, $rowDim);
        $c = an_dim_value($s, $colDim);
        $rows[$r] = true; $cols[$c] = true;
        $cells[$r][$c] = $cells[$r][$c] ?? [0, 0, 0];
        $cells[$r][$c][0] += $hit;
        $cells[$r][$c][1] += $opp;
        $cells[$r][$c][2] += 1;
    }
    $rowKeys = array_keys($rows); sort($rowKeys);
    $colKeys = array_keys($cols); sort($colKeys);

    $out = ['rowDim' => $rowDim, 'colDim' => $colDim, 'rows' => [], 'cols' => $colKeys];
    $colTot = []; $grandHit = 0; $grandOpp = 0; $grandN = 0;
    foreach ($rowKeys as $r) {
        $rowOut = ['label' => $r, 'cells' => [], 'total' => null];
        $rHit = 0; $rOpp = 0; $rN = 0;
        foreach ($colKeys as $c) {
            $cell = $cells[$r][$c] ?? null;
            if (!$cell) { $rowOut['cells'][] = null; continue; }
            [$h, $o, $n] = $cell;
            $ci = an_ci($h, $o);
            $rowOut['cells'][] = $ci + ['students' => $n,
                // A band wider than 25 points cannot support a comparison.
                'thin' => ($ci['width'] ?? 100) > 25];
            $rHit += $h; $rOpp += $o; $rN += $n;
            $colTot[$c] = $colTot[$c] ?? [0, 0, 0];
            $colTot[$c][0] += $h; $colTot[$c][1] += $o; $colTot[$c][2] += $n;
        }
        $rowOut['total'] = an_ci($rHit, $rOpp) + ['students' => $rN,
            'thin' => (an_ci($rHit, $rOpp)['width'] ?? 100) > 25];
        $out['rows'][] = $rowOut;
        $grandHit += $rHit; $grandOpp += $rOpp; $grandN += $rN;
    }
    $out['colTotals'] = [];
    foreach ($colKeys as $c) {
        $t = $colTot[$c] ?? [0, 0, 0];
        $out['colTotals'][] = an_ci($t[0], $t[1]) + ['students' => $t[2], 'label' => $c];
    }
    $out['grand'] = an_ci($grandHit, $grandOpp) + ['students' => $grandN];
    return $out;
}

/**
 * Attendance by weekday × centre.
 *
 * The most actionable panel in the whole workspace and the one nothing showed:
 * a centre that is fine on Saturday and empty on Wednesday has a timetable
 * problem, not an engagement problem, and no aggregate rate can distinguish the
 * two.
 */
function an_weekday_matrix(string $from, string $to, array $centres): array {
    $units = an_attendance_units($from, $to, $centres);
    if (!$units['days']) return ['days' => [], 'centres' => []];
    $byDow = [];   // centre => dow => [hit, opp]
    $names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    foreach ($units['students'] as $s) {
        $centre = trim((string)($s['centre'] ?? '')) ?: 'Unassigned';
        $jt = strtotime((string)($s['enrolledAt'] ?? '')) ?: 0;
        $joinDay = $jt ? gmdate('Y-m-d', $jt) : '';     // same date rule as an_student_units
        $sid = (string)$s['studentId'];
        foreach ($units['days'] as $d) {
            if ($joinDay !== '' && strcmp($d, $joinDay) < 0) continue;
            $t = strtotime($d . ' UTC') ?: 0;
            $dow = (int)gmdate('N', $t) - 1;            // 0=Mon
            $byDow[$centre][$dow] = $byDow[$centre][$dow] ?? [0, 0, []];
            $byDow[$centre][$dow][1]++;
            $byDow[$centre][$dow][2][$sid] = true;   // distinct children, for the clustering guard
            if (isset($units['present'][$sid][$d])) $byDow[$centre][$dow][0]++;
        }
    }
    // Only weekdays the programme actually ran, or the grid is mostly blanks.
    $ranDow = [];
    foreach ($units['days'] as $d) { $t = strtotime($d . ' UTC') ?: 0; $ranDow[(int)gmdate('N', $t) - 1] = true; }
    $dows = array_keys($ranDow); sort($dows);

    $out = ['days' => array_map(fn($i) => $names[$i], $dows), 'centres' => []];
    foreach ($byDow as $centre => $m) {
        $row = ['centre' => $centre, 'cells' => []];
        foreach ($dows as $i) {
            $c = $m[$i] ?? null;
            $row['cells'][] = $c && $c[1] > 0
                ? an_ci($c[0], $c[1]) + ['children' => count($c[2]), 'hit' => $c[0], 'opp' => $c[1]]
                : null;
        }
        $out['centres'][] = $row;
    }
    usort($out['centres'], fn($a, $b) => strcmp($a['centre'], $b['centre']));
    return $out;
}

/**
 * Retention by week since a child's own enrolment.
 *
 * Grouped by intake week, so "are we keeping the children we recruit" is
 * answerable — which a headcount trend cannot answer, because recruitment and
 * retention move it in the same direction.
 */
function an_retention(array $centres, int $maxWeeks = 8): array {
    $cIn = $centres ? '(' . implode(',', array_fill(0, count($centres), '?')) . ')' : '';
    $students = db_all("SELECT studentId, enrolledAt, centre FROM summer_students
        WHERE status = 'active' AND enrolledAt != ''" . ($centres ? " AND centre IN $cIn" : ''), $centres);
    if (!$students) return ['cohorts' => [], 'maxWeeks' => $maxWeeks];

    $att = db_all("SELECT studentId, date FROM attendance");
    $seen = [];
    $firstAtt = PHP_INT_MAX;
    foreach ($att as $r) {
        $t = strtotime((string)$r['date'] . ' UTC') ?: 0;
        $seen[(string)$r['studentId']][] = $t;
        if ($t && $t < $firstAtt) $firstAtt = $t;
    }
    /* Where the record begins. A cohort that enrolled before the first
     * attendance row has weeks that are UNOBSERVED, not empty — and reporting
     * those as 0% retention says "nobody came" when the truth is "we were not
     * recording yet". That produced a curve rising from 0% to 100%, which is
     * not a retention curve at all and would have been read as either a
     * miracle or a bug. Unobserved weeks are omitted. */
    if ($firstAtt === PHP_INT_MAX) $firstAtt = 0;

    $cohorts = [];   // intake week => [studentId => joinedTs]
    foreach ($students as $s) {
        $j = strtotime((string)$s['enrolledAt']) ?: 0;
        if (!$j) continue;
        $cohorts[gmdate('o-\WW', $j)][(string)$s['studentId']] = $j;
    }
    ksort($cohorts);
    $out = [];
    foreach ($cohorts as $wk => $members) {
        $size = count($members);
        if ($size === 0) continue;
        $curve = []; $unobserved = 0;
        for ($k = 0; $k < $maxWeeks; $k++) {
            $still = 0; $eligible = 0; $blind = 0;
            foreach ($members as $sid => $j) {
                $wStart = $j + $k * 7 * 86400;
                $wEnd = $wStart + 7 * 86400;
                // Only count a week that has actually happened for this child.
                if ($wStart > time()) continue;
                // …and one the register was actually being kept for.
                if ($wEnd <= $firstAtt) { $blind++; continue; }
                $eligible++;
                foreach ($seen[$sid] ?? [] as $t) {
                    if ($t >= $wStart && $t < $wEnd) { $still++; break; }
                }
            }
            if ($eligible === 0) {
                // Entirely before the record starts: skip, do not report 0%.
                if ($blind > 0) { $unobserved++; continue; }
                break;
            }
            $curve[] = an_ci($still, $eligible) + ['week' => $k, 'students' => $eligible];
        }
        if ($curve) $out[] = ['cohort' => $wk, 'size' => $size, 'curve' => $curve,
            // Said out loud, so a short curve is not mistaken for a short cohort.
            'unobservedWeeks' => $unobserved,
            'firstWeekShown' => $curve[0]['week'] ?? 0];
    }
    return ['cohorts' => $out, 'maxWeeks' => $maxWeeks];
}

/* ── Narrative ───────────────────────────────────────────────────────────────
 * What the page thinks, stated. Every finding carries the figures behind it and
 * a severity, so the reader can check it rather than take it on trust.
 */
/** "a, b and c" — so a sentence listing checks reads like one. */
function an_join(array $parts): string {
    $n = count($parts);
    if ($n === 0) return '';
    if ($n === 1) return $parts[0];
    return implode(', ', array_slice($parts, 0, -1)) . ' and ' . $parts[$n - 1];
}

function an_findings(array $ctx): array {
    $f = [];
    $now = $ctx['now'] ?? null; $prev = $ctx['prev'] ?? null;

    /* Which checks were ABLE to run, so the empty state can tell "we looked and
     * found nothing" apart from "at this size nothing could be looked at". They
     * read identically to a coordinator and mean opposite things. */
    $ran = ['period' => false, 'weekday' => false, 'retention' => false];

    if ($now && $prev && $now['n'] > 0 && $prev['n'] > 0) {
        $cmp = an_compare_rates((int)$now['hit'], (int)$now['opp'], (int)$prev['hit'], (int)$prev['opp'],
                                (int)$now['n'], (int)$prev['n']);
        if (($cmp['verdict'] ?? '') !== 'too_few_people') $ran['period'] = true;
        if (($cmp['verdict'] ?? '') === 'significant') {
            $dir = $cmp['diff'] > 0 ? 'up' : 'down';
            $f[] = ['severity' => $cmp['diff'] > 0 ? 'good' : 'bad', 'code' => 'period_move',
                'title' => 'Attendance is ' . $dir . ' ' . abs(round($cmp['diff'])) . ' points on the previous period',
                'detail' => $cmp['text'] . ' Measured on the same number of days either side.'];
        } elseif (($cmp['verdict'] ?? '') === 'not_significant') {
            $f[] = ['severity' => 'info', 'code' => 'period_flat',
                'title' => 'Attendance is level against the previous period',
                'detail' => $cmp['text']];
        }
    }

    // Weekday pattern — a timetable problem masquerading as an engagement one.
    /* A weekday gap is only worth reporting if it survives a test. The first
       version fired on any 25-point raw gap, which at this size meant all three
       centres reported the same "finding" — the tell that it was noise. */
    $wd = $ctx['weekday'] ?? null;
    if ($wd && count($wd['days']) >= 2) {
        foreach ($wd['centres'] as $row) {
            $vals = array_values(array_filter($row['cells'], fn($c) => $c));
            if (count($vals) < 2) continue;
            usort($vals, fn($a, $b) => $a['rate'] <=> $b['rate']);
            $lo = $vals[0]; $hi = $vals[count($vals) - 1];
            $t = an_compare_rates((int)$hi['hit'], (int)$hi['opp'], (int)$lo['hit'], (int)$lo['opp'],
                                  (int)($hi['children'] ?? 0), (int)($lo['children'] ?? 0));
            if (($t['verdict'] ?? '') !== 'too_few_people') $ran['weekday'] = true;
            if (empty($t['significant'])) continue;
            $i = array_search($lo, $row['cells'], true);
            $j = array_search($hi, $row['cells'], true);
            $f[] = ['severity' => 'warn', 'code' => 'weekday_gap',
                'title' => $row['centre'] . ' has a weekday problem, not an attendance problem',
                'detail' => ($wd['days'][$j] ?? '?') . ' runs at ' . $hi['rate'] . '% but '
                    . ($wd['days'][$i] ?? '?') . ' only reaches ' . $lo['rate'] . '%. ' . $t['text']
                    . ' A gap that survives a test is usually timetable or transport rather than engagement.'];
        }
    }

    // Retention cliff — where a cohort actually loses people.
    foreach (($ctx['retention']['cohorts'] ?? []) as $c) {
        $curve = $c['curve'];
        for ($k = 1; $k < count($curve); $k++) {
            $drop = $curve[$k - 1]['rate'] - $curve[$k]['rate'];
            // A five-child floor: below it a single child leaving is a 20+ point
            // "cliff", and reporting that as one would be noise dressed as a finding.
            if ($curve[$k]['n'] >= 5) $ran['retention'] = true;
            if ($drop >= 30 && $curve[$k]['n'] >= 5) {
                $f[] = ['severity' => 'bad', 'code' => 'retention_cliff',
                    'title' => 'The ' . $c['cohort'] . ' intake drops sharply in week ' . $k,
                    'detail' => 'Retention falls from ' . $curve[$k - 1]['rate'] . '% to ' . $curve[$k]['rate']
                        . '% between week ' . ($k - 1) . ' and week ' . $k . ' on ' . $curve[$k]['n']
                        . ' children. Whatever happens at that point is where the programme loses people.'];
                break;
            }
        }
    }

    /* How much of this is even readable yet. Stated as a finding rather than
     * buried, because "we cannot tell" is the single most useful thing to know
     * about a small cohort, and every panel above will otherwise be over-read. */
    $thin = 0; $total = 0;
    foreach (($ctx['crosstab']['rows'] ?? []) as $r) {
        foreach ($r['cells'] as $c) { if ($c) { $total++; if (!empty($c['thin'])) $thin++; } }
    }
    if ($total > 0 && $thin / $total > 0.5) {
        $f[] = ['severity' => 'info', 'code' => 'underpowered',
            'title' => 'Most segments are still too small to compare',
            'detail' => $thin . ' of ' . $total . ' cells have a confidence interval wider than 25 points. '
                . 'The totals are sound; the individual cells are not yet evidence, and are marked so.'];
    }
    /* The empty state, and it must not overclaim.
     *
     * "No retention cliff" is a positive statement about the data. When the
     * retention check could not run — every intake below the five-child floor,
     * where one child leaving reads as a 30-point drop — the screen was making
     * that claim anyway, sitting directly above a table visibly going 100% →
     * 67% → 0%. A coordinator reading "no cliff" next to that either stops
     * trusting the panel or, worse, believes it.
     *
     * So the fallback names only the checks that actually ran, and says plainly
     * which ones could not. */
    if (!$f) {
        $did = []; $couldNot = [];
        foreach ([['period', 'a move against the previous period'],
                  ['weekday', 'a weekday gap'],
                  ['retention', 'a retention cliff']] as [$k, $label]) {
            if ($ran[$k]) $did[] = $label; else $couldNot[] = $label;
        }
        if (!$did) {
            $f[] = ['severity' => 'info', 'code' => 'nothing_testable',
                'title' => 'Not enough data yet to say anything',
                'detail' => 'None of the checks could run at this size — not ' . an_join($couldNot)
                    . '. The tables above are what happened; they are not yet evidence of a pattern.'];
        } else {
            $f[] = ['severity' => 'info', 'code' => 'nothing_notable',
                'title' => 'Nothing stands out in this period',
                'detail' => 'No ' . an_join($did) . '.'
                    . ($couldNot ? ' ' . ucfirst(an_join($couldNot)) . ' could not be tested at this size — that is not the same as none being there.' : '')];
        }
    }
    return $f;
}

/* ── The op ──────────────────────────────────────────────────────────────── */

function analytics_depth(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $requester = $g['requester'];

    $centreFilter = trim((string)($p['centre'] ?? ''));
    $centres = analytics_centres($requester, $centreFilter);
    $cNames = array_map(fn($c) => (string)$c['name'], $centres);
    $range = analytics_range($p);
    [$from, $to] = [$range['from'], $range['to']];

    if (!$cNames) {
        return ['ok' => true, 'depth' => ['empty' => true, 'findings' => [], 'generatedAt' => now_iso()]];
    }

    // Current and previous equal-length windows, on the shared unit.
    $unitsNow = an_attendance_units($from, $to, $cNames);
    $prevR = an_previous_period($from, $to);
    $unitsPrev = an_attendance_units($prevR['from'], $prevR['to'], $cNames);

    $tot = function (array $u): array {
        $hit = 0; $opp = 0; $n = 0;
        foreach ($u['students'] as $s) {
            [$h, $o] = an_student_units($s, $u['days'], $u['present']);
            if ($o === 0) continue;
            $hit += $h; $opp += $o; $n++;
        }
        return ['hit' => $hit, 'opp' => $opp, 'n' => $n] + an_ci($hit, $opp);
    };
    $now = $tot($unitsNow);
    $prev = $tot($unitsPrev);

    $rowDim = in_array((string)($p['rowDim'] ?? ''), ['gender', 'age', 'track', 'centre'], true) ? (string)$p['rowDim'] : 'age';
    $colDim = in_array((string)($p['colDim'] ?? ''), ['gender', 'age', 'track', 'centre'], true) ? (string)$p['colDim'] : 'gender';
    if ($rowDim === $colDim) $colDim = $rowDim === 'gender' ? 'age' : 'gender';

    $crosstab = an_crosstab($unitsNow, $rowDim, $colDim);
    $weekday = an_weekday_matrix($from, $to, $cNames);
    $retention = an_retention($cNames);

    /* Per-centre, each against the programme as a whole and tested rather than
     * merely ranked — the existing centre table invites exactly the comparison
     * it gives the reader no way to evaluate. */
    $perCentre = [];
    foreach ($cNames as $name) {
        $u = an_attendance_units($from, $to, [$name]);
        $t = $tot($u);
        if ($t['opp'] === 0) continue;
        $restHit = $now['hit'] - $t['hit'];
        $restOpp = $now['opp'] - $t['opp'];
        $perCentre[] = [
            'centre' => $name,
            'ci' => an_ci($t['hit'], $t['opp']),
            'students' => $t['n'],
            'vsProgramme' => an_delta($t['rate'] ?? null, $now['rate'] ?? null),
            // Child counts passed so a 3-child centre cannot produce a p-value.
            'test' => $restOpp > 0
                ? an_compare_rates($t['hit'], $t['opp'], $restHit, $restOpp, $t['n'], max(0, $now['n'] - $t['n']))
                : ['ok' => false, 'verdict' => 'no_data'],
        ];
    }
    usort($perCentre, fn($a, $b) => ($b['ci']['rate'] ?? -1) <=> ($a['ci']['rate'] ?? -1));

    $findings = an_findings([
        'now' => $now, 'prev' => $prev, 'weekday' => $weekday,
        'retention' => $retention, 'crosstab' => $crosstab,
    ]);

    return ['ok' => true, 'depth' => [
        'generatedAt' => now_iso(),
        'range' => ['from' => $from, 'to' => $to, 'label' => $range['label'],
                    'days' => count($unitsNow['days'])],
        'previous' => ['from' => $prevR['from'], 'to' => $prevR['to'], 'days' => count($unitsPrev['days'])],
        'headline' => [
            'attendance' => $now,
            'previous' => $prev,
            'delta' => an_delta($now['rate'] ?? null, $prev['rate'] ?? null),
            'test' => an_compare_rates((int)$now['hit'], (int)$now['opp'], (int)$prev['hit'], (int)$prev['opp'],
                                       (int)$now['n'], (int)$prev['n']),
        ],
        'perCentre' => $perCentre,
        'crosstab' => $crosstab,
        'dims' => ['gender' => 'Gender', 'age' => 'Age band', 'track' => 'Track', 'centre' => 'Centre'],
        'weekday' => $weekday,
        'retention' => $retention,
        'findings' => $findings,
        'method' => [
            'unit' => 'Every rate is present-days divided by opportunity-days — programme days the child was actually enrolled for. One definition across every panel, so a rate here means the same as a rate there.',
            'ci' => 'Wilson score intervals at 95%. Chosen over the normal approximation because at n=4 and p=1.0 that method returns [100%, 100%] — certainty from four observations.',
            'test' => 'Two-proportion z-test, and only above 10 observations AND ' . AN_MIN_CHILDREN . ' distinct children per side. Below either, the honest answer is "unknown" and a p-value would imply otherwise.',
            'clustering' => 'The denominator is child-days, and child-days are not independent — a child who comes on Monday is far more likely than chance to come on Tuesday. That makes every interval here somewhat narrower than the truth, so tests additionally require a real number of distinct children: three children over twenty days is 60 child-days, and a z-test on 60 would return a confident p-value derived from three people.',
            'thin' => 'A cell whose interval is wider than 25 points is marked thin: readable as a total, not as evidence on its own.',
        ],
    ]];
}
