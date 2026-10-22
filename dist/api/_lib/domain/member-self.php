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
    'appeal'  => 'Appeal a charge',
    'leave'   => 'Leave of absence',
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
];

/** What a piece of feedback is about, and what the desk sees for each. */
const MEMBER_FEEDBACK_TOPICS = ['idea' => 'An idea', 'change' => 'Something to change', 'love' => 'Something I love'];

/** Feedback is cheap to give and should be: more of it may wait than requests. */
const MEMBER_FEEDBACK_OPEN_MAX = 6;

/** Shorter than this is not something the desk can act on ("Chess"). */
const MEMBER_FEEDBACK_MIN = 6;

const MEMBER_REQUEST_STATUSES = ['open', 'approved', 'declined', 'withdrawn'];

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
    return [
        'requestId' => (string)$r['requestId'],
        'kind'      => (string)$r['kind'],
        'kindLabel' => MEMBER_REQUEST_KINDS[(string)$r['kind']] ?? (string)$r['kind'],
        'status'    => (string)$r['status'],
        'subject'   => (string)($r['subject'] ?? ''),
        'body'      => (string)($r['body'] ?? ''),
        'amount'    => (int)($r['amount'] ?? 0),
        'reference' => (string)($r['reference'] ?? ''),
        'proofUrl'  => (string)($r['proofUrl'] ?? ''),
        'paidAt'    => (string)($r['paidAt'] ?? ''),
        'fromDate'  => (string)($r['fromDate'] ?? ''),
        'toDate'    => (string)($r['toDate'] ?? ''),
        'decision'  => (string)($r['decision'] ?? ''),
        'decidedAt' => (string)($r['decidedAt'] ?? ''),
        'createdAt' => (string)($r['createdAt'] ?? ''),
        'byFamily'  => (string)($r['raisedBy'] ?? '') !== '',
        'topic'     => (string)($r['topic'] ?? ''),
        'topicLabel' => MEMBER_FEEDBACK_TOPICS[(string)($r['topic'] ?? '')] ?? '',
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

    return ['ok' => true, 'enabled' => true,
            'currency' => (string)$cfg['currency'],
            'member' => ['fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                         'centre' => (string)($m['centre'] ?? ''), 'level' => (string)($m['level'] ?? '')],
            'lines' => $lines,
            'closingPayable' => $payable, 'closingTotal' => $total];
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
        ], $days),
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
    return ['ok' => true, 'requests' => array_map('member_request_public', $rows),
            'kinds' => MEMBER_REQUEST_KINDS];
}

/**
 * Raise one.
 *
 * Validation is per kind because the kinds are not the same shape: a payment
 * claim without an amount is not a claim, and a leave request without dates is
 * not a request. Saying which field is missing — rather than a flat "invalid" —
 * is the difference between a member fixing it and a member giving up.
 */
