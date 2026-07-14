<?php
declare(strict_types=1);

/**
 * Admin domain, part 2 — the "complete management" surface:
 * analytics overview, 360° member detail, mentor assignment, applications
 * review + convert, newsletter, and site settings. Every handler re-checks
 * admin role via admin_gate() (defined in admin.php).
 */

// ── Analytics overview ──────────────────────────────────────────────────────
function admin_overview(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $since30 = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);

    $byCentre = db_all("SELECT centre, COUNT(*) c FROM members WHERE status='active' AND centre != '' GROUP BY centre");
    $byTrack  = db_all("SELECT track, COUNT(*) c FROM members WHERE status='active' AND track != '' AND track IS NOT NULL GROUP BY track ORDER BY c DESC");

    return ['ok' => true, 'overview' => [
        'members' => [
            'active'   => $one("SELECT COUNT(*) c FROM members WHERE status='active'"),
            'ngg'      => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='NGG'"),
            'summer'   => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='Summer'"),
            'graduates'=> $one("SELECT COUNT(*) c FROM members WHERE status IN ('graduated-ngg','graduated-vanguard')"),
            'suspended'=> $one("SELECT COUNT(*) c FROM members WHERE status='suspended'"),
            'new30'    => $one("SELECT COUNT(*) c FROM members WHERE createdAt >= ?", [$since30]),
        ],
        'mentors' => ['active' => $one("SELECT COUNT(*) c FROM mentors WHERE status='active'"), 'total' => $one("SELECT COUNT(*) c FROM mentors")],
        'applications' => [
            'new'     => $one("SELECT COUNT(*) c FROM applications WHERE status='new'"),
            'total'   => $one("SELECT COUNT(*) c FROM applications"),
        ],
        'volunteers' => [
            'pending' => $one("SELECT COUNT(*) c FROM applications WHERE kind='volunteer' AND status IN ('new','reviewing')"),
            'active'  => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active'"),
            'unscreened' => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active' AND safeguarding != 'cleared'"),
        ],
        'anchor' => [
            'journals'  => $one("SELECT COUNT(*) c FROM journal"),
            'verified'  => $one("SELECT COUNT(*) c FROM member_progress WHERE status='verified'"),
            'submitted' => $one("SELECT COUNT(*) c FROM member_progress WHERE status='submitted'"),
        ],
        'assignments' => [
            'published' => $one("SELECT COUNT(*) c FROM assignments WHERE status='published'"),
            'submitted' => $one("SELECT COUNT(*) c FROM assignment_submissions"),
            'toGrade'   => $one("SELECT COUNT(*) c FROM assignment_submissions WHERE status='submitted'"),
        ],
        'events'     => ['upcoming' => $one("SELECT COUNT(*) c FROM events WHERE status='published' AND startAt >= ?", [gmdate('Y-m-d\TH:i:s\Z')])],
        'newsletter' => ['subscribers' => $one("SELECT COUNT(*) c FROM newsletter WHERE status='subscribed'")],
        'messages'   => ['unread' => $one("SELECT COUNT(*) c FROM contact_messages WHERE status='new'"), 'total' => $one("SELECT COUNT(*) c FROM contact_messages")],
        'byCentre'   => $byCentre,
        'byTrack'    => $byTrack,
        'recent'     => db_all("SELECT at, actorId, event, subject FROM audit_log ORDER BY id DESC LIMIT 12"),
    ]];
}

