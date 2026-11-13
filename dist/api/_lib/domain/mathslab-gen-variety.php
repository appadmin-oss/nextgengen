<?php
declare(strict_types=1);

/**
 * Maths Lab — more practice forms for the first forty topics (MC-001 … MC-040, Stages 1–4).
 *
 * WHY THIS FILE EXISTS (measured 13 Nov 2026). The first topics every new learner meets carried one
 * or two PRACTICE forms each; the rest of each topic's list was the "why it works" pair, which the
 * engine allows once per session. MC-012's practice was one question — "Ebo has ₦389 and Ife has
 * ₦163. How much more does Ebo have?" — with names and numbers swapped, seven times. The engine now
 * caps a question SKELETON (mlb_item_skeleton) at two per session, so those topics gave SHORT
 * sessions. The fix is content: every topic here now has at least five skill forms, five different
 * skeletons and at least two typed ones.
 *
 * HOW THE FORMS ARE DESIGNED, and the evidence behind each choice:
 *   · VARY THE SHAPE OF THE TASK, not just its numbers. Varied practice transfers to new problems;
 *     repeating one surface does not (Schmidt & Bjork 1992; Paas & van Merriënboer 1994). So each
 *     topic mixes compute, missing number (□ + 7 = 12), compare, word problem, spot the error,
 *     choose the operation, estimate / is it reasonable, and number-line or picture reading.
 *   · CONCRETE → PICTURE → SYMBOL (the CRA sequence; Bruner 1966; Witzel, Mercer & Miller 2003).
 *     Where a topic is about quantity, a form shows it (dots, groups, arrays, number lines, place-value
 *     blocks, fraction bars — only the diagram kinds MlbDiagram in mlb-app.jsx already draws).
 *   · WRONG OPTIONS ARE REAL MISCONCEPTIONS, so a wrong choice tells the learner what went wrong:
 *     counting the starting number when counting on or back, subtracting the smaller digit from the
 *     larger, forgetting the carry, "longer decimals are bigger", "a bigger denominator is a bigger
 *     fraction", adding the same number to top and bottom, a percentage of the wrong base, a remainder
 *     bigger than the divisor (Ashlock, Error Patterns in Computation; Ryan & Williams 2007).
 *   · WORKED EXAMPLES AND COMPLETION PROBLEMS. "Spot the error" and "what went wrong?" items hand the
 *     learner a worked line to check, which beats solving alone early in learning (Renkl 2014;
 *     Sweller & Cooper 1985; Große & Renkl 2007 on learning from errors).
 *   · CHOOSING THE METHOD is a skill exams test first, and blocked practice hides it (Rohrer et al.
 *     2019), so several forms ask which operation or which calculation fits a story.
 *   · CONTEXTS AND NAMES COME FROM POOLS (naira, the market, a danfo, school), so even one form's
 *     wording changes from question to question. Short sentences: Stages 1–2 are 8–10-year-olds.
 *
 * APPEND ONLY. mlb_maths_forms() appends these after each topic's existing list (its own forms, the
 * proof pair, the exam forms). A session stores form NUMBERS, so nothing here may ever be reordered or
 * removed — add new forms at the END of a topic's list. Topics MC-041 onward are in
 * mathslab-gen-variety2.php.
 */

const MLB_EARLY_THINGS = ['pencils', 'marbles', 'bottle tops', 'sweets', 'crayons', 'stickers', 'exercise books', 'groundnuts'];
const MLB_EARLY_FRUIT = ['mangoes', 'oranges', 'tomatoes', 'guavas', 'pawpaws', 'bananas', 'yams'];
const MLB_EARLY_MARKETS = ['Bodija', 'Oshodi', 'Balogun', 'Kurmi', 'Ariaria', 'Wuse', 'Oja-Oba', 'Ogbete'];

/** $k different names from the pool. */
function mlb_early_names(MlbRng $r, int $k): array { return array_slice($r->shuffle(MLB_NAMES), 0, $k); }

/**
 * A multiple choice whose options are numbers: printed with thousands grouped, a wrong option equal to
 * the right one (or to another) dropped, and topped up to four options from the near neighbours if a
 * coincidence of numbers left too few. Negative numbers are printed in maths ($-4$).
 */
function mlb_early_num_mcq(MlbRng $r, string $stem, $right, array $wrong, array $steps, string $hint, string $dim, int $secs, array $x = []): array {
    $fmt = static fn($v) => (is_int($v) || is_float($v)) ? ($v < 0 ? '$' . mlb_p($v) . '$' : mlb_p($v)) : (string)$v;
    $R = $fmt($right); $seen = [$R => true]; $w = [];
    foreach ($wrong as [$v, $why]) { $t = $fmt($v); if (isset($seen[$t])) continue; $seen[$t] = true; $w[] = [$t, $why]; }
    if (is_int($right)) foreach ([1, -1, 10, -10, 2, 100] as $d) {
        if (count($w) >= 3) break;
        $t = $fmt($right + $d); if (isset($seen[$t]) || ($right >= 0 && $right + $d < 0)) continue;
        $seen[$t] = true; $w[] = [$t, 'Check your working again: this is ' . ($d > 0 ? 'too big' : 'too small') . '.'];
    }
    return mlb_mcq($r, $stem, $R, $w, $steps, $hint, $dim, $secs, $x);
}

/** A digit-by-digit "sum" with no carrying — the misconception behind a forgotten carry. */
function mlb_early_nocarry(int $a, int $b): int {
    $out = 0; $p = 1;
    while ($a > 0 || $b > 0) { $out += (($a % 10 + $b % 10) % 10) * $p; $a = intdiv($a, 10); $b = intdiv($b, 10); $p *= 10; }
    return $out;
}

/** The Maths Lab's extra forms for MC-001 … MC-040: competency id → forms to append. */
function mlb_forms_variety(): array {
    static $f = null;
    if ($f !== null) return $f;
    $f = [];
    foreach (['mlb_early_stage1', 'mlb_early_stage2', 'mlb_early_stage3', 'mlb_early_stage4'] as $fn) if (function_exists($fn)) $f += $fn();
    return $f;
}

