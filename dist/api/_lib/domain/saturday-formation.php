<?php
declare(strict_types=1);
/**
 * The Saturday Formation Schedule: "Think. Create. Lead. Serve."
 *
 * ONE TIMETABLE, FIVE READERS. Every portal reads the same blocks: what a
 * member does in a block, what a mentor watches for, what an instructor
 * delivers, what an admin has to have ready, and what a parent is told. Who
 * reads which part is decided here (sf_for), never by a screen holding its
 * own copy.
 *
 * VERSIONS OF THE DAY (saturday_formation_blocks.scope). Which day applies to
 * a Saturday at a centre is the first that exists of:
 *   date:YYYY-MM-DD@<centreId>   that Saturday, at that centre
 *   date:YYYY-MM-DD              that Saturday, everywhere
 *   centre:<centreId>            that centre's own day
 *   ''                           the main day (seeded from the programme's schedule)
 * A Saturday can also be OFF (saturday_formation_dates), everywhere or at one
 * centre, with a note: nothing is sent and every portal says so. Centres are
 * named by id, so a rename in CACENTRE leaves their day where it was.
 *
 * THE TIMES ARE THE DAY'S. A block may not overlap another; changing a time
 * can move the blocks after it with it (ripple); the whole day can be moved
 * at once. The day's hours, the family messages (the plan before it starts,
 * the not-arrived notice 45 minutes in, the close at its end) and the
 * reminders all follow the version in force at that centre that Saturday —
 * nothing is pinned to 8:00 or 2:00 any more. What a block is FOR is its
 * `kind` (check-in, mentor breakout, classes, break, close), so a reminder
 * follows the block, not a key or a clock time.
 *
 * THE DAY, AS IT HAPPENS (sf_tick, from the web-cron in mpa_tick). On a
 * Lagos Saturday each block's start sends, once (saturday_formation_sends is
 * the ledger, unique per day, block, person and channel): members checked in
 * today, their centre's block; mentors, its mentor focus; instructors with a
 * Saturday class, the classes block. Guardians are told by email only, inside
 * 8am–8pm Lagos, and a guardian who switched check-in news off hears nothing.
 * A tick serves at most SF_TICK_MAX recipients; the rest are served next tick.
 */

const SF_TICK_MAX = 400;
const SF_WINDOW_MIN = 25;          // a block's send stays open this long after it starts
const SF_AUDIENCES = ['member', 'mentor', 'instructor', 'admin', 'parent'];
/** What a block is for. Reminders and the family close read this, never a key. */
const SF_KINDS = ['' => 'General', 'checkin' => 'Check-in', 'mentor' => 'Mentor breakout', 'classes' => 'Division classes', 'break' => 'Break', 'close' => 'Close'];
const SF_BLOCKS_MAX = 24;
const SF_SHIFT_MAX = 300;          // minutes a whole day may be moved in one go
const SF_THEME = 'Think. Create. Lead. Serve.';
const SF_LOGIC = 'Accountability → Reflection → Inspiration → Identity → Exposure → Competence → Strategy → Service';

/** The seed: the programme's own schedule, block by block. */
function sf_blocks_seed(): array {
    return [
        ['key' => 'checkin', 'start' => '09:00', 'end' => '09:30', 'title' => 'Assignment submission & check-in', 'flow' => 'Accountability', 'purpose' => 'Accountability and preparation.',
         'member' => ['Submit weekly assignments.', 'Present completed work where required.', 'Receive attendance/check-in confirmation.', 'Resolve outstanding submissions.', 'Prepare for the day’s activities.'],
         'mentor' => ['Check punctuality, assignment completion and general preparedness.'],
         'instructor' => ['Have last week’s assignments ready to receive and mark.'],
         'admin' => ['Gate open with the check-in desk staffed by 8:50.', 'Outstanding submissions list ready for mentors.'],
         'parent' => 'Your child checks in and hands in this week’s assignment. You’re told when they arrive.', 'quote' => ''],
        ['key' => 'musing', 'start' => '09:30', 'end' => '11:00', 'title' => 'Musing & mentor breakout', 'flow' => 'Reflection', 'purpose' => 'Personal formation and reflection.',
         'member' => ['Review of the previous week', 'Anchor Journal', 'Personal timetable', 'Goals and commitments', 'Challenges and failures', 'Courage and difficult decisions', 'Community participation', 'Dues/fines and personal accountability', 'Chess development', 'Leadership behaviour', 'Questions, ideas and discoveries'],
         'mentor' => ['Take the register and note who is here.', 'Do not merely ask whether tasks were done: examine character, responsibility, courage and growth.', 'One-to-ones with the mentees who are due.', 'Record observations and the weekly review before Monday.'],
         'instructor' => [], 'admin' => ['Every mentor group has a mentor present; cover any gap from the lead.'],
         'parent' => 'Your child is with their mentor group, reviewing the week: their journal, goals, commitments and what they found hard.',
         'quote' => 'Who are you becoming, and what evidence do we have?'],
        ['key' => 'vanboja', 'start' => '11:00', 'end' => '11:25', 'title' => 'Time out with Van BOJA', 'flow' => 'Leadership exposure', 'purpose' => 'Exposure, inspiration and direct leadership interaction.',
         'member' => ['Life', 'Leadership', 'Africa', 'Character', 'Creativity', 'Technology', 'Current affairs', 'Philosophy', 'Personal development', 'Bring one question of your own.'],
         'mentor' => ['Sit with your group; note who asks a question.'], 'instructor' => [], 'admin' => ['Hall set, sound checked, questions from members gathered.'],
         'parent' => 'A session with Van BOJA on life, leadership, Africa and ideas, with questions from the members.', 'quote' => ''],
        ['key' => 'anthem', 'start' => '11:25', 'end' => '11:30', 'title' => 'NGG Anthem', 'flow' => 'Identity', 'purpose' => 'Identity, unity and collective commitment.',
         'member' => ['Come together to affirm the identity and values of NGG.'], 'mentor' => ['Model the anthem and the pledge.'], 'instructor' => [], 'admin' => [],
         'parent' => 'Everyone together for the NGG Anthem.', 'quote' => 'Cannot be bought. Cannot be bent. Cannot be broken.'],
        ['key' => 'special', 'start' => '11:30', 'end' => '12:00', 'title' => 'Special class / content creation / general lecture', 'flow' => 'General exposure', 'purpose' => 'Exposure beyond the member’s regular division.',
         'member' => ['General lectures', 'Guest speakers', 'Special masterclasses', 'Content creation', 'Current affairs', 'Leadership lessons', 'Entrepreneurship', 'African history and culture', 'Technology exposure', 'Creative demonstrations', 'Inter-division projects'],
         'mentor' => ['Note what caught each mentee’s interest; bring it to the next one-to-one.'], 'instructor' => ['If you are this week’s speaker: 30 minutes, beyond your division, with something to do.'],
         'admin' => ['Speaker or masterclass confirmed by Thursday.'], 'parent' => 'A special class beyond their division: a guest, a masterclass or a project.', 'quote' => ''],
        ['key' => 'division', 'start' => '12:00', 'end' => '13:30', 'title' => 'Division classes', 'flow' => 'Competence', 'purpose' => 'Deep competence development.',
         'member' => ['Division 1 · Creative & Performing Arts', 'Division 2 · Media & Content Strategy', 'Division 3 · Technology & Applied Engineering', 'Division 4 · Business Strategy, Operations & Administration', 'Build your portfolio: what you can do, create, solve or lead.'],
         'mentor' => [], 'instructor' => ['Practical and project-driven, not merely theoretical.', 'Take the class register.', 'Every member leaves with something added to their portfolio.'],
         'admin' => ['Every division has its instructor and room.'], 'parent' => 'Your child is in their division class, building their portfolio by making things.', 'quote' => ''],
        ['key' => 'break', 'start' => '13:30', 'end' => '14:00', 'title' => 'Break', 'flow' => 'Rest & community', 'purpose' => 'Rest, refreshment and informal community.',
         'member' => ['Interact positively, build relationships and practise responsible communal behaviour.'], 'mentor' => ['Remain observant without turning the break into another classroom.'],
         'instructor' => [], 'admin' => ['Refreshments and the space supervised.'], 'parent' => 'Break: rest, food and time with friends.', 'quote' => ''],
        ['key' => 'chess', 'start' => '14:00', 'end' => '14:45', 'title' => 'Chess & strategic thinking', 'flow' => 'Strategy', 'purpose' => 'Develop the strategic mind. Chess is compulsory for every NGG member.',
         'member' => ['Concentration', 'Patience', 'Planning', 'Pattern recognition', 'Decision-making', 'Consequence awareness', 'Strategic thinking', 'Sacrifice', 'Resilience', 'Problem-solving', 'Explain why you made your moves.'],
         'mentor' => ['Connect chess behaviour to real-life leadership.', 'How do you make decisions when you cannot see the whole board?', 'Can you sacrifice something small for something greater?', 'What do you do after making a bad move?', 'Can you think three moves ahead?'],
         'instructor' => ['Chess instructors: ask every player to explain one move.'], 'admin' => ['Boards and clocks out.'], 'parent' => 'Chess, compulsory for every member: planning, patience and explaining their moves.', 'quote' => 'Can you think three moves ahead?'],
        ['key' => 'close', 'start' => '14:45', 'end' => '15:00', 'title' => 'Cleaning & close', 'flow' => 'Service', 'purpose' => 'Responsibility and service. Cleaning is not punishment; it is leadership training.',
         'member' => ['Restore the space you used.', 'Area inspection', 'Mentor check-out', 'Outstanding announcements', 'Next-week reminders', 'Personal responsibility confirmation'],
         'mentor' => ['Inspect your group’s area and check every mentee out.', 'Give next week’s reminders.'], 'instructor' => ['Room restored and equipment returned.'],
         'admin' => ['Announcements out; the site is closed by 3:15.'], 'parent' => 'The day closes with cleaning and check-out. You’ll get a short summary of their Saturday.',
         'quote' => 'If you use the space, you are responsible for the space.'],
    ];
}

