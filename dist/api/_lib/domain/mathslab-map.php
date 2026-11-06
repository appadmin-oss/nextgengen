<?php
declare(strict_types=1);

/**
 * Maths Lab — the map (docs/MATH-LAB-PLAN.md §7).
 *
 * 17 stages × 10 competencies, MC-001 … MC-170, from the owner's curriculum,
 * in its order — and above it the Gods of Maths summit, Stages 18–20 (MC-171 … MC-200). This file is the ONE place a competency's id, stage, title,
 * strand and prerequisites are declared; the engine, the screens and the
 * courses all read it.
 *
 * Prerequisites: Stages 5–7 carry the reviewed draft from the plan
 * (Appendix C). Every other stage uses the default rule until its own graph
 * is written — each competency needs the one before it in its stage, and a
 * stage's first competency needs the last of the stage before. A prerequisite
 * that has no questions yet (a stage still in preparation) never blocks.
 */

/** Stage number → [stage title, [10 competency titles in order]] — the Maths Lab's (LABS['maths']['content']['stages']). */
function mlb_maths_stage_table(): array {
    static $t = null;
    if ($t !== null) return $t;
    return $t = [
        1 => ['Number Consciousness', [
            'One-to-one correspondence and counting objects',
            'Why 1 + 1 = 2: combining quantities',
            'Zero, nothingness and the additive identity',
            'Numerals, number names and symbols',
            'Counting forwards and backwards',
            'More than, less than and equal to',
            'Ordering and comparing whole numbers',
            'Number lines and number positions',
            'Units, tens, hundreds and place value',
            'Decomposing and reconstructing numbers',
        ]],
        2 => ['Arithmetic Foundations', [
            'Addition and its properties',
            'Subtraction as removal and difference',
            'Regrouping and borrowing through place value',
            'Multiplication as equal groups and arrays',
            'Multiplication tables through reasoning',
            'Division as sharing and grouping',
            'Division with remainders',
            'Relationship between the four operations',
            'Factors, multiples and divisibility tests',
            'Prime numbers, HCF and LCM',
        ]],
        3 => ['The Number System', [
            'Positive and negative numbers',
            'Integer addition and subtraction',
            'Integer multiplication and division',
            'BODMAS and order of operations',
            'Fractions as parts, measures and quotients',
            'Equivalent fractions and simplification',
            'Operations on fractions and mixed numbers',
            'Decimals and place-value extensions',
            'Decimal operations and conversions',
            'Percentages and fraction-decimal-percentage fluency',
        ]],
        4 => ['Applied Arithmetic', [
            'Ratios and equivalent ratios',
            'Direct proportions and unit rates',
            'Inverse proportions and shared work',
            'Unit conversions and dimensional thinking',
            'Estimation, rounding and significant figures',
            'Error bounds and numerical approximation',
            'Profit, loss, discounts and commissions',
            'Simple interest and compound interest',
            'Rates, speed, distance, time and density',
            'Word problems and multi-step mathematical modelling',
        ]],
        5 => ['The Language of Algebra', [
            'Patterns and unknown quantities',
            'Letters as variables and constants',
            'Algebraic terms, coefficients and expressions',
            'Like terms and simplification',
            'Distributive law and expansion of brackets',
            'Algebraic substitution and evaluation',
            'Equality and balance principles',
            'One-step linear equations',
            'Multi-step linear equations',
            'Algebraic word problems and formula construction',
        ]],
        6 => ['Algebraic Structures', [
            'Transposition and change of subject of formula',
            'Linear inequalities and number-line solutions',
            'Simultaneous linear equations by substitution',
            'Simultaneous equations by elimination',
            'Graphical solution of linear equations',
            'Factorisation by common factors',
            'Factorisation by grouping',
            'Difference of two squares and algebraic identities',
            'Algebraic fractions and rational expressions',
            'Direct, inverse, joint and partial variation',
        ]],
        7 => ['Powers, Roots and Patterns', [
            'Squares, cubes and higher powers',
            'Roots and inverse operations',
            'Laws of indices',
            'Zero, negative and fractional indices',
            'Scientific notation and standard form',
            'Surds and simplification',
            'Operations on surds and rationalisation',
            'Logarithms as inverse powers',
            'Laws of logarithms and logarithmic equations',
            'Sequences, arithmetic and geometric progressions',
        ]],
        8 => ['Geometry Foundations', [
            'Points, lines, rays, planes and segments',
            'Angles and angle measurement',
            'Parallel lines, transversals and angle relationships',
            'Triangles and angle properties',
            'Quadrilaterals and polygons',
            'Congruence, similarity and scale',
            'Pythagoras\' theorem and applications',
            'Circle terminology, arcs and sectors',
            'Circle angle theorems',
            'Geometric constructions, loci and elementary proof',
        ]],
        9 => ['Measurement and Spatial Reasoning', [
            'Length, perimeter and compound shapes',
            'Areas of triangles and quadrilaterals',
            'Area of circles, sectors and composite figures',
            'Surface area of prisms, cylinders and cones',
            'Volumes of prisms, cylinders, cones and pyramids',
            'Sphere and hemisphere mensuration',
            'Bearings and compass directions',
            'Scale drawing, maps and enlargement',
            'Reflection, rotation, translation and symmetry',
            'Three-dimensional visualisation and spatial problems',
        ]],
        10 => ['Graphs and Coordinate Geometry', [
            'Cartesian coordinates and quadrants',
            'Plotting and interpreting data graphs',
            'Gradient as rate of change',
            'Equation of a straight line',
            'Parallel and perpendicular lines',
            'Midpoint and distance formulae',
            'Linear inequalities in two variables',
            'Quadratic graphs and their features',
            'Graphical intersections and equation solving',
            'Graph transformations and interpreting functions',
        ]],
        11 => ['Advanced Secondary Algebra', [
            'Quadratic factorisation and zero-product principle',
            'Completing the square',
            'Quadratic formula and discriminant',
            'Nature, sum and product of quadratic roots',
            'Simultaneous linear-quadratic equations',
            'Quadratic inequalities and optimisation',
            'Polynomial operations and long division',
            'Remainder theorem and factor theorem',
            'Cubic equations and polynomial graphs',
            'Number bases, binary arithmetic and modular arithmetic',
        ]],
        12 => ['Trigonometry, Statistics and Probability', [
            'Right-triangle sine, cosine and tangent',
            'Special angles and trigonometric ratios',
            'Angles of elevation and depression',
            'Sine rule and cosine rule',
            'Area of triangles using trigonometry',
            'Trigonometric applications to bearings and distances',
            'Data collection, frequency tables and charts',
            'Mean, median, mode and weighted averages',
            'Range, quartiles, variance and standard deviation',
            'Probability, sample spaces and combined events',
        ]],
        13 => ['Further Algebra and Mathematical Logic', [
            'Set theory, three-set Venn diagrams and De Morgan\'s laws',
            'Propositions, connectives and truth tables',
            'Binary operations, identities and inverses',
            'Functions, domains, ranges and mappings',
            'Composite and inverse functions',
            'Rational functions and partial fractions',
            'Permutations, combinations and factorials',
            'Binomial theorem and expansion',
            'Arithmetic and geometric series, including infinite GP',
            'Linear programming and constrained optimisation',
        ]],
        14 => ['Matrices, Vectors and Transformations', [
            'Matrices, dimensions and classification',
            'Matrix arithmetic and multiplication',
            'Determinants of 2x2 and 3x3 matrices',
            'Inverse matrices and linear systems',
            'Linear transformations and their matrices',
            'Composition and inverse transformations',
            'Vector magnitude, direction and notation',
            'Vector addition, subtraction and scalar multiplication',
            'Position vectors, dot products and geometric applications',
            'Vector resolution, projections and equilibrium',
        ]],
        15 => ['Advanced Trigonometry and Analytic Geometry', [
            'Radian measure, arc length and sector area',
            'Trigonometric functions of general angles',
            'Reciprocal ratios and fundamental identities',
            'Compound-angle and multiple-angle formulae',
            'Trigonometric equations and graphs',
            'Harmonic expressions and trigonometric modelling',
            'Equation of a circle and circle geometry',
            'Tangents, normals and intersections of circles',
            'Parabolas and elementary conic sections',
            'Coordinate geometry of lines, curves and intersections',
        ]],
        16 => ['Calculus and Mathematical Analysis', [
            'Limits and continuity: intuitive foundations',
            'Differentiation from first principles',
            'Differentiation of powers and polynomials',
            'Product, quotient and chain rules',
            'Trigonometric, exponential and logarithmic derivatives',
            'Implicit differentiation and related rates',
            'Stationary points, maxima, minima and curve sketching',
            'Antiderivatives and indefinite integration',
            'Definite integration, substitution and area under curves',
            'Volumes of revolution and numerical integration',
        ]],
        17 => ['Further Mathematics, Mechanics and Beyond', [
            'Displacement, velocity, acceleration and motion graphs',
            'Kinematics equations and calculus of motion',
            'Forces, free-body diagrams and Newton\'s laws',
            'Moments, equilibrium, friction and connected particles',
            'Momentum, impulse and conservation laws',
            'Advanced probability, conditional probability and distributions',
            'Correlation, regression and statistical inference foundations',
            'Mathematical induction, proof and rigorous reasoning',
            'Differential equations and introductory multivariable calculus',
            'Capstone mathematical modelling, numerical methods and research',
        ]],
        /* Gods of Maths (owner, 5 Nov 2026): the olympiad summit above the 170-point framework. */
        18 => ['The Theory of Numbers', [
            'Divisors, primes and the fundamental theorem of arithmetic',
            'GCD, LCM, the Euclidean algorithm and Bézout',
            'Modular arithmetic and congruences',
            'Fermat\'s little theorem and Euler\'s theorem',
            'Linear congruences and the Chinese remainder theorem',
            'Linear Diophantine equations and the coin problem',
            'Legendre\'s formula: prime powers in factorials',
            'Digit sums, divisibility tests and number bases',
            'Euler\'s totient and multiplicative functions',
            'Factoring tricks for Diophantine equations',
        ]],
        19 => ['Counting like a God', [
            'Counting principles, complements and casework',
            'Arrangements, repetition and restrictions',
            'Stars and bars: sharing out identical things',
            'Inclusion–exclusion and derangements',
            'The pigeonhole principle',
            'Binomial coefficients and their identities',
            'Lattice paths and the Catalan numbers',
            'Recurrences in counting',
            'Expected value and linearity of expectation',
            'Invariants, parity and colouring arguments',
        ]],
        20 => ['The Summit: Olympiad Algebra, Inequalities and Geometry', [
            'Vieta\'s formulas and symmetric functions of roots',
            'Telescoping sums and products',
            'The AM–GM inequality and optimisation',
            'Cauchy–Schwarz and the square-mean inequality',
            'Functional equations',
            'Polynomials: values, remainders and coefficients',
            'Complex numbers, the Argand diagram and De Moivre',
            'Power of a point and circle geometry',
            'Triangle centres: Heron, the inradius and the circumradius',
            'Proof and problem-solving strategies',
        ]],
    ];
}

