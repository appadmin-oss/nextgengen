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
    // Capacity: a full event puts new "going" RSVPs on the waitlist.
    $waitlisted = false;
    if ($status === 'going') {
        $cap = (int)($evt['capacity'] ?? 0);
        if ($cap > 0) {
            $going = (int)(db_row("SELECT COUNT(*) c FROM event_rsvps WHERE eventId = ? AND status = 'going' AND memberId != ?", [$eventId, $memberId])['c'] ?? 0);
            if ($going >= $cap) { $status = 'waitlist'; $waitlisted = true; }
        }
    }
    if ($existing) {
        db_update('event_rsvps', ['status' => $status, 'rsvpAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('event_rsvps', ['eventId' => $eventId, 'memberId' => $memberId, 'status' => $status, 'rsvpAt' => now_iso(), 'attendedAt' => '']);
    }
    $body = $status === 'going' ? "You're going. See you there." : ($status === 'waitlist' ? "This event is full — you're on the waitlist." : 'RSVP updated.');
    push_notification($memberId, ['kind' => 'event', 'title' => 'RSVP: ' . $evt['title'], 'body' => $body, 'linkPage' => 'events']);
    audit('event.rsvp', $memberId, $eventId, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $status, 'waitlisted' => $waitlisted];
}

/** Staff: mark (or clear) a member's attendance at an event. */
function admin_event_attendance(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $eventId = (string)($p['eventId'] ?? ''); $memberId = (string)($p['memberId'] ?? '');
    if ($eventId === '' || $memberId === '') return ['ok' => false, 'error' => 'missing_fields'];
    $on = empty($p['clear']);
    $row = db_row('SELECT id FROM event_rsvps WHERE eventId = ? AND memberId = ? LIMIT 1', [$eventId, $memberId]);
    if ($row) db_update('event_rsvps', ['attendedAt' => $on ? now_iso() : ''], ['id' => $row['id']]);
    elseif ($on) db_insert('event_rsvps', ['eventId' => $eventId, 'memberId' => $memberId, 'status' => 'going', 'rsvpAt' => now_iso(), 'attendedAt' => now_iso()]);
    else return ['ok' => false, 'error' => 'not_found'];
    audit('event.attendance', $g['requester']['memberId'], $eventId . '/' . $memberId, ['on' => $on], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'attended' => $on];
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

    /* Community headcount. Summer students and the Volunteer Vanguard hold an
     * ID card but have no row in `members`, so every count here saw straight
     * past them and the community reported the members table alone. These are
     * the card-holders who have actually signed in — enrolment is not
     * membership, and the board should say how many people turned up. */
    $cmStudents = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE status='active' AND communityAt != '' AND communityAt IS NOT NULL")['c'] ?? 0);
    $cmInstructors = (int)(db_row("SELECT COUNT(*) c FROM volunteers WHERE status='active' AND communityAt != '' AND communityAt IS NOT NULL")['c'] ?? 0);

    return ['ok' => true, 'stats' => [
        'activeMembers' => $active, 'summer' => $summer, 'ngg' => $ngg, 'graduates' => $graduates,
        'mentors' => $mentors, 'missionsVerified' => $verified, 'missionsSubmitted' => $submitted,
        'completionRate' => $submitted > 0 ? (int)round($verified / $submitted * 100) : 0,
        'centres' => $centres,
        'communityStudents' => $cmStudents,
        'communityInstructors' => $cmInstructors,
        'communityMembers' => $active + $cmStudents + $cmInstructors,
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

/** One-click unsubscribe via a signed token (from the email footer link). */
function public_newsletter_unsubscribe(array $p): array {
    $email = strtolower(trim((string)($p['email'] ?? '')));
    $token = (string)($p['token'] ?? '');
    if ($email === '' || !function_exists('newsletter_unsub_token')) return ['ok' => false, 'error' => 'bad_request'];
    if (!hash_equals(newsletter_unsub_token($email), $token)) return ['ok' => false, 'error' => 'bad_token'];
    $row = db_row('SELECT id FROM newsletter WHERE lower(email) = ? LIMIT 1', [$email]);
    if ($row) db_update('newsletter', ['status' => 'unsubscribed', 'updatedAt' => now_iso()], ['id' => $row['id']]);
    audit('newsletter.unsubscribe', null, $email, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Applicant self-service status lookup by reference + email (anti-enumeration). */
function public_application_status(array $p): array {
    $ref = strtoupper(trim((string)($p['ref'] ?? '')));
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^NGG-([AMVC])-(\d{3,6})$/', $ref, $mm)) return ['ok' => false, 'error' => 'bad_ref'];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    $labels = ['new' => 'Received', 'read' => 'Under review', 'reviewing' => 'Under review', 'accepted' => 'Accepted', 'converted' => 'Accepted', 'rejected' => 'Not selected this time', 'replied' => 'Replied', 'archived' => 'Closed', 'waitlist' => 'Waitlisted'];
    if ($mm[1] === 'C') {
        $row = db_row('SELECT status, createdAt FROM contact_messages WHERE ref = ? AND lower(email) = ? LIMIT 1', [$ref, $email]);
        $type = 'message';
    } else {
        $row = db_row('SELECT status, createdAt FROM applications WHERE id = ? AND lower(email) = ? LIMIT 1', [(int)$mm[2], $email]);
        $type = 'application';
    }
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $st = (string)$row['status'];
    return ['ok' => true, 'type' => $type, 'status' => $st, 'label' => $labels[$st] ?? ucfirst($st), 'submittedAt' => $row['createdAt']];
}

/* ── Donations (Paystack — config-gated, no-op when unconfigured) ─────────── */

function paystack_secret(): string {
    return trim((string)($GLOBALS['CONFIG']['paystack']['secret'] ?? ''));
}

/** HTTP to Paystack (mockable in tests). Returns decoded body or ['ok'=>false]. */
function paystack_http(string $method, string $path, array $body = []): array {
    if (isset($GLOBALS['__paystack_mock']) && is_callable($GLOBALS['__paystack_mock'])) {
        return ($GLOBALS['__paystack_mock'])($method, $path, $body);
    }
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $ch = curl_init('https://api.paystack.co' . $path);
    $opts = [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . paystack_secret(), 'Content-Type: application/json'],
    ];
    if ($method === 'POST') { $opts[CURLOPT_POST] = true; $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_SLASHES); }
    curl_setopt_array($ch, $opts);
    $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($out === false) return ['ok' => false, 'error' => 'network'];
    $j = json_decode((string)$out, true);
    return is_array($j) ? $j : ['ok' => false, 'error' => 'bad_response'];
}

/** Start a donation → returns the Paystack checkout URL. */
function public_donate_init(array $p): array {
    if (paystack_secret() === '') return ['ok' => false, 'error' => 'donations_unavailable'];
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    $naira = (int)($p['amount'] ?? 0);
    if ($naira < 100 || $naira > 10000000) return ['ok' => false, 'error' => 'bad_amount'];
    $name = substr(trim((string)($p['name'] ?? '')), 0, 120);
    $reference = 'NGGD-' . strtoupper(rand_hex(8));
    db_insert('donations', ['reference' => $reference, 'email' => $email, 'name' => $name, 'amount' => $naira, 'currency' => 'NGN', 'status' => 'pending', 'message' => substr((string)($p['message'] ?? ''), 0, 500), 'createdAt' => now_iso()]);
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $r = paystack_http('POST', '/transaction/initialize', ['email' => $email, 'amount' => $naira * 100, 'reference' => $reference, 'callback_url' => $origin . '/api/public/donate-callback.php']);
    if (empty($r['status']) || empty($r['data']['authorization_url'])) return ['ok' => false, 'error' => 'init_failed'];
    audit('donation.init', null, $reference, ['amount' => $naira], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'authorizationUrl' => (string)$r['data']['authorization_url'], 'reference' => $reference];
}

/** Verify a donation by reference (called on callback + webhook). */
function donation_verify(string $reference): array {
    $d = db_row('SELECT * FROM donations WHERE reference = ? LIMIT 1', [$reference]);
    if (!$d) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$d['status'] === 'paid') return ['ok' => true, 'status' => 'paid', 'already' => true];
    $r = paystack_http('GET', '/transaction/verify/' . rawurlencode($reference));
    $paid = !empty($r['status']) && (($r['data']['status'] ?? '') === 'success');
    if ($paid) {
        db_update('donations', ['status' => 'paid', 'channel' => (string)($r['data']['channel'] ?? ''), 'paidAt' => now_iso()], ['id' => $d['id']]);
        event_emit('donation.paid', ['ref' => $reference, 'amount' => (int)$d['amount'], 'name' => (string)$d['name']]);
        return ['ok' => true, 'status' => 'paid'];
    }
    return ['ok' => true, 'status' => (string)$d['status']];
}

function admin_donations_list(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT reference, email, name, amount, currency, status, channel, createdAt, paidAt FROM donations ORDER BY id DESC LIMIT 500');
    $total = (int)(db_row("SELECT COALESCE(SUM(amount),0) s FROM donations WHERE status='paid'")['s'] ?? 0);
    return ['ok' => true, 'donations' => $rows, 'totalPaid' => $total, 'enabled' => paystack_secret() !== ''];
}

/* ── Peer interaction: emoji reactions + moderated comments on posts ───────── */

const POST_REACTIONS = ['👏', '❤️', '🔥', '💡', '🎉'];

function post_resolve_id(string $key): string {
    if ($key === '') return '';
    $row = db_row('SELECT postId FROM posts WHERE postId = ? OR slug = ? LIMIT 1', [$key, $key]);
    return $row ? (string)$row['postId'] : '';
}

/** Public: reaction tallies + approved comments for a post (by slug or id). */
function public_post_engagement(array $p): array {
    $postId = post_resolve_id((string)($p['post'] ?? ''));
    if ($postId === '') return ['ok' => false, 'error' => 'not_found'];
    $counts = [];
    foreach (db_all('SELECT emoji, COUNT(*) c FROM post_reactions WHERE postId = ? GROUP BY emoji', [$postId]) as $r) $counts[(string)$r['emoji']] = (int)$r['c'];
    $mine = '';
    $mid = (string)($p['memberId'] ?? '');
    if ($mid !== '') { $r = db_row('SELECT emoji FROM post_reactions WHERE postId = ? AND memberId = ? LIMIT 1', [$postId, $mid]); $mine = $r ? (string)$r['emoji'] : ''; }
    $comments = db_all("SELECT commentId, memberName, body, createdAt FROM post_comments WHERE postId = ? AND status = 'approved' ORDER BY id DESC LIMIT 100", [$postId]);
    return ['ok' => true, 'reactions' => $counts, 'myReaction' => $mine, 'comments' => $comments, 'options' => POST_REACTIONS];
}

/** Member reacts (one per post; same emoji again clears it). */
function post_react(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    if ($mid === '') return ['ok' => false, 'error' => 'unauthorized'];
    $postId = post_resolve_id((string)($p['post'] ?? ''));
    if ($postId === '') return ['ok' => false, 'error' => 'not_found'];
    $emoji = (string)($p['emoji'] ?? '');
    if (!in_array($emoji, POST_REACTIONS, true)) return ['ok' => false, 'error' => 'bad_emoji'];
    $existing = db_row('SELECT id, emoji FROM post_reactions WHERE postId = ? AND memberId = ? LIMIT 1', [$postId, $mid]);
    if ($existing) {
        if ((string)$existing['emoji'] === $emoji) db_exec('DELETE FROM post_reactions WHERE id = ?', [$existing['id']]);
        else db_update('post_reactions', ['emoji' => $emoji, 'createdAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('post_reactions', ['postId' => $postId, 'memberId' => $mid, 'emoji' => $emoji, 'createdAt' => now_iso()]);
    }
    return public_post_engagement(['post' => $postId, 'memberId' => $mid]);
}

/** Member comments → moderation queue (nothing public until an admin approves). */
function post_comment_create(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'unauthorized'];
    $postId = post_resolve_id((string)($p['post'] ?? ''));
    if ($postId === '') return ['ok' => false, 'error' => 'not_found'];
    $body = trim((string)($p['body'] ?? ''));
    if (strlen($body) < 2) return ['ok' => false, 'error' => 'too_short'];
    if (strlen($body) > 1000) $body = substr($body, 0, 1000);
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'Member';
    db_insert('post_comments', ['commentId' => 'CM-' . strtoupper(rand_hex(6)), 'postId' => $postId, 'memberId' => $mid, 'memberName' => $first, 'body' => $body, 'status' => 'pending', 'createdAt' => now_iso()]);
    audit('post.comment', $mid, $postId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'pending' => true];
}

/** Admin: moderation queue (pending by default). Cap: content. */
function admin_comments_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $status = in_array((string)($p['status'] ?? 'pending'), ['pending', 'approved', 'rejected'], true) ? (string)($p['status'] ?? 'pending') : 'pending';
    $rows = db_all("SELECT c.commentId, c.postId, c.memberName, c.body, c.status, c.createdAt, p.title postTitle, p.slug postSlug
                    FROM post_comments c LEFT JOIN posts p ON p.postId = c.postId
                    WHERE c.status = ? ORDER BY c.id DESC LIMIT 200", [$status]);
    $pending = (int)(db_row("SELECT COUNT(*) c FROM post_comments WHERE status = 'pending'")['c'] ?? 0);
    return ['ok' => true, 'comments' => $rows, 'pending' => $pending];
}

function admin_comment_moderate(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $action = (string)($p['do'] ?? '');
    if (!in_array($action, ['approve', 'reject', 'delete'], true)) return ['ok' => false, 'error' => 'bad_action'];
    $cid = (string)($p['commentId'] ?? '');
    if ($action === 'delete') { db_exec('DELETE FROM post_comments WHERE commentId = ?', [$cid]); }
    else db_update('post_comments', ['status' => $action === 'approve' ? 'approved' : 'rejected', 'moderatedBy' => $g['requester']['memberId'], 'moderatedAt' => now_iso()], ['commentId' => $cid]);
    audit('post.comment.' . $action, $g['requester']['memberId'], $cid, [], (string)($p['ip'] ?? ''));
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

    intake_admin_alert('[Contact · ' . $purpose . '] ' . ($subject ?: $name), [
        'title' => 'New message',
        'intro' => $name . ' sent a message via the contact form.',
        'bodyHtml' => '<b>From:</b> ' . esc_html($name) . ' &lt;' . esc_html($email) . '&gt;'
            . ($phone ? '<br><b>Phone:</b> ' . esc_html($phone) : '')
            . '<br><b>Topic:</b> ' . esc_html($purpose)
            . ($subject ? '<br><b>Subject:</b> ' . esc_html($subject) : '')
            . '<br><br>' . nl2br(esc_html($message)),
        'footNote' => 'Reference ' . $ref . ' — reply from the admin Messages tab.',
    ]);
    intake_acknowledge($email, 'We got your message — Next Generation Genius', [
        'title' => 'Message received',
        'intro' => 'Thanks for reaching out, ' . explode(' ', $name)[0] . '.',
        'bodyHtml' => '<p style="margin:0 0 12px">A member of our team will reply within 2 working days.</p>'
            . '<p style="margin:0"><b>Reference:</b> ' . esc_html($ref) . '</p>',
        'footNote' => 'Reference ' . $ref . ' — you contacted Next Generation Genius.',
    ]);

    audit('contact.received', null, $email, ['ref' => $ref, 'purpose' => $purpose], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ref' => $ref];
}

/* ── Shared intake plumbing (apply + contact) ─────────────────────────────── */

/** The admin inbox intake notifications go to — single source of truth. */
function intake_inbox(): string {
    return (string)(($GLOBALS['CONFIG']['admin_email'] ?? '') ?: ($GLOBALS['CONFIG']['mail']['reply_to'] ?? ''));
}

/** A human, traceable reference an applicant can quote and the admin can find. */
function intake_reference(string $kind, int $id): string {
    $tag = ['teen' => 'A', 'anchor' => 'A', 'mentor' => 'M', 'volunteer' => 'V', 'contact' => 'C'][$kind] ?? 'A';
    return 'NGG-' . $tag . '-' . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
}

/** Best-effort alert to the admissions inbox (no-op when unconfigured). */
function intake_admin_alert(string $subject, array $opts): void {
    $to = intake_inbox();
    if ($to !== '') @send_mail($to, $subject, email_template($opts));
}

/** Best-effort acknowledgement to the person who reached out. */
function intake_acknowledge(string $to, string $subject, array $opts): void {
    if ($to !== '') @send_mail($to, $subject, email_template($opts));
}

/** Absolute URL to the volunteer Operations Manual (LCASP handbook). Admins can
 *  override the path via the `volunteer_handbook_url` setting; otherwise it
 *  resolves against app_origin to the copy bundled in /assets/docs. */
function volunteer_handbook_url(): string {
    $override = trim((string)(function_exists('setting_raw') ? (setting_raw('volunteer_handbook_url') ?: '') : ''));
    if ($override !== '') return $override;
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    return $origin . '/assets/docs/lcasp-operations-manual-2026.pdf';
}

/** Is a headshot mandatory on the public intake forms? On by default; an admin
 *  can turn it off by setting `intake_photo_required` to '0'. */
function intake_photo_required(): bool {
    return setting_raw('intake_photo_required') !== '0';
}

/**
 * A headshot arriving on a PUBLIC intake form, in whatever shape the browser
 * could produce. Returns a URL to store, or '' if there is nothing usable.
 *
 * THE BUG THIS EXISTS FOR. This accepted one shape — an unsigned upload to
 * res.cloudinary.com — silently blanked everything else, and then the check
 * below refused the application for having no photo. Cloudinary is opt-in
 * (uploadOrInline falls back to carrying the image INSIDE the submission, and
 * there is a whole local photo store built for exactly that), so on any
 * deployment without it every volunteer did everything right, watched their
 * headshot appear on screen, and was told `photo_required`. Not "sometimes":
 * every one of them, because the form will not submit without a photo and the
 * intake would not take the only kind the browser had to give.
 *
 * The three shapes, and why each is safe:
 *   data:        the bytes are in the request. photo_store_put re-decodes them,
 *                checks the real image type rather than the declared one, and
 *                content-addresses the file — so what is stored is an image we
 *                have parsed, not a URL we are trusting.
 *   our own path the local store's serving URL, already ours.
 *   Cloudinary   the configured CDN, exactly as before.
 *
 * Any other remote URL is still refused. This is an unauthenticated form, and
 * storing an arbitrary attacker-chosen URL on a volunteer record — to be
 * rendered later on the public directory — is not a photo upload. That is why
 * this is its own function rather than a call to photo_intake_url(), which
 * accepts any https host and is right for the staff-facing paths that use it.
 */
function intake_photo_accept(string $incoming): string {
    $u = trim($incoming);
    if ($u === '') return '';
    if (preg_match('#^data:#i', $u)) {
        try {
            $st = photo_store_put($u);
            return !empty($st['ok']) ? (string)$st['url'] : '';
        } catch (Throwable $e) {
            error_log('[intake_photo_accept] ' . $e->getMessage());
            return '';
        }
    }
    if (preg_match('#^/api/public/photo\.php\?#', $u)) return substr($u, 0, 512);
    if (preg_match('#^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/#', $u)) return substr($u, 0, 512);
    return '';
}

function public_apply(array $p): array {
    $kind = (string)($p['kind'] ?? 'teen');
    if (!in_array($kind, ['teen', 'mentor', 'volunteer'], true)) return ['ok' => false, 'error' => 'bad_kind'];
    // Respect the admin toggles (default open).
    $openKey = $kind === 'teen' ? 'applications_open' : ($kind === 'mentor' ? 'mentor_applications_open' : 'volunteer_applications_open');
    if (setting_raw($openKey) === '0') return ['ok' => false, 'error' => 'applications_closed'];
    // Structured name: first + last required, other optional. Legacy `name`
    // stays populated (composed) so downstream reads/emails keep working.
    $first = trim((string)($p['firstName'] ?? ''));
    $last  = trim((string)($p['lastName'] ?? ''));
    $other = trim((string)($p['otherName'] ?? ''));
    if ($first === '' || mb_strlen($first) > 60) return ['ok' => false, 'error' => 'bad_firstName'];
    if ($last === '' || mb_strlen($last) > 60) return ['ok' => false, 'error' => 'bad_lastName'];
    if (mb_strlen($other) > 60) return ['ok' => false, 'error' => 'bad_otherName'];
    $name = trim((string)($p['name'] ?? '')) ?: trim($first . ($other !== '' ? ' ' . $other : '') . ' ' . $last);
    if (strlen($name) < 2 || strlen($name) > 120) return ['ok' => false, 'error' => 'bad_name'];
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($email) > 200) return ['ok' => false, 'error' => 'email_too_long'];
    $why = trim((string)($p['why'] ?? ''));
    if (strlen($why) > 2000) return ['ok' => false, 'error' => 'why_too_long'];
    // Phone is now required on every intake (previously instructor-only).
    $phone = sms_normalize((string)($p['phone'] ?? ''));
    if ($phone === '') return ['ok' => false, 'error' => 'phone_required'];
    // Date of birth: a real calendar date, not in the future.
    $dob = trim((string)($p['dob'] ?? ''));
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dob, $dm) || !checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1])) {
        return ['ok' => false, 'error' => 'bad_dob'];
    }
    $dobAge = function_exists('dob_age') ? dob_age($dob) : -1;
    if ($dobAge < 0) return ['ok' => false, 'error' => 'bad_dob'];
    // Sex — standardised (not free text). Required on every intake.
    $sexMap = ['male' => 'Male', 'female' => 'Female'];
    $sex = $sexMap[strtolower(trim((string)($p['sex'] ?? '')))] ?? '';
    if ($sex === '') return ['ok' => false, 'error' => 'bad_sex'];
    // Adults only for mentor/volunteer; the teen branch enforces 10–17 below.
    if ($kind !== 'teen' && $dobAge < 16) return ['ok' => false, 'error' => 'dob_too_young'];

    $age = 0; $track = ''; $centre = ''; $role = ''; $program = ''; $courses = []; $faculty = ''; $visibilityConsent = 0;
    $photoUrl = intake_photo_accept((string)($p['photoUrl'] ?? ''));
    if ($kind === 'teen') {
        // Age is derived from the date of birth, not entered separately.
        $age = $dobAge;
        if ($age < 10 || $age > 17) return ['ok' => false, 'error' => 'bad_age'];
        $track = substr(trim((string)($p['track'] ?? '')), 0, 60);
        $centre = substr(trim((string)($p['centre'] ?? '')), 0, 60);
        // Which program the teen is applying to. 'summer' = the 6-week Summer
        // Students on-ramp; 'anchor' = the flagship 12-week NGG. Drives the
        // member type created on conversion.
        $program = in_array((string)($p['program'] ?? ''), ['summer', 'anchor'], true) ? (string)$p['program'] : 'anchor';
    } elseif ($kind === 'volunteer') {
        // Structured taxonomy: Volunteer → admin | mentor | instructor.
        // Every volunteer picks a home CENTRE (required, must be an active
        // centre from the admin catalogue). Mentors pick a FACULTY; instructors
        // pick both a faculty and the course(s) they can teach.
        $role = strtolower(trim((string)($p['role'] ?? '')));
        if (!in_array($role, ['admin', 'mentor', 'instructor'], true)) return ['ok' => false, 'error' => 'bad_role'];
        $centre = substr(trim((string)($p['centre'] ?? '')), 0, 80);
        if ($centre === '') return ['ok' => false, 'error' => 'centre_required'];
        if (!db_row("SELECT id FROM centres WHERE name = ? AND status = 'active' LIMIT 1", [$centre])) return ['ok' => false, 'error' => 'invalid_centre'];
        if ($role === 'mentor' || $role === 'instructor') {
            $faculty = substr(trim((string)($p['faculty'] ?? '')), 0, 80);
            if ($faculty === '') return ['ok' => false, 'error' => 'faculty_required'];
            if (!in_array($faculty, volunteer_faculty_options(), true)) return ['ok' => false, 'error' => 'invalid_faculty'];
        }
        if ($role === 'instructor') {
            $offered = volunteer_courses_accepted();
            foreach ((is_array($p['courses'] ?? null) ? $p['courses'] : []) as $c) {
                $c = (string)$c;
                if (in_array($c, $offered, true) && !in_array($c, $courses, true)) $courses[] = $c;
            }
            if (!$courses) return ['ok' => false, 'error' => 'course_required'];
        }
        // Optional opt-in to be featured (photo + first name) on the public site.
        $visibilityConsent = !empty($p['visibilityConsent']) ? 1 : 0;
    } else {
        $role = substr(trim((string)($p['role'] ?? '')), 0, 60);
    }

    // A headshot is required on the public intake forms (teen + volunteer) by
    // default — the ID card, the roster and the status directory all depend on
    // it. An admin can relax this via the `intake_photo_required` setting.
    if (in_array($kind, ['teen', 'volunteer'], true) && intake_photo_required() && $photoUrl === '') {
        return ['ok' => false, 'error' => 'photo_required'];
    }

    // Standardised intake: dedupe → persist → reference → notify + acknowledge.
    // Every path returns { ok, ref, duplicate } so the client + admin queue
    // and the applicant's inbox all speak the same reference.
    // The WhatsApp group invite for the centre the applicant picked — shown on
    // the success screen so they can join their centre's group immediately.
    $waRow = $centre !== '' ? db_row("SELECT whatsappUrl FROM centres WHERE name = ? AND status = 'active' LIMIT 1", [$centre]) : null;
    $whatsapp = $waRow ? (string)($waRow['whatsappUrl'] ?? '') : '';

    $cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - 24 * 3600);
    $dupe = db_row('SELECT id FROM applications WHERE lower(email) = ? AND kind = ? AND createdAt > ? LIMIT 1', [$email, $kind, $cutoff]);
    if ($dupe) {
        audit('apply.' . $kind, null, $email, ['name' => $name, 'duplicate' => true], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'ref' => intake_reference($kind, (int)$dupe['id']), 'duplicate' => true, 'whatsapp' => $whatsapp];
    }
    $appId = db_insert('applications', [
        'kind' => $kind, 'name' => $name,
        'firstName' => $first, 'lastName' => $last, 'otherName' => $other, 'dob' => $dob, 'sex' => $sex,
        'age' => $age ?: null, 'centre' => $centre, 'track' => $track, 'faculty' => $faculty,
        'visibilityConsent' => $visibilityConsent,
        'role' => $role, 'why' => $why, 'email' => $email, 'program' => $program, 'photoUrl' => $photoUrl,
        'phone' => $phone, 'courses' => $courses ? json_encode($courses, JSON_UNESCAPED_SLASHES) : '',
        'status' => 'new', 'createdAt' => now_iso(), 'ip' => (string)($p['ip'] ?? ''),
    ]);
    $ref = intake_reference($kind, $appId);
    if ($kind === 'volunteer') {
        event_emit('volunteer.applied', [
            'ref' => $ref, 'name' => $name, 'role' => $role, 'courses' => $courses,
            'contact' => mask_email($email), 'status' => 'new',
        ]);
    }
    // Notify the admissions inbox so applications don't sit unseen.
    $label = $kind === 'volunteer' ? ('volunteer · ' . $role) : ($kind === 'mentor' ? 'mentor' : ($program === 'summer' ? 'Summer' : 'Anchor 12'));
    intake_admin_alert("New {$label} application — {$name}", [
        'title' => 'New application',
        'intro' => "{$name} just applied.",
        'bodyHtml' => '<b>Name:</b> ' . esc_html($name) . '<br><b>Email:</b> ' . esc_html($email)
            . ($phone ? '<br><b>Phone:</b> ' . esc_html($phone) : '')
            . ($dob ? '<br><b>DOB:</b> ' . esc_html($dob) . ' (age ' . (int)$dobAge . ')' : '')
            . ($sex ? '<br><b>Sex:</b> ' . esc_html($sex) : '')
            . ($track ? '<br><b>Track:</b> ' . esc_html($track) : '')
            . ($role ? '<br><b>Role:</b> ' . esc_html($role) : '')
            . ($courses ? '<br><b>Courses:</b> ' . esc_html(implode(', ', $courses)) : '')
            . ($program ? '<br><b>Program:</b> ' . esc_html($program) : '')
            . ($age ? '<br><b>Age:</b> ' . (int)$age : '')
            . ($why ? '<br><br>' . nl2br(esc_html(substr($why, 0, 800))) : ''),
        'footNote' => 'Reference ' . $ref . ' — review in the admin Applications tab.',
    ]);
    // Acknowledge the applicant — clean, professional, and traceable so nobody
    // applies into silence. Volunteer copy names the role + safeguarding note.
    $first = $first ?: (explode(' ', $name)[0] ?: 'there');
    if ($kind === 'volunteer') {
        $roleLabel = ['admin' => 'Admin / Ops', 'mentor' => 'Mentor', 'instructor' => 'Instructor'][$role] ?? ucfirst($role);
        $handbook = volunteer_handbook_url();
        $body = '<p style="margin:0 0 12px">We review every application by hand and write back within a week.</p>'
            . '<p style="margin:0 0 12px"><b>Role:</b> ' . esc_html($roleLabel)
            . ($courses ? '<br><b>Courses:</b> ' . esc_html(implode(', ', $courses)) : '')
            . '<br><b>Reference:</b> ' . esc_html($ref) . '</p>'
            . '<p style="margin:0 0 12px">Please read the <b>LCASP Summer Impact School 2026 Operations Manual</b> before your first deployment — it covers the five core pillars, the daily rhythm, and the Volunteer Vanguard Code (conduct, punctuality and safeguarding). One movement, one standard.</p>'
            . '<p style="margin:0">Volunteers working directly with young people complete safeguarding screening before their first session.</p>';
        intake_acknowledge($email, 'We received your volunteer application — Next Generation Genius', [
            'title' => 'Application received',
            'intro' => 'Thank you for offering your time, ' . $first . '.',
            'bodyHtml' => $body,
            'ctaLabel' => 'Read the Operations Manual (PDF)',
            'ctaUrl' => $handbook,
            'footNote' => 'Reference ' . $ref . ' — you applied to volunteer with Next Generation Genius. Keep the handbook to hand throughout the programme.',
        ]);
    } else {
        $what = $kind === 'mentor' ? 'mentor application' : 'application';
        intake_acknowledge($email, 'We received your ' . $what . ' — Next Generation Genius', [
            'title' => 'Application received',
            'intro' => 'Thank you, ' . $first . '.',
            'bodyHtml' => '<p style="margin:0 0 12px">We review every ' . esc_html($what) . ' by hand and write back within a week.</p>'
                . '<p style="margin:0"><b>Reference:</b> ' . esc_html($ref) . '</p>',
            'footNote' => 'Reference ' . $ref . ' — you applied to Next Generation Genius.',
        ]);
    }
    audit('apply.' . $kind, null, $email, ['name' => $name, 'ref' => $ref, 'track' => $track ?: $role, 'program' => $program], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ref' => $ref, 'duplicate' => false, 'whatsapp' => $whatsapp];
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
    return academy_courses();
}

