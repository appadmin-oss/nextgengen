<?php
declare(strict_types=1);
/**
 * Mentorship — Anchor Pods (design handoff v5, MENTORSHIP.md + MENTOR_PORTAL.md)
 * and the NGGC Mentorship Commitment & Conduct Policy.
 *
 * A POD is one mentor and the mentees matched to them at one centre: at least
 * five (the policy's floor) and at most eight (the handoff's ceiling: four
 * one-to-ones per Saturday keeps eight on a two-week loop).
 *
 * A MATCH is one mentee's relationship with one mentor, and it carries its
 * PHASE: match (week 0, an offer of two mentors) → connect (weeks 1–6) →
 * grow (7–40) → lead (41–50) → close (51–52). Its status is separate from its
 * phase: offered | active | paused | closing | closed | withdrawn. A match is
 * never deleted once a mentee has chosen — "the young person keeps their
 * whole history".
 *
 * mentor_assignments stays the pairing every older screen reads (the member
 * record, the engagement report, the legacy roster). Choosing a mentor writes
 * one; finishing a closure ends it. There is one pairing, not two.
 *
 * Three things this file refuses outright, because the handoff says NEVER:
 *   • a mentee is offered ONE mentor (approval needs two — `need_two_mentors`);
 *   • a mentor who has not cleared screening, the thirteen Academy modules and
 *     the current Commitment Policy is offered, or sees pod data;
 *   • a match that ends is re-matched instantly (R8 starts a planned closure).
 *
 * Nothing here messages a child automatically. Rules write NUDGES for a mentor
 * or a lead; a person decides.
 */

const MS_POD_MIN = 5;            // NGGC policy §15: a minimum of five children
const MS_POD_MAX = 8;            // handoff §1.1: 6–8, never more than eight
const MS_POLICY_VERSION = '2026-10';
const MS_ONE_TO_ONE_GAP = 21;    // R2: days without a one-to-one
const MS_INDICATORS = ['Voice', 'Courage', 'Thinking', 'Creativity', 'Collaboration',
                       'Responsibility', 'Character', 'Identity', 'Initiative', 'Reflection'];
const MS_LEVELS = ['Not seen', 'Emerging', 'Demonstrated', 'Exemplary'];
const MS_TARGETS = ['matchLength' => 70, 'contact' => 85, 'weeklyReviews' => 90,
                    'relationship' => 4.0, 'goals' => 60, 'retention' => 75];
const MS_RULES = [
    'R1' => ['audience' => 'mentor', 'label' => 'Missed two Saturdays'],
    'R2' => ['audience' => 'mentor', 'label' => 'No one-to-one for 21 days'],
    'R3' => ['audience' => 'lead',   'label' => 'Getting worse, or a concern'],
    'R4' => ['audience' => 'mentor', 'label' => 'Goal completed: next goal'],
    'R5' => ['audience' => 'lead',   'label' => 'First six weeks: lead check-ins'],
    'R6' => ['audience' => 'lead',   'label' => 'Reviews under half for 3 weeks'],
    'R7' => ['audience' => 'lead',   'label' => 'Low relationship check'],
    'R8' => ['audience' => 'lead',   'label' => 'Mentor leaving: planned closure'],
    'P1' => ['audience' => 'lead',   'label' => 'Commitment policy: a month short'],
];

/* ── The policy ─────────────────────────────────────────────────────────── */

/**
 * The NGGC Mentorship Commitment & Conduct Policy, as the programme wrote it.
 * `track` names how the platform evidences an obligation, so the commitments
 * screen can say what is measured and what is a matter of conduct:
 *   obligation:<kind>  attendance recorded against mentor_obligations
 *   pod                active mentees in the pod (≥ MS_POD_MIN)
 *   reviews            weekly reviews on the platform
 *   academy / anthem   a one-time record on the mentor
 *   parents            parent summaries logged through the cadence
 *   conduct            not measured; reviewed by the lead
 */
function mentorship_policy(): array {
    return [
        'version' => MS_POLICY_VERSION,
        'title' => 'NGGC Mentorship Commitment & Conduct Policy',
        'standard' => 'A mentor observes, models, guides, challenges, encourages, documents, collaborates and follows through.',
        'items' => [
            ['n' => 1,  'key' => 'cimc',      'track' => 'obligation:cimc',   'text' => 'Complete the CIMC training, or attend training every Saturday at 7:00am.'],
            ['n' => 2,  'key' => 'prep',      'track' => 'obligation:prep',   'text' => 'Attend the weekly Mentor Preparation Session, 7–8pm.'],
            ['n' => 3,  'key' => 'saturday',  'track' => 'obligation:saturday', 'text' => 'Be available to mentor at 9:30am at least twice a month.'],
            ['n' => 4,  'key' => 'projects',  'track' => 'conduct',           'text' => 'Support the children\'s projects.'],
            ['n' => 5,  'key' => 'sts',       'track' => 'obligation:sts',    'text' => 'Attend the Tuesday STS meeting.'],
            ['n' => 6,  'key' => 'accountable','track' => 'conduct',          'text' => 'Be accountable.'],
            ['n' => 7,  'key' => 'values',    'track' => 'conduct',           'text' => 'Model the programme\'s values.'],
            ['n' => 8,  'key' => 'platform',  'track' => 'reviews',           'text' => 'Use the platform to assess, score and monitor the children.'],
            ['n' => 9,  'key' => 'growth',    'track' => 'conduct',           'text' => 'Show a genuine commitment to your own growth.'],
            ['n' => 10, 'key' => 'parents',   'track' => 'parents',           'text' => 'Take part in parent engagements.'],
            ['n' => 11, 'key' => 'feedback',  'track' => 'conduct',           'text' => 'Receive feedback professionally.'],
            ['n' => 12, 'key' => 'anthem',    'track' => 'anthem',            'text' => 'Know the NGGC Anthem and Pledge.'],
            ['n' => 13, 'key' => 'mentorParents', 'track' => 'conduct',       'text' => 'Have the capacity to mentor parents.'],
            ['n' => 14, 'key' => 'journal',   'track' => 'conduct',           'text' => 'Use the Anchor Journal with parents and teachers.'],
            ['n' => 15, 'key' => 'five',      'track' => 'pod',               'text' => 'Mentor a minimum of five children: assessment, scoring and follow-up.'],
            ['n' => 16, 'key' => 'retreat',   'track' => 'obligation:retreat','text' => 'Attend the quarterly day retreat.'],
            ['n' => 17, 'key' => 'leadership','track' => 'conduct',           'text' => 'Respect the leadership and the programme\'s policies.'],
        ],
    ];
}

/** Recorded obligation kinds, and how often each is expected. */
const MS_OBLIGATIONS = [
    'cimc'     => ['label' => 'CIMC training · Saturday 7:00am', 'weekday' => 6],
    'prep'     => ['label' => 'Mentor Preparation · 7–8pm',      'weekly' => true],
    'saturday' => ['label' => 'Mentoring · Saturday 9:30am',     'perMonth' => 2],
    'sts'      => ['label' => 'STS meeting · Tuesday',           'weekday' => 2],
    'retreat'  => ['label' => 'Quarterly day retreat',           'perQuarter' => 1],
];

/* ── Small helpers ──────────────────────────────────────────────────────── */

function ms_today(array $p = []): string {
    $t = trim((string)($p['today'] ?? ''));
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $t) ? $t : gmdate('Y-m-d');
}
function ms_days_between(string $a, string $b): int {
    return (int)floor((strtotime(substr($b, 0, 10) . 'T00:00:00Z') - strtotime(substr($a, 0, 10) . 'T00:00:00Z')) / 86400);
}
function ms_add_days(string $d, int $n): string { return gmdate('Y-m-d', strtotime(substr($d, 0, 10) . 'T00:00:00Z') + $n * 86400); }

/** The phase a match is in on `$today`, from the day the mentee chose. */
function ms_phase_for(string $startedAt, string $today): string {
    if ($startedAt === '') return 'match';
    $days = ms_days_between($startedAt, $today);
    if ($days < 0) return 'match';
    $week = intdiv($days, 7) + 1;
    if ($week <= 6) return 'connect';
    if ($week <= 40) return 'grow';
    if ($week <= 50) return 'lead';
    return 'close';
}
function ms_week_of(string $startedAt, string $today): int {
    return $startedAt === '' ? 0 : max(1, intdiv(max(0, ms_days_between($startedAt, $today)), 7) + 1);
}

/** The school term a date sits in, for the termly relationship check. */
function ms_term(string $date): string {
    $m = (int)substr($date, 5, 2);
    return substr($date, 0, 4) . '-T' . ($m <= 4 ? 1 : ($m <= 8 ? 2 : 3));
}

/** A nudge, written once per key. Returns true when it is new. */
function ms_nudge(string $key, string $rule, array $f): bool {
    if (db_row('SELECT id FROM mentor_nudges WHERE nudgeKey = ? LIMIT 1', [$key])) return false;
    try {
        db_insert('mentor_nudges', [
            'nudgeKey' => $key, 'rule' => $rule,
            'audience' => (string)($f['audience'] ?? MS_RULES[$rule]['audience'] ?? 'lead'),
            'mentorId' => (string)($f['mentorId'] ?? ''), 'memberId' => (string)($f['memberId'] ?? ''),
            'matchId' => (string)($f['matchId'] ?? ''), 'centre' => (string)($f['centre'] ?? ''),
            'title' => (string)($f['title'] ?? ''), 'body' => (string)($f['body'] ?? ''),
            'suggestion' => (string)($f['suggestion'] ?? ''),
            'status' => 'open', 'createdAt' => now_iso(), 'resolvedAt' => '', 'resolvedBy' => '',
        ]);
        return true;
    } catch (Throwable $e) { return false; }   // a racing tick wrote it first
}

/** An open intervention for a match, created once per rule. */
function ms_intervention_open(array $match, string $rule, string $reason, string $plan, string $by = 'system'): int {
    $open = db_row("SELECT id FROM mentor_interventions WHERE matchId = ? AND status = 'open' LIMIT 1", [(string)$match['matchId']]);
    if ($open) return (int)$open['id'];
    return db_insert('mentor_interventions', [
        'matchId' => (string)$match['matchId'], 'memberId' => (string)$match['memberId'],
        'mentorId' => (string)$match['mentorId'], 'centre' => (string)$match['centre'],
        'rule' => $rule, 'reason' => $reason, 'plan' => $plan, 'ownerId' => '', 'ownerName' => '',
        'reviewOn' => ms_add_days(gmdate('Y-m-d'), 14), 'status' => 'open', 'outcome' => '',
        'createdBy' => $by, 'createdAt' => now_iso(), 'closedAt' => '',
    ]);
}

/* ── The Academy and clearance ──────────────────────────────────────────── */

function ms_academy(): array {
    static $a = null;
    if ($a === null) {
        $a = json_decode((string)@file_get_contents(__DIR__ . '/../seeds/mentor-academy.json'), true) ?: ['pass' => 80, 'groups' => [], 'modules' => []];
    }
    return $a;
}
function ms_required_modules(): array {
    return array_values(array_map(static fn($m) => $m['id'], array_filter(ms_academy()['modules'], static fn($m) => !empty($m['required']))));
}

/**
 * Clearance for many mentors in three grouped reads — the pipeline lists every
 * mentor, and one query per mentor is the N+1 this codebase does not allow.
 * Returns mentorId => ['screened','modulesDone','modulesRequired','policy','cleared','missing'].
 */
function ms_clearance_bulk(array $mentors, ?string $today = null): array {
    $today = $today ?? gmdate('Y-m-d');
    $ids = array_values(array_filter(array_map(static fn($m) => (string)($m['mentorId'] ?? ''), $mentors)));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $renew = [];
    foreach (ms_academy()['modules'] as $mod) if (!empty($mod['renewDays'])) $renew[$mod['id']] = (int)$mod['renewDays'];
    $required = ms_required_modules();
    $passed = [];
    foreach (db_all("SELECT mentorId, moduleId, passedAt FROM mentor_academy WHERE passedAt <> '' AND mentorId IN ($ph)", $ids) as $r) {
        $mod = (string)$r['moduleId'];
        if (isset($renew[$mod]) && ms_days_between((string)$r['passedAt'], $today) > $renew[$mod]) continue;   // lapsed
        $passed[(string)$r['mentorId']][$mod] = true;
    }
    $policy = [];
    foreach (db_all("SELECT mentorId FROM mentor_policy WHERE policyVersion = ? AND mentorId IN ($ph)", array_merge([MS_POLICY_VERSION], $ids)) as $r) $policy[(string)$r['mentorId']] = true;
    $volIds = array_values(array_filter(array_map(static fn($m) => (string)($m['volunteerId'] ?? ''), $mentors)));
    $volClear = [];
    if ($volIds) {
        $vph = implode(',', array_fill(0, count($volIds), '?'));
        foreach (db_all("SELECT volunteerId FROM volunteers WHERE safeguarding = 'cleared' AND volunteerId IN ($vph)", $volIds) as $r) $volClear[(string)$r['volunteerId']] = true;
    }
    /* Staff with admin access (a coordinator, a super admin) who also hold a
     * mentor record are not sent through the Academy: they set its policy.
     * One grouped read for the member rows behind the mentor records. */
    $staff = [];
    $mids = array_values(array_filter(array_map(static fn($m) => (string)($m['memberId'] ?? ''), $mentors)));
    if ($mids && function_exists('member_effective_caps') && function_exists('mentor_admin_programmes')) {
        $mp = implode(',', array_fill(0, count($mids), '?'));
        foreach (db_all("SELECT * FROM members WHERE status = 'active' AND COALESCE(role,'') NOT IN ('', 'member') AND memberId IN ($mp)", $mids) as $r) {
            if (mentor_admin_programmes(member_effective_caps($r))) $staff[(string)$r['memberId']] = true;
        }
    }
    $out = [];
    foreach ($mentors as $m) {
        $id = (string)$m['mentorId'];
        $isStaff = isset($staff[(string)($m['memberId'] ?? '')]);
        $byHand = trim((string)($m['academyClearedAt'] ?? '')) !== '';
        $screened = $isStaff || trim((string)($m['checkedAt'] ?? '')) !== '' || isset($volClear[(string)($m['volunteerId'] ?? '')]);
        $done = ($isStaff || $byHand) ? count($required) : count(array_intersect($required, array_keys($passed[$id] ?? [])));
        $pol = $isStaff || isset($policy[$id]);
        $missing = [];
        if (!$screened) $missing[] = 'screening';
        if ($done < count($required)) $missing[] = 'academy';
        if (!$pol) $missing[] = 'policy';
        $out[$id] = ['screened' => $screened, 'modulesDone' => $done, 'modulesRequired' => count($required),
                     'policy' => $pol, 'policyVersion' => MS_POLICY_VERSION, 'cleared' => !$missing, 'missing' => $missing,
                     'staff' => $isStaff, 'academyByHand' => $byHand && !$isStaff, 'academyClearedAt' => (string)($m['academyClearedAt'] ?? ''), 'academyClearedBy' => (string)($m['academyClearedBy'] ?? '')];
    }
    return $out;
}
function ms_clearance(array $mentor): array {
    return ms_clearance_bulk([$mentor])[(string)$mentor['mentorId']] ?? ['cleared' => false, 'missing' => ['unknown']];
}

