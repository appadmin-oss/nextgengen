<?php
declare(strict_types=1);

/**
 * Maths Lab — the engine (docs/MATH-LAB-PLAN.md §9).
 *
 * Members (free) climb from MC-001 to their real level on performance and
 * speed, then learn, practise, prove mastery, and keep it through spaced
 * reviews. Everything is marked here: the browser is sent questions, never
 * keys, and every question is regenerated from (competency, form, seed).
 * Non-members get Maths Lab Lite: practice with marking and worked solutions,
 * no record.
 */

const MLB_CHECK_ITEMS = 10;       // a mastery check
const MLB_CHECK_PASS = 85;        // % (the curriculum's proposed bar)
const MLB_BOSS_PASS = 80;
const MLB_PRACTICE_ITEMS = 8;
const MLB_GATE_ITEMS = 6;
/* Owner, 4 Nov 2026: "Everyone must study. No cutting corners. No failing and failing and failing
   until you get the answer." So a topic's lesson must be studied before its practice opens, and a
   failed mastery check or boss is owed this many CORRECT practice answers before it is retaken. */
const MLB_RETAKE_OWED = 5;
const MLB_DAY_PRACTICE_XP = 60;   // practice XP cap a day: no grinding
const MLB_GOOD = ['known', 'mastered', 'secure', 'longterm'];
const MLB_STATE_ORDER = ['none' => 0, 'learning' => 1, 'review' => 1, 'practising' => 2, 'ready' => 3, 'known' => 4, 'mastered' => 5, 'secure' => 6, 'longterm' => 7];

/* ── Who may use the full Lab ── */
function mlb_member(array $p): ?array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m || (string)$m['status'] !== 'active') return null;
    return function_exists('member_is_ngg') && !member_is_ngg($m) ? null : $m;
}
function mlb_today(): string { return function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'); }

/* ── Profile and state ── */
function mlb_profile(string $mid): array {
    $p = db_row('SELECT * FROM mlab_profile WHERE memberId = ?', [$mid]);
    if ($p) return $p;
    $now = now_iso();
    db_insert('mlab_profile', ['memberId' => $mid, 'xp' => 0, 'streak' => 0, 'lastDay' => '', 'freezes' => 0, 'climbStage' => 1, 'climbDone' => 0,
        'momentum' => 0, 'xpDay' => '', 'xpToday' => 0, 'bosses' => '{}', 'createdAt' => $now, 'updatedAt' => $now]);
    return db_row('SELECT * FROM mlab_profile WHERE memberId = ?', [$mid]);
}
function mlb_states(string $mid): array {
    $out = [];
    foreach (db_all('SELECT * FROM mlab_state WHERE memberId = ?', [$mid]) as $r) $out[$r['comp']] = $r;
    return $out;
}
function mlb_set_state(string $mid, string $comp, array $patch): void {
    $patch['updatedAt'] = now_iso();
    if (db_row('SELECT id FROM mlab_state WHERE memberId = ? AND comp = ?', [$mid, $comp])) db_update('mlab_state', $patch, ['memberId' => $mid, 'comp' => $comp]);
    else db_insert('mlab_state', $patch + ['memberId' => $mid, 'comp' => $comp, 'state' => 'none', 'p' => 0.15, 'attempts' => 0, 'correct' => 0, 'fast' => 0, 'nextReview' => '', 'masteredAt' => '']);
}
function mlb_rank(string $state): int { return MLB_STATE_ORDER[$state] ?? 0; }
/**
 * A competency the learner may work on: every prerequisite is known or better, or not yet taught in the Lab.
 * A prerequisite from a LATER stage (the plan's sequencing problems: 055 needs 091/094, 058 needs 061) never
 * blocks — the topic introduces what it needs in place, and the full topic comes later. Blocking on it would
 * lock a Stage 6 topic behind Stage 10, and the climb could never finish Stage 6.
 */
function mlb_need_ahead(string $comp, string $need): bool { return (mlb_comp($need)['stage'] ?? 0) > (mlb_comp($comp)['stage'] ?? 0); }
function mlb_unlocked(string $comp, array $states): bool {
    foreach (mlb_comp($comp)['needs'] ?? [] as $need) {
        if (!mlb_available($need) || mlb_need_ahead($comp, $need)) continue;
        if (!in_array($states[$need]['state'] ?? 'none', MLB_GOOD, true)) return false;
    }
    return true;
}
function mlb_award_xp(string $mid, int $xp, bool $practice = false): int {
    $p = mlb_profile($mid); $day = mlb_today();
    $today = (string)$p['xpDay'] === $day ? (int)$p['xpToday'] : 0;
    if ($practice) $xp = max(0, min($xp, MLB_DAY_PRACTICE_XP - $today));
    db_update('mlab_profile', ['xp' => (int)$p['xp'] + $xp, 'xpDay' => $day, 'xpToday' => $today + ($practice ? $xp : 0), 'updatedAt' => now_iso()], ['memberId' => $mid]);
    return $xp;
}
/** A day counts once a session is finished. A missed day is covered by a freeze (earned every 7 days, at most 2). */
function mlb_touch_streak(string $mid): void {
    $p = mlb_profile($mid); $day = mlb_today();
    if ((string)$p['lastDay'] === $day) return;
    $gap = $p['lastDay'] ? (int)round((strtotime($day) - strtotime((string)$p['lastDay'])) / 86400) : 99;
    $streak = (int)$p['streak']; $fr = (int)$p['freezes'];
    if ($gap === 1) $streak++;
    elseif ($gap === 2 && $fr > 0) { $streak++; $fr--; }
    else $streak = 1;
    if ($streak % 7 === 0) $fr = min(2, $fr + 1);
    db_update('mlab_profile', ['streak' => $streak, 'freezes' => $fr, 'lastDay' => $day, 'updatedAt' => now_iso()], ['memberId' => $mid]);
}

/** A light knowledge-tracing step: how likely is it the learner knows this, after this answer? */
function mlb_bkt(float $p, bool $ok, bool $typed): float {
    $slip = 0.1; $guess = $typed ? 0.05 : 0.25; $learn = 0.15;
    $post = $ok ? $p * (1 - $slip) / ($p * (1 - $slip) + (1 - $p) * $guess) : $p * $slip / ($p * $slip + (1 - $p) * (1 - $guess));
    return round(min(0.995, $post + (1 - $post) * $learn), 4);
}

/* ── Building a session ── */
/**
 * Questions for a session. $skillOnly (the climb's placement gate, reviews and the boss) leaves
 * out the two "Why it works" forms a topic carries (mlb_why_forms; mlb_why_at() says where):
 * those teach the argument and belong in practice and the mastery check — a child placed by
 * "why is line 1 true?" about digit counts is being placed by the wrong question.
 */
function mlb_skill_forms(string $c): array {
    $all = array_keys(mlb_forms()[$c] ?? []);
    $w = function_exists('mlb_why_at') ? mlb_why_at($c) : null;
    if ($w === null) return $all;
    $out = array_values(array_filter($all, static fn($i) => $i !== $w && $i !== $w + 1));
    return $out ?: $all;
}
function mlb_pick_items(array $comps, int $n, bool $preferTyped = false, bool $skillOnly = false): array {
    $items = []; $i = 0; $guard = 0;
    while (count($items) < $n && $guard++ < $n * 6 && $comps) {
        $c = $comps[$i % count($comps)]; $i++;
        $forms = mlb_forms()[$c] ?? []; if (!$forms) continue;
        $pool = $skillOnly ? mlb_skill_forms($c) : array_keys($forms); $nf = count($pool);
        $k = random_int(0, $nf - 1); $seed = random_int(1, 2000000000);
        if ($preferTyped) {
            for ($t = 0; $t < $nf; $t++) { $it = mlb_item($c, $pool[($k + $t) % $nf], $seed); if (!empty($it['typed'])) { $k = ($k + $t) % $nf; break; } }
        }
        $items[] = ['c' => $c, 'f' => $pool[$k], 's' => $seed];
    }
    return $items;
}

/** mathslab.start — {mode: climb|practice|check|review|boss, comp?, stage?} */
function mlb_start(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $prof = mlb_profile($mid); $states = mlb_states($mid);
    $mode = (string)($p['mode'] ?? ''); $comp = (string)($p['comp'] ?? ''); $ref = '';
    if ($mode === 'climb') {
        if ((int)$prof['climbDone']) return ['ok' => false, 'error' => 'climb_done'];
        $st = (int)$prof['climbStage']; $ref = (string)$st;
        $n = (int)$prof['momentum'] >= 3 ? 4 : MLB_GATE_ITEMS;
        $comps = mlb_stages()[$st]['comps'];
        $items = mlb_pick_items(array_slice((function ($a) { shuffle($a); return $a; })($comps), 0, $n), $n, true, true);
    } elseif ($mode === 'practice' || $mode === 'check') {
        if (!mlb_available($comp)) return ['ok' => false, 'error' => 'not_available'];
        if (!mlb_unlocked($comp, $states)) return ['ok' => false, 'error' => 'locked', 'needs' => array_values(array_filter(mlb_comp($comp)['needs'], fn($x) => !in_array($states[$x]['state'] ?? 'none', MLB_GOOD, true) && mlb_available($x)))];
        $cs = $states[$comp] ?? []; $good = in_array($cs['state'] ?? 'none', MLB_GOOD, true);
        // The lesson first, every time it is not already known: no practising a topic nobody has studied.
        if (!$good && (string)($cs['studiedAt'] ?? '') === '') return ['ok' => false, 'error' => 'not_studied'];
        // The check is earned by practice, never retried until it gives way.
        if ($mode === 'check' && (int)($cs['owed'] ?? 0) > 0) return ['ok' => false, 'error' => 'practice_owed', 'owed' => (int)$cs['owed']];
        if ($mode === 'check' && ($cs['state'] ?? 'none') !== 'ready') return ['ok' => false, 'error' => 'not_ready'];
        $ref = $comp;
        $items = mlb_pick_items([$comp], $mode === 'check' ? MLB_CHECK_ITEMS : MLB_PRACTICE_ITEMS);
    } elseif ($mode === 'review') {
        $due = mlb_due($states); if (!$due) return ['ok' => false, 'error' => 'nothing_due'];
        $items = mlb_pick_items(array_slice($due, 0, 6), min(6, count($due)), true, true);
    } elseif ($mode === 'boss') {
        $st = (int)($p['stage'] ?? 0); $ref = (string)$st;
        $comps = mlb_stages()[$st]['comps'] ?? [];
        if (!$comps || !mlb_stage_available($st)) return ['ok' => false, 'error' => 'not_available'];
        foreach ($comps as $c) if (!in_array($states[$c]['state'] ?? 'none', MLB_GOOD, true)) return ['ok' => false, 'error' => 'boss_locked'];
        $items = mlb_pick_items($comps, 12, false, true);
    } elseif ($mode === 'mini') {
        // A short look back (owner, 5 Nov 2026: "a mini review feature after a long time of practice").
        $st = (int)($p['stage'] ?? 0); $ref = $st ? (string)$st : '';
        $comps = mlb_mini_pick($mid, $states, $st);
        if (count($comps) < 2) return ['ok' => false, 'error' => 'not_enough'];
        $items = mlb_pick_items($comps, min(MLB_MINI_ITEMS, max(count($comps), 3)), false, true);
    } elseif ($mode === 'exam') {
        // A practice paper is open to every member whatever their place on the map: it is exam practice, not a step on the path.
        $paper = (string)($p['paper'] ?? ''); if (!isset(MLB_PAPERS[$paper])) return ['ok' => false, 'error' => 'bad_paper'];
        $ref = $paper; $items = mlb_exam_pick($paper);
        if (count($items) < MLB_PAPERS[$paper]['n']) return ['ok' => false, 'error' => 'not_available'];
    } else return ['ok' => false, 'error' => 'bad_mode'];
    $sid = 'MLS-' . strtoupper(rand_hex(8));
    db_insert('mlab_sessions', ['sessionId' => $sid, 'memberId' => $mid, 'mode' => $mode, 'ref' => $ref, 'items' => json_encode($items), 'resp' => '{}', 'startedAt' => now_iso(), 'finishedAt' => '']);
    return ['ok' => true, 'sessionId' => $sid, 'mode' => $mode, 'ref' => $ref,
        'title' => mlb_session_title($mode, $ref),
        'minutes' => $mode === 'exam' ? MLB_PAPERS[$ref]['minutes'] : 0,
        'items' => array_map(static fn($x) => mlb_public(mlb_item($x['c'], $x['f'], $x['s'])) + ['comp' => $x['c'], 'compTitle' => mlb_comp($x['c'])['title']], $items)];
}
function mlb_session_title(string $mode, string $ref): string {
    if ($mode === 'exam') return MLB_PAPERS[$ref]['title'] ?? 'Practice paper';
    if ($mode === 'mini') return 'Mini review' . ($ref !== '' ? ' · Stage ' . $ref . ': ' . (mlb_stages()[(int)$ref]['title'] ?? '') : ' · what you learned earlier');
    if ($mode === 'climb') return 'Stage ' . $ref . ' gate · ' . mlb_stages()[(int)$ref]['title'];
    if ($mode === 'boss') return 'Stage ' . $ref . ' boss · ' . mlb_stages()[(int)$ref]['title'];
    if ($mode === 'review') return 'Review: keep what you know';
    $c = mlb_comp($ref); return ($mode === 'check' ? 'Mastery check · ' : 'Practice · ') . ($c['title'] ?? '');
}
function mlb_session(string $mid, string $sid): ?array {
    // The daily problem is answered only through mathslab.dailyAnswer (its own tries and reward), never as a session.
    $s = db_row("SELECT * FROM mlab_sessions WHERE sessionId = ? AND memberId = ? AND mode NOT IN ('daily', 'chest')", [$sid, $mid]);
    return $s ?: null;
}

/** mathslab.answer — one answer. Practice says at once whether it is right; a gate, check, review or boss says so at the end. */
function mlb_answer(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId'];
    $s = mlb_session($mid, (string)($p['sessionId'] ?? '')); if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$s['finishedAt'] !== '') return ['ok' => false, 'error' => 'finished'];
    $items = json_decode((string)$s['items'], true); $i = (int)($p['index'] ?? -1);
    if (!isset($items[$i])) return ['ok' => false, 'error' => 'bad_index'];
    // A paper's clock is the server's: an answer after the time (and a short grace for the network) is refused, as the real exam would.
    if ((string)$s['mode'] === 'exam' && time() > strtotime((string)$s['startedAt']) + 60 * (int)(MLB_PAPERS[(string)$s['ref']]['minutes'] ?? 0) + MLB_EXAM_GRACE) return ['ok' => false, 'error' => 'time_up'];
    $resp = json_decode((string)$s['resp'], true) ?: [];
    if (isset($resp[$i])) return ['ok' => false, 'error' => 'already_answered'];
    $x = $items[$i]; $it = mlb_item($x['c'], $x['f'], $x['s']);
    $mk = mlb_mark($it, $p['answer'] ?? '');
    $resp[$i] = ['ok' => $mk['ok'], 'ms' => max(0, (int)($p['ms'] ?? 0)), 'hints' => min(2, max(0, (int)($p['hints'] ?? 0))), 'conf' => (string)($p['conf'] ?? ''),
        'a' => is_array($p['answer'] ?? null) ? $p['answer'] : mb_substr((string)($p['answer'] ?? ''), 0, 120)];
    db_update('mlab_sessions', ['resp' => json_encode($resp)], ['sessionId' => $s['sessionId']]);
    $out = ['ok' => true, 'recorded' => true, 'answered' => count($resp), 'total' => count($items)];
    if ((string)$s['mode'] === 'practice') {
        $st = mlb_states($mid)[$x['c']] ?? null;
        $pk = mlb_bkt((float)($st['p'] ?? 0.15), $mk['ok'] && $resp[$i]['hints'] < 2, !empty($it['typed']));
        $att = (int)($st['attempts'] ?? 0) + 1; $cor = (int)($st['correct'] ?? 0) + ($mk['ok'] ? 1 : 0);
        $cur = (string)($st['state'] ?? 'none'); $new = $cur;
        $owed = max(0, (int)($st['owed'] ?? 0) - ($mk['ok'] && $resp[$i]['hints'] < 1 ? 1 : 0));   // only an unaided right answer pays it down
        if (mlb_rank($cur) < mlb_rank('known')) $new = $owed === 0 && $pk >= 0.85 && $att >= 6 && $cor >= 5 ? 'ready' : ($pk >= 0.6 ? 'practising' : 'learning');
        mlb_set_state($mid, $x['c'], ['p' => $pk, 'attempts' => $att, 'correct' => $cor, 'state' => $new, 'owed' => $owed]);
        $out += ['correct' => $mk['ok'], 'why' => $mk['why'], 'formNote' => $mk['form'], 'answer' => mlb_answer_text($it), 'steps' => $it['steps'], 'state' => $new, 'p' => $pk,
            'xp' => $mk['ok'] ? mlb_award_xp($mid, $resp[$i]['hints'] ? 1 : 2, true) : 0];
    }
    return $out;
}

