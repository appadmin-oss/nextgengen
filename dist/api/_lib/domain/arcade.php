<?php
declare(strict_types=1);

/**
 * The Arcade — short, replayable mini games inside the Community.
 *
 * Design constraints that shaped every decision here:
 *
 * 1. SERVER-AUTHORITATIVE. A leaderboard children compete on is worth exactly
 *    as much as it is hard to fake. The client never receives an answer key:
 *    the server generates a round, keeps the key, ships only the questions,
 *    and grades the submission itself. A player can read every byte the page
 *    holds and still not know what is right.
 *
 * 2. SERVER-TIMED. Elapsed time comes from the round row, not from a number
 *    the client reports. Speed is part of the score, so a client-supplied
 *    duration would be the first thing anyone edited.
 *
 * 3. ONE SHOT PER ROUND. A round is graded once. Without that, "start, submit,
 *    read your mistakes, resubmit" is a perfect score every time.
 *
 * 4. THE TWO PROGRAMMES DO NOT CLASH. Summer School and the NGG Club run
 *    different cohorts of different ages; a shared board would be neither fair
 *    nor meaningful. Every score is stamped with the programme it was played
 *    in, and boards are scoped to one.
 *
 * 5. IT DOES NOT TOUCH THE BEHAVIOUR LEDGER. `member_stars` is what mentors
 *    record about conduct, and reports depend on it. Game results are a
 *    separate currency and stay in their own table; the arcade shows a
 *    player's behaviour stars beside their score, but never writes one.
 *
 * The games are chosen to be gradable without a human: arithmetic, multiple
 * choice, and unscrambling a known word. A memory/pattern game is deliberately
 * absent — the client must be shown the sequence to play it, so the answer is
 * always in the page and the score can never be trusted.
 */

const ARCADE_GRACE = 12;          // s of slack past the clock for a slow network
const ARCADE_ROUND_TTL_DAYS = 7;  // prune graded/abandoned rounds after this

/** Catalogue. `ranked` games feed the leaderboards. */
function arcade_games(): array {
    return [
        'maths' => [
            'key' => 'maths', 'name' => 'Number Rush', 'icon' => '⚡',
            'blurb' => 'Twenty sums against the clock. Gets harder as you climb.',
            'skill' => 'Mental arithmetic', 'kind' => 'type', 'questions' => 20, 'seconds' => 90,
        ],
        'naija' => [
            'key' => 'naija', 'name' => 'Naija Know-How', 'icon' => '🇳🇬',
            'blurb' => 'States, capitals and civics. How well do you know home?',
            'skill' => 'General knowledge', 'kind' => 'choice', 'questions' => 12, 'seconds' => 100,
        ],
        'spell' => [
            'key' => 'spell', 'name' => 'Spell It Right', 'icon' => '🔤',
            'blurb' => 'One of these four is spelt correctly. Only one.',
            'skill' => 'Spelling', 'kind' => 'choice', 'questions' => 15, 'seconds' => 90,
        ],
        'word' => [
            'key' => 'word', 'name' => 'Word Untangle', 'icon' => '🧩',
            'blurb' => 'The letters are all there. Put them back in order.',
            'skill' => 'Vocabulary', 'kind' => 'type', 'questions' => 12, 'seconds' => 120,
        ],
    ];
}

function arcade_game(string $key): ?array {
    $g = arcade_games();
    return $g[$key] ?? null;
}

/* ── Who is playing ───────────────────────────────────────────────────── */

/**
 * Resolve a player to (programme, type, centre, name).
 *
 * Programme comes from which table the id lives in, the same way
 * community_author() resolves a display name — not from the session role,
 * which says how someone signed in rather than which cohort they belong to.
 */
