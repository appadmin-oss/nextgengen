<?php
declare(strict_types=1);

/**
 * Pairing engines.
 *
 * The old tournament had one shape — every centre plays its own knockout, the
 * champions meet — and paired alphabetically. That shape is still here and is
 * still the right default for a programme that runs at several centres: a
 * child at Ayobo can win something without travelling, and a centre with four
 * entrants is not knocked out in round one by a centre with forty.
 *
 * But it is not the only shape a club needs, and for most club events it is
 * the wrong one. A knockout sends half the entrants home after one game. For
 * children who came to play chess on a Saturday, that is the worst property a
 * format can have. Swiss is what chess clubs actually run, and it is the
 * default here for that reason: everybody plays every round, nobody is
 * eliminated, and you are matched against somebody on your own score.
 *
 *   swiss       — n rounds, paired by score then rating, never the same
 *                 opponent twice, colours balanced.
 *   roundrobin  — everybody plays everybody (Berger tables).
 *   knockout    — single elimination, seeded by rating so the two strongest
 *                 do not meet in round one.
 *   centre      — the programme's own shape: a knockout per centre, then a
 *                 final between the champions.
 *   arena       — a timed window; finish a game, get re-paired immediately;
 *                 consecutive wins are worth more.
 *
 * Every engine returns the same thing: a list of pairings for the round, plus
 * whoever got a bye. Nothing here writes to the database — tournaments.php
 * does that — so a pairing can be computed, shown to a director, and only then
 * committed.
 */

const TOURNAMENT_FORMATS = ['swiss', 'knockout', 'roundrobin', 'centre', 'arena'];

function tournament_format_meta(): array {
    return [
        'swiss' => ['name' => 'Swiss', 'blurb' => 'Everyone plays every round. Nobody is knocked out.',
                    'rounds' => true, 'best' => '8–60 players'],
        'knockout' => ['name' => 'Knockout', 'blurb' => 'Lose once and you are out. Seeded by rating.',
                       'rounds' => false, 'best' => '8–64 players'],
        'roundrobin' => ['name' => 'Round robin', 'blurb' => 'Everybody plays everybody, once.',
                         'rounds' => false, 'best' => '4–12 players'],
        'centre' => ['name' => 'Centre cup', 'blurb' => 'Each centre runs its own knockout; the champions meet.',
                     'rounds' => false, 'best' => 'Several centres at once'],
        'arena' => ['name' => 'Arena', 'blurb' => 'A timed window. Finish a game, get another straight away.',
                    'rounds' => false, 'best' => 'Drop-in club sessions'],
    ];
}

/** How many Swiss rounds a field of this size deserves. */
function tournament_swiss_rounds(int $players): int {
    if ($players <= 2) return 1;
    /* ceil(log2(n)) is the knockout depth — the number of rounds it takes for
     * one player to be able to beat everybody. Swiss uses the same figure: any
     * fewer and several players finish on the same score having never met. */
    $r = (int)ceil(log($players, 2));
    return max(3, min(11, $r));
}

/* ── Shared helpers ───────────────────────────────────────────────────── */

/** The opponents this entrant has already faced. */
function tournament_opponents_of(array $e): array {
    $j = json_decode((string)($e['opponents'] ?? ''), true);
    return is_array($j) ? array_map('strval', $j) : [];
}

/**
 * Which colour should these two get?
 *
 * Chess courtesy, in priority order: whoever is more owed a colour gets it;
 * then alternate from each player's last game; then the higher seed takes
 * white. Nobody gets three of the same colour in a row if it can be avoided.
 *
 * Returns [whiteEntrant, blackEntrant].
 */
function tournament_assign_colours(array $a, array $b): array {
    $balA = (int)($a['whiteCount'] ?? 0) - (int)($a['blackCount'] ?? 0);
    $balB = (int)($b['whiteCount'] ?? 0) - (int)($b['blackCount'] ?? 0);

    // The player who has had white less often, relative to the other, gets it.
    if ($balA !== $balB) return $balA < $balB ? [$a, $b] : [$b, $a];

    // Equal balance: alternate from the last colour each actually had.
    $lastA = (string)($a['lastColour'] ?? '');
    $lastB = (string)($b['lastColour'] ?? '');
    if ($lastA !== $lastB) {
        if ($lastA === 'w') return [$b, $a];
        if ($lastB === 'w') return [$a, $b];
        if ($lastA === 'b') return [$a, $b];
        return [$b, $a];
    }
    // Nothing to separate them: the stronger seed takes white.
    return (int)($a['seed'] ?? 0) <= (int)($b['seed'] ?? 0) ? [$a, $b] : [$b, $a];
}

