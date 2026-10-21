<?php
/* ═══════════════════════════════════════════════════════════════════════════
   NGGC PROJECTS AND ACTIVITIES

   Staff in the mentor portal assign a project to mentors, to children, or to
   both. Everyone on it can be split into named groups ("Team Kola", "Group 2"),
   and it runs from a start date to a finish date, so every person on it sees
   the same countdown.

   Who may assign to whom (checked per person, on the way in):
     · a lead or a coordinator — the mentors they lead (mp_team_rows, a
       coordinator's limited to the centres they cover) and the active NGG
       children at their centre(s) (mp_message_reach_centres);
     · any mentor — the children in their own caseload.
   No child reaches a mentor whose safeguarding screening is not recorded
   (mp_screened), exactly as the caseload itself.
   A mentor marks their own part done; a child marks theirs; whoever created
   the project may set anyone's part (done, back to assigned, or excused).

   It feeds:
     · the mentor's My role, commitment "Support NGGC projects and activities"
       (mp_projects_month), never a fixed "None assigned";
     · the child's Today (a project finishing within a week is a To do) and
       their Community screen, where the project, their group and the
       countdown are.
   Tables: projects, project_people (migration 166).
   ═══════════════════════════════════════════════════════════════════════════ */

const PROJECT_MAX_PEOPLE = 200;
const PROJECT_MAX_GROUPS = 20;
const PROJECT_MAX_DAYS = 366;
const PROJECT_PART_STATUSES = ['assigned', 'done', 'excused'];
const PROJECT_KINDS = ['mentor', 'member'];
const PROJECT_STATUSES = ['open', 'closed', 'cancelled'];

/** The countdown everyone on a project sees: days left, a label, a tone, and how much of the time has gone. */
function project_countdown(string $startOn, string $dueOn, string $today, string $status = 'open'): array {
    if ($status === 'closed') return ['daysLeft' => null, 'label' => 'Finished', 'tone' => 'done', 'elapsedPct' => 100];
    if ($dueOn === '') return ['daysLeft' => null, 'label' => 'No finish date', 'tone' => 'neutral', 'elapsedPct' => 0];
    $left = mp_days($today, $dueOn);
    if ($startOn !== '' && $today < $startOn) {
        $in = mp_days($today, $startOn);
        return ['daysLeft' => $left, 'label' => 'Starts in ' . $in . ' day' . ($in === 1 ? '' : 's'), 'tone' => 'neutral', 'elapsedPct' => 0];
    }
    $span = $startOn !== '' ? max(1, mp_days($startOn, $dueOn)) : 0;
    $pct = $span ? max(0, min(100, (int)round(mp_days($startOn, $today) / $span * 100))) : ($left < 0 ? 100 : 0);
    if ($left < 0) return ['daysLeft' => $left, 'label' => -$left . ' day' . ($left === -1 ? '' : 's') . ' past the finish date', 'tone' => 'over', 'elapsedPct' => 100];
    if ($left === 0) return ['daysLeft' => 0, 'label' => 'Finishes today', 'tone' => 'due', 'elapsedPct' => $span ? 100 : 0];
    return ['daysLeft' => $left, 'label' => $left . ' day' . ($left === 1 ? '' : 's') . ' left', 'tone' => $left <= 3 ? 'due' : ($left <= 7 ? 'soon' : 'ok'), 'elapsedPct' => $pct];
}