function arcade_player(string $id): array {
    $m = db_row("SELECT fullName, centre FROM members WHERE memberId = ? LIMIT 1", [$id]);
    if ($m) return ['id' => $id, 'programme' => 'ngg', 'type' => 'member',
                    'name' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? '')];
    $m = db_row("SELECT fullName, centre FROM summer_students WHERE studentId = ? LIMIT 1", [$id]);
    if ($m) return ['id' => $id, 'programme' => 'summer', 'type' => 'student',
                    'name' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? '')];
    $m = db_row("SELECT fullName FROM volunteers WHERE volunteerId = ? LIMIT 1", [$id]);
    if ($m) return ['id' => $id, 'programme' => 'summer', 'type' => 'volunteer',
                    'name' => (string)$m['fullName'], 'centre' => ''];
    return ['id' => $id, 'programme' => '', 'type' => '', 'name' => '', 'centre' => ''];
}

/* ── Round generation ─────────────────────────────────────────────────── */

/**
 * Difficulty tier 1..5 from the player's best score at this game. Everyone
 * starts on tier 1; a child who has never played is not handed the hard set,
 * and a child who has mastered it is not handed 2+3 forever.
 */
function arcade_tier(string $playerId, string $game): int {
    $best = (int)(db_row("SELECT MAX(score) b FROM arcade_scores WHERE playerId = ? AND game = ?",
        [$playerId, $game])['b'] ?? 0);
    if ($best >= 260) return 5;
    if ($best >= 200) return 4;
    if ($best >= 145) return 3;
    if ($best >= 90)  return 2;
    return 1;
}

/** Number Rush: n arithmetic questions whose range grows with the tier. */
function arcade_gen_maths(int $n, int $tier): array {
    $qs = []; $keys = [];
    $hi = [1 => 12, 2 => 20, 3 => 40, 4 => 80, 5 => 140][$tier] ?? 12;
    for ($i = 0; $i < $n; $i++) {
        // Multiplication and division stay on a sane times-table even at tier 5;
        // the point is fluency, not 97 × 83.
        $ops = $tier >= 3 ? ['+', '-', '*', '/'] : ($tier >= 2 ? ['+', '-', '*'] : ['+', '-']);
        $op = $ops[random_int(0, count($ops) - 1)];
        if ($op === '+') {
            $a = random_int(2, $hi); $b = random_int(2, $hi); $ans = $a + $b;
        } elseif ($op === '-') {
            $a = random_int(2, $hi); $b = random_int(2, $hi);
            if ($b > $a) { $t = $a; $a = $b; $b = $t; }   // keep it non-negative
            $ans = $a - $b;
        } elseif ($op === '*') {
            $lim = min(12, 3 + $tier * 2);
            $a = random_int(2, $lim); $b = random_int(2, $lim); $ans = $a * $b;
        } else {
            $lim = min(12, 3 + $tier * 2);
            $b = random_int(2, $lim); $ans = random_int(2, $lim); $a = $b * $ans;   // always exact
        }
        $sym = ['+' => '+', '-' => '−', '*' => '×', '/' => '÷'][$op];
        $qs[] = ['q' => $a . ' ' . $sym . ' ' . $b];
        $keys[] = (string)$ans;
    }
    return [$qs, $keys];
}

