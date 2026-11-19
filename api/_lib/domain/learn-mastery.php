<?php
declare(strict_types=1);

/**
 * Learn — mastery, from Starter to God (owner, 7 Nov 2026: "Make it dynamic and create Gods", after the
 * Maths Lab's Gods of Maths). Six tiers per course, each EARNED from things already recorded — lessons
 * completed, session exams passed from memory, and finally the Trial — never from time spent or clicks:
 *
 *   1 Starter       a lesson begun
 *   2 Apprentice    a quarter of the course's lessons completed
 *   3 Practitioner  half completed, and two session exams passed
 *   4 Expert        three quarters completed, session exams averaging at least Merit (70%)
 *   5 Master        every lesson completed, and session exams averaging at least a Pass
 *   6 God           a Master who passed the course Trial (learn-exam.php) at LX_TRIAL_PASS, with every
 *                   follow-up on their own answers holding up — the course's highest distinction
 *
 * Certificates are issued by lx_award() the moment one is earned (documents.php, doc_club_issue): a course
 * level completed, and God of the course. A promotion certificate is issued when an instructor moves a
 * learner up a programme year (curriculum.php, staff_curriculum_year).
 */

const LX_TIERS = [1 => 'Starter', 2 => 'Apprentice', 3 => 'Practitioner', 4 => 'Expert', 5 => 'Master', 6 => 'God'];

/** Where a member stands in one course: the tier, the numbers behind it, and what the next one asks. */
function lx_mastery(array $m, array $units, string $course): ?array {
    $mine = array_filter($units, static fn($b) => mb_strtolower((string)$b['unit']['course']) === mb_strtolower($course));
    if (!$mine) return null;
    $ids = array_map('strval', array_keys($mine));
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $done = 0; $begun = 0;
    foreach (db_all("SELECT status FROM curriculum_progress WHERE memberId = ? AND unitId IN ($ph)", array_merge([(string)$m['memberId']], $ids)) as $r) {
        $begun++; if ((string)$r['status'] === 'completed') $done++;
    }
    $total = count($mine);
    $ex = db_all("SELECT pct, band FROM curriculum_sittings WHERE memberId = ? AND kind = 'session' AND status = 'marked' AND unitId IN ($ph)", array_merge([(string)$m['memberId']], $ids));
    $passed = count(array_filter($ex, static fn($r) => (string)$r['band'] !== 'Not yet'));
    $avg = $ex ? (int)round(array_sum(array_column($ex, 'pct')) / count($ex)) : 0;
    $trial = db_row("SELECT pct, band, status, submittedAt, viva FROM curriculum_sittings WHERE memberId = ? AND kind = 'trial' AND course = ? AND status = 'marked' ORDER BY pct DESC LIMIT 1", [(string)$m['memberId'], $course]);
    $trialOk = $trial && (int)$trial['pct'] >= LX_TRIAL_PASS;
    $share = $total ? $done / $total : 0;
    $tier = 0;
    if ($begun > 0) $tier = 1;
    if ($share >= .25) $tier = 2;
    if ($share >= .5 && $passed >= 2) $tier = 3;
    if ($share >= .75 && $ex && $avg >= LX_BAND_MERIT) $tier = 4;
    if ($done === $total && (!$ex || $avg >= 50)) $tier = 5;
    if ($tier === 5 && $trialOk) $tier = 6;
    $next = match ($tier) {
        0 => 'Open your first lesson.',
        1 => 'Complete ' . max(1, (int)ceil($total * .25) - $done) . ' more lesson(s) to become an Apprentice.',
        2 => 'Reach half the course (' . (int)ceil($total * .5) . ' lessons) and pass ' . max(0, 2 - $passed) . ' more session exam(s) to become a Practitioner.',
        3 => 'Reach three quarters of the course and average Merit (' . LX_BAND_MERIT . '%) in your session exams to become an Expert.',
        4 => 'Complete every lesson to become a Master.',
        5 => 'Sit the Trial: questions from across the whole course, with follow-ups on your own answers. ' . LX_TRIAL_PASS . '% makes you a God of ' . $course . '.',
        default => 'You are a God of ' . $course . '. Teach somebody else.',
    };
    $level = (string)(reset($mine)['unit']['level'] ?? '');
    return ['course' => $course, 'level' => $level, 'tier' => $tier, 'tierName' => LX_TIERS[$tier] ?? 'Not started', 'next' => $next,
            'lessons' => $total, 'completed' => $done, 'exams' => count($ex), 'examsPassed' => $passed, 'examAvg' => $avg,
            'trialPct' => $trial ? (int)$trial['pct'] : null, 'titles' => array_values(array_map(static fn($b) => (string)$b['unit']['title'], $mine))];
}

