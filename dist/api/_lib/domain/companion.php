<?php
/**
 * The companion: a weekly assessment of every NGG member, and what it tells them.
 *
 * Once a week the companion looks at the last four weeks of a member's record —
 * attendance (present, late, no sign-out, absent), the curriculum (done,
 * overdue, how well), and conduct (infractions, sanctions, fines owed) — and
 * says where they stand: on track, worth watching, or needing support.
 *
 * Two parts, deliberately separate:
 *  · THE RATING is rules, never the model. "At risk" decides which members a
 *    mentor calls this week, and that must be explainable line by line and
 *    reproducible — `reasons` says exactly why.
 *  · THE WORDS are the AI's when one is configured: a short, warm note in the
 *    second person with what went well and one or two concrete next steps.
 *    Only numbers and a first name reach the provider — never a surname, a
 *    contact, a centre or a free-text record. Without AI, the rules write it.
 *
 * Stored per member per week (`member_assessments`, migration 127), mailed to
 * the member and the parent on their record, shown on their dashboard, on the
 * staff board, and given to the Reflection Coach as context.
 */

const COMPANION_WINDOW_DAYS = 28;
const COMPANION_RATINGS = ['on_track', 'watch', 'at_risk'];
const COMPANION_BATCH_AI = 5;      // AI calls per tick — a tick runs after a page is served
const COMPANION_BATCH_RULES = 40;

/** The week an assessment belongs to: its Monday, on the programme's local clock. */
function companion_period(?string $today = null): string {
    $today = $today ?? attendance_today();
    $t = strtotime($today . ' 00:00:00 UTC');
    return gmdate('Y-m-d', $t - ((int)gmdate('N', $t) - 1) * 86400);
}

/** The facts, all counted over the last four weeks. Five queries, never one per day. */
function companion_metrics(array $m, ?string $today = null): array {
    $today = $today ?? attendance_today();
    $mid = (string)$m['memberId'];
    $from = gmdate('Y-m-d', strtotime($today . ' UTC') - COMPANION_WINDOW_DAYS * 86400);
    $rows = db_all('SELECT date, status, checkOutAt FROM attendance WHERE studentId = ? AND date >= ? AND date < ?', [$mid, $from, $today]);
    $present = count($rows);
    $late = count(array_filter($rows, static fn($r) => in_array((string)$r['status'], ['late'], true)));
    $noOut = count(array_filter($rows, static fn($r) => trim((string)$r['checkOutAt']) === ''));
    $days = 0;
    if (function_exists('member_programme_settings')) {
        $cal = member_programme_settings();
        if (!empty($cal['enabled'])) $days = count(programme_days_between($from, gmdate('Y-m-d', strtotime($today . ' UTC') - 86400), $cal));
    }
    $absent = max(0, $days - $present);
    $cur = function_exists('curriculum_for_member') ? curriculum_for_member($m) : ['total' => 0, 'completed' => 0, 'overdue' => 0, 'units' => []];
    $scores = array_values(array_filter(array_map(static fn($u) => $u['progress'] && $u['progress']['attempts'] > 0 ? (int)$u['progress']['bestPct'] : null, $cur['units']), static fn($x) => $x !== null));
    $doneRecent = (int)(db_row("SELECT COUNT(*) c FROM curriculum_progress WHERE memberId = ? AND status = 'completed' AND completedAt >= ?", [$mid, $from])['c'] ?? 0);
    $inf = [];
    foreach (db_all("SELECT kind, COUNT(*) c FROM infractions WHERE personId = ? AND date >= ? AND COALESCE(voidedAt,'') = '' GROUP BY kind", [$mid, $from]) as $r) $inf[(string)$r['kind']] = (int)$r['c'];
    $state = function_exists('policy_state') ? policy_state($mid, 'member') : ['state' => 'clear'];
    $owed = 0;
    if (function_exists('fees_balance')) { $full = db_row('SELECT * FROM members WHERE memberId = ?', [$mid]); if ($full) $owed = (int)(fees_balance($full)['payable'] ?? 0); }
    return [
        'from' => $from, 'to' => $today,
        'attendance' => ['programmeDays' => $days, 'present' => $present, 'late' => $late, 'noSignOut' => $noOut, 'absent' => $absent],
        'curriculum' => ['lessons' => (int)$cur['total'], 'completed' => (int)$cur['completed'], 'completedRecently' => $doneRecent,
                         'overdue' => (int)($cur['overdue'] ?? 0), 'avgScore' => $scores ? (int)round(array_sum($scores) / count($scores)) : null],
        'conduct' => ['infractions' => $inf, 'state' => (string)($state['state'] ?? 'clear'), 'finesOwed' => $owed],
    ];
}