/** Each stage's strand — the "road" view of the map. */
function mlb_maths_strands(): array { return MLB_STAGE_STRAND; }
const MLB_STAGE_STRAND = [1 => 'Number', 2 => 'Number', 3 => 'Number', 4 => 'Number', 5 => 'Algebra', 6 => 'Algebra', 7 => 'Algebra',
    8 => 'Geometry & Measure', 9 => 'Geometry & Measure', 10 => 'Graphs & Functions', 11 => 'Algebra', 12 => 'Statistics & Trigonometry',
    13 => 'Further Algebra', 14 => 'Matrices & Vectors', 15 => 'Trigonometry & Analytic Geometry', 16 => 'Calculus', 17 => 'Mechanics & Beyond',
    18 => 'Olympiad Number Theory', 19 => 'Olympiad Combinatorics', 20 => 'Olympiad Algebra & Geometry'];

/**
 * The 170-Point Mathematics Mastery Framework in five bands: where each stage sits on the road
 * from arithmetic through WAEC and Further Mathematics to beyond. One table; the map, the Lite
 * page and the Progress screen all read it (CLAUDE.md §11 — never a second list).
 */
const MLB_BANDS = [
    ['id' => 'foundations', 'name' => 'Foundations', 'level' => 'Primary', 'from' => 1, 'to' => 4,
     'what' => 'Why numbers work: counting, place value, the four operations, fractions, ratio and everyday arithmetic.'],
    ['id' => 'junior', 'name' => 'Algebra and number', 'level' => 'JSS · Junior school', 'from' => 5, 'to' => 7,
     'what' => 'Letters for numbers, equations as balances, factorisation, indices, surds, logarithms and sequences.'],
    ['id' => 'waec', 'name' => 'Senior core', 'level' => 'SSS · Senior Mathematics', 'from' => 8, 'to' => 12,
     'what' => 'Geometry and mensuration, graphs, quadratics, polynomials, trigonometry and statistics.'],
    ['id' => 'further', 'name' => 'Further Mathematics', 'level' => 'SSS · Further Mathematics', 'from' => 13, 'to' => 16,
     'what' => 'Sets and logic, functions, series, matrices, vectors, advanced trigonometry, conics and calculus.'],
    ['id' => 'beyond', 'name' => 'Beyond', 'level' => 'Mechanics · university · research', 'from' => 17, 'to' => 17,
     'what' => 'Mechanics, probability distributions, proof by induction, differential equations and modelling.'],
    /* The summit above the framework: tough problems, each with a hint that names the idea and a
       full worked solution (owner: "Make things tough, but easy"). */
    ['id' => 'gods', 'name' => 'Gods of Maths', 'level' => 'Olympiad and competition level', 'from' => 18, 'to' => 20, 'summit' => true,
     'what' => 'Number theory, counting, inequalities, functional equations and olympiad geometry — problems that need an idea, not a formula.'],
];
function mlb_maths_bands(): array { return MLB_BANDS; }
function mlb_maths_edges(): array { return MLB_EDGES; }