// ── 360° member detail ──────────────────────────────────────────────────────
function admin_member_detail(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    unset($m['totpSecret']);
    $m['socials'] = safe_json($m['socials'] ?? null);

    $stats = db_row('SELECT * FROM member_stats WHERE memberId = ? LIMIT 1', [$id]) ?: [];
    $journal = array_map(fn($r) => ['week' => (int)$r['week'], 'mood' => $r['mood'], 'body' => $r['body'], 'createdAt' => $r['createdAt']],
        db_all('SELECT week, mood, body, createdAt FROM journal WHERE memberId = ? ORDER BY createdAt DESC LIMIT 20', [$id]));

    $prog = db_row("SELECT COUNT(*) total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) submitted FROM member_progress WHERE memberId = ?", [$id]) ?: [];

    $subs = db_all("SELECT s.assignmentId, s.status, s.grade, s.submittedAt, a.title, a.points FROM assignment_submissions s LEFT JOIN assignments a ON a.assignmentId = s.assignmentId WHERE s.memberId = ? ORDER BY s.submittedAt DESC LIMIT 25", [$id]);

    $mentorLink = db_row("SELECT ma.mentorId, ma.sessionId, m.fullName FROM mentor_assignments ma LEFT JOIN mentors m ON m.mentorId = ma.mentorId WHERE ma.memberId = ? AND ma.status='active' ORDER BY ma.startedAt DESC LIMIT 1", [$id]);

    $state = [];
    foreach (db_all('SELECT stateKey, stateValue FROM member_state WHERE memberId = ?', [$id]) as $r) $state[$r['stateKey']] = safe_json($r['stateValue']);

    return ['ok' => true, 'detail' => [
        'member' => $m,
        'stats' => ['xp' => (int)($stats['xpTotal'] ?? 0), 'level' => (int)($stats['level'] ?? 1), 'streak' => (int)($stats['streak'] ?? 0), 'badges' => safe_json($stats['badges'] ?? null) ?: []],
        'journal' => $journal,
        'progress' => ['total' => (int)($prog['total'] ?? 0), 'verified' => (int)($prog['verified'] ?? 0), 'submitted' => (int)($prog['submitted'] ?? 0)],
        'submissions' => array_map(fn($s) => ['assignmentId' => $s['assignmentId'], 'title' => $s['title'] ?: $s['assignmentId'], 'points' => (int)($s['points'] ?? 0), 'status' => $s['status'], 'grade' => $s['grade'] === null ? null : (int)$s['grade'], 'submittedAt' => $s['submittedAt']], $subs),
        'mentor' => $mentorLink ? ['mentorId' => $mentorLink['mentorId'], 'fullName' => $mentorLink['fullName'], 'sessionId' => $mentorLink['sessionId']] : null,
        'state' => $state,
    ]];
}

// ── Mentor assignment ───────────────────────────────────────────────────────
function admin_assign_mentor(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $memberId = (string)($p['memberId'] ?? '');
    $mentorId = (string)($p['mentorId'] ?? '');
    $sc = session_current();
    $sessionId = (string)($p['sessionId'] ?? ($sc['current']['sessionId'] ?? ''));
    if (!$memberId) return ['ok' => false, 'error' => 'no_member'];
    // End any current active links for this member+session.
    db_exec("UPDATE mentor_assignments SET status='ended', endedAt=? WHERE memberId=? AND sessionId=? AND status='active'", [now_iso(), $memberId, $sessionId]);
    if ($mentorId) {
        $mentor = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]);
        $track = $mentor && $mentor['tracks'] ? explode(',', (string)$mentor['tracks'])[0] : '';
        db_insert('mentor_assignments', ['memberId' => $memberId, 'mentorId' => $mentorId, 'track' => trim($track), 'sessionId' => $sessionId, 'status' => 'active', 'startedAt' => now_iso(), 'endedAt' => '']);
        push_notification($memberId, ['kind' => 'mentor', 'title' => 'You have a mentor', 'body' => ($mentor['fullName'] ?? 'A mentor') . ' is now guiding your Anchor journey.', 'linkPage' => 'dashboard']);
    }
    audit('admin.mentor.assign', $g['requester']['memberId'], $memberId, ['mentorId' => $mentorId, 'sessionId' => $sessionId], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Applications review ─────────────────────────────────────────────────────
function admin_applications_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['kind'])) { $where[] = 'kind = ?'; $params[] = $p['kind']; }
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    $sql = 'SELECT * FROM applications' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    return ['ok' => true, 'applications' => db_all($sql, $params)];
}

