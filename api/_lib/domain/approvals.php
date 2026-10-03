<?php
declare(strict_types=1);

/*
 * Approvals — a club admin's sensitive actions wait for a second admin.
 *
 * The club admin holds `people` (members, centres, volunteers) so the Club
 * desk can run itself. The actions that cannot be walked back, or that take
 * somebody's access away, are not refused for them — they are QUEUED, and run
 * only when an admin who is not a club admin (and not the requester) approves.
 * A refusal would push the work onto somebody else to redo from scratch; a
 * queue keeps the request exactly as it was made, with who made it.
 *
 * One seam: backend_dispatch() asks approval_intercept() before running any
 * op, so a sensitive op cannot be reached around the queue by another screen.
 * On approval the op runs AS THE REQUESTER — the op's own checks (own account,
 * staff account, centre scope) still apply to the person who asked — with the
 * approver recorded on the approval and in the audit trail.
 */

const APPROVAL_LOCKOUT = ['suspended', 'inactive', 'evicted', 'deactivated', 'archived'];

/** True while an approved request is being run, so it is not queued again. */
function approval_running(?bool $set = null): bool {
    static $on = false;
    if ($set !== null) $on = $set;
    return $on;
}

/** Whose sensitive actions wait for approval: the club admin role. */
function approval_bound(?array $requester): bool {
    return $requester !== null && strtolower((string)($requester['role'] ?? '')) === 'club_admin';
}

/**
 * Whether `$op` with `$args` is sensitive, and if so a sentence saying what it
 * would do. Null means it runs straight away.
 */
function approval_summary(string $op, array $args): ?string {
    $name = static function (string $id): string {
        $m = $id !== '' ? db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$id]) : null;
        return $m ? (string)$m['fullName'] . ' (' . $id . ')' : $id;
    };
    $data = is_array($args['data'] ?? null) ? $args['data'] : [];
    switch ($op) {
        /* Erasing a member and resetting somebody's sign-in are super-admin
           acts (admin_is_super); a club admin is refused them, not queued —
           an approval would run them as the requester, who still cannot. */
        case 'admin.members.merge':
            // Without confirm it is a preview: it changes nothing, so it runs.
            if (empty($args['confirm'])) return null;
            return 'Merge ' . $name((string)($args['mergeId'] ?? '')) . ' into ' . $name((string)($args['keepId'] ?? ''));
        case 'admin.members.demoteNgv':
            return 'Withdraw NextGen Vanguard from ' . $name((string)($args['memberId'] ?? ''));
        case 'admin.members.bulk':
        case 'admin.club.members.bulk':
            $ids = is_array($args['memberIds'] ?? null) ? $args['memberIds'] : [];
            $to = (string)($args['status'] ?? '');
            if ((string)($args['action'] ?? '') !== 'status' || !in_array($to, APPROVAL_LOCKOUT, true)) return null;
            /* What the op refuses outright needs nobody's approval: a status the
               Club desk does not set, and rows that are the caller's own or a
               staff account. Queue only when something would actually change. */
            if ($op === 'admin.club.members.bulk' && !in_array($to, CLUB_BULK_STATUSES, true)) return null;
            $rid = (string)($args['requesterId'] ?? '');
            $live = array_filter($ids, static function ($id) use ($rid) {
                $m = db_row('SELECT memberId, role FROM members WHERE memberId = ? LIMIT 1', [(string)$id]);
                return $m && (string)$m['memberId'] !== $rid && !is_admin_role((string)$m['role']);
            });
            if (!$live) return null;
            return 'Set ' . count($ids) . ' member' . (count($ids) === 1 ? '' : 's') . ' to ' . $to;
        case 'admin.members.upsert':
            $id = (string)($data['memberId'] ?? '');
            $to = (string)($data['status'] ?? '');
            if ($id === '' || !in_array($to, APPROVAL_LOCKOUT, true)) return null;
            $cur = db_row('SELECT status FROM members WHERE memberId = ? LIMIT 1', [$id]);
            return ($cur && (string)$cur['status'] !== $to) ? 'Set ' . $name($id) . ' to ' . $to : null;
        case 'admin.centres.delete':
            $c = db_row('SELECT centreId, name FROM centres WHERE centreId = ? LIMIT 1', [(string)($args['centreId'] ?? '')]);
            /* A plain delete of a centre in use is refused by the op itself
               (centre_in_use, with the counts and the retire option). That
               answer changes nothing and is what the screen needs, so it runs. */
            if ($c && empty($args['retire']) && empty($args['force'])) {
                $n = (int)(db_row('SELECT COUNT(*) c FROM members WHERE centre = ?', [$c['name']])['c'] ?? 0)
                   + (int)(db_row('SELECT COUNT(*) c FROM summer_students WHERE centre = ?', [$c['name']])['c'] ?? 0)
                   + (int)(db_row('SELECT COUNT(*) c FROM summer_groups WHERE centreId = ?', [$c['centreId']])['c'] ?? 0)
                   + (int)(db_row('SELECT COUNT(*) c FROM volunteers WHERE centre = ?', [$c['name']])['c'] ?? 0);
                if ($n > 0) return null;
            }
            return (!empty($args['retire']) ? 'Retire' : 'Delete') . ' the centre ' . ($c ? $c['name'] : (string)($args['centreId'] ?? ''));
        case 'admin.centres.upsert':
            /* Renaming or re-coding a centre changes every member's printed
               prefix and what their record points at. Creating one does not. */
            $d = is_array($args['data'] ?? null) ? $args['data'] : $args;
            $id = (string)($d['centreId'] ?? '');
            $cur = $id !== '' ? db_row('SELECT name, code FROM centres WHERE centreId = ? LIMIT 1', [$id]) : null;
            if (!$cur) return null;
            $newName = substr(trim((string)($d['name'] ?? $cur['name'])), 0, 80);
            $newCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($d['code'] ?? $cur['code'])) ?? '');
            return ($newName !== (string)$cur['name'] || $newCode !== (string)$cur['code'])
                ? 'Rename the centre ' . $cur['name'] . ' (' . $cur['code'] . ') to ' . $newName . ' (' . $newCode . ')' : null;
        case 'admin.volunteers.delete':
            return 'Delete the volunteer ' . (string)($args['volunteerId'] ?? '');
        case 'admin.volunteers.update':
            $to = (string)($data['status'] ?? '');
            if (!in_array($to, APPROVAL_LOCKOUT, true)) return null;
            // The editor sends every field; an unchanged status is not a change.
            $cur = db_row('SELECT fullName, status FROM volunteers WHERE volunteerId = ? LIMIT 1', [(string)($args['volunteerId'] ?? '')]);
            if (!$cur || (string)$cur['status'] === $to) return null;
            return 'Set the volunteer ' . $cur['fullName'] . ' (' . (string)$args['volunteerId'] . ') to ' . $to;
    }
    return null;
}

