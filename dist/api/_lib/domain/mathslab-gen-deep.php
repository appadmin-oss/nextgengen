<?php
declare(strict_types=1);

/**
 * Maths Lab — deeper question forms for Stages 5–7 (MC-041 … MC-070).
 *
 * Owner, 5 Nov 2026: "Broaden the maths labs stage from stage 5. Go deeper." Stages 5–7 were
 * built first, as the pilot band, and carried one or two kinds of question per topic while
 * Stages 8–17 carry five or six — so a child met the same question shape again and again in
 * exactly the band where algebra is learned. Every topic here gains three or four new forms,
 * at least one of them a CHALLENGE (`dim` 'challenge'): a question that needs the idea rather
 * than the routine — a shortcut, a second step, a trap the routine falls into.
 *
 * Same rules as mathslab-gen.php: every answer and every wrong option is DERIVED from the
 * numbers that built the question; a wrong option names the misconception behind it; every
 * question carries worked steps and a hint; maths is LaTeX.
 *
 * ORDER MATTERS. A session stores each question as (topic, form number, seed), so a form may
 * never change its number. These forms are appended AFTER a topic's own forms and after its
 * two "Why it works" forms (mlb_forms), never before them — `mlb_why_at()` says where the
 * proof pair sits, because it is no longer always the last two.
 */

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
function mlb_ord(int $n): string {
    $t = $n % 100;
    if ($t >= 11 && $t <= 13) return $n . 'th';
    return $n . (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');
}

function mlb_forms_deep(): array {
    static $f = null;
    if ($f !== null) return $f;
    return $f = [
    /* ═══ Stage 5 — The Language of Algebra ═══ */
    'MC-041' => [
        static function (MlbRng $r) { $a = $r->int(-5, 12); $d = $r->nz(-4, 7); $c = $a - $d; $seq = [$a, $a + $d, $a + 2 * $d, $a + 3 * $d];
            return mlb_typed('expr', 'Find a formula for the $n$th term of $' . implode(',\\ ', $seq) . ',\\ \\dots$', $d . 'n' . ($c < 0 ? '' : '+') . $c,
                ['The common difference is ' . $d . ', so the formula starts $' . mlb_lterm($d, 'n') . '$.', 'When $n = 1$, $' . mlb_lterm($d, 'n') . '$ gives ' . $d . ', but the first term is ' . $a . ', so adjust by ' . $c . ': $' . mlb_lterm($d, 'n') . mlb_sterm($c) . '$.'],
                'The difference between terms tells you the multiple of $n$.', 'procedure', 50, ['vars' => 'n']); },
        static function (MlbRng $r) { $a = $r->int(2, 15); $d = $r->int(2, 9); $n = $r->int(12, 60); $N = $a + ($n - 1) * $d;
            return mlb_typed('num', 'The pattern $' . $a . ',\\ ' . ($a + $d) . ',\\ ' . ($a + 2 * $d) . ',\\ \\dots$ goes up by the same amount each time. Which term is ' . $N . '?', (string)$n,
                ['The $n$th term is $' . $a . ' + (n - 1) \\times ' . $d . '$.', 'Set it equal to ' . $N . ': $(n - 1) \\times ' . $d . ' = ' . ($N - $a) . '$, so $n - 1 = ' . ($n - 1) . '$ and $n = ' . $n . '$.'],
                'Write the $n$th term, then solve.', 'application', 50); },
        static function (MlbRng $r) { $c = $r->int(-3, 6); $k = $r->int(8, 20); $seq = array_map(static fn($n) => $n * $n + $c, [1, 2, 3, 4, 5]);
            return mlb_typed('num', 'The pattern $' . implode(',\\ ', $seq) . ',\\ \\dots$ continues. Look at the differences between its terms. What is the ' . mlb_ord($k) . ' term?', (string)($k * $k + $c),
                ['The differences are $3, 5, 7, 9$ — they grow by 2 each time, so the pattern is built on the square numbers $1, 4, 9, 16, 25$.', 'Each term is $n^2' . mlb_sterm($c) . '$, so the ' . mlb_ord($k) . ' term is $' . $k . '^2' . mlb_sterm($c) . ' = ' . ($k * $k + $c) . '$.'],
                'Compare each term with the square numbers.', 'challenge', 75); },
    ],
    'MC-042' => [
        static function (MlbRng $r) { $k = $r->int(2, 9); $m = $r->int(2, 12); $who = $r->pick(MLB_NAMES);
            return mlb_typed('expr', $who . ' is $a$ years old. ' . $who . '’s brother is ' . $k . ' years older. Write an expression for the brother’s age in ' . $m . ' years’ time.', 'a+' . ($k + $m),
                ['Now the brother is $a + ' . $k . '$.', 'In ' . $m . ' years he will be $a + ' . $k . ' + ' . $m . ' = a + ' . ($k + $m) . '$.'], 'Start with his age now.', 'application', 45, ['vars' => 'a']); },
        static function (MlbRng $r) { $x = $r->int(2, 7); $y = $r->int(2, 7); if ($x === $y) $y++;
            return mlb_typed('expr', 'A pen costs $p$ naira and a book costs $b$ naira. Write an expression for the cost, in naira, of ' . $x . ' pens and ' . $y . ' books.', $x . 'p+' . $y . 'b',
                [$x . ' pens cost $' . $x . 'p$ naira and ' . $y . ' books cost $' . $y . 'b$ naira.', 'Together: $' . $x . 'p + ' . $y . 'b$. These are unlike terms, so it stays as two terms.'],
                'Each item’s cost times how many.', 'application', 40, ['vars' => 'p,b', 'form' => 'simplified']); },
        static function (MlbRng $r) { $odd = $r->int(0, 1) === 1; $k = $r->int(1, 4);
            if (!$odd) return mlb_mcq($r, '$n$ stands for any whole number. Which expression is ALWAYS even?', '$' . (2 * $k) . 'n$',
                [['$n + 2$', 'If $n$ is odd, $n + 2$ is odd too.'], ['$' . (2 * $k + 1) . 'n$', 'If $n$ is odd, an odd number times an odd number is odd.'], ['$n^2$', 'If $n$ is odd, $n^2$ is odd.']],
                ['$' . (2 * $k) . 'n = 2 \\times ' . mlb_lterm($k, 'n') . '$, and 2 times any whole number is even.', 'Each of the others is odd when $n$ is odd: try $n = 1$.'],
                'Try $n = 1$ and $n = 2$ in each.', 'reasoning', 45);
            return mlb_mcq($r, '$n$ stands for any whole number. Which expression is ALWAYS odd?', '$2n + ' . (2 * $k - 1) . '$',
                [['$n + ' . (2 * $k - 1) . '$', 'If $n$ is odd, this is even.'], ['$2n + ' . (2 * $k) . '$', 'Two times a number, plus an even number, is even.'], ['$' . (2 * $k + 1) . 'n$', 'When $n$ is even this is even.']],
                ['$2n$ is always even.', 'An even number plus an odd number (' . (2 * $k - 1) . ') is always odd.'], 'Try $n = 1$ and $n = 2$ in each.', 'reasoning', 45); },
        static function (MlbRng $r) { $c = $r->int(3, 5); $even = $r->int(0, 1) === 1; $step = $even ? 2 : 1; $sum = intdiv($c * ($c - 1), 2) * $step;
            return mlb_typed('expr', 'The smallest of ' . $c . ' consecutive ' . ($even ? 'even numbers' : 'whole numbers') . ' is $n$. Write their sum as simply as possible.', $c . 'n+' . $sum,
                ['The numbers are $' . implode(',\\ ', array_map(static fn($i) => $i === 0 ? 'n' : 'n + ' . ($i * $step), range(0, $c - 1))) . '$.',
                 'Add: ' . $c . ' lots of $n$, and $' . implode(' + ', array_map(static fn($i) => $i * $step, range(1, $c - 1))) . ' = ' . $sum . '$, so $' . $c . 'n + ' . $sum . '$.'],
                'Consecutive ' . ($even ? 'even numbers go up in 2s' : 'numbers go up in 1s') . '.', 'challenge', 60, ['vars' => 'n', 'form' => 'simplified']); },
    ],
    'MC-043' => [
        static function (MlbRng $r) { $vars = $r->shuffle(['x^2', 'xy', 'y', 'x', 'y^2', 'x^2y']); $cnt = $r->int(3, 5); $parts = [];
            for ($i = 0; $i < $cnt - 1; $i++) $parts[] = [$r->nz(-9, 9), $vars[$i]];
            $parts[] = [$r->nz(-12, 12), '']; $parts = $r->shuffle($parts); $tex = '';
            foreach ($parts as $j => [$c, $v]) $tex .= $j === 0 ? mlb_lterm($c, $v) : mlb_sterm($c, $v);
            return mlb_typed('num', 'How many terms are in $' . $tex . '$?', (string)$cnt,
                ['Terms are separated by $+$ and $-$ signs, and each sign belongs to the term after it.', 'Count them: ' . $cnt . ' terms.'], 'Count the pieces between the + and − signs.', 'concept', 25); },
        static function (MlbRng $r) { $a = $r->nz(-7, 7); $b = $r->nz(-9, 9); $c = $r->nz(-15, 15);
            return mlb_typed('num', 'What is the constant term of $' . mlb_lterm($a, 'x^2') . mlb_sterm($b, 'x') . mlb_sterm($c) . '$?', (string)$c,
                ['The constant term is the one with no letter in it.', 'It is $' . $c . '$ — the sign in front belongs to it.'], 'Which term has no $x$?', 'concept', 25); },
        static function (MlbRng $r) { $k = $r->nz(-9, 9); $m = $r->int(2, 8);
            return mlb_mcq($r, 'Which term is a like term of $' . $m . 'x^2y$?', '$' . mlb_lterm($k, 'yx^2') . '$',
                [['$' . $m . 'xy^2$', 'The powers sit on different letters: $x^2y$ is not $xy^2$.'], ['$' . $m . 'x^2$', 'A like term needs exactly the same letters: this has no $y$.'], ['$' . $m . 'x^2y^2$', 'The power of $y$ is different.']],
                ['Like terms have the same letters with the same powers; only the number in front may differ.', '$yx^2$ is $x^2y$ written in another order, so $' . mlb_lterm($k, 'yx^2') . '$ is a like term.'],
                'Compare the letters AND their powers.', 'concept', 35); },
        static function (MlbRng $r) { $a = $r->int(2, 6); $b = $r->int(2, 6); $c = $r->int(1, 9); $d = $r->nz(-5, 7); $e = $r->int(1, 9);
            return mlb_typed('num', 'After expanding, what is the coefficient of $xy$ in $' . $a . 'x(' . $b . 'y - ' . $c . ')' . ($d < 0 ? ' - ' : ' + ') . (abs($d) === 1 ? '' : abs($d)) . 'y(x + ' . $e . ')$?', (string)($a * $b + $d),
                ['$' . $a . 'x(' . $b . 'y - ' . $c . ') = ' . ($a * $b) . 'xy - ' . ($a * $c) . 'x$ and $' . mlb_lterm($d, 'y') . '(x + ' . $e . ') = ' . mlb_lterm($d, 'xy') . mlb_sterm($d * $e, 'y') . '$.',
                 'Only the $xy$ terms count: $' . ($a * $b) . ' ' . ($d < 0 ? '-' : '+') . ' ' . abs($d) . ' = ' . ($a * $b + $d) . '$.'],
                'Expand both brackets and collect only the $xy$ terms.', 'challenge', 60); },
    ],
    'MC-044' => [
        static function (MlbRng $r) { $a = $r->int(3, 8); $b = $r->int(2, 9); $c = $r->int(1, $a - 1); $d = $r->int(1, 9); $A = $a - $c; $B = $b + $d;
            return mlb_mcq($r, 'Simplify $' . $a . 'x^2 + ' . $b . 'x - ' . mlb_lterm($c, 'x^2') . ' + ' . $d . 'x$.', '$' . mlb_lterm($A, 'x^2') . ' + ' . $B . 'x$',
                [['$' . ($A + $B) . 'x^2$', '$x^2$ and $x$ are not like terms, so they cannot be added together.'], ['$' . ($A + $B) . 'x^3$', 'Unlike terms are never combined, and adding never changes a power.'],
                 ['$' . mlb_lterm($A, 'x^2') . ' + ' . mlb_lterm($b - $d, 'x') . '$', 'The sign in front of $' . $d . 'x$ is $+$.']],
                ['Collect the $x^2$ terms: $' . $a . 'x^2 - ' . mlb_lterm($c, 'x^2') . ' = ' . mlb_lterm($A, 'x^2') . '$.', 'Collect the $x$ terms: $' . $b . 'x + ' . $d . 'x = ' . $B . 'x$.'],
                '$x^2$ and $x$ are different kinds of term.', 'procedure', 40); },
        static function (MlbRng $r) { $p = $r->int(3, 9); $q = $r->int(2, 8); $s = $r->int(1, $p + $q - 1); if ($s === $p) $s--; $t = $p + $q - $s;
            return mlb_mcq($r, 'Simplify $' . $p . 'ab + ' . $q . 'ba - ' . $s . 'ab$.', '$' . mlb_lterm($t, 'ab') . '$',
                [['$' . mlb_lterm($p - $s, 'ab') . ' + ' . $q . 'ba$', '$ba$ is the same as $ab$ (you can multiply in either order), so they are like terms.'], ['$' . mlb_lterm($t, 'a^2b^2') . '$', 'Adding like terms never changes the letters or their powers.'],
                 ['$' . ($p + $q + $s) . 'ab$', 'The last term is subtracted.']],
                ['$ba = ab$, so all three are like terms.', '$' . $p . ' + ' . $q . ' - ' . $s . ' = ' . $t . '$, so $' . mlb_lterm($t, 'ab') . '$.'], 'Is $ba$ the same as $ab$?', 'concept', 40); },
        static function (MlbRng $r) { $a = $r->int(5, 9); $b = $r->int(2, 6); $c = $r->int(1, $a - 2); $d = $r->int($b + 1, $b + 7);
            $L0 = '$= ' . $a . 'x - ' . mlb_lterm($c, 'x') . ' - ' . $b . 'y + ' . $d . 'y$'; $L1 = '$= ' . mlb_lterm($a - $c, 'x') . ' + ' . mlb_lterm($d - $b, 'y') . '$';
            return mlb_error_of($r, 'Find the first mistake: simplify $' . $a . 'x - ' . $b . 'y - ' . mlb_lterm($c, 'x') . ' + ' . $d . 'y$.', [$L0, $L1], [
                [0, ['$= ' . $a . 'x + ' . mlb_lterm($c, 'x') . ' - ' . $b . 'y + ' . $d . 'y$', '$= ' . ($a + $c) . 'x + ' . mlb_lterm($d - $b, 'y') . '$'], 'the term $-' . mlb_lterm($c, 'x') . '$ keeps its minus sign when it moves.'],
                [1, [$L0, '$= ' . mlb_lterm($a - $c, 'x') . ' - ' . mlb_lterm($d - $b, 'y') . '$'], '$-' . $b . 'y + ' . $d . 'y$ is positive, because ' . $d . ' is bigger than ' . $b . '.'],
                [1, [$L0, '$= ' . mlb_lterm($a - $c, 'x') . ' + ' . ($d + $b) . 'y$'], 'the ' . $b . 'y is subtracted, so it is $' . $d . ' - ' . $b . '$, not $' . $d . ' + ' . $b . '$.'],
            ]); },
        static function (MlbRng $r) { $a = $r->int(2, 5); $b = $r->int(1, 9); $c = $r->int(1, 4); $d = $r->int(1, 9);
            return mlb_typed('expr', 'A rectangle is $(' . $a . 'x + ' . $b . ')$ cm long and $(' . mlb_lterm($c, 'x') . ' + ' . $d . ')$ cm wide. Write its perimeter, in cm, as simply as possible.', (2 * ($a + $c)) . 'x+' . (2 * ($b + $d)),
                ['Perimeter $= 2 \\times$ length $+ 2 \\times$ width $= 2(' . $a . 'x + ' . $b . ') + 2(' . mlb_lterm($c, 'x') . ' + ' . $d . ')$.',
                 '$= ' . (2 * $a) . 'x + ' . (2 * $b) . ' + ' . (2 * $c) . 'x + ' . (2 * $d) . ' = ' . (2 * ($a + $c)) . 'x + ' . (2 * ($b + $d)) . '$.'],
                'There are two lengths and two widths.', 'challenge', 55, ['vars' => 'x', 'form' => 'simplified']); },
    ],
    'MC-045' => [
        static function (MlbRng $r) { $a = $r->int(1, 8); $b = $r->int(2, 6); $c = $r->int(1, 7); $B = $a - $b; $C = $b * $c;
            return mlb_typed('expr', 'Expand and simplify $x(x + ' . $a . ') - ' . $b . '(x - ' . $c . ')$.', 'x^2' . ($B === 0 ? '' : ($B > 0 ? '+' : '') . $B . 'x') . '+' . $C,
                ['$x(x + ' . $a . ') = x^2 + ' . mlb_lterm($a, 'x') . '$ and $-' . $b . '(x - ' . $c . ') = -' . $b . 'x + ' . $C . '$ (minus times minus is plus).', 'Collect: $x^2' . mlb_sterm($B, 'x') . ' + ' . $C . '$.'],
                'Watch the sign when the $-' . $b . '$ multiplies $-' . $c . '$.', 'challenge', 60, ['form' => 'expanded']); },
    ],
    'MC-046' => [
        static function (MlbRng $r) { $u = $r->int(0, 20); $a = $r->nz(-4, 6); $t = $r->int(2, 9);
            return mlb_typed('num', 'Use $v = u + at$ to find $v$ when $u = ' . $u . '$, $a = ' . $a . '$ and $t = ' . $t . '$.', (string)($u + $a * $t),
                ['Replace each letter by its value: $v = ' . $u . ' + (' . $a . ') \\times ' . $t . '$.', '$= ' . $u . ' ' . ($a < 0 ? '-' : '+') . ' ' . abs($a * $t) . ' = ' . ($u + $a * $t) . '$.'], '$at$ means $a \\times t$.', 'procedure', 35); },
        static function (MlbRng $r) { $x = $r->int(3, 9);
            return mlb_mcq($r, 'When $x = -' . $x . '$, what is the value of $-x^2$?', '$-' . ($x * $x) . '$',
                [['$' . ($x * $x) . '$', 'The square is done first: $x^2 = ' . ($x * $x) . '$, and then the minus sign in front makes it negative.'], ['$' . (2 * $x) . '$', 'Squaring is not doubling.'], ['$-' . (2 * $x) . '$', 'Squaring is not doubling.']],
                ['$x^2 = (-' . $x . ')^2 = ' . ($x * $x) . '$.', '$-x^2$ means $-(x^2) = -' . ($x * $x) . '$.'], 'Powers come before the minus sign in front.', 'concept', 35); },
        static function (MlbRng $r) { $C = 5 * $r->int(-8, 20); $F = intdiv(9 * $C, 5) + 32;
            return mlb_typed('num', 'Use $F = \\frac{9C}{5} + 32$ to change $' . $C . '^\\circ$C to degrees Fahrenheit.', (string)$F,
                ['$\\frac{9 \\times ' . ($C < 0 ? '(' . $C . ')' : $C) . '}{5} = ' . intdiv(9 * $C, 5) . '$.', '$' . intdiv(9 * $C, 5) . ' + 32 = ' . $F . '$.'], 'Multiply, divide, then add.', 'application', 45); },
        static function (MlbRng $r) { $u = $r->int(0, 12); $a = 2 * $r->nz(-3, 5); $t = $r->int(2, 8); $h = intdiv($a * $t * $t, 2); $s = $u * $t + $h;
            return mlb_typed('num', 'Use $s = ut + \\frac{1}{2}at^2$ to find $s$ when $u = ' . $u . '$, $a = ' . $a . '$ and $t = ' . $t . '$.', (string)$s,
                ['$ut = ' . $u . ' \\times ' . $t . ' = ' . ($u * $t) . '$.', '$\\frac{1}{2}at^2 = \\frac{1}{2} \\times ' . ($a < 0 ? '(' . $a . ')' : $a) . ' \\times ' . ($t * $t) . ' = ' . $h . '$ — square $t$ first.', '$s = ' . ($u * $t) . mlb_sterm($h) . ' = ' . $s . '$.'],
                'Only $t$ is squared, not $at$.', 'challenge', 60); },
    ],
    'MC-047' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 12);
            return mlb_mcq($r, 'To solve $\\frac{x}{' . $a . '} = ' . $b . '$, what should you do to both sides?', 'Multiply both sides by ' . $a,
                [['Divide both sides by ' . $a, 'That gives $\\frac{x}{' . ($a * $a) . '}$: the opposite of dividing is multiplying.'], ['Subtract ' . $a . ' from both sides', '$x$ is divided by ' . $a . ', not added to it.'],
                 ['Multiply the left side by ' . $a . ' only', 'Both sides must change in the same way, or the balance is lost.']],
                ['$x$ is divided by ' . $a . ', and multiplying undoes dividing.', '$x = ' . $b . ' \\times ' . $a . ' = ' . ($a * $b) . '$.'], 'What undoes “÷ ' . $a . '”?', 'concept', 30); },
        static function (MlbRng $r) { $n = $r->int(2, 6); $w = $r->int(2, 9); $k = $r->int(1, 9);
            return mlb_typed('num', 'On a balance, ' . $n . ' identical bags and a ' . $k . ' kg weight on one pan balance ' . ($n * $w + $k) . ' kg of weights on the other. How heavy is one bag, in kg?', (string)$w,
                ['Take ' . $k . ' kg off both pans: ' . $n . ' bags balance ' . ($n * $w) . ' kg.', 'Share between the bags: $' . ($n * $w) . ' \\div ' . $n . ' = ' . $w . '$ kg.'], 'Do the same to both pans.', 'application', 45, ['unit' => 'kg']); },
        static function (MlbRng $r) { $p = $r->int(2, 6); $q = $p + $r->int(1, 4); $m = $r->int(2, 9);
            return mlb_mcq($r, 'Which of these does NOT keep an equation balanced?', 'Adding ' . $p . ' to the left side and ' . $q . ' to the right side',
                [['Multiplying both sides by $-' . $m . '$', 'Allowed: multiplying both sides by the same number (not zero) keeps them equal.'], ['Subtracting $x$ from both sides', 'Allowed: you may subtract the same thing — even a letter — from both sides.'],
                 ['Dividing both sides by ' . $m, 'Allowed: dividing both sides by the same non-zero number keeps them equal.']],
                ['Every move must be done to BOTH sides, by the same amount.', 'Adding ' . $p . ' to one side and ' . $q . ' to the other changes them by different amounts, so they are no longer equal.'],
                'Which move treats the two sides differently?', 'reasoning', 40); },
        static function (MlbRng $r) { $a = $r->int(2, 7); $x = $r->int(3, 12); $b = $r->int(3, 15); $c = $a * $x + $b;
            $L = ['$' . $a . 'x = ' . $c . ' - ' . $b . '$', '$' . $a . 'x = ' . ($a * $x) . '$', '$x = ' . $x . '$'];
            return mlb_error_of($r, 'Find the first mistake in solving $' . $a . 'x + ' . $b . ' = ' . $c . '$.', $L, [
                [0, ['$' . $a . 'x = ' . $c . ' + ' . $b . '$', '$' . $a . 'x = ' . ($c + $b) . '$', '$x = ' . mlb_ftex($c + $b, $a) . '$'], 'to remove $+' . $b . '$ you subtract ' . $b . ' from both sides.'],
                [1, [$L[0], '$' . $a . 'x = ' . ($a * $x + 10) . '$', '$x = ' . mlb_ftex($a * $x + 10, $a) . '$'], '$' . $c . ' - ' . $b . ' = ' . ($a * $x) . '$.'],
                [2, [$L[0], $L[1], '$x = ' . ($a * $x - $a) . '$'], '$' . $a . 'x$ means ' . $a . ' times $x$: divide by ' . $a . ', do not subtract it.'],
            ], 'challenge'); },
    ],
    'MC-048' => [
        static function (MlbRng $r) { $a = $r->int(8, 30); $b = $r->int(1, $a - 1);
            return mlb_typed('num', 'Solve $x + ' . $a . ' = ' . $b . '$.', (string)($b - $a),
                ['Subtract ' . $a . ' from both sides: $x = ' . $b . ' - ' . $a . '$.', '$x = ' . ($b - $a) . '$ — an answer can be negative.'], 'Undo the $+' . $a . '$.', 'procedure', 30); },
        static function (MlbRng $r) { do { $a = $r->int(2, 9); $b = $r->int(1, 30); } while ($b % $a === 0);
            return mlb_typed('frac', 'Solve $' . $a . 'x = ' . $b . '$. Give $x$ as a fraction in its lowest terms.', mlb_frac($b, $a),
                ['Divide both sides by ' . $a . ': $x = \\frac{' . $b . '}{' . $a . '}$.', 'In lowest terms: $x = ' . mlb_ftex($b, $a) . '$.'], 'The answer need not be a whole number.', 'procedure', 35, ['form' => 'lowest']); },
        static function (MlbRng $r) { $a = $r->int(3, 15); $b = $r->int(5, 40);
            if ($r->int(0, 1) === 0) return mlb_mcq($r, '“A number minus ' . $a . ' is ' . $b . '.” Which equation says this?', '$n - ' . $a . ' = ' . $b . '$',
                [['$' . $a . ' - n = ' . $b . '$', '“A number minus ' . $a . '” starts with the number.'], ['$n + ' . $a . ' = ' . $b . '$', '“Minus” means subtract.'], ['$n - ' . $b . ' = ' . $a . '$', 'The ' . $a . ' and the ' . $b . ' have swapped.']],
                ['“A number” is $n$; “minus ' . $a . '” gives $n - ' . $a . '$; “is” means $=$.', 'So $n - ' . $a . ' = ' . $b . '$, and $n = ' . ($a + $b) . '$.'], 'Write the words in order.', 'concept', 35);
            return mlb_mcq($r, '“' . $a . ' times a number is ' . ($a * $b) . '.” Which equation says this?', '$' . $a . 'n = ' . ($a * $b) . '$',
                [['$n + ' . $a . ' = ' . ($a * $b) . '$', '“Times” means multiply.'], ['$\\frac{n}{' . $a . '} = ' . ($a * $b) . '$', '“Times” means multiply, not divide.'], ['$' . ($a * $b) . 'n = ' . $a . '$', 'The numbers have swapped places.']],
                ['“' . $a . ' times a number” is $' . $a . 'n$; “is” means $=$.', 'So $' . $a . 'n = ' . ($a * $b) . '$, and $n = ' . $b . '$.'], 'Write the words in order.', 'concept', 35); },
        static function (MlbRng $r) { $c = $r->pick([0.2, 0.4, 0.5, 0.25, 0.8]); $y = $r->int(1, 12);
            return mlb_typed('num', 'Solve $' . mlb_dec($c) . 'x = ' . $y . '$.', mlb_dec($y / $c),
                ['Divide both sides by ' . mlb_dec($c) . ': $x = ' . $y . ' \\div ' . mlb_dec($c) . '$.', 'Dividing by a number less than 1 makes the answer bigger: $x = ' . mlb_dec($y / $c) . '$.'], 'Undo the multiplication.', 'challenge', 45); },
    ],
    'MC-049' => [
        static function (MlbRng $r) { do { $a = $r->int(2, 7); $c = $r->int(2, 7); $b = $r->nz(-6, 8); $x = $r->nz(-6, 9); $num = $x * ($a - $c) + $a * $b; } while ($a === $c || $num % $c !== 0 || $num === 0);
            $d = intdiv($num, $c);
            return mlb_typed('num', 'Solve $' . $a . '(x' . mlb_sterm($b) . ') = ' . $c . '(x' . mlb_sterm($d) . ')$.', (string)$x,
                ['Expand both sides: $' . $a . 'x' . mlb_sterm($a * $b) . ' = ' . $c . 'x' . mlb_sterm($c * $d) . '$.', 'Collect: $' . mlb_lterm($a - $c, 'x') . ' = ' . ($c * $d - $a * $b) . '$, so $x = ' . $x . '$.'],
                'Expand both brackets first.', 'procedure', 70); },
        static function (MlbRng $r) { do { $a = $r->int(2, 6); $b = $r->int(2, 8); } while ($a === $b); $L = mlb_lcm($a, $b); $x = $L * $r->nz(-3, 5); $c = intdiv($x, $a) + intdiv($x, $b);
            return mlb_typed('num', 'Solve $\\frac{x}{' . $a . '} + \\frac{x}{' . $b . '} = ' . $c . '$.', (string)$x,
                ['Multiply every term by ' . $L . ', the LCM of ' . $a . ' and ' . $b . ': $' . mlb_lterm(intdiv($L, $a), 'x') . ' + ' . mlb_lterm(intdiv($L, $b), 'x') . ' = ' . ($c * $L) . '$.',
                 '$' . mlb_lterm(intdiv($L, $a) + intdiv($L, $b), 'x') . ' = ' . ($c * $L) . '$, so $x = ' . $x . '$.'],
                'Clear the fractions by multiplying by the LCM.', 'challenge', 75); },
        static function (MlbRng $r) { $b = $r->int(2, 7); $a = $r->int(1, 9); $c = $r->nz(-5, 9); $x = $b * $c - $a;
            return mlb_typed('num', 'Solve $\\frac{x + ' . $a . '}{' . $b . '} = ' . $c . '$.', (string)$x,
                ['Multiply both sides by ' . $b . ': $x + ' . $a . ' = ' . ($b * $c) . '$.', 'Subtract ' . $a . ': $x = ' . $x . '$.'], 'Undo the division first.', 'procedure', 45); },
    ],
    'MC-050' => [
        static function (MlbRng $r) { $n = $r->int(5, 60); $k = $r->int(3, 4); $t = intdiv($k * ($k - 1), 2); $S = $k * $n + $t;
            return mlb_typed('num', 'The sum of ' . $k . ' consecutive whole numbers is ' . $S . '. What is the smallest of them?', (string)$n,
                ['Call the smallest $n$. The numbers add to $' . $k . 'n + ' . $t . '$.', '$' . $k . 'n + ' . $t . ' = ' . $S . '$, so $' . $k . 'n = ' . ($S - $t) . '$ and $n = ' . $n . '$.'],
                'Write each number in terms of the smallest.', 'application', 60); },
        static function (MlbRng $r) { $k = $r->int(3, 5); $d = $r->int(3, 12); $t = ($k - 2) * $d;
            return mlb_typed('num', 'A mother is ' . $k . ' times as old as her daughter. In ' . $t . ' years’ time she will be twice as old as her daughter. How old is the daughter now?', (string)$d,
                ['Let the daughter be $d$ now; the mother is $' . $k . 'd$.', 'In ' . $t . ' years: $' . $k . 'd + ' . $t . ' = 2(d + ' . $t . ')$.', '$' . $k . 'd + ' . $t . ' = 2d + ' . (2 * $t) . '$, so $' . mlb_lterm($k - 2, 'd') . ' = ' . $t . '$ and $d = ' . $d . '$.'],
                'Both ages grow by the same number of years.', 'challenge', 90); },
        static function (MlbRng $r) { $k = $r->int(2, 9);
            return mlb_mcq($r, 'A rectangle is ' . $k . ' cm longer than it is wide. Its width is $w$ cm. Which expression is its perimeter in cm?', '$4w + ' . (2 * $k) . '$',
                [['$2w + ' . $k . '$', 'That is one length and one width; the perimeter goes all the way round.'], ['$w(w + ' . $k . ')$', 'That is the AREA: length times width.'], ['$4w + ' . $k . '$', 'There are TWO lengths, so the extra ' . $k . ' is added twice.']],
                ['Length $= w + ' . $k . '$.', 'Perimeter $= 2w + 2(w + ' . $k . ') = 4w + ' . (2 * $k) . '$.'], 'Draw it and label all four sides.', 'application', 50); },
    ],
    /* ═══ Stage 6 — Algebraic Structures ═══ */
    'MC-051' => [
        static function (MlbRng $r) { $a = $r->int(1, 9); $b = $r->int(2, 9);
            return mlb_typed('expr', 'Make $x$ the subject of $y = \\frac{x + ' . $a . '}{' . $b . '}$.', $b . 'y-' . $a,
                ['Multiply both sides by ' . $b . ': $' . $b . 'y = x + ' . $a . '$.', 'Subtract ' . $a . ': $x = ' . $b . 'y - ' . $a . '$.'], 'Undo the division, then the addition.', 'procedure', 50, ['vars' => 'x,y']); },
        static function (MlbRng $r) { $a = $r->int(2, 15); $b = $r->int(2, 9);
            return mlb_mcq($r, 'Make $x$ the subject of $y = ' . $a . ' - ' . $b . 'x$.', '$x = \\frac{' . $a . ' - y}{' . $b . '}$',
                [['$x = \\frac{y - ' . $a . '}{' . $b . '}$', 'Subtracting ' . $a . ' from both sides gives $y - ' . $a . ' = -' . $b . 'x$: the minus sign on $' . $b . 'x$ has to be dealt with too.'],
                 ['$x = \\frac{' . $a . ' + y}{' . $b . '}$', '$y$ changes sign when it moves across.'], ['$x = ' . $a . ' - \\frac{y}{' . $b . '}$', 'The ' . $a . ' must move before you divide.']],
                ['Add $' . $b . 'x$ to both sides and subtract $y$: $' . $b . 'x = ' . $a . ' - y$.', 'Divide by ' . $b . ': $x = \\frac{' . $a . ' - y}{' . $b . '}$.'], 'Get the $x$ term on its own and positive.', 'procedure', 55); },
        static function (MlbRng $r) { $a = $r->int(1, 9); $b = $r->int(1, 9);
            return mlb_typed('expr', 'Make $x$ the subject of $y = \\frac{x + ' . $a . '}{x - ' . $b . '}$.', '(' . $a . '+' . $b . 'y)/(y-1)',
                ['Multiply by $(x - ' . $b . ')$: $y(x - ' . $b . ') = x + ' . $a . '$, so $xy - ' . mlb_lterm($b, 'y') . ' = x + ' . $a . '$.',
                 'Gather the $x$ terms on one side: $xy - x = ' . $a . ' + ' . mlb_lterm($b, 'y') . '$.', 'Factorise: $x(y - 1) = ' . $a . ' + ' . mlb_lterm($b, 'y') . '$, so $x = \\frac{' . $a . ' + ' . mlb_lterm($b, 'y') . '}{y - 1}$.'],
                'When the subject appears twice, collect it on one side and factorise.', 'challenge', 100, ['vars' => 'x,y']); },
    ],
    'MC-052' => [
        static function (MlbRng $r) { $a = $r->int(2, 7); $b = $r->int(-9, 9); $c = $r->int(-10, 30); $m = $c - $b; $ans = (int)floor(($m - 1) / $a);
            return mlb_typed('num', 'What is the largest integer $x$ that satisfies $' . $a . 'x' . mlb_sterm($b) . ' < ' . $c . '$?', (string)$ans,
                [($b === 0 ? '' : 'Move the ' . abs($b) . ': ') . '$' . $a . 'x < ' . $m . '$, so $x < ' . mlb_ftex($m, $a) . '$.', 'The largest integer strictly less than $' . mlb_ftex($m, $a) . '$ is ' . $ans . ' — “less than” does not include the boundary itself.'],
                'Solve it, then think about which integers fit.', 'procedure', 55); },
        static function (MlbRng $r) { $k = $r->int(-6, 8); $s = $r->pick(['>', '<', '\\ge', '\\le']); $closed = in_array($s, ['\\ge', '\\le'], true); $right = in_array($s, ['>', '\\ge'], true);
            $txt = static fn($c, $rt) => 'A' . ($c ? ' filled' : 'n open') . ' circle at ' . $k . ', with the line going to the ' . ($rt ? 'right' : 'left');
            return mlb_mcq($r, 'How is $x ' . $s . ' ' . $k . '$ shown on a number line?', $txt($closed, $right),
                [[$txt(!$closed, $right), $closed ? 'The ' . $k . ' itself is included (“or equal to”), so the circle is filled.' : 'The ' . $k . ' itself is NOT included, so the circle is open.'],
                 [$txt($closed, !$right), 'The line points towards the numbers that work: ' . ($right ? 'bigger' : 'smaller') . ' than ' . $k . '.'], [$txt(!$closed, !$right), 'Both the circle and the direction are wrong.']],
                ['The circle is ' . ($closed ? 'filled because ' . $k . ' is included' : 'open because ' . $k . ' is not included') . '.', 'The line goes ' . ($right ? 'right, to the bigger numbers' : 'left, to the smaller numbers') . '.'],
                'Is ' . $k . ' itself part of the answer?', 'concept', 35); },
        static function (MlbRng $r) { $m = $r->int(2, 3); $b = $r->int(-5, 5); $lo = $r->int(-12, 4); $hi = $lo + $r->int(6, 20);
            $xl = (int)floor(($lo - $b) / $m) + 1; $xh = (int)floor(($hi - $b) / $m); $cnt = max(0, $xh - $xl + 1);
            return mlb_typed('num', 'How many integers $x$ satisfy $' . $lo . ' < ' . $m . 'x' . mlb_sterm($b) . ' \\le ' . $hi . '$?', (string)$cnt,
                ['Subtract ' . $b . ' from all three parts: $' . ($lo - $b) . ' < ' . $m . 'x \\le ' . ($hi - $b) . '$.', 'Divide by ' . $m . ': $' . mlb_ftex($lo - $b, $m) . ' < x \\le ' . mlb_ftex($hi - $b, $m) . '$.',
                 'The integers are ' . $xl . ' to ' . $xh . ': that is ' . $cnt . ' of them.'],
                'Do the same to all three parts, then count carefully at each end.', 'challenge', 80); },
        static function (MlbRng $r) { $a = $r->int(2, 6); $b = $r->int(1, 9); $x = $r->int(-5, 5); $c = -$a * $x + $b;
            $L = ['$-' . $a . 'x \\ge ' . ($c - $b) . '$', '$x \\le ' . $x . '$'];
            return mlb_error_of($r, 'Find the first mistake in solving $-' . $a . 'x + ' . $b . ' \\ge ' . $c . '$.', $L, [
                [1, [$L[0], '$x \\ge ' . $x . '$'], 'dividing by $-' . $a . '$, a negative number, reverses the inequality: $\\ge$ becomes $\\le$.'],
                [0, ['$-' . $a . 'x \\ge ' . ($c + $b) . '$', '$x \\le ' . mlb_ftex(-($c + $b), $a) . '$'], 'to remove $+' . $b . '$ you subtract ' . $b . ' from both sides.'],
            ]); },
    ],
    'MC-053' => [
        static function (MlbRng $r) { $y = $r->int(-4, 10); $a = $r->nz(-6, 9); $x = $y + $a;
            return mlb_typed('pair', 'Solve $x = y' . mlb_sterm($a) . '$ and $x + y = ' . ($x + $y) . '$.', [$x, $y],
                ['Substitute: $(y' . mlb_sterm($a) . ') + y = ' . ($x + $y) . '$, so $2y = ' . ($x + $y - $a) . '$ and $y = ' . $y . '$.', 'Then $x = ' . $y . mlb_sterm($a) . ' = ' . $x . '$.'],
                'Replace $x$ in the second equation.', 'procedure', 70, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $m = $r->int(2, 5); $c = $r->int(1, 9); $p = $r->int(2, 6); $s = $r->int(5, 30);
            return mlb_mcq($r, 'To solve $y = ' . $m . 'x - ' . $c . '$ and $' . $p . 'x + y = ' . $s . '$ by substitution, which equation comes next?', '$' . $p . 'x + (' . $m . 'x - ' . $c . ') = ' . $s . '$',
                [['$' . $p . '(' . $m . 'x - ' . $c . ') + y = ' . $s . '$', 'The first equation gives $y$, so it replaces $y$, not $x$.'], ['$' . $p . 'x + ' . $m . 'x = ' . $s . '$', 'The whole of $' . $m . 'x - ' . $c . '$ replaces $y$ — the $-' . $c . '$ cannot be dropped.'],
                 ['$' . $p . 'x + (' . $m . 'x + ' . $c . ') = ' . $s . '$', 'The sign of the ' . $c . ' must be kept as it is.']],
                ['$y = ' . $m . 'x - ' . $c . '$, so put $(' . $m . 'x - ' . $c . ')$ wherever $y$ appears.', 'That leaves one equation in $x$ alone.'], 'Which letter does the first equation tell you?', 'concept', 45); },
        static function (MlbRng $r) { $b = $r->int(3, 25); $k = $r->int(1, 9); $a = 2 * $b + $k;
            return mlb_typed('pair', 'Two numbers add up to ' . ($a + $b) . '. The larger is ' . $k . ' more than twice the smaller. Find the larger number $L$ and the smaller number $s$.', [$a, $b],
                ['$L + s = ' . ($a + $b) . '$ and $L = 2s + ' . $k . '$.', 'Substitute: $2s + ' . $k . ' + s = ' . ($a + $b) . '$, so $3s = ' . (3 * $b) . '$, $s = ' . $b . '$ and $L = ' . $a . '$.'],
                'Write two equations, then substitute.', 'challenge', 90, ['labels' => ['L', 's']]); },
        static function (MlbRng $r) { $A = 100 * $r->int(5, 12); $C = 100 * $r->int(2, 4); $ad = $r->int(5, 30); $ch = $r->int(5, 40); $M = $A * $ad + $C * $ch;
            return mlb_typed('pair', 'Adult tickets cost ₦' . $A . ' and child tickets ₦' . $C . '. ' . ($ad + $ch) . ' tickets were sold for ₦' . mlb_p($M) . '. How many adult tickets ($a$) and child tickets ($c$) were sold?', [$ad, $ch],
                ['$a + c = ' . ($ad + $ch) . '$ and $' . $A . 'a + ' . $C . 'c = ' . $M . '$.', 'From the first, $c = ' . ($ad + $ch) . ' - a$. Substitute: $' . ($A - $C) . 'a = ' . ($M - $C * ($ad + $ch)) . '$, so $a = ' . $ad . '$ and $c = ' . $ch . '$.'],
                'One equation counts tickets, the other counts money.', 'application', 100, ['labels' => ['a', 'c']]); },
    ],
    'MC-054' => [
        static function (MlbRng $r) { $a = $r->int(1, 5); $b = $r->int(2, 6); $c = $r->int(1, 5); $p = $r->int(5, 30); $q = $r->int(1, 20);
            return mlb_mcq($r, 'Which single step eliminates $y$ from $' . mlb_lterm($a, 'x') . ' + ' . $b . 'y = ' . $p . '$ and $' . mlb_lterm($c, 'x') . ' - ' . $b . 'y = ' . $q . '$?', 'Add the two equations',
                [['Subtract the second from the first', 'That gives $' . $b . 'y - (-' . $b . 'y) = ' . (2 * $b) . 'y$: the $y$ terms double instead of vanishing.'], ['Multiply the first by ' . $b, 'That changes the coefficients but removes nothing.'],
                 ['Divide both by ' . $b, 'That leaves $y$ in both equations.']],
                ['The $y$ terms are $+' . $b . 'y$ and $-' . $b . 'y$.', 'Adding gives $0y$: $' . mlb_lterm($a + $c, 'x') . ' = ' . ($p + $q) . '$.'], 'Opposite signs cancel when you add.', 'concept', 40); },
        static function (MlbRng $r) { $P = 50 * $r->int(2, 8); $B = 100 * $r->int(3, 12); $a = $r->int(2, 5); $b = $r->int(1, 4); $c = $r->int(1, 3); $d = $r->int(2, 5); if ($a * $d === $b * $c) $d++;
            return mlb_typed('pair', $a . ' pens and ' . $b . ' ' . ($b === 1 ? 'book' : 'books') . ' cost ₦' . mlb_p($a * $P + $b * $B) . '. ' . $c . ' ' . ($c === 1 ? 'pen' : 'pens') . ' and ' . $d . ' books cost ₦' . mlb_p($c * $P + $d * $B) . '. Find the price of one pen ($p$) and one book ($b$), in naira.', [$P, $B],
                ['$' . mlb_lterm($a, 'p') . ' + ' . mlb_lterm($b, 'b') . ' = ' . ($a * $P + $b * $B) . '$ and $' . mlb_lterm($c, 'p') . ' + ' . mlb_lterm($d, 'b') . ' = ' . ($c * $P + $d * $B) . '$.',
                 'Multiply so the $p$ coefficients match, subtract, and $b = ' . $B . '$; then $p = ' . $P . '$.'],
                'Write two equations and eliminate one letter.', 'application', 110, ['labels' => ['p', 'b']]); },
        static function (MlbRng $r) { $S = $r->int(7, 40); $D = $r->int(1, $S - 1);
            return mlb_typed('num', '$a + b = ' . $S . '$ and $a - b = ' . $D . '$. Find $a^2 - b^2$.', (string)($S * $D),
                ['You could find $a$ and $b$ — but there is a shortcut: $a^2 - b^2 = (a + b)(a - b)$.', 'So $a^2 - b^2 = ' . $S . ' \\times ' . $D . ' = ' . ($S * $D) . '$.'],
                'Is there a way without finding $a$ and $b$?', 'challenge', 60); },
    ],
    'MC-055' => [
        static function (MlbRng $r) { $m = $r->nz(-3, 4); $c = $r->int(-5, 5); $d = $c + $r->nz(-4, 4);
            if ($r->int(0, 2) === 0) { $k = $r->int(2, 4);
                return mlb_mcq($r, 'How many solutions do $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ and $' . $k . 'y = ' . mlb_lterm($k * $m, 'x') . mlb_sterm($k * $c) . '$ have together?', 'Infinitely many',
                    [['None', 'The second equation is the first multiplied by ' . $k . ': it is the SAME line.'], ['Exactly one', 'Two different lines cross once; these are not different.'], ['Exactly two', 'Two straight lines can never meet in exactly two points.']],
                    ['Divide the second by ' . $k . ': $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ — the same line.', 'Every point on it solves both, so there are infinitely many solutions.'], 'Simplify the second equation.', 'challenge', 50); }
            return mlb_mcq($r, 'How many solutions do $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ and $y = ' . mlb_lterm($m, 'x') . mlb_sterm($d) . '$ have together?', 'None',
                [['Exactly one', 'Lines with the same gradient never cross unless they are the same line.'], ['Infinitely many', 'They would need the same intercept too.'], ['Exactly two', 'Two straight lines can never meet in exactly two points.']],
                ['Both lines have gradient ' . $m . ', so they are parallel.', 'Their intercepts differ (' . $c . ' and ' . $d . '), so they never meet: no solution.'], 'Compare the gradients.', 'concept', 45); },
        static function (MlbRng $r) { $m = $r->nz(-4, 4); $x = $r->nz(-6, 6); $c = -$m * $x;
            return mlb_typed('num', 'Where does $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ cross the $x$-axis? Give the $x$-coordinate.', (string)$x,
                ['On the $x$-axis, $y = 0$: $0 = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$.', '$' . mlb_lterm($m, 'x') . ' = ' . (-$c) . '$, so $x = ' . $x . '$.'], 'What is $y$ on the $x$-axis?', 'procedure', 40); },
        static function (MlbRng $r) { $m = $r->nz(-3, 3); $x = $r->int(-5, 5); $c = $r->int(-5, 5); $y = $m * $x + $c;
            return mlb_typed('pair', 'At what point do the lines $y = ' . $y . '$ and $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ meet?', [$x, $y],
                ['At the meeting point both give the same $y$: $' . mlb_lterm($m, 'x') . mlb_sterm($c) . ' = ' . $y . '$.', 'So $x = ' . $x . '$, and the point is $(' . $x . ',\\ ' . $y . ')$.'],
                'Set the two expressions for $y$ equal.', 'procedure', 50, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $m = $r->nz(-4, 5); $c = $r->int(-6, 6); $d = $c + $r->nz(-5, 5);
            return mlb_typed('num', 'For what value of $k$ do the lines $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ and $y = kx' . mlb_sterm($d) . '$ never meet?', (string)$m,
                ['Two straight lines never meet only when they are parallel: equal gradients, different intercepts.', 'The intercepts are already different (' . $c . ' and ' . $d . '), so $k = ' . $m . '$.'],
                'When do two lines never cross?', 'challenge', 45); },
    ],
    'MC-056' => [
        static function (MlbRng $r) { $g = $r->int(2, 6); $p = $r->int(1, 4); $q = $r->int(1, 5); if ($p === $q) $q++; if (mlb_gcd($p, $q) !== 1) $q = $p + 1;
            return mlb_mcq($r, 'Factorise completely $' . ($g * $p) . 'x^2y - ' . ($g * $q) . 'xy^2$.', '$' . $g . 'xy(' . mlb_lterm($p, 'x') . ' - ' . mlb_lterm($q, 'y') . ')$',
                [['$' . $g . 'x(' . mlb_lterm($p, 'xy') . ' - ' . mlb_lterm($q, 'y^2') . ')$', 'Not completely: $y$ is also in both terms.'], ['$xy(' . ($g * $p) . 'x - ' . ($g * $q) . 'y)$', 'Not completely: ' . $g . ' also divides both numbers.'],
                 ['$' . $g . 'xy(' . mlb_lterm($p, 'x') . ' + ' . mlb_lterm($q, 'y') . ')$', 'Expanding gives $+' . ($g * $q) . 'xy^2$: the sign has changed.']],
                ['The HCF of the numbers is ' . $g . ', and both terms contain $x$ and $y$ at least once.', 'Take out $' . $g . 'xy$: $' . $g . 'xy(' . mlb_lterm($p, 'x') . ' - ' . mlb_lterm($q, 'y') . ')$. Expand to check.'],
                'Take out every common number AND letter.', 'procedure', 50); },
        static function (MlbRng $r) { $k = $r->int(2, 9); $c = $r->int(1, 9);
            return mlb_mcq($r, 'Factorise $-' . $k . 'x - ' . ($k * $c) . '$ by taking out $-' . $k . '$.', '$-' . $k . '(x + ' . $c . ')$',
                [['$-' . $k . '(x - ' . $c . ')$', '$-' . $k . ' \\times (-' . $c . ') = +' . ($k * $c) . '$, but the term is $-' . ($k * $c) . '$.'], ['$' . $k . '(x + ' . $c . ')$', 'Expanding gives $+' . $k . 'x$: the factor taken out is negative.'],
                 ['$-' . $k . '(x + ' . ($k * $c) . ')$', 'Divide ' . ($k * $c) . ' by ' . $k . ' too.']],
                ['Divide each term by $-' . $k . '$: $-' . $k . 'x \\div (-' . $k . ') = x$ and $-' . ($k * $c) . ' \\div (-' . $k . ') = +' . $c . '$.', 'So $-' . $k . '(x + ' . $c . ')$.'],
                'A negative divided by a negative is positive.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(1, 9);
            return mlb_mcq($r, 'Factorise $' . $a . '(x + ' . $b . ') + y(x + ' . $b . ')$.', '$(x + ' . $b . ')(' . $a . ' + y)$',
                [['$' . $a . 'y(x + ' . $b . ')$', 'The ' . $a . ' and the $y$ are ADDED, not multiplied.'], ['$(x + ' . $b . ')^2(' . $a . ' + y)$', 'The bracket is a common factor once, not twice.'], ['$(' . $a . ' + x)(y + ' . $b . ')$', 'The common factor is the whole bracket $(x + ' . $b . ')$.']],
                ['$(x + ' . $b . ')$ is a factor of both terms.', 'Take it out: $(x + ' . $b . ')(' . $a . ' + y)$.'], 'Treat the bracket as one thing.', 'procedure', 40); },
        static function (MlbRng $r) { $k = $r->int(13, 89); $p = $r->int(11, 89); $q = 100 - $p;
            return mlb_typed('num', 'Work out $' . $k . ' \\times ' . $p . ' + ' . $k . ' \\times ' . $q . '$ without a calculator.', (string)($k * 100),
                ['Both products share the factor ' . $k . ': $' . $k . '(' . $p . ' + ' . $q . ')$.', '$= ' . $k . ' \\times 100 = ' . mlb_n($k * 100) . '$.'], 'What do the two products have in common?', 'challenge', 40); },
    ],
    'MC-057' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $k = $r->int(2, 9); if ($k === $a) $k++;
            return mlb_mcq($r, 'Factorise $' . $a . 'x + ' . $a . 'y + ' . $k . 'x + ' . $k . 'y$.', '$(x + y)(' . $a . ' + ' . $k . ')$',
                [['$' . ($a + $k) . '(x + y)^2$', 'There is only one $(x + y)$ in each pair.'], ['$(x + ' . $a . ')(y + ' . $k . ')$', 'Expand it: it has an $xy$ term, which is not there.'], ['$' . $a . $k . '(x + y)$', 'The ' . $a . ' and the ' . $k . ' are added, not written side by side.']],
                ['Group the pairs: $' . $a . '(x + y) + ' . $k . '(x + y)$.', 'Take out $(x + y)$: $(x + y)(' . $a . ' + ' . $k . ')$, which is $' . ($a + $k) . '(x + y)$.'], 'Pair the terms with the same number.', 'procedure', 45); },
        static function (MlbRng $r) { $a = $r->int(1, 8); $b = $r->int(1, 8); if ($a === $b) $b++;
            return mlb_mcq($r, 'Factorise $x^2 - ' . mlb_lterm($a, 'x') . ' + ' . mlb_lterm($b, 'x') . ' - ' . ($a * $b) . '$.', '$(x - ' . $a . ')(x + ' . $b . ')$',
                [['$(x + ' . $a . ')(x - ' . $b . ')$', 'Expand it: the middle terms would be $+' . mlb_lterm($a, 'x') . ' - ' . mlb_lterm($b, 'x') . '$.'], ['$(x - ' . $a . ')(x - ' . $b . ')$', 'Then the last term would be $+' . ($a * $b) . '$.'],
                 ['$x(x - ' . $a . ') + ' . $b . '(x + ' . $a . ')$', 'The second pair is $' . mlb_lterm($b, 'x') . ' - ' . ($a * $b) . ' = ' . $b . '(x - ' . $a . ')$.']],
                ['Group: $x(x - ' . $a . ') + ' . $b . '(x - ' . $a . ')$.', 'Common bracket: $(x - ' . $a . ')(x + ' . $b . ')$.'], 'Watch the signs when you take a factor from the second pair.', 'procedure', 55); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9);
            $L = ['$= x(y - ' . $a . ') + ' . $b . '(y - ' . $a . ')$', '$= (x + ' . $b . ')(y - ' . $a . ')$'];
            return mlb_error_of($r, 'Find the first mistake: factorise $xy - ' . $a . 'x + ' . $b . 'y - ' . ($a * $b) . '$.', $L, [
                [0, ['$= x(y - ' . $a . ') + ' . $b . '(y + ' . $a . ')$', '$= (x + ' . $b . ')(y - ' . $a . ')$'], '$' . $b . ' \\times ' . $a . ' = ' . ($a * $b) . '$, but the term is $-' . ($a * $b) . '$, so the second bracket is $(y - ' . $a . ')$.'],
                [1, [$L[0], '$= (x - ' . $b . ')(y - ' . $a . ')$'], 'the factor outside the second bracket is $+' . $b . '$, so the new bracket is $(x + ' . $b . ')$.'],
                [1, [$L[0], '$= ' . $b . 'x(y - ' . $a . ')$'], 'it is a SUM, $x(\\dots) + ' . $b . '(\\dots)$: the common bracket times $(x + ' . $b . ')$, not times $' . $b . 'x$.'],
            ], 'challenge'); },
    ],
    'MC-058' => [
        static function (MlbRng $r) { $a = $r->int(2, 7); $b = $r->int(1, 9); if (mlb_gcd($a, $b) !== 1) $b = 1;
            return mlb_mcq($r, 'Factorise $' . ($a * $a) . 'x^2 - ' . ($b * $b) . '$.', '$(' . $a . 'x - ' . $b . ')(' . $a . 'x + ' . $b . ')$',
                [['$(' . ($a * $a) . 'x - ' . $b . ')(x + ' . $b . ')$', 'Each bracket holds a square root: $\\sqrt{' . ($a * $a) . 'x^2} = ' . $a . 'x$.'], ['$(' . $a . 'x - ' . $b . ')^2$', 'That expands with a middle term $-' . (2 * $a * $b) . 'x$.'],
                 ['$' . $a . '(x - ' . $b . ')(x + ' . $b . ')$', 'Expand it: you get $' . $a . 'x^2$, not $' . ($a * $a) . 'x^2$.']],
                ['$' . ($a * $a) . 'x^2 = (' . $a . 'x)^2$ and $' . ($b * $b) . ' = ' . $b . '^2$.', 'So $(' . $a . 'x)^2 - ' . $b . '^2 = (' . $a . 'x - ' . $b . ')(' . $a . 'x + ' . $b . ')$.'], 'Write each part as a square.', 'procedure', 45); },
        static function (MlbRng $r) { $t = 10 * $r->int(3, 9); $u = $r->nz(-4, 4); $n = $t + $u; $sg = $u < 0 ? '-' : '+'; $U = abs($u);
            return mlb_typed('num', 'Use $(a ' . $sg . ' b)^2 = a^2 ' . $sg . ' 2ab + b^2$ to work out $' . $n . '^2$ without a calculator.', (string)($n * $n),
                ['Write $' . $n . ' = ' . $t . ' ' . $sg . ' ' . $U . '$.', '$' . $t . '^2 ' . $sg . ' 2 \\times ' . $t . ' \\times ' . $U . ' + ' . $U . '^2 = ' . mlb_n($t * $t) . ' ' . $sg . ' ' . (2 * $t * $U) . ' + ' . ($U * $U) . ' = ' . mlb_n($n * $n) . '$.'],
                'Split it into a round number and a small one.', 'challenge', 60); },
    ],
    'MC-059' => [
        static function (MlbRng $r) { $a = $r->int(2, 9);
            return mlb_mcq($r, 'Simplify $\\frac{x^2 - ' . ($a * $a) . '}{x - ' . $a . '}$ (for $x \\ne ' . $a . '$).', '$x + ' . $a . '$',
                [['$x - ' . $a . '$', 'Factorise the top: $(x - ' . $a . ')(x + ' . $a . ')$; it is $(x - ' . $a . ')$ that cancels.'], ['$x^2 - ' . $a . '$', 'You can only cancel whole FACTORS, not parts of terms.'], ['$x + ' . ($a * $a) . '$', 'Factorise the top first, then cancel.']],
                ['$x^2 - ' . ($a * $a) . ' = (x - ' . $a . ')(x + ' . $a . ')$.', 'Cancel the common factor $(x - ' . $a . ')$: $x + ' . $a . '$.'], 'Factorise the top.', 'procedure', 45); },
        static function (MlbRng $r) { $p = $r->int(1, 9); $q = $r->int(2, 9); $s = $r->int(1, 9); $t = $r->int(2, 9);
            return mlb_typed('frac', 'Simplify $\\frac{' . mlb_lterm($p, 'x') . '}{' . $q . '} \\div \\frac{' . mlb_lterm($s, 'x') . '}{' . $t . '}$ (for $x \\ne 0$). Give a fraction in its lowest terms.', mlb_frac($p * $t, $q * $s),
                ['Dividing by a fraction is multiplying by its reciprocal: $\\frac{' . mlb_lterm($p, 'x') . '}{' . $q . '} \\times \\frac{' . $t . '}{' . mlb_lterm($s, 'x') . '}$.', 'The $x$ cancels: $\\frac{' . ($p * $t) . '}{' . ($q * $s) . '} = ' . mlb_ftex($p * $t, $q * $s) . '$.'],
                'Flip the second fraction and multiply.', 'procedure', 50, ['form' => 'lowest']); },
        static function (MlbRng $r) { $a = $r->int(1, 6);
            return mlb_mcq($r, 'Simplify $\\frac{1}{x - ' . $a . '} - \\frac{1}{x + ' . $a . '}$.', '$\\frac{' . (2 * $a) . '}{x^2 - ' . ($a * $a) . '}$',
                [['$\\frac{0}{x^2 - ' . ($a * $a) . '}$', '$(x + ' . $a . ') - (x - ' . $a . ') = ' . (2 * $a) . '$, not 0: the minus sign changes the sign of $-' . $a . '$.'], ['$' . mlb_ftex(1, -2 * $a) . '$', 'Fractions are not subtracted by subtracting their bottoms.'],
                 ['$\\frac{2x}{x^2 - ' . ($a * $a) . '}$', 'When the tops are subtracted the $x$ terms cancel, leaving a number.']],
                ['Common denominator: $(x - ' . $a . ')(x + ' . $a . ') = x^2 - ' . ($a * $a) . '$.', 'Top: $(x + ' . $a . ') - (x - ' . $a . ') = ' . (2 * $a) . '$, so $\\frac{' . (2 * $a) . '}{x^2 - ' . ($a * $a) . '}$.'],
                'Use the product of the denominators.', 'challenge', 75); },
        static function (MlbRng $r) { do { $a = $r->int(2, 6); $b = $r->int(2, 9); } while ($a === $b); $k = $b - $a;
            return mlb_typed('expr', 'Write $\\frac{x + 1}{' . $a . '} + \\frac{x - 1}{' . $b . '}$ as a single fraction.', '(' . ($a + $b) . 'x' . ($k < 0 ? '' : '+') . $k . ')/' . ($a * $b),
                ['A common denominator is ' . ($a * $b) . ': $\\frac{' . $b . '(x + 1) + ' . $a . '(x - 1)}{' . ($a * $b) . '}$.', 'Expand and collect: $\\frac{' . ($a + $b) . 'x' . mlb_sterm($k) . '}{' . ($a * $b) . '}$.'],
                'Each top is multiplied by the OTHER denominator.', 'procedure', 70); },
    ],
    'MC-060' => [
        static function (MlbRng $r) { $k = $r->int(2, 6); $x1 = $r->int(2, 5); $z1 = $r->int(2, 5); $x2 = $r->int(2, 9); $z2 = $r->int(2, 9);
            return mlb_typed('num', '$y$ varies jointly as $x$ and $z$. When $x = ' . $x1 . '$ and $z = ' . $z1 . '$, $y = ' . ($k * $x1 * $z1) . '$. Find $y$ when $x = ' . $x2 . '$ and $z = ' . $z2 . '$.', (string)($k * $x2 * $z2),
                ['Joint variation: $y = kxz$. $' . ($k * $x1 * $z1) . ' = k \\times ' . $x1 . ' \\times ' . $z1 . '$, so $k = ' . $k . '$.', '$y = ' . $k . ' \\times ' . $x2 . ' \\times ' . $z2 . ' = ' . ($k * $x2 * $z2) . '$.'],
                'Find $k$ first.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->int(1, 50); $b = $r->int(2, 12); $x1 = $r->int(1, 5); $x2 = $x1 + $r->int(2, 6); $x3 = $r->int(6, 20);
            return mlb_typed('num', '$y$ is partly constant and partly varies as $x$. When $x = ' . $x1 . '$, $y = ' . ($a + $b * $x1) . '$; when $x = ' . $x2 . '$, $y = ' . ($a + $b * $x2) . '$. Find $y$ when $x = ' . $x3 . '$.', (string)($a + $b * $x3),
                ['Partial variation: $y = a + bx$. Subtract the two equations: $' . ($x2 - $x1) . 'b = ' . ($b * ($x2 - $x1)) . '$, so $b = ' . $b . '$.', 'Then $a = ' . ($a + $b * $x1) . ' - ' . $b . ' \\times ' . $x1 . ' = ' . $a . '$, and $y = ' . $a . ' + ' . $b . ' \\times ' . $x3 . ' = ' . ($a + $b * $x3) . '$.'],
                'Two unknown constants need two equations.', 'challenge', 90); },
        static function (MlbRng $r) { $k = $r->int(2, 5); $x1 = $r->int(2, 5); $x2 = $r->int(3, 10); if ($x2 === $x1) $x2++;
            return mlb_typed('num', '$y$ varies directly as the square of $x$. When $x = ' . $x1 . '$, $y = ' . ($k * $x1 * $x1) . '$. Find $y$ when $x = ' . $x2 . '$.', (string)($k * $x2 * $x2),
                ['$y = kx^2$: $' . ($k * $x1 * $x1) . ' = k \\times ' . ($x1 * $x1) . '$, so $k = ' . $k . '$.', '$y = ' . $k . ' \\times ' . $x2 . '^2 = ' . ($k * $x2 * $x2) . '$.'], 'Square $x$ before you use it.', 'procedure', 50); },
        static function (MlbRng $r) { $f = $r->pick([2, 3]); $sq = $r->int(0, 1) === 1; $part = static fn($n) => [4 => 'quarter', 9 => 'ninth', 2 => 'half', 3 => 'third'][$n];
            $right = 'It becomes a ' . $part($sq ? $f * $f : $f) . ' of what it was';
            return mlb_mcq($r, '$y$ varies inversely as ' . ($sq ? 'the square of ' : '') . '$x$. If $x$ is multiplied by ' . $f . ', what happens to $y$?', $right,
                [['It is multiplied by ' . ($sq ? $f * $f : $f), 'Inverse variation: as one goes up, the other comes down.'], ['It becomes a ' . $part($sq ? $f : $f * $f) . ' of what it was', $sq ? 'It is the SQUARE of $x$ that $y$ follows: $' . $f . '^2 = ' . ($f * $f) . '$.' : 'Only $x$, not $x^2$, is involved here.'],
                 ['It stays the same', 'Changing $x$ changes $y$ — that is what variation means.']],
                ['$y = \\frac{k}{' . ($sq ? 'x^2' : 'x') . '}$. Replace $x$ by $' . $f . 'x$: $\\frac{k}{' . ($sq ? '(' . $f . 'x)^2' : $f . 'x') . '} = \\frac{1}{' . ($sq ? $f * $f : $f) . '} \\times \\frac{k}{' . ($sq ? 'x^2' : 'x') . '}$.', 'So $y$ becomes a ' . $part($sq ? $f * $f : $f) . ' of what it was.'],
                'Write the formula and replace $x$ by $' . $f . 'x$.', 'reasoning', 50); },
    ],
    /* ═══ Stage 7 — Powers, Roots and Patterns ═══ */
    'MC-061' => [
        static function (MlbRng $r) { $n = $r->int(2, 6); $e = $r->int(2, 5); $v = (-$n) ** $e;
            return mlb_typed('num', 'Work out $(-' . $n . ')^' . $e . '$.', (string)$v,
                ['$(-' . $n . ')^' . $e . '$ means ' . $e . ' factors of $-' . $n . '$ multiplied together.', ($e % 2 ? 'An odd' : 'An even') . ' number of negative factors gives a ' . ($e % 2 ? 'negative' : 'positive') . ' answer: $' . $v . '$.'],
                'Count the minus signs.', 'procedure', 35); },
        static function (MlbRng $r) { $k = $r->int(3, 9);
            return mlb_mcq($r, 'Which statement is true?', '$-' . $k . '^2 = -' . ($k * $k) . '$, but $(-' . $k . ')^2 = ' . ($k * $k) . '$',
                [['$-' . $k . '^2 = ' . ($k * $k) . '$', 'Without brackets only the ' . $k . ' is squared; the minus sign is applied afterwards.'], ['$(-' . $k . ')^2 = -' . ($k * $k) . '$', 'A negative times a negative is positive.'],
                 ['$-' . $k . '^2$ and $(-' . $k . ')^2$ are both $-' . (2 * $k) . '$', 'Squaring is multiplying a number by itself, not doubling it.']],
                ['$-' . $k . '^2 = -(' . $k . ' \\times ' . $k . ') = -' . ($k * $k) . '$.', '$(-' . $k . ')^2 = (-' . $k . ') \\times (-' . $k . ') = ' . ($k * $k) . '$.'], 'What does the power apply to?', 'concept', 40); },
        static function (MlbRng $r) { $b = $r->pick([2, 3, 4, 5]); $k = $r->int(2, $b === 2 ? 9 : ($b === 3 ? 6 : 4));
            return mlb_typed('num', '$' . mlb_n($b ** $k) . ' = ' . $b . '^k$. What is $k$?', (string)$k,
                ['Keep multiplying by ' . $b . ': $' . implode(' \\to ', array_map(static fn($i) => mlb_n($b ** $i), range(1, $k))) . '$.', 'That is ' . $k . ' factors of ' . $b . ', so $k = ' . $k . '$.'],
                'How many ' . $b . 's multiply to give ' . mlb_p($b ** $k) . '?', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->pick([2, 3, 7, 8]); $n = $r->int(20, 99); $cyc = []; $v = 1; for ($i = 1; $i <= 4; $i++) { $v = ($v * $a) % 10; $cyc[] = $v; } $ld = $cyc[($n - 1) % 4];
            return mlb_typed('num', 'What is the last digit of $' . $a . '^{' . $n . '}$?', (string)$ld,
                ['Only last digits matter. The last digits of $' . $a . '^1, ' . $a . '^2, ' . $a . '^3, ' . $a . '^4$ are ' . implode(', ', $cyc) . ', and then they repeat every 4.',
                 '$' . $n . ' = 4 \\times ' . intdiv($n - 1, 4) . ' + ' . (($n - 1) % 4 + 1) . '$, so the last digit is the same as for $' . $a . '^{' . (($n - 1) % 4 + 1) . '}$: ' . $ld . '.'],
                'Look for a repeating pattern in the last digits.', 'challenge', 75); },
    ],
    'MC-062' => [
        static function (MlbRng $r) { $k = $r->int(2, 9);
            if ($r->int(0, 1) === 1) { $m = $r->int(2, 12); if ($m === $k) $m++;
                return mlb_typed('frac', 'Work out $\\sqrt{\\frac{' . ($k * $k) . '}{' . ($m * $m) . '}}$.', mlb_frac($k, $m),
                    ['The square root of a fraction is the root of the top over the root of the bottom.', '$\\frac{\\sqrt{' . ($k * $k) . '}}{\\sqrt{' . ($m * $m) . '}} = \\frac{' . $k . '}{' . $m . '}' . (mlb_gcd($k, $m) > 1 ? ' = ' . mlb_ftex($k, $m) : '') . '$.'],
                    'Root the top and the bottom separately.', 'procedure', 35); }
            return mlb_typed('num', 'Work out $\\sqrt{' . mlb_dec($k * $k / 100) . '}$.', mlb_dec($k / 10),
                ['$' . mlb_dec($k * $k / 100) . ' = \\frac{' . ($k * $k) . '}{100}$.', '$\\sqrt{' . ($k * $k) . '} = ' . $k . '$ and $\\sqrt{100} = 10$, so the answer is $' . mlb_dec($k / 10) . '$.'], 'Write the decimal as a fraction over 100.', 'procedure', 35); },
        static function (MlbRng $r) { $k = $r->int(4, 15); $N = $k * $k + $r->int(1, 2 * $k);
            return mlb_mcq($r, 'Between which two whole numbers does $\\sqrt{' . $N . '}$ lie?', $k . ' and ' . ($k + 1),
                [[($k - 1) . ' and ' . $k, '$' . $k . '^2 = ' . ($k * $k) . '$ is already less than ' . $N . '.'], [($k + 1) . ' and ' . ($k + 2), '$' . ($k + 1) . '^2 = ' . (($k + 1) ** 2) . '$ is more than ' . $N . '.'], [intdiv($N, 2) . ' and ' . (intdiv($N, 2) + 1), 'A square root is not half the number.']],
                ['$' . $k . '^2 = ' . ($k * $k) . '$ and $' . ($k + 1) . '^2 = ' . (($k + 1) ** 2) . '$.', $N . ' is between them, so $\\sqrt{' . $N . '}$ is between ' . $k . ' and ' . ($k + 1) . '.'],
                'Which square numbers are either side of ' . $N . '?', 'concept', 35); },
        static function (MlbRng $r) { $p = $r->pick([2, 3]); $q = $r->pick([5, 7]); $a = $r->int(1, 3); $n = ($p ** $a) * $q;
            return mlb_typed('num', 'Given that $' . mlb_n($n * $n) . ' = ' . $p . '^{' . (2 * $a) . '} \\times ' . $q . '^2$, work out $\\sqrt{' . mlb_n($n * $n) . '}$.', (string)$n,
                ['A square root halves every index: $\\sqrt{' . $p . '^{' . (2 * $a) . '} \\times ' . $q . '^2} = ' . $p . '^{' . $a . '} \\times ' . $q . '$.', '$= ' . ($p ** $a) . ' \\times ' . $q . ' = ' . $n . '$.'],
                'Halve each power.', 'procedure', 45); },
        static function (MlbRng $r) { $n = $r->int(2, 6); $m = $r->int(3, 15);
            return mlb_typed('num', 'Work out $\\sqrt[3]{-' . ($n ** 3) . '} + \\sqrt{' . ($m * $m) . '}$.', (string)($m - $n),
                ['A cube root of a negative number is negative: $(-' . $n . ')^3 = -' . ($n ** 3) . '$, so $\\sqrt[3]{-' . ($n ** 3) . '} = -' . $n . '$.', '$\\sqrt{' . ($m * $m) . '} = ' . $m . '$, so the total is $-' . $n . ' + ' . $m . ' = ' . ($m - $n) . '$.'],
                'Can a cube root be negative?', 'challenge', 50); },
    ],
    'MC-063' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 'a', 'x', 'y']); $p = $r->int(2, 7); $q = $r->int(2, 6);
            return mlb_typed('num', 'Write $(' . $b . '^{' . $p . '})^{' . $q . '}$ as a single power $' . $b . '^k$. What is $k$?', (string)($p * $q),
                ['$(' . $b . '^{' . $p . '})^{' . $q . '}$ is ' . $q . ' lots of $' . $b . '^{' . $p . '}$ multiplied together.', 'Add ' . $p . ' to itself ' . $q . ' times: $' . $p . ' \\times ' . $q . ' = ' . ($p * $q) . '$.'],
                'A power of a power: multiply the indices.', 'procedure', 30); },
        static function (MlbRng $r) { $c = $r->int(3, 5); $p = $r->int(3, 6); $q = $r->int(2, 3);
            return mlb_mcq($r, 'Simplify $(' . $c . 'x^{' . $p . '})^{' . $q . '}$.', '$' . ($c ** $q) . 'x^{' . ($p * $q) . '}$',
                [['$' . $c . 'x^{' . ($p * $q) . '}$', 'The ' . $c . ' is inside the bracket, so it is raised to the power ' . $q . ' too.'], ['$' . ($c ** $q) . 'x^{' . ($p + $q) . '}$', 'A power of a power MULTIPLIES the indices.'],
                 ['$' . ($c * $q) . 'x^{' . ($p * $q) . '}$', '$' . $c . '^{' . $q . '}$ means ' . $q . ' factors of ' . $c . ', not ' . $c . ' times ' . $q . '.']],
                ['Everything inside the bracket gets the power ' . $q . ': $' . $c . '^{' . $q . '} = ' . ($c ** $q) . '$.', '$(x^{' . $p . '})^{' . $q . '} = x^{' . ($p * $q) . '}$.'], 'Each factor in the bracket gets the power.', 'procedure', 45); },
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5]); $q = $r->int(3, 12); $d = $r->int(1, $b === 2 ? 6 : 3); $p = $q + $d;
            return mlb_typed('num', 'Work out $\\frac{' . $b . '^{' . $p . '}}{' . $b . '^{' . $q . '}}$ without a calculator.', (string)($b ** $d),
                ['Dividing powers of the same base: subtract the indices, $' . $p . ' - ' . $q . ' = ' . $d . '$.', '$' . $b . '^{' . $d . '} = ' . ($b ** $d) . '$.'], 'You never need to work out $' . $b . '^{' . $p . '}$.', 'procedure', 35); },
        static function (MlbRng $r) { do { $b = $r->pick([2, 3, 5]); $x = $r->int(1, 4); $m = $r->int(1, 3); $c = $r->int(-2, 2); $e = $m * $x + $c; } while ($e < 1 || $b ** $e > 100000);
            return mlb_typed('num', 'Solve $' . $b . '^{' . mlb_lterm($m, 'x') . mlb_sterm($c) . '} = ' . mlb_n($b ** $e) . '$.', (string)$x,
                ['Write ' . mlb_p($b ** $e) . ' as a power of ' . $b . ': $' . mlb_n($b ** $e) . ' = ' . $b . '^{' . $e . '}$.', 'Equal powers of the same base have equal indices: $' . mlb_lterm($m, 'x') . mlb_sterm($c) . ' = ' . $e . '$, so $x = ' . $x . '$.'],
                'Make both sides powers of ' . $b . '.', 'challenge', 60); },
    ],
    'MC-064' => [
        static function (MlbRng $r) { do { $a = $r->int(2, 5); $b = $r->int(2, 7); } while (mlb_gcd($a, $b) !== 1); $k = $r->int(1, 3);
            return mlb_typed('frac', 'Work out $\\left(\\frac{' . $a . '}{' . $b . '}\\right)^{-' . $k . '}$ as a fraction.', mlb_frac($b ** $k, $a ** $k),
                ['A negative index flips the fraction: $\\left(\\frac{' . $b . '}{' . $a . '}\\right)^{' . $k . '}$.', '$= \\frac{' . ($b ** $k) . '}{' . ($a ** $k) . '}$.'], 'Negative index → reciprocal.', 'procedure', 40); },
        static function (MlbRng $r) { $root = $r->pick([2, 3]); $base = $r->int(2, $root === 2 ? 9 : 5); $p = $r->pick($root === 2 ? [1, 3] : [1, 2]); $N = $base ** $root;
            return mlb_typed('frac', 'Work out $' . $N . '^{-\\frac{' . $p . '}{' . $root . '}}$ as a fraction.', '1/' . ($base ** $p),
                ['The minus sign means one over: $\\frac{1}{' . $N . '^{\\frac{' . $p . '}{' . $root . '}}}$.', '$\\sqrt' . ($root === 3 ? '[3]' : '') . '{' . $N . '} = ' . $base . '$, then $' . $base . '^{' . $p . '} = ' . ($base ** $p) . '$, so the answer is $\\frac{1}{' . ($base ** $p) . '}$.'],
                'Three steps: flip, root, power.', 'procedure', 55); },
        static function (MlbRng $r) { [$m, $n] = $r->pick([[3, 2], [2, 3], [5, 2], [3, 4], [4, 3]]); $rt = static fn($k) => $k === 2 ? '\\sqrt{x}' : '\\sqrt[' . $k . ']{x}';
            return mlb_mcq($r, 'Which of these is equal to $x^{\\frac{' . $m . '}{' . $n . '}}$?', '$(' . $rt($n) . ')^' . $m . '$',
                [['$(' . $rt($m) . ')^' . $n . '$', 'The BOTTOM of the index is the root and the top is the power.'], ['$\\frac{' . $m . 'x}{' . $n . '}$', 'An index is not a multiplier.'], ['$x^{-\\frac{' . $n . '}{' . $m . '}}$', 'A fractional index is not flipped or made negative.']],
                ['The denominator ' . $n . ' is the root; the numerator ' . $m . ' is the power.', 'So $x^{\\frac{' . $m . '}{' . $n . '}} = (' . $rt($n) . ')^' . $m . '$.'], 'Bottom = root, top = power.', 'concept', 40); },
        static function (MlbRng $r) { [$A, $a, $base] = $r->pick([[4, 2, 2], [8, 3, 2], [9, 2, 3], [27, 3, 3], [16, 4, 2]]); $b = $r->int(1, 5); if ($b % $a === 0) $b++;
            return mlb_typed('frac', 'Solve $' . $A . '^x = \\frac{1}{' . ($base ** $b) . '}$. Give $x$ as a fraction.', mlb_frac(-$b, $a),
                ['Write both sides as powers of ' . $base . ': $' . $A . ' = ' . $base . '^{' . $a . '}$ and $\\frac{1}{' . ($base ** $b) . '} = ' . $base . '^{-' . $b . '}$.',
                 'So $' . $base . '^{' . $a . 'x} = ' . $base . '^{-' . $b . '}$: $' . $a . 'x = -' . $b . '$ and $x = ' . mlb_ftex(-$b, $a) . '$.'],
                'Use the same base on both sides.', 'challenge', 75); },
    ],
    'MC-065' => [
        static function (MlbRng $r) { $m = $r->int(11, 99) / 10; $e = $r->int(3, 9); $x = (int)round($m * 10 ** $e);
            return mlb_typed('num', 'Written in standard form, ' . mlb_p($x) . ' is $' . mlb_dec($m) . ' \\times 10^k$. What is $k$?', (string)$e,
                ['Put the point just after the first digit: ' . mlb_dec($m) . '.', 'The point moves ' . $e . ' places, so $k = ' . $e . '$.'], 'Count how many places the point moves.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); $p = $r->int(2, 8); $q = $r->int(-4, 8); $prod = $a * $b; $over = $prod >= 10; $m = $over ? $prod / 10 : $prod; $e = $p + $q + ($over ? 1 : 0);
            return mlb_mcq($r, 'Work out $(' . $a . ' \\times 10^{' . $p . '}) \\times (' . $b . ' \\times 10^{' . $q . '})$ in standard form.', '$' . mlb_dec($m) . ' \\times 10^{' . $e . '}$',
                [['$' . $prod . ' \\times 10^{' . ($p + $q) . '}$', 'Not standard form: the first part must be less than 10.'], ['$' . mlb_dec($m) . ' \\times 10^{' . ($p * $q) . '}$', 'Multiply the numbers, but ADD the powers of 10.'],
                 ['$' . mlb_dec(($a + $b) >= 10 ? ($a + $b) / 10 : $a + $b) . ' \\times 10^{' . ($p + $q) . '}$', 'The numbers are multiplied, not added.']],
                ['Multiply the numbers: $' . $a . ' \\times ' . $b . ' = ' . $prod . '$; add the powers: $10^{' . ($p + $q) . '}$.', $over ? '$' . $prod . ' \\times 10^{' . ($p + $q) . '} = ' . mlb_dec($m) . ' \\times 10^{' . $e . '}$.' : 'So $' . $m . ' \\times 10^{' . $e . '}$.'],
                'Numbers multiply, powers add.', 'procedure', 55); },
        static function (MlbRng $r) { $m = $r->int(11, 99) / 10; $e = -$r->int(1, 5);
            return mlb_typed('num', 'Write $' . mlb_dec($m) . ' \\times 10^{' . $e . '}$ as an ordinary number.', mlb_dec($m * 10 ** $e),
                ['A power of $' . $e . '$ moves the point ' . (-$e) . ' ' . ($e === -1 ? 'place' : 'places') . ' to the LEFT.', 'So the number is $' . mlb_dec($m * 10 ** $e) . '$.'], 'A negative power makes a small number.', 'procedure', 35); },
        static function (MlbRng $r) { $b = $r->pick([2, 4, 5, 8]); do { $a = $r->int(1, 9); } while ($a === $b); $p = $r->int(3, 9); $q = $r->int(-3, 4);
            $m = $a / $b; $e = $p - $q; if ($m < 1) { $m *= 10; $e--; }
            return mlb_mcq($r, 'Work out $\\frac{' . $a . ' \\times 10^{' . $p . '}}{' . $b . ' \\times 10^{' . $q . '}}$ in standard form.', '$' . mlb_dec($m) . ' \\times 10^{' . $e . '}$',
                [['$' . mlb_dec($a / $b) . ' \\times 10^{' . ($p - $q) . '}$', 'Not standard form: the first part must be at least 1.'], ['$' . mlb_dec($m) . ' \\times 10^{' . ($p + $q) . '}$', 'Dividing powers of 10 SUBTRACTS the indices.'],
                 ['$' . mlb_dec($m) . ' \\times 10^{' . ($e + 1) . '}$', 'Making the first part bigger means the power must go DOWN to make up for it.']],
                ['Divide the numbers: $' . $a . ' \\div ' . $b . ' = ' . mlb_dec($a / $b) . '$; subtract the powers: $10^{' . $p . ' - (' . $q . ')} = 10^{' . ($p - $q) . '}$.', 'In standard form: $' . mlb_dec($m) . ' \\times 10^{' . $e . '}$.'],
                'Numbers divide, powers subtract.', 'challenge', 70); },
    ],
    'MC-066' => [
        static function (MlbRng $r) { $s = $r->pick([2, 3, 5, 6, 7]); $k = $r->int(1, 5); $m = $r->int(1, 4); $P = $k * $k * $s * $m * $m * $s;
            return mlb_typed('num', 'Work out $\\sqrt{' . ($k * $k * $s) . '} \\times \\sqrt{' . ($m * $m * $s) . '}$.', (string)($k * $m * $s),
                ['$\\sqrt{a} \\times \\sqrt{b} = \\sqrt{ab}$, so this is $\\sqrt{' . $P . '}$.', '$' . $P . ' = ' . ($k * $m * $s) . '^2$, so the answer is ' . ($k * $m * $s) . '.'], 'Multiply under one root.', 'procedure', 40); },
        static function (MlbRng $r) { $n = $r->pick([2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15]); $sq = $r->int(2, 9); $c = $r->int(2, 4);
            return mlb_mcq($r, 'Which of these is a surd (a root that is irrational)?', '$\\sqrt{' . $n . '}$',
                [['$\\sqrt{' . ($sq * $sq) . '}$', '$\\sqrt{' . ($sq * $sq) . '} = ' . $sq . '$, a whole number.'], ['$\\sqrt{\\frac{' . ($c * $c) . '}{' . (($c + 1) ** 2) . '}}$', 'That is $\\frac{' . $c . '}{' . ($c + 1) . '}$, a fraction — rational.'], ['$\\sqrt[3]{' . ($c ** 3) . '}$', 'That is exactly ' . $c . '.']],
                ['A surd is a root that cannot be written exactly as a whole number or a fraction.', $n . ' is not a perfect square, so $\\sqrt{' . $n . '}$ is a surd; each of the others comes out exactly.'],
                'Which root does NOT come out exactly?', 'concept', 35); },
        static function (MlbRng $r) { $k = $r->int(2, 9); $s = $r->pick([2, 3, 5, 7]);
            return mlb_typed('num', 'Work out $(' . $k . '\\sqrt{' . $s . '})^2$.', (string)($k * $k * $s),
                ['Square both parts: $' . $k . '^2 \\times (\\sqrt{' . $s . '})^2$.', '$= ' . ($k * $k) . ' \\times ' . $s . ' = ' . ($k * $k * $s) . '$.'], '$(\\sqrt{' . $s . '})^2 = ' . $s . '$.', 'procedure', 35); },
        static function (MlbRng $r) { do { $a = $r->int(2, 6); $b = $r->pick([2, 3, 5, 6, 7]); $c = $r->int(2, 6); $d = $r->pick([2, 3, 5, 6, 7, 10, 11]); } while ($a * $a * $b === $c * $c * $d || $b === $d);
            $A = $a * $a * $b; $C = $c * $c * $d; $p = '$' . $a . '\\sqrt{' . $b . '}$'; $q = '$' . $c . '\\sqrt{' . $d . '}$'; [$big, $small] = $A > $C ? [$p, $q] : [$q, $p];
            return mlb_mcq($r, 'Which is larger: $' . $a . '\\sqrt{' . $b . '}$ or $' . $c . '\\sqrt{' . $d . '}$?', $big,
                [[$small, 'Compare their squares: ' . $A . ' and ' . $C . '.'], ['They are equal', 'Their squares are ' . $A . ' and ' . $C . ', which differ.'], ['It cannot be decided without a calculator', 'Squaring both decides it exactly.']],
                ['Square each: $(' . $a . '\\sqrt{' . $b . '})^2 = ' . $A . '$ and $(' . $c . '\\sqrt{' . $d . '})^2 = ' . $C . '$.', 'Both are positive, so the one with the larger square is larger: ' . $big . '.'],
                'Square both.', 'challenge', 55); },
    ],
    'MC-067' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->pick([2, 3, 5, 6, 7, 10, 11]);
            return mlb_typed('num', 'Work out $(' . $a . ' + \\sqrt{' . $b . '})(' . $a . ' - \\sqrt{' . $b . '})$.', (string)($a * $a - $b),
                ['This is $(p + q)(p - q) = p^2 - q^2$.', '$' . $a . '^2 - (\\sqrt{' . $b . '})^2 = ' . ($a * $a) . ' - ' . $b . ' = ' . ($a * $a - $b) . '$.'], 'Difference of two squares.', 'procedure', 45); },
        static function (MlbRng $r) { do { $a = $r->pick([3, 5, 6, 7, 10, 11]); $b = $r->pick([2, 3, 5, 6, 7]); } while ($a <= $b); $d = $a - $b; $c = $r->int(1, 3); $k = $d * $c; $cs = $c === 1 ? '' : (string)$c;
            return mlb_mcq($r, 'Rationalise the denominator of $\\frac{' . $k . '}{\\sqrt{' . $a . '} + \\sqrt{' . $b . '}}$.', '$' . ($c === 1 ? '\\sqrt{' . $a . '} - \\sqrt{' . $b . '}' : $cs . '(\\sqrt{' . $a . '} - \\sqrt{' . $b . '})') . '$',
                [['$' . ($c === 1 ? '\\sqrt{' . $a . '} + \\sqrt{' . $b . '}' : $cs . '(\\sqrt{' . $a . '} + \\sqrt{' . $b . '})') . '$', 'Multiply by the conjugate, which has the OPPOSITE sign.'],
                 ['$\\frac{' . $k . '(\\sqrt{' . $a . '} - \\sqrt{' . $b . '})}{' . ($a + $b) . '}$', '$(\\sqrt{' . $a . '} + \\sqrt{' . $b . '})(\\sqrt{' . $a . '} - \\sqrt{' . $b . '}) = ' . $a . ' - ' . $b . '$, not $' . $a . ' + ' . $b . '$.'],
                 ['$\\frac{' . $k . '}{\\sqrt{' . ($a + $b) . '}}$', 'Roots do not add: $\\sqrt{' . $a . '} + \\sqrt{' . $b . '} \\ne \\sqrt{' . ($a + $b) . '}$.']],
                ['Multiply top and bottom by $\\sqrt{' . $a . '} - \\sqrt{' . $b . '}$. The bottom becomes $' . $a . ' - ' . $b . ' = ' . $d . '$.', '$\\frac{' . $k . '(\\sqrt{' . $a . '} - \\sqrt{' . $b . '})}{' . $d . '}$' . ($d === 1 ? '' : ' $= ' . ($c === 1 ? '\\sqrt{' . $a . '} - \\sqrt{' . $b . '}' : $cs . '(\\sqrt{' . $a . '} - \\sqrt{' . $b . '})') . '$') . '.'],
                'Multiply by the conjugate.', 'challenge', 80); },
    ],
    'MC-068' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5, 10]); $k = $r->int(1, $b === 2 ? 6 : 3);
            return mlb_typed('num', 'Work out $\\log_{' . $b . '} \\frac{1}{' . mlb_n($b ** $k) . '}$.', (string)(-$k),
                ['$\\frac{1}{' . mlb_n($b ** $k) . '} = ' . $b . '^{-' . $k . '}$.', 'So the power of ' . $b . ' that gives it is $-' . $k . '$.'], 'Write the fraction as a power of ' . $b . '.', 'procedure', 40); },
        static function (MlbRng $r) { $b = $r->int(2, 12);
            if ($r->int(0, 1) === 1) return mlb_mcq($r, 'What is $\\log_{' . $b . '} 1$?', '0',
                [['1', '$\\log_{' . $b . '} ' . $b . ' = 1$; for 1, ask what power of ' . $b . ' gives 1.'], [(string)$b, 'The log is the POWER, not the base.'], ['It has no value', 'It does: $' . $b . '^0 = 1$.']],
                ['$\\log_{' . $b . '} 1$ asks: ' . $b . ' to what power is 1?', '$' . $b . '^0 = 1$, so the answer is 0.'], 'Any non-zero number to the power 0 is 1.', 'concept', 30);
            return mlb_mcq($r, 'What is $\\log_{' . $b . '} ' . $b . '$?', '1',
                [['0', '$' . $b . '^0 = 1$, not ' . $b . '.'], [(string)$b, 'The log is the POWER, not the number.'], ['$\\frac{1}{' . $b . '}$', 'A logarithm is an index, not a reciprocal.']],
                ['$\\log_{' . $b . '} ' . $b . '$ asks: ' . $b . ' to what power is ' . $b . '?', '$' . $b . '^1 = ' . $b . '$, so the answer is 1.'], 'What power leaves a number unchanged?', 'concept', 30); },
        static function (MlbRng $r) { $b = $r->pick([2, 3, 4, 5, 10]); $e = $r->int(2, 4); $N = $b ** $e;
            return mlb_mcq($r, 'Write $' . $b . '^' . $e . ' = ' . mlb_n($N) . '$ in logarithm form.', '$\\log_{' . $b . '} ' . mlb_n($N) . ' = ' . $e . '$',
                [['$\\log_{' . $e . '} ' . mlb_n($N) . ' = ' . $b . '$', 'The BASE of the power is the base of the log.'], ['$\\log_{' . mlb_n($N) . '} ' . $b . ' = ' . $e . '$', 'It is the log of the RESULT, not of the base.'], ['$\\log_{' . $b . '} ' . $e . ' = ' . mlb_n($N) . '$', 'The log gives the power, so it equals ' . $e . '.']],
                ['$b^e = N$ means $\\log_b N = e$.', 'So $\\log_{' . $b . '} ' . mlb_n($N) . ' = ' . $e . '$.'], 'A log answers: “what power?”', 'concept', 35); },
        static function (MlbRng $r) { [$p, $base] = $r->pick([[2, 2], [2, 3], [3, 2], [2, 5]]); $q = $r->int(1, 7); if ($q % $p === 0) $q++;
            return mlb_typed('frac', 'Work out $\\log_{' . ($base ** $p) . '} ' . mlb_n($base ** $q) . '$ as a fraction.', mlb_frac($q, $p),
                ['Write both as powers of ' . $base . ': $' . ($base ** $p) . ' = ' . $base . '^{' . $p . '}$ and $' . mlb_n($base ** $q) . ' = ' . $base . '^{' . $q . '}$.', '$(' . $base . '^{' . $p . '})^x = ' . $base . '^{' . $q . '}$ needs $' . $p . 'x = ' . $q . '$, so $x = ' . mlb_ftex($q, $p) . '$.'],
                'Use a common base.', 'challenge', 75); },
    ],
    'MC-069' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5]); $q = $r->int(1, 3); $d = $r->int(1, 3); $p = $q + $d; $k = $r->int(1, 3);
            return mlb_typed('num', 'Work out $\\log_{' . $b . '} ' . mlb_n($k * $b ** $p) . ' - \\log_{' . $b . '} ' . mlb_n($k * $b ** $q) . '$ without a calculator.', (string)$d,
                ['Subtracting logs divides inside: $\\log_{' . $b . '} \\frac{' . mlb_n($k * $b ** $p) . '}{' . mlb_n($k * $b ** $q) . '} = \\log_{' . $b . '} ' . ($b ** $d) . '$.', '$' . $b . '^' . $d . ' = ' . ($b ** $d) . '$, so the answer is ' . $d . '.'],
                'Combine them into one log first.', 'procedure', 45); },
        static function (MlbRng $r) { [$p, $q] = $r->pick([[2, 3], [2, 5], [3, 5], [2, 7], [3, 4]]); $N = $p * $q;
            return mlb_mcq($r, 'Which is equal to $\\log ' . $N . '$?', '$\\log ' . $p . ' + \\log ' . $q . '$',
                [['$\\log ' . $p . ' \\times \\log ' . $q . '$', 'The log of a product is a SUM of logs, not a product.'], ['$\\log ' . ($p + $q) . '$', '$\\log p + \\log q = \\log(pq)$, not $\\log(p + q)$.'],
                 ['$\\log ' . $p . ' + \\log ' . ($N - $p) . '$', 'That is $\\log(' . $p . ' \\times ' . ($N - $p) . ') = \\log ' . ($p * ($N - $p)) . '$.']],
                ['$' . $N . ' = ' . $p . ' \\times ' . $q . '$.', '$\\log(xy) = \\log x + \\log y$, so $\\log ' . $N . ' = \\log ' . $p . ' + \\log ' . $q . '$.'], 'Write ' . $N . ' as a product.', 'concept', 40); },
        static function (MlbRng $r) { $a = $r->int(1, 3); $b = $a + $r->int(1, 3); $x = 2 ** $a; $k = 2 ** $b - 2 ** $a; $m = $a + $b;
            return mlb_typed('num', 'Solve $\\log_2 x + \\log_2 (x + ' . $k . ') = ' . $m . '$.', (string)$x,
                ['Combine: $\\log_2 x(x + ' . $k . ') = ' . $m . '$, so $x(x + ' . $k . ') = 2^{' . $m . '} = ' . (2 ** $m) . '$.', '$x^2 + ' . $k . 'x - ' . (2 ** $m) . ' = 0$ factorises as $(x - ' . $x . ')(x + ' . (2 ** $b) . ') = 0$.',
                 '$x = -' . (2 ** $b) . '$ is rejected — the log of a negative number does not exist — so $x = ' . $x . '$.'],
                'Combine the logs, solve the quadratic, then check each root.', 'challenge', 120); },
    ],
    'MC-070' => [
        static function (MlbRng $r) { $a = $r->int(1, 5); $q = $r->pick([2, 3]); $n = $r->int(4, 8); $S = intdiv($a * ($q ** $n - 1), $q - 1);
            return mlb_typed('num', 'Find the sum of the first ' . $n . ' terms of the geometric progression $' . $a . ',\\ ' . ($a * $q) . ',\\ ' . ($a * $q * $q) . ',\\ \\dots$', (string)$S,
                ['$S_n = \\frac{a(r^n - 1)}{r - 1}$ with $a = ' . $a . '$ and $r = ' . $q . '$.', '$S_{' . $n . '} = \\frac{' . $a . '(' . $q . '^{' . $n . '} - 1)}{' . ($q - 1) . '} = \\frac{' . $a . ' \\times ' . ($q ** $n - 1) . '}{' . ($q - 1) . '} = ' . mlb_n($S) . '$.'],
                'Use the GP sum formula.', 'procedure', 55); },
        static function (MlbRng $r) { $a = $r->int(-10, 20); $d = $r->nz(-5, 8); $p = $r->int(2, 6); $q = $p + $r->int(3, 10); $n = $r->int(15, 40); $D = $d < 0 ? '(' . $d . ')' : (string)$d;
            return mlb_typed('num', 'In an arithmetic progression the ' . mlb_ord($p) . ' term is ' . ($a + ($p - 1) * $d) . ' and the ' . mlb_ord($q) . ' term is ' . ($a + ($q - 1) * $d) . '. Find the ' . mlb_ord($n) . ' term.', (string)($a + ($n - 1) * $d),
                ['From the ' . mlb_ord($p) . ' term to the ' . mlb_ord($q) . ' is ' . ($q - $p) . ' steps: $' . ($q - $p) . 'd = ' . (($q - $p) * $d) . '$, so $d = ' . $d . '$.',
                 'The first term: $a = ' . ($a + ($p - 1) * $d) . ' - ' . ($p - 1) . ' \\times ' . $D . ' = ' . $a . '$.', '$T_{' . $n . '} = ' . $a . ' + ' . ($n - 1) . ' \\times ' . $D . ' = ' . ($a + ($n - 1) * $d) . '$.'],
                'Two terms give you $d$ first.', 'challenge', 90); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $q = $r->pick([2, 3]); $n = $r->int(5, $q === 2 ? 10 : 7); $N = $a * $q ** ($n - 1);
            return mlb_typed('num', 'Which term of the geometric progression $' . $a . ',\\ ' . ($a * $q) . ',\\ ' . ($a * $q * $q) . ',\\ \\dots$ is ' . mlb_p($N) . '?', (string)$n,
                ['$ar^{n-1} = ' . mlb_n($N) . '$, so $' . $q . '^{n-1} = ' . mlb_n(intdiv($N, $a)) . '$.', '$' . mlb_n(intdiv($N, $a)) . ' = ' . $q . '^{' . ($n - 1) . '}$, so $n - 1 = ' . ($n - 1) . '$ and $n = ' . $n . '$.'],
                'Divide by the first term, then find the power.', 'procedure', 50); },
    ],
    ];
}

