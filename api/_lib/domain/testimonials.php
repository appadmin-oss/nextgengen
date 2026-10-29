<?php
/**
 * WHAT A MEMBER SAYS ABOUT A SESSION — asked at the end of every one.
 *
 * A SESSION is the twelve-week block, four a year (TONI, MEDI, SUMMER, DOMI),
 * not a Saturday. This was built per LESSON first and that was wrong: asking
 * a child for a testimonial twenty-four times a term produces a diary, not a
 * testimonial, and nothing worth publishing. What is asked every Saturday is
 * a different and much smaller question, and it lives in
 * `domain/lesson-feedback.php`: did today land? It is never published.
 *
 * The home page used to carry four testimonials attributed to named people:
 * a fifteen-year-old from Egbeda, a parent, a mentor of four years. Nobody
 * said any of them. They were written to show what the section would look
 * like and they shipped to a live site about real children.
 *
 * This is where the real ones come from. A member finishes a term and is
 * asked one question, in one line. Four a year is a record of what the
 * programme actually did for somebody, in their own words, written while
 * they still remember it rather than reconstructed for a funder's report
 * eighteen months later.
 *
 * ── The rules, which ARE the feature ───────────────────────────────────────
 *
 * 1. PRIVATE UNTIL A PERSON DECIDES OTHERWISE. Nothing a child writes here
 *    reaches the public site because they wrote it. It is held for staff,
 *    and publication is a separate, deliberate, recorded act by somebody
 *    holding `content`.
 *
 * 2. THE CHILD CHOOSES HOW THEY ARE NAMED, and the default is the quietest
 *    option. Initials and an age, their first name, or nothing at all. A
 *    full name is not on the list: this is a youth programme, the words are
 *    public, and a surname plus a centre plus an age is an identification.
 *
 * 3. PUBLISHING NEEDS THE GUARDIAN'S CONSENT, asked of the one place that
 *    holds it. A Club member is a child, so the gate that decides whether
 *    their name may be printed on the summer board decides whether their
 *    words may be quoted here: `consent_may_publish()` over the `consents`
 *    ledger, read live on every request. Without it the review screen can
 *    still READ the words — they are useful to staff either way — and
 *    cannot publish them. The check is here, not on the screen, because a
 *    screen is one of several ways in.
 *
 * 4. IT IS NEVER REQUIRED. Skipping is a press, it is not recorded as a
 *    failure, and nothing in the lesson, the review or the member's progress
 *    depends on having written one. A testimonial given to unlock something
 *    is not a testimonial.
 *
 * 5. A MEMBER CAN TAKE IT BACK, published or not, without asking anybody.
 *    Consent that cannot be withdrawn was not consent.
 */

const TESTI_MAX       = 600;   // characters; it is one or two sentences
const TESTI_MIN       = 12;
const TESTI_SHOW_AS   = ['initials', 'first', 'anon'];
const TESTI_STATUSES  = ['new', 'published', 'declined', 'withdrawn'];
const TESTI_PUBLIC_MAX = 24;
/* WHEN THE QUESTION IS PUT. Not on the first Saturday of a term — there is
   nothing to say yet — and not forever afterwards either. The last three
   weeks of a session, and then for two months after it ends so that somebody
   who was away for the close of term is still asked. */
const TESTI_ASK_BEFORE_DAYS = 21;
const TESTI_ASK_AFTER_DAYS  = 60;

/**
 * The session a member is asked about today, or null.
 *
 * Read from the `sessions` table rather than session_current(), because that
 * one is scoped to the calendar year and the session a member should be
 * asked about in early January is December's.
 */
function testi_session_ask(?string $today = null): ?array {
    $today = $today ?? gmdate('Y-m-d');
    $cur = db_row('SELECT * FROM sessions WHERE startDate <= ? AND endDate >= ? ORDER BY startDate DESC LIMIT 1', [$today, $today]);
    if ($cur) {
        $left = (int)round((strtotime(iso_date($cur['endDate']) . ' UTC') - strtotime($today . ' UTC')) / 86400);
        return $left <= TESTI_ASK_BEFORE_DAYS ? $cur : null;
    }
    $prev = db_row('SELECT * FROM sessions WHERE endDate < ? ORDER BY endDate DESC LIMIT 1', [$today]);
    if (!$prev) return null;
    $since = (int)round((strtotime($today . ' UTC') - strtotime(iso_date($prev['endDate']) . ' UTC')) / 86400);
    return $since <= TESTI_ASK_AFTER_DAYS ? $prev : null;
}

