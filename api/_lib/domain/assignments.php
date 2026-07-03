<?php
declare(strict_types=1);

/**
 * Assignments — mentor/admin-set work with per-member submissions + grading.
 * Distinct from Anchor missions (fixed XP curriculum). DB column `answerText`
 * is surfaced to the client as `text`.
 */

function assignment_matches_member(array $a, array $member, string $currentSessionId): bool {
    $c = (string)($a['centre'] ?? '');
    if ($c !== '' && $c !== 'All' && $c !== 'Both' && $c !== (string)$member['centre']) return false;
    $track = (string)($a['track'] ?? '');
    if ($track !== '' && $track !== 'All' && $track !== (string)($member['track'] ?? '')) return false;
    $sid = (string)($a['sessionId'] ?? '');
    if ($sid !== '' && $currentSessionId !== '' && $sid !== $currentSessionId) return false;
    return true;
}

function assignment_list_for_member(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    $sc = session_current();
    $currentSessionId = $sc['current']['sessionId'] ?? '';

    $subs = [];
    foreach (db_all('SELECT * FROM assignment_submissions WHERE memberId = ?', [$memberId]) as $r) {
        $subs[$r['assignmentId']] = $r;
    }

    $rows = db_all("SELECT * FROM assignments WHERE status='published' ORDER BY COALESCE(NULLIF(dueAt,''), createdAt)");
    $out = [];
    foreach ($rows as $a) {
        if (!assignment_matches_member($a, $member, $currentSessionId)) continue;
        $sub = $subs[$a['assignmentId']] ?? null;
        $out[] = [
            'assignmentId' => $a['assignmentId'], 'title' => $a['title'], 'instructions' => $a['instructions'],
            'track' => $a['track'] ?: '', 'week' => (int)$a['week'], 'dueAt' => $a['dueAt'] ?: '',
            'points' => (int)$a['points'], 'proof' => $a['proof'] ?: 'text',
            'attachmentUrl' => normalize_image_url($a['attachmentUrl'] ?? ''),
            'submission' => $sub ? [
                'submissionId' => $sub['submissionId'], 'status' => $sub['status'] ?: 'submitted',
                'text' => $sub['answerText'] ?: '', 'fileUrl' => $sub['fileUrl'] ?: '',
                'grade' => ($sub['grade'] === null || $sub['grade'] === '') ? null : (int)$sub['grade'],
                'feedback' => $sub['feedback'] ?: '', 'submittedAt' => $sub['submittedAt'] ?: '', 'gradedAt' => $sub['gradedAt'] ?: '',
            ] : null,
        ];
    }
    return ['ok' => true, 'assignments' => $out];
}

