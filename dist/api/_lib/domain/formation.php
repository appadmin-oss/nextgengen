<?php
declare(strict_types=1);

/**
 * The formation doctrine, server side.
 *
 * This is the PHP mirror of `formation.jsx` — the NGGC 2040 Human Capital
 * Formation brief transcribed into data. The client has its copy because the
 * About page, the mentor portal and a member's dashboard all render from it;
 * this one exists because a closed set that is only enforced in the browser is
 * not enforced at all, and because the same four divisions have to be
 * countable in a report.
 *
 * TWO COPIES, ONE DOCTRINE. That is a real cost and it is deliberate: the
 * alternative is the server fetching its own constants over HTTP, or the SPA
 * unable to render a division's mandate without a round trip. The pair is
 * pinned by `tests/formation-parity.test.js`, which reads both files and fails
 * when they disagree — so the cost is paid once, by a test, rather than by a
 * coordinator discovering in March that the roster importer accepts a division
 * the About page has never heard of.
 *
 * Nothing here reads the database and nothing here writes. It is the brief.
 */

/* ── §5 · The four professional divisions ─────────────────────────────────
 *
 * Fixed, unlike the academy catalogue in registration.php, which is Summer
 * School's faculty→courses map and is admin-editable by design. These are not
 * the same thing and must not be merged: a faculty is what a Summer edition
 * happens to teach this season, a division is what an NGG member belongs to
 * for years, and each division carries a mandate the programme committed to.
 *
 * Chess appears in all four course lists because §6 makes it compulsory across
 * all four — that is the point of it, not a duplication to clean up.
 */
function nggc_divisions(): array {
    return [
        ['id' => 'arts', 'code' => '01', 'name' => 'Creative & Performing Arts',
         'mandate' => 'Develop and monetize artistic, cultural and performance abilities.',
         'courses' => ['Acting & Stagecraft', 'Vocal Training & Oral Tradition', 'Music Theory',
                       'Musical Instruments', 'Music Production', 'Sound Engineering',
                       'Adire Textile Design', 'Craft Making', 'Product Design', 'Chess']],
        ['id' => 'media', 'code' => '02', 'name' => 'Media & Content Strategy',
         'mandate' => 'Develop the ability to communicate ideas, build audiences and position brands.',
         'courses' => ['Video Production', 'Cinematography', 'Motion Graphics', 'Graphic Design',
                       'Brand Identity', 'Digital Content Strategy', 'Editorial',
                       'Social Media Marketing', 'Channel Growth', 'Chess']],
        ['id' => 'tech', 'code' => '03', 'name' => 'Technology & Applied Engineering',
         'mandate' => 'Develop builders capable of creating technological solutions.',
         'courses' => ['Artificial Intelligence', 'Machine Learning', 'Coding', 'Software Development',
                       'Robotics', 'Automation', 'Product Design', 'Cybersecurity',
                       'Systems Architecture', 'Chess']],
        ['id' => 'business', 'code' => '04', 'name' => 'Business Strategy, Operations & Administration',
         'mandate' => 'Develop young people capable of organizing people, resources, systems and ideas into executable outcomes.',
         'courses' => ['Project Management', 'Product Management', 'Data Analysis', 'Business Intelligence',
                       'Digital Strategy', 'Business Development', 'HR', 'Finance', 'Operations',
                       'Compliance', 'Chess']],
    ];
}

/** The four ids, for a closed-set check. */
function nggc_division_ids(): array {
    return array_map(static fn($d) => $d['id'], nggc_divisions());
}

/**
 * Resolve an id or a full name to a division, or null.
 *
 * Accepts the name as well as the id because the roster workbook is filled in
 * by people, and "Media & Content Strategy" typed into a spreadsheet column is
 * the answer they meant. Anything else returns null and the caller decides —
 * the importer leaves the cell blank rather than guessing, per the same rule
 * migration 109's level backfill follows.
 */
function nggc_division(?string $id): ?array {
    $key = mb_strtolower(trim((string)$id));
    if ($key === '') return null;
    foreach (nggc_divisions() as $d) {
        if ($d['id'] === $key || mb_strtolower($d['name']) === $key) return $d;
    }
    return null;
}

