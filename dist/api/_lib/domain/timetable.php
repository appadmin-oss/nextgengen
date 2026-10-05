<?php
declare(strict_types=1);

/**
 * The timetable — which course meets when, where and with whom, at each centre.
 *
 * Before this there was no timetable at all: a centre had a free-text
 * "meets" line, members had a course, instructors had courses, and nothing
 * said which of them were in which room at 10 o'clock on Saturday. So nothing
 * could notice that two courses had been put in one hall at once, or that one
 * instructor was expected at two centres in the same hour.
 *
 * CLASHES ARE REFUSED, NOT FLAGGED. Like capacity in Summer School groups, a
 * clash is a refusal on the way in, naming what it clashes with:
 *
 *   room        same centre, same room (blank = the centre's main room),
 *               same day, times overlap
 *   instructor  one instructor in two places at once, at ANY centre
 *   course      the same course and level twice at one centre at overlapping
 *               times — its members cannot be in both
 *   centre_day  a day the centre does not meet (its "meets" days), which
 *               would also put members on a day the register never opens
 *   centre_time outside the centre's meeting hours, when they can be read
 *
 * The list still reports clashes on what is ALREADY stored (`clashes` on each
 * row), because a centre can change its meeting days after the timetable was
 * built — that is a fact to fix, not to hide.
 *
 * Ownership: the timetable is the Club's (cap `club` to change it), read by
 * anyone who works with members; centre scope applies per row both ways.
 * Members see their own centre's, parents their child's, and the public a
 * centre's slots without instructor names.
 */

const TT_DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];
const TT_MAX_PER_CENTRE = 200;
const TT_REMOVE_MAX = 200;

/** 'HH:MM' (24-hour) → minutes after midnight, or null. */
function tt_minutes(string $t): ?int {
    if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', trim($t), $m)) return null;
    return (int)$m[1] * 60 + (int)$m[2];
}
function tt_hhmm(int $min): string { return sprintf('%02d:%02d', intdiv($min, 60), $min % 60); }

/**
 * A centre's free-text meeting hours as [start, end] minutes, or null when the
 * text cannot be read with confidence ("Saturdays, mornings" is not a time).
 * Reads "10am–1pm", "10:00 - 13:00", "9.30am to 12pm".
 */
function tt_centre_window(string $text): ?array {
    $t = strtolower(str_replace(['–', '—', ' to '], '-', $text));
    if (!preg_match('/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/', $t, $m)) return null;
    $conv = static function ($h, $mi, $ap) {
        $h = (int)$h; $mi = (int)($mi ?: 0);
        if ($ap === 'pm' && $h < 12) $h += 12;
        if ($ap === 'am' && $h === 12) $h = 0;
        return ($h > 23 || $mi > 59) ? null : $h * 60 + $mi;
    };
    $apEnd = $m[6] ?? ''; $apStart = ($m[3] ?? '') !== '' ? $m[3] : $apEnd;
    $a = $conv($m[1], $m[2] ?? '', $apStart); $b = $conv($m[4], $m[5] ?? '', $apEnd);
    if ($a === null || $b === null || $b <= $a) return null;
    return [$a, $b];
}

/** Courses a slot may name: the academy catalogue, plus any already holding lessons. */
function tt_courses(): array {
    return function_exists('curriculum_courses') ? curriculum_courses() : (function_exists('academy_courses') ? academy_courses() : []);
}

function tt_public_slot(array $r, array $centres, array $instructors, bool $withInstructor = true): array {
    $c = $centres[(string)$r['centreId']] ?? null;
    $out = ['slotId' => (string)$r['slotId'], 'centreId' => (string)$r['centreId'], 'centre' => $c ? (string)$c['name'] : '',
            'course' => (string)$r['course'], 'level' => (string)$r['level'], 'weekday' => (int)$r['weekday'],
            'day' => TT_DAYS[(int)$r['weekday']] ?? '', 'startTime' => (string)$r['startTime'], 'endTime' => (string)$r['endTime'],
            'room' => (string)$r['room'], 'note' => (string)$r['note']];
    if ($withInstructor) {
        $out['instructorId'] = (string)$r['instructorId'];
        $out['instructor'] = (string)($instructors[(string)$r['instructorId']] ?? '');
    }
    return $out;
}