/** The reviewed draft edges for Stages 5–7 (plan Appendix C). Competency number → numbers it needs. */
const MLB_EDGES = [
    41 => [15, 18], 42 => [41], 43 => [42, 23], 44 => [43, 22], 45 => [44, 23], 46 => [43, 24], 47 => [42, 18], 48 => [47, 22],
    49 => [48, 45, 27], 50 => [49, 40], 51 => [49], 52 => [49, 8, 21], 53 => [49, 46], 54 => [53, 44], 55 => [53, 91, 94],
    56 => [45, 19], 57 => [56], 58 => [56, 61], 59 => [56, 27], 60 => [32, 33, 51], 61 => [14, 15], 62 => [61], 63 => [61, 43],
    64 => [63, 27, 62], 65 => [64, 28, 35], 66 => [62, 20], 67 => [66, 45, 58], 68 => [64], 69 => [68, 63, 49], 70 => [41, 46, 63],
    71 => [34], 76 => [74, 31], 77 => [74, 62], 78 => [72, 25], 81 => [34, 75], 83 => [82, 78], 86 => [85, 63], 87 => [72], 88 => [76, 31],
    91 => [21, 8], 93 => [91, 32], 94 => [93, 51], 96 => [91, 77], 97 => [94, 52], 98 => [91, 58], 99 => [94, 98, 53], 101 => [58, 57],
    102 => [101, 61], 103 => [102, 66], 105 => [101, 53], 106 => [101, 52], 107 => [45, 59], 110 => [61, 9], 111 => [77, 27], 112 => [111, 66],
    114 => [111, 74], 115 => [114, 82], 116 => [114, 87], 117 => [92], 119 => [118, 62], 120 => [26, 30], 123 => [45], 124 => [91, 46],
    126 => [59, 107], 127 => [120], 128 => [127, 45], 129 => [70], 130 => [97], 131 => [43], 134 => [133, 53], 135 => [132, 91], 137 => [77, 91],
    140 => [139, 111], 141 => [83, 112], 142 => [112], 145 => [142, 103], 147 => [96, 102], 148 => [147, 95], 149 => [98], 150 => [148, 105],
    151 => [124], 152 => [151, 93], 153 => [152, 63], 155 => [154, 142, 68], 157 => [153, 98], 158 => [153], 160 => [159, 86],
    161 => [93, 92], 162 => [161, 158], 163 => [138], 165 => [163], 166 => [120, 128], 167 => [119, 94], 168 => [129], 169 => [158, 156], 170 => [157, 159],
    // Gods of Maths: each olympiad topic rests on the school topics it grows from, not on the capstone.
    171 => [20, 19], 172 => [171, 20], 173 => [172, 110], 174 => [173, 63], 175 => [173, 172], 176 => [172, 54], 177 => [171, 127], 178 => [173, 110], 179 => [174, 171], 180 => [176, 58],
    181 => [127, 9], 182 => [181, 127], 183 => [182], 184 => [183, 121], 185 => [181], 186 => [128, 183], 187 => [186], 188 => [181, 70], 189 => [166, 181], 190 => [185, 168],
    191 => [104, 109], 192 => [129, 59], 193 => [106, 66], 194 => [193, 139], 195 => [125, 168], 196 => [108, 191], 197 => [191, 142], 198 => [79, 76], 199 => [115, 198], 200 => [168, 190],
];