/** The kind each seeded block has. */
function sf_seed_kind(string $key): string {
    return ['checkin' => 'checkin', 'musing' => 'mentor', 'division' => 'classes', 'break' => 'break', 'close' => 'close'][$key] ?? '';
}
/** The main day, from the programme's schedule, on first read. */
function sf_seed(): void {
    if (db_row("SELECT id FROM saturday_formation_blocks WHERE scope = '' LIMIT 1")) return;
    $now = now_iso();
    foreach (sf_blocks_seed() as $i => $b) {
        db_insert('saturday_formation_blocks', ['scope' => '', 'blockKey' => $b['key'], 'sort' => $i * 10, 'startTime' => $b['start'], 'endTime' => $b['end'], 'title' => $b['title'],
            'flow' => $b['flow'], 'purpose' => $b['purpose'], 'quote' => $b['quote'], 'kind' => sf_seed_kind($b['key']),
            'forJson' => json_encode(array_intersect_key($b, array_flip(SF_AUDIENCES)), JSON_UNESCAPED_UNICODE), 'updatedAt' => $now, 'updatedBy' => 'seed']);
    }
}

/* ── Times ──────────────────────────────────────────────────────────────── */

function sf_minutes(string $hhmm): int { [$h, $m] = array_map('intval', explode(':', $hhmm . ':0')); return $h * 60 + $m; }
function sf_hhmm(int $min): string { return sprintf('%02d:%02d', intdiv($min, 60), $min % 60); }
function sf_clock(string $hhmm): string { $m = sf_minutes($hhmm); $h = intdiv($m, 60); return (($h + 11) % 12 + 1) . ':' . sprintf('%02d', $m % 60) . ($h < 12 ? 'am' : 'pm'); }

/**
 * The main day's bounds: its first block's start and its last block's end.
 * Readers outside the formation (family statements, the mentor portal's
 * punctuality) ask this rather than typing a time.
 */
function sf_day_bounds(?array $blocks = null): array {
    $blocks = $blocks ?? sf_blocks();
    $a = $blocks ? sf_minutes((string)$blocks[0]['start']) : 9 * 60; $z = $blocks ? sf_minutes((string)end($blocks)['end']) : 15 * 60;
    return ['start' => $a, 'end' => $z, 'startHm' => sf_hhmm($a), 'endHm' => sf_hhmm($z)];
}
function sf_time_ok(string $t): bool { return (bool)preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t); }

/**
 * What is wrong, or worth knowing, about a day's times, in words: an overlap
 * or a block ending before it starts is an error (a save that would cause one
 * is refused); a gap is said so it is a choice, not an accident.
 */
function sf_check(array $blocks): array {
    $out = [];
    $prev = null;
    foreach ($blocks as $b) {
        $s = sf_minutes($b['start']); $e = sf_minutes($b['end']);
        if ($e <= $s) $out[] = ['level' => 'error', 'key' => $b['key'], 'text' => $b['title'] . ' ends before it starts.'];
        if ($prev) {
            $pe = sf_minutes($prev['end']);
            if ($s < $pe) $out[] = ['level' => 'error', 'key' => $b['key'], 'text' => $b['title'] . ' starts at ' . sf_clock($b['start']) . ', before ' . $prev['title'] . ' ends at ' . sf_clock($prev['end']) . '.'];
            elseif ($s > $pe) $out[] = ['level' => 'info', 'key' => $b['key'], 'text' => ($s - $pe) . ' minutes free between ' . $prev['title'] . ' and ' . $b['title'] . '.'];
        }
        $prev = $b;
    }
    return $out;
}

/* ── Versions of the day ────────────────────────────────────────────────── */

/** The active centres, id => name. */
function sf_centres(): array {
    $out = [];
    foreach (db_all("SELECT centreId, name FROM centres WHERE COALESCE(status, 'active') = 'active' ORDER BY name") as $r) $out[(string)$r['centreId']] = (string)$r['name'];
    return $out;
}
/** A centre's id from its id or its name; '' when it is not a centre. */
function sf_centre_id(string $c): string {
    $c = trim($c); if ($c === '') return '';
    $r = db_row('SELECT centreId FROM centres WHERE centreId = ? OR LOWER(name) = LOWER(?) LIMIT 1', [$c, $c]);
    return $r ? (string)$r['centreId'] : '';
}
function sf_is_saturday(string $d): bool { return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && (int)gmdate('w', (int)strtotime($d . 'T12:00:00Z')) === 6; }
/** Today if it is a Saturday in Lagos, else the next one. */
function sf_next_saturday(?int $now = null): string {
    $t = ($now ?? time()) + 3600; $w = (int)gmdate('w', $t);
    return gmdate('Y-m-d', $t + ((6 - $w + 7) % 7) * 86400);
}

