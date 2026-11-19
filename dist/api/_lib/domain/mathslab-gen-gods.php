<?php
declare(strict_types=1);

/**
 * Maths Lab — Gods of Maths: Stages 18–20 (MC-171 … MC-200), olympiad level.
 *
 * Owner, 5 Nov 2026: "Go deeper and make them become Gods of Maths" — and then, "Make things
 * tough, but easy." Both halves are the brief. TOUGH: these are the ideas olympiad problems
 * are built from (NMC, Cowbellpedia, PAMO, IMO) — number theory, counting, inequalities,
 * functional equations, olympiad geometry, proof — and a question here usually needs an idea,
 * not a formula. EASY: no question is left bare. Every one carries a hint that names the idea
 * to reach for and a worked solution that shows the idea used, step by step; every wrong
 * option names the slip behind it; and twelve topics carry a "Why it works" proof.
 *
 * Same contract as the rest of the Lab: every answer and every wrong option is DERIVED from
 * the numbers that built the question — often by brute force, counting what the question
 * counts, so a slip in a formula cannot reach a child as a "right" answer. LaTeX for maths.
 */

/* ── Number helpers ── */
function mlb_g_divisors(int $n): array { $d = []; for ($i = 1; $i * $i <= $n; $i++) if ($n % $i === 0) { $d[] = $i; if ($i * $i !== $n) $d[] = intdiv($n, $i); } sort($d); return $d; }
function mlb_g_isprime(int $n): bool { if ($n < 2) return false; for ($i = 2; $i * $i <= $n; $i++) if ($n % $i === 0) return false; return true; }
function mlb_g_phi(int $n): int { $c = 0; for ($k = 1; $k <= $n; $k++) if (mlb_gcd($k, $n) === 1) $c++; return $c; }
function mlb_g_powmod(int $a, int $e, int $m): int { $r = 1 % $m; $a %= $m; if ($a < 0) $a += $m; while ($e > 0) { if ($e & 1) $r = ($r * $a) % $m; $a = ($a * $a) % $m; $e >>= 1; } return $r; }
/** The exponent of prime p in n! (Legendre). */
function mlb_g_legendre(int $n, int $p): int { $s = 0; for ($q = $p; $q <= $n; $q *= $p) $s += intdiv($n, $q); return $s; }
/** Prime factorisation as [p => e]. */
function mlb_g_factor(int $n): array { $f = []; for ($p = 2; $p * $p <= $n; $p++) while ($n % $p === 0) { $f[$p] = ($f[$p] ?? 0) + 1; $n = intdiv($n, $p); } if ($n > 1) $f[$n] = ($f[$n] ?? 0) + 1; return $f; }
function mlb_g_ftex(array $f): string { return implode(' \\times ', array_map(static fn($p, $e) => $e === 1 ? (string)$p : $p . '^{' . $e . '}', array_keys($f), $f)); }
/** Exact rational arithmetic on [num, den]. */
function mlb_g_qadd(array $a, array $b): array { $n = $a[0] * $b[1] + $b[0] * $a[1]; $d = $a[1] * $b[1]; $g = mlb_gcd($n, $d); return [intdiv($n, $g), intdiv($d, $g)]; }
/** Distinct arrangements of a multiset of letters (n! / Π k!). */
function mlb_g_multiperm(string $w): int { $c = count_chars($w, 1); $v = mlb_fact(strlen($w)); foreach ($c as $k) $v = intdiv($v, mlb_fact($k)); return $v; }

