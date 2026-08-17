<?php
declare(strict_types=1);

/**
 * Math Lab — a level ladder from JSS number work to Further Maths.
 *
 * WHY GENERATED RATHER THAN A TYPED-OUT BANK.
 *
 * The obvious way to build this is to sit down and type five hundred past
 * questions with their answers. The problem is the failure mode: a
 * plausible-looking question with a mistyped key marks a child WRONG for being
 * right, silently, for as long as the question exists. Five hundred typed
 * answers is five hundred chances of that, and no test can catch it because the
 * test would be reading the same typed key.
 *
 * So each level is a set of generators modelled on the FORMS that actually
 * appear in WAEC, NECO and JAMB papers and in New General Mathematics — the
 * shapes a Nigerian student will recognise — with the answer DERIVED from the
 * same parameters that built the question. Every answer is therefore correct by
 * construction, the supply is unlimited so a keen student cannot exhaust it,
 * and the test suite re-derives every answer independently.
 *
 * Curated questions can be added later where a form genuinely cannot be
 * generated; nothing here prevents it.
 *
 * The ladder follows the Nigerian sequence rather than a generic one: number
 * and numeration, algebraic processes, indices and logarithms, surds, then the
 * senior-secondary topics, and finally the Further Maths papers.
 *
 * Server-authoritative like the rest of the arcade: the client is sent the
 * questions and never the answers.
 */

const MATHLAB_PASS_PCT = 70;      // what clears a level and unlocks the next
const MATHLAB_ROUND_TTL_DAYS = 7;

/**
 * The ladder. `band` is what a student would call the stage they are at.
 *
 * Levels are ordered by the curriculum, not by difficulty-as-guessed: a student
 * meets surds after indices because that is the order they are taught, and a
 * ladder that disagrees with the classroom is a ladder that feels arbitrary.
 */
function mathlab_levels(): array {
    return [
        1  => ['level' => 1,  'name' => 'Number & Numeration', 'band' => 'JSS 1–2', 'icon' => '①',
               'blurb' => 'Factors, multiples, fractions, percentages and sharing in a ratio.',
               'questions' => 12, 'seconds' => 300],
        2  => ['level' => 2,  'name' => 'Algebraic Processes', 'band' => 'JSS 3', 'icon' => '②',
               'blurb' => 'Expanding, factorising, solving and changing the subject.',
               'questions' => 12, 'seconds' => 330],
        3  => ['level' => 3,  'name' => 'Indices & Logarithms', 'band' => 'SSS 1', 'icon' => '③',
               'blurb' => 'The laws of indices, and logarithms as their mirror.',
               'questions' => 12, 'seconds' => 330],
        4  => ['level' => 4,  'name' => 'Surds', 'band' => 'SSS 1–2', 'icon' => '④',
               'blurb' => 'Simplifying, and rationalising a denominator.',
               'questions' => 10, 'seconds' => 330],
        5  => ['level' => 5,  'name' => 'Quadratic Equations', 'band' => 'SSS 2', 'icon' => '⑤',
               'blurb' => 'Roots, the discriminant, and the sum and product of roots.',
               'questions' => 12, 'seconds' => 360],
        6  => ['level' => 6,  'name' => 'Sequences & Series', 'band' => 'SSS 2', 'icon' => '⑥',
               'blurb' => 'A.P. and G.P. — nth terms, sums, and a sum to infinity.',
               'questions' => 12, 'seconds' => 360],
        7  => ['level' => 7,  'name' => 'Trigonometry', 'band' => 'SSS 2–3', 'icon' => '⑦',
               'blurb' => 'Exact ratios, the sine and cosine rules, and simple equations.',
               'questions' => 10, 'seconds' => 360],
        8  => ['level' => 8,  'name' => 'Binomial & Counting', 'band' => 'Further Maths', 'icon' => '⑧',
               'blurb' => 'Permutations, combinations and the binomial expansion.',
               'questions' => 10, 'seconds' => 360],
        9  => ['level' => 9,  'name' => 'Matrices', 'band' => 'Further Maths', 'icon' => '⑨',
               'blurb' => 'Determinants, inverses and multiplication.',
               'questions' => 10, 'seconds' => 360],
        10 => ['level' => 10, 'name' => 'Differentiation', 'band' => 'Further Maths / A-level', 'icon' => '⑩',
               'blurb' => 'Gradients, turning points, and the product and quotient rules.',
               'questions' => 10, 'seconds' => 420],
        11 => ['level' => 11, 'name' => 'Integration', 'band' => 'Further Maths / A-level', 'icon' => '⑪',
               'blurb' => 'Definite integrals and the area under a curve.',
               'questions' => 10, 'seconds' => 420],
        12 => ['level' => 12, 'name' => 'Coordinate Geometry & Vectors', 'band' => 'Further Maths / A-level', 'icon' => '⑫',
               'blurb' => 'Lines, distances, magnitudes and the scalar product.',
               'questions' => 10, 'seconds' => 420],
    ];
}

