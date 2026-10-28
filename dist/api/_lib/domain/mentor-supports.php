<?php
/**
 * Supporting mentors: one primary mentor, plus at most two others with a
 * named focus.
 *
 * MENTOR's Elements of Effective Practice and the one-to-one outcome evidence
 * (Raposa et al. 2019) both point to one relationship that matters most. So
 * the primary stays where it always was — `mentor_assignments`, which every
 * screen reads as "the mentor", untouched — and a supporting mentor lives
 * here, apart, so that nothing that reads the primary can ever mistake a
 * supporter for it. The Connect phase, relationship checks, scores, family
 * updates and wellbeing alerts are the primary's.
 *
 * What a supporter may do: see and write in the child's one conversation
 * (`chat:<memberId>`), which the primary always sees too — the second-adult
 * rule, no private one-to-one channel. What they may not: the child's
 * wellbeing history, scores or family contacts (they are not in their
 * caseload; mp_caseload_ids is unchanged).
 *
 * A peer mentor is a young person: they never support another child here.
 * An end date takes effect when it passes, at read time — no nightly job.
 *
 * @see api/admin/mentor-support.php  the Control Room's route
 */

/** Supporting mentors one child may have at once. */
const MS_SUPPORT_MAX = 2;

/** The longest a supporting link may be set for, in days. */
const MS_SUPPORT_MAX_DAYS = 366;

