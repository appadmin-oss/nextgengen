<?php
declare(strict_types=1);

/**
 * Volunteers — the approved roster behind the public /volunteer form.
 *
 * Lifecycle: registration lands in `applications` (kind='volunteer',
 * status 'new', admin notified by email + bus event) → admin reviews via
 * api/admin/volunteers.php → APPROVE mints the volunteer ID (VOL-YY-serial),
 * binds a check-in QR token (volunteers take attendance exactly like
 * students), creates the public profile behind /q/<token>, and delivers the
 * digital ID by email — plus SMS when the admin has it on
 * (volunteer_sms_notify setting; on by default once SMS creds exist).
 */

/* ── Hierarchy tiers — the volunteer analogue of centres (colour + code) ──── */

/** The tier for a lane role (admin|mentor|instructor). tierId is a stable
 *  slug so a rename/recolour by an admin never breaks the mapping. Falls back
 *  to a neutral default when no tier matches (custom roles, empty table). */
function vol_tier_for(string $role): array {
    $key = 'VT-' . strtolower(trim($role));
    $t = db_row("SELECT name, code, color FROM vol_tiers WHERE tierId = ? AND status = 'active' LIMIT 1", [$key]);
    if ($t) return $t;
    return ['name' => $role !== '' ? ucfirst($role) : 'Volunteer', 'code' => 'VOL', 'color' => '#00225F'];
}

/** Race-safe VOL-CODE-YY-serial allocator (mirrors card_display_id).
 *  The tier code sits inside the fixed VOL family: VOL-ADM-26-001. */
function volunteer_display_id(string $code = 'VOL'): string {
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code)) ?: 'VOL';
    $yy = gmdate('y');
    $prefix = 'VOL-' . $code . '-' . $yy . '-';
    $base = (int)(db_row('SELECT COUNT(*) c FROM volunteers WHERE volunteerId LIKE ?', [$prefix . '%'])['c'] ?? 0);
    for ($i = 1; $i <= 60; $i++) {
        $id = $prefix . str_pad((string)($base + $i), 3, '0', STR_PAD_LEFT);
        if (!db_row('SELECT id FROM volunteers WHERE volunteerId = ?', [$id])) return $id;
    }
    return $prefix . strtolower(rand_hex(3));
}

function admin_hierarchy_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    return ['ok' => true, 'tiers' => db_all("SELECT tierId, name, code, color, rank, status FROM vol_tiers ORDER BY rank, name")];
}

function admin_hierarchy_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $name = substr(trim((string)($d['name'] ?? '')), 0, 80);
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($d['code'] ?? '')));
    $color = (string)($d['color'] ?? '#00225F');
    if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name'];
    if (strlen($code) < 1 || strlen($code) > 4) return ['ok' => false, 'error' => 'bad_code'];
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) return ['ok' => false, 'error' => 'bad_color'];
    $id = (string)($d['tierId'] ?? '');
    $existing = $id !== '' ? db_row('SELECT * FROM vol_tiers WHERE tierId = ?', [$id]) : null;
    // The code is the printed ID prefix — unique across tiers.
    $clash = db_row('SELECT tierId FROM vol_tiers WHERE code = ? LIMIT 1', [$code]);
    if ($clash && (!$existing || $clash['tierId'] !== $id)) return ['ok' => false, 'error' => 'code_taken'];
    $row = ['name' => $name, 'code' => $code, 'color' => $color, 'rank' => (int)($d['rank'] ?? 0),
        'status' => in_array((string)($d['status'] ?? 'active'), ['active', 'archived'], true) ? (string)($d['status'] ?? 'active') : 'active',
        'updatedAt' => now_iso()];
    if ($existing) db_update('vol_tiers', $row, ['tierId' => $id]);
    else { $id = 'VT-' . strtolower(rand_hex(4)); db_insert('vol_tiers', $row + ['tierId' => $id, 'createdAt' => now_iso()]); }
    audit('hierarchy.upsert', $g['requester']['memberId'], $id, ['code' => $code], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'tierId' => $id];
}

