<?php
declare(strict_types=1);

/**
 * Maths Lab — "Why it works" (the Mathematics Clinic's founding idea).
 *
 * The clinic began with an instructor taking a learner back to 1 + 1 = 2, not
 * to teach counting but to show WHY mathematics works. So the foundations
 * (Stages 1–4) and every topic built on a result that can be proved — a law,
 * a formula, a theorem — carry a short proof (the owner: “only necessary”;
 * a topic that is a skill or a convention has none): a big idea, the claim, and a chain
 * of statements, each with the reason it is true. Nothing here is decoration —
 * the Learn page walks the chain one line at a time, and two question forms
 * per topic are generated FROM it (mlb_why_forms): "why is this line true?"
 * and "put the argument in order". A learner who has only memorised a rule
 * cannot answer either; that is the point.
 *
 * Shape: id → [idea, claim, [[statement, reason], …]]. Statements and reasons
 * are each distinct within a proof (the justify form uses the other reasons as
 * its wrong options), and the steps are in logical order (the order form marks
 * against it). A typographic ’ is used in prose so a quote never ends a string.
 */

function mlb_why(): array {
    static $w = null;
    if ($w !== null) return $w;
    return $w = mlb_why_1_4() + mlb_why_theorems() + (function_exists('mlb_why_deep') ? mlb_why_deep() : []) + (function_exists('mlb_why_gods') ? mlb_why_gods() : []);
}

/** The proof for one competency, or null. */
function mlb_why_of(string $id): ?array {
    $w = mlb_why()[$id] ?? null;
    return $w ? ['idea' => $w[0], 'claim' => $w[1], 'steps' => array_map(static fn($s) => ['s' => $s[0], 'r' => $s[1]], $w[2])] : null;
}

