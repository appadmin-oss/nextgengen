<?php
declare(strict_types=1);

/**
 * STUDYING FOR SCHOOL — the session the growth plan always asked for.
 *
 * NGG already knew what each member should work on. A term's results are
 * uploaded, read and confirmed (domain/school-results.php); out of them comes
 * a growth plan of at most three subjects, each with where they are, where
 * they are going, the method, and how many sessions a week it takes:
 *
 *     Mathematics · 62 → 70 · retrieval practice · 3 sessions a week
 *
 * And then nothing. The plan named the work and there was nowhere to do it,
 * so a child who wanted to keep the promise had to go and find their own
 * material. The weekly tick could be pressed without studying, and studying
 * could happen without the tick. This is the missing half.
 *
 * ── WHAT A DRILL IS ─────────────────────────────────────────────────────────
 *
 * One session of that plan, actually done: a short set of questions on that
 * subject, at the level this member is working at, marked immediately with
 * the REASON — not just a tick — and then three things happen that are the
 * whole point:
 *
 *   1. THE WEEK'S CHECK-IN GOES UP BY ONE. The plan's own counter, through
 *      the plan's own op, so a session done here is a session the plan
 *      counts. The tick stops being an honour system.
 *   2. WHAT THEY GOT WRONG BECOMES A CARD. Straight into the spaced
 *      repetition they already have (domain/study-tools.php), in a deck for
 *      that subject, so it comes back at the interval that makes it stick
 *      rather than being forgotten by Tuesday.
 *   3. THE NEXT DRILL MOVES. Accuracy decides the level of the one after it.
 *
 * ── ADAPTIVE, AND WHAT THAT MEANS HERE ──────────────────────────────────────
 *
 * Five levels, and the level IS the difficulty the questions are written to.
 * It moves on evidence rather than on a guess: clear the bar and it goes up,
 * fall below and it goes down, and the band in between is left alone so a
 * single bad morning does not demote somebody.
 *
 * There is no second store of a member's level. It is the level of their most
 * recent drill in that subject, which means you can read the ladder they
 * climbed off the table rather than trusting a number somebody wrote.
 *
 * ── WHERE THE QUESTIONS COME FROM ───────────────────────────────────────────
 *
 * The AI this deployment already pays for (api/_lib/ai.php), which supports
 * Groq and Gemini — both of which have genuinely free tiers — as well as
 * Anthropic, OpenAI and OpenRouter, with per-profile routing, fallbacks and
 * spend controls already built. Asking it for questions at a named level on a
 * named topic is the thing a fixed question bank cannot do: a bank has the
 * questions it has, and this has the question this child needs next.
 *
 * A deployment that also has a past-questions bank can name it in
 * `api/config.php` (`study_bank`), and it is asked first — real WAEC and JAMB
 * past questions beat generated ones for exam practice. It is OPTIONAL and
 * unverified by this codebase: nothing here breaks when it is absent, wrong
 * or down, and the AI answers instead.
 *
 * Every external call is made HERE, on the server. The browser only ever
 * talks to this origin — which is what keeps the app to one hostname for
 * zero-rating (docs/ZERO-RATING.md), and keeps a child's name away from
 * somebody else's API.
 */

const DRILL_QUESTIONS   = 5;        // one sitting, not an exam
const DRILL_LEVELS      = 5;
const DRILL_LEVEL_UP    = 80;       // per cent correct to move up
const DRILL_LEVEL_DOWN  = 40;       // …and below which to move down
const DRILL_PER_DAY     = 8;        // a sitting is short; eight is a long day
const DRILL_TOPIC_MAX   = 120;
const DRILL_DECK_PREFIX = 'School · ';

/** What each level means, in the words the question-writer is given. */
const DRILL_LEVEL_BRIEF = [
    1 => 'the most basic recall and one-step questions, the kind a child who has missed the topic can still start',
    2 => 'straightforward questions on the core of the topic, one or two steps',
    3 => 'the standard a good school exam sets: two or three steps, some applying rather than recalling',
    4 => 'harder application and multi-step reasoning, the top end of a school paper',
    5 => 'the hardest questions a WAEC or JAMB paper asks on this topic, including ones that combine it with another',
];