function assignment_submit(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $assignmentId = (string)($p['assignmentId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'member_not_found'];
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$assignmentId]);
    if (!$a) return ['ok' => false, 'error' => 'assignment_not_found'];
    if ((string)$a['status'] !== 'published') return ['ok' => false, 'error' => 'not_open'];

    $sc = session_current();
    $sessionId = (string)($a['sessionId'] ?: ($sc['current']['sessionId'] ?? ''));
    $text = (string)($p['text'] ?? '');
    $fileUrl = (string)($p['fileUrl'] ?? '');
    if ($text === '' && $fileUrl === '') return ['ok' => false, 'error' => 'empty_submission'];

    $existing = db_row('SELECT * FROM assignment_submissions WHERE assignmentId = ? AND memberId = ? LIMIT 1', [$assignmentId, $memberId]);
    if ($existing && (string)$existing['status'] === 'graded') return ['ok' => false, 'error' => 'already_graded'];

    if ($existing) {
        db_update('assignment_submissions', ['answerText' => $text, 'fileUrl' => $fileUrl, 'status' => 'submitted', 'submittedAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('assignment_submissions', [
            'submissionId' => 'SUB-' . gmdate('Y') . '-' . rand_hex(4), 'assignmentId' => $assignmentId,
            'memberId' => $memberId, 'sessionId' => $sessionId, 'answerText' => $text, 'fileUrl' => $fileUrl,
            'status' => 'submitted', 'grade' => null, 'feedback' => '', 'gradedBy' => '', 'gradedAt' => '',
            'submittedAt' => now_iso(), 'createdAt' => now_iso(),
        ]);
    }
    audit('assignment.submit', $memberId, $assignmentId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_assignments_list(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $counts = [];
    foreach (db_all("SELECT assignmentId, COUNT(*) c, SUM(CASE WHEN status='graded' THEN 1 ELSE 0 END) g FROM assignment_submissions GROUP BY assignmentId") as $r) {
        $counts[$r['assignmentId']] = ['c' => (int)$r['c'], 'g' => (int)$r['g']];
    }
    $rows = db_all('SELECT * FROM assignments ORDER BY createdAt DESC');
    $out = array_map(function ($a) use ($counts) {
        return [
            'assignmentId' => $a['assignmentId'], 'title' => $a['title'], 'instructions' => $a['instructions'] ?: '',
            'track' => $a['track'] ?: '', 'centre' => $a['centre'] ?: '', 'sessionId' => $a['sessionId'] ?: '',
            'week' => (int)$a['week'], 'dueAt' => $a['dueAt'] ?: '', 'points' => (int)$a['points'],
            'proof' => $a['proof'] ?: 'text', 'attachmentUrl' => $a['attachmentUrl'] ?: '', 'status' => $a['status'] ?: 'draft',
            'submissionCount' => $counts[$a['assignmentId']]['c'] ?? 0, 'gradedCount' => $counts[$a['assignmentId']]['g'] ?? 0,
        ];
    }, $rows);
    return ['ok' => true, 'assignments' => $out];
}

function admin_assignments_upsert(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    $assignmentId = trim((string)($data['assignmentId'] ?? ''));
    $cols = ['title','instructions','track','sessionId','week','dueAt','points','attachmentUrl','proof','centre','status'];
    $existing = $assignmentId ? db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$assignmentId]) : null;
    $wasPublished = $existing && (string)$existing['status'] === 'published';

    $patch = db_pick($data, $cols, [], ['week','points']);
    $patch['updatedAt'] = now_iso();
    if ($existing) {
        db_update('assignments', $patch, ['id' => $existing['id']]);
        $id = $assignmentId;
        audit('admin.assignment.update', $g['requester']['memberId'], $id, [], (string)($p['ip'] ?? ''));
    } else {
        $id = 'ASG-' . gmdate('Y') . '-' . rand_hex(4);
        $patch['assignmentId'] = $id;
        $patch['status'] = $patch['status'] ?? 'draft';
        $patch['createdBy'] = $g['requester']['memberId'];
        $patch['createdAt'] = now_iso();
        db_insert('assignments', $patch);
        audit('admin.assignment.create', $g['requester']['memberId'], $id, [], (string)($p['ip'] ?? ''));
    }

    $nowPublished = ($patch['status'] ?? ($existing['status'] ?? '')) === 'published';
    if ($nowPublished && !$wasPublished) notify_assignment_published($id, !empty($p['email']));
    return ['ok' => true, 'assignmentId' => $id];
}

function notify_assignment_published(string $assignmentId, bool $alsoEmail): void {
    global $CONFIG;
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$assignmentId]);
    if (!$a) return;
    $sc = session_current();
    $currentSessionId = $sc['current']['sessionId'] ?? '';
    $members = db_all("SELECT * FROM members WHERE status='active'");
    $targets = array_values(array_filter($members, fn($m) => assignment_matches_member($a, $m, $currentSessionId)));

    $due = $a['dueAt'] ? (' Due ' . gmdate('D j M', strtotime((string)$a['dueAt']) ?: time()) . '.') : '';
    foreach ($targets as $m) {
        push_notification($m['memberId'], ['kind' => 'announcement', 'title' => 'New assignment: ' . $a['title'], 'body' => 'Open your dashboard to start.' . $due, 'linkPage' => 'dashboard']);
    }
    if ($alsoEmail) {
        email_members($targets, 'New assignment · ' . $a['title'], function ($m) use ($a, $CONFIG) {
            $due = $a['dueAt'] ? ('<p style="margin:0;color:#b45309"><strong>Due ' . esc_html(gmdate('D j M', strtotime((string)$a['dueAt']) ?: time())) . '</strong></p>') : '';
            return email_template([
                'title' => 'New assignment: ' . $a['title'],
                'intro' => 'Hi ' . (explode(' ', (string)$m['fullName'])[0] ?: 'there') . ', a new assignment is waiting for you.',
                'bodyHtml' => '<p style="margin:0 0 10px">' . nl2br(esc_html((string)$a['instructions'])) . '</p>' . $due,
                'ctaLabel' => 'Open your dashboard', 'ctaUrl' => ($CONFIG['app_origin'] ?? '') . '/#dashboard',
            ]);
        }, 300);
    }
}