function mlb_why_1_4(): array {
    return [
    /* Stage 1 · Number Consciousness */
    'MC-001' => ['A number answers “how many?”. Counting means giving each thing one number word.', 'Counting a set gives the same number whatever order you count in.', [
        ['Each object is given exactly one counting word: one, two, three, …', 'That is what counting is: one number word for each object.'],
        ['No object is skipped and none is counted twice.', 'If you skip one, or count one twice, the count is wrong.'],
        ['The last word said is the size of the set.', 'The words were used in order, so the last one tells how many were used.'],
        ['Counting in a different order pairs the same objects with the same words.', 'Only which object gets which word changes, not how many words are used.'],
    ]],
    'MC-002' => ['Adding is putting groups together and counting the whole.', '$1 + 1 = 2$.', [
        ['$1$ is the number of a set with one object, say {●}.', 'This is what the numeral 1 means.'],
        ['Join it to another set with one object, {○}: we get {●, ○}.', 'Addition means combining two separate sets into one.'],
        ['Counting {●, ○} gives “one, two”.', 'Pair each object with a counting word in order.'],
        ['So $1 + 1 = 2$.', 'The last counting word is the size of the combined set.'],
    ]],
    'MC-003' => ['Zero is the number of an empty set, so adding it changes nothing.', 'For every number $n$, $n + 0 = n$.', [
        ['$0$ is the number of objects in an empty set.', 'That is the meaning of zero.'],
        ['$n + 0$ means joining a set of $n$ objects with an empty set.', 'Addition is combining sets.'],
        ['The combined set has exactly the same objects as the first set.', 'Nothing was added from the empty set.'],
        ['So $n + 0 = n$.', 'The same objects give the same count.'],
    ]],
    'MC-004' => ['A numeral is a name; the quantity it names does not change with the name.', '“5”, “five” and ||||| all name the same number.', [
        ['“five” is the counting word reached after four objects and one more.', 'It names a quantity.'],
        ['“5” is the symbol agreed for that same counting word.', 'Numerals are written names for counting words.'],
        ['||||| has a mark for each object, five marks.', 'Tally marks pair one mark with one object.'],
        ['All three name the same size of set.', 'Each one matches the same five objects.'],
    ]],
    'MC-005' => ['Each counting word is one more than the word before it.', 'Counting back by 1 undoes counting on by 1.', [
        ['The word after $n$ is $n + 1$.', 'Counting on adds one object.'],
        ['The word before $n + 1$ is $n$.', 'The counting sequence has no gaps or repeats.'],
        ['Counting back from $n + 1$ removes the object just added.', 'Counting back is taking one away.'],
        ['So $(n + 1) - 1 = n$.', 'We return to the word we started from.'],
    ]],
    'MC-006' => ['Compare by pairing: whatever is left over decides it.', 'If $a$ objects pair with part of $b$ objects and some of $b$ are left, then $a < b$.', [
        ['Pair the objects of the two sets one-to-one.', 'You can compare two groups just by matching them up, without counting.'],
        ['Every object of the first set gets a partner.', 'The first set is used up completely.'],
        ['Some objects of the second set have no partner.', 'The second set still has objects waiting.'],
        ['So the second set has more: $a < b$.', 'It has all the partners plus extras.'],
    ]],
    'MC-007' => ['Place value lets us compare from the biggest place down.', 'Among whole numbers, the one with more digits is larger.', [
        ['A number with $k$ digits (first digit not 0) is at least $10^{k-1}$.', 'Its first digit counts at least one of the biggest place.'],
        ['A number with fewer than $k$ digits is at most $10^{k-1} - 1$.', 'Its places are all smaller, each at most 9.'],
        ['$10^{k-1} - 1 < 10^{k-1}$.', 'One less is less.'],
        ['So more digits means larger.', 'Every $k$-digit number beats every shorter one.'],
    ]],
    'MC-008' => ['A number line is a ruler for numbers: position is distance from 0.', 'On a number line, $a + b$ is reached by starting at $a$ and moving $b$ steps right.', [
        ['Each whole number $n$ sits $n$ equal steps to the right of $0$.', 'That is how the number line is built.'],
        ['Start at $a$: we are $a$ steps from $0$.', 'Position of $a$.'],
        ['Move $b$ more steps right.', 'Adding $b$ means $b$ more units.'],
        ['We are now $a + b$ steps from $0$, at the point $a + b$.', 'The distances add.'],
    ]],
    'MC-009' => ['Ten of one place make one of the next: that is what “place” means.', '$347 = 3 \\times 100 + 4 \\times 10 + 7$.', [
        ['In base ten, each place is worth ten of the place to its right.', 'Ten units are bundled into a ten, ten tens into a hundred.'],
        ['The 3 in 347 is in the hundreds place.', 'Third place from the right.'],
        ['The 4 is in the tens place and the 7 in the units place.', 'Second and first places.'],
        ['So $347 = 300 + 40 + 7$.', 'A numeral is the sum of its digits times their place values.'],
    ]],
    'MC-010' => ['A number can be split any way you like and rebuilt; the total is kept.', '$58 = 40 + 18$.', [
        ['$58 = 50 + 8$.', 'Place value: 5 tens and 8 units.'],
        ['$50 = 40 + 10$.', 'One ten can be taken out of the tens.'],
        ['$58 = 40 + 10 + 8$.', 'Substitute the split ten.'],
        ['$58 = 40 + 18$.', 'Join the ten to the units: $10 + 8 = 18$.'],
    ]],

    /* Stage 2 · Arithmetic Foundations */
    'MC-011' => ['Order and grouping do not change a total.', '$a + b = b + a$: you can add in any order.', [
        ['Take a set of $a$ red counters and a set of $b$ blue counters.', 'Model the numbers as sets.'],
        ['$a + b$ is the count of all counters, reds first.', 'Meaning of addition.'],
        ['$b + a$ is the count of the same counters, blues first.', 'Meaning of addition, starting from the other set.'],
        ['The two counts are equal.', 'Counting the same objects in a different order gives the same number.'],
    ]],
    'MC-012' => ['Subtraction answers “how many are left?” and “how far apart?” — the same number.', '$a - b$ is the number you add to $b$ to make $a$.', [
        ['Start with $a$ objects and remove $b$; $a - b$ remain.', 'Subtraction as taking away.'],
        ['Putting the $b$ back gives $a$ again.', 'Undoing the removal.'],
        ['So $b + (a - b) = a$.', 'The remainder plus what was taken is the whole.'],
        ['So $a - b$ is the missing addend in $b + ? = a$.', 'Subtraction as difference.'],
    ]],
    'MC-013' => ['Borrowing is exchanging one ten for ten units; the number is not changed.', '$52 - 17 = 35$ by regrouping.', [
        ['$52 = 4$ tens $+ 12$ units.', 'Exchange one ten for ten units; the value is the same.'],
        ['$12$ units $- 7$ units $= 5$ units.', 'Subtract in the units place.'],
        ['$4$ tens $- 1$ ten $= 3$ tens.', 'Subtract in the tens place.'],
        ['$52 - 17 = 35$.', 'Combine the places.'],
    ]],
    'MC-014' => ['Multiplication counts equal groups; an array shows it both ways.', '$a \\times b = b \\times a$.', [
        ['Arrange $a$ rows of $b$ dots: that is $a \\times b$ dots.', 'Equal groups in rows.'],
        ['Read the same array by columns: $b$ columns of $a$ dots.', 'The array has $b$ columns, each holding one dot per row.'],
        ['So the dots number $b \\times a$.', 'Equal groups in columns.'],
        ['$a \\times b = b \\times a$.', 'It is the same array, so the same number of dots.'],
    ]],
    'MC-015' => ['You never need to memorise a fact you can build from one you know.', '$7 \\times 8 = 56$ from $7 \\times 4$.', [
        ['$8 = 4 + 4$.', 'Split the harder factor.'],
        ['$7 \\times 8 = 7 \\times 4 + 7 \\times 4$.', '8 groups of 7 is the same as 4 groups of 7, and then 4 more groups of 7.'],
        ['$7 \\times 4 = 28$.', 'Double 7 is 14, double again is 28.'],
        ['$7 \\times 8 = 28 + 28 = 56$.', 'Add the two parts.'],
    ]],
    'MC-016' => ['Division undoes multiplication: sharing and grouping ask the same question.', '$24 \\div 6 = 4$ because $6 \\times 4 = 24$.', [
        ['$24 \\div 6$ asks: how many in each group if 24 are shared among 6?', 'Division as sharing.'],
        ['If each group has $4$, the 6 groups hold $6 \\times 4$.', 'Equal groups are multiplication.'],
        ['$6 \\times 4 = 24$.', 'Known multiplication fact.'],
        ['So $24 \\div 6 = 4$.', 'Exactly 24 are used, with none left over.'],
    ]],
    'MC-017' => ['A remainder is what is left over once no more full groups can be formed.', '$a = bq + r$ with $0 \\le r < b$.', [
        ['Take groups of $b$ from $a$ as many times as possible: $q$ times.', 'Division as repeated grouping.'],
        ['What is used is $bq$, and what is left is $r = a - bq$.', 'Subtraction.'],
        ['$r < b$.', 'If $r \\ge b$, one more full group could have been taken.'],
        ['So $a = bq + r$ with $0 \\le r < b$.', 'Rearranging $r = a - bq$.'],
    ]],
    'MC-018' => ['The four operations come in inverse pairs.', 'If $a + b = c$ then $c - b = a$, and if $a \\times b = c$ ($b \\ne 0$) then $c \\div b = a$.', [
        ['$a + b = c$ means adding $b$ to $a$ gives $c$.', 'Given.'],
        ['Taking $b$ away from $c$ undoes adding it, so $c - b = a$.', 'Subtraction is the inverse of addition.'],
        ['$a \\times b = c$ means $b$ groups of $a$ make $c$.', 'Given: the multiplication fact.'],
        ['Sharing $c$ into $b$ equal groups gives $a$ each, so $c \\div b = a$.', 'Division is the inverse of multiplication.'],
    ]],
    'MC-019' => ['A divisibility test is place value plus remainders.', 'A number is divisible by 3 exactly when its digit sum is.', [
        ['$10 = 9 + 1$, $100 = 99 + 1$, $1000 = 999 + 1$, …', 'Each power of ten is one more than a multiple of 9.'],
        ['So $\\overline{abc} = 100a + 10b + c = (99a + 9b) + (a + b + c)$.', 'Expand by place value and regroup.'],
        ['$99a + 9b$ is a multiple of 3.', '9 and 99 are multiples of 3.'],
        ['So $\\overline{abc}$ leaves the same remainder on division by 3 as $a + b + c$.', 'Adding a multiple of 3 does not change the remainder.'],
    ]],
    'MC-020' => ['HCF × LCM = the product: the primes are shared out.', 'For two numbers, $\\text{HCF} \\times \\text{LCM} = a \\times b$.', [
        ['Write $a$ and $b$ as products of primes.', 'Every whole number above 1 has a prime factorisation.'],
        ['The HCF takes each prime to the LOWER power found in $a$ and $b$.', 'It must divide both.'],
        ['The LCM takes each prime to the HIGHER power.', 'Both must divide it.'],
        ['For each prime, lower power + higher power = the two powers added.', 'min + max of two numbers is their sum.'],
        ['So HCF × LCM has exactly the primes of $a \\times b$.', 'Multiplying adds the powers.'],
    ]],

    /* Stage 3 · The Number System */
    'MC-021' => ['Negative numbers are positions to the left of 0, and each has an opposite.', '$a + (-a) = 0$.', [
        ['$-a$ is the point as far left of $0$ as $a$ is to the right.', 'Definition of the opposite.'],
        ['Adding $-a$ means moving $a$ steps left.', 'Adding a negative is moving left.'],
        ['From $a$, moving $a$ steps left lands on $0$.', 'Equal distance back.'],
        ['So $a + (-a) = 0$.', 'Where we land is the sum.'],
    ]],
    'MC-022' => ['Subtracting a number is adding its opposite.', '$5 - (-3) = 8$.', [
        ['$5 - (-3)$ is the number that, added to $-3$, makes $5$.', 'Subtraction asks for the missing addend.'],
        ['From $-3$ to $0$ is $3$ steps right.', 'Distance on the number line.'],
        ['From $0$ to $5$ is $5$ more steps right.', 'Counting on from zero.'],
        ['So the missing addend is $3 + 5 = 8$.', 'The steps add.'],
    ]],
    'MC-023' => ['Minus times minus is plus — not because someone said so, but because any other answer would break rules we already trust.', '$(-1) \\times (-1) = 1$.', [
        ['$(-1) \\times 0 = 0$.', 'Anything times zero is zero.'],
        ['$(-1) \\times (1 + (-1)) = 0$.', '$1 + (-1) = 0$.'],
        ['$(-1) \\times 1 + (-1) \\times (-1) = 0$.', 'Multiplication distributes over addition.'],
        ['$-1 + (-1) \\times (-1) = 0$.', '$(-1) \\times 1 = -1$.'],
        ['$(-1) \\times (-1) = 1$.', 'It is the number that added to $-1$ gives $0$.'],
    ]],
    'MC-024' => ['Order of operations is a rule everyone agrees on, so a sum has only one answer.', '$2 + 3 \\times 4 = 14$, not $20$.', [
        ['$3 \\times 4$ means $4 + 4 + 4$.', 'Multiplication is repeated addition.'],
        ['So $2 + 3 \\times 4 = 2 + 4 + 4 + 4$.', 'Substitute its meaning.'],
        ['$2 + 4 + 4 + 4 = 14$.', 'Add.'],
        ['That is why multiplication is done before addition.', 'Doing the addition first would change what $3 \\times 4$ multiplies.'],
    ]],
    'MC-025' => ['A fraction $\\frac{a}{b}$ is $a$ parts of size $\\frac{1}{b}$ — and also $a \\div b$.', '$\\frac{3}{4} = 3 \\div 4$.', [
        ['$\\frac{1}{4}$ is one of 4 equal parts of a whole.', 'Meaning of the unit fraction.'],
        ['$\\frac{3}{4}$ is 3 of those parts.', 'Meaning of the numerator.'],
        ['Share 3 wholes among 4 people: cut each whole into quarters.', 'Each person takes one quarter of each whole.'],
        ['Each person gets $3$ quarters, so $3 \\div 4 = \\frac{3}{4}$.', 'One quarter from each of 3 wholes.'],
    ]],
    'MC-026' => ['Multiplying top and bottom by the same number cuts the same amount into more, smaller pieces.', '$\\frac{a}{b} = \\frac{ka}{kb}$ for $k \\ne 0$.', [
        ['Cut each of the $b$ parts into $k$ smaller equal parts.', 'Refining the pieces keeps the whole.'],
        ['The whole now has $kb$ equal parts.', '$b$ parts, each split into $k$.'],
        ['The $a$ shaded parts become $ka$ smaller parts.', 'Each shaded part split into $k$.'],
        ['The shaded amount has not changed, so $\\frac{a}{b} = \\frac{ka}{kb}$.', 'Same region, new names.'],
    ]],
    'MC-027' => ['Fractions add only when the pieces are the same size.', '$\\frac{1}{2} + \\frac{1}{3} = \\frac{5}{6}$.', [
        ['$\\frac{1}{2} = \\frac{3}{6}$.', 'Equivalent fractions: multiply top and bottom by 3.'],
        ['$\\frac{1}{3} = \\frac{2}{6}$.', 'Equivalent fractions: multiply top and bottom by 2.'],
        ['$\\frac{3}{6} + \\frac{2}{6} = \\frac{5}{6}$.', 'Same-sized pieces (sixths) can be counted together.'],
        ['So $\\frac{1}{2} + \\frac{1}{3} = \\frac{5}{6}$, not $\\frac{2}{5}$.', 'Adding the denominators would change the size of the pieces.'],
    ]],
    'MC-028' => ['Decimals continue place value to the right of the units.', '$0.3 = \\frac{3}{10}$ and $0.25 = \\frac{25}{100}$.', [
        ['Each place is worth $\\frac{1}{10}$ of the place on its left.', 'The base-ten rule continues past the point.'],
        ['The first place after the point is tenths.', 'One tenth of a unit.'],
        ['The second is hundredths.', 'One tenth of a tenth.'],
        ['So $0.25 = \\frac{2}{10} + \\frac{5}{100} = \\frac{25}{100}$.', 'Sum of digits times their place values.'],
    ]],
    'MC-029' => ['Line up the points because you must add like places.', '$0.3 \\times 0.2 = 0.06$.', [
        ['$0.3 = \\frac{3}{10}$ and $0.2 = \\frac{2}{10}$.', 'Decimal place value.'],
        ['$\\frac{3}{10} \\times \\frac{2}{10} = \\frac{6}{100}$.', 'Multiply tops and multiply bottoms.'],
        ['$\\frac{6}{100} = 0.06$.', 'Hundredths are the second decimal place.'],
        ['So the answer has as many decimal places as the two factors together.', 'Tenths times tenths are hundredths.'],
    ]],
    'MC-030' => ['Per cent means “out of a hundred”, so it is a fraction with denominator 100.', '$\\frac{3}{8} = 37.5\\%$.', [
        ['$x\\% = \\frac{x}{100}$.', 'Meaning of per cent.'],
        ['$\\frac{3}{8} = 3 \\div 8 = 0.375$.', 'A fraction is a division.'],
        ['$0.375 = \\frac{37.5}{100}$.', 'Multiply by 100 and divide by 100.'],
        ['So $\\frac{3}{8} = 37.5\\%$.', 'Read it as a number out of a hundred.'],
    ]],

    /* Stage 4 · Applied Arithmetic */
    'MC-031' => ['A ratio compares amounts; scaling both parts keeps the comparison.', '$a : b = ka : kb$.', [
        ['$a : b$ means for every $a$ of the first there are $b$ of the second.', 'Meaning of a ratio.'],
        ['$k$ copies of that mixture contain $ka$ and $kb$.', 'Each copy adds $a$ and $b$.'],
        ['$k$ copies taste exactly the same as one.', 'The proportion of each part is unchanged.'],
        ['So $ka : kb$ is the same ratio as $a : b$.', 'Same comparison.'],
    ]],
    'MC-032' => ['In direct proportion, the amount per ONE unit stays fixed.', 'If 5 pens cost ₦400, 8 pens cost ₦640.', [
        ['The cost is proportional to the number of pens.', 'Each pen costs the same.'],
        ['One pen costs $400 \\div 5 = ₦80$.', 'Unit rate.'],
        ['8 pens cost $8 \\times 80$.', 'Eight times the cost of one.'],
        ['$= ₦640$.', 'Multiply.'],
    ]],
    'MC-033' => ['In inverse proportion, the product stays fixed.', 'If 4 workers take 6 days, 3 workers take 8 days.', [
        ['The job needs $4 \\times 6 = 24$ worker-days.', 'Total work = workers × days.'],
        ['The total work does not change with the number of workers.', 'It is the same job.'],
        ['$3 \\times d = 24$.', 'The new team must still supply 24 worker-days.'],
        ['$d = 8$ days.', 'Divide by 3.'],
    ]],
    'MC-034' => ['Converting units is multiplying by 1 in disguise.', '$3$ km $= 3000$ m.', [
        ['$1$ km $= 1000$ m.', 'Definition of a kilometre.'],
        ['So $\\frac{1000\\ \\text{m}}{1\\ \\text{km}} = 1$.', 'A quantity divided by an equal quantity.'],
        ['$3\\ \\text{km} \\times \\frac{1000\\ \\text{m}}{1\\ \\text{km}}$ does not change the length.', 'Multiplying by 1 changes nothing.'],
        ['$= 3000$ m.', 'The km cancels, leaving metres.'],
    ]],
    'MC-035' => ['Rounding picks the nearest value at the chosen precision.', '$3.46$ rounds to $3.5$ to 1 d.p.', [
        ['To 1 d.p. the candidates are $3.4$ and $3.5$.', 'The two neighbours with one decimal place.'],
        ['$3.46$ is $0.06$ from $3.4$ and $0.04$ from $3.5$.', 'Subtract.'],
        ['$0.04 < 0.06$.', 'Compare.'],
        ['So $3.46 \\approx 3.5$.', 'Rounding chooses the nearer one.'],
    ]],
    'MC-036' => ['A rounded measurement hides a range, and the range has bounds.', 'A length of 7 cm to the nearest cm lies in $6.5 \\le L < 7.5$.', [
        ['Rounding to the nearest cm gives 7 for every length nearer to 7 than to 6 or 8.', 'Meaning of rounding.'],
        ['Halfway to 6 is 6.5; halfway to 8 is 7.5.', 'The midpoints.'],
        ['$6.5$ rounds up to 7, but $7.5$ rounds up to 8.', 'The halfway convention rounds up.'],
        ['So $6.5 \\le L < 7.5$.', 'The bounds are half a unit either side.'],
    ]],
    'MC-037' => ['Percentage change is always a percentage OF THE ORIGINAL.', 'Buy at ₦800, sell at ₦1000: profit is 25%.', [
        ['Profit $= 1000 - 800 = ₦200$.', 'Selling price minus cost.'],
        ['The profit is compared with what was spent, ₦800.', 'Profit percentage is measured on the cost price.'],
        ['$\\frac{200}{800} = \\frac{1}{4}$.', 'Simplify.'],
        ['$\\frac{1}{4} = 25\\%$.', 'Convert to a percentage.'],
    ]],
    'MC-038' => ['Compound interest earns interest on interest, so it multiplies.', 'After $n$ years at $r\\%$, $A = P(1 + \\frac{r}{100})^n$.', [
        ['After one year, $A_1 = P + \\frac{r}{100}P = P(1 + \\frac{r}{100})$.', 'Interest is added to the principal.'],
        ['Year 2 applies the same rate to $A_1$: $A_2 = A_1(1 + \\frac{r}{100})$.', 'Interest is earned on the new amount.'],
        ['$A_2 = P(1 + \\frac{r}{100})^2$.', 'Substitute $A_1$.'],
        ['Each year multiplies by the same factor, so $A_n = P(1 + \\frac{r}{100})^n$.', 'Repeated multiplication is a power.'],
    ]],
    'MC-039' => ['Speed is a rate: distance for each unit of time.', 'Average speed is total distance ÷ total time — not the average of the speeds.', [
        ['Go 60 km at 60 km/h (1 h), then 60 km at 30 km/h (2 h).', 'Time = distance ÷ speed.'],
        ['Total distance 120 km, total time 3 h.', 'Add.'],
        ['Average speed $= 120 \\div 3 = 40$ km/h.', 'Definition of average speed.'],
        ['The average of 60 and 30 is 45, which is wrong.', 'More time was spent at the slower speed.'],
    ]],
    'MC-040' => ['A model turns words into relationships you can check.', 'Ade has ₦500 more than Bola; together they have ₦2300. Bola has ₦900.', [
        ['Let Bola have $b$; then Ade has $b + 500$.', 'Name the unknown and translate “more than”.'],
        ['$b + (b + 500) = 2300$.', 'Together means add.'],
        ['$2b = 1800$, so $b = 900$.', 'Subtract 500, then halve.'],
        ['Check: $900 + 1400 = 2300$ and $1400 - 900 = 500$.', 'Substitute back into BOTH facts.'],
    ]],
    ];
}