/** The member, or null when they are not an NGG member. */
function drill_member(array $p): ?array {
    return function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
}

/**
 * The level this member is working at in a subject: the level of their most
 * recent MARKED drill, moved by how that drill went. One source, derived.
 */
function drill_level_for(string $memberId, string $subject): int {
    $r = db_row("SELECT level, asked, correct FROM study_drills
                 WHERE memberId = ? AND lower(subject) = ? AND markedAt <> '' ORDER BY id DESC LIMIT 1",
                [$memberId, mb_strtolower($subject)]);
    if (!$r) return 2;                                  // a fair place to find out
    $lvl = max(1, min(DRILL_LEVELS, (int)$r['level']));
    $asked = (int)$r['asked'];
    if ($asked < 1) return $lvl;
    $pct = (int)round((int)$r['correct'] * 100 / $asked);
    if ($pct >= DRILL_LEVEL_UP) return min(DRILL_LEVELS, $lvl + 1);
    if ($pct <= DRILL_LEVEL_DOWN) return max(1, $lvl - 1);
    return $lvl;                                        // the band in between is left alone
}

/** How many drills they have sat today, for the daily bound. */
function drill_today_count(string $memberId): int {
    $day = gmdate('Y-m-d');
    return (int)(db_row("SELECT COUNT(*) c FROM study_drills WHERE memberId = ? AND substr(startedAt, 1, 10) = ?",
                        [$memberId, $day])['c'] ?? 0);
}

/**
 * The questions. The optional bank first (real past questions beat generated
 * ones for exam practice), then the AI, then nothing — and "nothing" is
 * reported as itself rather than dressed up as an empty drill.
 *
 * Returns [questions, source] where a question is
 *   ['q' => string, 'options' => [4 strings], 'answer' => 0..3, 'why' => string]
 */
function drill_questions(string $subject, string $topic, int $level, string $exam): array {
    $bank = drill_bank_questions($subject, $topic, $level, $exam);
    if ($bank) return [$bank, 'bank'];
    $ai = drill_ai_questions($subject, $topic, $level, $exam);
    if ($ai) return [$ai, 'ai'];
    return [[], ''];
}

/**
 * An optional past-questions bank, named in api/config.php:
 *
 *   'study_bank' => ['url' => 'https://…/q', 'token' => '…', 'header' => 'AccessToken',
 *                    'subjects' => ['Mathematics' => 'mathematics', …]]
 *
 * Deliberately defensive, because this codebase cannot verify somebody else's
 * service: anything missing, malformed or slow is simply no questions, and
 * the AI answers instead. It is never allowed to fail the drill.
 */
function drill_bank_questions(string $subject, string $topic, int $level, string $exam): array {
    $cfg = (array)($GLOBALS['CONFIG']['study_bank'] ?? []);
    $url = trim((string)($cfg['url'] ?? ''));
    if ($url === '') return [];
    $slug = (string)(($cfg['subjects'] ?? [])[$subject] ?? mb_strtolower($subject));
    $q = $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query(['subject' => $slug, 'type' => $exam ?: 'utme']);
    $headers = [];
    $tok = trim((string)($cfg['token'] ?? ''));
    if ($tok !== '') $headers[] = trim((string)($cfg['header'] ?? 'AccessToken')) . ': ' . $tok;
    $out = [];
    try {
        /* One request per question: these banks return a single question per
           call. Bounded, and any failure stops the loop rather than the drill. */
        for ($i = 0; $i < DRILL_QUESTIONS; $i++) {
            $r = drill_http_get_json($q, $headers);
            $one = drill_bank_shape($r);
            if (!$one) break;
            $out[] = $one;
        }
    } catch (\Throwable $e) { return []; }
    return count($out) === DRILL_QUESTIONS ? $out : [];
}