/** One pairing, in the shape every engine returns. */
function tournament_pair(array $white, array $black, int $board, string $centre = ''): array {
    return [
        'board' => $board,
        'centre' => $centre !== '' ? $centre : (string)($white['centre'] ?? ''),
        'whiteId' => (string)$white['playerId'], 'whiteName' => (string)$white['playerName'],
        'blackId' => (string)$black['playerId'], 'blackName' => (string)$black['playerName'],
        'isBye' => false,
    ];
}

function tournament_bye(array $e, int $board): array {
    return [
        'board' => $board, 'centre' => (string)($e['centre'] ?? ''),
        'whiteId' => (string)$e['playerId'], 'whiteName' => (string)$e['playerName'],
        'blackId' => '', 'blackName' => '',
        'isBye' => true,
    ];
}

/* ── Swiss ────────────────────────────────────────────────────────────── */

/**
 * Pair one Swiss round.
 *
 * The real Dutch system is a large piece of machinery with transpositions,
 * backtracking and float history. This is the honest club subset, and it is
 * the subset that matters: sort into score groups, pair strongest-half against
 * weakest-half inside each group, carry the odd player down, and never repeat
 * a pairing.
 *
 * Round one has no scores, so it pairs by RATING: the top half plays the
 * bottom half, which is what makes a Swiss converge. Alphabetical pairing —
 * what this used to do — is the one ordering guaranteed to be meaningless.
 *
 * The bye goes to the lowest-scoring player who has not had one. A bye is a
 * full point, so giving a second one to somebody who already had a free point
 * decides the event on an accident.
 */
function tournament_pair_swiss(array $entrants, int $round): array {
    $players = array_values(array_filter($entrants, fn($e) => (int)($e['withdrawn'] ?? 0) === 0));
    if (count($players) < 2) return ['pairings' => [], 'byes' => $players];

    if ($round <= 1) {
        // Round one: by rating, top half against bottom half.
        usort($players, fn($a, $b) => [(int)$b['ratingAtEntry'], (string)$a['playerName']]
                                  <=> [(int)$a['ratingAtEntry'], (string)$b['playerName']]);
    } else {
        usort($players, fn($a, $b) => [(float)$b['score'], (int)$b['ratingAtEntry'], (string)$a['playerName']]
                                  <=> [(float)$a['score'], (int)$a['ratingAtEntry'], (string)$b['playerName']]);
    }

    $bye = null;
    if (count($players) % 2 === 1) {
        // Lowest scorer who has not already had one; if everybody has, the
        // lowest scorer takes a second.
        for ($i = count($players) - 1; $i >= 0; $i--) {
            if ((int)($players[$i]['byes'] ?? 0) === 0) { $bye = $players[$i]; array_splice($players, $i, 1); break; }
        }
        if ($bye === null) { $bye = array_pop($players); }
    }

    /* Group by score, then fold each group. Anybody left over floats down into
     * the next group, which is exactly what a float is. */
    $groups = [];
    foreach ($players as $p) {
        $k = number_format((float)$p['score'], 1, '.', '');
        $groups[$k][] = $p;
    }
    krsort($groups, SORT_NUMERIC);

    /* Pairs are held as the two ENTRANTS until the end, not as the flat rows
     * the writer stores. The repair below has to ask "have these two met",
     * and the stored row carries ids and names only. */
    $made = [];
    $carry = [];
    foreach ($groups as $group) {
        $pool = array_merge($carry, $group);
        $carry = [];
        $paired = tournament_swiss_fold($pool);
        foreach ($paired['pairs'] as [$a, $b]) $made[] = [$a, $b];
        $carry = $paired['left'];
    }
    /* Whoever is left at the bottom could not be paired inside their own score
     * group. Before accepting a repeat, TRY TO SWAP.
     *
     * Measured before this existed: simulating twelve field sizes to their
     * full length produced a repeat pairing at nine players in ROUND TWO —
     * after one round, when nobody has met more than one person and a legal
     * partner obviously exists. The leftovers were simply paired with each
     * other and the repeat accepted, because the fold only ever looks inside
     * one score group and never revisits a pair it has already made.
     *
     * This is the transposition step the header says the honest club subset
     * leaves out. It is bounded and it is not clever: for each leftover pair
     * that would be a repeat, walk the pairings already made and look for one
     * we can exchange a player with such that BOTH resulting pairs are fresh.
     * One pass, first fit, no backtracking. It does not make this a Dutch
     * implementation; it makes it stop producing a repeat when an obvious swap
     * was available. */
    while (count($carry) >= 2) {
        $a = array_shift($carry);
        /* Choose $a's partner rather than taking whoever is next in the list.
         * Two things to want, in order: somebody $a has not met, and somebody
         * whose colour debt runs the other way. Taking the adjacent player was
         * how a field of thirty ended with a player three whites clear of
         * their blacks — an imbalance a Swiss does not allow. */
        $pick = 0; $best = -1;
        foreach ($carry as $i => $cand) {
            $score = (tournament_have_met($a, $cand) ? 0 : 2)
                   + (tournament_colours_oppose($a, $cand) ? 1 : 0);
            if ($score > $best) { $best = $score; $pick = $i; }
            if ($best === 3) break;                      // fresh and complementary
        }
        $b = $carry[$pick];
        array_splice($carry, $pick, 1);
        if (tournament_have_met($a, $b)) tournament_swap_out($made, $a, $b);
        $made[] = [$a, $b];
    }

    /* One last pass for colour.
     *
     * Everything above chooses greedily, one pairing at a time, and greedy is
     * not enough: simulating every field from four to forty still left ONE of
     * them with a player three whites clear of their blacks, which a Swiss
     * does not allow. Tuning the greedy score just moved which field it was —
     * n=30 became n=21 — which is the signal that the problem is not the score
     * but the absence of a second look.
     *
     * So: after the pairs exist, find anybody the assignment would push past
     * two and try to exchange partners with another pair. Same shape as the
     * repeat repair, same bounds, and it only accepts an exchange that lowers
     * the worst imbalance without introducing a repeat. */
    tournament_colour_repair($made);

    /* Flatten. Boards are numbered by strength and the swap can move somebody,
     * so they are assigned once here rather than maintained through it. */
    $pairings = [];
    $board = 1;
    foreach ($made as [$a, $b]) {
        [$w, $bl] = tournament_assign_colours($a, $b);
        $pairings[] = tournament_pair($w, $bl, $board++);
    }

    $byes = $bye ? [$bye] : [];
    foreach ($carry as $left) $byes[] = $left;
    return ['pairings' => $pairings, 'byes' => $byes];
}