function mathlab_level(int $n): ?array { return mathlab_levels()[$n] ?? null; }

/* ── Small helpers ────────────────────────────────────────────────────── */

function mathlab_gcd(int $a, int $b): int { $a = abs($a); $b = abs($b); while ($b) { [$a, $b] = [$b, $a % $b]; } return max(1, $a); }
function mathlab_lcm(int $a, int $b): int { return intdiv(abs($a * $b), mathlab_gcd($a, $b)); }
function mathlab_fact(int $n): int { $r = 1; for ($i = 2; $i <= $n; $i++) $r *= $i; return $r; }
function mathlab_ncr(int $n, int $r): int { if ($r < 0 || $r > $n) return 0; return intdiv(mathlab_fact($n), mathlab_fact($r) * mathlab_fact($n - $r)); }
function mathlab_npr(int $n, int $r): int { if ($r < 0 || $r > $n) return 0; return intdiv(mathlab_fact($n), mathlab_fact($n - $r)); }
/** A signed term like "+ 3x" / "- x" / "" — so a generated expression reads the
 *  way a textbook prints it rather than "+ -3x". */
function mathlab_term(int $c, string $var): string {
    if ($c === 0) return '';
    $sign = $c > 0 ? ' + ' : ' − ';
    $mag = abs($c);
    $body = $var === '' ? (string)$mag : (($mag === 1 ? '' : (string)$mag) . $var);
    return $sign . $body;
}
/** A non-zero integer in a range — for places where 0 would print a factor as
 *  a bare "(x)" and read like a typo rather than a question. */
function mathlab_nz(int $lo, int $hi): int {
    do { $v = random_int($lo, $hi); } while ($v === 0);
    return $v;
}
/** A 2-D vector in the ai + bj form a textbook prints. */
function mathlab_vec(int $a, int $b): string {
    $i = ($a === 1 ? '' : ($a === -1 ? '−' : ($a < 0 ? '−' . abs($a) : (string)$a))) . 'i';
    return $i . ($b === 0 ? ' + 0j' : mathlab_term($b, 'j'));
}
function mathlab_poly(array $coeffs, string $var = 'x'): string {
    // coeffs highest power first
    $n = count($coeffs) - 1; $out = '';
    foreach ($coeffs as $i => $c) {
        $pow = $n - $i;
        if ($c === 0) continue;
        $v = $pow === 0 ? '' : ($pow === 1 ? $var : $var . '^' . $pow);
        if ($out === '') {
            // Leading term: a bare "−" for a coefficient of −1, and the typeset
            // minus everywhere else so one expression doesn't mix two dashes.
            $sign = $c < 0 ? '−' : '';
            $mag = (abs($c) === 1 && $v !== '') ? '' : (string)abs($c);
            $out = $sign . $mag . $v;
        } else {
            $out .= mathlab_term($c, $v);
        }
    }
    return $out === '' ? '0' : $out;
}

/* ── The generators, level by level ──────────────────────────────────────
 *
 * Each returns [questionText, answerString]. Answers are numeric wherever the
 * form allows, because a number can be marked without a human and without
 * ambiguity about how a student chose to write an expression.
 */

