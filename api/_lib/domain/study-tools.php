<?php
declare(strict_types=1);

/* ============================================================================
   Study tools (/study) — a member's own learning kit.

     Flashcards   decks of cards, reviewed by spaced repetition: a card you
                  know comes back after days, then weeks; a card you miss comes
                  back today. Made by hand, pasted in ("front — back" a line),
                  or written by the study helper from one of your lessons.
     Focus timer  a 25-minute (or 15 / 45 / 50) study block and its break; each
                  finished block is logged, so the week has a number on it.
     Typing       short passages, timed: speed (words a minute) and accuracy.
   The calculator, graph plotter and dictionary run in the browser and keep
   nothing here.

   Everything is the member's own: every op is scoped to the session's
   memberId, a card or deck of somebody else's is `not_found`, not "forbidden".
   Caps are named in the refusal (STUDY_*_MAX).
   ========================================================================== */

const STUDY_DECKS_MAX = 40;
const STUDY_CARDS_MAX = 500;          // per deck
const STUDY_SIDE_MAX = 600;           // characters a side
const STUDY_DUE_BATCH = 50;
const STUDY_AI_CARDS = 12;

function study_member(array $p): ?array {
    $mid = (string)($p['memberId'] ?? '');
    return $mid === '' ? null : db_row("SELECT memberId, fullName, status FROM members WHERE memberId = ? LIMIT 1", [$mid]);
}

function study_clean_side(string $s): string {
    $s = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '');
    return mb_substr($s, 0, STUDY_SIDE_MAX);
}

/**
 * Spaced repetition (SM-2, the algorithm behind Anki and SuperMemo, simplified
 * to four buttons). grade: 0 again · 1 hard · 2 good · 3 easy.
 * Returns the card's new ease, interval (days) and due moment. Pure.
 */
function study_schedule(array $c, int $grade, int $now): array {
    $ease = (float)($c['ease'] ?? 2.5); $iv = (int)($c['intervalDays'] ?? 0); $reps = (int)($c['reps'] ?? 0); $lapses = (int)($c['lapses'] ?? 0);
    $grade = max(0, min(3, $grade));
    if ($grade === 0) {
        $lapses++; $reps = 0; $iv = 0; $ease = max(1.3, $ease - 0.2);
        $due = $now + 10 * 60;                                   // again: back in ten minutes, today
    } else {
        $q = [1 => 3, 2 => 4, 3 => 5][$grade];                  // SM-2 quality
        $ease = max(1.3, $ease + (0.1 - (5 - $q) * (0.08 + (5 - $q) * 0.02)));
        $reps++;
        if ($reps === 1) $iv = $grade === 3 ? 4 : 1;
        elseif ($reps === 2) $iv = $grade === 1 ? 3 : 6;
        else $iv = (int)max($iv + 1, round($iv * ($grade === 1 ? 1.2 : $ease) * ($grade === 3 ? 1.3 : 1.0)));
        $iv = min($iv, 365);
        $due = $now + $iv * 86400;
    }
    return ['ease' => round($ease, 3), 'intervalDays' => $iv, 'reps' => $reps, 'lapses' => $lapses, 'dueAt' => gmdate('c', $due)];
}

