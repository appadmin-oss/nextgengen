<?php
declare(strict_types=1);

/**
 * NGG — shared domain helpers used by every handler in _lib/domain/*.
 * Ports the Apps Script Util/Sessions/Auth helpers to PHP + the local DB.
 */

// ── Time / ids / strings ───────────────────────────────────────────────────

function now_iso(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

/** Whole years elapsed from an ISO date (YYYY-MM-DD) to today (UTC). Returns
 *  -1 if the date is unparseable or in the future. */
/* ── Sex, as one fact with one spelling ──────────────────────────────────────
 *
 * Three things were true at once before this: `summer_students` had a `sex`
 * column AND a `gender` column, nothing wrote either, and the analytics
 * workspace read `gender` and therefore reported every child as "Not recorded"
 * in every cohort this system has run.
 *
 * SEX_VALUES is the stored vocabulary and it is deliberately short. Everything
 * downstream of this — the funder-facing disaggregation, the crosstabs, the
 * evidence pack — counts these values, and a field that arrives as "M", "male",
 * "Male " and "boy" is four spellings of one number that somebody then
 * reconstructs by hand the night before a deadline.
 *
 * Not recorded is a real answer and stays distinguishable from Male and Female.
 * A child whose family did not say is not a data error; a report that quietly
 * folded them into one of the two would be.
 */
const SEX_VALUES = ['Male', 'Female'];

/** Normalise anything a form, an import or an old row can hold into SEX_VALUES
 *  or ''. Empty means not recorded, and stays that way. */
function sex_normalise($v): string {
    $s = strtolower(trim((string)$v));
    if ($s === '') return '';
    if ($s === 'm' || $s === 'male' || $s === 'boy' || $s === 'man') return 'Male';
    if ($s === 'f' || $s === 'female' || $s === 'girl' || $s === 'woman') return 'Female';
    return '';
}

/** The one reader. Prefers `sex`; falls back to the legacy `gender` column so a
 *  row written before migration 78 still reports correctly even if the backfill
 *  has not run on this host yet. */
function person_sex(array $row): string {
    $v = sex_normalise($row['sex'] ?? '');
    return $v !== '' ? $v : sex_normalise($row['gender'] ?? '');
}

/** For a report line: never blank, always countable. */
function sex_label(array $row): string {
    $v = person_sex($row);
    return $v !== '' ? $v : 'Not recorded';
}

/* ── School grade, and the transition window ─────────────────────────────────
 *
 * WHY THIS IS A NUMBER AND NOT A LABEL.
 *
 * A family in Egbeda knows their child is in "JSS 2". A funder's eligibility
 * rule is written as "grades 7 to 9". Both are the same fact and neither is the
 * other's spelling, so the form asks in the words a parent uses and the column
 * stores the internationally comparable number. Ask locally, store globally —
 * the alternative is a VARCHAR holding "JSS2", "Jss 2", "J.S.S 2" and "Grade 8"
 * that somebody maps by hand the week a proposal is due.
 *
 * THE TRANSITION WINDOW is the reason this exists at all. Gender gaps in
 * schooling widen sharply at the primary-to-secondary transition, so the
 * evidence funds that matter to a programme like this one scope their
 * eligibility to two bands: grades 4–6 (lower to upper primary) and grades 7–9
 * (upper primary to secondary). Without a grade on the record, "how many of our
 * children are at the transition point" is not a question this system can
 * answer, and that is a question an application form asks in its first section.
 *
 * Nigeria's ladder: Primary 1–6 = grades 1–6, JSS 1–3 = grades 7–9,
 * SSS 1–3 = grades 10–12.
 */
const GRADE_LABELS = [
    1 => 'Primary 1', 2 => 'Primary 2', 3 => 'Primary 3',
    4 => 'Primary 4', 5 => 'Primary 5', 6 => 'Primary 6',
    7 => 'JSS 1', 8 => 'JSS 2', 9 => 'JSS 3',
    10 => 'SSS 1', 11 => 'SSS 2', 12 => 'SSS 3',
];

/* The two windows, as the funds define them. Kept as data rather than as an
 * if-chain so a report, a filter and a chart cannot each decide differently
 * where upper primary ends. */
const GRADE_BANDS = [
    ['key' => 'primary_1_3',  'label' => 'Primary 1–3',  'from' => 1,  'to' => 3,  'transition' => false],
    ['key' => 'primary_4_6',  'label' => 'Primary 4–6',  'from' => 4,  'to' => 6,  'transition' => true,
     'note' => 'Lower to upper primary — where learning foundations are built.'],
    ['key' => 'jss_7_9',      'label' => 'JSS 1–3',      'from' => 7,  'to' => 9,  'transition' => true,
     'note' => 'Upper primary to secondary — where gender gaps widen sharply.'],
    ['key' => 'sss_10_12',    'label' => 'SSS 1–3',      'from' => 10, 'to' => 12, 'transition' => false],
];

/** Anything a form, an import or a coordinator can type → a grade number, or 0
 *  for not recorded. Accepts the local ladder and the international one, because
 *  a CSV from a partner will use whichever its own country uses. */
function grade_normalise($v): int {
    if (is_int($v) || (is_string($v) && ctype_digit(trim((string)$v)))) {
        $n = (int)$v;
        return ($n >= 1 && $n <= 12) ? $n : 0;
    }
    $s = strtolower(trim((string)$v));
    if ($s === '') return 0;
    /* Split the word from the number rather than relying on a space. "JSS2",
       "P4" and "sss1" are what a coordinator actually types into a box, and a
       \b-anchored match sees none of them. */
    $s = preg_replace('/[._\-]/', ' ', $s) ?? $s;
    if (!preg_match('/^\s*([a-z ]*?)\s*(\d+)/', $s, $m)) return 0;
    $word = trim(preg_replace('/\s+/', ' ', $m[1]) ?? '');
    $n = (int)$m[2];
    if ($n < 1) return 0;
    if (preg_match('/^(p|pry|prim|primary|basic|class|std|standard)$/', $word) && $n <= 6) return $n;
    if (preg_match('/^(j s s|jss|js|jhs|junior|junior secondary)$/', $word) && $n <= 3) return 6 + $n;
    if (preg_match('/^(s s s|sss|ss|shs|senior|senior secondary)$/', $word) && $n <= 3) return 9 + $n;
    // "grade 8" and a bare "8" are the international ladder, taken at face value.
    if (($word === '' || preg_match('/^(grade|gr|yr|year)$/', $word)) && $n <= 12) return $n;
    /* Anything else — "nursery 2", "creche", a partner's own scheme — is
       UNKNOWN rather than guessed. A wrong grade is worse than a missing one:
       it puts a child inside an eligibility window they are not in, and an
       application built on that is a misrepresentation to a funder. */
    return 0;
}

function grade_label(int $n): string { return GRADE_LABELS[$n] ?? ''; }

/** The band a grade sits in, with whether it is one of the transition windows. */
function grade_band(int $n): array {
    foreach (GRADE_BANDS as $b) if ($n >= $b['from'] && $n <= $b['to']) return $b;
    return ['key' => '', 'label' => 'Not recorded', 'from' => 0, 'to' => 0, 'transition' => false];
}

/** The one question a fund's eligibility section actually asks. */
function grade_in_transition(int $n): bool { return $n >= 4 && $n <= 9; }

/** The options the form shows: the local ladder, in order, as a parent reads it. */
function grade_options(): array { return array_values(GRADE_LABELS); }

/** The stored grade for a row, and — because a grade AGES and a date of birth
 *  does not — how stale it is.
 *
 *  A child registered in Primary 4 in June 2026 is in Primary 5 by September.
 *  Reporting them as Primary 4 in 2028 is not a rounding error, it is a false
 *  statement about eligibility, so the year it was recorded travels with it and
 *  every reader can decide what to do about that. */
function person_grade(array $row): array {
    $n = (int)($row['gradeLevel'] ?? 0);
    $asAt = (string)($row['gradeAsAt'] ?? '');
    $b = grade_band($n);
    return ['level' => $n, 'label' => grade_label($n), 'band' => $b['key'], 'bandLabel' => $b['label'],
            'transition' => $n > 0 && grade_in_transition($n), 'asAt' => $asAt,
            // Whole school years elapsed since it was recorded, so "as at
            // registration" can be said out loud rather than assumed.
            'yearsStale' => $asAt !== '' ? max(0, (int)floor((time() - strtotime($asAt . ' UTC')) / (365.25 * 86400))) : 0];
}

/**
 * A date of birth as an admin records it: YYYY-MM-DD, a real date, not in the
 * future and not before 1900. '' is a valid answer (clear it). Returns the
 * normalised date, '' for blank, or null when it is not a date of birth.
 */
function dob_clean(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '') return '';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
    if ((int)$m[1] < 1900 || $raw > gmdate('Y-m-d')) return null;
    return $raw;
}