function mathlab_q_numeration(): array {
    switch (random_int(1, 6)) {
        case 1: { $a = random_int(6, 40); $b = random_int(6, 40);
            return ['Find the L.C.M. of ' . $a . ' and ' . $b . '.', (string)mathlab_lcm($a, $b)]; }
        case 2: { $a = random_int(12, 90); $b = random_int(12, 90);
            return ['Find the H.C.F. of ' . $a . ' and ' . $b . '.', (string)mathlab_gcd($a, $b)]; }
        case 3: { $pct = [5, 10, 12, 15, 20, 25, 40, 75][random_int(0, 7)]; $of = random_int(2, 40) * 100;
            return ['What is ' . $pct . '% of ₦' . number_format($of) . '?', (string)intdiv($of * $pct, 100)]; }
        case 4: { // Sharing in a ratio — the classic WAEC form.
            $r1 = random_int(1, 6); $r2 = random_int(1, 6); $r3 = random_int(1, 6);
            $unit = random_int(2, 30) * 100; $total = ($r1 + $r2 + $r3) * $unit;
            return ['₦' . number_format($total) . ' is shared among Ada, Bola and Chidi in the ratio '
                . $r1 . ':' . $r2 . ':' . $r3 . '. How much does Bola get, in naira?', (string)($r2 * $unit)]; }
        case 5: { // Fraction of a quantity.
            $den = [2, 3, 4, 5, 6, 8][random_int(0, 5)]; $num = random_int(1, $den - 1);
            $q = random_int(2, 30) * $den;
            return [$num . '/' . $den . ' of ' . $q . ' is what number?', (string)intdiv($q * $num, $den)]; }
        default: { // Simple interest — everywhere in the Nigerian syllabus.
            $p = random_int(2, 40) * 1000; $r = random_int(2, 12); $t = random_int(1, 5);
            return ['Find the simple interest on ₦' . number_format($p) . ' for ' . $t
                . ' year' . ($t === 1 ? '' : 's') . ' at ' . $r . '% per annum.',
                (string)intdiv($p * $r * $t, 100)]; }
    }
}

function mathlab_q_algebra(): array {
    switch (random_int(1, 5)) {
        case 1: { // Solve ax + b = c
            $a = random_int(2, 9); $x = random_int(-9, 9); $b = random_int(-20, 20);
            return ['Solve for x:  ' . $a . 'x' . mathlab_term($b, '') . ' = ' . ($a * $x + $b), (string)$x]; }
        case 2: { // Coefficient of x in (x+a)(x+b)
            $a = mathlab_nz(-9, 9); $b = mathlab_nz(-9, 9);   // 0 would print a bare "(x)"
            return ['Expand (x' . mathlab_term($a, '') . ')(x' . mathlab_term($b, '')
                . '). What is the coefficient of x?', (string)($a + $b)]; }
        case 3: { // Evaluate a polynomial
            $a = random_int(1, 5); $b = random_int(-8, 8); $c = random_int(-12, 12); $x = random_int(-5, 5);
            return ['If f(x) = ' . mathlab_poly([$a, $b, $c]) . ', find f(' . $x . ').',
                (string)($a * $x * $x + $b * $x + $c)]; }
        case 4: { // Simultaneous equations
            $x = random_int(-8, 8); $y = random_int(-8, 8);
            $a1 = random_int(1, 6); $b1 = random_int(1, 6); $a2 = random_int(1, 6); $b2 = random_int(1, 6);
            if ($a1 * $b2 === $a2 * $b1) $b2++;   // keep them independent
            // A coefficient of 1 is written as nothing at all — "x + y", never
            // "1x + 1y", which no textbook prints and no teacher would accept.
            $co = fn(int $c, string $v) => ($c === 1 ? '' : (string)$c) . $v;
            return ['Solve: ' . $co($a1, 'x') . ' + ' . $co($b1, 'y') . ' = ' . ($a1 * $x + $b1 * $y)
                . ' and ' . $co($a2, 'x') . ' + ' . $co($b2, 'y') . ' = ' . ($a2 * $x + $b2 * $y)
                . '. What is x?', (string)$x]; }
        default: { // Change of subject, evaluated
            $m = random_int(2, 9); $c = random_int(-15, 15); $y = random_int(-20, 20) * $m + $c;
            return ['If y = ' . $m . 'x' . mathlab_term($c, '') . ' and y = ' . $y . ', find x.',
                (string)intdiv($y - $c, $m)]; }
    }
}

function mathlab_q_indices(): array {
    switch (random_int(1, 5)) {
        case 1: { $b = [2, 3, 5][random_int(0, 2)]; $m = random_int(2, 6); $n = random_int(1, 4);
            return ['Simplify ' . $b . '^' . $m . ' × ' . $b . '^' . $n . ', giving your answer as a number.',
                (string)($b ** ($m + $n))]; }
        case 2: { $b = [2, 3, 5][random_int(0, 2)]; $m = random_int(4, 9); $n = random_int(1, 3);
            return ['Simplify ' . $b . '^' . $m . ' ÷ ' . $b . '^' . $n . ', giving your answer as a number.',
                (string)($b ** ($m - $n))]; }
        case 3: { $b = [2, 3, 5, 10][random_int(0, 3)]; $n = random_int(2, 5);
            return ['Evaluate log' . $b . ' of ' . ($b ** $n) . '.', (string)$n]; }
        case 4: { // The addition law — log m + log n = log mn, kept whole so the
                  // answer is a number a student can type and a machine can mark.
            $b = [2, 3, 5, 10][random_int(0, 3)]; $p = random_int(1, 3); $q = random_int(1, 3);
            return ['Evaluate log' . $b . ' ' . ($b ** $p) . ' + log' . $b . ' ' . ($b ** $q)
                . '.  (Use log m + log n = log mn.)', (string)($p + $q)]; }
        default: { // Fractional index
            $r = random_int(2, 9);
            return ['Evaluate ' . ($r * $r) . '^(1/2).', (string)$r]; }
    }
}

