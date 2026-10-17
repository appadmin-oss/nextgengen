<?php
declare(strict_types=1);
/**
 * The Saturday Formation Schedule: 8:00am–2:00pm, "Think. Create. Lead. Serve."
 *
 * ONE TIMETABLE, FIVE READERS. The day is seeded once (sf_seed, into
 * saturday_formation) and every portal reads the same rows: what a member
 * does in a block, what a mentor watches for, what an instructor delivers,
 * what an admin has to have ready, and what a parent is told. Who reads which
 * part is decided here (sf_for), never by a screen holding its own copy.
 *
 * THE DAY, AS IT HAPPENS (sf_tick, from the web-cron in mpa_tick). On a
 * Lagos Saturday each block's start sends, once (saturday_formation_sends is
 * the ledger, unique per day, block, person and channel):
 *   members checked in today — what this block is and what to bring to it;
 *   mentors — the block's mentor focus;
 *   instructors with a Saturday class — the division block, at 11:00;
 *   every linked guardian (family notifications are always on) — the
 *   morning plan at 7:00, a not-arrived notice at 8:45 for a member with no
 *   check-in, and the close at 2:00 with what their child's day held.
 * Guardians are told by email only, inside 8am–8pm Lagos (the 7:00 plan waits
 * for 8:00), and a guardian who switched check-in news off hears nothing.
 * A tick serves at most SF_TICK_MAX recipients; the rest are served next tick.
 */

const SF_TICK_MAX = 400;
const SF_WINDOW_MIN = 25;          // a block's send stays open this long after it starts
const SF_AUDIENCES = ['member', 'mentor', 'instructor', 'admin', 'parent'];

