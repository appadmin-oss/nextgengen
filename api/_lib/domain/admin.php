<?php
declare(strict_types=1);

/**
 * Admin domain — every handler re-checks the requester's role server-side
 * (defence in depth; the PHP route already gated the session + 2FA).
 */

function admin_gate(array $p): array {
    $requester = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['requesterId'] ?? '')]);
    if (!$requester) return ['ok' => false, 'error' => 'no_requester'];
    if (!is_admin_role($requester['role'])) return ['ok' => false, 'error' => 'forbidden'];
    /* A role that exists for named centres (a centre lead) and has none is
       refused, not widened: an empty centreScope means "every centre" for an
       admin, and must never mean that for somebody who runs one. */
    if (admin_role_scoped($requester['role']) && admin_centre_names_in_scope($requester) === null) {
        return ['ok' => false, 'error' => 'scope_required', 'detail' => 'This role needs a centre. Ask a super admin to set one under Access & roles.'];
    }
    return ['ok' => true, 'requester' => $requester];
}

function admin_is_super(array $p): bool {
    $g = admin_gate($p);
    return $g['ok'] && strtolower((string)$g['requester']['role']) === 'super_admin';
}

/**
 * Admin gate that also requires a specific capability (see admin_role_caps).
 * Editors get 'content'; admins add 'people' + 'inbox'; super_admins also hold
 * 'settings' + 'rbac'. Returns the same shape as admin_gate.
 */
function admin_cap_gate(array $p, string $cap): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    if (!in_array($cap, member_effective_caps($g['requester']), true)) {
        return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:' . $cap];
    }
    return $g;
}

/**
 * Admin gate requiring ANY ONE of several capabilities.
 *
 * For shared reference data that several desks legitimately need to READ while
 * only one of them owns WRITING it. The centre directory is the case that
 * needed it: a Summer School coordinator has to be able to see the list of
 * centres to run classes in them, but must not be able to rename or delete
 * one, because a centre's code is the printed ID prefix on every NGG member's
 * card and its name is what their record points at.
 *
 * Read with admin_cap_gate_any($p, ['people','summer']); write with
 * admin_cap_gate($p, 'people'). Never widen a WRITE with this.
 */
function admin_cap_gate_any(array $p, array $caps): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $have = member_effective_caps($g['requester']);
    foreach ($caps as $c) if (in_array($c, $have, true)) return $g;
    return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:' . implode('|', $caps)];
}

/** Keep only known columns; cast declared booleans to 0/1 and ints. */
function db_pick(array $data, array $cols, array $bools = [], array $ints = []): array {
    $out = [];
    foreach ($cols as $c) {
        if (!array_key_exists($c, $data)) continue;
        $v = $data[$c];
        if (in_array($c, $bools, true)) $v = to_bool($v) ? 1 : 0;
        elseif (in_array($c, $ints, true)) $v = ($v === '' || $v === null) ? null : (int)$v;
        elseif (is_array($v)) $v = json_encode($v, JSON_UNESCAPED_SLASHES);
        $out[$c] = $v;
    }
    return $out;
}

// ── Members ──────────────────────────────────────────────────────────────

/* Kept beside the validator that enforces them, and matching
   MEMBER_STATUS_OPTS in page-admin.jsx one for one. */
const MEMBER_STATUSES = ['active', 'graduated-ngg', 'graduated-vanguard', 'suspended', 'inactive'];
const MEMBER_TYPES = ['NGG', 'Summer'];

function admin_members_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    $q = strtolower((string)($p['q'] ?? ''));
    if ($q !== '') { $where[] = '(lower(fullName) LIKE ? OR lower(memberId) LIKE ? OR lower(email) LIKE ?)'; $like = '%' . $q . '%'; array_push($params, $like, $like, $like); }
    /* `level` joins the exact-match facets. The roster workbook files every
       member at a level and the column has existed since migration 109, but
       nothing could filter by it — so "show me everyone at level C" meant
       exporting the whole roster and opening a spreadsheet. */
    foreach (['centre', 'status', 'type', 'level'] as $f) {
        if (!empty($p[$f])) { $where[] = "$f = ?"; $params[] = $p[$f]; }
    }
    // Staff-only view powers the Access & roles roster.
    if (!empty($p['staff'])) { $where[] = "role IN ('" . implode("','", staff_role_names()) . "')"; }
    /* A dashboard figure leads to the records behind it. The fragment comes
       from member_segment_sql(), which lives beside the figures it mirrors
       so a segment cannot quietly select something the dashboard did not
       count — a list that disagrees with its own headline is worse than no
       list, because the count becomes evidence the list is wrong. */
    if (!empty($p['segment'])) {
        $seg = member_segment_sql((string)$p['segment']);
        if (!$seg) return ['ok' => false, 'error' => 'unknown_segment',
                           'detail' => 'Known segments: ' . implode(', ', array_keys(member_segments() + member_conduct_segments())) . '.'];
        $where[] = '(' . $seg[0] . ')';
        foreach ($seg[1] as $sp) $params[] = $sp;
    }

    /* Rows with something MISSING, for the print preflight.
     *
     * The ID batch drawer counts how many of a selection have no photograph,
     * no printed ID and no discipline, because each makes a card that prints
     * perfectly well and is wrong in the hand. A count nobody can act on is an
     * accusation rather than a tool — so the same three predicates are
     * available as a filter, and the drawer's counts link to the roster
     * showing exactly those members.
     *
     * These MUST agree with the client-side counts in AdminMemberIdBatch. An
     * allow-list keyed by name, like $sortable below: the caller never
     * contributes SQL text. */
    $missingSql = [
        // Matches /^https?:\/\// on the client. Anything else — blank, a bare
        // filename, a leftover data: URI — is not a photograph the card can draw.
        'photo'      => "(COALESCE(photoUrl,'') NOT LIKE 'http://%' AND COALESCE(photoUrl,'') NOT LIKE 'https://%')",
        'printedId'  => "TRIM(COALESCE(displayId,'')) = ''",
        // The card shows `disciplines` and falls back to `track`, so a member is
        // only missing one when BOTH are blank.
        'discipline' => "(TRIM(COALESCE(disciplines,'')) = '' AND TRIM(COALESCE(track,'')) = '')",
    ];
    $missing = (string)($p['missing'] ?? '');
    // Unknown value ⇒ no filter, same as a stale sort key: a bookmark that has
    // gone out of date should show the roster, not an error.
    if (isset($missingSql[$missing])) $where[] = $missingSql[$missing];
    // Scoped admins only see members in their centres (unscoped ⇒ all).
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    if ($scopeNames !== null) {
        if (!$scopeNames) return ['ok' => true, 'total' => 0, 'members' => []];
        $where[] = 'centre IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')';
        foreach ($scopeNames as $nm) $params[] = $nm;
    }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    /* How the page is ordered.
     *
     * It was ORDER BY createdAt DESC, full stop, with no way to ask for
     * anything else — so a coordinator holding four hundred children could not
     * put them in name order, or find the ones with no centre set, or group
     * the roster the way the register in their hand is grouped. Newest-first
     * is a reasonable DEFAULT and a poor only-option.
     *
     * An allow-list, not a passthrough: the column name goes into the SQL
     * text, so a caller must not be able to choose it freely. Anything not on
     * this list falls back to the default rather than erroring — a stale
     * bookmark should show the roster, not a failure. */
    $sortable = ['createdAt' => 'createdAt', 'fullName' => 'fullName', 'memberId' => 'memberId',
                 'centre' => 'centre', 'status' => 'status', 'type' => 'type', 'role' => 'role',
                 'joined' => 'joined'];
    $sortKey = (string)($p['sort'] ?? '');
    $sortCol = $sortable[$sortKey] ?? 'createdAt';
    $dir = strtolower((string)($p['dir'] ?? '')) === 'asc' ? 'ASC' : 'DESC';
    if ($sortKey === '') $dir = 'DESC';                     // the default is newest first
    /* Text sorts case-insensitively, because "amina" filed after "Zainab" is
     * not a sort order anybody asked for, and ties break on the id so paging
     * cannot show the same person twice or skip one. */
    $textCols = ['fullName', 'centre', 'status', 'type', 'role'];
    $orderExpr = in_array($sortCol, $textCols, true) ? "lower($sortCol)" : $sortCol;
    /* When they joined: the roster's date where it has one, otherwise the day
       the record was made — the same fallback the Joined column shows. */
    if ($sortCol === 'joined') $orderExpr = "COALESCE(NULLIF(joinDate, ''), substr(createdAt, 1, 10))";
    $orderSql = " ORDER BY $orderExpr $dir, memberId ASC";
    // Accurate total for the filtered set, computed before paging so the client
    // can render "N–M of T" and page controls without loading every row.
    $total = (int) db_row('SELECT COUNT(*) c FROM members' . $whereSql, $params)['c'];
    // Optional pagination. page is 1-based; pageSize is clamped. When absent we
    // still cap the result so an unbounded table can't be requested by default.
    // Export mode: every matching row (bounded), no paging — for a full CSV.
    if (!empty($p['all'])) {
        $rows = db_all('SELECT * FROM members' . $whereSql . $orderSql . ' LIMIT 5000', $params);
        audit('admin.members.export', $g['requester']['memberId'], '', ['count' => count($rows)], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'total' => $total, 'members' => admin_members_with_consent($rows)];
    }
    $pageSize = min(200, max(1, (int)($p['pageSize'] ?? 50)));
    $page = max(1, (int)($p['page'] ?? 1));
    $offset = ($page - 1) * $pageSize;
    $sql = 'SELECT * FROM members' . $whereSql . $orderSql . ' LIMIT ? OFFSET ?';
    $rows = db_all($sql, array_merge($params, [$pageSize, $offset]));
    return ['ok' => true, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize,
            /* Echoed back so the header can show which column it is on and
             * which way. The RESOLVED key, not the requested one: a request
             * for a column that does not exist is served in the default order,
             * and saying otherwise would have the header draw an arrow beside a
             * column the rows are not actually sorted by. */
            'sort' => array_search($sortCol, $sortable, true) ?: 'createdAt',
            'dir' => strtolower($dir),
            'members' => admin_members_with_consent($rows),
            // How much of the roster is still unrecorded, for the whole filtered
            // set rather than this page. Without it an admin paging through 400
            // children has no idea how much work is left.
            'consentSummary' => admin_members_consent_summary($where, $params)];
}