function mathlab_q_surds(): array {
    switch (random_int(1, 4)) {
        case 1: { $k = random_int(2, 9); $n = [2, 3, 5, 6, 7][random_int(0, 4)];
            return ['Simplify √' . ($k * $k * $n) . ' in the form a√' . $n . '. What is a?', (string)$k]; }
        case 2: { $a = random_int(2, 9); $b = random_int(2, 9); $n = [2, 3, 5][random_int(0, 2)];
            return [$a . '√' . $n . ' + ' . $b . '√' . $n . ' = k√' . $n . '. What is k?', (string)($a + $b)]; }
        case 3: { $n = [2, 3, 5, 7][random_int(0, 3)]; $k = random_int(2, 9);
            // Rationalising k/√n gives (k√n)/n — the numerator's coefficient is k.
            return ['Rationalise ' . ($k * $n) . '/√' . $n . '. The answer is a√' . $n . '. What is a?', (string)$k]; }
        default: { $n = [2, 3, 5][random_int(0, 2)];
            return ['(√' . $n . ')² = ?', (string)$n]; }
    }
}

function mathlab_q_quadratic(): array {
    $p = random_int(-9, 9); $q = random_int(-9, 9);      // roots
    switch (random_int(1, 4)) {
        case 1: return ['The roots of x² ' . mathlab_term(-($p + $q), 'x') . mathlab_term($p * $q, '')
            . ' = 0 are ' . $p . ' and k. What is k?', (string)$q];
        case 2: { $a = random_int(1, 4); $b = random_int(-12, 12); $c = random_int(-12, 12);
            return ['For ' . mathlab_poly([$a, $b, $c]) . ' = 0, find the discriminant b² − 4ac.',
                (string)($b * $b - 4 * $a * $c)]; }
        case 3: { $a = random_int(1, 5); $c = random_int(-15, 15);
            // Sum of roots = -b/a. b is built as a multiple of a so the answer
            // is a whole number rather than a fraction typed three ways.
            $s = random_int(-6, 6); $b = -$a * $s;
            return ['If α and β are the roots of ' . mathlab_poly([$a, $b, $c]) . ' = 0, find α + β.',
                (string)$s]; }
        default: { $a = random_int(1, 5); $c = $a * random_int(-8, 8);
            return ['If α and β are the roots of ' . mathlab_poly([$a, random_int(-9, 9), $c])
                . ' = 0, find αβ.', (string)intdiv($c, $a)]; }
    }
}

function mathlab_q_sequences(): array {
    switch (random_int(1, 5)) {
        case 1: { $a = random_int(-10, 15); $d = random_int(2, 9); $n = random_int(5, 20);
            return ['The first term of an A.P. is ' . $a . ' and the common difference is ' . $d
                . '. Find the ' . $n . 'th term.', (string)($a + ($n - 1) * $d)]; }
        case 2: { $a = random_int(1, 12); $d = random_int(1, 8); $n = random_int(5, 15);
            return ['Find the sum of the first ' . $n . ' terms of an A.P. whose first term is '
                . $a . ' and common difference ' . $d . '.',
                (string)intdiv($n * (2 * $a + ($n - 1) * $d), 2)]; }
        case 3: { $a = random_int(1, 6); $r = random_int(2, 4); $n = random_int(3, 7);
            return ['The first term of a G.P. is ' . $a . ' and the common ratio is ' . $r
                . '. Find the ' . $n . 'th term.', (string)($a * ($r ** ($n - 1)))]; }
        case 4: { $a = random_int(1, 6); $r = random_int(2, 3); $n = random_int(3, 7);
            return ['Find the sum of the first ' . $n . ' terms of a G.P. with first term '
                . $a . ' and common ratio ' . $r . '.',
                (string)intdiv($a * (($r ** $n) - 1), $r - 1)]; }
        default: { // Sum to infinity, kept whole: a/(1-r) with r = 1/k
            $k = random_int(2, 5); $a = random_int(1, 9) * ($k - 1);
            return ['Find the sum to infinity of a G.P. whose first term is ' . $a
                . ' and common ratio is 1/' . $k . '.', (string)intdiv($a * $k, $k - 1)]; }
    }
}