function mlb_forms_gods(): array {
    return [
    /* ═══ Stage 18 — The Theory of Numbers ═══ */
    'MC-171' => [
        static function (MlbRng $r) { do { $ps = $r->shuffle([2, 3, 5, 7]); $N = ($ps[0] ** $r->int(1, 4)) * ($ps[1] ** $r->int(1, 3)) * ($r->int(0, 1) ? $ps[2] : 1); } while ($N > 5000 || $N < 30);
            $f = mlb_g_factor($N); $d = count(mlb_g_divisors($N));
            return mlb_typed('num', 'How many positive divisors does ' . mlb_p($N) . ' have?', (string)$d,
                ['Factorise: $' . mlb_n($N) . ' = ' . mlb_g_ftex($f) . '$.', 'A divisor chooses each prime’s power from 0 up to its index, independently: $' . implode(' \\times ', array_map(static fn($e) => '(' . $e . ' + 1)', $f)) . ' = ' . $d . '$.'],
                'Factorise into primes first; then count the choices for each prime.', 'procedure', 60); },
        static function (MlbRng $r) { do { $N = $r->int(12, 200); } while (mlb_g_isprime($N)); $ds = mlb_g_divisors($N); $s = array_sum($ds);
            return mlb_typed('num', 'What is the sum of all the positive divisors of ' . $N . ' (including 1 and ' . $N . ')?', (string)$s,
                ['List the divisors in pairs that multiply to ' . $N . ': ' . implode(', ', $ds) . '.', 'Add them: ' . $s . '.'], 'Find divisors in pairs: if $d$ divides ' . $N . ', so does $' . $N . ' \\div d$.', 'procedure', 75); },
        static function (MlbRng $r) { $primes = array_values(array_filter(range(53, 199), 'mlb_g_isprime')); $p = $r->pick($primes);
            $traps = []; foreach ([[7, 13], [7, 11], [3, 29], [3, 17], [11, 13], [7, 17], [3, 31], [13, 13], [7, 19], [11, 17], [3, 23], [7, 23], [13, 11]] as [$x, $y]) $traps[$x * $y] = [$x, $y];
            $ks = $r->shuffle(array_keys($traps)); $wrong = []; foreach (array_slice($ks, 0, 3) as $k) $wrong[] = [(string)$k, $k . ' $= ' . $traps[$k][0] . ' \\times ' . $traps[$k][1] . '$.'];
            return mlb_mcq($r, 'Exactly one of these numbers is prime. Which one?', (string)$p, $wrong,
                ['To test $n$, try dividing by every prime up to $\\sqrt{n}$; if none divides it, it is prime.', '$\\sqrt{' . $p . '} < ' . ((int)floor(sqrt($p)) + 1) . '$, and no prime up to ' . (int)floor(sqrt($p)) . ' divides ' . $p . ', so ' . $p . ' is prime.'],
                'Only primes up to the square root need testing — and odd numbers ending in 1, 3, 7, 9 can still be composite.', 'challenge', 60); },
        static function (MlbRng $r) { $k = $r->pick([4, 6, 8, 9, 10, 12, 14, 16]); $n = 1; while (count(mlb_g_divisors($n)) !== $k) $n++;
            return mlb_typed('num', 'What is the smallest positive whole number with exactly ' . $k . ' divisors?', (string)$n,
                ['If $n = p^a q^b \\cdots$, then $n$ has $(a + 1)(b + 1)\\cdots$ divisors, so write ' . $k . ' as such a product.', 'Give the biggest index to the smallest prime and compare the options: the smallest is $' . $n . ' = ' . mlb_g_ftex(mlb_g_factor($n)) . '$.'],
                'Split ' . $k . ' into factors $(a + 1)(b + 1)\\cdots$ and put the big powers on the small primes.', 'challenge', 120); },
    ],
    'MC-172' => [
        static function (MlbRng $r) { $g = $r->int(2, 30); do { $a = $r->int(8, 70); $b = $r->int(5, 60); } while (mlb_gcd($a, $b) !== 1 || $a === $b); $A = $a * $g; $B = $b * $g; if ($A < $B) [$A, $B] = [$B, $A];
            $steps = []; $x = $A; $y = $B; while ($y) { $q = intdiv($x, $y); $rm = $x % $y; $steps[] = '$' . $x . ' = ' . $q . ' \\times ' . $y . ' + ' . $rm . '$'; [$x, $y] = [$y, $rm]; }
            return mlb_typed('num', 'Use the Euclidean algorithm to find $\\gcd(' . $A . ', ' . $B . ')$.', (string)$g,
                ['$\\gcd(a, b) = \\gcd(b, r)$, where $r$ is the remainder of $a \\div b$. Repeat until the remainder is 0: ' . implode('; ', $steps) . '.', 'The last non-zero remainder is the HCF: ' . $g . '.'],
                'Divide, keep the remainder, repeat.', 'procedure', 90); },
        static function (MlbRng $r) { $g = $r->int(2, 12); $a = $r->int(2, 11); do { $b = $r->int(2, 13); } while (mlb_gcd($a, $b) !== 1 || $a === $b); $P = $g * $a * $g * $b;
            return mlb_typed('num', 'Two numbers have product ' . mlb_p($P) . ' and HCF ' . $g . '. What is their LCM?', (string)($g * $a * $b),
                ['For any two whole numbers, $\\text{HCF} \\times \\text{LCM} = $ their product.', 'LCM $= ' . mlb_n($P) . ' \\div ' . $g . ' = ' . ($g * $a * $b) . '$.'], 'HCF × LCM = product.', 'procedure', 45); },
        static function (MlbRng $r) { do { $a = $r->int(4, 40); $b = $r->int(4, 60); } while ($a === $b || mlb_gcd($a, $b) === min($a, $b)); $g = mlb_gcd($a, $b);
            return mlb_mcq($r, 'Which whole numbers can be written as $' . $a . 'x + ' . $b . 'y$ with $x$ and $y$ integers (positive, negative or zero)?', 'Exactly the multiples of ' . $g,
                [['Every whole number', 'Both terms are multiples of ' . $g . ', so the total always is too' . ($g === 1 ? '' : ' — it cannot be 1') . '.'], ['Exactly the multiples of ' . min($a, $b), 'Combining them can reach smaller steps: the smallest positive value is $\\gcd(' . $a . ', ' . $b . ') = ' . $g . '$.'],
                 ['Exactly the multiples of ' . mlb_lcm($a, $b), 'The LCM is far too big: the gaps are the HCF, not the LCM.']],
                ['Every value of $' . $a . 'x + ' . $b . 'y$ is a multiple of $\\gcd(' . $a . ', ' . $b . ') = ' . $g . '$.', 'Bézout: the Euclidean algorithm run backwards writes ' . $g . ' itself in this form, and so every multiple of ' . $g . ' too.'],
                'What must divide every value of $' . $a . 'x + ' . $b . 'y$?', 'reasoning', 60); },
        static function (MlbRng $r) { do { $a = $r->int(4, 24); $b = $r->int(4, 24); } while ($a === $b || mlb_gcd($a, $b) === 1); $g = mlb_gcd($a, $b);
            return mlb_typed('num', 'Find $\\gcd(2^{' . $a . '} - 1,\\ 2^{' . $b . '} - 1)$.', (string)(2 ** $g - 1),
                ['$2^{m} - 1$ divides $2^{km} - 1$ (it is $x - 1$ dividing $x^k - 1$ with $x = 2^m$), and the Euclidean algorithm on the indices runs alongside: $\\gcd(2^a - 1, 2^b - 1) = 2^{\\gcd(a, b)} - 1$.',
                 '$\\gcd(' . $a . ', ' . $b . ') = ' . $g . '$, so the answer is $2^{' . $g . '} - 1 = ' . (2 ** $g - 1) . '$.'],
                'Work with the indices, not the huge numbers.', 'challenge', 90); },
    ],
    'MC-173' => [
        static function (MlbRng $r) { $m = $r->pick([3, 4, 5, 6, 7, 9, 11, 13]); do { $a = $r->int(2, 12); } while ($a % $m === 0); $n = $r->int(20, 200); $v = mlb_g_powmod($a, $n, $m);
            $cyc = []; $x = 1; for ($i = 1; $i <= $m + 1; $i++) { $x = ($x * $a) % $m; $cyc[] = $x; if ($x === 1) break; } $L = count($cyc);
            return mlb_typed('num', 'What is the remainder when $' . $a . '^{' . $n . '}$ is divided by ' . $m . '?', (string)$v,
                ['Work mod ' . $m . ': the powers of ' . $a . ' leave remainders ' . implode(', ', $cyc) . ($x === 1 ? ', then repeat every ' . $L . '.' : '.'),
                 ($x === 1 ? '$' . $n . ' = ' . $L . ' \\times ' . intdiv($n, $L) . ' + ' . ($n % $L) . '$, so $' . $a . '^{' . $n . '} \\equiv ' . $a . '^{' . ($n % $L) . '} \\equiv ' . $v . '$.' : 'Reading the pattern gives ' . $v . '.')],
                'Find when the remainders start repeating.', 'procedure', 80); },
        static function (MlbRng $r) { $m = $r->pick([7, 9, 11, 12, 13]); $a = $r->int(1000, 9999); $b = $r->int(100, 999); $c = $r->int(10, 99);
            $v = (($a % $m) * ($b % $m) + $c) % $m;
            return mlb_typed('num', 'What is the remainder when $' . $a . ' \\times ' . $b . ' + ' . $c . '$ is divided by ' . $m . '? (No calculator: reduce first.)', (string)$v,
                ['Replace each number by its remainder mod ' . $m . ': $' . $a . ' \\equiv ' . ($a % $m) . '$, $' . $b . ' \\equiv ' . ($b % $m) . '$, $' . $c . ' \\equiv ' . ($c % $m) . '$.', '$' . ($a % $m) . ' \\times ' . ($b % $m) . ' + ' . ($c % $m) . ' = ' . (($a % $m) * ($b % $m) + $c % $m) . ' \\equiv ' . $v . ' \\pmod{' . $m . '}$.'],
                'Remainders can be multiplied and added in place of the numbers.', 'procedure', 60); },
        static function (MlbRng $r) { $m = $r->int(5, 17); $x = $r->int(1, $m - 1); $k = $r->int(2, 9); $c = $r->int(1, 20);
            return mlb_typed('num', 'A number leaves remainder ' . $x . ' when divided by ' . $m . '. What remainder does $' . $k . 'n + ' . $c . '$ leave when divided by ' . $m . '?', (string)(($k * $x + $c) % $m),
                ['$n \\equiv ' . $x . ' \\pmod{' . $m . '}$, so $' . $k . 'n + ' . $c . ' \\equiv ' . $k . ' \\times ' . $x . ' + ' . $c . ' = ' . ($k * $x + $c) . '$.', '$' . ($k * $x + $c) . ' = ' . $m . ' \\times ' . intdiv($k * $x + $c, $m) . ' + ' . (($k * $x + $c) % $m) . '$, so the remainder is ' . (($k * $x + $c) % $m) . '.'],
                'Work with the remainder instead of the number.', 'procedure', 50); },
        static function (MlbRng $r) { $a = $r->pick([3, 7, 9, 11, 13]); $n = $r->int(50, 999); $v = mlb_g_powmod($a, $n, 100); $L = 1; while (mlb_g_powmod($a, $L, 100) !== 1) $L++;
            return mlb_typed('num', 'What are the last two digits of $' . $a . '^{' . $n . '}$? (Give them as a number from 0 to 99.)', (string)$v,
                ['The last two digits are the remainder mod 100. The powers of ' . $a . ' come back to 1 mod 100 at $' . $a . '^{' . $L . '} \\equiv 1$, so they repeat every ' . $L . '.',
                 '$' . $n . ' = ' . $L . ' \\times ' . intdiv($n, $L) . ' + ' . ($n % $L) . '$, so $' . $a . '^{' . $n . '} \\equiv ' . $a . '^{' . ($n % $L) . '} \\equiv ' . $v . ' \\pmod{100}$.'],
                'Find the first power of ' . $a . ' that ends in 01.', 'challenge', 120); },
    ],
    'MC-174' => [
        static function (MlbRng $r) { $p = $r->pick([5, 7, 11, 13, 17, 19, 23]); do { $a = $r->int(2, 30); } while ($a % $p === 0); $q = $r->int(3, 40); $rm = $r->int(1, $p - 2); $n = $q * ($p - 1) + $rm; $v = mlb_g_powmod($a, $n, $p);
            return mlb_typed('num', 'Find the remainder when $' . $a . '^{' . $n . '}$ is divided by ' . $p . '.', (string)$v,
                [$p . ' is prime and does not divide ' . $a . ', so by Fermat $' . $a . '^{' . ($p - 1) . '} \\equiv 1 \\pmod{' . $p . '}$.', '$' . $n . ' = ' . ($p - 1) . ' \\times ' . $q . ' + ' . $rm . '$, so $' . $a . '^{' . $n . '} \\equiv ' . $a . '^{' . $rm . '} \\equiv ' . $v . ' \\pmod{' . $p . '}$.'],
                'Divide the index by $p - 1$.', 'procedure', 75); },
        static function (MlbRng $r) { $m = $r->pick([10, 12, 15, 20, 21, 14, 18]); $ph = mlb_g_phi($m); do { $a = $r->int(2, 30); } while (mlb_gcd($a, $m) !== 1); $q = $r->int(5, 50); $rm = $r->int(1, $ph - 1); $n = $q * $ph + $rm; $v = mlb_g_powmod($a, $n, $m);
            return mlb_typed('num', 'Find the remainder when $' . $a . '^{' . $n . '}$ is divided by ' . $m . '.', (string)$v,
                ['$\\varphi(' . $m . ') = ' . $ph . '$ (the numbers below ' . $m . ' sharing no factor with it), and $\\gcd(' . $a . ', ' . $m . ') = 1$, so Euler gives $' . $a . '^{' . $ph . '} \\equiv 1 \\pmod{' . $m . '}$.',
                 '$' . $n . ' = ' . $ph . ' \\times ' . $q . ' + ' . $rm . '$, so $' . $a . '^{' . $n . '} \\equiv ' . $a . '^{' . $rm . '} \\equiv ' . $v . '$.'],
                'Euler’s theorem: the index can be cut down by $\\varphi(m)$.', 'challenge', 100); },
        static function (MlbRng $r) { $p = $r->pick([31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101]); do { $a = $r->int(2, 15); } while ($a % $p === 0);
            return mlb_mcq($r, 'What is the remainder when $' . $a . '^{' . ($p - 1) . '}$ is divided by ' . $p . '?', '1',
                [['0', $p . ' is prime and does not divide ' . $a . ', so it cannot divide any power of ' . $a . '.'], [(string)$a, 'That is $a^p \\equiv a$; here the index is $p - 1$.'], [(string)($p - 1), 'Fermat’s little theorem gives exactly 1.']],
                [$p . ' is prime and $' . $p . ' \\nmid ' . $a . '$.', 'Fermat’s little theorem: $a^{p - 1} \\equiv 1 \\pmod p$, so the remainder is 1.'], 'Is ' . $p . ' prime?', 'concept', 40); },
        static function (MlbRng $r) { $p = $r->pick([5, 7, 11, 13]); $a = $r->int(2, 60); if ($a % $p === 0) $a++;
            return mlb_typed('num', $p . ' is prime. Find the remainder when $' . $a . '^{' . ($p * $p) . '}$ is divided by ' . $p . '.', (string)($a % $p),
                ['Fermat in its other form: $a^p \\equiv a \\pmod p$ for every whole number $a$.', 'So $' . $a . '^{' . ($p * $p) . '} = (' . $a . '^{' . $p . '})^{' . $p . '} \\equiv ' . $a . '^{' . $p . '} \\equiv ' . $a . ' \\equiv ' . ($a % $p) . ' \\pmod{' . $p . '}$.'],
                '$a^{p^2} = (a^p)^p$.', 'challenge', 75); },
    ],
    'MC-175' => [
        static function (MlbRng $r) { $m = $r->pick([7, 9, 11, 13, 17]); do { $a = $r->int(2, $m - 1); } while (mlb_gcd($a, $m) !== 1); $b = $r->int(1, $m - 1); $x = 1; while (($a * $x) % $m !== $b % $m) $x++;
            return mlb_typed('num', 'Find the smallest positive $x$ with $' . $a . 'x \\equiv ' . $b . ' \\pmod{' . $m . '}$.', (string)$x,
                ['Find the inverse of ' . $a . ' mod ' . $m . ' (the number that multiplies ' . $a . ' to give 1), or try $x = 1, 2, 3, \\dots$', '$' . $a . ' \\times ' . $x . ' = ' . ($a * $x) . ' = ' . $m . ' \\times ' . intdiv($a * $x, $m) . ' + ' . $b . '$, so $x = ' . $x . '$.'],
                'Multiply both sides by the inverse of ' . $a . '.', 'procedure', 70); },
        static function (MlbRng $r) { do { $m1 = $r->int(3, 11); $m2 = $r->int(4, 13); } while (mlb_gcd($m1, $m2) !== 1); $r1 = $r->int(0, $m1 - 1); $r2 = $r->int(0, $m2 - 1); $x = 1; while ($x % $m1 !== $r1 || $x % $m2 !== $r2) $x++;
            return mlb_typed('num', 'Find the smallest positive whole number that leaves remainder ' . $r1 . ' when divided by ' . $m1 . ' and remainder ' . $r2 . ' when divided by ' . $m2 . '.', (string)$x,
                ['List the numbers with remainder ' . $r2 . ' mod ' . $m2 . ': $' . implode(', ', array_map(static fn($k) => $r2 + $k * $m2, range(0, 4))) . ', \\dots$', 'Check each against ' . $m1 . ': the first that leaves ' . $r1 . ' is ' . $x . '. (Chinese remainder theorem: one answer below $' . $m1 . ' \\times ' . $m2 . ' = ' . ($m1 * $m2) . '$.)'],
                'Step through one list and test against the other condition.', 'procedure', 90); },
        static function (MlbRng $r) { $n = $r->int(61, 419); $ms = [3, 4, 5]; $rs = array_map(static fn($m) => $n % $m, $ms); $x = 1; while ($x % 3 !== $rs[0] || $x % 4 !== $rs[1] || $x % 5 !== $rs[2]) $x++;
            return mlb_typed('num', 'A farmer counts her eggs in threes and has ' . $rs[0] . ' left over, in fours and has ' . $rs[1] . ' left over, and in fives and has ' . $rs[2] . ' left over. What is the smallest number of eggs she could have?', (string)$x,
                ['Since 3, 4 and 5 share no factors, the answer repeats every $3 \\times 4 \\times 5 = 60$.', 'Search 1 to 60 for the number meeting all three: ' . $x . '.'],
                'Satisfy the condition with the largest divisor first, then test.', 'challenge', 120); },
        static function (MlbRng $r) { $m = $r->pick([12, 15, 18, 20, 21, 24]); $as = array_values(array_filter(range(2, $m - 1), static fn($a) => mlb_gcd($a, $m) > 1)); $a = $r->pick($as); $g = mlb_gcd($a, $m); $b = $r->int(1, $m - 1);
            $sol = 0; for ($x = 0; $x < $m; $x++) if (($a * $x) % $m === $b) $sol++;
            $right = $sol === 0 ? 'None' : ($sol === 1 ? 'Exactly 1' : 'Exactly ' . $sol); $opts = array_values(array_diff(['None', 'Exactly 1', 'Exactly ' . $g, 'Exactly ' . $m], [$right]));
            return mlb_mcq($r, 'How many solutions $x$ in $\\{0, 1, \\dots, ' . ($m - 1) . '\\}$ does $' . $a . 'x \\equiv ' . $b . ' \\pmod{' . $m . '}$ have?', $right,
                array_map(static fn($o) => [$o, 'With $g = \\gcd(' . $a . ', ' . $m . ') = ' . $g . '$: if $g$ divides ' . $b . ' there are exactly $g$ solutions, and otherwise none.'], array_slice($opts, 0, 3)),
                ['$\\gcd(' . $a . ', ' . $m . ') = ' . $g . '$, and every value of $' . $a . 'x$ mod ' . $m . ' is a multiple of ' . $g . '.', $b % $g === 0 ? $g . ' divides ' . $b . ', so there are exactly ' . $g . ' solutions.' : $g . ' does not divide ' . $b . ', so there are no solutions.'],
                'Compare ' . $b . ' with $\\gcd(' . $a . ', ' . $m . ')$.', 'reasoning', 75); },
    ],
    'MC-176' => [
        static function (MlbRng $r) { do { do { $a = $r->int(2, 9); $b = $r->int(3, 13); } while (mlb_gcd($a, $b) !== 1 || $a === $b); $c = $r->int(40, 160); $cnt = 0; $ex = [];
            for ($x = 1; $a * $x < $c; $x++) if (($c - $a * $x) % $b === 0) { $cnt++; if (count($ex) < 3) $ex[] = '(' . $x . ', ' . intdiv($c - $a * $x, $b) . ')'; } } while ($cnt === 0);
            return mlb_typed('num', 'How many pairs of POSITIVE integers $(x, y)$ satisfy $' . $a . 'x + ' . $b . 'y = ' . $c . '$?', (string)$cnt,
                [$cnt ? 'Find one solution, e.g. $' . $ex[0] . '$. The others step by $x + ' . $b . '$, $y - ' . $a . '$ (that keeps $' . $a . 'x + ' . $b . 'y$ the same).' : 'Try each $x$ from 1 while $' . $a . 'x < ' . $c . '$: $' . $c . ' - ' . $a . 'x$ is never a positive multiple of ' . $b . '.',
                 $cnt ? 'Keep stepping while both stay positive: ' . implode(', ', $ex) . ($cnt > 3 ? ', …' : '') . ' — ' . $cnt . ' in all.' : 'So there are none.'],
                'Find one solution, then step by $(+' . $b . ', -' . $a . ')$.', 'procedure', 90); },
        static function (MlbRng $r) { $a = $r->pick([4, 6, 8, 9, 10, 12, 14, 15]); do { $b = $r->int(6, 30); } while ($b === $a); $g = mlb_gcd($a, $b); $c = $r->int(20, 99);
            $yes = $c % $g === 0;
            return mlb_mcq($r, 'Does $' . $a . 'x + ' . $b . 'y = ' . $c . '$ have a solution in integers?', $yes ? 'Yes, because $\\gcd(' . $a . ', ' . $b . ') = ' . $g . '$ divides ' . $c : 'No, because $\\gcd(' . $a . ', ' . $b . ') = ' . $g . '$ does not divide ' . $c,
                [[$yes ? 'No, because ' . $c . ' is not a multiple of ' . $a . ' or of ' . $b : 'Yes, because ' . $c . ' is bigger than ' . $a . ' and ' . $b, 'Only the HCF matters: $ax + by = c$ is solvable exactly when $\\gcd(a, b)$ divides $c$.'],
                 ['Only if $x$ and $y$ may be fractions', 'In integers the test is whether $\\gcd(a, b)$ divides $c$.'], ['It cannot be decided without trying every pair', 'The HCF test decides it at once.']],
                ['Every value of $' . $a . 'x + ' . $b . 'y$ is a multiple of $' . $g . '$; and by Bézout every multiple of ' . $g . ' is reached.', $yes ? $g . ' divides ' . $c . ', so there is a solution.' : $g . ' does not divide ' . $c . ', so there is none.'],
                'What must divide the left side?', 'reasoning', 50); },
        static function (MlbRng $r) { do { $a = $r->int(3, 9); $b = $r->int(4, 13); } while (mlb_gcd($a, $b) !== 1 || $a === $b); $c = $r->int(30, 90); $cnt = 0;
            for ($x = 0; $a * $x <= $c; $x++) if (($c - $a * $x) % $b === 0) $cnt++;
            return mlb_typed('num', 'Stamps come in ₦' . $a . ' and ₦' . $b . '. In how many different ways can you make exactly ₦' . $c . ' (using any number of each, including none)?', (string)$cnt,
                ['Count the pairs $(x, y)$ of whole numbers, zero allowed, with $' . $a . 'x + ' . $b . 'y = ' . $c . '$.', 'Try $x = 0, 1, 2, \\dots$ while $' . $a . 'x \\le ' . $c . '$, and keep those where $' . $c . ' - ' . $a . 'x$ is a multiple of ' . $b . ': ' . $cnt . ' ways.'],
                'Fix the number of ₦' . $a . ' stamps and test what is left.', 'application', 80, ['unit' => 'ways']); },
        static function (MlbRng $r) { do { $a = $r->int(3, 11); $b = $r->int(4, 13); } while (mlb_gcd($a, $b) !== 1 || $a === $b); $F = $a * $b - $a - $b;
            return mlb_typed('num', 'With only ₦' . $a . ' and ₦' . $b . ' coins, what is the LARGEST amount that cannot be paid exactly?', (string)$F,
                ['For coprime $a$ and $b$, the largest amount that cannot be made is $ab - a - b$ (Sylvester).', '$' . $a . ' \\times ' . $b . ' - ' . $a . ' - ' . $b . ' = ' . $F . '$. Check: ' . $F . ' cannot be made, and every amount above it can.'],
                'Every amount from some point on can be made. Which one is the last that cannot?', 'challenge', 90); },
    ],
    'MC-177' => [
        static function (MlbRng $r) { $n = $r->int(25, 500); $z = mlb_g_legendre($n, 5); $parts = []; for ($q = 5; $q <= $n; $q *= 5) $parts[] = '\\lfloor \\frac{' . $n . '}{' . $q . '} \\rfloor';
            return mlb_typed('num', 'How many zeros does $' . $n . '!$ end with?', (string)$z,
                ['Each final zero is a factor 10 = 2 × 5, and there are far more 2s than 5s, so count the 5s.', '$' . implode(' + ', $parts) . ' = ' . $z . '$.'], 'Count multiples of 5, then of 25, then of 125…', 'procedure', 60); },
        static function (MlbRng $r) { $p = $r->pick([2, 3, 7]); $n = $r->int(20, 120); $e = mlb_g_legendre($n, $p); $parts = []; for ($q = $p; $q <= $n; $q *= $p) $parts[] = intdiv($n, $q);
            return mlb_typed('num', 'What is the highest power of ' . $p . ' that divides $' . $n . '!$? Give the index.', (string)$e,
                ['Legendre: add $\\lfloor n/p \\rfloor + \\lfloor n/p^2 \\rfloor + \\dots$ — the multiples of ' . $p . ' give one factor each, the multiples of ' . ($p * $p) . ' one more, and so on.', '$' . implode(' + ', $parts) . ' = ' . $e . '$.'],
                'Count multiples of ' . $p . ', then of ' . ($p * $p) . ', then of ' . ($p ** 3) . '…', 'procedure', 60); },
        static function (MlbRng $r) { $n = 5 * $r->int(10, 60);
            return mlb_mcq($r, 'Why does $' . $n . '!$ end in exactly as many zeros as it has factors of 5?', 'Each zero needs a factor 2 and a factor 5, and there are more 2s than 5s',
                [['Because only the multiples of 10 make zeros, one zero each', 'Multiples of 25 give an extra 5 that pairs with a spare 2, so counting multiples of 10 undercounts.'], ['Because 5 is the largest prime below 10, so it controls the last digit', 'Size has nothing to do with it; the scarcer of the factors 2 and 5 decides.'],
                 ['Because the factors of 2 cancel out, leaving only the 5s to count', 'Nothing cancels: there are simply more 2s than are needed.']],
                ['$10 = 2 \\times 5$, so the number of final zeros is the number of complete $2 \\times 5$ pairs.', 'Every second number gives a 2 but only every fifth gives a 5, so the 5s run out first.'],
                'What does a final zero need?', 'reasoning', 50); },
        static function (MlbRng $r) { [$m, $f] = $r->pick([[12, [2 => 2, 3 => 1]], [18, [2 => 1, 3 => 2]], [6, [2 => 1, 3 => 1]], [20, [2 => 2, 5 => 1]], [45, [3 => 2, 5 => 1]], [8, [2 => 3]]]); $n = $r->int(20, 80);
            $k = PHP_INT_MAX; $txt = []; foreach ($f as $p => $e) { $v = mlb_g_legendre($n, $p); $k = min($k, intdiv($v, $e)); $txt[] = $p . '^{' . $v . '}'; }
            return mlb_typed('num', 'What is the largest $k$ such that $' . $m . '^k$ divides $' . $n . '!$?', (string)$k,
                ['$' . $m . ' = ' . mlb_g_ftex($f) . '$. Legendre gives the primes in $' . $n . '!$: $' . implode(' \\times ', $txt) . ' \\times \\dots$',
                 'Each copy of ' . $m . ' uses ' . implode(' and ', array_map(static fn($p, $e) => $e . ' of the ' . $p . 's', array_keys($f), $f)) . '; the scarcest decides: $k = ' . $k . '$.'],
                'Split ' . $m . ' into primes and see which runs out first.', 'challenge', 120); },
    ],
    'MC-178' => [
        static function (MlbRng $r) { $d = []; $len = $r->int(10, 16); for ($i = 0; $i < $len; $i++) $d[] = $i === 0 ? $r->int(1, 9) : $r->int(0, 9); $s = array_sum($d);
            return mlb_typed('num', 'What is the remainder when ' . implode('', $d) . ' is divided by 9?', (string)($s % 9),
                ['$10 \\equiv 1 \\pmod 9$, so every power of 10 is $\\equiv 1$ and a number is $\\equiv$ its digit sum.', 'Digit sum: ' . $s . '; $' . $s . ' = 9 \\times ' . intdiv($s, 9) . ' + ' . ($s % 9) . '$.'], 'Add the digits.', 'procedure', 45); },
        static function (MlbRng $r) { $d = []; $len = $r->int(6, 9); for ($i = 0; $i < $len; $i++) $d[] = $i === 0 ? $r->int(1, 9) : $r->int(0, 9); $alt = 0; $rev = array_reverse($d); foreach ($rev as $i => $x) $alt += ($i % 2 ? -1 : 1) * $x;
            $N = (int)implode('', $d);
            return mlb_typed('num', 'What is the remainder when ' . $N . ' is divided by 11?', (string)($N % 11),
                ['$10 \\equiv -1 \\pmod{11}$, so the digits count $+, -, +, \\dots$ from the right.', 'Alternating sum from the right: $' . $alt . '$, and $' . $alt . ' \\equiv ' . ((($alt % 11) + 11) % 11) . ' \\pmod{11}$.'], 'Alternate the signs of the digits, starting from the units.', 'procedure', 60); },
        static function (MlbRng $r) { do { $d = []; for ($i = 0; $i < 6; $i++) $d[] = $i === 0 ? $r->int(1, 9) : $r->int(0, 9); $pos = $r->int(1, 5); $d[$pos] = 0; $s = array_sum($d); $x = (9 - $s % 9) % 9; } while ($x === 0);
            $shown = $d; $shown[$pos] = '\\square';
            return mlb_typed('num', 'The six-digit number $' . implode('', $shown) . '$ is divisible by 9. Which digit is in the box?', (string)$x,
                ['A number is divisible by 9 exactly when its digit sum is.', 'The other digits add to ' . $s . '; the next multiple of 9 is ' . ($s + $x) . ', so the box holds ' . $x . '.'], 'What must the digit sum be?', 'procedure', 50); },
        static function (MlbRng $r) { $b = $r->int(5, 16); $v = ($b + 1) ** 2;
            return mlb_typed('num', 'In some base $b$, the number written $121$ means ' . $v . ' in ordinary (base-ten) numbers. What is $b$?', (string)$b,
                ['$121_b = b^2 + 2b + 1 = (b + 1)^2$.', '$(b + 1)^2 = ' . $v . '$, so $b + 1 = ' . ($b + 1) . '$ and $b = ' . $b . '$.'], 'Write $121_b$ in terms of $b$ — does it factorise?', 'challenge', 60); },
    ],
    'MC-179' => [
        static function (MlbRng $r) { $n = $r->int(12, 150); $ph = mlb_g_phi($n); $f = mlb_g_factor($n);
            return mlb_typed('num', 'How many whole numbers from 1 to ' . $n . ' share no common factor (other than 1) with ' . $n . '? (This is $\\varphi(' . $n . ')$.)', (string)$ph,
                ['$' . $n . ' = ' . mlb_g_ftex($f) . '$. Euler: $\\varphi(n) = n \\prod (1 - \\frac{1}{p})$ over the primes $p$ dividing $n$.', '$' . $n . ' \\times ' . implode(' \\times ', array_map(static fn($p) => '\\frac{' . ($p - 1) . '}{' . $p . '}', array_keys($f))) . ' = ' . $ph . '$.'],
                'Strike out the multiples of each prime factor.', 'procedure', 75); },
        static function (MlbRng $r) { [$p, $k] = $r->pick([[2, 5], [2, 6], [2, 7], [3, 3], [3, 4], [5, 2], [5, 3], [7, 2], [11, 2], [13, 2]]); $N = $p ** $k;
            return mlb_typed('num', 'Find $\\varphi(' . $N . ')$, where $' . $N . ' = ' . $p . '^{' . $k . '}$.', (string)($N - intdiv($N, $p)),
                ['The numbers up to $' . $N . '$ sharing a factor with it are exactly the multiples of ' . $p . ': there are $' . $N . ' \\div ' . $p . ' = ' . intdiv($N, $p) . '$ of them.', '$\\varphi(' . $N . ') = ' . $N . ' - ' . intdiv($N, $p) . ' = ' . ($N - intdiv($N, $p)) . '$.'],
                'Only multiples of ' . $p . ' fail.', 'procedure', 45); },
        static function (MlbRng $r) { do { $a = $r->int(3, 12); $b = $r->int(3, 12); } while (mlb_gcd($a, $b) !== 1);
            return mlb_mcq($r, '$\\varphi(' . ($a * $b) . ') = \\varphi(' . $a . ') \\times \\varphi(' . $b . ') = ' . mlb_g_phi($a) . ' \\times ' . mlb_g_phi($b) . '$. In general, when is $\\varphi(mn) = \\varphi(m)\\varphi(n)$?', 'Whenever $\\gcd(m, n) = 1$',
                [['Always', 'False: $\\varphi(4) = 2$ but $\\varphi(2) \\times \\varphi(2) = 1$.'], ['Only when $m$ and $n$ are both prime', 'Too narrow: ' . $a . ' and ' . $b . ' work here' . (mlb_g_isprime($a) && mlb_g_isprime($b) ? '' : ' though not both are prime') . '.'], ['Never, except by coincidence', 'It is a theorem: it holds for every coprime pair.']],
                ['When $m$ and $n$ share no factor, being coprime to $mn$ means being coprime to $m$ AND to $n$ — two independent conditions (Chinese remainder theorem).', 'So the counts multiply exactly when $\\gcd(m, n) = 1$.'],
                'Try $m = n = 2$.', 'reasoning', 50); },
        static function (MlbRng $r) { do { $n = $r->int(12, 72); } while (count(mlb_g_divisors($n)) < 6); $ds = mlb_g_divisors($n);
            return mlb_typed('num', 'Work out $\\varphi(d)$ for every divisor $d$ of ' . $n . ', and add them up.', (string)$n,
                ['The divisors are ' . implode(', ', $ds) . ', and their $\\varphi$ values are ' . implode(', ', array_map('mlb_g_phi', $ds)) . '.', 'They add to ' . array_sum(array_map('mlb_g_phi', $ds)) . ' = ' . $n . ' — always $n$ (Gauss): sort the fractions $\\frac{1}{n}, \\dots, \\frac{n}{n}$ by their denominator in lowest terms.'],
                'Before adding, guess — the total is a famous number.', 'challenge', 120); },
    ],
    'MC-180' => [
        static function (MlbRng $r) { $N = $r->pick([15, 21, 24, 32, 33, 35, 39, 40, 45, 48, 55, 63, 64, 72, 75, 77, 80, 96, 99, 105, 120]); $sol = [];
            for ($y = 1; $y * $y < $N + 2 * $N; $y++) { $x2 = $N + $y * $y; $x = (int)round(sqrt($x2)); if ($x * $x === $x2) $sol[] = '(' . $x . ', ' . $y . ')'; }
            return mlb_typed('num', 'How many pairs of positive integers $(x, y)$ satisfy $x^2 - y^2 = ' . $N . '$?', (string)count($sol),
                ['Factorise: $(x - y)(x + y) = ' . $N . '$. Both factors are positive, $x - y < x + y$, and they have the SAME parity (their sum is $2x$).', 'Each such factor pair gives one solution: ' . ($sol ? implode(', ', $sol) : 'none') . '. That is ' . count($sol) . '.'],
                'Write $x^2 - y^2$ as a product.', 'procedure', 90); },
        static function (MlbRng $r) { do { $a = $r->int(1, 6); $b = $r->int(1, 6); $c = $r->int(10, 60); $K = $c + $a * $b; $cnt = 0; foreach (mlb_g_divisors($K) as $d) { $x = $d - $b; $y = intdiv($K, $d) - $a; if ($x > 0 && $y > 0) $cnt++; } } while ($cnt === 0);   // “none” is a trick answer, not an olympiad one
            return mlb_typed('num', 'How many pairs of positive integers $(x, y)$ satisfy $xy + ' . $a . 'x + ' . $b . 'y = ' . $c . '$?', (string)$cnt,
                ['Add ' . ($a * $b) . ' to both sides so the left factorises (“Simon’s trick”): $(x + ' . $b . ')(y + ' . $a . ') = ' . $K . '$.', 'Try each factor pair of ' . $K . ' with $x + ' . $b . ' > ' . $b . '$ and $y + ' . $a . ' > ' . $a . '$: ' . $cnt . ' solutions.'],
                'Add a constant to make it factorise.', 'challenge', 120); },
        static function (MlbRng $r) { $n = $r->int(2, 12); $cnt = count(mlb_g_divisors($n * $n));
            return mlb_typed('num', 'How many ordered pairs of positive integers $(x, y)$ satisfy $\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{' . $n . '}$?', (string)$cnt,
                ['Clear fractions: $' . $n . 'y + ' . $n . 'x = xy$, so $xy - ' . $n . 'x - ' . $n . 'y + ' . ($n * $n) . ' = ' . ($n * $n) . '$, i.e. $(x - ' . $n . ')(y - ' . $n . ') = ' . ($n * $n) . '$.', 'Both brackets are positive (each fraction is less than $\\frac{1}{' . $n . '}$), so there is one solution per divisor of ' . ($n * $n) . ': ' . $cnt . '.'],
                'Clear the fractions, then factorise.', 'challenge', 120); },
        static function (MlbRng $r) { $good = array_values(array_filter(range(10, 99), static fn($k) => $k % 4 === 2)); $N = $r->pick($good); $odd = 2 * $r->int(5, 49) + 1; $m4 = 4 * $r->int(3, 24);
            return mlb_mcq($r, 'Which of these can NOT be written as $x^2 - y^2$ with $x, y$ whole numbers?', (string)$N,
                [[(string)$odd, 'Every odd number works: $' . $odd . ' = ' . (intdiv($odd, 2) + 1) . '^2 - ' . intdiv($odd, 2) . '^2$.'], [(string)$m4, 'Every multiple of 4 works: $' . $m4 . ' = ' . (intdiv($m4, 4) + 1) . '^2 - ' . (intdiv($m4, 4) - 1) . '^2$.'], [(string)($odd + 2), 'Odd numbers always work: $(k + 1)^2 - k^2 = 2k + 1$.']],
                ['$x^2 - y^2 = (x - y)(x + y)$, and the two factors have the same parity.', 'Both odd gives an odd number; both even gives a multiple of 4. ' . $N . ' leaves remainder 2 when divided by 4, so it is neither.'],
                'Look at the remainders when divided by 4.', 'reasoning', 60); },
    ],
    ] + mlb_forms_gods_19() + mlb_forms_gods_20();
}