/** mathslab.finish — score the session and move the map. Answers and solutions for every question are shown now. */
function mlb_finish(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId'];
    $s = mlb_session($mid, (string)($p['sessionId'] ?? '')); if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$s['finishedAt'] !== '') return ['ok' => false, 'error' => 'finished'];
    db_update('mlab_sessions', ['finishedAt' => now_iso()], ['sessionId' => $s['sessionId']]);
    $items = json_decode((string)$s['items'], true); $resp = json_decode((string)$s['resp'], true) ?: [];
    $review = []; $right = 0; $fast = 0; $missed = [];
    foreach ($items as $i => $x) {
        $it = mlb_item($x['c'], $x['f'], $x['s']); $r = $resp[$i] ?? null; $ok = $r && $r['ok'];
        if ($ok) { $right++; if ($r['ms'] > 0 && $r['ms'] <= (int)$it['secs'] * 1000) $fast++; } else $missed[$x['c']] = true;
        $review[] = ['comp' => $x['c'], 'stem' => $it['stem'], 'lines' => $it['lines'] ?? null, 'diagram' => $it['diagram'] ?? null, 'your' => $r['a'] ?? '', 'options' => $it['options'] ?? null,
            'correct' => (bool)$ok, 'answer' => mlb_answer_text($it), 'steps' => $it['steps']];
    }
    $n = count($items); $pct = $n ? (int)round($right * 100 / $n) : 0;
    $mode = (string)$s['mode']; $ref = (string)$s['ref']; $xp = 0; $msg = ''; $changes = [];
    $states = mlb_states($mid); $now = time();
    $setGood = function (string $c, string $state, int $days) use ($mid, $now, &$changes, $states) {
        if (mlb_rank($states[$c]['state'] ?? 'none') >= mlb_rank($state)) return;
        mlb_set_state($mid, $c, ['state' => $state, 'p' => max((float)($states[$c]['p'] ?? 0), 0.9), 'fast' => $state === 'known' ? 1 : 0,
            'nextReview' => $days ? gmdate('Y-m-d', $now + $days * 86400) : '', 'masteredAt' => in_array($state, ['mastered', 'known'], true) ? now_iso() : (string)($states[$c]['masteredAt'] ?? '')]);
        $changes[] = ['comp' => $c, 'to' => $state];
    };
    if ($mode === 'climb') {
        $st = (int)$ref; $prof = mlb_profile($mid); $comps = mlb_stages()[$st]['comps'];
        if ($right === $n && $fast >= $n - 1) {
            foreach ($comps as $c) $setGood($c, 'known', 5);
            $next = $st + 1; $done = !mlb_stage_available($next) ? 1 : 0;
            db_update('mlab_profile', ['climbStage' => $next, 'climbDone' => $done, 'momentum' => (int)$prof['momentum'] + 1, 'updatedAt' => now_iso()], ['memberId' => $mid]);
            $xp = mlb_award_xp($mid, 50);
            $msg = $done ? 'Stage ' . $st . ' cleared — you have climbed as far as the Lab teaches so far.' : 'Stage ' . $st . ' cleared. On to Stage ' . $next . '.';
        } elseif ($right >= $n - 2) {
            foreach ($comps as $c) { if (isset($missed[$c])) { mlb_set_state($mid, $c, ['state' => 'learning']); $changes[] = ['comp' => $c, 'to' => 'learning']; } else $setGood($c, 'known', 5); }
            db_update('mlab_profile', ['climbDone' => 1, 'momentum' => 0, 'updatedAt' => now_iso()], ['memberId' => $mid]);
            $xp = mlb_award_xp($mid, 30);
            $msg = 'You know most of Stage ' . $st . '. Your learning starts with the topics you missed.';
        } else {
            db_update('mlab_profile', ['climbDone' => 1, 'momentum' => 0, 'updatedAt' => now_iso()], ['memberId' => $mid]);
            $msg = 'This is your level: your learning starts in Stage ' . $st . '.';
        }
    } elseif ($mode === 'check') {
        if ($pct >= MLB_CHECK_PASS) { $setGood($ref, 'mastered', 10); $xp = mlb_award_xp($mid, 100); $msg = 'Mastered! A quick review in about 10 days will make it stick.'; }
        else { mlb_set_state($mid, $ref, ['state' => 'practising', 'p' => min((float)($states[$ref]['p'] ?? 0.5), 0.7), 'owed' => MLB_RETAKE_OWED]);
               $msg = 'Not yet — ' . $pct . '%. The bar is ' . MLB_CHECK_PASS . '%. Go back over the worked solutions below, then get ' . MLB_RETAKE_OWED . ' practice questions right without hints before you try the check again.'; }
    } elseif ($mode === 'review') {
        foreach ($items as $i => $x) {
            $c = $x['c']; $cur = (string)($states[$c]['state'] ?? 'none'); $ok = !empty($resp[$i]['ok']);
            if ($ok) { $to = $cur === 'mastered' || $cur === 'known' ? 'secure' : 'longterm'; mlb_set_state($mid, $c, ['state' => $to, 'nextReview' => $to === 'secure' ? gmdate('Y-m-d', $now + 45 * 86400) : '']); $changes[] = ['comp' => $c, 'to' => $to]; $xp += mlb_award_xp($mid, 50); }
            else { mlb_set_state($mid, $c, ['state' => 'review', 'p' => 0.5, 'nextReview' => '']); $changes[] = ['comp' => $c, 'to' => 'review']; }
        }
        $msg = $right === $n ? 'Everything held. Brilliant memory.' : 'Some topics slipped — they are marked for a quick refresh.';
    } elseif ($mode === 'boss') {
        if ($pct >= MLB_BOSS_PASS) {
            $prof = mlb_profile($mid); $b = json_decode((string)$prof['bosses'], true) ?: []; $b[$ref] = mlb_today();
            db_update('mlab_profile', ['bosses' => json_encode($b), 'updatedAt' => now_iso()], ['memberId' => $mid]);
            $xp = mlb_award_xp($mid, 300); $msg = 'Boss defeated — Stage ' . $ref . ' is complete.';
        } else {
            /* A lost boss is not retried at once: every topic it caught you out on goes back to
               practice, owes MLB_RETAKE_OWED unaided right answers and a fresh mastery check, and the
               boss stays locked until they are mastered again. */
            foreach (array_keys($missed) as $c) { mlb_set_state($mid, $c, ['state' => 'practising', 'p' => min((float)($states[$c]['p'] ?? 0.6), 0.6), 'owed' => MLB_RETAKE_OWED]); $changes[] = ['comp' => $c, 'to' => 'practising']; }
            $msg = 'The boss wins this time (' . $pct . '%, need ' . MLB_BOSS_PASS . '%). The ' . count($missed) . ' topic' . (count($missed) === 1 ? '' : 's') . ' it caught you on ' . (count($missed) === 1 ? 'is' : 'are') . ' back in practice: master ' . (count($missed) === 1 ? 'it' : 'them') . ' again, then face the boss.';
        }
    } elseif ($mode === 'mini') {
        /* Light, unlike the full review: a right answer pushes a known topic's next review further
           off; a wrong one sends a known topic back to "review" so it comes back soon. */
        foreach ($items as $i => $x) {
            $c = $x['c']; $cur = (string)($states[$c]['state'] ?? 'none'); $ok = !empty($resp[$i]['ok']);
            if ($ok && in_array($cur, MLB_GOOD, true)) mlb_set_state($mid, $c, ['nextReview' => gmdate('Y-m-d', $now + 21 * 86400)]);
            elseif (!$ok && in_array($cur, MLB_GOOD, true)) { mlb_set_state($mid, $c, ['state' => 'review', 'nextReview' => '']); $changes[] = ['comp' => $c, 'to' => 'review']; }
        }
        $xp = mlb_award_xp($mid, 5 * $right);
        $msg = $right === $n ? 'Everything you looked back at held. That is what makes it stick.' : ($n - $right) . ' slipped a little — ' . (($n - $right) === 1 ? 'it is' : 'they are') . ' marked for a quick refresh, so ' . (($n - $right) === 1 ? 'it comes' : 'they come') . ' back soon.';
    } elseif ($mode === 'exam') {
        $exam = mlb_exam_report($ref, $items, $resp, (string)$s['startedAt']);
        $xp = mlb_award_xp($mid, 2 * $right);
        $weak = array_slice(array_keys(array_filter($exam['areas'], static fn($a) => $a['total'] > 0 && $a['right'] / $a['total'] < 0.6)), 0, 3);
        $msg = $exam['scoreText'] . '. ' . ($weak ? 'Work on ' . implode(', ', $weak) . ' next — the questions you missed are below, with full working.' : 'Strong across every area. Try another paper: every one is new.');
    } else {
        /* Practice says what to DO next, not the score twice: the screen already shows the score. */
        $msg = $pct >= 85 ? 'Strong work. Keep practising until the mastery check opens.'
             : ($pct >= 50 ? 'Getting there. Read the worked solutions for the ones you missed, then practise again.'
             : 'Go back over the lesson’s worked example, read the solutions below, then try again.');
    }
    mlb_touch_streak($mid);
    // A session can be the one that completes a course: its certificate is issued now, not when somebody thinks to press a button.
    $certs = mlb_issue_certificates($mid, $mode === 'boss' && $pct >= MLB_BOSS_PASS ? [(int)$ref => $pct] : []);
    return ['ok' => true, 'mode' => $mode, 'right' => $right, 'total' => $n, 'pct' => $pct, 'fast' => $fast, 'xp' => $xp, 'message' => $msg, 'changes' => $changes, 'review' => $review,
            'certificates' => $certs] + ($mode === 'exam' ? ['exam' => $exam] : []) + ($mode === 'practice' ? ['mini' => mlb_mini_status($mid)] : []);
}