/** The Naija bank: every state capital, plus civics and geography. */
function arcade_naija_bank(): array {
    $caps = [
        'Abia' => 'Umuahia', 'Adamawa' => 'Yola', 'Akwa Ibom' => 'Uyo', 'Anambra' => 'Awka',
        'Bauchi' => 'Bauchi', 'Bayelsa' => 'Yenagoa', 'Benue' => 'Makurdi', 'Borno' => 'Maiduguri',
        'Cross River' => 'Calabar', 'Delta' => 'Asaba', 'Ebonyi' => 'Abakaliki', 'Edo' => 'Benin City',
        'Ekiti' => 'Ado-Ekiti', 'Enugu' => 'Enugu', 'Gombe' => 'Gombe', 'Imo' => 'Owerri',
        'Jigawa' => 'Dutse', 'Kaduna' => 'Kaduna', 'Kano' => 'Kano', 'Katsina' => 'Katsina',
        'Kebbi' => 'Birnin Kebbi', 'Kogi' => 'Lokoja', 'Kwara' => 'Ilorin', 'Lagos' => 'Ikeja',
        'Nasarawa' => 'Lafia', 'Niger' => 'Minna', 'Ogun' => 'Abeokuta', 'Ondo' => 'Akure',
        'Osun' => 'Osogbo', 'Oyo' => 'Ibadan', 'Plateau' => 'Jos', 'Rivers' => 'Port Harcourt',
        'Sokoto' => 'Sokoto', 'Taraba' => 'Jalingo', 'Yobe' => 'Damaturu', 'Zamfara' => 'Gusau',
    ];
    $out = [];
    $allCaps = array_values($caps);
    foreach ($caps as $state => $cap) {
        $out[] = ['q' => 'What is the capital of ' . $state . ' State?', 'a' => $cap, 'pool' => $allCaps];
    }
    $facts = [
        ['How many states does Nigeria have (not counting the FCT)?', '36', ['30', '32', '35', '37', '38']],
        ['Which city is the Federal Capital Territory?', 'Abuja', ['Lagos', 'Kaduna', 'Ibadan', 'Enugu']],
        ['Which river meets the Niger at Lokoja?', 'Benue', ['Kaduna', 'Ogun', 'Cross', 'Sokoto']],
        ['Nigeria gained independence in which year?', '1960', ['1957', '1963', '1966', '1914']],
        ['Which is Nigeria\'s highest point?', 'Chappal Waddi', ['Zuma Rock', 'Olumo Rock', 'Shere Hills', 'Idanre Hill']],
        ['How many local government areas does Nigeria have?', '774', ['576', '640', '712', '801']],
        ['Which body organises Nigerian elections?', 'INEC', ['NNPC', 'EFCC', 'NAFDAC', 'JAMB']],
        ['What are the colours of the Nigerian flag?', 'Green, white, green', ['Green, gold, green', 'White, green, white', 'Green, white, red', 'Green, black, green']],
        ['Which sea does Nigeria border?', 'Gulf of Guinea', ['Red Sea', 'Mediterranean Sea', 'Gulf of Aden', 'Arabian Sea']],
        ['Which of these is a Nigerian Nobel laureate?', 'Wole Soyinka', ['Chinua Achebe', 'Ben Okri', 'Cyprian Ekwensi', 'Buchi Emecheta']],
        ['What does "NYSC" stand for?', 'National Youth Service Corps', ['National Youth Sports Council', 'Nigerian Young Scholars Community', 'National Yearly Study Course', 'Nigerian Youth Skills Centre']],
        ['Which is the longest river in Nigeria?', 'River Niger', ['River Benue', 'Cross River', 'Ogun River', 'Kaduna River']],
        ['Which arm of government makes the laws?', 'The legislature', ['The executive', 'The judiciary', 'The civil service', 'The police']],
        ['How many senators does each Nigerian state elect?', '3', ['1', '2', '4', '5']],
        ['Which of these is an official language of Nigeria?', 'English', ['French', 'Portuguese', 'Arabic', 'Swahili']],
    ];
    foreach ($facts as $f) $out[] = ['q' => $f[0], 'a' => $f[1], 'pool' => array_merge([$f[1]], $f[2])];
    return $out;
}

