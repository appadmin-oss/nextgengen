<?php
declare(strict_types=1);

/**
 * Maths Lab — exam-style question forms: JAMB (UTME) and SAT.
 *
 * Owner, 5 Nov 2026: "Can I send you SAT questions?", then a file of JAMB Mathematics past
 * papers (1983–2004), then "Proceed. Adapt them all over". Past papers are copyrighted, so no
 * question here is copied: each form is an ORIGINAL generator modelled on a KIND of question
 * those papers ask again and again (a digit missing from a number in another base, the profit
 * shared 4:5 where one partner gets ₦5,000 more, the factor theorem used to find a coefficient,
 * the fencing that encloses the largest area…), with numbers drawn fresh every time.
 *
 * The rules of the rest of the Lab hold: answers and every wrong option are DERIVED, every wrong
 * option names the slip that produces it, every question has a worked solution and a hint.
 *
 *   · JAMB-style forms are five-option multiple choice, A–E, like the UTME (`exam` 'jamb').
 *   · SAT-style forms are four-option choice or a typed "grid-in" (`exam` 'sat').
 *
 * Each form lives in the topic it belongs to — a JAMB factor-theorem question is practice for
 * "Remainder theorem and factor theorem" — and the mock papers (mlb_exam_pick) draw on them.
 * Appended after every existing form (mlb_forms), so no stored session changes question.
 */

/** A JAMB-style item: five options, A–E. */
function mlb_jamb(MlbRng $r, string $stem, string $right, array $wrong, array $steps, string $hint, int $secs = 75, string $dim = 'application'): array {
    /* A form lists more slips than it needs; the first four DIFFERENT ones are used. With small
       numbers two slips can land on the same value (or on the answer), and a JAMB question shows five. */
    $seen = [$right => true]; $keep = [];
    foreach ($wrong as $w) { if (isset($seen[$w[0]])) continue; $seen[$w[0]] = true; $keep[] = $w; if (count($keep) === 4) break; }
    return mlb_mcq($r, $stem, $right, $keep, $steps, $hint, $dim, $secs, ['exam' => 'jamb', 'letters' => true]);
}
/** A SAT-style choice item (four options, A–D). */
function mlb_sat(MlbRng $r, string $stem, string $right, array $wrong, array $steps, string $hint, int $secs = 75, string $dim = 'application'): array {
    $seen = [$right => true]; $keep = [];   // as mlb_jamb: the first three DIFFERENT slips
    foreach ($wrong as $w) { if (isset($seen[$w[0]])) continue; $seen[$w[0]] = true; $keep[] = $w; if (count($keep) === 3) break; }
    return mlb_mcq($r, $stem, $right, $keep, $steps, $hint, $dim, $secs, ['exam' => 'sat', 'letters' => true]);
}
/** A SAT-style grid-in: a typed answer. */
function mlb_sat_in(string $kind, string $stem, $key, array $steps, string $hint, int $secs = 90, string $dim = 'application', array $x = []): array {
    return mlb_typed($kind, $stem, $key, $steps, $hint, $dim, $secs, $x + ['exam' => 'sat']);
}
function mlb_x_naira(int $n): string { return '₦' . mlb_p($n); }