/** Stages 5–17: only the topics that rest on a provable law, formula or theorem. */
function mlb_why_theorems(): array {
    return [
    'MC-045' => ['Expanding brackets is counting an area two ways.', '$a(b + c) = ab + ac$.', [
        ['Draw a rectangle $a$ wide and $b + c$ long: its area is $a(b + c)$.', 'Area of a rectangle is length × width.'],
        ['Split the long side into $b$ and $c$, making two rectangles.', 'Cutting a shape does not change its total area.'],
        ['Their areas are $ab$ and $ac$.', 'Area of each rectangle.'],
        ['So $a(b + c) = ab + ac$.', 'The same area counted whole and in parts.'],
    ]],
    'MC-047' => ['An equation is a balance: do the same to both sides and it stays level.', 'If $a = b$ then $a + c = b + c$ and $ac = bc$.', [
        ['$a$ and $b$ are the same number.', 'That is what $a = b$ says.'],
        ['Adding $c$ to the same number gives the same result.', 'An operation gives one answer for one input.'],
        ['So $a + c = b + c$.', 'Replace $b$ by the equal number $a$.'],
        ['Likewise $ac = bc$.', 'Multiplying the same number by $c$ gives one answer.'],
    ]],
    'MC-051' => ['Changing the subject is solving an equation for a letter.', 'If $v = u + at$ then $t = \\frac{v - u}{a}$ ($a \\ne 0$).', [
        ['$v = u + at$.', 'Given.'],
        ['$v - u = at$.', 'Subtract $u$ from both sides.'],
        ['$\\frac{v - u}{a} = t$.', 'Divide both sides by $a$, which is not zero.'],
        ['So $t = \\frac{v - u}{a}$.', 'Equality reads both ways.'],
    ]],
    'MC-054' => ['Adding two true equations gives a true equation — so a variable can be made to vanish.', 'From $x + y = 7$ and $x - y = 1$: $x = 4$, $y = 3$.', [
        ['$(x + y) + (x - y) = 7 + 1$.', 'Equals added to equals give equals.'],
        ['$2x = 8$, so $x = 4$.', 'The $y$ terms cancel; divide by 2.'],
        ['$4 + y = 7$, so $y = 3$.', 'Substitute into the first equation.'],
        ['Check: $4 - 3 = 1$.', 'The pair must satisfy the second equation too.'],
    ]],
    'MC-058' => ['$a^2 - b^2$ factorises because the middle terms cancel.', '$a^2 - b^2 = (a - b)(a + b)$.', [
        ['$(a - b)(a + b) = a^2 + ab - ba - b^2$.', 'Expand: each term of the first bracket times each of the second.'],
        ['$ab - ba = 0$.', 'Multiplication is commutative.'],
        ['So $(a - b)(a + b) = a^2 - b^2$.', 'Remove the cancelled terms.'],
        ['E.g. $99 \\times 101 = 100^2 - 1^2 = 9999$.', 'Use it with $a = 100$, $b = 1$.'],
    ]],
    'MC-063' => ['Indices count repeated factors, so the laws are just counting.', '$a^m \\times a^n = a^{m+n}$.', [
        ['$a^m$ is $m$ factors of $a$ multiplied together.', 'Meaning of an index.'],
        ['$a^n$ is $n$ more factors of $a$.', 'The same meaning, for the second power.'],
        ['$a^m \\times a^n$ has $m + n$ factors of $a$.', 'Multiplying puts the factors side by side.'],
        ['So $a^m \\times a^n = a^{m+n}$.', 'Count the factors and write the index.'],
    ]],
    'MC-064' => ['Zero and negative indices are the only values that keep the laws true.', '$a^0 = 1$ and $a^{-n} = \\frac{1}{a^n}$ ($a \\ne 0$).', [
        ['$a^n \\div a^n = a^{n - n} = a^0$.', 'The division law: subtract indices.'],
        ['$a^n \\div a^n = 1$.', 'Any non-zero number divided by itself.'],
        ['So $a^0 = 1$.', 'Both are the same quotient.'],
        ['$a^0 \\div a^n = a^{-n}$, and also $= \\frac{1}{a^n}$.', 'The division law again, with $a^0 = 1$.'],
    ]],
    'MC-067' => ['Rationalising multiplies by 1, chosen to clear the root.', '$\\frac{1}{\\sqrt{2}} = \\frac{\\sqrt{2}}{2}$.', [
        ['$\\frac{\\sqrt{2}}{\\sqrt{2}} = 1$.', 'A non-zero number over itself.'],
        ['$\\frac{1}{\\sqrt{2}} = \\frac{1}{\\sqrt{2}} \\times \\frac{\\sqrt{2}}{\\sqrt{2}}$.', 'Multiplying by 1 changes nothing.'],
        ['$\\sqrt{2} \\times \\sqrt{2} = 2$.', 'Meaning of square root.'],
        ['So $\\frac{1}{\\sqrt{2}} = \\frac{\\sqrt{2}}{2}$.', 'Multiply tops and bottoms.'],
    ]],
    'MC-069' => ['A logarithm is an index, so log laws are index laws read backwards.', '$\\log_a(xy) = \\log_a x + \\log_a y$.', [
        ['Let $\\log_a x = m$ and $\\log_a y = n$, so $x = a^m$, $y = a^n$.', 'Definition of a logarithm.'],
        ['$xy = a^m a^n = a^{m+n}$.', 'Law of indices.'],
        ['So $\\log_a(xy) = m + n$.', 'Read the power back as a logarithm.'],
        ['$= \\log_a x + \\log_a y$.', 'Substitute back.'],
    ]],
    'MC-070' => ['Gauss’s pairing: write the sum forwards and backwards.', '$S_n = \\frac{n}{2}(2a + (n - 1)d)$ for an AP.', [
        ['$S_n = a + (a + d) + \\dots + (a + (n - 1)d)$.', 'Definition of the sum.'],
        ['$S_n = (a + (n - 1)d) + \\dots + (a + d) + a$.', 'The same sum written backwards.'],
        ['Adding term by term, each pair is $2a + (n - 1)d$.', 'One term rises by $d$ as the other falls by $d$.'],
        ['$2S_n = n(2a + (n - 1)d)$, so $S_n = \\frac{n}{2}(2a + (n - 1)d)$.', 'There are $n$ pairs; divide by 2.'],
    ]],
    'MC-073' => ['Parallel lines cut by a transversal make equal alternate angles.', 'Alternate angles are equal.', [
        ['Corresponding angles on parallel lines are equal.', 'Parallel lines meet a transversal at the same angle.'],
        ['An angle’s vertically opposite angle is equal to it.', 'Both are supplementary to the same angle.'],
        ['The alternate angle is vertically opposite the corresponding angle.', 'Read from the diagram.'],
        ['So alternate angles are equal.', 'Two equalities chained.'],
    ]],
    'MC-074' => ['The angles of any triangle add to $180^\\circ$.', '$A + B + C = 180^\\circ$.', [
        ['Draw the line through $C$ parallel to $AB$.', 'Through a point there is one parallel line.'],
        ['The angles at $C$ on that line are equal to $A$ and $B$.', 'Alternate angles are equal.'],
        ['Those two angles and $C$ sit together on a straight line.', 'They fill the line at $C$.'],
        ['So $A + B + C = 180^\\circ$.', 'Angles on a straight line add to $180^\\circ$.'],
    ]],
    'MC-075' => ['A polygon splits into triangles from one corner.', 'Interior angles of an $n$-gon add to $(n - 2) \\times 180^\\circ$.', [
        ['Join one vertex to every non-adjacent vertex.', 'Diagonals from one corner.'],
        ['This makes $n - 2$ triangles.', 'Each side except the two at that corner gives one triangle.'],
        ['The triangles’ angles exactly fill the polygon’s angles.', 'They meet only at the polygon’s corners.'],
        ['Sum $= (n - 2) \\times 180^\\circ$.', 'Each triangle contributes $180^\\circ$.'],
    ]],
    'MC-077' => ['Pythagoras is an area fact: four copies of the triangle and two ways to fill a square.', '$a^2 + b^2 = c^2$ in a right triangle.', [
        ['Put four copies of the triangle inside a square of side $a + b$, leaving a tilted square of side $c$.', 'The right angles make the corners fit.'],
        ['Area of the big square $= (a + b)^2 = a^2 + 2ab + b^2$.', 'Expand.'],
        ['It also equals $4 \\times \\frac{1}{2}ab + c^2 = 2ab + c^2$.', 'Four triangles plus the inner square.'],
        ['So $a^2 + b^2 = c^2$.', 'Subtract $2ab$ from both expressions of one area.'],
    ]],
    'MC-079' => ['The angle at the centre is twice the angle at the circumference.', '$\\angle AOB = 2\\angle APB$.', [
        ['Join $P$ to the centre $O$ and extend the line.', 'Construction.'],
        ['$OA = OP$, so triangle $AOP$ is isosceles with two equal base angles $x$.', 'Radii are equal.'],
        ['The exterior angle at $O$ is $2x$.', 'Exterior angle = sum of the two opposite interior angles.'],
        ['Doing the same on the $B$ side and adding gives $\\angle AOB = 2\\angle APB$.', 'The two parts add.'],
    ]],
    'MC-082' => ['A triangle is half a rectangle.', 'Area of a triangle $= \\frac{1}{2} \\times$ base $\\times$ height.', [
        ['Drop the height from the top vertex to the base.', 'Construction.'],
        ['Each part is half of a rectangle of the same height.', 'A diagonal halves a rectangle.'],
        ['The two rectangles together are base × height.', 'Their widths add to the base.'],
        ['So the triangle is $\\frac{1}{2}bh$.', 'Half of each part, added.'],
    ]],
    'MC-083' => ['Cut a circle into thin sectors and rearrange them into a near-rectangle.', 'Area of a circle $= \\pi r^2$.', [
        ['Cut the circle into many thin equal sectors.', 'Construction.'],
        ['Lay them alternately up and down: a shape close to a rectangle.', 'Rearranging keeps the area.'],
        ['Its height is $r$ and its length is half the circumference, $\\pi r$.', 'Half the arcs are on each long side.'],
        ['Area $= \\pi r \\times r = \\pi r^2$.', 'The thinner the sectors, the closer to a true rectangle.'],
    ]],
    'MC-085' => ['A prism’s volume is a stack of equal slices.', 'Volume of a prism = cross-section area × length.', [
        ['Slice the prism into layers 1 unit thick.', 'Construction.'],
        ['Each layer has volume = cross-section area × 1.', 'Every slice is the same shape.'],
        ['There are “length” layers.', 'Length in units.'],
        ['Volume = area × length.', 'Add the equal layers.'],
    ]],
    'MC-093' => ['Gradient is the rate of change: rise per unit of run.', 'A straight line has the same gradient between any two of its points.', [
        ['Take two pairs of points on the line and draw their rise/run triangles.', 'Construction.'],
        ['Both triangles have one horizontal and one vertical side.', 'Rise and run are measured that way.'],
        ['Their angles match, so the triangles are similar.', 'The line meets the horizontal at one angle.'],
        ['So rise ÷ run is the same for both.', 'Similar triangles have equal ratios of sides.'],
    ]],
    'MC-094' => ['Every point on a line obeys one equation.', 'The line of gradient $m$ through $(0, c)$ is $y = mx + c$.', [
        ['Take any point $(x, y)$ on the line.', 'A general point.'],
        ['Its gradient from $(0, c)$ is $\\frac{y - c}{x - 0}$.', 'Rise over run.'],
        ['That gradient is $m$.', 'A straight line has one gradient.'],
        ['$y - c = mx$, so $y = mx + c$.', 'Multiply by $x$ and add $c$.'],
    ]],
    'MC-096' => ['The distance formula is Pythagoras on the grid.', 'Distance $= \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.', [
        ['Draw the right triangle with legs parallel to the axes.', 'Construction.'],
        ['The legs are $|x_2 - x_1|$ and $|y_2 - y_1|$.', 'Horizontal and vertical differences.'],
        ['$d^2 = (x_2 - x_1)^2 + (y_2 - y_1)^2$.', 'Pythagoras’ theorem.'],
        ['$d = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.', 'A distance is the positive square root.'],
    ]],
    'MC-101' => ['If a product is zero, one factor is zero.', 'If $(x - 2)(x - 5) = 0$ then $x = 2$ or $x = 5$.', [
        ['If $ab = 0$ and $a \\ne 0$, divide by $a$: $b = 0$.', 'Division by a non-zero number is allowed.'],
        ['So $ab = 0$ means $a = 0$ or $b = 0$.', 'Either $a$ is zero or the first line applies.'],
        ['Here $x - 2 = 0$ or $x - 5 = 0$.', 'Apply it to the two factors.'],
        ['$x = 2$ or $x = 5$.', 'Solve each.'],
    ]],
    'MC-103' => ['The quadratic formula is completing the square done once, for every quadratic.', 'If $ax^2 + bx + c = 0$ then $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.', [
        ['$x^2 + \\frac{b}{a}x = -\\frac{c}{a}$.', 'Divide by $a$; move $c$ across.'],
        ['$(x + \\frac{b}{2a})^2 = \\frac{b^2}{4a^2} - \\frac{c}{a} = \\frac{b^2 - 4ac}{4a^2}$.', 'Add $(\\frac{b}{2a})^2$ to both sides to complete the square.'],
        ['$x + \\frac{b}{2a} = \\pm\\frac{\\sqrt{b^2 - 4ac}}{2a}$.', 'Square root of both sides, both signs.'],
        ['$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.', 'Subtract $\\frac{b}{2a}$.'],
    ]],
    'MC-104' => ['The roots are built into the coefficients.', 'Roots $\\alpha, \\beta$ of $ax^2 + bx + c = 0$ have $\\alpha + \\beta = -\\frac{b}{a}$, $\\alpha\\beta = \\frac{c}{a}$.', [
        ['$ax^2 + bx + c = a(x - \\alpha)(x - \\beta)$.', 'A quadratic factorises over its roots.'],
        ['$= ax^2 - a(\\alpha + \\beta)x + a\\alpha\\beta$.', 'Expand.'],
        ['$b = -a(\\alpha + \\beta)$ and $c = a\\alpha\\beta$.', 'Equal polynomials have equal coefficients.'],
        ['So $\\alpha + \\beta = -\\frac{b}{a}$ and $\\alpha\\beta = \\frac{c}{a}$.', 'Divide by $a$.'],
    ]],
    'MC-108' => ['Dividing by $(x - a)$ leaves the remainder $f(a)$.', 'The remainder when $f(x)$ is divided by $(x - a)$ is $f(a)$.', [
        ['$f(x) = (x - a)q(x) + R$, with $R$ a constant.', 'Division by a linear factor leaves a constant remainder.'],
        ['Put $x = a$: $f(a) = (a - a)q(a) + R$.', 'The identity holds for every $x$.'],
        ['$(a - a)q(a) = 0$.', 'Zero times anything is zero.'],
        ['So $R = f(a)$; and $f(a) = 0$ exactly when $(x - a)$ is a factor.', 'Factor theorem: remainder zero.'],
    ]],
    'MC-114' => ['The sine rule comes from the same height measured from two sides.', '$\\frac{a}{\\sin A} = \\frac{b}{\\sin B}$.', [
        ['Drop the height $h$ from $C$ to side $c$.', 'Construction.'],
        ['$h = b\\sin A$.', 'Sine in the right triangle containing $A$.'],
        ['$h = a\\sin B$.', 'Sine in the right triangle containing $B$.'],
        ['$b\\sin A = a\\sin B$, so $\\frac{a}{\\sin A} = \\frac{b}{\\sin B}$.', 'Both equal $h$; divide by $\\sin A\\sin B$.'],
    ]],
    'MC-115' => ['Trigonometry finds the height you could not measure.', 'Area $= \\frac{1}{2}ab\\sin C$.', [
        ['Area $= \\frac{1}{2} \\times$ base $\\times$ height; take base $a$.', 'Triangle area.'],
        ['The height from the opposite vertex to $a$ is $b\\sin C$.', 'Sine in the right triangle with hypotenuse $b$.'],
        ['Area $= \\frac{1}{2} \\times a \\times b\\sin C$.', 'Substitute.'],
        ['$= \\frac{1}{2}ab\\sin C$.', 'Rearrange.'],
    ]],
    'MC-118' => ['The mean is the balance point: deviations cancel.', 'The deviations from the mean add to zero.', [
        ['$\\bar{x} = \\frac{\\sum x}{n}$, so $\\sum x = n\\bar{x}$.', 'Definition of the mean.'],
        ['$\\sum (x - \\bar{x}) = \\sum x - n\\bar{x}$.', 'There are $n$ copies of $\\bar{x}$.'],
        ['$= n\\bar{x} - n\\bar{x}$.', 'Substitute.'],
        ['$= 0$.', 'Subtract.'],
    ]],
    'MC-120' => ['Probabilities of everything that can happen add to 1.', '$P(\\text{not } A) = 1 - P(A)$.', [
        ['Every outcome is either in $A$ or not in $A$, never both.', 'An event and its complement split the sample space.'],
        ['$P(A) + P(\\text{not } A) = P(\\text{all outcomes})$.', 'Probabilities of non-overlapping events add.'],
        ['$P(\\text{all outcomes}) = 1$.', 'Something certainly happens.'],
        ['So $P(\\text{not } A) = 1 - P(A)$.', 'Subtract $P(A)$.'],
    ]],
    'MC-121' => ['De Morgan: “not (A or B)” is “not A and not B”.', '$(A \\cup B)\' = A\' \\cap B\'$.', [
        ['An element is in $(A \\cup B)\'$ exactly when it is not in $A \\cup B$.', 'Meaning of complement.'],
        ['Not in $A \\cup B$ means in neither $A$ nor $B$.', 'Meaning of union.'],
        ['That means in $A\'$ and in $B\'$.', 'Meaning of complement, twice.'],
        ['Which is $A\' \\cap B\'$.', 'Meaning of intersection.'],
    ]],
    'MC-127' => ['Count the orders, then forget the order.', '$\\binom{n}{r} = \\frac{n!}{r!(n - r)!}$.', [
        ['The number of ordered selections of $r$ from $n$ is $\\frac{n!}{(n - r)!}$.', '$n$ choices, then $n - 1$, … for $r$ places.'],
        ['Each unordered group of $r$ appears $r!$ times among them.', 'Its members can be ordered in $r!$ ways.'],
        ['So the number of groups is $\\frac{n!}{(n - r)!} \\div r!$.', 'Divide out the repeated orders.'],
        ['$= \\frac{n!}{r!(n - r)!}$.', 'Simplify.'],
    ]],
    'MC-128' => ['Each term of $(a + b)^n$ chooses $a$ or $b$ from every bracket.', 'The coefficient of $a^{n-r}b^r$ in $(a + b)^n$ is $\\binom{n}{r}$.', [
        ['$(a + b)^n$ is $n$ brackets multiplied.', 'Meaning of the power.'],
        ['Expanding takes one letter from each bracket in every possible way.', 'Distributive law.'],
        ['$a^{n-r}b^r$ arises once for each choice of which $r$ brackets give $b$.', 'The rest give $a$.'],
        ['There are $\\binom{n}{r}$ such choices.', 'Choosing $r$ from $n$.'],
    ]],
    'MC-129' => ['Multiply the series by $r$ and subtract: almost everything cancels.', '$S_n = \\frac{a(1 - r^n)}{1 - r}$ for a GP, and $S_\\infty = \\frac{a}{1 - r}$ when $|r| < 1$.', [
        ['$S_n = a + ar + \\dots + ar^{n-1}$.', 'Definition.'],
        ['$rS_n = ar + ar^2 + \\dots + ar^n$.', 'Multiply every term by $r$.'],
        ['$S_n - rS_n = a - ar^n$, so $S_n = \\frac{a(1 - r^n)}{1 - r}$.', 'All middle terms cancel; divide by $1 - r$.'],
        ['If $|r| < 1$, $r^n \\to 0$, so $S_\\infty = \\frac{a}{1 - r}$.', 'Repeated multiplication by a fraction shrinks to zero.'],
    ]],
    'MC-134' => ['The inverse undoes the matrix, so it must multiply to $I$.', 'For $M = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$, $M^{-1} = \\frac{1}{ad - bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$.', [
        ['$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix} = \\begin{pmatrix} ad - bc & 0 \\\\ 0 & ad - bc \\end{pmatrix}$.', 'Multiply row by column.'],
        ['$= (ad - bc)I$.', 'Factor out the determinant.'],
        ['Divide by $ad - bc$ (not zero) to get $I$.', 'Scaling a product by $\\frac{1}{k}$.'],
        ['So that matrix is $M^{-1}$; if $ad - bc = 0$ there is none.', 'Definition of the inverse.'],
    ]],
    'MC-139' => ['The dot product measures how much two arrows point the same way.', '$\\mathbf{a} \\cdot \\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta$.', [
        ['$|\\mathbf{a} - \\mathbf{b}|^2 = |\\mathbf{a}|^2 + |\\mathbf{b}|^2 - 2|\\mathbf{a}||\\mathbf{b}|\\cos\\theta$.', 'Cosine rule on the triangle the vectors make.'],
        ['$|\\mathbf{a} - \\mathbf{b}|^2 = (\\mathbf{a} - \\mathbf{b}) \\cdot (\\mathbf{a} - \\mathbf{b}) = |\\mathbf{a}|^2 + |\\mathbf{b}|^2 - 2\\mathbf{a} \\cdot \\mathbf{b}$.', 'Expand the dot product of a vector with itself.'],
        ['$2\\mathbf{a} \\cdot \\mathbf{b} = 2|\\mathbf{a}||\\mathbf{b}|\\cos\\theta$.', 'Compare the two expressions for one length.'],
        ['$\\mathbf{a} \\cdot \\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta$.', 'Divide by 2.'],
    ]],
    'MC-141' => ['A radian is the angle whose arc equals the radius, so arcs are $r\\theta$.', 'Arc length $s = r\\theta$ ($\\theta$ in radians).', [
        ['A full turn has arc $2\\pi r$ and angle $2\\pi$ radians.', 'Circumference; definition of radian.'],
        ['Arc length is proportional to the angle.', 'Equal angles cut equal arcs.'],
        ['So $\\frac{s}{2\\pi r} = \\frac{\\theta}{2\\pi}$.', 'The same fraction of a full turn.'],
        ['$s = r\\theta$.', 'Multiply by $2\\pi r$.'],
    ]],
    'MC-143' => ['$\\sin^2\\theta + \\cos^2\\theta = 1$ is Pythagoras on the unit circle.', '$\\sin^2\\theta + \\cos^2\\theta = 1$.', [
        ['The point at angle $\\theta$ on the unit circle is $(\\cos\\theta, \\sin\\theta)$.', 'Definition of sine and cosine.'],
        ['Its distance from the origin is 1.', 'Unit circle.'],
        ['$\\cos^2\\theta + \\sin^2\\theta = 1^2$.', 'Pythagoras (distance formula).'],
        ['Dividing by $\\cos^2\\theta$ gives $1 + \\tan^2\\theta = \\sec^2\\theta$.', 'Divide both sides.'],
    ]],
    'MC-144' => ['Double-angle formulae are compound angles with $B = A$.', '$\\sin 2A = 2\\sin A\\cos A$.', [
        ['$\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B$.', 'The compound-angle formula.'],
        ['Put $B = A$.', 'It holds for every pair of angles.'],
        ['$\\sin 2A = \\sin A\\cos A + \\cos A\\sin A$.', 'Substitute.'],
        ['$= 2\\sin A\\cos A$.', 'The two terms are equal.'],
    ]],
    'MC-146' => ['Two waves of the same period add to one wave.', '$a\\sin x + b\\cos x = R\\sin(x + \\alpha)$ with $R = \\sqrt{a^2 + b^2}$.', [
        ['$R\\sin(x + \\alpha) = R\\cos\\alpha\\sin x + R\\sin\\alpha\\cos x$.', 'Compound-angle formula.'],
        ['Match: $R\\cos\\alpha = a$, $R\\sin\\alpha = b$.', 'Equal coefficients of $\\sin x$ and $\\cos x$.'],
        ['$R^2(\\cos^2\\alpha + \\sin^2\\alpha) = a^2 + b^2$, so $R = \\sqrt{a^2 + b^2}$.', 'Square and add; $\\sin^2 + \\cos^2 = 1$.'],
        ['$\\tan\\alpha = \\frac{b}{a}$.', 'Divide the two matching equations.'],
    ]],
    'MC-147' => ['A circle is every point at one distance from the centre.', 'The circle with centre $(a, b)$ and radius $r$ is $(x - a)^2 + (y - b)^2 = r^2$.', [
        ['$(x, y)$ is on the circle exactly when its distance from $(a, b)$ is $r$.', 'Definition of a circle.'],
        ['That distance is $\\sqrt{(x - a)^2 + (y - b)^2}$.', 'Distance formula.'],
        ['$\\sqrt{(x - a)^2 + (y - b)^2} = r$.', 'Set them equal.'],
        ['$(x - a)^2 + (y - b)^2 = r^2$.', 'Square both sides (both are positive).'],
    ]],
    'MC-151' => ['A limit is where a function is heading, not where it is.', '$\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2} = 4$.', [
        ['At $x = 2$ the fraction is $\\frac{0}{0}$, which has no value.', 'Division by zero is undefined.'],
        ['For $x \\ne 2$, $\\frac{x^2 - 4}{x - 2} = \\frac{(x - 2)(x + 2)}{x - 2} = x + 2$.', 'Difference of two squares; cancel a non-zero factor.'],
        ['As $x$ gets close to 2, $x + 2$ gets close to 4.', 'A polynomial is continuous.'],
        ['So the limit is 4.', 'The limit only looks near 2, never at 2.'],
    ]],
    'MC-152' => ['The tangent’s gradient is the limit of chord gradients.', '$\\frac{d}{dx}x^2 = 2x$.', [
        ['The chord from $x$ to $x + h$ has gradient $\\frac{(x + h)^2 - x^2}{h}$.', 'Rise over run.'],
        ['$= \\frac{2xh + h^2}{h}$.', 'Expand $(x + h)^2$.'],
        ['$= 2x + h$ for $h \\ne 0$.', 'Cancel $h$.'],
        ['As $h \\to 0$ this tends to $2x$.', 'The chord turns into the tangent.'],
    ]],
    'MC-153' => ['The power rule is first principles plus the binomial theorem.', '$\\frac{d}{dx}x^n = nx^{n-1}$ (whole $n$).', [
        ['$(x + h)^n = x^n + nx^{n-1}h + (\\text{terms with } h^2, h^3, \\dots)$.', 'Binomial theorem.'],
        ['$\\frac{(x + h)^n - x^n}{h} = nx^{n-1} + (\\text{terms with } h, h^2, \\dots)$.', 'Subtract $x^n$ and divide by $h$.'],
        ['As $h \\to 0$ every term with a factor $h$ tends to 0.', 'They are multiples of $h$.'],
        ['So $\\frac{d}{dx}x^n = nx^{n-1}$.', 'Definition of the derivative.'],
    ]],
    'MC-154' => ['The product rule: grow a rectangle in both directions.', '$(uv)\' = u\'v + uv\'$.', [
        ['Picture $uv$ as a rectangle with sides $u$ and $v$.', 'Area as a product.'],
        ['When $x$ grows a little, the sides grow by $\\delta u$ and $\\delta v$.', 'Both factors depend on $x$.'],
        ['The new area adds $v\\,\\delta u + u\\,\\delta v + \\delta u\\,\\delta v$.', 'Two strips and a tiny corner.'],
        ['Divide by $\\delta x$ and let it shrink: $u\'v + uv\'$.', 'The corner is a product of two small changes, so it vanishes.'],
    ]],
    'MC-157' => ['At a smooth maximum or minimum the tangent is flat.', 'At a turning point, $\\frac{dy}{dx} = 0$.', [
        ['Just before a maximum the curve rises: gradient positive.', 'Going up to the top.'],
        ['Just after, it falls: gradient negative.', 'Coming down.'],
        ['The gradient changes continuously for a smooth curve.', 'Polynomials have no jumps in gradient.'],
        ['So at the top it passes through $0$.', 'Going from positive to negative it must pass zero.'],
    ]],
    'MC-159' => ['Integration adds up thin strips; the antiderivative counts them all at once.', 'Area under $y = f(x)$ from $a$ to $b$ is $F(b) - F(a)$, where $F\' = f$.', [
        ['Let $A(x)$ be the area from $a$ to $x$.', 'Definition.'],
        ['Moving from $x$ to $x + h$ adds a thin strip of area about $f(x)h$.', 'Height $f(x)$, width $h$.'],
        ['So $\\frac{A(x + h) - A(x)}{h} \\to f(x)$, i.e. $A\' = f$.', 'Divide by $h$ and let it shrink.'],
        ['$A(x) = F(x) - F(a)$, so the area is $F(b) - F(a)$.', 'Two antiderivatives differ by a constant, and $A(a) = 0$.'],
    ]],
    'MC-162' => ['The suvat equations are the area under a straight velocity–time graph.', '$s = ut + \\frac{1}{2}at^2$.', [
        ['With constant acceleration, $v = u + at$.', 'Velocity rises by $a$ each second.'],
        ['Displacement is the area under the velocity–time graph.', 'Distance = speed × time, strip by strip.'],
        ['That area is a rectangle $ut$ plus a triangle $\\frac{1}{2}t \\times at$.', 'The graph is a straight line from $u$ to $u + at$.'],
        ['$s = ut + \\frac{1}{2}at^2$.', 'Add the two areas.'],
    ]],
    'MC-165' => ['Equal and opposite forces for equal time give equal and opposite impulses.', 'In a collision with no outside force, total momentum is conserved.', [
        ['During contact, A pushes B with force $F$ and B pushes A with $-F$.', 'Newton’s third law.'],
        ['B’s momentum changes by $Ft$ and A’s by $-Ft$.', 'Impulse = force × time = change in momentum.'],
        ['The two changes add to zero.', '$Ft + (-Ft) = 0$.'],
        ['So total momentum after equals total before.', 'No net change.'],
    ]],
    'MC-166' => ['Conditioning shrinks the sample space to what we know happened.', '$P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}$.', [
        ['Given $B$ happened, only outcomes in $B$ are possible.', 'The new sample space is $B$.'],
        ['$A$ happens within that only through $A \\cap B$.', 'Outcomes in both.'],
        ['Probabilities inside $B$ keep their relative sizes.', 'Knowing $B$ rules things out, it does not favour any remaining outcome.'],
        ['So $P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}$.', 'Rescale so the probabilities in $B$ add to 1.'],
    ]],
    'MC-168' => ['Induction is a row of dominoes: the first falls, and each knocks the next.', '$1 + 2 + \\dots + n = \\frac{n(n + 1)}{2}$ for all $n \\ge 1$.', [
        ['For $n = 1$: $1 = \\frac{1 \\times 2}{2}$.', 'Base case.'],
        ['Assume $1 + \\dots + k = \\frac{k(k + 1)}{2}$.', 'Inductive hypothesis.'],
        ['Then $1 + \\dots + k + (k + 1) = \\frac{k(k + 1)}{2} + (k + 1) = \\frac{(k + 1)(k + 2)}{2}$.', 'Add the next term and factorise.'],
        ['So it holds for every $n \\ge 1$.', 'True for 1, and each case carries it to the next.'],
    ]],
    'MC-170' => ['Newton–Raphson slides down the tangent to the axis.', '$x_{n+1} = x_n - \\frac{f(x_n)}{f\'(x_n)}$.', [
        ['The tangent at $x_n$ has gradient $f\'(x_n)$ and passes through $(x_n, f(x_n))$.', 'Meaning of the derivative.'],
        ['Its equation is $y = f(x_n) + f\'(x_n)(x - x_n)$.', 'Point–gradient form.'],
        ['It meets $y = 0$ where $x = x_n - \\frac{f(x_n)}{f\'(x_n)}$.', 'Set $y = 0$ and solve.'],
        ['Near a root the tangent hugs the curve, so that point is a better estimate.', 'A smooth curve looks straight close up.'],
    ]],
    ];
}