/** Words that are commonly misspelt, with the misspellings people actually use. */
function arcade_spell_bank(): array {
    return [
        ['definitely',   ['definately', 'definetly', 'definitly']],
        ['separate',     ['seperate', 'seperete', 'saparate']],
        ['necessary',    ['neccessary', 'necesary', 'nessesary']],
        ['believe',      ['beleive', 'belive', 'beleave']],
        ['receive',      ['recieve', 'receve', 'reccieve']],
        ['occurred',     ['occured', 'ocurred', 'occurrd']],
        ['embarrass',    ['embarass', 'embarras', 'emberrass']],
        ['tomorrow',     ['tommorow', 'tomorow', 'tommorrow']],
        ['beginning',    ['begining', 'beginnning', 'begginning']],
        ['government',   ['goverment', 'governmant', 'govenment']],
        ['acknowledge',  ['aknowledge', 'acknowlege', 'acknowledgge']],
        ['discipline',   ['disipline', 'dicipline', 'displine']],
        ['committee',    ['commitee', 'comittee', 'committe']],
        ['environment',  ['enviroment', 'envirnment', 'environmant']],
        ['opportunity',  ['oportunity', 'opportunuty', 'oppurtunity']],
        ['successful',   ['succesful', 'successfull', 'sucessful']],
        ['immediately',  ['imediately', 'immediatly', 'immedietly']],
        ['knowledge',    ['knowlege', 'knowladge', 'knowlodge']],
        ['restaurant',   ['restaraunt', 'resturant', 'restarant']],
        ['calendar',     ['calender', 'calandar', 'callendar']],
        ['privilege',    ['priviledge', 'privelege', 'privilage']],
        ['maintenance',  ['maintainance', 'maintenence', 'maintanance']],
        ['perseverance', ['perseverence', 'persaverance', 'perserverance']],
        ['conscience',   ['concience', 'consience', 'conscence']],
        ['argument',     ['arguement', 'argumant', 'arguemant']],
        ['recommend',    ['recomend', 'reccommend', 'recommmend']],
        ['occasion',     ['ocassion', 'occassion', 'ocasion']],
        ['queue',        ['que', 'queu', 'quene']],
        ['rhythm',       ['rythm', 'rhythem', 'rhytm']],
        ['guarantee',    ['garantee', 'guarentee', 'guaranty']],
    ];
}

/** Words worth knowing, unscrambled. Nothing shorter than 5 letters. */
function arcade_word_bank(): array {
    return [
        1 => ['budget', 'market', 'school', 'friend', 'purpose', 'listen', 'change', 'record', 'growth', 'reason', 'letter', 'family', 'health'],
        2 => ['courage', 'respect', 'balance', 'measure', 'promise', 'quality', 'improve', 'venture', 'justice', 'freedom', 'teacher', 'compass'],
        3 => ['strategy', 'discover', 'evidence', 'resource', 'creative', 'progress', 'engineer', 'discount', 'proposal', 'heritage', 'timeline', 'guardian'],
        4 => ['initiative', 'confidence', 'leadership', 'innovation', 'discipline', 'reflection', 'collective', 'enterprise', 'compassion', 'resilience'],
        5 => ['accountability', 'entrepreneurship', 'sustainability', 'collaboration', 'determination', 'responsibility', 'transformation', 'communication'],
    ];
}