/** Is this mentor in the NGG programme (summer-only mentors run no pods)? */
function ms_mentor_is_ngg(array $m): bool { return in_array('ngg', mentor_programmes($m), true); }

/** Active pod sizes, one grouped read. */
function ms_pod_loads(): array {
    $out = [];
    foreach (db_all("SELECT mentorId, COUNT(*) c FROM mentor_matches WHERE status IN ('active','paused','closing') GROUP BY mentorId") as $r) $out[(string)$r['mentorId']] = (int)$r['c'];
    return $out;
}
function ms_mentor_cap(array $m): int {
    $max = (int)($m['maxMentees'] ?? 0);
    return $max > 0 ? min($max, MS_POD_MAX) : MS_POD_MAX;
}

/* ── Matching ───────────────────────────────────────────────────────────── */

function ms_tokens(string $s): array {
    $s = strtolower(preg_replace('/[^a-z0-9 ]+/i', ' ', $s));
    return array_values(array_unique(array_filter(explode(' ', $s), static fn($w) => strlen($w) > 2)));
}

/**
 * How well a mentor fits a mentee, 0–100, with the reasons in words. Same
 * centre is not scored: a pod is one centre, so a mentor elsewhere is not a
 * candidate at all (ms_recommend filters them out before this is called).
 */
function ms_fit(array $mentee, array $mentor, int $load): array {
    $score = 0; $why = [];
    $track = strtolower(trim((string)($mentee['track'] ?? '')));
    $mTracks = array_map('trim', explode(',', strtolower((string)($mentor['tracks'] ?? ''))));
    if ($track !== '' && in_array($track, $mTracks, true)) { $score += 35; $why[] = 'Same track (' . $mentee['track'] . ')'; }
    $wants = ms_tokens(implode(' ', [(string)($mentee['interests'] ?? ''), (string)($mentee['wantsTo'] ?? ''), (string)($mentee['supportArea'] ?? ''), (string)($mentee['disciplines'] ?? '')]));
    $offers = ms_tokens(implode(' ', [(string)($mentor['skills'] ?? ''), (string)($mentor['tracks'] ?? ''), (string)($mentor['bio'] ?? ''), (string)($mentor['department'] ?? '')]));
    $common = array_values(array_intersect($wants, $offers));
    if ($common) { $score += min(25, 10 * count($common)); $why[] = 'Shares interests: ' . implode(', ', array_slice($common, 0, 3)); }
    $avA = ms_tokens((string)($mentee['availability'] ?? '')); $avB = ms_tokens((string)($mentor['availability'] ?? ''));
    if (!$avA || !$avB || array_intersect($avA, $avB)) { $score += 15; if ($avA && $avB) $why[] = 'Availability overlaps'; }
    $cap = ms_mentor_cap($mentor);
    $score += (int)round(15 * max(0, $cap - $load) / max(1, $cap));
    if ($load < MS_POD_MIN) { $score += 10; $why[] = 'Pod has ' . $load . ' of the ' . MS_POD_MIN . ' the policy asks for'; }
    else $why[] = $load . ' of ' . $cap . ' places taken';
    return ['fit' => min(100, $score), 'why' => $why];
}

/**
 * Mentors a mentee may be offered: active, NGG, at the mentee's centre,
 * cleared (screening + 13 modules + the policy), with a place free, and not
 * leaving. Ranked by fit. `$pool` lets a list compute it once.
 */
function ms_recommend(array $mentee, ?array $pool = null, int $limit = 4): array {
    $pool = $pool ?? ms_pool();
    $out = [];
    foreach ($pool['mentors'] as $m) {
        if (strcasecmp(trim((string)$m['centre']), trim((string)($mentee['centre'] ?? ''))) !== 0) continue;
        $load = $pool['loads'][(string)$m['mentorId']] ?? 0;
        if ($load >= ms_mentor_cap($m)) continue;
        if (empty($pool['clearance'][(string)$m['mentorId']]['cleared'])) continue;
        $f = ms_fit($mentee, $m, $load);
        $out[] = ['mentorId' => (string)$m['mentorId'], 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre'],
                  'tracks' => (string)($m['tracks'] ?? ''), 'load' => $load, 'cap' => ms_mentor_cap($m)] + $f;
    }
    usort($out, static fn($a, $b) => [$b['fit'], $a['load'], $a['fullName']] <=> [$a['fit'], $b['load'], $b['fullName']]);
    return array_slice($out, 0, $limit);
}
function ms_pool(): array {
    $mentors = array_values(array_filter(
        db_all("SELECT * FROM mentors WHERE status = 'active' AND COALESCE(leavingAt,'') = ''"),
        'ms_mentor_is_ngg'));
    return ['mentors' => $mentors, 'loads' => ms_pod_loads(), 'clearance' => ms_clearance_bulk($mentors)];
}

/**
 * Mentees waiting for a mentor, longest wait first: active NGG members with no
 * live match and no live pairing. Waiting since the later of joining and the
 * close of their last match. One query, scoped by centre.
 */
function ms_waiting(?array $centres, int $limit = 200): array {
    /* Members only: staff and the programme's own mentors hold NGG rows too,
       and none of them is waiting for a mentor. */
    $where = "m.type = 'NGG' AND m.status = 'active' AND COALESCE(m.role, 'member') IN ('', 'member')
        AND NOT EXISTS (SELECT 1 FROM mentors t WHERE t.memberId = m.memberId AND t.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM mentor_matches x WHERE x.memberId = m.memberId AND x.status IN ('offered','active','paused','closing'))
        AND NOT EXISTS (SELECT 1 FROM mentor_assignments a WHERE a.memberId = m.memberId AND a.status = 'active')";
    $args = [];
    if ($centres !== null) {
        if (!$centres) return [];
        $where .= ' AND m.centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')';
        $args = $centres;
    }
    $rows = db_all("SELECT m.memberId, m.fullName, m.centre, m.track, m.dob, m.disciplines, m.joinDate, m.createdAt,
            p.interests, p.wantsTo, p.supportArea, p.availability, p.style,
            (SELECT MAX(closedAt) FROM mentor_matches c WHERE c.memberId = m.memberId AND c.status = 'closed') lastClosed
        FROM members m LEFT JOIN mentee_profiles p ON p.memberId = m.memberId
        WHERE $where", $args);
    foreach ($rows as &$r) {
        $since = max(substr((string)($r['joinDate'] ?: $r['createdAt'] ?: ''), 0, 10), substr((string)($r['lastClosed'] ?? ''), 0, 10));
        $r['waitingSince'] = $since;
        foreach (['interests', 'wantsTo', 'supportArea', 'availability', 'style'] as $k) $r[$k] = (string)($r[$k] ?? '');
    }
    unset($r);
    usort($rows, static fn($a, $b) => [$a['waitingSince'] ?: '9999', $a['fullName']] <=> [$b['waitingSince'] ?: '9999', $b['fullName']]);
    return array_slice($rows, 0, $limit);
}

function ms_new_match_id(): string { return 'MAT-' . strtoupper(bin2hex(random_bytes(4))); }

/** The current live match for a member, if any. */
function ms_live_match(string $memberId): ?array {
    return db_row("SELECT * FROM mentor_matches WHERE memberId = ? AND status IN ('offered','active','paused','closing') ORDER BY id DESC LIMIT 1", [$memberId]);
}

/** Goal tools are hidden (and refused) in the Connect phase — R5. */
function ms_goals_locked(string $memberId, ?string $today = null): bool {
    $m = db_row("SELECT startedAt FROM mentor_matches WHERE memberId = ? AND status IN ('active','paused') ORDER BY id DESC LIMIT 1", [$memberId]);
    if (!$m) return false;
    // No goal before week 3 of the match (mentor portal handoff); from then on they may be set.
    return ms_week_of((string)$m['startedAt'], $today ?? gmdate('Y-m-d')) < 3;
}

/**
 * The cadence a match carries from the day the mentee chooses (handoff §1.3):
 * weekly one-to-ones through Connect, then every two weeks (rolled forward as
 * each is logged); a monthly goal check and parent summary from week 7; the
 * termly relationship check; the lead's two Connect check-ins (R5); and the
 * closure conversation at week 51.
 */
function ms_cadence_create(array $match, string $start): int {
    $rows = [];
    foreach ([7, 14, 21, 28, 35, 42] as $d) $rows[] = ['one_to_one', 'mentor', $d];
    foreach ([10, 28] as $d) $rows[] = ['lead_checkin', 'lead', $d];
    for ($w = 7; $w <= 48; $w += 4) { $rows[] = ['goal_check', 'mentor', $w * 7]; $rows[] = ['parent_summary', 'mentor', $w * 7 + 1]; }
    foreach ([13, 26, 39] as $w) $rows[] = ['relationship_check', 'mentor', $w * 7];
    $rows[] = ['closure', 'mentor', 50 * 7];
    foreach ($rows as [$kind, $owner, $d]) {
        db_insert('mentor_tasks', ['matchId' => $match['matchId'], 'memberId' => $match['memberId'], 'mentorId' => $match['mentorId'],
            'centre' => $match['centre'], 'kind' => $kind, 'owner' => $owner, 'dueOn' => ms_add_days($start, $d),
            'status' => 'open', 'doneAt' => '', 'doneBy' => '', 'note' => '', 'createdAt' => now_iso()]);
    }
    return count($rows);
}

/* ── Staff gates ────────────────────────────────────────────────────────── */

/** HQ / centre lead: `people` capability, centre-scoped. */
function ms_staff_gate(array $p): array {
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) return $g;
    $g['centres'] = admin_centre_names_in_scope($g['requester']);
    return $g;
}
function ms_in_scope(array $g, string $centre): bool {
    return $g['centres'] === null || in_array($centre, $g['centres'], true);
}
function ms_centre_filter(array $g, string $col, array &$args, string $centre = ''): string {
    $sql = '';
    if ($g['centres'] !== null) {
        if (!$g['centres']) return ' AND 1 = 0';
        $sql .= " AND $col IN (" . implode(',', array_fill(0, count($g['centres']), '?')) . ')';
        $args = array_merge($args, $g['centres']);
    }
    if ($centre !== '') { $sql .= " AND $col = ?"; $args[] = $centre; }
    return $sql;
}

/* ── Workspace: queue and matching ──────────────────────────────────────── */