/** Issue whatever has been earned in a course: the level certificate, God of the course. Never twice. */
function lx_award(array $m, string $course): array {
    if ($course === '' || !function_exists('doc_club_issue')) return [];
    $units = curriculum_member_units($m);
    $st = lx_mastery($m, $units, $course);
    if (!$st) return [];
    $out = [];
    $facts = ['lessons' => $st['lessons'], 'avgExam' => $st['examAvg'], 'band' => $st['exams'] ? lx_band($st['examAvg'], 50) : '',
              'tier' => $st['tierName'], 'pattern' => array_slice($st['titles'], 0, 40), 'trialPct' => $st['trialPct']];
    if ($st['completed'] === $st['lessons'] && $st['lessons'] > 0) {
        $r = doc_club_issue((string)$m['memberId'], 'level', $course, $st['level'], $facts);
        if ($r && $r[1]) $out[] = ['scope' => 'level', 'no' => (string)$r[0]['docNo'], 'url' => doc_view_url($r[0]), 'title' => doc_club_title(doc_data($r[0]))];
    }
    if ($st['tier'] === 6) {
        $r = doc_club_issue((string)$m['memberId'], 'god', $course, '', $facts);
        if ($r && $r[1]) $out[] = ['scope' => 'god', 'no' => (string)$r[0]['docNo'], 'url' => doc_view_url($r[0]), 'title' => doc_club_title(doc_data($r[0]))];
    }
    foreach ($out as $c) if (function_exists('event_emit')) event_emit('learn.certificate', ['memberId' => (string)$m['memberId'], 'course' => $course, 'scope' => $c['scope'], 'no' => $c['no']]);
    return $out;
}

/**
 * member.learn.mastery — every course of theirs, with its tier, what the next asks, the Trial's state and
 * the certificates earned; and every Club certificate they hold, newest first.
 */
function member_learn_mastery(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $courses = [];
    foreach ($units as $b) { $c = (string)$b['unit']['course']; if ($c !== '') $courses[mb_strtolower($c)] = $c; }
    $list = [];
    foreach ($courses as $c) {
        $st = lx_mastery($m, $units, $c); if (!$st) continue;
        lx_award($m, $c);   // a course completed before certificates existed gets its certificate on first look
        $last = db_row("SELECT status, submittedAt, pct FROM curriculum_sittings WHERE memberId = ? AND kind = 'trial' AND course = ? ORDER BY id DESC LIMIT 1", [(string)$m['memberId'], $c]);
        $wait = $last && (string)$last['status'] !== 'open' ? max(0, (int)ceil((strtotime((string)$last['submittedAt']) + LX_TRIAL_COOLDOWN_DAYS * 86400 - time()) / 86400)) : 0;
        unset($st['titles']);
        $list[] = $st + ['trial' => ['open' => $st['tier'] >= 5 && $st['tier'] < 6 && $wait === 0, 'inProgress' => $last && (string)$last['status'] === 'open',
                                     'waitDays' => $st['tier'] === 5 ? $wait : 0, 'lastPct' => $last ? (int)$last['pct'] : null]];
    }
    usort($list, static fn($a, $b) => $b['tier'] <=> $a['tier'] ?: strcmp($a['course'], $b['course']));
    $certs = [];
    foreach (db_all("SELECT * FROM documents WHERE kind = 'certificate' AND memberId = ? ORDER BY id DESC LIMIT 60", [(string)$m['memberId']]) as $d) {
        $x = doc_data($d); if (($x['program'] ?? '') !== 'club') continue;
        $certs[] = ['no' => (string)$d['docNo'], 'scope' => (string)$x['scope'], 'course' => (string)($x['course'] ?? ''), 'title' => doc_club_title($x),
                    'style' => (string)($x['style'] ?? 'club'), 'at' => (string)$d['issuedAt'], 'url' => doc_view_url($d)];
    }
    return ['ok' => true, 'courses' => $list, 'certificates' => $certs, 'tiers' => array_values(LX_TIERS), 'trialPass' => LX_TRIAL_PASS];
}

/** A promotion — a programme year raised by an instructor — earns its certificate. Called by staff_curriculum_year. */
function lx_promotion_award(array $m, int $from, int $to): ?array {
    if ($to <= $from || $from < 1 || !function_exists('doc_club_issue')) return null;
    $courses = function_exists('curriculum_member_courses') ? curriculum_member_courses($m) : [];
    $label = $courses ? implode(', ', array_slice($courses, 0, 3)) : '';
    $r = doc_club_issue((string)$m['memberId'], 'promotion', $label, 'year-' . $to, ['fromYear' => $from, 'toYear' => $to, 'courses' => $courses, 'pattern' => $courses]);
    return $r ? ['no' => (string)$r[0]['docNo'], 'url' => doc_view_url($r[0]), 'new' => $r[1]] : null;
}
