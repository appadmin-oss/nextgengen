<?php
declare(strict_types=1);

/**
 * Family Portal v3 — what the new /family needs beyond family.php.
 *
 * family.php owns the account, the links and the one gate (family_link()).
 * This file adds the reads and the few writes the v3 screens are built on:
 * the Leadership Index and school results as a parent sees them, the
 * household inbox with signatures, events a family is asked to, a mentor's
 * bookable times, and the read-only facts (who may collect, consents).
 *
 * Four rules, each from the handoff and each enforced here, not on screen:
 *
 *  1. A plan is never shown before a mentor approved it. The read returns
 *     `plan: null` until growth_plans.approvedAt is set, whatever the client
 *     asks for.
 *  2. What stays with the child stays with the child. Nothing here reads a
 *     journal, a reflection, a coach chat or a mentor message; the score's
 *     note is the Saturday evaluation's strength and next step, which the
 *     mentor writes for the child and family to read.
 *  3. Fixed truths are read-only. A guardian's profile, the collectors and
 *     the consents have no write op on any family route; a change is a
 *     request the desk decides (kinds `familydetails`, `collect`).
 *  4. A family's answer is the family's. An RSVP from a parent is its own
 *     row (guardian_rsvps), never a member's RSVP written on their behalf.
 */

/** The ten Leadership Index skills, in the fixed order every scorecard uses (MP_SKILLS). */
function family_skill_names(): array { return array_map(static fn($s) => (string)$s[0], MP_SKILLS); }

/** The five consents of membership. All are compulsory and none can be changed here. */
const FAMILY_CONSENTS = [
    ['participation', 'Taking part in NGG'],
    ['medical', 'Emergency medical care'],
    ['data', 'Keeping and using their records'],
    ['media', 'Photos and videos in NGG materials'],
    ['site_visibility', 'First name and work on the website'],
];
const FAMILY_INBOX_CATS = ['report', 'alert', 'centre'];
const FAMILY_INBOX_PAGE = 30;
/** A parent may nudge a child about results once a day; the child is not a notification target. */
const FAMILY_REMIND_HOURS = 24;
/** A plan with no reviewed draft after this long is shown as uploaded, without a plan, rather than "reading" for ever. */
const FAMILY_PROCESSING_HOURS = 72;
const FAMILY_SLOTS_SHOWN = 8;
const FAMILY_EVENTS_SHOWN = 20;

/* ── Reads folded into family.ward ─────────────────────────────────────── */

/** Everything v3 adds to one ward's read. Called by family_ward() once the link is checked. */
function family_v3_ward(array $m, string $gid): array {
    $mid = (string)$m['memberId'];
    $mentor = function_exists('results_mentor_of') ? results_mentor_of($mid) : null;
    return [
        'mentor' => $mentor ? ['name' => (string)($mentor['fullName'] ?? ''), 'first' => mp_first((string)($mentor['fullName'] ?? ''))] : null,
        'score' => family_score($mid),
        'results' => family_results($m, $gid),
        'collectors' => array_map(static fn($c) => ['name' => (string)$c['name'], 'relation' => (string)$c['relation'], 'phone' => (string)$c['phone']],
            db_all('SELECT name, relation, phone FROM member_collectors WHERE memberId = ? ORDER BY id', [$mid])),
        'consents' => family_consents($m),
        'mentorSlots' => $mentor ? family_slots_free((string)$mentor['mentorId']) : [],
        'meeting' => family_meeting($mid),
        'fees3' => family_fees_view($m),
    ];
}

/**
 * The Fees page, as the server works it out: what is owed now and what it is
 * made of, the next charge, the statement, and the training place. Training
 * rows are in the statement but never in a total — the place is covered by
 * NGG, not billed (FEES_SPEC_v2 §4, §6.1). The client adds nothing up.
 */