/** member.tools.decks — my decks, each with its size and what is due now. */
function study_decks(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $now = gmdate('c');
    $rows = db_all("SELECT d.deckId, d.name, d.source, d.updatedAt, COUNT(c.id) AS cards,
                           SUM(CASE WHEN c.id IS NOT NULL AND (c.dueAt = '' OR c.dueAt <= ?) THEN 1 ELSE 0 END) AS due,
                           SUM(CASE WHEN c.reps = 0 AND c.id IS NOT NULL THEN 1 ELSE 0 END) AS fresh
                    FROM study_decks d LEFT JOIN study_cards c ON c.deckId = d.deckId
                    WHERE d.memberId = ? GROUP BY d.deckId, d.name, d.source, d.updatedAt ORDER BY d.updatedAt DESC", [$now, (string)$m['memberId']]);
    return ['ok' => true, 'decks' => array_map(static fn($r) => ['deckId' => (string)$r['deckId'], 'name' => (string)$r['name'], 'source' => (string)$r['source'],
        'cards' => (int)$r['cards'], 'due' => (int)$r['due'], 'fresh' => (int)$r['fresh'], 'updatedAt' => (string)$r['updatedAt']], $rows),
        'limits' => ['decks' => STUDY_DECKS_MAX, 'cards' => STUDY_CARDS_MAX]];
}

/** member.tools.deck — one deck with all its cards. */
function study_deck(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $d = db_row('SELECT * FROM study_decks WHERE deckId = ? AND memberId = ? LIMIT 1', [(string)($p['deckId'] ?? ''), (string)$m['memberId']]);
    if (!$d) return ['ok' => false, 'error' => 'not_found'];
    $cards = db_all('SELECT cardId, front, back, reps, intervalDays, dueAt FROM study_cards WHERE deckId = ? ORDER BY id', [(string)$d['deckId']]);
    return ['ok' => true, 'deck' => ['deckId' => (string)$d['deckId'], 'name' => (string)$d['name'], 'source' => (string)$d['source']],
            'cards' => array_map(static fn($c) => ['cardId' => (string)$c['cardId'], 'front' => (string)$c['front'], 'back' => (string)$c['back'],
                'reps' => (int)$c['reps'], 'intervalDays' => (int)$c['intervalDays'], 'dueAt' => (string)$c['dueAt']], $cards)];
}

/**
 * member.tools.deck.save — {deckId?, name, cards: [{cardId?, front, back}]}.
 * The whole list is the deck: a card left out is removed, a card kept keeps its
 * schedule, a new card is due now. Validated whole before any write.
 */
function study_deck_save(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $mid = (string)$m['memberId'];
    $name = mb_substr(trim((string)($p['name'] ?? '')), 0, 80);
    if ($name === '') return ['ok' => false, 'error' => 'name_required', 'fieldErrors' => ['name' => 'Give the deck a name.']];
    $in = is_array($p['cards'] ?? null) ? array_values($p['cards']) : [];
    if (count($in) > STUDY_CARDS_MAX) return ['ok' => false, 'error' => 'too_many_cards', 'max' => STUDY_CARDS_MAX, 'detail' => 'A deck holds at most ' . STUDY_CARDS_MAX . ' cards.'];
    $cards = [];
    foreach ($in as $i => $c) {
        $f = study_clean_side((string)($c['front'] ?? '')); $b = study_clean_side((string)($c['back'] ?? ''));
        if ($f === '' && $b === '') continue;
        if ($f === '' || $b === '') return ['ok' => false, 'error' => 'card_incomplete', 'row' => $i, 'detail' => 'Card ' . ($i + 1) . ' needs both a front and a back.'];
        $cards[] = ['cardId' => preg_match('/^SC-[0-9a-f]{16}$/', (string)($c['cardId'] ?? '')) ? (string)$c['cardId'] : '', 'front' => $f, 'back' => $b];
    }
    $deckId = (string)($p['deckId'] ?? '');
    $now = now_iso();
    if ($deckId !== '') {
        $d = db_row('SELECT * FROM study_decks WHERE deckId = ? AND memberId = ? LIMIT 1', [$deckId, $mid]);
        if (!$d) return ['ok' => false, 'error' => 'not_found'];
    } else {
        $n = (int)(db_row('SELECT COUNT(*) n FROM study_decks WHERE memberId = ?', [$mid])['n'] ?? 0);
        if ($n >= STUDY_DECKS_MAX) return ['ok' => false, 'error' => 'too_many_decks', 'max' => STUDY_DECKS_MAX, 'detail' => 'You can keep ' . STUDY_DECKS_MAX . ' decks. Delete one you have finished with.'];
        $deckId = 'SD-' . rand_hex(8);
        db_insert('study_decks', ['deckId' => $deckId, 'memberId' => $mid, 'name' => $name, 'source' => mb_substr((string)($p['source'] ?? ''), 0, 120), 'createdAt' => $now, 'updatedAt' => $now]);
    }
    $have = [];
    foreach (db_all('SELECT cardId FROM study_cards WHERE deckId = ?', [$deckId]) as $r) $have[(string)$r['cardId']] = true;
    $keep = [];
    foreach ($cards as $c) {
        if ($c['cardId'] !== '' && isset($have[$c['cardId']])) {
            db_exec('UPDATE study_cards SET front = ?, back = ? WHERE cardId = ? AND deckId = ?', [$c['front'], $c['back'], $c['cardId'], $deckId]);
            $keep[$c['cardId']] = true;
        } else {
            $cid = 'SC-' . rand_hex(8);
            db_insert('study_cards', ['cardId' => $cid, 'deckId' => $deckId, 'memberId' => $mid, 'front' => $c['front'], 'back' => $c['back'], 'ease' => 2.5,
                'intervalDays' => 0, 'reps' => 0, 'lapses' => 0, 'dueAt' => '', 'reviewedAt' => '', 'createdAt' => $now]);
            $keep[$cid] = true;
        }
    }
    foreach (array_keys($have) as $cid) if (!isset($keep[$cid])) db_exec('DELETE FROM study_cards WHERE cardId = ? AND deckId = ?', [$cid, $deckId]);
    db_exec('UPDATE study_decks SET name = ?, updatedAt = ? WHERE deckId = ?', [$name, $now, $deckId]);
    return ['ok' => true, 'deckId' => $deckId, 'cards' => count($keep)];
}

/** member.tools.deck.delete */
function study_deck_delete(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $d = db_row('SELECT deckId FROM study_decks WHERE deckId = ? AND memberId = ? LIMIT 1', [(string)($p['deckId'] ?? ''), (string)$m['memberId']]);
    if (!$d) return ['ok' => false, 'error' => 'not_found'];
    db_exec('DELETE FROM study_cards WHERE deckId = ?', [(string)$d['deckId']]);
    db_exec('DELETE FROM study_decks WHERE deckId = ?', [(string)$d['deckId']]);
    return ['ok' => true];
}

/** member.tools.due — the cards to review now in one deck: due ones first, then new ones, at most a batch. */
function study_due(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $d = db_row('SELECT deckId, name FROM study_decks WHERE deckId = ? AND memberId = ? LIMIT 1', [(string)($p['deckId'] ?? ''), (string)$m['memberId']]);
    if (!$d) return ['ok' => false, 'error' => 'not_found'];
    $rows = db_all("SELECT cardId, front, back, reps, intervalDays FROM study_cards WHERE deckId = ? AND (dueAt = '' OR dueAt <= ?)
                    ORDER BY CASE WHEN reps = 0 THEN 1 ELSE 0 END, dueAt, id LIMIT " . STUDY_DUE_BATCH, [(string)$d['deckId'], gmdate('c')]);
    $next = db_row("SELECT MIN(dueAt) t FROM study_cards WHERE deckId = ? AND dueAt > ?", [(string)$d['deckId'], gmdate('c')]);
    return ['ok' => true, 'deck' => ['deckId' => (string)$d['deckId'], 'name' => (string)$d['name']], 'next' => (string)($next['t'] ?? ''),
            'cards' => array_map(static fn($c) => ['cardId' => (string)$c['cardId'], 'front' => (string)$c['front'], 'back' => (string)$c['back'], 'isNew' => (int)$c['reps'] === 0], $rows)];
}

/** member.tools.review — {cardId, grade 0–3}: reschedule one card. */
function study_review(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $c = db_row('SELECT * FROM study_cards WHERE cardId = ? AND memberId = ? LIMIT 1', [(string)($p['cardId'] ?? ''), (string)$m['memberId']]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!isset($p['grade']) || !in_array((int)$p['grade'], [0, 1, 2, 3], true)) return ['ok' => false, 'error' => 'bad_grade'];
    $s = study_schedule($c, (int)$p['grade'], time());
    db_update('study_cards', $s + ['reviewedAt' => now_iso()], ['id' => (int)$c['id']]);
    return ['ok' => true, 'intervalDays' => $s['intervalDays'], 'dueAt' => $s['dueAt']];
}

/** member.tools.log — a finished focus block, typing run or review session. */
function study_log(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $tool = (string)($p['tool'] ?? '');
    if (!in_array($tool, ['focus', 'typing', 'cards', 'quiz'], true)) return ['ok' => false, 'error' => 'bad_tool'];
    $num = static fn($k, $max) => max(0, min($max, (int)($p[$k] ?? 0)));
    $row = ['memberId' => (string)$m['memberId'], 'tool' => $tool, 'label' => mb_substr(trim((string)($p['label'] ?? '')), 0, 120),
            'minutes' => $num('minutes', 180), 'wpm' => $num('wpm', 250), 'accuracy' => $num('accuracy', 100), 'cards' => $num('cards', 500), 'at' => now_iso(), 'day' => gmdate('Y-m-d', time() + 3600)];
    if ($tool === 'focus' && $row['minutes'] < 1) return ['ok' => false, 'error' => 'too_short'];
    if ($tool === 'typing' && $row['wpm'] < 1) return ['ok' => false, 'error' => 'too_short'];
    // A flood of fake sessions is not a study streak: at most 60 a day.
    if ((int)(db_row('SELECT COUNT(*) n FROM study_sessions WHERE memberId = ? AND day = ?', [$row['memberId'], $row['day']])['n'] ?? 0) >= 60) return ['ok' => false, 'error' => 'daily_limit'];
    db_insert('study_sessions', $row);
    return ['ok' => true];
}

/** member.tools.stats — this week's focus minutes by day, the study streak, typing bests, cards reviewed. Lagos days (UTC+1). */
function study_stats(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $mid = (string)$m['memberId'];
    $today = gmdate('Y-m-d', time() + 3600);
    $from = gmdate('Y-m-d', strtotime($today . ' -6 days'));
    $week = [];
    for ($i = 6; $i >= 0; $i--) { $d = gmdate('Y-m-d', strtotime($today . " -$i days")); $week[$d] = 0; }
    foreach (db_all("SELECT day, SUM(minutes) m FROM study_sessions WHERE memberId = ? AND tool = 'focus' AND day >= ? GROUP BY day", [$mid, $from]) as $r) $week[(string)$r['day']] = (int)$r['m'];
    // Streak: consecutive days, ending today or yesterday, with any study session.
    $days = array_flip(array_map(static fn($r) => (string)$r['day'], db_all("SELECT DISTINCT day FROM study_sessions WHERE memberId = ? AND day >= ?", [$mid, gmdate('Y-m-d', strtotime($today . ' -400 days'))])));
    $streak = 0; $d = isset($days[$today]) ? $today : gmdate('Y-m-d', strtotime($today . ' -1 day'));
    while (isset($days[$d])) { $streak++; $d = gmdate('Y-m-d', strtotime($d . ' -1 day')); }
    $typing = db_row("SELECT MAX(wpm) best, COUNT(*) runs FROM study_sessions WHERE memberId = ? AND tool = 'typing'", [$mid]);
    $lastT = db_all("SELECT wpm, accuracy, at FROM study_sessions WHERE memberId = ? AND tool = 'typing' ORDER BY id DESC LIMIT 10", [$mid]);
    $cards = (int)(db_row("SELECT COALESCE(SUM(cards), 0) n FROM study_sessions WHERE memberId = ? AND tool = 'cards' AND day >= ?", [$mid, $from])['n'] ?? 0);
    return ['ok' => true, 'week' => array_map(static fn($k, $v) => ['day' => $k, 'minutes' => $v], array_keys($week), $week), 'focusWeek' => array_sum($week),
            'streak' => $streak, 'typing' => ['best' => (int)($typing['best'] ?? 0), 'runs' => (int)($typing['runs'] ?? 0),
            'recent' => array_map(static fn($r) => ['wpm' => (int)$r['wpm'], 'accuracy' => (int)$r['accuracy'], 'at' => (string)$r['at']], $lastT)], 'cardsWeek' => $cards];
}

/** Parse pasted cards: one a line, "front — back" (also " - ", " : ", tab, " = "). */
function study_parse_lines(string $text): array {
    $out = [];
    foreach (preg_split('/\R/', $text) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $parts = preg_split('/\t|\s+[—–=]\s+|\s+-\s+|\s*::\s*|:\s+/u', $line, 2);
        if (count($parts) === 2 && trim($parts[0]) !== '' && trim($parts[1]) !== '') $out[] = ['front' => study_clean_side($parts[0]), 'back' => study_clean_side($parts[1])];
    }
    return $out;
}

/**
 * member.tools.cards.ai — {unitId}: the study helper writes a deck from one of
 * MY lessons (the curriculum the member is placed in), on the study helper's
 * daily allowance, taken before the call and given back if it fails. Returns
 * the cards to look over — it saves nothing until the member does.
 */
function study_cards_ai(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $id = (string)($p['unitId'] ?? '');
    if (!isset($units[$id])) return ['ok' => false, 'error' => 'not_found'];
    if (!function_exists('ai_enabled') || !ai_enabled('coach')) return ['ok' => false, 'error' => 'ai_disabled'];
    $key = 'ai.tutor.' . gmdate('Y-m-d');
    $used = (int)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [(string)$m['memberId'], $key])['stateValue'] ?? 0);
    if ($used >= CURR_TUTOR_PER_DAY) return ['ok' => false, 'error' => 'daily_limit', 'limit' => CURR_TUTOR_PER_DAY, 'left' => 0];
    db_upsert('member_state', ['memberId' => (string)$m['memberId'], 'stateKey' => $key, 'stateValue' => (string)($used + 1), 'updatedAt' => now_iso()],
              ['memberId', 'stateKey'], ['stateValue' => (string)($used + 1), 'updatedAt' => now_iso()]);
    $u = $units[$id]['unit'];
    $lesson = "Course: {$u['course']}\nLesson: {$u['title']}\nObjectives: " . implode('; ', json_decode((string)$u['objectives'], true) ?: []) . "\n\n"
            . mb_substr(preg_replace('/##\s*This week.s assignment.*$/su', '', (string)$u['body']), 0, 6000);
    $system = 'You write revision flashcards for a 10–17 year old member of Next Generation Genius in Nigeria, from ONE lesson. '
        . 'Write exactly ' . STUDY_AI_CARDS . ' cards that test the key ideas, words and steps of the lesson below — nothing outside it. '
        . 'Each card: a short question or term on the front (under 15 words), and a clear answer on the back (under 30 words), in plain British English. '
        . 'Reply with ONLY the cards, one a line, as: front :: back' . "\n\nTHE LESSON:\n" . $lesson;
    $r = ai_chat($system, [['role' => 'me', 'text' => 'Write the cards.']], 900, 'coach');
    $cards = !empty($r['ok']) ? array_slice(study_parse_lines((string)$r['text']), 0, STUDY_AI_CARDS + 4) : [];
    if (!$cards) {
        db_exec('UPDATE member_state SET stateValue = ? WHERE memberId = ? AND stateKey = ?', [(string)$used, (string)$m['memberId'], $key]);
        return ['ok' => false, 'error' => !empty($r['ok']) ? 'ai_no_cards' : (string)($r['error'] ?? 'ai_failed')];
    }
    return ['ok' => true, 'name' => mb_substr((string)$u['title'], 0, 80), 'source' => mb_substr((string)$u['course'] . ' · ' . (string)$u['title'], 0, 120), 'cards' => $cards,
            'left' => CURR_TUTOR_PER_DAY - $used - 1];
}

