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
];

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
    $m = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];

    $kind = (string)($p['kind'] ?? '');
    if (!isset(MEMBER_REQUEST_KINDS[$kind])) return ['ok' => false, 'error' => 'unknown_kind'];

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
        'intro' => (string)$m['fullName'] . ' raised a request.',
        'body' => $row['subject'] . ($row['body'] !== '' ? "\n\n" . mb_substr((string)$row['body'], 0, 400) : '') . "\n\nDecide it in Control Room → People → Member requests.",
        'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=requests', 'ctaLabel' => 'Review it →']);
    if (function_exists('event_emit')) {
        event_emit('member.request.raised', ['requestId' => $row['requestId'], 'memberId' => $id,
            'kind' => $kind, 'subject' => $row['subject'], 'fullName' => (string)$m['fullName']]);
    }
    return ['ok' => true, 'request' => member_request_public($row)];
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

/** The queue. Open first, because that is the working list. */
function admin_requests_list(array $p): array
{
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $args = [];
    $status = (string)($p['status'] ?? 'open');
    if (in_array($status, MEMBER_REQUEST_STATUSES, true)) { $where[] = 'r.status = ?'; $args[] = $status; }
    $kind = (string)($p['kind'] ?? '');
    if (isset(MEMBER_REQUEST_KINDS[$kind])) { $where[] = 'r.kind = ?'; $args[] = $kind; }
    $sql = 'SELECT r.*, m.fullName, m.displayId, m.centre FROM member_requests r
              LEFT JOIN members m ON m.memberId = r.memberId'
         . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
         . ' ORDER BY r.id DESC LIMIT ' . MEMBER_REQUEST_PAGE;
    $rows = array_map(fn($r) => member_request_public($r) + [
        'fullName' => (string)($r['fullName'] ?? ''), 'displayId' => (string)($r['displayId'] ?? ''),
        'centre' => (string)($r['centre'] ?? ''), 'decidedBy' => (string)($r['decidedBy'] ?? ''),
    ], db_all($sql, $args));
    $tally = [];
    foreach (db_all("SELECT kind, COUNT(*) c FROM member_requests WHERE status = 'open' GROUP BY kind") as $t) {
        $tally[(string)$t['kind']] = (int)$t['c'];
    }
    return ['ok' => true, 'requests' => $rows, 'openByKind' => $tally, 'kinds' => MEMBER_REQUEST_KINDS];
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
    if ((string)$r['status'] !== 'open') return ['ok' => false, 'error' => 'already_decided'];

    $approve = !empty($p['approve']);
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
    $after = db_row('SELECT * FROM member_requests WHERE id = ? LIMIT 1', [(int)$r['id']]);
    return ['ok' => true, 'request' => member_request_public($after ?: [])];
}