/**
 * A bounded, defensive GET returning decoded JSON, or null.
 *
 * Its own, rather than a shared helper, because the rules here are this
 * caller's: a short timeout (a child is waiting), a small response cap, no
 * redirects followed to somewhere that was not configured, and NEVER an
 * exception — a bank that is down must cost the drill nothing.
 */
function drill_http_get_json(string $url, array $headers): ?array {
    if (!preg_match('~^https://~i', $url) || !function_exists('curl_init')) return null;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        CURLOPT_USERAGENT => 'NGG-Study/1.0',
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($code !== 200 || !is_string($body) || $body === '' || strlen($body) > 262144) return null;
    $j = json_decode($body, true);
    return is_array($j) ? $j : null;
}

/** One bank row → this file's question shape, or null when it is not one. */
function drill_bank_shape($r): ?array {
    $d = is_array($r) ? ($r['data'] ?? $r) : null;
    if (is_array($d) && isset($d[0]) && is_array($d[0])) $d = $d[0];
    if (!is_array($d)) return null;
    $q = trim((string)($d['question'] ?? ''));
    $opt = (array)($d['option'] ?? $d['options'] ?? []);
    $ans = mb_strtolower(trim((string)($d['answer'] ?? '')));
    if ($q === '' || count($opt) < 2 || $ans === '') return null;
    $keys = array_keys($opt);
    $vals = array_map(static fn($v) => trim((string)$v), array_values($opt));
    $at = array_search($ans, array_map('mb_strtolower', array_map('strval', $keys)), true);
    if ($at === false) $at = array_search($ans, array_map('mb_strtolower', $vals), true);
    if ($at === false) return null;
    return ['q' => mb_substr($q, 0, 600), 'options' => array_map(static fn($v) => mb_substr($v, 0, 240), $vals),
            'answer' => (int)$at, 'why' => mb_substr(trim((string)($d['solution'] ?? $d['explanation'] ?? '')), 0, 500)];
}

/** The AI writes them, to the level, on the topic. */
function drill_ai_questions(string $subject, string $topic, int $level, string $exam): array {
    if (!function_exists('ai_classify') || !function_exists('ai_enabled') || !ai_enabled('coach')) return [];
    $brief = DRILL_LEVEL_BRIEF[$level] ?? DRILL_LEVEL_BRIEF[3];
    $for = $exam !== '' && $exam !== 'school' ? strtoupper($exam) : 'the Nigerian senior secondary syllabus';
    $r = ai_classify(
        'You write practice questions for a Nigerian secondary school student, for ' . $for . '. '
        . 'Write exactly ' . DRILL_QUESTIONS . ' multiple-choice questions on the subject and topic given, at this level: ' . $brief . '. '
        . 'Four options each, exactly one correct. Use Nigerian contexts and naira for money. Plain British English, short sentences. '
        . 'For every question give "why": one or two sentences explaining HOW to get the answer — the working, not just a restatement '
        . 'of which option is right, because this is what the student reads when they get it wrong. '
        . 'Never ask about anything unsafe, political or personal. '
        . 'Return JSON {"questions":[{"q":string,"options":[string,string,string,string],"answer":0-3,"why":string}]}.',
        "Subject: $subject\nTopic: " . ($topic !== '' ? $topic : 'anything core to this subject at this level'),
        1800, 'coach');
    if (empty($r['ok']) || !is_array($r['data']['questions'] ?? null)) return [];
    $out = [];
    foreach ($r['data']['questions'] as $q) {
        if (!is_array($q)) continue;
        $text = trim((string)($q['q'] ?? ''));
        $opts = array_values(array_filter(array_map(static fn($o) => trim((string)$o), (array)($q['options'] ?? [])), static fn($o) => $o !== ''));
        $at = (int)($q['answer'] ?? -1);
        if ($text === '' || count($opts) !== 4 || $at < 0 || $at > 3) continue;
        $out[] = ['q' => mb_substr($text, 0, 600), 'options' => array_map(static fn($o) => mb_substr($o, 0, 240), $opts),
                  'answer' => $at, 'why' => mb_substr(trim((string)($q['why'] ?? '')), 0, 500)];
        if (count($out) === DRILL_QUESTIONS) break;
    }
    return count($out) === DRILL_QUESTIONS ? $out : [];
}

