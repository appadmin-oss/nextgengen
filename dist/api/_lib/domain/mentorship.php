<?php
declare(strict_types=1);

/**
 * Mentorship domain — the "people" surface for mentors, mentee pairing and the
 * mentor pipeline, wired to Afrovanguard's Street-To-Stardom (STS) mentorship.
 * NGG ("Next Gen") is a program inside STS, so mentors carry a `source`
 * ('ngg' | 'afrovanguard') and an optional STS reference. Gated by the
 * 'people' capability (see admin_role_caps).
 */

/* Every active centre's name → code + colour.
 *
 * Centres already carried a colour nobody could see. On a list of forty
 * volunteers a coordinator could not tell at a glance who belongs where —
 * the centre was a word in small grey type, in the same place, on every row.
 * One read, cached per request, so any list can put a person's centre on
 * their photo instead. */
function centre_palette(): array {
    // Deliberately not memoised across the request: one small indexed read,
    // and a static would freeze whatever the table held the first time it was
    // asked — wrong the moment a centre is added or renamed.
    $out = [];
    foreach (db_all("SELECT name, code, color FROM centres WHERE status = 'active' ORDER BY name") as $r) {
        $out[(string)$r['name']] = ['code' => (string)$r['code'], 'color' => (string)($r['color'] ?: '#76B043')];
    }
    return $out;
}

/* Promote a member or a volunteer into the mentor roster.
 *
 * There was no way to do this at all: mentor records only appeared by
 * converting a mentor APPLICATION, so somebody already in the programme — a
 * member, or a summer volunteer who signed up to teach — could not be made a
 * mentor without inventing an application for them.
 *
 * The new row records WHICH record they are, not just their email. Email-only
 * matching fails outright for anyone who signs in with an ID card, and pairs
 * two different people who share a mailbox.
 */