/**
 * The backfill: a member's existing `track` mapped onto a division where it is
 * unambiguous.
 *
 * `track` is free text that predates the divisions — "Music", "Tech",
 * "Robotics", "Public Speaking" — and most of it lands somewhere obvious. What
 * does not is left blank, on purpose: a member sitting in no division is a
 * question for a centre lead, and a member sitting in the WRONG division is a
 * wrong answer nobody will think to check. Leadership, Community Intelligence
 * and Entrepreneurship are the deliberate omissions — the first two are not
 * any one division's, and entrepreneurship reads as Business but is taught in
 * all four.
 */
function nggc_division_for_track(?string $track): string {
    $t = mb_strtolower(trim((string)$track));
    if ($t === '') return '';
    static $map = [
        'music' => 'arts', 'arts' => 'arts', 'art' => 'arts', 'creative' => 'arts',
        'drama' => 'arts', 'dance' => 'arts', 'fashion' => 'arts', 'craft' => 'arts',
        'media' => 'media', 'film' => 'media', 'photography' => 'media', 'design' => 'media',
        'graphics' => 'media', 'content' => 'media',
        'tech' => 'tech', 'technology' => 'tech', 'coding' => 'tech', 'code' => 'tech',
        'robotics' => 'tech', 'ai' => 'tech', 'engineering' => 'tech', 'builder' => 'tech',
        'business' => 'business', 'admin' => 'business', 'operations' => 'business',
        'finance' => 'business', 'strategy' => 'business',
    ];
    if (isset($map[$t])) return $map[$t];
    // A direct hit on an id or a full division name, for rosters already using them.
    $d = nggc_division($t);
    return $d ? $d['id'] : '';
}

/* ── §14 · The Courage Index ladder and its ten observations ──────────────
 *
 * Moved here from domain/mentoring.php, which is where they were first
 * written and the wrong home for them: mentoring.php is the child's record
 * over time, and these are the brief. Nothing else changed — the callers are
 * unchanged and the values are identical.
 */

/** The five rungs. Mirrors NGGC_COURAGE_LADDER in formation.jsx. */
function courage_ladder(): array {
    return [
        ['score' => 1, 'label' => 'Avoids responsibility'],
        ['score' => 2, 'label' => 'Acts only when instructed'],
        ['score' => 3, 'label' => 'Attempts difficult things'],
        ['score' => 4, 'label' => 'Takes responsibility voluntarily'],
        ['score' => 5, 'label' => 'Acts courageously for the good of others'],
    ];
}

/** The ten observations from the brief, in its order. A closed set, so the
 *  column stays countable across a cohort. */
function courage_prompts(): array {
    return [
        'Did they speak the truth when lying would have been easier?',
        'Did they apologize when wrong?',
        'Did they attempt something difficult?',
        'Did they defend someone being treated unfairly?',
        'Did they ask questions when confused?',
        'Did they accept correction?',
        'Did they admit failure?',
        'Did they volunteer for responsibility?',
        'Did they challenge an idea respectfully?',
        'Did they continue after failure?',
    ];
}

/* ── §18 · The mentor's weekly review ─────────────────────────────────────
 *
 * Twelve questions a mentor should be able to answer for every assigned
 * member, every week. `key` is what a stored answer is filed under and is
 * never reordered or reused — a renumbered key silently re-labels every
 * answer already written against it.
 */
function nggc_weekly_review(): array {
    return [
        ['key' => 'learned',       'n' => 1,  'q' => 'What did this child learn this week?'],
        ['key' => 'produced',      'n' => 2,  'q' => 'What did this child produce?'],
        ['key' => 'responsibility','n' => 3,  'q' => 'What responsibility did this child carry?'],
        ['key' => 'struggled',     'n' => 4,  'q' => 'What did this child struggle with?'],
        ['key' => 'fear',          'n' => 5,  'q' => 'What fear did this child confront?'],
        ['key' => 'journal',       'n' => 6,  'q' => 'What does the Anchor Journal reveal?'],
        ['key' => 'timetable',     'n' => 7,  'q' => "Is the child's timetable being respected?"],
        ['key' => 'community',     'n' => 8,  'q' => 'Is the child participating in community?'],
        ['key' => 'chess',         'n' => 9,  'q' => 'What is happening with chess development?'],
        ['key' => 'dues',          'n' => 10, 'q' => 'Are dues, fines and accountability obligations up to date?'],
        ['key' => 'leadership',    'n' => 11, 'q' => 'What leadership behaviour did I observe?'],
        ['key' => 'challenge',     'n' => 12, 'q' => 'What should I challenge this child about next week?'],
    ];
}