/** Everyone a mentor-portal user may put on a project: [kind => [personId => name]], plus their caseload. */
function project_reach(array $g): array {
    $lead = in_array($g['mpRole'], ['lead', 'coord'], true);
    // A coordinator's team is the mentors at the centres they cover, not the whole programme's.
    if ($g['mpRole'] === 'coord' && !array_key_exists('centres', $g)) $g['centres'] = mp_message_reach_centres($g);
    $mentors = $lead ? array_column(mp_team_rows($g), 'fullName', 'mentorId') : [];
    $kids = [];
    $case = mp_caseload_ids($g);
    $ids = $case;
    $centres = $lead && mp_screened($g) ? mp_message_reach_centres($g) : [];
    if ($centres) {
        $ph = implode(',', array_fill(0, count($centres), '?'));
        foreach (db_all("SELECT memberId FROM members WHERE status = 'active' AND COALESCE(NULLIF(type,''),'NGG') = 'NGG' AND COALESCE(NULLIF(role,''),'member') IN ('member','student')
                         AND centre IN ($ph) AND memberId NOT IN (SELECT memberId FROM mentors WHERE memberId <> '') ORDER BY fullName LIMIT 800", $centres) as $r) $ids[] = (string)$r['memberId'];
    }
    $ids = array_values(array_unique($ids));
    if ($ids) foreach (db_all('SELECT memberId, fullName FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY fullName', $ids) as $r)
        $kids[(string)$r['memberId']] = (string)$r['fullName'];
    return ['mentor' => $mentors, 'member' => $kids, 'caseload' => array_flip($case)];
}

/** The people on some projects, with names, keyed by projectId. One query per table, never per project. */
function project_people_of(array $pids): array {
    if (!$pids) return [];
    $rows = db_all('SELECT * FROM project_people WHERE projectId IN (' . implode(',', array_fill(0, count($pids), '?')) . ') ORDER BY groupName, id', $pids);
    $mIds = []; $kIds = [];
    foreach ($rows as $r) { if ($r['kind'] === 'mentor') $mIds[] = $r['personId']; else $kIds[] = $r['personId']; }
    $mName = $mIds ? array_column(db_all('SELECT mentorId, fullName, memberId FROM mentors WHERE mentorId IN (' . implode(',', array_fill(0, count($mIds), '?')) . ')', $mIds), null, 'mentorId') : [];
    $kName = $kIds ? array_column(db_all('SELECT memberId, fullName FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($kIds), '?')) . ')', $kIds), 'fullName', 'memberId') : [];
    $out = [];
    foreach ($rows as $r) {
        $mr = $r['kind'] === 'mentor' ? ($mName[$r['personId']] ?? null) : null;
        $out[(string)$r['projectId']][] = ['kind' => (string)$r['kind'], 'id' => (string)$r['personId'],
            'name' => $r['kind'] === 'mentor' ? (string)($mr['fullName'] ?? $r['personId']) : (string)($kName[$r['personId']] ?? $r['personId']),
            'memberId' => $r['kind'] === 'mentor' ? (string)($mr['memberId'] ?? '') : (string)$r['personId'],
            'group' => (string)$r['groupName'], 'status' => (string)$r['status'], 'note' => (string)($r['note'] ?? ''), 'doneAt' => (string)$r['doneAt']];
    }
    return $out;
}

/** Done / counted on a list of parts (excused parts are not counted). */
function project_tally(array $people): array {
    $c = array_values(array_filter($people, static fn($x) => $x['status'] !== 'excused'));
    return ['done' => count(array_filter($c, static fn($x) => $x['status'] === 'done')), 'of' => count($c)];
}

function project_shape(array $r, array $people, string $today): array {
    $groups = [];
    foreach ($people as $x) { $k = $x['group']; $groups[$k] ??= ['name' => $k, 'people' => []]; $groups[$k]['people'][] = $x; }
    ksort($groups, SORT_NATURAL | SORT_FLAG_CASE);
    if (isset($groups[''])) { $u = $groups['']; unset($groups['']); $groups[''] = $u; }   // the ungrouped come last
    return ['projectId' => (string)$r['projectId'], 'title' => (string)$r['title'], 'detail' => (string)($r['detail'] ?? ''), 'startOn' => (string)$r['startOn'], 'dueOn' => (string)$r['dueOn'],
        'status' => (string)$r['status'], 'by' => (string)$r['createdByName'], 'countdown' => project_countdown((string)$r['startOn'], (string)$r['dueOn'], $today, (string)$r['status']),
        'tally' => project_tally($people), 'people' => $people,
        'groups' => array_values(array_map(static fn($g) => $g + ['tally' => project_tally($g['people'])], $groups))];
}

/* ── Mentor portal ─────────────────────────────────────────────────────── */

/** view=projects — the projects I am on, the ones I created (everyone's progress, by group), and who I may assign. */
function member_mp_projects(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $today = mp_today($p); $mid = (string)($g['mentorId'] ?? '');
    $mineRows = $mid === '' ? [] : db_all("SELECT pr.* FROM projects pr JOIN project_people pp ON pp.projectId = pr.projectId
                                           WHERE pp.kind = 'mentor' AND pp.personId = ? AND pr.status <> 'cancelled' ORDER BY pr.status = 'closed', pr.dueOn, pr.id DESC LIMIT 60", [$mid]);
    $ledRows = db_all("SELECT * FROM projects WHERE createdBy = ? AND status <> 'cancelled' ORDER BY status = 'closed', dueOn, id DESC LIMIT 60", [$g['me']]);
    $people = project_people_of(array_values(array_unique(array_merge(array_column($mineRows, 'projectId'), array_column($ledRows, 'projectId')))));
    $mine = array_map(static function ($r) use ($people, $today, $mid) {
        $all = $people[$r['projectId']] ?? []; $me = null;
        foreach ($all as $x) if ($x['kind'] === 'mentor' && $x['id'] === $mid) $me = $x;
        $s = project_shape($r, $all, $today);
        // A mentor on a project sees their own group, not the whole roster.
        $grp = $me ? $me['group'] : '';
        $s['me'] = $me; $s['myGroup'] = $grp;
        $s['groups'] = array_values(array_filter($s['groups'], static fn($x) => $x['name'] === $grp));
        unset($s['people']);
        return $s;
    }, $mineRows);
    $reach = project_reach($g);
    return ['ok' => true, 'today' => $today, 'mine' => $mine,
        'led' => array_map(static fn($r) => project_shape($r, $people[$r['projectId']] ?? [], $today), $ledRows),
        'canAssignMentors' => (bool)$reach['mentor'],
        'mentors' => array_map(static fn($id, $n) => ['id' => (string)$id, 'name' => $n], array_keys($reach['mentor']), array_values($reach['mentor'])),
        'children' => array_map(static fn($id, $n) => ['id' => (string)$id, 'name' => $n, 'mentee' => isset($reach['caseload'][(string)$id])], array_keys($reach['member']), array_values($reach['member'])),
        'max' => ['people' => PROJECT_MAX_PEOPLE, 'groups' => PROJECT_MAX_GROUPS, 'days' => PROJECT_MAX_DAYS]];
}

/** projectSave — create or edit a project and who is on it, in which group. The whole payload is checked before anything is written. */
function member_mp_project_save(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $title = trim((string)preg_replace('/\s+/u', ' ', (string)($p['title'] ?? '')));
    if (mb_strlen($title) < 3) return ['ok' => false, 'error' => 'name_the_project'];
    $title = mb_substr($title, 0, 160);
    $detail = mb_substr(trim((string)($p['detail'] ?? '')), 0, 2000);
    $start = trim((string)($p['startOn'] ?? '')); $due = trim((string)($p['dueOn'] ?? ''));
    $today = mp_today($p);
    if ($start === '') $start = $today;
    if ($due === '') return ['ok' => false, 'error' => 'set_a_finish_date'];
    foreach ([$start, $due] as $d) if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !strtotime($d . 'T00:00:00Z')) return ['ok' => false, 'error' => 'bad_date'];
    if ($due < $start) return ['ok' => false, 'error' => 'finish_before_start'];
    if (mp_days($start, $due) > PROJECT_MAX_DAYS) return ['ok' => false, 'error' => 'project_too_long', 'max' => PROJECT_MAX_DAYS];
    $status = (string)($p['status'] ?? 'open');
    if (!in_array($status, PROJECT_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];

    $raw = is_array($p['people'] ?? null) ? array_values($p['people']) : [];
    if (!$raw) return ['ok' => false, 'error' => 'choose_people'];
    if (count($raw) > PROJECT_MAX_PEOPLE) return ['ok' => false, 'error' => 'too_many', 'max' => PROJECT_MAX_PEOPLE];
    $reach = project_reach($g);
    $want = []; $refused = []; $groups = [];
    foreach ($raw as $x) {
        if (!is_array($x)) return ['ok' => false, 'error' => 'bad_person'];
        $kind = (string)($x['kind'] ?? ''); $id = trim((string)($x['id'] ?? ''));
        $grp = mb_substr(trim((string)preg_replace('/\s+/u', ' ', (string)($x['group'] ?? ''))), 0, 40);
        if (!in_array($kind, PROJECT_KINDS, true) || $id === '') return ['ok' => false, 'error' => 'bad_person'];
        if (!isset($reach[$kind][$id])) { $refused[] = ['kind' => $kind, 'id' => $id, 'reason' => $kind === 'mentor' ? 'not_in_team' : 'out_of_reach']; continue; }
        $want[$kind . ':' . $id] = ['kind' => $kind, 'id' => $id, 'group' => $grp];
        if ($grp !== '') $groups[$grp] = true;
    }
    // Refusals are named, and nothing is written: an assignment is all or nothing.
    if ($refused) return ['ok' => false, 'error' => 'not_yours_to_assign', 'refused' => $refused,
        'detail' => implode(', ', array_map(static fn($r) => $r['id'] . ' (' . $r['reason'] . ')', $refused))];
    if (count($groups) > PROJECT_MAX_GROUPS) return ['ok' => false, 'error' => 'too_many_groups', 'max' => PROJECT_MAX_GROUPS];

    $pid = trim((string)($p['projectId'] ?? ''));
    $now = now_iso();
    $byName = (string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? '');
    if ($pid !== '') {
        $row = db_row('SELECT * FROM projects WHERE projectId = ? LIMIT 1', [$pid]);
        if (!$row || (string)$row['createdBy'] !== $g['me']) return ['ok' => false, 'error' => 'not_found'];
        db_update('projects', ['title' => $title, 'detail' => $detail, 'startOn' => $start, 'dueOn' => $due, 'status' => $status, 'updatedAt' => $now], ['projectId' => $pid]);
    } else {
        $pid = 'PRJ-' . strtoupper(bin2hex(random_bytes(5)));
        db_insert('projects', ['projectId' => $pid, 'title' => $title, 'detail' => $detail, 'startOn' => $start, 'dueOn' => $due, 'centre' => (string)($g['mentorRow']['centre'] ?? $g['member']['centre'] ?? ''),
            'status' => $status, 'createdBy' => $g['me'], 'createdByName' => $byName, 'createdAt' => $now, 'updatedAt' => $now]);
    }
    $have = [];
    foreach (db_all('SELECT kind, personId, groupName, status FROM project_people WHERE projectId = ?', [$pid]) as $r) $have[$r['kind'] . ':' . $r['personId']] = $r;
    $added = []; $moved = 0; $kept = 0; $removed = 0;
    foreach ($want as $k => $w) {
        if (!isset($have[$k])) { db_insert('project_people', ['projectId' => $pid, 'kind' => $w['kind'], 'personId' => $w['id'], 'groupName' => $w['group'], 'status' => 'assigned', 'note' => '', 'doneAt' => '', 'createdAt' => $now]); $added[] = $w; }
        elseif ((string)$have[$k]['groupName'] !== $w['group']) { db_update('project_people', ['groupName' => $w['group']], ['projectId' => $pid, 'kind' => $w['kind'], 'personId' => $w['id']]); $moved++; }
    }
    foreach ($have as $k => $r) {
        if (isset($want[$k])) continue;
        // Somebody who already finished their part stays on the record.
        if ($r['status'] === 'done') { $kept++; continue; }
        db_exec('DELETE FROM project_people WHERE projectId = ? AND kind = ? AND personId = ?', [$pid, $r['kind'], $r['personId']]);
        $removed++;
    }
    if ($added && $status === 'open') {
        $mIds = array_column(array_filter($added, static fn($w) => $w['kind'] === 'mentor'), 'id');
        $who = $mIds ? array_column(db_all("SELECT mentorId, memberId FROM mentors WHERE memberId <> '' AND mentorId IN (" . implode(',', array_fill(0, count($mIds), '?')) . ')', $mIds), 'memberId', 'mentorId') : [];
        // A child is told who set it as title + surname, never a first name.
        $from = staff_public_name($g['me'], 'your mentor');
        $when = 'Finishes ' . gmdate('l j F', strtotime($due . 'T12:00:00Z')) . '.';
        foreach ($added as $w) {
            $to = $w['kind'] === 'mentor' ? ($who[$w['id']] ?? '') : $w['id'];
            if ($to === '' || $to === $g['me']) continue;
            push_notification($to, ['kind' => $w['kind'] === 'mentor' ? 'mentor' : 'project', 'title' => 'New project: ' . $title,
                'body' => $when . ($w['group'] !== '' ? ' You are in ' . $w['group'] . '.' : '') . ($w['kind'] === 'member' ? ' From ' . $from . '.' : ''),
                'linkPage' => $w['kind'] === 'mentor' ? 'mentor' : 'community']);
        }
    }
    audit('project.save', $g['me'], $pid, ['added' => count($added), 'moved' => $moved, 'removed' => $removed, 'kept' => $kept, 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'projectId' => $pid, 'added' => count($added), 'moved' => $moved, 'removed' => $removed, 'kept' => $kept];
}

/** projectMark — a mentor marks their own part; the project's creator may set anyone's. */
function member_mp_project_mark(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $pid = trim((string)($p['projectId'] ?? '')); $status = (string)($p['status'] ?? '');
    if (!in_array($status, PROJECT_PART_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    $pr = db_row('SELECT * FROM projects WHERE projectId = ? LIMIT 1', [$pid]);
    if (!$pr || $pr['status'] === 'cancelled') return ['ok' => false, 'error' => 'not_found'];
    $kind = (string)($p['kind'] ?? 'mentor'); $who = trim((string)($p['personId'] ?? ''));
    if (!in_array($kind, PROJECT_KINDS, true)) return ['ok' => false, 'error' => 'bad_person'];
    $mine = (string)($g['mentorId'] ?? '');
    if ($who === '') { $kind = 'mentor'; $who = $mine; }
    $creator = (string)$pr['createdBy'] === $g['me'];
    $self = $kind === 'mentor' && $who !== '' && $who === $mine;
    if (!$creator && !$self) return ['ok' => false, 'error' => 'forbidden'];
    // Excusing a part is the lead's call, not the mentor's about themselves.
    if ($self && $status === 'excused' && !$creator) return ['ok' => false, 'error' => 'ask_your_lead'];
    if (!db_row('SELECT 1 FROM project_people WHERE projectId = ? AND kind = ? AND personId = ?', [$pid, $kind, $who])) return ['ok' => false, 'error' => 'not_on_project'];
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 500);
    $row = ['status' => $status, 'doneAt' => $status === 'done' ? now_iso() : ''];
    if ($note !== '' || $status !== 'done') $row['note'] = $note;
    db_update('project_people', $row, ['projectId' => $pid, 'kind' => $kind, 'personId' => $who]);
    audit('project.mark', $g['me'], $pid, ['kind' => $kind, 'personId' => $who, 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** The commitment row's facts for one mentor this month: assigned, done, past due. */
function mp_projects_month(string $mentorId, string $month, string $today): array {
    if ($mentorId === '') return ['assigned' => 0, 'done' => 0, 'overdue' => 0, 'next' => ''];
    // This month's projects, any running now, and any older one still open and unfinished: an old debt is still owed.
    $rows = db_all("SELECT pr.dueOn, pp.status FROM project_people pp JOIN projects pr ON pr.projectId = pp.projectId
                    WHERE pp.kind = 'mentor' AND pp.personId = ? AND pp.status <> 'excused' AND pr.status <> 'cancelled'
                      AND (substr(pr.dueOn, 1, 7) = ? OR (pr.dueOn < ? AND pp.status = 'assigned' AND pr.status = 'open')
                           OR (pr.startOn <= ? AND pr.dueOn > ? AND pr.status = 'open'))", [$mentorId, $month, $month . '-01', $today, $today]);
    $done = count(array_filter($rows, static fn($r) => $r['status'] === 'done'));
    $over = count(array_filter($rows, static fn($r) => $r['status'] === 'assigned' && $r['dueOn'] < $today));
    $next = '';
    foreach ($rows as $r) if ($r['status'] === 'assigned' && $r['dueOn'] >= $today && ($next === '' || $r['dueOn'] < $next)) $next = (string)$r['dueOn'];
    return ['assigned' => count($rows), 'done' => $done, 'overdue' => $over, 'next' => $next];
}

/* ── Member portal ─────────────────────────────────────────────────────── */

/** member.projects — the child's projects: what it is, their group and its people, who set it, and the countdown. */
function member_projects(array $p): array {
    $mid = trim((string)($p['memberId'] ?? ''));
    $m = $mid === '' ? null : db_row('SELECT memberId FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    // `today` as mp_today() takes it (the suite's fixed date); the member route never passes one.
    $today = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['today'] ?? '')) ? (string)$p['today'] : (function_exists('results_today') ? results_today() : gmdate('Y-m-d'));
    $rows = db_all("SELECT pr.* FROM projects pr JOIN project_people pp ON pp.projectId = pr.projectId
                    WHERE pp.kind = 'member' AND pp.personId = ? AND pr.status <> 'cancelled' ORDER BY pr.status = 'closed', pr.dueOn, pr.id DESC LIMIT 40", [$mid]);
    $people = project_people_of(array_column($rows, 'projectId'));
    $byId = array_values(array_unique(array_column($rows, 'createdBy')));
    foreach ($people as $list) foreach ($list as $x) if ($x['kind'] === 'mentor' && $x['memberId'] !== '') $byId[] = $x['memberId'];
    // Staff reach a child as title + surname (staff_public_names), never a first name.
    $titled = staff_public_names(array_values(array_unique($byId)));
    $out = [];
    foreach ($rows as $r) {
        $all = $people[$r['projectId']] ?? []; $me = null;
        foreach ($all as $x) if ($x['kind'] === 'member' && $x['id'] === $mid) $me = $x;
        $grp = $me ? $me['group'] : '';
        $mates = array_values(array_filter($all, static fn($x) => $x['group'] === $grp && !($x['kind'] === 'member' && $x['id'] === $mid)));
        $kids = array_values(array_filter($mates, static fn($x) => $x['kind'] === 'member'));
        $out[] = ['projectId' => (string)$r['projectId'], 'title' => (string)$r['title'], 'detail' => (string)($r['detail'] ?? ''), 'startOn' => (string)$r['startOn'], 'dueOn' => (string)$r['dueOn'],
            'status' => (string)$r['status'], 'by' => $titled[(string)$r['createdBy']] ?? 'NGG', 'countdown' => project_countdown((string)$r['startOn'], (string)$r['dueOn'], $today, (string)$r['status']),
            'me' => $me ? ['status' => $me['status'], 'note' => $me['note'], 'doneAt' => $me['doneAt']] : null, 'group' => $grp,
            // Another child is shown by first name only.
            'mates' => array_map(static fn($x) => ['name' => mp_first($x['name']), 'done' => $x['status'] === 'done'], $kids),
            'staff' => array_values(array_map(static fn($x) => $titled[$x['memberId']] ?? 'Your mentor', array_filter($mates, static fn($x) => $x['kind'] === 'mentor'))),
            'groupTally' => project_tally(array_merge($kids, $me ? [$me] : [])), 'tally' => project_tally(array_values(array_filter($all, static fn($x) => $x['kind'] === 'member')))];
    }
    return ['ok' => true, 'today' => $today, 'projects' => $out];
}

/** member.project.mark — a child marks their own part done (with what they did), or not done yet. */
function member_project_mark(array $p): array {
    $mid = trim((string)($p['memberId'] ?? '')); $pid = trim((string)($p['projectId'] ?? ''));
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['assigned', 'done'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $pr = db_row('SELECT * FROM projects WHERE projectId = ? LIMIT 1', [$pid]);
    if (!$pr || $pr['status'] === 'cancelled') return ['ok' => false, 'error' => 'not_found'];
    if ($pr['status'] === 'closed') return ['ok' => false, 'error' => 'project_closed'];
    $part = db_row("SELECT status FROM project_people WHERE projectId = ? AND kind = 'member' AND personId = ?", [$pid, $mid]);
    if (!$part) return ['ok' => false, 'error' => 'not_on_project'];
    if ($part['status'] === 'excused') return ['ok' => false, 'error' => 'excused'];
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 500);
    db_update('project_people', ['status' => $status, 'note' => $note, 'doneAt' => $status === 'done' ? now_iso() : ''], ['projectId' => $pid, 'kind' => 'member', 'personId' => $mid]);
    audit('project.mark', $mid, $pid, ['kind' => 'member', 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** To do rows for a child's Today: a project finishing within a week (or past its date) and not done. */
function member_project_todos(string $mid, string $today): array {
    $week = gmdate('Y-m-d', strtotime($today . 'T00:00:00Z') + 7 * 86400);
    $out = [];
    foreach (db_all("SELECT pr.projectId, pr.title, pr.startOn, pr.dueOn FROM projects pr JOIN project_people pp ON pp.projectId = pr.projectId
                     WHERE pp.kind = 'member' AND pp.personId = ? AND pp.status = 'assigned' AND pr.status = 'open' AND pr.dueOn <> '' AND pr.dueOn <= ? AND pr.startOn <= ?
                     ORDER BY pr.dueOn LIMIT 5", [$mid, $week, $today]) as $r) {
        $c = project_countdown((string)$r['startOn'], (string)$r['dueOn'], $today);
        $out[] = portal_todo('project-' . $r['projectId'], 'flag-checkered', (string)$r['title'], 'Project · ' . $c['label'], 'Open', '/member/community', $c['tone'] === 'over' ? 'danger' : 'warning', 2, (string)$r['dueOn']);
    }
    return $out;
}
