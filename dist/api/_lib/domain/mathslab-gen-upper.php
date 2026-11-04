<?php
declare(strict_types=1);

/**
 * Maths Lab — question forms for Stages 8–17 (MC-071 … MC-170).
 *
 * The same rules as mathslab-gen.php, which holds Stages 1–7 and the item
 * builders these use: every question is generated from a form and a seed;
 * its answer and every wrong option are DERIVED from the numbers that built
 * it, never typed; a wrong option names the misconception behind it; every
 * question carries a worked solution and a hint; maths is LaTeX.
 *
 * Upper-stage conventions:
 *   · A rounded answer says how to round ("to 1 decimal place") and carries
 *     `dp`: any answer that rounds to the key is right (mlb_mark).
 *   · π is 22/7 where the answer is meant to be exact by hand, and an answer
 *     is asked "in terms of π" (as k in kπ) where the exact value matters.
 *   · Angles are in degrees unless the stem says radians.
 *   · Values are chosen so the working is clean at the level — a Pythagoras
 *     question on a triple, a cosine rule on an angle with an exact cosine —
 *     and rounded only where rounding is the skill.
 */

/** A rounded number as an answer key. */
function mlb_rd(float $x, int $dp): string { $s = mlb_dec(round($x, $dp)); return $s === '-0' ? '0' : $s; }
/** n choose k. */
function mlb_ncr(int $n, int $k): int { if ($k < 0 || $k > $n) return 0; $k = min($k, $n - $k); $v = 1; for ($i = 1; $i <= $k; $i++) $v = intdiv($v * ($n - $k + $i), $i); return $v; }
/** n! for small n. */
function mlb_fact(int $n): int { $v = 1; for ($i = 2; $i <= $n; $i++) $v *= $i; return $v; }
/** "3x^2 - 5x + 2" from coefficients, highest power first (LaTeX and plain alike). */
function mlb_poly(array $c, string $v = 'x'): string {
    $deg = count($c) - 1; $out = '';
    foreach ($c as $i => $k) {
        $k = (int)$k; $p = $deg - $i; if ($k === 0) continue;
        $abs = abs($k); $body = $p === 0 ? (string)$abs : (($abs === 1 ? '' : (string)$abs) . $v . ($p > 1 ? '^' . $p : ''));
        $out .= $out === '' ? ($k < 0 ? '-' : '') . $body : ($k < 0 ? ' - ' : ' + ') . $body;
    }
    return $out === '' ? '0' : $out;
}
/** Pythagorean triples, primitive, for questions that should come out whole. */
const MLB_TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
/** A diagram of a figure: named points (x right, y up), sides with labels, angle marks, circles. */
function mlb_fig(array $pts, array $segs = [], array $angles = [], array $extra = []): array {
    return ['type' => 'figure', 'pts' => $pts, 'segs' => $segs, 'angles' => $angles] + $extra;
}
/** A coordinate plot: curves [['line', m, c] | ['quad', a, b, c]], points [[x, y, label]]. */
function mlb_plotd(array $curves, array $pts = [], int $range = 6): array { return ['type' => 'plot', 'range' => $range, 'curves' => $curves, 'pts' => $pts]; }
/** A matrix in LaTeX. */
function mlb_mat(array $M): string { return '\\begin{pmatrix} ' . implode(' \\\\ ', array_map(static fn($row) => implode(' & ', $row), $M)) . ' \\end{pmatrix}'; }
/** The degree sign in LaTeX. */
function mlb_deg($v): string { return $v . '^\\circ'; }

function mlb_forms_upper(): array {
    static $f = null;
    if ($f !== null) return $f;
    $f = [];

    /* ══ Stage 8 · Geometry Foundations ══════════════════════════════════ */
    $f['MC-071'] = [
        static function (MlbRng $r) { $n = $r->int(3, 7); $pts = array_slice(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 0, $n);
            return mlb_typed('num', 'Points $' . implode(',\\ ', $pts) . '$ lie on a straight line in that order. How many different line segments have two of these points as their endpoints?', (string)mlb_ncr($n, 2),
                ['Every pair of points makes one segment, and the order of the two does not matter.', 'Pairs from ' . $n . ' points: $\\frac{' . $n . ' \\times ' . ($n - 1) . '}{2} = ' . mlb_ncr($n, 2) . '$.'],
                'Count pairs: the first point can pair with each one after it.', 'reasoning', 45); },
        static function (MlbRng $r) {
            $defs = [['Ray', 'has one endpoint and goes on for ever in one direction'], ['Line segment', 'has two endpoints and a length you can measure'],
                     ['Line', 'has no endpoints and goes on for ever in both directions'], ['Plane', 'is a flat surface that goes on for ever in every direction']];
            [$right, $what] = $defs[$r->int(0, 3)];
            $wrong = []; foreach ($defs as [$t, $w]) if ($t !== $right) $wrong[] = [$t, 'A ' . mb_strtolower($t) . ' ' . $w . '.'];
            return mlb_mcq($r, 'Which of these ' . $what . '?', $right, $wrong, ['A ' . mb_strtolower($right) . ' ' . $what . '.', 'Count the endpoints: a line has none, a ray one, a segment two.'], 'Count the endpoints.', 'concept', 25); },
        static function (MlbRng $r) { $a = $r->int(3, 15); $b = $r->int(3, 15); $who = $r->pick(['AB', 'PQ', 'XY']);
            [$p, $q] = [$who[0], $who[1]];
            return mlb_typed('num', 'Point $M$ lies on the segment $' . $who . '$. $' . $p . 'M = ' . $a . '$ cm and $M' . $q . ' = ' . $b . '$ cm. Point $N$ is the midpoint of $' . $who . '$. How long is $' . $p . 'N$, in cm?', mlb_dec(($a + $b) / 2),
                ['$' . $who . ' = ' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$ cm.', 'The midpoint is halfway: $' . $p . 'N = \\frac{' . ($a + $b) . '}{2} = ' . mlb_dec(($a + $b) / 2) . '$ cm.'],
                'Find the whole length first.', 'procedure', 40, ['unit' => 'cm']); },
        static function (MlbRng $r) { $n = $r->int(4, 9);
            return mlb_typed('num', $n . ' towns are to be linked so that every pair of towns has its own direct road, and no three towns lie on one straight road. How many roads are needed?', (string)mlb_ncr($n, 2),
                ['Each road joins exactly two towns, and each pair needs one road.', 'Number of pairs: $\\frac{' . $n . ' \\times ' . ($n - 1) . '}{2} = ' . mlb_ncr($n, 2) . '$.'], 'Count the pairs of towns.', 'application', 50); },
    ];
    $f['MC-072'] = [
        static function (MlbRng $r) { $k = $r->int(0, 2);
            if ($k === 0) { $a = $r->int(12, 78); return mlb_typed('num', 'Two angles together make a right angle. One is $' . mlb_deg($a) . '$. What is the other, in degrees?', (string)(90 - $a),
                ['Angles that make a right angle add up to $' . mlb_deg(90) . '$ (they are complementary).', '$90 - ' . $a . ' = ' . (90 - $a) . '$.'], 'A right angle is 90°.', 'procedure', 25, ['unit' => '°']); }
            if ($k === 1) { $a = $r->int(20, 160); return mlb_typed('num', 'Two angles sit side by side on a straight line. One is $' . mlb_deg($a) . '$. What is the other, in degrees?', (string)(180 - $a),
                ['Angles on a straight line add up to $' . mlb_deg(180) . '$.', '$180 - ' . $a . ' = ' . (180 - $a) . '$.'], 'A straight line is half a turn.', 'procedure', 25, ['unit' => '°']); }
            $a = $r->int(60, 150); $b = $r->int(40, 150);
            return mlb_typed('num', 'Three angles meet at a point. Two of them are $' . mlb_deg($a) . '$ and $' . mlb_deg($b) . '$. What is the third, in degrees?', (string)(360 - $a - $b),
                ['Angles around a point add up to $' . mlb_deg(360) . '$.', '$360 - ' . $a . ' - ' . $b . ' = ' . (360 - $a - $b) . '$.'], 'A full turn is 360°.', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { $a = $r->pick([$r->int(5, 85), 90, $r->int(95, 175), $r->int(185, 355)]);
            $kind = $a < 90 ? 'Acute' : ($a === 90 ? 'Right' : ($a < 180 ? 'Obtuse' : 'Reflex'));
            $all = ['Acute' => 'less than 90°', 'Right' => 'exactly 90°', 'Obtuse' => 'between 90° and 180°', 'Reflex' => 'between 180° and 360°'];
            $wrong = []; foreach ($all as $t => $w) if ($t !== $kind) $wrong[] = [$t, 'A ' . mb_strtolower($t) . ' angle is ' . $w . '.'];
            return mlb_mcq($r, 'What kind of angle is $' . mlb_deg($a) . '$?', $kind, $wrong, [$kind . ' angles are ' . $all[$kind] . '.', '$' . mlb_deg($a) . '$ is ' . $all[$kind] . '.'], 'Compare it with 90° and 180°.', 'concept', 20); },
        static function (MlbRng $r) { $h = $r->int(1, 11); $m = $r->pick([0, 30]);
            $th = abs(30 * $h - 5.5 * $m); $ang = min($th, 360 - $th);
            return mlb_typed('num', 'What is the smaller angle between the hands of a clock at ' . $h . ':' . str_pad((string)$m, 2, '0', STR_PAD_LEFT) . '?', mlb_dec($ang),
                ['The hour hand moves $' . mlb_deg(30) . '$ an hour and $' . mlb_deg('0.5') . '$ a minute; the minute hand moves $' . mlb_deg(6) . '$ a minute.', 'Hour hand: $' . mlb_dec(30 * $h + 0.5 * $m) . '^\\circ$; minute hand: $' . (6 * $m) . '^\\circ$. The gap is $' . mlb_dec($th) . '^\\circ$' . ($th > 180 ? ', and the smaller angle is $360 - ' . mlb_dec($th) . ' = ' . mlb_dec($ang) . '^\\circ$' : '') . '.'],
                'Each hour mark is 30° apart — and at half past, the hour hand is halfway to the next one.', 'application', 60, ['unit' => '°']); },
        static function (MlbRng $r) { do { $x = $r->int(15, 45); $a = $r->int(2, 4); $b = 180 - ($a + 1) * $x; } while ($b < 5 || $b > 80);
            $L1 = '$' . $a . 'x + x + ' . $b . ' = 180$'; $L2 = '$' . ($a + 1) . 'x + ' . $b . ' = 180$'; $L3 = '$' . ($a + 1) . 'x = ' . (180 - $b) . '$';
            return mlb_error_of($r, 'Two angles on a straight line are $' . $a . 'x$ and $(x + ' . $b . ')^\\circ$. Find the first mistake in this working for $x$.', [$L1, $L2, $L3, '$x = ' . $x . '$'], [
                [0, ['$' . $a . 'x + x + ' . $b . ' = 360$', '$' . ($a + 1) . 'x + ' . $b . ' = 360$', '$' . ($a + 1) . 'x = ' . (360 - $b) . '$', '$x = ' . mlb_dec((360 - $b) / ($a + 1)) . '$'], 'angles on a straight line add up to 180°; 360° is a full turn.'],
                [1, [$L1, '$' . $a . 'x + ' . $b . ' = 180$', '$' . $a . 'x = ' . (180 - $b) . '$', '$x = ' . mlb_dec((180 - $b) / $a) . '$'], '$' . $a . 'x + x$ is $' . ($a + 1) . 'x$: the lone $x$ counts as one.'],
                [2, [$L1, $L2, '$' . ($a + 1) . 'x = ' . (180 + $b) . '$', '$x = ' . mlb_dec((180 + $b) / ($a + 1)) . '$'], 'taking $' . $b . '$ from both sides gives $' . (180 - $b) . '$, not $' . (180 + $b) . '$.'],
            ]); },
    ];
    $f['MC-073'] = [
        static function (MlbRng $r) { $a = $r->int(35, 145); $rel = $r->pick(['corresponding', 'alternate', 'co-interior']);
            $ans = $rel === 'co-interior' ? 180 - $a : $a;
            return mlb_typed('num', 'Two parallel lines are cut by a transversal. Angle $p = ' . mlb_deg($a) . '$. Angle $q$ is ' . ($rel === 'co-interior' ? 'a co-interior (allied) angle' : 'an ' . $rel . ' angle') . ' to $p$. Find $q$ in degrees.', (string)$ans,
                [$rel === 'co-interior' ? 'Co-interior angles add up to $' . mlb_deg(180) . '$.' : ucfirst($rel) . ' angles are equal.', $rel === 'co-interior' ? '$q = 180 - ' . $a . ' = ' . $ans . '^\\circ$.' : '$q = ' . $a . '^\\circ$.'],
                'F-angles are equal, Z-angles are equal, C-angles add to 180°.', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { do { $x = $r->int(10, 40); $a = $r->int(2, 4); $c = $r->int(1, 3); $b = $r->int(-10, 30); $d = 180 - $a * $x - $b - $c * $x; } while ($d < -20 || $d > 60 || $a * $x + $b <= 10 || $c * $x + $d <= 10);
            return mlb_typed('num', 'Two parallel lines are cut by a transversal. Two co-interior angles are $(' . mlb_lterm($a, 'x') . mlb_sterm($b) . ')^\\circ$ and $(' . mlb_lterm($c, 'x') . mlb_sterm($d) . ')^\\circ$. Find $x$.', (string)$x,
                ['Co-interior angles add up to $' . mlb_deg(180) . '$: $' . mlb_lterm($a + $c, 'x') . mlb_sterm($b + $d) . ' = 180$.', '$' . mlb_lterm($a + $c, 'x') . ' = ' . (180 - $b - $d) . '$, so $x = ' . $x . '$.'],
                'Write the angle fact as an equation.', 'application', 60); },
        static function (MlbRng $r) {
            $defs = [['Alternate angles', 'are equal and lie on opposite sides of the transversal, between the parallel lines (a Z shape)'], ['Corresponding angles', 'are equal and sit in matching positions at each crossing (an F shape)'],
                     ['Co-interior angles', 'lie on the same side of the transversal, between the parallel lines, and add up to 180° (a C shape)'], ['Vertically opposite angles', 'are equal and face each other where two lines cross (an X shape)']];
            [$right, $what] = $defs[$r->int(0, 3)];
            $wrong = []; foreach ($defs as [$t, $w]) if ($t !== $right) $wrong[] = [$t, $t . ' ' . $w . '.'];
            return mlb_mcq($r, 'Which angles ' . $what . '?', $right, $wrong, [$right . ' ' . $what . '.', 'Look for the letter shape the two angles make.'], 'Z, F, C or X?', 'concept', 25); },
        static function (MlbRng $r) { $a = $r->int(40, 140);
            $L1 = 'Angle $p = ' . mlb_deg($a) . '$ and angle $q$ are co-interior.'; $L2 = 'Co-interior angles add up to $' . mlb_deg(180) . '$.';
            return mlb_error_of($r, 'Find the first mistake in this reasoning about two parallel lines cut by a transversal.', [$L1, $L2, '$q = 180 - ' . $a . ' = ' . (180 - $a) . '^\\circ$'], [
                [1, [$L1, 'Co-interior angles are equal.', '$q = ' . mlb_deg($a) . '$'], 'co-interior (C-shaped) angles ADD to 180°; it is alternate and corresponding angles that are equal.'],
                [2, [$L1, $L2, '$q = 360 - ' . $a . ' = ' . (360 - $a) . '^\\circ$'], 'they add to 180°, so $q = 180 - ' . $a . '$.'],
            ]); },
    ];
    $f['MC-074'] = [
        static function (MlbRng $r) { $a = $r->int(25, 95); $b = $r->int(20, 150 - $a);
            return mlb_typed('num', 'Two angles of a triangle are $' . mlb_deg($a) . '$ and $' . mlb_deg($b) . '$. Find the third angle in degrees.', (string)(180 - $a - $b),
                ['The angles of a triangle add up to $' . mlb_deg(180) . '$.', '$180 - ' . $a . ' - ' . $b . ' = ' . (180 - $a - $b) . '$.'], 'Angle sum of a triangle.', 'procedure', 25, ['unit' => '°',
                'diagram' => mlb_fig(['A' => [0, 0], 'B' => [6, 0], 'C' => [2.2, 3.6]], [['A', 'B'], ['B', 'C'], ['C', 'A']], [['B', 'A', 'C', $a . '°'], ['A', 'B', 'C', $b . '°'], ['A', 'C', 'B', '?']])]); },
        static function (MlbRng $r) { $a = $r->int(30, 80); $b = $r->int(30, 80);
            return mlb_typed('num', 'In triangle $ABC$, side $BC$ is extended to $D$. $\\angle A = ' . mlb_deg($a) . '$ and $\\angle B = ' . mlb_deg($b) . '$. Find the exterior angle $\\angle ACD$ in degrees.', (string)($a + $b),
                ['An exterior angle of a triangle equals the sum of the two interior angles opposite it.', '$\\angle ACD = ' . $a . ' + ' . $b . ' = ' . ($a + $b) . '^\\circ$.'],
                'Which two interior angles are not next to it?', 'procedure', 35, ['unit' => '°']); },
        static function (MlbRng $r) { $apex = 2 * $r->int(10, 70);
            return mlb_typed('num', 'An isosceles triangle has an angle of $' . mlb_deg($apex) . '$ between its two equal sides. Find each of the other two angles, in degrees.', (string)((180 - $apex) / 2),
                ['The two base angles are equal and the three angles add up to $' . mlb_deg(180) . '$.', 'Each base angle $= \\frac{180 - ' . $apex . '}{2} = ' . ((180 - $apex) / 2) . '^\\circ$.'],
                'The angles opposite the equal sides are equal.', 'procedure', 35, ['unit' => '°']); },
        static function (MlbRng $r) { $b = $r->int(35, 80);
            return mlb_mcq($r, 'An isosceles triangle has two base angles of $' . mlb_deg($b) . '$ each. What is the third angle?', (180 - 2 * $b) . '°',
                [[(180 - $b) . '°', 'Only one base angle was taken away — there are two equal angles of ' . $b . '°.'], [$b . '°', 'Isosceles is not equilateral: only two angles are equal.'], [(2 * $b) . '°', 'The two base angles were added, but not taken from 180°.']],
                ['The two base angles together make $2 \\times ' . $b . ' = ' . (2 * $b) . '^\\circ$.', 'The third angle is $180 - ' . (2 * $b) . ' = ' . (180 - 2 * $b) . '^\\circ$.'], 'How many angles are ' . $b . '°?', 'reasoning', 30); },
        static function (MlbRng $r) { $apex = 2 * $r->int(35, 70);
            return mlb_typed('num', 'A roof frame is an isosceles triangle. The angle at the top, between the two equal rafters, is $' . mlb_deg($apex) . '$. What angle does each rafter make with the horizontal beam?', (string)((180 - $apex) / 2),
                ['The beam is the base; the two base angles are equal.', '$\\frac{180 - ' . $apex . '}{2} = ' . ((180 - $apex) / 2) . '^\\circ$.'], 'Model the roof as a triangle.', 'application', 45, ['unit' => '°']); },
    ];
    $f['MC-075'] = [
        static function (MlbRng $r) { $n = $r->int(5, 12); $names = [5 => 'pentagon', 6 => 'hexagon', 7 => 'heptagon', 8 => 'octagon', 9 => 'nonagon', 10 => 'decagon', 11 => 'hendecagon', 12 => 'dodecagon'];
            return mlb_typed('num', 'What is the sum of the interior angles of a ' . $names[$n] . ' (' . $n . ' sides), in degrees?', (string)(($n - 2) * 180),
                ['A polygon with $n$ sides splits into $n - 2$ triangles from one corner.', '$(' . $n . ' - 2) \\times 180 = ' . (($n - 2) * 180) . '^\\circ$.'], 'How many triangles fit inside from one corner?', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { $n = $r->pick([5, 6, 8, 9, 10, 12, 15, 18, 20]); $k = $r->int(0, 1);
            if ($k === 0) return mlb_typed('num', 'Each interior angle of a regular polygon with ' . $n . ' sides is how many degrees?', mlb_dec(180 - 360 / $n),
                ['Each exterior angle is $\\frac{360}{' . $n . '} = ' . mlb_dec(360 / $n) . '^\\circ$.', 'Interior $= 180 - ' . mlb_dec(360 / $n) . ' = ' . mlb_dec(180 - 360 / $n) . '^\\circ$.'], 'The exterior angles of any polygon add up to 360°.', 'procedure', 40, ['unit' => '°']);
            return mlb_typed('num', 'Each exterior angle of a regular polygon is $' . mlb_deg(mlb_dec(360 / $n)) . '$. How many sides does it have?', (string)$n,
                ['The exterior angles of a polygon add up to $' . mlb_deg(360) . '$.', '$n = \\frac{360}{' . mlb_dec(360 / $n) . '} = ' . $n . '$.'], 'Exterior angles make one full turn.', 'procedure', 35); },
        static function (MlbRng $r) { do { $a = $r->int(50, 130); $b = $r->int(50, 130); $c = $r->int(50, 130); } while (360 - $a - $b - $c < 30 || 360 - $a - $b - $c > 170);
            return mlb_typed('num', 'Three angles of a quadrilateral are $' . mlb_deg($a) . '$, $' . mlb_deg($b) . '$ and $' . mlb_deg($c) . '$. Find the fourth, in degrees.', (string)(360 - $a - $b - $c),
                ['A quadrilateral splits into two triangles, so its angles add up to $' . mlb_deg(360) . '$.', '$360 - ' . $a . ' - ' . $b . ' - ' . $c . ' = ' . (360 - $a - $b - $c) . '$.'], 'Two triangles make a quadrilateral.', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { $n = $r->pick([5, 6, 8, 9, 10, 12]); $int = 180 - 360 / $n; $ext = 360 / $n;
            return mlb_mcq($r, 'What is each interior angle of a regular polygon with ' . $n . ' sides?', mlb_dec($int) . '°',
                [[mlb_dec($ext) . '°', 'That is the EXTERIOR angle ($360 \\div ' . $n . '$). The interior angle is $180$ minus it.'], [(($n - 2) * 180) . '°', 'That is the SUM of all the interior angles; divide it by ' . $n . '.'], [mlb_dec(360 / $n * 2) . '°', 'The angle at the centre and the interior angle are different angles.']],
                ['Each exterior angle is $\\frac{360}{' . $n . '} = ' . mlb_dec($ext) . '^\\circ$.', 'Interior $= 180 - ' . mlb_dec($ext) . ' = ' . mlb_dec($int) . '^\\circ$.'], 'Interior + exterior = 180°.', 'reasoning', 40); },
        static function (MlbRng $r) { [$name, $n] = $r->pick([['equilateral triangles', 3], ['squares', 4], ['regular hexagons', 6]]); $int = 180 - 360 / $n;
            return mlb_typed('num', 'A floor is tiled with ' . $name . ' that fit together with no gaps. How many tiles meet at each corner point?', (string)(360 / $int),
                ['Each interior angle of a regular polygon with ' . $n . ' sides is $' . $int . '^\\circ$.', 'The angles at a point make $' . mlb_deg(360) . '$: $\\frac{360}{' . $int . '} = ' . (360 / $int) . '$ tiles.'], 'The angles around a point make 360°.', 'application', 50); },
    ];
    $f['MC-076'] = [
        static function (MlbRng $r) { $a = $r->int(2, 9); $k = $r->pick([2, 3, 4, 5]); $c = $r->int(3, 12);
            $b = $a * $k; $ans = $c * $k;
            return mlb_typed('num', 'Triangles $PQR$ and $XYZ$ are similar, with $P$ matching $X$, $Q$ matching $Y$ and $R$ matching $Z$. $PQ = ' . $a . '$ cm, $XY = ' . $b . '$ cm and $QR = ' . $c . '$ cm. Find $YZ$ in cm.', (string)$ans,
                ['Similar shapes have every length multiplied by the same scale factor.', 'Scale factor $= \\frac{XY}{PQ} = \\frac{' . $b . '}{' . $a . '} = ' . $k . '$, so $YZ = ' . $c . ' \\times ' . $k . ' = ' . $ans . '$ cm.'],
                'Find the scale factor from the pair of sides you know.', 'procedure', 45, ['unit' => 'cm']); },
        static function (MlbRng $r) { $p = $r->int(1, 3); $q = $r->int($p + 1, 5); $a = $p * $p * $r->int(2, 9);
            $big = intdiv($a * $q * $q, $p * $p);
            return mlb_typed('num', 'Two similar shapes have lengths in the ratio $' . $p . ' : ' . $q . '$. The smaller one has an area of $' . $a . '\\ \\text{cm}^2$. What is the area of the larger one, in $\\text{cm}^2$?', (string)$big,
                ['Areas scale by the SQUARE of the length scale factor: $\\left(\\frac{' . $q . '}{' . $p . '}\\right)^2 = \\frac{' . ($q * $q) . '}{' . ($p * $p) . '}$.', '$' . $a . ' \\times \\frac{' . ($q * $q) . '}{' . ($p * $p) . '} = ' . $big . '\\ \\text{cm}^2$.'],
                'An area has two lengths in it.', 'application', 50, ['unit' => 'cm²']); },
        static function (MlbRng $r) {
            $cases = [['SAS', 'two sides and the angle between them are equal'], ['SSS', 'all three sides are equal'], ['ASA', 'two angles and the side between them are equal'], ['RHS', 'both have a right angle, and the hypotenuses and one other side are equal']];
            [$right, $what] = $cases[$r->int(0, 3)];
            $wrong = []; foreach ($cases as [$t, $w]) if ($t !== $right) $wrong[] = [$t, $t . ' is used when ' . $w . '.'];
            $wrong[] = ['AAA', 'Equal angles alone make triangles SIMILAR, not congruent — one can be bigger than the other.'];
            return mlb_mcq($r, 'Two triangles are known to have: ' . $what . '. Which condition proves they are congruent?', $right, $wrong, [$right . ': ' . $what . '.', 'Congruent means exactly the same shape AND size.'], 'Match the facts you are given to a condition.', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(2, 6); $k = $r->int(2, 4); $c = $r->int(3, 9);
            $L1 = 'Scale factor $= \\frac{XY}{PQ} = \\frac{' . ($a * $k) . '}{' . $a . '} = ' . $k . '$'; $L2 = '$YZ = QR \\times ' . $k . '$';
            return mlb_error_of($r, 'Triangle $XYZ$ is an enlargement of $PQR$. $PQ = ' . $a . '$, $XY = ' . ($a * $k) . '$, $QR = ' . $c . '$. Find the first mistake in this working for $YZ$.', [$L1, $L2, '$YZ = ' . ($c * $k) . '$'], [
                [0, ['Scale factor $= \\frac{PQ}{XY} = \\frac{' . $a . '}{' . ($a * $k) . '} = ' . mlb_ftex(1, $k) . '$', '$YZ = QR \\times ' . mlb_ftex(1, $k) . '$', '$YZ = ' . mlb_ftex($c, $k) . '$'], 'going from the small shape to the large one, the scale factor is new ÷ old $= \\frac{XY}{PQ}$.'],
                [1, [$L1, '$YZ = QR + ' . $k . '$', '$YZ = ' . ($c + $k) . '$'], 'an enlargement MULTIPLIES every length by the scale factor; it does not add to it.'],
                [2, [$L1, $L2, '$YZ = ' . ($c * $k * $k) . '$'], 'lengths scale by $' . $k . '$; only areas scale by $' . $k . '^2$.'],
            ]); },
    ];
    $f['MC-077'] = [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3); [$a, $b, $c] = [$a * $k, $b * $k, $c * $k];
            return mlb_typed('num', 'A right-angled triangle has shorter sides of $' . $a . '$ cm and $' . $b . '$ cm. How long is the hypotenuse, in cm?', (string)$c,
                ['$c^2 = a^2 + b^2 = ' . ($a * $a) . ' + ' . ($b * $b) . ' = ' . ($c * $c) . '$.', '$c = \\sqrt{' . ($c * $c) . '} = ' . $c . '$ cm.'], 'Square, add, square root.', 'procedure', 45, ['unit' => 'cm',
                'diagram' => mlb_fig(['A' => [0, 0], 'B' => [4, 0], 'C' => [0, 3]], [['A', 'B', $b . ' cm'], ['B', 'C', '?'], ['C', 'A', $a . ' cm']], [], ['right' => [['B', 'A', 'C']]])]); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3); [$a, $b, $c] = [$a * $k, $b * $k, $c * $k];
            return mlb_typed('num', 'A ladder $' . $c . '$ m long leans against a wall. Its foot is $' . $a . '$ m from the wall. How high up the wall does it reach, in metres?', (string)$b,
                ['The ladder is the hypotenuse: $h^2 = ' . $c . '^2 - ' . $a . '^2 = ' . ($c * $c) . ' - ' . ($a * $a) . ' = ' . ($b * $b) . '$.', '$h = ' . $b . '$ m.'], 'Subtract when you are finding a shorter side.', 'application', 50, ['unit' => 'm']); },
        static function (MlbRng $r) { do { $a = $r->int(2, 12); $b = $r->int(2, 12); $h = sqrt($a * $a + $b * $b); } while (floor($h) == $h);
            return mlb_typed('num', 'A right-angled triangle has shorter sides $' . $a . '$ cm and $' . $b . '$ cm. Find the hypotenuse, correct to 1 decimal place.', mlb_rd($h, 1),
                ['$c^2 = ' . ($a * $a) . ' + ' . ($b * $b) . ' = ' . ($a * $a + $b * $b) . '$.', '$c = \\sqrt{' . ($a * $a + $b * $b) . '} = ' . mlb_rd($h, 4) . '\\ldots \\approx ' . mlb_rd($h, 1) . '$ cm.'], 'Round only at the very end.', 'procedure', 50, ['unit' => 'cm', 'dp' => 1]); },
        static function (MlbRng $r) { $right = $r->int(0, 1) === 1;
            if ($right) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 2); [$a, $b, $c] = [$a * $k, $b * $k, $c * $k]; }
            else { do { $a = $r->int(4, 15); $b = $r->int($a, 18); $c = $r->int($b + 1, $a + $b - 1); } while ($a * $a + $b * $b === $c * $c); }
            return mlb_mcq($r, 'A triangle has sides $' . $a . '$, $' . $b . '$ and $' . $c . '$. Is it right-angled?', $right ? 'Yes' : 'No',
                [[$right ? 'No' : 'Yes', 'Check whether the two shorter sides squared add up to the longest side squared.'], ['You cannot tell without measuring the angles', 'Pythagoras works backwards too: the side lengths decide it.']],
                ['$' . $a . '^2 + ' . $b . '^2 = ' . ($a * $a + $b * $b) . '$ and $' . $c . '^2 = ' . ($c * $c) . '$.', $right ? 'They are equal, so the triangle is right-angled.' : 'They are not equal, so it is not right-angled.'], 'Does $a^2 + b^2 = c^2$?', 'reasoning', 35); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 2); [$a, $b, $c] = [$a * $k, $b * $k, $c * $k];
            $L1 = '$a^2 + ' . $b . '^2 = ' . $c . '^2$'; $L2 = '$a^2 = ' . ($c * $c) . ' - ' . ($b * $b) . '$'; $L3 = '$a^2 = ' . ($a * $a) . '$';
            return mlb_error_of($r, 'A right-angled triangle has hypotenuse $' . $c . '$ cm and one other side $' . $b . '$ cm. Find the first mistake in this working for the third side $a$.', [$L1, $L2, $L3, '$a = ' . $a . '$ cm'], [
                [0, ['$a^2 = ' . $b . '^2 + ' . $c . '^2$', '$a^2 = ' . ($b * $b) . ' + ' . ($c * $c) . '$', '$a^2 = ' . ($b * $b + $c * $c) . '$', '$a = \\sqrt{' . ($b * $b + $c * $c) . '}$ cm'], 'the HYPOTENUSE is the longest side, so it goes on its own: $a^2 + ' . $b . '^2 = ' . $c . '^2$.'],
                [1, [$L1, '$a^2 = ' . ($c * $c) . ' + ' . ($b * $b) . '$', '$a^2 = ' . ($c * $c + $b * $b) . '$', '$a = \\sqrt{' . ($c * $c + $b * $b) . '}$ cm'], 'moving $' . $b . '^2$ across changes its sign: $a^2 = ' . ($c * $c) . ' - ' . ($b * $b) . '$.'],
                [3, [$L1, $L2, $L3, '$a = ' . intdiv($a * $a, 2) . '$ cm'], 'the square root of $' . ($a * $a) . '$ is $' . $a . '$; halving is not the inverse of squaring.'],
            ]); },
    ];
    $f['MC-078'] = [
        static function (MlbRng $r) { $k = $r->int(1, 6); $rad = 7 * $k; $d = $r->int(0, 1);
            return mlb_typed('num', 'A circle has ' . ($d ? 'diameter $' . (2 * $rad) . '$' : 'radius $' . $rad . '$') . ' cm. Taking $\\pi = \\frac{22}{7}$, find its circumference in cm.', (string)(44 * $k),
                ['$C = 2\\pi r = \\pi d$.', '$C = 2 \\times \\frac{22}{7} \\times ' . $rad . ' = ' . (44 * $k) . '$ cm.'], 'Circumference is π times the diameter.', 'procedure', 40, ['unit' => 'cm']); },
        static function (MlbRng $r) { $rad = 7 * $r->int(1, 4); $th = $r->pick([30, 45, 60, 72, 90, 120, 135, 150, 210, 270]); $arc = $th / 360 * 2 * 22 / 7 * $rad;
            return mlb_typed('num', 'An arc of a circle of radius $' . $rad . '$ cm subtends an angle of $' . mlb_deg($th) . '$ at the centre. Taking $\\pi = \\frac{22}{7}$, find the arc length correct to 1 decimal place.', mlb_rd($arc, 1),
                ['Arc length $= \\frac{\\theta}{360} \\times 2\\pi r$.', '$\\frac{' . $th . '}{360} \\times 2 \\times \\frac{22}{7} \\times ' . $rad . ' = ' . mlb_rd($arc, 3) . '\\ldots \\approx ' . mlb_rd($arc, 1) . '$ cm.'],
                'The arc is the same fraction of the circumference as the angle is of 360°.', 'procedure', 55, ['unit' => 'cm', 'dp' => 1]); },
        static function (MlbRng $r) {
            $defs = [['Chord', 'a straight line joining two points on the circle'], ['Tangent', 'a straight line that touches the circle at exactly one point'], ['Sector', 'the region between two radii and an arc'],
                     ['Segment', 'the region between a chord and an arc'], ['Diameter', 'a chord that passes through the centre']];
            [$right, $what] = $defs[$r->int(0, 4)];
            $wrong = []; foreach ($defs as [$t, $w]) if ($t !== $right) $wrong[] = [$t, 'A ' . mb_strtolower($t) . ' is ' . $w . '.'];
            return mlb_mcq($r, 'What is ' . $what . ' called?', $right, array_slice($wrong, 0, 3), ['A ' . mb_strtolower($right) . ' is ' . $what . '.', 'Sector: a slice like a pizza. Segment: cut off by a chord.'], 'Picture each one.', 'concept', 25); },
        static function (MlbRng $r) { $k = $r->int(1, 5); $rad = 7 * $k * 5; $n = $r->int(10, 200);
            return mlb_typed('num', 'A bicycle wheel has a radius of $' . $rad . '$ cm. Taking $\\pi = \\frac{22}{7}$, how far does the bicycle travel when the wheel turns ' . $n . ' times? Give your answer in metres.', mlb_dec(2 * 22 * $rad * $n / 7 / 100),
                ['One turn moves the bicycle one circumference: $2 \\times \\frac{22}{7} \\times ' . $rad . ' = ' . (2 * 22 * $rad / 7) . '$ cm.', '$' . $n . ' \\times ' . (2 * 22 * $rad / 7) . ' = ' . mlb_n(2 * 22 * $rad * $n / 7) . '$ cm $= ' . mlb_dec(2 * 22 * $rad * $n / 7 / 100) . '$ m.'], 'One turn rolls out one circumference.', 'application', 60, ['unit' => 'm']); },
        static function (MlbRng $r) { $k = $r->pick([2, 3, 4]);
            return mlb_mcq($r, 'The radius of a circle is multiplied by $' . $k . '$. Its circumference is multiplied by…', (string)$k,
                [[(string)($k * $k), 'That is what happens to the AREA. Circumference is a length, $2\\pi r$, so it grows like $r$.'], [(string)(2 * $k), 'The 2 in $2\\pi r$ is already there; only $r$ changes.'], ['It stays the same', 'A bigger circle has a longer way round.']],
                ['$C = 2\\pi r$ is proportional to $r$.', 'Multiply $r$ by $' . $k . '$ and $C$ is multiplied by $' . $k . '$.'], 'How does $r$ appear in $2\\pi r$?', 'reasoning', 30); },
    ];
    $f['MC-079'] = [
        static function (MlbRng $r) { $a = $r->int(20, 85); $k = $r->int(0, 1);
            return $k ? mlb_typed('num', 'An arc subtends an angle of $' . mlb_deg($a) . '$ at a point on the circumference. What angle does it subtend at the centre, in degrees?', (string)(2 * $a),
                    ['The angle at the centre is twice the angle at the circumference on the same arc.', '$2 \\times ' . $a . ' = ' . (2 * $a) . '^\\circ$.'], 'Centre angle = 2 × circumference angle.', 'procedure', 30, ['unit' => '°'])
                : mlb_typed('num', 'An arc subtends an angle of $' . mlb_deg(2 * $a) . '$ at the centre of a circle. What angle does it subtend at a point on the remaining circumference, in degrees?', (string)$a,
                    ['The angle at the circumference is half the angle at the centre.', '$\\frac{' . (2 * $a) . '}{2} = ' . $a . '^\\circ$.'], 'Circumference angle = half the centre angle.', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { $a = $r->int(20, 70);
            return mlb_typed('num', '$AB$ is a diameter of a circle and $C$ is a point on the circle. $\\angle CAB = ' . mlb_deg($a) . '$. Find $\\angle CBA$ in degrees.', (string)(90 - $a),
                ['The angle in a semicircle is a right angle: $\\angle ACB = ' . mlb_deg(90) . '$.', '$\\angle CBA = 180 - 90 - ' . $a . ' = ' . (90 - $a) . '^\\circ$.'], 'What is $\\angle ACB$?', 'application', 40, ['unit' => '°']); },
        static function (MlbRng $r) { $a = $r->int(55, 125);
            return mlb_typed('num', '$ABCD$ is a cyclic quadrilateral (all four corners lie on a circle). $\\angle A = ' . mlb_deg($a) . '$. Find $\\angle C$ in degrees.', (string)(180 - $a),
                ['Opposite angles of a cyclic quadrilateral add up to $' . mlb_deg(180) . '$.', '$\\angle C = 180 - ' . $a . ' = ' . (180 - $a) . '^\\circ$.'], '$A$ and $C$ are opposite.', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { $a = $r->int(20, 80);
            return mlb_typed('num', 'A tangent touches a circle with centre $O$ at $T$. A line from $O$ to a point $P$ on the tangent makes $\\angle TOP = ' . mlb_deg($a) . '$. Find $\\angle OPT$ in degrees.', (string)(90 - $a),
                ['A tangent is perpendicular to the radius at the point of contact: $\\angle OTP = ' . mlb_deg(90) . '$.', '$\\angle OPT = 180 - 90 - ' . $a . ' = ' . (90 - $a) . '^\\circ$.'], 'Where does the right angle sit?', 'application', 40, ['unit' => '°']); },
        static function (MlbRng $r) { $a = $r->int(60, 125);
            return mlb_mcq($r, '$PQRS$ is a cyclic quadrilateral and $\\angle P = ' . mlb_deg($a) . '$. What is $\\angle R$?', (180 - $a) . '°',
                [[$a . '°', 'Opposite angles of a cyclic quadrilateral are SUPPLEMENTARY (add to 180°), not equal.'], [(360 - $a) . '°', 'The four angles add to 360°, but $P$ and $R$ alone add to 180°.'], [(2 * $a > 180 ? 2 * $a - 180 : 2 * $a) . '°', 'Doubling is the centre-and-circumference rule, which is a different theorem.']],
                ['$P$ and $R$ are opposite corners of a cyclic quadrilateral, so they add up to $' . mlb_deg(180) . '$.', '$\\angle R = 180 - ' . $a . ' = ' . (180 - $a) . '^\\circ$.'], 'Opposite corners on a circle.', 'reasoning', 30); },
    ];
    $f['MC-080'] = [
        static function (MlbRng $r) {
            $cases = [['the perpendicular bisector of the segment joining them', 'equidistant from two fixed points'], ['a circle centred on the point', 'at a fixed distance from one point'],
                      ['the bisectors of the angles between the lines', 'equidistant from two intersecting lines'], ['a pair of lines parallel to it, one on each side', 'at a fixed distance from a straight line']];
            [$right, $what] = $cases[$r->int(0, 3)];
            $wrong = []; foreach ($cases as [$t, $w]) if ($t !== $right) $wrong[] = [ucfirst($t), 'That is the locus of points ' . $w . '.'];
            return mlb_mcq($r, 'What is the locus of points that are ' . $what . '?', ucfirst($right), $wrong, ['The locus of points ' . $what . ' is ' . $right . '.', 'Mark several such points and see what they make.'], 'Plot a few points that obey the rule.', 'concept', 35); },
        static function (MlbRng $r) { $c = $r->pick([[60, 1, 30], [60, 2, 15], [90, 1, 45], [90, 2, '22.5'], [120, 1, 60], [60, 0, 60]]); [$base, $times, $ans] = $c;
            $txt = $times === 0 ? 'construct an equilateral triangle and use one of its corners' : 'construct a $' . mlb_deg($base) . '$ angle and bisect it' . ($times === 2 ? ', then bisect one of the halves' : '');
            return mlb_typed('num', 'With a ruler and compasses, you ' . $txt . '. What angle do you end up with, in degrees?', (string)$ans,
                [$times === 0 ? 'Each angle of an equilateral triangle is $' . mlb_deg(60) . '$.' : 'Bisecting halves an angle.', $times === 0 ? 'So the angle is $' . mlb_deg(60) . '$.' : '$' . $base . ($times === 2 ? ' \\div 2 \\div 2' : ' \\div 2') . ' = ' . $ans . '^\\circ$.'],
                'Bisect = cut exactly in half.', 'reasoning', 35, ['unit' => '°']); },
        static function (MlbRng $r) { $d = $r->int(4, 15);
            return mlb_typed('num', 'Point $P$ lies on the perpendicular bisector of the segment $AB$, and $PA = ' . $d . '$ cm. How long is $PB$, in cm?', (string)$d,
                ['Every point on the perpendicular bisector of $AB$ is the same distance from $A$ as from $B$.', 'So $PB = PA = ' . $d . '$ cm.'], 'What does the perpendicular bisector promise?', 'reasoning', 30, ['unit' => 'cm']); },
        static function (MlbRng $r) { $a = 2 * $r->int(2, 6); $y = $r->int(2, 7);
            return mlb_mcq($r, '$A$ is at $(0, 0)$ and $B$ is at $(' . $a . ', 0)$. Which point is the same distance from $A$ as from $B$?', '$(' . ($a / 2) . ', ' . $y . ')$',
                [['$(' . $a . ', ' . $y . ')$', 'That is directly above $B$ — much closer to $B$ than to $A$.'], ['$(' . ($a / 2 + 1) . ', 0)$', 'That is on $AB$ but past the middle, so nearer $B$.'], ['$(0, ' . $y . ')$', 'That is directly above $A$, so nearer $A$.']],
                ['The points equidistant from $A$ and $B$ lie on the perpendicular bisector of $AB$: the line $x = ' . ($a / 2) . '$.', '$(' . ($a / 2) . ', ' . $y . ')$ is on that line.'], 'Where is the midpoint of $AB$?', 'concept', 35); },
        static function (MlbRng $r) { $k = $r->int(1, 3); $L = 7 * $k;
            return mlb_typed('num', 'A goat is tied to a post in the middle of a field by a rope $' . $L . '$ m long. The region it can reach is the locus of points within $' . $L . '$ m of the post. Taking $\\pi = \\frac{22}{7}$, what area can it graze, in $\\text{m}^2$?', (string)(154 * $k * $k),
                ['Points within a fixed distance of one point fill a circle of that radius.', '$A = \\frac{22}{7} \\times ' . $L . '^2 = ' . (154 * $k * $k) . '\\ \\text{m}^2$.'], 'What shape is the locus?', 'application', 50, ['unit' => 'm²']); },
    ];

    /* ══ Stage 9 · Measurement and Spatial Reasoning ═════════════════════ */
    $f['MC-081'] = [
        static function (MlbRng $r) { $W = $r->int(8, 20); $H = $r->int(6, 16); $a = $r->int(2, $W - 3); $b = $r->int(2, $H - 3);
            return mlb_typed('num', 'An L-shaped room is a $' . $W . '$ m by $' . $H . '$ m rectangle with a $' . $a . '$ m by $' . $b . '$ m rectangle cut from one corner. What is its perimeter, in metres?', (string)(2 * ($W + $H)),
                ['Push the two sides of the cut-out corner outwards: they line up with the missing corner exactly.', 'So the perimeter is the same as the full rectangle: $2(' . $W . ' + ' . $H . ') = ' . (2 * ($W + $H)) . '$ m.'],
                'Walk round the edge, or move the inside corner out.', 'reasoning', 60, ['unit' => 'm']); },
        static function (MlbRng $r) { $k = $r->int(1, 5); $rad = 7 * $k;
            return mlb_typed('num', 'A semicircular window has a diameter of $' . (2 * $rad) . '$ cm. Taking $\\pi = \\frac{22}{7}$, find the perimeter of the window (the curve and the straight edge), in cm.', (string)(22 * $k + 14 * $k),
                ['Curved part $= \\frac{1}{2} \\times 2\\pi r = \\frac{22}{7} \\times ' . $rad . ' = ' . (22 * $k) . '$ cm.', 'Add the straight edge, the diameter: $' . (22 * $k) . ' + ' . (2 * $rad) . ' = ' . (36 * $k) . '$ cm.'],
                'Do not forget the straight edge.', 'application', 60, ['unit' => 'cm']); },
        static function (MlbRng $r) { $l = $r->int(5, 15); $w = $r->int(2, $l - 1);
            return mlb_mcq($r, 'What is the perimeter of a rectangle $' . $l . '$ cm long and $' . $w . '$ cm wide?', (2 * ($l + $w)) . ' cm',
                [[($l * $w) . ' cm', 'That is the AREA (length × width), which is measured in square cm.'], [($l + $w) . ' cm', 'That is only half the way round: there are two lengths and two widths.'], [(2 * $l + $w) . ' cm', 'One width has been left out.']],
                ['The perimeter is the distance all the way round: two lengths and two widths.', '$2(' . $l . ' + ' . $w . ') = ' . (2 * ($l + $w)) . '$ cm.'], 'Walk round the edge.', 'concept', 25); },
        static function (MlbRng $r) { $l = $r->int(6, 25); $w = $r->int(2, $l);
            return mlb_typed('num', 'A rectangle is $' . $l . '$ cm long and has a perimeter of $' . (2 * ($l + $w)) . '$ cm. How wide is it, in cm?', (string)$w,
                ['$2(' . $l . ' + w) = ' . (2 * ($l + $w)) . '$, so $' . $l . ' + w = ' . ($l + $w) . '$.', '$w = ' . ($l + $w) . ' - ' . $l . ' = ' . $w . '$ cm.'], 'Halve the perimeter first.', 'procedure', 40, ['unit' => 'cm']); },
    ];
    $f['MC-082'] = [
        static function (MlbRng $r) { $k = $r->int(0, 2); $b = $r->int(4, 20); $h = 2 * $r->int(2, 9);
            if ($k === 0) return mlb_typed('num', 'Find the area of a triangle with base $' . $b . '$ cm and perpendicular height $' . $h . '$ cm, in $\\text{cm}^2$.', (string)($b * $h / 2),
                ['Area $= \\frac{1}{2} \\times \\text{base} \\times \\text{height}$.', '$\\frac{1}{2} \\times ' . $b . ' \\times ' . $h . ' = ' . ($b * $h / 2) . '\\ \\text{cm}^2$.'], 'A triangle is half of a rectangle.', 'procedure', 30, ['unit' => 'cm²']);
            if ($k === 1) return mlb_typed('num', 'A parallelogram has base $' . $b . '$ cm and perpendicular height $' . $h . '$ cm. Find its area in $\\text{cm}^2$.', (string)($b * $h),
                ['Area $= \\text{base} \\times \\text{perpendicular height}$.', '$' . $b . ' \\times ' . $h . ' = ' . ($b * $h) . '\\ \\text{cm}^2$.'], 'Cut off a triangle and slide it across: a rectangle.', 'procedure', 30, ['unit' => 'cm²']);
            $a = $r->int(3, 15);
            return mlb_typed('num', 'A trapezium has parallel sides of $' . $a . '$ cm and $' . $b . '$ cm, $' . $h . '$ cm apart. Find its area in $\\text{cm}^2$.', (string)(($a + $b) * $h / 2),
                ['Area $= \\frac{1}{2}(a + b)h$.', '$\\frac{1}{2}(' . $a . ' + ' . $b . ') \\times ' . $h . ' = ' . (($a + $b) * $h / 2) . '\\ \\text{cm}^2$.'], 'Average the parallel sides, times the height.', 'procedure', 40, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $b = 2 * $r->int(3, 12); $h = $r->int(3, 15);
            return mlb_typed('num', 'A triangle has an area of $' . ($b * $h / 2) . '\\ \\text{cm}^2$ and a base of $' . $b . '$ cm. Find its perpendicular height in cm.', (string)$h,
                ['$\\frac{1}{2} \\times ' . $b . ' \\times h = ' . ($b * $h / 2) . '$, so $' . ($b / 2) . 'h = ' . ($b * $h / 2) . '$.', '$h = ' . $h . '$ cm.'], 'Put what you know into the area formula and solve.', 'application', 40, ['unit' => 'cm']); },
        static function (MlbRng $r) { $a = $r->int(3, 10); $b = $r->int($a + 2, 16); $h = 2 * $r->int(2, 7); $A = ($a + $b) * $h / 2;
            $L1 = '$A = \\frac{1}{2}(a + b)h$'; $L2 = '$= \\frac{1}{2}(' . $a . ' + ' . $b . ') \\times ' . $h . '$'; $L3 = '$= \\frac{1}{2} \\times ' . ($a + $b) . ' \\times ' . $h . '$';
            return mlb_error_of($r, 'Find the first mistake in this working for the area of a trapezium with parallel sides $' . $a . '$ cm and $' . $b . '$ cm, $' . $h . '$ cm apart.', [$L1, $L2, $L3, '$= ' . $A . '\\ \\text{cm}^2$'], [
                [0, ['$A = (a + b)h$', '$= (' . $a . ' + ' . $b . ') \\times ' . $h . '$', '$= ' . ($a + $b) . ' \\times ' . $h . '$', '$= ' . (2 * $A) . '\\ \\text{cm}^2$'], 'the formula has a half in it: a trapezium is half of a parallelogram with base $a + b$.'],
                [2, [$L1, $L2, '$= \\frac{1}{2} \\times ' . ($a * $b) . ' \\times ' . $h . '$', '$= ' . ($a * $b * $h / 2) . '\\ \\text{cm}^2$'], 'the parallel sides are added, not multiplied: $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.'],
                [3, [$L1, $L2, $L3, '$= ' . (($a + $b) * $h) . '\\ \\text{cm}^2$'], 'the half was dropped at the last step: $\\frac{1}{2} \\times ' . ($a + $b) . ' \\times ' . $h . ' = ' . $A . '$.'],
            ]); },
        static function (MlbRng $r) { $b = $r->int(5, 14); $h = $r->int(3, 10); $s = $h + $r->int(1, 4);
            return mlb_mcq($r, 'A triangle has base $' . $b . '$ cm, a sloping side of $' . $s . '$ cm and a perpendicular height of $' . $h . '$ cm. What is its area?', ($b * $h / 2) . ' cm²',
                [[($b * $s / 2) . ' cm²', 'The height must be PERPENDICULAR to the base, not the sloping side.'], [($b * $h) . ' cm²', 'A triangle is half of the rectangle: halve it.'], [($b + $h + $s) . ' cm²', 'Adding the lengths gives a perimeter-like total, not an area.']],
                ['Area $= \\frac{1}{2} \\times \\text{base} \\times \\text{perpendicular height}$.', '$\\frac{1}{2} \\times ' . $b . ' \\times ' . $h . ' = ' . ($b * $h / 2) . '\\ \\text{cm}^2$.'], 'Which height meets the base at a right angle?', 'concept', 35); },
    ];
    $f['MC-083'] = [
        static function (MlbRng $r) { $k = $r->int(1, 4); $rad = 7 * $k;
            return mlb_typed('num', 'Taking $\\pi = \\frac{22}{7}$, find the area of a circle of radius $' . $rad . '$ cm, in $\\text{cm}^2$.', (string)(154 * $k * $k),
                ['$A = \\pi r^2$.', '$\\frac{22}{7} \\times ' . $rad . '^2 = ' . (154 * $k * $k) . '\\ \\text{cm}^2$.'], 'Square the radius first.', 'procedure', 40, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $rad = 7 * $r->int(1, 3); $th = $r->pick([30, 45, 60, 72, 90, 120, 135, 150]); $a = $th / 360 * 22 / 7 * $rad * $rad;
            return mlb_typed('num', 'A sector of a circle of radius $' . $rad . '$ cm has an angle of $' . mlb_deg($th) . '$. Taking $\\pi = \\frac{22}{7}$, find its area correct to 1 decimal place.', mlb_rd($a, 1),
                ['Sector area $= \\frac{\\theta}{360} \\times \\pi r^2$.', '$\\frac{' . $th . '}{360} \\times \\frac{22}{7} \\times ' . ($rad * $rad) . ' = ' . mlb_rd($a, 3) . '\\ldots \\approx ' . mlb_rd($a, 1) . '\\ \\text{cm}^2$.'], 'What fraction of the circle is it?', 'procedure', 55, ['unit' => 'cm²', 'dp' => 1]); },
        static function (MlbRng $r) { $k = $r->int(1, 3); $R = 7 * $r->int($k + 1, 5); $s = 7 * $k;
            return mlb_typed('num', 'A circular path runs round a circular pond. The pond has radius $' . $s . '$ m and the outer edge of the path has radius $' . $R . '$ m. Taking $\\pi = \\frac{22}{7}$, find the area of the path in $\\text{m}^2$.', (string)(22 * ($R * $R - $s * $s) / 7),
                ['Path = big circle − pond: $\\pi(R^2 - r^2)$.', '$\\frac{22}{7}(' . ($R * $R) . ' - ' . ($s * $s) . ') = ' . (22 * ($R * $R - $s * $s) / 7) . '\\ \\text{m}^2$.'], 'Subtract the inner circle.', 'application', 60, ['unit' => 'm²']); },
        static function (MlbRng $r) { $k = $r->int(1, 3); $rad = 7 * $k;
            return mlb_mcq($r, 'Taking $\\pi = \\frac{22}{7}$, what is the area of a circle with radius $' . $rad . '$ cm?', (154 * $k * $k) . ' cm²',
                [[(44 * $k) . ' cm²', 'That is the circumference ($2\\pi r$), a length — not the area.'], [(616 * $k * $k) . ' cm²', 'The diameter was squared instead of the radius.'], [(22 * $k) . ' cm²', 'The radius was not squared: $\\pi r$ is not an area.']],
                ['$A = \\pi r^2 = \\frac{22}{7} \\times ' . $rad . ' \\times ' . $rad . '$.', '$= ' . (154 * $k * $k) . '\\ \\text{cm}^2$.'], 'Square the RADIUS.', 'concept', 35); },
        static function (MlbRng $r) { $k = $r->pick([2, 3, 4]);
            return mlb_mcq($r, 'The radius of a circle is multiplied by $' . $k . '$. Its area is multiplied by…', (string)($k * $k),
                [[(string)$k, 'Area depends on $r^2$, so the factor is squared.'], [(string)(2 * $k), 'Squaring is not doubling: $' . $k . '^2 = ' . ($k * $k) . '$.'], [(string)($k ** 3), 'Cubing is for volumes.']],
                ['$A = \\pi r^2$.', '$(' . $k . 'r)^2 = ' . ($k * $k) . 'r^2$, so the area is multiplied by $' . ($k * $k) . '$.'], 'How does $r$ appear in the formula?', 'reasoning', 30); },
    ];
    $f['MC-084'] = [
        static function (MlbRng $r) { $l = $r->int(2, 12); $w = $r->int(2, 10); $h = $r->int(2, 10);
            return mlb_typed('num', 'Find the total surface area of a cuboid $' . $l . '$ cm by $' . $w . '$ cm by $' . $h . '$ cm, in $\\text{cm}^2$.', (string)(2 * ($l * $w + $l * $h + $w * $h)),
                ['Three pairs of matching faces: $2(lw + lh + wh)$.', '$2(' . ($l * $w) . ' + ' . ($l * $h) . ' + ' . ($w * $h) . ') = ' . (2 * ($l * $w + $l * $h + $w * $h)) . '\\ \\text{cm}^2$.'], 'Six faces in three matching pairs.', 'procedure', 50, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $k = $r->int(1, 2); $rad = 7 * $k; $h = $r->int(3, 20);
            return mlb_typed('num', 'A closed cylinder has radius $' . $rad . '$ cm and height $' . $h . '$ cm. Taking $\\pi = \\frac{22}{7}$, find its total surface area in $\\text{cm}^2$.', (string)(44 * $k * ($rad + $h)),
                ['Two circles and a curved rectangle: $2\\pi r^2 + 2\\pi r h = 2\\pi r(r + h)$.', '$2 \\times \\frac{22}{7} \\times ' . $rad . ' \\times (' . $rad . ' + ' . $h . ') = ' . (44 * $k * ($rad + $h)) . '\\ \\text{cm}^2$.'], 'Unroll the curved side into a rectangle.', 'procedure', 60, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $k = $r->int(1, 3); $rad = 7 * $k; $l = $r->int(10, 30);
            return mlb_typed('num', 'A cone has base radius $' . $rad . '$ cm and slant height $' . $l . '$ cm. Taking $\\pi = \\frac{22}{7}$, find its curved surface area in $\\text{cm}^2$.', (string)(22 * $k * $l),
                ['Curved surface area $= \\pi r l$.', '$\\frac{22}{7} \\times ' . $rad . ' \\times ' . $l . ' = ' . (22 * $k * $l) . '\\ \\text{cm}^2$.'], 'Use the slant height, not the vertical height.', 'procedure', 45, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $rad = 7; $h = $r->int(3, 15); $tsa = 44 * ($rad + $h);
            return mlb_mcq($r, 'Taking $\\pi = \\frac{22}{7}$, what is the total surface area of a closed cylinder with radius $7$ cm and height $' . $h . '$ cm?', $tsa . ' cm²',
                [[(44 * $h) . ' cm²', 'That is only the curved surface: a closed cylinder also has two circular ends.'], [(44 * $h + 154) . ' cm²', 'Only one circular end was added — a CLOSED cylinder has two.'], [(154 * $h) . ' cm²', 'That is the VOLUME ($\\pi r^2 h$), not a surface area.']],
                ['Curved surface $2\\pi r h = ' . (44 * $h) . '$; two ends $2\\pi r^2 = 308$.', 'Total $= ' . (44 * $h) . ' + 308 = ' . $tsa . '\\ \\text{cm}^2$.'], 'Count every face: the tube and both lids.', 'reasoning', 45); },
        static function (MlbRng $r) { $k = $r->int(1, 2); $rad = 7 * $k; $h = $r->int(8, 20);
            return mlb_typed('num', 'A paper label wraps exactly once round a tin of radius $' . $rad . '$ cm and covers its full height of $' . $h . '$ cm (no overlap, not the ends). Taking $\\pi = \\frac{22}{7}$, find the area of the label in $\\text{cm}^2$.', (string)(44 * $k * $h),
                ['Unrolled, the label is a rectangle: its length is the circumference and its width is the height.', '$2 \\times \\frac{22}{7} \\times ' . $rad . ' \\times ' . $h . ' = ' . (44 * $k * $h) . '\\ \\text{cm}^2$.'], 'Only the curved surface.', 'application', 50, ['unit' => 'cm²']); },
    ];
    $f['MC-085'] = [
        static function (MlbRng $r) { $k = $r->int(1, 2); $rad = 7 * $k; $h = $r->int(2, 15);
            return mlb_typed('num', 'Taking $\\pi = \\frac{22}{7}$, find the volume of a cylinder with radius $' . $rad . '$ cm and height $' . $h . '$ cm, in $\\text{cm}^3$.', (string)(154 * $k * $k * $h),
                ['$V = \\pi r^2 h$.', '$\\frac{22}{7} \\times ' . ($rad * $rad) . ' \\times ' . $h . ' = ' . (154 * $k * $k * $h) . '\\ \\text{cm}^3$.'], 'Area of the base times the height.', 'procedure', 45, ['unit' => 'cm³']); },
        static function (MlbRng $r) { $k = $r->int(1, 2); $rad = 7 * $k; $h = 3 * $r->int(1, 8);
            return mlb_typed('num', 'Taking $\\pi = \\frac{22}{7}$, find the volume of a cone with base radius $' . $rad . '$ cm and vertical height $' . $h . '$ cm, in $\\text{cm}^3$.', (string)(154 * $k * $k * $h / 3),
                ['$V = \\frac{1}{3}\\pi r^2 h$ — a third of the cylinder that would hold it.', '$\\frac{1}{3} \\times \\frac{22}{7} \\times ' . ($rad * $rad) . ' \\times ' . $h . ' = ' . (154 * $k * $k * $h / 3) . '\\ \\text{cm}^3$.'], 'A cone is one third of a cylinder.', 'procedure', 50, ['unit' => 'cm³']); },
        static function (MlbRng $r) { $s = $r->int(3, 12); $h = 3 * $r->int(1, 8);
            return mlb_typed('num', 'A pyramid has a square base of side $' . $s . '$ cm and a vertical height of $' . $h . '$ cm. Find its volume in $\\text{cm}^3$.', (string)($s * $s * $h / 3),
                ['$V = \\frac{1}{3} \\times \\text{base area} \\times \\text{height}$.', '$\\frac{1}{3} \\times ' . ($s * $s) . ' \\times ' . $h . ' = ' . ($s * $s * $h / 3) . '\\ \\text{cm}^3$.'], 'One third of the prism with the same base.', 'procedure', 45, ['unit' => 'cm³']); },
        static function (MlbRng $r) { $v = 3 * $r->int(20, 300);
            return mlb_mcq($r, 'A cone and a cylinder have the same base and the same height. The cylinder holds $' . $v . '\\ \\text{cm}^3$. How much does the cone hold?', ($v / 3) . ' cm³',
                [[($v / 2) . ' cm³', 'It is a third, not a half: three cones fill the cylinder.'], [$v . ' cm³', 'The cone tapers to a point, so it holds much less.'], [(2 * $v / 3) . ' cm³', 'A third, not two thirds.']],
                ['$V_{\\text{cone}} = \\frac{1}{3}\\pi r^2 h$ and $V_{\\text{cylinder}} = \\pi r^2 h$.', 'So the cone holds $\\frac{1}{3} \\times ' . $v . ' = ' . ($v / 3) . '\\ \\text{cm}^3$.'], 'How many cones fill the cylinder?', 'concept', 30); },
        static function (MlbRng $r) { $h = 10 * $r->int(5, 20);
            return mlb_typed('num', 'A cylindrical water tank has an inside radius of $70$ cm and a depth of $' . $h . '$ cm. Taking $\\pi = \\frac{22}{7}$, how many litres does it hold when full? ($1$ litre $= 1000\\ \\text{cm}^3$)', (string)(15400 * $h / 1000),
                ['$V = \\frac{22}{7} \\times 70^2 \\times ' . $h . ' = ' . mlb_n(15400 * $h) . '\\ \\text{cm}^3$.', '$\\frac{' . mlb_n(15400 * $h) . '}{1000} = ' . mlb_n(15400 * $h / 1000) . '$ litres.'], 'Volume in cm³, then into litres.', 'application', 60, ['unit' => 'litres']); },
        static function (MlbRng $r) { $k = $r->int(1, 2); $rad = 7 * $k; $h = 3 * $r->int(2, 6); $right = 154 * $k * $k * $h / 3;
            $L1 = '$V = \\frac{1}{3}\\pi r^2 h$'; $L2 = '$= \\frac{1}{3} \\times \\frac{22}{7} \\times ' . $rad . '^2 \\times ' . $h . '$';
            return mlb_error_of($r, 'Find the first mistake in this working for the volume of a cone of radius $' . $rad . '$ cm and height $' . $h . '$ cm (with $\\pi = \\frac{22}{7}$).', [$L1, $L2, '$= ' . $right . '\\ \\text{cm}^3$'], [
                [0, ['$V = \\pi r^2 h$', '$= \\frac{22}{7} \\times ' . $rad . '^2 \\times ' . $h . '$', '$= ' . ($right * 3) . '\\ \\text{cm}^3$'], 'that is the cylinder; a cone holds one third of it.'],
                [1, [$L1, '$= \\frac{1}{3} \\times \\frac{22}{7} \\times ' . (2 * $rad) . '^2 \\times ' . $h . '$', '$= ' . ($right * 4) . '\\ \\text{cm}^3$'], 'the formula uses the radius, not the diameter.'],
                [2, [$L1, $L2, '$= ' . ($right * 3) . '\\ \\text{cm}^3$'], 'the $\\frac{1}{3}$ was dropped in the arithmetic.'],
            ]); },
    ];
    $f['MC-086'] = [
        static function (MlbRng $r) { $rad = 3 * $r->int(1, 4);
            return mlb_typed('num', 'A sphere has radius $' . $rad . '$ cm. Its volume is $k\\pi\\ \\text{cm}^3$. Find $k$.', (string)(4 * $rad ** 3 / 3),
                ['$V = \\frac{4}{3}\\pi r^3$.', '$\\frac{4}{3} \\times ' . $rad . '^3 = \\frac{4}{3} \\times ' . ($rad ** 3) . ' = ' . (4 * $rad ** 3 / 3) . '$, so $V = ' . (4 * $rad ** 3 / 3) . '\\pi$.'], 'Cube the radius first.', 'procedure', 45); },
        static function (MlbRng $r) { $rad = $r->int(2, 15); $hemi = $r->int(0, 1);
            return mlb_typed('num', ($hemi ? 'A solid hemisphere' : 'A sphere') . ' has radius $' . $rad . '$ cm. Its total surface area is $k\\pi\\ \\text{cm}^2$. Find $k$.', (string)(($hemi ? 3 : 4) * $rad * $rad),
                [$hemi ? 'Curved half $2\\pi r^2$ plus the flat circle $\\pi r^2$: $3\\pi r^2$.' : '$A = 4\\pi r^2$.', '$' . ($hemi ? 3 : 4) . ' \\times ' . ($rad * $rad) . ' = ' . (($hemi ? 3 : 4) * $rad * $rad) . '$.'],
                $hemi ? 'A solid hemisphere has a flat face too.' : 'Four circles of the same radius.', 'procedure', 40); },
        static function (MlbRng $r) { $k = $r->pick([2, 3, 4]);
            return mlb_mcq($r, 'The radius of a sphere is multiplied by $' . $k . '$. Its volume is multiplied by…', (string)($k ** 3),
                [[(string)$k, 'Volume has three lengths in it, so it grows by the cube of the scale factor, not the factor itself.'], [(string)($k * $k), 'That is how the SURFACE AREA grows. Volume grows by the cube.'], [(string)(3 * $k), 'Powers, not multiples: $' . $k . '^3$, not $3 \\times ' . $k . '$.']],
                ['$V = \\frac{4}{3}\\pi r^3$, and $r$ is cubed.', '$(' . $k . 'r)^3 = ' . ($k ** 3) . 'r^3$, so the volume is multiplied by $' . ($k ** 3) . '$.'], 'Which power of $r$ is in the volume?', 'reasoning', 35); },
        static function (MlbRng $r) { $rad = 3 * $r->int(1, 4);
            return mlb_typed('num', 'A hemispherical bowl has an inside radius of $' . $rad . '$ cm. It holds $k\\pi\\ \\text{cm}^3$ of water when full. Find $k$.', (string)(2 * $rad ** 3 / 3),
                ['A hemisphere is half a sphere: $V = \\frac{2}{3}\\pi r^3$.', '$\\frac{2}{3} \\times ' . ($rad ** 3) . ' = ' . (2 * $rad ** 3 / 3) . '$.'], 'Half of $\\frac{4}{3}\\pi r^3$.', 'application', 45); },
    ];
    $f['MC-087'] = [
        static function (MlbRng $r) { $b = $r->int(5, 355);
            $back = ($b + 180) % 360;
            return mlb_typed('num', 'The bearing of $B$ from $A$ is $' . str_pad((string)$b, 3, '0', STR_PAD_LEFT) . '^\\circ$. What is the bearing of $A$ from $B$?', (string)$back,
                ['A back bearing differs by $' . mlb_deg(180) . '$.', $b < 180 ? '$' . $b . ' + 180 = ' . $back . '^\\circ$.' : '$' . $b . ' - 180 = ' . $back . '^\\circ$.'], 'Add 180°, or subtract it if that would pass 360°.', 'procedure', 35, ['unit' => '°', 'show' => str_pad((string)$back, 3, '0', STR_PAD_LEFT) . '°']); },
        static function (MlbRng $r) { $a = $r->int(5, 85); $q = $r->int(0, 3);
            [$txt, $ans] = [['\\text{N } ' . $a . '^\\circ \\text{ E}', $a], ['\\text{S } ' . $a . '^\\circ \\text{ E}', 180 - $a], ['\\text{S } ' . $a . '^\\circ \\text{ W}', 180 + $a], ['\\text{N } ' . $a . '^\\circ \\text{ W}', 360 - $a]][$q];
            return mlb_typed('num', 'Write the compass direction $' . $txt . '$ as a three-figure bearing.', (string)$ans,
                ['Bearings are measured clockwise from North.', '$' . $txt . '$ is $' . str_pad((string)$ans, 3, '0', STR_PAD_LEFT) . '^\\circ$.'], 'Start facing North and turn clockwise.', 'procedure', 40, ['unit' => '°', 'show' => str_pad((string)$ans, 3, '0', STR_PAD_LEFT) . '°']); },
        static function (MlbRng $r) { $d = $r->int(0, 3); $names = ['north-east', 'south-east', 'south-west', 'north-west']; $ans = 45 + 90 * $d;
            $wrong = []; foreach ([45, 135, 225, 315] as $v) if ($v !== $ans) $wrong[] = [str_pad((string)$v, 3, '0', STR_PAD_LEFT) . '°', 'That is due ' . $names[intdiv($v - 45, 90)] . '. Bearings turn clockwise from North.'];
            return mlb_mcq($r, '$B$ is due ' . $names[$d] . ' of $A$. What is the bearing of $B$ from $A$?', str_pad((string)$ans, 3, '0', STR_PAD_LEFT) . '°', $wrong,
                ['Face North and turn clockwise: East is $' . mlb_deg('090') . '$, South $' . mlb_deg(180) . '$, West $' . mlb_deg(270) . '$.', 'Due ' . $names[$d] . ' is halfway between, at $' . str_pad((string)$ans, 3, '0', STR_PAD_LEFT) . '^\\circ$.'], 'Clockwise from North.', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(10, 300); $t = $r->int(20, 120);
            return mlb_typed('num', 'A plane flies on a bearing of $' . str_pad((string)$a, 3, '0', STR_PAD_LEFT) . '^\\circ$, then turns $' . mlb_deg($t) . '$ clockwise. What is its new bearing?', (string)(($a + $t) % 360),
                ['Turning clockwise adds to the bearing.', '$' . $a . ' + ' . $t . ' = ' . ($a + $t) . '$' . ($a + $t >= 360 ? ', and past 360° we subtract 360: $' . (($a + $t) % 360) . '^\\circ$.' : '^\\circ$.')], 'Clockwise adds.', 'application', 40, ['unit' => '°', 'show' => str_pad((string)(($a + $t) % 360), 3, '0', STR_PAD_LEFT) . '°']); },
        static function (MlbRng $r) { $b = $r->int(20, 160);
            return mlb_error_of($r, 'The bearing of $Q$ from $P$ is $' . str_pad((string)$b, 3, '0', STR_PAD_LEFT) . '^\\circ$. Find the first mistake in this working for the bearing of $P$ from $Q$.',
                ['The return direction is opposite: it differs by $' . mlb_deg(180) . '$.', '$' . $b . ' + 180 = ' . ($b + 180) . '$', 'The bearing of $P$ from $Q$ is $' . ($b + 180) . '^\\circ$.'], [
                [0, ['The return direction is at right angles: it differs by $' . mlb_deg(90) . '$.', '$' . $b . ' + 90 = ' . ($b + 90) . '$', 'The bearing of $P$ from $Q$ is $' . str_pad((string)($b + 90), 3, '0', STR_PAD_LEFT) . '^\\circ$.'], 'going back the way you came is the OPPOSITE direction, half a turn: 180°.'],
                [1, ['The return direction is opposite: it differs by $' . mlb_deg(180) . '$.', '$180 - ' . $b . ' = ' . (180 - $b) . '$', 'The bearing of $P$ from $Q$ is $' . str_pad((string)(180 - $b), 3, '0', STR_PAD_LEFT) . '^\\circ$.'], 'add 180° to the bearing; subtracting the bearing from 180° reflects it instead.'],
            ]); },
    ];
    $f['MC-088'] = [
        static function (MlbRng $r) { $n = $r->pick([25000, 50000, 100000, 200000, 250000]); $d = $r->int(2, 18);
            $km = $d * $n / 100000;
            return mlb_typed('num', 'A map has a scale of $1 : ' . mlb_n($n) . '$. Two towns are $' . $d . '$ cm apart on the map. How far apart are they in real life, in km?', mlb_dec($km),
                ['$1$ cm on the map is $' . mlb_n($n) . '$ cm on the ground.', '$' . $d . ' \\times ' . mlb_n($n) . ' = ' . mlb_n($d * $n) . '$ cm $= ' . mlb_dec($km) . '$ km (100 000 cm in a km).'], 'Multiply, then change cm into km.', 'application', 50, ['unit' => 'km']); },
        static function (MlbRng $r) { $k = $r->int(2, 5); $a = $r->int(2, 12); $lenOrArea = $r->int(0, 1);
            return $lenOrArea ? mlb_typed('num', 'A shape is enlarged by scale factor $' . $k . '$. One side was $' . $a . '$ cm. How long is it now, in cm?', (string)($a * $k),
                    ['Every length is multiplied by the scale factor.', '$' . $a . ' \\times ' . $k . ' = ' . ($a * $k) . '$ cm.'], 'Lengths times the scale factor.', 'procedure', 25, ['unit' => 'cm'])
                : mlb_typed('num', 'A shape with area $' . $a . '\\ \\text{cm}^2$ is enlarged by scale factor $' . $k . '$. What is its new area, in $\\text{cm}^2$?', (string)($a * $k * $k),
                    ['Area is multiplied by the scale factor SQUARED.', '$' . $a . ' \\times ' . $k . '^2 = ' . ($a * $k * $k) . '\\ \\text{cm}^2$.'], 'Both the length and the width grow.', 'application', 35, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $n = $r->pick([50000, 100000, 200000, 250000, 500000]); $cm = $r->int(2, 16); $km = $cm * $n / 100000;
            return mlb_typed('num', 'On a map with scale $1 : ' . mlb_n($n) . '$, how many cm represent a real distance of $' . mlb_dec($km) . '$ km?', (string)$cm,
                ['Change the real distance to cm: $' . mlb_dec($km) . '$ km $= ' . mlb_n($km * 100000) . '$ cm.', 'Divide by the scale: $\\frac{' . mlb_n($km * 100000) . '}{' . mlb_n($n) . '} = ' . $cm . '$ cm.'], 'Same units first, then divide.', 'application', 50, ['unit' => 'cm']); },
        static function (MlbRng $r) { $n = $r->pick([10, 20, 25, 40, 50]); $m = $r->int(2, 6); $cm = $m * 100 / $n;
            return mlb_mcq($r, 'A model is built at a scale of $1 : ' . $n . '$. The real object is $' . $m . '$ m long. How long is the model?', mlb_dec($cm) . ' cm',
                [[($m * $n) . ' m', 'The model is SMALLER: divide by ' . $n . ', do not multiply.'], [mlb_dec($cm / 100) . ' cm', 'The metres were not changed to centimetres: $' . $m . '$ m $= ' . ($m * 100) . '$ cm.'], [mlb_dec($m / $n) . ' cm', 'Metres divided by ' . $n . ' gives metres, not centimetres.']],
                ['$' . $m . '$ m $= ' . ($m * 100) . '$ cm.', 'The model is $\\frac{' . ($m * 100) . '}{' . $n . '} = ' . mlb_dec($cm) . '$ cm.'], 'Change to cm, then divide by the scale.', 'reasoning', 40); },
    ];
    $f['MC-089'] = [
        static function (MlbRng $r) { $x = $r->nz(-7, 7); $y = $r->nz(-7, 7); $t = $r->int(0, 4);
            $cases = [['reflected in the $x$-axis', [$x, -$y], 'Reflecting in the $x$-axis changes the sign of $y$.'], ['reflected in the $y$-axis', [-$x, $y], 'Reflecting in the $y$-axis changes the sign of $x$.'],
                      ['reflected in the line $y = x$', [$y, $x], 'Reflecting in $y = x$ swaps the coordinates.'], ['rotated $' . mlb_deg(90) . '$ clockwise about the origin', [$y, -$x], 'A $' . mlb_deg(90) . '$ clockwise turn sends $(x, y)$ to $(y, -x)$.'],
                      ['rotated $' . mlb_deg(180) . '$ about the origin', [-$x, -$y], 'A half turn changes both signs.']];
            [$what, $img, $rule] = $cases[$t];
            return mlb_typed('pair', 'The point $(' . $x . ', ' . $y . ')$ is ' . $what . '. What are the coordinates of its image?', $img,
                [$rule, 'The image is $(' . $img[0] . ', ' . $img[1] . ')$.'], 'Sketch it, or use the rule for the transformation.', 'procedure', 45, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $n = $r->int(3, 12); $names = [3 => 'equilateral triangle', 4 => 'square', 5 => 'regular pentagon', 6 => 'regular hexagon', 7 => 'regular heptagon', 8 => 'regular octagon', 9 => 'regular nonagon', 10 => 'regular decagon', 11 => 'regular 11-sided polygon', 12 => 'regular dodecagon'];
            $lines = $r->int(0, 1);
            return mlb_typed('num', $lines ? 'How many lines of symmetry does a ' . $names[$n] . ' have?' : 'What is the order of rotational symmetry of a ' . $names[$n] . '?', (string)$n,
                ['A regular polygon with $n$ sides has $n$ lines of symmetry and rotational symmetry of order $n$.', 'Here $n = ' . $n . '$.'], 'Count the sides.', 'concept', 25); },
        static function (MlbRng $r) { $x = $r->int(1, 7); $y = $r->int(1, 7); if ($x === $y) $y++;
            $t = $r->int(0, 2); $img = [[-$x, $y], [$x, -$y], [-$x, -$y]][$t]; $name = ['A reflection in the $y$-axis', 'A reflection in the $x$-axis', 'A rotation of $' . mlb_deg(180) . '$ about the origin'];
            $wrong = []; foreach ($name as $i => $n) if ($i !== $t) $wrong[] = [$n, 'That would send $(' . $x . ', ' . $y . ')$ to $(' . implode(', ', [[-$x, $y], [$x, -$y], [-$x, -$y]][$i]) . ')$.'];
            $wrong[] = ['A reflection in the line $y = x$', 'That swaps the coordinates: $(' . $y . ', ' . $x . ')$.'];
            return mlb_mcq($r, 'Which transformation maps $(' . $x . ', ' . $y . ')$ onto $(' . $img[0] . ', ' . $img[1] . ')$?', $name[$t], $wrong,
                ['Compare the signs: ' . ['only $x$ changed sign', 'only $y$ changed sign', 'both changed sign'][$t] . '.', $name[$t] . ' does exactly that.'], 'Which coordinates changed sign?', 'reasoning', 35); },
        static function (MlbRng $r) { $x = $r->int(-6, 6); $y = $r->int(1, 7); $p = $r->nz(-4, 4); $q = $r->nz(-4, 4);
            return mlb_typed('pair', 'A drone hovering at $(' . $x . ', ' . $y . ')$ is moved by the translation $\\begin{pmatrix} ' . $p . ' \\\\ ' . $q . ' \\end{pmatrix}$, and its shadow is the reflection of that point in the $x$-axis. Where is the shadow?', [$x + $p, -($y + $q)],
                ['Translate first: $(' . $x . ' + ' . $p . ', ' . $y . ' + ' . $q . ') = (' . ($x + $p) . ', ' . ($y + $q) . ')$.', 'Reflecting in the $x$-axis changes the sign of $y$: $(' . ($x + $p) . ', ' . (-($y + $q)) . ')$.'], 'One transformation at a time, in order.', 'application', 60, ['labels' => ['x', 'y'], 'point' => true]); },
    ];
    $f['MC-090'] = [
        static function (MlbRng $r) { $n = $r->int(3, 8); $prism = $r->int(0, 1); $q = $r->int(0, 2);
            $poly = [3 => 'triangular', 4 => 'square', 5 => 'pentagonal', 6 => 'hexagonal', 7 => 'heptagonal', 8 => 'octagonal'][$n];
            $vals = $prism ? ['faces' => $n + 2, 'edges' => 3 * $n, 'vertices' => 2 * $n] : ['faces' => $n + 1, 'edges' => 2 * $n, 'vertices' => $n + 1];
            $what = ['faces', 'edges', 'vertices'][$q];
            return mlb_typed('num', 'How many ' . $what . ' does a ' . $poly . ' ' . ($prism ? 'prism' : 'pyramid') . ' have?', (string)$vals[$what],
                [$prism ? 'A prism has two ' . $poly . ' ends joined by ' . $n . ' rectangles.' : 'A pyramid has a ' . $poly . ' base and ' . $n . ' triangles meeting at the apex.',
                 'Faces ' . $vals['faces'] . ', edges ' . $vals['edges'] . ', vertices ' . $vals['vertices'] . ' (check: $F + V - E = 2$).'], 'Euler: faces + vertices − edges = 2.', 'reasoning', 45); },
        static function (MlbRng $r) { [$a, $b, $c, $d] = $r->pick([[2, 3, 6, 7], [1, 4, 8, 9], [2, 6, 9, 11], [4, 4, 7, 9], [2, 10, 11, 15], [6, 6, 7, 11], [3, 4, 12, 13], [2, 5, 14, 15]]);
            return mlb_typed('num', 'A cuboid measures $' . $a . '$ cm by $' . $b . '$ cm by $' . $c . '$ cm. How long is the longest straight rod that fits inside it (corner to opposite corner), in cm?', (string)$d,
                ['Use Pythagoras twice: the diagonal is $\\sqrt{a^2 + b^2 + c^2}$.', '$\\sqrt{' . ($a * $a) . ' + ' . ($b * $b) . ' + ' . ($c * $c) . '} = \\sqrt{' . ($d * $d) . '} = ' . $d . '$ cm.'], 'First the diagonal of the base, then up.', 'application', 60, ['unit' => 'cm']); },
        static function (MlbRng $r) { $k = $r->pick([2, 3]);
            return mlb_mcq($r, 'Every edge of a cuboid is multiplied by $' . $k . '$. Its volume is multiplied by…', (string)($k ** 3),
                [[(string)$k, 'All three dimensions grow, so the factor is applied three times.'], [(string)($k * $k), 'That is the factor for the surface area (two dimensions).'], [(string)(3 * $k), 'The factors multiply: $' . $k . ' \\times ' . $k . ' \\times ' . $k . '$, they do not add.']],
                ['$V = lwh$, and each of $l$, $w$, $h$ is multiplied by $' . $k . '$.', '$' . $k . ' \\times ' . $k . ' \\times ' . $k . ' = ' . ($k ** 3) . '$.'], 'Three lengths, each multiplied.', 'reasoning', 30); },
        static function (MlbRng $r) { $s = $r->int(2, 12);
            return mlb_typed('num', 'A cube has a total surface area of $' . (6 * $s * $s) . '\\ \\text{cm}^2$. What is its volume, in $\\text{cm}^3$?', (string)($s ** 3),
                ['Six equal square faces: each is $\\frac{' . (6 * $s * $s) . '}{6} = ' . ($s * $s) . '\\ \\text{cm}^2$, so the edge is $' . $s . '$ cm.', '$V = ' . $s . '^3 = ' . ($s ** 3) . '\\ \\text{cm}^3$.'], 'Find one face, then the edge.', 'procedure', 50, ['unit' => 'cm³']); },
    ];


    /* ══ Stage 10 · Graphs and Coordinate Geometry ═══════════════════════ */
    $f['MC-091'] = [
        static function (MlbRng $r) { $x = $r->nz(-9, 9); $y = $r->nz(-9, 9);
            $q = $x > 0 ? ($y > 0 ? 'First' : 'Fourth') : ($y > 0 ? 'Second' : 'Third');
            $all = ['First' => 'both positive', 'Second' => '$x$ negative, $y$ positive', 'Third' => 'both negative', 'Fourth' => '$x$ positive, $y$ negative'];
            $wrong = []; foreach ($all as $t => $w) if ($t !== $q) $wrong[] = [$t . ' quadrant', 'In the ' . mb_strtolower($t) . ' quadrant ' . $w . '. Quadrants are numbered anticlockwise from the top right.'];
            return mlb_mcq($r, 'In which quadrant is the point $(' . $x . ', ' . $y . ')$?', $q . ' quadrant', $wrong,
                ['$x = ' . $x . '$ is ' . ($x > 0 ? 'positive' : 'negative') . ' and $y = ' . $y . '$ is ' . ($y > 0 ? 'positive' : 'negative') . '.', 'That is the ' . mb_strtolower($q) . ' quadrant (numbered anticlockwise from the top right).'], 'Check the sign of each coordinate.', 'concept', 25); },
        static function (MlbRng $r) { $x = $r->int(-6, 6); $y = $r->int(-6, 6); $p = $r->nz(-5, 5); $q = $r->nz(-5, 5);
            return mlb_typed('pair', 'Start at $(' . $x . ', ' . $y . ')$. Move ' . abs($p) . ' unit' . (abs($p) === 1 ? '' : 's') . ' ' . ($p > 0 ? 'right' : 'left') . ' and ' . abs($q) . ' unit' . (abs($q) === 1 ? '' : 's') . ' ' . ($q > 0 ? 'up' : 'down') . '. Where do you end up?', [$x + $p, $y + $q],
                ['Right and left change $x$; up and down change $y$.', '$(' . $x . ($p > 0 ? ' + ' : ' - ') . abs($p) . ', ' . $y . ($q > 0 ? ' + ' : ' - ') . abs($q) . ') = (' . ($x + $p) . ', ' . ($y + $q) . ')$.'], 'Along the corridor, then up the stairs.', 'procedure', 35, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $x = $r->int(-8, 8); $y1 = $r->int(-8, 8); $y2 = $r->int(-8, 8); if ($y1 === $y2) $y2 = $y1 + 5;
            return mlb_typed('num', 'How far apart are the points $(' . $x . ', ' . $y1 . ')$ and $(' . $x . ', ' . $y2 . ')$?', (string)abs($y2 - $y1),
                ['They share an $x$-coordinate, so they lie on the same vertical line.', 'The distance is the difference in $y$: $|' . $y2 . ' - (' . $y1 . ')| = ' . abs($y2 - $y1) . '$.'], 'Count across zero if the signs differ.', 'procedure', 30); },
        static function (MlbRng $r) { $x1 = $r->int(-5, 5); $y1 = $r->int(-5, 5); $x2 = $r->int(-5, 5); $y2 = $r->int(-5, 5); if ($x1 === $x2 && $y1 === $y2) $x2 += 3;
            return mlb_typed('num', 'On a street grid, a shop is at $(' . $x1 . ', ' . $y1 . ')$ and a school at $(' . $x2 . ', ' . $y2 . ')$, each unit one block. Walking only along the streets (east–west and north–south), what is the shortest number of blocks between them?', (string)(abs($x2 - $x1) + abs($y2 - $y1)),
                ['You must cover the east–west gap and the north–south gap separately.', '$|' . $x2 . ' - (' . $x1 . ')| + |' . $y2 . ' - (' . $y1 . ')| = ' . abs($x2 - $x1) . ' + ' . abs($y2 - $y1) . ' = ' . (abs($x2 - $x1) + abs($y2 - $y1)) . '$ blocks.'], 'Across, then up — no diagonals.', 'application', 50); },
        static function (MlbRng $r) { $a = $r->nz(-9, 9); $onY = $r->int(0, 1) === 1; $pt = $onY ? '(0, ' . $a . ')' : '(' . $a . ', 0)';
            return mlb_mcq($r, 'Where is the point $' . $pt . '$?', $onY ? 'On the $y$-axis' : 'On the $x$-axis',
                [[$onY ? 'On the $x$-axis' : 'On the $y$-axis', 'On the $x$-axis, $y = 0$; on the $y$-axis, $x = 0$.'], ['At the origin', 'The origin is $(0, 0)$; here one coordinate is $' . $a . '$.'], ['In the first quadrant', 'A point with a zero coordinate lies on an axis, not in a quadrant.']],
                [$onY ? 'Its $x$-coordinate is 0, so it is on the vertical axis.' : 'Its $y$-coordinate is 0, so it is on the horizontal axis.', 'Points on an axis belong to no quadrant.'], 'Which coordinate is zero?', 'reasoning', 25); },
    ];
    $f['MC-092'] = [
        static function (MlbRng $r) { $t = $r->pick([1, 2, 3, 4]); $v = $r->pick([20, 30, 40, 45, 60, 75, 80]); $t0 = $r->int(0, 2); $d0 = 10 * $r->int(0, 6);
            return mlb_typed('num', 'A distance–time graph is a straight line from ($' . $t0 . '$ h, $' . $d0 . '$ km) to ($' . ($t0 + $t) . '$ h, $' . ($d0 + $v * $t) . '$ km). What is the speed in km/h?', (string)$v,
                ['Speed is the gradient of a distance–time graph: distance gained ÷ time taken.', '$\\frac{' . ($d0 + $v * $t) . ' - ' . $d0 . '}{' . ($t0 + $t) . ' - ' . $t0 . '} = \\frac{' . ($v * $t) . '}{' . $t . '} = ' . $v . '$ km/h.'], 'Rise over run.', 'application', 45, ['unit' => 'km/h']); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            $cases = [['a horizontal line', 'The object is not moving'], ['a straight line sloping upwards', 'The object is moving at a constant speed'], ['a line sloping back down towards the time axis', 'The object is coming back towards the start']];
            [$shape, $right] = $cases[$c]; $wrong = [];
            foreach ($cases as $i => [$sh, $m]) if ($i !== $c) $wrong[] = [$m, 'That is what ' . $sh . ' shows.'];
            $wrong[] = ['The object is speeding up', 'Speeding up shows as a CURVE getting steeper, not a straight line.'];
            return mlb_mcq($r, 'Part of a distance–time graph is ' . $shape . '. What does that part show?', $right, $wrong,
                ['On a distance–time graph, steepness is speed.', $right . '.'], 'What happens to the distance as time passes?', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->pick([2, 4, 5, 10]); $b = $a * $r->pick([150, 200, 250, 300, 450]); $c = $r->int(3, 12);
            return mlb_typed('num', 'A conversion graph is a straight line through $(0, 0)$ and $(' . $a . ', ' . mlb_n($b) . ')$, converting kilograms of rice ($x$) into cost in naira ($y$). What does $' . $c . '$ kg cost?', (string)($b / $a * $c),
                ['A straight line through the origin means cost is proportional: each kg costs $\\frac{' . mlb_n($b) . '}{' . $a . '} = ₦' . mlb_n($b / $a) . '$.', '$' . $c . ' \\times ' . mlb_n($b / $a) . ' = ₦' . mlb_n($b / $a * $c) . '$.'], 'Find the cost of 1 kg first.', 'application', 45, ['unit' => '₦']); },
        static function (MlbRng $r) { $v1 = $r->pick([30, 40, 60]); $v2 = $r->pick([20, 60, 80, 120]); if ($v1 === $v2) $v2 = 90; $t1 = $r->int(1, 3); $t2 = $r->int(1, 3);
            $avg = ($v1 * $t1 + $v2 * $t2) / ($t1 + $t2);
            return mlb_typed('num', 'A bus travels for ' . $t1 . ' h at $' . $v1 . '$ km/h and then for ' . $t2 . ' h at $' . $v2 . '$ km/h. What is its average speed for the whole journey, in km/h? (Give it to 1 decimal place if needed.)', mlb_rd($avg, 1),
                ['Average speed $= \\frac{\\text{total distance}}{\\text{total time}}$: distance $= ' . ($v1 * $t1) . ' + ' . ($v2 * $t2) . ' = ' . ($v1 * $t1 + $v2 * $t2) . '$ km.', '$\\frac{' . ($v1 * $t1 + $v2 * $t2) . '}{' . ($t1 + $t2) . '} \\approx ' . mlb_rd($avg, 1) . '$ km/h.'], 'Total distance over total time.', 'procedure', 60, ['unit' => 'km/h', 'dp' => 1]); },
        static function (MlbRng $r) { $d = 60 * $r->int(1, 4); $v1 = $r->pick([30, 40]); $v2 = $r->pick([60, 120]); $t = $d / $v1 + $d / $v2; $avg = 2 * $d / $t;
            $L1 = 'Time out: $\\frac{' . $d . '}{' . $v1 . '} = ' . mlb_dec($d / $v1) . '$ h; back: $\\frac{' . $d . '}{' . $v2 . '} = ' . mlb_dec($d / $v2) . '$ h'; $L2 = 'Total: $' . (2 * $d) . '$ km in $' . mlb_dec($t) . '$ h';
            return mlb_error_of($r, 'A car drives $' . $d . '$ km at $' . $v1 . '$ km/h and returns at $' . $v2 . '$ km/h. Find the first mistake in this working for the average speed.', [$L1, $L2, 'Average $= \\frac{' . (2 * $d) . '}{' . mlb_dec($t) . '} = ' . mlb_dec($avg) . '$ km/h'], [
                [0, ['Average speed $= \\frac{' . $v1 . ' + ' . $v2 . '}{2}$', '$= \\frac{' . ($v1 + $v2) . '}{2}$', '$= ' . mlb_dec(($v1 + $v2) / 2) . '$ km/h'], 'the two speeds last for DIFFERENT lengths of time, so they cannot simply be averaged: use total distance ÷ total time.'],
                [1, [$L1, 'Total: $' . $d . '$ km in $' . mlb_dec($t) . '$ h', 'Average $= \\frac{' . $d . '}{' . mlb_dec($t) . '} = ' . mlb_dec($d / $t) . '$ km/h'], 'there and back is $2 \\times ' . $d . ' = ' . (2 * $d) . '$ km.'],
            ]); },
    ];
    $f['MC-093'] = [
        static function (MlbRng $r) { do { $x1 = $r->int(-6, 6); $y1 = $r->int(-6, 6); $x2 = $r->int(-6, 6); $y2 = $r->int(-6, 6); } while ($x1 === $x2 || $y1 === $y2);
            return mlb_typed('frac', 'Find the gradient of the line through $(' . $x1 . ', ' . $y1 . ')$ and $(' . $x2 . ', ' . $y2 . ')$. Give it as a fraction in its lowest terms.', mlb_frac($y2 - $y1, $x2 - $x1),
                ['$m = \\frac{y_2 - y_1}{x_2 - x_1}$.', '$m = \\frac{' . $y2 . ' - (' . $y1 . ')}{' . $x2 . ' - (' . $x1 . ')} = \\frac{' . ($y2 - $y1) . '}{' . ($x2 - $x1) . '} = ' . mlb_ftex($y2 - $y1, $x2 - $x1) . '$.'], 'Change in $y$ over change in $x$ — same order top and bottom.', 'procedure', 45, ['form' => 'lowest']); },
        static function (MlbRng $r) { do { $x1 = $r->int(0, 5); $y1 = $r->int(0, 5); $x2 = $r->int(6, 10); $y2 = $r->int(-3, 12); } while ($y2 === $y1 || mlb_frac($y2 - $y1, $x2 - $x1) === mlb_frac($x2 - $x1, $y2 - $y1));
            $m = '$' . mlb_ftex($y2 - $y1, $x2 - $x1) . '$';
            return mlb_mcq($r, 'What is the gradient of the line through $A(' . $x1 . ', ' . $y1 . ')$ and $B(' . $x2 . ', ' . $y2 . ')$?', $m,
                [['$' . mlb_ftex($x2 - $x1, $y2 - $y1) . '$', 'Upside down: the gradient is the change in $y$ over the change in $x$.'], ['$' . mlb_ftex($y1 - $y2, $x2 - $x1) . '$', 'The subtractions are in opposite orders on top and bottom, which flips the sign.'], ['$' . mlb_ftex($y2 + $y1, $x2 + $x1) . '$', 'The coordinates were added, not subtracted.']],
                ['$m = \\frac{' . $y2 . ' - ' . $y1 . '}{' . $x2 . ' - ' . $x1 . '}$, both from $B$ minus $A$.', '$m = ' . mlb_ftex($y2 - $y1, $x2 - $x1) . '$.'], 'Rise over run, the same way round.', 'reasoning', 40); },
        static function (MlbRng $r) { $rate = $r->int(2, 12); $t = $r->int(3, 10); $v1 = 5 * $r->int(1, 10);
            return mlb_typed('num', 'A tank holds $' . $v1 . '$ litres. It fills steadily and $' . $t . '$ minutes later it holds $' . ($v1 + $rate * $t) . '$ litres. At what rate is it filling, in litres per minute?', (string)$rate,
                ['A rate of change is the gradient: change in volume ÷ change in time.', '$\\frac{' . ($v1 + $rate * $t) . ' - ' . $v1 . '}{' . $t . '} = ' . $rate . '$ litres per minute.'], 'How much was added, and over how long?', 'application', 40); },
        static function (MlbRng $r) { $hz = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'What is the gradient of a ' . ($hz ? 'horizontal' : 'vertical') . ' line?', $hz ? '0' : 'It is undefined',
                [[$hz ? 'It is undefined' : '0', $hz ? 'A horizontal line has no rise: $\\frac{0}{\\text{run}} = 0$.' : 'A vertical line has no run, and you cannot divide by zero.'], ['1', 'A gradient of 1 is a line at 45°.'], ['-1', 'A gradient of −1 slopes down at 45°.']],
                ['Gradient $= \\frac{\\text{rise}}{\\text{run}}$.', $hz ? 'A horizontal line: rise 0, so gradient 0.' : 'A vertical line: run 0, so the gradient is undefined.'], 'Rise over run — which one is zero?', 'concept', 25); },
    ];
    $f['MC-094'] = [
        static function (MlbRng $r) { $m = $r->nz(-4, 4); $c = $r->int(-6, 6); $x1 = $r->int(-3, 0); $x2 = $r->int(1, 4);
            return mlb_typed('expr', 'Find the equation of the line through $(' . $x1 . ', ' . ($m * $x1 + $c) . ')$ and $(' . $x2 . ', ' . ($m * $x2 + $c) . ')$, in the form $y = mx + c$.', $m . 'x' . ($c < 0 ? '' : '+') . $c,
                ['Gradient: $m = \\frac{' . ($m * $x2 + $c) . ' - (' . ($m * $x1 + $c) . ')}{' . $x2 . ' - (' . $x1 . ')} = ' . $m . '$.', 'Put in a point: $' . ($m * $x2 + $c) . ' = ' . $m . ' \\times ' . $x2 . ' + c$, so $c = ' . $c . '$ and $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$.'], 'Gradient first, then the intercept.', 'procedure', 70); },
        static function (MlbRng $r) { $m = $r->nz(-5, 5); $x = $r->int(-4, 4); $y = $r->int(-8, 8); $c = $y - $m * $x;
            return mlb_typed('expr', 'A line has gradient $' . $m . '$ and passes through $(' . $x . ', ' . $y . ')$. Find its equation in the form $y = mx + c$.', $m . 'x' . ($c < 0 ? '' : '+') . $c,
                ['$y - y_1 = m(x - x_1)$: $y - (' . $y . ') = ' . $m . '(x - (' . $x . '))$.', 'Tidy up: $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$.'], 'Substitute the point to find $c$.', 'procedure', 50); },
        static function (MlbRng $r) { $k = $r->pick([2, 3, 4, 5]); $m = $r->nz(-4, 5); $b = $r->nz(-9, 9); $a = $m * $k;
            return mlb_mcq($r, 'What is the gradient of the line $' . $k . 'y = ' . mlb_lterm($a, 'x') . mlb_sterm($b) . '$?', '$' . $m . '$',
                [['$' . $a . '$', 'The equation must be divided by ' . $k . ' first, to get $y$ on its own.'], ['$' . mlb_ftex($b, $k) . '$', 'That is the $y$-intercept, not the gradient.'], ['$' . $k . '$', 'The number in front of $y$ is not the gradient.']],
                ['Make $y$ the subject: $y = ' . mlb_lterm($m, 'x') . ' ' . ($b < 0 ? '-' : '+') . ' ' . mlb_ftex(abs($b), $k) . '$.', 'The gradient is the coefficient of $x$: $' . $m . '$.'], 'Get $y$ on its own first.', 'reasoning', 35); },
        static function (MlbRng $r) { $a = 100 * $r->int(2, 10); $b = 50 * $r->int(2, 8);
            return mlb_typed('expr', 'A taxi charges ₦' . mlb_p($a) . ' to start and ₦' . mlb_p($b) . ' for each kilometre. Write the cost $C$ (in naira) of a trip of $d$ km as an expression in $d$.', $b . 'd+' . $a,
                ['The cost per km is the gradient; the starting charge is the intercept.', '$C = ' . $b . 'd + ' . $a . '$.'], 'Fixed part + rate × distance.', 'application', 45); },
    ];
    $f['MC-095'] = [
        static function (MlbRng $r) { do { $p = $r->nz(-5, 5); $q = $r->int(1, 5); } while (abs($p) === $q && $q === 1);
            return mlb_typed('frac', 'A line has gradient $' . mlb_ftex($p, $q) . '$. What is the gradient of a line perpendicular to it?', mlb_frac(-$q, $p),
                ['Perpendicular gradients multiply to $-1$: $m_2 = -\\frac{1}{m_1}$.', '$m_2 = -1 \\div ' . mlb_ftex($p, $q) . ' = ' . mlb_ftex(-$q, $p) . '$ — flip it and change the sign.'], 'Flip and change the sign.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->nz(-4, 4); $c0 = $r->int(-6, 6); $x = $r->int(-4, 4); $y = $r->int(-6, 6); $c = $y - $m * $x;
            return mlb_typed('expr', 'Find the equation of the line parallel to $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c0) . '$ that passes through $(' . $x . ', ' . $y . ')$.', $m . 'x' . ($c < 0 ? '' : '+') . $c,
                ['Parallel lines have the same gradient: $m = ' . $m . '$.', '$' . $y . ' = ' . $m . ' \\times (' . $x . ') + c$, so $c = ' . $c . '$: $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$.'], 'Same gradient, new intercept.', 'procedure', 50); },
        static function (MlbRng $r) { $m = $r->pick([2, 3, 4, 5]); $neg = $r->int(0, 1) ? -1 : 1; $m *= $neg;
            return mlb_mcq($r, 'Which gradient is perpendicular to a gradient of $' . $m . '$?', '$' . mlb_ftex(-1, $m) . '$',
                [['$' . mlb_ftex(1, $m) . '$', 'Flipped but the sign was not changed.'], ['$' . (-$m) . '$', 'Sign changed but not flipped.'], ['$' . $m . '$', 'That gradient is PARALLEL, not perpendicular.']],
                ['Perpendicular gradients multiply to $-1$.', '$' . $m . ' \\times ' . mlb_ftex(-1, $m) . ' = -1$.'], 'Their product is −1.', 'reasoning', 30); },
        static function (MlbRng $r) { $m = $r->pick([2, -2, 3, -3, 1, -1]); $x = $r->int(-3, 3); $c0 = $r->int(-4, 4); $y = $m * $x + $c0; $mp = -1 / $m; $cp = $y - $mp * $x;
            $key = mlb_frac(-1, $m) === '1' ? 'x' : (mlb_frac(-1, $m) === '-1' ? '-x' : '(' . mlb_frac(-1, $m) . ')x');
            $cpN = $y * $m + $x;   // c = y + x/m, kept exact as a fraction
            return mlb_typed('expr', 'A road runs along $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c0) . '$. A footpath must cross it at right angles at the point $(' . $x . ', ' . $y . ')$. Find the equation of the footpath.', $key . '+(' . mlb_frac($cpN, $m) . ')',
                ['Perpendicular gradient: $-\\frac{1}{' . $m . '} = ' . mlb_ftex(-1, $m) . '$.', '$y - ' . $y . ' = ' . mlb_ftex(-1, $m) . '(x - (' . $x . '))$, so $y = ' . mlb_ftex(-1, $m) . 'x + ' . mlb_ftex($cpN, $m) . '$.'], 'Perpendicular gradient, then the point.', 'application', 70); },
    ];
    $f['MC-096'] = [
        static function (MlbRng $r) { $x1 = $r->int(-8, 8); $y1 = $r->int(-8, 8); $x2 = $x1 + 2 * $r->nz(-5, 5); $y2 = $y1 + 2 * $r->nz(-5, 5);
            return mlb_typed('pair', 'Find the midpoint of the segment joining $(' . $x1 . ', ' . $y1 . ')$ and $(' . $x2 . ', ' . $y2 . ')$.', [intdiv($x1 + $x2, 2), intdiv($y1 + $y2, 2)],
                ['The midpoint averages the coordinates: $\\left(\\frac{x_1 + x_2}{2}, \\frac{y_1 + y_2}{2}\\right)$.', '$\\left(\\frac{' . ($x1 + $x2) . '}{2}, \\frac{' . ($y1 + $y2) . '}{2}\\right) = (' . intdiv($x1 + $x2, 2) . ', ' . intdiv($y1 + $y2, 2) . ')$.'], 'Halfway in $x$, halfway in $y$.', 'procedure', 40, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $x1 = $r->int(-5, 5); $y1 = $r->int(-5, 5); $sx = $r->int(0, 1) ? 1 : -1; $sy = $r->int(0, 1) ? 1 : -1;
            $x2 = $x1 + $sx * $a; $y2 = $y1 + $sy * $b;
            return mlb_typed('num', 'Find the distance between $(' . $x1 . ', ' . $y1 . ')$ and $(' . $x2 . ', ' . $y2 . ')$.', (string)$c,
                ['$d = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$ — Pythagoras on the grid.', '$\\sqrt{' . ($x2 - $x1) . '^2 + ' . ($y2 - $y1) . '^2} = \\sqrt{' . ($a * $a + $b * $b) . '} = ' . $c . '$.'], 'Make a right-angled triangle.', 'procedure', 50); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(array_slice(MLB_TRIPLES, 0, 3)); $x1 = $r->int(1, 4); $y1 = $r->int(1, 4); $x2 = $x1 + $a; $y2 = $y1 + $b;
            $L1 = '$d^2 = (' . $x2 . ' - ' . $x1 . ')^2 + (' . $y2 . ' - ' . $y1 . ')^2$'; $L2 = '$d^2 = ' . $a . '^2 + ' . $b . '^2$'; $L3 = '$d^2 = ' . ($a * $a + $b * $b) . '$';
            return mlb_error_of($r, 'Find the first mistake in this working for the distance from $(' . $x1 . ', ' . $y1 . ')$ to $(' . $x2 . ', ' . $y2 . ')$.', [$L1, $L2, $L3, '$d = ' . $c . '$'], [
                [1, [$L1, '$d^2 = ' . $a . ' + ' . $b . '$', '$d^2 = ' . ($a + $b) . '$', '$d = \\sqrt{' . ($a + $b) . '}$'], 'the differences must be SQUARED before they are added.'],
                [2, [$L1, $L2, '$d^2 = ' . (($a + $b) ** 2) . '$', '$d = ' . ($a + $b) . '$'], '$' . $a . '^2 + ' . $b . '^2$ is $' . ($a * $a + $b * $b) . '$, not $(' . $a . ' + ' . $b . ')^2$.'],
                [3, [$L1, $L2, $L3, '$d = ' . ($a * $a + $b * $b) / 2 . '$'], 'the last step is a square root, not halving: $\\sqrt{' . ($a * $a + $b * $b) . '} = ' . $c . '$.'],
            ]); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->pick([1, 2, 5]); $x1 = $r->int(0, 5); $y1 = $r->int(0, 5);
            return mlb_typed('num', 'On a map grid where each unit is $' . $k . '$ km, a village is at $(' . $x1 . ', ' . $y1 . ')$ and a market at $(' . ($x1 + $a) . ', ' . ($y1 + $b) . ')$. How far apart are they in a straight line, in km?', (string)($c * $k),
                ['Grid distance: $\\sqrt{' . $a . '^2 + ' . $b . '^2} = ' . $c . '$ units.', '$' . $c . ' \\times ' . $k . ' = ' . ($c * $k) . '$ km.'], 'Distance on the grid, then the scale.', 'application', 60, ['unit' => 'km']); },
    ];
    $f['MC-097'] = [
        static function (MlbRng $r) { $m = $r->nz(-3, 3); $c = $r->int(-3, 3); $x = $r->int(-3, 3); $yIn = $m * $x + $c + $r->int(1, 4);
            $yOn = $m * $x + $c; $yOut = $m * $x + $c - $r->int(1, 4); $x2 = $x + 1;
            return mlb_mcq($r, 'Which point satisfies $y > ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$?', '$(' . $x . ', ' . $yIn . ')$',
                [['$(' . $x . ', ' . $yOn . ')$', 'This point is ON the line: $y$ equals $' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$, and the inequality is strict.'], ['$(' . $x . ', ' . $yOut . ')$', 'This point is below the line: $y$ is less than $' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$.'],
                 ['$(' . $x2 . ', ' . ($m * $x2 + $c) . ')$', 'This point is also on the line, so it does not satisfy a strict inequality.']],
                ['Substitute each point: compare $y$ with $' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$.', 'At $(' . $x . ', ' . $yIn . ')$: $' . $yIn . ' > ' . $yOn . '$. ✓'], 'Put the point into both sides.', 'procedure', 45); },
        static function (MlbRng $r) { $k = $r->int(5, 9); $px = $r->int(1, $k - 3); $py = $r->int(1, $k - $px - 1);
            return mlb_mcq($r, 'Which point lies in the region where $x \\ge 0$, $y \\ge 0$ and $x + y \\le ' . $k . '$?', '$(' . $px . ', ' . $py . ')$',
                [['$(' . ($k - 1) . ', 3)$', 'Here $x + y = ' . ($k + 2) . '$, which is more than ' . $k . '.'], ['$(-1, ' . ($k - 3) . ')$', 'Here $x$ is negative, but $x \\ge 0$.'], ['$(' . ($k - 2) . ', -2)$', 'Here $y$ is negative, but $y \\ge 0$.']],
                ['All three conditions must hold at once.', 'At $(' . $px . ', ' . $py . ')$: both are positive and $' . $px . ' + ' . $py . ' = ' . ($px + $py) . ' \\le ' . $k . '$. ✓'], 'Check every inequality, not just one.', 'reasoning', 45); },
        static function (MlbRng $r) { $n = $r->int(2, 7);
            return mlb_typed('num', 'How many points with whole-number coordinates satisfy $x \\ge 0$, $y \\ge 0$ and $x + y \\le ' . $n . '$?', (string)(($n + 1) * ($n + 2) / 2),
                ['Count row by row: when $y = 0$, $x$ can be $0$ to $' . $n . '$ (' . ($n + 1) . ' values); when $y = 1$, ' . $n . ' values; … down to 1 value.', '$' . ($n + 1) . ' + ' . $n . ' + \\dots + 1 = ' . (($n + 1) * ($n + 2) / 2) . '$.'], 'Count one row at a time.', 'reasoning', 60); },
        static function (MlbRng $r) { $N = $r->int(20, 40); $m = $r->int(5, 10); $cx = $r->int($m, $N - 5); $cy = $r->int(1, $N - $cx);
            return mlb_mcq($r, 'A baker makes $x$ cakes and $y$ pies a day. The oven holds at most $' . $N . '$ items ($x + y \\le ' . $N . '$) and she must make at least $' . $m . '$ cakes ($x \\ge ' . $m . '$). Which plan is possible?', $cx . ' cakes and ' . $cy . ' pies',
                [[($m - 1) . ' cakes and ' . $cy . ' pies', 'Fewer than ' . $m . ' cakes breaks $x \\ge ' . $m . '$.'], [$cx . ' cakes and ' . ($N - $cx + 3) . ' pies', 'That is ' . ($N + 3) . ' items — more than the oven holds.'], [($N + 1) . ' cakes and 0 pies', 'That is ' . ($N + 1) . ' items, more than ' . $N . '.']],
                ['A plan is possible only if it satisfies EVERY inequality.', $cx . ' + ' . $cy . ' = ' . ($cx + $cy) . ' \\le ' . $N . '$ and $' . $cx . ' \\ge ' . $m . '$ ✓'], 'Test each plan against both conditions.', 'application', 60); },
    ];
    $f['MC-098'] = [
        static function (MlbRng $r) { do { $p = $r->int(-6, 6); $q = $r->int(-6, 6); } while ($p === $q);
            [$lo, $hi] = [min($p, $q), max($p, $q)];
            return mlb_typed('pair', 'Where does $y = ' . mlb_poly([1, -($p + $q), $p * $q]) . '$ cross the $x$-axis? Give both $x$-values, the smaller first.', [$lo, $hi],
                ['The graph crosses the $x$-axis where $y = 0$: $' . mlb_poly([1, -($p + $q), $p * $q]) . ' = 0$.', 'Factorise: $(x ' . ($lo < 0 ? '+ ' . (-$lo) : '- ' . $lo) . ')(x ' . ($hi < 0 ? '+ ' . (-$hi) : '- ' . $hi) . ') = 0$, so $x = ' . $lo . '$ or $x = ' . $hi . '$.'],
                'Set $y = 0$ and factorise.', 'procedure', 60, ['labels' => ['x_1', 'x_2'], 'diagram' => mlb_plotd([['quad', 1, -($p + $q), $p * $q]], [], 8)]); },
        static function (MlbRng $r) { $h = $r->int(-5, 5); $k = $r->int(-6, 6);
            return mlb_typed('pair', 'What are the coordinates of the turning point of $y = (x ' . ($h < 0 ? '+ ' . (-$h) : '- ' . $h) . ')^2 ' . ($k < 0 ? '- ' . (-$k) : '+ ' . $k) . '$?', [$h, $k],
                ['$(x - h)^2 + k$ is smallest when the bracket is zero, at $x = h$.', 'So the turning point is $(' . $h . ', ' . $k . ')$ — a minimum.'], 'When is the squared bracket zero?', 'procedure', 40, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $a = $r->nz(-3, 3); $b = $r->int(-6, 6); $c = $r->int(-6, 6); $up = $a > 0;
            return mlb_mcq($r, 'Which describes the graph of $y = ' . mlb_poly([$a, $b, $c]) . '$?', $up ? 'A ∪-shaped curve with a minimum point' : 'A ∩-shaped curve with a maximum point',
                [[$up ? 'A ∩-shaped curve with a maximum point' : 'A ∪-shaped curve with a minimum point', 'The sign of the $x^2$ coefficient decides: ' . ($up ? 'positive' : 'negative') . ' here.'], ['A straight line', 'An $x^2$ term makes a curve (a parabola).'], ['A curve with no turning point', 'Every parabola has exactly one turning point.']],
                ['The coefficient of $x^2$ is $' . $a . '$, which is ' . ($up ? 'positive' : 'negative') . '.', $up ? 'Positive: the curve opens upwards, with a minimum.' : 'Negative: the curve opens downwards, with a maximum.'], 'Look at the sign of the $x^2$ term.', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->pick([1, 2, -1, -2, 3]); $h = $r->int(-5, 5); $b = -2 * $a * $h; $c = $r->int(-9, 9);
            return mlb_typed('num', 'What is the equation of the axis of symmetry of $y = ' . mlb_poly([$a, $b, $c]) . '$? Give the value of $x$.', (string)$h,
                ['The axis of symmetry is $x = -\\frac{b}{2a}$.', '$x = -\\frac{' . $b . '}{2 \\times ' . $a . '} = ' . $h . '$.'], 'It passes through the turning point.', 'procedure', 40); },
        static function (MlbRng $r) { $b = $r->int(4, 20);
            return mlb_typed('num', 'A ball is thrown up. Its height in metres after $t$ seconds is $h = ' . $b . 't - t^2$ (in a simplified model). After how many seconds does it land?', (string)$b,
                ['It lands when $h = 0$: $t(' . $b . ' - t) = 0$.', '$t = 0$ is the throw; it lands at $t = ' . $b . '$ s.'], 'Set the height to zero and factorise.', 'application', 50, ['unit' => 's']); },
        static function (MlbRng $r) { do { $p = $r->int(1, 7); $q = $r->int(1, 7); } while ($p === $q);
            $L1 = '$y = (x - ' . $p . ')(x + ' . $q . ')$ crosses the $x$-axis where $y = 0$'; $L2 = '$x - ' . $p . ' = 0$ or $x + ' . $q . ' = 0$';
            return mlb_error_of($r, 'Find the first mistake in this working for where $y = (x - ' . $p . ')(x + ' . $q . ')$ crosses the $x$-axis.', [$L1, $L2, '$x = ' . $p . '$ or $x = -' . $q . '$'], [
                [0, ['$y = (x - ' . $p . ')(x + ' . $q . ')$ crosses the $x$-axis where $x = 0$', '$y = (-' . $p . ')(' . $q . ')$', '$y = ' . (-$p * $q) . '$'], 'the $x$-axis is where $y = 0$; $x = 0$ gives the $y$-axis crossing.'],
                [2, [$L1, $L2, '$x = -' . $p . '$ or $x = ' . $q . '$'], 'the signs flip when solving: $x - ' . $p . ' = 0$ gives $x = ' . $p . '$.'],
            ]); },
    ];
    $f['MC-099'] = [
        static function (MlbRng $r) { do { $x = $r->int(-4, 4); $y = $r->int(-5, 5); $m1 = $r->nz(-3, 3); $m2 = $r->nz(-3, 3); } while ($m1 === $m2);
            $c1 = $y - $m1 * $x; $c2 = $y - $m2 * $x;
            return mlb_typed('pair', 'Where do the lines $y = ' . mlb_lterm($m1, 'x') . mlb_sterm($c1) . '$ and $y = ' . mlb_lterm($m2, 'x') . mlb_sterm($c2) . '$ meet?', [$x, $y],
                ['At the meeting point both $y$-values are equal: $' . mlb_lterm($m1, 'x') . mlb_sterm($c1) . ' = ' . mlb_lterm($m2, 'x') . mlb_sterm($c2) . '$.', '$' . mlb_lterm($m1 - $m2, 'x') . ' = ' . ($c2 - $c1) . '$, so $x = ' . $x . '$ and $y = ' . $y . '$.'], 'Set the two right-hand sides equal.', 'procedure', 60,
                ['labels' => ['x', 'y'], 'point' => true, 'diagram' => ['type' => 'lines', 'lines' => [[$m1, $c1], [$m2, $c2]], 'range' => 7]]); },
        static function (MlbRng $r) { do { $p = $r->int(-4, 3); $q = $r->int($p + 1, 5); } while ($p === 0 && $q === 0);
            return mlb_typed('num', 'The line $y = ' . mlb_lterm($p + $q, 'x') . mlb_sterm(-$p * $q) . '$ meets the curve $y = x^2$ at two points. What is the larger $x$-coordinate?', (string)$q,
                ['At the meeting points $x^2 = ' . mlb_lterm($p + $q, 'x') . mlb_sterm(-$p * $q) . '$, so $' . mlb_poly([1, -($p + $q), $p * $q]) . ' = 0$.', 'Factorise: $x = ' . $p . '$ or $x = ' . $q . '$. The larger is $' . $q . '$.'], 'Make one side zero and factorise.', 'application', 70); },
        static function (MlbRng $r) { $k = $r->int(1, 9);
            return mlb_mcq($r, 'The graph of $y = x^2 - ' . ($k * $k) . '$ is drawn. Where on it can you read the solutions of $x^2 - ' . ($k * $k) . ' = 0$?', 'Where the curve crosses the $x$-axis',
                [['Where the curve crosses the $y$-axis', 'That point is where $x = 0$; we want where $y = 0$.'], ['At the turning point', 'The turning point is where $y$ is smallest, at $y = -' . ($k * $k) . '$.'], ['Where the curve meets the line $y = ' . ($k * $k) . '$', 'That would solve $x^2 - ' . ($k * $k) . ' = ' . ($k * $k) . '$ instead.']],
                ['Solving $x^2 - ' . ($k * $k) . ' = 0$ means finding where $y = 0$.', 'Those are the $x$-intercepts: $x = \\pm ' . $k . '$.'], 'Which line is $y = 0$?', 'concept', 30); },
        static function (MlbRng $r) { do { $x = $r->int(-4, 5); $m1 = $r->nz(-3, 3); $m2 = $r->nz(-3, 3); } while ($m1 === $m2); $y = $r->int(-5, 5); $c1 = $y - $m1 * $x; $c2 = $y - $m2 * $x;
            $L1 = '$' . mlb_lterm($m1, 'x') . mlb_sterm($c1) . ' = ' . mlb_lterm($m2, 'x') . mlb_sterm($c2) . '$'; $L2 = '$' . mlb_lterm($m1 - $m2, 'x') . ' = ' . ($c2 - $c1) . '$';
            return mlb_error_of($r, 'Find the first mistake in this working for where $y = ' . mlb_lterm($m1, 'x') . mlb_sterm($c1) . '$ meets $y = ' . mlb_lterm($m2, 'x') . mlb_sterm($c2) . '$.', [$L1, $L2, '$x = ' . $x . '$, so $y = ' . $y . '$'], [
                [1, [$L1, '$' . mlb_lterm($m1 + $m2, 'x') . ' = ' . ($c2 - $c1) . '$', '$x = ' . mlb_ftex($c2 - $c1, $m1 + $m2 === 0 ? 1 : $m1 + $m2) . '$'], 'moving $' . mlb_lterm($m2, 'x') . '$ to the left changes its sign: $' . mlb_lterm($m1 - $m2, 'x') . '$.'],
                [2, [$L1, $L2, '$x = ' . $x . '$, so $y = ' . ($y + $r->nz(-3, 3)) . '$'], 'substituting $x = ' . $x . '$ into either line gives $y = ' . $y . '$.'],
            ]); },
    ];
    $f['MC-100'] = [
        static function (MlbRng $r) { $a = $r->int(1, 6); $dir = $r->int(0, 3);
            $cases = [['right', '(x - ' . $a . ')^2'], ['left', '(x + ' . $a . ')^2'], ['up', 'x^2 + ' . $a], ['down', 'x^2 - ' . $a]];
            [$d, $right] = $cases[$dir]; $wrong = [];
            foreach ($cases as $i => [$dd, $eq]) if ($i !== $dir) $wrong[] = ['$y = ' . $eq . '$', 'That moves the graph ' . $dd . '.'];
            return mlb_mcq($r, 'The graph of $y = x^2$ is moved ' . $a . ' unit' . ($a === 1 ? '' : 's') . ' ' . $d . '. What is its new equation?', '$y = ' . $right . '$', $wrong,
                [$dir < 2 ? 'A move sideways changes $x$ inside the function, and it goes the OPPOSITE way to the sign: $f(x - a)$ moves right.' : 'A move up or down adds to the whole function: $f(x) + a$ moves up.', 'So the new graph is $y = ' . $right . '$.'], 'Inside the bracket moves sideways — the opposite way.', 'reasoning', 35); },
        static function (MlbRng $r) { $h = $r->nz(-5, 5); $k = $r->nz(-5, 5);
            return mlb_typed('pair', 'The graph of $y = x^2$ is translated ' . abs($h) . ' unit' . (abs($h) === 1 ? '' : 's') . ' ' . ($h > 0 ? 'right' : 'left') . ' and ' . abs($k) . ' unit' . (abs($k) === 1 ? '' : 's') . ' ' . ($k > 0 ? 'up' : 'down') . '. Where is its turning point now?', [$h, $k],
                ['The turning point of $y = x^2$ starts at $(0, 0)$ and moves with the graph.', 'It moves to $(' . $h . ', ' . $k . ')$, and the new equation is $y = (x ' . ($h > 0 ? '- ' . $h : '+ ' . (-$h)) . ')^2 ' . ($k > 0 ? '+ ' . $k : '- ' . (-$k)) . '$.'], 'Follow the turning point.', 'procedure', 40, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            $cases = [['$y = -f(x)$', 'A reflection in the $x$-axis'], ['$y = f(-x)$', 'A reflection in the $y$-axis'], ['$y = 2f(x)$', 'A stretch parallel to the $y$-axis, scale factor 2']];
            [$eq, $right] = $cases[$c]; $wrong = [];
            foreach ($cases as $i => [$e, $t]) if ($i !== $c) $wrong[] = [$t, 'That is what ' . $e . ' does.'];
            $wrong[] = ['A translation', 'Nothing is added inside or outside the function, so nothing slides.'];
            return mlb_mcq($r, 'What does ' . $eq . ' do to the graph of $y = f(x)$?', $right, $wrong,
                ['Changes OUTSIDE $f$ act on $y$; changes INSIDE act on $x$.', $eq . ': ' . mb_strtolower($right) . '.'], 'Is the change inside or outside the function?', 'concept', 30); },
        static function (MlbRng $r) { $a = $r->int(-5, 5); $b = $r->int(1, 9); $k = $r->nz(-6, 6);
            return mlb_typed('pair', 'A designer\'s curve $y = f(x)$ has its highest point at $(' . $a . ', ' . $b . ')$. The whole curve is raised by adding $' . $k . '$: $y = f(x) ' . ($k > 0 ? '+ ' . $k : '- ' . (-$k)) . '$. Where is the highest point now?', [$a, $b + $k],
                ['Adding a number to $f(x)$ moves every point vertically by that amount.', '$(' . $a . ', ' . $b . ' ' . ($k > 0 ? '+ ' . $k : '- ' . (-$k)) . ') = (' . $a . ', ' . ($b + $k) . ')$.'], 'Outside the function: up or down.', 'application', 40, ['labels' => ['x', 'y'], 'point' => true]); },
    ];

    /* ══ Stage 11 · Advanced Secondary Algebra ═══════════════════════════ */
    $f['MC-101'] = [
        static function (MlbRng $r) { do { $p = $r->nz(-8, 8); $q = $r->nz(-8, 8); } while ($p + $q === 0);
            return mlb_typed('expr', 'Factorise $' . mlb_poly([1, $p + $q, $p * $q]) . '$.', '(x' . ($p < 0 ? '' : '+') . $p . ')(x' . ($q < 0 ? '' : '+') . $q . ')',
                ['Find two numbers that multiply to $' . ($p * $q) . '$ and add to $' . ($p + $q) . '$: $' . $p . '$ and $' . $q . '$.', '$' . mlb_poly([1, $p + $q, $p * $q]) . ' = (x' . mlb_sterm($p) . ')(x' . mlb_sterm($q) . ')$.'], 'Multiply to the constant, add to the middle.', 'procedure', 60, ['form' => 'factorised']); },
        static function (MlbRng $r) { do { $p = $r->int(-9, 9); $q = $r->int(-9, 9); } while ($p === $q);
            [$lo, $hi] = [min($p, $q), max($p, $q)];
            return mlb_typed('pair', 'Solve $' . mlb_poly([1, -($p + $q), $p * $q]) . ' = 0$. Give both solutions, the smaller first.', [$lo, $hi],
                ['Factorise: $(x' . mlb_sterm(-$p) . ')(x' . mlb_sterm(-$q) . ') = 0$.', 'If a product is zero, one factor is zero: $x = ' . $p . '$ or $x = ' . $q . '$.'], 'Factorise, then set each bracket to zero.', 'procedure', 60, ['labels' => ['x_1', 'x_2']]); },
        static function (MlbRng $r) { do { $p = $r->int(1, 8); $q = $r->int(1, 8); } while ($p === $q);
            $L1 = '$(x - ' . $p . ')(x + ' . $q . ') = 0$'; $L2 = '$x - ' . $p . ' = 0$ or $x + ' . $q . ' = 0$';
            return mlb_error_of($r, 'Find the first mistake in this working to solve $(x - ' . $p . ')(x + ' . $q . ') = 0$.', [$L1, $L2, '$x = ' . $p . '$ or $x = -' . $q . '$'], [
                [2, [$L1, $L2, '$x = -' . $p . '$ or $x = ' . $q . '$'], 'solving $x - ' . $p . ' = 0$ gives $x = ' . $p . '$: the sign changes when the number moves across.'],
                [1, [$L1, '$x - ' . $p . ' = 0$ and $x + ' . $q . ' = 0$', 'so there is no solution'], 'a product is zero when EITHER factor is zero — it is "or", not "and".'],
                [1, [$L1, '$x - ' . $p . ' = 1$ or $x + ' . $q . ' = 1$', '$x = ' . ($p + 1) . '$ or $x = ' . (1 - $q) . '$'], 'only zero works: two numbers multiply to zero only if one of them IS zero.'],
            ]); },
        static function (MlbRng $r) { $p = $r->int(1, 8); $q = $r->int($p + 1, 12);
            return mlb_typed('expr', 'A rectangle has area $' . mlb_poly([1, $p + $q, $p * $q]) . '$ and width $(x + ' . $p . ')$. Find an expression for its length.', 'x+' . $q,
                ['Length $= \\frac{\\text{area}}{\\text{width}}$, so factorise the area.', '$' . mlb_poly([1, $p + $q, $p * $q]) . ' = (x + ' . $p . ')(x + ' . $q . ')$, so the length is $x + ' . $q . '$.'], 'Factorise the area.', 'application', 50); },
    ];
    $f['MC-102'] = [
        static function (MlbRng $r) { $p = $r->nz(-7, 7); $c = $r->int(-15, 15);
            return mlb_typed('num', 'Write $' . mlb_poly([1, 2 * $p, $c]) . '$ in the form $(x + a)^2 + b$. What is $b$?', (string)($c - $p * $p),
                ['Halve the coefficient of $x$: $a = ' . $p . '$, and $(x' . mlb_sterm($p) . ')^2 = ' . mlb_poly([1, 2 * $p, $p * $p]) . '$.', 'That has $' . ($p * $p) . '$ too many (or few), so $b = ' . $c . ' - ' . ($p * $p) . ' = ' . ($c - $p * $p) . '$.'], 'Halve the $x$ coefficient, then correct the constant.', 'procedure', 60); },
        static function (MlbRng $r) { $p = $r->nz(-6, 6); $c = $r->int(-10, 15);
            return mlb_typed('pair', 'By completing the square, find the turning point of $y = ' . mlb_poly([1, 2 * $p, $c]) . '$.', [-$p, $c - $p * $p],
                ['$y = (x' . mlb_sterm($p) . ')^2 ' . (($c - $p * $p) < 0 ? '- ' . (-($c - $p * $p)) : '+ ' . ($c - $p * $p)) . '$.', 'The square is zero at $x = ' . (-$p) . '$, so the turning point is $(' . (-$p) . ', ' . ($c - $p * $p) . ')$.'], 'Complete the square first.', 'application', 70, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $p = $r->int(2, 7);
            return mlb_mcq($r, '$x^2 + ' . (2 * $p) . 'x = (x + ' . $p . ')^2 + k$. What is $k$?', '$-' . ($p * $p) . '$',
                [['$' . ($p * $p) . '$', '$(x + ' . $p . ')^2$ already contains $+' . ($p * $p) . '$, which has to be TAKEN AWAY.'], ['$-' . $p . '$', 'The extra term is $' . $p . '^2$, not $' . $p . '$.'], ['$-' . (2 * $p) . '$', 'Square the half, do not double it.']],
                ['$(x + ' . $p . ')^2 = x^2 + ' . (2 * $p) . 'x + ' . ($p * $p) . '$.', 'So $x^2 + ' . (2 * $p) . 'x = (x + ' . $p . ')^2 - ' . ($p * $p) . '$.'], 'Expand the bracket and compare.', 'reasoning', 40); },
        static function (MlbRng $r) { $p = $r->nz(-7, 7); $q = $r->int(-9, 9);
            return mlb_mcq($r, 'What is the minimum value of $(x ' . ($p > 0 ? '+ ' . $p : '- ' . (-$p)) . ')^2 ' . ($q < 0 ? '- ' . (-$q) : '+ ' . $q) . '$?', (string)$q,
                [[(string)(-$p), 'That is the value of $x$ where the minimum happens, not the minimum itself.'], ['0', 'The squared bracket can be 0, but then $' . $q . '$ is still added.'], [(string)($p * $p + $q), 'At the minimum the bracket is zero, so nothing is squared.']],
                ['A square is never negative, so it is smallest when it is 0 (at $x = ' . (-$p) . '$).', 'Then the expression equals $' . $q . '$.'], 'When is the bracket zero?', 'concept', 30); },
    ];
    $f['MC-103'] = [
        static function (MlbRng $r) { $a = $r->nz(-4, 5); $b = $r->int(-9, 9); $c = $r->int(-9, 9);
            return mlb_typed('num', 'Find the discriminant of $' . mlb_poly([$a, $b, $c]) . ' = 0$.', (string)($b * $b - 4 * $a * $c),
                ['The discriminant is $b^2 - 4ac$.', '$(' . $b . ')^2 - 4 \\times ' . $a . ' \\times (' . $c . ') = ' . ($b * $b) . ' - (' . (4 * $a * $c) . ') = ' . ($b * $b - 4 * $a * $c) . '$.'], 'Watch the signs of $a$ and $c$.', 'procedure', 40); },
        static function (MlbRng $r) { $k = $r->int(0, 2); $a = $r->int(1, 3);
            if ($k === 0) { $b = $r->int(-9, 9); do { $c = $r->int(-9, 9); } while ($b * $b - 4 * $a * $c <= 0); }
            elseif ($k === 1) { $p = $r->nz(-5, 5); $b = 2 * $a * $p; $c = $a * $p * $p; }
            else { $b = $r->int(-4, 4); $c = intdiv($b * $b, 4 * $a) + $r->int(1, 6); }
            $D = $b * $b - 4 * $a * $c; $right = $D > 0 ? 'Two different real roots' : ($D === 0 ? 'One repeated real root' : 'No real roots');
            $wrong = []; foreach (['Two different real roots', 'One repeated real root', 'No real roots'] as $t) if ($t !== $right) $wrong[] = [$t, 'The discriminant decides: positive → two, zero → one repeated, negative → none.'];
            $wrong[] = ['Three real roots', 'A quadratic has at most two roots.'];
            return mlb_mcq($r, 'How many real roots does $' . mlb_poly([$a, $b, $c]) . ' = 0$ have?', $right, $wrong,
                ['$b^2 - 4ac = ' . ($b * $b) . ' - ' . (4 * $a * $c) . ' = ' . $D . '$.', ($D > 0 ? 'Positive' : ($D === 0 ? 'Zero' : 'Negative')) . ', so: ' . mb_strtolower($right) . '.'], 'Work out $b^2 - 4ac$ first.', 'reasoning', 45); },
        static function (MlbRng $r) { do { $a = $r->int(1, 3); $b = $r->int(-9, 9); $c = $r->int(-9, 5); $D = $b * $b - 4 * $a * $c; } while ($D <= 0 || sqrt($D) == floor(sqrt($D)));
            $x = (-$b + sqrt($D)) / (2 * $a);
            return mlb_typed('num', 'Use the quadratic formula to solve $' . mlb_poly([$a, $b, $c]) . ' = 0$. Give the larger root correct to 2 decimal places.', mlb_rd($x, 2),
                ['$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} = \\frac{' . (-$b) . ' \\pm \\sqrt{' . $D . '}}{' . (2 * $a) . '}$.', 'The larger root takes $+$: $\\frac{' . (-$b) . ' + ' . mlb_rd(sqrt($D), 4) . '}{' . (2 * $a) . '} \\approx ' . mlb_rd($x, 2) . '$.'], 'Write down $a$, $b$ and $c$ with their signs first.', 'procedure', 90, ['dp' => 2]); },
        static function (MlbRng $r) { $x = $r->int(3, 15); $k = $r->int(1, 8);
            return mlb_typed('num', 'A garden is $x$ m wide and $(x + ' . $k . ')$ m long, with an area of $' . ($x * ($x + $k)) . '\\ \\text{m}^2$. Find $x$.', (string)$x,
                ['$x(x + ' . $k . ') = ' . ($x * ($x + $k)) . '$, so $' . mlb_poly([1, $k, -$x * ($x + $k)]) . ' = 0$.', 'Solve (factorise or use the formula): $x = ' . $x . '$ or $x = ' . (-$x - $k) . '$; a width cannot be negative, so $x = ' . $x . '$.'], 'Form a quadratic, then reject the impossible root.', 'application', 80, ['unit' => 'm']); },
    ];
    $f['MC-104'] = [
        static function (MlbRng $r) { $a = $r->pick([1, 2, 3, 4, 5]); $b = $r->nz(-12, 12); $c = $r->nz(-12, 12);
            return mlb_typed('frac', 'For $' . mlb_poly([$a, $b, $c]) . ' = 0$, find the SUM of the roots, as a fraction in lowest terms.', mlb_frac(-$b, $a),
                ['For $ax^2 + bx + c = 0$, the sum of the roots is $-\\frac{b}{a}$.', '$-\\frac{' . $b . '}{' . $a . '} = ' . mlb_ftex(-$b, $a) . '$.'], 'Sum $= -b/a$, product $= c/a$.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->pick([1, 2, 3, 4, 5]); $b = $r->nz(-12, 12); $c = $r->nz(-12, 12);
            return mlb_typed('frac', 'For $' . mlb_poly([$a, $b, $c]) . ' = 0$, find the PRODUCT of the roots, as a fraction in lowest terms.', mlb_frac($c, $a),
                ['For $ax^2 + bx + c = 0$, the product of the roots is $\\frac{c}{a}$.', '$\\frac{' . $c . '}{' . $a . '} = ' . mlb_ftex($c, $a) . '$.'], 'Product $= c/a$.', 'procedure', 35); },
        static function (MlbRng $r) { do { $p = $r->int(-6, 6); $q = $r->int(-6, 6); } while ($p === $q);
            return mlb_typed('expr', 'Find a quadratic equation whose roots are $' . $p . '$ and $' . $q . '$, in the form $x^2 + bx + c$ (= 0). Type the left-hand side.', 'x^2' . mlb_sterm(-($p + $q), 'x') . mlb_sterm($p * $q),
                ['$x^2 - (\\text{sum})x + (\\text{product}) = 0$.', 'Sum $' . ($p + $q) . '$, product $' . ($p * $q) . '$: $' . mlb_poly([1, -($p + $q), $p * $q]) . ' = 0$.'], 'Sum and product of the roots.', 'application', 50); },
        static function (MlbRng $r) { $a = $r->pick([2, 3, 4]); $b = -$a * $r->pick([2, 3, 4, 5]); $c = $r->nz(-9, 9); if (mlb_frac($c, $a) === mlb_frac(-$b, $a)) $c++;
            return mlb_mcq($r, 'What is the sum of the roots of $' . mlb_poly([$a, $b, $c]) . ' = 0$?', '$' . mlb_ftex(-$b, $a) . '$',
                [['$' . mlb_ftex($b, $a) . '$', 'The sum is $-\\frac{b}{a}$: the sign changes.'], ['$' . (-$b) . '$', 'Divide by $a = ' . $a . '$ as well.'], ['$' . mlb_ftex($c, $a) . '$', 'That is the PRODUCT of the roots.']],
                ['Sum of roots $= -\\frac{b}{a}$.', '$-\\frac{' . $b . '}{' . $a . '} = ' . mlb_ftex(-$b, $a) . '$.'], 'Sum is $-b/a$.', 'reasoning', 35); },
    ];
    $f['MC-105'] = [
        static function (MlbRng $r) { do { $p = $r->int(-5, 8); $q = $r->int(-5, 8); } while ($p >= $q);
            return mlb_typed('pair', 'Solve the simultaneous equations $x + y = ' . ($p + $q) . '$ and $xy = ' . ($p * $q) . '$. Give the two possible values of $x$, the smaller first.', [$p, $q],
                ['From the first, $y = ' . ($p + $q) . ' - x$. Substitute: $x(' . ($p + $q) . ' - x) = ' . ($p * $q) . '$.', 'So $' . mlb_poly([1, -($p + $q), $p * $q]) . ' = 0$, giving $x = ' . $p . '$ or $x = ' . $q . '$ (and $y$ is the other).'], 'Substitute the linear one into the other.', 'procedure', 90, ['labels' => ['x_1', 'x_2']]); },
        static function (MlbRng $r) { do { $p = $r->int(-4, 2); $q = $r->int(1, 6); } while ($p >= $q);
            return mlb_typed('num', 'Solve $y = x^2 ' . mlb_sterm(-($p + $q), 'x') . '$ and $y = ' . (-$p * $q) . '$ together. What is the larger value of $x$?', (string)$q,
                ['Set them equal: $' . mlb_poly([1, -($p + $q), 0]) . ' = ' . (-$p * $q) . '$, so $' . mlb_poly([1, -($p + $q), $p * $q]) . ' = 0$.', '$x = ' . $p . '$ or $x = ' . $q . '$; the larger is $' . $q . '$.'], 'Make one side zero.', 'application', 70); },
        static function (MlbRng $r) { $k = $r->int(0, 2); $c = [$r->int(1, 9), 0, -$r->int(1, 9)][$k]; $right = ['2', '1', '0'][$k];
            $wrong = []; foreach (['2', '1', '0'] as $t) if ($t !== $right) $wrong[] = [$t, 'Picture the ∪ of $y = x^2$, lowest at the origin, and the horizontal line $y = ' . $c . '$.'];
            $wrong[] = ['Infinitely many', 'A curve and a line meet at isolated points, unless the line IS part of the curve.'];
            return mlb_mcq($r, 'How many points do $y = x^2$ and $y = ' . $c . '$ have in common?', $right, $wrong,
                ['$x^2 = ' . $c . '$.', $c > 0 ? 'Two solutions, $x = \\pm\\sqrt{' . $c . '}$.' : ($c === 0 ? 'Only $x = 0$.' : 'A square is never negative, so none.')], 'Sketch the parabola and the line.', 'reasoning', 30); },
        static function (MlbRng $r) { do { $p = $r->int(1, 6); $q = $r->int(1, 6); } while ($p === $q); $s = $p + $q;
            $L1 = '$y = ' . $s . ' - x$'; $L2 = '$x(' . $s . ' - x) = ' . ($p * $q) . '$'; $L3 = '$x^2 - ' . $s . 'x + ' . ($p * $q) . ' = 0$';
            return mlb_error_of($r, 'Find the first mistake in this working to solve $x + y = ' . $s . '$, $xy = ' . ($p * $q) . '$.', [$L1, $L2, $L3, '$x = ' . min($p, $q) . '$ or $x = ' . max($p, $q) . '$'], [
                [0, ['$y = x - ' . $s . '$', '$x(x - ' . $s . ') = ' . ($p * $q) . '$', '$x^2 - ' . $s . 'x - ' . ($p * $q) . ' = 0$', 'no whole-number solutions'], 'from $x + y = ' . $s . '$, $y = ' . $s . ' - x$; the order of subtraction matters.'],
                [2, [$L1, $L2, '$x^2 + ' . $s . 'x + ' . ($p * $q) . ' = 0$', '$x = -' . min($p, $q) . '$ or $x = -' . max($p, $q) . '$'], 'expanding $x(' . $s . ' - x) = ' . ($p * $q) . '$ and rearranging gives $x^2 - ' . $s . 'x + ' . ($p * $q) . ' = 0$.'],
            ]); },
    ];
    $f['MC-106'] = [
        static function (MlbRng $r) { do { $a = $r->int(-6, 3); $b = $r->int(-3, 7); } while ($a >= $b); $lt = $r->int(0, 1) === 1;
            $in = '$' . $a . ' < x < ' . $b . '$'; $out = '$x < ' . $a . '$ or $x > ' . $b . '$';
            return mlb_mcq($r, 'Solve $(x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ') ' . ($lt ? '<' : '>') . ' 0$.', $lt ? $in : $out,
                [[$lt ? $out : $in, 'That is where the product is ' . ($lt ? 'positive' : 'negative') . '. The ∪-shaped graph is BELOW the axis between the roots.'], ['$x < ' . $a . '$', 'Only half of the answer — check both sides of the graph.'], ['$x > ' . $b . '$ only', 'Check the other region too.']],
                ['The roots are $' . $a . '$ and $' . $b . '$; $y = (x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ')$ is ∪-shaped.', $lt ? 'It is below zero between the roots: $' . $a . ' < x < ' . $b . '$.' : 'It is above zero outside the roots.'], 'Sketch the parabola through its roots.', 'reasoning', 50); },
        static function (MlbRng $r) { $p = $r->nz(-6, 6); $c = $r->int(-10, 10);
            return mlb_typed('num', 'Find the maximum value of $y = ' . mlb_poly([-1, 2 * $p, $c]) . '$.', (string)($c + $p * $p),
                ['Complete the square: $y = -(x' . mlb_sterm(-$p) . ')^2 + ' . ($c + $p * $p) . '$.', 'The squared term is never negative, so $y$ is largest when it is zero: $' . ($c + $p * $p) . '$.'], 'Complete the square; the maximum is the constant left.', 'application', 60); },
        static function (MlbRng $r) { $P = 4 * $r->int(3, 25);
            return mlb_typed('num', 'A rectangle has a perimeter of $' . $P . '$ m. What is the largest area it can have, in $\\text{m}^2$?', (string)(($P / 4) ** 2),
                ['If one side is $x$, the other is $' . ($P / 2) . ' - x$, so $A = x(' . ($P / 2) . ' - x)$.', 'This is largest halfway between the roots, at $x = ' . ($P / 4) . '$ — a square — giving $' . (($P / 4) ** 2) . '\\ \\text{m}^2$.'], 'Write the area as a quadratic in one side.', 'application', 70, ['unit' => 'm²']); },
        static function (MlbRng $r) { do { $a = $r->int(-6, 2); $b = $r->int(-1, 8); } while ($a >= $b);
            return mlb_typed('num', 'How many whole numbers $x$ satisfy $(x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ') \\le 0$?', (string)($b - $a + 1),
                ['The product is at most zero between the roots, including them: $' . $a . ' \\le x \\le ' . $b . '$.', 'Whole numbers from $' . $a . '$ to $' . $b . '$: $' . $b . ' - (' . $a . ') + 1 = ' . ($b - $a + 1) . '$.'], 'Count both ends.', 'procedure', 50); },
    ];
    $f['MC-107'] = [
        static function (MlbRng $r) { $a = $r->nz(-5, 5); $b = $r->int(-4, 4); $c = $r->nz(-6, 6);
            return mlb_typed('expr', 'Expand and simplify $(x' . mlb_sterm($a) . ')(' . mlb_poly([1, $b, $c]) . ')$.', mlb_poly([1, $a + $b, $a * $b + $c, $a * $c]),
                ['Multiply every term in the second bracket by $x$, then by $' . $a . '$.', '$' . mlb_poly([1, $b, $c, 0]) . mlb_sterm($a, 'x^2') . mlb_sterm($a * $b, 'x') . mlb_sterm($a * $c) . ' = ' . mlb_poly([1, $a + $b, $a * $b + $c, $a * $c]) . '$.'], 'Two terms times three terms: six products.', 'procedure', 70, ['form' => 'expanded']); },
        static function (MlbRng $r) { $a = $r->nz(-4, 4); $p = $r->int(-5, 5); $q = $r->nz(-6, 6);
            $top = [1, $p - $a, $q - $a * $p, -$a * $q];
            return mlb_typed('expr', 'Divide $' . mlb_poly($top) . '$ by $(x' . mlb_sterm(-$a) . ')$. What is the quotient?', mlb_poly([1, $p, $q]),
                ['Long division: $x^3 \\div x = x^2$; subtract $x^2(x' . mlb_sterm(-$a) . ')$; bring down and repeat.', 'The quotient is $' . mlb_poly([1, $p, $q]) . '$, with no remainder. Check: $(x' . mlb_sterm(-$a) . ')(' . mlb_poly([1, $p, $q]) . ') = ' . mlb_poly($top) . '$.'], 'Divide the leading terms each time.', 'procedure', 90); },
        static function (MlbRng $r) { $m = $r->int(2, 5); $n = $r->int(1, 4);
            return mlb_mcq($r, 'A polynomial of degree ' . $m . ' is multiplied by a polynomial of degree ' . $n . '. What is the degree of the product?', (string)($m + $n),
                [[(string)($m * $n), 'Powers ADD when you multiply: $x^' . $m . ' \\times x^' . $n . ' = x^{' . ($m + $n) . '}$.'], [(string)max($m, $n), 'Multiplying raises the degree: the highest powers multiply together.'], [(string)abs($m - $n), 'Degrees subtract in division, not multiplication.']],
                ['The highest-power terms multiply: $x^' . $m . ' \\times x^' . $n . '$.', 'That is $x^{' . ($m + $n) . '}$, so the degree is $' . ($m + $n) . '$.'], 'Multiply the leading terms.', 'reasoning', 25); },
        static function (MlbRng $r) { $a = $r->int(1, 3); $b = $a + $r->int(1, 2);
            return mlb_typed('expr', 'A box measures $x$ cm by $(x + ' . $a . ')$ cm by $(x + ' . $b . ')$ cm. Write its volume as a polynomial in $x$, expanded.', mlb_poly([1, $a + $b, $a * $b, 0]),
                ['$V = x(x + ' . $a . ')(x + ' . $b . ')$, and $(x + ' . $a . ')(x + ' . $b . ') = ' . mlb_poly([1, $a + $b, $a * $b]) . '$.', 'Times $x$: $' . mlb_poly([1, $a + $b, $a * $b, 0]) . '$.'], 'Multiply two brackets first, then the third.', 'application', 60, ['form' => 'expanded']); },
    ];
    $f['MC-108'] = [
        static function (MlbRng $r) { $c = [$r->int(1, 2), $r->int(-5, 5), $r->int(-6, 6), $r->int(-9, 9)]; $a = $r->nz(-3, 3);
            $v = $c[0] * $a ** 3 + $c[1] * $a ** 2 + $c[2] * $a + $c[3];
            return mlb_typed('num', 'Find the remainder when $f(x) = ' . mlb_poly($c) . '$ is divided by $(x' . mlb_sterm(-$a) . ')$.', (string)$v,
                ['Remainder theorem: the remainder is $f(' . $a . ')$.', '$f(' . $a . ') = ' . $c[0] . '(' . $a . ')^3 + ' . $c[1] . '(' . $a . ')^2 + ' . $c[2] . '(' . $a . ') + ' . $c[3] . ' = ' . $v . '$.'], 'Substitute the value that makes the divisor zero.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->nz(-3, 3); $b = $r->int(-4, 4); $k = $r->int(-12, 12); $c = -($a ** 3 + $b * $a * $a + $k * $a);
            return mlb_typed('num', '$(x' . mlb_sterm(-$a) . ')$ is a factor of $x^3' . mlb_sterm($b, 'x^2') . ' + kx' . mlb_sterm($c) . '$. Find $k$.', (string)$k,
                ['Factor theorem: $f(' . $a . ') = 0$.', '$' . ($a ** 3) . mlb_sterm($b * $a * $a) . ' + ' . $a . 'k' . mlb_sterm($c) . ' = 0$, so $' . $a . 'k = ' . ($k * $a) . '$ and $k = ' . $k . '$.'], 'A factor leaves no remainder.', 'application', 60); },
        static function (MlbRng $r) { $a = $r->int(1, 6);
            return mlb_mcq($r, '$(x - ' . $a . ')$ is a factor of $f(x)$ exactly when…', '$f(' . $a . ') = 0$',
                [['$f(-' . $a . ') = 0$', 'The factor $(x - ' . $a . ')$ is zero when $x = ' . $a . '$, not $-' . $a . '$.'], ['$f(0) = ' . $a . '$', 'That is the constant term, which says nothing about this factor.'], ['$f(' . $a . ') = 1$', 'A factor leaves a remainder of zero, not one.']],
                ['$(x - ' . $a . ')$ is zero at $x = ' . $a . '$.', 'It divides $f$ exactly when the remainder $f(' . $a . ')$ is zero.'], 'What makes the factor zero?', 'concept', 30); },
        static function (MlbRng $r) { $c = [1, $r->int(-4, 4), $r->int(-5, 5), $r->int(-8, 8)]; $a = $r->int(1, 3);
            $f = static fn($x) => $c[0] * $x ** 3 + $c[1] * $x ** 2 + $c[2] * $x + $c[3]; $right = $f($a); $wrongV = $f(-$a);
            if ($right === $wrongV) $c[3] += 1;
            $right = $f($a); $wrongV = $f(-$a);
            return mlb_error_of($r, 'Find the first mistake in this working for the remainder when $' . mlb_poly($c) . '$ is divided by $(x - ' . $a . ')$.',
                ['By the remainder theorem the remainder is $f(' . $a . ')$', '$f(' . $a . ') = ' . $a . '^3' . mlb_sterm($c[1]) . '(' . $a . ')^2' . mlb_sterm($c[2]) . '(' . $a . ')' . mlb_sterm($c[3]) . '$', '$= ' . $right . '$'], [
                [0, ['By the remainder theorem the remainder is $f(-' . $a . ')$', '$f(-' . $a . ') = (-' . $a . ')^3' . mlb_sterm($c[1]) . '(' . $a . ')^2' . mlb_sterm($c[2]) . '(-' . $a . ')' . mlb_sterm($c[3]) . '$', '$= ' . $wrongV . '$'], 'dividing by $(x - ' . $a . ')$ means substituting the value that makes it zero: $x = ' . $a . '$, not $-' . $a . '$.'],
                [2, ['By the remainder theorem the remainder is $f(' . $a . ')$', '$f(' . $a . ') = ' . $a . '^3' . mlb_sterm($c[1]) . '(' . $a . ')^2' . mlb_sterm($c[2]) . '(' . $a . ')' . mlb_sterm($c[3]) . '$', '$= ' . ($right + $r->nz(-4, 4)) . '$'], 'the arithmetic: it comes to $' . $right . '$.'],
            ]); },
    ];
    $f['MC-109'] = [
        static function (MlbRng $r) { do { $a = $r->int(-4, 4); $b = $r->int(-4, 4); $c = $r->int(-4, 4); } while ($a === $b || $b === $c || $a === $c);
            $co = [1, -($a + $b + $c), $a * $b + $b * $c + $a * $c, -$a * $b * $c];
            return mlb_typed('num', 'One root of $' . mlb_poly($co) . ' = 0$ is $x = ' . $a . '$. What is the sum of the other two roots?', (string)($b + $c),
                ['For $x^3 + px^2 + \\dots$, the three roots add up to $-p = ' . ($a + $b + $c) . '$.', 'So the other two add up to $' . ($a + $b + $c) . ' - (' . $a . ') = ' . ($b + $c) . '$.'], 'The roots of a monic cubic add to minus the $x^2$ coefficient.', 'reasoning', 60); },
        static function (MlbRng $r) { $a = $r->nz(-4, 4); $b = $r->nz(-4, 4); $c = $r->nz(-4, 4);
            return mlb_typed('num', 'Where does $y = (x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ')(x' . mlb_sterm(-$c) . ')$ cross the $y$-axis? Give the $y$-value.', (string)(-$a * $b * $c),
                ['The $y$-axis is where $x = 0$.', '$y = (' . (-$a) . ')(' . (-$b) . ')(' . (-$c) . ') = ' . (-$a * $b * $c) . '$.'], 'Put $x = 0$.', 'procedure', 35); },
        static function (MlbRng $r) { $q = $r->int(0, 1);
            return $q ? mlb_mcq($r, 'What is the greatest number of times the graph of a cubic can cross the $x$-axis?', '3',
                    [['2', 'That is the most for a quadratic. A cubic can have three real roots.'], ['1', 'A cubic always crosses at least once, but can cross three times.'], ['4', 'A degree-3 polynomial has at most 3 roots.']],
                    ['A polynomial of degree $n$ has at most $n$ real roots.', 'So a cubic crosses at most 3 times.'], 'Degree = most roots.', 'concept', 25)
                : mlb_mcq($r, 'What is the greatest number of turning points the graph of a cubic can have?', '2',
                    [['3', 'A degree-$n$ polynomial has at most $n - 1$ turning points.'], ['1', 'A cubic can have two: a hump and a dip.'], ['0', 'Some cubics (like $y = x^3$) have none, but the most is two.']],
                    ['Turning points are where the gradient, a quadratic, is zero.', 'A quadratic has at most 2 roots, so at most 2 turning points.'], 'Degree minus one.', 'concept', 25); },
        static function (MlbRng $r) { $L = 2 * $r->int(5, 10); $x = $r->int(1, intdiv($L, 2) - 1);
            return mlb_typed('num', 'An open box is made from a $' . $L . '$ cm square sheet by cutting a square of side $x$ cm from each corner and folding up the sides, so its volume is $V = x(' . $L . ' - 2x)^2$. Find $V$ when $x = ' . $x . '$, in $\\text{cm}^3$.', (string)($x * ($L - 2 * $x) ** 2),
                ['The base is $(' . $L . ' - 2 \\times ' . $x . ') = ' . ($L - 2 * $x) . '$ cm square and the height is $' . $x . '$ cm.', '$V = ' . $x . ' \\times ' . ($L - 2 * $x) . '^2 = ' . ($x * ($L - 2 * $x) ** 2) . '\\ \\text{cm}^3$.'], 'Substitute into the cubic model.', 'application', 45, ['unit' => 'cm³']); },
    ];
    $f['MC-110'] = [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 4, 5, 8]); $n = $r->int(5, $b ** 3 + 20); $digits = base_convert((string)$n, 10, $b);
            return mlb_typed('num', 'Convert $' . $digits . '_{' . $b . '}$ to base 10.', (string)$n,
                ['Each place is a power of ' . $b . ': ' . implode(', ', array_reverse(array_map(static fn($i) => $b . '^' . $i, range(0, strlen($digits) - 1)))) . '.', '$' . implode(' + ', array_map(static fn($d, $i) => $d . ' \\times ' . $b . '^{' . (strlen($digits) - 1 - $i) . '}', str_split($digits), array_keys(str_split($digits)))) . ' = ' . $n . '$.'], 'Multiply each digit by its place value.', 'procedure', 50); },
        static function (MlbRng $r) { $n = $r->int(5, 63);
            return mlb_typed('num', 'Write $' . $n . '$ (base 10) in binary.', decbin($n),
                ['Divide by 2 repeatedly and read the remainders from the bottom up, or use place values $32, 16, 8, 4, 2, 1$.', '$' . $n . ' = ' . implode(' + ', array_map(static fn($p) => (string)(2 ** $p), array_values(array_filter(range(5, 0, -1), static fn($p) => ($n >> $p) & 1)))) . '$, so it is $' . decbin($n) . '_2$.'], 'Which powers of 2 add up to it?', 'procedure', 50, ['show' => '$' . decbin($n) . '_2$']); },
        static function (MlbRng $r) { $a = $r->int(5, 31); $b = $r->int(5, 31);
            return mlb_typed('num', 'Add the binary numbers $' . decbin($a) . '_2 + ' . decbin($b) . '_2$. Give the answer in binary.', decbin($a + $b),
                ['Add column by column: $1 + 1 = 10_2$, so write 0 and carry 1.', 'In base 10 that is $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$, which is $' . decbin($a + $b) . '_2$.'], 'Carry when a column reaches 2.', 'procedure', 60, ['show' => '$' . decbin($a + $b) . '_2$']); },
        static function (MlbRng $r) { $m = $r->pick([5, 6, 7, 9, 12]); $a = $r->int(5, 40); $b = $r->int(5, 40); $op = $r->int(0, 1);
            $v = $op ? ($a * $b) % $m : ($a + $b) % $m;
            return mlb_typed('num', 'Work out $' . $a . ' ' . ($op ? '\\times' : '+') . ' ' . $b . ' \\pmod{' . $m . '}$.', (string)$v,
                ['Work it out, then take the remainder on division by ' . $m . '.', '$' . ($op ? $a * $b : $a + $b) . ' = ' . intdiv($op ? $a * $b : $a + $b, $m) . ' \\times ' . $m . ' + ' . $v . '$, so the answer is $' . $v . '$.'], 'Clock arithmetic: what is left over?', 'procedure', 45); },
        static function (MlbRng $r) { $b = $r->pick([3, 4, 5, 6, 7]); $bad = (string)$r->int(1, $b - 1) . $b . (string)$r->int(0, $b - 1);
            $good = array_map(static fn() => '', [1, 2, 3]);
            $g1 = base_convert((string)$r->int($b, $b * $b * 2), 10, $b); $g2 = base_convert((string)$r->int($b * $b, $b ** 3 - 1), 10, $b); $g3 = (string)($b - 1) . '0';
            return mlb_mcq($r, 'Which of these is NOT a valid base-' . $b . ' number?', '$' . $bad . '_{' . $b . '}$',
                [['$' . $g1 . '_{' . $b . '}$', 'Every digit is less than ' . $b . ', so it is valid.'], ['$' . $g2 . '_{' . $b . '}$', 'Every digit is less than ' . $b . ', so it is valid.'], ['$' . $g3 . '_{' . $b . '}$', 'The digit ' . ($b - 1) . ' is the largest allowed in base ' . $b . '.']],
                ['Base ' . $b . ' uses only the digits $0$ to $' . ($b - 1) . '$.', '$' . $bad . '$ contains the digit ' . $b . ', so it cannot be base ' . $b . '.'], 'What is the largest digit allowed?', 'concept', 30); },
        static function (MlbRng $r) { $n = $r->int(4, 12);
            return mlb_typed('num', 'A memory cell holds ' . $n . ' binary digits (bits). What is the largest whole number it can store (in base 10)?', (string)(2 ** $n - 1),
                ['The largest ' . $n . '-bit number is ' . $n . ' ones: $' . str_repeat('1', $n) . '_2$.', 'That is one less than $2^{' . $n . '}$: $' . (2 ** $n) . ' - 1 = ' . (2 ** $n - 1) . '$.'], 'All ones — one less than the next power of 2.', 'application', 45); },
        static function (MlbRng $r) { $n = $r->int(9, 30); $bits = decbin($n); $len = strlen($bits); $right = $n;
            $shift = 0; foreach (str_split($bits) as $i => $d) $shift += (int)$d * 2 ** ($len - $i);
            return mlb_error_of($r, 'Find the first mistake in this working to convert $' . $bits . '_2$ to base 10.',
                ['Place values from the right: ' . implode(', ', array_map(static fn($p) => (string)(2 ** $p), range($len - 1, 0, -1))), 'Add the place values under each 1', 'Total $= ' . $right . '$'], [
                [0, ['Place values from the right: ' . implode(', ', array_map(static fn($p) => (string)(2 ** $p), range($len, 1, -1))), 'Add the place values under each 1', 'Total $= ' . $shift . '$'], 'the units column is $2^0 = 1$, not $2^1 = 2$, so every place value has been doubled.'],
                [2, ['Place values from the right: ' . implode(', ', array_map(static fn($p) => (string)(2 ** $p), range($len - 1, 0, -1))), 'Add the place values under each 1', 'Total $= ' . (int)$bits . '$'], 'the digits were read as a base-10 number; add the place values instead: ' . $right . '.'],
            ]); },
    ];

    /* ══ Stage 12 · Trigonometry, Statistics and Probability ═════════════ */
    $f['MC-111'] = [
        static function (MlbRng $r) { [$o, $a, $h] = $r->pick(MLB_TRIPLES); if ($r->int(0, 1)) [$o, $a] = [$a, $o]; $ratio = $r->pick(['sin', 'cos', 'tan']);
            $key = ['sin' => mlb_frac($o, $h), 'cos' => mlb_frac($a, $h), 'tan' => mlb_frac($o, $a)][$ratio];
            return mlb_typed('frac', 'In a right-angled triangle, the side opposite angle $\\theta$ is $' . $o . '$, the side adjacent to it is $' . $a . '$ and the hypotenuse is $' . $h . '$. Find $\\' . $ratio . '\\theta$ as a fraction.', $key,
                ['SOH CAH TOA: $\\sin = \\frac{\\text{opp}}{\\text{hyp}}$, $\\cos = \\frac{\\text{adj}}{\\text{hyp}}$, $\\tan = \\frac{\\text{opp}}{\\text{adj}}$.', '$\\' . $ratio . '\\theta = ' . mlb_ftex(...array_map('intval', explode('/', $key . (str_contains($key, '/') ? '' : '/1')))) . '$.'], 'Which two sides does the ratio use?', 'procedure', 40, ['form' => 'lowest']); },
        static function (MlbRng $r) { $th = $r->int(15, 75); $h = $r->int(5, 30); $k = $r->int(0, 1);
            $v = $k ? $h * sin(deg2rad($th)) : $h * cos(deg2rad($th));
            return mlb_typed('num', 'A right-angled triangle has hypotenuse $' . $h . '$ cm and an angle of $' . mlb_deg($th) . '$. Find the side ' . ($k ? 'opposite' : 'adjacent to') . ' that angle, correct to 1 decimal place.', mlb_rd($v, 1),
                [$k ? '$\\sin ' . $th . '^\\circ = \\frac{\\text{opp}}{' . $h . '}$, so opp $= ' . $h . '\\sin ' . $th . '^\\circ$.' : '$\\cos ' . $th . '^\\circ = \\frac{\\text{adj}}{' . $h . '}$, so adj $= ' . $h . '\\cos ' . $th . '^\\circ$.', '$= ' . $h . ' \\times ' . mlb_rd($k ? sin(deg2rad($th)) : cos(deg2rad($th)), 4) . ' \\approx ' . mlb_rd($v, 1) . '$ cm.'], 'Choose the ratio that links what you have with what you want.', 'procedure', 60, ['unit' => 'cm', 'dp' => 1]); },
        static function (MlbRng $r) { $o = $r->int(3, 20); $a = $r->int(3, 20); $th = rad2deg(atan($o / $a));
            return mlb_typed('num', 'A right-angled triangle has an opposite side of $' . $o . '$ cm and an adjacent side of $' . $a . '$ cm, relative to angle $\\theta$. Find $\\theta$ to the nearest degree.', mlb_rd($th, 0),
                ['$\\tan\\theta = \\frac{' . $o . '}{' . $a . '}$.', '$\\theta = \\tan^{-1}\\left(\\frac{' . $o . '}{' . $a . '}\\right) = ' . mlb_rd($th, 2) . '^\\circ \\approx ' . mlb_rd($th, 0) . '^\\circ$.'], 'Use the inverse function to find an angle.', 'procedure', 60, ['unit' => '°', 'dp' => 0]); },
        static function (MlbRng $r) { $c = $r->int(0, 2); $pairs = [['opposite', 'hypotenuse', 'sine'], ['adjacent', 'hypotenuse', 'cosine'], ['opposite', 'adjacent', 'tangent']];
            [$p, $q, $right] = $pairs[$c]; $wrong = [];
            foreach ($pairs as $i => [$x, $y, $n]) if ($i !== $c) $wrong[] = [ucfirst($n), ucfirst($n) . ' links the ' . $x . ' and the ' . $y . '.'];
            $wrong[] = ['Pythagoras', 'Pythagoras links three SIDES; here an angle is involved.'];
            return mlb_mcq($r, 'You know the ' . $p . ' side and want the ' . $q . ' side of a right-angled triangle, with a known angle. Which ratio do you use?', ucfirst($right), $wrong,
                ['SOH CAH TOA.', ucfirst($right) . ' uses the ' . $p . ' and the ' . $q . '.'], 'Which ratio has both sides in it?', 'concept', 30); },
        static function (MlbRng $r) { $L = $r->int(4, 12); $th = $r->int(55, 80); $h = $L * sin(deg2rad($th));
            return mlb_typed('num', 'A ladder $' . $L . '$ m long leans against a wall, making an angle of $' . mlb_deg($th) . '$ with the ground. How high up the wall does it reach, to 1 decimal place?', mlb_rd($h, 1),
                ['The ladder is the hypotenuse; the height is opposite the angle at the ground: $\\sin ' . $th . '^\\circ = \\frac{h}{' . $L . '}$.', '$h = ' . $L . '\\sin ' . $th . '^\\circ \\approx ' . mlb_rd($h, 1) . '$ m.'], 'Sketch the right-angled triangle.', 'application', 60, ['unit' => 'm', 'dp' => 1]); },
        static function (MlbRng $r) { $h = $r->int(6, 20); $th = $r->int(25, 65); $right = $h * sin(deg2rad($th)); $wrong = $h * cos(deg2rad($th));
            return mlb_error_of($r, 'A right-angled triangle has hypotenuse $' . $h . '$ and an angle $\\theta = ' . mlb_deg($th) . '$. Find the first mistake in this working for the side OPPOSITE $\\theta$.',
                ['The opposite side and the hypotenuse are linked by sine', '$\\sin ' . $th . '^\\circ = \\frac{\\text{opp}}{' . $h . '}$', 'opp $= ' . $h . '\\sin ' . $th . '^\\circ \\approx ' . mlb_rd($right, 2) . '$'], [
                [0, ['The opposite side and the hypotenuse are linked by cosine', '$\\cos ' . $th . '^\\circ = \\frac{\\text{opp}}{' . $h . '}$', 'opp $= ' . $h . '\\cos ' . $th . '^\\circ \\approx ' . mlb_rd($wrong, 2) . '$'], 'cosine links the ADJACENT side and the hypotenuse; opposite and hypotenuse is SOH — sine.'],
                [2, ['The opposite side and the hypotenuse are linked by sine', '$\\sin ' . $th . '^\\circ = \\frac{\\text{opp}}{' . $h . '}$', 'opp $= \\frac{' . $h . '}{\\sin ' . $th . '^\\circ} \\approx ' . mlb_rd($h / sin(deg2rad($th)), 2) . '$'], 'multiply both sides by ' . $h . ': opp $= ' . $h . '\\sin ' . $th . '^\\circ$, not divided.'],
            ]); },
    ];
    $f['MC-112'] = [
        static function (MlbRng $r) { $t = $r->pick([['\\sin 30^\\circ', '1/2'], ['\\cos 60^\\circ', '1/2'], ['\\sin 60^\\circ', 'sqrt(3)/2'], ['\\cos 30^\\circ', 'sqrt(3)/2'], ['\\tan 45^\\circ', '1'], ['\\tan 60^\\circ', 'sqrt(3)'],
                ['\\tan 30^\\circ', '1/sqrt(3)'], ['\\sin 45^\\circ', '1/sqrt(2)'], ['\\cos 45^\\circ', '1/sqrt(2)']]);
            return mlb_typed('expr', 'Write the exact value of $' . $t[0] . '$ (use sqrt( ) for a root).', $t[1],
                ['Exact values come from the half-equilateral triangle (sides $1, \\sqrt{3}, 2$) and the half-square (sides $1, 1, \\sqrt{2}$).', '$' . $t[0] . ' = ' . str_replace(['sqrt(3)', 'sqrt(2)', '1/', '/2'], ['\\sqrt{3}', '\\sqrt{2}', '\\frac{1}{', '}{2}'], $t[1]) . (str_starts_with($t[1], '1/') ? '}' : '') . '$.'], 'Draw the special triangle.', 'concept', 40); },
        static function (MlbRng $r) { $c = $r->pick([['\\sin 30^\\circ + \\cos 60^\\circ', 1, 1], ['\\tan 45^\\circ + \\sin 30^\\circ', 3, 2], ['\\sin^2 45^\\circ', 1, 2], ['\\tan^2 60^\\circ', 3, 1], ['\\cos^2 30^\\circ', 3, 4], ['2\\sin 30^\\circ \\cos 60^\\circ', 1, 2], ['\\sin^2 60^\\circ - \\cos^2 60^\\circ', 1, 2], ['\\tan^2 30^\\circ', 1, 3]]);
            return mlb_typed('frac', 'Find the exact value of $' . $c[0] . '$.', mlb_frac($c[1], $c[2]),
                ['Replace each ratio by its exact value: $\\sin 30^\\circ = \\cos 60^\\circ = \\frac{1}{2}$, $\\sin 45^\\circ = \\frac{1}{\\sqrt{2}}$, $\\cos 30^\\circ = \\frac{\\sqrt{3}}{2}$, $\\tan 45^\\circ = 1$, $\\tan 60^\\circ = \\sqrt{3}$, $\\tan 30^\\circ = \\frac{1}{\\sqrt{3}}$.', 'Then work it out: $' . mlb_ftex($c[1], $c[2]) . '$.'], 'Squaring a root removes it.', 'procedure', 50); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            [$q, $right, $w] = [['\\tan 45^\\circ', '$1$', [['$\\frac{1}{2}$', 'That is $\\sin 30^\\circ$.'], ['$\\frac{\\sqrt{2}}{2}$', 'That is $\\sin 45^\\circ$ — tan is sin ÷ cos, and they are equal at 45°.'], ['$0$', 'That is $\\tan 0^\\circ$.']]],
                                 ['\\cos 60^\\circ', '$\\frac{1}{2}$', [['$\\frac{\\sqrt{3}}{2}$', 'That is $\\cos 30^\\circ$ — the values swap between 30° and 60°.'], ['$1$', 'That is $\\cos 0^\\circ$.'], ['$\\sqrt{3}$', 'That is $\\tan 60^\\circ$.']]],
                                 ['\\sin 90^\\circ', '$1$', [['$0$', 'That is $\\cos 90^\\circ$ (or $\\sin 0^\\circ$).'], ['$\\frac{1}{2}$', 'That is $\\sin 30^\\circ$.'], ['undefined', 'That is $\\tan 90^\\circ$.']]]][$c];
            return mlb_mcq($r, 'What is $' . $q . '$?', $right, $w, ['Use the special triangles (or the unit circle).', '$' . $q . ' = ' . trim($right, '$') . '$.'], 'Picture the triangle.', 'concept', 25); },
        static function (MlbRng $r) { $L = 2 * $r->int(2, 15);
            return mlb_typed('num', 'A straight ramp $' . $L . '$ m long rises at $' . mlb_deg(30) . '$ to the horizontal. How high does it rise, exactly, in metres?', (string)($L / 2),
                ['Height $= ' . $L . '\\sin 30^\\circ$, and $\\sin 30^\\circ = \\frac{1}{2}$ exactly.', '$' . $L . ' \\times \\frac{1}{2} = ' . ($L / 2) . '$ m.'], 'You know $\\sin 30^\\circ$ without a calculator.', 'application', 40, ['unit' => 'm']); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            return $c ? mlb_mcq($r, 'Is $\\sin 60^\\circ$ equal to $2\\sin 30^\\circ$?', 'No: $\\sin 60^\\circ = \\frac{\\sqrt{3}}{2}$ but $2\\sin 30^\\circ = 1$',
                    [['Yes, because $60 = 2 \\times 30$', 'Sine is not proportional to the angle: doubling the angle does not double the sine.'], ['Yes, both equal $\\frac{1}{2}$', '$\\sin 60^\\circ$ is $\\frac{\\sqrt{3}}{2}$, not $\\frac{1}{2}$.'], ['Only in a right-angled triangle', 'These are fixed numbers; the triangle does not change them.']],
                    ['$\\sin 60^\\circ = \\frac{\\sqrt{3}}{2} \\approx 0.866$ and $2\\sin 30^\\circ = 2 \\times \\frac{1}{2} = 1$.', 'They differ: $\\sin$ of a double angle is $2\\sin\\theta\\cos\\theta$, not $2\\sin\\theta$.'], 'Work out each side.', 'reasoning', 35)
                : mlb_mcq($r, 'As the angle $\\theta$ grows from $0^\\circ$ to $90^\\circ$, what happens to $\\cos\\theta$?', 'It falls from 1 to 0',
                    [['It rises from 0 to 1', 'That is $\\sin\\theta$.'], ['It stays the same', '$\\cos 0^\\circ = 1$ but $\\cos 90^\\circ = 0$.'], ['It rises without limit', 'That is $\\tan\\theta$.']],
                    ['$\\cos 0^\\circ = 1$, $\\cos 60^\\circ = \\frac{1}{2}$, $\\cos 90^\\circ = 0$.', 'The adjacent side shrinks as the angle opens, so cosine falls.'], 'Check 0°, 60° and 90°.', 'reasoning', 30); },
    ];
    $f['MC-113'] = [
        static function (MlbRng $r) { $d = $r->int(10, 80); $th = $r->int(15, 65); $h = $d * tan(deg2rad($th));
            return mlb_typed('num', 'From a point $' . $d . '$ m from the foot of a tower, the angle of elevation of the top is $' . mlb_deg($th) . '$. Find the height of the tower to 1 decimal place.', mlb_rd($h, 1),
                ['$\\tan ' . $th . '^\\circ = \\frac{h}{' . $d . '}$.', '$h = ' . $d . '\\tan ' . $th . '^\\circ = ' . $d . ' \\times ' . mlb_rd(tan(deg2rad($th)), 4) . ' \\approx ' . mlb_rd($h, 1) . '$ m.'], 'Height is opposite, distance is adjacent.', 'application', 60, ['unit' => 'm', 'dp' => 1]); },
        static function (MlbRng $r) { $h = $r->int(20, 120); $d = $r->int(30, 300); $th = rad2deg(atan($h / $d));
            return mlb_typed('num', 'A boat is $' . $d . '$ m from the foot of a cliff $' . $h . '$ m high. Find the angle of depression of the boat from the top of the cliff, to the nearest degree.', mlb_rd($th, 0),
                ['The angle of depression equals the angle of elevation from the boat (alternate angles).', '$\\tan\\theta = \\frac{' . $h . '}{' . $d . '}$, so $\\theta \\approx ' . mlb_rd($th, 0) . '^\\circ$.'], 'Draw the horizontal line from the top.', 'application', 60, ['unit' => '°', 'dp' => 0]); },
        static function (MlbRng $r) { $th = $r->int(20, 70);
            return mlb_mcq($r, 'From the top of a cliff, the angle of depression of a boat is $' . mlb_deg($th) . '$. What is the angle of elevation of the cliff top from the boat?', $th . '°',
                [[(90 - $th) . '°', 'That is the angle at the top between the cliff face and the line of sight, not the elevation.'], [(180 - $th) . '°', 'The two angles are alternate angles, so they are EQUAL.'], [(2 * $th) . '°', 'Nothing doubles: the horizontals are parallel.']],
                ['The horizontal at the top is parallel to the sea.', 'So the angle of depression and the angle of elevation are alternate angles: both $' . mlb_deg($th) . '$.'], 'Two parallel horizontals.', 'reasoning', 35); },
        static function (MlbRng $r) { $h = $r->int(10, 80); $th = $r->int(20, 70); $d = $h / tan(deg2rad($th));
            return mlb_typed('num', 'From a point on level ground, the angle of elevation of the top of a $' . $h . '$ m mast is $' . mlb_deg($th) . '$. How far is the point from the foot of the mast, to 1 decimal place?', mlb_rd($d, 1),
                ['$\\tan ' . $th . '^\\circ = \\frac{' . $h . '}{d}$.', '$d = \\frac{' . $h . '}{\\tan ' . $th . '^\\circ} \\approx ' . mlb_rd($d, 1) . '$ m.'], 'Now the distance is the unknown — divide.', 'procedure', 60, ['unit' => 'm', 'dp' => 1]); },
    ];
    $f['MC-114'] = [
        static function (MlbRng $r) { [$a, $b, $c, $ang] = $r->pick([[3, 8, 7, 60], [5, 8, 7, 60], [7, 15, 13, 60], [8, 15, 13, 60], [5, 21, 19, 60], [3, 5, 7, 120], [5, 3, 7, 120], [7, 8, 13, 120], [6, 10, 14, 120]]);
            return mlb_typed('num', 'In triangle $ABC$, $a = ' . $a . '$, $b = ' . $b . '$ and $\\angle C = ' . mlb_deg($ang) . '$. Find $c$.', (string)$c,
                ['Cosine rule: $c^2 = a^2 + b^2 - 2ab\\cos C$, and $\\cos ' . $ang . '^\\circ = ' . ($ang === 60 ? '\\frac{1}{2}' : '-\\frac{1}{2}') . '$.', '$c^2 = ' . ($a * $a) . ' + ' . ($b * $b) . ($ang === 60 ? ' - ' : ' + ') . ($a * $b) . ' = ' . ($c * $c) . '$, so $c = ' . $c . '$.'], 'Two sides and the angle between them: cosine rule.', 'procedure', 70); },
        static function (MlbRng $r) { $A = $r->int(30, 80); $B = $r->int(30, 160 - $A); $a = $r->int(5, 20); $b = $a * sin(deg2rad($B)) / sin(deg2rad($A));
            return mlb_typed('num', 'In triangle $ABC$, $\\angle A = ' . mlb_deg($A) . '$, $\\angle B = ' . mlb_deg($B) . '$ and $a = ' . $a . '$ cm. Find $b$ correct to 1 decimal place.', mlb_rd($b, 1),
                ['Sine rule: $\\frac{a}{\\sin A} = \\frac{b}{\\sin B}$.', '$b = \\frac{' . $a . '\\sin ' . $B . '^\\circ}{\\sin ' . $A . '^\\circ} \\approx ' . mlb_rd($b, 1) . '$ cm.'], 'A side and its opposite angle: sine rule.', 'procedure', 70, ['unit' => 'cm', 'dp' => 1]); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            $cases = [['two sides and the angle between them; you want the third side', 'The cosine rule'], ['two angles and one side; you want another side', 'The sine rule'], ['all three sides; you want an angle', 'The cosine rule']];
            [$what, $right] = $cases[$c];
            $wrong = [[$right === 'The cosine rule' ? 'The sine rule' : 'The cosine rule', 'The sine rule needs a side AND its opposite angle; the cosine rule handles two sides with the angle between them, or three sides.'],
                      ['Pythagoras\' theorem', 'Pythagoras works only in a right-angled triangle.'], ['SOH CAH TOA', 'Those ratios are for right-angled triangles only.']];
            return mlb_mcq($r, 'In a triangle with no right angle, you know ' . $what . '. Which do you use?', $right, $wrong,
                ['Sine rule: pairs of (side, opposite angle). Cosine rule: two sides and the included angle, or three sides.', $right . ' fits this case.'], 'Do you have a side with its opposite angle?', 'concept', 35); },
        static function (MlbRng $r) { [$a, $b, $c, $ang] = $r->pick([[3, 8, 7, 60], [5, 8, 7, 60], [7, 15, 13, 60], [8, 15, 13, 60], [3, 5, 7, 120], [7, 8, 13, 120]]); $k = $r->int(1, 3);
            return mlb_typed('num', 'Two ships leave a port. One sails $' . ($a * $k) . '$ km and the other $' . ($b * $k) . '$ km, on courses $' . mlb_deg($ang) . '$ apart. How far apart are they then, in km?', (string)($c * $k),
                ['The port and the two ships form a triangle with the angle $' . mlb_deg($ang) . '$ between the known sides: use the cosine rule.', '$d^2 = ' . ($a * $k) . '^2 + ' . ($b * $k) . '^2 - 2(' . ($a * $k) . ')(' . ($b * $k) . ')\\cos ' . $ang . '^\\circ = ' . (($c * $k) ** 2) . '$, so $d = ' . ($c * $k) . '$ km.'], 'Two sides and the angle between them.', 'application', 80, ['unit' => 'km']); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 8, 7], [5, 8, 7], [7, 15, 13], [8, 15, 13]]);
            $L1 = '$c^2 = a^2 + b^2 - 2ab\\cos C$'; $L2 = '$c^2 = ' . ($a * $a) . ' + ' . ($b * $b) . ' - 2(' . $a . ')(' . $b . ')(\\frac{1}{2})$';
            return mlb_error_of($r, 'In triangle $ABC$, $a = ' . $a . '$, $b = ' . $b . '$ and $C = ' . mlb_deg(60) . '$. Find the first mistake in this working for $c$.', [$L1, $L2, '$c^2 = ' . ($c * $c) . '$, so $c = ' . $c . '$'], [
                [0, ['$c^2 = a^2 + b^2 + 2ab\\cos C$', '$c^2 = ' . ($a * $a) . ' + ' . ($b * $b) . ' + ' . ($a * $b) . '$', '$c^2 = ' . ($a * $a + $b * $b + $a * $b) . '$'], 'the cosine rule SUBTRACTS $2ab\\cos C$.'],
                [1, [$L1, '$c^2 = ' . ($a * $a) . ' + ' . ($b * $b) . ' - 2(' . $a . ')(' . $b . ')(60)$', '$c^2$ is negative — no triangle'], '$\\cos C$ means $\\cos 60^\\circ = \\frac{1}{2}$, not the angle 60 itself.'],
                [2, [$L1, $L2, '$c^2 = ' . ($a * $a + $b * $b) . '$, so $c = \\sqrt{' . ($a * $a + $b * $b) . '}$'], 'the last term, $' . ($a * $b) . '$, was left out: $' . ($a * $a) . ' + ' . ($b * $b) . ' - ' . ($a * $b) . ' = ' . ($c * $c) . '$.'],
            ]); },
    ];
    $f['MC-115'] = [
        static function (MlbRng $r) { $a = 2 * $r->int(2, 10); $b = 2 * $r->int(2, 10); $ang = $r->pick([30, 150]);
            return mlb_typed('num', 'Find the area of a triangle with two sides of $' . $a . '$ cm and $' . $b . '$ cm and an angle of $' . mlb_deg($ang) . '$ between them, in $\\text{cm}^2$.', (string)($a * $b / 4),
                ['Area $= \\frac{1}{2}ab\\sin C$, and $\\sin ' . $ang . '^\\circ = \\frac{1}{2}$.', '$\\frac{1}{2} \\times ' . $a . ' \\times ' . $b . ' \\times \\frac{1}{2} = ' . ($a * $b / 4) . '\\ \\text{cm}^2$.'], 'Half, times the two sides, times the sine of the angle between them.', 'procedure', 45, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $a = $r->int(4, 20); $b = $r->int(4, 20); $C = $r->int(20, 160); $A = 0.5 * $a * $b * sin(deg2rad($C));
            return mlb_typed('num', 'Two sides of a triangle are $' . $a . '$ m and $' . $b . '$ m, with an angle of $' . mlb_deg($C) . '$ between them. Find the area correct to 1 decimal place.', mlb_rd($A, 1),
                ['Area $= \\frac{1}{2}ab\\sin C$.', '$\\frac{1}{2} \\times ' . $a . ' \\times ' . $b . ' \\times \\sin ' . $C . '^\\circ \\approx ' . mlb_rd($A, 1) . '\\ \\text{m}^2$.'], 'Use the angle BETWEEN the two sides.', 'procedure', 50, ['unit' => 'm²', 'dp' => 1]); },
        static function (MlbRng $r) { $a = 2 * $r->int(3, 9); $b = 2 * $r->int(3, 9);
            return mlb_mcq($r, 'A triangle has sides $' . $a . '$ cm and $' . $b . '$ cm with a $' . mlb_deg(90) . '$ angle between them. What is its area?', ($a * $b / 2) . ' cm²',
                [[($a * $b) . ' cm²', 'A triangle is half of the rectangle: $\\frac{1}{2}ab$.'], [($a * $b / 4) . ' cm²', '$\\sin 90^\\circ = 1$, not $\\frac{1}{2}$.'], [($a + $b) . ' cm²', 'Area multiplies lengths; it does not add them.']],
                ['$\\frac{1}{2}ab\\sin 90^\\circ = \\frac{1}{2}ab \\times 1$.', '$\\frac{1}{2} \\times ' . $a . ' \\times ' . $b . ' = ' . ($a * $b / 2) . '\\ \\text{cm}^2$ — the familiar half base × height.'], 'What is $\\sin 90^\\circ$?', 'reasoning', 30); },
        static function (MlbRng $r) { $a = $r->int(10, 40); $b = $r->int(10, 40); $C = $r->int(30, 150); $k = $r->pick([2, 3, 5]); $A = 0.5 * $a * $b * sin(deg2rad($C));
            return mlb_typed('num', 'A triangular plot has sides of $' . $a . '$ m and $' . $b . '$ m with an angle of $' . mlb_deg($C) . '$ between them. Fertiliser is spread at $' . $k . '$ kg per $\\text{m}^2$. How much fertiliser is needed, to 1 decimal place (kg)?', mlb_rd($A * $k, 1),
                ['Area $= \\frac{1}{2} \\times ' . $a . ' \\times ' . $b . ' \\times \\sin ' . $C . '^\\circ \\approx ' . mlb_rd($A, 2) . '\\ \\text{m}^2$.', 'Fertiliser $= ' . mlb_rd($A, 2) . ' \\times ' . $k . ' \\approx ' . mlb_rd($A * $k, 1) . '$ kg.'], 'Area first, then the rate.', 'application', 80, ['unit' => 'kg', 'dp' => 1]); },
    ];
    $f['MC-116'] = [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3);
            return mlb_typed('num', 'A cyclist rides $' . ($a * $k) . '$ km due north and then $' . ($b * $k) . '$ km due east. How far is she from her starting point, in km?', (string)($c * $k),
                ['North and east are at right angles, so use Pythagoras.', '$\\sqrt{' . ($a * $k) . '^2 + ' . ($b * $k) . '^2} = ' . ($c * $k) . '$ km.'], 'Sketch the journey.', 'application', 50, ['unit' => 'km']); },
        static function (MlbRng $r) { $n = $r->int(3, 20); $e = $r->int(3, 20); $th = rad2deg(atan($e / $n));
            return mlb_typed('num', 'A ship sails $' . $n . '$ km due north and then $' . $e . '$ km due east. Find its bearing from the starting point, to the nearest degree.', mlb_rd($th, 0),
                ['The bearing is the angle turned clockwise from north: $\\tan\\theta = \\frac{\\text{east}}{\\text{north}} = \\frac{' . $e . '}{' . $n . '}$.', '$\\theta \\approx ' . mlb_rd($th, 0) . '^\\circ$, a bearing of $' . str_pad(mlb_rd($th, 0), 3, '0', STR_PAD_LEFT) . '^\\circ$.'], 'Which side is opposite the angle at the start?', 'application', 60, ['unit' => '°', 'dp' => 0]); },
        static function (MlbRng $r) { $b = $r->int(10, 80);
            return mlb_mcq($r, 'The bearing of a lighthouse from a ship is $' . str_pad((string)$b, 3, '0', STR_PAD_LEFT) . '^\\circ$. What is the bearing of the ship from the lighthouse?', str_pad((string)($b + 180), 3, '0', STR_PAD_LEFT) . '°',
                [[str_pad((string)(360 - $b), 3, '0', STR_PAD_LEFT) . '°', 'That reflects the direction instead of reversing it.'], [str_pad((string)(90 - $b), 3, '0', STR_PAD_LEFT) . '°', 'That is the angle from the east line, not a back bearing.'], [str_pad((string)$b, 3, '0', STR_PAD_LEFT) . '°', 'Looking back the other way changes the bearing by 180°.']],
                ['A back bearing is the opposite direction: add $' . mlb_deg(180) . '$.', '$' . $b . ' + 180 = ' . ($b + 180) . '^\\circ$.'], 'Turn round: add 180°.', 'reasoning', 30); },
        static function (MlbRng $r) { $d = $r->int(10, 60); $th = $r->int(10, 80); $e = $d * sin(deg2rad($th));
            return mlb_typed('num', 'A ship sails $' . $d . '$ km on a bearing of $' . str_pad((string)$th, 3, '0', STR_PAD_LEFT) . '^\\circ$. How far east of its start is it, to 1 decimal place?', mlb_rd($e, 1),
                ['The bearing is measured from north, so the east distance is opposite the angle: $' . $d . '\\sin ' . $th . '^\\circ$.', '$' . $d . ' \\times ' . mlb_rd(sin(deg2rad($th)), 4) . ' \\approx ' . mlb_rd($e, 1) . '$ km.'], 'East is opposite the bearing angle.', 'procedure', 60, ['unit' => 'km', 'dp' => 1]); },
    ];
    $f['MC-117'] = [
        static function (MlbRng $r) { $N = $r->pick([30, 36, 40, 45, 60, 72, 90, 120]); $f = $r->int(1, $N - 1); while ((360 * $f) % $N) $f++;
            if ($f >= $N) $f = intdiv($N, 2);
            return mlb_typed('num', 'In a survey of $' . $N . '$ students, $' . $f . '$ chose football. What angle should the football sector of a pie chart be, in degrees?', (string)(360 * $f / $N),
                ['Each student gets $\\frac{360}{' . $N . '} = ' . mlb_dec(360 / $N) . '^\\circ$.', '$' . $f . ' \\times ' . mlb_dec(360 / $N) . ' = ' . (360 * $f / $N) . '^\\circ$.'], 'The whole pie is 360°.', 'procedure', 45, ['unit' => '°']); },
        static function (MlbRng $r) { $vals = []; for ($i = 0; $i < 15; $i++) $vals[] = $r->int(1, 6); $v = $r->int(1, 6); $cnt = count(array_keys($vals, $v));
            return mlb_typed('num', 'A die is rolled 15 times: ' . implode(', ', $vals) . '. What is the frequency of $' . $v . '$?', (string)$cnt,
                ['Frequency is how many times a value occurs.', 'Tally the ' . $v . 's: ' . $cnt . '.'], 'Tally carefully, crossing off as you go.', 'procedure', 40); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            $cases = [['how a whole is shared out between categories', 'A pie chart'], ['how a quantity changes over time', 'A line graph'], ['the relationship between two measurements on the same people', 'A scatter graph']];
            [$what, $right] = $cases[$c]; $wrong = [];
            foreach ($cases as $i => [$w, $t]) if ($i !== $c) $wrong[] = [$t, $t . ' is best for showing ' . $w . '.'];
            $wrong[] = ['A frequency table', 'A table records the data; the question asks how to SHOW the pattern.'];
            return mlb_mcq($r, 'Which display is best for showing ' . $what . '?', $right, $wrong, [$right . ' shows ' . $what . '.', 'Match the chart to the question the data answers.'], 'What question is the chart answering?', 'concept', 30); },
        static function (MlbRng $r) { $N = $r->pick([36, 72, 90, 120, 180, 360]); $ang = $r->pick([40, 60, 80, 90, 100, 120, 150]); $people = $ang * $N / 360; if (floor($people) != $people) { $N = 360; $people = $ang; }
            return mlb_typed('num', 'In a pie chart of ' . $N . ' people\'s favourite drinks, the sector for zobo is $' . mlb_deg($ang) . '$. How many people chose zobo?', mlb_dec($ang * $N / 360),
                ['The whole pie, $' . mlb_deg(360) . '$, is ' . $N . ' people.', '$\\frac{' . $ang . '}{360} \\times ' . $N . ' = ' . mlb_dec($ang * $N / 360) . '$ people.'], 'What fraction of the pie is it?', 'application', 45); },
        static function (MlbRng $r) { $N = $r->pick([20, 30, 40, 60]); $f = $r->int(2, $N / 2);
            return mlb_error_of($r, 'Of ' . $N . ' students, ' . $f . ' walk to school. Find the first mistake in this working for the walking sector of a pie chart.',
                ['Fraction who walk: $\\frac{' . $f . '}{' . $N . '}$', 'The whole pie is $' . mlb_deg(360) . '$', 'Angle $= \\frac{' . $f . '}{' . $N . '} \\times 360 = ' . mlb_dec(360 * $f / $N) . '^\\circ$'], [
                [1, ['Fraction who walk: $\\frac{' . $f . '}{' . $N . '}$', 'The whole pie is $' . mlb_deg(100) . '$', 'Angle $= \\frac{' . $f . '}{' . $N . '} \\times 100 = ' . mlb_dec(100 * $f / $N) . '^\\circ$'], 'a pie chart is a circle: the whole is 360°, not 100.'],
                [0, ['Fraction who walk: $\\frac{' . $N . '}{' . $f . '}$', 'The whole pie is $' . mlb_deg(360) . '$', 'Angle $= \\frac{' . $N . '}{' . $f . '} \\times 360$'], 'the fraction is part over whole: $\\frac{' . $f . '}{' . $N . '}$.'],
            ]); },
    ];
    $f['MC-118'] = [
        static function (MlbRng $r) { $n = $r->int(5, 8); $m = $r->int(4, 20); $vals = []; for ($i = 0; $i < $n - 1; $i++) $vals[] = $m + $r->int(-4, 6); $vals[] = $n * $m - array_sum($vals); if (end($vals) < 0) $vals[$n - 1] = $m;
            $mean = array_sum($vals) / $n; if (floor($mean) != $mean) { $vals[$n - 1] += $n - (array_sum($vals) % $n); $mean = array_sum($vals) / $n; }
            return mlb_typed('num', 'Find the mean of: ' . implode(', ', $vals) . '.', mlb_dec($mean),
                ['Mean $= \\frac{\\text{total}}{\\text{how many}}$.', '$\\frac{' . array_sum($vals) . '}{' . $n . '} = ' . mlb_dec($mean) . '$.'], 'Add them all, then share equally.', 'procedure', 45); },
        static function (MlbRng $r) { $n = 2 * $r->int(2, 4) + 1; $vals = []; for ($i = 0; $i < $n; $i++) $vals[] = $r->int(1, 40); $s = $vals; sort($s);
            return mlb_typed('num', 'Find the median of: ' . implode(', ', $vals) . '.', (string)$s[intdiv($n, 2)],
                ['Put them in order: ' . implode(', ', $s) . '.', 'The middle (' . (intdiv($n, 2) + 1) . 'th) value is $' . $s[intdiv($n, 2)] . '$.'], 'Order them first.', 'procedure', 45); },
        static function (MlbRng $r) { $n = $r->int(4, 7); $m = $r->int(10, 30); $k = $r->int(3, 15); $old = $n * $m; $newMean = $m + $r->int(1, 3); $x = $newMean * ($n + 1) - $old;
            return mlb_typed('num', 'The mean of ' . $n . ' numbers is $' . $m . '$. When one more number is added, the mean becomes $' . $newMean . '$. What number was added?', (string)$x,
                ['Old total $= ' . $n . ' \\times ' . $m . ' = ' . $old . '$. New total $= ' . ($n + 1) . ' \\times ' . $newMean . ' = ' . ($newMean * ($n + 1)) . '$.', 'The added number is $' . ($newMean * ($n + 1)) . ' - ' . $old . ' = ' . $x . '$.'], 'Work with totals, not means.', 'reasoning', 60); },
        static function (MlbRng $r) { do { $vals = []; for ($i = 0; $i < 7; $i++) $vals[] = $r->int(2, 30); $s = $vals; sort($s); } while ($vals[3] === $s[3]);
            return mlb_mcq($r, 'What is the median of: ' . implode(', ', $vals) . '?', (string)$s[3],
                [[(string)$vals[3], 'That is the middle of the list AS WRITTEN — the values must be put in order first.'], [mlb_rd(array_sum($vals) / 7, 1), 'That is the mean.'], [(string)($s[6] - $s[0]), 'That is the range.']],
                ['In order: ' . implode(', ', $s) . '.', 'The 4th value is $' . $s[3] . '$.'], 'Sort, then take the middle.', 'reasoning', 40); },
        static function (MlbRng $r) { $sizes = [$r->int(3, 5), 0, 0, 0]; $sizes[1] = $sizes[0] + 1; $sizes[2] = $sizes[0] + 2; $sizes[3] = $sizes[0] + 3; $fs = [$r->int(1, 6), $r->int(2, 9), $r->int(2, 9), $r->int(1, 5)];
            $sum = 0; $n = 0; foreach ($sizes as $i => $x) { $sum += $x * $fs[$i]; $n += $fs[$i]; }
            return mlb_typed('num', 'The shoe sizes of a class: size ' . $sizes[0] . ' (' . $fs[0] . ' pupils), size ' . $sizes[1] . ' (' . $fs[1] . '), size ' . $sizes[2] . ' (' . $fs[2] . '), size ' . $sizes[3] . ' (' . $fs[3] . '). Find the mean shoe size, to 1 decimal place.', mlb_rd($sum / $n, 1),
                ['Mean $= \\frac{\\sum fx}{\\sum f}$: $\\sum fx = ' . $sum . '$, $\\sum f = ' . $n . '$.', '$\\frac{' . $sum . '}{' . $n . '} \\approx ' . mlb_rd($sum / $n, 1) . '$.'], 'Each size counts as many times as it occurs.', 'application', 70, ['dp' => 1]); },
    ];
    $f['MC-119'] = [
        static function (MlbRng $r) { $vals = []; for ($i = 0; $i < 8; $i++) $vals[] = $r->int(5, 60);
            return mlb_typed('num', 'Find the range of: ' . implode(', ', $vals) . '.', (string)(max($vals) - min($vals)),
                ['Range $=$ largest $-$ smallest.', '$' . max($vals) . ' - ' . min($vals) . ' = ' . (max($vals) - min($vals)) . '$.'], 'Largest minus smallest.', 'procedure', 30); },
        static function (MlbRng $r) { $s = []; $v = $r->int(1, 10); for ($i = 0; $i < 11; $i++) { $v += $r->int(0, 6); $s[] = $v; }
            return mlb_typed('num', 'Eleven values in order are: ' . implode(', ', $s) . '. Find the interquartile range.', (string)($s[8] - $s[2]),
                ['With 11 values, $Q_1$ is the 3rd value and $Q_3$ the 9th: $Q_1 = ' . $s[2] . '$, $Q_3 = ' . $s[8] . '$.', 'IQR $= ' . $s[8] . ' - ' . $s[2] . ' = ' . ($s[8] - $s[2]) . '$.'], 'Find the medians of each half.', 'procedure', 50); },
        static function (MlbRng $r) { $n = $r->int(4, 6); $vals = []; for ($i = 0; $i < $n; $i++) $vals[] = $r->int(1, 15); $m = array_sum($vals) / $n;
            $var = array_sum(array_map(static fn($x) => ($x - $m) ** 2, $vals)) / $n;
            return mlb_typed('num', 'Find the standard deviation of: ' . implode(', ', $vals) . ' (treat them as the whole population). Give it to 2 decimal places.', mlb_rd(sqrt($var), 2),
                ['Mean $= ' . mlb_rd($m, 3) . '$; variance $= \\frac{\\sum (x - \\bar{x})^2}{n} = ' . mlb_rd($var, 4) . '$.', '$\\sigma = \\sqrt{' . mlb_rd($var, 4) . '} \\approx ' . mlb_rd(sqrt($var), 2) . '$.'], 'Mean first, then the average squared distance from it.', 'procedure', 120, ['dp' => 2]); },
        static function (MlbRng $r) { $k = $r->int(2, 10); $c = $r->int(0, 1);
            return mlb_mcq($r, 'Every value in a data set is increased by $' . $k . '$. What happens to the ' . ($c ? 'standard deviation' : 'mean') . '?', $c ? 'It stays the same' : 'It increases by ' . $k,
                [[$c ? 'It increases by ' . $k : 'It stays the same', $c ? 'Adding the same amount to every value shifts the data but does not spread it out.' : 'The total grows by ' . $k . ' for each value, so the mean moves up by ' . $k . '.'], ['It is multiplied by ' . $k, 'Adding is not multiplying.'], ['It increases by ' . $k . ' squared', 'Nothing is squared here.']],
                ['Adding a constant moves every value — and the centre — by the same amount.', $c ? 'The gaps between values do not change, so the spread (standard deviation) is unchanged.' : 'So the mean increases by ' . $k . '.'], 'Does the spread change, or only the position?', 'reasoning', 35); },
        static function (MlbRng $r) { $m = $r->int(55, 70); $sA = $r->int(3, 8); $sB = $sA + $r->int(4, 10); $aFirst = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'Two classes sat the same test. Both had a mean of $' . $m . '$. Class A had a standard deviation of $' . ($aFirst ? $sA : $sB) . '$ and Class B of $' . ($aFirst ? $sB : $sA) . '$. Which class performed more consistently?', $aFirst ? 'Class A' : 'Class B',
                [[$aFirst ? 'Class B' : 'Class A', 'A LARGER standard deviation means the marks were more spread out — less consistent.'], ['Neither: the means are equal', 'Equal means say the typical mark is the same; consistency is about spread.'], ['The class with more pupils', 'Class size does not decide consistency.']],
                ['Standard deviation measures how spread out the marks are around the mean.', 'The class with the smaller standard deviation (' . $sA . ') was more consistent.'], 'Smaller spread, more consistent.', 'application', 40); },
    ];
    $f['MC-120'] = [
        static function (MlbRng $r) { $red = $r->int(2, 9); $blue = $r->int(2, 9); $green = $r->int(1, 7); $pick = $r->pick(['red', 'blue', 'green']); $num = ['red' => $red, 'blue' => $blue, 'green' => $green][$pick];
            return mlb_typed('frac', 'A bag has ' . $red . ' red, ' . $blue . ' blue and ' . $green . ' green counters. One is taken at random. What is the probability it is ' . $pick . '? Give a fraction in lowest terms.', mlb_frac($num, $red + $blue + $green),
                ['$P = \\frac{\\text{favourable}}{\\text{total}}$.', '$\\frac{' . $num . '}{' . ($red + $blue + $green) . '} = ' . mlb_ftex($num, $red + $blue + $green) . '$.'], 'Count everything in the bag.', 'procedure', 35, ['form' => 'lowest']); },
        static function (MlbRng $r) { $s = $r->int(2, 12); $ways = 6 - abs($s - 7);
            return mlb_typed('frac', 'Two fair dice are rolled. What is the probability that the scores add up to ' . $s . '?', mlb_frac($ways, 36),
                ['There are $6 \\times 6 = 36$ equally likely outcomes.', 'Pairs adding to ' . $s . ': ' . $ways . ', so $P = ' . mlb_ftex($ways, 36) . '$.'], 'List the pairs, or use a sample-space grid.', 'procedure', 60); },
        static function (MlbRng $r) { $red = $r->int(3, 8); $blue = $r->int(2, 8); $t = $red + $blue;
            return mlb_typed('frac', 'A bag has ' . $red . ' red and ' . $blue . ' blue balls. Two are taken out, one after the other, WITHOUT replacement. What is the probability both are red?', mlb_frac($red * ($red - 1), $t * ($t - 1)),
                ['First red: $\\frac{' . $red . '}{' . $t . '}$. Then one red has gone: second red $\\frac{' . ($red - 1) . '}{' . ($t - 1) . '}$.', '$\\frac{' . $red . '}{' . $t . '} \\times \\frac{' . ($red - 1) . '}{' . ($t - 1) . '} = ' . mlb_ftex($red * ($red - 1), $t * ($t - 1)) . '$.'], 'The second draw has one fewer ball.', 'application', 70); },
        static function (MlbRng $r) { $p = $r->pick([[1, 4], [2, 5], [3, 10], [1, 3], [3, 8]]); $q = mlb_frac($p[1] - $p[0], $p[1]);
            return mlb_mcq($r, 'The probability that it rains tomorrow is $' . mlb_ftex($p[0], $p[1]) . '$. What is the probability that it does NOT rain?', '$' . mlb_ftex($p[1] - $p[0], $p[1]) . '$',
                [['$' . mlb_ftex($p[1], $p[0]) . '$', 'That is the fraction turned upside down — and it is bigger than 1, which no probability can be.'], ['$' . mlb_ftex($p[0], $p[1]) . '$', 'Rain and no rain cannot both have the same chance unless each is a half.'], ['$' . mlb_ftex($p[0], $p[1] - $p[0]) . '$', 'That is the ODDS, not a probability.']],
                ['Probabilities of all outcomes add up to 1.', '$1 - ' . mlb_ftex($p[0], $p[1]) . ' = ' . mlb_ftex($p[1] - $p[0], $p[1]) . '$.'], 'It either happens or it does not.', 'concept', 30); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            if ($c) return mlb_error_of($r, 'A fair coin is tossed twice. Find the first mistake in this working for P(two heads).',
                ['P(head) on each toss $= \\frac{1}{2}$', 'The tosses are independent, so multiply', 'P(two heads) $= \\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{4}$'], [
                [1, ['P(head) on each toss $= \\frac{1}{2}$', 'Both must happen, so add', 'P(two heads) $= \\frac{1}{2} + \\frac{1}{2} = 1$'], 'for "this AND that" with independent events, MULTIPLY; adding gave 1, which would mean it is certain.'],
                [2, ['P(head) on each toss $= \\frac{1}{2}$', 'The tosses are independent, so multiply', 'P(two heads) $= \\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{2}$'], '$\\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{4}$.']]);
            $p = $r->pick([[1, 6], [1, 4], [1, 3], [2, 5]]);
            return mlb_error_of($r, 'The probability that a bus is late is $' . mlb_ftex($p[0], $p[1]) . '$ each day, independently. Find the first mistake in this working for P(late on both Monday and Tuesday).',
                ['P(late Monday) $= ' . mlb_ftex($p[0], $p[1]) . '$ and P(late Tuesday) $= ' . mlb_ftex($p[0], $p[1]) . '$', 'Independent "and": multiply', '$' . mlb_ftex($p[0], $p[1]) . ' \\times ' . mlb_ftex($p[0], $p[1]) . ' = ' . mlb_ftex($p[0] ** 2, $p[1] ** 2) . '$'], [
                [1, ['P(late Monday) $= ' . mlb_ftex($p[0], $p[1]) . '$ and P(late Tuesday) $= ' . mlb_ftex($p[0], $p[1]) . '$', 'Both days: add', '$' . mlb_ftex($p[0], $p[1]) . ' + ' . mlb_ftex($p[0], $p[1]) . ' = ' . mlb_ftex(2 * $p[0], $p[1]) . '$'], 'late on BOTH days is less likely than on one: multiply, do not add.'],
                [2, ['P(late Monday) $= ' . mlb_ftex($p[0], $p[1]) . '$ and P(late Tuesday) $= ' . mlb_ftex($p[0], $p[1]) . '$', 'Independent "and": multiply', '$' . mlb_ftex($p[0], $p[1]) . ' \\times ' . mlb_ftex($p[0], $p[1]) . ' = ' . mlb_ftex($p[0] * $p[0], $p[1]) . '$'], 'multiply the denominators too: $' . $p[1] . ' \\times ' . $p[1] . ' = ' . ($p[1] ** 2) . '$.']]); },
    ];


    /* ══ Stage 13 · Further Algebra and Mathematical Logic ═══════════════ */
    $f['MC-121'] = [
        static function (MlbRng $r) { $c = $r->int(2, 12); $a = $c + $r->int(3, 20); $b = $c + $r->int(3, 20);
            return mlb_typed('num', '$n(A) = ' . $a . '$, $n(B) = ' . $b . '$ and $n(A \\cap B) = ' . $c . '$. Find $n(A \\cup B)$.', (string)($a + $b - $c),
                ['$n(A \\cup B) = n(A) + n(B) - n(A \\cap B)$ — the overlap was counted twice.', '$' . $a . ' + ' . $b . ' - ' . $c . ' = ' . ($a + $b - $c) . '$.'], 'Do not count the overlap twice.', 'procedure', 35); },
        static function (MlbRng $r) { $both = $r->int(2, 10); $fo = $r->int(3, 15); $bo = $r->int(3, 15); $none = $r->int(1, 8); $N = $both + $fo + $bo + $none;
            return mlb_typed('num', 'In a class of ' . $N . ' students, ' . ($fo + $both) . ' play football, ' . ($bo + $both) . ' play basketball and ' . $none . ' play neither. How many play both?', (string)$both,
                ['Those who play at least one: $' . $N . ' - ' . $none . ' = ' . ($N - $none) . '$.', '$n(F \\cap B) = ' . ($fo + $both) . ' + ' . ($bo + $both) . ' - ' . ($N - $none) . ' = ' . $both . '$.'], 'Draw a Venn diagram and fill in the overlap last.', 'application', 70); },
        static function (MlbRng $r) { $abc = $r->int(1, 5); $ab = $r->int(1, 6); $bc = $r->int(1, 6); $ac = $r->int(1, 6); $a = $r->int(2, 10); $b = $r->int(2, 10); $c = $r->int(2, 10);
            $nA = $a + $ab + $ac + $abc; $nB = $b + $ab + $bc + $abc; $nC = $c + $ac + $bc + $abc; $tot = $a + $b + $c + $ab + $bc + $ac + $abc;
            return mlb_typed('num', '$n(A) = ' . $nA . '$, $n(B) = ' . $nB . '$, $n(C) = ' . $nC . '$, $n(A \\cap B) = ' . ($ab + $abc) . '$, $n(B \\cap C) = ' . ($bc + $abc) . '$, $n(A \\cap C) = ' . ($ac + $abc) . '$ and $n(A \\cap B \\cap C) = ' . $abc . '$. Find $n(A \\cup B \\cup C)$.', (string)$tot,
                ['Three sets: add the singles, take away the pairs, add back the triple.', '$' . ($nA + $nB + $nC) . ' - ' . ($ab + $bc + $ac + 3 * $abc) . ' + ' . $abc . ' = ' . $tot . '$.'], 'The middle region is added three times and taken away three times.', 'procedure', 90); },
        static function (MlbRng $r) { $u = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'Which set is equal to $(A ' . ($u ? '\\cup' : '\\cap') . ' B)\'$?', '$A\' ' . ($u ? '\\cap' : '\\cup') . ' B\'$',
                [['$A\' ' . ($u ? '\\cup' : '\\cap') . ' B\'$', 'De Morgan: taking the complement SWAPS union and intersection.'], ['$A ' . ($u ? '\\cap' : '\\cup') . ' B$', 'The complements of $A$ and $B$ are needed, not $A$ and $B$.'], ['$(A ' . ($u ? '\\cap' : '\\cup') . ' B)\'$', 'That complements a different set.']],
                ['De Morgan\'s laws: $(A \\cup B)\' = A\' \\cap B\'$ and $(A \\cap B)\' = A\' \\cup B\'$.', 'Outside "A or B" means outside A AND outside B.'], 'Shade both on a Venn diagram.', 'reasoning', 40); },
        static function (MlbRng $r) { $c = $r->int(2, 9); $a = $c + $r->int(3, 15); $b = $c + $r->int(3, 15);
            return mlb_error_of($r, '$n(A) = ' . $a . '$, $n(B) = ' . $b . '$, $n(A \\cap B) = ' . $c . '$. Find the first mistake in this working for $n(A \\cup B)$.',
                ['$n(A \\cup B) = n(A) + n(B) - n(A \\cap B)$', '$= ' . $a . ' + ' . $b . ' - ' . $c . '$', '$= ' . ($a + $b - $c) . '$'], [
                [0, ['$n(A \\cup B) = n(A) + n(B)$', '$= ' . $a . ' + ' . $b . '$', '$= ' . ($a + $b) . '$'], 'the ' . $c . ' elements in both sets were counted twice; subtract the overlap once.'],
                [0, ['$n(A \\cup B) = n(A) + n(B) - 2n(A \\cap B)$', '$= ' . $a . ' + ' . $b . ' - ' . (2 * $c) . '$', '$= ' . ($a + $b - 2 * $c) . '$'], 'the overlap is counted twice, so subtract it ONCE to leave it counted once.'],
                [2, ['$n(A \\cup B) = n(A) + n(B) - n(A \\cap B)$', '$= ' . $a . ' + ' . $b . ' - ' . $c . '$', '$= ' . ($a + $b + $c) . '$'], 'the arithmetic: $' . $a . ' + ' . $b . ' - ' . $c . ' = ' . ($a + $b - $c) . '$.'],
            ]); },
    ];
    $f['MC-122'] = [
        static function (MlbRng $r) { $p = $r->int(0, 1) === 1; $q = $r->int(0, 1) === 1; $ex = $r->int(0, 4);
            [$tex, $val] = [['p \\wedge q', $p && $q], ['p \\vee q', $p || $q], ['p \\Rightarrow q', !$p || $q], ['p \\wedge \\neg q', $p && !$q], ['\\neg(p \\vee q)', !($p || $q)]][$ex];
            return mlb_mcq($r, '$p$ is ' . ($p ? 'true' : 'false') . ' and $q$ is ' . ($q ? 'true' : 'false') . '. Is $' . $tex . '$ true or false?', $val ? 'True' : 'False',
                [[$val ? 'False' : 'True', ['"and" is true only when both are true', '"or" is true when at least one is true', 'an implication is false only when $p$ is true and $q$ is false', 'both parts must hold: $p$ true and $q$ false', 'it is the negation of "or"'][$ex] . '.']],
                ['Work it out step by step from the truth values.', '$' . $tex . '$ is ' . ($val ? 'true' : 'false') . '.'], 'Replace each letter by its truth value.', 'procedure', 35); },
        static function (MlbRng $r) { $n = $r->int(2, 6);
            return mlb_typed('num', 'How many rows does the truth table of a statement with ' . $n . ' different simple propositions need?', (string)(2 ** $n),
                ['Each proposition is either true or false: 2 choices each.', '$2^{' . $n . '} = ' . (2 ** $n) . '$ rows.'], 'Two choices for each letter.', 'concept', 25); },
        static function (MlbRng $r) { [$a, $b, $na, $nb] = $r->pick([['it rains', 'the ground is wet', 'it does not rain', 'the ground is not wet'], ['a number is divisible by 4', 'it is even', 'a number is not divisible by 4', 'it is not even'], ['you live in Lagos', 'you live in Nigeria', 'you do not live in Lagos', 'you do not live in Nigeria'], ['a shape is a square', 'it has four sides', 'a shape is not a square', 'it does not have four sides']]);
            return mlb_mcq($r, 'Which statement is the contrapositive of "If ' . $a . ', then ' . $b . '"?', 'If ' . $nb . ', then ' . $na . '.',
                [['If ' . $b . ', then ' . $a . '.', 'That is the CONVERSE, which need not be true even when the original is.'], ['If ' . $na . ', then ' . $nb . '.', 'That is the INVERSE, which need not be true.'], [ucfirst($a) . ' and ' . $nb . '.', 'That is the NEGATION of the statement.']],
                ['The contrapositive of "if $p$ then $q$" is "if not $q$ then not $p$".', 'It is always equivalent to the original statement.'], 'Swap and negate both.', 'reasoning', 45); },
        static function (MlbRng $r) { $dark = $r->int(0, 1) === 1; $move = $r->int(0, 1) === 1; $or = $r->int(0, 1) === 1; $on = $or ? ($dark || $move) : ($dark && $move);
            return mlb_mcq($r, 'A security light switches on when it is dark ' . ($or ? 'OR' : 'AND') . ' movement is detected. Right now it is ' . ($dark ? '' : 'not ') . 'dark and movement is ' . ($move ? '' : 'not ') . 'detected. Is the light on?', $on ? 'Yes' : 'No',
                [[$on ? 'No' : 'Yes', $or ? 'OR needs only one condition to be true.' : 'AND needs both conditions to be true.']],
                ['The rule is "dark ' . ($or ? '∨' : '∧') . ' movement".', ($dark ? 'True' : 'False') . ' ' . ($or ? 'or' : 'and') . ' ' . ($move ? 'true' : 'false') . ' is ' . ($on ? 'true' : 'false') . ', so the light is ' . ($on ? 'on' : 'off') . '.'], 'AND: both. OR: at least one.', 'application', 30); },
        static function (MlbRng $r) { $n = $r->int(2, 5);
            return mlb_typed('num', 'In the truth table for $p_1 \\vee p_2 \\vee \\dots \\vee p_{' . $n . '}$, in how many rows is the statement TRUE?', (string)(2 ** $n - 1),
                ['There are $2^{' . $n . '} = ' . (2 ** $n) . '$ rows.', 'An "or" is false only when every part is false — one row — so it is true in $' . (2 ** $n) . ' - 1 = ' . (2 ** $n - 1) . '$ rows.'], 'Count the rows where it is FALSE first.', 'reasoning', 50); },
    ];
    $f['MC-123'] = [
        static function (MlbRng $r) { $k = $r->int(1, 4); $a = $r->int(-5, 6); $b = $r->int(-5, 6);
            return mlb_typed('num', 'The operation $*$ is defined by $a * b = a + b + ' . $k . 'ab$. Find $' . $a . ' * ' . ($b < 0 ? '(' . $b . ')' : $b) . '$.', (string)($a + $b + $k * $a * $b),
                ['Replace $a$ by $' . $a . '$ and $b$ by $' . $b . '$.', '$' . $a . ' + (' . $b . ') + ' . $k . '(' . $a . ')(' . $b . ') = ' . ($a + $b + $k * $a * $b) . '$.'], 'Substitute carefully, with brackets.', 'procedure', 35); },
        static function (MlbRng $r) { $k = $r->nz(-9, 9);
            return mlb_typed('num', 'The operation $\\circ$ is defined on real numbers by $a \\circ b = a + b ' . ($k > 0 ? '- ' . $k : '+ ' . (-$k)) . '$. Find the identity element $e$ (so that $a \\circ e = a$ for every $a$).', (string)$k,
                ['$a \\circ e = a + e ' . ($k > 0 ? '- ' . $k : '+ ' . (-$k)) . ' = a$.', 'So $e ' . ($k > 0 ? '- ' . $k : '+ ' . (-$k)) . ' = 0$ and $e = ' . $k . '$.'], 'The identity changes nothing.', 'concept', 45); },
        static function (MlbRng $r) { $k = $r->nz(-6, 6); $a = $r->int(-8, 12);
            return mlb_typed('num', 'Under $a \\circ b = a + b ' . ($k > 0 ? '- ' . $k : '+ ' . (-$k)) . '$, the identity element is $' . $k . '$. Find the inverse of $' . $a . '$.', (string)(2 * $k - $a),
                ['The inverse $a^{-1}$ satisfies $' . $a . ' \\circ a^{-1} = e = ' . $k . '$.', '$' . $a . ' + a^{-1} ' . ($k > 0 ? '- ' . $k : '+ ' . (-$k)) . ' = ' . $k . '$, so $a^{-1} = ' . (2 * $k - $a) . '$.'], 'Combine to give the IDENTITY, not zero.', 'reasoning', 50); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            return mlb_mcq($r, 'Is the operation $a * b = ' . ($c ? 'a - b' : '2a + b') . '$ commutative?', 'No',
                [['Yes', $c ? '$3 * 1 = 2$ but $1 * 3 = -2$: the order matters.' : '$1 * 2 = 4$ but $2 * 1 = 5$: the order matters.'], ['Only for positive numbers', 'One counter-example is enough to show it is not commutative.']],
                ['Commutative means $a * b = b * a$ for EVERY $a$ and $b$.', $c ? '$a - b = b - a$ only when $a = b$, so it is not commutative.' : '$2a + b = 2b + a$ only when $a = b$, so it is not commutative.'], 'Try two different numbers both ways round.', 'reasoning', 35); },
        static function (MlbRng $r) { $x = 2 * $r->int(10, 20); $y = 2 * $r->int(10, 20); $z = $r->int(10, 40);
            return mlb_typed('num', 'Two water samples are mixed in equal amounts, giving the average temperature: $a \\oplus b = \\frac{a + b}{2}$. Find $(' . $x . ' \\oplus ' . $y . ') \\oplus ' . $z . '$, in °C.', mlb_dec((($x + $y) / 2 + $z) / 2),
                ['Brackets first: $' . $x . ' \\oplus ' . $y . ' = ' . (($x + $y) / 2) . '$.', 'Then $' . (($x + $y) / 2) . ' \\oplus ' . $z . ' = ' . mlb_dec((($x + $y) / 2 + $z) / 2) . '$°C.'], 'Work from the inside out.', 'application', 45, ['unit' => '°C']); },
    ];
    $f['MC-124'] = [
        static function (MlbRng $r) { $a = $r->nz(-4, 5); $b = $r->int(-9, 9); $k = $r->int(-5, 5);
            return mlb_typed('num', '$f(x) = ' . mlb_poly([$a, 0, $b]) . '$. Find $f(' . $k . ')$.', (string)($a * $k * $k + $b),
                ['Replace $x$ with $' . $k . '$: $f(' . $k . ') = ' . $a . '(' . $k . ')^2' . mlb_sterm($b) . '$.', '$= ' . ($a * $k * $k) . mlb_sterm($b) . ' = ' . ($a * $k * $k + $b) . '$.'], 'Square first — a negative squared is positive.', 'procedure', 30); },
        static function (MlbRng $r) { $a = $r->nz(-9, 9);
            return mlb_typed('num', 'Which real number must be left out of the domain of $f(x) = \\frac{3}{x ' . ($a > 0 ? '- ' . $a : '+ ' . (-$a)) . '}$?', (string)$a,
                ['You cannot divide by zero.', '$x ' . ($a > 0 ? '- ' . $a : '+ ' . (-$a)) . ' = 0$ when $x = ' . $a . '$, so $' . $a . '$ is excluded.'], 'When is the bottom zero?', 'concept', 30); },
        static function (MlbRng $r) { $a = 100 * $r->int(5, 20); $b = 5 * $r->int(1, 10); $m = $r->int(10, 300);
            return mlb_typed('num', 'A phone plan costs $C(m) = ' . $a . ' + ' . $b . 'm$ naira for $m$ minutes of calls. One month the bill was ₦' . mlb_p($a + $b * $m) . '. How many minutes were used?', (string)$m,
                ['$' . $a . ' + ' . $b . 'm = ' . ($a + $b * $m) . '$.', '$' . $b . 'm = ' . ($b * $m) . '$, so $m = ' . $m . '$.'], 'Undo the function: subtract, then divide.', 'application', 50); },
        static function (MlbRng $r) { $x = $r->int(1, 9);
            return mlb_mcq($r, 'Which of these is NOT a function from $A$ to $B$?', 'A rule that sends $' . $x . '$ to two different outputs',
                [['A rule that sends every element to the same output', 'A constant mapping is still a function: each input has exactly one output.'], ['A rule where two inputs share an output', 'Many-to-one is allowed; one input with two outputs is not.'], ['$f(x) = x^2$ on the real numbers', 'Every input has exactly one square.']],
                ['A function gives EXACTLY one output for every input.', 'An input with two outputs breaks that rule.'], 'One input, one output.', 'reasoning', 35); },
        static function (MlbRng $r) { $c = $r->int(-9, 9); $h = $r->int(-4, 4);
            return mlb_typed('num', 'What is the smallest value in the range of $f(x) = (x ' . ($h > 0 ? '- ' . $h : '+ ' . (-$h)) . ')^2 ' . ($c < 0 ? '- ' . (-$c) : '+ ' . $c) . '$, for all real $x$?', (string)$c,
                ['A square is never negative, so $(x ' . ($h > 0 ? '- ' . $h : '+ ' . (-$h)) . ')^2 \\ge 0$.', 'So $f(x) \\ge ' . $c . '$, reached at $x = ' . $h . '$: the range is $f(x) \\ge ' . $c . '$.'], 'How small can the square be?', 'reasoning', 40); },
    ];
    $f['MC-125'] = [
        static function (MlbRng $r) { $a = $r->nz(-4, 4); $b = $r->int(-6, 6); $c = $r->nz(-4, 4); $d = $r->int(-6, 6); $k = $r->int(-3, 4); $g = $c * $k + $d;
            return mlb_typed('num', '$f(x) = ' . mlb_lterm($a, 'x') . mlb_sterm($b) . '$ and $g(x) = ' . mlb_lterm($c, 'x') . mlb_sterm($d) . '$. Find $f(g(' . $k . '))$.', (string)($a * $g + $b),
                ['Inside first: $g(' . $k . ') = ' . $g . '$.', 'Then $f(' . $g . ') = ' . $a . '(' . $g . ')' . mlb_sterm($b) . ' = ' . ($a * $g + $b) . '$.'], 'Work from the inside out.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->nz(-5, 6); if (abs($a) === 1) $a = 2; $b = $r->int(-9, 9); $y = $r->int(-10, 20);
            return mlb_typed('frac', '$f(x) = ' . mlb_lterm($a, 'x') . mlb_sterm($b) . '$. Find $f^{-1}(' . $y . ')$.', mlb_frac($y - $b, $a),
                ['$f^{-1}(' . $y . ')$ is the $x$ with $f(x) = ' . $y . '$: $' . $a . 'x' . mlb_sterm($b) . ' = ' . $y . '$.', '$x = \\frac{' . $y . mlb_sterm(-$b) . '}{' . $a . '} = ' . mlb_ftex($y - $b, $a) . '$.'], 'Undo the steps in reverse order.', 'procedure', 45); },
        static function (MlbRng $r) { $a = $r->pick([2, 3, 4, 5, -2, -3]); $b = $r->nz(-9, 9);
            return mlb_typed('expr', 'Find $f^{-1}(x)$ when $f(x) = ' . $a . 'x' . mlb_sterm($b) . '$.', '(x' . ($b > 0 ? '-' : '+') . abs($b) . ')/(' . $a . ')',
                ['Write $y = ' . $a . 'x' . mlb_sterm($b) . '$ and make $x$ the subject: $x = \\frac{y' . mlb_sterm(-$b) . '}{' . $a . '}$.', 'Rename: $f^{-1}(x) = \\frac{x' . mlb_sterm(-$b) . '}{' . $a . '}$.'], 'Swap the roles of input and output.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->int(2, 5); $b = $r->int(1, 6); $k = $r->int(1, 4);
            $fg = $a * ($k + $b); $gf = $a * $k + $b;
            return mlb_mcq($r, '$f(x) = ' . $a . 'x$ and $g(x) = x + ' . $b . '$. What is $f(g(' . $k . '))$?', (string)$fg,
                [[(string)$gf, 'That is $g(f(' . $k . '))$: the inner function is applied FIRST.'], [(string)($a * $k * ($k + $b)), 'Composition substitutes one function into the other; it does not multiply them.'], [(string)($a * $k + $k + $b), 'That adds $f(' . $k . ')$ and $g(' . $k . ')$.']],
                ['$f(g(' . $k . '))$: first $g(' . $k . ') = ' . ($k + $b) . '$.', 'Then $f(' . ($k + $b) . ') = ' . $fg . '$.'], 'Which function acts first?', 'reasoning', 35); },
        static function (MlbRng $r) { $C = 5 * $r->int(-4, 20); $F = 9 * $C / 5 + 32;
            return mlb_typed('num', 'Temperature in °F is $F = \\frac{9}{5}C + 32$. A thermometer reads $' . mlb_dec($F) . '$°F. What is that in °C?', (string)$C,
                ['Invert the formula: $C = \\frac{5}{9}(F - 32)$.', '$\\frac{5}{9}(' . mlb_dec($F) . ' - 32) = ' . $C . '$°C.'], 'Undo "add 32" first, then undo "times 9/5".', 'application', 50, ['unit' => '°C']); },
    ];
    $f['MC-126'] = [
        static function (MlbRng $r) { do { $A = $r->nz(-5, 5); $B = $r->nz(-5, 5); $a = $r->int(-4, 4); $b = $r->int(-4, 4); } while ($a === $b || $A + $B === 0);
            $p = $A + $B; $q = -($A * $b + $B * $a); $ask = $r->int(0, 1);
            return mlb_typed('num', 'Write $\\frac{' . mlb_lterm($p, 'x') . mlb_sterm($q) . '}{(x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ')}$ as $\\frac{A}{x' . mlb_sterm(-$a) . '} + \\frac{B}{x' . mlb_sterm(-$b) . '}$. Find $' . ($ask ? 'B' : 'A') . '$.', (string)($ask ? $B : $A),
                ['$' . mlb_lterm($p, 'x') . mlb_sterm($q) . ' = A(x' . mlb_sterm(-$b) . ') + B(x' . mlb_sterm(-$a) . ')$.', $ask ? 'Put $x = ' . $b . '$: $' . ($p * $b + $q) . ' = B(' . ($b - $a) . ')$, so $B = ' . $B . '$.' : 'Put $x = ' . $a . '$: $' . ($p * $a + $q) . ' = A(' . ($a - $b) . ')$, so $A = ' . $A . '$.'], 'Choose $x$ to make one bracket zero.', 'procedure', 80); },
        static function (MlbRng $r) { $a = $r->nz(-9, 9);
            return mlb_typed('expr', 'Simplify $\\frac{x^2 - ' . ($a * $a) . '}{x ' . ($a > 0 ? '- ' . $a : '+ ' . (-$a)) . '}$ (for $x \\ne ' . $a . '$).', 'x' . ($a > 0 ? '+' : '-') . abs($a),
                ['Difference of two squares: $x^2 - ' . ($a * $a) . ' = (x - ' . abs($a) . ')(x + ' . abs($a) . ')$.', 'Cancel the common factor: $x ' . ($a > 0 ? '+ ' . $a : '- ' . (-$a)) . '$.'], 'Factorise the top, then cancel.', 'procedure', 45); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $b = $r->int(1, 5);
            return mlb_mcq($r, 'What is the correct form of the partial fractions for $\\frac{3x + 1}{(x - ' . $a . ')^2(x + ' . $b . ')}$?', '$\\frac{A}{x - ' . $a . '} + \\frac{B}{(x - ' . $a . ')^2} + \\frac{C}{x + ' . $b . '}$',
                [['$\\frac{A}{(x - ' . $a . ')^2} + \\frac{C}{x + ' . $b . '}$', 'A repeated factor needs a term for EACH power: $(x - ' . $a . ')$ and $(x - ' . $a . ')^2$.'], ['$\\frac{A}{x - ' . $a . '} + \\frac{C}{x + ' . $b . '}$', 'The square in the denominator must appear in one of the fractions.'], ['$\\frac{Ax + B}{(x - ' . $a . ')^2} + C$', 'The fraction is proper, so there is no whole-number part $C$.']],
                ['A repeated linear factor $(x - ' . $a . ')^2$ gives two terms: $\\frac{A}{x - ' . $a . '}$ and $\\frac{B}{(x - ' . $a . ')^2}$.', 'The other factor gives $\\frac{C}{x + ' . $b . '}$.'], 'One term for each power of a repeated factor.', 'concept', 45); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $b = -$r->int(1, 5); $A = $r->nz(-4, 4); $B = $r->nz(-4, 4); $p = $A + $B; $q = -($A * $b + $B * $a);
            $num = $p * $a + $q;
            return mlb_error_of($r, 'Find the first mistake in this working to find $A$ in $\\frac{' . mlb_lterm($p, 'x') . mlb_sterm($q) . '}{(x - ' . $a . ')(x + ' . (-$b) . ')} = \\frac{A}{x - ' . $a . '} + \\frac{B}{x + ' . (-$b) . '}$.',
                ['$' . mlb_lterm($p, 'x') . mlb_sterm($q) . ' = A(x + ' . (-$b) . ') + B(x - ' . $a . ')$', 'Put $x = ' . $a . '$: $' . $num . ' = A(' . ($a - $b) . ')$', '$A = ' . mlb_ftex($num, $a - $b) . '$'], [
                [1, ['$' . mlb_lterm($p, 'x') . mlb_sterm($q) . ' = A(x + ' . (-$b) . ') + B(x - ' . $a . ')$', 'Put $x = -' . $a . '$: $' . (-$p * $a + $q) . ' = A(' . (-$a - $b) . ')$', '$A = ' . mlb_ftex(-$p * $a + $q, (-$a - $b) === 0 ? 1 : -$a - $b) . '$'], 'to remove the $B$ term, $x - ' . $a . '$ must be zero: put $x = ' . $a . '$.'],
                [0, ['$' . mlb_lterm($p, 'x') . mlb_sterm($q) . ' = A(x - ' . $a . ') + B(x + ' . (-$b) . ')$', 'Put $x = ' . $a . '$: $' . $num . ' = B(' . ($a - $b) . ')$', '$B = ' . mlb_ftex($num, $a - $b) . '$'], 'multiplying through, $A$ is multiplied by the OTHER factor, $(x + ' . (-$b) . ')$.'],
            ]); },
        static function (MlbRng $r) { $n = $r->int(3, 20);
            return mlb_typed('frac', 'Using $\\frac{1}{r(r + 1)} = \\frac{1}{r} - \\frac{1}{r + 1}$, find $\\sum_{r=1}^{' . $n . '} \\frac{1}{r(r + 1)}$ as a fraction.', mlb_frac($n, $n + 1),
                ['Write out the terms: $(1 - \\frac{1}{2}) + (\\frac{1}{2} - \\frac{1}{3}) + \\dots + (\\frac{1}{' . $n . '} - \\frac{1}{' . ($n + 1) . '})$.', 'Everything cancels except the first and last: $1 - \\frac{1}{' . ($n + 1) . '} = ' . mlb_ftex($n, $n + 1) . '$.'], 'Watch the middle terms cancel (telescope).', 'application', 60); },
    ];
    $f['MC-127'] = [
        static function (MlbRng $r) { $n = $r->int(5, 10); $k = $r->int(2, 4); $v = intdiv(mlb_fact($n), mlb_fact($n - $k));
            return mlb_typed('num', 'In how many ways can ' . $k . ' different prizes (1st, 2nd' . ($k > 2 ? ', 3rd' : '') . ($k > 3 ? ', 4th' : '') . ') be given to ' . $k . ' of ' . $n . ' students?', (string)$v,
                ['Order matters (1st is different from 2nd): this is $^{' . $n . '}P_{' . $k . '}$.', '$' . implode(' \\times ', range($n, $n - $k + 1)) . ' = ' . $v . '$.'], 'Choices for 1st, then for 2nd, …', 'procedure', 45); },
        static function (MlbRng $r) { $n = $r->int(5, 12); $k = $r->int(2, 4);
            return mlb_typed('num', 'How many different committees of ' . $k . ' can be chosen from ' . $n . ' people?', (string)mlb_ncr($n, $k),
                ['Order does not matter in a committee: $^{' . $n . '}C_{' . $k . '} = \\frac{' . $n . '!}{' . $k . '!\\,' . ($n - $k) . '!}$.', '$= ' . mlb_ncr($n, $k) . '$.'], 'Count arrangements, then divide by the orders of the same group.', 'procedure', 45); },
        static function (MlbRng $r) { [$w, $v] = $r->pick([['LAGOS', 120], ['ABUJA', 60], ['KANO', 24], ['BENIN', 60], ['ENUGU', 60], ['ILORIN', 360], ['OSOGBO', 180], ['AKURE', 120], ['ZARIA', 60]]);
            return mlb_typed('num', 'How many different arrangements are there of all the letters of the word ' . $w . '?', (string)$v,
                ['$' . strlen($w) . '$ letters can be arranged in $' . strlen($w) . '!$ ways; divide by the arrangements of any repeated letter.', 'That gives $' . $v . '$.'], 'Repeated letters cannot be told apart.', 'application', 50); },
        static function (MlbRng $r) { $n = $r->int(6, 10);
            return mlb_mcq($r, 'A class of ' . $n . ' chooses a captain and a vice-captain. Is this a permutation or a combination problem, and how many ways are there?', 'Permutation: ' . ($n * ($n - 1)) . ' ways',
                [['Combination: ' . mlb_ncr($n, 2) . ' ways', 'The two roles are different, so swapping two people gives a different result: order matters.'], ['Permutation: ' . ($n * $n) . ' ways', 'One person cannot hold both roles.'], ['Combination: ' . (2 * $n) . ' ways', 'That is neither formula.']],
                ['Captain and vice-captain are different jobs, so order matters.', '$' . $n . ' \\times ' . ($n - 1) . ' = ' . ($n * ($n - 1)) . '$.'], 'Does swapping the two people make a different outcome?', 'reasoning', 40); },
    ];
    $f['MC-128'] = [
        static function (MlbRng $r) { $n = $r->int(3, 7); $k = $r->int(1, $n - 1); $a = $r->int(1, 3); $b = $r->nz(-3, 3);
            $c = mlb_ncr($n, $k) * $a ** ($n - $k) * $b ** $k;
            return mlb_typed('num', 'Find the coefficient of $x^' . $k . '$ in the expansion of $(' . $a . mlb_sterm($b, 'x') . ')^' . $n . '$.', (string)$c,
                ['The term in $x^' . $k . '$ is $\\binom{' . $n . '}{' . $k . '}(' . $a . ')^{' . ($n - $k) . '}(' . $b . 'x)^' . $k . '$.', '$' . mlb_ncr($n, $k) . ' \\times ' . ($a ** ($n - $k)) . ' \\times ' . ($b ** $k) . ' = ' . $c . '$.'], 'Choose which power of each part makes $x^' . $k . '$.', 'procedure', 70); },
        static function (MlbRng $r) { $n = $r->int(3, 15);
            return mlb_typed('num', 'How many terms are there in the expansion of $(a + b)^{' . $n . '}$?', (string)($n + 1),
                ['The powers of $b$ run from 0 up to ' . $n . '.', 'That is ' . ($n + 1) . ' terms.'], 'Count the powers, including 0.', 'concept', 25); },
        static function (MlbRng $r) { $a = $r->int(1, 3); $b = $r->int(1, 2); $n = $r->int(3, 6);
            return mlb_typed('num', 'Find the sum of all the coefficients in the expansion of $(' . $a . 'x + ' . $b . ')^' . $n . '$.', (string)(($a + $b) ** $n),
                ['The sum of the coefficients is the value of the expression when $x = 1$.', '$(' . $a . ' + ' . $b . ')^' . $n . ' = ' . (($a + $b) ** $n) . '$.'], 'What happens when $x = 1$?', 'reasoning', 40); },
        static function (MlbRng $r) { $n = $r->int(4, 9);
            return mlb_mcq($r, 'What is the coefficient of $x^2$ in $(1 + x)^' . $n . '$?', (string)mlb_ncr($n, 2),
                [[(string)($n * $n), 'Binomial coefficients are not powers of $n$: use $\\binom{' . $n . '}{2}$.'], [(string)(2 * $n), 'That is $2n$, not $\\binom{n}{2}$.'], [(string)$n, 'That is the coefficient of $x$, $\\binom{' . $n . '}{1}$.']],
                ['The coefficient of $x^2$ is $\\binom{' . $n . '}{2} = \\frac{' . $n . ' \\times ' . ($n - 1) . '}{2}$.', '$= ' . mlb_ncr($n, 2) . '$ (row ' . $n . ' of Pascal\'s triangle).'], 'Pascal\'s triangle, row ' . $n . '.', 'reasoning', 35); },
        static function (MlbRng $r) { $n = $r->int(3, 8); $h = $r->pick([0.01, 0.02, 0.03]); $v = 1 + $n * $h + mlb_ncr($n, 2) * $h * $h;
            return mlb_typed('num', 'Use the first three terms of the binomial expansion of $(1 + x)^' . $n . '$ to estimate $' . mlb_dec(1 + $h) . '^' . $n . '$, correct to 4 decimal places.', mlb_rd($v, 4),
                ['$(1 + x)^' . $n . ' \\approx 1 + ' . $n . 'x + ' . mlb_ncr($n, 2) . 'x^2$ with $x = ' . mlb_dec($h) . '$.', '$1 + ' . mlb_dec($n * $h) . ' + ' . mlb_dec(mlb_ncr($n, 2) * $h * $h) . ' = ' . mlb_rd($v, 4) . '$.'], 'Small $x$ makes later terms tiny.', 'application', 60, ['dp' => 4]); },
    ];
    $f['MC-129'] = [
        static function (MlbRng $r) { $a = $r->int(-5, 12); $d = $r->nz(-4, 6); $n = $r->int(8, 30); $S = intdiv($n * (2 * $a + ($n - 1) * $d), 2);
            return mlb_typed('num', 'Find the sum of the first ' . $n . ' terms of the arithmetic series $' . $a . ' + ' . ($a + $d) . ' + ' . ($a + 2 * $d) . ' + \\dots$', (string)$S,
                ['$S_n = \\frac{n}{2}[2a + (n - 1)d]$ with $a = ' . $a . '$, $d = ' . $d . '$.', '$\\frac{' . $n . '}{2}[' . (2 * $a) . ' + ' . (($n - 1) * $d) . '] = ' . $S . '$.'], 'Find $a$ and $d$ first.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $q = $r->pick([2, 3]); $n = $r->int(4, 8); $S = $a * ($q ** $n - 1) / ($q - 1);
            return mlb_typed('num', 'Find the sum of the first ' . $n . ' terms of the geometric series $' . $a . ' + ' . ($a * $q) . ' + ' . ($a * $q * $q) . ' + \\dots$', (string)$S,
                ['$S_n = \\frac{a(r^n - 1)}{r - 1}$ with $a = ' . $a . '$, $r = ' . $q . '$.', '$\\frac{' . $a . '(' . $q . '^' . $n . ' - 1)}{' . ($q - 1) . '} = ' . $S . '$.'], 'Common ratio first.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->int(1, 12); [$p, $q] = $r->pick([[1, 2], [1, 3], [2, 3], [-1, 2], [1, 4], [3, 4], [-1, 3]]);
            return mlb_typed('frac', 'Find the sum to infinity of the geometric series with first term $' . $a . '$ and common ratio $' . mlb_ftex($p, $q) . '$.', mlb_frac($a * $q, $q - $p),
                ['Since $|r| < 1$, $S_\\infty = \\frac{a}{1 - r}$.', '$\\frac{' . $a . '}{1 - (' . mlb_ftex($p, $q) . ')} = \\frac{' . $a . '}{' . mlb_ftex($q - $p, $q) . '} = ' . mlb_ftex($a * $q, $q - $p) . '$.'], 'Only works when $-1 < r < 1$.', 'procedure', 50); },
        static function (MlbRng $r) { $a = 500 * $r->int(1, 6); $d = 100 * $r->int(1, 5); $n = 12;
            return mlb_typed('num', 'A student saves ₦' . mlb_p($a) . ' in the first month and ₦' . mlb_p($d) . ' more each month after that. How much has she saved after a year (12 months)?', (string)(6 * (2 * $a + 11 * $d)),
                ['The monthly amounts form an AP: $a = ' . $a . '$, $d = ' . $d . '$, $n = 12$.', '$S_{12} = \\frac{12}{2}[' . (2 * $a) . ' + 11 \\times ' . $d . '] = ' . mlb_n(6 * (2 * $a + 11 * $d)) . '$.'], 'Each month adds the same extra amount.', 'application', 60, ['unit' => '₦']); },
        static function (MlbRng $r) { [$p, $q] = $r->pick([[3, 2], [5, 4], [-3, 2], [4, 3]]);
            return mlb_mcq($r, 'Does the infinite geometric series with common ratio $' . mlb_ftex($p, $q) . '$ have a sum to infinity?', 'No — the terms do not get smaller',
                [['Yes: $\\frac{a}{1 - r}$', 'The formula only holds when $|r| < 1$; here $|r| > 1$, so the terms grow.'], ['Yes, it is always $2a$', 'No such rule exists.'], ['Only if the first term is negative', 'The sign of $a$ does not decide it; the size of $r$ does.']],
                ['A sum to infinity exists only when $-1 < r < 1$.', '$|' . mlb_ftex($p, $q) . '| > 1$, so the terms grow and the sum has no limit.'], 'Do the terms shrink?', 'reasoning', 35); },
    ];
    $f['MC-130'] = [
        static function (MlbRng $r) { $a = $r->int(2, 9); $b = $r->int(2, 9); $V = [[0, 0], [$r->int(4, 10), 0], [$r->int(2, 6), $r->int(3, 8)], [0, $r->int(4, 9)]];
            $vals = array_map(static fn($v) => $a * $v[0] + $b * $v[1], $V); $best = max($vals);
            return mlb_typed('num', 'The feasible region has corners at ' . implode(', ', array_map(static fn($v) => '$(' . $v[0] . ', ' . $v[1] . ')$', $V)) . '. Find the maximum value of $P = ' . $a . 'x + ' . $b . 'y$ over the region.', (string)$best,
                ['The maximum of a linear objective over a polygon is at a corner.', implode(', ', array_map(static fn($v, $p) => '$P(' . $v[0] . ', ' . $v[1] . ') = ' . $p . '$', $V, $vals)) . '. The largest is $' . $best . '$.'], 'Test every corner.', 'procedure', 60); },
        static function (MlbRng $r) { $c = $r->int(0, 2); $k = $r->int(10, 40);
            [$txt, $right, $wrong] = [['The total number of hours, $x + y$, must be at most ' . $k, '$x + y \\le ' . $k . '$', ['$x + y \\ge ' . $k . '$', '"At most" means no more than: $\\le$.']],
                ['At least ' . $k . ' items must be made in total', '$x + y \\ge ' . $k . '$', ['$x + y \\le ' . $k . '$', '"At least" means no fewer than: $\\ge$.']],
                ['There must be more than ' . $k . ' items of type $x$', '$x > ' . $k . '$', ['$x \\ge ' . $k . '$', '"More than" excludes ' . $k . ' itself, so it is strict.']]][$c];
            return mlb_mcq($r, 'Which inequality says: "' . $txt . '"?', $right, [$wrong, ['$x + y = ' . $k . '$', 'An equation fixes the total exactly; the condition allows a range.'], ['$xy \\le ' . $k . '$', 'The quantities are added, not multiplied.']],
                ['Translate the words exactly: "at most" $\\le$, "at least" $\\ge$, "more than" $>$.', 'So: ' . $right . '.'], 'Read the words carefully.', 'concept', 35); },
        static function (MlbRng $r) { $pa = 100 * $r->int(2, 8); $pb = 100 * $r->int(2, 8); $V = [[0, 0], [$r->int(10, 20), 0], [$r->int(6, 12), $r->int(5, 12)], [0, $r->int(10, 18)]];
            $vals = array_map(static fn($v) => $pa * $v[0] + $pb * $v[1], $V); $i = array_search(max($vals), $vals, true);
            return mlb_typed('num', 'A farmer plants $x$ hectares of maize and $y$ of cassava, earning ₦' . mlb_p($pa) . ' and ₦' . mlb_p($pb) . ' (thousands) per hectare. Her limits on land and labour give a region with corners ' . implode(', ', array_map(static fn($v) => '$(' . $v[0] . ', ' . $v[1] . ')$', $V)) . '. What is her greatest possible income, in thousands of naira?', (string)max($vals),
                ['Income $I = ' . $pa . 'x + ' . $pb . 'y$; test the corners.', 'The best corner is $(' . $V[$i][0] . ', ' . $V[$i][1] . ')$, giving $' . mlb_n(max($vals)) . '$.'], 'The best plan sits at a corner of the region.', 'application', 70); },
        static function (MlbRng $r) { $a = $r->int(2, 6); $b = $r->int(2, 6); $V = [[$r->int(6, 10), 0], [$r->int(3, 6), $r->int(4, 7)], [0, $r->int(6, 10)]];
            $vals = array_map(static fn($v) => $a * $v[0] + $b * $v[1], $V); $best = max($vals);
            return mlb_error_of($r, 'Find the first mistake in this working to maximise $P = ' . $a . 'x + ' . $b . 'y$ over the region with corners $(' . $V[0][0] . ', 0)$, $(' . $V[1][0] . ', ' . $V[1][1] . ')$ and $(0, ' . $V[2][1] . ')$.',
                ['The maximum is at a corner of the region', '$P$ at the corners: $' . implode(', ', $vals) . '$', 'Maximum $P = ' . $best . '$'], [
                [0, ['The maximum is at the middle of the region', 'Middle point: $(' . intdiv($V[0][0], 2) . ', ' . intdiv($V[2][1], 2) . ')$', '$P = ' . ($a * intdiv($V[0][0], 2) + $b * intdiv($V[2][1], 2)) . '$'], 'a linear objective is largest at a CORNER (vertex) of the region, not in the middle.'],
                [2, ['The maximum is at a corner of the region', '$P$ at the corners: $' . implode(', ', $vals) . '$', 'Maximum $P = ' . min($vals) . '$'], 'that is the smallest value; the maximum is $' . $best . '$.'],
            ]); },
    ];

    /* ══ Stage 14 · Matrices, Vectors and Transformations ═════════════════ */
    $f['MC-131'] = [
        static function (MlbRng $r) { $m = $r->int(1, 5); $n = $r->int(1, 5); $M = []; for ($i = 0; $i < $m; $i++) for ($j = 0; $j < $n; $j++) $M[$i][$j] = $r->int(-9, 9);
            return mlb_typed('num', 'How many elements does the matrix $' . mlb_mat($M) . '$ have?', (string)($m * $n),
                ['It has ' . $m . ' row' . ($m === 1 ? '' : 's') . ' and ' . $n . ' column' . ($n === 1 ? '' : 's') . ': order $' . $m . ' \\times ' . $n . '$.', '$' . $m . ' \\times ' . $n . ' = ' . ($m * $n) . '$ elements.'], 'Rows times columns.', 'concept', 25); },
        static function (MlbRng $r) { $M = []; for ($i = 0; $i < 3; $i++) for ($j = 0; $j < 3; $j++) $M[$i][$j] = $r->int(-9, 9); $i = $r->int(1, 3); $j = $r->int(1, 3);
            return mlb_typed('num', 'For $A = ' . mlb_mat($M) . '$, what is the element $a_{' . $i . $j . '}$?', (string)$M[$i - 1][$j - 1],
                ['$a_{ij}$ is the element in row $i$, column $j$.', 'Row ' . $i . ', column ' . $j . ': $' . $M[$i - 1][$j - 1] . '$.'], 'Row first, then column.', 'procedure', 25); },
        static function (MlbRng $r) { $c = $r->int(0, 3); $k = $r->int(2, 9);
            $cases = [['\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}', 'The identity matrix'], ['\\begin{pmatrix} ' . $k . ' & 0 \\\\ 0 & ' . ($k + 1) . ' \\end{pmatrix}', 'A diagonal matrix'], ['\\begin{pmatrix} 0 & 0 \\\\ 0 & 0 \\end{pmatrix}', 'The zero matrix'], ['\\begin{pmatrix} ' . $k . ' & 3 \\\\ 3 & 1 \\end{pmatrix}', 'A symmetric matrix that is not diagonal']];
            [$m, $right] = $cases[$c]; $wrong = []; foreach ($cases as $i => [$mm, $t]) if ($i !== $c) $wrong[] = [$t, 'That would look like $' . $mm . '$.'];
            return mlb_mcq($r, 'Which best describes $' . $m . '$?', $right, $wrong, ['Identity: 1s on the diagonal, 0 elsewhere. Diagonal: zeros off the diagonal. Symmetric: equal across the diagonal.', 'So this is: ' . mb_strtolower($right) . '.'], 'Look at the diagonal and what is off it.', 'concept', 30); },
        static function (MlbRng $r) { $p = $r->int(2, 5); $d = $r->int(3, 7);
            return mlb_typed('pair', 'A shop records the sales of ' . $p . ' products (one row each) over ' . $d . ' days (one column each) in a matrix. What is the order of the matrix?', [$p, $d],
                ['Order is rows × columns.', 'There are ' . $p . ' rows (products) and ' . $d . ' columns (days): $' . $p . ' \\times ' . $d . '$.'], 'Rows first.', 'application', 30, ['labels' => ['\\text{rows}', '\\text{columns}']]); },
        static function (MlbRng $r) { $m = $r->int(2, 3); $n = $m + 1;
            return mlb_mcq($r, 'Can a $' . $m . ' \\times ' . $n . '$ matrix be added to a $' . $n . ' \\times ' . $m . '$ matrix?', 'No — matrices must have the same order to be added',
                [['Yes, they have the same number of elements', 'Elements are added position by position, so the shapes must match exactly.'], ['Yes, the answer is ' . $m . ' × ' . $m, 'That confuses addition with multiplication.'], ['Only if they are square', 'Neither is square here, and matching orders is what matters.']],
                ['Matrix addition adds corresponding elements.', 'A ' . $m . '×' . $n . ' and a ' . $n . '×' . $m . ' matrix have different shapes, so there is no sum.'], 'Do the positions line up?', 'reasoning', 30); },
    ];
    $f['MC-132'] = [
        static function (MlbRng $r) { $A = [[$r->int(-4, 5), $r->int(-4, 5)], [$r->int(-4, 5), $r->int(-4, 5)]]; $B = [[$r->int(-4, 5), $r->int(-4, 5)], [$r->int(-4, 5), $r->int(-4, 5)]]; $i = $r->int(0, 1); $j = $r->int(0, 1);
            $v = $A[$i][0] * $B[0][$j] + $A[$i][1] * $B[1][$j];
            return mlb_typed('num', '$A = ' . mlb_mat($A) . '$ and $B = ' . mlb_mat($B) . '$. Find the element in row ' . ($i + 1) . ', column ' . ($j + 1) . ' of $AB$.', (string)$v,
                ['Row ' . ($i + 1) . ' of $A$ times column ' . ($j + 1) . ' of $B$.', '$(' . $A[$i][0] . ')(' . $B[0][$j] . ') + (' . $A[$i][1] . ')(' . $B[1][$j] . ') = ' . $v . '$.'], 'Row by column, multiply and add.', 'procedure', 50); },
        static function (MlbRng $r) { $m = $r->int(1, 4); $n = $r->int(1, 4); $p = $r->int(1, 4);
            return mlb_typed('pair', 'A is a $' . $m . ' \\times ' . $n . '$ matrix and B is a $' . $n . ' \\times ' . $p . '$ matrix. What is the order of $AB$?', [$m, $p],
                ['$(' . $m . ' \\times ' . $n . ')(' . $n . ' \\times ' . $p . ')$: the inner numbers match, so $AB$ exists.', 'Its order is the outer numbers: $' . $m . ' \\times ' . $p . '$.'], 'Inner numbers must match; the outer ones give the order.', 'procedure', 30, ['labels' => ['\\text{rows}', '\\text{columns}']]); },
        static function (MlbRng $r) { $A = [[$r->int(-5, 5), $r->int(-5, 5)], [$r->int(-5, 5), $r->int(-5, 5)]]; $B = [[$r->int(-5, 5), $r->int(-5, 5)], [$r->int(-5, 5), $r->int(-5, 5)]]; $i = $r->int(0, 1); $j = $r->int(0, 1);
            return mlb_typed('num', '$A = ' . mlb_mat($A) . '$, $B = ' . mlb_mat($B) . '$. Find the element in row ' . ($i + 1) . ', column ' . ($j + 1) . ' of $2A - 3B$.', (string)(2 * $A[$i][$j] - 3 * $B[$i][$j]),
                ['Scalars multiply every element; subtraction is element by element.', '$2(' . $A[$i][$j] . ') - 3(' . $B[$i][$j] . ') = ' . (2 * $A[$i][$j] - 3 * $B[$i][$j]) . '$.'], 'Work with the one position only.', 'procedure', 35); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'For two $2 \\times 2$ matrices $A$ and $B$, is $AB$ always equal to $BA$?', 'No — matrix multiplication is not commutative in general',
                [['Yes, multiplication is always commutative', 'For numbers it is; for matrices the rows of one meet the columns of the other, and swapping changes that.'], ['Yes, because both are 2 × 2', 'Equal sizes make both products exist, but they can still differ.'], ['Only if one is the zero matrix', 'That is one case where they agree, not the rule.']],
                ['Try $A = \\begin{pmatrix} 1 & 1 \\\\ 0 & 1 \\end{pmatrix}$, $B = \\begin{pmatrix} 1 & 0 \\\\ 1 & 1 \\end{pmatrix}$: $AB = \\begin{pmatrix} 2 & 1 \\\\ 1 & 1 \\end{pmatrix}$ but $BA = \\begin{pmatrix} 1 & 1 \\\\ 1 & 2 \\end{pmatrix}$.', 'So the order of multiplication matters.'], 'Try a small example both ways.', 'reasoning', 40); },
        static function (MlbRng $r) { $q = [$r->int(2, 9), $r->int(1, 6), $r->int(1, 5)]; $pz = [50 * $r->int(2, 10), 100 * $r->int(1, 8), 200 * $r->int(1, 5)]; $tot = $q[0] * $pz[0] + $q[1] * $pz[1] + $q[2] * $pz[2];
            return mlb_typed('num', 'A shopping list as a row matrix is $Q = \\begin{pmatrix} ' . implode(' & ', $q) . ' \\end{pmatrix}$ (pens, books, bags) and the prices in naira as a column matrix are $P = \\begin{pmatrix} ' . implode(' \\\\ ', $pz) . ' \\end{pmatrix}$. Find $QP$, the total cost.', (string)$tot,
                ['$QP$ multiplies each quantity by its price and adds.', '$' . $q[0] . ' \\times ' . $pz[0] . ' + ' . $q[1] . ' \\times ' . $pz[1] . ' + ' . $q[2] . ' \\times ' . $pz[2] . ' = ' . mlb_n($tot) . '$.'], 'Row times column.', 'application', 50, ['unit' => '₦']); },
    ];
    $f['MC-133'] = [
        static function (MlbRng $r) { $M = [[$r->int(-9, 9), $r->int(-9, 9)], [$r->int(-9, 9), $r->int(-9, 9)]]; $d = $M[0][0] * $M[1][1] - $M[0][1] * $M[1][0];
            return mlb_typed('num', 'Find the determinant of $' . mlb_mat($M) . '$.', (string)$d,
                ['For $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$, the determinant is $ad - bc$.', '$(' . $M[0][0] . ')(' . $M[1][1] . ') - (' . $M[0][1] . ')(' . $M[1][0] . ') = ' . $d . '$.'], 'Leading diagonal minus the other.', 'procedure', 35); },
        static function (MlbRng $r) { $M = []; for ($i = 0; $i < 3; $i++) for ($j = 0; $j < 3; $j++) $M[$i][$j] = $r->int(-3, 4);
            $d = $M[0][0] * ($M[1][1] * $M[2][2] - $M[1][2] * $M[2][1]) - $M[0][1] * ($M[1][0] * $M[2][2] - $M[1][2] * $M[2][0]) + $M[0][2] * ($M[1][0] * $M[2][1] - $M[1][1] * $M[2][0]);
            return mlb_typed('num', 'Find the determinant of $' . mlb_mat($M) . '$.', (string)$d,
                ['Expand along the top row: $a(ei - fh) - b(di - fg) + c(dh - eg)$.', '$' . $M[0][0] . '(' . ($M[1][1] * $M[2][2] - $M[1][2] * $M[2][1]) . ') - (' . $M[0][1] . ')(' . ($M[1][0] * $M[2][2] - $M[1][2] * $M[2][0]) . ') + ' . $M[0][2] . '(' . ($M[1][0] * $M[2][1] - $M[1][1] * $M[2][0]) . ') = ' . $d . '$.'], 'Mind the alternating signs: + − +.', 'procedure', 120); },
        static function (MlbRng $r) { $b = $r->nz(-6, 6); $c = $r->nz(-6, 6); $k = $r->nz(-4, 4); $d = $c * $k; $x = $b * $k;
            return mlb_typed('num', 'For what value of $x$ is $\\begin{pmatrix} x & ' . $b . ' \\\\ ' . $c . ' & ' . $d . ' \\end{pmatrix}$ singular?', (string)$x,
                ['Singular means the determinant is zero: $' . $d . 'x - ' . ($b * $c < 0 ? '(' . ($b * $c) . ')' : $b * $c) . ' = 0$.', '$x = \\frac{' . ($b * $c) . '}{' . $d . '} = ' . $x . '$.'], 'Set $ad - bc = 0$.', 'reasoning', 45); },
        static function (MlbRng $r) { $a = $r->int(1, 6); $b = $r->int(-3, 3); $c = $r->int(-3, 3); $d = $r->int(1, 6); $det = $a * $d - $b * $c; if ($det === 0) $d++;
            $det = $a * $d - $b * $c;
            return mlb_typed('num', 'A parallelogram has sides given by the vectors $\\begin{pmatrix} ' . $a . ' \\\\ ' . $c . ' \\end{pmatrix}$ and $\\begin{pmatrix} ' . $b . ' \\\\ ' . $d . ' \\end{pmatrix}$ (units in metres). Find its area in $\\text{m}^2$.', (string)abs($det),
                ['The area of the parallelogram is the size of the determinant of the matrix with these columns.', '$|' . $a . ' \\times ' . $d . ' - ' . $b . ' \\times ' . $c . '| = ' . abs($det) . '\\ \\text{m}^2$.'], 'Area = |determinant|.', 'application', 50, ['unit' => 'm²']); },
        static function (MlbRng $r) { $a = $r->int(1, 6); $b = $r->int(1, 6); $c = $r->int(1, 6); $d = $r->int(1, 6); $det = $a * $d - $b * $c; if ($det === 0) $d++; $det = $a * $d - $b * $c;
            return mlb_error_of($r, 'Find the first mistake in this working for $\\det\\begin{pmatrix} ' . $a . ' & ' . $b . ' \\\\ ' . $c . ' & ' . $d . ' \\end{pmatrix}$.', ['$\\det = ad - bc$', '$= ' . $a . ' \\times ' . $d . ' - ' . $b . ' \\times ' . $c . '$', '$= ' . $det . '$'], [
                [0, ['$\\det = ab - cd$', '$= ' . $a . ' \\times ' . $b . ' - ' . $c . ' \\times ' . $d . '$', '$= ' . ($a * $b - $c * $d) . '$'], 'the determinant multiplies along the DIAGONALS: $ad - bc$.'],
                [0, ['$\\det = ad + bc$', '$= ' . $a . ' \\times ' . $d . ' + ' . $b . ' \\times ' . $c . '$', '$= ' . ($a * $d + $b * $c) . '$'], 'the second diagonal product is SUBTRACTED.'],
                [2, ['$\\det = ad - bc$', '$= ' . $a . ' \\times ' . $d . ' - ' . $b . ' \\times ' . $c . '$', '$= ' . ($a * $d - $b - $c) . '$'], '$' . $b . ' \\times ' . $c . '$ is ' . ($b * $c) . ', so the result is $' . $det . '$.'],
            ]); },
    ];
    $f['MC-134'] = [
        static function (MlbRng $r) { do { $M = [[$r->int(-5, 6), $r->int(-5, 6)], [$r->int(-5, 6), $r->int(-5, 6)]]; $d = $M[0][0] * $M[1][1] - $M[0][1] * $M[1][0]; } while ($d === 0);
            $i = $r->int(0, 1); $j = $r->int(0, 1); $adj = [[$M[1][1], -$M[0][1]], [-$M[1][0], $M[0][0]]];
            return mlb_typed('frac', 'Find the element in row ' . ($i + 1) . ', column ' . ($j + 1) . ' of $A^{-1}$, where $A = ' . mlb_mat($M) . '$.', mlb_frac($adj[$i][$j], $d),
                ['$A^{-1} = \\frac{1}{\\det A}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$, and $\\det A = ' . $d . '$.', 'That element is $\\frac{' . $adj[$i][$j] . '}{' . $d . '} = ' . mlb_ftex($adj[$i][$j], $d) . '$.'], 'Swap the diagonal, negate the other two, divide by the determinant.', 'procedure', 60); },
        static function (MlbRng $r) { do { $a = $r->int(-4, 5); $b = $r->int(-4, 5); $c = $r->int(-4, 5); $d = $r->int(-4, 5); } while ($a * $d - $b * $c === 0); $x = $r->int(-5, 5); $y = $r->int(-5, 5);
            return mlb_typed('pair', 'Use matrices to solve $' . mlb_lterm($a, 'x') . mlb_sterm($b, 'y') . ' = ' . ($a * $x + $b * $y) . '$ and $' . mlb_lterm($c, 'x') . mlb_sterm($d, 'y') . ' = ' . ($c * $x + $d * $y) . '$.', [$x, $y],
                ['$\\begin{pmatrix} ' . $a . ' & ' . $b . ' \\\\ ' . $c . ' & ' . $d . ' \\end{pmatrix}\\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ' . ($a * $x + $b * $y) . ' \\\\ ' . ($c * $x + $d * $y) . ' \\end{pmatrix}$, determinant $' . ($a * $d - $b * $c) . '$.', 'Multiplying by the inverse gives $x = ' . $x . '$, $y = ' . $y . '$.'], 'Write it as $AX = B$, then $X = A^{-1}B$.', 'procedure', 100, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $k = $r->int(2, 6); $a = $r->int(1, 5);
            return mlb_mcq($r, 'Does $\\begin{pmatrix} ' . $a . ' & ' . ($a * $k) . ' \\\\ 1 & ' . $k . ' \\end{pmatrix}$ have an inverse?', 'No — its determinant is 0',
                [['Yes — every square matrix has an inverse', 'A matrix with determinant 0 (singular) has no inverse.'], ['Yes, it is $\\begin{pmatrix} ' . $k . ' & -' . ($a * $k) . ' \\\\ -1 & ' . $a . ' \\end{pmatrix}$', 'That forgets to divide by the determinant — which is 0, so it cannot be done.'], ['Only if $' . $a . ' = 1$', 'The determinant is zero for every value here.']],
                ['$\\det = ' . $a . ' \\times ' . $k . ' - ' . ($a * $k) . ' \\times 1 = 0$.', 'Division by zero is impossible, so there is no inverse.'], 'Work out the determinant first.', 'reasoning', 35); },
        static function (MlbRng $r) { do { $a = $r->int(1, 5); $b = $r->int(1, 5); $c = $r->int(1, 5); $d = $r->int(1, 5); } while ($a * $d - $b * $c === 0); $det = $a * $d - $b * $c;
            return mlb_error_of($r, 'Find the first mistake in this working for the inverse of $A = \\begin{pmatrix} ' . $a . ' & ' . $b . ' \\\\ ' . $c . ' & ' . $d . ' \\end{pmatrix}$.',
                ['$\\det A = ' . $a . ' \\times ' . $d . ' - ' . $b . ' \\times ' . $c . ' = ' . $det . '$', 'Swap the diagonal and negate the others: $\\begin{pmatrix} ' . $d . ' & ' . (-$b) . ' \\\\ ' . (-$c) . ' & ' . $a . ' \\end{pmatrix}$', '$A^{-1} = \\frac{1}{' . $det . '}\\begin{pmatrix} ' . $d . ' & ' . (-$b) . ' \\\\ ' . (-$c) . ' & ' . $a . ' \\end{pmatrix}$'], [
                [1, ['$\\det A = ' . $a . ' \\times ' . $d . ' - ' . $b . ' \\times ' . $c . ' = ' . $det . '$', 'Negate the diagonal and swap the others: $\\begin{pmatrix} ' . (-$a) . ' & ' . $c . ' \\\\ ' . $b . ' & ' . (-$d) . ' \\end{pmatrix}$', '$A^{-1} = \\frac{1}{' . $det . '}\\begin{pmatrix} ' . (-$a) . ' & ' . $c . ' \\\\ ' . $b . ' & ' . (-$d) . ' \\end{pmatrix}$'], 'it is the other way round: SWAP the leading diagonal and NEGATE the other two.'],
                [2, ['$\\det A = ' . $a . ' \\times ' . $d . ' - ' . $b . ' \\times ' . $c . ' = ' . $det . '$', 'Swap the diagonal and negate the others: $\\begin{pmatrix} ' . $d . ' & ' . (-$b) . ' \\\\ ' . (-$c) . ' & ' . $a . ' \\end{pmatrix}$', '$A^{-1} = ' . $det . '\\begin{pmatrix} ' . $d . ' & ' . (-$b) . ' \\\\ ' . (-$c) . ' & ' . $a . ' \\end{pmatrix}$'], 'divide by the determinant: multiply by $\\frac{1}{' . $det . '}$, not by ' . $det . '.'],
            ]); },
        static function (MlbRng $r) { $A = 100 * $r->int(5, 20); $C = 50 * $r->int(2, 10); $a1 = $r->int(1, 3); $c1 = $r->int(2, 4); $a2 = $r->int(1, 3); $c2 = $r->int(1, 5); if ($a1 * $c2 === $a2 * $c1) $c2++;
            return mlb_typed('pair', 'A group of ' . $a1 . ' adults and ' . $c1 . ' children paid ₦' . mlb_p($a1 * $A + $c1 * $C) . ' for a museum. Another group of ' . $a2 . ' adults and ' . $c2 . ' children paid ₦' . mlb_p($a2 * $A + $c2 * $C) . '. Find the adult and child ticket prices.', [$A, $C],
                ['$' . $a1 . 'a + ' . $c1 . 'c = ' . ($a1 * $A + $c1 * $C) . '$ and $' . $a2 . 'a + ' . $c2 . 'c = ' . ($a2 * $A + $c2 * $C) . '$.', 'Solving (by matrices or elimination): adult ₦' . mlb_p($A) . ', child ₦' . mlb_p($C) . '.'], 'Two equations, two unknowns.', 'application', 120, ['labels' => ['\\text{adult}', '\\text{child}']]); },
    ];
    $f['MC-135'] = [
        static function (MlbRng $r) { $M = [[$r->int(-3, 3), $r->int(-3, 3)], [$r->int(-3, 3), $r->int(-3, 3)]]; $x = $r->int(-5, 5); $y = $r->int(-5, 5);
            return mlb_typed('pair', 'Find the image of the point $(' . $x . ', ' . $y . ')$ under the transformation with matrix $' . mlb_mat($M) . '$.', [$M[0][0] * $x + $M[0][1] * $y, $M[1][0] * $x + $M[1][1] * $y],
                ['Multiply the matrix by the column $\\begin{pmatrix} ' . $x . ' \\\\ ' . $y . ' \\end{pmatrix}$.', '$(' . ($M[0][0] * $x + $M[0][1] * $y) . ', ' . ($M[1][0] * $x + $M[1][1] * $y) . ')$.'], 'Row by column.', 'procedure', 45, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $c = $r->int(0, 3);
            $cases = [['a reflection in the $x$-axis', '\\begin{pmatrix} 1 & 0 \\\\ 0 & -1 \\end{pmatrix}'], ['a reflection in the $y$-axis', '\\begin{pmatrix} -1 & 0 \\\\ 0 & 1 \\end{pmatrix}'], ['a reflection in the line $y = x$', '\\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\end{pmatrix}'], ['a rotation of $90^\\circ$ anticlockwise about the origin', '\\begin{pmatrix} 0 & -1 \\\\ 1 & 0 \\end{pmatrix}']];
            [$name, $m] = $cases[$c]; $wrong = []; foreach ($cases as $i => [$n, $mm]) if ($i !== $c) $wrong[] = ['$' . $mm . '$', 'That matrix gives ' . $n . '.'];
            return mlb_mcq($r, 'Which matrix represents ' . $name . '?', '$' . $m . '$', $wrong, ['The columns of the matrix are the images of $(1, 0)$ and $(0, 1)$.', 'For ' . $name . ', that gives $' . $m . '$.'], 'Where do $(1, 0)$ and $(0, 1)$ go?', 'concept', 40); },
        static function (MlbRng $r) { do { $M = [[$r->int(-4, 4), $r->int(-4, 4)], [$r->int(-4, 4), $r->int(-4, 4)]]; $d = $M[0][0] * $M[1][1] - $M[0][1] * $M[1][0]; } while ($d === 0); $A = $r->int(2, 15);
            return mlb_typed('num', 'A design with area $' . $A . '\\ \\text{cm}^2$ is transformed by the matrix $' . mlb_mat($M) . '$. What is the area of the image?', (string)($A * abs($d)),
                ['Areas are multiplied by $|\\det|$: $|' . $d . '| = ' . abs($d) . '$.', '$' . $A . ' \\times ' . abs($d) . ' = ' . ($A * abs($d)) . '\\ \\text{cm}^2$.'], 'The determinant is the area scale factor.', 'application', 45, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $k = $r->int(2, 5);
            return mlb_mcq($r, 'What does the matrix $\\begin{pmatrix} ' . $k . ' & 0 \\\\ 0 & ' . $k . ' \\end{pmatrix}$ do to a shape?', 'An enlargement, scale factor ' . $k . ', centre the origin',
                [['A stretch parallel to the $x$-axis only', 'Both coordinates are multiplied by ' . $k . ', so it is a stretch in both directions equally.'], ['A rotation', 'A rotation keeps sizes the same; this changes them.'], ['A translation by ' . $k . ' units', 'A matrix multiplies coordinates; it cannot slide a shape.']],
                ['$(x, y) \\mapsto (' . $k . 'x, ' . $k . 'y)$.', 'Every length is multiplied by ' . $k . ' from the origin: an enlargement.'], 'What happens to $(x, y)$?', 'reasoning', 30); },
    ];
    $f['MC-136'] = [
        static function (MlbRng $r) { $x = $r->int(-5, 5); $y = $r->int(-5, 5); $c = $r->int(0, 2);
            // A: reflect in x-axis, then B: rotate 90 anticlockwise  → B(A p)
            [$an, $A, $bn, $B] = [['a reflection in the $x$-axis', [[1, 0], [0, -1]], 'a rotation of $90^\\circ$ anticlockwise', [[0, -1], [1, 0]]], ['a rotation of $90^\\circ$ anticlockwise', [[0, -1], [1, 0]], 'a reflection in the $y$-axis', [[-1, 0], [0, 1]]], ['a reflection in the line $y = x$', [[0, 1], [1, 0]], 'a reflection in the $x$-axis', [[1, 0], [0, -1]]]][$c];
            $p = [$A[0][0] * $x + $A[0][1] * $y, $A[1][0] * $x + $A[1][1] * $y]; $q = [$B[0][0] * $p[0] + $B[0][1] * $p[1], $B[1][0] * $p[0] + $B[1][1] * $p[1]];
            return mlb_typed('pair', 'The point $(' . $x . ', ' . $y . ')$ is given ' . $an . ', and then ' . $bn . '. Where does it end up?', $q,
                ['First: $(' . $x . ', ' . $y . ') \\to (' . $p[0] . ', ' . $p[1] . ')$.', 'Then: $(' . $p[0] . ', ' . $p[1] . ') \\to (' . $q[0] . ', ' . $q[1] . ')$.'], 'One at a time, in the order given.', 'procedure', 60, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Transformation $A$ is applied first, and then transformation $B$. Which matrix product represents the combined transformation?', '$BA$',
                [['$AB$', 'The matrix nearest the point acts first: $B(A\\mathbf{x}) = (BA)\\mathbf{x}$.'], ['$A + B$', 'Combining transformations multiplies matrices; it does not add them.'], ['$A^{-1}B$', 'An inverse would undo $A$, not apply it.']],
                ['The point is $\\mathbf{x}$; $A$ acts first, giving $A\\mathbf{x}$; then $B$ gives $B(A\\mathbf{x})$.', 'So the single matrix is $BA$ — written right to left.'], 'Which matrix touches the point first?', 'reasoning', 40); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            return $c ? mlb_mcq($r, 'Which transformation undoes a rotation of $90^\\circ$ anticlockwise about the origin?', 'A rotation of $90^\\circ$ clockwise about the origin',
                    [['Another rotation of $90^\\circ$ anticlockwise', 'Two anticlockwise quarter-turns make a half turn, not a return.'], ['A reflection in the $x$-axis', 'A reflection flips the shape; it cannot undo a turn on its own.'], ['A rotation of $180^\\circ$', 'That would leave you a quarter-turn the other way.']],
                    ['The inverse undoes the turn: turn back the same amount.', '$90^\\circ$ clockwise (the same as $270^\\circ$ anticlockwise).'], 'Turn back.', 'concept', 30)
                : mlb_mcq($r, 'What is the inverse of a reflection in the line $y = x$?', 'The same reflection',
                    [['A reflection in $y = -x$', 'Reflecting twice in the SAME line brings every point back.'], ['A rotation of $90^\\circ$', 'A rotation cannot undo a reflection by itself.'], ['There is no inverse', 'Every reflection has an inverse: itself.']],
                    ['Reflecting in $y = x$ swaps the coordinates; swapping again puts them back.', 'So a reflection is its own inverse.'], 'Do it twice.', 'concept', 30); },
        static function (MlbRng $r) { $n = $r->int(2, 11);
            return mlb_typed('num', 'A rotation of $90^\\circ$ anticlockwise about the origin is applied ' . $n . ' times. The result is a single rotation of how many degrees anticlockwise (between $0^\\circ$ and $360^\\circ$)?', (string)((90 * $n) % 360),
                ['Rotations about the same centre add: $' . $n . ' \\times 90 = ' . (90 * $n) . '^\\circ$.', 'Remove full turns: $' . ((90 * $n) % 360) . '^\\circ$.'], 'Four quarter-turns make a full turn.', 'reasoning', 35, ['unit' => '°']); },
        static function (MlbRng $r) { $x = $r->int(1, 6); $y = $r->int(1, 6);
            return mlb_typed('pair', 'A robot arm\'s tip is at $(' . $x . ', ' . $y . ')$. It is rotated $90^\\circ$ anticlockwise about the origin and then reflected in the $x$-axis. Where is the tip?', [-$y, -$x],
                ['Rotate: $(' . $x . ', ' . $y . ') \\to (-' . $y . ', ' . $x . ')$.', 'Reflect in the $x$-axis: $(-' . $y . ', -' . $x . ')$.'], 'Apply them in order.', 'application', 50, ['labels' => ['x', 'y'], 'point' => true]); },
    ];
    $f['MC-137'] = [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3); $sx = $r->int(0, 1) ? 1 : -1; $sy = $r->int(0, 1) ? 1 : -1;
            return mlb_typed('num', 'Find the magnitude of the vector $\\begin{pmatrix} ' . ($sx * $a * $k) . ' \\\\ ' . ($sy * $b * $k) . ' \\end{pmatrix}$.', (string)($c * $k),
                ['$|\\mathbf{v}| = \\sqrt{x^2 + y^2}$.', '$\\sqrt{' . (($a * $k) ** 2) . ' + ' . (($b * $k) ** 2) . '} = ' . ($c * $k) . '$.'], 'Pythagoras on the components.', 'procedure', 40); },
        static function (MlbRng $r) { $x = $r->int(1, 12); $y = $r->int(1, 12); $th = rad2deg(atan2($y, $x));
            return mlb_typed('num', 'Find the angle the vector $\\begin{pmatrix} ' . $x . ' \\\\ ' . $y . ' \\end{pmatrix}$ makes with the positive $x$-axis, to the nearest degree.', mlb_rd($th, 0),
                ['$\\tan\\theta = \\frac{' . $y . '}{' . $x . '}$.', '$\\theta \\approx ' . mlb_rd($th, 0) . '^\\circ$.'], 'Up over across.', 'procedure', 45, ['unit' => '°', 'dp' => 0]); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->pick([10, 20, 30]);
            return mlb_typed('num', 'A plane\'s velocity is $\\begin{pmatrix} ' . ($a * $k) . ' \\\\ ' . ($b * $k) . ' \\end{pmatrix}$ km/h (east, north). What is its speed in km/h?', (string)($c * $k),
                ['Speed is the magnitude of the velocity vector.', '$\\sqrt{' . ($a * $k) . '^2 + ' . ($b * $k) . '^2} = ' . ($c * $k) . '$ km/h.'], 'Speed is the length of the velocity.', 'application', 45, ['unit' => 'km/h']); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $b = $r->int(1, 5);
            return mlb_mcq($r, 'Is $|\\mathbf{a} + \\mathbf{b}|$ always equal to $|\\mathbf{a}| + |\\mathbf{b}|$?', 'No — only when the vectors point the same way',
                [['Yes, magnitudes always add', 'Try $\\mathbf{a} = \\begin{pmatrix} ' . $a . ' \\\\ 0 \\end{pmatrix}$, $\\mathbf{b} = \\begin{pmatrix} 0 \\\\ ' . $b . ' \\end{pmatrix}$: $|\\mathbf{a} + \\mathbf{b}| = \\sqrt{' . ($a * $a + $b * $b) . '}$, not ' . ($a + $b) . '.'], ['No — it is always smaller', 'It equals the sum when they point the same way.'], ['Yes, for unit vectors', 'Two unit vectors at right angles add to length $\\sqrt{2}$, not 2.']],
                ['Vectors add head to tail; the result is the third side of a triangle.', 'A triangle\'s third side is shorter than the other two together, unless it is flat (same direction).'], 'Draw the triangle.', 'reasoning', 40); },
    ];
    $f['MC-138'] = [
        static function (MlbRng $r) { $a = [$r->int(-6, 6), $r->int(-6, 6)]; $b = [$r->int(-6, 6), $r->int(-6, 6)];
            return mlb_typed('pair', 'Find $\\mathbf{a} + \\mathbf{b}$ when $\\mathbf{a} = \\begin{pmatrix} ' . $a[0] . ' \\\\ ' . $a[1] . ' \\end{pmatrix}$ and $\\mathbf{b} = \\begin{pmatrix} ' . $b[0] . ' \\\\ ' . $b[1] . ' \\end{pmatrix}$.', [$a[0] + $b[0], $a[1] + $b[1]],
                ['Add the components.', '$\\begin{pmatrix} ' . ($a[0] + $b[0]) . ' \\\\ ' . ($a[1] + $b[1]) . ' \\end{pmatrix}$.'], 'Top with top, bottom with bottom.', 'procedure', 30, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $a = [$r->int(-5, 5), $r->int(-5, 5)]; $b = [$r->int(-5, 5), $r->int(-5, 5)]; $p = $r->int(2, 3); $q = $r->int(2, 4);
            return mlb_typed('pair', 'Find $' . $p . '\\mathbf{a} - ' . $q . '\\mathbf{b}$ when $\\mathbf{a} = \\begin{pmatrix} ' . $a[0] . ' \\\\ ' . $a[1] . ' \\end{pmatrix}$ and $\\mathbf{b} = \\begin{pmatrix} ' . $b[0] . ' \\\\ ' . $b[1] . ' \\end{pmatrix}$.', [$p * $a[0] - $q * $b[0], $p * $a[1] - $q * $b[1]],
                ['Scale each, then subtract component by component.', '$\\begin{pmatrix} ' . ($p * $a[0]) . ' - ' . ($q * $b[0] < 0 ? '(' . ($q * $b[0]) . ')' : $q * $b[0]) . ' \\\\ ' . ($p * $a[1]) . ' - ' . ($q * $b[1] < 0 ? '(' . ($q * $b[1]) . ')' : $q * $b[1]) . ' \\end{pmatrix} = \\begin{pmatrix} ' . ($p * $a[0] - $q * $b[0]) . ' \\\\ ' . ($p * $a[1] - $q * $b[1]) . ' \\end{pmatrix}$.'], 'Watch the signs when subtracting negatives.', 'procedure', 45, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $F1 = [$r->int(-8, 8), $r->int(-8, 8)]; $F2 = [$r->int(-8, 8), $r->int(-8, 8)]; $F3 = [$r->int(-8, 8), $r->int(-8, 8)];
            return mlb_typed('pair', 'Three ropes pull on a post with forces $\\begin{pmatrix} ' . $F1[0] . ' \\\\ ' . $F1[1] . ' \\end{pmatrix}$, $\\begin{pmatrix} ' . $F2[0] . ' \\\\ ' . $F2[1] . ' \\end{pmatrix}$ and $\\begin{pmatrix} ' . $F3[0] . ' \\\\ ' . $F3[1] . ' \\end{pmatrix}$ newtons. Find the resultant force.', [$F1[0] + $F2[0] + $F3[0], $F1[1] + $F2[1] + $F3[1]],
                ['The resultant is the vector sum of the forces.', '$\\begin{pmatrix} ' . ($F1[0] + $F2[0] + $F3[0]) . ' \\\\ ' . ($F1[1] + $F2[1] + $F3[1]) . ' \\end{pmatrix}$ N.'], 'Add all the $x$s, then all the $y$s.', 'application', 45, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Points $A$ and $B$ have position vectors $\\mathbf{a}$ and $\\mathbf{b}$. What is $\\overrightarrow{AB}$?', '$\\mathbf{b} - \\mathbf{a}$',
                [['$\\mathbf{a} - \\mathbf{b}$', 'That goes from $B$ to $A$ — the opposite direction.'], ['$\\mathbf{a} + \\mathbf{b}$', 'Adding gives a point beyond both, not the journey between them.'], ['$\\frac{1}{2}(\\mathbf{a} + \\mathbf{b})$', 'That is the position of the MIDPOINT.']],
                ['To go from $A$ to $B$: back to the origin ($-\\mathbf{a}$), then out to $B$ ($+\\mathbf{b}$).', '$\\overrightarrow{AB} = \\mathbf{b} - \\mathbf{a}$ — "end minus start".'], 'End minus start.', 'reasoning', 35); },
    ];
    $f['MC-139'] = [
        static function (MlbRng $r) { $a = [$r->int(-6, 6), $r->int(-6, 6)]; $b = [$r->int(-6, 6), $r->int(-6, 6)];
            return mlb_typed('num', 'Find $\\mathbf{a} \\cdot \\mathbf{b}$ when $\\mathbf{a} = \\begin{pmatrix} ' . $a[0] . ' \\\\ ' . $a[1] . ' \\end{pmatrix}$ and $\\mathbf{b} = \\begin{pmatrix} ' . $b[0] . ' \\\\ ' . $b[1] . ' \\end{pmatrix}$.', (string)($a[0] * $b[0] + $a[1] * $b[1]),
                ['$\\mathbf{a} \\cdot \\mathbf{b} = a_1b_1 + a_2b_2$.', '$(' . $a[0] . ')(' . $b[0] . ') + (' . $a[1] . ')(' . $b[1] . ') = ' . ($a[0] * $b[0] + $a[1] * $b[1]) . '$.'], 'Multiply matching components and add.', 'procedure', 35); },
        static function (MlbRng $r) { do { $a = [$r->int(-6, 6), $r->int(-6, 6)]; $b = [$r->int(-6, 6), $r->int(-6, 6)]; } while (($a[0] === 0 && $a[1] === 0) || ($b[0] === 0 && $b[1] === 0));
            $d = $a[0] * $b[0] + $a[1] * $b[1]; $th = rad2deg(acos(max(-1.0, min(1.0, $d / (sqrt($a[0] ** 2 + $a[1] ** 2) * sqrt($b[0] ** 2 + $b[1] ** 2))))));   // clamped: parallel vectors round to just past ±1
            return mlb_typed('num', 'Find the angle between $\\begin{pmatrix} ' . $a[0] . ' \\\\ ' . $a[1] . ' \\end{pmatrix}$ and $\\begin{pmatrix} ' . $b[0] . ' \\\\ ' . $b[1] . ' \\end{pmatrix}$, to the nearest degree.', mlb_rd($th, 0),
                ['$\\cos\\theta = \\frac{\\mathbf{a} \\cdot \\mathbf{b}}{|\\mathbf{a}||\\mathbf{b}|} = \\frac{' . $d . '}{\\sqrt{' . ($a[0] ** 2 + $a[1] ** 2) . '}\\sqrt{' . ($b[0] ** 2 + $b[1] ** 2) . '}}$.', '$\\theta \\approx ' . mlb_rd($th, 0) . '^\\circ$.'], 'Dot product over the product of lengths.', 'procedure', 90, ['unit' => '°', 'dp' => 0]); },
        static function (MlbRng $r) { $p = $r->nz(-5, 5); $q = $r->nz(-5, 5); $m = $r->nz(-4, 4); $k = $q * $m; $s = -$p * $m;
            return mlb_typed('num', 'Find $k$ so that $\\begin{pmatrix} k \\\\ ' . $s . ' \\end{pmatrix}$ is perpendicular to $\\begin{pmatrix} ' . $p . ' \\\\ ' . $q . ' \\end{pmatrix}$.', (string)$k,
                ['Perpendicular vectors have a dot product of zero.', '$' . $p . 'k + (' . $q . ')(' . $s . ') = 0$, so $' . $p . 'k = ' . (-$q * $s) . '$ and $k = ' . $k . '$.'], 'Set the dot product to zero.', 'reasoning', 50); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Two non-zero vectors have a dot product of 0. What does that tell you?', 'They are perpendicular',
                [['They are parallel', 'Parallel vectors have $|\\mathbf{a} \\cdot \\mathbf{b}| = |\\mathbf{a}||\\mathbf{b}|$, as large as possible.'], ['One of them must be the zero vector', 'They are non-zero; the cosine of the angle between them is zero.'], ['They have the same length', 'The dot product being zero says nothing about length.']],
                ['$\\mathbf{a} \\cdot \\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta = 0$ with both lengths non-zero.', 'So $\\cos\\theta = 0$ and $\\theta = 90^\\circ$.'], 'What angle has cosine zero?', 'concept', 30); },
        static function (MlbRng $r) { $F = [$r->int(1, 9), $r->int(-5, 9)]; $d = [$r->int(1, 12), $r->int(-5, 10)];
            return mlb_typed('num', 'A force $\\mathbf{F} = \\begin{pmatrix} ' . $F[0] . ' \\\\ ' . $F[1] . ' \\end{pmatrix}$ N moves a crate through a displacement $\\mathbf{d} = \\begin{pmatrix} ' . $d[0] . ' \\\\ ' . $d[1] . ' \\end{pmatrix}$ m. The work done is $\\mathbf{F} \\cdot \\mathbf{d}$. Find it in joules.', (string)($F[0] * $d[0] + $F[1] * $d[1]),
                ['Work $= \\mathbf{F} \\cdot \\mathbf{d}$.', '$' . $F[0] . ' \\times ' . $d[0] . ' + ' . $F[1] . ' \\times ' . $d[1] . ' = ' . ($F[0] * $d[0] + $F[1] * $d[1]) . '$ J.'], 'Only the part of the force along the motion does work.', 'application', 45, ['unit' => 'J']); },
    ];
    $f['MC-140'] = [
        static function (MlbRng $r) { $F = $r->int(5, 80); $th = $r->int(10, 80);
            return mlb_typed('num', 'A force of $' . $F . '$ N acts at $' . mlb_deg($th) . '$ above the horizontal. Find its horizontal component, to 1 decimal place.', mlb_rd($F * cos(deg2rad($th)), 1),
                ['Horizontal component $= F\\cos\\theta$.', '$' . $F . '\\cos ' . $th . '^\\circ \\approx ' . mlb_rd($F * cos(deg2rad($th)), 1) . '$ N.'], 'Adjacent to the angle: cosine.', 'procedure', 45, ['unit' => 'N', 'dp' => 1]); },
        static function (MlbRng $r) { $F = $r->int(5, 80); $th = $r->int(10, 80);
            return mlb_typed('num', 'A force of $' . $F . '$ N acts at $' . mlb_deg($th) . '$ above the horizontal. Find its vertical component, to 1 decimal place.', mlb_rd($F * sin(deg2rad($th)), 1),
                ['Vertical component $= F\\sin\\theta$.', '$' . $F . '\\sin ' . $th . '^\\circ \\approx ' . mlb_rd($F * sin(deg2rad($th)), 1) . '$ N.'], 'Opposite the angle: sine.', 'procedure', 45, ['unit' => 'N', 'dp' => 1]); },
        static function (MlbRng $r) { $F1 = [$r->int(-9, 9), $r->int(-9, 9)]; $F2 = [$r->int(-9, 9), $r->int(-9, 9)];
            return mlb_typed('pair', 'Forces $\\begin{pmatrix} ' . $F1[0] . ' \\\\ ' . $F1[1] . ' \\end{pmatrix}$ N and $\\begin{pmatrix} ' . $F2[0] . ' \\\\ ' . $F2[1] . ' \\end{pmatrix}$ N act on a particle. What third force keeps it in equilibrium?', [-($F1[0] + $F2[0]), -($F1[1] + $F2[1])],
                ['In equilibrium the forces add to zero.', 'Third force $= -\\begin{pmatrix} ' . ($F1[0] + $F2[0]) . ' \\\\ ' . ($F1[1] + $F2[1]) . ' \\end{pmatrix} = \\begin{pmatrix} ' . (-($F1[0] + $F2[0])) . ' \\\\ ' . (-($F1[1] + $F2[1])) . ' \\end{pmatrix}$ N.'], 'Balance the resultant.', 'reasoning', 50, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $W = 10 * $r->int(2, 20); $th = $r->int(10, 50);
            return mlb_typed('num', 'A box of weight $' . $W . '$ N rests on a slope at $' . mlb_deg($th) . '$ to the horizontal. Find the component of its weight acting down the slope, to 1 decimal place.', mlb_rd($W * sin(deg2rad($th)), 1),
                ['Down the slope, the weight\'s component is $W\\sin\\theta$ (into the slope it is $W\\cos\\theta$).', '$' . $W . '\\sin ' . $th . '^\\circ \\approx ' . mlb_rd($W * sin(deg2rad($th)), 1) . '$ N.'], 'The steeper the slope, the bigger the pull down it.', 'application', 60, ['unit' => 'N', 'dp' => 1]); },
        static function (MlbRng $r) { $F = $r->int(10, 60);
            return mlb_mcq($r, 'A force of $' . $F . '$ N acts straight upwards. What is its component in the horizontal direction?', '0 N',
                [[$F . ' N', 'That is the whole force; none of it acts sideways.'], [mlb_rd($F * cos(deg2rad(45)), 1) . ' N', 'That would be for a force at 45°.'], [($F / 2) . ' N', 'Halving has nothing to do with resolving.']],
                ['Component $= F\\cos 90^\\circ$.', '$\\cos 90^\\circ = 0$, so there is no horizontal component.'], 'A vertical force has no sideways part.', 'reasoning', 25); },
    ];

    /* ══ Stage 15 · Advanced Trigonometry and Analytic Geometry ══════════ */
    $f['MC-141'] = [
        static function (MlbRng $r) { $d = $r->pick([30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360, 15, 75]);
            return mlb_typed('frac', 'Write $' . mlb_deg($d) . '$ in radians as $k\\pi$. What is $k$, as a fraction?', mlb_frac($d, 180),
                ['$180^\\circ = \\pi$ radians, so multiply by $\\frac{\\pi}{180}$.', '$' . $d . ' \\times \\frac{\\pi}{180} = ' . mlb_ftex($d, 180) . '\\pi$.'], '$180^\\circ = \\pi$.', 'procedure', 35); },
        static function (MlbRng $r) { $rad = $r->int(3, 20); $th = $r->pick([0.5, 0.8, 1.2, 1.5, 2, 2.5]);
            return mlb_typed('num', 'An arc of a circle of radius $' . $rad . '$ cm subtends an angle of $' . mlb_dec($th) . '$ radians at the centre. Find the arc length in cm.', mlb_dec($rad * $th),
                ['In radians, arc length $s = r\\theta$.', '$s = ' . $rad . ' \\times ' . mlb_dec($th) . ' = ' . mlb_dec($rad * $th) . '$ cm.'], 'No 360 needed in radians.', 'procedure', 30, ['unit' => 'cm']); },
        static function (MlbRng $r) { $rad = 2 * $r->int(2, 10); $th = $r->pick([0.5, 1, 1.5, 2, 2.5]);
            return mlb_typed('num', 'Find the area of a sector of radius $' . $rad . '$ cm with angle $' . mlb_dec($th) . '$ radians, in $\\text{cm}^2$.', mlb_dec($rad * $rad * $th / 2),
                ['Sector area $= \\frac{1}{2}r^2\\theta$ in radians.', '$\\frac{1}{2} \\times ' . ($rad * $rad) . ' \\times ' . mlb_dec($th) . ' = ' . mlb_dec($rad * $rad * $th / 2) . '\\ \\text{cm}^2$.'], 'Half, r squared, theta.', 'procedure', 35, ['unit' => 'cm²']); },
        static function (MlbRng $r) { $L = $r->int(50, 200); $deg = $r->pick([10, 15, 20, 30, 40]); $s = $L * deg2rad($deg);
            return mlb_typed('num', 'A pendulum $' . $L . '$ cm long swings through an angle of $' . mlb_deg($deg) . '$. How far does its tip travel along the arc, to 1 decimal place (cm)?', mlb_rd($s, 1),
                ['Change to radians: $' . $deg . ' \\times \\frac{\\pi}{180} = ' . mlb_rd(deg2rad($deg), 4) . '$ rad.', '$s = r\\theta = ' . $L . ' \\times ' . mlb_rd(deg2rad($deg), 4) . ' \\approx ' . mlb_rd($s, 1) . '$ cm.'], 'Radians first, then $s = r\\theta$.', 'application', 60, ['unit' => 'cm', 'dp' => 1]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'What is one radian?', 'The angle at the centre when the arc length equals the radius',
                [['The same as one degree', 'One radian is about $57.3^\\circ$ — much bigger than a degree.'], ['The angle in a full turn', 'A full turn is $2\\pi$ radians.'], ['The angle when the arc equals the diameter', 'Arc equal to the RADIUS, not the diameter.']],
                ['Radians measure angle by arc length: $\\theta = \\frac{s}{r}$.', 'When $s = r$, $\\theta = 1$ radian $\\approx 57.3^\\circ$.'], 'Arc over radius.', 'concept', 30); },
        static function (MlbRng $r) { do { $r1 = $r->int(2, 9); $t1 = $r->pick([0.5, 1, 1.5, 2, 2.5, 3]); $r2 = $r->int(2, 9); $t2 = $r->pick([0.5, 1, 1.5, 2, 2.5, 3]); } while ($r1 === $r2 && $t1 == $t2);
            $s1 = $r1 * $t1; $s2 = $r2 * $t2; $right = abs($s1 - $s2) < 1e-9 ? 'They are the same length' : ($s1 > $s2 ? 'Arc A' : 'Arc B');
            $wrong = []; foreach (['Arc A', 'Arc B', 'They are the same length'] as $t) if ($t !== $right) $wrong[] = [$t, 'Compare $s = r\\theta$: A is $' . mlb_dec($s1) . '$, B is $' . mlb_dec($s2) . '$.'];
            $wrong[] = ['The one with the bigger angle', 'Angle alone does not decide it — the radius multiplies it.'];
            return mlb_mcq($r, 'Arc A: radius $' . $r1 . '$ cm, angle $' . mlb_dec($t1) . '$ rad. Arc B: radius $' . $r2 . '$ cm, angle $' . mlb_dec($t2) . '$ rad. Which arc is longer?', $right, $wrong,
                ['Arc length $s = r\\theta$ depends on BOTH the radius and the angle.', 'A: $' . mlb_dec($s1) . '$ cm; B: $' . mlb_dec($s2) . '$ cm.'], 'Work out both, do not guess from one number.', 'reasoning', 40); },
    ];
    $f['MC-142'] = [
        static function (MlbRng $r) { $q = $r->int(1, 4); $th = [0, $r->int(10, 80), $r->int(100, 170), $r->int(190, 260), $r->int(280, 350)][$q]; $fn = $r->pick(['sin', 'cos', 'tan']);
            $pos = ['sin' => [1, 2], 'cos' => [1, 4], 'tan' => [1, 3]][$fn]; $right = in_array($q, $pos, true) ? 'Positive' : 'Negative';
            return mlb_mcq($r, 'Is $\\' . $fn . ' ' . mlb_deg($th) . '$ positive or negative?', $right,
                [[$right === 'Positive' ? 'Negative' : 'Positive', 'CAST (or "All Students Take Calculus"): all positive in the 1st quadrant, sin in the 2nd, tan in the 3rd, cos in the 4th.'], ['Zero', 'It is zero only on the axes ($0^\\circ$, $90^\\circ$, $180^\\circ$…).']],
                ['$' . $th . '^\\circ$ is in quadrant ' . $q . '.', 'In quadrant ' . $q . ', $\\' . $fn . '$ is ' . mb_strtolower($right) . '.'], 'Which quadrant? Then CAST.', 'concept', 30); },
        static function (MlbRng $r) { $c = $r->pick([['\\sin 150^\\circ', 1, 2], ['\\sin 210^\\circ', -1, 2], ['\\sin 330^\\circ', -1, 2], ['\\cos 120^\\circ', -1, 2], ['\\cos 240^\\circ', -1, 2], ['\\cos 300^\\circ', 1, 2], ['\\tan 135^\\circ', -1, 1], ['\\tan 225^\\circ', 1, 1], ['\\tan 315^\\circ', -1, 1]]);
            return mlb_typed('frac', 'Find the exact value of $' . $c[0] . '$.', mlb_frac($c[1], $c[2]),
                ['Find the reference angle (to the $x$-axis) and the sign from the quadrant.', '$' . $c[0] . ' = ' . mlb_ftex($c[1], $c[2]) . '$.'], 'Reference angle, then the sign.', 'procedure', 45); },
        static function (MlbRng $r) { $th = $r->pick([$r->int(91, 179), $r->int(181, 269), $r->int(271, 359)]); $ref = $th < 180 ? 180 - $th : ($th < 270 ? $th - 180 : 360 - $th);
            return mlb_typed('num', 'What is the reference angle (the acute angle to the $x$-axis) for $' . mlb_deg($th) . '$?', (string)$ref,
                ['Measure to the nearest part of the $x$-axis ($180^\\circ$ or $360^\\circ$).', 'The reference angle is $' . $ref . '^\\circ$.'], 'How far from the horizontal axis?', 'procedure', 30, ['unit' => '°']); },
        static function (MlbRng $r) { $R = $r->int(10, 40); $c = $R + $r->int(1, 5); $th = $r->pick([60, 120, 150, 210, 240, 300]); $h = $c - $R * cos(deg2rad($th));
            return mlb_typed('num', 'A Ferris wheel of radius $' . $R . '$ m has its centre $' . $c . '$ m above the ground. A seat that started at the bottom has turned through $' . mlb_deg($th) . '$; its height is $h = ' . $c . ' - ' . $R . '\\cos\\theta$. Find $h$, to 1 decimal place.', mlb_rd($h, 1),
                ['$\\cos ' . $th . '^\\circ = ' . mlb_rd(cos(deg2rad($th)), 3) . '$ (mind the sign beyond $90^\\circ$).', '$h = ' . $c . ' - ' . $R . ' \\times (' . mlb_rd(cos(deg2rad($th)), 3) . ') \\approx ' . mlb_rd($h, 1) . '$ m.'], 'Cosine is negative past 90°, which lifts the seat above the centre.', 'application', 70, ['unit' => 'm', 'dp' => 1]); },
        static function (MlbRng $r) { $c = $r->pick([[150, '\\sin', 30, '\\frac{1}{2}', 'positive'], [120, '\\cos', 60, '-\\frac{1}{2}', 'negative'], [210, '\\sin', 30, '-\\frac{1}{2}', 'negative']]);
            [$th, $fn, $ref, $val, $sg] = $c; $wrongVal = str_starts_with($val, '-') ? substr($val, 1) : '-' . $val;
            return mlb_error_of($r, 'Find the first mistake in this working for $' . $fn . ' ' . mlb_deg($th) . '$.', ['Reference angle: $' . mlb_deg($ref) . '$', 'In this quadrant ' . $fn . ' is ' . $sg, '$' . $fn . ' ' . $th . '^\\circ = ' . $val . '$'], [
                [1, ['Reference angle: $' . mlb_deg($ref) . '$', 'In this quadrant ' . $fn . ' is ' . ($sg === 'positive' ? 'negative' : 'positive'), '$' . $fn . ' ' . $th . '^\\circ = ' . $wrongVal . '$'], 'the sign comes from the quadrant (CAST): here ' . $fn . ' is ' . $sg . '.'],
                [0, ['Reference angle: $' . mlb_deg($th - 90) . '$', 'In this quadrant ' . $fn . ' is ' . $sg, '$' . $fn . ' ' . $th . '^\\circ = ' . $fn . ' ' . ($th - 90) . '^\\circ$'], 'the reference angle is measured to the $x$-axis, not the $y$-axis: $' . mlb_deg($ref) . '$.'],
            ]); },
    ];
    $f['MC-143'] = [
        static function (MlbRng $r) { [$o, $a, $h] = $r->pick(MLB_TRIPLES);
            return mlb_typed('frac', '$\\theta$ is acute and $\\sin\\theta = ' . mlb_ftex($o, $h) . '$. Find $\\cos\\theta$.', mlb_frac($a, $h),
                ['$\\cos^2\\theta = 1 - \\sin^2\\theta = 1 - ' . mlb_ftex($o * $o, $h * $h) . ' = ' . mlb_ftex($a * $a, $h * $h) . '$.', 'Acute, so positive: $\\cos\\theta = ' . mlb_ftex($a, $h) . '$.'], '$\\sin^2 + \\cos^2 = 1$.', 'procedure', 45); },
        static function (MlbRng $r) { [$o, $a, $h] = $r->pick(MLB_TRIPLES); $w = $r->int(0, 2);
            [$name, $num, $den] = [['\\sec\\theta', $h, $a], ['\\csc\\theta', $h, $o], ['\\cot\\theta', $a, $o]][$w];
            return mlb_typed('frac', '$\\theta$ is acute and $\\tan\\theta = ' . mlb_ftex($o, $a) . '$. Find $' . $name . '$.', mlb_frac($num, $den),
                ['Draw a right triangle with opposite $' . $o . '$, adjacent $' . $a . '$; the hypotenuse is $' . $h . '$.', '$\\sec = \\frac{1}{\\cos}$, $\\csc = \\frac{1}{\\sin}$, $\\cot = \\frac{1}{\\tan}$: $' . $name . ' = ' . mlb_ftex($num, $den) . '$.'], 'Sketch the triangle.', 'procedure', 55); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            [$e, $right, $w] = [['1 - \\cos^2\\theta', '$\\sin^2\\theta$', [['$\\cos^2\\theta$', 'That is $1 - \\sin^2\\theta$.'], ['$1 - \\cos\\theta$', 'The squares do not cancel like that.'], ['$\\tan^2\\theta$', '$1 + \\tan^2\\theta = \\sec^2\\theta$ is a different identity.']]],
                                 ['\\frac{\\sin\\theta}{\\cos\\theta}', '$\\tan\\theta$', [['$\\cot\\theta$', 'That is cosine over sine.'], ['$1$', 'Only when $\\theta = 45^\\circ$.'], ['$\\sec\\theta$', 'Secant is $\\frac{1}{\\cos\\theta}$.']]],
                                 ['1 + \\tan^2\\theta', '$\\sec^2\\theta$', [['$\\csc^2\\theta$', 'That is $1 + \\cot^2\\theta$.'], ['$1$', 'That is $\\sin^2\\theta + \\cos^2\\theta$.'], ['$\\tan^2\\theta + 1^2 = \\tan\\theta + 1$', 'Squares do not "undo" like that.']]]][$c];
            return mlb_mcq($r, 'Simplify $' . $e . '$.', $right, $w, ['From $\\sin^2\\theta + \\cos^2\\theta = 1$ (divide through by $\\cos^2\\theta$ for the tan form).', '$' . $e . ' = ' . trim($right, '$') . '$.'], 'Start from $\\sin^2 + \\cos^2 = 1$.', 'concept', 35); },
        static function (MlbRng $r) { [$o, $a, $h] = $r->pick(MLB_TRIPLES);
            return mlb_typed('frac', 'A roof rises $' . $o . '$ m over a horizontal run of $' . $a . '$ m. If $\\theta$ is its angle with the horizontal, find $\\cos\\theta$ exactly.', mlb_frac($a, $h),
                ['$\\tan\\theta = \\frac{' . $o . '}{' . $a . '}$, so the sloping length is $\\sqrt{' . ($o * $o) . ' + ' . ($a * $a) . '} = ' . $h . '$ m.', '$\\cos\\theta = \\frac{' . $a . '}{' . $h . '}$.'], 'Find the hypotenuse first.', 'application', 50); },
        static function (MlbRng $r) { [$o, $a, $h] = $r->pick(MLB_TRIPLES);
            return mlb_error_of($r, '$\\theta$ is acute and $\\sin\\theta = ' . mlb_ftex($o, $h) . '$. Find the first mistake in this working for $\\cos\\theta$.',
                ['$\\cos^2\\theta = 1 - \\sin^2\\theta$', '$= 1 - ' . mlb_ftex($o * $o, $h * $h) . ' = ' . mlb_ftex($a * $a, $h * $h) . '$', '$\\cos\\theta = ' . mlb_ftex($a, $h) . '$'], [
                [0, ['$\\cos\\theta = 1 - \\sin\\theta$', '$= 1 - ' . mlb_ftex($o, $h) . '$', '$\\cos\\theta = ' . mlb_ftex($h - $o, $h) . '$'], 'the identity is for SQUARES: $\\sin^2\\theta + \\cos^2\\theta = 1$, not $\\sin\\theta + \\cos\\theta = 1$.'],
                [2, ['$\\cos^2\\theta = 1 - \\sin^2\\theta$', '$= 1 - ' . mlb_ftex($o * $o, $h * $h) . ' = ' . mlb_ftex($a * $a, $h * $h) . '$', '$\\cos\\theta = ' . mlb_ftex($a * $a, $h * $h) . '$'], 'that is $\\cos^2\\theta$; take the square root.'],
            ]); },
    ];
    $f['MC-144'] = [
        static function (MlbRng $r) { [$a1, $b1, $c1] = $r->pick(MLB_TRIPLES); [$a2, $b2, $c2] = $r->pick(MLB_TRIPLES); $plus = $r->int(0, 1) === 1;
            // sinA = a1/c1, cosA = b1/c1; sinB = a2/c2, cosB = b2/c2
            $num = $a1 * $b2 + ($plus ? 1 : -1) * $b1 * $a2;
            return mlb_typed('frac', '$A$ and $B$ are acute, with $\\sin A = ' . mlb_ftex($a1, $c1) . '$ and $\\sin B = ' . mlb_ftex($a2, $c2) . '$. Find $\\sin(A ' . ($plus ? '+' : '-') . ' B)$ exactly.', mlb_frac($num, $c1 * $c2),
                ['$\\cos A = ' . mlb_ftex($b1, $c1) . '$ and $\\cos B = ' . mlb_ftex($b2, $c2) . '$ (from the triangles).', '$\\sin(A ' . ($plus ? '+' : '-') . ' B) = \\sin A\\cos B ' . ($plus ? '+' : '-') . ' \\cos A\\sin B = \\frac{' . ($a1 * $b2) . ' ' . ($plus ? '+' : '-') . ' ' . ($b1 * $a2) . '}{' . ($c1 * $c2) . '} = ' . mlb_ftex($num, $c1 * $c2) . '$.'], 'Find both cosines first.', 'procedure', 90); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $w = $r->int(0, 1);
            return $w ? mlb_typed('frac', '$A$ is acute and $\\sin A = ' . mlb_ftex($a, $c) . '$. Find $\\sin 2A$ exactly.', mlb_frac(2 * $a * $b, $c * $c),
                    ['$\\cos A = ' . mlb_ftex($b, $c) . '$ and $\\sin 2A = 2\\sin A\\cos A$.', '$2 \\times ' . mlb_ftex($a, $c) . ' \\times ' . mlb_ftex($b, $c) . ' = ' . mlb_ftex(2 * $a * $b, $c * $c) . '$.'], 'Double-angle formula.', 'procedure', 60)
                : mlb_typed('frac', '$A$ is acute and $\\sin A = ' . mlb_ftex($a, $c) . '$. Find $\\cos 2A$ exactly.', mlb_frac($c * $c - 2 * $a * $a, $c * $c),
                    ['$\\cos 2A = 1 - 2\\sin^2 A$.', '$1 - 2 \\times ' . mlb_ftex($a * $a, $c * $c) . ' = ' . mlb_ftex($c * $c - 2 * $a * $a, $c * $c) . '$.'], 'Use the form with $\\sin^2$.', 'procedure', 60); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Is $\\sin(A + B) = \\sin A + \\sin B$ true for all angles?', 'No — $\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B$',
                [['Yes, sine distributes over addition', 'Try $A = B = 90^\\circ$: $\\sin 180^\\circ = 0$, but $\\sin 90^\\circ + \\sin 90^\\circ = 2$.'], ['Yes, for acute angles', '$A = B = 45^\\circ$: $\\sin 90^\\circ = 1$ but $2\\sin 45^\\circ \\approx 1.41$.'], ['Only when $A = B$', 'Even then it fails, as $45^\\circ + 45^\\circ$ shows.']],
                ['A single counter-example disproves a general rule.', 'The correct expansion is $\\sin A\\cos B + \\cos A\\sin B$.'], 'Test a pair of angles.', 'reasoning', 40); },
        static function (MlbRng $r) { [$ang, $split, $exp, $key, $l2] = $r->pick([
                ['\\sin 75^\\circ', '75 = 45 + 30', '\\sin 45\\cos 30 + \\cos 45\\sin 30', 'sqrt(6)/4+sqrt(2)/4', '\\frac{\\sqrt{6} + \\sqrt{2}}{4}'],
                ['\\cos 15^\\circ', '15 = 45 - 30', '\\cos 45\\cos 30 + \\sin 45\\sin 30', 'sqrt(6)/4+sqrt(2)/4', '\\frac{\\sqrt{6} + \\sqrt{2}}{4}'],
                ['\\sin 15^\\circ', '15 = 45 - 30', '\\sin 45\\cos 30 - \\cos 45\\sin 30', 'sqrt(6)/4-sqrt(2)/4', '\\frac{\\sqrt{6} - \\sqrt{2}}{4}'],
                ['\\cos 75^\\circ', '75 = 45 + 30', '\\cos 45\\cos 30 - \\sin 45\\sin 30', 'sqrt(6)/4-sqrt(2)/4', '\\frac{\\sqrt{6} - \\sqrt{2}}{4}']]);
            return mlb_typed('expr', 'A surveyor needs $' . $ang . '$ exactly, using $' . $split . '$. Write it with sqrt( ).', $key,
                ['$' . $ang . ' = ' . $exp . '$, with $\\sin 45 = \\cos 45 = \\frac{\\sqrt{2}}{2}$, $\\cos 30 = \\frac{\\sqrt{3}}{2}$, $\\sin 30 = \\frac{1}{2}$.', '$= ' . $l2 . '$.'], 'Split it into special angles.', 'application', 80); },
    ];
    $f['MC-145'] = [
        static function (MlbRng $r) { [$eq, $s1, $s2] = $r->pick([['\\sin x = \\frac{1}{2}', 30, 150], ['\\sin x = \\frac{\\sqrt{3}}{2}', 60, 120], ['\\sin x = -\\frac{1}{2}', 210, 330], ['\\cos x = \\frac{1}{2}', 60, 300], ['\\cos x = -\\frac{1}{2}', 120, 240], ['\\tan x = 1', 45, 225], ['\\tan x = -1', 135, 315], ['\\tan x = \\sqrt{3}', 60, 240], ['\\cos x = 0', 90, 270]]);
            $big = $r->int(0, 1) === 1;
            return mlb_typed('num', 'Solve $' . $eq . '$ for $0^\\circ \\le x \\le 360^\\circ$. Give the ' . ($big ? 'larger' : 'smaller') . ' solution.', (string)($big ? $s2 : $s1),
                ['Find the reference angle from the special values, then the quadrants where the sign fits.', 'The solutions are $' . $s1 . '^\\circ$ and $' . $s2 . '^\\circ$.'], 'Two solutions in a full turn — use CAST.', 'procedure', 60, ['unit' => '°']); },
        static function (MlbRng $r) { $a = $r->int(1, 9); $b = $r->pick([1, 2, 3, 4, 5, 6]); $w = $r->int(0, 1);
            return $w ? mlb_typed('num', 'What is the period of $y = ' . $a . '\\sin ' . $b . 'x$, in degrees?', (string)(360 / $b),
                    ['$\\sin x$ repeats every $360^\\circ$; $\\sin ' . $b . 'x$ repeats ' . $b . ' times as fast.', 'Period $= \\frac{360}{' . $b . '} = ' . (360 / $b) . '^\\circ$.'], 'The number with $x$ squeezes the graph.', 'procedure', 30, ['unit' => '°'])
                : mlb_typed('num', 'What is the amplitude of $y = ' . $a . '\\sin ' . $b . 'x$?', (string)$a,
                    ['The amplitude is the size of the number in front.', 'It goes up to $' . $a . '$ and down to $-' . $a . '$: amplitude $' . $a . '$.'], 'How high does it go?', 'procedure', 25); },
        static function (MlbRng $r) { $c = $r->int(0, 2); $k = [mlb_ftex($r->int(1, 4), 5), '1', mlb_ftex($r->int(6, 9), 5)][$c]; $right = ['2', '1', '0'][$c];
            $wrong = []; foreach (['2', '1', '0'] as $t) if ($t !== $right) $wrong[] = [$t, 'Picture the line $y = ' . $k . '$ across one cycle of the sine wave, which lies between −1 and 1.'];
            $wrong[] = ['Infinitely many', 'Within one turn the wave is crossed only a few times.'];
            return mlb_mcq($r, 'How many solutions does $\\sin x = ' . $k . '$ have for $0^\\circ \\le x < 360^\\circ$?', $right, $wrong,
                ['$\\sin x$ takes values from $-1$ to $1$ and reaches $1$ only at $90^\\circ$.', $c === 0 ? 'A value between 0 and 1 is met twice (quadrants 1 and 2).' : ($c === 1 ? 'The value 1 is met once, at $90^\\circ$.' : 'A value above 1 is never reached.')], 'Sketch the wave and the line.', 'reasoning', 40); },
        static function (MlbRng $r) { $m = $r->int(2, 5); $a = $r->int(1, $m - 1); $w = $r->int(0, 1);
            return mlb_typed('num', 'The depth of water in a harbour is modelled by $d = ' . $m . ' + ' . $a . '\\sin(30t)^\\circ$ metres, $t$ hours after midnight. What is the ' . ($w ? 'greatest' : 'least') . ' depth?', (string)($w ? $m + $a : $m - $a),
                ['$\\sin$ ranges from $-1$ to $1$.', $w ? 'Greatest: $' . $m . ' + ' . $a . ' = ' . ($m + $a) . '$ m.' : 'Least: $' . $m . ' - ' . $a . ' = ' . ($m - $a) . '$ m.'], 'When is the sine largest or smallest?', 'application', 40, ['unit' => 'm']); },
    ];
    $f['MC-146'] = [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 2);
            return mlb_typed('num', 'Write $' . ($a * $k) . '\\sin x + ' . ($b * $k) . '\\cos x$ in the form $R\\sin(x + \\alpha)$. Find $R$.', (string)($c * $k),
                ['$R = \\sqrt{a^2 + b^2}$.', '$\\sqrt{' . (($a * $k) ** 2) . ' + ' . (($b * $k) ** 2) . '} = ' . ($c * $k) . '$.'], 'Pythagoras on the coefficients.', 'procedure', 45); },
        static function (MlbRng $r) { $a = $r->int(1, 9); $b = $r->int(1, 9); $al = rad2deg(atan($b / $a));
            return mlb_typed('num', 'Write $' . $a . '\\sin x + ' . $b . '\\cos x$ as $R\\sin(x + \\alpha)$ with $0^\\circ < \\alpha < 90^\\circ$. Find $\\alpha$ to 1 decimal place.', mlb_rd($al, 1),
                ['$R\\cos\\alpha = ' . $a . '$ and $R\\sin\\alpha = ' . $b . '$, so $\\tan\\alpha = \\frac{' . $b . '}{' . $a . '}$.', '$\\alpha \\approx ' . mlb_rd($al, 1) . '^\\circ$.'], 'Divide the two equations.', 'procedure', 60, ['unit' => '°', 'dp' => 1]); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES);
            return mlb_mcq($r, 'What is the greatest value of $' . $a . '\\sin x + ' . $b . '\\cos x$?', (string)$c,
                [[(string)($a + $b), 'The two parts never reach their maxima at the same $x$; the maximum is $\\sqrt{' . $a . '^2 + ' . $b . '^2}$.'], [(string)($c * $c), 'That is $R^2$; the maximum is $R$.'], [(string)max($a, $b), 'The combination is bigger than either part alone.']],
                ['$' . $a . '\\sin x + ' . $b . '\\cos x = ' . $c . '\\sin(x + \\alpha)$.', 'The sine is at most 1, so the greatest value is $' . $c . '$.'], 'Write it as one sine wave.', 'reasoning', 40); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->pick([10, 20, 30]);
            return mlb_typed('num', 'An alternating voltage is $V = ' . ($a * $k) . '\\sin\\omega t + ' . ($b * $k) . '\\cos\\omega t$ volts. What is its peak voltage?', (string)($c * $k),
                ['Combine into a single wave: $R = \\sqrt{' . ($a * $k) . '^2 + ' . ($b * $k) . '^2}$.', 'Peak $= R = ' . ($c * $k) . '$ V.'], 'The peak is the amplitude $R$.', 'application', 50, ['unit' => 'V']); },
    ];
    $f['MC-147'] = [
        static function (MlbRng $r) { $a = $r->int(-8, 8); $b = $r->int(-8, 8); $rad = $r->int(1, 9);
            return mlb_typed('pair', 'Find the centre of the circle $(x ' . ($a < 0 ? '+ ' . (-$a) : '- ' . $a) . ')^2 + (y ' . ($b < 0 ? '+ ' . (-$b) : '- ' . $b) . ')^2 = ' . ($rad * $rad) . '$.', [$a, $b],
                ['$(x - a)^2 + (y - b)^2 = r^2$ has centre $(a, b)$ — the signs change.', 'Centre $(' . $a . ', ' . $b . ')$, radius $' . $rad . '$.'], 'Read off with the opposite signs.', 'procedure', 30, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $a = $r->int(-6, 6); $b = $r->int(-6, 6); $rad = $r->int(1, 9); $F = $a * $a + $b * $b - $rad * $rad;
            return mlb_typed('num', 'Find the radius of the circle $x^2 + y^2 ' . mlb_sterm(-2 * $a, 'x') . mlb_sterm(-2 * $b, 'y') . mlb_sterm($F) . ' = 0$.', (string)$rad,
                ['Complete the squares: centre $(' . $a . ', ' . $b . ')$.', '$r^2 = ' . $a . '^2 + ' . $b . '^2 - (' . $F . ') = ' . ($rad * $rad) . '$, so $r = ' . $rad . '$.'], 'Centre is minus half the $x$ and $y$ coefficients.', 'procedure', 60); },
        static function (MlbRng $r) { $a = $r->int(-6, 6); $b = $r->int(-6, 6); $rad = $r->int(2, 8); $F = $a * $a + $b * $b - $rad * $rad;
            return mlb_typed('pair', 'Find the centre of $x^2 + y^2 ' . mlb_sterm(-2 * $a, 'x') . mlb_sterm(-2 * $b, 'y') . mlb_sterm($F) . ' = 0$.', [$a, $b],
                ['For $x^2 + y^2 + 2gx + 2fy + c = 0$, the centre is $(-g, -f)$.', 'Here $2g = ' . (-2 * $a) . '$, $2f = ' . (-2 * $b) . '$, so the centre is $(' . $a . ', ' . $b . ')$.'], 'Halve and change sign.', 'procedure', 45, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $rad = $r->int(3, 9); [$x, $y] = $r->pick([[0, $rad], [$rad - 1, 1], [$rad, 2], [1, 1]]); $d2 = $x * $x + $y * $y;
            $right = $d2 < $rad * $rad ? 'Inside' : ($d2 === $rad * $rad ? 'On the circle' : 'Outside');
            $wrong = []; foreach (['Inside', 'On the circle', 'Outside'] as $t) if ($t !== $right) $wrong[] = [$t, 'Compare $x^2 + y^2 = ' . $d2 . '$ with $r^2 = ' . ($rad * $rad) . '$.'];
            return mlb_mcq($r, 'Is the point $(' . $x . ', ' . $y . ')$ inside, on, or outside the circle $x^2 + y^2 = ' . ($rad * $rad) . '$?', $right, $wrong,
                ['$' . $x . '^2 + ' . $y . '^2 = ' . $d2 . '$ and $r^2 = ' . ($rad * $rad) . '$.', $d2 < $rad * $rad ? 'Less, so inside.' : ($d2 === $rad * $rad ? 'Equal, so on the circle.' : 'Greater, so outside.')], 'Substitute and compare with $r^2$.', 'reasoning', 35); },
        static function (MlbRng $r) { [$p, $q, $d] = $r->pick(MLB_TRIPLES); $a = $r->int(0, 5); $b = $r->int(0, 5); $rad = $d + $r->pick([-1, 1, 2]);
            $reach = $d <= $rad;
            return mlb_mcq($r, 'A sprinkler at $(' . $a . ', ' . $b . ')$ (metres) waters everything within $' . $rad . '$ m. Does it reach a plant at $(' . ($a + $p) . ', ' . ($b + $q) . ')$?', $reach ? 'Yes' : 'No',
                [[$reach ? 'No' : 'Yes', 'The plant is $\\sqrt{' . $p . '^2 + ' . $q . '^2} = ' . $d . '$ m away; compare with ' . $rad . ' m.']],
                ['The watered region is the disc $(x - ' . $a . ')^2 + (y - ' . $b . ')^2 \\le ' . ($rad * $rad) . '$.', 'Distance to the plant: $' . $d . '$ m, ' . ($reach ? 'within' : 'beyond') . ' the ' . $rad . ' m reach.'], 'Distance from the centre.', 'application', 45); },
    ];
    $f['MC-148'] = [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES);
            return mlb_typed('num', 'A point is $' . $c . '$ cm from the centre of a circle of radius $' . $a . '$ cm. How long is a tangent from the point to the circle?', (string)$b,
                ['The tangent meets the radius at a right angle, so tangent, radius and distance form a right triangle.', '$\\sqrt{' . $c . '^2 - ' . $a . '^2} = \\sqrt{' . ($b * $b) . '} = ' . $b . '$ cm.'], 'Radius ⟂ tangent: Pythagoras.', 'procedure', 45, ['unit' => 'cm']); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $sx = $r->int(0, 1) ? 1 : -1; $sy = $r->int(0, 1) ? 1 : -1; $x = $sx * $a; $y = $sy * $b;
            return mlb_typed('frac', 'Find the gradient of the tangent to $x^2 + y^2 = ' . ($c * $c) . '$ at the point $(' . $x . ', ' . $y . ')$.', mlb_frac(-$x, $y),
                ['The radius to $(' . $x . ', ' . $y . ')$ has gradient $' . mlb_ftex($y, $x) . '$.', 'The tangent is perpendicular: $' . mlb_ftex(-$x, $y) . '$.'], 'Tangent ⟂ radius.', 'procedure', 50); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES);
            return mlb_typed('expr', 'Find the equation of the tangent to $x^2 + y^2 = ' . ($c * $c) . '$ at $(' . $a . ', ' . $b . ')$, in the form $y = \\dots$', '(' . ($c * $c) . '-' . $a . 'x)/' . $b,
                ['The tangent at $(x_1, y_1)$ on $x^2 + y^2 = r^2$ is $x_1x + y_1y = r^2$.', '$' . $a . 'x + ' . $b . 'y = ' . ($c * $c) . '$, so $y = \\frac{' . ($c * $c) . ' - ' . $a . 'x}{' . $b . '}$.'], 'Gradient from the radius, then the point.', 'procedure', 80); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A tangent touches a circle at $T$, and $O$ is the centre. What is the angle between the tangent and $OT$?', '$90^\\circ$',
                [['$45^\\circ$', 'The tangent meets the radius at a RIGHT angle, whatever the circle.'], ['It depends on the size of the circle', 'It is always $90^\\circ$.'], ['$180^\\circ$', 'They are not in a straight line.']],
                ['A tangent is perpendicular to the radius at the point of contact.', 'So the angle is $90^\\circ$.'], 'Tangent ⟂ radius.', 'concept', 20); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $k = $r->pick([10, 20, 50, 100]);
            return mlb_typed('num', 'A circular lake has radius $' . ($a * $k) . '$ m. A path runs straight from a hut $' . ($c * $k) . '$ m from the lake\'s centre and just touches the shore. How long is the path to that point?', (string)($b * $k),
                ['The path is a tangent; it meets the radius at a right angle.', '$\\sqrt{' . ($c * $k) . '^2 - ' . ($a * $k) . '^2} = ' . ($b * $k) . '$ m.'], 'Tangent length by Pythagoras.', 'application', 50, ['unit' => 'm']); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES);
            return mlb_typed('num', 'Two tangents are drawn from a point $P$ to a circle, touching it at $A$ and $B$. $PA = ' . $b . '$ cm. How long is $PB$, and why must it be? Enter $PB$.', (string)$b,
                ['Triangles $OAP$ and $OBP$ are right-angled at $A$ and $B$, share the hypotenuse $OP$, and have $OA = OB$ (radii).', 'So they are congruent (RHS) and $PB = PA = ' . $b . '$ cm.'], 'Join $O$ to $A$, $B$ and $P$.', 'reasoning', 45, ['unit' => 'cm']); },
    ];
    $f['MC-149'] = [
        static function (MlbRng $r) { $a = $r->nz(-5, 6);
            return mlb_typed('pair', 'Find the focus of the parabola $y^2 = ' . (4 * $a) . 'x$.', [$a, 0],
                ['$y^2 = 4ax$ has its focus at $(a, 0)$.', '$4a = ' . (4 * $a) . '$, so $a = ' . $a . '$: focus $(' . $a . ', 0)$.'], 'Compare with $y^2 = 4ax$.', 'procedure', 35, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $a = $r->nz(-5, 6);
            return mlb_typed('num', 'The directrix of $y^2 = ' . (4 * $a) . 'x$ is the line $x = k$. Find $k$.', (string)(-$a),
                ['$y^2 = 4ax$ has directrix $x = -a$.', '$a = ' . $a . '$, so $x = ' . (-$a) . '$.'], 'The directrix is on the other side of the vertex from the focus.', 'procedure', 35); },
        static function (MlbRng $r) { $h = $r->int(-5, 5); $k = $r->int(-6, 6);
            return mlb_typed('pair', 'Find the vertex of the parabola $y = ' . mlb_poly([1, -2 * $h, $h * $h + $k]) . '$.', [$h, $k],
                ['Complete the square: $y = (x' . mlb_sterm(-$h) . ')^2 ' . ($k < 0 ? '- ' . (-$k) : '+ ' . $k) . '$.', 'Vertex $(' . $h . ', ' . $k . ')$.'], 'Complete the square.', 'procedure', 45, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A parabola is the set of points that are…', 'the same distance from a fixed point (focus) and a fixed line (directrix)',
                [['the same distance from two fixed points', 'That describes the perpendicular bisector (a line), not a parabola.'], ['a fixed distance from one point', 'That is a circle.'], ['a fixed total distance from two points', 'That is an ellipse.']],
                ['Focus–directrix definition: $PS = PM$.', 'Every point on the parabola is as far from the focus as from the directrix.'], 'One point and one line.', 'concept', 30); },
        static function (MlbRng $r) { $f = $r->int(20, 120);
            return mlb_typed('num', 'A satellite dish has the cross-section $y = \\frac{x^2}{' . (4 * $f) . '}$ (cm). The receiver must sit at the focus. How far above the vertex is that, in cm?', (string)$f,
                ['$x^2 = 4fy$ has its focus at $(0, f)$; here $x^2 = ' . (4 * $f) . 'y$.', 'So $f = ' . $f . '$ cm above the vertex.'], 'Write it as $x^2 = 4fy$.', 'application', 45, ['unit' => 'cm']); },
        static function (MlbRng $r) { $a = $r->int(1, 6); $x = $r->int(1, 12);
            return mlb_typed('num', 'The point $P$ on $y^2 = ' . (4 * $a) . 'x$ has $x$-coordinate $' . $x . '$. Without finding $y$, how far is $P$ from the focus?', (string)($x + $a),
                ['The directrix is $x = -' . $a . '$, so $P$ is $' . $x . ' + ' . $a . ' = ' . ($x + $a) . '$ from it.', 'Every point on a parabola is as far from the focus as from the directrix: $' . ($x + $a) . '$.'], 'Use the definition, not the distance formula.', 'reasoning', 45); },
    ];
    $f['MC-150'] = [
        static function (MlbRng $r) { do { $x = $r->int(-5, 5); $y = $r->int(-5, 5); $a = $r->nz(-4, 4); $b = $r->nz(-4, 4); $c = $r->nz(-4, 4); $d = $r->nz(-4, 4); } while ($a * $d - $b * $c === 0);
            return mlb_typed('pair', 'Find where the lines $' . mlb_lterm($a, 'x') . mlb_sterm($b, 'y') . ' = ' . ($a * $x + $b * $y) . '$ and $' . mlb_lterm($c, 'x') . mlb_sterm($d, 'y') . ' = ' . ($c * $x + $d * $y) . '$ intersect.', [$x, $y],
                ['Solve the two equations together (elimination or substitution).', 'They meet at $(' . $x . ', ' . $y . ')$.'], 'Eliminate one variable.', 'procedure', 80, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { do { $P = [[$r->int(-5, 5), $r->int(-5, 5)], [$r->int(-5, 5), $r->int(-5, 5)], [$r->int(-5, 5), $r->int(-5, 5)]]; $A2 = abs($P[0][0] * ($P[1][1] - $P[2][1]) + $P[1][0] * ($P[2][1] - $P[0][1]) + $P[2][0] * ($P[0][1] - $P[1][1])); } while ($A2 === 0);
            return mlb_typed('num', 'Find the area of the triangle with vertices ' . implode(', ', array_map(static fn($p) => '$(' . $p[0] . ', ' . $p[1] . ')$', $P)) . '.', mlb_dec($A2 / 2),
                ['Area $= \\frac{1}{2}|x_1(y_2 - y_3) + x_2(y_3 - y_1) + x_3(y_1 - y_2)|$.', '$\\frac{1}{2} \\times ' . $A2 . ' = ' . mlb_dec($A2 / 2) . '$.'], 'Shoelace formula.', 'procedure', 90); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $x = $r->int(-4, 4); $y = $r->int(-4, 4); $k = $r->int(-20, 20); $d = abs($a * $x + $b * $y + $k) / $c;
            return mlb_typed('num', 'Find the perpendicular distance from $(' . $x . ', ' . $y . ')$ to the line $' . $a . 'x + ' . $b . 'y' . mlb_sterm($k) . ' = 0$, to 2 decimal places.', mlb_rd($d, 2),
                ['$d = \\frac{|ax_1 + by_1 + c|}{\\sqrt{a^2 + b^2}}$.', '$\\frac{|' . ($a * $x + $b * $y + $k) . '|}{' . $c . '} \\approx ' . mlb_rd($d, 2) . '$.'], 'The formula needs the line equal to zero.', 'procedure', 60, ['dp' => 2]); },
        static function (MlbRng $r) { $m = $r->nz(-3, 3); $c = $r->int(-4, 4); $col = $r->int(0, 1) === 1; $x3 = $r->int(3, 6); $y3 = $m * $x3 + $c + ($col ? 0 : $r->nz(-3, 3));
            return mlb_mcq($r, 'Are the points $(0, ' . $c . ')$, $(1, ' . ($m + $c) . ')$ and $(' . $x3 . ', ' . $y3 . ')$ collinear (on one straight line)?', $col ? 'Yes' : 'No',
                [[$col ? 'No' : 'Yes', 'Compare the gradients between the first two points and between the first and third.']],
                ['Gradient from the first to the second: $' . $m . '$.', 'From the first to the third: $' . mlb_ftex($y3 - $c, $x3) . '$ — ' . ($col ? 'the same, so collinear.' : 'different, so not collinear.')], 'Equal gradients from a shared point.', 'reasoning', 45); },
        static function (MlbRng $r) { $w = $r->int(20, 60); $h = $r->int(10, 40); $s = $r->int(5, $w - 5);
            $P = [[0, 0], [$w, 0], [$w + $s, $h], [$s, $h]]; $A = $w * $h;
            return mlb_typed('num', 'A surveyor marks the corners of a field at $(0, 0)$, $(' . $w . ', 0)$, $(' . ($w + $s) . ', ' . $h . ')$ and $(' . $s . ', ' . $h . ')$ (metres). Find its area in $\\text{m}^2$.', (string)$A,
                ['The shape is a parallelogram with base $' . $w . '$ m and height $' . $h . '$ m (or use the shoelace formula).', 'Area $= ' . $w . ' \\times ' . $h . ' = ' . $A . '\\ \\text{m}^2$.'], 'Identify the shape first.', 'application', 70, ['unit' => 'm²']); },
    ];

    /* ══ Stage 16 · Calculus and Mathematical Analysis ═══════════════════ */
    $f['MC-151'] = [
        static function (MlbRng $r) { $a = $r->nz(-9, 9);
            return mlb_typed('num', 'Find $\\displaystyle\\lim_{x \\to ' . $a . '} \\frac{x^2 - ' . ($a * $a) . '}{x ' . ($a > 0 ? '- ' . $a : '+ ' . (-$a)) . '}$.', (string)(2 * $a),
                ['Factorise: $\\frac{(x - ' . abs($a) . ')(x + ' . abs($a) . ')}{x ' . ($a > 0 ? '- ' . $a : '+ ' . (-$a)) . '} = x ' . ($a > 0 ? '+ ' . $a : '- ' . (-$a)) . '$ for $x \\ne ' . $a . '$.', 'As $x \\to ' . $a . '$: $' . $a . ($a > 0 ? ' + ' . $a : ' - ' . (-$a)) . ' = ' . (2 * $a) . '$.'], 'Cancel the factor causing $\\frac{0}{0}$.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->nz(-9, 9); $b = $r->int(-9, 9); $c = $r->nz(-9, 9); $d = $r->int(-9, 9);
            return mlb_typed('frac', 'Find $\\displaystyle\\lim_{x \\to \\infty} \\frac{' . mlb_lterm($a, 'x') . mlb_sterm($b) . '}{' . mlb_lterm($c, 'x') . mlb_sterm($d) . '}$.', mlb_frac($a, $c),
                ['Divide top and bottom by $x$: $\\frac{' . $a . ' + ' . $b . '/x}{' . $c . ' + ' . $d . '/x}$.', 'As $x \\to \\infty$ the fractions vanish: $' . mlb_ftex($a, $c) . '$.'], 'Only the leading terms matter.', 'procedure', 45); },
        static function (MlbRng $r) { $c = [$r->int(-3, 3), $r->int(-5, 5), $r->int(-9, 9)]; $k = $r->int(-4, 4);
            return mlb_typed('num', 'Find $\\displaystyle\\lim_{x \\to ' . $k . '} (' . mlb_poly($c) . ')$.', (string)($c[0] * $k * $k + $c[1] * $k + $c[2]),
                ['A polynomial is continuous, so the limit is its value at the point.', '$' . $c[0] . '(' . $k . ')^2 + ' . $c[1] . '(' . $k . ') + ' . $c[2] . ' = ' . ($c[0] * $k * $k + $c[1] * $k + $c[2]) . '$.'], 'Just substitute — nothing breaks.', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'What is $\\displaystyle\\lim_{x \\to 0} \\frac{1}{x}$?', 'It does not exist',
                [['0', 'As $x$ gets closer to 0, $\\frac{1}{x}$ gets LARGER in size, not smaller.'], ['$\\infty$', 'From the left it heads to $-\\infty$ and from the right to $+\\infty$ — they disagree.'], ['1', 'There is no reason for 1.']],
                ['From the right, $\\frac{1}{x} \\to +\\infty$; from the left, $\\to -\\infty$.', 'The two sides do not agree, so the limit does not exist.'], 'Check both sides.', 'reasoning', 40); },
        static function (MlbRng $r) { $k = $r->int(1, 6); $a = $r->int(1, 8);
            return mlb_typed('num', 'A stone falls $s = ' . $k . 't^2$ metres in $t$ seconds. Its average speed from $t = ' . $a . '$ to $t = ' . $a . ' + h$ is $' . (2 * $k * $a) . ' + ' . $k . 'h$ m/s. What is its speed at exactly $t = ' . $a . '$?', (string)(2 * $k * $a),
                ['The instantaneous speed is the limit of the average speed as $h \\to 0$.', '$' . (2 * $k * $a) . ' + ' . $k . ' \\times 0 = ' . (2 * $k * $a) . '$ m/s.'], 'Shrink the interval to nothing.', 'application', 45, ['unit' => 'm/s']); },
    ];
    $f['MC-152'] = [
        static function (MlbRng $r) { $a = $r->int(-5, 6); $h = $r->pick([1, 0.5, 0.1, 0.01, 2]);
            return mlb_typed('num', 'Find the gradient of the chord of $y = x^2$ from $x = ' . $a . '$ to $x = ' . $a . ' + ' . mlb_dec($h) . '$.', mlb_dec(2 * $a + $h),
                ['$\\frac{(' . $a . ' + h)^2 - ' . $a . '^2}{h} = \\frac{' . (2 * $a) . 'h + h^2}{h} = ' . (2 * $a) . ' + h$.', 'With $h = ' . mlb_dec($h) . '$: $' . mlb_dec(2 * $a + $h) . '$.'], 'Change in $y$ over change in $x$.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->nz(-4, 5); $b = $r->int(-6, 6); $k = $r->int(-4, 4);
            return mlb_typed('num', 'Using first principles, $f(x) = ' . mlb_poly([$a, $b, 0]) . '$ has $f\'(x) = \\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}$. Find $f\'(' . $k . ')$.', (string)(2 * $a * $k + $b),
                ['$\\frac{f(x + h) - f(x)}{h} = ' . (2 * $a) . 'x + ' . $a . 'h' . mlb_sterm($b) . '$, which tends to $' . mlb_lterm(2 * $a, 'x') . mlb_sterm($b) . '$.', '$f\'(' . $k . ') = ' . (2 * $a) . '(' . $k . ')' . mlb_sterm($b) . ' = ' . (2 * $a * $k + $b) . '$.'], 'Expand $f(x + h)$, cancel, then let $h \\to 0$.', 'procedure', 80); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which expression defines the derivative $f\'(x)$ from first principles?', '$\\displaystyle\\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}$',
                [['$\\displaystyle\\frac{f(x + h) - f(x)}{h}$', 'Without the limit, that is the gradient of a CHORD, not the tangent.'], ['$\\displaystyle\\lim_{h \\to 0} \\frac{f(x) - f(h)}{x - h}$', 'The two points must be $x$ and $x + h$.'], ['$\\displaystyle\\lim_{h \\to 0} f(x + h)$', 'That is just $f(x)$ for a continuous function.']],
                ['The tangent gradient is the limit of chord gradients as the second point slides in.', '$f\'(x) = \\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}$.'], 'Chord gradient, then the limit.', 'concept', 35); },
        static function (MlbRng $r) {
            return mlb_error_of($r, 'Find the first mistake in this working for the derivative of $f(x) = x^2$ from first principles.',
                ['$f(x + h) = (x + h)^2 = x^2 + 2xh + h^2$', '$\\frac{f(x + h) - f(x)}{h} = \\frac{2xh + h^2}{h} = 2x + h$', 'As $h \\to 0$: $f\'(x) = 2x$'], [
                [0, ['$f(x + h) = (x + h)^2 = x^2 + h^2$', '$\\frac{f(x + h) - f(x)}{h} = \\frac{h^2}{h} = h$', 'As $h \\to 0$: $f\'(x) = 0$'], '$(x + h)^2$ has a middle term: $x^2 + 2xh + h^2$.'],
                [2, ['$f(x + h) = (x + h)^2 = x^2 + 2xh + h^2$', '$\\frac{f(x + h) - f(x)}{h} = \\frac{2xh + h^2}{h} = 2x + h$', 'As $h \\to 0$: $f\'(x) = 2x + 1$'], 'the $h$ tends to 0, so it disappears: $2x$.'],
            ]); },
        static function (MlbRng $r) { $k = $r->int(1, 9); $t = $r->int(1, 10);
            return mlb_typed('num', 'A car\'s position is $s = ' . $k . 't^2$ metres. From first principles its velocity is $\\lim_{h \\to 0} \\frac{s(t + h) - s(t)}{h}$. Find the velocity at $t = ' . $t . '$ s.', (string)(2 * $k * $t),
                ['$\\frac{' . $k . '(t + h)^2 - ' . $k . 't^2}{h} = ' . (2 * $k) . 't + ' . $k . 'h \\to ' . (2 * $k) . 't$.', 'At $t = ' . $t . '$: $' . (2 * $k * $t) . '$ m/s.'], 'Velocity is the derivative of position.', 'application', 60, ['unit' => 'm/s']); },
    ];
    $f['MC-153'] = [
        static function (MlbRng $r) { $c = [$r->int(-4, 5), $r->int(-6, 6), $r->int(-9, 9), $r->int(-9, 9)]; if ($c[0] === 0) $c[0] = 2;
            return mlb_typed('expr', 'Differentiate $y = ' . mlb_poly($c) . '$. Write $\\frac{dy}{dx}$.', mlb_poly([3 * $c[0], 2 * $c[1], $c[2]]),
                ['$\\frac{d}{dx}x^n = nx^{n-1}$; a constant differentiates to 0.', '$\\frac{dy}{dx} = ' . mlb_poly([3 * $c[0], 2 * $c[1], $c[2]]) . '$.'], 'Multiply by the power, lower the power by one.', 'procedure', 45); },
        static function (MlbRng $r) { $c = [$r->int(-3, 3), $r->int(-5, 5), $r->int(-9, 9)]; if ($c[0] === 0) $c[0] = 1; $k = $r->int(-4, 4);
            return mlb_typed('num', 'Find the gradient of $y = ' . mlb_poly($c) . '$ at $x = ' . $k . '$.', (string)(2 * $c[0] * $k + $c[1]),
                ['$\\frac{dy}{dx} = ' . mlb_poly([2 * $c[0], $c[1]]) . '$.', 'At $x = ' . $k . '$: $' . (2 * $c[0] * $k + $c[1]) . '$.'], 'Differentiate, then substitute.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->nz(-3, 3); $b = $r->int(-8, 8); $x = $r->int(-5, 5); $m = 2 * $a * $x + $b;
            return mlb_typed('num', 'At what value of $x$ does $y = ' . mlb_poly([$a, $b, $r->int(-5, 5)]) . '$ have gradient $' . $m . '$?', (string)$x,
                ['$\\frac{dy}{dx} = ' . mlb_poly([2 * $a, $b]) . ' = ' . $m . '$.', '$' . mlb_lterm(2 * $a, 'x') . ' = ' . ($m - $b) . '$, so $x = ' . $x . '$.'], 'Set the derivative equal to the gradient.', 'reasoning', 50); },
        static function (MlbRng $r) { $n = $r->int(3, 7); $a = $r->int(2, 6);
            return mlb_mcq($r, 'Differentiate $' . $a . 'x^' . $n . '$.', '$' . ($a * $n) . 'x^' . ($n - 1) . '$',
                [['$' . $a . 'x^' . ($n - 1) . '$', 'Multiply by the power as well: $' . $a . ' \\times ' . $n . ' = ' . ($a * $n) . '$.'], ['$' . ($a * $n) . 'x^' . $n . '$', 'Lower the power by one.'], ['$' . $a . 'x^' . ($n + 1) . '$', 'Raising the power is integration, not differentiation.']],
                ['$\\frac{d}{dx}ax^n = anx^{n-1}$.', '$' . $a . ' \\times ' . $n . 'x^{' . ($n - 1) . '} = ' . ($a * $n) . 'x^' . ($n - 1) . '$.'], 'Bring the power down, then reduce it.', 'reasoning', 30); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $b = 10 * $r->int(1, 20); $c = 100 * $r->int(5, 50); $x = $r->int(5, 40);
            return mlb_typed('num', 'The cost of making $x$ items is $C = ' . $a . 'x^2 + ' . $b . 'x + ' . $c . '$ naira. The marginal cost is $\\frac{dC}{dx}$. Find it when $x = ' . $x . '$.', (string)(2 * $a * $x + $b),
                ['$\\frac{dC}{dx} = ' . (2 * $a) . 'x + ' . $b . '$.', 'At $x = ' . $x . '$: $' . (2 * $a * $x + $b) . '$ naira per extra item.'], 'Marginal cost is the rate of change of cost.', 'application', 45, ['unit' => '₦']); },
    ];
    $f['MC-154'] = [
        static function (MlbRng $r) { $a = $r->nz(-3, 4); $b = $r->int(-4, 4); $n = $r->int(2, 5); $k = $r->int(-2, 2);
            return mlb_typed('num', 'Find $\\frac{dy}{dx}$ at $x = ' . $k . '$ when $y = (' . mlb_lterm($a, 'x') . mlb_sterm($b) . ')^' . $n . '$.', (string)($n * $a * ($a * $k + $b) ** ($n - 1)),
                ['Chain rule: $\\frac{dy}{dx} = ' . $n . '(' . mlb_lterm($a, 'x') . mlb_sterm($b) . ')^{' . ($n - 1) . '} \\times ' . $a . '$.', 'At $x = ' . $k . '$: $' . $n . ' \\times (' . ($a * $k + $b) . ')^{' . ($n - 1) . '} \\times ' . $a . ' = ' . ($n * $a * ($a * $k + $b) ** ($n - 1)) . '$.'], 'Outside derivative times inside derivative.', 'procedure', 60); },
        static function (MlbRng $r) { $a = $r->int(-4, 4); $k = $r->int(-3, 3);
            return mlb_typed('num', 'Find $\\frac{dy}{dx}$ at $x = ' . $k . '$ when $y = x^2(x' . mlb_sterm($a) . ')$, using the product rule.', (string)(2 * $k * ($k + $a) + $k * $k),
                ['Product rule: $\\frac{dy}{dx} = 2x(x' . mlb_sterm($a) . ') + x^2 \\times 1$.', 'At $x = ' . $k . '$: $' . (2 * $k * ($k + $a)) . ' + ' . ($k * $k) . ' = ' . (2 * $k * ($k + $a) + $k * $k) . '$.'], '$u\'v + uv\'$.', 'procedure', 60); },
        static function (MlbRng $r) { $a = $r->nz(-5, 5); $k = $r->int(-3, 3); if ($k + $a === 0) $k++;
            return mlb_typed('frac', 'Find $\\frac{dy}{dx}$ at $x = ' . $k . '$ when $y = \\frac{x}{x' . mlb_sterm($a) . '}$, using the quotient rule.', mlb_frac($a, ($k + $a) ** 2),
                ['Quotient rule: $\\frac{(x' . mlb_sterm($a) . ')(1) - x(1)}{(x' . mlb_sterm($a) . ')^2} = \\frac{' . $a . '}{(x' . mlb_sterm($a) . ')^2}$.', 'At $x = ' . $k . '$: $\\frac{' . $a . '}{' . (($k + $a) ** 2) . '} = ' . mlb_ftex($a, ($k + $a) ** 2) . '$.'], '$\\frac{vu\' - uv\'}{v^2}$.', 'procedure', 70); },
        static function (MlbRng $r) { $a = $r->int(2, 5); $n = $r->int(3, 5);
            return mlb_error_of($r, 'Find the first mistake in this working for $\\frac{d}{dx}(' . $a . 'x + 1)^' . $n . '$.',
                ['Let $u = ' . $a . 'x + 1$, so $y = u^' . $n . '$', '$\\frac{dy}{du} = ' . $n . 'u^{' . ($n - 1) . '}$ and $\\frac{du}{dx} = ' . $a . '$', '$\\frac{dy}{dx} = ' . ($n * $a) . '(' . $a . 'x + 1)^{' . ($n - 1) . '}$'], [
                [2, ['Let $u = ' . $a . 'x + 1$, so $y = u^' . $n . '$', '$\\frac{dy}{du} = ' . $n . 'u^{' . ($n - 1) . '}$ and $\\frac{du}{dx} = ' . $a . '$', '$\\frac{dy}{dx} = ' . $n . '(' . $a . 'x + 1)^{' . ($n - 1) . '}$'], 'the chain rule multiplies by $\\frac{du}{dx} = ' . $a . '$ as well.'],
                [1, ['Let $u = ' . $a . 'x + 1$, so $y = u^' . $n . '$', '$\\frac{dy}{du} = ' . $n . 'u^{' . ($n - 1) . '}$ and $\\frac{du}{dx} = ' . $a . 'x$', '$\\frac{dy}{dx} = ' . ($n * $a) . 'x(' . $a . 'x + 1)^{' . ($n - 1) . '}$'], 'the derivative of $' . $a . 'x + 1$ is $' . $a . '$, not $' . $a . 'x$.'],
            ]); },
        static function (MlbRng $r) { $t = $r->int(1, 6);
            return mlb_typed('num', 'A balloon\'s volume is $V = (t + 1)^3$ litres after $t$ seconds. How fast is the volume increasing at $t = ' . $t . '$, in litres per second?', (string)(3 * ($t + 1) ** 2),
                ['$\\frac{dV}{dt} = 3(t + 1)^2 \\times 1$ (chain rule).', 'At $t = ' . $t . '$: $3 \\times ' . ($t + 1) . '^2 = ' . (3 * ($t + 1) ** 2) . '$.'], 'Rate of change is the derivative.', 'application', 45); },
    ];
    $f['MC-155'] = [
        static function (MlbRng $r) { $a = $r->nz(-6, 6); $w = $r->int(0, 1);
            return $w ? mlb_typed('num', 'Find $\\frac{dy}{dx}$ at $x = 0$ when $y = \\sin ' . $a . 'x$.', (string)$a,
                    ['$\\frac{d}{dx}\\sin ' . $a . 'x = ' . $a . '\\cos ' . $a . 'x$.', 'At $x = 0$: $' . $a . '\\cos 0 = ' . $a . '$.'], 'Chain rule with sine.', 'procedure', 40)
                : mlb_typed('num', 'Find $\\frac{dy}{dx}$ at $x = 0$ when $y = e^{' . $a . 'x}$.', (string)$a,
                    ['$\\frac{d}{dx}e^{' . $a . 'x} = ' . $a . 'e^{' . $a . 'x}$.', 'At $x = 0$: $' . $a . 'e^0 = ' . $a . '$.'], '$e^{kx}$ differentiates to $ke^{kx}$.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $k = $r->int(1, 9);
            return mlb_typed('frac', 'Find $\\frac{dy}{dx}$ at $x = ' . $k . '$ when $y = \\ln(' . $a . 'x)$.', mlb_frac(1, $k),
                ['$\\ln(' . $a . 'x) = \\ln ' . $a . ' + \\ln x$, so $\\frac{dy}{dx} = \\frac{1}{x}$.', 'At $x = ' . $k . '$: $' . mlb_ftex(1, $k) . '$.'], 'The constant inside the log disappears.', 'reasoning', 45); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            return $c ? mlb_mcq($r, 'What is $\\frac{d}{dx}\\cos x$?', '$-\\sin x$',
                    [['$\\sin x$', 'The derivative of cos has a minus sign.'], ['$-\\cos x$', 'That is the SECOND derivative of $\\cos x$.'], ['$\\cos x$', 'Only $e^x$ is its own derivative.']],
                    ['$\\frac{d}{dx}\\cos x = -\\sin x$.', 'Check at $x = 90^\\circ$: cos is falling there, and $-\\sin 90^\\circ = -1 < 0$. ✓'], 'Is cos rising or falling just after 0?', 'concept', 25)
                : mlb_mcq($r, 'What is $\\frac{d}{dx}e^x$?', '$e^x$',
                    [['$xe^{x-1}$', 'The power rule is for $x^n$; here the variable is in the exponent.'], ['$\\ln x$', 'That is the inverse function, not the derivative.'], ['$e$', 'The result still depends on $x$.']],
                    ['$e^x$ is the function that is its own derivative.', '$\\frac{d}{dx}e^x = e^x$.'], 'The special property of $e$.', 'concept', 25); },
        static function (MlbRng $r) { $P = 100 * $r->int(5, 50); $k = $r->pick([0.02, 0.03, 0.05, 0.1]);
            return mlb_typed('num', 'A population is modelled by $P = ' . $P . 'e^{' . mlb_dec($k) . 't}$. How fast is it growing at $t = 0$, in individuals per year?', mlb_dec($P * $k),
                ['$\\frac{dP}{dt} = ' . $P . ' \\times ' . mlb_dec($k) . 'e^{' . mlb_dec($k) . 't}$.', 'At $t = 0$: $' . $P . ' \\times ' . mlb_dec($k) . ' = ' . mlb_dec($P * $k) . '$.'], 'Rate of change of an exponential.', 'application', 45); },
    ];
    $f['MC-156'] = [
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick(MLB_TRIPLES); $x = ($r->int(0, 1) ? 1 : -1) * $a; $y = ($r->int(0, 1) ? 1 : -1) * $b;
            return mlb_typed('frac', 'Find $\\frac{dy}{dx}$ for $x^2 + y^2 = ' . ($c * $c) . '$ at the point $(' . $x . ', ' . $y . ')$.', mlb_frac(-$x, $y),
                ['Differentiate implicitly: $2x + 2y\\frac{dy}{dx} = 0$.', '$\\frac{dy}{dx} = -\\frac{x}{y} = ' . mlb_ftex(-$x, $y) . '$.'], 'Differentiate $y^2$ as $2y\\frac{dy}{dx}$.', 'procedure', 50); },
        static function (MlbRng $r) { $s = $r->int(2, 20); $ds = $r->int(1, 5);
            return mlb_typed('num', 'The side of a square grows at $' . $ds . '$ cm/s. How fast is its area growing when the side is $' . $s . '$ cm, in $\\text{cm}^2$/s?', (string)(2 * $s * $ds),
                ['$A = s^2$, so $\\frac{dA}{dt} = 2s\\frac{ds}{dt}$.', '$2 \\times ' . $s . ' \\times ' . $ds . ' = ' . (2 * $s * $ds) . '$.'], 'Chain rule through time.', 'procedure', 45); },
        static function (MlbRng $r) { $rad = $r->int(2, 20); $dr = $r->int(1, 4);
            return mlb_typed('num', 'A ripple spreads so that its radius grows at $' . $dr . '$ cm/s. When the radius is $' . $rad . '$ cm, the area is growing at $k\\pi\\ \\text{cm}^2$/s. Find $k$.', (string)(2 * $rad * $dr),
                ['$A = \\pi r^2$, so $\\frac{dA}{dt} = 2\\pi r\\frac{dr}{dt}$.', '$2\\pi \\times ' . $rad . ' \\times ' . $dr . ' = ' . (2 * $rad * $dr) . '\\pi$.'], 'Differentiate the area with respect to time.', 'application', 50); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Differentiating with respect to $x$, what is $\\frac{d}{dx}(y^2)$?', '$2y\\frac{dy}{dx}$',
                [['$2y$', '$y$ depends on $x$, so the chain rule adds a factor $\\frac{dy}{dx}$.'], ['$0$', '$y$ is not a constant.'], ['$2x$', 'It is $y$ being squared, not $x$.']],
                ['$\\frac{d}{dx}(y^2) = \\frac{d}{dy}(y^2) \\times \\frac{dy}{dx}$.', '$= 2y\\frac{dy}{dx}$.'], 'Chain rule.', 'reasoning', 30); },
    ];
    $f['MC-157'] = [
        static function (MlbRng $r) { $h = $r->int(-6, 6); $k = $r->int(-9, 9);
            return mlb_typed('pair', 'Find the stationary point of $y = ' . mlb_poly([1, -2 * $h, $h * $h + $k]) . '$.', [$h, $k],
                ['$\\frac{dy}{dx} = ' . mlb_poly([2, -2 * $h]) . ' = 0$ gives $x = ' . $h . '$.', 'Then $y = ' . $k . '$: the point $(' . $h . ', ' . $k . ')$.'], 'Set the gradient to zero.', 'procedure', 50, ['labels' => ['x', 'y'], 'point' => true]); },
        static function (MlbRng $r) { $a = $r->int(1, 5);
            return mlb_typed('num', 'Find the positive $x$-coordinate of a stationary point of $y = x^3 - ' . (3 * $a * $a) . 'x$.', (string)$a,
                ['$\\frac{dy}{dx} = 3x^2 - ' . (3 * $a * $a) . ' = 0$, so $x^2 = ' . ($a * $a) . '$.', '$x = \\pm' . $a . '$; the positive one is $' . $a . '$.'], 'Solve $\\frac{dy}{dx} = 0$.', 'procedure', 50); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            return mlb_mcq($r, 'At a stationary point, $\\frac{d^2y}{dx^2} ' . ($c ? '> 0' : '< 0') . '$. What kind of point is it?', $c ? 'A minimum' : 'A maximum',
                [[$c ? 'A maximum' : 'A minimum', $c ? 'A positive second derivative means the gradient is increasing: the curve bends up, like ∪.' : 'A negative second derivative means the curve bends down, like ∩.'], ['A point of inflection', 'That needs the second derivative to be zero (and change sign).'], ['It cannot be decided', 'The sign of the second derivative decides it.']],
                ['The second derivative shows which way the curve bends.', $c ? 'Positive: ∪-shaped, a minimum.' : 'Negative: ∩-shaped, a maximum.'], 'Smile or frown?', 'reasoning', 35); },
        static function (MlbRng $r) { $a = $r->int(1, 4);
            return mlb_typed('num', 'Find the maximum value of $y = ' . (3 * $a * $a) . 'x - x^3$ for $x > 0$.', (string)(2 * $a ** 3),
                ['$\\frac{dy}{dx} = ' . (3 * $a * $a) . ' - 3x^2 = 0$ at $x = ' . $a . '$; $\\frac{d^2y}{dx^2} = -6x < 0$, so it is a maximum.', '$y = ' . (3 * $a * $a) . ' \\times ' . $a . ' - ' . $a . '^3 = ' . (2 * $a ** 3) . '$.'], 'Find where, then the value.', 'procedure', 60); },
        static function (MlbRng $r) { $L = 6 * $r->int(2, 10);
            return mlb_typed('num', 'An open box is made from a $' . $L . '$ cm square sheet by cutting squares of side $x$ from the corners: $V = x(' . $L . ' - 2x)^2$. What value of $x$ (in cm) gives the greatest volume?', (string)($L / 6),
                ['$\\frac{dV}{dx} = (' . $L . ' - 2x)^2 - 4x(' . $L . ' - 2x) = (' . $L . ' - 2x)(' . $L . ' - 6x)$.', '$\\frac{dV}{dx} = 0$ at $x = ' . ($L / 6) . '$ (the other root, $x = ' . ($L / 2) . '$, leaves no box).'], 'Differentiate, factorise, reject the impossible root.', 'application', 100, ['unit' => 'cm']); },
    ];
    $f['MC-158'] = [
        static function (MlbRng $r) { $a = $r->int(1, 4); $b = $r->int(-6, 6); $k = $r->int(-9, 9);
            return mlb_typed('expr', '$F\'(x) = ' . mlb_poly([3 * $a, 2 * $b, 0]) . '$ and $F(0) = ' . $k . '$. Find $F(x)$.', mlb_poly([$a, $b, 0, $k]),
                ['Integrate term by term: $' . mlb_poly([$a, $b, 0]) . ' + C$ (each power goes up by one and is divided by the new power).', '$F(0) = C = ' . $k . '$, so $F(x) = ' . mlb_poly([$a, $b, 0, $k]) . '$.'], 'Raise the power, divide by it, then fix $C$.', 'procedure', 60); },
        static function (MlbRng $r) { $n = $r->int(1, 5); $a = ($n + 1) * $r->int(1, 4);
            return mlb_typed('expr', 'Find $\\int ' . $a . 'x^' . $n . '\\,dx$, taking the constant of integration as 0.', ($a / ($n + 1)) . 'x^' . ($n + 1),
                ['$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$.', '$\\frac{' . $a . '}{' . ($n + 1) . '}x^{' . ($n + 1) . '} = ' . ($a / ($n + 1)) . 'x^{' . ($n + 1) . '}$.'], 'Up one, divide by the new power.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does an indefinite integral need $+ C$?', 'Many functions have the same derivative, differing only by a constant',
                [['To make the answer bigger', 'The constant can be any number, including negative.'], ['Because the derivative of $x$ is $C$', 'The derivative of a constant is 0, which is why it is lost.'], ['It is only needed for definite integrals', 'It cancels in definite integrals; it is needed in indefinite ones.']],
                ['$x^2$, $x^2 + 5$ and $x^2 - 3$ all have derivative $2x$.', 'So $\\int 2x\\,dx = x^2 + C$ covers them all.'], 'What happens to constants when you differentiate?', 'concept', 30); },
        static function (MlbRng $r) { $n = $r->int(2, 5); $a = ($n + 1) * $r->int(1, 3);
            return mlb_error_of($r, 'Find the first mistake in this working for $\\int ' . $a . 'x^' . $n . '\\,dx$.',
                ['Raise the power by one: $x^{' . ($n + 1) . '}$', 'Divide by the new power: $\\frac{' . $a . '}{' . ($n + 1) . '}x^{' . ($n + 1) . '}$', '$= ' . ($a / ($n + 1)) . 'x^{' . ($n + 1) . '} + C$'], [
                [1, ['Raise the power by one: $x^{' . ($n + 1) . '}$', 'Multiply by the old power: $' . ($a * $n) . 'x^{' . ($n + 1) . '}$', '$= ' . ($a * $n) . 'x^{' . ($n + 1) . '} + C$'], 'integration DIVIDES by the new power; multiplying belongs to differentiation.'],
                [0, ['Lower the power by one: $x^{' . ($n - 1) . '}$', 'Multiply by the power: $' . ($a * $n) . 'x^{' . ($n - 1) . '}$', '$= ' . ($a * $n) . 'x^{' . ($n - 1) . '} + C$'], 'that is differentiation. Integration raises the power.'],
            ]); },
        static function (MlbRng $r) { $a = $r->int(1, 6); $b = $r->int(0, 10); $t = $r->int(1, 8);
            return mlb_typed('num', 'A cyclist\'s velocity is $v = ' . (2 * $a) . 't + ' . $b . '$ m/s, and she starts at $s = 0$. How far has she gone after $' . $t . '$ s?', (string)($a * $t * $t + $b * $t),
                ['Displacement is the integral of velocity: $s = ' . $a . 't^2 + ' . $b . 't + C$, and $C = 0$.', 'At $t = ' . $t . '$: $' . ($a * $t * $t) . ' + ' . ($b * $t) . ' = ' . ($a * $t * $t + $b * $t) . '$ m.'], 'Integrate velocity to get position.', 'application', 50, ['unit' => 'm']); },
    ];
    $f['MC-159'] = [
        static function (MlbRng $r) { $c = [$r->int(-2, 3), $r->int(-4, 4), $r->int(-5, 5)]; $a = $r->int(-2, 1); $b = $r->int($a + 1, 4);
            $F = static fn($x) => [2 * $c[0] * $x ** 3 + 3 * $c[1] * $x ** 2 + 6 * $c[2] * $x, 6]; // over 6
            $num = $F($b)[0] - $F($a)[0];
            return mlb_typed('frac', 'Evaluate $\\displaystyle\\int_{' . $a . '}^{' . $b . '} (' . mlb_poly($c) . ')\\,dx$.', mlb_frac($num, 6),
                ['Antiderivative: $' . mlb_ftex($c[0], 3) . 'x^3 + ' . mlb_ftex($c[1], 2) . 'x^2 + ' . $c[2] . 'x$.', 'Top limit minus bottom limit: $' . mlb_ftex($num, 6) . '$.'], 'Integrate, then $F(b) - F(a)$.', 'procedure', 90); },
        static function (MlbRng $r) { $k = $r->int(1, 9);
            return mlb_typed('frac', 'Find the area under $y = x^2$ from $x = 0$ to $x = ' . $k . '$.', mlb_frac($k ** 3, 3),
                ['$\\int_0^{' . $k . '} x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^{' . $k . '}$.', '$\\frac{' . ($k ** 3) . '}{3} = ' . mlb_ftex($k ** 3, 3) . '$.'], 'Integrate between the limits.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'What is $\\displaystyle\\int_{0}^{2} (-x)\\,dx$?', '$-2$',
                [['$2$', 'The line $y = -x$ is BELOW the axis here, so the integral is negative. The area is 2; the integral is −2.'], ['$0$', 'Nothing cancels on $[0, 2]$ — the function is negative throughout.'], ['$-4$', '$\\left[-\\frac{x^2}{2}\\right]_0^2 = -2$.']],
                ['$\\left[-\\frac{x^2}{2}\\right]_0^2 = -2 - 0$.', 'A definite integral counts area below the axis as negative.'], 'Is the graph above or below the axis?', 'reasoning', 35); },
        static function (MlbRng $r) { $k = $r->int(1, 8);
            return mlb_typed('num', 'A car\'s velocity is $v = 3t^2$ m/s. How far does it travel from $t = 0$ to $t = ' . $k . '$ s?', (string)($k ** 3),
                ['Distance $= \\int_0^{' . $k . '} 3t^2\\,dt = [t^3]_0^{' . $k . '}$.', '$= ' . ($k ** 3) . '$ m.'], 'The area under a velocity–time graph is the distance.', 'application', 45, ['unit' => 'm']); },
    ];
    $f['MC-160'] = [
        static function (MlbRng $r) { $h = $r->int(1, 9);
            return mlb_typed('frac', 'The line $y = x$ from $x = 0$ to $x = ' . $h . '$ is rotated $360^\\circ$ about the $x$-axis, making a cone. Its volume is $k\\pi$. Find $k$.', mlb_frac($h ** 3, 3),
                ['$V = \\pi\\int_0^{' . $h . '} y^2\\,dx = \\pi\\int_0^{' . $h . '} x^2\\,dx$.', '$= \\pi\\left[\\frac{x^3}{3}\\right]_0^{' . $h . '} = ' . mlb_ftex($h ** 3, 3) . '\\pi$.'], '$\\pi\\int y^2\\,dx$.', 'procedure', 60); },
        static function (MlbRng $r) { $a = $r->int(1, 9);
            return mlb_typed('frac', 'A vase is shaped by rotating $y = \\sqrt{x}$ from $x = 0$ to $x = ' . $a . '$ about the $x$-axis (units in dm). Its volume is $k\\pi$ litres. Find $k$.', mlb_frac($a * $a, 2),
                ['$V = \\pi\\int_0^{' . $a . '} (\\sqrt{x})^2\\,dx = \\pi\\int_0^{' . $a . '} x\\,dx$.', '$= \\pi\\left[\\frac{x^2}{2}\\right]_0^{' . $a . '} = ' . mlb_ftex($a * $a, 2) . '\\pi$.'], 'Square $y$ before integrating.', 'application', 60); },
        static function (MlbRng $r) { $n = $r->int(2, 5); $y = array_map(static fn($x) => $x * $x, range(0, $n)); $T = 0.5 * ($y[0] + $y[$n] + 2 * array_sum(array_slice($y, 1, $n - 1)));
            return mlb_typed('num', 'Use the trapezium rule with strips of width 1 to estimate $\\displaystyle\\int_0^{' . $n . '} x^2\\,dx$.', mlb_dec($T),
                ['$\\frac{h}{2}[y_0 + y_' . $n . ' + 2(y_1 + \\dots + y_{' . ($n - 1) . '})]$ with $y = ' . implode(', ', $y) . '$.', '$\\frac{1}{2}[' . ($y[0] + $y[$n]) . ' + 2(' . array_sum(array_slice($y, 1, $n - 1)) . ')] = ' . mlb_dec($T) . '$ (exact: $' . mlb_ftex($n ** 3, 3) . '$).'], 'Ends once, middles twice.', 'procedure', 80); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'The trapezium rule is used on $y = x^2$ between 0 and 2. Is the estimate too big or too small?', 'Too big — the curve bends below the straight tops',
                [['Too small', 'For a curve that bends upwards (∪), each trapezium\'s top lies ABOVE the curve.'], ['Exactly right', 'Only straight-line graphs are integrated exactly by trapezia.'], ['It cannot be told', 'The shape of the curve tells you.']],
                ['$y = x^2$ is convex (bends upwards).', 'Straight chords lie above it, so the trapezia overestimate.'], 'Draw one strip.', 'reasoning', 40); },
    ];

    /* ══ Stage 17 · Further Mathematics, Mechanics and Beyond ════════════ */
    $f['MC-161'] = [
        static function (MlbRng $r) { $v = 2 * $r->int(2, 15); $t1 = $r->int(2, 10); $t2 = $r->int(2, 20);
            return mlb_typed('num', 'A car accelerates steadily from rest to $' . $v . '$ m/s in $' . $t1 . '$ s, then keeps that speed for $' . $t2 . '$ s. How far does it travel altogether?', (string)($v * $t1 / 2 + $v * $t2),
                ['Distance is the area under the velocity–time graph: a triangle then a rectangle.', '$\\frac{1}{2} \\times ' . $t1 . ' \\times ' . $v . ' + ' . $t2 . ' \\times ' . $v . ' = ' . ($v * $t1 / 2 + $v * $t2) . '$ m.'], 'Area under the graph.', 'procedure', 60, ['unit' => 'm']); },
        static function (MlbRng $r) { $u = $r->int(0, 20); $a = $r->nz(-5, 6); $t = $r->int(2, 8); $v = $u + $a * $t; if ($v < 0) { $a = abs($a); $v = $u + $a * $t; }
            return mlb_typed('num', 'On a velocity–time graph, the velocity changes from $' . $u . '$ m/s to $' . $v . '$ m/s in $' . $t . '$ s. Find the acceleration, in m/s².', mlb_dec(($v - $u) / $t),
                ['Acceleration is the gradient of a velocity–time graph.', '$\\frac{' . $v . ' - ' . $u . '}{' . $t . '} = ' . mlb_dec(($v - $u) / $t) . '$ m/s².'], 'Change in velocity over time.', 'procedure', 40, ['unit' => 'm/s²']); },
        static function (MlbRng $r) { $c = $r->int(0, 1);
            return mlb_mcq($r, 'On a velocity–time graph, what does the ' . ($c ? 'gradient' : 'area under the graph') . ' represent?', $c ? 'Acceleration' : 'Displacement (distance travelled)',
                [[$c ? 'Displacement' : 'Acceleration', $c ? 'Displacement is the AREA under a velocity–time graph.' : 'Acceleration is the GRADIENT of a velocity–time graph.'], ['Speed', 'Speed is read straight off the vertical axis.'], ['Time', 'Time is the horizontal axis.']],
                ['Gradient $= \\frac{\\Delta v}{\\Delta t}$ = acceleration; area $= v \\times t$ = displacement.', 'So: ' . ($c ? 'acceleration' : 'displacement') . '.'], 'Units help: m/s × s = m.', 'concept', 30); },
        static function (MlbRng $r) { $v = 2 * $r->int(5, 15); $t = $r->int(2, 8);
            return mlb_typed('num', 'A driver brakes steadily from $' . $v . '$ m/s to a stop in $' . $t . '$ s. How far does the car travel while braking?', (string)($v * $t / 2),
                ['The graph is a triangle from $' . $v . '$ m/s down to 0.', 'Area $= \\frac{1}{2} \\times ' . $t . ' \\times ' . $v . ' = ' . ($v * $t / 2) . '$ m.'], 'Average speed × time.', 'application', 45, ['unit' => 'm']); },
        static function (MlbRng $r) { $v = 2 * $r->int(5, 15); $t = $r->int(2, 8);
            return mlb_error_of($r, 'A car accelerates steadily from rest to $' . $v . '$ m/s in $' . $t . '$ s. Find the first mistake in this working for the distance travelled.',
                ['The distance is the area under the velocity–time graph', 'The graph is a triangle with base $' . $t . '$ and height $' . $v . '$', 'Distance $= \\frac{1}{2} \\times ' . $t . ' \\times ' . $v . ' = ' . ($v * $t / 2) . '$ m'], [
                [0, ['Distance $=$ speed $\\times$ time', 'Its speed is $' . $v . '$ m/s', 'Distance $= ' . $v . ' \\times ' . $t . ' = ' . ($v * $t) . '$ m'], 'the car was not at ' . $v . ' m/s the whole time; its speed rose from 0, so use the area (or the average speed).'],
                [2, ['The distance is the area under the velocity–time graph', 'The graph is a triangle with base $' . $t . '$ and height $' . $v . '$', 'Distance $= ' . $t . ' \\times ' . $v . ' = ' . ($v * $t) . '$ m'], 'a triangle\'s area has a half in it.'],
            ]); },
    ];
    $f['MC-162'] = [
        static function (MlbRng $r) { $u = $r->int(0, 20); $a = $r->int(1, 6); $t = $r->int(2, 10);
            return mlb_typed('num', 'A particle starts at $' . $u . '$ m/s and accelerates at $' . $a . '$ m/s² for $' . $t . '$ s. Find its final velocity.', (string)($u + $a * $t),
                ['$v = u + at$.', '$' . $u . ' + ' . $a . ' \\times ' . $t . ' = ' . ($u + $a * $t) . '$ m/s.'], 'Start speed plus the gain.', 'procedure', 30, ['unit' => 'm/s']); },
        static function (MlbRng $r) { $u = $r->int(0, 15); $a = 2 * $r->int(1, 4); $t = $r->int(2, 10);
            return mlb_typed('num', 'A particle starts at $' . $u . '$ m/s with acceleration $' . $a . '$ m/s². How far does it travel in $' . $t . '$ s?', (string)($u * $t + $a * $t * $t / 2),
                ['$s = ut + \\frac{1}{2}at^2$.', '$' . $u . ' \\times ' . $t . ' + \\frac{1}{2} \\times ' . $a . ' \\times ' . ($t * $t) . ' = ' . ($u * $t + $a * $t * $t / 2) . '$ m.'], 'Choose the equation with $u$, $a$, $t$ and $s$.', 'procedure', 45, ['unit' => 'm']); },
        static function (MlbRng $r) { [$p, $q, $c] = $r->pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]); $s = $q * $q / 2;
            return mlb_typed('num', 'A ball is moving at $' . $p . '$ m/s and accelerates at $1$ m/s² over $' . mlb_dec($s) . '$ m. What is its final speed?', (string)$c,
                ['No time is given, so use $v^2 = u^2 + 2as$.', '$v^2 = ' . ($p * $p) . ' + 2 \\times 1 \\times ' . mlb_dec($s) . ' = ' . ($c * $c) . '$, so $v = ' . $c . '$ m/s.'], 'The equation without $t$.', 'procedure', 50, ['unit' => 'm/s']); },
        static function (MlbRng $r) { $a = $r->int(1, 6); $t = $r->int(1, 6);
            return mlb_typed('num', 'A particle\'s displacement is $s = t^3 - ' . $a . 't^2$ metres. Find its velocity at $t = ' . $t . '$ s.', (string)(3 * $t * $t - 2 * $a * $t),
                ['$v = \\frac{ds}{dt} = 3t^2 - ' . (2 * $a) . 't$.', 'At $t = ' . $t . '$: $' . (3 * $t * $t) . ' - ' . (2 * $a * $t) . ' = ' . (3 * $t * $t - 2 * $a * $t) . '$ m/s.'], 'Velocity is the derivative of displacement.', 'procedure', 45, ['unit' => 'm/s']); },
        static function (MlbRng $r) { $u = 2 * $r->int(5, 15); $d = $r->pick([2, 4, 5]);
            return mlb_typed('num', 'A car travelling at $' . $u . '$ m/s brakes with a deceleration of $' . $d . '$ m/s². What is its stopping distance?', mlb_dec($u * $u / (2 * $d)),
                ['$v^2 = u^2 + 2as$ with $v = 0$, $a = -' . $d . '$.', '$0 = ' . ($u * $u) . ' - ' . (2 * $d) . 's$, so $s = ' . mlb_dec($u * $u / (2 * $d)) . '$ m.'], 'Final speed is zero.', 'application', 50, ['unit' => 'm']); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'You know $u$, $v$ and $a$, and want the distance $s$. Which equation should you use?', '$v^2 = u^2 + 2as$',
                [['$s = ut + \\frac{1}{2}at^2$', 'That needs the time $t$, which you do not know.'], ['$v = u + at$', 'That has no $s$ in it.'], ['$s = \\frac{1}{2}(u + v)t$', 'That needs $t$ too.']],
                ['Pick the equation that contains exactly the quantities you know and the one you want.', '$v^2 = u^2 + 2as$ has $u$, $v$, $a$ and $s$, and no $t$.'], 'Which variable is missing?', 'reasoning', 35); },
    ];
    $f['MC-163'] = [
        static function (MlbRng $r) { $m = $r->int(2, 50); $a = $r->int(1, 8);
            return mlb_typed('num', 'What resultant force, in newtons, gives a $' . $m . '$ kg mass an acceleration of $' . $a . '$ m/s²?', (string)($m * $a),
                ['Newton\'s second law: $F = ma$.', '$' . $m . ' \\times ' . $a . ' = ' . ($m * $a) . '$ N.'], '$F = ma$.', 'procedure', 25, ['unit' => 'N']); },
        static function (MlbRng $r) { $m = $r->int(2, 20); $F = $r->int(5, 120);
            return mlb_typed('num', 'A resultant force of $' . $F . '$ N acts on a $' . $m . '$ kg trolley. Find its acceleration in m/s², to 2 decimal places.', mlb_rd($F / $m, 2),
                ['$a = \\frac{F}{m}$.', '$\\frac{' . $F . '}{' . $m . '} \\approx ' . mlb_rd($F / $m, 2) . '$ m/s².'], 'Rearrange $F = ma$.', 'procedure', 30, ['unit' => 'm/s²', 'dp' => 2]); },
        static function (MlbRng $r) { $m = $r->int(2, 30); $up = $m * 10 + $r->int(10, 80);
            return mlb_typed('num', 'A $' . $m . '$ kg crate is lifted by a rope with tension $' . $up . '$ N. Taking $g = 10$ m/s², find its upward acceleration, to 2 decimal places.', mlb_rd(($up - 10 * $m) / $m, 2),
                ['Weight $= mg = ' . (10 * $m) . '$ N downwards; resultant $= ' . $up . ' - ' . (10 * $m) . ' = ' . ($up - 10 * $m) . '$ N up.', '$a = \\frac{' . ($up - 10 * $m) . '}{' . $m . '} \\approx ' . mlb_rd(($up - 10 * $m) / $m, 2) . '$ m/s².'], 'Resultant force first.', 'application', 60, ['unit' => 'm/s²', 'dp' => 2]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A lorry moves along a straight road at a constant 20 m/s. What is the resultant force on it?', 'Zero',
                [['A forward force bigger than the resistance', 'If the forward force were bigger, the lorry would be speeding up.'], ['A force of 20 N forwards', 'Speed is not force.'], ['It depends on the mass', 'At constant velocity the resultant is zero whatever the mass.']],
                ['Newton\'s first law: constant velocity means no acceleration.', 'So the resultant force is zero: the driving force balances the resistance.'], 'Constant velocity: is it accelerating?', 'concept', 30); },
        static function (MlbRng $r) { $m = $r->int(3, 15); $F1 = $r->int(20, 80); $F2 = $r->int(5, $F1 - 5);
            return mlb_typed('num', 'Two people push a $' . $m . '$ kg box in opposite directions with forces of $' . $F1 . '$ N and $' . $F2 . '$ N. Find the box\'s acceleration, to 2 decimal places.', mlb_rd(($F1 - $F2) / $m, 2),
                ['Opposite forces: resultant $= ' . $F1 . ' - ' . $F2 . ' = ' . ($F1 - $F2) . '$ N.', '$a = \\frac{' . ($F1 - $F2) . '}{' . $m . '} \\approx ' . mlb_rd(($F1 - $F2) / $m, 2) . '$ m/s².'], 'Opposite forces subtract.', 'reasoning', 45, ['unit' => 'm/s²', 'dp' => 2]); },
    ];
    $f['MC-164'] = [
        static function (MlbRng $r) { $F = $r->int(5, 80); $d = $r->pick([0.2, 0.25, 0.3, 0.5, 0.8, 1, 1.5, 2]);
            return mlb_typed('num', 'A force of $' . $F . '$ N acts at right angles to a spanner, $' . mlb_dec($d) . '$ m from the bolt. Find the moment in N m.', mlb_dec($F * $d),
                ['Moment $=$ force $\\times$ perpendicular distance.', '$' . $F . ' \\times ' . mlb_dec($d) . ' = ' . mlb_dec($F * $d) . '$ N m.'], 'Force times distance from the pivot.', 'procedure', 30, ['unit' => 'N m']); },
        static function (MlbRng $r) { $m1 = 5 * $r->int(4, 12); $d1 = $r->pick([1, 1.5, 2, 2.5]); $m2 = 5 * $r->int(4, 12);
            return mlb_typed('num', 'A $' . $m1 . '$ kg child sits $' . mlb_dec($d1) . '$ m from the pivot of a see-saw. How far from the pivot, on the other side, must a $' . $m2 . '$ kg child sit to balance it? Give your answer to 2 decimal places (m).', mlb_rd($m1 * $d1 / $m2, 2),
                ['Balance: clockwise moments equal anticlockwise moments.', '$' . $m1 . ' \\times ' . mlb_dec($d1) . ' = ' . $m2 . 'd$, so $d \\approx ' . mlb_rd($m1 * $d1 / $m2, 2) . '$ m.'], 'Moments balance.', 'application', 50, ['unit' => 'm', 'dp' => 2]); },
        static function (MlbRng $r) { $m = $r->int(2, 40); $mu = $r->pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5]);
            return mlb_typed('num', 'A $' . $m . '$ kg box rests on a horizontal floor. The coefficient of friction is $' . mlb_dec($mu) . '$. Taking $g = 10$ m/s², what is the greatest friction force?', mlb_dec($mu * 10 * $m),
                ['On a horizontal floor, $R = mg = ' . (10 * $m) . '$ N.', '$F_{\\max} = \\mu R = ' . mlb_dec($mu) . ' \\times ' . (10 * $m) . ' = ' . mlb_dec($mu * 10 * $m) . '$ N.'], 'Friction $\\le \\mu R$.', 'procedure', 40, ['unit' => 'N']); },
        static function (MlbRng $r) { $m1 = $r->int(3, 10); $m2 = $r->int(1, $m1 - 1);
            return mlb_typed('frac', 'Masses of $' . $m1 . '$ kg and $' . $m2 . '$ kg hang on either side of a smooth pulley, joined by a light string. Taking $g = 10$ m/s², find the acceleration as a fraction (m/s²).', mlb_frac(10 * ($m1 - $m2), $m1 + $m2),
                ['The system: driving force $(' . $m1 . ' - ' . $m2 . ')g$ moves total mass $' . ($m1 + $m2) . '$ kg.', '$a = \\frac{' . ($m1 - $m2) . ' \\times 10}{' . ($m1 + $m2) . '} = ' . mlb_ftex(10 * ($m1 - $m2), $m1 + $m2) . '$ m/s².'], 'Treat the masses as one system.', 'reasoning', 60); },
        static function (MlbRng $r) { $F = $r->int(10, 60); $d = $r->int(1, 4); $th = $r->pick([30, 45, 60]);
            return mlb_mcq($r, 'A force of $' . $F . '$ N is applied at the end of a $' . $d . '$ m bar, at $' . mlb_deg($th) . '$ to the bar. Which is its moment about the other end?', $F . ' × ' . $d . ' × sin ' . $th . '°',
                [[$F . ' × ' . $d, 'The force is not at right angles; only its perpendicular component turns the bar.'], [$F . ' × ' . $d . ' × cos ' . $th . '°', 'The component along the bar (cos) pulls along it and turns nothing.'], [$F . ' ÷ ' . $d, 'Moments multiply force by distance.']],
                ['Moment $=$ force $\\times$ perpendicular distance $=$ perpendicular component $\\times$ distance.', 'The perpendicular component is $' . $F . '\\sin ' . $th . '^\\circ$.'], 'Only the part at right angles turns it.', 'reasoning', 45); },
    ];
    $f['MC-165'] = [
        static function (MlbRng $r) { $m = $r->int(1, 2000); $v = $r->int(1, 30);
            return mlb_typed('num', 'Find the momentum of a $' . $m . '$ kg object moving at $' . $v . '$ m/s, in kg m/s.', (string)($m * $v),
                ['Momentum $p = mv$.', '$' . $m . ' \\times ' . $v . ' = ' . ($m * $v) . '$ kg m/s.'], 'Mass times velocity.', 'procedure', 20); },
        static function (MlbRng $r) { $m1 = $r->int(1, 8); $u1 = $r->int(2, 12); $m2 = $r->int(1, 8); $u2 = $r->int(-6, 6);
            return mlb_typed('frac', 'A $' . $m1 . '$ kg trolley at $' . $u1 . '$ m/s hits a $' . $m2 . '$ kg trolley moving at $' . $u2 . '$ m/s (same line). They join and move together. Find their common velocity as a fraction (m/s).', mlb_frac($m1 * $u1 + $m2 * $u2, $m1 + $m2),
                ['Momentum is conserved: $' . $m1 . ' \\times ' . $u1 . ' + ' . $m2 . ' \\times (' . $u2 . ') = (' . $m1 . ' + ' . $m2 . ')v$.', '$v = \\frac{' . ($m1 * $u1 + $m2 * $u2) . '}{' . ($m1 + $m2) . '} = ' . mlb_ftex($m1 * $u1 + $m2 * $u2, $m1 + $m2) . '$ m/s.'], 'Total momentum before = after.', 'procedure', 60); },
        static function (MlbRng $r) { $m = $r->pick([0.05, 0.1, 0.2, 0.5]); $u = $r->int(5, 30); $v = $r->int(5, 30);
            return mlb_typed('num', 'A $' . mlb_dec($m) . '$ kg ball hits a wall at $' . $u . '$ m/s and bounces straight back at $' . $v . '$ m/s. Find the size of the impulse, in N s.', mlb_dec($m * ($u + $v)),
                ['Impulse $=$ change in momentum; the direction reverses, so velocities have opposite signs.', '$' . mlb_dec($m) . '(' . $v . ' - (-' . $u . ')) = ' . mlb_dec($m * ($u + $v)) . '$ N s.'], 'Mind the change of direction.', 'reasoning', 50, ['unit' => 'N s']); },
        static function (MlbRng $r) { $mb = $r->pick([0.01, 0.02, 0.05]); $vb = 50 * $r->int(4, 10); $mg = $r->int(2, 6);
            return mlb_typed('num', 'A $' . $mg . '$ kg gun fires a $' . mlb_dec($mb) . '$ kg bullet at $' . $vb . '$ m/s. At what speed does the gun recoil, to 2 decimal places?', mlb_rd($mb * $vb / $mg, 2),
                ['Before firing, total momentum is 0, so afterwards $' . mlb_dec($mb) . ' \\times ' . $vb . ' = ' . $mg . 'v$.', '$v \\approx ' . mlb_rd($mb * $vb / $mg, 2) . '$ m/s backwards.'], 'Momentum before = momentum after = 0.', 'application', 50, ['unit' => 'm/s', 'dp' => 2]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In a collision between two trolleys with no outside forces, which quantity is always conserved?', 'Total momentum',
                [['Total kinetic energy', 'Kinetic energy is often lost as heat and sound; only in perfectly elastic collisions is it kept.'], ['The velocity of each trolley', 'The velocities change — that is what a collision does.'], ['The momentum of each trolley', 'Momentum passes between them; only the TOTAL stays the same.']],
                ['With no external force, total momentum is conserved.', 'Energy can change form, so kinetic energy is not always kept.'], 'Which is always true?', 'concept', 30); },
    ];
    $f['MC-166'] = [
        static function (MlbRng $r) { $a = $r->int(5, 30); $b = $r->int(5, 30); $c = $r->int(5, 30); $d = $r->int(5, 30);
            return mlb_typed('frac', 'In a survey, ' . $a . ' girls and ' . $b . ' boys walk to school; ' . $c . ' girls and ' . $d . ' boys take the bus. A student is chosen at random. Given that the student is a girl, what is the probability she walks?', mlb_frac($a, $a + $c),
                ['$P(\\text{walk} \\mid \\text{girl}) = \\frac{P(\\text{walk and girl})}{P(\\text{girl})}$ — restrict to the girls.', 'There are $' . ($a + $c) . '$ girls, of whom $' . $a . '$ walk: $' . mlb_ftex($a, $a + $c) . '$.'], 'Shrink the sample space to the condition.', 'procedure', 60); },
        static function (MlbRng $r) { $n = $r->int(3, 8); $k = $r->int(0, $n);
            return mlb_typed('frac', 'A fair coin is tossed ' . $n . ' times. What is the probability of exactly ' . $k . ' heads?', mlb_frac(mlb_ncr($n, $k), 2 ** $n),
                ['$P(X = ' . $k . ') = \\binom{' . $n . '}{' . $k . '}\\left(\\frac{1}{2}\\right)^{' . $n . '}$.', '$\\frac{' . mlb_ncr($n, $k) . '}{' . (2 ** $n) . '} = ' . mlb_ftex(mlb_ncr($n, $k), 2 ** $n) . '$.'], 'Binomial: choose which tosses are heads.', 'procedure', 50); },
        static function (MlbRng $r) { $x = [0, 1, 2, 3]; do { $p = [$r->int(1, 5), $r->int(1, 5), $r->int(1, 5), $r->int(1, 5)]; } while (array_sum($p) < 4); $s = array_sum($p);
            $E = ($x[1] * $p[1] + $x[2] * $p[2] + $x[3] * $p[3]);
            return mlb_typed('frac', '$X$ takes the values $0, 1, 2, 3$ with probabilities $' . implode(', ', array_map(static fn($v) => mlb_ftex($v, $s), $p)) . '$. Find $E(X)$.', mlb_frac($E, $s),
                ['$E(X) = \\sum x\\,P(X = x)$.', '$0 \\cdot ' . mlb_ftex($p[0], $s) . ' + 1 \\cdot ' . mlb_ftex($p[1], $s) . ' + 2 \\cdot ' . mlb_ftex($p[2], $s) . ' + 3 \\cdot ' . mlb_ftex($p[3], $s) . ' = ' . mlb_ftex($E, $s) . '$.'], 'Weight each value by its probability.', 'procedure', 60); },
        static function (MlbRng $r) { $pa = $r->pick([[1, 2], [1, 3], [2, 5]]); $pb = $r->pick([[1, 2], [1, 4], [3, 5]]); $ind = $r->int(0, 1) === 1;
            $pab = $ind ? [$pa[0] * $pb[0], $pa[1] * $pb[1]] : [$pa[0] * $pb[0] + 1, $pa[1] * $pb[1]];
            return mlb_mcq($r, '$P(A) = ' . mlb_ftex($pa[0], $pa[1]) . '$, $P(B) = ' . mlb_ftex($pb[0], $pb[1]) . '$ and $P(A \\cap B) = ' . mlb_ftex($pab[0], $pab[1]) . '$. Are $A$ and $B$ independent?', $ind ? 'Yes' : 'No',
                [[$ind ? 'No' : 'Yes', 'Check whether $P(A)P(B) = P(A \\cap B)$.'], ['Only if they are mutually exclusive', 'Mutually exclusive events (with non-zero probabilities) are NEVER independent.']],
                ['Independent means $P(A \\cap B) = P(A)P(B)$.', '$P(A)P(B) = ' . mlb_ftex($pa[0] * $pb[0], $pa[1] * $pb[1]) . '$' . ($ind ? ', which matches.' : ', which does not match.')], 'Multiply and compare.', 'reasoning', 45); },
        static function (MlbRng $r) { $n = $r->int(2, 6); $o = $r->pick([4, 5]);
            return mlb_typed('frac', 'A quiz has ' . $n . ' questions, each with ' . $o . ' options. A student guesses every answer. What is the probability that all ' . $n . ' are right?', mlb_frac(1, $o ** $n),
                ['Each guess is right with probability $' . mlb_ftex(1, $o) . '$, independently.', '$\\left(' . mlb_ftex(1, $o) . '\\right)^' . $n . ' = ' . mlb_ftex(1, $o ** $n) . '$.'], 'Independent events multiply.', 'application', 40); },
    ];
    $f['MC-167'] = [
        static function (MlbRng $r) { $a = $r->int(-20, 50); $b = $r->pick([0.5, 1.2, 1.5, 2, 2.5, 3, -0.8, -1.5]); $x = $r->int(5, 40);
            return mlb_typed('num', 'The regression line of $y$ on $x$ is $y = ' . $a . ' ' . ($b < 0 ? '- ' . mlb_dec(-$b) : '+ ' . mlb_dec($b)) . 'x$. Estimate $y$ when $x = ' . $x . '$.', mlb_dec($a + $b * $x),
                ['Substitute into the line.', '$' . $a . ' + (' . mlb_dec($b) . ')(' . $x . ') = ' . mlb_dec($a + $b * $x) . '$.'], 'Put $x$ into the equation.', 'procedure', 30); },
        static function (MlbRng $r) { $mx = $r->int(5, 30); $my = $r->int(20, 90); $b = $r->pick([0.5, 1.5, 2, 2.5, 3, -1, -2]);
            return mlb_typed('num', 'A regression line $y = a + ' . mlb_dec($b) . 'x$ passes through the mean point $(\\bar{x}, \\bar{y}) = (' . $mx . ', ' . $my . ')$. Find $a$.', mlb_dec($my - $b * $mx),
                ['The regression line always passes through $(\\bar{x}, \\bar{y})$.', '$' . $my . ' = a + ' . mlb_dec($b) . ' \\times ' . $mx . '$, so $a = ' . mlb_dec($my - $b * $mx) . '$.'], 'Substitute the means.', 'procedure', 40); },
        static function (MlbRng $r) { $c = $r->int(0, 2);
            $cases = [['hours of revision and test marks — more revision tends to go with higher marks', 'Positive correlation'], ['the age of a car and its value — older cars tend to be worth less', 'Negative correlation'], ['shoe size and the day of the month someone was born', 'No correlation']];
            [$what, $right] = $cases[$c]; $wrong = []; foreach ($cases as $i => [$w, $t]) if ($i !== $c) $wrong[] = [$t, 'That would describe: ' . $w . '.'];
            return mlb_mcq($r, 'What kind of correlation would you expect between ' . $what . '?', $right, $wrong, [$right . ': as one variable changes, the other ' . ($c === 0 ? 'tends to rise.' : ($c === 1 ? 'tends to fall.' : 'shows no pattern.')), 'Correlation describes the trend, not a rule for every point.'], 'As one goes up, what does the other do?', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Across Nigerian cities, ice-cream sales and drownings show strong positive correlation. What can you conclude?', 'They may both be driven by a third factor, such as hot weather',
                [['Ice cream causes drowning', 'Correlation alone never shows cause.'], ['Drowning causes people to buy ice cream', 'Correlation alone never shows cause, in either direction.'], ['The data must be wrong', 'The correlation can be real without one causing the other.']],
                ['Correlation is not causation.', 'Hot weather increases both swimming and ice-cream sales: a confounding variable.'], 'Is there a hidden third variable?', 'reasoning', 40); },
        static function (MlbRng $r) { $a = 10 * $r->int(5, 30); $b = $r->int(2, 12); $x = 5 * $r->int(2, 20);
            return mlb_typed('num', 'A shop finds its weekly sales $S$ (in thousands of naira) fit $S = ' . $a . ' + ' . $b . 'A$, where $A$ is its advertising spend (thousands of naira). Predict sales when $A = ' . $x . '$.', (string)($a + $b * $x),
                ['Substitute $A = ' . $x . '$.', '$' . $a . ' + ' . $b . ' \\times ' . $x . ' = ' . ($a + $b * $x) . '$ thousand naira.'], 'Use the fitted line — within the data\'s range.', 'application', 40); },
    ];
    $f['MC-168'] = [
        static function (MlbRng $r) { $n = $r->int(5, 40);
            return mlb_typed('num', 'It can be proved by induction that $1 + 3 + 5 + \\dots + (2n - 1) = n^2$. Use it to find the sum of the first ' . $n . ' odd numbers.', (string)($n * $n),
                ['The first $n$ odd numbers add to $n^2$.', '$' . $n . '^2 = ' . ($n * $n) . '$.'], 'Use the proved formula.', 'procedure', 30); },
        static function (MlbRng $r) { $n = $r->int(10, 200);
            return mlb_typed('num', 'Using $\\sum_{r=1}^{n} r = \\frac{n(n + 1)}{2}$, find $1 + 2 + 3 + \\dots + ' . $n . '$.', (string)($n * ($n + 1) / 2),
                ['$\\frac{' . $n . ' \\times ' . ($n + 1) . '}{2}$.', '$= ' . ($n * ($n + 1) / 2) . '$.'], 'Gauss\'s pairing.', 'procedure', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In a proof by induction of a statement about all positive integers $n$, what does the BASE CASE show?', 'The statement is true for $n = 1$',
                [['The statement is true for all $n$', 'That is what the whole proof establishes, not the base case alone.'], ['If it is true for $n = k$, it is true for $n = k + 1$', 'That is the inductive step.'], ['The statement is true for large $n$', 'Induction starts from the smallest case.']],
                ['Base case: check the first value.', 'The inductive step then carries truth from each case to the next, like dominoes.'], 'Which domino falls first?', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A student checks that $n^2 + n + 41$ is prime for $n = 1, 2, 3, \\dots, 10$ and concludes it is prime for every $n$. What is wrong?', 'Checking examples is not a proof — it fails at $n = 40$',
                [['Nothing: ten cases is enough', '$40^2 + 40 + 41 = 41^2$, which is not prime.'], ['They should have checked 100 cases', 'No number of cases proves a statement about ALL $n$.'], ['Primes cannot be tested this way', 'Each case can be tested; the error is generalising from them.']],
                ['Examples can disprove a claim, but never prove it for all $n$.', 'Here $n = 40$ gives $41^2$: a counter-example.'], 'Can examples ever prove "for all"?', 'reasoning', 45); },
        static function (MlbRng $r) { $k = $r->int(3, 12);
            return mlb_typed('num', 'In an induction proof of $1 + 2 + \\dots + n = \\frac{n(n+1)}{2}$, you assume the result for $n = ' . $k . '$ and add the next term. What is that next term?', (string)($k + 1),
                ['The inductive step goes from $n = k$ to $n = k + 1$.', 'The next term added is $k + 1 = ' . ($k + 1) . '$.'], 'What comes after the $k$th term?', 'application', 30); },
    ];
    $f['MC-169'] = [
        static function (MlbRng $r) { $k = 2 * $r->int(1, 5); $c = $r->int(-10, 10); $x = $r->int(1, 6);
            return mlb_typed('num', 'Solve $\\frac{dy}{dx} = ' . $k . 'x$ with $y = ' . $c . '$ when $x = 0$. Find $y$ when $x = ' . $x . '$.', (string)($c + $k / 2 * $x * $x),
                ['Integrate: $y = ' . ($k / 2) . 'x^2 + C$, and $C = ' . $c . '$.', 'At $x = ' . $x . '$: $' . ($k / 2 * $x * $x) . mlb_sterm($c) . ' = ' . ($c + $k / 2 * $x * $x) . '$.'], 'Integrate, then use the condition.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $b = $r->int(-5, 5); $x = $r->int(-3, 3); $y = $r->int(-3, 3);
            return mlb_typed('num', '$f(x, y) = ' . $a . 'x^2y' . mlb_sterm($b, 'y') . '$. Find $\\frac{\\partial f}{\\partial x}$ at $(' . $x . ', ' . $y . ')$.', (string)(2 * $a * $x * $y),
                ['Differentiate with respect to $x$, treating $y$ as a constant: $\\frac{\\partial f}{\\partial x} = ' . (2 * $a) . 'xy$.', 'At $(' . $x . ', ' . $y . ')$: $' . (2 * $a * $x * $y) . '$.'], 'Hold $y$ fixed.', 'procedure', 45); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which function satisfies $\\frac{dy}{dx} = 3y$?', '$y = Ae^{3x}$',
                [['$y = 3x^2$', 'Its derivative is $6x$, not $3 \\times 3x^2$.'], ['$y = e^{x} + 3$', 'Its derivative is $e^x$, which is not $3y$.'], ['$y = \\frac{3}{2}y^2$', 'That is not even a function of $x$.']],
                ['A rate proportional to the amount gives exponential growth.', '$\\frac{d}{dx}Ae^{3x} = 3Ae^{3x} = 3y$. ✓'], 'Growth proportional to size.', 'concept', 35); },
        static function (MlbRng $r) { $P0 = 100 * $r->int(1, 50); $k = $r->pick([0.02, 0.05, 0.1]); $t = $r->int(5, 30);
            return mlb_typed('num', 'A culture grows so that $\\frac{dP}{dt} = ' . mlb_dec($k) . 'P$, with $P = ' . $P0 . '$ at $t = 0$. The solution is $P = ' . $P0 . 'e^{' . mlb_dec($k) . 't}$. Find $P$ when $t = ' . $t . '$, to the nearest whole number.', mlb_rd($P0 * exp($k * $t), 0),
                ['$P = ' . $P0 . 'e^{' . mlb_dec($k * $t) . '}$.', '$\\approx ' . mlb_rd($P0 * exp($k * $t), 0) . '$.'], 'Substitute into the solution.', 'application', 50, ['dp' => 0]); },
        static function (MlbRng $r) { $k = $r->int(1, 4);
            return mlb_error_of($r, 'Find the first mistake in this working to solve $\\frac{dy}{dx} = ' . (2 * $k) . 'x$ with $y = 1$ when $x = 0$.',
                ['$y = \\int ' . (2 * $k) . 'x\\,dx = ' . $k . 'x^2 + C$', 'At $x = 0$: $1 = 0 + C$, so $C = 1$', '$y = ' . $k . 'x^2 + 1$'], [
                [0, ['$y = \\int ' . (2 * $k) . 'x\\,dx = ' . $k . 'x^2$', 'At $x = 0$: $y = 0$', 'So the condition $y = 1$ cannot be met'], 'the constant of integration $+ C$ was dropped; it is what lets the condition be satisfied.'],
                [1, ['$y = \\int ' . (2 * $k) . 'x\\,dx = ' . $k . 'x^2 + C$', 'At $x = 0$: $C = 0$', '$y = ' . $k . 'x^2$'], 'substituting $x = 0$, $y = 1$ gives $1 = 0 + C$, so $C = 1$.'],
            ]); },
    ];
    $f['MC-170'] = [
        static function (MlbRng $r) { $a = $r->pick([2, 3, 5, 6, 7, 10, 11]); $x0 = $r->pick([1, 2, 3]); $x1 = $x0 - ($x0 * $x0 - $a) / (2 * $x0);
            return mlb_typed('num', 'Use one step of the Newton–Raphson method on $f(x) = x^2 - ' . $a . '$, starting from $x_0 = ' . $x0 . '$, to estimate $\\sqrt{' . $a . '}$. Give $x_1$ to 4 decimal places.', mlb_rd($x1, 4),
                ['$x_1 = x_0 - \\frac{f(x_0)}{f\'(x_0)}$ with $f\'(x) = 2x$.', '$' . $x0 . ' - \\frac{' . ($x0 * $x0 - $a) . '}{' . (2 * $x0) . '} = ' . mlb_rd($x1, 4) . '$.'], 'Follow the tangent to the axis.', 'procedure', 60, ['dp' => 4]); },
        static function (MlbRng $r) { $a = $r->int(1, 3); $b = $a + 1;
            return mlb_typed('num', '$f(x) = x^3 - ' . ($a * $a * $a + $a) . '$ changes sign between $x = ' . $a . '$ and $x = ' . $b . '$. With the bisection method, what is the next value of $x$ to test?', mlb_dec(($a + $b) / 2),
                ['Bisection tests the midpoint of the interval.', '$\\frac{' . $a . ' + ' . $b . '}{2} = ' . mlb_dec(($a + $b) / 2) . '$.'], 'Halve the interval.', 'procedure', 30); },
        static function (MlbRng $r) { $P = 1000 * $r->int(1, 50); $rate = $r->pick([2, 3, 5, 8, 10]); $t = $r->int(2, 10);
            return mlb_typed('num', 'A town of ' . mlb_p($P) . ' people grows by $' . $rate . '\\%$ a year. Using $P = ' . mlb_n($P) . '(1.' . str_pad((string)$rate, 2, '0', STR_PAD_LEFT) . ')^t$, predict the population after ' . $t . ' years, to the nearest whole number.', mlb_rd($P * (1 + $rate / 100) ** $t, 0),
                ['Each year multiplies by $1 + \\frac{' . $rate . '}{100}$.', '$' . mlb_n($P) . ' \\times ' . mlb_dec(1 + $rate / 100) . '^{' . $t . '} \\approx ' . mlb_n((int)round($P * (1 + $rate / 100) ** $t)) . '$.'], 'Repeated multiplication.', 'application', 50, ['dp' => 0]); },
        static function (MlbRng $r) { $true = $r->int(50, 500); $err = $r->int(1, 20) * ($r->int(0, 1) ? 1 : -1); $est = $true + $err;
            return mlb_typed('num', 'A model predicts $' . $est . '$ when the true value is $' . $true . '$. What is the percentage error, to 2 decimal places? (Give the size, without a sign.)', mlb_rd(abs($err) / $true * 100, 2),
                ['Percentage error $= \\frac{|\\text{estimate} - \\text{true}|}{\\text{true}} \\times 100$.', '$\\frac{' . abs($err) . '}{' . $true . '} \\times 100 \\approx ' . mlb_rd(abs($err) / $true * 100, 2) . '\\%$.'], 'Divide by the TRUE value.', 'procedure', 40, ['unit' => '%', 'dp' => 2]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A modeller predicts a city\'s population 200 years ahead with $P = P_0(1.03)^t$. What is the biggest weakness?', 'Assuming the growth rate stays 3% for 200 years',
                [['Using a power of $t$', 'Exponential models are standard for growth; the problem is the fixed rate.'], ['Rounding the answer', 'Rounding is minor next to the assumption about the rate.'], ['Using today\'s population', 'Starting from known data is correct.']],
                ['Every model rests on assumptions.', 'Over 200 years, land, resources and policy change the rate: the constant-rate assumption fails.'], 'What does the model assume never changes?', 'reasoning', 40); },
    ];

    return $f;
}