function admin_hierarchy_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $n = db_exec('DELETE FROM vol_tiers WHERE tierId = ?', [(string)($p['tierId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('hierarchy.delete', $g['requester']['memberId'], (string)$p['tierId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Printable volunteer cards — the volunteer analogue of admin_cards_data.
 *  Each card is coloured by its tier and reuses the shared program block. */
function admin_volunteer_cards_data(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = "status = 'active' AND token != ''";
    $params = [];
    if (!empty($p['volunteerId'])) { $where .= ' AND volunteerId = ?'; $params[] = (string)$p['volunteerId']; }
    $rows = db_all("SELECT * FROM volunteers WHERE $where ORDER BY id ASC LIMIT 500", $params);
    $cards = [];
    foreach ($rows as $v) {
        $tier = vol_tier_for((string)$v['role']);
        $names = preg_split('/\s+/', trim((string)$v['fullName'])) ?: [''];
        $first = array_shift($names);
        $cards[] = [
            'volunteerId' => $v['volunteerId'],
            'firstName' => $first, 'surname' => implode(' ', $names),
            'role' => (string)$v['role'],
            'tier' => ['name' => $tier['name'], 'code' => $tier['code'], 'color' => $tier['color']],
            'displayId' => (string)$v['volunteerId'],
            'token' => (string)$v['token'],
            'photoUrl' => (string)$v['photoUrl'],
        ];
    }
    return ['ok' => true, 'cards' => $cards, 'program' => idcard_program()];
}

function volunteer_public(array $v, bool $withAttendance = false): array {
    $out = [
        'kind' => 'volunteer',
        'volunteerId' => $v['volunteerId'],
        'studentId' => $v['volunteerId'],   // lets the scanner/profile UIs reuse one shape
        'fullName' => $v['fullName'],
        'role' => $v['role'],
        'courses' => json_decode((string)($v['courses'] ?? ''), true) ?: [],
        'photoUrl' => (string)($v['photoUrl'] ?? ''),
        'status' => $v['status'],
        'safeguardingCleared' => (string)($v['safeguarding'] ?? 'pending') === 'cleared',
    ];
    if ($withAttendance) {
        $rows = db_all('SELECT date, checkInAt, method FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 60', [$v['volunteerId']]);
        $out['attendance'] = $rows;
        $out['attendanceCount'] = count($rows);
        $out += volunteer_ledger((string)$v['volunteerId']);
    }
    return $out;
}

/* ── Service ledger: sessions → hours → milestone certificates ────────────── */

const VOL_MILESTONES = [5, 10, 25, 50];

function volunteer_session_hours(): int {
    $h = (int)(setting_raw('volunteer_session_hours') ?: 4);
    return max(1, min(12, $h));
}

function volunteer_ledger(string $volunteerId): array {
    $sessions = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$volunteerId])['c'] ?? 0);
    $certs = db_all('SELECT certId, milestone, hours, issuedAt FROM volunteer_certs WHERE volunteerId = ? ORDER BY milestone', [$volunteerId]);
    return ['sessions' => $sessions, 'hours' => $sessions * volunteer_session_hours(), 'certificates' => $certs, 'game' => volunteer_game_state($volunteerId)];
}

/* ══════════════════════════════════════════════════════════════════════════
   Attendance-taker rotation + gamified attendance
   One volunteer per centre is on attendance duty each day — auto round-robin
   over active volunteers, overridable by an admin. Taking attendance earns
   points that drive levels, streaks and awards (emailed + shown in-app on the
   volunteer's digital ID). Policy: docs/attendance-webhook.md.
   ══════════════════════════════════════════════════════════════════════════ */

// Points economy. Values are deliberately generous + legible to teenagers/vols.
const DUTY_POINTS_ASSIGNED = 10;   // being trusted with the day's roll
const DUTY_POINTS_COMPLETE = 40;   // closing out the day's attendance
const DUTY_POINTS_PER_HEAD = 2;    // per student marked (capped)
const DUTY_POINTS_STREAK    = 15;  // per consecutive duty-day beyond the first
const DUTY_LEVELS = [
    ['level' => 1, 'at' => 0,    'name' => 'Recruit'],
    ['level' => 2, 'at' => 150,  'name' => 'Steward'],
    ['level' => 3, 'at' => 400,  'name' => 'Keeper'],
    ['level' => 4, 'at' => 800,  'name' => 'Marshal'],
    ['level' => 5, 'at' => 1500, 'name' => 'Vanguard'],
];
// Point milestones that mint an award (email + in-app), distinct from the
// session-count service certificates above.
const DUTY_AWARDS = [
    150  => 'Reliable Steward',
    400  => 'Roll Keeper',
    800  => 'Attendance Marshal',
    1500 => 'Vanguard of Order',
];

/** Centres that run attendance — distinct enrolled centres, sensible fallback. */
function attendance_centres(): array {
    $rows = db_all("SELECT DISTINCT centre FROM summer_students WHERE centre IS NOT NULL AND centre != '' ORDER BY centre");
    $list = array_values(array_filter(array_map(fn($r) => (string)$r['centre'], $rows)));
    if ($list) return $list;
    return ['Egbeda', 'Ayobo'];
}

/** Active, safeguarding-CLEARED volunteers eligible to take attendance, ordered
 *  stably (fair rotation). Screening is mandatory to run a roll around minors,
 *  so an unscreened (pending) volunteer is never auto-assigned. */
function attendance_duty_pool(): array {
    return db_all("SELECT volunteerId, fullName, email, role, safeguarding FROM volunteers
                   WHERE status = 'active' AND safeguarding = 'cleared' ORDER BY createdAt, volunteerId");
}

/** Epoch day number for a YYYY-MM-DD date — a stable, calendar-independent index. */
function _duty_day_index(string $date): int {
    $t = strtotime($date . ' 00:00:00 UTC');
    return $t === false ? 0 : intdiv($t, 86400);
}

/** Resolve (materialising once) the volunteer on duty for a centre on a date.
 *  Auto round-robin unless an admin has set an override row. */
function attendance_duty_for(string $date, string $centre): ?array {
    $date = substr(trim($date), 0, 12); $centre = trim($centre);
    if ($date === '' || $centre === '') return null;
    $row = db_row('SELECT * FROM attendance_duty WHERE date = ? AND centre = ? LIMIT 1', [$date, $centre]);
    if ($row) return _duty_hydrate($row);

    $pool = attendance_duty_pool();
    if (!$pool) return null;
    $centres = attendance_centres();
    $cIdx = array_search($centre, $centres, true); if ($cIdx === false) $cIdx = 0;
    // Offset by centre so different centres get different takers the same day,
    // then skip anyone already on duty elsewhere today (no double-booking) —
    // unless the pool is smaller than the number of centres, where reuse is
    // unavoidable and we fall back to the base pick.
    $n = count($pool);
    $already = array_column(db_all('SELECT volunteerId FROM attendance_duty WHERE date = ?', [$date]), 'volunteerId');
    $start = (_duty_day_index($date) + (int)$cIdx) % $n;
    $pick = $pool[$start];
    for ($k = 0; $k < $n; $k++) {
        $cand = $pool[($start + $k) % $n];
        if (!in_array((string)$cand['volunteerId'], $already, true)) { $pick = $cand; break; }
    }
    db_insert('attendance_duty', [
        'date' => $date, 'centre' => $centre, 'volunteerId' => (string)$pick['volunteerId'],
        'source' => 'auto', 'createdAt' => now_iso(),
    ]);
    volunteer_award_points((string)$pick['volunteerId'], 'duty_assigned', DUTY_POINTS_ASSIGNED, "On duty · {$centre}", $date);
    // Only notify for today/future assignments (don't email about backfilled past dates).
    if ($date >= gmdate('Y-m-d') && !empty($pick['email'])) {
        @send_mail((string)$pick['email'], "You're on attendance duty today — {$centre}", email_template([
            'title' => "You've got the roll today",
            'intro' => 'Hello ' . esc_html((string)$pick['fullName']) . " — you're the attendance vanguard for {$centre} today.",
            'bodyHtml' => '<p style="margin:0 0 10px">Check every learner in at arrival, then close out the roll before you leave. It keeps +' . DUTY_POINTS_COMPLETE . ' points and your streak alive.</p>',
        ]));
    }
    $row = db_row('SELECT * FROM attendance_duty WHERE date = ? AND centre = ? LIMIT 1', [$date, $centre]);
    return $row ? _duty_hydrate($row) : null;
}

function _duty_hydrate(array $row): array {
    $v = db_row('SELECT volunteerId, fullName, photoUrl, role FROM volunteers WHERE volunteerId = ? LIMIT 1', [$row['volunteerId']]);
    return [
        'date' => $row['date'], 'centre' => $row['centre'], 'source' => $row['source'],
        'completedAt' => $row['completedAt'] ?? '', 'takenCount' => (int)($row['takenCount'] ?? 0),
        'volunteerId' => $row['volunteerId'],
        'volunteer' => $v ? ['volunteerId' => $v['volunteerId'], 'fullName' => $v['fullName'], 'photoUrl' => $v['photoUrl'], 'role' => $v['role']] : null,
    ];
}

/** Record points to the ledger (idempotent per (vol,kind,date) for daily kinds). */
function volunteer_award_points(string $volunteerId, string $kind, int $points, string $note, string $date = ''): void {
    if ($date !== '' && in_array($kind, ['duty_assigned', 'duty_complete', 'duty_streak'], true)) {
        if (db_row('SELECT id FROM volunteer_points WHERE volunteerId = ? AND kind = ? AND date = ? LIMIT 1', [$volunteerId, $kind, $date])) return;
    }
    db_insert('volunteer_points', ['volunteerId' => $volunteerId, 'kind' => $kind, 'points' => $points, 'date' => $date, 'note' => substr($note, 0, 255), 'createdAt' => now_iso()]);
}

/** Derived game state: total points, level, duty-day streak, next award. */
function volunteer_game_state(string $volunteerId): array {
    $total = (int)(db_row('SELECT COALESCE(SUM(points),0) s FROM volunteer_points WHERE volunteerId = ?', [$volunteerId])['s'] ?? 0);
    $lvl = DUTY_LEVELS[0];
    foreach (DUTY_LEVELS as $L) { if ($total >= $L['at']) $lvl = $L; }
    $next = null; foreach (DUTY_LEVELS as $L) { if ($L['at'] > $total) { $next = $L; break; } }
    // Duty-day streak: consecutive dates with a completed duty ending today/yesterday.
    $days = array_map(fn($r) => (string)$r['date'], db_all("SELECT DISTINCT date FROM volunteer_points WHERE volunteerId = ? AND kind = 'duty_complete' AND date != '' ORDER BY date DESC", [$volunteerId]));
    $streak = 0; $cursor = null;
    foreach ($days as $d) {
        if ($cursor === null) { if ($d === gmdate('Y-m-d') || $d === gmdate('Y-m-d', time() - 86400)) { $streak = 1; $cursor = $d; } else break; }
        else { if ($d === gmdate('Y-m-d', strtotime($cursor . ' UTC') - 86400)) { $streak++; $cursor = $d; } else break; }
    }
    $awards = array_map(fn($r) => ['name' => $r['note'], 'at' => (int)$r['points'], 'date' => $r['createdAt']],
        db_all("SELECT note, points, createdAt FROM volunteer_points WHERE volunteerId = ? AND kind = 'award' ORDER BY id", [$volunteerId]));
    return [
        'points' => $total, 'level' => $lvl['level'], 'levelName' => $lvl['name'],
        'next' => $next ? ['level' => $next['level'], 'name' => $next['name'], 'at' => $next['at'], 'remaining' => $next['at'] - $total] : null,
        'streak' => $streak, 'awards' => $awards,
    ];
}

/** Award point-milestones once each — emailed + surfaced in-app on the ID. */
function volunteer_check_point_awards(array $v, int $before, int $after): array {
    $earned = [];
    foreach (DUTY_AWARDS as $at => $name) {
        if ($before < $at && $after >= $at) {
            if (db_row("SELECT id FROM volunteer_points WHERE volunteerId = ? AND kind = 'award' AND note = ? LIMIT 1", [$v['volunteerId'], $name])) continue;
            db_insert('volunteer_points', ['volunteerId' => (string)$v['volunteerId'], 'kind' => 'award', 'points' => 0, 'date' => gmdate('Y-m-d'), 'note' => $name, 'createdAt' => now_iso()]);
            $earned[] = ['name' => $name, 'at' => $at];
            if (!empty($v['email'])) {
                @send_mail((string)$v['email'], "Award unlocked: {$name}", email_template([
                    'title' => $name,
                    'intro' => 'Congratulations ' . esc_html((string)$v['fullName']) . " — you crossed {$at} service points.",
                    'bodyHtml' => '<p style="margin:0 0 10px">This award now shows on your digital ID for everyone you check in. Order is a discipline — thank you for keeping it.</p>',
                ]));
            }
            event_emit('volunteer.award', ['ref' => (string)$v['volunteerId'], 'name' => (string)$v['fullName'], 'award' => $name, 'points' => $at]);
        }
    }
    return $earned;
}

/** Complete the day's roll: award points/streak, check level-up + awards, and
 *  return a value-driven response the kiosk shows the volunteer. */
function attendance_duty_complete(array $p): array {
    $date = substr(trim((string)($p['date'] ?? gmdate('Y-m-d'))), 0, 12);
    $centre = trim((string)($p['centre'] ?? ''));
    $volunteerId = trim((string)($p['volunteerId'] ?? ''));
    if ($centre === '' || $volunteerId === '') return ['ok' => false, 'error' => 'missing_fields'];
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    // How many students were checked in at this centre today (the work done).
    $taken = (int)(db_row("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ? AND s.centre = ?", [$date, $centre])['c'] ?? 0);
    $already = db_row('SELECT completedAt FROM attendance_duty WHERE date = ? AND centre = ? LIMIT 1', [$date, $centre]);
    db_update('attendance_duty', ['completedAt' => now_iso(), 'takenCount' => $taken], ['date' => $date, 'centre' => $centre]);

    $before = (int)(db_row('SELECT COALESCE(SUM(points),0) s FROM volunteer_points WHERE volunteerId = ?', [$volunteerId])['s'] ?? 0);
    if (!$already || empty($already['completedAt'])) {
        volunteer_award_points($volunteerId, 'duty_complete', DUTY_POINTS_COMPLETE + min(40, $taken * DUTY_POINTS_PER_HEAD), "Closed roll · {$centre} · {$taken} present", $date);
        // Streak bonus if they also closed a roll the day before.
        $prev = gmdate('Y-m-d', strtotime($date . ' UTC') - 86400);
        if (db_row("SELECT id FROM volunteer_points WHERE volunteerId = ? AND kind = 'duty_complete' AND date = ? LIMIT 1", [$volunteerId, $prev])) {
            volunteer_award_points($volunteerId, 'duty_streak', DUTY_POINTS_STREAK, 'Streak bonus', $date);
        }
    }
    $after = (int)(db_row('SELECT COALESCE(SUM(points),0) s FROM volunteer_points WHERE volunteerId = ?', [$volunteerId])['s'] ?? 0);
    $awards = volunteer_check_point_awards($v, $before, $after);
    $game = volunteer_game_state($volunteerId);
    $leveledUp = false;
    foreach (DUTY_LEVELS as $L) { if ($before < $L['at'] && $after >= $L['at'] && $L['at'] > 0) $leveledUp = true; }
    // Value-driven response — warm, specific, never hollow.
    $msg = $awards ? ("Award unlocked: " . $awards[0]['name'] . "! ")
        : ($leveledUp ? ("You reached Level {$game['level']} · {$game['levelName']}! ")
        : ($game['streak'] > 1 ? ("{$game['streak']}-day streak — you keep this place in order. ") : "Roll closed. Thank you for the discipline. "));
    $msg .= "+" . (DUTY_POINTS_COMPLETE + min(40, $taken * DUTY_POINTS_PER_HEAD)) . " points · {$taken} learners present.";
    audit('attendance.duty.complete', $volunteerId, $centre, ['date' => $date, 'taken' => $taken], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'message' => $msg, 'taken' => $taken, 'game' => $game, 'awards' => $awards, 'leveledUp' => $leveledUp];
}

/** Attendance-duty leaderboard: volunteers ranked by service points, with
 *  level + streak. Staff view (summer cap) for recognition. */
function attendance_duty_leaderboard(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $limit = max(3, min(50, (int)($p['limit'] ?? 15)));
    $rows = db_all("SELECT v.volunteerId, v.fullName, v.role, COALESCE(SUM(vp.points),0) points
                    FROM volunteers v LEFT JOIN volunteer_points vp ON vp.volunteerId = v.volunteerId
                    WHERE v.status = 'active'
                    GROUP BY v.volunteerId, v.fullName, v.role
                    ORDER BY points DESC, v.fullName ASC LIMIT " . $limit);
    $out = []; $rank = 0;
    foreach ($rows as $r) {
        $rank++;
        $game = volunteer_game_state((string)$r['volunteerId']);
        $out[] = ['rank' => $rank, 'volunteerId' => (string)$r['volunteerId'], 'fullName' => (string)$r['fullName'],
            'role' => (string)$r['role'], 'points' => (int)$r['points'], 'level' => $game['level'], 'levelName' => $game['levelName'], 'streak' => $game['streak']];
    }
    return ['ok' => true, 'leaderboard' => $out];
}

/* ── Read/write ops (routes call these) ─────────────────────────────────── */

/** Public/kiosk read: who's on duty across centres for a date (default today). */
function attendance_duty_board(array $p): array {
    $date = substr(trim((string)($p['date'] ?? gmdate('Y-m-d'))), 0, 12) ?: gmdate('Y-m-d');
    $out = [];
    foreach (attendance_centres() as $c) { $d = attendance_duty_for($date, $c); if ($d) $out[] = $d; }
    return ['ok' => true, 'date' => $date, 'duties' => $out, 'pool' => count(attendance_duty_pool())];
}

/** Admin override: pin a specific volunteer to a centre's duty for a date. */
function admin_attendance_duty_set(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $date = substr(trim((string)($p['date'] ?? gmdate('Y-m-d'))), 0, 12);
    $centre = trim((string)($p['centre'] ?? ''));
    $volunteerId = trim((string)($p['volunteerId'] ?? ''));
    if ($centre === '' || $volunteerId === '') return ['ok' => false, 'error' => 'missing_fields'];
    $vrow = db_row('SELECT status, safeguarding FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$vrow || (string)$vrow['status'] !== 'active') return ['ok' => false, 'error' => 'not_active_volunteer'];
    if ((string)($vrow['safeguarding'] ?? 'pending') !== 'cleared') return ['ok' => false, 'error' => 'not_cleared'];
    $exists = db_row('SELECT id FROM attendance_duty WHERE date = ? AND centre = ? LIMIT 1', [$date, $centre]);
    if ($exists) db_update('attendance_duty', ['volunteerId' => $volunteerId, 'source' => 'admin', 'assignedById' => (string)$g['requester']['memberId']], ['date' => $date, 'centre' => $centre]);
    else db_insert('attendance_duty', ['date' => $date, 'centre' => $centre, 'volunteerId' => $volunteerId, 'source' => 'admin', 'assignedById' => (string)$g['requester']['memberId'], 'createdAt' => now_iso()]);
    volunteer_award_points($volunteerId, 'duty_assigned', DUTY_POINTS_ASSIGNED, "On duty · {$centre}", $date);
    audit('attendance.duty.set', $g['requester']['memberId'], $volunteerId, ['date' => $date, 'centre' => $centre], (string)($p['ip'] ?? ''));
    return attendance_duty_board(['date' => $date]);
}

/** Admin: the duty board + the eligible volunteer pool (for the override picker). */
function admin_attendance_duty(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $board = attendance_duty_board($p);
    $board['volunteers'] = array_map(fn($v) => ['volunteerId' => $v['volunteerId'], 'fullName' => $v['fullName'], 'role' => $v['role']], attendance_duty_pool());
    return $board;
}

/** Crossing a milestone mints a verifiable certificate — once per milestone. */
function volunteer_maybe_issue_cert(array $v, int $sessions): ?array {
    if (!in_array($sessions, VOL_MILESTONES, true)) return null;
    if (db_row('SELECT id FROM volunteer_certs WHERE volunteerId = ? AND milestone = ?', [$v['volunteerId'], $sessions])) return null;
    $certId = 'NGGV-' . strtoupper(rand_hex(5));
    while (db_row('SELECT id FROM volunteer_certs WHERE certId = ?', [$certId])) $certId = 'NGGV-' . strtoupper(rand_hex(5));
    $hours = $sessions * volunteer_session_hours();
    db_insert('volunteer_certs', ['certId' => $certId, 'volunteerId' => (string)$v['volunteerId'], 'milestone' => $sessions, 'hours' => $hours, 'issuedAt' => now_iso()]);
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/cert/' . $certId;
    if (!empty($v['email'])) {
        @send_mail((string)$v['email'], "{$sessions} sessions of service — your certificate", email_template([
            'title' => 'Milestone unlocked',
            'intro' => 'Hello ' . esc_html((string)$v['fullName']) . " — you've now shown up for {$sessions} sessions (≈{$hours} hours of service).",
            'bodyHtml' => '<p style="margin:0 0 10px">Your certificate is live, verifiable, and yours to share — print it or link it anywhere.</p>',
            'ctaLabel' => 'Open my certificate →', 'ctaUrl' => $url,
        ]));
    }
    event_emit('volunteer.milestone', ['ref' => (string)$v['volunteerId'], 'name' => (string)$v['fullName'], 'sessions' => $sessions, 'hours' => $hours, 'cert' => $certId]);
    return ['certId' => $certId, 'milestone' => $sessions, 'hours' => $hours];
}

/** Public, verifiable certificate — anyone with the link can confirm it.
 *  Resolves BOTH volunteer service certs and student completion certs, and
 *  reports a revoked cert as revoked (not merely "not found"). */
function public_cert(array $p): array {
    $id = strtoupper(trim((string)($p['id'] ?? '')));
    // Volunteer service certificate.
    $c = db_row('SELECT * FROM volunteer_certs WHERE certId = ? LIMIT 1', [$id]);
    if ($c) {
        $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$c['volunteerId']]);
        if (!$v) return ['ok' => false, 'error' => 'not_found'];
        return ['ok' => true, 'cert' => [
            'type' => 'service', 'certId' => $c['certId'], 'milestone' => (int)$c['milestone'], 'hours' => (int)$c['hours'],
            'issuedAt' => $c['issuedAt'], 'revoked' => !empty($c['revokedAt']), 'revokedAt' => (string)($c['revokedAt'] ?? ''),
            'fullName' => $v['fullName'], 'role' => $v['role'], 'volunteerId' => $v['volunteerId'],
        ]];
    }
    // Student completion certificate.
    $s = db_row('SELECT * FROM student_certs WHERE certId = ? LIMIT 1', [$id]);
    if ($s) {
        $stu = db_row('SELECT fullName, centre, track, cohortId FROM summer_students WHERE studentId = ? LIMIT 1', [$s['studentId']]);
        $cohort = db_row('SELECT name FROM summer_cohorts WHERE cohortId = ? LIMIT 1', [$s['cohortId']]);
        return ['ok' => true, 'cert' => [
            'type' => 'completion', 'certId' => $s['certId'], 'issuedAt' => $s['issuedAt'],
            'revoked' => !empty($s['revokedAt']), 'revokedAt' => (string)($s['revokedAt'] ?? ''),
            'daysPresent' => (int)$s['daysPresent'], 'attendanceRate' => (int)$s['attendanceRate'],
            'fullName' => (string)($stu['fullName'] ?? 'Student'), 'centre' => (string)($stu['centre'] ?? ''),
            'track' => (string)($stu['track'] ?? ''), 'cohort' => (string)($cohort['name'] ?? ''),
            'studentId' => $s['studentId'],
        ]];
    }
    return ['ok' => false, 'error' => 'not_found'];
}

/* ── Safeguarding: pending until screening clears — the scanner shows it ──── */

function admin_volunteer_safeguard(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['pending', 'cleared'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $volunteerId = (string)($p['volunteerId'] ?? '');
    $n = db_update('volunteers', ['safeguarding' => $status, 'updatedAt' => now_iso()], ['volunteerId' => $volunteerId]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('volunteer.safeguard', $g['requester']['memberId'], $volunteerId, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Upcoming sessions (capacity-aware) — offered at approval ─────────────── */

function volunteer_upcoming_sessions(int $limit = 3): array {
    $rows = db_all("SELECT eventId, title, startAt, centre, location, capacity FROM events WHERE status = 'published' AND startAt >= ? ORDER BY startAt LIMIT " . max(1, min(6, $limit)), [now_iso()]);
    foreach ($rows as &$e) {
        $taken = (int)(db_row('SELECT COUNT(*) c FROM event_rsvps WHERE eventId = ?', [$e['eventId']])['c'] ?? 0);
        $e['spotsLeft'] = (int)$e['capacity'] > 0 ? max(0, (int)$e['capacity'] - $taken) : null;
        unset($e['capacity']);
    }
    unset($e);
    return $rows;
}

/* ── Instructor view: course roster, gated by token + registered email ────── */

function public_instructor_roster(array $p): array {
    $token = trim((string)($p['token'] ?? ''));
    $email = strtolower(trim((string)($p['email'] ?? '')));
    $v = db_row("SELECT * FROM volunteers WHERE token = ? AND status = 'active' LIMIT 1", [$token]);
    if (!$v || $email === '' || strtolower((string)$v['email']) !== $email) return ['ok' => false, 'error' => 'not_authorised'];
    if ((string)$v['role'] !== 'instructor') return ['ok' => false, 'error' => 'not_instructor'];
    $courses = json_decode((string)($v['courses'] ?? ''), true) ?: [];
    if (!$courses) return ['ok' => true, 'courses' => [], 'students' => []];
    $ph = implode(',', array_fill(0, count($courses), '?'));
    $rows = db_all("SELECT studentId, fullName, track FROM summer_students WHERE status = 'active' AND regStatus = 'verified' AND track IN ($ph) ORDER BY fullName", $courses);
    $today = gmdate('Y-m-d');
    $students = [];
    foreach ($rows as $r) {
        // First names only — this view exists for the room, not for data export.
        $students[] = [
            'firstName' => explode(' ', trim((string)$r['fullName']))[0],
            'course' => $r['track'],
            'days' => (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$r['studentId']])['c'] ?? 0),
            'todayPresent' => (bool)db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$r['studentId'], $today]),
        ];
    }
    return ['ok' => true, 'courses' => $courses, 'students' => $students];
}

function admin_volunteers_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $pending = db_all("SELECT id, name, firstName, lastName, otherName, dob, sex, email, phone, role, courses, centre, faculty, why, photoUrl, status, createdAt FROM applications WHERE kind = 'volunteer' AND status IN ('new', 'reviewing') ORDER BY id DESC LIMIT 200");
    foreach ($pending as &$a) {
        $a['courses'] = json_decode((string)($a['courses'] ?? ''), true) ?: [];
        $a['ref'] = function_exists('intake_reference') ? intake_reference('volunteer', (int)$a['id']) : '';
        $a['dobAge'] = !empty($a['dob']) && function_exists('dob_age') ? dob_age((string)$a['dob']) : null;
    }
    unset($a);
    $roster = db_all('SELECT volunteerId, fullName, email, phone, role, courses, centre, faculty, token, status, safeguarding, createdAt FROM volunteers ORDER BY id DESC LIMIT 500');
    foreach ($roster as &$v) $v['courses'] = json_decode((string)($v['courses'] ?? ''), true) ?: [];
    unset($v);
    return ['ok' => true, 'pending' => $pending, 'volunteers' => $roster];
}

function admin_volunteer_approve(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row("SELECT * FROM applications WHERE id = ? AND kind = 'volunteer' LIMIT 1", [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];

    // Idempotent: approving twice (or a second application from the same
    // email) surfaces the existing record instead of minting a duplicate.
    $existing = db_row('SELECT * FROM volunteers WHERE applicationId = ? OR lower(email) = ? LIMIT 1', [$id, strtolower((string)$a['email'])]);
    if ($existing) {
        db_update('applications', ['status' => 'accepted'], ['id' => $id]);
        return ['ok' => true, 'already' => true, 'volunteer' => volunteer_public($existing) + ['token' => $existing['token']]];
    }
    // Instructors must be reachable by phone before an ID goes out.
    if ((string)$a['role'] === 'instructor' && trim((string)($a['phone'] ?? '')) === '') {
        return ['ok' => false, 'error' => 'phone_required'];
    }

    // The tier (by role) drives both the ID prefix and the card colour.
    $tier = vol_tier_for((string)$a['role']);
    $volunteerId = volunteer_display_id((string)$tier['code']);
    // Bind a check-in token — same pool the gate scanner reads.
    $token = 'VOLQR-' . strtoupper(rand_hex(4));
    while (db_row('SELECT id FROM qr_codes WHERE token = ?', [$token])) $token = 'VOLQR-' . strtoupper(rand_hex(4));
    $c = summer_ensure_cohort();
    // Insert the volunteer FIRST, then bind the QR token — so if the volunteer
    // row fails (e.g. a schema gap) we never leave a dangling qr_codes token
    // that resolves to a nonexistent profile (the "/q link shows no ID" bug).
    db_insert('volunteers', [
        'volunteerId' => $volunteerId, 'applicationId' => $id,
        'fullName' => (string)$a['name'], 'email' => (string)$a['email'], 'phone' => (string)($a['phone'] ?? ''),
        'firstName' => (string)($a['firstName'] ?? ''), 'lastName' => (string)($a['lastName'] ?? ''),
        'otherName' => (string)($a['otherName'] ?? ''), 'dob' => (string)($a['dob'] ?? ''),
        'sex' => (string)($a['sex'] ?? ''),
        'role' => (string)$a['role'], 'courses' => (string)($a['courses'] ?? ''),
        'centre' => (string)($a['centre'] ?? ''), 'faculty' => (string)($a['faculty'] ?? ''),
        'token' => $token, 'photoUrl' => (string)($a['photoUrl'] ?? ''),
        'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_insert('qr_codes', ['token' => $token, 'batch' => 'VOL', 'cohortId' => $c['cohortId'], 'status' => 'assigned', 'studentId' => $volunteerId, 'assignedName' => (string)$a['name'], 'createdAt' => now_iso(), 'assignedAt' => now_iso()]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);

    $sent = volunteer_send_id($volunteerId);
    audit('volunteer.approve', $g['requester']['memberId'], $volunteerId, ['applicationId' => $id, 'channels' => $sent], (string)($p['ip'] ?? ''));
    event_emit('volunteer.approved', ['ref' => $volunteerId, 'name' => (string)$a['name'], 'role' => (string)$a['role'], 'status' => 'active']);
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ?', [$volunteerId]);
    return ['ok' => true, 'volunteer' => volunteer_public($v) + ['token' => $token], 'idSent' => $sent];
}

/** Deliver the digital ID — email always; SMS when the admin has it on. */
function volunteer_send_id(string $volunteerId): array {
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return [];
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/q/' . $v['token'];
    $roleLabel = ucfirst((string)$v['role']);
    $channels = [];
    $sessionsHtml = (function () {
        $out = '';
        foreach (volunteer_upcoming_sessions() as $e) {
            $when = date('D j M · H:i', strtotime((string)$e['startAt']));
            $where = trim(((string)($e['centre'] ?? '')) . ' ' . ((string)($e['location'] ?? '')));
            $spots = $e['spotsLeft'] === null ? '' : ' · ' . (int)$e['spotsLeft'] . ' spots left';
            $out .= '<li style="margin:0 0 6px">' . esc_html((string)$e['title']) . ' — ' . esc_html($when) . ($where !== '' ? ' · ' . esc_html($where) : '') . esc_html($spots) . '</li>';
        }
        return $out === '' ? '' : '<p style="margin:14px 0 6px"><b>Come shadow a session:</b></p><ul style="margin:0;padding-left:18px">' . $out . '</ul>';
    })();
    $qrHtml = (function_exists('qr_cache_exists') && qr_cache_exists((string)$v['token']))
        ? '<div style="text-align:center;margin:6px 0 14px"><img src="' . esc_html(qr_public_url((string)$v['token'])) . '" width="180" height="180" alt="Check-in QR" style="width:180px;height:180px;border:1px solid #e4e4e4;border-radius:12px;padding:8px;background:#fff"/><div style="font:400 12px monospace;color:#888;margin-top:6px">Scan at any centre to check in</div></div>'
        : '';
    $html = email_template([
        'title' => "You're in — welcome to the team",
        'intro' => 'Hello ' . esc_html((string)$v['fullName']) . ' — your volunteer registration was approved.',
        'bodyHtml' => '<p style="margin:0 0 10px"><b>Volunteer ID:</b> ' . esc_html($volunteerId) . '<br><b>Role:</b> ' . esc_html($roleLabel) . '</p>'
            . $qrHtml
            . '<p style="margin:0 0 10px">The QR above (and the button below) open your digital ID and attendance profile — the same code on your printed card. Show either at any centre to check in.</p>'
            . $sessionsHtml,
        'ctaLabel' => 'Open my volunteer ID →', 'ctaUrl' => $url,
        'footNote' => 'Printed IDs are issued at your first session. Roles working directly with teenagers complete safeguarding screening first.',
    ]);
    if (!empty($v['email']) && send_mail((string)$v['email'], "Your NGG volunteer ID — {$volunteerId}", $html)) $channels[] = 'email';
    if (!empty($v['phone']) && sms_enabled() && setting_raw('volunteer_sms_notify') !== '0') {
        $r = sms_send((string)$v['phone'], "NGG: you're approved as a {$roleLabel} volunteer. ID {$volunteerId}. Your digital ID: {$url}");
        if (!empty($r['ok'])) $channels[] = 'sms';
    }
    return $channels;
}

function admin_volunteer_decline(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row("SELECT * FROM applications WHERE id = ? AND kind = 'volunteer' LIMIT 1", [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    db_update('applications', ['status' => 'rejected'], ['id' => $id]);
    $reason = substr(trim((string)($p['reason'] ?? '')), 0, 500);
    if (!empty($a['email'])) {
        @send_mail((string)$a['email'], 'About your NGG volunteer registration', email_template([
            'title' => 'Thank you for offering your time',
            'intro' => 'Hello ' . esc_html((string)$a['name']) . ' — we reviewed your volunteer registration.',
            'bodyHtml' => '<p style="margin:0 0 10px">We can&rsquo;t take you on this intake' . ($reason !== '' ? ': ' . esc_html($reason) : '.') . '</p><p style="margin:0">Registrations reopen every season — we&rsquo;d genuinely love to see you again.</p>',
        ]));
    }
    audit('volunteer.decline', $g['requester']['memberId'], (string)$id, ['reason' => $reason !== ''], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Volunteer deployment planning: needs ledger + fulfilment status ────────
   `volunteer_needs` holds the admin's target headcount per centre × role, with
   an optional finer target per faculty. Role-level rows carry faculty=''.
   The public /v-status board and the admin needs editor both compute against
   the same live filled counts (active volunteers), so config and board never
   drift. Volunteers store their centre/faculty as free text (the catalogue
   value at apply time); we map centre NAME ↔ centreId through the catalogue. */

const VOL_ROLES = ['admin', 'mentor', 'instructor'];

/** Live filled counts from the active roster, keyed for O(1) lookup. */
function volunteer_filled_index(): array {
    $byRole = []; $byFaculty = []; $byCourse = []; $byCentre = [];
    foreach (db_all("SELECT centre, role, faculty, courses FROM volunteers WHERE status = 'active'") as $v) {
        $c = (string)$v['centre']; if ($c === '') continue;
        $r = (string)$v['role']; $f = (string)($v['faculty'] ?? '');
        $byCentre[$c] = ($byCentre[$c] ?? 0) + 1;
        $byRole[$c . '|' . $r] = ($byRole[$c . '|' . $r] ?? 0) + 1;
        if ($f !== '') $byFaculty[$c . '|' . $f] = ($byFaculty[$c . '|' . $f] ?? 0) + 1;
        if ($r === 'instructor') {
            $courses = json_decode((string)($v['courses'] ?? ''), true) ?: [];
            foreach ($courses as $co) { $co = (string)$co; if ($co === '') continue; $byCourse[$c . '|' . $f . '|' . $co] = ($byCourse[$c . '|' . $f . '|' . $co] ?? 0) + 1; }
        }
    }
    return ['centre' => $byCentre, 'role' => $byRole, 'faculty' => $byFaculty, 'course' => $byCourse];
}

function volunteer_tone(int $rate): string { return $rate >= 100 ? 'met' : ($rate >= 60 ? 'watch' : 'urgent'); }
function volunteer_rate(int $filled, int $need): int { return $need > 0 ? (int)round($filled / $need * 100) : ($filled > 0 ? 100 : 100); }

/** Full per-centre + global fulfilment structure (shared by public board). */
function volunteer_status_compute(): array {
    $centres = db_all("SELECT centreId, name, code, color FROM centres WHERE status = 'active' ORDER BY name");
    $needsRows = db_all('SELECT centreId, role, faculty, needCount FROM volunteer_needs');
    // Index needs: role-level (faculty='') and faculty-level.
    $roleNeed = []; $facNeed = [];
    foreach ($needsRows as $n) {
        $cid = (string)$n['centreId']; $r = (string)$n['role']; $f = (string)($n['faculty'] ?? '');
        if ($f === '') $roleNeed[$cid . '|' . $r] = (int)$n['needCount'];
        else { $facNeed[$cid . '|' . $r . '|' . $f] = (int)$n['needCount']; $facNeed['sum|' . $cid . '|' . $r] = ($facNeed['sum|' . $cid . '|' . $r] ?? 0) + (int)$n['needCount']; }
    }
    $filled = volunteer_filled_index();

    $byCentre = []; $tNeed = 0; $tFilled = 0;
    foreach ($centres as $c) {
        $cid = (string)$c['centreId']; $name = (string)$c['name'];
        $cNeed = 0; $cFilled = 0; $byRole = [];
        foreach (VOL_ROLES as $r) {
            // Effective role need: explicit role-level row, else sum of its faculty rows.
            $need = $roleNeed[$cid . '|' . $r] ?? ($facNeed['sum|' . $cid . '|' . $r] ?? 0);
            $fl = $filled['role'][$name . '|' . $r] ?? 0;
            $cNeed += $need; $cFilled += $fl;
            $byRole[] = ['role' => $r, 'need' => $need, 'filled' => $fl, 'gap' => max(0, $need - $fl), 'fulfillmentRate' => volunteer_rate($fl, $need)];
        }
        // By faculty (mentors + instructors combined) — filled + optional need.
        $facs = [];
        foreach (volunteer_faculty_options() as $f) {
            $fFilled = $filled['faculty'][$name . '|' . $f] ?? 0;
            $fNeed = ($facNeed[$cid . '|mentor|' . $f] ?? 0) + ($facNeed[$cid . '|instructor|' . $f] ?? 0);
            if ($fFilled === 0 && $fNeed === 0) continue;
            $facs[] = ['faculty' => $f, 'filled' => $fFilled, 'need' => $fNeed];
        }
        // By faculty → course (instructors only).
        $courses = [];
        foreach ($filled['course'] as $key => $cnt) {
            [$cn, $f, $co] = array_pad(explode('|', $key, 3), 3, '');
            if ($cn !== $name) continue;
            $courses[] = ['faculty' => $f, 'course' => $co, 'filled' => $cnt];
        }
        usort($courses, fn($a, $b) => [$a['faculty'], $a['course']] <=> [$b['faculty'], $b['course']]);
        $rate = volunteer_rate($cFilled, $cNeed);
        $byCentre[] = [
            'centreId' => $cid, 'name' => $name, 'code' => (string)$c['code'], 'color' => (string)$c['color'],
            'need' => $cNeed, 'filled' => $cFilled, 'gap' => max(0, $cNeed - $cFilled),
            'fulfillmentRate' => $rate, 'tone' => volunteer_tone($rate),
            'byRole' => $byRole, 'byFaculty' => $facs, 'byCourse' => $courses,
        ];
        $tNeed += $cNeed; $tFilled += $cFilled;
    }
    $totalActive = (int)(db_row("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'")['c'] ?? 0);
    $totalAll = (int)(db_row("SELECT COUNT(*) c FROM volunteers")['c'] ?? 0);
    $globalRate = volunteer_rate($tFilled, $tNeed);
    return [
        'kpis' => [
            'totalVolunteers' => $totalAll, 'activeVolunteers' => $totalActive,
            'centres' => count($centres),
            'totalNeed' => $tNeed, 'totalFilled' => $tFilled, 'totalGap' => max(0, $tNeed - $tFilled),
            'fulfillmentRate' => $globalRate, 'tone' => volunteer_tone($globalRate),
        ],
        'byCentre' => $byCentre,
    ];
}

/** Public, PII-free volunteer fulfilment board (powers /v-status). */
function public_volunteer_status(array $p): array {
    $s = volunteer_status_compute();
    return ['ok' => true, 'status' => [
        'generatedAt' => now_iso(),
        'program' => ['name' => 'Next Generation Genius', 'year' => (int)gmdate('Y')],
        'kpis' => $s['kpis'],
        'byCentre' => $s['byCentre'],
    ]];
}

/* ── Admin: volunteer needs CRUD (config the /v-status targets) ─────────── */

function admin_volunteer_needs_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $centres = db_all("SELECT centreId, name, code, color FROM centres WHERE status = 'active' ORDER BY name");
    $needs = db_all('SELECT centreId, role, faculty, needCount, updatedAt FROM volunteer_needs ORDER BY centreId, role, faculty');
    // Live filled counts so admins don't edit blind.
    $filled = volunteer_filled_index();
    $filledOut = ['centre' => [], 'role' => [], 'faculty' => []];
    foreach ($centres as $c) {
        $name = (string)$c['name']; $cid = (string)$c['centreId'];
        $filledOut['centre'][$cid] = $filled['centre'][$name] ?? 0;
        foreach (VOL_ROLES as $r) $filledOut['role'][$cid . '|' . $r] = $filled['role'][$name . '|' . $r] ?? 0;
        foreach (volunteer_faculty_options() as $f) { $v = $filled['faculty'][$name . '|' . $f] ?? 0; if ($v) $filledOut['faculty'][$cid . '|' . $f] = $v; }
    }
    return ['ok' => true, 'centres' => $centres, 'roles' => VOL_ROLES, 'faculties' => volunteer_faculty_options(), 'needs' => $needs, 'filled' => $filledOut];
}

function admin_volunteer_need_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $centreId = trim((string)($p['centreId'] ?? ''));
    $role = strtolower(trim((string)($p['role'] ?? '')));
    $faculty = substr(trim((string)($p['faculty'] ?? '')), 0, 80);
    $need = max(0, min(9999, (int)($p['needCount'] ?? 0)));
    if (!in_array($role, VOL_ROLES, true)) return ['ok' => false, 'error' => 'bad_role'];
    if (!db_row('SELECT id FROM centres WHERE centreId = ? LIMIT 1', [$centreId])) return ['ok' => false, 'error' => 'invalid_centre'];
    if ($faculty !== '' && !in_array($faculty, volunteer_faculty_options(), true)) return ['ok' => false, 'error' => 'invalid_faculty'];
    $existing = db_row('SELECT id FROM volunteer_needs WHERE centreId = ? AND role = ? AND faculty = ? LIMIT 1', [$centreId, $role, $faculty]);
    if ($existing) db_update('volunteer_needs', ['needCount' => $need, 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']], ['id' => (int)$existing['id']]);
    else db_insert('volunteer_needs', ['centreId' => $centreId, 'role' => $role, 'faculty' => $faculty, 'needCount' => $need, 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']]);
    audit('volunteer.need.upsert', $g['requester']['memberId'], $centreId, ['role' => $role, 'faculty' => $faculty, 'need' => $need], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_volunteer_need_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $centreId = trim((string)($p['centreId'] ?? ''));
    $role = strtolower(trim((string)($p['role'] ?? '')));
    $faculty = substr(trim((string)($p['faculty'] ?? '')), 0, 80);
    $n = db_exec('DELETE FROM volunteer_needs WHERE centreId = ? AND role = ? AND faculty = ?', [$centreId, $role, $faculty]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('volunteer.need.delete', $g['requester']['memberId'], $centreId, ['role' => $role, 'faculty' => $faculty], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