function mlb_forms_exam(): array {
    static $f = null;
    if ($f !== null) return $f;
    return $f = [
    /* ── Number and numeration ── */
    'MC-110' => [
        static function (MlbRng $r) { $b = $r->int(5, 8); $p = $r->int(1, $b - 1); $d = $r->int(1, $b - 1); $N = $b ** 3 + $p * $b * $b + $d;
            $wrong = []; foreach ($r->shuffle(array_values(array_diff(range(0, $b - 1), [$p]))) as $q) { if (count($wrong) === 4) break; $wrong[] = [(string)$q, 'With ' . $q . ' the number is $' . ($b ** 3) . ' + ' . $q . ' \\times ' . ($b * $b) . ' + ' . $d . ' = ' . ($b ** 3 + $q * $b * $b + $d) . '$, not ' . $N . '.']; }
            return mlb_jamb($r, 'If $(1P0' . $d . ')_{' . $b . '} = ' . $N . '_{10}$, find the digit $P$.', (string)$p, $wrong,
                ['Expand by place value: $1 \\times ' . $b . '^3 + P \\times ' . $b . '^2 + 0 \\times ' . $b . ' + ' . $d . ' = ' . ($b ** 3) . ' + ' . ($b * $b) . 'P + ' . $d . '$.', '$' . ($b * $b) . 'P = ' . $N . ' - ' . ($b ** 3 + $d) . ' = ' . ($p * $b * $b) . '$, so $P = ' . $p . '$.'],
                'Write the number in base ten using powers of ' . $b . '.'); },
    ],
    'MC-035' => [
        static function (MlbRng $r) { do { $a = $r->int(101, 999) / 100; $b = $r->int(11, 99) / 1000; $x = $a * $b; } while ($x < 0.01);
            $sf = static function (float $v, int $n): string { $e = (int)floor(log10(abs($v))); $f = 10 ** ($n - 1 - $e); return mlb_dec(round($v * $f) / $f); };
            $right = $sf($x, 3);
            return mlb_jamb($r, 'Evaluate $' . mlb_dec($a) . ' \\times ' . mlb_dec($b) . '$, correct to three significant figures.', $right,
                [[$sf($x, 2), 'That is two significant figures.'], [$sf($x, 4), 'That is four significant figures.'], [mlb_dec(round($x, 3)), 'That is three DECIMAL places, not three significant figures — leading zeros are not significant.'],
                 [mlb_dec(floor($x * 10 ** (2 - (int)floor(log10($x)))) / 10 ** (2 - (int)floor(log10($x)))), 'The digits were cut off, not rounded.'],
                 [$sf($x * 10, 3), 'The decimal point is in the wrong place: the answer has as many decimal places as the two numbers together.'], [$sf($x / 10, 3), 'The decimal point is in the wrong place: count the decimal places again.'], [$sf($x * 100, 3), 'The decimal point has moved two places: count the decimal places in both numbers.'], [$sf($x, 1), 'That is one significant figure.']],
                ['$' . mlb_dec($a) . ' \\times ' . mlb_dec($b) . ' = ' . mlb_dec($x) . '$.', 'Count significant figures from the first non-zero digit and round at the third: ' . $right . '.'],
                'Significant figures start at the first non-zero digit.'); },
    ],
    'MC-038' => [
        static function (MlbRng $r) { $P = 100 * $r->int(2, 50); $rate = $r->int(2, 15); $t = $r->int(2, 8); $I = intdiv($P * $rate * $t, 100); $A = $P + $I;
            return mlb_jamb($r, 'At what rate of simple interest per annum will ' . mlb_x_naira($P) . ' amount to ' . mlb_x_naira($A) . ' in ' . $t . ' years?', $rate . '%',
                [[($rate * $t) . '%', 'That is the interest over all ' . $t . ' years together; divide by ' . $t . '.'], [mlb_rd(100 * $A / ($P * $t), 2) . '%', 'That used the AMOUNT, not the interest, as $I$.'],
                 [mlb_rd(100 * $I / ($A * $t), 2) . '%', 'The rate is a percentage of the principal, not of the amount.'], [($rate + $t) . '%', 'Use $I = \\frac{PRT}{100}$.'], [mlb_rd($I / ($P * $t), 4) . '%', 'The formula has a factor 100: $R = \\frac{100I}{PT}$.']],
                ['Interest $= ' . mlb_n($A) . ' - ' . mlb_n($P) . ' = ' . mlb_n($I) . '$.', '$R = \\frac{100I}{PT} = \\frac{100 \\times ' . $I . '}{' . $P . ' \\times ' . $t . '} = ' . $rate . '\\%$.'],
                'First find the interest.'); },
    ],
    'MC-031' => [
        static function (MlbRng $r) { do { $p = $r->int(2, 7); $q = $r->int($p + 1, 9); } while (mlb_gcd($p, $q) !== 1); $k = $r->int(1, 9) * 1000; $D = $k * ($q - $p); $T = $k * ($p + $q);
            return mlb_jamb($r, 'Two partners share a profit in the ratio ' . $p . ':' . $q . '. The second receives ' . mlb_x_naira($D) . ' more than the first. What was the total profit?', mlb_x_naira($T),
                [[mlb_x_naira($k * $q), 'That is the second partner’s share alone.'], [mlb_x_naira($k * $p), 'That is the first partner’s share alone.'], [mlb_x_naira($D * ($p + $q)), 'The difference is ' . ($q - $p) . ' parts, not one part.'],
                 [mlb_x_naira($D * $q), 'Find what ONE part is worth first.'], [mlb_x_naira($T + $D), 'The difference is already inside the total.'], [mlb_x_naira($D), 'That is the difference, not the total.']],
                ['The difference is $' . $q . ' - ' . $p . ' = ' . ($q - $p) . '$ parts $= ' . mlb_x_naira($D) . '$, so one part is ' . mlb_x_naira($k) . '.', 'The total is $' . ($p + $q) . '$ parts $= ' . mlb_x_naira($T) . '$.'],
                'How many parts is the difference?'); },
    ],
    /* ── Indices, logarithms and surds ── */
    'MC-064' => [
        static function (MlbRng $r) { do { [$base, $ea, $eb] = $r->pick([[2, 2, 3], [3, 2, 3], [5, 2, 3], [2, 3, 2], [2, 2, 4], [2, 4, 3]]); $m = $r->int(-3, 3); $n = $r->int(-3, 3); $num = $eb * $n - $ea * $m; $den = $ea - $eb; } while ($num % $den !== 0 || $m === $n);
            $x = intdiv($num, $den); $A = $base ** $ea; $B = $base ** $eb; $tx = static fn($c) => 'x' . mlb_sterm($c);
            return mlb_jamb($r, 'Solve $' . $A . '^{' . $tx($m) . '} = ' . $B . '^{' . $tx($n) . '}$.', '$x = ' . $x . '$',
                [['$x = ' . (-$x) . '$', 'Check the signs when the brackets are expanded.'], ['$x = ' . ($n - $m) . '$', 'The indices cannot be compared until both sides have the SAME base.'], ['$x = ' . ($x + 1) . '$', 'Put it back in: the two sides are not equal.'],
                 ['$x = ' . ($m === 0 ? 1 : $m) * ($eb) . '$', 'Write ' . $A . ' and ' . $B . ' as powers of ' . $base . ' first.'], ['$x = ' . ($x - 1) . '$', 'Put it back in: the two sides are not equal.'], ['$x = ' . ($x + 2) . '$', 'Put it back in: the two sides are not equal.']],
                ['$' . $A . ' = ' . $base . '^{' . $ea . '}$ and $' . $B . ' = ' . $base . '^{' . $eb . '}$, so $' . $ea . '(' . $tx($m) . ') = ' . $eb . '(' . $tx($n) . ')$.', '$' . $ea . 'x' . mlb_sterm($ea * $m) . ' = ' . $eb . 'x' . mlb_sterm($eb * $n) . '$, so $x = ' . $x . '$.'],
                'Same base on both sides, then equate the indices.'); },
    ],
    'MC-069' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5, 6]); $k = $r->int(1, 3); $y = $r->int(2, 9); $m = $r->int(2, 6); $x = $b ** $k * $m; $z = $y * $m;
            $wrong = []; foreach ([$k + 1, $k - 1, 2 * $k, $k + 2, 0, $k + 3, 3 * $k] as $v) if ($v !== $k && count($wrong) < 4 && !in_array((string)$v, array_column($wrong, 0), true)) $wrong[] = [(string)$v, 'That would need $\\frac{' . $x . ' \\times ' . $y . '}{' . $z . '}$ to be $' . $b . '^{' . $v . '}$, but it is $' . $b . '^{' . $k . '} = ' . ($b ** $k) . '$.'];
            return mlb_jamb($r, 'Simplify $\\log_{' . $b . '} ' . $x . ' + \\log_{' . $b . '} ' . $y . ' - \\log_{' . $b . '} ' . $z . '$.', (string)$k, $wrong,
                ['Adding logs multiplies, subtracting divides: $\\log_{' . $b . '} \\frac{' . $x . ' \\times ' . $y . '}{' . $z . '}$.', '$\\frac{' . ($x * $y) . '}{' . $z . '} = ' . ($b ** $k) . ' = ' . $b . '^{' . $k . '}$, so the answer is ' . $k . '.'],
                'Combine into one log.'); },
    ],
    'MC-067' => [
        static function (MlbRng $r) { $s = $r->pick([2, 3, 5]); $a = $r->int(2, 5); $c = $s * $r->int(1, 4); $q = intdiv($c, $s);
            return mlb_jamb($r, 'Simplify $\\sqrt{' . ($a * $a * $s) . '} + \\frac{' . $c . '}{\\sqrt{' . $s . '}}$.', '$' . ($a + $q) . '\\sqrt{' . $s . '}$',
                [['$\\sqrt{' . ($a * $a * $s + $c) . '}$', 'Roots do not add like that.'], ['$' . ($a * $q) . '\\sqrt{' . $s . '}$', 'Like surds are ADDED, not multiplied.'], ['$' . ($a + $c) . '\\sqrt{' . $s . '}$', 'Rationalise first: $\\frac{' . $c . '}{\\sqrt{' . $s . '}} = ' . ($q === 1 ? '' : $q) . '\\sqrt{' . $s . '}$, not $' . $c . '\\sqrt{' . $s . '}$.'],
                 ['$' . ($a + $q) . '$', 'The $\\sqrt{' . $s . '}$ does not disappear.'], ['$' . ($a * $a + $q) . '\\sqrt{' . $s . '}$', '$\\sqrt{' . ($a * $a * $s) . '} = ' . $a . '\\sqrt{' . $s . '}$: the square root of ' . ($a * $a) . ' is ' . $a . '.']],
                ['$\\sqrt{' . ($a * $a * $s) . '} = ' . $a . '\\sqrt{' . $s . '}$, and $\\frac{' . $c . '}{\\sqrt{' . $s . '}} = \\frac{' . $c . '\\sqrt{' . $s . '}}{' . $s . '} = ' . ($q === 1 ? '' : $q) . '\\sqrt{' . $s . '}$.', 'Add like surds: $' . ($a + $q) . '\\sqrt{' . $s . '}$.'],
                'Simplify each part to a multiple of $\\sqrt{' . $s . '}$.'); },
    ],
    /* ── Algebra ── */
    'MC-058' => [
        static function (MlbRng $r) { do { $p = $r->int(2, 5); $q = $r->int(1, 4); } while ($p === $q);
            $A = $p - $q; $B = $p + $q; $L = static fn($x, $y) => '(' . mlb_lterm($x, 'x') . ' + ' . mlb_lterm($y, 'y') . ')';
            return mlb_jamb($r, 'Factorise $' . ($p * $p) . '(x + y)^2 - ' . ($q * $q) . '(x - y)^2$.', '$' . $L($A, $B) . $L($B, $A) . '$',
                [['$' . $L($A, $A) . $L($B, $B) . '$', 'Expand each bracket carefully: $' . $p . '(x + y) - ' . $q . '(x - y)$.'], ['$(' . ($p * $p - $q * $q) . ')(x + y)(x - y)$', 'The two squares have different brackets inside; this is a difference of two squares of the WHOLE terms.'],
                 ['$' . $L($B, $A) . '^2$', 'A difference of two squares gives two DIFFERENT brackets.'], ['$' . $L($A, -$B) . $L($B, $A) . '$', 'Watch the sign: $-' . $q . '(x - y) = -' . $q . 'x + ' . $q . 'y$.']],
                ['It is $[' . $p . '(x + y)]^2 - [' . $q . '(x - y)]^2 = [' . $p . '(x + y) - ' . $q . '(x - y)][' . $p . '(x + y) + ' . $q . '(x - y)]$.', 'Simplify each bracket: $' . $L($A, $B) . '$ and $' . $L($B, $A) . '$.'],
                'Write each term as a square.', 90); },
        static function (MlbRng $r) { $k = $r->int(2, 9); $T = $r->int(1, intdiv($k * $k, 2)); $S = $k * $k - $T;   // a² + b² ≥ 2ab for real numbers, so S ≥ T
            return mlb_jamb($r, 'If $a^2 + b^2 = ' . $S . '$ and $2ab = ' . $T . '$, find all the possible values of $a + b$.', '$\\pm ' . $k . '$',
                [['$' . $k . '$ only', '$(a + b)^2 = ' . ($k * $k) . '$ has a negative root too.'], ['$\\pm ' . mlb_dec(round(sqrt(abs($S - $T)), 3)) . '$', 'That is $a - b$: it uses $a^2 + b^2 - 2ab$.'], ['$' . ($k * $k) . '$', 'That is $(a + b)^2$; take the square root.'],
                 ['$\\pm ' . mlb_dec(round(sqrt($S), 3)) . '$', '$a^2 + b^2$ is not $(a + b)^2$: the $2ab$ is missing.'], ['$\\pm ' . ($k * $k) . '$', 'That is $(a + b)^2$; take the square root.']],
                ['$(a + b)^2 = a^2 + 2ab + b^2 = ' . $S . ' + ' . $T . ' = ' . ($k * $k) . '$.', 'So $a + b = \\pm ' . $k . '$.'],
                'Expand $(a + b)^2$.'); },
        static function (MlbRng $r) { $k = $r->int(3, 12);
            return mlb_jamb($r, 'If $x + \\frac{1}{x} = ' . $k . '$, find $x^2 + \\frac{1}{x^2}$.', (string)($k * $k - 2),
                [[(string)($k * $k), 'Squaring $x + \\frac{1}{x}$ gives a middle term $2$ that must be taken away.'], [(string)($k * $k + 2), 'The middle term is subtracted, not added.'], [(string)(2 * $k), 'Squaring is not doubling.'],
                 [(string)($k * $k - 1), '$2 \\times x \\times \\frac{1}{x} = 2$, not 1.']],
                ['$\\left(x + \\frac{1}{x}\\right)^2 = x^2 + 2 + \\frac{1}{x^2}$.', 'So $x^2 + \\frac{1}{x^2} = ' . $k . '^2 - 2 = ' . ($k * $k - 2) . '$.'],
                'Square both sides.'); },
    ],
    'MC-102' => [
        static function (MlbRng $r) { $h = $r->int(2, 9); $b = 2 * $h; $sg = $r->pick([1, -1]);
            return mlb_jamb($r, 'What must be added to $x^2' . mlb_sterm($sg * $b, 'x') . '$ to make it a perfect square?', (string)($h * $h),
                [[(string)($b * $b), 'Halve the coefficient of $x$ BEFORE squaring.'], [(string)$h, 'Square the half.'], [(string)(2 * $b), 'Add the square of half the coefficient of $x$.'], [(string)(2 * $h * $h), 'Halve the coefficient and square it — nothing is doubled.'], [(string)(-$h * $h), 'It must be added, positively: $(x ' . ($sg > 0 ? '+' : '-') . ' ' . $h . ')^2$ ends in $+' . ($h * $h) . '$.']],
                ['Half of ' . $b . ' is ' . $h . ', and $' . $h . '^2 = ' . ($h * $h) . '$.', '$x^2' . mlb_sterm($sg * $b, 'x') . ' + ' . ($h * $h) . ' = (x ' . ($sg > 0 ? '+' : '-') . ' ' . $h . ')^2$.'],
                'Half the coefficient of $x$, squared.'); },
    ],
    'MC-108' => [
        static function (MlbRng $r) { do { $rt = $r->nz(-3, 3); $a = $r->int(-4, 4); $q = $r->nz(-9, 9); $c = -($rt ** 3 + $a * $rt * $rt + $q * $rt); } while ($c === 0 || abs($c) > 60);
            $fx = 'x^3' . mlb_sterm($a, 'x^2') . ' + qx' . mlb_sterm($c);
            $wrong = [[(string)(-$q), 'Check the sign when you solve for $q$.'], [(string)($q + $rt), 'Put $x = ' . $rt . '$ into every term and solve again.'], [(string)($q - 2), 'Recalculate: $f(' . $rt . ')$ must be 0.']];
            $qq = (-((-$rt) ** 3) - $a * $rt * $rt - $c); if ($qq % (-$rt) === 0) { $w = intdiv($qq, -$rt); if ($w !== $q) $wrong[] = [(string)$w, 'That puts $x = ' . (-$rt) . '$: for a factor $x' . mlb_sterm(-$rt) . '$ use $x = ' . $rt . '$.']; }
            $wrong[] = [(string)($q + 2), 'Recalculate: $f(' . $rt . ')$ must be 0.']; $wrong[] = [(string)($q - $rt), 'Put $x = ' . $rt . '$ into every term and solve again.']; $wrong[] = [(string)(2 * $q), 'Divide by $' . $rt . '$ once, at the end.']; $wrong[] = [(string)($q + 3), 'Recalculate: $f(' . $rt . ')$ must be 0.'];
            return mlb_jamb($r, '$f(x) = ' . $fx . '$ is divisible by $x' . mlb_sterm(-$rt) . '$. Find $q$.', (string)$q, $wrong,
                ['Factor theorem: $x' . mlb_sterm(-$rt) . '$ is a factor, so $f(' . $rt . ') = 0$.', '$' . ($rt ** 3) . mlb_sterm($a * $rt * $rt) . mlb_sterm($rt) . 'q' . mlb_sterm($c) . ' = 0$, so $q = ' . $q . '$.'],
                'Which value of $x$ makes the factor zero?', 90); },
    ],
    'MC-106' => [
        static function (MlbRng $r) { $h = $r->nz(-6, 6); $b = -2 * $h; $c = $r->int(-10, 15); $min = $c - $h * $h;
            return mlb_jamb($r, 'Find the minimum value of $x^2' . mlb_sterm($b, 'x') . mlb_sterm($c) . '$ for all real $x$.', (string)$min,
                [[(string)$h, 'That is the value of $x$ where the minimum happens, not the minimum value.'], [(string)$c, 'That is the value at $x = 0$.'], [(string)($c + $h * $h), 'Completing the square SUBTRACTS $' . ($h * $h) . '$.'], [(string)(-$min), 'Check the sign.'], [(string)($c - $h), 'Completing the square subtracts $' . $h . '^2$, not $' . $h . '$.'], [(string)(-$h), 'The vertex is at $x = ' . $h . '$; the question asks for the value of the expression.'], [(string)($c - 2 * $h * $h), 'Subtract $' . $h . '^2$ once.'], [(string)($min + 1), 'Complete the square again: $(x' . mlb_sterm(-$h) . ')^2 = x^2' . mlb_sterm(-2 * $h, 'x') . ' + ' . ($h * $h) . '$.']],
                ['Complete the square: $(x' . mlb_sterm(-$h) . ')^2' . mlb_sterm($c - $h * $h) . '$.', 'A square is at least 0, so the minimum is $' . $min . '$, at $x = ' . $h . '$.'],
                'Complete the square.'); },
    ],
    'MC-126' => [
        static function (MlbRng $r) { do { $a = $r->int(1, 4); $b = $r->int(1, 4); $A = $r->nz(-5, 5); $K = $r->nz(-5, 5); } while ($A === $K);
            $p = $A + $K; $q = $K * $a - $A * $b;
            return mlb_jamb($r, 'Find $K$ if $\\frac{' . mlb_poly([$p, $q], 'r') . '}{(r + ' . $a . ')(r - ' . $b . ')} = \\frac{A}{r + ' . $a . '} + \\frac{K}{r - ' . $b . '}$.', (string)$K,
                [[(string)$A, 'That is $A$, the numerator over $r + ' . $a . '$.'], [(string)(-$K), 'Put $r = ' . $b . '$: check the sign.'], [(string)($A + $K), 'That is the coefficient of $r$ on top, $A + K$.'], [(string)($K * ($a + $b)), 'Divide by $' . $b . ' + ' . $a . ' = ' . ($a + $b) . '$.'], [(string)(-$A), 'That is $A$ with its sign changed; $K$ comes from putting $r = ' . $b . '$.'], [(string)$q, 'That is the constant on top, not $K$.'], [(string)($K + 1), 'Put $r = ' . $b . '$ and divide by ' . ($a + $b) . ' again.'], [(string)($K - 1), 'Put $r = ' . $b . '$ and divide by ' . ($a + $b) . ' again.']],
                ['Multiply up: $' . mlb_poly([$p, $q], 'r') . ' = A(r - ' . $b . ') + K(r + ' . $a . ')$.', 'Put $r = ' . $b . '$: $' . ($p * $b + $q) . ' = ' . ($a + $b) . 'K$, so $K = ' . $K . '$.'],
                'Choose the value of $r$ that removes $A$.', 90); },
    ],
    'MC-124' => [
        static function (MlbRng $r) { $a = $r->int(1, 6); $b = $r->int(-5, 6); $c = $r->int(-6, 9); $m = $r->int(-3, 5); $x = $m + $a; $v = $x * $x + $b * $x + $c;
            $g = static fn($t) => $t * $t + $b * $t + $c;
            return mlb_jamb($r, 'If $f(x - ' . $a . ') = x^2' . mlb_sterm($b, 'x') . mlb_sterm($c) . '$, find $f(' . $m . ')$.', (string)$v,
                [[(string)$g($m), 'That puts $x = ' . $m . '$; you need $x - ' . $a . ' = ' . $m . '$.'], [(string)$g($m - $a), 'It is $x - ' . $a . ' = ' . $m . '$, so $x = ' . ($m + $a) . '$, not ' . ($m - $a) . '.'], [(string)($v + 1), 'Recalculate with $x = ' . $x . '$.'], [(string)$g($a), 'Solve $x - ' . $a . ' = ' . $m . '$ first.'], [(string)$g(-$m), 'Solve $x - ' . $a . ' = ' . $m . '$: $x = ' . $x . '$.'], [(string)($v - 1), 'Recalculate with $x = ' . $x . '$.']],
                ['$f(' . $m . ')$ needs $x - ' . $a . ' = ' . $m . '$, so $x = ' . $x . '$.', '$' . $x . '^2' . mlb_sterm($b * $x) . mlb_sterm($c) . ' = ' . $v . '$.'],
                'Which $x$ makes the inside equal ' . $m . '?'); },
    ],
    'MC-125' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->nz(-9, 9); $sb = $b < 0 ? ' + ' . (-$b) : ' - ' . $b;
            return mlb_jamb($r, 'Find the inverse of $f(x) = ' . $a . 'x' . mlb_sterm($b) . '$.', '$f^{-1}(x) = \\frac{x' . $sb . '}{' . $a . '}$',
                [['$f^{-1}(x) = \\frac{x' . mlb_sterm($b) . '}{' . $a . '}$', 'Undoing $' . mlb_sterm($b) . '$ needs the opposite sign.'], ['$f^{-1}(x) = \\frac{1}{' . $a . 'x' . mlb_sterm($b) . '}$', 'The inverse function is not the reciprocal.'], ['$f^{-1}(x) = ' . $a . 'x' . ($b < 0 ? ' + ' . (-$b) : ' - ' . $b) . '$', 'Divide by ' . $a . ', do not multiply.'],
                 ['$f^{-1}(x) = \\frac{x}{' . $a . '}' . $sb . '$', 'Undo in reverse order: first the ' . ($b < 0 ? 'subtraction' : 'addition') . ', then the multiplication.']],
                ['Let $y = ' . $a . 'x' . mlb_sterm($b) . '$ and make $x$ the subject: $x = \\frac{y' . $sb . '}{' . $a . '}$.', 'Swap the letters: $f^{-1}(x) = \\frac{x' . $sb . '}{' . $a . '}$.'],
                'Make $x$ the subject.'); },
    ],
    'MC-123' => [
        static function (MlbRng $r) { $p = $r->int(1, 4); $q = $r->int(1, 4); $s = $r->int(1, 4); $op = static fn($a, $b) => $a * $a - $b + $a * $b;
            $L = $op($op($p, $q), $s); $R = $op($p, $op($q, $s));
            if ($L === $R) $s++;
            $L = $op($op($p, $q), $s); $R = $op($p, $op($q, $s));
            return mlb_jamb($r, 'A binary operation is defined by $a * b = a^2 - b + ab$. Find $(' . $p . ' * ' . $q . ') * ' . $s . '$.', (string)$L,
                [[(string)$R, 'That works out $' . $p . ' * (' . $q . ' * ' . $s . ')$: the bracket comes first, and $*$ is not associative.'], [(string)$op($p, $q), 'That is only the bracket; now combine it with ' . $s . '.'], [(string)$op($s, $op($p, $q)), 'The order matters: the bracket is $a$, and ' . $s . ' is $b$.'],
                 [(string)($L + 1), 'Recalculate step by step.'], [(string)$op($q, $p), '$a * b$ is not $b * a$: keep the order.'], [(string)($L - 1), 'Recalculate step by step.'], [(string)($L + 2), 'Recalculate step by step.'], [(string)($op($p, $q) + $s), 'Use the rule again for the second step: it is not plain addition.']],
                ['First $' . $p . ' * ' . $q . ' = ' . $p . '^2 - ' . $q . ' + ' . ($p * $q) . ' = ' . $op($p, $q) . '$.', 'Then $' . $op($p, $q) . ' * ' . $s . ' = ' . $op($p, $q) . '^2 - ' . $s . ' + ' . ($op($p, $q) * $s) . ' = ' . $L . '$.'],
                'Work out the bracket first.'); },
    ],
    'MC-129' => [
        static function (MlbRng $r) { do { $p = $r->int(6, 12); $q = $r->int(2, $p - 2); $k = $r->int(2, 5); $num = $k * ($q - 1) - ($p - 1); } while ($num % (1 - $k) !== 0 || $num === 0); $m = intdiv($num, 1 - $k);
            return mlb_jamb($r, 'The ' . mlb_ord($p) . ' term of an arithmetic progression is ' . $k . ' times the ' . mlb_ord($q) . ' term. Which relation connects the first term $a$ and the common difference $d$?', '$a = ' . mlb_lterm($m, 'd') . '$',
                [['$a = ' . mlb_lterm(-$m, 'd') . '$', 'Check the sign when you collect terms.'], ['$d = ' . mlb_lterm($m, 'a') . '$', '$a$ and $d$ have swapped.'], ['$a = ' . mlb_lterm($m + 1, 'd') . '$', 'The $n$th term is $a + (n - 1)d$, not $a + nd$.'], ['$a = ' . mlb_lterm($k, 'd') . '$', 'Write both terms out and solve.'], ['$a = ' . mlb_lterm($m - 1, 'd') . '$', 'The $n$th term is $a + (n - 1)d$.'], ['$a = ' . mlb_lterm(2 * $m, 'd') . '$', 'Write both terms out and solve.']],
                ['$a + ' . ($p - 1) . 'd = ' . $k . '(a + ' . ($q - 1) . 'd)$.', '$' . (1 - $k) . 'a = ' . $num . 'd$, so $a = ' . mlb_lterm($m, 'd') . '$.'],
                'Write each term as $a + (n - 1)d$.', 90); },
        static function (MlbRng $r) { [$rn, $rd] = $r->pick([[1, 2], [-1, 2], [1, 3], [-1, 3], [2, 3], [1, 4], [3, 4]]); $a = $rd * $r->int(1, 6);
            $S = [$a * $rd, $rd - $rn]; $g = mlb_gcd($S[0], $S[1]);
            return mlb_jamb($r, 'Find the sum to infinity of the geometric series $' . $a . ' ' . ($rn < 0 ? '-' : '+') . ' ' . mlb_ftex(abs($a * $rn), $rd) . ' + ' . mlb_ftex($a * $rn * $rn, $rd * $rd) . ' ' . ($rn < 0 ? '-' : '+') . ' \\dots$', '$' . mlb_ftex($S[0], $S[1]) . '$',
                [['$' . mlb_ftex($a * $rd, $rd + $rn) . '$', 'The formula is $\\frac{a}{1 - r}$, not $\\frac{a}{1 + r}$.'], ['$' . mlb_ftex($a * $rn, $rd - $rn) . '$', 'The first term is ' . $a . ', not the second.'], ['$' . mlb_ftex($a * ($rd - $rn), $rd) . '$', 'Divide by $1 - r$, do not multiply.'],
                 ['It has no sum to infinity', 'It does: $|r| = ' . mlb_ftex(abs($rn), $rd) . ' < 1$.']],
                ['$a = ' . $a . '$ and $r = ' . mlb_ftex($rn, $rd) . '$; since $|r| < 1$, $S_\\infty = \\frac{a}{1 - r}$.', '$\\frac{' . $a . '}{1 - (' . mlb_ftex($rn, $rd) . ')} = ' . mlb_ftex($S[0], $S[1]) . '$.'],
                'Find $r$ first.'); },
    ],
    'MC-105' => [
        static function (MlbRng $r) { do { $r1 = $r->int(-5, 5); $r2 = $r->int(-5, 5); } while ($r1 === $r2 || $r1 === -$r2); $m = $r1 + $r2; $c = $r->int(1, 9); $d = $r1 * $r2 + $c;
            [$lo, $hi] = [min($r1, $r2), max($r1, $r2)];
            return mlb_jamb($r, 'Solve for $x$: $x^2 + y - ' . $c . ' = 0$ and $y' . mlb_sterm($m, 'x') . mlb_sterm(-$d) . ' = 0$.', '$x = ' . $lo . '$ or $x = ' . $hi . '$',
                [['$x = ' . (-$hi) . '$ or $x = ' . (-$lo) . '$', 'Check the signs when you factorise.'], ['$x = ' . $lo . '$ only', 'A quadratic here has two solutions.'], ['$x = ' . ($lo - 1) . '$ or $x = ' . ($hi + 1) . '$', 'Substitute back: these do not satisfy both equations.'],
                 ['$x = ' . $c . '$ or $x = ' . $d . '$', 'Substitute for $y$ first.'], ['$x = ' . $hi . '$ only', 'A quadratic here has two solutions.']],
                ['From the second, $y = ' . $d . mlb_sterm(-$m, 'x') . '$. Substitute: $x^2' . mlb_sterm(-$m, 'x') . mlb_sterm($d - $c) . ' = 0$.', 'Factorise: $(x' . mlb_sterm(-$r1) . ')(x' . mlb_sterm(-$r2) . ') = 0$, so $x = ' . $lo . '$ or $' . $hi . '$.'],
                'Substitute the linear one into the quadratic.', 90); },
    ],
    'MC-060' => [
        static function (MlbRng $r) { $a = $r->int(1, 3); $b = $r->int(1, 4); $f1 = $r->pick([2, 3]); $up = $r->int(0, 1) === 1; $f2 = 2;
            // y divided by f1 (halved / thirded), z multiplied by 2
            $num = $f2 ** $b; $den = $f1 ** $a; $g = mlb_gcd($num, $den); $N = intdiv($num, $g); $D = intdiv($den, $g);
            $desc = $N === $D ? 'It is unchanged' : 'It is multiplied by $' . mlb_ftex($N, $D) . '$';   // one wording: a wrong option must never be the right answer said differently
            return mlb_jamb($r, '$x$ varies jointly as $y^{' . $a . '}$ and $z^{' . $b . '}$. What happens to $x$ when $y$ is ' . ($f1 === 2 ? 'halved' : 'divided by 3') . ' and $z$ is doubled?', $desc,
                [['It is multiplied by $' . mlb_ftex($f2 * $b, $f1 * $a) . '$', 'The powers multiply the factors as INDICES, not as multipliers.'], ['It is multiplied by $' . mlb_ftex(2, $f1) . '$', 'Raise each factor to its power: $' . $f1 . '^{' . $a . '}$ and $2^{' . $b . '}$.'],
                 ['It is multiplied by $' . mlb_ftex($den, $num) . '$', 'Upside down: halving $y$ DIVIDES, doubling $z$ MULTIPLIES.'], [$N === $D ? 'It is doubled' : 'It is unchanged', 'Work the factor out: $\\frac{2^{' . $b . '}}{' . $f1 . '^{' . $a . '}} = ' . mlb_ftex($N, $D) . '$.'], ['It is multiplied by $' . mlb_ftex(2 ** $b, $f1) . '$', 'Raise the factor for $y$ to its power too: $' . $f1 . '^{' . $a . '}$.'], ['It is multiplied by $' . mlb_ftex(2, $f1 ** $a) . '$', 'Raise the factor for $z$ to its power too: $2^{' . $b . '}$.'], ['It is multiplied by $' . (2 ** $b) . '$', 'That counts only the change in $z$; $y$ changed too.'], ['It is multiplied by $' . mlb_ftex(1, $f1 ** $a) . '$', 'That counts only the change in $y$; $z$ changed too.']],
                ['$x = ky^{' . $a . '}z^{' . $b . '}$. New $x = k\\left(\\frac{y}{' . $f1 . '}\\right)^{' . $a . '}(2z)^{' . $b . '} = \\frac{2^{' . $b . '}}{' . $f1 . '^{' . $a . '}}ky^{' . $a . '}z^{' . $b . '}$.', 'So $x$ is multiplied by $' . mlb_ftex($N, $D) . '$.'],
                'Replace $y$ and $z$ by their new values in $x = ky^{' . $a . '}z^{' . $b . '}$.'); },
    ],
    /* ── Geometry, mensuration and trigonometry ── */
    'MC-075' => [
        static function (MlbRng $r) { $I = $r->pick([108, 120, 135, 140, 144, 150, 156, 160, 162, 165]); $n = intdiv(360, 180 - $I);
            return mlb_jamb($r, 'Each interior angle of a regular polygon is $' . $I . '^\\circ$. How many sides has it?', (string)$n,
                [[(string)intdiv(360 + 180 - $I - 1, 180 - $I) === (string)$n ? (string)($n + 1) : (string)($n + 1), 'Check: $(n - 2) \\times 180 \\div n$ must give $' . $I . '^\\circ$.'], [mlb_dec(round(360 / $I, 2)), '$360^\\circ$ divided by the EXTERIOR angle, not the interior angle.'],
                 [(string)($n - 2), 'That is the number of triangles the polygon splits into.'], [(string)(180 - $I), 'That is the exterior angle, not the number of sides.'], [(string)(2 * $n), 'Exterior angles add to $360^\\circ$, not $720^\\circ$.']],
                ['The exterior angle is $180^\\circ - ' . $I . '^\\circ = ' . (180 - $I) . '^\\circ$.', 'Exterior angles add to $360^\\circ$: $n = 360 \\div ' . (180 - $I) . ' = ' . $n . '$.'],
                'Use the exterior angle.'); },
    ],
    'MC-083' => [
        static function (MlbRng $r) { $rad = $r->pick([7, 14, 21]); $th = $r->pick([30, 45, 60, 72, 90, 120, 135, 150]); $A = $th / 360 * 22 / 7 * $rad * $rad; $L = $th / 360 * 2 * 22 / 7 * $rad;
            return mlb_jamb($r, 'A sector of a circle of radius ' . $rad . ' cm has angle $' . $th . '^\\circ$. Find its area. (Take $\\pi = \\frac{22}{7}$.)', mlb_rd($A, 2) . ' cm²',
                [[mlb_rd($L, 2) . ' cm²', 'That is the ARC LENGTH, $\\frac{\\theta}{360} \\times 2\\pi r$.'], [mlb_rd(22 / 7 * $rad * $rad, 2) . ' cm²', 'That is the whole circle; take $\\frac{' . $th . '}{360}$ of it.'], [mlb_rd($th / 180 * 22 / 7 * $rad * $rad, 2) . ' cm²', 'A full turn is $360^\\circ$, not $180^\\circ$.'],
                 [mlb_rd($A / 2, 2) . ' cm²', 'There is no extra half in the sector formula.']],
                ['Area of a sector $= \\frac{\\theta}{360} \\times \\pi r^2$.', '$\\frac{' . $th . '}{360} \\times \\frac{22}{7} \\times ' . ($rad * $rad) . ' = ' . mlb_rd($A, 2) . '$ cm².'],
                'What fraction of the circle is the sector?'); },
    ],
    'MC-077' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3);
            return mlb_jamb($r, 'The diagonals of a rhombus are ' . (2 * $k * $a) . ' cm and ' . (2 * $k * $b) . ' cm. Find the length of a side.', ($k * $c) . ' cm',
                [[mlb_rd(sqrt((2 * $k * $a) ** 2 + (2 * $k * $b) ** 2), 2) . ' cm', 'The diagonals BISECT each other: use half of each.'], [($k * ($a + $b)) . ' cm', 'The side is the hypotenuse of a right triangle, not a sum.'],
                 [(2 * $k * $k * $a * $b) . ' cm', 'That is the AREA, half the product of the diagonals.'], [($k * ($a + $b) * 2) . ' cm', 'Use Pythagoras on half-diagonals.']],
                ['The diagonals of a rhombus bisect each other at right angles: half-diagonals ' . ($k * $a) . ' and ' . ($k * $b) . ' cm.', 'Side $= \\sqrt{' . ($k * $a) . '^2 + ' . ($k * $b) . '^2} = ' . ($k * $c) . '$ cm.'],
                'Draw the right angle where the diagonals cross.'); },
    ],
    'MC-085' => [
        static function (MlbRng $r) { do { $p = $r->int(1, 5); $q = $r->int(2, 6); } while ($p >= $q || mlb_gcd($p, $q) !== 1);
            return mlb_jamb($r, 'Two similar cylinders have heights in the ratio ' . $p . ':' . $q . '. What is the ratio of their volumes?', ($p ** 3) . ':' . ($q ** 3),
                [[($p * $p) . ':' . ($q * $q), 'That is the ratio of their AREAS; volumes go with the cube.'], [$p . ':' . $q, 'Lengths scale by ' . $p . ':' . $q . ', volumes by its cube.'], [(3 * $p) . ':' . (3 * $q), 'Cube the ratio; do not multiply it by 3.'], [($p ** 3) . ':' . ($q * $q), 'Both sides of the ratio are cubed.'], [($q ** 3) . ':' . ($p ** 3), 'Upside down: keep the order of the heights.']],
                ['Similar solids: lengths ' . $p . ':' . $q . ', areas $' . $p . '^2:' . $q . '^2$, volumes $' . $p . '^3:' . $q . '^3$.', 'So ' . ($p ** 3) . ':' . ($q ** 3) . '.'],
                'Volume has three dimensions.'); },
    ],
    'MC-086' => [
        static function (MlbRng $r) { $rad = $r->pick([7, 14, 3.5, 10.5]); $pr = 22 / 7 * $rad * $rad;
            return mlb_jamb($r, 'A solid hemisphere has radius ' . mlb_dec($rad) . ' cm. Find its TOTAL surface area. (Take $\\pi = \\frac{22}{7}$.)', mlb_rd(3 * $pr, 2) . ' cm²',
                [[mlb_rd(2 * $pr, 2) . ' cm²', 'That is only the curved surface; a SOLID hemisphere also has a flat circular face.'], [mlb_rd(4 * $pr, 2) . ' cm²', 'That is a whole sphere.'], [mlb_rd($pr, 2) . ' cm²', 'That is only the flat face.'],
                 [mlb_rd(2 / 3 * $pr * $rad, 2) . ' cm³', 'That is the VOLUME.']],
                ['Curved surface $= 2\\pi r^2$, flat face $= \\pi r^2$, so total $= 3\\pi r^2$.', '$3 \\times \\frac{22}{7} \\times ' . mlb_dec($rad * $rad) . ' = ' . mlb_rd(3 * $pr, 2) . '$ cm².'],
                'Curved part plus the flat face.'); },
    ],
    'MC-113' => [
        static function (MlbRng $r) { $h0 = $r->pick([1.2, 1.5, 1.6, 1.8]); [$t, $tt] = $r->pick([['45^\\circ', 1], ['\\theta, \\text{ where } \\tan\\theta = \\frac{3}{4}', 0.75], ['\\theta, \\text{ where } \\tan\\theta = \\frac{4}{3}', 4 / 3]]); $d = $r->int(2, 10) * 3;
            $H = $h0 + $d * $tt;
            return mlb_jamb($r, 'A man ' . mlb_dec($h0) . ' m tall stands ' . $d . ' m from a tree and sees its top at an angle of elevation of $' . $t . '$. How tall is the tree?', mlb_rd($H, 2) . ' m',
                [[mlb_rd($d * $tt, 2) . ' m', 'That is the height ABOVE HIS EYES; add his own height.'], [mlb_rd($d / $tt + $h0, 2) . ' m', 'Opposite $=$ adjacent $\\times \\tan$, not adjacent $\\div \\tan$.'], [mlb_rd($d * $tt - $h0, 2) . ' m', 'His height is added, not taken away.'],
                 [mlb_rd($d * $tt / sqrt(1 + $tt * $tt) + $h0, 2) . ' m', 'Use tangent: you know the adjacent side, not the hypotenuse.'], [mlb_rd(sqrt($d * $d + ($d * $tt) ** 2), 2) . ' m', 'That is the distance along his line of sight, not the height.']],
                ['Above his eye level: $' . $d . ' \\times ' . mlb_dec(round($tt, 4)) . ' = ' . mlb_rd($d * $tt, 2) . '$ m.', 'Add his height: $' . mlb_rd($d * $tt, 2) . ' + ' . mlb_dec($h0) . ' = ' . mlb_rd($H, 2) . '$ m.'],
                'The right angle is at his eye level, not on the ground.'); },
    ],
    'MC-114' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 8, 7], [5, 8, 7], [8, 15, 13], [7, 15, 13], [5, 21, 19], [16, 21, 19]]); $k = $r->int(1, 2);
            return mlb_jamb($r, 'In triangle $XYZ$, $\\angle XYZ = 60^\\circ$, $XY = ' . ($k * $a) . '$ cm and $YZ = ' . ($k * $b) . '$ cm. Find $XZ$.', ($k * $c) . ' cm',
                [[mlb_rd($k * sqrt($a * $a + $b * $b), 2) . ' cm', 'That is Pythagoras: the angle is $60^\\circ$, not $90^\\circ$.'], [($k * ($a + $b)) . ' cm', 'Use the cosine rule.'], [mlb_rd($k * sqrt($a * $a + $b * $b + $a * $b), 2) . ' cm', '$\\cos 60^\\circ = +\\frac{1}{2}$, so $ab$ is SUBTRACTED.'],
                 [($k * abs($b - $a)) . ' cm', 'Use the cosine rule.']],
                ['Cosine rule: $XZ^2 = ' . ($k * $a) . '^2 + ' . ($k * $b) . '^2 - 2 \\times ' . ($k * $a) . ' \\times ' . ($k * $b) . ' \\times \\cos 60^\\circ$.', '$= ' . ($k * $k * $a * $a) . ' + ' . ($k * $k * $b * $b) . ' - ' . ($k * $k * $a * $b) . ' = ' . ($k * $k * $c * $c) . '$, so $XZ = ' . ($k * $c) . '$ cm.'],
                'Two sides and the angle between them.'); },
    ],
    'MC-096' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(array_slice(MLB_TRIPLES, 0, 3)); $x1 = $r->int(-5, 5); $y1 = $r->int(-5, 5); $x2 = $x1 + $r->pick([1, -1]) * $a; $y2 = $y1 + $r->pick([1, -1]) * $b;
            return mlb_jamb($r, 'Find the distance between $P(' . $x1 . ', ' . $y1 . ')$ and $Q(' . $x2 . ', ' . $y2 . ')$.', $c . ' units',
                [[($a + $b) . ' units', 'Add the squares, not the differences.'], [mlb_rd(sqrt(($x1 + $x2) ** 2 + ($y1 + $y2) ** 2), 2) . ' units', 'Use the DIFFERENCES of the coordinates.'], [($a * $a + $b * $b) . ' units', 'Take the square root at the end.'],
                 [mlb_rd(sqrt(abs($a * $a - $b * $b)), 2) . ' units', 'The squares are added.'], [($a * $b) . ' units', 'Square each difference and ADD the squares.']],
                ['Differences: $' . $x2 . ' - (' . $x1 . ') = ' . ($x2 - $x1) . '$ and $' . $y2 . ' - (' . $y1 . ') = ' . ($y2 - $y1) . '$.', '$\\sqrt{' . ($a * $a) . ' + ' . ($b * $b) . '} = ' . $c . '$.'],
                'Pythagoras on the coordinate differences.'); },
    ],
    /* ── Statistics and probability ── */
    'MC-117' => [
        static function (MlbRng $r) { $tot = $r->pick([36, 60, 72, 90, 120, 180]); $k = $r->int(3, 5); do { $v = []; $left = $tot; for ($i = 0; $i < $k - 1; $i++) { $x = $r->int(1, max(1, intdiv($left, 2))); $v[] = $x; $left -= $x; } $v[] = $left; } while (min($v) < 1 || count(array_unique($v)) < $k);
            $items = array_slice(['Rice', 'Yam', 'Beans', 'Maize', 'Cassava'], 0, $k); $i = $r->int(0, $k - 1); $ang = $v[$i] * 360 / $tot;
            return mlb_jamb($r, 'A farm’s harvest (in bags) is: ' . implode(', ', array_map(static fn($n, $q) => $n . ' ' . $q, $items, $v)) . '. In a pie chart, what is the angle of the sector for ' . $items[$i] . '?', mlb_dec($ang) . '°',
                [[mlb_rd($v[$i] * 100 / $tot, 2) . '°', 'That is its PERCENTAGE; a pie chart shares 360°.'], [$v[$i] . '°', 'Scale the number up to its share of 360°.'], [mlb_rd(360 / $k, 2) . '°', 'Sectors are not equal: they follow the data.'], [mlb_rd($v[$i] * 360 / ($tot - $v[$i]), 2) . '°', 'Divide by the WHOLE total, ' . $tot . '.'], [mlb_rd($v[$i] * 3.6, 2) . '°', 'The numbers are bags, not percentages: divide by the total first.']],
                ['Total $= ' . $tot . '$ bags.', 'Angle $= \\frac{' . $v[$i] . '}{' . $tot . '} \\times 360^\\circ = ' . mlb_dec($ang) . '^\\circ$.'],
                'What fraction of the total is it?'); },
    ],
    'MC-118' => [
        static function (MlbRng $r) { do { $n = $r->int(5, 12); $m = $r->int(10, 40); $m2 = $m + $r->nz(-3, 4); $x = ($n + 1) * $m2 - $n * $m; } while ($x < 1);
            return mlb_jamb($r, 'The mean of ' . $n . ' numbers is ' . $m . '. When one more number is added, the mean becomes ' . $m2 . '. Find the number added.', (string)$x,
                [[(string)$m2, 'That is the new mean, not the new number.'], [(string)($m2 - $m), 'That is the change in the mean.'], [(string)($n * $m2 - $n * $m), 'There are now ' . ($n + 1) . ' numbers, not ' . $n . '.'], [(string)intdiv($m + $m2, 2), 'The means cannot just be averaged.'], [(string)(($n + 1) * $m2), 'That is the new total; take away the old total.']],
                ['Old total $= ' . $n . ' \\times ' . $m . ' = ' . ($n * $m) . '$; new total $= ' . ($n + 1) . ' \\times ' . $m2 . ' = ' . (($n + 1) * $m2) . '$.', 'The number added $= ' . (($n + 1) * $m2) . ' - ' . ($n * $m) . ' = ' . $x . '$.'],
                'Work with the totals, not the means.'); },
        static function (MlbRng $r) { do { $d = []; $len = 2 * $r->int(3, 5); for ($i = 0; $i < $len; $i++) $d[] = $r->int(1, 12); sort($d); $c = array_count_values($d); arsort($c); $vals = array_values($c); } while (count($c) < 2 || $vals[0] === $vals[1]);
            $mode = (int)array_key_first($c); $med = ($d[$len / 2 - 1] + $d[$len / 2]) / 2; $sh = $r->shuffle($d); $mean = array_sum($d) / $len;
            return mlb_jamb($r, 'Find the sum of the median and the mode of: ' . implode(', ', $sh) . '.', mlb_dec($med + $mode),
                [[mlb_dec($mean + $mode), 'That uses the MEAN, not the median.'], [mlb_dec($sh[intdiv($len, 2)] + $mode), 'Arrange the numbers in order before finding the middle.'], [mlb_dec($med + $c[$mode]), 'The mode is the most common VALUE, not how often it occurs.'], [mlb_dec($d[$len / 2] + $mode), 'With an even count, the median is the mean of the two middle values.'], [mlb_dec($med), 'That is the median alone; add the mode.'], [(string)$mode, 'That is the mode alone; add the median.'], [mlb_dec(($d[$len - 1] - $d[0]) + $mode), 'That uses the range, not the median.'], [mlb_dec($mean), 'That is the mean alone.']],
                ['In order: ' . implode(', ', $d) . '. The median is the mean of the two middle values: $\\frac{' . $d[$len / 2 - 1] . ' + ' . $d[$len / 2] . '}{2} = ' . mlb_dec($med) . '$.', 'The mode is ' . $mode . ' (it appears ' . $c[$mode] . ' times), so the sum is ' . mlb_dec($med + $mode) . '.'],
                'Order the data first.', 90); },
    ],
    'MC-119' => [
        static function (MlbRng $r) { [$dev, $sd] = $r->pick([[[-2, -2, 2, 2], 2], [[-3, -3, 3, 3], 3], [[-1, -1, -1, -1, 4], 2], [[-4, 0, 0, 0, 4, 0, 0, 0], 2], [[-6, -2, 2, 6, 0], 4]]); $k = $r->int(1, 2); $mu = $r->int(5, 20);
            $data = array_map(static fn($e) => $mu + $k * $e, $dev); $sh = $r->shuffle($data); $var = $sd * $sd * $k * $k; $md = array_sum(array_map('abs', $dev)) * $k / count($dev);
            return mlb_jamb($r, 'Find the standard deviation of: ' . implode(', ', $sh) . '.', (string)($sd * $k),
                [[(string)$var, 'That is the VARIANCE; take its square root.'], [mlb_rd($md, 2), 'That is the MEAN DEVIATION (the average of the distances).'], [(string)((max($dev) - min($dev)) * $k), 'That is the range.'], [mlb_rd(sqrt($var * count($dev) / (count($dev) - 1)), 2), 'For a set of data like this, divide by $n$, not $n - 1$.'], [(string)$mu, 'That is the mean.'], [(string)($var * count($dev)), 'That is the sum of the squared deviations; divide by $n$ and take the root.']],
                ['The mean is ' . $mu . '; the deviations are ' . implode(', ', array_map(static fn($e) => $k * $e, $dev)) . '.', 'Variance $= \\frac{\\sum (x - \\bar{x})^2}{n} = ' . $var . '$, so $\\sigma = \\sqrt{' . $var . '} = ' . ($sd * $k) . '$.'],
                'Mean, deviations, squares, average, root.', 120); },
        static function (MlbRng $r) { do { $n = $r->int(4, 6); $d = []; for ($i = 0; $i < $n; $i++) $d[] = $r->int(2, 20); } while (array_sum($d) % $n !== 0);
            $mu = intdiv(array_sum($d), $n); $md = array_sum(array_map(static fn($x) => abs($x - $mu), $d)) / $n;
            return mlb_jamb($r, 'Calculate the mean deviation of: ' . implode(', ', $d) . '.', mlb_rd($md, 2),
                [['0', 'Signed deviations always add to 0; use their sizes (absolute values).'], [mlb_rd(array_sum(array_map(static fn($x) => ($x - $mu) ** 2, $d)) / $n, 2), 'That is the variance (the squares), not the mean deviation.'], [(string)$mu, 'That is the mean itself.'],
                 [mlb_rd((max($d) - min($d)) / 2, 2), 'That is half the range.'], [mlb_rd(sqrt(array_sum(array_map(static fn($x) => ($x - $mu) ** 2, $d)) / $n), 2), 'That is the standard deviation (squares, then a root).']],
                ['Mean $= \\frac{' . array_sum($d) . '}{' . $n . '} = ' . $mu . '$. Distances from it: ' . implode(', ', array_map(static fn($x) => abs($x - $mu), $d)) . '.', 'Mean deviation $= \\frac{' . array_sum(array_map(static fn($x) => abs($x - $mu), $d)) . '}{' . $n . '} = ' . mlb_rd($md, 2) . '$.'],
                'Average distance from the mean.', 90); },
    ],
    'MC-120' => [
        static function (MlbRng $r) { $w = $r->pick(['MATRICULATION', 'MATHEMATICS', 'EXAMINATION', 'UNIVERSITY', 'STATISTICS', 'PROBABILITY', 'ABUJA', 'NIGERIA', 'OGBOMOSO']); $L = strlen($w); $v = preg_match_all('/[AEIOU]/', $w); $dv = count(array_unique(str_split(preg_replace('/[^AEIOU]/', '', $w))));
            return mlb_jamb($r, 'The letters of the word ' . $w . ' are put in a box, and one is drawn at random. What is the probability that it is a vowel?', '$' . mlb_ftex($v, $L) . '$',
                [['$' . mlb_ftex($dv, $L) . '$', 'Count every vowel CARD, repeats included: there are ' . $v . '.'], ['$' . mlb_ftex($L - $v, $L) . '$', 'That is the probability of a consonant.'], ['$' . mlb_ftex(5, $L) . '$', 'Count the vowels in THIS word, not the five vowels of the alphabet.'],
                 ['$' . mlb_ftex($v, count(array_unique(str_split($w)))) . '$', 'There are ' . $L . ' cards in the box, repeats included.'], ['$' . mlb_ftex($v, $L - $v) . '$', 'That compares vowels with consonants; a probability compares vowels with ALL the letters.']],
                [$w . ' has ' . $L . ' letters, of which ' . $v . ' are vowels.', '$P(\\text{vowel}) = ' . mlb_ftex($v, $L) . '$.'],
                'Count letters, repeats included.'); },
    ],
    'MC-127' => [
        static function (MlbRng $r) { $k = $r->int(5, 8); $zero = $r->int(0, 1) === 1; $digits = $zero ? range(0, $k - 1) : range(1, $k); $cnt = $zero ? ($k - 1) * ($k - 1) * ($k - 2) : $k * ($k - 1) * ($k - 2);
            return mlb_jamb($r, 'How many three-digit numbers can be formed from the digits ' . implode(', ', $digits) . ' if no digit may be repeated?', (string)$cnt,
                [[(string)($k * ($k - 1) * ($k - 2)), $zero ? 'A number cannot start with 0.' : 'Recount the choices for each place.'], [(string)($k ** 3), 'Digits may not be repeated.'], [(string)mlb_ncr($k, 3), 'Order matters: 123 and 321 are different numbers.'], [(string)(($k - 1) * $k * ($k - 1)), 'After the first digit, one fewer is left for each place.'], [(string)mlb_fact($k), 'That arranges ALL ' . $k . ' digits; there are only three places.']],
                [$zero ? 'Hundreds: ' . ($k - 1) . ' choices (not 0); tens: ' . ($k - 1) . ' (0 is allowed now); units: ' . ($k - 2) . '.' : 'Hundreds: ' . $k . ' choices; tens: ' . ($k - 1) . '; units: ' . ($k - 2) . '.', 'Multiply: ' . $cnt . '.'],
                'Fill the hundreds place first.'); },
    ],
    /* ── Calculus ── */
    'MC-153' => [
        static function (MlbRng $r) { $a = $r->nz(-4, 5); $b = $r->int(-6, 6); $c = $r->int(-9, 9); $k = $r->nz(-3, 3);
            return mlb_jamb($r, 'Find the gradient of the curve $y = ' . mlb_poly([$a, $b, $c]) . '$ at the point where $x = ' . $k . '$.', (string)(2 * $a * $k + $b),
                [[(string)($a * $k * $k + $b * $k + $c), 'That is the value of $y$, not the gradient.'], [(string)(2 * $a * $k), 'The $' . mlb_lterm($b, 'x') . '$ term differentiates to ' . $b . ', which is part of the gradient.'], [(string)($a * $k * $k + $b), 'Differentiate $x^2$ to $2x$ before substituting.'],
                 [(string)(2 * $a * $k + $b + $c), 'A constant differentiates to 0.'], [(string)$b, 'That is the gradient at $x = 0$; substitute $x = ' . $k . '$.'], [(string)(-(2 * $a * $k + $b)), 'Check the signs.'], [(string)($a * $k + $b), '$ax^2$ differentiates to $2ax$, not $ax$.'], [(string)(2 * $a + $b), 'That is the gradient at $x = 1$; use $x = ' . $k . '$.'], [(string)(2 * $a * $k * $k + $b), 'Differentiate first: the power drops by one.']],
                ['$\\frac{dy}{dx} = ' . mlb_poly([2 * $a, $b]) . '$.', 'At $x = ' . $k . '$: $' . (2 * $a) . ' \\times ' . ($k < 0 ? '(' . $k . ')' : $k) . mlb_sterm($b) . ' = ' . (2 * $a * $k + $b) . '$.'],
                'Differentiate, then substitute.'); },
    ],
    'MC-158' => [
        static function (MlbRng $r) { $a = 2 * $r->nz(-3, 3); $b = $r->nz(-6, 6); $c = $r->int(-5, 9);
            $ans = 'y = ' . mlb_poly([intdiv($a, 2), $b, $c]);
            return mlb_jamb($r, 'If $\\frac{dy}{dx} = ' . mlb_poly([$a, $b]) . '$ and $y = ' . $c . '$ when $x = 0$, find $y$ in terms of $x$.', '$' . $ans . '$',
                [['$y = ' . mlb_poly([$a, $b, $c]) . '$', 'Integrating $' . mlb_lterm($a, 'x') . '$ gives $' . mlb_lterm(intdiv($a, 2), 'x^2') . '$: the power rises AND you divide by the new power.'], ['$y = ' . mlb_poly([intdiv($a, 2), $b, 0]) . '$', 'Use $y = ' . $c . '$ at $x = 0$ to find the constant.'],
                 ['$y = ' . mlb_poly([$a, $c]) . '$', 'That differentiates, not integrates.'], ['$y = ' . mlb_poly([intdiv($a, 2), $b, -$c]) . '$', 'At $x = 0$, $y$ equals the constant: $+' . $c . '$.'], ['$y = ' . mlb_poly([intdiv($a, 2), -$b, $c]) . '$', 'Integrating keeps the sign of each term.'], ['$y = ' . mlb_poly([2 * $a, $b, $c]) . '$', 'Integrating DIVIDES by the new power; it does not multiply.']],
                ['Integrate: $y = ' . mlb_poly([intdiv($a, 2), $b]) . ' + C$.', 'At $x = 0$, $y = C = ' . $c . '$, so $' . $ans . '$.'],
                'Integrate, then use the given point.'); },
        static function (MlbRng $r) { $k = $r->int(1, 5); $m = $r->int(1, 5); $tr = $r->pick(['cos', 'sin']);
            $right = $tr === 'cos' ? mlb_lterm($k, '\\ln x') . ' + ' . mlb_lterm($m, '\\sin x') . ' + C' : mlb_lterm($k, '\\ln x') . ' - ' . mlb_lterm($m, '\\cos x') . ' + C';
            return mlb_jamb($r, 'Integrate $\\frac{' . $k . '}{x} + ' . mlb_lterm($m, '\\' . $tr . ' x') . '$ with respect to $x$.', '$' . $right . '$',
                [['$' . ($tr === 'cos' ? mlb_lterm($k, '\\ln x') . ' - ' . mlb_lterm($m, '\\sin x') : mlb_lterm($k, '\\ln x') . ' + ' . mlb_lterm($m, '\\cos x')) . ' + C$', $tr === 'cos' ? '$\\int \\cos x\\,dx = +\\sin x$.' : '$\\int \\sin x\\,dx = -\\cos x$.'],
                 ['$-\\frac{' . $k . '}{x^2} ' . ($tr === 'cos' ? '- ' . mlb_lterm($m, '\\sin x') : '+ ' . mlb_lterm($m, '\\cos x')) . ' + C$', 'That is the DERIVATIVE.'], ['$' . mlb_lterm($k, 'x') . ($tr === 'cos' ? ' + ' . mlb_lterm($m, '\\sin x') : ' - ' . mlb_lterm($m, '\\cos x')) . ' + C$', '$\\int \\frac{1}{x}\\,dx = \\ln x$, not $x$.'],
                 ['$' . mlb_lterm($k, '\\ln x') . ($tr === 'cos' ? ' + ' . mlb_lterm($m, '\\sin x') : ' - ' . mlb_lterm($m, '\\cos x')) . '$', 'An indefinite integral needs $+\\,C$.']],
                ['$\\int \\frac{1}{x}\\,dx = \\ln x$ and $\\int \\' . $tr . ' x\\,dx = ' . ($tr === 'cos' ? '\\sin x' : '-\\cos x') . '$.', 'So the answer is $' . $right . '$.'],
                'Integrate term by term.'); },
    ],
    'MC-156' => [
        static function (MlbRng $r) { $v = $r->int(1, 4); $R = $r->int(2, 12);
            return mlb_jamb($r, 'The radius of a circle increases at ' . $v . ' cm/s. How fast is its area increasing when the radius is ' . $R . ' cm?', '$' . (2 * $R * $v) . '\\pi$ cm²/s',
                [['$' . ($R * $R * $v) . '\\pi$ cm²/s', 'Differentiate $\\pi r^2$ first: $\\frac{dA}{dr} = 2\\pi r$.'], ['$' . (2 * $R) . '\\pi$ cm²/s', 'Multiply by $\\frac{dr}{dt} = ' . $v . '$ (chain rule).'], ['$' . ($R * $R) . '\\pi$ cm²/s', 'That is the area itself.'], ['$' . (2 * $v) . '\\pi$ cm²/s', 'Put in the radius: $2\\pi r$ with $r = ' . $R . '$.'], ['$' . (2 * $R * $v) . '$ cm²/s', 'The rate keeps its $\\pi$: $A = \\pi r^2$.'], ['$' . ($R * $v) . '\\pi$ cm²/s', '$\\frac{d}{dr}\\pi r^2 = 2\\pi r$: the 2 comes down.'], ['$' . (2 * $R + $v) . '\\pi$ cm²/s', 'The rates are multiplied (chain rule), not added.'], ['$' . (2 * $R * $R * $v) . '\\pi$ cm²/s', 'Differentiate $\\pi r^2$ once: $2\\pi r$, not $2\\pi r^2$.']],
                ['$A = \\pi r^2$, so $\\frac{dA}{dt} = 2\\pi r \\frac{dr}{dt}$.', '$= 2\\pi \\times ' . $R . ' \\times ' . $v . ' = ' . (2 * $R * $v) . '\\pi$ cm²/s.'],
                'Chain rule: $\\frac{dA}{dt} = \\frac{dA}{dr} \\times \\frac{dr}{dt}$.'); },
    ],

    /* ═══ SAT-style ═══ */
    'MC-042' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 12); if ($a === $b) $b++; $x = $r->int(3, 15); $v = $b * $x + $a;
            return mlb_sat($r, '“' . $a . ' more than ' . $b . ' times a number $x$ is equal to ' . $v . '.” Which equation represents this situation?', '$' . $b . 'x + ' . $a . ' = ' . $v . '$',
                [['$' . $a . 'x + ' . $b . ' = ' . $v . '$', 'The ' . $b . ' multiplies $x$; the ' . $a . ' is added.'], ['$' . $b . 'x = ' . $v . ' + ' . $a . '$', '“' . $a . ' more than” adds ' . $a . ' to $' . $b . 'x$, on the same side.'], ['$(' . $a . ')(' . $b . ')x = ' . $v . '$', '“More than” means add, not multiply.']],
                ['“' . $b . ' times a number” is $' . $b . 'x$; “' . $a . ' more than” that is $' . $b . 'x + ' . $a . '$.', '“Is equal to ' . $v . '” gives $' . $b . 'x + ' . $a . ' = ' . $v . '$.'],
                'Build it from the inside: the number, times ' . $b . ', plus ' . $a . '.', 50, 'concept'); },
    ],
    'MC-076' => [
        static function (MlbRng $r) { do { $q = $r->int(12, 78); } while ($q === 45); $p = 90 - $q;
            return mlb_sat($r, 'Right triangles $PQR$ and $STU$ are similar, with $P$ corresponding to $S$ and the right angles at $R$ and $U$. If angle $Q$ measures $' . $q . '^\\circ$, what is the measure of angle $S$?', '$' . $p . '^\\circ$',
                [['$' . $q . '^\\circ$', 'Angle $S$ corresponds to angle $P$, not to angle $Q$.'], ['$' . (180 - $q) . '^\\circ$', 'Angles in a triangle add to $180^\\circ$, and one is already $90^\\circ$.'], ['$' . (90 + $q) . '^\\circ$', 'A right triangle’s other two angles add to $90^\\circ$.'], ['$90^\\circ$', 'The right angles are at $R$ and $U$, not at $S$.']],
                ['In triangle $PQR$, $P = 180^\\circ - 90^\\circ - ' . $q . '^\\circ = ' . $p . '^\\circ$.', 'Similar triangles have equal corresponding angles, so $S = P = ' . $p . '^\\circ$.'],
                'Which angle of $PQR$ matches $S$?', 60, 'concept'); },
    ],
    'MC-049' => [
        static function (MlbRng $r) { $n = $r->int(3, 12); $u = 500 * $r->int(2, 12); $off = 500 * $r->int(1, intdiv($n * $u, 500) - 1); $paid = $n * $u - $off;
            return mlb_sat_in('num', 'Nasir bought ' . $n . ' identical storage bins. He used a coupon for ₦' . mlb_p($off) . ' off the whole purchase, and paid ₦' . mlb_p($paid) . '. What was the original price, in naira, of ONE bin?', (string)$u,
                ['Before the coupon the bins cost $' . $paid . ' + ' . $off . ' = ' . ($paid + $off) . '$ naira.', 'One bin: $' . ($n * $u) . ' \\div ' . $n . ' = ' . $u . '$.'],
                'Undo the coupon first, then share between the bins.', 75, 'application', ['unit' => '₦']); },
    ],
    'MC-050' => [
        static function (MlbRng $r) { [$who, $u, $what, $fix] = $r->pick([['A plumber', 'hour', 'h', 'call-out fee'], ['A taxi', 'kilometre', 'k', 'starting charge'], ['A printer', 'page', 'p', 'set-up fee'], ['A gym', 'month', 'm', 'joining fee']]); $a = 50 * $r->int(2, 20); $b = 100 * $r->int(2, 30);
            return mlb_sat($r, $who . ' charges according to $C = ' . $a . $what . ' + ' . $b . '$, where $C$ is the cost in naira and $' . $what . '$ is the number of ' . $u . 's. What does ' . $a . ' represent?', 'The cost of each additional ' . $u,
                [['The ' . $fix, 'That is ' . $b . ', the part paid even when $' . $what . ' = 0$.'], ['The total cost', 'The total is $C$; ' . $a . ' is multiplied by $' . $what . '$, so it changes with each ' . $u . '.'], ['The number of ' . $u . 's', 'That is $' . $what . '$ itself.']],
                ['In $C = ' . $a . $what . ' + ' . $b . '$, each extra ' . $u . ' adds ' . $a . ' to $C$.', 'So ' . $a . ' is the cost per ' . $u . ' (the rate), and ' . $b . ' is the ' . $fix . '.'],
                'What changes when $' . $what . '$ goes up by 1?', 60, 'concept'); },
    ],
    'MC-030' => [
        static function (MlbRng $r) { [$p, $q] = $r->pick([[20, 25], [25, 20], [10, 10], [50, 20], [20, 10], [40, 25], [25, 40], [30, 20]]); $net = ((100 + $p) * (100 - $q)) / 100 - 100;
            return mlb_sat_in('num', 'A price rises by ' . $p . '% and then falls by ' . $q . '%. By what percentage has it changed overall? (Use a negative number for a decrease.)', mlb_dec($net),
                ['Multiply by the factors: $' . mlb_dec(1 + $p / 100) . ' \\times ' . mlb_dec(1 - $q / 100) . ' = ' . mlb_dec((1 + $p / 100) * (1 - $q / 100)) . '$.', 'That is a change of $' . mlb_dec($net) . '\\%$ — not $' . ($p - $q) . '\\%$: the second change is a percentage of the NEW price.'],
                'Percentages of a changing amount multiply, they do not add.'); },
    ],
    'MC-053' => [
        static function (MlbRng $r) { $a = 200 * $r->int(2, 6); $b = 100 * $r->int(1, 3); $x = $r->int(5, 30); $y = $r->int(5, 30);
            return mlb_sat_in('num', 'A shop sells exercise books at ₦' . $a . ' each and pencils at ₦' . $b . ' each. One morning it sold ' . ($x + $y) . ' items for ₦' . mlb_p($a * $x + $b * $y) . '. How many exercise books did it sell?', (string)$x,
                ['$e + p = ' . ($x + $y) . '$ and $' . $a . 'e + ' . $b . 'p = ' . ($a * $x + $b * $y) . '$.', 'Substitute $p = ' . ($x + $y) . ' - e$: $' . ($a - $b) . 'e = ' . (($a * $x + $b * $y) - $b * ($x + $y)) . '$, so $e = ' . $x . '$.'],
                'One equation counts items, the other counts money.', 120); },
    ],
    'MC-063' => [
        static function (MlbRng $r) { $P = 100 * $r->int(2, 20); $g = $r->pick([2, 3, 4, 5, 8]); $dec = $r->int(0, 2) === 0; $f = $dec ? 1 - $g / 100 : 1 + $g / 100;
            return mlb_sat($r, 'A town’s population $t$ years from now is modelled by $P = ' . $P . '(' . mlb_dec($f) . ')^t$. What does ' . mlb_dec($f) . ' tell you?', 'The population ' . ($dec ? 'falls' : 'grows') . ' by ' . $g . '% each year',
                [['The population ' . ($dec ? 'falls' : 'grows') . ' by ' . mlb_dec($f) . ' people each year', 'A multiplier is a percentage change, not a number of people.'], ['The population ' . ($dec ? 'grows' : 'falls') . ' by ' . $g . '% each year', mlb_dec($f) . ($dec ? ' is less than 1, so it shrinks.' : ' is more than 1, so it grows.')], ['The population is ' . $P . ' after one year', $P . ' is the population NOW, when $t = 0$.']],
                ['Each year the population is multiplied by ' . mlb_dec($f) . '.', 'Multiplying by ' . mlb_dec($f) . ' is ' . ($dec ? 'losing' : 'adding') . ' ' . $g . '% of the current value.'],
                'What does multiplying by ' . mlb_dec($f) . ' do?', 60, 'concept'); },
    ],
    'MC-094' => [
        static function (MlbRng $r) { $a = $r->nz(-5, 6); $b = $r->int(-9, 9); $k = $r->nz(-4, 5); $v = $a * $k + $b; $m = $r->nz(-4, 6);
            return mlb_sat_in('num', 'For a linear function $f$, $f(0) = ' . $b . '$ and $f(' . $k . ') = ' . $v . '$. What is $f(' . $m . ')$?', (string)($a * $m + $b),
                ['$f(x) = ax + ' . $b . '$, and $f(' . $k . ') = ' . $v . '$ gives $a = \\frac{' . ($v - $b) . '}{' . $k . '} = ' . $a . '$.', '$f(' . $m . ') = ' . $a . ' \\times ' . ($m < 0 ? '(' . $m . ')' : $m) . mlb_sterm($b) . ' = ' . ($a * $m + $b) . '$.'],
                '$f(0)$ is the intercept.'); },
        static function (MlbRng $r) { $a = $r->nz(-5, 6); $b = $r->int(-9, 30); $rows = [[0, $b], [1, $a + $b], [2, 2 * $a + $b]];
            return mlb_sat($r, 'For the linear function $f$, $f(0) = ' . $b . '$, $f(1) = ' . ($a + $b) . '$ and $f(2) = ' . (2 * $a + $b) . '$. Which equation defines $f(x)$?', '$f(x) = ' . mlb_lterm($a, 'x') . mlb_sterm($b) . '$',
                [['$f(x) = ' . mlb_lterm($b, 'x') . mlb_sterm($a + $b) . '$', 'The slope is the CHANGE in $f(x)$ per step, $' . $a . '$, not a value from the table.'], ['$f(x) = ' . mlb_lterm($a + $b, 'x') . mlb_sterm($b) . '$', 'The slope is $f(1) - f(0) = ' . $a . '$.'], ['$f(x) = ' . mlb_lterm($b, 'x') . mlb_sterm($a) . '$', 'Slope and intercept have swapped.'], ['$f(x) = ' . mlb_lterm(-$a, 'x') . mlb_sterm($b) . '$', 'Check the direction: $f$ goes from ' . $b . ' to ' . ($a + $b) . '.'], ['$f(x) = ' . mlb_lterm($a, 'x') . mlb_sterm($a + $b) . '$', 'The intercept is $f(0)$, not $f(1)$.']],
                ['The intercept is $f(0) = ' . $b . '$.', 'Each step of 1 in $x$ changes $f(x)$ by $' . $a . '$, so $f(x) = ' . mlb_lterm($a, 'x') . mlb_sterm($b) . '$.'],
                'Read the intercept at $x = 0$, then the change per step.', 60, 'concept'); },
    ],
    'MC-147' => [
        static function (MlbRng $r) { $h = $r->int(-6, 6); $k = $r->int(-6, 6); $R = $r->int(2, 9); $c = $h * $h + $k * $k - $R * $R;
            return mlb_sat_in('num', 'The circle $x^2 + y^2' . mlb_sterm(-2 * $h, 'x') . mlb_sterm(-2 * $k, 'y') . mlb_sterm($c) . ' = 0$ has what radius?', (string)$R,
                ['Complete the square: $(x' . mlb_sterm(-$h) . ')^2 + (y' . mlb_sterm(-$k) . ')^2 = ' . ($h * $h) . ' + ' . ($k * $k) . mlb_sterm(-$c) . ' = ' . ($R * $R) . '$.', 'So the radius is $\\sqrt{' . ($R * $R) . '} = ' . $R . '$.'],
                'Complete the square in $x$ and in $y$.', 120); },
    ],
    'MC-111' => [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $f = $r->pick(['sin', 'cos']);
            return mlb_sat_in('frac', 'In right triangle $ABC$, angle $C$ is $90^\\circ$ and $\\' . $f . ' A = \\frac{' . $a . '}{' . $c . '}$. What is $\\' . ($f === 'sin' ? 'cos' : 'sin') . ' B$?', $a . '/' . $c,
                ['$A$ and $B$ add to $90^\\circ$, so the side opposite $A$ is the side adjacent to $B$.', 'So $\\' . ($f === 'sin' ? 'cos' : 'sin') . ' B = \\' . $f . ' A = \\frac{' . $a . '}{' . $c . '}$.'],
                'Complementary angles swap sine and cosine.', 75, 'concept'); },
    ],
    'MC-104' => [
        static function (MlbRng $r) { $a = $r->int(2, 6); $b = $r->nz(-15, 15); $c = $r->nz(-9, 9);
            return mlb_sat_in('frac', 'What is the sum of the solutions of $' . $a . 'x^2' . mlb_sterm($b, 'x') . mlb_sterm($c) . ' = 0$?', mlb_frac(-$b, $a),
                ['For $ax^2 + bx + c = 0$, the solutions add to $-\\frac{b}{a}$ (whether or not they are whole numbers).', '$-\\frac{' . $b . '}{' . $a . '} = ' . mlb_ftex(-$b, $a) . '$.'],
                'No need to solve it.'); },
    ],
    'MC-098' => [
        static function (MlbRng $r) { $a = $r->int(1, 4) * $r->pick([1, -1]); $h = $r->int(-5, 5); $k = $r->int(-9, 9); $what = $a > 0 ? 'minimum' : 'maximum';
            return mlb_sat($r, 'The graph of $y = ' . ($a === 1 ? '' : ($a === -1 ? '-' : (string)$a)) . '(x' . mlb_sterm(-$h) . ')^2' . mlb_sterm($k) . '$ has a ' . $what . ' point. What are its coordinates?', '$(' . $h . ', ' . $k . ')$',
                [['$(' . (-$h) . ', ' . $k . ')$', 'Inside the bracket the sign flips: $(x' . mlb_sterm(-$h) . ')$ is zero when $x = ' . $h . '$.'], ['$(' . $k . ', ' . $h . ')$', 'The coordinates have swapped.'], ['$(' . $h . ', ' . ($k + $a) . ')$', 'At the vertex the bracket is 0, so $y = ' . $k . '$.'], ['$(' . (-$h) . ', ' . (-$k) . ')$', 'Only the $x$-coordinate’s sign flips inside the bracket.'], ['$(0, ' . ($a * $h * $h + $k) . ')$', 'That is where the graph crosses the $y$-axis.'], ['$(' . ($h + 1) . ', ' . $k . ')$', 'The bracket $(x' . mlb_sterm(-$h) . ')$ is zero at $x = ' . $h . '$.']],
                ['$(x' . mlb_sterm(-$h) . ')^2$ is smallest (zero) when $x = ' . $h . '$.', 'Then $y = ' . $k . '$, so the ' . $what . ' point is $(' . $h . ', ' . $k . ')$.'],
                'When is the squared bracket zero?', 60, 'concept'); },
    ],
    'MC-032' => [
        static function (MlbRng $r) { $l = $r->int(4, 12); $km = $l * $r->int(9, 16); $d = $r->int(2, 9) * 50; $need = $d * $l / $km;
            return mlb_sat_in('num', 'A car travels ' . $km . ' km on ' . $l . ' litres of petrol. At the same rate, how many litres does it need for ' . $d . ' km? (Give your answer to 1 decimal place.)', mlb_rd($need, 1),
                ['Its rate is $\\frac{' . $km . '}{' . $l . '} = ' . mlb_dec(round($km / $l, 4)) . '$ km per litre.', '$' . $d . ' \\div ' . mlb_dec(round($km / $l, 4)) . ' = ' . mlb_rd($need, 1) . '$ litres.'],
                'Find the rate per litre first.', 75, 'application', ['dp' => 1, 'unit' => 'litres']); },
    ],
    'MC-052' => [
        static function (MlbRng $r) { $N = 500 * $r->int(4, 20); $k = 50 * $r->int(2, 10); $m = 100 * $r->int(1, 5); $days = (int)floor(($N - $m) / $k);
            return mlb_sat_in('num', 'Ada has ₦' . mlb_p($N) . ' and spends ₦' . $k . ' every day. She wants at least ₦' . $m . ' left. What is the greatest number of days she can keep spending?', (string)$days,
                ['$' . $N . ' - ' . $k . 'd \\ge ' . $m . '$, so $' . $k . 'd \\le ' . ($N - $m) . '$ and $d \\le ' . mlb_dec(round(($N - $m) / $k, 3)) . '$.', 'Days are whole, so the greatest is ' . $days . '.'],
                'Write an inequality.'); },
    ],
    ];
}