function family_fees_view(array $m): ?array {
    if (!function_exists('member_fees_account')) return null;
    $acc = member_fees_account(['memberId' => (string)$m['memberId']]);
    $a = $acc['account'] ?? null;
    if (!$a) return null;
    $cfg = fees_settings();
    $mid = (string)$m['memberId'];
    $place = static fn($k) => in_array($k, ['training', 'writeoff'], true);
    $entries = array_map(static function ($e) use ($place) {
        $at = substr((string)$e['createdAt'], 0, 10);
        return ['id' => (string)($e['entryId'] ?? ''), 'date' => $at, 'month' => $at !== '' ? gmdate('F Y', strtotime($at . 'T12:00:00Z')) : '',
            'kind' => (string)$e['kind'], 'note' => (string)$e['note'], 'amount' => (int)$e['amount'], 'period' => (string)($e['period'] ?? ''),
            'dir' => (string)$e['direction'] === 'credit' ? 'credit' : 'charge', 'void' => !empty($e['void']), 'place' => $place((string)$e['kind'])];
    }, (array)$a['entries']);
    /* The balance after each entry, real money only (the training place and a
       cancelled line move nothing), so a month on the statement can close on a
       figure instead of leaving a parent to add twelve rows. Entries arrive
       newest first; the running sum is taken oldest first. */
    $run = 0;
    for ($i = count($entries) - 1; $i >= 0; $i--) {
        $e = $entries[$i];
        if (!$e['void'] && !$e['place']) $run += $e['dir'] === 'charge' ? $e['amount'] : -$e['amount'];
        $entries[$i]['balance'] = $run;
    }
    /* What the payable is made of: each charge with something left on it, read
       the way the account is (fees_charges_left — payments to the oldest
       first), newest first on screen. A part-paid charge says what it was
       (`of`), so "Membership ₦2,000" is not read as the price of membership. */
    /* What the payable is made of — one server answer (fees_owed_made) shared
       with the member's Money screen and Who owes: grouped, oldest first, a
       part-paid charge saying what it was, and the training place when it
       became owed on leaving (it is on no charge, so a list built from charges
       alone came up short by exactly that). */
    $lines = fees_owed_made($m, $cfg)['lines'];
    $inv = db_row("SELECT * FROM membership_invoices WHERE memberId = ? AND status = 'open' ORDER BY id DESC LIMIT 1", [$mid]);
    /* What is still to come in the next two months, after what was paid ahead: the commitment fee on the 1st
       and a renewal on the joining anniversary (dues_coming_charges — the notices read the same answer). */
    $next = [];
    if (function_exists('dues_coming_charges') && !empty($cfg['enabled'])) {
        $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
        foreach (dues_coming_charges($m, $cfg, $today, 62, 3) as $c)
            $next[] = ['label' => $c['kind'] === 'dues' ? 'Commitment fee · ' . gmdate('F', strtotime($c['key'] . '-01T12:00:00Z')) : 'Membership renewal',
                'date' => (string)$c['due'], 'amount' => (int)$c['amount'], 'kind' => (string)$c['kind']];
    }
    $ch = function_exists('dues_notice_channels') ? dues_notice_channels($cfg) : [];
    $t = (array)($a['training'] ?? []);
    $cost = (int)($t['chargedAmount'] ?? 0); $covered = (int)($t['covered'] ?? 0);
    $start = (string)(($a['tenure']['start'] ?? '') ?: '');
    $tm = (int)($t['trainingMonths'] ?? 0); $sm = (int)($t['serviceMonths'] ?? 0);
    $pay = function_exists('membership_pay_settings') ? membership_pay_settings() : ['bankName' => '', 'accountName' => '', 'accountNumber' => ''];
    return [
        'payable' => (int)$a['payable'], 'outstanding' => (int)$a['outstanding'], 'payOnline' => !empty($a['payOnline']),
        /* Paystack's charge on paying online, borne by the family (fees.payFeeOn) — shown before they go to Paystack. */
        'payFee' => !empty($a['payOnline']) && function_exists('paystack_family_charge') ? paystack_family_charge($inv ? (int)$inv['total'] : (int)$a['payable'], $cfg) : 0,
        /* The smallest instalment a family may pay towards today's balance (membership_part_min); 0 = pay in full. */
        'partMin' => !empty($a['payOnline']) && !$inv && function_exists('membership_part_min') ? membership_part_min((int)$a['payable']) : 0,
        'offlinePending' => (bool)db_row("SELECT 1 FROM member_requests WHERE memberId = ? AND kind = 'payment' AND status = 'open' LIMIT 1", [$mid]),
        'lines' => $lines, 'next' => $next, 'entries' => $entries,
        'joining' => $inv ? ['invoiceId' => (string)$inv['invoiceId'], 'start' => (string)$inv['startDate'], 'total' => (int)$inv['total'],
            'items' => array_map(static fn($i) => ['label' => (string)($i['label'] ?? ''), 'detail' => (string)($i['detail'] ?? ''), 'amount' => (int)($i['amount'] ?? 0), 'kind' => (string)($i['kind'] ?? 'membership')], membership_items($inv))] : null,
        /* How the family will be told, from the settings that decide it — so the Fees screen never
           promises an email reminder that is switched off, or forgets the notice before a due date. */
        'terms' => ['membershipFee' => (int)$cfg['membershipFee'], 'monthly' => (int)$cfg['monthlyDues'],
            'remindEvery' => !empty($cfg['remindEnabled']) ? (int)$cfg['remindEveryDays'] : 0,
            'noticeDays' => !empty($cfg['noticeEnabled']) ? (int)$cfg['noticeDaysBefore'] : 0,
            'channels' => array_values(array_filter([!empty($ch['app']) ? 'app' : '', !empty($ch['email']) ? 'email' : '', !empty($ch['telegram']) ? 'telegram' : '', !empty($ch['sms']) ? 'sms' : '']))],
        'programme' => ['phase' => (string)($t['phase'] ?? 'unknown') === 'unknown' ? 'starting' : (string)$t['phase'], 'cost' => $cost, 'covered' => $covered,
            'pct' => $cost > 0 ? (int)floor(100 * $covered / $cost) : 0, 'months' => (int)($t['months'] ?? 0), 'servedMonths' => (int)($t['servedMonths'] ?? 0),
            'trainingMonths' => $tm, 'serviceMonths' => $sm, 'serviceStarts' => (string)($t['trainingEndsAt'] ?? ''),
            'completes' => $start !== '' ? gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC +' . ($tm + $sm) . ' months')) : '',
            'paused' => (string)($t['creditPausedAt'] ?? '') !== ''],
        'bank' => $pay['bankName'] !== '' && $pay['accountNumber'] !== '' ? ['name' => $pay['accountName'], 'bank' => $pay['bankName'], 'account' => $pay['accountNumber']] : null,
        /* Paying ahead: the credit already waiting, the month it reaches, and a
           priced choice per number of months — priced here, never on the page.
           None while the joining invoice is open: that comes first. */
        'ahead' => !$inv && !empty($cfg['enabled']) && function_exists('membership_advance_plan') && member_is_ngg($m) ? membership_advance_plan($m) : null,
        // What the child asked of their parents lately (member_family_nudge).
        'asked' => function_exists('family_nudges_of') ? family_nudges_of($mid, 14) : null,
        'claim' => ($c = db_row("SELECT amount, reference, createdAt FROM member_requests WHERE memberId = ? AND kind = 'payment' AND status = 'open' ORDER BY id DESC LIMIT 1", [$mid]))
            ? ['amount' => (int)$c['amount'], 'reference' => (string)$c['reference'], 'at' => substr((string)$c['createdAt'], 0, 10)] : null,
    ];
}

/**
 * The latest Leadership Index a mentor scored, with the one before it.
 * Null until there is one: an empty state, never a card of zeros.
 */