function mathlab_q_trig(): array {
    switch (random_int(1, 4)) {
        case 1: { $vals = ['sin 30' => '0.5', 'cos 60' => '0.5', 'tan 45' => '1', 'sin 90' => '1',
                           'cos 0' => '1', 'sin 0' => '0', 'cos 90' => '0', 'tan 0' => '0'];
            $k = array_rand($vals);
            return ['Evaluate ' . $k . '°.', (string)$vals[$k]]; }
        case 2: { // Pythagorean identity as a number
            return ['Simplify sin²θ + cos²θ.', '1']; }
        case 3: { // Right-angled triangle — a 3/4/5 family, so the answer is whole
            $k = random_int(1, 6); $t = [[3,4,5],[6,8,10],[5,12,13],[8,15,17]][random_int(0, 3)];
            return ['A right-angled triangle has sides ' . ($t[0] * $k) . ' cm and ' . ($t[1] * $k)
                . ' cm about the right angle. Find the hypotenuse, in cm.', (string)($t[2] * $k)]; }
        default: { // Cosine rule with a 120° angle — cos 120 = -1/2, so it stays whole
            $b = random_int(2, 9); $c = random_int(2, 9);
            $a2 = $b * $b + $c * $c + $b * $c;
            return ['In triangle ABC, b = ' . $b . ', c = ' . $c . ' and A = 120°. '
                . 'Using a² = b² + c² − 2bc·cos A, find a².', (string)$a2]; }
    }
}

function mathlab_q_binomial(): array {
    switch (random_int(1, 4)) {
        case 1: { $n = random_int(4, 10); $r = random_int(1, min(4, $n - 1));
            return ['Evaluate ' . $n . 'C' . $r . '.', (string)mathlab_ncr($n, $r)]; }
        case 2: { $n = random_int(4, 8); $r = random_int(1, 3);
            return ['Evaluate ' . $n . 'P' . $r . '.', (string)mathlab_npr($n, $r)]; }
        case 3: { $n = random_int(4, 8); $r = random_int(1, min(4, $n - 1));
            return ['In the expansion of (1 + x)^' . $n . ', find the coefficient of x^' . $r . '.',
                (string)mathlab_ncr($n, $r)]; }
        default: { $n = random_int(3, 7); $a = random_int(2, 3); $r = random_int(1, min(3, $n - 1));
            // Coefficient of x^r in (1 + ax)^n is nCr · a^r
            return ['In the expansion of (1 + ' . $a . 'x)^' . $n . ', find the coefficient of x^' . $r . '.',
                (string)(mathlab_ncr($n, $r) * ($a ** $r))]; }
    }
}

function mathlab_q_matrices(): array {
    $a = random_int(-6, 9); $b = random_int(-6, 9); $c = random_int(-6, 9); $d = random_int(-6, 9);
    $m = '(' . $a . ' ' . $b . ' ; ' . $c . ' ' . $d . ')';
    switch (random_int(1, 3)) {
        case 1: return ['Find the determinant of the 2×2 matrix ' . $m
            . ', where the rows are separated by a semicolon.', (string)($a * $d - $b * $c)];
        case 2: { $e = random_int(-5, 8); $f = random_int(-5, 8);
            // First entry of the product with a column vector.
            return ['Multiply the matrix ' . $m . ' by the column vector (' . $e . ' ; ' . $f
                . '). What is the FIRST entry of the result?', (string)($a * $e + $b * $f)]; }
        default: { // A singular matrix would make the preamble read as a trick,
                   // so a is forced non-zero and then a bump to d always moves
                   // the determinant off zero (it changes it by exactly a).
            if ($a === 0) $a = random_int(1, 9);
            $det = $a * $d - $b * $c;
            if ($det === 0) { $d = $d + 1; $det = $a * $d - $b * $c; }
            $m = '(' . $a . ' ' . $b . ' ; ' . $c . ' ' . $d . ')';
            return ['A 2×2 matrix has an inverse only when its determinant is not zero. '
                . 'For ' . $m . ', state the determinant.', (string)$det]; }
    }
}