/* ── Reading the map ── */
function mlb_due(array $states): array {
    $today = mlb_today(); $out = [];
    foreach ($states as $c => $s) if ((string)$s['nextReview'] !== '' && (string)$s['nextReview'] <= $today && in_array($s['state'], ['known', 'mastered', 'secure'], true)) $out[] = $c;
    return $out;
}
function mlb_next(array $prof, array $states): array {
    /* kind (what sort of step), title (the topic or gate, on its own) and what (one sentence a child
       understands) let Home lay the next step out as a card rather than one long button label. */
    if ($due = mlb_due($states)) return ['mode' => 'review', 'label' => 'Review ' . count($due) . ' topic' . (count($due) === 1 ? '' : 's') . ' before they fade', 'count' => count($due),
        'kind' => 'Review', 'title' => count($due) . ' topic' . (count($due) === 1 ? '' : 's') . ' to refresh', 'what' => 'A few quick questions on things you learned before, so you don’t forget them.'];
    if (!(int)$prof['climbDone']) { $cs = (int)$prof['climbStage'];
        return ['mode' => 'climb', 'stage' => $cs, 'label' => 'Continue your climb: Stage ' . $cs . ' gate',
            'kind' => 'Placement', 'title' => 'Stage ' . $cs . ' gate · ' . (mlb_stages()[$cs]['title'] ?? ''), 'what' => MLB_GATE_ITEMS . ' questions. Get them right and quickly and you skip the whole stage; otherwise your learning starts here.']; }
    foreach (mlb_competencies() as $c) if (($states[$c['id']]['state'] ?? '') === 'ready') return ['mode' => 'check', 'comp' => $c['id'], 'label' => 'Prove it: mastery check on ' . $c['title'],
        'kind' => 'Mastery check', 'title' => $c['title'], 'stage' => $c['stage'], 'what' => MLB_CHECK_ITEMS . ' questions, no hints. Pass at ' . MLB_CHECK_PASS . '% and the topic is yours.'];
    foreach (mlb_competencies() as $c) if (in_array($states[$c['id']]['state'] ?? '', ['learning', 'practising', 'review'], true)) return ['mode' => 'practice', 'comp' => $c['id'], 'label' => 'Keep going: ' . $c['title'],
        'kind' => 'Keep going', 'title' => $c['title'], 'stage' => $c['stage'], 'what' => 'Practise until the mastery check opens.'];
    foreach (mlb_competencies() as $c) if (mlb_available($c['id']) && ($states[$c['id']]['state'] ?? 'none') === 'none' && mlb_unlocked($c['id'], $states)) return ['mode' => 'practice', 'comp' => $c['id'], 'label' => 'Start something new: ' . $c['title'],
        'kind' => 'New topic', 'title' => $c['title'], 'stage' => $c['stage'], 'what' => 'Study the lesson step by step, then practise.'];
    return ['mode' => 'none', 'label' => 'You have finished everything the Lab teaches so far.', 'kind' => 'All done', 'title' => 'Every topic is lit', 'what' => 'Your reviews will come back when they are due.'];
}