/**
 * A version's scope, made safe, or null: '' | centre:<id> | date:<Saturday> |
 * date:<Saturday>@<id>. Dates must be Saturdays; centres must exist.
 */
function sf_scope_norm(string $scope): ?string {
    $scope = trim($scope);
    if ($scope === '') return '';
    if (preg_match('/^centre:(.+)$/', $scope, $m)) { $id = sf_centre_id($m[1]); return $id !== '' ? 'centre:' . $id : null; }
    if (preg_match('/^date:(\d{4}-\d{2}-\d{2})(?:@(.+))?$/', $scope, $m)) {
        if (!sf_is_saturday($m[1])) return null;
        if (!isset($m[2])) return 'date:' . $m[1];
        $id = sf_centre_id($m[2]); return $id !== '' ? 'date:' . $m[1] . '@' . $id : null;
    }
    return null;
}
/** [date, centreId] a scope is about ('' when not). */
function sf_scope_parts(string $scope): array {
    if (preg_match('/^date:(\d{4}-\d{2}-\d{2})(?:@(.+))?$/', $scope, $m)) return [$m[1], $m[2] ?? ''];
    if (str_starts_with($scope, 'centre:')) return ['', substr($scope, 7)];
    return ['', ''];
}
/** A scope in words: "Every Saturday", "Egbeda's own day", "Sat 7 Nov 2026 at Egbeda". */
function sf_scope_label(string $scope, ?array $centres = null): string {
    $centres = $centres ?? sf_centres();
    [$d, $c] = sf_scope_parts($scope);
    $cn = $c !== '' ? ($centres[$c] ?? $c) : '';
    if ($d !== '') return 'Saturday ' . gmdate('j M Y', (int)strtotime($d . 'T12:00:00Z')) . ($cn !== '' ? ' at ' . $cn : ', every centre');
    if ($cn !== '') return $cn . '’s own day';
    return 'Every Saturday';
}
/** The version a new one is copied from: what was in force there before it. */
function sf_scope_base(string $scope): string {
    [$d, $c] = sf_scope_parts($scope);
    if ($d !== '' && $c !== '') { foreach (['date:' . $d, 'centre:' . $c] as $s) if (sf_scope_exists($s)) return $s; return ''; }
    return '';
}
function sf_scope_exists(string $scope): bool {
    return (bool)db_row('SELECT id FROM saturday_formation_blocks WHERE scope = ? LIMIT 1', [$scope]);
}

function sf_row_view(array $r): array {
    return ['key' => (string)$r['blockKey'], 'start' => (string)$r['startTime'], 'end' => (string)$r['endTime'], 'title' => (string)$r['title'], 'flow' => (string)$r['flow'],
            'purpose' => (string)$r['purpose'], 'quote' => (string)$r['quote'], 'kind' => (string)($r['kind'] ?? ''), 'for' => json_decode((string)$r['forJson'], true) ?: []];
}
/** One version's blocks, in order (the main day seeded on first read). */
function sf_blocks(string $scope = ''): array {
    sf_seed();
    return array_map('sf_row_view', db_all('SELECT * FROM saturday_formation_blocks WHERE scope = ? ORDER BY sort, startTime, id', [$scope]));
}
/** Is that Saturday off at that centre? [off, note]. */
function sf_off(string $date, string $centreId): array {
    foreach (array_unique([$centreId, '']) as $c) {
        $r = db_row('SELECT off, note FROM saturday_formation_dates WHERE onDate = ? AND centreId = ?', [$date, $c]);
        if ($r && (int)$r['off'] === 1) return [true, (string)$r['note']];
    }
    $n = db_row("SELECT note FROM saturday_formation_dates WHERE onDate = ? AND centreId IN (?, '') AND note <> '' ORDER BY centreId DESC LIMIT 1", [$date, $centreId]);
    return [false, (string)($n['note'] ?? '')];
}
/**
 * The day in force on a Saturday at a centre: which version, its blocks, its
 * hours, and whether it is off. The one resolver every reader uses.
 */
function sf_day(string $date, string $centreId = ''): array {
    sf_seed();
    $scope = '';
    foreach (array_filter(['date:' . $date . ($centreId !== '' ? '@' . $centreId : ''), $centreId !== '' ? 'date:' . $date : '', $centreId !== '' ? 'centre:' . $centreId : '']) as $s) {
        if (sf_scope_exists($s)) { $scope = $s; break; }
    }
    $blocks = sf_blocks($scope);
    [$off, $note] = sf_off($date, $centreId);
    $start = $blocks ? $blocks[0]['start'] : ''; $end = $blocks ? end($blocks)['end'] : '';
    return ['date' => $date, 'centreId' => $centreId, 'scope' => $scope, 'changed' => str_starts_with($scope, 'date:'), 'off' => $off, 'note' => $note,
            'start' => $start, 'end' => $end, 'hours' => $blocks ? sf_clock($start) . ' – ' . sf_clock($end) : '', 'blocks' => $blocks];
}

/** One audience's view of a list of blocks: each block with that audience's part only (parent: one line). */
function sf_for(string $audience, ?array $blocks = null): array {
    if (!in_array($audience, SF_AUDIENCES, true)) $audience = 'member';
    return array_map(static function ($b) use ($audience) {
        $part = $b['for'][$audience] ?? ($audience === 'parent' ? '' : []);
        unset($b['for']);
        return $b + ['part' => $part, 'audience' => $audience];
    }, $blocks ?? sf_blocks());
}

/**
 * public.formation — the day for one audience, for a Saturday (default: the
 * next, or today if it is one) at a centre (default: the main day). Public: it
 * is the programme's published schedule. Cached; purged by 'formation'.
 */
function public_formation(array $p): array {
    $a = (string)($p['audience'] ?? 'member');
    $date = (string)($p['date'] ?? ''); if (!sf_is_saturday($date)) $date = sf_next_saturday();
    $cid = sf_centre_id((string)($p['centre'] ?? ''));
    $d = sf_day($date, $cid);
    return ['ok' => true, 'theme' => SF_THEME, 'hours' => $d['hours'], 'start' => $d['start'], 'end' => $d['end'], 'date' => $date, 'centre' => $cid !== '' ? (sf_centres()[$cid] ?? '') : '',
            'off' => $d['off'], 'note' => $d['note'], 'changed' => $d['changed'], 'audience' => in_array($a, SF_AUDIENCES, true) ? $a : 'member',
            'logic' => SF_LOGIC, 'blocks' => $d['off'] ? [] : sf_for($a, $d['blocks'])];
}

/* ── The editor (capability: content; a centre-scoped admin, their centres' days only) ── */

