<?php
declare(strict_types=1);

/**
 * NGG Club coordinator domain — the Summer → Club bridge and club roster.
 * A Summer School student's record can be promoted into a full NGG member
 * (carrying name / photo / track / centre). Gated by the 'club' capability
 * (club_admin / admin / super_admin).
 */

function admin_club_overview(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    return ['ok' => true, 'overview' => [
        'members'    => $one("SELECT COUNT(*) c FROM members WHERE type='NGG' AND status='active'"),
        'promotable' => $one("SELECT COUNT(*) c FROM summer_students WHERE status IN ('active','graduated')"),
        'promoted'   => $one("SELECT COUNT(*) c FROM summer_students WHERE status='promoted'"),
        'mentors'    => $one("SELECT COUNT(*) c FROM mentors WHERE status='active'"),
    ]];
}

/** How many promotions one bulk call may attempt. */
const CLUB_PROMOTE_MAX = 200;
/** How many members a club coordinator may change in one action. */
const CLUB_BULK_MAX = 500;
/** Statuses the CLUB desk may set. Deliberately narrower than the member
 *  desk's: a club coordinator manages participation, not suspension. */
const CLUB_BULK_STATUSES = ['active', 'graduated-ngg', 'inactive'];

/**
 * Summer students eligible to be enrolled into the Club.
 *
 * Two things were wrong with the version this replaces, and the second was
 * costing a page load:
 *
 *   · It returned EVERY eligible student with no search, no filter and no
 *     paging — a 400-child edition arrived as one 400-row payload and the
 *     screen offered a single "Promote →" button per row, so promoting a
 *     graduating cohort was four hundred clicks.
 *   · It called summer_student_public($s, TRUE), which runs an attendance
 *     query AND profile_public_extras() per student. That is 800+ queries to
 *     render a list whose columns are name, id, track and centre. The
 *     attendance figure is worth having — it is how a coordinator decides —
 *     so it is fetched in ONE grouped query instead of one per child.
 */
function admin_club_promotable(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $where = ["status IN ('active','graduated')"]; $params = [];
    $q = strtolower(trim((string)($p['q'] ?? '')));
    if ($q !== '') {
        $where[] = '(lower(fullName) LIKE ? OR lower(studentId) LIKE ? OR lower(displayId) LIKE ?)';
        $like = '%' . $q . '%'; array_push($params, $like, $like, $like);
    }
    foreach (['centre' => 'centre', 'track' => 'track', 'editionId' => 'cohortId', 'groupId' => 'groupId'] as $k => $col) {
        if (!empty($p[$k])) { $where[] = "$col = ?"; $params[] = (string)$p[$k]; }
    }
    $whereSql = ' WHERE ' . implode(' AND ', $where);
    $total = (int)(db_row('SELECT COUNT(*) c FROM summer_students' . $whereSql, $params)['c'] ?? 0);
    $pageSize = min(200, max(1, (int)($p['pageSize'] ?? 50)));
    $page = max(1, (int)($p['page'] ?? 1));
    $rows = db_all('SELECT * FROM summer_students' . $whereSql
        . ' ORDER BY status DESC, lower(fullName) ASC, studentId ASC LIMIT ? OFFSET ?',
        array_merge($params, [$pageSize, ($page - 1) * $pageSize]));

    /* Attendance for this PAGE, in one query. The per-student version of this
       was the whole cost of the screen. */
    $days = [];
    if ($rows) {
        $ids = array_map(fn($r) => (string)$r['studentId'], $rows);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT studentId, COUNT(DISTINCT date) c FROM attendance WHERE studentId IN ($ph) GROUP BY studentId", $ids) as $a) {
            $days[(string)$a['studentId']] = (int)$a['c'];
        }
    }
    $out = [];
    foreach ($rows as $s) {
        $sid = (string)$s['studentId'];
        $out[] = [
            'studentId' => $sid,
            'displayId' => (string)($s['displayId'] ?? ''),
            'fullName'  => (string)($s['fullName'] ?? ''),
            'handle'    => (string)($s['handle'] ?? ''),
            'centre'    => (string)($s['centre'] ?? ''),
            'track'     => (string)($s['track'] ?? ''),
            'status'    => (string)($s['status'] ?? ''),
            'editionId' => (string)($s['cohortId'] ?? ''),
            'groupId'   => (string)($s['groupId'] ?? ''),
            'photoUrl'  => normalize_image_url((string)($s['photoUrl'] ?? '')),
            // What a coordinator actually decides on.
            'attendanceCount' => $days[$sid] ?? 0,
            'parentEmail'     => (string)($s['parentEmail'] ?? ''),
            /* Flagged, not hidden. Promoting a child with no guardian email
               still works — it just produces a member who cannot be emailed a
               way in, and the coordinator should know that BEFORE the run
               rather than discovering it in a support message. */
            'noContact' => trim((string)($s['parentEmail'] ?? '')) === '',
        ];
    }
    return ['ok' => true, 'students' => $out, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize,
            'max' => CLUB_PROMOTE_MAX];
}

