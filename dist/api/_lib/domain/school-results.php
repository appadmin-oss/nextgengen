<?php
/**
 * School results and the growth plan.
 *
 * Each term a member uploads their school report. The system reads it into a
 * table, which the MEMBER confirms (a model reading a phone photo of a report
 * card is a draft, never a fact). From the confirmed scores a plan is drafted
 * for at most three subjects, which the member then makes their own. The
 * required part is "when and where": if-then plans are the thing the research
 * says raises follow-through (RESEARCH R3). The member sends it; their mentor
 * approves it; only THEN does a family hear about it, because nothing an AI
 * drafted reaches a family without an adult approving it.
 *
 * After that the plan is lived with: a weekly tick per item, adherence over
 * the last four completed weeks (R4), and a background job that reminds the
 * member on Sunday and tells the mentor when a plan has stalled.
 *
 * Who sees what:
 *   member      their own, always (the memberId comes from the session)
 *   mentor      their caseload (mp_caseload_ids) — approve / return
 *   instructor  the NGG members in their centres and courses — read, note,
 *               mark as seen, remind
 * Nothing here is visible to another member.
 *
 * Every change is a row in results_log, which is append-only: "Every change to
 * your results and plan is recorded. Nothing is deleted."
 */

const RESULTS_MAX_BYTES = 10 * 1024 * 1024;
const RESULTS_MAX_SUBJECTS = 20;
const RESULTS_MAX_FOCUS = 3;          // R14: fewer, smaller commitments are kept
const RESULTS_TARGET_STEP = 8;        // R5: a specific target, current + 8
const RESULTS_DUE_DAYS = 21;          // a report is due three weeks after a term ends
const RESULTS_REMIND_HOURS = 24;
const RESULTS_PROMPT_VERSION = 'r1';
const RESULTS_LOW_CONFIDENCE = 0.75;

/* The five study methods, each pointing at the line of evidence behind it. */
const RESULTS_METHODS = [
    'retrieval'   => ['label' => 'Test yourself',           'ref' => 'R1', 'why' => 'Practising recall beats re-reading. It is one of the two best-supported ways to study.'],
    'spaced'      => ['label' => 'Spread it out',           'ref' => 'R1', 'why' => 'Short sessions on different days stick better than one long cram.'],
    'worked'      => ['label' => 'Worked examples',         'ref' => 'R2', 'why' => 'Study a solved example step by step, then try one like it yourself.'],
    'interleave'  => ['label' => 'Mix the problem types',   'ref' => 'R2', 'why' => 'Mixing kinds of question teaches you to spot which method each one needs.'],
    'selfexplain' => ['label' => 'Explain it to yourself',  'ref' => 'R2', 'why' => 'Saying why each step works shows you what you do not yet understand.'],
];
const RESULTS_HELPERS = ['self' => 'Just me', 'mentor' => 'My mentor', 'instructor' => 'My instructor', 'family' => 'Family', 'buddy' => 'A study buddy'];

/* The Nigerian school year: three terms, ending mid-December, early April and
 * late July. A term is named for the school year it belongs to. */
const RESULTS_TERM_ENDS = [1 => '12-15', 2 => '04-10', 3 => '07-25'];
const RESULTS_TERM_NAMES = [1 => 'First term', 2 => 'Second term', 3 => 'Third term'];