function dob_age(string $iso): int {
    $iso = trim($iso);
    $t = strtotime($iso . ' 00:00:00 UTC');
    if ($t === false || $t > time()) return -1;
    $by = (int)gmdate('Y', $t); $bm = (int)gmdate('n', $t); $bd = (int)gmdate('j', $t);
    $age = (int)gmdate('Y') - $by;
    if ((int)gmdate('n') < $bm || ((int)gmdate('n') === $bm && (int)gmdate('j') < $bd)) $age--;
    return $age;
}

function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }

/**
 * A human-readable record id: PREFIX-YYYY-NNNN.
 *
 * The four-digit tail is a 10,000-value keyspace, and this used to hand one
 * back without ever checking whether it was taken. That is not a remote risk:
 * by the birthday bound a collision is more likely than not at ~118 records,
 * and every insert after a couple of thousand has a percentage chance of
 * failing outright on the UNIQUE constraint. It surfaced here as an
 * intermittently-failing test — "UNIQUE constraint failed: members.memberId" —
 * which in production is a member or mentor that simply could not be created,
 * at a keyboard, with no explanation.
 *
 * `$table`/`$column` make it check. Callers that pass them get a genuinely
 * unique id; the tail widens after a few tries so a crowded year cannot spin,
 * and the last resort is wide enough to be unique on its own rather than
 * returning a value known to be taken.
 */
/** Is this id already somebody's, in any table a session can name? Accounts,
 *  participants and volunteers all sign in by id, so their ids must not meet. */
function id_taken_anywhere(string $id): bool {
    foreach ([['members', 'memberId'], ['summer_students', 'studentId'], ['volunteers', 'volunteerId']] as [$t, $c]) {
        try { if (db_row("SELECT 1 x FROM $t WHERE $c = ? LIMIT 1", [$id])) return true; } catch (\Throwable $e) {}
    }
    return false;
}

function new_id(string $prefix, string $table = '', string $column = ''): string {
    $mk = fn(int $digits) => $prefix . '-' . gmdate('Y') . '-'
        . str_pad((string)random_int(0, (int)(10 ** $digits) - 1), $digits, '0', STR_PAD_LEFT);
    if ($table === '' || $column === '') return $mk(4);
    // Identifiers are supplied by this file's own callers, never by input, but
    // they are interpolated into SQL so they are constrained anyway.
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $column)) return $mk(4);
    for ($i = 0; $i < 12; $i++) {
        $digits = $i < 6 ? 4 : ($i < 10 ? 6 : 8);
        $id = $mk($digits);
        try {
            if (!db_row("SELECT 1 x FROM $table WHERE $column = ? LIMIT 1", [$id]) && !id_taken_anywhere($id)) return $id;
        } catch (\Throwable $e) {
            return $mk(4);   // table not there yet — behave as before
        }
    }
    // Twelve collisions in a row means the space is exhausted, not unlucky.
    return $prefix . '-' . gmdate('Y') . '-' . strtoupper(rand_hex(6));
}

function new_otp(): string { return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); }

function slugify(string $s): string {
    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = trim($s, '-');
    return substr($s, 0, 80);
}

/**
 * A search box as SQL: [fragment, args] for a WHERE, or ['', []] when nothing
 * was typed.
 *
 * Every WORD typed must appear in at least one of $cols, so "bello amina"
 * finds Amina Bello and "amina egbeda" narrows rather than finding nothing.
 * One LIKE over the whole string matched only the words in the order they
 * were stored, and a search that misses a record the operator can see on the
 * screen is a search they stop trusting.
 *
 * Case-insensitive the way SQLite's lower() is (ASCII), and what was typed is
 * matched literally: '%' and '_' are not wildcards ('!' escapes them — a
 * backslash is itself an escape inside a MySQL string literal).
 *
 * A phone-shaped query (digits, spaces, + - ( ) only, at least four digits)
 * is also matched against $phoneCols on its last nine digits with the
 * punctuation stripped, so "0803 111 2222" finds "+2348031112222": the tail
 * is the part of a Nigerian number that identifies it however it was written.
 *
 * $cols are column names written by the CALLER's code, never user input.
 */
const SQL_SEARCH_MAX_WORDS = 6;
function sql_text_search(string $q, array $cols, array $phoneCols = []): array {
    $q = trim((string)preg_replace('/\s+/u', ' ', mb_substr($q, 0, 120)));
    if ($q === '' || !$cols) return ['', []];
    $and = []; $args = [];
    foreach (array_slice(explode(' ', $q), 0, SQL_SEARCH_MAX_WORDS) as $w) {
        $like = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], strtolower($w)) . '%';
        $or = [];
        foreach ($cols as $c) { $or[] = "lower(COALESCE($c, '')) LIKE ? ESCAPE '!'"; $args[] = $like; }
        $and[] = '(' . implode(' OR ', $or) . ')';
    }
    $sql = implode(' AND ', $and);
    $digits = (string)preg_replace('/\D/', '', $q);
    if ($phoneCols && strlen($digits) >= 4 && preg_match('/^[\d\s+\-()]+$/', $q)) {
        $tail = '%' . substr($digits, -9) . '%';
        foreach ($phoneCols as $c) {
            $sql .= " OR replace(replace(replace(replace(replace(COALESCE($c, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ?";
            $args[] = $tail;
        }
    }
    return ['(' . $sql . ')', $args];
}

function mask_email(string $e): string {
    $at = strpos($e, '@');
    if ($at === false || $at < 1) return '***@***';
    $u = substr($e, 0, $at); $d = substr($e, $at + 1);
    $len = strlen($u);
    $um = $len <= 2 ? $u[0] . '*' : $u[0] . str_repeat('*', max(1, $len - 2)) . $u[$len - 1];
    return $um . '@' . $d;
}

function safe_json($s) {
    if ($s === null || $s === '') return null;
    if (is_array($s)) return $s;
    $d = json_decode((string)$s, true);
    return is_array($d) ? $d : null;
}

function esc_html($s): string {
    return htmlspecialchars((string)($s ?? ''), ENT_QUOTES, 'UTF-8');
}

function to_bool($v): bool {
    if (is_bool($v)) return $v;
    if (is_int($v)) return $v !== 0;
    $s = strtolower(trim((string)$v));
    return $s === '1' || $s === 'true' || $s === 'yes';
}

function normalize_image_url($url): string {
    $u = (string)($url ?? '');
    if ($u === '') return '';
    if (preg_match('#/d/([a-zA-Z0-9_-]+)#', $u, $m)) {
        return 'https://drive.google.com/uc?export=view&id=' . $m[1];
    }
    return $u;
}

// ── Audit + notifications + settings ────────────────────────────────────────

function audit(string $event, ?string $actorId, string $subject = '', array $meta = [], string $ip = ''): void {
    try {
        db_insert('audit_log', [
            'at' => now_iso(),
            'actorId' => $actorId ?: 'system',
            'event' => $event,
            'subject' => $subject,
            'ip' => $ip,
            'meta' => $meta ? json_encode($meta, JSON_UNESCAPED_SLASHES) : '',
        ]);
    } catch (Throwable $e) { /* audit must never break the request */ }
}

function push_notification(string $memberId, array $n): void {
    $row = [
        'memberId' => $memberId,
        'kind' => $n['kind'] ?? 'announcement',
        'title' => $n['title'] ?? '',
        'body' => $n['body'] ?? '',
        'linkPage' => $n['linkPage'] ?? '',
        'readAt' => '',
        'createdAt' => now_iso(),
        'actionLabel' => mb_substr((string)($n['actionLabel'] ?? ''), 0, 60),
    ];
    if (isset($n['linkRef'])) $row['linkRef'] = (string)$n['linkRef'];
    /* A running thing keeps ONE live item: the same groupKey updates the row
       in place and makes it unread again, rather than stacking a new alert
       for every step (Saturday's timetable sent one per block). */
    $group = mb_substr((string)($n['groupKey'] ?? ''), 0, 96);
    if ($group !== '') {
        $have = db_row('SELECT notifId FROM notifications WHERE memberId = ? AND groupKey = ? ORDER BY id DESC LIMIT 1', [$memberId, $group]);
        if ($have) {
            db_update('notifications', $row, ['notifId' => (string)$have['notifId']]);
            db_exec('DELETE FROM notification_state WHERE memberId = ? AND notifId = ?', [$memberId, (string)$have['notifId']]);
            return;
        }
    }
    db_insert('notifications', $row + ['notifId' => 'N-' . gmdate('Y') . '-' . rand_hex(4), 'groupKey' => $group]);
}

/**
 * What a notification's button does: a label and the member-portal page it
 * opens. The row's own actionLabel wins; otherwise the kind decides, and a
 * notification with nowhere to go has no button rather than a dead one.
 */
