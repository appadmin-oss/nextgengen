<?php
declare(strict_types=1);

/** Anchor 12 — missions, submissions, verification, journal. */

/** Seed a starter mission (one per week) from the 12-week curriculum the FIRST
 *  time the table is empty, so a fresh install has a working Anchor journey
 *  out of the box. Idempotent; admins can edit/replace them under Missions. */
function anchor_ensure_seed(): void {
    static $checked = false;
    if ($checked) return; $checked = true;
    try {
        if (db_row('SELECT id FROM anchor_missions LIMIT 1')) return; // already populated
        $content = function_exists('anchor_content') ? anchor_content() : anchor_default_content();
        $weeks = $content['weeks'] ?? [];
        foreach ($weeks as $i => $w) {
            $week = $i + 1;
            db_insert('anchor_missions', [
                'missionId' => 'AM-W' . str_pad((string)$week, 2, '0', STR_PAD_LEFT),
                'week' => $week, 'orderIndex' => 1,
                'theme' => (string)($w['system'] ?? ($w['title'] ?? 'Anchor')),
                'title' => (string)($w['title'] ?? ('Week ' . $week)),
                'prompt' => (string)($w['journal'] ?? ($w['focus'] ?? 'Reflect on this week.')),
                'type' => 'Reflect', 'proof' => 'text', 'xp' => 60, 'bookPage' => $week, 'estimatedMin' => 10,
                'isActive' => 1, 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
            ]);
        }
    } catch (Throwable $e) { error_log('[anchor_seed] ' . $e->getMessage()); }
}

function anchor_weeks(array $p): array {
    anchor_ensure_seed();
    $memberId = (string)($p['memberId'] ?? '');
    $sc = session_current();
    $session = $sc['current'] ?: $sc['next'];
    $sessionId = $session['sessionId'] ?? '';

    $missions = db_all('SELECT * FROM anchor_missions WHERE isActive = 1 ORDER BY week, orderIndex');
    $progByMission = [];
    if ($memberId) {
        foreach (db_all('SELECT * FROM member_progress WHERE memberId = ? AND sessionId = ?', [$memberId, $sessionId]) as $r) {
            $progByMission[$r['missionId']] = $r;
        }
    }

    $byWeek = [];
    foreach ($missions as $m) {
        $w = (int)$m['week'];
        if (!isset($byWeek[$w])) $byWeek[$w] = ['week' => $w, 'theme' => $m['theme'], 'missions' => []];
        $byWeek[$w]['missions'][] = [
            'missionId' => $m['missionId'], 'title' => $m['title'], 'prompt' => $m['prompt'],
            'xp' => (int)$m['xp'], 'type' => $m['type'], 'proof' => $m['proof'],
            'bookPage' => (int)$m['bookPage'], 'estimatedMin' => (int)$m['estimatedMin'],
            'order' => (int)$m['orderIndex'],
            'status' => $progByMission[$m['missionId']]['status'] ?? 'todo',
        ];
    }
    ksort($byWeek);
    return ['ok' => true, 'session' => $session, 'weeks' => array_values($byWeek)];
}

function anchor_mission_submit(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $missionId = (string)($p['missionId'] ?? '');
    $sc = session_current();
    $session = $sc['current'];
    if (!$session) return ['ok' => false, 'error' => 'no_active_session'];
    $sessionId = $session['sessionId'];

    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'member_not_found'];
    $mission = db_row('SELECT * FROM anchor_missions WHERE missionId = ? LIMIT 1', [$missionId]);
    if (!$mission) return ['ok' => false, 'error' => 'mission_not_found'];

    $auto = ($mission['proof'] === 'none');
    $proofUrl = (string)($p['proofUrl'] ?? '');
    $note = (string)($p['note'] ?? '');
    $row = db_row('SELECT * FROM member_progress WHERE memberId = ? AND missionId = ? AND sessionId = ? LIMIT 1', [$memberId, $missionId, $sessionId]);

    $fields = [
        'status' => $auto ? 'verified' : 'submitted',
        'proofUrl' => $proofUrl, 'note' => $note, 'submittedAt' => now_iso(),
        'xpAwarded' => $auto ? (int)$mission['xp'] : 0,
        'verifiedAt' => $auto ? now_iso() : '', 'verifiedBy' => $auto ? 'auto' : '',
    ];
    if ($row) {
        db_update('member_progress', $fields, ['id' => $row['id']]);
    } else {
        db_insert('member_progress', array_merge($fields, [
            'memberId' => $memberId, 'missionId' => $missionId, 'sessionId' => $sessionId,
            'startedAt' => now_iso(),
        ]));
    }

    if ($auto) {
        recompute_member_stats($memberId);
        push_notification($memberId, ['kind' => 'mission', 'title' => '+' . (int)$mission['xp'] . ' XP — ' . $mission['title'], 'body' => 'Mission complete. Keep the streak.', 'linkPage' => 'anchor']);
    } else {
        push_notification($memberId, ['kind' => 'mission', 'title' => 'Submitted for review', 'body' => 'Your mentor will verify "' . $mission['title'] . '" soon.', 'linkPage' => 'anchor']);
    }
    audit('mission.submit', $memberId, $missionId, ['sessionId' => $sessionId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $auto ? 'verified' : 'submitted'];
}