function results_now_lagos(): int { return time() + 3600; }
function results_today(): string { return function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d', results_now_lagos()); }

/** "2025/26-2" → its parts, or null. */
function results_term_parse(string $key): ?array {
    if (!preg_match('/^(\d{4})\/(\d{2})-([123])$/', $key, $m)) return null;
    $y = (int)$m[1];
    if ((int)$m[2] !== ($y + 1) % 100) return null;
    $n = (int)$m[3];
    $endYear = $n === 1 ? $y : $y + 1;
    $ends = $endYear . '-' . RESULTS_TERM_ENDS[$n];
    return ['key' => $key, 'n' => $n, 'year' => $y,
        'label' => RESULTS_TERM_NAMES[$n] . ' ' . $y . '/' . substr((string)($y + 1), 2),
        'endsOn' => $ends, 'dueOn' => gmdate('Y-m-d', strtotime($ends . 'T00:00:00Z') + RESULTS_DUE_DAYS * 86400)];
}
function results_term_key(int $startYear, int $n): string { return $startYear . '/' . sprintf('%02d', ($startYear + 1) % 100) . '-' . $n; }

/** The terms that have ended on or before $today, newest first. */
function results_terms(string $today, int $count = 6): array {
    $y = (int)substr($today, 0, 4);
    $out = [];
    for ($sy = $y; $sy >= $y - 3 && count($out) < $count; $sy--) {
        foreach ([3, 2, 1] as $n) {
            $t = results_term_parse(results_term_key($sy, $n));
            if ($t && $t['endsOn'] <= $today) $out[] = $t;
        }
    }
    usort($out, static fn($a, $b) => strcmp($b['endsOn'], $a['endsOn']));
    return array_slice($out, 0, $count);
}
/** The previous term's key (for "last term" comparisons). */
function results_term_prev(string $key): string {
    $t = results_term_parse($key);
    if (!$t) return '';
    return $t['n'] === 1 ? results_term_key($t['year'] - 1, 3) : results_term_key($t['year'], $t['n'] - 1);
}

/** Monday of the Lagos week containing $date. */
function results_week_start(string $date): string {
    $ts = strtotime($date . 'T00:00:00Z');
    $dow = (int)gmdate('N', $ts);
    return gmdate('Y-m-d', $ts - ($dow - 1) * 86400);
}

function results_attention_cfg(): array {
    $s = setting_get('results_attention');
    $d = ['minAvg' => 55, 'dropPts' => 5, 'minAdh' => 50];
    if (is_array($s)) foreach ($d as $k => $v) if (isset($s[$k]) && is_numeric($s[$k])) $d[$k] = (int)$s[$k];
    return $d;
}

function results_id(string $prefix): string { return $prefix . '-' . gmdate('ymd') . '-' . rand_hex(4); }

function results_log(string $memberId, string $term, array $actor, string $what, string $kind = ''): void {
    db_insert('results_log', ['memberId' => $memberId, 'term' => $term,
        'actorId' => (string)($actor['id'] ?? ''), 'actorName' => mb_substr((string)($actor['name'] ?? ''), 0, 160),
        'actorRole' => (string)($actor['role'] ?? ''), 'what' => mb_substr($what, 0, 400), 'kind' => $kind, 'at' => now_iso()]);
}

/**
 * Is this a child in school — somebody a term report is asked of? Not staff,
 * and under 20 when a date of birth is known. Adult mentors and instructors
 * hold member accounts at the same centre and course; without this they were
 * counted in a class's results and the Saturday reminder asked them for a
 * report card. A peer mentor under 20 is still a pupil and stays in.
 */
function results_in_loop(array $m): bool {
    if (!in_array(strtolower(trim((string)($m['role'] ?? 'member'))), ['', 'member'], true)) return false;
    $dob = trim((string)($m['dob'] ?? ''));
    if ($dob === '' || !preg_match('/^\d{4}-\d{2}-\d{2}/', $dob)) return true;
    $age = mp_age(substr($dob, 0, 10), results_today());
    return $age === null || $age < 20;
}

/** The member's own row: NGG, and a child in the results loop. A Summer account has none. */
function results_member(string $memberId): ?array {
    if ($memberId === '') return null;
    $m = db_row('SELECT memberId, fullName, centre, track, courses, disciplines, division, type, status, role, joinDate, createdAt, dob FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m || !member_is_ngg($m) || !results_in_loop($m)) return null;
    return $m;
}
function results_actor_member(array $m): array { return ['id' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'role' => 'member']; }

/** Is $term owed by this member? Not if they joined after it ended. */
function results_owed(array $m, array $t): bool {
    $joined = substr((string)($m['joinDate'] ?: $m['createdAt'] ?: ''), 0, 10);
    return $joined === '' || $joined <= $t['endsOn'];
}

function results_clean_subject(string $s): string {
    $s = trim(preg_replace('/\s+/', ' ', $s));
    return mb_substr($s, 0, 40);
}

/* ── Reading the report ────────────────────────────────────────────────── */

/**
 * Read a report card into rows. Vision model when one is configured; on any
 * failure the member types the scores, which is the same screen with empty
 * cells. Returns ['ok', 'subjects' => [{name, score, confidence}], 'by'].
 * Test seam: $GLOBALS['__ai_results_mock'].
 */
function results_ocr(string $url, string $mime): array {
    if (isset($GLOBALS['__ai_results_mock']) && is_callable($GLOBALS['__ai_results_mock'])) {
        return ($GLOBALS['__ai_results_mock'])($url, $mime);
    }
    $cand = null;
    foreach (array_merge(ai_profile_candidates('results'), ai_profile_candidates('photo')) as $c) {
        if (($c['provider'] ?? '') === 'gemini') { $cand = $c; break; }
    }
    if (!$cand) return ['ok' => false, 'error' => 'no_vision_provider'];
    if (str_starts_with($url, '/')) $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . $url;
    $img = ai_fetch_image($url);
    if (empty($img['ok'])) return $img;
    $mimeIn = str_starts_with($mime, 'application/pdf') ? 'application/pdf' : $img['mime'];
    /* How these cards are laid out, so totals are not missed: a table with a
       row per subject and columns such as 1st CA, 2nd CA, (3rd CA), Exam,
       TOTAL (or "Term Total", "Total Score", "Wtd"), Grade, Position, Remark.
       Photos are often skewed, folded or handwritten in the total column. The
       first pass read "some scores" as unreadable; it now thinks first, has
       room for every row, and checks each total against CA + exam. */
    $system = 'You read Nigerian primary and secondary school report cards (photos or PDFs, often skewed, shadowed, folded or with handwritten totals). '
        . 'There is a table with one row per subject and columns like "1st CA", "2nd CA", "3rd CA", "Exam", "Total" (also printed "Term Total", "Total Score", "Wtd Total"), "Grade", "Position", "Remark". '
        . 'For EVERY subject row extract the TERM TOTAL out of 100 as a whole number. If the total cell is blank or unreadable, add the CA and exam marks of that row. '
        . 'If the card is marked out of something other than 100 (e.g. CA 40 + Exam 60, or a total out of 200), convert to a percentage. '
        . 'Check each total: it should equal the row\'s CA + exam, and match its grade letter (A is 70+ or 75+, F is below 40). If they disagree, re-read the digits and lower the confidence. '
        . 'Read digits carefully: 1/7, 3/8, 5/6 and 0/6 are easily confused in handwriting. Use the subject names as printed (keep full names like "Computer Hardware & GSM Repair"). '
        . 'Never invent a subject; skip conduct, attendance, affective/psychomotor traits, position and remarks rows. '
        . 'Reply with ONLY JSON: {"subjects":[{"name":"Mathematics","score":64,"ca":24,"exam":40,"grade":"B","confidence":0.0-1.0}],"outOf":100,"notes":"anything unclear"}.';
    $read = function (string $thinking, string $ask) use ($cand, $system, $mimeIn, $img) {
        $r = gemini_generate($cand, $system, [['role' => 'user', 'parts' => [
            ['inline_data' => ['mime_type' => $mimeIn, 'data' => $img['b64']]],
            ['text' => $ask],
        ]]], ['maxTokens' => 3000, 'temperature' => 0.0, 'thinking' => $thinking, 'json' => true]);
        if (empty($r['ok'])) return $r;
        $text = (string)$r['text'];
        if (preg_match('/\{.*\}/s', $text, $mm)) $text = $mm[0];
        $j = json_decode($text, true);
        if (!is_array($j) || !is_array($j['subjects'] ?? null)) return ['ok' => false, 'error' => 'ai_bad_json'];
        return ['ok' => true, 'subjects' => $j['subjects'], 'by' => (string)($r['model'] ?? 'gemini')];
    };
    $r = $read('low', 'Read every subject row and its term total from this report card.');
    if (empty($r['ok'])) $r = $read('off', 'Read every subject row and its term total from this report card.');
    if (empty($r['ok'])) return $r;
    /* Unclear reads (no score, or low confidence on a third or more of rows):
       one more careful pass, keeping whichever read is more confident. */
    $weak = static fn(array $subs) => count(array_filter($subs, static fn($x) => !is_numeric($x['score'] ?? null) || (float)($x['confidence'] ?? 1) < 0.6));
    $w1 = $weak($r['subjects']);
    if ($r['subjects'] && $w1 * 3 >= count($r['subjects'])) {
        $r2 = $read('', 'Read this report card again, slowly, row by row. For each subject give the TOTAL; if it is unclear, add that row\'s CA and exam marks.');
        if (!empty($r2['ok']) && $weak($r2['subjects']) < $w1) $r = $r2;
    }
    return $r;
}

/** Normalise subjects from any source: names cleaned and de-duplicated, scores 0–100 or null. */
function results_norm_subjects(array $in, bool $withConfidence = false): array {
    $out = []; $seen = [];
    foreach ($in as $s) {
        if (!is_array($s)) continue;
        $name = results_clean_subject((string)($s['name'] ?? $s['subject'] ?? ''));
        if (mb_strlen($name) < 2) continue;
        $k = mb_strtolower($name);
        if (isset($seen[$k])) continue;
        $seen[$k] = true;
        $raw = $s['score'] ?? null;
        $score = (is_numeric($raw) && (float)$raw >= 0 && (float)$raw <= 100) ? (int)round((float)$raw) : null;
        $row = ['name' => $name, 'score' => $score];
        if ($withConfidence) {
            $c = $s['confidence'] ?? null;
            $row['confidence'] = is_numeric($c) ? max(0.0, min(1.0, (float)$c)) : ($score === null ? 0.0 : 0.5);
        }
        $out[] = $row;
        if (count($out) >= RESULTS_MAX_SUBJECTS) break;
    }
    return $out;
}

/** Last term's confirmed scores for this member, by lower-cased subject. */
function results_last_scores(string $memberId, string $term): array {
    $prev = results_term_prev($term);
    if ($prev === '') return [];
    $u = db_row("SELECT uploadId FROM results_uploads WHERE memberId = ? AND term = ? AND status IN ('checked','sent') LIMIT 1", [$memberId, $prev]);
    if (!$u) return [];
    $out = [];
    foreach (db_all('SELECT subject, score FROM results_subjects WHERE uploadId = ?', [(string)$u['uploadId']]) as $r) {
        if ($r['score'] !== null) $out[mb_strtolower((string)$r['subject'])] = (int)$r['score'];
    }
    return $out;
}

/* ── Figures ──────────────────────────────────────────────────────────── */

/** avg, change against last term (matched subjects only), best, lowest. */
function results_kpis(array $subjects): array {
    $scored = array_values(array_filter($subjects, static fn($s) => $s['score'] !== null));
    if (!$scored) return ['avg' => null, 'change' => null, 'best' => null, 'lowest' => null, 'count' => 0];
    $avg = array_sum(array_column($scored, 'score')) / count($scored);
    $pairs = array_values(array_filter($scored, static fn($s) => isset($s['last']) && $s['last'] !== null));
    $change = $pairs ? (array_sum(array_column($pairs, 'score')) - array_sum(array_column($pairs, 'last'))) / count($pairs) : null;
    usort($scored, static fn($a, $b) => $b['score'] <=> $a['score']);
    return ['avg' => (int)round($avg), 'change' => $change === null ? null : (int)round($change),
        'best' => ['name' => $scored[0]['name'], 'score' => $scored[0]['score']],
        'lowest' => ['name' => end($scored)['name'], 'score' => end($scored)['score']], 'count' => count($scored)];
}

/** The subjects a plan should focus on: lowest first, then the biggest drops. At most three. */
function results_focus(array $subjects): array {
    $scored = array_values(array_filter($subjects, static fn($s) => $s['score'] !== null));
    usort($scored, static function ($a, $b) {
        $da = isset($a['last']) && $a['last'] !== null ? $a['score'] - $a['last'] : 0;
        $db = isset($b['last']) && $b['last'] !== null ? $b['score'] - $b['last'] : 0;
        return [$a['score'] + min(0, $da), $a['name']] <=> [$b['score'] + min(0, $db), $b['name']];
    });
    return array_slice($scored, 0, RESULTS_MAX_FOCUS);
}

/** A default method per subject (R2: worked examples and interleaving suit maths and problem solving). */
function results_default_method(string $subject): string {
    $s = mb_strtolower($subject);
    if (preg_match('/math|physic|chem|account|further|account|economics|technical|statistics/', $s)) return preg_match('/further|physic/', $s) ? 'interleave' : 'worked';
    if (preg_match('/english|literature|comprehension|civic|government|history|christian|islamic|social/', $s)) return 'selfexplain';
    return 'retrieval';
}

function results_default_what(string $subject, string $method): string {
    return match ($method) {
        'worked' => "Work through one solved {$subject} example, cover it, then do a similar question on my own.",
        'interleave' => "Do a mixed set of {$subject} questions from different topics, not one topic at a time.",
        'selfexplain' => "After each {$subject} topic, explain in my own words why the answer is right.",
        'spaced' => "Short {$subject} sessions on different days, going back over last week's topic first.",
        default => "Close the book and write down everything I remember from {$subject}, then check what I missed.",
    };
}

/* ── Adherence ────────────────────────────────────────────────────────── */

/**
 * Done ÷ planned over the last four COMPLETED weeks since the plan was sent.
 * A week with no row counts as nothing done: a plan nobody ticks is a plan
 * nobody follows, and leaving it out would score silence at 100%.
 * Returns null until a full week has passed.
 */
function results_adherence(array $items, string $sentAt, string $today, ?array $checkins = null): ?int {
    if (!$items || $sentAt === '') return null;
    $thisWeek = results_week_start($today);
    $firstWeek = results_week_start(substr($sentAt, 0, 10));
    $weeks = [];
    for ($w = strtotime($thisWeek . 'T00:00:00Z') - 7 * 86400; count($weeks) < 4; $w -= 7 * 86400) {
        $d = gmdate('Y-m-d', $w);
        if ($d < $firstWeek) break;
        $weeks[] = $d;
    }
    if (!$weeks) return null;
    if ($checkins === null) {
        $ids = array_column($items, 'itemId');
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $wph = implode(',', array_fill(0, count($weeks), '?'));
        $checkins = db_all("SELECT itemId, weekStart, done FROM plan_checkins WHERE itemId IN ($ph) AND weekStart IN ($wph)", array_merge($ids, $weeks));
    }
    $done = [];
    foreach ($checkins as $c) $done[(string)$c['itemId'] . '|' . (string)$c['weekStart']] = (int)$c['done'];
    $sumDone = 0; $sumPlanned = 0;
    foreach ($weeks as $w) foreach ($items as $it) {
        $planned = max(1, (int)$it['sessionsPerWeek']);
        $sumPlanned += $planned;
        $sumDone += min($planned, $done[$it['itemId'] . '|' . $w] ?? 0);
    }
    return $sumPlanned ? (int)round($sumDone / $sumPlanned * 100) : null;
}

/* ── Reading a whole record ──────────────────────────────────────────── */

function results_subjects_of(string $uploadId, array $last = []): array {
    $out = [];
    foreach (db_all('SELECT * FROM results_subjects WHERE uploadId = ? ORDER BY position, id', [$uploadId]) as $r) {
        $k = mb_strtolower((string)$r['subject']);
        $lastScore = $r['lastScore'] !== null ? (int)$r['lastScore'] : ($last[$k] ?? null);
        $out[] = ['name' => (string)$r['subject'], 'score' => $r['score'] === null ? null : (int)$r['score'],
            'ocrScore' => $r['ocrScore'] === null ? null : (int)$r['ocrScore'],
            'confidence' => $r['confidence'] === null ? null : (float)$r['confidence'],
            'last' => $lastScore, 'change' => ($lastScore !== null && $r['score'] !== null) ? (int)$r['score'] - $lastScore : null];
    }
    return $out;
}

function results_plan_items(string $planId): array {
    return array_map(static fn($r) => ['itemId' => (string)$r['itemId'], 'subject' => (string)$r['subject'],
        'current' => $r['current'] === null ? null : (int)$r['current'], 'target' => $r['target'] === null ? null : (int)$r['target'],
        'method' => (string)$r['method'], 'methodLabel' => RESULTS_METHODS[(string)$r['method']]['label'] ?? '',
        'why' => RESULTS_METHODS[(string)$r['method']]['why'] ?? '', 'ref' => RESULTS_METHODS[(string)$r['method']]['ref'] ?? '',
        'what' => (string)$r['what'], 'whenWhere' => (string)$r['whenWhere'],
        'sessionsPerWeek' => (int)$r['sessionsPerWeek'], 'helper' => (string)$r['helper'],
        'midterm' => results_midterm($r['current'] === null ? null : (int)$r['current'], $r['target'] === null ? null : (int)$r['target'])],
        db_all('SELECT * FROM growth_plan_items WHERE planId = ? ORDER BY position, id', [$planId]));
}

/* What makes an 85% target realistic: a halfway mark to check against at
   mid-term, and enough sessions for the size of the climb. */
function results_midterm(?int $current, ?int $target): ?int {
    if ($target === null) return null;
    return $current === null ? $target : (int)ceil($current + ($target - $current) / 2);
}
function results_sessions_for(?int $current, int $target): int {
    $gap = $target - (int)$current;
    return $gap >= 40 ? 5 : ($gap >= 25 ? 4 : 3);
}

/** The plan as every reader sees it. $week: this week's ticks, per item. */
/** `$child`: the member's own screen, where adults are named by title and surname (staff_public_name). */
function results_plan_public(?array $p, string $today, bool $child = false): ?array {
    if (!$p) return null;
    $items = results_plan_items((string)$p['planId']);
    $ws = results_week_start($today);
    $ticks = [];
    if ($items) {
        $ph = implode(',', array_fill(0, count($items), '?'));
        foreach (db_all("SELECT itemId, done FROM plan_checkins WHERE weekStart = ? AND itemId IN ($ph)", array_merge([$ws], array_column($items, 'itemId'))) as $r) $ticks[(string)$r['itemId']] = (int)$r['done'];
    }
    foreach ($items as &$it) { $it['doneThisWeek'] = $ticks[$it['itemId']] ?? 0; }
    unset($it);
    $live = in_array((string)$p['status'], ['sent', 'live'], true);
    return ['planId' => (string)$p['planId'], 'term' => (string)$p['term'], 'status' => (string)$p['status'],
        'summary' => (string)$p['summary'], 'flags' => json_decode((string)$p['flagsJson'], true) ?: [],
        'habit' => (string)$p['habit'], 'committed' => (bool)$p['committed'],
        'recipients' => results_recipients(json_decode((string)$p['recipientsJson'], true)),
        'draftedBy' => (string)$p['aiModel'] !== '' ? 'ai' : 'rules',
        'returnNote' => (string)$p['returnNote'],
        'approvedByName' => $child && (string)$p['approvedByName'] !== '' ? staff_public_name((string)$p['approvedBy'], 'Your mentor') : (string)$p['approvedByName'], 'approvedAt' => (string)$p['approvedAt'],
        'sentAt' => (string)$p['sentAt'], 'familySentAt' => (string)$p['familySentAt'],
        'items' => $items, 'weekStart' => $ws,
        'adherence' => $live ? results_adherence($items, (string)$p['sentAt'], $today) : null];
}

function results_recipients($r): array {
    $r = is_array($r) ? $r : [];
    // Mentor, instructor and the NGG team always see it; the family is the member's choice.
    return ['mentor' => true, 'instructor' => true, 'admin' => true, 'family' => !empty($r['family'])];
}

function results_history(string $memberId, string $term = '', int $limit = 60, bool $child = false): array {
    $sql = 'SELECT actorId, actorName, actorRole, what, kind, at, term FROM results_log WHERE memberId = ?';
    $args = [$memberId];
    if ($term !== '') { $sql .= ' AND term = ?'; $args[] = $term; }
    $rows = db_all($sql . ' ORDER BY id DESC LIMIT ' . (int)$limit, $args);
    $titled = $child ? staff_public_names(array_column($rows, 'actorId')) : [];
    return array_map(static fn($r) => ['at' => (string)$r['at'], 'who' => !$child || (string)$r['actorRole'] === 'system' ? (string)$r['actorName']
            : ((string)$r['actorId'] === $memberId ? 'You' : ($titled[(string)$r['actorId']] ?? 'The NGG team')), 'role' => (string)$r['actorRole'],
        'what' => (string)$r['what'], 'kind' => (string)$r['kind'], 'term' => (string)$r['term']], $rows);
}

/** One member's term: upload, subjects (with last term), KPIs, plan, notes. */
function results_record(array $m, string $term, string $today, bool $child = false): array {
    $mid = (string)$m['memberId'];
    $u = db_row('SELECT * FROM results_uploads WHERE memberId = ? AND term = ? LIMIT 1', [$mid, $term]);
    $last = results_last_scores($mid, $term);
    $subjects = $u ? results_subjects_of((string)$u['uploadId'], $last) : [];
    $p = db_row('SELECT * FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [$mid, $term]);
    $nrows = $p ? db_all('SELECT * FROM plan_notes WHERE planId = ? ORDER BY id DESC LIMIT 40', [(string)$p['planId']]) : [];
    $titled = $child ? staff_public_names(array_column($nrows, 'authorId')) : [];
    $notes = array_map(static fn($n) => ['who' => $child ? ($titled[(string)$n['authorId']] ?? ((string)$n['authorRole'] === 'instructor' ? 'Your instructor' : 'Your mentor')) : (string)$n['authorName'],
        'role' => (string)$n['authorRole'], 'text' => (string)$n['text'], 'at' => (string)$n['createdAt']], $nrows);
    $t = results_term_parse($term);
    return ['term' => $term, 'termLabel' => $t['label'] ?? $term, 'dueOn' => $t['dueOn'] ?? '',
        'upload' => $u ? ['uploadId' => (string)$u['uploadId'], 'status' => (string)$u['status'], 'fileUrl' => (string)$u['fileUrl'],
            'fileMime' => (string)$u['fileMime'], 'ocrBy' => (string)$u['ocrBy'], 'confirmedAt' => (string)$u['confirmedAt'],
            'sentAt' => (string)$u['sentAt'], 'createdAt' => (string)$u['createdAt']] : null,
        'subjects' => $subjects, 'kpis' => results_kpis($subjects),
        'plan' => results_plan_public($p, $today, $child), 'notes' => $notes];
}

/* ── Member ops ────────────────────────────────────────────────────────── */

/** member.results.state — the whole screen in one read. */
function member_results_state(array $p): array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $today = results_today();
    $terms = results_terms($today);
    $owed = array_values(array_filter($terms, static fn($t) => results_owed($m, $t)));
    $term = (string)($p['term'] ?? '');
    $valid = array_column($terms, 'key');
    if (!in_array($term, $valid, true)) $term = (string)($owed[0]['key'] ?? ($terms[0]['key'] ?? ''));
    $due = results_due_for($m, $today);
    $past = [];
    foreach (db_all("SELECT u.term, u.status, u.uploadId, p.status planStatus FROM results_uploads u LEFT JOIN growth_plans p ON p.memberId = u.memberId AND p.term = u.term
                     WHERE u.memberId = ? ORDER BY u.term DESC LIMIT 12", [(string)$m['memberId']]) as $r) {
        $subs = results_subjects_of((string)$r['uploadId']);
        $t = results_term_parse((string)$r['term']);
        $past[] = ['term' => (string)$r['term'], 'label' => $t['label'] ?? (string)$r['term'], 'status' => (string)$r['status'],
            'planStatus' => (string)($r['planStatus'] ?? ''), 'avg' => results_kpis($subs)['avg']];
    }
    return ['ok' => true, 'term' => $term,
        'terms' => array_map(static fn($t) => ['key' => $t['key'], 'label' => $t['label'], 'dueOn' => $t['dueOn']], $terms),
        'due' => $due, 'record' => $term !== '' ? results_record($m, $term, $today, true) : null,
        'history' => results_history((string)$m['memberId'], $term, 60, true),
        'past' => $past,
        'methods' => array_map(static fn($k, $v) => ['key' => $k] + $v, array_keys(RESULTS_METHODS), RESULTS_METHODS),
        'helpers' => array_map(static fn($k, $v) => ['key' => $k, 'label' => $v], array_keys(RESULTS_HELPERS), RESULTS_HELPERS),
        'maxFocus' => RESULTS_MAX_FOCUS, 'targetStep' => RESULTS_TARGET_STEP, 'targetMin' => RESULTS_TARGET_MIN, 'maxBytes' => RESULTS_MAX_BYTES];
}

/** The term this member owes and has not sent, or null. */
function results_due_for(array $m, string $today): ?array {
    $terms = results_terms($today, 1);
    $t = $terms[0] ?? null;
    if (!$t || !results_owed($m, $t)) return null;
    $u = db_row('SELECT status FROM results_uploads WHERE memberId = ? AND term = ? LIMIT 1', [(string)$m['memberId'], $t['key']]);
    $p = db_row('SELECT status, returnNote FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [(string)$m['memberId'], $t['key']]);
    if ($p && in_array((string)$p['status'], ['sent', 'live', 'closed'], true)) return null;
    $step = !$u ? 'upload' : ((string)$u['status'] === 'draft' ? 'check' : 'plan');
    if ($p && (string)$p['status'] === 'draft' && (string)$p['returnNote'] !== '') $step = 'returned';
    return ['term' => $t['key'], 'label' => $t['label'], 'dueOn' => $t['dueOn'], 'overdue' => $today > $t['dueOn'], 'step' => $step,
        'daysLeft' => (int)floor((strtotime($t['dueOn'] . 'T00:00:00Z') - strtotime($today . 'T00:00:00Z')) / 86400)];
}

function results_term_ok(array $m, string $term): ?array {
    $t = results_term_parse($term);
    if (!$t || $t['endsOn'] > results_today()) return null;
    return $t;
}

/** The file must be ours: Cloudinary (the signer's target) or this site. */
function results_file_ok(string $url): bool {
    // This server's own photo store (no Cloudinary on the host): a photo of the report, stored in pieces.
    if (preg_match('#^/api/public/photo\.php\?[A-Za-z0-9=&_.%-]{1,200}$#', $url)) return true;
    if (!preg_match('#^https://#', $url) || strlen($url) > 600) return false;
    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    $own = strtolower((string)parse_url((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), PHP_URL_HOST));
    return $host === 'res.cloudinary.com' || store_hosted($url) || ($own !== '' && $host === $own);
}

/** member.results.upload — attach (or replace) this term's report. */
function member_results_upload(array $p): array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $term = (string)($p['term'] ?? '');
    if (!results_term_ok($m, $term)) return ['ok' => false, 'error' => 'bad_term'];
    $url = trim((string)($p['fileUrl'] ?? ''));
    $mime = strtolower(trim((string)($p['mime'] ?? '')));
    $size = (int)($p['size'] ?? 0);
    if (!results_file_ok($url)) return ['ok' => false, 'error' => 'bad_file_url'];
    if (!preg_match('#^(image/(jpeg|png|webp|heic|heif)|application/pdf)$#', $mime)) return ['ok' => false, 'error' => 'unsupported_type'];
    if ($size <= 0 || $size > RESULTS_MAX_BYTES) return ['ok' => false, 'error' => 'file_too_large', 'maxBytes' => RESULTS_MAX_BYTES];
    $mid = (string)$m['memberId'];
    $u = db_row('SELECT * FROM results_uploads WHERE memberId = ? AND term = ? LIMIT 1', [$mid, $term]);
    if ($u && (string)$u['status'] === 'sent') return ['ok' => false, 'error' => 'already_sent'];
    $now = now_iso();
    if ($u) {
        db_update('results_uploads', ['fileUrl' => $url, 'fileMime' => $mime, 'fileBytes' => $size, 'status' => 'draft',
            'ocrJson' => '', 'ocrBy' => '', 'confirmedAt' => '', 'updatedAt' => $now], ['id' => (int)$u['id']]);
        $uploadId = (string)$u['uploadId'];
        results_log($mid, $term, results_actor_member($m), 'Replaced the report with a new file', 'upload');
    } else {
        $uploadId = results_id('RU');
        db_insert('results_uploads', ['uploadId' => $uploadId, 'memberId' => $mid, 'term' => $term, 'fileUrl' => $url,
            'fileMime' => $mime, 'fileBytes' => $size, 'status' => 'draft', 'createdAt' => $now, 'updatedAt' => $now]);
        results_log($mid, $term, results_actor_member($m), 'Uploaded the report', 'upload');
    }
    return ['ok' => true, 'uploadId' => $uploadId];
}

/** member.results.read — read the report; subjects the member then checks. */
function member_results_read(array $p): array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $u = db_row('SELECT * FROM results_uploads WHERE uploadId = ? AND memberId = ? LIMIT 1', [(string)($p['uploadId'] ?? ''), (string)$m['memberId']]);
    if (!$u) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$u['status'] === 'sent') return ['ok' => false, 'error' => 'already_sent'];
    $last = results_last_scores((string)$m['memberId'], (string)$u['term']);
    // Read once per file: a second read of the same file is the same answer, and costs a call.
    $cached = json_decode((string)$u['ocrJson'], true);
    if (is_array($cached) && isset($cached['subjects'])) {
        $subs = $cached['subjects']; $by = (string)$u['ocrBy'];
    } else {
        $r = results_ocr((string)$u['fileUrl'], (string)$u['fileMime']);
        if (!empty($r['ok'])) {
            $subs = results_norm_subjects((array)$r['subjects'], true);
            $by = (string)($r['by'] ?? 'ai');
        } else {
            $subs = []; $by = 'manual';
        }
        db_update('results_uploads', ['ocrJson' => json_encode(['subjects' => $subs]), 'ocrBy' => $by, 'updatedAt' => now_iso()], ['id' => (int)$u['id']]);
    }
    // Nothing read: start from last term's subjects so the member types scores, not names.
    if (!$subs && $last) {
        foreach (array_keys($last) as $k) {
            $name = db_row('SELECT subject FROM results_subjects s JOIN results_uploads u ON u.uploadId = s.uploadId
                            WHERE u.memberId = ? AND lower(s.subject) = ? ORDER BY s.id DESC LIMIT 1', [(string)$m['memberId'], $k]);
            $subs[] = ['name' => (string)($name['subject'] ?? ucfirst($k)), 'score' => null, 'confidence' => 0.0];
        }
    }
    foreach ($subs as &$s) {
        $s['last'] = $last[mb_strtolower($s['name'])] ?? null;
        $s['low'] = $s['score'] === null || ($s['confidence'] ?? 1) < RESULTS_LOW_CONFIDENCE;
    }
    unset($s);
    return ['ok' => true, 'uploadId' => (string)$u['uploadId'], 'by' => $by, 'read' => $by !== 'manual', 'subjects' => $subs];
}

/** member.results.confirm — the member's checked table. Each change from the reading is logged. */
function member_results_confirm(array $p): array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $u = db_row('SELECT * FROM results_uploads WHERE uploadId = ? AND memberId = ? LIMIT 1', [(string)($p['uploadId'] ?? ''), (string)$m['memberId']]);
    if (!$u) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$u['status'] === 'sent') return ['ok' => false, 'error' => 'already_sent'];
    $subs = results_norm_subjects(is_array($p['subjects'] ?? null) ? $p['subjects'] : []);
    if (!$subs) return ['ok' => false, 'error' => 'no_subjects'];
    $missing = array_values(array_map(static fn($s) => $s['name'], array_filter($subs, static fn($s) => $s['score'] === null)));
    if ($missing) return ['ok' => false, 'error' => 'score_required', 'subjects' => $missing];
    /* Every score 0 is a report that was not read, not a term of zeros. It was
       accepted, and became a plan, a "needs attention" flag and a class
       average built on nothing. Two or more zeros among real scores are kept:
       that can be true. */
    $zeros = count(array_filter($subs, static fn($s) => (int)$s['score'] === 0));
    if (count($subs) >= 2 && $zeros === count($subs)) return ['ok' => false, 'error' => 'scores_all_zero',
        'message' => 'Every score says 0. Type each score from your report card, or upload a clearer photo.'];
    $ocr = [];
    foreach ((json_decode((string)$u['ocrJson'], true)['subjects'] ?? []) as $o) $ocr[mb_strtolower((string)$o['name'])] = $o;
    $last = results_last_scores((string)$m['memberId'], (string)$u['term']);
    $old = [];
    foreach (db_all('SELECT subject, score FROM results_subjects WHERE uploadId = ?', [(string)$u['uploadId']]) as $r) $old[mb_strtolower((string)$r['subject'])] = $r['score'] === null ? null : (int)$r['score'];
    $actor = results_actor_member($m);
    $changes = [];
    db_tx(function () use ($u, $subs, $ocr, $last, &$changes, $old) {
        db_exec('DELETE FROM results_subjects WHERE uploadId = ?', [(string)$u['uploadId']]);
        foreach ($subs as $i => $s) {
            $k = mb_strtolower($s['name']);
            $o = $ocr[$k] ?? null;
            db_insert('results_subjects', ['uploadId' => (string)$u['uploadId'], 'subject' => $s['name'], 'score' => $s['score'],
                'ocrScore' => $o && $o['score'] !== null ? (int)$o['score'] : null,
                'confidence' => $o['confidence'] ?? null, 'lastScore' => $last[$k] ?? null, 'position' => $i]);
            $was = array_key_exists($k, $old) ? $old[$k] : ($o['score'] ?? null);
            if ($was === null && !array_key_exists($k, $old) && !$o) $changes[] = "Added {$s['name']}: {$s['score']}";
            elseif ($was !== null && (int)$was !== (int)$s['score']) $changes[] = "Changed {$s['name']} {$was} → {$s['score']}";
        }
        $names = array_map(static fn($s) => mb_strtolower($s['name']), $subs);
        foreach (array_unique(array_merge(array_keys($old), array_keys($ocr))) as $k) if (!in_array($k, $names, true)) $changes[] = 'Removed ' . ($ocr[$k]['name'] ?? $k);
        db_update('results_uploads', ['status' => 'checked', 'confirmedAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$u['id']]);
    });
    results_log((string)$m['memberId'], (string)$u['term'], $actor, 'Checked the scores (' . count($subs) . ' subjects)', 'confirm');
    foreach (array_slice($changes, 0, 20) as $c) results_log((string)$m['memberId'], (string)$u['term'], $actor, $c, 'correct');
    return ['ok' => true, 'subjects' => count($subs), 'changes' => count($changes)];
}

/**
 * member.results.plan.draft — draft (or return the existing) plan for a checked
 * term. Rules first (always works); the AI then words the summary and the
 * "what I'll do" lines when one is configured. The AI cannot choose subjects,
 * targets or methods outside the lists — those are validated and fall back.
 */
/**
 * A child's target. "current + 8" made a child on 0 aim for 8 and one on 48
 * aim for 56: a programme for geniuses does not plan towards a pass.
 */
const RESULTS_GRADE_BANDS = [85, 90, 95, 100];
/* NGG raises geniuses: no target is below 85%, whoever sets it (the draft,
   the child, the mentor). Above 85, the next band at least 5 points up. */
const RESULTS_TARGET_MIN = 85;
function results_target_for(?int $score): int {
    if ($score === null) return RESULTS_TARGET_MIN;
    foreach (RESULTS_GRADE_BANDS as $b) if ($b >= $score + 5) return $b;
    return 100;
}
/** The lowest target allowed for a subject: 85, or where the child already is. */
function results_target_floor(?int $current): int { return min(100, max(RESULTS_TARGET_MIN, (int)$current)); }

function member_results_plan_draft(array $p): array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $u = db_row('SELECT * FROM results_uploads WHERE uploadId = ? AND memberId = ? LIMIT 1', [(string)($p['uploadId'] ?? ''), (string)$m['memberId']]);
    if (!$u) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$u['status'] === 'draft') return ['ok' => false, 'error' => 'check_first'];
    $today = results_today();
    $existing = db_row('SELECT * FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [(string)$m['memberId'], (string)$u['term']]);
    if ($existing && empty($p['fresh'])) return ['ok' => true, 'plan' => results_plan_public($existing, $today, true), 'existing' => true];
    if ($existing && (string)$existing['status'] !== 'draft') return ['ok' => false, 'error' => 'already_sent'];

    $subjects = results_subjects_of((string)$u['uploadId'], results_last_scores((string)$m['memberId'], (string)$u['term']));
    $kpis = results_kpis($subjects);
    $focus = results_focus($subjects);
    $items = [];
    foreach ($focus as $s) {
        $method = results_default_method($s['name']);
        $items[] = ['subject' => $s['name'], 'current' => $s['score'], 'target' => results_target_for($s['score']),
            'method' => $method, 'what' => results_default_what($s['name'], $method), 'whenWhere' => '', 'sessionsPerWeek' => results_sessions_for($s['score'], results_target_for($s['score'])), 'helper' => $s['score'] !== null && $s['score'] < 50 ? 'mentor' : 'self'];
    }
    $flags = [];
    foreach ($subjects as $s) {
        if ($s['change'] !== null && $s['change'] <= -10) $flags[] = "{$s['name']} dropped {$s['change']} points since last term.";
        if ($s['score'] !== null && $s['score'] === 0) $flags[] = "{$s['name']} shows 0. If that is not your real score, fix it before you send.";
        elseif ($s['score'] !== null && $s['score'] < 40) $flags[] = "{$s['name']} is below 40.";
    }
    $first = mp_first((string)$m['fullName']);
    $summary = $kpis['avg'] === null ? '' : "Your average is {$kpis['avg']}%" . ($kpis['change'] !== null ? ' (' . ($kpis['change'] >= 0 ? '+' : '') . $kpis['change'] . ' since last term)' : '')
        . ". Your strongest subject is {$kpis['best']['name']} at {$kpis['best']['score']}%"
        . (!empty($kpis['lowest']) && $kpis['lowest']['name'] !== $kpis['best']['name'] ? " and your lowest is {$kpis['lowest']['name']} at {$kpis['lowest']['score']}%" : '') . '. '
        . ($items ? 'This plan works on ' . implode(', ', array_map(static fn($i) => $i['subject'] . ' (' . ($i['current'] ?? '–') . '% → ' . $i['target'] . '%)', $items)) . '. Start with ' . $items[0]['subject'] . ' this week.' : '');
    $aiModel = '';
    if ($items) {
        $brief = ['firstName' => $first, 'average' => $kpis['avg'], 'change' => $kpis['change'],
            'subjects' => array_map(static fn($s) => ['name' => $s['name'], 'score' => $s['score'], 'last' => $s['last']], $subjects),
            'focus' => array_map(static fn($i) => ['subject' => $i['subject'], 'current' => $i['current'], 'target' => $i['target'], 'method' => $i['method']], $items)];
        /* The evaluation reads the numbers, not the child: "you're showing
           great dedication" was written for a card of zeros. It must name the
           strongest and weakest subjects with their scores, any subject that
           rose or fell by 5+ since last term, how far each focus subject is
           from 85, and one first step. No praise the numbers do not support. */
        $brief['target'] = RESULTS_TARGET_MIN;
        $brief['moves'] = array_values(array_filter(array_map(static fn($s) => $s['score'] !== null && $s['last'] !== null && abs($s['score'] - $s['last']) >= 5 ? ['name' => $s['name'], 'from' => $s['last'], 'to' => $s['score']] : null, $subjects)));
        $ai = ai_classify('You evaluate a Nigerian secondary-school student\'s term report and help them plan the next term. Every target is at least 85%. '
            . 'Write "summary": 3 short sentences to the student ("you"), built ONLY from the numbers given: (1) the average and the strongest subject with its score; '
            . '(2) the subject(s) that rose or fell by 5+ points since last term (with the numbers), or the weakest subject with its score if none moved; '
            . '(3) which focus subjects this plan works on and how far each is from 85, and what to do first this week. '
            . 'Praise effort and method, never intelligence; do not praise anything the numbers do not show; no emoji; never compare with other children. '
            . 'Then one concrete "what" line per focus subject: what they will actually do in one session, specific to that subject (e.g. "Do 10 past WAEC simultaneous-equation questions without notes, then mark them"). '
            . 'Keep each focus subject and method exactly as given. Methods: retrieval (test yourself, R1), spaced (spread it out, R1), worked (worked examples, R2), interleave (mix problem types, R2), selfexplain (explain it to yourself, R2). '
            . 'JSON: {"summary":"...","items":[{"subject":"...","what":"..."}]}', json_encode($brief, JSON_UNESCAPED_UNICODE), 900, 'coach');
        if (!empty($ai['ok']) && is_array($ai['data'])) {
            $sum = trim((string)($ai['data']['summary'] ?? ''));
            if ($sum !== '' && mb_strlen($sum) <= 600) { $summary = $sum; $aiModel = (string)($ai['provider'] ?? 'ai'); }
            foreach ((array)($ai['data']['items'] ?? []) as $ai_i) {
                foreach ($items as &$it) {
                    if (strcasecmp($it['subject'], (string)($ai_i['subject'] ?? '')) === 0) {
                        $w = trim((string)($ai_i['what'] ?? ''));
                        if ($w !== '' && mb_strlen($w) <= 300) { $it['what'] = $w; $aiModel = $aiModel ?: (string)($ai['provider'] ?? 'ai'); }
                    }
                }
                unset($it);
            }
        }
    }
    $now = now_iso();
    $planId = $existing ? (string)$existing['planId'] : results_id('GP');
    db_tx(function () use ($existing, $planId, $u, $m, $summary, $flags, $aiModel, $items, $now) {
        $row = ['summary' => $summary, 'flagsJson' => json_encode($flags, JSON_UNESCAPED_UNICODE), 'aiModel' => $aiModel,
            'aiPromptVersion' => RESULTS_PROMPT_VERSION, 'status' => 'draft', 'updatedAt' => $now];
        if ($existing) {
            db_update('growth_plans', $row, ['id' => (int)$existing['id']]);
            db_exec('DELETE FROM growth_plan_items WHERE planId = ?', [$planId]);
        } else {
            db_insert('growth_plans', $row + ['planId' => $planId, 'uploadId' => (string)$u['uploadId'], 'memberId' => (string)$m['memberId'],
                'term' => (string)$u['term'], 'recipientsJson' => json_encode(['family' => false]), 'createdAt' => $now]);
        }
        foreach ($items as $i => $it) db_insert('growth_plan_items', $it + ['itemId' => results_id('GI'), 'planId' => $planId, 'position' => $i]);
    });
    results_log((string)$m['memberId'], (string)$u['term'], ['id' => '', 'name' => $aiModel !== '' ? 'Drafted by AI' : 'NGG', 'role' => 'system'],
        'Drafted a plan for ' . (implode(', ', array_column($items, 'subject')) ?: 'no subjects'), 'draft');
    return ['ok' => true, 'plan' => results_plan_public(db_row('SELECT * FROM growth_plans WHERE planId = ?', [$planId]), results_today(), true)];
}

/** Validate a plan's items as written by the member. Returns [items, error]. */
function results_items_clean(array $in, array $scores): array {
    $out = []; $seen = [];
    foreach ($in as $it) {
        if (!is_array($it)) continue;
        $subject = results_clean_subject((string)($it['subject'] ?? ''));
        $k = mb_strtolower($subject);
        if ($subject === '' || isset($seen[$k])) continue;
        if (!array_key_exists($k, $scores)) return [null, ['error' => 'unknown_subject', 'subject' => $subject]];
        $seen[$k] = true;
        $method = (string)($it['method'] ?? '');
        if (!isset(RESULTS_METHODS[$method])) return [null, ['error' => 'bad_method', 'subject' => $subject]];
        $helper = (string)($it['helper'] ?? 'self');
        if (!isset(RESULTS_HELPERS[$helper])) $helper = 'self';
        $cur = $scores[$k];
        $target = (int)($it['target'] ?? 0);
        if ($target < 0 || $target > 100) return [null, ['error' => 'bad_target', 'subject' => $subject]];
        if ($cur !== null && $target < $cur) return [null, ['error' => 'target_below_current', 'subject' => $subject]];
        if ($target < results_target_floor($cur)) return [null, ['error' => 'target_too_low', 'subject' => $subject, 'min' => results_target_floor($cur)]];
        $spw = (int)($it['sessionsPerWeek'] ?? 3);
        if ($spw < 1 || $spw > 7) return [null, ['error' => 'bad_sessions', 'subject' => $subject]];
        $out[] = ['subject' => $subject, 'current' => $cur, 'target' => $target, 'method' => $method,
            'what' => mb_substr(trim((string)($it['what'] ?? '')), 0, 400),
            'whenWhere' => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($it['whenWhere'] ?? ''))), 0, 200),
            'sessionsPerWeek' => $spw, 'helper' => $helper];
    }
    if (count($out) > RESULTS_MAX_FOCUS) return [null, ['error' => 'too_many_subjects', 'max' => RESULTS_MAX_FOCUS]];
    return [$out, null];
}

