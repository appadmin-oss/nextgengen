<?php
declare(strict_types=1);

/**
 * Maths Lab — the question forms (docs/MATH-LAB-PLAN.md §8.5).
 *
 * Every question is GENERATED from a form and a seed, and its answer — and
 * every wrong option of a multiple choice — is derived from the same numbers
 * that built it. A form cannot carry a mistyped key, the supply never runs
 * out, and (competency, form, seed) reproduces any question exactly for
 * marking, review or an appeal.
 *
 * The quality rules the old Math Lab broke, and these forms keep:
 *   · test the named skill (an expansion is answered as an expression, not
 *     "the coefficient of x"; an index law is answered as an index);
 *   · never print the method in the question;
 *   · valid at the level (real numbers, sensible values, no constant answers);
 *   · wrong options come from named misconceptions, so a wrong choice says
 *     what went wrong;
 *   · every question carries a worked solution and a hint;
 *   · maths is LaTeX ($…$), never "x^2" in prose.
 *
 * "Spot the error" items are the Lab's reasoning ("Defend") format: a worked
 * solution with one wrong line — the learner finds it, and the feedback says
 * why. Machine-marked, so it works at home without a marker.
 */

/* ── A seeded random source (mulberry32) — the same seed gives the same question ── */
final class MlbRng {
    private int $s;
    public function __construct(int $seed) { $this->s = $seed & 0xFFFFFFFF; }
    public function next(): float {
        $this->s = ($this->s + 0x6D2B79F5) & 0xFFFFFFFF;
        $t = $this->s;
        $t = $this->imul($t ^ ($t >> 15), $t | 1);
        $t ^= ($t + $this->imul($t ^ ($t >> 7), $t | 61)) & 0xFFFFFFFF;
        return (($t ^ ($t >> 14)) & 0xFFFFFFFF) / 4294967296;
    }
    private function imul(int $a, int $b): int {
        $a &= 0xFFFFFFFF; $b &= 0xFFFFFFFF;
        $lo = (($a & 0xFFFF) * $b) & 0xFFFFFFFF;
        $hi = ((($a >> 16) * $b) & 0xFFFF) << 16;
        return ($lo + $hi) & 0xFFFFFFFF;
    }
    public function int(int $lo, int $hi): int { return $lo + (int)floor($this->next() * ($hi - $lo + 1)); }
    public function pick(array $a) { $a = array_values($a); return $a[$this->int(0, count($a) - 1)]; }
    public function shuffle(array $a): array {
        $a = array_values($a);
        for ($i = count($a) - 1; $i > 0; $i--) { $j = $this->int(0, $i); [$a[$i], $a[$j]] = [$a[$j], $a[$i]]; }
        return $a;
    }
    /** A non-zero integer in [lo, hi]. */
    public function nz(int $lo, int $hi): int { do { $v = $this->int($lo, $hi); } while ($v === 0); return $v; }
}

/* ── Small maths helpers ── */
function mlb_gcd(int $a, int $b): int { $a = abs($a); $b = abs($b); while ($b) { [$a, $b] = [$b, $a % $b]; } return max(1, $a); }
function mlb_lcm(int $a, int $b): int { return intdiv(abs($a * $b), mlb_gcd($a, $b)); }
/** A fraction in lowest terms as "a/b" (or "a" when whole), sign on the top. */
function mlb_frac(int $a, int $b): string {
    if ($b < 0) { $a = -$a; $b = -$b; }
    $g = mlb_gcd($a, $b); $a = intdiv($a, $g); $b = intdiv($b, $g);
    return $b === 1 ? (string)$a : $a . '/' . $b;
}
/** The same, as LaTeX. */
function mlb_ftex(int $a, int $b): string {
    $s = mlb_frac($a, $b);
    if (strpos($s, '/') === false) return $s;
    [$p, $q] = explode('/', $s);
    return ((int)$p < 0 ? '-' : '') . '\\frac{' . abs((int)$p) . '}{' . $q . '}';
}
/** A number for LaTeX with thousands grouped: 4{,}728. */
function mlb_n($x): string {
    if (is_int($x) || (is_float($x) && floor($x) == $x && abs($x) < 1e15)) return str_replace(',', '{,}', number_format((float)$x));
    return rtrim(rtrim(number_format((float)$x, 6, '.', ''), '0'), '.');
}
/** A number for prose: 4,728 / 0.35. */
function mlb_p($x): string { return str_replace('{,}', ',', mlb_n($x)); }
/** A decimal as a clean string key. */
function mlb_dec(float $x): string { $s = rtrim(rtrim(number_format($x, 8, '.', ''), '0'), '.'); return $s === '-0' ? '0' : $s; }
/** A signed term for LaTeX: +3x, -3x, +x, -x. */
function mlb_sterm(int $c, string $v = ''): string {
    if ($c === 0) return '';
    $abs = abs($c);
    return ($c < 0 ? ' - ' : ' + ') . ($v !== '' && $abs === 1 ? '' : (string)$abs) . $v;
}
/** A leading term: 3x, -3x, x, -x. */
function mlb_lterm(int $c, string $v = ''): string {
    if ($v !== '' && $c === 1) return $v;
    if ($v !== '' && $c === -1) return '-' . $v;
    return $c . $v;
}
const MLB_NAMES = ['Ada', 'Bola', 'Chidi', 'Dayo', 'Emeka', 'Funmi', 'Ngozi', 'Tunde', 'Zainab', 'Kwame', 'Amina', 'Ife', 'Kemi', 'Musa', 'Ebo', 'Halima'];

/** Words for 0–9999, as written in Nigerian schools ("three hundred and six"). */
function mlb_words(int $n): string {
    $ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
        'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    $tens = [2 => 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    $two = static function (int $x) use ($ones, $tens): string {
        if ($x < 20) return $ones[$x];
        return $tens[intdiv($x, 10)] . ($x % 10 ? '-' . $ones[$x % 10] : '');
    };
    if ($n < 100) return $two($n);
    $parts = [];
    if ($n >= 1000) $parts[] = $ones[intdiv($n, 1000)] . ' thousand';
    $h = intdiv($n % 1000, 100); $r = $n % 100;
    if ($h) $parts[] = $ones[$h] . ' hundred';
    if ($r) $parts[] = ($parts ? 'and ' : '') . $two($r);
    return implode(' ', $parts);
}

/* ── Item builders ─────────────────────────────────────────────────────── */

/** A typed answer. $kind: num | frac | expr | ratio | pair. */
function mlb_typed(string $kind, string $stem, $key, array $steps, string $hint, string $dim, int $secs, array $x = []): array {
    return $x + ['kind' => $kind, 'stem' => $stem, 'key' => $key, 'steps' => $steps, 'hint' => $hint, 'dim' => $dim, 'secs' => $secs, 'typed' => true];
}
/**
 * Multiple choice. $wrong = [[text, why-it-is-tempting], …] — each wrong option
 * is a named misconception, and the feedback shows its "why" when chosen.
 */
function mlb_mcq(MlbRng $r, string $stem, string $right, array $wrong, array $steps, string $hint, string $dim, int $secs, array $x = []): array {
    $opts = [['t' => $right, 'why' => '']];
    $seen = [$right => true];
    foreach ($wrong as [$t, $why]) { if (isset($seen[$t])) continue; $seen[$t] = true; $opts[] = ['t' => $t, 'why' => $why]; }
    $opts = $r->shuffle($opts);
    $key = 0;
    foreach ($opts as $i => $o) if ($o['t'] === $right) $key = $i;
    return $x + ['kind' => 'mcq', 'stem' => $stem, 'options' => array_column($opts, 't'), 'whys' => array_column($opts, 'why'),
        'key' => $key, 'steps' => $steps, 'hint' => $hint, 'dim' => $dim, 'secs' => $secs, 'typed' => false];
}
/**
 * Spot the error: a worked solution, one line of which is wrong (the line
 * $bad, 0-based, carries $wrongLine instead of the right working).
 */
function mlb_error(string $task, array $lines, int $bad, string $wrongLine, string $why, string $dim = 'reasoning'): array {
    $shown = $lines; $shown[$bad] = $wrongLine;
    return ['kind' => 'error', 'stem' => $task, 'lines' => array_values($shown),
        'options' => array_map(static fn($i) => 'Line ' . ($i + 1), array_keys($shown)), 'key' => $bad,
        'steps' => array_merge(['The mistake is in line ' . ($bad + 1) . ': ' . $why, 'The correct working:'], array_map(static fn($l, $i) => ($i + 1) . '. ' . $l, $lines, array_keys($lines))),
        'hint' => 'Check each line follows from the one before it.', 'dim' => $dim, 'secs' => 45, 'typed' => false];
}

/**
 * Spot the error, with the mistake on a DIFFERENT line from one item to the
 * next. Every such form used to put it on the same line every time (integers:
 * line 1; fractions and equations: line 2), so a child learned where the
 * answer sits, not how to check working. Each variant is a genuine mistake:
 * [bad line (0-based), the lines as shown — later lines carry the mistake
 * forward, as a real slip would — and why it is wrong].
 */
function mlb_error_of(MlbRng $r, string $task, array $right, array $variants, string $dim = 'reasoning'): array {
    [$bad, $shown, $why] = $variants[$r->int(0, count($variants) - 1)];
    return ['kind' => 'error', 'stem' => $task, 'lines' => array_values($shown),
        'options' => array_map(static fn($i) => 'Line ' . ($i + 1), array_keys($shown)), 'key' => $bad,
        'steps' => array_merge(['The first mistake is in line ' . ($bad + 1) . ': ' . $why, 'The correct working:'], array_map(static fn($l, $i) => ($i + 1) . '. ' . $l, $right, array_keys($right))),
        'hint' => 'Check each line follows from the one before it.', 'dim' => $dim, 'secs' => 45, 'typed' => false];
}

/* ── The forms, competency by competency ──────────────────────────────── */

/** The Maths Lab's forms: competency id → list of forms (each fn(MlbRng): item). The engine reads
 *  them through the Lab registry (lab_call('forms')), never by this name. */
