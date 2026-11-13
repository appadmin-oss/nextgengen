<?php
declare(strict_types=1);

/**
 * Maths Lab — more question SHAPES for the thin topics beyond Stage 4 (audit, 13 Nov 2026).
 *
 * The measurement: these topics produced fewer than five distinct question skeletons
 * (mlb_item_skeleton — the wording with the numbers, maths and names blanked). The engine caps a
 * skeleton at two a session, so a thin topic gave a short session; before the cap it gave one
 * question with the numbers swapped, which a child answers by template rather than by thinking.
 * The fix is content: each topic here gains forms whose TASK differs, not just whose numbers do.
 *
 * What the new forms are built on:
 *   · Variability of practice (Schmidt & Bjork 1992; Paas & van Merriënboer 1994): varying the
 *     task, not only the numbers, is what transfers. So the shapes differ — compute, solve for a
 *     different unknown, interpret a result in context, choose the method or first step, spot the
 *     first error in a worked solution, judge two answers, and a word problem in a Nigerian setting.
 *   · Interleaving and discrimination (Rohrer et al. 2019): an item that asks WHICH relation holds
 *     (parallel, perpendicular or neither; which line to draw) trains choosing the method, which
 *     blocked practice never does.
 *   · Completion and error-analysis problems (Renkl; Große & Renkl 2007): a worked solution with
 *     one wrong line, the mistake placed on different lines from item to item (mlb_error_of).
 *   · Misconception-based distractors: every wrong option is a mistake learners really make on
 *     that topic, and its "why" is the feedback when it is chosen.
 *
 * APPEND ONLY. mlb_maths_forms() appends these after every other file's forms, and a session
 * stores form NUMBERS: never reorder, remove or insert between forms here — add at the end of a
 * topic's list. MC-001..040 are mathslab-gen-variety.php's; this file owns MC-041..200.
 * Two passes, both 13 Nov 2026: the first 29 topics, then the other 29 that measured under five
 * skeletons — after which every Maths topic, 1 to 200, has at least five and at least two typed.
 */

const MLBV2_TOWNS = ['Ibadan', 'Kano', 'Enugu', 'Jos', 'Abeokuta', 'Kaduna', 'Owerri', 'Calabar', 'Ilorin', 'Makurdi', 'Akure', 'Sokoto', 'Warri', 'Lokoja', 'Yola', 'Osogbo'];
const MLBV2_MARKETS = ['Balogun market', 'Onitsha main market', 'Kurmi market', 'Oja Oba', 'Ariaria market', 'Wuse market', 'Bodija market', 'Oyingbo market'];
const MLBV2_RIVERS = ['the Niger', 'the Benue', 'the Ogun', 'the Kaduna river', 'the Cross river', 'the Osun'];

/** "y = mx + c" for a gradient p/q in lowest terms, as LaTeX (1x and −1x written as x and −x). */
function mlbv2_line(int $p, int $q, int $c): string {
    $g = mlb_gcd($p, $q); $p = intdiv($p, $g); $q = intdiv($q, $g); if ($q < 0) { $p = -$p; $q = -$q; }
    $m = $q === 1 ? mlb_lterm($p, 'x') : mlb_ftex($p, $q) . 'x';
    return 'y = ' . $m . mlb_sterm($c);
}
/** A polynomial from its coefficients, highest power first, as LaTeX: [1, 5, -3, 6] → x^3 + 5x^2 - 3x + 6. */
function mlbv2_poly(array $c): string {
    $n = count($c) - 1; $s = '';
    foreach (array_values($c) as $i => $k) {
        $p = $n - $i; if ($k === 0) continue;
        $v = $p === 0 ? '' : ($p === 1 ? 'x' : 'x^' . $p);
        $s .= $s === '' ? ($p === 0 ? (string)$k : mlb_lterm($k, $v)) : ($p === 0 ? mlb_sterm($k) : mlb_sterm($k, $v));
    }
    return $s === '' ? '0' : $s;
}
/** A column vector as LaTeX. */
function mlbv2_col($a, $b): string { return '\\begin{pmatrix} ' . $a . ' \\\\ ' . $b . ' \\end{pmatrix}'; }
/** a^e mod m, for e ≥ 0. */
function mlbv2_powmod(int $a, int $e, int $m): int { $r = 1 % $m; $a %= $m; if ($a < 0) $a += $m; while ($e > 0) { if ($e & 1) $r = ($r * $a) % $m; $a = ($a * $a) % $m; $e >>= 1; } return $r; }
/** A bearing as written: 045°. */
function mlbv2_brg(int $d): string { return str_pad((string)((($d % 360) + 360) % 360), 3, '0', STR_PAD_LEFT) . '°'; }