function results_own_plan(array $p, ?array &$m): ?array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return null;
    return db_row('SELECT * FROM growth_plans WHERE planId = ? AND memberId = ? LIMIT 1', [(string)($p['planId'] ?? ''), (string)$m['memberId']]);
}

/** member.results.plan.save — keep the member's edits to a draft. */
function member_results_plan_save(array $p): array {
    $m = null;
    $plan = results_own_plan($p, $m);
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$plan['status'] !== 'draft') return ['ok' => false, 'error' => 'already_sent'];
    $scores = [];
    foreach (db_all('SELECT subject, score FROM results_subjects WHERE uploadId = ?', [(string)$plan['uploadId']]) as $r) $scores[mb_strtolower((string)$r['subject'])] = $r['score'] === null ? null : (int)$r['score'];
    [$items, $err] = results_items_clean(is_array($p['items'] ?? null) ? $p['items'] : [], $scores);
    if ($err) return ['ok' => false] + $err;
    if (!$items) return ['ok' => false, 'error' => 'no_items'];
    $habit = mb_substr(trim((string)($p['habit'] ?? '')), 0, 200);
    $fam = !empty(($p['recipients'] ?? [])['family']);
    /* An item keeps its id for as long as its subject stays in the plan, so a
     * tick, a note or an open screen never points at a row that was rewritten. */
    $ids = [];
    foreach (db_all('SELECT itemId, subject FROM growth_plan_items WHERE planId = ?', [(string)$plan['planId']]) as $r) $ids[mb_strtolower((string)$r['subject'])] = (string)$r['itemId'];
    db_tx(function () use ($plan, $items, $habit, $fam, $p, $ids) {
        db_exec('DELETE FROM growth_plan_items WHERE planId = ?', [(string)$plan['planId']]);
        foreach ($items as $i => $it) db_insert('growth_plan_items', $it + ['itemId' => $ids[mb_strtolower($it['subject'])] ?? results_id('GI'), 'planId' => (string)$plan['planId'], 'position' => $i]);
        db_update('growth_plans', ['habit' => $habit, 'recipientsJson' => json_encode(['family' => $fam]),
            'committed' => !empty($p['committed']) ? 1 : 0, 'updatedAt' => now_iso()], ['id' => (int)$plan['id']]);
    });
    return ['ok' => true, 'plan' => results_plan_public(db_row('SELECT * FROM growth_plans WHERE id = ?', [(int)$plan['id']]), results_today(), true)];
}