function mlb_view_state(string $id, array $states): string {
    if (!mlb_available($id)) return 'soon';
    $s = (string)($states[$id]['state'] ?? 'none');
    if ($s === 'none') return mlb_unlocked($id, $states) ? 'open' : 'locked';
    return $s;
}

/** mathslab.home — the learner's dashboard. */
function mlb_home(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $prof = mlb_profile($mid); $states = mlb_states($mid);
    $count = ['mastered' => 0, 'learning' => 0, 'due' => count(mlb_due($states))];
    foreach ($states as $s) { if (in_array($s['state'], MLB_GOOD, true)) $count['mastered']++; elseif (in_array($s['state'], ['learning', 'practising', 'ready', 'review'], true)) $count['learning']++; }
    $avail = count(array_filter(array_keys(mlb_competencies()), 'mlb_available'));
    $enrol = array_column(db_all('SELECT courseId FROM mlab_enrol WHERE memberId = ?', [$mid]), 'courseId');
    /* A course completed before certificates were NGG documents (or by a
       session that ended oddly) is certified here, idempotently; then every
       course carries its certificate's link, in one query. */
    mlb_issue_certificates($mid);
    $certs = mlb_course_certs($mid);
    return ['ok' => true, 'name' => explode(' ', trim((string)$m['fullName']))[0], 'xp' => (int)$prof['xp'], 'level' => mlb_level((int)$prof['xp']),
        'streak' => (int)$prof['streak'], 'freezes' => (int)$prof['freezes'], 'climb' => ['stage' => (int)$prof['climbStage'], 'done' => (bool)$prof['climbDone'], 'momentum' => (int)$prof['momentum']],
        'next' => ($nx = mlb_next($prof, $states)), 'counts' => $count + ['available' => $avail, 'total' => count(mlb_competencies())], 'badges' => mlb_badges($prof, $states), 'roots' => mlb_root_gaps($states, 2),
        /* Where the learner is: the stage the next step is in (the climb's stage while climbing), with its progress. */
        'focus' => (function () use ($nx, $prof, $states) {
            $n = (int)($nx['stage'] ?? ((int)$prof['climbDone'] ? 1 : (int)$prof['climbStage'])); $st = mlb_stages()[$n] ?? mlb_stages()[1];
            return ['stage' => (int)$st['n'], 'title' => (string)$st['title'], 'band' => mlb_band((int)$st['n'])['name'], 'total' => count($st['comps']),
                    'known' => count(array_filter($st['comps'], static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)))];
        })(),
        'certificates' => mlb_cert_list((string)$m['memberId']),
        'daily' => mlb_daily_summary((string)$m['memberId']),
        'mini' => mlb_mini_status((string)$m['memberId']),
        'courses' => array_map(static fn($c) => mlb_course_view($c, $states, $enrol, $prof) + ['certificate' => $certs[$c['id']] ?? null,
            'stageCertificates' => array_values(array_filter(array_map(static fn($n) => isset($certs['stage:' . $n]) ? ['stage' => (int)$n] + $certs['stage:' . $n] : null, $c['stages'])))], array_values(mlb_courses()))];
}
/**
 * Every Maths Lab certificate a member holds, NEWEST FIRST — one list for the
 * Lab's Certificates tab, its Home banner and Progress. Children could not
 * find a certificate after passing a stage: it was a link inside the result,
 * a badge on the map and a line at the foot of Progress, and none of them was
 * a place called "certificates". {no, title, at, url, scope: stage|course}.
 */
function mlb_cert_list(string $mid): array {
    if (!function_exists('doc_view_url')) return [];
    $out = [];
    foreach (db_all("SELECT * FROM documents WHERE kind = 'certificate' AND (sourceKey LIKE ? OR sourceKey LIKE ?) ORDER BY id DESC", ['mlb:' . $mid . ':%', 'mlbs:' . $mid . ':%']) as $d)
        $out[] = ['no' => (string)$d['docNo'], 'title' => doc_cert_title($d), 'at' => (string)$d['issuedAt'], 'url' => doc_view_url($d),
                  'scope' => strncmp((string)$d['sourceKey'], 'mlbs:', 5) === 0 ? 'stage' : 'course'];
    return $out;
}

function mlb_level(int $xp): array {
    $names = ['Apprentice', 'Analyst', 'Strategist', 'Architect', 'Grandmaster']; $bands = [0, 500, 1500, 3500, 7000];
    $i = 0; foreach ($bands as $k => $b) if ($xp >= $b) $i = $k;
    return ['n' => $i + 1, 'name' => $names[$i], 'next' => $bands[$i + 1] ?? null, 'from' => $bands[$i]];
}
function mlb_badges(array $prof, array $states): array {
    $good = count(array_filter($states, static fn($s) => in_array($s['state'], MLB_GOOD, true)));
    $long = count(array_filter($states, static fn($s) => $s['state'] === 'longterm'));
    $bosses = count(json_decode((string)$prof['bosses'], true) ?: []);
    $defs = [['first-star', 'First star', 'Your first topic known or mastered', $good >= 1], ['ten-stars', 'Ten stars', '10 topics known or mastered', $good >= 10],
        ['climber', 'Climber', 'Finished the climb to your level', (bool)$prof['climbDone']], ['boss', 'Boss slayer', 'Defeated a stage boss', $bosses >= 1],
        ['week', 'Seven-day streak', '7 days in a row', (int)$prof['streak'] >= 7], ['memory', 'Iron memory', 'A topic held after two reviews', $long >= 1]];
    return array_map(static fn($d) => ['id' => $d[0], 'name' => $d[1], 'what' => $d[2], 'earned' => (bool)$d[3]], $defs);
}

/** mathslab.map — every stage, every star. */
function mlb_map(array $p): array {
    $m = mlb_member($p); $states = $m ? mlb_states((string)$m['memberId']) : [];
    $prof = $m ? mlb_profile((string)$m['memberId']) : null; $bosses = $prof ? (json_decode((string)$prof['bosses'], true) ?: []) : [];
    $stages = []; $certs = $m ? mlb_course_certs((string)$m['memberId']) : []; $chests = $m ? mlb_chests((string)$m['memberId']) : [];
    foreach (mlb_stages() as $n => $st) {
        $comps = array_map(static fn($id) => ['id' => $id, 'title' => mlb_comp($id)['title'], 'state' => $m ? mlb_view_state($id, $states) : (mlb_available($id) ? 'open' : 'soon')], $st['comps']);
        $stages[] = ['n' => $n, 'title' => $st['title'], 'strand' => $st['strand'], 'band' => mlb_band((int)$n)['name'], 'bandId' => mlb_band((int)$n)['id'], 'level' => mlb_band((int)$n)['level'], 'available' => mlb_stage_available($n), 'comps' => $comps,
            'boss' => isset($bosses[(string)$n]), 'bossReady' => $m && mlb_stage_available($n) && !array_filter($comps, static fn($c) => !in_array($c['state'], MLB_GOOD, true)),
            'certificate' => $certs['stage:' . $n] ?? null,
            'chest' => ['opened' => isset($chests[(int)$n]), 'ready' => $m && count(array_filter($comps, static fn($c) => in_array($c['state'], MLB_GOOD, true))) >= MLB_CHEST_AT],
            'miniReady' => $m && count(array_filter($comps, static fn($c) => !in_array($c['state'], ['none', 'open', 'locked', 'soon'], true))) >= 2];
    }
    $bands = array_map(static fn($b) => ['id' => $b['id'], 'name' => $b['name'], 'level' => $b['level'], 'stages' => $b['from'] === $b['to'] ? 'Stage ' . $b['from'] : 'Stages ' . $b['from'] . '–' . $b['to'],
        'what' => $b['what'], 'topics' => ($b['to'] - $b['from'] + 1) * 10, 'summit' => !empty($b['summit'])], MLB_BANDS);
    return ['ok' => true, 'member' => (bool)$m, 'stages' => $stages, 'bands' => $bands];
}

/** mathslab.studied — the member worked through the topic's lesson, step by step (the client
 *  calls it on reaching Practise). Recorded once; it is what lets practice and the check open. */
function mlb_mark_studied(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $comp = (string)($p['comp'] ?? '');
    if (!mlb_comp($comp) || !mlb_available($comp)) return ['ok' => false, 'error' => 'not_available'];
    $states = mlb_states($mid);
    if (!mlb_unlocked($comp, $states)) return ['ok' => false, 'error' => 'locked'];
    if ((string)($states[$comp]['studiedAt'] ?? '') === '') mlb_set_state($mid, $comp, ['studiedAt' => now_iso()]);
    return ['ok' => true, 'studied' => true];
}

/** mathslab.comp — one competency: what it is, a worked example, where the learner stands. */
function mlb_comp_view(array $p): array {
    $id = (string)($p['comp'] ?? ''); $c = mlb_comp($id); if (!$c) return ['ok' => false, 'error' => 'not_found'];
    $m = mlb_member($p); $states = $m ? mlb_states((string)$m['memberId']) : []; $s = $states[$id] ?? null;
    $ex = mlb_available($id) ? mlb_item($id, 0, random_int(1, 2000000000)) : null;
    return ['ok' => true, 'comp' => ['id' => $id, 'title' => $c['title'], 'stage' => $c['stage'], 'stageTitle' => mlb_stages()[$c['stage']]['title'], 'strand' => $c['strand'], 'band' => mlb_band((int)$c['stage'])['id'], 'bandName' => mlb_band((int)$c['stage'])['name'],
        'needs' => array_map(static fn($n) => ['id' => $n, 'title' => mlb_comp($n)['title'], 'state' => mlb_view_state($n, $states), 'ahead' => mlb_need_ahead($id, $n) ? mlb_comp($n)['stage'] : 0], $c['needs'])],
        'state' => $m ? mlb_view_state($id, $states) : (mlb_available($id) ? 'open' : 'soon'), 'p' => $s ? (float)$s['p'] : 0, 'attempts' => $s ? (int)$s['attempts'] : 0,
        'nextReview' => $s ? (string)$s['nextReview'] : '',
        'studied' => $s ? (string)($s['studiedAt'] ?? '') !== '' : false, 'owed' => $s ? (int)($s['owed'] ?? 0) : 0,
        'why' => function_exists('mlb_why_of') ? mlb_why_of($id) : null,
        'example' => $ex ? ['stem' => $ex['stem'], 'diagram' => $ex['diagram'] ?? null, 'lines' => $ex['lines'] ?? null, 'answer' => mlb_answer_text($ex), 'steps' => $ex['steps']] : null];
}

