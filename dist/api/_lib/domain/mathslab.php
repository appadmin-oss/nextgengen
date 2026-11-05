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
 * out the two "Why it works" forms a topic carries at the END of its list (mlb_why_forms):
 * those teach the argument and belong in practice and the mastery check — a child placed by
 * "why is line 1 true?" about digit counts is being placed by the wrong question.
 */
function mlb_skill_form_count(string $c): int {
    $n = count(mlb_forms()[$c] ?? []);
    return function_exists('mlb_why') && isset(mlb_why()[$c]) ? max(1, $n - 2) : $n;
}
function mlb_pick_items(array $comps, int $n, bool $preferTyped = false, bool $skillOnly = false): array {
    $items = []; $i = 0; $guard = 0;
    while (count($items) < $n && $guard++ < $n * 6 && $comps) {
        $c = $comps[$i % count($comps)]; $i++;
        $forms = mlb_forms()[$c] ?? []; if (!$forms) continue;
        $nf = $skillOnly ? mlb_skill_form_count($c) : count($forms);
        $f = random_int(0, $nf - 1); $seed = random_int(1, 2000000000);
        if ($preferTyped) {
            for ($t = 0; $t < $nf; $t++) { $it = mlb_item($c, ($f + $t) % $nf, $seed); if (!empty($it['typed'])) { $f = ($f + $t) % $nf; break; } }
        }
        $items[] = ['c' => $c, 'f' => $f, 's' => $seed];
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
    } else return ['ok' => false, 'error' => 'bad_mode'];
    $sid = 'MLS-' . strtoupper(rand_hex(8));
    db_insert('mlab_sessions', ['sessionId' => $sid, 'memberId' => $mid, 'mode' => $mode, 'ref' => $ref, 'items' => json_encode($items), 'resp' => '{}', 'startedAt' => now_iso(), 'finishedAt' => '']);
    return ['ok' => true, 'sessionId' => $sid, 'mode' => $mode, 'ref' => $ref,
        'title' => mlb_session_title($mode, $ref),
        'items' => array_map(static fn($x) => mlb_public(mlb_item($x['c'], $x['f'], $x['s'])) + ['comp' => $x['c'], 'compTitle' => mlb_comp($x['c'])['title']], $items)];
}
function mlb_session_title(string $mode, string $ref): string {
    if ($mode === 'climb') return 'Stage ' . $ref . ' gate · ' . mlb_stages()[(int)$ref]['title'];
    if ($mode === 'boss') return 'Stage ' . $ref . ' boss · ' . mlb_stages()[(int)$ref]['title'];
    if ($mode === 'review') return 'Review: keep what you know';
    $c = mlb_comp($ref); return ($mode === 'check' ? 'Mastery check · ' : 'Practice · ') . ($c['title'] ?? '');
}
function mlb_session(string $mid, string $sid): ?array {
    $s = db_row('SELECT * FROM mlab_sessions WHERE sessionId = ? AND memberId = ?', [$sid, $mid]);
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
            'certificates' => $certs];
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
        'next' => ($nx = mlb_next($prof, $states)), 'counts' => $count + ['available' => $avail, 'total' => 170], 'badges' => mlb_badges($prof, $states), 'roots' => mlb_root_gaps($states, 2),
        /* Where the learner is: the stage the next step is in (the climb's stage while climbing), with its progress. */
        'focus' => (function () use ($nx, $prof, $states) {
            $n = (int)($nx['stage'] ?? ((int)$prof['climbDone'] ? 1 : (int)$prof['climbStage'])); $st = mlb_stages()[$n] ?? mlb_stages()[1];
            return ['stage' => (int)$st['n'], 'title' => (string)$st['title'], 'band' => mlb_band((int)$st['n'])['name'], 'total' => count($st['comps']),
                    'known' => count(array_filter($st['comps'], static fn($id) => in_array($states[$id]['state'] ?? '', MLB_GOOD, true)))];
        })(),
        'courses' => array_map(static fn($c) => mlb_course_view($c, $states, $enrol, $prof) + ['certificate' => $certs[$c['id']] ?? null,
            'stageCertificates' => array_values(array_filter(array_map(static fn($n) => isset($certs['stage:' . $n]) ? ['stage' => (int)$n] + $certs['stage:' . $n] : null, $c['stages'])))], array_values(mlb_courses()))];
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
    $stages = []; $certs = $m ? mlb_course_certs((string)$m['memberId']) : [];
    foreach (mlb_stages() as $n => $st) {
        $comps = array_map(static fn($id) => ['id' => $id, 'title' => mlb_comp($id)['title'], 'state' => $m ? mlb_view_state($id, $states) : (mlb_available($id) ? 'open' : 'soon')], $st['comps']);
        $stages[] = ['n' => $n, 'title' => $st['title'], 'strand' => $st['strand'], 'band' => mlb_band((int)$n)['name'], 'bandId' => mlb_band((int)$n)['id'], 'level' => mlb_band((int)$n)['level'], 'available' => mlb_stage_available($n), 'comps' => $comps,
            'boss' => isset($bosses[(string)$n]), 'bossReady' => $m && mlb_stage_available($n) && !array_filter($comps, static fn($c) => !in_array($c['state'], MLB_GOOD, true)),
            'certificate' => $certs['stage:' . $n] ?? null];
    }
    $bands = array_map(static fn($b) => ['id' => $b['id'], 'name' => $b['name'], 'level' => $b['level'], 'stages' => $b['from'] === $b['to'] ? 'Stage ' . $b['from'] : 'Stages ' . $b['from'] . '–' . $b['to'],
        'what' => $b['what'], 'topics' => ($b['to'] - $b['from'] + 1) * 10], MLB_BANDS);
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
        'enrolled' => in_array($c['id'], $enrol, true), 'complete' => $done === count($ids) && $allBoss && count($avail) === count($ids)]
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
        if ($r && $r[1]) $out[] = ['scope' => 'stage', 'stage' => (int)$n, 'title' => 'Stage ' . $n . ': ' . $st['title'], 'no' => (string)$r[0]['docNo'], 'url' => doc_view_url($r[0])];
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
    $certList = [];
    foreach (db_all("SELECT * FROM documents WHERE kind = 'certificate' AND (sourceKey LIKE ? OR sourceKey LIKE ?) ORDER BY id", ['mlb:' . $mid . ':%', 'mlbs:' . $mid . ':%']) as $d)
        $certList[] = ['no' => (string)$d['docNo'], 'title' => doc_cert_title($d), 'at' => (string)$d['issuedAt'], 'url' => doc_view_url($d)];

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