function admin_mentor_promote(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $who = trim((string)($p['personId'] ?? ''));
    if ($who === '') return ['ok' => false, 'error' => 'no_person'];
    $rank = (string)($p['rank'] ?? 'mentor') === 'lead' ? 'lead' : 'mentor';
    $programme = in_array((string)($p['programme'] ?? ''), ['summer', 'ngg', 'both'], true) ? (string)$p['programme'] : 'summer';

    $src = db_row('SELECT memberId, fullName, email, phone, centre, photoUrl FROM members WHERE memberId = ? LIMIT 1', [$who]);
    $kind = $src ? 'member' : '';
    if (!$src) {
        $src = db_row("SELECT volunteerId, fullName, email, phone, centre, faculty, photoUrl FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$who]);
        $kind = $src ? 'volunteer' : '';
    }
    if (!$src) return ['ok' => false, 'error' => 'not_found'];

    $memberId    = $kind === 'member' ? $who : '';
    $volunteerId = $kind === 'volunteer' ? $who : '';
    $email = strtolower(trim((string)($src['email'] ?? '')));

    /* Already a mentor? Update rather than mint a second record — two rows for
     * one person drift apart, and the gate would pick whichever it found
     * first. Matched the same way the gate matches. */
    $existing = db_row("SELECT * FROM mentors WHERE (memberId != '' AND memberId = ?) OR (volunteerId != '' AND volunteerId = ?) LIMIT 1",
                       [$memberId ?: '\x00', $volunteerId ?: '\x00']);
    if (!$existing && $email !== '') $existing = db_row('SELECT * FROM mentors WHERE lower(email) = ? LIMIT 1', [$email]);

    $centre = trim((string)($p['centre'] ?? ($src['centre'] ?? '')));
    $dept   = trim((string)($p['department'] ?? ($src['faculty'] ?? '')));
    $patch = [
        'fullName' => (string)$src['fullName'], 'email' => (string)($src['email'] ?? ''),
        'phone' => (string)($src['phone'] ?? ''), 'centre' => $centre, 'department' => $dept,
        'rank' => $rank, 'programme' => $programme, 'status' => 'active',
        'memberId' => $memberId, 'volunteerId' => $volunteerId,
        'photoUrl' => (string)($src['photoUrl'] ?? ''), 'updatedAt' => now_iso(),
    ];
    if ($existing) {
        db_update('mentors', $patch, ['id' => (int)$existing['id']]);
        $mentorId = (string)$existing['mentorId'];
        $created = false;
    } else {
        $mentorId = new_id('MEN', 'mentors', 'mentorId');
        db_insert('mentors', $patch + ['mentorId' => $mentorId, 'maxMentees' => 5,
            'source' => $kind === 'volunteer' ? 'ngg' : 'ngg', 'createdAt' => now_iso(), 'joinedAt' => now_iso()]);
        $created = true;
    }
    audit('admin.mentor.promote', $g['requester']['memberId'], $mentorId,
          ['from' => $kind, 'personId' => $who, 'rank' => $rank], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'mentorId' => $mentorId, 'created' => $created, 'rank' => $rank, 'kind' => $kind];
}

/** Take someone off the mentor roster without deleting the history attached
 *  to them. Their stars, remarks and session logs stay where they are. */
function admin_mentor_demote(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $mentorId = trim((string)($p['mentorId'] ?? ''));
    $row = db_row('SELECT id FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_update('mentors', ['status' => 'inactive', 'updatedAt' => now_iso()], ['id' => (int)$row['id']]);
    audit('admin.mentor.demote', $g['requester']['memberId'], $mentorId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Who an admin can promote: members and active volunteers not already on the
 *  roster, searchable — a picker over a list of hundreds is the whole job. */
function admin_mentor_candidates(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $like = '%' . $q . '%';
    $taken = [];
    foreach (db_all("SELECT memberId, volunteerId, lower(email) e FROM mentors WHERE status = 'active'") as $r) {
        foreach (['memberId', 'volunteerId', 'e'] as $k) if (trim((string)$r[$k]) !== '') $taken[(string)$r[$k]] = true;
    }
    $out = [];
    $scope = admin_centre_names_in_scope($g['requester']);
    $inScope = fn($c) => $scope === null || trim((string)$c) === '' || in_array((string)$c, $scope, true);
    $rows = $q === ''
        ? db_all("SELECT memberId id, fullName, email, centre, '' faculty, 'member' kind FROM members WHERE status = 'active' ORDER BY fullName LIMIT 40")
        : db_all("SELECT memberId id, fullName, email, centre, '' faculty, 'member' kind FROM members
                  WHERE status = 'active' AND (lower(fullName) LIKE ? OR lower(email) LIKE ? OR lower(memberId) LIKE ?)
                  ORDER BY fullName LIMIT 40", [$like, $like, $like]);
    $vols = $q === ''
        ? db_all("SELECT volunteerId id, fullName, email, centre, faculty, 'volunteer' kind FROM volunteers WHERE status = 'active' ORDER BY fullName LIMIT 40")
        : db_all("SELECT volunteerId id, fullName, email, centre, faculty, 'volunteer' kind FROM volunteers
                  WHERE status = 'active' AND (lower(fullName) LIKE ? OR lower(email) LIKE ? OR lower(volunteerId) LIKE ?)
                  ORDER BY fullName LIMIT 40", [$like, $like, $like]);
    foreach (array_merge($rows, $vols) as $r) {
        if (isset($taken[(string)$r['id']]) || (trim((string)$r['email']) !== '' && isset($taken[strtolower((string)$r['email'])]))) continue;
        if (!$inScope($r['centre'])) continue;
        $out[] = ['personId' => (string)$r['id'], 'kind' => (string)$r['kind'], 'fullName' => (string)$r['fullName'],
            'email' => (string)($r['email'] ?? ''), 'centre' => (string)($r['centre'] ?? ''), 'faculty' => (string)($r['faculty'] ?? '')];
    }
    usort($out, fn($a, $b) => strcasecmp($a['fullName'], $b['fullName']));
    return ['ok' => true, 'candidates' => array_slice($out, 0, 50), 'centres' => centre_palette()];
}

/** Full mentor record for admin views (public_mentor is the trimmed public one). */
function mentor_full(array $m): array {
    return [
        'mentorId' => $m['mentorId'],
        'fullName' => $m['fullName'] ?? '',
        'email' => $m['email'] ?? '',
        'phone' => $m['phone'] ?? '',
        'status' => $m['status'] ?? 'pending-checks',
        'tracks' => array_values(array_filter(array_map('trim', explode(',', (string)($m['tracks'] ?? ''))))),
        'centre' => $m['centre'] ?? '',
        'bio' => $m['bio'] ?? '',
        'photoUrl' => normalize_image_url($m['photoUrl'] ?? ''),
        'maxMentees' => (int)($m['maxMentees'] ?? 0),
        'availability' => $m['availability'] ?? '',
        'source' => $m['source'] ?? 'ngg',
        /* Which cohort they supervise — NOT the same as `source`, which says
         * where the mentor came from. This was writable through the upsert
         * from the day the column landed but was never read back out, so the
         * admin drawer had no way to show what it had saved and every mentor
         * looked like the 'summer' default. */
        'programme' => $m['programme'] ?? 'summer',
        'rank' => ($m['rank'] ?? 'mentor') === 'lead' ? 'lead' : 'mentor',
        'memberId' => (string)($m['memberId'] ?? ''),
        'volunteerId' => (string)($m['volunteerId'] ?? ''),
        'department' => (string)($m['department'] ?? ''),
        'program' => $m['program'] ?? '',
        'skills' => $m['skills'] ?? '',
        'linkedin' => $m['linkedin'] ?? '',
        'afrovanguardRef' => $m['afrovanguardRef'] ?? '',
        'joinedAt' => $m['joinedAt'] ?? '',
    ];
}

function mentorship_links(): array {
    $av = $GLOBALS['CONFIG']['afrovanguard'] ?? [];
    // NGG is the primary site. The parent-org / STS destinations aren't fully
    // set up, so anything not explicitly configured falls back to NGG's own
    // pages rather than pointing users at an unbuilt site.
    $ngg = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? 'https://next.afrovanguard.org.ng'), '/');
    return [
        'orgUrl'        => $av['org_url'] ?? 'https://afrovanguard.org.ng',
        'stsUrl'        => $av['sts_url'] ?? $ngg,
        'volunteerUrl'  => $av['volunteer_url'] ?? ($ngg . '/volunteer'),
        'mentorProgram' => $av['mentor_program'] ?? 'Street-To-Stardom · Next Gen',
    ];
}

// ── Public mentors directory (active mentors only) ──────────────────────────
function public_mentors(array $p): array {
    $rows = db_all("SELECT * FROM mentors WHERE status='active' ORDER BY fullName");
    $out = array_map(function ($m) {
        $pm = public_mentor($m);
        $pm['skills'] = array_values(array_filter(array_map('trim', explode(',', (string)($m['skills'] ?? '')))));
        $pm['program'] = $m['program'] ?? '';
        $pm['source'] = $m['source'] ?? 'ngg';
        return $pm;
    }, $rows);
    return ['ok' => true, 'mentors' => $out, 'afrovanguard' => mentorship_links()];
}

// ── Mentorship overview ──────────────────────────────────────────────────────
function admin_mentorship_overview(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $sc = session_current();
    $sessionId = (string)($sc['current']['sessionId'] ?? '');

    $total     = $one("SELECT COUNT(*) c FROM mentors");
    $active    = $one("SELECT COUNT(*) c FROM mentors WHERE status='active'");
    $pending   = $one("SELECT COUNT(*) c FROM mentors WHERE status='pending-checks'");
    $fromAv    = $one("SELECT COUNT(*) c FROM mentors WHERE source='afrovanguard'");
    $apps      = $one("SELECT COUNT(*) c FROM applications WHERE kind='mentor' AND status IN ('new','reviewing')");
    $capacity  = (int)(db_row("SELECT SUM(maxMentees) c FROM mentors WHERE status='active'")['c'] ?? 0);
    $paired    = $one("SELECT COUNT(*) c FROM mentor_assignments WHERE status='active'");
    // Active members without an active mentor this session.
    $unassigned = $one(
        "SELECT COUNT(*) c FROM members m WHERE m.status='active' AND m.role='member'
         AND NOT EXISTS (SELECT 1 FROM mentor_assignments ma WHERE ma.memberId=m.memberId AND ma.status='active' AND ma.sessionId=?)",
        [$sessionId]
    );
    $byProgram = db_all("SELECT COALESCE(NULLIF(program,''),'—') program, COUNT(*) c FROM mentors GROUP BY program");

    return ['ok' => true, 'overview' => [
        'total' => $total, 'active' => $active, 'pending' => $pending, 'fromAfrovanguard' => $fromAv,
        'applications' => $apps, 'capacity' => $capacity, 'paired' => $paired,
        'openSeats' => max(0, $capacity - $paired), 'unassignedMembers' => $unassigned,
        'byProgram' => $byProgram,
        'afrovanguard' => mentorship_links(),
    ]];
}

// ── Mentor roster (with mentee load) ─────────────────────────────────────────
function admin_mentorship_roster(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $sc = session_current();
    $sessionId = (string)($p['sessionId'] ?? ($sc['current']['sessionId'] ?? ''));
    $rows = db_all('SELECT * FROM mentors ORDER BY status, fullName');
    $out = [];
    foreach ($rows as $m) {
        $rec = mentor_full($m);
        $mentees = db_all(
            "SELECT ma.memberId, ma.track, mem.fullName, mem.centre FROM mentor_assignments ma
             LEFT JOIN members mem ON mem.memberId = ma.memberId
             WHERE ma.mentorId = ? AND ma.status='active' AND ma.sessionId = ?
             ORDER BY mem.fullName",
            [$m['mentorId'], $sessionId]
        );
        $rec['mentees'] = array_map(fn($x) => ['memberId' => $x['memberId'], 'fullName' => $x['fullName'] ?: $x['memberId'], 'centre' => $x['centre'] ?? '', 'track' => $x['track'] ?? ''], $mentees);
        $rec['menteeCount'] = count($mentees);
        $rec['openSeats'] = max(0, ((int)($m['maxMentees'] ?? 0)) - count($mentees));
        $out[] = $rec;
    }
    // Members with no active mentor this session (assignable pool).
    $unassigned = db_all(
        "SELECT m.memberId, m.fullName, m.centre, m.track FROM members m
         WHERE m.status='active' AND m.role='member'
         AND NOT EXISTS (SELECT 1 FROM mentor_assignments ma WHERE ma.memberId=m.memberId AND ma.status='active' AND ma.sessionId=?)
         ORDER BY m.fullName LIMIT 500",
        [$sessionId]
    );
    // Leads first: a centre's lead is who you look for on this screen.
    usort($out, function ($a, $b) {
        $r = ($b['rank'] === 'lead' ? 1 : 0) <=> ($a['rank'] === 'lead' ? 1 : 0);
        return $r ?: strcasecmp((string)$a['fullName'], (string)$b['fullName']);
    });
    return ['ok' => true, 'mentors' => $out, 'unassigned' => $unassigned, 'sessionId' => $sessionId,
        'centres' => centre_palette(), 'afrovanguard' => mentorship_links()];
}

// ── Convert a mentor application into a mentor record ────────────────────────
function admin_mentor_application_convert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if (($a['kind'] ?? '') !== 'mentor') return ['ok' => false, 'error' => 'only_mentor_apps'];

    $existing = db_row('SELECT mentorId FROM mentors WHERE lower(email) = ? LIMIT 1', [strtolower((string)$a['email'])]);
    if ($existing) { db_update('applications', ['status' => 'accepted'], ['id' => $id]); return ['ok' => true, 'mentorId' => $existing['mentorId'], 'existed' => true]; }

    $links = mentorship_links();
    $newId = new_id('MEN', 'mentors', 'mentorId');
    /* Carry the intake across — the same fix the teen path needed.
     *
     * Three conversion paths read the same applications table. The volunteer
     * one carries everything it collected; this one wrote nine fields and
     * dropped the phone number, the headshot and the join date, all of which
     * have a column waiting. The phone is the sharp one: the next thing that
     * happens to a new mentor is a safeguarding check, and the email below
     * promises exactly that — "we'll be in touch" — from a record with no way
     * to be in touch except the inbox they applied from. */
    db_insert('mentors', [
        'mentorId' => $newId, 'fullName' => $a['name'], 'email' => $a['email'],
        'phone' => (string)($a['phone'] ?? ''),
        'status' => 'pending-checks', 'tracks' => (string)($a['role'] ?? ''), 'centre' => $a['centre'] ?: '',
        'bio' => (string)($a['why'] ?? ''), 'maxMentees' => 3,
        'photoUrl' => (string)($a['photoUrl'] ?? ''),
        // When they joined the network, which the roster sorts and prints on.
        'joinedAt' => gmdate('Y-m-d'),
        'source' => 'afrovanguard', 'program' => $links['mentorProgram'],
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);
    @send_mail((string)$a['email'], 'Welcome to the Afrovanguard mentor network',
        email_template([
            'title' => 'Thank you for stepping up, ' . explode(' ', (string)$a['name'])[0] . '.',
            'intro' => 'Your mentor application has been accepted.',
            'bodyHtml' => 'We\'ll be in touch to complete safeguarding checks before pairing you with mentees. '
                . 'NGG mentorship runs inside Afrovanguard\'s ' . esc_html($links['mentorProgram']) . '.',
            'ctaLabel' => 'Afrovanguard volunteer hub', 'ctaUrl' => $links['volunteerUrl'],
            'footNote' => 'Welcome to the network.',
        ]));
    audit('admin.mentor.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'mentorId' => $newId];
}
