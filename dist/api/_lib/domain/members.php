<?php
declare(strict_types=1);

/** Members — dashboard, profile update, notifications. */

function member_dashboard(array $p): array {
    if (function_exists('anchor_ensure_seed')) anchor_ensure_seed();
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    $stats = db_row('SELECT * FROM member_stats WHERE memberId = ? LIMIT 1', [$memberId]) ?: [];
    $sc = session_current();
    $session = $sc['current'] ?: $sc['next'];
    $sessionId = $session['sessionId'] ?? '';
    $week = $session ? week_of_session_from_public($session) : 1;

    // This week's missions + this member's progress on them.
    $missions = db_all('SELECT * FROM anchor_missions WHERE week = ? AND isActive = 1 ORDER BY orderIndex', [min(12, $week)]);
    $progRows = db_all('SELECT * FROM member_progress WHERE memberId = ? AND sessionId = ?', [$memberId, $sessionId]);
    $progByMission = [];
    foreach ($progRows as $r) $progByMission[$r['missionId']] = $r;

    $today = array_map(function ($m) use ($progByMission) {
        return [
            'missionId' => $m['missionId'], 'title' => $m['title'], 'prompt' => $m['prompt'],
            'xp' => (int)$m['xp'], 'type' => $m['type'], 'proof' => $m['proof'],
            'bookPage' => (int)$m['bookPage'], 'estimatedMin' => (int)$m['estimatedMin'],
            'status' => $progByMission[$m['missionId']]['status'] ?? 'todo',
        ];
    }, $missions);

    // Upcoming events (next 30d, member's centre or Both/Online).
    $now = now_iso();
    $horizon = gmdate('Y-m-d\TH:i:s\Z', time() + 30 * 86400);
    $events = db_all(
        "SELECT * FROM events WHERE status='published' AND (centre IN ('Both','Online') OR centre = ?) AND startAt >= ? AND startAt <= ? ORDER BY startAt LIMIT 5",
        [$member['centre'], $now, $horizon]
    );
    /* The viewer's OWN answer rides along.
     *
     * public_event() carries no myRsvp — event_list() attaches it separately,
     * and the dashboard did not. So the button always read "RSVP" however many
     * times you had said yes, the optimistic flip to "Going ✓" was undone by
     * the next sixty-second poll, and because the cancel branch is guarded on
     * myRsvp === "going", a member who reloaded could never withdraw. */
    $myRsvp = [];
    foreach (db_all('SELECT eventId, status FROM event_rsvps WHERE memberId = ?', [$memberId]) as $r) {
        $myRsvp[(string)$r['eventId']] = (string)$r['status'];
    }
    $events = array_map(function ($e) use ($myRsvp) {
        $out = public_event($e);
        $out['myRsvp'] = $myRsvp[(string)$e['eventId']] ?? null;
        return $out;
    }, $events);

    // Unread notifications (this member, or a broadcast whose audience matches).
    [$bc, $bcp] = notif_broadcast_clause($member);
    $notes = db_all("SELECT * FROM notifications WHERE (memberId = ? OR $bc) AND (readAt = '' OR readAt IS NULL) ORDER BY createdAt DESC LIMIT 8", array_merge([$memberId], $bcp));
    $notes = array_map('public_notification', $notes);

    // Assigned mentor for the current session.
    $mentor = null;
    if ($session) {
        $link = db_row("SELECT * FROM mentor_assignments WHERE memberId = ? AND sessionId = ? AND status='active' LIMIT 1", [$memberId, $sessionId]);
        if ($link) {
            $m = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$link['mentorId']]);
            if ($m) $mentor = public_mentor($m);
        }
    }

    return [
        'ok' => true,
        'member' => public_member($member),
        'stats' => [
            'xp' => (int)($stats['xpTotal'] ?? 0),
            'level' => (int)($stats['level'] ?? 1),
            'streak' => (int)($stats['streak'] ?? 0),
            'badges' => safe_json($stats['badges'] ?? null) ?: [],
            /* The words for them. The dashboard had the earned ids and showed
               only a count, because nothing told it what 'half-k-club' is
               called — and a label typed into the component would be a second
               copy of a list util.php owns. */
            'badgeLabels' => member_badge_labels(),
            'badgeCount' => (int)($stats['badgeCount'] ?? 0),
            'currentWeek' => $week,
            'completedThisSession' => (int)($stats['completedThisSession'] ?? 0),
            'lastActiveAt' => $stats['lastActiveAt'] ?? '',
        ],
        'session' => $session,
        'today' => $today,
        'events' => $events,
        'notifications' => $notes,
        'mentor' => $mentor,
        // NGV standing — set once this member has been promoted up the chain of
        // command into the volunteer tier, so the dashboard can show it.
        'ngv' => (function () use ($member) {
            if ((string)($member['ngvVolunteerId'] ?? '') === '') return null;
            $v = db_row("SELECT volunteerId, role, token, status FROM volunteers WHERE volunteerId = ? LIMIT 1", [(string)$member['ngvVolunteerId']]);
            if (!$v) return null;
            // Enough for the dashboard's NGV section to stand in as the volunteer's
            // own view: identity + QR token, live sessions attended + service
            // hours, and the next few sessions to shadow (duties).
            $att = (int)(db_row("SELECT COUNT(*) c FROM attendance WHERE studentId = ?", [(string)$v['volunteerId']])['c'] ?? 0);
            return ['volunteerId' => (string)$v['volunteerId'], 'role' => (string)$v['role'],
                'status' => (string)$v['status'], 'token' => (string)$v['token'], 'since' => (string)($member['ngvAt'] ?? ''),
                'sessions' => $att,
                'profileUrl' => '/q/' . (string)$v['token'],
                'upcoming' => function_exists('volunteer_upcoming_sessions') ? volunteer_upcoming_sessions(3) : []];
        })(),
        // Assignments surfaced inline so the dashboard card renders without a
        // second round-trip.
        'assignments' => assignment_list_for_member(['memberId' => $memberId])['assignments'] ?? [],
    ];
}