/** The member's mentor (member row of the mentor) — the approver. */
function results_mentor_of(string $memberId): ?array {
    $a = db_row("SELECT a.mentorId, t.memberId mentorMember, t.fullName, t.email FROM mentor_assignments a LEFT JOIN mentors t ON t.mentorId = a.mentorId
                 WHERE a.memberId = ? AND a.status = 'active' ORDER BY a.id DESC LIMIT 1", [$memberId]);
    return $a ?: null;
}

/** The instructors who teach this member: active instructor volunteers at their centre whose courses include their track. */
function results_instructors_of(array $m): array {
    $out = [];
    $centre = (string)$m['centre']; $track = (string)$m['track'];
    if ($centre === '') return [];
    foreach (db_all("SELECT volunteerId, fullName, email, courses FROM volunteers WHERE status = 'active' AND role = 'instructor' AND centre = ?", [$centre]) as $v) {
        $courses = json_decode((string)$v['courses'], true) ?: [];
        if ($track !== '' && $courses && !in_array($track, array_map('strval', $courses), true)) continue;
        $mem = db_row('SELECT memberId, email FROM members WHERE (memberId = ? OR (email <> \'\' AND lower(email) = lower(?))) LIMIT 1', [(string)$v['volunteerId'], (string)$v['email']]);
        if ($mem) $out[] = $mem;
    }
    return $out;
}

/**
 * member.results.plan.send — the plan leaves the member. Needs every item's
 * "when and where" (R3) and the commitment ticked. It goes to the mentor for
 * approval and to the instructors to read; the family waits for approval.
 */
function member_results_plan_send(array $p): array {
    $m = null;
    $plan = results_own_plan($p, $m);
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$plan['status'] !== 'draft') return ['ok' => false, 'error' => 'already_sent'];
    // Save first if the client sent its latest edits with the send.
    if (is_array($p['items'] ?? null)) {
        $r = member_results_plan_save($p);
        if (empty($r['ok'])) return $r;
        $plan = db_row('SELECT * FROM growth_plans WHERE id = ?', [(int)$plan['id']]);
    }
    $items = results_plan_items((string)$plan['planId']);
    if (!$items) return ['ok' => false, 'error' => 'no_items'];
    $noWhen = array_values(array_map(static fn($i) => $i['subject'], array_filter($items, static fn($i) => mb_strlen(trim($i['whenWhere'])) < 4)));
    if ($noWhen) return ['ok' => false, 'error' => 'when_required', 'subjects' => $noWhen];
    $noWhat = array_values(array_map(static fn($i) => $i['subject'], array_filter($items, static fn($i) => trim($i['what']) === '')));
    if ($noWhat) return ['ok' => false, 'error' => 'what_required', 'subjects' => $noWhat];
    if (!(int)$plan['committed']) return ['ok' => false, 'error' => 'commit_required'];
    $now = now_iso();
    db_tx(function () use ($plan, $now) {
        db_update('growth_plans', ['status' => 'sent', 'sentAt' => $now, 'returnNote' => '', 'updatedAt' => $now], ['id' => (int)$plan['id']]);
        db_update('results_uploads', ['status' => 'sent', 'sentAt' => $now, 'updatedAt' => $now], ['uploadId' => (string)$plan['uploadId']]);
    });
    $first = mp_first((string)$m['fullName']);
    $t = results_term_parse((string)$plan['term']);
    $mentor = results_mentor_of((string)$m['memberId']);
    $told = [];
    if ($mentor && (string)$mentor['mentorMember'] !== '') {
        notify_people([['memberId' => (string)$mentor['mentorMember'], 'email' => (string)$mentor['email']]], ['kind' => 'mentor',
            'title' => "{$first} sent their results and plan", 'body' => ($t['label'] ?? '') . ': read it and approve it so it goes live.',
            'linkPage' => 'mentor', 'eyebrow' => 'NGG Mentor Portal', 'ctaPath' => '/mentor?tab=results', 'ctaLabel' => 'Open the plan →']);
        $told[] = 'mentor';
    }
    $instr = results_instructors_of($m);
    foreach ($instr as $i) push_notification((string)$i['memberId'], ['kind' => 'teaching', 'title' => "{$first} sent their school results",
        'body' => ($t['label'] ?? '') . ' · their plan is with their mentor.', 'linkPage' => 'instructor']);
    if ($instr) $told[] = 'instructor';
    results_log((string)$m['memberId'], (string)$plan['term'], results_actor_member($m),
        'Sent the results and plan to ' . (implode(' and ', $told) ?: 'the NGG team') . ($mentor ? '' : ' (no mentor assigned yet)'), 'send');
    return ['ok' => true, 'status' => 'sent', 'mentor' => $mentor ? staff_public_name((string)$mentor['mentorId'], 'your mentor') : '', 'instructors' => count($instr)];
}