/**
 * Attach each member's publication-consent state, batched.
 *
 * One query for the page rather than one per member — the roster is the screen
 * most likely to be opened with a few hundred rows on it, and a per-row lookup
 * here is the N+1 that has already had to be undone twice elsewhere.
 */
function admin_members_with_consent(array $rows): array {
    if (!$rows) return [];
    $ids = array_column($rows, 'memberId');
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $byId = [];
    foreach (db_all("SELECT studentId, type, status, method, actorName, createdAt FROM consents
                     WHERE studentId IN $in AND type IN ('site_visibility','media') ORDER BY id", $ids) as $c) {
        $byId[(string)$c['studentId']][(string)$c['type']] = [
            'status' => (string)$c['status'], 'method' => (string)($c['method'] ?? ''),
            'by' => (string)($c['actorName'] ?? ''), 'at' => (string)($c['createdAt'] ?? ''),
        ];
    }
    /* The raw rows above are for DISPLAY — method, who recorded it, when — and
     * the decision itself comes from the shared policy. Re-deriving "is this
     * child publishable" here would be a fifth copy of the rule, and an admin
     * screen quietly disagreeing with the public board about who is named is
     * worse than either being wrong on its own. */
    $decide = consent_may_publish_many($ids);
    return array_map(function ($r) use ($byId, $decide) {
        $m = public_member($r);
        $mid = (string)$r['memberId'];
        // The circle-invite short code, so a batch-printed ID card's QR resolves
        // to the same place the member's own downloaded card does. Only present
        // once a member has generated one; the card falls back to a member deep
        // link otherwise. Not added to public_member — this is a staff read.
        if (!empty($r['anchorCode'])) $m['anchorCode'] = (string)$r['anchorCode'];
        // When they joined: the roster's Joined column and its default order.
        // public_member() leaves it out; the roster sorted by a date it never showed.
        $m['createdAt'] = (string)($r['createdAt'] ?? '');
        $cs = $byId[$mid] ?? [];
        $d = $decide[$mid] ?? ['mayName' => true, 'gated' => false];
        $m['consent'] = [
            'gated' => (bool)$d['gated'],
            'site_visibility' => $cs['site_visibility'] ?? null,
            'media' => $cs['media'] ?? null,
            'mayName' => (bool)$d['mayName'],
            'handle' => consent_handle_for($mid),
        ];
        return $m;
    }, $rows);
}

/**
 * Recorded / unrecorded counts across the whole filtered roster.
 *
 * Takes the WHERE terms as a list rather than the assembled string, so both
 * queries can compose their own clause. Slicing a prefix off a built SQL
 * string to reuse it is the kind of thing that works until a filter changes
 * shape underneath it.
 */
function admin_members_consent_summary(array $where, array $params): array {
    $terms = array_merge($where, ["m.role = 'member'"]);
    $sql = ' FROM members m WHERE ' . implode(' AND ', $terms);
    $total = (int)(db_row('SELECT COUNT(*) c' . $sql, $params)['c'] ?? 0);
    // Last row wins, matching how the ledger is read everywhere else.
    $named = (int)(db_row('SELECT COUNT(*) c' . $sql . "
                           AND (SELECT status FROM consents c2 WHERE c2.studentId = m.memberId
                                AND c2.type = 'site_visibility' ORDER BY c2.id DESC LIMIT 1) = 'granted'",
                          $params)['c'] ?? 0);
    return ['participants' => $total, 'named' => $named, 'unrecorded' => max(0, $total - $named)];
}

/**
 * Record a guardian's publication decision for a member.
 *
 * Staff record what a guardian actually said — on a paper form, by phone, in
 * person. `method` is mandatory for that reason: a ledger row that does not
 * say how the decision was obtained is a checkbox, not evidence.
 *
 * Deliberately one child at a time. A bulk "mark this whole centre consented"
 * button is the obvious next request and the wrong feature: it manufactures a
 * legal permission for people nobody spoke to, and the resulting ledger would
 * be worth nothing precisely when it mattered.
 */
function admin_member_consent(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $mid = trim((string)($p['memberId'] ?? ''));
    /* Scope: a guardian's consent decision for a child in another centre is
       not this admin's to record. */
    $sg = admin_member_scope_gate($g['requester'], $mid);
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    $r = consent_record($mid, (string)($p['type'] ?? ''), (string)($p['status'] ?? ''),
                        (string)($p['method'] ?? ''), (string)($g['requester']['fullName'] ?? 'Staff'));
    if (empty($r['ok'])) return $r;
    audit('admin.member.consent', $g['requester']['memberId'], $mid,
          ['type' => (string)($p['type'] ?? ''), 'status' => (string)($p['status'] ?? ''),
           'method' => (string)($p['method'] ?? '')], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'consent' => consent_state($mid), 'mayName' => consent_may_publish($mid)['mayName']];
}

/**
 * What a member record must look like before it is written.
 *
 * None of this existed. A member could be created with no name, an email
 * that is not an email, a status nobody recognises, and a centre that does
 * not exist — and every one of those is invisible until somebody tries to
 * use the record, by which time it is one row among thousands.
 *
 * THE DUPLICATE CHECK IS THE IMPORTANT ONE. `email` is indexed but not
 * unique, and sign-in resolves an identifier with
 * `WHERE lower(memberId) = ? OR lower(email) = ? LIMIT 1`. Two members
 * sharing an address therefore means one of them can never sign in, and
 * which one is whichever the database returns first — it can change when
 * rows move. A duplicate is refused rather than merged, because merging two
 * people's records automatically is a worse mistake than refusing one
 * entry.
 *
 * @return array{ok: bool, error?: string, detail?: string, data?: array}
 */
function admin_member_validate(array $data, ?array $existing): array {
    $id = $existing['memberId'] ?? null;

    foreach (['fullName', 'email', 'phone', 'parentEmail', 'parentPhone', 'centre', 'school'] as $f) {
        if (isset($data[$f]) && is_string($data[$f])) $data[$f] = trim($data[$f]);
    }

    $name = $data['fullName'] ?? ($existing['fullName'] ?? '');
    if (trim((string)$name) === '') {
        return ['ok' => false, 'error' => 'name_required',
                'detail' => 'A member needs a name. A nameless row cannot be found again by the person who created it.'];
    }

    /* Stored as YYYY-MM-DD, whatever was typed, so the roster can show, sort
       and count it. Unreadable is refused: a stored "last March" is a date
       nobody downstream can use, and it would look as if it were on file. */
    foreach (['joinDate' => 'join date', 'dob' => 'date of birth'] as $f => $what) {
        if (!array_key_exists($f, $data) || is_array($data[$f])) continue;
        $iso = member_date((string)($data[$f] ?? ''));
        if ($iso === null) {
            return ['ok' => false, 'error' => $f . '_invalid',
                    'detail' => '"' . trim((string)$data[$f]) . '" is not a ' . $what . ' the roster can read. Use day/month/year, for example 15/03/2023.'];
        }
        $data[$f] = $iso;
    }

    $email = (string)($data['email'] ?? '');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'email_invalid',
                'detail' => '"' . $email . '" is not an email address. This is the address they sign in with.'];
    }
    if (isset($data['parentEmail']) && $data['parentEmail'] !== ''
        && !filter_var((string)$data['parentEmail'], FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'parent_email_invalid',
                'detail' => '"' . $data['parentEmail'] . '" is not an email address.'];
    }

    if ($email !== '') {
        $clash = $id
            ? db_row('SELECT memberId, fullName FROM members WHERE lower(email) = ? AND memberId <> ? LIMIT 1', [strtolower($email), $id])
            : db_row('SELECT memberId, fullName FROM members WHERE lower(email) = ? LIMIT 1', [strtolower($email)]);
        if ($clash) {
            return ['ok' => false, 'error' => 'email_taken',
                    'detail' => $email . ' is already on ' . (string)$clash['fullName'] . "'s record ("
                        . (string)$clash['memberId'] . '). Sign-in resolves an address to one member, so two '
                        . 'records sharing one would leave whichever the database returned second unable to sign in.'];
        }
    }

    /*
     * The vocabularies the rest of the system actually uses, not a plausible
     * set. An earlier draft of this allowed 'alumni' and 'pending' and left
     * out 'graduated-ngg' and 'graduated-vanguard' — which are what the
     * staff select offers, what the editor's Graduate buttons write, and
     * what the public graduate count reads. Validation against an invented
     * vocabulary does not tighten anything; it breaks the paths that were
     * working and leaves the ones that were not.
     */
    foreach (['status' => MEMBER_STATUSES, 'type' => MEMBER_TYPES] as $field => $allowed) {
        if (isset($data[$field]) && (string)$data[$field] !== ''
            && !in_array((string)$data[$field], $allowed, true)) {
            return ['ok' => false, 'error' => $field . '_invalid',
                    'detail' => ucfirst($field) . ' must be one of: ' . implode(', ', $allowed) . '.'];
        }
    }

    /*
     * A centre that does not match any row in `centres` is NOT refused here,
     * and that is deliberate.
     *
     * `members.centre` stores a centre NAME rather than an id, so renaming a
     * centre orphans every member referencing the old one. Validating
     * against the table would then make those members uneditable — somebody
     * trying to correct a phone number is refused because of a field they
     * are not touching, which is the kind of rule people route around by
     * creating a second record.
     *
     * Intake paths (gate.register and the rest) also legitimately write a
     * centre before anybody has created it.
     *
     * An unrecognised centre is a cleanup task, not a reason to block an
     * edit, so it is reported on the member dashboard's data-quality panel
     * where somebody can work through the list.
     */

    return ['ok' => true, 'data' => $data];
}