/**
 * Called by backend_dispatch() before every op. Returns null to let the op
 * run, or the reply for a request that has been queued instead.
 */
function approval_intercept(string $op, array $args): ?array {
    if (approval_running()) return null;
    $rid = (string)($args['requesterId'] ?? '');
    if ($rid === '') return null;
    $requester = db_row('SELECT memberId, role FROM members WHERE memberId = ? LIMIT 1', [$rid]);
    if (!approval_bound($requester)) return null;
    $summary = approval_summary($op, $args);
    if ($summary === null) return null;
    // Only somebody who could make the request at all may queue it.
    $g = admin_gate($args); if (!$g['ok']) return $g;
    $keep = $args;
    unset($keep['ip'], $keep['gateAuthorized'], $keep['byId']);
    $id = 'APR-' . strtoupper(rand_hex(6));
    db_insert('admin_approvals', [
        'approvalId' => $id, 'op' => $op, 'args' => json_encode($keep, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'summary' => mb_substr($summary, 0, 480), 'requesterId' => $rid, 'status' => 'pending', 'createdAt' => now_iso(),
    ]);
    audit('approval.requested', $rid, $id, ['op' => $op, 'summary' => $summary], (string)($args['ip'] ?? ''));
    // Everybody who can decide it is told — in the app and by email.
    $who = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$rid]);
    notify_people(staff_with_cap('people', [$rid], static fn($m) => !approval_bound($m)), [
        'kind' => 'approval', 'title' => 'Waiting for your approval: ' . mb_substr($summary, 0, 90),
        'intro' => ((string)($who['fullName'] ?? $rid)) . ' (club admin) asked for this, and it needs a second admin before it happens.',
        'body' => $summary . "\n\nApprove or reject it in Control Room → People → Approvals.",
        'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=approvals', 'ctaLabel' => 'Review it →']);
    return ['ok' => false, 'error' => 'approval_pending', 'approvalId' => $id, 'summary' => $summary,
            'message' => 'Sent to an admin for approval. Nothing changes until it is approved.'];
}

function approval_public(array $r): array {
    $who = static function (string $id): string {
        $m = $id !== '' ? db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$id]) : null;
        return $m ? (string)$m['fullName'] : $id;
    };
    $res = json_decode((string)($r['result'] ?? ''), true);
    return [
        'approvalId' => $r['approvalId'], 'op' => $r['op'], 'summary' => $r['summary'], 'status' => $r['status'],
        'requesterId' => $r['requesterId'], 'requesterName' => $who((string)$r['requesterId']),
        'decidedBy' => (string)$r['decidedBy'], 'decidedByName' => $who((string)$r['decidedBy']),
        'decidedAt' => (string)$r['decidedAt'], 'reason' => (string)$r['reason'], 'createdAt' => (string)$r['createdAt'],
        'resultError' => is_array($res) && empty($res['ok']) ? (string)($res['error'] ?? 'refused') : '',
    ];
}