/**
 * Exchange partners between pairs until nobody is over the colour limit, or
 * until no exchange helps. Bounded: at most one improving pass per offending
 * pair, and every candidate exchange is checked for repeats first.
 */
function tournament_colour_repair(array &$made): void {
    $n = count($made);
    for ($i = 0; $i < $n; $i++) {
        if (tournament_colour_cost($made[$i][0], $made[$i][1]) <= 2) continue;
        for ($j = 0; $j < $n; $j++) {
            if ($j === $i) continue;
            [$a, $b] = $made[$i];
            [$c, $d] = $made[$j];
            // The two ways to re-cut a pair of pairs.
            foreach ([[[$a, $c], [$b, $d]], [[$a, $d], [$b, $c]]] as [$p, $q]) {
                if (tournament_have_met($p[0], $p[1]) || tournament_have_met($q[0], $q[1])) continue;
                $before = max(tournament_colour_cost($a, $b), tournament_colour_cost($c, $d));
                $after  = max(tournament_colour_cost($p[0], $p[1]), tournament_colour_cost($q[0], $q[1]));
                if ($after < $before) { $made[$i] = $p; $made[$j] = $q; break 2; }
            }
        }
    }
}

/**
 * What this pairing would cost, in colour terms: the worst imbalance either
 * player is left with once the colours are handed out. Zero is perfect.
 *
 * Measured against the assignment that would ACTUALLY be made — asking
 * tournament_assign_colours rather than assuming the good case — so the score
 * cannot disagree with what then happens.
 */
function tournament_colour_cost(array $a, array $b): int {
    [$w, $bl] = tournament_assign_colours($a, $b);
    $bal = function (array $e, int $d) {
        return abs(((int)($e['whiteCount'] ?? 0) - (int)($e['blackCount'] ?? 0)) + $d);
    };
    return max($bal($w, 1), $bal($bl, -1));
}

/**
 * Would giving these two a game help both their colour histories?
 *
 * True when one is owed white and the other owed black, or when neither is
 * owed anything — in both cases the pairing can be coloured without pushing
 * anybody further from level. False when both lean the same way, which is the
 * pairing that eventually produces a third white in a row.
 */