/* ── Questions generated from the proofs ─────────────────────────────────── */

/** id → [justify form, order form] for every topic with a proof. */
function mlb_why_forms(): array {
    $out = [];
    foreach (array_keys(mlb_why()) as $id) $out[$id] = [
        static fn(MlbRng $r) => mlb_why_justify($id, $r),
        static fn(MlbRng $r) => mlb_why_order($id, $r),
    ];
    return $out;
}

/**
 * "Why is line k true?" — the argument is shown line by line, and the options are
 * reasons. The wrong options are the OTHER reasons from the same argument (each is
 * a true reason for a different line, which is exactly the confusion worth
 * catching) plus one from another topic’s argument.
 */
function mlb_why_justify(string $id, MlbRng $r): array {
    [$idea, $claim, $steps] = mlb_why()[$id];
    $k = $r->int(0, count($steps) - 1);
    $wrong = [];
    foreach ($steps as $j => $st) if ($j !== $k) $wrong[] = [$st[1], 'That is the reason for line ' . ($j + 1) . ', not line ' . ($k + 1) . '.'];
    $ids = array_keys(mlb_why()); $pos = array_search($id, $ids, true);
    $other = mlb_why()[$ids[($pos + 1 + $r->int(0, 4)) % count($ids)]][2];
    $alien = $other[$r->int(0, count($other) - 1)][1];
    $wrong = array_slice($r->shuffle($wrong), 0, 3);
    if (count($wrong) < 3 && !in_array($alien, array_column($steps, 1), true)) $wrong[] = [$alien, 'That reason belongs to a different argument.'];
    return mlb_mcq($r, 'Why it works: ' . $claim . ' Here is the argument. Why is line ' . ($k + 1) . ' true?', $steps[$k][1], $wrong,
        array_merge(['Line ' . ($k + 1) . ' is true because: ' . $steps[$k][1]], array_map(static fn($s, $i) => ($i + 1) . '. ' . $s[0] . ' — ' . $s[1], $steps, array_keys($steps))),
        'Read the line before it: what does this line use?', 'reasoning', 60, ['lines' => array_column($steps, 0)]);
}

/** "Put the argument in order" — the statements shuffled; the learner orders them (no dragging: move buttons). */
function mlb_why_order(string $id, MlbRng $r): array {
    [$idea, $claim, $steps] = mlb_why()[$id];
    $n = count($steps); $perm = range(0, $n - 1);
    do { $perm = $r->shuffle($perm); } while ($perm === range(0, $n - 1));
    $options = array_map(static fn($i) => $steps[$i][0], $perm);
    $key = array_map(static fn($i) => array_search($i, $perm, true), range(0, $n - 1));   // correct order, as option indexes
    return ['kind' => 'order', 'stem' => 'Why it works: ' . $claim . ' Put the steps of the argument in order.', 'options' => $options, 'key' => $key,
        'steps' => array_merge(['Each line uses only what comes before it:'], array_map(static fn($s, $i) => ($i + 1) . '. ' . $s[0] . ' — ' . $s[1], $steps, array_keys($steps))),
        'hint' => 'Find the line that needs nothing else first. ' . $idea, 'dim' => 'reasoning', 'secs' => 75, 'typed' => false];
}