/** A session as the member and the review queue see it named. */
function testi_session_public(?array $s): ?array {
    if (!$s) return null;
    return ['sessionId' => (string)$s['sessionId'], 'name' => (string)($s['name'] ?: $s['code']),
            'startDate' => iso_date($s['startDate']), 'endDate' => iso_date($s['endDate']),
            'theme' => (string)($s['theme'] ?? '')];
}

/** The distinct members a set of testimonial rows belongs to. */
function testi_member_ids(array $rows): array {
    return array_values(array_unique(array_filter(array_map(fn($r) => (string)$r['memberId'], $rows), fn($x) => $x !== '')));
}

/** Those members, in one query, keyed by id. */
function testi_members(array $ids, string $cols): array {
    if (!$ids) return [];
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $out = [];
    foreach (db_all("SELECT $cols FROM members WHERE memberId IN $in", $ids) as $m) $out[(string)$m['memberId']] = $m;
    return $out;
}

/** One row as the member or a staff screen sees it. */
function testi_public(array $r, bool $withName = false): array {
    $out = [
        'tid' => (string)$r['tid'],
        'body' => (string)$r['body'],
        'showAs' => (string)$r['showAs'],
        'status' => (string)$r['status'],
        'course' => (string)$r['course'],
        'sessionId' => (string)$r['sessionId'],
        'createdAt' => (string)$r['createdAt'],
    ];
    if ($withName) {
        $out['memberId'] = (string)$r['memberId'];
        $out['centre'] = (string)$r['centre'];
        $out['sessionId'] = (string)$r['sessionId'];
        $out['note'] = (string)($r['note'] ?? '');
    }
    return $out;
}

/**
 * How a published testimonial is signed.
 *
 * Built HERE, from the member's own choice, every time it is read — never
 * stored. A name written into the row at the moment of publication would
 * survive the member changing their mind, leaving the programme, or a
 * guardian withdrawing consent, because nothing would go back and rewrite
 * it. Deriving it means withdrawal actually withdraws.
 */
function testi_byline(array $m, string $showAs): string {
    $name = trim((string)($m['fullName'] ?? ''));
    $parts = preg_split('/\s+/', $name) ?: [];
    $age = function_exists('dob_age') ? dob_age((string)($m['dob'] ?? '')) : 0;
    $suffix = $age >= 8 && $age <= 25 ? ', ' . $age : '';
    if ($showAs === 'anon') return 'A member' . $suffix;
    if ($showAs === 'first') return ($parts[0] ?? 'A member') . $suffix;
    // initials, the default
    $ini = '';
    foreach ($parts as $p) { if ($p !== '' && preg_match('/^\p{L}/u', $p)) $ini .= mb_strtoupper(mb_substr($p, 0, 1)) . '.'; }
    return ($ini !== '' ? $ini : 'A member') . $suffix;
}

/**
 * The member writes one, for a session.
 *
 * One per session: writing again replaces what they wrote, because a second
 * thought about the same term is a correction, not a second testimonial.
 * Replacing a PUBLISHED one sends it back for review — the words on the site
 * must be words somebody approved.
 *
 * It must be the session they are actually being asked about. "One per
 * session" is the only thing bounding how many of these one account can
 * create, and a sessionId the client invents is not a session.
 */
