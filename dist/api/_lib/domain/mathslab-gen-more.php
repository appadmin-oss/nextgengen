<?php
declare(strict_types=1);

/**
 * Maths Lab — forms added after the exam-style ones (mathslab-gen-exam.php).
 *
 * Appended last of all by mlb_forms(), so no form already in use changes its number (a session
 * stores form numbers). A future addition goes at the END of a topic's list here — never between.
 *
 * Logarithms (owner, 5 Nov 2026: "I also realised there's no logarithm"). The Lab taught logs in
 * two Stage 7 topics, as exact powers only, and a learner could not even type log or ln as an
 * answer. These forms take logs to where they are used: change of base, exponential equations
 * that only logs can solve, logs of numbers in standard form (what JAMB's "using tables" questions
 * test), natural logs and e, the shape of y = log x, doubling and half-life times, and ln in
 * calculus. Answers that need a calculator say how to round, and any answer that rounds to the
 * key is right (mlb_mark, `dp`).
 */

function mlb_forms_more(): array {
    static $f = null;
    if ($f !== null) return $f;
    return $f = [
    /* Number bases at exam speed (owner, 7 Nov 2026: "What is the fastest way to solve number base
       problems in less than 50s … they waste my time because of the back and forth conversions").
       The fast methods ARE the steps: place values with the zeros skipped, shift-and-add for binary
       multiplication, and plugging the options in for an unknown base — never algebra that may not
       even have a whole-number answer. Every unknown is chosen first and the question built from it,
       so each question has exactly one valid answer (the training pack's "31_x = 22_5" has none). */
    'MC-110' => [
        // An unknown BASE: try the options.
        static function (MlbRng $r) { $x = $r->int(4, 9); $a = $r->int(1, $x - 2); $d = $r->int(0, $x - 2); $N = $a * $x + $d;
            $wrong = array_map(static fn($c) => [(string)$c, 'In base ' . $c . ': $' . $a . ' \times ' . $c . ' + ' . $d . ' = ' . ($a * $c + $d) . '$, not ' . $N . '.'], [$x - 1, $x + 1, $x + 2]);
            return mlb_mcq($r, 'If $' . $a . $d . '_{x} = ' . $N . '_{10}$, find the base $x$.', (string)$x, $wrong,
                ['In base ten the left side is $' . $a . 'x + ' . $d . '$.', 'Plug in the options: $' . $a . ' \times ' . $x . ' + ' . $d . ' = ' . $N . '$. So $x = ' . $x . '$ (or solve $' . $a . 'x = ' . ($N - $d) . '$).'],
                'Plug the options in — it is faster than algebra, and every digit must be smaller than the base.', 'procedure', 40); },
        // A missing DIGIT, with the two sides in different bases.
        static function (MlbRng $r) { $b1 = $r->int(5, 9); $p = $r->int(1, $b1 - 1); $xd = $r->int(0, $b1 - 1); $V = $p * $b1 + $xd;
            $b2s = array_values(array_filter([3, 4, 6, 7, 8], static fn($b) => $b !== $b1 && $b < $V)); $b2 = $b2s[$r->int(0, count($b2s) - 1)];
            $rep = base_convert((string)$V, 10, $b2); $len = strlen($rep);
            $expand = implode(' + ', array_map(static fn($dg, $i) => $dg . ' \times ' . $b2 . '^{' . ($len - 1 - $i) . '}', str_split($rep), array_keys(str_split($rep))));
            return mlb_typed('num', 'If $' . $p . 'x_{' . $b1 . '} = ' . $rep . '_{' . $b2 . '}$, find the digit $x$.', (string)$xd,
                ['Right side in base ten: $' . $expand . ' = ' . $V . '$.', 'Left side: $' . $p . ' \times ' . $b1 . ' + x = ' . ($p * $b1) . ' + x$. So $x = ' . $V . ' - ' . ($p * $b1) . ' = ' . $xd . '$.'],
                'Turn the known side into base ten first; then the unknown side is one short equation.', 'procedure', 45); },
        // Binary multiplication: shift and add.
        static function (MlbRng $r) { $a = $r->int(5, 15); $b = $r->int(3, 7); $ba = decbin($a); $bb = decbin($b); $rows = [];
            foreach (array_reverse(str_split($bb)) as $i => $bit) $rows[] = $bit === '1' ? $ba . str_repeat('0', $i) : str_repeat('0', strlen($ba) + $i);
            return mlb_typed('num', 'Evaluate $' . $ba . '_2 \times ' . $bb . '_2$. Give the answer in binary.', decbin($a * $b),
                ['Shift and add: each digit of $' . $bb . '$ (from the right) gives one row — a 1 copies $' . $ba . '$, a 0 gives zeros — moved one place left each time.', 'Rows: $' . implode(',\ ', $rows) . '$. Add them: $' . decbin($a * $b) . '_2$.', 'Check in base ten: $' . $a . ' \times ' . $b . ' = ' . ($a * $b) . '$.'],
                'Multiplying by 1 copies; by 0 writes zeros; shift left for each row, then add.', 'procedure', 50, ['show' => '$' . decbin($a * $b) . '_2$']); },
        // Binary to base ten by the position method, the zeros skipped — against the three slips.
        static function (MlbRng $r) { do { $n = $r->int(33, 62); $bits = decbin($n); } while (strrev($bits) === $bits);
            $rev = bindec(strrev($bits)); $vals = []; foreach (str_split($bits) as $i => $d) if ($d === '1') $vals[] = 2 ** (strlen($bits) - 1 - $i);
            return mlb_mcq($r, 'Convert $' . $bits . '_2$ to base 10.', (string)$n,
                [[(string)(2 * $n), 'The place values were started at 2; the units column is $2^0 = 1$.'], [(string)$rev, 'The place values were counted from the LEFT; they start from the right.'], [(string)(2 ** strlen($bits) - 1), 'Every place value was added, including the ones under 0s.']],
                ['Place values from the right: $' . implode(', ', array_map(static fn($k) => (string)(2 ** $k), range(strlen($bits) - 1, 0, -1))) . '$.', 'Add only those under a 1, skipping the zeros: $' . implode(' + ', $vals) . ' = ' . $n . '$.'],
                'Write 32, 16, 8, 4, 2, 1 over the digits and add only where there is a 1.', 'procedure', 30); },
    ],
    'MC-068' => [
        // Change of base: log_b N with a calculator that only has log (base 10) or ln.
        static function (MlbRng $r) { do { $b = $r->int(2, 9); $N = $r->int(3, 200); } while (abs(log($N) / log($b) - round(log($N) / log($b))) < 1e-9);
            $v = log($N) / log($b);
            return mlb_typed('num', 'Use a calculator to find $\\log_{' . $b . '} ' . $N . '$, correct to 3 decimal places. (Calculators have $\\log$, base 10, and $\\ln$, base $e$.)', mlb_rd($v, 3),
                ['Change of base: $\\log_{' . $b . '} ' . $N . ' = \\frac{\\log ' . $N . '}{\\log ' . $b . '}$ — any base works, as long as both use the same one.', '$\\frac{' . mlb_rd(log10($N), 4) . '}{' . mlb_rd(log10($b), 4) . '} = ' . mlb_rd($v, 3) . '$.'],
                'Divide the log of the number by the log of the base.', 'procedure', 60, ['dp' => 3]); },
        // Logs of numbers in standard form: the characteristic and the mantissa (JAMB's "using tables").
        static function (MlbRng $r) { $m = $r->int(11, 99) / 10; $k = $r->int(-4, 5); $lm = round(log10($m), 4); $v = $lm + $k;
            return mlb_typed('num', 'Given that $\\log ' . mlb_dec($m) . ' = ' . mlb_dec($lm) . '$, find $\\log ' . mlb_p($m * 10 ** $k) . '$ without a calculator.', mlb_dec(round($v, 4)),
                ['Write the number in standard form: $' . mlb_p($m * 10 ** $k) . ' = ' . mlb_dec($m) . ' \\times 10^{' . $k . '}$.', '$\\log(' . mlb_dec($m) . ' \\times 10^{' . $k . '}) = \\log ' . mlb_dec($m) . ' + ' . ($k < 0 ? '(' . $k . ')' : $k) . ' = ' . mlb_dec(round($v, 4)) . '$.' . ($k < 0 ? ' (In bar notation this is $\\bar{' . (-$k) . '}.' . substr(sprintf('%.4f', $lm), 2) . '$.)' : '')],
                'Multiplying by 10 adds 1 to the log.', 'procedure', 60); },
        static function (MlbRng $r) { $k = $r->int(2, 9); $form = $r->int(0, 2);
            if ($form === 0) return mlb_mcq($r, 'What is $\\ln(e^{' . $k . '})$?', (string)$k,
                [['$e^{' . $k . '}$', '$\\ln$ UNDOES $e^x$: it gives back the power.'], ['$' . $k . 'e$', 'The logarithm of a power is the power, not the power times $e$.'], ['$\\ln ' . $k . '$', 'The $\\ln$ applies to the whole of $e^{' . $k . '}$.']],
                ['$\\ln$ is the logarithm to base $e$, so it asks: $e$ to what power gives $e^{' . $k . '}$?', 'The power is ' . $k . '.'], '$\\ln$ and $e^x$ undo each other.', 'concept', 30);
            if ($form === 1) return mlb_mcq($r, 'What is $e^{\\ln ' . $k . '}$?', (string)$k,
                [['$\\ln ' . $k . '$', '$e^x$ UNDOES $\\ln$: what is left is the number itself.'], ['$e^{' . $k . '}$', 'The power is $\\ln ' . $k . '$, not ' . $k . '.'], ['1', 'Only $e^0$ is 1.']],
                ['$\\ln ' . $k . '$ is the power of $e$ that gives ' . $k . '.', 'So raising $e$ to that power gives ' . $k . '.'], 'Each undoes the other.', 'concept', 30);
            return mlb_typed('num', 'Solve $e^x = ' . $k . '$, giving $x$ correct to 3 decimal places.', mlb_rd(log($k), 3),
                ['Take natural logs of both sides: $x = \\ln ' . $k . '$.', '$\\ln ' . $k . ' = ' . mlb_rd(log($k), 3) . '$.'], 'Undo $e^x$ with $\\ln$.', 'procedure', 45, ['dp' => 3]); },
        static function (MlbRng $r) { $b = $r->int(2, 9);
            return mlb_mcq($r, 'Where does the curve $y = \\log_{' . $b . '} x$ cross the $x$-axis?', 'At $(1, 0)$',
                [['At $(0, 1)$', 'That is where $y = ' . $b . '^x$ crosses the $y$-axis — the curve reflected in $y = x$.'], ['At $(' . $b . ', 0)$', 'At $x = ' . $b . '$, $y = \\log_{' . $b . '} ' . $b . ' = 1$, not 0.'], ['It never crosses it', 'It does: $\\log_{' . $b . '} 1 = 0$.']],
                ['On the $x$-axis $y = 0$, so $\\log_{' . $b . '} x = 0$.', 'That means $x = ' . $b . '^0 = 1$: the point $(1, 0)$ — for every base.'], 'What power of ' . $b . ' is 1?', 'concept', 40); },
        // Making x the subject of an exponential: the answer is a log, typed as log( ) or ln( ).
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5, 7]); $k = $r->int(2, 6);
            return mlb_typed('expr', 'Make $x$ the subject of $y = ' . $k . ' \\times ' . $b . '^x$. (Type log( ) or ln( ) for a logarithm.)', 'log(y/' . $k . ')/log(' . $b . ')',
                ['Divide by ' . $k . ': $' . $b . '^x = \\frac{y}{' . $k . '}$.', 'Take logs: $x \\log ' . $b . ' = \\log \\frac{y}{' . $k . '}$, so $x = \\frac{\\log(y/' . $k . ')}{\\log ' . $b . '}$ (natural logs work just as well).'],
                'Get the power on its own first, then take logs.', 'challenge', 90, ['vars' => 'x,y', 'positive' => true]); },
    ],
    'MC-069' => [
        // An exponential equation only logs can solve.
        static function (MlbRng $r) { do { $b = $r->int(2, 9); $N = $r->int(5, 500); $v = log($N) / log($b); } while (abs($v - round($v)) < 0.02);
            return mlb_typed('num', 'Solve $' . $b . '^x = ' . $N . '$, giving $x$ correct to 2 decimal places.', mlb_rd($v, 2),
                ['Take logs of both sides: $x \\log ' . $b . ' = \\log ' . $N . '$.', '$x = \\frac{\\log ' . $N . '}{\\log ' . $b . '} = \\frac{' . mlb_rd(log10($N), 4) . '}{' . mlb_rd(log10($b), 4) . '} = ' . mlb_rd($v, 2) . '$.'],
                'Bring the power down with a logarithm.', 'procedure', 60, ['dp' => 2]); },
        static function (MlbRng $r) { do { $b = $r->int(3, 7); $x = $r->int(1, 12); $a = ($b - 2) * $x; } while ($a < 1);
            return mlb_typed('num', 'Solve $\\log(2x + ' . $a . ') = \\log x + \\log ' . $b . '$.', (string)$x,
                ['Combine the right-hand side: $\\log x + \\log ' . $b . ' = \\log ' . $b . 'x$.', 'Equal logs have equal arguments: $2x + ' . $a . ' = ' . $b . 'x$, so $' . ($b - 2) . 'x = ' . $a . '$ and $x = ' . $x . '$ (and $x > 0$, so the logs exist).'],
                'Make each side a single log.', 'procedure', 60); },
        // Doubling and half-life: the time is a logarithm.
        static function (MlbRng $r) { $T = $r->int(2, 12); $grow = $r->int(0, 1) === 1; $k = $r->pick([3, 5, 6, 10, 12, 20]); $t = $T * log($k) / log(2);
            $stem = $grow ? 'A colony of bacteria doubles every ' . $T . ' hours. How many hours does it take to become ' . $k . ' times as large? Give your answer to 1 decimal place.'
                          : 'A medicine’s amount in the blood halves every ' . $T . ' hours. After how many hours is only $\\frac{1}{' . $k . '}$ of it left? Give your answer to 1 decimal place.';
            return mlb_typed('num', $stem, mlb_rd($t, 1),
                ['After $t$ hours the ' . ($grow ? 'size is multiplied by' : 'amount is divided by') . ' $2^{t/' . $T . '}$, so $2^{t/' . $T . '} = ' . $k . '$.', 'Take logs: $\\frac{t}{' . $T . '} = \\frac{\\log ' . $k . '}{\\log 2}$, so $t = ' . $T . ' \\times ' . mlb_rd(log($k) / log(2), 4) . ' = ' . mlb_rd($t, 1) . '$ hours.'],
                'How many doublings (or halvings) make ' . $k . '?', 'challenge', 90, ['dp' => 1]); },
        static function (MlbRng $r) { $b = $r->pick([2, 3, 5]); $p = $r->int(2, 5); $q = $r->int(2, 5);
            return mlb_mcq($r, 'Which is equal to $' . $p . '\\log_{' . $b . '} x - ' . $q . '\\log_{' . $b . '} y$?', '$\\log_{' . $b . '} \\frac{x^{' . $p . '}}{y^{' . $q . '}}$',
                [['$\\log_{' . $b . '} (x^{' . $p . '} - y^{' . $q . '})$', 'Subtracting logs DIVIDES inside; it never subtracts.'], ['$\\log_{' . $b . '} \\frac{' . $p . 'x}{' . $q . 'y}$', 'A number in front becomes a POWER inside, not a multiplier.'],
                 ['$\\frac{' . $p . '\\log_{' . $b . '} x}{' . $q . '\\log_{' . $b . '} y}$', 'That divides the logs themselves; the law divides what is inside.']],
                ['$' . $p . '\\log x = \\log x^{' . $p . '}$ and $' . $q . '\\log y = \\log y^{' . $q . '}$.', 'Subtracting logs divides: $\\log \\frac{x^{' . $p . '}}{y^{' . $q . '}}$.'],
                'Powers first, then combine.', 'procedure', 45); },
    ],
    'MC-155' => [
        static function (MlbRng $r) { $a = $r->int(1, 6); $b = $r->int(1, 9); $k = $r->int(0, 5);
            return mlb_typed('frac', 'If $y = \\ln(' . mlb_lterm($a, 'x') . ' + ' . $b . ')$, find $\\frac{dy}{dx}$ when $x = ' . $k . '$. Give a fraction.', mlb_frac($a, $a * $k + $b),
                ['Chain rule: $\\frac{d}{dx} \\ln(u) = \\frac{1}{u} \\cdot \\frac{du}{dx}$, so $\\frac{dy}{dx} = \\frac{' . $a . '}{' . mlb_lterm($a, 'x') . ' + ' . $b . '}$.', 'At $x = ' . $k . '$: $\\frac{' . $a . '}{' . ($a * $k + $b) . '} = ' . mlb_ftex($a, $a * $k + $b) . '$.'],
                'Differentiate the inside too.', 'procedure', 60); },
    ],
    ];
}