function notification_action(array $n): ?array {
    $page = (string)($n['linkPage'] ?? '');
    if ($page === '') return null;
    $label = trim((string)($n['actionLabel'] ?? ''));
    if ($label === '') {
        $kind = (string)($n['kind'] ?? '');
        $byKind = ['mentor' => 'Open the chat', 'duty' => 'See what to do', 'formation' => 'See today’s plan', 'event' => 'Open the event',
                   'mission' => 'See the mission', 'curriculum' => 'Open the lesson', 'safeguarding' => 'Open it', 'system' => 'Open it'];
        $byPage = ['journal' => 'Open your journal', 'community' => 'Open the post', 'results' => 'See your results', 'money' => 'See what is owed',
                   'account' => 'Open your account', 'records' => 'Open your record', 'events' => 'Open the event', 'timetable' => 'See the timetable',
                   'learn' => 'Open learning', 'curriculum' => 'Open the lesson', 'mentor' => 'Open the chat', 'dashboard' => 'Open Today'];
        $label = $byKind[$kind] ?? ($byPage[$page] ?? 'Open');
    }
    return ['label' => $label, 'page' => $page, 'ref' => (string)($n['linkRef'] ?? '')];
}

/**
 * Every staff member holding a capability — by role bundle or a per-person
 * grant — active, optionally filtered. One query, then caps resolved in PHP.
 *
 * @return list<array> member rows
 */
function staff_with_cap(string $cap, array $excludeIds = [], ?callable $filter = null): array {
    $rows = db_all("SELECT * FROM members WHERE status = 'active' AND ((COALESCE(role,'') NOT IN ('', 'member')) OR COALESCE(capsExtra,'') NOT IN ('', '[]'))");
    $out = [];
    foreach ($rows as $r) {
        if (in_array((string)$r['memberId'], $excludeIds, true)) continue;
        if (!in_array($cap, member_effective_caps($r), true)) continue;
        if ($filter && !$filter($r)) continue;
        $out[] = $r;
    }
    return $out;
}

/**
 * Tell people something needs them, or what became of what they asked for:
 * an in-app notification AND an email, each. An approval nobody hears about
 * is an approval nobody gives — the queues existed, and the only way to find
 * an item in one was to go and look.
 *
 * `$n`: kind, title, body (plain text), linkPage, and optionally ctaUrl /
 * ctaLabel for the email. Never throws; a failed mail is not a failed action.
 */
function notify_people(array $members, array $n): int {
    $sent = 0;
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    foreach ($members as $m) {
        $mid = (string)($m['memberId'] ?? '');
        if ($mid === '') continue;
        try { push_notification($mid, ['kind' => $n['kind'] ?? 'approval', 'title' => mb_substr((string)($n['title'] ?? ''), 0, 160),
            'body' => mb_substr((string)($n['body'] ?? ''), 0, 600), 'linkPage' => (string)($n['linkPage'] ?? '')]); } catch (\Throwable $e) {}
        $email = trim((string)($m['email'] ?? ''));
        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) && function_exists('send_mail') && function_exists('email_template')) {
            $html = email_template(['title' => (string)($n['title'] ?? ''), 'eyebrow' => (string)($n['eyebrow'] ?? 'NGG Control Room'),
                'intro' => (string)($n['intro'] ?? ''), 'bodyHtml' => '<p style="margin:0 0 10px">' . nl2br(esc_html((string)($n['body'] ?? ''))) . '</p>',
                'ctaLabel' => (string)($n['ctaLabel'] ?? 'Open it →'), 'ctaUrl' => $origin . (string)($n['ctaPath'] ?? '/nextadmin')]);
            @send_mail($email, (string)($n['title'] ?? 'NGG'), $html);
        }
        $sent++;
    }
    return $sent;
}

/**
 * Staff roles — THE registry. Every list of roles anywhere (the role picker,
 * the staff filter, the access matrix, the approval queue) is derived from it,
 * so a role cannot exist in one place and not another. Ordered by reach.
 *
 *   caps    the capabilities the role holds (see ADMIN_CAPS)
 *   scoped  the role only makes sense for named centres: with no centreScope
 *           it is refused at every gate (fail closed), never "all centres"
 *   queued  its sensitive people actions wait for a second admin
 *           (domain/approvals.php) instead of being refused
 *   tier    how far it reaches, for "may grant at most your own level"
 *
 * Deliberately separate trusts: money (fees), the institutional record
 * (journal), the system (settings, rbac) — in no bundle but super_admin's;
 * grant them per person (capsExtra).
 */
const ADMIN_ROLES = [
    'super_admin'  => ['label' => 'Super admin', 'tier' => 5, 'caps' => ['content', 'people', 'inbox', 'settings', 'rbac', 'summer', 'club', 'checkin', 'curriculum', 'audit', 'journal', 'fees', 'safeguarding', 'support', 'network'],
                       'summary' => 'Everything, including settings, roles and access. Keep to two or three people.'],
    'admin'        => ['label' => 'Admin', 'tier' => 4, 'caps' => ['content', 'people', 'inbox', 'club', 'summer', 'checkin', 'curriculum', 'support'],
                       'summary' => 'Runs the programme day to day: both programmes, members, the door, content and the inbox. No money, settings or roles.'],
    'club_admin'   => ['label' => 'Club coordinator', 'tier' => 3, 'queued' => true, 'caps' => ['club', 'people', 'checkin', 'curriculum'],
                       'summary' => 'The year-round Club: members, centres, volunteers, the door, the timetable and the curriculum. Suspensions, merges and centre changes wait for a second admin.'],
    'summer_admin' => ['label' => 'Summer coordinator', 'tier' => 3, 'caps' => ['summer', 'checkin'],
                       'summary' => 'One Summer School season: editions, groups, participants, sign-up desks and the door.'],
    'centre_lead'  => ['label' => 'Centre lead', 'tier' => 2, 'scoped' => true, 'queued' => true, 'caps' => ['club', 'people', 'checkin'],
                       'summary' => 'Runs their own centre(s) only: its members, roster, timetable and door. Has no access at all until given a centre; suspensions and merges wait for a second admin.'],
    'editor'       => ['label' => 'Editor', 'tier' => 1, 'caps' => ['content'],
                       'summary' => 'Site content: posts, events, missions, the Anchor Journal, quotes and announcements.'],
    'audit'        => ['label' => 'Auditor (M&E)', 'tier' => 1, 'caps' => ['audit'],
                       'summary' => 'Reads monitoring and evaluation and the audit trail. Changes nothing.'],
];
/** What each capability lets somebody do, in words — for the access matrix. */
const ADMIN_CAPS = [
    'people'     => 'Members, centres, volunteers, mentors, applications, families and ID cards',
    'club'       => 'The NGG Club roster, timetable and companion',
    'summer'     => 'Summer School editions, groups, participants, sign-up desks and conduct',
    'checkin'    => 'Check-in desks, their passwords and the duty rota',
    'curriculum' => 'Lessons, materials, checks and the Club\'s course list',
    'content'    => 'Posts, events, missions, sessions, assignments, the Journal, quotes and announcements',
    'inbox'      => 'Newsletter and messages',
    'support'    => 'Support cases: answering members, families and visitors, and their priority and status',
    'fees'       => 'Dues, training fees, fines and payments',
    'journal'    => 'Writing the programme\'s institutional record',
    'safeguarding' => 'Safeguarding cases: reading reports about young people and recording what was done',
    'audit'      => 'Monitoring & evaluation and the audit trail (read only)',
    'settings'   => 'Site settings, integrations, diagnostics and donations',
    'network'    => 'The centres\' Wi-Fi: gateways, their keys and setup, the access table and profiles (systems people only)',
    'rbac'       => 'Staff roles, extra capabilities and centre scope',
];
function admin_role_caps($role): array {
    $r = ADMIN_ROLES[strtolower((string)($role ?? ''))] ?? null;
    return $r ? $r['caps'] : [];
}
/**
 * May this requester manage an account at `$targetRole` (and, for a role
 * change, give it `$newRole`)? Managing access is the `rbac` capability, and
 * never upward: nobody acts on, or grants, a role that reaches further than
 * their own, and only a super admin creates or touches another super admin.
 */
function admin_may_manage(array $requester, string $targetRole, ?string $newRole = null): bool {
    if (!in_array('rbac', member_effective_caps($requester), true)) return false;
    $mine = admin_role_tier((string)($requester['role'] ?? ''));
    $isSuper = strtolower((string)($requester['role'] ?? '')) === 'super_admin';
    foreach (array_filter([$targetRole, $newRole], static fn($r) => $r !== null) as $r) {
        if (strtolower($r) === 'super_admin' && !$isSuper) return false;
        if (admin_role_tier($r) > $mine) return false;
    }
    return true;
}

/** Every staff role name, most reach first. */
function staff_role_names(): array { return array_keys(ADMIN_ROLES); }

/* ── How a child sees an adult ─────────────────────────────────────────────
 * A mentor, an instructor or a staff member is shown to a child (and their
 * family) as a title and a surname, "Mrs Adeyemi", never "Funmi": it is how a
 * child addresses an adult at the centre, and a first name on a screen a
 * child holds is one more thing a stranger can use. The title is the
 * person's own (`honorific`, migration 165, on whichever staff record they
 * have); with none set it is "Coach". Staff screens keep full names. */