/* ── Courses ── */
/**
 * The furthest stage a learner has REACHED: where the climb placed them, or one past the last
 * stage whose every topic is known. A course opens when its first stage is reached — a child
 * in Stage 2 cannot enrol in Further Mathematics and be told nothing (owner, 5 Nov 2026: "the
 * courses should display a proper lock instead of me clicking enrol and nothing happens").
 */
function mlb_reached_stage(?array $prof, array $states): int {
    $r = max(1, (int)($prof['climbStage'] ?? 1));
    foreach (mlb_stages() as $n => $st) {
        if ($st['comps'] && !array_filter($st['comps'], static fn($id) => !in_array($states[$id]['state'] ?? '', MLB_GOOD, true))) $r = max($r, (int)$n + 1);
    }
    return min($r, count(mlb_stages()));
}
function mlb_course_view(array $c, array $states, array $enrol, ?array $prof): array {
    $ids = []; foreach ($c['stages'] as $st) $ids = array_merge($ids, mlb_stages()[$st]['comps']);
    $avail = array_values(array_filter($ids, 'mlb_available'));
    $done = count(array_filter($ids, static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)));
    $bosses = $prof ? (json_decode((string)$prof['bosses'], true) ?: []) : [];
    $allBoss = !array_filter($c['stages'], static fn($st) => !isset($bosses[(string)$st]));
    return ['id' => $c['id'], 'title' => $c['title'], 'promise' => $c['promise'], 'for' => $c['for'], 'hours' => $c['hours'], 'stages' => $c['stages'],
        'available' => count($avail) === count($ids), 'total' => count($ids), 'done' => $done, 'pct' => count($ids) ? (int)floor($done * 100 / count($ids)) : 0,
        'enrolled' => in_array($c['id'], $enrol, true), 'complete' => $done === count($ids) && $allBoss && count($avail) === count($ids),
        /* The path inside the course, so a child can see what it holds and where they are in it:
           each stage by name, how many of its topics they know, and whether its boss is beaten. */
        'stageRows' => array_map(static function ($n) use ($states, $bosses) {
            $st = mlb_stages()[$n];
            return ['stage' => (int)$n, 'title' => $st['title'], 'total' => count($st['comps']), 'boss' => isset($bosses[(string)$n]),
                'known' => count(array_filter($st['comps'], static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)))];
        }, $c['stages'])]
        + mlb_course_lock($c, $states, $prof) + ['next' => (function () use ($ids, $states) {
            // Where "Continue" takes you: the course's first topic not yet known that is open to you.
            foreach ($ids as $id) if (mlb_available($id) && !in_array($states[$id]['state'] ?? '', MLB_GOOD, true) && mlb_unlocked($id, $states)) return ['comp' => $id, 'title' => mlb_comp($id)['title']];
            return null;
        })()];
}
/** {locked, lockReason} — the reason names the stage to finish and how far along it is. */
function mlb_course_lock(array $c, array $states, ?array $prof): array {
    $first = (int)$c['stages'][0];
    if ($first <= mlb_reached_stage($prof, $states)) return ['locked' => false, 'lockReason' => ''];
    $prev = mlb_stages()[$first - 1];
    $known = count(array_filter($prev['comps'], static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)));
    return ['locked' => true, 'lockReason' => 'Opens at Stage ' . $first . '. Know all of Stage ' . ($first - 1) . ' (' . $prev['title'] . ') first — ' . $known . ' of ' . count($prev['comps']) . ' so far.'];
}
function mlb_enrol(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $cid = (string)($p['courseId'] ?? ''); if (!isset(mlb_courses()[$cid])) return ['ok' => false, 'error' => 'not_found'];
    $lock = mlb_course_lock(mlb_courses()[$cid], mlb_states((string)$m['memberId']), mlb_profile((string)$m['memberId']));
    if ($lock['locked']) return ['ok' => false, 'error' => 'course_locked', 'detail' => $lock['lockReason']];
    if (!db_row('SELECT 1 FROM mlab_enrol WHERE memberId = ? AND courseId = ?', [$m['memberId'], $cid])) db_insert('mlab_enrol', ['memberId' => $m['memberId'], 'courseId' => $cid, 'enrolledAt' => now_iso()]);
    return ['ok' => true];
}
/**
 * Every course this member has just completed gets its certificate — an NGG
 * document (documents.php: numbered, verifiable at /verify, under the
 * family's Documents). Idempotent: a course already certified is skipped.
 * Returns the ones issued NOW, so the session result can say so.
 */
function mlb_issue_certificates(string $mid, array $bossPct = []): array {
    if (!function_exists('doc_mlb_issue')) return [];
    $states = mlb_states($mid); $prof = mlb_profile($mid); $out = [];
    /* Every ten topics first: a stage certificate when all ten are mastered and
       the boss is beaten (the "semi" certificate); the course certificate,
       the full one, only after every stage of the course. */
    $bosses = json_decode((string)$prof['bosses'], true) ?: [];
    foreach (mlb_stages() as $n => $st) {
        if (!isset($bosses[(string)$n]) || !mlb_stage_available((int)$n)) continue;
        if (array_filter($st['comps'], static fn($id) => !in_array($states[$id]['state'] ?? '', MLB_GOOD, true))) continue;
        $r = doc_mlb_stage_issue($mid, (int)$n, $bossPct[(int)$n] ?? null);
        if ($r && $r[1]) {
            // What the celebration says next: the stage that opens now, by name.
            $nx = mlb_stages()[(int)$n + 1] ?? null;
            $out[] = ['scope' => 'stage', 'stage' => (int)$n, 'title' => 'Stage ' . $n . ': ' . $st['title'], 'stageTitle' => $st['title'], 'topics' => count($st['comps']),
                'next' => $nx && mlb_stage_available((int)$n + 1) ? ['stage' => (int)$n + 1, 'title' => $nx['title']] : null,
                'no' => (string)$r[0]['docNo'], 'url' => doc_view_url($r[0])];
        }
    }
    foreach (mlb_courses() as $cid => $c) {
        if (!mlb_course_view($c, $states, [], $prof)['complete']) continue;
        $r = doc_mlb_issue($mid, (string)$cid);
        if ($r && $r[1]) $out[] = ['scope' => 'course', 'course' => $c['title'], 'title' => $c['title'], 'no' => (string)$r[0]['docNo'], 'url' => doc_view_url($r[0])];
    }
    return $out;
}

/**
 * mathslab.progress — where a learner stands, and what to do about it.
 *
 * Progress used to be four numbers and the badges: nothing a child or a
 * parent could act on. This reads what the Lab already records:
 *   · each open stage: topics mastered of ten, the boss, its certificate;
 *   · every certificate earned (stage and course), each a link to the document;
 *   · the mistakes that keep coming back: wrong answers over the last 40
 *     sessions, grouped by topic, with the misconception the wrong option
 *     names (or the item's hint for a typed answer), so "practise this" has a
 *     reason attached;
 *   · the last fourteen days: questions answered, right, and "sure but wrong"
 *     — the confidence check's reason for existing.
 * Nothing new is stored: sessions keep the seed of every item, so each one is
 * re-generated exactly as it was asked and re-marked against the same answer.
 */
function mlb_progress(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $states = mlb_states($mid); $prof = mlb_profile($mid);
    $bosses = json_decode((string)$prof['bosses'], true) ?: []; $certs = mlb_course_certs($mid);
    $stages = [];
    foreach (mlb_stages() as $n => $st) {
        if (!mlb_stage_available((int)$n)) continue;
        $done = count(array_filter($st['comps'], static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)));
        $touched = count(array_filter($st['comps'], static fn($id) => ($states[$id]['state'] ?? 'none') !== 'none'));
        $stages[] = ['n' => (int)$n, 'title' => (string)$st['title'], 'strand' => (string)$st['strand'], 'mastered' => $done, 'total' => count($st['comps']),
                     'started' => $touched > 0, 'boss' => isset($bosses[(string)$n]), 'certificate' => $certs['stage:' . $n] ?? null];
    }
    $certList = mlb_cert_list($mid);

    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 14 * 86400);
    $miss = []; $recent = ['answered' => 0, 'right' => 0, 'sureWrong' => 0];
    foreach (db_all('SELECT items, resp, startedAt FROM mlab_sessions WHERE memberId = ? ORDER BY startedAt DESC LIMIT 40', [$mid]) as $se) {
        $items = json_decode((string)$se['items'], true) ?: []; $resp = json_decode((string)$se['resp'], true) ?: [];
        foreach ($resp as $i => $r) {
            if (!isset($items[$i])) continue;
            $inWindow = (string)$se['startedAt'] >= $since;
            if ($inWindow) { $recent['answered']++; if (!empty($r['ok'])) $recent['right']++; elseif (($r['conf'] ?? '') === 'sure') $recent['sureWrong']++; }
            if (!empty($r['ok'])) continue;
            $x = $items[$i]; $c = (string)$x['c'];
            $why = '';
            if ($it = mlb_item($c, (int)$x['f'], (int)$x['s'])) {
                $mk = mlb_mark($it, $r['a'] ?? '');
                $why = (string)($mk['why'] ?? '') ?: ($it['kind'] === 'error' ? (string)($it['steps'][0] ?? '') : (string)$it['hint']);
            }
            $miss[$c] ??= ['comp' => $c, 'title' => (string)(mlb_comp($c)['title'] ?? $c), 'wrong' => 0, 'why' => $why, 'last' => (string)$se['startedAt']];
            $miss[$c]['wrong']++;
        }
    }
    // A topic since mastered is not a mistake to chase any more.
    $miss = array_values(array_filter($miss, static fn($x) => !in_array($states[$x['comp']]['state'] ?? '', MLB_GOOD, true)));
    usort($miss, static fn($a, $b) => [$b['wrong'], $b['last']] <=> [$a['wrong'], $a['last']]);
    return ['ok' => true, 'stages' => $stages, 'certificates' => $certList, 'mistakes' => array_slice($miss, 0, 6), 'recent' => $recent,
            'level' => mlb_level((int)$prof['xp']), 'xp' => (int)$prof['xp'], 'streak' => (int)$prof['streak'], 'due' => count(mlb_due($states)),
            'badges' => mlb_badges($prof, $states), 'roots' => mlb_root_gaps($states),
            'bands' => array_map(static function ($b) use ($states) {
                $ids = array_merge(...array_map(static fn($n) => mlb_stages()[$n]['comps'], range($b['from'], $b['to'])));
                return ['name' => $b['name'], 'level' => $b['level'], 'total' => count($ids), 'mastered' => count(array_filter($ids, static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)))];
            }, MLB_BANDS)];
}

