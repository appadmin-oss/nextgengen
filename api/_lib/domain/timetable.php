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
    $all = function_exists('curriculum_courses') ? curriculum_courses() : (function_exists('academy_courses') ? academy_courses() : []);
    // Chess is taught in every division, so it is in no one division's catalogue.
    foreach ($all as $c) if (strcasecmp((string)$c, 'Chess') === 0) return $all;
    array_unshift($all, 'Chess');
    return $all;
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
/** $mine: the course(s) to mark as the viewer's — a member takes several (curriculum_member_courses). */
function tt_for_centre(string $centreName, bool $withInstructor, string|array $mine = ''): array {
    $mineL = array_values(array_filter(array_map(static fn($c) => mb_strtolower(trim((string)$c)), (array)$mine), static fn($c) => $c !== ''));
    [$centres, $vol] = tt_lookups();
    $cid = null; foreach ($centres as $id => $c) if (strcasecmp((string)$c['name'], trim($centreName)) === 0) $cid = $id;
    if ($cid === null) return ['centre' => $centreName, 'slots' => [], 'meetDays' => '', 'meetTime' => ''];
    $slots = array_map(static fn($r) => tt_public_slot($r, $centres, $vol, $withInstructor)
                       + ['mine' => in_array(mb_strtolower(trim((string)$r['course'])), $mineL, true)],
        db_all("SELECT * FROM timetable_slots WHERE centreId = ? AND status = 'active' ORDER BY weekday, startTime, course", [$cid]));
    // The slug opens the public timetable maker on this centre's week (?centre=).
    return ['centre' => (string)$centres[$cid]['name'], 'slug' => (string)($centres[$cid]['slug'] ?? ''), 'meetDays' => (string)$centres[$cid]['meetDays'], 'meetTime' => (string)$centres[$cid]['meetTime'], 'slots' => $slots];
}

/** member.timetable — the member's own centre, their course marked. */
function member_timetable(array $p): array {
    $m = db_row('SELECT memberId, centre, track, courses, disciplines, division, coursesConfirmedAt FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $courses = function_exists('curriculum_member_courses') ? curriculum_member_courses($m) : [(string)($m['track'] ?? '')];
    $tt = tt_for_centre((string)($m['centre'] ?? ''), true, $courses);
    // The member's own week names who teaches as a child addresses them.
    $titled = staff_public_names(array_column($tt['slots'], 'instructorId'));
    foreach ($tt['slots'] as $i => $sl) if ((string)($sl['instructorId'] ?? '') !== '') $tt['slots'][$i]['instructor'] = $titled[$sl['instructorId']] ?? 'Your instructor';
    /* The division the member's courses are in (the first that is not Chess,
       which every division takes): a placement stored long ago must not name
       Media for a member whose courses are Technology's. */
    $main = array_values(array_filter($courses, static fn($c) => !curriculum_is_everyones((string)$c)));
    $divId = $main && function_exists('nggc_division_for_track') ? nggc_division_for_track((string)$main[0]) : '';
    if ($divId === '' && $main && function_exists('nggc_divisions')) foreach (nggc_divisions() as $dv) if (array_intersect(array_map('mb_strtolower', $dv['courses']), array_map('mb_strtolower', $main))) { $divId = $dv['id']; break; }
    /* No course chosen yet: the division stored on the record, or the one
       the track names ("Tech"), as its NAME. The raw id leaked through and
       the card read "tech · Tech". */
    if ($divId === '' && function_exists('nggc_division_for_track')) {
        foreach ([(string)($m['division'] ?? ''), (string)($m['track'] ?? '')] as $hint) {
            $hint = trim($hint); if ($hint === '') continue;
            if (function_exists('nggc_division') && nggc_division(mb_strtolower($hint))) { $divId = mb_strtolower($hint); break; }
            $divId = nggc_division_for_track($hint); if ($divId !== '') break;
        }
    }
    $div = $divId !== '' && function_exists('nggc_division') ? nggc_division($divId) : null;
    // Proposed courses are shown, and said to be proposed until staff confirm them (course-placement.php).
    $placed = member_courses_of($m) !== [];
    return ['ok' => true, 'course' => (string)($main[0] ?? ''), 'courses' => $main, 'coursesConfirmed' => $placed, 'division' => $div ? (string)$div['name'] : ''] + $tt;
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