/** The twelve keys, for validating a submitted answer set. */
function nggc_weekly_review_keys(): array {
    return array_map(static fn($q) => $q['key'], nggc_weekly_review());
}

/* ── Reporting ─────────────────────────────────────────────────────────────
 *
 * The question the brief implies and the programme could not answer: how many
 * members are in each division, and how many are in none.
 */

/**
 * Members per division, for the four in the brief's order, plus the unplaced.
 *
 * `unplaced` is returned as a first-class number rather than left as the
 * difference between a total and four counts. A division roll-up that quietly
 * omits the children nobody has assigned reads as a complete picture of the
 * programme, and it is the omission that most needs somebody to look at it.
 *
 * Centre-scoped like every other staff read: a lead sees their own centres.
 */
function admin_divisions_overview(array $p): array {
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) return $g;

    $centres = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g) : null;
    $where = "type = 'NGG' AND status = 'active'";
    $args = [];
    if (is_array($centres)) {
        if (!$centres) return ['ok' => true, 'divisions' => [], 'unplaced' => 0, 'total' => 0];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')';
        foreach ($centres as $c) $args[] = $c;
    }

    // One grouped query, not one per division — a per-row query inside a list
    // is the N+1 CLAUDE.md §6 names, and four is where five becomes forty.
    $counts = [];
    foreach (db_all("SELECT division, COUNT(*) c FROM members WHERE $where GROUP BY division", $args) as $r) {
        $counts[(string)($r['division'] ?? '')] = (int)$r['c'];
    }

    $out = [];
    $placed = 0;
    foreach (nggc_divisions() as $d) {
        $n = (int)($counts[$d['id']] ?? 0);
        $placed += $n;
        $out[] = ['id' => $d['id'], 'code' => $d['code'], 'name' => $d['name'],
                  'mandate' => $d['mandate'], 'courses' => count($d['courses']), 'members' => $n];
    }
    $total = array_sum($counts);
    /* Anything not one of the four counts as unplaced, including a value that
       predates the closed set. It cannot go negative and it cannot hide. */
    return ['ok' => true, 'divisions' => $out, 'unplaced' => max(0, $total - $placed), 'total' => $total];
}

/* ── §20 · Progression is evidence of formation, never time served ─────────
 *
 * "A member should not become an NGV merely because they have been around for
 * a certain amount of time."
 *
 * So the promotion screen needs the formation record in front of it. This
 * gathers what the programme already knows about a member — and gathers it
 * from the tables that hold it rather than inventing a score, because a single
 * "readiness: 73%" would be exactly the kind of number that replaces the
 * judgement the brief is asking somebody to make.
 *
 * Tenure IS included, and is labelled as not being evidence. Leaving it out
 * would be dishonest (it is the first thing anybody looks at) and including it
 * unlabelled would be worse. Naming it is the point of §20.
 */