function mathlab_q_differentiation(): array {
    switch (random_int(1, 4)) {
        case 1: { $a = random_int(1, 6); $b = random_int(-8, 8); $c = random_int(-9, 9); $x = random_int(-4, 5);
            // d/dx (ax² + bx + c) = 2ax + b
            return ['If y = ' . mathlab_poly([$a, $b, $c]) . ', find dy/dx at x = ' . $x . '.',
                (string)(2 * $a * $x + $b)]; }
        case 2: { $a = random_int(1, 4); $b = random_int(-6, 6); $c = random_int(-6, 6); $d = random_int(-9, 9);
            $x = random_int(-3, 4);
            // d/dx (ax³ + bx² + cx + d) = 3ax² + 2bx + c
            return ['If y = ' . mathlab_poly([$a, $b, $c, $d]) . ', find dy/dx at x = ' . $x . '.',
                (string)(3 * $a * $x * $x + 2 * $b * $x + $c)]; }
        case 3: { // Turning point of a quadratic: x = -b/2a, kept whole
            $a = random_int(1, 5); $x0 = random_int(-6, 6); $b = -2 * $a * $x0; $c = random_int(-9, 9);
            return ['Find the value of x at the turning point of y = ' . mathlab_poly([$a, $b, $c]) . '.',
                (string)$x0]; }
        default: { // Gradient of a curve = gradient of the tangent
            $a = random_int(1, 5); $b = random_int(-8, 8); $x = random_int(-4, 4);
            return ['Find the gradient of the curve y = ' . mathlab_poly([$a, $b, 0]) . ' at x = ' . $x . '.',
                (string)(2 * $a * $x + $b)]; }
    }
}

function mathlab_q_integration(): array {
    switch (random_int(1, 3)) {
        case 1: { // ∫ (ax + b) dx from 0 to n
            $a = random_int(1, 6) * 2; $b = random_int(-6, 8); $n = random_int(1, 5);
            return ['Evaluate the definite integral of (' . mathlab_poly([$a, $b]) . ') dx from 0 to ' . $n . '.',
                (string)(intdiv($a * $n * $n, 2) + $b * $n)]; }
        case 2: { // ∫ 3x² dx from 0 to n = n³
            $k = random_int(1, 4); $n = random_int(1, 4);
            return ['Evaluate the definite integral of ' . (3 * $k) . 'x² dx from 0 to ' . $n . '.',
                (string)($k * $n * $n * $n)]; }
        default: { // Area under y = 2x between a and b
            $a = random_int(0, 3); $b = $a + random_int(1, 5);
            return ['Find the area under the curve y = 2x between x = ' . $a . ' and x = ' . $b . '.',
                (string)($b * $b - $a * $a)]; }
    }
}

function mathlab_q_coordinate(): array {
    switch (random_int(1, 5)) {
        case 1: { $t = [[3,4,5],[6,8,10],[5,12,13],[8,15,17],[9,12,15]][random_int(0, 4)];
            $x1 = random_int(-6, 6); $y1 = random_int(-6, 6);
            return ['Find the distance between (' . $x1 . ', ' . $y1 . ') and ('
                . ($x1 + $t[0]) . ', ' . ($y1 + $t[1]) . ').', (string)$t[2]]; }
        case 2: { $x1 = random_int(-9, 9) * 2; $x2 = random_int(-9, 9) * 2; $y = random_int(-9, 9) * 2;
            return ['Find the x-coordinate of the midpoint of (' . $x1 . ', ' . $y . ') and ('
                . $x2 . ', ' . $y . ').', (string)intdiv($x1 + $x2, 2)]; }
        case 3: { $m = random_int(-5, 5); $x1 = random_int(-6, 6); $y1 = random_int(-6, 6); $dx = random_int(1, 5);
            return ['Find the gradient of the line joining (' . $x1 . ', ' . $y1 . ') and ('
                . ($x1 + $dx) . ', ' . ($y1 + $m * $dx) . ').', (string)$m]; }
        case 4: { $a = random_int(-6, 8); $b = random_int(-6, 8); $c = random_int(-6, 8); $d = random_int(-6, 8);
            // Printed through mathlab_vec so a negative j-component reads
            // "3i − 6j" and not "3i + -6j".
            return ['Given a = ' . mathlab_vec($a, $b) . ' and b = ' . mathlab_vec($c, $d)
                . ', find the scalar product a·b.', (string)($a * $c + $b * $d)]; }
        default: { $t = [[3,4,5],[6,8,10],[5,12,13]][random_int(0, 2)];
            return ['Find the magnitude of the vector ' . $t[0] . 'i + ' . $t[1] . 'j.', (string)$t[2]]; }
    }
}

