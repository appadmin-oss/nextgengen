<?php
declare(strict_types=1);

/**
 * Member self-service — the statement, the record, and the things a member asks
 * the desk for.
 *
 * ── THE LINE THIS FILE DOES NOT CROSS ────────────────────────────────────────
 * fees.php says it plainly: "a member confirming their own payment is not a
 * thing this ledger will ever accept." That stays true. A payment claim here is
 * a REQUEST — the member telling the desk to go and look for a transfer — and
 * it never touches `member_ledger`. Approving one posts the payment through the
 * ordinary admin path (`fees_post`), so money enters an account by exactly one
 * route and the ledger goes on meaning "what the desk has seen".
 *
 * The same shape covers the other three kinds, because they share a life:
 * raised by the member, read by an admin, decided once, with the reason kept.
 *
 * ── WHAT A MEMBER MAY SEE ────────────────────────────────────────────────────
 * Their own record, and nothing derived from anybody else's. Every function
 * takes the memberId from the SESSION, never from the request body — there is
 * no `?memberId=` on any member route in this file, which is what stops the
 * whole thing being an enumeration endpoint.
 *
 * @see api/_lib/domain/fees.php  the ledger these read from
 * @see api/member/requests.php   the member's route in
 * @see api/admin/requests.php    the desk's queue
 */

/** The kinds a member may raise, and what each is called on screen. */
const MEMBER_REQUEST_KINDS = [
    'payment' => 'Payment made',
    'appeal'  => 'Appeal',
    'leave'   => 'Leave of absence',
    /* Academic leave: weeks away for school exams or a school programme,
       approved by the desk with the school's letter where there is one. Its
       days are not absences — not logged, not fined, and not counted against
       the absence limit — unlike a leave of absence, which excuses an absence
       but still counts. */
    'academic' => 'Academic leave',
    'idcard'  => 'Replacement ID card',
    /* The member portal's profile is read-only ("Managed by NGG"): a wrong
       name, school or guardian number is asked for here, checked with the
       family by the desk, and corrected in the Control Room. */
    'details' => 'Correct my details',
    'mentor'  => 'Change of mentor',
    'help'    => 'Tell us about something',
    /* An idea, a change, something they love. Its own kind so it has its own
       cap: three ideas once filled the `help` cap and the fourth thing that
       child sent — "something happened at school" — was refused. Raised only
       through member_feedback_create(), never member_request_create(). */
    'feedback' => 'Idea or feedback',
    /* Raised by a parent through the family account only (FAMILY_REQUEST_KINDS):
       a question for the mentor, a change to the family's own details, and a
       change to who may collect the child. Profile and collectors are
       read-only to a family, so these are how they change. */
    'askmentor'     => 'Question for the mentor',
    'familydetails' => 'Change family details',
    'collect'       => 'Change who can collect',
];

/** What a piece of feedback is about, and what the desk sees for each. */
const MEMBER_FEEDBACK_TOPICS = ['experience' => 'How NGG is going for me', 'idea' => 'An idea', 'change' => 'Something to change',
    'love' => 'Something I love', 'app' => 'Something in the portal isn’t working'];

/** The words for an experience rating, 1 to 5 — what the desk reads beside the number. */
const MEMBER_FEEDBACK_RATINGS = [1 => 'Not good', 2 => 'Not great', 3 => 'Okay', 4 => 'Good', 5 => 'Great'];

/** Feedback is cheap to give and should be: more of it may wait than requests. */
const MEMBER_FEEDBACK_OPEN_MAX = 6;

/** Shorter than this is not something the desk can act on ("Chess"). */
const MEMBER_FEEDBACK_MIN = 6;

const MEMBER_REQUEST_STATUSES = ['open', 'approved', 'declined', 'withdrawn'];

/* Absences, as the policy engine already counts them (docs/POLICY.md §1.1:
 * "Maximum two (2) absences for the whole program … valid, verified
 * emergencies only"). The allowance is the member band's `absenceLimit`
 * (Settings → Policy, 2 by default) and the count is the engine's own
 * (policy_state: absences logged, two half-days as one). A leave request is
 * an absence announced in advance, so its programme days still ahead count
 * too — or several could be filed at once and all approved. */

/** The member's programme days from $from to $to — their centre's meeting days, on the calendar when it is set. */
function member_excuse_days(array $m, string $from, string $to): array {
    if ($from === '' || $to === '' || $from > $to) return [];
    $cfg = function_exists('member_calendar_for') ? member_calendar_for($m) : [];
    if (!empty($cfg['enabled']) && function_exists('programme_days_between')) return programme_days_between($from, $to, $cfg);
    // No calendar set: the meeting weekdays (Saturday by default), so a weekday is not a programme absence.
    $wd = array_map('intval', (array)($cfg['weekdays'] ?? [])) ?: [6];
    $out = [];
    for ($t = (int)strtotime($from . ' 00:00:00 UTC'), $end = (int)strtotime($to . ' 00:00:00 UTC'), $i = 0; $t <= $end && $i < 400; $t += 86400, $i++) {
        if (in_array((int)gmdate('N', $t), $wd, true)) $out[] = gmdate('Y-m-d', $t);
    }
    return $out;
}

/** The longest academic leave one request may cover, in days (a school's exam season, not a term out). */
const MEMBER_ACADEMIC_MAX_DAYS = 70;

/**
 * What covers a member's absence on $date: 'academic' (approved academic
 * leave — not an absence), 'approved' (excused), 'open' (asked, not yet
 * decided — no fine until it is), 'declined' (asked and refused), or ''
 * (nobody asked). The strongest cover wins when requests overlap.
 */