function member_testimonial_give(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $ask = testi_session_ask();
    $sessionId = (string)($p['sessionId'] ?? '');
    /* An EXISTING one may always be edited or withdrawn, whatever the clock
       says — the window governs when the question is PUT, never whether
       somebody may take their own words back. */
    $existing = $sessionId !== ''
        ? db_row('SELECT * FROM testimonials WHERE memberId = ? AND sessionId = ? LIMIT 1', [(string)$m['memberId'], $sessionId])
        : null;
    if (!$existing && (!$ask || $sessionId !== (string)$ask['sessionId'])) return ['ok' => false, 'error' => 'not_asked_now'];

    $body = function_exists('curriculum_clean_text')
        ? curriculum_clean_text($p['body'] ?? '', TESTI_MAX)
        : mb_substr(trim((string)($p['body'] ?? '')), 0, TESTI_MAX);
    $showAs = (string)($p['showAs'] ?? 'initials');
    if (!in_array($showAs, TESTI_SHOW_AS, true)) $showAs = 'initials';

    /* An empty body is a WITHDRAWAL, not a validation error. It is how the
       member takes one back — the same box they wrote it in, emptied — and
       it has to work on a published one as much as a new one. */
    if (mb_strlen($body) < TESTI_MIN) {
        if ($existing) {
            db_update('testimonials', ['status' => 'withdrawn', 'body' => '', 'decidedAt' => now_iso(), 'decidedBy' => (string)$m['memberId']], ['id' => $existing['id']]);
            if (function_exists('cache_invalidate')) cache_invalidate('testimonials');
            return ['ok' => true, 'status' => 'withdrawn'];
        }
        return ['ok' => false, 'error' => 'too_short', 'min' => TESTI_MIN];
    }

    $row = [
        'memberId' => (string)$m['memberId'], 'sessionId' => $sessionId,
        'course' => (string)($p['course'] ?? ($m['track'] ?? '')),
        'centre' => (string)($m['centre'] ?? ''),
        'body' => $body, 'showAs' => $showAs,
        /* Back to 'new' on every edit, including an edit of something that
           was live: the site shows words a person approved, and these are
           not those words any more. */
        'status' => 'new', 'decidedBy' => '', 'decidedAt' => '', 'note' => '',
    ];
    if ($existing) {
        db_update('testimonials', $row, ['id' => $existing['id']]);
        $tid = (string)$existing['tid'];
    } else {
        $tid = 'TST-' . strtoupper(rand_hex(5));
        db_insert('testimonials', $row + ['tid' => $tid, 'createdAt' => now_iso()]);
    }
    if (function_exists('cache_invalidate')) cache_invalidate('testimonials');
    return ['ok' => true, 'tid' => $tid, 'status' => 'new'];
}

/**
 * Whether to put the question, which session it is about, and what they
 * already said — one call, because the screen needs all three to decide
 * whether to draw anything at all.
 */
function member_testimonial_mine(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $ask = testi_session_ask();
    $sid = (string)($p['sessionId'] ?? ($ask['sessionId'] ?? ''));
    $r = $sid === '' ? null : db_row('SELECT * FROM testimonials WHERE memberId = ? AND sessionId = ? LIMIT 1', [(string)$m['memberId'], $sid]);
    return ['ok' => true, 'session' => testi_session_public($ask), 'mine' => $r ? testi_public($r) : null];
}

/**
 * The review queue. `content` is the capability, because this is publishing.
 * Centre-scoped on the way in, per row, like every other roster in here.
 */
function admin_testimonials_list(array $p): array {
    $g = admin_cap_gate_any($p, ['content', 'people']); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? 'new');
    if (!in_array($status, TESTI_STATUSES, true) && $status !== 'all') $status = 'new';

    $where = $status === 'all' ? '1 = 1' : 'status = ?';
    $args = $status === 'all' ? [] : [$status];
    $centres = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    if ($centres !== null) {
        if (!$centres) return ['ok' => true, 'rows' => [], 'counts' => []];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')';
        $args = array_merge($args, $centres);
    }
    $raw = db_all("SELECT * FROM testimonials WHERE $where ORDER BY createdAt DESC LIMIT 300", $args);
    /* Both lookups batched above the loop. A per-row query inside a list
       serialiser is the N+1 this codebase has had to undo twice. */
    $ids = testi_member_ids($raw);
    $mem = testi_members($ids, 'memberId, fullName, dob, centre');
    $may = $ids && function_exists('consent_may_publish_many') ? consent_may_publish_many($ids) : [];
    $rows = [];
    foreach ($raw as $r) {
        $id = (string)$r['memberId'];
        $m = $mem[$id] ?? null;
        $out = testi_public($r, true);
        $out['name'] = $m ? (string)$m['fullName'] : '(member removed)';
        $out['byline'] = $m ? testi_byline($m, (string)$r['showAs']) : 'A member';
        /* Shown so a reviewer knows BEFORE pressing publish why they cannot,
           rather than meeting a refusal. */
        $out['consent'] = $m ? !empty($may[$id]['mayName']) : false;
        $rows[] = $out;
    }
    $counts = [];
    foreach (db_all('SELECT status, COUNT(*) c FROM testimonials GROUP BY status') as $c) $counts[(string)$c['status']] = (int)$c['c'];
    return ['ok' => true, 'rows' => $rows, 'counts' => $counts];
}