function mlb_forms_variety2(): array {
    static $f = null;
    if ($f !== null) return $f;
    return $f = [

    /* ── MC-044 Like terms: solve for the missing part; judge two answers ── */
    'MC-044' => [
        static function (MlbRng $r) { do { $a = $r->nz(-6, 9); $b = $r->nz(-6, 9); $c = $r->nz(-6, 12); $d = $r->nz(-6, 12); } while ($c === $a || $d === $b);
            $P = mlb_lterm($a, 'x') . mlb_sterm($b, 'y'); $Q = mlb_lterm($c, 'x') . mlb_sterm($d, 'y');
            $kx = $c - $a; $ky = $d - $b; $key = mlb_lterm($kx, 'x') . ($ky < 0 ? '' : '+') . mlb_lterm($ky, 'y');
            return mlb_typed('expr', 'What expression must be added to $' . $P . '$ to give $' . $Q . '$?', $key,
                ['Call the missing expression $E$: $(' . $P . ') + E = ' . $Q . '$.', 'So $E = (' . $Q . ') - (' . $P . ')$: take the $x$-terms from the $x$-terms and the $y$-terms from the $y$-terms.',
                 '$' . mlb_lterm($c, 'x') . ' - (' . mlb_lterm($a, 'x') . ') = ' . mlb_lterm($kx, 'x') . '$ and $' . mlb_lterm($d, 'y') . ' - (' . mlb_lterm($b, 'y') . ') = ' . mlb_lterm($ky, 'y') . '$, so $E = ' . mlb_lterm($kx, 'x') . mlb_sterm($ky, 'y') . '$.'],
                'Think of it as "what do I add to the first to reach the second?" — one letter at a time.', 'application', 50, ['form' => 'simplified']); },
        static function (MlbRng $r) { $a = $r->int(5, 12); $c = $r->int(1, $a - 2); $b = $r->int(2, 9); $n1 = $r->pick(MLB_NAMES); $n2 = $r->pick(array_values(array_diff(MLB_NAMES, [$n1])));
            $E = $a . 'x + ' . $b . 'y' . mlb_sterm(-$c, 'x'); $right = mlb_lterm($a - $c, 'x') . ' + ' . $b . 'y';
            $bad = $r->pick([mlb_lterm($a + $b - $c, 'xy'), mlb_lterm($a + $c, 'x') . ' + ' . $b . 'y']);
            $badWhy = strpos($bad, 'xy') !== false ? 'joined unlike terms: $x$-terms and $y$-terms cannot be added together' : 'ignored the minus sign in front of $' . mlb_lterm($c, 'x') . '$';
            $rightFirst = $r->int(0, 1) === 1;
            [$A1, $A2] = $rightFirst ? [$right, $bad] : [$bad, $right]; $who = $rightFirst ? $n1 : $n2; $not = $rightFirst ? $n2 : $n1;
            return mlb_mcq($r, $n1 . ' simplifies $' . $E . '$ and gets $' . $A1 . '$. ' . $n2 . ' gets $' . $A2 . '$. Who is right?', 'Only ' . $who,
                [['Only ' . $not, $not . ' ' . $badWhy . '.'], ['Both — the two answers are the same', 'Put $x = 2$, $y = 3$ into each: they give different values, so they are not equal.'],
                 ['Neither', $who . '\'s answer is right: $' . $a . 'x' . mlb_sterm(-$c, 'x') . ' = ' . mlb_lterm($a - $c, 'x') . '$, and $' . $b . 'y$ has no like term.']],
                ['Like terms have the same letters: $' . $a . 'x$ and $' . mlb_lterm(-$c, 'x') . '$ are like; $' . $b . 'y$ is on its own.', '$' . $a . 'x' . mlb_sterm(-$c, 'x') . ' = ' . mlb_lterm($a - $c, 'x') . '$, so the answer is $' . $right . '$.', $not . ' ' . $badWhy . '.'],
                'Simplify it yourself first, then compare.', 'reasoning', 45); },
    ],

    /* ── MC-046 Substitution: spot the sign error; use a formula backwards ── */
    'MC-046' => [
        static function (MlbRng $r) { $a = $r->int(2, 5); $b = $r->int(2, 6); $p = $r->int(2, 5); $q = $r->int(2, 7); $A = $a * $p * $p; $B = $b * $q;
            $L1 = '$' . $a . '(-' . $p . ')^2 - ' . $b . '(-' . $q . ')$'; $L2 = '$= ' . $a . ' \\times ' . ($p * $p) . ' - ' . $b . ' \\times (-' . $q . ')$';
            $right = [$L1, $L2, '$= ' . $A . ' + ' . $B . '$', '$= ' . ($A + $B) . '$'];
            return mlb_error_of($r, 'Find the first mistake: work out $' . $a . 'x^2 - ' . $b . 'y$ when $x = -' . $p . '$ and $y = -' . $q . '$.', $right, [
                [1, [$L1, '$= ' . $a . ' \\times (-' . ($p * $p) . ') - ' . $b . ' \\times (-' . $q . ')$', '$= -' . $A . ' + ' . $B . '$', '$= ' . ($B - $A) . '$'], '$(-' . $p . ')^2 = (-' . $p . ') \\times (-' . $p . ') = +' . ($p * $p) . '$: a negative times a negative is positive.'],
                [2, [$L1, $L2, '$= ' . $A . ' - ' . $B . '$', '$= ' . ($A - $B) . '$'], 'Subtracting a negative is adding: $-' . $b . ' \\times (-' . $q . ') = +' . $B . '$.'],
                [1, [$L1, '$= (' . (-$a * $p) . ')^2 - ' . $b . ' \\times (-' . $q . ')$', '$= ' . ($a * $a * $p * $p) . ' + ' . $B . '$', '$= ' . ($a * $a * $p * $p + $B) . '$'], 'Only $x$ is squared, not $' . $a . 'x$: square $-' . $p . '$ first, then multiply by ' . $a . '.'],
            ]); },
        static function (MlbRng $r) { $u = $r->int(0, 20); $a = $r->int(1, 6); $t = $r->int(2, 10); $v = $u + $a * $t; $road = $r->pick(['Lagos–Ibadan expressway', 'Abuja–Kaduna highway', 'Benin–Ore road', 'Kano–Zaria road']);
            return mlb_typed('num', 'A lorry on the ' . $road . ' speeds up steadily, so $v = u + at$. Its speed goes from $' . $u . '$ m/s to $' . $v . '$ m/s in $' . $t . '$ seconds. Find its acceleration $a$, in m/s².', (string)$a,
                ['Substitute what you know: $' . $v . ' = ' . $u . ' + a \\times ' . $t . '$.', 'Subtract ' . $u . ': $' . ($v - $u) . ' = ' . $t . 'a$.', 'Divide by ' . $t . ': $a = ' . $a . '$ m/s².'],
                'Put the three numbers you know into the formula, then solve for the one you do not.', 'application', 50, ['unit' => 'm/s²']); },
    ],

    /* ── MC-047 Equality and balance: what is left after a step; a balance with bags on both pans; a half-done step ── */
    'MC-047' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $x = $r->int(2, 12); $b = $r->int(2, 15); $c = $a * $x + $b; $op = $r->pick(['take', 'divide']);
            if ($op === 'take') return mlb_typed('num', 'The equation $' . $a . 'x + ' . $b . ' = ' . $c . '$ is balanced. If ' . $b . ' is taken away from both sides, what number is now on the right-hand side?', (string)($c - $b),
                ['Whatever is done to one side is done to the other, so the right side becomes $' . $c . ' - ' . $b . '$.', '$' . $c . ' - ' . $b . ' = ' . ($c - $b) . '$, giving $' . $a . 'x = ' . ($c - $b) . '$.'],
                'Do the same thing to the right side.', 'procedure', 30);
            return mlb_typed('num', 'The equation $' . $a . 'x = ' . ($a * $x) . '$ is balanced. If both sides are divided by ' . $a . ', what number is now on the right-hand side?', (string)$x,
                ['Dividing both sides by the same number keeps the balance: $' . ($a * $x) . ' \\div ' . $a . '$.', '$= ' . $x . '$, giving $x = ' . $x . '$.'],
                'Do the same thing to the right side.', 'procedure', 30); },
        static function (MlbRng $r) { $mk = $r->pick(MLBV2_MARKETS); $w = $r->int(2, 9); $a = $r->int(1, 4); $b = $r->int($a + 1, $a + 4); $q = $r->int(0, 6); $p = $q + ($b - $a) * $w;
            $item = $r->pick(['garri', 'rice', 'beans', 'sugar']);
            return mlb_typed('num', 'On a trader\'s scale at ' . $mk . ', ' . $a . ' equal bags of ' . $item . ' and ' . $p . ' kg of weights balance ' . $b . ' of the same bags' . ($q ? ' and ' . $q . ' kg of weights' : '') . '. How heavy is one bag, in kg?', (string)$w,
                ['Take ' . $a . ' bags off both pans: the scale still balances.', 'Now ' . $p . ' kg balances ' . ($b - $a) . ' bag' . ($b - $a === 1 ? '' : 's') . ($q ? ' and ' . $q . ' kg' : '') . '.' . ($q ? ' Take ' . $q . ' kg off both pans: ' . ($p - $q) . ' kg balances ' . ($b - $a) . ' bag' . ($b - $a === 1 ? '' : 's') . '.' : ''),
                 'One bag is $' . ($p - $q) . ' \\div ' . ($b - $a) . ' = ' . $w . '$ kg.'],
                'Remove the same things from both pans until the bags are on one side only.', 'application', 55, ['unit' => 'kg']); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $k = $r->int(2, 6); $a = $r->int(1, 9); $x = $r->int(1, 9); $c = $x + $a;
            return mlb_mcq($r, $who . ' multiplies both sides of $\\frac{x}{' . $k . '} + ' . $a . ' = ' . $c . '$ by ' . $k . ' and writes $x + ' . $a . ' = ' . ($k * $c) . '$. Is the equation still balanced?',
                'No — the ' . $a . ' must be multiplied by ' . $k . ' too: $x + ' . ($k * $a) . ' = ' . ($k * $c) . '$',
                [['Yes — multiplying by ' . $k . ' clears the fraction', 'It clears the fraction, but EVERY term on the left must be multiplied by ' . $k . ', including ' . $a . '.'],
                 ['Yes — only the term with $x$ needs multiplying', 'Multiplying a side means multiplying all of it: $' . $k . '\\left(\\frac{x}{' . $k . '} + ' . $a . '\\right) = x + ' . ($k * $a) . '$.'],
                 ['No — ' . $k . ' should have been added to both sides instead', 'Adding ' . $k . ' would not clear the fraction; multiplying is right, it was just not done to every term.']],
                ['Multiplying the left side by ' . $k . ' multiplies every term on it: $x + ' . ($k * $a) . '$.', 'So the balanced equation is $x + ' . ($k * $a) . ' = ' . ($k * $c) . '$, and $x = ' . ($k * $c - $k * $a) . '$.'],
                'Check it with a number: does the new equation have the same answer as the old one?', 'reasoning', 45); },
    ],

    /* ── MC-048 One-step equations: a word problem, a diagnosis, a reverse puzzle ── */
    'MC-048' => [
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $mk = $r->pick(MLBV2_MARKETS); $a = 50 * $r->int(4, 60); $b = 50 * $r->int(2, 40);
            return mlb_typed('num', $who . ' spent ₦' . mlb_p($a) . ' at ' . $mk . ' and had ₦' . mlb_p($b) . ' left. How much did ' . $who . ' take to the market, in naira?', (string)($a + $b),
                ['Let the amount taken be $x$ naira: $x - ' . $a . ' = ' . $b . '$.', 'Add ' . $a . ' to both sides: $x = ' . $b . ' + ' . $a . ' = ' . ($a + $b) . '$.', 'Check: $' . ($a + $b) . ' - ' . $a . ' = ' . $b . '$. ✓'],
                'Write an equation for "spent some, has some left", then undo the spending.', 'application', 40); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $a = $r->int(3, 15); $b = $r->int($a + 2, 30);
            return mlb_mcq($r, $who . ' solves $x - ' . $a . ' = ' . $b . '$ and writes $x = ' . ($b - $a) . '$. What went wrong?', $a . ' should have been added to both sides, not subtracted',
                [['Nothing — $x = ' . ($b - $a) . '$ is right', 'Check it: $' . ($b - $a) . ' - ' . $a . ' = ' . ($b - 2 * $a) . '$, not ' . $b . '.'],
                 ['Both sides should have been divided by ' . $a, 'Dividing undoes multiplying. Here ' . $a . ' is taken away, so adding undoes it.'],
                 ['The answer should be $x = ' . ($a - $b) . '$', 'Check it: $' . ($a - $b) . ' - ' . $a . ' = ' . (-$b) . '$, not ' . $b . '.']],
                ['To undo "take away ' . $a . '", add ' . $a . ' to both sides: $x = ' . $b . ' + ' . $a . ' = ' . ($a + $b) . '$.', 'Check: $' . ($a + $b) . ' - ' . $a . ' = ' . $b . '$. ✓'],
                'Put ' . ($b - $a) . ' back into the equation. Does it work?', 'reasoning', 40); },
        static function (MlbRng $r) { $k = $r->int(3, 12); $q = $r->int(2, 15);
            return mlb_typed('num', 'I think of a number and divide it by ' . $k . '. The answer is ' . $q . '. What number did I think of?', (string)($k * $q),
                ['Let the number be $n$: $\\frac{n}{' . $k . '} = ' . $q . '$.', 'Multiply both sides by ' . $k . ': $n = ' . ($k * $q) . '$.', 'Check: $' . ($k * $q) . ' \\div ' . $k . ' = ' . $q . '$. ✓'],
                'What undoes dividing?', 'procedure', 30); },
    ],

    /* ── MC-049 Multi-step equations: consecutive numbers, the first line, angles in a triangle ── */
    'MC-049' => [
        static function (MlbRng $r) { $n = $r->int(10, 80); $S = 3 * $n + 3;
            return mlb_typed('num', 'The sum of three consecutive whole numbers is ' . $S . '. What is the largest of them?', (string)($n + 2),
                ['Call the smallest $n$; the others are $n + 1$ and $n + 2$.', '$n + (n + 1) + (n + 2) = ' . $S . '$, so $3n + 3 = ' . $S . '$.', '$3n = ' . ($S - 3) . '$, $n = ' . $n . '$, and the largest is $' . ($n + 2) . '$.'],
                'Name the smallest number with a letter, and write the other two from it.', 'application', 50); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $a = $r->int(2, 6); $b = $r->int(1, 9); $c = $r->int(1, $a - 1); $x = $r->nz(-6, 9); $d = $a * ($x + $b) - $c * $x;
            $eq = $a . '(x + ' . $b . ') = ' . mlb_lterm($c, 'x') . mlb_sterm($d);
            return mlb_mcq($r, $who . ' wants to solve $' . $eq . '$. Which is a correct first line?', '$' . $a . 'x + ' . ($a * $b) . ' = ' . mlb_lterm($c, 'x') . mlb_sterm($d) . '$',
                [['$' . $a . 'x + ' . $b . ' = ' . mlb_lterm($c, 'x') . mlb_sterm($d) . '$', 'The ' . $a . ' multiplies BOTH terms in the bracket, so ' . $b . ' becomes ' . ($a * $b) . '.'],
                 ['$x + ' . $b . ' = ' . mlb_lterm($c, 'x') . mlb_sterm($d - $a) . '$', 'The ' . $a . ' multiplies the bracket; it cannot be taken away from one side.'],
                 ['$' . ($a - $c === 1 ? '' : $a - $c) . '(x + ' . $b . ') = ' . $d . '$', 'Only $' . mlb_lterm($c, 'x') . '$ is on the right, not $' . $c . '(x + ' . $b . ')$.']],
                ['Expand the bracket: $' . $a . ' \\times x + ' . $a . ' \\times ' . $b . ' = ' . $a . 'x + ' . ($a * $b) . '$.', 'Then collect: $' . mlb_lterm($a - $c, 'x') . ' = ' . ($d - $a * $b) . '$, so $x = ' . $x . '$.'],
                'What does the number outside the bracket multiply?', 'procedure', 40); },
        static function (MlbRng $r) { $x = $r->int(15, 28); $b = $r->int(5, 20); $a = 180 - 6 * $x + $b;
            return mlb_typed('num', 'The angles of a triangle are $x^\\circ$, $(2x' . mlb_sterm($a) . ')^\\circ$ and $(3x - ' . $b . ')^\\circ$. Find $x$.', (string)$x,
                ['The angles of a triangle add up to $180^\\circ$: $x + (2x' . mlb_sterm($a) . ') + (3x - ' . $b . ') = 180$.', 'Collect: $6x' . mlb_sterm($a - $b) . ' = 180$, so $6x = ' . (180 - $a + $b) . '$.', '$x = ' . $x . '$. Check: $' . $x . ' + ' . (2 * $x + $a) . ' + ' . (3 * $x - $b) . ' = 180$. ✓'],
                'What do the three angles of any triangle add up to?', 'application', 55, ['unit' => '°']); },
    ],

    /* ── MC-051 Change of subject: a formula in context, a worked solution, the formula used backwards ── */
    'MC-051' => [
        static function (MlbRng $r) { $F = 500 * $r->int(4, 18); $R = 50 * $r->int(4, 18); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('expr', 'Hiring chairs for a party in ' . $town . ' costs $c = ' . $F . ' + ' . $R . 'h$ naira for $h$ hours. Make $h$ the subject of the formula.', '(c-' . $F . ')/' . $R,
                ['Take ' . $F . ' from both sides: $c - ' . $F . ' = ' . $R . 'h$.', 'Divide both sides by ' . $R . ': $h = \\frac{c - ' . $F . '}{' . $R . '}$.'],
                'Undo the operations on $h$ in reverse order: the adding last, so undo it first.', 'application', 50); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(1, 9); $c = $r->int(2, 9);
            $right = ['$' . $c . 'y = ' . $a . 'x - ' . $b . '$', '$' . $c . 'y + ' . $b . ' = ' . $a . 'x$', '$x = \\frac{' . $c . 'y + ' . $b . '}{' . $a . '}$'];
            return mlb_error_of($r, 'Find the first mistake in this working to make $x$ the subject of $y = \\frac{' . $a . 'x - ' . $b . '}{' . $c . '}$.', $right, [
                [0, ['$y + ' . $b . ' = \\frac{' . $a . 'x}{' . $c . '}$', '$' . $c . '(y + ' . $b . ') = ' . $a . 'x$', '$x = \\frac{' . $c . '(y + ' . $b . ')}{' . $a . '}$'], 'The whole of $' . $a . 'x - ' . $b . '$ is divided by ' . $c . ', so multiply by ' . $c . ' first; only then is ' . $b . ' on its own.'],
                [1, [$right[0], '$' . $c . 'y - ' . $b . ' = ' . $a . 'x$', '$x = \\frac{' . $c . 'y - ' . $b . '}{' . $a . '}$'], 'To undo "$- ' . $b . '$", add ' . $b . ' to both sides.'],
                [2, [$right[0], $right[1], '$x = ' . $c . 'y + ' . $b . ' - ' . $a . '$'], '$x$ is MULTIPLIED by ' . $a . ', so divide by ' . $a . ' — do not subtract it.'],
            ]); },
        static function (MlbRng $r) { $C = 5 * $r->int(1, 9); $F = intdiv(9 * $C, 5) + 32; $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('num', 'A visitor\'s thermometer in ' . $town . ' reads $' . $F . '^\\circ$F. Use $F = \\frac{9C}{5} + 32$ to find the temperature in degrees Celsius.', (string)$C,
                ['Put $F = ' . $F . '$: $' . $F . ' = \\frac{9C}{5} + 32$.', 'Take 32 from both sides: $' . ($F - 32) . ' = \\frac{9C}{5}$.', 'Multiply by 5, then divide by 9: $C = \\frac{5 \\times ' . ($F - 32) . '}{9} = ' . $C . '$.'],
                'This time $F$ is known and $C$ is not: undo the formula step by step.', 'application', 50, ['unit' => '°C']); },
    ],

    /* ── MC-056 Common factors: typed — complete the bracket, find the HCF; and finishing the job ── */
    'MC-056' => [
        static function (MlbRng $r) { do { $g = $r->int(2, 9); $p = $r->int(1, 7); $q = $r->nz(-9, 9); } while (mlb_gcd($p, $q) !== 1);
            $A = $g * $p; $B = $g * $q;
            return mlb_typed('expr', 'Complete: $' . $A . 'x^2' . mlb_sterm($B, 'x') . ' = ' . $g . 'x(\\ \\ldots\\ )$. What goes inside the bracket?', mlb_lterm($p, 'x') . ($q < 0 ? '' : '+') . $q,
                ['Divide each term by the factor outside, $' . $g . 'x$.', '$' . $A . 'x^2 \\div ' . $g . 'x = ' . mlb_lterm($p, 'x') . '$ and $' . $B . 'x \\div ' . $g . 'x = ' . $q . '$.', 'So $' . $A . 'x^2' . mlb_sterm($B, 'x') . ' = ' . $g . 'x(' . mlb_lterm($p, 'x') . mlb_sterm($q) . ')$. Expand to check.'],
                'Each term inside, times $' . $g . 'x$, must give back a term outside.', 'procedure', 40); },
        static function (MlbRng $r) { do { $g = $r->int(2, 8); $p = $r->int(2, 7); $q = $r->int(2, 7); } while (mlb_gcd($p, $q) !== 1 || $p === $q);
            $e = [$r->int(1, 3), $r->int(1, 3), $r->int(1, 3), $r->int(1, 3)]; $mx = min($e[0], $e[2]); $my = min($e[1], $e[3]);
            $pw = static fn($v, $k) => $k === 1 ? $v : $v . '^' . $k;
            $t1 = ($g * $p) . $pw('x', $e[0]) . $pw('y', $e[1]); $t2 = ($g * $q) . $pw('x', $e[2]) . $pw('y', $e[3]);
            $key = $g . $pw('x', $mx) . $pw('y', $my);
            return mlb_typed('expr', 'What is the highest common factor of $' . $t1 . '$ and $' . $t2 . '$?', $key,
                ['The number part: the HCF of ' . ($g * $p) . ' and ' . ($g * $q) . ' is ' . $g . '.', 'Each letter: take the LOWER power — $' . $pw('x', $mx) . '$ and $' . $pw('y', $my) . '$.', 'So the HCF is $' . $key . '$.'],
                'Numbers first, then each letter to the smallest power it has in both terms.', 'procedure', 45); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); do { $g = $r->int(2, 7); $p = $r->int(1, 6); $q = $r->int(1, 9); } while (mlb_gcd($p, $q) !== 1);
            $A = $g * $p; $B = $g * $q;
            return mlb_mcq($r, $who . ' factorises $' . $A . 'x^2 + ' . $B . 'x$ as $' . $g . '(' . mlb_lterm($p, 'x^2') . mlb_sterm($q, 'x') . ')$. What would you say to ' . $who . '?',
                'Not finished: $x$ is also a common factor, so it is $' . $g . 'x(' . mlb_lterm($p, 'x') . ' + ' . $q . ')$',
                [['It is fully factorised', 'Both terms inside the bracket still have a factor $x$, so it is not complete.'],
                 ['It is wrong: the answer is $' . $g . 'x(' . mlb_lterm($p, 'x^2') . mlb_sterm($q, 'x') . ')$', 'Taking $x$ out divides each term by $x$, so each power drops by one. Expand it: you get $x^3$.'],
                 ['$x$ cannot be a common factor, because one term has $x^2$', '$x^2 = x \\times x$, so $x$ divides it.']],
                ['"Completely" means take out EVERY common factor: the number ' . $g . ' and the letter $x$.', '$' . $A . 'x^2 + ' . $B . 'x = ' . $g . 'x(' . mlb_lterm($p, 'x') . ' + ' . $q . ')$.'],
                'Look inside the bracket. Do the terms there still share anything?', 'reasoning', 40); },
    ],

    /* ── MC-057 Grouping: two typed completions, a numerical shortcut, and choosing the pairing ── */
    'MC-057' => [
        static function (MlbRng $r) { $p = $r->nz(-9, 9); $q = $r->nz(-9, 9);
            $E = 'xy' . mlb_sterm($p, 'x') . mlb_sterm($q, 'y') . mlb_sterm($p * $q);
            return mlb_typed('expr', 'Complete: $' . $E . ' = (x' . mlb_sterm($q) . ')(\\ \\ldots\\ )$. What goes in the second bracket?', 'y' . ($p < 0 ? '' : '+') . $p,
                ['Group the $y$-terms and the rest: $y(x' . mlb_sterm($q) . ')' . mlb_sterm($p) . '(x' . mlb_sterm($q) . ')$.', 'The common bracket is $(x' . mlb_sterm($q) . ')$, leaving $(y' . mlb_sterm($p) . ')$.', 'Check: $(x' . mlb_sterm($q) . ')(y' . mlb_sterm($p) . ') = ' . $E . '$.'],
                'Take $y$ out of the $y$-terms and a number out of the rest: what bracket do they share?', 'procedure', 45); },
        static function (MlbRng $r) { $s1 = $r->pick([10, 20, 30]); $a = $r->int(intdiv($s1, 2) + 1, $s1 - 1); $b = $s1 - $a; $s2 = $r->pick([100, 50]); $c = $r->int(intdiv($s2, 2) + 1, $s2 - 3); $d = $s2 - $c;
            return mlb_typed('num', 'Without a calculator, work out $' . $a . ' \\times ' . $c . ' + ' . $a . ' \\times ' . $d . ' + ' . $b . ' \\times ' . $c . ' + ' . $b . ' \\times ' . $d . '$.', (string)($s1 * $s2),
                ['Group in pairs: $' . $a . '(' . $c . ' + ' . $d . ') + ' . $b . '(' . $c . ' + ' . $d . ')$.', 'The common bracket comes out: $(' . $a . ' + ' . $b . ')(' . $c . ' + ' . $d . ') = ' . $s1 . ' \\times ' . $s2 . '$.', '$= ' . ($s1 * $s2) . '$.'],
                'Four products, two numbers each repeated — what can you take out?', 'application', 50); },
        static function (MlbRng $r) { do { $a = $r->int(1, 9); $b = $r->int(1, 9); } while ($a === $b);
            return mlb_typed('expr', 'A rectangle has area $(x^2' . mlb_sterm($a, 'x') . mlb_sterm($b, 'x') . ' + ' . ($a * $b) . ')$ cm². One side is $(x + ' . $a . ')$ cm. Write an expression for the other side, in cm.', 'x+' . $b,
                ['Factorise the area by grouping: $x(x + ' . $a . ') + ' . $b . '(x + ' . $a . ')$.', 'So the area is $(x + ' . $a . ')(x + ' . $b . ')$.', 'One side is $(x + ' . $a . ')$, so the other is $(x + ' . $b . ')$ cm.'],
                'Area = length × width. Write the area as a product.', 'application', 50); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $k = $r->int(2, 9);
            return mlb_mcq($r, $who . ' tries to factorise $xy + ' . $k . 'z + ' . $k . 'y + xz$ by grouping and gets stuck. Which pairing should ' . $who . ' use?',
                'Pair $xy$ with $' . $k . 'y$, and $xz$ with $' . $k . 'z$',
                [['Pair the first two terms and the last two, as they are written', '$xy$ and $' . $k . 'z$ share no factor, so that pairing goes nowhere.'],
                 ['Take ' . $k . ' out of every term', $k . ' is not a factor of $xy$ or of $xz$.'],
                 ['None: no factor is common to all four terms, so it cannot be factorised', 'Grouping is for exactly this case: it finds a common BRACKET, not a common number.']],
                ['$xy + ' . $k . 'y = y(x + ' . $k . ')$ and $xz + ' . $k . 'z = z(x + ' . $k . ')$.', 'The common bracket gives $(x + ' . $k . ')(y + z)$.'],
                'Which terms share a letter with each other?', 'reasoning', 45); },
    ],

    /* ── MC-062 Roots: a cube root in context; the root of a sum ── */
    'MC-062' => [
        static function (MlbRng $r) { $n = $r->int(2, 9); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('num', 'A cube-shaped water tank in ' . $town . ' holds $' . ($n ** 3) . '$ m³ when full. How long is each edge, in metres?', (string)$n,
                ['The volume of a cube is edge × edge × edge.', 'So the edge is $\\sqrt[3]{' . ($n ** 3) . '}$: the number that cubes to ' . ($n ** 3) . '.', '$' . $n . ' \\times ' . $n . ' \\times ' . $n . ' = ' . ($n ** 3) . '$, so each edge is ' . $n . ' m.'],
                'Which number, used three times in a multiplication, gives the volume?', 'application', 35, ['unit' => 'm']); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); [$a, $b, $c] = $r->pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [12, 16, 20]]); $A = $a * $a; $B = $b * $b;
            return mlb_mcq($r, $who . ' says $\\sqrt{' . $A . ' + ' . $B . '} = ' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$. What is $\\sqrt{' . $A . ' + ' . $B . '}$ really?', (string)$c,
                [[(string)($a + $b), 'The square root of a sum is NOT the sum of the square roots: $' . ($a + $b) . '^2 = ' . (($a + $b) ** 2) . '$, not ' . ($A + $B) . '.'],
                 [(string)(($A + $B) / 2), 'Halving is not square-rooting: $' . (($A + $B) / 2) . '^2$ is far more than ' . ($A + $B) . '.'],
                 ['It cannot be found without a calculator', 'Add first: ' . ($A + $B) . ' is a perfect square.']],
                ['Add first: $' . $A . ' + ' . $B . ' = ' . ($A + $B) . '$.', '$\\sqrt{' . ($A + $B) . '} = ' . $c . '$, because $' . $c . '^2 = ' . ($A + $B) . '$.', 'And $' . $c . ' \\ne ' . ($a + $b) . '$: roots do not split over a plus sign.'],
                'Work out what is under the root sign first.', 'concept', 40); },
    ],

    /* ── MC-081 Perimeter: cost of fencing; the corner-cut misconception ── */
    'MC-081' => [
        static function (MlbRng $r) { $L = $r->int(20, 90); $W = $r->int(10, $L - 5); $c = 50 * $r->int(4, 30); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('num', 'A rectangular farm near ' . $town . ' is ' . $L . ' m long and ' . $W . ' m wide. Fencing costs ₦' . mlb_p($c) . ' per metre. How much does it cost to fence the whole farm, in naira?', (string)(2 * ($L + $W) * $c),
                ['The fence goes all round: the perimeter is $2(' . $L . ' + ' . $W . ') = ' . (2 * ($L + $W)) . '$ m.', 'Cost $= ' . (2 * ($L + $W)) . ' \\times ' . $c . ' = ₦' . mlb_n(2 * ($L + $W) * $c) . '$.'],
                'First find how many metres of fence are needed.', 'application', 50); },
        static function (MlbRng $r) { $L = $r->int(8, 20); $W = $r->int(5, $L - 1); $s = $r->int(1, min(4, $W - 2)); $P = 2 * ($L + $W);
            return mlb_mcq($r, 'A rectangle ' . $L . ' cm by ' . $W . ' cm has a ' . $s . ' cm by ' . $s . ' cm square cut from one corner. What is the perimeter of the shape that is left?', $P . ' cm',
                [[($P - 4 * $s) . ' cm', 'Only two edges of the square lay along the outside, and cutting it out makes two NEW edges of the same length.'],
                 [($P - 2 * $s) . ' cm', 'Two pieces of edge are removed, but two new edges of the same lengths appear inside the corner.'],
                 [($P + 2 * $s) . ' cm', 'The two new edges REPLACE the two pieces removed; nothing extra is added.']],
                ['Walk round the new shape. The cut removes ' . $s . ' cm from the length and ' . $s . ' cm from the width.', 'But it adds two new edges of ' . $s . ' cm each, in the corner.', 'They cancel: the perimeter is still $2(' . $L . ' + ' . $W . ') = ' . $P . '$ cm.'],
                'Sketch it and label every edge of the new shape.', 'reasoning', 50); },
    ],

    /* ── MC-095 Parallel and perpendicular: tell them apart; find an unknown gradient ── */
    'MC-095' => [
        static function (MlbRng $r) { do { $p = $r->nz(-5, 5); $q = $r->int(1, 4); } while (abs($p) === $q || mlb_gcd($p, $q) !== 1);
            $case = $r->pick(['par', 'perp', 'neg', 'recip']);
            [$p2, $q2] = $case === 'par' ? [$p, $q] : ($case === 'perp' ? [-$q, $p] : ($case === 'neg' ? [-$p, $q] : [$q, $p]));
            $c1 = $r->int(-6, 6); do { $c2 = $r->int(-6, 6); } while ($c2 === $c1);
            $right = $case === 'par' ? 'Parallel' : ($case === 'perp' ? 'Perpendicular' : 'Neither');
            $whys = ['Parallel' => 'Parallel lines have EQUAL gradients: compare them.', 'Perpendicular' => 'Perpendicular gradients MULTIPLY to $-1$; check the product.',
                     'Neither' => 'Compare the gradients: equal means parallel; a product of $-1$ means perpendicular.', 'The same line' => 'The lines cut the $y$-axis at different points, so they are different lines.'];
            $wrong = []; foreach ($whys as $o => $w) if ($o !== $right) $wrong[] = [$o, $w];
            $m1 = mlb_ftex($p, $q); $m2 = mlb_ftex($p2, $q2);
            return mlb_mcq($r, 'Are the lines $' . mlbv2_line($p, $q, $c1) . '$ and $' . mlbv2_line($p2, $q2, $c2) . '$ parallel, perpendicular or neither?', $right, $wrong,
                ['The gradients are $' . $m1 . '$ and $' . $m2 . '$.', 'Their product is $' . mlb_ftex($p * $p2, $q * $q2) . '$.',
                 $case === 'par' ? 'Equal gradients: the lines are parallel.' : ($case === 'perp' ? 'The product is $-1$: the lines are perpendicular.' : 'They are not equal and their product is not $-1$, so neither. (A negative alone, or a reciprocal alone, is not enough: perpendicular needs both.)')],
                'Read off each gradient, then compare them.', 'concept', 40); },
        static function (MlbRng $r) { $a = $r->int(2, 6); do { $b = $r->nz(-7, 7); } while (abs($b) === $a); $c1 = $r->int(-5, 9); $c2 = $r->nz(-9, 9);
            return mlb_typed('frac', 'The line $y = kx' . mlb_sterm($c1) . '$ is perpendicular to the line $' . $a . 'y = ' . mlb_lterm($b, 'x') . mlb_sterm($c2) . '$. Find $k$.', mlb_frac(-$a, $b),
                ['Divide the second equation by ' . $a . ': its gradient is $' . mlb_ftex($b, $a) . '$.', 'Perpendicular gradients multiply to $-1$: $k \\times ' . mlb_ftex($b, $a) . ' = -1$.', '$k = ' . mlb_ftex(-$a, $b) . '$.'],
                'First get the second line into the form $y = mx + c$.', 'procedure', 50); },
    ],

    /* ── MC-097 Inequalities in two variables: the boundary value, in context, and reading a graph ── */
    'MC-097' => [
        static function (MlbRng $r) { $a = $r->int(1, 6); $b = $r->int(2, 5); $p = $r->int(0, 5); $ym = $r->int(1, 9); $c = $a * $p + $b * $ym + $r->int(0, $b - 1);
            return mlb_typed('num', 'When $x = ' . $p . '$, what is the greatest whole-number value of $y$ that satisfies $' . mlb_lterm($a, 'x') . ' + ' . $b . 'y \\le ' . $c . '$?', (string)$ym,
                ['Put $x = ' . $p . '$: $' . ($a * $p) . ' + ' . $b . 'y \\le ' . $c . '$, so $' . $b . 'y \\le ' . ($c - $a * $p) . '$.', '$y \\le ' . mlb_ftex($c - $a * $p, $b) . '$.', 'The greatest whole number that small is ' . $ym . '.'],
                'Substitute $x$, then solve for $y$ like an equation — but keep the inequality sign.', 'procedure', 45); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $mk = $r->pick(MLBV2_MARKETS); $a = 50 * $r->int(4, 12); $b = 50 * $r->int(6, 20); $p = $r->int(1, 6); $ym = $r->int(1, 8); $c = $a * $p + $b * $ym + 50 * $r->int(0, intdiv($b, 50) - 1);
            return mlb_typed('num', $who . ' has ₦' . mlb_p($c) . ' to spend at ' . $mk . '. Bread is ₦' . mlb_p($a) . ' a loaf and milk is ₦' . mlb_p($b) . ' a tin, so $' . $a . 'x + ' . $b . 'y \\le ' . $c . '$. If ' . $who . ' buys ' . $p . ' loaves, what is the greatest number of tins of milk ' . $who . ' can buy?', (string)$ym,
                ['Put $x = ' . $p . '$: the bread costs ₦' . mlb_p($a * $p) . ', leaving ₦' . mlb_p($c - $a * $p) . '.', '$' . $b . 'y \\le ' . ($c - $a * $p) . '$, so $y \\le ' . mlb_dec(($c - $a * $p) / $b) . '$.', 'Tins come whole, so the most is ' . $ym . '.'],
                'Work out the money left after the bread.', 'application', 55); },
        static function (MlbRng $r) { $m = $r->nz(-3, 3); $c = $r->int(-4, 4); $solid = $r->int(0, 1) === 1; $above = $r->int(0, 1) === 1;
            $sym = $above ? ($solid ? '\\ge' : '>') : ($solid ? '\\le' : '<'); $line = mlb_lterm($m, 'x') . mlb_sterm($c);
            $wrong = [];
            foreach (['>', '\\ge', '<', '\\le'] as $s) { if ($s === $sym) continue;
                $sAbove = $s === '>' || $s === '\\ge'; $sSolid = $s === '\\ge' || $s === '\\le';
                $why = $sAbove !== $above ? ($above ? 'Above the line, $y$ is BIGGER than $' . $line . '$.' : 'Below the line, $y$ is SMALLER than $' . $line . '$.')
                    : ($solid ? 'A solid line means points ON the line are included: the sign needs "or equal to".' : 'A broken line means points on the line are NOT included: no "or equal to".');
                $wrong[] = ['$y ' . $s . ' ' . $line . '$', $why]; }
            return mlb_mcq($r, 'The line $y = ' . $line . '$ is drawn as a ' . ($solid ? 'solid' : 'broken') . ' line, and the region ' . ($above ? 'above' : 'below') . ' it is the wanted region. Which inequality describes the region?', '$y ' . $sym . ' ' . $line . '$', $wrong,
                [($above ? 'Above' : 'Below') . ' the line, $y$ is ' . ($above ? 'greater' : 'less') . ' than $' . $line . '$.', 'A ' . ($solid ? 'solid line is included, so the sign has "or equal to"' : 'broken line is not included, so the sign is strict') . ': $y ' . $sym . ' ' . $line . '$.'],
                'Two questions: which side, and is the line itself included?', 'concept', 40); },
    ],

    /* ── MC-099 Graphical solution: which line to draw; where two cost graphs cross ── */
    'MC-099' => [
        static function (MlbRng $r) { do { $b = $r->int(-4, 4); $p = $r->nz(-6, 6); } while ($b === $p); $q = $r->nz(-6, 6);
            $ln = static function (int $m, int $c): string { return 'y = ' . ($m === 0 ? (string)$c : mlb_lterm($m, 'x') . mlb_sterm($c)); };
            $curve = 'y = x^2' . mlb_sterm($b, 'x'); $target = 'x^2' . mlb_sterm($p, 'x') . mlb_sterm($q) . ' = 0';
            return mlb_mcq($r, 'The curve $' . $curve . '$ has been drawn accurately. Which straight line should be drawn on the same axes to solve $' . $target . '$?', '$' . $ln($b - $p, -$q) . '$',
                [['$' . $ln($p - $b, $q) . '$', 'Rearrange the target so its left side is the curve: $x^2' . mlb_sterm($b, 'x') . ' = \\ldots$ — the signs of the other terms flip as they cross.'],
                 ['$' . $ln($b - $p, $q) . '$', 'Check the constant: it moves to the other side, so its sign changes.'],
                 ['$' . $ln(-$p, -$q) . '$', 'That solves $x^2' . mlb_sterm($p, 'x') . mlb_sterm($q) . ' = 0$ only against $y = x^2$, not against the curve that was drawn.']],
                ['Make the left side match the curve: $x^2' . mlb_sterm($b, 'x') . ' = ' . ($b - $p === 0 ? (string)(-$q) : mlb_lterm($b - $p, 'x') . mlb_sterm(-$q)) . '$.', 'So draw $' . $ln($b - $p, -$q) . '$: where it meets the curve, both equations hold.', 'The $x$-values of the crossing points solve $' . $target . '$.'],
                'Rewrite the equation you want to solve so one side is exactly the curve.', 'reasoning', 60); },
        static function (MlbRng $r) { $x = $r->int(2, 15); $dl = 50 * $r->int(1, 4); $d = 50 * $r->int(2, 6); $b = $d + $dl; $a = 100 * $r->int(2, 8); $c = $a + $x * $dl;
            return mlb_typed('num', 'Taxi A charges ₦' . mlb_p($a) . ' to start plus ₦' . mlb_p($b) . ' per km. Taxi B charges ₦' . mlb_p($c) . ' to start plus ₦' . mlb_p($d) . ' per km. Their cost graphs cross. At what distance, in km?', (string)$x,
                ['Cost A: $y = ' . $a . ' + ' . $b . 'x$. Cost B: $y = ' . $c . ' + ' . $d . 'x$.', 'They cross where the costs are equal: $' . $a . ' + ' . $b . 'x = ' . $c . ' + ' . $d . 'x$.', '$' . $dl . 'x = ' . ($c - $a) . '$, so $x = ' . $x . '$ km.'],
                'Two lines cross where their $y$-values are equal.', 'application', 55, ['unit' => 'km']); },
    ],

    /* ── MC-107 Polynomials: the remainder; a worked expansion with an error ── */
    'MC-107' => [
        static function (MlbRng $r) { $a = $r->nz(-3, 3); $p = $r->int(-5, 5); $q = $r->int(-6, 6); $s = $r->int(-9, 9); $R = $a ** 3 + $p * $a * $a + $q * $a + $s;
            return mlb_typed('num', 'Find the remainder when $' . mlbv2_poly([1, $p, $q, $s]) . '$ is divided by $(x' . mlb_sterm(-$a) . ')$.', (string)$R,
                ['Dividing by $(x' . mlb_sterm(-$a) . ')$ leaves the remainder $f(' . $a . ')$ (the remainder theorem; long division gives the same).', '$f(' . $a . ') = (' . $a . ')^3' . ($p ? mlb_sterm($p) . '(' . $a . ')^2' : '') . ($q ? mlb_sterm($q) . '(' . $a . ')' : '') . mlb_sterm($s) . '$.', '$= ' . $R . '$.'],
                'What value of $x$ makes the divisor zero?', 'procedure', 50); },
        static function (MlbRng $r) { do { $a = $r->nz(-5, 5); $b = $r->nz(-5, 5); $c = $r->nz(-6, 6); } while ($a + $b === $a * $b || $a + $b === 0 || $c + $a * $b === 0);
            $L1 = '$x(' . mlbv2_poly([1, $b, $c]) . ')' . mlb_sterm($a) . '(' . mlbv2_poly([1, $b, $c]) . ')$';
            $L2 = '$x^3' . mlb_sterm($b, 'x^2') . mlb_sterm($c, 'x') . mlb_sterm($a, 'x^2') . mlb_sterm($a * $b, 'x') . mlb_sterm($a * $c) . '$';
            $L3 = '$' . mlbv2_poly([1, $a + $b, $c + $a * $b, $a * $c]) . '$';
            return mlb_error_of($r, 'Find the first mistake in this working to expand $(x' . mlb_sterm($a) . ')(' . mlbv2_poly([1, $b, $c]) . ')$.', [$L1, $L2, $L3], [
                [1, [$L1, '$x^3' . mlb_sterm($b, 'x^2') . mlb_sterm($c, 'x') . mlb_sterm($a, 'x^2') . mlb_sterm($a * $b, 'x') . '$', '$' . mlbv2_poly([1, $a + $b, $c + $a * $b, 0]) . '$'], 'The ' . $a . ' must multiply EVERY term in the bracket, including $' . $c . '$: that gives $' . mlb_lterm($a * $c, '') . '$.'],
                [1, [$L1, '$x^2' . mlb_sterm($b, 'x^2') . mlb_sterm($c, 'x') . mlb_sterm($a, 'x^2') . mlb_sterm($a * $b, 'x') . mlb_sterm($a * $c) . '$', '$' . mlbv2_poly([$b + $a + 1, $c + $a * $b, $a * $c]) . '$'], '$x \\times x^2 = x^3$: the powers ADD.'],
                [2, [$L1, $L2, '$' . mlbv2_poly([1, $a * $b, $c + $a * $b, $a * $c]) . '$'], 'Like terms are ADDED: $' . mlb_lterm($b, 'x^2') . mlb_sterm($a, 'x^2') . ' = ' . mlb_lterm($a + $b, 'x^2') . '$, not $' . mlb_lterm($a * $b, 'x^2') . '$.'],
            ]); },
    ],

    /* ── MC-116 Bearings: two boats; compass points as bearings ── */
    'MC-116' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]); $k = $r->int(1, 3); $t = $r->int(2, 4); $town = $r->pick(MLBV2_TOWNS);
            $u = $a * $k; $v = $b * $k;
            return mlb_typed('num', 'Two boats leave a jetty at ' . $town . ' at the same time. One sails due east at ' . $u . ' km/h and the other due south at ' . $v . ' km/h. How far apart are they after ' . $t . ' hours, in km?', (string)($c * $k * $t),
                ['After ' . $t . ' hours: one is ' . ($u * $t) . ' km east, the other ' . ($v * $t) . ' km south.', 'East and south are at right angles, so use Pythagoras: $d^2 = ' . ($u * $t) . '^2 + ' . ($v * $t) . '^2$.', '$d = \\sqrt{' . (($u * $t) ** 2 + ($v * $t) ** 2) . '} = ' . ($c * $k * $t) . '$ km.'],
                'Sketch the two journeys from the jetty. What angle is between them?', 'application', 55, ['unit' => 'km']); },
        static function (MlbRng $r) { $dirs = ['north-east' => 45, 'south-east' => 135, 'south-west' => 225, 'north-west' => 315]; $d = $r->pick(array_keys($dirs)); $th = $dirs[$d];
            [$P, $Q] = $r->pick([['Kano', 'Zaria'], ['Ilorin', 'Ogbomoso'], ['Owerri', 'Aba'], ['Jos', 'Bauchi'], ['Akure', 'Ondo']]);
            $wrong = [[mlbv2_brg($th + 180), 'That is the bearing of ' . $Q . ' from ' . $P . ' — the journey the other way.'],
                      [mlbv2_brg(360 - $th), 'Bearings are measured CLOCKWISE from north, not anticlockwise.'],
                      [mlbv2_brg($th - 90), 'Start turning from north, not from east.'], [mlbv2_brg($th + 90), 'Start turning from north, not from west.']];
            return mlb_mcq($r, $P . ' is due ' . $d . ' of ' . $Q . '. What is the bearing of ' . $P . ' from ' . $Q . '?', mlbv2_brg($th), $wrong,
                ['Stand at ' . $Q . ' facing north.', ucfirst($d) . ' is exactly halfway between two of the main compass points.', 'Turning clockwise from north to it is $' . $th . '^\\circ$, written ' . mlbv2_brg($th) . '.'],
                'Stand at the place after "from", face north, and turn clockwise.', 'concept', 35); },
    ],

    /* ── MC-130 Linear programming: minimising; which plan breaks a constraint ── */
    'MC-130' => [
        static function (MlbRng $r) { $town = $r->pick(MLBV2_TOWNS);
            do { $pts = [[0, $r->int(8, 14)], [$r->int(2, 5), $r->int(3, 6)], [$r->int(8, 14), 0], [$r->int(10, 16), $r->int(9, 15)]];
                 $a = $r->int(2, 9); $b = $r->int(2, 9); $vals = array_map(static fn($p) => $a * $p[0] + $b * $p[1], $pts); $mn = min($vals);
                 $ok = count(array_keys($vals, $mn)) === 1 && $pts[3][0] > $pts[2][0] && $pts[3][1] > $pts[0][1];
                 /* convex, in this order: every turn the same way */
                 for ($i = 0; $ok && $i < 4; $i++) { [$p0, $p1, $p2] = [$pts[$i], $pts[($i + 1) % 4], $pts[($i + 2) % 4]];
                     if ((($p1[0] - $p0[0]) * ($p2[1] - $p1[1]) - ($p1[1] - $p0[1]) * ($p2[0] - $p1[0])) <= 0) $ok = false; }
            } while (!$ok);
            $cs = implode(', ', array_map(static fn($p) => '$(' . $p[0] . ', ' . $p[1] . ')$', $pts));
            return mlb_typed('num', 'A caterer in ' . $town . ' must choose a plan from a region with corners ' . $cs . '. The cost is $T = ' . $a . 'x + ' . $b . 'y$ (thousand naira). What is the LEAST possible cost?', (string)$mn,
                array_merge(['For a straight-line cost, the least value is at a corner of the region. Try each corner:'],
                    array_map(static fn($p, $v) => '$(' . $p[0] . ', ' . $p[1] . ')$: $T = ' . $a . ' \\times ' . $p[0] . ' + ' . $b . ' \\times ' . $p[1] . ' = ' . $v . '$', $pts, $vals),
                    ['The least is ' . $mn . '.']),
                'Where in the region can the least value of a straight-line cost be found?', 'procedure', 60); },
        static function (MlbRng $r) { $town = $r->pick(MLBV2_TOWNS); $A = $r->int(20, 40); $B = $r->int(3, 8); $C = $r->int(2, 6);
            $plan = static fn($x, $y) => $x . ' shirts and ' . $y . ' trousers';
            $kind = $r->pick(['sum', 'x', 'y']);
            if ($kind === 'sum') { $x = $r->int($B + 2, $A - $C - 2); $y = $A - $x + $r->int(1, 3); $why = 'That makes $' . $x . ' + ' . $y . ' = ' . ($x + $y) . '$, more than ' . $A . '.'; }
            elseif ($kind === 'x') { $x = $B - 1; $y = $r->int($C, $A - $x); $why = $x . ' shirts is fewer than the ' . $B . ' required.'; }
            else { $y = $C - 1; $x = $r->int($B, $A - $y); $why = $y . ' trousers is fewer than the ' . $C . ' required.'; }
            $wrong = []; $seen = [$x . ',' . $y => 1]; $g = 0;
            while (count($wrong) < 3 && $g++ < 200) { $wx = $r->int($B, $A - $C); $wy = $r->int($C, $A - $wx); if (isset($seen[$wx . ',' . $wy])) continue; $seen[$wx . ',' . $wy] = 1;
                $wrong[] = [$plan($wx, $wy), 'This plan is possible: $' . $wx . ' + ' . $wy . ' = ' . ($wx + $wy) . ' \\le ' . $A . '$, $' . $wx . ' \\ge ' . $B . '$ and $' . $wy . ' \\ge ' . $C . '$.']; }
            return mlb_mcq($r, 'A tailor in ' . $town . ' makes $x$ shirts and $y$ trousers a week, with $x + y \\le ' . $A . '$, $x \\ge ' . $B . '$ and $y \\ge ' . $C . '$. Which plan is NOT possible?', $plan($x, $y), $wrong,
                ['Check each plan against all three conditions.', 'For ' . $plan($x, $y) . ': ' . $why],
                'A plan must pass every condition, not just one.', 'reasoning', 50); },
    ],

    /* ── MC-133 Determinants: scaling a matrix; which matrix has no inverse ── */
    'MC-133' => [
        static function (MlbRng $r) { $n = $r->int(2, 3); $k = $r->nz(-9, 9); $m = $r->int(2, $n === 2 ? 5 : 3);
            return mlb_typed('num', 'A $' . $n . ' \\times ' . $n . '$ matrix $A$ has $\\det A = ' . $k . '$. Find $\\det(' . $m . 'A)$.', (string)($m ** $n * $k),
                ['Multiplying a matrix by ' . $m . ' multiplies EVERY row by ' . $m . '.', 'Each row multiplied by ' . $m . ' multiplies the determinant by ' . $m . ', and there are ' . $n . ' rows.', '$\\det(' . $m . 'A) = ' . $m . '^' . $n . ' \\times ' . $k . ' = ' . ($m ** $n * $k) . '$.'],
                'Try it on a simple matrix, such as one with 1s down the diagonal.', 'concept', 45); },
        static function (MlbRng $r) { do { $a = $r->nz(-6, 6); $b = $r->nz(-6, 6); $k = $r->nz(-3, 3); } while ($k === 1);
            $S = $r->int(0, 1) ? [[$a, $b], [$k * $a, $k * $b]] : [[$a, $k * $a], [$b, $k * $b]];
            $det = static fn($M) => $M[0][0] * $M[1][1] - $M[0][1] * $M[1][0];
            $wrong = []; $seen = [mlb_mat($S) => 1]; $g = 0;
            while (count($wrong) < 3 && $g++ < 200) {
                $M = $r->pick([[[$a, $b], [$k * $b, $k * $a]], [[$r->nz(-6, 6), $r->nz(-6, 6)], [$r->nz(-6, 6), $r->nz(-6, 6)]], [[$a, $b], [$k * $a + 1, $k * $b]], [[$b, $a], [$k * $a, $k * $b]]]);
                $D = $det($M); if ($D === 0 || isset($seen[mlb_mat($M)])) continue; $seen[mlb_mat($M)] = 1;
                $wrong[] = ['$' . mlb_mat($M) . '$', 'Its determinant is $' . $M[0][0] . ' \\times ' . ($M[1][1] < 0 ? '(' . $M[1][1] . ')' : $M[1][1]) . ' - ' . ($M[0][1] < 0 ? '(' . $M[0][1] . ')' : $M[0][1]) . ' \\times ' . ($M[1][0] < 0 ? '(' . $M[1][0] . ')' : $M[1][0]) . ' = ' . $D . '$, not 0, so it has an inverse.'];
            }
            return mlb_mcq($r, 'Which of these matrices has NO inverse?', '$' . mlb_mat($S) . '$', $wrong,
                ['A matrix has no inverse exactly when its determinant is 0.', 'For $' . mlb_mat($S) . '$: $' . $S[0][0] . ' \\times ' . ($S[1][1] < 0 ? '(' . $S[1][1] . ')' : $S[1][1]) . ' - ' . ($S[0][1] < 0 ? '(' . $S[0][1] . ')' : $S[0][1]) . ' \\times ' . ($S[1][0] < 0 ? '(' . $S[1][0] . ')' : $S[1][0]) . ' = 0$.', 'One row (or column) is a multiple of the other, which is why the determinant vanishes.'],
                'Work out $ad - bc$ for each one.', 'concept', 60); },
    ],

    /* ── MC-137 Vectors: a missing component; the unit vector ── */
    'MC-137' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]); if ($r->int(0, 1)) [$a, $b] = [$b, $a]; $s = $r->int(1, 3); $a *= $s; $b *= $s; $c *= $s; $bs = $r->int(0, 1) ? $b : -$b;
            $top = $r->int(0, 1) === 1;
            return mlb_typed('num', 'The vector $' . ($top ? mlbv2_col('k', $bs) : mlbv2_col($bs, 'k')) . '$ has magnitude ' . $c . ', and $k > 0$. Find $k$.', (string)$a,
                ['The magnitude is $\\sqrt{k^2 + ' . ($bs < 0 ? '(' . $bs . ')' : $bs) . '^2} = ' . $c . '$.', 'Square both sides: $k^2 + ' . ($b * $b) . ' = ' . ($c * $c) . '$, so $k^2 = ' . ($a * $a) . '$.', '$k > 0$, so $k = ' . $a . '$.'],
                'Write the magnitude formula with $k$ in it, and solve.', 'procedure', 45); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]); if ($r->int(0, 1)) [$a, $b] = [$b, $a]; $a *= $r->int(0, 1) ? 1 : -1; $b *= $r->int(0, 1) ? 1 : -1;
            $col = static fn($p, $q) => '$' . mlbv2_col($p, $q) . '$'; $sum = abs($a) + abs($b);
            return mlb_mcq($r, 'Which is the unit vector in the same direction as $' . mlbv2_col($a, $b) . '$?', $col(mlb_ftex($a, $c), mlb_ftex($b, $c)),
                [[$col(mlb_ftex($a, $sum), mlb_ftex($b, $sum)), 'Divide by the MAGNITUDE, $' . $c . '$, not by the sum of the components.'],
                 [$col(mlb_ftex($a, $c * $c), mlb_ftex($b, $c * $c)), 'Divide once by $' . $c . '$: dividing by $' . ($c * $c) . '$ leaves a vector of length $' . mlb_ftex(1, $c) . '$.'],
                 [$col(mlb_ftex($c, $a), mlb_ftex($c, $b)), 'Divide the components by the magnitude, not the other way round.']],
                ['Its magnitude is $\\sqrt{' . ($a * $a) . ' + ' . ($b * $b) . '} = ' . $c . '$.', 'A unit vector has magnitude 1: divide each component by ' . $c . '.', 'So it is ' . $col(mlb_ftex($a, $c), mlb_ftex($b, $c)) . '.'],
                'Which one has length 1 AND points the same way?', 'concept', 45); },
    ],

    /* ── MC-138 Vector arithmetic: solve for a vector; the fourth corner; a worked error ── */
    'MC-138' => [
        static function (MlbRng $r) { $x = [$r->int(-6, 6), $r->int(-6, 6)]; $a = [$r->int(-8, 8), $r->int(-8, 8)]; $b = [$a[0] + 2 * $x[0], $a[1] + 2 * $x[1]];
            return mlb_typed('pair', 'Find the vector $\\mathbf{x}$ such that $\\mathbf{a} + 2\\mathbf{x} = \\mathbf{b}$, where $\\mathbf{a} = ' . mlbv2_col($a[0], $a[1]) . '$ and $\\mathbf{b} = ' . mlbv2_col($b[0], $b[1]) . '$.', $x,
                ['Subtract $\\mathbf{a}$ from both sides: $2\\mathbf{x} = \\mathbf{b} - \\mathbf{a} = ' . mlbv2_col($b[0] - $a[0], $b[1] - $a[1]) . '$.', 'Divide by 2: $\\mathbf{x} = ' . mlbv2_col($x[0], $x[1]) . '$.'],
                'Solve it like an equation in one letter — vectors follow the same rules.', 'procedure', 45, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $A = [$r->int(-5, 5), $r->int(-5, 5)]; do { $u = [$r->int(-5, 5), $r->int(-5, 5)]; $v = [$r->int(-5, 5), $r->int(-5, 5)]; } while ($u[0] * $v[1] - $u[1] * $v[0] === 0);
            $B = [$A[0] + $u[0], $A[1] + $u[1]]; $D = [$A[0] + $v[0], $A[1] + $v[1]]; $C = [$B[0] + $v[0], $B[1] + $v[1]];
            return mlb_typed('pair', '$ABCD$ is a parallelogram. The position vectors of $A$, $B$ and $C$ are $' . mlbv2_col($A[0], $A[1]) . '$, $' . mlbv2_col($B[0], $B[1]) . '$ and $' . mlbv2_col($C[0], $C[1]) . '$. Find the position vector of $D$.', $D,
                ['In a parallelogram $\\overrightarrow{AD} = \\overrightarrow{BC}$.', '$\\overrightarrow{BC} = \\mathbf{c} - \\mathbf{b} = ' . mlbv2_col($v[0], $v[1]) . '$.', '$\\mathbf{d} = \\mathbf{a} + \\overrightarrow{BC} = ' . mlbv2_col($D[0], $D[1]) . '$.'],
                'Opposite sides of a parallelogram are equal vectors. Which side matches $AD$?', 'application', 55, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $m = $r->int(2, 4); $n = $r->int(2, 4); do { $a = [$r->nz(-5, 5), $r->nz(-5, 5)]; $b = [$r->nz(-5, 5), $r->nz(-5, 5)]; } while ($n + $b[0] === $n * $b[0] && $n + $b[1] === $n * $b[1]);
            $ma = [$m * $a[0], $m * $a[1]]; $nb = [$n * $b[0], $n * $b[1]]; $res = [$ma[0] - $nb[0], $ma[1] - $nb[1]];
            $L = static fn($lhs, $v) => '$' . $lhs . ' = ' . mlbv2_col($v[0], $v[1]) . '$';
            $right = [$L($m . '\\mathbf{a}', $ma), $L($n . '\\mathbf{b}', $nb), $L($m . '\\mathbf{a} - ' . $n . '\\mathbf{b}', $res)];
            return mlb_error_of($r, 'Find the first mistake: work out $' . $m . '\\mathbf{a} - ' . $n . '\\mathbf{b}$ when $\\mathbf{a} = ' . mlbv2_col($a[0], $a[1]) . '$ and $\\mathbf{b} = ' . mlbv2_col($b[0], $b[1]) . '$.', $right, [
                [0, [$L($m . '\\mathbf{a}', [$ma[0], $a[1]]), $right[1], $L($m . '\\mathbf{a} - ' . $n . '\\mathbf{b}', [$ma[0] - $nb[0], $a[1] - $nb[1]])], 'A scalar multiplies EVERY component: the bottom of $' . $m . '\\mathbf{a}$ is $' . $ma[1] . '$.'],
                [2, [$right[0], $right[1], $L($m . '\\mathbf{a} - ' . $n . '\\mathbf{b}', [$ma[0] + $nb[0], $ma[1] + $nb[1]])], 'The components of $' . $n . '\\mathbf{b}$ must be SUBTRACTED, not added.'],
                [1, [$right[0], $L($n . '\\mathbf{b}', [$n + $b[0], $n + $b[1]]), $L($m . '\\mathbf{a} - ' . $n . '\\mathbf{b}', [$ma[0] - $n - $b[0], $ma[1] - $n - $b[1]])], '$' . $n . '\\mathbf{b}$ means each component MULTIPLIED by ' . $n . ', not ' . $n . ' added.'],
            ]); },
    ],

    /* ── MC-155 Derivatives: a rate in context; ln(ax) and the chain rule ── */
    'MC-155' => [
        static function (MlbRng $r) { $k = $r->int(2, 12); $T = $r->int(1, 9);
            return mlb_typed('frac', 'After $t$ hours of rain, the water in a tank is $h = ' . $k . '\\ln(t + 1)$ metres deep. How fast is the depth rising when $t = ' . $T . '$, in metres per hour?', mlb_frac($k, $T + 1),
                ['The rate of rise is $\\frac{dh}{dt}$.', '$\\frac{d}{dt}\\ln(t + 1) = \\frac{1}{t + 1}$, so $\\frac{dh}{dt} = \\frac{' . $k . '}{t + 1}$.', 'At $t = ' . $T . '$: $\\frac{' . $k . '}{' . ($T + 1) . '} = ' . mlb_ftex($k, $T + 1) . '$ m per hour.'],
                '"How fast" is a derivative. Differentiate, then substitute.', 'application', 50); },
        static function (MlbRng $r) { $a = $r->int(2, 9);
            return mlb_mcq($r, 'Differentiate $\\ln(' . $a . 'x)$ with respect to $x$.', '$\\frac{1}{x}$',
                [['$\\frac{' . $a . '}{x}$', 'The chain rule gives $' . $a . ' \\times \\frac{1}{' . $a . 'x}$, and the ' . $a . 's cancel.'],
                 ['$\\frac{1}{' . $a . 'x}$', 'You also multiply by the derivative of the inside, $' . $a . 'x$, which is ' . $a . '.'],
                 ['$\\frac{\\ln ' . $a . '}{x}$', '$\\ln(' . $a . 'x) = \\ln ' . $a . ' + \\ln x$, and $\\ln ' . $a . '$ is a constant, so its derivative is 0.']],
                ['Chain rule: $\\frac{d}{dx}\\ln(' . $a . 'x) = \\frac{1}{' . $a . 'x} \\times ' . $a . ' = \\frac{1}{x}$.', 'Or: $\\ln(' . $a . 'x) = \\ln ' . $a . ' + \\ln x$, a constant plus $\\ln x$.'],
                'Split the log first, or use the chain rule — both give the same.', 'concept', 40); },
    ],

    /* ── MC-160 Integration: the trapezium rule on measured data; a solid of revolution ── */
    'MC-160' => [
        static function (MlbRng $r) { $n = $r->int(4, 6); $h = $r->pick([2, 4]); $d = []; for ($i = 1; $i < $n; $i++) $d[] = $r->int(1, 6); $riv = $r->pick(MLBV2_RIVERS);
            $all = array_merge([0], $d, [0]); $key = $h * array_sum($d);
            return mlb_typed('num', 'A survey across ' . $riv . ' measures the depth every ' . $h . ' m from bank to bank: ' . implode(', ', $all) . ' m. Use the trapezium rule to estimate the area of the cross-section, in m².', (string)$key,
                ['Trapezium rule: $\\frac{h}{2}[\\text{first} + \\text{last} + 2(\\text{the rest})]$, with $h = ' . $h . '$.', 'First and last are 0 (the banks); the rest add to ' . array_sum($d) . '.', 'Area $\\approx \\frac{' . $h . '}{2}[0 + 0 + 2 \\times ' . array_sum($d) . '] = ' . $key . '$ m².'],
                'The depths are the heights of the strips; the strip width is the spacing.', 'application', 60, ['unit' => 'm²']); },
        static function (MlbRng $r) { $c = $r->int(1, 3); $a = $r->int(1, 3);
            return mlb_typed('frac', 'Find the volume generated when the region under $y = ' . ($c === 1 ? '' : $c) . 'x^2$, between $x = 0$ and $x = ' . $a . '$, is turned once about the $x$-axis. Write it as $k\\pi$ and give $k$.', mlb_frac($c * $c * $a ** 5, 5),
                ['$V = \\pi\\int_0^{' . $a . '} y^2\\,dx = \\pi\\int_0^{' . $a . '} ' . ($c * $c === 1 ? '' : $c * $c) . 'x^4\\,dx$.', '$= \\pi\\left[\\frac{' . ($c * $c === 1 ? '' : $c * $c) . 'x^5}{5}\\right]_0^{' . $a . '} = \\frac{' . ($c * $c * $a ** 5) . '}{5}\\pi$.', 'So $k = ' . mlb_ftex($c * $c * $a ** 5, 5) . '$.'],
                'It is $y$ SQUARED that goes in the integral.', 'procedure', 55); },
    ],

    /* ── MC-175 Congruences: an inverse mod p; choosing the number that meets BOTH conditions ── */
    'MC-175' => [
        static function (MlbRng $r) { $p = $r->pick([7, 11, 13, 17, 19, 23]); $a = $r->int(2, $p - 1); $x = 1; while (($a * $x) % $p !== 1) $x++;
            return mlb_typed('num', 'The inverse of ' . $a . ' modulo ' . $p . ' is the whole number $x$, from 1 to ' . ($p - 1) . ', with $' . $a . 'x \\equiv 1 \\pmod{' . $p . '}$. Find it.', (string)$x,
                ['Look for a multiple of ' . $a . ' that is one more than a multiple of ' . $p . '.', '$' . $a . ' \\times ' . $x . ' = ' . ($a * $x) . ' = ' . intdiv($a * $x, $p) . ' \\times ' . $p . ' + 1$.', 'So $x = ' . $x . '$.'],
                'List the multiples of ' . $a . ' and divide each by ' . $p . '.', 'procedure', 55); },
        static function (MlbRng $r) { [$m, $n] = $r->pick([[3, 4], [3, 5], [4, 5], [5, 6], [3, 7], [4, 7], [5, 7]]); $a = $r->int(1, $m - 1); $b = $r->int(0, $n - 1);
            $s = $a; while ($s % $n !== $b) $s += $m; $M = $m * $n;
            $first = []; for ($t = $a; $t < 2 * $M; $t += $m) if ($t % $n !== $b) $first[] = $t;
            $second = []; for ($t = $b === 0 ? $n : $b; $t < 2 * $M; $t += $n) if ($t % $m !== $a) $second[] = $t;
            $f1 = $r->pick($first); $f2 = $r->pick($second); do { $f3 = $r->pick($second); } while ($f3 === $f2 && count($second) > 1);
            return mlb_mcq($r, 'Which of these satisfies both $x \\equiv ' . $a . ' \\pmod{' . $m . '}$ and $x \\equiv ' . $b . ' \\pmod{' . $n . '}$?', (string)$s,
                [[(string)$f1, $f1 . ' leaves remainder ' . $a . ' on division by ' . $m . ', but remainder ' . ($f1 % $n) . ' (not ' . $b . ') on division by ' . $n . '.'],
                 [(string)$f2, $f2 . ' leaves remainder ' . $b . ' on division by ' . $n . ', but remainder ' . ($f2 % $m) . ' (not ' . $a . ') on division by ' . $m . '.'],
                 [(string)$f3, $f3 . ' leaves remainder ' . $b . ' on division by ' . $n . ', but remainder ' . ($f3 % $m) . ' (not ' . $a . ') on division by ' . $m . '.']],
                ['Check each option against BOTH conditions.', $s . ' = ' . intdiv($s, $m) . ' × ' . $m . ' + ' . $a . ', and ' . $s . ' = ' . intdiv($s, $n) . ' × ' . $n . ' + ' . $b . '.', 'Only ' . $s . ' passes both.'],
                'Passing one condition is not enough.', 'reasoning', 50); },
    ],

    /* ── MC-176 Diophantine equations: the one positive solution; a shopping problem ── */
    'MC-176' => [
        static function (MlbRng $r) {
            do { $a = $r->int(3, 13); $b = $r->int(3, 13); $x0 = $r->int(1, 8); $y0 = $r->int(1, 8); $c = $a * $x0 + $b * $y0; $cnt = 0;
                 if (mlb_gcd($a, $b) === 1 && $a !== $b) for ($x = 1; $a * $x < $c; $x++) if (($c - $a * $x) % $b === 0) $cnt++;
            } while (mlb_gcd($a, $b) !== 1 || $a === $b || $cnt !== 1);
            return mlb_typed('pair', 'Find the only pair of positive whole numbers $x$ and $y$ with $' . $a . 'x + ' . $b . 'y = ' . $c . '$.', [$x0, $y0],
                ['Try $x = 1, 2, 3, \\ldots$ and check whether $' . $c . ' - ' . $a . 'x$ is a multiple of ' . $b . '.', 'At $x = ' . $x0 . '$: $' . $c . ' - ' . ($a * $x0) . ' = ' . ($b * $y0) . ' = ' . $b . ' \\times ' . $y0 . '$.', 'So $x = ' . $x0 . '$, $y = ' . $y0 . '$.'],
                'Work through the values of $x$ that keep $y$ positive — there are not many.', 'procedure', 60, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES);
            do { $a = $r->int(3, 9); $b = $r->int(3, 9); $x0 = $r->int(1, 6); $y0 = $r->int(1, 6); $c = $a * $x0 + $b * $y0; $sol = [];
                 for ($x = 1; $a * $x < $c; $x++) if (($c - $a * $x) % $b === 0) $sol[] = $x;
            } while (mlb_gcd($a, $b) !== 1 || $a === $b || count($sol) !== 1);
            $wrong = []; foreach ([$x0 + 1, $x0 + 2, $x0 > 1 ? $x0 - 1 : $x0 + 3, $x0 + 4] as $w) { if (count($wrong) >= 3 || $a * $w >= $c) continue;
                $wrong[] = [(string)$w, 'Then the books would cost ₦' . (50 * ($c - $a * $w)) . ', which is not a whole number of ₦' . (50 * $b) . ' books.']; }
            while (count($wrong) < 2) { $w = $x0 + 5 + count($wrong); $wrong[] = [(string)$w, $w . ' pens alone cost ₦' . (50 * $a * $w) . ' — more than ₦' . (50 * $c) . '.']; }
            return mlb_mcq($r, $who . ' spends exactly ₦' . mlb_p(50 * $c) . ' on pens at ₦' . (50 * $a) . ' each and exercise books at ₦' . (50 * $b) . ' each, and buys at least one of each. How many pens did ' . $who . ' buy?', (string)$x0, $wrong,
                ['In units of ₦50: $' . $a . 'x + ' . $b . 'y = ' . $c . '$, with $x, y \\ge 1$.', 'Only $x = ' . $x0 . '$ leaves a multiple of ' . $b . ': $' . $c . ' - ' . ($a * $x0) . ' = ' . ($b * $y0) . '$, so $y = ' . $y0 . '$.'],
                'For each option, is the money left a whole number of books?', 'application', 60); },
    ],

    /* ── MC-179 Totient: the product formula; Euler's theorem at work ── */
    'MC-179' => [
        static function (MlbRng $r) { $e2 = $r->int(1, 3); $e3 = $r->int(1, 2); $p = $r->pick([5, 7, 11]); $n = 2 ** $e2 * 3 ** $e3 * $p;
            $phi = (int)round($n * (1 / 2) * (2 / 3) * (($p - 1) / $p));
            return mlb_typed('num', 'Find $\\varphi(n)$ for $n = 2^{' . $e2 . '} \\times 3^{' . $e3 . '} \\times ' . $p . ' = ' . $n . '$.', (string)$phi,
                ['$\\varphi(n) = n\\left(1 - \\frac{1}{2}\\right)\\left(1 - \\frac{1}{3}\\right)\\left(1 - \\frac{1}{' . $p . '}\\right)$, one bracket per prime.', '$= ' . $n . ' \\times \\frac{1}{2} \\times \\frac{2}{3} \\times \\frac{' . ($p - 1) . '}{' . $p . '}$.', '$= ' . $phi . '$.'],
                'Use one factor for each DIFFERENT prime — the powers do not add extra brackets.', 'procedure', 55); },
        static function (MlbRng $r) { $m = $r->pick([7, 9, 10, 11, 13]); do { $a = $r->int(2, 12); } while (mlb_gcd($a, $m) !== 1 || $a % $m === 1); $N = $r->int(50, 300);
            $ph = 0; for ($k = 1; $k <= $m; $k++) if (mlb_gcd($k, $m) === 1) $ph++; $q = intdiv($N, $ph); $rr = $N % $ph; $key = mlbv2_powmod($a, $N, $m);
            return mlb_typed('num', 'What is the remainder when $' . $a . '^{' . $N . '}$ is divided by ' . $m . '?', (string)$key,
                ['$\\gcd(' . $a . ', ' . $m . ') = 1$ and $\\varphi(' . $m . ') = ' . $ph . '$, so Euler\'s theorem gives $' . $a . '^{' . $ph . '} \\equiv 1 \\pmod{' . $m . '}$.', '$' . $N . ' = ' . $q . ' \\times ' . $ph . ' + ' . $rr . '$, so $' . $a . '^{' . $N . '} \\equiv ' . $a . '^{' . $rr . '} \\pmod{' . $m . '}$.', '$' . $a . '^{' . $rr . '} \\equiv ' . $key . '$, so the remainder is ' . $key . '.'],
                'Which power of ' . $a . ' is certain to leave remainder 1?', 'challenge', 75); },
    ],

    /* ── MC-180 Factoring tricks: a prime as a difference of squares; counting with brackets; the right first step ── */
    'MC-180' => [
        static function (MlbRng $r) { $p = $r->pick([7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]);
            return mlb_typed('pair', 'Find the positive whole numbers $x$ and $y$ with $x^2 - y^2 = ' . $p . '$.', [intdiv($p + 1, 2), intdiv($p - 1, 2)],
                ['Factorise: $(x - y)(x + y) = ' . $p . '$.', $p . ' is prime, so the only positive split is $1 \\times ' . $p . '$: $x - y = 1$ and $x + y = ' . $p . '$.', 'Add: $2x = ' . ($p + 1) . '$, so $x = ' . intdiv($p + 1, 2) . '$ and $y = ' . intdiv($p - 1, 2) . '$.'],
                'Turn the difference of two squares into a product.', 'challenge', 60, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { do { $a = $r->int(1, 4); $b = $r->int(1, 4); $N = $r->pick([24, 36, 48, 60, 72, 84, 90, 96, 120]);
            $cnt = 0; $list = []; for ($d = 1; $d <= $N; $d++) if ($N % $d === 0 && $d >= $a + 1 && intdiv($N, $d) >= $b + 1) { $cnt++; $list[] = $d . ' \\times ' . intdiv($N, $d); } } while ($cnt < 2);
            return mlb_typed('num', 'Count the solutions in positive whole numbers of $(x + ' . $a . ')(y + ' . $b . ') = ' . $N . '$.', (string)$cnt,
                ['Each solution splits ' . $N . ' into two factors: $x + ' . $a . '$ and $y + ' . $b . '$.', 'With $x, y \\ge 1$: $x + ' . $a . ' \\ge ' . ($a + 1) . '$ and $y + ' . $b . ' \\ge ' . ($b + 1) . '$.', 'The splits that work: $' . implode('$, $', $list) . '$ — that is ' . $cnt . '.'],
                'List the factor pairs of ' . $N . ', in order, and check each one.', 'challenge', 75); },
        static function (MlbRng $r) { do { $p = $r->int(1, 7); $q = $r->int(1, 7); } while ($p === $q); $rr = $r->int(5, 40);
            return mlb_mcq($r, 'Which step turns $xy' . mlb_sterm($p, 'x') . mlb_sterm($q, 'y') . ' = ' . $rr . '$ into a product of two brackets?', 'Add ' . ($p * $q) . ' to both sides: $(x + ' . $q . ')(y + ' . $p . ') = ' . ($rr + $p * $q) . '$',
                [['Add ' . ($p * $q) . ' to both sides: $(x + ' . $p . ')(y + ' . $q . ') = ' . ($rr + $p * $q) . '$', 'Expand it: $(x + ' . $p . ')(y + ' . $q . ')$ gives $' . mlb_lterm($q, 'x') . mlb_sterm($p, 'y') . '$ — the numbers are on the wrong letters.'],
                 ['Subtract ' . ($p * $q) . ' from both sides: $(x + ' . $q . ')(y + ' . $p . ') = ' . ($rr - $p * $q) . '$', 'The bracket product has an EXTRA $+' . ($p * $q) . '$, so add it to the other side as well.'],
                 ['Nothing is needed: $(x + ' . $q . ')(y + ' . $p . ') = ' . $rr . '$', 'Expand the brackets: there is a $+' . ($p * $q) . '$ the equation does not have.']],
                ['$(x + ' . $q . ')(y + ' . $p . ') = xy' . mlb_sterm($p, 'x') . mlb_sterm($q, 'y') . ' + ' . ($p * $q) . '$.', 'So add ' . ($p * $q) . ' to both sides: $(x + ' . $q . ')(y + ' . $p . ') = ' . ($rr + $p * $q) . '$.', 'Now the factor pairs of ' . ($rr + $p * $q) . ' give every solution.'],
                'Expand each option\'s brackets and compare with the equation.', 'reasoning', 50); },
    ],

    /* ── MC-190 Invariants: what never changes; parity of handshakes ── */
    'MC-190' => [
        static function (MlbRng $r) { $n = $r->int(5, 30); $S = intdiv($n * ($n + 1), 2);
            return mlb_typed('num', 'Start with the whole numbers from 1 to ' . $n . '. At each step, pick any two, erase them, and write their sum minus 1. When a single number remains, what is it?', (string)($S - ($n - 1)),
                ['Look for what changes in a fixed way: each step, the TOTAL on the board drops by exactly 1.', 'There are ' . ($n - 1) . ' steps (each removes one number). The total starts at $1 + 2 + \\cdots + ' . $n . ' = ' . $S . '$.', 'So the last number is $' . $S . ' - ' . ($n - 1) . ' = ' . ($S - $n + 1) . '$, whichever pairs are chosen.'],
                'Do not try every order. What happens to the sum of all the numbers at each step?', 'challenge', 75); },
        static function (MlbRng $r) { $ok = $r->int(0, 1) === 1;
            if ($ok) { do { $n = $r->int(5, 15); $k = $r->int(2, $n - 1); } while (($n * $k) % 2 === 1); } else { do { $n = $r->int(5, 15); $k = $r->int(1, $n - 1); } while ($n % 2 === 0 || $k % 2 === 0); }
            $yes = 'Yes — it can be arranged'; $no = 'No — the handshakes counted person by person would total an odd number, but each handshake is counted twice';
            $wrong = [[$ok ? $no : $yes, $ok ? $n . ' × ' . $k . ' = ' . ($n * $k) . ' is even, so the count gives no obstacle — and it can be arranged.' : $n . ' × ' . $k . ' = ' . ($n * $k) . ' is odd, but every handshake involves two people.'],
                      ['No — someone would have to shake their own hand', 'Each person needs only ' . $k . ' of the other ' . ($n - 1) . ' people.'],
                      ['It depends on the order in which people arrive', 'The order cannot matter: only the totals do.']];
            return mlb_mcq($r, 'At a meeting of ' . $n . ' people, could each person shake hands with exactly ' . $k . ' of the others?', $ok ? $yes : $no, $wrong,
                ['Count handshakes person by person: $' . $n . ' \\times ' . $k . ' = ' . ($n * $k) . '$. Each handshake is counted twice, so this total must be even.',
                 $ok ? 'It is even, and it can be done: sit the people in a circle and let each shake hands with the nearest ones on each side (and across, if ' . $k . ' is odd).' : 'It is odd, so it is impossible.'],
                'Count every handshake twice — once from each person. What must be true of that total?', 'reasoning', 60); },
    ],

    /* ── MC-192 Telescoping: how many terms; logs that cancel; the right split; the limit ── */
    'MC-192' => [
        static function (MlbRng $r) { $n = $r->pick([3, 4, 9, 19, 24, 49, 99, 199, 249, 499, 999]); $D = mlb_dec($n / ($n + 1));
            return mlb_typed('num', 'How many terms of $\\frac{1}{1 \\times 2} + \\frac{1}{2 \\times 3} + \\frac{1}{3 \\times 4} + \\cdots$ must be added to make exactly ' . $D . '?', (string)$n,
                ['$\\frac{1}{k(k + 1)} = \\frac{1}{k} - \\frac{1}{k + 1}$, so $n$ terms add to $1 - \\frac{1}{n + 1} = \\frac{n}{n + 1}$.', 'Set $\\frac{n}{n + 1} = ' . $D . '$: then $\\frac{1}{n + 1} = ' . mlb_dec(1 / ($n + 1)) . '$.', '$n + 1 = ' . ($n + 1) . '$, so $n = ' . $n . '$.'],
                'Find a formula for the sum of the first $n$ terms first.', 'challenge', 70); },
        static function (MlbRng $r) { $m = $r->int(1, 5); $k = $r->int(1, 3); $N = $m * 10 ** $k;
            return mlb_typed('num', 'Find the exact value of $\\log_{10}\\frac{' . ($m + 1) . '}{' . $m . '} + \\log_{10}\\frac{' . ($m + 2) . '}{' . ($m + 1) . '} + \\cdots + \\log_{10}\\frac{' . $N . '}{' . ($N - 1) . '}$.', (string)$k,
                ['Adding logs multiplies what is inside: $\\log_{10}\\left(\\frac{' . ($m + 1) . '}{' . $m . '} \\times \\frac{' . ($m + 2) . '}{' . ($m + 1) . '} \\times \\cdots \\times \\frac{' . $N . '}{' . ($N - 1) . '}\\right)$.', 'Each top cancels the next bottom, leaving $\\frac{' . $N . '}{' . $m . '} = ' . (10 ** $k) . '$.', '$\\log_{10} ' . (10 ** $k) . ' = ' . $k . '$.'],
                'Combine the logs into one, then look at the product.', 'challenge', 70); },
        static function (MlbRng $r) { $d = $r->int(2, 5);
            return mlb_mcq($r, 'Which of these is equal to $\\frac{1}{k(k + ' . $d . ')}$ for every $k$, and so makes a sum of such terms telescope?', '$\\frac{1}{' . $d . '}\\left(\\frac{1}{k} - \\frac{1}{k + ' . $d . '}\\right)$',
                [['$\\frac{1}{k} - \\frac{1}{k + ' . $d . '}$', 'Combine it: $\\frac{' . $d . '}{k(k + ' . $d . ')}$ — ' . $d . ' times too big.'],
                 ['$\\frac{1}{' . $d . '}\\left(\\frac{1}{k} + \\frac{1}{k + ' . $d . '}\\right)$', 'A plus gives $\\frac{2k + ' . $d . '}{' . $d . 'k(k + ' . $d . ')}$; only a MINUS cancels the $k$s.'],
                 ['$\\frac{1}{k} - \\frac{1}{k + 1}$', 'That equals $\\frac{1}{k(k + 1)}$: the gap must be ' . $d . ', not 1.']],
                ['$\\frac{1}{k} - \\frac{1}{k + ' . $d . '} = \\frac{(k + ' . $d . ') - k}{k(k + ' . $d . ')} = \\frac{' . $d . '}{k(k + ' . $d . ')}$.', 'Divide by ' . $d . ': $\\frac{1}{k(k + ' . $d . ')} = \\frac{1}{' . $d . '}\\left(\\frac{1}{k} - \\frac{1}{k + ' . $d . '}\\right)$.'],
                'Put each option over a common denominator and check.', 'concept', 50); },
        static function (MlbRng $r) { $d = $r->int(1, 4); $hn = 0; $hd = 1; for ($j = 1; $j <= $d; $j++) { $hn = $hn * $j + $hd; $hd *= $j; } $kn = $hn; $kd = $hd * $d;
            $t = static fn($k) => '\\frac{1}{' . $k . ' \\times ' . ($k + $d) . '}';
            return mlb_typed('frac', 'As more and more terms are added, the sum $' . $t(1) . ' + ' . $t(2) . ' + ' . $t(3) . ' + \\cdots$ gets closer and closer to a fixed value. What is it?', mlb_frac($kn, $kd),
                ['Split each term: $\\frac{1}{k(k + ' . $d . ')} = \\frac{1}{' . $d . '}\\left(\\frac{1}{k} - \\frac{1}{k + ' . $d . '}\\right)$.', 'Every $\\frac{1}{k}$ after the first ' . $d . ' is cancelled by a later minus, and the tail of minuses shrinks to 0.', 'What survives is $\\frac{1}{' . $d . '}\\left(' . implode(' + ', array_map(static fn($j) => '\\frac{1}{' . $j . '}', range(1, $d))) . '\\right) = ' . mlb_ftex($kn, $kd) . '$.'],
                'Split each term into a difference, and see which pieces never cancel.', 'challenge', 80); },
    ],

    /* ── MC-195 Functional equations: recover f(x); the log property ── */
    'MC-195' => [
        static function (MlbRng $r) { $a = $r->nz(-6, 6); $k = $r->nz(-5, 5); $c = $r->int(-9, 9); $c0 = $c - $a * $k;
            return mlb_typed('expr', 'For every $x$, $f(x' . mlb_sterm($k) . ') = ' . mlb_lterm($a, 'x') . mlb_sterm($c) . '$. Write $f(x)$ as an expression in $x$.', mlb_lterm($a, 'x') . ($c0 < 0 ? '' : '+') . $c0,
                ['Let $t = x' . mlb_sterm($k) . '$, so $x = t' . mlb_sterm(-$k) . '$.', '$f(t) = ' . $a . '(t' . mlb_sterm(-$k) . ')' . mlb_sterm($c) . ' = ' . mlb_lterm($a, 't') . mlb_sterm($c0) . '$.', 'Rename the letter: $f(x) = ' . mlb_lterm($a, 'x') . mlb_sterm($c0) . '$.'],
                'Call the inside of the bracket a new letter, and write $x$ in terms of it.', 'challenge', 60); },
        static function (MlbRng $r) { $b = $r->int(2, 9);
            return mlb_mcq($r, 'For all positive $x$ and $y$, $f(xy) = f(x) + f(y)$. Which of these could $f$ be?', '$f(x) = \\log_{' . $b . '} x$',
                [['$f(x) = ' . $b . '^x$', '$' . $b . '^{xy}$ is not $' . $b . '^x + ' . $b . '^y$; powers turn SUMS into products — the opposite.'],
                 ['$f(x) = ' . $b . 'x$', '$' . $b . 'xy$ is not $' . $b . 'x + ' . $b . 'y$ (try $x = y = 2$).'],
                 ['$f(x) = x^' . $b . '$', '$(xy)^' . $b . ' = x^' . $b . 'y^' . $b . '$: a product, not a sum.']],
                ['The rule turns a PRODUCT into a SUM — the defining property of a logarithm.', '$\\log_{' . $b . '}(xy) = \\log_{' . $b . '} x + \\log_{' . $b . '} y$. ✓'],
                'Test each option with $x = y = 2$.', 'concept', 45); },
    ],

    /* ── MC-197 Complex numbers: division; the argument and the quadrant ── */
    'MC-197' => [
        static function (MlbRng $r) { $x = $r->nz(-5, 5); $y = $r->nz(-5, 5); do { $c = $r->nz(-4, 4); $d = $r->nz(-4, 4); $p = $x * $c - $y * $d; $q = $x * $d + $y * $c; } while ($p === 0 || $q === 0); $den = $c * $c + $d * $d;
            $cx = static fn($re, $im) => $re . ($im < 0 ? ' - ' : ' + ') . (abs($im) === 1 ? '' : abs($im)) . 'i';
            return mlb_typed('pair', 'Write $\\frac{' . $cx($p, $q) . '}{' . $cx($c, $d) . '}$ in the form $x + yi$. Give $x$ and $y$.', [$x, $y],
                ['Multiply top and bottom by the conjugate $' . $cx($c, -$d) . '$.', 'The bottom becomes $' . $c . '^2 + ' . ($d < 0 ? '(' . $d . ')' : $d) . '^2 = ' . $den . '$; the top becomes $' . $cx($x * $den, $y * $den) . '$.', 'Divide by ' . $den . ': $' . $cx($x, $y) . '$.'],
                'What do you multiply a complex number by to make it real?', 'procedure', 70, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $type = $r->int(0, 2); $base = [45, 30, 60][$type]; $sx = $r->pick([1, -1]); $sy = $r->pick([1, -1]); $k = $r->int(1, 5);
            $ang = $sx > 0 ? ($sy > 0 ? $base : -$base) : ($sy > 0 ? 180 - $base : -(180 - $base));
            $re = $type === 0 ? (string)($sx * $k) : ($type === 1 ? ($sx < 0 ? '-' : '') . ($k === 1 ? '' : $k) . '\\sqrt{3}' : (string)($sx * $k));
            $imAbs = $type === 0 ? ($k === 1 ? '' : (string)$k) : ($type === 1 ? ($k === 1 ? '' : (string)$k) : ($k === 1 ? '' : $k) . '\\sqrt{3}');
            $z = $re . ($sy < 0 ? ' - ' : ' + ') . $imAbs . 'i';
            $opts = [$base, 180 - $base, -$base, -(180 - $base)]; $wrong = [];
            foreach ($opts as $o) { if ($o === $ang) continue;
                $wrong[] = [$o . '°', $o === ($sx * $sy > 0 ? $base : -$base) ? '$\\tan^{-1}$ of the ratio alone ignores the quadrant: plot the point first.' : 'That angle points into a different quadrant from $' . $z . '$.']; }
            return mlb_mcq($r, 'Find the argument of $z = ' . $z . '$, in degrees, with $-180^\\circ < \\arg z \\le 180^\\circ$.', $ang . '°', $wrong,
                ['Plot $z$: the real part is ' . ($sx > 0 ? 'positive' : 'negative') . ' and the imaginary part ' . ($sy > 0 ? 'positive' : 'negative') . ', so it is in the ' . ($sx > 0 ? ($sy > 0 ? 'first' : 'fourth') : ($sy > 0 ? 'second' : 'third')) . ' quadrant.',
                 'The angle it makes with the real axis is $' . $base . '^\\circ$ (from $\\tan^{-1}$ of the sizes).', 'Measured from the positive real axis, that gives $' . $ang . '^\\circ$.'],
                'Sketch the point on the Argand diagram before using $\\tan^{-1}$.', 'concept', 50); },
    ],

    /* ═══ Second pass (13 Nov 2026): the other thin topics in MC-041..200 ═══ */

    /* ── MC-045 Expansion: area in context; the sign of a negative multiplier; mental maths by the distributive law ── */
    'MC-045' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 15); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('expr', 'A school garden in ' . $town . ' is ' . $a . ' m wide and $(x + ' . $b . ')$ m long. Write its area, in m², without brackets.', $a . 'x+' . ($a * $b),
                ['Area = width × length $= ' . $a . '(x + ' . $b . ')$.', 'Multiply each term in the bracket by ' . $a . ': $' . $a . 'x + ' . ($a * $b) . '$.'],
                'Area of a rectangle is width times length; then remove the bracket.', 'application', 40, ['form' => 'expanded']); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $a = $r->int(2, 9); $b = $r->int(2, 9);
            return mlb_mcq($r, $who . ' expands $-' . $a . '(x - ' . $b . ')$ and gets $-' . $a . 'x - ' . ($a * $b) . '$. What is the correct expansion?', '$-' . $a . 'x + ' . ($a * $b) . '$',
                [['$-' . $a . 'x - ' . ($a * $b) . '$', 'That is ' . $who . '\'s answer: $-' . $a . ' \\times (-' . $b . ')$ is positive, not negative.'],
                 ['$-' . $a . 'x - ' . $b . '$', 'Multiply BOTH terms in the bracket by $-' . $a . '$, not just the first.'],
                 ['$' . $a . 'x + ' . ($a * $b) . '$', 'The first term is $-' . $a . ' \\times x = -' . $a . 'x$: the sign stays negative.']],
                ['$-' . $a . ' \\times x = -' . $a . 'x$.', '$-' . $a . ' \\times (-' . $b . ') = +' . ($a * $b) . '$: a negative times a negative is positive.', 'So $-' . $a . 'x + ' . ($a * $b) . '$.'],
                'Multiply each term in the bracket by $-' . $a . '$, sign included.', 'reasoning', 40); },
        static function (MlbRng $r) { $a = $r->int(12, 49); $b = $r->pick([1, 2, 3, 4, 5]); $up = $r->int(0, 1) === 1; $n = $up ? 100 + $b : 100 - $b;
            return mlb_typed('num', 'Use the distributive law, $a(100 ' . ($up ? '+' : '-') . ' b) = 100a ' . ($up ? '+' : '-') . ' ab$, to work out $' . $a . ' \\times ' . $n . '$ without a calculator.', (string)($a * $n),
                ['$' . $a . ' \\times ' . $n . ' = ' . $a . '(100 ' . ($up ? '+' : '-') . ' ' . $b . ')$.', '$= ' . (100 * $a) . ' ' . ($up ? '+' : '-') . ' ' . ($a * $b) . ' = ' . ($a * $n) . '$.'],
                'Split ' . $n . ' into 100 and a small number.', 'application', 40); },
    ],

    /* ── MC-059 Algebraic fractions: where it is undefined; the illegal cancel ── */
    'MC-059' => [
        static function (MlbRng $r) { $a = $r->int(-9, 9); $b = $r->nz(-9, 9); if ($a === -$b) $a++;
            return mlb_typed('num', 'For what value of $x$ is $\\frac{x' . mlb_sterm($a) . '}{x' . mlb_sterm(-$b) . '}$ undefined?', (string)$b,
                ['A fraction is undefined when its denominator is 0.', '$x' . mlb_sterm(-$b) . ' = 0$ when $x = ' . $b . '$.'],
                'Which part of a fraction must never be zero?', 'concept', 30); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $k = $r->int(2, 9);
            return mlb_mcq($r, $who . ' simplifies $\\frac{x + ' . $k . '}{' . $k . '}$ to $x$ by cancelling the ' . $k . 's. What is the correct simplification?', '$\\frac{x}{' . $k . '} + 1$',
                [['$x$', 'Only a FACTOR of the whole top can cancel; ' . $k . ' is a term added to $x$, not a factor.'],
                 ['$x + 1$', 'Dividing by ' . $k . ' divides EVERY term on top: $x$ becomes $\\frac{x}{' . $k . '}$ too.'],
                 ['It cannot be simplified at all', 'It can be split: $\\frac{x}{' . $k . '} + \\frac{' . $k . '}{' . $k . '}$.']],
                ['Split the fraction: $\\frac{x + ' . $k . '}{' . $k . '} = \\frac{x}{' . $k . '} + \\frac{' . $k . '}{' . $k . '}$.', '$= \\frac{x}{' . $k . '} + 1$. Check with $x = ' . $k . '$: $\\frac{' . (2 * $k) . '}{' . $k . '} = 2$, and $1 + 1 = 2$. ✓'],
                'Test it: put a number in for $x$ and compare.', 'reasoning', 40); },
    ],

    /* ── MC-065 Standard form: how many times bigger; a number that is not yet in standard form ── */
    'MC-065' => [
        static function (MlbRng $r) { $b = $r->int(1, 4); $k = $r->int(2, 9); $a = $b * $k; if ($a >= 10) { $b = 1; $a = $k; } $n = $r->int(-3, 5); $d = $r->int(1, 3); $m = $n + $d;
            return mlb_typed('num', 'How many times bigger is $' . $a . ' \\times 10^{' . $m . '}$ than $' . $b . ' \\times 10^{' . $n . '}$?', (string)(intdiv($a, $b) * 10 ** $d),
                ['Divide: $\\frac{' . $a . '}{' . $b . '} \\times \\frac{10^{' . $m . '}}{10^{' . $n . '}}$.', '$= ' . intdiv($a, $b) . ' \\times 10^{' . $d . '} = ' . (intdiv($a, $b) * 10 ** $d) . '$.'],
                '"How many times bigger" means divide. Subtract the powers of 10.', 'application', 40); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $a = $r->int(11, 99); if ($a % 10 === 0) $a++; $p = $r->int(2, 7); $t = intdiv($a, 10) . '.' . ($a % 10);
            return mlb_mcq($r, $who . ' writes a number as $' . $a . ' \\times 10^{' . $p . '}$. Written properly in standard form, what is it?', '$' . $t . ' \\times 10^{' . ($p + 1) . '}$',
                [['$' . $t . ' \\times 10^{' . ($p - 1) . '}$', 'Making the front number 10 times SMALLER means the power of 10 must go UP by one to keep the value.'],
                 ['$' . $a . ' \\times 10^{' . $p . '}$', 'Standard form needs a front number from 1 up to (not including) 10; ' . $a . ' is too big.'],
                 ['$0.' . $a . ' \\times 10^{' . ($p + 2) . '}$', 'The value is right, but the front number must be at least 1.']],
                ['$' . $a . ' = ' . $t . ' \\times 10$.', 'So $' . $a . ' \\times 10^{' . $p . '} = ' . $t . ' \\times 10^{' . ($p + 1) . '}$.'],
                'The front number must be at least 1 and less than 10. Keep the value the same.', 'concept', 40); },
    ],

    /* ── MC-066 Surds: into one root; out of one root ── */
    'MC-066' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->pick([2, 3, 5, 6, 7, 10, 11]);
            return mlb_typed('num', 'Write $' . $a . '\\sqrt{' . $b . '}$ as $\\sqrt{n}$. What is $n$?', (string)($a * $a * $b),
                ['$' . $a . ' = \\sqrt{' . ($a * $a) . '}$.', 'So $' . $a . '\\sqrt{' . $b . '} = \\sqrt{' . ($a * $a) . '} \\times \\sqrt{' . $b . '} = \\sqrt{' . ($a * $a * $b) . '}$.'],
                'Write the whole number in front as a square root first.', 'procedure', 35); },
        static function (MlbRng $r) { $k = $r->int(2, 9); $m = $r->pick([2, 3, 5, 6, 7, 10, 11, 13]); $n = $k * $k * $m;
            return mlb_typed('num', '$\\sqrt{' . $n . '}$ simplifies to $k\\sqrt{' . $m . '}$. Find $k$.', (string)$k,
                ['Look for the largest square factor of ' . $n . ': $' . $n . ' = ' . ($k * $k) . ' \\times ' . $m . '$.', '$\\sqrt{' . $n . '} = \\sqrt{' . ($k * $k) . '}\\sqrt{' . $m . '} = ' . $k . '\\sqrt{' . $m . '}$.'],
                'Divide ' . $n . ' by ' . $m . ' first.', 'procedure', 35); },
    ],

    /* ── MC-067 Surd operations: the conjugate; a rational denominator; a worked error ── */
    'MC-067' => [
        static function (MlbRng $r) { do { $a = $r->pick([2, 3, 5, 6, 7, 10, 11, 13]); $b = $r->pick([2, 3, 5, 6, 7, 10, 11, 13]); } while ($a === $b);
            return mlb_typed('num', 'Multiply $\\sqrt{' . $a . '} + \\sqrt{' . $b . '}$ by its conjugate, $\\sqrt{' . $a . '} - \\sqrt{' . $b . '}$. What whole number do you get?', (string)($a - $b),
                ['It is a difference of two squares: $(p + q)(p - q) = p^2 - q^2$.', '$(\\sqrt{' . $a . '})^2 - (\\sqrt{' . $b . '})^2 = ' . $a . ' - ' . $b . ' = ' . ($a - $b) . '$.'],
                'The middle terms cancel. What is left?', 'procedure', 35); },
        static function (MlbRng $r) { $n = $r->pick([2, 3, 5, 6, 7, 10, 11]); $c = $r->int(2, 9); $k = $c * $n;
            return mlb_typed('num', 'With its denominator made rational, $\\frac{' . $k . '}{\\sqrt{' . $n . '}}$ becomes $c\\sqrt{' . $n . '}$. Find $c$.', (string)$c,
                ['Multiply top and bottom by $\\sqrt{' . $n . '}$: $\\frac{' . $k . '\\sqrt{' . $n . '}}{' . $n . '}$.', '$\\frac{' . $k . '}{' . $n . '} = ' . $c . '$, so it is $' . $c . '\\sqrt{' . $n . '}$.'],
                'Multiply by $\\frac{\\sqrt{' . $n . '}}{\\sqrt{' . $n . '}}$, which is 1.', 'procedure', 40); },
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5, 6, 7]); do { $a = $r->int(2, 5); $c = $r->int(2, 5); } while ($a === $c);
            $right = ['$\\sqrt{' . ($a * $a * $b) . '} = ' . $a . '\\sqrt{' . $b . '}$', '$\\sqrt{' . ($c * $c * $b) . '} = ' . $c . '\\sqrt{' . $b . '}$', '$' . $a . '\\sqrt{' . $b . '} + ' . $c . '\\sqrt{' . $b . '} = ' . ($a + $c) . '\\sqrt{' . $b . '}$'];
            return mlb_error_of($r, 'Find the first mistake: simplify $\\sqrt{' . ($a * $a * $b) . '} + \\sqrt{' . ($c * $c * $b) . '}$.', $right, [
                [2, [$right[0], $right[1], '$' . $a . '\\sqrt{' . $b . '} + ' . $c . '\\sqrt{' . $b . '} = ' . ($a + $c) . '\\sqrt{' . (2 * $b) . '}$'], 'Like surds add like like terms: $' . $a . '\\sqrt{' . $b . '} + ' . $c . '\\sqrt{' . $b . '} = ' . ($a + $c) . '\\sqrt{' . $b . '}$; the number under the root does not change.'],
                [0, ['$\\sqrt{' . ($a * $a * $b) . '} = ' . ($a * $a) . '\\sqrt{' . $b . '}$', $right[1], '$' . ($a * $a) . '\\sqrt{' . $b . '} + ' . $c . '\\sqrt{' . $b . '} = ' . ($a * $a + $c) . '\\sqrt{' . $b . '}$'], '$\\sqrt{' . ($a * $a) . '} = ' . $a . '$, not ' . ($a * $a) . ': take the square ROOT of the square factor.'],
                [1, [$right[0], '$\\sqrt{' . ($c * $c * $b) . '} = ' . $c . '\\sqrt{' . ($c * $b) . '}$', '$' . $a . '\\sqrt{' . $b . '} + ' . $c . '\\sqrt{' . ($c * $b) . '}$ cannot be combined'], 'Take out the whole square, ' . ($c * $c) . ': $\\sqrt{' . ($c * $c * $b) . '} = \\sqrt{' . ($c * $c) . '}\\sqrt{' . $b . '} = ' . $c . '\\sqrt{' . $b . '}$.'],
            ]); },
    ],

    /* ── MC-101 Quadratics: the lost root; consecutive numbers ── */
    'MC-101' => [
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $k = $r->int(2, 12);
            return mlb_mcq($r, $who . ' solves $x^2 = ' . mlb_lterm($k, 'x') . '$ by dividing both sides by $x$, and gets $x = ' . $k . '$. What is wrong?', 'A solution is lost: $x = 0$ also works',
                [['Nothing — $x = ' . $k . '$ is the only solution', 'Try $x = 0$: $0^2 = ' . $k . ' \\times 0$. It works too.'],
                 ['The answer should be $x = \\sqrt{' . $k . '}$', 'Check: $x = ' . $k . '$ does satisfy the equation; the trouble is a missing solution, not a wrong one.'],
                 ['Both sides should have been square-rooted first', 'Rooting gives $x = \\pm\\sqrt{' . mlb_lterm($k, 'x') . '}$, which still has $x$ on both sides.']],
                ['Dividing by $x$ is only allowed when $x \\ne 0$, so it throws away the case $x = 0$.', 'Instead: $x^2' . mlb_sterm(-$k, 'x') . ' = 0$, so $x(x' . mlb_sterm(-$k) . ') = 0$.', 'Zero product: $x = 0$ or $x = ' . $k . '$.'],
                'What if $x$ were 0?', 'reasoning', 45); },
        static function (MlbRng $r) { $n = $r->int(6, 40); $P = $n * ($n + 1);
            return mlb_typed('num', 'The product of two consecutive positive whole numbers is ' . $P . '. What is the smaller number?', (string)$n,
                ['Call them $n$ and $n + 1$: $n(n + 1) = ' . $P . '$, so $n^2 + n - ' . $P . ' = 0$.', 'Factorise: $(n - ' . $n . ')(n + ' . ($n + 1) . ') = 0$.', '$n$ is positive, so $n = ' . $n . '$.'],
                'Write the equation, collect everything on one side, and factorise.', 'application', 55); },
    ],

    /* ── MC-103 Discriminant and formula: equal roots; the sign of −b ── */
    'MC-103' => [
        static function (MlbRng $r) { $m = $r->int(1, 9); $c = $m * $m;
            return mlb_typed('num', 'For what positive value of $k$ does $x^2 + kx + ' . $c . ' = 0$ have two EQUAL roots?', (string)(2 * $m),
                ['Equal roots means the discriminant is 0: $k^2 - 4 \\times ' . $c . ' = 0$.', '$k^2 = ' . (4 * $c) . '$, so $k = \\pm ' . (2 * $m) . '$.', 'The positive value is $' . (2 * $m) . '$.'],
                'What must $b^2 - 4ac$ be for one repeated root?', 'procedure', 45); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $b = $r->int(3, 9); $c = $r->int(1, min(9, intdiv($b * $b - 1, 4))); $D = $b * $b - 4 * $c;
            return mlb_mcq($r, 'Solving $x^2 - ' . $b . 'x + ' . $c . ' = 0$, ' . $who . ' writes $x = \\frac{-' . $b . ' \\pm \\sqrt{' . $D . '}}{2}$. What is wrong?', 'Here $b = -' . $b . '$, so $-b = +' . $b . '$: it should be $\\frac{' . $b . ' \\pm \\sqrt{' . $D . '}}{2}$',
                [['Nothing — it is right', 'Substitute $b = -' . $b . '$ carefully: $-b = -(-' . $b . ') = ' . $b . '$.'],
                 ['The discriminant should be $' . ($b * $b + 4 * $c) . '$', '$b^2 - 4ac = (-' . $b . ')^2 - 4(1)(' . $c . ') = ' . $D . '$; that part was right.'],
                 ['The bottom should be 1, not 2', 'The bottom is $2a = 2 \\times 1 = 2$; that part was right.']],
                ['Here $a = 1$, $b = -' . $b . '$, $c = ' . $c . '$.', '$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} = \\frac{' . $b . ' \\pm \\sqrt{' . $D . '}}{2}$.'],
                'Write down $a$, $b$ and $c$ with their signs before substituting.', 'reasoning', 45); },
    ],

    /* ── MC-115 Area by ½ab sin C: a missing side; an angle and its supplement ── */
    'MC-115' => [
        static function (MlbRng $r) { $C = $r->pick([30, 150, 90]); $a = 2 * $r->int(2, 12); $b = $r->int(3, 20); $A = $C === 90 ? $a * $b / 2 : $a * $b / 4;
            return mlb_typed('num', 'A triangle has area ' . mlb_p($A) . ' cm². Two of its sides meet at an angle of $' . $C . '^\\circ$, and one of them is ' . $a . ' cm. How long is the other, in cm?', (string)$b,
                ['Area $= \\frac{1}{2}ab\\sin C$, and $\\sin ' . $C . '^\\circ = ' . ($C === 90 ? '1' : '\\frac{1}{2}') . '$.', '$' . mlb_n($A) . ' = \\frac{1}{2} \\times ' . $a . ' \\times b \\times ' . ($C === 90 ? '1' : '\\frac{1}{2}') . '$.', 'So $b = ' . $b . '$ cm.'],
                'Put what you know into the area formula, then solve for the side.', 'procedure', 50, ['unit' => 'cm']); },
        static function (MlbRng $r) { $t = $r->pick([20, 30, 35, 40, 50, 55, 65, 70]); $a = $r->int(4, 15); $b = $r->int(4, 15);
            return mlb_mcq($r, 'Triangle P has sides ' . $a . ' cm and ' . $b . ' cm with $' . $t . '^\\circ$ between them. Triangle Q has the same two sides with $' . (180 - $t) . '^\\circ$ between them. Which has the larger area?', 'Neither — their areas are equal',
                [['Q, because its angle is bigger', 'Area uses $\\sin C$, and $\\sin ' . (180 - $t) . '^\\circ = \\sin ' . $t . '^\\circ$.'],
                 ['P, because an obtuse angle makes a flatter triangle', 'Flatter in shape, yes, but $\\sin ' . (180 - $t) . '^\\circ = \\sin ' . $t . '^\\circ$, so the area is the same.'],
                 ['It cannot be told without the third side', 'Two sides and the angle between them fix the area: $\\frac{1}{2}ab\\sin C$.']],
                ['Area $= \\frac{1}{2} \\times ' . $a . ' \\times ' . $b . ' \\times \\sin C$ for both.', '$\\sin(180^\\circ - ' . $t . '^\\circ) = \\sin ' . $t . '^\\circ$, so the areas are equal.'],
                'Compare $\\sin ' . $t . '^\\circ$ with $\\sin ' . (180 - $t) . '^\\circ$.', 'concept', 45); },
    ],

    /* ── MC-143 Ratios and identities: an obtuse angle; reciprocal ratio names ── */
    'MC-143' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]); if ($r->int(0, 1)) [$a, $b] = [$b, $a];
            return mlb_typed('frac', '$\\theta$ is obtuse ($90^\\circ < \\theta < 180^\\circ$) and $\\sin\\theta = \\frac{' . $a . '}{' . $c . '}$. Find $\\cos\\theta$.', mlb_frac(-$b, $c),
                ['$\\cos^2\\theta = 1 - \\sin^2\\theta = 1 - \\frac{' . ($a * $a) . '}{' . ($c * $c) . '} = \\frac{' . ($b * $b) . '}{' . ($c * $c) . '}$.', 'So $\\cos\\theta = \\pm\\frac{' . $b . '}{' . $c . '}$.', 'In the second quadrant cosine is negative: $\\cos\\theta = -\\frac{' . $b . '}{' . $c . '}$.'],
                'Use $\\sin^2 + \\cos^2 = 1$, then decide the sign from the quadrant.', 'procedure', 50); },
        static function (MlbRng $r) { $which = $r->pick(['sec', 'cosec', 'cot']);
            $map = ['sec' => '$\\frac{1}{\\cos\\theta}$', 'cosec' => '$\\frac{1}{\\sin\\theta}$', 'cot' => '$\\frac{1}{\\tan\\theta}$'];
            $wrong = []; foreach ($map as $k => $v) if ($k !== $which) $wrong[] = [$v, 'That is $\\' . ($k === 'cosec' ? 'operatorname{cosec}' : $k) . '\\theta$.'];
            $inv = ['sec' => '\\cos^{-1}\\theta', 'cosec' => '\\sin^{-1}\\theta', 'cot' => '\\tan^{-1}\\theta'][$which];
            $wrong[] = ['$' . $inv . '$', '$' . $inv . '$ is the INVERSE function (an angle), not the reciprocal.'];
            $nm = $which === 'cosec' ? '\\operatorname{cosec}' : '\\' . $which;
            return mlb_mcq($r, 'Which of these is equal to $' . $nm . '\\theta$?', $map[$which], $wrong,
                ['$\\sec$, $\\operatorname{cosec}$ and $\\cot$ are the reciprocals of $\\cos$, $\\sin$ and $\\tan$: sec ↔ cos, cosec ↔ sin, cot ↔ tan.', 'So $' . $nm . '\\theta = ' . str_replace('$', '', $map[$which]) . '$.'],
                'Reciprocal means "1 over".', 'concept', 30); },
    ],

    /* ── MC-144 Compound angles: cos 2A; which expansion ── */
    'MC-144' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]); if ($r->int(0, 1)) [$a, $b] = [$b, $a];
            return mlb_typed('frac', '$A$ is acute and $\\cos A = \\frac{' . $b . '}{' . $c . '}$. Find $\\cos 2A$ exactly.', mlb_frac(2 * $b * $b - $c * $c, $c * $c),
                ['$\\cos 2A = 2\\cos^2 A - 1$.', '$= 2 \\times \\frac{' . ($b * $b) . '}{' . ($c * $c) . '} - 1 = \\frac{' . (2 * $b * $b) . ' - ' . ($c * $c) . '}{' . ($c * $c) . '}$.', '$= ' . mlb_ftex(2 * $b * $b - $c * $c, $c * $c) . '$.'],
                'One form of $\\cos 2A$ needs only $\\cos A$.', 'procedure', 50); },
        static function (MlbRng $r) { $f = $r->pick(['cos(A + B)', 'cos(A - B)', 'sin(A - B)']);
            $all = ['cos(A + B)' => '$\\cos A\\cos B - \\sin A\\sin B$', 'cos(A - B)' => '$\\cos A\\cos B + \\sin A\\sin B$', 'sin(A - B)' => '$\\sin A\\cos B - \\cos A\\sin B$', 'sin(A + B)' => '$\\sin A\\cos B + \\cos A\\sin B$'];
            $wrong = []; foreach ($all as $k => $v) if ($k !== $f) $wrong[] = [$v, 'That is the expansion of $\\' . $k . '$. Check with $A = B$ or $B = 0$.'];
            $wrong = array_slice($wrong, 0, 2); $wrong[] = ['$\\' . substr($f, 0, 3) . ' A ' . (strpos($f, '+') !== false ? '+' : '-') . ' \\' . substr($f, 0, 3) . ' B$', 'The functions do not split over $+$ or $-$: try $A = B = 60^\\circ$.'];
            return mlb_mcq($r, 'Which is the expansion of $\\' . $f . '$?', $all[$f], $wrong,
                ['$\\' . $f . ' = ' . str_replace('$', '', $all[$f]) . '$.', 'Check with $B = 0$: it must give $\\' . substr($f, 0, 3) . ' A$.'],
                'Test each option with $B = 0$.', 'concept', 40); },
    ],

    /* ── MC-146 Harmonic form: least value with a shift; the a + b misconception ── */
    'MC-146' => [
        static function (MlbRng $r) { [$a, $b, $R] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25]]); $k = $r->int($R + 1, $R + 20);
            return mlb_typed('num', 'What is the least value of $' . $a . '\\sin x + ' . $b . '\\cos x + ' . $k . '$?', (string)($k - $R),
                ['$' . $a . '\\sin x + ' . $b . '\\cos x = R\\sin(x + \\alpha)$ with $R = \\sqrt{' . ($a * $a) . ' + ' . ($b * $b) . '} = ' . $R . '$.', '$R\\sin(x + \\alpha)$ goes down to $-' . $R . '$.', 'So the least value is $' . $k . ' - ' . $R . ' = ' . ($k - $R) . '$.'],
                'Write the trig part as one sine wave first.', 'procedure', 50); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); [$a, $b, $R] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [9, 12, 15], [20, 21, 29]]);
            return mlb_mcq($r, $who . ' says the greatest value of $' . $a . '\\sin x + ' . $b . '\\cos x$ is $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$. What is it really?', (string)$R,
                [[(string)($a + $b), 'That needs $\\sin x$ and $\\cos x$ both equal to 1 at the same $x$, which never happens.'],
                 [(string)max($a, $b), 'The two waves add up partly: the peak is more than either alone.'],
                 [(string)($a * $a + $b * $b), 'That is $R^2$; take the square root.']],
                ['Write it as $R\\sin(x + \\alpha)$ with $R = \\sqrt{' . $a . '^2 + ' . $b . '^2} = ' . $R . '$.', 'The greatest value of $R\\sin(\\ldots)$ is $R = ' . $R . '$.'],
                'Can $\\sin x$ and $\\cos x$ both be 1 at once?', 'reasoning', 45); },
    ],

    /* ── MC-151 Limits: making a function continuous; 0/0 is a signal, not an answer ── */
    'MC-151' => [
        static function (MlbRng $r) { $a = $r->int(-4, 5); $m = $r->nz(-5, 6); $k = $m * $a - $a * $a;
            return mlb_typed('num', '$f(x) = x^2 + k$ for $x < ' . $a . '$, and $f(x) = ' . mlb_lterm($m, 'x') . '$ for $x \\ge ' . $a . '$. What value of $k$ makes $f$ continuous at $x = ' . $a . '$?', (string)$k,
                ['For no jump, the two pieces must meet at $x = ' . $a . '$.', 'Left: $' . $a . '^2 + k = ' . ($a * $a) . ' + k$. Right: $' . $m . ' \\times ' . ($a < 0 ? '(' . $a . ')' : $a) . ' = ' . ($m * $a) . '$.', '$' . ($a * $a) . ' + k = ' . ($m * $a) . '$, so $k = ' . $k . '$.'],
                'The two formulas must give the same value where they join.', 'procedure', 50); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $a = $r->nz(-6, 6);
            return mlb_mcq($r, $who . ' says $\\displaystyle\\lim_{x \\to ' . $a . '} \\frac{x^2 - ' . ($a * $a) . '}{x' . mlb_sterm(-$a) . '}$ does not exist, because putting $x = ' . $a . '$ gives $\\frac{0}{0}$. Is ' . $who . ' right?', 'No — $\\frac{0}{0}$ means simplify first; the limit is ' . (2 * $a),
                [['Yes — $\\frac{0}{0}$ has no value', 'The FUNCTION has no value at $x = ' . $a . '$, but the limit asks what it approaches nearby.'],
                 ['No — the limit is 0', '$0$ on top and $0$ on the bottom do not make 0: cancel the common factor first.'],
                 ['No — the limit is 1', 'Two things both approaching 0 need not have a ratio approaching 1: cancel and see.']],
                ['$x^2 - ' . ($a * $a) . ' = (x' . mlb_sterm(-$a) . ')(x' . mlb_sterm($a) . ')$.', 'For $x \\ne ' . $a . '$ the fraction is $x' . mlb_sterm($a) . '$, which approaches $' . (2 * $a) . '$.'],
                'Factorise the top.', 'reasoning', 45); },
    ],

    /* ── MC-159 Definite integrals: find the upper limit; signed area versus area ── */
    'MC-159' => [
        static function (MlbRng $r) { $k = $r->int(2, 12);
            return mlb_typed('num', 'Find the positive number $k$ for which $\\displaystyle\\int_0^{k} 2x\\,dx = ' . ($k * $k) . '$.', (string)$k,
                ['$\\int_0^{k} 2x\\,dx = \\left[x^2\\right]_0^{k} = k^2$.', '$k^2 = ' . ($k * $k) . '$ and $k > 0$, so $k = ' . $k . '$.'],
                'Integrate with $k$ as the top limit, then solve.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->int(1, 6);
            return mlb_mcq($r, '$\\displaystyle\\int_{0}^{' . (2 * $a) . '} (x - ' . $a . ')\\,dx = 0$. What is the total area between the line $y = x - ' . $a . '$ and the $x$-axis from $x = 0$ to $x = ' . (2 * $a) . '$?', (string)($a * $a),
                [['0', 'The integral is 0 because the part below the axis counts as negative and cancels the part above. Area is never negative.'],
                 [(string)(2 * $a * $a), 'Each of the two triangles has area $\\frac{1}{2} \\times ' . $a . ' \\times ' . $a . '$.'],
                 [mlb_dec($a * $a / 2), 'That is one triangle. There are TWO, one below the axis and one above.']],
                ['The line crosses the axis at $x = ' . $a . '$: one triangle below, one above.', 'Each has area $\\frac{1}{2} \\times ' . $a . ' \\times ' . $a . ' = ' . mlb_dec($a * $a / 2) . '$.', 'Total area $= ' . ($a * $a) . '$; the integral is 0 only because the lower part counts as negative.'],
                'Sketch the line. Where does it cross the axis?', 'concept', 45); },
    ],

    /* ── MC-171 Divisors and primes: square divisors; where trial division can stop ── */
    'MC-171' => [
        static function (MlbRng $r) { $e = [$r->int(1, 6), $r->int(0, 4), $r->int(0, 3)]; $N = 2 ** $e[0] * 3 ** $e[1] * 5 ** $e[2]; $cnt = (intdiv($e[0], 2) + 1) * (intdiv($e[1], 2) + 1) * (intdiv($e[2], 2) + 1);
            $f = implode(' \\times ', array_filter([$e[0] ? '2^{' . $e[0] . '}' : '', $e[1] ? '3^{' . $e[1] . '}' : '', $e[2] ? '5^{' . $e[2] . '}' : '']));
            return mlb_typed('num', 'How many of the divisors of $' . $f . ' = ' . mlb_n($N) . '$ are perfect squares?', (string)$cnt,
                ['A square divisor uses each prime to an EVEN power, no higher than in ' . mlb_p($N) . '.', 'Choices: power of 2 from $\\{0, 2, \\ldots\\}$ up to ' . $e[0] . ': ' . (intdiv($e[0], 2) + 1) . '; of 3 up to ' . $e[1] . ': ' . (intdiv($e[1], 2) + 1) . '; of 5 up to ' . $e[2] . ': ' . (intdiv($e[2], 2) + 1) . '.', 'Multiply: ' . $cnt . '.'],
                'What must be true of the powers in a perfect square?', 'challenge', 60); },
        static function (MlbRng $r) { $N = $r->int(120, 900); $s = (int)floor(sqrt($N)); $p = $s; while (!mlb_g_isprime($p)) $p--; $q = $s + 1; while (!mlb_g_isprime($q)) $q++; $h = intdiv($N, 2); while (!mlb_g_isprime($h)) $h--;
            return mlb_mcq($r, 'To decide whether ' . $N . ' is prime by trying prime divisors, what is the LARGEST prime you need to try?', (string)$p,
                [[(string)$q, $q . '² = ' . ($q * $q) . ' is bigger than ' . $N . ', so if ' . $q . ' were a factor its partner would be smaller — and already tried.'],
                 [(string)$h, 'Trying up to half of ' . $N . ' works, but far more than needed: one factor of any pair is at most $\\sqrt{' . $N . '}$.'],
                 [(string)($N - 1), 'Only primes up to $\\sqrt{' . $N . '}$ are needed.']],
                ['If $' . $N . ' = ab$ with $a \\le b$, then $a^2 \\le ' . $N . '$, so $a \\le \\sqrt{' . $N . '} \\approx ' . mlb_rd(sqrt($N), 1) . '$.', 'So only primes up to ' . $s . ' need trying; the largest is ' . $p . '.'],
                'Factors come in pairs. How big can the smaller one be?', 'reasoning', 45); },
    ],

    /* ── MC-172 GCD and LCM in context: buses that leave together; the largest square tile ── */
    'MC-172' => [
        static function (MlbRng $r) { do { $a = $r->int(4, 30); $b = $r->int(4, 30); } while ($a === $b || mlb_gcd($a, $b) === min($a, $b)); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('num', 'At the motor park in ' . $town . ', one bus leaves every ' . $a . ' minutes and another every ' . $b . ' minutes. They leave together at 7:00. After how many minutes do they next leave together?', (string)mlb_lcm($a, $b),
                ['They leave together at common multiples of ' . $a . ' and ' . $b . '.', 'The first is the LCM: $\\frac{' . $a . ' \\times ' . $b . '}{\\gcd(' . $a . ', ' . $b . ')} = \\frac{' . ($a * $b) . '}{' . mlb_gcd($a, $b) . '} = ' . mlb_lcm($a, $b) . '$.'],
                'Is this a "common multiple" or a "common factor" question?', 'application', 45, ['unit' => 'min']); },
        static function (MlbRng $r) { do { $g = $r->int(5, 40); $p = $r->int(2, 9); $q = $r->int(2, 9); } while (mlb_gcd($p, $q) !== 1 || $p === $q);
            return mlb_typed('num', 'A floor ' . ($g * $p) . ' cm by ' . ($g * $q) . ' cm is to be covered with equal square tiles, with no cutting. What is the largest possible side of a tile, in cm?', (string)$g,
                ['The side must divide both ' . ($g * $p) . ' and ' . ($g * $q) . ': a common factor.', 'The largest is the HCF: $\\gcd(' . ($g * $p) . ', ' . ($g * $q) . ') = ' . $g . '$ (e.g. by Euclid\'s algorithm).'],
                'Common factor or common multiple?', 'application', 45, ['unit' => 'cm']); },
    ],

    /* ── MC-173 Congruences: days of the week; the last digit ── */
    'MC-173' => [
        static function (MlbRng $r) { $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; $d = $r->int(0, 6); $N = $r->int(30, 400); $ans = $days[($d + $N) % 7];
            $wrong = []; foreach ([$d + $N + 1, $d + $N - 1, $d + $N % 10] as $w) { $t = $days[(($w % 7) + 7) % 7]; if ($t !== $ans) $wrong[] = [$t, 'Count again: only the remainder of ' . $N . ' on division by 7 matters, added to ' . $days[$d] . '.']; }
            return mlb_mcq($r, 'Today is ' . $days[$d] . '. What day of the week will it be ' . $N . ' days from today?', $ans, $wrong,
                ['The days repeat every 7, so work mod 7: $' . $N . ' = ' . intdiv($N, 7) . ' \\times 7 + ' . ($N % 7) . '$.', 'So it is ' . ($N % 7) . ' days on from ' . $days[$d] . ': ' . $ans . '.'],
                'Whole weeks change nothing. What is left over?', 'application', 40); },
        static function (MlbRng $r) { do { $a = $r->int(2, 19); } while ($a % 10 === 0 || $a % 10 === 1 || $a % 10 === 5 || $a % 10 === 6); $N = $r->int(20, 500); $k = mlbv2_powmod($a, $N, 10);
            return mlb_typed('num', 'What is the last digit of $' . $a . '^{' . $N . '}$?', (string)$k,
                ['The last digit is the remainder mod 10, and it depends only on the last digit of ' . $a . '.', 'The last digits of powers of ' . ($a % 10) . ' repeat in a cycle of at most 4: ' . implode(', ', array_map(static fn($e) => mlbv2_powmod($a, $e, 10), [1, 2, 3, 4])) . '.', '$' . $N . ' = 4 \\times ' . intdiv($N, 4) . ' + ' . ($N % 4) . '$, which gives last digit ' . $k . '.'],
                'Write out the last digits of the first few powers and look for a cycle.', 'procedure', 50); },
    ],

    /* ── MC-174 Fermat and Euler: reduce the power; when Fermat applies; the inverse ── */
    'MC-174' => [
        static function (MlbRng $r) { $p = $r->pick([5, 7, 11, 13, 17]); do { $a = $r->int(2, 30); } while ($a % $p === 0); $N = $r->int(100, 999); $x = mlbv2_powmod($a, $N, $p);
            return mlb_typed('num', 'Since ' . $p . ' is prime, $' . $a . '^{' . ($p - 1) . '} \\equiv 1 \\pmod{' . $p . '}$. Find $x$, from 0 to ' . ($p - 1) . ', with $' . $a . '^{' . $N . '} \\equiv x \\pmod{' . $p . '}$.', (string)$x,
                ['$' . $N . ' = ' . intdiv($N, $p - 1) . ' \\times ' . ($p - 1) . ' + ' . ($N % ($p - 1)) . '$.', 'So $' . $a . '^{' . $N . '} \\equiv (' . $a . '^{' . ($p - 1) . '})^{' . intdiv($N, $p - 1) . '} \\times ' . $a . '^{' . ($N % ($p - 1)) . '} \\equiv ' . $a . '^{' . ($N % ($p - 1)) . '} \\pmod{' . $p . '}$.', 'Which is $' . $x . '$.'],
                'Divide the power by ' . ($p - 1) . '; only the remainder matters.', 'procedure', 55); },
        static function (MlbRng $r) { $case = $r->pick(['ok', 'notprime', 'divides']);
            if ($case === 'ok') { $m = $r->pick([7, 11, 13, 17]); do { $a = $r->int(2, 20); } while ($a % $m === 0); }
            elseif ($case === 'notprime') { $m = $r->pick([9, 15, 21, 25]); do { $a = $r->int(2, 20); } while (mlb_gcd($a, $m) !== 1); }
            else { $m = $r->pick([5, 7, 11]); $a = $m * $r->int(2, 4); }
            $N = $r->int(50, 300);
            $opt = ['ok' => 'Yes: ' . $m . ' is prime and does not divide ' . $a, 'notprime' => 'No: ' . $m . ' is not prime', 'divides' => 'No: ' . $m . ' divides ' . $a];
            $why = ['ok' => 'One of the conditions fails here: check that ' . $m . ' is prime AND does not divide ' . $a . '.', 'notprime' => $m . ' is prime here.', 'divides' => $m . ' does not divide ' . $a . ' here.'];
            $wrong = []; foreach ($opt as $k => $v) if ($k !== $case) $wrong[] = [$v, $why[$k]];
            $wrong[] = ['No: the power ' . $N . ' is too large', 'Fermat works for any power — reducing large powers is exactly what it is for.'];
            return mlb_mcq($r, 'Can Fermat\'s little theorem be used directly to find $' . $a . '^{' . $N . '} \\bmod ' . $m . '$?', $opt[$case], $wrong,
                ['Fermat\'s little theorem: if $p$ is prime and $p \\nmid a$, then $a^{p-1} \\equiv 1 \\pmod p$.', $case === 'ok' ? $m . ' is prime and does not divide ' . $a . ', so yes.' : ($case === 'notprime' ? $m . ' is not prime (use Euler\'s theorem with $\\varphi(' . $m . ')$ instead).' : $m . ' divides ' . $a . ', so every power is $\\equiv 0$.')],
                'Check the two conditions of the theorem.', 'concept', 40); },
        static function (MlbRng $r) { $p = $r->pick([5, 7, 11, 13]); $a = $r->int(2, $p - 1); $x = mlbv2_powmod($a, $p - 2, $p);
            return mlb_typed('num', 'By Fermat\'s little theorem, $' . $a . '^{' . ($p - 2) . '}$ is the inverse of ' . $a . ' modulo ' . $p . '. Find the remainder when $' . $a . '^{' . ($p - 2) . '}$ is divided by ' . $p . '.', (string)$x,
                ['$' . $a . ' \\times ' . $a . '^{' . ($p - 2) . '} = ' . $a . '^{' . ($p - 1) . '} \\equiv 1$, which is why it is the inverse.', 'Work it out: $' . $a . '^{' . ($p - 2) . '} \\equiv ' . $x . ' \\pmod{' . $p . '}$.', 'Check: $' . $a . ' \\times ' . $x . ' = ' . ($a * $x) . ' \\equiv 1 \\pmod{' . $p . '}$. ✓'],
                'Square and reduce as you go, so the numbers stay small.', 'procedure', 55); },
    ],

    /* ── MC-177 Legendre: the smallest factorial with k zeros; floor(n/5) is not enough ── */
    'MC-177' => [
        static function (MlbRng $r) { $n = 5 * $r->int(3, 60); $z = 0; for ($q = 5; $q <= $n; $q *= 5) $z += intdiv($n, $q);
            return mlb_typed('num', 'What is the smallest whole number $n$ for which $n!$ ends in exactly ' . $z . ' zeros?', (string)$n,
                ['Zeros at the end of $n!$ $= \\lfloor n/5 \\rfloor + \\lfloor n/25 \\rfloor + \\lfloor n/125 \\rfloor + \\cdots$.', 'The count only goes up at multiples of 5, so the answer is a multiple of 5.', 'At $n = ' . $n . '$ the count is ' . $z . ', and at $n = ' . ($n - 1) . '$ it is less. So $n = ' . $n . '$.'],
                'Estimate with $n/5$, then adjust for the multiples of 25.', 'challenge', 70); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $n = $r->int(30, 199); $z = 0; for ($q = 5; $q <= $n; $q *= 5) $z += intdiv($n, $q); $f5 = intdiv($n, 5);
            return mlb_mcq($r, $who . ' says $' . $n . '!$ ends in $\\lfloor ' . $n . '/5 \\rfloor = ' . $f5 . '$ zeros. How many does it really end in?', (string)$z,
                [[(string)$f5, 'Multiples of 25 give a SECOND factor 5 each, and ' . $who . ' counted them only once.'],
                 [(string)intdiv($n, 10), 'A zero needs a 2 and a 5, not a multiple of 10: 5 × 2 makes a zero too.'],
                 [(string)($z + intdiv($n, 2)), 'Factors of 2 are plentiful; the 5s decide the zeros.']],
                ['Count the 5s: $\\lfloor ' . $n . '/5 \\rfloor + \\lfloor ' . $n . '/25 \\rfloor' . ($n >= 125 ? ' + \\lfloor ' . $n . '/125 \\rfloor' : '') . '$.', '$= ' . $f5 . ' + ' . intdiv($n, 25) . ($n >= 125 ? ' + ' . intdiv($n, 125) : '') . ' = ' . $z . '$.'],
                'How many factors of 5 does 25 have?', 'reasoning', 45); },
    ],

    /* ── MC-178 Bases and divisibility: base conversion both ways; the 11 test ── */
    'MC-178' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 4, 5, 6, 7, 8]); $N = $r->int($b * $b, $b ** 4 - 1); $rep = base_convert((string)$N, 10, $b);
            return mlb_typed('num', 'Write the base-ten number ' . $N . ' in base ' . $b . '.', $rep,
                ['Divide by ' . $b . ' repeatedly and keep the remainders.', 'Reading the remainders from last to first gives $' . $rep . '_{' . $b . '}$.', 'Check: ' . implode(' + ', array_map(static fn($d, $i) => $d . ' × ' . $b . '^' . (strlen($rep) - 1 - $i), str_split($rep), array_keys(str_split($rep)))) . ' = ' . $N . '.'],
                'Repeated division by the base; the remainders are the digits.', 'procedure', 55, ['show' => '$' . $rep . '_{' . $b . '}$']); },
        static function (MlbRng $r) { $b = $r->pick([3, 4, 5, 6, 7, 8, 9]); $len = $r->int(3, 4); $d = [$r->int(1, $b - 1)]; for ($i = 1; $i < $len; $i++) $d[] = $r->int(0, $b - 1); $rep = implode('', $d); $N = (int)base_convert($rep, $b, 10);
            return mlb_typed('num', 'What is $' . $rep . '_{' . $b . '}$ in base ten?', (string)$N,
                ['Each digit is worth a power of ' . $b . '.', implode(' + ', array_map(static fn($x, $i) => $x . ' \\times ' . $b . '^{' . ($len - 1 - $i) . '}', $d, array_keys($d))) . ' = ' . $N . '.'],
                'Place values in base ' . $b . ' are 1, ' . $b . ', ' . ($b * $b) . ', …', 'procedure', 45); },
        static function (MlbRng $r) { $alt = static function (int $n): int { $s = 0; $sg = 1; foreach (array_reverse(str_split((string)$n)) as $c) { $s += $sg * (int)$c; $sg = -$sg; } return $s; };
            do { $right = 11 * $r->int(1000, 9000); } while ($alt($right) === 0);
            $wrong = []; while (count($wrong) < 3) { $w = $right + $r->pick([1, 2, 3, 9, 10, 100, -1, -2]) * $r->pick([1, 1, 10]); if ($w % 11 === 0 || in_array((string)$w, array_column($wrong, 0), true)) continue;
                $wrong[] = [(string)$w, 'Its alternating digit sum is ' . $alt($w) . ', which is not a multiple of 11.']; }
            return mlb_mcq($r, 'Which of these numbers is divisible by 11?', (string)$right, array_map(static fn($x) => [(string)$x[0], $x[1]], $wrong),
                ['Test: add and subtract the digits alternately, from the units digit.', 'For ' . $right . ' that gives ' . $alt($right) . ', a multiple of 11, so ' . $right . ' is divisible by 11.'],
                'Use the alternating digit sum.', 'procedure', 50); },
    ],

    /* ── MC-183 Stars and bars: choosing the formula; drinks from flavours ── */
    'MC-183' => [
        static function (MlbRng $r) { $n = $r->int(5, 12); $k = $r->int(3, 5); $mk = $r->pick(['mangoes', 'oranges', 'sweets', 'biscuits']);
            return mlb_mcq($r, $n . ' identical ' . $mk . ' are shared among ' . $k . ' children (some may get none). In how many ways?', (string)mlb_ncr($n + $k - 1, $k - 1),
                [[(string)mlb_ncr($n, $k), '$\\binom{' . $n . '}{' . $k . '}$ chooses ' . $k . ' different things from ' . $n . '; here the ' . $mk . ' are identical and children may get several.'],
                 [(string)($k ** $n), $k . '^' . $n . ' treats the ' . $mk . ' as DIFFERENT, each choosing a child.'],
                 [(string)mlb_ncr($n - 1, $k - 1), 'That is the count when every child must get at least one.']],
                ['Line up ' . $n . ' stars and ' . ($k - 1) . ' bars; the bars cut the stars into ' . $k . ' shares.', 'Choose where the bars go: $\\binom{' . ($n + $k - 1) . '}{' . ($k - 1) . '} = ' . mlb_ncr($n + $k - 1, $k - 1) . '$.'],
                'Are the ' . $mk . ' identical? May a child get none?', 'concept', 50); },
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $n = $r->int(4, 10); $k = $r->int(3, 5); $fl = $r->pick(['Fanta, Sprite, Coke, Pepsi, Malta', 'zobo, kunu, Chapman, malt, juice']); $names = array_slice(array_map('trim', explode(',', $fl)), 0, $k);
            return mlb_typed('num', $who . ' buys ' . $n . ' bottles of drink for a party, choosing from ' . $k . ' kinds (' . implode(', ', $names) . '). Any mix is allowed. How many different selections are possible?', (string)mlb_ncr($n + $k - 1, $k - 1),
                ['A selection is how many of each kind: $x_1 + \\cdots + x_{' . $k . '} = ' . $n . '$ with each $x \\ge 0$.', 'Stars and bars: $\\binom{' . $n . ' + ' . $k . ' - 1}{' . ($k - 1) . '} = \\binom{' . ($n + $k - 1) . '}{' . ($k - 1) . '} = ' . mlb_ncr($n + $k - 1, $k - 1) . '$.'],
                'Only the numbers of each kind matter, not the order.', 'application', 55); },
    ],

    /* ── MC-184 Inclusion–exclusion: the double count; a language survey ── */
    'MC-184' => [
        static function (MlbRng $r) { $who = $r->pick(MLB_NAMES); $c = $r->int(3, 15); $a = $c + $r->int(5, 30); $b = $c + $r->int(5, 30);
            return mlb_mcq($r, '$|A| = ' . $a . '$, $|B| = ' . $b . '$ and $|A \\cap B| = ' . $c . '$. ' . $who . ' says $|A \\cup B| = ' . ($a + $b) . '$. What is it really?', (string)($a + $b - $c),
                [[(string)($a + $b), 'The ' . $c . ' things in BOTH sets were counted twice; subtract them once.'],
                 [(string)($a + $b - 2 * $c), 'Subtract the overlap ONCE, not twice — those things are still in the union.'],
                 [(string)($a + $b + $c), 'The overlap is already counted; adding it again overcounts more.']],
                ['Adding $|A| + |B|$ counts the overlap twice.', '$|A \\cup B| = ' . $a . ' + ' . $b . ' - ' . $c . ' = ' . ($a + $b - $c) . '$.'],
                'Draw two overlapping circles.', 'concept', 40); },
        static function (MlbRng $r) { $z = $r->int(3, 12); $x = $z + $r->int(5, 20); $y = $z + $r->int(5, 20); $none = $r->int(1, 10); $n = $x + $y - $z + $none;
            [$L1, $L2] = $r->pick([['Yoruba', 'Igbo'], ['Hausa', 'Yoruba'], ['French', 'Igbo'], ['Hausa', 'French']]);
            return mlb_typed('num', 'In a club of ' . $n . ' members, ' . $x . ' speak ' . $L1 . ', ' . $y . ' speak ' . $L2 . ', and ' . $z . ' speak both. How many speak neither?', (string)$none,
                ['Speak at least one: $' . $x . ' + ' . $y . ' - ' . $z . ' = ' . ($x + $y - $z) . '$.', 'Neither: $' . $n . ' - ' . ($x + $y - $z) . ' = ' . $none . '$.'],
                'First count those who speak at least one, without counting anyone twice.', 'application', 45); },
    ],

    /* ── MC-185 Pigeonhole: shared birth months; 51 numbers from 1 to 100 ── */
    'MC-185' => [
        static function (MlbRng $r) { [$what, $k] = $r->pick([['birth month', 12], ['day of the week of birth', 7], ['last digit of their phone number', 10], ['blood group (A, B, AB or O)', 4]]); $m = $r->int(2, 5);
            return mlb_typed('num', 'What is the smallest number of pupils a class must have to be SURE that at least ' . $m . ' of them share the same ' . $what . '?', (string)($k * ($m - 1) + 1),
                ['There are ' . $k . ' boxes. With ' . ($m - 1) . ' pupils in every box, ' . ($k * ($m - 1)) . ' pupils need not have ' . $m . ' together.', 'One more pupil forces a box to hold ' . $m . ': $' . $k . ' \\times ' . ($m - 1) . ' + 1 = ' . ($k * ($m - 1) + 1) . '$.'],
                'Imagine the worst case: everyone spread out as evenly as possible.', 'application', 45); },
        static function (MlbRng $r) { $m = $r->pick([10, 20, 30, 50]); $N = 2 * $m;
            return mlb_mcq($r, 'Any ' . ($m + 1) . ' different whole numbers are chosen from 1 to ' . $N . '. Which of these MUST be true?', 'Two of them are consecutive',
                [['Two of them add up to ' . $N, 'Pairs adding to ' . $N . ' are $(1, ' . ($N - 1) . '), \\ldots$, plus ' . $m . ' and ' . $N . ' alone — ' . ($m + 1) . ' boxes, so ' . ($m + 1) . ' numbers can avoid it.'],
                 ['Two of them are equal', 'The numbers are chosen different.'],
                 ['One of them is ' . $N, 'Choose ' . implode(', ', [1, 2, 3]) . ', … — ' . $N . ' can be left out.']],
                ['Make ' . $m . ' boxes: $\\{1, 2\\}, \\{3, 4\\}, \\ldots, \\{' . ($N - 1) . ', ' . $N . '\\}$.', $m + 1 . ' numbers in ' . $m . ' boxes: some box holds two, and they are consecutive.'],
                'Find ' . $m . ' boxes so that two numbers in one box have the property.', 'reasoning', 55); },
    ],

    /* ── MC-186 Binomial coefficients: Pascal's rule; a committee; symmetry ── */
    'MC-186' => [
        static function (MlbRng $r) { $n = $r->int(5, 15); $k = $r->int(1, $n - 2);
            return mlb_mcq($r, 'Which of these equals $\\binom{' . $n . '}{' . $k . '} + \\binom{' . $n . '}{' . ($k + 1) . '}$?', '$\\binom{' . ($n + 1) . '}{' . ($k + 1) . '}$',
                [['$\\binom{' . $n . '}{' . (2 * $k + 1) . '}$', 'Binomial coefficients do not add along the bottom numbers.'],
                 ['$\\binom{' . (2 * $n) . '}{' . (2 * $k + 1) . '}$', 'They do not add top-to-top and bottom-to-bottom either.'],
                 ['$\\binom{' . ($n + 1) . '}{' . $k . '}$', 'Close: Pascal\'s rule gives the LARGER of the two bottom numbers, ' . ($k + 1) . '.']],
                ['Pascal\'s rule: $\\binom{n}{k} + \\binom{n}{k + 1} = \\binom{n + 1}{k + 1}$ — two neighbours add to the number below them.', 'So it is $\\binom{' . ($n + 1) . '}{' . ($k + 1) . '}$.'],
                'Picture Pascal\'s triangle.', 'concept', 40); },
        static function (MlbRng $r) { $n = $r->int(6, 14); $k = $r->int(2, 4); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('num', 'A committee of ' . $k . ' is to be chosen from ' . $n . ' volunteers at a centre in ' . $town . '. How many different committees are possible?', (string)mlb_ncr($n, $k),
                ['Order does not matter, so it is $\\binom{' . $n . '}{' . $k . '}$.', '$= \\frac{' . implode(' \\times ', range($n, $n - $k + 1)) . '}{' . implode(' \\times ', range($k, 1)) . '} = ' . mlb_ncr($n, $k) . '$.'],
                'Does the order in which members are picked matter?', 'application', 45); },
        static function (MlbRng $r) { $n = $r->int(9, 30); do { $k = $r->int(2, $n - 2); } while (2 * $k === $n);
            return mlb_typed('num', '$\\binom{' . $n . '}{' . $k . '} = \\binom{' . $n . '}{m}$, where $m \\ne ' . $k . '$. Find $m$.', (string)($n - $k),
                ['Choosing ' . $k . ' to take is the same as choosing ' . ($n - $k) . ' to leave.', 'So $\\binom{' . $n . '}{' . $k . '} = \\binom{' . $n . '}{' . ($n - $k) . '}$, and $m = ' . ($n - $k) . '$.'],
                'Choosing the ones you take also chooses the ones you leave.', 'concept', 35); },
    ],

    /* ── MC-189 Expected value: is a game fair; linearity with a transformation ── */
    'MC-189' => [
        static function (MlbRng $r) { $k = $r->int(2, 10); $W = 100 * $k * $r->int(1, 8); $c = 50 * $r->int(1, 20);
            return mlb_typed('num', 'A stall at a fair charges ₦' . mlb_p($c) . ' a go. You win ₦' . mlb_p($W) . ' with probability $\\frac{1}{' . $k . '}$, and nothing otherwise. What is your expected profit per go, in naira? (A loss is negative.)', (string)($W / $k - $c),
                ['Expected winnings $= \\frac{1}{' . $k . '} \\times ' . $W . ' = ' . ($W / $k) . '$.', 'Expected profit $= ' . ($W / $k) . ' - ' . $c . ' = ' . ($W / $k - $c) . '$.'],
                'Average win per go, minus the cost of the go.', 'application', 50); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(1, 9); $m = $r->int(2, 4); $c = $r->int(1, 9);
            return mlb_mcq($r, '$E[X] = ' . $a . '$ and $E[Y] = ' . $b . '$. What is $E[' . $m . 'X - Y + ' . $c . ']$?', (string)($m * $a - $b + $c),
                [[(string)($m * $a + $b + $c), 'The $Y$ is subtracted, so subtract its expectation.'],
                 [(string)($m * $a - $b), 'A constant added to a quantity adds to its average too.'],
                 [(string)($a - $b + $c), 'Multiplying $X$ by ' . $m . ' multiplies its average by ' . $m . '.']],
                ['Expectation is linear: $E[' . $m . 'X - Y + ' . $c . '] = ' . $m . 'E[X] - E[Y] + ' . $c . '$.', '$= ' . ($m * $a) . ' - ' . $b . ' + ' . $c . ' = ' . ($m * $a - $b + $c) . '$.'],
                'Treat $E$ like a bracket you can expand.', 'concept', 40); },
    ],

    /* ── MC-191 Vieta: the equation with doubled roots; sum of roots when a ≠ 1 ── */
    'MC-191' => [
        static function (MlbRng $r) { $b = $r->nz(-9, 9); $c = $r->nz(-9, 9);
            return mlb_typed('expr', '$\\alpha$ and $\\beta$ are the roots of $x^2' . mlb_sterm($b, 'x') . mlb_sterm($c) . ' = 0$. Find the quadratic $x^2 + px + q$ whose roots are $2\\alpha$ and $2\\beta$.', 'x^2' . (2 * $b < 0 ? '' : '+') . (2 * $b) . 'x' . (4 * $c < 0 ? '' : '+') . (4 * $c),
                ['$\\alpha + \\beta = ' . (-$b) . '$ and $\\alpha\\beta = ' . $c . '$.', 'New roots: sum $2(\\alpha + \\beta) = ' . (-2 * $b) . '$, product $4\\alpha\\beta = ' . (4 * $c) . '$.', 'So $x^2' . mlb_sterm(2 * $b, 'x') . mlb_sterm(4 * $c) . '$.'],
                'Find the new sum and product of roots, then build the equation from them.', 'challenge', 60); },
        static function (MlbRng $r) { do { $a = $r->int(2, 7); $b = $r->nz(-12, 12); $c = $r->nz(-9, 9); } while (abs($b) === $a || $b === $c || $c === -$b || mlb_gcd($b, $a) === $a);
            return mlb_mcq($r, 'What is the sum of the roots of $' . $a . 'x^2' . mlb_sterm($b, 'x') . mlb_sterm($c) . ' = 0$?', '$' . mlb_ftex(-$b, $a) . '$',
                [['$' . (-$b) . '$', 'Divide by the leading coefficient ' . $a . ' first: the sum is $-\\frac{b}{a}$.'],
                 ['$' . mlb_ftex($b, $a) . '$', 'The sum is MINUS $\\frac{b}{a}$.'],
                 ['$' . mlb_ftex($c, $a) . '$', 'That is the PRODUCT of the roots.']],
                ['Divide by ' . $a . ': $x^2' . ($b < 0 ? ' - ' : ' + ') . mlb_ftex(abs($b), $a) . 'x' . ($c < 0 ? ' - ' : ' + ') . mlb_ftex(abs($c), $a) . ' = 0$.', 'Sum of roots $= -\\frac{b}{a} = ' . mlb_ftex(-$b, $a) . '$.'],
                'Make the $x^2$ coefficient 1 first.', 'concept', 40); },
    ],

    /* ── MC-193 AM–GM: the minimum of ax + b/x; the least perimeter ── */
    'MC-193' => [
        static function (MlbRng $r) { do { $a = $r->int(1, 9); $b = $r->int(1, 16); $ab = $a * $b; $s = (int)round(sqrt($ab)); } while ($s * $s !== $ab || $a === $b);
            return mlb_mcq($r, 'For $x > 0$, what is the smallest value of $' . mlb_lterm($a, 'x') . ' + \\frac{' . $b . '}{x}$?', (string)(2 * $s),
                [[(string)($a + $b), 'That is the value at $x = 1$, which is not where the minimum is.'],
                 [(string)$s, 'AM–GM gives $\\frac{p + q}{2} \\ge \\sqrt{pq}$, so the SUM is at least $2\\sqrt{pq}$.'],
                 [(string)(2 * $ab), 'Apply AM–GM to the two terms: their product is ' . $ab . ', not their sum.']],
                ['AM–GM: $' . mlb_lterm($a, 'x') . ' + \\frac{' . $b . '}{x} \\ge 2\\sqrt{' . mlb_lterm($a, 'x') . ' \\cdot \\frac{' . $b . '}{x}} = 2\\sqrt{' . $ab . '} = ' . (2 * $s) . '$.', 'Equality when $' . mlb_lterm($a, 'x') . ' = \\frac{' . $b . '}{x}$, which happens for a positive $x$, so the minimum is ' . (2 * $s) . '.'],
                'The product of the two terms is constant.', 'concept', 45); },
        static function (MlbRng $r) { $s = $r->int(4, 40); $town = $r->pick(MLBV2_TOWNS);
            return mlb_typed('num', 'A rectangular plot in ' . $town . ' must have an area of ' . ($s * $s) . ' m². What is the least possible perimeter, in m?', (string)(4 * $s),
                ['Sides $x$ and $y$ with $xy = ' . ($s * $s) . '$; perimeter $2(x + y)$.', 'AM–GM: $x + y \\ge 2\\sqrt{xy} = 2 \\times ' . $s . '$.', 'Least perimeter $= 4 \\times ' . $s . ' = ' . (4 * $s) . '$ m, when the plot is a square.'],
                'For a fixed product, when is a sum smallest?', 'application', 50, ['unit' => 'm']); },
    ],

    /* ── MC-194 Square-mean: least sum of squares with a fixed sum; when Cauchy–Schwarz is tight ── */
    'MC-194' => [
        static function (MlbRng $r) { $k = $r->int(2, 4); $m = $r->int(1, 9); $s = $k * $m;
            $vars = array_slice(['x', 'y', 'z', 'w'], 0, $k);
            return mlb_typed('num', 'Real numbers ' . implode(', ', array_map(static fn($v) => '$' . $v . '$', $vars)) . ' add up to ' . $s . '. What is the smallest possible value of $' . implode(' + ', array_map(static fn($v) => $v . '^2', $vars)) . '$?', (string)($k * $m * $m),
                ['By the square-mean inequality, $\\frac{' . implode(' + ', array_map(static fn($v) => $v . '^2', $vars)) . '}{' . $k . '} \\ge \\left(\\frac{' . $s . '}{' . $k . '}\\right)^2 = ' . ($m * $m) . '$.', 'So the sum of squares is at least $' . $k . ' \\times ' . ($m * $m) . ' = ' . ($k * $m * $m) . '$, with equality when all equal ' . $m . '.'],
                'When the total is fixed, how should it be shared to make the squares smallest?', 'challenge', 55); },
        static function (MlbRng $r) { [$a, $b] = $r->pick([[3, 4], [5, 12], [1, 2], [2, 3], [8, 15]]); $t = $r->int(2, 4);
            return mlb_mcq($r, 'For which $(x, y)$ is $(' . mlb_lterm($a, 'x') . ' + ' . $b . 'y)^2 = ' . ($a * $a + $b * $b) . '(x^2 + y^2)$?', '$(' . ($t * $a) . ', ' . ($t * $b) . ')$',
                [['$(' . ($t * $b) . ', ' . ($t * $a) . ')$', 'Swapped: equality needs $(x, y)$ in the SAME ratio as $(' . $a . ', ' . $b . ')$.'],
                 ['$(1, 1)$', 'Check: $' . (($a + $b) ** 2) . ' \\ne ' . (2 * ($a * $a + $b * $b)) . '$.'],
                 ['$(' . $b . ', -' . $a . ')$', 'That makes $' . mlb_lterm($a, 'x') . ' + ' . $b . 'y = 0$ — the opposite extreme.']],
                ['Cauchy–Schwarz: $(ax + by)^2 \\le (a^2 + b^2)(x^2 + y^2)$, with equality exactly when $(x, y)$ is a multiple of $(a, b)$.', '$(' . ($t * $a) . ', ' . ($t * $b) . ') = ' . $t . '(' . $a . ', ' . $b . ')$.'],
                'When does Cauchy–Schwarz become an equality?', 'concept', 45); },
    ],

    /* ── MC-198 Power of a point: the secant misread; a chord with an unknown part ── */
    'MC-198' => [
        static function (MlbRng $r) { [$a, $b] = $r->pick([[4, 5], [1, 8], [2, 6], [3, 9], [4, 12], [8, 10], [9, 7], [2, 16]]); $t = (int)round(sqrt($a * ($a + $b)));
            return mlb_mcq($r, 'From $P$ outside a circle, a tangent touches it at $T$. A line from $P$ meets the circle at $A$ and then $B$, with $PA = ' . $a . '$ and the chord $AB = ' . $b . '$. Find $PT$.', (string)$t,
                [['$\\sqrt{' . ($a * $b) . '}$', 'Use the whole distance $PB = ' . ($a + $b) . '$, not the chord $AB$.'],
                 [(string)($a + $b), 'That is $PB$; the tangent satisfies $PT^2 = PA \\times PB$.'],
                 ['$\\sqrt{' . ($a * $a + $b * $b) . '}$', 'This is not Pythagoras: use $PT^2 = PA \\times PB$.']],
                ['$PB = PA + AB = ' . ($a + $b) . '$.', '$PT^2 = PA \\times PB = ' . $a . ' \\times ' . ($a + $b) . ' = ' . ($a * ($a + $b)) . '$, so $PT = ' . $t . '$.'],
                'Both lengths in the product are measured from $P$.', 'reasoning', 50); },
        static function (MlbRng $r) { do { $x = $r->int(2, 10); $d = $r->int(1, 8); $P = $x * ($x + $d); $divs = []; for ($c = 2; $c < $P; $c++) if ($P % $c === 0 && $c !== $x && $c !== $x + $d) $divs[] = $c; } while (!$divs);
            $c = $r->pick($divs); $e = intdiv($P, $c);
            return mlb_typed('num', 'Chords $AB$ and $CD$ of a circle cross at $P$. $AP = x$, $PB = x + ' . $d . '$, $CP = ' . $c . '$ and $PD = ' . $e . '$. Find $x$.', (string)$x,
                ['Intersecting chords: $AP \\times PB = CP \\times PD$.', '$x(x + ' . $d . ') = ' . $P . '$, so $x^2' . mlb_sterm($d, 'x') . ' - ' . $P . ' = 0$.', 'Factorise: $(x - ' . $x . ')(x + ' . ($x + $d) . ') = 0$, and $x > 0$, so $x = ' . $x . '$.'],
                'Write the chord rule, then solve the quadratic.', 'challenge', 60); },
    ],

    /* ── MC-200 Proof: a counterexample; counting by pairs ── */
    'MC-200' => [
        static function (MlbRng $r) { $k = $r->pick([4, 8, 9, 12, 18, 25]); $ok = $r->shuffle([2, 3, 5, 6, 7, 10, 15]);
            $n = ['4' => 2, '8' => 4, '9' => 3, '12' => 6, '18' => 6, '25' => 5][(string)$k];
            return mlb_mcq($r, 'Claim: "if $n^2$ is divisible by $k$, then $n$ is divisible by $k$." For which value of $k$ is the claim FALSE?', '$k = ' . $k . '$',
                array_map(static fn($w) => ['$k = ' . $w . '$', $w . ' has no repeated prime factor, so every prime of ' . $w . ' that divides $n^2$ divides $n$: the claim is true for ' . $w . '.'], array_slice($ok, 0, 3)),
                ['One counterexample is enough to show a claim false.', 'For $k = ' . $k . '$: $n = ' . $n . '$ gives $n^2 = ' . ($n * $n) . '$, divisible by ' . $k . ', but ' . $n . ' is not.'],
                'Look for a $k$ with a repeated prime factor, and test a small $n$.', 'reasoning', 50); },
        static function (MlbRng $r) { $n = $r->int(5, 30);
            return mlb_typed('num', 'How many diagonals does a polygon with ' . $n . ' sides have?', (string)intdiv($n * ($n - 3), 2),
                ['Each vertex joins to every other vertex except itself and its two neighbours: $' . $n . ' - 3 = ' . ($n - 3) . '$ diagonals.', 'Counting from every vertex gives $' . $n . ' \\times ' . ($n - 3) . '$, but each diagonal is counted from both ends.', 'So $\\frac{' . $n . ' \\times ' . ($n - 3) . '}{2} = ' . intdiv($n * ($n - 3), 2) . '$.'],
                'Count from one corner, then think about double counting.', 'challenge', 50); },
    ],
    ];
}