/** member.tools.lessons — the member's lessons (id and title only), their course and its division, so the course labs can lead with theirs. */
function study_lessons(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => true, 'lessons' => [], 'track' => '', 'division' => '', 'ai' => false];
    $out = [];
    foreach (curriculum_member_units($m) as $id => $x) $out[] = ['unitId' => (string)$id, 'title' => (string)$x['unit']['title'], 'course' => (string)$x['unit']['course']];
    $track = (string)($m['track'] ?? '');
    $div = (string)($m['division'] ?? '') ?: (function_exists('club_division_of') && $track !== '' ? club_division_of($track) : '');
    return ['ok' => true, 'lessons' => array_slice($out, 0, 200), 'track' => $track, 'division' => $div, 'ai' => function_exists('ai_enabled') && ai_enabled('coach')];
}

/* ── The study helper, two more ways ─────────────────────────────────────
 * Both spend the same daily allowance as the helper on a lesson page
 * (ai.tutor.<day>, CURR_TUTOR_PER_DAY), taken before the model is called and
 * given back when it fails, so parallel presses cannot slip under it. */

/** Spend one of today's study-helper questions. ['ok'=>true,'used'=>n] or a refusal. */
function study_ai_take(string $mid): array {
    if (!function_exists('ai_enabled') || !ai_enabled('coach')) return ['ok' => false, 'error' => 'ai_disabled'];
    $key = 'ai.tutor.' . gmdate('Y-m-d');
    $used = (int)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [$mid, $key])['stateValue'] ?? 0);
    if ($used >= CURR_TUTOR_PER_DAY) return ['ok' => false, 'error' => 'daily_limit', 'limit' => CURR_TUTOR_PER_DAY, 'left' => 0];
    db_upsert('member_state', ['memberId' => $mid, 'stateKey' => $key, 'stateValue' => (string)($used + 1), 'updatedAt' => now_iso()],
              ['memberId', 'stateKey'], ['stateValue' => (string)($used + 1), 'updatedAt' => now_iso()]);
    return ['ok' => true, 'used' => $used, 'key' => $key];
}
function study_ai_refund(string $mid, array $t): void {
    db_exec('UPDATE member_state SET stateValue = ? WHERE memberId = ? AND stateKey = ?', [(string)$t['used'], $mid, $t['key']]);
}
const STUDY_DISTRESS = '/\b(kill myself|suicide|hurt myself|self[- ]harm|abuse[ds]?|touch(ed|es) me|want to die)\b/i';
const STUDY_QUIZ_N = 5;
const STUDY_NOTES_MAX = 6000;