/** week_of_session works on a raw row; the dashboard has a public_session shape. */
function week_of_session_from_public(array $s): int {
    $start = strtotime((string)$s['startDate']);
    if ($start === false || time() < $start) return $s['weekOf'] ?? 1;
    return max(1, (int)($s['weekOf'] ?? 1));
}

/**
 * A member's discipline standing, for their own dashboard: whether member
 * enforcement is switched on, their derived compliance state, and the policy
 * FINES they owe. This is deliberately separate from member_fees_account() —
 * dues/training are one ledger, disciplinary fines (sanctions) are another —
 * and it is NOT gated by the fees feature toggle.
 */
function member_compliance(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT memberId FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    $enabled = function_exists('policy_enabled_for') ? policy_enabled_for('member') : false;
    $state = policy_state($memberId, 'member');
    $fines = [];
    foreach (db_all("SELECT amount, reason, status, issuedAt FROM sanctions WHERE personId = ? AND kind = 'fine' AND status IN ('active','pending') ORDER BY issuedAt DESC", [$memberId]) as $f) {
        $fines[] = [
            'amount'   => (int)$f['amount'],
            'reason'   => (string)$f['reason'],
            'status'   => (string)$f['status'],
            'issuedAt' => (string)$f['issuedAt'],
        ];
    }
    return [
        'ok'             => true,
        'enabled'        => $enabled,
        'state'          => $state['state'],
        'until'          => $state['until'],
        'reason'         => $state['reason'],
        'finesOwed'      => (int)$state['finesOwed'],
        'awaitingReview' => !empty($state['awaitingReview']),
        'blocked'        => !empty($state['blocked']),
        'fines'          => $fines,
    ];
}