/** The gate for writing one version: content, and a scoped admin only for their own centres' versions. */
function sf_gate(array $p, string $scope): array {
    $g = admin_cap_gate($p, 'content'); if (empty($g['ok'])) return $g;
    $in = admin_centre_names_in_scope($g['requester']);
    if ($in !== null) {
        [, $c] = sf_scope_parts($scope);
        $name = $c !== '' ? (sf_centres()[$c] ?? '') : '';
        if ($c === '' || !in_array($name, $in, true)) return ['ok' => false, 'error' => 'out_of_scope', 'message' => 'You can change your own centres’ days only.'];
    }
    return $g;
}
function sf_touched(array $g, string $event, string $scope, array $meta, array $p): void {
    if (function_exists('cache_invalidate')) cache_invalidate('formation');
    audit($event, (string)$g['requester']['memberId'], $scope === '' ? 'formation:main' : 'formation:' . $scope, $meta, (string)($p['ip'] ?? ''));
}
/** The version an op is about, from `scope`; a version that does not exist yet is refused (create it first), except the main day. */
function sf_scope_in(array $p, bool $mustExist = true): ?string {
    $s = sf_scope_norm((string)($p['scope'] ?? ''));
    if ($s === null) return null;
    if ($s !== '' && $mustExist && !sf_scope_exists($s)) return null;
    return $s;
}
function sf_rows(string $scope): array { return db_all('SELECT * FROM saturday_formation_blocks WHERE scope = ? ORDER BY sort, startTime, id', [$scope]); }
/** Renumber a version's order 10, 20, 30… in the given order of row ids. */
function sf_resort(array $ids): void { foreach (array_values($ids) as $i => $id) db_update('saturday_formation_blocks', ['sort' => ($i + 1) * 10], ['id' => (int)$id]); }

/** admin.formation.list — one version (default the main day) with its checks, and every version and Saturday off there is. */
function admin_formation_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (empty($g['ok'])) return $g;
    sf_seed();
    $scope = sf_scope_norm((string)($p['scope'] ?? ''));
    if ($scope === null || ($scope !== '' && !sf_scope_exists($scope))) $scope = '';
    $centres = sf_centres();
    $blocks = sf_blocks($scope);
    $today = gmdate('Y-m-d', time() + 3600);
    $versions = [['scope' => '', 'label' => 'Every Saturday', 'kind' => 'main']];
    foreach (db_all("SELECT DISTINCT scope FROM saturday_formation_blocks WHERE scope <> '' ORDER BY scope") as $r) {
        $s = (string)$r['scope']; [$d] = sf_scope_parts($s);
        if ($d !== '' && $d < gmdate('Y-m-d', strtotime($today . ' -28 days'))) continue;   // a past Saturday's change, kept but not listed after four weeks
        $versions[] = ['scope' => $s, 'label' => sf_scope_label($s, $centres), 'kind' => $d !== '' ? 'date' : 'centre', 'past' => $d !== '' && $d < $today];
    }
    $off = array_map(static fn($r) => ['date' => (string)$r['onDate'], 'centreId' => (string)$r['centreId'], 'centre' => $centres[(string)$r['centreId']] ?? '',
        'off' => (int)$r['off'] === 1, 'note' => (string)$r['note']], db_all('SELECT * FROM saturday_formation_dates WHERE onDate >= ? ORDER BY onDate, centreId', [$today]));
    $last = (string)(db_row('SELECT MAX(onDate) d FROM saturday_formation_sends')['d'] ?? '');
    $sent = $last !== '' ? db_all('SELECT slot, channel, COUNT(*) n FROM saturday_formation_sends WHERE onDate = ? GROUP BY slot, channel ORDER BY slot', [$last]) : [];
    return ['ok' => true, 'scope' => $scope, 'label' => sf_scope_label($scope, $centres), 'blocks' => $blocks, 'checks' => sf_check($blocks),
            'hours' => $blocks ? sf_clock($blocks[0]['start']) . ' – ' . sf_clock(end($blocks)['end']) : '',
            'versions' => $versions, 'offDays' => $off, 'centres' => array_map(static fn($id, $n) => ['id' => $id, 'name' => $n], array_keys($centres), $centres),
            'nextSaturday' => sf_next_saturday(), 'kinds' => SF_KINDS, 'audiences' => SF_AUDIENCES, 'settings' => sf_setting(),
            'blocksMax' => SF_BLOCKS_MAX, 'shiftMax' => SF_SHIFT_MAX, 'lastSaturday' => $last, 'sent' => $sent];
}

/** The block fields an edit may carry, checked; [fields, error]. */
function sf_fields(array $p, array $row = []): array {
    $f = [];
    foreach (['start' => 'startTime', 'end' => 'endTime'] as $in => $col) if (array_key_exists($in, $p)) {
        if (!sf_time_ok((string)$p[$in])) return [[], 'bad_time'];
        $f[$col] = (string)$p[$in];
    }
    foreach (['title' => 120, 'flow' => 60, 'purpose' => 400, 'quote' => 300] as $k => $max) if (array_key_exists($k, $p)) {
        $v = trim((string)$p[$k]); if (mb_strlen($v) > $max) return [[], 'too_long'];
        if ($k === 'title' && $v === '') return [[], 'title_required'];
        $f[$k] = $v;
    }
    if (array_key_exists('kind', $p)) {
        if (!array_key_exists((string)$p['kind'], SF_KINDS)) return [[], 'bad_kind'];
        $f['kind'] = (string)$p['kind'];
    }
    if (array_key_exists('for', $p)) {
        $have = json_decode((string)($row['forJson'] ?? ''), true) ?: [];
        foreach ((array)$p['for'] as $aud => $v) {
            if (!in_array($aud, SF_AUDIENCES, true)) return [[], 'bad_audience'];
            $have[$aud] = $aud === 'parent' ? mb_substr(trim((string)$v), 0, 400) : array_values(array_slice(array_filter(array_map(static fn($x) => mb_substr(trim((string)$x), 0, 300), (array)$v)), 0, 20));
        }
        $f['forJson'] = json_encode($have, JSON_UNESCAPED_UNICODE);
    }
    return [$f, ''];
}
const SF_ERR = ['bad_time' => 'Use 24-hour time, like 08:30.', 'too_long' => 'That is too long.', 'title_required' => 'Give the block a name.', 'bad_kind' => 'Not a kind of block.',
                'bad_audience' => 'Not one of the readers.', 'end_before_start' => 'A block has to end after it starts.', 'bad_scope' => 'Choose a version of the day that exists.',
                'not_found' => 'That block is not in this version of the day.', 'too_many' => 'A day holds at most 24 blocks.', 'last_block' => 'A day needs at least one block.',
                'day_out_of_bounds' => 'That would move the day past midnight.'];
function sf_err(string $e, array $extra = []): array { return ['ok' => false, 'error' => $e, 'message' => SF_ERR[$e] ?? $e] + $extra; }

/**
 * Write a whole version's times at once, refusing an overlap. $rows are the
 * version's rows (id => [start, end] minutes, in order). Nothing is written
 * unless the whole day is sound.
 */
function sf_write_times(array $rows, array $times): ?array {
    $blocks = [];
    foreach ($rows as $r) { [$s, $e] = $times[(int)$r['id']] ?? [sf_minutes($r['startTime']), sf_minutes($r['endTime'])];
        if ($s < 0 || $e > 24 * 60 - 1) return sf_err('day_out_of_bounds');
        $blocks[] = ['key' => (string)$r['blockKey'], 'title' => (string)$r['title'], 'start' => sf_hhmm($s), 'end' => sf_hhmm($e)]; }
    foreach (sf_check($blocks) as $c) if ($c['level'] === 'error') return ['ok' => false, 'error' => 'overlap', 'message' => $c['text'] . ' Move it, or let the blocks after it move too.', 'key' => $c['key']];
    foreach ($rows as $i => $r) db_update('saturday_formation_blocks', ['startTime' => $blocks[$i]['start'], 'endTime' => $blocks[$i]['end']], ['id' => (int)$r['id']]);
    return null;
}

/**
 * admin.formation.save — edit one block of one version. With `ripple` (the
 * default) a change to its end moves every block after it by the same amount,
 * keeping their lengths and the gaps between them; without it, a time that
 * overlaps a neighbour is refused, named.
 */