/** The rating and its reasons — rules, so a mentor can see exactly why. */
function companion_rate(array $x): array {
    $a = $x['attendance']; $c = $x['curriculum']; $k = $x['conduct'];
    $risk = []; $watch = [];
    if (in_array($k['state'], ['suspended', 'evicted', 'dormant'], true)) $risk[] = 'conduct status: ' . $k['state'];
    if ($a['absent'] >= 2) $risk[] = $a['absent'] . ' programme days missed';
    elseif ($a['absent'] === 1) $watch[] = '1 programme day missed';
    if ($c['overdue'] >= 2) $risk[] = $c['overdue'] . ' assessments overdue';
    elseif ($c['overdue'] === 1) $watch[] = '1 assessment overdue';
    if ($a['late'] >= 2) $watch[] = 'late ' . $a['late'] . ' times';
    if ($a['noSignOut'] >= 2) $watch[] = 'no sign-out ' . $a['noSignOut'] . ' times';
    if ($c['avgScore'] !== null && $c['avgScore'] < 50) $watch[] = 'average check score ' . $c['avgScore'] . '%';
    if ($k['finesOwed'] > 0) $watch[] = 'fines owed ₦' . number_format($k['finesOwed']);
    $rating = $risk ? 'at_risk' : (count($watch) >= 2 ? 'at_risk' : ($watch ? 'watch' : 'on_track'));
    return ['rating' => $rating, 'reasons' => array_merge($risk, $watch)];
}

/** What went well, from the facts alone — the rules' half of the note. */
function companion_rules_note(string $first, array $x, array $rate): array {
    $a = $x['attendance']; $c = $x['curriculum'];
    $strengths = [];
    if ($a['programmeDays'] > 0 && $a['absent'] === 0) $strengths[] = 'You were at every session in the last four weeks.';
    if ($a['present'] > 0 && $a['late'] === 0) $strengths[] = 'Not late once.';
    if ($c['completedRecently'] > 0) $strengths[] = 'You finished ' . $c['completedRecently'] . ' lesson' . ($c['completedRecently'] === 1 ? '' : 's') . ' recently.';
    if ($c['avgScore'] !== null && $c['avgScore'] >= 75) $strengths[] = 'Your check scores average ' . $c['avgScore'] . '%.';
    $focus = [];
    if ($c['overdue'] > 0) $focus[] = 'Open your Curriculum and finish the ' . $c['overdue'] . ' overdue assessment' . ($c['overdue'] === 1 ? '' : 's') . ' this week.';
    if ($a['late'] > 0) $focus[] = 'Aim to arrive ten minutes before resumption this week.';
    if ($a['noSignOut'] > 0) $focus[] = 'Stay to closing time and sign out at the desk, every session.';
    if ($a['absent'] > 0) $focus[] = 'Be at the next session — and if you cannot, tell your mentor before it starts.';
    if (!$focus) $focus[] = 'Keep the same rhythm, and pick one lesson to do better than last time.';
    $summary = match ($rate['rating']) {
        'on_track' => "{$first}, you are on track. Keep going.",
        'watch'    => "{$first}, a good few weeks with one or two things to tighten up.",
        default    => "{$first}, the last few weeks have been hard going. Your mentor will check in — and here is where to start.",
    };
    return ['summary' => $summary, 'strengths' => array_slice($strengths, 0, 3), 'focus' => array_slice($focus, 0, 2)];
}

/** The AI's note, from numbers and a first name only — or null to use the rules'. */
function companion_ai_note(string $first, array $x, array $rate): ?array {
    if (!function_exists('ai_classify')) return null;
    $facts = json_encode(['firstName' => $first, 'rating' => $rate['rating'], 'reasons' => $rate['reasons'],
        'attendance' => $x['attendance'], 'curriculum' => $x['curriculum'],
        'conduct' => ['infractions' => $x['conduct']['infractions'], 'state' => $x['conduct']['state'], 'finesOwed' => $x['conduct']['finesOwed']]], JSON_UNESCAPED_UNICODE);
    $r = ai_classify("You are the NGG companion: a warm, honest mentor's voice for a young person aged 10–17 in a year-round character and skills programme. "
        . "From the four-week facts given, write to them in the second person. Be specific to the numbers; never invent facts; never mention money amounts; "
        . "never shame. Return JSON {summary: string (2 short sentences), strengths: [up to 3 short strings, only things the facts support], "
        . "focus: [1 or 2 concrete next steps for this week, each under 20 words]}.", $facts, 400, 'coach');
    $d = $r['data'] ?? null;
    if (empty($r['ok']) || !is_array($d) || trim((string)($d['summary'] ?? '')) === '') return null;
    $list = static fn($v) => array_values(array_slice(array_filter(array_map(static fn($s) => mb_substr(trim((string)$s), 0, 200), is_array($v) ? $v : []), 'strlen'), 0, 3));
    $focus = array_slice($list($d['focus'] ?? []), 0, 2);
    return ['summary' => mb_substr(trim((string)$d['summary']), 0, 500), 'strengths' => $list($d['strengths'] ?? []), 'focus' => $focus ?: ['Keep the same rhythm this week.']];
}