/** Every active centre by id, and every volunteer's name by id — two queries for any list. */
function tt_lookups(): array {
    $centres = [];
    foreach (db_all("SELECT centreId, name, status, meetDays, meetTime, slug, pageStatus, programmes FROM centres") as $c) $centres[(string)$c['centreId']] = $c;
    $vol = [];
    foreach (db_all("SELECT volunteerId, fullName FROM volunteers") as $v) $vol[(string)$v['volunteerId']] = (string)$v['fullName'];
    return [$centres, $vol];
}

/**
 * What a slot clashes with, among `$others` (active slots, already loaded).
 * Pure: the caller fetches once, so checking a whole centre is not a query per slot.
 */
function tt_clashes(array $s, array $others, array $centres, array $instructors): array {
    $out = [];
    $a = tt_minutes((string)$s['startTime']); $b = tt_minutes((string)$s['endTime']);
    if ($a === null || $b === null) return $out;
    $room = mb_strtolower(trim((string)$s['room']));
    $c = $centres[(string)$s['centreId']] ?? null;
    foreach ($others as $o) {
        if ((string)$o['slotId'] === (string)($s['slotId'] ?? '') || (int)$o['weekday'] !== (int)$s['weekday'] || (string)($o['status'] ?? 'active') !== 'active') continue;
        $oa = tt_minutes((string)$o['startTime']); $ob = tt_minutes((string)$o['endTime']);
        if ($oa === null || $ob === null || !($a < $ob && $oa < $b)) continue;   // touching end-to-start is not a clash
        $when = (TT_DAYS[(int)$o['weekday']] ?? '') . ' ' . $o['startTime'] . '–' . $o['endTime'];
        $oc = $centres[(string)$o['centreId']]['name'] ?? '';
        if ((string)$o['centreId'] === (string)$s['centreId'] && mb_strtolower(trim((string)$o['room'])) === $room) {
            $out[] = ['type' => 'room', 'slotId' => (string)$o['slotId'],
                      'detail' => ($room === '' ? 'The main room' : 'Room “' . $s['room'] . '”') . ' already has ' . $o['course'] . ' on ' . $when];
        } elseif ((string)$o['centreId'] === (string)$s['centreId'] && strcasecmp((string)$o['course'], (string)$s['course']) === 0
                  && strcasecmp((string)$o['level'], (string)$s['level']) === 0) {
            $out[] = ['type' => 'course', 'slotId' => (string)$o['slotId'],
                      'detail' => $s['course'] . ($s['level'] !== '' ? ' (' . $s['level'] . ')' : '') . ' already meets on ' . $when . ' — its members cannot be in two rooms'];
        }
        if ((string)$s['instructorId'] !== '' && (string)$o['instructorId'] === (string)$s['instructorId']) {
            $out[] = ['type' => 'instructor', 'slotId' => (string)$o['slotId'],
                      'detail' => ($instructors[(string)$s['instructorId']] ?? 'This instructor') . ' is teaching ' . $o['course'] . ' at ' . $oc . ' on ' . $when];
        }
    }
    if ($c) {
        $days = function_exists('centre_meet_weekdays') ? centre_meet_weekdays((string)($c['meetDays'] ?? '')) : [];
        if ($days && !in_array((int)$s['weekday'], $days, true)) {
            $out[] = ['type' => 'centre_day', 'detail' => $c['name'] . ' does not meet on ' . (TT_DAYS[(int)$s['weekday']] ?? 'that day')
                      . ' (it meets ' . implode(', ', array_map(static fn($d) => TT_DAYS[$d], $days)) . ') — members would be marked on a day the register never opens'];
        }
        $win = tt_centre_window((string)($c['meetTime'] ?? ''));
        if ($win && ($a < $win[0] || $b > $win[1])) {
            $out[] = ['type' => 'centre_time', 'detail' => $c['name'] . ' meets ' . tt_hhmm($win[0]) . '–' . tt_hhmm($win[1]) . '; this slot runs outside those hours'];
        }
    }
    return $out;
}