/**
 * The member dashboard (admin.members.overview).
 *
 * There was no such thing. `admin.dashboard.overview` is a SUMMER
 * ATTENDANCE board — enrolment and present-today per centre — and the
 * member roster was a filterable table with a pager. Between them nobody
 * could answer "how many members do we have, where are they, how fast are
 * we growing, and what is wrong with the records", which is the whole job
 * of member management.
 *
 * Every figure is derived at read time from the same rows the roster shows,
 * scoped exactly as the roster is scoped, so a centre coordinator's
 * dashboard and their roster cannot disagree.
 *
 * THE DATA-QUALITY PANEL IS THE POINT. Totals look healthy regardless;
 * what actually degrades a membership database is the slow accumulation of
 * records with no email, no guardian contact for a child, a centre nobody
 * recognises, and the same person entered twice. None of that shows up in
 * a count of members, and none of it gets fixed unless somebody is handed
 * the list.
 */
function admin_members_overview(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;

    // Scope, applied the same way the roster applies it.
    $names = admin_centre_names_in_scope($g['requester']);
    $scope = ''; $args = [];
    if ($names !== null) {
        if (!$names) {
            return ['ok' => true, 'overview' => ['empty' => true, 'reason' => 'no_centres_in_scope']];
        }
        $scope = ' AND centre IN (' . implode(',', array_fill(0, count($names), '?')) . ')';
        $args = $names;
    }
    $one = fn(string $sql, array $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $base = "FROM members WHERE 1=1$scope";
    $today = gmdate('Y-m-d');

    $total  = $one("SELECT COUNT(*) c $base", $args);
    $active = $one("SELECT COUNT(*) c $base AND status = 'active'", $args);

    $group = function (string $col) use ($base, $args): array {
        $out = [];
        foreach (db_all("SELECT COALESCE(NULLIF($col, ''), '(not set)') k, COUNT(*) c $base GROUP BY k ORDER BY c DESC", $args) as $r) {
            $out[(string)$r['k']] = (int)$r['c'];
        }
        return $out;
    };

    /* Growth: joins per month for a year. A join is the roster's joinDate
       where there is one and the record's creation otherwise — counting
       createdAt alone filed a whole imported roster under the month of the
       import. Both are ISO strings, so the month is the first seven
       characters — no date function, identical on SQLite and MySQL. */
    $joined = "COALESCE(NULLIF(joinDate, ''), SUBSTR(createdAt, 1, 10))";
    $since = gmdate('Y-m', strtotime('-11 months')) . '-01';
    $growth = [];
    foreach (db_all("SELECT SUBSTR($joined, 1, 7) m, COUNT(*) c $base AND $joined >= ? GROUP BY m ORDER BY m",
                    array_merge($args, [$since])) as $r) {
        $growth[(string)$r['m']] = (int)$r['c'];
    }
    // Months with no joins are zeros, not gaps — a line chart with holes in
    // it reads as missing data rather than as a quiet month.
    $series = [];
    for ($i = 11; $i >= 0; $i--) {
        $m = gmdate('Y-m', strtotime("-$i months"));
        $series[] = ['month' => $m, 'joined' => $growth[$m] ?? 0];
    }

    $byCentre = [];
    foreach (db_all("SELECT COALESCE(NULLIF(centre, ''), '(no centre)') name, COUNT(*) total,
                            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) active
                     $base GROUP BY name ORDER BY total DESC", $args) as $r) {
        $byCentre[] = ['name' => (string)$r['name'], 'total' => (int)$r['total'],
                       'active' => (int)$r['active']];
    }

    /* Dormant: active on paper, nothing recorded for 60 days. The number
       that tells you whether a membership is real. */
    $cut60 = gmdate('Y-m-d', strtotime('-60 days'));
    $dormant = $one("SELECT COUNT(*) c FROM members m LEFT JOIN member_stats s ON s.memberId = m.memberId
                     WHERE m.status = 'active'" . str_replace('centre', 'm.centre', $scope) . "
                       AND (s.lastActiveAt IS NULL OR s.lastActiveAt < ?)", array_merge($args, [$cut60]));

    // ── Data quality ───────────────────────────────────────────────────
    $realCentres = array_map(fn($r) => (string)$r['name'], db_all('SELECT name FROM centres'));
    $unknownCentre = 0;
    foreach ($byCentre as $c) {
        if ($c['name'] !== '(no centre)' && !in_array($c['name'], $realCentres, true)) {
            $unknownCentre += $c['total'];
        }
    }

    /* A child with no way to reach a guardian. Age from dob where we have
       one; a blank dob is not assumed to be an adult, because assuming the
       safer-sounding answer here means the ones we know least about are the
       ones nobody chases. */
    $minorCut = gmdate('Y-m-d', strtotime('-18 years'));
    $noGuardian = $one("SELECT COUNT(*) c $base
                        AND dob <> '' AND dob > ?
                        AND COALESCE(NULLIF(parentPhone, ''), NULLIF(parentEmail, '')) IS NULL",
                       array_merge($args, [$minorCut]));

    $quality = [
        'no_email'        => $one("SELECT COUNT(*) c $base AND COALESCE(NULLIF(email, ''), NULL) IS NULL", $args),
        'no_phone'        => $one("SELECT COUNT(*) c $base AND COALESCE(NULLIF(phone, ''), NULL) IS NULL", $args),
        'no_centre'       => $one("SELECT COUNT(*) c $base AND COALESCE(NULLIF(centre, ''), NULL) IS NULL", $args),
        'unknown_centre'  => $unknownCentre,
        'no_dob'          => $one("SELECT COUNT(*) c $base AND COALESCE(NULLIF(dob, ''), NULL) IS NULL", $args),
        'minor_no_guardian' => $noGuardian,
        'duplicate_groups'  => count(admin_members_duplicates($p)['groups'] ?? []),
    ];

    // ── Dues, where the ledger is in use ───────────────────────────────
    $dues = null;
    if (in_array('fees', member_effective_caps($g['requester']), true)) {
        $owing = db_row("SELECT COUNT(DISTINCT l.memberId) people,
                                SUM(CASE WHEN l.direction = 'charge' THEN l.amount ELSE -l.amount END) balance
                         FROM member_ledger l JOIN members m ON m.memberId = l.memberId
                         WHERE l.voidedAt = ''" . str_replace('centre', 'm.centre', $scope), $args);
        $dues = ['people' => (int)($owing['people'] ?? 0), 'outstanding' => (int)($owing['balance'] ?? 0)];
    }

    $staff = [];
    foreach (db_all("SELECT role, COUNT(*) c $base AND role <> 'member' GROUP BY role ORDER BY c DESC", $args) as $r) {
        $staff[(string)$r['role']] = (int)$r['c'];
    }

    /* ── Conduct and progression ─────────────────────────────────────
       Each count is the roster segment it opens, so the tile and the list
       behind it cannot disagree. The naira figures are the conduct
       record's (`sanctions.amount`), visible to whoever runs conduct;
       the ledger's money stays behind `fees` in the Dues panel above. */
    $seg = function (string $key) use ($base, $args, $one): int {
        [$sql, $sp] = member_segment_sql($key);
        return $one("SELECT COUNT(*) c $base AND ($sql)", array_merge($args, $sp));
    };
    $fineSum = function (array $statuses) use ($scope, $args): int {
        $in = implode(',', array_fill(0, count($statuses), '?'));
        return (int)(db_row("SELECT COALESCE(SUM(s.amount), 0) c FROM sanctions s JOIN members m ON m.memberId = s.personId
                             WHERE s.personType = 'member' AND s.kind = 'fine' AND s.status IN ($in)"
                             . str_replace('centre', 'm.centre', $scope), array_merge($statuses, $args))['c'] ?? 0);
    };
    $promotedSince = function (string $since) use ($scope, $args, $one): int {
        return $one("SELECT COUNT(DISTINCT p.memberId) c FROM member_promotions p JOIN members m ON m.memberId = p.memberId
                     WHERE p.at >= ?" . str_replace('centre', 'm.centre', $scope), array_merge([$since], $args));
    };
    $conduct = [
        'fined'          => $seg('fined'),
        'finesImposed'   => $fineSum(['active', 'pending', 'paid', 'cleared']),
        'finesOwedBy'    => $seg('fines_owed'),
        'finesOwed'      => $fineSum(['active', 'pending']),
        'suspended'      => $seg('suspended'),
        'evicted'        => $seg('evicted'),
        'awaitingReview' => $seg('conduct_review'),
        'promoted'       => $seg('promoted_ngv'),
        'promoted365'    => $promotedSince(gmdate('Y-m-d', strtotime('-365 days'))),
    ];

    $where = []; $wargs = [];
    if ($names !== null) { $where[] = 'centre IN (' . implode(',', array_fill(0, count($names), '?')) . ')'; $wargs = $names; }

    return ['ok' => true, 'overview' => [
        'asAt' => $today,
        'scoped' => $names !== null,
        'headline' => [
            'total'    => $total,
            'active'   => $active,
            'inactive' => $total - $active,
            'new30'    => $one("SELECT COUNT(*) c $base AND $joined >= ?", array_merge($args, [gmdate('Y-m-d', strtotime('-30 days'))])),
            'new365'   => $one("SELECT COUNT(*) c $base AND $joined >= ?", array_merge($args, [gmdate('Y-m-d', strtotime('-365 days'))])),
            'dormant'  => $dormant,
        ],
        'byStatus' => $group('status'),
        'byType'   => $group('type'),
        'byCentre' => $byCentre,
        'growth'   => $series,
        'staff'    => $staff,
        'consent'  => admin_members_consent_summary($where, $wargs),
        'quality'  => $quality,
        'dues'     => $dues,
        'conduct'  => $conduct,
    ]];
}

/**
 * Members who look like the same person.
 *
 * Shown rather than merged. Two records with one email is a refusal; two
 * records with the same name and phone is a judgement somebody has to make,
 * and automatic merging would eventually join two real siblings who share a
 * parent's phone number.
 */
function admin_members_duplicates(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $names = admin_centre_names_in_scope($g['requester']);
    $scopeSql = ''; $scopeArgs = [];
    if ($names !== null) {
        if (!$names) return ['ok' => true, 'groups' => []];
        $scopeSql = ' AND centre IN (' . implode(',', array_fill(0, count($names), '?')) . ')';
        $scopeArgs = $names;
    }

    $groups = [];
    foreach ([
        ['email', "lower(email)", 'the same email address'],
        ['phone', "replace(replace(phone,' ',''),'-','')", 'the same phone number'],
        ['name',  "lower(fullName)", 'the same name'],
    ] as [$key, $expr, $why]) {
        $rows = db_all("SELECT $expr k, COUNT(*) c FROM members
                        WHERE $expr <> '' AND $expr IS NOT NULL$scopeSql
                        GROUP BY k HAVING c > 1 ORDER BY c DESC LIMIT 50", $scopeArgs);
        foreach ($rows as $r) {
            $members = db_all("SELECT memberId, fullName, email, phone, centre, status, type, createdAt
                               FROM members WHERE $expr = ?$scopeSql ORDER BY createdAt", array_merge([$r['k']], $scopeArgs));
            $groups[] = ['on' => $key, 'why' => $why, 'value' => (string)$r['k'],
                         'count' => (int)$r['c'], 'members' => $members];
        }
    }

    return ['ok' => true, 'groups' => $groups];
}

function admin_members_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    $memberId = trim((string)($data['memberId'] ?? ''));
    $existing = $memberId !== '' ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]) : null;
    /* An edit is what CHANGED. The editor posts the whole record back, so a
       value nobody touched — an old status, a type from before the closed set,
       an address imported as "N/A" — was validated as if typed now, and one
       such field made the member impossible to save at all: the refusal named
       a field the operator could not see they had sent. A field equal to what
       is stored is dropped before validation; a changed one is held to every
       rule, as before. */
    if ($existing) {
        foreach ($data as $k => $v) {
            if ($k === 'memberId' || is_array($v) || !array_key_exists($k, $existing)) continue;
            if (trim((string)($v ?? '')) === trim((string)($existing[$k] ?? ''))) unset($data[$k]);
        }
    }
    // Only holders of the 'rbac' capability may set/change roles, and never
    // to a tier above their own (admin_may_manage). A role they may not give
    // is dropped from the edit, not silently coerced into another.
    if (isset($data['role'])) {
        if ($data['role'] !== 'member' && !in_array($data['role'], staff_role_names(), true)) unset($data['role']);
        else {
            $cur = $memberId !== '' ? (string)(db_row('SELECT role FROM members WHERE memberId = ? LIMIT 1', [$memberId])['role'] ?? 'member') : 'member';
            if ($cur !== $data['role'] && !admin_may_manage($g['requester'], $cur, (string)$data['role'])) unset($data['role']);
        }
    }

    $cols = ['fullName','email','phone','type','status','role','centre','photoUrl','track','cohort','joinDate','dob','parentName','parentEmail','parentPhone','school','bio','socials','notes','displayId','disciplines','level','division'];
    /* A closed set, refused rather than coerced. The four divisions are the
     * brief's (domain/formation.php) and a fifth is a typo, not a new
     * division — accepting it would put a member somewhere no report counts
     * and no mandate covers. Blank stays legitimate: unplaced is a real
     * state and the honest one for a member nobody has assigned. The name
     * is accepted as well as the id, because that is what a person types. */
    if (array_key_exists('division', $data)) {
        $raw = trim((string)$data['division']);
        if ($raw === '') { $data['division'] = ''; }
        else {
            $d = nggc_division($raw);
            if (!$d) return ['ok' => false, 'error' => 'bad_division'];
            $data['division'] = $d['id'];
        }
    }

    // ── Tier ───────────────────────────────────────────────────────────
    /* A staff account's sign-in identity and lifecycle belong to Access &
       roles, not to the roster. Changing a super admin's email to your own and
       then resetting "their" password was a whole-console takeover through an
       ordinary people edit; suspending somebody above you skipped the
       last-super-admin rule. So the fields that decide who can sign in as a
       staff account move only for somebody allowed to manage that tier. */
    if ($existing && is_admin_role((string)($existing['role'] ?? ''))) {
        $touch = array_intersect(array_keys($data), ['email', 'status', 'type', 'phone']);
        $self = (string)$existing['memberId'] === (string)($g['requester']['memberId'] ?? '');
        if ($self && array_key_exists('status', $data)) return ['ok' => false, 'error' => 'own_account'];
        if ($touch && !$self && !admin_may_manage($g['requester'], (string)$existing['role'])) {
            return ['ok' => false, 'error' => 'staff_account',
                    'detail' => 'A staff account’s email, phone, type and status are changed in Access & roles, by somebody who manages that tier.'];
        }
    }

    // ── Scope ──────────────────────────────────────────────────────────
    // The roster is filtered by centre; these operations were not. A scoped
    // admin could edit, re-centre or re-type any member in the organisation
    // by passing their id.
    if ($existing) {
        $sg = admin_member_scope_gate($g['requester'], $memberId, $existing);
        if (!$sg['ok']) return $sg;
        // And may not move them out of their own reach, or into somebody
        // else's centre.
        if (array_key_exists('centre', $data)
            && !admin_centre_write_allowed($g['requester'], (string)$data['centre'])) {
            return ['ok' => false, 'error' => 'centre_out_of_scope',
                    'detail' => 'You can only move a member between centres you administer.'];
        }
    } elseif (!admin_centre_write_allowed($g['requester'], (string)($data['centre'] ?? ''))) {
        return ['ok' => false, 'error' => 'centre_out_of_scope',
                'detail' => 'Choose one of the centres you administer for this member.'];
    }

    // ── Validation ─────────────────────────────────────────────────────
    /* A photo taken in the editor arrives as a data: URL when no image cloud is
       configured (or the host blocks the config read that would find one). It
       went into members.photoUrl as it came — a TEXT column, 64 KB on MySQL —
       so a real photograph made the save throw `internal`, and only on the
       live database: SQLite has no such limit. Every other intake stores the
       bytes and keeps a short URL (photo_intake_url); this one now does too. */
    if (array_key_exists('photoUrl', $data) && is_string($data['photoUrl']) && preg_match('#^data:#i', trim($data['photoUrl']))) {
        $data['photoUrl'] = photo_intake_url($data['photoUrl']);
        if ($data['photoUrl'] === '') return ['ok' => false, 'error' => 'bad_photo',
            'detail' => 'That photo could not be stored. Try a JPEG or PNG under 10 MB.'];
    }
    $v = admin_member_validate($data, $existing);
    if (!$v['ok']) return $v;
    $data = $v['data'];

    if ($existing) {
        // ── Lockout guards ─────────────────────────────────────────────
        // Protect against removing the platform's last way in.
        $isSelf   = strtolower((string)$existing['memberId']) === strtolower((string)$g['requester']['memberId']);
        $wasSuper = strtolower((string)$existing['role']) === 'super_admin';
        $newRole  = isset($data['role'])   ? strtolower((string)$data['role'])   : null;
        $newStat  = isset($data['status']) ? strtolower((string)$data['status']) : null;
        $losesSuper = $wasSuper && (($newRole !== null && $newRole !== 'super_admin') || ($newStat !== null && $newStat !== 'active'));
        if ($losesSuper) {
            $activeSupers = (int) db_row("SELECT COUNT(*) c FROM members WHERE lower(role) = 'super_admin' AND status = 'active'")['c'];
            if ($activeSupers <= 1) {
                return ['ok' => false, 'error' => 'last_super_admin',
                        'detail' => 'This is the last active super admin — promote another super admin first.'];
            }
        }
        // Don't let a super admin lock themselves out by accident.
        if ($isSelf && $newRole !== null && $newRole !== 'super_admin' && $wasSuper) {
            return ['ok' => false, 'error' => 'cannot_demote_self', 'detail' => 'Ask another super admin to change your role.'];
        }
        if ($isSelf && $newStat !== null && $newStat !== 'active') {
            return ['ok' => false, 'error' => 'cannot_suspend_self'];
        }

        $patch = db_pick($data, $cols);
        /* A printed id typed on the desk is CLAIMED first: one that another
           record holds is refused, naming them, rather than giving one id to
           two people. Correcting an id is allowed; the old one stays claimed,
           because it may already be printed on a card. */
        if (array_key_exists('displayId', $patch)) {
            $patch['displayId'] = trim((string)$patch['displayId']);
            if ($patch['displayId'] !== '' && strtoupper($patch['displayId']) !== strtoupper(trim((string)($existing['displayId'] ?? '')))) {
                $taken = admin_member_id_taken($patch['displayId'], (string)$existing['memberId']);
                if ($taken) return $taken;
            }
        }
        $patch['updatedAt'] = now_iso();
        db_update('members', $patch, ['id' => $existing['id']]);
        // Newly promoted to a staff tier → send an invite/onboarding email.
        $wasStaff = is_admin_role((string)$existing['role']);
        if ($newRole !== null && !$wasStaff && in_array($newRole, staff_role_names(), true)) {
            staff_invite_email($memberId, $newRole);
        }
        audit('admin.member.update', $g['requester']['memberId'], $memberId, ['keys' => array_keys($patch)], (string)($p['ip'] ?? ''));
        event_emit('member.updated', ['memberId' => $memberId] + (db_row('SELECT memberId, fullName, email, phone, type, status, role, centre, track, cohort, school, parentName, parentEmail, parentPhone FROM members WHERE memberId = ?', [$memberId]) ?: []));
        return ['ok' => true, 'memberId' => $memberId];
    }

    $newId = new_id(($data['type'] ?? '') === 'Summer' ? 'SUM' : 'NGG', 'members', 'memberId');
    $insert = db_pick($data, $cols);
    $insert['memberId'] = $newId;
    $insert['status'] = $insert['status'] ?? ($data['status'] ?? 'active');
    $insert['role'] = $insert['role'] ?? ($data['role'] ?? 'member');
    $insert['createdAt'] = now_iso();
    $insert['updatedAt'] = now_iso();
    /* A member gets their printed ID at creation, as a participant always
       has. Left blank it falls back to the internal memberId on the card —
       see domain/member-id.php. */
    if (trim((string)($insert['displayId'] ?? '')) === '' && member_is_ngg($insert)) {
        $insert['displayId'] = member_mint_and_claim($insert, $newId);
    } elseif (trim((string)($insert['displayId'] ?? '')) !== '') {
        $taken = admin_member_id_taken((string)$insert['displayId'], $newId);
        if ($taken) return $taken;
    }
    db_insert('members', $insert);
    /* And a card the gate can read, printed new — the secure kind. */
    member_cards_ensure($insert, (string)($g['requester']['memberId'] ?? ''), 'created');
    if (is_admin_role((string)$insert['role'])) staff_invite_email($newId, (string)$insert['role']);
    audit('admin.member.create', $g['requester']['memberId'], $newId, [], (string)($p['ip'] ?? ''));
    event_emit('member.created', ['memberId' => $newId, 'fullName' => (string)($insert['fullName'] ?? ''), 'type' => (string)($insert['type'] ?? ''), 'centre' => (string)($insert['centre'] ?? '')]);
    return ['ok' => true, 'memberId' => $newId];
}

/** Super-admin: set a staff member's EXTRA capabilities (beyond their role). */
function admin_member_caps_set(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT id, role FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!is_admin_role((string)$m['role'])) return ['ok' => false, 'error' => 'not_staff'];
    // 'journal' is the journalist role: who may author Programme Journal
    // entries. Grantable on its own, so somebody can write the record without
    // being handed content or people access.
    // 'fees' is the financial capability: who may read/write the dues ledger,
    // grantable on its own so a member-desk admin need not also hold the money.
    $valid = admin_role_caps('super_admin');   // every capability there is, from the one list
    $roleCaps = admin_role_caps((string)$m['role']);
    $in = is_array($p['caps'] ?? null) ? $p['caps'] : [];
    // Store only extras that the role doesn't already grant.
    $extra = array_values(array_unique(array_filter(array_map('strval', $in), fn($c) => in_array($c, $valid, true) && !in_array($c, $roleCaps, true))));
    $patch = ['capsExtra' => json_encode($extra, JSON_UNESCAPED_SLASHES), 'updatedAt' => now_iso()];
    // Centre scope — validated against real centreIds; empty array = unscoped.
    $scopeOut = null;
    if (array_key_exists('centreScope', $p)) {
        $want = is_array($p['centreScope']) ? array_values(array_filter(array_map('strval', $p['centreScope']))) : [];
        if ($want) {
            $ph = implode(',', array_fill(0, count($want), '?'));
            $real = array_map(fn($r) => (string)$r['centreId'], db_all("SELECT centreId FROM centres WHERE centreId IN ($ph)", $want));
            $scopeOut = array_values(array_intersect($want, $real));
            /*
             * An empty centreScope means UNSCOPED — see below. So a request
             * to narrow somebody to centres that all turn out to be bogus
             * (mistyped ids, or a centre deleted since) would resolve to []
             * and silently hand them the whole organisation. A narrowing
             * mistake must not become a widening: refuse it.
             *
             * Explicitly sending [] is still "unscoped", because that is
             * somebody deliberately removing a restriction rather than
             * failing to apply one.
             */
            if (!$scopeOut) {
                return ['ok' => false, 'error' => 'centre_scope_unknown',
                        'detail' => 'None of those centres exist, and saving an empty scope would '
                            . 'give this admin every centre instead of the ones you meant.'];
            }
        } else { $scopeOut = []; }
        $patch['centreScope'] = json_encode($scopeOut, JSON_UNESCAPED_SLASHES);
    }
    db_update('members', $patch, ['id' => $m['id']]);
    audit('admin.member.caps', (string)($p['requesterId'] ?? ''), $mid, ['extra' => $extra, 'centreScope' => $scopeOut], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'capsExtra' => $extra, 'centreScope' => $scopeOut];
}

/**
 * admin.roles — the role registry and what each capability means, for the
 * role picker and the access matrix. The screen derives every list of roles
 * from this; it keeps no copy of its own (CLAUDE.md §11).
 */
function admin_roles(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $roles = [];
    foreach (ADMIN_ROLES as $id => $r) $roles[] = ['id' => $id, 'label' => $r['label'], 'summary' => $r['summary'], 'caps' => $r['caps'],
        'scoped' => !empty($r['scoped']), 'queued' => !empty($r['queued']), 'tier' => (int)$r['tier'],
        'mayGrant' => admin_may_manage($g['requester'], 'member', $id)];
    $caps = [];
    foreach (ADMIN_CAPS as $k => $d) $caps[] = ['id' => $k, 'label' => $d];
    return ['ok' => true, 'roles' => $roles, 'caps' => $caps,
            'me' => ['role' => (string)$g['requester']['role'], 'caps' => member_effective_caps($g['requester']), 'scoped' => admin_centre_names_in_scope($g['requester']) !== null]];
}

/** Email a newly-granted staff member their onboarding invite (sign-in link). */
function staff_invite_email(string $memberId, string $role): void {
    $m = db_row('SELECT fullName, email FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m || empty($m['email']) || !filter_var((string)$m['email'], FILTER_VALIDATE_EMAIL)) return;
    $roleName = is_admin_role($role) ? admin_role_label($role) : 'Staff';
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/login';
    @send_mail((string)$m['email'], "You've been added to the NGG team", email_template([
        'title' => 'Welcome to the team',
        'intro' => 'Hi ' . esc_html(explode(' ', (string)$m['fullName'])[0] ?: 'there') . " — you've been granted the {$roleName} role at Next Generation Genius.",
        'bodyHtml' => '<p style="margin:0 0 10px">Sign in with this email (request a code, or set a password), then you\'ll set up two-factor authentication the first time you open the Control Room.</p>',
        'ctaLabel' => 'Sign in to the Control Room →', 'ctaUrl' => $url,
    ]));
    audit('staff.invite', null, $memberId, ['role' => $role], '');
}

// ── Mentors ──────────────────────────────────────────────────────────────

function admin_mentors_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM mentors ORDER BY createdAt DESC');
    return ['ok' => true, 'mentors' => array_map('mentor_full', $rows)];
}

function admin_mentors_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    // Client may send tracks as an array — flatten to the CSV the column stores.
    if (isset($data['tracks']) && is_array($data['tracks'])) $data['tracks'] = implode(', ', array_filter(array_map('trim', $data['tracks'])));
    $mentorId = trim((string)($data['mentorId'] ?? ''));
    $cols = ['fullName','email','phone','status','tracks','centre','bio','photoUrl','maxMentees','availability','checkedAt','joinedAt','source','program','skills','linkedin','afrovanguardRef','programme'];
    // Which cohort they supervise. Anything unrecognised falls back to the
    // narrowest option rather than the widest — a typo must not hand somebody
    // both cohorts.
    if (isset($data['programme']) && !in_array((string)$data['programme'], ['summer', 'ngg', 'both'], true)) $data['programme'] = 'summer';
    $existing = $mentorId ? db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]) : null;

    /* One active mentor per email. The gate falls back to email when a record
     * carries no member or volunteer link, and two rows answering to one
     * address leave it choosing between two people's classes — so the
     * collision is refused where it is created rather than resolved later
     * where it cannot be. Checked on the edit branch too: pointing an existing
     * record at somebody else's address is the same collision through a
     * different door. */
    if (array_key_exists('email', $data)) {
        $wantEmail = trim((string)$data['email']);
        if ($wantEmail !== '' && mentor_email_taken($wantEmail, $mentorId)) {
            return ['ok' => false, 'error' => 'email_taken'];
        }
    }

    if ($existing) {
        $patch = db_pick($data, $cols, [], ['maxMentees']);
        $patch['updatedAt'] = now_iso();
        db_update('mentors', $patch, ['id' => $existing['id']]);
        audit('admin.mentor.update', $g['requester']['memberId'], $mentorId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'mentorId' => $mentorId];
    }
    $newId = new_id('MEN', 'mentors', 'mentorId');
    $insert = db_pick($data, $cols, [], ['maxMentees']);
    $insert['mentorId'] = $newId;
    $insert['status'] = $insert['status'] ?? 'pending-checks';
    $insert['createdAt'] = now_iso();
    $insert['updatedAt'] = now_iso();
    db_insert('mentors', $insert);
    audit('admin.mentor.create', $g['requester']['memberId'], $newId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'mentorId' => $newId];
}