/** member.results.tick — one session done (or undone) this week, for one plan item. */
function member_results_tick(array $p): array {
    $m = results_member((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $it = db_row('SELECT i.*, g.memberId, g.status planStatus, g.term FROM growth_plan_items i JOIN growth_plans g ON g.planId = i.planId WHERE i.itemId = ? LIMIT 1',
                 [(string)($p['itemId'] ?? '')]);
    if (!$it || (string)$it['memberId'] !== (string)$m['memberId']) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array((string)$it['planStatus'], ['sent', 'live'], true)) return ['ok' => false, 'error' => 'plan_not_live'];
    $today = results_today();
    $ws = results_week_start($today);
    // Last week may still be ticked on Monday; nothing older and nothing ahead.
    $want = (string)($p['weekStart'] ?? $ws);
    $prev = gmdate('Y-m-d', strtotime($ws . 'T00:00:00Z') - 7 * 86400);
    if ($want !== $ws && !($want === $prev && (int)gmdate('N', strtotime($today . 'T00:00:00Z')) === 1)) return ['ok' => false, 'error' => 'week_closed'];
    $planned = max(1, (int)$it['sessionsPerWeek']);
    $delta = (int)($p['delta'] ?? 1) >= 0 ? 1 : -1;
    $row = db_row('SELECT * FROM plan_checkins WHERE itemId = ? AND weekStart = ? LIMIT 1', [(string)$it['itemId'], $want]);
    $done = max(0, min($planned, (int)($row['done'] ?? 0) + $delta));
    if ($row) db_update('plan_checkins', ['done' => $done, 'planned' => $planned, 'updatedAt' => now_iso()], ['id' => (int)$row['id']]);
    else db_insert('plan_checkins', ['itemId' => (string)$it['itemId'], 'memberId' => (string)$m['memberId'], 'weekStart' => $want, 'done' => $done, 'planned' => $planned, 'updatedAt' => now_iso()]);
    return ['ok' => true, 'itemId' => (string)$it['itemId'], 'weekStart' => $want, 'done' => $done, 'planned' => $planned];
}

/* ── Staff reach ─────────────────────────────────────────────────────── */

/** May this staff gate read this member's results? Mentor: caseload. Instructor/admin: centres + courses. */
function results_staff_can(array $g, array $m): bool {
    $role = (string)($g['mpRole'] ?? $g['role'] ?? '');
    if (in_array($role, ['pod', 'peer', 'lead'], true)) return in_array((string)$m['memberId'], mp_caseload_ids($g), true);
    if (($g['centres'] ?? null) !== null && !in_array((string)$m['centre'], $g['centres'], true)) return false;
    if (($g['courses'] ?? null) !== null && !member_takes_any($m, $g['courses'])) return false;
    return true;
}
function results_staff_actor(array $g): array {
    return ['id' => (string)$g['member']['memberId'], 'name' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''),
        'role' => (string)($g['mpRole'] ?? $g['role'] ?? 'staff')];
}