/** The seed: the programme's own schedule, block by block. */
function sf_blocks_seed(): array {
    return [
        ['key' => 'checkin', 'start' => '08:00', 'end' => '08:30', 'title' => 'Assignment submission & check-in', 'flow' => 'Accountability', 'purpose' => 'Accountability and preparation.',
         'member' => ['Submit weekly assignments.', 'Present completed work where required.', 'Receive attendance/check-in confirmation.', 'Resolve outstanding submissions.', 'Prepare for the day’s activities.'],
         'mentor' => ['Check punctuality, assignment completion and general preparedness.'],
         'instructor' => ['Have last week’s assignments ready to receive and mark.'],
         'admin' => ['Gate open with the check-in desk staffed by 7:50.', 'Outstanding submissions list ready for mentors.'],
         'parent' => 'Your child checks in and hands in this week’s assignment. You’re told when they arrive.', 'quote' => ''],
        ['key' => 'musing', 'start' => '08:30', 'end' => '10:00', 'title' => 'Musing & mentor breakout', 'flow' => 'Reflection', 'purpose' => 'Personal formation and reflection.',
         'member' => ['Review of the previous week', 'Anchor Journal', 'Personal timetable', 'Goals and commitments', 'Challenges and failures', 'Courage and difficult decisions', 'Community participation', 'Dues/fines and personal accountability', 'Chess development', 'Leadership behaviour', 'Questions, ideas and discoveries'],
         'mentor' => ['Take the register and note who is here.', 'Do not merely ask whether tasks were done: examine character, responsibility, courage and growth.', 'One-to-ones with the mentees who are due.', 'Record observations and the weekly review before Monday.'],
         'instructor' => [], 'admin' => ['Every mentor group has a mentor present; cover any gap from the lead.'],
         'parent' => 'Your child is with their mentor group, reviewing the week: their journal, goals, commitments and what they found hard.',
         'quote' => 'Who are you becoming, and what evidence do we have?'],
        ['key' => 'vanboja', 'start' => '10:00', 'end' => '10:25', 'title' => 'Time out with Van BOJA', 'flow' => 'Leadership exposure', 'purpose' => 'Exposure, inspiration and direct leadership interaction.',
         'member' => ['Life', 'Leadership', 'Africa', 'Character', 'Creativity', 'Technology', 'Current affairs', 'Philosophy', 'Personal development', 'Bring one question of your own.'],
         'mentor' => ['Sit with your group; note who asks a question.'], 'instructor' => [], 'admin' => ['Hall set, sound checked, questions from members gathered.'],
         'parent' => 'A session with Van BOJA on life, leadership, Africa and ideas, with questions from the members.', 'quote' => ''],
        ['key' => 'anthem', 'start' => '10:25', 'end' => '10:30', 'title' => 'NGG Anthem', 'flow' => 'Identity', 'purpose' => 'Identity, unity and collective commitment.',
         'member' => ['Come together to affirm the identity and values of NGG.'], 'mentor' => ['Model the anthem and the pledge.'], 'instructor' => [], 'admin' => [],
         'parent' => 'Everyone together for the NGG Anthem.', 'quote' => 'Cannot be bought. Cannot be bent. Cannot be broken.'],
        ['key' => 'special', 'start' => '10:30', 'end' => '11:00', 'title' => 'Special class / content creation / general lecture', 'flow' => 'General exposure', 'purpose' => 'Exposure beyond the member’s regular division.',
         'member' => ['General lectures', 'Guest speakers', 'Special masterclasses', 'Content creation', 'Current affairs', 'Leadership lessons', 'Entrepreneurship', 'African history and culture', 'Technology exposure', 'Creative demonstrations', 'Inter-division projects'],
         'mentor' => ['Note what caught each mentee’s interest; bring it to the next one-to-one.'], 'instructor' => ['If you are this week’s speaker: 30 minutes, beyond your division, with something to do.'],
         'admin' => ['Speaker or masterclass confirmed by Thursday.'], 'parent' => 'A special class beyond their division: a guest, a masterclass or a project.', 'quote' => ''],
        ['key' => 'division', 'start' => '11:00', 'end' => '12:30', 'title' => 'Division classes', 'flow' => 'Competence', 'purpose' => 'Deep competence development.',
         'member' => ['Division 1 · Creative & Performing Arts', 'Division 2 · Media & Content Strategy', 'Division 3 · Technology & Applied Engineering', 'Division 4 · Business Strategy, Operations & Administration', 'Build your portfolio: what you can do, create, solve or lead.'],
         'mentor' => [], 'instructor' => ['Practical and project-driven, not merely theoretical.', 'Take the class register.', 'Every member leaves with something added to their portfolio.'],
         'admin' => ['Every division has its instructor and room.'], 'parent' => 'Your child is in their division class, building their portfolio by making things.', 'quote' => ''],
        ['key' => 'break', 'start' => '12:30', 'end' => '13:00', 'title' => 'Break', 'flow' => 'Rest & community', 'purpose' => 'Rest, refreshment and informal community.',
         'member' => ['Interact positively, build relationships and practise responsible communal behaviour.'], 'mentor' => ['Remain observant without turning the break into another classroom.'],
         'instructor' => [], 'admin' => ['Refreshments and the space supervised.'], 'parent' => 'Break: rest, food and time with friends.', 'quote' => ''],
        ['key' => 'chess', 'start' => '13:00', 'end' => '13:45', 'title' => 'Chess & strategic thinking', 'flow' => 'Strategy', 'purpose' => 'Develop the strategic mind. Chess is compulsory for every NGG member.',
         'member' => ['Concentration', 'Patience', 'Planning', 'Pattern recognition', 'Decision-making', 'Consequence awareness', 'Strategic thinking', 'Sacrifice', 'Resilience', 'Problem-solving', 'Explain why you made your moves.'],
         'mentor' => ['Connect chess behaviour to real-life leadership.', 'How do you make decisions when you cannot see the whole board?', 'Can you sacrifice something small for something greater?', 'What do you do after making a bad move?', 'Can you think three moves ahead?'],
         'instructor' => ['Chess instructors: ask every player to explain one move.'], 'admin' => ['Boards and clocks out.'], 'parent' => 'Chess, compulsory for every member: planning, patience and explaining their moves.', 'quote' => 'Can you think three moves ahead?'],
        ['key' => 'close', 'start' => '13:45', 'end' => '14:00', 'title' => 'Cleaning & close', 'flow' => 'Service', 'purpose' => 'Responsibility and service. Cleaning is not punishment; it is leadership training.',
         'member' => ['Restore the space you used.', 'Area inspection', 'Mentor check-out', 'Outstanding announcements', 'Next-week reminders', 'Personal responsibility confirmation'],
         'mentor' => ['Inspect your group’s area and check every mentee out.', 'Give next week’s reminders.'], 'instructor' => ['Room restored and equipment returned.'],
         'admin' => ['Announcements out; the site is closed by 2:15.'], 'parent' => 'The day closes with cleaning and check-out. You’ll get a short summary of their Saturday.',
         'quote' => 'If you use the space, you are responsible for the space.'],
    ];
}