/* ═══ Stage 1 — Number Consciousness ═══ */
function mlb_early_stage1(): array { return [
    'MC-001' => [
        static function (MlbRng $r) { $n = $r->int(5, 13); $m = $n + $r->int(2, 6);
            return mlb_typed('num', 'Count the stars. How many more stars are needed to make ' . $m . '?', (string)($m - $n),
                ['Count the stars, touching each one once: there are ' . $n . '.', 'Count on from ' . $n . ' to ' . $m . ': that is ' . ($m - $n) . ' more.'],
                'Count the stars first. Then count on to ' . $m . ' on your fingers.', 'procedure', 30, ['diagram' => ['type' => 'dots', 'n' => $n, 'seed' => $r->int(1, 9999)]]); },
        static function (MlbRng $r) { $n = $r->int(6, 15); $more = $r->int(0, 1) === 1;
            return mlb_typed('num', 'Count the stars. How many would there be with one ' . ($more ? 'more star' : 'star fewer') . '?', (string)($more ? $n + 1 : $n - 1),
                ['There are ' . $n . ' stars.', ($more ? 'One more than ' . $n . ' is the next number you say: ' . ($n + 1) . '.' : 'One fewer than ' . $n . ' is the number just before it: ' . ($n - 1) . '.')],
                'Count them all first, then think of the number just ' . ($more ? 'after' : 'before') . '.', 'concept', 30, ['diagram' => ['type' => 'dots', 'n' => $n, 'seed' => $r->int(1, 9999)]]); },
        static function (MlbRng $r) { $n = $r->int(7, 16); [$who] = mlb_early_names($r, 1); $what = $r->pick(MLB_EARLY_FRUIT);
            return mlb_early_num_mcq($r, $who . ' counts ' . $n . ' ' . $what . ' in a row, from left to right. Then ' . $who . ' counts them again from right to left. What number will ' . $who . ' get this time?', $n,
                [[$n - 1, 'Counting from the other end does not lose one — each one still gets one number.'], [$n + 1, 'Nothing was added. Each one still gets exactly one number.'],
                 ['It depends on which end you start', 'The order you count in never changes how many there are.']],
                ['Every object gets exactly one number, whichever end you start from.', 'So the count is ' . $n . ' again.'],
                'Does turning round change how many there are?', 'concept', 25); },
        static function (MlbRng $r) { $c = $r->int(6, 12); $k = $r->int(max(2, $c - 6), $c - 1); $sit = $r->pick([['children', 'chairs', 'chair'], ['learners', 'desks', 'desk'], ['players', 'jerseys', 'jersey']]);
            return mlb_early_num_mcq($r, 'There are ' . $c . ' ' . $sit[0] . ' and ' . $k . ' ' . $sit[1] . '. Each one needs a ' . $sit[2] . '. How many more ' . $sit[1] . ' are needed?', $c - $k,
                [[$c + $k, 'Adding counts the ' . $sit[0] . ' and the ' . $sit[1] . ' together. Match them one to one instead.'], [$c, 'That is all the ' . $sit[0] . ' — ' . $k . ' of them already have a ' . $sit[2] . '.'],
                 [$k, 'That is how many ' . $sit[1] . ' there are already.']],
                ['Match each ' . $sit[2] . ' to one of the ' . $sit[0] . ': ' . $k . ' are matched.', 'The ' . ($c - $k) . ' left over still need one each: $' . $c . ' - ' . $k . ' = ' . ($c - $k) . '$.'],
                'Pair them up one to one. Who is left without one?', 'application', 30); },
    ],
    'MC-002' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); $c = $a + $b; [$who] = mlb_early_names($r, 1); $what = $r->pick(MLB_EARLY_THINGS);
            $stem = $r->int(0, 1) === 0 ? 'What number goes in the box? $' . $a . ' + \\square = ' . $c . '$'
                : $who . ' has ' . $a . ' ' . $what . '. A friend gives ' . $who . ' some more. Now ' . $who . ' has ' . $c . '. How many did the friend give?';
            return mlb_typed('num', $stem, (string)$b,
                ['Start at ' . $a . ' and count on until you reach ' . $c . '.', 'That is ' . $b . ' steps, because $' . $a . ' + ' . $b . ' = ' . $c . '$.'],
                'Count on from ' . $a . ' to ' . $c . '. How many numbers did you say?', 'procedure', 25); },
        static function (MlbRng $r) { $x = $r->int(3, 9); do { $y = $r->int(2, 9); } while ($y === $x);
            $ctx = $r->pick([['boys', 'girls', 'are playing football', 'children'], ['red cars', 'blue cars', 'are parked outside', 'cars'], ['goats', 'sheep', 'are in the field', 'animals'], ['hens', 'ducks', 'are in the yard', 'birds']]);
            $s = $x + $y; $big = max($x, $y); $small = min($x, $y);
            return mlb_mcq($r, $x . ' ' . $ctx[0] . ' and ' . $y . ' ' . $ctx[1] . ' ' . $ctx[2] . '. Which number sentence gives how many ' . $ctx[3] . ' there are?', '$' . $x . ' + ' . $y . ' = ' . $s . '$',
                [['$' . $big . ' - ' . $small . ' = ' . ($big - $small) . '$', 'Taking away finds a difference, not how many there are altogether.'],
                 ['$' . $x . ' \\times ' . $y . ' = ' . ($x * $y) . '$', 'Multiplying is for equal groups. Here two groups are put together.'],
                 ['$' . $x . ' + ' . $y . ' = ' . ($s + 1) . '$', 'Adding is right, but check the total: count on ' . $y . ' from ' . $x . '.']],
                ['Two groups are put together, so add.', '$' . $x . ' + ' . $y . ' = ' . $s . '$ ' . $ctx[3] . '.'],
                'Are the groups being put together, or is one taken away?', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(4, 9); $b = $r->int(3, 5); [$who] = mlb_early_names($r, 1);
            $said = implode(', ', range($a, $a + $b - 1));
            return mlb_mcq($r, $who . ' works out $' . $a . ' + ' . $b . '$ by counting on. ' . $who . ' says “' . $said . '” and answers ' . ($a + $b - 1) . '. What went wrong?',
                $who . ' counted ' . $a . ' as the first step. Counting on starts at ' . ($a + 1) . '.',
                [['Nothing — ' . ($a + $b - 1) . ' is right', 'Check: $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.'],
                 [$who . ' should have counted on ' . $a . ' from ' . $b, 'Counting on from either number gives the same total. That is not the mistake.'],
                 [$who . ' counted one step too many', 'The answer is one too SMALL, so a step was lost, not added.']],
                ['Counting on ' . $b . ' from ' . $a . ' means saying the NEXT ' . $b . ' numbers: ' . implode(', ', range($a + 1, $a + $b)) . '.', 'So $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$. Saying ' . $a . ' first made the answer one too small.'],
                'Say the numbers yourself. Which number should you say first?', 'reasoning', 40); },
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(2, min(9, 14 - $a)); $same = $r->int(0, 2) === 0;   // 5 ≤ a + b ≤ 14, so an equal pair always exists
            if ($same) { do { $c = $r->int(1, 9); $d = $a + $b - $c; } while ($d < 1 || $d > 9 || $c === $a || $c === $b); }
            else { do { $c = $r->int(1, 9); $d = $r->int(1, 9); } while ($c + $d === $a + $b || $c === $a); }
            $L = '$' . $a . ' + ' . $b . '$'; $R = '$' . $c . ' + ' . $d . '$'; $s1 = $a + $b; $s2 = $c + $d;
            $right = $s1 === $s2 ? 'They are the same' : ($s1 > $s2 ? $L : $R);
            $why = 'Work out each one: $' . $a . ' + ' . $b . ' = ' . $s1 . '$ and $' . $c . ' + ' . $d . ' = ' . $s2 . '$.';
            $wrong = []; foreach ([$L, $R, 'They are the same'] as $o) if ($o !== $right) $wrong[] = [$o, $why];
            return mlb_mcq($r, 'Which is more: $' . $a . ' + ' . $b . '$ or $' . $c . ' + ' . $d . '$?', $right, $wrong,
                [$why, $s1 === $s2 ? 'Both are ' . $s1 . ', so they are the same.' : ($s1 > $s2 ? $s1 . ' is more than ' . $s2 . '.' : $s2 . ' is more than ' . $s1 . '.')],
                'Find each total first, then compare.', 'concept', 30); },
    ],
    'MC-003' => [
        static function (MlbRng $r) { $m = $r->int(12, 95); $v = $r->int(0, 2);
            [$tex, $key, $why] = [['\\square + 0 = ' . $m, $m, 'Adding 0 changes nothing, so the box must already be ' . $m . '.'],
                [$m . ' - \\square = ' . $m, 0, 'Nothing changed, so nothing was taken away: the box is 0.'],
                ['0 + \\square = ' . $m, $m, 'Starting from 0 and adding a number gives that number: ' . $m . '.']][$v];
            return mlb_typed('num', 'What number goes in the box? $' . $tex . '$', (string)$key, [$why, 'Check: put ' . $key . ' in the box and work it out.'],
                'What does adding or taking away 0 do to a number?', 'concept', 20); },
        static function (MlbRng $r) { $m = $r->int(6, 60);
            return mlb_mcq($r, 'Which of these works out to nothing at all (0)?', '$' . $m . ' - ' . $m . '$',
                [['$' . $m . ' + 0$', 'Adding 0 changes nothing: it is still ' . $m . '.'], ['$' . $m . ' - 0$', 'Taking away nothing leaves all ' . $m . '.'], ['$0 + ' . $m . '$', 'Start at 0 and add ' . $m . ': that is ' . $m . '.']],
                ['Taking a number away from itself leaves nothing.', '$' . $m . ' - ' . $m . ' = 0$.'],
                'Which one takes away everything?', 'concept', 25); },
        static function (MlbRng $r) { $n = $r->int(8, 18); $k = $r->int(2, 9);
            [$stem, $s1] = $r->pick([
                ['A danfo has ' . $n . ' passengers. At the first stop, 0 people get off and ' . $k . ' get on. How many passengers are on the danfo now?', 'Nobody got off'],
                ['A class has ' . $n . ' learners. At break, 0 learners go home and ' . $k . ' new learners join. How many learners are in the class now?', 'Nobody went home'],
                ['A basket has ' . $n . ' eggs. 0 eggs break, and Mama adds ' . $k . ' more. How many eggs are in the basket now?', 'No egg broke']]);
            return mlb_typed('num', $stem, (string)($n + $k),
                [$s1 . ': taking away 0 leaves ' . $n . '.', 'Then $' . $n . ' + ' . $k . ' = ' . ($n + $k) . '$.'],
                'What does taking away 0 do?', 'application', 30); },
        static function (MlbRng $r) { $h = $r->int(1, 9); $d = $r->int(1, 9); $tensZero = $r->int(0, 1) === 1;
            $n = $tensZero ? $h * 100 + $d : $h * 100 + $d * 10; $without = (int)($h . $d);
            $places = $tensZero ? 'tens' : 'ones'; $other = $tensZero ? 'ones' : 'tens';
            return mlb_mcq($r, 'In the number ' . $n . ', what does the 0 tell you?', 'There are no ' . $places,
                [['Nothing — the number is the same without it', 'Without the 0 it would be ' . $without . ', a different number. The 0 holds a place.'],
                 ['There are no hundreds', 'The first digit, ' . $h . ', is the hundreds: there are ' . $h . ' hundreds.'],
                 ['There are no ' . $other, 'The 0 is in the ' . $places . ' place, not the ' . $other . ' place.']],
                ['Read the places: hundreds, tens, ones.', 'The 0 is in the ' . $places . ' place, so there are no ' . $places . '. It keeps the ' . $h . ' in the hundreds place.'],
                'Write ' . $n . ' in a place-value table.', 'concept', 30); },
    ],
    'MC-004' => [
        static function (MlbRng $r) { $th = $r->int(1, 9); $zp = $r->int(1, 3); $dg = [$th, $r->int(1, 9), $r->int(1, 9), $r->int(1, 9)]; $dg[$zp] = 0;
            $n = (int)implode('', $dg); $alt = [];
            foreach ([1, 2, 3] as $p) if ($p !== $zp) { $s = $dg; [$s[$p], $s[$zp]] = [$s[$zp], $s[$p]]; $v = (int)implode('', $s); if ($v !== $n) $alt[] = [mlb_words($v), 'The 0 is in the wrong place here — that is ' . mlb_p($v) . '.']; }
            $drop = $dg; unset($drop[$zp]); $dv = (int)implode('', $drop);
            $alt[] = [mlb_words($dv), 'That leaves the 0 out, so every digit slides into the wrong place: it is ' . mlb_p($dv) . '.'];
            return mlb_mcq($r, 'How do we write ' . mlb_p($n) . ' in words?', mlb_words($n), $alt,
                ['Read each place: ' . $dg[0] . ' thousands, ' . $dg[1] . ' hundreds, ' . $dg[2] . ' tens, ' . $dg[3] . ' ones.', 'A place with 0 is not said. So ' . mlb_p($n) . ' is “' . mlb_words($n) . '”.'],
                'Which place has the 0?', 'concept', 35); },
        static function (MlbRng $r) { $n = $r->pick([1000 * $r->int(1, 9) + $r->int(1, 9), 1000 * $r->int(1, 9) + 10 * $r->int(1, 9), 1000 * $r->int(1, 9) + 100 * $r->int(1, 9) + $r->int(1, 9), 100 * $r->int(1, 9) + $r->int(1, 9)]);
            [$who] = mlb_early_names($r, 1); $w = mlb_words($n);
            $stem = $r->pick(['A school has “' . $w . '” learners. Write this number in figures.', $who . ' writes a cheque for “' . $w . '” naira. Write the amount in figures.',
                'The football stadium has “' . $w . '” seats. Write this number in figures.', 'A farmer harvests “' . $w . '” yams. Write this number in figures.']);
            return mlb_typed('num', $stem, (string)$n,
                ['Write each part in its place: ' . $w . '.', 'Put a 0 in any place with nothing in it: ' . mlb_p($n) . '.'],
                'Thousands, hundreds, tens, ones: which places are empty?', 'application', 30); },
        static function (MlbRng $r) { $th = $r->int(2, 9); $t = $r->int(1, 9); $n = $th * 1000 + $t * 10; $bad = $th * 1000 + $t * 100; [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' writes “' . mlb_words($n) . '” in figures as ' . mlb_p($bad) . '. What went wrong?',
                'The ' . $t . ' belongs in the tens place. It should be ' . mlb_p($n) . '.',
                [['Nothing — ' . mlb_p($bad) . ' is right', mlb_p($bad) . ' is “' . mlb_words($bad) . '”.'],
                 ['It should be ' . mlb_p($th * 100 + $t * 10), 'That has no thousands at all.'],
                 ['It should be ' . mlb_p($th * 10000 + $t * 10), 'That has too many digits — it is more than ten thousand.']],
                ['“' . mlb_words($n) . '” is ' . $th . ' thousands, 0 hundreds, ' . $t . ' tens and 0 ones.', 'So it is ' . mlb_p($n) . '. ' . $who . ' put the ' . $t . ' in the hundreds place.'],
                'Say ' . mlb_p($bad) . ' out loud. Is it the same number?', 'reasoning', 40); },
        static function (MlbRng $r) { $vals = [];
            $vals[] = 100 * $r->int(7, 9) + 10 * $r->int(5, 9) + $r->int(0, 9);          // a big three-digit number
            $vals[] = 1000 + $r->int(1, 99);                                           // a small four-digit one
            while (count($vals) < 4) { $v = 1000 * $r->int(1, 3) + 100 * $r->int(0, 9) + $r->int(0, 99); if (!in_array($v, $vals, true)) $vals[] = $v; }
            $max = max($vals);
            return mlb_mcq($r, 'Which of these numbers is the largest?', mlb_words($max),
                array_map(static fn($v) => [mlb_words($v), 'Write it in figures: ' . mlb_p($v) . '. Compare from the left.'], array_values(array_filter($vals, static fn($v) => $v !== $max))),
                ['Write each in figures: ' . implode(', ', array_map('mlb_p', $vals)) . '.', 'More thousands means bigger. The largest is ' . mlb_p($max) . '.'],
                'Turn each name into figures first.', 'concept', 40); },
    ],
    'MC-005' => [
        static function (MlbRng $r) { $d = $r->pick([2, 3, 5, 10]); $s = $r->int(4, 40); $down = $r->int(0, 1) === 1; $gap = $r->int(1, 2);
            $seq = []; for ($i = 0; $i < 4; $i++) $seq[] = $down ? $s + (3 - $i) * $d : $s + $i * $d;
            $key = $seq[$gap]; $shown = $seq; $shown[$gap] = '\\square';
            return mlb_typed('num', 'Fill the gap: $' . implode(',\\ ', $shown) . '$', (string)$key,
                ['The numbers go ' . ($down ? 'down' : 'up') . ' by ' . $d . ' each time.', 'So the gap is $' . $seq[$gap - 1] . ($down ? ' - ' : ' + ') . $d . ' = ' . $key . '$.'],
                'Compare two numbers next to each other. How much does it change?', 'procedure', 25); },
        static function (MlbRng $r) { $n = $r->int(15, 45); $k = $r->int(3, 6); [$who] = mlb_early_names($r, 1);
            $said = implode(', ', range($n, $n - $k + 1));
            return mlb_mcq($r, $who . ' counts back ' . $k . ' from ' . $n . ' and says “' . $said . '”. ' . $who . ' answers ' . ($n - $k + 1) . '. What went wrong?',
                $who . ' counted ' . $n . ' as a step. Counting back ' . $k . ' from ' . $n . ' lands on ' . ($n - $k) . '.',
                [['Nothing — ' . ($n - $k + 1) . ' is right', 'Check: $' . $n . ' - ' . $k . ' = ' . ($n - $k) . '$.'],
                 [$who . ' should have counted up', '“Count back” means the numbers go down.'],
                 [$who . ' counted one step too many', 'The answer is one too BIG, so a step was missed, not added.']],
                ['The first step back from ' . $n . ' is ' . ($n - 1) . '.', 'The ' . $k . ' steps are ' . implode(', ', range($n - 1, $n - $k)) . ': you land on ' . ($n - $k) . '.'],
                'Count back yourself. Which number do you say first?', 'reasoning', 40); },
        static function (MlbRng $r) { $s = $r->int(10, 60); $i = $r->int(0, 4); $k = $r->int(3, 10 - $i);
            return mlb_typed('num', 'Start at the dot. Count on ' . $k . '. Which number do you land on?', (string)($s + $i + $k),
                ['The dot is on ' . ($s + $i) . '.', 'Count on ' . $k . ': $' . ($s + $i) . ' + ' . $k . ' = ' . ($s + $i + $k) . '$.'],
                'Read the number under the dot first. Do not count the dot itself.', 'procedure', 25,
                ['diagram' => ['type' => 'numberline', 'start' => $s, 'step' => 1, 'count' => 10, 'mark' => $i]]); },
        static function (MlbRng $r) { $a = $r->int(1, 9); $base = $r->pick([0, 100]); $j = $r->int(3, 8); $right = $base + $a + 10 * $j;
            $rev = (int)strrev((string)($a + 10 * $j));
            return mlb_early_num_mcq($r, 'Count in tens from ' . ($base + $a) . ': $' . ($base + $a) . ',\\ ' . ($base + $a + 10) . ',\\ ' . ($base + $a + 20) . ',\\ \\dots$ Which of these numbers will you say?', $right,
                [[$base + 10 * $j, 'Counting in tens from ' . ($base + $a) . ', every number ends in ' . $a . '.'],
                 [$base + $rev, 'The ones digit stays ' . $a . '. It is the tens digit that changes.'],
                 [$right + 1, 'Every number in this count ends in ' . $a . ', not ' . (($a + 1) % 10) . '.']],
                ['Adding 10 changes the tens digit and keeps the ones digit.', 'So every number ends in ' . $a . ': ' . mlb_p($right) . ' is in the count.'],
                'Which digit stays the same when you add 10?', 'concept', 30); },
    ],
    'MC-006' => [
        static function (MlbRng $r) { do { $a = $r->int(12, 98); $b = (int)strrev((string)$a); } while ($a % 10 === 0 || $a === $b);
            if ($r->int(0, 1)) { $a += 100 * $r->int(1, 8); $b += 100 * intdiv($a, 100); }
            $great = $r->int(0, 1) === 1; $key = $great ? max($a, $b) : min($a, $b);
            return mlb_typed('num', 'Which is ' . ($great ? 'greater' : 'smaller') . ', ' . $a . ' or ' . $b . '? Type that number.', (string)$key,
                ['Compare from the left: the first place where the digits differ decides.', $key . ' is the ' . ($great ? 'greater' : 'smaller') . ' number.'],
                'Line them up. Which place decides?', 'concept', 20); },
        static function (MlbRng $r) { [$p, $q] = mlb_early_names($r, 2); $what = $r->pick(MLB_EARLY_THINGS); $a = $r->int(21, 98); $eq = $r->int(0, 3) === 0;
            $b = $eq ? $a : ((int)strrev((string)$a) !== $a && $a % 10 !== 0 ? (int)strrev((string)$a) : $a + $r->pick([-9, -1, 1, 9]));
            $right = $a === $b ? $p . ' and ' . $q . ' have the same number' : ($a > $b ? $p . ' has more than ' . $q : $q . ' has more than ' . $p);
            $all = [$p . ' has more than ' . $q, $q . ' has more than ' . $p, $p . ' and ' . $q . ' have the same number'];
            return mlb_mcq($r, $p . ' has ' . $a . ' ' . $what . '. ' . $q . ' has ' . $b . ' ' . $what . '. Which sentence is true?', $right,
                array_map(static fn($o) => [$o, 'Compare ' . $a . ' and ' . $b . ': look at the tens first.'], array_values(array_filter($all, static fn($o) => $o !== $right))),
                ['Compare the tens digits first, then the ones.', $a === $b ? 'Both are ' . $a . '.' : max($a, $b) . ' is more than ' . min($a, $b) . '.'],
                'Which number is bigger, ' . $a . ' or ' . $b . '?', 'concept', 25); },
        static function (MlbRng $r) { $a = $r->int(10, 40); $b = $r->int(2, 20); $L = $a + $b; $kind = $r->int(0, 2);
            $R = $kind === 0 ? $L : ($kind === 1 ? $L + $r->int(1, 6) : $L - $r->int(1, 6)); $d = $r->int(3, 20); $c = $R + $d;
            $right = $L === $R ? 'equal to' : ($L > $R ? 'more than' : 'less than');
            $wrong = []; foreach (['more than', 'less than', 'equal to'] as $o) if ($o !== $right) $wrong[] = [$o, 'Work out both sides: $' . $a . ' + ' . $b . ' = ' . $L . '$ and $' . $c . ' - ' . $d . ' = ' . $R . '$.'];
            return mlb_mcq($r, 'Is $' . $a . ' + ' . $b . '$ more than, less than or equal to $' . $c . ' - ' . $d . '$?', $right, $wrong,
                ['Left side: $' . $a . ' + ' . $b . ' = ' . $L . '$. Right side: $' . $c . ' - ' . $d . ' = ' . $R . '$.', $L . ' is ' . $right . ' ' . $R . '.'],
                'Work out each side before you compare.', 'concept', 35); },
        static function (MlbRng $r) { $lo = $r->int(20, 80); $hi = $lo + $r->int(6, 15); $in = $r->int($lo + 1, $hi - 1);
            $w = [[$hi, $hi . ' is not LESS than ' . $hi . ' — it is equal.'], [$lo - $r->int(1, 5), 'That is less than ' . $lo . '.'], [$hi + $r->int(1, 9), 'That is more than ' . $hi . '.']];
            $rev = (int)strrev((string)$in); if ($in % 10 !== 0 && ($rev > $hi || $rev < $lo)) $w[] = [$rev, 'The digits are swapped: ' . $rev . ' is not between ' . $lo . ' and ' . $hi . '.'];
            return mlb_early_num_mcq($r, 'Which number is more than ' . $lo . ' but less than ' . $hi . '?', $in, $w,
                ['The number must come after ' . $lo . ' and before ' . $hi . '.', $in . ' does.'],
                'Picture ' . $lo . ' and ' . $hi . ' on a number line.', 'concept', 25); },
        static function (MlbRng $r) { do { $t = $r->int(2, 9); $o = $r->int(1, $t - 1); } while ($t === $o); $a = 10 * $t + $o; $b = 10 * $o + $t; [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' writes $' . $a . ' < ' . $b . '$ because ' . $o . ' is less than ' . $t . '. What is wrong?',
                $who . ' compared the ones digits. The tens decide: $' . $a . ' > ' . $b . '$.',
                [['Nothing — it is right', $a . ' has ' . $t . ' tens and ' . $b . ' has only ' . $o . ' tens.'],
                 ['It should be $' . $a . ' = ' . $b . '$, because they use the same digits', 'The same digits in different places make different numbers.'],
                 [$who . ' should have added the digits', 'Both digit sums are ' . ($t + $o) . '. Adding the digits does not compare numbers.']],
                ['Tens are worth more than ones, so compare the tens first.', $a . ' has ' . $t . ' tens, ' . $b . ' has ' . $o . ' tens, so $' . $a . ' > ' . $b . '$.'],
                'Which digit is worth more, the tens or the ones?', 'reasoning', 35); },
        static function (MlbRng $r) { do { $t = $r->int(2, 8); $o = $r->int(1, 9); } while ($t === $o); $x = 10 * $t + $o; $y = 10 * $o + $t; $z = 10 * $t + ($o === 9 ? $o - 2 : $o + 1);
            if ($z === $y) $z = 10 * ($t + 1) + $o;
            $three = $r->shuffle([$x, $y, $z]); $s = $three; sort($s);
            return mlb_typed('num', 'Put ' . implode(', ', $three) . ' in order from smallest to largest. Which number is in the middle?', (string)$s[1],
                ['Compare the tens first, then the ones.', 'In order: ' . implode(', ', $s) . '. The middle one is ' . $s[1] . '.'],
                'Find the smallest and the largest first.', 'concept', 30); },
    ],
    'MC-007' => [
        static function (MlbRng $r) { $vals = [100 * $r->int(6, 9) + $r->int(10, 99), 1000 + 100 * $r->int(0, 4) + $r->int(0, 99)];
            while (count($vals) < 4) { $v = $r->pick([100 * $r->int(1, 9) + $r->int(0, 99), 1000 * $r->int(1, 3) + $r->int(0, 999)]); if (!in_array($v, $vals, true)) $vals[] = $v; }
            $asc = $vals; sort($asc); $lex = $vals; sort($lex, SORT_STRING); $desc = array_reverse($asc);
            $ones = $vals; usort($ones, static fn($x, $y) => ($x % 10 <=> $y % 10) ?: ($x <=> $y));
            $fmt = static fn($a) => implode(', ', array_map('mlb_p', $a));
            return mlb_mcq($r, 'Which list is in order from smallest to largest?', $fmt($asc),
                [[$fmt($lex), 'This orders by the first digit only. A four-digit number is bigger than any three-digit one.'],
                 [$fmt($desc), 'This goes from largest to smallest — the wrong way round.'],
                 [$fmt($ones), 'This orders by the last digit. The ones digit matters least.']],
                ['First sort by how many digits: three-digit numbers are smaller than four-digit ones.', 'Then compare from the left: ' . $fmt($asc) . '.'],
                'Count the digits in each number first.', 'concept', 40); },
        static function (MlbRng $r) { $d = array_slice($r->shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]), 0, 4); $big = $r->int(0, 1) === 1;
            $s = $d; $big ? rsort($s) : sort($s); $key = (int)implode('', $s);
            return mlb_typed('num', 'Use each of the digits ' . implode(', ', $d) . ' once. What is the ' . ($big ? 'largest' : 'smallest') . ' number you can make?', (string)$key,
                ['The thousands place is worth the most, so it gets the ' . ($big ? 'biggest' : 'smallest') . ' digit.', 'Then the next ' . ($big ? 'biggest' : 'smallest') . ', and so on: ' . mlb_p($key) . '.'],
                'Which place is worth the most?', 'procedure', 35); },
        static function (MlbRng $r) { $mk = array_slice($r->shuffle(MLB_EARLY_MARKETS), 0, 4); $what = $r->pick(['yams', 'baskets of tomatoes', 'bags of rice']);
            $vals = [100 * $r->int(8, 9) + $r->int(10, 99)]; while (count($vals) < 4) { $v = 1000 + 100 * $r->int(0, 5) + $r->int(0, 99); if (!in_array($v, $vals, true)) $vals[] = $v; }
            $vals = $r->shuffle($vals); $most = $r->int(0, 1) === 1; $key = $most ? max($vals) : min($vals);
            $list = implode('; ', array_map(static fn($m, $v) => $m . ' ' . mlb_p($v), $mk, $vals));
            return mlb_typed('num', 'Four markets sold these numbers of ' . $what . ' last week: ' . $list . '. What is the ' . ($most ? 'largest' : 'smallest') . ' number sold?', (string)$key,
                ['Compare the numbers: the three-digit one is smaller than all the four-digit ones.', 'The ' . ($most ? 'largest' : 'smallest') . ' is ' . mlb_p($key) . '.'],
                'Count the digits first, then compare from the left.', 'application', 40); },
        static function (MlbRng $r) { $a = 900 + $r->int(50, 99); $b = 1000 + $r->int(1, 99); [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' says ' . $a . ' is bigger than ' . mlb_p($b) . ' because 9 is bigger than 1. Is ' . $who . ' right?',
                'No — ' . mlb_p($b) . ' has more digits, so it is bigger',
                [['Yes — the first digit always decides', 'The first digit decides only when the numbers have the same number of digits.'],
                 ['Yes — ' . $a . ' has more 9s', 'Counting 9s does not compare numbers.'],
                 ['No — they are equal', 'They are different numbers.']],
                [mlb_p($b) . ' has 1 thousand. ' . $a . ' has no thousands.', 'So ' . mlb_p($b) . ' is bigger, even though its first digit is smaller.'],
                'How many digits does each number have?', 'reasoning', 35); },
    ],
    'MC-008' => [
        static function (MlbRng $r) { $step = $r->pick([2, 10, 20]); $a = $step * $r->int(1, 20); $b = $a + $step * $r->int(2, 6) * 1; if ((($b - $a) / 2) != intdiv($b - $a, 2)) $b += $step;
            $mid = intdiv($a + $b, 2);
            return mlb_typed('num', 'What number is exactly halfway between ' . $a . ' and ' . $b . '?', (string)$mid,
                ['The gap from ' . $a . ' to ' . $b . ' is ' . ($b - $a) . '.', 'Half of that is ' . intdiv($b - $a, 2) . ', and $' . $a . ' + ' . intdiv($b - $a, 2) . ' = ' . $mid . '$.'],
                'Find the gap, then go half of it from ' . $a . '.', 'procedure', 30); },
        static function (MlbRng $r) { [$who] = mlb_early_names($r, 1); $s = $r->int(10, 60); $j = $r->int(2, 5); $d = $r->pick([2, 3, 5, 10]); $right = $r->int(0, 2) > 0;
            $end = $right ? $s + $j * $d : $s - $j * $d;
            return mlb_typed('num', 'On a number line, ' . $who . ' starts at ' . $s . ' and makes ' . $j . ' jumps of ' . $d . ' to the ' . ($right ? 'right' : 'left') . '. Where does ' . $who . ' land?', (string)$end,
                [$j . ' jumps of ' . $d . ' is ' . ($j * $d) . ' altogether.', ($right ? 'To the right is adding: $' . $s . ' + ' . ($j * $d) : 'To the left is taking away: $' . $s . ' - ' . ($j * $d)) . ' = ' . $end . '$.'],
                'Which way is bigger on a number line?', 'procedure', 30); },
        static function (MlbRng $r) { $step = $r->pick([2, 5, 10]); $start = $step * $r->int(0, 6); $t = $r->int(2, 8); $key = $start + $t * $step;
            return mlb_early_num_mcq($r, 'Which number does the arrow show?', $key,
                [[$start + $t, 'Each mark is worth ' . $step . ', not 1.'], [$start + ($t + 1) * $step, 'The first mark is ' . $start . ' itself — do not count it as a step.'],
                 [$start + (10 - $t) * $step, 'That counts the marks from the right-hand end.']],
                ['The line goes from ' . $start . ' to ' . ($start + 10 * $step) . ' in 10 equal steps, so each mark is ' . $step . '.', 'The arrow is ' . $t . ' marks along: $' . $start . ' + ' . $t . ' \\times ' . $step . ' = ' . $key . '$.'],
                'How much is one mark worth?', 'procedure', 35, ['diagram' => ['type' => 'numberline', 'start' => $start, 'step' => $step, 'count' => 10, 'arrow' => $t, 'labels' => [0, 10]]]); },
        static function (MlbRng $r) { $T = 10 * $r->int(3, 9); $d1 = $r->int(1, 9); $d2 = $r->int(0, 3) === 0 ? $d1 : $r->int(1, 9); if ($d1 !== $d2 && $d1 === $d2) $d2++;
            $x = $T - $d1; $y = $T + $d2; $right = $d1 === $d2 ? 'They are the same distance from ' . $T : (string)($d1 < $d2 ? $x : $y);
            $all = [(string)$x, (string)$y, 'They are the same distance from ' . $T];
            return mlb_mcq($r, 'Which number is closer to ' . $T . ': ' . $x . ' or ' . $y . '?', $right,
                array_map(static fn($o) => [$o, $x . ' is ' . $d1 . ' away from ' . $T . ' and ' . $y . ' is ' . $d2 . ' away.'], array_values(array_filter($all, static fn($o) => $o !== $right))),
                [$x . ' is ' . $d1 . ' below ' . $T . '. ' . $y . ' is ' . $d2 . ' above it.', $d1 === $d2 ? 'Both are ' . $d1 . ' away.' : ($d1 < $d2 ? $x : $y) . ' is closer.'],
                'Count the steps from each number to ' . $T . '.', 'concept', 30); },
    ],
    'MC-009' => [
        static function (MlbRng $r) { $d = $r->int(2, 9); $p = $r->int(1, 2); $others = array_values(array_diff($r->shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]), [$d]));
            $make = static function (int $place) use ($d, $others): int { $dg = array_slice($others, $place, 3); array_splice($dg, 2 - $place, 0, [$d]); return (int)implode('', $dg); };
            $names = ['ones', 'tens', 'hundreds', 'thousands'];
            $wrong = []; foreach ([0, 1, 2, 3] as $q) if ($q !== $p) { $v = $make($q); $wrong[] = [mlb_p($v), 'Here the ' . $d . ' is in the ' . $names[$q] . ' place, worth ' . mlb_p($d * 10 ** $q) . '.']; }
            return mlb_mcq($r, 'In which number does the ' . $d . ' stand for ' . mlb_p($d * 10 ** $p) . '?', mlb_p($make($p)), $wrong,
                [mlb_p($d * 10 ** $p) . ' is ' . $d . ' ' . $names[$p] . '.', 'So the ' . $d . ' must be in the ' . $names[$p] . ' place: ' . mlb_p($make($p)) . '.'],
                'Which place is ' . mlb_p($d * 10 ** $p) . '?', 'concept', 30); },
        static function (MlbRng $r) { $op = $r->int(0, 3); $th = $r->int(1, 9); $h = $r->int(0, 9); $t = $r->int(0, 9); $o = $r->int(0, 9);
            [$h, $t] = [[$h, 9], [$h, 0], [9, $t], [0, $t]][$op]; $n = $th * 1000 + $h * 100 + $t * 10 + $o;
            [$word, $delta] = [['10 more', 10], ['10 less', -10], ['100 more', 100], ['100 less', -100]][$op];
            return mlb_typed('num', 'What number is ' . $word . ' than ' . mlb_p($n) . '?', (string)($n + $delta),
                [($delta > 0 ? 'Adding ' : 'Taking away ') . abs($delta) . ' changes the ' . (abs($delta) === 10 ? 'tens' : 'hundreds') . ' digit.',
                 'Here that digit is ' . (abs($delta) === 10 ? $t : $h) . ', so the next place changes too: ' . mlb_p($n + $delta) . '.'],
                'Which digit changes? What happens when it passes 9 or 0?', 'procedure', 30); },
        static function (MlbRng $r) { $h = $r->int(2, 8); $t = $r->int(11, 19); $o = $r->int(0, 9); $n = 100 * $h + 10 * $t + $o; [$who] = mlb_early_names($r, 1);
            return mlb_typed('num', $who . ' makes a number with ' . $h . ' hundreds, ' . $t . ' tens and ' . $o . ' ones. What is the number?', (string)$n,
                [$t . ' tens is ' . ($t * 10) . ', which is 1 hundred and ' . ($t - 10) . ' tens.', 'So it is ' . ($h + 1) . ' hundreds, ' . ($t - 10) . ' tens and ' . $o . ' ones: ' . $n . '.'],
                $t . ' tens is more than 9 tens. Exchange 10 tens for 1 hundred.', 'concept', 40); },
        static function (MlbRng $r) { $h = $r->int(1, 9); $x = $r->int(1, 9); $onesGap = $r->int(0, 1) === 1;
            if ($onesGap) { $right = $h * 100 + $x; $desc = $h . ' hundreds and ' . $x . ' ones';
                $w = [[(string)($h * 10 + $x), 'There are no hundreds there — the 0 for the tens is missing.'], [mlb_p($h * 1000 + $x), 'Too many zeros: that is ' . $h . ' thousands.'], [(string)($h * 100 + $x * 10), 'The ' . $x . ' is in the tens place there, not the ones.']]; }
            else { $right = $h * 100 + $x * 10; $desc = $h . ' hundreds and ' . $x . ' tens';
                $w = [[(string)($h * 10 + $x), 'There are no hundreds there — the 0 for the ones is missing.'], [(string)($h * 100 + $x), 'The ' . $x . ' is in the ones place there, not the tens.'], [mlb_p($h * 1000 + $x * 10), 'Too many digits: that is ' . $h . ' thousands.']]; }
            return mlb_mcq($r, 'Which number is the same as ' . $desc . '?', (string)$right, $w,
                ['Put each digit in its place, and a 0 in the empty place.', $desc . ' is ' . $right . '.'],
                'Draw hundreds, tens and ones columns.', 'concept', 25); },
    ],
    'MC-010' => [
        static function (MlbRng $r) { $th = $r->int(1, 9); $h = $r->int(1, 9); $t = $r->int(1, 9); $o = $r->int(1, 9); $n = 1000 * $th + 100 * $h + 10 * $t + $o;
            $parts = [mlb_n(1000 * $th), (string)(100 * $h), (string)(10 * $t), (string)$o]; $vals = [1000 * $th, 100 * $h, 10 * $t, $o];
            $hide = $r->int(0, 3); $key = $vals[$hide]; $parts[$hide] = '\\square';
            return mlb_typed('num', 'Complete: $' . implode(' + ', $parts) . ' = ' . mlb_n($n) . '$', (string)$key,
                ['Split ' . mlb_p($n) . ' into its places: $' . mlb_n(1000 * $th) . ' + ' . (100 * $h) . ' + ' . (10 * $t) . ' + ' . $o . '$.', 'The box is the missing place: ' . mlb_p($key) . '.'],
                'Which place is missing? What is that digit worth?', 'procedure', 30); },
        static function (MlbRng $r) { $t = $r->int(3, 8); $o = $r->int(2, 9); $n = 10 * $t + $o;
            return mlb_mcq($r, 'Which of these is NOT a way of making ' . $n . '?', '$' . $t . ' + ' . $o . '$',
                [['$' . (10 * $t) . ' + ' . $o . '$', 'This IS a way: $' . (10 * $t) . ' + ' . $o . ' = ' . $n . '$.'],
                 ['$' . (10 * ($t - 1)) . ' + ' . (10 + $o) . '$', 'This IS a way: $' . (10 * ($t - 1)) . ' + ' . (10 + $o) . ' = ' . $n . '$.'],
                 ['$' . (10 * ($t - 2)) . ' + ' . (20 + $o) . '$', 'This IS a way: $' . (10 * ($t - 2)) . ' + ' . (20 + $o) . ' = ' . $n . '$.']],
                ['The ' . $t . ' in ' . $n . ' is ' . $t . ' tens, worth ' . (10 * $t) . '.', '$' . $t . ' + ' . $o . ' = ' . ($t + $o) . '$, not ' . $n . '. Every other choice adds up to ' . $n . '.'],
                'Work out each one. Which does not make ' . $n . '?', 'concept', 35); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); $c = $r->int(2, 9); $amt = 1000 * $a + 100 * $b + 10 * $c; [$who] = mlb_early_names($r, 1); $ask = $r->int(0, 2);
            $notes = [[$a, '₦1,000 notes'], [$b, '₦100 notes'], [$c, '₦10 coins']]; $given = [];
            foreach ($notes as $i => [$k, $nm]) if ($i !== $ask) $given[] = $k . ' ' . $nm;
            return mlb_typed('num', $who . ' pays exactly ₦' . mlb_p($amt) . ' using ₦1,000 notes, ₦100 notes and ₦10 coins. ' . $who . ' uses ' . implode(' and ', $given) . '. How many ' . $notes[$ask][1] . ' does ' . $who . ' use?', (string)$notes[$ask][0],
                ['₦' . mlb_p($amt) . ' = ' . mlb_p(1000 * $a) . ' + ' . (100 * $b) . ' + ' . (10 * $c) . '.', 'That is ' . $a . ' ₦1,000 notes, ' . $b . ' ₦100 notes and ' . $c . ' ₦10 coins.'],
                'Split the amount into thousands, hundreds and tens.', 'application', 40); },
        static function (MlbRng $r) { $th = $r->int(2, 9); $t = $r->int(1, 9); $o = $r->int(1, 9); $n = 1000 * $th + 10 * $t + $o; [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' writes ' . mlb_p($n) . ' as $' . mlb_n(1000 * $th) . ' + ' . (100 * $t) . ' + ' . $o . '$. What went wrong?',
                'The ' . $t . ' is ' . $t . ' tens: ' . mlb_p($n) . ' $= ' . mlb_n(1000 * $th) . ' + ' . (10 * $t) . ' + ' . $o . '$',
                [['Nothing — it is right', 'Add it up: $' . mlb_n(1000 * $th) . ' + ' . (100 * $t) . ' + ' . $o . ' = ' . mlb_n(1000 * $th + 100 * $t + $o) . '$, not ' . mlb_p($n) . '.'],
                 ['It should be $' . $th . ' + ' . $t . ' + ' . $o . '$', 'The ' . $th . ' is ' . $th . ' thousands, not ' . $th . ' ones.'],
                 ['It should be $' . mlb_n(1000 * $th) . ' + ' . (100 * $t) . ' + ' . (10 * $o) . '$', 'That moves the ' . $o . ' as well. The ' . $o . ' is in the ones place.']],
                [mlb_p($n) . ' has ' . $th . ' thousands, 0 hundreds, ' . $t . ' tens and ' . $o . ' ones.', 'So it is $' . mlb_n(1000 * $th) . ' + ' . (10 * $t) . ' + ' . $o . '$.'],
                'Which place is the 0 in?', 'reasoning', 40); },
    ],
]; }