// ── Sessions ───────────────────────────────────────────────────────────────

function admin_sessions_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;   // a write: content, not any staff
    $data = $p['data'] ?? [];
    $sessionId = trim((string)($data['sessionId'] ?? ''));
    $cols = ['code','year','name','startDate','endDate','theme','isActive','coverUrl','notes'];
    $existing = $sessionId ? db_row('SELECT * FROM sessions WHERE sessionId = ? LIMIT 1', [$sessionId]) : null;
    $patch = db_pick($data, $cols, ['isActive'], ['year']);
    $patch['updatedAt'] = now_iso();
    if ($existing) {
        db_update('sessions', $patch, ['id' => $existing['id']]);
        audit('admin.session.update', $g['requester']['memberId'], $sessionId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'sessionId' => $sessionId];
    }
    $patch['sessionId'] = $sessionId ?: (strtoupper((string)($data['code'] ?? 'SESS')) . '-' . (int)($data['year'] ?? gmdate('Y')));
    $patch['createdAt'] = now_iso();
    db_insert('sessions', $patch);
    audit('admin.session.create', $g['requester']['memberId'], $patch['sessionId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sessionId' => $patch['sessionId']];
}

// ── Anchor missions ──────────────────────────────────────────────────────

function admin_missions_list(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM anchor_missions ORDER BY week, orderIndex');
    // Map orderIndex → order for the editor.
    $out = array_map(function ($m) {
        $m['order'] = (int)$m['orderIndex'];
        $m['isActive'] = to_bool($m['isActive']);
        unset($m['orderIndex']);
        return $m;
    }, $rows);
    return ['ok' => true, 'missions' => $out];
}

