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
 * The ladder — a MAP, not a rope.
 *
 * It was one chain of twelve: level n opened when level n−1 was cleared, on
 * the reasoning that "surds are not harder than indices, they are built on
 * them". That reasoning is right about surds and indices and wrong about
 * almost every other consecutive pair. Matrices are not built on
 * trigonometry. Integration is not built on matrices. Yet a Further Maths
 * student who wanted to work on differentiation had to first clear JSS 1–2
 * fractions, JSS 3 algebra, indices, surds, quadratics, sequences,
 * trigonometry, binomial counting and matrices — nine levels of ground they
 * covered years ago — because the chain confused WHAT A TOPIC NEEDS with the
 * order somebody happened to list the topics in.
 *
 * So each level now declares its real prerequisites and the strand it belongs
 * to. Differentiation needs quadratics and sequences, because it needs
 * function manipulation and limits; it does not need matrices, and no longer
 * pretends to. A student can go down the calculus road, or the statistics
 * road, without walking the other one first.
 *
 * `needs` is a list of level numbers, ALL of which must be cleared. An empty
 * list means the level is open from the start — there are four of those, one
 * per road in, rather than a single door everybody queues at.
 *
 * The advanced end is also no longer three topics wide. Statistics and
 * probability were missing entirely, which is indefensible for a WAEC ladder —
 * they are core paper-one material and they were nowhere. Complex numbers,
 * polynomials, binary operations and logic were missing too, and the last two
 * are distinctly Nigerian Further Maths topics that a generic ladder skips.
 */
function mathlab_levels(): array {
    return [
        /* ── Number ─────────────────────────────────────────────────────── */
        1  => ['level' => 1,  'name' => 'Number & Numeration', 'band' => 'JSS 1–2', 'icon' => '①',
               'strand' => 'Number', 'needs' => [],
               'blurb' => 'Factors, multiples, fractions, percentages and sharing in a ratio.', 'formula' => 'a/b + c/d = (ad + bc)/bd',
               'questions' => 12, 'seconds' => 300],
        2  => ['level' => 2,  'name' => 'Sets & Venn Diagrams', 'band' => 'JSS 3 – SSS 1', 'icon' => '②',
               'strand' => 'Number', 'needs' => [1],
               'blurb' => 'Unions, intersections, complements and the two-set formula.', 'formula' => 'n(A∪B) = n(A) + n(B) − n(A∩B)',
               'questions' => 10, 'seconds' => 300],

        /* ── Algebra ────────────────────────────────────────────────────── */
        3  => ['level' => 3,  'name' => 'Algebraic Processes', 'band' => 'JSS 3', 'icon' => '③',
               'strand' => 'Algebra', 'needs' => [],
               'blurb' => 'Expanding, factorising, solving and changing the subject.', 'formula' => 'a² − b² = (a − b)(a + b)',
               'questions' => 12, 'seconds' => 330],
        4  => ['level' => 4,  'name' => 'Indices & Logarithms', 'band' => 'SSS 1', 'icon' => '④',
               'strand' => 'Algebra', 'needs' => [3],
               'blurb' => 'The laws of indices, and logarithms as their mirror.', 'formula' => 'log xy = log x + log y',
               'questions' => 12, 'seconds' => 330],
        5  => ['level' => 5,  'name' => 'Surds', 'band' => 'SSS 1–2', 'icon' => '⑤',
               'strand' => 'Algebra', 'needs' => [4],
               'blurb' => 'Simplifying, and rationalising a denominator.', 'formula' => '1/√a = √a/a',
               'questions' => 10, 'seconds' => 330],
        6  => ['level' => 6,  'name' => 'Quadratic Equations', 'band' => 'SSS 2', 'icon' => '⑥',
               'strand' => 'Algebra', 'needs' => [3],
               'blurb' => 'Roots, the discriminant, and the sum and product of roots.', 'formula' => 'x = (−b ± √(b² − 4ac))/2a',
               'questions' => 12, 'seconds' => 360],
        7  => ['level' => 7,  'name' => 'Polynomials', 'band' => 'Further Maths', 'icon' => '⑦',
               'strand' => 'Algebra', 'needs' => [6],
               'blurb' => 'The remainder and factor theorems, and partial fractions.', 'formula' => 'f(a) = 0 ⇔ (x − a) | f(x)',
               'questions' => 10, 'seconds' => 390],
        8  => ['level' => 8,  'name' => 'Sequences & Series', 'band' => 'SSS 2', 'icon' => '⑧',
               'strand' => 'Algebra', 'needs' => [3],
               'blurb' => 'A.P. and G.P.: nth terms, sums, and a sum to infinity.', 'formula' => 'Sₙ = a(1 − rⁿ)/(1 − r)',
               'questions' => 12, 'seconds' => 360],
        9  => ['level' => 9,  'name' => 'Binary Operations', 'band' => 'Further Maths', 'icon' => '⑨',
               'strand' => 'Algebra', 'needs' => [3],
               'blurb' => 'A rule you are handed: closure, identity and inverse.', 'formula' => 'a ∗ e = e ∗ a = a',
               'questions' => 10, 'seconds' => 360],
        10 => ['level' => 10, 'name' => 'Complex Numbers', 'band' => 'Further Maths', 'icon' => '⑩',
               'strand' => 'Algebra', 'needs' => [5, 6],
               'blurb' => 'i, the conjugate, the modulus, and arithmetic that keeps them apart.', 'formula' => '|z|² = z·z̄',
               'questions' => 10, 'seconds' => 390],

        /* ── Shape & space ──────────────────────────────────────────────── */
        11 => ['level' => 11, 'name' => 'Trigonometry', 'band' => 'SSS 2–3', 'icon' => '⑪',
               'strand' => 'Shape & space', 'needs' => [3],
               'blurb' => 'Exact ratios, the sine and cosine rules, and simple equations.', 'formula' => 'a² = b² + c² − 2bc cos A',
               'questions' => 10, 'seconds' => 360],
        12 => ['level' => 12, 'name' => 'Coordinate Geometry', 'band' => 'SSS 3', 'icon' => '⑫',
               'strand' => 'Shape & space', 'needs' => [3, 11],
               'blurb' => 'Lines, gradients, distances and midpoints.', 'formula' => 'm = (y₂ − y₁)/(x₂ − x₁)',
               'questions' => 10, 'seconds' => 390],
        13 => ['level' => 13, 'name' => 'Vectors in Three Dimensions', 'band' => 'Further Maths / A-level', 'icon' => '⑬',
               'strand' => 'Shape & space', 'needs' => [12],
               'blurb' => 'Magnitude, the scalar product, and the angle between two vectors.', 'formula' => 'a·b = |a||b| cos θ',
               'questions' => 10, 'seconds' => 420],

        /* ── Data ───────────────────────────────────────────────────────── */
        14 => ['level' => 14, 'name' => 'Statistics', 'band' => 'SSS 1–3', 'icon' => '⑭',
               'strand' => 'Data', 'needs' => [],
               'blurb' => 'Mean, median, mode, range, and the spread around them.', 'formula' => 'x̄ = Σx/n',
               'questions' => 10, 'seconds' => 360],
        15 => ['level' => 15, 'name' => 'Probability', 'band' => 'SSS 2–3', 'icon' => '⑮',
               'strand' => 'Data', 'needs' => [2, 14],
               'blurb' => 'One event, two events, and what changes when you do not replace.', 'formula' => 'P(A∪B) = P(A) + P(B) − P(A∩B)',
               'questions' => 10, 'seconds' => 360],
        16 => ['level' => 16, 'name' => 'Binomial & Counting', 'band' => 'Further Maths', 'icon' => '⑯',
               'strand' => 'Data', 'needs' => [15],
               'blurb' => 'Permutations, combinations and the binomial expansion.', 'formula' => '(a + b)ⁿ = Σ ⁿCᵣ aⁿ⁻ʳbʳ',
               'questions' => 10, 'seconds' => 360],

        /* ── Reasoning ──────────────────────────────────────────────────── */
        17 => ['level' => 17, 'name' => 'Logic', 'band' => 'Further Maths', 'icon' => '⑰',
               'strand' => 'Reasoning', 'needs' => [2],
               'blurb' => 'Truth tables, implication, and whether an argument holds.', 'formula' => 'p ⇒ q ≡ ¬q ⇒ ¬p',
               'questions' => 10, 'seconds' => 330],
        18 => ['level' => 18, 'name' => 'Matrices', 'band' => 'Further Maths', 'icon' => '⑱',
               'strand' => 'Reasoning', 'needs' => [3],
               'blurb' => 'Determinants, inverses and multiplication.', 'formula' => 'AA⁻¹ = I',
               'questions' => 10, 'seconds' => 360],

        /* ── Calculus ───────────────────────────────────────────────────── */
        19 => ['level' => 19, 'name' => 'Differentiation', 'band' => 'Further Maths / A-level', 'icon' => '⑲',
               'strand' => 'Calculus', 'needs' => [6, 8],
               'blurb' => 'Gradients, turning points, and the product and quotient rules.', 'formula' => '(uv)′ = u′v + uv′',
               'questions' => 10, 'seconds' => 420],
        20 => ['level' => 20, 'name' => 'Integration', 'band' => 'Further Maths / A-level', 'icon' => '⑳',
               'strand' => 'Calculus', 'needs' => [19],
               'blurb' => 'Definite integrals and the area under a curve.', 'formula' => '∫ f′(x) dx = f(b) − f(a)',
               'questions' => 10, 'seconds' => 420],
        21 => ['level' => 21, 'name' => 'Calculus in Motion', 'band' => 'Further Maths / A-level', 'icon' => '㉑',
               'strand' => 'Calculus', 'needs' => [20],
               'blurb' => 'Rates of change, velocity and acceleration, and area between curves.', 'formula' => 'a = dv/dt = d²s/dt²',
               'questions' => 10, 'seconds' => 450],
    ];
}