/** The schedule, from the table (seeded on first read). */
function sf_seed(): void {
    if ((int)(db_row('SELECT COUNT(*) c FROM saturday_formation')['c'] ?? 0) > 0) return;
    $now = now_iso();
    foreach (sf_blocks_seed() as $i => $b) {
        db_insert('saturday_formation', ['blockKey' => $b['key'], 'sort' => $i, 'startTime' => $b['start'], 'endTime' => $b['end'], 'title' => $b['title'], 'flow' => $b['flow'],
            'purpose' => $b['purpose'], 'quote' => $b['quote'], 'forJson' => json_encode(array_intersect_key($b, array_flip(SF_AUDIENCES)), JSON_UNESCAPED_UNICODE),
            'status' => 'active', 'updatedAt' => $now, 'updatedBy' => 'seed']);
    }
}
function sf_blocks(): array {
    sf_seed();
    return array_map(static function ($r) {
        $for = json_decode((string)$r['forJson'], true) ?: [];
        return ['key' => (string)$r['blockKey'], 'start' => (string)$r['startTime'], 'end' => (string)$r['endTime'], 'title' => (string)$r['title'], 'flow' => (string)$r['flow'],
                'purpose' => (string)$r['purpose'], 'quote' => (string)$r['quote'], 'for' => $for];
    }, db_all("SELECT * FROM saturday_formation WHERE status = 'active' ORDER BY sort, id"));
}
/** One audience's view of the day: each block with that audience's part only (parent: one line). */
function sf_for(string $audience): array {
    if (!in_array($audience, SF_AUDIENCES, true)) $audience = 'member';
    return array_map(static function ($b) use ($audience) {
        $part = $b['for'][$audience] ?? ($audience === 'parent' ? '' : []);
        unset($b['for']);
        return $b + ['part' => $part, 'audience' => $audience];
    }, sf_blocks());
}

/** public.formation — the day for one audience. Public (it is the programme's published schedule); cached under 'formation'. */
function public_formation(array $p): array {
    $a = (string)($p['audience'] ?? 'member');
    return ['ok' => true, 'theme' => 'Think. Create. Lead. Serve.', 'hours' => '8:00am – 2:00pm', 'audience' => in_array($a, SF_AUDIENCES, true) ? $a : 'member',
            'logic' => 'Accountability → Reflection → Inspiration → Identity → Exposure → Competence → Strategy → Service', 'blocks' => sf_for($a)];
}

/** admin.formation.list — every block with every audience's part, for the editor, and what the reminders sent last Saturday. */
function admin_formation_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (empty($g['ok'])) return $g;
    $last = (string)(db_row('SELECT MAX(onDate) d FROM saturday_formation_sends')['d'] ?? '');
    $sent = $last !== '' ? db_all('SELECT slot, channel, COUNT(*) n FROM saturday_formation_sends WHERE onDate = ? GROUP BY slot, channel ORDER BY slot', [$last]) : [];
    return ['ok' => true, 'blocks' => sf_blocks(), 'audiences' => SF_AUDIENCES, 'settings' => sf_setting(), 'lastSaturday' => $last, 'sent' => $sent];
}