/** The child's active supporting mentors: [{mentorId, fullName, focus, endsOn, startedAt}]. */
function ms_supports_of(string $memberId): array {
    $today = gmdate('Y-m-d');
    return array_map(static fn($r) => ['mentorId' => (string)$r['mentorId'], 'fullName' => (string)($r['fullName'] ?? ''), 'focus' => (string)$r['focus'],
        'endsOn' => (string)$r['endsOn'], 'startedAt' => (string)$r['startedAt']],
        db_all("SELECT s.mentorId, s.focus, s.endsOn, s.startedAt, t.fullName FROM mentor_supports s LEFT JOIN mentors t ON t.mentorId = s.mentorId
                WHERE s.memberId = ? AND s.status = 'active' AND (s.endsOn = '' OR s.endsOn >= ?) ORDER BY s.id", [$memberId, $today]));
}

/** The children a mentor supports (not their caseload): [memberId => focus]. */
function ms_supported_by(string $mentorId): array {
    if ($mentorId === '') return [];
    $out = [];
    foreach (db_all("SELECT memberId, focus FROM mentor_supports WHERE mentorId = ? AND status = 'active' AND (endsOn = '' OR endsOn >= ?)", [$mentorId, gmdate('Y-m-d')]) as $r) {
        $out[(string)$r['memberId']] = (string)$r['focus'];
    }
    return $out;
}

/**
 * admin.mentor.support — add or end one supporting link.
 * `end` true ends it; otherwise it is added (or its focus and end date changed).
 */
function admin_mentor_support(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $memberId = trim((string)($p['memberId'] ?? ''));
    $mentorId = trim((string)($p['mentorId'] ?? ''));
    if ($memberId === '' || $mentorId === '') return ['ok' => false, 'error' => 'missing_field'];
    $sg = admin_member_scope_gate($g['requester'], $memberId); if (!$sg['ok']) return $sg;
    $by = (string)$g['requester']['memberId'];
    $now = now_iso();
    $live = db_row("SELECT * FROM mentor_supports WHERE memberId = ? AND mentorId = ? AND status = 'active' LIMIT 1", [$memberId, $mentorId]);

    if (!empty($p['end'])) {
        if (!$live) return ['ok' => false, 'error' => 'not_supporting'];
        db_update('mentor_supports', ['status' => 'ended', 'endedAt' => $now], ['id' => (int)$live['id']]);
        audit('admin.mentor.support.end', $by, $memberId, ['mentorId' => $mentorId], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'supports' => ms_supports_of($memberId)];
    }

    $mem = db_row('SELECT memberId, fullName, centre, status FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$mem) return ['ok' => false, 'error' => 'not_found'];
    $mentor = db_row("SELECT * FROM mentors WHERE mentorId = ? AND status = 'active' LIMIT 1", [$mentorId]);
    if (!$mentor) return ['ok' => false, 'error' => 'mentor_not_found'];
    if ((string)($mentor['rank'] ?? '') === 'peer') {
        return ['ok' => false, 'error' => 'peer_mentor', 'detail' => 'A peer mentor is a young person, and does not support another child as an adult mentor does.'];
    }
    $primary = db_row("SELECT mentorId FROM mentor_assignments WHERE memberId = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [$memberId]);
    if (!$primary) return ['ok' => false, 'error' => 'no_primary', 'detail' => 'Give them a mentor first. A supporting mentor works alongside the main one, never instead of one.'];
    if ((string)$primary['mentorId'] === $mentorId) return ['ok' => false, 'error' => 'is_primary', 'detail' => 'That is already their mentor.'];

    $focus = trim(mb_substr((string)($p['focus'] ?? ''), 0, 60));
    if ($focus === '') return ['ok' => false, 'error' => 'need_focus', 'detail' => 'Say what they help with, for example “Coding” or “Exams”. The child sees it.'];
    $ends = substr(trim((string)($p['endsOn'] ?? '')), 0, 10);
    if ($ends !== '') {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $ends) || $ends < gmdate('Y-m-d')) return ['ok' => false, 'error' => 'bad_end', 'detail' => 'The end date has to be today or later.'];
        if ($ends > gmdate('Y-m-d', time() + MS_SUPPORT_MAX_DAYS * 86400)) return ['ok' => false, 'error' => 'bad_end', 'detail' => 'At most a year ahead. It can be extended later.'];
    }
    if ($live) {
        db_update('mentor_supports', ['focus' => $focus, 'endsOn' => $ends], ['id' => (int)$live['id']]);
        audit('admin.mentor.support.change', $by, $memberId, ['mentorId' => $mentorId, 'focus' => $focus, 'endsOn' => $ends], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'changed' => true, 'supports' => ms_supports_of($memberId)];
    }
    if (count(ms_supports_of($memberId)) >= MS_SUPPORT_MAX) {
        return ['ok' => false, 'error' => 'too_many_supports', 'max' => MS_SUPPORT_MAX, 'detail' => 'A child has at most ' . MS_SUPPORT_MAX . ' supporting mentors besides their own. End one first.'];
    }
    db_insert('mentor_supports', ['memberId' => $memberId, 'mentorId' => $mentorId, 'focus' => $focus, 'endsOn' => $ends, 'status' => 'active',
        'startedAt' => $now, 'endedAt' => '', 'createdBy' => $by]);
    audit('admin.mentor.support.add', $by, $memberId, ['mentorId' => $mentorId, 'focus' => $focus, 'endsOn' => $ends], (string)($p['ip'] ?? ''));
    $name = function_exists('staff_public_name') ? staff_public_name($mentorId, (string)$mentor['fullName']) : (string)$mentor['fullName'];
    push_notification($memberId, ['kind' => 'mentor', 'title' => $name . ' is helping you with ' . $focus,
        'body' => 'They join your conversation with your mentor, who sees everything they write.', 'linkPage' => 'dashboard']);
    if ((string)($mentor['memberId'] ?? '') !== '') push_notification((string)$mentor['memberId'], ['kind' => 'mentor', 'title' => 'You are supporting ' . mp_first((string)$mem['fullName']) . ' with ' . $focus,
        'body' => 'You write in their conversation with their mentor. Their wellbeing, scores and family details stay with their mentor.', 'linkPage' => 'mentor']);
    return ['ok' => true, 'added' => true, 'supports' => ms_supports_of($memberId)];
}

/** When a supporter becomes the primary, the supporting link ends: one person, one role. */
function ms_support_end_for_primary(string $memberId, string $mentorId): void {
    db_exec("UPDATE mentor_supports SET status = 'ended', endedAt = ? WHERE memberId = ? AND mentorId = ? AND status = 'active'", [now_iso(), $memberId, $mentorId]);
}