/**
 * Promote many summer students at once.
 *
 * Bulk and PARTIAL: a graduating cohort is promoted in one action, and the
 * ones that cannot be — already promoted, no longer in the roster — come back
 * named rather than aborting the run. Each promotion goes through
 * admin_club_promote(), so there is exactly one implementation of "carry the
 * record across, mint the member, mail the way in, mark the student promoted"
 * and the bulk path cannot drift from the single one.
 */
function admin_club_promote_bulk(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $ids = is_array($p['studentIds'] ?? null) ? $p['studentIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(fn($v) => trim((string)$v), $ids))));
    if (!count($ids)) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > CLUB_PROMOTE_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CLUB_PROMOTE_MAX];

    $results = []; $promoted = 0; $refused = 0;
    foreach ($ids as $sid) {
        $name = (string)(db_row('SELECT fullName FROM summer_students WHERE studentId = ?', [$sid])['fullName'] ?? '');
        $r = admin_club_promote(['requesterId' => $p['requesterId'] ?? '', 'studentId' => $sid, 'ip' => $p['ip'] ?? '']);
        if (!empty($r['ok'])) { $results[] = ['id' => $sid, 'name' => $name, 'ok' => true, 'memberId' => $r['memberId']]; $promoted++; }
        else { $results[] = ['id' => $sid, 'name' => $name, 'ok' => false, 'error' => (string)($r['error'] ?? 'refused')]; $refused++; }
    }
    audit('club.promote.bulk', $g['requester']['memberId'], '',
        ['requested' => count($ids), 'promoted' => $promoted, 'refused' => $refused], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'promoted' => $promoted, 'refused' => $refused, 'requested' => count($ids), 'results' => $results];
}

/**
 * A club coordinator's own bulk actions over the club roster.
 *
 * Narrower than the member desk's on purpose. A club coordinator holds the
 * `club` capability and nothing else: they manage participation (who is
 * active, who has graduated, who has gone quiet) and post members to centres.
 * They do NOT get suspension, membership type, levels or the dues switch —
 * those belong to `people` and `fees`, and handing them over here would make
 * `club` a quiet superset of the member desk.
 *
 * The same guards as the member desk, for the same reasons: never your own
 * account, never a staff account, per-row verdicts, one audit event.
 */