function member_absence_cover(string $memberId, string $date): string {
    $best = '';
    $rank = ['' => 0, 'declined' => 1, 'open' => 2, 'approved' => 3, 'academic' => 4];
    foreach (db_all("SELECT kind, status FROM member_requests WHERE memberId = ? AND kind IN ('leave', 'academic') AND status IN ('open', 'approved', 'declined')
                     AND fromDate <> '' AND fromDate <= ? AND (CASE WHEN toDate = '' THEN fromDate ELSE toDate END) >= ?", [$memberId, $date, $date]) as $r) {
        $c = (string)$r['status'] === 'approved' && (string)$r['kind'] === 'academic' ? 'academic' : (string)$r['status'];
        if ($rank[$c] > $rank[$best]) $best = $c;
    }
    return $best;
}

/** {used, max, left, recorded, ahead, days[]}: the engine's absences plus the days still ahead on open or approved leave. */
function member_excuses(array $m): array {
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    if (function_exists('policy_is_session') && policy_is_session('member')) return member_excuses_session($m, $today);
    $st = function_exists('policy_state') ? policy_state((string)$m['memberId'], 'member') : ['absences' => 0, 'absenceLimit' => 2];
    $limit = (int)($st['absenceLimit'] ?? (function_exists('policy_for') ? (int)policy_for('member')['absenceLimit'] : 2));
    $recorded = (int)($st['absences'] ?? 0);
    $logged = array_flip(array_column(db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'absence' AND (voidedAt IS NULL OR voidedAt = '')", [(string)$m['memberId']]), 'date'));
    $ahead = [];
    foreach (db_all("SELECT fromDate, toDate FROM member_requests WHERE memberId = ? AND kind = 'leave' AND status IN ('open', 'approved') AND fromDate <> ''
                     AND (CASE WHEN toDate = '' THEN fromDate ELSE toDate END) >= ?", [(string)$m['memberId'], $today]) as $r) {
        $to = (string)$r['toDate'] !== '' ? (string)$r['toDate'] : (string)$r['fromDate'];
        foreach (member_excuse_days($m, max((string)$r['fromDate'], $today), $to) as $d) if (!isset($logged[$d])) $ahead[$d] = true;
    }
    $used = $recorded + count($ahead);
    $fine = function_exists('policy_enabled_for') && policy_enabled_for('member') ? (int)(policy_for('member')['absenceFine'] ?? 0) : 0;
    return ['used' => $used, 'max' => $limit, 'left' => max(0, $limit - $used), 'recorded' => $recorded, 'ahead' => count($ahead), 'days' => array_keys($ahead),
            'fine' => $fine];   // ₦ for an absence nobody asked about; 0 when member enforcement is off
}

/**
 * The rulebook's allowance: `permittedAbsences` absences WITH permission per
 * session, counted as the programme days that leave requests — waiting or
 * approved — cover in the session holding today. Absences without permission
 * are a different count (they lead to suspension) and are reported apart as
 * `recorded`, so a family can see both. `days` are the session's covered
 * days, which a new request is compared against so a day is never counted
 * twice.
 */
function member_excuses_session(array $m, string $today): array {
    $cfg = policy_for('member');
    [$a, $b] = policy_session_bounds((string)$m['memberId'], $today);
    $days = [];
    foreach (db_all("SELECT fromDate, toDate FROM member_requests WHERE memberId = ? AND kind = 'leave' AND status IN ('open', 'approved') AND fromDate <> ''
                     AND fromDate <= ? AND (CASE WHEN toDate = '' THEN fromDate ELSE toDate END) >= ?", [(string)$m['memberId'], $b, $a]) as $r) {
        $to = (string)$r['toDate'] !== '' ? (string)$r['toDate'] : (string)$r['fromDate'];
        foreach (member_excuse_days($m, max((string)$r['fromDate'], $a), min($to, $b)) as $d) $days[$d] = true;
    }
    $max = (int)$cfg['permittedAbsences'];
    $without = count(policy_unexcused_absences((string)$m['memberId'], $a, min($b, $today)));
    $fine = policy_enabled_for('member') ? (int)($cfg['absenceFine'] ?? 0) : 0;
    return ['used' => count($days), 'max' => $max, 'left' => max(0, $max - count($days)), 'recorded' => $without,
            'ahead' => count(array_filter(array_keys($days), static fn($d) => $d >= $today)), 'days' => array_keys($days), 'fine' => $fine,
            'session' => ['from' => $a, 'to' => $b], 'suspendAfter' => (int)$cfg['suspendAfterAbsences'], 'formalAfterDays' => (int)$cfg['formalAfterDays'],
            'rulebook' => 'session', 'rules' => policy_enabled_for('member') ? policy_member_rule_lines() : []];
}

/* ── A payment, one line per way it was paid ─────────────────────────────────
   A family paid ₦10,000 by transfer and ₦2,000 in cash to a coordinator, and
   the claim had one Reference box: the sentence went in it, and approving
   posted one ₦12,000 "claim" whose reference was a paragraph — so the bank
   statement could not be matched and the cash had no name against it. A claim
   now carries its parts, and approving posts ONE LEDGER ENTRY PER PART with
   its own method and reference. */
const MEMBER_PAYMENT_METHODS = ['transfer' => 'Bank transfer', 'cash' => 'Cash', 'pos' => 'POS', 'other' => 'Other'];
const MEMBER_PAYMENT_PARTS_MAX = 4;

/**
 * Normalise a claim's parts. $strict (a family's claim) requires the reference
 * of a transfer or POS payment and who took the cash — the two facts the desk
 * matches against; the desk's own approval may leave them out.
 * Returns ['parts' => [...], 'total' => int] or ['error' => code, 'detail' => text].
 */
function member_payment_parts($raw, bool $strict): array {
    if (!is_array($raw)) return ['parts' => [], 'total' => 0];
    $out = []; $total = 0;
    foreach (array_values($raw) as $i => $x) {
        if (!is_array($x)) continue;
        /* As a family writes it — "10,000", "₦10,000", "10k". fees_money() reads
           the comma in "10,000" as a decimal point, which made ₦10,000 ₦10. */
        $amount = is_string($x['amount'] ?? null) ? fees_fine_amount((string)$x['amount']) : fees_money($x['amount'] ?? null, 0);
        $ref = trim(mb_substr(preg_replace('/\s+/', ' ', (string)($x['reference'] ?? '')), 0, 60));
        $who = trim(mb_substr(preg_replace('/\s+/', ' ', (string)($x['receivedBy'] ?? '')), 0, 80));
        if ($amount <= 0 && $ref === '' && $who === '') continue;   // an empty line, not a bad one
        $method = (string)($x['method'] ?? '');
        if (!isset(MEMBER_PAYMENT_METHODS[$method])) return ['error' => 'bad_method', 'detail' => 'Say how each amount was paid.'];
        if ($amount <= 0) return ['error' => 'bad_amount', 'detail' => 'Give the amount for each way you paid.'];
        if ($strict && in_array($method, ['transfer', 'pos'], true) && mb_strlen($ref) < 3)
            return ['error' => 'need_reference', 'detail' => 'Give the reference for the ' . strtolower(MEMBER_PAYMENT_METHODS[$method]) . ' of ' . fees_money_text($amount) . ', so the desk can find it on the statement.'];
        if ($strict && $method === 'cash' && mb_strlen($who) < 2)
            return ['error' => 'need_receiver', 'detail' => 'Say who took the cash of ' . fees_money_text($amount) . '.'];
        $out[] = ['method' => $method, 'amount' => $amount, 'reference' => $ref, 'receivedBy' => $method === 'cash' ? $who : ''];
        $total += $amount;
    }
    if (count($out) > MEMBER_PAYMENT_PARTS_MAX) return ['error' => 'too_many_parts', 'detail' => 'At most ' . MEMBER_PAYMENT_PARTS_MAX . ' ways in one claim.'];
    return ['parts' => $out, 'total' => $total];
}
/** One part, in words: "Bank transfer ₦10,000 · ref 2108…" / "Cash ₦2,000 · to Mrs Awolaja". */
function member_payment_part_text(array $x): string {
    return (MEMBER_PAYMENT_METHODS[$x['method']] ?? $x['method']) . ' ' . fees_money_text((int)$x['amount'])
        . ($x['reference'] !== '' ? ' · ref ' . $x['reference'] : '') . (($x['receivedBy'] ?? '') !== '' ? ' · to ' . $x['receivedBy'] : '');
}

/* ── Reading a "correct my details" request ─────────────────────────────────
   Members and parents write these as they speak: "Date of birth: 08/06/2013.
   Phone number: 08098190961", or just "Parent phone number". The desk used to
   read the sentence, open the record in another tab, find the field and type
   it in. This reads the text for WHICH field and WHAT value, beside what the
   record holds now, so the desk checks a proposal and applies it in one press
   (admin_request_apply_details) — and when a field is named with no new value,
   it says so, so the reply can ask for it instead of guessing. Never applied
   by itself: a person confirms every change. */
const MEMBER_DETAIL_FIELDS = [
    // Most specific first: "parent phone" must not be read as the member's phone.
    'parentPhone' => ['Parent’s phone', '/\b(parent|guardian|mum|mom|mother|dad|father|daddy|mummy)(\'?s)?\s*(phone|number|tel|mobile|line|contact)/i'],
    'parentEmail' => ['Parent’s email', '/\b(parent|guardian|mum|mom|mother|dad|father)(\'?s)?\s*e-?mail/i'],
    'parentName'  => ['Parent’s name', '/\b(parent|guardian|mum|mom|mother|dad|father)(\'?s)?\s*name/i'],
    'dob'         => ['Date of birth', '/\b(date of birth|d\.?o\.?b|birth\s*day|birth\s*date|born)\b/i'],
    'email'       => ['Email', '/\be-?mail/i'],
    'phone'       => ['Phone', '/\b(phone|mobile|tel|telephone|line|whatsapp)(\s*(number|no))?\b|^\s*number\b/i'],
    'school'      => ['School', '/\b(school|college)\b/i'],
    'fullName'    => ['Name', '/\b(full\s*name|surname|first\s*name|last\s*name|middle\s*name|my\s*name|name|spelling)\b/i'],
];

/** A value as the record would hold it, or null when it is not a value of that kind. */
function member_detail_value(string $field, string $v): ?string {
    $v = trim(preg_replace('/\s+/', ' ', $v), " .,;:-\t");
    if ($v === '') return null;
    if ($field === 'dob') {
        // Day first, as dates are written here: 08/06/2013 is the 8th of June.
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $v, $m)) [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
        elseif (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/', $v, $m)) [$d, $mo, $y] = [(int)$m[1], (int)$m[2], (int)$m[3] < 100 ? 2000 + (int)$m[3] : (int)$m[3]];
        elseif (($t = strtotime(preg_replace('/(\d)(st|nd|rd|th)\b/i', '$1', $v) . ' 12:00 UTC')) !== false) [$y, $mo, $d] = array_map('intval', explode('-', gmdate('Y-n-j', $t)));
        else return null;
        return checkdate($mo, $d, $y) && $y >= 1950 && $y <= (int)gmdate('Y') ? sprintf('%04d-%02d-%02d', $y, $mo, $d) : null;
    }
    if ($field === 'phone' || $field === 'parentPhone') {
        $digits = preg_replace('/[^\d+]/', '', $v);
        // One shape on the record: +234 809… and 234809… are 0809…, as the rest of the roster is written.
        if (preg_match('/^\+?234(\d{10})$/', $digits, $x)) $digits = '0' . $x[1];
        return preg_match('/^\+?\d{10,14}$/', $digits) ? $digits : null;
    }
    if ($field === 'email' || $field === 'parentEmail') return filter_var($v, FILTER_VALIDATE_EMAIL) ? strtolower($v) : null;
    if (preg_match('/\d{5,}|@/', $v)) return null;   // a name or a school is not a number or an address
    return mb_strlen($v) >= 2 && mb_strlen($v) <= 120 ? $v : null;
}

/**
 * ['changes' => [{field,label,current,proposed,warn?}], 'asked' => [{field,label,current}]].
 * $kind 'familydetails' is a PARENT writing: "my phone number" is theirs, not the child's.
 */
function member_details_read(string $text, array $m, string $kind = 'details'): array {
    $changes = []; $asked = [];
    $pieces = preg_split('/\n|;|\s{2,}|\.\s+(?=[A-Za-z])|,\s+(?=(?:and\s+)?(?:my\s+|the\s+|his\s+|her\s+)?[A-Za-z\' ]{2,30}(?::|\bis\b|\bshould\b))/u', $text) ?: [];
    foreach ($pieces as $piece) {
        $piece = trim($piece); if ($piece === '') continue;
        $label = $piece; $value = '';
        if (preg_match('/^(.{2,60}?)\s*(?::|=|–|—|\bis\b|\bshould\s+(?:be|read)\b|\bto\s+be\b|\bto\b|\bas\b)\s*(.+)$/iu', $piece, $mm)) { $label = $mm[1]; $value = $mm[2]; }
        else foreach (MEMBER_DETAIL_FIELDS as [$nm, $re0]) {
            // "dob 8th June 2013": the label straight before the value, no colon.
            if (preg_match($re0, $piece, $hit, PREG_OFFSET_CAPTURE) && $hit[0][1] === 0) { $label = $hit[0][0]; $value = trim(substr($piece, strlen($hit[0][0]))); break; }
        }
        foreach (MEMBER_DETAIL_FIELDS as $field => [$name, $re]) {
            if (!preg_match($re, $label)) continue;
            if ($kind === 'familydetails') $field = ['phone' => 'parentPhone', 'email' => 'parentEmail'][$field] ?? $field;
            $name = MEMBER_DETAIL_FIELDS[$field][0];
            $cur = (string)($m[$field] ?? '');
            $val = $value !== '' ? member_detail_value($field, $value) : null;
            if ($val !== null) { if ($val !== $cur) $changes[$field] = ['field' => $field, 'label' => $name, 'current' => $cur, 'proposed' => $val]; }
            elseif (!isset($changes[$field])) $asked[$field] = ['field' => $field, 'label' => $name, 'current' => $cur, 'wrote' => $value];
            break;
        }
    }
    foreach (array_keys($changes) as $f) unset($asked[$f]);
    /* What a person checking it would notice. A child's date of birth outside
       the programme's ages is a slipped year far more often than a fact; a
       number or address another member already has is usually a sibling's — or
       a typo landing on somebody else. Said, never decided. */
    foreach ($changes as $f => &$c) {
        if ($f === 'dob') {
            $age = (int)floor((time() - (int)strtotime($c['proposed'] . ' 12:00 UTC')) / 31557600);
            if ($age < 5 || $age > 25) $c['warn'] = 'That makes them ' . $age . ' — check the year.';
        } elseif (in_array($f, ['phone', 'email', 'parentPhone', 'parentEmail'], true)) {
            $col = in_array($f, ['phone', 'parentPhone'], true) ? ['phone', 'parentPhone'] : ['email', 'parentEmail'];
            $o = db_row('SELECT fullName FROM members WHERE memberId <> ? AND (' . $col[0] . ' = ? OR ' . $col[1] . ' = ?) LIMIT 1', [(string)$m['memberId'], $c['proposed'], $c['proposed']]);
            if ($o) $c['warn'] = 'Also on ' . (string)$o['fullName'] . '’s record — a sibling, or a typo?';
        }
    }
    unset($c);
    return ['changes' => array_values($changes), 'asked' => array_values($asked)];
}

/**
 * admin.requests.applyDetails — apply a details correction and approve it, in
 * one step. The record is changed through admin_members_upsert, so every rule
 * on a member's fields (and the approval queue for a club admin) still holds;
 * only when that succeeds is the request approved, with a reply that says
 * exactly what changed.
 */
function admin_request_apply_details(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rid = trim((string)($p['requestId'] ?? ''));
    $r = db_row('SELECT * FROM member_requests WHERE requestId = ? LIMIT 1', [$rid]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array((string)$r['kind'], ['details', 'familydetails'], true)) return ['ok' => false, 'error' => 'not_details'];
    if ((string)$r['status'] !== 'open') return ['ok' => false, 'error' => 'already_decided'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'member_not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    $in = is_array($p['changes'] ?? null) ? $p['changes'] : [];
    $data = []; $said = [];
    foreach ($in as $field => $val) {
        if (!isset(MEMBER_DETAIL_FIELDS[$field])) return ['ok' => false, 'error' => 'bad_field', 'detail' => 'That is not a detail this can change: ' . $field . '.'];
        $v = member_detail_value((string)$field, (string)$val);
        if ($v === null) return ['ok' => false, 'error' => 'bad_value', 'field' => $field, 'detail' => MEMBER_DETAIL_FIELDS[$field][0] . ': “' . $val . '” is not a valid ' . strtolower(MEMBER_DETAIL_FIELDS[$field][0]) . '.'];
        if ($v === (string)($m[$field] ?? '')) continue;
        $data[$field] = $v;
        $said[] = MEMBER_DETAIL_FIELDS[$field][0] . ' → ' . ($field === 'dob' ? gmdate('j M Y', (int)strtotime($v . ' 12:00 UTC')) : $v);
    }
    if (!$data) return ['ok' => false, 'error' => 'nothing_to_change', 'detail' => 'Every value given is what the record already holds.'];
    $up = admin_members_upsert(['requesterId' => $p['requesterId'] ?? '', 'data' => ['memberId' => (string)$m['memberId']] + $data, 'ip' => $p['ip'] ?? '']);
    if (empty($up['ok'])) return $up;
    $reply = trim((string)($p['reply'] ?? ''));
    $reply = ($reply !== '' ? $reply . "\n\n" : '') . 'Updated on your record: ' . implode('; ', $said) . '.';
    $d = admin_request_decide(['requesterId' => $p['requesterId'] ?? '', 'requestId' => $rid, 'approve' => true, 'decision' => $reply, 'ip' => $p['ip'] ?? '']);
    if (empty($d['ok'])) return $d;
    audit('member.details.applied', (string)($g['requester']['memberId'] ?? ''), (string)$m['memberId'], ['requestId' => $rid, 'fields' => array_keys($data)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'changed' => array_keys($data), 'reply' => $reply];
}

/**
 * Tell the member about their request — and the parent who raised it, at the
 * address they signed in with. One place, so a decision and a message from the
 * desk reach the same people in the same words.
 */
function member_request_tell(array $r, string $title, string $what, string $body): void {
    $mm = db_row('SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    if ($mm) notify_people([$mm], [
        'kind' => 'request', 'eyebrow' => 'NGG · Your requests', 'title' => $title,
        'intro' => 'Your request “' . (string)$r['subject'] . '” ' . $what, 'body' => $body,
        'linkPage' => 'dashboard', 'ctaPath' => '/dashboard/requests', 'ctaLabel' => 'See your requests →']);
    if (str_starts_with((string)($r['raisedBy'] ?? ''), 'guardian:') && function_exists('family_mail')) {
        $gr = db_row('SELECT email FROM guardians WHERE guardianId = ? AND status = ? LIMIT 1', [substr((string)$r['raisedBy'], 9), 'active']);
        if ($gr) family_mail((string)$gr['email'], $title, [
            'title' => $title,
            'intro' => '“' . (string)$r['subject'] . '” for ' . (string)($mm['fullName'] ?? 'your ward') . ' ' . $what,
            'bodyHtml' => $body !== '' ? '<p style="margin:0 0 10px">' . nl2br(esc_html($body)) . '</p>' : '',
            'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family']);
    }
}

/** The longest one message from the desk may be. */
const MEMBER_COMMENT_MAX = 2000;
/** How many messages one request may carry — a request, not a chat. */
const MEMBER_COMMENTS_MAX = 30;

/**
 * admin.requests.comment — write to the member about their request without
 * deciding it: "We can see ₦10,000 but not the ₦2,000 cash — who took it?"
 * Kept on the request (both sides see it), and sent to them as a message.
 */
function admin_request_comment(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rid = trim((string)($p['requestId'] ?? ''));
    $r = db_row('SELECT * FROM member_requests WHERE requestId = ? LIMIT 1', [$rid]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $owner = (string)$r['memberId'] !== '' ? db_row('SELECT centre FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]) : null;
    if (!admin_centre_allowed($g['requester'], (string)($owner['centre'] ?? ($r['centre'] ?? '')))) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$r['status'] === 'withdrawn') return ['ok' => false, 'error' => 'withdrawn', 'detail' => 'They withdrew this request, so nobody would read a message on it.'];
    if ((string)$r['memberId'] === '') return ['ok' => false, 'error' => 'anonymous', 'detail' => 'This was sent without a name, so a message reaches nobody.'];
    $text = trim(mb_substr((string)($p['text'] ?? ''), 0, MEMBER_COMMENT_MAX));
    if (mb_strlen($text) < 2) return ['ok' => false, 'error' => 'empty', 'detail' => 'Write the message.'];
    $list = (array)(json_decode((string)($r['comments'] ?? ''), true) ?: []);
    if (count($list) >= MEMBER_COMMENTS_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'This request already has ' . MEMBER_COMMENTS_MAX . ' messages. Decide it, or call the family.'];
    $by = (string)($g['requester']['memberId'] ?? '');
    $first = explode(' ', trim((string)($g['requester']['fullName'] ?? '')))[0] ?? '';
    $list[] = ['at' => now_iso(), 'by' => $by, 'byName' => $first !== '' ? $first . ' at the NGG desk' : 'The NGG desk', 'text' => $text];
    db_update('member_requests', ['comments' => json_encode($list, JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['id' => (int)$r['id']]);
    member_request_tell($r, 'A message about your request', 'has a message from the desk.', $text);
    audit('member.request.comment', $by, $rid, ['kind' => (string)$r['kind'], 'chars' => mb_strlen($text)], (string)($p['ip'] ?? ''));
    $after = db_row('SELECT * FROM member_requests WHERE id = ? LIMIT 1', [(int)$r['id']]);
    return ['ok' => true, 'request' => member_request_public($after ?: [])];
}

/** Body length. Long enough to explain a circumstance, short enough that the
 *  column is a request and not a correspondence archive. */
const MEMBER_REQUEST_BODY_MAX = 2000;

/** How many open requests one member may hold at once, per kind.
 *
 *  Not a rate limit — that is separate and per-IP. This is the thing that stops
 *  a member with a grievance filing the same appeal eleven times, which buries
 *  the queue for everybody else and is nobody's fault in particular. */
const MEMBER_REQUEST_OPEN_MAX = 3;

/** Rows one listing returns. A member's own history is short; the desk's queue
 *  is paged. */
const MEMBER_REQUEST_PAGE = 50;

// ── Serialisers ──────────────────────────────────────────────────────────────

/**
 * One request, as the MEMBER sees it.
 *
 * `decidedBy` is deliberately absent. Which member of staff declined an appeal
 * is not something a child needs in order to understand the decision, and
 * naming them invites the argument to become about the person.
 */
function member_request_public(array $r): array
{
    /* A row with a feedback topic IS feedback, whatever kind an older build
       saved it under: it was showing in the inbox with Approve and Decline,
       which mean nothing for "How NGG is going for me". */
    if ((string)($r['topic'] ?? '') !== '' && isset(MEMBER_FEEDBACK_TOPICS[(string)$r['topic']])) $r['kind'] = 'feedback';
    return [
        'requestId' => (string)$r['requestId'],
        'kind'      => (string)$r['kind'],
        'kindLabel' => MEMBER_REQUEST_KINDS[(string)$r['kind']] ?? (string)$r['kind'],
        'shortNotice' => (int)($r['shortNotice'] ?? 0) === 1,   // a leave request sent under 24 hours ahead
        'status'    => (string)$r['status'],
        'subject'   => (string)($r['subject'] ?? ''),
        'body'      => (string)($r['body'] ?? ''),
        'amount'    => (int)($r['amount'] ?? 0),
        'reference' => (string)($r['reference'] ?? ''),
        'parts'     => array_map(static fn($x) => $x + ['methodLabel' => MEMBER_PAYMENT_METHODS[$x['method'] ?? ''] ?? (string)($x['method'] ?? '')],
                         (array)(json_decode((string)($r['parts'] ?? ''), true) ?: [])),
        'comments'  => array_values(array_map(static fn($c) => ['at' => (string)($c['at'] ?? ''), 'byName' => (string)($c['byName'] ?? 'The NGG desk'), 'text' => (string)($c['text'] ?? '')],
                         (array)(json_decode((string)($r['comments'] ?? ''), true) ?: []))),
        'proofUrl'  => (string)($r['proofUrl'] ?? ''),
        'paidAt'    => (string)($r['paidAt'] ?? ''),
        'fromDate'  => (string)($r['fromDate'] ?? ''),
        'toDate'    => (string)($r['toDate'] ?? ''),
        'decision'  => (string)($r['decision'] ?? ''),
        'decidedAt' => (string)($r['decidedAt'] ?? ''),
        'refSanctionId' => (int)($r['refSanctionId'] ?? 0),
        'createdAt' => (string)($r['createdAt'] ?? ''),
        'byFamily'  => (string)($r['raisedBy'] ?? '') !== '',
        'topic'     => (string)($r['topic'] ?? ''),
        'topicLabel' => MEMBER_FEEDBACK_TOPICS[(string)($r['topic'] ?? '')] ?? '',
        'rating'    => (int)($r['rating'] ?? 0),
        'ratingLabel' => MEMBER_FEEDBACK_RATINGS[(int)($r['rating'] ?? 0)] ?? '',
        'anonymous' => (string)$r['kind'] === 'feedback' && (string)($r['memberId'] ?? '') === '',
        'passedAt'  => (string)($r['passedAt'] ?? ''),
    ];
}

// ── The statement ────────────────────────────────────────────────────────────

/**
 * The account as a statement: every line, oldest first, with a running balance.
 *
 * `member.fees` already returns the entries and the totals. This is the other
 * question — "how did it get to this number" — which a list of charges without
 * a running total cannot answer, and which is the first thing anybody disputing
 * a balance actually wants.
 *
 * Two running totals, not one, because the account has two meanings:
 *   `runningPayable`  real money — membership, dues, fines, adjustments
 *   `runningTotal`    the whole account, training included
 * A statement that showed only the second would tell a family they owe ₦225,000
 * for a programme their child attends for nothing.
 */
function member_statement(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];

    $cfg = fees_settings();
    if (empty($cfg['enabled']) || (string)($m['type'] ?? '') !== 'NGG') {
        return ['ok' => true, 'enabled' => false, 'lines' => [], 'opening' => 0];
    }

    $lines = [];
    $payable = 0; $total = 0;
    foreach (fees_entries($id) as $e) {
        $void   = trim((string)($e['voidedAt'] ?? '')) !== '';
        $kind   = (string)$e['kind'];
        $amount = (int)$e['amount'];
        $charge = (string)$e['direction'] === 'charge';
        /* Notional lines move the whole-account total and not the payable one:
           the training fee is the cost of a place, and a write-off settles it. */
        $real   = $kind !== 'training' && $kind !== 'writeoff';

        if (!$void) {
            $total   += $charge ? $amount : -$amount;
            if ($real) $payable += $charge ? $amount : -$amount;
        }
        $lines[] = [
            'date'      => substr((string)$e['createdAt'], 0, 10),
            'kind'      => $kind,
            'note'      => (string)$e['note'],
            'charge'    => $charge ? $amount : 0,
            'credit'    => $charge ? 0 : $amount,
            'real'      => $real,
            /* A voided line stays on the statement, struck through and excluded
               from the totals. Deleting it would leave a member unable to
               reconcile a figure they were quoted last month. */
            'void'      => $void,
            'voidReason' => $void ? (string)($e['voidReason'] ?? '') : '',
            'runningPayable' => $payable,
            'runningTotal'   => $total,
        ];
    }

    /* A member who left before completing owes what service had not earned
       off. It is not a ledger row (it moves as nothing — it is the rest of a
       charge already on the account), so it closes the statement as a line of
       its own, and the payable total agrees with every other screen. */
    $bal  = fees_balance($m, $cfg);
    $owed = (int)($bal['trainingOwed'] ?? 0);
    if ($owed > 0) {
        $payable += $owed;
        $lines[] = ['date' => gmdate('Y-m-d'), 'kind' => 'training', 'note' => 'Training fee not earned off — left before the MOU was complete',
                    'charge' => $owed, 'credit' => 0, 'real' => true, 'void' => false, 'voidReason' => '',
                    'runningPayable' => $payable, 'runningTotal' => $total];
    }

    return ['ok' => true, 'enabled' => true,
            'currency' => (string)$cfg['currency'],
            'member' => ['fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                         'centre' => (string)($m['centre'] ?? ''), 'level' => (string)($m['level'] ?? '')],
            'lines' => $lines,
            'closingPayable' => $payable, 'closingTotal' => $total,
            /* What the payable is made of, the same lines the family's Fees page
               shows (fees_owed_made) — the money screen said only "membership,
               dues and any fines" beside the total. */
            'owed' => fees_owed_made($m, $cfg, null, $bal)['lines'],
            /* The training place, in the words a member is owed about it. The
               money screen used to print "MOU done" for every member, including
               one a month into the programme — so it reads the record now. */
            'training' => [
                'cost'     => (int)($bal['trainingCharged'] ?? 0),
                'covered'  => (int)($bal['programmeCovered'] ?? 0),
                'owed'     => $owed,
                'mouDone'  => trim((string)($m['mouAt'] ?? '')) !== '' || !empty($bal['tenure']['graduated']),
                'mouAt'    => (string)($m['mouAt'] ?? ''),
                'left'     => !empty($bal['tenure']['left']),
            ]];
}

// ── The record ───────────────────────────────────────────────────────────────

/**
 * A member's own attendance and awards — the things they might be asked to
 * evidence to somebody outside the programme.
 *
 * Attendance is joined against the programme calendar rather than reported raw,
 * because "present 14 times" answers nothing without the denominator, and a
 * denominator of "days the programme ran" is the only honest one. Where no
 * calendar is configured the rate is withheld rather than invented — see
 * `rateKnown`.
 */
function member_records(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];

    $days = db_all("SELECT date, checkInAt, checkOutAt, method FROM attendance
                     WHERE studentId = ? ORDER BY date DESC LIMIT 400", [$id]);

    $cal = function_exists('member_calendar_for') ? member_calendar_for($m) : ['enabled' => false];
    $ran = 0; $onDays = null;
    $today = attendance_today();
    [$termStart, $termEnd] = !empty($cal['enabled']) && function_exists('programme_term_bounds') ? programme_term_bounds($today, $cal) : ['', ''];
    $rateKnown = !empty($cal['enabled']) && $termStart !== '';
    if ($rateKnown) {
        $joined = substr((string)($m['joinDate'] ?? ''), 0, 10);
        $from = ($joined !== '' && $joined > $termStart) ? $joined : $termStart;
        $to = $today;
        if ($termEnd !== '' && $termEnd < $to) $to = $termEnd;
        $progDays = programme_days_between($from, $to, $cal);
        $ran = count($progDays);
        // Only scans on those days count towards the rate — a scan before
        // they joined, or on a day the centre does not meet, is not one.
        $flip = array_flip($progDays);
        $onDays = count(array_filter($days, static fn($d) => isset($flip[(string)$d['date']])));
    }

    $certs = [];
    foreach (db_all("SELECT certId, cohortId, daysPresent, attendanceRate, issuedAt, revokedAt
                       FROM student_certs WHERE studentId = ? ORDER BY issuedAt DESC", [$id]) as $c) {
        $certs[] = ['certId' => (string)$c['certId'], 'issuedAt' => (string)$c['issuedAt'],
                    'daysPresent' => (int)$c['daysPresent'], 'attendanceRate' => (int)$c['attendanceRate'],
                    'revoked' => trim((string)($c['revokedAt'] ?? '')) !== ''];
    }

    // A day with no sign-out is a half-day by the rule: say so, not "present".
    $incomplete = array_column(db_all("SELECT date FROM infractions WHERE personId = ? AND kind IN ('absence','halfday') AND note LIKE 'Incomplete%' AND (voidedAt IS NULL OR voidedAt = '')", [$id]), 'date', 'date');
    $present = count($days);
    return ['ok' => true, 'attendance' => [
        'present' => $present,
        'daysRan' => $ran,
        /* Withheld rather than guessed: a percentage over an unknown
           denominator is a number somebody will quote in an application. */
        'rateKnown' => $rateKnown && $ran > 0,
        'rate' => ($rateKnown && $ran > 0) ? (int)round(min($ran, (int)$onDays) / $ran * 100) : null,
        'days' => array_map(fn($d) => [
            'date' => (string)$d['date'],
            'in' => substr((string)($d['checkInAt'] ?? ''), 11, 5),
            'out' => substr((string)($d['checkOutAt'] ?? ''), 11, 5),
            'method' => (string)($d['method'] ?? ''),
        ] + (isset($incomplete[(string)$d['date']]) ? ['status' => 'no sign-out, a half-day'] : []), $days),
    ], 'certificates' => $certs, 'member' => [
        'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
        'centre' => (string)($m['centre'] ?? ''), 'level' => (string)($m['level'] ?? ''),
        'joinDate' => (string)($m['joinDate'] ?? ''), 'status' => (string)($m['status'] ?? ''),
    ]];
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** A member's own requests, newest first. */
function member_requests_list(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    if ($id === '') return ['ok' => false, 'error' => 'not_found'];
    $rows = db_all('SELECT * FROM member_requests WHERE memberId = ? ORDER BY id DESC LIMIT ' . MEMBER_REQUEST_PAGE, [$id]);
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    return ['ok' => true, 'requests' => array_map('member_request_public', $rows),
            'kinds' => MEMBER_REQUEST_KINDS,
            // Excused absences this session, of the two allowed (POLICY §1.1).
            'excuses' => $m ? array_diff_key(member_excuses($m), ['days' => 1]) : null];
}

/**
 * Raise one.
 *
 * Validation is per kind because the kinds are not the same shape: a payment
 * claim without an amount is not a claim, and a leave request without dates is
 * not a request. Saying which field is missing — rather than a flat "invalid" —
 * is the difference between a member fixing it and a member giving up.
 */
/**
 * NOTICE FOR A LEAVE REQUEST (owner, 14 Nov 2026: "a notice for leave requests less than 24 hrs ahead, as they
 * will not be approved — but still allow it to send, because it could be a verifiable emergency").
 *
 * Measured from the first programme day the request excuses, at the time members must arrive by
 * (policy_for('member')['lateRedline'], 09:00 by default), Lagos time. Never a refusal: the request is saved
 * and the desk decides. The answer is recorded on the request when it is sent (member_requests.shortNotice),
 * so the desk sees the notice the family actually gave, not a figure recomputed later.
 */
const MEMBER_LEAVE_NOTICE_HOURS = 24;
function member_leave_notice(string $firstDay, ?int $now = null): array
{
    $redline = function_exists('policy_for') ? (string)(policy_for('member')['lateRedline'] ?? '09:00') : '09:00';
    if (!preg_match('/^\d{2}:\d{2}$/', $redline)) $redline = '09:00';
    $starts = (int)strtotime($firstDay . 'T' . $redline . ':00+01:00');
    $deadline = $starts - MEMBER_LEAVE_NOTICE_HOURS * 3600;
    $now ??= time();
    return ['short' => $now > $deadline, 'starts' => gmdate('c', $starts), 'deadline' => gmdate('c', $deadline),
            'hoursAhead' => (int)floor(($starts - $now) / 3600), 'redline' => $redline];
}

function member_request_create(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT memberId, fullName, centre FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];

    $kind = (string)($p['kind'] ?? '');
    if (!isset(MEMBER_REQUEST_KINDS[$kind])) return ['ok' => false, 'error' => 'unknown_kind'];
    if ($kind === 'feedback') return member_feedback_create($p);
    /* A payment is confirmed by the parent who made it, from the family
       account. From their own app a member asks their parent instead
       (member_family_nudge): a child is not the one who knows the reference. */
    if ($kind === 'payment' && !empty($p['fromMember'])) {
        return ['ok' => false, 'error' => 'ask_parent', 'detail' => 'Your parent confirms a payment from their family account. Ask them from Money → Ask my parent.'];
    }

    $open = (int)(db_row("SELECT COUNT(*) c FROM member_requests WHERE memberId = ? AND kind = ? AND status = 'open'",
                         [$id, $kind])['c'] ?? 0);
    if ($open >= MEMBER_REQUEST_OPEN_MAX) {
        return ['ok' => false, 'error' => 'too_many_open',
                'detail' => 'You already have ' . $open . ' of these waiting for a reply. The desk will answer them in turn.'];
    }

    $body = trim(substr((string)($p['body'] ?? ''), 0, MEMBER_REQUEST_BODY_MAX));
    $row = [
        'requestId' => 'REQ-' . strtoupper(bin2hex(random_bytes(5))),
        'memberId' => $id, 'kind' => $kind, 'status' => 'open',
        'subject' => trim(substr((string)($p['subject'] ?? ''), 0, 200)),
        'body' => $body,
        'amount' => 0, 'reference' => '', 'proofUrl' => '', 'paidAt' => '',
        'fromDate' => '', 'toDate' => '', 'refEntryId' => '',
        'decision' => '', 'decidedBy' => '', 'decidedAt' => '', 'ledgerEntryId' => '',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
        /* Set only by family_request_create() — the member route passes an
           explicit field list, so a member cannot claim a parent raised it. */
        'raisedBy' => preg_match('/^guardian:GDN-[A-F0-9]{10}$/', (string)($p['raisedBy'] ?? '')) ? (string)$p['raisedBy'] : '',
    ];

    if ($kind === 'payment') {
        $pp = member_payment_parts($p['parts'] ?? null, true);
        if (isset($pp['error'])) return ['ok' => false, 'error' => $pp['error'], 'detail' => $pp['detail']];
        $amount = $pp['parts'] ? $pp['total'] : fees_money($p['amount'] ?? null, 0);
        if ($amount <= 0) return ['ok' => false, 'error' => 'bad_amount', 'detail' => 'How much did you pay?'];
        $row['amount'] = $amount;
        $row['reference'] = trim(substr((string)($p['reference'] ?? ''), 0, 120));
        if ($pp['parts']) {
            $row['parts'] = json_encode($pp['parts'], JSON_UNESCAPED_UNICODE);
            // The searchable reference is the parts' own references, not a sentence.
            $refs = array_values(array_filter(array_map(static fn($x) => $x['reference'], $pp['parts'])));
            if ($refs) $row['reference'] = mb_substr(implode(' · ', $refs), 0, 120);
        }
        $row['paidAt'] = substr(trim((string)($p['paidAt'] ?? '')), 0, 10);
        /* An uploaded receipt, if there is one. Stored as the URL the upload
           path already returned — this never accepts raw bytes, so the one
           image-handling surface in the product stays the one that is hardened. */
        $u = trim((string)($p['proofUrl'] ?? ''));
        $row['proofUrl'] = preg_match('#^https?://#i', $u) || str_starts_with($u, '/api/public/photo.php') ? $u : '';
        if ($row['subject'] === '') $row['subject'] = 'Payment of ' . fees_money_text($amount);
    } elseif ($kind === 'academic') {
        $row['fromDate'] = substr(trim((string)($p['fromDate'] ?? '')), 0, 10);
        $row['toDate'] = substr(trim((string)($p['toDate'] ?? '')), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $row['fromDate']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $row['toDate'])) return ['ok' => false, 'error' => 'bad_dates', 'detail' => 'Academic leave needs a first and a last day.'];
        if ($row['toDate'] < $row['fromDate']) return ['ok' => false, 'error' => 'bad_dates', 'detail' => 'The last day can’t be before the first.'];
        $span = (int)((strtotime($row['toDate']) - strtotime($row['fromDate'])) / 86400) + 1;
        if ($span > MEMBER_ACADEMIC_MAX_DAYS) return ['ok' => false, 'error' => 'too_long', 'detail' => 'Academic leave covers at most ' . intdiv(MEMBER_ACADEMIC_MAX_DAYS, 7) . ' weeks at a time. Ask again for the rest.'];
        if (mb_strlen($body) < 10) return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Say what it is for — the exams or the school programme, and the school.'];
        $u = trim((string)($p['proofUrl'] ?? ''));
        $row['proofUrl'] = preg_match('#^https?://#i', $u) || str_starts_with($u, '/api/public/photo.php') ? $u : '';
        if ($row['subject'] === '') $row['subject'] = 'Academic leave from ' . $row['fromDate'] . ' to ' . $row['toDate'];
    } elseif ($kind === 'leave') {
        $row['fromDate'] = substr(trim((string)($p['fromDate'] ?? '')), 0, 10);
        $row['toDate'] = substr(trim((string)($p['toDate'] ?? '')), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $row['fromDate'])) return ['ok' => false, 'error' => 'bad_dates', 'detail' => 'When does the leave start?'];
        if ($row['toDate'] !== '' && $row['toDate'] < $row['fromDate']) [$row['fromDate'], $row['toDate']] = [$row['toDate'], $row['fromDate']];
        if ($body === '') return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Say why, so the desk can answer without asking.'];
        /* The allowance: two excused absences a session, counted in programme
           days. A request that would take it past two is refused whole, with
           what is left, rather than half-granted by the desk later. */
        $full = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]) ?: $m;
        /* "An absence extending beyond three consecutive weeks requires a
           formal written application" — the dashboard request is for the
           ordinary absence, and says where the long one goes instead. */
        if (function_exists('policy_is_session') && policy_is_session('member')) {
            $span = (int)((strtotime(($row['toDate'] !== '' ? $row['toDate'] : $row['fromDate']) . ' UTC') - strtotime($row['fromDate'] . ' UTC')) / 86400) + 1;
            $formal = (int)policy_for('member')['formalAfterDays'];
            if ($span > $formal) return ['ok' => false, 'error' => 'formal_application',
                'detail' => 'An absence longer than ' . $formal . ' days (' . intdiv($formal, 7) . ' weeks) needs a formal written application to the management, not a dashboard request. For exams, ask for academic leave instead.'];
        }
        $asked = member_excuse_days($full, $row['fromDate'], $row['toDate'] !== '' ? $row['toDate'] : $row['fromDate']);
        if (!$asked) return ['ok' => false, 'error' => 'no_programme_day', 'detail' => 'There is no NGG day between those dates, so there is nothing to excuse.'];
        $ex = member_excuses($full);
        $new = array_values(array_diff($asked, $ex['days']));
        if ($ex['used'] + count($new) > $ex['max']) {
            return ['ok' => false, 'error' => 'excuse_limit', 'excuses' => array_diff_key($ex, ['days' => 1]),
                'detail' => 'Only ' . $ex['max'] . ' absences ' . (($ex['rulebook'] ?? '') === 'session' ? 'with permission are accepted in a session' : 'are allowed in the programme') . ', and ' . $ex['used'] . ' ' . ($ex['used'] === 1 ? 'is' : 'are') . ' already counted. '
                    . ($ex['left'] ? 'These dates cover ' . count($new) . '.' : 'There are none left.') . ' Speak to the centre if this is an emergency.'];
        }
        // Fewer than 24 hours before the first day it excuses: sent, flagged, not refused.
        $row['shortNotice'] = member_leave_notice($new ? $new[0] : $asked[0])['short'] ? 1 : 0;
        if ($row['subject'] === '') $row['subject'] = 'Leave from ' . $row['fromDate'];
    } elseif (in_array($kind, ['details', 'mentor', 'help', 'askmentor', 'familydetails', 'collect'], true)) {
        if (mb_strlen($body) < (in_array($kind, ['askmentor', 'familydetails', 'collect'], true) ? 5 : 6)) return ['ok' => false, 'error' => 'need_reason', 'detail' => [
            'details' => 'Say what is wrong and what it should be.', 'mentor' => 'Say what is not working, so the coordinator can help.',
            'help' => 'Tell us what happened.', 'askmentor' => 'Write your question first.', 'familydetails' => 'Say what has changed.',
            'collect' => 'Give the name, how they are related and their phone number.'][$kind]];
        if ($row['subject'] === '') $row['subject'] = MEMBER_REQUEST_KINDS[$kind];
    } elseif ($kind === 'appeal') {
        if ($body === '') return ['ok' => false, 'error' => 'need_reason', 'detail' => 'An appeal needs the reason it is being appealed.'];
        /* Which charge, if they picked one. Checked against their OWN ledger so
           a reference to somebody else's entry cannot be attached. */
        $ref = trim((string)($p['refEntryId'] ?? ''));
        if ($ref !== '' && db_row('SELECT id FROM member_ledger WHERE entryId = ? AND memberId = ? LIMIT 1', [$ref, $id])) {
            $row['refEntryId'] = $ref;
        }
        /* Or a SANCTION of theirs — a warning, Dormant Track, a suspension, an
           eviction, a fine. Their own, still standing, and not already under
           appeal: one appeal per decision, so the desk decides it once. */
        $sid = (int)($p['refSanctionId'] ?? 0);
        if ($sid > 0) {
            $sn = db_row("SELECT id, kind, reason, status FROM sanctions WHERE id = ? AND personId = ? LIMIT 1", [$sid, $id]);
            if (!$sn) return ['ok' => false, 'error' => 'not_found', 'detail' => 'That decision is not on this record.'];
            if (!in_array((string)$sn['status'], ['active', 'proposed', 'pending'], true)) return ['ok' => false, 'error' => 'not_standing', 'detail' => 'That decision no longer stands, so there is nothing to appeal.'];
            if (db_row("SELECT id FROM member_requests WHERE kind = 'appeal' AND refSanctionId = ? AND status = 'open' LIMIT 1", [$sid]))
                return ['ok' => false, 'error' => 'already_appealed', 'detail' => 'This is already under appeal. You will be told the decision.'];
            $row['refSanctionId'] = $sid;
            if ($row['subject'] === '') $row['subject'] = 'Appeal: ' . (POLICY_APPEAL_WORDS[(string)$sn['kind']] ?? (string)$sn['kind']);
        }
        if ($row['subject'] === '') $row['subject'] = 'Appeal';
    } elseif ($kind === 'idcard') {
        if ($row['subject'] === '') $row['subject'] = 'Replacement ID card';
    }

    db_insert('member_requests', $row);
    audit('member.request.create', $id, $row['requestId'], ['kind' => $kind], (string)($p['ip'] ?? ''));
    // A parent who says they paid hears at once that it arrived, and what happens next (dues-notices.php).
    if ($kind === 'payment' && function_exists('dues_claim_ack')) dues_claim_ack($row);
    /* The desk is told once, when it is raised. Not on every edit — a queue
       that pings is a queue that gets muted. */
    // …and the people who can decide it, at the member's centre: the bell, a push, and an email (push.php).
    $centre = (string)($m['centre'] ?? '');
    staff_inbox_alert('requests', ['centre' => $centre, 'exclude' => [$id],
        'who' => (string)$m['fullName'] . ($row['raisedBy'] !== '' ? ' (from ' . (string)($p['raisedByName'] ?? 'their family') . ')' : ''),
        'what' => (MEMBER_REQUEST_KINDS[$kind] ?? 'Request') . ': ' . $row['subject'],
        'body' => $row['body'] !== '' ? mb_substr((string)$row['body'], 0, 400) : '']);
    if (function_exists('event_emit')) {
        event_emit('member.request.raised', ['requestId' => $row['requestId'], 'memberId' => $id,
            'kind' => $kind, 'subject' => $row['subject'], 'fullName' => (string)$m['fullName']]);
    }
    return ['ok' => true, 'request' => member_request_public($row)];
}

/**
 * Feedback from a member: an idea, something to change, something they love.
 *
 * `anonymous` keeps the member off the row: memberId is blank and only their
 * centre is kept, so the desk of that centre still sees it and a scoped admin
 * elsewhere does not. It is still raised from a signed-in session, so the
 * per-member rate limit on the route holds for it; what anonymity removes is
 * the name, not the limit. It never goes through the public contact form,
 * which needs an email address a child sending it without a name has not got.
 */
function member_feedback_create(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT memberId, fullName, centre FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $topic = (string)($p['topic'] ?? '');
    if (!isset(MEMBER_FEEDBACK_TOPICS[$topic])) $topic = 'idea';
    $body = trim(mb_substr((string)($p['body'] ?? ''), 0, MEMBER_REQUEST_BODY_MAX));
    $rating = $topic === 'experience' ? (int)($p['rating'] ?? 0) : 0;
    if ($topic === 'experience' && !isset(MEMBER_FEEDBACK_RATINGS[$rating])) {
        return ['ok' => false, 'error' => 'need_rating', 'detail' => 'Pick how it is going, from “Not good” to “Great”.'];
    }
    // A rating says enough on its own; words are what every other kind of feedback is.
    if ($topic !== 'experience' && mb_strlen($body) < MEMBER_FEEDBACK_MIN) {
        return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Tell us a little more, so the team knows what you mean.'];
    }
    if ($topic === 'experience' && $body !== '' && mb_strlen($body) < 2) $body = '';
    $anon = !empty($p['anonymous']);
    if (!$anon) {
        $open = (int)(db_row("SELECT COUNT(*) c FROM member_requests WHERE memberId = ? AND kind = 'feedback' AND status = 'open'", [$id])['c'] ?? 0);
        if ($open >= MEMBER_FEEDBACK_OPEN_MAX) {
            return ['ok' => false, 'error' => 'too_many_open',
                    'detail' => 'You have ' . $open . ' ideas waiting for the team to read. They will answer, and then you can send more.'];
        }
    }
    $centre = (string)($m['centre'] ?? '');
    $row = [
        'requestId' => 'REQ-' . strtoupper(bin2hex(random_bytes(5))),
        'memberId' => $anon ? '' : $id, 'kind' => 'feedback', 'status' => 'open',
        'subject' => MEMBER_FEEDBACK_TOPICS[$topic] . ($rating ? ' · ' . MEMBER_FEEDBACK_RATINGS[$rating] : ''), 'body' => $body, 'topic' => $topic, 'centre' => $centre, 'rating' => $rating,
        'amount' => 0, 'reference' => '', 'proofUrl' => '', 'paidAt' => '',
        'fromDate' => '', 'toDate' => '', 'refEntryId' => '',
        'decision' => '', 'decidedBy' => '', 'decidedAt' => '', 'ledgerEntryId' => '', 'raisedBy' => '', 'passedAt' => '',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ];
    db_insert('member_requests', $row);
    // The audit names nobody when the child asked not to be named.
    audit('member.feedback.create', $anon ? '' : $id, $row['requestId'], ['topic' => $topic, 'anonymous' => $anon, 'centre' => $centre, 'rating' => $rating], '');
    /* A child who says it is "not good" or "not great" is somebody to talk to,
       so the title says so rather than reading like one more suggestion. */
    $low = $rating > 0 && $rating <= 2;
    staff_inbox_alert('requests', ['centre' => $centre, 'exclude' => $anon ? [] : [$id],
        'who' => $anon ? 'A member at ' . ($centre !== '' ? $centre : 'a centre') . ' (no name)' : (string)$m['fullName'],
        'what' => $low ? 'Says NGG is ' . strtolower(MEMBER_FEEDBACK_RATINGS[$rating]) . ' for them — somebody to talk to' : 'Feedback: ' . MEMBER_FEEDBACK_TOPICS[$topic],
        'body' => ($rating ? 'Rating: ' . $rating . ' of 5 (' . MEMBER_FEEDBACK_RATINGS[$rating] . ")\n" : '') . mb_substr($body !== '' ? $body : '(No words, just the rating.)', 0, 400)]);
    $out = member_request_public($row);
    return ['ok' => true, 'request' => $out];
}

/** Withdraw one. Only their own, only while it is still open — a decided
 *  request is a record, and a member cannot un-record a decision. */
function member_request_withdraw(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    $rid = trim((string)($p['requestId'] ?? ''));
    $r = db_row('SELECT * FROM member_requests WHERE requestId = ? AND memberId = ? LIMIT 1', [$rid, $id]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['status'] !== 'open') return ['ok' => false, 'error' => 'already_decided'];
    db_update('member_requests', ['status' => 'withdrawn', 'updatedAt' => now_iso()], ['id' => (int)$r['id']]);
    audit('member.request.withdraw', $id, $rid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── The desk's side ──────────────────────────────────────────────────────────

/** How many rows any one signal returns. The point is a working list, not an
 *  export — the roster is where a long list belongs. */
const ACCOUNTS_SIGNAL_MAX = 25;

/**
 * Who cannot get in, and who is already gone.
 *
 * Gated on `people`, like the rest of the member desk, and it ENDS accounts
 * for nobody. Whether a membership continues is settled by the MoU between
 * NGG and the family — a document, not a button — so nothing here closes an
 * account and members are not offered a way to ask. What this screen is for
 * is the opposite problem: people who are supposed to be in and cannot get
 * there.
 */
function admin_accounts_overview(array $p): array
{
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $now = now_iso();

    /* Centre scope applies here exactly as it does to the roster. A scoped
       admin seeing every locked-out account in the organisation would be a
       scope leak through a dashboard, which is the direction these usually
       arrive from. */
    $scope = admin_centre_names_in_scope($g['requester']);
    $scopeSql = ''; $scopeArgs = [];
    if ($scope !== null) {
        if (!$scope) $scopeSql = ' AND 1 = 0';
        else {
            $scopeSql = ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
            $scopeArgs = $scope;
        }
    }

    $pick = 'memberId, fullName, displayId, email, centre, status, type, role, lastLoginAt, lockedUntil, createdAt';
    $rows = function (string $where, array $args = []) use ($pick, $scopeSql, $scopeArgs) {
        return db_all("SELECT $pick FROM members WHERE $where$scopeSql ORDER BY fullName LIMIT "
                      . ACCOUNTS_SIGNAL_MAX, array_merge($args, $scopeArgs));
    };
    $count = function (string $where, array $args = []) use ($scopeSql, $scopeArgs) {
        return (int)(db_row("SELECT COUNT(*) c FROM members WHERE $where$scopeSql",
                            array_merge($args, $scopeArgs))['c'] ?? 0);
    };

    /* Locked by the failed-login guard, and still inside the window. Reading
       the clock rather than the flag: a lock that expired an hour ago is not a
       person who needs help. */
    $lockedW = "COALESCE(lockedUntil,'') > ? AND status != 'deleted'";
    /* No address at all on an ACTIVE account. Sign-in is a code by email, so
       this is not a missing detail — it is somebody who cannot get in, and who
       no dues reminder or notification has ever reached either. */
    $noWayInW = "status = 'active' AND TRIM(COALESCE(email,'')) = ''";
    /* Provisioned and never used. Distinguished from "quiet": these have never
       signed in once, which usually means the welcome mail did not arrive. */
    $neverW = "status = 'active' AND TRIM(COALESCE(lastLoginAt,'')) = ''";
    /* Staff without a second factor. The account tier that can change other
       people's records, protected by a password alone. */
    $staffNo2faW = "role IN ('editor','summer_admin','club_admin','audit','admin','super_admin')
                    AND status = 'active' AND TRIM(COALESCE(totpSecret,'')) = ''";
    $suspendedW = "status IN ('suspended','inactive')";

    $signals = [
        ['id' => 'locked', 'label' => 'Locked out right now',
         'why' => 'Too many failed sign-ins. The lock lifts by itself; clearing it is the fast way back.',
         'count' => $count($lockedW, [$now]), 'members' => $rows($lockedW, [$now])],
        ['id' => 'noWayIn', 'label' => 'No email on file',
         'why' => 'Sign-in is a code by email, so these members cannot get in at all — and no reminder has ever reached them.',
         'count' => $count($noWayInW), 'members' => $rows($noWayInW)],
        ['id' => 'neverSignedIn', 'label' => 'Never signed in',
         'why' => 'Provisioned but never used once. Usually a welcome email that did not arrive.',
         'count' => $count($neverW), 'members' => $rows($neverW)],
        ['id' => 'staffNo2fa', 'label' => 'Staff without 2FA',
         'why' => 'These accounts can change other people\'s records and are protected by a password alone.',
         'count' => $count($staffNo2faW), 'members' => $rows($staffNo2faW)],
        ['id' => 'suspended', 'label' => 'Suspended or inactive',
         'why' => 'Blocked from signing in by a decision somebody made, not by the system.',
         'count' => $count($suspendedW), 'members' => $rows($suspendedW)],
    ];

    return [
        'ok' => true,
        'signals' => $signals,
        'totals' => [
            'active' => $count("status = 'active'"),
            /* Erased records, kept as anonymised rows for referential
               integrity. Counted so the number is visible rather than a thing
               you discover; nothing on this screen creates one. Whether a
               membership ends at all is the MoU's question, not the app's. */
            'closed' => $count("status = 'deleted'"),
        ],
        'signalMax' => ACCOUNTS_SIGNAL_MAX,
        'at' => $now,
    ];
}

/**
 * Lift a login lock.
 *
 * The lock is the failed-login guard doing its job, and it expires by itself —
 * but "by itself" is fifteen minutes to a member on the phone to a centre lead,
 * and there was no way to end it. Clearing the counter with it, or the next
 * wrong guess re-locks them immediately.
 */
function admin_account_unlock(array $p): array
{
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $mid = trim((string)($p['memberId'] ?? ''));
    $m = db_row('SELECT id, memberId, fullName, centre FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    // Scope, on the way in and per row, like every other member write.
    if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) {
        return ['ok' => false, 'error' => 'out_of_scope'];
    }
    db_update('members', ['lockedUntil' => '', 'failedLogins' => 0, 'updatedAt' => now_iso()], ['id' => (int)$m['id']]);
    audit('account.unlock', (string)$g['requester']['memberId'], $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $mid, 'fullName' => (string)$m['fullName']];
}
/** The queue, and the history behind it.
 *
 *  `status` is open (the working list, and the default so the Inbox is
 *  unchanged), one of the decided statuses, or `all` / '' for every request
 *  ever raised. A request that has been approved, declined or withdrawn is
 *  a record somebody will come looking for — by its REQ- id from an alert,
 *  by the member, or by the reference on a bank statement — so `q` matches
 *  all of those, and `memberId` narrows to one person's history.
 *
 *  Centre scope is applied in the query, on the way in: a scoped admin's
 *  page, total and tally are all of their centres only. Sort is allow-listed
 *  by name; an unknown sort falls back to newest rather than failing. */
const MEMBER_REQUEST_SORTS = [
    'newest'  => 'r.id DESC',
    'oldest'  => 'r.id ASC',
    'decided' => "COALESCE(NULLIF(r.decidedAt, ''), '0') DESC, r.id DESC",
    'amount'  => 'r.amount DESC, r.id DESC',
];
const MEMBER_REQUEST_PAGE_MAX = 100;
function admin_requests_list(array $p): array
{
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $args = [];
    $status = (string)($p['status'] ?? 'open');
    if (in_array($status, MEMBER_REQUEST_STATUSES, true)) { $where[] = 'r.status = ?'; $args[] = $status; }
    $kind = (string)($p['kind'] ?? '');
    if (isset(MEMBER_REQUEST_KINDS[$kind])) { $where[] = 'r.kind = ?'; $args[] = $kind; }
    $mid = trim((string)($p['memberId'] ?? ''));
    if ($mid !== '') { $where[] = 'r.memberId = ?'; $args[] = $mid; }
    $q = trim(mb_substr((string)($p['q'] ?? ''), 0, 80));
    if ($q !== '') {
        // '!' escapes LIKE's wildcards: a backslash is itself an escape inside a MySQL string literal.
        $like = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($q)) . '%';
        $where[] = "(LOWER(r.requestId) LIKE ? ESCAPE '!' OR LOWER(r.memberId) LIKE ? ESCAPE '!' OR LOWER(COALESCE(m.fullName,'')) LIKE ? ESCAPE '!'"
                 . " OR LOWER(COALESCE(m.displayId,'')) LIKE ? ESCAPE '!' OR LOWER(r.reference) LIKE ? ESCAPE '!' OR LOWER(r.subject) LIKE ? ESCAPE '!')";
        array_push($args, $like, $like, $like, $like, $like, $like);
    }
    $scopeSql = ''; $scopeArgs = [];
    $names = admin_centre_names_in_scope($g['requester']);
    if ($names !== null) {
        // An anonymous feedback row has no member to join: its own centre scopes it.
        $scopeSql = $names ? "COALESCE(m.centre, NULLIF(r.centre,'')) IN (" . implode(',', array_fill(0, count($names), '?')) . ')' : '1 = 0';
        $scopeArgs = $names;
        $where[] = $scopeSql; $args = array_merge($args, $scopeArgs);
    }
    $from = ' FROM member_requests r LEFT JOIN members m ON m.memberId = r.memberId' . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
    $order = MEMBER_REQUEST_SORTS[(string)($p['sort'] ?? '')] ?? MEMBER_REQUEST_SORTS['newest'];
    $limit = max(1, min(MEMBER_REQUEST_PAGE_MAX, (int)($p['pageSize'] ?? MEMBER_REQUEST_PAGE) ?: MEMBER_REQUEST_PAGE));
    $offset = max(0, (int)($p['offset'] ?? 0));
    $total = (int)(db_row('SELECT COUNT(*) c' . $from, $args)['c'] ?? 0);
    $raw = db_all('SELECT r.*, m.fullName, m.displayId, m.centre AS mCentre' . $from . ' ORDER BY ' . $order . ' LIMIT ' . $limit . ' OFFSET ' . $offset, $args);
    /* Who decided it, and who raised it when a parent did — one lookup each for the page, not one per row. */
    $staff = array_values(array_unique(array_filter(array_map(static fn($r) => (string)($r['decidedBy'] ?? ''), $raw))));
    $staffNames = $staff ? array_column(db_all('SELECT memberId, fullName FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($staff), '?')) . ')', $staff), 'fullName', 'memberId') : [];
    $gids = array_values(array_unique(array_filter(array_map(static fn($r) => str_starts_with((string)($r['raisedBy'] ?? ''), 'guardian:') ? substr((string)$r['raisedBy'], 9) : '', $raw))));
    $gNames = [];
    if ($gids) foreach (db_all('SELECT guardianId, fullName, email FROM guardians WHERE guardianId IN (' . implode(',', array_fill(0, count($gids), '?')) . ')', $gids) as $gr) {
        $gNames['guardian:' . $gr['guardianId']] = trim((string)$gr['fullName']) !== '' ? (string)$gr['fullName'] : (string)$gr['email'];
    }
    /* A details correction is read against the record it would change — one
       query for the page's members, not one per row. */
    $dIds = array_values(array_unique(array_map(static fn($r) => (string)$r['memberId'], array_filter($raw, static fn($r) => in_array((string)$r['kind'], ['details', 'familydetails'], true)))));
    $dRows = $dIds ? array_column(db_all('SELECT memberId, fullName, email, phone, dob, parentName, parentEmail, parentPhone, school FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($dIds), '?')) . ')', $dIds), null, 'memberId') : [];
    $rows = array_map(static fn($r) => member_request_public($r) + (isset($dRows[(string)$r['memberId']]) && in_array((string)$r['kind'], ['details', 'familydetails'], true)
        ? ['reading' => member_details_read(trim((string)($r['subject'] ?? '') . "\n" . (string)($r['body'] ?? '')), $dRows[(string)$r['memberId']] + ['memberId' => (string)$r['memberId']], (string)$r['kind'])] : []) + [
        'memberId' => (string)$r['memberId'], 'fullName' => (string)($r['fullName'] ?? ''), 'displayId' => (string)($r['displayId'] ?? ''),
        'centre' => (string)(($r['mCentre'] ?? '') !== '' ? $r['mCentre'] : ($r['centre'] ?? '')), 'decidedBy' => (string)($r['decidedBy'] ?? ''),
        'decidedByName' => (string)($staffNames[(string)($r['decidedBy'] ?? '')] ?? ''), 'ledgerEntryId' => (string)($r['ledgerEntryId'] ?? ''),
        'updatedAt' => (string)($r['updatedAt'] ?? ''), 'raisedByName' => (string)($gNames[(string)($r['raisedBy'] ?? '')] ?? ''),
    ], $raw);
    $tally = [];
    foreach (db_all("SELECT r.kind, COUNT(*) c FROM member_requests r LEFT JOIN members m ON m.memberId = r.memberId WHERE r.status = 'open'"
                    . ($scopeSql !== '' ? ' AND ' . $scopeSql : '') . ' GROUP BY r.kind', $scopeArgs) as $t) {
        $tally[(string)$t['kind']] = (int)$t['c'];
    }
    return ['ok' => true, 'requests' => $rows, 'total' => $total, 'offset' => $offset, 'pageSize' => $limit,
            'openByKind' => $tally, 'kinds' => MEMBER_REQUEST_KINDS, 'statuses' => MEMBER_REQUEST_STATUSES];
}

/**
 * Answer a piece of feedback. Feedback is not approved or declined — an
 * "approved idea" means nothing to a child. Two answers:
 *   - `thank`: close it with a thank-you (the staff's words, or a plain one),
 *     which reaches the member unless they sent it without their name;
 *   - `pass`: send it to the centre lead(s) of that centre, and leave it open
 *     with `passedAt` set, so the desk can see where it went.
 */
const MEMBER_FEEDBACK_THANKS = 'Thank you for telling us. The team read it, and it helps us make NGG better.';

function admin_feedback_answer(array $g, array $r, string $centre, array $p): array
{
    $by = (string)($g['requester']['memberId'] ?? '');
    $rid = (string)$r['requestId'];
    $answer = (string)($p['answer'] ?? (!empty($p['approve']) ? 'thank' : ''));
    $note = trim(mb_substr((string)($p['decision'] ?? ''), 0, MEMBER_REQUEST_BODY_MAX));
    if ($answer === 'pass') {
        if ((string)($r['passedAt'] ?? '') !== '') return ['ok' => false, 'error' => 'already_passed'];
        $leads = array_values(array_filter(db_all("SELECT memberId, fullName, email, role, centreScope FROM members WHERE role = 'centre_lead' AND COALESCE(status,'') NOT IN ('suspended','deleted','merged')"),
            static fn($s) => $centre !== '' && admin_centre_allowed($s, $centre)));
        if (!$leads) return ['ok' => false, 'error' => 'no_centre_lead', 'detail' => 'Nobody holds the centre lead role for ' . ($centre !== '' ? $centre : 'this centre') . '.'];
        notify_people($leads, ['kind' => 'approval', 'title' => 'Member feedback passed to you: ' . ((string)$r['subject']),
            'intro' => 'From a member at ' . $centre . ((string)$r['memberId'] === '' ? ', sent without their name.' : '.'),
            'body' => (string)$r['body'] . ($note !== '' ? "\n\nFrom the desk: " . $note : ''),
            'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=requests', 'ctaLabel' => 'Open it →']);
        db_update('member_requests', ['passedAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$r['id']]);
        audit('member.feedback.pass', $by, $rid, ['centre' => $centre, 'leads' => count($leads)], (string)($p['ip'] ?? ''));
    } elseif ($answer === 'thank') {
        $reply = $note !== '' ? $note : MEMBER_FEEDBACK_THANKS;
        db_update('member_requests', ['status' => 'approved', 'decision' => $reply, 'decidedBy' => $by, 'decidedAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$r['id']]);
        audit('member.feedback.thank', $by, $rid, ['centre' => $centre], (string)($p['ip'] ?? ''));
        $mm = (string)$r['memberId'] !== '' ? db_row('SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]) : null;
        if ($mm) notify_people([$mm], ['kind' => 'request', 'eyebrow' => 'NGG · Your ideas',
            'title' => in_array((string)($r['topic'] ?? ''), ['idea', 'change'], true) ? 'Thank you for your idea' : 'Thank you for telling us',
            'intro' => (string)$r['body'] !== '' ? 'You told us: “' . mb_substr((string)$r['body'], 0, 120) . '”' : 'You told us: ' . (string)$r['subject'] . '.', 'body' => $reply,
            'linkPage' => 'dashboard', 'ctaPath' => '/dashboard/requests', 'ctaLabel' => 'See what you sent →']);
    } else {
        return ['ok' => false, 'error' => 'bad_answer', 'detail' => 'Feedback is thanked or passed to the centre lead.'];
    }
    $after = db_row('SELECT * FROM member_requests WHERE id = ? LIMIT 1', [(int)$r['id']]);
    return ['ok' => true, 'request' => member_request_public($after ?: [])];
}

/**
 * Decide one.
 *
 * Approving a PAYMENT claim is the only branch that moves money, and it does it
 * by calling `fees_post` exactly as the admin payment screen does — the claim is
 * evidence for a decision, never a substitute for one. The posted entry id is
 * kept on the request so the two can always be reconciled.
 *
 * A declined request needs a reason. "Declined" with no words is the thing that
 * turns a decision into a grievance.
 */
function admin_request_decide(array $p): array
{
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rid = trim((string)($p['requestId'] ?? ''));
    $r = db_row('SELECT * FROM member_requests WHERE requestId = ? LIMIT 1', [$rid]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    // Scope, on the way in: the list hides another centre's requests, and so must the decision.
    $owner = (string)$r['memberId'] !== '' ? db_row('SELECT centre FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]) : null;
    $rCentre = (string)($owner['centre'] ?? ($r['centre'] ?? ''));
    if (!admin_centre_allowed($g['requester'], $rCentre)) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$r['status'] !== 'open') return ['ok' => false, 'error' => 'already_decided'];
    if ((string)$r['kind'] === 'feedback' || ((string)($r['topic'] ?? '') !== '' && isset(MEMBER_FEEDBACK_TOPICS[(string)$r['topic']]))) return admin_feedback_answer($g, $r, $rCentre, $p);

    $approve = !empty($p['approve']);
    /* THE REVIEW. An appeal against a sanction is decided by somebody other
       than the person who issued or confirmed it — a decision is not reviewed
       by its author — and with a reason either way: upheld or not, the family
       is owed the why. Upheld, the sanction is overturned (lifted), which takes
       its fine off the account and, for a suspension, its re-entry fee. */
    $appealOf = null;
    if ((string)$r['kind'] === 'appeal' && (int)($r['refSanctionId'] ?? 0) > 0) {
        $appealOf = db_row('SELECT * FROM sanctions WHERE id = ? LIMIT 1', [(int)$r['refSanctionId']]);
        $me = (string)($g['requester']['memberId'] ?? '');
        if ($appealOf && $me !== '' && in_array($me, [(string)$appealOf['issuedBy'], (string)($appealOf['clearedBy'] ?? '')], true))
            return ['ok' => false, 'error' => 'needs_second_person', 'detail' => 'You made this decision, so somebody else reviews the appeal.'];
        if (trim((string)($p['decision'] ?? '')) === '')
            return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Say why, either way. The family sees it.'];
    }
    /* The permission cap holds at the desk too: several requests may each have
       fitted when filed, and approving all of them would grant more than the
       session allows. Counted against what is already APPROVED. */
    if ($approve && (string)$r['kind'] === 'leave' && function_exists('policy_is_session') && policy_is_session('member') && (string)$r['memberId'] !== '') {
        $mm = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
        if ($mm) {
            $to = (string)$r['toDate'] !== '' ? (string)$r['toDate'] : (string)$r['fromDate'];
            [$sa, $sb] = policy_session_bounds((string)$r['memberId'], (string)$r['fromDate']);
            $have = [];
            foreach (db_all("SELECT fromDate, toDate FROM member_requests WHERE memberId = ? AND kind = 'leave' AND status = 'approved' AND requestId <> ? AND fromDate <> ''
                             AND fromDate <= ? AND (CASE WHEN toDate = '' THEN fromDate ELSE toDate END) >= ?", [(string)$r['memberId'], $rid, $sb, $sa]) as $x) {
                foreach (member_excuse_days($mm, max((string)$x['fromDate'], $sa), min((string)$x['toDate'] !== '' ? (string)$x['toDate'] : (string)$x['fromDate'], $sb)) as $d) $have[$d] = true;
            }
            $adds = array_diff(member_excuse_days($mm, max((string)$r['fromDate'], $sa), min($to, $sb)), array_keys($have));
            $max = (int)policy_for('member')['permittedAbsences'];
            if (count($have) + count($adds) > $max) {
                return ['ok' => false, 'error' => 'excuse_limit', 'detail' => 'Approving this would make ' . (count($have) + count($adds)) . ' absences with permission this session; at most '
                    . $max . ' are accepted. ' . count($have) . ' are already approved. Decline it with the reason, or approve fewer days.'];
            }
        }
    }
    /* Approving a payment claim posts money to the fees ledger, and money is
       a separate trust (CLAUDE.md §4): `people` decides leave and appeals,
       only a `fees` holder may say a payment arrived. Declining needs no
       money permission — nothing is posted. */
    if ($approve && (string)$r['kind'] === 'payment' && !in_array('fees', member_effective_caps($g['requester']), true)) {
        return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:fees',
                'message' => 'Approving a payment posts money to the account, which needs the Fees permission.'];
    }
    $reason = trim(substr((string)($p['decision'] ?? ''), 0, MEMBER_REQUEST_BODY_MAX));
    if (!$approve && $reason === '') {
        return ['ok' => false, 'error' => 'need_reason',
                'detail' => 'Say why it was declined — the member sees this, and a bare refusal is how a decision becomes a grievance.'];
    }

    $by = (string)($g['requester']['memberId'] ?? '');
    $patch = ['status' => $approve ? 'approved' : 'declined', 'decision' => $reason,
              'decidedBy' => $by, 'decidedAt' => now_iso(), 'updatedAt' => now_iso()];

    /* Money only ever moves through fees_post, and only for a payment claim
       being approved. An admin may correct the amount they actually found on
       the statement — approving a claim for ₦6,000 when ₦5,000 arrived should
       post ₦5,000, not argue with the member first. */
    /* Posted part by part when the desk says how it arrived: one ledger entry
       each, with its own method and reference, so a transfer can be found on
       the statement and the cash has the name of who took it. */
    $parts = null;
    if ($approve && (string)$r['kind'] === 'payment' && is_array($p['parts'] ?? null)) {
        $pp = member_payment_parts($p['parts'], false);
        if (isset($pp['error'])) return ['ok' => false, 'error' => $pp['error'], 'detail' => $pp['detail']];
        if ($pp['parts']) $parts = $pp['parts'];
    }
    /* The same rules as a payment recorded at the desk (fees_payment_guard):
       not one's own account, not around a joining invoice, and a bank reference
       accepted once — this path used to post with none of them. */
    if ($approve && (string)$r['kind'] === 'payment' && function_exists('fees_payment_guard')) {
        $chk = $parts ? array_map(static fn($x) => ['method' => (string)$x['method'], 'reference' => (string)$x['reference']], $parts)
                      : [['method' => 'claim', 'reference' => (string)$r['reference']]];
        $no = fees_payment_guard((string)$r['memberId'], $by, $chk, (string)($p['ip'] ?? ''));
        if ($no) return $no;
    }
    /* CLAIM the request before any money moves. The status was checked on a
       row read at the top, so two approvals close together (a double press, a
       retry, two desks) both passed it and each posted the payment — one
       transfer, two credits on the ledger. Only one caller turns `open` into
       a decision; the other is told it was already decided. */
    $claimed = db_exec("UPDATE member_requests SET status = ?, updatedAt = ? WHERE id = ? AND status = 'open'",
        [$approve ? 'approved' : 'declined', now_iso(), (int)$r['id']]);
    if (!$claimed) return ['ok' => false, 'error' => 'already_decided'];
    $unclaim = static fn() => db_exec("UPDATE member_requests SET status = 'open', updatedAt = ? WHERE id = ?", [now_iso(), (int)$r['id']]);
    if ($parts && function_exists('fees_post')) {
        $ids = [];
        // All parts or none: a claim half-posted and then refused is two truths about one payment.
        try {
        db_tx(static function () use (&$parts, &$ids, $r, $rid, $by) {
        foreach ($parts as $k => $x) {
            $entry = fees_post((string)$r['memberId'], 'payment', (int)$x['amount'], [
                // Keyed by the request, so the same claim can never post twice.
                'periodKey' => 'mreq:' . $rid . ':' . $k,
                'note' => 'Payment confirmed from member claim ' . $rid . ' — ' . member_payment_part_text($x),
                'method' => $x['method'], 'reference' => $x['reference'] !== '' ? $x['reference'] : ($x['receivedBy'] !== '' ? 'cash to ' . $x['receivedBy'] : ''), 'by' => $by,
            ]);
            if (!$entry) throw new \RuntimeException('payment part not posted');
            $ids[] = (string)$entry['entryId']; $parts[$k]['entryId'] = (string)$entry['entryId'];
        }
        });
        } catch (Throwable $e) {
            $unclaim();
            error_log('[request.decide] ' . $rid . ': ' . $e->getMessage());
            return ['ok' => false, 'error' => 'post_failed', 'detail' => 'The payment could not be posted to the account, so the request is still open. Try again.'];
        }
        $patch['ledgerEntryId'] = implode(',', $ids);
        $patch['amount'] = array_sum(array_map(static fn($x) => (int)$x['amount'], $parts));
        $patch['parts'] = json_encode($parts, JSON_UNESCAPED_UNICODE);
    } elseif ($approve && (string)$r['kind'] === 'payment' && function_exists('fees_post')) {
        $amount = fees_money($p['amount'] ?? null, (int)$r['amount']);
        if ($amount > 0) {
            $entry = fees_post((string)$r['memberId'], 'payment', $amount, [
                'periodKey' => 'mreq:' . $rid,
                'note' => 'Payment confirmed from member claim ' . $rid
                        . ((string)$r['reference'] !== '' ? ' (ref ' . $r['reference'] . ')' : ''),
                'method' => 'claim', 'reference' => (string)$r['reference'], 'by' => $by,
            ]);
            /* A post that did not land is not an approval: the family would be
               told "approved" while no money reached the account. */
            if (!$entry) {
                $unclaim();
                return ['ok' => false, 'error' => 'post_failed', 'detail' => 'The payment could not be posted to the account, so the request is still open. Try again.'];
            }
            $patch['ledgerEntryId'] = (string)$entry['entryId'];
            $patch['amount'] = $amount;
        }
    }

    db_update('member_requests', $patch, ['id' => (int)$r['id']]);
    if ($appealOf && $approve && in_array((string)$appealOf['status'], ['active', 'proposed', 'pending'], true) && function_exists('admin_policy_sanction_update')) {
        admin_policy_sanction_update(['requesterId' => (string)$g['requester']['memberId'], 'sanctionId' => (int)$appealOf['id'], 'status' => 'lifted',
            'note' => 'Appeal ' . $rid . ' upheld: ' . mb_substr($reason, 0, 200)]);
    }
    /* An absence request decides a fine that was being held (policy_apply's
       absence rule): declined, the absences it covered are fined now; approved,
       they are not. Approved academic leave goes further — its days were never
       the member's to attend, so absences already logged on them are voided,
       which lifts anything they caused. */
    if (in_array((string)$r['kind'], ['leave', 'academic'], true) && (string)$r['memberId'] !== '' && function_exists('policy_apply')) {
        if ($approve && (string)$r['kind'] === 'academic') {
            db_exec("UPDATE infractions SET voidedAt = ?, voidedBy = ?, voidReason = ? WHERE personId = ? AND kind IN ('absence', 'no_checkout', 'halfday') AND date >= ? AND date <= ? AND (voidedAt IS NULL OR voidedAt = '')",
                [now_iso(), $by, 'Academic leave ' . $rid . ' approved', (string)$r['memberId'], (string)$r['fromDate'], (string)($r['toDate'] ?: $r['fromDate'])]);
        }
        policy_apply((string)$r['memberId'], 'member');
    }
    audit('member.request.' . ($approve ? 'approve' : 'decline'), $by, $rid,
          ['kind' => (string)$r['kind'], 'memberId' => (string)$r['memberId'],
           'ledgerEntryId' => (string)($patch['ledgerEntryId'] ?? '')], (string)($p['ip'] ?? ''));

    /* The member is told. A queue whose decisions arrive silently is one they
       have to keep checking, which is the failure mode self-service exists to
       remove. */
    member_request_tell($r, (MEMBER_REQUEST_KINDS[(string)$r['kind']] ?? 'Request') . ' — ' . ($approve ? 'approved' : 'declined'),
        'has been ' . ($approve ? 'approved.' : 'declined.'),
        $reason !== '' ? $reason : ($approve ? 'Your request has been approved.' : 'Your request was declined.'));
    // A payment note's answer reaches every guardian, in the family app and by their channels (dues-notices.php).
    if ((string)$r['kind'] === 'payment' && function_exists('dues_claim_decided')) dues_claim_decided($r, $approve, (int)($patch['amount'] ?? $r['amount']), $reason);
    $after = db_row('SELECT * FROM member_requests WHERE id = ? LIMIT 1', [(int)$r['id']]);
    return ['ok' => true, 'request' => member_request_public($after ?: [])];
}