function mlb_maths_forms(): array {
    static $f = null;
    if ($f !== null) return $f;

    $f = [
    /* ═══ Stage 1 — Number Consciousness ═══ */
    'MC-001' => [
        static function (MlbRng $r) { $n = $r->int(6, 19);
            return mlb_typed('num', 'How many stars are in the picture?', (string)$n,
                ['Touch each star once as you count, saying one number for each star.', 'The last number you say is how many there are: ' . $n . '.'],
                'Point to each star once — no skipping, no double counting.', 'procedure', 25, ['diagram' => ['type' => 'dots', 'n' => $n, 'seed' => $r->int(1, 9999)]]); },
        static function (MlbRng $r) { $n = $r->int(7, 15); $who = $r->pick(MLB_NAMES);
            return mlb_mcq($r, $who . ' counts ' . $n . ' counters and says there are ' . ($n + 1) . '. What is the most likely mistake?',
                $who . ' counted one counter twice',
                [[$who . ' missed one counter out', 'Missing a counter makes the count smaller, not bigger.'],
                 [$who . ' started counting from 0', 'Starting from 0 makes the count one smaller.'],
                 ['Counters cannot be counted exactly', 'Any set of objects can be counted exactly by matching one number to each object.']],
                ['Each object should get exactly one number.', 'A count one too big means one object got two numbers — it was counted twice.'],
                'Is ' . ($n + 1) . ' too many or too few?', 'concept', 30); },
    ],
    'MC-002' => [
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(2, 9); $what = $r->pick(['mangoes', 'oranges', 'eggs', 'pencils']);
            return mlb_typed('num', 'There are ' . $a . ' ' . $what . ' in one basket and ' . $b . ' in another. How many ' . $what . ' are there altogether?', (string)($a + $b),
                ['Put the two groups together: $' . $a . ' + ' . $b . '$.', 'Count on from ' . $a . ' by ' . $b . ': $' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.'],
                'Start at the bigger group and count on.', 'procedure', 20, ['diagram' => ['type' => 'groups', 'groups' => [$a, $b]]]); },
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(2, 8);
            return mlb_mcq($r, 'Why is $' . $a . ' + ' . $b . '$ the same as $' . $b . ' + ' . $a . '$?',
                'Putting two groups together gives the same total whichever group you count first',
                [['Because ' . $a . ' and ' . $b . ' are both small numbers', 'It works for every pair of numbers, large or small.'],
                 ['It is not — changing the order changes the answer', 'Adding is putting together; the total does not depend on order.'],
                 ['Because you always add the bigger number first', 'You can add in either order and get the same total.']],
                ['Adding means combining two groups.', 'The combined group has the same number of things whichever group you start with, so $' . $a . ' + ' . $b . ' = ' . $b . ' + ' . $a . ' = ' . ($a + $b) . '$.'],
                'Picture the two groups pushed together.', 'concept', 30); },
    ],
    'MC-003' => [
        static function (MlbRng $r) { $m = $r->int(12, 99);
            // The "do nothing" can be said several ways; the right option was always "m + 0", which is a pattern, not the idea.
            $right = $r->pick(['$' . $m . ' + 0$', '$0 + ' . $m . '$', '$' . $m . ' - 0$']);
            return mlb_mcq($r, 'Which of these is equal to $' . $m . '$?', $right,
                [['$' . $m . ' \\times 0$', 'Multiplying by 0 gives 0, not ' . $m . '.'], ['$0 - ' . $m . '$', 'That is a negative number.'], ['$' . $m . ' - ' . $m . '$', 'Taking a number from itself leaves nothing: 0.']],
                ['Adding or taking away 0 changes nothing, so the number stays the same.', $right . ' $= ' . $m . '$. Zero is the "do nothing" number for adding and subtracting.'],
                'What happens when you add nothing?', 'concept', 25); },
        static function (MlbRng $r) { $m = $r->int(20, 90); $k = $r->int(3, 15);
            return mlb_typed('num', 'Work out $' . $m . ' - ' . $m . ' + ' . $k . '$.', (string)$k,
                ['$' . $m . ' - ' . $m . ' = 0$: taking all of something leaves nothing.', '$0 + ' . $k . ' = ' . $k . '$.'],
                'What is left when you take a number away from itself?', 'procedure', 20); },
    ],
    'MC-004' => [
        static function (MlbRng $r) { $n = $r->pick([$r->int(101, 999), $r->int(1001, 9999), 100 * $r->int(1, 9) + $r->int(1, 9), 1000 * $r->int(1, 9) + $r->int(1, 99)]);
            return mlb_typed('num', 'Write “' . mlb_words($n) . '” in figures.', (string)$n,
                ['Write each part in its place: ' . mlb_words($n) . '.', 'Use a 0 for any place with nothing in it: ' . mlb_p($n) . '.'],
                'Think about thousands, hundreds, tens and ones.', 'procedure', 30); },
        static function (MlbRng $r) { $th = $r->int(2, 9); $t = $r->int(1, 9); $n = $th * 1000 + $t * 10;
            return mlb_mcq($r, 'Which number is “' . mlb_words($n) . '”?', mlb_p($n),
                [[(string)($th * 100 + $t * 10), 'The hundreds place needs a 0 — it is missing here.'], [mlb_p($th * 1000 + $t * 100), 'The ' . $t . ' is in the hundreds place here, not the tens.'],
                 [mlb_p($th * 10000 + $t * 10), 'That is ' . mlb_words($th * 10) . ' thousand and something.']],
                ['There are ' . $th . ' thousands, no hundreds, ' . $t . ' tens and no ones.', 'So the number is ' . mlb_p($n) . '.'],
                'Which places are empty?', 'concept', 30); },
    ],
    'MC-005' => [
        static function (MlbRng $r) { $n = $r->int(15, 95); $k = $r->int(3, 9);
            return mlb_typed('num', 'Count back ' . $k . ' from ' . $n . '. Which number do you land on?', (string)($n - $k),
                ['Counting back ' . $k . ' is the same as $' . $n . ' - ' . $k . '$.', '$' . $n . ' - ' . $k . ' = ' . ($n - $k) . '$.'],
                'Say the numbers going down, one step at a time.', 'procedure', 25, ['diagram' => ['type' => 'numberline', 'start' => $n - 10, 'step' => 1, 'count' => 10, 'mark' => 10]]); },
        static function (MlbRng $r) { $s = $r->int(11, 59); $d = $r->pick([5, 10, 2]); $down = $r->int(0, 1) === 1 && $s > 40;
            $seq = $down ? [$s + 3 * $d, $s + 2 * $d, $s + $d] : [$s, $s + $d, $s + 2 * $d]; $next = $down ? $s : $s + 3 * $d;
            return mlb_typed('num', 'What comes next? $' . implode(',\\ ', $seq) . ',\\ \\_\\_$', (string)$next,
                ['The numbers go ' . ($down ? 'down' : 'up') . ' by ' . $d . ' each time.', ($down ? $seq[2] . ' - ' . $d : $seq[2] . ' + ' . $d) . ' = ' . $next . '.'],
                'How much does each number change by?', 'procedure', 25); },
    ],
    'MC-006' => [
        static function (MlbRng $r) { do { $a = $r->int(12, 98); $b = (int)strrev((string)$a); } while ($a % 10 === 0 || $a === $b);
            /* One in four is EQUAL, written another way ("47 ☐ 40 + 7"): if "=" is
               never the answer, it is never really an option. */
            if ($r->int(0, 3) === 0) {
                $t = intdiv($a, 10) * 10; $o = $a % 10;
                return mlb_mcq($r, 'Which sign makes this true? $' . $a . ' \\;\\square\\; ' . $t . ' + ' . $o . '$', '$=$',
                    [['$>$', $t . ' + ' . $o . ' is ' . $a . ' — the two sides are the same number.'], ['$<$', $t . ' + ' . $o . ' is ' . $a . ' — the two sides are the same number.']],
                    ['Work out the right-hand side: $' . $t . ' + ' . $o . ' = ' . $a . '$.', 'Both sides are ' . $a . ', so $' . $a . ' = ' . $t . ' + ' . $o . '$.'],
                    'Work out each side before you compare.', 'concept', 20);
            }
            $rel = $a < $b ? '<' : '>';
            return mlb_mcq($r, 'Which sign makes this true? $' . $a . ' \\;\\square\\; ' . $b . '$', '$' . $rel . '$',
                [['$' . ($rel === '<' ? '>' : '<') . '$', 'Compare the tens digits first — they matter more than the ones.'], ['$=$', 'The numbers have the same digits in a different order, so they are not equal.']],
                ['Compare the tens first: ' . intdiv($a, 10) . ' tens and ' . intdiv($b, 10) . ' tens.', $a . ' is ' . ($rel === '<' ? 'less than' : 'greater than') . ' ' . $b . ', so $' . $a . ' ' . $rel . ' ' . $b . '$.'],
                'The sign’s open side faces the bigger number.', 'concept', 20); },
    ],
    'MC-007' => [
        static function (MlbRng $r) { $d = $r->shuffle([$r->int(1, 9), $r->int(1, 9), 0, $r->int(1, 9)]);
            if ($d[0] === 0) { [$d[0], $d[1]] = [$d[1], $d[0]]; }
            $cands = [];
            for ($i = 0; $i < 30 && count($cands) < 4; $i++) { $p = $r->shuffle($d); if ($p[0] === 0) continue; $v = (int)implode('', $p); $cands[$v] = true; }
            $vals = array_keys($cands); if (count($vals) < 3) { $vals = [4071, 4710, 4107, 4701]; }
            $max = max($vals); $wrong = array_values(array_filter($vals, static fn($v) => $v !== $max));
            return mlb_mcq($r, 'Which number is the largest?', mlb_p($max),
                array_map(static fn($v) => [mlb_p($v), 'Compare from the left: the first digit that differs decides.'], $wrong),
                ['All the numbers have four digits, so compare digit by digit from the left.', 'The first place where they differ decides: ' . mlb_p($max) . ' is the largest.'],
                'Line the numbers up by place value.', 'concept', 30); },
    ],
    'MC-008' => [
        static function (MlbRng $r) { $step = $r->pick([1, 2, 5, 10]); $start = $step * $r->int(0, 8); $t = $r->int(1, 9);
            return mlb_typed('num', 'What number is the arrow pointing to?', (string)($start + $t * $step),
                ['The line starts at ' . $start . ' and each mark adds ' . $step . '.', 'The arrow is ' . $t . ' marks along: $' . $start . ' + ' . $t . ' \\times ' . $step . ' = ' . ($start + $t * $step) . '$.'],
                'Work out how much each mark is worth first.', 'procedure', 30, ['diagram' => ['type' => 'numberline', 'start' => $start, 'step' => $step, 'count' => 10, 'arrow' => $t, 'labels' => [0, 10]]]); },
    ],
    'MC-009' => [
        static function (MlbRng $r) { $digits = $r->shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); $n = (int)implode('', array_slice($digits, 0, 4)); $p = $r->int(0, 3);
            $d = intdiv($n, 10 ** $p) % 10; $places = ['ones', 'tens', 'hundreds', 'thousands'];
            return mlb_typed('num', 'What is the value of the digit ' . $d . ' in ' . mlb_p($n) . '?', (string)($d * 10 ** $p),
                ['The ' . $d . ' is in the ' . $places[$p] . ' place.', 'So it is worth $' . $d . ' \\times ' . mlb_n(10 ** $p) . ' = ' . mlb_n($d * 10 ** $p) . '$.'],
                'Which place is the digit in?', 'procedure', 25); },
        static function (MlbRng $r) { $th = $r->int(1, 4); $h = $r->int(0, 9); $t = $r->int(0, 9); $o = $r->int(1, 9);
            return mlb_typed('num', 'What number do the blocks show?', (string)($th * 1000 + $h * 100 + $t * 10 + $o),
                ['Count each kind of block: ' . $th . ' thousands, ' . $h . ' hundreds, ' . $t . ' tens, ' . $o . ' ones.', 'Put each count in its place: ' . mlb_p($th * 1000 + $h * 100 + $t * 10 + $o) . '.'],
                'Count each column separately.', 'procedure', 35, ['diagram' => ['type' => 'placevalue', 'th' => $th, 'h' => $h, 't' => $t, 'o' => $o]]); },
    ],
    'MC-010' => [
        static function (MlbRng $r) { $th = $r->int(2, 9); $h = $r->int(1, 9); $o = $r->int(1, 9); $n = $th * 1000 + $h * 100 + $o;
            return mlb_typed('num', 'Write $' . mlb_n($th * 1000) . ' + ' . ($h * 100) . ' + ' . $o . '$ as one number.', (string)$n,
                ['Each part fills one place: ' . $th . ' thousands, ' . $h . ' hundreds, 0 tens, ' . $o . ' ones.', 'The tens place is empty, so it gets a 0: ' . mlb_p($n) . '.'],
                'Which place has nothing in it?', 'procedure', 25); },
        static function (MlbRng $r) { $n = $r->int(1200, 9800); $th = intdiv($n, 1000); $rest = $n % 1000;
            return mlb_mcq($r, 'Which of these is another way of writing ' . mlb_p($n) . '?', '$' . mlb_n($th * 1000) . ' + ' . mlb_n($rest) . '$',
                [['$' . $th . ' + ' . mlb_n($rest) . '$', 'The ' . $th . ' is ' . $th . ' thousands, not ' . $th . ' ones.'], ['$' . mlb_n($th * 100) . ' + ' . mlb_n($rest) . '$', 'The first digit is thousands, not hundreds.'],
                 ['$' . mlb_n($th * 1000) . ' + ' . mlb_n($rest * 10) . '$', 'That adds ten times too much.']],
                ['Split ' . mlb_p($n) . ' into its thousands and the rest.', mlb_p($n) . ' $= ' . mlb_n($th * 1000) . ' + ' . mlb_n($rest) . '$.'],
                'How many thousands are in ' . mlb_p($n) . '?', 'concept', 30); },
    ],
    /* ═══ Stage 2 — Arithmetic Foundations ═══ */
    'MC-011' => [
        static function (MlbRng $r) { $a = $r->int(158, 689); $b = $r->int(147, 299);
            return mlb_typed('num', 'Work out $' . $a . ' + ' . $b . '$.', (string)($a + $b),
                ['Add the ones, then the tens, then the hundreds, carrying when a column reaches 10.', '$' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$.'],
                'Line the numbers up by place value.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->int(12, 60); $b = $r->int(5, 40);
            return mlb_mcq($r, 'Which statement shows that the order of adding does not matter?', '$' . $a . ' + ' . $b . ' = ' . $b . ' + ' . $a . '$',
                [['$' . $a . ' - ' . $b . ' = ' . $b . ' - ' . $a . '$', 'That is subtraction — and it is false: order matters when you subtract.'], ['$' . $a . ' + 0 = ' . $a . '$', 'True, but that is about adding zero, not about order.'],
                 ['$' . $a . ' + ' . $b . ' = ' . ($a + $b) . '$', 'True, but it does not compare two orders.']],
                ['Swapping the numbers in an addition gives the same total.', 'This is the commutative property: $' . $a . ' + ' . $b . ' = ' . $b . ' + ' . $a . ' = ' . ($a + $b) . '$.'],
                'Look for the same two numbers in both orders.', 'concept', 30); },
    ],
    'MC-012' => [
        static function (MlbRng $r) { $a = $r->int(240, 950); $b = $r->int(105, $a - 40); [$p, $q] = [$r->pick(MLB_NAMES), $r->pick(MLB_NAMES)]; if ($p === $q) $q = 'Ebo';
            return mlb_typed('num', $p . ' has ₦' . $a . ' and ' . $q . ' has ₦' . $b . '. How much more does ' . $p . ' have?', (string)($a - $b),
                ['“How much more” is the difference: $' . $a . ' - ' . $b . '$.', '$' . $a . ' - ' . $b . ' = ' . ($a - $b) . '$, so ' . $p . ' has ₦' . ($a - $b) . ' more.'],
                'Difference means subtract the smaller from the bigger.', 'application', 40, ['unit' => '₦']); },
    ],
    'MC-013' => [
        static function (MlbRng $r) { $a = 100 * $r->int(3, 9) + $r->int(1, 8); $b = $r->int(112, $a - 60); if ($b % 10 <= $a % 10) $b += 9 - ($b % 10) - 0; if ($b >= $a) $b = $a - 45;
            return mlb_typed('num', 'Work out $' . $a . ' - ' . $b . '$.', (string)($a - $b),
                ['The ones column needs more than it has, so regroup: take a hundred, make it 10 tens, then take a ten to make 10 ones.', '$' . $a . ' - ' . $b . ' = ' . ($a - $b) . '$.'],
                'When the top digit is too small, exchange from the next column.', 'procedure', 45); },
        static function (MlbRng $r) { do { $a = 100 * $r->int(4, 9) + $r->int(1, 4); $b = 100 * $r->int(1, 3) + 10 * $r->int(5, 9) + $r->int(5, 9);
                $flip = (int)(abs(intdiv($a, 100) - intdiv($b, 100)) . abs(intdiv($a % 100, 10) - intdiv($b % 100, 10)) . abs($a % 10 - $b % 10)); } while ($flip === $a - $b);
            $who = $r->pick(MLB_NAMES); $true = $a - $b;
            /* Which mistake — or none. The answer was always "took the smaller
               digit from the bigger", so the item tested recognising a sentence;
               now the working itself has to be checked. */
            $FLIP = 'Took the smaller digit from the bigger one in each column instead of regrouping';
            $ADD = 'Added instead of subtracting'; $OK = 'Nothing — the answer is right';
            $NOREDUCE = 'Exchanged a ten but did not take it away from the tens column';
            $story = $r->pick(['flip', 'flip', 'ok', 'add', 'noreduce']);
            [$shown, $right, $steps] = [
                'flip' => [$flip, $FLIP, ['In the ones column, ' . ($a % 10) . ' − ' . ($b % 10) . ' needs an exchange; ' . $who . ' did ' . ($b % 10) . ' − ' . ($a % 10) . ' instead.', 'Regrouping properly gives $' . $a . ' - ' . $b . ' = ' . $true . '$.']],
                'ok' => [$true, $OK, ['Check by adding back: $' . $true . ' + ' . $b . ' = ' . $a . '$.', 'So the working is right.']],
                'add' => [$a + $b, $ADD, ['$' . ($a + $b) . '$ is bigger than ' . $a . ': a subtraction cannot give more than it started with.', 'It is $' . $a . ' + ' . $b . '$. The difference is $' . $true . '$.']],
                'noreduce' => [$true + 10, $NOREDUCE, ['The answer is exactly 10 too big: a ten was borrowed for the ones but never taken from the tens.', 'Regrouping properly gives $' . $a . ' - ' . $b . ' = ' . $true . '$.']],
            ][$story];
            $all = [$FLIP => 'Check the columns where the top digit is smaller.', $ADD => 'Adding would give ' . ($a + $b) . '.', $OK => 'Check by adding back: $' . $shown . ' + ' . $b . '$.',
                    $NOREDUCE => 'Compare the answer with the right one: is it exactly 10 out?'];
            $wrong = []; foreach ($all as $t => $why) if ($t !== $right) $wrong[] = [$t, $why];
            return mlb_mcq($r, $who . ' worked out $' . $a . ' - ' . $b . ' = ' . $shown . '$. What mistake, if any, did ' . $who . ' make?', $right, $wrong, $steps,
                'Check by adding the answer back to ' . $b . '.', 'reasoning', 45); },
    ],
    'MC-014' => [
        static function (MlbRng $r) { $rows = $r->int(3, 7); $cols = $r->int(4, 9);
            return mlb_typed('num', 'How many dots are in the array?', (string)($rows * $cols),
                ['There are ' . $rows . ' rows with ' . $cols . ' dots in each row.', '$' . $rows . ' \\times ' . $cols . ' = ' . ($rows * $cols) . '$.'],
                'Count one row, then count the rows.', 'procedure', 25, ['diagram' => ['type' => 'array', 'rows' => $rows, 'cols' => $cols]]); },
        static function (MlbRng $r) { $k = $r->int(4, 9); $m = $r->int(6, 12); $what = $r->pick(['boxes of 12 eggs' => 0, 'packs of pencils' => 0]);
            return mlb_typed('num', 'A teacher has ' . $k . ' bags with ' . $m . ' sweets in each bag. How many sweets is that?', (string)($k * $m),
                [$k . ' equal groups of ' . $m . ' is $' . $k . ' \\times ' . $m . '$.', '$' . $k . ' \\times ' . $m . ' = ' . ($k * $m) . '$.'],
                'Equal groups means multiply.', 'application', 30); },
    ],
    'MC-015' => [
        static function (MlbRng $r) { $a = $r->int(6, 9); $b = $r->int(6, 9); $p = $a * $b;
            return mlb_typed('num', 'You know that $' . $a . ' \\times ' . $b . ' = ' . $p . '$. Use it to find $' . $a . ' \\times ' . ($b + 1) . '$.', (string)($p + $a),
                ['$' . $a . ' \\times ' . ($b + 1) . '$ is one more group of ' . $a . ' than $' . $a . ' \\times ' . $b . '$.', '$' . $p . ' + ' . $a . ' = ' . ($p + $a) . '$.'],
                'How many more groups of ' . $a . ' are there?', 'procedure', 30); },
    ],
    'MC-016' => [
        static function (MlbRng $r) { $each = $r->int(4, 12); $kids = $r->int(3, 9); $tot = $each * $kids;
            return mlb_typed('num', $tot . ' oranges are shared equally among ' . $kids . ' children. How many oranges does each child get?', (string)$each,
                ['Sharing equally is dividing: $' . $tot . ' \\div ' . $kids . '$.', '$' . $kids . ' \\times ' . $each . ' = ' . $tot . '$, so each child gets ' . $each . '.'],
                'Which number times ' . $kids . ' gives ' . $tot . '?', 'application', 30); },
    ],
    'MC-017' => [
        static function (MlbRng $r) { $d = $r->int(4, 9); $q = $r->int(5, 12); $rem = $r->int(1, $d - 1); $n = $d * $q + $rem;
            return mlb_typed('num', 'Divide ' . $n . ' by ' . $d . '. What is the remainder?', (string)$rem,
                ['$' . $d . ' \\times ' . $q . ' = ' . ($d * $q) . '$, the largest multiple of ' . $d . ' not over ' . $n . '.', '$' . $n . ' - ' . ($d * $q) . ' = ' . $rem . '$, so the remainder is ' . $rem . '.'],
                'Find the biggest multiple of ' . $d . ' that fits.', 'procedure', 30); },
        static function (MlbRng $r) { $c = $r->pick([12, 14, 16, 18]); $buses = $r->int(3, 6); $l = $c * $buses + $r->int(1, $c - 2);
            return mlb_mcq($r, $l . ' learners are going on a trip. Each bus carries ' . $c . ' learners. How many buses are needed?', (string)($buses + 1),
                [[(string)$buses, 'With ' . $buses . ' buses, ' . ($l - $c * $buses) . ' learners would be left behind.'], [mlb_dec(round($l / $c, 2)), 'You cannot hire part of a bus.'], [(string)($buses + 2), 'One bus fewer already carries everyone.']],
                ['$' . $l . ' \\div ' . $c . ' = ' . $buses . '$ remainder ' . ($l - $c * $buses) . '.', 'The ' . ($l - $c * $buses) . ' left over still need a bus, so ' . ($buses + 1) . ' buses.'],
                'What happens to the learners left over?', 'application', 40); },
    ],
    'MC-018' => [
        static function (MlbRng $r) { $a = $r->int(6, 12); $b = $r->int(7, 15); $p = $a * $b;
            return mlb_typed('num', 'Find the missing number: $\\square \\times ' . $a . ' = ' . $p . '$.', (string)$b,
                ['Division undoes multiplication: $\\square = ' . $p . ' \\div ' . $a . '$.', '$' . $p . ' \\div ' . $a . ' = ' . $b . '$. Check: $' . $b . ' \\times ' . $a . ' = ' . $p . '$.'],
                'Which operation undoes “times ' . $a . '”?', 'procedure', 30); },
        static function (MlbRng $r) { $a = $r->int(120, 480); $b = $r->int(35, 99); $s = $a + $b;
            return mlb_typed('num', 'Find the missing number: $' . $s . ' - \\square = ' . $a . '$.', (string)$b,
                ['$' . $s . ' - \\square = ' . $a . '$ means $\\square = ' . $s . ' - ' . $a . '$.', '$' . $s . ' - ' . $a . ' = ' . $b . '$.'],
                'Turn it around: what do you take from ' . $s . ' to leave ' . $a . '?', 'procedure', 30); },
    ],
    'MC-019' => [
        static function (MlbRng $r) { $k = $r->pick([3, 9]);
            $right = $k * $r->int(112, 1111); $wrongs = [];
            while (count($wrongs) < 3) { $w = $r->int(1000, 9999); if ($w % $k !== 0 && $w % 3 !== 0) $wrongs[$w] = true; }
            return mlb_mcq($r, 'Which number is divisible by ' . $k . '?', mlb_p($right),
                array_map(static fn($w) => [mlb_p($w), 'Add its digits: the total is not a multiple of ' . $k . '.'], array_keys($wrongs)),
                ['A number is divisible by ' . $k . ' when the sum of its digits is.', 'The digits of ' . mlb_p($right) . ' add to ' . array_sum(str_split((string)$right)) . ', a multiple of ' . $k . '.'],
                'Add up the digits of each number.', 'concept', 40); },
        static function (MlbRng $r) { $n = $r->pick([12, 18, 20, 24, 28, 30, 36, 40, 45, 48, 60, 72]); $f = []; for ($i = 1; $i <= $n; $i++) if ($n % $i === 0) $f[] = $i;
            return mlb_typed('num', 'How many factors does ' . $n . ' have?', (string)count($f),
                ['List the factors in pairs that multiply to ' . $n . '.', 'They are ' . implode(', ', $f) . ': ' . count($f) . ' factors.'],
                'Pair them up: 1 × ' . $n . ', then the next pair…', 'procedure', 45); },
    ],
    'MC-020' => [
        static function (MlbRng $r) { $g = $r->pick([4, 6, 8, 9, 12, 15]); do { $a = $g * $r->int(2, 7); $b = $g * $r->int(2, 7); } while ($a === $b || mlb_gcd($a, $b) !== $g);
            return mlb_typed('num', 'Find the H.C.F. of ' . $a . ' and ' . $b . '.', (string)$g,
                ['Write each number as a product of primes, or list their factors.', 'The highest factor they share is ' . $g . '.'],
                'Which numbers divide both exactly?', 'procedure', 40); },
        static function (MlbRng $r) { do { $a = $r->pick([4, 6, 8, 9, 10, 12, 15]); $b = $r->pick([6, 8, 9, 10, 12, 14, 15, 18]); } while ($a === $b || mlb_lcm($a, $b) === $a * $b && $r->int(0, 1));
            return mlb_typed('num', 'Two bells ring together at 8:00. One rings every ' . $a . ' minutes and the other every ' . $b . ' minutes. After how many minutes do they next ring together?', (string)mlb_lcm($a, $b),
                ['They ring together at the first time that is a multiple of both ' . $a . ' and ' . $b . '.', 'That is the L.C.M.: ' . mlb_lcm($a, $b) . ' minutes.'],
                'List the multiples of each until they meet.', 'application', 45); },
    ],
    /* ═══ Stage 3 — The Number System ═══ */
    'MC-021' => [
        static function (MlbRng $r) { $t = -$r->int(2, 9); $k = $r->int(4, 15); $up = $r->int(0, 1) === 1;
            $res = $up ? $t + $k : $t - $k;
            return mlb_typed('num', 'At dawn in Jos the temperature is $' . $t . '^\\circ$C. By noon it has ' . ($up ? 'risen' : 'fallen') . ' by ' . $k . ' degrees. What is the temperature at noon?', (string)$res,
                [($up ? 'Rising means adding: $' . $t . ' + ' . $k . '$.' : 'Falling means subtracting: $' . $t . ' - ' . $k . '$.'), 'On a number line from ' . $t . ', move ' . $k . ($up ? ' to the right' : ' to the left') . ': ' . $res . '°C.'],
                'Picture a thermometer.', 'application', 35, ['unit' => '°C']); },
    ],
    'MC-022' => [
        static function (MlbRng $r) { $a = $r->int(2, 15); $b = $r->int(2, 15); $form = $r->int(0, 2);
            [$tex, $v] = [['-' . $a . ' - (-' . $b . ')', -$a + $b], ['-' . $a . ' + ' . $b, -$a + $b], ['-' . $a . ' - ' . $b, -$a - $b]][$form];
            return mlb_typed('num', 'Work out $' . $tex . '$.', (string)$v,
                [$form === 0 ? 'Subtracting a negative is the same as adding: $-' . $a . ' - (-' . $b . ') = -' . $a . ' + ' . $b . '$.' : 'Start at $-' . $a . '$ on the number line.',
                 'The answer is $' . $v . '$.'],
                'Use a number line, or “minus a minus is plus”.', 'procedure', 30); },
        static function (MlbRng $r) { $a = $r->int(3, 12); $b = $r->int($a + 2, 20);
            $L1 = '$-' . $a . ' - (-' . $b . ') = -' . $a . ' + ' . $b . '$'; $L2 = '$= ' . $b . ' - ' . $a . '$';
            return mlb_error_of($r, 'Find the first mistake in this working for $-' . $a . ' - (-' . $b . ')$.', [$L1, $L2, '$= ' . ($b - $a) . '$'], [
                [0, ['$-' . $a . ' - (-' . $b . ') = -' . $a . ' - ' . $b . '$', '$= -(' . $a . ' + ' . $b . ')$', '$= -' . ($a + $b) . '$'],
                    'subtracting a negative number is the same as adding it, so $-(-' . $b . ')$ becomes $+' . $b . '$.'],
                [1, [$L1, '$= ' . $a . ' - ' . $b . '$', '$= ' . ($a - $b) . '$'], '$-' . $a . ' + ' . $b . '$ is $' . $b . ' - ' . $a . '$: the ' . $a . ' is the one being taken away.'],
                [2, [$L1, $L2, '$= ' . ($b - $a + $r->pick([-2, -1, 1, 2])) . '$'], $b . ' − ' . $a . ' is ' . ($b - $a) . '.'],
            ]); },
    ],
    'MC-023' => [
        static function (MlbRng $r) { $a = $r->int(2, 12); $b = $r->int(2, 12); $form = $r->int(0, 2);
            [$tex, $v] = [['(-' . $a . ') \\times (-' . $b . ')', $a * $b], ['(-' . ($a * $b) . ') \\div ' . $b, -$a], [$a . ' \\times (-' . $b . ')', -$a * $b]][$form];
            return mlb_typed('num', 'Work out $' . $tex . '$.', (string)$v,
                ['Multiply or divide the numbers without signs first.', 'Same signs give a positive answer; different signs give a negative one: $' . $v . '$.'],
                'Decide the sign separately from the number.', 'procedure', 25); },
    ],
    'MC-024' => [
        static function (MlbRng $r) { $b = $r->int(2, 9); $c = $r->int(2, 9); $e = $r->int(2, 5); $d = $e * $r->int(2, 6); $a = $r->int(3, 20);
            $v = $a + $b * $c - intdiv($d, $e); $ltr = (int)((($a + $b) * $c - $d) / $e);
            $tex = $a . ' + ' . $b . ' \\times ' . $c . ' - ' . $d . ' \\div ' . $e;
            $wrong = [[(string)$ltr, 'That works from left to right; multiplication and division come before addition and subtraction.'],
                [(string)($a + $b * $c - $d + intdiv(0, 1)), 'The division $' . $d . ' \\div ' . $e . '$ was left out.'], [(string)($a + $b * ($c - $d) ), 'Brackets were added that are not there.']];
            return mlb_mcq($r, 'Work out $' . $tex . '$.', (string)$v, $wrong,
                ['Multiply and divide first: $' . $b . ' \\times ' . $c . ' = ' . ($b * $c) . '$ and $' . $d . ' \\div ' . $e . ' = ' . intdiv($d, $e) . '$.', 'Then add and subtract from the left: $' . $a . ' + ' . ($b * $c) . ' - ' . intdiv($d, $e) . ' = ' . $v . '$.'],
                'Which operations come first?', 'procedure', 40); },
    ],
    'MC-025' => [
        static function (MlbRng $r) { $n = $r->pick([4, 5, 6, 8, 10, 12]); $k = $r->int(1, $n - 1);
            return mlb_typed('frac', 'What fraction of the bar is shaded? Give it in its lowest terms.', mlb_frac($k, $n),
                ['The bar has ' . $n . ' equal parts and ' . $k . ' are shaded: $\\frac{' . $k . '}{' . $n . '}$.', 'In lowest terms: $' . mlb_ftex($k, $n) . '$.'],
                'Count the equal parts, then the shaded ones.', 'concept', 35, ['diagram' => ['type' => 'fractionbar', 'n' => $n, 'k' => $k], 'form' => 'lowest']); },
    ],
    'MC-026' => [
        static function (MlbRng $r) { $b = $r->int(2, 9); $a = $r->int(1, $b - 1); $m = $r->int(2, 6);
            return mlb_typed('num', 'Find the missing number: $\\frac{' . $a . '}{' . $b . '} = \\frac{\\square}{' . ($b * $m) . '}$.', (string)($a * $m),
                ['The bottom was multiplied by ' . $m . ' (' . $b . ' → ' . ($b * $m) . ').', 'Do the same to the top: $' . $a . ' \\times ' . $m . ' = ' . ($a * $m) . '$.'],
                'What was the bottom multiplied by?', 'procedure', 30); },
        static function (MlbRng $r) { $b = $r->int(3, 9); do { $a = $r->int(1, $b - 1); } while (mlb_gcd($a, $b) !== 1); $m = $r->int(2, 8);
            return mlb_typed('frac', 'Write $\\frac{' . ($a * $m) . '}{' . ($b * $m) . '}$ in its lowest terms.', mlb_frac($a, $b),
                ['Find the highest number that divides both: ' . $m . '.', 'Divide top and bottom by ' . $m . ': $' . mlb_ftex($a, $b) . '$.'],
                'What is the H.C.F. of top and bottom?', 'procedure', 30, ['form' => 'lowest']); },
    ],
    'MC-027' => [
        static function (MlbRng $r) { $b = $r->pick([3, 4, 5, 6]); $d = $r->pick([4, 5, 6, 8, 9]); if ($b === $d) $d = $b + 2; $a = $r->int(1, $b - 1); $c = $r->int(1, $d - 1);
            $v = mlb_frac($a * $d + $c * $b, $b * $d);
            return mlb_mcq($r, 'Work out $\\frac{' . $a . '}{' . $b . '} + \\frac{' . $c . '}{' . $d . '}$.', '$' . mlb_ftex($a * $d + $c * $b, $b * $d) . '$',
                [['$' . mlb_ftex($a + $c, $b + $d) . '$', 'Adding the tops and the bottoms separately is not how fractions add — the parts must be the same size first.'],
                 ['$' . mlb_ftex($a + $c, $b * $d) . '$', 'The bottoms were made the same but the tops were not changed to match.'],
                 ['$' . mlb_ftex($a * $c, $b * $d) . '$', 'That multiplies the fractions.']],
                ['Make the bottoms the same: $' . $b * $d / mlb_gcd($b, $d) . '$ is a common denominator.', '$\\frac{' . $a . '}{' . $b . '} + \\frac{' . $c . '}{' . $d . '} = \\frac{' . ($a * $d) . '}{' . ($b * $d) . '} + \\frac{' . ($c * $b) . '}{' . ($b * $d) . '} = ' . mlb_ftex($a * $d + $c * $b, $b * $d) . '$.'],
                'You can only add fractions whose parts are the same size.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->int(1, 4); $b = $r->int($a + 1, 7); $c = $r->int(1, 5); $d = $r->int($c + 1, 8);
            return mlb_typed('frac', 'Work out $\\frac{' . $a . '}{' . $b . '} \\times \\frac{' . $c . '}{' . $d . '}$. Give your answer in its lowest terms.', mlb_frac($a * $c, $b * $d),
                ['Multiply the tops and multiply the bottoms: $\\frac{' . ($a * $c) . '}{' . ($b * $d) . '}$.', 'In lowest terms: $' . mlb_ftex($a * $c, $b * $d) . '$.'],
                'Top times top, bottom times bottom.', 'procedure', 35, ['form' => 'lowest']); },
        static function (MlbRng $r) { $b = $r->pick([3, 4, 5]); $d = $r->pick([2, 3, 6]); if ($b === $d) $d = 7;
            $L = (int)($b * $d / mlb_gcd($b, $d)); $p = intdiv($L, $b); $q = intdiv($L, $d);
            $fr = static fn($n, $m) => '\\frac{' . $n . '}{' . $m . '}';
            $L1 = '$\\frac{1}{' . $b . '} = ' . $fr($p, $L) . '$ and $\\frac{1}{' . $d . '} = ' . $fr($q, $L) . '$';
            $L2 = '$' . $fr($p, $L) . ' + ' . $fr($q, $L) . ' = ' . $fr($p + $q, $L) . '$';
            return mlb_error_of($r, 'Find the first mistake in this working for $\\frac{1}{' . $b . '} + \\frac{1}{' . $d . '}$.', [$L1, $L2, '$= ' . mlb_ftex($p + $q, $L) . '$'], [
                [0, ['$\\frac{1}{' . $b . '} = ' . $fr(1, $L) . '$ and $\\frac{1}{' . $d . '} = ' . $fr(1, $L) . '$', '$' . $fr(1, $L) . ' + ' . $fr(1, $L) . ' = ' . $fr(2, $L) . '$', '$= ' . mlb_ftex(2, $L) . '$'],
                    'changing the bottom to ' . $L . ' means multiplying the top by the same number: $\\frac{1}{' . $b . '} = ' . $fr($p, $L) . '$.'],
                [1, [$L1, '$' . $fr($p, $L) . ' + ' . $fr($q, $L) . ' = ' . $fr($p + $q, 2 * $L) . '$', '$= ' . mlb_ftex($p + $q, 2 * $L) . '$'],
                    'when the denominators are the same, only the numerators are added — the size of the parts does not change.'],
                [1, [$L1, '$' . $fr($p, $L) . ' + ' . $fr($q, $L) . ' = ' . $fr($p * $q, $L) . '$', '$= ' . mlb_ftex($p * $q, $L) . '$'],
                    'the numerators are added, not multiplied: $' . $p . ' + ' . $q . ' = ' . ($p + $q) . '$.'],
                [2, [$L1, $L2, '$= ' . $fr($p + $q + 1, $L) . '$'], 'nothing changed from line 2 to line 3 except the numerator — $' . $fr($p + $q, $L) . '$ cannot become $' . $fr($p + $q + 1, $L) . '$.'],
            ]); },
    ],
    'MC-028' => [
        static function (MlbRng $r) { $d = [$r->int(1, 9), $r->int(1, 9), $r->int(1, 9), $r->int(1, 9)]; $p = $r->int(1, 3); $digit = $d[$p];
            $num = $d[0] . '.' . $d[1] . $d[2] . $d[3]; $names = [1 => 'tenths', 2 => 'hundredths', 3 => 'thousandths'];
            return mlb_typed('num', 'What is the value of the underlined digit in $' . ($p === 1 ? $d[0] . '.\\underline{' . $d[1] . '}' . $d[2] . $d[3] : ($p === 2 ? $d[0] . '.' . $d[1] . '\\underline{' . $d[2] . '}' . $d[3] : $d[0] . '.' . $d[1] . $d[2] . '\\underline{' . $d[3] . '}')) . '$? Give it as a decimal.',
                mlb_dec($digit / 10 ** $p),
                ['The underlined digit is in the ' . $names[$p] . ' place.', 'So it is worth $' . $digit . ' \\times ' . mlb_dec(1 / 10 ** $p) . ' = ' . mlb_dec($digit / 10 ** $p) . '$.'],
                'After the point: tenths, hundredths, thousandths.', 'concept', 30); },
    ],
    'MC-029' => [
        static function (MlbRng $r) { $a = $r->int(12, 95) / 10; $b = $r->int(2, 9) / 10;
            return mlb_mcq($r, 'Work out $' . mlb_dec($a) . ' \\times ' . mlb_dec($b) . '$.', mlb_dec($a * $b),
                [[mlb_dec($a * $b * 10), 'There are two decimal places in the question, so two in the answer.'], [mlb_dec($a * $b / 10), 'Count the decimal places in the question: there are two, not three.'], [mlb_dec($a + $b), 'That adds the numbers.']],
                ['Ignore the points: $' . (int)round($a * 10) . ' \\times ' . (int)round($b * 10) . ' = ' . (int)round($a * $b * 100) . '$.', 'There are two decimal places in the question, so put two in the answer: ' . mlb_dec($a * $b) . '.'],
                'Count the decimal places.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(105, 980) / 100; $b = $r->int(11, 99) / 10;
            return mlb_typed('num', 'Work out $' . mlb_dec($a) . ' + ' . mlb_dec($b) . '$.', mlb_dec($a + $b),
                ['Line up the decimal points: $' . mlb_dec($a) . '$ and $' . number_format($b, 2) . '$.', 'Add place by place: ' . mlb_dec($a + $b) . '.'],
                'Line up the points, not the last digits.', 'procedure', 35); },
    ],
    'MC-030' => [
        static function (MlbRng $r) { $b = $r->pick([2, 4, 5, 10, 20, 25, 50]); $a = $r->int(1, $b - 1);
            return mlb_typed('num', 'Write $\\frac{' . $a . '}{' . $b . '}$ as a percentage.', mlb_dec($a * 100 / $b),
                ['A percentage is out of 100: $\\frac{' . $a . '}{' . $b . '} = \\frac{' . mlb_dec($a * 100 / $b) . '}{100}$.', 'So it is ' . mlb_dec($a * 100 / $b) . '%.'],
                'Multiply top and bottom to make the bottom 100.', 'procedure', 30, ['unit' => '%']); },
        static function (MlbRng $r) { $p = $r->pick([10, 15, 20, 25, 30, 40, 5]); $n = 20 * $r->int(3, 40);
            return mlb_typed('num', 'Find ' . $p . '% of ' . mlb_p($n) . '.', mlb_dec($p * $n / 100),
                [$p . '% means $\\frac{' . $p . '}{100}$.', '$\\frac{' . $p . '}{100} \\times ' . mlb_n($n) . ' = ' . mlb_dec($p * $n / 100) . '$.'],
                'Find 1% or 10% first.', 'procedure', 35); },
        static function (MlbRng $r) { $p = $r->pick([10, 20, 25, 30]); $n = 500 * $r->int(4, 30);
            return mlb_typed('num', 'A ₦' . mlb_p($n) . ' school bag is reduced by ' . $p . '% in a sale. What is the sale price?', mlb_dec($n * (100 - $p) / 100),
                ['The reduction is $' . $p . '\\%$ of ₦' . mlb_p($n) . ' $= ' . mlb_n($n * $p / 100) . '$.', 'Sale price: $' . mlb_n($n) . ' - ' . mlb_n($n * $p / 100) . ' = ' . mlb_n($n * (100 - $p) / 100) . '$.'],
                'Find the reduction first, then take it away.', 'application', 45, ['unit' => '₦']); },
    ],
    /* ═══ Stage 4 — Applied Arithmetic ═══ */
    'MC-031' => [
        static function (MlbRng $r) { $ra = [$r->int(1, 6), $r->int(1, 6), $r->int(1, 6)]; $sum = array_sum($ra); $unit = 100 * $r->int(2, 30); $tot = $unit * $sum;
            $names = array_slice($r->shuffle(MLB_NAMES), 0, 3); $who = $r->int(0, 2);
            return mlb_typed('num', '₦' . mlb_p($tot) . ' is shared among ' . $names[0] . ', ' . $names[1] . ' and ' . $names[2] . ' in the ratio $' . implode(':', $ra) . '$. How much does ' . $names[$who] . ' get?', (string)($unit * $ra[$who]),
                ['There are $' . implode(' + ', $ra) . ' = ' . $sum . '$ parts.', 'One part is $' . mlb_n($tot) . ' \\div ' . $sum . ' = ' . mlb_n($unit) . '$.', $names[$who] . ' gets ' . $ra[$who] . ' parts: $' . $ra[$who] . ' \\times ' . mlb_n($unit) . ' = ' . mlb_n($unit * $ra[$who]) . '$.'],
                'Find the value of one part first.', 'application', 50, ['unit' => '₦']); },
        static function (MlbRng $r) { do { $a = $r->int(1, 7); $b = $r->int(1, 9); } while ($a === $b || mlb_gcd($a, $b) !== 1); $m = $r->int(2, 8);
            return mlb_typed('ratio', 'Write $' . ($a * $m) . ':' . ($b * $m) . '$ in its simplest form.', $a . ':' . $b,
                ['Both numbers divide by ' . $m . '.', '$' . ($a * $m) . ':' . ($b * $m) . ' = ' . $a . ':' . $b . '$.'],
                'Divide both sides by their H.C.F.', 'procedure', 30); },
    ],
    'MC-032' => [
        static function (MlbRng $r) { $n = $r->int(3, 8); $unit = 10 * $r->int(5, 40); $m = $r->int(2, 12); if ($m === $n) $m++;
            return mlb_typed('num', $n . ' exercise books cost ₦' . mlb_p($n * $unit) . '. How much do ' . $m . ' of the same books cost?', (string)($m * $unit),
                ['One book costs $' . mlb_n($n * $unit) . ' \\div ' . $n . ' = ' . mlb_n($unit) . '$.', $m . ' books cost $' . $m . ' \\times ' . mlb_n($unit) . ' = ' . mlb_n($m * $unit) . '$.'],
                'Find the cost of one first.', 'application', 40, ['unit' => '₦']); },
    ],
    'MC-033' => [
        static function (MlbRng $r) { $w = $r->pick([2, 3, 4, 6, 8]); $d = $r->pick([6, 9, 12, 15, 18, 24]); $total = $w * $d; $divs = [];
            foreach ([2, 3, 4, 5, 6, 8, 9, 10, 12] as $x) if ($x !== $w && $total % $x === 0) $divs[] = $x; $w2 = $r->pick($divs ?: [1]);
            return mlb_mcq($r, $w . ' workers take ' . $d . ' days to build a wall. How long would ' . $w2 . ' workers take, working at the same rate?', ($total / $w2) . ' days',
                [[mlb_dec($d * $w2 / $w) . ' days', 'More workers finish faster — this treats it as if more workers take longer.'], [($d + $w - $w2) . ' days', 'The time does not change by adding or subtracting workers.'],
                 [$total . ' days', 'That is the total worker-days, the time for one worker.']],
                ['The whole job is $' . $w . ' \\times ' . $d . ' = ' . $total . '$ worker-days.', $w2 . ' workers take $' . $total . ' \\div ' . $w2 . ' = ' . ($total / $w2) . '$ days.'],
                'Find how many days ONE worker would take.', 'application', 45); },
    ],
    'MC-034' => [
        static function (MlbRng $r) { $form = $r->int(0, 2);
            if ($form === 0) { $v = $r->int(12, 95) / 10; return mlb_typed('num', 'Convert ' . mlb_dec($v) . ' km to metres.', mlb_dec($v * 1000), ['1 km = 1,000 m.', '$' . mlb_dec($v) . ' \\times 1{,}000 = ' . mlb_n($v * 1000) . '$ m.'], 'Multiply or divide by 1,000?', 'procedure', 30, ['unit' => 'm']); }
            if ($form === 1) { $h = $r->int(1, 4); $m = $r->pick([5, 10, 15, 20, 25, 30, 40, 45, 50]); return mlb_typed('num', 'How many minutes are there in ' . $h . ' h ' . $m . ' min?', (string)($h * 60 + $m), ['1 hour = 60 minutes, so ' . $h . ' h $= ' . ($h * 60) . '$ min.', '$' . ($h * 60) . ' + ' . $m . ' = ' . ($h * 60 + $m) . '$ minutes.'], 'An hour is 60 minutes, not 100.', 'procedure', 30, ['unit' => 'min']); }
            $g = 50 * $r->int(3, 79); return mlb_typed('num', 'Convert ' . mlb_p($g) . ' g to kilograms.', mlb_dec($g / 1000), ['1 kg = 1,000 g.', '$' . mlb_n($g) . ' \\div 1{,}000 = ' . mlb_dec($g / 1000) . '$ kg.'], 'Kilograms are bigger, so the number gets smaller.', 'procedure', 30, ['unit' => 'kg']); },
    ],
    'MC-035' => [
        static function (MlbRng $r) { $form = $r->int(0, 1);
            if ($form === 0) { $n = $r->int(1234, 9876); $to = $r->pick([10, 100, 1000]); $v = (int)(round($n / $to) * $to);
                return mlb_typed('num', 'Round ' . mlb_p($n) . ' to the nearest ' . mlb_p($to) . '.', (string)$v, ['Look at the digit after the ' . mlb_p($to) . 's place to decide whether to round up or down.', mlb_p($n) . ' rounds to ' . mlb_p($v) . '.'], 'Is the next digit 5 or more?', 'procedure', 30); }
            $x = $r->int(1001, 9999) / 1000000; $v = (float)sprintf('%.2g', $x);
            return mlb_typed('num', 'Write ' . mlb_dec($x) . ' correct to 2 significant figures.', mlb_dec($v), ['The first significant figure is the first non-zero digit.', 'Keep two of them and round: ' . mlb_dec($v) . '.'], 'Zeros at the front do not count.', 'procedure', 35); },
    ],
    'MC-036' => [
        static function (MlbRng $r) { $l = $r->int(8, 40); $low = $r->int(0, 1) === 1;
            return mlb_typed('num', 'A rope is ' . $l . ' cm long, correct to the nearest centimetre. What is the ' . ($low ? 'lower' : 'upper') . ' bound of its length?', mlb_dec($low ? $l - 0.5 : $l + 0.5),
                ['“To the nearest cm” means it could be up to half a centimetre either way.', 'The ' . ($low ? 'lower' : 'upper') . ' bound is $' . $l . ($low ? ' - ' : ' + ') . '0.5 = ' . mlb_dec($low ? $l - 0.5 : $l + 0.5) . '$ cm.'],
                'Half of the unit, either side.', 'procedure', 35, ['unit' => 'cm']); },
    ],
    'MC-037' => [
        static function (MlbRng $r) { $cp = 200 * $r->int(5, 50); $p = $r->pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 50]); $loss = $r->int(0, 3) === 0; $sp = $loss ? $cp * (100 - $p) / 100 : $cp * (100 + $p) / 100;
            return mlb_typed('num', 'A trader buys a phone case for ₦' . mlb_p($cp) . ' and sells it for ₦' . mlb_p($sp) . '. What is the percentage ' . ($loss ? 'loss' : 'profit') . '?', (string)$p,
                [($loss ? 'Loss' : 'Profit') . ' $= ' . mlb_n(abs($sp - $cp)) . '$.', 'Percentage ' . ($loss ? 'loss' : 'profit') . ' $= \\frac{' . mlb_n(abs($sp - $cp)) . '}{' . mlb_n($cp) . '} \\times 100 = ' . $p . '\\%$ (always out of the cost price).'],
                'Compare the gain with what was paid, not with the selling price.', 'application', 45, ['unit' => '%']); },
    ],
    'MC-038' => [
        static function (MlbRng $r) { $P = 1000 * $r->int(5, 60); $R = $r->pick([5, 8, 10, 12, 15]); $T = $r->int(2, 5);
            return mlb_typed('num', 'Find the simple interest on ₦' . mlb_p($P) . ' for ' . $T . ' years at ' . $R . '% per annum.', (string)($P * $R * $T / 100),
                ['Simple interest $= \\frac{P \\times R \\times T}{100}$.', '$\\frac{' . mlb_n($P) . ' \\times ' . $R . ' \\times ' . $T . '}{100} = ' . mlb_n($P * $R * $T / 100) . '$.'],
                'Interest is the same every year.', 'procedure', 40, ['unit' => '₦']); },
        static function (MlbRng $r) { $P = 10000 * $r->int(1, 9); $R = $r->pick([10, 20]);
            $A = $P * (1 + $R / 100) ** 2;
            return mlb_mcq($r, '₦' . mlb_p($P) . ' is saved at ' . $R . '% compound interest per year. What is the amount after 2 years?', '₦' . mlb_p($A),
                [['₦' . mlb_p($P * (1 + 2 * $R / 100)), 'That is simple interest — compound interest is also earned on last year’s interest.'], ['₦' . mlb_p($A - $P), 'That is only the interest, not the amount.'], ['₦' . mlb_p($P * (1 + $R / 100)), 'That is after 1 year.']],
                ['After 1 year: $' . mlb_n($P) . ' \\times ' . mlb_dec(1 + $R / 100) . ' = ' . mlb_n($P * (1 + $R / 100)) . '$.', 'After 2 years: $' . mlb_n($P * (1 + $R / 100)) . ' \\times ' . mlb_dec(1 + $R / 100) . ' = ' . mlb_n($A) . '$.'],
                'The second year’s interest is on the new amount.', 'application', 50); },
    ],
    'MC-039' => [
        static function (MlbRng $r) { $sp = $r->pick([40, 48, 60, 72, 80, 90]); $mins = $r->pick([30, 45, 90, 150, 75]); $d = $sp * $mins / 60;
            if (floor($d) != $d) { $mins = 90; $d = $sp * 1.5; }
            return mlb_typed('num', 'A bus travels ' . mlb_p($d) . ' km in ' . (intdiv($mins, 60) ? intdiv($mins, 60) . ' h ' : '') . ($mins % 60 ? ($mins % 60) . ' min' : '') . '. What is its average speed in km/h?', (string)$sp,
                ['Change the time to hours: ' . $mins . ' min $= ' . mlb_dec($mins / 60) . '$ h.', 'Speed $= \\frac{\\text{distance}}{\\text{time}} = \\frac{' . mlb_n($d) . '}{' . mlb_dec($mins / 60) . '} = ' . $sp . '$ km/h.'],
                'Time must be in hours for km/h.', 'application', 50, ['unit' => 'km/h']); },
    ],
    'MC-040' => [
        static function (MlbRng $r) { $nb = $r->int(2, 4); $pb = 50 * $r->int(10, 30); $np = $r->int(2, 6); $pp = 50 * $r->int(1, 6); $pay = 1000 * (int)ceil(($nb * $pb + $np * $pp + 500) / 1000);
            $who = $r->pick(MLB_NAMES); $spent = $nb * $pb + $np * $pp;
            return mlb_typed('num', $who . ' buys ' . $nb . ' textbooks at ₦' . mlb_p($pb) . ' each and ' . $np . ' pens at ₦' . $pp . ' each, and pays with ₦' . mlb_p($pay) . '. How much change should ' . $who . ' get?', (string)($pay - $spent),
                ['Books: $' . $nb . ' \\times ' . mlb_n($pb) . ' = ' . mlb_n($nb * $pb) . '$. Pens: $' . $np . ' \\times ' . $pp . ' = ' . mlb_n($np * $pp) . '$.', 'Total spent: ' . mlb_p($spent) . '. Change: $' . mlb_n($pay) . ' - ' . mlb_n($spent) . ' = ' . mlb_n($pay - $spent) . '$.'],
                'Find the total cost first.', 'application', 60, ['unit' => '₦']); },
    ],
    /* ═══ Stage 5 — The Language of Algebra ═══ */
    'MC-041' => [
        static function (MlbRng $r) { $a = $r->int(1, 9); $d = $r->int(2, 7); $seq = [$a, $a + $d, $a + 2 * $d, $a + 3 * $d];
            return mlb_typed('num', 'What is the next number? $' . implode(',\\ ', $seq) . ',\\ \\_\\_$', (string)($a + 4 * $d),
                ['Each number is ' . $d . ' more than the one before.', '$' . $seq[3] . ' + ' . $d . ' = ' . ($a + 4 * $d) . '$.'], 'What is added each time?', 'procedure', 25); },
        static function (MlbRng $r) { $a = $r->int(2, 9); $d = $r->int(2, 6); $n = $r->int(10, 25);
            return mlb_typed('num', 'The pattern $' . $a . ',\\ ' . ($a + $d) . ',\\ ' . ($a + 2 * $d) . ',\\ \\dots$ continues the same way. What is the ' . $n . 'th number?', (string)($a + ($n - 1) * $d),
                ['Each step adds ' . $d . '. To reach the ' . $n . 'th number you take ' . ($n - 1) . ' steps from the first.', '$' . $a . ' + ' . ($n - 1) . ' \\times ' . $d . ' = ' . ($a + ($n - 1) * $d) . '$.'],
                'How many steps from the 1st number to the ' . $n . 'th?', 'application', 45); },
    ],
    'MC-042' => [
        static function (MlbRng $r) { $a = $r->int(2, 5); $b = $r->int(2, 9); $thing = $r->pick(['pens', 'mangoes', 'books']);
            return mlb_mcq($r, 'Let $n$ be the number of ' . $thing . ' Ada has. Which expression means “' . $b . ' more than ' . ($a === 2 ? 'twice' : $a . ' times') . ' the number of ' . $thing . '”?',
                '$' . $a . 'n + ' . $b . '$',
                [['$' . $b . 'n + ' . $a . '$', 'The numbers have swapped roles.'], ['$' . $a . '(n + ' . $b . ')$', 'That adds ' . $b . ' before multiplying.'], ['$n + ' . ($a + $b) . '$', 'Multiplying by ' . $a . ' is not the same as adding ' . $a . '.']],
                [($a === 2 ? 'Twice' : $a . ' times') . ' the number is $' . $a . 'n$.', $b . ' more than that is $' . $a . 'n + ' . $b . '$.'],
                'Build it in the order you would do it.', 'concept', 40); },
    ],
    'MC-043' => [
        static function (MlbRng $r) { $a = $r->nz(-9, 9); $b = $r->nz(-9, 9); $c = $r->int(1, 12);
            return mlb_typed('num', 'What is the coefficient of $x$ in $' . mlb_lterm($a, 'x^2') . mlb_sterm($b, 'x') . mlb_sterm($c) . '$?', (string)$b,
                ['The coefficient is the number multiplying the term.', 'The $x$ term is $' . mlb_lterm($b, 'x') . '$, so the coefficient is $' . $b . '$ — its sign belongs to it.'],
                'Look at the term with $x$ (not $x^2$), sign included.', 'concept', 30); },
    ],
    'MC-044' => [
        static function (MlbRng $r) { $a = $r->int(3, 9); $b = $r->int(2, 8); $c = $r->int(1, $a - 1); $d = $r->int(1, 7);
            return mlb_typed('expr', 'Simplify $' . $a . 'a + ' . $b . 'b - ' . $c . 'a + ' . $d . 'b$.', ($a - $c) . 'a+' . ($b + $d) . 'b',
                ['Collect the $a$ terms: $' . $a . 'a - ' . $c . 'a = ' . mlb_lterm($a - $c, 'a') . '$.', 'Collect the $b$ terms: $' . $b . 'b + ' . $d . 'b = ' . ($b + $d) . 'b$. Answer: $' . mlb_lterm($a - $c, 'a') . ' + ' . ($b + $d) . 'b$.'],
                'Only like terms can be combined.', 'procedure', 40, ['form' => 'simplified']); },
    ],
    'MC-045' => [
        static function (MlbRng $r) { $k = $r->int(2, 7); $a = $r->int(2, 6); $b = $r->nz(-9, 9);
            return mlb_typed('expr', 'Expand $' . $k . '(' . mlb_lterm($a, 'x') . mlb_sterm($b) . ')$.', ($k * $a) . 'x' . ($k * $b < 0 ? '' : '+') . ($k * $b),
                ['Multiply each term inside the bracket by ' . $k . '.', '$' . $k . ' \\times ' . $a . 'x = ' . ($k * $a) . 'x$ and $' . $k . ' \\times ' . ($b < 0 ? '(' . $b . ')' : $b) . ' = ' . ($k * $b) . '$, so $' . ($k * $a) . 'x' . mlb_sterm($k * $b) . '$.'],
                'Everything inside gets multiplied.', 'procedure', 35, ['form' => 'expanded']); },
        static function (MlbRng $r) { $p = $r->int(2, 6); $q = $r->int(2, 6); $a = $r->int(1, 7); $b = $r->int(1, 7); if ($p === $q) $q++;
            $cx = $p - $q; $cc = $p * $a + $q * $b;
            return mlb_typed('expr', 'Expand and simplify $' . $p . '(x + ' . $a . ') - ' . $q . '(x - ' . $b . ')$.', ($cx === 0 ? '' : $cx . 'x+') . $cc,
                ['Expand each bracket: $' . $p . 'x + ' . ($p * $a) . '$ and $-' . $q . 'x + ' . ($q * $b) . '$ (minus times minus is plus).', 'Collect: $' . mlb_lterm($cx, 'x') . ' + ' . $cc . '$.'],
                'The minus sign multiplies both terms in the second bracket.', 'procedure', 50, ['form' => 'expanded']); },
        static function (MlbRng $r) { $k = $r->int(2, 6); $a = $r->int(2, 9);
            $L1 = '$' . $k . '(x - ' . $a . ') + x = ' . $k . 'x - ' . ($k * $a) . ' + x$';
            return mlb_error_of($r, 'Find the first mistake in this working: expand and simplify $' . $k . '(x - ' . $a . ') + x$.', [$L1, '$= ' . ($k + 1) . 'x - ' . ($k * $a) . '$'], [
                [0, ['$' . $k . '(x - ' . $a . ') + x = ' . $k . 'x - ' . $a . ' + x$', '$= ' . ($k + 1) . 'x - ' . $a . '$'],
                    'the ' . $k . ' must multiply every term in the bracket, so $-' . $a . '$ becomes $-' . ($k * $a) . '$.'],
                [1, [$L1, '$= ' . $k . 'x - ' . ($k * $a) . '$'], 'the lone $x$ is $1x$ and has to be collected: $' . $k . 'x + x = ' . ($k + 1) . 'x$.'],
                [1, [$L1, '$= ' . ($k + 1) . 'x + ' . ($k * $a) . '$'], 'collecting terms does not change a sign: $-' . ($k * $a) . '$ stays negative.'],
            ]); },
    ],
    'MC-046' => [
        static function (MlbRng $r) { $p = $r->int(2, 5); $a = $r->nz(-4, 4); $b = $r->int(1, 9);
            return mlb_typed('num', 'Find the value of $' . $p . 'a^2 - b$ when $a = ' . $a . '$ and $b = ' . $b . '$.', (string)($p * $a * $a - $b),
                ['Square first: $a^2 = (' . $a . ')^2 = ' . ($a * $a) . '$ — the square of a negative is positive.', '$' . $p . ' \\times ' . ($a * $a) . ' - ' . $b . ' = ' . ($p * $a * $a - $b) . '$.'],
                'Put brackets round a negative number before you square it.', 'procedure', 40); },
    ],
    'MC-047' => [
        static function (MlbRng $r) { $a = $r->int(3, 15); $s = $r->int(20, 60);
            return mlb_mcq($r, 'To solve $x + ' . $a . ' = ' . $s . '$, what should you do next?', 'Subtract ' . $a . ' from both sides',
                [['Add ' . $a . ' to both sides', 'That gives $x + ' . (2 * $a) . '$, further from $x$ on its own.'], ['Subtract ' . $a . ' from the left side only', 'Whatever you do to one side you must do to the other, or the equation is no longer balanced.'], ['Divide both sides by ' . $a, 'Division undoes multiplication, but here ' . $a . ' is added.']],
                ['An equation is a balance: keep both sides equal.', 'Subtracting ' . $a . ' from both sides gives $x = ' . ($s - $a) . '$.'],
                'What undoes “+ ' . $a . '”?', 'concept', 30); },
    ],
    'MC-048' => [
        static function (MlbRng $r) { $form = $r->int(0, 2); $x = $r->nz(-9, 15);
            if ($form === 0) { $a = $r->int(3, 20); $tex = 'x - ' . $a . ' = ' . ($x - $a); $st = 'Add ' . $a . ' to both sides.'; }
            elseif ($form === 1) { $a = $r->int(2, 9); $tex = $a . 'x = ' . ($a * $x); $st = 'Divide both sides by ' . $a . '.'; }
            else { $a = $r->int(2, 6); $x = $a * $r->nz(-5, 8); $tex = '\\frac{x}{' . $a . '} = ' . ($x / $a); $st = 'Multiply both sides by ' . $a . '.'; }
            return mlb_typed('num', 'Solve $' . $tex . '$.', (string)$x, [$st, '$x = ' . $x . '$.'], 'Undo what is being done to $x$.', 'procedure', 30); },
    ],
    'MC-049' => [
        static function (MlbRng $r) { $x = $r->nz(-6, 12); $a = $r->int(2, 6); $b = $r->int(1, 9); $c = $r->int(1, $a + 3); if ($c === $a) $c = $a + 1;
            $d = $a * ($x - $b) - $c * $x;
            return mlb_typed('num', 'Solve $' . $a . '(x - ' . $b . ') = ' . mlb_lterm($c, 'x') . mlb_sterm($d) . '$.', (string)$x,
                ['Expand: $' . $a . 'x - ' . ($a * $b) . ' = ' . mlb_lterm($c, 'x') . mlb_sterm($d) . '$.', 'Collect $x$ on one side: $' . mlb_lterm($a - $c, 'x') . ' = ' . ($d + $a * $b) . '$.', 'So $x = ' . $x . '$. Check by putting it back into both sides.'],
                'Expand the bracket first.', 'procedure', 60); },
        static function (MlbRng $r) { $x = $r->int(2, 10); $a = $r->int(3, 7); $b = $r->int(1, 9); $c = $r->int(1, $a - 1); $d = $a * $x + $b - $c * $x;
            $cx = static fn($n) => $n === 1 ? '' : (string)$n;   // "1x" is written "x"
            $L1 = '$' . $a . 'x - ' . $cx($c) . 'x + ' . $b . ' = ' . $d . '$'; $L2 = '$' . $cx($a - $c) . 'x = ' . $d . ' - ' . $b . '$'; $L3 = '$' . $cx($a - $c) . 'x = ' . ($d - $b) . '$';
            return mlb_error_of($r, 'Find the first mistake in this working to solve $' . $a . 'x + ' . $b . ' = ' . $cx($c) . 'x + ' . $d . '$.', [$L1, $L2, $L3, '$x = ' . $x . '$'], [
                [0, ['$' . $a . 'x + ' . $cx($c) . 'x + ' . $b . ' = ' . $d . '$', '$' . ($a + $c) . 'x = ' . $d . ' - ' . $b . '$', '$' . ($a + $c) . 'x = ' . ($d - $b) . '$', '$x = ' . mlb_ftex($d - $b, $a + $c) . '$'],
                    'moving $' . $cx($c) . 'x$ from the right to the left changes its sign: it becomes $-' . $cx($c) . 'x$.'],
                [1, [$L1, '$' . $cx($a - $c) . 'x = ' . $d . ' + ' . $b . '$', '$' . $cx($a - $c) . 'x = ' . ($d + $b) . '$', '$x = ' . mlb_ftex($d + $b, $a - $c) . '$'],
                    'moving $+' . $b . '$ to the other side changes its sign: it becomes $-' . $b . '$.'],
            ] + ((($d - $b) - ($a - $c)) !== $x ? [2 => [3, [$L1, $L2, $L3, '$x = ' . (($d - $b) - ($a - $c)) . '$'],
                    '$' . $cx($a - $c) . 'x$ means ' . ($a - $c) . ' times $x$, so divide by ' . ($a - $c) . ' — do not subtract it.']] : [])); },
    ],
    'MC-050' => [
        static function (MlbRng $r) { $n = $r->int(3, 15); $m = $r->int(2, 6); $a = $r->int(2, 12);
            return mlb_typed('num', 'I think of a number, multiply it by ' . $m . ' and add ' . $a . '. The result is ' . ($m * $n + $a) . '. What is my number?', (string)$n,
                ['Call the number $n$: $' . $m . 'n + ' . $a . ' = ' . ($m * $n + $a) . '$.', '$' . $m . 'n = ' . ($m * $n) . '$, so $n = ' . $n . '$.'],
                'Write it as an equation.', 'application', 45); },
        static function (MlbRng $r) { $base = 100 * $r->int(3, 9); $per = 10 * $r->int(8, 20);
            return mlb_mcq($r, 'A keke ride costs ₦' . $base . ' to start plus ₦' . $per . ' for each kilometre. Which formula gives the cost $C$ (in naira) of a ride of $k$ kilometres?',
                '$C = ' . $base . ' + ' . $per . 'k$',
                [['$C = ' . ($base + $per) . 'k$', 'The starting charge is paid once, not for every kilometre.'], ['$C = ' . $per . ' + ' . $base . 'k$', 'The two amounts have swapped.'], ['$C = ' . $base . 'k + ' . $per . '$', 'The per-kilometre charge is the one that multiplies $k$.']],
                ['The fixed part is ₦' . $base . '.', 'Each kilometre adds ₦' . $per . ', so $k$ kilometres add $' . $per . 'k$: $C = ' . $base . ' + ' . $per . 'k$.'],
                'Which charge depends on the distance?', 'application', 45); },
    ],
    /* ═══ Stage 6 — Algebraic Structures ═══ */
    'MC-051' => [
        static function (MlbRng $r) { $a = $r->int(2, 9); $form = $r->int(0, 1);
            if ($form === 0) return mlb_typed('expr', 'Make $x$ the subject of $y = ' . $a . 'x + c$.', '(y-c)/' . $a,
                ['Subtract $c$ from both sides: $y - c = ' . $a . 'x$.', 'Divide by ' . $a . ': $x = \\frac{y - c}{' . $a . '}$.'], 'Undo the operations in reverse order.', 'procedure', 50, ['vars' => 'x,y,c']);
            return mlb_typed('expr', 'Make $r$ the subject of $A = ' . $a . 'r^2$, where $r$ is positive. (Type sqrt( ) for a square root.)', 'sqrt(A/' . $a . ')',
                ['Divide by ' . $a . ': $r^2 = \\frac{A}{' . $a . '}$.', 'Take the square root: $r = \\sqrt{\\frac{A}{' . $a . '}}$.'], 'What undoes “squared”?', 'procedure', 60, ['vars' => 'r,A', 'positive' => true]); },
    ],
    'MC-052' => [
        static function (MlbRng $r) { $a = $r->int(2, 6); $x = $r->nz(-6, 6); $b = $r->nz(-9, 9); $c = -$a * $x + $b;
            return mlb_mcq($r, 'Solve $' . mlb_lterm(-$a, 'x') . mlb_sterm($b) . ' < ' . $c . '$.', '$x > ' . $x . '$',
                [['$x < ' . $x . '$', 'Dividing both sides by a negative number reverses the inequality sign.'], ['$x > ' . (-$x) . '$', 'Check the sign of the number when you divide.'], ['$x < ' . (-$x) . '$', 'Both the sign of the number and the direction need care here.']],
                ['Subtract ' . $b . ': $' . (-$a) . 'x < ' . ($c - $b) . '$.', 'Divide by $' . (-$a) . '$ — dividing by a negative reverses the sign: $x > ' . $x . '$.'],
                'What happens when you divide an inequality by a negative number?', 'procedure', 50); },
    ],
    'MC-053' => [
        static function (MlbRng $r) { $x = $r->nz(-4, 6); $y = $r->nz(-5, 9); $m = $r->nz(-3, 4); $c = $y - $m * $x; $p = $r->int(1, 5); $q = $r->int(1, 4);
            return mlb_typed('pair', 'Solve the simultaneous equations $y = ' . mlb_lterm($m, 'x') . mlb_sterm($c) . '$ and $' . mlb_lterm($p, 'x') . ' + ' . mlb_lterm($q, 'y') . ' = ' . ($p * $x + $q * $y) . '$.', [$x, $y],
                ['Substitute the first into the second: $' . $p . 'x + ' . $q . '(' . mlb_lterm($m, 'x') . mlb_sterm($c) . ') = ' . ($p * $x + $q * $y) . '$.', 'Solve: $x = ' . $x . '$, then $y = ' . $y . '$.'],
                'Replace $y$ in the second equation.', 'procedure', 90, ['labels' => ['x', 'y']]); },
    ],
    'MC-054' => [
        static function (MlbRng $r) { $x = $r->nz(-5, 7); $y = $r->nz(-5, 7); $a = $r->int(1, 5); $b = $r->int(1, 5); $c = $r->int(1, 5); do { $d = $r->int(1, 5); } while ($a * $d === $b * $c);
            return mlb_typed('pair', 'Solve $' . mlb_lterm($a, 'x') . ' + ' . mlb_lterm($b, 'y') . ' = ' . ($a * $x + $b * $y) . '$ and $' . mlb_lterm($c, 'x') . ' + ' . mlb_lterm($d, 'y') . ' = ' . ($c * $x + $d * $y) . '$.', [$x, $y],
                ['Multiply the equations so one letter has the same coefficient, then subtract to eliminate it.', 'This gives $x = ' . $x . '$ and $y = ' . $y . '$. Check both equations.'],
                'Make the $x$ (or $y$) coefficients equal.', 'procedure', 100, ['labels' => ['x', 'y']]); },
    ],
    'MC-055' => [
        static function (MlbRng $r) { $x = $r->int(-2, 4); $y = $r->int(-1, 5); $m1 = $r->pick([1, 2]); $m2 = $r->pick([-1, -2]); $c1 = $y - $m1 * $x; $c2 = $y - $m2 * $x;
            return mlb_mcq($r, 'The graphs of $y = ' . mlb_lterm($m1, 'x') . mlb_sterm($c1) . '$ and $y = ' . mlb_lterm($m2, 'x') . mlb_sterm($c2) . '$ are drawn. Which point is the solution of the two equations?', '$(' . $x . ',\\ ' . $y . ')$',
                [['$(' . $y . ',\\ ' . $x . ')$', 'The coordinates are the wrong way round: $x$ comes first.'], ['$(0,\\ ' . $c1 . ')$', 'That is where one line crosses the $y$-axis, not where the lines meet.'], ['$(' . ($x + 1) . ',\\ ' . ($y + 1) . ')$', 'Read the crossing point carefully from the grid.']],
                ['The solution is where the two lines cross.', 'They cross at $(' . $x . ',\\ ' . $y . ')$: check both equations give $y = ' . $y . '$ when $x = ' . $x . '$.'],
                'Find where the lines meet.', 'concept', 45, ['diagram' => ['type' => 'lines', 'lines' => [[$m1, $c1], [$m2, $c2]], 'range' => 6]]); },
    ],
    'MC-056' => [
        static function (MlbRng $r) { do { $g = $r->int(2, 6); $p = $r->int(1, 5); $q = $r->int(1, 7); } while (mlb_gcd($p, $q) !== 1);
            $A = $g * $p; $B = $g * $q;
            return mlb_mcq($r, 'Factorise completely $' . $A . 'x^2 + ' . $B . 'x$.', '$' . mlb_lterm($g, 'x') . '(' . mlb_lterm($p, 'x') . ' + ' . $q . ')$',
                [['$' . $g . '(' . $p . 'x^2 + ' . $q . 'x)$', 'Not completely: $x$ is also a common factor.'], ['$x(' . $A . 'x + ' . $B . ')$', 'Not completely: ' . $g . ' also divides both terms.'], ['$' . mlb_lterm($g, 'x') . '(' . mlb_lterm($p, 'x') . ' + ' . $B . ')$', 'Expanding this does not give back the original.']],
                ['The highest common factor of $' . $A . 'x^2$ and $' . $B . 'x$ is $' . $g . 'x$.', '$' . $A . 'x^2 + ' . $B . 'x = ' . $g . 'x(' . mlb_lterm($p, 'x') . ' + ' . $q . ')$. Check by expanding.'],
                'Take out everything the terms share — numbers and letters.', 'procedure', 45); },
    ],
    'MC-057' => [
        static function (MlbRng $r) { $a = $r->int(1, 7); $b = $r->int(1, 7);
            return mlb_mcq($r, 'Factorise $xy + ' . $b . 'x + ' . $a . 'y + ' . ($a * $b) . '$.', '$(x + ' . $a . ')(y + ' . $b . ')$',
                [['$(x + ' . $b . ')(y + ' . $a . ')$', 'Expand it: the $x$ term would be $' . $a . 'x$, not $' . $b . 'x$.'], ['$(xy + ' . $a . ')(1 + ' . $b . ')$', 'Group the terms in pairs that share a factor.'], ['$x(y + ' . $b . ') + ' . $a . 'y + ' . ($a * $b) . '$', 'Partly done: the second pair also has a common factor.']],
                ['Group in pairs: $x(y + ' . $b . ') + ' . $a . '(y + ' . $b . ')$.', 'The bracket is common: $(x + ' . $a . ')(y + ' . $b . ')$.'],
                'Take a common factor from each pair.', 'procedure', 50); },
    ],
    'MC-058' => [
        static function (MlbRng $r) { $a = $r->int(41, 89); $b = $r->int(11, $a - 10); if (($a + $b) % 10 !== 0) $b = 10 * (int)ceil(($a + $b) / 10) - $a; if ($b >= $a) $b = $a - 20;
            return mlb_typed('num', 'Use the difference of two squares to work out $' . $a . '^2 - ' . $b . '^2$ without a calculator.', (string)($a * $a - $b * $b),
                ['$a^2 - b^2 = (a + b)(a - b)$.', '$(' . $a . ' + ' . $b . ')(' . $a . ' - ' . $b . ') = ' . ($a + $b) . ' \\times ' . ($a - $b) . ' = ' . mlb_n($a * $a - $b * $b) . '$.'],
                'Write it as a product of two brackets.', 'procedure', 50); },
        static function (MlbRng $r) { $k = $r->int(2, 12);
            return mlb_mcq($r, 'Factorise $x^2 - ' . ($k * $k) . '$.', '$(x - ' . $k . ')(x + ' . $k . ')$',
                [['$(x - ' . $k . ')^2$', 'That expands to $x^2 - ' . (2 * $k) . 'x + ' . ($k * $k) . '$.'], ['$(x - ' . ($k * $k) . ')(x + 1)$', 'Expanding gives an $x$ term, which is not there.'], ['It cannot be factorised', 'A difference of two squares always factorises.']],
                [($k * $k) . ' is $' . $k . '^2$, so this is a difference of two squares.', '$x^2 - ' . $k . '^2 = (x - ' . $k . ')(x + ' . $k . ')$.'],
                'Is ' . ($k * $k) . ' a square number?', 'procedure', 35); },
    ],
    'MC-059' => [
        static function (MlbRng $r) { $a = $r->int(2, 5); $b = $r->int($a + 1, 7); $p = $r->int(1, 3); $q = $r->int(1, 4);
            $num = $p * $b + $q * $a; $den = $a * $b; $g = mlb_gcd($num, $den);
            return mlb_typed('expr', 'Write $\\frac{' . mlb_lterm($p, 'x') . '}{' . $a . '} + \\frac{' . mlb_lterm($q, 'x') . '}{' . $b . '}$ as a single fraction.', (intdiv($num, $g)) . 'x/' . intdiv($den, $g),
                ['A common denominator is ' . $den . '.', '$\\frac{' . ($p * $b) . 'x}{' . $den . '} + \\frac{' . ($q * $a) . 'x}{' . $den . '} = \\frac{' . $num . 'x}{' . $den . '}' . ($g > 1 ? ' = \\frac{' . intdiv($num, $g) . 'x}{' . intdiv($den, $g) . '}' : '') . '$.'],
                'Algebraic fractions add like number fractions.', 'procedure', 55); },
    ],
    'MC-060' => [
        static function (MlbRng $r) { $k = $r->int(2, 9); $x1 = $r->int(2, 6); $x2 = $r->int(3, 12); if ($x2 === $x1) $x2++; $inv = $r->int(0, 1) === 1;
            if (!$inv) return mlb_typed('num', '$y$ varies directly as $x$. When $x = ' . $x1 . '$, $y = ' . ($k * $x1) . '$. Find $y$ when $x = ' . $x2 . '$.', (string)($k * $x2),
                ['Direct variation: $y = kx$. From $' . ($k * $x1) . ' = k \\times ' . $x1 . '$, $k = ' . $k . '$.', 'So $y = ' . $k . ' \\times ' . $x2 . ' = ' . ($k * $x2) . '$.'], 'Find the constant $k$ first.', 'procedure', 45);
            $K = $k * $x1 * $x2; $y1 = $K / $x1;
            return mlb_typed('num', '$y$ varies inversely as $x$. When $x = ' . $x1 . '$, $y = ' . mlb_dec($y1) . '$. Find $y$ when $x = ' . $x2 . '$.', mlb_dec($K / $x2),
                ['Inverse variation: $y = \\frac{k}{x}$, so $k = xy = ' . $x1 . ' \\times ' . mlb_dec($y1) . ' = ' . $K . '$.', 'So $y = \\frac{' . $K . '}{' . $x2 . '} = ' . mlb_dec($K / $x2) . '$.'], 'For inverse variation, $xy$ stays the same.', 'procedure', 50); },
    ],
    /* ═══ Stage 7 — Powers, Roots and Patterns ═══ */
    'MC-061' => [
        static function (MlbRng $r) { $b = $r->int(2, 6); $e = $r->int(3, 4);
            return mlb_mcq($r, 'What is $' . $b . '^' . $e . '$?', (string)($b ** $e),
                [[(string)($b * $e), 'That multiplies ' . $b . ' by ' . $e . '; the power means multiply ' . $b . ' by itself ' . $e . ' times.'], [(string)($e ** $b), 'The base and the power have swapped.'], [(string)($b ** ($e - 1)), 'One factor of ' . $b . ' is missing.']],
                ['$' . $b . '^' . $e . ' = ' . implode(' \\times ', array_fill(0, $e, $b)) . '$.', '$= ' . ($b ** $e) . '$.'],
                'How many ' . $b . 's are multiplied together?', 'concept', 25); },
    ],
    'MC-062' => [
        static function (MlbRng $r) { $c = $r->int(0, 1) === 1; $n = $c ? $r->int(2, 6) : $r->int(11, 19);
            return mlb_typed('num', 'Work out $' . ($c ? '\\sqrt[3]{' . ($n ** 3) . '}' : '\\sqrt{' . ($n * $n) . '}') . '$.', (string)$n,
                [($c ? 'Which number multiplied by itself three times gives ' . ($n ** 3) . '?' : 'Which number multiplied by itself gives ' . ($n * $n) . '?'), '$' . ($c ? $n . '^3 = ' . ($n ** 3) : $n . '^2 = ' . ($n * $n)) . '$, so the answer is ' . $n . '.'],
                'A root undoes a power.', 'procedure', 30); },
    ],
    'MC-063' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5, 'a', 'x']); $p = $r->int(2, 9); $q = $r->int(2, 9); $s = $r->int(1, $p + $q - 1); $form = $r->int(0, 1);
            if ($form === 0) return mlb_typed('num', 'Write $' . $b . '^{' . $p . '} \\times ' . $b . '^{' . $q . '}$ as a single power of ' . $b . ', $' . $b . '^k$. What is $k$?', (string)($p + $q),
                ['When you multiply powers of the same base, add the indices.', '$' . $p . ' + ' . $q . ' = ' . ($p + $q) . '$, so $' . $b . '^{' . ($p + $q) . '}$.'], 'Write out what each power means.', 'procedure', 30);
            return mlb_typed('num', 'Simplify $\\frac{' . $b . '^{' . $p . '} \\times ' . $b . '^{' . $q . '}}{' . $b . '^{' . $s . '}}$ to $' . $b . '^k$. What is $k$?', (string)($p + $q - $s),
                ['Multiplying: add the indices, $' . $p . ' + ' . $q . ' = ' . ($p + $q) . '$.', 'Dividing: subtract, $' . ($p + $q) . ' - ' . $s . ' = ' . ($p + $q - $s) . '$.'], 'Top first, then divide.', 'procedure', 40); },
    ],
    'MC-064' => [
        static function (MlbRng $r) { $form = $r->int(0, 2);
            if ($form === 0) { $b = $r->int(2, 6); $e = $r->int(1, 3); return mlb_typed('frac', 'Work out $' . $b . '^{-' . $e . '}$ as a fraction.', '1/' . ($b ** $e),
                ['A negative index means “one over”: $' . $b . '^{-' . $e . '} = \\frac{1}{' . $b . '^' . $e . '}$.', '$= \\frac{1}{' . ($b ** $e) . '}$.'], 'Negative index → reciprocal.', 'procedure', 30, ['form' => 'lowest']); }
            if ($form === 1) { $root = $r->pick([2, 3]); $base = $r->int(2, 5); $p = $r->int(1, 3); $N = $base ** $root;
                return mlb_typed('num', 'Work out $' . $N . '^{\\frac{' . $p . '}{' . $root . '}}$.', (string)($base ** $p),
                    ['The bottom of the index is the root: $\\sqrt' . ($root === 3 ? '[3]' : '') . '{' . $N . '} = ' . $base . '$.', 'The top is the power: $' . $base . '^' . $p . ' = ' . ($base ** $p) . '$.'], 'Root first, then power.', 'procedure', 40); }
            $b = $r->int(2, 99);
            return mlb_mcq($r, 'What is $' . $b . '^0$?', '1', [['0', 'Any non-zero number to the power 0 is 1, not 0.'], [(string)$b, 'The power 0 does not leave the number unchanged.'], ['It has no value', 'It does: $' . $b . '^0 = 1$.']],
                ['$\\frac{' . $b . '^n}{' . $b . '^n} = ' . $b . '^{n-n} = ' . $b . '^0$, and anything divided by itself is 1.', 'So $' . $b . '^0 = 1$.'], 'Think of $\\frac{' . $b . '^2}{' . $b . '^2}$.', 'concept', 25); },
    ],
    'MC-065' => [
        static function (MlbRng $r) { $m = $r->int(11, 99) / 10; $e = -$r->int(2, 6); $x = $m * 10 ** $e; $str = rtrim(rtrim(number_format($x, 8, '.', ''), '0'), '.');
            return mlb_mcq($r, 'Write ' . $str . ' in standard form.', '$' . mlb_dec($m) . ' \\times 10^{' . $e . '}$',
                [['$' . mlb_dec($m) . ' \\times 10^{' . (-$e) . '}$', 'A positive power makes a large number; this number is less than 1.'], ['$' . mlb_dec($m * 10) . ' \\times 10^{' . ($e - 1) . '}$', 'In standard form the first part must be between 1 and 10.'], ['$' . mlb_dec($m) . ' \\times 10^{' . ($e + 1) . '}$', 'Count the places the point moves again.']],
                ['Move the point to just after the first non-zero digit: ' . mlb_dec($m) . '.', 'It moved ' . (-$e) . ' places right, so the power is $' . $e . '$: $' . mlb_dec($m) . ' \\times 10^{' . $e . '}$.'],
                'Is the number bigger or smaller than 1?', 'procedure', 40); },
    ],
    'MC-066' => [
        static function (MlbRng $r) { $s = $r->pick([2, 3, 5, 6, 7]); $k = $r->int(2, 6); $n = $k * $k * $s;
            return mlb_mcq($r, 'Simplify $\\sqrt{' . $n . '}$.', '$' . $k . '\\sqrt{' . $s . '}$',
                [['$' . $s . '\\sqrt{' . $k . '}$', 'The square factor ' . ($k * $k) . ' comes out as ' . $k . '; the rest stays under the root.'], ['$' . ($k * $k) . '\\sqrt{' . $s . '}$', 'Square-rooting ' . ($k * $k) . ' gives ' . $k . ', not ' . ($k * $k) . '.'], ['$' . $k . '\\sqrt{' . ($s * 2) . '}$', 'Check: that squares to ' . ($k * $k * $s * 2) . '.']],
                ['Find the largest square factor: $' . $n . ' = ' . ($k * $k) . ' \\times ' . $s . '$.', '$\\sqrt{' . $n . '} = \\sqrt{' . ($k * $k) . '} \\times \\sqrt{' . $s . '} = ' . $k . '\\sqrt{' . $s . '}$.'],
                'Which square number divides ' . $n . '?', 'procedure', 40); },
    ],
    'MC-067' => [
        static function (MlbRng $r) { $s = $r->pick([2, 3, 5]); $a = $r->int(1, 4); $b = $r->int(2, 4);
            return mlb_mcq($r, 'Simplify $\\sqrt{' . ($a * $a * $s) . '} + \\sqrt{' . ($b * $b * $s) . '}$.', '$' . ($a + $b) . '\\sqrt{' . $s . '}$',
                [['$\\sqrt{' . ($a * $a * $s + $b * $b * $s) . '}$', 'Roots do not add like that: $\\sqrt{p} + \\sqrt{q} \\ne \\sqrt{p + q}$.'], ['$' . ($a * $b) . '\\sqrt{' . $s . '}$', 'Like surds are added, not multiplied.'], ['$' . ($a + $b) . '\\sqrt{' . (2 * $s) . '}$', 'The surd part does not change when you add like surds.']],
                ['Simplify each: $' . ($a === 1 ? '' : $a) . '\\sqrt{' . $s . '}$ and $' . $b . '\\sqrt{' . $s . '}$.', 'Like surds add: $' . ($a + $b) . '\\sqrt{' . $s . '}$.'],
                'Simplify each surd first.', 'procedure', 45); },
        static function (MlbRng $r) { $s = $r->pick([2, 3, 5, 6, 7]); $k = $r->int(2, 5);
            return mlb_mcq($r, 'Rationalise the denominator of $\\frac{' . ($k * $s) . '}{\\sqrt{' . $s . '}}$.', '$' . $k . '\\sqrt{' . $s . '}$',
                [['$' . ($k * $s) . '\\sqrt{' . $s . '}$', 'After multiplying by $\\sqrt{' . $s . '}$, divide by ' . $s . '.'], ['$\\frac{' . $k . '}{\\sqrt{' . $s . '}}$', 'The denominator still has a surd.'], ['$' . $k . '$', 'The $\\sqrt{' . $s . '}$ does not cancel completely.']],
                ['Multiply top and bottom by $\\sqrt{' . $s . '}$: $\\frac{' . ($k * $s) . '\\sqrt{' . $s . '}}{' . $s . '}$.', 'Simplify: $' . $k . '\\sqrt{' . $s . '}$.'],
                'Multiply by $\\frac{\\sqrt{' . $s . '}}{\\sqrt{' . $s . '}}$.', 'procedure', 45); },
    ],
    'MC-068' => [
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5, 10]); $e = $r->int(2, $b === 2 ? 6 : 4); $form = $r->int(0, 1);
            if ($form === 0) return mlb_typed('num', 'Work out $\\log_{' . $b . '} ' . ($b ** $e) . '$.', (string)$e,
                ['$\\log_{' . $b . '} ' . ($b ** $e) . '$ asks: what power of ' . $b . ' gives ' . ($b ** $e) . '?', '$' . $b . '^' . $e . ' = ' . ($b ** $e) . '$, so the answer is ' . $e . '.'], 'A logarithm is a power.', 'concept', 30);
            return mlb_typed('num', 'If $\\log_{' . $b . '} x = ' . $e . '$, find $x$.', (string)($b ** $e),
                ['$\\log_{' . $b . '} x = ' . $e . '$ means $x = ' . $b . '^' . $e . '$.', '$x = ' . ($b ** $e) . '$.'], 'Write it as a power.', 'procedure', 30); },
    ],
    'MC-069' => [
        static function (MlbRng $r) { $pairs = [[25, 4], [20, 5], [50, 2], [125, 8], [40, 25], [2, 500]]; [$p, $q] = $r->pick($pairs);
            return mlb_typed('num', 'Work out $\\log_{10} ' . $p . ' + \\log_{10} ' . $q . '$ without a calculator.', (string)(int)round(log10($p * $q)),
                ['Adding logs of the same base multiplies inside: $\\log_{10}(' . $p . ' \\times ' . $q . ') = \\log_{10} ' . ($p * $q) . '$.', '$10^{' . (int)round(log10($p * $q)) . '} = ' . ($p * $q) . '$, so the answer is ' . (int)round(log10($p * $q)) . '.'],
                'Combine them into one log.', 'procedure', 45); },
        static function (MlbRng $r) { $b = $r->pick([2, 3]); $e = $r->int(2, 4); $k = $r->int(1, 9);
            return mlb_typed('num', 'Solve $\\log_{' . $b . '}(x + ' . $k . ') = ' . $e . '$.', (string)($b ** $e - $k),
                ['Write as a power: $x + ' . $k . ' = ' . $b . '^' . $e . ' = ' . ($b ** $e) . '$.', '$x = ' . ($b ** $e) . ' - ' . $k . ' = ' . ($b ** $e - $k) . '$.'], 'Undo the log by writing a power.', 'procedure', 45); },
    ],
    'MC-070' => [
        static function (MlbRng $r) { $a = $r->int(2, 15); $d = $r->nz(-4, 7); $n = $r->int(10, 30);
            return mlb_typed('num', 'An arithmetic progression has first term ' . $a . ' and common difference ' . $d . '. Find the ' . $n . 'th term.', (string)($a + ($n - 1) * $d),
                ['$T_n = a + (n - 1)d$.', '$T_{' . $n . '} = ' . $a . ' + ' . ($n - 1) . ' \\times ' . ($d < 0 ? '(' . $d . ')' : $d) . ' = ' . ($a + ($n - 1) * $d) . '$.'], 'How many steps from the first term?', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->int(1, 5); $q = $r->pick([2, 3]); $n = $r->int(4, 6);
            return mlb_typed('num', 'A geometric progression starts $' . $a . ',\\ ' . ($a * $q) . ',\\ ' . ($a * $q * $q) . ',\\ \\dots$. Find the ' . $n . 'th term.', (string)($a * $q ** ($n - 1)),
                ['The common ratio is ' . $q . '. $T_n = ar^{n-1}$.', '$T_{' . $n . '} = ' . $a . ' \\times ' . $q . '^{' . ($n - 1) . '} = ' . ($a * $q ** ($n - 1)) . '$.'], 'Each term is multiplied by the same number.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->int(1, 9); $d = $r->int(2, 6); $n = $r->int(8, 20);
            return mlb_typed('num', 'Find the sum of the first ' . $n . ' terms of the arithmetic progression $' . $a . ',\\ ' . ($a + $d) . ',\\ ' . ($a + 2 * $d) . ',\\ \\dots$', (string)(intdiv($n * (2 * $a + ($n - 1) * $d), 2)),
                ['$S_n = \\frac{n}{2}\\left(2a + (n - 1)d\\right)$.', '$S_{' . $n . '} = \\frac{' . $n . '}{2}(' . (2 * $a) . ' + ' . (($n - 1) * $d) . ') = ' . intdiv($n * (2 * $a + ($n - 1) * $d), 2) . '$.'], 'Pair the first and last terms.', 'procedure', 50); },
    ],
    ] + (function_exists('mlb_forms_upper') ? mlb_forms_upper() : []) + (function_exists('mlb_forms_gods') ? mlb_forms_gods() : []);   // 8–17: gen-upper; 18–20: gen-gods   // Stages 8–17: mathslab-gen-upper.php
    /* Two proof forms for every topic with a "Why it works" (mathslab-why.php), appended AFTER the
       topic's own forms so no existing form changes its index (a session stores form numbers). */
    $wa = [];
    if (function_exists('mlb_why_forms')) foreach (mlb_why_forms() as $id => $extra) if (isset($f[$id])) { $wa[$id] = count($f[$id]); $f[$id] = array_merge($f[$id], $extra); }
    mlb_why_at_map($wa);
    /* The deeper Stage 5–7 forms (mathslab-gen-deep.php) come AFTER the proof pair, for the same
       reason: no form already in use may change its number. mlb_why_at() says where the pair is. */
    if (function_exists('mlb_forms_deep')) foreach (mlb_forms_deep() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    /* Exam-style forms (mathslab-gen-exam.php: JAMB and SAT), last of all for the same reason. */
    if (function_exists('mlb_forms_exam')) foreach (mlb_forms_exam() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    /* Later additions (mathslab-gen-more.php, e.g. the logarithm forms of 5 Nov 2026), last again. */
    if (function_exists('mlb_forms_more')) foreach (mlb_forms_more() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    return $f;
}

/** Where a topic's two "Why it works" forms sit in its list (justify, then order), or null.
 *  Recorded while the list is built, so a file of forms appended later can never move it. */
function mlb_why_at_map(?array $set = null): array { static $m = []; if ($set !== null) $m = $set; return $m; }
function mlb_why_at(string $comp): ?int {
    if ((lab_for_comp($comp)['id'] ?? '') !== 'maths') return null;
    lab_call('forms', 'maths');
    return mlb_why_at_map()[$comp] ?? null;
}

/** One question, reproducible from (competency, form, seed). */
function mlb_item(string $comp, int $form, int $seed): ?array {
    $forms = mlb_forms_of($comp);
    if (!$forms) return null;
    $form = (($form % count($forms)) + count($forms)) % count($forms);
    $it = ($forms[$form])(new MlbRng($seed ^ (crc32($comp) & 0x7FFFFFFF) ^ ($form * 0x9E3779B1)));
    return $it + ['comp' => $comp, 'form' => $form, 'seed' => $seed];
}

/** What the learner's screen may see: never the key, the solution or the "why" of each option before marking. */
function mlb_public(array $it): array {
    $out = ['kind' => $it['kind'], 'stem' => $it['stem'], 'dim' => $it['dim'], 'secs' => (int)$it['secs'], 'hint' => (string)$it['hint']];
    foreach (['options', 'lines', 'diagram', 'unit', 'labels', 'dp', 'exam', 'letters'] as $k) if (isset($it[$k])) $out[$k] = $it[$k];
    if (($it['form'] ?? '') === 'lowest' || in_array($it['form'] ?? '', ['expanded', 'simplified'], true)) $out['rule'] = $it['form'];
    return $out;
}

/* ── Marking ─────────────────────────────────────────────────────────────
 * Generous about form, strict about value: "1,250", "₦1250" and "1250.0" are
 * one answer; "3/4" and "0.75" are one number; "8x-12" and "-12+8x" are one
 * expression. A form rule is applied only where the skill IS the form
 * (lowest terms, "expanded").
 */

/** A number from what a learner typed: commas, ₦, %, units and a fraction allowed. */
function mlb_parse_num(string $s): ?float {
    $s = trim(str_replace(['₦', ',', ' ', '−', '%', '°c', '°', 'km/h', 'm/s²', 'm/s', '²', '³', 'cm', 'kg', 'min', 'days', 'day', 'naira'], ['', '', '', '-', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], mb_strtolower($s)));
    $s = preg_replace('/(?<=\d)m$/', '', $s);
    if ($s === '') return null;
    if (preg_match('/^(-?\d+)\s*\/\s*(-?\d+)$/', $s, $m)) return (int)$m[2] === 0 ? null : (int)$m[1] / (int)$m[2];
    return is_numeric($s) ? (float)$s : null;
}

/**
 * What a learner typed, with a unit written after the number taken off: the item's own unit first
 * (so "2 × 10⁸ m/s" against the unit "× 10⁸ m/s" leaves "2"), then any trailing run of letters and
 * unit symbols ("12 N", "4.5 kg m/s", "30 days"). Digits are never stripped, so "3 4" or "2x3" still
 * fail to read as a number rather than being read as something the learner did not write.
 */
function mlb_strip_unit(string $s, string $unit): string {
    $s = trim($s);
    if ($unit !== '' && mb_strlen($s) > mb_strlen($unit) && mb_strtolower(mb_substr($s, -mb_strlen($unit))) === mb_strtolower($unit)) $s = trim(mb_substr($s, 0, -mb_strlen($unit)));
    return trim((string)preg_replace('/(?<=[\d.])\s*[a-zA-Zµμ°%\/·Ωω²³⁻¹\s.\-]*[a-zA-Zµμ°%\/Ωω²³¹]$/u', '', $s));
}

/** "a/b", "a", "1 1/2" → [num, den] (den > 0), or null. */
function mlb_parse_frac(string $s): ?array {
    $s = trim(str_replace(['−', ' '], ['-', ' '], $s));
    if (preg_match('/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/', $s, $m)) { $d = (int)$m[4]; if (!$d) return null; $n = (int)$m[2] * $d + (int)$m[3]; return [$m[1] === '-' ? -$n : $n, $d]; }
    $s = str_replace(' ', '', $s);
    if (preg_match('/^(-?\d+)\/(-?\d+)$/', $s, $m)) { $d = (int)$m[2]; if (!$d) return null; $n = (int)$m[1]; if ($d < 0) { $n = -$n; $d = -$d; } return [$n, $d]; }
    if (preg_match('/^-?\d+$/', $s)) return [(int)$s, 1];
    if (is_numeric($s)) { $f = (float)$s; for ($d = 1; $d <= 10000; $d *= 10) if (abs($f * $d - round($f * $d)) < 1e-9) return [(int)round($f * $d), $d]; }
    return null;
}

/**
 * A safe evaluator for what a learner types as algebra: numbers, single-letter
 * variables, + − × ÷ ^, brackets, sqrt( ) / √, implicit multiplication (3x,
 * 2(x+1), xy). Never eval(). Null when it cannot be read.
 */
function mlb_expr_eval(string $s, array $vars): ?float {
    $s = mb_strtolower(trim($s));
    $s = str_replace(['−', '×', '÷', '²', '³', '√', ' ', '·', '*'], ['-', '*', '/', '^2', '^3', 'sqrt', '', '*', '*'], $s);
    if ($s === '' || mb_strlen($s) > 120) return null;
    $toks = [];
    // log( is base 10 and ln( is natural; both are read before single letters, or "log" would be l·o·g.
    preg_match_all('/sqrt|log|ln|\d+(?:\.\d+)?|[a-z]|[+\-*\/^()]/', $s, $m);
    if (implode('', $m[0]) !== $s) return null;
    $toks = $m[0]; $i = 0; $n = count($toks);
    $peek = static function () use (&$toks, &$i, $n) { return $i < $n ? $toks[$i] : null; };
    $expr = null; $term = null; $unary = null; $power = null; $primary = null;
    $primary = static function () use (&$toks, &$i, $n, &$expr, &$primary, $vars, $peek): ?float {
        $t = $peek(); if ($t === null) return null;
        if ($t === '(') { $i++; $v = $expr(); if ($peek() !== ')') return null; $i++; return $v; }
        if ($t === 'sqrt') { $i++; $v = $primary(); return $v === null || $v < 0 ? null : sqrt($v); }
        if ($t === 'log' || $t === 'ln') { $i++; $v = $primary(); return $v === null || $v <= 0 ? null : ($t === 'log' ? log10($v) : log($v)); }
        if (is_numeric($t)) { $i++; return (float)$t; }
        if (preg_match('/^[a-z]$/', $t)) { $i++; return array_key_exists($t, $vars) ? (float)$vars[$t] : null; }
        return null;
    };
    $power = static function () use (&$i, &$primary, &$unary, $peek): ?float {
        $b = $primary(); if ($b === null) return null;
        if ($peek() === '^') { $i++; $e = $unary(); if ($e === null) return null; $v = $b ** $e; return is_finite($v) ? $v : null; }
        return $b;
    };
    $unary = static function () use (&$i, &$unary, &$power, $peek): ?float {
        if ($peek() === '-') { $i++; $v = $unary(); return $v === null ? null : -$v; }
        if ($peek() === '+') { $i++; return $unary(); }
        return $power();
    };
    $term = static function () use (&$i, &$unary, $peek): ?float {
        $v = $unary(); if ($v === null) return null;
        while (true) {
            $t = $peek();
            if ($t === '*' || $t === '/') { $i++; $w = $unary(); if ($w === null) return null; if ($t === '/') { if (abs($w) < 1e-12) return null; $v /= $w; } else $v *= $w; continue; }
            if ($t !== null && ($t === '(' || $t === 'sqrt' || $t === 'log' || $t === 'ln' || is_numeric($t) || preg_match('/^[a-z]$/', $t))) { $w = $unary(); if ($w === null) return null; $v *= $w; continue; }
            return $v;
        }
    };
    $expr = static function () use (&$i, &$term, $peek): ?float {
        $v = $term(); if ($v === null) return null;
        while (($t = $peek()) === '+' || $t === '-') { $i++; $w = $term(); if ($w === null) return null; $v = $t === '+' ? $v + $w : $v - $w; }
        return $v;
    };
    $v = $expr();
    return ($v === null || $i !== $n || !is_finite($v)) ? null : $v;
}

/** Are two expressions the same function? Compared at several random points. */
function mlb_expr_equal(string $key, string $got, bool $positive = false): bool {
    preg_match_all('/[a-z]/', mb_strtolower(str_replace(['sqrt', 'log', 'ln'], '', $key . ' ' . $got)), $m);
    $letters = array_values(array_unique($m[0]));
    $ok = 0;
    for ($t = 0; $t < 14 && $ok < 6; $t++) {
        $vars = [];
        foreach ($letters as $L) $vars[$L] = $positive ? 0.7 + ($t * 1.37 + ord($L) * 0.53) - floor(($t * 1.37 + ord($L) * 0.53) / 5.0) * 5.0 : -3.3 + fmod($t * 1.7 + ord($L) * 0.61, 7.1);
        $a = mlb_expr_eval($key, $vars); $b = mlb_expr_eval($got, $vars);
        if ($a === null) continue;
        if ($b === null) return false;
        if (abs($a - $b) > 1e-7 * max(1.0, abs($a))) return false;
        $ok++;
    }
    return $ok >= 3;
}

/**
 * Mark one response. Returns ['ok' => bool, 'why' => string|null, 'form' => string|null]
 * — `why` is the misconception behind a wrong option, `form` a form-rule miss
 * (right value, wrong form: "give it in lowest terms").
 */
function mlb_mark(array $it, $resp): array {
    $kind = $it['kind'];
    if ($kind === 'order') {
        $got = is_array($resp) ? array_map('intval', array_values($resp)) : [];
        return ['ok' => $got === array_map('intval', $it['key']), 'why' => null, 'form' => null];
    }
    if ($kind === 'mcq' || $kind === 'error') {
        $i = is_numeric($resp) ? (int)$resp : -1;
        $ok = $i === (int)$it['key'];
        return ['ok' => $ok, 'why' => !$ok && $i >= 0 ? (string)($it['whys'][$i] ?? '') : null, 'form' => null];
    }
    if ($kind === 'pair') {
        $r = is_array($resp) ? array_values($resp) : explode(',', (string)$resp);
        $a = mlb_parse_num((string)($r[0] ?? '')); $b = mlb_parse_num((string)($r[1] ?? ''));
        $ok = $a !== null && $b !== null && abs($a - $it['key'][0]) < 1e-9 && abs($b - $it['key'][1]) < 1e-9;
        return ['ok' => $ok, 'why' => null, 'form' => null];
    }
    $s = trim((string)$resp);
    if ($s === '') return ['ok' => false, 'why' => null, 'form' => null];
    if ($kind === 'num') {
        $v = mlb_parse_num($s); $k = mlb_parse_num((string)$it['key']);
        // A quantity's unit typed after the number ("12 N", "2.5 days", "3 × 10⁸ m/s") is not a wrong answer.
        if ($v === null && isset($it['unit'])) $v = mlb_parse_num(mlb_strip_unit($s, (string)$it['unit']));
        /* "Correct to N decimal places": any answer that rounds to the key is
           right, so typing more digits is never marked wrong; a different
           rounding is. The key is stored already rounded. */
        if (isset($it['dp']) && $v !== null && $k !== null) return ['ok' => abs($v - $k) <= 0.5 * 10 ** -(int)$it['dp'] + 1e-9, 'why' => null, 'form' => null];
        return ['ok' => $v !== null && $k !== null && abs($v - $k) <= 1e-9 * max(1.0, abs($k)), 'why' => null, 'form' => null];
    }
    if ($kind === 'frac') {
        $f = mlb_parse_frac($s); $k = mlb_parse_frac((string)$it['key']);
        if (!$f || !$k) return ['ok' => false, 'why' => null, 'form' => null];
        $same = $f[0] * $k[1] === $k[0] * $f[1];
        if ($same && ($it['form'] ?? '') === 'lowest' && mlb_gcd($f[0], $f[1]) !== 1) return ['ok' => false, 'why' => null, 'form' => 'Right value — now give it in its lowest terms.'];
        return ['ok' => $same, 'why' => null, 'form' => null];
    }
    if ($kind === 'ratio') {
        if (!preg_match('/^\s*(\d+)\s*:\s*(\d+)\s*$/', $s, $m)) return ['ok' => false, 'why' => null, 'form' => null];
        [$ka, $kb] = array_map('intval', explode(':', (string)$it['key']));
        $a = (int)$m[1]; $b = (int)$m[2];
        $same = $a * $kb === $b * $ka && $b > 0;
        if ($same && mlb_gcd($a, $b) !== 1) return ['ok' => false, 'why' => null, 'form' => 'Right ratio — now simplify it as far as it goes.'];
        return ['ok' => $same, 'why' => null, 'form' => null];
    }
    if ($kind === 'expr') {
        // "y = 3x - 4" and "3x - 4" are the same answer to "find the equation": the left-hand side is not the skill.
        $s = preg_replace('/^\s*(?:[a-z]|f\s*\(\s*x\s*\)|f\s*\^\s*-?1\s*\(\s*x\s*\)|dy\s*\/\s*dx)\s*=\s*/i', '', $s);
        $eq = mlb_expr_equal((string)$it['key'], $s, !empty($it['positive']));
        if (!$eq) return ['ok' => false, 'why' => null, 'form' => null];
        // Factorising is the skill: the same polynomial typed back unfactorised is the right value, not the answer.
        if (($it['form'] ?? '') === 'factorised' && substr_count($s, '(') < 2) return ['ok' => false, 'why' => null, 'form' => 'Right value — now write it as a product of brackets.'];
        if (($it['form'] ?? '') === 'expanded' && strpos($s, '(') !== false) return ['ok' => false, 'why' => null, 'form' => 'Right value — now remove the brackets (expand it).'];
        if (($it['form'] ?? '') === 'simplified') {
            preg_match_all('/[a-z]+/', mb_strtolower($s), $mm);
            if (count($mm[0]) !== count(array_unique($mm[0]))) return ['ok' => false, 'why' => null, 'form' => 'Right value — now collect the like terms.'];
        }
        return ['ok' => true, 'why' => null, 'form' => null];
    }
    return ['ok' => false, 'why' => null, 'form' => null];
}

/** The answer as a learner should see it after marking. */
function mlb_answer_text(array $it): string {
    if (isset($it['show'])) return (string)$it['show'];   // a form that knows its own written form (a bearing is "030°", not "30")
    if ($it['kind'] === 'pair' && !empty($it['point'])) return '$(' . $it['key'][0] . ', ' . $it['key'][1] . ')$';
    if ($it['kind'] === 'num' && ($it['unit'] ?? '') === '°') return mlb_p((float)$it['key']) . '°';
    switch ($it['kind']) {
        case 'mcq': case 'error': return (string)$it['options'][(int)$it['key']];
        case 'order': return implode(' → ', array_map(static fn($k, $i) => ($i + 1) . '. ' . $it['options'][$k], $it['key'], array_keys($it['key'])));
        case 'pair': $L = $it['labels'] ?? ['x', 'y']; return '$' . $L[0] . ' = ' . $it['key'][0] . '$, $' . $L[1] . ' = ' . $it['key'][1] . '$';
        case 'frac': $f = mlb_parse_frac((string)$it['key']); return '$' . mlb_ftex($f[0], $f[1]) . '$';
        case 'expr': return '$' . str_replace(['sqrt(', 'log(', 'ln(', '*'], ['\\sqrt(', '\\log(', '\\ln(', ''], (string)$it['key']) . '$';
        default: return (isset($it['unit']) && $it['unit'] === '₦' ? '₦' : '') . mlb_p((float)$it['key']) . (isset($it['unit']) && $it['unit'] !== '₦' ? ' ' . $it['unit'] : '');
    }
}