const STAFF_HONORIFICS = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Engr', 'Coach', 'Aunty', 'Uncle', 'Pastor'];
const STAFF_HONORIFIC_DEFAULT = 'Coach';

/** A title from the allow-list, case and full stop forgiven; '' for anything else. */
function staff_honorific_clean(string $h): string {
    $h = strtolower(trim(rtrim(trim($h), '.')));
    foreach (STAFF_HONORIFICS as $ok) if (strtolower($ok) === $h) return $ok;
    return '';
}
/** The surname: the last word of the name, any title already in it set aside. */
function staff_surname(string $fullName): string {
    $p = preg_split('/\s+/', trim($fullName)) ?: [];
    while ($p && staff_honorific_clean((string)$p[0]) !== '') array_shift($p);
    return (string)($p ? end($p) : '');
}
/** "Mrs Adeyemi" from a name and a title (blank title → "Coach"). */
function staff_title_name(string $fullName, string $honorific = ''): string {
    $h = staff_honorific_clean($honorific) ?: STAFF_HONORIFIC_DEFAULT;
    $s = staff_surname($fullName);
    return $s === '' ? $h : $h . ' ' . $s;
}
/**
 * Child-facing names for a set of people, by any id they are known by
 * (memberId, mentorId or volunteerId). Only staff are renamed: an id that is
 * not a mentor, a volunteer or a staff-role member is absent from the result,
 * so a child's own name — or a classmate's — is never turned into "Coach X".
 * Three queries for the whole set, never one per person.
 */