/** Assess one member for a week, storing it. `force` rewrites an existing week. */
function companion_assess(array $m, ?string $period = null, bool $force = false): array {
    $period = $period ?? companion_period();
    $mid = (string)$m['memberId'];
    $have = db_row('SELECT * FROM member_assessments WHERE memberId = ? AND period = ?', [$mid, $period]);
    if ($have && !$force) return $have;
    $x = companion_metrics($m);
    $rate = companion_rate($x);
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'Friend';
    $note = companion_ai_note($first, $x, $rate);
    $source = $note ? 'ai' : 'rules';
    $note = $note ?? companion_rules_note($first, $x, $rate);
    $row = ['memberId' => $mid, 'period' => $period, 'rating' => $rate['rating'], 'reasons' => json_encode($rate['reasons'], JSON_UNESCAPED_UNICODE),
            'metrics' => json_encode($x, JSON_UNESCAPED_UNICODE), 'summary' => $note['summary'],
            'strengths' => json_encode($note['strengths'], JSON_UNESCAPED_UNICODE), 'focus' => json_encode($note['focus'], JSON_UNESCAPED_UNICODE),
            'source' => $source, 'createdAt' => now_iso()];
    if ($have) db_update('member_assessments', $row, ['id' => (int)$have['id']]);
    else { try { db_insert('member_assessments', $row); } catch (\Throwable $e) { if (!attendance_is_dup($e)) throw $e; } }
    return db_row('SELECT * FROM member_assessments WHERE memberId = ? AND period = ?', [$mid, $period]);
}

function companion_public(?array $r): ?array {
    if (!$r) return null;
    $j = static fn($v) => json_decode((string)$v, true) ?: [];
    return ['period' => (string)$r['period'], 'rating' => (string)$r['rating'], 'reasons' => $j($r['reasons']), 'metrics' => $j($r['metrics']),
            'summary' => (string)$r['summary'], 'strengths' => $j($r['strengths']), 'focus' => $j($r['focus']),
            'source' => (string)$r['source'], 'createdAt' => (string)$r['createdAt']];
}

/**
 * The weekly sweep: assess every active NGG member once for the week, and
 * mail them. Bounded per tick (fewer when the AI writes, since each is a call).
 */
function companion_weekly_run(?string $today = null, ?int $limit = null): array {
    if ((setting_raw('companion_enabled') ?? '1') === '0') return ['assessed' => 0, 'skipped' => 'disabled'];
    $period = companion_period($today);
    $limit = $limit ?? (function_exists('ai_enabled') && ai_enabled('coach') ? COMPANION_BATCH_AI : COMPANION_BATCH_RULES);
    $members = db_all("SELECT m.* FROM members m WHERE COALESCE(m.type,'NGG') <> 'Summer' AND m.status = 'active'
                       AND NOT EXISTS (SELECT 1 FROM member_assessments a WHERE a.memberId = m.memberId AND a.period = ?)
                       ORDER BY m.id LIMIT " . (int)$limit, [$period]);
    $n = 0;
    foreach ($members as $m) {
        $r = companion_assess($m, $period);
        if ($r) { companion_mail($m, $r); $n++; }
    }
    return ['assessed' => $n, 'period' => $period];
}

function companion_mail(array $m, array $r): void {
    if (trim((string)($r['mailedAt'] ?? '')) !== '') return;
    $to = [];
    foreach ([(string)($m['email'] ?? ''), (string)($m['parentEmail'] ?? '')] as $e) {
        $e = strtolower(trim($e));
        if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL) && !in_array($e, $to, true)) $to[] = $e;
    }
    db_update('member_assessments', ['mailedAt' => now_iso()], ['id' => (int)$r['id']]);
    if (!$to) return;
    $a = companion_public($r);
    $li = static fn($xs) => implode('', array_map(static fn($s) => '<li style="margin:0 0 6px">' . esc_html($s) . '</li>', $xs));
    $label = ['on_track' => 'On track', 'watch' => 'Keep an eye on', 'at_risk' => 'Needs support'][$a['rating']] ?? 'Your week';
    $body = '<p style="margin:0 0 12px">' . esc_html($a['summary']) . '</p>'
          . ($a['strengths'] ? '<p style="margin:0 0 4px"><b>Going well</b></p><ul style="margin:0 0 12px;padding-left:18px">' . $li($a['strengths']) . '</ul>' : '')
          . '<p style="margin:0 0 4px"><b>This week</b></p><ul style="margin:0 0 12px;padding-left:18px">' . $li($a['focus']) . '</ul>';
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $html = email_template(['title' => 'Your week with NGG', 'eyebrow' => 'NGG Companion · ' . $label, 'intro' => 'Your weekly check-in from the NGG companion.',
        'bodyHtml' => $body, 'ctaLabel' => 'Open my companion →', 'ctaUrl' => $origin . '/dashboard/companion',
        'footNote' => 'Sent weekly to NGG members and the parent on their record.']);
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'Your';
    foreach ($to as $addr) @send_mail($addr, $first . ', your week with NGG — ' . strtolower($label), $html);
}