/**
 * “No neglected foundations”: for each topic the learner is struggling with, walk its prerequisites
 * back to the EARLIEST ones that are not yet known — the real gap. A child failing quadratics is
 * often failing factorisation, which is often failing multiplication tables; practising quadratics
 * harder fixes nothing. A prerequisite from a later stage (mlb_need_ahead) is not a gap.
 * Returns up to $max roots: {comp, title, stage, behind: [titles of the struggling topics]}.
 */
function mlb_root_gaps(array $states, int $max = 4): array {
    $good = static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true);
    $struggling = [];
    foreach ($states as $id => $st) {
        if ($good($id) || !mlb_comp((string)$id)) continue;
        $att = (int)($st['attempts'] ?? 0); $p = (float)($st['p'] ?? 0);
        if ($att >= 4 && $p < 0.6) $struggling[] = (string)$id;
    }
    $roots = [];
    foreach ($struggling as $id) {
        $seen = []; $stack = [$id]; $found = [];
        while ($stack) {
            $c = array_pop($stack);
            foreach (mlb_comp($c)['needs'] ?? [] as $need) {
                if (isset($seen[$need]) || !mlb_available($need) || mlb_need_ahead($c, $need) || $good($need)) continue;
                $seen[$need] = true; $stack[] = $need;
                $open = array_filter(mlb_comp($need)['needs'], static fn($n) => mlb_available($n) && !mlb_need_ahead($need, $n) && !$good($n));
                if (!$open) $found[] = $need;   // everything under it is known: this is where to start
            }
        }
        foreach ($found as $r) { $roots[$r] ??= ['comp' => $r, 'title' => mlb_comp($r)['title'], 'stage' => mlb_comp($r)['stage'], 'behind' => []]; $roots[$r]['behind'][] = mlb_comp($id)['title']; }
    }
    $roots = array_values($roots);
    usort($roots, static fn($a, $b) => [count($b['behind']), mlb_num($a['comp'])] <=> [count($a['behind']), mlb_num($b['comp'])]);
    return array_slice($roots, 0, $max);
}

/** courseId (and "stage:N") => {no, url} for every Maths Lab certificate this member holds (one query). */
function mlb_course_certs(string $mid): array {
    if (!function_exists('doc_view_url')) return [];
    $out = [];
    foreach (db_all("SELECT * FROM documents WHERE kind = 'certificate' AND (sourceKey LIKE ? OR sourceKey LIKE ?)", ['mlb:' . $mid . ':%', 'mlbs:' . $mid . ':%']) as $d) {
        $k = (string)$d['sourceKey'];
        $key = str_starts_with($k, 'mlbs:') ? 'stage:' . substr($k, strlen('mlbs:' . $mid . ':')) : substr($k, strlen('mlb:' . $mid . ':'));
        $out[$key] = ['no' => (string)$d['docNo'], 'url' => doc_view_url($d)];
    }
    return $out;
}

/** mathslab.certificate — a completed course's certificate: the NGG document, issued on first ask if the finish did not. */
function mlb_certificate(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $cid = (string)($p['courseId'] ?? ''); $c = mlb_courses()[$cid] ?? null; if (!$c) return ['ok' => false, 'error' => 'not_found'];
    $v = mlb_course_view($c, mlb_states((string)$m['memberId']), [$cid], mlb_profile((string)$m['memberId']));
    // An issued certificate stands even if a topic has since slipped; only a course never completed is refused.
    $have = function_exists('doc_by') ? doc_by('sourceKey', 'mlb:' . $m['memberId'] . ':' . $cid) : null;
    if (!$v['complete'] && !$have) return ['ok' => false, 'error' => 'not_complete'];
    $r = $have ? [$have, false] : doc_mlb_issue((string)$m['memberId'], $cid);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $doc = $r[0];
    return ['ok' => true, 'name' => (string)$m['fullName'], 'course' => $c['title'], 'stages' => $c['stages'], 'no' => (string)$doc['docNo'],
            'code' => doc_check_code((string)$doc['docNo']), 'url' => doc_view_url($doc), 'verifyUrl' => doc_verify_url((string)$doc['docNo']),
            'date' => substr((string)$doc['issuedAt'], 0, 10)];
}

/* ── Maths Lab Lite (non-members): practice and marking, no record ── */
function mlb_lite_token(array $x): string {
    $body = b64url(json_encode(['c' => $x['c'], 'f' => $x['f'], 's' => $x['s'], 'e' => time() + 3600]));
    return $body . '.' . b64url(hash_hmac('sha256', 'lite|' . $body, (string)($GLOBALS['CONFIG']['cookie_secret'] ?? ''), true));
}
function mlb_lite_item(array $p): array {
    $c = (string)($p['comp'] ?? '');
    if (!mlb_available($c)) return ['ok' => false, 'error' => 'not_available'];
    $x = ['c' => $c, 'f' => random_int(0, count(mlb_forms()[$c]) - 1), 's' => random_int(1, 2000000000)];
    return ['ok' => true, 'token' => mlb_lite_token($x), 'item' => mlb_public(mlb_item($c, $x['f'], $x['s'])) + ['comp' => $c, 'compTitle' => mlb_comp($c)['title']]];
}
function mlb_lite_check(array $p): array {
    $t = (string)($p['token'] ?? ''); $dot = strpos($t, '.');
    if ($dot === false) return ['ok' => false, 'error' => 'bad_token'];
    $body = substr($t, 0, $dot);
    if (!hash_equals(b64url(hash_hmac('sha256', 'lite|' . $body, (string)($GLOBALS['CONFIG']['cookie_secret'] ?? ''), true)), substr($t, $dot + 1))) return ['ok' => false, 'error' => 'bad_token'];
    $x = json_decode(b64url_decode($body), true);
    if (!is_array($x) || (int)($x['e'] ?? 0) < time()) return ['ok' => false, 'error' => 'expired'];
    $it = mlb_item((string)$x['c'], (int)$x['f'], (int)$x['s']); if (!$it) return ['ok' => false, 'error' => 'bad_token'];
    $mk = mlb_mark($it, $p['answer'] ?? '');
    return ['ok' => true, 'correct' => $mk['ok'], 'why' => $mk['why'], 'formNote' => $mk['form'], 'answer' => mlb_answer_text($it), 'steps' => $it['steps']];
}

/* ── The Daily Olympiad Problem ──
 * Owner, 5 Nov 2026: "Add more features" and "Make things tough, but easy". One problem a day
 * from the Gods of Maths stages — the SAME problem for every member that day, so it is something
 * a centre can talk about — with the hint free to open, three tries, and the full worked
 * solution once it is solved or the tries are spent. It is open to everybody, whatever stage they
 * are in: it is a taste of the summit, not a step on the path, so it never moves the map.
 *
 * Stored as an ordinary session (mode 'daily', ref = the day): no new table, the record of the
 * answer is the same shape every other session uses, and Progress's "mistakes that come back"
 * reads it like any other. The problem is chosen from the date alone, never from the request. */