function anchor_mission_verify(array $p): array {
    $verifierId = (string)($p['verifierId'] ?? '');
    $memberId = (string)($p['memberId'] ?? '');
    $missionId = (string)($p['missionId'] ?? '');
    $approve = !empty($p['approve']);

    $verifier = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$verifierId]);
    if (!$verifier) return ['ok' => false, 'error' => 'verifier_not_found'];
    $isMentor = db_row('SELECT 1 FROM mentors WHERE email = ? LIMIT 1', [$verifier['email']]);
    if (!$isMentor && !is_admin_role($verifier['role'])) return ['ok' => false, 'error' => 'forbidden'];

    $sc = session_current();
    $session = $sc['current'];
    if (!$session) return ['ok' => false, 'error' => 'no_active_session'];

    $row = db_row('SELECT * FROM member_progress WHERE memberId = ? AND missionId = ? AND sessionId = ? LIMIT 1', [$memberId, $missionId, $session['sessionId']]);
    if (!$row) return ['ok' => false, 'error' => 'submission_not_found'];
    $mission = db_row('SELECT * FROM anchor_missions WHERE missionId = ? LIMIT 1', [$missionId]);
    $xp = $approve ? (int)($mission['xp'] ?? 0) : 0;

    db_update('member_progress', [
        'status' => $approve ? 'verified' : 'rejected',
        'verifiedBy' => $verifierId, 'verifiedAt' => now_iso(), 'xpAwarded' => $xp,
    ], ['id' => $row['id']]);

    if ($approve) {
        recompute_member_stats($memberId);
        push_notification($memberId, ['kind' => 'mission', 'title' => '+' . $xp . ' XP — ' . ($mission['title'] ?? 'Mission verified'), 'body' => 'Verified by your mentor. Great work.', 'linkPage' => 'anchor']);
    } else {
        push_notification($memberId, ['kind' => 'mission', 'title' => 'Needs another pass — ' . ($mission['title'] ?? 'Mission'), 'body' => (string)($p['note'] ?? 'Have another go. Your mentor left feedback.'), 'linkPage' => 'anchor']);
    }
    audit($approve ? 'mission.verify' : 'mission.reject', $verifierId, $memberId . '/' . $missionId, ['sessionId' => $session['sessionId']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Admin/mentor review queue: proof-requiring mission submissions awaiting a
 *  verdict in the active session. Without this list the verify handler had no
 *  surface, so every photo/text-evidence submission sat 'submitted' forever. */
function admin_mission_submissions(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $sc = session_current(); $session = $sc['current'] ?? null;
    if (!$session) return ['ok' => true, 'submissions' => [], 'session' => null];
    $rows = db_all(
        "SELECT mp.memberId, mp.missionId, mp.status, mp.proofUrl, mp.note, mp.submittedAt,
                m.fullName, m.centre, am.title, am.week, am.proof, am.xp
         FROM member_progress mp
         LEFT JOIN members m ON m.memberId = mp.memberId
         LEFT JOIN anchor_missions am ON am.missionId = mp.missionId
         WHERE mp.status = 'submitted' AND mp.sessionId = ?
         ORDER BY mp.submittedAt ASC LIMIT 500", [$session['sessionId']]);
    return ['ok' => true, 'submissions' => $rows, 'session' => ['sessionId' => $session['sessionId'], 'name' => (string)($session['name'] ?? '')]];
}

function anchor_journal_create(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    $sc = session_current();
    $session = $sc['current'];
    $week = $session ? week_of_session_from_public($session) : 1;

    db_insert('journal', [
        'entryId' => 'JNL-' . gmdate('Y') . '-' . rand_hex(4),
        'memberId' => $memberId, 'sessionId' => $session['sessionId'] ?? '',
        'week' => min(12, $week), 'mood' => (string)($p['mood'] ?? ''), 'body' => (string)($p['body'] ?? ''),
        'isPrivate' => array_key_exists('private', $p) ? (to_bool($p['private']) ? 1 : 0) : 1,
        'createdAt' => now_iso(),
    ]);
    audit('journal.create', $memberId, $memberId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function anchor_journal_list(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $requesterId = (string)($p['requesterId'] ?? $memberId);
    $requester = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$requesterId]);
    if (!$requester) return ['ok' => false, 'error' => 'not_found'];

    $isOwn = ($requesterId === $memberId);
    $isAdmin = is_admin_role($requester['role']);
    $rows = db_all('SELECT * FROM journal WHERE memberId = ? ORDER BY createdAt DESC', [$memberId]);

    $entries = [];
    foreach ($rows as $r) {
        if (!($isOwn || $isAdmin || !to_bool($r['isPrivate']))) continue;
        $entries[] = [
            'entryId' => $r['entryId'], 'sessionId' => $r['sessionId'], 'week' => (int)$r['week'],
            'mood' => $r['mood'], 'body' => $r['body'], 'createdAt' => $r['createdAt'],
        ];
    }
    return ['ok' => true, 'entries' => $entries];
}