/** The full set of courses accepted on an instructor's intake: the flat form
 *  options AND every course in the academy catalogue (the volunteer form offers
 *  the catalogue's per-faculty courses, so those must validate too). */
function volunteer_courses_accepted(): array {
    $out = volunteer_course_options();
    foreach (academy_courses() as $c) { if (!in_array($c, $out, true)) $out[] = $c; }
    return $out;
}

/** The faculties (teaching groups) mentors & instructors belong to — sourced
 *  from the live Form Builder exactly like `volunteer_course_options()`, so the
 *  admin's form is the single source of truth. Falls back to a small sane list
 *  only if the field hasn't been configured yet. */
function volunteer_faculty_options(): array {
    $live = form_live('volunteer');
    foreach ($live['fields'] as $f) {
        if (($f['key'] ?? '') === 'faculty' && !empty($f['options']) && is_array($f['options'])) {
            return array_values(array_map('strval', $f['options']));
        }
    }
    return academy_faculties();
}

/** Public-safe centre catalogue for the volunteer form (no PII, active only). */
function public_centre_options(): array {
    $rows = db_all("SELECT name, code, color FROM centres WHERE status = 'active' ORDER BY name");
    return array_map(fn($r) => ['name' => (string)$r['name'], 'code' => (string)$r['code'], 'color' => (string)$r['color']], $rows);
}

function public_volunteer_context(): array {
    // The courses an instructor may pick are filtered by the faculty they
    // choose. Give the form the full catalogue map (faculty→courses); the form
    // looks up the chosen faculty and falls back to the flat `courses` list for
    // any offered faculty the catalogue doesn't map.
    return [
        'ok' => true,
        'open' => setting_raw('volunteer_applications_open') !== '0',
        'roles' => ['admin', 'mentor', 'instructor'],
        'courses' => volunteer_course_options(),
        'coursesByFaculty' => academy_catalogue(),
        'faculties' => volunteer_faculty_options(),
        'centres' => public_centre_options(),
    ];
}