/** Distinct arrangements of a multiset with no two equal letters side by side (brute force, ≤ 7 letters). */
function mlb_g_noadj(array $cnt, string $last = '', int $left = -1): int {
    if ($left < 0) $left = array_sum($cnt);
    if ($left === 0) return 1;
    $t = 0;
    foreach ($cnt as $ch => $k) if ($k > 0 && (string)$ch !== $last) { $cnt[$ch]--; $t += mlb_g_noadj($cnt, (string)$ch, $left - 1); $cnt[$ch]++; }
    return $t;
}
/** Ways to climb n steps with the given step sizes. */
function mlb_g_climb(int $n, array $steps): int { $w = [1]; for ($i = 1; $i <= $n; $i++) { $w[$i] = 0; foreach ($steps as $s) if ($i - $s >= 0) $w[$i] += $w[$i - $s]; } return $w[$n]; }

function mlb_forms_gods_19(): array {
    return [
    /* ═══ Stage 19 — Counting like a God ═══ */
    'MC-181' => [
        static function (MlbRng $r) { $k = $r->int(3, 4); $cond = $r->pick(['all', 'even', 'odd']); $cnt = 0;
            for ($n = 10 ** ($k - 1); $n < 10 ** $k; $n++) { $s = (string)$n; if (count(array_unique(str_split($s))) !== $k) continue; if ($cond === 'even' && $n % 2) continue; if ($cond === 'odd' && $n % 2 === 0) continue; $cnt++; }
            $what = $cond === 'all' ? '' : ($cond === 'even' ? 'even ' : 'odd ');
            return mlb_typed('num', 'How many ' . $k . '-digit ' . $what . 'numbers have all their digits different?', (string)$cnt,
                [$cond === 'all' ? 'First digit: 9 choices (not 0). Each later digit: any digit not used yet.' : 'Fill the most restricted place first — the last digit (' . $cond . ') — and the first digit (not 0), then the rest.',
                 $cond === 'even' ? 'Split by the last digit: when it is 0 the first digit has 9 choices; when it is 2, 4, 6 or 8 the first digit has only 8 (not 0, not the last digit). Total: ' . $cnt . '.' : 'Multiply the choices, place by place: ' . $cnt . '.'],
                'Fill the most restricted place first.', $cond === 'even' ? 'challenge' : 'procedure', 75); },
        static function (MlbRng $r) { $d = $r->int(1, 9); $N = 100 * $r->int(2, 10); $cnt = 0; for ($n = 1; $n <= $N; $n++) if (strpos((string)$n, (string)$d) !== false) $cnt++;
            return mlb_typed('num', 'How many whole numbers from 1 to ' . mlb_p($N) . ' contain the digit ' . $d . ' at least once?', (string)$cnt,
                ['Count the complement: numbers with NO digit ' . $d . ' are easier (each place has one choice fewer).', 'There are ' . ($N - $cnt) . ' without a ' . $d . ', so $' . $N . ' - ' . ($N - $cnt) . ' = ' . $cnt . '$ contain one.'],
                '“At least once” — count the opposite.', 'challenge', 100); },
        static function (MlbRng $r) { $k = $r->int(2, 5); $cnt = 0; for ($n = 10 ** ($k - 1); $n < 10 ** $k; $n++) { $s = str_split((string)$n); $ok = true; for ($i = 1; $i < $k; $i++) if ($s[$i] <= $s[$i - 1]) $ok = false; if ($ok) $cnt++; }
            return mlb_typed('num', 'How many ' . $k . '-digit numbers have digits that strictly increase from left to right (like ' . implode('', range(1, $k)) . ')?', (string)$cnt,
                ['Zero cannot appear (it could only go first). Any choice of ' . $k . ' different digits from 1–9 can be written in increasing order in exactly ONE way.', 'So it is the number of ways to choose ' . $k . ' digits from 9: $\\binom{9}{' . $k . '} = ' . $cnt . '$.'],
                'Choosing the digits decides the number.', 'challenge', 75); },
        static function (MlbRng $r) { $s = $r->int(4, 10); $cnt = 0; for ($n = 1000; $n <= 9999; $n++) if (array_sum(str_split((string)$n)) === $s) $cnt++;
            return mlb_typed('num', 'How many 4-digit numbers have digits that add up to ' . $s . '?', (string)$cnt,
                ['Write the digits $a + b + c + d = ' . $s . '$ with $a \\ge 1$. Put $a\' = a - 1$: $a\' + b + c + d = ' . ($s - 1) . '$ with everything $\\ge 0$.', 'Stars and bars: $\\binom{' . ($s - 1) . ' + 3}{3} = ' . $cnt . '$' . ($s >= 10 ? ' — but no digit may exceed 9, so subtract the cases where one does' : '') . '.'],
                'Turn it into sharing ' . $s . ' sweets among 4 children.', 'challenge', 120); },
    ],
    'MC-182' => [
        static function (MlbRng $r) { $w = $r->pick(['BANANA', 'ABUJA', 'KADUNA', 'IBADAN', 'ENUGU', 'ONITSHA', 'OSOGBO', 'ILORIN', 'ASSESS', 'COMMITTEE', 'STATISTICS', 'MISSISSIPPI', 'NGOZI', 'OLUMIDE', 'ADAEZE']); $v = mlb_g_multiperm($w);
            $c = array_filter(count_chars($w, 1), static fn($k) => $k > 1);
            return mlb_typed('num', 'How many different arrangements are there of the letters of ' . $w . '?', (string)$v,
                [strlen($w) . ' letters would give $' . strlen($w) . '!$ arrangements if all were different.', $c ? 'Repeated letters (' . implode(', ', array_map(static fn($ch, $k) => chr($ch) . ' ×' . $k, array_keys($c), $c)) . ') can swap without changing anything, so divide: $\\frac{' . strlen($w) . '!}{' . implode(' ', array_map(static fn($k) => $k . '!', $c)) . '} = ' . mlb_n($v) . '$.' : 'All letters differ: $' . strlen($w) . '! = ' . mlb_n($v) . '$.'],
                'Divide by the swaps that change nothing.', 'procedure', 60); },
        static function (MlbRng $r) { $n = $r->int(4, 8); $together = $r->int(0, 1) === 1; $t = 2 * mlb_fact($n - 1); $v = $together ? $t : mlb_fact($n) - $t; $a = $r->pick(MLB_NAMES); $b = $a === 'Ada' ? 'Bola' : 'Ada';
            return mlb_typed('num', $n . ' friends, including ' . $a . ' and ' . $b . ', sit in a row. In how many orders can they sit if ' . $a . ' and ' . $b . ' must ' . ($together ? '' : 'NOT ') . 'sit together?', (string)$v,
                ['Glue ' . $a . ' and ' . $b . ' into one block: $' . ($n - 1) . '$ things to order, $' . ($n - 1) . '!$ ways, times 2 for the order inside the block: $' . $t . '$.', $together ? 'So ' . $t . '.' : 'All orders: $' . $n . '! = ' . mlb_fact($n) . '$. Subtract those where they ARE together: $' . mlb_fact($n) . ' - ' . $t . ' = ' . $v . '$.'],
                $together ? 'Treat the pair as one person.' : 'Count the opposite and subtract.', 'procedure', 70); },
        static function (MlbRng $r) { $n = $r->int(4, 9); $apart = $r->int(0, 1) === 1; $all = mlb_fact($n - 1); $tog = 2 * mlb_fact($n - 2); $v = $apart ? $all - $tog : $all;
            return mlb_typed('num', $n . ' people sit round a circular table. Seatings that are rotations of each other count as the same. How many seatings are there' . ($apart ? ' in which two particular people do NOT sit next to each other' : '') . '?', (string)$v,
                ['Fix one person’s seat to remove the rotations: the others can be arranged in $' . ($n - 1) . '! = ' . $all . '$ ways.', $apart ? 'With the two glued together there are $' . ($n - 2) . '! \\times 2 = ' . $tog . '$ seatings, so $' . $all . ' - ' . $tog . ' = ' . $v . '$ keep them apart.' : 'So there are ' . $all . '.'],
                'Fix one person, then arrange the rest in a line.', $apart ? 'challenge' : 'procedure', 75); },
        static function (MlbRng $r) { $w = $r->pick(['AABBC', 'AABBCC', 'AAABC', 'AABCD', 'AAABBC', 'AABBCD', 'AAABBB']); $v = mlb_g_noadj(count_chars($w, 1));
            return mlb_typed('num', 'How many arrangements of the letters ' . $w . ' have no two identical letters next to each other?', (string)$v,
                ['Count all arrangements, then subtract those with a pair together (inclusion–exclusion), or build the word letter by letter never repeating the last letter.', 'Either way: ' . $v . ' arrangements.'],
                'Glue each pair to count the bad arrangements — and add back the ones you subtracted twice.', 'challenge', 150); },
    ],
    'MC-183' => [
        static function (MlbRng $r) { $n = $r->int(5, 15); $k = $r->int(3, 5); $v = mlb_ncr($n + $k - 1, $k - 1);
            return mlb_typed('num', 'How many solutions in whole numbers (0 allowed) does $' . implode(' + ', array_map(static fn($i) => 'x_' . $i, range(1, $k))) . ' = ' . $n . '$ have?', (string)$v,
                ['Stars and bars: ' . $n . ' stars and ' . ($k - 1) . ' bars in a row; the bars split the stars into ' . $k . ' groups.', 'Choose the bar positions among $' . ($n + $k - 1) . '$ places: $\\binom{' . ($n + $k - 1) . '}{' . ($k - 1) . '} = ' . $v . '$.'], '$n$ stars, $k - 1$ bars.', 'procedure', 60); },
        static function (MlbRng $r) { $n = $r->int(6, 16); $k = $r->int(3, 5); $v = mlb_ncr($n - 1, $k - 1);
            return mlb_typed('num', 'How many solutions in POSITIVE whole numbers does $' . implode(' + ', array_map(static fn($i) => 'x_' . $i, range(1, $k))) . ' = ' . $n . '$ have?', (string)$v,
                ['Line up ' . $n . ' stars; there are ' . ($n - 1) . ' gaps between them. Each group must be non-empty, so put ' . ($k - 1) . ' bars in different gaps.', '$\\binom{' . ($n - 1) . '}{' . ($k - 1) . '} = ' . $v . '$.'], 'Bars go in the gaps between stars.', 'procedure', 60); },
        static function (MlbRng $r) { $k = $r->int(3, 5); $m = $r->int(1, 3); $n = $k * $m + $r->int(2, 10); $v = mlb_ncr($n - $k * $m + $k - 1, $k - 1);
            return mlb_typed('num', $n . ' identical sweets are shared among ' . $k . ' children so that each gets at least ' . $m . '. In how many ways?', (string)$v,
                ['Give each child ' . $m . ' first: $' . ($k * $m) . '$ sweets used, ' . ($n - $k * $m) . ' left to share freely.', 'Stars and bars: $\\binom{' . ($n - $k * $m) . ' + ' . ($k - 1) . '}{' . ($k - 1) . '} = ' . $v . '$.'], 'Hand out the minimum first.', 'application', 75, ['unit' => 'ways']); },
        static function (MlbRng $r) { $c = $r->int(3, 6); $n = $r->int($c + 1, 3 * $c - 1); $cnt = 0; for ($x = 0; $x <= $c; $x++) for ($y = 0; $y <= $c; $y++) { $z = $n - $x - $y; if ($z >= 0 && $z <= $c) $cnt++; }
            return mlb_typed('num', 'How many solutions in whole numbers does $x + y + z = ' . $n . '$ have, if each of $x, y, z$ is at most ' . $c . '?', (string)$cnt,
                ['Without the cap: $\\binom{' . ($n + 2) . '}{2}$. Then remove the solutions where some variable is ' . ($c + 1) . ' or more (inclusion–exclusion).', 'The answer is ' . $cnt . '.'],
                'Count with no cap, then subtract the solutions that break it.', 'challenge', 120); },
    ],
    'MC-184' => [
        static function (MlbRng $r) { do { $a = $r->int(2, 9); $b = $r->int(3, 13); } while ($a === $b || $b % $a === 0 || $a % $b === 0); $N = $r->int(50, 500); $cnt = 0; for ($n = 1; $n <= $N; $n++) if ($n % $a === 0 || $n % $b === 0) $cnt++; $L = mlb_lcm($a, $b);
            return mlb_typed('num', 'How many whole numbers from 1 to ' . $N . ' are divisible by ' . $a . ' or by ' . $b . ' (or both)?', (string)$cnt,
                ['$\\lfloor \\frac{' . $N . '}{' . $a . '} \\rfloor + \\lfloor \\frac{' . $N . '}{' . $b . '} \\rfloor - \\lfloor \\frac{' . $N . '}{' . $L . '} \\rfloor$: multiples of both (of ' . $L . ') were counted twice.', '$' . intdiv($N, $a) . ' + ' . intdiv($N, $b) . ' - ' . intdiv($N, $L) . ' = ' . $cnt . '$.'],
                'Add the two counts, then take off the overlap.', 'procedure', 60); },
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[2, 3, 5], [2, 3, 7], [3, 5, 7], [2, 5, 7]]); $N = $r->int(60, 420); $cnt = 0; for ($n = 1; $n <= $N; $n++) if ($n % $a && $n % $b && $n % $c) $cnt++;
            return mlb_typed('num', 'How many whole numbers from 1 to ' . $N . ' are divisible by NONE of ' . $a . ', ' . $b . ' and ' . $c . '?', (string)$cnt,
                ['Inclusion–exclusion: subtract the multiples of each, add back the multiples of each pair, subtract the multiples of all three.', '$' . $N . ' - (' . intdiv($N, $a) . ' + ' . intdiv($N, $b) . ' + ' . intdiv($N, $c) . ') + (' . intdiv($N, $a * $b) . ' + ' . intdiv($N, $a * $c) . ' + ' . intdiv($N, $b * $c) . ') - ' . intdiv($N, $a * $b * $c) . ' = ' . $cnt . '$.'],
                'Subtract, add back, subtract again.', 'challenge', 100); },
        static function (MlbRng $r) { $n = $r->int(4, 7); $D = [1, 0]; for ($i = 2; $i <= $n; $i++) $D[$i] = ($i - 1) * ($D[$i - 1] + $D[$i - 2]);
            return mlb_typed('num', $n . ' letters are put into ' . $n . ' addressed envelopes at random. In how many ways can it happen that NO letter is in its own envelope?', (string)$D[$n],
                ['These are derangements: $D_n = n!\\left(1 - \\frac{1}{1!} + \\frac{1}{2!} - \\dots \\pm \\frac{1}{n!}\\right)$, or $D_n = (n - 1)(D_{n-1} + D_{n-2})$.', '$D_1 = 0$, $D_2 = 1$, $D_3 = 2$, $D_4 = 9$, …, $D_{' . $n . '} = ' . $D[$n] . '$.'],
                'Inclusion–exclusion on “letter $i$ is in its own envelope”.', 'challenge', 120); },
        static function (MlbRng $r) { $g = ['abc' => $r->int(1, 6), 'ab' => $r->int(1, 8), 'ac' => $r->int(1, 8), 'bc' => $r->int(1, 8), 'a' => $r->int(2, 15), 'b' => $r->int(2, 15), 'c' => $r->int(2, 15), 'none' => $r->int(0, 12)];
            $A = $g['a'] + $g['ab'] + $g['ac'] + $g['abc']; $B = $g['b'] + $g['ab'] + $g['bc'] + $g['abc']; $C = $g['c'] + $g['ac'] + $g['bc'] + $g['abc'];
            $AB = $g['ab'] + $g['abc']; $AC = $g['ac'] + $g['abc']; $BC = $g['bc'] + $g['abc']; $T = array_sum($g); $U = $A + $B + $C - $AB - $AC - $BC + $g['abc'];
            return mlb_typed('num', 'In a class of ' . $T . ', ' . $A . ' play football, ' . $B . ' play basketball and ' . $C . ' play chess. ' . $AB . ' play football and basketball, ' . $AC . ' football and chess, ' . $BC . ' basketball and chess, and ' . $g['abc'] . ' play all three. How many play none of the three?', (string)$g['none'],
                ['At least one: $' . $A . ' + ' . $B . ' + ' . $C . ' - ' . $AB . ' - ' . $AC . ' - ' . $BC . ' + ' . $g['abc'] . ' = ' . $U . '$.', 'None: $' . $T . ' - ' . $U . ' = ' . $g['none'] . '$.'],
                'Inclusion–exclusion for three sets.', 'application', 100); },
    ],
    'MC-185' => [
        static function (MlbRng $r) { $k = $r->int(3, 7); $m = $r->int(2, 5); $v = $k * ($m - 1) + 1;
            return mlb_typed('num', 'A drawer holds socks of ' . $k . ' colours, many of each. In the dark, how many socks must you take to be SURE of ' . $m . ' of the same colour?', (string)$v,
                ['Worst case: you draw ' . ($m - 1) . ' of every colour, $' . $k . ' \\times ' . ($m - 1) . ' = ' . ($k * ($m - 1)) . '$ socks, with no colour reaching ' . $m . '.', 'The next sock must make ' . $m . ' of some colour: ' . $v . '.'],
                'Imagine being as unlucky as possible.', 'procedure', 50); },
        static function (MlbRng $r) { $n = $r->int(5, 30);
            return mlb_typed('num', 'What is the smallest number of whole numbers you must choose from 1 to ' . (2 * $n) . ' to be sure that two of them add up to ' . (2 * $n + 1) . '?', (string)($n + 1),
                ['Pair the numbers: $(1, ' . (2 * $n) . '), (2, ' . (2 * $n - 1) . '), \\dots, (' . $n . ', ' . ($n + 1) . ')$ — ' . $n . ' pairs, each adding to ' . (2 * $n + 1) . '.', 'Choosing ' . $n . ' could take one from each pair; with ' . ($n + 1) . ' two must come from the same pair (pigeonhole).'],
                'Make pigeonholes out of pairs.', 'challenge', 75); },
        static function (MlbRng $r) { $m = $r->int(3, 12);
            return mlb_mcq($r, 'Why must any ' . ($m + 1) . ' whole numbers include two whose difference is divisible by ' . $m . '?', 'Only ' . $m . ' remainders are possible when dividing by ' . $m . ', so two of the numbers share one',
                [['Because ' . ($m + 1) . ' numbers are more than ' . $m . ', and more numbers always means a repeat', 'True, but the reason needs what the boxes are: the remainders.'], ['Because one of them must be a multiple of ' . $m . ', and that one makes the difference', 'False: $1, 2, \\dots, ' . ($m - 1) . '$ plus $' . ($m + 1) . '$ contains no multiple of ' . $m . '.'], ['It is not always true: the numbers could all be far apart from each other', 'It is: two numbers with the same remainder differ by a multiple of ' . $m . '.']],
                ['Put each number in a box labelled by its remainder: $0, 1, \\dots, ' . ($m - 1) . '$ — ' . $m . ' boxes.', ($m + 1) . ' numbers in ' . $m . ' boxes: two share a box, and their difference is a multiple of ' . $m . '.'],
                'What are the pigeonholes?', 'reasoning', 50); },
        static function (MlbRng $r) { $n = $r->int(5, 25);
            return mlb_typed('num', 'What is the smallest number of whole numbers you must choose from 1 to ' . (2 * $n) . ' to be sure that one of them divides another?', (string)($n + 1),
                ['Write each number as $2^k \\times$ (odd). There are ' . $n . ' odd parts available: $1, 3, \\dots, ' . (2 * $n - 1) . '$.', 'With ' . ($n + 1) . ' numbers, two share an odd part, and the smaller then divides the larger. And ' . $n . ' are not enough: ' . ($n + 1) . ', …, ' . (2 * $n) . ' never divide each other.'],
                'Split every number into a power of 2 times an odd number.', 'challenge', 120); },
    ],
    'MC-186' => [
        static function (MlbRng $r) { $n = $r->int(4, 8); $k = $r->int(1, $n - 1); $a = $r->int(1, 3); $b = $r->nz(-3, 3); $v = mlb_ncr($n, $k) * $a ** $k * $b ** ($n - $k);
            return mlb_typed('num', 'What is the coefficient of $x^{' . $k . '}$ in $(' . mlb_lterm($a, 'x') . mlb_sterm($b) . ')^{' . $n . '}$?', (string)$v,
                ['The term with $x^{' . $k . '}$ is $\\binom{' . $n . '}{' . $k . '}(' . mlb_lterm($a, 'x') . ')^{' . $k . '}(' . $b . ')^{' . ($n - $k) . '}$.', '$' . mlb_ncr($n, $k) . ' \\times ' . ($a ** $k) . ' \\times ' . ($b ** ($n - $k) < 0 ? '(' . ($b ** ($n - $k)) . ')' : $b ** ($n - $k)) . ' = ' . mlb_n($v) . '$.'],
                'Pick $x$ from ' . $k . ' brackets and the number from the rest.', 'procedure', 75); },
        static function (MlbRng $r) { $m = $r->int(1, 4); $n = 2 * $m; $a = $r->int(1, 3); $v = mlb_ncr($n, $m) * $a ** $m;
            return mlb_typed('num', 'What is the term independent of $x$ in $\\left(x + \\frac{' . $a . '}{x}\\right)^{' . $n . '}$?', (string)$v,
                ['A term is $\\binom{' . $n . '}{k}x^{' . $n . ' - k}\\left(\\frac{' . $a . '}{x}\\right)^k = \\binom{' . $n . '}{k}' . $a . '^k x^{' . $n . ' - 2k}$.', 'No $x$ when $k = ' . $m . '$: $\\binom{' . $n . '}{' . $m . '} \\times ' . $a . '^{' . $m . '} = ' . $v . '$.'],
                'When does the power of $x$ cancel?', 'procedure', 75); },
        static function (MlbRng $r) { $n = $r->int(4, 12); $v = 2 ** ($n - 1); $terms = []; for ($k = 0; $k <= $n; $k += 2) $terms[] = '\\binom{' . $n . '}{' . $k . '}';
            return mlb_typed('num', 'Work out $' . implode(' + ', $terms) . '$.', (string)$v,
                ['$(1 + 1)^{' . $n . '}$ adds ALL the coefficients: $2^{' . $n . '}$. $(1 - 1)^{' . $n . '} = 0$ adds the even ones and subtracts the odd ones.', 'Add the two: twice the even ones is $2^{' . $n . '}$, so they total $2^{' . ($n - 1) . '} = ' . $v . '$.'],
                'Put $x = 1$ and $x = -1$ into $(1 + x)^{' . $n . '}$.', 'challenge', 90); },
        static function (MlbRng $r) { $k = $r->int(2, 4); $n = $r->int($k + 3, $k + 9); $terms = []; $s = 0; for ($i = $k; $i <= $n; $i++) { $s += mlb_ncr($i, $k); if ($i < $k + 3 || $i === $n) $terms[] = '\\binom{' . $i . '}{' . $k . '}'; }
            return mlb_typed('num', 'Work out $\\binom{' . $k . '}{' . $k . '} + \\binom{' . ($k + 1) . '}{' . $k . '} + \\dots + \\binom{' . $n . '}{' . $k . '}$.', (string)$s,
                ['The hockey-stick identity: $\\sum_{i=' . $k . '}^{' . $n . '} \\binom{i}{' . $k . '} = \\binom{' . ($n + 1) . '}{' . ($k + 1) . '}$ — choose ' . ($k + 1) . ' from ' . ($n + 1) . ' by deciding the largest one first.', '$\\binom{' . ($n + 1) . '}{' . ($k + 1) . '} = ' . $s . '$.'],
                'Sort the choices by their largest element.', 'challenge', 100); },
    ],
    'MC-187' => [
        static function (MlbRng $r) { $m = $r->int(2, 7); $n = $r->int(2, 7); $v = mlb_ncr($m + $n, $m);
            return mlb_typed('num', 'On a grid, you move from $(0, 0)$ to $(' . $m . ', ' . $n . ')$, one unit right or one unit up at a time. How many different routes are there?', (string)$v,
                ['Every route is ' . ($m + $n) . ' moves: ' . $m . ' rights and ' . $n . ' ups, in some order.', 'Choose which ' . $m . ' of the ' . ($m + $n) . ' moves are rights: $\\binom{' . ($m + $n) . '}{' . $m . '} = ' . $v . '$.'], 'A route is a word made of R and U.', 'procedure', 50); },
        static function (MlbRng $r) { $m = $r->int(3, 7); $n = $r->int(3, 7); $p = $r->int(1, $m - 1); $q = $r->int(1, $n - 1); $through = mlb_ncr($p + $q, $p) * mlb_ncr($m - $p + $n - $q, $m - $p); $avoid = $r->int(0, 1) === 1; $all = mlb_ncr($m + $n, $m);
            return mlb_typed('num', 'Moving one unit right or up at a time from $(0, 0)$ to $(' . $m . ', ' . $n . ')$, how many routes ' . ($avoid ? 'AVOID' : 'pass through') . ' the point $(' . $p . ', ' . $q . ')$?', (string)($avoid ? $all - $through : $through),
                ['Routes through it: to it, $\\binom{' . ($p + $q) . '}{' . $p . '}$, times from it, $\\binom{' . ($m - $p + $n - $q) . '}{' . ($m - $p) . '}$: $' . $through . '$.', $avoid ? 'All routes: $\\binom{' . ($m + $n) . '}{' . $m . '} = ' . $all . '$; avoiding it: $' . $all . ' - ' . $through . ' = ' . ($all - $through) . '$.' : 'So ' . $through . '.'],
                'Split the journey at the point.', $avoid ? 'challenge' : 'procedure', 80); },
        static function (MlbRng $r) { $n = $r->int(3, 8); $C = intdiv(mlb_ncr(2 * $n, $n), $n + 1);
            return mlb_typed('num', 'Moving one unit right or up from $(0, 0)$ to $(' . $n . ', ' . $n . ')$, how many routes never go ABOVE the diagonal $y = x$?', (string)$C,
                ['These are counted by the Catalan number $C_n = \\frac{1}{n + 1}\\binom{2n}{n}$ (reflection: each bad route reflects to a route ending at $(' . ($n - 1) . ', ' . ($n + 1) . ')$).', '$\\frac{1}{' . ($n + 1) . '}\\binom{' . (2 * $n) . '}{' . $n . '} = \\frac{' . mlb_ncr(2 * $n, $n) . '}{' . ($n + 1) . '} = ' . $C . '$.'],
                'Subtract the bad routes, counted by reflecting them.', 'challenge', 120); },
        static function (MlbRng $r) { $n = $r->int(2, 7); $C = intdiv(mlb_ncr(2 * $n, $n), $n + 1);
            return mlb_typed('num', 'In how many ways can ' . $n . ' pairs of brackets be written so that they match correctly (like (()) and ()() for 2 pairs)?', (string)$C,
                ['Read “(” as a step right and “)” as a step up: a correct string is a route that never goes above the diagonal.', 'So it is the Catalan number $C_{' . $n . '} = \\frac{1}{' . ($n + 1) . '}\\binom{' . (2 * $n) . '}{' . $n . '} = ' . $C . '$.'],
                'Turn brackets into a walk on a grid.', 'challenge', 90); },
    ],
    'MC-188' => [
        static function (MlbRng $r) { $n = $r->int(5, 15); $v = mlb_g_climb($n, [1, 2]);
            return mlb_typed('num', 'You climb a staircase of ' . $n . ' steps, taking 1 or 2 steps at a time. In how many ways can you reach the top?', (string)$v,
                ['Your last move was 1 step (from step ' . ($n - 1) . ') or 2 steps (from step ' . ($n - 2) . '), so $W_n = W_{n-1} + W_{n-2}$.', 'Start $W_1 = 1$, $W_2 = 2$ and build up — the Fibonacci numbers: $W_{' . $n . '} = ' . $v . '$.'],
                'Think about the LAST move.', 'procedure', 75); },
        static function (MlbRng $r) { $n = $r->int(4, 14); $a = [1 => 2, 2 => 3]; for ($i = 3; $i <= $n; $i++) $a[$i] = $a[$i - 1] + $a[$i - 2];
            return mlb_typed('num', 'How many strings of ' . $n . ' digits, each 0 or 1, have no two 1s next to each other?', (string)$a[$n],
                ['If the string ends in 0, the rest is any good string of length ' . ($n - 1) . '; if it ends in 1, the digit before is 0 and the rest is good of length ' . ($n - 2) . '.', 'So $a_n = a_{n-1} + a_{n-2}$ with $a_1 = 2$, $a_2 = 3$: $a_{' . $n . '} = ' . $a[$n] . '$.'],
                'Split by the last digit.', 'challenge', 90); },
        static function (MlbRng $r) { $n = $r->int(4, 12); $v = mlb_g_climb($n, [1, 2, 3]);
            return mlb_typed('num', 'A staircase has ' . $n . ' steps. You may climb 1, 2 or 3 steps at a time. In how many ways can you reach the top?', (string)$v,
                ['The last move was 1, 2 or 3 steps: $W_n = W_{n-1} + W_{n-2} + W_{n-3}$, with $W_0 = 1$.', 'Build up: 1, 1, 2, 4, 7, 13, … so $W_{' . $n . '} = ' . $v . '$.'], 'Last move: 1, 2 or 3.', 'challenge', 90); },
        static function (MlbRng $r) { [$S, $rec] = $r->pick([[[1, 2], 'a_n = a_{n-1} + a_{n-2}'], [[1, 3], 'a_n = a_{n-1} + a_{n-3}'], [[2, 3], 'a_n = a_{n-2} + a_{n-3}'], [[1, 2, 3], 'a_n = a_{n-1} + a_{n-2} + a_{n-3}']]);
            $all = ['a_n = a_{n-1} + a_{n-2}', 'a_n = a_{n-1} + a_{n-3}', 'a_n = a_{n-2} + a_{n-3}', 'a_n = a_{n-1} + a_{n-2} + a_{n-3}', 'a_n = 2a_{n-1}'];
            $wrong = []; foreach ($all as $w) if ($w !== $rec && count($wrong) < 3) $wrong[] = ['$' . $w . '$', 'The terms on the right must match the possible LAST moves: ' . implode(' or ', $S) . ' steps.'];
            return mlb_mcq($r, 'Let $a_n$ be the number of ways to climb $n$ steps taking ' . implode(' or ', $S) . ' steps at a time. Which recurrence does $a_n$ satisfy?', '$' . $rec . '$', $wrong,
                ['Sort the climbs by their last move.', 'A last move of $s$ steps leaves $a_{n-s}$ ways to have got there, so $' . $rec . '$.'], 'One term per possible last move.', 'reasoning', 50); },
    ],
    'MC-189' => [
        static function (MlbRng $r) { $t = $r->int(3, 5); $k = 100 * $r->int(1, 5); $sum = 0; for ($f = $t; $f <= 6; $f++) $sum += $k * $f;
            return mlb_typed('num', 'A fair die is rolled. If it shows ' . $t . ' or more you win ₦' . $k . ' times the number shown; otherwise you win nothing. What is the expected (average) win, in naira?', mlb_dec($sum / 6),
                ['Expected value = (sum of each outcome × its probability). Each face has probability $\\frac{1}{6}$.', '$\\frac{1}{6}(' . implode(' + ', array_map(static fn($f) => $k * $f, range($t, 6))) . ') = \\frac{' . $sum . '}{6} = ' . mlb_dec($sum / 6) . '$.'],
                'Average over the six equally likely faces.', 'procedure', 60, ['unit' => '₦']); },
        static function (MlbRng $r) { $k = $r->int(2, 9);
            return mlb_typed('num', 'What is the expected total when ' . $k . ' fair dice are rolled?', mlb_dec(3.5 * $k),
                ['One die: $\\frac{1 + 2 + \\dots + 6}{6} = 3.5$.', 'Expectation ADDS (linearity), even though the dice are summed: $' . $k . ' \\times 3.5 = ' . mlb_dec(3.5 * $k) . '$.'], 'Find one die’s average first.', 'procedure', 40); },
        static function (MlbRng $r) { $n = $r->int(4, 30);
            return mlb_mcq($r, $n . ' letters are put into their ' . $n . ' addressed envelopes completely at random. On average, how many letters land in their own envelope?', '1',
                [['$\\frac{1}{' . $n . '}$', 'That is the chance for ONE letter; add it up over all ' . $n . ' letters.'], [(string)intdiv($n, 2), 'Half of them would be wildly lucky — each letter has only a $\\frac{1}{' . $n . '}$ chance.'], ['0', 'Usually few, but the average is not 0: sometimes letters do land right.']],
                ['Each letter is in its own envelope with probability $\\frac{1}{' . $n . '}$.', 'Linearity of expectation: add the ' . $n . ' chances, $' . $n . ' \\times \\frac{1}{' . $n . '} = 1$ — whatever $n$ is.'], 'Add up each letter’s own chance.', 'challenge', 60); },
        static function (MlbRng $r) { $red = $r->int(2, 9); $blue = $r->int(2, 9); $k = $r->int(2, min(6, $red + $blue - 1));
            return mlb_typed('frac', 'A bag holds ' . $red . ' red and ' . $blue . ' blue balls. You take ' . $k . ' without looking (and without putting any back). What is the expected number of red balls? Give a fraction.', mlb_frac($k * $red, $red + $blue),
                ['Each of the ' . $k . ' draws, on its own, is red with probability $\\frac{' . $red . '}{' . ($red + $blue) . '}$ (every ball is equally likely to be in any position).', 'Linearity of expectation: $' . $k . ' \\times \\frac{' . $red . '}{' . ($red + $blue) . '} = ' . mlb_ftex($k * $red, $red + $blue) . '$ — no tree diagram needed.'],
                'Expected values add, even when the draws depend on each other.', 'challenge', 90); },
    ],
    'MC-190' => [
        static function (MlbRng $r) { $n = 2 * $r->int(2, 5);
            return mlb_mcq($r, 'Two opposite corner squares are cut from an ' . $n . ' × ' . $n . ' chessboard. Can the remaining ' . ($n * $n - 2) . ' squares be covered exactly by dominoes (each covering two side-by-side squares)?', 'No — the two removed squares are the same colour, so the colours no longer balance',
                [['Yes — ' . ($n * $n - 2) . ' is even, so exactly ' . intdiv($n * $n - 2, 2) . ' dominoes fit and cover every square', 'An even number of squares is necessary but not enough.'], ['Yes — lay them in rows, turning one domino on its side at each end', 'Try it: two squares of one colour are always left over.'], ['Only if ' . $n . ' is a multiple of 4, so that the rows and columns pair up evenly', 'The board size does not help: the colour count is wrong for every even size.']],
                ['Every domino covers one black and one white square.', 'Opposite corners have the same colour, so after removing them one colour has 2 more squares than the other — no tiling can exist.'],
                'Colour the board like a chessboard.', 'reasoning', 60); },
        static function (MlbRng $r) { do { $n = $r->int(5, 20); $k = $r->int(2, min(8, $n - 1)); } while (($n * $k) % 2);
            return mlb_typed('num', 'In a group of ' . $n . ' people, each shakes hands with exactly ' . $k . ' of the others. How many handshakes take place?', (string)intdiv($n * $k, 2),
                ['Adding everybody’s count gives $' . $n . ' \\times ' . $k . ' = ' . ($n * $k) . '$.', 'But every handshake was counted twice — once by each person — so there are $' . ($n * $k) . ' \\div 2 = ' . intdiv($n * $k, 2) . '$.'], 'Each handshake involves two people.', 'procedure', 45); },
        static function (MlbRng $r) { $n = $r->int(5, 40); $S = intdiv($n * ($n + 1), 2); $odd = $S % 2 === 1;
            return mlb_mcq($r, 'The numbers $1, 2, \\dots, ' . $n . '$ are on a board. Repeatedly, two numbers are rubbed out and their difference (larger minus smaller) is written instead, until one number is left. What can you say about it?', 'It must be ' . ($odd ? 'odd' : 'even'),
                [['It must be ' . ($odd ? 'even' : 'odd'), 'Find what never changes: the parity of the total.'], ['It can be odd or even, depending on the moves', 'Every move keeps the total’s parity, so the ending is forced.'], ['It must be 0', 'Not necessarily — only its parity is forced.']],
                ['Replacing $a, b$ by $a - b$ changes the total by $2b$ — an even amount — so the parity of the total never changes.', 'At the start the total is $\\frac{' . $n . ' \\times ' . ($n + 1) . '}{2} = ' . $S . '$, which is ' . ($odd ? 'odd' : 'even') . ', so the last number is ' . ($odd ? 'odd' : 'even') . '.'],
                'Look for something that every move leaves unchanged.', 'challenge', 75); },
        static function (MlbRng $r) { $n = $r->int(3, 8);
            return mlb_typed('num', 'The numbers $1, 2, \\dots, ' . $n . '$ are on a board. Repeatedly, two numbers $a$ and $b$ are rubbed out and replaced by $a + b + ab$. What is the last number left?', (string)(mlb_fact($n + 1) - 1),
                ['$a + b + ab = (1 + a)(1 + b) - 1$. So the product of all the $(1 + x)$ on the board never changes — an invariant.', 'At the start it is $2 \\times 3 \\times \\dots \\times ' . ($n + 1) . ' = ' . ($n + 1) . '!$; at the end it is $1 + $ (last number). So the last number is $' . ($n + 1) . '! - 1 = ' . (mlb_fact($n + 1) - 1) . '$.'],
                'Add 1 to $a + b + ab$ and factorise.', 'challenge', 120); },
    ],
    ];
}