/**
 * member.tools.quiz.ai — {unitId}: five multiple-choice questions on one of MY
 * lessons (never its assignment), each with the right option and why. Checked
 * here for shape — four options, one right answer — before it reaches the
 * member; a malformed question is dropped, not shown.
 */
function study_quiz_ai(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $id = (string)($p['unitId'] ?? '');
    if (!isset($units[$id])) return ['ok' => false, 'error' => 'not_found'];
    $mid = (string)$m['memberId'];
    $t = study_ai_take($mid); if (empty($t['ok'])) return $t;
    $u = $units[$id]['unit'];
    $lesson = "Course: {$u['course']}\nLesson: {$u['title']}\n\n" . mb_substr(preg_replace('/##\s*This week.s assignment.*$/su', '', (string)$u['body']), 0, 6000);
    $r = ai_classify('Write ' . STUDY_QUIZ_N . ' multiple-choice questions for a 10–17 year old member of Next Generation Genius in Nigeria, testing understanding of ONE lesson (below) — not memory of exact wording, and nothing outside the lesson. '
        . 'Each question has exactly 4 short options, one of them right. Plain British English. '
        . 'JSON: {"questions":[{"q":"…","options":["…","…","…","…"],"answer":0,"why":"one sentence on why that is right"}]}', $lesson, 1400, 'coach');
    $qs = [];
    foreach ((array)($r['data']['questions'] ?? []) as $q) {
        $opts = array_values(array_filter(array_map(static fn($o) => mb_substr(trim((string)$o), 0, 160), (array)($q['options'] ?? [])), 'strlen'));
        $ans = $q['answer'] ?? null; $text = mb_substr(trim((string)($q['q'] ?? '')), 0, 300);
        if ($text === '' || count($opts) !== 4 || !is_numeric($ans) || (int)$ans < 0 || (int)$ans > 3 || count(array_unique($opts)) !== 4) continue;
        $qs[] = ['q' => $text, 'options' => $opts, 'answer' => (int)$ans, 'why' => mb_substr(trim((string)($q['why'] ?? '')), 0, 300)];
        if (count($qs) === STUDY_QUIZ_N) break;
    }
    if (count($qs) < 3) { study_ai_refund($mid, $t); return ['ok' => false, 'error' => !empty($r['ok']) ? 'ai_no_quiz' : (string)($r['error'] ?? 'ai_failed')]; }
    return ['ok' => true, 'title' => (string)$u['title'], 'course' => (string)$u['course'], 'questions' => $qs, 'left' => CURR_TUTOR_PER_DAY - $t['used'] - 1];
}