/**
 * member.study.drill.start — begin one session of the plan.
 *
 * The answers never travel to the browser. They are kept on the row and the
 * marking happens here, because a multiple-choice answer sent to a page is an
 * answer a child can read.
 */
function member_study_drill_start(array $p): array {
    $m = drill_member($p);
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $mid = (string)$m['memberId'];

    /* The subject must be one the PLAN names. This is not a general quiz
       machine: it is the sessions a member already committed to, which is
       what makes a finished drill worth a tick on that plan. */
    $itemId = (string)($p['itemId'] ?? '');
    $it = db_row('SELECT i.*, g.memberId, g.status planStatus FROM growth_plan_items i
                  JOIN growth_plans g ON g.planId = i.planId WHERE i.itemId = ? LIMIT 1', [$itemId]);
    if (!$it || (string)$it['memberId'] !== $mid) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array((string)$it['planStatus'], ['sent', 'live'], true)) return ['ok' => false, 'error' => 'plan_not_live'];

    if (drill_today_count($mid) >= DRILL_PER_DAY) return ['ok' => false, 'error' => 'enough_today', 'max' => DRILL_PER_DAY];

    $subject = (string)$it['subject'];
    $topic = function_exists('curriculum_clean_text')
        ? curriculum_clean_text($p['topic'] ?? '', DRILL_TOPIC_MAX) : mb_substr(trim((string)($p['topic'] ?? '')), 0, DRILL_TOPIC_MAX);
    $level = drill_level_for($mid, $subject);
    $exam = mb_strtolower(trim((string)($p['exam'] ?? '')));
    if (!in_array($exam, ['waec', 'neco', 'utme', 'jamb', 'school', ''], true)) $exam = '';
    if ($exam === 'jamb') $exam = 'utme';

    // What a child types as a "topic" can be a disclosure; it is answered with people, never sent to a model.
    if ($sg = safeguard_check($topic, db_row('SELECT * FROM members WHERE memberId = ?', [$mid]), 'the practice drill')) return ['ok' => true, 'safeguarding' => true, 'told' => $sg['told'], 'message' => $sg['reply'], 'questions' => []];
    [$qs, $source] = drill_questions($subject, $topic, $level, $exam);
    if (!$qs) return ['ok' => false, 'error' => 'no_questions',
        'message' => 'Nobody can write you questions right now. Your flashcards for this subject still work, and your instructor can set you work.'];

    $drillId = 'DRL-' . strtoupper(rand_hex(6));
    db_insert('study_drills', ['drillId' => $drillId, 'memberId' => $mid, 'itemId' => $itemId, 'subject' => $subject,
        'topic' => $topic, 'level' => $level, 'source' => $source, 'asked' => count($qs), 'correct' => 0,
        'questionsJson' => json_encode($qs, JSON_UNESCAPED_UNICODE), 'answersJson' => '[]',
        'startedAt' => now_iso(), 'markedAt' => '']);
    return ['ok' => true, 'drillId' => $drillId, 'subject' => $subject, 'topic' => $topic, 'level' => $level,
            'levels' => DRILL_LEVELS, 'source' => $source,
            'questions' => array_map(static fn($q) => ['q' => $q['q'], 'options' => $q['options']], $qs)];
}

/**
 * member.study.drill.mark — mark it, and close the three loops.
 */
