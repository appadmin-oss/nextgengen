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
    if (!empty($p['staff'])) { $where[] = "role IN ('editor','summer_admin','club_admin','audit','admin','super_admin')"; }

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
                 'centre' => 'centre', 'status' => 'status', 'type' => 'type', 'role' => 'role'];
    $sortKey = (string)($p['sort'] ?? '');
    $sortCol = $sortable[$sortKey] ?? 'createdAt';
    $dir = strtolower((string)($p['dir'] ?? '')) === 'asc' ? 'ASC' : 'DESC';
    if ($sortKey === '') $dir = 'DESC';                     // the default is newest first
    /* Text sorts case-insensitively, because "amina" filed after "Zainab" is
     * not a sort order anybody asked for, and ties break on the id so paging
     * cannot show the same person twice or skip one. */
    $textCols = ['fullName', 'centre', 'status', 'type', 'role'];
    $orderExpr = in_array($sortCol, $textCols, true) ? "lower($sortCol)" : $sortCol;
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
    $m = db_row('SELECT memberId, role FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $r = consent_record($mid, (string)($p['type'] ?? ''), (string)($p['status'] ?? ''),
                        (string)($p['method'] ?? ''), (string)($g['requester']['fullName'] ?? 'Staff'));
    if (empty($r['ok'])) return $r;
    audit('admin.member.consent', $g['requester']['memberId'], $mid,
          ['type' => (string)($p['type'] ?? ''), 'status' => (string)($p['status'] ?? ''),
           'method' => (string)($p['method'] ?? '')], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'consent' => consent_state($mid), 'mayName' => consent_may_publish($mid)['mayName']];
}

function admin_members_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    $memberId = trim((string)($data['memberId'] ?? ''));
    // Only holders of the 'rbac' capability (super_admin) may set/change roles,
    // and never to a tier above their own.
    if (isset($data['role'])) {
        if (!role_has_cap($g['requester']['role'], 'rbac')) unset($data['role']);
        elseif (!in_array($data['role'], ['member', 'editor', 'summer_admin', 'club_admin', 'audit', 'admin', 'super_admin'], true)) unset($data['role']);
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
    $existing = $memberId ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]) : null;

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
        $patch['updatedAt'] = now_iso();
        db_update('members', $patch, ['id' => $existing['id']]);
        // Newly promoted to a staff tier → send an invite/onboarding email.
        $wasStaff = is_admin_role((string)$existing['role']);
        if ($newRole !== null && !$wasStaff && in_array($newRole, ['editor', 'summer_admin', 'club_admin', 'audit', 'admin', 'super_admin'], true)) {
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
        $insert['displayId'] = member_mint_display_id($insert);
    }
    db_insert('members', $insert);
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
    $valid = ['content', 'people', 'inbox', 'settings', 'rbac', 'summer', 'club', 'audit', 'journal', 'fees'];
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
        } else { $scopeOut = []; }
        $patch['centreScope'] = json_encode($scopeOut, JSON_UNESCAPED_SLASHES);
    }
    db_update('members', $patch, ['id' => $m['id']]);
    audit('admin.member.caps', (string)($p['requesterId'] ?? ''), $mid, ['extra' => $extra, 'centreScope' => $scopeOut], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'capsExtra' => $extra, 'centreScope' => $scopeOut];
}

/** Email a newly-granted staff member their onboarding invite (sign-in link). */
function staff_invite_email(string $memberId, string $role): void {
    $m = db_row('SELECT fullName, email FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m || empty($m['email']) || !filter_var((string)$m['email'], FILTER_VALIDATE_EMAIL)) return;
    $roleName = ['editor' => 'Editor', 'summer_admin' => 'Summer School coordinator', 'club_admin' => 'Club coordinator', 'audit' => 'Auditor', 'admin' => 'Admin', 'super_admin' => 'Super admin'][$role] ?? 'Staff';
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
    $g = admin_gate($p); if (!$g['ok']) return $g;
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
    $g = admin_gate($p); if (!$g['ok']) return $g;
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
    $g = admin_gate($p); if (!$g['ok']) return $g;
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
    $g = admin_gate($p); if (!$g['ok']) return $g;
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
    $g = admin_gate($p); if (!$g['ok']) return $g;
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
    if (!empty($p['staffOnly'])) { $where[] = "m.role IN ('editor','admin','super_admin')"; }
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
    $actors = db_all(
        "SELECT DISTINCT a.actorId, m.fullName, m.role FROM audit_log a
         JOIN members m ON m.memberId = a.actorId
         WHERE m.role IN ('editor','admin','super_admin') ORDER BY m.fullName"
    );
    return ['ok' => true, 'audit' => $rows, 'actors' => $actors, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize];
}

// ── Announcements / broadcast ────────────────────────────────────────────

function admin_broadcast(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
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