function family_score(string $mid): ?array {
    $rows = db_all("SELECT month, scores, total, mentorId, updatedAt FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'mentor' ORDER BY month DESC LIMIT 2", [$mid]);
    if (!$rows) return null;
    $dec = static fn($r) => array_map('intval', explode(',', (string)$r['scores']));
    $now = $dec($rows[0]);
    if (count($now) !== 10) return null;
    $prev = isset($rows[1]) ? $dec($rows[1]) : null;
    if ($prev !== null && count($prev) !== 10) $prev = null;
    $by = db_row('SELECT fullName FROM mentors WHERE mentorId = ? LIMIT 1', [(string)$rows[0]['mentorId']]);
    /* The parent-facing note: the latest Saturday evaluation's strength and
       next step. Never the mentor's private notes (mentor_meetings.discussed). */
    $note = '';
    $ev = db_row("SELECT evalJson FROM mentor_reviews WHERE subjectId = ? AND evalJson IS NOT NULL AND evalJson <> '' ORDER BY period DESC LIMIT 1", [$mid]);
    if ($ev) {
        $e = json_decode((string)$ev['evalJson'], true);
        if (is_array($e)) $note = trim(implode(' ', array_filter([(string)($e['strength'] ?? ''), (string)($e['next'] ?? '') !== '' ? 'Next: ' . (string)$e['next'] : ''])));
    }
    return ['session' => gmdate('F Y', strtotime((string)$rows[0]['month'] . '-01T12:00:00Z')), 'month' => (string)$rows[0]['month'],
            'taken' => substr((string)$rows[0]['updatedAt'], 0, 10), 'by' => (string)($by['fullName'] ?? ''),
            'skills' => family_skill_names(), 'now' => $now, 'prev' => $prev, 'note' => $note];
}

/**
 * School results, newest term first, as a parent may see them.
 *   missing     the term is owed and nothing is uploaded
 *   processing  uploaded; no approved plan yet (and not FAMILY_PROCESSING_HOURS old)
 *   uploaded    the plan was approved, or the wait ran out (then plan is null)
 */