/** Shuffle a word's letters, guaranteeing the result differs from the word. */
function arcade_scramble(string $w): string {
    $ch = preg_split('//u', $w, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    for ($try = 0; $try < 12; $try++) {
        shuffle($ch);
        $s = implode('', $ch);
        if ($s !== $w) return $s;
    }
    // Every attempt landed back on the word (a word of identical letters).
    // Reversing at least changes nothing silently.
    return implode('', array_reverse($ch));
}

/**
 * Build a round. Returns [questionsForClient, answerKey]. The key must never
 * appear in the client payload — every caller ships only the first element.
 */
function arcade_generate(string $game, int $tier): array {
    $g = arcade_game($game);
    $n = (int)($g['questions'] ?? 10);
    if ($game === 'maths') return arcade_gen_maths($n, $tier);

    if ($game === 'naija') {
        $bank = arcade_naija_bank();
        shuffle($bank);
        $qs = []; $keys = [];
        foreach (array_slice($bank, 0, $n) as $item) {
            $pool = array_values(array_unique(array_filter($item['pool'], fn($x) => $x !== $item['a'])));
            shuffle($pool);
            $opts = array_slice($pool, 0, 3);
            $opts[] = $item['a'];
            shuffle($opts);
            $qs[] = ['q' => $item['q'], 'options' => $opts];
            $keys[] = (string)array_search($item['a'], $opts, true);
        }
        return [$qs, $keys];
    }

    if ($game === 'spell') {
        $bank = arcade_spell_bank();
        shuffle($bank);
        $qs = []; $keys = [];
        foreach (array_slice($bank, 0, $n) as $item) {
            $opts = $item[1];
            $opts[] = $item[0];
            shuffle($opts);
            $qs[] = ['q' => 'Which spelling is correct?', 'options' => $opts];
            $keys[] = (string)array_search($item[0], $opts, true);
        }
        return [$qs, $keys];
    }

    if ($game === 'word') {
        $bank = arcade_word_bank();
        // Draw mostly from the player's tier, with a couple from just below so
        // a hard round still opens with something winnable.
        $pool = array_merge($bank[$tier] ?? [], $bank[max(1, $tier - 1)] ?? []);
        $pool = array_values(array_unique(array_filter($pool)));
        shuffle($pool);
        $qs = []; $keys = [];
        foreach (array_slice($pool, 0, $n) as $w) {
            $qs[] = ['q' => arcade_scramble($w), 'letters' => mb_strlen($w)];
            $keys[] = $w;
        }
        return [$qs, $keys];
    }
    return [[], []];
}

/* ── Daily challenge ──────────────────────────────────────────────────── */

/**
 * Today's featured game. Rotates deterministically on the date so every player
 * gets the same one — a daily challenge nobody shares is just a game.
 */
function arcade_daily_game(?string $date = null): string {
    $keys = array_keys(arcade_games());
    sort($keys);                                   // stable regardless of catalogue order
    $d = $date ?: gmdate('Y-m-d');
    $n = (int)gmdate('z', strtotime($d . ' 00:00:00 UTC') ?: time())
       + (int)gmdate('Y', strtotime($d . ' 00:00:00 UTC') ?: time()) * 366;
    return $keys[$n % count($keys)];
}

/**
 * Consecutive days, ending today or yesterday, on which the player completed
 * that day's featured game. Ending *yesterday* still counts: a streak is not
 * broken until a day passes without play, and telling a child at 9am that
 * their 14-day streak is zero because they have not played yet today is both
 * wrong and the fastest way to lose them.
 */
function arcade_streak(string $playerId): int {
    $rows = db_all("SELECT DISTINCT date, game FROM arcade_scores WHERE playerId = ? ORDER BY date DESC LIMIT 400", [$playerId]);
    $byDate = [];
    foreach ($rows as $r) $byDate[(string)$r['date']][(string)$r['game']] = true;
    $today = gmdate('Y-m-d');
    $cursor = $today;
    if (empty($byDate[$today][arcade_daily_game($today)])) {
        $cursor = gmdate('Y-m-d', strtotime($today . ' -1 day'));
        if (empty($byDate[$cursor][arcade_daily_game($cursor)])) return 0;
    }
    $n = 0;
    while (!empty($byDate[$cursor][arcade_daily_game($cursor)])) {
        $n++;
        $cursor = gmdate('Y-m-d', strtotime($cursor . ' -1 day'));
        if ($n > 366) break;
    }
    return $n;
}

/* ── Play ─────────────────────────────────────────────────────────────── */

/** Occasionally drop rounds nobody will ever submit. Cheap and bounded. */
function arcade_prune(): void {
    if (random_int(1, 20) !== 1) return;
    $cut = gmdate('Y-m-d H:i:s', time() - ARCADE_ROUND_TTL_DAYS * 86400);
    try { db_exec("DELETE FROM arcade_rounds WHERE startedAt < ?", [$cut]); } catch (\Throwable $e) {}
}

function arcade_round_start(array $p): array {
    $playerId = (string)($p['memberId'] ?? '');
    if ($playerId === '') return ['ok' => false, 'error' => 'forbidden'];
    $game = (string)($p['game'] ?? '');
    $g = arcade_game($game);
    if (!$g) return ['ok' => false, 'error' => 'unknown_game'];

    $who = arcade_player($playerId);
    if ($who['programme'] === '') return ['ok' => false, 'error' => 'forbidden'];

    // A suspended or evicted person is barred from the digital channels, and
    // the arcade is one of them — the same gate the community sign-in uses.
    // Members are gated too now that they carry enforcement — policy_gate_checkin
    // is a no-op for any type whose switch is off, so this stays inert until an
    // admin turns member enforcement on.
    if (function_exists('policy_gate_checkin')) {
        $gate = policy_gate_checkin($playerId, $who['type']);
        if (!$gate['ok']) return ['ok' => false, 'error' => $gate['error'], 'message' => $gate['message'] ?? ''];
    }

    arcade_prune();
    $tier = arcade_tier($playerId, $game);
    [$qs, $keys] = arcade_generate($game, $tier);
    if (!$qs) return ['ok' => false, 'error' => 'no_questions'];

    $roundId = 'AR-' . strtoupper(rand_hex(8));
    db_insert('arcade_rounds', [
        'roundId' => $roundId, 'playerId' => $playerId, 'game' => $game, 'tier' => $tier,
        'answerKey' => json_encode($keys, JSON_UNESCAPED_UNICODE),
        'seconds' => (int)$g['seconds'],
        'startedAt' => now_iso(), 'startedMs' => (int)round(microtime(true) * 1000),
        'submittedAt' => '',
    ]);
    return ['ok' => true, 'roundId' => $roundId, 'game' => $game, 'tier' => $tier,
            'seconds' => (int)$g['seconds'], 'kind' => (string)$g['kind'], 'questions' => $qs];
}

/**
 * Grade a submitted round.
 *
 * Score = 10 per correct answer, +25 for a clean sweep, plus a speed bonus
 * worth up to 5 per correct answer that decays linearly over the clock. The
 * speed term uses the SERVER's elapsed time; `ms` from the client is ignored.
 */
function arcade_round_submit(array $p): array {
    $playerId = (string)($p['memberId'] ?? '');
    if ($playerId === '') return ['ok' => false, 'error' => 'forbidden'];
    $roundId = (string)($p['roundId'] ?? '');
    $row = db_row("SELECT * FROM arcade_rounds WHERE roundId = ? LIMIT 1", [$roundId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['playerId'] !== $playerId) return ['ok' => false, 'error' => 'forbidden'];
    // Graded once. Otherwise a player submits, reads which answers were wrong,
    // and resubmits a perfect sheet.
    if ((string)($row['submittedAt'] ?? '') !== '') return ['ok' => false, 'error' => 'already_played'];

    $nowMs = (int)round(microtime(true) * 1000);
    $elapsedMs = max(0, $nowMs - (int)$row['startedMs']);
    $limitMs = ((int)$row['seconds'] + ARCADE_GRACE) * 1000;
    // Close the round BEFORE deciding anything else: an expired round must not
    // be retryable either.
    db_update('arcade_rounds', ['submittedAt' => now_iso()], ['roundId' => $roundId]);
    if ($elapsedMs > $limitMs) return ['ok' => false, 'error' => 'expired',
        'message' => 'That round ran out of time. Start a fresh one.'];

    $keys = json_decode((string)$row['answerKey'], true);
    if (!is_array($keys)) return ['ok' => false, 'error' => 'corrupt_round'];
    $given = $p['answers'] ?? [];
    if (!is_array($given)) $given = [];

    $game = (string)$row['game'];
    $correct = 0;
    $marks = [];
    foreach ($keys as $i => $want) {
        $got = isset($given[$i]) ? trim((string)$given[$i]) : '';
        $hit = arcade_matches($game, (string)$want, $got);
        if ($hit) $correct++;
        // The key IS returned here, and only here: the round is closed, so
        // knowing the answers is worth nothing — and a quiz that will not tell
        // a child what they got wrong has taught them nothing.
        $marks[] = ['i' => $i, 'ok' => $hit, 'answer' => (string)$want, 'given' => $got];
    }
    $total = count($keys);

    $base = $correct * 10;
    $sweep = ($total > 0 && $correct === $total) ? 25 : 0;
    $clockMs = max(1, (int)$row['seconds'] * 1000);
    $speedFrac = max(0.0, min(1.0, ($clockMs - $elapsedMs) / $clockMs));
    $speed = (int)round($speedFrac * 5 * $correct);
    $score = $base + $sweep + $speed;

    $who = arcade_player($playerId);
    $prevBest = (int)(db_row("SELECT MAX(score) b FROM arcade_scores WHERE playerId = ? AND game = ?",
        [$playerId, $game])['b'] ?? 0);

    db_insert('arcade_scores', [
        'roundId' => $roundId, 'playerId' => $playerId, 'playerType' => $who['type'],
        'programme' => $who['programme'], 'game' => $game, 'score' => $score,
        'correct' => $correct, 'total' => $total, 'ms' => $elapsedMs,
        'centre' => $who['centre'], 'date' => gmdate('Y-m-d'), 'createdAt' => now_iso(),
    ]);

    $isDaily = ($game === arcade_daily_game());
    return ['ok' => true, 'score' => $score, 'correct' => $correct, 'total' => $total,
            'seconds' => round($elapsedMs / 1000, 1),
            'breakdown' => ['base' => $base, 'sweep' => $sweep, 'speed' => $speed],
            'best' => max($prevBest, $score), 'newBest' => $score > $prevBest,
            'daily' => $isDaily, 'streak' => arcade_streak($playerId),
            'marks' => $marks];
}

/**
 * Is `$got` the right answer to a `$game` question whose key is `$want`?
 *
 * Typed games are forgiving about the things that are not the skill under
 * test — case, surrounding space, and the commas and spaces people put in
 * large numbers — and strict about everything that is.
 */
function arcade_matches(string $game, string $want, string $got): bool {
    if ($got === '') return false;
    if ($game === 'maths') {
        $norm = fn(string $s) => preg_replace('/[\s,]/', '', $s);
        return $norm($got) !== '' && $norm($got) === $norm($want);
    }
    if ($game === 'word') {
        return mb_strtolower(trim($got)) === mb_strtolower($want);
    }
    /* Choice games: the key is the index of the right option. Cast carefully —
     * (int)'abc' is 0 in PHP, so a plain compare would hand every question
     * whose answer is option 0 to anyone who submitted junk. */
    if (!preg_match('/^\d+$/', trim($got))) return false;
    return (int)$got === (int)$want;
}

/* ── Boards and home ──────────────────────────────────────────────────── */

/**
 * Leaderboard for one game, scoped to one programme.
 *
 * Ranked on a player's BEST round, not their total: totals reward whoever has
 * the most free time, and the child who plays forty mediocre rounds should not
 * outrank the one who played a brilliant one. Names are shown the same way the
 * community shows them — first name plus a last initial.
 */
function arcade_leaderboard(array $p): array {
    $game = (string)($p['game'] ?? '');
    if ($game !== '' && !arcade_game($game)) return ['ok' => false, 'error' => 'unknown_game'];
    $scope = (string)($p['scope'] ?? 'week') === 'all' ? 'all' : 'week';
    $viewer = (string)($p['memberId'] ?? '');
    $programme = (string)($p['programme'] ?? '');
    if ($programme === '' && $viewer !== '') $programme = arcade_player($viewer)['programme'];
    if ($programme !== 'ngg' && $programme !== 'summer') $programme = 'summer';
    $limit = max(3, min(50, (int)($p['limit'] ?? 15)));

    $where = ['programme = ?']; $args = [$programme];
    if ($game !== '') { $where[] = 'game = ?'; $args[] = $game; }
    if ($scope === 'week') { $where[] = 'date >= ?'; $args[] = gmdate('Y-m-d', time() - 6 * 86400); }
    $sql = "SELECT playerId, MAX(score) best, COUNT(*) plays, SUM(correct) correct, MAX(centre) centre
            FROM arcade_scores WHERE " . implode(' AND ', $where) . "
            GROUP BY playerId ORDER BY best DESC, plays ASC LIMIT " . ($limit + 40);
    $rows = db_all($sql, $args);

    $out = []; $rank = 0; $mine = null;
    foreach ($rows as $r) {
        $rank++;
        $id = (string)$r['playerId'];
        $who = arcade_player($id);
        $parts = preg_split('/\s+/', trim($who['name'])) ?: [];
        $first = $parts[0] ?? 'Player';
        $initial = count($parts) > 1 ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
        $entry = ['rank' => $rank, 'first' => $first, 'initial' => $initial,
                  'centre' => (string)($r['centre'] ?? ''), 'best' => (int)$r['best'],
                  'plays' => (int)$r['plays'], 'correct' => (int)$r['correct'],
                  'isMe' => $id === $viewer];
        if ($entry['isMe']) $mine = $entry;
        if (count($out) < $limit) $out[] = $entry;
    }
    // A board that cuts off at 15 tells the 40th-placed child nothing. Their
    // own row rides along even when it is off the end of the list.
    return ['ok' => true, 'board' => $out, 'me' => $mine, 'scope' => $scope,
            'game' => $game, 'programme' => $programme];
}

/** The arcade landing payload: catalogue + this player's standing. */
function arcade_home(array $p): array {
    $playerId = (string)($p['memberId'] ?? '');
    if ($playerId === '') return ['ok' => false, 'error' => 'forbidden'];
    $who = arcade_player($playerId);
    if ($who['programme'] === '') return ['ok' => false, 'error' => 'forbidden'];

    $bests = [];
    foreach (db_all("SELECT game, MAX(score) best, COUNT(*) plays FROM arcade_scores
                     WHERE playerId = ? GROUP BY game", [$playerId]) as $r) {
        $bests[(string)$r['game']] = ['best' => (int)$r['best'], 'plays' => (int)$r['plays']];
    }
    $games = [];
    $daily = arcade_daily_game();
    foreach (arcade_games() as $k => $g) {
        $b = $bests[$k] ?? ['best' => 0, 'plays' => 0];
        $games[] = $g + ['best' => $b['best'], 'plays' => $b['plays'],
                         'tier' => arcade_tier($playerId, $k), 'isDaily' => $k === $daily];
    }
    $today = gmdate('Y-m-d');
    $dailyDone = (int)(db_row("SELECT COUNT(*) c FROM arcade_scores WHERE playerId = ? AND game = ? AND date = ?",
        [$playerId, $daily, $today])['c'] ?? 0) > 0;

    // Behaviour stars are shown, never written. They come from the mentor
    // ledger and mean something the arcade has no business changing.
    $stars = (int)(db_row("SELECT COALESCE(SUM(stars),0) s FROM member_stars WHERE subjectId = ?",
        [$playerId])['s'] ?? 0);

    return ['ok' => true, 'games' => $games, 'daily' => $daily, 'dailyDone' => $dailyDone,
            'streak' => arcade_streak($playerId), 'stars' => $stars,
            'programme' => $who['programme'],
            'totalPlays' => array_sum(array_column(array_values($bests), 'plays'))];
}
