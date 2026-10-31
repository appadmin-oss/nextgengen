<?php
declare(strict_types=1);

/**
 * domain/achievements.php — what a member has done well, and what they have
 * learnt outside NGG.
 *
 * ── ACHIEVEMENTS ARE WORKED OUT, NOT TYPED (owner, 31 Oct 2026) ─────────────
 * NGG records best performance and consistency, not only fines; a member's
 * record showed the fines and not the rest. Everything here is derived from
 * records that already exist — attendance, sign-outs, lessons, check scores,
 * stars — so it cannot drift from them, plus the recognitions staff give by
 * hand (the `awards` table, with a category). Nothing is stored that the
 * records can answer.
 *
 * A streak counts PROGRAMME days. A day the member was away with permission,
 * or a day nobody was counted (a held day, before the rules applied), neither
 * adds to it nor breaks it: only a live absence on the record breaks it, so a
 * child is never told their streak ended because the gate was down.
 *
 * ── LEARNING OUTSIDE NGG ──────────────────────────────────────────────────
 * Some members learn on other sites and apps. They log it themselves — what,
 * where, how far, with a video, screenshots or pictures and notes — and an
 * instructor or a curriculum admin confirms it or sends it back with a note.
 * A platform's own progress report can be brought in for a class at once: its
 * rows are matched to members by printed ID, then by name, and arrive
 * confirmed (the platform is the evidence). Only CONFIRMED entries count
 * towards hours and achievements.
 */

const ACH_ATTEND_STEPS = [10, 25, 50, 100, 200];
const ACH_LESSON_STEPS = [5, 10, 25, 50, 100];
const ACH_STREAK_STEPS = [4, 8, 12, 24];
const ACH_CATEGORIES = ['academic' => 'Academic', 'consistency' => 'Consistency', 'conduct' => 'Conduct', 'leadership' => 'Leadership',
    'creativity' => 'Creativity', 'service' => 'Service', 'sport' => 'Sport', 'other' => 'Other'];
const LLOG_STATUSES = ['pending', 'confirmed', 'returned'];
const LLOG_MEDIA_MAX = 8;
const LLOG_IMPORT_MAX = 1000;

/** The next step of a ladder above $n, or 0 past the top. */
function ach_next_step(int $n, array $steps): int { foreach ($steps as $s) if ($n < $s) return $s; return 0; }
/** The highest step of a ladder reached by $n, or 0. */
function ach_reached(int $n, array $steps): int { $r = 0; foreach ($steps as $s) if ($n >= $s) $r = $s; return $r; }

/**
 * Attendance, worked out over the last year of programme days: days attended,
 * full days (signed out), on time, and the current and best streaks.
 */