function admin_applications_set_status(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'reviewing', 'accepted', 'rejected', 'waitlist'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('applications', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.application.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_application_convert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if ($a['kind'] !== 'teen') return ['ok' => false, 'error' => 'only_teen_apps'];   // mentor apps → mentors, handled separately
    // Don't double-provision.
    $existing = db_row('SELECT memberId FROM members WHERE lower(email) = ? LIMIT 1', [strtolower((string)$a['email'])]);
    if ($existing) { db_update('applications', ['status' => 'accepted'], ['id' => $id]); return ['ok' => true, 'memberId' => $existing['memberId'], 'existed' => true]; }
    // Summer applicants become Summer Students; Anchor/NGG applicants become
    // full NGG members. Falls back to Summer for legacy rows with no program.
    $type = ((string)($a['program'] ?? '') === 'anchor') ? 'NGG' : 'Summer';
    $newId = new_id($type === 'Summer' ? 'SUM' : 'NGG');
    db_insert('members', ['memberId' => $newId, 'fullName' => $a['name'], 'email' => $a['email'], 'type' => $type, 'status' => 'active', 'role' => 'member', 'centre' => $a['centre'] ?: 'Egbeda', 'track' => $a['track'] ?: '', 'photoUrl' => (string)($a['photoUrl'] ?? ''), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);
    // Welcome the new member so conversion is a visible action, not a silent DB write.
    @send_mail((string)$a['email'], 'Welcome to Next Generation Genius',
        email_template([
            'title' => 'You\'re in, ' . explode(' ', (string)$a['name'])[0] . '.',
            'intro' => $type === 'Summer' ? 'Your place in Summer Students is confirmed.' : 'Your place in the NGG cohort is confirmed.',
            'bodyHtml' => 'We\'ll be in touch shortly with your start details. Your member ID is <b>' . esc_html($newId) . '</b>.',
            'ctaLabel' => 'Open the member portal', 'ctaUrl' => ($GLOBALS['CONFIG']['app_origin'] ?? '') . '/#dashboard',
            'footNote' => 'Welcome to the movement.',
        ]));
    audit('admin.application.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id, 'type' => $type], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId];
}

// ── Newsletter ──────────────────────────────────────────────────────────────
function admin_newsletter_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT email, source, status, createdAt FROM newsletter ORDER BY id DESC LIMIT 5000');
    $active = count(array_filter($rows, fn($r) => (string)$r['status'] === 'subscribed'));
    return ['ok' => true, 'total' => count($rows), 'active' => $active, 'subscribers' => $rows];
}

/** A signed, per-email unsubscribe token (no DB column needed). */
function newsletter_unsub_token(string $email): string {
    $secret = (string)($GLOBALS['CONFIG']['cookie_secret'] ?? 'ngg');
    return substr(hash_hmac('sha256', 'unsub:' . strtolower(trim($email)), $secret), 0, 32);
}

/** Compose + send a newsletter to all current subscribers (bounded), each with
 *  a one-click unsubscribe link. Gated on 'inbox'. */
function admin_newsletter_send(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $subject = trim((string)($p['subject'] ?? ''));
    $body = trim((string)($p['body'] ?? ''));
    if (strlen($subject) < 3) return ['ok' => false, 'error' => 'subject_too_short'];
    if (strlen($body) < 10) return ['ok' => false, 'error' => 'body_too_short'];
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $subs = db_all("SELECT email FROM newsletter WHERE status = 'subscribed' LIMIT 2000");
    $sent = 0; $skipped = 0;
    foreach ($subs as $s) {
        $to = trim((string)$s['email']);
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || $sent >= 2000) { $skipped++; continue; }
        $unsub = $origin . '/api/public/unsubscribe.php?e=' . rawurlencode($to) . '&t=' . newsletter_unsub_token($to);
        $html = email_template([
            'title' => $subject,
            'bodyHtml' => '<div style="font-size:15px;line-height:1.65">' . nl2br(esc_html($body)) . '</div>',
            'footNote' => 'You are receiving this because you subscribed to Next Generation Genius updates.',
        ]) . '<div style="text-align:center;margin:-18px 0 24px;font-family:Arial,sans-serif"><a href="' . esc_html($unsub) . '" style="color:#8A93A6;font-size:12px">Unsubscribe</a></div>';
        if (send_mail($to, $subject, $html)) $sent++; else $skipped++;
    }
    audit('newsletter.send', $g['requester']['memberId'], '', ['sent' => $sent, 'skipped' => $skipped], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent, 'skipped' => $skipped, 'total' => count($subs)];
}

// ── Contact messages ─────────────────────────────────────────────────────────
function admin_contact_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    if (!empty($p['purpose'])) { $where[] = 'purpose = ?'; $params[] = $p['purpose']; }
    $sql = 'SELECT * FROM contact_messages' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $unread = (int)(db_row("SELECT COUNT(*) c FROM contact_messages WHERE status='new'")['c'] ?? 0);
    return ['ok' => true, 'messages' => db_all($sql, $params), 'unread' => $unread];
}

