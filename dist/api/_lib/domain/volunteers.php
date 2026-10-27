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
    /* Printed expiry. A volunteer's check-in token is bound in qr_codes with the
     * programme's validity policy applied, exactly like a student's — but the
     * card payload never read it back, so both the front's VALID TO field and the
     * back's VALID TO row were silently absent on every volunteer card while the
     * gate was already refusing expired ones. One batched lookup rather than a
     * query per card. */
    $expiryOf = [];
    $tokens = array_values(array_filter(array_map(fn($v) => (string)$v['token'], $rows)));
    if ($tokens) {
        $in = '(' . implode(',', array_fill(0, count($tokens), '?')) . ')';
        foreach (db_all("SELECT token, expiresAt FROM qr_codes WHERE token IN $in", $tokens) as $q) {
            $expiryOf[(string)$q['token']] = (string)($q['expiresAt'] ?? '');
        }
    }
    $centres = centre_index();
    $cards = [];
    foreach ($rows as $v) {
        $cards[] = card_row_volunteer($v, $centres, (string)($expiryOf[(string)$v['token']] ?? ''));
    }
    return ['ok' => true, 'cards' => $cards, 'program' => idcard_program()];
}

/**
 * One volunteer, in the shape everything that DRAWS a volunteer expects.
 *
 * Shared with the design studio's data merge for the same reason as
 * card_row_student: two copies of a payload mapping is how a card ends up
 * printing without its expiry date for months while both copies look complete.
 *
 * `$centres` is the whole centre table from centre_index(), so a run of 200
 * volunteers resolves 200 centres without 200 queries.
 */