function admin_formation_save(array $p): array {
    $scope = sf_scope_in($p); if ($scope === null) return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    sf_seed();
    $rows = sf_rows($scope);
    $i = array_search((string)($p['key'] ?? ''), array_column($rows, 'blockKey'), true);
    if ($i === false) return sf_err('not_found');
    $row = $rows[$i];
    [$f, $err] = sf_fields($p, $row); if ($err !== '') return sf_err($err);
    if (!$f) return ['ok' => true, 'unchanged' => true];
    $s = sf_minutes($f['startTime'] ?? $row['startTime']); $e = sf_minutes($f['endTime'] ?? $row['endTime']);
    if ($e <= $s) return sf_err('end_before_start');
    $times = [(int)$row['id'] => [$s, $e]];
    $moved = 0;
    if (($p['ripple'] ?? true) !== false) {
        $delta = $e - sf_minutes($row['endTime']);
        if ($delta !== 0) foreach (array_slice($rows, $i + 1) as $r) { $times[(int)$r['id']] = [sf_minutes($r['startTime']) + $delta, sf_minutes($r['endTime']) + $delta]; $moved++; }
    }
    $db = db_conn(); $db->beginTransaction();
    try {
        if ($bad = sf_write_times($rows, $times)) { $db->rollBack(); return $bad; }
        $other = array_diff_key($f, ['startTime' => 1, 'endTime' => 1]);
        db_update('saturday_formation_blocks', $other + ['updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']], ['id' => (int)$row['id']]);
        $db->commit();
    } catch (\Throwable $ex) { $db->rollBack(); throw $ex; }
    sf_touched($g, 'formation.block.save', $scope, ['key' => $row['blockKey'], 'fields' => array_keys($f), 'moved' => $moved], $p);
    return ['ok' => true, 'moved' => $moved, 'checks' => sf_check(sf_blocks($scope))];
}

/** A key for a new block, unique in its version. */
function sf_new_key(string $scope, string $title): string {
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($title)), '-') ?: 'block';
    $base = substr($base, 0, 28); $k = $base; $n = 2;
    while (db_row('SELECT id FROM saturday_formation_blocks WHERE scope = ? AND blockKey = ?', [$scope, $k])) $k = substr($base, 0, 24) . '-' . $n++;
    return $k;
}

/**
 * admin.formation.add — a new block after `after` (or at the end), `minutes`
 * long (default 30) unless a start and end are given. Put in the middle of the
 * day, the blocks after it move later by its length (ripple) so nothing
 * overlaps; `copyOf` makes it a copy of another block of the same version.
 */