function family_results(array $m, string $gid): array {
    if (!function_exists('results_terms') || !results_in_loop($m)) return [];
    $mid = (string)$m['memberId'];
    $today = results_today();
    $out = [];
    $prevAvg = null;
    $terms = array_reverse(results_terms($today, 4));    // oldest first, so each term knows the one before
    foreach ($terms as $t) {
        $u = db_row('SELECT * FROM results_uploads WHERE memberId = ? AND term = ? LIMIT 1', [$mid, $t['key']]);
        if (!$u && !results_owed($m, $t)) continue;
        $p = db_row('SELECT * FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [$mid, $t['key']]);
        $reviewed = $p && (string)$p['approvedAt'] !== '' && in_array((string)$p['status'], ['sent', 'live', 'closed'], true);
        $subs = $u ? results_subjects_of((string)$u['uploadId'], results_last_scores($mid, $t['key'])) : [];
        $avg = $subs ? results_kpis($subs)['avg'] : null;
        $by = $u ? (string)(db_row("SELECT actorRole FROM results_log WHERE memberId = ? AND term = ? AND kind = 'upload' ORDER BY id DESC LIMIT 1", [$mid, $t['key']])['actorRole'] ?? 'member') : '';
        $remind = db_row("SELECT at FROM results_log WHERE memberId = ? AND term = ? AND kind IN ('remind', 'family-remind') ORDER BY id DESC LIMIT 1", [$mid, $t['key']]);
        $status = !$u ? 'missing' : ($reviewed ? 'uploaded'
            : ((strtotime((string)$u['createdAt']) ?: time()) < time() - FAMILY_PROCESSING_HOURS * 3600 && $subs ? 'uploaded' : 'processing'));
        $plan = null;
        if ($reviewed && $status === 'uploaded') {
            $items = results_plan_items((string)$p['planId']);
            $ack = db_row('SELECT at FROM plan_acks WHERE planId = ? AND userId = ? LIMIT 1', [(string)$p['planId'], 'guardian:' . $gid]);
            $plan = ['planId' => (string)$p['planId'], 'drafted' => substr((string)$p['createdAt'], 0, 10), 'draftedByAi' => (string)$p['aiModel'] !== '',
                'reviewedBy' => (string)$p['approvedByName'], 'reviewedAt' => substr((string)$p['approvedAt'], 0, 10),
                'summary' => (string)$p['summary'], 'habit' => (string)$p['habit'],
                'focus' => array_map(static fn($i) => $i['subject'] . ': from ' . (int)$i['current'] . ' to ' . (int)$i['target'], $items),
                'actions' => array_merge(
                    array_map(static fn($i) => ['who' => 'member', 'text' => trim($i['what'] . ($i['whenWhere'] !== '' ? ' · ' . $i['whenWhere'] : ''))], $items),
                    (string)$p['habit'] !== '' ? [['who' => 'member', 'text' => 'Habit for the term: ' . (string)$p['habit']]] : [],
                    [['who' => 'mentor', 'text' => 'Checks the plan with ' . mp_first((string)$m['fullName']) . ' each month and adjusts it.'],
                     ['who' => 'guardian', 'text' => 'Ask which subject came first this week, and when in the week it happens.']]),
                'signedAt' => $ack ? substr((string)$ack['at'], 0, 10) : null];
        }
        $out[] = ['id' => (string)$t['key'], 'name' => (string)$t['label'], 'school' => (string)($m['school'] ?? ''), 'baseline' => false,
            'status' => $status, 'due' => (string)$t['dueOn'], 'reminded' => $remind ? substr((string)$remind['at'], 0, 10) : null,
            'uploaded' => $u ? substr((string)$u['createdAt'], 0, 10) : null, 'uploadedBy' => $by === 'guardian' ? 'guardian' : 'member',
            'avg' => $avg, 'prevAvg' => $prevAvg,
            'subjects' => array_map(static fn($s) => ['name' => (string)$s['name'], 'score' => $s['score'] === null ? null : (int)$s['score'],
                'prev' => isset($s['last']) && $s['last'] !== null ? (int)$s['last'] : null], $subs),
            'fileUrl' => $u ? (string)$u['fileUrl'] : '', 'plan' => $plan];
        if ($avg !== null) $prevAvg = $avg;
    }
    return array_reverse($out);
}

/** The five consents and when they were given: the consent ledger where it holds them, else the date they joined. */
function family_consents(array $m): array {
    $at = [];
    foreach (db_all("SELECT type, createdAt FROM consents WHERE studentId = ? AND status IN ('granted', 'given', 'yes') ORDER BY id", [(string)$m['memberId']]) as $r) {
        $at[(string)$r['type']] ??= substr((string)$r['createdAt'], 0, 10);
    }
    $joined = substr((string)(($m['joinDate'] ?? '') ?: ($m['createdAt'] ?? '')), 0, 10);
    return array_map(static fn($c) => ['key' => $c[0], 'label' => $c[1], 'given' => $at[$c[0]] ?? $joined], FAMILY_CONSENTS);
}

/** A mentor's free times from now on. */
function family_slots_free(string $mentorId): array {
    $now = gmdate('Y-m-d\TH:i', time() + 3600);
    return array_map(static fn($s) => ['id' => (string)$s['slotId'], 'start' => (string)$s['startAt'], 'mode' => (string)$s['mode']],
        db_all("SELECT slotId, startAt, mode FROM mentor_slots WHERE mentorId = ? AND bookedBy = '' AND startAt > ? ORDER BY startAt LIMIT " . FAMILY_SLOTS_SHOWN, [$mentorId, $now]));
}

/** The meeting booked about this child, if one is still ahead. */
function family_meeting(string $mid): ?array {
    $r = db_row("SELECT slotId, startAt, mode FROM mentor_slots WHERE memberId = ? AND bookedBy <> '' AND startAt > ? ORDER BY startAt LIMIT 1",
                [$mid, gmdate('Y-m-d\TH:i', time() + 3600)]);
    return $r ? ['slotId' => (string)$r['slotId'], 'start' => (string)$r['startAt'], 'mode' => (string)$r['mode']] : null;
}

/* ── The household inbox ───────────────────────────────────────────────── */

/** What category an older notice is, by its kind, for rows written before `cat` existed. */
function family_notice_cat(array $n): string {
    $c = (string)($n['cat'] ?? '');
    if (in_array($c, FAMILY_INBOX_CATS, true) && !($c === 'centre' && in_array((string)$n['kind'], ['fine', 'alert'], true))) return $c;
    return in_array((string)$n['kind'], ['fine', 'alert', 'safety'], true) ? 'alert' : ((string)$n['kind'] === 'report' ? 'report' : 'centre');
}

/** family.inbox — the guardian's notices, newest first, 30 a page. */
function family_inbox(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    if ($gid === '') return ['ok' => false, 'error' => 'not_found'];
    $cat = (string)($p['cat'] ?? '');
    $before = (int)($p['cursor'] ?? 0);
    $sql = 'SELECT * FROM guardian_notices WHERE guardianId = ?'; $args = [$gid];
    if ($before > 0) { $sql .= ' AND id < ?'; $args[] = $before; }
    $rows = db_all($sql . ' ORDER BY id DESC LIMIT ' . (FAMILY_INBOX_PAGE * 3), $args);
    $links = [];
    foreach (db_all("SELECT linkId, memberId FROM guardian_wards WHERE guardianId = ? AND status = 'active'", [$gid]) as $l) $links[(string)$l['memberId']] = (string)$l['linkId'];
    $out = []; $last = 0;
    foreach ($rows as $n) {
        $c = family_notice_cat($n);
        if ($cat !== '' && $cat !== $c) continue;
        $out[] = ['id' => (string)$n['noticeId'], 'cat' => $c, 'wardLinkId' => $links[(string)($n['memberId'] ?? '')] ?? null,
            'icon' => str_starts_with((string)$n['kind'], 'dues-') ? 'wallet' : ['report' => 'file-text', 'alert' => 'warning-circle', 'centre' => 'megaphone'][$c],
            'title' => (string)$n['title'], 'body' => (string)$n['body'], 'from' => (string)$n['fromName'], 'at' => (string)$n['createdAt'],
            'unread' => (string)$n['readAt'] === '', 'sign' => (int)($n['sign'] ?? 0) === 1, 'signedAt' => (string)($n['signedAt'] ?? '') ?: null,
            // An official notice opens in full on its own page (domain/notices.php).
            'href' => (string)$n['kind'] === 'notice' ? '/notice/' . rawurlencode((string)$n['refId']) : null,
            // A money notice (domain/dues-notices.php) is acted on in Fees, for that child — not just read and closed.
            'act' => in_array((string)$n['kind'], ['dues-upcoming', 'dues-arrears', 'dues-claim_decided'], true) ? 'money' : null];
        $last = (int)$n['id'];
        if (count($out) >= FAMILY_INBOX_PAGE) break;
    }
    $unread = [];
    foreach (db_all("SELECT kind, cat FROM guardian_notices WHERE guardianId = ? AND readAt = ''", [$gid]) as $n) {
        $c = family_notice_cat($n); $unread[$c] = ($unread[$c] ?? 0) + 1;
    }
    return ['ok' => true, 'rows' => $out, 'next' => count($out) >= FAMILY_INBOX_PAGE ? $last : null, 'unread' => $unread];
}

/** family.report.sign — a guardian signs a report as read. Idempotent; the mentor sees it. */
function family_report_sign(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $n = db_row('SELECT * FROM guardian_notices WHERE guardianId = ? AND noticeId = ? LIMIT 1', [$gid, (string)($p['id'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if ((int)($n['sign'] ?? 0) !== 1) return ['ok' => false, 'error' => 'not_signable'];
    if ((string)($n['signedAt'] ?? '') !== '') return ['ok' => true, 'signedAt' => (string)$n['signedAt'], 'already' => true];
    // Signing a notice is acknowledging it, for each child it is for — the same act as on the notice's own page.
    if ((string)$n['kind'] === 'notice' && function_exists('family_notice')) {
        $r = family_notice(['guardianId' => $gid, 'noticeId' => (string)$n['refId'], 'ack' => true]);
        if (empty($r['ok'])) return $r;
        return ['ok' => true, 'signedAt' => (string)($r['reader']['ackAt'] ?? now_iso())];
    }
    $now = now_iso();
    db_exec("UPDATE guardian_notices SET signedAt = ?, readAt = CASE WHEN readAt = '' THEN ? ELSE readAt END WHERE id = ?", [$now, $now, (int)$n['id']]);
    audit('family.report.sign', $gid, (string)$n['noticeId'], ['memberId' => (string)($n['memberId'] ?? '')], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'signedAt' => $now];
}

/* ── Results ───────────────────────────────────────────────────────────── */

/** The ward's member row, through the guardian's own active link. */
function family_ward_member(array $p): ?array {
    $l = family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? ''));
    if (!$l) return null;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    return $m && member_is_ngg($m) ? $m : null;
}
function family_guardian_name(string $gid): string {
    $g = db_row('SELECT fullName, email FROM guardians WHERE guardianId = ? LIMIT 1', [$gid]);
    return trim((string)($g['fullName'] ?? '')) !== '' ? (string)$g['fullName'] : 'A parent';
}

/** family.plan.sign — the guardian has read the approved plan. `already_signed` is success. */
function family_plan_sign(array $p): array {
    $m = family_ward_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $gid = (string)$p['guardianId'];
    $plan = db_row('SELECT * FROM growth_plans WHERE memberId = ? AND term = ? LIMIT 1', [(string)$m['memberId'], (string)($p['resultId'] ?? '')]);
    if (!$plan || (string)$plan['approvedAt'] === '' || !in_array((string)$plan['status'], ['sent', 'live', 'closed'], true)) return ['ok' => false, 'error' => 'not_reviewed'];
    $uid = 'guardian:' . $gid;
    $have = db_row('SELECT at FROM plan_acks WHERE planId = ? AND userId = ? LIMIT 1', [(string)$plan['planId'], $uid]);
    if ($have) return ['ok' => true, 'signedAt' => (string)$have['at'], 'already' => true];
    $now = now_iso();
    db_insert('plan_acks', ['planId' => (string)$plan['planId'], 'userId' => $uid, 'at' => $now]);
    $who = family_guardian_name($gid);
    results_log((string)$m['memberId'], (string)$plan['term'], ['id' => $uid, 'name' => $who, 'role' => 'guardian'], $who . ' read and signed the plan', 'family-sign');
    audit('family.plan.sign', $gid, (string)$plan['planId'], ['memberId' => (string)$m['memberId']], (string)($p['ip'] ?? ''));
    $mentor = results_mentor_of((string)$m['memberId']);
    if ($mentor && (string)($mentor['mentorMember'] ?? '') !== '') {
        notify_people([['memberId' => (string)$mentor['mentorMember']]], ['kind' => 'mentor', 'title' => $who . ' signed ' . mp_first((string)$m['fullName']) . '’s plan',
            'intro' => 'Home has read the plan you approved.', 'body' => '', 'linkPage' => 'mentor', 'ctaPath' => '/mentor/ngg', 'ctaLabel' => 'Open the mentor portal →', 'email' => false]);
    }
    return ['ok' => true, 'signedAt' => $now];
}

/** family.results.remind — a nudge to the child on the member app. Once a day. */
function family_results_remind(array $p): array {
    $m = family_ward_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $term = (string)($p['resultId'] ?? '');
    if (!results_term_parse($term)) return ['ok' => false, 'error' => 'bad_term'];
    $mid = (string)$m['memberId'];
    $last = db_row("SELECT at FROM results_log WHERE memberId = ? AND kind = 'family-remind' ORDER BY id DESC LIMIT 1", [$mid]);
    if ($last && strtotime((string)$last['at']) > time() - FAMILY_REMIND_HOURS * 3600) {
        return ['ok' => false, 'error' => 'too_soon', 'detail' => mp_first((string)$m['fullName']) . ' was reminded today already.'];
    }
    $gid = (string)$p['guardianId']; $who = family_guardian_name($gid);
    $t = results_term_parse($term);
    results_log($mid, $term, ['id' => 'guardian:' . $gid, 'name' => $who, 'role' => 'guardian'], $who . ' sent a reminder', 'family-remind');
    notify_people([$m], ['kind' => 'results', 'title' => 'Your ' . strtolower($t['label'] ?? 'term') . ' results are due',
        'intro' => $who . ' asked you to upload them.', 'body' => 'Upload a photo of your report in your portal. Your mentor builds your plan from it.',
        'linkPage' => 'dashboard', 'ctaPath' => '/dashboard?s=results', 'ctaLabel' => 'Upload my results →', 'email' => false]);
    return ['ok' => true, 'reminded' => results_today()];
}

/**
 * family.results.upload — a parent uploads the report for a child who has not.
 * The file arrives first through the family's own piece store (the same
 * photo_chunk_put a member's upload uses), so this receives only its URL. The
 * child is told and does the rest of the existing loop: check what was read,
 * draft the plan, send it to the mentor.
 */
function family_results_upload(array $p): array {
    $m = family_ward_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $term = (string)($p['resultId'] ?? '');
    if (!results_term_ok($m, $term)) return ['ok' => false, 'error' => 'bad_term'];
    $url = trim((string)($p['fileUrl'] ?? ''));
    $mime = strtolower(trim((string)($p['mime'] ?? '')));
    $size = (int)($p['size'] ?? 0);
    if (!results_file_ok($url)) return ['ok' => false, 'error' => 'bad_type'];
    if (!preg_match('#^(image/(jpeg|png|webp|heic|heif)|application/pdf)$#', $mime)) return ['ok' => false, 'error' => 'bad_type'];
    if ($size <= 0 || $size > RESULTS_MAX_BYTES) return ['ok' => false, 'error' => 'too_large'];
    $mid = (string)$m['memberId'];
    if (db_row('SELECT 1 FROM results_uploads WHERE memberId = ? AND term = ? LIMIT 1', [$mid, $term])) return ['ok' => false, 'error' => 'already_uploaded'];
    $gid = (string)$p['guardianId']; $who = family_guardian_name($gid); $now = now_iso();
    $uploadId = results_id('RU');
    db_insert('results_uploads', ['uploadId' => $uploadId, 'memberId' => $mid, 'term' => $term, 'fileUrl' => $url,
        'fileMime' => $mime, 'fileBytes' => $size, 'status' => 'draft', 'createdAt' => $now, 'updatedAt' => $now]);
    results_log($mid, $term, ['id' => 'guardian:' . $gid, 'name' => $who, 'role' => 'guardian'], $who . ' uploaded the report', 'upload');
    audit('family.results.upload', $gid, $uploadId, ['memberId' => $mid, 'term' => $term], (string)($p['ip'] ?? ''));
    $t = results_term_parse($term);
    notify_people([$m], ['kind' => 'results', 'title' => $who . ' uploaded your ' . strtolower($t['label'] ?? 'term') . ' report',
        'intro' => 'Check the scores that were read off it, then write your plan.', 'body' => '',
        'linkPage' => 'dashboard', 'ctaPath' => '/dashboard?s=results', 'ctaLabel' => 'Check my results →', 'email' => false]);
    return ['ok' => true, 'uploadId' => $uploadId, 'status' => 'processing'];
}

/* ── Events and RSVPs ──────────────────────────────────────────────────── */

/** family.events — what is coming up at the centres of this family's children. */
function family_events(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    if ($gid === '') return ['ok' => false, 'error' => 'not_found'];
    $centres = array_values(array_unique(array_column(db_all("SELECT m.centre FROM guardian_wards w JOIN members m ON m.memberId = w.memberId
                                                             WHERE w.guardianId = ? AND w.status = 'active'", [$gid]), 'centre')));
    $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['from'] ?? '')) ? (string)$p['from'] : gmdate('Y-m-d', time() + 3600);
    $ph = $centres ? implode(',', array_fill(0, count($centres), '?')) : "''";
    $rows = db_all("SELECT * FROM events WHERE status = 'published' AND substr(startAt, 1, 10) >= ? AND (centre IN ('Both', 'Online', '') OR centre IN ($ph))
                    ORDER BY startAt LIMIT " . FAMILY_EVENTS_SHOWN, array_merge([$from], $centres));
    $rsvp = [];
    foreach (db_all('SELECT eventId, answer FROM guardian_rsvps WHERE guardianId = ?', [$gid]) as $r) $rsvp[(string)$r['eventId']] = (string)$r['answer'];
    return ['ok' => true, 'rows' => array_map(static fn($e) => [
        'id' => (string)$e['eventId'], 'date' => substr((string)$e['startAt'], 0, 10), 'time' => substr((string)$e['startAt'], 11, 5),
        'end' => substr((string)($e['endAt'] ?? ''), 11, 5), 'title' => (string)$e['title'], 'where' => trim((string)($e['location'] ?? '') ?: (string)$e['centre']),
        'kind' => (string)($e['kind'] ?? ''), 'expected' => (int)($e['familiesExpected'] ?? 0) === 1, 'closed' => (string)($e['kind'] ?? '') === 'closure',
    ], $rows), 'rsvp' => $rsvp];
}

/** family.rsvp — `yes` or `no`, one row per guardian per event. */
function family_rsvp(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $answer = (string)($p['answer'] ?? '');
    if (!in_array($answer, ['yes', 'no'], true)) return ['ok' => false, 'error' => 'bad_answer'];
    $e = db_row("SELECT * FROM events WHERE eventId = ? AND status = 'published' LIMIT 1", [(string)($p['eventId'] ?? '')]);
    if (!$e) return ['ok' => false, 'error' => 'not_found'];
    if ((string)($e['kind'] ?? '') === 'closure' || substr((string)$e['startAt'], 0, 10) < gmdate('Y-m-d', time() + 3600)) return ['ok' => false, 'error' => 'closed'];
    db_upsert('guardian_rsvps', ['guardianId' => $gid, 'eventId' => (string)$e['eventId'], 'answer' => $answer, 'reminded' => 0, 'updatedAt' => now_iso()],
        ['guardianId', 'eventId'], ['answer' => $answer, 'updatedAt' => now_iso()]);
    return ['ok' => true, 'answer' => $answer];
}

/* ── Meeting the mentor ────────────────────────────────────────────────── */

/** family.mentor.book — take one of the mentor's free times; any earlier booking about this child is freed. */
function family_mentor_book(array $p): array {
    $m = family_ward_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $mid = (string)$m['memberId']; $gid = (string)$p['guardianId'];
    $mentor = results_mentor_of($mid);
    if (!$mentor) return ['ok' => false, 'error' => 'no_mentor'];
    $slot = db_row('SELECT * FROM mentor_slots WHERE slotId = ? AND mentorId = ? LIMIT 1', [(string)($p['slotId'] ?? ''), (string)$mentor['mentorId']]);
    if (!$slot || (string)$slot['startAt'] <= gmdate('Y-m-d\TH:i', time() + 3600)) return ['ok' => false, 'error' => 'slot_taken'];
    $now = now_iso();
    // The claim is the UPDATE: two families pressing at once, one row changes.
    $n = db_exec("UPDATE mentor_slots SET bookedBy = ?, memberId = ?, bookedAt = ?, reminded = 0 WHERE slotId = ? AND bookedBy = ''", ['guardian:' . $gid, $mid, $now, (string)$slot['slotId']]);
    if (!$n) return ['ok' => false, 'error' => 'slot_taken', 'slots' => family_slots_free((string)$mentor['mentorId'])];
    db_exec("UPDATE mentor_slots SET bookedBy = '', memberId = '', bookedAt = '' WHERE memberId = ? AND bookedBy = ? AND slotId <> ? AND startAt > ?",
            [$mid, 'guardian:' . $gid, (string)$slot['slotId'], gmdate('Y-m-d\TH:i', time() + 3600)]);
    audit('family.mentor.book', $gid, (string)$slot['slotId'], ['memberId' => $mid], (string)($p['ip'] ?? ''));
    if ((string)($mentor['mentorMember'] ?? '') !== '') {
        notify_people([['memberId' => (string)$mentor['mentorMember']]], ['kind' => 'mentor', 'title' => family_guardian_name($gid) . ' booked a meeting',
            'intro' => 'About ' . (string)$m['fullName'] . ', ' . family_when((string)$slot['startAt']) . ($slot['mode'] === 'phone' ? ', by phone.' : ', at the centre.'),
            'body' => '', 'linkPage' => 'mentor', 'ctaPath' => '/mentor/ngg', 'ctaLabel' => 'Open the mentor portal →']);
    }
    return ['ok' => true, 'meeting' => ['slotId' => (string)$slot['slotId'], 'start' => (string)$slot['startAt'], 'mode' => (string)$slot['mode']]];
}

/** "Sat 31 Oct, 14:15" for a slot's start. */
function family_when(string $start): string {
    $t = strtotime(substr($start, 0, 16) . ':00Z');
    return $t ? gmdate('D j M, H:i', $t) : $start;
}

/* ── A mentor's bookable times (mentor portal) ────────────────────────── */

/** member.mentor slots — the signed-in mentor's own times from today, booked or not. */
function member_mp_slots(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $me = (string)($g['mentorId'] ?? '');
    if ($me === '') return ['ok' => false, 'error' => 'not_a_mentor'];
    $rows = db_all("SELECT s.*, m.fullName FROM mentor_slots s LEFT JOIN members m ON m.memberId = s.memberId WHERE s.mentorId = ? AND s.startAt >= ? ORDER BY s.startAt LIMIT 60",
                   [$me, gmdate('Y-m-d', time() + 3600)]);
    return ['ok' => true, 'slots' => array_map(static fn($s) => ['id' => (string)$s['slotId'], 'start' => (string)$s['startAt'], 'mode' => (string)$s['mode'],
        'booked' => (string)$s['bookedBy'] !== '', 'about' => (string)($s['fullName'] ?? '')], $rows)];
}
/** member.mentor slot.add — a free time families may book: `start` as YYYY-MM-DDTHH:MM (Lagos), `mode` centre|phone. */
function member_mp_slot_add(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $me = (string)($g['mentorId'] ?? '');
    if ($me === '') return ['ok' => false, 'error' => 'not_a_mentor'];
    $start = (string)($p['start'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $start) || $start <= gmdate('Y-m-d\TH:i', time() + 3600)) return ['ok' => false, 'error' => 'bad_time', 'detail' => 'Pick a time from now on.'];
    $mode = (string)($p['mode'] ?? 'centre') === 'phone' ? 'phone' : 'centre';
    if (db_row('SELECT 1 FROM mentor_slots WHERE mentorId = ? AND startAt = ? LIMIT 1', [$me, $start])) return ['ok' => false, 'error' => 'duplicate', 'detail' => 'That time is already listed.'];
    db_insert('mentor_slots', ['slotId' => 'SLOT-' . strtoupper(rand_hex(5)), 'mentorId' => $me, 'startAt' => $start, 'mode' => $mode, 'createdAt' => now_iso()]);
    return member_mp_slots($p);
}
/** member.mentor slot.remove — only an unbooked time; a booked one is the family's until they change it. */
function member_mp_slot_remove(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $n = db_exec("DELETE FROM mentor_slots WHERE slotId = ? AND mentorId = ? AND bookedBy = ''", [(string)($p['slotId'] ?? ''), (string)($g['mentorId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'booked', 'detail' => 'A family has booked that time. Ask them to change it first.'];
    return member_mp_slots($p);
}

/* ── Staff: who may collect a child ────────────────────────────────────── */

/** admin.member.collectors — read or replace the list (people, centre-scoped). */
function admin_member_collectors(array $p): array {
    $gate = admin_cap_gate($p, 'people'); if (empty($gate['ok'])) return $gate;
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT memberId, centre FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($gate['requester'], (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    if (array_key_exists('collectors', $p)) {
        $list = [];
        foreach (array_slice((array)$p['collectors'], 0, 8) as $c) {
            $name = trim(preg_replace('/\s+/', ' ', (string)($c['name'] ?? '')));
            if ($name === '') continue;
            $phone = trim((string)($c['phone'] ?? ''));
            if ($phone !== '' && !preg_match('/^[+0-9 ()-]{7,24}$/', $phone)) return ['ok' => false, 'error' => 'bad_phone', 'detail' => 'Check the phone number for ' . $name . '.'];
            $list[] = ['name' => mb_substr($name, 0, 160), 'relation' => mb_substr(trim((string)($c['relation'] ?? '')), 0, 60), 'phone' => $phone];
        }
        db_exec('DELETE FROM member_collectors WHERE memberId = ?', [$mid]);
        foreach ($list as $c) db_insert('member_collectors', $c + ['memberId' => $mid, 'createdBy' => (string)($p['requesterId'] ?? ''), 'createdAt' => now_iso()]);
        audit('admin.member.collectors', (string)($p['requesterId'] ?? ''), $mid, ['count' => count($list)], (string)($p['ip'] ?? ''));
    }
    return ['ok' => true, 'collectors' => db_all('SELECT name, relation, phone FROM member_collectors WHERE memberId = ? ORDER BY id', [$mid])];
}

/* ── Background: monthly reports, event and meeting reminders ─────────── */

/**
 * The monthly report, on the first days of a month: one per active link, in
 * the guardian's inbox, asking for a signature. The unique (guardian, kind,
 * refId) index makes a second run a no-op, so the job is safe to re-run.
 */
function family_reports_run(?string $today = null, int $limit = 200): array {
    /* The formal report (domain/parent-reports.php) replaces this short note: the same inbox notice, signable, keyed
       the same way, plus the full report by email and a printable copy sealed on file. */
    if (function_exists('preport_monthly_run')) return preport_monthly_run($today, $limit);
    $today = $today ?: attendance_today();
    if ((int)substr($today, 8, 2) > 3) return ['ok' => true, 'made' => 0, 'skipped' => 'not_the_start_of_a_month'];
    $month = gmdate('Y-m', strtotime(substr($today, 0, 7) . '-01T12:00:00Z') - 86400);
    $label = gmdate('F', strtotime($month . '-01T12:00:00Z'));
    $made = 0;
    $links = db_all("SELECT w.guardianId, m.* FROM guardian_wards w JOIN members m ON m.memberId = w.memberId
                     WHERE w.status = 'active' AND m.status = 'active' AND NOT EXISTS (SELECT 1 FROM guardian_notices n WHERE n.guardianId = w.guardianId AND n.kind = 'report' AND n.refId = ('report:' || ? || ':' || w.memberId))
                     LIMIT " . (int)$limit, [$month]);
    foreach ($links as $m) {
        $first = mp_first((string)$m['fullName']);
        $att = db_row("SELECT SUM(CASE WHEN status IN ('present','late','tardy') THEN 1 ELSE 0 END) here, SUM(CASE WHEN status IN ('late','tardy') THEN 1 ELSE 0 END) late
                       FROM attendance WHERE studentId = ? AND substr(date, 1, 7) = ?", [(string)$m['memberId'], $month]);
        $sc = db_row("SELECT total FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'mentor' AND month <= ? ORDER BY month DESC LIMIT 1", [(string)$m['memberId'], $month]);
        $learn = function_exists('curriculum_for_member') ? curriculum_for_member($m) : null;
        $lines = [
            $first . ' was at ' . (int)($att['here'] ?? 0) . ' Saturday' . ((int)($att['here'] ?? 0) === 1 ? '' : 's') . ' in ' . $label . ((int)($att['late'] ?? 0) ? ', late to ' . (int)$att['late'] : '') . '.',
            $sc ? 'Leadership index: ' . (int)$sc['total'] . ' of 100.' : 'No Leadership Index yet; the first comes after four Saturdays.',
            $learn ? 'Lessons: ' . (int)$learn['completed'] . ' of ' . (int)$learn['total'] . ' done' . ((int)$learn['overdue'] ? ', ' . (int)$learn['overdue'] . ' overdue' : '') . '.' : '',
        ];
        if (family_notice_add((string)$m['guardianId'], 'report', 'report:' . $month . ':' . (string)$m['memberId'], $first . '’s ' . $label . ' report',
            implode("\n", array_filter($lines)) . "\n\nSign it so " . $first . '’s mentor knows home has seen it.', 'NGG')) {
            db_exec("UPDATE guardian_notices SET cat = 'report', memberId = ?, sign = 1 WHERE guardianId = ? AND kind = 'report' AND refId = ?",
                    [(string)$m['memberId'], (string)$m['guardianId'], 'report:' . $month . ':' . (string)$m['memberId']]);
            $made++;
        }
    }
    return ['ok' => true, 'made' => $made, 'month' => $month];
}

/**
 * Reminders: guardians who have not answered an event families are expected
 * at (three days and one day before), and both sides of a mentor meeting the
 * day before. Each is marked once sent, so a re-run sends nothing twice.
 */
function family_reminders_run(?string $today = null): array {
    $today = $today ?: attendance_today();
    $sent = 0;
    foreach ([3, 1] as $days) {
        $on = gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') + $days * 86400);
        foreach (db_all("SELECT * FROM events WHERE status = 'published' AND familiesExpected = 1 AND substr(startAt, 1, 10) = ?", [$on]) as $e) {
            $gs = db_all("SELECT DISTINCT w.guardianId FROM guardian_wards w JOIN members m ON m.memberId = w.memberId
                          WHERE w.status = 'active' AND (? IN ('Both', 'Online', '') OR m.centre = ?)
                          AND NOT EXISTS (SELECT 1 FROM guardian_rsvps r WHERE r.guardianId = w.guardianId AND r.eventId = ?)", [(string)$e['centre'], (string)$e['centre'], (string)$e['eventId']]);
            foreach ($gs as $g) {
                if (family_notice_add((string)$g['guardianId'], 'event-reminder', (string)$e['eventId'] . ':' . $days, 'Can you come? ' . (string)$e['title'],
                    family_when(substr((string)$e['startAt'], 0, 16)) . '. Families are expected. Reply in Saturdays → Coming up.', 'NGG')) $sent++;
            }
        }
    }
    $tomorrow = gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') + 86400);
    foreach (db_all("SELECT s.*, m.fullName FROM mentor_slots s JOIN members m ON m.memberId = s.memberId WHERE s.bookedBy <> '' AND s.reminded = 0 AND substr(s.startAt, 1, 10) = ?", [$tomorrow]) as $s) {
        $gid = substr((string)$s['bookedBy'], 9);
        family_notice_add($gid, 'meeting-reminder', (string)$s['slotId'], 'Tomorrow: meeting about ' . mp_first((string)$s['fullName']),
            family_when((string)$s['startAt']) . ((string)$s['mode'] === 'phone' ? ', by phone.' : ', at the centre.'), 'NGG');
        $mentor = db_row('SELECT memberId FROM mentors WHERE mentorId = ? LIMIT 1', [(string)$s['mentorId']]);
        if ($mentor && (string)$mentor['memberId'] !== '') notify_people([['memberId' => (string)$mentor['memberId']]], ['kind' => 'mentor',
            'title' => 'Tomorrow: a family meeting', 'intro' => 'About ' . (string)$s['fullName'] . ', ' . family_when((string)$s['startAt']) . '.', 'body' => '', 'linkPage' => 'mentor', 'ctaPath' => '/mentor/ngg', 'ctaLabel' => 'Open →']);
        db_exec('UPDATE mentor_slots SET reminded = 1 WHERE id = ?', [(int)$s['id']]);
        $sent++;
    }
    return ['ok' => true, 'sent' => $sent];
}