function admin_club_members_bulk(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $me = $g['requester'];
    $action = (string)($p['action'] ?? '');
    if (!in_array($action, ['status', 'centre'], true)) return ['ok' => false, 'error' => 'unknown_action'];

    $ids = is_array($p['memberIds'] ?? null) ? $p['memberIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(fn($v) => trim((string)$v), $ids))));
    if (!count($ids)) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > CLUB_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CLUB_BULK_MAX];

    $value = '';
    if ($action === 'status') {
        $value = (string)($p['status'] ?? '');
        if (!in_array($value, CLUB_BULK_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    } else {
        $value = trim((string)($p['centre'] ?? ''));
        if ($value !== '' && !db_row('SELECT id FROM centres WHERE name = ? LIMIT 1', [$value])) {
            return ['ok' => false, 'error' => 'centre_not_found'];
        }
        if ($value !== '' && !admin_centre_allowed($me, $value)) return ['ok' => false, 'error' => 'centre_out_of_scope'];
    }

    $scopeNames = admin_centre_names_in_scope($me);
    $col = $action === 'status' ? 'status' : 'centre';
    $now = now_iso();
    $results = []; $applied = 0; $refused = 0; $revoked = 0;
    foreach ($ids as $mid) {
        $m = db_row('SELECT memberId, fullName, role, status, centre, type FROM members WHERE memberId = ? LIMIT 1', [$mid]);
        if (!$m) { $results[] = ['id' => $mid, 'ok' => false, 'error' => 'not_found']; $refused++; continue; }
        $name = (string)($m['fullName'] ?? '');
        if ((string)$m['memberId'] === (string)$me['memberId']) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'own_account']; $refused++; continue;
        }
        if (function_exists('is_admin_role') && is_admin_role((string)$m['role'])) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'staff_account']; $refused++; continue;
        }
        if ($scopeNames !== null && !in_array((string)($m['centre'] ?? ''), $scopeNames, true)) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'out_of_scope']; $refused++; continue;
        }
        if ((string)($m[$col] ?? '') === $value) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => true, 'unchanged' => true]; continue;
        }
        db_update('members', [$col => $value, 'updatedAt' => $now], ['memberId' => $mid]);
        if ($col === 'status' && in_array($value, MEMBER_BULK_LOCKOUT_STATUSES, true)) $revoked += member_sessions_revoke_all($mid);
        $results[] = ['id' => $mid, 'name' => $name, 'ok' => true];
        $applied++;
    }
    audit('admin.club.members.bulk', (string)$me['memberId'], $action,
        ['requested' => count($ids), 'applied' => $applied, 'refused' => $refused, 'value' => $value]
        + ($revoked ? ['sessionsRevoked' => $revoked] : []), (string)($p['ip'] ?? ''));
    return ['ok' => true, 'action' => $action, 'applied' => $applied, 'refused' => $refused,
            'requested' => count($ids), 'results' => $results];
}

/** Promote a summer student into a full NGG Club member. */
function admin_club_promote(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $sid = (string)($p['studentId'] ?? '');
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$sid]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (($s['status'] ?? '') === 'promoted') return ['ok' => false, 'error' => 'already_promoted'];
    $newId = new_id('NGG', 'members', 'memberId');
    /* Carry the record across.
     *
     * This wrote `email => ''` — literally blank — so a child promoted out of
     * Summer got a member row nobody could sign into: the only sign-in routes
     * are a password they have never set and a code emailed to an address that
     * is not there. Their guardian's email and phone were on the summer_students
     * row the whole time, along with a date of birth, and the dues reminders and
     * guardian nudges both select on parentEmail — so a promoted member was
     * invisible to those too.
     *
     * The guardian's address becomes the member's contact, exactly as it does
     * on the teen application path: it is the one address the programme holds
     * for a ten- to seventeen-year-old, and having it in both places is what
     * makes sign-in and the reminders work at once. */
    $guardianEmail = trim((string)($s['parentEmail'] ?? ''));
    $guardianPhone = trim((string)($s['guardianPhone'] ?? ''));
    /* The promoted participant becomes a MEMBER, so they get a member's
       printed ID — year-prefixed, not the centre-prefixed participant one
       they carried through the summer. */
    $__m = [
        'memberId' => $newId, 'fullName' => $s['fullName'],
        'email' => $guardianEmail, 'type' => 'NGG',
        'status' => 'active', 'role' => 'member', 'centre' => $s['centre'] ?: 'Egbeda',
        'track' => $s['track'] ?: '', 'photoUrl' => $s['photoUrl'] ?: '',
        'dob' => (string)($s['dob'] ?? ''),
        'parentName' => (string)($s['guardianName'] ?? ''),
        'parentEmail' => $guardianEmail,
        'parentPhone' => $guardianPhone,
        'joinDate' => gmdate('Y-m-d'),
        'notes' => 'Promoted from Summer ' . $s['studentId'] . ' (' . $s['cohortId'] . ')',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ];
    if (trim((string)($__m['displayId'] ?? '')) === '' && member_is_ngg($__m)) $__m['displayId'] = member_mint_display_id($__m);
    db_insert('members', $__m);
    member_cards_ensure($__m, 'promotion', 'created');

    /* And a way in, when there is an address to send it to. Same set-password
       link the application path mints, for the same reason: otherwise every
       sign-in is a code in a guardian's inbox. */
    $welcome = ($guardianEmail !== '' && function_exists('auth_welcome_link')) ? auth_welcome_link($newId) : '';
    if ($welcome !== '') {
        @send_mail($guardianEmail, 'Welcome to the NGG club',
            email_template([
                'title' => explode(' ', (string)$s['fullName'])[0] . ' is in the club.',
                'intro' => 'Promoted from Summer Students into Next Generation Genius.',
                'bodyHtml' => 'The member ID is <b>' . esc_html($newId) . '</b>. Set a password with the button '
                    . 'below — after that they can sign in with the member ID alone. The link is good for seven days.',
                'ctaLabel' => 'Set a password', 'ctaUrl' => $welcome,
                'footNote' => 'Welcome to the movement.',
            ]));
    }
    db_update('summer_students', ['status' => 'promoted', 'updatedAt' => now_iso()], ['studentId' => $sid]);
    audit('club.promote', $g['requester']['memberId'], $newId, ['fromSummer' => $sid], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId];
}