/* ── Mentor ops ──────────────────────────────────────────────────────── */

/** member.mentor.plans — plans waiting for this mentor, and live plans that have stalled. */
function member_mp_plans(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $ids = mp_caseload_ids($g);
    if (!$ids) return ['ok' => true, 'waiting' => [], 'stalled' => [], 'live' => 0];
    $today = results_today();
    $cfg = results_attention_cfg();
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $waiting = []; $stalled = []; $live = 0;
    foreach (db_all("SELECT g.*, m.fullName FROM growth_plans g JOIN members m ON m.memberId = g.memberId
                     WHERE g.memberId IN ($ph) AND g.status IN ('sent','live') ORDER BY g.sentAt", $ids) as $r) {
        $row = ['planId' => (string)$r['planId'], 'subjectId' => (string)$r['memberId'], 'name' => (string)$r['fullName'],
            'term' => (string)$r['term'], 'termLabel' => results_term_parse((string)$r['term'])['label'] ?? '', 'sentAt' => (string)$r['sentAt']];
        if ((string)$r['status'] === 'sent') { $waiting[] = $row + ['days' => mp_days(substr((string)$r['sentAt'], 0, 10), $today)]; continue; }
        $live++;
        $adh = results_adherence(results_plan_items((string)$r['planId']), (string)$r['sentAt'], $today);
        if ($adh !== null && $adh < $cfg['minAdh']) $stalled[] = $row + ['adherence' => $adh];
    }
    return ['ok' => true, 'waiting' => $waiting, 'stalled' => $stalled, 'live' => $live];
}

function results_staff_member(array $g, string $id): ?array {
    $m = results_member($id);
    return ($m && results_staff_can($g, $m)) ? $m : null;
}

/** member.mentor.plan — one mentee's term, for the mentor. */
function member_mp_plan(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $m = results_staff_member($g, (string)($p['subjectId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $today = results_today();
    $term = (string)($p['term'] ?? '');
    if (!results_term_parse($term)) {
        $last = db_row('SELECT term FROM results_uploads WHERE memberId = ? ORDER BY term DESC LIMIT 1', [(string)$m['memberId']]);
        $term = (string)($last['term'] ?? (results_terms($today, 1)[0]['key'] ?? ''));
    }
    return ['ok' => true, 'member' => ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName']],
        'canApprove' => ($g['mpRole'] ?? '') !== 'peer',
        'record' => results_record($m, $term, $today), 'history' => results_history((string)$m['memberId'], $term, 30)];
}

/** member.mentor.plan.approve — the plan goes live; a family who was chosen now hears about it. */
function member_mp_plan_approve(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (($g['mpRole'] ?? '') === 'peer') return ['ok' => false, 'error' => 'peer_cannot_approve'];
    $plan = db_row('SELECT * FROM growth_plans WHERE planId = ? LIMIT 1', [(string)($p['planId'] ?? '')]);
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    $m = results_staff_member($g, (string)$plan['memberId']);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$plan['status'] === 'live') return ['ok' => true, 'unchanged' => true];
    if ((string)$plan['status'] !== 'sent') return ['ok' => false, 'error' => 'not_waiting'];
    $actor = results_staff_actor($g);
    $now = now_iso();
    /* The mentor can adjust before approving: a target, how many sessions a
       week, what the child will do. Validated whole before any write; each
       change is logged and named to the child, so the plan stays theirs. */
    $changes = [];
    if (is_array($p['items'] ?? null) && $p['items']) {
        $byId = []; foreach (results_plan_items((string)$plan['planId']) as $it) $byId[(string)$it['itemId']] = $it;
        $edits = [];
        foreach ($p['items'] as $e) {
            if (!is_array($e) || !isset($byId[(string)($e['itemId'] ?? '')])) return ['ok' => false, 'error' => 'not_found'];
            $it = $byId[(string)$e['itemId']]; $row = [];
            if (array_key_exists('target', $e)) { $t = (int)$e['target'];
                if ($t < 0 || $t > 100 || ($it['current'] !== null && $t < (int)$it['current'])) return ['ok' => false, 'error' => 'bad_target', 'subject' => $it['subject']];
                if ($t < results_target_floor($it['current'] === null ? null : (int)$it['current'])) return ['ok' => false, 'error' => 'target_too_low', 'subject' => $it['subject'], 'min' => results_target_floor($it['current'] === null ? null : (int)$it['current'])];
                if ($t !== (int)$it['target']) { $row['target'] = $t; $changes[] = $it['subject'] . ' target ' . (int)$it['target'] . ' → ' . $t; } }
            if (array_key_exists('sessionsPerWeek', $e)) { $n = (int)$e['sessionsPerWeek'];
                if ($n < 1 || $n > 7) return ['ok' => false, 'error' => 'bad_sessions', 'subject' => $it['subject']];
                if ($n !== (int)$it['sessionsPerWeek']) { $row['sessionsPerWeek'] = $n; $changes[] = $it['subject'] . ' ' . $n . ' sessions a week'; } }
            if (array_key_exists('what', $e)) { $w = mb_substr(trim((string)$e['what']), 0, 400);
                if ($w === '') return ['ok' => false, 'error' => 'what_required', 'subject' => $it['subject']];
                if ($w !== (string)$it['what']) { $row['what'] = $w; $changes[] = $it['subject'] . ': what to do'; } }
            if ($row) $edits[(string)$e['itemId']] = $row;
        }
        foreach ($edits as $iid => $row) db_update('growth_plan_items', $row, ['itemId' => $iid]);
    }
    db_update('growth_plans', ['status' => 'live', 'approvedBy' => $actor['id'], 'approvedByName' => $actor['name'], 'approvedAt' => $now, 'updatedAt' => $now], ['id' => (int)$plan['id']]);
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 600);
    if ($note !== '') db_insert('plan_notes', ['planId' => (string)$plan['planId'], 'authorId' => $actor['id'], 'authorName' => $actor['name'], 'authorRole' => 'mentor', 'text' => $note, 'createdAt' => $now]);
    $first = mp_first((string)$m['fullName']);
    push_notification((string)$m['memberId'], ['kind' => 'mentor', 'title' => 'Your plan is approved', 'body' => staff_public_name($actor['id'], 'Your mentor') . ' approved your plan' . ($changes ? ', with a change: ' . implode('; ', array_slice($changes, 0, 3)) : '') . '.' . ($note !== '' ? ' “' . mb_substr($note, 0, 140) . '”' : ''), 'linkPage' => 'dashboard']);
    results_log((string)$m['memberId'], (string)$plan['term'], $actor, 'Approved the plan' . ($changes ? ' after changing ' . implode('; ', $changes) : '') . ($note !== '' ? ' with a note' : ''), 'approve');
    $family = 0;
    if (json_decode((string)$plan['recipientsJson'], true)['family'] ?? false) {
        $family = results_family_send($m, $plan, staff_public_name($actor['id'], mp_first($actor['name'])));
        if ($family) {
            db_update('growth_plans', ['familySentAt' => $now], ['id' => (int)$plan['id']]);
            results_log((string)$m['memberId'], (string)$plan['term'], ['id' => '', 'name' => 'NGG', 'role' => 'system'], "Shared the plan with {$family} family contact" . ($family === 1 ? '' : 's'), 'family');
        }
    }
    return ['ok' => true, 'status' => 'live', 'family' => $family, 'changed' => count($changes)];
}

/**
 * member.mentor.plan.cheer — on a live plan, the mentor sends the child a word
 * about how it is going (a nudge after a missed week, praise after a kept one).
 * It is on the plan's record and reaches the child as a notification.
 */
function member_mp_plan_cheer(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $plan = db_row('SELECT * FROM growth_plans WHERE planId = ? LIMIT 1', [(string)($p['planId'] ?? '')]);
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    $m = results_staff_member($g, (string)$plan['memberId']);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$plan['status'] !== 'live') return ['ok' => false, 'error' => 'not_live'];
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 600);
    if (mb_strlen($note) < 4) return ['ok' => false, 'error' => 'note_required'];
    $actor = results_staff_actor($g);
    db_insert('plan_notes', ['planId' => (string)$plan['planId'], 'authorId' => $actor['id'], 'authorName' => $actor['name'], 'authorRole' => 'mentor', 'text' => $note, 'createdAt' => now_iso()]);
    push_notification((string)$m['memberId'], ['kind' => 'mentor', 'title' => staff_public_name($actor['id'], 'Your mentor') . ' on your study plan', 'body' => '“' . mb_substr($note, 0, 160) . '”', 'linkPage' => 'dashboard']);
    results_log((string)$m['memberId'], (string)$plan['term'], $actor, 'Wrote about the plan: ' . mb_substr($note, 0, 120), 'note');
    return ['ok' => true];
}