/** Maths topic ids carry the Maths Lab's prefix from the Lab registry (domain/labs.php). */
const MLB_PREFIX = 'MC';

/* ── The map, for whichever Lab this request is about (labs.php: lab_use / lab_call) ──
 * Every reader below goes through the registry, never through a subject's own function, so the
 * engine draws the Maths map and the Physics map with the same code. A topic id resolves through
 * its OWN prefix (lab_for_comp), whatever Lab the request is in. */
function mlb_stage_table(?string $lab = null): array { return lab_call('stages', $lab); }
function mlb_strands(?string $lab = null): array { return lab_call('strands', $lab); }
function mlb_bands(?string $lab = null): array { return lab_call('bands', $lab); }
function mlb_edges(?string $lab = null): array { return lab_call('edges', $lab); }
function mlb_band(int $stage, ?string $lab = null): array {
    $bands = mlb_bands($lab);
    foreach ($bands as $b) if ($stage >= $b['from'] && $stage <= $b['to']) return $b;
    return $bands[0] ?? ['id' => 'all', 'name' => '', 'level' => '', 'from' => 1, 'to' => 1, 'what' => ''];
}
function mlb_prefix(?string $lab = null): string { return ($lab !== null ? LABS[$lab] : lab_cur())['prefix']; }
function mlb_id(int $n, ?string $lab = null): string { return mlb_prefix($lab) . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT); }
/** A topic's number within its own Lab (MC-042 → 42, PH-007 → 7); 0 for anything else. */
function mlb_num(string $id): int { return lab_for_comp($id) && preg_match(LAB_COMP_RE, $id, $m) ? (int)$m[2] : 0; }