function tournament_colours_oppose(array $a, array $b): bool {
    $balA = (int)($a['whiteCount'] ?? 0) - (int)($a['blackCount'] ?? 0);
    $balB = (int)($b['whiteCount'] ?? 0) - (int)($b['blackCount'] ?? 0);
    return ($balA > 0 && $balB < 0) || ($balA < 0 && $balB > 0) || ($balA === 0 && $balB === 0);
}

/** Have these two already played each other in this event? */
function tournament_have_met(array $a, array $b): bool {
    return in_array((string)$b['playerId'], tournament_opponents_of($a), true);
}

/**
 * Try to break up an already-made pairing so that $a and $b do not have to
 * repeat. Mutates $pairings in place and swaps $a or $b for somebody fresh.
 *
 * The exchange is only taken when BOTH new pairs are fresh — swapping one
 * repeat for another is not progress. Returns whether anything moved, so a
 * caller can tell "fixed" from "genuinely stuck", which is the difference
 * between a bug and the last resort this was always meant to be.
 */
function tournament_swap_out(array &$made, array &$a, array &$b): bool {
    foreach ($made as $i => [$x, $y]) {
        // Either half of an existing pair can be the one we take.
        foreach ([[$x, $y], [$y, $x]] as [$taken, $partner]) {
            // $a takes $taken's place beside $partner; $taken joins $b.
            if (!tournament_have_met($a, $partner) && !tournament_have_met($taken, $b)) {
                $made[$i] = [$a, $partner];
                $a = $taken;
                return true;
            }
            // …or $b does, and $a keeps its place.
            if (!tournament_have_met($b, $partner) && !tournament_have_met($taken, $a)) {
                $made[$i] = [$b, $partner];
                $b = $taken;
                return true;
            }
        }
    }
    return false;
}

/**
 * Fold one score group: top half against bottom half, skipping any pair who
 * have already met. Returns the pairs made and whoever could not be paired.
 */
function tournament_swiss_fold(array $pool): array {
    $n = count($pool);
    if ($n < 2) return ['pairs' => [], 'left' => $pool];

    $half = intdiv($n, 2);
    $top = array_slice($pool, 0, $half);
    $bot = array_slice($pool, $half);

    $pairs = []; $left = [];
    foreach ($top as $a) {
        $seen = tournament_opponents_of($a);
        $found = -1;
        foreach ($bot as $i => $b) {
            if (in_array((string)$b['playerId'], $seen, true)) continue;
            $found = $i; break;
        }
        if ($found < 0) { $left[] = $a; continue; }
        /* Among the candidates who have not met $a, pick the one that leaves
         * both players' colour histories most level.
         *
         * This used to take the first candidate whose debt merely ran the
         * other way, and fall back to the first fresh one otherwise. First-fit
         * is not good enough: a Swiss allows an imbalance of two and not
         * three, and simulating every field from four to forty put a player at
         * THREE whites clear at n=30 — a genuine violation, not a rounding of
         * the rule. Scoring the candidates instead costs one pass over a list
         * that is already in memory. */
        $seenSet = array_flip($seen);
        $bestCost = PHP_INT_MAX;
        foreach ($bot as $i => $cand) {
            if (isset($seenSet[(string)$cand['playerId']])) continue;
            $cost = tournament_colour_cost($a, $cand);
            if ($cost < $bestCost) { $bestCost = $cost; $found = $i; }
            if ($cost === 0) break;                      // cannot do better
        }
        $pairs[] = [$a, $bot[$found]];
        array_splice($bot, $found, 1);
    }
    return ['pairs' => $pairs, 'left' => array_merge($left, $bot)];
}

/* ── Round robin ──────────────────────────────────────────────────────── */

/**
 * Berger tables: the standard circle method.
 *
 * Player 0 stays put and everybody else rotates, which produces a schedule
 * where every player meets every other exactly once. An odd field gets a
 * phantom player, and whoever draws the phantom has the bye that round.
 */