function admin_missions_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;   // a write: content, not any staff
    $data = $p['data'] ?? [];
    if (array_key_exists('order', $data)) $data['orderIndex'] = $data['order'];
    $missionId = trim((string)($data['missionId'] ?? ''));
    $cols = ['week','orderIndex','theme','title','prompt','proof','xp','type','estimatedMin','bookPage','isActive'];
    $existing = $missionId ? db_row('SELECT * FROM anchor_missions WHERE missionId = ? LIMIT 1', [$missionId]) : null;
    $patch = db_pick($data, $cols, ['isActive'], ['week','orderIndex','xp','estimatedMin','bookPage']);
    $patch['updatedAt'] = now_iso();

    if ($existing) {
        db_update('anchor_missions', $patch, ['id' => $existing['id']]);
        $id = $missionId;
    } else {
        $id = $missionId ?: ('ANCH-W' . str_pad((string)(int)($data['week'] ?? 0), 2, '0', STR_PAD_LEFT) . '-M' . rand_hex(2));
        $patch['missionId'] = $id;
        if (!isset($patch['isActive'])) $patch['isActive'] = 1;
        $patch['createdAt'] = now_iso();
        db_insert('anchor_missions', $patch);
    }
    audit('admin.mission.upsert', $g['requester']['memberId'], $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'missionId' => $id];
}