/** One question for a level. */
function mathlab_question(int $level): array {
    switch ($level) {
        case 1:  return mathlab_q_numeration();
        case 2:  return mathlab_q_algebra();
        case 3:  return mathlab_q_indices();
        case 4:  return mathlab_q_surds();
        case 5:  return mathlab_q_quadratic();
        case 6:  return mathlab_q_sequences();
        case 7:  return mathlab_q_trig();
        case 8:  return mathlab_q_binomial();
        case 9:  return mathlab_q_matrices();
        case 10: return mathlab_q_differentiation();
        case 11: return mathlab_q_integration();
        default: return mathlab_q_coordinate();
    }
}

/**
 * A full paper for a level.
 *
 * Duplicates are dropped rather than tolerated: the same question twice in a
 * twelve-question paper is a wasted question and reads as a bug.
 */
function mathlab_generate(int $level, int $n): array {
    $qs = []; $keys = []; $seen = [];
    for ($guard = 0; count($qs) < $n && $guard < $n * 12; $guard++) {
        [$text, $ans] = mathlab_question($level);
        if (isset($seen[$text])) continue;
        $seen[$text] = true;
        $qs[] = ['q' => $text];
        $keys[] = (string)$ans;
    }
    // A level with few distinct forms could in principle come up short. Short a
    // question is worse than a repeat, because the paper would then be marked
    // out of a different total than the one the student was promised.
    while (count($qs) < $n) {
        [$text, $ans] = mathlab_question($level);
        $qs[] = ['q' => $text];
        $keys[] = (string)$ans;
    }
    return [$qs, $keys];
}

/* ── Progress and unlocking ───────────────────────────────────────────── */

function mathlab_progress_rows(string $playerId): array {
    $out = [];
    foreach (db_all('SELECT * FROM math_progress WHERE playerId = ?', [$playerId]) as $r) {
        $out[(int)$r['level']] = $r;
    }
    return $out;
}

/**
 * The ladder as this player sees it.
 *
 * Level 1 is always open. Every other level opens when the one below it is
 * cleared — deliberately a chain rather than a total score, so a student cannot
 * skip the ground they need for what comes next. Surds are not harder than
 * indices because somebody decided so; they are built on them.
 */
function mathlab_board(array $p): array {
    $playerId = (string)($p['playerId'] ?? '');
    if ($playerId === '') return ['ok' => false, 'error' => 'forbidden'];
    $done = mathlab_progress_rows($playerId);
    $levels = [];
    $prevCleared = true;
    foreach (mathlab_levels() as $n => $lv) {
        $row = $done[$n] ?? null;
        $cleared = $row && trim((string)$row['clearedAt']) !== '';
        $levels[] = $lv + [
            'unlocked' => $n === 1 ? true : $prevCleared,
            'cleared' => (bool)$cleared,
            'bestScore' => (int)($row['bestScore'] ?? 0),
            'bestCorrect' => (int)($row['bestCorrect'] ?? 0),
            'attempts' => (int)($row['attempts'] ?? 0),
        ];
        $prevCleared = (bool)$cleared;
    }
    $clearedCount = count(array_filter($levels, fn($l) => $l['cleared']));
    return ['ok' => true, 'levels' => $levels, 'passPct' => MATHLAB_PASS_PCT,
            'cleared' => $clearedCount, 'total' => count($levels)];
}

/* ── Playing ──────────────────────────────────────────────────────────── */

function mathlab_start(array $p): array {
    $playerId = (string)($p['playerId'] ?? '');
    if ($playerId === '') return ['ok' => false, 'error' => 'forbidden'];
    $level = (int)($p['level'] ?? 0);
    $lv = mathlab_level($level);
    if (!$lv) return ['ok' => false, 'error' => 'bad_level'];

    // Locked levels are refused HERE, not merely hidden in the UI.
    $board = mathlab_board(['playerId' => $playerId]);
    $me = null;
    foreach ($board['levels'] as $l) if ((int)$l['level'] === $level) $me = $l;
    if (!$me || empty($me['unlocked'])) return ['ok' => false, 'error' => 'locked'];

    [$qs, $keys] = mathlab_generate($level, (int)$lv['questions']);
    $roundId = 'ML-' . strtoupper(rand_hex(8));
    db_insert('arcade_rounds', [
        'roundId' => $roundId, 'playerId' => $playerId, 'game' => 'mathlab', 'tier' => $level,
        'answerKey' => json_encode($keys, JSON_UNESCAPED_SLASHES),
        'seconds' => (int)$lv['seconds'], 'startedAt' => now_iso(),
        'startedMs' => (int)round(microtime(true) * 1000), 'submittedAt' => '',
    ]);
    return ['ok' => true, 'roundId' => $roundId, 'level' => $level, 'name' => (string)$lv['name'],
            'band' => (string)$lv['band'], 'seconds' => (int)$lv['seconds'], 'questions' => $qs];
}

