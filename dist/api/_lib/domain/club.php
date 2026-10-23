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
    [$qSql, $qArgs] = sql_text_search((string)($p['q'] ?? ''), ['fullName', 'displayId', 'studentId']);
    if ($qSql !== '') { $where[] = $qSql; foreach ($qArgs as $a) $params[] = $a; }
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
    /* Where each would go. One centres query for the page and one ranking per
       distinct Summer centre on it — the suggestion is about the centre, not
       the child, so twenty participants from one venue cost one ranking. */
    $centres = db_all("SELECT name, code, status, lat, lng, summerLat, summerLng, address, summerAddress, area, summerArea FROM centres");
    $suggest = [];
    $out = [];
    foreach ($rows as $s) {
        $sid = (string)$s['studentId'];
        $sc = (string)($s['centre'] ?? '');
        if (!array_key_exists($sc, $suggest)) $suggest[$sc] = club_promote_suggestion($sc, $centres);
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
            'suggestedCentre' => $suggest[$sc],
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
        /* A coordinator may have overridden the suggestion for some rows
           (`centres` = {studentId: centre}); the rest take the suggestion. */
        $pick = is_array($p['centres'] ?? null) ? trim((string)($p['centres'][$sid] ?? '')) : '';
        $r = admin_club_promote(['requesterId' => $p['requesterId'] ?? '', 'studentId' => $sid, 'centre' => $pick, 'ip' => $p['ip'] ?? '']);
        if (!empty($r['ok'])) { $results[] = ['id' => $sid, 'name' => $name, 'ok' => true, 'memberId' => $r['memberId'], 'centre' => $r['centre'] ?? '']; $promoted++; }
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
    $results = []; $applied = 0; $refused = 0;
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
        $results[] = ['id' => $mid, 'name' => $name, 'ok' => true];
        $applied++;
    }
    audit('admin.club.members.bulk', (string)$me['memberId'], $action,
        ['requested' => count($ids), 'applied' => $applied, 'refused' => $refused, 'value' => $value], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'action' => $action, 'applied' => $applied, 'refused' => $refused,
            'requested' => count($ids), 'results' => $results];
}

/** Promote a summer student into a full NGG Club member. */
/**
 * Which NGG centre a promoted Summer participant should join, and why.
 *
 * The nearest Club to where their Summer School met — a family who managed the
 * summer venue every day can manage the nearest Club once a week. Falls back to
 * their own centre (same identity, possibly a different building) when nothing
 * is mapped well enough to measure, and says so, so a coordinator never mistakes
 * a fallback for a measurement.
 *
 * @return array{name:string,km:?float,reason:string,alternatives:list<array>}
 */
function club_promote_suggestion(string $summerCentre, ?array $centres = null, string $home = '', bool $network = false): array {
    /* Only NGG centres, and only places already known (cached) unless asked:
       a list of fifty participants must not wait on fifty map lookups. The
       one-participant promote asks the map (admin_club_promote_options). */
    $n = centre_ngg_nearest($home, $summerCentre, $network);
    $measured = array_values(array_filter($n['ranked'], static fn($r) => $r['km'] !== null));
    if ($measured) {
        $best = $measured[0];
        return ['name' => $best['name'], 'km' => $best['km'], 'minutes' => $best['minutes'] ?? null, 'roadKm' => $best['roadKm'] ?? null,
                'reason' => ['home' => 'nearest NGG centre to their home address', 'summer_venue' => 'nearest NGG centre to where their Summer School met',
                             'summer_area' => 'nearest NGG centre to their Summer School centre’s area'][$n['from']] . ($best['approx'] ? ' (approximate — the centre is not mapped)' : ''),
                'alternatives' => array_slice($measured, 1, 3)];
    }
    $only = count($n['ranked']) === 1 ? $n['ranked'][0]['name'] : '';
    return ['name' => $only, 'km' => null,
            'reason' => $only !== '' ? 'the only NGG centre' : ($n['ranked'] ? 'choose a centre — nothing could be placed on a map to measure' : 'no NGG centre is open'),
            'alternatives' => []];
}