/**
 * member.tools.notes.ai — {text}: the member's own notes, summarised in a few
 * sentences, with the key terms and what each means (ready to become a
 * deck). Notes that talk about being hurt are not summarised: they are
 * answered with people to talk to, and nothing is spent.
 */
function study_notes_ai(array $p): array {
    $m = study_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $text = trim(mb_substr((string)($p['text'] ?? ''), 0, STUDY_NOTES_MAX));
    if (mb_strlen($text) < 80) return ['ok' => false, 'error' => 'notes_too_short', 'detail' => 'Paste a little more — at least a few sentences.'];
    if (preg_match(STUDY_DISTRESS, $text)) return ['ok' => true, 'safeguarding' => true, 'summary' => 'Some of what you wrote sounds really important, and it is not something to work out alone. Please talk to your mentor, your instructor or a parent today — or use "Report a concern" in your portal, which goes straight to the safeguarding team.', 'terms' => []];
    $mid = (string)$m['memberId'];
    $t = study_ai_take($mid); if (empty($t['ok'])) return $t;
    $r = ai_classify('You help a 10–17 year old member of Next Generation Genius in Nigeria revise from their OWN study notes (below). '
        . 'Write a summary of the notes in 3 to 5 plain sentences, using only what the notes say, and pick up to 10 key terms with a one-line meaning each, taken from the notes. '
        . 'If the notes are not study notes, say so in the summary and give no terms. Never ask for personal details. '
        . 'JSON: {"summary":"…","terms":[{"term":"…","meaning":"…"}]}', $text, 900, 'coach');
    $summary = mb_substr(trim((string)($r['data']['summary'] ?? '')), 0, 1200);
    if ($summary === '') { study_ai_refund($mid, $t); return ['ok' => false, 'error' => (string)($r['error'] ?? 'ai_failed')]; }
    $terms = [];
    foreach ((array)($r['data']['terms'] ?? []) as $x) {
        $tm = study_clean_side((string)($x['term'] ?? '')); $mn = study_clean_side((string)($x['meaning'] ?? ''));
        if ($tm !== '' && $mn !== '') $terms[] = ['front' => $tm, 'back' => $mn];
        if (count($terms) === 10) break;
    }
    return ['ok' => true, 'summary' => $summary, 'terms' => $terms, 'left' => CURR_TUTOR_PER_DAY - $t['used'] - 1];
}