const MLB_DAILY_TRIES = 3;
function mlb_daily_pick(string $day): ?array {
    $pool = [];
    foreach (mlb_competencies() as $id => $c) if ((int)$c['stage'] >= 18 && mlb_available($id)) foreach (mlb_skill_forms($id) as $f) $pool[] = [$id, $f];
    if (!$pool) return null;
    $k = (crc32('mlb-daily|' . $day) & 0x7FFFFFFF) % count($pool);
    return ['c' => $pool[$k][0], 'f' => (int)$pool[$k][1], 's' => (crc32('mlb-daily-seed|' . $day) & 0x7FFFFFFF) ?: 1];
}
function mlb_daily_row(string $mid, string $day): ?array {
    return db_row("SELECT * FROM mlab_sessions WHERE memberId = ? AND mode = 'daily' AND ref = ?", [$mid, $day]);
}
/** Days solved in a row (today, or up to yesterday while today is still open), and in all. */
function mlb_daily_streak(string $mid): array {
    $solved = [];
    foreach (db_all("SELECT ref, resp FROM mlab_sessions WHERE memberId = ? AND mode = 'daily' ORDER BY ref DESC LIMIT 500", [$mid]) as $r) {
        $x = (json_decode((string)$r['resp'], true) ?: [])[0] ?? null; if ($x && !empty($x['ok'])) $solved[(string)$r['ref']] = true;
    }
    $day = mlb_today(); $t = strtotime($day . 'T12:00:00Z'); $run = 0;
    if (!isset($solved[$day])) $t -= 86400;
    while (isset($solved[gmdate('Y-m-d', $t)])) { $run++; $t -= 86400; }
    return ['dailyStreak' => $run, 'dailySolved' => count($solved)];
}
function mlb_daily_state(?array $row): array {
    $r = $row ? ((json_decode((string)$row['resp'], true) ?: [])[0] ?? null) : null;
    $tries = (int)($r['tries'] ?? 0); $ok = !empty($r['ok']);
    return ['tries' => $tries, 'solved' => $ok, 'done' => $ok || $tries >= MLB_DAILY_TRIES, 'hints' => (int)($r['hints'] ?? 0)];
}
/** What Home says about today's problem: is it waiting, solved, or spent — and the run. */
function mlb_daily_summary(string $mid): ?array {
    $day = mlb_today(); $x = mlb_daily_pick($day); if (!$x) return null;
    $c = mlb_comp($x['c']); $st = mlb_daily_state(mlb_daily_row($mid, $day));
    return ['day' => $day, 'compTitle' => $c['title'], 'stage' => (int)$c['stage'], 'solved' => $st['solved'], 'done' => $st['done'], 'tries' => $st['tries']] + mlb_daily_streak($mid);
}
/** mathslab.daily — today's problem, and once it is over, its answer and worked solution. */
function mlb_daily(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $day = mlb_today(); $x = mlb_daily_pick($day);
    if (!$x) return ['ok' => false, 'error' => 'not_available'];
    $it = mlb_item($x['c'], $x['f'], $x['s']); $c = mlb_comp($x['c']); $st = mlb_daily_state(mlb_daily_row($mid, $day));
    $out = ['ok' => true, 'day' => $day, 'maxTries' => MLB_DAILY_TRIES, 'item' => mlb_public($it) + ['comp' => $x['c'], 'compTitle' => $c['title'], 'stage' => (int)$c['stage'], 'stageTitle' => mlb_stages()[(int)$c['stage']]['title']]]
        + $st + mlb_daily_streak($mid);
    if ($st['done']) $out += ['answer' => mlb_answer_text($it), 'steps' => $it['steps']];
    return $out;
}
/** mathslab.dailyAnswer — one try at today's problem. Marked on the server against the item rebuilt from the date. */
function mlb_daily_answer(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $day = mlb_today(); $x = mlb_daily_pick($day);
    if (!$x) return ['ok' => false, 'error' => 'not_available'];
    $row = mlb_daily_row($mid, $day);
    if (!$row) {
        // One row per member per day: the id is derived, so a double press cannot make two.
        $sid = 'MLD-' . strtoupper(substr(sha1($mid . '|' . $day), 0, 16));
        try { db_insert('mlab_sessions', ['sessionId' => $sid, 'memberId' => $mid, 'mode' => 'daily', 'ref' => $day, 'items' => json_encode([$x]), 'resp' => '{}', 'startedAt' => now_iso(), 'finishedAt' => '']); } catch (\Throwable $e) {}
        $row = mlb_daily_row($mid, $day); if (!$row) return ['ok' => false, 'error' => 'failed'];
    }
    $st = mlb_daily_state($row);
    if ($st['done']) return ['ok' => false, 'error' => 'already_done'];
    $it = mlb_item($x['c'], $x['f'], $x['s']); $mk = mlb_mark($it, $p['answer'] ?? '');
    $tries = $st['tries'] + 1; $hints = max($st['hints'], min(2, max(0, (int)($p['hints'] ?? 0))));
    $resp = [0 => ['ok' => $mk['ok'], 'tries' => $tries, 'hints' => $hints, 'ms' => max(0, (int)($p['ms'] ?? 0)), 'conf' => '',
        'a' => is_array($p['answer'] ?? null) ? $p['answer'] : mb_substr((string)($p['answer'] ?? ''), 0, 120)]];
    $done = $mk['ok'] || $tries >= MLB_DAILY_TRIES;
    db_update('mlab_sessions', ['resp' => json_encode($resp), 'finishedAt' => $done ? now_iso() : ''], ['sessionId' => $row['sessionId']]);
    // Solved alone at the first try is the summit's full reward; solved with help or a second try still pays.
    $xp = $mk['ok'] ? mlb_award_xp($mid, $tries === 1 && $hints === 0 ? 50 : 25) : 0;
    if ($mk['ok']) mlb_touch_streak($mid);
    $out = ['ok' => true, 'correct' => $mk['ok'], 'why' => $mk['why'], 'formNote' => $mk['form'], 'tries' => $tries, 'left' => MLB_DAILY_TRIES - $tries, 'done' => $done, 'solved' => $mk['ok'], 'xp' => $xp]
        + mlb_daily_streak($mid);
    if ($done) $out += ['answer' => mlb_answer_text($it), 'steps' => $it['steps']];
    return $out;
}

/* ── Exam practice papers (JAMB-style and SAT-style) ──
 * Owner, 5 Nov 2026: "Proceed. Adapt them all over", after sending JAMB Mathematics past
 * papers and a digital SAT practice test with its scoring guides. A paper is drawn fresh every
 * time from the Lab's own forms — the exam-style ones written for it (mathslab-gen-exam.php)
 * first, then other forms of the same shape from the topics that exam examines — so it is never
 * a copy of a past paper and never the same twice.
 *
 *   · JAMB (UTME): 40 five-option questions, 40 minutes, number to calculus (Stages 3–16).
 *     The UTME reports each subject out of 100, so the score is the percentage right.
 *   · SAT: one Math module as in the practice test supplied: 27 questions, 43 minutes; about a
 *     quarter are typed "student-produced responses", the rest four-option choice. The section
 *     score (200–800) is only an ESTIMATE from the percentage, said so on screen — the College
 *     Board's own conversion varies with each test form and is not ours to reproduce.
 *
 * The clock is the server's (mlb_answer refuses an answer after the time), a paper never moves
 * the map, and the report breaks the score down by area so the next step is named. */
const MLB_EXAM_GRACE = 30;
const MLB_PAPERS = [
    'jamb' => ['id' => 'jamb', 'title' => 'JAMB-style practice paper', 'exam' => 'jamb', 'n' => 40, 'minutes' => 40, 'stages' => [3, 16], 'typed' => 0,
        'what' => '40 questions, A–E, in 40 minutes: number and numeration, algebra, geometry and trigonometry, statistics and calculus — the UTME Mathematics syllabus.'],
    'sat'  => ['id' => 'sat', 'title' => 'SAT-style Math module', 'exam' => 'sat', 'n' => 27, 'minutes' => 43, 'stages' => [3, 12], 'extra' => [94, 98, 104, 111, 147, 166, 167], 'typed' => 7,
        'what' => '27 questions in 43 minutes, like one Math module of the digital SAT: algebra, advanced maths, problem-solving and data, geometry and trigonometry. About a quarter need a typed answer.'],
];
/** The forms a paper may draw: [comp, form, tagged?, typed?] — the paper's own exam-style forms and every other form of the right shape in its syllabus. */
function mlb_exam_pool(string $paper): array {
    static $cache = [];
    if (isset($cache[$paper])) return $cache[$paper];
    $P = MLB_PAPERS[$paper]; $out = [];
    foreach (mlb_competencies() as $id => $c) {
        $in = ((int)$c['stage'] >= $P['stages'][0] && (int)$c['stage'] <= $P['stages'][1]) || in_array((int)$c['n'], $P['extra'] ?? [], true);
        if (!$in || !mlb_available($id)) continue;
        foreach (mlb_skill_forms($id) as $f) {
            $it = mlb_item($id, $f, 1); $tag = (string)($it['exam'] ?? '');
            if ($tag !== '' && $tag !== $P['exam']) continue;
            $typed = in_array($it['kind'], ['num', 'frac'], true);
            if ($it['kind'] === 'mcq' || ($P['typed'] > 0 && $typed)) $out[] = [$id, (int)$f, $tag === $P['exam'], $typed];
        }
    }
    return $cache[$paper] = $out;
}
/** Draw a paper: its own exam-style forms first (about two thirds), each topic at most once, in syllabus order. */
function mlb_exam_pick(string $paper): array {
    $P = MLB_PAPERS[$paper]; $pool = mlb_exam_pool($paper); shuffle($pool);
    $n = $P['n']; $wantTyped = $P['typed']; $own = (int)round($n * 2 / 3);
    $picked = []; $used = []; $typed = 0;
    $take = static function (array $cand, int $limit) use (&$picked, &$used, &$typed, $n, $wantTyped, $P) {
        foreach ($cand as [$c, $f, $tag, $isTyped]) {
            if (count($picked) >= $limit || count($picked) >= $n) return;
            if (isset($used[$c])) continue;
            if ($isTyped && $typed >= $wantTyped) continue;
            if (!$isTyped && $wantTyped > 0 && ($n - count($picked)) <= ($wantTyped - $typed)) continue;   // keep room for the typed ones
            // A form can branch by seed: the item actually drawn must have the paper's shape.
            for ($t = 0; $t < 4; $t++) {
                $seed = random_int(1, 2000000000); $it = mlb_item($c, $f, $seed);
                $okShape = $it['kind'] === 'mcq' ? (!$isTyped) : ($isTyped && in_array($it['kind'], ['num', 'frac'], true));
                if (!$okShape) continue;
                $picked[] = ['c' => $c, 'f' => $f, 's' => $seed]; $used[$c] = true; if ($isTyped) $typed++;
                break;
            }
        }
    };
    $take(array_values(array_filter($pool, static fn($x) => $x[2])), $own);
    $take(array_values(array_filter($pool, static fn($x) => !$x[2])), $n);
    if (count($picked) < $n) { $used = []; foreach ($picked as $x) $used[$x['c']] = true; $take($pool, $n); }
    // Syllabus order, number first and calculus last, as a paper reads.
    usort($picked, static fn($a, $b) => mlb_num($a['c']) <=> mlb_num($b['c']));
    return $picked;
}
/** The score, the time used and the right answers by area (the strand of each topic). */
function mlb_exam_report(string $paper, array $items, array $resp, string $startedAt): array {
    $P = MLB_PAPERS[$paper] ?? MLB_PAPERS['jamb']; $areas = []; $right = 0;
    foreach ($items as $i => $x) {
        $a = mlb_comp($x['c'])['strand'] ?? 'Mathematics'; $areas[$a] = $areas[$a] ?? ['right' => 0, 'total' => 0];
        $areas[$a]['total']++; if (!empty($resp[$i]['ok'])) { $areas[$a]['right']++; $right++; }
    }
    $n = max(1, count($items)); $pct = (int)round($right * 100 / $n);
    $used = max(0, time() - (int)strtotime($startedAt)); $limit = 60 * (int)$P['minutes'];
    $answered = count(array_filter($resp, static fn($r) => ($r['a'] ?? '') !== '' && ($r['a'] ?? null) !== []));
    if ($P['exam'] === 'sat') { $scaled = 200 + (int)(round(600 * $right / $n / 10) * 10); $scoreText = 'About ' . $scaled . ' on the 200–800 SAT Math scale (an estimate)'; }
    else { $scaled = $pct; $scoreText = $scaled . ' out of 100, as the UTME reports a subject'; }
    return ['paper' => $P['id'], 'title' => $P['title'], 'scaled' => $scaled, 'scale' => $P['exam'] === 'sat' ? '200–800 (estimate)' : 'out of 100', 'scoreText' => $scoreText,
        'minutes' => (int)$P['minutes'], 'usedSecs' => min($used, $limit + MLB_EXAM_GRACE), 'overTime' => $used > $limit + MLB_EXAM_GRACE, 'answered' => $answered, 'areas' => $areas];
}
/** mathslab.exams — the papers on offer and this member's last papers, newest first. */
function mlb_exams(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $hist = [];
    foreach (db_all("SELECT ref, items, resp, startedAt, finishedAt FROM mlab_sessions WHERE memberId = ? AND mode = 'exam' AND finishedAt <> '' ORDER BY startedAt DESC LIMIT 20", [(string)$m['memberId']]) as $r) {
        $items = json_decode((string)$r['items'], true) ?: []; $resp = json_decode((string)$r['resp'], true) ?: [];
        $right = count(array_filter($resp, static fn($x) => !empty($x['ok']))); $n = max(1, count($items)); $P = MLB_PAPERS[(string)$r['ref']] ?? null; if (!$P) continue;
        $hist[] = ['paper' => $P['id'], 'title' => $P['title'], 'at' => (string)$r['finishedAt'], 'right' => $right, 'total' => count($items), 'pct' => (int)round($right * 100 / $n),
            'scaled' => $P['exam'] === 'sat' ? 200 + (int)(round(600 * $right / $n / 10) * 10) : (int)round($right * 100 / $n)];
    }
    return ['ok' => true, 'papers' => array_values(array_map(static fn($P) => ['id' => $P['id'], 'title' => $P['title'], 'n' => $P['n'], 'minutes' => $P['minutes'], 'what' => $P['what'],
        'best' => array_reduce($hist, static fn($b, $h) => $h['paper'] === $P['id'] ? max($b, $h['scaled']) : $b, null)], MLB_PAPERS)), 'history' => $hist];
}