function mathlab_submit(array $p): array {
    $playerId = (string)($p['playerId'] ?? '');
    $roundId = (string)($p['roundId'] ?? '');
    $r = db_row("SELECT * FROM arcade_rounds WHERE roundId = ? AND game = 'mathlab' LIMIT 1", [$roundId]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['playerId'] !== $playerId) return ['ok' => false, 'error' => 'not_yours'];
    // One shot. Without this, "submit, read the marks, resubmit" is full marks.
    if (trim((string)$r['submittedAt']) !== '') return ['ok' => false, 'error' => 'already_submitted'];

    $keys = json_decode((string)$r['answerKey'], true) ?: [];
    $given = is_array($p['answers'] ?? null) ? $p['answers'] : [];
    $level = (int)$r['tier'];

    $correct = 0; $marks = [];
    foreach ($keys as $i => $want) {
        $got = (string)($given[$i] ?? '');
        $ok = mathlab_matches((string)$want, $got);
        if ($ok) $correct++;
        // The right answer is returned only NOW, with the marking, so a student
        // can learn from the paper they have already handed in.
        $marks[] = ['ok' => $ok, 'your' => $got, 'answer' => (string)$want];
    }
    $total = count($keys);
    $pct = $total > 0 ? (int)round($correct * 100 / $total) : 0;

    // Elapsed comes from the ROW, never from the client.
    $ms = max(0, (int)round(microtime(true) * 1000) - (int)$r['startedMs']);
    $score = $pct;
    $cleared = $pct >= MATHLAB_PASS_PCT;

    db_update('arcade_rounds', ['submittedAt' => now_iso()], ['roundId' => $roundId]);

    $prev = db_row('SELECT * FROM math_progress WHERE playerId = ? AND level = ?', [$playerId, $level]);
    $now = now_iso();
    if ($prev) {
        db_update('math_progress', [
            'bestScore' => max((int)$prev['bestScore'], $score),
            'bestCorrect' => max((int)$prev['bestCorrect'], $correct),
            'attempts' => (int)$prev['attempts'] + 1,
            // Cleared once is cleared: a later poor attempt does not re-lock
            // what a student has already shown they can do.
            'clearedAt' => trim((string)$prev['clearedAt']) !== '' ? (string)$prev['clearedAt'] : ($cleared ? $now : ''),
            'updatedAt' => $now,
        ], ['playerId' => $playerId, 'level' => $level]);
    } else {
        db_insert('math_progress', ['playerId' => $playerId, 'level' => $level,
            'bestScore' => $score, 'bestCorrect' => $correct, 'attempts' => 1,
            'clearedAt' => $cleared ? $now : '', 'updatedAt' => $now]);
    }

    $next = mathlab_level($level + 1);
    return ['ok' => true, 'correct' => $correct, 'total' => $total, 'score' => $score,
            'ms' => $ms, 'passPct' => MATHLAB_PASS_PCT, 'cleared' => $cleared,
            'marks' => $marks,
            'unlocked' => ($cleared && $next) ? ['level' => $level + 1, 'name' => (string)$next['name']] : null];
}

/**
 * Marking.
 *
 * Generous about FORM, strict about VALUE. A student who writes 1,250 or ₦1250
 * or 0.50 has the right answer, and marking them wrong for the separator they
 * were taught teaches them nothing except that the machine is arbitrary.
 */
function mathlab_matches(string $want, string $got): bool {
    $norm = function (string $s): string {
        $s = trim(mb_strtolower($s));
        $s = str_replace(['₦', ',', ' ', '−'], ['', '', '', '-'], $s);
        return $s;
    };
    $w = $norm($want); $g = $norm($got);
    if ($g === '') return false;
    if ($w === $g) return true;
    // Numerically equal is equal: 0.5 and .5 and 0.50 are one answer.
    if (is_numeric($w) && is_numeric($g)) return abs((float)$w - (float)$g) < 1e-9;
    return false;
}

/** Prune graded and abandoned papers, like the arcade does. */
function mathlab_prune(): void {
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - MATHLAB_ROUND_TTL_DAYS * 86400);
    db_exec("DELETE FROM arcade_rounds WHERE game = 'mathlab' AND startedAt < ?", [$cut]);
}