/**
 * The club roster.
 *
 * Was hard-wired to `status='active'`, so a club coordinator could not see the
 * members who had gone inactive or graduated — the two groups the roster exists
 * to keep track of — and there was no way to find out that somebody had been
 * deactivated. It also had no total and no paging beyond LIMIT 1000, so a
 * roster past a thousand quietly ended.
 *
 * `status` now defaults to active (the common case, and what the screen used to
 * show) but can be asked for explicitly, including '' for every status.
 */
function admin_club_members(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $q = strtolower(trim((string)($p['q'] ?? '')));
    $where = ["type = 'NGG'"]; $params = [];
    /* Absent ⇒ active, which is what this screen has always shown. An explicit
       'all' means every status; anything else is matched exactly. */
    $status = array_key_exists('status', $p) ? (string)$p['status'] : 'active';
    if ($status !== '' && $status !== 'all') { $where[] = 'status = ?'; $params[] = $status; }
    if ($q !== '') {
        $where[] = '(lower(fullName) LIKE ? OR lower(memberId) LIKE ? OR lower(email) LIKE ?)';
        $like = '%' . $q . '%'; array_push($params, $like, $like, $like);
    }
    if (!empty($p['centre'])) { $where[] = 'centre = ?'; $params[] = (string)$p['centre']; }
    // A centre-scoped coordinator sees only their centres, same as the member desk.
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    if ($scopeNames !== null) {
        if (!$scopeNames) return ['ok' => true, 'total' => 0, 'members' => []];
        $where[] = 'centre IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')';
        foreach ($scopeNames as $nm) $params[] = $nm;
    }
    $whereSql = ' WHERE ' . implode(' AND ', $where);

    // Allow-listed, like the member desk: the column lands in SQL text.
    $sortable = ['createdAt' => 'createdAt', 'fullName' => 'fullName', 'memberId' => 'memberId',
                 'centre' => 'centre', 'status' => 'status'];
    $sortKey = (string)($p['sort'] ?? '');
    $sortCol = $sortable[$sortKey] ?? 'createdAt';
    $dir = strtolower((string)($p['dir'] ?? '')) === 'asc' ? 'ASC' : 'DESC';
    if ($sortKey === '') $dir = 'DESC';
    $orderExpr = in_array($sortCol, ['fullName', 'centre', 'status'], true) ? "lower($sortCol)" : $sortCol;
    $orderSql = " ORDER BY $orderExpr $dir, memberId ASC";

    $total = (int)(db_row('SELECT COUNT(*) c FROM members' . $whereSql, $params)['c'] ?? 0);
    if (!empty($p['all'])) {
        $rows = db_all('SELECT * FROM members' . $whereSql . $orderSql . ' LIMIT 5000', $params);
        return ['ok' => true, 'total' => $total, 'members' => array_map('public_member', $rows)];
    }
    $pageSize = min(200, max(1, (int)($p['pageSize'] ?? 50)));
    $page = max(1, (int)($p['page'] ?? 1));
    $rows = db_all('SELECT * FROM members' . $whereSql . $orderSql . ' LIMIT ? OFFSET ?',
        array_merge($params, [$pageSize, ($page - 1) * $pageSize]));
    return ['ok' => true, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize,
            'sort' => array_search($sortCol, $sortable, true) ?: 'createdAt', 'dir' => strtolower($dir),
            'statuses' => CLUB_BULK_STATUSES,
            'members' => array_map('public_member', $rows)];
}