/* ═══ Stage 2 — Arithmetic Foundations ═══ */
function mlb_early_stage2(): array { return [
    'MC-011' => [
        static function (MlbRng $r) { $h = $r->int(1, 4); do { $a = $r->int(11, 89); } while ($a % 10 === 0); $c = 100 * $h - $a; $b = $r->int(12, 88);
            $seq = $r->shuffle([$a, $b, $c]); $tot = $a + $b + $c;
            return mlb_typed('num', 'Find $' . implode(' + ', $seq) . '$ in your head.', (string)$tot,
                ['Look for two numbers that make a whole hundred: $' . $a . ' + ' . $c . ' = ' . (100 * $h) . '$.', 'Then $' . (100 * $h) . ' + ' . $b . ' = ' . $tot . '$. You can add in any order.'],
                'Which two numbers fit together nicely?', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(105, 899); $b = $r->int(105, 899); $left = $r->int(0, 1) === 1;
            $tex = $left ? '\\square + ' . $b . ' = ' . $b . ' + ' . $a : $a . ' + ' . $b . ' = ' . $b . ' + \\square';
            return mlb_typed('num', 'What number makes this true? $' . $tex . '$', (string)$a,
                ['Swapping the order of an addition does not change the total.', 'So the box is ' . $a . '. You do not need to add at all.'],
                'Do you need to work out the total?', 'concept', 25); },
        static function (MlbRng $r) { $a = 100 * $r->int(2, 6) + $r->pick([$r->int(-4, -1) + 100, $r->int(1, 4)]); $b = 100 * $r->int(1, 3) + $r->pick([$r->int(-4, -1) + 100, $r->int(1, 4)]);
            $ra = (int)round($a / 100) * 100; $rb = (int)round($b / 100) * 100; $est = $ra + $rb;
            return mlb_early_num_mcq($r, 'Which is the best estimate of $' . $a . ' + ' . $b . '$?', $est,
                [[intdiv($a, 100) * 100 + intdiv($b, 100) * 100, 'That cuts both numbers down instead of rounding to the nearest hundred.'],
                 [$est + 100, 'Round each number to the nearest hundred: ' . $ra . ' and ' . $rb . '.'], [$est - 100, 'Round each number to the NEAREST hundred: ' . $ra . ' and ' . $rb . '.'], [$est * 10, 'That is ten times too big.']],
                [$a . ' is about ' . $ra . ' and ' . $b . ' is about ' . $rb . '.', 'So $' . $a . ' + ' . $b . '$ is about $' . $ra . ' + ' . $rb . ' = ' . $est . '$ (exactly ' . ($a + $b) . ').'],
                'Round each number to the nearest hundred.', 'concept', 30); },
        static function (MlbRng $r) { do { $a = $r->int(145, 489); $b = $r->int(136, 399); } while ($a % 10 + $b % 10 < 10 || intdiv($a % 100, 10) + intdiv($b % 100, 10) < 9);
            [$who] = mlb_early_names($r, 1); $what = $r->pick(['sachets of pure water', 'loaves of bread', 'bags of chin-chin', 'bottles of zobo']);
            return mlb_early_num_mcq($r, $who . ' sold ' . $a . ' ' . $what . ' on Monday and ' . $b . ' on Tuesday. How many is that in the two days?', $a + $b,
                [[mlb_early_nocarry($a, $b), 'The carried ten (and hundred) were forgotten.'], [abs($a - $b), '“In the two days” means put them together: add, not take away.'], [$a + $b - 10, 'One carry was missed out.']],
                ['Add the ones: ' . ($a % 10) . ' + ' . ($b % 10) . ' = ' . ($a % 10 + $b % 10) . '. Write ' . (($a % 10 + $b % 10) % 10) . ', carry 1 ten.', 'Then the tens and the hundreds, carrying again: $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.'],
                'Add, and remember to carry.', 'application', 40); },
    ],
    'MC-012' => [
        static function (MlbRng $r) { $n = $r->int(30, 95); $k = $r->int(11, $n - 6);
            [$stem, $end] = $r->pick([
                ['A danfo carries ' . $n . ' passengers. At Oshodi, ' . $k . ' get off. How many passengers are still on the danfo?', 'passengers are still on'],
                ['A trader has ' . $n . ' tomatoes. She sells ' . $k . '. How many tomatoes does she have left?', 'tomatoes are left'],
                ['There are ' . $n . ' learners in the hall. ' . $k . ' go back to class. How many learners are still in the hall?', 'learners are still in the hall'],
                ['A crate holds ' . $n . ' bottles of drink. ' . $k . ' are sold at break time. How many bottles are left?', 'bottles are left']]);
            return mlb_typed('num', $stem, (string)($n - $k),
                ['Some are taken away, so subtract: $' . $n . ' - ' . $k . '$.', '$' . $n . ' - ' . $k . ' = ' . ($n - $k) . '$, so ' . ($n - $k) . ' ' . $end . '.'],
                'Is something being taken away?', 'application', 35); },
        static function (MlbRng $r) { $a = 10 * $r->int(20, 90); $b = 10 * $r->int(5, intdiv($a, 10) - 3); [$who, $q] = mlb_early_names($r, 2);
            [$stem, $op] = $r->pick([
                [$who . ' had ₦' . $a . ' and spent ₦' . $b . ' at the market. Which calculation shows how much is left?', '-'],
                [$who . ' has ₦' . $a . ' and ' . $q . ' has ₦' . $b . '. Which calculation shows how much more ' . $who . ' has?', '-'],
                [$who . ' saved ₦' . $a . ' in March and ₦' . $b . ' in April. Which calculation shows how much was saved in the two months?', '+'],
                [$who . ' spent ₦' . $b . ' and still has ₦' . $a . '. Which calculation shows how much ' . $who . ' had at the start?', '+']]);
            $sub = '$' . $a . ' - ' . $b . '$'; $add = '$' . $a . ' + ' . $b . '$'; $rev = '$' . $b . ' - ' . $a . '$'; $mul = '$' . $a . ' \\times ' . $b . '$';
            $right = $op === '-' ? $sub : $add;
            $whys = [$sub => 'Subtracting finds what is left or a difference. Here the amounts are put together.', $add => 'Adding puts amounts together. Here you need what is left or a difference.',
                     $rev => 'Take the smaller amount from the bigger one: the bigger number comes first.', $mul => 'Multiplying is for equal groups. There are no equal groups here.'];
            $wrong = []; foreach ($whys as $o => $w) if ($o !== $right) $wrong[] = [$o, $w];
            return mlb_mcq($r, $stem, $right, $wrong,
                [$op === '-' ? 'You need what is left, or the difference: subtract.' : 'The two amounts are put together: add.', $right . ' $= ' . ($op === '-' ? $a - $b : $a + $b) . '$.'],
                'Is the story putting together or taking away?', 'concept', 35); },
        static function (MlbRng $r) { $a = $r->int(12, 59); $b = $a + $r->int(18, 47);
            $up = (int)ceil($a / 10) * 10; if ($up === $a) $up += 10;
            return mlb_typed('num', 'On a number line, how far is it from ' . $a . ' to ' . $b . '?', (string)($b - $a),
                ['Jump to the next ten: ' . $a . ' to ' . $up . ' is ' . ($up - $a) . '. Then ' . $up . ' to ' . $b . ' is ' . ($b - $up) . '.', 'Altogether: $' . ($up - $a) . ' + ' . ($b - $up) . ' = ' . ($b - $a) . '$. That is $' . $b . ' - ' . $a . '$.'],
                'Count on from ' . $a . ' in friendly jumps.', 'procedure', 35); },
        static function (MlbRng $r) { $b = $r->int(17, 49); $c = $r->int(21, 59); $a = $b + $c; [$who] = mlb_early_names($r, 1); $shown = $c + $r->pick([0, 0, 10, -10]);
            return mlb_mcq($r, $who . ' says $' . $a . ' - ' . $b . ' = ' . $shown . '$. Which addition checks the answer?', '$' . $shown . ' + ' . $b . '$',
                [['$' . $shown . ' + ' . $a . '$', 'Adding the answer to ' . $a . ' goes past ' . $a . '. Add the answer to the number taken away.'],
                 ['$' . $a . ' + ' . $b . '$', 'That adds the two numbers in the question. It does not use the answer at all.'],
                 ['$' . $shown . ' - ' . $b . '$', 'That is a subtraction. To undo taking away ' . $b . ', add ' . $b . ' back.']],
                ['Adding undoes subtracting: answer + ' . $b . ' should give ' . $a . '.', '$' . $shown . ' + ' . $b . ' = ' . ($shown + $b) . '$, so ' . $who . ' is ' . ($shown === $c ? 'right' : 'wrong: the answer is ' . $c) . '.'],
                'What do you do to undo “take away ' . $b . '”?', 'reasoning', 35); },
        static function (MlbRng $r) { $a = 10 * $r->int(5, 9); $b = $r->int(11, 39); $c = 10 * $r->int(5, 9); $same = $r->int(0, 3) === 0;
            if ($same && $c === $a) $c = $a === 90 ? 80 : $a + 10;
            $d = $same ? $c - ($a - $b) : $r->int(11, 39); if (!$same && $c - $d === $a - $b) $d++;
            if ($d < 1 || $d >= $c) { $c = $a; $d = $b + $r->pick([-3, 3]); $same = false; }
            $x = $a - $b; $y = $c - $d; $L = '$' . $a . ' - ' . $b . '$'; $R = '$' . $c . ' - ' . $d . '$';
            $right = $x === $y ? 'They leave the same' : ($x > $y ? $L : $R);
            $why = 'Work out both: $' . $a . ' - ' . $b . ' = ' . $x . '$ and $' . $c . ' - ' . $d . ' = ' . $y . '$.';
            $wrong = []; foreach ([$L, $R, 'They leave the same'] as $o) if ($o !== $right) $wrong[] = [$o, $why];
            return mlb_mcq($r, 'Which leaves more: $' . $a . ' - ' . $b . '$ or $' . $c . ' - ' . $d . '$?', $right, $wrong,
                [$why, $x === $y ? 'Both leave ' . $x . '.' : max($x, $y) . ' is more than ' . min($x, $y) . '.'],
                'Find each answer, then compare.', 'concept', 35); },
    ],
    'MC-013' => [
        static function (MlbRng $r) { $h = $r->int(3, 9); $o = $r->int(0, 5); $a = 100 * $h + $o; $b = 100 * $r->int(1, $h - 1) + 10 * $r->int(1, 9) + $r->int($o + 1, 9);
            [$stem, $u] = $r->pick([['A school has ' . $a . ' learners. ' . $b . ' are in the hall. How many are not in the hall?', 'learners'],
                ['A farmer has ' . $a . ' yams in the barn and sells ' . $b . '. How many yams are left?', 'yams'],
                ['A road is ' . $a . ' m long. ' . $b . ' m of it has been tarred. How many metres are not yet tarred?', 'metres']]);
            return mlb_typed('num', $stem, (string)($a - $b),
                ['The tens place of ' . $a . ' is 0, so exchange 1 hundred for 10 tens, then 1 ten for 10 ones.', $a . ' becomes ' . ($h - 1) . ' hundreds, 9 tens and ' . ($o + 10) . ' ones. So $' . $a . ' - ' . $b . ' = ' . ($a - $b) . '$ ' . $u . '.'],
                'There are no tens to exchange. Go to the hundreds first.', 'application', 45); },
        static function (MlbRng $r) { $hA = $r->int(4, 9); $tA = $r->int(1, 5); $oA = $r->int(0, 6); $hB = $r->int(1, $hA - 2); $tB = $r->int($tA, 9); $oB = $r->int($oA + 1, 9);
            $a = 100 * $hA + 10 * $tA + $oA; $b = 100 * $hB + 10 * $tB + $oB;
            $fmt = static fn($h, $t, $o) => $h . ' hundreds, ' . $t . ' tens, ' . $o . ' ones';
            return mlb_mcq($r, 'To work out $' . $a . ' - ' . $b . '$ you must regroup in the ones and the tens. After regrouping, how is ' . $a . ' written?', $fmt($hA - 1, $tA - 1 + 10, $oA + 10),
                [[$fmt($hA, $tA, $oA + 10), 'The ten moved to the ones must leave the tens column — and the tens need a hundred too.'],
                 [$fmt($hA - 1, $tA + 10, $oA + 10), 'One ten went to the ones, so the tens column has one less: ' . ($tA - 1 + 10) . ' tens.'],
                 [$fmt($hA, $tA - 1, $oA + 10), 'That only regroups the ones. The tens column also needs an exchange from the hundreds.']],
                ['Ones: ' . $oA . ' is less than ' . $oB . ', so 1 ten becomes 10 ones: ' . ($oA + 10) . ' ones and ' . ($tA - 1) . ' tens.', 'Tens: ' . ($tA - 1) . ' is less than ' . $tB . ', so 1 hundred becomes 10 tens: ' . ($hA - 1) . ' hundreds, ' . ($tA + 9) . ' tens.'],
                'Check each total is still ' . $a . '.', 'concept', 50); },
        static function (MlbRng $r) { $hA = $r->int(5, 9); $tA = $r->int(1, 6); $oA = $r->int(0, 5); $hB = $r->int(1, $hA - 2); $tB = $r->int($tA, 9); $oB = $r->int($oA + 1, 9);
            $a = 100 * $hA + 10 * $tA + $oA; $b = 100 * $hB + 10 * $tB + $oB; $ans = $a - $b;
            $o1 = $oA + 10 - $oB; $t1 = $tA + 9 - $tB; $h1 = $hA - 1 - $hB;
            $L = ['Ones: $' . ($oA + 10) . ' - ' . $oB . ' = ' . $o1 . '$', 'Tens: $' . ($tA + 9) . ' - ' . $tB . ' = ' . $t1 . '$', 'Hundreds: $' . ($hA - 1) . ' - ' . $hB . ' = ' . $h1 . '$', 'Answer: ' . $ans];
            $flipO = $oB - $oA; $noRedT = $tA + 10 - $tB; $noRedH = $hA - $hB;
            return mlb_error_of($r, 'Find the first mistake in this working for $' . $a . ' - ' . $b . '$.', $L, [
                [0, ['Ones: $' . $oB . ' - ' . $oA . ' = ' . $flipO . '$', 'Tens: $' . ($tA + 10) . ' - ' . $tB . ' = ' . $noRedT . '$', 'Hundreds: $' . ($hA - 1) . ' - ' . $hB . ' = ' . $h1 . '$', 'Answer: ' . (100 * $h1 + 10 * $noRedT + $flipO)],
                    $oA . ' is less than ' . $oB . ', so a ten must be exchanged: $' . ($oA + 10) . ' - ' . $oB . '$, not $' . $oB . ' - ' . $oA . '$.'],
                [1, [$L[0], 'Tens: $' . ($tA + 10) . ' - ' . $tB . ' = ' . $noRedT . '$', $L[2], 'Answer: ' . (100 * $h1 + 10 * $noRedT + $o1)],
                    'a ten went to the ones column, so the tens column has one less: ' . ($tA + 9) . ', not ' . ($tA + 10) . '.'],
                [2, [$L[0], $L[1], 'Hundreds: $' . $hA . ' - ' . $hB . ' = ' . $noRedH . '$', 'Answer: ' . (100 * $noRedH + 10 * $t1 + $o1)],
                    'a hundred was exchanged for 10 tens, so only ' . ($hA - 1) . ' hundreds are left.'],
            ]); },
        static function (MlbRng $r) { $a = 100 * $r->int(6, 9) + $r->int(1, 15); $b = 100 * $r->int(2, 4) - $r->int(1, 9); $est = (int)round($a / 100) * 100 - (int)round($b / 100) * 100;
            return mlb_early_num_mcq($r, 'Which is the best estimate of $' . $a . ' - ' . $b . '$?', $est,
                [[$est + 100, 'Round ' . $b . ' to the nearest hundred: it is ' . ((int)round($b / 100) * 100) . ', not ' . (intdiv($b, 100) * 100) . '.'],
                 [(int)round($a / 100) * 100 + (int)round($b / 100) * 100, 'That adds. The question takes away.'], [$est - 100, 'Round each number to the NEAREST hundred.']],
                [$a . ' is about ' . ((int)round($a / 100) * 100) . ' and ' . $b . ' is about ' . ((int)round($b / 100) * 100) . '.', 'So the answer is about ' . $est . ' (exactly ' . ($a - $b) . ').'],
                'Round each number to the nearest hundred first.', 'concept', 30); },
    ],
    'MC-014' => [
        static function (MlbRng $r) { $k = $r->int(3, 6); do { $m = $r->int(2, 9); } while ($m === $k || $m === $k + 1);
            return mlb_mcq($r, 'Which multiplication is the same as $' . implode(' + ', array_fill(0, $k, (string)$m)) . '$?', '$' . $k . ' \\times ' . $m . '$',
                [['$' . $m . ' \\times ' . $m . '$', 'Count how many ' . $m . 's are added: there are ' . $k . '.'], ['$' . $k . ' + ' . $m . '$', 'That adds the number of groups to the size of a group.'],
                 ['$' . ($k + 1) . ' \\times ' . $m . '$', 'Count the ' . $m . 's again: there are ' . $k . '.']],
                ['There are ' . $k . ' equal groups of ' . $m . '.', 'That is $' . $k . ' \\times ' . $m . ' = ' . ($k * $m) . '$.'],
                'How many times is ' . $m . ' added?', 'concept', 25); },
        static function (MlbRng $r) { $t = $r->int(2, 5); [$who] = mlb_early_names($r, 1);
            [$rows, $cols, $stem] = $r->pick([[5, 6, $who . ' buys ' . $t . ' trays of eggs. Each tray has 5 rows of 6 eggs. How many eggs is that?'],
                [4, 6, 'A school orders ' . $t . ' crates of drinks. Each crate holds 4 rows of 6 bottles. How many bottles are there?'],
                [3, 4, 'A shop has ' . $t . ' packs of juice. Each pack has 3 rows of 4 cartons. How many cartons are there?']]);
            return mlb_typed('num', $stem, (string)($t * $rows * $cols),
                ['One holds $' . $rows . ' \\times ' . $cols . ' = ' . ($rows * $cols) . '$.', $t . ' of them hold $' . $t . ' \\times ' . ($rows * $cols) . ' = ' . ($t * $rows * $cols) . '$.'],
                'Find how many are in one first.', 'application', 40); },
        static function (MlbRng $r) { $k = $r->int(3, 8); $m = $r->int(3, 8); [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' says ' . $k . ' groups of ' . $m . ' is ' . ($k + $m) . '. What went wrong?', $who . ' added ' . $k . ' and ' . $m . ' instead of multiplying',
                [['Nothing — it is right', $k . ' groups of ' . $m . ' is $' . $k . ' \\times ' . $m . ' = ' . ($k * $m) . '$.'],
                 [$who . ' multiplied ' . $k . ' by ' . $k, 'That would give ' . ($k * $k) . ', not ' . ($k + $m) . '.'],
                 [$who . ' counted one group too many', 'One more group would be ' . (($k + 1) * $m) . '.']],
                [$k . ' groups of ' . $m . ' means ' . $m . ' added ' . $k . ' times.', 'That is $' . $k . ' \\times ' . $m . ' = ' . ($k * $m) . '$. ' . ($k + $m) . ' is $' . $k . ' + ' . $m . '$.'],
                'Draw ' . $k . ' groups with ' . $m . ' in each.', 'reasoning', 35); },
        static function (MlbRng $r) { $rows = $r->int(2, 6); do { $cols = $r->int(3, 8); } while ($cols === $rows);
            return mlb_mcq($r, 'Which number sentence matches the dots?', '$' . $rows . ' \\times ' . $cols . ' = ' . ($rows * $cols) . '$',
                [['$' . $rows . ' + ' . $cols . ' = ' . ($rows + $cols) . '$', 'Adding one row to one column counts only the edges.'],
                 ['$' . $rows . ' \\times ' . ($cols + 1) . ' = ' . ($rows * ($cols + 1)) . '$', 'Count the dots in one row again: there are ' . $cols . '.'],
                 ['$' . ($rows - 1) . ' \\times ' . $cols . ' = ' . (($rows - 1) * $cols) . '$', 'Count the rows again: there are ' . $rows . '.']],
                ['There are ' . $rows . ' rows and ' . $cols . ' dots in each row.', 'So there are $' . $rows . ' \\times ' . $cols . ' = ' . ($rows * $cols) . '$ dots.'],
                'Count the rows. Count the dots in one row.', 'concept', 30, ['diagram' => ['type' => 'array', 'rows' => $rows, 'cols' => $cols]]); },
    ],
    'MC-015' => [
        static function (MlbRng $r) { $a = $r->int(2, 5); $b = $r->int(3, 9); $p = $a * $b;
            return mlb_typed('num', 'Use $' . $a . ' \\times ' . $b . ' = ' . $p . '$ to work out $' . (2 * $a) . ' \\times ' . $b . '$.', (string)(2 * $p),
                [(2 * $a) . ' groups is twice as many as ' . $a . ' groups.', 'So the answer is double ' . $p . ': $' . $p . ' + ' . $p . ' = ' . (2 * $p) . '$.'],
                'How does ' . (2 * $a) . ' compare with ' . $a . '?', 'procedure', 30); },
        static function (MlbRng $r) { $k = $r->int(3, 12); $nine = $r->int(0, 1) === 1;
            return mlb_typed('num', '$10 \\times ' . $k . ' = ' . (10 * $k) . '$. So what is $' . ($nine ? 9 : 11) . ' \\times ' . $k . '$?', (string)(($nine ? 9 : 11) * $k),
                [($nine ? 9 : 11) . ' groups of ' . $k . ' is one group ' . ($nine ? 'fewer' : 'more') . ' than 10 groups.', '$' . (10 * $k) . ($nine ? ' - ' : ' + ') . $k . ' = ' . (($nine ? 9 : 11) * $k) . '$.'],
                'Start from ' . (10 * $k) . '. One group ' . ($nine ? 'less' : 'more') . '.', 'procedure', 30); },
        static function (MlbRng $r) { $facts = []; while (count($facts) < 4) { $a = $r->int(3, 9); $b = $r->int(3, 9); $facts[$a . 'x' . $b] = [$a, $b]; }
            $facts = array_values($facts); $bi = $r->int(0, 3); [$ba, $bb] = $facts[$bi]; $off = $r->pick([-$ba, $ba, -1, 1, 2]);
            $txt = static fn($a, $b, $v) => '$' . $a . ' \\times ' . $b . ' = ' . $v . '$';
            $right = $txt($ba, $bb, $ba * $bb + $off); $wrong = [];
            foreach ($facts as $i => [$a, $b]) if ($i !== $bi) $wrong[] = [$txt($a, $b, $a * $b), 'This one is right: ' . $b . ' added ' . $a . ' times is ' . ($a * $b) . '.'];
            return mlb_mcq($r, 'One of these facts is wrong. Which one?', $right, $wrong,
                ['Check each fact, for example by adding equal groups.', '$' . $ba . ' \\times ' . $bb . ' = ' . ($ba * $bb) . '$, not ' . ($ba * $bb + $off) . '.'],
                'Check each one. Use a fact you are sure of.', 'reasoning', 40); },
        static function (MlbRng $r) { do { $a = $r->int(3, 9); $b = $r->int(3, 12); } while ($a === $b); $p = $a * $b;
            return mlb_mcq($r, 'You know $' . $a . ' \\times ' . $b . ' = ' . $p . '$. Which other fact do you also know?', '$' . $b . ' \\times ' . $a . ' = ' . $p . '$',
                [['$' . $a . ' + ' . $b . ' = ' . $p . '$', 'Adding is not multiplying: $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.'],
                 ['$' . $b . ' \\times ' . ($a + 1) . ' = ' . $p . '$', 'One more group of ' . $b . ' changes the answer.'],
                 ['$' . $p . ' \\times ' . $a . ' = ' . $b . '$', 'Multiplying ' . $p . ' makes it bigger, not ' . $b . '.']],
                [$a . ' rows of ' . $b . ' is the same as ' . $b . ' rows of ' . $a . ' — turn the array round.', 'So $' . $b . ' \\times ' . $a . ' = ' . $p . '$ too.'],
                'Picture an array turned on its side.', 'concept', 25); },
        static function (MlbRng $r) { $k = $r->int(3, 9); $j = $r->int(6, 12); $right = $k * $j; $w = [];
            foreach ([$right + 1, $right - 2, $right + $k - 1, ($k + 1) * $j, $right + 3] as $v) if ($v % $k !== 0 && count($w) < 3) $w[] = [$v, $v . ' ÷ ' . $k . ' leaves a remainder, so it is not in the ' . $k . ' times table.'];
            return mlb_early_num_mcq($r, 'Which number is in the ' . $k . ' times table?', $right, $w,
                ['A number is in the ' . $k . ' times table if ' . $k . ' times a whole number gives it.', '$' . $k . ' \\times ' . $j . ' = ' . $right . '$.'],
                'Count in ' . $k . 's, or try dividing by ' . $k . '.', 'concept', 30); },
    ],
    'MC-016' => [
        static function (MlbRng $r) { $s = $r->int(3, 8); $g = $r->int(3, 12); $t = $s * $g;
            $stem = $r->pick(['A teacher puts ' . $t . ' learners into teams of ' . $s . '. How many teams are there?',
                'Mama puts ' . $t . ' oranges into bags of ' . $s . '. How many bags does she fill?',
                $t . ' chairs are set out in rows of ' . $s . '. How many rows are there?']);
            return mlb_typed('num', $stem, (string)$g,
                ['Making groups of ' . $s . ' is dividing: $' . $t . ' \\div ' . $s . '$.', '$' . $g . ' \\times ' . $s . ' = ' . $t . '$, so there are ' . $g . '.'],
                'How many ' . $s . 's make ' . $t . '?', 'application', 30); },
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(4, 9); $p = $a * $b;
            return mlb_mcq($r, 'Which multiplication fact helps you work out $' . $p . ' \\div ' . $a . '$?', '$' . $a . ' \\times ' . $b . ' = ' . $p . '$',
                [['$' . $a . ' + ' . ($p - $a) . ' = ' . $p . '$', 'That is adding. Division asks how many ' . $a . 's make ' . $p . '.'],
                 ['$' . $p . ' \\times ' . $a . ' = ' . ($p * $a) . '$', 'Multiplying ' . $p . ' makes it bigger. Division shares it out.'],
                 ['$' . $a . ' \\times ' . ($b - 1) . ' = ' . ($a * ($b - 1)) . '$', 'That gives ' . ($a * ($b - 1)) . ', not ' . $p . '.']],
                ['$' . $p . ' \\div ' . $a . '$ asks: ' . $a . ' times what is ' . $p . '?', '$' . $a . ' \\times ' . $b . ' = ' . $p . '$, so $' . $p . ' \\div ' . $a . ' = ' . $b . '$.'],
                'Division undoes multiplication.', 'concept', 30); },
        static function (MlbRng $r) { $d = $r->int(2, 6); $q = $r->int(3, 9); $n = $d * $q; [$who] = mlb_early_names($r, 1);
            $story = $r->pick(['sub', 'mul', 'ok']); $shown = ['sub' => $n - $d, 'mul' => $n * $d, 'ok' => $q][$story];
            $SUB = $who . ' took ' . $d . ' away instead of dividing'; $MUL = $who . ' multiplied instead of dividing'; $OK = 'Nothing — the answer is right'; $ADD = $who . ' added instead of dividing';
            $right = ['sub' => $SUB, 'mul' => $MUL, 'ok' => $OK][$story];
            $whys = [$SUB => 'Taking away ' . $d . ' gives ' . ($n - $d) . '.', $MUL => 'Multiplying gives ' . ($n * $d) . '.', $OK => 'Check: $' . $shown . ' \\times ' . $d . ' = ' . ($shown * $d) . '$.', $ADD => 'Adding gives ' . ($n + $d) . '.'];
            $wrong = []; foreach ($whys as $o => $w) if ($o !== $right) $wrong[] = [$o, $w];
            return mlb_mcq($r, $who . ' writes $' . $n . ' \\div ' . $d . ' = ' . $shown . '$. What mistake, if any, did ' . $who . ' make?', $right, $wrong,
                ['Check by multiplying back: the answer times ' . $d . ' should be ' . $n . '.', '$' . $q . ' \\times ' . $d . ' = ' . $n . '$, so $' . $n . ' \\div ' . $d . ' = ' . $q . '$.'],
                'Multiply the answer by ' . $d . '. Do you get ' . $n . '?', 'reasoning', 40); },
        static function (MlbRng $r) { $x = $r->int(2, 5); $y = $r->int(2, 5); $same = $r->int(0, 3) === 0; $what = $r->pick(MLB_EARLY_THINGS);
            if ($same) { $e = $r->int(3, 8); $n1 = $x * $e; do { $y = $r->int(2, 6); } while ($y === $x); $n2 = $y * $e; }
            else { do { $y = $r->int(2, 6); } while ($y === $x); $n1 = $x * $y * $r->int(1, 3); $n2 = $n1; }
            $s1 = intdiv($n1, $x); $s2 = intdiv($n2, $y);
            $A = $n1 . ' ' . $what . ' shared by ' . $x . ' children'; $B = $n2 . ' ' . $what . ' shared by ' . $y . ' children';
            $right = $s1 === $s2 ? 'Both give the same' : ($s1 > $s2 ? $A : $B);
            $why = 'Work out each share: $' . $n1 . ' \\div ' . $x . ' = ' . $s1 . '$ and $' . $n2 . ' \\div ' . $y . ' = ' . $s2 . '$.';
            $wrong = []; foreach ([$A, $B, 'Both give the same'] as $o) if ($o !== $right) $wrong[] = [$o, $why];
            return mlb_mcq($r, 'Which gives each child more?', $right, $wrong,
                [$why, $s1 === $s2 ? 'Each child gets ' . $s1 . ' either way.' : 'Each child gets ' . max($s1, $s2) . ' rather than ' . min($s1, $s2) . '.'],
                'Work out one child’s share in each.', 'concept', 35); },
    ],
    'MC-017' => [
        static function (MlbRng $r) { $s = $r->int(4, 9); $q = $r->int(4, 12); $rem = $r->int(1, $s - 1); $n = $s * $q + $rem;
            $stem = $r->pick(['A packet holds ' . $s . ' biscuits. How many FULL packets can be made from ' . $n . ' biscuits?',
                'Each bench seats ' . $s . ' learners. ' . $n . ' learners sit down, filling benches one at a time. How many benches are completely full?',
                'A ribbon is ' . $n . ' cm long. How many ' . $s . ' cm pieces can be cut from it?']);
            return mlb_typed('num', $stem, (string)$q,
                ['$' . $n . ' \\div ' . $s . ' = ' . $q . '$ remainder ' . $rem . '.', 'The ' . $rem . ' left over is not enough for another, so the answer is ' . $q . '.'],
                'What happens to the leftover?', 'application', 35); },
        static function (MlbRng $r) { $d = $r->int(4, 9); $q = $r->int(4, 11); $rem = $r->int(1, $d - 2); $n = $d * $q + $rem;
            return mlb_mcq($r, 'Work out $' . $n . ' \\div ' . $d . '$, with a remainder.', $q . ' remainder ' . $rem,
                [[($q - 1) . ' remainder ' . ($rem + $d), 'The remainder ' . ($rem + $d) . ' is not less than ' . $d . ': another ' . $d . ' fits.'],
                 [($q + 1) . ' remainder ' . $rem, '$' . ($q + 1) . ' \\times ' . $d . ' = ' . (($q + 1) * $d) . '$, which is more than ' . $n . '.'],
                 [$q . ' remainder ' . ($rem + 1), '$' . $q . ' \\times ' . $d . ' = ' . ($q * $d) . '$, and $' . $n . ' - ' . ($q * $d) . ' = ' . $rem . '$.']],
                ['The biggest multiple of ' . $d . ' that fits is $' . $q . ' \\times ' . $d . ' = ' . ($q * $d) . '$.', '$' . $n . ' - ' . ($q * $d) . ' = ' . $rem . '$. So it is ' . $q . ' remainder ' . $rem . '.'],
                'A remainder must be smaller than ' . $d . '.', 'procedure', 35); },
        static function (MlbRng $r) { $d = $r->int(3, 9); $q = $r->int(4, 12); $rem = $r->int(1, $d - 1);
            return mlb_typed('num', 'A number divided by ' . $d . ' gives ' . $q . ' remainder ' . $rem . '. What is the number?', (string)($d * $q + $rem),
                [$q . ' groups of ' . $d . ' make $' . $q . ' \\times ' . $d . ' = ' . ($q * $d) . '$.', 'Add the ' . $rem . ' left over: $' . ($q * $d) . ' + ' . $rem . ' = ' . ($d * $q + $rem) . '$.'],
                'Undo the division: multiply, then add the remainder.', 'reasoning', 35); },
        static function (MlbRng $r) { $d = $r->int(4, 8); $q = $r->int(3, 8); $rem = $r->int(1, $d - 1); $n = $d * $q + $rem; [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' says $' . $n . ' \\div ' . $d . ' = ' . ($q - 1) . '$ remainder ' . ($rem + $d) . '. What is wrong?',
                'The remainder is bigger than ' . $d . ', so another ' . $d . ' fits: it is ' . $q . ' remainder ' . $rem,
                [['Nothing — it is right', 'A remainder of ' . ($rem + $d) . ' still holds another ' . $d . '.'],
                 ['It should be ' . ($q - 1) . ' remainder ' . $rem, 'Check: $' . ($q - 1) . ' \\times ' . $d . ' + ' . $rem . ' = ' . (($q - 1) * $d + $rem) . '$, not ' . $n . '.'],
                 ['It should be ' . ($q + 1) . ' with no remainder', '$' . ($q + 1) . ' \\times ' . $d . ' = ' . (($q + 1) * $d) . '$, which is too big.']],
                ['A remainder must be less than the number you divide by.', '$' . $q . ' \\times ' . $d . ' = ' . ($q * $d) . '$ and $' . $n . ' - ' . ($q * $d) . ' = ' . $rem . '$.'],
                'Is the remainder smaller than ' . $d . '?', 'reasoning', 40); },
    ],
    'MC-018' => [
        static function (MlbRng $r) { $a = $r->int(250, 899); $b = $r->int(105, $a - 60); $c = $a - $b;
            return mlb_mcq($r, 'Which calculation checks that $' . $a . ' - ' . $b . ' = ' . $c . '$?', '$' . $c . ' + ' . $b . '$',
                [['$' . $a . ' + ' . $b . '$', 'That uses only the question. Add the ANSWER to what was taken away.'],
                 ['$' . $c . ' - ' . $b . '$', 'Subtracting again does not undo a subtraction. Adding does.'],
                 ['$' . $a . ' + ' . $c . '$', 'That goes past ' . $a . '. The check should land back on ' . $a . '.']],
                ['Adding undoes subtracting.', 'If $' . $c . ' + ' . $b . ' = ' . $a . '$, the subtraction was right.'],
                'What is the opposite of taking away?', 'concept', 30); },
        static function (MlbRng $r) { do { $a = $r->int(3, 9); $b = $r->int(4, 12); } while ($a === $b); $p = $a * $b;
            return mlb_mcq($r, 'Which of these is in the same fact family as $' . $a . ' \\times ' . $b . ' = ' . $p . '$?', '$' . $p . ' \\div ' . $b . ' = ' . $a . '$',
                [['$' . $b . ' \\div ' . $p . ' = ' . $a . '$', 'Dividing the small number by the big one does not give ' . $a . '.'],
                 ['$' . $p . ' \\times ' . $b . ' = ' . $a . '$', 'Multiplying ' . $p . ' by ' . $b . ' makes it bigger.'],
                 ['$' . $p . ' - ' . $b . ' = ' . $a . '$', '$' . $p . ' - ' . $b . ' = ' . ($p - $b) . '$, not ' . $a . '.']],
                ['A multiplication fact comes with two division facts.', '$' . $p . ' \\div ' . $b . ' = ' . $a . '$ and $' . $p . ' \\div ' . $a . ' = ' . $b . '$.'],
                'Division undoes multiplication.', 'concept', 30); },
        static function (MlbRng $r) { [$who] = mlb_early_names($r, 1); $op = $r->int(0, 2); $x = $r->int(4, 15); $k = $r->int(3, 9);
            [$did, $got, $undo] = [['multiplies it by ' . $k, $x * $k, 'divide by ' . $k], ['adds ' . $k . ' to it', $x + $k, 'take away ' . $k], ['takes ' . $k . ' away from it', $x - $k + 20, 'add ' . $k]][$op];
            if ($op === 2) { $x = $x + 20; $got = $x - $k; }
            return mlb_typed('num', $who . ' thinks of a number and ' . $did . '. The answer is ' . $got . '. What was the number?', (string)$x,
                ['Work backwards: ' . $undo . '.', 'Start from ' . $got . ' and ' . $undo . ': ' . $x . '.'],
                'Undo what ' . $who . ' did.', 'reasoning', 35); },
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(4, 12); [$who] = mlb_early_names($r, 1);
            [$stem, $right] = $r->pick([
                ['A bag of rice costs ₦' . (100 * $b) . '. ' . $who . ' buys ' . $a . ' bags. Which operation finds the total cost?', 'Multiply'],
                [($a * $b) . ' sweets are shared equally among ' . $a . ' children. Which operation finds each child’s share?', 'Divide'],
                [$who . ' is ' . ($a + 120) . ' cm tall and a friend is ' . (120 - $b) . ' cm tall. Which operation finds the difference in height?', 'Subtract'],
                ['A trader sold ' . ($a * 10) . ' oranges in the morning and ' . ($b * 10) . ' in the afternoon. Which operation finds how many she sold in all?', 'Add']]);
            $whys = ['Add' => 'Adding puts two amounts together.', 'Subtract' => 'Subtracting finds what is left or a difference.', 'Multiply' => 'Multiplying finds the total of equal groups.', 'Divide' => 'Dividing shares out or makes equal groups.'];
            $wrong = []; foreach ($whys as $o => $w) if ($o !== $right) $wrong[] = [$o, $w];
            return mlb_mcq($r, $stem, $right, $wrong,
                ['Ask what the story is doing to the numbers.', $whys[$right]], 'Equal groups? Sharing? Putting together? A difference?', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(4, 12); $p = $a * $b;
            return mlb_typed('num', 'Which number makes this true? $' . $p . ' \\div \\square = ' . $b . '$', (string)$a,
                ['$' . $p . ' \\div \\square = ' . $b . '$ means ' . $b . ' groups of the box make ' . $p . '.', '$' . $p . ' \\div ' . $b . ' = ' . $a . '$. Check: $' . $p . ' \\div ' . $a . ' = ' . $b . '$.'],
                $b . ' times what is ' . $p . '?', 'procedure', 30); },
    ],
    'MC-019' => [
        static function (MlbRng $r) { $n = $r->pick([24, 36, 48, 60, 72]); $fs = []; for ($i = 3; $i < $n; $i++) if ($n % $i === 0) $fs[] = $i; $f = $r->pick($fs);
            $non = []; foreach ([5, 7, 9, 10, 11, 14, 16, 18, 21, 27] as $v) if ($n % $v !== 0) $non[] = $v; $non = array_slice($r->shuffle($non), 0, 2);
            $w = [[2 * $n, 'That is a multiple of ' . $n . ', not a factor. A factor is never bigger than the number.']];
            foreach ($non as $v) $w[] = [$v, '$' . $n . ' \\div ' . $v . '$ leaves a remainder.'];
            return mlb_early_num_mcq($r, 'Which of these is a factor of ' . $n . '?', $f, $w,
                ['A factor divides ' . $n . ' exactly.', '$' . $n . ' \\div ' . $f . ' = ' . intdiv($n, $f) . '$, so ' . $f . ' is a factor.'],
                'Which one divides ' . $n . ' with nothing left over?', 'concept', 30); },
        static function (MlbRng $r) { $k = $r->pick([3, 4, 6, 7, 8]); $s = $r->int(40, 90); if ($s % $k === 0) $s++;
            $key = (intdiv($s, $k) + 1) * $k;
            return mlb_typed('num', 'What is the smallest number bigger than ' . $s . ' that divides exactly by ' . $k . '?', (string)$key,
                ['$' . $s . ' \\div ' . $k . ' = ' . intdiv($s, $k) . '$ remainder ' . ($s % $k) . '.', 'The next multiple of ' . $k . ' is $' . (intdiv($s, $k) + 1) . ' \\times ' . $k . ' = ' . $key . '$.'],
                'Count on in ' . $k . 's from a multiple you know.', 'procedure', 35); },
        static function (MlbRng $r) { $last = $r->pick([0, 5]); $n = 10 * $r->int(100, 999) + $last; $ds = array_sum(str_split((string)$n));
            return mlb_mcq($r, 'Which reason shows that ' . mlb_p($n) . ' divides exactly by 5?', 'Its last digit is ' . $last,
                [['Its digits add up to ' . $ds, 'Adding the digits is the test for 3 and 9, not 5.'],
                 [$last === 5 ? 'It is an odd number' : 'It is an even number', $last === 5 ? 'Lots of odd numbers, like 7, do not divide by 5.' : 'Lots of even numbers, like 8, do not divide by 5.'],
                 ['Its first digit is ' . substr((string)$n, 0, 1), 'The first digit does not decide this.']],
                ['Every multiple of 5 ends in 0 or 5.', mlb_p($n) . ' ends in ' . $last . ', so it divides exactly by 5.'],
                'Look at the multiples of 5: 5, 10, 15, 20… How do they end?', 'concept', 30); },
        static function (MlbRng $r) { $k = $r->int(3, 12); $j = $r->int(3, 9); $ord = [3 => '3rd', 4 => '4th', 5 => '5th', 6 => '6th', 7 => '7th', 8 => '8th', 9 => '9th'][$j];
            return mlb_typed('num', 'What is the ' . $ord . ' multiple of ' . $k . '?', (string)($j * $k),
                ['The multiples of ' . $k . ' are ' . $k . ', ' . (2 * $k) . ', ' . (3 * $k) . ', … The first one is ' . $k . ' itself.', 'The ' . $ord . ' is $' . $j . ' \\times ' . $k . ' = ' . ($j * $k) . '$.'],
                'The 1st multiple of ' . $k . ' is ' . $k . '.', 'procedure', 25); },
    ],
    'MC-020' => [
        static function (MlbRng $r) { $p = $r->pick([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);
            $pool = [[1, '1 has only one factor. A prime has exactly two.'], [9, '$9 = 3 \\times 3$.'], [15, '$15 = 3 \\times 5$.'], [21, '$21 = 3 \\times 7$.'], [27, '$27 = 3 \\times 9$.'],
                [33, '$33 = 3 \\times 11$.'], [39, '$39 = 3 \\times 13$.'], [49, '$49 = 7 \\times 7$.'], [51, '$51 = 3 \\times 17$.'], [57, '$57 = 3 \\times 19$.'], [91, '$91 = 7 \\times 13$.']];
            $w = array_slice($r->shuffle($pool), 0, 3);
            return mlb_early_num_mcq($r, 'Which of these numbers is prime?', $p, $w,
                ['A prime number has exactly two factors: 1 and itself.', 'Only ' . $p . ' has no other factor. Each of the others can be split into two smaller numbers multiplied.'],
                'Try dividing each by 2, 3, 5 and 7.', 'concept', 40); },
        static function (MlbRng $r) { do { $a = $r->pick([4, 6, 8, 9, 10, 12, 15]); $b = $r->pick([6, 8, 9, 10, 12, 14, 15, 18, 20]); } while ($a === $b || mlb_lcm($a, $b) === max($a, $b));
            $L = mlb_lcm($a, $b);
            return mlb_typed('num', 'Find the L.C.M. of ' . $a . ' and ' . $b . '.', (string)$L,
                ['List multiples of ' . max($a, $b) . ': ' . implode(', ', array_map(static fn($i) => $i * max($a, $b), range(1, intdiv($L, max($a, $b))))) . '.', 'The first one that ' . min($a, $b) . ' also divides is ' . $L . '.'],
                'The Lowest Common Multiple: the smallest number both divide into.', 'procedure', 40); },
        static function (MlbRng $r) { do { $g = $r->int(2, 6); $x = $r->int(2, 7); $y = $r->int(2, 7); } while ($x === $y || mlb_gcd($x, $y) !== 1); $a = $g * $x; $b = $g * $y;
            [$who] = mlb_early_names($r, 1); [$p, $q] = $r->pick([['oranges', 'mangoes'], ['pencils', 'erasers'], ['sweets', 'biscuits']]);
            return mlb_early_num_mcq($r, $who . ' has ' . $a . ' ' . $p . ' and ' . $b . ' ' . $q . '. ' . $who . ' packs them into identical bags with nothing left over. What is the greatest number of bags?', $g,
                [[mlb_lcm($a, $b), 'That is the L.C.M. — there are not that many ' . $p . ' to go round.'], [min($a, $b), 'Then the ' . ($a < $b ? $q : $p) . ' would not share out equally.'], [1, 'One bag works, but it is not the GREATEST number.']],
                ['The number of bags must divide both ' . $a . ' and ' . $b . '.', 'The greatest such number is the H.C.F.: ' . $g . ' bags, each with ' . $x . ' ' . $p . ' and ' . $y . ' ' . $q . '.'],
                'Is it a common factor or a common multiple?', 'application', 45); },
        static function (MlbRng $r) { do { $n = $r->int(10, 90); $isP = true; for ($i = 2; $i * $i <= $n; $i++) if ($n % $i === 0) $isP = false; } while ($isP);
            $k = $n + 1; while (true) { $ok = true; for ($i = 2; $i * $i <= $k; $i++) if ($k % $i === 0) { $ok = false; break; } if ($ok) break; $k++; }
            return mlb_typed('num', 'What is the smallest prime number bigger than ' . $n . '?', (string)$k,
                ['Test the numbers after ' . $n . ' one by one: does 2, 3, 5 or 7 divide them?', $k . ' has no factor except 1 and itself, so it is the next prime.'],
                'Even numbers (except 2) are never prime. Try the odd ones.', 'procedure', 45); },
    ],
]; }

/* ═══ Stage 3 — The Number System ═══ */
function mlb_early_stage3(): array { return [
    'MC-021' => [
        static function (MlbRng $r) { $town = $r->pick(['Jos', 'Abuja', 'Kano', 'Lagos', 'Enugu', 'Maiduguri']);
            $t = [-$r->int(6, 12), -$r->int(1, 5), $r->int(0, 4), $r->int(5, 15)]; $min = min($t);
            $w = []; foreach ($t as $v) if ($v !== $min) $w[] = ['$' . $v . '^\\circ$C', $v < 0 ? '$' . $v . '$ is closer to 0 than $' . $min . '$, so it is warmer.' : ($v === 0 ? '0°C is warmer than any temperature below zero.' : 'That is above zero.')];
            return mlb_mcq($r, 'These are night temperatures in ' . $town . ' over four nights. Which is the coldest?', '$' . $min . '^\\circ$C', $w,
                ['Below zero, the further from 0 the colder it is.', '$' . $min . '$ is furthest below zero, so $' . $min . '^\\circ$C is the coldest.'],
                'Picture a thermometer: which is lowest?', 'concept', 30); },
        static function (MlbRng $r) { $k = $r->int(6, 10); $t = $r->int(0, $k - 1); $v = -$k + $t;
            return mlb_typed('num', 'Each mark on this number line is 1. The arrow points to a number. What is it?', (string)$v,
                ['The line starts at $-' . $k . '$ and goes up by 1 at each mark.', 'The arrow is ' . $t . ' marks along: $-' . $k . ' + ' . $t . ' = ' . $v . '$.'],
                'Is the arrow before or after 0? Numbers below 0 have a minus sign.', 'procedure', 30,
                ['diagram' => ['type' => 'numberline', 'start' => -$k, 'step' => 1, 'count' => 10, 'arrow' => $t, 'labels' => [0, 10]]]); },
        static function (MlbRng $r) { do { $a = -$r->int(1, 15); $b = -$r->int(1, 15); } while ($a === $b);
            if ($r->int(0, 2) === 0) $b = $r->int(1, 9);
            $rel = $a < $b ? '<' : '>'; $flip = $rel === '<' ? '>' : '<';
            return mlb_mcq($r, 'Which of these is true?', '$' . $a . ' ' . $rel . ' ' . $b . '$',
                [['$' . $a . ' ' . $flip . ' ' . $b . '$', $b < 0 && $a < 0 ? 'Below zero, a bigger number after the minus sign means further from 0: SMALLER.' : 'Any negative number is less than any positive number.'],
                 ['$' . $a . ' = ' . $b . '$', 'They are different numbers.']],
                ['On a number line, the number further to the left is the smaller one.', '$' . min($a, $b) . '$ is further left, so $' . $a . ' ' . $rel . ' ' . $b . '$.'],
                'Which is further to the left on a number line?', 'concept', 25); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            if ($c === 0) { $s = -$r->int(1, 3); $u = $r->int(4, 9); return mlb_typed('num', 'A lift is on floor $' . $s . '$ (in the car park under the ground). It goes up ' . $u . ' floors. Which floor is it on now?', (string)($s + $u),
                ['Going up is adding: $' . $s . ' + ' . $u . '$.', 'Count up from $' . $s . '$: you pass 0 and reach ' . ($s + $u) . '.'], 'Floor 0 is the ground floor.', 'application', 35); }
            if ($c === 1) { $o = 100 * $r->int(2, 9); $p = 100 * $r->int(1, 12); [$who] = mlb_early_names($r, 1); return mlb_typed('num', $who . '’s account is overdrawn: the balance is $-' . $o . '$ naira. ' . $who . ' pays in ₦' . $p . '. What is the balance now? (Use a minus sign if it is still below zero.)', (string)($p - $o),
                ['Paying in is adding: $-' . $o . ' + ' . $p . '$.', 'The balance is $' . ($p - $o) . '$ naira.'], 'Start below zero and move up by ' . $p . '.', 'application', 40); }
            $d = $r->int(5, 30); $up = $r->int(2, $d - 1);
            return mlb_typed('num', 'A diver is $' . $d . '$ m below the surface, at $-' . $d . '$ m. She swims up ' . $up . ' m. What is her new position? (Use a minus sign for below the surface.)', (string)($up - $d),
                ['Swimming up is adding: $-' . $d . ' + ' . $up . '$.', 'She is at $' . ($up - $d) . '$ m, still below the surface.'], 'The surface is 0.', 'application', 35); },
    ],
    'MC-022' => [
        static function (MlbRng $r) { $a = $r->int(1, 9); $b = $r->int(2, 18); $town = $r->pick(['Jos', 'Mambilla', 'Obudu']);
            return mlb_typed('num', 'On a cold morning in ' . $town . ' it is $-' . $a . '^\\circ$C. At noon it is $' . $b . '^\\circ$C. How many degrees warmer is it at noon?', (string)($a + $b),
                ['From $-' . $a . '$ up to 0 is ' . $a . ' degrees. From 0 up to ' . $b . ' is ' . $b . ' degrees.', 'Altogether: $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$ degrees. That is $' . $b . ' - (-' . $a . ')$.'],
                'Count the steps up to 0, then on from 0.', 'application', 35, ['unit' => '°C']); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); if ($a === $b) $b++; $left = $r->int(0, 1) === 1;
            $right = $left ? '$-' . $a . ' - ' . $b . '$' : '$-' . $a . ' + ' . $b . '$'; $other = $left ? '$-' . $a . ' + ' . $b . '$' : '$-' . $a . ' - ' . $b . '$';
            return mlb_mcq($r, 'On a number line, start at $-' . $a . '$ and move ' . $b . ' to the ' . ($left ? 'left' : 'right') . '. Which calculation is this?', $right,
                [[$other, 'Moving right is adding, moving left is subtracting. This move is to the ' . ($left ? 'left' : 'right') . '.'],
                 ['$' . $a . ($left ? ' - ' : ' + ') . $b . '$', 'The start is $-' . $a . '$, not ' . $a . '.'],
                 ['$' . $b . ($left ? ' - ' : ' + ') . $a . '$', 'Start at $-' . $a . '$; the ' . $b . ' is how far you move.']],
                ['Start at $-' . $a . '$. Moving ' . ($left ? 'left' : 'right') . ' means ' . ($left ? 'subtracting' : 'adding') . '.', $right . ' $= ' . ($left ? -$a - $b : -$a + $b) . '$.'],
                'Which way is adding on a number line?', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(2, 12); $c = $r->int(-9, 12);
            return mlb_typed('num', 'Fill the box: $-' . $a . ' + \\square = ' . $c . '$', (string)($c + $a),
                ['The box is how far it is from $-' . $a . '$ to $' . $c . '$.', '$' . $c . ' - (-' . $a . ') = ' . ($c + $a) . '$. Check: $-' . $a . ' + ' . ($c + $a) . ' = ' . $c . '$.'],
                'Count the steps from $-' . $a . '$ to $' . $c . '$.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(4, 12); $b = $r->int(2, $a - 1); [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' says $-' . $a . ' + ' . $b . ' = -' . ($a + $b) . '$. What went wrong?',
                $who . ' added ' . $a . ' and ' . $b . ' and kept the minus. Moving up ' . $b . ' from $-' . $a . '$ gives $-' . ($a - $b) . '$.',
                [['Nothing — it is right', 'Adding ' . $b . ' moves UP the number line, towards 0.'],
                 ['It should be $' . ($a + $b) . '$', 'The start is below zero, and adding ' . $b . ' does not reach 0.'],
                 ['It should be $' . ($a - $b) . '$', 'Close: the size is ' . ($a - $b) . ', but it is still below zero.']],
                ['Start at $-' . $a . '$ and move ' . $b . ' to the right.', 'You land on $-' . ($a - $b) . '$.'],
                'Does adding a positive number move you up or down?', 'reasoning', 40); },
    ],
    'MC-023' => [
        static function (MlbRng $r) { $n = $r->int(2, 4); $neg = $r->int(1, $n); $fs = [];
            for ($i = 0; $i < $n; $i++) $fs[] = $i < $neg ? '(-' . $r->int(2, 9) . ')' : (string)$r->int(2, 9);
            $fs = $r->shuffle($fs); $pos = $neg % 2 === 0;
            return mlb_mcq($r, 'Without working it out, is $' . implode(' \\times ', $fs) . '$ positive or negative?', $pos ? 'Positive' : 'Negative',
                [[$pos ? 'Negative' : 'Positive', 'Count the negative numbers: there ' . ($neg === 1 ? 'is 1' : 'are ' . $neg) . '.'],
                 ['Zero', 'None of the numbers is 0, so the answer cannot be 0.'],
                 ['It depends on the size of the numbers', 'The sign depends only on how many numbers are negative.']],
                ['Each pair of negatives makes a positive.', 'There ' . ($neg === 1 ? 'is 1 negative' : 'are ' . $neg . ' negatives') . ', an ' . ($pos ? 'even' : 'odd') . ' number, so the answer is ' . ($pos ? 'positive' : 'negative') . '.'],
                'Count the negative numbers.', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $x = $r->nz(-9, 9); $neg = $r->int(0, 1) === 1; $m = $neg ? -$a : $a; $p = $m * $x;
            return mlb_typed('num', 'Find the missing number: $' . ($neg ? '(-' . $a . ')' : $a) . ' \\times \\square = ' . $p . '$', (string)$x,
                ['Divide: $' . $p . ' \\div ' . ($neg ? '(-' . $a . ')' : $a) . '$.', 'The size is ' . abs($x) . '. ' . (($p < 0) === ($m < 0) ? 'The signs of ' . $p . ' and the number given match, so the box is positive' : 'The signs differ, so the box is negative') . ': $' . $x . '$.'],
                'Find the size first, then decide the sign.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); [$who] = mlb_early_names($r, 1); $div = $r->int(0, 1) === 1;
            $tex = $div ? '(-' . ($a * $b) . ') \\div (-' . $b . ') = -' . $a : '(-' . $a . ') \\times (-' . $b . ') = -' . ($a * $b);
            $true = $div ? $a : $a * $b;
            return mlb_mcq($r, $who . ' writes $' . $tex . '$. What is wrong?', 'Two negatives give a positive: the answer is ' . $true,
                [['Nothing — it is right', 'Two negative numbers ' . ($div ? 'divided' : 'multiplied') . ' give a positive answer.'],
                 ['The answer should be $-' . ($div ? $a * $b * $b : $a + $b) . '$', 'Work out the size first: $' . ($div ? ($a * $b) . ' \\div ' . $b : $a . ' \\times ' . $b) . ' = ' . $true . '$.'],
                 ['The answer should be 0', 'The negatives do not cancel to zero; they make the answer positive.']],
                ['Same signs give a positive answer.', 'So the answer is $' . $true . '$.'],
                'Same signs or different signs?', 'reasoning', 35); },
        static function (MlbRng $r) { $c = $r->int(0, 1); $a = $r->int(2, 6); $h = $r->int(3, 8);
            if ($c === 0) return mlb_typed('num', 'The temperature falls by ' . $a . '°C every hour for ' . $h . ' hours. What is the total change? (A fall is negative.)', (string)(-$a * $h),
                ['Each hour the change is $-' . $a . '$.', '$' . $h . ' \\times (-' . $a . ') = -' . ($a * $h) . '$: the total change is $-' . ($a * $h) . '^\\circ$C.'], 'Repeated falls: multiply.', 'application', 35, ['unit' => '°C']);
            return mlb_typed('num', 'A diver goes down ' . $a . ' m every minute. Where is she after ' . $h . ' minutes, if the surface is 0? (Below the surface is negative.)', (string)(-$a * $h),
                ['Each minute she moves $-' . $a . '$ m.', '$' . $h . ' \\times (-' . $a . ') = -' . ($a * $h) . '$, so she is at $-' . ($a * $h) . '$ m.'], 'Going down repeatedly: multiply.', 'application', 35); },
    ],
    'MC-024' => [
        static function (MlbRng $r) { $a = $r->int(2, 12); $b = $r->int(2, 9); $c = $r->int(2, 6); $v = $r->int(0, 1);
            [$tex, $val, $s1] = $v === 0 ? ['(' . $a . ' + ' . $b . ') \\times ' . $c, ($a + $b) * $c, 'Brackets first: $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.']
                : [$a . ' \\times (' . ($b + $c + 1) . ' - ' . $c . ')', $a * ($b + 1), 'Brackets first: $' . ($b + $c + 1) . ' - ' . $c . ' = ' . ($b + 1) . '$.'];
            return mlb_typed('num', 'Find the value of $' . $tex . '$.', (string)$val, [$s1, 'Then multiply: ' . $val . '.'], 'What do you do first?', 'procedure', 30); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); $c = $r->int(2, 6); $t = ($a + $b) * $c;
            return mlb_mcq($r, 'Where do the brackets go to make this true? $' . $a . ' + ' . $b . ' \\times ' . $c . ' = ' . $t . '$', '$(' . $a . ' + ' . $b . ') \\times ' . $c . ' = ' . $t . '$',
                [['$' . $a . ' + (' . $b . ' \\times ' . $c . ') = ' . $t . '$', 'Those brackets change nothing: that is ' . ($a + $b * $c) . '.'],
                 ['No brackets are needed', 'Without brackets you multiply first and get ' . ($a + $b * $c) . '.'],
                 ['$' . $a . ' + ' . $b . ' \\times (' . $c . ' + 0) = ' . $t . '$', 'Adding 0 changes nothing: that is still ' . ($a + $b * $c) . '.']],
                ['Without brackets: $' . $a . ' + ' . ($b * $c) . ' = ' . ($a + $b * $c) . '$, which is wrong.', 'Adding first: $(' . $a . ' + ' . $b . ') \\times ' . $c . ' = ' . ($a + $b) . ' \\times ' . $c . ' = ' . $t . '$.'],
                'Try working out each choice.', 'reasoning', 40); },
        static function (MlbRng $r) { $a = $r->int(5, 20); $b = $r->int(2, 9); $c = $r->int(2, 9); $d = $r->int(1, 9); $bc = $b * $c; $v = $a + $bc - $d;
            $L = ['$' . $b . ' \\times ' . $c . ' = ' . $bc . '$', '$' . $a . ' + ' . $bc . ' = ' . ($a + $bc) . '$', '$' . ($a + $bc) . ' - ' . $d . ' = ' . $v . '$'];
            $ltr = ($a + $b) * $c; $slip = $a + $bc + $r->pick([-10, 10]);
            return mlb_error_of($r, 'Find the first mistake in this working for $' . $a . ' + ' . $b . ' \\times ' . $c . ' - ' . $d . '$.', $L, [
                [0, ['$' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$', '$' . ($a + $b) . ' \\times ' . $c . ' = ' . $ltr . '$', '$' . $ltr . ' - ' . $d . ' = ' . ($ltr - $d) . '$'],
                    'multiplication comes before addition, so $' . $b . ' \\times ' . $c . '$ is done first.'],
                [1, [$L[0], '$' . $a . ' + ' . $bc . ' = ' . $slip . '$', '$' . $slip . ' - ' . $d . ' = ' . ($slip - $d) . '$'], $a . ' + ' . $bc . ' is ' . ($a + $bc) . '.'],
                [2, [$L[0], $L[1], '$' . ($a + $bc) . ' - ' . $d . ' = ' . ($a + $bc + $d) . '$'], 'the ' . $d . ' is taken away, not added.'],
            ]); },
        static function (MlbRng $r) { [$who] = mlb_early_names($r, 1); $n = $r->int(2, 6); $p = 10 * $r->int(3, 15); $q = 50 * $r->int(1, 6);
            [$item, $one] = $r->pick([['pens', 'a ruler'], ['exercise books', 'a school bag tag'], ['sachets of water', 'a meat pie']]);
            return mlb_typed('num', $who . ' buys ' . $n . ' ' . $item . ' at ₦' . $p . ' each and ' . $one . ' for ₦' . $q . '. How much does ' . $who . ' spend altogether?', (string)($n * $p + $q),
                ['As one calculation: $' . $n . ' \\times ' . $p . ' + ' . $q . '$.', 'Multiply first: $' . ($n * $p) . ' + ' . $q . ' = ' . ($n * $p + $q) . '$.'],
                'Find the cost of the ' . $item . ' first.', 'application', 40, ['unit' => '₦']); },
        static function (MlbRng $r) { $c = $r->int(2, 5); $b = $c * $r->int(2, 6); $a = $b + $c * $r->int(2, 8);
            $x = $a - intdiv($b, $c); $y = intdiv($a - $b, $c); $L = '$' . $a . ' - ' . $b . ' \\div ' . $c . '$'; $R = '$(' . $a . ' - ' . $b . ') \\div ' . $c . '$';
            $right = $x === $y ? 'They are equal' : ($x > $y ? $L : $R);
            $why = 'Work out each: ' . $L . ' $= ' . $a . ' - ' . intdiv($b, $c) . ' = ' . $x . '$ and ' . $R . ' $= ' . ($a - $b) . ' \\div ' . $c . ' = ' . $y . '$.';
            $wrong = []; foreach ([$L, $R, 'They are equal'] as $o) if ($o !== $right) $wrong[] = [$o, $why];
            return mlb_mcq($r, 'Which has the larger value: ' . $L . ' or ' . $R . '?', $right, $wrong,
                ['Without brackets, divide first. With brackets, subtract first.', $why],
                'The brackets change the order.', 'concept', 40); },
    ],
    'MC-025' => [
        static function (MlbRng $r) { $n = $r->pick([4, 5, 6, 8, 10, 12]); $k = $r->int(1, $n - 1);
            return mlb_typed('frac', 'What fraction of the bar is NOT shaded? Give it in its lowest terms.', mlb_frac($n - $k, $n),
                ['There are ' . $n . ' equal parts. ' . $k . ' are shaded, so ' . ($n - $k) . ' are not.', 'That is $\\frac{' . ($n - $k) . '}{' . $n . '}$, which is $' . mlb_ftex($n - $k, $n) . '$ in lowest terms.'],
                'Count the white parts, and all the parts.', 'concept', 35, ['diagram' => ['type' => 'fractionbar', 'n' => $n, 'k' => $k], 'form' => 'lowest']); },
        static function (MlbRng $r) { $n = $r->int(3, 8); $k = $r->int(1, $n - 1);
            [$what, $who] = $r->pick([['oranges', 'children'], ['loaves of bread', 'friends'], ['pizzas', 'learners'], ['bars of chocolate', 'cousins']]);
            return mlb_typed('frac', $k . ' ' . ($k === 1 ? rtrim(preg_replace('/^(loaves)/', 'loaf', $what), 's') : $what) . ' ' . ($k === 1 ? 'is' : 'are') . ' shared equally among ' . $n . ' ' . $who . '. What fraction of one does each get?', mlb_frac($k, $n),
                ['Cut each one into ' . $n . ' equal pieces. That makes ' . ($k * $n) . ' pieces.', 'Each person gets ' . $k . ' pieces of size $\\frac{1}{' . $n . '}$: that is $\\frac{' . $k . '}{' . $n . '}$. So $' . $k . ' \\div ' . $n . ' = \\frac{' . $k . '}{' . $n . '}$.'],
                'Sharing ' . $k . ' among ' . $n . ' is $' . $k . ' \\div ' . $n . '$.', 'concept', 40); },
        static function (MlbRng $r) { do { $a = $r->int(2, 12); $b = $r->int(2, 12); } while ($a === $b); $top = $r->int(0, 2) === 0 ? $r->int(2, min($a, $b) - 1 > 1 ? min($a, $b) - 1 : 1) : 1;
            if ($top >= min($a, $b)) $top = 1;
            $fa = '$\\frac{' . $top . '}{' . $a . '}$'; $fb = '$\\frac{' . $top . '}{' . $b . '}$'; $big = $a < $b ? $fa : $fb; $small = $a < $b ? $fb : $fa;
            return mlb_mcq($r, 'Which is bigger: ' . $fa . ' or ' . $fb . '?', $big,
                [[$small, 'A bigger number on the bottom means the whole is cut into MORE pieces, so each piece is smaller.'], ['They are the same', 'The bottoms are different, so the pieces are different sizes.']],
                ['The tops are the same, so compare the size of the pieces.', 'Cutting into ' . min($a, $b) . ' pieces makes bigger pieces than cutting into ' . max($a, $b) . '. So ' . $big . ' is bigger.'],
                'Would you rather share a cake with ' . min($a, $b) . ' people or ' . max($a, $b) . '?', 'concept', 30); },
        static function (MlbRng $r) { $n = $r->pick([2, 3, 4, 5, 6, 8, 10]); $k = $r->int(1, $n - 1); $m = $n * $r->int(2, 9);
            [$what, $unit] = $r->pick([['sweets', ''], ['naira', '₦'], ['learners in a class', ''], ['kg of rice', '']]);
            return mlb_typed('num', 'What is $\\frac{' . $k . '}{' . $n . '}$ of ' . $m . ' ' . $what . '?', (string)($m / $n * $k),
                ['Find $\\frac{1}{' . $n . '}$ first: $' . $m . ' \\div ' . $n . ' = ' . ($m / $n) . '$.', 'Then ' . $k . ' of those: $' . $k . ' \\times ' . ($m / $n) . ' = ' . ($m / $n * $k) . '$.'],
                'Divide by the bottom, multiply by the top.', 'procedure', 35, $unit !== '' ? ['unit' => $unit] : []); },
    ],
    'MC-026' => [
        static function (MlbRng $r) { do { $b = $r->int(3, 9); $a = $r->int(1, $b - 1); } while (mlb_gcd($a, $b) !== 1); $m = $r->int(2, 5);
            $fr = static fn($p, $q) => '$\\frac{' . $p . '}{' . $q . '}$';
            return mlb_mcq($r, 'Which fraction is equal to ' . $fr($a, $b) . '?', $fr($a * $m, $b * $m),
                [[$fr($a + 1, $b + 1), 'Adding 1 to the top and bottom changes the fraction.'], [$fr($a + $m, $b + $m), 'Adding the same number to top and bottom changes the fraction. Multiply instead.'],
                 [$fr($a, $b * $m), 'Only the bottom was multiplied. The top must be multiplied by ' . $m . ' too.']],
                ['Multiply the top and the bottom by the same number.', $fr($a, $b) . ' $= \\frac{' . $a . ' \\times ' . $m . '}{' . $b . ' \\times ' . $m . '} = $ ' . $fr($a * $m, $b * $m) . '.'],
                'What could you multiply top and bottom by?', 'concept', 30); },
        static function (MlbRng $r) { [$n, $k] = $r->pick([[4, 2], [6, 2], [6, 3], [6, 4], [8, 2], [8, 4], [8, 6], [10, 4], [10, 5], [10, 6], [10, 8], [12, 3], [12, 4], [12, 6], [12, 8], [12, 9]]);
            $fr = static fn($p, $q) => '$\\frac{' . $p . '}{' . $q . '}$'; $g = mlb_gcd($k, $n); $sk = intdiv($k, $g); $sn = intdiv($n, $g);
            $w = [[$fr($k, $n - $k), 'That compares shaded to NOT shaded. A fraction compares shaded to all the parts.']];
            if (2 * $k !== $n) $w[] = [$fr($n - $k, $n), 'That is the part NOT shaded.']; else $w[] = [$fr($sk, $sn + 1), 'Count all the parts: the bottom is how many parts make the whole bar.'];
            if ($sk + 1 < $sn + 1 && mlb_gcd($sk + 1, $sn + 1) * 0 === 0 && ($sk + 1) * $n !== $k * ($sn + 1)) $w[] = [$fr($sk + 1, $sn + 1), 'Adding 1 to the top and bottom changes the fraction.'];
            return mlb_mcq($r, 'Which fraction is the same as the shaded part of the bar?', $fr($sk, $sn), $w,
                [$k . ' of the ' . $n . ' parts are shaded: ' . $fr($k, $n) . '.', 'Divide top and bottom by ' . $g . ': ' . $fr($k, $n) . ' $=$ ' . $fr($sk, $sn) . '.'],
                'Count the shaded parts and all the parts, then simplify.', 'concept', 35, ['diagram' => ['type' => 'fractionbar', 'n' => $n, 'k' => $k]]); },
        static function (MlbRng $r) { do { $b = $r->int(3, 8); $a = $r->int(1, $b - 1); } while (mlb_gcd($a, $b) !== 1); $k = $r->int(1, 4); [$who] = mlb_early_names($r, 1);
            $fr = static fn($p, $q) => '\\frac{' . $p . '}{' . $q . '}';
            return mlb_mcq($r, $who . ' says $' . $fr($a, $b) . ' = ' . $fr($a + $k, $b + $k) . '$ because ' . $k . ' was added to the top and the bottom. What is wrong?',
                'Adding the same number to top and bottom changes the fraction. Multiply top and bottom instead.',
                [['Nothing — it is right', '$' . $fr($a, $b) . '$ is about ' . mlb_dec(round($a / $b, 2)) . ' but $' . $fr($a + $k, $b + $k) . '$ is about ' . mlb_dec(round(($a + $k) / ($b + $k), 2)) . '.'],
                 ['Only the top should change', 'Changing only the top changes the fraction too.'],
                 [$who . ' should have taken ' . $k . ' away instead', 'Taking away the same number also changes the fraction.']],
                ['Equivalent fractions come from multiplying (or dividing) top and bottom by the same number.', 'For example $' . $fr($a, $b) . ' = ' . $fr(2 * $a, 2 * $b) . '$, but $' . $fr($a, $b) . ' \\ne ' . $fr($a + $k, $b + $k) . '$.'],
                'Draw both fractions as bars. Are they the same size?', 'reasoning', 40); },
        static function (MlbRng $r) { do { $b = $r->int(3, 9); $a = $r->int(1, $b - 1); } while (mlb_gcd($a, $b) !== 1); $m = $r->int(2, 6);
            return mlb_typed('num', 'Fill the box so the fractions are equal: $\\frac{\\square}{' . $b . '} = \\frac{' . ($a * $m) . '}{' . ($b * $m) . '}$', (string)$a,
                ['The bottom went from ' . ($b * $m) . ' to ' . $b . ': divided by ' . $m . '.', 'Divide the top by ' . $m . ' too: $' . ($a * $m) . ' \\div ' . $m . ' = ' . $a . '$.'],
                'What was the bottom divided by?', 'procedure', 30); },
    ],
    'MC-027' => [
        static function (MlbRng $r) { $d = $r->pick([3, 4, 5, 6, 8]); $w = $r->int(1, 4); $a = $r->int(1, $d - 2); $c = $r->int($a + 1, $d - 1);
            $num = $w * $d + $a - $c;
            return mlb_typed('frac', 'Work out $' . $w . '\\frac{' . $a . '}{' . $d . '} - \\frac{' . $c . '}{' . $d . '}$. You may give a mixed number.', mlb_frac($num, $d),
                ['$' . $w . '\\frac{' . $a . '}{' . $d . '} = \\frac{' . ($w * $d + $a) . '}{' . $d . '}$.', '$\\frac{' . ($w * $d + $a) . '}{' . $d . '} - \\frac{' . $c . '}{' . $d . '} = \\frac{' . $num . '}{' . $d . '}$' . ($num >= $d ? ' $= ' . intdiv($num, $d) . ($num % $d ? '\\frac{' . ($num % $d) . '}{' . $d . '}' : '') . '$' : '') . '.'],
                'Change the mixed number to an improper fraction first.', 'procedure', 45); },
        static function (MlbRng $r) { $d = $r->pick([2, 3, 4]); $k = $r->int(1, $d - 1); $n = $r->int(3, 9); while ($k * $n % $d === 0) $n++;
            [$what, $per] = $r->pick([['garri', 'cup'], ['rice', 'cup'], ['milk', 'litre'], ['palm oil', 'cup']]);
            return mlb_typed('frac', 'A recipe uses $\\frac{' . $k . '}{' . $d . '}$ ' . $per . ' of ' . $what . ' for each person. How many ' . $per . 's are needed for ' . $n . ' people?', mlb_frac($k * $n, $d),
                ['$' . $n . ' \\times \\frac{' . $k . '}{' . $d . '} = \\frac{' . ($k * $n) . '}{' . $d . '}$.', 'As a mixed number: $' . intdiv($k * $n, $d) . '\\frac{' . (($k * $n) % $d) . '}{' . $d . '}$ ' . $per . 's.'],
                'Multiply the top by ' . $n . '.', 'application', 45); },
        static function (MlbRng $r) { $L = $r->int(2, 6); $q = $r->pick([2, 3, 4, 5]); $drink = $r->pick(['zobo', 'kunu', 'orange juice']);
            return mlb_mcq($r, 'How many $\\frac{1}{' . $q . '}$-litre cups can be filled from ' . $L . ' litres of ' . $drink . '?', (string)($L * $q),
                [['$' . mlb_ftex($L, $q) . '$', 'That divides ' . $L . ' by ' . $q . '. Each litre fills ' . $q . ' cups, so the answer is MORE than ' . $L . '.'],
                 [(string)($L + $q), 'Adding does not count cups. Each litre fills ' . $q . ' cups.'], ['$' . mlb_ftex(1, $L * $q) . '$', 'That is the size of a tiny cup, not how many cups.']],
                ['Each litre fills ' . $q . ' cups of $\\frac{1}{' . $q . '}$ litre.', $L . ' litres fill $' . $L . ' \\times ' . $q . ' = ' . ($L * $q) . '$ cups. So $' . $L . ' \\div \\frac{1}{' . $q . '} = ' . ($L * $q) . '$.'],
                'How many cups does ONE litre fill?', 'concept', 40); },
    ],
    'MC-028' => [
        static function (MlbRng $r) { $t = $r->int(2, 8); $vals = [mlb_dec($t / 10), mlb_dec($t / 10 - 0.05 + $r->int(0, 4) / 1000), mlb_dec(($t - 1) / 10 + $r->int(11, 99) / 1000), mlb_dec(($t - 1) / 10 + $r->int(1, 9) / 100)];
            $vals = array_values(array_unique($vals)); $max = $vals[0]; foreach ($vals as $v) if ((float)$v > (float)$max) $max = $v;
            $w = []; foreach ($vals as $v) if ($v !== $max) $w[] = [$v, strlen($v) > strlen($max) ? 'More digits does not mean bigger. Compare the tenths first.' : 'Compare the tenths digit first.'];
            return mlb_mcq($r, 'Which of these is the largest?', $max, $w,
                ['Compare the tenths first, then the hundredths, then the thousandths.', $max . ' has the most tenths' . (strlen($max) < 4 ? ' — it is ' . $max . '0 with a zero added' : '') . '.'],
                'Write them all with the same number of decimal places.', 'concept', 35); },
        static function (MlbRng $r) { $c = $r->int(0, 2); $a = $r->int(1, 9); $b = $r->int(1, 9);
            if ($c === 0) return mlb_typed('num', 'Write ' . $a . ' tenths and ' . $b . ' hundredths as a decimal.', mlb_dec($a / 10 + $b / 100),
                ['Tenths go in the first place after the point, hundredths in the second.', '0.' . $a . $b . '.'], 'Use a place-value table.', 'procedure', 25);
            if ($c === 1) return mlb_typed('num', 'Write $\\frac{' . $b . '}{100}$ as a decimal.', mlb_dec($b / 100),
                ['$\\frac{' . $b . '}{100}$ is ' . $b . ' hundredths.', 'Hundredths are the second place after the point: 0.0' . $b . '.'], 'How many tenths are there?', 'procedure', 25);
            $w = $r->int(1, 20); return mlb_typed('num', 'Write $' . $w . '\\frac{' . $a . $b . '}{100}$ as a decimal.', mlb_dec($w + ($a * 10 + $b) / 100),
                [$a . $b . ' hundredths is ' . $a . ' tenths and ' . $b . ' hundredths.', 'So it is ' . mlb_dec($w + ($a * 10 + $b) / 100) . '.'], 'The whole number goes before the point.', 'procedure', 25); },
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(11, 10 * $a - 1); if ($b % 10 === 0) $b++; [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' says 0.' . $a . ' is smaller than 0.' . $b . ' because ' . $a . ' is smaller than ' . $b . '. Is ' . $who . ' right?',
                'No — 0.' . $a . ' is 0.' . $a . '0, which is more than 0.' . $b,
                [['Yes — ' . $b . ' is bigger than ' . $a, 'The digits after the point are not whole numbers: compare the tenths first.'],
                 ['Yes — 0.' . $b . ' has more digits', 'More digits does not make a decimal bigger.'],
                 ['No — they are equal', 'They are different numbers.']],
                ['0.' . $a . ' has ' . $a . ' tenths. 0.' . $b . ' has only ' . intdiv($b, 10) . ' tenths.', 'So 0.' . $a . ' is bigger. Writing 0.' . $a . '0 makes it easy to see.'],
                'Compare the tenths digits.', 'reasoning', 35); },
        static function (MlbRng $r) { $c = $r->int(0, 1); $w = $r->int(1, 9);
            if ($c === 0) { $x = $w + 0.9 + $r->int(1, 9) / 100; return mlb_typed('num', 'What number is 0.1 more than ' . mlb_dec($x) . '?', mlb_dec($x + 0.1),
                ['Adding 0.1 adds one tenth.', 'There are already 9 tenths, so the tenths make a whole: ' . mlb_dec($x) . ' + 0.1 = ' . mlb_dec($x + 0.1) . '.'], 'Which digit is the tenths digit?', 'procedure', 30); }
            $x = $w + $r->int(1, 9) / 10; return mlb_typed('num', 'What number is 0.01 less than ' . mlb_dec($x) . '?', mlb_dec($x - 0.01),
                ['0.01 is one hundredth. ' . mlb_dec($x) . ' is ' . number_format($x, 2, '.', '') . ' with 0 hundredths.', 'Exchange a tenth for 10 hundredths: ' . number_format($x, 2, '.', '') . ' − 0.01 = ' . mlb_dec($x - 0.01) . '.'], 'Write it with two decimal places first.', 'procedure', 30); },
    ],
    'MC-029' => [
        static function (MlbRng $r) { $a = $r->int(32, 95) / 10; $b = $r->int(105, (int)($a * 100) - 50) / 100; if (round($b * 100) % 10 === 0) $b += 0.05;
            $what = $r->pick([['ribbon', 'is cut off'], ['rope', 'is used to tie a goat'], ['piece of cloth', 'is used to make a cap']]);
            return mlb_typed('num', 'A ' . $what[0] . ' is ' . mlb_dec($a) . ' m long. ' . mlb_dec($b) . ' m ' . $what[1] . '. How much is left?', mlb_dec($a - $b),
                ['Line up the points: $' . number_format($a, 2, '.', '') . ' - ' . number_format($b, 2, '.', '') . '$. Fill the gap with a 0.', 'That leaves ' . mlb_dec($a - $b) . ' m.'],
                'Write ' . mlb_dec($a) . ' as ' . number_format($a, 2, '.', '') . ' first.', 'application', 40, ['unit' => 'm']); },
        static function (MlbRng $r) { $x = $r->int(12, 98) / 10; $op = $r->int(0, 2);
            [$tex, $v, $w] = [[mlb_dec($x) . ' \\times 10', $x * 10, [[mlb_dec($x) . '0', 'Adding a 0 on the end of a decimal does not multiply it.'], [mlb_dec($x / 10), 'That divides by 10.'], [mlb_dec($x * 100), 'That multiplies by 100.']]],
                [mlb_dec($x) . ' \\times 100', $x * 100, [[mlb_dec($x) . '00', 'Adding zeros on the end of a decimal does not change it.'], [mlb_dec($x * 10), 'That only multiplies by 10.'], [mlb_dec($x / 100), 'That divides by 100.']]],
                [mlb_dec($x) . ' \\div 10', $x / 10, [[mlb_dec($x * 10), 'That multiplies by 10.'], [mlb_dec($x / 100), 'That divides by 100.'], [mlb_dec($x - 10 > 0 ? $x - 10 : $x + 10), 'Dividing by 10 is not taking away 10.']]]][$op];
            return mlb_mcq($r, 'What is $' . $tex . '$?', mlb_dec($v), $w,
                [$op === 2 ? 'Dividing by 10 moves every digit one place to the right.' : 'Multiplying by ' . ($op === 0 ? '10' : '100') . ' moves every digit ' . ($op === 0 ? 'one place' : 'two places') . ' to the left.', '$' . $tex . ' = ' . mlb_dec($v) . '$.'],
                'Which way do the digits move?', 'concept', 30); },
        static function (MlbRng $r) { $b = $r->pick([2, 4, 5, 8, 20, 25]); do { $a = $r->int(1, $b - 1); } while (mlb_gcd($a, $b) !== 1);
            return mlb_typed('num', 'Write $\\frac{' . $a . '}{' . $b . '}$ as a decimal.', mlb_dec($a / $b),
                [$b === 8 ? 'Divide: $' . $a . ' \\div 8$. One eighth is 0.125.' : 'Make the bottom 10, 100 or 1000: $\\frac{' . $a . '}{' . $b . '} = \\frac{' . ($a * intdiv(($b <= 10 ? 10 : 100), $b)) . '}{' . ($b <= 10 ? 10 : 100) . '}$.',
                 'So $\\frac{' . $a . '}{' . $b . '} = ' . mlb_dec($a / $b) . '$.'],
                'Can you make the bottom 10 or 100?', 'procedure', 30); },
        static function (MlbRng $r) { $a = $r->int(3, 9) + $r->pick([-1, 1]) * $r->int(1, 2) / 10; $b = $r->int(3, 9) + $r->pick([-1, 1]) * $r->int(1, 2) / 10;
            $est = (int)round($a) * (int)round($b);
            return mlb_early_num_mcq($r, 'Which is the best estimate of $' . mlb_dec($a) . ' \\times ' . mlb_dec($b) . '$?', $est,
                [[$est * 10, 'That is ten times too big — check the place value.'], [(int)round($a) + (int)round($b), 'That adds the numbers.'], [(int)floor($a) * (int)floor($b) !== $est ? (int)floor($a) * (int)floor($b) : $est + 5, 'Round each number to the NEAREST whole number.']],
                [mlb_dec($a) . ' is about ' . (int)round($a) . ' and ' . mlb_dec($b) . ' is about ' . (int)round($b) . '.', 'So the answer is about $' . (int)round($a) . ' \\times ' . (int)round($b) . ' = ' . $est . '$ (exactly ' . mlb_dec(round($a * $b, 2)) . ').'],
                'Round each number to the nearest whole number.', 'concept', 30); },
    ],
    'MC-030' => [
        static function (MlbRng $r) { [$fa, $fb] = $r->pick([[3, 5], [2, 5], [1, 4], [3, 4], [7, 10], [1, 2], [4, 5], [3, 20], [9, 20]]); $fv = $fa / $fb;
            $d = mlb_dec($fv + $r->pick([-0.07, -0.03, 0.04, 0.06])); $p = (int)round($fv * 100) + $r->pick([-5, -2, 3, 8]);
            $items = [['$\\frac{' . $fa . '}{' . $fb . '}$', $fv], [$d, (float)$d], [$p . '%', $p / 100]];
            usort($items, static fn($x, $y) => $y[1] <=> $x[1]);
            if (abs($items[0][1] - $items[1][1]) < 1e-9) { $items[1] = [mlb_dec($items[1][1] - 0.01), $items[1][1] - 0.01]; }
            $w = []; foreach (array_slice($items, 1) as [$t, $v]) $w[] = [$t, $t . ' is ' . ((int)round($v * 100)) . '%, which is less.'];
            return mlb_mcq($r, 'Which is the largest: $\\frac{' . $fa . '}{' . $fb . '}$, ' . $d . ' or ' . $p . '%?', $items[0][0], $w,
                ['Write them all as percentages: $\\frac{' . $fa . '}{' . $fb . '} = ' . mlb_dec($fv * 100) . '\\%$, ' . $d . ' $= ' . mlb_dec((float)$d * 100) . '\\%$, and ' . $p . '%.', 'The largest is ' . $items[0][0] . '.'],
                'Change them all to the same form.', 'concept', 40); },
        static function (MlbRng $r) { $tot = $r->pick([20, 25, 40, 50]); $s = $r->int(intdiv($tot, 3), $tot - 1); [$who] = mlb_early_names($r, 1);
            $test = $r->pick(['a maths test', 'a spelling quiz', 'a science test']);
            return mlb_typed('num', $who . ' scored ' . $s . ' out of ' . $tot . ' in ' . $test . '. What is the score as a percentage?', mlb_dec($s * 100 / $tot),
                ['As a fraction: $\\frac{' . $s . '}{' . $tot . '}$.', 'Multiply top and bottom by ' . (100 / $tot) . ': $\\frac{' . mlb_dec($s * 100 / $tot) . '}{100} = ' . mlb_dec($s * 100 / $tot) . '\\%$.'],
                'Make the bottom 100.', 'application', 35, ['unit' => '%']); },
    ],
]; }

/* ═══ Stage 4 — Applied Arithmetic ═══ */
function mlb_early_stage4(): array { return [
    'MC-031' => [
        static function (MlbRng $r) { do { $a = $r->int(1, 5); $b = $r->int(2, 9); } while ($a === $b || mlb_gcd($a, $b) !== 1);
            [$p, $q, $mix] = $r->pick([['syrup', 'water', 'drink'], ['cement', 'sand', 'mix'], ['red beads', 'white beads', 'necklace'], ['boys', 'girls', 'class']]);
            return mlb_mcq($r, 'In a ' . $mix . ', the ratio of ' . $p . ' to ' . $q . ' is $' . $a . ':' . $b . '$. What fraction of the ' . $mix . ' is ' . $p . '?', '$' . mlb_ftex($a, $a + $b) . '$',
                [['$' . mlb_ftex($a, $b) . '$', 'That compares ' . $p . ' with ' . $q . '. A fraction compares a part with the WHOLE.'], ['$' . mlb_ftex($b, $a + $b) . '$', 'That is the fraction that is ' . $q . '.'],
                 ['$' . mlb_ftex($b, $a) . '$', 'That compares ' . $q . ' with ' . $p . ', the wrong way round.']],
                ['There are $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$ parts in the whole ' . $mix . '.', $a . ' of them are ' . $p . ': $' . mlb_ftex($a, $a + $b) . '$.'],
                'How many parts are there altogether?', 'concept', 35); },
        static function (MlbRng $r) { do { $a = $r->int(1, 7); $b = $r->int(2, 9); } while ($a === $b || mlb_gcd($a, $b) !== 1); $m = $r->int(2, 9); $giveB = $r->int(0, 1) === 1;
            [$p, $q, $place] = $r->pick([['boys', 'girls', 'a class'], ['goats', 'sheep', 'a farm'], ['red cars', 'white cars', 'a car park']]);
            return mlb_typed('num', 'In ' . $place . ', the ratio of ' . $p . ' to ' . $q . ' is $' . $a . ':' . $b . '$. There are ' . ($giveB ? ($b * $m) . ' ' . $q : ($a * $m) . ' ' . $p) . '. How many ' . ($giveB ? $p : $q) . ' are there?', (string)(($giveB ? $a : $b) * $m),
                ['One part is $' . ($giveB ? ($b * $m) . ' \\div ' . $b : ($a * $m) . ' \\div ' . $a) . ' = ' . $m . '$.', ($giveB ? $p : $q) . ' are ' . ($giveB ? $a : $b) . ' parts: $' . ($giveB ? $a : $b) . ' \\times ' . $m . ' = ' . (($giveB ? $a : $b) * $m) . '$.'],
                'Find the size of one part first.', 'application', 40); },
        static function (MlbRng $r) { do { $a = $r->int(1, 6); $b = $r->int(2, 9); } while ($a === $b || mlb_gcd($a, $b) !== 1); $m = $r->int(2, 4); $k = $r->int(2, 5);
            return mlb_mcq($r, 'Which ratio is equivalent to $' . ($a * $m) . ':' . ($b * $m) . '$?', '$' . ($a * $k) . ':' . ($b * $k) . '$',
                [['$' . ($a * $m + $k) . ':' . ($b * $m + $k) . '$', 'Adding the same number to both sides changes the ratio.'], ['$' . ($b * $m) . ':' . ($a * $m) . '$', 'The order matters: that is the ratio the other way round.'],
                 ['$' . ($a * $m) . ':' . ($b * $k) . '$', 'Both sides must be multiplied or divided by the same number.']],
                ['Simplify: $' . ($a * $m) . ':' . ($b * $m) . ' = ' . $a . ':' . $b . '$.', 'Multiply both sides by ' . $k . ': $' . ($a * $k) . ':' . ($b * $k) . '$.'],
                'Simplify both ratios and compare.', 'concept', 35); },
    ],
    'MC-032' => [
        static function (MlbRng $r) { $u1 = 10 * $r->int(15, 40); $d = $r->pick([-20, -10, 10, 20, 0]); $u2 = $u1 + $d; $n1 = $r->pick([2, 3, 4]); $n2 = $n1 + $r->int(1, 4);
            $what = $r->pick(['sachets of milk', 'tins of tomato paste', 'packets of noodles']);
            $A = 'A pack of ' . $n1 . ' for ₦' . mlb_p($n1 * $u1); $B = 'A pack of ' . $n2 . ' for ₦' . mlb_p($n2 * $u2);
            $right = $u1 === $u2 ? 'Both cost the same for each one' : ($u1 < $u2 ? $A : $B);
            $why = 'Find the cost of ONE in each: ₦' . $u1 . ' and ₦' . $u2 . '.';
            $wrong = []; foreach ([$A, $B, 'Both cost the same for each one'] as $o) if ($o !== $right) $wrong[] = [$o, $why . ' The cheaper pack is not always the better buy.'];
            return mlb_mcq($r, 'A shop sells ' . $what . ' in two packs. Which is the better buy?', $right, $wrong,
                ['Pack of ' . $n1 . ': $' . mlb_n($n1 * $u1) . ' \\div ' . $n1 . ' = ' . $u1 . '$ naira each. Pack of ' . $n2 . ': $' . mlb_n($n2 * $u2) . ' \\div ' . $n2 . ' = ' . $u2 . '$ naira each.', $u1 === $u2 ? 'They cost the same for each one.' : 'The better buy is the lower price for each one.'],
                'Work out the price of one in each pack.', 'application', 45); },
        static function (MlbRng $r) { $p = $r->pick([2, 4, 5, 6]); $g = $r->pick([150, 200, 250, 300, 400]); $u = $g / $p; while (floor($u) != $u) { $g += 50; $u = $g / $p; } $n = $r->int(3, 12); if ($n === $p) $n++;
            $what = $r->pick(['rice', 'beans', 'flour']);
            return mlb_typed('num', 'A recipe for ' . $p . ' people uses ' . $g . ' g of ' . $what . '. How many grams are needed for ' . $n . ' people?', (string)($u * $n),
                ['For one person: $' . $g . ' \\div ' . $p . ' = ' . mlb_n($u) . '$ g.', 'For ' . $n . ' people: $' . $n . ' \\times ' . mlb_n($u) . ' = ' . mlb_n($u * $n) . '$ g.'],
                'Find the amount for one person first.', 'application', 40, ['unit' => 'g']); },
        static function (MlbRng $r) { $n = $r->int(2, 6); $u = 50 * $r->int(4, 20); $m = $r->int(3, 12); if ($m === $n) $m++; $what = $r->pick(['metres of cloth', 'litres of kerosene', 'kg of sugar']);
            return mlb_early_num_mcq($r, 'If ' . $n . ' ' . $what . ' cost ₦' . mlb_p($n * $u) . ', how much do ' . $m . ' ' . $what . ' cost?', $m * $u,
                [[$n * $u + ($m - $n), 'Adding ' . ($m - $n) . ' more naira does not pay for ' . ($m - $n) . ' more. The cost grows in proportion.'],
                 [$n * $u * $m, 'That multiplies the cost of ' . $n . ' by ' . $m . '. Find the cost of ONE first.'],
                 [$n * $u + ($m - $n) * 10, 'The cost of each one is ₦' . mlb_p($u) . ', not ₦10.']],
                ['One costs $' . mlb_n($n * $u) . ' \\div ' . $n . ' = ' . mlb_n($u) . '$ naira.', $m . ' cost $' . $m . ' \\times ' . mlb_n($u) . ' = ' . mlb_n($m * $u) . '$ naira.'],
                'Find the cost of one first.', 'application', 40); },
    ],
    'MC-033' => [
        static function (MlbRng $r) { [$s1, $t1, $s2] = $r->pick([[60, 3, 90], [40, 3, 60], [60, 2, 40], [80, 3, 60], [90, 2, 60], [50, 6, 100], [45, 4, 60], [120, 2, 80]]); $d = $s1 * $t1;
            $from = $r->pick(['Ibadan', 'Ilorin', 'Enugu', 'Kaduna']);
            return mlb_typed('num', 'A journey from ' . $from . ' takes ' . $t1 . ' hours at ' . $s1 . ' km/h. How many hours would it take at ' . $s2 . ' km/h?', mlb_dec($d / $s2),
                ['The distance is $' . $s1 . ' \\times ' . $t1 . ' = ' . $d . '$ km.', 'At ' . $s2 . ' km/h: $' . $d . ' \\div ' . $s2 . ' = ' . mlb_dec($d / $s2) . '$ hours. Faster means less time.'],
                'Find the distance first. It does not change.', 'application', 45); },
        static function (MlbRng $r) { $sets = [
                ['More workers, less time to finish the same job', [['More loaves of bread, more money to pay', 'Both go up together: that is DIRECT proportion.'], ['More hours worked, more pay', 'Both go up together: that is direct proportion.'], ['Taller children, bigger shoe sizes', 'These often go up together, but not in exact proportion.']]],
                ['A faster car, a shorter time for the same trip', [['A longer trip, more fuel used', 'Both go up together: direct proportion.'], ['More books, a heavier bag', 'Both go up together: direct proportion.'], ['More learners, more chairs needed', 'Both go up together: direct proportion.']]],
                ['More children sharing a cake, a smaller piece each', [['More eggs, a bigger cake', 'Both go up together: direct proportion.'], ['More days, more water drunk', 'Both go up together: direct proportion.'], ['More pages, a thicker book', 'Both go up together: direct proportion.']]]];
            [$right, $w] = $r->pick($sets);
            return mlb_mcq($r, 'Which of these is an example of INVERSE proportion?', $right, $w,
                ['In inverse proportion, when one quantity goes up the other goes down, and their product stays the same.', $right . ': one goes up, the other goes down.'],
                'When one goes up, does the other go up or down?', 'concept', 30); },
        static function (MlbRng $r) { [$c1, $d1, $c2] = $r->pick([[12, 10, 15], [10, 12, 15], [8, 15, 12], [20, 6, 24], [6, 20, 8], [15, 8, 20], [9, 8, 12], [24, 5, 20]]);
            $place = $r->pick(['a camp', 'a boarding house', 'a farm hostel']);
            return mlb_typed('num', 'Food at ' . $place . ' lasts ' . $d1 . ' days for ' . $c1 . ' children. How many days would the same food last for ' . $c2 . ' children?', mlb_dec($c1 * $d1 / $c2),
                ['The food is $' . $c1 . ' \\times ' . $d1. ' = ' . ($c1 * $d1) . '$ child-days.', 'For ' . $c2 . ' children: $' . ($c1 * $d1) . ' \\div ' . $c2 . ' = ' . mlb_dec($c1 * $d1 / $c2) . '$ days.'],
                'More children eat it faster. Will the answer be more or fewer days?', 'application', 45, ['unit' => 'days']); },
        static function (MlbRng $r) { $t = $r->pick([2, 3, 4]); $k = $r->pick([2, 3]); $h = $k * $r->pick([2, 3, 4]); [$who] = mlb_early_names($r, 1); $T = $t * $k;
            return mlb_mcq($r, $who . ' says: “' . $t . ' taps fill a tank in ' . $h . ' hours, so ' . $T . ' taps take ' . ($h * $k) . ' hours.” What is wrong?',
                'More taps fill it faster: ' . $T . ' taps take ' . mlb_dec($h / $k) . ' hours',
                [['Nothing — it is right', 'More taps cannot make the tank take LONGER to fill.'],
                 ['It should be ' . ($h + $T - $t) . ' hours', 'Adding taps does not add hours. Find the tap-hours first.'],
                 ['It should be ' . $h . ' hours — the number of taps does not matter', 'More taps let in more water each hour.']],
                ['The job is $' . $t . ' \\times ' . $h . ' = ' . ($t * $h) . '$ tap-hours.', $T . ' taps take $' . ($t * $h) . ' \\div ' . $T . ' = ' . mlb_dec($h / $k) . '$ hours.'],
                'Does more taps mean more time or less?', 'reasoning', 40); },
    ],
    'MC-034' => [
        static function (MlbRng $r) { $km = $r->int(11, 19) / 10; $m = 100 * $r->int(8, 19); $cm = 1000 * $r->int(80, 190); $mm = 10000 * $r->int(80, 190);
            $vals = [[mlb_dec($km) . ' km', $km * 1000], [mlb_p($m) . ' m', $m], [mlb_p($cm) . ' cm', $cm / 100], [mlb_p($mm) . ' mm', $mm / 1000]];
            $by = []; foreach ($vals as [$t, $v]) $by[(string)$v] = $t; if (count($by) < 4) { $vals[1] = [mlb_p($m + 50) . ' m', $m + 50]; }
            usort($vals, static fn($x, $y) => $y[1] <=> $x[1]);
            $w = []; foreach (array_slice($vals, 1) as [$t, $v]) $w[] = [$t, $t . ' is ' . mlb_p($v) . ' m.'];
            return mlb_mcq($r, 'Which length is the longest?', $vals[0][0], $w,
                ['Change them all to metres: ' . implode(', ', array_map(static fn($x) => $x[0] . ' = ' . mlb_p($x[1]) . ' m', $vals)) . '.', 'The longest is ' . $vals[0][0] . '.'],
                'Change them all to the same unit first.', 'concept', 45); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            if ($c === 0) { $l = $r->int(12, 95) / 10; return mlb_typed('num', 'How many millilitres are there in ' . mlb_dec($l) . ' litres?', mlb_dec($l * 1000),
                ['1 litre = 1,000 ml.', '$' . mlb_dec($l) . ' \\times 1{,}000 = ' . mlb_n($l * 1000) . '$ ml.'], 'Litres are bigger, so the number of millilitres is bigger.', 'procedure', 30); }
            $ml = 50 * $r->int(3, 79); return mlb_typed('num', 'Change ' . mlb_p($ml) . ' ml to litres.', mlb_dec($ml / 1000),
                ['1,000 ml = 1 litre.', '$' . mlb_n($ml) . ' \\div 1{,}000 = ' . mlb_dec($ml / 1000) . '$ litres.'], 'Litres are bigger, so the number gets smaller.', 'procedure', 30); },
        static function (MlbRng $r) { [$b, $L] = $r->pick([[250, 2], [250, 3], [500, 4], [750, 6], [750, 3], [500, 7], [250, 5], [200, 3], [400, 2]]); $drink = $r->pick(['zobo', 'water', 'orange juice']);
            return mlb_typed('num', 'A bottle holds ' . $b . ' ml. How many bottles can be filled with ' . $L . ' litres of ' . $drink . '?', (string)($L * 1000 / $b),
                [$L . ' litres = ' . mlb_p($L * 1000) . ' ml.', '$' . mlb_n($L * 1000) . ' \\div ' . $b . ' = ' . ($L * 1000 / $b) . '$ bottles.'],
                'Change the litres to millilitres first.', 'application', 40); },
        static function (MlbRng $r) { $c = $r->int(0, 1); $x = $r->int(15, 95) / 10; [$who] = mlb_early_names($r, 1);
            [$from, $to, $right, $bad, $fact] = $c === 0 ? ['kg', 'g', $x * 1000, $x * 100, '1 kg = 1,000 g'] : ['m', 'cm', $x * 100, $x * 10, '1 m = 100 cm'];
            return mlb_mcq($r, $who . ' changes ' . mlb_dec($x) . ' ' . $from . ' to ' . $to . ' and gets ' . mlb_p($bad) . ' ' . $to . '. What went wrong?',
                $who . ' used the wrong factor: ' . $fact . ', so it is ' . mlb_p($right) . ' ' . $to,
                [['Nothing — it is right', 'Check: ' . $fact . '.'], [$who . ' should have divided', 'A big unit to a small unit makes the number BIGGER: multiply.'],
                 ['It should be ' . mlb_p($right * 10) . ' ' . $to, 'That multiplies by ten times too much.']],
                [$fact . '.', '$' . mlb_dec($x) . ' \\times ' . ($c === 0 ? '1{,}000' : '100') . ' = ' . mlb_n($right) . '$ ' . $to . '.'],
                'How many ' . $to . ' make one ' . $from . '?', 'reasoning', 35); },
    ],
    'MC-035' => [
        static function (MlbRng $r) { $a = $r->pick([2, 3, 4, 5, 6, 7, 8, 9]) * 10 + $r->pick([-2, -1, 1, 2]); $b = $r->pick([2, 3, 4, 5, 6]) * 10 + $r->pick([-2, -1, 1, 2]);
            $ra = (int)round($a, -1); $rb = (int)round($b, -1); $est = $ra * $rb;
            return mlb_early_num_mcq($r, 'Estimate $' . $a . ' \\times ' . $b . '$ by rounding each number to 1 significant figure.', $est,
                [[intdiv($a, 10) * 10 * (intdiv($b, 10) * 10) !== $est ? intdiv($a, 10) * 10 * (intdiv($b, 10) * 10) : ($ra + 10) * $rb, 'Round each number to the NEAREST ten: ' . $ra . ' and ' . $rb . '.'], [$ra * $rb / 10, 'Check the zeros: $' . $ra . ' \\times ' . $rb . '$ has two of them.'],
                 [$ra + $rb, 'That adds instead of multiplying.']],
                [$a . ' ≈ ' . $ra . ' and ' . $b . ' ≈ ' . $rb . '.', '$' . $ra . ' \\times ' . $rb . ' = ' . mlb_n($est) . '$ (exactly ' . mlb_p($a * $b) . ').'],
                'Round each number to the nearest ten first.', 'concept', 35); },
        static function (MlbRng $r) { $dp = $r->int(1, 2); $x = $r->int(1001, 9999) / 1000; while (abs(round($x * 10 ** $dp) - $x * 10 ** $dp) < 1e-9) $x += 0.001;
            $v = round($x, $dp);
            return mlb_typed('num', 'Round ' . mlb_dec($x) . ' to ' . $dp . ' decimal place' . ($dp > 1 ? 's' : '') . '.', mlb_dec($v),
                ['Keep ' . $dp . ' digit' . ($dp > 1 ? 's' : '') . ' after the point and look at the next digit.', 'It is ' . substr(number_format($x, 3, '.', ''), 2 + $dp, 1) . ', so round ' . ((int)substr(number_format($x, 3, '.', ''), 2 + $dp, 1) >= 5 ? 'up' : 'down') . ': ' . number_format($v, $dp, '.', '') . '.'],
                '5 or more rounds up.', 'procedure', 30); },
        static function (MlbRng $r) { $a = $r->int(210, 890); $b = $r->int(3, 9); [$who] = mlb_early_names($r, 1); $est = (int)round($a, -2) * $b; $bad = $r->pick([intdiv($a * $b, 10), $a * $b * 10]);
            return mlb_mcq($r, $who . ' works out $' . $a . ' \\times ' . $b . '$ and gets ' . mlb_p($bad) . '. Is that a sensible answer?', 'No — it should be about ' . mlb_p($est),
                [['Yes — it looks about right', $a . ' is about ' . (int)round($a, -2) . ', and $' . (int)round($a, -2) . ' \\times ' . $b . ' = ' . mlb_p($est) . '$.'],
                 ['No — it should be about ' . mlb_p($est * 10), 'That estimate is ten times too big.'], ['No — it should be about ' . mlb_p(intdiv($est, 10)), 'That estimate is ten times too small.']],
                ['Estimate: $' . $a . ' \\approx ' . (int)round($a, -2) . '$, so the answer is about $' . (int)round($a, -2) . ' \\times ' . $b . ' = ' . mlb_n($est) . '$.', mlb_p($bad) . ' is ten times ' . ($bad > $est ? 'too big' : 'too small') . '. The exact answer is ' . mlb_p($a * $b) . '.'],
                'Round ' . $a . ' to the nearest hundred and estimate.', 'reasoning', 40); },
    ],
    'MC-036' => [
        static function (MlbRng $r) { $to = $r->pick([10, 100]); $v = $to * $r->int(3, 9); $lo = $v - $to / 2; $hi = $v + $to / 2; $in = $r->int((int)$lo, (int)$hi - 1);
            $unit = $to === 10 ? 'kg' : 'g'; $what = $to === 10 ? 'A bag of cement weighs' : 'A loaf of bread weighs';
            return mlb_early_num_mcq($r, $what . ' ' . $v . ' ' . $unit . ', to the nearest ' . $to . ' ' . $unit . '. Which could be its real mass, in ' . $unit . '?', $in,
                [[(int)$hi, mlb_p($hi) . ' rounds UP to ' . ($v + $to) . ', so it is not allowed.'], [(int)$lo - $r->int(1, $to / 2), 'That rounds to ' . ($v - $to) . '.'], [(int)$hi + $r->int(1, $to / 2), 'That rounds to ' . ($v + $to) . '.']],
                ['To the nearest ' . $to . ', the mass is at least ' . mlb_p($lo) . ' and less than ' . mlb_p($hi) . '.', mlb_p($in) . ' is in that range.'],
                'Half of ' . $to . ' either side of ' . $v . '.', 'concept', 35); },
        static function (MlbRng $r) { $to = $r->pick([10, 100, 1000]); $v = $to * $r->int(12, 98); $low = $r->int(0, 1) === 1;
            $what = $r->pick(['A crowd at a football match is', 'The number of people at a church harvest is', 'The number of learners in a district is']);
            return mlb_typed('num', $what . ' ' . mlb_p($v) . ', to the nearest ' . mlb_p($to) . '. What is the ' . ($low ? 'smallest number it could be' : 'upper bound') . '?', (string)($low ? $v - $to / 2 : $v + $to / 2),
                ['To the nearest ' . mlb_p($to) . ' means it could be up to half of ' . mlb_p($to) . ', which is ' . mlb_p($to / 2) . ', either way.', ($low ? 'Smallest: $' . mlb_n($v) . ' - ' . mlb_n($to / 2) : 'Upper bound: $' . mlb_n($v) . ' + ' . mlb_n($to / 2)) . ' = ' . mlb_n($low ? $v - $to / 2 : $v + $to / 2) . '$.'],
                'What is half of ' . mlb_p($to) . '?', 'procedure', 35); },
        static function (MlbRng $r) { $x = $r->int(21, 99) / 10; $low = $r->int(0, 1) === 1;
            return mlb_typed('num', 'A length is ' . mlb_dec($x) . ' cm, correct to 1 decimal place. What is its ' . ($low ? 'lower' : 'upper') . ' bound?', mlb_dec($low ? $x - 0.05 : $x + 0.05),
                ['To 1 decimal place means to the nearest 0.1 cm, so it could be up to 0.05 cm either way.', ($low ? '$' . mlb_dec($x) . ' - 0.05 = ' : '$' . mlb_dec($x) . ' + 0.05 = ') . mlb_dec($low ? $x - 0.05 : $x + 0.05) . '$ cm.'],
                'Half of 0.1 is 0.05.', 'procedure', 35, ['unit' => 'cm']); },
        static function (MlbRng $r) { $a = $r->int(15, 40); $b = $r->int(10, 35); $max = $r->int(0, 1) === 1;
            $v = $max ? $a + $b + 1 : $a + $b - 1;
            return mlb_early_num_mcq($r, 'Two planks are ' . $a . ' cm and ' . $b . ' cm long, each to the nearest cm. What is the ' . ($max ? 'greatest' : 'least') . ' their total length could be?', $v,
                [[$a + $b, 'That is the total of the rounded lengths. Each could be up to 0.5 cm ' . ($max ? 'longer' : 'shorter') . '.'],
                 [$max ? $a + $b + 0.5 : $a + $b - 0.5, 'Both planks can be 0.5 cm ' . ($max ? 'longer' : 'shorter') . ', not just one.'], [$max ? $a + $b - 1 : $a + $b + 1, 'That is the ' . ($max ? 'least' : 'greatest') . ' total.']],
                ['Each plank could be up to 0.5 cm ' . ($max ? 'longer' : 'shorter') . ': ' . mlb_dec($max ? $a + 0.5 : $a - 0.5) . ' cm and ' . mlb_dec($max ? $b + 0.5 : $b - 0.5) . ' cm.', 'Total: ' . $v . ' cm.'],
                'Use the ' . ($max ? 'upper' : 'lower') . ' bound of each.', 'reasoning', 40); },
    ],
    'MC-037' => [
        static function (MlbRng $r) { $cp = 500 * $r->int(2, 20); $p = $r->pick([10, 20, 25, 30, 40, 50]); $what = $r->pick(['a pair of sandals', 'a bag of rice', 'a school bag', 'a radio']);
            return mlb_typed('num', 'A trader buys ' . $what . ' for ₦' . mlb_p($cp) . ' and wants a ' . $p . '% profit. What should the selling price be?', (string)($cp * (100 + $p) / 100),
                ['Profit $= ' . $p . '\\%$ of ₦' . mlb_p($cp) . ' $= ' . mlb_n($cp * $p / 100) . '$.', 'Selling price $= ' . mlb_n($cp) . ' + ' . mlb_n($cp * $p / 100) . ' = ' . mlb_n($cp * (100 + $p) / 100) . '$ naira.'],
                'Find the profit first, then add it on.', 'application', 40, ['unit' => '₦']); },
        static function (MlbRng $r) { $s = 10000 * $r->int(2, 30); $c = $r->pick([2, 4, 5, 8, 10]); $who = $r->pick(['A sales agent', 'An estate agent', 'A market agent']);
            return mlb_typed('num', $who . ' earns ' . $c . '% commission on sales. This month the sales are ₦' . mlb_p($s) . '. How much commission is earned?', (string)($s * $c / 100),
                ['Commission $= ' . $c . '\\%$ of ₦' . mlb_p($s) . '.', '$\\frac{' . $c . '}{100} \\times ' . mlb_n($s) . ' = ' . mlb_n($s * $c / 100) . '$ naira.'],
                'Find 1% first, then ' . $c . '%.', 'application', 35, ['unit' => '₦']); },
        static function (MlbRng $r) { [$cp, $sp] = $r->pick([[800, 1000], [400, 500], [1200, 1500], [2000, 2500], [600, 750], [1000, 1250], [500, 600], [1500, 1800]]);
            $pr = $sp - $cp; $pct = $pr * 100 / $cp;
            return mlb_mcq($r, 'A trader buys a basket of tomatoes for ₦' . mlb_p($cp) . ' and sells it for ₦' . mlb_p($sp) . '. What is the percentage profit?', mlb_dec($pct) . '%',
                [[mlb_dec(round($pr * 100 / $sp, 1)) . '%', 'That divides the profit by the SELLING price. Percentage profit is on the cost price.'], ['₦' . mlb_p($pr), 'That is the profit in naira, not as a percentage.'],
                 [mlb_dec(round($cp * 100 / $sp, 1)) . '%', 'That compares the two prices, not the profit.']],
                ['Profit $= ' . mlb_n($sp) . ' - ' . mlb_n($cp) . ' = ' . mlb_n($pr) . '$.', 'Percentage profit $= \\frac{' . mlb_n($pr) . '}{' . mlb_n($cp) . '} \\times 100 = ' . mlb_dec($pct) . '\\%$.'],
                'Compare the profit with what the trader paid.', 'application', 45); },
        static function (MlbRng $r) { [$cp, $sp] = $r->pick([[800, 1000], [400, 500], [2000, 2500], [500, 600], [1000, 1250], [1500, 1800], [2500, 3000]]); $pr = $sp - $cp; $pct = $pr * 100 / $cp;
            $L = ['Profit $= ' . mlb_n($sp) . ' - ' . mlb_n($cp) . ' = ' . mlb_n($pr) . '$', 'Profit % $= \\frac{' . mlb_n($pr) . '}{' . mlb_n($cp) . '} \\times 100$', '$= ' . mlb_dec($pct) . '\\%$'];
            $wrongBase = $pr * 100 / $sp;
            return mlb_error_of($r, 'A phone is bought for ₦' . mlb_p($cp) . ' and sold for ₦' . mlb_p($sp) . '. Find the first mistake in this working for the percentage profit.', $L, [
                [0, ['Profit $= ' . mlb_n($sp) . ' + ' . mlb_n($cp) . ' = ' . mlb_n($sp + $cp) . '$', 'Profit % $= \\frac{' . mlb_n($sp + $cp) . '}{' . mlb_n($cp) . '} \\times 100$', '$= ' . mlb_dec(($sp + $cp) * 100 / $cp) . '\\%$'],
                    'profit is the selling price MINUS the cost price.'],
                [1, [$L[0], 'Profit % $= \\frac{' . mlb_n($pr) . '}{' . mlb_n($sp) . '} \\times 100$', '$= ' . mlb_dec(round($wrongBase, 2)) . '\\%$'], 'percentage profit is worked out on the COST price, ₦' . mlb_p($cp) . '.'],
                [2, [$L[0], $L[1], '$= ' . mlb_dec($pct * 10) . '\\%$'], '$\\frac{' . mlb_n($pr) . '}{' . mlb_n($cp) . '} \\times 100 = ' . mlb_dec($pct) . '$.'],
            ]); },
    ],
    'MC-038' => [
        static function (MlbRng $r) { $P = 1000 * $r->int(5, 60); $R = $r->pick([5, 8, 10, 12, 15]); $T = $r->int(2, 5); $I = $P * $R * $T / 100;
            return mlb_typed('num', '₦' . mlb_p($P) . ' is saved for ' . $T . ' years at ' . $R . '% simple interest per year. What is the total amount at the end?', (string)($P + $I),
                ['Interest $= \\frac{' . mlb_n($P) . ' \\times ' . $R . ' \\times ' . $T . '}{100} = ' . mlb_n($I) . '$.', 'Amount = principal + interest $= ' . mlb_n($P) . ' + ' . mlb_n($I) . ' = ' . mlb_n($P + $I) . '$.'],
                'The amount includes the money you started with.', 'application', 45, ['unit' => '₦']); },
        static function (MlbRng $r) { $P = 1000 * $r->int(5, 50); do { $r1 = $r->int(3, 10); $t1 = $r->int(2, 6); $r2 = $r->int(3, 10); $t2 = $r->int(2, 6); } while ($r1 === $r2 && $t1 === $t2);
            if ($r->int(0, 2) === 0) { $r2 = $t1; $t2 = $r1; if ($r2 === $r1) { $r2++; $t2 = $t1; } }
            $i1 = $P * $r1 * $t1 / 100; $i2 = $P * $r2 * $t2 / 100;
            $A = $r1 . '% for ' . $t1 . ' years'; $B = $r2 . '% for ' . $t2 . ' years';
            $right = $i1 === $i2 ? 'Both earn the same' : ($i1 > $i2 ? $A : $B);
            $why = 'Work out both: ₦' . mlb_p($i1) . ' and ₦' . mlb_p($i2) . '.';
            $wrong = []; foreach ([$A, $B, 'Both earn the same'] as $o) if ($o !== $right) $wrong[] = [$o, $why];
            return mlb_mcq($r, '₦' . mlb_p($P) . ' is saved at simple interest. Which earns more interest: ' . $A . ', or ' . $B . '?', $right, $wrong,
                ['Simple interest is $\\frac{P \\times R \\times T}{100}$, and P is the same, so compare $R \\times T$.', '$' . $r1 . ' \\times ' . $t1 . ' = ' . ($r1 * $t1) . '$ and $' . $r2 . ' \\times ' . $t2 . ' = ' . ($r2 * $t2) . '$. ' . $why],
                'Compare rate × time for each.', 'reasoning', 40); },
    ],
    'MC-039' => [
        static function (MlbRng $r) { $s = $r->pick([30, 40, 45, 50, 60, 80]); $t = $r->pick([2, 3, 4, 1.5, 2.5]); $v = $r->pick(['A danfo', 'A lorry', 'A train', 'A keke']);
            return mlb_typed('num', $v . ' travels at an average speed of ' . $s . ' km/h for ' . mlb_dec($t) . ' hours. How far does it go?', mlb_dec($s * $t),
                ['Distance = speed × time.', '$' . $s . ' \\times ' . mlb_dec($t) . ' = ' . mlb_dec($s * $t) . '$ km.'],
                'Each hour it goes ' . $s . ' km.', 'application', 35, ['unit' => 'km']); },
        static function (MlbRng $r) { $s = $r->pick([3, 4, 5, 6]); $d = $s * $r->pick([0.5, 1, 1.5, 2, 2.5]); [$who] = mlb_early_names($r, 1);
            return mlb_typed('num', $who . ' walks ' . mlb_dec($d) . ' km to school at ' . $s . ' km/h. How many minutes does the walk take?', (string)(int)round($d / $s * 60),
                ['Time = distance ÷ speed $= ' . mlb_dec($d) . ' \\div ' . $s . ' = ' . mlb_dec($d / $s) . '$ hours.', mlb_dec($d / $s) . ' hours $= ' . mlb_dec($d / $s) . ' \\times 60 = ' . (int)round($d / $s * 60) . '$ minutes.'],
                'Find the time in hours, then change it to minutes.', 'application', 45, ['unit' => 'min']); },
        static function (MlbRng $r) { $want = $r->int(0, 2); $w = ['speed', 'time', 'distance'][$want];
            $right = ['$\\text{distance} \\div \\text{time}$', '$\\text{distance} \\div \\text{speed}$', '$\\text{speed} \\times \\text{time}$'][$want];
            $all = ['$\\text{distance} \\div \\text{time}$', '$\\text{distance} \\div \\text{speed}$', '$\\text{speed} \\times \\text{time}$', '$\\text{distance} \\times \\text{time}$', '$\\text{time} \\div \\text{distance}$'];
            $w2 = []; foreach ($all as $o) if ($o !== $right) $w2[] = [$o, 'Check with the units: speed is km per hour, so km = (km/h) × h.'];
            $ctx = ['speed' => 'A cyclist rides 24 km in 2 hours. Which calculation gives the cyclist’s speed?', 'time' => 'A bus travels 150 km at 50 km/h. Which calculation gives the time taken?', 'distance' => 'A train moves at 80 km/h for 3 hours. Which calculation gives the distance?'][$w];
            return mlb_mcq($r, $ctx, $right, array_slice($r->shuffle($w2), 0, 3),
                ['Speed = distance ÷ time. Rearranged: time = distance ÷ speed, and distance = speed × time.', 'So the ' . $w . ' is ' . $right . '.'],
                'Think about the units: km/h means km ÷ h.', 'concept', 30); },
        static function (MlbRng $r) { [$what, $d] = $r->pick([['a stone', $r->int(2, 3)], ['a brick', 2], ['a block of iron', 8], ['a block of copper', 9], ['a lump of clay', 2], ['a block of aluminium', 3], ['a bar of lead', 11]]); $v = 10 * $r->int(2, 20);
            return mlb_typed('num', ucfirst($what) . ' has a mass of ' . mlb_p($d * $v) . ' g and a volume of ' . $v . ' cm³. What is its density in g/cm³?', (string)$d,
                ['Density = mass ÷ volume.', '$' . ($d * $v) . ' \\div ' . $v . ' = ' . $d . '$ g/cm³.'],
                'How many grams in each cm³?', 'application', 35, ['unit' => 'g/cm³']); },
        static function (MlbRng $r) { [$p, $q] = mlb_early_names($r, 2); $t1 = $r->pick([10, 20, 25]); $s1 = $r->pick([4, 5, 6]); $t2 = $r->pick([10, 20, 25, 30]); $s2 = $r->pick([4, 5, 6]); if ($s1 === $s2 && $r->int(0, 1)) $s2++;
            $d1 = $s1 * $t1; $d2 = $s2 * $t2;
            $right = $s1 === $s2 ? 'They are equally fast' : ($s1 > $s2 ? $p : $q);
            $why = $p . ' runs ' . $s1 . ' m each second and ' . $q . ' runs ' . $s2 . ' m each second.';
            $wrong = []; foreach ([$p, $q, 'They are equally fast'] as $o) if ($o !== $right) $wrong[] = [$o, $why];
            return mlb_mcq($r, $p . ' runs ' . $d1 . ' m in ' . $t1 . ' seconds. ' . $q . ' runs ' . $d2 . ' m in ' . $t2 . ' seconds. Who is faster?', $right, $wrong,
                ['Compare speeds: metres per second.', $p . ': $' . $d1 . ' \\div ' . $t1 . ' = ' . $s1 . '$ m/s. ' . $q . ': $' . $d2 . ' \\div ' . $t2 . ' = ' . $s2 . '$ m/s.'],
                'The one who runs further is not always faster.', 'reasoning', 40); },
    ],
    'MC-040' => [
        static function (MlbRng $r) { $c = $r->int(5, 15); $per = $r->pick([12, 20, 24]); $used = $r->int(intdiv($c * $per, 4), intdiv($c * $per * 3, 4));
            $ev = $r->pick(['sports day', 'the end-of-term party', 'the inter-house competition']);
            return mlb_typed('num', 'A school buys ' . $c . ' crates of drinks. Each crate has ' . $per . ' bottles. ' . $used . ' bottles are used at ' . $ev . '. How many bottles are left?', (string)($c * $per - $used),
                ['Total bottles: $' . $c . ' \\times ' . $per . ' = ' . ($c * $per) . '$.', 'Left: $' . ($c * $per) . ' - ' . $used . ' = ' . ($c * $per - $used) . '$.'],
                'Two steps: how many altogether, then how many are left.', 'application', 50); },
        static function (MlbRng $r) { $n = $r->int(3, 6); $p = 50 * $r->int(4, 12); $pay = 1000 * $r->int(3, 5); [$who] = mlb_early_names($r, 1);
            return mlb_mcq($r, $who . ' buys ' . $n . ' notebooks at ₦' . $p . ' each and pays with ₦' . mlb_p($pay) . '. Which plan finds the change?',
                'Multiply ' . $n . ' by ₦' . $p . ', then take the answer from ₦' . mlb_p($pay),
                [['Take ₦' . $p . ' from ₦' . mlb_p($pay) . ', then multiply by ' . $n, 'The cost of ALL the notebooks must come off, not one.'],
                 ['Add ' . $n . ' and ₦' . $p . ', then take it from ₦' . mlb_p($pay), 'Adding the number of notebooks to the price does not give the cost.'],
                 ['Divide ₦' . mlb_p($pay) . ' by ' . $n, 'That shares the money, it does not find the change.']],
                ['Step 1: the cost is $' . $n . ' \\times ' . $p . ' = ' . ($n * $p) . '$ naira.', 'Step 2: the change is $' . mlb_n($pay) . ' - ' . ($n * $p) . ' = ' . mlb_n($pay - $n * $p) . '$ naira.'],
                'What do you need to know before you can find the change?', 'concept', 40); },
        static function (MlbRng $r) { [$p, $q] = mlb_early_names($r, 2); $d = 500 * $r->int(1, 6); $small = 500 * $r->int(2, 10); $tot = 2 * $small + $d;
            return mlb_typed('num', '₦' . mlb_p($tot) . ' is shared between ' . $p . ' and ' . $q . '. ' . $p . ' gets ₦' . mlb_p($d) . ' more than ' . $q . '. How much does ' . $q . ' get?', (string)$small,
                ['Take away the extra first: $' . mlb_n($tot) . ' - ' . mlb_n($d) . ' = ' . mlb_n($tot - $d) . '$.', 'Share that equally: $' . mlb_n($tot - $d) . ' \\div 2 = ' . mlb_n($small) . '$. ' . $q . ' gets ₦' . mlb_p($small) . ' (and ' . $p . ' gets ₦' . mlb_p($small + $d) . ').'],
                'Draw two bars: one is longer by ₦' . mlb_p($d) . '.', 'application', 50, ['unit' => '₦']); },
        static function (MlbRng $r) { $n = $r->int(2, 5); $p = 50 * $r->int(5, 15); $bag = 100 * $r->int(5, 15); $pay = 1000 * (int)ceil(($n * $p + $bag + 500) / 1000);
            $c1 = $n * $p; $c2 = $c1 + $bag; $ch = $pay - $c2;
            $L = ['Books: $' . $n . ' \\times ' . $p . ' = ' . mlb_n($c1) . '$', 'With the bag: $' . mlb_n($c1) . ' + ' . mlb_n($bag) . ' = ' . mlb_n($c2) . '$', 'Change: $' . mlb_n($pay) . ' - ' . mlb_n($c2) . ' = ' . mlb_n($ch) . '$'];
            $bad1 = $n + $p; $slip = $c2 + $r->pick([-100, 100]);
            return mlb_error_of($r, 'A learner buys ' . $n . ' books at ₦' . $p . ' each and a bag for ₦' . mlb_p($bag) . ', paying with ₦' . mlb_p($pay) . '. Find the first mistake in the working for the change.', $L, [
                [0, ['Books: $' . $n . ' + ' . $p . ' = ' . $bad1 . '$', 'With the bag: $' . $bad1 . ' + ' . mlb_n($bag) . ' = ' . mlb_n($bad1 + $bag) . '$', 'Change: $' . mlb_n($pay) . ' - ' . mlb_n($bad1 + $bag) . ' = ' . mlb_n($pay - $bad1 - $bag) . '$'],
                    $n . ' books at ₦' . $p . ' each cost $' . $n . ' \\times ' . $p . '$, not $' . $n . ' + ' . $p . '$.'],
                [1, [$L[0], 'With the bag: $' . mlb_n($c1) . ' + ' . mlb_n($bag) . ' = ' . mlb_n($slip) . '$', 'Change: $' . mlb_n($pay) . ' - ' . mlb_n($slip) . ' = ' . mlb_n($pay - $slip) . '$'], mlb_p($c1) . ' + ' . mlb_p($bag) . ' is ' . mlb_p($c2) . '.'],
                [2, [$L[0], $L[1], 'Change: $' . mlb_n($pay) . ' + ' . mlb_n($c2) . ' = ' . mlb_n($pay + $c2) . '$'], 'change is what is LEFT: subtract the cost from what was paid.'],
            ]); },
        static function (MlbRng $r) { $ml = $r->pick([5, 10, 15, 20, 25]); $h = $r->int(2, 8); $what = $r->pick(['A leaking tap drips', 'A water filter lets through', 'A drip in the roof lets in']);
            return mlb_typed('num', $what . ' ' . $ml . ' ml of water every minute. How many litres is that in ' . $h . ' hours?', mlb_dec($ml * 60 * $h / 1000),
                [$h . ' hours $= ' . ($h * 60) . '$ minutes, so $' . $ml . ' \\times ' . ($h * 60) . ' = ' . mlb_n($ml * 60 * $h) . '$ ml.', 'Change to litres: $' . mlb_n($ml * 60 * $h) . ' \\div 1{,}000 = ' . mlb_dec($ml * 60 * $h / 1000) . '$ litres.'],
                'Change the hours to minutes first.', 'application', 50, ['unit' => 'litres']); },
    ],
]; }