function mlb_forms_gods_20(): array {
    return [
    /* ═══ Stage 20 — The Summit: Algebra, Inequalities and Geometry ═══ */
    'MC-191' => [
        static function (MlbRng $r) { $p = $r->nz(-9, 9); $q = $r->nz(-12, 12);
            return mlb_typed('num', '$\\alpha$ and $\\beta$ are the roots of $x^2' . mlb_sterm($p, 'x') . mlb_sterm($q) . ' = 0$. Find $\\alpha^2 + \\beta^2$ WITHOUT solving the equation.', (string)($p * $p - 2 * $q),
                ['Vieta: $\\alpha + \\beta = ' . (-$p) . '$ and $\\alpha\\beta = ' . $q . '$.', '$\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = ' . ($p * $p) . ' - ' . (2 * $q < 0 ? '(' . (2 * $q) . ')' : 2 * $q) . ' = ' . ($p * $p - 2 * $q) . '$.'],
                'Write it using $\\alpha + \\beta$ and $\\alpha\\beta$.', 'procedure', 60); },
        static function (MlbRng $r) { $p = $r->nz(-9, 9); $q = $r->nz(-12, 12);
            return mlb_typed('frac', '$\\alpha$ and $\\beta$ are the roots of $x^2' . mlb_sterm($p, 'x') . mlb_sterm($q) . ' = 0$. Find $\\frac{1}{\\alpha} + \\frac{1}{\\beta}$ as a fraction.', mlb_frac(-$p, $q),
                ['$\\frac{1}{\\alpha} + \\frac{1}{\\beta} = \\frac{\\alpha + \\beta}{\\alpha\\beta}$.', 'Vieta: $= \\frac{' . (-$p) . '}{' . $q . '} = ' . mlb_ftex(-$p, $q) . '$.'], 'Add the fractions first.', 'procedure', 60); },
        static function (MlbRng $r) { $a = $r->nz(-6, 6); $b = $r->nz(-9, 9); $c = $r->nz(-9, 9);
            return mlb_typed('num', '$\\alpha, \\beta, \\gamma$ are the roots of $x^3' . mlb_sterm($a, 'x^2') . mlb_sterm($b, 'x') . mlb_sterm($c) . ' = 0$. Find $\\alpha^2 + \\beta^2 + \\gamma^2$.', (string)($a * $a - 2 * $b),
                ['Vieta for a cubic: $\\alpha + \\beta + \\gamma = ' . (-$a) . '$ and $\\alpha\\beta + \\beta\\gamma + \\gamma\\alpha = ' . $b . '$.', '$\\alpha^2 + \\beta^2 + \\gamma^2 = (\\alpha + \\beta + \\gamma)^2 - 2(\\alpha\\beta + \\beta\\gamma + \\gamma\\alpha) = ' . ($a * $a) . ' - ' . (2 * $b < 0 ? '(' . (2 * $b) . ')' : 2 * $b) . ' = ' . ($a * $a - 2 * $b) . '$.'],
                'Square the sum of the roots.', 'challenge', 75); },
        static function (MlbRng $r) { $p = $r->nz(-6, 6); $q = $r->nz(-9, 9); $S = -$p; $v = $S ** 3 - 3 * $q * $S;
            return mlb_typed('num', '$\\alpha$ and $\\beta$ are the roots of $x^2' . mlb_sterm($p, 'x') . mlb_sterm($q) . ' = 0$. Find $\\alpha^3 + \\beta^3$.', (string)$v,
                ['$\\alpha^3 + \\beta^3 = (\\alpha + \\beta)^3 - 3\\alpha\\beta(\\alpha + \\beta)$.', 'With $\\alpha + \\beta = ' . $S . '$ and $\\alpha\\beta = ' . $q . '$: $' . ($S ** 3) . ' - 3 \\times ' . ($q < 0 ? '(' . $q . ')' : $q) . ' \\times ' . ($S < 0 ? '(' . $S . ')' : $S) . ' = ' . $v . '$.'],
                'Expand $(\\alpha + \\beta)^3$ and see what is left over.', 'challenge', 90); },
    ],
    'MC-192' => [
        static function (MlbRng $r) { $n = $r->int(5, 99);
            return mlb_typed('frac', 'Work out $\\frac{1}{1 \\times 2} + \\frac{1}{2 \\times 3} + \\dots + \\frac{1}{' . $n . ' \\times ' . ($n + 1) . '}$.', mlb_frac($n, $n + 1),
                ['$\\frac{1}{k(k + 1)} = \\frac{1}{k} - \\frac{1}{k + 1}$.', 'The sum telescopes: $\\left(1 - \\frac{1}{2}\\right) + \\left(\\frac{1}{2} - \\frac{1}{3}\\right) + \\dots = 1 - \\frac{1}{' . ($n + 1) . '} = ' . mlb_ftex($n, $n + 1) . '$.'],
                'Split each fraction into a difference of two.', 'procedure', 75); },
        static function (MlbRng $r) { $n = $r->int(4, 60);
            return mlb_typed('frac', 'Work out $\\left(1 - \\frac{1}{2^2}\\right)\\left(1 - \\frac{1}{3^2}\\right)\\cdots\\left(1 - \\frac{1}{' . $n . '^2}\\right)$.', mlb_frac($n + 1, 2 * $n),
                ['$1 - \\frac{1}{k^2} = \\frac{(k - 1)(k + 1)}{k \\times k}$.', 'Write all the factors out: nearly everything cancels, leaving $\\frac{1}{2} \\times \\frac{' . ($n + 1) . '}{' . $n . '} = ' . mlb_ftex($n + 1, 2 * $n) . '$.'],
                'Factorise each bracket as a difference of two squares.', 'challenge', 100); },
        static function (MlbRng $r) { $n = $r->int(3, 30); $s = [0, 1]; for ($k = 1; $k <= $n; $k++) $s = mlb_g_qadd($s, [1, $k * ($k + 2)]);
            return mlb_typed('frac', 'Work out $\\frac{1}{1 \\times 3} + \\frac{1}{2 \\times 4} + \\dots + \\frac{1}{' . $n . ' \\times ' . ($n + 2) . '}$.', mlb_frac($s[0], $s[1]),
                ['$\\frac{1}{k(k + 2)} = \\frac{1}{2}\\left(\\frac{1}{k} - \\frac{1}{k + 2}\\right)$.', 'Most terms cancel in pairs two apart, leaving $\\frac{1}{2}\\left(1 + \\frac{1}{2} - \\frac{1}{' . ($n + 1) . '} - \\frac{1}{' . ($n + 2) . '}\\right) = ' . mlb_ftex($s[0], $s[1]) . '$.'],
                'Here the cancelling skips one term each time — watch which survive.', 'challenge', 120); },
        static function (MlbRng $r) { $m = $r->int(3, 15); $n = $m * $m - 1;
            return mlb_typed('num', 'Work out $\\frac{1}{\\sqrt{1} + \\sqrt{2}} + \\frac{1}{\\sqrt{2} + \\sqrt{3}} + \\dots + \\frac{1}{\\sqrt{' . $n . '} + \\sqrt{' . ($n + 1) . '}}$.', (string)($m - 1),
                ['Rationalise each term: $\\frac{1}{\\sqrt{k} + \\sqrt{k + 1}} = \\sqrt{k + 1} - \\sqrt{k}$.', 'The sum telescopes to $\\sqrt{' . ($n + 1) . '} - \\sqrt{1} = ' . $m . ' - 1 = ' . ($m - 1) . '$.'],
                'Rationalise one term and see what happens.', 'challenge', 100); },
    ],
    'MC-193' => [
        static function (MlbRng $r) { $a = $r->int(1, 6); $c = $r->int(1, 6); $b = $a * $c * $c;
            return mlb_typed('num', 'For $x > 0$, what is the smallest value of $' . mlb_lterm($a, 'x') . ' + \\frac{' . $b . '}{x}$?', (string)(2 * $a * $c),
                ['AM–GM: for positive $p, q$, $p + q \\ge 2\\sqrt{pq}$.', '$' . mlb_lterm($a, 'x') . ' + \\frac{' . $b . '}{x} \\ge 2\\sqrt{' . ($a * $b) . '} = ' . (2 * $a * $c) . '$, with equality when $' . mlb_lterm($a, 'x') . ' = \\frac{' . $b . '}{x}$, i.e. $x = ' . $c . '$.'],
                'The product of the two terms does not depend on $x$.', 'procedure', 60); },
        static function (MlbRng $r) { $P = 4 * $r->int(5, 50);
            return mlb_typed('num', 'A farmer has ' . $P . ' m of fencing for a rectangular pen. What is the largest area she can enclose, in m²?', (string)(($P / 4) ** 2),
                ['If the sides are $x$ and $y$, then $x + y = ' . ($P / 2) . '$, and AM–GM gives $xy \\le \\left(\\frac{x + y}{2}\\right)^2$.', '$xy \\le ' . ($P / 4) . '^2 = ' . (($P / 4) ** 2) . '$, reached by the square of side ' . ($P / 4) . '.'],
                'Fixed sum — when is the product largest?', 'application', 60, ['unit' => 'm²']); },
        static function (MlbRng $r) { $k = $r->int(2, 12);
            return mlb_typed('num', 'For $x > 0$, at which value of $x$ is $x + \\frac{' . ($k * $k) . '}{x}$ smallest?', (string)$k,
                ['AM–GM: $x + \\frac{' . ($k * $k) . '}{x} \\ge 2\\sqrt{' . ($k * $k) . '} = ' . (2 * $k) . '$.', 'Equality needs the two terms EQUAL: $x = \\frac{' . ($k * $k) . '}{x}$, so $x = ' . $k . '$.'], 'AM–GM is an equality exactly when the terms are equal.', 'concept', 45); },
        static function (MlbRng $r) { $S = 3 * $r->int(2, 15);
            return mlb_typed('num', 'Positive numbers $x$, $y$ and $z$ add up to ' . $S . '. What is the largest possible value of $xyz$?', (string)(($S / 3) ** 3),
                ['AM–GM for three numbers: $\\frac{x + y + z}{3} \\ge \\sqrt[3]{xyz}$.', 'So $xyz \\le \\left(\\frac{' . $S . '}{3}\\right)^3 = ' . (($S / 3) ** 3) . '$, reached when $x = y = z = ' . ($S / 3) . '$.'],
                'Spread the total out evenly.', 'challenge', 60); },
    ],
    'MC-194' => [
        static function (MlbRng $r) { $a = $r->nz(-5, 5); $b = $r->nz(-5, 5); $c = $r->nz(-12, 12);
            return mlb_typed('frac', 'What is the smallest value of $x^2 + y^2$ if $' . mlb_lterm($a, 'x') . mlb_sterm($b, 'y') . ' = ' . $c . '$? Give a fraction.', mlb_frac($c * $c, $a * $a + $b * $b),
                ['Cauchy–Schwarz: $(ax + by)^2 \\le (a^2 + b^2)(x^2 + y^2)$.', 'So $x^2 + y^2 \\ge \\frac{' . ($c * $c) . '}{' . ($a * $a + $b * $b) . '} = ' . mlb_ftex($c * $c, $a * $a + $b * $b) . '$ — the squared distance from the origin to the line.'],
                'It is the square of the distance from $(0, 0)$ to the line.', 'challenge', 90); },
        static function (MlbRng $r) { [$a, $b, $h] = $r->pick(array_slice(MLB_TRIPLES, 0, 4)); if ($r->int(0, 1)) [$a, $b] = [$b, $a]; $R = $r->int(1, 5);
            return mlb_typed('num', 'If $x^2 + y^2 = ' . ($R * $R) . '$, what is the largest possible value of $' . $a . 'x + ' . $b . 'y$?', (string)($R * $h),
                ['Cauchy–Schwarz: $(' . $a . 'x + ' . $b . 'y)^2 \\le (' . $a . '^2 + ' . $b . '^2)(x^2 + y^2) = ' . ($h * $h) . ' \\times ' . ($R * $R) . '$.', 'So $' . $a . 'x + ' . $b . 'y \\le ' . $h . ' \\times ' . $R . ' = ' . ($R * $h) . '$, reached when $(x, y)$ points the same way as $(' . $a . ', ' . $b . ')$.'],
                'Compare with $\\sqrt{a^2 + b^2}$.', 'challenge', 80); },
        static function (MlbRng $r) { $k = $r->int(2, 5);
            return mlb_mcq($r, 'Which inequality is true for ALL real numbers $a$ and $b$?', '$(a + b)^2 \\le 2(a^2 + b^2)$',
                [['$(a + b)^2 \\le a^2 + b^2$', 'Fails for $a = b = ' . $k . '$: $' . (4 * $k * $k) . ' > ' . (2 * $k * $k) . '$.'], ['$a^2 + b^2 \\le 2ab$', 'Reversed: $a^2 + b^2 - 2ab = (a - b)^2 \\ge 0$.'], ['$(a + b)^2 \\ge 2(a^2 + b^2)$', 'Fails for $a = ' . $k . '$, $b = 0$.']],
                ['$2(a^2 + b^2) - (a + b)^2 = a^2 - 2ab + b^2 = (a - b)^2$.', 'A square is never negative, so the inequality always holds, with equality when $a = b$.'],
                'Subtract one side from the other.', 'reasoning', 60); },
        static function (MlbRng $r) { $n = $r->int(2, 12);
            return mlb_typed('num', 'Positive numbers $x_1, x_2, \\dots, x_{' . $n . '}$ are chosen. What is the smallest possible value of $(x_1 + \\dots + x_{' . $n . '})\\left(\\frac{1}{x_1} + \\dots + \\frac{1}{x_{' . $n . '}}\\right)$?', (string)($n * $n),
                ['Cauchy–Schwarz with $\\sqrt{x_i}$ and $\\frac{1}{\\sqrt{x_i}}$: the product is at least $(1 + 1 + \\dots + 1)^2 = ' . $n . '^2$.', 'All $x_i$ equal gives exactly ' . ($n * $n) . ', so the minimum is ' . ($n * $n) . '.'],
                'Try making them all equal first — then prove you cannot do better.', 'challenge', 90); },
    ],
    'MC-195' => [
        static function (MlbRng $r) { $a = $r->pick([2, 3]); $b = $r->int(1, 6); $k = $r->int(2, 5);
            // f(x) + a f(1/x) = b x  ⇒  f(x) = (b x - a b / x) / (1 - a^2)
            $num = $b * ($k * $k - $a); $den = $k * (1 - $a * $a);
            return mlb_typed('frac', 'A function satisfies $f(x) + ' . $a . 'f\\left(\\frac{1}{x}\\right) = ' . mlb_lterm($b, 'x') . '$ for every $x \\ne 0$. Find $f(' . $k . ')$ as a fraction.', mlb_frac($num, $den),
                ['Put $x = ' . $k . '$: $f(' . $k . ') + ' . $a . 'f(\\tfrac{1}{' . $k . '}) = ' . ($b * $k) . '$. Put $x = \\frac{1}{' . $k . '}$: $f(\\tfrac{1}{' . $k . '}) + ' . $a . 'f(' . $k . ') = ' . mlb_ftex($b, $k) . '$.',
                 'Solve these two equations for $f(' . $k . ')$: multiply the second by ' . $a . ' and subtract, $' . (1 - $a * $a) . 'f(' . $k . ') = ' . ($b * $k) . ' - ' . mlb_ftex($a * $b, $k) . '$, so $f(' . $k . ') = ' . mlb_ftex($num, $den) . '$.'],
                'Substitute $\\frac{1}{x}$ for $x$ to get a second equation.', 'challenge', 120); },
        static function (MlbRng $r) { $c = $r->int(1, 9); $k = $r->int(1, 4); $n = $r->int(3, 12); $v = $c * $n + $k * intdiv($n * ($n - 1), 2);
            return mlb_typed('num', 'A function on whole numbers satisfies $f(x + y) = f(x) + f(y) + ' . mlb_lterm($k, 'xy') . '$ and $f(1) = ' . $c . '$. Find $f(' . $n . ')$.', (string)$v,
                ['Put $y = 1$: $f(x + 1) = f(x) + ' . $c . ' + ' . mlb_lterm($k, 'x') . '$, so each step adds $' . $c . ' + ' . mlb_lterm($k, 'x') . '$.', '$f(' . $n . ') = ' . $c . ' \\times ' . $n . ' + ' . $k . '(1 + 2 + \\dots + ' . ($n - 1) . ') = ' . ($c * $n) . ' + ' . ($k * intdiv($n * ($n - 1), 2)) . ' = ' . $v . '$.'],
                'Put $y = 1$ and step up one at a time.', 'challenge', 90); },
        static function (MlbRng $r) { $p = $r->int(2, 4); $q = $r->int(-3, 5); $rr = $r->nz(-6, 8); $c = $r->int(-9, 9); $j = $r->int(-4, 6); $m = $q + $p * $j;
            return mlb_typed('num', '$f(' . $p . 'x' . mlb_sterm($q) . ') = ' . mlb_lterm($rr, 'x') . mlb_sterm($c) . '$ for every $x$. Find $f(' . $m . ')$.', (string)($rr * $j + $c),
                ['Choose $x$ so that $' . $p . 'x' . mlb_sterm($q) . ' = ' . $m . '$: $x = ' . $j . '$.', 'Then $f(' . $m . ') = ' . $rr . ' \\times ' . ($j < 0 ? '(' . $j . ')' : $j) . mlb_sterm($c) . ' = ' . ($rr * $j + $c) . '$.'],
                'What $x$ makes the inside equal to ' . $m . '?', 'procedure', 50); },
        static function (MlbRng $r) { $kind = $r->int(0, 2); $k = $r->int(2, 5);
            $props = ['$f(x + y) = f(x) + f(y)$', '$f(x + y) = f(x)f(y)$', '$f(xy) = f(x) + f(y)$'];
            $fns = ['$f(x) = ' . $k . 'x$', '$f(x) = ' . $k . '^x$', '$f(x) = \\log_{' . $k . '} x$'];
            $wrong = []; foreach ([0, 1, 2] as $i) if ($i !== $kind) $wrong[] = [$fns[$i], 'That one satisfies ' . $props[$i] . ' instead.'];
            $wrong[] = ['$f(x) = x^' . $k . '$', 'Powers satisfy $f(xy) = f(x)f(y)$.'];
            $why = ['$' . $k . '(x + y) = ' . $k . 'x + ' . $k . 'y$.', '$' . $k . '^{x + y} = ' . $k . '^x \\times ' . $k . '^y$.', '$\\log(xy) = \\log x + \\log y$.'];
            return mlb_mcq($r, 'Which function satisfies ' . $props[$kind] . ' for all allowed $x$ and $y$?', $fns[$kind], $wrong,
                ['Test each one in the equation.', $why[$kind]], 'Try $x = y = 1$ in each.', 'concept', 50); },
    ],
    'MC-196' => [
        static function (MlbRng $r) { $rs = [$r->int(-4, 6), $r->int(-4, 6), $r->int(-4, 6)]; $v = (1 - $rs[0]) * (1 - $rs[1]) * (1 - $rs[2]);
            return mlb_typed('num', 'When $(x' . mlb_sterm(-$rs[0]) . ')(x' . mlb_sterm(-$rs[1]) . ')(x' . mlb_sterm(-$rs[2]) . ')$ is expanded, what is the SUM of its coefficients?', (string)$v,
                ['The sum of the coefficients of $P(x)$ is $P(1)$: every power of $x$ becomes 1.', '$P(1) = (1' . mlb_sterm(-$rs[0]) . ')(1' . mlb_sterm(-$rs[1]) . ')(1' . mlb_sterm(-$rs[2]) . ') = ' . $v . '$.'], 'No need to expand.', 'procedure', 45); },
        static function (MlbRng $r) { do { $a = $r->int(-4, 5); $b = $r->int(-4, 5); } while ($a === $b); $A = $r->int(-15, 15); $B = $r->int(-15, 15);
            return mlb_typed('frac', 'When a polynomial $P(x)$ is divided by $x' . mlb_sterm(-$a) . '$ the remainder is ' . $A . ', and when divided by $x' . mlb_sterm(-$b) . '$ the remainder is ' . $B . '. The remainder on dividing by $(x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ')$ is $px + q$. Find $p$.', mlb_frac($A - $B, $a - $b),
                ['$P(x) = (x' . mlb_sterm(-$a) . ')(x' . mlb_sterm(-$b) . ')Q(x) + px + q$. Remainder theorem: $P(' . $a . ') = ' . $A . '$ and $P(' . $b . ') = ' . $B . '$.', 'So $' . mlb_lterm($a, 'p') . ' + q = ' . $A . '$ and $' . mlb_lterm($b, 'p') . ' + q = ' . $B . '$; subtract: $p = \\frac{' . ($A - $B) . '}{' . ($a - $b) . '} = ' . mlb_ftex($A - $B, $a - $b) . '$.'],
                'Put $x = ' . $a . '$ and $x = ' . $b . '$ — the quotient vanishes.', 'challenge', 100); },
        static function (MlbRng $r) { $a = $r->int(1, 3); $b = $r->nz(-3, 4); $n = $r->int(3, 7); $v = intdiv(($a + $b) ** $n + ($b - $a) ** $n, 2);
            return mlb_typed('num', 'In the expansion of $(' . mlb_lterm($a, 'x') . mlb_sterm($b) . ')^{' . $n . '}$, what is the sum of the coefficients of the EVEN powers of $x$ (including the constant)?', (string)$v,
                ['$P(1)$ adds all the coefficients; $P(-1)$ adds the even ones and subtracts the odd ones.', '$\\frac{P(1) + P(-1)}{2} = \\frac{' . (($a + $b) ** $n) . ' + ' . (($b - $a) ** $n < 0 ? '(' . (($b - $a) ** $n) . ')' : ($b - $a) ** $n) . '}{2} = ' . $v . '$.'],
                'Use $x = 1$ and $x = -1$.', 'challenge', 90); },
        static function (MlbRng $r) { $n = $r->int(2, 6); $v = mlb_fact($n) + $n + 1;
            return mlb_typed('num', '$P(x)$ is a polynomial of degree ' . $n . ' whose leading coefficient is 1, and $P(k) = k$ for $k = ' . implode(', ', range(1, $n)) . '$. Find $P(' . ($n + 1) . ')$.', (string)$v,
                ['$Q(x) = P(x) - x$ has degree ' . $n . ', leading coefficient 1, and roots $1, 2, \\dots, ' . $n . '$: so $Q(x) = (x - 1)(x - 2)\\cdots(x - ' . $n . ')$.', '$P(' . ($n + 1) . ') = Q(' . ($n + 1) . ') + ' . ($n + 1) . ' = ' . $n . '! + ' . ($n + 1) . ' = ' . $v . '$.'],
                'Look at $P(x) - x$.', 'challenge', 120); },
    ],
    'MC-197' => [
        static function (MlbRng $r) { [$a, $b, $h] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3); if ($r->int(0, 1)) [$a, $b] = [$b, $a]; $sa = $r->pick([1, -1]); $sb = $r->pick([1, -1]);
            return mlb_typed('num', 'Find $|' . ($sa * $k * $a) . ($sb < 0 ? ' - ' : ' + ') . ($k * $b) . 'i|$.', (string)($k * $h),
                ['$|x + yi| = \\sqrt{x^2 + y^2}$ — the distance from 0 on the Argand diagram.', '$\\sqrt{' . ($k * $a) . '^2 + ' . ($k * $b) . '^2} = \\sqrt{' . ($k * $k * $h * $h) . '} = ' . ($k * $h) . '$.'], 'Pythagoras on the Argand diagram.', 'procedure', 40); },
        static function (MlbRng $r) { $a = $r->nz(-5, 5); $b = $r->nz(-5, 5); $c = $r->nz(-5, 5); $d = $r->nz(-5, 5);
            return mlb_typed('pair', 'Write $(' . $a . mlb_sterm($b, 'i') . ')(' . $c . mlb_sterm($d, 'i') . ')$ as $x + yi$. Give $x$ and $y$.', [$a * $c - $b * $d, $a * $d + $b * $c],
                ['Expand like brackets: $' . ($a * $c) . mlb_sterm($a * $d, 'i') . mlb_sterm($b * $c, 'i') . mlb_sterm($b * $d, 'i^2') . '$.', '$i^2 = -1$: $x = ' . ($a * $c) . ' - (' . ($b * $d) . ') = ' . ($a * $c - $b * $d) . '$ and $y = ' . ($a * $d + $b * $c) . '$.'],
                'Expand, then replace $i^2$ by $-1$.', 'procedure', 60, ['labels' => ['x', 'y']]); },
        static function (MlbRng $r) { $j = $r->int(1, 6); $n = 4 * $j;
            return mlb_typed('num', 'Work out $(1 + i)^{' . $n . '}$.', (string)((-4) ** $j),
                ['$(1 + i)^2 = 1 + 2i + i^2 = 2i$, so $(1 + i)^4 = (2i)^2 = -4$.', '$(1 + i)^{' . $n . '} = (-4)^{' . $j . '} = ' . ((-4) ** $j) . '$. (De Moivre: $1 + i = \\sqrt{2}(\\cos 45^\\circ + i\\sin 45^\\circ)$.)'],
                'Square first.', 'challenge', 75); },
        static function (MlbRng $r) { $n = $r->int(10, 999); $m = $n % 4; $vals = ['1', 'i', '-1', '-i'];
            $wrong = []; foreach ($vals as $i => $v) if ($i !== $m) $wrong[] = ['$' . $v . '$', 'The powers of $i$ repeat every 4: $i, -1, -i, 1$. Divide ' . $n . ' by 4 and use the remainder.'];
            return mlb_mcq($r, 'What is $i^{' . $n . '}$?', '$' . $vals[$m] . '$', $wrong,
                ['$i^1 = i$, $i^2 = -1$, $i^3 = -i$, $i^4 = 1$, and then the cycle repeats.', '$' . $n . ' = 4 \\times ' . intdiv($n, 4) . ' + ' . $m . '$, so $i^{' . $n . '} = i^{' . $m . '} = ' . $vals[$m] . '$.'], 'The cycle has length 4.', 'procedure', 40); },
    ],
    'MC-198' => [
        static function (MlbRng $r) { do { $ap = $r->int(2, 12); $pb = $r->int(2, 12); $cp = $r->int(2, 12); } while (($ap * $pb) % $cp !== 0 || $cp === $ap || $cp === $pb); $pd = intdiv($ap * $pb, $cp);
            return mlb_typed('num', 'Two chords $AB$ and $CD$ of a circle cross at $P$. $AP = ' . $ap . '$, $PB = ' . $pb . '$ and $CP = ' . $cp . '$. Find $PD$.', (string)$pd,
                ['Intersecting chords: $AP \\times PB = CP \\times PD$ (triangles $APC$ and $DPB$ are similar).', '$' . $ap . ' \\times ' . $pb . ' = ' . $cp . ' \\times PD$, so $PD = ' . ($ap * $pb) . ' \\div ' . $cp . ' = ' . $pd . '$.'], 'The products of the pieces are equal.', 'procedure', 50); },
        static function (MlbRng $r) { do { $t = $r->int(4, 15); $ds = array_values(array_filter(mlb_g_divisors($t * $t), static fn($d) => $d < $t)); } while (count($ds) < 2); $pa = $r->pick($ds); $pb = intdiv($t * $t, $pa);
            return mlb_typed('num', 'From a point $P$ outside a circle, a tangent touches the circle at $T$, and a line through $P$ cuts the circle at $A$ and $B$, with $PA = ' . $pa . '$ and $PB = ' . $pb . '$. Find $PT$.', (string)$t,
                ['Tangent–secant: $PT^2 = PA \\times PB$.', '$PT^2 = ' . $pa . ' \\times ' . $pb . ' = ' . ($t * $t) . '$, so $PT = ' . $t . '$.'], 'The tangent counts twice.', 'procedure', 50); },
        static function (MlbRng $r) { do { $pa = $r->int(2, 9); $pb = $pa + $r->int(2, 12); $pc = $r->int(2, 9); } while (($pa * $pb) % $pc !== 0 || $pc === $pa || intdiv($pa * $pb, $pc) <= $pc); $pd = intdiv($pa * $pb, $pc);
            return mlb_typed('num', 'Two lines from a point $P$ outside a circle cut it at $A, B$ and at $C, D$. $PA = ' . $pa . '$, $PB = ' . $pb . '$ and $PC = ' . $pc . '$. Find $PD$.', (string)$pd,
                ['Power of a point: $PA \\times PB = PC \\times PD$ — the same number for every line through $P$.', '$' . $pa . ' \\times ' . $pb . ' = ' . $pc . ' \\times PD$, so $PD = ' . $pd . '$.'], 'Whole lengths from $P$, not the pieces inside.', 'procedure', 50); },
        static function (MlbRng $r) { [$a, $b, $h] = $r->pick(MLB_TRIPLES); $k = $r->int(1, 3); $rad = $r->int(0, 1) ? $a : $b; $t = $rad === $a ? $b : $a;
            return mlb_typed('num', 'A circle has radius ' . ($k * $rad) . '. A point $P$ is ' . ($k * $h) . ' from its centre. How long is a tangent from $P$ to the circle?', (string)($k * $t),
                ['The radius to the point of contact is perpendicular to the tangent, so there is a right angle there.', 'Pythagoras: $\\sqrt{' . ($k * $h) . '^2 - ' . ($k * $rad) . '^2} = ' . ($k * $t) . '$. (This is $\\sqrt{d^2 - r^2}$, the “power” of $P$.)'],
                'Where is the right angle?', 'challenge', 60); },
    ],
    'MC-199' => [
        static function (MlbRng $r) { [$a, $b, $c, $A] = $r->pick([[13, 14, 15, 84], [5, 5, 6, 12], [5, 5, 8, 12], [10, 13, 13, 60], [9, 10, 17, 36], [7, 15, 20, 42], [6, 25, 29, 60], [11, 13, 20, 66]]); $k = $r->int(1, 3); $s = intdiv($k * ($a + $b + $c), 2);
            return mlb_typed('num', 'A triangle has sides ' . ($k * $a) . ', ' . ($k * $b) . ' and ' . ($k * $c) . '. Find its area.', (string)($k * $k * $A),
                ['Heron: $s = \\frac{' . ($k * $a) . ' + ' . ($k * $b) . ' + ' . ($k * $c) . '}{2} = ' . $s . '$, and area $= \\sqrt{s(s - a)(s - b)(s - c)}$.', '$\\sqrt{' . $s . ' \\times ' . ($s - $k * $a) . ' \\times ' . ($s - $k * $b) . ' \\times ' . ($s - $k * $c) . '} = ' . ($k * $k * $A) . '$.'],
                'Find the semi-perimeter first.', 'procedure', 75); },
        static function (MlbRng $r) { [$a, $b, $c, $A] = $r->pick([[13, 14, 15, 84], [3, 4, 5, 6], [5, 12, 13, 30], [8, 15, 17, 60], [7, 24, 25, 84], [9, 40, 41, 180], [20, 21, 29, 210]]); $k = $r->int(1, 2); $s = intdiv($k * ($a + $b + $c), 2);
            return mlb_typed('num', 'A triangle has sides ' . ($k * $a) . ', ' . ($k * $b) . ' and ' . ($k * $c) . ' and area ' . ($k * $k * $A) . '. Find the radius of its inscribed circle.', (string)intdiv($k * $k * $A, $s),
                ['Join the incentre to the three corners: three triangles of height $r$, so area $= rs$, where $s$ is the semi-perimeter.', '$s = ' . $s . '$, so $r = \\frac{' . ($k * $k * $A) . '}{' . $s . '} = ' . intdiv($k * $k * $A, $s) . '$.'],
                'Area = $r \\times s$.', 'challenge', 75); },
        static function (MlbRng $r) { [$a, $b, $c, $A] = $r->pick([[13, 14, 15, 84], [5, 5, 6, 12], [3, 4, 5, 6], [5, 12, 13, 30], [10, 13, 13, 60], [8, 15, 17, 60]]); $k = $r->int(1, 2);
            return mlb_typed('frac', 'A triangle has sides ' . ($k * $a) . ', ' . ($k * $b) . ' and ' . ($k * $c) . ' and area ' . ($k * $k * $A) . '. Find the radius of its circumscribed circle, as a fraction.', mlb_frac($k * $a * $b * $c, 4 * $A),
                ['$R = \\frac{abc}{4 \\times \\text{area}}$ (from $a = 2R\\sin A$ and area $= \\frac{1}{2}bc\\sin A$).', '$R = \\frac{' . ($k * $a) . ' \\times ' . ($k * $b) . ' \\times ' . ($k * $c) . '}{4 \\times ' . ($k * $k * $A) . '} = ' . mlb_ftex($k * $a * $b * $c, 4 * $A) . '$.'],
                '$R = \\frac{abc}{4\\Delta}$.', 'challenge', 90); },
        static function (MlbRng $r) { $c = [['incentre', 'angle bisectors', 'the centre of the circle touching all three sides'], ['circumcentre', 'perpendicular bisectors of the sides', 'the centre of the circle through all three corners'], ['centroid', 'medians', 'the balance point, two-thirds of the way down each median'], ['orthocentre', 'altitudes', 'where the three heights meet']];
            $i = $r->int(0, 3); $wrong = []; foreach ($c as $j => $x) if ($j !== $i) $wrong[] = ['The ' . $x[0], 'The ' . $x[0] . ' is where the ' . $x[1] . ' meet.'];
            return mlb_mcq($r, 'The three ' . $c[$i][1] . ' of a triangle meet at one point. What is it called?', 'The ' . $c[$i][0], $wrong,
                ['Each centre is named by the lines that meet there.', 'The ' . $c[$i][1] . ' meet at the ' . $c[$i][0] . ': ' . $c[$i][2] . '.'], 'Match the lines to the centre.', 'concept', 35); },
    ],
    'MC-200' => [
        static function (MlbRng $r) { $p = $r->pick([2, 3, 5, 7, 11]);
            return mlb_mcq($r, 'To prove $\\sqrt{' . $p . '}$ is irrational by contradiction, how should the proof begin?', 'Suppose $\\sqrt{' . $p . '} = \\frac{a}{b}$, a fraction in its lowest terms',
                [['Suppose $\\sqrt{' . $p . '}$ is irrational', 'That assumes what is to be proved. A contradiction proof assumes the OPPOSITE.'], ['Work out $\\sqrt{' . $p . '}$ on a calculator and see that it does not stop', 'A calculator shows a few digits; it can never show that they never repeat.'],
                 ['Suppose $\\sqrt{' . $p . '} = \\frac{a}{b}$ for some whole numbers $a$ and $b$', 'Close — but “in lowest terms” is what the contradiction will break.']],
                ['Assume the opposite: $\\sqrt{' . $p . '} = \\frac{a}{b}$ in lowest terms. Then $a^2 = ' . $p . 'b^2$, so ' . $p . ' divides $a$, then ' . $p . ' divides $b$.', 'Both divisible by ' . $p . ' contradicts “lowest terms” — so $\\sqrt{' . $p . '}$ is irrational.'],
                'A contradiction proof starts from the opposite of the claim.', 'reasoning', 60); },
        static function (MlbRng $r) { $A = $r->int(10, 500); $B = $A + $r->int(50, 2000); $lo = (int)ceil(sqrt($A)); if (($lo - 1) ** 2 >= $A) $lo--; $hi = (int)floor(sqrt($B)); if (($hi + 1) ** 2 <= $B) $hi++; while ($lo * $lo < $A) $lo++; while ($hi * $hi > $B) $hi--;
            return mlb_typed('num', 'How many perfect squares lie between ' . $A . ' and ' . mlb_p($B) . ' (both included)?', (string)($hi - $lo + 1),
                ['The smallest square $\\ge ' . $A . '$ is $' . $lo . '^2 = ' . ($lo * $lo) . '$; the largest $\\le ' . $B . '$ is $' . $hi . '^2 = ' . ($hi * $hi) . '$.', 'So the squares are $' . $lo . '^2, \\dots, ' . $hi . '^2$: $' . $hi . ' - ' . $lo . ' + 1 = ' . ($hi - $lo + 1) . '$.'],
                'Count the square ROOTS instead.', 'procedure', 50); },
        static function (MlbRng $r) { $s = $r->pick([['$n^2$ is even', '$n$ is even', '$n^2$ is odd', '$n$ is odd'], ['a triangle is right-angled', '$a^2 + b^2 = c^2$ for its sides', '$a^2 + b^2 \\ne c^2$', 'it is not right-angled'], ['it is raining', 'the ground is wet', 'the ground is dry', 'it is not raining'], ['$n$ is divisible by 6', '$n$ is divisible by 3', '$n$ is not divisible by 3', '$n$ is not divisible by 6']]);
            [$P, $Q, $notQ, $notP] = $s;
            return mlb_mcq($r, 'What is the CONTRAPOSITIVE of “If ' . $P . ', then ' . $Q . '”?', 'If ' . $notQ . ', then ' . $notP,
                [['If ' . $Q . ', then ' . $P, 'That is the CONVERSE, which can be false when the statement is true.'], ['If ' . $notP . ', then ' . $notQ, 'That is the INVERSE — also not equivalent.'], ['If ' . $P . ', then ' . $notQ, 'That contradicts the statement.']],
                ['The contrapositive of “if $P$ then $Q$” is “if not $Q$, then not $P$”.', 'It is always true exactly when the original is — which is why proving it proves the original.'],
                'Swap the parts AND negate both.', 'reasoning', 50); },
        static function (MlbRng $r) { $p = $r->pick([3, 5, 11, 17, 41]); $n = 0; while (mlb_g_isprime($n * $n + $n + $p)) $n++; $v = $n * $n + $n + $p;
            return mlb_typed('num', '$n^2 + n + ' . $p . '$ gives a prime for $n = 0, 1, 2, \\dots$ for a while. What is the smallest whole number $n$ for which it is NOT prime?', (string)$n,
                ['Try values in turn: they are all prime until $n = ' . $n . '$, where $' . $n . '^2 + ' . $n . ' + ' . $p . ' = ' . $v . ' = ' . mlb_g_ftex(mlb_g_factor($v)) . '$.', 'A pattern that holds for many cases proves nothing: one counterexample ends it.' . ($n === $p - 1 ? ' (Here $n = ' . ($p - 1) . '$ gives $' . $p . '^2$.)' : '')],
                'Look for a value of $n$ that makes the expression factorise.', 'challenge', 90); },
    ],
    ];
}