function admin_assignment_submissions(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $assignmentId = (string)($p['assignmentId'] ?? '');
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$assignmentId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];

    $members = [];
    foreach (db_all('SELECT memberId, fullName, centre FROM members') as $m) $members[$m['memberId']] = $m;

    $rows = db_all('SELECT * FROM assignment_submissions WHERE assignmentId = ? ORDER BY submittedAt DESC', [$assignmentId]);
    $subs = array_map(function ($r) use ($members) {
        $m = $members[$r['memberId']] ?? [];
        return [
            'submissionId' => $r['submissionId'], 'memberId' => $r['memberId'],
            'memberName' => $m['fullName'] ?? $r['memberId'], 'centre' => $m['centre'] ?? '',
            'text' => $r['answerText'] ?: '', 'fileUrl' => normalize_image_url($r['fileUrl'] ?? ''),
            'status' => $r['status'] ?: 'submitted', 'grade' => ($r['grade'] === null || $r['grade'] === '') ? null : (int)$r['grade'],
            'feedback' => $r['feedback'] ?: '', 'submittedAt' => $r['submittedAt'] ?: '', 'gradedAt' => $r['gradedAt'] ?: '',
        ];
    }, $rows);
    return ['ok' => true, 'assignment' => ['assignmentId' => $a['assignmentId'], 'title' => $a['title'], 'points' => (int)$a['points'], 'instructions' => $a['instructions'] ?: ''], 'submissions' => $subs];
}

function assignment_grade(array $p): array {
    global $CONFIG;
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $submissionId = (string)($p['submissionId'] ?? '');
    $row = db_row('SELECT * FROM assignment_submissions WHERE submissionId = ? LIMIT 1', [$submissionId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$row['assignmentId']]);
    $maxPoints = $a ? (int)$a['points'] : 0;

    $grade = (int)($p['grade'] ?? 0);
    if ($maxPoints > 0) $grade = max(0, min($maxPoints, $grade));
    $feedback = (string)($p['feedback'] ?? '');

    db_update('assignment_submissions', ['status' => 'graded', 'grade' => $grade, 'feedback' => $feedback, 'gradedBy' => $g['requester']['memberId'], 'gradedAt' => now_iso()], ['id' => $row['id']]);

    push_notification($row['memberId'], ['kind' => 'announcement', 'title' => 'Assignment graded: ' . ($a['title'] ?? ''), 'body' => 'You scored ' . $grade . ($maxPoints ? ('/' . $maxPoints) : '') . '. Tap to see feedback.', 'linkPage' => 'dashboard']);

    if (!empty($p['email'])) {
        $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$row['memberId']]);
        if ($member && $member['email']) {
            send_mail((string)$member['email'], 'Your assignment was graded · ' . ($a['title'] ?? ''), email_template([
                'title' => 'Assignment graded',
                'intro' => ($a['title'] ?? 'Your assignment') . ' has been reviewed.',
                'bodyHtml' => '<p style="margin:0 0 8px;font-size:20px"><strong>' . $grade . ($maxPoints ? ('/' . $maxPoints) : '') . '</strong></p>' . ($feedback ? '<p style="margin:0;color:#4a5170">' . nl2br(esc_html($feedback)) . '</p>' : ''),
                'ctaLabel' => 'See your dashboard', 'ctaUrl' => ($CONFIG['app_origin'] ?? '') . '/#dashboard',
            ]));
        }
    }
    audit('assignment.grade', $g['requester']['memberId'], $submissionId, ['grade' => $grade], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
