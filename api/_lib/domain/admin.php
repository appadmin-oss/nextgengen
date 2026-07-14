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
    if (!role_has_cap($g['requester']['role'], $cap)) {
        return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:' . $cap];
    }
    return $g;
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
    foreach (['centre', 'status', 'type'] as $f) {
        if (!empty($p[$f])) { $where[] = "$f = ?"; $params[] = $p[$f]; }
    }
    // Staff-only view powers the Access & roles roster.
    if (!empty($p['staff'])) { $where[] = "role IN ('editor','summer_admin','club_admin','audit','admin','super_admin')"; }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    // Accurate total for the filtered set, computed before paging so the client
    // can render "N–M of T" and page controls without loading every row.
    $total = (int) db_row('SELECT COUNT(*) c FROM members' . $whereSql, $params)['c'];
    // Optional pagination. page is 1-based; pageSize is clamped. When absent we
    // still cap the result so an unbounded table can't be requested by default.
    $pageSize = min(200, max(1, (int)($p['pageSize'] ?? 50)));
    $page = max(1, (int)($p['page'] ?? 1));
    $offset = ($page - 1) * $pageSize;
    $sql = 'SELECT * FROM members' . $whereSql . ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    $rows = db_all($sql, array_merge($params, [$pageSize, $offset]));
    return ['ok' => true, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize, 'members' => array_map('public_member', $rows)];
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

    $cols = ['fullName','email','phone','type','status','role','centre','photoUrl','track','cohort','joinDate','dob','parentName','parentEmail','parentPhone','school','bio','socials','notes'];
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

    $newId = new_id(($data['type'] ?? '') === 'Summer' ? 'SUM' : 'NGG');
    $insert = db_pick($data, $cols);
    $insert['memberId'] = $newId;
    $insert['status'] = $insert['status'] ?? ($data['status'] ?? 'active');
    $insert['role'] = $insert['role'] ?? ($data['role'] ?? 'member');
    $insert['createdAt'] = now_iso();
    $insert['updatedAt'] = now_iso();
    db_insert('members', $insert);
    if (is_admin_role((string)$insert['role'])) staff_invite_email($newId, (string)$insert['role']);
    audit('admin.member.create', $g['requester']['memberId'], $newId, [], (string)($p['ip'] ?? ''));
    event_emit('member.created', ['memberId' => $newId, 'fullName' => (string)($insert['fullName'] ?? ''), 'type' => (string)($insert['type'] ?? ''), 'centre' => (string)($insert['centre'] ?? '')]);
    return ['ok' => true, 'memberId' => $newId];
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
    $cols = ['fullName','email','phone','status','tracks','centre','bio','photoUrl','maxMentees','availability','checkedAt','joinedAt','source','program','skills','linkedin','afrovanguardRef'];
    $existing = $mentorId ? db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]) : null;

    if ($existing) {
        $patch = db_pick($data, $cols, [], ['maxMentees']);
        $patch['updatedAt'] = now_iso();
        db_update('mentors', $patch, ['id' => $existing['id']]);
        audit('admin.mentor.update', $g['requester']['memberId'], $mentorId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'mentorId' => $mentorId];
    }
    $newId = new_id('MEN');
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