/** The queue. A club admin sees their own requests; an approver sees all. */
function admin_approvals_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? 'pending');
    if (!in_array($status, ['pending', 'approved', 'rejected', 'failed', 'withdrawn', 'all'], true)) $status = 'pending';
    $where = []; $args = [];
    if ($status !== 'all') { $where[] = 'status = ?'; $args[] = $status; }
    $mine = approval_bound($g['requester']);
    if ($mine) { $where[] = 'requesterId = ?'; $args[] = (string)$g['requester']['memberId']; }
    $rows = db_all('SELECT * FROM admin_approvals' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 200', $args);
    $pending = (int)(db_row('SELECT COUNT(*) c FROM admin_approvals WHERE status = ?' . ($mine ? ' AND requesterId = ?' : ''),
        $mine ? ['pending', (string)$g['requester']['memberId']] : ['pending'])['c'] ?? 0);
    return ['ok' => true, 'approvals' => array_map('approval_public', $rows), 'pending' => $pending, 'canDecide' => !$mine];
}

/**
 * Approve (run it, as the requester) or reject. Two people, always: the
 * approver holds `people`, is not a club admin, and is not the requester.
 */
function admin_approvals_decide(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    if (approval_bound($g['requester'])) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'approver_required'];
    $row = db_row('SELECT * FROM admin_approvals WHERE approvalId = ? LIMIT 1', [(string)($p['approvalId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['status'] !== 'pending') return ['ok' => false, 'error' => 'already_decided', 'status' => $row['status']];
    $me = (string)$g['requester']['memberId'];
    if ($me === (string)$row['requesterId']) return ['ok' => false, 'error' => 'own_request'];
    $decision = (string)($p['decision'] ?? '');
    if (!in_array($decision, ['approve', 'reject'], true)) return ['ok' => false, 'error' => 'bad_decision'];
    $reason = mb_substr(trim((string)($p['reason'] ?? '')), 0, 480);
    if ($decision === 'reject') {
        db_update('admin_approvals', ['status' => 'rejected', 'decidedBy' => $me, 'decidedAt' => now_iso(), 'reason' => $reason], ['approvalId' => $row['approvalId']]);
        audit('approval.rejected', $me, (string)$row['approvalId'], ['op' => $row['op'], 'requester' => $row['requesterId'], 'reason' => $reason], (string)($p['ip'] ?? ''));
        approval_tell_requester($row, 'rejected', $reason, (string)$g['requester']['fullName']);
        return ['ok' => true, 'status' => 'rejected'];
    }
    /* Claim it first, so two approvers pressing at once run it once. */
    $claimed = db_exec("UPDATE admin_approvals SET status = 'running', decidedBy = ?, decidedAt = ? WHERE approvalId = ? AND status = 'pending'", [$me, now_iso(), $row['approvalId']]);
    if ($claimed < 1) return ['ok' => false, 'error' => 'already_decided'];
    $args = json_decode((string)$row['args'], true);
    $args = is_array($args) ? $args : [];
    $args['requesterId'] = (string)$row['requesterId'];
    $args['ip'] = (string)($p['ip'] ?? '');
    approval_running(true);
    try { $res = backend_dispatch((string)$row['op'], $args); }
    finally { approval_running(false); }
    $ok = !empty($res['ok']);
    db_update('admin_approvals', ['status' => $ok ? 'approved' : 'failed', 'reason' => $reason,
        'result' => json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)], ['approvalId' => $row['approvalId']]);
    audit('approval.approved', $me, (string)$row['approvalId'], ['op' => $row['op'], 'requester' => $row['requesterId'], 'ran' => $ok, 'error' => $res['error'] ?? null], (string)($p['ip'] ?? ''));
    approval_tell_requester($row, $ok ? 'approved' : 'failed', $ok ? $reason : (string)($res['error'] ?? 'refused'), (string)$g['requester']['fullName']);
    return ['ok' => true, 'status' => $ok ? 'approved' : 'failed', 'result' => $res];
}

/** The club admin who asked is told the outcome, in the app and by email. */
function approval_tell_requester(array $row, string $outcome, string $why, string $byName): void {
    $m = db_row('SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1', [(string)$row['requesterId']]);
    if (!$m) return;
    $title = ['approved' => 'Approved and done', 'rejected' => 'Not approved', 'failed' => 'Approved, but it could not run'][$outcome] ?? 'Decided';
    notify_people([$m], ['kind' => 'approval', 'title' => $title . ': ' . mb_substr((string)$row['summary'], 0, 90),
        'intro' => $byName . ' looked at your request.',
        'body' => (string)$row['summary'] . ($why !== '' ? "\n\n" . ($outcome === 'failed' ? 'What went wrong: ' : 'Note: ') . $why : ''),
        'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=approvals', 'ctaLabel' => 'See it →']);
}

/** The requester changes their mind before anybody decides. */
function admin_approvals_withdraw(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $n = db_exec("UPDATE admin_approvals SET status = 'withdrawn', decidedBy = ?, decidedAt = ? WHERE approvalId = ? AND requesterId = ? AND status = 'pending'",
        [(string)$g['requester']['memberId'], now_iso(), (string)($p['approvalId'] ?? ''), (string)$g['requester']['memberId']]);
    return $n > 0 ? ['ok' => true, 'status' => 'withdrawn'] : ['ok' => false, 'error' => 'not_found'];
}
