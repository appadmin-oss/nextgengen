<?php
declare(strict_types=1);

/** Events, posts, sessions, and public reads. */

function event_list(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = $memberId ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]) : null;

    if ($member) {
        $rows = db_all("SELECT * FROM events WHERE status='published' AND (centre IN ('Both','Online') OR centre = ?) ORDER BY startAt", [$member['centre']]);
    } else {
        $rows = db_all("SELECT * FROM events WHERE status='published' AND isPublic = 1 ORDER BY startAt");
    }

    $rsvpBy = [];
    if ($memberId) {
        foreach (db_all('SELECT eventId, status FROM event_rsvps WHERE memberId = ?', [$memberId]) as $r) {
            $rsvpBy[$r['eventId']] = $r['status'];
        }
    }
    $now = now_iso();
    $events = array_map(function ($e) use ($rsvpBy, $now) {
        $out = public_event($e);
        $out['myRsvp'] = $rsvpBy[$e['eventId']] ?? null;
        $out['isPast'] = ((string)($e['endAt'] ?: $e['startAt']) < $now);
        return $out;
    }, $rows);
    return ['ok' => true, 'events' => $events];
}

function event_rsvp(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $eventId = (string)($p['eventId'] ?? '');
    $status = (string)($p['status'] ?? 'going');
    if (!in_array($status, ['going', 'maybe', 'cancelled'], true)) return ['ok' => false, 'error' => 'bad_status'];

    $evt = db_row('SELECT * FROM events WHERE eventId = ? LIMIT 1', [$eventId]);
    if (!$evt) return ['ok' => false, 'error' => 'event_not_found'];

    $existing = db_row('SELECT * FROM event_rsvps WHERE eventId = ? AND memberId = ? LIMIT 1', [$eventId, $memberId]);
    if ($existing) {
        db_update('event_rsvps', ['status' => $status, 'rsvpAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('event_rsvps', ['eventId' => $eventId, 'memberId' => $memberId, 'status' => $status, 'rsvpAt' => now_iso(), 'attendedAt' => '']);
    }
    push_notification($memberId, ['kind' => 'event', 'title' => 'RSVP: ' . $evt['title'], 'body' => $status === 'going' ? "You're going. See you there." : 'RSVP updated.', 'linkPage' => 'events']);
    audit('event.rsvp', $memberId, $eventId, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $status];
}

function public_events(array $p): array {
    $rows = db_all("SELECT * FROM events WHERE status='published' AND isPublic = 1 AND (endAt >= ? OR (endAt = '' AND startAt >= ?)) ORDER BY startAt LIMIT 20", [now_iso(), now_iso()]);
    return ['ok' => true, 'events' => array_map('public_event', $rows)];
}

function post_list(array $p): array {
    flip_scheduled_posts();
    $kind = (string)($p['kind'] ?? '');
    $tag = strtolower((string)($p['tag'] ?? ''));
    $rows = db_all("SELECT * FROM posts WHERE status='published' ORDER BY COALESCE(NULLIF(publishAt,''), createdAt) DESC");
    $out = [];
    foreach ($rows as $r) {
        if ($kind !== '' && $r['kind'] !== $kind) continue;
        if ($tag !== '' && strpos(strtolower((string)$r['tags']), $tag) === false) continue;
        $out[] = public_post($r);
    }
    return ['ok' => true, 'posts' => $out];
}

function post_get(array $p): array {
    flip_scheduled_posts();
    $slug = (string)($p['slug'] ?? '');
    $row = db_row("SELECT * FROM posts WHERE slug = ? AND status='published' LIMIT 1", [$slug]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'post' => public_post($row, true)];
}

function public_posts(array $p): array { return post_list($p); }

function op_session_current(array $p): array {
    $sc = session_current();
    return ['ok' => true, 'current' => $sc['current'], 'next' => $sc['next'], 'all' => $sc['all']];
}

function session_list(array $p): array {
    $year = (int)($p['year'] ?? gmdate('Y'));
    ensure_year($year);
    $rows = db_all('SELECT * FROM sessions WHERE year = ? ORDER BY startDate', [$year]);
    return ['ok' => true, 'sessions' => array_map('public_session', $rows)];
}

function session_ensure_year(array $p): array {
    $created = ensure_year((int)($p['year'] ?? gmdate('Y')));
    return ['ok' => true, 'created' => $created];
}

function op_public_session(array $p): array {
    $sc = session_current();
    return ['ok' => true, 'current' => $sc['current'], 'next' => $sc['next']];
}

function public_anchor_content(array $p): array {
    return ['ok' => true, 'content' => anchor_content()];
}

function public_stats(array $p): array {
    $active = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status='active'")['c'] ?? 0);
    $summer = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status='active' AND type='Summer'")['c'] ?? 0);
    $ngg = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status='active' AND type='NGG'")['c'] ?? 0);
    $graduates = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status IN ('graduated-ngg','graduated-vanguard')")['c'] ?? 0);
    $mentors = (int)(db_row("SELECT COUNT(*) c FROM mentors WHERE status='active'")['c'] ?? 0);
    $verified = (int)(db_row("SELECT COUNT(*) c FROM member_progress WHERE status='verified'")['c'] ?? 0);
    $submitted = (int)(db_row("SELECT COUNT(*) c FROM member_progress WHERE status IN ('submitted','verified','rejected')")['c'] ?? 0);
    $centres = (int)(db_row("SELECT COUNT(DISTINCT centre) c FROM members WHERE status='active' AND centre != '' AND centre IS NOT NULL")['c'] ?? 0);

    return ['ok' => true, 'stats' => [
        'activeMembers' => $active, 'summer' => $summer, 'ngg' => $ngg, 'graduates' => $graduates,
        'mentors' => $mentors, 'missionsVerified' => $verified, 'missionsSubmitted' => $submitted,
        'completionRate' => $submitted > 0 ? (int)round($verified / $submitted * 100) : 0,
        'centres' => $centres,
    ]];
}

function public_newsletter(array $p): array {
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($email) > 200) return ['ok' => false, 'error' => 'email_too_long'];

    $existing = db_row('SELECT * FROM newsletter WHERE lower(email) = ? LIMIT 1', [$email]);
    if ($existing) {
        db_update('newsletter', ['status' => 'subscribed', 'updatedAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('newsletter', ['email' => $email, 'source' => (string)($p['source'] ?? 'site'), 'status' => 'subscribed', 'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'ip' => (string)($p['ip'] ?? '')]);
    }
    audit('newsletter.subscribe', null, $email, ['source' => $p['source'] ?? 'site'], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Contact / enquiry form. Stores the message and notifies the admissions inbox. */
function public_contact(array $p): array {
    // Honeypot — a hidden field real users never fill. Pretend success.
    if (trim((string)($p['website'] ?? '')) !== '') return ['ok' => true];

    $name = trim((string)($p['name'] ?? ''));
    if (strlen($name) < 2 || strlen($name) > 120) return ['ok' => false, 'error' => 'bad_name'];
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($email) > 200) return ['ok' => false, 'error' => 'email_too_long'];
    $message = trim((string)($p['message'] ?? ''));
    if (strlen($message) < 10) return ['ok' => false, 'error' => 'message_too_short'];
    if (strlen($message) > 4000) $message = substr($message, 0, 4000);

    $purposes = ['general', 'apply', 'partner', 'mentor', 'media', 'support'];
    $purpose = in_array((string)($p['purpose'] ?? ''), $purposes, true) ? (string)$p['purpose'] : 'general';
    $phone = substr(trim((string)($p['phone'] ?? '')), 0, 40);
    $subject = substr(trim((string)($p['subject'] ?? '')), 0, 200);
    $ref = 'MSG-' . strtoupper(bin2hex(random_bytes(4)));

    db_insert('contact_messages', [
        'ref' => $ref, 'purpose' => $purpose, 'name' => $name, 'email' => $email, 'phone' => $phone,
        'subject' => $subject, 'message' => $message, 'status' => 'new', 'createdAt' => now_iso(), 'ip' => (string)($p['ip'] ?? ''),
    ]);

    $adminEmail = ($GLOBALS['CONFIG']['admin_email'] ?? '') ?: ($GLOBALS['CONFIG']['mail']['reply_to'] ?? '');
    if ($adminEmail) {
        @send_mail((string)$adminEmail, '[Contact · ' . $purpose . '] ' . ($subject ?: $name),
            email_template([
                'title' => 'New message',
                'intro' => $name . ' sent a message via the contact form.',
                'bodyHtml' => '<b>From:</b> ' . esc_html($name) . ' &lt;' . esc_html($email) . '&gt;'
                    . ($phone ? '<br><b>Phone:</b> ' . esc_html($phone) : '')
                    . '<br><b>Topic:</b> ' . esc_html($purpose)
                    . ($subject ? '<br><b>Subject:</b> ' . esc_html($subject) : '')
                    . '<br><br>' . nl2br(esc_html($message)),
                'footNote' => 'Reference ' . $ref . ' — reply from the admin Messages tab.',
            ]));
    }
    // Auto-acknowledge the sender.
    @send_mail($email, 'We got your message — Next Generation Genius',
        email_template([
            'title' => 'Message received',
            'intro' => 'Thanks for reaching out, ' . explode(' ', $name)[0] . '.',
            'bodyHtml' => 'A member of our team will reply within 2 working days. Your reference is <b>' . esc_html($ref) . '</b>.',
            'footNote' => 'You received this because you contacted Next Generation Genius.',
        ]));

    audit('contact.received', null, $email, ['ref' => $ref, 'purpose' => $purpose], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ref' => $ref];
}

function public_apply(array $p): array {
    $kind = (string)($p['kind'] ?? 'teen');
    if (!in_array($kind, ['teen', 'mentor', 'volunteer'], true)) return ['ok' => false, 'error' => 'bad_kind'];
    // Respect the admin toggles (default open).
    $openKey = $kind === 'teen' ? 'applications_open' : ($kind === 'mentor' ? 'mentor_applications_open' : 'volunteer_applications_open');
    if (setting_raw($openKey) === '0') return ['ok' => false, 'error' => 'applications_closed'];
    $name = trim((string)($p['name'] ?? ''));
    if (strlen($name) < 2 || strlen($name) > 120) return ['ok' => false, 'error' => 'bad_name'];
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($email) > 200) return ['ok' => false, 'error' => 'email_too_long'];
    $why = trim((string)($p['why'] ?? ''));
    if (strlen($why) > 2000) return ['ok' => false, 'error' => 'why_too_long'];

    $age = 0; $track = ''; $centre = ''; $role = ''; $program = ''; $phone = ''; $courses = [];
    // A short URL to a headshot uploaded (unsigned) to Cloudinary. Optional —
    // only trusted if it points at the configured Cloudinary CDN host.
    $photoUrl = trim((string)($p['photoUrl'] ?? ''));
    if ($photoUrl !== '' && !preg_match('#^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/#', $photoUrl)) $photoUrl = '';
    if (strlen($photoUrl) > 512) $photoUrl = '';
    if ($kind === 'teen') {
        $age = (int)($p['age'] ?? 0);
        if ($age < 10 || $age > 17) return ['ok' => false, 'error' => 'bad_age'];
        $track = substr(trim((string)($p['track'] ?? '')), 0, 60);
        $centre = substr(trim((string)($p['centre'] ?? '')), 0, 60);
        // Which program the teen is applying to. 'summer' = the 6-week Summer
        // Students on-ramp; 'anchor' = the flagship 12-week NGG. Drives the
        // member type created on conversion.
        $program = in_array((string)($p['program'] ?? ''), ['summer', 'anchor'], true) ? (string)$p['program'] : 'anchor';
    } elseif ($kind === 'volunteer') {
        // Structured taxonomy: Volunteer → admin | mentor | instructor,
        // instructors additionally pick the course(s) they can teach.
        $role = strtolower(trim((string)($p['role'] ?? '')));
        if (!in_array($role, ['admin', 'mentor', 'instructor'], true)) return ['ok' => false, 'error' => 'bad_role'];
        $phone = sms_normalize((string)($p['phone'] ?? ''));
        // Instructors run rooms — they must be reachable by phone.
        if ($role === 'instructor' && $phone === '') return ['ok' => false, 'error' => 'phone_required'];
        if ($role === 'instructor') {
            $offered = volunteer_course_options();
            foreach ((is_array($p['courses'] ?? null) ? $p['courses'] : []) as $c) {
                $c = (string)$c;
                if (in_array($c, $offered, true) && !in_array($c, $courses, true)) $courses[] = $c;
            }
            if (!$courses) return ['ok' => false, 'error' => 'course_required'];
        }
    } else {
        $role = substr(trim((string)($p['role'] ?? '')), 0, 60);
    }

    $cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - 24 * 3600);
    $dupe = db_row('SELECT id FROM applications WHERE lower(email) = ? AND kind = ? AND createdAt > ? LIMIT 1', [$email, $kind, $cutoff]);
    if (!$dupe) {
        db_insert('applications', [
            'kind' => $kind, 'name' => $name, 'age' => $age ?: null, 'centre' => $centre, 'track' => $track,
            'role' => $role, 'why' => $why, 'email' => $email, 'program' => $program, 'photoUrl' => $photoUrl,
            'phone' => $phone, 'courses' => $courses ? json_encode($courses, JSON_UNESCAPED_SLASHES) : '',
            'status' => 'new', 'createdAt' => now_iso(), 'ip' => (string)($p['ip'] ?? ''),
        ]);
        if ($kind === 'volunteer') {
            event_emit('volunteer.applied', [
                'name' => $name, 'role' => $role, 'courses' => $courses,
                'contact' => mask_email($email), 'status' => 'new',
            ]);
        }
        // Notify the admissions inbox so applications don't sit unseen.
        $adminEmail = ($GLOBALS['CONFIG']['admin_email'] ?? '') ?: ($GLOBALS['CONFIG']['mail']['reply_to'] ?? '');
        if ($adminEmail) {
            $label = $kind === 'volunteer' ? ('volunteer · ' . $role) : ($kind === 'mentor' ? 'mentor' : ($program === 'summer' ? 'Summer' : 'Anchor 12'));
            @send_mail((string)$adminEmail, "New {$label} application — {$name}",
                email_template([
                    'title' => 'New application',
                    'intro' => "{$name} just applied.",
                    'bodyHtml' => '<b>Name:</b> ' . esc_html($name) . '<br><b>Email:</b> ' . esc_html($email)
                        . ($track ? '<br><b>Track:</b> ' . esc_html($track) : '')
                        . ($role ? '<br><b>Role:</b> ' . esc_html($role) : '')
                        . ($program ? '<br><b>Program:</b> ' . esc_html($program) : '')
                        . ($age ? '<br><b>Age:</b> ' . (int)$age : '')
                        . ($why ? '<br><br>' . nl2br(esc_html(substr($why, 0, 800))) : ''),
                    'footNote' => 'Review in the admin Applications tab.',
                ]));
        }
        // Acknowledge the applicant — a clean, professional confirmation so
        // nobody applies into silence. Volunteer copy names the role + the
        // safeguarding note; teen/mentor get the short version.
        $first = explode(' ', $name)[0] ?: 'there';
        if ($kind === 'volunteer') {
            $roleLabel = ['admin' => 'Admin / Ops', 'mentor' => 'Mentor', 'instructor' => 'Instructor'][$role] ?? ucfirst($role);
            $body = '<p style="margin:0 0 12px">We review every application by hand and write back within a week.</p>'
                . '<p style="margin:0 0 12px"><b>Role:</b> ' . esc_html($roleLabel)
                . ($courses ? '<br><b>Courses:</b> ' . esc_html(implode(', ', $courses)) : '') . '</p>'
                . '<p style="margin:0">Volunteers working directly with young people complete safeguarding screening before their first session.</p>';
            @send_mail($email, 'We received your volunteer application — Next Generation Genius',
                email_template([
                    'title' => 'Application received',
                    'intro' => 'Thank you for offering your time, ' . $first . '.',
                    'bodyHtml' => $body,
                    'footNote' => 'You applied to volunteer with Next Generation Genius.',
                ]));
        } else {
            $what = $kind === 'mentor' ? 'mentor application' : 'application';
            @send_mail($email, 'We received your ' . $what . ' — Next Generation Genius',
                email_template([
                    'title' => 'Application received',
                    'intro' => 'Thank you, ' . $first . '.',
                    'bodyHtml' => '<p style="margin:0">We review every ' . esc_html($what) . ' by hand and write back within a week.</p>',
                    'footNote' => 'You applied to Next Generation Genius.',
                ]));
        }
    }
    audit('apply.' . $kind, null, $email, ['name' => $name, 'track' => $track ?: $role, 'program' => $program], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'duplicate' => (bool)$dupe];
}

/* ── Volunteer registration (public) ──────────────────────────────────────── */

/** The courses instructors can offer — same source the live summer
 *  registration form serves, so the admin's form builder stays the single
 *  place to manage the catalogue. */
function volunteer_course_options(): array {
    $live = form_live();
    foreach ($live['fields'] as $f) {
        if (($f['key'] ?? '') === 'course' && !empty($f['options']) && is_array($f['options'])) {
            return array_values(array_map('strval', $f['options']));
        }
    }
    return ['Coding & Robotics', 'Design & Media', 'Public Speaking', 'Chess & Strategy'];
}

function public_volunteer_context(): array {
    return [
        'ok' => true,
        'open' => setting_raw('volunteer_applications_open') !== '0',
        'roles' => ['admin', 'mentor', 'instructor'],
        'courses' => volunteer_course_options(),
    ];
}