/**
 * “Why it works” for the olympiad theorems a Gods-of-Maths learner leans on. An olympiad
 * medal is won by somebody who can say WHY, so the summit carries the most proofs per stage.
 */
function mlb_why_gods(): array {
    return [
    'MC-171' => ['If there were a last prime, multiplying them all and adding 1 would escape every one of them.', 'There are infinitely many primes (Euclid).', [
        ['Suppose the primes were only $p_1, p_2, \\dots, p_k$.', 'Assume the opposite of the claim, to reach a contradiction.'],
        ['Let $N = p_1 p_2 \\cdots p_k + 1$.', 'We are free to build any number we like from them.'],
        ['Dividing $N$ by any $p_i$ leaves remainder 1.', '$p_1 \\cdots p_k$ is a multiple of each $p_i$, and 1 more is left over.'],
        ['$N > 1$, so $N$ has some prime factor $q$.', 'Every whole number above 1 is divisible by a prime.'],
        ['$q$ is not on the list — a contradiction, so the primes never run out.', 'No prime on the list divides $N$, but $q$ does.'],
    ]],
    'MC-172' => ['Subtracting one number from another keeps every common divisor.', '$\\gcd(a, b) = \\gcd(b, a - b)$, so the Euclidean algorithm finds the HCF.', [
        ['If $d$ divides $a$ and $b$, then $d$ divides $a - b$.', 'A difference of two multiples of $d$ is a multiple of $d$.'],
        ['If $d$ divides $b$ and $a - b$, then $d$ divides $a$.', '$a = (a - b) + b$ is a sum of two multiples of $d$.'],
        ['So $a, b$ and $b, a - b$ have exactly the same common divisors.', 'The two lines above go in both directions.'],
        ['So their greatest common divisors are equal.', 'Equal sets of divisors have the same largest member.'],
        ['Repeating the subtraction gives the remainder, so $\\gcd(a, b) = \\gcd(b, r)$.', 'Taking off $b$ again and again is division with remainder.'],
    ]],
    'MC-173' => ['Remainders behave like the numbers they come from.', 'If $a \\equiv b$ and $c \\equiv d \\pmod m$, then $ac \\equiv bd \\pmod m$.', [
        ['$a = b + km$ and $c = d + lm$ for some integers $k, l$.', 'That is what being congruent mod $m$ means.'],
        ['$ac = bd + bl m + dk m + kl m^2$.', 'Expand the product of the two brackets.'],
        ['Every term after $bd$ is a multiple of $m$.', 'Each has a factor $m$ in it.'],
        ['So $ac \\equiv bd \\pmod m$.', 'Two numbers that differ by a multiple of $m$ are congruent.'],
    ]],
    'MC-174' => ['Multiplying all the non-zero remainders by $a$ just shuffles them.', 'If $p$ is prime and $p \\nmid a$, then $a^{p-1} \\equiv 1 \\pmod p$.', [
        ['The numbers $a, 2a, \\dots, (p - 1)a$ leave different non-zero remainders mod $p$.', 'If $ia \\equiv ja$, the prime $p$ divides $(i - j)a$ but neither factor — impossible.'],
        ['So they are $1, 2, \\dots, p - 1$ in some order.', 'There are $p - 1$ different non-zero remainders and $p - 1$ numbers.'],
        ['Multiplying them all: $a^{p-1}(p - 1)! \\equiv (p - 1)! \\pmod p$.', 'The same remainders multiply to the same product.'],
        ['$p$ does not divide $(p - 1)!$, so it may be cancelled: $a^{p-1} \\equiv 1$.', 'A prime dividing a product of smaller numbers would have to divide one of them.'],
    ]],
    'MC-177' => ['Each multiple of $p$ gives one factor, each multiple of $p^2$ one more, and so on.', 'The power of a prime $p$ in $n!$ is $\\lfloor n/p \\rfloor + \\lfloor n/p^2 \\rfloor + \\lfloor n/p^3 \\rfloor + \\dots$', [
        ['$n! = 1 \\times 2 \\times \\dots \\times n$, so count the factors of $p$ in each number.', 'The power of $p$ in a product is the total over its factors.'],
        ['Exactly $\\lfloor n/p \\rfloor$ of the numbers up to $n$ are multiples of $p$.', 'Every $p$th number is a multiple of $p$.'],
        ['The multiples of $p^2$ hold a second factor $p$; there are $\\lfloor n/p^2 \\rfloor$ of them.', 'Every $p^2$th number is a multiple of $p^2$.'],
        ['Counting each number once for every power of $p$ dividing it gives the total.', 'A number divisible by $p^k$ is counted exactly $k$ times, once in each line.'],
    ]],
    'MC-178' => ['Ten is one more than nine, so every power of ten is one more than a multiple of nine.', 'A number leaves the same remainder mod 9 as the sum of its digits.', [
        ['$10 \\equiv 1 \\pmod 9$.', '$10 = 9 + 1$.'],
        ['So $10^k \\equiv 1^k = 1 \\pmod 9$ for every $k$.', 'Congruences can be multiplied.'],
        ['A number is $d_0 + 10d_1 + 100d_2 + \\dots$', 'That is place value.'],
        ['So it is $\\equiv d_0 + d_1 + d_2 + \\dots \\pmod 9$.', 'Replace each power of 10 by its remainder, 1.'],
    ]],
    'MC-183' => ['Sharing out identical things is choosing where to put the dividers.', 'The number of solutions in whole numbers of $x_1 + \\dots + x_k = n$ is $\\binom{n + k - 1}{k - 1}$.', [
        ['Write $n$ stars in a row and add $k - 1$ bars among them.', 'Bars split the stars into $k$ groups, in order.'],
        ['The group sizes are a solution, and every solution comes from exactly one row.', 'The sizes $x_1, \\dots, x_k$ decide where the bars go, and the bars decide the sizes.'],
        ['A row has $n + k - 1$ symbols, of which $k - 1$ are bars.', 'Count the stars and the bars.'],
        ['So the count is $\\binom{n + k - 1}{k - 1}$.', 'A row is fixed by choosing which positions hold the bars.'],
    ]],
    'MC-184' => ['Adding two overlapping groups counts the overlap twice.', '$|A \\cup B| = |A| + |B| - |A \\cap B|$.', [
        ['An element only in $A$ is counted once in $|A| + |B|$.', 'It is in $A$ and not in $B$.'],
        ['An element only in $B$ is counted once too.', 'It is in $B$ and not in $A$.'],
        ['An element in both is counted twice in $|A| + |B|$.', 'It is in $A$ and in $B$.'],
        ['Taking off $|A \\cap B|$ leaves every element counted exactly once.', 'Exactly the doubly counted ones lose one count.'],
    ]],
    'MC-185' => ['More pigeons than holes means some hole is shared.', 'If $n + 1$ objects go into $n$ boxes, some box holds at least two.', [
        ['Suppose every box held at most one object.', 'Assume the opposite, to reach a contradiction.'],
        ['Then there would be at most $n$ objects.', 'Add up at most one per box over $n$ boxes.'],
        ['But there are $n + 1$ objects.', 'That was given.'],
        ['So some box holds at least two.', 'The assumption led to $n + 1 \\le n$, which is false.'],
    ]],
    'MC-186' => ['Count the subsets of a set in two ways.', '$\\binom{n}{0} + \\binom{n}{1} + \\dots + \\binom{n}{n} = 2^n$.', [
        ['A subset of $\\{1, \\dots, n\\}$ is made by deciding, for each element, in or out.', 'That is all a subset is.'],
        ['So there are $2^n$ subsets.', 'Two choices for each of $n$ elements, made independently.'],
        ['Sorting the subsets by size, $\\binom{n}{k}$ of them have exactly $k$ elements.', 'That is what $\\binom{n}{k}$ counts.'],
        ['So $\\sum_{k=0}^{n} \\binom{n}{k} = 2^n$.', 'Both lines count the same subsets.'],
    ]],
    'MC-187' => ['A route is just a word of R’s and U’s.', 'There are $\\binom{m + n}{m}$ right/up routes from $(0, 0)$ to $(m, n)$.', [
        ['Every route uses exactly $m$ steps right and $n$ steps up.', 'Each right step adds 1 to $x$ and each up step adds 1 to $y$.'],
        ['So a route is a list of $m + n$ letters, $m$ of them R.', 'Write down the steps in order.'],
        ['Each such list is a different route, and every route gives one.', 'The list and the route determine each other.'],
        ['So there are $\\binom{m + n}{m}$ routes.', 'A list is fixed by choosing which $m$ places hold R.'],
    ]],
    'MC-189' => ['An average of a sum is the sum of the averages — always.', '$E[X + Y] = E[X] + E[Y]$, even when $X$ and $Y$ depend on each other.', [
        ['$E[X + Y] = \\sum_{\\omega} P(\\omega)(X(\\omega) + Y(\\omega))$.', 'Expected value is the probability-weighted total over all outcomes.'],
        ['$= \\sum P(\\omega)X(\\omega) + \\sum P(\\omega)Y(\\omega)$.', 'Split each bracket and regroup the sum.'],
        ['$= E[X] + E[Y]$.', 'Each part is the definition of an expected value.'],
        ['No step used independence.', 'Only the definition and adding up were needed.'],
    ]],
    'MC-191' => ['A polynomial’s roots are written into its factors.', 'If $\\alpha, \\beta$ are the roots of $x^2 + px + q$, then $\\alpha + \\beta = -p$ and $\\alpha\\beta = q$.', [
        ['$x^2 + px + q = (x - \\alpha)(x - \\beta)$.', 'A quadratic with leading coefficient 1 factorises over its roots.'],
        ['$(x - \\alpha)(x - \\beta) = x^2 - (\\alpha + \\beta)x + \\alpha\\beta$.', 'Expand the brackets.'],
        ['So $-(\\alpha + \\beta) = p$ and $\\alpha\\beta = q$.', 'Equal polynomials have equal coefficients.'],
        ['That is, $\\alpha + \\beta = -p$ and $\\alpha\\beta = q$.', 'Multiply the first by $-1$.'],
    ]],
    'MC-192' => ['When each term is a difference, neighbours cancel.', '$\\sum_{k=1}^{n} \\frac{1}{k(k + 1)} = 1 - \\frac{1}{n + 1}$.', [
        ['$\\frac{1}{k(k + 1)} = \\frac{1}{k} - \\frac{1}{k + 1}$.', 'Combine the right-hand side over $k(k + 1)$: the top is $(k + 1) - k = 1$.'],
        ['The sum is $\\left(1 - \\frac{1}{2}\\right) + \\left(\\frac{1}{2} - \\frac{1}{3}\\right) + \\dots + \\left(\\frac{1}{n} - \\frac{1}{n + 1}\\right)$.', 'Write each term as its difference.'],
        ['Every middle fraction appears once with $+$ and once with $-$.', 'Each $\\frac{1}{k}$ ends one bracket and starts the next.'],
        ['Only $1 - \\frac{1}{n + 1}$ is left.', 'The pairs cancel, leaving the first and the last.'],
    ]],
    'MC-193' => ['A square is never negative — and that is the whole inequality.', 'For $a, b \\ge 0$: $\\frac{a + b}{2} \\ge \\sqrt{ab}$, with equality exactly when $a = b$.', [
        ['$(\\sqrt{a} - \\sqrt{b})^2 \\ge 0$.', 'The square of a real number is never negative.'],
        ['$a - 2\\sqrt{ab} + b \\ge 0$.', 'Expand the square.'],
        ['$\\frac{a + b}{2} \\ge \\sqrt{ab}$.', 'Add $2\\sqrt{ab}$ to both sides and divide by 2.'],
        ['Equality holds exactly when $\\sqrt{a} = \\sqrt{b}$, i.e. $a = b$.', 'A square is zero only when the thing squared is zero.'],
    ]],
    'MC-194' => ['A quadratic that is never negative cannot have two real roots.', '$(ax + by)^2 \\le (a^2 + b^2)(x^2 + y^2)$ (Cauchy–Schwarz).', [
        ['For every real $t$: $(at - x)^2 + (bt - y)^2 \\ge 0$.', 'A sum of squares is never negative.'],
        ['That is $(a^2 + b^2)t^2 - 2(ax + by)t + (x^2 + y^2) \\ge 0$.', 'Expand and collect powers of $t$.'],
        ['So its discriminant is not positive: $4(ax + by)^2 - 4(a^2 + b^2)(x^2 + y^2) \\le 0$.', 'A quadratic with a positive discriminant dips below zero between its roots.'],
        ['Dividing by 4 gives the inequality.', 'Dividing by a positive number keeps an inequality’s direction.'],
    ]],
    'MC-198' => ['Angles in the same segment make two triangles the same shape.', 'If chords $AB$ and $CD$ meet at $P$, then $PA \\times PB = PC \\times PD$.', [
        ['$\\angle PAC = \\angle PDB$.', 'Angles in the same segment, standing on the arc $CB$, are equal.'],
        ['$\\angle APC = \\angle DPB$.', 'Vertically opposite angles are equal.'],
        ['So triangles $PAC$ and $PDB$ are similar.', 'Two pairs of equal angles make triangles similar.'],
        ['$\\frac{PA}{PD} = \\frac{PC}{PB}$, so $PA \\times PB = PC \\times PD$.', 'Corresponding sides of similar triangles are in the same ratio.'],
    ]],
    'MC-199' => ['Cut the triangle into three from the centre of its inscribed circle.', 'Area $= rs$, where $r$ is the inradius and $s$ the semi-perimeter.', [
        ['Join the incentre $I$ to the corners: the triangle splits into three triangles.', 'The three pieces fill the triangle exactly.'],
        ['Each piece has a side of the triangle as its base and height $r$.', 'The incircle touches each side at a right angle, at distance $r$ from $I$.'],
        ['Their areas add to $\\frac{1}{2}ra + \\frac{1}{2}rb + \\frac{1}{2}rc$.', 'Each triangle’s area is half its base times its height.'],
        ['$= r \\times \\frac{a + b + c}{2} = rs$.', 'Take out the common factor $r$.'],
    ]],
    'MC-200' => ['Assume the opposite and follow it until it breaks.', '$\\sqrt{2}$ is irrational.', [
        ['Suppose $\\sqrt{2} = \\frac{a}{b}$ with $a, b$ whole numbers sharing no factor.', 'Assume the opposite of the claim, in lowest terms.'],
        ['Then $a^2 = 2b^2$, so $a^2$ is even, so $a$ is even.', 'Square and multiply by $b^2$; an odd number squared is odd.'],
        ['Write $a = 2c$: then $4c^2 = 2b^2$, so $b^2 = 2c^2$ and $b$ is even too.', 'Substitute and divide by 2; the same reasoning as before.'],
        ['$a$ and $b$ are both even — a contradiction, so $\\sqrt{2}$ is irrational.', 'They were chosen to share no factor, yet both have the factor 2.'],
    ]],
    ];
}