/* ── Ops ─────────────────────────────────────────────────────────────── */

/** member.companion — this week's assessment (made now if the sweep has not reached them), and the last eight. */
function member_companion(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m || !member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg_member'];
    $now = companion_assess($m);
    $hist = db_all('SELECT * FROM member_assessments WHERE memberId = ? ORDER BY period DESC LIMIT 8', [(string)$m['memberId']]);
    return ['ok' => true, 'current' => companion_public($now), 'history' => array_map('companion_public', $hist),
            'aiConfigured' => function_exists('ai_enabled') && ai_enabled('coach')];
}

/** admin.companion.board — who needs support this week, centre-scoped. */
function admin_companion_board(array $p): array {
    $g = admin_cap_gate_any($p, ['club', 'people', 'curriculum']); if (!$g['ok']) return $g;
    $period = companion_period();
    $scope = admin_centre_names_in_scope($g['requester']);
    $where = "a.period = ? AND COALESCE(m.type,'NGG') <> 'Summer' AND m.status = 'active'"; $args = [$period];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'period' => $period, 'rows' => [], 'counts' => [], 'scoped' => true];
        $where .= ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    $rating = (string)($p['rating'] ?? '');
    $rows = db_all("SELECT a.*, m.fullName, m.displayId, m.centre, m.track FROM member_assessments a JOIN members m ON m.memberId = a.memberId
                    WHERE $where" . (in_array($rating, COMPANION_RATINGS, true) ? ' AND a.rating = ?' : '') . "
                    ORDER BY CASE a.rating WHEN 'at_risk' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END, m.fullName LIMIT 500",
                    in_array($rating, COMPANION_RATINGS, true) ? array_merge($args, [$rating]) : $args);
    $counts = array_column(db_all("SELECT a.rating, COUNT(*) n FROM member_assessments a JOIN members m ON m.memberId = a.memberId WHERE $where GROUP BY a.rating", $args), 'n', 'rating');
    $total = (int)db_row("SELECT COUNT(*) c FROM members m WHERE COALESCE(m.type,'NGG') <> 'Summer' AND m.status = 'active'"
        . ($scope !== null ? ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')' : ''), $scope ?? [])['c'];
    return ['ok' => true, 'period' => $period, 'scoped' => $scope !== null, 'members' => $total,
            'counts' => array_map('intval', $counts) + ['on_track' => 0, 'watch' => 0, 'at_risk' => 0],
            'rows' => array_map(static fn($r) => ['memberId' => (string)$r['memberId'], 'fullName' => (string)$r['fullName'], 'displayId' => (string)$r['displayId'],
                'centre' => (string)$r['centre'], 'track' => (string)$r['track']] + companion_public($r), $rows)];
}

/** admin.companion.assess — re-assess members now (after a correction), capped, per-row verdicts. */
function admin_companion_assess(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'no_ids'];
    if (count($ids) > COMPANION_BATCH_RULES) return ['ok' => false, 'error' => 'too_many', 'max' => COMPANION_BATCH_RULES];
    $results = []; $applied = 0;
    foreach ($ids as $id) {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
        if (!$m || !member_is_ngg($m)) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_ngg_member']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)$m['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        companion_assess($m, null, true);
        $results[] = ['id' => $id, 'ok' => true]; $applied++;
    }
    audit('companion.assess', (string)$g['requester']['memberId'], '', ['count' => count($ids), 'applied' => $applied], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'results' => $results];
}

/** What the Reflection Coach is told about this young person this week — the focus only. */
function companion_coach_context(string $memberId): string {
    $r = db_row('SELECT focus, rating FROM member_assessments WHERE memberId = ? ORDER BY period DESC LIMIT 1', [$memberId]);
    if (!$r) return '';
    $focus = json_decode((string)$r['focus'], true) ?: [];
    return $focus ? ' CONTEXT (from their weekly companion check-in; use only to make your questions relevant, never quote it as a judgement): this week they are working on — ' . implode(' / ', array_map('strval', $focus)) . '.' : '';
}