/** admin.timetable.list — the timetable, scoped, with the clashes already in it. */
function admin_timetable_list(array $p): array {
    $g = admin_cap_gate_any($p, ['club', 'people', 'curriculum', 'checkin']); if (!$g['ok']) return $g;
    [$centres, $vol] = tt_lookups();
    $scope = admin_centre_names_in_scope($g['requester']);
    $allowed = static fn($cid) => $scope === null || in_array((string)($centres[$cid]['name'] ?? ''), $scope, true);
    $all = db_all("SELECT * FROM timetable_slots WHERE status = 'active' ORDER BY weekday, startTime, course");
    $want = (string)($p['centreId'] ?? '');
    $rows = [];
    foreach ($all as $r) {
        if (!$allowed((string)$r['centreId']) || ($want !== '' && (string)$r['centreId'] !== $want)) continue;
        $rows[] = tt_public_slot($r, $centres, $vol) + ['clashes' => tt_clashes($r, $all, $centres, $vol)];
    }
    $centreList = [];
    // The timetable is the Club's: a Summer-only venue is not on it.
    foreach ($centres as $cid => $c) if ((string)$c['status'] !== 'retired' && $allowed($cid) && centre_serves($c, 'ngg')) {
        $centreList[] = ['centreId' => $cid, 'name' => (string)$c['name'], 'slug' => (string)($c['slug'] ?? ''), 'meetDays' => (string)$c['meetDays'], 'meetTime' => (string)$c['meetTime']];
    }
    usort($centreList, static fn($x, $y) => strcasecmp($x['name'], $y['name']));
    /* The Club's volunteers first. Summer-only volunteers are still listed,
       labelled: everybody who signed up before the programme choice existed
       carries 'summer' by default, and hiding them would empty the list on a
       deployment whose Club instructors all predate it. */
    $instructors = array_map(static fn($v) => ['volunteerId' => (string)$v['volunteerId'], 'fullName' => (string)$v['fullName'], 'courses' => (string)$v['courses'],
            'programme' => (string)($v['programme'] ?? ''), 'summerOnly' => (string)($v['programme'] ?? 'summer') === 'summer'],
        db_all("SELECT volunteerId, fullName, courses, programme FROM volunteers WHERE status = 'active' AND role IN ('instructor','mentor','volunteer') ORDER BY fullName"));
    usort($instructors, static fn($a, $b) => ($a['summerOnly'] <=> $b['summerOnly']) ?: strcasecmp($a['fullName'], $b['fullName']));
    return ['ok' => true, 'slots' => $rows, 'centres' => $centreList, 'courses' => tt_courses(), 'instructors' => $instructors,
            'days' => TT_DAYS, 'scoped' => $scope !== null, 'canEdit' => admin_cap_gate($p, 'club')['ok'],
            'clashCount' => count(array_filter($rows, static fn($r) => $r['clashes']))];
}