/** The strands, in the order the map draws them. */
function mathlab_strands(): array {
    $out = [];
    foreach (mathlab_levels() as $lv) {
        $s = (string)$lv['strand'];
        if (!in_array($s, $out, true)) $out[] = $s;
    }
    return $out;
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
/** A signed integer with the TYPESET minus. Every expression in the Lab uses
 *  U+2212, so a number dropped in with a plain hyphen puts two different
 *  dashes on one paper — and the hyphen is the narrower of the two, which is
 *  exactly the character a child is most likely to miss. */
function mathlab_int(int $n): string { return $n < 0 ? '−' . abs($n) : (string)$n; }
/** A unit-vector or imaginary component: "i", "−i", "4j", "−2k". A coefficient
 *  of 1 is never printed — "1i" is not how anybody writes it, and a student who
 *  has to wonder whether the 1 is significant has been handed a worse question
 *  than the one intended. */
function mathlab_unit(int $n, string $unit): string {
    if ($n === 1) return $unit;
    if ($n === -1) return '−' . $unit;
    return mathlab_int($n) . $unit;
}
/** A common factor and two DIFFERENT multipliers, for L.C.M. and H.C.F. work.
 *  Returns [g, m, n] so the pair is g·m and g·n. */
function mathlab_factor_pair(int $glo, int $ghi, int $mlo, int $mhi): array {
    $g = random_int($glo, $ghi);
    $m = random_int($mlo, $mhi);
    do { $n = random_int($mlo, $mhi); } while ($n === $m);
    return [$g, $m, $n];
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

function mathlab_q_numeration(int $form): array {
    switch ($form) {
        /* Both pairs are built around a shared factor. Two coprime numbers make
           "find the L.C.M. of 17 and 26" a multiplication drill with the answer
           442, and "find the H.C.F. of 31 and 65" an exercise whose answer is
           always 1 — neither teaches what the question is for. */
        /* Both pairs are built around a shared factor, and the two multipliers
           are forced apart. Two coprime numbers make "find the L.C.M. of 17 and
           26" a multiplication drill with the answer 442, and "the H.C.F. of 31
           and 65" an exercise whose answer is always 1; the same number twice
           makes both answers the number itself. None of the three teaches what
           the question is for. */
        case 1: { [$g, $m, $n] = mathlab_factor_pair(2, 9, 2, 9);
            return ['Find the L.C.M. of ' . ($g * $m) . ' and ' . ($g * $n) . '.',
                (string)mathlab_lcm($g * $m, $g * $n)]; }
        case 2: { [$g, $m, $n] = mathlab_factor_pair(3, 12, 2, 8);
            return ['Find the H.C.F. of ' . ($g * $m) . ' and ' . ($g * $n) . '.',
                (string)mathlab_gcd($g * $m, $g * $n)]; }
        case 3: { $pct = [5, 10, 12, 15, 20, 25, 40, 75][random_int(0, 7)]; $of = random_int(2, 40) * 100;
            return ['What is ' . $pct . '% of ₦' . number_format($of) . '?', (string)intdiv($of * $pct, 100)]; }
        case 4: { // Sharing in a ratio — the classic WAEC form.
            $r1 = random_int(1, 6); $r2 = random_int(1, 6); $r3 = random_int(1, 6);
            $unit = random_int(2, 30) * 100; $total = ($r1 + $r2 + $r3) * $unit;
            return ['₦' . number_format($total) . ' is shared among Ada, Bola and Chidi in the ratio '
                . $r1 . ':' . $r2 . ':' . $r3 . '. How much does Bola get, in naira?', (string)($r2 * $unit)]; }
        case 5: { /* Fraction of a quantity. The fraction is reduced — "3/6 of 90"
                     is a question about noticing that 3/6 is a half, which is a
                     different question from the one being asked — and the
                     quantity starts high enough that the answer is worth
                     working out rather than counting on fingers. */
            $den = [2, 3, 4, 5, 6, 8][random_int(0, 5)];
            do { $num = random_int(1, $den - 1); } while (mathlab_gcd($num, $den) !== 1);
            $q = random_int(4, 30) * $den;
            return [$num . '/' . $den . ' of ' . $q . ' is what number?', (string)intdiv($q * $num, $den)]; }
        default: { // Simple interest — everywhere in the Nigerian syllabus.
            $p = random_int(2, 40) * 1000; $r = random_int(2, 12); $t = random_int(1, 5);
            return ['Find the simple interest on ₦' . number_format($p) . ' for ' . $t
                . ' year' . ($t === 1 ? '' : 's') . ' at ' . $r . '% per annum.',
                (string)intdiv($p * $r * $t, 100)]; }
    }
}

function mathlab_q_algebra(int $form): array {
    switch ($form) {
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

function mathlab_q_indices(int $form): array {
    switch ($form) {
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

function mathlab_q_surds(int $form): array {
    switch ($form) {
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

function mathlab_q_quadratic(int $form): array {
    $p = random_int(-9, 9); $q = random_int(-9, 9);      // roots
    switch ($form) {
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

function mathlab_q_sequences(int $form): array {
    switch ($form) {
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

function mathlab_q_trig(int $form): array {
    switch ($form) {
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

function mathlab_q_binomial(int $form): array {
    switch ($form) {
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

function mathlab_q_matrices(int $form): array {
    $a = random_int(-6, 9); $b = random_int(-6, 9); $c = random_int(-6, 9); $d = random_int(-6, 9);
    $m = '(' . $a . ' ' . $b . ' ; ' . $c . ' ' . $d . ')';
    switch ($form) {
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

function mathlab_q_differentiation(int $form): array {
    switch ($form) {
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

function mathlab_q_integration(int $form): array {
    switch ($form) {
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

function mathlab_q_coordinate(int $form): array {
    switch ($form) {
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
/* ── The topics the ladder was missing ────────────────────────────────────
 *
 * Statistics and probability are core WAEC paper-one material and there was
 * nothing at all. The other seven are the Further Maths end: polynomials,
 * complex numbers, binary operations and logic among them — the last two
 * distinctly Nigerian, and exactly the kind a generic ladder skips.
 *
 * Every answer stays exact. A generator that produces 0.333… produces an
 * argument about how many threes to type, so anything that would divide
 * awkwardly is built from numbers chosen to come out whole, and where a
 * fraction is genuinely the answer the question asks for it in a stated form.
 */

function mathlab_q_sets(int $form): array {
    switch ($form) {
        case 1: { // n(A ∪ B) = n(A) + n(B) − n(A ∩ B)
            $a = random_int(12, 40); $b = random_int(12, 40); $both = random_int(3, min($a, $b) - 1);
            return ['In a class, ' . $a . ' study Physics and ' . $b . ' study Chemistry. '
                . $both . ' study both. How many study at least one of them?',
                (string)($a + $b - $both)]; }
        case 2: { $a = random_int(15, 45); $b = random_int(15, 45); $tot = random_int(max($a, $b) + 2, $a + $b);
            return ['In a group of ' . $tot . ', ' . $a . ' like rice and ' . $b . ' like beans, '
                . 'and everybody likes at least one. How many like both?',
                (string)($a + $b - $tot)]; }
        case 3: { $u = random_int(40, 80); $a = random_int(10, 30);
            return ['The universal set has ' . $u . ' members and set A has ' . $a . '. '
                . "How many are in A' (the complement of A)?", (string)($u - $a)]; }
        default: { $n = random_int(3, 6);
            return ['A set has ' . $n . ' members. How many subsets does it have?', (string)(2 ** $n)]; }
    }
}

function mathlab_q_statistics(int $form): array {
    $list = [];
    $k = random_int(5, 7);
    for ($i = 0; $i < $k; $i++) $list[] = random_int(2, 30);
    $shown = implode(', ', $list);
    switch ($form) {
        case 1: { // Built to divide exactly: the last value absorbs the remainder.
            $sum = array_sum($list);
            $want = (int)round($sum / $k);
            $list[$k - 1] += ($want * $k - $sum);
            if ($list[$k - 1] < 1) { $list[$k - 1] += $k; $want++; }
            return ['Find the mean of: ' . implode(', ', $list) . '.', (string)$want]; }
        case 2: { sort($list);
            $mid = intdiv($k, 2);
            $median = $k % 2 === 1 ? $list[$mid] : ($list[$mid - 1] + $list[$mid]) / 2;
            return ['Find the median of: ' . $shown . '.', mathlab_num($median)]; }
        case 3: { /* A mode planted — and the rest of the list built to be all
                     DIFFERENT, from each other and from it.
             
                     Planting three copies into a list of random numbers does
                     not give a unique mode: the four remaining slots could
                     hold three of a kind, or two pairs, and "find the mode of
                     5, 7, 5, 7, 5, 7" has no answer. It printed once in every
                     ~450 draws, and every one of them marked a child WRONG for
                     an answer that was right — which is the exact failure this
                     whole generated-question design exists to rule out. */
            $m = random_int(2, 30);
            $rest = [];
            $pool = array_diff(range(2, 30), [$m]);
            shuffle($pool);
            for ($i = 3; $i < $k; $i++) $rest[] = array_pop($pool);
            $list = array_merge([$m, $m, $m], $rest);
            shuffle($list);
            return ['Find the mode of: ' . implode(', ', $list) . '.', (string)$m]; }
        case 4: return ['Find the range of: ' . $shown . '.', (string)(max($list) - min($list))];
        default: { /* Standard deviation, from a set chosen so the variance is a
                      perfect square: the deviations are ±d around the mean. */
            $mean = random_int(10, 40); $d = random_int(2, 6);
            $set = [$mean - $d, $mean - $d, $mean + $d, $mean + $d];
            shuffle($set);
            return ['Find the standard deviation of: ' . implode(', ', $set) . '.', (string)$d]; }
    }
}

function mathlab_q_probability(int $form): array {
    switch ($form) {
        case 1: { $r = random_int(2, 8); $b = random_int(2, 8);
            $g = mathlab_gcd($r, $r + $b);
            return ['A bag holds ' . $r . ' red and ' . $b . ' blue balls. One is drawn. '
                . 'What is the probability it is red? Give it as a fraction in its lowest terms, like 2/5.',
                intdiv($r, $g) . '/' . intdiv($r + $b, $g)]; }
        case 2: { $n = random_int(2, 6);
            return ['A fair die is rolled once. What is the probability of getting a number '
                . 'greater than ' . $n . '? Give it as a fraction in its lowest terms, or 0.',
                (function () use ($n) {
                    $f = 6 - $n; if ($f <= 0) return '0';
                    $g = mathlab_gcd($f, 6);
                    return intdiv($f, $g) . '/' . intdiv(6, $g);
                })()]; }
        case 3: { /* Independent events: the numbers are chosen so the product is
                     clean, and b stops at 3 because 4/4 is a certainty written
                     as a fraction — it reads as a misprint, and a child who
                     spots it spends the question wondering rather than working. */
            $a = random_int(1, 4); $b = random_int(1, 3);
            return ['Two independent events have probabilities ' . $a . '/5 and ' . $b . '/4. '
                . 'What is the probability that BOTH happen? Give a fraction in its lowest terms.',
                (function () use ($a, $b) {
                    $num = $a * $b; $den = 20; $g = mathlab_gcd($num, $den);
                    return intdiv($num, $g) . '/' . intdiv($den, $g);
                })()]; }
        case 4: { // Without replacement — the classic WAEC shape.
            $r = random_int(3, 6); $b = random_int(3, 6); $t = $r + $b;
            $num = $r * ($r - 1); $den = $t * ($t - 1); $g = mathlab_gcd($num, $den);
            return ['A box holds ' . $r . ' red and ' . $b . ' green pens. Two are taken WITHOUT '
                . 'replacement. What is the probability that both are red? '
                . 'Give a fraction in its lowest terms.',
                intdiv($num, $g) . '/' . intdiv($den, $g)]; }
        default: { $p = random_int(1, 9);
            $g = mathlab_gcd(10 - $p, 10);
            return ['The probability that it rains is ' . $p . '/10. What is the probability '
                . 'that it does NOT rain? Give a fraction in its lowest terms, or 0.',
                $p === 10 ? '0' : intdiv(10 - $p, $g) . '/' . intdiv(10, $g)]; }
    }
}

function mathlab_q_polynomials(int $form): array {
    switch ($form) {
        case 1: { // Remainder theorem: f(a) is the remainder on division by (x − a).
            $a = random_int(1, 4); $b = random_int(-6, 6); $c = random_int(-9, 9); $k = random_int(-3, 3);
            $f = mathlab_poly([$a, $b, $c]);
            $val = $a * $k * $k + $b * $k + $c;
            return ['Find the remainder when ' . $f . ' is divided by (x ' . ($k >= 0 ? '− ' . $k : '+ ' . abs($k)) . ').',
                (string)$val]; }
        case 2: { // Factor theorem, backwards: choose the root, solve for the constant.
            $k = random_int(1, 4); $a = random_int(1, 3); $b = random_int(-6, 6);
            $c = -($a * $k * $k + $b * $k);
            return ['(x − ' . $k . ') is a factor of ' . mathlab_poly([$a, $b, 0]) . ' + c. Find c.',
                (string)$c]; }
        case 3: { // A cubic with a planted root.
            $r = random_int(1, 4); $p = random_int(-5, 5); $q = random_int(-9, 9);
            $val = $r ** 3 + $p * $r + $q;
            /* mathlab_term, not a hand-rolled sign: it drops a zero term and
               writes a coefficient of 1 as a bare x, so no child is asked
               about "x³ + 1x + 6". */
            return ['For f(x) = x³' . mathlab_term($p, 'x') . mathlab_term($q, '')
                . ', find f(' . $r . ').', (string)$val]; }
        default: { /* Partial fractions: (Ax + B)/((x−p)(x−q)) splits so that the
                      numerator over (x−p) is f(p)/(p−q). Numbers picked so it is
                      a whole number. */
            $p = random_int(1, 4); $q = $p + random_int(1, 3);
            $A = random_int(1, 4);
            $num = $A * ($p - $q);
            return ['Express ' . $num . ' / ((x − ' . $p . ')(x − ' . $q . ')) in partial fractions '
                . 'as a/(x − ' . $p . ') + b/(x − ' . $q . '). What is a?', (string)$A]; }
    }
}

function mathlab_q_complex(int $form): array {
    switch ($form) {
        /* Real parts are non-zero: "0 + 8i" is a purely imaginary number written
           the long way, and it turns an arithmetic question into a puzzle about
           whether the 0 is a typo. */
        case 1: { $a = mathlab_nz(-6, 8); $b = random_int(1, 8); $c = mathlab_nz(-6, 8); $d = random_int(1, 8);
            return ['Add (' . mathlab_int($a) . ' + ' . mathlab_unit($b, 'i') . ') and ('
                . mathlab_int($c) . ' + ' . mathlab_unit($d, 'i') . '). '
                . 'What is the REAL part of the answer?', (string)($a + $c)]; }
        case 2: { $a = mathlab_nz(-6, 8); $b = random_int(1, 8); $c = mathlab_nz(-6, 8); $d = random_int(1, 8);
            // (a+bi)(c+di) = (ac − bd) + (ad + bc)i
            return ['Multiply (' . mathlab_int($a) . ' + ' . mathlab_unit($b, 'i') . ') by ('
                . mathlab_int($c) . ' + ' . mathlab_unit($d, 'i') . '). '
                . 'What is the IMAGINARY part of the answer? Give the number only.',
                (string)($a * $d + $b * $c)]; }
        case 3: { // A Pythagorean pair, so the modulus is whole.
            $t = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25]][random_int(0, 4)];
            return ['Find the modulus of the complex number ' . $t[0] . ' + ' . $t[1] . 'i.', (string)$t[2]]; }
        case 4: { $a = mathlab_nz(-8, 8); $b = random_int(2, 9);
            return ['The conjugate of ' . mathlab_int($a) . ' + ' . mathlab_unit($b, 'i') . ' is '
                . mathlab_int($a) . ' − ' . mathlab_unit($b, 'i') . '. '
                . 'Multiply a complex number by its own conjugate: what do you get for '
                . mathlab_int($a) . ' + ' . mathlab_unit($b, 'i') . '?', (string)($a * $a + $b * $b)]; }
        default: { $n = random_int(2, 20);
            // i cycles with period 4: 1, i, −1, −i.
            $cycle = ['1', 'i', '-1', '-i'];
            // The ANSWER stays a plain hyphen: it is typed into a box, and
            // mathlab_matches folds the two dashes together anyway.
            return ['Simplify i^' . $n . '. Answer 1, −1, i or −i.', $cycle[$n % 4]]; }
    }
}

function mathlab_q_binaryop(int $form): array {
    switch ($form) {
        case 1: { $k = random_int(1, 5); $a = random_int(1, 9); $b = random_int(1, 9);
            return ['A binary operation is defined by a * b = a + b + ' . $k . '. Find ' . $a . ' * ' . $b . '.',
                (string)($a + $b + $k)]; }
        case 2: { $a = random_int(2, 7); $b = random_int(2, 7);
            return ['A binary operation is defined by a * b = ab − a − b. Find ' . $a . ' * ' . $b . '.',
                (string)($a * $b - $a - $b)]; }
        case 3: { $k = random_int(1, 6);
            // a * b = a + b + k has identity e where a + e + k = a, so e = −k.
            return ['A binary operation is defined by a * b = a + b + ' . $k . '. '
                . 'Find the identity element.', (string)(-$k)]; }
        default: { $k = random_int(1, 5); $a = random_int(1, 8);
            // Inverse of a under a * b = a + b + k is −a − 2k.
            return ['Under a * b = a + b + ' . $k . ', the identity is ' . (-$k) . '. '
                . 'Find the inverse of ' . $a . '.', (string)(-$a - 2 * $k)]; }
    }
}

function mathlab_q_logic(int $form): array {
    switch ($form) {
        case 1: { $p = random_int(0, 1); $q = random_int(0, 1);
            // Implication is false only when the antecedent is true and the consequent false.
            $r = ($p === 1 && $q === 0) ? 'F' : 'T';
            return ['p is ' . ($p ? 'true' : 'false') . ' and q is ' . ($q ? 'true' : 'false') . '. '
                . 'What is the truth value of "p implies q"? Answer T or F.', $r]; }
        case 2: { $p = random_int(0, 1); $q = random_int(0, 1);
            return ['p is ' . ($p ? 'true' : 'false') . ' and q is ' . ($q ? 'true' : 'false') . '. '
                . 'What is the truth value of "p AND q"? Answer T or F.', ($p && $q) ? 'T' : 'F']; }
        case 3: { $p = random_int(0, 1); $q = random_int(0, 1);
            return ['p is ' . ($p ? 'true' : 'false') . ' and q is ' . ($q ? 'true' : 'false') . '. '
                . 'What is the truth value of "p OR q"? Answer T or F.', ($p || $q) ? 'T' : 'F']; }
        default: { $n = random_int(1, 4);
            // A truth table over n statements has 2^n rows.
            return ['How many rows does a truth table for ' . $n . ' simple statement'
                . ($n === 1 ? '' : 's') . ' have?', (string)(2 ** $n)]; }
    }
}

function mathlab_q_vectors3d(int $form): array {
    switch ($form) {
        case 1: { // A Pythagorean quadruple, so the magnitude is whole.
            $t = [[1, 2, 2, 3], [2, 3, 6, 7], [1, 4, 8, 9], [4, 4, 7, 9], [2, 6, 9, 11]][random_int(0, 4)];
            return ['Find the magnitude of the vector ' . mathlab_unit($t[0], 'i') . ' + '
                . mathlab_unit($t[1], 'j') . ' + ' . mathlab_unit($t[2], 'k') . '.',
                (string)$t[3]]; }
        case 2: { $a = [random_int(-5, 6), random_int(-5, 6), random_int(-5, 6)];
            $b = [random_int(-5, 6), random_int(-5, 6), random_int(-5, 6)];
            $dot = $a[0] * $b[0] + $a[1] * $b[1] + $a[2] * $b[2];
            return ['Find the scalar product of (' . implode(', ', array_map('mathlab_int', $a)) . ') and ('
                . implode(', ', array_map('mathlab_int', $b)) . ').',
                (string)$dot]; }
        case 3: { $a = [random_int(1, 6), random_int(1, 6), random_int(1, 6)];
            // Perpendicular: the scalar product is zero, and that is the point.
            return ['Two vectors are perpendicular when their scalar product is ___. '
                . 'Give the number.', '0']; }
        default: { /* The first component is the one asked about, so it is drawn
                      non-zero: "multiply (0, 1, 8) by 2, what is the first
                      component" is a question with nothing in it. */
            $a = [mathlab_nz(-6, 8), random_int(-6, 8), random_int(-6, 8)];
            $k = random_int(2, 5);
            return ['Multiply the vector (' . implode(', ', array_map('mathlab_int', $a))
                . ') by the scalar ' . $k . '. '
                . 'What is the FIRST component?', (string)($a[0] * $k)]; }
    }
}

function mathlab_q_motion(int $form): array {
    switch ($form) {
        case 1: { // s = at² + bt + c, so v = 2at + b
            $a = random_int(1, 6); $b = random_int(-8, 9); $t = random_int(1, 6);
            return ['A body moves so that s = ' . ($a === 1 ? '' : (string)$a) . 't²' . mathlab_term($b, 't')
                . ' metres. Its velocity is ds/dt. Find the velocity at t = ' . $t . ' seconds.',
                (string)(2 * $a * $t + $b)]; }
        case 2: { $a = random_int(1, 6); $b = random_int(-8, 9);
            return ['A body moves so that s = ' . ($a === 1 ? '' : (string)$a) . 't²' . mathlab_term($b, 't')
                . ' metres. Acceleration is d²s/dt². Find the acceleration.', (string)(2 * $a)]; }
        case 3: { // Where the velocity is zero: 2at + b = 0, built so t is whole.
            $a = random_int(1, 5); $t = random_int(1, 5); $b = -2 * $a * $t;
            return ['A body moves so that s = ' . ($a === 1 ? '' : (string)$a) . 't²' . mathlab_term($b, 't') . '. '
                . 'At what time t is it momentarily at rest?', (string)$t]; }
        default: { // Area between y = k and y = x² from 0 to a, with k = a² chosen whole.
            $a = random_int(1, 4);
            // ∫₀^a (a²  −  x²) dx = a³ − a³/3 = 2a³/3 — force a divisible by 3 for a whole answer.
            $a = 3 * random_int(1, 2);
            return ['Find the area between y = ' . ($a * $a) . ' and y = x², from x = 0 to x = ' . $a . '.',
                (string)intdiv(2 * $a ** 3, 3)]; }
    }
}

/** A number as a student would type it: 7, not 7.0; 3.5 stays 3.5. */
function mathlab_num(float $v): string {
    return (string)(abs($v - round($v)) < 1e-9 ? (int)round($v) : round($v, 2));
}

/* Which generator serves which level. A map rather than a switch, so a level
 * without a generator is a loud failure at the one place that can see it —
 * mathlab_generate — and not a silent fall through to coordinate geometry,
 * which is what a `default:` arm gave every level number it did not know. */
function mathlab_generators(): array {
    return [
        1  => 'mathlab_q_numeration',
        2  => 'mathlab_q_sets',
        3  => 'mathlab_q_algebra',
        4  => 'mathlab_q_indices',
        5  => 'mathlab_q_surds',
        6  => 'mathlab_q_quadratic',
        7  => 'mathlab_q_polynomials',
        8  => 'mathlab_q_sequences',
        9  => 'mathlab_q_binaryop',
        10 => 'mathlab_q_complex',
        11 => 'mathlab_q_trig',
        12 => 'mathlab_q_coordinate',
        13 => 'mathlab_q_vectors3d',
        14 => 'mathlab_q_statistics',
        15 => 'mathlab_q_probability',
        16 => 'mathlab_q_binomial',
        17 => 'mathlab_q_logic',
        18 => 'mathlab_q_matrices',
        19 => 'mathlab_q_differentiation',
        20 => 'mathlab_q_integration',
        21 => 'mathlab_q_motion',
    ];
}

/**
 * Which forms are easy, which are standard, and which are the stretch.
 *
 * Every level had a handful of question FORMS and picked among them with a
 * flat random_int. The consequence was that a level had one difficulty, and
 * that difficulty never moved: question 1 of a paper was as hard as question
 * 12, a student's fiftieth paper was as hard as their first, and there was
 * nothing between "cannot do this level at all" and "cleared it". That is not
 * how a maths paper is built and it is not how anybody learns — a real paper
 * opens with something you can do, so you settle, and closes with something
 * you have to reach for.
 *
 * So each form is graded 1 (foundation), 2 (standard) or 3 (stretch), and the
 * paper is assembled from the mix rather than from the whole bag. The grading
 * is by the WORK the form asks for, not by where it happens to sit in the
 * switch: in quadratics the hardest arm is the discriminant, because b² − 4ac
 * with two negatives is where the marks are actually lost, not the arm that
 * happens to be listed last.
 *
 * A tier with no forms falls back to the nearest tier that has some, so a
 * level with only three forms still produces a full paper.
 */
function mathlab_form_tiers(): array {
    return [
        //          T1: foundation      T2: standard        T3: stretch
        1  => [[1, 5],            [2, 3],             [4, 6]],   // LCM/fraction | HCF/% | ratio, interest
        2  => [[3, 4],            [1],                [2]],      // complement/subsets | union | union backwards
        3  => [[1, 3],            [2, 5],             [4]],      // solve/evaluate | expand/subject | simultaneous
        4  => [[1, 2],            [3, 5],             [4]],      // × ÷ indices | logs, fractional | log law
        5  => [[2, 4],            [1],                [3]],      // add surds, square | simplify | rationalise
        6  => [[1],               [3, 4],             [2]],      // other root | sum, product | discriminant
        7  => [[3],               [1],                [2, 4]],   // evaluate | remainder | factor, partial fractions
        8  => [[1, 3],            [2],                [4, 5]],   // nth terms | sum of an A.P. | G.P. sums
        9  => [[1],               [2, 3],             [4]],      // evaluate | harder rule, identity | inverse
        10 => [[1, 5],            [3, 4],             [2]],      // add, powers of i | modulus, conjugate | multiply
        11 => [[1, 2],            [3],                [4]],      // exact ratios | hypotenuse | cosine rule
        12 => [[2, 5],            [1, 3],             [4]],      // midpoint, magnitude | distance, gradient | a·b
        13 => [[3, 4],            [1],                [2]],      // perpendicular, scalar × | magnitude | a·b
        14 => [[3, 4],            [1, 2],             [5]],      // mode, range | mean, median | standard deviation
        15 => [[2, 5],            [1, 3],             [4]],      // die, complement | bag, independent | no replacement
        16 => [[1],               [2, 3],             [4]],      // nCr | nPr, (1+x)^n | (1+ax)^n
        17 => [[2, 3],            [4],                [1]],      // AND, OR | table size | implication
        18 => [[1],               [3],                [2]],      // determinant | determinant in context | M × v
        19 => [[1],               [3, 4],             [2]],      // quadratic | turning point, gradient | cubic
        20 => [[2],               [3],                [1]],      // ∫kx² | area under y = 2x | ∫(ax + b)
        21 => [[2],               [1],                [3, 4]],   // acceleration | velocity at t | at rest, area
    ];
}

/** The forms available at a tier, falling back outward when a tier is empty. */
function mathlab_forms_at(int $level, int $tier): array {
    $tiers = mathlab_form_tiers()[$level] ?? [];
    if (!$tiers) throw new RuntimeException('no form tiers for level ' . $level);
    $tier = max(1, min(3, $tier));
    for ($step = 0; $step < 3; $step++) {
        foreach ([$tier - $step, $tier + $step] as $t) {
            if ($t >= 1 && $t <= 3 && !empty($tiers[$t - 1])) return $tiers[$t - 1];
        }
    }
    throw new RuntimeException('every tier is empty for level ' . $level);
}

/**
 * One question for a level at a difficulty tier.
 *
 * Returns [text, answer, tier] — the tier travels with the question so the
 * paper can be ordered by it and the marking can report where a student
 * actually stands, rather than a single percentage that says nothing about
 * whether they lost the marks on the easy half or the hard one.
 */
function mathlab_question(int $level, int $tier = 2): array {
    $fn = mathlab_generators()[$level] ?? '';
    if ($fn === '' || !function_exists($fn)) {
        throw new RuntimeException('no question generator for level ' . $level);
    }
    $forms = mathlab_forms_at($level, $tier);
    [$text, $ans] = $fn($forms[random_int(0, count($forms) - 1)]);
    return [$text, $ans, max(1, min(3, $tier))];
}

/**
 * The three papers a level can set, and who gets which.
 *
 * A level used to set one paper forever. A student who cleared Surds at 71%
 * and a student who cleared it at 100% were handed the same questions on
 * every subsequent visit, and neither was ever asked for more than they had
 * already shown. So the paper moves with the student:
 *
 *   Foundation  — never cleared this level. Mostly the gentler forms, with
 *                 one stretch question so the top of the level is visible
 *                 rather than hidden until the day it arrives.
 *   Standard    — cleared it. The middle of the syllabus, weighted to the
 *                 forms an exam actually leans on.
 *   Stretch     — cleared it at 90% or better. Mostly the hard forms.
 *
 * `mix` is the weighting across tiers 1, 2 and 3. It is a weighting and not a
 * count because levels set papers of ten and of twelve.
 */
function mathlab_stages(): array {
    return [
        1 => ['stage' => 1, 'key' => 'foundation', 'name' => 'Foundation',
              'blurb' => 'Mostly the gentler forms, with one to reach for.',  'mix' => [5, 4, 1]],
        2 => ['stage' => 2, 'key' => 'standard',   'name' => 'Standard',
              'blurb' => 'The middle of the syllabus, weighted the way an exam is.', 'mix' => [2, 5, 3]],
        3 => ['stage' => 3, 'key' => 'stretch',    'name' => 'Stretch',
              'blurb' => 'Mostly the hard forms. You have earned it.',        'mix' => [1, 3, 6]],
    ];
}

/** Which paper this student has earned on this level. */
function mathlab_stage_for(?array $row): int {
    if (!$row || trim((string)($row['clearedAt'] ?? '')) === '') return 1;
    return (int)($row['bestScore'] ?? 0) >= 90 ? 3 : 2;
}

/**
 * How many questions at each tier, for a paper of n.
 *
 * Largest remainder, so the counts always sum to exactly n — a paper marked
 * out of eleven when the student was promised twelve is a bug they would
 * notice and could not explain.
 */
function mathlab_tier_counts(int $n, array $mix): array {
    $total = array_sum($mix);
    $exact = array_map(fn($w) => $n * $w / $total, $mix);
    $counts = array_map('intval', $exact);
    $left = $n - array_sum($counts);
    // Hand the leftovers to the largest fractional parts, biggest first.
    $rema = [];
    foreach ($exact as $i => $e) $rema[$i] = $e - (int)$e;
    arsort($rema);
    foreach (array_keys($rema) as $i) {
        if ($left <= 0) break;
        $counts[$i]++; $left--;
    }
    return $counts;
}

/**
 * A full paper for a level, at a stage.
 *
 * The questions come out in tier order — foundation first, stretch last — so
 * the paper opens with something the student can do. That ordering is the
 * whole point: a paper that leads with its hardest question loses the student
 * who could have answered the other eleven.
 *
 * Duplicates are dropped rather than tolerated: the same question twice in a
 * twelve-question paper is a wasted question and reads as a bug.
 */
function mathlab_generate(int $level, int $n, int $stage = 1): array {
    $mix = mathlab_stages()[$stage]['mix'] ?? mathlab_stages()[1]['mix'];
    $counts = mathlab_tier_counts($n, $mix);

    $qs = []; $keys = []; $seen = [];
    foreach ([1, 2, 3] as $tier) {
        $want = $counts[$tier - 1];
        $got = 0;
        for ($guard = 0; $got < $want && $guard < $want * 14; $guard++) {
            [$text, $ans] = mathlab_question($level, $tier);
            if (isset($seen[$text])) continue;
            $seen[$text] = true;
            $qs[] = ['q' => $text, 'tier' => $tier];
            $keys[] = (string)$ans;
            $got++;
        }
        // A tier with few distinct forms can run dry. Short a question is worse
        // than a repeat, because the paper would then be marked out of a
        // different total than the one the student was promised.
        while ($got < $want) {
            [$text, $ans] = mathlab_question($level, $tier);
            $qs[] = ['q' => $text, 'tier' => $tier];
            $keys[] = (string)$ans;
            $got++;
        }
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
 * The map as this player sees it.
 *
 * A level opens when everything it NEEDS is cleared — all of it, not the one
 * that happens to sit above it in a list. Four levels need nothing and are
 * open from the start, one per road in: number, algebra, statistics, and
 * whichever of those a student is actually ready for.
 *
 * This used to be `unlocked = the previous level is cleared`, which made the
 * whole thing one rope: a Further Maths student who wanted differentiation had
 * to clear JSS 1–2 fractions first, and nine levels after that, because the
 * chain treated "listed earlier" as "needed". Differentiation needs quadratics
 * and sequences. It has never needed matrices, and no longer claims to.
 *
 * Each level also says WHAT it is waiting for, by name, so a locked card can
 * be honest instead of just shut.
 */
function mathlab_board(array $p): array {
    $playerId = (string)($p['playerId'] ?? '');
    if ($playerId === '') return ['ok' => false, 'error' => 'forbidden'];
    $done = mathlab_progress_rows($playerId);
    $all = mathlab_levels();

    $cleared = [];
    foreach ($all as $n => $lv) {
        $row = $done[$n] ?? null;
        $cleared[$n] = $row && trim((string)$row['clearedAt']) !== '';
    }

    $levels = [];
    foreach ($all as $n => $lv) {
        $needs = (array)($lv['needs'] ?? []);
        $waiting = [];
        foreach ($needs as $req) if (empty($cleared[$req])) $waiting[] = (string)$all[$req]['name'];
        $row = $done[$n] ?? null;
        $stage = mathlab_stage_for($row);
        $levels[] = $lv + [
            'unlocked' => $waiting === [],
            // Which paper this level will set next. A cleared level is not
            // finished — it has a harder paper waiting — and the ladder is
            // where a student decides what to do next, so it says so here.
            'stage' => $stage,
            'stageName' => (string)mathlab_stages()[$stage]['name'],
            // Named rather than numbered: "needs Quadratic Equations" is a
            // thing a student can go and do. "Locked" is not.
            'waitingOn' => $waiting,
            'cleared' => (bool)$cleared[$n],
            'bestScore' => (int)($row['bestScore'] ?? 0),
            'bestCorrect' => (int)($row['bestCorrect'] ?? 0),
            'attempts' => (int)($row['attempts'] ?? 0),
        ];
    }
    $clearedCount = count(array_filter($levels, fn($l) => $l['cleared']));
    $openCount = count(array_filter($levels, fn($l) => $l['unlocked'] && !$l['cleared']));
    return ['ok' => true, 'levels' => $levels, 'strands' => mathlab_strands(),
            'passPct' => MATHLAB_PASS_PCT,
            'cleared' => $clearedCount, 'open' => $openCount, 'total' => count($levels)];
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
    if (!$me || empty($me['unlocked'])) {
        // Refused with the reason, so the client can say what to go and clear.
        return ['ok' => false, 'error' => 'locked', 'waitingOn' => $me['waitingOn'] ?? []];
    }

    /* The paper this student has earned on this level, not the one paper the
       level used to have. */
    $rows = mathlab_progress_rows($playerId);
    $stage = mathlab_stage_for($rows[$level] ?? null);
    $st = mathlab_stages()[$stage];

    [$qs, $keys] = mathlab_generate($level, (int)$lv['questions'], $stage);
    $roundId = 'ML-' . strtoupper(rand_hex(8));
    db_insert('arcade_rounds', [
        'roundId' => $roundId, 'playerId' => $playerId, 'game' => 'mathlab', 'tier' => $level,
        'answerKey' => json_encode($keys, JSON_UNESCAPED_SLASHES),
        'seconds' => (int)$lv['seconds'], 'startedAt' => now_iso(),
        'startedMs' => (int)round(microtime(true) * 1000), 'submittedAt' => '',
    ]);
    return ['ok' => true, 'roundId' => $roundId, 'level' => $level, 'name' => (string)$lv['name'],
            'band' => (string)$lv['band'], 'seconds' => (int)$lv['seconds'], 'questions' => $qs,
            'stage' => $stage, 'stageName' => (string)$st['name'], 'stageBlurb' => (string)$st['blurb'],
            'stages' => count(mathlab_stages())];
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
    $stage = mathlab_stage_for($prev ?: null);   // the paper this attempt was set: the certificate names it
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

    /* What this clear actually opened — asked of the graph, not assumed to be
       the next number up. Clearing Sets opens Probability and Logic; clearing
       Vectors opens nothing, because nothing is built on it yet. Announcing
       "level 14 is open" when level 14 has been open since day one is worse
       than announcing nothing. */
    $opened = [];
    if ($cleared) {
        $done = mathlab_progress_rows($playerId);
        $isDone = function (int $n) use ($done, $level): bool {
            if ($n === $level) return true;                 // just cleared, row may lag
            return isset($done[$n]) && trim((string)$done[$n]['clearedAt']) !== '';
        };
        foreach (mathlab_levels() as $n => $lv) {
            $needs = (array)($lv['needs'] ?? []);
            if (!in_array($level, $needs, true)) continue;  // this clear was not its blocker
            if ($isDone($n)) continue;                      // already cleared it anyway
            $open = true;
            foreach ($needs as $req) if (!$isDone($req)) { $open = false; break; }
            if ($open) $opened[] = ['level' => $n, 'name' => (string)$lv['name'],
                                    'strand' => (string)$lv['strand']];
        }
    }
    /* A member who clears a level is given a certificate (documents.php):
       once per level, and a Distinction one that replaces a Pass at 90%+. */
    $cert = $cleared && function_exists('doc_ml_issue') ? doc_ml_issue($playerId, $level, $pct, $correct, $total, $stage) : null;
    return ['ok' => true, 'correct' => $correct, 'total' => $total, 'score' => $score,
            'ms' => $ms, 'passPct' => MATHLAB_PASS_PCT, 'cleared' => $cleared,
            'certificate' => $cert ? ['no' => (string)$cert['docNo'], 'url' => doc_view_url($cert)] : null,
            'marks' => $marks,
            'opened' => $opened,
            'unlocked' => $opened[0] ?? null];
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