/**
 * Proofs for the Stage 5–7 topics that rest on a result (the owner's “only necessary”): a
 * pattern’s nth term, why a negative multiplier reverses an inequality, what a crossing point
 * of two graphs is, adding fractions, the root of a product, and what a logarithm undoes.
 * Same shape and rules as mathslab-why.php.
 */
function mlb_why_deep(): array {
    return [
    'MC-041' => ['A pattern that adds the same amount each time is a start plus repeated steps.', 'A pattern that starts at $a$ and adds $d$ each time has $n$th term $a + (n - 1)d$.', [
        ['The 1st term is $a$.', 'That is where the pattern starts.'],
        ['The 2nd term is $a + d$.', 'Each step adds $d$.'],
        ['From the 1st term to the $n$th there are $n - 1$ steps.', 'Counting from term 1 to term $n$ passes $n - 1$ gaps.'],
        ['So the $n$th term is $a + (n - 1)d$.', 'Each of the $n - 1$ steps adds $d$.'],
    ]],
    'MC-052' => ['Multiplying by a negative number turns the number line round.', 'If $a < b$ and $c < 0$, then $ac > bc$.', [
        ['$b - a$ is positive.', 'That is what $a < b$ means.'],
        ['$-c$ is positive.', 'The negative of a negative number is positive.'],
        ['$(b - a)(-c)$ is positive.', 'A positive number times a positive number is positive.'],
        ['$(b - a)(-c) = ac - bc$, so $ac - bc$ is positive.', 'Expanding the brackets.'],
        ['So $ac > bc$: the inequality has reversed.', 'A difference is positive exactly when the first number is the larger.'],
    ]],
    'MC-055' => ['A graph is a picture of every solution of its equation.', 'Where two lines cross, the coordinates solve both equations.', [
        ['Every point on the first line satisfies the first equation.', 'A line is drawn by plotting exactly the solutions of its equation.'],
        ['Every point on the second line satisfies the second equation.', 'The same is true of the second line.'],
        ['The crossing point lies on both lines.', 'That is what crossing means.'],
        ['So its coordinates satisfy both equations at once.', 'It belongs to both sets of solutions.'],
    ]],
    'MC-059' => ['Fractions add once they count parts of the same size.', '$\\frac{a}{b} + \\frac{c}{d} = \\frac{ad + bc}{bd}$ ($b, d \\ne 0$).', [
        ['$\\frac{a}{b} = \\frac{ad}{bd}$.', 'Multiplying top and bottom by $d$ is multiplying by 1.'],
        ['$\\frac{c}{d} = \\frac{bc}{bd}$.', 'Multiplying top and bottom by $b$ is multiplying by 1 as well.'],
        ['Both now count parts of size $\\frac{1}{bd}$.', 'They have the same denominator.'],
        ['So the sum is $\\frac{ad + bc}{bd}$.', 'Parts of the same size are added by adding how many there are.'],
    ]],
    'MC-066' => ['The root of a product is the product of the roots.', '$\\sqrt{ab} = \\sqrt{a}\\sqrt{b}$ for $a, b \\ge 0$.', [
        ['$(\\sqrt{a}\\sqrt{b})^2 = (\\sqrt{a})^2(\\sqrt{b})^2$.', 'Factors may be multiplied in any order.'],
        ['$(\\sqrt{a})^2(\\sqrt{b})^2 = ab$.', 'Squaring a square root gives back the number.'],
        ['$\\sqrt{a}\\sqrt{b}$ is not negative.', 'Each square root is not negative.'],
        ['So $\\sqrt{a}\\sqrt{b} = \\sqrt{ab}$.', '$\\sqrt{ab}$ is defined as the one non-negative number whose square is $ab$.'],
    ]],
    'MC-068' => ['A logarithm is a power, so it undoes the power.', '$\\log_b b^k = k$, and $\\log_b 1 = 0$.', [
        ['$\\log_b N$ is the power of $b$ that gives $N$.', 'That is the definition of a logarithm.'],
        ['The power of $b$ that gives $b^k$ is $k$.', 'Read the power straight off $b^k$.'],
        ['So $\\log_b b^k = k$.', 'The two lines above say the same thing.'],
        ['$1 = b^0$, so $\\log_b 1 = 0$.', 'Any non-zero number to the power 0 is 1.'],
    ]],
    ];
}