function admin_formation_add(array $p): array {
    $scope = sf_scope_in($p); if ($scope === null) return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    sf_seed();
    $rows = sf_rows($scope);
    if (count($rows) >= SF_BLOCKS_MAX) return sf_err('too_many');
    $src = null;
    if (($p['copyOf'] ?? '') !== '') {
        $j = array_search((string)$p['copyOf'], array_column($rows, 'blockKey'), true);
        if ($j === false) return sf_err('not_found');
        $src = $rows[$j]; $p += ['after' => $src['blockKey'], 'title' => $src['title'] . ' (copy)', 'minutes' => sf_minutes($src['endTime']) - sf_minutes($src['startTime'])];
    }
    $after = (string)($p['after'] ?? '');
    $pos = $after === '' ? count($rows) - 1 : array_search($after, array_column($rows, 'blockKey'), true);
    if ($pos === false) return sf_err('not_found');
    $title = trim((string)($p['title'] ?? '')); if ($title === '') return sf_err('title_required');
    $len = max(5, min(600, (int)($p['minutes'] ?? 30)));
    $s = $pos >= 0 && $rows ? sf_minutes($rows[$pos]['endTime']) : 8 * 60;
    if (isset($p['start'], $p['end'])) { if (!sf_time_ok((string)$p['start']) || !sf_time_ok((string)$p['end'])) return sf_err('bad_time'); $s = sf_minutes($p['start']); $len = sf_minutes($p['end']) - $s; }
    if ($len <= 0) return sf_err('end_before_start');
    [$f, $err] = sf_fields(['title' => $title] + array_intersect_key($p, array_flip(['flow', 'purpose', 'quote', 'kind', 'for'])), $src ?? []); if ($err !== '') return sf_err($err);
    if ($src) $f += ['flow' => $src['flow'], 'purpose' => $src['purpose'], 'quote' => $src['quote'], 'kind' => $src['kind'], 'forJson' => $src['forJson']];
    $db = db_conn(); $db->beginTransaction();
    try {
        $key = sf_new_key($scope, $title);
        $times = []; $moved = 0;
        if (($p['ripple'] ?? true) !== false) foreach (array_slice($rows, $pos + 1) as $r) {
            if (sf_minutes($r['endTime']) <= $s) continue;
            $times[(int)$r['id']] = [sf_minutes($r['startTime']) + $len, sf_minutes($r['endTime']) + $len]; $moved++;
        }
        if ($s + $len > 24 * 60 - 1) { $db->rollBack(); return sf_err('day_out_of_bounds'); }
        $id = db_insert('saturday_formation_blocks', $f + ['scope' => $scope, 'blockKey' => $key, 'sort' => 0, 'startTime' => sf_hhmm($s), 'endTime' => sf_hhmm($s + $len),
            'flow' => '', 'purpose' => '', 'quote' => '', 'kind' => '', 'forJson' => '{}', 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']]);
        $ids = array_column($rows, 'id'); array_splice($ids, $pos + 1, 0, [(int)$id ?: (int)db_row('SELECT id FROM saturday_formation_blocks WHERE scope = ? AND blockKey = ?', [$scope, $key])['id']]);
        sf_resort($ids);
        if ($bad = sf_write_times(sf_rows($scope), $times)) { $db->rollBack(); return $bad; }
        $db->commit();
    } catch (\Throwable $ex) { $db->rollBack(); throw $ex; }
    sf_touched($g, 'formation.block.add', $scope, ['key' => $key, 'copyOf' => $src['blockKey'] ?? '', 'moved' => $moved], $p);
    return ['ok' => true, 'key' => $key, 'moved' => $moved, 'checks' => sf_check(sf_blocks($scope))];
}

/** admin.formation.remove — take a block out; with `close` (the default) the blocks after it move up to fill its time. */
function admin_formation_remove(array $p): array {
    $scope = sf_scope_in($p); if ($scope === null) return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    $rows = sf_rows($scope);
    $i = array_search((string)($p['key'] ?? ''), array_column($rows, 'blockKey'), true);
    if ($i === false) return sf_err('not_found');
    if (count($rows) <= 1) return sf_err('last_block');
    $row = $rows[$i];
    $len = sf_minutes($row['endTime']) - sf_minutes($rows[$i]['startTime']);
    $next = $rows[$i + 1] ?? null;
    $gap = $next ? sf_minutes($next['startTime']) - sf_minutes($row['endTime']) : 0;
    $db = db_conn(); $db->beginTransaction();
    try {
        db_exec('DELETE FROM saturday_formation_blocks WHERE id = ?', [(int)$row['id']]);
        $moved = 0; $times = [];
        if (($p['close'] ?? true) !== false && $next) foreach (array_slice($rows, $i + 1) as $r) { $times[(int)$r['id']] = [sf_minutes($r['startTime']) - $len - $gap, sf_minutes($r['endTime']) - $len - $gap]; $moved++; }
        $left = sf_rows($scope);
        if ($bad = sf_write_times($left, $times)) { $db->rollBack(); return $bad; }
        $db->commit();
    } catch (\Throwable $ex) { $db->rollBack(); throw $ex; }
    sf_touched($g, 'formation.block.remove', $scope, ['key' => $row['blockKey'], 'title' => $row['title'], 'moved' => $moved], $p);
    return ['ok' => true, 'moved' => $moved, 'checks' => sf_check(sf_blocks($scope))];
}

/**
 * admin.formation.move — a block up or down one place. The two blocks swap
 * places in the timeline, each keeping its own length and the gap between
 * them, so the day still starts and ends when it did.
 */
function admin_formation_move(array $p): array {
    $scope = sf_scope_in($p); if ($scope === null) return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    $rows = sf_rows($scope);
    $i = array_search((string)($p['key'] ?? ''), array_column($rows, 'blockKey'), true);
    if ($i === false) return sf_err('not_found');
    $j = ($p['dir'] ?? '') === 'up' ? $i - 1 : $i + 1;
    if ($j < 0 || $j >= count($rows)) return ['ok' => true, 'unchanged' => true];
    [$a, $b] = $i < $j ? [$rows[$i], $rows[$j]] : [$rows[$j], $rows[$i]];   // a is earlier
    $aS = sf_minutes($a['startTime']); $aL = sf_minutes($a['endTime']) - $aS; $bL = sf_minutes($b['endTime']) - sf_minutes($b['startTime']);
    $gap = sf_minutes($b['startTime']) - sf_minutes($a['endTime']);
    $times = [(int)$b['id'] => [$aS, $aS + $bL], (int)$a['id'] => [$aS + $bL + $gap, $aS + $bL + $gap + $aL]];
    $ids = array_column($rows, 'id'); [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]];
    $db = db_conn(); $db->beginTransaction();
    try {
        sf_resort($ids);
        if ($bad = sf_write_times(sf_rows($scope), $times)) { $db->rollBack(); return $bad; }
        $db->commit();
    } catch (\Throwable $ex) { $db->rollBack(); throw $ex; }
    sf_touched($g, 'formation.block.move', $scope, ['key' => $rows[$i]['blockKey'], 'dir' => $j < $i ? 'up' : 'down'], $p);
    return ['ok' => true, 'checks' => sf_check(sf_blocks($scope))];
}

/** admin.formation.shift — move the whole day (or from one block on) earlier or later: "we start at 9 this term". */
function admin_formation_shift(array $p): array {
    $scope = sf_scope_in($p); if ($scope === null) return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    sf_seed();
    $by = (int)($p['minutes'] ?? 0);
    if (isset($p['startAt'])) { if (!sf_time_ok((string)$p['startAt'])) return sf_err('bad_time'); }
    $rows = sf_rows($scope);
    if (!$rows) return sf_err('bad_scope');
    $from = 0;
    if (($p['from'] ?? '') !== '') { $from = array_search((string)$p['from'], array_column($rows, 'blockKey'), true); if ($from === false) return sf_err('not_found'); }
    if (isset($p['startAt'])) $by = sf_minutes((string)$p['startAt']) - sf_minutes($rows[$from]['startTime']);
    if ($by === 0) return ['ok' => true, 'unchanged' => true];
    if (abs($by) > SF_SHIFT_MAX) return ['ok' => false, 'error' => 'too_far', 'message' => 'Move the day at most ' . intdiv(SF_SHIFT_MAX, 60) . ' hours at a time.'];
    $times = [];
    foreach (array_slice($rows, $from) as $r) $times[(int)$r['id']] = [sf_minutes($r['startTime']) + $by, sf_minutes($r['endTime']) + $by];
    $db = db_conn(); $db->beginTransaction();
    try { if ($bad = sf_write_times($rows, $times)) { $db->rollBack(); return $bad; } $db->commit(); }
    catch (\Throwable $ex) { $db->rollBack(); throw $ex; }
    sf_touched($g, 'formation.day.shift', $scope, ['minutes' => $by, 'from' => $rows[$from]['blockKey'], 'blocks' => count($times)], $p);
    return ['ok' => true, 'minutes' => $by, 'moved' => count($times), 'checks' => sf_check(sf_blocks($scope))];
}

/**
 * admin.formation.version.create — a centre's own day, or one Saturday's
 * (everywhere or at one centre), started as a copy of what was in force there.
 */
function admin_formation_version_create(array $p): array {
    $scope = sf_scope_norm((string)($p['scope'] ?? ''));
    if ($scope === null || $scope === '') return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    sf_seed();
    if (sf_scope_exists($scope)) return ['ok' => true, 'unchanged' => true, 'scope' => $scope];
    [$d] = sf_scope_parts($scope);
    if ($d !== '' && $d < gmdate('Y-m-d', time() + 3600)) return ['ok' => false, 'error' => 'past_date', 'message' => 'That Saturday has passed.'];
    $base = sf_scope_base($scope); $now = now_iso();
    foreach (sf_rows($base) as $r) {
        db_insert('saturday_formation_blocks', array_intersect_key($r, array_flip(['blockKey', 'sort', 'startTime', 'endTime', 'title', 'flow', 'purpose', 'quote', 'forJson', 'kind']))
            + ['scope' => $scope, 'updatedAt' => $now, 'updatedBy' => (string)$g['requester']['memberId']]);
    }
    sf_touched($g, 'formation.version.create', $scope, ['from' => $base === '' ? 'main' : $base], $p);
    return ['ok' => true, 'scope' => $scope, 'label' => sf_scope_label($scope), 'from' => sf_scope_label($base)];
}

/** admin.formation.version.delete — back to what applied before. The main day cannot be deleted. */
function admin_formation_version_delete(array $p): array {
    $scope = sf_scope_norm((string)($p['scope'] ?? ''));
    if ($scope === null || $scope === '') return sf_err('bad_scope');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    $n = db_exec('DELETE FROM saturday_formation_blocks WHERE scope = ?', [$scope]);
    if (!$n) return ['ok' => true, 'unchanged' => true];
    sf_touched($g, 'formation.version.delete', $scope, ['blocks' => $n], $p);
    return ['ok' => true, 'removed' => $n];
}

/**
 * admin.formation.day.set — a Saturday off (no NGG: nothing is sent, every
 * portal says so) or back on, everywhere or at one centre, with a note
 * families and members read.
 */
function admin_formation_day_set(array $p): array {
    $date = (string)($p['date'] ?? '');
    if (!sf_is_saturday($date)) return ['ok' => false, 'error' => 'not_saturday', 'field' => 'date', 'message' => 'Choose a Saturday.'];
    $cid = ($p['centre'] ?? '') === '' ? '' : sf_centre_id((string)$p['centre']);
    if (($p['centre'] ?? '') !== '' && $cid === '') return sf_err('bad_scope');
    $scope = 'date:' . $date . ($cid !== '' ? '@' . $cid : '');
    $g = sf_gate($p, $scope); if (empty($g['ok'])) return $g;
    $off = !empty($p['off']); $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 300);
    if ($off && $note === '') return ['ok' => false, 'error' => 'note_required', 'field' => 'note', 'message' => 'Say why, in a line families will read.'];
    $have = db_row('SELECT id FROM saturday_formation_dates WHERE onDate = ? AND centreId = ?', [$date, $cid]);
    if (!$off && $note === '') { if ($have) db_exec('DELETE FROM saturday_formation_dates WHERE id = ?', [(int)$have['id']]); }
    elseif ($have) db_update('saturday_formation_dates', ['off' => $off ? 1 : 0, 'note' => $note, 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']], ['id' => (int)$have['id']]);
    else db_insert('saturday_formation_dates', ['onDate' => $date, 'centreId' => $cid, 'off' => $off ? 1 : 0, 'note' => $note, 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']]);
    sf_touched($g, $off ? 'formation.day.off' : 'formation.day.on', $scope, ['note' => $note], $p);
    return ['ok' => true, 'date' => $date, 'centreId' => $cid, 'off' => $off];
}

/* ── The day, as it happens ────────────────────────────────────────────── */

/** Has this been sent? Records it if not. One row per day, slot, person, channel. */
function sf_once(string $date, string $slot, string $to, string $channel): bool {
    try { db_insert('saturday_formation_sends', ['onDate' => $date, 'slot' => $slot, 'recipient' => $to, 'channel' => $channel, 'sentAt' => now_iso()]); return true; }
    catch (\Throwable $e) { return false; }
}
function sf_setting(): array {
    $s = function_exists('setting_get') ? setting_get('saturday_formation') : null;
    $d = ['members' => true, 'mentors' => true, 'instructors' => true, 'parents' => true];
    return is_array($s) ? array_merge($d, array_intersect_key(array_map('boolval', $s), $d)) : $d;
}
/** NGG members who checked in today (the gate or a mentor's register). */
function sf_here_today(string $date): array {
    $ids = array_column(db_all("SELECT DISTINCT a.studentId FROM attendance a JOIN members m ON m.memberId = a.studentId WHERE a.date = ? AND m.status = 'active' AND m.type = 'NGG'", [$date]), 'studentId');
    return array_values(array_unique(array_merge($ids, array_column(db_all("SELECT subjectId FROM mentor_register WHERE onDate = ? AND here = 1", [$date]), 'subjectId'))));
}
/** Centre name => centre id, for people whose record names their centre. */
function sf_centre_index(): array { $o = []; foreach (sf_centres() as $id => $n) $o[strtolower($n)] = $id; return $o; }

/**
 * Called by the web-cron. Returns what it sent, for the job log and the tests.
 * $now is a UTC timestamp; the schedule is Lagos time (UTC+1, no DST). Each
 * person is sent their own centre's day; a Saturday off there sends nothing.
 */
function sf_tick(?int $now = null): array {
    $now = $now ?? time();
    $lagos = $now + 3600;
    if ((int)gmdate('w', $lagos) !== 6) return ['saturday' => false];
    $date = gmdate('Y-m-d', $lagos); $min = (int)gmdate('G', $lagos) * 60 + (int)gmdate('i', $lagos);
    $set = sf_setting(); $budget = SF_TICK_MAX; $sent = [];
    $open = static fn(int $at) => $min >= $at && $min < $at + SF_WINDOW_MIN;
    $cidx = sf_centre_index();
    $days = [];
    $dayOf = static function (string $centreName) use (&$days, $cidx, $date) {
        $cid = $cidx[strtolower(trim($centreName))] ?? '';
        return $days[$cid] ??= sf_day($date, $cid);
    };
    // Members in the building: their centre's block, and what it asks of them.
    if ($set['members']) {
        $here = sf_here_today($date);
        $centreOf = [];
        foreach (array_chunk($here, 400) as $c) foreach (db_all('SELECT memberId, centre FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($c), '?')) . ')', $c) as $r) $centreOf[(string)$r['memberId']] = (string)$r['centre'];
        foreach ($here as $mid) {
            $d = $dayOf($centreOf[$mid] ?? ''); if ($d['off']) continue;
            foreach ($d['blocks'] as $b) {
                if ($b['kind'] === 'checkin' || !$open(sf_minutes($b['start'])) || $budget <= 0) continue;
                if (!sf_once($date, 'block:' . $b['key'], $mid, 'push')) continue;
                push_notification($mid, ['kind' => 'formation', 'title' => 'Now · ' . $b['start'] . ' ' . $b['title'], 'body' => mb_substr($b['quote'] !== '' ? $b['quote'] : implode(' · ', array_slice((array)($b['for']['member'] ?? []), 0, 3)), 0, 140), 'linkPage' => 'timetable', 'groupKey' => 'formation:' . $date]);
                $budget--; $sent[] = ['block:' . $b['key'], 'member', $mid];
            }
        }
    }
    // Mentors: the block's mentor focus, by their centre's day.
    if ($set['mentors']) {
        foreach (db_all("SELECT memberId, COALESCE(centre, '') centre FROM mentors WHERE status = 'active' AND programme IN ('ngg','both') AND COALESCE(memberId,'') <> ''") as $r) {
            $d = $dayOf((string)$r['centre']); if ($d['off']) continue;
            foreach ($d['blocks'] as $b) {
                if (empty($b['for']['mentor']) || !$open(sf_minutes($b['start'])) || $budget <= 0) continue;
                if (!sf_once($date, 'block:' . $b['key'], (string)$r['memberId'], 'push')) continue;
                push_notification((string)$r['memberId'], ['kind' => 'formation', 'title' => 'Now · ' . $b['start'] . ' ' . $b['title'], 'body' => mb_substr(implode(' ', array_slice((array)$b['for']['mentor'], 0, 2)), 0, 140), 'linkPage' => 'mentor', 'actionLabel' => 'Open the mentor desk', 'groupKey' => 'formation:' . $date]);
                $budget--; $sent[] = ['block:' . $b['key'], 'mentor', (string)$r['memberId']];
            }
        }
    }
    // Instructors with a Saturday class: their centre's classes block, at its start.
    if ($set['instructors']) {
        $names = sf_centres();
        foreach (db_all("SELECT DISTINCT v.memberId, t.centreId FROM timetable_slots t JOIN volunteers v ON v.volunteerId = t.instructorId WHERE t.weekday = 6 AND t.status = 'active' AND COALESCE(v.memberId,'') <> ''") as $r) {
            $d = $dayOf($names[(string)$r['centreId']] ?? ''); if ($d['off']) continue;
            foreach ($d['blocks'] as $b) {
                if ($b['kind'] !== 'classes' || !$open(sf_minutes($b['start'])) || $budget <= 0) continue;
                if (!sf_once($date, 'block:' . $b['key'], (string)$r['memberId'], 'push')) continue;
                push_notification((string)$r['memberId'], ['kind' => 'instructor', 'title' => sf_clock($b['start']) . ' · ' . $b['title'], 'body' => 'Practical and project-driven. Take the register; every member adds to their portfolio.', 'linkPage' => 'mentor']);
                $budget--; $sent[] = ['block:' . $b['key'], 'instructor', (string)$r['memberId']];
            }
        }
    }
    if ($set['parents']) $sent = array_merge($sent, sf_parents($date, $min, $dayOf, $budget));
    return ['saturday' => true, 'date' => $date, 'sent' => count($sent), 'items' => $sent];
}

/** Every linked guardian of every active NGG member (one grouped read); check-in news is always on. */
function sf_guardians(): array {
    $out = [];
    foreach (db_all("SELECT w.memberId, g.email, w.notify, m.fullName, m.centre FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId JOIN members m ON m.memberId = w.memberId
                     WHERE w.status = 'active' AND g.status = 'active' AND m.status = 'active' AND m.type = 'NGG'") as $r) {
        if (empty(family_notify_prefs($r['notify'] ?? '')['checkin'])) continue;
        if (!filter_var((string)$r['email'], FILTER_VALIDATE_EMAIL)) continue;
        $out[] = ['memberId' => (string)$r['memberId'], 'email' => strtolower((string)$r['email']), 'first' => mp_first((string)$r['fullName']), 'centre' => (string)$r['centre']];
    }
    return $out;
}
function sf_mail(string $to, string $subject, string $title, string $intro, array $lines, string $foot): bool {
    $html = '<ul>' . implode('', array_map(static fn($l) => '<li>' . esc_html($l) . '</li>', $lines)) . '</ul>';   // no inline styles: the template styles a list
    if (function_exists('family_mail')) { family_mail($to, $subject, ['title' => $title, 'intro' => $intro, 'bodyHtml' => $html, 'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family', 'footNote' => $foot]); return true; }
    return (bool)send_mail($to, $subject, email_template(['title' => $title, 'intro' => $intro, 'bodyHtml' => $html, 'footNote' => $foot]));
}
/**
 * The three family messages of a Saturday, by the child's centre's day: the
 * plan an hour before it starts (never before 8:00, the email window), the
 * not-arrived notice 45 minutes in, and the close at its end. A Saturday off
 * at their centre sends none of them.
 */
function sf_parents(string $date, int $min, callable $dayOf, int &$budget): array {
    $sent = [];
    $gs = sf_guardians(); if (!$gs) return [];
    $here = null;
    $foot = 'You get this because check-in news is on for this member in your family account. Turn it off there at any time.';
    foreach ($gs as $g) {
        if ($budget <= 0) break;
        $d = $dayOf($g['centre']);
        if ($d['off'] || !$d['blocks']) continue;
        $s = sf_minutes($d['start']); $e = sf_minutes($d['end']);
        $planAt = max(8 * 60, $s - 60);
        $morning = $min >= $planAt && $min < $planAt + 40;
        $late = $min >= $s + 45 && $min < $s + 45 + SF_WINDOW_MIN;
        $close = $min >= $e && $min < $e + 90;
        if (!$morning && !$late && !$close) continue;
        $here = $here ?? array_flip(sf_here_today($date));
        $mid = $g['memberId']; $first = $g['first'] ?: 'Your child';
        if ($morning && sf_once($date, 'parent:plan', $g['email'] . '|' . $mid, 'email')) {
            sf_mail($g['email'], 'Saturday at NGG for ' . $first . ': ' . $d['hours'], 'Today at NGG', $first . '’s Saturday, block by block. ' . SF_THEME . ($d['note'] !== '' ? ' ' . $d['note'] : ''),
                array_map(static fn($b) => sf_clock($b['start']) . ' · ' . $b['title'] . (($b['for']['parent'] ?? '') !== '' ? ': ' . $b['for']['parent'] : ''), $d['blocks']), $foot);
            $budget--; $sent[] = ['parent:plan', 'parent', $mid];
        }
        if ($late && !isset($here[$mid]) && sf_once($date, 'parent:absent', $g['email'] . '|' . $mid, 'email')) {
            sf_mail($g['email'], $first . ' hasn’t checked in at NGG yet', 'Not checked in yet', $first . ' had not checked in at ' . $g['centre'] . ' by ' . sf_clock(sf_hhmm($s + 45)) . '. Saturday began at ' . sf_clock($d['start']) . '.',
                ['If they are on their way, there is nothing to do.', 'If they are unwell or away today, let their mentor or the centre know.'], $foot);
            $budget--; $sent[] = ['parent:absent', 'parent', $mid];
        }
        if ($close && isset($here[$mid]) && sf_once($date, 'parent:close', $g['email'] . '|' . $mid, 'email')) {
            sf_mail($g['email'], $first . '’s Saturday at NGG', 'Today at NGG', 'Here is what ' . $first . '’s Saturday held.', sf_day_lines($mid, $date, $d['blocks']), $foot);
            $budget--; $sent[] = ['parent:close', 'parent', $mid];
        }
    }
    return $sent;
}
/** What one member's Saturday held: arrival, their mentor group, the review line, the reminder. Nothing private. */
function sf_day_lines(string $mid, string $date, array $blocks): array {
    $in = db_row("SELECT MIN(checkInAt) t FROM attendance WHERE studentId = ? AND date = ?", [$mid, $date]);
    $t = (string)($in['t'] ?? '');
    $lines = [$t !== '' ? 'Checked in at ' . gmdate('g:ia', strtotime($t) + 3600) . '.' : 'Marked here by their mentor.'];
    $reg = db_row('SELECT observed, checks FROM mentor_register WHERE onDate = ? AND subjectId = ?', [$date, $mid]);
    $obs = $reg ? (json_decode((string)$reg['observed'], true) ?: []) : [];
    $chk = $reg ? (json_decode((string)($reg['checks'] ?? ''), true) ?: []) : [];
    if ($chk) $lines[] = 'Accountability: ' . (in_array('On time', $chk, true) ? 'on time' : 'not marked on time') . ', ' . (in_array('Assignment in', $chk, true) ? 'assignment handed in' : 'assignment not handed in') . (in_array('Checked out', $chk, true) ? ', checked out by their mentor.' : '.');
    $mentor = db_row("SELECT t.mentorId FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.memberId = ? AND a.status = 'active' LIMIT 1", [$mid]);
    $lines[] = 'Musing & mentor breakout' . ($mentor ? ' with ' . staff_public_name((string)$mentor['mentorId'], 'their mentor') : '') . ($obs ? ': their mentor saw ' . strtolower(implode(', ', $obs)) . '.' : '.');
    $rev = db_row('SELECT line FROM mentor_reviews WHERE subjectId = ? AND period = ?', [$mid, iso_week_period(strtotime($date . 'T12:00:00Z'))]);
    if ($rev && trim((string)$rev['line']) !== '') $lines[] = 'From their mentor: “' . mb_substr(trim((string)$rev['line']), 0, 200) . '”';
    /* The latest Saturday evaluation: the strength their mentor saw and the one next step (never the ratings). */
    $ev = db_row("SELECT evalJson FROM mentor_reviews WHERE subjectId = ? AND evalJson IS NOT NULL AND evalJson <> '' ORDER BY period DESC LIMIT 1", [$mid]);
    $e = $ev ? json_decode((string)$ev['evalJson'], true) : null;
    if (is_array($e) && trim((string)($e['strength'] ?? '')) !== '') $lines[] = 'A strength their mentor saw: ' . mb_substr(trim((string)$e['strength']), 0, 200);
    if (is_array($e) && trim((string)($e['next'] ?? '')) !== '') $lines[] = 'Their next step: ' . mb_substr(trim((string)$e['next']), 0, 200);
    /* The day's own blocks with a line for families, past the check-in, the
       mentor breakout (said above), the break and the close. */
    foreach ($blocks as $b) if (!in_array($b['kind'] ?? '', ['checkin', 'mentor', 'break', 'close'], true) && (($b['for']['parent'] ?? '') !== '') && !in_array($b['key'], ['anthem'], true)) $lines[] = $b['title'] . ': ' . $b['for']['parent'];
    $ci = null; foreach ($blocks as $b) if (($b['kind'] ?? '') === 'checkin') { $ci = $b; break; }
    $lines[] = 'Next week: this week’s assignment is due at check-in, ' . sf_clock($ci['start'] ?? ($blocks[0]['start'] ?? '09:00')) . '.';
    return $lines;
}