/** admin.formation.save — edit one block (times, wording, each audience's part). Capability: content. */
function admin_formation_save(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (empty($g['ok'])) return $g;
    sf_seed();
    $key = (string)($p['key'] ?? '');
    $row = db_row('SELECT * FROM saturday_formation WHERE blockKey = ?', [$key]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $f = [];
    foreach (['start' => 'startTime', 'end' => 'endTime'] as $in => $col) if (array_key_exists($in, $p)) {
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$p[$in])) return ['ok' => false, 'error' => 'bad_time'];
        $f[$col] = (string)$p[$in];
    }
    foreach (['title' => 120, 'flow' => 60, 'purpose' => 400, 'quote' => 300] as $k => $max) if (array_key_exists($k, $p)) {
        $v = trim((string)$p[$k]); if (mb_strlen($v) > $max) return ['ok' => false, 'error' => 'too_long', 'field' => $k];
        if ($k === 'title' && $v === '') return ['ok' => false, 'error' => 'title_required'];
        $f[$k] = $v;
    }
    if (array_key_exists('for', $p)) {
        $have = json_decode((string)$row['forJson'], true) ?: [];
        foreach ((array)$p['for'] as $aud => $v) {
            if (!in_array($aud, SF_AUDIENCES, true)) return ['ok' => false, 'error' => 'bad_audience'];
            $have[$aud] = $aud === 'parent' ? mb_substr(trim((string)$v), 0, 400) : array_values(array_slice(array_filter(array_map(static fn($x) => mb_substr(trim((string)$x), 0, 300), (array)$v)), 0, 20));
        }
        $f['forJson'] = json_encode($have, JSON_UNESCAPED_UNICODE);
    }
    $s = $f['startTime'] ?? (string)$row['startTime']; $e = $f['endTime'] ?? (string)$row['endTime'];
    if ($e <= $s) return ['ok' => false, 'error' => 'end_before_start'];
    if (!$f) return ['ok' => true, 'unchanged' => true];
    db_update('saturday_formation', $f + ['updatedAt' => now_iso(), 'updatedBy' => (string)$g['member']['memberId']], ['id' => (int)$row['id']]);
    if (function_exists('cache_invalidate')) cache_invalidate('formation');
    audit('formation.block.save', (string)$g['member']['memberId'], $key, ['fields' => array_keys($f)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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
function sf_minutes(string $hhmm): int { [$h, $m] = array_map('intval', explode(':', $hhmm . ':0')); return $h * 60 + $m; }

/**
 * Called by the web-cron. Returns what it sent, for the job log and the tests.
 * $now is a UTC timestamp; the schedule is Lagos time (UTC+1, no DST).
 */
function sf_tick(?int $now = null): array {
    $now = $now ?? time();
    $lagos = $now + 3600;
    if ((int)gmdate('w', $lagos) !== 6) return ['saturday' => false];
    $date = gmdate('Y-m-d', $lagos); $min = (int)gmdate('G', $lagos) * 60 + (int)gmdate('i', $lagos);
    $set = sf_setting(); $budget = SF_TICK_MAX; $sent = [];
    $open = static fn(int $at) => $min >= $at && $min < $at + SF_WINDOW_MIN;
    $blocks = sf_blocks();
    $here = null;
    foreach ($blocks as $b) {
        $at = sf_minutes($b['start']);
        if (!$open($at)) continue;
        $slot = 'block:' . $b['key'];
        // Members in the building: this block, and what it asks of them.
        if ($set['members'] && $b['key'] !== 'checkin') {
            $here = $here ?? sf_here_today($date);
            foreach ($here as $mid) {
                if ($budget <= 0) break;
                if (!sf_once($date, $slot, $mid, 'push')) continue;
                push_notification($mid, ['kind' => 'formation', 'title' => $b['start'] . ' · ' . $b['title'], 'body' => mb_substr($b['quote'] !== '' ? $b['quote'] : implode(' · ', array_slice((array)($b['for']['member'] ?? []), 0, 3)), 0, 140), 'linkPage' => 'dashboard']);
                $budget--; $sent[] = [$slot, 'member', $mid];
            }
        }
        // Mentors: the block's mentor focus.
        if ($set['mentors'] && !empty($b['for']['mentor'])) {
            foreach (db_all("SELECT memberId FROM mentors WHERE status = 'active' AND programme IN ('ngg','both') AND COALESCE(memberId,'') <> ''") as $r) {
                if ($budget <= 0) break;
                if (!sf_once($date, $slot, (string)$r['memberId'], 'push')) continue;
                push_notification((string)$r['memberId'], ['kind' => 'mentor', 'title' => $b['start'] . ' · ' . $b['title'], 'body' => mb_substr(implode(' ', array_slice((array)$b['for']['mentor'], 0, 2)), 0, 140), 'linkPage' => 'mentor']);
                $budget--; $sent[] = [$slot, 'mentor', (string)$r['memberId']];
            }
        }
        // Instructors with a Saturday class: the division block.
        if ($set['instructors'] && $b['key'] === 'division') {
            foreach (db_all("SELECT DISTINCT v.memberId FROM timetable_slots t JOIN volunteers v ON v.volunteerId = t.instructorId WHERE t.weekday = 6 AND t.status = 'active' AND COALESCE(v.memberId,'') <> ''") as $r) {
                if ($budget <= 0) break;
                if (!sf_once($date, $slot, (string)$r['memberId'], 'push')) continue;
                push_notification((string)$r['memberId'], ['kind' => 'instructor', 'title' => '11:00 · Division classes', 'body' => 'Practical and project-driven. Take the register; every member adds to their portfolio.', 'linkPage' => 'mentor']);
                $budget--; $sent[] = [$slot, 'instructor', (string)$r['memberId']];
            }
        }
    }
    if ($set['parents']) $sent = array_merge($sent, sf_parents($date, $min, $blocks, $budget));
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
    $html = '<ul style="margin:0;padding-left:18px">' . implode('', array_map(static fn($l) => '<li style="margin:0 0 6px">' . esc_html($l) . '</li>', $lines)) . '</ul>';
    if (function_exists('family_mail')) { family_mail($to, $subject, ['title' => $title, 'intro' => $intro, 'bodyHtml' => $html, 'ctaLabel' => 'Open the family account →', 'ctaUrl' => family_origin() . '/family', 'footNote' => $foot]); return true; }
    return (bool)send_mail($to, $subject, email_template(['title' => $title, 'intro' => $intro, 'bodyHtml' => $html, 'footNote' => $foot]));
}
/** The three family messages of a Saturday: the plan (from 8:00), not arrived (8:45), the close (2:00). */
function sf_parents(string $date, int $min, array $blocks, int &$budget): array {
    $sent = [];
    $morning = $min >= 8 * 60 && $min < 8 * 60 + 40;
    $late = $min >= 8 * 60 + 45 && $min < 8 * 60 + 45 + SF_WINDOW_MIN;
    $close = $min >= 14 * 60 && $min < 14 * 60 + 90;
    if (!$morning && !$late && !$close) return [];
    $gs = sf_guardians(); if (!$gs) return [];
    $here = array_flip(sf_here_today($date));
    $foot = 'You get this because check-in news is on for this member in your family account. Turn it off there at any time.';
    foreach ($gs as $g) {
        if ($budget <= 0) break;
        $mid = $g['memberId']; $first = $g['first'] ?: 'Your child';
        if ($morning && sf_once($date, 'parent:plan', $g['email'] . '|' . $mid, 'email')) {
            sf_mail($g['email'], 'Saturday at NGG for ' . $first . ': 8:00am – 2:00pm', 'Today at NGG', $first . '’s Saturday, block by block. Think. Create. Lead. Serve.',
                array_map(static fn($b) => $b['start'] . ' · ' . $b['title'] . ($b['for']['parent'] ? ': ' . $b['for']['parent'] : ''), $blocks), $foot);
            $budget--; $sent[] = ['parent:plan', 'parent', $mid];
        }
        if ($late && !isset($here[$mid]) && sf_once($date, 'parent:absent', $g['email'] . '|' . $mid, 'email')) {
            sf_mail($g['email'], $first . ' hasn’t checked in at NGG yet', 'Not checked in yet', $first . ' had not checked in at ' . $g['centre'] . ' by 8:45am. Saturday began at 8:00.',
                ['If they are on their way, there is nothing to do.', 'If they are unwell or away today, let their mentor or the centre know.'], $foot);
            $budget--; $sent[] = ['parent:absent', 'parent', $mid];
        }
        if ($close && isset($here[$mid]) && sf_once($date, 'parent:close', $g['email'] . '|' . $mid, 'email')) {
            sf_mail($g['email'], $first . '’s Saturday at NGG', 'Today at NGG', 'Here is what ' . $first . '’s Saturday held.', sf_day_lines($mid, $date, $blocks), $foot);
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
    $mentor = db_row("SELECT t.fullName FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.memberId = ? AND a.status = 'active' LIMIT 1", [$mid]);
    $lines[] = 'Musing & mentor breakout' . ($mentor ? ' with ' . (string)$mentor['fullName'] : '') . ($obs ? ': their mentor saw ' . strtolower(implode(', ', $obs)) . '.' : '.');
    $rev = db_row('SELECT line FROM mentor_reviews WHERE subjectId = ? AND period = ?', [$mid, iso_week_period(strtotime($date . 'T12:00:00Z'))]);
    if ($rev && trim((string)$rev['line']) !== '') $lines[] = 'From their mentor: “' . mb_substr(trim((string)$rev['line']), 0, 200) . '”';
    foreach ($blocks as $b) if (in_array($b['key'], ['vanboja', 'special', 'division', 'chess'], true)) $lines[] = $b['title'] . ($b['for']['parent'] ? ': ' . $b['for']['parent'] : '');
    $lines[] = 'Next week: this week’s assignment is due at check-in, 8:00am.';
    return $lines;
}