/* ── The path, Duolingo's way (owner, 5 Nov 2026: "Improve the map feature. Please research.") ──
 * Duolingo's path mixes three things into the run of lessons: a Guidebook for each unit (its key
 * phrases and tips), personalised practice placed along the path and chosen from what is due and
 * from the learner's own mistakes, and chests that reward reaching the middle. The Lab now has
 * all three: a Guidebook per stage, a mini review per stage (and after a long stretch of practice),
 * and a chest once half a stage is known. */
const MLB_MINI_ITEMS = 5;
const MLB_MINI_AFTER = 20;     // answers in a day before a mini review is offered
const MLB_CHEST_AT = 5;        // topics known in a stage to open its chest
const MLB_CHEST_XP = 25;

/** Topics worth looking back at: recent mistakes first, then what was practised longest ago. */
function mlb_mini_pick(string $mid, array $states, int $stage = 0): array {
    $seen = array_filter($states, static fn($s) => (int)($s['attempts'] ?? 0) > 0 || in_array($s['state'] ?? '', MLB_GOOD, true));
    if ($stage) $seen = array_filter($seen, static fn($s, $c) => (int)(mlb_comp($c)['stage'] ?? 0) === $stage, ARRAY_FILTER_USE_BOTH);
    $miss = [];
    foreach (db_all("SELECT items, resp FROM mlab_sessions WHERE memberId = ? AND mode NOT IN ('daily', 'chest') ORDER BY startedAt DESC LIMIT 30", [$mid]) as $r) {
        $items = json_decode((string)$r['items'], true) ?: []; $resp = json_decode((string)$r['resp'], true) ?: [];
        foreach ($items as $i => $x) if (isset($resp[$i]) && empty($resp[$i]['ok']) && isset($seen[$x['c']])) $miss[$x['c']] = ($miss[$x['c']] ?? 0) + 1;
    }
    arsort($miss);
    $old = $seen; uasort($old, static fn($a, $b) => strcmp((string)($a['updatedAt'] ?? ''), (string)($b['updatedAt'] ?? '')));
    $out = array_slice(array_keys($miss), 0, 2);
    foreach (array_keys($old) as $c) { if (count($out) >= MLB_MINI_ITEMS) break; if (!in_array($c, $out, true) && mlb_available($c)) $out[] = $c; }
    return array_values(array_filter($out, 'mlb_available'));
}
/** After a long stretch of practice today, offer a mini review: answers since the last one. */
function mlb_mini_status(string $mid): array {
    $day = mlb_today(); $since = 0; $lastMini = '';
    $rows = db_all("SELECT mode, resp, startedAt FROM mlab_sessions WHERE memberId = ? AND startedAt >= ? ORDER BY startedAt ASC", [$mid, $day]);
    foreach ($rows as $r) {
        if ((string)$r['mode'] === 'mini') { $since = 0; $lastMini = (string)$r['startedAt']; continue; }
        if (in_array((string)$r['mode'], ['daily', 'chest', 'exam'], true)) continue;
        $since += count(json_decode((string)$r['resp'], true) ?: []);
    }
    $topics = count(mlb_mini_pick($mid, mlb_states($mid)));
    return ['ready' => $since >= MLB_MINI_AFTER && $topics >= 2, 'answered' => $since, 'after' => MLB_MINI_AFTER, 'topics' => min($topics, MLB_MINI_ITEMS)];
}

/** Chests opened: stage => day. Recorded as a session row (mode 'chest'), so no new table. */
function mlb_chests(string $mid): array {
    $out = []; foreach (db_all("SELECT ref, startedAt FROM mlab_sessions WHERE memberId = ? AND mode = 'chest'", [$mid]) as $r) $out[(int)$r['ref']] = (string)$r['startedAt'];
    return $out;
}
/** mathslab.chest — open a stage's chest: once, and only when half the stage is known. */
function mlb_chest_open(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId']; $st = (int)($p['stage'] ?? 0); $stage = mlb_stages()[$st] ?? null;
    if (!$stage) return ['ok' => false, 'error' => 'not_found'];
    $states = mlb_states($mid);
    if (count(array_filter($stage['comps'], static fn($c) => in_array($states[$c]['state'] ?? '', MLB_GOOD, true))) < MLB_CHEST_AT) return ['ok' => false, 'error' => 'chest_locked'];
    $sid = 'MLC-' . strtoupper(substr(sha1($mid . '|chest|' . $st), 0, 16));   // derived: a double press cannot open it twice
    try { db_insert('mlab_sessions', ['sessionId' => $sid, 'memberId' => $mid, 'mode' => 'chest', 'ref' => (string)$st, 'items' => '[]', 'resp' => '{}', 'startedAt' => now_iso(), 'finishedAt' => now_iso()]); }
    catch (\Throwable $e) { return ['ok' => false, 'error' => 'already_open']; }
    if (!db_row('SELECT sessionId FROM mlab_sessions WHERE sessionId = ?', [$sid])) return ['ok' => false, 'error' => 'failed'];
    return ['ok' => true, 'xp' => mlb_award_xp($mid, MLB_CHEST_XP), 'stage' => $st];
}

/** mathslab.guide — a stage's Guidebook: each topic's key idea and a worked example (Duolingo's "key phrases"). */
function mlb_guide(array $p): array {
    $st = (int)($p['stage'] ?? 0); $stage = mlb_stages()[$st] ?? null;
    if (!$stage) return ['ok' => false, 'error' => 'not_found'];
    $m = mlb_member($p); $states = $m ? mlb_states((string)$m['memberId']) : [];
    $topics = [];
    foreach ($stage['comps'] as $id) {
        $c = mlb_comp($id); $why = function_exists('mlb_why_of') ? mlb_why_of($id) : null;
        $ex = mlb_available($id) ? mlb_item($id, 0, crc32('guide|' . $id) & 0x7FFFFFFF) : null;
        $topics[] = ['id' => $id, 'title' => $c['title'], 'state' => $m ? mlb_view_state($id, $states) : (mlb_available($id) ? 'open' : 'soon'),
            'idea' => $why['idea'] ?? null, 'claim' => $why['claim'] ?? null, 'tip' => $ex ? (string)$ex['hint'] : null,
            'example' => $ex ? ['stem' => $ex['stem'], 'diagram' => $ex['diagram'] ?? null, 'lines' => $ex['lines'] ?? null, 'answer' => mlb_answer_text($ex), 'steps' => $ex['steps']] : null];
    }
    return ['ok' => true, 'stage' => $st, 'title' => $stage['title'], 'strand' => $stage['strand'], 'band' => mlb_band($st)['name'], 'level' => mlb_band($st)['level'], 'topics' => $topics];
}