function card_row_volunteer(array $v, array $centres, string $expiry): array {
    $tier = vol_tier_for((string)($v['role'] ?? ''));
    /* Two names only on the printed ID: first given name + surname.
       This now prefers the firstName/lastName the application actually asked
       for, falling back to splitting fullName — the same rule a child's card
       has always used, and a change for volunteers, whose card split fullName
       unconditionally. A split names "Ada Chi Nwosu Eze" as Ada Eze; the
       columns are what the person wrote. Every volunteer created from an
       application has them (see volunteer creation below), so the fallback is
       only for rows that predate the fields. */
    $first = trim((string)($v['firstName'] ?? ''));
    $surname = trim((string)($v['lastName'] ?? ''));
    if ($first === '' && $surname === '') {
        $names = preg_split('/\s+/', trim((string)($v['fullName'] ?? ''))) ?: [''];
        $first = (string)array_shift($names);
        $surname = $names ? (string)array_pop($names) : '';
    }
    /* The centre, which this card never carried. A volunteer card was
     * coloured by TIER — what they do — and said nothing about WHERE, so
     * at a centre with forty volunteers on site nobody could tell at a
     * glance who belonged to their own. The tier colour stays; the centre
     * arrives as a ring and a code on the face. */
    $c = trim((string)($v['centre'] ?? ''));
    $cRow = $c !== '' ? ($centres[mb_strtolower($c)] ?? null) : null;
    return [
        'volunteerId' => $v['volunteerId'],
        'firstName' => $first, 'surname' => $surname,
        'role' => (string)($v['role'] ?? ''),
        /* The faculty an instructor teaches in. On the card because "role"
           alone is the least identifying thing about them at a site: every
           third person there is an instructor, and which subject is what a
           coordinator, a parent and a child are all actually asking. Empty
           for roles where it means nothing, so the card can leave it out
           rather than print a blank. */
        'faculty' => (string)($v['faculty'] ?? ''),
        'tier' => ['name' => $tier['name'], 'code' => $tier['code'], 'color' => $tier['color']],
        'centre' => $cRow
            ? ['name' => $cRow['name'], 'code' => $cRow['code'], 'color' => $cRow['color']]
            : ($c !== '' ? ['name' => $c, 'code' => strtoupper(substr($c, 0, 3)), 'color' => '#76B043'] : null),
        'displayId' => (string)$v['volunteerId'],
        'token' => (string)($v['token'] ?? ''),
        // Blank when the programme runs with no expiry, and the card leaves
        // the field out entirely rather than printing an empty row.
        'expiresAt' => $expiry,
        'photoUrl' => (string)($v['photoUrl'] ?? ''),
        // Not printed — this is what lets the studio cut a run by date.
        'enrolledAt' => (string)($v['createdAt'] ?? ''),
    ];
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
        'programme' => volunteer_programme($v),
    ];
    if ($withAttendance) {
        $rows = db_all('SELECT date, checkInAt, method FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 60', [$v['volunteerId']]);
        $out['attendance'] = $rows;
        $out['attendanceCount'] = count($rows);
        $out += volunteer_ledger((string)$v['volunteerId']);
        // Curated projects + public mentor notes (real records, admin-managed).
        if (function_exists('profile_public_extras')) $out = array_merge($out, profile_public_extras('volunteer', (string)$v['volunteerId']));
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
    // Dual auth (mirrors summer_checkin): the gate/kiosk route authorizes by the
    // gate token (gateAuthorized); every other caller needs the 'summer' cap.
    // Admin routes strip gateAuthorized, so it can only arrive from the gate route.
    if (empty($p['gateAuthorized'])) {
        $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    }
    $date = substr(trim((string)($p['date'] ?? gmdate('Y-m-d'))), 0, 12);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    $centre = trim((string)($p['centre'] ?? ''));
    $volunteerId = trim((string)($p['volunteerId'] ?? ''));
    if ($centre === '' || $volunteerId === '') return ['ok' => false, 'error' => 'missing_fields'];
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    // Only the volunteer actually on duty for this centre/date may close its roll
    // (and earn the points). No duty row = nothing to close.
    $duty = db_row('SELECT volunteerId FROM attendance_duty WHERE date = ? AND centre = ? LIMIT 1', [$date, $centre]);
    if (!$duty) return ['ok' => false, 'error' => 'no_duty'];
    if ((string)$duty['volunteerId'] !== $volunteerId) return ['ok' => false, 'error' => 'not_on_duty'];
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

/**
 * Super admin: grant a volunteer access to the mentor portal.
 *
 * A volunteer who registered as "Admin / Ops" holds no role capability, so
 * `mentor_gate` had nowhere to admit them and the portal answered
 * `not_a_mentor` — correctly, because a self-service form is not a grant of
 * oversight over children's behaviour records. The people who actually run a
 * centre still need to get in, so the grant is made HERE, per person, by a
 * super admin, and recorded in the audit log.
 *
 * The grantable set is deliberately narrower than a staff member's. Only the
 * two programme capabilities are offered: they open a programme's roster at
 * the volunteer's own centre and nothing else. 'people', 'rbac' and the rest
 * are not grantable to a volunteer at all — a volunteer record is created by a
 * public form, and no public form should be one edit away from the console.
 */
function admin_volunteer_caps_set(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    $volunteerId = (string)($p['volunteerId'] ?? '');
    $v = db_row('SELECT id, centre FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];

    // 'summer' → the Summer School roster; 'club' → the NGG Club roster.
    $valid = ['summer', 'club'];
    $in = is_array($p['caps'] ?? null) ? $p['caps'] : [];
    $caps = array_values(array_unique(array_filter(array_map('strval', $in), fn($c) => in_array($c, $valid, true))));

    /* A grant with no centre on the record is refused rather than stored.
     * `mentor_gate` fails such a volunteer closed — they would hold a
     * capability and see an empty roster, which reads as a broken portal
     * rather than as the missing centre it actually is. */
    if ($caps && trim((string)($v['centre'] ?? '')) === '') return ['ok' => false, 'error' => 'volunteer_has_no_centre'];

    db_update('volunteers', ['capsExtra' => json_encode($caps, JSON_UNESCAPED_SLASHES), 'updatedAt' => now_iso()], ['id' => $v['id']]);
    audit('volunteer.caps', (string)($p['requesterId'] ?? ''), $volunteerId, ['caps' => $caps], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'volunteerId' => $volunteerId, 'caps' => $caps, 'centre' => (string)$v['centre']];
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
    $pending = db_all("SELECT id, name, firstName, lastName, otherName, dob, sex, email, phone, role, courses, centre, faculty, visibilityConsent, why, photoUrl, status, program, createdAt FROM applications WHERE kind = 'volunteer' AND status IN ('new', 'reviewing') ORDER BY id DESC LIMIT 200");
    foreach ($pending as &$a) {
        $a['courses'] = json_decode((string)($a['courses'] ?? ''), true) ?: [];
        $a['ref'] = function_exists('intake_reference') ? intake_reference('volunteer', (int)$a['id']) : '';
        $a['dobAge'] = !empty($a['dob']) && function_exists('dob_age') ? dob_age((string)$a['dob']) : null;
        $a['programme'] = (string)($a['program'] ?? '') === 'anchor' ? 'ngg' : 'summer';
        unset($a['program']);
    }
    unset($a);
    $roster = db_all('SELECT volunteerId, fullName, firstName, lastName, email, phone, role, courses, centre, faculty, visibilityConsent, token, status, safeguarding, capsExtra, dob, programme, programmeAt, createdAt FROM volunteers ORDER BY id DESC LIMIT 500');
    foreach ($roster as &$v) {
        $v['programme'] = volunteer_programme($v);
        $v['courses'] = json_decode((string)($v['courses'] ?? ''), true) ?: [];
        // Portal access granted to this person. Always an array so the console
        // can render "no access" without distinguishing null from '' from '[]'.
        $v['caps'] = json_decode((string)($v['capsExtra'] ?? ''), true) ?: [];
        unset($v['capsExtra']);
    }
    unset($v);
    return ['ok' => true, 'pending' => $pending, 'volunteers' => $roster];
}

/** 'ngg' or 'summer' — Summer is what a volunteer is unless told otherwise. */
function volunteer_programme(array $v): string {
    return (string)($v['programme'] ?? '') === 'ngg' ? 'ngg' : 'summer';
}

/**
 * Move a volunteer between programmes — chiefly a Summer volunteer promoted to
 * an NGG volunteer. Audited; the volunteer is told by email on a promotion
 * unless the admin unticks it. Moving back to Summer is allowed (a mistake
 * undone) and says nothing to the volunteer.
 */
function admin_volunteer_programme_set(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $volunteerId = (string)($p['volunteerId'] ?? '');
    $to = (string)($p['programme'] ?? '');
    if (!in_array($to, ['ngg', 'summer'], true)) return ['ok' => false, 'error' => 'bad_programme'];
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    $from = volunteer_programme($v);
    if ($from === $to) return ['ok' => true, 'already' => true, 'volunteerId' => $volunteerId, 'programme' => $to];
    db_update('volunteers', ['programme' => $to, 'programmeAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$v['id']]);
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 500);
    audit('volunteer.programme', $g['requester']['memberId'], $volunteerId, ['from' => $from, 'to' => $to, 'note' => $note], (string)($p['ip'] ?? ''));
    $emailed = false;
    $email = trim((string)($v['email'] ?? ''));
    if ($to === 'ngg' && ($p['notify'] ?? true) !== false && $email !== '' && function_exists('intake_acknowledge')) {
        $first = (string)($v['firstName'] ?? '') ?: (explode(' ', (string)$v['fullName'])[0] ?: 'there');
        intake_acknowledge($email, 'You are now an NGG volunteer — Next Generation Genius', [
            'title' => 'Welcome to NGG',
            'intro' => 'Congratulations, ' . $first . '.',
            'bodyHtml' => '<p style="margin:0 0 12px">Your service with the Summer School has carried you forward: you now volunteer with <b>Next Generation Genius</b> itself, through the year.</p>'
                . '<p style="margin:0">Your volunteer ID (' . esc_html($volunteerId) . ') stays the same, and so does your record of hours.</p>',
            'footNote' => 'Volunteer ' . $volunteerId . ' — promoted from the Summer School.',
        ]);
        $emailed = true;
    }
    return ['ok' => true, 'volunteerId' => $volunteerId, 'programme' => $to, 'from' => $from, 'emailed' => $emailed];
}

/** Edit an active volunteer's data — name, contact, role, centre, faculty,
 *  courses, site-visibility consent, status. Only supplied fields change. */
function admin_volunteer_update(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $volunteerId = (string)($p['volunteerId'] ?? '');
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $row = ['updatedAt' => now_iso()];
    if (array_key_exists('fullName', $d)) { $name = trim((string)$d['fullName']); if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name']; $row['fullName'] = substr($name, 0, 120); }
    foreach (['firstName' => 80, 'lastName' => 80, 'phone' => 48, 'centre' => 48, 'faculty' => 80] as $f => $max) {
        if (array_key_exists($f, $d)) $row[$f] = substr(trim((string)$d[$f]), 0, $max);
    }
    /* Not a plain substr like the rest: with no cloud configured an editor's
       browser sends the image itself, and truncating a data: URL at 512
       characters stores a fragment of base64 that can never render. */
    if (array_key_exists('photoUrl', $d)) {
        $row['photoUrl'] = function_exists('photo_intake_url')
            ? photo_intake_url((string)$d['photoUrl'])
            : substr(trim((string)$d['photoUrl']), 0, 512);
    }
    if (array_key_exists('email', $d)) {
        $em = trim((string)$d['email']);
        if ($em === '' || !filter_var($em, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
        $row['email'] = substr($em, 0, 160);
    }
    if (array_key_exists('role', $d)) {
        if (!in_array((string)$d['role'], VOL_ROLES, true)) return ['ok' => false, 'error' => 'bad_role'];
        $row['role'] = (string)$d['role'];
    }
    if (array_key_exists('courses', $d)) {
        $courses = is_array($d['courses']) ? array_values(array_filter(array_map(fn($c) => substr(trim((string)$c), 0, 80), $d['courses']))) : [];
        $row['courses'] = json_encode(array_slice($courses, 0, 20));
    }
    if (array_key_exists('visibilityConsent', $d)) $row['visibilityConsent'] = !empty($d['visibilityConsent']) ? 1 : 0;
    if (array_key_exists('dob', $d)) {
        $dob = dob_clean((string)$d['dob']);
        if ($dob === null) return ['ok' => false, 'error' => 'bad_dob'];
        $row['dob'] = $dob;
    }
    if (array_key_exists('status', $d)) {
        if (!in_array((string)$d['status'], ['active', 'inactive', 'archived'], true)) return ['ok' => false, 'error' => 'bad_status'];
        $row['status'] = (string)$d['status'];
    }
    db_update('volunteers', $row, ['volunteerId' => $volunteerId]);
    audit('volunteer.update', $g['requester']['memberId'], $volunteerId, ['fields' => array_keys($row)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'volunteerId' => $volunteerId];
}

/** Delete a volunteer record and release its check-in QR token. */
function admin_volunteer_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $volunteerId = (string)($p['volunteerId'] ?? '');
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($v['token'])) db_exec('DELETE FROM qr_codes WHERE token = ?', [(string)$v['token']]);
    db_exec('DELETE FROM volunteers WHERE volunteerId = ?', [$volunteerId]);
    audit('volunteer.delete', $g['requester']['memberId'], $volunteerId, ['name' => (string)$v['fullName']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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
        'visibilityConsent' => (int)($a['visibilityConsent'] ?? 0),
        'token' => $token, 'photoUrl' => (string)($a['photoUrl'] ?? ''),
        // An NGG (anchor) application makes an NGG volunteer; /volunteer is Summer.
        'programme' => (string)($a['program'] ?? '') === 'anchor' ? 'ngg' : 'summer', 'programmeAt' => now_iso(),
        'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_insert('qr_codes', ['token' => $token, 'batch' => 'VOL', 'cohortId' => $c['cohortId'], 'status' => 'assigned', 'studentId' => $volunteerId, 'assignedName' => (string)$a['name'], 'createdAt' => now_iso(), 'assignedAt' => now_iso(), 'expiresAt' => idcard_expiry_for()]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);

    $sent = volunteer_send_id($volunteerId);
    audit('volunteer.approve', $g['requester']['memberId'], $volunteerId, ['applicationId' => $id, 'channels' => $sent], (string)($p['ip'] ?? ''));
    event_emit('volunteer.approved', ['ref' => $volunteerId, 'name' => (string)$a['name'], 'role' => (string)$a['role'], 'status' => 'active']);
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ?', [$volunteerId]);
    return ['ok' => true, 'volunteer' => volunteer_public($v) + ['token' => $token], 'idSent' => $sent];
}

/**
 * Promote an NGG member up the chain of command (Part III) into the NGV /
 * volunteer tier, provisioning their volunteer record automatically instead of
 * making them file a fresh volunteer application. This is what stands their
 * "NGV dashboard" up: a volunteers row derived from the member (so every
 * volunteer surface — profile, check-in, mentor/teaching tools, the /q ID —
 * resolves them), a bound check-in token + ID card, and a two-way link so the
 * member's own dashboard can show the new standing.
 *
 * Idempotent: a member already promoted keeps their single NGV record (it is
 * re-activated and re-linked rather than duplicated).
 *
 * Delivery: a NEW promotion emails/SMSes the volunteer their digital ID (QR +
 * welcome) by default so they actually receive their credentials — pass
 * sendId:false to suppress. A re-press never re-sends unless sendId:true is
 * passed (so the promote button can't spam on repeated clicks, but a "Resend
 * ID" affordance can). The channels reached come back as `sent`.
 */
function admin_member_promote_ngv(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $memberId = trim((string)($p['memberId'] ?? ''));
    if ($memberId === '') return ['ok' => false, 'error' => 'no_member'];
    /* Scope: promoting somebody else's member to volunteer is not this
       admin's call, and it grants them standing the admin cannot revoke. */
    $sg = admin_member_scope_gate($g['requester'], $memberId);
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    if ((string)($m['type'] ?? '') !== 'NGG') return ['ok' => false, 'error' => 'not_ngg'];
    /* Promotion hands the child's details to Afrovanguard (ngv-portal.php), so
       a minor — or anybody whose age we cannot tell — needs their guardian's
       recorded consent first. Checked before the re-press branch too: that
       path re-sends the same details. */
    $gc = ngv_guardian_consent($m);
    if ($gc['minor'] && $gc['guardianConsent']['status'] !== 'granted') {
        return ['ok' => false, 'error' => 'guardian_consent_required',
                'detail' => 'Under 18 (or no date of birth on file): record the guardian\'s consent to "' . MEMBER_CONSENT_TYPES[NGV_TRANSFER_CONSENT]['label']
                          . '" under Publication consent on this member, then promote.'];
    }

    // Already promoted? Keep the one record — re-activate + re-link, never mint
    // a second volunteer row for the same person.
    $existing = db_row("SELECT * FROM volunteers WHERE memberId = ? LIMIT 1", [$memberId]);
    if (!$existing && (string)($m['ngvVolunteerId'] ?? '') !== '') {
        $existing = db_row("SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1", [(string)$m['ngvVolunteerId']]);
    }
    if ($existing) {
        if ((string)$existing['status'] !== 'active') db_update('volunteers', ['status' => 'active', 'updatedAt' => now_iso()], ['id' => (int)$existing['id']]);
        if ((string)($existing['memberId'] ?? '') === '') db_update('volunteers', ['memberId' => $memberId, 'updatedAt' => now_iso()], ['id' => (int)$existing['id']]);
        // An NGG member made a volunteer serves NGG, whatever brought them in first.
        if ((string)($existing['programme'] ?? '') !== 'ngg') db_update('volunteers', ['programme' => 'ngg', 'programmeAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$existing['id']]);
        db_update('members', ['ngvVolunteerId' => (string)$existing['volunteerId'], 'ngvAt' => (string)($m['ngvAt'] ?? '') ?: now_iso(), 'updatedAt' => now_iso()], ['memberId' => $memberId]);
        $resent = !empty($p['sendId']) ? volunteer_send_id((string)$existing['volunteerId']) : null;
        /* Re-promoted, or a card resent: make sure the NGV account exists too
           (Afrovanguard answers "already" when it does). */
        $portal = function_exists('ngv_portal_announce') ? ngv_portal_announce($m, (string)$existing['volunteerId']) : ['status' => 'not_configured'];
        $out = ['ok' => true, 'already' => true, 'volunteerId' => (string)$existing['volunteerId'], 'volunteer' => volunteer_public($existing), 'ngvPortal' => $portal['status']];
        if ($resent !== null) $out['sent'] = $resent;
        return $out;
    }

    /* §20: progression is evidence of formation, never time served. A new
     * promotion has to say why, in the promoter's own words — and the check is
     * here rather than above so that the already-promoted branch (which is how
     * "Resend ID" reaches this function) is untouched. Re-sending somebody's
     * card is not a promotion and must not demand a justification for one.
     *
     * Eight characters is a floor against "ok", not a quality bar. The bar is
     * that the sentence is stored, attributed and readable six months later
     * beside what the promoter could see at the time. */
    $evidence = trim((string)($p['evidence'] ?? ''));
    if (mb_strlen($evidence) < 8) return ['ok' => false, 'error' => 'evidence_required'];
    $evidence = mb_substr($evidence, 0, 2000);
    /* Snapshotted BEFORE the promotion, so it is what the decision was made
     * against rather than what the promotion itself changed. */
    $readiness = function_exists('member_formation_readiness') ? member_formation_readiness($memberId) : null;

    $role = in_array((string)($p['role'] ?? ''), ['volunteer', 'instructor', 'mentor'], true) ? (string)$p['role'] : 'volunteer';
    $tier = vol_tier_for($role);
    $volunteerId = volunteer_display_id((string)$tier['code']);
    $token = 'VOLQR-' . strtoupper(rand_hex(4));
    while (db_row('SELECT id FROM qr_codes WHERE token = ?', [$token])) $token = 'VOLQR-' . strtoupper(rand_hex(4));
    $c = summer_ensure_cohort();

    db_insert('volunteers', [
        'volunteerId' => $volunteerId, 'memberId' => $memberId, 'applicationId' => null,
        'fullName' => (string)$m['fullName'], 'email' => (string)($m['email'] ?? ''), 'phone' => (string)($m['phone'] ?? ''),
        'role' => $role, 'courses' => '', 'centre' => (string)($m['centre'] ?? ''), 'faculty' => '',
        'token' => $token, 'photoUrl' => (string)($m['photoUrl'] ?? ''),
        'programme' => 'ngg', 'programmeAt' => now_iso(),
        'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_insert('qr_codes', ['token' => $token, 'batch' => 'VOL', 'cohortId' => $c['cohortId'], 'status' => 'assigned',
        'studentId' => $volunteerId, 'assignedName' => (string)$m['fullName'], 'createdAt' => now_iso(),
        'assignedAt' => now_iso(), 'expiresAt' => idcard_expiry_for()]);
    db_update('members', ['ngvVolunteerId' => $volunteerId, 'ngvAt' => now_iso(), 'updatedAt' => now_iso()], ['memberId' => $memberId]);

    /* The record §20 asks for: why, by whom, and what the formation record
       looked like at the time. Append-only — a later revoke writes its own row
       rather than erasing this one, because a member promoted, revoked and
       re-promoted has a history and the history is the point. */
    db_insert('member_promotions', [
        'memberId' => $memberId, 'fromStage' => 'NGG', 'toStage' => 'NGV',
        'evidence' => $evidence,
        'readiness' => $readiness ? json_encode($readiness, JSON_UNESCAPED_UNICODE) : null,
        'volunteerId' => $volunteerId,
        'byId' => (string)$g['requester']['memberId'],
        'byName' => (string)($g['requester']['fullName'] ?? ''),
        'at' => now_iso(),
    ]);
    /* The evidence sentence stays out of the audit meta, as the courage
       evidence and the weekly review's answers do: it is a judgement about a
       named child and the audit log has a wider readership than the formation
       record. That it exists is recorded; what it says lives with the child. */
    audit('member.promote.ngv', (string)$g['requester']['memberId'], $memberId, ['volunteerId' => $volunteerId, 'role' => $role, 'evidenced' => true], (string)($p['ip'] ?? ''));
    event_emit('member.promoted.ngv', ['memberId' => $memberId, 'volunteerId' => $volunteerId, 'name' => (string)$m['fullName']]);
    /* And their NGV account on Afrovanguard, where the programme runs. */
    $portal = function_exists('ngv_portal_announce') ? ngv_portal_announce($m, $volunteerId) : ['status' => 'not_configured'];
    // Deliver the digital ID by default so the new volunteer receives their
    // QR + welcome; suppressible with sendId:false.
    $send = array_key_exists('sendId', $p) ? !empty($p['sendId']) : true;
    $sent = $send ? volunteer_send_id($volunteerId) : [];
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ?', [$volunteerId]);
    return ['ok' => true, 'created' => true, 'volunteerId' => $volunteerId, 'sent' => $sent, 'volunteer' => volunteer_public($v) + ['token' => $token], 'ngvPortal' => $portal['status']];
}

/**
 * Reverse an NGV promotion. Deactivates the volunteer record (status → inactive,
 * which drops them from every active-volunteer view and blocks volunteer
 * check-in) and unlinks the member so their dashboard no longer shows NGV
 * standing. Non-destructive and reversible: the volunteers row, its QR token and
 * all attendance/hours history are preserved, so a later re-promote simply
 * re-activates and re-links the SAME record. Idempotent — a member who is not an
 * NGV is a no-op.
 */
function admin_member_demote_ngv(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $memberId = trim((string)($p['memberId'] ?? ''));
    if ($memberId === '') return ['ok' => false, 'error' => 'no_member'];
    $sg = admin_member_scope_gate($g['requester'], $memberId);
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    $vid = (string)($m['ngvVolunteerId'] ?? '');
    $v = $vid !== '' ? db_row("SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1", [$vid]) : null;
    if (!$v) $v = db_row("SELECT * FROM volunteers WHERE memberId = ? LIMIT 1", [$memberId]);
    if (!$v && $vid === '') return ['ok' => true, 'already' => true, 'note' => 'not_promoted'];
    if ($v) db_update('volunteers', ['status' => 'inactive', 'updatedAt' => now_iso()], ['id' => (int)$v['id']]);
    db_update('members', ['ngvVolunteerId' => '', 'ngvAt' => '', 'updatedAt' => now_iso()], ['memberId' => $memberId]);
    $doneVid = $vid !== '' ? $vid : (string)($v['volunteerId'] ?? '');
    audit('member.demote.ngv', (string)$g['requester']['memberId'], $memberId, ['volunteerId' => $doneVid], (string)($p['ip'] ?? ''));
    event_emit('member.demoted.ngv', ['memberId' => $memberId, 'volunteerId' => $doneVid]);
    /* And no longer a vanguard on Afrovanguard either. */
    $portal = ngv_portal_revoke($memberId, $doneVid, 'demoted');
    return ['ok' => true, 'demoted' => true, 'volunteerId' => $doneVid, 'ngvPortal' => $portal['status']];
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
        /* Lower-cased, because VOL_ROLES is. A volunteer whose row says "Mentor"
         * — from an import, or an admin edit — was counted into a bucket the
         * board never reads, so they filled no slot, appeared in no role total,
         * and still counted in "active volunteers". One more way the headline
         * stopped matching the rows underneath it. */
        $r = strtolower(trim((string)$v['role'])); $f = (string)($v['faculty'] ?? '');
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

/* ── Volunteer attendance analysis ───────────────────────────────────────────
 *
 * Volunteers check into the same roll as the children (summer.php writes their
 * scan into `attendance` keyed by volunteerId), so the raw material for this
 * has been accumulating all along — the board simply never counted anything
 * but today.
 *
 * Four decisions this file makes, because each of them changes the numbers and
 * none of them is obvious from the output:
 *
 * 1. THE DENOMINATOR IS PROGRAMME DAYS, NOT CALENDAR DAYS. programme_days_*()
 *    already knows which days the programme runs; a Sunday is not an absence.
 *    When no calendar is configured that function returns nothing at all, so
 *    we fall back to the days the roll was ACTUALLY taken and say so in the
 *    payload — an unset calendar must not silently turn into "every day".
 *
 * 2. EACH VOLUNTEER IS ONLY MEASURED FROM THE DAY THEY JOINED. Someone who
 *    signed up in week four did not miss weeks one to three.
 *
 * 3. A TRAILING DAY ON WHICH NOBODY AT ALL WAS RECORDED IS NOT COUNTED YET.
 *    Otherwise every volunteer's rate and streak collapse each morning until
 *    the desk opens the roll, which reads as a real drop and is not one.
 *    Interior empty days stay — a day the whole team missed is a finding.
 *
 * 4. THERE IS NO ROTA IN THIS SYSTEM. Expected days are programme days, so a
 *    volunteer who only ever committed to Saturdays reads low here through no
 *    fault of theirs. That is stated in the caveats rather than papered over
 *    by fitting each person's denominator to their own habits, which would
 *    make everybody look perfect by construction.
 */

/**
 * A hard ceiling on how many days one analysis may walk, NOT the default
 * window. The default is the whole term.
 *
 * It used to be the default, sliced to the last 30 programme days — which
 * quietly answered a different question from the one on screen. A coordinator
 * looking at the attendance page means "this term", the term start is already
 * set on the programme page, and a rolling 30-day figure drifts away from it
 * every morning: come week seven, week one had silently left the numbers with
 * nothing saying so.
 */
const VOL_ATT_MAX_DAYS = 400;
/** How many of those days the trend chart plots. */
const VOL_ATT_TREND = 14;
/** Below this many rateable volunteers the breakdown is a rumour, not a pattern. */
const VOL_ATT_MIN_MEASURED = 5;
/** How many of the most recent open days a volunteer's pattern strip shows. */
const VOL_ATT_PATTERN = 20;
/** Consecutive open days missed before "serves part-time" becomes "has stopped". */
const VOL_ATT_STOPPED_RUN = 3;

/** Reliability bands, high to low. Boundaries are inclusive lower bounds. */
const VOL_ATT_BANDS = [
    ['key' => 'every',    'min' => 90, 'label' => 'Almost every day', 'color' => '#2f9e44'],
    ['key' => 'reliable', 'min' => 75, 'label' => 'Reliable',         'color' => '#3b5bdb'],
    ['key' => 'patchy',   'min' => 50, 'label' => 'Patchy',           'color' => '#e8a92b'],
    ['key' => 'rare',     'min' => 0,  'label' => 'Rarely in',        'color' => '#e03131'],
];

function volunteer_att_band(int $rate): array {
    foreach (VOL_ATT_BANDS as $b) if ($rate >= $b['min']) return $b;
    return VOL_ATT_BANDS[count(VOL_ATT_BANDS) - 1];
}

/**
 * The days the window is measured over, most recent last.
 *
 * DEFAULT: the whole term as configured on the programme page — start date to
 * today, programme days only. That is the window a coordinator means, it is
 * already written down in one place, and it does not move under them.
 *
 * `from`/`to` narrow it when somebody asks a narrower question (last week, one
 * bad Tuesday), and are clamped INSIDE the term: a range that starts before the
 * programme did would count days it was not open as days a volunteer missed.
 *
 * 'calendar' basis is the honest one. 'observed' is the fallback for a site that
 * never set the term dates: the distinct dates somebody was marked present. It
 * answers a slightly different question — "of the days we ran the roll, how many
 * did you make?" — and the caller has to say which it got.
 */
function volunteer_attendance_days(array $opts = []): array {
    $cfg = programme_settings();
    $from = trim((string)($opts['from'] ?? ''));
    $to   = trim((string)($opts['to'] ?? ''));
    $ymd  = fn(string $d) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) === 1 ? $d : '';
    $from = $ymd($from); $to = $ymd($to);
    if ($from !== '' && $to !== '' && $from > $to) [$from, $to] = [$to, $from];

    $term = programme_days_elapsed(null, $cfg);
    if ($term) {
        $days = $term;
        if ($from !== '') $days = array_values(array_filter($days, fn($d) => $d >= $from));
        if ($to !== '')   $days = array_values(array_filter($days, fn($d) => $d <= $to));
        return ['days' => array_slice($days, -VOL_ATT_MAX_DAYS), 'basis' => 'calendar',
                'termStart' => (string)$cfg['startDate'], 'termEnd' => (string)$cfg['endDate'],
                'narrowed' => $from !== '' || $to !== ''];
    }
    /* No calendar: the days the VOLUNTEER roll was actually taken.
     *
     * This counted every distinct date in the attendance table, which is
     * dominated by the children's check-ins — three hundred pupils scanned on a
     * Tuesday made Tuesday a day every volunteer had missed, whether or not any
     * volunteer was ever expected. On a site with no programme calendar that
     * fabricated absences by the dozen and drove every rate on the board
     * towards nonsense. The join is the whole fix: a day is a volunteer day when
     * a volunteer was marked on it. */
    $sql = 'SELECT DISTINCT a.date d FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId';
    $args = []; $where = [];
    if ($from !== '') { $where[] = 'a.date >= ?'; $args[] = $from; }
    if ($to !== '')   { $where[] = 'a.date <= ?'; $args[] = $to; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $rows = array_map(fn($r) => ['date' => $r['d']],
        db_all($sql . ' ORDER BY a.date DESC LIMIT ' . (int)VOL_ATT_MAX_DAYS, $args));
    $days = array_reverse(array_map(fn($r) => (string)$r['date'], $rows));
    return ['days' => $days, 'basis' => 'observed', 'termStart' => '', 'termEnd' => '',
            'narrowed' => $from !== '' || $to !== ''];
}

/**
 * Attendance over a window for every active volunteer, plus the rollups the
 * public board draws: trend, reliability bands, per-centre and per-role rates.
 *
 * `$only` mirrors the board's centre allow-list (empty = all centres).
 * `$opts` may carry from/to to narrow the window inside the term.
 */
function volunteer_attendance_analysis(array $only = [], array $opts = []): array {
    $win = volunteer_attendance_days($opts);
    $days = $win['days'];
    $vols = [];
    foreach (db_all("SELECT volunteerId, role, centre, createdAt FROM volunteers WHERE status = 'active'") as $v) {
        if ($only && !in_array((string)$v['centre'], $only, true)) continue;
        $vols[(string)$v['volunteerId']] = $v;
    }
    $empty = [
        'measurable' => false, 'basis' => $win['basis'], 'days' => 0, 'from' => '', 'to' => '',
        'kpis' => ['rate' => null, 'onTimePct' => null, 'sessions' => 0, 'expected' => 0, 'absences' => 0,
                   'lateSessions' => 0, 'halfDays' => 0, 'avgLateMinutes' => null, 'measured' => 0, 'reliable' => 0],
        'trend' => [], 'bands' => [], 'byCentre' => [], 'byRole' => [], 'perVolunteer' => [],
        /* Empty, not zeroed — the same contract the children's board keeps. "We
           cannot say yet" and "nobody has left" are different claims, and a
           consumer must not be able to render the reassuring one by accident. */
        'retention' => [],
        'pendingDays' => 0, 'caveats' => [],
    ];
    if (!$days || !$vols) {
        $empty['caveats'][] = !$days
            ? 'No programme days have run in this window yet, so there is nothing to measure attendance against.'
            : 'No active volunteers are on the board for these centres.';
        return $empty;
    }

    // Every volunteer attendance row in the window, in one pass.
    $from = $days[0]; $to = $days[count($days) - 1];
    $marks = [];      // vid => date => ['late'=>bool,'halfDay'=>bool,'lateMinutes'=>int]
    $rollOn = [];     // date => how many volunteers were recorded
    $dayset = array_flip($days);
    foreach (db_all("SELECT a.studentId vid, a.date d, a.status st, a.lateMinutes lm, a.halfDay hd
                     FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId
                     WHERE a.date >= ? AND a.date <= ? AND v.status = 'active'", [$from, $to]) as $r) {
        $vid = (string)$r['vid']; $d = (string)$r['d'];
        /* Only the days and people this window is about get carried. Every
         * read below walks $days and $vols, so this is a bound on what is
         * held in memory rather than a correctness gate — the rate cannot
         * exceed 100% either way, because a cancelled day leaves the
         * numerator and the denominator together. */
        if (!isset($dayset[$d]) || !isset($vols[$vid])) continue;
        $marks[$vid][$d] = ['late' => (string)$r['st'] === 'late', 'halfDay' => (int)($r['hd'] ?? 0) === 1,
                            'lateMinutes' => max(0, (int)($r['lm'] ?? 0))];
        $rollOn[$d] = ($rollOn[$d] ?? 0) + 1;
    }

    /* Decision 3: trim the trailing days nobody has been marked on. Those are
     * rolls that have not been taken, not days the whole team missed. */
    $pending = 0;
    while ($days && empty($rollOn[$days[count($days) - 1]])) { array_pop($days); $pending++; }
    if (!$days) {
        $empty['pendingDays'] = $pending;
        $empty['caveats'][] = 'The roll has not been taken on any day in this window yet.';
        return $empty;
    }
    $to = $days[count($days) - 1];

    $joinOf = [];
    foreach ($vols as $vid => $v) {
        $c = substr((string)($v['createdAt'] ?? ''), 0, 10);
        $joinOf[$vid] = preg_match('/^\d{4}-\d{2}-\d{2}$/', $c) ? $c : '';
    }

    $per = []; $cAgg = []; $rAgg = []; $bandCount = [];
    $tSessions = 0; $tExpected = 0; $tLate = 0; $tHalf = 0; $tLateMin = 0;
    foreach ($vols as $vid => $v) {
        $join = $joinOf[$vid];
        $mine = array_values(array_filter($days, fn($d) => $join === '' || $d >= $join));
        $expected = count($mine);
        $mk = $marks[$vid] ?? [];
        $sessions = 0; $late = 0; $half = 0; $lateMin = 0; $lastSeen = '';
        foreach ($mine as $d) {
            if (!isset($mk[$d])) continue;
            $sessions++;
            if ($mk[$d]['late']) { $late++; $lateMin += $mk[$d]['lateMinutes']; }
            if ($mk[$d]['halfDay']) $half++;
            $lastSeen = $d;
        }
        // Streak: back from the most recent measured day, until a miss.
        $streak = 0;
        for ($i = count($mine) - 1; $i >= 0; $i--) { if (!isset($mk[$mine[$i]])) break; $streak++; }
        /* And its mirror, which is the one somebody acts on. A rate cannot tell
         * a volunteer who serves two days a week from one who has quietly
         * stopped turning up — both sit near 40% — and "last seen 14 July"
         * makes the reader do the arithmetic before they can notice. */
        $missedRun = 0;
        for ($i = count($mine) - 1; $i >= 0; $i--) { if (isset($mk[$mine[$i]])) break; $missedRun++; }
        // The last few open days as a shape, so the pattern is visible at a glance.
        $pattern = [];
        foreach (array_slice($mine, -VOL_ATT_PATTERN) as $d) {
            $pattern[] = !isset($mk[$d]) ? 'out' : ($mk[$d]['halfDay'] ? 'half' : ($mk[$d]['late'] ? 'late' : 'in'));
        }
        $rate = $expected > 0 ? (int)round($sessions / $expected * 100) : null;
        $per[$vid] = [
            'sessions' => $sessions, 'expected' => $expected, 'rate' => $rate,
            'late' => $late, 'onTime' => max(0, $sessions - $late), 'halfDay' => $half,
            'onTimePct' => $sessions > 0 ? (int)round(($sessions - $late) / $sessions * 100) : null,
            'streak' => $streak, 'missedRun' => $missedRun, 'pattern' => $pattern,
            'stopped' => $sessions > 0 && $missedRun >= VOL_ATT_STOPPED_RUN,
            'lastSeen' => $lastSeen,
            'band' => $rate === null ? '' : volunteer_att_band($rate)['key'],
            /* Which of the four retention states this volunteer is in. Named on
             * the row as well as counted in the aggregate, so the register and
             * the retention panel cannot disagree about one person.
             *
             * `new` is the state volunteers need and children did not. A cohort
             * of children starts together; volunteers trickle in all term, so
             * somebody approved on Thursday has had no chance to establish
             * anything. Counting them as "never came" would put a phone call on
             * a coordinator's list that should not be there — and, worse, would
             * make the retention figure look bad every time recruitment went
             * well. */
            'retention' => $expected < VOL_ATT_STOPPED_RUN ? 'new'
                : ($sessions === 0 ? 'never'
                : ($missedRun >= VOL_ATT_STOPPED_RUN ? 'stopped' : 'coming')),
        ];
        $tSessions += $sessions; $tExpected += $expected; $tLate += $late; $tHalf += $half; $tLateMin += $lateMin;

        $cn = (string)($v['centre'] ?? ''); $ro = (string)($v['role'] ?? '');
        $add = function (array &$bucket, string $key) use ($sessions, $expected, $late) {
            if ($key === '') return;
            $bucket[$key] = $bucket[$key] ?? ['people' => 0, 'sessions' => 0, 'expected' => 0, 'late' => 0];
            $bucket[$key]['people']++; $bucket[$key]['sessions'] += $sessions;
            $bucket[$key]['expected'] += $expected; $bucket[$key]['late'] += $late;
        };
        $add($cAgg, $cn); $add($rAgg, $ro);
        /* A volunteer with one or two eligible days has no rate worth banding —
         * one absence would read as 50% "patchy". They are counted as measured
         * nowhere, which is why `measured` is reported next to the rate. */
        if ($expected >= 3 && $rate !== null) {
            $b = volunteer_att_band($rate)['key'];
            $bandCount[$b] = ($bandCount[$b] ?? 0) + 1;
        }
    }

    // Trend: present vs eligible, per day, over the tail of the window.
    $trend = [];
    foreach (array_slice($days, -VOL_ATT_TREND) as $d) {
        $present = 0; $eligible = 0; $lateD = 0;
        foreach ($vols as $vid => $v) {
            if ($joinOf[$vid] !== '' && $d < $joinOf[$vid]) continue;
            $eligible++;
            if (isset($marks[$vid][$d])) { $present++; if ($marks[$vid][$d]['late']) $lateD++; }
        }
        $trend[] = ['date' => $d, 'label' => gmdate('D j M', (int)strtotime($d . ' 00:00:00 UTC')),
                    'present' => $present, 'eligible' => $eligible, 'late' => $lateD,
                    'rate' => $eligible > 0 ? (int)round($present / $eligible * 100) : 0];
    }

    $roll = function (array $agg, string $keyName) {
        $out = [];
        foreach ($agg as $k => $a) {
            $rate = $a['expected'] > 0 ? (int)round($a['sessions'] / $a['expected'] * 100) : null;
            $out[] = [$keyName => (string)$k, 'people' => $a['people'], 'sessions' => $a['sessions'],
                      'expected' => $a['expected'], 'absences' => max(0, $a['expected'] - $a['sessions']),
                      'late' => $a['late'], 'onTime' => max(0, $a['sessions'] - $a['late']),
                      'rate' => $rate, 'onTimePct' => $a['sessions'] > 0 ? (int)round(($a['sessions'] - $a['late']) / $a['sessions'] * 100) : null,
                      'band' => $rate === null ? '' : volunteer_att_band($rate)['key']];
        }
        usort($out, fn($x, $y) => ($y['rate'] ?? -1) <=> ($x['rate'] ?? -1) ?: strcmp($x[$keyName], $y[$keyName]));
        return $out;
    };

    $bands = [];
    foreach (VOL_ATT_BANDS as $b) $bands[] = $b + ['count' => $bandCount[$b['key']] ?? 0];
    $measured = array_sum($bandCount);

    /* ── Are we KEEPING our volunteers? ───────────────────────────────────────
     *
     * A rate answers "how full were the sessions". It cannot answer this, and it
     * hides the answer in the flattering direction: a volunteer who stops coming
     * leaves the numerator AND the denominator together, so a centre that has
     * lost two of its three mentors still reports a healthy rate off the one who
     * remains. `bands` cannot answer it either — it only counts volunteers with
     * three or more expected days, so somebody who came twice and vanished
     * appears in no band at all.
     *
     * The children's board learned this (see attendance_retention()); the
     * volunteer side had the per-person `stopped` flag and nothing that added it
     * up, so the register could show one stopped mentor per screen and never
     * that a centre had lost its whole faculty.
     *
     * FOUR states, not three, and they sum to the headcount:
     *   coming   served in the closing run of open days
     *   stopped  served at some point, then missed the last VOL_ATT_STOPPED_RUN
     *   never    had eligible days and served none of them
     *   new      too few eligible days to say anything — see the note on the row
     *
     * Per centre AND per role, because they fail differently: a centre losing
     * mentors is a supervision problem, and a ROLE losing people everywhere is a
     * problem with the role itself. */
    $retention = ['stoppedRun' => VOL_ATT_STOPPED_RUN, 'people' => 0,
                  'coming' => 0, 'stopped' => 0, 'never' => 0, 'new' => 0];
    $retBy = ['centre' => [], 'role' => []];
    foreach ($vols as $vid => $v) {
        $st = $per[$vid]['retention'] ?? 'new';
        $retention['people']++; $retention[$st]++;
        foreach (['centre' => (string)($v['centre'] ?? ''), 'role' => strtolower(trim((string)($v['role'] ?? '')))] as $dim => $key) {
            if ($key === '') continue;
            $retBy[$dim][$key] = $retBy[$dim][$key] ?? ['people' => 0, 'coming' => 0, 'stopped' => 0, 'never' => 0, 'new' => 0];
            $retBy[$dim][$key]['people']++; $retBy[$dim][$key][$st]++;
        }
    }
    /* `settled` is the honest denominator for a percentage: the people who have
     * been here long enough for the question to mean anything. Dividing by the
     * headcount instead would report a programme as losing volunteers every time
     * it recruited some. Returned rather than left implicit, because a reader
     * cannot otherwise tell which denominator a percentage used. */
    $pct = function (array $r) {
        $settled = $r['people'] - $r['new'];
        return $r + ['settled' => $settled,
                     'stoppedPct' => $settled > 0 ? round($r['stopped'] / $settled * 100, 1) : 0.0,
                     'neverPct'   => $settled > 0 ? round($r['never'] / $settled * 100, 1) : 0.0];
    };
    $retention = $pct($retention);
    foreach (['centre', 'role'] as $dim) {
        $rows = [];
        foreach ($retBy[$dim] as $k => $r) $rows[] = $pct($r) + [$dim => (string)$k];
        // Worst first — the point of the table is the site or role in trouble.
        usort($rows, fn($x, $y) => ($y['stopped'] + $y['never']) <=> ($x['stopped'] + $x['never'])
                                   ?: strcmp((string)$x[$dim], (string)$y[$dim]));
        $retention['by' . ucfirst($dim)] = $rows;
    }

    $caveats = [];
    if ($win['basis'] === 'observed') $caveats[] =
        'The programme calendar has not been set, so this is measured against the days the roll was actually '
        . 'taken rather than the days the programme was scheduled to run.';
    $caveats[] =
        'Expected days are programme days since a volunteer joined. There is no rota in the system, so someone '
        . 'who agreed to come one day a week reads low here — the number is days served out of days open, not a '
        . 'judgement on whether they kept their commitment.';
    if ($pending > 0) $caveats[] =
        $pending . ' more programme day(s) have opened with no roll taken yet; they are left out rather than '
        . 'counted as absences.';
    if ($measured < VOL_ATT_MIN_MEASURED) $caveats[] =
        'Only ' . $measured . ' volunteer(s) have been on the board long enough (3+ days) to have a rate. '
        . 'The breakdown below is too thin to read as a pattern.';

    return [
        'measurable' => true, 'basis' => $win['basis'],
        'days' => count($days), 'from' => $days[0], 'to' => $to, 'pendingDays' => $pending,
        /* Where the window came from, so the screen can name it instead of
           printing a day count the reader has to guess the meaning of. */
        'termStart' => (string)($win['termStart'] ?? ''), 'termEnd' => (string)($win['termEnd'] ?? ''),
        'narrowed' => !empty($win['narrowed']),
        'scope' => !empty($win['narrowed']) ? 'range' : ($win['basis'] === 'calendar' ? 'term' : 'observed'),
        'kpis' => [
            'rate' => $tExpected > 0 ? (int)round($tSessions / $tExpected * 100) : null,
            'onTimePct' => $tSessions > 0 ? (int)round(($tSessions - $tLate) / $tSessions * 100) : null,
            'sessions' => $tSessions, 'expected' => $tExpected,
            'absences' => max(0, $tExpected - $tSessions),
            'lateSessions' => $tLate, 'halfDays' => $tHalf,
            'avgLateMinutes' => $tLate > 0 ? (int)round($tLateMin / $tLate) : null,
            'measured' => $measured,
            'reliable' => ($bandCount['every'] ?? 0) + ($bandCount['reliable'] ?? 0),
        ],
        'trend' => $trend, 'bands' => $bands,
        'retention' => $retention,
        'byCentre' => $roll($cAgg, 'centre'), 'byRole' => $roll($rAgg, 'role'),
        'perVolunteer' => $per,
        'caveats' => $caveats,
    ];
}

/** Full per-centre + global fulfilment structure (shared by public board). */
function volunteer_status_compute(): array {
    $centres = db_all("SELECT centreId, name, code, color, address, area, leadVolunteerId, meetDays, meetTime FROM centres WHERE status = 'active' ORDER BY name");
    $needsRows = db_all('SELECT centreId, role, faculty, needCount FROM volunteer_needs');
    // Index needs: role-level (faculty='') and faculty-level.
    $roleNeed = []; $facNeed = [];
    foreach ($needsRows as $n) {
        $cid = (string)$n['centreId']; $r = (string)$n['role']; $f = (string)($n['faculty'] ?? '');
        if ($f === '') $roleNeed[$cid . '|' . $r] = (int)$n['needCount'];
        else { $facNeed[$cid . '|' . $r . '|' . $f] = (int)$n['needCount']; $facNeed['sum|' . $cid . '|' . $r] = ($facNeed['sum|' . $cid . '|' . $r] ?? 0) + (int)$n['needCount']; }
    }
    $filled = volunteer_filled_index();
    $items = item_needs_compute();

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
            'items' => $items['byCentre'][$name] ?? [],
        ] + centre_public_meta($c);
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
            'itemNeed' => $items['totalNeed'], 'itemFilled' => $items['totalFilled'], 'itemGap' => $items['totalGap'],
            'itemTypes' => $items['types'], 'itemStillNeeded' => $items['stillNeeded'], 'itemOpen' => $items['open'],
        ],
        'byCentre' => $byCentre,
    ];
}

/**
 * The volunteer half of the attendance register — NAMED, for staff.
 *
 * The public board shows handles because it is public. The coordinator's
 * attendance page showed nothing at all: every query on it joins
 * summer_students, deliberately, so that volunteer check-ins cannot skew the
 * children's rate — and the effect was that the people running the centre were
 * invisible on the one screen about who turned up. Their scans were in the
 * table the whole time.
 *
 * Same window as the students' figures, same definitions, and the same honest
 * denominator: programme days since the volunteer joined.
 */
function admin_volunteer_attendance(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $opts = ['from' => (string)($p['from'] ?? ''), 'to' => (string)($p['to'] ?? '')];
    $centre = trim((string)($p['centre'] ?? ''));
    $a = volunteer_attendance_analysis($centre !== '' ? [$centre] : [], $opts);
    $per = $a['perVolunteer'] ?? [];
    unset($a['perVolunteer']);

    $rows = [];
    $today = attendance_today();
    $in = db_all("SELECT studentId FROM attendance WHERE date = ?", [$today]);
    $todayBy = []; foreach ($in as $r) $todayBy[(string)$r['studentId']] = true;
    $vList = db_all("SELECT volunteerId, fullName, firstName, lastName, role, centre, faculty, createdAt
                     FROM volunteers WHERE status = 'active' ORDER BY fullName");
    /* Policy standing, for real.
     *
     * This read used to be absent and `scenarios['flagged']` was hardcoded to
     * zero, under a comment saying volunteers carry no policy standing. They do:
     * `policy_states_for()` has taken a type since it was written, the policy
     * settings define a volunteer redline (09:00), an absence limit and a
     * lateness cap of four, and the enforcement pass already walks volunteers
     * (see policy.php). So the register offered a filter that could never match
     * anything, and a volunteer two lates from suspension looked exactly like a
     * volunteer in good standing on the one screen a coordinator reads.
     *
     * One batched read for the whole roster, the same call the children's
     * register makes — so a warning means the same thing on both screens. */
    $stateBy = policy_states_for(array_map(fn($v) => (string)$v['volunteerId'], $vList), 'volunteer');
    $vPolicy = policy_for('volunteer');
    foreach ($vList as $v) {
        $vid = (string)$v['volunteerId'];
        if ($centre !== '' && (string)$v['centre'] !== $centre) continue;
        $w = $per[$vid] ?? null;
        $name = trim((string)($v['fullName'] ?? ''));
        if ($name === '') $name = trim(((string)($v['firstName'] ?? '')) . ' ' . ((string)($v['lastName'] ?? '')));
        $rows[] = [
            'volunteerId' => $vid, 'fullName' => $name ?: $vid,
            'role' => (string)$v['role'], 'centre' => (string)$v['centre'],
            'faculty' => (string)($v['faculty'] ?? ''),
            'joined' => substr((string)($v['createdAt'] ?? ''), 0, 10),
            'present' => $w['sessions'] ?? 0, 'expected' => $w['expected'] ?? 0,
            'rate' => $w['rate'] ?? null, 'lates' => $w['late'] ?? 0,
            'halfDays' => $w['halfDay'] ?? 0, 'onTimePct' => $w['onTimePct'] ?? null,
            'streak' => $w['streak'] ?? 0, 'lastSeen' => $w['lastSeen'] ?? '',
            'missedRun' => $w['missedRun'] ?? 0, 'pattern' => $w['pattern'] ?? [],
            'stopped' => !empty($w['stopped']),
            /* Which of the four retention states, straight off the analysis, so
               the row and the retention panel are the same opinion. */
            'retention' => $w['retention'] ?? 'new',
            'band' => $w['band'] ?? '', 'presentToday' => isset($todayBy[$vid]),
            // Policy standing, same shape and same words as the children's register.
            'state' => $stateBy[$vid]['state'] ?? 'clear',
            'absences' => $stateBy[$vid]['absences'] ?? 0,
            /* Lates against the cap the policy actually sets for volunteers, so
               "two more and it is a suspension" is readable rather than something
               a coordinator has to know by heart. */
            'lateCap' => (int)($vPolicy['latenessCap'] ?? 0),
        ];
    }
    /* Counts over the WHOLE roster, so a chip says how many exist.
     *
     * `never` means HAD eligible days and served none of them. It used to mean
     * `present === 0` regardless of how long the volunteer had been on the
     * board, which put every volunteer approved this week onto the same list as
     * one placed a month ago who has never appeared — two situations needing
     * opposite responses, one of them "do nothing". `new` is the count that was
     * hiding inside the old number, and it is reported rather than dropped so
     * the two still add up to what the old chip showed. */
    $scen = [
        'all'     => count($rows),
        'present' => count(array_filter($rows, fn($r) => $r['presentToday'])),
        'absent'  => count(array_filter($rows, fn($r) => !$r['presentToday'])),
        'never'   => count(array_filter($rows, fn($r) => ($r['retention'] ?? '') === 'never')),
        'new'     => count(array_filter($rows, fn($r) => ($r['retention'] ?? '') === 'new')),
        'stopped' => count(array_filter($rows, fn($r) => !empty($r['stopped']))),
        'atrisk'  => count(array_filter($rows, fn($r) => ($r['rate'] ?? 0) < 50)),
        'late'    => count(array_filter($rows, fn($r) => ($r['lates'] ?? 0) > 0)),
        'half'    => count(array_filter($rows, fn($r) => ($r['halfDays'] ?? 0) > 0)),
        // No longer a chip that can never match — see the policy read above.
        'flagged' => count(array_filter($rows, fn($r) => ($r['state'] ?? 'clear') !== 'clear')),
        'perfect' => count(array_filter($rows, fn($r) => ($r['rate'] ?? 0) >= 100)),
    ];
    // Search and situation on the server, for the same reason as the children's
    // register: a filter that runs after a cap answers a different question.
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $scenario = (string)($p['scenario'] ?? 'all');
    $keep = function (array $r) use ($scenario) {
        switch ($scenario) {
            case 'present': return !empty($r['presentToday']);
            case 'absent':  return empty($r['presentToday']);
            case 'never':   return ($r['retention'] ?? '') === 'never';
            case 'new':     return ($r['retention'] ?? '') === 'new';
            case 'stopped': return !empty($r['stopped']);
            case 'atrisk':  return ($r['rate'] ?? 0) < 50;
            case 'late':    return ($r['lates'] ?? 0) > 0;
            case 'half':    return ($r['halfDays'] ?? 0) > 0;
            case 'flagged': return ($r['state'] ?? 'clear') !== 'clear';
            case 'perfect': return ($r['rate'] ?? 0) >= 100;
            default:        return true;
        }
    };
    $out = [];
    foreach ($rows as $r) {
        if (!$keep($r)) continue;
        if ($q !== '' && mb_strpos(mb_strtolower($r['fullName'] . ' ' . $r['volunteerId'] . ' '
            . $r['role'] . ' ' . $r['centre'] . ' ' . $r['faculty']), $q) === false) continue;
        $out[] = $r;
    }
    $sort = (string)($p['sort'] ?? 'rate');
    if ($sort === 'name')     usort($out, fn($x, $y) => strcasecmp($x['fullName'], $y['fullName']));
    elseif ($sort === 'seen') usort($out, fn($x, $y) => strcmp((string)$y['lastSeen'], (string)$x['lastSeen']));
    elseif ($sort === 'best') usort($out, fn($x, $y) => ($y['rate'] ?? -1) <=> ($x['rate'] ?? -1));
    // Lowest rate first, same as the student register: the useful end is the top.
    else usort($out, fn($x, $y) => ($x['rate'] ?? 101) <=> ($y['rate'] ?? 101) ?: strcmp($x['fullName'], $y['fullName']));
    return ['ok' => true, 'volunteers' => ['summary' => $a, 'roster' => $out,
        'total' => count($rows), 'matched' => count($out), 'scenarios' => $scen,
        'q' => $q, 'scenario' => $scenario, 'sort' => $sort]];
}

/** Public, PII-free volunteer fulfilment board (powers /v-status). */
function public_volunteer_status(array $p): array {
    $page = status_pages_config()['volunteer'];
    if (empty($page['published'])) return ['ok' => true, 'status' => ['page' => $page, 'generatedAt' => now_iso()]];
    $s = volunteer_status_compute();
    // Admin can limit which centres appear (empty = all). KPIs stay programme-wide.
    $only = is_array($page['centres'] ?? null) ? $page['centres'] : [];
    $byCentre = $only ? array_values(array_filter($s['byCentre'], fn($c) => in_array((string)$c['name'], $only, true))) : $s['byCentre'];

    // Attendance today — volunteers check into the same roll as students, so
    // the board reflects who turned up and who ran late. present = on-time +
    // late; on-time counts an early/punctual check-in against the resumption
    // time (see attendance_punctuality).
    $today = gmdate('Y-m-d');
    $attByCentre = [];
    foreach (db_all("SELECT v.centre AS centre, a.status AS st, COUNT(DISTINCT a.studentId) c
                     FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId
                     WHERE a.date = ? AND v.status = 'active' GROUP BY v.centre, a.status", [$today]) as $r) {
        $cn = (string)$r['centre'];
        $attByCentre[$cn] = $attByCentre[$cn] ?? ['present' => 0, 'late' => 0];
        $attByCentre[$cn]['present'] += (int)$r['c'];
        if ((string)$r['st'] === 'late') $attByCentre[$cn]['late'] += (int)$r['c'];
    }
    // How many active volunteers each centre actually HAS, from the roster.
    $rosterAt = [];
    foreach (db_all("SELECT centre, COUNT(*) c FROM volunteers WHERE status = 'active' AND centre <> '' GROUP BY centre") as $r) {
        $rosterAt[(string)$r['centre']] = (int)$r['c'];
    }
    $vPresent = 0; $vLate = 0;
    foreach ($byCentre as &$bc) {
        $a = $attByCentre[(string)$bc['name']] ?? ['present' => 0, 'late' => 0];
        /* `active` is the HEADCOUNT, not `filled`.
         *
         * filled is a fulfilment figure: how many of the role slots an admin
         * defined are taken. Using it as an attendance denominator conflated two
         * different questions and produced arithmetic nobody could defend — a
         * centre with three volunteers and two defined slots read "3 of 2 in
         * today", because present counts people and filled counts slots. */
        $bc['attendance'] = ['present' => $a['present'], 'late' => $a['late'],
            'onTime' => max(0, $a['present'] - $a['late']),
            'active' => $rosterAt[(string)$bc['name']] ?? 0,
            'filled' => (int)($bc['filled'] ?? 0)];
        $vPresent += $a['present']; $vLate += $a['late'];
    }
    unset($bc);
    /* WHERE THE 14 WENT.
     *
     * The board printed "14 active volunteers" above rows that added up to 5,
     * and left the reader to work out — or not notice — the difference. Three
     * separate things hid in that gap: volunteers with no centre recorded,
     * volunteers whose centre is no longer an active one (renamed, closed), and
     * volunteers the board's own centre filter is hiding. Every attendance
     * denominator on the page is drawn from the placed ones, so the same nine
     * people were missing from the rates as well.
     *
     * Counted here and stated on the board, because a headline its own rows
     * contradict is worse than a smaller headline: it makes every other figure
     * on the page look wrong too, and there is no way for a reader to tell
     * which one to trust. */
    $activeRows = db_all("SELECT centre FROM volunteers WHERE status = 'active'");
    $liveCentres = [];
    foreach (db_all("SELECT name FROM centres WHERE status = 'active'") as $c) $liveCentres[(string)$c['name']] = true;
    $shown = []; foreach ($byCentre as $c) $shown[(string)$c['name']] = true;
    $placed = 0; $unplaced = 0; $offBoard = 0; $hidden = 0;
    foreach ($activeRows as $v) {
        $cn = trim((string)($v['centre'] ?? ''));
        if ($cn === '') { $unplaced++; continue; }
        if (!isset($liveCentres[$cn])) { $offBoard++; continue; }
        if (!isset($shown[$cn])) { $hidden++; continue; }
        $placed++;
    }
    $kpis = $s['kpis'] + [
        'presentToday' => $vPresent, 'lateToday' => $vLate, 'onTimeToday' => max(0, $vPresent - $vLate),
        'placedVolunteers' => $placed, 'unplacedVolunteers' => $unplaced,
        'offBoardVolunteers' => $offBoard, 'hiddenVolunteers' => $hidden,
    ];

    /* Today is a snapshot; this is the record. Rates over the window, per
     * centre and per role, so a reader can tell a bad morning from a pattern. */
    $att = volunteer_attendance_analysis($only);
    $attRate = [];
    foreach ($att['byCentre'] as $r) $attRate[(string)$r['centre']] = $r;
    foreach ($byCentre as &$bc2) {
        $r = $attRate[(string)$bc2['name']] ?? null;
        $bc2['attendance'] = $bc2['attendance'] + [
            'rate' => $r['rate'] ?? null, 'sessions' => $r['sessions'] ?? 0,
            'expected' => $r['expected'] ?? 0, 'onTimePct' => $r['onTimePct'] ?? null,
        ];
    }
    unset($bc2);

    // Public volunteer directory — shown by HANDLE. A volunteer's face and first
    // name appear ONLY when they granted the site-visibility consent; everyone
    // else shows an anonymous handle and a role initial. Never a surname, email
    // or phone.
    $colorByCentre = []; foreach ($byCentre as $c) $colorByCentre[(string)$c['name']] = (string)$c['color'];
    // Lifetime session counts in one query rather than one per volunteer.
    $lifetime = [];
    foreach (db_all("SELECT a.studentId vid, COUNT(*) c FROM attendance a
                     JOIN volunteers v ON v.volunteerId = a.studentId
                     WHERE v.status = 'active' GROUP BY a.studentId") as $r) {
        $lifetime[(string)$r['vid']] = (int)$r['c'];
    }
    $directory = [];
    foreach (db_all("SELECT volunteerId, fullName, firstName, lastName, role, centre, faculty, courses, photoUrl, visibilityConsent, createdAt FROM volunteers WHERE status = 'active' ORDER BY id") as $v) {
        if ($only && !in_array((string)$v['centre'], $only, true)) continue;
        $consent = (int)($v['visibilityConsent'] ?? 0) === 1;
        $first = trim((string)($v['firstName'] ?? '')); if ($first === '') $first = explode(' ', (string)$v['fullName'])[0] ?? 'Volunteer';
        $lastInit = strtolower(substr(trim((string)($v['lastName'] ?? '')), 0, 1));
        $handle = $consent
            ? ('@' . strtolower(preg_replace('/[^a-z]/i', '', $first)) . ($lastInit ? '.' . $lastInit : ''))
            : ('@vol-' . substr(md5((string)$v['volunteerId']), 0, 4));
        $courses = json_decode((string)($v['courses'] ?? ''), true) ?: [];
        $wk = 1; if (!empty($v['createdAt'])) { $days = (int)floor((time() - strtotime((string)$v['createdAt'])) / 86400); $wk = max(1, (int)floor($days / 7) + 1); }
        /* The window stats travel with the handle, never with the volunteerId
         * — the handle is a hash of that id, so shipping both would undo the
         * pseudonymity the rest of this function is built around. */
        $w = $att['perVolunteer'][(string)$v['volunteerId']] ?? null;
        $directory[] = [
            'handle' => $handle,
            'initial' => strtoupper(substr($consent ? $first : (string)$v['role'], 0, 1)),
            'role' => (string)$v['role'], 'centre' => (string)$v['centre'], 'color' => $colorByCentre[(string)$v['centre']] ?? '#7c4dff',
            'faculty' => (string)($v['faculty'] ?? ''), 'course' => (string)($courses[0] ?? ''),
            'face' => $consent ? (string)($v['photoUrl'] ?? '') : '',
            'sessions' => $lifetime[(string)$v['volunteerId']] ?? 0,
            'sinceWk' => $wk,
            'window' => $w ? [
                'sessions' => $w['sessions'], 'expected' => $w['expected'], 'rate' => $w['rate'],
                'late' => $w['late'], 'onTime' => $w['onTime'], 'onTimePct' => $w['onTimePct'],
                'streak' => $w['streak'], 'band' => $w['band'],
            ] : null,
        ];
    }

    // Per-person rows are keyed by volunteerId; the board never sees that key.
    unset($att['perVolunteer']);

    return ['ok' => true, 'status' => [
        'generatedAt' => now_iso(),
        'page' => $page,
        'program' => ['name' => 'Next Generation Genius', 'year' => (int)gmdate('Y')],
        'kpis' => $kpis,
        'byCentre' => $byCentre,
        'attendance' => $att,
        'directory' => $directory,
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
    // Item (material) needs, grouped per centre for the editor.
    $items = db_all('SELECT centreId, item, needCount, filledCount, unit, note, updatedAt FROM item_needs ORDER BY centreId, item');
    return ['ok' => true, 'centres' => $centres, 'roles' => VOL_ROLES, 'faculties' => volunteer_faculty_options(), 'needs' => $needs, 'filled' => $filledOut, 'items' => $items];
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

/* ── Material (item) needs ──────────────────────────────────────────────────
   Non-headcount needs a centre is asking for — laptops, keyboards, chairs,
   data bundles, etc. There's no roster to fill these from, so the received
   count is tracked directly. Keyed by (centre, item); need/filled/unit/note. */

/** Per-centre item-need rows + programme totals, keyed by centre NAME so the
 *  board can attach them next to the volunteer figures. */
function item_needs_compute(): array {
    $rows = db_all('SELECT n.centreId, c.name AS centreName, n.item, n.needCount, n.filledCount, n.unit, n.note
                    FROM item_needs n JOIN centres c ON c.centreId = n.centreId
                    WHERE c.status = \'active\' ORDER BY c.name, n.item');
    // An item need may be OPEN — no specific target amount (needCount 0). Those
    // are standing requests: they never read as "fully met", they just show the
    // running received count and count as still-wanted. Items WITH a target get
    // the usual filled/need/gap math.
    $byCentre = []; $tNeed = 0; $tFilled = 0; $types = 0; $stillNeeded = 0; $open = 0;
    foreach ($rows as $r) {
        $name = (string)$r['centreName'];
        $need = max(0, (int)$r['needCount']); $fl = max(0, (int)$r['filledCount']);
        $isOpen = $need === 0;
        $gap = $isOpen ? 0 : max(0, $need - $fl);
        $rate = $isOpen ? null : volunteer_rate($fl, $need);
        $tone = $isOpen ? 'open' : volunteer_tone($rate);
        $wanted = $isOpen || $gap > 0;   // still-needed for the "open items" tallies
        $tNeed += $need; $tFilled += $fl; $types++;
        if ($isOpen) $open++;
        if ($wanted) $stillNeeded++;
        $byCentre[$name] = $byCentre[$name] ?? [];
        $byCentre[$name][] = [
            'item' => (string)$r['item'], 'need' => $need, 'filled' => $fl,
            'gap' => $gap, 'open' => $isOpen, 'wanted' => $wanted,
            'unit' => (string)$r['unit'], 'note' => (string)$r['note'],
            'fulfillmentRate' => $rate, 'tone' => $tone,
        ];
    }
    return [
        'byCentre' => $byCentre, 'totalNeed' => $tNeed, 'totalFilled' => $tFilled,
        'totalGap' => max(0, $tNeed - $tFilled), 'types' => $types,
        'stillNeeded' => $stillNeeded, 'open' => $open,
    ];
}

function admin_item_needs_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $centreId = trim((string)($p['centreId'] ?? ''));
    $item = substr(trim((string)($p['item'] ?? '')), 0, 80);
    if ($item === '') return ['ok' => false, 'error' => 'bad_item'];
    if (!db_row('SELECT id FROM centres WHERE centreId = ? LIMIT 1', [$centreId])) return ['ok' => false, 'error' => 'invalid_centre'];
    $need = max(0, min(999999, (int)($p['needCount'] ?? 0)));
    $filled = max(0, min(999999, (int)($p['filledCount'] ?? 0)));
    $unit = substr(trim((string)($p['unit'] ?? '')), 0, 24);
    $note = substr(trim((string)($p['note'] ?? '')), 0, 240);
    $existing = db_row('SELECT id FROM item_needs WHERE centreId = ? AND item = ? LIMIT 1', [$centreId, $item]);
    $data = ['needCount' => $need, 'filledCount' => $filled, 'unit' => $unit, 'note' => $note, 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']];
    if ($existing) db_update('item_needs', $data, ['id' => (int)$existing['id']]);
    else db_insert('item_needs', $data + ['centreId' => $centreId, 'item' => $item]);
    audit('item.need.upsert', $g['requester']['memberId'], $centreId, ['item' => $item, 'need' => $need, 'filled' => $filled], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_item_needs_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $centreId = trim((string)($p['centreId'] ?? ''));
    $item = substr(trim((string)($p['item'] ?? '')), 0, 80);
    $n = db_exec('DELETE FROM item_needs WHERE centreId = ? AND item = ?', [$centreId, $item]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('item.need.delete', $g['requester']['memberId'], $centreId, ['item' => $item], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