function member_request_create(array $p): array
{
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT memberId, fullName, centre FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];

    $kind = (string)($p['kind'] ?? '');
    if (!isset(MEMBER_REQUEST_KINDS[$kind])) return ['ok' => false, 'error' => 'unknown_kind'];
    if ($kind === 'feedback') return member_feedback_create($p);

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
        $amount = fees_money($p['amount'] ?? null, 0);
        if ($amount <= 0) return ['ok' => false, 'error' => 'bad_amount', 'detail' => 'How much did you pay?'];
        $row['amount'] = $amount;
        $row['reference'] = trim(substr((string)($p['reference'] ?? ''), 0, 120));
        $row['paidAt'] = substr(trim((string)($p['paidAt'] ?? '')), 0, 10);
        /* An uploaded receipt, if there is one. Stored as the URL the upload
           path already returned — this never accepts raw bytes, so the one
           image-handling surface in the product stays the one that is hardened. */
        $u = trim((string)($p['proofUrl'] ?? ''));
        $row['proofUrl'] = preg_match('#^https?://#i', $u) || str_starts_with($u, '/api/public/photo.php') ? $u : '';
        if ($row['subject'] === '') $row['subject'] = 'Payment of ' . fees_money_text($amount);
    } elseif ($kind === 'leave') {
        $row['fromDate'] = substr(trim((string)($p['fromDate'] ?? '')), 0, 10);
        $row['toDate'] = substr(trim((string)($p['toDate'] ?? '')), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $row['fromDate'])) return ['ok' => false, 'error' => 'bad_dates', 'detail' => 'When does the leave start?'];
        if ($row['toDate'] !== '' && $row['toDate'] < $row['fromDate']) [$row['fromDate'], $row['toDate']] = [$row['toDate'], $row['fromDate']];
        if ($body === '') return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Say why, so the desk can answer without asking.'];
        if ($row['subject'] === '') $row['subject'] = 'Leave from ' . $row['fromDate'];
    } elseif (in_array($kind, ['details', 'mentor', 'help'], true)) {
        if (mb_strlen($body) < 6) return ['ok' => false, 'error' => 'need_reason', 'detail' => [
            'details' => 'Say what is wrong and what it should be.', 'mentor' => 'Say what is not working, so the coordinator can help.',
            'help' => 'Tell us what happened.'][$kind]];
        if ($row['subject'] === '') $row['subject'] = MEMBER_REQUEST_KINDS[$kind];
    } elseif ($kind === 'appeal') {
        if ($body === '') return ['ok' => false, 'error' => 'need_reason', 'detail' => 'An appeal needs the reason it is being appealed.'];
        /* Which charge, if they picked one. Checked against their OWN ledger so
           a reference to somebody else's entry cannot be attached. */
        $ref = trim((string)($p['refEntryId'] ?? ''));
        if ($ref !== '' && db_row('SELECT id FROM member_ledger WHERE entryId = ? AND memberId = ? LIMIT 1', [$ref, $id])) {
            $row['refEntryId'] = $ref;
        }
        if ($row['subject'] === '') $row['subject'] = 'Appeal';
    } elseif ($kind === 'idcard') {
        if ($row['subject'] === '') $row['subject'] = 'Replacement ID card';
    }

    db_insert('member_requests', $row);
    audit('member.request.create', $id, $row['requestId'], ['kind' => $kind], (string)($p['ip'] ?? ''));
    /* The desk is told once, when it is raised. Not on every edit — a queue
       that pings is a queue that gets muted. */
    // …and the people who can decide it, at the member's centre, in the app and by email.
    $centre = (string)($m['centre'] ?? '');
    notify_people(staff_with_cap('people', [$id], static fn($s) => admin_centre_allowed($s, $centre)), [
        'kind' => 'approval', 'title' => 'A member request is waiting: ' . (MEMBER_REQUEST_KINDS[$kind] ?? 'Request'),
        'intro' => $row['raisedBy'] !== ''
            ? (string)($p['raisedByName'] ?? 'A parent') . ' raised a request for ' . (string)$m['fullName'] . ' from their family account.'
            : (string)$m['fullName'] . ' raised a request.',
        'body' => $row['subject'] . ($row['body'] !== '' ? "\n\n" . mb_substr((string)$row['body'], 0, 400) : '') . "\n\nDecide it in Control Room → People → Member requests.",
        'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=requests', 'ctaLabel' => 'Review it →']);
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
    if (mb_strlen($body) < MEMBER_FEEDBACK_MIN) {
        return ['ok' => false, 'error' => 'need_reason', 'detail' => 'Tell us a little more, so the team knows what you mean.'];
    }
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
        'subject' => MEMBER_FEEDBACK_TOPICS[$topic], 'body' => $body, 'topic' => $topic, 'centre' => $centre,
        'amount' => 0, 'reference' => '', 'proofUrl' => '', 'paidAt' => '',
        'fromDate' => '', 'toDate' => '', 'refEntryId' => '',
        'decision' => '', 'decidedBy' => '', 'decidedAt' => '', 'ledgerEntryId' => '', 'raisedBy' => '', 'passedAt' => '',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ];
    db_insert('member_requests', $row);
    // The audit names nobody when the child asked not to be named.
    audit('member.feedback.create', $anon ? '' : $id, $row['requestId'], ['topic' => $topic, 'anonymous' => $anon, 'centre' => $centre], '');
    notify_people(staff_with_cap('people', $anon ? [] : [$id], static fn($s) => admin_centre_allowed($s, $centre)), [
        'kind' => 'approval', 'title' => 'New feedback from a member: ' . MEMBER_FEEDBACK_TOPICS[$topic],
        'intro' => $anon ? 'A member at ' . ($centre !== '' ? $centre : 'a centre') . ' sent this without their name.' : (string)$m['fullName'] . ' sent this.',
        'body' => mb_substr($body, 0, 400) . "\n\nThank them or pass it on in Control Room → Inbox → Member requests.",
        'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=requests', 'ctaLabel' => 'Read it →']);
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
    $rows = array_map(static fn($r) => member_request_public($r) + [
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
            'title' => 'Thank you for your idea', 'intro' => 'You told us: “' . mb_substr((string)$r['body'], 0, 120) . '”', 'body' => $reply,
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
    if ((string)$r['kind'] === 'feedback') return admin_feedback_answer($g, $r, $rCentre, $p);

    $approve = !empty($p['approve']);
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
    if ($approve && (string)$r['kind'] === 'payment' && function_exists('fees_post')) {
        $amount = fees_money($p['amount'] ?? null, (int)$r['amount']);
        if ($amount > 0) {
            $entry = fees_post((string)$r['memberId'], 'payment', $amount, [
                'note' => 'Payment confirmed from member claim ' . $rid
                        . ((string)$r['reference'] !== '' ? ' (ref ' . $r['reference'] . ')' : ''),
                'method' => 'claim', 'reference' => (string)$r['reference'], 'by' => $by,
            ]);
            if ($entry) $patch['ledgerEntryId'] = (string)$entry['entryId'];
            $patch['amount'] = $amount;
        }
    }

    db_update('member_requests', $patch, ['id' => (int)$r['id']]);
    audit('member.request.' . ($approve ? 'approve' : 'decline'), $by, $rid,
          ['kind' => (string)$r['kind'], 'memberId' => (string)$r['memberId'],
           'ledgerEntryId' => (string)($patch['ledgerEntryId'] ?? '')], (string)($p['ip'] ?? ''));

    /* The member is told. A queue whose decisions arrive silently is one they
       have to keep checking, which is the failure mode self-service exists to
       remove. */
    $mm = db_row('SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    if ($mm) notify_people([$mm], [
        'kind' => 'request', 'eyebrow' => 'NGG · Your requests',
        'title' => (MEMBER_REQUEST_KINDS[(string)$r['kind']] ?? 'Request') . ' — ' . ($approve ? 'approved' : 'declined'),
        'intro' => 'Your request “' . (string)$r['subject'] . '” has been ' . ($approve ? 'approved.' : 'declined.'),
        'body' => $reason !== '' ? $reason : ($approve ? 'Your request has been approved.' : 'Your request was declined.'),
        'linkPage' => 'dashboard', 'ctaPath' => '/dashboard/requests', 'ctaLabel' => 'See your requests →']);
    /* …and so is the parent who raised it, at the address they signed in with. */
    if (str_starts_with((string)($r['raisedBy'] ?? ''), 'guardian:') && function_exists('family_mail')) {
        $gr = db_row('SELECT email FROM guardians WHERE guardianId = ? AND status = ? LIMIT 1', [substr((string)$r['raisedBy'], 9), 'active']);
        if ($gr) family_mail((string)$gr['email'], (MEMBER_REQUEST_KINDS[(string)$r['kind']] ?? 'Request') . ' — ' . ($approve ? 'approved' : 'declined'), [
            'title' => 'Your request was ' . ($approve ? 'approved' : 'declined'),
            'intro' => '“' . (string)$r['subject'] . '” for ' . (string)($mm['fullName'] ?? 'your ward') . ' has been ' . ($approve ? 'approved.' : 'declined.'),
            'bodyHtml' => $reason !== '' ? '<p style="margin:0 0 10px">' . nl2br(esc_html($reason)) . '</p>' : '',
            'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family']);
    }
    $after = db_row('SELECT * FROM member_requests WHERE id = ? LIMIT 1', [(int)$r['id']]);
    return ['ok' => true, 'request' => member_request_public($after ?: [])];
}