function ach_attendance(array $m): array {
    $id = (string)$m['memberId'];
    $today = attendance_today();
    $yday = gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') - 86400);
    $from = gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') - 365 * 86400);
    $rows = db_all('SELECT date, status, checkOutAt FROM attendance WHERE studentId = ? AND date >= ? ORDER BY date', [$id, $from]);
    $came = [];
    foreach ($rows as $r) $came[(string)$r['date']] = $r;
    $out = ['days' => count($came), 'fullDays' => 0, 'onTime' => 0, 'streak' => 0, 'bestStreak' => 0, 'onTimeStreak' => 0, 'bestOnTimeStreak' => 0];
    foreach ($came as $r) {
        if ((string)($r['checkOutAt'] ?? '') !== '') $out['fullDays']++;
        if (!in_array((string)$r['status'], ['late', 'tardy'], true)) $out['onTime']++;
    }
    // Streaks: the programme's own days, broken only by an absence on the record.
    $cal = function_exists('member_calendar_for') ? member_calendar_for($m) : ['enabled' => false];
    $days = !empty($cal['enabled']) ? programme_days_between(max($from, (string)($cal['startDate'] ?? $from)), $yday, $cal) : array_keys($came);
    $absent = array_column(db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'absence' AND date >= ? AND (voidedAt IS NULL OR voidedAt = '')", [$id, $from]), 'date', 'date');
    $cur = 0; $onT = 0;
    foreach ($days as $d) {
        if (isset($came[$d])) {
            $cur++; $out['bestStreak'] = max($out['bestStreak'], $cur);
            if (!in_array((string)$came[$d]['status'], ['late', 'tardy'], true)) { $onT++; $out['bestOnTimeStreak'] = max($out['bestOnTimeStreak'], $onT); } else $onT = 0;
        } elseif (isset($absent[$d])) {
            $cover = function_exists('member_absence_cover') ? member_absence_cover($id, $d) : '';
            if (!in_array($cover, ['approved', 'academic'], true)) { $cur = 0; $onT = 0; }
        }
    }
    $out['streak'] = $cur; $out['onTimeStreak'] = $onT;
    return $out;
}

/** Lessons: completed, best score, full marks — from curriculum_progress. */
function ach_learning(string $id): array {
    $r = db_row("SELECT COUNT(CASE WHEN status = 'completed' THEN 1 END) done, MAX(bestPct) best,
                        COUNT(CASE WHEN bestPct >= 100 AND attempts > 0 THEN 1 END) perfect
                 FROM curriculum_progress WHERE memberId = ?", [$id]) ?: [];
    $o = db_row("SELECT COUNT(*) n, COALESCE(SUM(hours),0) h FROM learning_log WHERE memberId = ? AND status = 'confirmed'", [$id]) ?: [];
    return ['lessons' => (int)($r['done'] ?? 0), 'bestPct' => (int)($r['best'] ?? 0), 'perfect' => (int)($r['perfect'] ?? 0),
            'outside' => (int)($o['n'] ?? 0), 'outsideHours' => round((float)($o['h'] ?? 0), 1)];
}

/**
 * Top three at their centre, this month and last: by days attended, and by
 * lessons completed. Two grouped queries per month for the whole centre —
 * never one per member.
 */
function ach_centre_ranks(array $m): array {
    $centre = (string)($m['centre'] ?? '');
    if ($centre === '') return [];
    $id = (string)$m['memberId'];
    $today = attendance_today();
    $out = [];
    foreach ([0, 1] as $back) {
        $first = gmdate('Y-m-01', (int)strtotime(substr($today, 0, 7) . "-01 00:00:00 UTC -$back month"));
        $last = gmdate('Y-m-t', (int)strtotime($first . ' 00:00:00 UTC'));
        $label = gmdate('F Y', (int)strtotime($first . ' 00:00:00 UTC'));
        $att = db_all("SELECT a.studentId k, COUNT(DISTINCT a.date) n FROM attendance a JOIN members m ON m.memberId = a.studentId
                       WHERE m.centre = ? AND m.type = 'NGG' AND m.status = 'active' AND a.date >= ? AND a.date <= ?
                       GROUP BY a.studentId ORDER BY n DESC LIMIT 20", [$centre, $first, $last]);
        $les = db_all("SELECT p.memberId k, COUNT(*) n FROM curriculum_progress p JOIN members m ON m.memberId = p.memberId
                       WHERE m.centre = ? AND m.type = 'NGG' AND m.status = 'active' AND p.status = 'completed' AND p.completedAt >= ? AND p.completedAt <= ?
                       GROUP BY p.memberId ORDER BY n DESC LIMIT 20", [$centre, $first, $last . 'T23:59:59Z']);
        foreach ([['attendance', $att, 'days attended'], ['lessons', $les, 'lessons completed']] as [$what, $rows, $words]) {
            $place = ach_place($rows, $id);
            if ($place) $out[] = ['kind' => $what, 'place' => $place, 'month' => $label, 'words' => $words];
        }
    }
    return $out;
}

/** Dense rank (ties share a place) of $id in rows sorted by n desc; 1–3, or 0. */
function ach_place(array $rows, string $id): int {
    $place = 0; $prev = null;
    foreach ($rows as $r) {
        $n = (int)$r['n']; if ($n <= 0) break;
        if ($n !== $prev) { $place++; $prev = $n; }
        if ($place > 3) return 0;
        if ((string)$r['k'] === $id) return $place;
    }
    return 0;
}

/**
 * Everything a member has done well, as lines: [{icon, t, s, kind}], newest
 * meaning first — recognitions given by staff, then centre places, then the
 * milestones reached — and the next goals within reach.
 */
function member_achievements_for(array $m): array {
    $id = (string)$m['memberId'];
    $a = ach_attendance($m);
    $l = ach_learning($id);
    $stars = (int)(db_row("SELECT COALESCE(SUM(stars),0) n FROM member_stars WHERE subjectId = ?", [$id])['n'] ?? 0);
    $items = [];
    foreach (db_all("SELECT awardId, name, category, period, note, mintedAt FROM awards WHERE subjectId = ? ORDER BY mintedAt DESC LIMIT 40", [$id]) as $w) {
        $cat = ACH_CATEGORIES[(string)($w['category'] ?? '')] ?? '';
        $items[] = ['kind' => 'award', 'icon' => 'trophy', 'awardId' => (string)$w['awardId'], 't' => (string)$w['name'],
            's' => implode(' · ', array_filter([$cat, (string)$w['period'], (string)$w['note']]))];
    }
    $ord = [1 => '1st', 2 => '2nd', 3 => '3rd'];
    foreach (ach_centre_ranks($m) as $r) {
        $items[] = ['kind' => 'place', 'icon' => $r['kind'] === 'attendance' ? 'medal' : 'star', 't' => $ord[$r['place']] . ' at ' . $m['centre'] . ' for ' . $r['words'],
            's' => $r['month']];
    }
    $step = function (int $n, array $steps, string $icon, string $what) use (&$items) {
        $hit = ach_reached($n, $steps);
        if ($hit) $items[] = ['kind' => 'milestone', 'icon' => $icon, 't' => $hit . ' ' . $what, 's' => 'Reached'];
    };
    $step($a['days'], ACH_ATTEND_STEPS, 'calendar-check', 'days attended');
    $step($a['bestStreak'], ACH_STREAK_STEPS, 'fire', 'sessions in a row');
    $step($a['bestOnTimeStreak'], ACH_STREAK_STEPS, 'clock', 'sessions on time in a row');
    $step($l['lessons'], ACH_LESSON_STEPS, 'graduation-cap', 'lessons completed');
    if ($l['perfect'] > 0) $items[] = ['kind' => 'milestone', 'icon' => 'target', 't' => 'Full marks on ' . $l['perfect'] . ' lesson' . ($l['perfect'] === 1 ? '' : 's'), 's' => 'Best score ' . $l['bestPct'] . '%'];
    if ($l['outside'] > 0) $items[] = ['kind' => 'milestone', 'icon' => 'globe', 't' => $l['outside'] . ' confirmed outside learning' . ($l['outsideHours'] > 0 ? ' · ' . $l['outsideHours'] . ' hours' : ''), 's' => 'Learning outside NGG'];
    if ($stars > 0) $items[] = ['kind' => 'milestone', 'icon' => 'star', 't' => $stars . ' star' . ($stars === 1 ? '' : 's') . ' from instructors', 's' => 'Given in class'];

    $next = [];
    if ($n = ach_next_step($a['days'], ACH_ATTEND_STEPS)) $next[] = ['icon' => 'calendar-check', 't' => ($n - $a['days']) . ' more days to ' . $n . ' days attended'];
    if ($n = ach_next_step($a['streak'], ACH_STREAK_STEPS)) $next[] = ['icon' => 'fire', 't' => ($n - $a['streak']) . ' more in a row to a ' . $n . '-session streak'];
    if ($n = ach_next_step($l['lessons'], ACH_LESSON_STEPS)) $next[] = ['icon' => 'graduation-cap', 't' => ($n - $l['lessons']) . ' more lessons to ' . $n];

    return ['ok' => true, 'items' => $items, 'next' => array_slice($next, 0, 3),
        'stats' => ['days' => $a['days'], 'fullDays' => $a['fullDays'], 'onTime' => $a['onTime'], 'streak' => $a['streak'], 'bestStreak' => $a['bestStreak'],
                    'lessons' => $l['lessons'], 'bestPct' => $l['bestPct'], 'outside' => $l['outside'], 'outsideHours' => $l['outsideHours'], 'stars' => $stars]];
}

/** member.achievements — the member's own. */
function member_achievements(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return member_achievements_for($m);
}

/** admin.members.achievements — any member in the requester's centres. */
function admin_member_achievements(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'curriculum', 'club']); if (!$g['ok']) return $g;   // a read
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    return member_achievements_for($m) + ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName']];
}

/** admin.members.award.add — a recognition given by staff (academic, consistency, …). */
function admin_member_award_add(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $m = db_row('SELECT memberId, centre FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    $name = trim(mb_substr((string)($p['name'] ?? ''), 0, 120));
    $cat = (string)($p['category'] ?? 'other');
    if ($name === '') return ['ok' => false, 'error' => 'name_required', 'detail' => 'Say what it is for.'];
    if (!isset(ACH_CATEGORIES[$cat])) $cat = 'other';
    $id = 'AWD-' . strtoupper(rand_hex(5));
    db_insert('awards', ['awardId' => $id, 'subjectId' => (string)$m['memberId'], 'subjectType' => 'member', 'name' => $name, 'category' => $cat,
        'tier' => 0, 'valueNaira' => 0, 'period' => trim(mb_substr((string)($p['period'] ?? ''), 0, 60)), 'centre' => (string)($m['centre'] ?? ''),
        'note' => trim(mb_substr((string)($p['note'] ?? ''), 0, 240)), 'eligibilityStatus' => 'eligible', 'mintedAt' => now_iso(),
        'createdBy' => (string)$g['requester']['memberId']]);
    audit('member.award.add', (string)$g['requester']['memberId'], (string)$m['memberId'], ['awardId' => $id, 'category' => $cat, 'name' => $name], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'awardId' => $id];
}

/** admin.members.award.remove — a recognition given in error. */
function admin_member_award_remove(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $w = db_row("SELECT * FROM awards WHERE awardId = ? AND subjectType = 'member' LIMIT 1", [(string)($p['awardId'] ?? '')]);
    if (!$w) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($w['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    db_exec('DELETE FROM awards WHERE id = ?', [(int)$w['id']]);
    audit('member.award.remove', (string)$g['requester']['memberId'], (string)$w['subjectId'], ['awardId' => (string)$w['awardId'], 'name' => (string)$w['name']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Learning outside NGG ────────────────────────────────────────────────────

/** An https link, or a path on this site; nothing else is kept. */
function llog_url(string $u): string {
    $u = trim($u);
    if (preg_match('#^https://[^\s<>"]{3,800}$#i', $u)) return $u;
    if (preg_match('#^/[A-Za-z0-9/_.?=&%-]{1,400}$#', $u) && !str_contains($u, '..')) return $u;
    return '';
}

/** Media: [{url, kind}] — image | video | pdf | file, at most LLOG_MEDIA_MAX. */
function llog_media($in): array {
    $out = [];
    foreach ((array)$in as $x) {
        $url = llog_url((string)(is_array($x) ? ($x['url'] ?? '') : $x));
        if ($url === '') continue;
        $k = is_array($x) ? (string)($x['kind'] ?? '') : '';
        if (!in_array($k, ['image', 'video', 'pdf', 'file'], true)) $k = preg_match('/\.(mp4|mov|webm|m4v)(\?|$)/i', $url) ? 'video' : (preg_match('/\.pdf(\?|$)/i', $url) ? 'pdf' : 'image');
        $out[] = ['url' => $url, 'kind' => $k];
        if (count($out) >= LLOG_MEDIA_MAX) break;
    }
    return $out;
}

function llog_public(array $r): array {
    return ['entryId' => (string)$r['entryId'], 'memberId' => (string)$r['memberId'], 'platform' => (string)$r['platform'], 'providerId' => (string)$r['providerId'],
        'title' => (string)$r['title'], 'progress' => (string)$r['progress'], 'hours' => (float)$r['hours'], 'doneOn' => (string)$r['doneOn'],
        'link' => (string)$r['link'], 'media' => json_decode((string)($r['mediaJson'] ?: '[]'), true) ?: [], 'notes' => (string)$r['notes'],
        'source' => (string)$r['source'], 'status' => (string)$r['status'], 'reviewNote' => (string)$r['reviewNote'], 'reviewedAt' => (string)$r['reviewedAt'],
        'createdAt' => (string)$r['createdAt']];
}

/** One entry, cleaned. Errors as {error, detail}. */
function llog_clean(array $d): array {
    $title = trim(mb_substr((string)($d['title'] ?? ''), 0, 200));
    $platform = trim(mb_substr((string)($d['platform'] ?? ''), 0, 120));
    if ($title === '') return ['error' => 'title_required', 'detail' => 'Say what you learnt or made.'];
    if ($platform === '') return ['error' => 'platform_required', 'detail' => 'Say where: the website, app or place.'];
    $done = trim((string)($d['doneOn'] ?? ''));
    if ($done !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $done)) return ['error' => 'bad_date', 'detail' => 'Use a date like 2026-10-31.'];
    if ($done === '') $done = attendance_today();
    if ($done > attendance_today()) return ['error' => 'bad_date', 'detail' => 'That date has not happened yet.'];
    $media = llog_media($d['media'] ?? []);
    $link = llog_url((string)($d['link'] ?? ''));
    $notes = trim(mb_substr((string)($d['notes'] ?? ''), 0, 2000));
    if (!$media && $link === '' && mb_strlen($notes) < 20) return ['error' => 'evidence_required', 'detail' => 'Add a video, a screenshot or a picture, a link, or a few lines about what you did.'];
    $prov = trim((string)($d['providerId'] ?? ''));
    if ($prov !== '' && !db_row('SELECT 1 x FROM providers WHERE providerId = ? LIMIT 1', [$prov])) $prov = '';
    return ['title' => $title, 'platform' => $platform, 'providerId' => $prov, 'progress' => trim(mb_substr((string)($d['progress'] ?? ''), 0, 120)),
        'hours' => max(0, min(500, round((float)($d['hours'] ?? 0), 1))), 'doneOn' => $done, 'link' => $link,
        'mediaJson' => json_encode($media, JSON_UNESCAPED_SLASHES), 'notes' => $notes];
}

/** member.learning.log — the member's own entries, newest first. */
function member_learning_log(array $p): array {
    $id = (string)($p['memberId'] ?? '');
    $rows = db_all('SELECT * FROM learning_log WHERE memberId = ? ORDER BY doneOn DESC, id DESC LIMIT 200', [$id]);
    $prov = array_map(static fn($r) => ['providerId' => (string)$r['providerId'], 'name' => (string)$r['name']],
        db_all("SELECT providerId, name FROM providers WHERE status = 'active' ORDER BY name LIMIT 100"));
    return ['ok' => true, 'entries' => array_map('llog_public', $rows), 'providers' => $prov];
}

/** member.learning.add — log something learnt outside NGG; it waits for an instructor. */
function member_learning_add(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'ngg_only'];
    $v = llog_clean((array)($p['data'] ?? []));
    if (isset($v['error'])) return ['ok' => false] + $v;
    $n = (int)(db_row("SELECT COUNT(*) c FROM learning_log WHERE memberId = ? AND createdAt >= ?", [(string)$m['memberId'], gmdate('Y-m-d\TH:i:s\Z', time() - 86400)])['c'] ?? 0);
    if ($n >= 20) return ['ok' => false, 'error' => 'too_many', 'detail' => 'That is twenty today. Add the rest tomorrow.'];
    $id = new_id('LRN', 'learning_log', 'entryId');
    db_insert('learning_log', $v + ['entryId' => $id, 'memberId' => (string)$m['memberId'], 'centre' => (string)($m['centre'] ?? ''),
        'source' => 'member', 'status' => 'pending', 'createdBy' => (string)$m['memberId'], 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    audit('learning.log.add', (string)$m['memberId'], $id, ['platform' => $v['platform']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'entry' => llog_public(db_row('SELECT * FROM learning_log WHERE entryId = ?', [$id]))];
}

/** member.learning.remove — their own entry, while nobody has confirmed it. */
function member_learning_remove(array $p): array {
    $r = db_row('SELECT * FROM learning_log WHERE entryId = ? AND memberId = ? LIMIT 1', [(string)($p['entryId'] ?? ''), (string)($p['memberId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['status'] === 'confirmed') return ['ok' => false, 'error' => 'confirmed', 'detail' => 'An instructor has confirmed this, so it stays on your record.'];
    db_exec('DELETE FROM learning_log WHERE id = ?', [(int)$r['id']]);
    return ['ok' => true];
}

/** admin.learning.list — entries in the requester's centres, by status. */
function admin_learning_list(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'people']); if (!$g['ok']) return $g;   // a read
    $status = in_array((string)($p['status'] ?? 'pending'), LLOG_STATUSES, true) ? (string)$p['status'] : 'pending';
    $where = 'l.status = ?'; $args = [$status];
    $centres = admin_centre_names_in_scope($g['requester']);
    if ($centres !== null) {
        if (!$centres) return ['ok' => true, 'entries' => [], 'counts' => array_fill_keys(LLOG_STATUSES, 0)];
        $where .= ' AND l.centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')'; $args = array_merge($args, $centres);
    }
    if (($mid = trim((string)($p['memberId'] ?? ''))) !== '') { $where .= ' AND l.memberId = ?'; $args[] = $mid; }
    $rows = db_all("SELECT l.*, m.fullName, m.displayId FROM learning_log l LEFT JOIN members m ON m.memberId = l.memberId WHERE $where ORDER BY l.createdAt DESC LIMIT 300", $args);
    $counts = array_fill_keys(LLOG_STATUSES, 0);
    $cw = $centres !== null ? ' WHERE centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')' : '';
    foreach (db_all("SELECT status, COUNT(*) c FROM learning_log$cw GROUP BY status", $centres ?? []) as $c) $counts[(string)$c['status']] = (int)$c['c'];
    return ['ok' => true, 'status' => $status, 'counts' => $counts,
        'entries' => array_map(static fn($r) => llog_public($r) + ['fullName' => (string)($r['fullName'] ?? ''), 'displayId' => (string)($r['displayId'] ?? ''), 'centre' => (string)$r['centre']], $rows)];
}

/** admin.learning.review — confirm, or send back with a note the member reads. */
function admin_learning_review(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map('strval', (array)($p['entryIds'] ?? [])))));
    $to = (string)($p['decision'] ?? '');
    if (!in_array($to, ['confirmed', 'returned'], true)) return ['ok' => false, 'error' => 'bad_decision'];
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 500));
    if ($to === 'returned' && $note === '') return ['ok' => false, 'error' => 'note_required', 'detail' => 'Say what is missing, so they can fix it.'];
    if (!$ids) return ['ok' => false, 'error' => 'nothing_chosen'];
    if (count($ids) > 300) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most 300 at a time.'];
    $results = []; $done = 0;
    foreach ($ids as $id) {
        $r = db_row('SELECT * FROM learning_log WHERE entryId = ? LIMIT 1', [$id]);
        if (!$r) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)$r['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if ((string)$r['status'] === $to) { $results[] = ['id' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        db_update('learning_log', ['status' => $to, 'reviewNote' => $note, 'reviewedBy' => (string)$g['requester']['memberId'], 'reviewedAt' => now_iso(), 'updatedAt' => now_iso()], ['id' => (int)$r['id']]);
        $results[] = ['id' => $id, 'ok' => true]; $done++;
    }
    audit('learning.log.review', (string)$g['requester']['memberId'], '', ['decision' => $to, 'count' => $done, 'refused' => count(array_filter($results, static fn($x) => !$x['ok']))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $done, 'results' => $results];
}

/**
 * admin.learning.import — a platform's progress report, as rows:
 * {id|name, title, platform?, progress?, hours?, doneOn?, notes?}. Matched by
 * printed ID first, then by exact name within the requester's centres; an
 * ambiguous or unknown person is refused by row, never guessed. `apply` false
 * is the check: what would be added, nothing written.
 */
function admin_learning_import(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $rows = array_values((array)($p['rows'] ?? []));
    if (!$rows) return ['ok' => false, 'error' => 'no_rows'];
    if (count($rows) > LLOG_IMPORT_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . LLOG_IMPORT_MAX . ' rows at a time.'];
    $platform = trim(mb_substr((string)($p['platform'] ?? ''), 0, 120));
    $apply = !empty($p['apply']);
    $centres = admin_centre_names_in_scope($g['requester']);
    $members = db_all("SELECT memberId, displayId, fullName, centre FROM members WHERE type = 'NGG' AND status = 'active'");
    $byId = []; $byName = [];
    foreach ($members as $m) {
        if ($centres !== null && !in_array((string)$m['centre'], $centres, true)) continue;
        if ((string)$m['displayId'] !== '') $byId[strtolower((string)$m['displayId'])] = $m;
        $byId[strtolower((string)$m['memberId'])] = $m;
        $byName[mb_strtolower(preg_replace('/\s+/', ' ', trim((string)$m['fullName'])))][] = $m;
    }
    $out = []; $add = 0;
    foreach ($rows as $i => $r) {
        $r = (array)$r;
        $who = null; $key = strtolower(trim((string)($r['id'] ?? '')));
        if ($key !== '' && isset($byId[$key])) $who = $byId[$key];
        if (!$who) {
            $nm = mb_strtolower(preg_replace('/\s+/', ' ', trim((string)($r['name'] ?? ''))));
            $hits = $byName[$nm] ?? [];
            if (count($hits) > 1) { $out[] = ['row' => $i + 1, 'ok' => false, 'error' => 'two_people', 'detail' => 'Two members have that name; use their printed ID.']; continue; }
            $who = $hits[0] ?? null;
        }
        if (!$who) { $out[] = ['row' => $i + 1, 'ok' => false, 'error' => 'no_match', 'detail' => 'Nobody in your centres matches.']; continue; }
        /* The platform's report is the evidence, so a row needs no upload of its own. */
        $note = trim((string)($r['notes'] ?? ''));
        $v = llog_clean(['title' => $r['title'] ?? '', 'platform' => (string)($r['platform'] ?? '') ?: $platform, 'progress' => $r['progress'] ?? '',
            'hours' => $r['hours'] ?? 0, 'doneOn' => $r['doneOn'] ?? '', 'link' => $r['link'] ?? '',
            'notes' => trim($note . ($note !== '' ? ' — ' : '') . 'From the platform’s progress report.')]);
        if (isset($v['error'])) { $out[] = ['row' => $i + 1, 'ok' => false] + $v; continue; }
        // The same thing from the same report twice is one entry.
        if (db_row("SELECT 1 x FROM learning_log WHERE memberId = ? AND source = 'report' AND platform = ? AND title = ? AND doneOn = ? LIMIT 1", [(string)$who['memberId'], $v['platform'], $v['title'], $v['doneOn']])) {
            $out[] = ['row' => $i + 1, 'ok' => true, 'unchanged' => true, 'name' => (string)$who['fullName']]; continue;
        }
        if ($apply) {
            db_insert('learning_log', $v + ['entryId' => new_id('LRN', 'learning_log', 'entryId'), 'memberId' => (string)$who['memberId'], 'centre' => (string)$who['centre'],
                'source' => 'report', 'status' => 'confirmed', 'reviewedBy' => (string)$g['requester']['memberId'], 'reviewedAt' => now_iso(),
                'createdBy' => (string)$g['requester']['memberId'], 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
        }
        $add++;
        $out[] = ['row' => $i + 1, 'ok' => true, 'name' => (string)$who['fullName']];
    }
    if ($apply) audit('learning.import', (string)$g['requester']['memberId'], '', ['platform' => $platform, 'added' => $add, 'refused' => count(array_filter($out, static fn($x) => !$x['ok']))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $apply, 'add' => $add, 'refused' => count(array_filter($out, static fn($x) => !$x['ok'])), 'rows' => $out];
}

/**
 * admin.learning.overview — how each member in the requester's centres is
 * doing: lessons completed, average best score, the last time they learnt
 * anything here, confirmed outside learning and its hours, and attendance over
 * the last 90 days. One grouped query per measure, never one per member.
 */
function admin_learning_overview(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'people']); if (!$g['ok']) return $g;   // a read
    $centres = admin_centre_names_in_scope($g['requester']);
    $where = "type = 'NGG' AND status = 'active'"; $args = [];
    if ($centres !== null) {
        if (!$centres) return ['ok' => true, 'members' => []];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')'; $args = $centres;
    }
    if (($c = trim((string)($p['centre'] ?? ''))) !== '') { $where .= ' AND centre = ?'; $args[] = $c; }
    $ms = db_all("SELECT memberId, displayId, fullName, centre, track FROM members WHERE $where ORDER BY fullName LIMIT 3000", $args);
    $since = gmdate('Y-m-d', (int)strtotime(attendance_today() . ' 00:00:00 UTC') - 90 * 86400);
    $les = []; $att = []; $out = []; $last = [];
    foreach (db_all("SELECT memberId, COUNT(CASE WHEN status = 'completed' THEN 1 END) done, AVG(CASE WHEN attempts > 0 THEN bestPct END) avgPct, MAX(updatedAt) lastAt FROM curriculum_progress GROUP BY memberId") as $r)
        $les[(string)$r['memberId']] = $r;
    foreach (db_all("SELECT studentId, COUNT(DISTINCT date) n FROM attendance WHERE date >= ? GROUP BY studentId", [$since]) as $r) $att[(string)$r['studentId']] = (int)$r['n'];
    foreach (db_all("SELECT memberId, COUNT(CASE WHEN status = 'confirmed' THEN 1 END) n, COALESCE(SUM(CASE WHEN status = 'confirmed' THEN hours END),0) h, COUNT(CASE WHEN status = 'pending' THEN 1 END) waiting, MAX(doneOn) lastOn FROM learning_log GROUP BY memberId") as $r)
        $out[(string)$r['memberId']] = $r;
    $rows = [];
    foreach ($ms as $m) {
        $id = (string)$m['memberId']; $l = $les[$id] ?? []; $o = $out[$id] ?? [];
        $lastHere = substr((string)($l['lastAt'] ?? ''), 0, 10);
        $lastAny = max($lastHere, (string)($o['lastOn'] ?? ''));
        $rows[] = ['memberId' => $id, 'displayId' => (string)$m['displayId'], 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre'], 'track' => (string)$m['track'],
            'lessons' => (int)($l['done'] ?? 0), 'avgPct' => isset($l['avgPct']) && $l['avgPct'] !== null ? (int)round((float)$l['avgPct']) : null,
            'outside' => (int)($o['n'] ?? 0), 'outsideHours' => round((float)($o['h'] ?? 0), 1), 'waiting' => (int)($o['waiting'] ?? 0),
            'days90' => $att[$id] ?? 0, 'lastLearnt' => $lastAny];
    }
    return ['ok' => true, 'members' => $rows, 'since' => $since];
}