/** admin.timetable.save — add or change one slot. Refused, with the reasons, on any clash. */
function admin_timetable_save(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    [$centres, $vol] = tt_lookups();
    $cid = (string)($d['centreId'] ?? '');
    $c = $centres[$cid] ?? null;
    if (!$c || (string)$c['status'] === 'retired') return ['ok' => false, 'error' => 'bad_centre', 'detail' => 'Choose an active centre.'];
    if (!admin_centre_allowed($g['requester'], (string)$c['name'])) return ['ok' => false, 'error' => 'out_of_scope'];
    if (!centre_serves($c, 'ngg')) return ['ok' => false, 'error' => 'centre_not_ngg', 'detail' => $c['name'] . ' is marked as a Summer School venue only. Mark it as running the NGG Club under People → Centres first.'];
    $course = trim((string)($d['course'] ?? ''));
    $canon = null; foreach (tt_courses() as $k) if (strcasecmp($k, $course) === 0) $canon = $k;
    if ($canon === null) return ['ok' => false, 'error' => 'unknown_course', 'detail' => 'Choose a course from the NGG Club course list (Curriculum → Courses).'];
    $wd = (int)($d['weekday'] ?? 0);
    if (!isset(TT_DAYS[$wd])) return ['ok' => false, 'error' => 'bad_day'];
    $a = tt_minutes((string)($d['startTime'] ?? '')); $b = tt_minutes((string)($d['endTime'] ?? ''));
    if ($a === null || $b === null) return ['ok' => false, 'error' => 'bad_time', 'detail' => 'Times are 24-hour, like 10:00 and 12:30.'];
    if ($b <= $a) return ['ok' => false, 'error' => 'bad_time', 'detail' => 'It has to end after it starts.'];
    if ($b - $a > 8 * 60) return ['ok' => false, 'error' => 'bad_time', 'detail' => 'A slot can be at most 8 hours.'];
    $ins = trim((string)($d['instructorId'] ?? ''));
    if ($ins !== '' && !isset($vol[$ins])) return ['ok' => false, 'error' => 'bad_instructor'];
    $id = (string)($d['slotId'] ?? '');
    $existing = $id !== '' ? db_row("SELECT * FROM timetable_slots WHERE slotId = ? AND status = 'active'", [$id]) : null;
    if ($id !== '' && !$existing) return ['ok' => false, 'error' => 'not_found'];
    if ($existing && !admin_centre_allowed($g['requester'], (string)($centres[(string)$existing['centreId']]['name'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    if (!$existing && (int)db_row("SELECT COUNT(*) c FROM timetable_slots WHERE centreId = ? AND status = 'active'", [$cid])['c'] >= TT_MAX_PER_CENTRE) {
        return ['ok' => false, 'error' => 'too_many', 'detail' => 'A centre holds at most ' . TT_MAX_PER_CENTRE . ' slots.'];
    }
    $row = ['slotId' => $existing ? $id : 'TT-' . strtoupper(rand_hex(5)), 'centreId' => $cid, 'course' => $canon,
            'level' => mb_substr(trim((string)($d['level'] ?? '')), 0, 60), 'weekday' => $wd,
            'startTime' => tt_hhmm($a), 'endTime' => tt_hhmm($b), 'room' => mb_substr(trim((string)($d['room'] ?? '')), 0, 80),
            'instructorId' => $ins, 'note' => mb_substr(trim((string)($d['note'] ?? '')), 0, 400), 'status' => 'active'];
    $clashes = tt_clashes($row, db_all("SELECT * FROM timetable_slots WHERE status = 'active' AND weekday = ?", [$wd]), $centres, $vol);
    if ($clashes) return ['ok' => false, 'error' => 'clash', 'clashes' => $clashes,
                          'detail' => 'Not saved — it clashes: ' . implode('; ', array_column($clashes, 'detail')) . '.'];
    $by = (string)$g['requester']['memberId'];
    if ($existing) db_update('timetable_slots', $row + ['updatedAt' => now_iso(), 'updatedBy' => $by], ['slotId' => $id]);
    else db_insert('timetable_slots', $row + ['createdAt' => now_iso(), 'updatedAt' => now_iso(), 'updatedBy' => $by]);
    audit('timetable.' . ($existing ? 'update' : 'create'), $by, $row['slotId'],
          ['centre' => (string)$c['name'], 'course' => $canon, 'when' => TT_DAYS[$wd] . ' ' . $row['startTime'] . '–' . $row['endTime']], (string)($p['ip'] ?? ''));
    cache_invalidate('timetable');
    return ['ok' => true, 'slot' => tt_public_slot($row, $centres, $vol)];
}

/** admin.timetable.remove — take slots off the timetable. Per-row scope, one audit event. */
function admin_timetable_remove(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['slotIds'] ?? null) ? $p['slotIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'no_ids'];
    if (count($ids) > TT_REMOVE_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . TT_REMOVE_MAX . ' at a time.'];
    [$centres] = tt_lookups();
    $results = []; $done = 0;
    foreach ($ids as $id) {
        $r = db_row('SELECT * FROM timetable_slots WHERE slotId = ?', [$id]);
        if (!$r || (string)$r['status'] !== 'active') { $results[] = ['id' => $id, 'ok' => false, 'error' => $r ? 'unchanged' : 'not_found']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)($centres[(string)$r['centreId']]['name'] ?? ''))) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        db_update('timetable_slots', ['status' => 'removed', 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']], ['slotId' => $id]);
        $results[] = ['id' => $id, 'ok' => true]; $done++;
    }
    audit('timetable.remove', (string)$g['requester']['memberId'], (string)$done, ['count' => $done, 'refused' => count($ids) - $done], (string)($p['ip'] ?? ''));
    if ($done) cache_invalidate('timetable');
    return ['ok' => true, 'done' => $done, 'results' => $results];
}

/** A centre's active slots, shaped for a member, a parent or the public. */
function tt_for_centre(string $centreName, bool $withInstructor, string $highlightCourse = ''): array {
    [$centres, $vol] = tt_lookups();
    $cid = null; foreach ($centres as $id => $c) if (strcasecmp((string)$c['name'], trim($centreName)) === 0) $cid = $id;
    if ($cid === null) return ['centre' => $centreName, 'slots' => [], 'meetDays' => '', 'meetTime' => ''];
    $slots = array_map(static fn($r) => tt_public_slot($r, $centres, $vol, $withInstructor)
                       + ['mine' => $highlightCourse !== '' && strcasecmp((string)$r['course'], $highlightCourse) === 0],
        db_all("SELECT * FROM timetable_slots WHERE centreId = ? AND status = 'active' ORDER BY weekday, startTime, course", [$cid]));
    // The slug opens the public timetable maker on this centre's week (?centre=).
    return ['centre' => (string)$centres[$cid]['name'], 'slug' => (string)($centres[$cid]['slug'] ?? ''), 'meetDays' => (string)$centres[$cid]['meetDays'], 'meetTime' => (string)$centres[$cid]['meetTime'], 'slots' => $slots];
}

/** member.timetable — the member's own centre, their course marked. */
function member_timetable(array $p): array {
    $m = db_row('SELECT memberId, centre, track FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'course' => (string)($m['track'] ?? '')] + tt_for_centre((string)($m['centre'] ?? ''), true, (string)($m['track'] ?? ''));
}

/**
 * public.timetable — a published centre's timetable, by slug; with no slug,
 * the list of centres that have one. Instructor names are left out: a public
 * page saying which adult is in which room with which children, when, is not
 * something to publish.
 */
function public_timetable(array $p): array {
    $slug = (string)($p['slug'] ?? '');
    [$centres] = tt_lookups();
    $withSlots = array_flip(array_column(db_all("SELECT DISTINCT centreId FROM timetable_slots WHERE status = 'active'"), 'centreId'));
    $list = [];
    foreach ($centres as $cid => $c) {
        if ((string)$c['status'] === 'retired' || !isset($withSlots[$cid]) || (string)($c['slug'] ?? '') === '' || !centre_serves($c, 'ngg')) continue;
        $list[] = ['slug' => (string)$c['slug'], 'name' => (string)$c['name']];
    }
    usort($list, static fn($x, $y) => strcasecmp($x['name'], $y['name']));
    if ($slug === '') return ['ok' => true, 'centres' => $list];
    foreach ($centres as $c) {
        if ((string)($c['slug'] ?? '') === $slug && (string)$c['status'] !== 'retired') {
            return ['ok' => true, 'centres' => $list] + tt_for_centre((string)$c['name'], false);
        }
    }
    return ['ok' => false, 'error' => 'not_found'];
}

/** How many active slots a centre has — for the "centre in use" count when deleting one. */
function tt_centre_uses(string $centreId): int {
    return (int)(db_row("SELECT COUNT(*) c FROM timetable_slots WHERE centreId = ? AND status = 'active'", [$centreId])['c'] ?? 0);
}

/* ══ Personal timetables (the public Timetable Maker, v5) ════════════════════
 *
 * A personal timetable is somebody's own week — school lessons, study, chores
 * and the NGG sessions they copied in — and it is never the Club's
 * timetable_slots. A member keeps one in member_timetables; anybody else keeps
 * one behind an emailed link (timetable_links, the token stored hashed).
 *
 * Everything is validated here, not trusted from the browser: the maker keeps
 * its own copy in localStorage, and whatever arrives is the visitor's own data
 * but may have been hand-edited.
 */

const TT_PERSONAL_MAX_ENTRIES = 120;
const TT_PERSONAL_MAX_WEEKS = 52;
const TT_PERSONAL_KINDS = ['class', 'study', 'activity', 'break'];
const TT_LINK_DAYS = 30;

/** One entry, cleaned, or a reason it is refused. */
function tt_personal_entry($x, bool $once): array {
    if (!is_array($x)) return ['ok' => false, 'error' => 'bad_entry'];
    $title = trim((string)($x['title'] ?? ''));
    $place = trim((string)($x['place'] ?? ''));
    $start = (string)($x['start'] ?? ''); $end = (string)($x['end'] ?? '');
    if ($title === '' || mb_strlen($title) > 60) return ['ok' => false, 'error' => 'bad_title'];
    if (mb_strlen($place) > 60) return ['ok' => false, 'error' => 'bad_place'];
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $start) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $end) || $end <= $start) return ['ok' => false, 'error' => 'bad_time'];
    $days = array_values(array_unique(array_map('intval', is_array($x['days'] ?? null) ? $x['days'] : [])));
    sort($days);
    if (!$days || min($days) < 1 || max($days) > 7) return ['ok' => false, 'error' => 'bad_days'];
    $kind = (string)($x['kind'] ?? 'class');
    if (!in_array($kind, TT_PERSONAL_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $e = ['id' => substr(preg_replace('/[^\w-]/', '', (string)($x['id'] ?? '')) ?: bin2hex(random_bytes(4)), 0, 16),
          'title' => $title, 'days' => $once ? [$days[0]] : $days, 'start' => $start, 'end' => $end, 'place' => $place,
          'color' => max(0, min(7, (int)($x['color'] ?? 0))), 'kind' => $kind];
    if (!empty($x['official'])) { $e['official'] = true; $e['source'] = mb_substr((string)($x['source'] ?? ''), 0, 40); $e['mine'] = !empty($x['mine']); }
    if ($once) $e['once'] = true;
    return ['ok' => true, 'entry' => $e];
}

/** A whole timetable { settings, entries, exceptions } → ['ok', 'doc'] or ['ok' => false, 'error']. */
function tt_personal_clean(array $p): array {
    $entries = $p['entries'] ?? null; $ex = $p['exceptions'] ?? [];
    $set = $p['settings'] ?? null;
    if (!is_array($entries) || !is_array($set)) return ['ok' => false, 'error' => 'bad_timetable'];
    if (count($entries) > TT_PERSONAL_MAX_ENTRIES) return ['ok' => false, 'error' => 'too_many_entries'];
    $clean = [];
    foreach ($entries as $x) { $r = tt_personal_entry($x, false); if (!$r['ok']) return $r; $clean[] = $r['entry']; }
    if (!is_array($ex) || count($ex) > TT_PERSONAL_MAX_WEEKS) return ['ok' => false, 'error' => 'too_many_weeks'];
    $weeks = [];
    foreach ($ex as $k => $w) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$k) || !is_array($w)) return ['ok' => false, 'error' => 'bad_exceptions'];
        $skip = [];
        foreach ((array)($w['skip'] ?? []) as $z => $v) if ($v === true && preg_match('/^[\w-]{1,16}:[1-7]$/', (string)$z)) $skip[(string)$z] = true;
        $once = [];
        foreach (array_slice((array)($w['once'] ?? []), 0, 40) as $x) { $r = tt_personal_entry($x, true); if (!$r['ok']) return $r; $once[] = $r['entry']; }
        if ($skip || $once) $weeks[(string)$k] = ['skip' => (object)$skip, 'once' => $once];
    }
    $s = [];
    foreach (['title' => 60, 'subtitle' => 80, 'note' => 120] as $k => $max) $s[$k] = mb_substr((string)($set[$k] ?? ''), 0, $max);
    foreach (['theme' => ['paper', 'navy', 'kente', 'chalk'], 'look' => ['classic', 'bold', 'minimal', 'notebook', 'editorial'], 'layout' => ['timeline', 'list'],
              'orient' => ['auto', 'landscape', 'portrait'], 'clock' => ['24', '12']] as $k => $allowed) {
        $v = (string)($set[$k] ?? $allowed[0]); $s[$k] = in_array($v, $allowed, true) ? $v : $allowed[0];
    }
    $s['weekStart'] = (int)($set['weekStart'] ?? 1) === 7 ? 7 : 1;
    foreach (['showPlace', 'legend', 'large', 'hideBreaks', 'fold'] as $k) $s[$k] = !empty($set[$k]);
    $mode = (string)($set['mode'] ?? '');
    $s['mode'] = in_array($mode, ['school', 'uni', 'revision', 'routine'], true) ? $mode : null;
    return ['ok' => true, 'doc' => ['settings' => $s, 'entries' => $clean, 'exceptions' => (object)$weeks]];
}

function tt_personal_out(?array $row): ?array {
    if (!$row) return null;
    $d = json_decode((string)$row['doc'], true);
    return is_array($d) ? $d + ['updatedAt' => (string)$row['updatedAt']] : null;
}

/** member.myTimetable — the signed-in member's own timetable, or null. */
function member_my_timetable(array $p): array {
    $id = (string)($p['memberId'] ?? '');
    return ['ok' => true, 'timetable' => tt_personal_out(db_row('SELECT doc, updatedAt FROM member_timetables WHERE memberId = ?', [$id]))];
}

/**
 * member.myTimetable.save — replace it, but only if nobody else saved since
 * the copy the browser started from (baseUpdatedAt). A second tab or the
 * family app writing in between is a conflict to show, not to overwrite.
 */
function member_my_timetable_save(array $p): array {
    $id = (string)($p['memberId'] ?? '');
    if ($id === '' || !db_row('SELECT memberId FROM members WHERE memberId = ?', [$id])) return ['ok' => false, 'error' => 'not_found'];
    $c = tt_personal_clean($p);
    if (!$c['ok']) return $c;
    $cur = db_row('SELECT doc, updatedAt FROM member_timetables WHERE memberId = ?', [$id]);
    $base = (string)($p['baseUpdatedAt'] ?? '');
    if ($cur && $base !== (string)$cur['updatedAt']) return ['ok' => false, 'error' => 'conflict', 'server' => tt_personal_out($cur)];
    $now = now_iso();
    if ($cur && $now <= (string)$cur['updatedAt']) $now = gmdate('Y-m-d\TH:i:s\Z', strtotime((string)$cur['updatedAt']) + 1);
    $json = json_encode($c['doc'], JSON_UNESCAPED_UNICODE);
    if ($cur) db_exec('UPDATE member_timetables SET doc = ?, updatedAt = ? WHERE memberId = ?', [$json, $now, $id]);
    else db_insert('member_timetables', ['memberId' => $id, 'doc' => $json, 'updatedAt' => $now]);
    return ['ok' => true, 'updatedAt' => $now];
}

/**
 * public.timetableSave — a guest's timetable behind a link.
 *   with `email`: a NEW link is minted and emailed (rate-limited per IP at the
 *   route, and here per address: three a day);
 *   with `k`: the timetable behind that live link is replaced (the maker
 *   autosaves through it).
 * The token is 32 random bytes; only its sha256 is stored.
 */
function public_timetable_save(array $p): array {
    $c = tt_personal_clean($p);
    if (!$c['ok']) return $c;
    $json = json_encode($c['doc'], JSON_UNESCAPED_UNICODE);
    $now = now_iso();
    $k = (string)($p['k'] ?? '');
    if ($k !== '') {
        $row = tt_link_row($k);
        if (!$row) return ['ok' => false, 'error' => 'link_expired'];
        db_exec('UPDATE timetable_links SET doc = ?, updatedAt = ? WHERE tokenHash = ?', [$json, $now, hash('sha256', $k)]);
        return ['ok' => true, 'updatedAt' => $now];
    }
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) return ['ok' => false, 'error' => 'bad_email'];
    $day = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
    if ((int)(db_row('SELECT COUNT(*) c FROM timetable_links WHERE email = ? AND createdAt > ?', [$email, $day])['c'] ?? 0) >= 3) {
        return ['ok' => false, 'error' => 'too_many_links'];
    }
    $token = bin2hex(random_bytes(32));
    db_insert('timetable_links', ['tokenHash' => hash('sha256', $token), 'email' => $email, 'doc' => $json, 'createdAt' => $now, 'updatedAt' => $now,
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + TT_LINK_DAYS * 86400), 'revokedAt' => '']);
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/timetable?k=' . $token;
    $title = (string)$c['doc']['settings']['title'];
    $html = email_template([
        'eyebrow' => 'Timetable Maker', 'title' => 'Your timetable: ' . esc_html($title),
        'intro' => 'Open this link on any phone or computer to keep editing. It works for ' . TT_LINK_DAYS . ' days; saving again gives you a fresh one.',
        'ctaLabel' => 'Open my timetable', 'ctaUrl' => $url,
        'footNote' => 'Somebody saved a timetable from nextgengenius.ng with this address. If it was not you, ignore this email and the link will lapse.',
    ]);
    $sent = function_exists('send_mail') ? send_mail($email, 'Your timetable', $html) : false;
    return ['ok' => true, 'k' => $token, 'sent' => (bool)$sent, 'masked' => function_exists('mask_email') ? mask_email($email) : ''];
}

function tt_link_row(string $k): ?array {
    if (!preg_match('/^[a-f0-9]{64}$/', $k)) return null;
    $row = db_row('SELECT * FROM timetable_links WHERE tokenHash = ?', [hash('sha256', $k)]);
    if (!$row || (string)$row['revokedAt'] !== '' || (string)$row['expiresAt'] < now_iso()) return null;
    return $row;
}

/** public.timetableLoad — the timetable behind a live link, or link_expired. */
function public_timetable_load(array $p): array {
    $row = tt_link_row((string)($p['k'] ?? ''));
    if (!$row) return ['ok' => false, 'error' => 'link_expired'];
    return ['ok' => true, 'timetable' => tt_personal_out($row), 'email' => function_exists('mask_email') ? mask_email((string)$row['email']) : ''];
}