function member_study_drill_mark(array $p): array {
    $m = drill_member($p);
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $mid = (string)$m['memberId'];
    $d = db_row('SELECT * FROM study_drills WHERE drillId = ? LIMIT 1', [(string)($p['drillId'] ?? '')]);
    if (!$d || (string)$d['memberId'] !== $mid) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$d['markedAt'] !== '') return ['ok' => false, 'error' => 'already_marked'];

    $qs = json_decode((string)$d['questionsJson'], true) ?: [];
    $given = is_array($p['answers'] ?? null) ? array_values($p['answers']) : [];
    $marks = []; $correct = 0; $wrong = [];
    foreach ($qs as $i => $q) {
        $pick = isset($given[$i]) && is_numeric($given[$i]) ? (int)$given[$i] : -1;
        $right = $pick === (int)$q['answer'];
        if ($right) $correct++;
        else $wrong[] = $q;
        $marks[] = ['picked' => $pick, 'answer' => (int)$q['answer'], 'right' => $right, 'why' => (string)($q['why'] ?? '')];
    }
    $now = now_iso();
    db_update('study_drills', ['correct' => $correct, 'answersJson' => json_encode($marks, JSON_UNESCAPED_UNICODE), 'markedAt' => $now], ['id' => (int)$d['id']]);

    /* 1. The week's check-in, through the plan's OWN op — a session done here
          is a session the plan counts, rather than a second tally of it. */
    $tick = null;
    if (function_exists('member_results_tick')) {
        $t = member_results_tick(['memberId' => $mid, 'itemId' => (string)$d['itemId'], 'delta' => 1]);
        if (!empty($t['ok'])) $tick = ['done' => (int)$t['done'], 'planned' => (int)$t['planned']];
    }
    /* 2. What they got wrong becomes a card, in the spaced repetition they
          already have. Forgetting it by Tuesday is the default otherwise. */
    $cards = drill_cards_for($mid, (string)$d['subject'], $wrong);
    /* 3. Where the next one will sit. */
    $next = drill_level_for($mid, (string)$d['subject']);

    $pct = count($qs) ? (int)round($correct * 100 / count($qs)) : 0;
    return ['ok' => true, 'correct' => $correct, 'asked' => count($qs), 'pct' => $pct,
            'marks' => $marks, 'level' => (int)$d['level'], 'nextLevel' => $next, 'levels' => DRILL_LEVELS,
            'cardsMade' => $cards, 'tick' => $tick];
}

/**
 * Every question they got wrong, as a card in that subject's deck. The deck
 * is made once and reused; a question already on a card is not added twice,
 * because meeting the same card twice in one session teaches nothing and
 * makes the count a lie.
 */