function member_update(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    /* What a member may change about themselves: how they present (bio,
     * socials, photo). Their name, school and guardian contacts are the
     * programme's record — checked with the family and changed by the desk
     * through a "Correct my details" request — so a write of any of those is
     * refused, not silently dropped. */
    $allowed = ['bio', 'photoUrl', 'socials'];
    $managed = array_values(array_intersect(['phone', 'parentEmail', 'parentPhone', 'school', 'fullName', 'dob', 'centre', 'track', 'email'], array_keys($p)));
    if ($managed) return ['ok' => false, 'error' => 'managed_by_ngg', 'fields' => $managed];
    $patch = ['updatedAt' => now_iso()];
    foreach ($allowed as $k) {
        if (array_key_exists($k, $p)) {
            $patch[$k] = ($k === 'socials' && is_array($p[$k])) ? json_encode($p[$k], JSON_UNESCAPED_SLASHES) : $p[$k];
        }
    }
    // An inline photo is stored and replaced by its short URL (see admin_members_upsert).
    if (isset($patch['photoUrl']) && is_string($patch['photoUrl']) && preg_match('#^data:#i', trim($patch['photoUrl']))) {
        $patch['photoUrl'] = photo_intake_url($patch['photoUrl']);
        if ($patch['photoUrl'] === '') return ['ok' => false, 'error' => 'bad_photo'];
    }
    db_update('members', $patch, ['id' => $member['id']]);
    // A new photo replaces the old one; it does not sit beside it.
    if (isset($patch['photoUrl']) && function_exists('photo_supersede')) photo_supersede('member', $memberId, (string)($member['photoUrl'] ?? ''), (string)$patch['photoUrl'], $memberId);
    audit('member.update', $memberId, $memberId, ['keys' => array_keys($patch)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Public, privacy-safe cohort leaderboard: top active NGG members by XP,
 *  first name + last initial only (they're minors). Powers the Club page. */
function public_leaderboard(array $p): array {
    $limit = max(3, min(50, (int)($p['limit'] ?? 12)));
    $rows = db_all("SELECT m.memberId, m.fullName, m.centre, COALESCE(s.xpTotal,0) xp, COALESCE(s.level,1) level, COALESCE(s.streak,0) streak, COALESCE(s.currentWeek,1) week
                    FROM members m LEFT JOIN member_stats s ON s.memberId = m.memberId
                    WHERE m.status = 'active' AND m.type = 'NGG'
                    ORDER BY xp DESC, m.fullName ASC LIMIT " . $limit);
    /* Behaviour stars, batched.
     *
     * Stars are the thing mentors actually record every session, and they were
     * nowhere on the board a cohort watches — so the one signal a child can
     * move by turning up and behaving well was invisible, while XP (which
     * accrues from journal activity) was the whole ranking. Shown alongside
     * XP rather than folded into it: they measure different things, and a
     * single blended number would hide which one a child is moving. */
    $starOf = [];
    if ($rows) {
        $ids = array_column($rows, 'memberId');
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $weekAgo = gmdate('Y-m-d', time() - 6 * 86400);
        foreach (db_all("SELECT subjectId, SUM(stars) total, SUM(CASE WHEN date >= ? THEN stars ELSE 0 END) wk
                         FROM member_stars WHERE subjectId IN $in GROUP BY subjectId",
                        array_merge([$weekAgo], $ids)) as $r2) {
            $starOf[(string)$r2['subjectId']] = ['total' => (int)$r2['total'], 'week' => (int)$r2['wk']];
        }
    }

    /* Consent, batched. This board is PUBLIC and every row on it is a child:
     * a Club member's record carries a date of birth, a guardian and a school.
     * The summer board has always withheld a name until a guardian granted
     * site_visibility; this one published every name from the day it shipped,
     * for no better reason than that Club members had no ledger to consult.
     *
     * A child with no recorded decision is NOT named — a missing record means
     * nobody asked, and nobody asked is not yes. They keep their place, their
     * rank and their score under a handle derived from their id, exactly as an
     * unconsented summer student does. */
    $consentOf = $rows ? consent_may_publish_many(array_column($rows, 'memberId')) : [];

    $out = []; $rank = 0;
    foreach ($rows as $r) {
        $rank++;
        $mid = (string)$r['memberId'];
        $mayName = (bool)($consentOf[$mid]['mayName'] ?? false);
        $parts = preg_split('/\s+/', trim((string)$r['fullName'])) ?: [];
        $first = $mayName ? ($parts[0] ?? 'Member') : consent_handle_for($mid);
        $initial = ($mayName && count($parts) > 1) ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
        $st = $starOf[$mid] ?? ['total' => 0, 'week' => 0];
        $out[] = [
            'rank' => $rank, 'memberId' => $mid, 'first' => $first, 'initial' => $initial,
            // Explicit, so nothing downstream has to guess whether `first` is a
            // name or a stand-in — an avatar that prints its initial, say.
            'named' => $mayName,
            'centre' => (string)($r['centre'] ?? ''), 'xp' => (int)$r['xp'], 'level' => (int)$r['level'],
            'streak' => (int)$r['streak'], 'week' => (int)$r['week'],
            'stars' => $st['total'], 'starsThisWeek' => $st['week'],
        ];
    }
    return ['ok' => true, 'leaderboard' => $out, 'total' => count($out)];
}

/** SQL clause (+params) matching broadcast rows targeted to THIS member. A
 *  broadcast with no/`all` audience reaches everyone; a centre/type audience
 *  reaches only matching members — mirroring the emailed audience. */
function notif_broadcast_clause(?array $member): array {
    $centre = (string)($member['centre'] ?? '');
    $type = (string)($member['type'] ?? '');
    return ["(memberId = '*' AND (audience IS NULL OR audience = '' OR audience = 'all' OR audience = ? OR audience = ?))", [$centre, $type]];
}

function member_notifications(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT centre, type FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    [$bc, $bcp] = notif_broadcast_clause($member);
    $rows = db_all("SELECT * FROM notifications WHERE memberId = ? OR $bc ORDER BY createdAt DESC LIMIT 50", array_merge([$memberId], $bcp));
    return ['ok' => true, 'notifications' => array_map('public_notification', $rows)];
}

/**
 * Per-member key→JSON state store. Backs the Anchor Journal's daily systems,
 * weekly self-score and peer-modeling data with real cross-device persistence.
 * Keys are namespaced by the client, e.g. "systems:2026-07-04", "peers",
 * "selfscore:2026-W27", "prefs". Values are arbitrary JSON (size-bounded).
 */
function member_state_get(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $keys = $p['keys'] ?? [];
    if (is_string($keys)) $keys = array_filter(array_map('trim', explode(',', $keys)));
    $out = [];
    if (!empty($keys)) {
        $place = implode(',', array_fill(0, count($keys), '?'));
        $rows = db_all("SELECT stateKey, stateValue FROM member_state WHERE memberId = ? AND stateKey IN ($place)", array_merge([$memberId], array_values($keys)));
    } else {
        $rows = db_all('SELECT stateKey, stateValue FROM member_state WHERE memberId = ?', [$memberId]);
    }
    foreach ($rows as $r) {
        // Second-step secrets are never handed back to a page (mfa.php).
        if (function_exists('mfa_private_key') && mfa_private_key((string)$r['stateKey'])) continue;
        $out[$r['stateKey']] = safe_json($r['stateValue']);
    }
    return ['ok' => true, 'state' => $out];
}

function member_state_set(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $key = trim((string)($p['key'] ?? ''));
    if ($key === '' || strlen($key) > 80) return ['ok' => false, 'error' => 'bad_key'];
    if (function_exists('mfa_private_key') && mfa_private_key($key)) return ['ok' => false, 'error' => 'bad_key'];
    $value = $p['value'] ?? null;
    $json = is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_SLASHES);
    if (strlen((string)$json) > 20000) return ['ok' => false, 'error' => 'too_large'];
    db_upsert('member_state',
        ['memberId' => $memberId, 'stateKey' => $key, 'stateValue' => $json, 'updatedAt' => now_iso()],
        ['memberId', 'stateKey'],
        ['stateValue' => $json, 'updatedAt' => now_iso()]
    );
    return ['ok' => true];
}

/** Member requests an email change → verification link to the NEW address. */
function member_request_email_change(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $new = strtolower(trim((string)($p['email'] ?? '')));
    if (!filter_var($new, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    if ($new === strtolower((string)$m['email'])) return ['ok' => false, 'error' => 'same_email'];
    if (db_row('SELECT id FROM members WHERE lower(email) = ? AND memberId != ? LIMIT 1', [$new, $mid])) return ['ok' => false, 'error' => 'email_taken'];
    $token = rand_hex(20);
    db_update('members', ['pendingEmail' => $new, 'emailChangeToken' => $token, 'emailChangeExpiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + 86400), 'updatedAt' => now_iso()], ['id' => $m['id']]);
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/api/member/confirm-email.php?m=' . rawurlencode($mid) . '&t=' . $token;
    @send_mail($new, 'Confirm your new NGG email', email_template([
        'title' => 'Confirm your new email',
        'intro' => 'Hi ' . esc_html(explode(' ', (string)$m['fullName'])[0] ?: 'there') . ', confirm this address to make it your NGG sign-in email.',
        'bodyHtml' => '<p style="margin:0 0 10px">If you didn\'t request this, ignore this email — nothing changes until you confirm. The link expires in 24 hours.</p>',
        'ctaLabel' => 'Confirm this email →', 'ctaUrl' => $url,
    ]));
    audit('member.email.change_request', $mid, $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'pending' => mask_email($new)];
}

/** Confirm an email change via the signed token (from the new address). */
function member_confirm_email_change(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $token = (string)($p['token'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m || empty($m['emailChangeToken']) || $token === '') return ['ok' => false, 'error' => 'invalid'];
    if (!hash_equals((string)$m['emailChangeToken'], $token)) return ['ok' => false, 'error' => 'invalid'];
    if (strtotime((string)$m['emailChangeExpiresAt']) < time()) return ['ok' => false, 'error' => 'expired'];
    $new = strtolower(trim((string)$m['pendingEmail']));
    if (!filter_var($new, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'invalid'];
    if (db_row('SELECT id FROM members WHERE lower(email) = ? AND memberId != ? LIMIT 1', [$new, $mid])) return ['ok' => false, 'error' => 'email_taken'];
    db_update('members', ['email' => $new, 'pendingEmail' => '', 'emailChangeToken' => '', 'emailChangeExpiresAt' => '', 'updatedAt' => now_iso()], ['id' => $m['id']]);
    audit('member.email.changed', $mid, $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'email' => $new];
}

/** GDPR self-service export: everything we hold about this member, as JSON. */
function member_export(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT memberId, fullName, email, phone, type, status, role, centre, track, cohort, school, bio, socials, parentName, parentEmail, parentPhone, joinDate, createdAt FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'export' => [
        'profile' => $m,
        'stats' => db_row('SELECT * FROM member_stats WHERE memberId = ?', [$mid]) ?: null,
        'progress' => db_all('SELECT missionId, sessionId, status, submittedAt, verifiedAt FROM member_progress WHERE memberId = ?', [$mid]),
        'journal' => db_all('SELECT mood, body, isPrivate, createdAt FROM journal WHERE memberId = ?', [$mid]),
        'assignments' => db_all('SELECT assignmentId, answerText, status, grade, feedback, submittedAt FROM assignment_submissions WHERE memberId = ?', [$mid]),
        'notifications' => db_all('SELECT title, body, kind, createdAt FROM notifications WHERE memberId = ?', [$mid]),
        'devices' => db_all("SELECT ip, userAgent, createdAt, lastSeenAt FROM device_sessions WHERE memberId = ?", [$mid]),
        /* What we charged them. This was missing, which meant a member who asked
           for their data got their journal, their devices and their reflections —
           and nothing about the money. The one part of the record with a
           financial consequence is the part it must not omit.
           `createdBy`/`voidedBy` are left out: which member of staff posted a row
           is our operational detail, and it is another person's identity. */
        'ledger' => db_all("SELECT entryId, kind, direction, amount, periodKey, note, method, reference,
                                   createdAt, voidedAt, voidReason
                            FROM member_ledger WHERE memberId = ? ORDER BY id", [$mid]),
        'exportedAt' => now_iso(),
    ]];
}

/** Erase a member: scrub PII, anonymise the row, revoke sessions. Kept (not
 *  hard-deleted) for referential integrity of aggregate records. */
function member_erase(string $mid, string $by, string $ip = ''): array {
    $m = db_row('SELECT id, role FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (strtolower((string)$m['role']) === 'super_admin') return ['ok' => false, 'error' => 'cannot_delete_super_admin'];
    db_update('members', [
        'fullName' => 'Deleted member', 'email' => '', 'phone' => '', 'photoUrl' => '', 'bio' => '',
        'socials' => '', 'parentName' => '', 'parentEmail' => '', 'parentPhone' => '', 'school' => '',
        'notes' => '', 'passwordHash' => '', 'totpSecret' => '', 'totpBackup' => '',
        'pendingEmail' => '', 'emailChangeToken' => '', 'status' => 'deleted', 'updatedAt' => now_iso(),
    ], ['id' => $m['id']]);
    db_update('device_sessions', ['revokedAt' => now_iso()], ['memberId' => $mid]);
    db_exec('DELETE FROM journal WHERE memberId = ?', [$mid]);
    /* ── The ledger, said explicitly ──────────────────────────────────────
     * A financial record is KEPT: amounts, kinds and dates stay, because what a
     * programme charged and received is its own account of itself and deleting
     * it on request would make the books unauditable. What goes is the free
     * text, which is where a name ends up — "Ada's mother paid cash", a
     * reference typed with a family's details in it. So the row survives as a
     * figure and stops being a description of a person.
     *
     * Stated here rather than left to inference: for a money table, silence
     * about erasure is itself a decision, and this one should be readable. */
    try {
        db_exec("UPDATE member_ledger SET note = '', reference = '', voidReason = '' WHERE memberId = ?", [$mid]);
    } catch (Throwable $e) {
        /* An erasure must never fail because of the ledger — the member asked to
           be forgotten and the rest of it has already happened. Journalled so a
           scrub that did not run is visible rather than assumed. */
        if (function_exists('ops_record')) ops_record('warn', 'member.erase', 'ledger scrub failed', $e->getMessage());
    }
    audit('member.erase', $by ?: null, $mid, [], $ip);
    return ['ok' => true];
}

/**
 * A member cannot end their own membership.
 *
 * This called member_erase() directly, and the member dashboard had a "Delete
 * my account" button wired to it. So a child of ten to seventeen could scrub
 * their profile, journal, missions and XP, revoke every session and blank
 * their ledger's notes — irreversibly, in two confirmations, with nothing
 * recoverable by anybody, including the people answerable for them.
 *
 * Whether a membership continues is settled by the MoU between NGG and the
 * family. That is a document and a conversation, so there is no button and no
 * request queue standing in for one — a queue is the same decision moved one
 * screen along. The refusal names who to speak to instead of going quiet.
 *
 * What a member keeps is member_export(): a copy of everything held about
 * them, one press. That half was never the problem. And admin_member_delete()
 * still erases, from the desk, restricted to a super admin, for the
 * obligations the programme itself carries.
 */
function member_delete_account(array $p): array {
    return ['ok' => false, 'error' => 'self_delete_disabled',
            'detail' => 'Your membership is set by the agreement between NGG and your parent or guardian — speak to your centre lead or your mentor.'];
}

function admin_member_delete(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    return member_erase((string)($p['memberId'] ?? ''), (string)($p['requesterId'] ?? ''), (string)($p['ip'] ?? ''));
}

function member_notification_read(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $notifId = (string)($p['notifId'] ?? '');
    $row = db_row("SELECT * FROM notifications WHERE notifId = ? AND (memberId = ? OR memberId = '*') LIMIT 1", [$notifId, $memberId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_update('notifications', ['readAt' => now_iso()], ['id' => $row['id']]);
    return ['ok' => true];
}