/** Publish one, or turn it down. Recorded either way. */
function admin_testimonials_decide(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $tid = (string)($p['tid'] ?? '');
    $to = (string)($p['status'] ?? '');
    if (!in_array($to, ['published', 'declined', 'new'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $r = db_row('SELECT * FROM testimonials WHERE tid = ?', [$tid]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];

    $m = db_row('SELECT memberId, fullName, centre FROM members WHERE memberId = ?', [(string)$r['memberId']]);
    if ($m && function_exists('admin_centre_allowed') && !admin_centre_allowed($g['requester'], (string)$m['centre'])) {
        return ['ok' => false, 'error' => 'out_of_scope'];
    }
    /* THE CONSENT GATE. Publishing a child's words under a byline is the one
       act here that leaves the programme, so it asks the question the rest of
       the programme already asks before printing a child's name. Refused with
       a reason a reviewer can act on, not a generic forbidden. */
    $may = $m && function_exists('consent_may_publish') ? consent_may_publish((string)$m['memberId']) : ['mayName' => false];
    if ($to === 'published' && empty($may['mayName'])) {
        return ['ok' => false, 'error' => 'no_visibility_consent',
                'message' => 'This member\'s guardian has not granted "Feature on our website", so their words cannot go on the public site. Record that consent on the member, then publish.'];
    }
    if ((string)$r['status'] === 'withdrawn') {
        return ['ok' => false, 'error' => 'withdrawn',
                'message' => 'The member took this back. It cannot be published again unless they write another.'];
    }

    db_update('testimonials', [
        'status' => $to,
        'decidedBy' => (string)$g['requester']['memberId'],
        'decidedAt' => now_iso(),
        'note' => function_exists('curriculum_clean_text') ? curriculum_clean_text($p['note'] ?? '', 300) : '',
    ], ['tid' => $tid]);
    if (function_exists('audit')) audit('testimonial.' . $to, (string)$g['requester']['memberId'], $tid, ['member' => (string)$r['memberId']], (string)($p['ip'] ?? ''));
    if (function_exists('cache_invalidate')) cache_invalidate('testimonials');
    return ['ok' => true, 'status' => $to];
}

/**
 * What the public site shows. Published only, newest first, with the byline
 * derived at read time from the member's current choice — so a withdrawal or
 * a change of mind takes effect here without anything going back to rewrite
 * a stored string.
 */
function public_testimonials(array $p = []): array {
    $raw = db_all("SELECT * FROM testimonials WHERE status = 'published' ORDER BY decidedAt DESC, id DESC LIMIT " . TESTI_PUBLIC_MAX);
    $ids = testi_member_ids($raw);
    if (!$ids) return ['ok' => true, 'testimonials' => []];
    $mem = testi_members($ids, 'memberId, fullName, dob, centre, track');
    /* Consent is read HERE too, and live: withdrawing it takes the words off
       the site on the very next request, without anybody having to remember
       to go and unpublish them. */
    $may = function_exists('consent_may_publish_many') ? consent_may_publish_many($ids) : [];
    $rows = [];
    foreach ($raw as $r) {
        $id = (string)$r['memberId'];
        $m = $mem[$id] ?? null;
        if (!$m || empty($may[$id]['mayName'])) continue;
        $rows[] = [
            'q' => (string)$r['body'],
            'from' => testi_byline($m, (string)$r['showAs']),
            'role' => trim(((string)$r['course'] ?: (string)($m['track'] ?? '')) . ' · ' . (string)($m['centre'] ?? ''), ' ·'),
        ];
    }
    return ['ok' => true, 'testimonials' => $rows];
}