function tournament_pair_roundrobin(array $entrants, int $round): array {
    $players = array_values(array_filter($entrants, fn($e) => (int)($e['withdrawn'] ?? 0) === 0));
    usort($players, fn($a, $b) => (int)$a['seed'] <=> (int)$b['seed']);
    $n = count($players);
    if ($n < 2) return ['pairings' => [], 'byes' => $players];

    $odd = $n % 2 === 1;
    if ($odd) { $players[] = null; $n++; }        // the phantom
    $totalRounds = $n - 1;
    if ($round < 1 || $round > $totalRounds) return ['pairings' => [], 'byes' => []];

    /* Rotate: index 0 is fixed, the rest turn by (round - 1) places. */
    $rot = array_slice($players, 1);
    $shift = ($round - 1) % ($n - 1);
    $rot = array_merge(array_slice($rot, -$shift ?: count($rot)), array_slice($rot, 0, -$shift ?: 0));
    if ($shift === 0) $rot = array_slice($players, 1);
    $order = array_merge([$players[0]], $rot);

    $pairings = []; $byes = []; $board = 1;
    for ($i = 0; $i < $n / 2; $i++) {
        $a = $order[$i]; $b = $order[$n - 1 - $i];
        if ($a === null) { if ($b !== null) $byes[] = $b; continue; }
        if ($b === null) { $byes[] = $a; continue; }
        // Alternate which end of the pairing takes white, round by round, so
        // the fixed player does not get white every single time.
        [$w, $bl] = ($round % 2 === 0) ? [$b, $a] : [$a, $b];
        [$w, $bl] = tournament_assign_colours($w, $bl);
        $pairings[] = tournament_pair($w, $bl, $board++);
    }
    return ['pairings' => $pairings, 'byes' => $byes];
}

function tournament_roundrobin_rounds(int $players): int {
    if ($players < 2) return 0;
    return $players % 2 === 1 ? $players : $players - 1;
}

/* ── Knockout ─────────────────────────────────────────────────────────── */

/**
 * Single elimination, seeded.
 *
 * Round one pairs 1 v n, 2 v n-1 and so on, which is the standard bracket and
 * the reason the two strongest players can only meet in the final. The old
 * engine paired alphabetically, so a draw could put the top two seeds on board
 * one of round one and settle the event before it started.
 *
 * Byes go to the TOP seeds, which is also standard: a bye is a reward for
 * finishing high in the seeding, not a lottery.
 */
function tournament_pair_knockout(array $entrants, int $round, string $centre = ''): array {
    $live = array_values(array_filter($entrants, fn($e) =>
        (string)$e['status'] === 'active' && (int)($e['withdrawn'] ?? 0) === 0));
    if (count($live) < 2) return ['pairings' => [], 'byes' => $live];

    if ($round <= 1) {
        usort($live, fn($a, $b) => [(int)$b['ratingAtEntry'], (string)$a['playerName']]
                               <=> [(int)$a['ratingAtEntry'], (string)$b['playerName']]);
        $n = count($live);
        // Byes first, to the strongest, until the field is a power of two.
        $target = 1; while ($target < $n) $target *= 2;
        $byeCount = $target - $n;
        $byes = array_slice($live, 0, $byeCount);
        $rest = array_slice($live, $byeCount);
        $pairings = []; $board = 1;
        $c = count($rest);
        for ($i = 0; $i < $c / 2; $i++) {
            [$w, $bl] = tournament_assign_colours($rest[$i], $rest[$c - 1 - $i]);
            $pairings[] = tournament_pair($w, $bl, $board++, $centre);
        }
        return ['pairings' => $pairings, 'byes' => $byes];
    }

    // Later rounds: survivors in seed order, paired down the bracket.
    usort($live, fn($a, $b) => (int)$a['seed'] <=> (int)$b['seed']);
    $pairings = []; $byes = []; $board = 1;
    $c = count($live);
    for ($i = 0; $i + 1 < $c; $i += 2) {
        [$w, $bl] = tournament_assign_colours($live[$i], $live[$i + 1]);
        $pairings[] = tournament_pair($w, $bl, $board++, $centre);
    }
    if ($c % 2 === 1) $byes[] = $live[$c - 1];
    return ['pairings' => $pairings, 'byes' => $byes];
}

/* ── Arena ────────────────────────────────────────────────────────────── */

/**
 * Pair everybody who is free right now.
 *
 * An arena has no rounds. Players join a pool, get paired, play, and are back
 * in the pool the moment the game ends — so this is called whenever the pool
 * changes rather than once per round. Pairing is by current arena score, then
 * by rating, so the leaders meet each other.
 *
 * `$busy` are the ids already in a live game. Nobody gets a bye in an arena;
 * an unpaired player simply waits for the next call, which is the honest
 * behaviour — there is no round for them to be excluded from.
 */