// ── Events ─────────────────────────────────────────────────────────────────

function admin_events_list(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM events ORDER BY COALESCE(NULLIF(startAt,''), createdAt) DESC");
    return ['ok' => true, 'total' => count($rows), 'events' => array_map('admin_event', $rows)];
}

function admin_events_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;   // a write: content, not any staff
    $data = $p['data'] ?? [];
    $eventId = trim((string)($data['eventId'] ?? ''));
    $cols = ['title','kind','sessionId','startAt','endAt','centre','location','coverUrl','body','capacity','isPublic','status'];
    $existing = $eventId ? db_row('SELECT * FROM events WHERE eventId = ? LIMIT 1', [$eventId]) : null;
    $patch = db_pick($data, $cols, ['isPublic'], ['capacity']);
    $patch['updatedAt'] = now_iso();
    $patch['createdBy'] = $g['requester']['memberId'];
    if ($existing) {
        db_update('events', $patch, ['id' => $existing['id']]);
        audit('admin.event.update', $g['requester']['memberId'], $eventId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'eventId' => $eventId];
    }
    $newId = 'EVT-' . gmdate('Y') . '-' . rand_hex(4);
    $patch['eventId'] = $newId;
    $patch['createdAt'] = now_iso();
    db_insert('events', $patch);
    audit('admin.event.create', $g['requester']['memberId'], $newId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'eventId' => $newId];
}