function member_formation_readiness(string $memberId): array {
    $m = db_row('SELECT memberId, fullName, joinDate, centre, division, type FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];

    // Courage (§14) — the index as the mentoring record computes it.
    $courage = function_exists('courage_index') ? courage_index($memberId, 1) : null;

    /* The weekly review (§18) — how many of the last eight weeks anybody
       looked at all. A member nobody has reviewed is not a member anybody can
       vouch for, whatever their attendance says. */
    $weeks = [];
    for ($i = 0; $i < 8; $i++) $weeks[] = iso_week_period(time() - $i * 7 * 86400);
    $in = '(' . implode(',', array_fill(0, count($weeks), '?')) . ')';
    $reviewed = (int)(db_row("SELECT COUNT(*) c FROM mentor_reviews WHERE subjectId = ? AND period IN $in",
                             array_merge([$memberId], $weeks))['c'] ?? 0);
    $concerns = (int)(db_row("SELECT COUNT(*) c FROM mentor_reviews WHERE subjectId = ? AND concern = 1 AND period IN $in",
                             array_merge([$memberId], $weeks))['c'] ?? 0);

    // Discipline and community, from the ledgers that already hold them.
    $since = gmdate('Y-m-d', time() - 90 * 86400);
    $attendTotal = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$memberId])['c'] ?? 0);
    $attend90 = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ? AND date >= ?', [$memberId, $since])['c'] ?? 0);
    $stars = (int)(db_row('SELECT COALESCE(SUM(stars), 0) s FROM member_stars WHERE subjectId = ?', [$memberId])['s'] ?? 0);

    /* Money (§13). Reported as a standing rather than a figure: whether a
       family owes is relevant to readiness, how much they owe is their
       business and does not belong on a promotion screen. */
    $payable = null;
    if (function_exists('fees_balance')) {
        try {
            $full = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
            $b = $full ? fees_balance($full) : null;
            $payable = $b ? (int)($b['payable'] ?? 0) : null;
        } catch (Throwable $e) { $payable = null; }
    }

    /* Tenure, named for what it is not. §20's whole argument is that this
       number is the one that must NOT carry the decision. */
    $months = null;
    $joined = substr((string)($m['joinDate'] ?? ''), 0, 10);
    if ($joined !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $joined)) {
        $months = max(0, (int)floor((time() - strtotime($joined . ' 00:00:00 UTC')) / (30.44 * 86400)));
    }

    return [
        'ok' => true,
        'memberId' => (string)$m['memberId'],
        'fullName' => (string)$m['fullName'],
        'division' => (string)($m['division'] ?? ''),
        'courage' => $courage ? [
            'current' => $courage['current'], 'rung' => $courage['rung'],
            'marks' => (int)$courage['total'], 'inWindow' => (int)$courage['inWindow'],
        ] : null,
        'review' => ['weeksReviewed' => $reviewed, 'ofWeeks' => 8, 'concerns' => $concerns],
        'attendance' => ['total' => $attendTotal, 'last90' => $attend90],
        'stars' => $stars,
        'dues' => $payable === null ? null : ['owes' => $payable > 0],
        'tenure' => ['months' => $months,
                     'note' => 'Time served is not evidence of formation (§20).'],
    ];
}

/** The readiness view as an op, so a promotion screen can show the formation
 *  record before the decision rather than after it. */
function admin_member_readiness(array $p): array {
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) return $g;
    /* Scoped like every other per-member read: readiness is built from a
       child's attendance, journal and record. */
    $sg = admin_member_scope_gate($g['requester'], trim((string)($p['memberId'] ?? '')));
    if (!$sg['ok']) return $sg;
    $r = member_formation_readiness(trim((string)($p['memberId'] ?? '')));
    if (empty($r['ok'])) return $r;
    return ['ok' => true, 'readiness' => $r];
}

/** A member's promotion history — every transition, with the reason given and
 *  what was known at the time. Append-only, so this is the record §20 asks
 *  the programme to be able to produce. */
function admin_member_promotions(array $p): array {
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    /* The evidence a promotion was made on is about the child; scoped. */
    $sg = admin_member_scope_gate($g['requester'], $id);
    if (!$sg['ok']) return $sg;
    $out = [];
    foreach (db_all("SELECT * FROM member_promotions WHERE memberId = ? ORDER BY id DESC LIMIT 50", [$id]) as $r) {
        $out[] = [
            'id' => (int)$r['id'],
            'fromStage' => (string)$r['fromStage'], 'toStage' => (string)$r['toStage'],
            'evidence' => (string)$r['evidence'],
            'readiness' => json_decode((string)($r['readiness'] ?? ''), true) ?: null,
            'volunteerId' => (string)($r['volunteerId'] ?? ''),
            'byName' => (string)($r['byName'] ?? ''), 'at' => (string)($r['at'] ?? ''),
        ];
    }
    return ['ok' => true, 'promotions' => $out];
}