/** The family mail: the plan and a conversation to have, not a score to police (R13). */
function results_family_send(array $m, array $plan, string $approver): int {
    if (!function_exists('family_guardian_emails')) return 0;
    $to = family_guardian_emails((string)$m['memberId'], 'weekly');
    if (!$to) return 0;
    $first = mp_first((string)$m['fullName']);
    $t = results_term_parse((string)$plan['term']);
    $rows = '';
    foreach (results_plan_items((string)$plan['planId']) as $it) {
        $rows .= '<li style="margin:0 0 8px"><b>' . esc_html($it['subject']) . '</b>: aiming for ' . (int)$it['target'] . ' (now ' . (int)$it['current'] . '). '
            . esc_html($it['what']) . ' <i>' . esc_html($it['whenWhere']) . '</i>, ' . (int)$it['sessionsPerWeek'] . ' times a week.</li>';
    }
    $html = '<p style="margin:0 0 10px">' . esc_html($first) . ' wrote a study plan for next term from their ' . esc_html(strtolower($t['label'] ?? 'term')) . ' results, and their mentor ' . esc_html($approver) . ' approved it.</p>'
        . '<ul style="margin:0 0 12px;padding-left:18px">' . $rows . '</ul>'
        . ((string)$plan['habit'] !== '' ? '<p style="margin:0 0 10px">The habit for the term: ' . esc_html((string)$plan['habit']) . '</p>' : '')
        . '<p style="margin:0 0 10px"><b>A conversation worth having this week:</b> ask ' . esc_html($first) . ' which subject they chose first and why, and when in the week they plan to do it. Interest in the plan helps more than checking the homework.</p>';
    $n = 0;
    foreach ($to as $addr) {
        if (function_exists('family_mail')) {
            family_mail($addr, "{$first}'s plan for next term", ['title' => "{$first}'s plan for next term", 'intro' => 'Approved by their mentor.',
                'bodyHtml' => $html, 'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family',
                'footNote' => 'You get this because ' . $first . ' chose to share the plan with family, and weekly updates are on in your family account.']);
            $n++;
        }
    }
    return $n;
}

/** member.mentor.plan.return — back to the member with a note; it is theirs to change. */
function member_mp_plan_return(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (($g['mpRole'] ?? '') === 'peer') return ['ok' => false, 'error' => 'peer_cannot_approve'];
    $plan = db_row('SELECT * FROM growth_plans WHERE planId = ? LIMIT 1', [(string)($p['planId'] ?? '')]);
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    $m = results_staff_member($g, (string)$plan['memberId']);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$plan['status'] !== 'sent') return ['ok' => false, 'error' => 'not_waiting'];
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 600);
    if (mb_strlen($note) < 4) return ['ok' => false, 'error' => 'note_required'];
    $actor = results_staff_actor($g);
    $now = now_iso();
    db_update('growth_plans', ['status' => 'draft', 'returnNote' => $note, 'committed' => 0, 'updatedAt' => $now], ['id' => (int)$plan['id']]);
    db_update('results_uploads', ['status' => 'checked', 'sentAt' => '', 'updatedAt' => $now], ['uploadId' => (string)$plan['uploadId']]);
    db_insert('plan_notes', ['planId' => (string)$plan['planId'], 'authorId' => $actor['id'], 'authorName' => $actor['name'], 'authorRole' => 'mentor', 'text' => $note, 'createdAt' => $now]);
    push_notification((string)$m['memberId'], ['kind' => 'mentor', 'title' => 'Your mentor sent your plan back', 'body' => '“' . mb_substr($note, 0, 160) . '”', 'linkPage' => 'dashboard']);
    results_log((string)$m['memberId'], (string)$plan['term'], $actor, 'Sent the plan back: ' . mb_substr($note, 0, 200), 'return');
    return ['ok' => true, 'status' => 'draft'];
}

/* ── Instructor ops ──────────────────────────────────────────────────── */

function results_instructor_gate(array $p): array {
    // As an instructor: someone who also holds a mentor record is still an instructor here.
    $g = mentor_gate(['as' => 'instructor'] + $p);
    if (empty($g['ok'])) return $g;
    if (!in_array((string)$g['role'], ['instructor', 'admin'], true)) return ['ok' => false, 'error' => 'forbidden_role'];
    return $g;
}

/**
 * School results are the MENTOR's (owner's decision, 2026-10-24): an
 * instructor teaches a course and does not read a child's school report.
 * The instructor.result* ops answer staff only; an instructor is refused with
 * `results_are_for_mentors`. The functions stay, so a staff reader and the
 * tests ($GLOBALS['__results_instructors']) still exercise them.
 */
function results_reader_gate(array $p): array {
    $g = results_instructor_gate($p); if (empty($g['ok'])) return $g;
    if ((string)$g['role'] === 'instructor' && empty($GLOBALS['__results_instructors'])) return ['ok' => false, 'error' => 'results_are_for_mentors'];
    return $g;
}

/** The NGG members an instructor teaches, as rows. One query. */
function results_class(array $g, string $q = ''): array {
    $where = "status = 'active' AND COALESCE(type,'NGG') <> 'Summer'"; $args = [];
    $centres = $g['centres'] ?? null; $courses = $g['courses'] ?? null;
    if ($centres !== null) {
        if (!$centres) return [];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')';
        $args = array_merge($args, $centres);
    }
    /* A member is in a course's class when it is one of their chosen courses
       (or, with none chosen, their track — any case). `track IN (…)` left out
       a member on Robotics as their SECOND course, and one whose track was
       typed "coding": the instructor could not see, mark or follow them. */
    if ($courses !== null) {
        if (!$courses) return [];
        $or = [];
        foreach ($courses as $c) {
            if (function_exists('member_course_sql')) { [$cs, $ca] = member_course_sql((string)$c); $or[] = $cs; $args = array_merge($args, $ca); }
            else { $or[] = 'lower(track) = lower(?)'; $args[] = (string)$c; }
        }
        $where .= ' AND (' . implode(' OR ', $or) . ')';
    }
    if ($q !== '') { $where .= ' AND lower(fullName) LIKE ?'; $args[] = '%' . mb_strtolower($q) . '%'; }
    return array_values(array_filter(db_all("SELECT memberId, fullName, displayId, centre, track, courses, role, dob, joinDate, createdAt FROM members WHERE $where ORDER BY fullName LIMIT 2000", $args), 'results_in_loop'));
}

/**
 * instructor.results — the class's results for a term, filtered and paged on
 * the server. Counts and KPIs are for the whole class, not the page.
 */
function instructor_results(array $p): array {
    $g = results_reader_gate($p); if (empty($g['ok'])) return $g;
    $today = results_today();
    $terms = results_terms($today);
    $term = (string)($p['term'] ?? '');
    if (!in_array($term, array_column($terms, 'key'), true)) $term = (string)($terms[0]['key'] ?? '');
    $t = results_term_parse($term);
    $filter = (string)($p['filter'] ?? 'all');
    if (!in_array($filter, ['all', 'attn', 'missing', 'up'], true)) $filter = 'all';
    $class = results_class($g, trim((string)($p['q'] ?? '')));
    $cfg = results_attention_cfg();
    $ids = array_column($class, 'memberId');
    $uploads = []; $plans = []; $subs = []; $acks = [];
    if ($ids) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT * FROM results_uploads WHERE term = ? AND memberId IN ($ph)", array_merge([$term], $chunk)) as $r) $uploads[(string)$r['memberId']] = $r;
            foreach (db_all("SELECT * FROM growth_plans WHERE term = ? AND memberId IN ($ph)", array_merge([$term], $chunk)) as $r) $plans[(string)$r['memberId']] = $r;
        }
        $uids = array_map(static fn($u) => (string)$u['uploadId'], array_values(array_filter($uploads, static fn($u) => (string)$u['status'] === 'sent')));
        foreach (array_chunk($uids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT uploadId, subject, score, lastScore FROM results_subjects WHERE uploadId IN ($ph)", $chunk) as $r)
                $subs[(string)$r['uploadId']][] = ['name' => (string)$r['subject'], 'score' => $r['score'] === null ? null : (int)$r['score'], 'last' => $r['lastScore'] === null ? null : (int)$r['lastScore']];
        }
        $pids = array_map(static fn($r) => (string)$r['planId'], array_values($plans));
        if ($pids) {
            $ph = implode(',', array_fill(0, count($pids), '?'));
            foreach (db_all("SELECT planId FROM plan_acks WHERE userId = ? AND planId IN ($ph)", array_merge([(string)$g['member']['memberId']], $pids)) as $r) $acks[(string)$r['planId']] = true;
        }
    }
    $rows = []; $counts = ['all' => 0, 'owed' => 0, 'attn' => 0, 'missing' => 0, 'up' => 0]; $changes = [];
    foreach ($class as $m) {
        $mid = (string)$m['memberId'];
        $owed = $t ? results_owed($m, $t) : false;
        $u = $uploads[$mid] ?? null;
        $uploaded = $u && (string)$u['status'] === 'sent';
        $k = $uploaded ? results_kpis($subs[(string)$u['uploadId']] ?? []) : ['avg' => null, 'change' => null];
        $pl = $plans[$mid] ?? null;
        $adh = ($uploaded && $pl && in_array((string)$pl['status'], ['sent', 'live'], true)) ? results_adherence(results_plan_items((string)$pl['planId']), (string)$pl['sentAt'], $today) : null;
        $attn = $uploaded && (($k['avg'] !== null && $k['avg'] < $cfg['minAvg']) || ($k['change'] !== null && $k['change'] <= -$cfg['dropPts']) || ($adh !== null && $adh < $cfg['minAdh']));
        /* A child who joined after the term ended owes nothing for it, but is
           still in the class: hiding them showed a new September class as
           "0 of 0" and an empty list, which read as a broken page. */
        $notDue = !$owed && !$uploaded;
        $counts['all']++;
        if (!$notDue) $counts['owed']++;
        if ($attn) $counts['attn']++;
        if ($notDue) {} elseif (!$uploaded) $counts['missing']++; else $counts['up']++;
        if ($k['change'] !== null) $changes[] = $k['change'];
        $status = $notDue ? 'not_due' : (!$uploaded ? ($u ? 'in_progress' : 'missing') : ((string)($pl['status'] ?? '') === 'live' ? 'live' : 'awaiting_mentor'));
        $row = ['studentId' => $mid, 'name' => (string)$m['fullName'], 'displayId' => (string)$m['displayId'], 'track' => (string)$m['track'],
            'avg' => $k['avg'], 'change' => $k['change'], 'adherence' => $adh, 'status' => $status, 'attention' => $attn, 'uploaded' => $uploaded,
            'seen' => $pl ? isset($acks[(string)$pl['planId']]) : false];
        if ($filter === 'attn' && !$attn) continue;
        if ($filter === 'missing' && ($uploaded || $notDue)) continue;
        if ($filter === 'up' && !$uploaded) continue;
        $rows[] = $row;
    }
    // Attention first, then the lowest average, then name: the order a teacher reads in.
    usort($rows, static fn($a, $b) => [!$a['attention'], $a['uploaded'] ? 0 : 1, $a['avg'] ?? 999, $a['name']] <=> [!$b['attention'], $b['uploaded'] ? 0 : 1, $b['avg'] ?? 999, $b['name']]);
    $cursor = max(0, (int)($p['cursor'] ?? 0));
    $page = array_slice($rows, $cursor, 20);
    return ['ok' => true, 'term' => $term, 'termLabel' => $t['label'] ?? '', 'dueOn' => $t['dueOn'] ?? '',
        'terms' => array_map(static fn($x) => ['key' => $x['key'], 'label' => $x['label']], $terms),
        'kpis' => ['class' => $counts['all'], 'owed' => $counts['owed'], 'uploaded' => $counts['up'], 'attention' => $counts['attn'], 'missing' => $counts['missing'],
            'avgChange' => $changes ? (int)round(array_sum($changes) / count($changes)) : null],
        'counts' => $counts, 'rows' => $page, 'total' => count($rows),
        'nextCursor' => $cursor + 20 < count($rows) ? $cursor + 20 : null, 'thresholds' => $cfg];
}