// ── Posts ────────────────────────────────────────────────────────────────

function admin_posts_list(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM posts ORDER BY COALESCE(NULLIF(publishAt,''), createdAt) DESC");
    return ['ok' => true, 'total' => count($rows), 'posts' => array_map(fn($r) => admin_post($r, false), $rows)];
}

function admin_posts_get(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM posts WHERE postId = ? LIMIT 1', [(string)($p['postId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'post' => admin_post($row, true)];
}

function admin_posts_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;   // a write: content, not any staff
    $data = $p['data'] ?? [];
    $postId = trim((string)($data['postId'] ?? ''));
    $cols = ['slug','kind','title','excerpt','body','coverUrl','category','authorId','tags','status','publishAt','featured','promoCta','promoUrl','promoExpires'];
    $existing = $postId ? db_row('SELECT * FROM posts WHERE postId = ? LIMIT 1', [$postId]) : null;
    $patch = db_pick($data, $cols, ['featured']);
    $patch['updatedAt'] = now_iso();
    $patch['authorId'] = $patch['authorId'] ?? ($data['authorId'] ?? $g['requester']['memberId']);
    if ($existing) {
        db_update('posts', $patch, ['id' => $existing['id']]);
        audit('admin.post.update', $g['requester']['memberId'], $postId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'postId' => $postId];
    }
    $newId = 'POST-' . gmdate('Y') . '-' . rand_hex(4);
    $patch['postId'] = $newId;
    $patch['slug'] = $patch['slug'] ?? '';
    if ($patch['slug'] === '') $patch['slug'] = slugify((string)($data['title'] ?? $newId));
    $patch['status'] = $patch['status'] ?? 'draft';
    $patch['createdAt'] = now_iso();
    db_insert('posts', $patch);
    audit('admin.post.create', $g['requester']['memberId'], $newId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'postId' => $newId, 'slug' => $patch['slug']];
}

function admin_promotions_get(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $promo = setting_get('homepage_promo');
    return ['ok' => true, 'promo' => is_array($promo) ? $promo : null];
}