function drill_cards_for(string $memberId, string $subject, array $wrong): int {
    if (!$wrong) return 0;
    $name = DRILL_DECK_PREFIX . $subject;
    $deck = db_row('SELECT deckId FROM study_decks WHERE memberId = ? AND name = ? LIMIT 1', [$memberId, $name]);
    $deckId = (string)($deck['deckId'] ?? '');
    if ($deckId === '') {
        $deckId = 'DCK-' . strtoupper(rand_hex(5));
        try {
            db_insert('study_decks', ['deckId' => $deckId, 'memberId' => $memberId, 'name' => $name,
                'source' => 'drill', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
        } catch (\Throwable $e) { return 0; }
    }
    $made = 0;
    foreach ($wrong as $q) {
        $front = mb_substr((string)$q['q'], 0, 600);
        if (db_row('SELECT id FROM study_cards WHERE memberId = ? AND deckId = ? AND front = ? LIMIT 1', [$memberId, $deckId, $front])) continue;
        $opts = (array)($q['options'] ?? []);
        $back = mb_substr(trim((string)($opts[(int)$q['answer']] ?? '')) . ((string)($q['why'] ?? '') !== '' ? ' — ' . $q['why'] : ''), 0, 600);
        if ($back === '') continue;
        try {
            db_insert('study_cards', ['cardId' => 'CRD-' . strtoupper(rand_hex(6)), 'deckId' => $deckId, 'memberId' => $memberId,
                'front' => $front, 'back' => $back, 'ease' => 2.5, 'intervalDays' => 0, 'reps' => 0, 'lapses' => 0,
                /* Due now: they have just got it wrong, so the first sight of
                   it again belongs to today, not to a schedule that has not
                   started. study_schedule() takes it from there. */
                'dueAt' => gmdate('c'), 'createdAt' => now_iso()]);
            $made++;
        } catch (\Throwable $e) { /* one card failing is not the drill failing */ }
    }
    return $made;
}

/**
 * member.study.plan — the School screen, assembled HERE.
 *
 * ONE call, and one shape. The Learn app does not reach into the school
 * results payload and pick `plan.plan.items` out of it: a screen that knows
 * another domain's JSON by heart is a screen that breaks when that domain
 * tidies up, and it is why two fetches with two error paths had to agree
 * before anything could be drawn.
 *
 * What comes back is exactly what the screen shows: the subjects a member
 * agreed to work on, where each one is, where it is going, how many sessions
 * the plan asks for and how many are done this week — plus the level they are
 * working at and what is left in them today.
 */
function member_study_plan(array $p): array {
    $m = drill_member($p);
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $mid = (string)$m['memberId'];

    $plan = db_row("SELECT * FROM growth_plans WHERE memberId = ? AND status IN ('sent','live') ORDER BY id DESC LIMIT 1", [$mid]);
    $items = [];
    if ($plan) {
        $today = function_exists('results_today') ? results_today() : gmdate('Y-m-d');
        $ws = function_exists('results_week_start') ? results_week_start($today) : gmdate('Y-m-d');
        $rows = db_all('SELECT * FROM growth_plan_items WHERE planId = ? ORDER BY position, id', [(string)$plan['planId']]);
        $ticks = [];
        if ($rows) {
            $ph = implode(',', array_fill(0, count($rows), '?'));
            foreach (db_all("SELECT itemId, done FROM plan_checkins WHERE weekStart = ? AND itemId IN ($ph)",
                            array_merge([$ws], array_column($rows, 'itemId'))) as $t) $ticks[(string)$t['itemId']] = (int)$t['done'];
        }
        foreach ($rows as $r) {
            $subject = (string)$r['subject'];
            $items[] = [
                'itemId' => (string)$r['itemId'], 'subject' => $subject,
                'current' => $r['current'] === null ? null : (int)$r['current'],
                'target' => $r['target'] === null ? null : (int)$r['target'],
                'what' => (string)$r['what'], 'whenWhere' => (string)$r['whenWhere'],
                'planned' => max(1, (int)$r['sessionsPerWeek']),
                'doneThisWeek' => (int)($ticks[(string)$r['itemId']] ?? 0),
                'level' => drill_level_for($mid, $subject),
                'recent' => drill_recent_for($mid, $subject),
            ];
        }
    }
    $left = max(0, DRILL_PER_DAY - drill_today_count($mid));
    return ['ok' => true, 'items' => $items, 'levels' => DRILL_LEVELS,
            'todayLeft' => $left, 'perDay' => DRILL_PER_DAY, 'questions' => DRILL_QUESTIONS,
            'summary' => $plan ? (string)$plan['summary'] : '',
            'term' => $plan ? (string)$plan['term'] : '',
            /* Said as a state rather than left to be inferred from an empty
               list: "no plan yet" and "a plan with nothing in it" send a
               member to two different places. */
            'state' => !$plan ? 'no_plan' : (!$items ? 'plan_empty' : 'ready')];
}

/** How the last few goes at a subject went — the ladder, briefly. */
function drill_recent_for(string $memberId, string $subject): array {
    $out = [];
    foreach (db_all("SELECT level, asked, correct, markedAt FROM study_drills
                     WHERE memberId = ? AND lower(subject) = ? AND markedAt <> '' ORDER BY id DESC LIMIT 5",
                    [$memberId, mb_strtolower($subject)]) as $r) {
        $out[] = ['pct' => (int)$r['asked'] ? (int)round((int)$r['correct'] * 100 / (int)$r['asked']) : 0,
                  'level' => (int)$r['level'], 'at' => (string)$r['markedAt']];
    }
    return $out;
}
