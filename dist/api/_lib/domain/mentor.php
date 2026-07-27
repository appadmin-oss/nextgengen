<?php
declare(strict_types=1);

/**
 * Mentor Portal — a signed-in member whose email is in the `mentors` table
 * (active) supervises a class/department and awards behaviour stars.
 *
 * Scope model (summer school): a mentor covers their centre, optionally narrowed
 * to a department (matched against the student's track). Stars are 1..3, capped
 * at ONE rating per student per day (whichever mentor gets there first), the
 * same ledger-guard shape used by volunteer_points. Each star also drops a
 * positive behaviour_logs row so it shows in the existing M&E trend for free.
 */

function mentor_gate(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]) : null;
    if (!$m) return ['ok' => false, 'error' => 'no_requester'];
    $mentor = !empty($m['email'])
        ? db_row("SELECT * FROM mentors WHERE lower(email) = lower(?) AND status = 'active' LIMIT 1", [(string)$m['email']])
        : null;
    if (!$mentor) return ['ok' => false, 'error' => 'not_a_mentor'];
    return ['ok' => true, 'member' => $m, 'mentor' => $mentor];
}

/** The mentor's class for today — students in their centre (+ department), each
 *  with today's star state so the portal can show what's already been given. */
function mentor_roster(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $mentor = $g['mentor'];
    $centre = trim((string)($mentor['centre'] ?? ''));
    $dept   = trim((string)($mentor['department'] ?? ''));
    $today  = gmdate('Y-m-d');

    $where = "status = 'active'"; $args = [];
    if ($centre !== '') { $where .= ' AND centre = ?'; $args[] = $centre; }
    if ($dept !== '')   { $where .= ' AND track = ?';  $args[] = $dept; }
    $rows = db_all("SELECT studentId, fullName, track, centre, photoUrl FROM summer_students WHERE $where ORDER BY fullName LIMIT 400", $args);

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
        'mentor' => ['name' => $mentor['fullName'], 'centre' => $centre, 'department' => $dept],
        'students' => $students];
}

/** Weekly V3 rating (Verbal · Vocal · Visual, each 1..5) for a student — one
 *  row per student per ISO-week period, upserted so a mentor can refine it
 *  during the week. Same-centre gate, mirroring mentor_star_give. */
function mentor_v3_rate(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $mentor = $g['mentor']; $me = $g['member'];
    $subjectId = (string)($p['subjectId'] ?? '');
    $verbal = (int)($p['verbal'] ?? 0); $vocal = (int)($p['vocal'] ?? 0); $visual = (int)($p['visual'] ?? 0);
    foreach (['verbal' => $verbal, 'vocal' => $vocal, 'visual' => $visual] as $v) if ($v < 1 || $v > 5) return ['ok' => false, 'error' => 'bad_score'];
    $s = db_row("SELECT studentId, centre FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (trim((string)$mentor['centre']) !== '' && (string)$s['centre'] !== (string)$mentor['centre']) return ['ok' => false, 'error' => 'not_your_centre'];
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
    $s = db_row("SELECT studentId, fullName, centre FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    // Permission: the student must be in the mentor's centre (their class).
    if (trim((string)$mentor['centre']) !== '' && (string)$s['centre'] !== (string)$mentor['centre']) return ['ok' => false, 'error' => 'not_your_centre'];
    $today = gmdate('Y-m-d');
    if (db_row("SELECT id FROM member_stars WHERE subjectId = ? AND date = ? LIMIT 1", [$subjectId, $today])) return ['ok' => false, 'error' => 'already_starred_today'];
    $cat = in_array(($p['category'] ?? ''), BEHAVIOUR_CATEGORIES, true) ? (string)$p['category'] : '';
    $note = substr(trim((string)($p['note'] ?? '')), 0, 300);
    db_insert('member_stars', [
        'subjectId' => $subjectId, 'subjectType' => 'student', 'givenById' => (string)$me['memberId'],
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
        $s = db_row("SELECT studentId, fullName, centre, cohortId FROM summer_students WHERE studentId = ? LIMIT 1", [$sid]);
        if (!$s) { $skipped++; $results[] = ['subjectId' => $sid, 'ok' => false, 'error' => 'not_found']; continue; }
        $mc = trim((string)$g['mentor']['centre']);
        if ($mc !== '' && (string)$s['centre'] !== $mc) { $skipped++; $results[] = ['subjectId' => $sid, 'ok' => false, 'error' => 'not_your_centre']; continue; }
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
            event_emit('behaviour.flagged', ['ref' => $logId, 'subject' => (string)$s['fullName'], 'subjectId' => $sid,
                'category' => $category, 'severity' => $severity, 'by' => (string)$g['mentor']['fullName']]);
        }
    }
    audit('mentor.bulk.award', (string)$g['member']['memberId'], '',
        ['count' => count($ids), 'awarded' => $awarded, 'logged' => $logged, 'skipped' => $skipped, 'preset' => $presetId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'awarded' => $awarded, 'logged' => $logged, 'skipped' => $skipped, 'results' => $results];
}