function staff_public_names(array $ids): array {
    $ids = array_values(array_unique(array_filter(array_map('strval', $ids), static fn($x) => $x !== '')));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $out = []; $title = [];
    // The title follows the person: a mentor who is also a member reads the
    // same on every record, whichever one carries it.
    $rows = [];
    foreach (db_all("SELECT mentorId AS a, memberId AS b, volunteerId AS c, fullName, honorific FROM mentors WHERE mentorId IN ($ph) OR memberId IN ($ph)", array_merge($ids, $ids)) as $r) $rows[] = $r;
    foreach (db_all("SELECT volunteerId AS a, memberId AS b, '' AS c, fullName, honorific FROM volunteers WHERE volunteerId IN ($ph) OR memberId IN ($ph)", array_merge($ids, $ids)) as $r) $rows[] = $r;
    // A mentor record older than its member link is matched by email, as the mentor gate does.
    foreach (db_all("SELECT m.memberId AS a, t.mentorId AS b, '' AS c, t.fullName, COALESCE(NULLIF(t.honorific, ''), m.honorific) AS honorific FROM members m
                     JOIN mentors t ON t.email <> '' AND lower(t.email) = lower(m.email) AND COALESCE(t.memberId, '') = '' WHERE m.memberId IN ($ph)", $ids) as $r) $rows[] = $r;
    foreach (db_all("SELECT memberId AS a, '' AS b, '' AS c, fullName, honorific FROM members WHERE memberId IN ($ph) AND COALESCE(role,'') IN ('" . implode("','", staff_role_names()) . "')", $ids) as $r) $rows[] = $r;
    foreach ($rows as $r) foreach (['a', 'b', 'c'] as $k) { $v = (string)$r[$k]; if ($v !== '' && (string)$r['honorific'] !== '' && !isset($title[$v])) $title[$v] = (string)$r['honorific']; }
    // A title set on the member row reaches their mentor and volunteer rows too.
    $memberIds = array_values(array_filter(array_map(static fn($r) => (string)$r['b'], $rows)));
    if ($memberIds) foreach (db_all('SELECT memberId, honorific FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($memberIds), '?')) . ") AND honorific <> ''", $memberIds) as $m) $title[(string)$m['memberId']] ??= (string)$m['honorific'];
    foreach ($rows as $r) {
        $h = '';
        foreach (['a', 'b', 'c'] as $k) if ($h === '' && (string)$r[$k] !== '' && isset($title[(string)$r[$k]])) $h = $title[(string)$r[$k]];
        $name = staff_title_name((string)$r['fullName'], $h);
        foreach (['a', 'b', 'c'] as $k) { $v = (string)$r[$k]; if ($v !== '' && in_array($v, $ids, true) && !isset($out[$v])) $out[$v] = $name; }
    }
    return $out;
}
/** One person's child-facing name; `$fallback` (already child-safe) when they are not staff. */
function staff_public_name(string $id, string $fallback = ''): string {
    return staff_public_names([$id])[$id] ?? $fallback;
}
/** Record a person's title on every staff record they have (members, mentors, volunteers). */
function staff_honorific_set(string $memberId, string $mentorId, string $volunteerId, string $honorific): string {
    $h = staff_honorific_clean($honorific);
    if ($memberId !== '') { db_exec('UPDATE members SET honorific = ? WHERE memberId = ?', [$h, $memberId]); db_exec('UPDATE mentors SET honorific = ? WHERE memberId = ?', [$h, $memberId]); db_exec('UPDATE volunteers SET honorific = ? WHERE memberId = ?', [$h, $memberId]); }
    if ($mentorId !== '') db_exec('UPDATE mentors SET honorific = ? WHERE mentorId = ?', [$h, $mentorId]);
    if ($volunteerId !== '') { db_exec('UPDATE volunteers SET honorific = ? WHERE volunteerId = ?', [$h, $volunteerId]); db_exec('UPDATE mentors SET honorific = ? WHERE volunteerId = ?', [$h, $volunteerId]); }
    return $h;
}
function admin_role_label($role): string { return (string)(ADMIN_ROLES[strtolower((string)$role)]['label'] ?? $role); }
function admin_role_scoped($role): bool { return !empty(ADMIN_ROLES[strtolower((string)$role)]['scoped']); }
function admin_role_queued($role): bool { return !empty(ADMIN_ROLES[strtolower((string)$role)]['queued']); }
function admin_role_tier($role): int { return (int)(ADMIN_ROLES[strtolower((string)$role)]['tier'] ?? 0); }

/** Does this role hold a given admin capability? */
function role_has_cap($role, string $cap): bool {
    return in_array($cap, admin_role_caps($role), true);
}

/**
 * Scoped admins — a staff member's `centreScope` is a JSON array of centreIds
 * they're limited to (empty = unscoped = every centre, today's behaviour).
 * Returns the CENTRE NAMES in scope, or null when unscoped. Names are what the
 * free-text `centre` columns store, so callers filter with a simple IN (names).
 */
function admin_centre_names_in_scope(array $requester): ?array {
    $scope = safe_json((string)($requester['centreScope'] ?? ''));
    if (!is_array($scope) || empty($scope)) return null;
    $scope = array_values(array_filter(array_map('strval', $scope)));
    if (!$scope) return null;
    $ph = implode(',', array_fill(0, count($scope), '?'));
    $rows = db_all("SELECT name FROM centres WHERE centreId IN ($ph)", $scope);
    return array_map(fn($r) => (string)$r['name'], $rows);
}

/** The centre IDS in a requester's scope, or null when unscoped. */
function admin_centre_ids_in_scope(array $requester): ?array {
    $scope = safe_json((string)($requester['centreScope'] ?? ''));
    if (!is_array($scope)) return null;
    $scope = array_values(array_filter(array_map('strval', $scope)));
    return $scope ?: null;
}

/** Is a given centre name within a requester's scope? Unscoped ⇒ always true. */
function admin_centre_allowed(array $requester, ?string $centreName): bool {
    $names = admin_centre_names_in_scope($requester);
    if ($names === null) return true;
    return $centreName !== null && $centreName !== '' && in_array($centreName, $names, true);
}

/**
 * May this admin act on this particular member?
 *
 * THE HOLE THIS CLOSES. `admin_members_list` filters the roster by the
 * requester's centre scope, so a club admin scoped to one centre sees only
 * their own people and the screen looks contained. Every per-member
 * operation behind that screen took a memberId and checked nothing: the
 * full 360° record — journal entries with mood and body, date of birth,
 * parent name, email and phone, school — was readable for any child in the
 * organisation by anyone holding the `people` capability, and the same
 * applied to editing them, recording a guardian's consent decision, and
 * promoting them to volunteer.
 *
 * A filtered list over unfiltered operations is worse than no scoping at
 * all, because it looks like containment. Nobody audits a boundary they
 * believe is already there.
 *
 * Unscoped admins (super_admin, admin) are unaffected — scope is null for
 * them and everything returns true, as before.
 *
 * A member with no centre is OUT of a scoped admin's reach. Treating blank
 * as "everybody's" would make every unassigned record a way around the
 * boundary, and new members are created unassigned.
 *
 * @return array{ok: bool, error?: string, detail?: string, member?: array}
 */
function admin_member_scope_gate(array $requester, string $memberId, ?array $member = null): array {
    $names = admin_centre_names_in_scope($requester);
    $member = $member ?? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    /* A scoped admin is told the same thing for an id that does not exist as
       for one outside their centres. Answering not_found for one and
       out_of_scope for the other would confirm, id by id, which members
       exist elsewhere in the organisation. */
    if (!$member) return $names === null ? ['ok' => false, 'error' => 'not_found']
        : ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'That member is not in a centre you administer.'];
    if ($names === null) return ['ok' => true, 'member' => $member];

    $centre = trim((string)($member['centre'] ?? ''));
    if ($centre === '' || !in_array($centre, $names, true)) {
        /* Deliberately the same shape as not_found would give, so the
           refusal does not confirm that a member with this id exists —
           an admin probing ids should learn nothing from the difference. */
        return ['ok' => false, 'error' => 'out_of_scope',
                'detail' => 'That member is not in a centre you administer.'];
    }

    return ['ok' => true, 'member' => $member];
}

/**
 * May this admin file a member INTO this centre?
 *
 * The create-side of the same boundary: without it a scoped admin could add
 * a member to somebody else's centre, or leave the centre blank and put
 * them beyond their own reach a moment later.
 */
function admin_centre_write_allowed(array $requester, ?string $centreName): bool {
    $names = admin_centre_names_in_scope($requester);
    if ($names === null) return true;
    $centreName = trim((string)$centreName);

    return $centreName !== '' && in_array($centreName, $names, true);
}

/** ISO-week period tag, e.g. '2026-W29' — the cadence for V3 ratings/champions. */
function iso_week_period(?int $t = null): string {
    $t = $t ?? time();
    return gmdate('o', $t) . '-W' . gmdate('W', $t);
}

/** All capabilities of a member row: role caps + any per-member extras (RBAC
 *  editor). Extras only augment an existing staff member; they never make a
 *  plain member into staff (is_admin_role still gates console access by role). */
function member_effective_caps(array $m): array {
    $caps = admin_role_caps($m['role'] ?? '');
    $extra = isset($m['capsExtra']) ? safe_json((string)$m['capsExtra']) : null;
    if (is_array($extra)) foreach ($extra as $c) { if (is_string($c) && $c !== '' && !in_array($c, $caps, true)) $caps[] = $c; }
    return $caps;
}

/** Any staff role (can reach the admin console; capabilities gate the rest). */
function is_admin_role($role): bool {
    return admin_role_caps($role) !== [];
}

function setting_get(string $key) {
    $row = db_row('SELECT settingValue FROM settings WHERE settingKey = ?', [$key]);
    return $row ? safe_json($row['settingValue']) : null;
}

/** Raw string setting value (for scalar settings that aren't JSON objects). */
/**
 * Memoise an expensive read on disk for a few seconds.
 *
 * For endpoints that are POLLED rather than requested: the public board is
 * refreshed by a screen at every centre, so at a hundred centres the same
 * figures are recomputed a hundred times a minute from the same rows. One
 * computation per window serves all of them.
 *
 * Deliberately crude — a file and an mtime, no daemon to install. Failure at
 * any point falls through to computing it, so a read-only cache directory
 * degrades to today's behaviour instead of an outage.
 *
 * A stale entry is served if the recompute throws, because a board that is
 * thirty seconds out of date is worth more than an error page.
 */
/** The memo file for a key — one definition, so a reader and a writer cannot
 *  disagree about where it lives. */
function cache_path(string $key): string {
    global $CONFIG;
    return ($CONFIG['cache_dir'] ?? sys_get_temp_dir()) . '/_memo/'
         . preg_replace('/[^a-z0-9_.-]/i', '', $key) . '.json';
}

/** Read a memo without computing anything. Null on a miss, an expired entry, or
 *  a stamp that no longer matches. For callers that need to know whether a
 *  cached answer EXISTS — an expensive job that should be offered rather than
 *  silently started, say — which cache_remember cannot express. */
function cache_get(string $key, int $ttl = 0, string $stamp = '') {
    $path = cache_path($key);
    $age = @filemtime($path);
    if (!$age) return null;
    if ($ttl > 0 && (time() - $age) >= $ttl) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $hit = json_decode($raw, true);
    if (!is_array($hit)) return null;
    if (isset($hit['__v'], $hit['__d'])) return (string)$hit['__v'] === $stamp ? $hit['__d'] : null;
    return $stamp === '' ? $hit : null;
}

/** Text from outside made valid UTF-8: a server's error line in Windows-1252 or Latin-1 reads as it was meant, not as an encode failure. */
function text_utf8(string $s): string {
    if ($s === '' || mb_check_encoding($s, 'UTF-8')) return $s;
    $c = @mb_convert_encoding($s, 'UTF-8', 'Windows-1252');
    return is_string($c) && mb_check_encoding($c, 'UTF-8') ? $c : (string)mb_scrub($s, 'UTF-8');
}

/** Forget a memo, so the next read recomputes it. */
function cache_delete(string $key): void { @unlink(cache_path($key)); }

/** Write a memo directly. Same write-then-rename as cache_remember, so a
 *  concurrent reader never sees half a file. */
function cache_put(string $key, $value, string $stamp = ''): bool {
    if (!is_array($value)) return false;
    $path = cache_path($key);
    @mkdir(dirname($path), 0755, true);
    $tmp = $path . '.' . getmypid() . '.tmp';
    $store = $stamp === '' ? $value : ['__v' => $stamp, '__d' => $value];
    if (@file_put_contents($tmp, json_encode($store, JSON_UNESCAPED_SLASHES)) === false) return false;
    return @rename($tmp, $path);
}

function cache_remember(string $key, int $ttl, callable $fn, string $stamp = '') {
    global $CONFIG;
    $dir = ($CONFIG['cache_dir'] ?? sys_get_temp_dir()) . '/_memo';
    $path = $dir . '/' . preg_replace('/[^a-z0-9_.-]/i', '', $key) . '.json';
    $age = @filemtime($path);
    if ($age && (time() - $age) < $ttl) {
        $raw = @file_get_contents($path);
        if ($raw !== false) {
            $hit = json_decode($raw, true);
            /* `stamp` lets a caller bypass the window when the underlying data
             * has demonstrably changed. Time alone is the wrong rule for
             * anything with a safeguarding property attached: a guardian who
             * withdraws consent must drop off the public board on the next
             * request, not whenever a timer happens to expire. */
            if (is_array($hit) && isset($hit['__v']) && isset($hit['__d'])) {
                if ((string)$hit['__v'] === $stamp) return $hit['__d'];
            } elseif (is_array($hit) && $stamp === '') {
                return $hit;
            }
        }
    }
    try {
        $fresh = $fn();
    } catch (\Throwable $e) {
        /* Serve whatever we last had rather than failing the request — but not
         * forever, and not silently.
         *
         * Unbounded, this degrades from "a board thirty seconds out of date" to
         * "a board from last March": if the builder keeps throwing, the same
         * ancient payload is served indefinitely and the only trace is an
         * error_log line nobody reads. A stale window of 10× the TTL keeps the
         * intended graceful degradation over a transient fault while making a
         * persistent one surface as a real failure.
         *
         * The event is journalled as a warning, so Diagnostics can say "serving
         * stale public_status, 4h old" instead of the site quietly lying. */
        $age = @filemtime($path);
        $staleFor = $age ? time() - $age : PHP_INT_MAX;
        $maxStale = max($ttl * 10, 300);
        $raw = $staleFor <= $maxStale ? @file_get_contents($path) : false;
        $stale = $raw === false ? null : json_decode($raw, true);
        if (is_array($stale) && isset($stale['__d'])) $stale = $stale['__d'];
        if (is_array($stale)) {
            error_log('[cache] serving stale ' . $key . ' (' . $staleFor . 's): ' . $e->getMessage());
            if (function_exists('ops_record')) {
                ops_record('warn', 'cache:' . $key, 'serving stale (' . $staleFor . 's old)', $e->getMessage());
            }
            return $stale;
        }
        if (function_exists('ops_record')) {
            ops_record('error', 'cache:' . $key, 'no usable cache, request failed', $e->getMessage());
        }
        throw $e;
    }
    if (is_array($fresh)) {
        @mkdir($dir, 0755, true);
        // Write-then-rename, so a concurrent reader never sees half a file.
        $tmp = $path . '.' . getmypid() . '.tmp';
        $store = $stamp === '' ? $fresh : ['__v' => $stamp, '__d' => $fresh];
        if (@file_put_contents($tmp, json_encode($store, JSON_UNESCAPED_SLASHES)) !== false) @rename($tmp, $path);
    }
    return $fresh;
}

/* ── Idempotent intake ────────────────────────────────────────────────────────
 *
 * Run $fn at most once for a given client-minted $submissionId, and replay the
 * stored result for every later attempt with the same id.
 *
 * This is what makes retrying an intake form safe, and therefore what makes an
 * offline outbox possible. Without it a retry after a timeout either created a
 * second child or tripped the name+parent-contact duplicate heuristic and
 * reported a failure for a registration that had actually worked.
 *
 * Three cases, in the order they matter:
 *
 *  - No usable id → run $fn exactly as before. An older cached bundle that
 *    knows nothing about submissionId keeps working; this is additive.
 *  - A COMPLETED id → replay the stored result. Retry #2 returns the studentId
 *    that retry #1 created, so the family sees the success that already exists.
 *  - An in-flight id → refuse with 'in_flight'. The claim is inserted BEFORE
 *    the work, and the UNIQUE index makes that atomic, so two concurrent
 *    submissions of the same form cannot both register a child. A claim
 *    abandoned by a died request is reclaimable after IDLE seconds — otherwise
 *    a crash mid-submit would lock that family out permanently.
 *
 * Only success is retained. A refusal releases the key, because a family
 * correcting a validation error resubmits with the SAME id and must not be
 * handed the old refusal for ever.
 */
const INTAKE_CLAIM_IDLE = 120;

function intake_submission_id(string $raw): string {
    $sid = trim($raw);
    return preg_match('/^[A-Za-z0-9_-]{8,64}$/', $sid) ? $sid : '';
}

function intake_once(string $submissionId, string $op, callable $fn): array {
    $sid = intake_submission_id($submissionId);
    if ($sid === '') return $fn();

    $row = db_row('SELECT status, resultJson, createdAt FROM intake_submissions WHERE submissionId = ?', [$sid]);
    if ($row) {
        if ((string)$row['status'] === 'done') {
            $prev = json_decode((string)$row['resultJson'], true);
            // `replayed` lets a caller tell "already done" from "just done" —
            // the form can then say "already sent" rather than claim it sent twice.
            if (is_array($prev) && !empty($prev['ok'])) return ['replayed' => true] + $prev;
            // A 'done' row we cannot decode is not worth blocking a family over.
            db_exec('DELETE FROM intake_submissions WHERE submissionId = ?', [$sid]);
        } else {
            $age = time() - (strtotime((string)$row['createdAt']) ?: 0);
            if ($age < INTAKE_CLAIM_IDLE) return ['ok' => false, 'error' => 'in_flight'];
            // Stale claim from a request that died. Take it over.
            db_update('intake_submissions', ['createdAt' => now_iso()], ['submissionId' => $sid]);
        }
    } else {
        try {
            db_insert('intake_submissions', ['submissionId' => $sid, 'op' => $op,
                'status' => 'pending', 'resultJson' => '', 'createdAt' => now_iso(), 'completedAt' => '']);
        } catch (Throwable $e) {
            // Lost the insert race: the other request owns this submission.
            return ['ok' => false, 'error' => 'in_flight'];
        }
    }

    try {
        $res = $fn();
    } catch (Throwable $e) {
        db_exec('DELETE FROM intake_submissions WHERE submissionId = ?', [$sid]);
        throw $e;
    }

    if (!empty($res['ok'])) {
        db_update('intake_submissions', ['status' => 'done', 'completedAt' => now_iso(),
            'resultJson' => json_encode($res, JSON_UNESCAPED_SLASHES)], ['submissionId' => $sid]);
    } else {
        db_exec('DELETE FROM intake_submissions WHERE submissionId = ?', [$sid]);
    }
    return $res;
}

function setting_raw(string $key): ?string {
    $row = db_row('SELECT settingValue FROM settings WHERE settingKey = ?', [$key]);
    return $row ? (string)$row['settingValue'] : null;
}

function setting_set(string $key, $value, string $by = ''): void {
    db_upsert('settings',
        ['settingKey' => $key, 'settingValue' => $value === null ? '' : (is_array($value) ? json_encode($value, JSON_UNESCAPED_SLASHES) : (string)$value), 'updatedAt' => now_iso(), 'updatedBy' => $by],
        ['settingKey'],
        ['settingValue' => $value === null ? '' : (is_array($value) ? json_encode($value, JSON_UNESCAPED_SLASHES) : (string)$value), 'updatedAt' => now_iso(), 'updatedBy' => $by]
    );
}

// ── Sessions (TONI / MEDI / SUMMER / DOMI) ───────────────────────────────────

const SESSION_DEFAULTS = [
    'TONI'   => ['sm' => 1, 'sd' => 6,  'em' => 3,  'ed' => 29],
    'MEDI'   => ['sm' => 4, 'sd' => 6,  'em' => 6,  'ed' => 28],
    'SUMMER' => ['sm' => 7, 'sd' => 6,  'em' => 8,  'ed' => 30],
    'DOMI'   => ['sm' => 9, 'sd' => 7,  'em' => 12, 'ed' => 13],
];

function iso_date($d): string {
    $s = (string)($d ?? '');
    if ($s === '') return '';
    $ts = strtotime($s);
    if ($ts === false) return $s;
    return gmdate('Y-m-d', $ts);
}

function ensure_year(int $year): int {
    $existing = db_all('SELECT * FROM sessions WHERE year = ?', [$year]);
    $have = [];
    foreach ($existing as $s) $have[strtoupper((string)$s['code'])] = true;

    $created = 0;
    foreach (SESSION_DEFAULTS as $code => $d) {
        if (!empty($have[$code])) continue;
        db_insert('sessions', [
            'sessionId' => $code . '-' . $year,
            'code' => $code, 'year' => $year, 'name' => $code,
            'startDate' => sprintf('%04d-%02d-%02d', $year, $d['sm'], $d['sd']),
            'endDate'   => sprintf('%04d-%02d-%02d', $year, $d['em'], $d['ed']),
            'theme' => '', 'isActive' => 0, 'coverUrl' => '',
            'notes' => 'Auto-seeded with defaults — edit dates and theme as needed.',
            'createdAt' => now_iso(), 'updatedAt' => now_iso(),
        ]);
        $created++;
    }

    // Recompute isActive by today's date.
    $today = gmdate('Y-m-d');
    foreach (db_all('SELECT * FROM sessions WHERE year = ?', [$year]) as $s) {
        $want = ($today >= iso_date($s['startDate']) && $today <= iso_date($s['endDate'])) ? 1 : 0;
        if ((int)$s['isActive'] !== $want) {
            db_update('sessions', ['isActive' => $want, 'updatedAt' => now_iso()], ['id' => $s['id']]);
        }
    }
    return $created;
}

function week_of_session(array $s): int {
    $start = strtotime(iso_date($s['startDate']));
    $today = time();
    if ($start === false || $today < $start) return 0;
    $w = (int)floor(($today - $start) / 86400 / 7) + 1;
    return max(1, $w);
}

function total_weeks(array $s): int {
    $start = strtotime(iso_date($s['startDate']));
    $end = strtotime(iso_date($s['endDate']));
    if ($start === false || $end === false) return 1;
    $days = (int)ceil(($end - $start) / 86400);
    return max(1, (int)ceil($days / 7));
}

/**
 * The badges a member can earn, with the threshold that earns each one.
 *
 * One catalogue: the award test and the human label live together, so a badge
 * cannot be granted under a name nothing can display — which is what happened
 * before. The dashboard was handed six slugs and showed only a COUNT, because
 * the words for them existed nowhere on either side.
 *
 * `metric` is which running total the threshold is read against. Order is the
 * order they appear on a member's record.
 */
const MEMBER_BADGES = [
    'first-mission' => ['label' => 'First mission',   'metric' => 'xp',        'at' => 100],
    'half-k-club'   => ['label' => '500 XP',          'metric' => 'xp',        'at' => 500],
    'one-k-club'    => ['label' => '1,000 XP',        'metric' => 'xp',        'at' => 1000],
    'week-streak'   => ['label' => '7-day streak',    'metric' => 'streak',    'at' => 7],
    'month-streak'  => ['label' => '30-day streak',   'metric' => 'streak',    'at' => 30],
    'week-finisher' => ['label' => 'A dozen missions', 'metric' => 'completed', 'at' => 12],
];

/** Which badges these totals have earned, in catalogue order. */
function member_badges_for(int $xp, int $streak, int $completed): array {
    $have = ['xp' => $xp, 'streak' => $streak, 'completed' => $completed];
    $out = [];
    foreach (MEMBER_BADGES as $id => $b) {
        if (($have[$b['metric']] ?? 0) >= (int)$b['at']) $out[] = $id;
    }
    return $out;
}

/** id => label, for a screen that has earned ids and no words for them. */
function member_badge_labels(): array {
    $out = [];
    foreach (MEMBER_BADGES as $id => $b) $out[$id] = (string)$b['label'];
    return $out;
}

function public_session(array $s): array {
    return [
        'sessionId' => $s['sessionId'],
        'code' => $s['code'],
        'year' => (int)$s['year'],
        'name' => $s['name'] ?: $s['code'],
        'startDate' => iso_date($s['startDate']),
        'endDate' => iso_date($s['endDate']),
        'theme' => $s['theme'] ?? '',
        'isActive' => to_bool($s['isActive']),
        'coverUrl' => normalize_image_url($s['coverUrl'] ?? ''),
        'weekOf' => week_of_session($s),
        'totalWeeks' => total_weeks($s),
    ];
}

/** { current, next, all } — mirrors Apps Script Session_current. */
function session_current(): array {
    $year = (int)gmdate('Y');
    ensure_year($year);
    $all = db_all('SELECT * FROM sessions WHERE year = ? ORDER BY startDate', [$year]);
    $today = gmdate('Y-m-d');
    $current = null; $next = null;
    foreach ($all as $s) {
        $start = iso_date($s['startDate']); $end = iso_date($s['endDate']);
        if ($today >= $start && $today <= $end) $current = $s;
        if ($today < $start && ($next === null || $start < iso_date($next['startDate']))) $next = $s;
    }
    return [
        'current' => $current ? public_session($current) : null,
        'next' => $next ? public_session($next) : null,
        'all' => array_map('public_session', $all),
    ];
}

// ── Member stats recompute ───────────────────────────────────────────────────

function recompute_member_stats(string $memberId): void {
    $sc = session_current();
    $sessionId = $sc['current']['sessionId'] ?? '';
    $all = db_all('SELECT * FROM member_progress WHERE memberId = ?', [$memberId]);

    $xp = 0;
    foreach ($all as $r) $xp += (int)$r['xpAwarded'];
    $level = intdiv($xp, 250) + 1;

    $completed = 0;
    foreach ($all as $r) {
        if ((string)$r['sessionId'] === (string)$sessionId && $r['status'] === 'verified') $completed++;
    }

    // Streak — distinct verified days walking back from today.
    $days = [];
    foreach ($all as $r) {
        if ($r['status'] === 'verified' && $r['verifiedAt']) $days[substr((string)$r['verifiedAt'], 0, 10)] = true;
    }
    $streak = 0; $cursor = time();
    for ($i = 0; $i < 365; $i++) {
        $key = gmdate('Y-m-d', $cursor);
        if (isset($days[$key])) { $streak++; $cursor -= 86400; }
        else {
            if ($streak === 0) { // allow today empty
                $cursor -= 86400;
                if (!isset($days[gmdate('Y-m-d', $cursor)])) break;
                $streak++; $cursor -= 86400;
            } else break;
        }
    }

    $badges = member_badges_for($xp, $streak, $completed);

    $week = $sc['current'] ? week_of_session($sc['current']) : 1;
    $row = [
        'memberId' => $memberId,
        'xpTotal' => $xp, 'level' => $level,
        'badgeCount' => count($badges), 'badges' => json_encode($badges),
        'streak' => $streak, 'lastActiveAt' => now_iso(),
        'currentWeek' => min(12, $week), 'completedThisSession' => $completed,
        'updatedAt' => now_iso(),
    ];
    $upd = $row; unset($upd['memberId']);
    db_upsert('member_stats', $row, ['memberId'], $upd);
}

// ── TOTP (RFC 6238, HMAC-SHA1) ───────────────────────────────────────────────

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function rand_base32(int $bytes): string {
    $s = '';
    $n = (int)ceil($bytes * 8 / 5);
    for ($i = 0; $i < $n; $i++) $s .= B32_ALPHABET[random_int(0, 31)];
    return $s;
}

function base32_decode(string $s): string {
    $s = preg_replace('/[^A-Z2-7]/', '', strtoupper($s)) ?? '';
    $bits = ''; $out = '';
    for ($i = 0, $len = strlen($s); $i < $len; $i++) {
        $v = strpos(B32_ALPHABET, $s[$i]);
        if ($v === false) continue;
        $bits .= str_pad(decbin($v), 5, '0', STR_PAD_LEFT);
    }
    for ($i = 0; $i + 8 <= strlen($bits); $i += 8) {
        $out .= chr(bindec(substr($bits, $i, 8)));
    }
    return $out;
}

function totp_code(string $secret, int $counter): string {
    $key = base32_decode($secret);
    $bin = pack('N*', 0) . pack('N*', $counter); // 8-byte big-endian counter
    $hash = hash_hmac('sha1', $bin, $key, true);
    $offset = ord($hash[strlen($hash) - 1]) & 0xf;
    $val = ((ord($hash[$offset]) & 0x7f) << 24) |
           ((ord($hash[$offset + 1]) & 0xff) << 16) |
           ((ord($hash[$offset + 2]) & 0xff) << 8) |
           (ord($hash[$offset + 3]) & 0xff);
    return str_pad((string)($val % 1000000), 6, '0', STR_PAD_LEFT);
}

function totp_verify(string $secret, string $code, int $window = 1): bool {
    $code = preg_replace('/\s+/', '', $code) ?? '';
    if ($code === '') return false;
    $now = intdiv(time(), 30);
    for ($drift = -$window; $drift <= $window; $drift++) {
        if (hash_equals(totp_code($secret, $now + $drift), $code)) return true;
    }
    return false;
}

// ── Serializers (strip sensitive columns, match SPA shape) ───────────────────

function public_member(array $m): array {
    return [
        'memberId' => $m['memberId'],
        'fullName' => $m['fullName'],
        'email' => $m['email'],
        'type' => $m['type'],
        'status' => $m['status'],
        'role' => $m['role'] ?: 'member',
        'centre' => $m['centre'],
        'photoUrl' => normalize_image_url($m['photoUrl'] ?? ''),
        'track' => $m['track'],
        'displayId' => $m['displayId'] ?? '',
        'disciplines' => $m['disciplines'] ?? '',
        'level' => $m['level'] ?? '',
        /* The division id (brief §5). The id, not the name: every surface
           that shows it resolves the mandate and the colour from the
           doctrine, so the wording lives in one place and a rename does
           not have to travel through the API. */
        'division' => $m['division'] ?? '',
        'cohort' => $m['cohort'],
        'bio' => $m['bio'],
        'socials' => safe_json($m['socials'] ?? null),
        'phone' => $m['phone'] ?? '',
        'school' => $m['school'] ?? '',
        'joinDate' => $m['joinDate'] ? (string)$m['joinDate'] : '',
        'parentEmail' => $m['parentEmail'] ?? '',
        'hasPassword' => !empty($m['passwordHash']),
        'caps' => member_effective_caps($m),
        'capsExtra' => is_array(safe_json($m['capsExtra'] ?? null)) ? safe_json($m['capsExtra']) : [],
        'centreScope' => is_array(safe_json($m['centreScope'] ?? null)) ? safe_json($m['centreScope']) : [],
        'needsTotp' => is_admin_role($m['role']) && empty($m['totpSecret']),
    ];
}

function public_mentor(array $m): array {
    return [
        'mentorId' => $m['mentorId'],
        'fullName' => $m['fullName'],
        'tracks' => array_values(array_filter(array_map('trim', explode(',', (string)($m['tracks'] ?? ''))))),
        'centre' => $m['centre'],
        'bio' => $m['bio'],
        'photoUrl' => normalize_image_url($m['photoUrl'] ?? ''),
    ];
}

function public_event(array $e): array {
    return [
        'eventId' => $e['eventId'],
        'title' => $e['title'],
        'kind' => $e['kind'],
        'startAt' => $e['startAt'],
        'endAt' => $e['endAt'],
        'centre' => $e['centre'],
        'location' => $e['location'],
        'coverUrl' => normalize_image_url($e['coverUrl'] ?? ''),
        'body' => $e['body'],
        'capacity' => (int)($e['capacity'] ?? 0),
        'isPublic' => to_bool($e['isPublic'] ?? 0),
    ];
}

function public_notification(array $n): array {
    return [
        'notifId' => $n['notifId'],
        'kind' => $n['kind'],
        'title' => $n['title'],
        'body' => $n['body'],
        'linkPage' => $n['linkPage'],
        // The id of the thing this notification is about (a post, today), so
        // the client can open it instead of dropping the member in a feed.
        'linkRef' => (string)($n['linkRef'] ?? ''),
        'readAt' => $n['readAt'] ?: '',
        'createdAt' => $n['createdAt'],
        'action' => notification_action($n),
        'broadcast' => (string)($n['memberId'] ?? '') === '*',
    ];
}

function public_post(array $p, bool $includeBody = false): array {
    $out = [
        'postId' => $p['postId'],
        'slug' => $p['slug'],
        'kind' => $p['kind'],
        'title' => $p['title'],
        'excerpt' => $p['excerpt'],
        'coverUrl' => normalize_image_url($p['coverUrl'] ?? ''),
        'category' => $p['category'],
        'authorId' => $p['authorId'],
        'tags' => array_values(array_filter(array_map('trim', explode(',', (string)($p['tags'] ?? ''))))),
        'featured' => to_bool($p['featured'] ?? 0),
        'publishAt' => $p['publishAt'] ?: $p['createdAt'],
        'promo' => $p['kind'] === 'promo' ? ['cta' => $p['promoCta'], 'url' => $p['promoUrl'], 'expires' => $p['promoExpires']] : null,
    ];
    if ($includeBody) $out['body'] = $p['body'];
    return $out;
}

function admin_event(array $e): array {
    return [
        'eventId' => $e['eventId'], 'title' => $e['title'], 'kind' => $e['kind'],
        'status' => $e['status'] ?: 'draft', 'startAt' => $e['startAt'], 'endAt' => $e['endAt'],
        'centre' => $e['centre'], 'location' => $e['location'], 'coverUrl' => $e['coverUrl'] ?: '',
        'body' => $e['body'] ?: '', 'capacity' => (int)($e['capacity'] ?? 0), 'isPublic' => to_bool($e['isPublic'] ?? 0),
    ];
}

function admin_post(array $p, bool $includeBody = false): array {
    $out = [
        'postId' => $p['postId'], 'slug' => $p['slug'], 'kind' => $p['kind'],
        'status' => $p['status'] ?: 'draft', 'title' => $p['title'], 'excerpt' => $p['excerpt'] ?: '',
        'coverUrl' => $p['coverUrl'] ?: '', 'category' => $p['category'] ?: '', 'tags' => (string)($p['tags'] ?? ''),
        'featured' => to_bool($p['featured'] ?? 0), 'authorId' => $p['authorId'] ?: '', 'publishAt' => $p['publishAt'] ?: '',
        'createdAt' => $p['createdAt'] ?: '', 'promoCta' => $p['promoCta'] ?: '', 'promoUrl' => $p['promoUrl'] ?: '',
        'promoExpires' => $p['promoExpires'] ?: '',
    ];
    if ($includeBody) $out['body'] = $p['body'] ?: '';
    return $out;
}

/** Flip scheduled draft posts whose publishAt has passed. */
function flip_scheduled_posts(): void {
    db_exec("UPDATE posts SET status='published' WHERE status='draft' AND publishAt != '' AND publishAt IS NOT NULL AND publishAt <= ?", [now_iso()]);
}

// ── base64url (shared by session cookies + Anchor Circle tokens) ────────────
function b64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}
function b64url_decode(string $s): string {
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return (string)base64_decode(strtr($s, '-_', '+/'));
}

/* ── What kind of thing did a member just attach? ──────────────────────────
 *
 * One definition, shared by the upload signer (which has to pick a Cloudinary
 * resource type before the bytes move) and the post validator (which has to
 * agree, after the fact, that what arrived is something we allow). Two
 * independent opinions about "is this a document" is how a PDF ends up stored
 * as a PNG in the first place, so there is deliberately only one.
 */

/** Document extensions a member may attach to a community post. */
const UPLOAD_DOC_EXTS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                         'txt', 'csv', 'rtf', 'odt', 'ods', 'odp', 'zip'];

/**
 * Normalise a client-declared media kind to one this server will sign.
 * Anything unrecognised is treated as an image — the old behaviour, and the
 * safest of the four, because it is the most transformed.
 */
function upload_media_kind(string $kind): string {
    $k = strtolower(trim($kind));
    return in_array($k, ['image', 'video', 'pdf', 'raw'], true) ? $k : 'image';
}

/** The lowercase extension of a URL or filename, without the dot ('' if none). */
function upload_ext(string $urlOrName): string {
    $path = (string)(parse_url(trim($urlOrName), PHP_URL_PATH) ?: trim($urlOrName));
    return preg_match('/\.([a-z0-9]{1,5})$/i', $path, $m) ? strtolower($m[1]) : '';
}

/** Is this a document we accept as an attachment? */
function upload_is_doc_ext(string $ext): bool {
    return in_array(strtolower($ext), UPLOAD_DOC_EXTS, true);
}

/* ── Subject-keyed attempt guard ───────────────────────────────────────────
 *
 * The limiter above keys on the client IP, which is the right shape for "one
 * caller must not flood us" and the wrong shape for "this secret must not be
 * guessable". An IP is a claim (see client_ip()), and even an honest one is
 * shared by a whole centre's WiFi — so it is simultaneously spoofable by an
 * attacker and unfair to a classroom.
 *
 * This guards the other way round: it counts failures against the THING BEING
 * GUESSED — an admin's second factor, a gate's password, a guardian invite
 * code. Whoever is guessing and from wherever, the code itself stops answering.
 * That is the property that survives a forged header.
 *
 * It lives here rather than beside rate_limit_check() because that file is
 * loaded by the endpoint layer, and these ceilings belong to the domain logic
 * that enforces them — a guard the test harness cannot see is a guard nobody
 * can prove works.
 *
 * Deliberately not merged into rate_limit_check(): the two answer different
 * questions and the failure modes differ. Exhausting an IP bucket should back
 * a busy centre off for a minute; exhausting a subject guard should lock one
 * account for fifteen and say so in the audit log.
 */

/** Is this subject currently locked out? */
/**
 * The sign-in forms carry a field no person can see or reach (`hp`). A person
 * leaves it empty; a script that fills every input does not. Tripped → the
 * request is refused with the same generic error a server fault gives, so the
 * script learns nothing about why. Called from the pre-session routes only.
 */
function bot_trap_tripped(array $body): bool {
    return trim((string)($body['hp'] ?? '')) !== '';
}

function attempt_locked(string $scope, string $subject): bool {
    if ($subject === '') return false;
    $r = db_row('SELECT lockedUntil FROM attempt_guard WHERE scope = ? AND subject = ? LIMIT 1',
                [$scope, $subject]);
    $until = (string)($r['lockedUntil'] ?? '');
    return $until !== '' && strtotime($until) > time();
}

/**
 * Record one failed attempt. Returns true if that failure tripped the lock.
 *
 * The counter resets on lock rather than continuing to climb, so the lock is a
 * fixed cost per $max guesses rather than an ever-growing one — long enough to
 * make guessing hopeless, short enough that a member who fat-fingered their
 * code three times is not shut out for the evening.
 */
function attempt_fail(string $scope, string $subject, int $max = 8, int $lockSeconds = 900): bool {
    if ($subject === '') return false;
    $now = now_iso();
    $r = db_row('SELECT id, fails FROM attempt_guard WHERE scope = ? AND subject = ? LIMIT 1',
                [$scope, $subject]);
    $n = (int)($r['fails'] ?? 0) + 1;
    $tripped = $n >= max(1, $max);
    $patch = ['fails' => $tripped ? 0 : $n, 'updatedAt' => $now,
              'lockedUntil' => $tripped ? gmdate('Y-m-d\TH:i:s\Z', time() + $lockSeconds) : ''];
    if ($r) db_update('attempt_guard', $patch, ['id' => (int)$r['id']]);
    else    db_insert('attempt_guard', $patch + ['scope' => $scope, 'subject' => $subject]);
    return $tripped;
}

/** Clear the count after a success — a correct answer ends the suspicion. */
function attempt_reset(string $scope, string $subject): void {
    if ($subject === '') return;
    db_exec('DELETE FROM attempt_guard WHERE scope = ? AND subject = ?', [$scope, $subject]);
}

/** Drop rows nobody has touched in a day. Called from the daily GC. */
function attempt_guard_gc(): void {
    db_exec('DELETE FROM attempt_guard WHERE updatedAt < ?',
            [gmdate('Y-m-d\TH:i:s\Z', time() - 86400)]);
}

/* ── Trusted-proxy CIDR maths ──────────────────────────────────────────────
 * Pure functions over strings, so they live here rather than in bootstrap.php
 * (which emits headers on load and therefore cannot be required by the test
 * harness) — the same reasoning that moved b64url here. client_ip() stays in
 * bootstrap.php because it reads request state; the ARITHMETIC it depends on
 * is testable in isolation, and a CIDR check nobody can test is a CIDR check
 * nobody should rely on.
 */

/** Is $ip inside any of these CIDR ranges (or an exact address)? */
function ip_is_trusted_proxy(string $ip, array $ranges): bool {
    if ($ip === '' || !$ranges || !filter_var($ip, FILTER_VALIDATE_IP)) return false;
    foreach ($ranges as $range) {
        if (ip_in_cidr($ip, (string)$range)) return true;
    }
    return false;
}

/** IPv4/IPv6 CIDR membership. A bare address is treated as a /32 or /128. */
function ip_in_cidr(string $ip, string $cidr): bool {
    $cidr = trim($cidr);
    if ($cidr === '') return false;
    $bits = null;
    if (strpos($cidr, '/') !== false) [$cidr, $bits] = explode('/', $cidr, 2);
    $net = @inet_pton(trim($cidr));
    $addr = @inet_pton($ip);
    if ($net === false || $addr === false || strlen($net) !== strlen($addr)) return false;

    $maxBits = strlen($net) * 8;
    $bits = ($bits === null || $bits === '') ? $maxBits : (int)$bits;
    if ($bits < 0 || $bits > $maxBits) return false;

    $whole = intdiv($bits, 8);
    if ($whole > 0 && strncmp($net, $addr, $whole) !== 0) return false;
    $rem = $bits % 8;
    if ($rem === 0) return true;
    $mask = chr(0xFF << (8 - $rem) & 0xFF);
    return (($net[$whole] & $mask) === ($addr[$whole] & $mask));
}