/** Every competency of a Lab (the current one by default): id → {id, n, stage, title, strand, needs[]}. */
function mlb_competencies(?string $lab = null): array {
    static $all = [];
    $lab ??= lab_id();
    if (isset($all[$lab])) return $all[$lab];
    $out = []; $edges = mlb_edges($lab); $strands = mlb_strands($lab);
    $id = static fn(int $n) => mlb_id($n, $lab);
    foreach (mlb_stage_table($lab) as $stage => [$stTitle, $titles]) {
        foreach ($titles as $i => $title) {
            $n = ($stage - 1) * 10 + $i + 1;
            $needs = $edges[$n] ?? ($i > 0 ? [$n - 1] : ($stage > 1 ? [$n - 1] : []));
            $out[$id($n)] = ['id' => $id($n), 'n' => $n, 'stage' => $stage, 'title' => $title,
                'strand' => (string)($strands[$stage] ?? ''), 'needs' => array_map($id, $needs)];
        }
    }
    return $all[$lab] = $out;
}

/** One topic, from ITS Lab (by prefix), whichever Lab the request is in. */
function mlb_comp(string $id): ?array { $l = lab_for_comp($id); return $l ? (mlb_competencies($l['id'])[$id] ?? null) : null; }

/** Stage number → {n, title, strand, comps[]}, for the current Lab. */
function mlb_stages(?string $lab = null): array {
    $out = []; $strands = mlb_strands($lab);
    foreach (mlb_stage_table($lab) as $stage => [$title]) $out[$stage] = ['n' => $stage, 'title' => $title, 'strand' => (string)($strands[$stage] ?? ''), 'comps' => []];
    foreach (mlb_competencies($lab) as $c) $out[$c['stage']]['comps'][] = $c['id'];
    return $out;
}