/** instructor.result — one member's term for an instructor, with reminders already sent. */
function instructor_result(array $p): array {
    $g = results_reader_gate($p); if (empty($g['ok'])) return $g;
    $m = results_staff_member($g, (string)($p['studentId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $term = (string)($p['term'] ?? '');
    if (!results_term_parse($term)) return ['ok' => false, 'error' => 'bad_term'];
    $rec = results_record($m, $term, results_today());
    // A sent report is the instructor's to read; a draft in progress is not.
    if ($rec['upload'] && $rec['upload']['status'] !== 'sent') { $rec['subjects'] = []; $rec['plan'] = null; $rec['kpis'] = results_kpis([]); }
    $reminders = array_map(static fn($r) => ['at' => (string)$r['at'], 'who' => (string)$r['actorName']],
        db_all("SELECT actorName, at FROM results_log WHERE memberId = ? AND term = ? AND kind = 'remind' ORDER BY id DESC LIMIT 10", [(string)$m['memberId'], $term]));
    $pl = $rec['plan'];
    $seen = $pl ? (bool)db_row('SELECT 1 FROM plan_acks WHERE planId = ? AND userId = ?', [$pl['planId'], (string)$g['member']['memberId']]) : false;
    return ['ok' => true, 'member' => ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'track' => (string)$m['track']],
        'record' => $rec, 'reminders' => $reminders, 'seen' => $seen, 'history' => results_history((string)$m['memberId'], $term, 30),
        'canRemind' => results_remind_wait((string)$m['memberId']) === 0];
}

/** Hours until another reminder may go (0 = now). One per 24h per member, whoever sends it. */
function results_remind_wait(string $memberId): int {
    $r = db_row("SELECT at FROM results_log WHERE memberId = ? AND kind = 'remind' ORDER BY id DESC LIMIT 1", [$memberId]);
    if (!$r) return 0;
    $left = RESULTS_REMIND_HOURS * 3600 - (time() - (strtotime((string)$r['at']) ?: 0));
    return $left > 0 ? (int)ceil($left / 3600) : 0;
}

/** instructor.result.note — a note to the mentor about this member's plan. */
function instructor_result_note(array $p): array {
    $g = results_reader_gate($p); if (empty($g['ok'])) return $g;
    $m = results_staff_member($g, (string)($p['studentId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $term = (string)($p['term'] ?? '');
    $plan = db_row('SELECT * FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [(string)$m['memberId'], $term]);
    if (!$plan || (string)$plan['status'] === 'draft') return ['ok' => false, 'error' => 'no_plan'];
    $text = mb_substr(trim((string)($p['text'] ?? '')), 0, 600);
    if (mb_strlen($text) < 4) return ['ok' => false, 'error' => 'note_required'];
    $actor = results_staff_actor($g);
    db_insert('plan_notes', ['planId' => (string)$plan['planId'], 'authorId' => $actor['id'], 'authorName' => $actor['name'], 'authorRole' => 'instructor', 'text' => $text, 'createdAt' => now_iso()]);
    $mentor = results_mentor_of((string)$m['memberId']);
    if ($mentor && (string)$mentor['mentorMember'] !== '') push_notification((string)$mentor['mentorMember'], ['kind' => 'mentor',
        'title' => 'A note from ' . mp_first($actor['name']) . ' about ' . mp_first((string)$m['fullName']), 'body' => mb_substr($text, 0, 200), 'linkPage' => 'mentor']);
    results_log((string)$m['memberId'], $term, $actor, 'Left a note for the mentor', 'note');
    return ['ok' => true, 'mentorTold' => (bool)$mentor];
}

/** instructor.result.seen — "I have read this." */
function instructor_result_seen(array $p): array {
    $g = results_reader_gate($p); if (empty($g['ok'])) return $g;
    $m = results_staff_member($g, (string)($p['studentId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $plan = db_row('SELECT planId, status FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [(string)$m['memberId'], (string)($p['term'] ?? '')]);
    if (!$plan || (string)$plan['status'] === 'draft') return ['ok' => false, 'error' => 'no_plan'];
    $uid = (string)$g['member']['memberId'];
    if (db_row('SELECT 1 FROM plan_acks WHERE planId = ? AND userId = ?', [(string)$plan['planId'], $uid])) return ['ok' => true, 'unchanged' => true];
    db_insert('plan_acks', ['planId' => (string)$plan['planId'], 'userId' => $uid, 'at' => now_iso()]);
    results_log((string)$m['memberId'], (string)($p['term'] ?? ''), results_staff_actor($g), 'Marked the results as seen', 'seen');
    return ['ok' => true];
}

/** instructor.result.remind — nudge a member whose results are still owed. One per day. */
function instructor_result_remind(array $p): array {
    $g = results_reader_gate($p); if (empty($g['ok'])) return $g;
    $m = results_staff_member($g, (string)($p['studentId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $term = (string)($p['term'] ?? '');
    $t = results_term_parse($term);
    if (!$t) return ['ok' => false, 'error' => 'bad_term'];
    $u = db_row('SELECT status FROM results_uploads WHERE memberId = ? AND term = ?', [(string)$m['memberId'], $term]);
    if ($u && (string)$u['status'] === 'sent') return ['ok' => false, 'error' => 'already_sent'];
    $wait = results_remind_wait((string)$m['memberId']);
    if ($wait > 0) return ['ok' => false, 'error' => 'rate_limited', 'retryHours' => $wait];
    $actor = results_staff_actor($g);
    push_notification((string)$m['memberId'], ['kind' => 'reminder', 'title' => 'Your ' . strtolower($t['label']) . ' results',
        'body' => staff_public_name($actor['id'], 'Your mentor') . ' asked for your results. Upload them in your dashboard → School results. It takes about three minutes.', 'linkPage' => 'dashboard']);
    results_log((string)$m['memberId'], $term, $actor, 'Sent a reminder to upload the results', 'remind');
    return ['ok' => true];
}

/* ── Background job ───────────────────────────────────────────────────── */

/**
 * Sunday: remind each member with a live plan to tick their week. Monday: tell
 * the mentor about plans below the adherence line. Weekly due nudge for
 * reports still owed, starting a week before the due date. Each send is keyed
 * in results_log so a 15-minute cron sends it once.
 */
function results_job_run(?string $today = null, int $limit = 200): array {
    $today = $today ?: results_today();
    $dow = (int)gmdate('N', strtotime($today . 'T00:00:00Z'));
    $ws = results_week_start($today);
    $sent = ['tick' => 0, 'stall' => 0, 'due' => 0];
    /* TWO CLOCKS, ONE COMPARISON.
       `$ws` is a date in the programme's own time zone (results_today() is
       Lagos, or whatever attendance_settings says); `results_log.at` is
       stamped in UTC by now_iso(). Comparing them as plain strings is wrong
       by the offset, and for the hour either side of a local Monday
       midnight it is wrong in the direction that matters: the row written a
       moment ago sorts BEFORE the week it belongs to, the guard does not
       see it, and a member gets the same reminder twice.
       So the boundary is converted to the instant `at` is measured against
       — local midnight expressed in UTC. */
    $wsAt = gmdate('Y-m-d\TH:i:s', strtotime($ws . 'T00:00:00Z') - (results_now_lagos() - time()));
    $once = static function (string $memberId, string $term, string $kind) use ($wsAt): bool {
        if (db_row('SELECT 1 FROM results_log WHERE memberId = ? AND kind = ? AND at >= ? LIMIT 1', [$memberId, $kind, $wsAt])) return false;
        return true;
    };
    $sys = ['id' => '', 'name' => 'NGG', 'role' => 'system'];
    if ($dow === 7) {
        foreach (db_all("SELECT g.planId, g.memberId, g.term FROM growth_plans g JOIN members m ON m.memberId = g.memberId
                         WHERE g.status IN ('sent','live') AND m.status = 'active' ORDER BY g.id LIMIT " . (int)$limit) as $r) {
            if (!$once((string)$r['memberId'], (string)$r['term'], 'job.tick')) continue;
            push_notification((string)$r['memberId'], ['kind' => 'reminder', 'title' => 'Tick your week', 'body' => 'How many study sessions did you do this week? Tick them in your dashboard → School results.', 'linkPage' => 'dashboard']);
            results_log((string)$r['memberId'], (string)$r['term'], $sys, 'Sunday reminder to tick the week', 'job.tick');
            $sent['tick']++;
        }
    }
    if ($dow === 1) {
        $cfg = results_attention_cfg();
        foreach (db_all("SELECT g.*, m.fullName FROM growth_plans g JOIN members m ON m.memberId = g.memberId WHERE g.status = 'live' AND m.status = 'active' ORDER BY g.id LIMIT " . (int)$limit) as $r) {
            $adh = results_adherence(results_plan_items((string)$r['planId']), (string)$r['sentAt'], $today);
            if ($adh === null || $adh >= $cfg['minAdh']) continue;
            if (!$once((string)$r['memberId'], (string)$r['term'], 'job.stall')) continue;
            $mentor = results_mentor_of((string)$r['memberId']);
            if ($mentor && (string)$mentor['mentorMember'] !== '') push_notification((string)$mentor['mentorMember'], ['kind' => 'mentor',
                'title' => mp_first((string)$r['fullName']) . '’s plan has stalled', 'body' => "They have kept {$adh}% of their study sessions over the last weeks. Ask what got in the way.", 'linkPage' => 'mentor']);
            results_log((string)$r['memberId'], (string)$r['term'], $sys, "Told the mentor the plan has stalled ({$adh}%)", 'job.stall');
            $sent['stall']++;
        }
    }
    $t = results_terms($today, 1)[0] ?? null;
    if ($t && $dow === 6 && $today >= gmdate('Y-m-d', strtotime($t['dueOn'] . 'T00:00:00Z') - 7 * 86400)) {
        foreach (db_all("SELECT m.memberId, m.role, m.dob, m.joinDate, m.createdAt FROM members m WHERE m.status = 'active' AND COALESCE(m.type,'NGG') <> 'Summer'
                         AND NOT EXISTS (SELECT 1 FROM results_uploads u WHERE u.memberId = m.memberId AND u.term = ? AND u.status = 'sent')
                         ORDER BY m.memberId LIMIT " . (int)$limit, [$t['key']]) as $m) {
            if (!results_in_loop($m) || !results_owed($m, $t) || !$once((string)$m['memberId'], $t['key'], 'job.due')) continue;
            push_notification((string)$m['memberId'], ['kind' => 'reminder', 'title' => 'Your ' . strtolower($t['label']) . ' results',
                'body' => 'Upload them in your dashboard → School results by ' . gmdate('j F', strtotime($t['dueOn'])) . '. It takes about three minutes.', 'linkPage' => 'dashboard']);
            results_log((string)$m['memberId'], $t['key'], $sys, 'Reminder: results due', 'job.due');
            $sent['due']++;
        }
    }
    return $sent;
}