function tournament_pair_arena(array $entrants, array $busy): array {
    $free = [];
    $busySet = array_flip(array_map('strval', $busy));
    foreach ($entrants as $e) {
        if ((int)($e['withdrawn'] ?? 0) === 1) continue;
        if (isset($busySet[(string)$e['playerId']])) continue;
        $free[] = $e;
    }
    usort($free, fn($a, $b) => [(int)$b['arenaPoints'], (int)$b['ratingAtEntry'], (string)$a['playerName']]
                           <=> [(int)$a['arenaPoints'], (int)$a['ratingAtEntry'], (string)$b['playerName']]);

    $pairings = []; $board = 1;
    /* Adjacent pairing, but skip a rematch when there is anybody else to play.
     * Two people going at each other all afternoon is the failure mode of a
     * small arena, and it is the one thing players notice. */
    while (count($free) >= 2) {
        $a = array_shift($free);
        $seen = tournament_opponents_of($a);
        $pick = 0;
        foreach ($free as $i => $cand) {
            if (!in_array((string)$cand['playerId'], $seen, true)) { $pick = $i; break; }
        }
        $b = $free[$pick]; array_splice($free, $pick, 1);
        [$w, $bl] = tournament_assign_colours($a, $b);
        $pairings[] = tournament_pair($w, $bl, $board++);
    }
    return ['pairings' => $pairings, 'byes' => [], 'waiting' => $free];
}

/**
 * Arena scoring: two points a win, one a draw, and a streak bonus.
 *
 * Lichess doubles the value of a game once you are on a streak, which is what
 * makes an arena feel different from a Swiss — it rewards playing on rather
 * than protecting a score. Kept simple enough that a twelve-year-old can work
 * out their own total: a third consecutive win and beyond is worth double.
 */
function tournament_arena_points(string $outcome, int $streakBefore): array {
    $base = $outcome === 'win' ? 2 : ($outcome === 'draw' ? 1 : 0);
    $streak = $outcome === 'win' ? $streakBefore + 1 : 0;
    $onFire = $outcome === 'win' && $streak >= 3;
    return ['points' => $onFire ? $base * 2 : $base, 'streak' => $streak, 'onFire' => $onFire];
}

/* ── Standings ────────────────────────────────────────────────────────── */

/**
 * Order the field, and say why.
 *
 * Score first, then Buchholz (the sum of your opponents' scores — beating
 * people who went on to do well counts for more), then Sonneborn-Berger, then
 * rating. Every tiebreak is shown in the table rather than applied invisibly:
 * a child who finished third needs to be able to see what separated them.
 */
function tournament_standings_sort(array $rows, string $format): array {
    if ($format === 'arena') {
        usort($rows, fn($a, $b) => [(int)$b['arenaPoints'], (float)$b['score'], (int)$b['ratingAtEntry']]
                               <=> [(int)$a['arenaPoints'], (float)$a['score'], (int)$a['ratingAtEntry']]);
        return $rows;
    }
    usort($rows, fn($a, $b) =>
        [(float)$b['score'], (float)$b['tiebreak1'], (float)$b['tiebreak2'], (int)$b['ratingAtEntry'], (string)$a['playerName']]
    <=> [(float)$a['score'], (float)$a['tiebreak1'], (float)$a['tiebreak2'], (int)$a['ratingAtEntry'], (string)$b['playerName']]);
    return $rows;
}

/**
 * Performance rating — the strength you played AT, over this event.
 *
 * The FIDE table approximation: your opponents' average rating, plus a bonus
 * that depends only on the fraction of points you scored. It is the number a
 * player most wants after an event ("I played like 1450 today"), and it is the
 * one number a knockout bracket could never give them.
 */
function tournament_performance(array $opponentRatings, float $score, int $games): int {
    if ($games <= 0 || !$opponentRatings) return 0;
    $avg = array_sum($opponentRatings) / count($opponentRatings);
    $p = max(0.0, min(1.0, $score / $games));
    /* The dp table, indexed in TWENTIETHS rather than by the fraction itself.
     * A float array key is silently cast to int in PHP, so [0.0=>…, 0.05=>…,
     * 0.1=>…] collapses to two entries and every performance rating comes back
     * as the opponents' average. Integer steps cannot do that. */
    static $dp = [-800, -677, -589, -538, -366, -193, -149, -110, -72, -36,
                  0, 36, 72, 110, 149, 193, 366, 538, 589, 677, 800];
    $step = (int)max(0, min(20, round($p * 20)));
    return (int)round($avg + $dp[$step]);
}