/** The question forms of a topic's own Lab. */
function mlb_forms_of(string $id): array { $l = lab_for_comp($id); return $l ? (lab_call('forms', $l['id'])[$id] ?? []) : []; }
/** The forms of the current Lab (every topic id → its forms). */
function mlb_forms(): array { return lab_call('forms'); }
/** Is this competency taught (it has question forms)? */
function mlb_available(string $id): bool { return mlb_forms_of($id) !== []; }
function mlb_stage_available(int $stage): bool {
    foreach (mlb_stages()[$stage]['comps'] ?? [] as $id) if (!mlb_available($id)) return false;
    return isset(mlb_stages()[$stage]);
}
/** The courses of the current Lab. */
function mlb_courses(?string $lab = null): array { return lab_call('courses', $lab); }

/**
 * Courses (plan §6.3): an ordered path through the map with a promise and a
 * certificate. They never fork the map — a competency mastered once counts in
 * every course that holds it.
 */
function mlb_maths_courses(): array {
    return [
        'number-foundations' => ['id' => 'number-foundations', 'title' => 'Number Foundations', 'stages' => [1, 2, 3, 4],
            'promise' => 'Counting, place value, the four operations, fractions, decimals, percentages and everyday arithmetic — rebuilt so every later topic has something solid to stand on.',
            'for' => 'Primary and JSS learners, and anyone with gaps', 'hours' => 30],
        'algebra-essentials' => ['id' => 'algebra-essentials', 'title' => 'Algebra Essentials', 'stages' => [5, 6, 7],
            'promise' => 'From patterns and letters to equations, factorisation, indices, surds and logarithms — the language the rest of mathematics is written in.',
            'for' => 'JSS 2 to SS 1', 'hours' => 30],
        'shape-space' => ['id' => 'shape-space', 'title' => 'Shape, Space & Measure', 'stages' => [8, 9, 10],
            'promise' => 'Angles, triangles, circles, mensuration, bearings and coordinate graphs.', 'for' => 'JSS 3 to SS 2', 'hours' => 30],
        'senior-maths' => ['id' => 'senior-maths', 'title' => 'Senior Secondary Mathematics', 'stages' => [11, 12],
            'promise' => 'Quadratics, polynomials, number bases, trigonometry, statistics and probability for the senior school exams.', 'for' => 'SS 1 to SS 3', 'hours' => 25],
        'further-maths' => ['id' => 'further-maths', 'title' => 'Further Mathematics', 'stages' => [13, 14, 15, 16],
            'promise' => 'Logic, functions, matrices, vectors, advanced trigonometry and calculus.', 'for' => 'SS 2 to SS 3 Further Maths', 'hours' => 45],
        'mechanics-beyond' => ['id' => 'mechanics-beyond', 'title' => 'Mechanics & Beyond', 'stages' => [17],
            'promise' => 'Motion, forces, momentum, statistical inference, proof and modelling.', 'for' => 'Enrichment', 'hours' => 20],
        'gods-of-maths' => ['id' => 'gods-of-maths', 'title' => 'Gods of Maths', 'stages' => [18, 19, 20],
            'promise' => 'Olympiad number theory, counting, inequalities, functional equations and geometry — the problems that win medals, solved by ideas you can explain.',
            'for' => 'Olympiad and maths-competition hopefuls', 'hours' => 60],
    ];
}