function admin_promotions_set(array $p): array {
    /* The homepage banner is the public site's first line, and it sits in
       Settings. Any staff role could rewrite it — an auditor, a check-in desk
       volunteer — because this asked only "are you staff". */
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $promo = $p['promo'] ?? null;
    setting_set('homepage_promo', $promo ? json_encode($promo, JSON_UNESCAPED_SLASHES) : '', $g['requester']['memberId']);
    audit('admin.promo.set', $g['requester']['memberId'], '', ['promo' => $promo], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_anchor_get(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    return ['ok' => true, 'content' => anchor_content(), 'defaults' => anchor_default_content()];
}

/** Pristine default content — used by the manager's "reset to default" actions. */
function admin_anchor_defaults(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    return ['ok' => true, 'content' => anchor_default_content()];
}

function admin_anchor_set(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    if (!is_array($data)) return ['ok' => false, 'error' => 'bad_data'];
    // Keep only the known top-level keys; merge over defaults for safety. Bound
    // list sizes so a bad payload can't bloat the settings row.
    $clean = [];
    if (isset($data['weeks']) && is_array($data['weeks'])) $clean['weeks'] = array_slice(array_values($data['weeks']), 0, 24);
    if (isset($data['quotes']) && is_array($data['quotes'])) $clean['quotes'] = array_slice(array_values(array_filter(array_map(fn($q) => is_string($q) ? trim($q) : '', $data['quotes']), fn($q) => $q !== '')), 0, 200);
    if (isset($data['systems']) && is_array($data['systems'])) $clean['systems'] = array_slice(array_values($data['systems']), 0, 30);
    if (array_key_exists('tilt', $data)) $clean['tilt'] = (bool)$data['tilt'];
    setting_set('anchor_content', json_encode($clean, JSON_UNESCAPED_SLASHES), $g['requester']['memberId']);
    audit('admin.anchor.set', $g['requester']['memberId'], '', ['keys' => array_keys($clean), 'weeks' => count($clean['weeks'] ?? []), 'quotes' => count($clean['quotes'] ?? [])], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * Superadmin audit trail. Resolves each actor to a member name + role, supports
 * filtering by actor / event / staff-only, and returns the distinct staff who
 * have appeared in the log (for the filter dropdown). Gated to 'rbac'
 * (super_admin) — it's the accountability record for every admin and manager.
 */
function admin_audit_tail(array $p): array {
    // Readable by super_admin (rbac) AND the read-only M&E 'audit' role.
    $g = admin_cap_gate($p, 'rbac');
    if (!$g['ok']) $g = admin_cap_gate($p, 'audit');
    if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['actor']))  { $where[] = 'a.actorId = ?'; $params[] = (string)$p['actor']; }
    if (!empty($p['event']))  { $where[] = 'a.event LIKE ?'; $params[] = '%' . (string)$p['event'] . '%'; }
    if (!empty($p['staffOnly'])) { $where[] = "m.role IN ('" . implode("','", staff_role_names()) . "')"; }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    // True total so the accountability record is never silently truncated —
    // the client pages through ALL matching entries instead of a hard cap.
    $total = (int) db_row("SELECT COUNT(*) c FROM audit_log a LEFT JOIN members m ON m.memberId = a.actorId" . $whereSql, $params)['c'];
    if (!empty($p['all'])) {
        $rows = db_all("SELECT a.at, a.actorId, a.event, a.subject, a.ip, m.fullName actorName, m.role actorRole FROM audit_log a LEFT JOIN members m ON m.memberId = a.actorId" . $whereSql . ' ORDER BY a.id DESC LIMIT 20000', $params);
        return ['ok' => true, 'audit' => $rows, 'total' => $total];
    }
    $pageSize = min(500, max(1, (int)($p['pageSize'] ?? 100)));
    $page = max(1, (int)($p['page'] ?? 1));
    $offset = ($page - 1) * $pageSize;
    $sql = "SELECT a.at, a.actorId, a.event, a.subject, a.ip, a.meta, m.fullName actorName, m.role actorRole
            FROM audit_log a LEFT JOIN members m ON m.memberId = a.actorId"
        . $whereSql
        . ' ORDER BY a.id DESC LIMIT ? OFFSET ?';
    $rows = db_all($sql, array_merge($params, [$pageSize, $offset]));

    // Distinct staff actors seen in the log — powers the actor filter.
    /* Every staff role, from the one role registry — a hand-written list of
       three left club admins, coordinators, centre leads and auditors out of
       the filter, though their acts are in the log. */
    $staffRoles = staff_role_names();
    $actors = db_all(
        "SELECT DISTINCT a.actorId, m.fullName, m.role FROM audit_log a
         JOIN members m ON m.memberId = a.actorId
         WHERE m.role IN (" . implode(',', array_fill(0, count($staffRoles), '?')) . ") ORDER BY m.fullName",
        $staffRoles
    );
    return ['ok' => true, 'audit' => $rows, 'actors' => $actors, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize];
}

// ── Announcements / broadcast ────────────────────────────────────────────

function admin_broadcast(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;   // a write: content, not any staff
    $title = (string)($p['title'] ?? '');
    $body = (string)($p['body'] ?? '');
    $linkPage = (string)($p['linkPage'] ?? '');
    $audience = (string)($p['audience'] ?? 'all'); // all | Egbeda | Ayobo | Summer | NGG
    $alsoEmail = !empty($p['email']);

    // Persistent broadcast notification (memberId '*' = every member's feed).
    // The audience is stamped so the in-app feed matches the emailed audience.
    $audKey = in_array($audience, ['Egbeda', 'Ayobo', 'Summer', 'NGG'], true) ? $audience : '';
    db_insert('notifications', [
        'notifId' => 'N-' . gmdate('Y') . '-' . rand_hex(4),
        'memberId' => '*', 'kind' => 'announcement', 'title' => $title, 'body' => $body,
        'linkPage' => $linkPage, 'audience' => $audKey, 'readAt' => '', 'createdAt' => now_iso(),
    ]);

    $emailResult = ['sent' => 0, 'skipped' => 0];
    if ($alsoEmail) {
        $where = "status='active'"; $params = [];
        if (in_array($audience, ['Egbeda', 'Ayobo'], true)) { $where .= ' AND centre = ?'; $params[] = $audience; }
        elseif (in_array($audience, ['Summer', 'NGG'], true)) { $where .= ' AND type = ?'; $params[] = $audience; }
        $members = db_all("SELECT fullName, email FROM members WHERE $where", $params);
        $emailResult = email_members($members, $title ?: 'Announcement · NGG', function ($m) use ($title, $body) {
            global $CONFIG;
            return email_template([
                'title' => $title ?: 'Announcement',
                'intro' => 'Hi ' . (explode(' ', (string)$m['fullName'])[0] ?: 'there') . ',',
                'bodyHtml' => '<p style="margin:0">' . nl2br(esc_html($body)) . '</p>',
                'ctaLabel' => 'Open your dashboard', 'ctaUrl' => ($CONFIG['app_origin'] ?? '') . '/#dashboard',
            ]);
        }, 300);
    }

    audit('admin.broadcast', $g['requester']['memberId'], '', ['title' => $title, 'audience' => $audience, 'emailed' => $emailResult['sent']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'emailed' => $emailResult['sent'], 'skipped' => $emailResult['skipped']];
}

/** Recent announcements (the broadcast history) — most recent first. */
function admin_broadcast_history(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $rows = db_all("SELECT notifId, title, body, linkPage, audience, createdAt FROM notifications WHERE memberId = '*' AND kind = 'announcement' ORDER BY id DESC LIMIT 50");
    return ['ok' => true, 'announcements' => array_map(fn($r) => [
        'notifId' => $r['notifId'], 'title' => (string)$r['title'], 'body' => (string)$r['body'],
        'linkPage' => (string)$r['linkPage'], 'audience' => (string)($r['audience'] ?? '') ?: 'all', 'createdAt' => $r['createdAt'],
    ], $rows)];
}


/** Claim a typed printed id for a member; the refusal, naming the holder, if somebody else has it. Null when it is theirs now. */
function admin_member_id_taken(string $id, string $memberId): ?array {
    $holder = db_row('SELECT memberId, fullName FROM members WHERE UPPER(displayId) = ? AND memberId <> ? LIMIT 1', [strtoupper(trim($id)), $memberId]);
    $claimant = member_id_claimed_by($id);
    if ($holder || ($claimant !== null && $claimant !== $memberId) || !member_id_claim($memberId, $id)) {
        $who = $holder ? (string)$holder['fullName'] : (string)(db_row('SELECT fullName FROM members WHERE memberId = ?', [(string)$claimant])['fullName'] ?? 'another record');
        return ['ok' => false, 'error' => 'display_id_taken', 'detail' => 'Member ID ' . strtoupper(trim($id)) . ' already belongs to ' . $who . '. One ID, one person.'];
    }
    return null;
}

/* ── Roster search suggestions ─────────────────────────────────────────────
 * The roster's own search finds what CONTAINS the words typed. Two people it
 * cannot find, and a coordinator searching is usually looking for one of them:
 *
 *   · a Summer School participant who is not a member yet — shown only on an
 *     ACCURATE match (the whole name, every word of it, their printed ID, or
 *     a parent's email), never a loose one: a suggestion here leads to a
 *     promotion, and promoting the wrong child is worse than finding nobody;
 *   · an NGG member whose name is VERY close to what was typed but does not
 *     contain it — a typo (Chukwura / Chukwurah), or the names in another
 *     order (Ifeanyi Kosi / Kosi Ifeanyi).
 *
 * Reads only. Centre scope is applied per row. Participants are listed only
 * for staff who hold `summer` or `club`; `canPromote` says whether this
 * operator may promote (admin.club.promote is gated on `club`). */
const MEMBER_SUGGEST_MAX = 5;
function member_name_norm(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    if (function_exists('iconv')) { $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s); if (is_string($t) && $t !== '') $s = strtolower($t); }
    return trim(preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9@.\- ]+/', ' ', $s)));
}
/** Every query word is a whole word of the name. */
function member_name_has_words(string $name, array $words): bool {
    $nt = explode(' ', $name);
    foreach ($words as $w) if (!in_array($w, $nt, true)) return false;
    return true;
}
/** How close a name is to the query, or null when it is not "very close". Lower is closer. */
function member_name_closeness(string $name, string $q, array $words): ?float {
    if ($name === '' || $q === '') return null;
    $nt = array_values(array_filter(explode(' ', $name)));
    // The names in another order.
    $a = $nt; $b = $words; sort($a); sort($b);
    if (count($words) > 1 && $a === $b) return 0.5;
    // A typo in the whole name: a letter or two, scaled to its length.
    $d = levenshtein($q, $name);
    if ($d > 0 && $d <= (strlen($q) >= 10 ? 2 : 1) && strlen($q) >= 5) return (float)$d;
    // Every word typed is a word of the name, give or take one letter (at least one of them not exact).
    if (count($words) >= 2) {
        $sum = 0; $fuzzy = false;
        foreach ($words as $w) {
            $best = 99;
            foreach ($nt as $t) { $best = min($best, levenshtein($w, $t)); }
            if ($best > (strlen($w) >= 5 ? 1 : 0)) return null;
            if ($best > 0) $fuzzy = true;
            $sum += $best;
        }
        if ($fuzzy) return 1.0 + $sum;
    }
    return null;
}
function admin_members_suggest(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $raw = trim((string)($p['q'] ?? ''));
    $q = member_name_norm($raw);
    $caps = member_effective_caps($g['requester']);
    $out = ['ok' => true, 'q' => $raw, 'summer' => [], 'near' => [], 'canPromote' => in_array('club', $caps, true)];
    if (strlen($q) < 3) return $out;
    $words = array_values(array_filter(explode(' ', $q)));

    // NGG members: very close, and not already found by the roster's own search.
    $near = [];
    foreach (db_all("SELECT memberId, fullName, displayId, centre, status, photoUrl FROM members WHERE type = 'NGG'") as $m) {
        $name = member_name_norm((string)$m['fullName']);
        if ($name === '' || strpos($name, $q) !== false) continue;
        if (stripos((string)$m['displayId'], $raw) !== false || stripos((string)$m['memberId'], $raw) !== false) continue;
        // Names that differ only in their numbers (a test roster's "Member 07" / "Member 01") are not typos.
        if (preg_replace('/\d+/', '', $name) === preg_replace('/\d+/', '', $q)) continue;
        $c = member_name_closeness($name, $q, $words);
        if ($c === null || !admin_centre_allowed($g['requester'], (string)$m['centre'])) continue;
        $near[] = ['score' => $c, 'memberId' => $m['memberId'], 'fullName' => $m['fullName'], 'displayId' => (string)$m['displayId'], 'centre' => (string)$m['centre'], 'status' => (string)$m['status'], 'photoUrl' => (string)$m['photoUrl']];
    }
    usort($near, fn($x, $y) => $x['score'] <=> $y['score'] ?: strcmp($x['fullName'], $y['fullName']));
    $out['near'] = array_map(function ($x) { unset($x['score']); return $x; }, array_slice($near, 0, MEMBER_SUGGEST_MAX));

    // Summer School participants: accurate matches only.
    if (array_intersect(['summer', 'club'], $caps)) {
        $like = '%' . $words[0] . '%';
        $rows = db_all("SELECT s.studentId, s.fullName, s.displayId, s.centre, s.status, s.photoUrl, s.parentEmail, s.age, c.name AS edition
            FROM summer_students s LEFT JOIN summer_cohorts c ON c.cohortId = s.cohortId
            WHERE lower(s.fullName) LIKE ? OR lower(s.displayId) = ? OR lower(s.studentId) = ? OR lower(s.parentEmail) = ?
            ORDER BY s.fullName LIMIT 400", [$like, strtolower($raw), strtolower($raw), strtolower($raw)]);
        $hits = [];
        foreach ($rows as $s) {
            $name = member_name_norm((string)$s['fullName']);
            $exactId = strcasecmp((string)$s['displayId'], $raw) === 0 || strcasecmp((string)$s['studentId'], $raw) === 0;
            $exactEmail = $s['parentEmail'] !== null && $s['parentEmail'] !== '' && strcasecmp((string)$s['parentEmail'], $raw) === 0;
            $nameHit = $name === $q || (count($words) >= 2 && member_name_has_words($name, $words));
            if (!$exactId && !$exactEmail && !$nameHit) continue;
            if (!admin_centre_allowed($g['requester'], (string)$s['centre'])) continue;
            $hits[] = ['studentId' => $s['studentId'], 'fullName' => $s['fullName'], 'displayId' => (string)$s['displayId'], 'centre' => (string)$s['centre'],
                'edition' => (string)($s['edition'] ?? ''), 'age' => $s['age'] === null ? null : (int)$s['age'], 'photoUrl' => (string)$s['photoUrl'],
                'promoted' => (string)$s['status'] === 'promoted', 'match' => $exactId ? 'id' : ($exactEmail ? 'email' : 'name')];
            if (count($hits) >= MEMBER_SUGGEST_MAX) break;
        }
        $out['summer'] = $hits;
    }
    return $out;
}