function admin_club_promote(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $sid = (string)($p['studentId'] ?? '');
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$sid]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (($s['status'] ?? '') === 'promoted') return ['ok' => false, 'error' => 'already_promoted'];
    /* The Club they join: the coordinator's choice when given, otherwise the
       suggestion (the nearest Club to their Summer venue). A choice must be an
       active centre — a typo here is a member posted nowhere. */
    $chosen = trim((string)($p['centre'] ?? ''));
    if ($chosen !== '') {
        // An NGG centre: a member is never posted to a Summer School venue.
        $hit = db_row("SELECT name, programmes FROM centres WHERE lower(name) = lower(?) AND status = 'active' LIMIT 1", [$chosen]);
        if (!$hit || !centre_serves($hit, 'ngg')) return ['ok' => false, 'error' => 'invalid_centre', 'detail' => 'Choose one of the open NGG centres.'];
        $chosen = (string)$hit['name'];
    } else {
        $chosen = club_promote_suggestion((string)($s['centre'] ?? ''), null, participant_home_address($s), true)['name'];
        if ($chosen === '') return ['ok' => false, 'error' => 'centre_required', 'detail' => 'Choose which NGG centre they will join.'];
    }
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
        'status' => 'active', 'role' => 'member', 'centre' => $chosen,
        'track' => $s['track'] ?: '', 'photoUrl' => $s['photoUrl'] ?: '',
        'dob' => (string)($s['dob'] ?? ''),
        'parentName' => (string)($s['guardianName'] ?? ''),
        'parentEmail' => $guardianEmail,
        'parentPhone' => $guardianPhone,
        'joinDate' => gmdate('Y-m-d'),
        'notes' => 'Promoted from Summer ' . $s['studentId'] . ' (' . $s['cohortId'] . ')',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ];
    if (trim((string)($__m['displayId'] ?? '')) === '' && member_is_ngg($__m)) $__m['displayId'] = member_mint_and_claim($__m, $newId);
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
    audit('club.promote', $g['requester']['memberId'], $newId, ['fromSummer' => $sid, 'centre' => $__m['centre'], 'summerCentre' => (string)($s['centre'] ?? '')], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId, 'centre' => $__m['centre']];
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
    $where = ["type = 'NGG'"]; $params = [];
    /* Absent ⇒ active, which is what this screen has always shown. An explicit
       'all' means every status; anything else is matched exactly. */
    $status = array_key_exists('status', $p) ? (string)$p['status'] : 'active';
    if ($status !== '' && $status !== 'all') { $where[] = 'status = ?'; $params[] = $status; }
    // The printed ID too: it is the number on the card and on every roster row.
    [$qSql, $qArgs] = sql_text_search((string)($p['q'] ?? ''), ['fullName', 'displayId', 'memberId', 'email'], ['phone', 'parentPhone']);
    if ($qSql !== '') { $where[] = $qSql; foreach ($qArgs as $a) $params[] = $a; }
    if (!empty($p['centre'])) { $where[] = 'centre = ?'; $params[] = (string)$p['centre']; }
    if (!empty($p['track'])) { $where[] = 'lower(track) = ?'; $params[] = strtolower((string)$p['track']); }
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
                 'centre' => 'centre', 'status' => 'status', 'track' => 'track'];
    $sortKey = (string)($p['sort'] ?? '');
    $sortCol = $sortable[$sortKey] ?? 'createdAt';
    $dir = strtolower((string)($p['dir'] ?? '')) === 'asc' ? 'ASC' : 'DESC';
    if ($sortKey === '') $dir = 'DESC';
    $orderExpr = in_array($sortCol, ['fullName', 'centre', 'status', 'track'], true) ? "lower($sortCol)" : $sortCol;
    $orderSql = " ORDER BY $orderExpr $dir, memberId ASC";

    $total = (int)(db_row('SELECT COUNT(*) c FROM members' . $whereSql, $params)['c'] ?? 0);
    /* The same filter by every status, for the status tabs' counts: the status
       clause is the second condition when present (see above), so drop it. */
    $counts = [];
    if (!empty($p['counts'])) {
        $cw = $where; $cp = $params;
        if ($status !== '' && $status !== 'all') { array_splice($cw, 1, 1); array_splice($cp, 0, 1); }
        foreach (db_all('SELECT status, COUNT(*) c FROM members WHERE ' . implode(' AND ', $cw) . ' GROUP BY status', $cp) as $r) $counts[(string)$r['status']] = (int)$r['c'];
    }
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
            'statuses' => CLUB_BULK_STATUSES, 'counts' => $counts,
            'members' => array_map('public_member', $rows)];
}