function admin_ms_queue(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $centre = trim((string)($p['centre'] ?? ''));
    $centres = $g['centres'];
    if ($centre !== '') {
        if (!ms_in_scope($g, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
        $centres = [$centre];
    }
    $waiting = ms_waiting($centres);
    $pool = ms_pool();
    $out = [];
    foreach ($waiting as $w) {
        $recs = ms_recommend($w, $pool);
        $out[] = ['memberId' => $w['memberId'], 'fullName' => $w['fullName'], 'centre' => $w['centre'], 'track' => (string)$w['track'],
                  'waitingSince' => $w['waitingSince'], 'interests' => $w['interests'], 'wantsTo' => $w['wantsTo'],
                  'supportArea' => $w['supportArea'], 'availability' => $w['availability'], 'style' => $w['style'],
                  'recommended' => $recs, 'canOffer' => count($recs) >= 2];
    }
    return ['ok' => true, 'waiting' => $out, 'total' => count($out)];
}

/**
 * Approve a match: the mentee is OFFERED two mentors and picks one. Nothing is
 * assigned here. Both mentors must be recommendable for this mentee right now
 * (cleared, same centre, a place free) — checked on the way in, not trusted
 * from the screen. Undo (admin_ms_match_undo) withdraws it while it is still
 * an offer.
 */
function admin_ms_match_approve(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $memberId = trim((string)($p['memberId'] ?? ''));
    $ids = array_values(array_unique(array_filter(array_map('strval', (array)($p['mentorIds'] ?? [])))));
    if (count($ids) !== 2) return ['ok' => false, 'error' => 'need_two_mentors', 'detail' => 'The mentee chooses between two mentors (MENTORSHIP.md §1.2).'];
    $mem = db_row("SELECT m.*, p.interests, p.wantsTo, p.supportArea, p.availability, p.style FROM members m LEFT JOIN mentee_profiles p ON p.memberId = m.memberId WHERE m.memberId = ? LIMIT 1", [$memberId]);
    if (!$mem) return ['ok' => false, 'error' => 'not_found'];
    if (!member_is_ngg($mem)) return ['ok' => false, 'error' => 'not_ngg'];
    if (!ms_in_scope($g, (string)$mem['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    if (ms_live_match($memberId) || db_row("SELECT 1 FROM mentor_assignments WHERE memberId = ? AND status = 'active' LIMIT 1", [$memberId])) {
        return ['ok' => false, 'error' => 'already_matched'];
    }
    $recs = [];
    foreach (ms_recommend($mem, null, 50) as $r) $recs[$r['mentorId']] = $r;
    foreach ($ids as $id) if (!isset($recs[$id])) return ['ok' => false, 'error' => 'mentor_not_eligible', 'mentorId' => $id];
    $matchId = ms_new_match_id();
    $now = now_iso();
    $agreement = ['commitment' => '12 months', 'contact' => 'Weekly pod time · a one-to-one every two weeks',
                  'signatures' => ['mentor' => '', 'mentee' => '', 'parent' => ''], 'policyVersion' => MS_POLICY_VERSION];
    db_insert('mentor_matches', ['matchId' => $matchId, 'memberId' => $memberId, 'mentorId' => '', 'centre' => (string)$mem['centre'],
        'track' => (string)($mem['track'] ?? ''), 'phase' => 'match', 'status' => 'offered', 'offeredAt' => $now, 'startedAt' => '',
        'chosenBy' => '', 'agreementJson' => json_encode($agreement), 'closingAt' => '', 'closedAt' => '', 'closeReason' => '',
        'createdBy' => (string)$g['requester']['memberId'], 'updatedAt' => $now]);
    foreach ($ids as $i => $id) {
        db_insert('mentor_match_offers', ['matchId' => $matchId, 'mentorId' => $id, 'rank' => $i + 1,
            'fit' => (int)$recs[$id]['fit'], 'why' => implode(' · ', $recs[$id]['why']), 'status' => 'open']);
    }
    push_notification($memberId, ['kind' => 'mentor', 'title' => 'Choose your mentor',
        'body' => 'Two mentors would like to work with you: ' . $recs[$ids[0]]['fullName'] . ' and ' . $recs[$ids[1]]['fullName'] . '. Pick the one you would like.',
        'linkPage' => 'dashboard']);
    audit('admin.mentorship.match.approve', (string)$g['requester']['memberId'], $memberId, ['matchId' => $matchId, 'mentors' => $ids], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'matchId' => $matchId,
            'created' => ['A choice of two mentors for the mentee', 'A one-page agreement to sign (mentor, mentee, parent)',
                          'The cadence of check-ins, created when the mentee chooses']];
}

/** Undo an approval while it is still an offer. After a choice it is a match
 *  with a history, and ending one is a closure, not an undo. */
function admin_ms_match_undo(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $m = db_row('SELECT * FROM mentor_matches WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$m['status'] !== 'offered') return ['ok' => false, 'error' => 'already_chosen'];
    db_exec('DELETE FROM mentor_match_offers WHERE matchId = ?', [$m['matchId']]);
    db_exec('DELETE FROM mentor_matches WHERE matchId = ?', [$m['matchId']]);
    audit('admin.mentorship.match.undo', (string)$g['requester']['memberId'], (string)$m['memberId'], ['matchId' => $m['matchId']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * The mentee's choice. Re-checks the chosen mentor is still cleared and has a
 * place (an offer made on Monday is not a guarantee on Friday), then starts
 * the match: Connect phase, the pairing every other screen reads, the cadence.
 */
function ms_choose(array $match, string $mentorId, string $chosenBy, string $actorId, ?string $today = null): array {
    if ((string)$match['status'] !== 'offered') return ['ok' => false, 'error' => 'not_an_offer'];
    $offer = db_row("SELECT * FROM mentor_match_offers WHERE matchId = ? AND mentorId = ? AND status = 'open' LIMIT 1", [$match['matchId'], $mentorId]);
    if (!$offer) return ['ok' => false, 'error' => 'not_offered'];
    $mentor = db_row("SELECT * FROM mentors WHERE mentorId = ? AND status = 'active' LIMIT 1", [$mentorId]);
    if (!$mentor || trim((string)($mentor['leavingAt'] ?? '')) !== '') return ['ok' => false, 'error' => 'mentor_unavailable'];
    if (!ms_clearance($mentor)['cleared']) return ['ok' => false, 'error' => 'mentor_not_cleared'];
    if ((ms_pod_loads()[$mentorId] ?? 0) >= ms_mentor_cap($mentor)) return ['ok' => false, 'error' => 'pod_full'];
    $start = $today ?? gmdate('Y-m-d');
    $now = now_iso();
    db_update('mentor_matches', ['mentorId' => $mentorId, 'status' => 'active', 'phase' => 'connect', 'startedAt' => $start,
        'chosenBy' => $chosenBy, 'updatedAt' => $now], ['matchId' => $match['matchId']]);
    db_exec("UPDATE mentor_match_offers SET status = CASE WHEN mentorId = ? THEN 'chosen' ELSE 'declined' END WHERE matchId = ?", [$mentorId, $match['matchId']]);
    $sc = session_current();
    db_exec("UPDATE mentor_assignments SET status = 'ended', endedAt = ? WHERE memberId = ? AND status = 'active'", [$now, $match['memberId']]);
    db_insert('mentor_assignments', ['memberId' => $match['memberId'], 'mentorId' => $mentorId, 'track' => (string)$match['track'],
        'sessionId' => (string)($sc['current']['sessionId'] ?? ''), 'status' => 'active', 'startedAt' => $now, 'endedAt' => '']);
    $match['mentorId'] = $mentorId;
    $tasks = ms_cadence_create($match, $start);
    push_notification((string)$match['memberId'], ['kind' => 'mentor', 'title' => 'You have a mentor',
        'body' => (string)$mentor['fullName'] . ' is your mentor. Your first weeks are for getting to know each other.', 'linkPage' => 'dashboard']);
    audit('mentorship.match.chosen', $actorId, (string)$match['memberId'], ['matchId' => $match['matchId'], 'mentorId' => $mentorId, 'by' => $chosenBy]);
    return ['ok' => true, 'matchId' => $match['matchId'], 'mentorId' => $mentorId, 'tasks' => $tasks];
}

/** Staff record a choice made by the mentee or their guardian (in person, by phone). */
function admin_ms_match_choose(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $m = db_row('SELECT * FROM mentor_matches WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $by = in_array((string)($p['chosenBy'] ?? ''), ['mentee', 'guardian'], true) ? (string)$p['chosenBy'] : 'mentee';
    return ms_choose($m, (string)($p['mentorId'] ?? ''), $by, (string)$g['requester']['memberId'], isset($p['today']) ? ms_today($p) : null);
}

/** The mentee's own view of their offer, and their choice. */
function member_ms_offer(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $m = db_row("SELECT * FROM mentor_matches WHERE memberId = ? AND status = 'offered' ORDER BY id DESC LIMIT 1", [$me]);
    if (!$m) return ['ok' => true, 'offer' => null];
    $opts = db_all("SELECT o.mentorId, o.rank, o.why, t.fullName, t.bio, t.photoUrl, t.tracks FROM mentor_match_offers o
                    JOIN mentors t ON t.mentorId = o.mentorId WHERE o.matchId = ? AND o.status = 'open' ORDER BY o.rank", [$m['matchId']]);
    return ['ok' => true, 'offer' => ['matchId' => $m['matchId'], 'options' => $opts]];
}
function member_ms_choose(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $m = db_row('SELECT * FROM mentor_matches WHERE matchId = ? AND memberId = ? LIMIT 1', [(string)($p['matchId'] ?? ''), $me]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ms_choose($m, (string)($p['mentorId'] ?? ''), 'mentee', $me);
}

/* ── Workspace: relationships, lifecycle ────────────────────────────────── */

/** Health from the record, in words a lead reads: Healthy | Watch | At risk. */
function ms_health(array $match, ?string $lastContact, ?float $relAvg, bool $openIv, string $today): string {
    if ((string)$match['status'] === 'closing') return 'Closing';
    if ((string)$match['status'] === 'paused') return 'Paused';
    $gap = $lastContact ? ms_days_between($lastContact, $today) : ms_days_between((string)$match['startedAt'], $today);
    if ($openIv || ($relAvg !== null && $relAvg < 3) || $gap > 28) return 'At risk';
    if ($gap > MS_ONE_TO_ONE_GAP - 7 || ($relAvg !== null && $relAvg < 4)) return 'Watch';
    return 'Healthy';
}

/** Live matches with health, last contact and next check-in, in grouped reads. */
function ms_relationships(array $g, string $centre, string $today, ?string $mentorId = null): array {
    $args = [];
    $where = "x.status IN ('active','paused','closing')" . ms_centre_filter($g, 'x.centre', $args, $centre);
    if ($mentorId !== null) { $where .= ' AND x.mentorId = ?'; $args[] = $mentorId; }
    $rows = db_all("SELECT x.*, m.fullName menteeName, t.fullName mentorName FROM mentor_matches x
                    LEFT JOIN members m ON m.memberId = x.memberId LEFT JOIN mentors t ON t.mentorId = x.mentorId
                    WHERE $where ORDER BY m.fullName", $args);
    if (!$rows) return [];
    $ids = array_column($rows, 'memberId'); $mids = array_column($rows, 'matchId');
    $ph = implode(',', array_fill(0, count($ids), '?')); $mph = implode(',', array_fill(0, count($mids), '?'));
    $last = []; foreach (db_all("SELECT subjectId, MAX(metOn) d FROM mentor_meetings WHERE subjectId IN ($ph) GROUP BY subjectId", $ids) as $r) $last[$r['subjectId']] = substr((string)$r['d'], 0, 10);
    $next = []; foreach (db_all("SELECT matchId, MIN(dueOn) d FROM mentor_tasks WHERE status = 'open' AND kind IN ('one_to_one','lead_checkin','relationship_check') AND matchId IN ($mph) GROUP BY matchId", $mids) as $r) $next[$r['matchId']] = (string)$r['d'];
    $rel = []; $term = ms_term($today);
    foreach (db_all("SELECT matchId, MIN(avg) a FROM mentor_relationship_checks WHERE term = ? AND matchId IN ($mph) GROUP BY matchId", array_merge([$term], $mids)) as $r) $rel[$r['matchId']] = (float)$r['a'];
    $iv = []; foreach (db_all("SELECT matchId FROM mentor_interventions WHERE status = 'open' AND matchId IN ($mph)", $mids) as $r) $iv[$r['matchId']] = true;
    $out = [];
    foreach ($rows as $x) {
        $lc = $last[$x['memberId']] ?? null;
        $out[] = ['matchId' => $x['matchId'], 'memberId' => $x['memberId'], 'menteeName' => (string)$x['menteeName'],
            'mentorId' => $x['mentorId'], 'mentorName' => (string)$x['mentorName'], 'centre' => $x['centre'], 'status' => $x['status'],
            'phase' => ms_phase_for((string)$x['startedAt'], $today), 'week' => ms_week_of((string)$x['startedAt'], $today),
            'startedAt' => $x['startedAt'], 'lastContact' => $lc, 'nextCheckin' => $next[$x['matchId']] ?? null,
            'relationship' => $rel[$x['matchId']] ?? null, 'openIntervention' => isset($iv[$x['matchId']]),
            'health' => ms_health($x, $lc, $rel[$x['matchId']] ?? null, isset($iv[$x['matchId']]), $today)];
    }
    return $out;
}

function admin_ms_relationships(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    return ['ok' => true, 'relationships' => ms_relationships($g, trim((string)($p['centre'] ?? '')), ms_today($p))];
}

function admin_ms_match_detail(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $x = db_row('SELECT * FROM mentor_matches WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$x) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$x['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $hist = db_all('SELECT matchId, mentorId, status, phase, startedAt, closedAt, closeReason FROM mentor_matches WHERE memberId = ? ORDER BY id', [$x['memberId']]);
    return ['ok' => true, 'match' => $x + ['phaseNow' => ms_phase_for((string)$x['startedAt'], ms_today($p))],
        'offers' => db_all('SELECT o.*, t.fullName FROM mentor_match_offers o LEFT JOIN mentors t ON t.mentorId = o.mentorId WHERE o.matchId = ? ORDER BY o.rank', [$x['matchId']]),
        'checks' => db_all('SELECT respondent, term, q1, q2, q3, q4, avg, createdAt FROM mentor_relationship_checks WHERE matchId = ? ORDER BY term DESC, respondent', [$x['matchId']]),
        'interventions' => db_all('SELECT * FROM mentor_interventions WHERE matchId = ? ORDER BY id DESC', [$x['matchId']]),
        'tasks' => db_all('SELECT id, kind, owner, dueOn, status, doneAt FROM mentor_tasks WHERE matchId = ? ORDER BY dueOn', [$x['matchId']]),
        'history' => $hist];
}

/** Pause, resume, or start a planned closure. A closure is never instant. */
function admin_ms_match_status(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $x = db_row('SELECT * FROM mentor_matches WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$x) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$x['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $to = (string)($p['status'] ?? '');
    $reason = trim((string)($p['reason'] ?? ''));
    $from = (string)$x['status'];
    $allowed = ['paused' => ['active'], 'active' => ['paused'], 'closing' => ['active', 'paused'], 'closed' => ['closing']];
    if (!isset($allowed[$to])) return ['ok' => false, 'error' => 'bad_status'];
    if (!in_array($from, $allowed[$to], true)) return ['ok' => false, 'error' => 'bad_transition', 'from' => $from, 'to' => $to];
    if (in_array($to, ['closing', 'closed'], true) && $reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $r = ms_set_status($x, $to, $reason, (string)$g['requester']['memberId']);
    audit('admin.mentorship.match.status', (string)$g['requester']['memberId'], (string)$x['memberId'], ['matchId' => $x['matchId'], 'from' => $from, 'to' => $to], (string)($p['ip'] ?? ''));
    return $r;
}
function ms_set_status(array $x, string $to, string $reason, string $by): array {
    $now = now_iso();
    $set = ['status' => $to, 'updatedAt' => $now];
    if ($to === 'closing') {
        $set += ['closingAt' => $now, 'closeReason' => $reason];
        db_exec("UPDATE mentor_tasks SET status = 'cancelled' WHERE matchId = ? AND status = 'open' AND kind <> 'closure'", [$x['matchId']]);
        if (!db_row("SELECT 1 FROM mentor_tasks WHERE matchId = ? AND kind = 'closure' AND status = 'open'", [$x['matchId']])) {
            db_insert('mentor_tasks', ['matchId' => $x['matchId'], 'memberId' => $x['memberId'], 'mentorId' => $x['mentorId'], 'centre' => $x['centre'],
                'kind' => 'closure', 'owner' => 'mentor', 'dueOn' => ms_add_days(gmdate('Y-m-d'), 14), 'status' => 'open',
                'doneAt' => '', 'doneBy' => '', 'note' => '', 'createdAt' => $now]);
        } else {
            db_exec("UPDATE mentor_tasks SET dueOn = ? WHERE matchId = ? AND kind = 'closure' AND status = 'open' AND dueOn > ?",
                [ms_add_days(gmdate('Y-m-d'), 14), $x['matchId'], ms_add_days(gmdate('Y-m-d'), 14)]);
        }
    }
    if ($to === 'closed') {
        $set += ['closedAt' => $now, 'phase' => 'close', 'closeReason' => trim((string)$x['closeReason'] . ($reason !== '' ? ' · ' . $reason : ''), ' ·')];
        db_exec("UPDATE mentor_tasks SET status = CASE WHEN kind = 'closure' THEN 'done' ELSE 'cancelled' END, doneAt = ?, doneBy = ? WHERE matchId = ? AND status = 'open'", [$now, $by, $x['matchId']]);
        db_exec("UPDATE mentor_assignments SET status = 'ended', endedAt = ? WHERE memberId = ? AND mentorId = ? AND status = 'active'", [$now, $x['memberId'], $x['mentorId']]);
    }
    db_update('mentor_matches', $set, ['matchId' => $x['matchId']]);
    return ['ok' => true, 'status' => $to];
}

/**
 * R8. A mentor says they are leaving: every live match starts a PLANNED
 * closure with a closure conversation, and the lead is told. Nobody is
 * re-matched here; each mentee returns to the queue only once their closure
 * is finished.
 */
function admin_ms_mentor_leaving(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $m = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [(string)($p['mentorId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $note = trim((string)($p['note'] ?? ''));
    db_update('mentors', ['leavingAt' => now_iso(), 'leavingNote' => $note], ['mentorId' => $m['mentorId']]);
    $n = ms_rule_r8((string)$m['mentorId']);
    audit('admin.mentorship.mentor.leaving', (string)$g['requester']['memberId'], (string)$m['mentorId'], ['matches' => $n], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'closing' => $n];
}
function ms_rule_r8(string $mentorId): int {
    $m = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]);
    if (!$m || trim((string)($m['leavingAt'] ?? '')) === '') return 0;
    $n = 0;
    foreach (db_all("SELECT * FROM mentor_matches WHERE mentorId = ? AND status IN ('active','paused')", [$mentorId]) as $x) {
        ms_set_status($x, 'closing', 'Mentor leaving', 'system');
        $n++;
    }
    if ($n > 0) {
        ms_nudge('R8:' . $mentorId . ':' . substr((string)$m['leavingAt'], 0, 10), 'R8', ['mentorId' => $mentorId, 'centre' => (string)$m['centre'],
            'title' => (string)$m['fullName'] . ' is leaving',
            'body' => $n . ' mentee' . ($n === 1 ? '' : 's') . ' moved to a planned closure. Each keeps their history and returns to the queue once their closure conversation is done.',
            'suggestion' => 'Plan a closure conversation for each mentee; do not re-match until it has happened.']);
    }
    return $n;
}

/* ── The adaptive rules (R1–R8, plus the commitment policy) ─────────────── */

/**
 * One pass over every live match. Idempotent: each nudge has a key, so the
 * web-cron may run it as often as it likes. Returns counts per rule.
 */
function ms_rules_run(?string $today = null): array {
    $today = $today ?? gmdate('Y-m-d');
    $fired = array_fill_keys(array_keys(MS_RULES), 0);
    $live = db_all("SELECT x.*, m.fullName menteeName, m.parentName, t.fullName mentorName FROM mentor_matches x
                    LEFT JOIN members m ON m.memberId = x.memberId LEFT JOIN mentors t ON t.mentorId = x.mentorId
                    WHERE x.status IN ('active','paused')");
    // Phase is derived, and stored so lists can filter on it.
    foreach ($live as &$x) {
        $ph = ms_phase_for((string)$x['startedAt'], $today);
        if ($ph !== (string)$x['phase']) { db_update('mentor_matches', ['phase' => $ph], ['matchId' => $x['matchId']]); $x['phase'] = $ph; }
    }
    unset($x);
    $active = array_values(array_filter($live, static fn($x) => $x['status'] === 'active'));
    if ($active) {
        $ids = array_column($active, 'memberId');
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $since = ms_add_days($today, -42);

        // R1 — two Saturdays in a row missed, counting only Saturdays the
        // centre actually met (a closed Saturday is nobody's absence).
        $met = [];
        foreach (db_all("SELECT DISTINCT a.date d, m.centre c FROM attendance a JOIN members m ON m.memberId = a.studentId
                         WHERE a.date >= ? AND a.date <= ?", [$since, $today]) as $r) {
            if (gmdate('w', strtotime($r['d'] . 'T00:00:00Z')) === '6') $met[(string)$r['c']][] = (string)$r['d'];
        }
        $seen = [];
        foreach (db_all("SELECT studentId, date FROM attendance WHERE date >= ? AND studentId IN ($ph)", array_merge([$since], $ids)) as $r) $seen[$r['studentId']][$r['date']] = true;
        foreach ($active as $x) {
            $days = $met[(string)$x['centre']] ?? [];
            rsort($days);
            $days = array_values(array_filter(array_unique($days), static fn($d) => $d >= substr((string)$x['startedAt'], 0, 10)));
            if (count($days) < 2) continue;
            [$a, $b] = [$days[0], $days[1]];
            if (empty($seen[$x['memberId']][$a]) && empty($seen[$x['memberId']][$b])) {
                $parent = trim((string)$x['parentName']) ?: 'there';
                if (ms_nudge("R1:{$x['matchId']}:$a", 'R1', $x + ['title' => $x['menteeName'] . ' missed two Saturdays',
                    'body' => 'Absent on ' . $b . ' and ' . $a . '. Check in this week.',
                    'suggestion' => "Hello $parent, we missed " . strtok((string)$x['menteeName'], ' ') . " at NGG the last two Saturdays. Is everything all right? We'd love to see them this week."])) $fired['R1']++;
            }
        }

        // R2 — no one-to-one for 21 days: top of the mentor's Today.
        $last = [];
        foreach (db_all("SELECT subjectId, MAX(metOn) d FROM mentor_meetings WHERE subjectId IN ($ph) AND kind IN ('one-to-one','one_to_one') GROUP BY subjectId", $ids) as $r) $last[$r['subjectId']] = substr((string)$r['d'], 0, 10);
        foreach ($active as $x) {
            $from = $last[$x['memberId']] ?? substr((string)$x['startedAt'], 0, 10);
            $gap = ms_days_between($from, $today);
            if ($gap >= MS_ONE_TO_ONE_GAP) {
                if (ms_nudge('R2:' . $x['matchId'] . ':' . iso_week_period(strtotime($today . 'T12:00:00Z')), 'R2', $x + ['title' => 'No one-to-one with ' . $x['menteeName'] . ' for ' . $gap . ' days',
                    'body' => isset($last[$x['memberId']]) ? 'Last one-to-one ' . $from . '.' : 'No one-to-one since the match started.',
                    'suggestion' => 'Plan 15 minutes with them this Saturday.'])) $fired['R2']++;
            }
        }

        // R3 — the review says "worse" twice running, or a concern was raised.
        $trend = [];
        foreach (db_all("SELECT subjectId, period, trend, concern FROM mentor_reviews WHERE subjectId IN ($ph) ORDER BY period DESC", $ids) as $r) $trend[$r['subjectId']][] = $r;
        $concerns = [];
        foreach (db_all("SELECT subjectId, MAX(metOn) d FROM mentor_meetings WHERE concern = 1 AND metOn >= ? AND subjectId IN ($ph) GROUP BY subjectId", array_merge([ms_add_days($today, -14)], $ids)) as $r) $concerns[$r['subjectId']] = (string)$r['d'];
        foreach ($active as $x) {
            $t = $trend[$x['memberId']] ?? [];
            $worse = count($t) >= 2 && $t[0]['trend'] === 'worse' && $t[1]['trend'] === 'worse';
            $recent = [iso_week_period(strtotime($today . 'T12:00:00Z')), iso_week_period(strtotime($today . 'T12:00:00Z') - 7 * 86400)];
            $concern = isset($concerns[$x['memberId']]) || (!empty($t[0]) && (int)$t[0]['concern'] === 1 && in_array((string)$t[0]['period'], $recent, true));
            $flagKey = $worse ? 'worse:' . $t[0]['period'] : ($concern ? 'concern:' . ($concerns[$x['memberId']] ?? $t[0]['period']) : '');
            if ($flagKey === '') continue;
            if (ms_nudge("R3:{$x['matchId']}:$flagKey", 'R3', $x + ['title' => $x['menteeName'] . ($worse ? ': reviews say worse twice' : ': a concern was raised'),
                'body' => 'Mentor: ' . $x['mentorName'] . '.', 'suggestion' => 'Agree one focused goal with the mentor and review it in two weeks.'])) {
                ms_intervention_open($x, 'R3', $worse ? 'Two weekly reviews in a row say worse.' : 'A concern was raised.', 'One focused goal, reviewed in two weeks.');
                $fired['R3']++;
            }
        }

        // R4 — a goal completed in the last week: suggest the next from the
        // Anchor 12 theme for this week of the match.
        $weeks = anchor_content()['weeks'] ?? [];
        foreach (db_all("SELECT id, subjectId, goal, closedOn FROM mentor_goals WHERE status = 'achieved' AND closedOn >= ? AND subjectId IN ($ph)", array_merge([ms_add_days($today, -7)], $ids)) as $goal) {
            foreach ($active as $x) if ($x['memberId'] === $goal['subjectId']) {
                if (ms_rule_r4($x, $goal, $today, $weeks)) $fired['R4']++;
            }
        }

        // R6 — a mentor's weekly reviews under half of the pod for three weeks
        // running. A support chat with the lead; never a public flag.
        $pods = [];
        foreach ($active as $x) $pods[$x['mentorId']][] = $x['memberId'];
        $periods = [];
        for ($i = 1; $i <= 3; $i++) $periods[] = iso_week_period(strtotime($today . 'T12:00:00Z') - $i * 7 * 86400);
        $pph = implode(',', array_fill(0, 3, '?'));
        $done = [];
        foreach (db_all("SELECT subjectId, period FROM mentor_reviews WHERE period IN ($pph) AND subjectId IN ($ph)", array_merge($periods, $ids)) as $r) $done[$r['period']][$r['subjectId']] = true;
        foreach ($pods as $mentorId => $kids) {
            $first = array_values(array_filter($active, static fn($x) => $x['mentorId'] === $mentorId))[0];
            if (ms_days_between((string)$first['startedAt'], $today) < 21) continue;
            $low = 0;
            foreach ($periods as $per) {
                $n = count(array_intersect($kids, array_keys($done[$per] ?? [])));
                if ($n * 2 < count($kids)) $low++;
            }
            if ($low === 3 && ms_nudge("R6:$mentorId:{$periods[0]}", 'R6', ['mentorId' => $mentorId, 'centre' => $first['centre'],
                'title' => 'Support chat with ' . $first['mentorName'], 'body' => 'Weekly reviews have been under half the pod for three weeks.',
                'suggestion' => 'Book a short support chat. This is private: it is not shown to the mentor or anyone else.'])) $fired['R6']++;
        }
    }

    // R7 — a low relationship check, on either side, this term.
    foreach (db_all("SELECT c.*, x.memberId, x.mentorId, x.centre, x.matchId, m.fullName menteeName FROM mentor_relationship_checks c
                     JOIN mentor_matches x ON x.matchId = c.matchId LEFT JOIN members m ON m.memberId = x.memberId
                     WHERE c.avg < 3 AND c.term = ? AND x.status IN ('active','paused')", [ms_term($today)]) as $c) {
        if (ms_nudge("R7:{$c['matchId']}:{$c['term']}:{$c['respondent']}", 'R7', $c + ['title' => 'Low relationship check: ' . $c['menteeName'],
            'body' => ucfirst((string)$c['respondent']) . ' scored ' . round((float)$c['avg'], 1) . ' of 5.', 'suggestion' => 'Coach the pair before the match breaks.'])) {
            ms_intervention_open($c, 'R7', 'The ' . $c['respondent'] . "'s relationship check scored " . round((float)$c['avg'], 1) . ' of 5.', 'A lead coaching session with the pair.');
            $fired['R7']++;
        }
    }

    // R8 — catch any leaving mentor whose matches were not yet moved.
    foreach (db_all("SELECT DISTINCT x.mentorId FROM mentor_matches x JOIN mentors t ON t.mentorId = x.mentorId
                     WHERE COALESCE(t.leavingAt,'') <> '' AND x.status IN ('active','paused')") as $r) {
        if (ms_rule_r8((string)$r['mentorId']) > 0) $fired['R8']++;
    }

    // P1 — the commitment policy, for the month just ended (private, lead only).
    if ((int)substr($today, 8, 2) <= 7) {
        $month = substr(ms_add_days(substr($today, 0, 8) . '01', -1), 0, 7);
        foreach (db_all("SELECT * FROM mentors WHERE status = 'active' AND COALESCE(leavingAt,'') = ''") as $m) {
            if (!ms_mentor_is_ngg($m)) continue;
            $c = ms_commitments($m, $month);
            if (!$c['applies'] || !$c['short']) continue;
            if (ms_nudge("P1:{$m['mentorId']}:$month", 'P1', ['mentorId' => (string)$m['mentorId'], 'centre' => (string)$m['centre'],
                'title' => $m['fullName'] . ': commitments short in ' . $month,
                'body' => implode(' · ', array_map(static fn($i) => $i['label'], $c['short'])),
                'suggestion' => 'Talk it through privately; the policy asks for follow-through, not a public flag.'])) $fired['P1']++;
        }
    }
    return $fired;
}

/** R4, also called the moment a goal is marked done. */
function ms_rule_r4(array $x, array $goal, string $today, ?array $weeks = null): bool {
    $weeks = $weeks ?? (anchor_content()['weeks'] ?? []);
    if (!$weeks) return false;
    $i = (max(1, ms_week_of((string)$x['startedAt'], $today)) - 1) % count($weeks);
    $w = $weeks[$i];
    return ms_nudge('R4:' . $goal['id'], 'R4', ['audience' => 'mentor', 'mentorId' => (string)$x['mentorId'], 'memberId' => (string)$x['memberId'],
        'matchId' => (string)$x['matchId'], 'centre' => (string)$x['centre'],
        'title' => 'Goal done: ' . mb_substr((string)$goal['goal'], 0, 80),
        'body' => 'This week\'s Anchor theme is ' . ($w['title'] ?? '') . '.',
        'suggestion' => 'Next goal, from the theme: ' . ($w['start'] ?? $w['focus'] ?? '') . '.']);
}
function ms_on_goal_done(string $memberId, int $goalId): void {
    $x = db_row("SELECT * FROM mentor_matches WHERE memberId = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [$memberId]);
    $goal = db_row('SELECT * FROM mentor_goals WHERE id = ? LIMIT 1', [$goalId]);
    if ($x && $goal) ms_rule_r4($x, $goal, gmdate('Y-m-d'));
}

/* ── The commitment policy, measured ────────────────────────────────────── */

/**
 * One mentor's commitments for one month (YYYY-MM): what was expected, what
 * was recorded, and which fell short. Conduct items are listed, not scored.
 */
function ms_commitments(array $m, string $month, ?array $loads = null): array {
    $first = $month . '-01';
    $last = gmdate('Y-m-t', strtotime($first . 'T00:00:00Z'));
    $days = [2 => 0, 6 => 0]; $weeks = [];
    for ($d = $first; $d <= $last; $d = ms_add_days($d, 1)) {
        $w = (int)gmdate('w', strtotime($d . 'T00:00:00Z'));
        if (isset($days[$w])) $days[$w]++;
        $weeks[gmdate('o-W', strtotime($d . 'T00:00:00Z'))] = true;
    }
    $rec = [];
    foreach (db_all("SELECT kind, onDate FROM mentor_obligations WHERE mentorId = ? AND status = 'present' AND onDate >= ? AND onDate <= ?",
                    [$m['mentorId'], substr($first, 0, 4) . '-01-01', $last]) as $r) $rec[$r['kind']][] = (string)$r['onDate'];
    $inMonth = static fn($k) => count(array_filter($rec[$k] ?? [], static fn($d) => $d >= $first));
    $q = intdiv((int)substr($month, 5, 2) - 1, 3);
    $qStart = substr($month, 0, 4) . '-' . sprintf('%02d', $q * 3 + 1) . '-01';
    $items = [];
    $cimcDone = trim((string)($m['cimcAt'] ?? '')) !== '';
    $items[] = ['key' => 'cimc', 'label' => MS_OBLIGATIONS['cimc']['label'], 'expected' => $cimcDone ? 0 : $days[6], 'done' => $inMonth('cimc'), 'note' => $cimcDone ? 'CIMC training completed' : ''];
    $items[] = ['key' => 'prep', 'label' => MS_OBLIGATIONS['prep']['label'], 'expected' => count($weeks), 'done' => $inMonth('prep')];
    $items[] = ['key' => 'saturday', 'label' => MS_OBLIGATIONS['saturday']['label'], 'expected' => 2, 'done' => $inMonth('saturday')];
    $items[] = ['key' => 'sts', 'label' => MS_OBLIGATIONS['sts']['label'], 'expected' => $days[2], 'done' => $inMonth('sts')];
    $quarterEnds = in_array((int)substr($month, 5, 2), [3, 6, 9, 12], true);
    $retreats = count(array_filter($rec['retreat'] ?? [], static fn($d) => $d >= $qStart && $d <= $last));
    $items[] = ['key' => 'retreat', 'label' => MS_OBLIGATIONS['retreat']['label'], 'expected' => $quarterEnds ? 1 : 0, 'done' => $retreats];
    $load = ($loads ?? ms_pod_loads())[(string)$m['mentorId']] ?? 0;
    $items[] = ['key' => 'five', 'label' => 'At least ' . MS_POD_MIN . ' children', 'expected' => MS_POD_MIN, 'done' => $load];
    $items[] = ['key' => 'anthem', 'label' => 'NGGC Anthem and Pledge', 'expected' => 1, 'done' => trim((string)($m['anthemAt'] ?? '')) !== '' ? 1 : 0];
    $parents = (int)(db_row("SELECT COUNT(*) c FROM mentor_tasks WHERE mentorId = ? AND kind = 'parent_summary' AND status = 'done' AND doneAt >= ? AND doneAt <= ?",
                     [$m['mentorId'], $first, $last . 'T23:59:59Z'])['c'] ?? 0);
    $parentDue = (int)(db_row("SELECT COUNT(*) c FROM mentor_tasks WHERE mentorId = ? AND kind = 'parent_summary' AND dueOn >= ? AND dueOn <= ? AND status <> 'cancelled'",
                     [$m['mentorId'], $first, $last])['c'] ?? 0);
    $items[] = ['key' => 'parents', 'label' => 'Parent summaries', 'expected' => $parentDue, 'done' => $parents];
    foreach ($items as &$i) $i['ok'] = $i['done'] >= $i['expected'];
    unset($i);
    // A mentor with no pod yet is not short on a pod they were never given.
    $applies = $load > 0;
    $short = array_values(array_filter($items, static fn($i) => !$i['ok']));
    return ['month' => $month, 'items' => $items, 'short' => $short, 'applies' => $applies,
            'conduct' => array_values(array_filter(mentorship_policy()['items'], static fn($i) => $i['track'] === 'conduct'))];
}

/** Record attendance at a commitment (prep, STS, CIMC, Saturday, retreat) for many mentors. */
function admin_ms_obligations_record(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $kind = (string)($p['kind'] ?? '');
    $date = trim((string)($p['date'] ?? ''));
    $status = in_array((string)($p['status'] ?? 'present'), ['present', 'excused', 'absent'], true) ? (string)($p['status'] ?? 'present') : 'present';
    if (!isset(MS_OBLIGATIONS[$kind])) return ['ok' => false, 'error' => 'bad_kind'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    $ids = array_values(array_unique(array_filter(array_map('strval', (array)($p['mentorIds'] ?? [])))));
    if (!$ids) return ['ok' => false, 'error' => 'empty'];
    if (count($ids) > 500) return ['ok' => false, 'error' => 'too_many', 'max' => 500];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $rows = []; foreach (db_all("SELECT mentorId, centre FROM mentors WHERE mentorId IN ($ph)", $ids) as $r) $rows[$r['mentorId']] = $r;
    $results = [];
    foreach ($ids as $id) {
        if (!isset($rows[$id])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!ms_in_scope($g, (string)$rows[$id]['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        $results[] = ['id' => $id, 'ok' => true];
    }
    $by = (string)$g['requester']['memberId'];
    foreach ($results as $r) if ($r['ok']) {
        db_upsert('mentor_obligations', ['mentorId' => $r['id'], 'kind' => $kind, 'onDate' => $date, 'status' => $status, 'note' => '', 'recordedBy' => $by, 'createdAt' => now_iso()],
            ['mentorId', 'kind', 'onDate'], ['status' => $status, 'recordedBy' => $by]);
    }
    $ok = count(array_filter($results, static fn($r) => $r['ok']));
    audit('admin.mentorship.obligations', $by, $kind, ['date' => $date, 'status' => $status, 'count' => $ok, 'refused' => count($results) - $ok], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'results' => $results, 'applied' => $ok];
}

/** One-time records on a mentor: CIMC training completed, Anthem & Pledge known. */
function admin_ms_mentor_mark(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $m = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [(string)($p['mentorId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $field = ['cimc' => 'cimcAt', 'anthem' => 'anthemAt', 'screened' => 'checkedAt', 'academy' => 'academyClearedAt'][(string)($p['what'] ?? '')] ?? '';
    if ($field === '') return ['ok' => false, 'error' => 'bad_field'];
    $on = !empty($p['on']);
    $by = (string)$g['requester']['memberId'];
    // Nobody records their own safeguarding check or their own training.
    if (in_array($field, ['academyClearedAt', 'checkedAt'], true) && $by === (string)$m['memberId']) return ['ok' => false, 'error' => 'own_account'];
    db_update('mentors', [$field => $on ? now_iso() : ''] + ($field === 'academyClearedAt' ? ['academyClearedBy' => $on ? $by : ''] : []), ['mentorId' => $m['mentorId']]);
    audit('admin.mentorship.mentor.mark', (string)$g['requester']['memberId'], (string)$m['mentorId'], ['what' => $p['what'], 'on' => $on], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Workspace: tasks, nudges, interventions, impact, pipeline ──────────── */

function admin_ms_checkins(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $today = ms_today($p);
    $args = [];
    $where = "k.status = 'open' AND k.dueOn <= ?" . ms_centre_filter($g, 'k.centre', $args, trim((string)($p['centre'] ?? '')));
    $rows = db_all("SELECT k.*, m.fullName menteeName, t.fullName mentorName FROM mentor_tasks k
                    LEFT JOIN members m ON m.memberId = k.memberId LEFT JOIN mentors t ON t.mentorId = k.mentorId
                    WHERE $where ORDER BY k.dueOn LIMIT 400", array_merge([ms_add_days($today, 14)], $args));
    foreach ($rows as &$r) $r['overdue'] = $r['dueOn'] < $today;
    unset($r);
    return ['ok' => true, 'tasks' => $rows, 'overdue' => count(array_filter($rows, static fn($r) => $r['overdue']))];
}

function admin_ms_task_done(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $t = db_row('SELECT * FROM mentor_tasks WHERE id = ? LIMIT 1', [(int)($p['id'] ?? 0)]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$t['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $st = in_array((string)($p['status'] ?? 'done'), ['done', 'skipped', 'open'], true) ? (string)($p['status'] ?? 'done') : 'done';
    db_update('mentor_tasks', ['status' => $st, 'doneAt' => $st === 'open' ? '' : now_iso(), 'doneBy' => $st === 'open' ? '' : (string)$g['requester']['memberId'],
        'note' => mb_substr(trim((string)($p['note'] ?? $t['note'])), 0, 1000)], ['id' => $t['id']]);
    return ['ok' => true];
}

function admin_ms_nudges(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $args = [];
    $where = "n.status = 'open'" . ms_centre_filter($g, 'n.centre', $args, trim((string)($p['centre'] ?? '')));
    $rows = db_all("SELECT n.* FROM mentor_nudges n WHERE $where ORDER BY CASE n.rule WHEN 'R3' THEN 0 WHEN 'R8' THEN 1 WHEN 'R7' THEN 2 ELSE 3 END, n.createdAt LIMIT 300", $args);
    foreach ($rows as &$r) $r['ruleLabel'] = MS_RULES[$r['rule']]['label'] ?? $r['rule'];
    unset($r);
    return ['ok' => true, 'nudges' => $rows];
}
function admin_ms_nudge_resolve(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $n = db_row('SELECT * FROM mentor_nudges WHERE id = ? LIMIT 1', [(int)($p['id'] ?? 0)]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$n['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $st = (string)($p['status'] ?? 'done') === 'dismissed' ? 'dismissed' : 'done';
    db_update('mentor_nudges', ['status' => $st, 'resolvedAt' => now_iso(), 'resolvedBy' => (string)$g['requester']['memberId']], ['id' => $n['id']]);
    return ['ok' => true];
}

function admin_ms_interventions(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $args = [];
    $where = '1 = 1' . ms_centre_filter($g, 'i.centre', $args, trim((string)($p['centre'] ?? '')));
    $rows = db_all("SELECT i.*, m.fullName menteeName, t.fullName mentorName FROM mentor_interventions i
                    LEFT JOIN members m ON m.memberId = i.memberId LEFT JOIN mentors t ON t.mentorId = i.mentorId
                    WHERE $where ORDER BY CASE i.status WHEN 'open' THEN 0 ELSE 1 END, i.reviewOn LIMIT 300", $args);
    $cargs = [];
    $closures = db_all("SELECT x.matchId, x.memberId, x.status, x.closingAt, x.closedAt, x.closeReason, m.fullName menteeName, t.fullName mentorName
                        FROM mentor_matches x LEFT JOIN members m ON m.memberId = x.memberId LEFT JOIN mentors t ON t.mentorId = x.mentorId
                        WHERE x.status IN ('closing','closed')" . ms_centre_filter($g, 'x.centre', $cargs) . ' ORDER BY x.updatedAt DESC LIMIT 100', $cargs);
    return ['ok' => true, 'interventions' => $rows, 'closures' => $closures];
}
function admin_ms_intervention_save(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $plan = mb_substr(trim((string)($p['plan'] ?? '')), 0, 2000);
    $review = trim((string)($p['reviewOn'] ?? ''));
    if ($review !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $review)) return ['ok' => false, 'error' => 'bad_date'];
    $me = $g['requester'];
    if ($id > 0) {
        $i = db_row('SELECT * FROM mentor_interventions WHERE id = ? LIMIT 1', [$id]);
        if (!$i) return ['ok' => false, 'error' => 'not_found'];
        if (!ms_in_scope($g, (string)$i['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
        $close = !empty($p['close']);
        if ($close && trim((string)($p['outcome'] ?? '')) === '') return ['ok' => false, 'error' => 'outcome_required'];
        db_update('mentor_interventions', array_filter([
            'plan' => $plan !== '' ? $plan : null, 'reviewOn' => $review !== '' ? $review : null,
            'ownerId' => (string)$me['memberId'], 'ownerName' => (string)($me['fullName'] ?? ''),
            'status' => $close ? 'closed' : null, 'outcome' => $close ? mb_substr(trim((string)$p['outcome']), 0, 2000) : null,
            'closedAt' => $close ? now_iso() : null], static fn($v) => $v !== null), ['id' => $id]);
        return ['ok' => true, 'id' => $id];
    }
    $x = db_row('SELECT * FROM mentor_matches WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$x) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$x['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $reason = mb_substr(trim((string)($p['reason'] ?? '')), 0, 1000);
    if ($reason === '' || $plan === '') return ['ok' => false, 'error' => 'reason_and_plan_required'];
    $newId = db_insert('mentor_interventions', ['matchId' => $x['matchId'], 'memberId' => $x['memberId'], 'mentorId' => $x['mentorId'], 'centre' => $x['centre'],
        'rule' => '', 'reason' => $reason, 'plan' => $plan, 'ownerId' => (string)$me['memberId'], 'ownerName' => (string)($me['fullName'] ?? ''),
        'reviewOn' => $review ?: ms_add_days(gmdate('Y-m-d'), 14), 'status' => 'open', 'outcome' => '', 'createdBy' => (string)$me['memberId'],
        'createdAt' => now_iso(), 'closedAt' => '']);
    audit('admin.mentorship.intervention', (string)$me['memberId'], (string)$x['memberId'], ['id' => $newId], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'id' => $newId];
}

/** Staff record a relationship check (typically the guardian's, by phone). */
function admin_ms_relcheck_save(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $x = db_row('SELECT * FROM mentor_matches WHERE matchId = ? LIMIT 1', [(string)($p['matchId'] ?? '')]);
    if (!$x) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$x['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $resp = (string)($p['respondent'] ?? '');
    if (!in_array($resp, ['mentor', 'mentee', 'guardian'], true)) return ['ok' => false, 'error' => 'bad_respondent'];
    return ms_relcheck_write($x, $resp, (array)($p['answers'] ?? []), (string)$g['requester']['memberId'], ms_today($p), (string)($p['note'] ?? ''));
}
function ms_relcheck_write(array $x, string $resp, array $a, string $by, string $today, string $note = ''): array {
    $q = [];
    for ($i = 1; $i <= 4; $i++) {
        $v = (int)($a['q' . $i] ?? $a[$i - 1] ?? 0);
        if ($v < 1 || $v > 5) return ['ok' => false, 'error' => 'bad_answer', 'q' => $i];
        $q['q' . $i] = $v;
    }
    $avg = round(array_sum($q) / 4, 2);
    $term = ms_term($today);
    db_upsert('mentor_relationship_checks', ['matchId' => $x['matchId'], 'respondent' => $resp, 'term' => $term] + $q + ['avg' => $avg, 'note' => mb_substr(trim($note), 0, 1000), 'byId' => $by, 'createdAt' => now_iso()],
        ['matchId', 'respondent', 'term'], $q + ['avg' => $avg, 'byId' => $by]);
    db_exec("UPDATE mentor_tasks SET status = 'done', doneAt = ?, doneBy = ? WHERE id = (SELECT id FROM mentor_tasks WHERE matchId = ? AND kind = 'relationship_check' AND status = 'open' ORDER BY dueOn LIMIT 1)",
        [now_iso(), $by, $x['matchId']]);
    return ['ok' => true, 'avg' => $avg, 'term' => $term];
}

/**
 * The six measures against their fixed targets (MENTORSHIP.md §2). Every
 * figure says its numerator and denominator so it can be checked by hand.
 */
function ms_impact(array $g, string $today): array {
    $args = []; $cf = ms_centre_filter($g, 'x.centre', $args);
    $pct = static fn($n, $d) => $d > 0 ? (int)round(100 * $n / $d) : null;
    // Match length: of matches started at least 12 months ago, how many
    // reached 12 months (still live, or closed after 364 days).
    $yearAgo = ms_add_days($today, -364);
    $old = db_all("SELECT startedAt, status, closedAt FROM mentor_matches x WHERE x.startedAt <> '' AND x.startedAt <= ?$cf", array_merge([$yearAgo], $args));
    $reached = count(array_filter($old, static fn($r) => $r['status'] !== 'closed' || ms_days_between((string)$r['startedAt'], substr((string)$r['closedAt'], 0, 10)) >= 364));
    $live = db_all("SELECT x.matchId, x.memberId, x.mentorId FROM mentor_matches x WHERE x.status = 'active'$cf", $args);
    $ids = array_column($live, 'memberId');
    $contact = 0; $reviewed = 0;
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $contact = (int)(db_row("SELECT COUNT(DISTINCT subjectId) c FROM mentor_meetings WHERE kind IN ('one-to-one','one_to_one') AND metOn >= ? AND subjectId IN ($ph)", array_merge([ms_add_days($today, -14)], $ids))['c'] ?? 0);
        $lastWeek = iso_week_period(strtotime($today . 'T12:00:00Z') - 7 * 86400);
        $reviewed = (int)(db_row("SELECT COUNT(DISTINCT subjectId) c FROM mentor_reviews WHERE period = ? AND subjectId IN ($ph)", array_merge([$lastWeek], $ids))['c'] ?? 0);
    }
    $rel = db_row("SELECT AVG(c.avg) a, COUNT(*) n FROM mentor_relationship_checks c JOIN mentor_matches x ON x.matchId = c.matchId
                   WHERE c.respondent IN ('mentor','mentee') AND c.term = ?$cf", array_merge([ms_term($today)], $args));
    $goals = db_row("SELECT SUM(CASE WHEN gl.status = 'achieved' AND (gl.dueOn = '' OR gl.closedOn <= gl.dueOn) THEN 1 ELSE 0 END) ok, COUNT(*) n
                     FROM mentor_goals gl WHERE gl.dueOn <> '' AND gl.dueOn <= ?
                     AND EXISTS (SELECT 1 FROM mentor_matches x WHERE x.memberId = gl.subjectId AND x.startedAt <> ''$cf)", array_merge([$today], $args));
    $margs = []; $mcf = ms_centre_filter($g, 'centre', $margs);
    $mentors = db_all("SELECT status, joinedAt, createdAt, leavingAt FROM mentors WHERE COALESCE(joinedAt, createdAt, '') <> '' AND substr(COALESCE(NULLIF(joinedAt,''), createdAt), 1, 10) <= ?$mcf", array_merge([$yearAgo], $margs));
    $stayed = count(array_filter($mentors, static fn($m) => $m['status'] === 'active' && trim((string)($m['leavingAt'] ?? '')) === ''));
    $m = static fn($key, $label, $value, $n, $d, $target, $unit = '%') => compact('key', 'label', 'value', 'n', 'd', 'target', 'unit') + ['met' => $value !== null && $value >= $target];
    $relAvg = (int)($rel['n'] ?? 0) > 0 ? round((float)$rel['a'], 2) : null;
    return [
        $m('matchLength', 'Match length', $pct($reached, count($old)), $reached, count($old), MS_TARGETS['matchLength']),
        $m('contact', 'Contact', $pct($contact, count($ids)), $contact, count($ids), MS_TARGETS['contact']),
        $m('weeklyReviews', 'Weekly reviews', $pct($reviewed, count($ids)), $reviewed, count($ids), MS_TARGETS['weeklyReviews']),
        $m('relationship', 'Relationship quality', $relAvg, (int)($rel['n'] ?? 0), (int)($rel['n'] ?? 0), MS_TARGETS['relationship'], 'of 5'),
        $m('goals', 'Goals', $pct((int)($goals['ok'] ?? 0), (int)($goals['n'] ?? 0)), (int)($goals['ok'] ?? 0), (int)($goals['n'] ?? 0), MS_TARGETS['goals']),
        $m('retention', 'Mentor retention', $pct($stayed, count($mentors)), $stayed, count($mentors), MS_TARGETS['retention']),
    ];
}
function admin_ms_impact(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    return ['ok' => true, 'measures' => ms_impact($g, ms_today($p))];
}

/** From application to first match: every NGG mentor's clearance, pod and commitments. */
function admin_ms_pipeline(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $args = [];
    $rows = array_values(array_filter(db_all("SELECT * FROM mentors WHERE status = 'active'" . ms_centre_filter($g, 'centre', $args, trim((string)($p['centre'] ?? ''))) . ' ORDER BY fullName', $args), 'ms_mentor_is_ngg'));
    $clear = ms_clearance_bulk($rows, ms_today($p));
    $loads = ms_pod_loads();
    $month = substr(ms_today($p), 0, 7);
    $out = [];
    foreach ($rows as $m) {
        $c = ms_commitments($m, $month, $loads);
        $out[] = ['mentorId' => $m['mentorId'], 'fullName' => $m['fullName'], 'centre' => $m['centre'], 'rank' => $m['rank'] ?? 'mentor',
            'clearance' => $clear[$m['mentorId']], 'pod' => $loads[$m['mentorId']] ?? 0, 'cap' => ms_mentor_cap($m),
            'leaving' => trim((string)($m['leavingAt'] ?? '')) !== '', 'cimc' => trim((string)($m['cimcAt'] ?? '')) !== '',
            'anthem' => trim((string)($m['anthemAt'] ?? '')) !== '', 'commitments' => $c['items']];
    }
    return ['ok' => true, 'mentors' => $out, 'policy' => mentorship_policy(), 'obligations' => MS_OBLIGATIONS,
            'academy' => ['required' => count(ms_required_modules()), 'cleared' => count(array_filter($clear, static fn($c) => $c['cleared']))]];
}

/** The workspace's first screen: tab counts and what needs a person. */
function admin_ms_overview(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $today = ms_today($p);
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '' && !ms_in_scope($g, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
    $rels = ms_relationships($g, $centre, $today);
    $health = array_count_values(array_column($rels, 'health'));
    $phases = array_count_values(array_column($rels, 'phase'));
    $a1 = []; $ivOpen = (int)(db_row("SELECT COUNT(*) c FROM mentor_interventions WHERE status = 'open'" . ms_centre_filter($g, 'centre', $a1, $centre), $a1)['c'] ?? 0);
    $a2 = []; $overdue = (int)(db_row("SELECT COUNT(*) c FROM mentor_tasks WHERE status = 'open' AND dueOn < ?" . ms_centre_filter($g, 'centre', $a2, $centre), array_merge([$today], $a2))['c'] ?? 0);
    $a3 = []; $closed = (int)(db_row("SELECT COUNT(*) c FROM mentor_matches WHERE status = 'closed'" . ms_centre_filter($g, 'centre', $a3, $centre), $a3)['c'] ?? 0);
    $a4 = []; $offered = (int)(db_row("SELECT COUNT(*) c FROM mentor_matches WHERE status = 'offered'" . ms_centre_filter($g, 'centre', $a4, $centre), $a4)['c'] ?? 0);
    $waiting = ms_waiting($centre !== '' ? [$centre] : $g['centres']);
    $nudges = admin_ms_nudges($p)['nudges'] ?? [];
    $safe = null;
    if (in_array('safeguarding', member_effective_caps($g['requester']), true)) {
        $a5 = []; $safe = (int)(db_row("SELECT COUNT(*) c FROM safeguarding_cases WHERE status <> 'resolved'" . ms_centre_filter($g, 'centre', $a5, $centre), $a5)['c'] ?? 0);
    }
    return ['ok' => true,
        'counts' => ['queue' => count($waiting), 'rel' => count(array_filter($rels, static fn($r) => $r['health'] !== 'Healthy')),
                     'chk' => $overdue, 'iv' => $ivOpen, 'safe' => $safe],
        'health' => $health, 'lifecycle' => ['offered' => $offered] + $phases + ['closing' => count(array_filter($rels, static fn($r) => $r['status'] === 'closing')), 'closed' => $closed],
        'needsAttention' => array_slice($nudges, 0, 12),
        'waiting' => array_slice(array_map(static fn($w) => ['memberId' => $w['memberId'], 'fullName' => $w['fullName'], 'centre' => $w['centre'], 'waitingSince' => $w['waitingSince']], $waiting), 0, 6),
        'evidence' => ms_evidence_checks($g, $centre, $today),
        'canSafeguard' => $safe !== null];
}

/**
 * Evidence checks: observations rated above "Not seen" whose evidence is too
 * thin to support the rating. Flagged so ratings stay honest; nothing is
 * changed without the mentor.
 */
function ms_evidence_checks(array $g, string $centre, string $today): array {
    $args = [];
    $rows = db_all("SELECT o.id, o.memberId, o.mentorId, o.indicator, o.level, o.evidence, o.onDate, m.fullName menteeName
                    FROM mentor_observations o JOIN mentor_matches x ON x.memberId = o.memberId AND x.mentorId = o.mentorId AND x.status = 'active'
                    LEFT JOIN members m ON m.memberId = o.memberId
                    WHERE o.onDate >= ? AND o.level >= 2" . ms_centre_filter($g, 'x.centre', $args, $centre) . ' ORDER BY o.onDate DESC LIMIT 200',
                    array_merge([ms_add_days($today, -28)], $args));
    return array_values(array_filter($rows, static fn($r) => mb_strlen(trim((string)$r['evidence'])) < 20));
}

/** Who a mentee is, for matching — editable by staff. */
function admin_ms_profile_save(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $mid = (string)($p['memberId'] ?? '');
    $sg = admin_member_scope_gate($g['requester'], $mid); if (!$sg['ok']) return $sg;
    $row = ['memberId' => $mid];
    foreach (['interests', 'wantsTo', 'supportArea', 'availability', 'style'] as $k) $row[$k] = mb_substr(trim((string)($p[$k] ?? '')), 0, 500);
    $row += ['updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']];
    $upd = $row; unset($upd['memberId']);
    db_upsert('mentee_profiles', $row, ['memberId'], $upd);
    return ['ok' => true];
}

function admin_ms_rules_run(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    return ['ok' => true, 'fired' => ms_rules_run(ms_today($p))];
}

/* ── Safeguarding ───────────────────────────────────────────────────────── */

const SG_CATEGORIES = ['Something a young person told me', 'Signs of harm or neglect', 'Bullying', 'Emotional wellbeing',
                       'Online safety', 'Conduct of an adult', 'Relationship concern', 'Something else'];
const SG_STATUSES = ['received', 'reviewing', 'action', 'escalated', 'resolved'];

/** The safeguarding officer for a centre: staff holding `safeguarding` whose scope covers it. */
function sg_officer(string $centre): ?array {
    foreach (db_all("SELECT * FROM members WHERE status = 'active' AND COALESCE(role,'') NOT IN ('', 'member') ORDER BY id") as $m) {
        if (!in_array('safeguarding', member_effective_caps($m), true)) continue;
        $names = admin_centre_names_in_scope($m);
        if ($names === null || in_array($centre, $names, true)) return $m;
    }
    return null;
}

/* Reports one person may file in 24 hours, across both paths (this one and
 * mp_concern_file). Ten real concerns in a day is a crisis that the officer
 * should hear about by phone; ten more is somebody flooding the queue. */
const SG_REPORTS_PER_DAY = 10;

/** Over the cap? Counted from the cases themselves, so it holds across both ops. */
function sg_report_capped(string $reporterId): bool {
    $n = (int)(db_row('SELECT COUNT(*) c FROM safeguarding_cases WHERE reporterId = ? AND createdAt >= ?',
                      [$reporterId, gmdate('Y-m-d\TH:i:s', time() - 86400)])['c'] ?? 0);
    return $n >= SG_REPORTS_PER_DAY;
}
function sg_report_refusal(string $reporterId, string $centre): array {
    if (function_exists('ops_record')) ops_record('warn', 'safeguarding.cap', 'A reporter reached the daily concern cap', 'reporter=' . $reporterId . ' centre=' . $centre);
    $o = sg_officer($centre);
    return ['ok' => false, 'error' => 'report_limit', 'max' => SG_REPORTS_PER_DAY,
            'detail' => 'You have sent ' . SG_REPORTS_PER_DAY . ' reports today. If a child is in danger now, call '
                      . ($o && trim((string)($o['phone'] ?? '')) !== '' ? (string)$o['fullName'] . ' on ' . (string)$o['phone'] : 'your safeguarding officer') . '.'];
}

/**
 * Report a concern. Mentors and staff may report (a mentor who has not finished
 * the Academy still has a duty to report); the report goes to the centre's
 * safeguarding officer only, and the reporter can neither edit nor see it
 * after sending — they get the case number and who received it.
 */
function sg_report(array $p, bool $self = false): array {
    $me = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['requesterId'] ?? '')]);
    if (!$me) return ['ok' => false, 'error' => 'no_requester'];
    if ($self) {
        /* A child telling us about themselves (member_sg_self). The subject is
         * always the reporter — no id is taken from the request — so this can
         * never be used to file a case about somebody else, which is what the
         * mentor gate below exists to stop. */
        if ((string)($me['status'] ?? '') !== 'active') return ['ok' => false, 'error' => 'no_requester'];
        $p['subjectId'] = (string)$me['memberId'];
        $gate = ['ok' => true, 'centres' => null, 'courses' => null, 'mentor' => ['centre' => (string)($me['centre'] ?? '')]];
    }
    /* The portal's report, so the portal's people: anyone mentor_gate admits
     * (screened or not — the duty to report does not wait for the Academy).
     * It was any signed-in account, which let a member file a case naming
     * any other member, with no limit. */
    if (!$self) $gate = function_exists('mentor_gate') ? mentor_gate($p) : ['ok' => false];
    if (empty($gate['ok'])) return ['ok' => false, 'error' => 'not_a_mentor'];
    $body = trim((string)($p['body'] ?? ''));
    if (mb_strlen($body) < 10) return ['ok' => false, 'error' => 'too_short'];
    $cat = (string)($p['category'] ?? '');
    if (!in_array($cat, SG_CATEGORIES, true)) $cat = 'Something else';
    $subjectId = trim((string)($p['subjectId'] ?? ''));
    $subject = $subjectId !== '' ? db_row('SELECT memberId, fullName, centre, track FROM members WHERE memberId = ? LIMIT 1', [$subjectId]) : null;
    if ($subjectId !== '') {
        // Out of reach and unknown are the same answer, as in member_mp_concern.
        $reach = array_key_exists('reportCentres', $gate) ? ['centres' => $gate['reportCentres'], 'courses' => $gate['reportCourses']] : $gate;
        if (!$subject || !mentor_scope_ok($reach, $subject)) return ['ok' => false, 'error' => 'not_found'];
    }
    $centre = (string)($subject['centre'] ?? ($gate['mentor']['centre'] ?? '') ?: ($me['centre'] ?? ''));
    if (sg_report_capped((string)$me['memberId'])) return sg_report_refusal((string)$me['memberId'], $centre);
    $officer = sg_officer($centre);
    $now = now_iso();
    $caseNo = '';
    for ($i = 0; $i < 5 && $caseNo === ''; $i++) {
        $n = 'C-' . gmdate('y') . str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
        if (!db_row('SELECT 1 FROM safeguarding_cases WHERE caseNo = ?', [$n])) $caseNo = $n;
    }
    db_insert('safeguarding_cases', ['caseNo' => $caseNo, 'reporterId' => (string)$me['memberId'], 'reporterName' => (string)($me['fullName'] ?? ''),
        'subjectId' => (string)($subject['memberId'] ?? ''), 'subjectName' => (string)($subject['fullName'] ?? trim((string)($p['subjectName'] ?? ''))),
        'centre' => $centre, 'category' => $cat, 'body' => mb_substr($body, 0, 8000),
        'officerId' => (string)($officer['memberId'] ?? ''), 'officerName' => (string)($officer['fullName'] ?? ''),
        'status' => 'received', 'createdAt' => $now, 'updatedAt' => $now]);
    if ($officer && !empty($officer['email']) && function_exists('send_mail')) {
        try { send_mail((string)$officer['email'], 'Safeguarding concern ' . $caseNo,
            '<p>A safeguarding concern was reported at ' . htmlspecialchars($centre) . '. Case ' . $caseNo . '.</p><p>Open the Control Room → People → Mentorship → Safeguarding to read it. The details are not sent by email.</p>'); } catch (Throwable $e) {}
    }
    audit('safeguarding.report', (string)$me['memberId'], $caseNo, ['centre' => $centre], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'caseNo' => $caseNo, 'officerName' => (string)($officer['fullName'] ?? 'the safeguarding officer'),
            'receivedBy' => $officer ? 'officer' : 'unassigned'];
}

function sg_gate(array $p): array {
    $g = admin_cap_gate($p, 'safeguarding');
    if (!$g['ok']) return $g;
    $g['centres'] = admin_centre_names_in_scope($g['requester']);
    return $g;
}
function admin_sg_cases(array $p): array {
    $g = sg_gate($p); if (!$g['ok']) return $g;
    $args = [];
    $rows = db_all('SELECT * FROM safeguarding_cases WHERE 1 = 1' . ms_centre_filter($g, 'centre', $args, trim((string)($p['centre'] ?? ''))) .
                   " ORDER BY CASE status WHEN 'resolved' THEN 1 ELSE 0 END, createdAt DESC LIMIT 300", $args);
    audit('safeguarding.list', (string)$g['requester']['memberId'], '', ['n' => count($rows)]);
    return ['ok' => true, 'cases' => $rows, 'categories' => SG_CATEGORIES, 'statuses' => SG_STATUSES];
}
function admin_sg_case(array $p): array {
    $g = sg_gate($p); if (!$g['ok']) return $g;
    $c = db_row('SELECT * FROM safeguarding_cases WHERE caseNo = ? LIMIT 1', [(string)($p['caseNo'] ?? '')]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$c['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    audit('safeguarding.read', (string)$g['requester']['memberId'], (string)$c['caseNo']);
    return ['ok' => true, 'case' => $c, 'notes' => db_all('SELECT * FROM safeguarding_notes WHERE caseNo = ? ORDER BY id', [$c['caseNo']])];
}
/** The report itself is never edited; the officer adds notes and moves the status. */
function admin_sg_note(array $p): array {
    $g = sg_gate($p); if (!$g['ok']) return $g;
    $c = db_row('SELECT * FROM safeguarding_cases WHERE caseNo = ? LIMIT 1', [(string)($p['caseNo'] ?? '')]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$c['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $note = trim((string)($p['note'] ?? ''));
    $status = (string)($p['status'] ?? '');
    if ($status !== '' && !in_array($status, SG_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    if ($note === '' && $status === '') return ['ok' => false, 'error' => 'empty'];
    $me = $g['requester'];
    db_insert('safeguarding_notes', ['caseNo' => $c['caseNo'], 'byId' => (string)$me['memberId'], 'byName' => (string)($me['fullName'] ?? ''),
        'note' => mb_substr($note, 0, 8000), 'status' => $status, 'createdAt' => now_iso()]);
    if ($status !== '') db_update('safeguarding_cases', ['status' => $status, 'updatedAt' => now_iso()], ['caseNo' => $c['caseNo']]);
    audit('safeguarding.note', (string)$me['memberId'], (string)$c['caseNo'], ['status' => $status]);
    return ['ok' => true];
}

/* ── The Mentor Portal (pods) ───────────────────────────────────────────── */

/**
 * The portal's gate for pod data: a mentor record, and clearance. An
 * uncertified mentor gets their clearance state and no mentee data at all.
 */
function ms_portal_gate(array $p): array {
    $g = mentor_gate($p);
    if (empty($g['ok'])) return $g;
    $mid = (string)($g['mentorId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mid]) : null;
    /* Staff see every pod in their scope (the coordinator's view), unless they
       run a cleared NGG pod of their own. Their reach is their role's, not the
       Academy's; they read, and leave the mentoring to the mentors. */
    $own = $m && ms_mentor_is_ngg($m) ? ms_clearance($m) : null;
    if (($g['role'] ?? '') === 'admin' && in_array('ngg', (array)($g['programmes'] ?? []), true) && !($own['cleared'] ?? false)) {
        $staff = $g['member'];
        return ['ok' => true, 'g' => $g, 'staffView' => true, 'centres' => $g['centres'] ?? null,
                'mentor' => ['mentorId' => '', 'fullName' => (string)($staff['fullName'] ?? ''), 'centre' => (string)($g['mentor']['centre'] ?? ''), 'rank' => 'coord', 'maxMentees' => 0],
                'clearance' => ['cleared' => true, 'staff' => true, 'screened' => true, 'modulesDone' => 0, 'modulesRequired' => count(ms_required_modules()), 'policy' => true, 'missing' => []]];
    }
    if (!$m) return ['ok' => false, 'error' => 'no_mentor_record'];
    // Pods are NGG's. A Summer School mentor keeps the class roster.
    if (!ms_mentor_is_ngg($m)) return ['ok' => false, 'error' => 'not_a_pod_mentor'];
    return ['ok' => true, 'g' => $g, 'mentor' => $m, 'clearance' => $own];
}
/** The Academy and the policy are a mentor's own record; the staff view has none. */
function ms_portal_gate_own(array $p): array {
    $o = ms_portal_gate($p);
    if (!empty($o['staffView'])) return ['ok' => false, 'error' => 'no_mentor_record'];
    return $o;
}
/** Gate + "this mentee is in MY pod". Anything else is a 403. */
function ms_pod_open(array $p, bool $write = false): array {
    $o = ms_portal_gate($p);
    if (!$o['ok']) return $o;
    if (!$o['clearance']['cleared']) return ['ok' => false, 'error' => 'not_cleared', 'clearance' => $o['clearance']];
    if (!empty($o['staffView'])) {
        // Staff read any pod in their scope; the record is written by its mentor.
        if ($write) return ['ok' => false, 'error' => 'staff_view_read_only'];
        $x = db_row("SELECT * FROM mentor_matches WHERE memberId = ? AND status IN ('active','paused','closing') LIMIT 1", [(string)($p['memberId'] ?? $p['subjectId'] ?? '')]);
        if (!$x || ($o['centres'] !== null && !in_array((string)$x['centre'], $o['centres'], true))) return ['ok' => false, 'error' => 'not_in_pod'];
        return $o + ['match' => $x];
    }
    $x = db_row("SELECT * FROM mentor_matches WHERE memberId = ? AND mentorId = ? AND status IN ('active','paused','closing') LIMIT 1",
                [(string)($p['memberId'] ?? $p['subjectId'] ?? ''), (string)$o['mentor']['mentorId']]);
    if (!$x) return ['ok' => false, 'error' => 'not_in_pod'];
    return $o + ['match' => $x];
}

function member_ms_today(array $p): array {
    $o = ms_portal_gate($p); if (!$o['ok']) return $o;
    $m = $o['mentor']; $today = ms_today($p);
    $base = ['ok' => true, 'mentor' => ['mentorId' => $m['mentorId'], 'fullName' => $m['fullName'], 'centre' => $m['centre'], 'rank' => $m['rank'] ?? 'mentor'],
             'clearance' => $o['clearance'], 'policy' => ['version' => MS_POLICY_VERSION, 'accepted' => $o['clearance']['policy'] ?? false],
             // 'admin' when the person is staff: their reach comes from their role, not the Academy.
             'role' => (string)($o['g']['role'] ?? 'mentor'), 'staffView' => !empty($o['staffView'])];
    if (!$o['clearance']['cleared']) return $base + ['cleared' => false, 'pod' => [], 'needsYou' => [], 'oneToOnes' => [], 'todo' => []];
    $staff = !empty($o['staffView']);
    $g = ['centres' => $staff ? $o['centres'] : null];
    $rels = ms_relationships($g, '', $today, $staff ? null : (string)$m['mentorId']);
    $ids = array_column($rels, 'memberId');
    $here = []; $obs = []; $rev = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT studentId FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$today], $ids)) as $r) $here[$r['studentId']] = true;
        foreach (db_all("SELECT DISTINCT memberId FROM mentor_observations WHERE onDate = ? AND memberId IN ($ph)", array_merge([$today], $ids)) as $r) $obs[$r['memberId']] = true;
        foreach (db_all("SELECT subjectId FROM mentor_reviews WHERE period = ? AND subjectId IN ($ph)", array_merge([iso_week_period(strtotime($today . 'T12:00:00Z'))], $ids)) as $r) $rev[$r['subjectId']] = true;
    }
    $pod = array_map(static fn($r) => $r + ['here' => isset($here[$r['memberId']]), 'observed' => isset($obs[$r['memberId']]), 'reviewed' => isset($rev[$r['memberId']]),
        'goalsLocked' => $r['phase'] === 'connect'], $rels);
    // One-to-ones, longest wait first; 21 days or more goes to the top (R2).
    $oto = array_map(static function ($r) use ($today) {
        $from = $r['lastContact'] ?: substr((string)$r['startedAt'], 0, 10);
        return ['memberId' => $r['memberId'], 'menteeName' => $r['menteeName'], 'lastContact' => $r['lastContact'],
                'days' => ms_days_between($from, $today), 'overdue' => ms_days_between($from, $today) >= MS_ONE_TO_ONE_GAP];
    }, $rels);
    usort($oto, static fn($a, $b) => [$b['overdue'], $b['days']] <=> [$a['overdue'], $a['days']]);
    if ($staff) {
        $a1 = []; $cf1 = ms_centre_filter($g, 'centre', $a1);
        $needs = db_all("SELECT id, rule, memberId, matchId, title, body, suggestion, createdAt FROM mentor_nudges
                         WHERE status = 'open' AND audience = 'mentor'$cf1 ORDER BY CASE rule WHEN 'R2' THEN 0 WHEN 'R1' THEN 1 ELSE 2 END, createdAt LIMIT 60", $a1);
        $a2 = []; $cf2 = ms_centre_filter($g, 'k.centre', $a2);
        $todo = db_all("SELECT k.id, k.kind, k.dueOn, k.memberId, mm.fullName menteeName FROM mentor_tasks k LEFT JOIN members mm ON mm.memberId = k.memberId
                        WHERE k.owner = 'mentor' AND k.status = 'open' AND k.dueOn <= ?$cf2 ORDER BY k.dueOn LIMIT 50", array_merge([ms_add_days($today, 7)], $a2));
    } else {
    $needs = db_all("SELECT id, rule, memberId, matchId, title, body, suggestion, createdAt FROM mentor_nudges
                     WHERE status = 'open' AND audience = 'mentor' AND mentorId = ? ORDER BY CASE rule WHEN 'R2' THEN 0 WHEN 'R1' THEN 1 ELSE 2 END, createdAt", [$m['mentorId']]);
    $todo = db_all("SELECT k.id, k.kind, k.dueOn, k.memberId, mm.fullName menteeName FROM mentor_tasks k LEFT JOIN members mm ON mm.memberId = k.memberId
                    WHERE k.mentorId = ? AND k.owner = 'mentor' AND k.status = 'open' AND k.dueOn <= ? ORDER BY k.dueOn LIMIT 50", [$m['mentorId'], ms_add_days($today, 7)]);
    }
    return $base + ['cleared' => true, 'pod' => $pod, 'podSize' => count($pod), 'podMin' => MS_POD_MIN, 'podMax' => $staff ? 0 : ms_mentor_cap($m),
        'counters' => ['here' => count($here), 'observed' => count($obs), 'reviewed' => count($rev), 'of' => count($pod)],
        'needsYou' => $needs, 'oneToOnes' => $oto, 'todo' => $todo, 'indicators' => MS_INDICATORS, 'levels' => MS_LEVELS];
}

function member_ms_case(array $p): array {
    $o = ms_pod_open($p); if (!$o['ok']) return $o;
    $x = $o['match']; $id = (string)$x['memberId']; $today = ms_today($p);
    $x['mentorName'] = (string)(db_row('SELECT fullName FROM mentors WHERE mentorId = ?', [(string)$x['mentorId']])['fullName'] ?? '');
    $kid = db_row('SELECT memberId, fullName, dob, centre, track, photoUrl FROM members WHERE memberId = ? LIMIT 1', [$id]);
    $sats = [];
    $seen = []; foreach (db_all('SELECT date FROM attendance WHERE studentId = ? AND date >= ?', [$id, ms_add_days($today, -63)]) as $r) $seen[$r['date']] = true;
    for ($d = $today; count($sats) < 8; $d = ms_add_days($d, -1)) if (gmdate('w', strtotime($d . 'T00:00:00Z')) === '6') $sats[] = ['date' => $d, 'present' => isset($seen[$d])];
    $phase = ms_phase_for((string)$x['startedAt'], $today);
    return ['ok' => true, 'mentee' => $kid, 'match' => $x + ['phaseNow' => $phase, 'week' => ms_week_of((string)$x['startedAt'], $today)],
        'goalsLocked' => $phase === 'connect',
        'profile' => db_row('SELECT * FROM mentee_profiles WHERE memberId = ?', [$id]),
        'saturdays' => $sats,
        'observations' => db_all('SELECT onDate, indicator, level, evidence, strength, growth, nextChallenge FROM mentor_observations WHERE memberId = ? ORDER BY onDate DESC, indicator LIMIT 120', [$id]),
        'goals' => $phase === 'connect' ? [] : db_all('SELECT id, goal, dueOn, status, closedOn FROM mentor_goals WHERE subjectId = ? ORDER BY id DESC LIMIT 30', [$id]),
        'meetings' => db_all('SELECT id, metOn, kind, discussed, agreed, concern FROM mentor_meetings WHERE subjectId = ? ORDER BY metOn DESC LIMIT 30', [$id]),
        'tasks' => db_all("SELECT id, kind, dueOn, status FROM mentor_tasks WHERE matchId = ? AND owner = 'mentor' AND status = 'open' ORDER BY dueOn LIMIT 10", [$x['matchId']]),
        'indicators' => MS_INDICATORS, 'levels' => MS_LEVELS];
}

/**
 * A Saturday observation. Evidence is required for any rating above "Not
 * seen": say what they did, not how good it was.
 */
function member_ms_observe(array $p): array {
    $o = ms_pod_open($p, true); if (!$o['ok']) return $o;
    $x = $o['match'];
    $ratings = (array)($p['ratings'] ?? []);
    if (!$ratings && isset($p['indicator'])) $ratings = [['indicator' => $p['indicator'], 'level' => $p['level'] ?? 0, 'evidence' => $p['evidence'] ?? '']];
    if (!$ratings) return ['ok' => false, 'error' => 'empty'];
    $clean = [];
    foreach ($ratings as $r) {
        $ind = (string)($r['indicator'] ?? '');
        $lvl = (int)($r['level'] ?? 0);
        $ev = trim((string)($r['evidence'] ?? ''));
        if (!in_array($ind, MS_INDICATORS, true)) return ['ok' => false, 'error' => 'bad_indicator', 'indicator' => $ind];
        if ($lvl < 0 || $lvl > 3) return ['ok' => false, 'error' => 'bad_level'];
        if ($lvl > 0 && $ev === '') return ['ok' => false, 'error' => 'evidence_required', 'indicator' => $ind];
        $clean[] = [$ind, $lvl, mb_substr($ev, 0, 1000)];
    }
    $date = ms_today($p);
    foreach ($clean as [$ind, $lvl, $ev]) {
        $row = ['memberId' => (string)$x['memberId'], 'mentorId' => (string)$x['mentorId'], 'matchId' => (string)$x['matchId'], 'onDate' => $date,
                'indicator' => $ind, 'level' => $lvl, 'evidence' => $ev,
                'strength' => mb_substr(trim((string)($p['strength'] ?? '')), 0, 500), 'growth' => mb_substr(trim((string)($p['growth'] ?? '')), 0, 500),
                'nextChallenge' => mb_substr(trim((string)($p['nextChallenge'] ?? '')), 0, 500), 'createdAt' => now_iso()];
        $upd = $row; unset($upd['memberId'], $upd['onDate'], $upd['indicator']);
        db_upsert('mentor_observations', $row, ['memberId', 'onDate', 'indicator'], $upd);
    }
    return ['ok' => true, 'saved' => count($clean)];
}

/** A one-to-one, logged against the pod and the shared meetings record. */
function member_ms_onetoone(array $p): array {
    $o = ms_pod_open($p, true); if (!$o['ok']) return $o;
    $x = $o['match'];
    $discussed = trim((string)($p['discussed'] ?? ''));
    if ($discussed === '') return ['ok' => false, 'error' => 'discussed_required'];
    $metOn = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['metOn'] ?? '')) ? (string)$p['metOn'] : ms_today($p);
    $meta = array_filter(['How long: ' . trim((string)($p['minutes'] ?? '')) . ' min' => trim((string)($p['minutes'] ?? '')) !== '',
                          'Where: ' . trim((string)($p['where'] ?? '')) => trim((string)($p['where'] ?? '')) !== '',
                          'How they seemed: ' . trim((string)($p['seemed'] ?? '')) => trim((string)($p['seemed'] ?? '')) !== '']);
    $now = now_iso();
    $id = db_insert('mentor_meetings', ['subjectId' => $x['memberId'], 'subjectType' => 'member', 'mentorId' => (string)$o['g']['member']['memberId'],
        'mentorName' => (string)$o['mentor']['fullName'], 'metOn' => $metOn, 'kind' => 'one-to-one',
        'discussed' => mb_substr($discussed . ($meta ? "\n" . implode(' · ', array_keys($meta)) : ''), 0, 4000),
        'agreed' => mb_substr(trim((string)($p['agreed'] ?? '')), 0, 2000), 'concern' => !empty($p['concern']) ? 1 : 0,
        'centre' => (string)$x['centre'], 'createdAt' => $now, 'updatedAt' => $now]);
    // Complete the earliest open one-to-one; keep one due a fortnight on.
    db_exec("UPDATE mentor_tasks SET status = 'done', doneAt = ?, doneBy = ? WHERE id = (SELECT id FROM mentor_tasks WHERE matchId = ? AND kind = 'one_to_one' AND status = 'open' ORDER BY dueOn LIMIT 1)",
        [$now, (string)$o['mentor']['mentorId'], $x['matchId']]);
    if (!db_row("SELECT 1 FROM mentor_tasks WHERE matchId = ? AND kind = 'one_to_one' AND status = 'open'", [$x['matchId']])) {
        db_insert('mentor_tasks', ['matchId' => $x['matchId'], 'memberId' => $x['memberId'], 'mentorId' => $x['mentorId'], 'centre' => $x['centre'],
            'kind' => 'one_to_one', 'owner' => 'mentor', 'dueOn' => ms_add_days($metOn, 14), 'status' => 'open', 'doneAt' => '', 'doneBy' => '', 'note' => '', 'createdAt' => $now]);
    }
    db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = 'one-to-one' WHERE rule = 'R2' AND matchId = ? AND status = 'open'", [$now, $x['matchId']]);
    return ['ok' => true, 'id' => $id];
}

function member_ms_task_done(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    if (!$o['clearance']['cleared']) return ['ok' => false, 'error' => 'not_cleared'];
    $t = db_row("SELECT * FROM mentor_tasks WHERE id = ? AND mentorId = ? AND owner = 'mentor' LIMIT 1", [(int)($p['id'] ?? 0), (string)$o['mentor']['mentorId']]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    db_update('mentor_tasks', ['status' => 'done', 'doneAt' => now_iso(), 'doneBy' => (string)$o['mentor']['mentorId'], 'note' => mb_substr(trim((string)($p['note'] ?? '')), 0, 1000)], ['id' => $t['id']]);
    return ['ok' => true];
}
function member_ms_nudge_done(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    $n = db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = ? WHERE id = ? AND audience = 'mentor' AND mentorId = ? AND status = 'open'",
                 [now_iso(), (string)$o['mentor']['mentorId'], (int)($p['id'] ?? 0), (string)$o['mentor']['mentorId']]);
    return $n ? ['ok' => true] : ['ok' => false, 'error' => 'not_found'];
}

/** The mentor's side of the termly relationship check. */
function member_ms_relcheck(array $p): array {
    $o = ms_pod_open($p, true); if (!$o['ok']) return $o;
    return ms_relcheck_write($o['match'], 'mentor', (array)($p['answers'] ?? []), (string)$o['mentor']['mentorId'], ms_today($p), (string)($p['note'] ?? ''));
}
/** The mentee's side, answered separately from their own account. */
function member_ms_relcheck_mentee(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $x = db_row("SELECT * FROM mentor_matches WHERE memberId = ? AND status IN ('active','paused') ORDER BY id DESC LIMIT 1", [$me]);
    if (!$x) return ['ok' => false, 'error' => 'no_match'];
    return ms_relcheck_write($x, 'mentee', (array)($p['answers'] ?? []), $me, ms_today($p));
}

/** The mentor's own check-in with their coordinator. */
function member_ms_coord_checkin(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    $m = $o['mentor'];
    $need = !empty($p['needSupport']);
    $week = iso_week_period(strtotime(ms_today($p) . 'T12:00:00Z'));
    db_insert('mentor_checkins', ['mentorId' => $m['mentorId'], 'weekOf' => $week, 'feeling' => mb_substr(trim((string)($p['feeling'] ?? '')), 0, 40),
        'wins' => mb_substr(trim((string)($p['wins'] ?? '')), 0, 2000), 'hard' => mb_substr(trim((string)($p['hard'] ?? '')), 0, 2000),
        'needSupport' => $need ? 1 : 0, 'createdAt' => now_iso(), 'followedUpAt' => '', 'followedUpBy' => '']);
    if ($need) ms_nudge('CHK:' . $m['mentorId'] . ':' . $week, 'R6', ['audience' => 'lead', 'mentorId' => (string)$m['mentorId'], 'centre' => (string)$m['centre'],
        'title' => (string)$m['fullName'] . ' asked for support', 'body' => mb_substr(trim((string)($p['hard'] ?? '')), 0, 300), 'suggestion' => 'Call them this week.']);
    return ['ok' => true, 'message' => $need ? 'Your coordinator will be asked to call you this week.' : 'Check-in logged.'];
}

/** Report a concern from the portal (always available, cleared or not). */
function member_ms_concern(array $p): array { return sg_report($p); }
/** A member's own concern about themselves, from the Member Portal's Help: same queue, same cap, subject = the reporter. */
function member_sg_self(array $p): array { unset($p['subjectId'], $p['subjectName']); return sg_report($p, true); }

/* ── Academy and policy (the mentor's own) ──────────────────────────────── */

function member_ms_academy(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    $a = ms_academy();
    $done = [];
    foreach (db_all('SELECT moduleId, score, passedAt FROM mentor_academy WHERE mentorId = ?', [$o['mentor']['mentorId']]) as $r) $done[$r['moduleId']] = $r;
    $mods = array_map(static function ($m) use ($done) {
        // The answers stay on the server; the check is graded here.
        $m['quiz'] = array_map(static fn($q) => ['q' => $q['q'], 'options' => $q['options']], $m['quiz']);
        if ($m['scenario']) $m['scenario']['options'] = array_map(static fn($o) => ['text' => $o['text']], $m['scenario']['options']);
        $m['passedAt'] = (string)($done[$m['id']]['passedAt'] ?? '');
        $m['score'] = isset($done[$m['id']]) ? (int)$done[$m['id']]['score'] : null;
        return $m;
    }, $a['modules']);
    return ['ok' => true, 'pass' => (int)$a['pass'], 'groups' => $a['groups'], 'modules' => $mods, 'clearance' => $o['clearance']];
}
/* Quiz attempts a mentor may make on one module in 24 hours, across both
 * portals. Unlimited retries made the quiz a lookup: the pod portal says which
 * answers were right, so a few dozen tries recovered the key. Three is room to
 * learn from a miss and to come back the next day having read the module. */
const MS_ACADEMY_ATTEMPTS_PER_DAY = 3;

/** null when an attempt may be made now; otherwise the refusal, with when to come back. */
function ms_academy_attempt_gate(string $mentorId, string $moduleId): ?array {
    $since = gmdate('Y-m-d\TH:i:s', time() - 86400);
    $rows = db_all('SELECT at FROM mentor_academy_attempts WHERE mentorId = ? AND moduleId = ? AND at >= ? ORDER BY at', [$mentorId, $moduleId, $since]);
    if (count($rows) < MS_ACADEMY_ATTEMPTS_PER_DAY) return null;
    $retry = gmdate('c', strtotime((string)$rows[0]['at']) + 86400);
    return ['ok' => false, 'error' => 'retry_later', 'max' => MS_ACADEMY_ATTEMPTS_PER_DAY, 'retryAt' => $retry];
}
function ms_academy_attempt_log(string $mentorId, string $moduleId, int $score, bool $pass): void {
    db_insert('mentor_academy_attempts', ['mentorId' => $mentorId, 'moduleId' => $moduleId, 'score' => $score, 'passed' => $pass ? 1 : 0, 'at' => gmdate('Y-m-d\TH:i:s')]);
}

function member_ms_academy_check(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    $mod = null; foreach (ms_academy()['modules'] as $m) if ($m['id'] === (string)($p['moduleId'] ?? '')) $mod = $m;
    if (!$mod) return ['ok' => false, 'error' => 'not_found'];
    $ans = array_values((array)($p['answers'] ?? []));
    if (count($ans) !== count($mod['quiz'])) return ['ok' => false, 'error' => 'answer_all'];
    if ($stop = ms_academy_attempt_gate((string)$o['mentor']['mentorId'], (string)$mod['id'])) return $stop;
    $right = 0; $feedback = [];
    foreach ($mod['quiz'] as $i => $q) {
        $ok = (int)$ans[$i] === (int)$q['answer'];
        if ($ok) $right++;
        $feedback[] = ['ok' => $ok, 'why' => $q['why']];
    }
    $score = (int)round(100 * $right / max(1, count($mod['quiz'])));
    $pass = $score >= (int)ms_academy()['pass'];
    ms_academy_attempt_log((string)$o['mentor']['mentorId'], (string)$mod['id'], $score, $pass);
    if ($pass) {
        db_upsert('mentor_academy', ['mentorId' => $o['mentor']['mentorId'], 'moduleId' => $mod['id'], 'score' => $score, 'passedAt' => now_iso()],
            ['mentorId', 'moduleId'], ['score' => $score, 'passedAt' => now_iso()]);
    }
    $c = ms_clearance(db_row('SELECT * FROM mentors WHERE mentorId = ?', [$o['mentor']['mentorId']]));
    return ['ok' => true, 'score' => $score, 'passed' => $pass, 'feedback' => $feedback, 'clearance' => $c];
}
function member_ms_policy(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    $acc = db_row('SELECT signedName, acceptedAt FROM mentor_policy WHERE mentorId = ? AND policyVersion = ?', [$o['mentor']['mentorId'], MS_POLICY_VERSION]);
    return ['ok' => true, 'policy' => mentorship_policy(), 'accepted' => $acc,
            'commitments' => ms_commitments($o['mentor'], substr(ms_today($p), 0, 7))];
}
function member_ms_policy_accept(array $p): array {
    $o = ms_portal_gate_own($p); if (!$o['ok']) return $o;
    $name = trim((string)($p['signedName'] ?? ''));
    if (mb_strlen($name) < 3) return ['ok' => false, 'error' => 'sign_with_your_name'];
    if ((string)($p['version'] ?? '') !== MS_POLICY_VERSION) return ['ok' => false, 'error' => 'policy_changed', 'version' => MS_POLICY_VERSION];
    db_upsert('mentor_policy', ['mentorId' => $o['mentor']['mentorId'], 'policyVersion' => MS_POLICY_VERSION, 'signedName' => mb_substr($name, 0, 120),
        'acceptedAt' => now_iso(), 'ip' => (string)($p['ip'] ?? '')], ['mentorId', 'policyVersion'], ['signedName' => mb_substr($name, 0, 120)]);
    audit('mentorship.policy.accept', (string)$o['g']['member']['memberId'], (string)$o['mentor']['mentorId'], ['version' => MS_POLICY_VERSION], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'clearance' => ms_clearance($o['mentor'])];
}