function admin_contact_status(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'read', 'replied', 'archived'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('contact_messages', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.contact.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Site settings ───────────────────────────────────────────────────────────
function admin_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => [
        'applications_open'         => (setting_raw('applications_open') ?? '1') !== '0',
        'mentor_applications_open'  => (setting_raw('mentor_applications_open') ?? '1') !== '0',
        'volunteer_applications_open' => (setting_raw('volunteer_applications_open') ?? '1') !== '0',
        'volunteer_sms_notify'      => (setting_raw('volunteer_sms_notify') ?? '1') !== '0',
        'checkin_state_emails'      => (setting_raw('checkin_state_emails') ?? '1') !== '0',
        'volunteer_session_hours'   => (int)(setting_raw('volunteer_session_hours') ?: 4),
        'featured_session_id'       => setting_raw('featured_session_id') ?? '',
        'geofence_enabled'          => setting_raw('geofence_enabled') === '1',
        'photo_gate_issuance'       => setting_raw('photo_gate_issuance') === '1',
        'site_content'              => site_content(),
        'idcard'                    => idcard_program(),
    ]];
}

function admin_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    foreach (['applications_open', 'mentor_applications_open', 'volunteer_applications_open', 'volunteer_sms_notify', 'checkin_state_emails', 'geofence_enabled', 'photo_gate_issuance'] as $k) {
        if (array_key_exists($k, $data)) setting_set($k, !empty($data[$k]) ? '1' : '0', $g['requester']['memberId']);
    }
    if (array_key_exists('volunteer_session_hours', $data)) setting_set('volunteer_session_hours', (string)max(1, min(12, (int)$data['volunteer_session_hours'])), $g['requester']['memberId']);
    if (array_key_exists('featured_session_id', $data)) setting_set('featured_session_id', (string)$data['featured_session_id'], $g['requester']['memberId']);
    // Homepage / site copy — validated + length-capped, stored as one JSON blob.
    if (array_key_exists('site_content', $data) && is_array($data['site_content'])) {
        setting_set('site_content', site_content_clean($data['site_content']), $g['requester']['memberId']);
    }
    // ID-card branding block (program/year/motto/website/phone/logos).
    if (array_key_exists('idcard', $data) && is_array($data['idcard'])) {
        idcard_program_save($data['idcard'], $g['requester']['memberId']);
    }
    audit('admin.settings.set', $g['requester']['memberId'], '', ['keys' => array_keys((array)$data)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// Diagnose email delivery: send a real message and report exactly what happened
// (mode = smtp|php_mail, delivered, and the captured error) so "emails don't
// deliver" is debuggable instead of silent.
function admin_mail_test(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $to = trim((string)($p['to'] ?? ''));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) $to = (string)($g['requester']['email'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'no_valid_recipient'];
    $mode = !empty($GLOBALS['CONFIG']['mail']['smtp']['host'] ?? '') ? 'smtp' : 'php_mail';
    $GLOBALS['__mail_last_error'] = '';
    $delivered = send_mail($to, 'NGG email delivery test', email_template([
        'title' => 'Delivery test',
        'intro' => 'If you can read this, outbound email is working.',
        'bodyHtml' => '<p style="margin:0">Sent from the Control Room email diagnostic (' . esc_html($mode) . ' mode).</p>',
        'footNote' => 'Automated delivery test — no action needed.',
    ]));
    audit('admin.mail.test', $g['requester']['memberId'], $to, ['mode' => $mode, 'delivered' => $delivered], (string)($p['ip'] ?? ''));

    // Surface the resolved sender config so SPF/DKIM alignment problems (the
    // usual "it sends but lands in spam / gets rejected" cause) are visible.
    $from = mail_from();
    $smtp = (array)($GLOBALS['CONFIG']['mail']['smtp'] ?? []);
    $fromDomain = function_exists('mail_domain_of') ? mail_domain_of((string)$from['email']) : '';
    $hints = [];
    if ($mode === 'php_mail') {
        $hints[] = 'No SMTP configured — using PHP mail(). Set mail.smtp.host/user/pass in api/config.php for reliable delivery.';
    }
    $isGmail = $mode === 'smtp' && preg_match('/gmail|googlemail|google\.com|smtp\.google/i', (string)($smtp['host'] ?? ''));
    $authUser = strtolower(trim((string)($smtp['user'] ?? '')));
    $fromEmail = strtolower((string)$from['email']);
    if ($isGmail) {
        // Gmail-specific: it rewrites the From to the authenticated account
        // unless it's a verified alias, and requires an App Password.
        if ($authUser !== '' && $fromEmail !== $authUser) {
            $hints[] = "Gmail rewrites the From to the signed-in account unless it's a verified alias. Recipients will see {$authUser}, not {$fromEmail}. Either set mail.from_email to {$authUser}, or add {$fromEmail} under Gmail → Settings → Accounts → \"Send mail as\" (Workspace) first.";
        }
        $hints[] = "Gmail SMTP needs an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password. Use smtp.gmail.com with port 587/secure 'tls' or 465/'ssl'. Consumer Gmail caps at ~500 messages/day.";
    } else {
        // Envelope/From must be a domain you're authorized to send for, or SPF fails.
        if ($fromDomain && $fromDomain !== 'localhost' && !preg_match('/afrovanguard\./i', $fromDomain)) {
            $hints[] = "From domain is {$fromDomain}. Make sure its DNS has SPF (and ideally DKIM/DMARC) authorizing this relay, or mail will be spam-filtered.";
        }
        if ($mode === 'smtp' && $authUser !== '' && $fromDomain && stripos($authUser, (string)$fromDomain) === false) {
            $hints[] = "SMTP auth user doesn't match the From domain ({$fromDomain}) — many relays reject or spam-flag a mismatched From. Align mail.from_email with the authenticated mailbox.";
        }
    }
    // ok:true = the diagnostic ran; `delivered` says whether the send succeeded.
    return [
        'ok' => true, 'delivered' => $delivered, 'to' => $to, 'mode' => $mode,
        'error' => (string)($GLOBALS['__mail_last_error'] ?? ''),
        'from' => (string)$from['email'], 'fromName' => (string)$from['name'],
        'replyTo' => (string)$from['replyTo'], 'fromDomain' => $fromDomain,
        'smtp' => $mode === 'smtp' ? [
            'host' => (string)($smtp['host'] ?? ''), 'port' => (int)($smtp['port'] ?? 587),
            'secure' => (string)($smtp['secure'] ?? 'tls'), 'authUser' => (string)($smtp['user'] ?? ''),
        ] : null,
        'hints' => $hints,
    ];
}

/** Editable site copy, merged over defaults so the homepage never breaks. */
function site_content_defaults(): array {
    return [
        'heroEyebrowLive'  => 'Live now',
        'heroTitle1'       => "Africa's next geniuses",
        'heroTitle2'       => 'are',
        'heroEmphasis'     => 'not waiting',
        'heroSubhead'      => 'A twelve-week growth journey for teenagers, 10–17. From summer student to vanguard leader — by mission, mentorship and the discipline of public work.',
        'heroCtaPrimary'   => 'Join the Summer Program',
        'heroCtaSecondary' => 'Explore Anchor 12',
        'movementTagline'  => 'Not a school. Not a club. The structured runway from teenage potential to African leadership — built mission by mission, week by week.',
    ];
}
function site_content(): array {
    $stored = setting_get('site_content');
    return array_merge(site_content_defaults(), is_array($stored) ? $stored : []);
}
function site_content_clean(array $in): array {
    $out = [];
    foreach (site_content_defaults() as $k => $def) {
        if (!array_key_exists($k, $in)) continue;
        $v = trim((string)$in[$k]);
        if ($v !== '') $out[$k] = substr($v, 0, $k === 'heroSubhead' || $k === 'movementTagline' ? 400 : 120);
    }
    return $out;
}

function public_site_content(array $p = []): array {
    // Homepage promo banner — served only while active (unexpired).
    $promo = setting_get('homepage_promo');
    $activePromo = null;
    if (is_array($promo) && !empty($promo['text'])) {
        $exp = (string)($promo['expires'] ?? '');
        if ($exp === '' || strtotime($exp) >= time()) {
            $activePromo = ['text' => (string)$promo['text'], 'ctaLabel' => (string)($promo['ctaLabel'] ?? ''), 'ctaUrl' => (string)($promo['ctaUrl'] ?? ''), 'expires' => $exp];
        }
    }
    return ['ok' => true, 'site' => site_content(), 'promo' => $activePromo];
}
