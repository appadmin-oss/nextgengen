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
    ];
}
