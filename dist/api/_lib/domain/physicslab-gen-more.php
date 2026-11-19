<?php
declare(strict_types=1);

/**
 * Physics Lab — the second layer of question forms (audit, 8 Nov 2026: docs/LABS-AUDIT.md §5.1).
 *
 * Sixty-five of the ninety topics had three forms, so practice was three templates on rotation and a
 * learner could answer from the SURFACE ("km/h to m/s: times 5/18") without reading the question. The
 * engine now refuses to repeat (mlb_pick_items), which made a thin topic a SHORT session rather than a
 * repetitive one. The fix is content: every topic reaches at least five forms, at least two of them
 * typed, and the new forms change what is asked, not just the numbers.
 *
 * APPENDED by phy_forms() after each topic's own list, so no form already in use changes its index (a
 * session stores form numbers). A later addition goes at the END of a topic's list here — never between.
 *
 * How the forms were designed, and the evidence for each rule:
 *  · Vary the representation, not only the numbers: calculate, rearrange (solve for another variable),
 *    read a table or graph, spot the error in a worked solution, judge sizes and units, and compare two
 *    situations. Learners who meet a concept in one format often cannot use it in another (Kohl &
 *    Finkelstein 2005, Phys. Rev. ST PER 1, 010104), and varied practice transfers where repeating one
 *    surface does not (Schmidt & Bjork 1992). Novices sort problems by surface features, experts by the
 *    principle (Chi, Feltovich & Glaser 1981): changing the surface is what forces the principle.
 *  · Spot-the-error items show a worked solution with ONE wrong line, its position varying (mlb_error_of).
 *    Finding and explaining errors in worked examples helps transfer once the basics are in place
 *    (Große & Renkl 2007, Learning and Instruction 17).
 *  · Every wrong option is a misconception learners are documented to hold, so a wrong choice says what
 *    went wrong: motion needs a force and a thrown ball carries "the force of the throw" (Clement 1982;
 *    Halloun & Hestenes 1985; the Force Concept Inventory, Hestenes, Wells & Swackhamer 1992), heavier
 *    falls faster, the larger body exerts the larger force in a collision (FCI), current is used up in a
 *    lamp (Shipstone 1984; McDermott & Shaffer 1992), heat and temperature are one thing (Erickson 1979),
 *    particles themselves expand when heated, pressure depends on the amount of liquid.
 *  · Contexts come from pools, from everyday Nigerian life — the danfo and the okada, the borehole pump
 *    and the overhead tank, the generator, PHCN bills, the harmattan — so the same wording does not come
 *    back, and the physics is met where the learner lives.
 *
 * Conventions are physicslab-gen.php's: g = 10 m/s² (N/kg) unless a topic gives another value; a typed
 * answer carries its unit; an answer that needs rounding states the rounding and sets `dp`, so any
 * answer that rounds to the key is right; every answer and every wrong option is DERIVED from the
 * numbers that built the question.
 */

const PHY_VEHICLES = ['danfo', 'BRT bus', 'luxury bus', 'tanker', 'trailer', 'pick-up van'];
const PHY_HOUSES = ['Red House', 'Blue House', 'Green House', 'Yellow House', 'Purple House'];

/** Spot the error, in a named learner's working, so the same numbers do not give the same wording twice
 *  (a stem already naming somebody is left alone). */
function phy_err(MlbRng $r, string $task, array $right, array $variants): array {
    if (!preg_match('/’s working| finds /u', $task)) $task = $r->pick(MLB_NAMES) . '’s working. ' . $task;
    return mlb_error_of($r, $task, $right, $variants);
}

/** A number with a sign, for working lines (+3, −3). */
function phy_sg($x): string { return ($x < 0 ? '−' : '') . phy_p(abs($x)); }

function phy_forms_more(): array {
    static $f = null;
    if ($f !== null) return $f;
    $f = [];
    for ($s = 1; $s <= 9; $s++) if (function_exists('phy_more_' . $s)) $f += ('phy_more_' . $s)();
    return $f;
}

/* ═══ Stage 1 — Measurement and Matter ═══ */
function phy_more_1(): array {
    return [
    'PH-001' => [
        // Typed: sort a list into base and derived quantities, and count.
        static function (MlbRng $r) {
            $base = ['length', 'mass', 'time', 'electric current', 'temperature', 'amount of substance', 'luminous intensity'];
            $der = ['speed', 'force', 'area', 'volume', 'density', 'pressure', 'energy', 'power', 'momentum', 'acceleration'];
            $nb = $r->int(1, 4); $b = array_slice($r->shuffle($base), 0, $nb); $d = array_slice($r->shuffle($der), 0, 6 - $nb);
            $all = $r->shuffle(array_merge($b, $d));
            return phy_num('How many of these are base (fundamental) quantities? ' . implode(', ', $all) . '.', $nb, '',
                ['A base quantity is not defined from other quantities; a derived one is built from them by a formula.', 'Base: ' . implode(', ', $b) . '. Derived: ' . implode(', ', $d) . '.', 'So ' . $nb . ' of them are base quantities.'],
                'For each one, ask: can I write it as a formula of other quantities?', 'concept', 40); },
        // Typed: an everyday measurement written in the SI unit.
        static function (MlbRng $r) {
            $c = $r->int(0, 5);
            if ($c === 0) { $v = $r->int(2, 9) * 5; return phy_num('A football match on the school field lasts ' . $v . ' minutes each half. Write one half in the SI unit of time.', $v * 60, 's', ['The SI unit of time is the second; 1 minute = 60 s.', $v . ' × 60 = ' . ($v * 60) . ' s.'], 'Which unit is SI: the minute or the second?', 'procedure', 30); }
            if ($c === 1) { $v = $r->int(2, 30) * 5; return phy_num('A mother buys ' . $v . '0 g of salt at the market. Write this mass in the SI unit of mass.', $v * 10 / 1000, 'kg', ['The SI unit of mass is the kilogram; 1 kg = 1000 g.', $v . '0 ÷ 1000 = ' . mlb_dec($v * 10 / 1000) . ' kg.'], 'The SI unit of mass is not the gram.', 'procedure', 30); }
            if ($c === 2) { $v = $r->int(15, 95); return phy_num('A tailor cuts ' . $v . ' cm of ankara cloth. Write this length in the SI unit of length.', $v / 100, 'm', ['The SI unit of length is the metre; 1 m = 100 cm.', $v . ' ÷ 100 = ' . mlb_dec($v / 100) . ' m.'], 'The SI unit of length is the metre.', 'procedure', 30); }
            if ($c === 3) { $v = $r->int(2, 12) / 2; return phy_num('An okada ride from Ikorodu to Yaba takes ' . phy_p($v) . ' hours in traffic. Write this time in seconds, the SI unit.', $v * 3600, 's', ['1 hour = 60 × 60 = 3600 s.', phy_p($v) . ' × 3600 = ' . phy_p($v * 3600) . ' s.'], 'How many seconds are in one hour?', 'procedure', 35); }
            if ($c === 4) { $v = $r->int(10, 45); return phy_num('A tanker carries ' . $v . ' tonnes of diesel. Write this mass in kilograms, the SI unit. (1 tonne = 1000 kg)', $v * 1000, 'kg', ['1 tonne = 1000 kg.', $v . ' × 1000 = ' . phy_p($v * 1000) . ' kg.'], 'Multiply by the number of kilograms in a tonne.', 'procedure', 30); }
            $v = $r->int(5, 60); return phy_num('A generator’s fuel tank holds ' . $v . ' litres of petrol. Write this volume in cubic metres, the SI unit. (1 litre = 1000 cm³ = 0.001 m³)', $v / 1000, 'm³', ['1 litre = 0.001 m³.', $v . ' × 0.001 = ' . mlb_dec($v / 1000) . ' m³.'], 'A cubic metre holds a thousand litres.', 'procedure', 35);
        },
        // Spot the error: building the unit of a derived quantity from base units.
        static function (MlbRng $r) {
            $q = $r->int(0, 3); $who = $r->pick(MLB_NAMES) . '’s working';
            if ($q === 0) return phy_err($r, $who . ': find the unit of pressure in base SI units. Which line holds the first mistake?',
                ['Pressure = force ÷ area.', 'Unit of force: N = kg m s⁻².', 'Unit of area: m².', 'So the unit of pressure is kg m s⁻² ÷ m² = kg m⁻¹ s⁻².'],
                [[1, ['Pressure = force ÷ area.', 'Unit of force: N = kg m s⁻¹.', 'Unit of area: m².', 'So the unit of pressure is kg m⁻¹ s⁻¹.'], 'A newton is mass × acceleration, and acceleration is m s⁻², not m s⁻¹.'],
                 [2, ['Pressure = force ÷ area.', 'Unit of force: N = kg m s⁻².', 'Unit of area: m.', 'So the unit of pressure is kg s⁻².'], 'Area is length × length: m², not m.'],
                 [3, ['Pressure = force ÷ area.', 'Unit of force: N = kg m s⁻².', 'Unit of area: m².', 'So the unit of pressure is kg m³ s⁻².'], 'Dividing by m² LOWERS the power of m by 2 (1 − 2 = −1); it was multiplied instead.']]);
            if ($q === 1) return phy_err($r, $who . ': find the unit of work in base SI units. Which line holds the first mistake?',
                ['Work = force × distance.', 'Unit of force: kg m s⁻².', 'Unit of distance: m.', 'So the unit of work is kg m² s⁻².'],
                [[0, ['Work = force ÷ distance.', 'Unit of force: kg m s⁻².', 'Unit of distance: m.', 'So the unit of work is kg s⁻².'], 'Work is force TIMES distance moved.'],
                 [1, ['Work = force × distance.', 'Unit of force: kg m s⁻¹.', 'Unit of distance: m.', 'So the unit of work is kg m² s⁻¹.'], 'Force is mass × acceleration: kg m s⁻².'],
                 [3, ['Work = force × distance.', 'Unit of force: kg m s⁻².', 'Unit of distance: m.', 'So the unit of work is kg m s⁻².'], 'Multiplying by m raises the power of m from 1 to 2.']]);
            if ($q === 2) return phy_err($r, $who . ': find the unit of power in base SI units. Which line holds the first mistake?',
                ['Power = work ÷ time.', 'Unit of work: J = kg m² s⁻².', 'Unit of time: s.', 'So the unit of power is kg m² s⁻³.'],
                [[0, ['Power = work × time.', 'Unit of work: J = kg m² s⁻².', 'Unit of time: s.', 'So the unit of power is kg m² s⁻¹.'], 'Power is work done PER second: divide by time.'],
                 [1, ['Power = work ÷ time.', 'Unit of work: J = kg m s⁻².', 'Unit of time: s.', 'So the unit of power is kg m s⁻³.'], 'A joule is a newton × a metre: kg m² s⁻².'],
                 [3, ['Power = work ÷ time.', 'Unit of work: J = kg m² s⁻².', 'Unit of time: s.', 'So the unit of power is kg m² s⁻¹.'], 'Dividing by s lowers the power of s by one: −2 − 1 = −3.']]);
            return phy_err($r, $who . ': find the unit of momentum in base SI units. Which line holds the first mistake?',
                ['Momentum = mass × velocity.', 'Unit of mass: kg.', 'Unit of velocity: m s⁻¹.', 'So the unit of momentum is kg m s⁻¹.'],
                [[2, ['Momentum = mass × velocity.', 'Unit of mass: kg.', 'Unit of velocity: m s⁻².', 'So the unit of momentum is kg m s⁻².'], 'm s⁻² is acceleration; velocity is metres per second, m s⁻¹.'],
                 [0, ['Momentum = mass ÷ velocity.', 'Unit of mass: kg.', 'Unit of velocity: m s⁻¹.', 'So the unit of momentum is kg m⁻¹ s.'], 'Momentum is mass TIMES velocity.'],
                 [3, ['Momentum = mass × velocity.', 'Unit of mass: kg.', 'Unit of velocity: m s⁻¹.', 'So the unit of momentum is kg m s.'], '“Per second” stays per second: s⁻¹, not s.']]);
        },
    ],
    'PH-002' => [
        // Spot the error: km/h to m/s, the factor upside down.
        static function (MlbRng $r) { $n = $r->int(1, 7); $k = 18 * $n; $v = $r->pick(PHY_VEHICLES);
            $right = ['1 km = 1000 m and 1 h = 3600 s.', 'So 1 km/h = 1000 ÷ 3600 m/s = $\\frac{5}{18}$ m/s.', $k . ' × $\\frac{5}{18}$ = ' . (5 * $n) . ' m/s.'];
            return phy_err($r, 'A ' . $v . ' travels at ' . $k . ' km/h. Convert this speed to m/s. Which line holds the first mistake?', $right,
                [[1, ['1 km = 1000 m and 1 h = 3600 s.', 'So 1 km/h = 3600 ÷ 1000 m/s = 3.6 m/s.', $k . ' × 3.6 = ' . mlb_dec($k * 3.6) . ' m/s.'], 'The metres go on top: 1000 m covered in 3600 s is 1000 ÷ 3600 m/s.'],
                 [2, ['1 km = 1000 m and 1 h = 3600 s.', 'So 1 km/h = 1000 ÷ 3600 m/s = $\\frac{5}{18}$ m/s.', $k . ' × $\\frac{18}{5}$ = ' . mlb_dec($k * 3.6) . ' m/s.'], 'Use the factor just found, 5/18, not its upside-down.'],
                 [0, ['1 km = 1000 m and 1 h = 60 s.', 'So 1 km/h = 1000 ÷ 60 m/s.', $k . ' × 1000 ÷ 60 = ' . mlb_rd($k * 1000 / 60, 1) . ' m/s.'], 'An hour is 60 MINUTES, which is 60 × 60 = 3600 seconds.']]); },
        // Typed: an area or volume conversion, where the factor is squared or cubed.
        static function (MlbRng $r) { $c = $r->int(0, 2);
            if ($c === 0) { $v = $r->int(3, 90) * 100; return phy_num('A window pane has an area of ' . mlb_p($v) . ' cm². What is its area in m²?', $v / 10000, 'm²',
                ['1 m = 100 cm, so 1 m² = 100 × 100 = 10 000 cm².', mlb_p($v) . ' ÷ 10 000 = ' . mlb_dec($v / 10000) . ' m².'], '1 m = 100 cm — but a square metre is a square: how many cm² fit in it?', 'procedure', 45); }
            if ($c === 1) { $v = $r->int(2, 30) / 2; return phy_num('An overhead water tank holds ' . phy_p($v) . ' m³. What is this in cm³?', $v * 1000000, 'cm³',
                ['1 m = 100 cm, so 1 m³ = 100 × 100 × 100 = 1 000 000 cm³.', phy_p($v) . ' × 1 000 000 = ' . mlb_p($v * 1000000) . ' cm³.'], 'A cube 1 m on each side is 100 cm on each side.', 'procedure', 45); }
            $v = $r->int(50, 400); return phy_num('A SIM card has an area of ' . $v . ' mm². What is its area in cm²?', $v / 100, 'cm²',
                ['1 cm = 10 mm, so 1 cm² = 10 × 10 = 100 mm².', $v . ' ÷ 100 = ' . mlb_dec($v / 100) . ' cm².'], 'A square centimetre is 10 mm by 10 mm.', 'procedure', 40); },
    ],
    'PH-003' => [
        // Typed, rearranged: the depth of water from the volume and the base.
        static function (MlbRng $r) { $a = $r->pick([1, 1.5, 2, 2.5]); $b = $r->pick([1, 2, 4]); $h = $r->pick([0.5, 0.8, 1, 1.2, 1.5, 2]); $L = $a * $b * $h * 1000;
            return phy_num('A rectangular overhead water tank has a base ' . phy_p($a) . ' m by ' . phy_p($b) . ' m. The borehole pump fills it with ' . mlb_p($L) . ' litres. How deep is the water? (1000 litres = 1 m³)', $h, 'm',
                ['Volume = ' . mlb_p($L) . ' ÷ 1000 = ' . mlb_dec($L / 1000) . ' m³.', 'Volume = base area × depth, so depth = ' . mlb_dec($L / 1000) . ' ÷ (' . phy_p($a) . ' × ' . phy_p($b) . ') = ' . mlb_dec($h) . ' m.'], 'Change litres to m³, then undo “× base area”.', 'application', 55); },
        // Spot the error: cm² to m².
        static function (MlbRng $r) { $a = $r->pick([20, 25, 30, 40, 50, 60]); $b = $r->pick([20, 25, 30, 40, 50, 60]); $A = $a * $b;
            $right = ['Area = ' . $a . ' × ' . $b . ' = ' . mlb_p($A) . ' cm².', '1 m² = 100 cm × 100 cm = 10 000 cm².', mlb_p($A) . ' cm² = ' . mlb_p($A) . ' ÷ 10 000 = ' . mlb_dec($A / 10000) . ' m².'];
            return phy_err($r, 'A floor tile is ' . $a . ' cm by ' . $b . ' cm. Find its area in m². Which line holds the first mistake?', $right,
                [[1, ['Area = ' . $a . ' × ' . $b . ' = ' . mlb_p($A) . ' cm².', '1 m² = 100 cm².', mlb_p($A) . ' cm² = ' . mlb_p($A) . ' ÷ 100 = ' . mlb_dec($A / 100) . ' m².'], 'A square metre is 100 cm by 100 cm: 10 000 cm², not 100.'],
                 [0, ['Area = 2 × (' . $a . ' + ' . $b . ') = ' . (2 * ($a + $b)) . ' cm².', '1 m² = 100 cm × 100 cm = 10 000 cm².', (2 * ($a + $b)) . ' ÷ 10 000 = ' . mlb_dec(2 * ($a + $b) / 10000) . ' m².'], 'That is the perimeter; area is length × width.'],
                 [2, ['Area = ' . $a . ' × ' . $b . ' = ' . mlb_p($A) . ' cm².', '1 m² = 100 cm × 100 cm = 10 000 cm².', mlb_p($A) . ' cm² = ' . mlb_p($A) . ' × 10 000 = ' . mlb_p($A * 10000) . ' m².'], 'cm² to m² makes the number SMALLER: a square metre is far bigger than a square centimetre, so divide.']]); },
    ],
    'PH-004' => [
        // Typed: weight on another world → mass → weight on Earth.
        static function (MlbRng $r) { [$where, $g] = $r->pick([['Mars', 3.7], ['the Moon', 1.6]]); $m = $r->int(4, 60) * 5; $what = $r->pick(['A robot rover', 'A space probe', 'A science package']);
            return phy_num($what . ' weighs ' . mlb_dec($m * $g) . ' N on ' . $where . ', where g = ' . mlb_dec($g) . ' N/kg. What would it weigh on Earth? (g = 10 N/kg)', $m * PHY_G, 'N',
                ['Its mass is the same everywhere: m = W ÷ g = ' . mlb_dec($m * $g) . ' ÷ ' . mlb_dec($g) . ' = ' . $m . ' kg.', 'On Earth: W = ' . $m . ' × 10 = ' . ($m * PHY_G) . ' N.'], 'Find the thing that does NOT change between the two places first.', 'reasoning', 55); },
        // Spring balance against beam balance on the Moon.
        static function (MlbRng $r) { $what = $r->pick(['garri', 'rice', 'beans', 'yam flour']);
            return mlb_mcq($r, 'A bag of ' . $what . ' is weighed on the Moon with a spring balance and with a beam balance. Compared with the readings on Earth, which is true?', 'The spring balance reads less; the beam balance reads the same',
                [['Both read less', 'A beam balance compares the bag with standard masses; the Moon pulls both less, so it still balances at the same reading.'],
                 ['Both read the same', 'A spring balance measures the pull of gravity (the weight), and that is weaker on the Moon.'],
                 ['The beam balance reads less; the spring balance reads the same', 'It is the other way round: the spring feels the weaker pull, the beam compares masses.']],
                ['A spring balance measures weight (mg): g on the Moon is about a sixth of Earth’s, so it reads less.', 'A beam balance compares two masses under the same g, so it balances at the same reading.'], 'Which instrument measures a pull, and which compares two masses?', 'reasoning', 40); },
    ],
    'PH-005' => [
        // Typed: density of an irregular stone by displacement (a table of readings).
        static function (MlbRng $r) { $rho = $r->pick([2.5, 2.6, 2.7, 3, 7.8, 8.9]); $V = $r->int(4, 30); $a = $r->int(4, 15) * 10; $m = $rho * $V;
            $what = $r->pick(['granite chipping', 'stone from the stream', 'piece of metal scrap', 'lump of laterite rock']);
            return phy_num('To find the density of a ' . $what . ', a student records: mass = ' . mlb_dec($m) . ' g; water level in a measuring cylinder before = ' . $a . ' cm³, after = ' . ($a + $V) . ' cm³. What is its density, in g/cm³?', $rho, 'g/cm³',
                ['Volume = rise in level = ' . ($a + $V) . ' − ' . $a . ' = ' . $V . ' cm³.', 'Density = mass ÷ volume = ' . mlb_dec($m) . ' ÷ ' . $V . ' = ' . mlb_dec($rho) . ' g/cm³.'], 'The rise in the water level is the object’s volume.', 'application', 50); },
        // Density is a property of the material, not of the piece.
        static function (MlbRng $r) { $what = $r->pick(['iron', 'wood', 'ice', 'candle wax', 'soap']);
            return mlb_mcq($r, 'A block of ' . $what . ' is cut into two equal halves. What is the density of each half?', 'The same as the whole block',
                [['Half that of the whole block', 'Halving the mass also halves the volume, so mass ÷ volume does not change.'], ['Twice that of the whole block', 'Nothing about cutting packs the material tighter.'], ['It depends on which way it is cut', 'Density belongs to the material, not to the shape of the piece.']],
                ['Density = mass ÷ volume.', 'Each half has half the mass AND half the volume, so the density is unchanged.'], 'What happens to the mass and to the volume?', 'concept', 30); },
    ],
    'PH-006' => [
        // Typed: reading a micrometer screw gauge.
        static function (MlbRng $r) { $s = $r->int(1, 12) / 2; $t = $r->int(1, 49); $what = $r->pick(['a copper wire', 'a ball bearing', 'a strand of fishing net', 'a sewing needle']);
            return phy_num('A micrometer screw gauge measuring ' . $what . ' shows ' . mlb_dec($s) . ' mm on the sleeve, and the ' . $t . ' mark on the thimble lines up with the datum line. What is the reading? (One thimble division = 0.01 mm.)', mlb_dec($s + $t / 100), 'mm',
                ['Reading = sleeve + thimble × 0.01 mm.', mlb_dec($s) . ' + ' . $t . ' × 0.01 = ' . mlb_dec($s) . ' + ' . mlb_dec($t / 100) . ' = ' . mlb_dec($s + $t / 100) . ' mm.'], 'The sleeve gives whole and half millimetres; the thimble gives hundredths.', 'procedure', 45); },
        // Typed, rearranged: from the period to the time for many swings.
        static function (MlbRng $r) { [$what, $T] = $r->pick([['A clock pendulum', $r->pick([1, 2])], ['A child on a playground swing', $r->pick([2.5, 3, 3.5])], ['A pendulum in the school laboratory', $r->pick([1.2, 1.4, 1.6, 1.8])]]); $n = $r->pick([10, 15, 20, 25, 30]);
            return phy_num($what . ' has a period of ' . mlb_dec($T) . ' s. How long does it take to make ' . $n . ' complete oscillations?', mlb_dec($T * $n), 's',
                ['The period is the time for ONE complete oscillation.', $n . ' oscillations take ' . $n . ' × ' . mlb_dec($T) . ' = ' . mlb_dec($T * $n) . ' s.'], 'One oscillation takes one period.', 'procedure', 30); },
    ],
    'PH-007' => [
        // Typed: how much more room a gas takes.
        static function (MlbRng $r) { $v = $r->int(2, 40) * 5; $ctx = $r->pick(['in a kettle', 'in a pot of jollof rice', 'in a pressure cooker', 'on a hot iron sheet roof']);
            return phy_num('Steam takes up about 1700 times the volume of the liquid water it came from. If ' . $v . ' cm³ of water boils away ' . $ctx . ', roughly what volume of steam is made?', $v * 1700, 'cm³',
                ['The particles are the same; in a gas they are much farther apart.', $v . ' × 1700 = ' . mlb_p($v * 1700) . ' cm³.'], 'Same number of particles, much more space between them.', 'application', 35); },
        // Typed: spacing in every direction cubes the volume.
        static function (MlbRng $r) { $k = $r->int(2, 12);
            return phy_num('Suppose the particles of a gas are, on average, ' . $k . ' times as far apart in EVERY direction (up, across and along) as in its liquid. How many times as much space does each particle have?', $k ** 3, '',
                ['Space is a volume: it grows in three directions at once.', $k . ' × ' . $k . ' × ' . $k . ' = ' . ($k ** 3) . ' times as much space.'], 'Think of a small cube around each particle. What happens to its volume when every side gets longer?', 'reasoning', 45); },
        // Particles do not swell.
        static function (MlbRng $r) { $ctx = $r->pick(['A metal lid stuck on a glass jar comes loose when hot water is run over it.', 'Electric cables between PHCN poles sag lower on a hot afternoon.', 'A metal ball that passed through a ring no longer fits after it is heated.', 'Iron roofing sheets creak as the sun heats them in the morning.']);
            return mlb_mcq($r, $ctx . ' Which is the best particle explanation?', 'The particles vibrate more and push slightly further apart',
                [['The particles themselves get bigger, so the solid takes up more room', 'Particles do not swell; the spaces between them grow.'], ['The heat makes more particles, which then need more space', 'Heating cannot create matter: the number of particles stays the same.'], ['The particles slow down and settle further apart', 'Hotter particles move MORE, not less.']],
                ['Heating gives the particles more energy, so they vibrate more strongly.', 'They push one another slightly further apart, so the solid expands — the particles stay the same size.'], 'What does heating change: the particles, or the way they move?', 'concept', 30); },
    ],
    'PH-008' => [
        // Typed: read the melting point off a heating table.
        static function (MlbRng $r) { [$times, $temps, $mp, $p] = phy_heat_table($r);
            return phy_num('A solid is heated steadily and its temperature is read every minute. Time (min): ' . implode(', ', $times) . '. Temperature (°C): ' . implode(', ', $temps) . '. What is its melting point?', $mp, '°C',
                ['While a solid melts, the heat goes into separating the particles (latent heat), so the temperature stays constant.', 'The temperature stays at ' . $mp . ' °C for ' . $p . ' minutes: that flat part is the melting, so the melting point is ' . $mp . ' °C.'], 'Look for where the temperature stops rising for a while.', 'application', 50); },
        // Typed: how long the flat part lasts.
        static function (MlbRng $r) { [$times, $temps, $mp, $p] = phy_heat_table($r);
            return phy_num('A solid is heated steadily and its temperature is read every minute. Time (min): ' . implode(', ', $times) . '. Temperature (°C): ' . implode(', ', $temps) . '. For how many minutes did the temperature stay constant while it melted?', $p, 'min',
                ['Find the readings that are all equal: they show the change of state.', 'The temperature is ' . $mp . ' °C from minute ' . (array_search($mp, $temps)) . ' to minute ' . (array_search($mp, $temps) + $p) . ': that is ' . $p . ' minutes.'], 'Find the first and last minute of the flat part, then subtract.', 'application', 50); },
        // Boiling: more heat, same temperature.
        static function (MlbRng $r) { $ctx = $r->pick(['a pot of yam', 'a kettle', 'a pot of rice', 'a pot of beans']);
            return mlb_mcq($r, 'Water is boiling in ' . $ctx . ' on a gas cooker, at sea level. The flame is turned up higher. What happens to the temperature of the boiling water?', 'It stays at 100 °C; the water just boils away faster',
                [['It rises above 100 °C, because more heat is going in', 'The extra heat goes into turning water into steam (latent heat), not into raising the temperature.'], ['It falls a little, because more steam carries heat away', 'While heat is still supplied, the boiling water stays at its boiling point.'], ['It keeps rising slowly until the pot boils dry', 'At the boiling point the temperature is fixed, for a given air pressure.']],
                ['During a change of state the temperature stays constant.', 'More heat per second means more water turns to steam per second — the food does not cook any hotter.'], 'Is the temperature still rising when water boils?', 'reasoning', 30); },
    ],
    'PH-009' => [
        // Typed, rearranged: one of two perpendicular forces from the resultant.
        static function (MlbRng $r) { [$a, $b, $c] = $r->pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10]]); $k = $r->pick([1, 2, 3, 5, 10]); $flip = $r->int(0, 1) === 1; if ($flip) [$a, $b] = [$b, $a];
            $ctx = $r->pick(['Two ropes pull a stuck car out of a gutter', 'Two boys pull a cart', 'Two tugs pull a ship']);
            return phy_num($ctx . ' at right angles to each other. One pulls with ' . ($a * $k) . ' N and the resultant is ' . ($c * $k) . ' N. What is the pull of the other?', $b * $k, 'N',
                ['At right angles, the resultant is the hypotenuse: R² = F₁² + F₂².', 'F₂ = √(' . ($c * $k) . '² − ' . ($a * $k) . '²) = √' . (($c * $k) ** 2 - ($a * $k) ** 2) . ' = ' . ($b * $k) . ' N.'], 'Pythagoras, solved for one of the shorter sides.', 'procedure', 50); },
        // Which list is all scalars?
        static function (MlbRng $r) {
            $sc = ['mass', 'time', 'speed', 'energy', 'temperature', 'distance', 'density', 'power', 'volume']; $vec = ['velocity', 'force', 'displacement', 'acceleration', 'momentum', 'weight'];
            $s = $r->shuffle($sc); $v = $r->shuffle($vec);
            if ($r->int(0, 1) === 0) {
                $right = ucfirst(implode(', ', array_slice($s, 0, 3)));
                $wrong = [];
                for ($i = 0; $i < 3; $i++) { $set = $r->shuffle([$s[3 + 2 * $i], $s[4 + 2 * $i], $v[$i]]); $wrong[] = [ucfirst(implode(', ', $set)), ucfirst($v[$i]) . ' has a direction, so it is a vector.']; }
                return mlb_mcq($r, 'Which list contains ONLY scalar quantities?', $right, $wrong,
                    ['A scalar has size only; a vector has size AND direction.', $right . ' — none of these needs a direction to describe it.'], 'For each word, ask: does it make sense to say “which way”?', 'concept', 35);
            }
            $right = ucfirst(implode(', ', array_slice($v, 0, 3)));
            $wrong = [];
            for ($i = 0; $i < 3; $i++) { $set = $r->shuffle([$v[3 + ($i % 3)], $v[($i + 1) % 3], $s[$i]]); $wrong[] = [ucfirst(implode(', ', $set)), ucfirst($s[$i]) . ' has size only, so it is a scalar.']; }
            return mlb_mcq($r, 'Which list contains ONLY vector quantities?', $right, $wrong,
                ['A vector has size AND direction; a scalar has size only.', $right . ' — each of these needs a direction to describe it fully.'], 'For each word, ask: does it make sense to say “which way”?', 'concept', 35); },
    ],
    'PH-010' => [
        // Typed: percentage uncertainty in one reading.
        static function (MlbRng $r) { $c = $r->int(0, 1);
            if ($c === 0) { $L = $r->int(80, 950) / 10; $pc = 0.1 / $L * 100;
                return phy_num('A length is measured with a metre rule as ' . mlb_dec($L) . ' cm, to within ±0.1 cm. What is the percentage uncertainty? (Give 2 decimal places.)', mlb_rd($pc, 2), '%',
                    ['Percentage uncertainty = (uncertainty ÷ reading) × 100%.', '(0.1 ÷ ' . mlb_dec($L) . ') × 100 = ' . mlb_rd($pc, 2) . '%.'], 'Compare the ± with the reading itself.', 'procedure', 50, 2); }
            $t = $r->int(50, 400) / 10; $pc = 0.2 / $t * 100;
            return phy_num('Twenty swings of a pendulum are timed with a hand stopwatch as ' . mlb_dec($t) . ' s, with a reaction-time uncertainty of ±0.2 s. What is the percentage uncertainty? (Give 2 decimal places.)', mlb_rd($pc, 2), '%',
                ['Percentage uncertainty = (uncertainty ÷ reading) × 100%.', '(0.2 ÷ ' . mlb_dec($t) . ') × 100 = ' . mlb_rd($pc, 2) . '%. (Timing many swings makes the same ±0.2 s a smaller fraction.)'], 'Compare the ± with the reading itself.', 'procedure', 50, 2); },
        // Accuracy against precision, from sets of readings.
        static function (MlbRng $r) { $V = $r->int(15, 25) / 10; $fmt = static fn(array $a) => implode(', ', array_map(static fn($x) => number_format($x, 2), $a)) . ' s';
            $pa = [$V - 0.01, $V + 0.01, $V]; $pn = [$V + 0.4, $V + 0.41, $V + 0.39]; $ap = [$V - 0.3, $V + 0.3, $V + 0.02]; $nn = [$V + 0.6, $V + 0.1, $V + 0.9];
            $sets = ['pa' => $fmt($pa), 'pn' => $fmt($pn), 'ap' => $fmt($ap), 'nn' => $fmt($nn)];
            $why = ['pa' => 'These are close together AND close to ' . number_format($V, 2) . ' s: precise and accurate.', 'pn' => 'These agree closely with one another (precise) but all sit about 0.4 s too high (not accurate).',
                    'ap' => 'Their average is close to ' . number_format($V, 2) . ' s (accurate), but they are spread out (not precise).', 'nn' => 'These are spread out and too high: neither precise nor accurate.'];
            $ask = $r->int(0, 1) === 0 ? 'pn' : 'pa';
            $wrong = []; foreach ($sets as $k => $s) if ($k !== $ask) $wrong[] = [$s, $why[$k]];
            return mlb_mcq($r, 'The true period of a pendulum is ' . number_format($V, 2) . ' s. Four students each time it three times. Which set of readings is ' . ($ask === 'pn' ? 'PRECISE but NOT accurate' : 'both ACCURATE and PRECISE') . '?', $sets[$ask], $wrong,
                ['Precise: the readings agree closely with each other. Accurate: they are close to the true value.', $why[$ask]], 'Check two things separately: the spread, and the distance from the true value.', 'reasoning', 50); },
    ],
    ];
}

/** A heating table with one flat (melting) stretch: [times, temperatures, melting point, minutes flat]. */
function phy_heat_table(MlbRng $r): array {
    $mp = $r->pick([45, 50, 55, 60, 65, 70, 80]); $rise = $r->pick([5, 8, 10]); $k = $r->int(2, 4); $p = $r->int(2, 5); $after = $r->int(2, 3);
    $temps = [];
    for ($i = $k; $i >= 1; $i--) $temps[] = $mp - $rise * $i;
    for ($i = 0; $i <= $p; $i++) $temps[] = $mp;
    for ($i = 1; $i <= $after; $i++) $temps[] = $mp + $rise * $i;
    return [range(0, count($temps) - 1), $temps, $mp, $p];
}

/* ═══ Stage 2 — Forces and Pressure ═══ */
function phy_more_2(): array {
    return [
    'PH-011' => [
        // Typed: tug of war — find the other team's pull from the resultant.
        static function (MlbRng $r) { [$h1, $h2] = array_slice($r->shuffle(PHY_HOUSES), 0, 2); $a = $r->int(30, 90) * 10; $R = $r->int(1, 15) * 10;
            return phy_num('At the inter-house sports, ' . $h1 . ' pulls the tug-of-war rope with ' . $a . ' N. The rope accelerates towards ' . $h1 . ' with a resultant force of ' . $R . ' N. How hard is ' . $h2 . ' pulling?', $a - $R, 'N',
                ['The pulls are in opposite directions, so the resultant is their difference: R = ' . $a . ' − F.', 'F = ' . $a . ' − ' . $R . ' = ' . ($a - $R) . ' N.'], 'Opposite forces: the resultant is the difference, towards the bigger one.', 'procedure', 45); },
        // Typed: steady speed means balanced forces.
        static function (MlbRng $r) { $v = $r->pick(PHY_VEHICLES); $F = $r->int(15, 60) * 100; $A = $r->int(3, 14) * 100; $s = $r->int(8, 25);
            return phy_num('A ' . $v . ' moves along a straight, level road at a steady ' . $s . ' m/s. Its engine provides a driving force of ' . mlb_p($F) . ' N, and air resistance is ' . mlb_p($A) . ' N. What is the friction force from the road?', $F - $A, 'N',
                ['A steady speed in a straight line means NO resultant force (Newton’s first law): the forces balance.', 'Driving force = air resistance + friction, so friction = ' . mlb_p($F) . ' − ' . mlb_p($A) . ' = ' . mlb_p($F - $A) . ' N.'], 'What is the resultant force on something moving steadily in a straight line?', 'reasoning', 50); },
        // At the top of a throw: the force of the throw has gone.
        static function (MlbRng $r) { $what = $r->pick(['a ball thrown straight up on the school field', 'an orange tossed straight up', 'a stone thrown straight up']);
            return mlb_mcq($r, 'Think of ' . $what . '. At the very top of its flight, air resistance aside, which force(s) act on it?', 'Only its weight, downwards',
                [['Its weight down, balanced by the force of the throw up', 'The hand’s push stops the moment the ball leaves it; no “force of the throw” travels with the ball.'], ['No force at all, because it has stopped', 'Gravity never switches off. The ball is at rest for an instant but still accelerating downwards.'], ['The force of the throw, upwards', 'Nothing is pushing it up once it has left the hand: it is slowing down, which needs a downward force.']],
                ['Once it leaves the hand, the only force on it (ignoring air) is gravity.', 'At the top its velocity is zero for an instant, but its weight still acts — that is why it comes back down.'], 'What is touching the ball once it has left the hand?', 'reasoning', 35); },
    ],
    'PH-012' => [
        // Typed, rearranged: the mass from the friction.
        static function (MlbRng $r) { $mu = $r->pick([0.2, 0.25, 0.4, 0.5]); $m = $r->int(4, 50) * 2; $F = $mu * $m * PHY_G; $what = $r->pick(['a carton of noodles', 'a bag of cement', 'a box of books', 'a crate of soft drinks']);
            return phy_num('It takes a force of ' . mlb_dec($F) . ' N to start ' . $what . ' sliding across a floor where the coefficient of friction is ' . mlb_dec($mu) . '. What is its mass? (g = 10 N/kg)', $m, 'kg',
                ['F = μR, so R = F ÷ μ = ' . mlb_dec($F) . ' ÷ ' . mlb_dec($mu) . ' = ' . mlb_dec($F / $mu) . ' N.', 'On a level floor R = mg, so m = ' . mlb_dec($F / $mu) . ' ÷ 10 = ' . $m . ' kg.'], 'Work back: friction → normal reaction → mass.', 'application', 55); },
        // Friction makes walking possible.
        static function (MlbRng $r) { [$ctx, $on] = $r->pick([['you walk forwards', 'your foot'], ['an okada speeds up from rest', 'its back tyre'], ['a sprinter pushes off the starting line', 'her spikes']]);
            return mlb_mcq($r, 'When ' . $ctx . ', in which direction does the friction from the ground act on ' . $on . '?', 'Forwards, in the direction of motion',
                [['Backwards, against the motion', 'The foot (or tyre) pushes the ground BACKWARDS; the friction on it is the forward push that moves you.'], ['There is no friction while moving forwards', 'Without friction — on oil or wet tiles — you cannot push off at all.'], ['Straight down into the ground', 'Friction acts along the surface, not into it.']],
                ['To move off, the foot (or tyre) pushes backwards on the ground.', 'Friction from the ground pushes the foot (or tyre) FORWARDS: friction opposes slipping, and here it is what drives the motion.'], 'Which way would it slip if the ground were perfectly smooth?', 'reasoning', 35); },
        // Spot the error: friction from the mass.
        static function (MlbRng $r) { $m = $r->int(3, 40); $mu = $r->pick([0.2, 0.3, 0.4, 0.5]); $W = $m * PHY_G;
            $right = ['Normal reaction R = weight = ' . $m . ' × 10 = ' . $W . ' N.', 'F = μR.', 'F = ' . mlb_dec($mu) . ' × ' . $W . ' = ' . mlb_dec($mu * $W) . ' N.'];
            return phy_err($r, 'A ' . $m . ' kg box rests on a floor (μ = ' . mlb_dec($mu) . '). What force starts it sliding? (g = 10 N/kg) Which line holds the first mistake?', $right,
                [[0, ['Normal reaction R = ' . $m . ' N.', 'F = μR.', 'F = ' . mlb_dec($mu) . ' × ' . $m . ' = ' . mlb_dec($mu * $m) . ' N.'], 'R is a force — the weight mg — not the mass in kilograms.'],
                 [1, ['Normal reaction R = weight = ' . $m . ' × 10 = ' . $W . ' N.', 'F = R ÷ μ.', 'F = ' . $W . ' ÷ ' . mlb_dec($mu) . ' = ' . mlb_rd($W / $mu, 1) . ' N.'], 'F = μR: the coefficient multiplies the normal reaction. Friction cannot be bigger than the weight here.'],
                 [2, ['Normal reaction R = weight = ' . $m . ' × 10 = ' . $W . ' N.', 'F = μR.', 'F = ' . mlb_dec($mu) . ' + ' . $W . ' = ' . mlb_dec($mu + $W) . ' N.'], 'μR means μ TIMES R.']]); },
    ],
    'PH-013' => [
        // Reading a force–extension graph.
        static function (MlbRng $r) { $X = $r->int(2, 12) * 5; $what = $r->pick(['spring', 'steel wire', 'copper wire']);
            return mlb_mcq($r, 'A force–extension graph for a ' . $what . ' is a straight line through the origin up to ' . $X . ' N, and then begins to curve. What does the point at ' . $X . ' N mark?', 'The limit of proportionality: beyond it, extension is no longer proportional to force',
                [['The breaking point: beyond it, the ' . $what . ' snaps and can hold no force at all', 'The graph carries on after it; breaking is where the graph ENDS.'], ['The point where it starts to stretch: below it, the extension is zero', 'It stretches from the first newton: the line starts at the origin.'], ['The point where the spring constant becomes zero, so it no longer resists', 'A curving line means the gradient CHANGES, not that the ' . $what . ' stops resisting.']],
                ['Hooke’s law (F = ke) holds only while the graph is a straight line through the origin.', 'Where it starts to curve is the limit of proportionality.'], 'What does a straight line through the origin tell you?', 'concept', 35); },
        // Spot the error: extension is not the new length.
        static function (MlbRng $r) { $L0 = $r->int(10, 30); $e = $r->pick([2, 4, 5, 8, 10]); $F = $r->int(2, 20); $k = $F / ($e / 100);
            $right = ['Extension e = ' . ($L0 + $e) . ' − ' . $L0 . ' = ' . $e . ' cm = ' . mlb_dec($e / 100) . ' m.', 'From F = ke, k = F ÷ e.', 'k = ' . $F . ' ÷ ' . mlb_dec($e / 100) . ' = ' . mlb_dec($k) . ' N/m.'];
            return phy_err($r, 'A spring ' . $L0 . ' cm long becomes ' . ($L0 + $e) . ' cm long when a ' . $F . ' N weight hangs from it. Find its spring constant in N/m. Which line holds the first mistake?', $right,
                [[0, ['Extension e = ' . ($L0 + $e) . ' cm = ' . mlb_dec(($L0 + $e) / 100) . ' m.', 'From F = ke, k = F ÷ e.', 'k = ' . $F . ' ÷ ' . mlb_dec(($L0 + $e) / 100) . ' = ' . mlb_rd($F / (($L0 + $e) / 100), 2) . ' N/m.'], 'The extension is the INCREASE in length, not the new length.'],
                 [1, ['Extension e = ' . ($L0 + $e) . ' − ' . $L0 . ' = ' . $e . ' cm = ' . mlb_dec($e / 100) . ' m.', 'From F = ke, k = F × e.', 'k = ' . $F . ' × ' . mlb_dec($e / 100) . ' = ' . mlb_dec($F * $e / 100) . ' N/m.'], 'Undoing “× e” means dividing by e: k = F ÷ e.'],
                 [2, ['Extension e = ' . ($L0 + $e) . ' − ' . $L0 . ' = ' . $e . ' cm = ' . mlb_dec($e / 100) . ' m.', 'From F = ke, k = F ÷ e.', 'k = ' . $F . ' ÷ ' . $e . ' = ' . mlb_rd($F / $e, 2) . ' N/m.'], 'For N/m the extension must be in metres: ' . mlb_dec($e / 100) . ' m, not ' . $e . '.']]); },
    ],
    'PH-014' => [
        // Typed, rearranged: the force from pressure × area.
        static function (MlbRng $r) { $P = $r->pick([200000, 250000, 300000]); $A = $r->pick([0.01, 0.012, 0.015, 0.02, 0.025]); $v = $r->pick(['car', 'danfo', 'pick-up van']);
            return phy_num('Each tyre of a ' . $v . ' is pumped to a pressure of ' . mlb_p($P) . ' Pa, and touches the road over an area of ' . mlb_dec($A) . ' m². Roughly what force does each tyre hold up?', $P * $A, 'N',
                ['P = F ÷ A, so F = P × A.', 'F = ' . mlb_p($P) . ' × ' . mlb_dec($A) . ' = ' . mlb_p($P * $A) . ' N.'], 'Rearrange P = F ÷ A.', 'application', 45); },
        // Compare: which face gives the greatest pressure?
        static function (MlbRng $r) { $d = $r->shuffle([0.1, 0.2, 0.3, 0.5]); $d = array_slice($d, 0, 3); sort($d); [$a, $b, $c] = $d; $W = $r->int(20, 90) * 10; $what = $r->pick(['concrete block', 'block of ice', 'wooden crate']);
            $f = static fn($x, $y) => 'On its ' . mlb_dec($x) . ' m × ' . mlb_dec($y) . ' m face';
            return mlb_mcq($r, 'A ' . $what . ' weighing ' . $W . ' N measures ' . mlb_dec($a) . ' m × ' . mlb_dec($b) . ' m × ' . mlb_dec($c) . ' m. On which face should it rest to press on the ground with the GREATEST pressure?', $f($a, $b),
                [[$f($b, $c), 'That is the LARGEST face: the same weight spread over the most area gives the least pressure.'], [$f($a, $c), 'Not the smallest area, so not the greatest pressure.'], ['It is the same on every face, because the weight is the same', 'The force is the same, but P = F ÷ A, and the area is different on each face.']],
                ['P = F ÷ A, and F (the weight, ' . $W . ' N) is the same on every face.', 'The smallest face, ' . mlb_dec($a) . ' × ' . mlb_dec($b) . ' = ' . mlb_dec($a * $b) . ' m², gives the greatest pressure: ' . mlb_p(round($W / ($a * $b))) . ' Pa.'], 'Same force each time: what changes?', 'reasoning', 45); },
        // Spot the error: cm² left as cm².
        static function (MlbRng $r) { $A = $r->pick([20, 25, 40, 50, 80, 100, 200, 250, 400, 500]); $F = $r->int(2, 40) * 5; $Am = $A / 10000; $P = $F / $Am;
            $right = ['A = ' . $A . ' cm² = ' . $A . ' ÷ 10 000 = ' . mlb_dec($Am) . ' m².', 'P = F ÷ A.', 'P = ' . $F . ' ÷ ' . mlb_dec($Am) . ' = ' . mlb_p($P) . ' Pa.'];
            return phy_err($r, 'A force of ' . $F . ' N acts on an area of ' . $A . ' cm². Find the pressure in pascals. Which line holds the first mistake?', $right,
                [[0, ['A = ' . $A . ' cm² = ' . $A . ' ÷ 100 = ' . mlb_dec($A / 100) . ' m².', 'P = F ÷ A.', 'P = ' . $F . ' ÷ ' . mlb_dec($A / 100) . ' = ' . mlb_p($F / ($A / 100)) . ' Pa.'], '1 m² = 10 000 cm², so divide by 10 000, not 100.'],
                 [1, ['A = ' . $A . ' cm² = ' . $A . ' ÷ 10 000 = ' . mlb_dec($Am) . ' m².', 'P = F × A.', 'P = ' . $F . ' × ' . mlb_dec($Am) . ' = ' . mlb_dec($F * $Am) . ' Pa.'], 'Pressure is force DIVIDED by area.'],
                 [2, ['A = ' . $A . ' cm² = ' . $A . ' ÷ 10 000 = ' . mlb_dec($Am) . ' m².', 'P = F ÷ A.', 'P = ' . $F . ' ÷ ' . $A . ' = ' . mlb_dec($F / $A) . ' Pa.'], 'The area in metres, ' . mlb_dec($Am) . ' m², must be used, or the answer is in N/cm², not pascals.']]); },
    ],
    'PH-015' => [
        // Typed, rearranged: the depth from the pressure.
        static function (MlbRng $r) { $h = $r->int(2, 40); $where = $r->pick(['a hand-dug well', 'the school swimming pool', 'a water storage tank', 'a fish pond']); if ($where === 'the school swimming pool' || $where === 'a fish pond') $h = $r->int(1, 4);
            return phy_num('The pressure due to the water alone at the bottom of ' . $where . ' is ' . mlb_p($h * 10000) . ' Pa. How deep is the water? (density 1000 kg/m³, g = 10 m/s²)', $h, 'm',
                ['P = hρg, so h = P ÷ (ρg).', 'h = ' . mlb_p($h * 10000) . ' ÷ (1000 × 10) = ' . $h . ' m.'], 'Rearrange P = hρg for h.', 'procedure', 40); },
        // The shape of the container does not matter.
        static function (MlbRng $r) { $h = $r->int(1, 5); $c = $r->shuffle(['a tall, thin pipe', 'a wide drum', 'a cone-shaped funnel']);
            return mlb_mcq($r, 'Three containers — ' . implode(', ', $c) . ' — are each filled with water to the SAME depth of ' . $h . ' m. Where is the water pressure on the bottom greatest?', 'It is the same in all three',
                [['In the wide drum, which holds the most water', 'Liquid pressure depends only on depth, density and g (P = hρg), not on how much liquid there is.'], ['In the thin pipe, because the water is squeezed', 'Narrowness does not add pressure; depth does.'], ['In the funnel, because the sloping sides push down', 'The sides push on the water, but the pressure at a depth still comes out as hρg.']],
                ['P = hρg: same depth, same liquid, same g.', 'So the pressure at the bottom is the same in all three: ' . mlb_p($h * 10000) . ' Pa from the water.'], 'Which quantities appear in the formula for liquid pressure?', 'reasoning', 40); },
    ],
    'PH-016' => [
        // Spot the error: balancing a light rod.
        static function (MlbRng $r) { $F1 = $r->int(2, 12) * 10; $d1 = $r->int(1, 5) * 10; $F2 = $r->pick([10, 20, 40, 50]); if ($F2 === $F1) $F2 = $F1 === 50 ? 40 : 50; $M = $F1 * $d1; $d2 = $M / $F2;
            $right = ['Anticlockwise moment = ' . $F1 . ' × ' . $d1 . ' = ' . $M . ' N cm.', 'For balance: ' . $F2 . ' × d = ' . $M . '.', 'd = ' . $M . ' ÷ ' . $F2 . ' = ' . mlb_dec($d2) . ' cm.'];
            return phy_err($r, 'A light rod is pivoted at its centre. A ' . $F1 . ' N weight hangs ' . $d1 . ' cm to the left of the pivot. How far to the right must a ' . $F2 . ' N weight hang to balance it? Which line holds the first mistake?', $right,
                [[0, ['Anticlockwise moment = ' . $F1 . ' ÷ ' . $d1 . ' = ' . mlb_rd($F1 / $d1, 2) . ' N/cm.', 'For balance: ' . $F2 . ' × d = ' . mlb_rd($F1 / $d1, 2) . '.', 'd = ' . mlb_rd($F1 / $d1, 2) . ' ÷ ' . $F2 . ' = ' . mlb_rd($F1 / $d1 / $F2, 3) . ' cm.'], 'A moment is force TIMES distance.'],
                 [1, ['Anticlockwise moment = ' . $F1 . ' × ' . $d1 . ' = ' . $M . ' N cm.', 'For balance: ' . $F2 . ' × d = ' . $F1 . '.', 'd = ' . $F1 . ' ÷ ' . $F2 . ' = ' . mlb_dec($F1 / $F2) . ' cm.'], 'It is the MOMENTS that must be equal, not the forces.'],
                 [2, ['Anticlockwise moment = ' . $F1 . ' × ' . $d1 . ' = ' . $M . ' N cm.', 'For balance: ' . $F2 . ' × d = ' . $M . '.', 'd = ' . $F2 . ' ÷ ' . $M . ' = ' . mlb_rd($F2 / $M, 4) . ' cm.'], 'Undo “× ' . $F2 . '” by dividing the moment by ' . $F2 . '.']]); },
        // Typed: three children on a seesaw.
        static function (MlbRng $r) {
            do { $F1 = $r->int(6, 12) * 50; $d1 = $r->pick([1.5, 2]); $F2 = $r->int(4, 10) * 50; $d2 = $r->pick([0.5, 1]); $F3 = $r->pick([200, 250, 400, 500]); $d3 = ($F1 * $d1 - $F2 * $d2) / $F3; } while ($d3 <= 0.2 || $d3 > 2.5);
            [$a, $b, $c] = array_slice($r->shuffle(MLB_NAMES), 0, 3);
            return phy_num('A seesaw is pivoted at its middle. ' . $a . ' (' . $F1 . ' N) sits ' . mlb_dec($d1) . ' m to the left of the pivot, and ' . $b . ' (' . $F2 . ' N) sits ' . mlb_dec($d2) . ' m to the right. How far to the right of the pivot must ' . $c . ' (' . $F3 . ' N) sit for it to balance?', mlb_dec($d3), 'm',
                ['Anticlockwise moment: ' . $F1 . ' × ' . mlb_dec($d1) . ' = ' . mlb_dec($F1 * $d1) . ' N m. Clockwise: ' . $F2 . ' × ' . mlb_dec($d2) . ' + ' . $F3 . ' × d.', mlb_dec($F1 * $d1) . ' = ' . mlb_dec($F2 * $d2) . ' + ' . $F3 . 'd, so d = ' . mlb_dec($F1 * $d1 - $F2 * $d2) . ' ÷ ' . $F3 . ' = ' . mlb_dec($d3) . ' m.'], 'Add up the moments on each side; the two sides must be equal.', 'challenge', 75); },
    ],
    'PH-017' => [
        // Typed: the reaction at one support of a loaded plank.
        static function (MlbRng $r) { $L = $r->pick([2, 4, 5]); $x = $r->int(1, 2 * $L - 1) / 2; $W = $r->int(2, 6) * 50; $P = $r->int(2, 8) * 100; $R = $W / 2 + $P * $x / $L;
            $who = $r->pick(['A painter', 'A bricklayer', 'A carpenter']);
            return phy_num('A uniform plank ' . $L . ' m long, weighing ' . $W . ' N, rests on two trestles at its ends. ' . $who . ' weighing ' . $P . ' N stands ' . mlb_dec($x) . ' m from the LEFT end. What upward force does the RIGHT trestle give?', mlb_dec($R), 'N',
                ['Take moments about the LEFT trestle, so its force has no moment.', 'The plank’s weight acts at its middle (' . mlb_dec($L / 2) . ' m): R × ' . $L . ' = ' . $W . ' × ' . mlb_dec($L / 2) . ' + ' . $P . ' × ' . mlb_dec($x) . ' = ' . mlb_dec($W * $L / 2 + $P * $x) . '.', 'R = ' . mlb_dec($W * $L / 2 + $P * $x) . ' ÷ ' . $L . ' = ' . mlb_dec($R) . ' N.'], 'Take moments about the support you do NOT want.', 'challenge', 80); },
        // Typed: centre of gravity of two loads on a light pole.
        static function (MlbRng $r) { $m1 = $r->int(2, 10) * 2; $m2 = $r->int(2, 10) * 2; if ($m1 === $m2) $m2 += 2; $L = $r->pick([100, 120, 150, 200]); $x = $m2 * $L / ($m1 + $m2);
            return phy_num('A water carrier’s light pole is ' . $L . ' cm long, with a ' . $m1 . ' kg bucket at end A and a ' . $m2 . ' kg bucket at end B. How far from end A must the pole rest on her shoulder to balance? (Give 1 decimal place.)', mlb_rd($x, 1), 'cm',
                ['The balance point is the centre of gravity: moments of the two weights about it are equal.', $m1 . 'g × d = ' . $m2 . 'g × (' . $L . ' − d), so d = ' . $m2 . ' × ' . $L . ' ÷ (' . $m1 . ' + ' . $m2 . ') = ' . mlb_rd($x, 1) . ' cm.'], 'It must be nearer the heavier bucket.', 'challenge', 75, 1); },
        // A high load topples a vehicle.
        static function (MlbRng $r) { $ctx = $r->pick(['a danfo with bags of rice tied on its roof rack', 'a lorry piled high with yams', 'a keke with plastic chairs stacked on top']);
            return mlb_mcq($r, 'Why is ' . $ctx . ' more likely to topple on a sharp bend than when it is unloaded?', 'The load raises its centre of gravity, so a smaller tilt takes its weight line outside its base',
                [['The load lowers its centre of gravity, so the vehicle leans further out on the bend', 'Weight added HIGH UP raises the centre of gravity.'], ['Heavier vehicles always topple more easily, wherever the extra mass is placed', 'It is where the mass sits that matters: the same load on the floor would make it steadier.'], ['The load makes the base narrower, so the wheels lift off the road more easily', 'The wheels — the base — have not moved.']],
                ['A body topples when the vertical line through its centre of gravity falls outside its base.', 'A load on the roof raises the centre of gravity, so that line leaves the base at a smaller tilt.'], 'Where is the extra weight: high or low?', 'reasoning', 35); },
    ],
    'PH-018' => [
        // Typed: the velocity ratio of a ramp.
        static function (MlbRng $r) { $L = $r->pick([2, 3, 4, 5, 6]); $h = $r->pick([0.5, 1, 2]); if ($h >= $L) $h = 0.5; $what = $r->pick(['a drum of palm oil', 'a motorcycle', 'a deep freezer', 'a generator']);
            return phy_num('A plank ' . $L . ' m long is used as a ramp to load ' . $what . ' into a lorry whose floor is ' . mlb_dec($h) . ' m high. What is the velocity ratio of the ramp?', mlb_dec($L / $h), '',
                ['VR = distance moved by the effort ÷ distance moved by the load.', 'The effort moves ' . $L . ' m along the ramp while the load rises ' . mlb_dec($h) . ' m: VR = ' . $L . ' ÷ ' . mlb_dec($h) . ' = ' . mlb_dec($L / $h) . '.'], 'How far does the effort go, and how far up does the load go?', 'application', 40); },
        // Spot the error: efficiency upside down.
        static function (MlbRng $r) { $V = $r->int(3, 8); $e = $r->pick([50, 60, 75, 80]); $M = $V * $e / 100;
            $right = ['Efficiency = (MA ÷ VR) × 100%.', '= (' . mlb_dec($M) . ' ÷ ' . $V . ') × 100%', '= ' . $e . '%.'];
            return phy_err($r, 'A pulley system has a velocity ratio of ' . $V . ' and a mechanical advantage of ' . mlb_dec($M) . '. Find its efficiency. Which line holds the first mistake?', $right,
                [[0, ['Efficiency = (VR ÷ MA) × 100%.', '= (' . $V . ' ÷ ' . mlb_dec($M) . ') × 100%', '= ' . mlb_rd($V / $M * 100, 1) . '%.'], 'Efficiency is output over input: MA ÷ VR. An answer above 100% is the warning sign.'],
                 [2, ['Efficiency = (MA ÷ VR) × 100%.', '= (' . mlb_dec($M) . ' ÷ ' . $V . ') × 100%', '= ' . mlb_dec($M / $V) . '%.'], 'The fraction ' . mlb_dec($M / $V) . ' still has to be multiplied by 100 to make a percentage.'],
                 [1, ['Efficiency = (MA ÷ VR) × 100%.', '= (' . mlb_dec($M) . ' × ' . $V . ') × 100%', '= ' . mlb_dec($M * $V * 100) . '%.'], 'The formula says divide MA by VR, not multiply.']]); },
    ],
    'PH-019' => [
        // Carrying a load along level ground: no work by the holding force.
        static function (MlbRng $r) { $ctx = $r->pick(['A girl carries a bucket of water on her head along a flat road at a steady speed.', 'A hawker carries a tray of oranges on her head along a level street at a steady speed.', 'A waiter carries a tray of drinks across a flat hall at a steady speed.']);
            return mlb_mcq($r, $ctx . ' How much work does the UPWARD force holding up the load do on the load?', 'None: the force is upwards and the load moves sideways',
                [['Its weight × the whole distance walked along the road', 'Work counts only movement IN the direction of the force, and the movement is at right angles to it.'], ['A lot, because carrying a load all the way is tiring', 'Muscles use energy holding a load still, but no work is done ON the load.'], ['Its weight × the height of the load above the ground', 'The load is not lifted during the walk: its height stays the same.']],
                ['Work = force × distance moved in the direction of the force.', 'The holding force is vertical; the load moves horizontally, so it moves no distance in the direction of the force: W = 0.'], 'Which way does the force point, and which way does the load move?', 'reasoning', 35); },
        // Typed, rearranged: the distance from the work.
        static function (MlbRng $r) { $F = $r->int(4, 40) * 10; $d = $r->int(3, 40); $what = $r->pick(['pushes a stalled car', 'pushes a loaded wheelbarrow', 'drags a bag of maize']);
            return phy_num('A man ' . $what . ' with a steady force of ' . $F . ' N in the direction of motion, and does ' . mlb_p($F * $d) . ' J of work. How far does it move?', $d, 'm',
                ['W = F × d, so d = W ÷ F.', 'd = ' . mlb_p($F * $d) . ' ÷ ' . $F . ' = ' . $d . ' m.'], 'Rearrange W = Fd.', 'procedure', 35); },
    ],
    'PH-020' => [
        // Typed, rearranged: the time a borehole pump takes.
        static function (MlbRng $r) { $P = $r->pick([500, 750, 1000, 1500]); $h = $r->int(6, 15); $m = $r->int(2, 20) * 100; $t = $m * PHY_G * $h / $P;
            return phy_num('A ' . $P . ' W borehole pump lifts ' . mlb_p($m) . ' kg of water into an overhead tank ' . $h . ' m above it. Ignoring losses, how long does it take? (g = 10 m/s², 1 decimal place)', mlb_rd($t, 1), 's',
                ['Work = mgh = ' . mlb_p($m) . ' × 10 × ' . $h . ' = ' . mlb_p($m * PHY_G * $h) . ' J.', 'P = W ÷ t, so t = W ÷ P = ' . mlb_p($m * PHY_G * $h) . ' ÷ ' . $P . ' = ' . mlb_rd($t, 1) . ' s.'], 'Find the work first, then rearrange P = W ÷ t.', 'application', 60, 1); },
        // Spot the error: minutes left as minutes.
        static function (MlbRng $r) { $m = $r->int(2, 20) * 10; $h = $r->int(3, 12); $t = $r->int(1, 5); $W = $m * PHY_G * $h; $P = $W / ($t * 60);
            $right = ['Work = mgh = ' . $m . ' × 10 × ' . $h . ' = ' . mlb_p($W) . ' J.', 'Time = ' . $t . ' min = ' . ($t * 60) . ' s.', 'Power = ' . mlb_p($W) . ' ÷ ' . ($t * 60) . ' = ' . mlb_rd($P, 1) . ' W.'];
            return phy_err($r, 'A crane on a building site lifts a ' . $m . ' kg load ' . $h . ' m in ' . $t . ' minute' . ($t > 1 ? 's' : '') . '. Find its useful power. (g = 10 m/s²) Which line holds the first mistake?', $right,
                [[1, ['Work = mgh = ' . $m . ' × 10 × ' . $h . ' = ' . mlb_p($W) . ' J.', 'Time = ' . $t . ' s.', 'Power = ' . mlb_p($W) . ' ÷ ' . $t . ' = ' . mlb_rd($W / $t, 1) . ' W.'], 'A watt is a joule per SECOND: ' . $t . ' min is ' . ($t * 60) . ' s.'],
                 [0, ['Work = mh = ' . $m . ' × ' . $h . ' = ' . ($m * $h) . ' J.', 'Time = ' . $t . ' min = ' . ($t * 60) . ' s.', 'Power = ' . ($m * $h) . ' ÷ ' . ($t * 60) . ' = ' . mlb_rd($m * $h / ($t * 60), 2) . ' W.'], 'The force needed is the weight, mg: multiply the mass by g = 10.'],
                 [2, ['Work = mgh = ' . $m . ' × 10 × ' . $h . ' = ' . mlb_p($W) . ' J.', 'Time = ' . $t . ' min = ' . ($t * 60) . ' s.', 'Power = ' . mlb_p($W) . ' × ' . ($t * 60) . ' = ' . mlb_p($W * $t * 60) . ' W.'], 'Power is work DIVIDED by time.']]); },
    ],
    ];
}

/* ═══ Stage 3 — Motion ═══ */
function phy_more_3(): array {
    return [
    'PH-021' => [
        // Typed, rearranged: the time from distance and average speed.
        static function (MlbRng $r) { $v = $r->pick([40, 50, 60, 80, 100]); $t = $r->pick([0.5, 1, 1.5, 2, 2.5, 3]); $veh = $r->pick(PHY_VEHICLES);
            return phy_num('A ' . $veh . ' covers ' . phy_p($v * $t) . ' km on an expressway at an average speed of ' . $v . ' km/h. How long does the journey take, in hours?', $t, 'h',
                ['Average speed = distance ÷ time, so time = distance ÷ average speed.', 't = ' . phy_p($v * $t) . ' ÷ ' . $v . ' = ' . mlb_dec($t) . ' h.'], 'Rearrange speed = distance ÷ time.', 'procedure', 35); },
        // Typed: displacement after walking there and part of the way back.
        static function (MlbRng $r) { $a = $r->int(10, 60) * 10; do { $b = $r->int(5, 60) * 10; } while ($b === $a); $who = $r->pick(['A hawker', 'A newspaper seller', 'A security guard on patrol']);
            return phy_num($who . ' walks ' . $a . ' m east along a straight street, then ' . $b . ' m back west. What is the SIZE of the displacement from where the walk began?', abs($a - $b), 'm',
                ['Displacement is the straight-line change of position, with direction; take east as positive.', $a . ' − ' . $b . ' = ' . phy_sg($a - $b) . ' m, so ' . abs($a - $b) . ' m ' . ($a > $b ? 'east' : 'west') . ' of the start. (The DISTANCE walked is ' . ($a + $b) . ' m.)'], 'Where does the walk end, compared with where it began?', 'reasoning', 40); },
        // Distance against displacement on a round trip.
        static function (MlbRng $r) { $a = $r->int(2, 15); $who = $r->pick(['An okada rider goes from home to the market', 'A girl walks from her house to the borehole', 'A bus goes from the depot to the motor park']);
            return mlb_mcq($r, $who . ' and comes back by the same road, ' . $a . ' km each way. Which is TRUE of the whole trip?', 'Distance travelled is ' . (2 * $a) . ' km; displacement is zero',
                [['Distance and displacement are both ' . (2 * $a) . ' km', 'Displacement is from start to finish in a straight line, and the trip ends where it began.'], ['Distance is zero; displacement is ' . (2 * $a) . ' km', 'It is the other way round: the path is ' . (2 * $a) . ' km long, the change of position is zero.'], ['Both are ' . $a . ' km', 'The road was travelled twice, and the trip ends at the start.']],
                ['Distance is the length of the path travelled: ' . $a . ' + ' . $a . ' = ' . (2 * $a) . ' km.', 'Displacement is the change of position: back at the start, it is zero.'], 'Where does the trip end?', 'concept', 30); },
    ],
    'PH-022' => [
        // Typed: acceleration from a km/h figure.
        static function (MlbRng $r) { $V = $r->pick([36, 54, 72, 90, 108]); $t = $r->pick([2, 4, 5, 10]); $vs = $V / 3.6; $what = $r->pick(['A car', 'A new keke', 'An okada', 'A pick-up van']);
            return phy_num($what . ' goes from rest to ' . $V . ' km/h in ' . $t . ' s. What is its average acceleration, in m/s²?', mlb_dec($vs / $t), 'm/s²',
                ['Change the speed to m/s first: ' . $V . ' ÷ 3.6 = ' . mlb_dec($vs) . ' m/s.', 'a = change in velocity ÷ time = ' . mlb_dec($vs) . ' ÷ ' . $t . ' = ' . mlb_dec($vs / $t) . ' m/s².'], 'An acceleration in m/s² needs a speed in m/s.', 'application', 50); },
        // Zero velocity is not zero acceleration.
        static function (MlbRng $r) { $what = $r->pick(['a ball thrown straight up', 'a stone thrown straight up', 'a coin flipped straight up']);
            return mlb_mcq($r, 'At the very top of its path, what are the velocity and the acceleration of ' . $what . '? (g = 10 m/s², no air resistance)', 'Velocity 0; acceleration 10 m/s² downwards',
                [['Both are zero', 'The velocity is zero for an instant, but gravity is still changing it: the acceleration is g all the way.'], ['Velocity 0; acceleration 0 until it starts to fall', 'If the acceleration were zero at the top, it would stay there.'], ['Velocity 10 m/s upwards; acceleration 0', 'At the top it has stopped rising: the velocity is zero.']],
                ['Acceleration is the RATE of change of velocity, not the velocity itself.', 'At the top the velocity is passing through zero (up → down), and it is changing at 10 m/s every second, downwards.'], 'Is the velocity still changing at the top?', 'reasoning', 35); },
        // Typed: average velocity from a table of positions.
        static function (MlbRng $r) { $x = [0]; for ($i = 1; $i <= 5; $i++) $x[] = $x[$i - 1] + $r->int(2, 12) * 2; $i = $r->int(0, 2); $j = $r->int($i + 2, 5); $ts = range(0, 10, 2);
            $v = ($x[$j] - $x[$i]) / ($ts[$j] - $ts[$i]);
            return phy_num('A cyclist’s position along a straight road is recorded. Time (s): ' . implode(', ', $ts) . '. Position (m): ' . implode(', ', $x) . '. What is her average velocity between t = ' . $ts[$i] . ' s and t = ' . $ts[$j] . ' s? (Give 2 decimal places if needed.)', mlb_rd($v, 2), 'm/s',
                ['Average velocity = change in position ÷ time taken.', '(' . $x[$j] . ' − ' . $x[$i] . ') ÷ (' . $ts[$j] . ' − ' . $ts[$i] . ') = ' . ($x[$j] - $x[$i]) . ' ÷ ' . ($ts[$j] - $ts[$i]) . ' = ' . mlb_rd($v, 2) . ' m/s.'], 'Read the two positions and the two times; subtract each.', 'application', 55, 2); },
    ],
    'PH-023' => [
        // Typed, rearranged: the starting velocity.
        static function (MlbRng $r) { $u = $r->int(0, 10); $a = $r->int(1, 2); $t = $r->int(2, 8); $veh = $r->pick(PHY_VEHICLES);
            return phy_num('A ' . $veh . ' accelerates uniformly at ' . $a . ' m/s² for ' . $t . ' s and reaches ' . ($u + $a * $t) . ' m/s. How fast was it going at the start?', $u, 'm/s',
                ['v = u + at, so u = v − at.', 'u = ' . ($u + $a * $t) . ' − ' . $a . ' × ' . $t . ' = ' . $u . ' m/s.'], 'Rearrange v = u + at for u.', 'procedure', 40); },
        // Typed: sign convention — a ball rolling up a slope and back.
        static function (MlbRng $r) { $u = $r->int(4, 12); $d = $r->int(1, 4); $t = $r->int(1, 8); $v = $u - $d * $t;
            return phy_num('A ball is rolled up a smooth slope at ' . $u . ' m/s and slows at ' . $d . ' m/s². Taking UP the slope as positive, what is its velocity after ' . $t . ' s? (A negative answer means it is rolling back down.)', $v, 'm/s',
                ['Up is positive, so the acceleration is −' . $d . ' m/s² (it points down the slope).', 'v = u + at = ' . $u . ' + (−' . $d . ') × ' . $t . ' = ' . phy_sg($v) . ' m/s' . ($v < 0 ? ': it has passed its highest point and is coming back down.' : ($v === 0 ? ': it is momentarily at rest at its highest point.' : ': still going up.'))], 'Give the acceleration its sign before you substitute.', 'reasoning', 55); },
        // What a v–t graph's features mean.
        static function (MlbRng $r) { $f = ['gradient' => 'The acceleration, a', 'intercept on the velocity axis' => 'The starting velocity, u', 'area under the line' => 'The displacement (distance moved)'];
            $ask = $r->pick(array_keys($f)); $wrong = []; foreach ($f as $k => $v) if ($k !== $ask) $wrong[] = [$v, 'That is given by the ' . $k . '.'];
            $wrong[] = ['The time taken', 'Time is read along the horizontal axis; it is not a feature of the line.'];
            return mlb_mcq($r, 'A velocity–time graph of uniform acceleration is a straight line (v = u + at). What does the ' . mb_strtoupper($ask) . ' of the graph give?', $f[$ask], $wrong,
                ['Gradient = change in v ÷ change in t = a. The line meets the velocity axis at t = 0, where v = u.', 'The area under a velocity–time line is velocity × time: the displacement.'], 'Compare v = u + at with y = mx + c.', 'concept', 35); },
    ],
    'PH-024' => [
        // Spot the error: v² = u² + 2as.
        static function (MlbRng $r) { $a = $r->pick([1, 2, 4, 5]); $v = $r->int(2, 15) * 2; $s = $v * $v / (2 * $a); $V2 = $v * $v;
            $right = ['v² = u² + 2as.', 'v² = 0 + 2 × ' . $a . ' × ' . mlb_dec($s) . ' = ' . $V2 . '.', 'v = √' . $V2 . ' = ' . $v . ' m/s.'];
            return phy_err($r, 'A car starts from rest and accelerates at ' . $a . ' m/s² over ' . mlb_dec($s) . ' m. Find its final speed. Which line holds the first mistake?', $right,
                [[2, ['v² = u² + 2as.', 'v² = 0 + 2 × ' . $a . ' × ' . mlb_dec($s) . ' = ' . $V2 . '.', 'v = ' . $V2 . ' m/s.'], 'That is v², not v: take the square root.'],
                 [1, ['v² = u² + 2as.', 'v² = 0 + ' . $a . ' × ' . mlb_dec($s) . ' = ' . mlb_dec($V2 / 2) . '.', 'v = √' . mlb_dec($V2 / 2) . ' = ' . mlb_rd(sqrt($V2 / 2), 2) . ' m/s.'], 'The equation has 2as: TWICE a × s.'],
                 [0, ['v = u + 2as.', 'v = 0 + 2 × ' . $a . ' × ' . mlb_dec($s) . ' = ' . $V2 . '.', 'v = ' . $V2 . ' m/s.'], 'The equation without time is v² = u² + 2as: it is v SQUARED.']]); },
        // Compare: braking distance grows with the square of the speed.
        static function (MlbRng $r) { $k = $r->pick([2, 3]); $d = $r->int(3, 12) * 2; $V = $r->pick([20, 30, 40]); $veh = $r->pick(['an okada', 'a car', 'a danfo']);
            return mlb_mcq($r, 'With the brakes fully on, ' . $veh . ' stops in ' . $d . ' m from ' . $V . ' km/h. With the same braking, roughly how far does it need from ' . ($k * $V) . ' km/h?', ($k * $k * $d) . ' m',
                [[($k * $d) . ' m', 'Braking distance is not proportional to speed: from v² = 2as, it goes with the SQUARE of the speed.'], [$d . ' m', 'The same brakes give the same deceleration, but a faster vehicle has more speed to lose, so it needs further.'], [($k * $k * $k * $d) . ' m', 'It goes with the square of the speed, not the cube.']],
                ['From v² = u² + 2as with v = 0: s = u² ÷ (2a). The braking deceleration a is the same.', $k . ' times the speed gives ' . $k . '² = ' . ($k * $k) . ' times the distance: ' . $d . ' × ' . ($k * $k) . ' = ' . ($k * $k * $d) . ' m.'], 'Which power of the speed appears in s = u² ÷ 2a?', 'reasoning', 45); },
        // Typed: distance from the average of the two velocities.
        static function (MlbRng $r) { $u = $r->int(10, 30); $v = $r->int(0, $u - 2); $t = $r->int(2, 12); $s = ($u + $v) / 2 * $t;
            return phy_num('A train slows uniformly from ' . $u . ' m/s to ' . $v . ' m/s in ' . $t . ' s as it comes into the station. How far does it travel in that time?', mlb_dec($s), 'm',
                ['For uniform acceleration, s = ½(u + v)t: the average velocity × time.', 's = ½ × (' . $u . ' + ' . $v . ') × ' . $t . ' = ' . mlb_dec($s) . ' m.'], 'With steady slowing, the average velocity is halfway between the two.', 'procedure', 45); },
    ],
    'PH-025' => [
        // Typed: area under a velocity–time graph in three parts.
        static function (MlbRng $r) { $V = $r->int(2, 10) * 2; $t1 = $r->int(2, 8); $t2 = $r->int(5, 30); $t3 = $r->int(2, 8); $s = $V * $t1 / 2 + $V * $t2 + $V * $t3 / 2;
            return phy_num('A BRT bus leaves a stop. Its velocity–time graph rises steadily from 0 to ' . $V . ' m/s in ' . $t1 . ' s, stays at ' . $V . ' m/s for ' . $t2 . ' s, then falls steadily to 0 in ' . $t3 . ' s at the next stop. How far apart are the stops?', mlb_dec($s), 'm',
                ['Distance = area under the velocity–time graph: a triangle, a rectangle and a triangle.', '½ × ' . $t1 . ' × ' . $V . ' + ' . $t2 . ' × ' . $V . ' + ½ × ' . $t3 . ' × ' . $V . ' = ' . mlb_dec($V * $t1 / 2) . ' + ' . ($V * $t2) . ' + ' . mlb_dec($V * $t3 / 2) . ' = ' . mlb_dec($s) . ' m.'], 'Split the area under the graph into simple shapes.', 'application', 70); },
        // Reading the shape of a velocity–time line.
        static function (MlbRng $r) {
            $cases = [['a horizontal line above the time axis', 'Moving at a steady (constant) velocity'], ['a straight line sloping DOWN to the time axis', 'Slowing down steadily, to a stop'], ['a straight line sloping UP from the origin', 'Speeding up steadily from rest']];
            $k = $r->int(0, 2); [$line, $right] = $cases[$k];
            $wrong = [];
            foreach ($cases as $i => $c) if ($i !== $k) $wrong[] = [$c[1], 'That would be ' . $c[0] . '.'];
            $wrong[] = ['Standing still', $k === 0 ? 'That is how a horizontal line reads on a DISTANCE–time graph; on a velocity–time graph it means the velocity is not changing.' : 'Standing still is a line ALONG the time axis (v = 0).'];
            $veh = $r->pick(['a danfo', 'a train', 'a cyclist', 'an okada']);
            return mlb_mcq($r, 'The VELOCITY–time graph of ' . $veh . ' is ' . $line . '. What is it doing?', $right, $wrong,
                ['On a velocity–time graph the height is the velocity and the gradient is the acceleration.', 'So ' . $line . ' means: ' . mb_strtolower($right) . '.'], 'Check the axis label first: velocity, not distance.', 'concept', 35); },
        // Typed: the gradient of a velocity–time line.
        static function (MlbRng $r) { do { $a = $r->int(-4, 4); } while ($a === 0); $t1 = $r->int(0, 5); $dt = $r->int(2, 6); $v1 = $a > 0 ? $r->int(0, 10) : $r->int(-$a * $dt, 30);
            $v2 = $v1 + $a * $dt;
            return phy_num('A straight velocity–time line passes through (' . $t1 . ' s, ' . $v1 . ' m/s) and (' . ($t1 + $dt) . ' s, ' . $v2 . ' m/s). What is the acceleration? (Negative if it is slowing down.)', $a, 'm/s²',
                ['Acceleration = gradient = change in velocity ÷ change in time.', '(' . $v2 . ' − ' . $v1 . ') ÷ (' . ($t1 + $dt) . ' − ' . $t1 . ') = ' . phy_sg($v2 - $v1) . ' ÷ ' . $dt . ' = ' . phy_sg($a) . ' m/s².'], 'Rise over run — and keep the sign.', 'procedure', 45); },
    ],
    'PH-026' => [
        // Spot the error: h = ½gt².
        static function (MlbRng $r) { $t = $r->int(2, 6); $h = 5 * $t * $t; $from = $r->pick(['a bridge', 'the top of a storey building', 'a cliff', 'a water tower']);
            $right = ['h = ½gt².', 'h = ½ × 10 × ' . $t . '² = 5 × ' . ($t * $t) . '.', 'h = ' . $h . ' m.'];
            return phy_err($r, 'A stone is dropped from rest from ' . $from . ' and lands ' . $t . ' s later. Find the height. (g = 10 m/s²) Which line holds the first mistake?', $right,
                [[0, ['h = gt.', 'h = 10 × ' . $t . '.', 'h = ' . (10 * $t) . ' m.'], 'gt is the SPEED after t seconds; the distance fallen is ½gt².'],
                 [1, ['h = ½gt².', 'h = ½ × 10 × ' . $t . ' = 5 × ' . $t . '.', 'h = ' . (5 * $t) . ' m.'], 'The time must be squared: ' . $t . '² = ' . ($t * $t) . '.'],
                 [1, ['h = ½gt².', 'h = ½ × 10 × ' . $t . '² = 10 × ' . ($t * $t) . '.', 'h = ' . (10 * $t * $t) . ' m.'], 'Half of 10 is 5, not 10.']]); },
        // Terminal velocity: balanced forces.
        static function (MlbRng $r) { $who = $r->pick(['a skydiver', 'a raindrop', 'a parachutist', 'a falling shuttlecock']);
            return mlb_mcq($r, 'After falling for a while, ' . $who . ' reaches a steady speed (terminal velocity). At that point, how does the air resistance compare with the weight?', 'They are equal, so there is no resultant force',
                [['Air resistance is less than the weight, or it would not still be falling', 'Moving at a STEADY speed needs no resultant force: the forces balance (Newton’s first law).'], ['Air resistance is greater than the weight', 'Then it would be slowing down.'], ['There is no air resistance at terminal velocity', 'Air resistance is at its biggest at the highest speed.']],
                ['As it speeds up, air resistance grows until it equals the weight.', 'Then the resultant force is zero, the acceleration is zero, and the speed stays constant.'], 'What does a steady speed tell you about the resultant force?', 'reasoning', 35); },
    ],
    'PH-027' => [
        // Typed, rearranged: the time to land from the height.
        static function (MlbRng $r) { $t = $r->pick([1, 1.5, 2, 2.5, 3, 4]); $h = 5 * $t * $t; $what = $r->pick(['A tin rolls off a flat roof', 'A ball rolls off the edge of a platform', 'A stone is kicked horizontally off a cliff']); $u = $r->int(2, 15);
            return phy_num($what . ' ' . mlb_dec($h) . ' m above the ground, moving horizontally at ' . $u . ' m/s. How long does it take to reach the ground? (g = 10 m/s²)', $t, 's',
                ['The horizontal speed does not affect the fall: vertically it starts from rest, so h = ½gt².', 't = √(2h ÷ g) = √(2 × ' . mlb_dec($h) . ' ÷ 10) = √' . mlb_dec(2 * $h / 10) . ' = ' . mlb_dec($t) . ' s.'], 'Treat the vertical motion on its own.', 'application', 50); },
        // Fired and dropped together.
        static function (MlbRng $r) { [$a, $b] = $r->pick([['a bullet fired horizontally from a rifle', 'a bullet dropped from the same height'], ['a coin flicked off the edge of a table', 'a coin that just falls off beside it'], ['a ball kicked horizontally off a flat roof', 'a ball dropped from the same roof']]);
            return mlb_mcq($r, 'At the same instant, ' . $a . ' and ' . $b . ', over flat ground. Ignoring air resistance, which reaches the ground first?', 'Both land at the same time',
                [['The dropped one', 'The horizontal motion does not slow the fall: vertically, both start from rest with the same acceleration.'], ['The one moving sideways, because it is faster', 'Its speed is horizontal; vertically both start from rest.'], ['It depends on their masses', 'Free-fall acceleration does not depend on mass.']],
                ['Horizontal and vertical motion are independent.', 'Both start with zero vertical velocity and fall with g = 10 m/s², so both take the same time.'], 'Look at the vertical motion only.', 'reasoning', 35); },
    ],
    'PH-028' => [
        // Typed: steady speed, balanced forces.
        static function (MlbRng $r) { $veh = $r->pick(PHY_VEHICLES); $R = $r->int(5, 60) * 100; $v = $r->int(8, 25);
            return phy_num('A ' . $veh . ' cruises at a steady ' . $v . ' m/s along a straight, level road. The total resistive force on it (friction plus air resistance) is ' . mlb_p($R) . ' N. What driving force is the engine giving?', $R, 'N',
                ['Newton’s first law: a steady velocity means the resultant force is ZERO.', 'So the driving force exactly balances the resistance: ' . mlb_p($R) . ' N. (No extra force is needed to “keep it moving”.)'], 'Is it speeding up, slowing down, or neither?', 'reasoning', 40); },
        // Typed: nothing slows it.
        static function (MlbRng $r) { [$what, $u, $unit] = $r->pick([['A puck slides across a perfectly smooth, level air-table', $r->int(2, 9), 'm/s'], ['A space probe drifts far from any star or planet, engines off,', $r->int(5, 40), 'km/s'], ['A block slides across perfectly frictionless ice', $r->int(2, 9), 'm/s']]); $t = $r->int(5, 60);
            return phy_num($what . ' at ' . $u . ' ' . $unit . '. No force acts on it along its path. What is its speed ' . $t . ' s later?', $u, $unit,
                ['With no resultant force, there is no acceleration (Newton’s first law).', 'So the speed stays exactly ' . $u . ' ' . $unit . ', however long you wait.'], 'What would be needed to change its speed?', 'reasoning', 30); },
        // No force is needed to keep moving.
        static function (MlbRng $r) { $what = $r->pick(['a hockey puck sliding on perfectly smooth ice', 'a space probe far from any star or planet, engines off', 'a trolley on a perfectly frictionless track']);
            return mlb_mcq($r, 'Think of ' . $what . ', moving in a straight line. What is needed to keep it moving at the same speed?', 'Nothing: with no resultant force it keeps going',
                [['A steady forward force', 'A force is needed to CHANGE motion, not to keep it (Newton’s first law).'], ['Nothing — but it will slowly stop by itself', 'Without friction or any other force, nothing slows it.'], ['A force equal to its weight', 'Weight acts downwards; it plays no part in keeping a horizontal motion going.']],
                ['Newton’s first law: a body keeps its state of rest or of uniform motion in a straight line unless a resultant force acts.', 'On Earth things stop because friction and air resistance act on them — not because their “force runs out”.'], 'What is it that slows things down on an ordinary road?', 'concept', 35); },
    ],
    'PH-029' => [
        // A constant force gives a constant acceleration.
        static function (MlbRng $r) { $what = $r->pick(['A trolley on a smooth, level track', 'A cart on frictionless rails', 'A puck on a smooth air-table']);
            return mlb_mcq($r, $what . ' is pulled by a CONSTANT resultant force. What happens to its motion?', 'It speeds up at a steady rate (constant acceleration)',
                [['It moves at a constant speed', 'A constant speed needs ZERO resultant force; a constant resultant force gives a constant acceleration.'], ['It speeds up, then settles at a steady speed', 'Nothing balances the force here, so it keeps accelerating.'], ['It speeds up faster and faster', 'a = F ÷ m stays the same, so the speed rises by the same amount every second.']],
                ['Newton’s second law: a = F ÷ m.', 'Constant F and constant m give a constant a: the speed grows steadily.'], 'Use a = F ÷ m.', 'reasoning', 35); },
        // Spot the error: resultant before F = ma.
        static function (MlbRng $r) { $m = $r->pick([2, 4, 5, 8, 10, 20]); $a = $r->int(1, 6); $Fr = $r->int(1, 10) * 2; $P = $m * $a + $Fr;
            $right = ['Resultant force = ' . $P . ' − ' . $Fr . ' = ' . ($m * $a) . ' N.', 'a = F ÷ m.', 'a = ' . ($m * $a) . ' ÷ ' . $m . ' = ' . $a . ' m/s².'];
            return phy_err($r, 'A ' . $m . ' kg box is pushed with a force of ' . $P . ' N, and friction of ' . $Fr . ' N opposes it. Find its acceleration. Which line holds the first mistake?', $right,
                [[0, ['Resultant force = ' . $P . ' N.', 'a = F ÷ m.', 'a = ' . $P . ' ÷ ' . $m . ' = ' . mlb_dec($P / $m) . ' m/s².'], 'F = ma uses the RESULTANT force: friction must be subtracted.'],
                 [0, ['Resultant force = ' . $P . ' + ' . $Fr . ' = ' . ($P + $Fr) . ' N.', 'a = F ÷ m.', 'a = ' . ($P + $Fr) . ' ÷ ' . $m . ' = ' . mlb_dec(($P + $Fr) / $m) . ' m/s².'], 'Friction acts AGAINST the push, so it is subtracted.'],
                 [1, ['Resultant force = ' . $P . ' − ' . $Fr . ' = ' . ($m * $a) . ' N.', 'a = F × m.', 'a = ' . ($m * $a) . ' × ' . $m . ' = ' . ($m * $m * $a) . ' m/s².'], 'From F = ma, a = F ÷ m.']]); },
        // Typed, rearranged: the mass.
        static function (MlbRng $r) { $a = $r->pick([0.5, 1, 1.5, 2, 2.5, 4]); $m = $r->int(4, 40) * 50; $what = $r->pick(['a loaded danfo', 'a pick-up van', 'a tractor', 'a small boat']);
            return phy_num('A resultant force of ' . mlb_p($m * $a) . ' N gives ' . $what . ' an acceleration of ' . mlb_dec($a) . ' m/s². What is its mass?', $m, 'kg',
                ['F = ma, so m = F ÷ a.', 'm = ' . mlb_p($m * $a) . ' ÷ ' . mlb_dec($a) . ' = ' . mlb_p($m) . ' kg.'], 'Rearrange F = ma for m.', 'procedure', 35); },
    ],
    'PH-030' => [
        // Third law in a collision.
        static function (MlbRng $r) { [$big, $small, $B, $S] = $r->pick([['a heavy lorry', 'a small car', 'the lorry', 'the car'], ['a BRT bus', 'an okada', 'the bus', 'the okada'], ['a trailer', 'a keke', 'the trailer', 'the keke']]);
            return mlb_mcq($r, ucfirst($big) . ' collides head-on with ' . $small . '. During the collision, how does the force of ' . $B . ' on ' . $S . ' compare with the force of ' . $S . ' on ' . $B . '?', 'They are equal in size and opposite in direction',
                [['The force of ' . $B . ' is bigger, because it is heavier', 'Newton’s third law: the two forces are ALWAYS equal. ' . ucfirst($S) . ' is damaged more because the same force gives a smaller mass a larger acceleration.'], ['The force of ' . $S . ' is bigger, because it is moving faster', 'Speed does not change the third law: the pair of forces is equal.'], ['Only ' . $B . ' exerts a force', 'Forces come in pairs: if A pushes B, B pushes A.']],
                ['Newton’s third law: when A exerts a force on B, B exerts an equal and opposite force on A.', 'The effects differ because a = F ÷ m: the lighter vehicle gets the larger acceleration.'], 'Forces come in pairs. Are the two forces of a pair ever different in size?', 'reasoning', 40); },
        // Typed: momentum from a km/h speed.
        static function (MlbRng $r) { $V = $r->pick([36, 54, 72, 90, 108]); $m = $r->int(8, 30) * 50; $veh = $r->pick(['car', 'pick-up van', 'danfo']);
            return phy_num('A ' . mlb_p($m) . ' kg ' . $veh . ' moves at ' . $V . ' km/h. What is its momentum?', $m * $V / 3.6, 'kg m/s',
                ['Momentum = mass × velocity, with the velocity in m/s: ' . $V . ' ÷ 3.6 = ' . mlb_dec($V / 3.6) . ' m/s.', 'p = ' . mlb_p($m) . ' × ' . mlb_dec($V / 3.6) . ' = ' . mlb_p($m * $V / 3.6) . ' kg m/s.'], 'Change km/h to m/s first.', 'application', 45); },
        // Typed: change of momentum when the direction reverses.
        static function (MlbRng $r) { $m = $r->pick([0.1, 0.2, 0.4, 0.5]); $u = $r->int(5, 20); $v = $r->int(2, $u); $what = $r->pick(['A tennis ball', 'A football', 'A rubber ball']);
            return phy_num($what . ' of mass ' . mlb_dec($m) . ' kg hits a wall at ' . $u . ' m/s and bounces straight back at ' . $v . ' m/s. What is the SIZE of its change in momentum?', mlb_dec($m * ($u + $v)), 'kg m/s',
                ['Take the incoming direction as positive: before = ' . mlb_dec($m) . ' × ' . $u . ', after = ' . mlb_dec($m) . ' × (−' . $v . ').', 'Change = after − before = −' . mlb_dec($m * $v) . ' − ' . mlb_dec($m * $u) . ' = −' . mlb_dec($m * ($u + $v)) . ' kg m/s, so its size is ' . mlb_dec($m * ($u + $v)) . ' kg m/s.'], 'Velocity has a direction: bouncing back makes it negative.', 'reasoning', 55); },
    ],
    ];
}

/* ═══ Stage 4 — Energy and Momentum ═══ */
function phy_more_4(): array {
    return [
    'PH-031' => [
        // Typed, rearranged: the mass from the kinetic energy.
        static function (MlbRng $r) { $m = $r->int(4, 40) * 10; $v = $r->int(2, 15); $what = $r->pick(['An okada with its rider', 'A loaded handcart', 'A wheelbarrow of sand']);
            return phy_num($what . ' moving at ' . $v . ' m/s has ' . mlb_p(0.5 * $m * $v * $v) . ' J of kinetic energy. What is the mass?', $m, 'kg',
                ['KE = ½mv², so m = 2 × KE ÷ v².', 'm = 2 × ' . mlb_p(0.5 * $m * $v * $v) . ' ÷ ' . ($v * $v) . ' = ' . $m . ' kg.'], 'Rearrange KE = ½mv² for m.', 'procedure', 45); },
        // Spot the error: KE = ½mv².
        static function (MlbRng $r) { $m = $r->int(2, 20) * 2; $v = $r->int(2, 12); $V2 = $v * $v; $E = $m * $V2 / 2;
            $right = ['KE = ½mv².', 'KE = ½ × ' . $m . ' × ' . $v . '² = ½ × ' . $m . ' × ' . $V2 . '.', 'KE = ' . mlb_p($E) . ' J.'];
            return phy_err($r, 'Find the kinetic energy of a ' . $m . ' kg body moving at ' . $v . ' m/s. Which line holds the first mistake?', $right,
                [[1, ['KE = ½mv².', 'KE = ½ × ' . $m . ' × ' . $v . '.', 'KE = ' . mlb_p($m * $v / 2) . ' J.'], 'The speed must be SQUARED: ' . $v . '² = ' . $V2 . '.'],
                 [2, ['KE = ½mv².', 'KE = ½ × ' . $m . ' × ' . $v . '² = ½ × ' . $m . ' × ' . $V2 . '.', 'KE = ' . mlb_p($m * $V2) . ' J.'], 'The half has been dropped: ½ × ' . mlb_p($m * $V2) . ' = ' . mlb_p($E) . '.'],
                 [0, ['KE = mv².', 'KE = ' . $m . ' × ' . $v . '² = ' . $m . ' × ' . $V2 . '.', 'KE = ' . mlb_p($m * $V2) . ' J.'], 'Kinetic energy is ½mv², with a half.']]); },
        // Compare: doubling the speed beats doubling the mass.
        static function (MlbRng $r) { $m = $r->int(5, 30) * 10; $v = $r->int(3, 10);
            return mlb_mcq($r, 'Body A has mass ' . $m . ' kg and moves at ' . (2 * $v) . ' m/s. Body B has mass ' . (2 * $m) . ' kg and moves at ' . $v . ' m/s. Which has more kinetic energy?', 'A, with twice as much as B',
                [['B, because it is heavier', 'Mass counts once in ½mv², but speed counts TWICE (it is squared).'], ['They are the same, because mass × speed is the same', 'Mass × speed is the momentum — that IS the same. Kinetic energy squares the speed.'], ['A, with four times as much as B', 'A has twice the speed (×4 from v²) but half the mass (×½): ×2 overall.']],
                ['KE(A) = ½ × ' . $m . ' × ' . (2 * $v) . '² = ' . mlb_p(0.5 * $m * 4 * $v * $v) . ' J.', 'KE(B) = ½ × ' . (2 * $m) . ' × ' . $v . '² = ' . mlb_p($m * $v * $v) . ' J. A has twice as much.'], 'Work out ½mv² for each.', 'reasoning', 50); },
    ],
    'PH-032' => [
        // Typed, rearranged: the mass from the GPE.
        static function (MlbRng $r) { $m = $r->int(2, 60); $h = $r->int(2, 30); $what = $r->pick(['a bag of cement onto a scaffold', 'a jerrycan of water up to a roof tank', 'a box up to the third floor']);
            return phy_num('A labourer lifts ' . $what . ', ' . $h . ' m up, giving it ' . mlb_p($m * PHY_G * $h) . ' J of gravitational potential energy. What is its mass? (g = 10 m/s²)', $m, 'kg',
                ['GPE = mgh, so m = GPE ÷ (gh).', 'm = ' . mlb_p($m * PHY_G * $h) . ' ÷ (10 × ' . $h . ') = ' . $m . ' kg.'], 'Rearrange mgh for m.', 'procedure', 40); },
        // GPE depends on height, not path.
        static function (MlbRng $r) { $m = $r->int(5, 25); $h = $r->int(3, 8);
            return mlb_mcq($r, 'Two boys each carry an identical ' . $m . ' kg bag from the ground up to a floor ' . $h . ' m higher: one by the steep stairs, the other by a long, gentle ramp. Which bag gains more gravitational potential energy?', 'They gain the same: ' . ($m * PHY_G * $h) . ' J each',
                [['The bag on the ramp, because it travels further', 'GPE depends only on the HEIGHT gained (mgh), not the path taken.'], ['The bag on the stairs, because it goes up more steeply', 'Steepness changes how hard the climb feels, not the energy stored.'], ['Neither, because they are carried, not lifted', 'Being carried upwards IS being lifted: both gain height.']],
                ['GPE gained = mgh, with h the vertical height gained.', 'Both: ' . $m . ' × 10 × ' . $h . ' = ' . ($m * PHY_G * $h) . ' J. (The ramp needs a smaller force, over a longer distance.)'], 'Which quantity in mgh depends on the route?', 'reasoning', 40); },
        // Spot the error: a height in centimetres.
        static function (MlbRng $r) { $m = $r->int(2, 30); $hc = $r->int(2, 19) * 10; $hm = $hc / 100; $E = $m * PHY_G * $hm;
            $right = ['h = ' . $hc . ' cm = ' . mlb_dec($hm) . ' m.', 'GPE = mgh.', 'GPE = ' . $m . ' × 10 × ' . mlb_dec($hm) . ' = ' . mlb_dec($E) . ' J.'];
            return phy_err($r, 'Find the gravitational potential energy gained by a ' . $m . ' kg mass lifted ' . $hc . ' cm. (g = 10 m/s²) Which line holds the first mistake?', $right,
                [[0, ['h = ' . $hc . ' m.', 'GPE = mgh.', 'GPE = ' . $m . ' × 10 × ' . $hc . ' = ' . mlb_p($m * PHY_G * $hc) . ' J.'], 'The height goes into mgh in METRES: ' . $hc . ' cm = ' . mlb_dec($hm) . ' m.'],
                 [2, ['h = ' . $hc . ' cm = ' . mlb_dec($hm) . ' m.', 'GPE = mgh.', 'GPE = ' . $m . ' × ' . mlb_dec($hm) . ' = ' . mlb_dec($m * $hm) . ' J.'], 'g = 10 m/s² has been left out of mgh.'],
                 [1, ['h = ' . $hc . ' cm = ' . mlb_dec($hm) . ' m.', 'GPE = mg ÷ h.', 'GPE = ' . ($m * PHY_G) . ' ÷ ' . mlb_dec($hm) . ' = ' . mlb_rd($m * PHY_G / $hm, 2) . ' J.'], 'GPE = m × g × h: all three multiply.']]); },
    ],
    'PH-033' => [
        // Where on a swing is each energy greatest?
        static function (MlbRng $r) { $who = $r->pick(['A pendulum bob', 'A child on a swing']);
            $qs = [['its kinetic energy greatest', 'At B, the lowest point'], ['its gravitational potential energy greatest', 'At A and C, the highest points'], ['its speed zero', 'At A and C, the highest points'], ['its speed greatest', 'At B, the lowest point']];
            [$q, $right] = $r->pick($qs);
            $opts = ['At B, the lowest point' => 'At the lowest point the height (and GPE) is least, so the KE and speed are greatest.', 'At A and C, the highest points' => 'At the highest points it stops for an instant: KE is zero and GPE is greatest.',
                     'The same everywhere on the swing' => 'Only the TOTAL energy is the same; it is shared differently at each point.', 'Halfway between A and B' => 'Halfway, the energy is shared between GPE and KE; neither is at its greatest.'];
            $wrong = []; foreach ($opts as $t => $w) if ($t !== $right) $wrong[] = [$t, $w];
            return mlb_mcq($r, $who . ' swings from A (highest, on one side) through B (lowest) to C (highest, on the other side). Ignoring air resistance, where is ' . $q . '?', $right, $wrong,
                ['The total energy (GPE + KE) stays the same; it changes form as it swings.', 'Highest: all GPE, stopped for an instant. Lowest: least GPE, so most KE and fastest.'], 'Follow the energy from the top of the swing to the bottom.', 'concept', 35); },
        // Spot the error: the speed after a drop.
        static function (MlbRng $r) { $v = $r->pick([5, 10, 20, 30, 40]); $h = $v * $v / 20; $V2 = $v * $v;
            $right = ['mgh = ½mv², so v² = 2gh.', 'v² = 2 × 10 × ' . mlb_dec($h) . ' = ' . $V2 . '.', 'v = √' . $V2 . ' = ' . $v . ' m/s.'];
            return phy_err($r, 'A ' . $r->pick(['mango', 'coconut', 'stone', 'orange']) . ' falls from rest through ' . mlb_dec($h) . ' m. Ignoring air resistance, how fast is it moving at the bottom? (g = 10 m/s²) Which line holds the first mistake?', $right,
                [[2, ['mgh = ½mv², so v² = 2gh.', 'v² = 2 × 10 × ' . mlb_dec($h) . ' = ' . $V2 . '.', 'v = ' . $V2 . ' m/s.'], 'That is v²: the square root still has to be taken.'],
                 [0, ['mgh = mv², so v² = gh.', 'v² = 10 × ' . mlb_dec($h) . ' = ' . mlb_dec($V2 / 2) . '.', 'v = √' . mlb_dec($V2 / 2) . ' = ' . mlb_rd(sqrt($V2 / 2), 2) . ' m/s.'], 'Kinetic energy is ½mv², so v² = 2gh.'],
                 [1, ['mgh = ½mv², so v² = 2gh.', 'v² = 2 × 10 + ' . mlb_dec($h) . ' = ' . mlb_dec(20 + $h) . '.', 'v = √' . mlb_dec(20 + $h) . ' = ' . mlb_rd(sqrt(20 + $h), 2) . ' m/s.'], '2gh means 2 × g × h: all three multiply.']]); },
        // Typed: energy lost to friction on a slide.
        static function (MlbRng $r) { $m = $r->int(20, 45); $h = $r->int(2, 4); $vmax = (int)floor(sqrt(20 * $h)) - 1; $v = $r->int(2, $vmax); $Q = $m * PHY_G * $h - 0.5 * $m * $v * $v;
            return phy_num('A ' . $m . ' kg child slides from rest down a playground slide ' . $h . ' m high and reaches the bottom at ' . $v . ' m/s. How much energy has friction turned into heat? (g = 10 m/s²)', mlb_dec($Q), 'J',
                ['GPE at the top = mgh = ' . $m . ' × 10 × ' . $h . ' = ' . ($m * PHY_G * $h) . ' J. KE at the bottom = ½ × ' . $m . ' × ' . $v . '² = ' . mlb_dec(0.5 * $m * $v * $v) . ' J.', 'Energy is conserved: the missing ' . ($m * PHY_G * $h) . ' − ' . mlb_dec(0.5 * $m * $v * $v) . ' = ' . mlb_dec($Q) . ' J became heat (and a little sound).'], 'Energy in at the top, energy out at the bottom: where did the difference go?', 'application', 60); },
    ],
    'PH-034' => [
        // Typed: useful energy out of a generator.
        static function (MlbRng $r) { $e = $r->pick([20, 25, 30, 35, 40]); $E = $r->int(2, 30) * 20;
            return phy_num('A petrol generator turns the chemical energy of its fuel into electrical energy with an efficiency of ' . $e . '%. How much electrical energy does it give from ' . $E . ' kJ of fuel energy?', $E * $e / 100, 'kJ',
                ['Useful output = efficiency × input.', mlb_dec($e / 100) . ' × ' . $E . ' = ' . mlb_dec($E * $e / 100) . ' kJ. (The rest is wasted, mostly as heat and the noise of the engine.)'], 'Take that percentage of the input.', 'application', 40); },
        // No machine is more than 100% efficient.
        static function (MlbRng $r) { $c = $r->int(21, 30) * 5; $what = $r->pick(['a grinding machine', 'a water pump', 'a generator', 'an electric fan']);
            return mlb_mcq($r, 'A trader at the market claims that ' . $what . ' he sells is ' . $c . '% efficient. What is wrong with the claim?', 'Nothing can give out more useful energy than it takes in, so no efficiency can be above 100%',
                [['Nothing is wrong: a new, well-made machine can give out more than it takes in', 'That would mean creating energy from nothing, which never happens.'], ['Efficiency must be given in joules, not as a percentage, so the figure means nothing', 'Efficiency is a ratio of two energies, so it has no unit: a percentage is right.'], ['It should be exactly 100%, because energy is always conserved in a machine', 'Energy is conserved, but some of it is always wasted as heat and sound, so the USEFUL output is below 100%.']],
                ['Efficiency = useful energy out ÷ energy in × 100%.', 'Energy is conserved, so the useful output can never exceed the input: real machines are always below 100%.'], 'Where would the extra energy come from?', 'reasoning', 35); },
        // Spot the error: the useful output of a lamp.
        static function (MlbRng $r) { $E = $r->pick([20, 40, 60, 100]); $p = $r->pick([5, 10, 15, 20, 25, 40]); $L = $E * $p / 100; $lamp = $p >= 25 ? 'an LED lamp' : 'a filament bulb';
            $right = ['Useful energy out = the light = ' . mlb_dec($L) . ' J.', 'Efficiency = useful out ÷ total in × 100%.', 'Efficiency = ' . mlb_dec($L) . ' ÷ ' . $E . ' × 100% = ' . $p . '%.'];
            return phy_err($r, 'Each second, ' . $lamp . ' takes ' . $E . ' J of electrical energy and gives out ' . mlb_dec($L) . ' J as light. Find its efficiency. Which line holds the first mistake?', $right,
                [[0, ['Useful energy out = the heat = ' . mlb_dec($E - $L) . ' J.', 'Efficiency = useful out ÷ total in × 100%.', 'Efficiency = ' . mlb_dec($E - $L) . ' ÷ ' . $E . ' × 100% = ' . (100 - $p) . '%.'], 'A lamp is FOR light: the light is the useful output, and the heat is wasted.'],
                 [1, ['Useful energy out = the light = ' . mlb_dec($L) . ' J.', 'Efficiency = total in ÷ useful out × 100%.', 'Efficiency = ' . $E . ' ÷ ' . mlb_dec($L) . ' × 100% = ' . mlb_rd($E / $L * 100, 1) . '%.'], 'It is useful OUT ÷ total IN. An answer above 100% is impossible.'],
                 [2, ['Useful energy out = the light = ' . mlb_dec($L) . ' J.', 'Efficiency = useful out ÷ total in × 100%.', 'Efficiency = ' . mlb_dec($L) . ' ÷ ' . $E . ' = ' . mlb_dec($L / $E) . '%.'], 'The fraction ' . mlb_dec($L / $E) . ' must be multiplied by 100 to give a percentage.']]); },
    ],
    'PH-035' => [
        // Typed: the force when a ball bounces back.
        static function (MlbRng $r) { $m = $r->pick([0.1, 0.2, 0.4, 0.5]); $u = $r->int(5, 20); $v = $r->int(2, $u); $t = $r->pick([0.01, 0.02, 0.05, 0.1]); $F = $m * ($u + $v) / $t;
            return phy_num('A ' . mlb_dec($m) . ' kg ball hits a wall at ' . $u . ' m/s and rebounds straight back at ' . $v . ' m/s. It is in contact with the wall for ' . mlb_dec($t) . ' s. What average force does the wall exert on it? (Give 1 decimal place.)', mlb_rd($F, 1), 'N',
                ['Change in momentum = m(v − u) with directions: ' . mlb_dec($m) . ' × (' . $v . ' − (−' . $u . ')) = ' . mlb_dec($m * ($u + $v)) . ' kg m/s.', 'F = change in momentum ÷ time = ' . mlb_dec($m * ($u + $v)) . ' ÷ ' . mlb_dec($t) . ' = ' . mlb_rd($F, 1) . ' N.'], 'Bouncing back reverses the velocity: the speeds ADD in the change of momentum.', 'challenge', 60, 1); },
        // A longer stopping time, a smaller force.
        static function (MlbRng $r) { $ctx = $r->pick(['You catch a raw egg by letting your hands move back with it.', 'A long jumper lands in a sand pit, not on the hard track.', 'A goalkeeper pulls his hands back as he catches a hard shot.', 'You bend your knees as you jump down from a wall.']);
            return mlb_mcq($r, $ctx . ' Why does this reduce the force?', 'It makes the stopping time longer, so the same change in momentum needs a smaller force',
                [['It reduces the change in momentum, so less force is needed to stop', 'The body still goes from moving to stopped: the change in momentum is the same.'], ['It makes the stopping time shorter, so the body comes to rest before the force builds up', 'A shorter time would need a LARGER force.'], ['It spreads the mass out, so less of it has to be stopped at once', 'Nothing about catching or landing changes the mass being stopped.']],
                ['Force × time = change in momentum (impulse).', 'The change in momentum is fixed, so a longer time means a smaller force.'], 'F = change in momentum ÷ time: which part is being changed?', 'reasoning', 35); },
        // Typed, rearranged: the speed after an impulse.
        static function (MlbRng $r) { $m = $r->pick([0.5, 1, 2, 4, 5]); $v = $r->int(2, 20); $what = $r->pick(['trolley', 'football', 'hockey puck']);
            return phy_num('A ' . mlb_dec($m) . ' kg ' . $what . ' at rest receives an impulse of ' . mlb_dec($m * $v) . ' N s. How fast does it move off?', $v, 'm/s',
                ['Impulse = change in momentum = mv − 0.', 'v = impulse ÷ m = ' . mlb_dec($m * $v) . ' ÷ ' . mlb_dec($m) . ' = ' . $v . ' m/s.'], 'Impulse equals the change in momentum.', 'procedure', 40); },
    ],
    'PH-036' => [
        // Typed: one body moves on after a collision — find the other.
        static function (MlbRng $r) { $m1 = $r->int(1, 5); $m2 = $r->pick([1, 2, 4, 5]); $u1 = $r->int(4, 12); $v1 = $r->int(0, $u1 - 1); $v2 = $m1 * ($u1 - $v1) / $m2;
            return phy_num('Trolley A (' . $m1 . ' kg) moving at ' . $u1 . ' m/s hits trolley B (' . $m2 . ' kg) at rest. Afterwards A moves on at ' . $v1 . ' m/s in the same direction. How fast does B move?', mlb_dec($v2), 'm/s',
                ['Total momentum before = total after: ' . $m1 . ' × ' . $u1 . ' + 0 = ' . $m1 . ' × ' . $v1 . ' + ' . $m2 . ' × v.', $m2 . 'v = ' . ($m1 * $u1) . ' − ' . ($m1 * $v1) . ' = ' . ($m1 * ($u1 - $v1)) . ', so v = ' . mlb_dec($v2) . ' m/s.'], 'Momentum before = momentum after.', 'application', 55); },
        // Pushed apart from rest: total momentum zero.
        static function (MlbRng $r) { $ctx = $r->pick(['Two trolleys at rest are pushed apart by a spring between them.', 'Two skaters standing still on smooth ice push off each other.', 'A boy at rest in a canoe jumps out onto the bank.']);
            return mlb_mcq($r, $ctx . ' Ignoring friction, what is the TOTAL momentum just afterwards?', 'Zero: the two momenta are equal and opposite',
                [['It equals the energy released', 'Momentum and energy are different quantities: energy appears as motion, but momentum stays zero.'], ['It is the momentum of the lighter one, which moves faster', 'Both move: the heavier one moves the other way, slower, with an equal momentum.'], ['It depends on the masses', 'Whatever the masses, the total stays what it was before: zero.']],
                ['With no outside force, total momentum is conserved.', 'It was zero before, so it is zero after: m₁v₁ = −m₂v₂ — they move apart with equal and opposite momenta.'], 'What was the total momentum before?', 'reasoning', 40); },
        // Spot the error: head-on collision, directions.
        static function (MlbRng $r) { do { $m1 = $r->int(2, 8); $m2 = $r->int(2, 8); $u1 = $r->int(2, 10); $u2 = $r->int(2, 10); $P = $m1 * $u1 - $m2 * $u2; } while ($P <= 0); $M = $m1 + $m2; $v = $P / $M;
            $right = ['Take right as positive. Momentum before = ' . $m1 . ' × ' . $u1 . ' + ' . $m2 . ' × (−' . $u2 . ') = ' . $P . ' kg m/s.', 'After, they move together: (' . $m1 . ' + ' . $m2 . ')v = ' . $P . '.', 'v = ' . $P . ' ÷ ' . $M . ' = ' . mlb_rd($v, 2) . ' m/s, to the right.'];
            return phy_err($r, 'A ' . $m1 . ' kg trolley moving right at ' . $u1 . ' m/s meets a ' . $m2 . ' kg trolley moving left at ' . $u2 . ' m/s. They stick together. Find their velocity. Which line holds the first mistake?', $right,
                [[0, ['Take right as positive. Momentum before = ' . $m1 . ' × ' . $u1 . ' + ' . $m2 . ' × ' . $u2 . ' = ' . ($m1 * $u1 + $m2 * $u2) . ' kg m/s.', 'After, they move together: (' . $m1 . ' + ' . $m2 . ')v = ' . ($m1 * $u1 + $m2 * $u2) . '.', 'v = ' . ($m1 * $u1 + $m2 * $u2) . ' ÷ ' . $M . ' = ' . mlb_rd(($m1 * $u1 + $m2 * $u2) / $M, 2) . ' m/s.'], 'The second trolley moves LEFT: its velocity is −' . $u2 . ' m/s.'],
                 [1, ['Take right as positive. Momentum before = ' . $m1 . ' × ' . $u1 . ' + ' . $m2 . ' × (−' . $u2 . ') = ' . $P . ' kg m/s.', 'After: ' . $m1 . 'v = ' . $P . '.', 'v = ' . $P . ' ÷ ' . $m1 . ' = ' . mlb_rd($P / $m1, 2) . ' m/s.'], 'They move off TOGETHER: the mass afterwards is ' . $m1 . ' + ' . $m2 . ' = ' . $M . ' kg.'],
                 [2, ['Take right as positive. Momentum before = ' . $m1 . ' × ' . $u1 . ' + ' . $m2 . ' × (−' . $u2 . ') = ' . $P . ' kg m/s.', 'After, they move together: (' . $m1 . ' + ' . $m2 . ')v = ' . $P . '.', 'v = ' . $M . ' ÷ ' . $P . ' = ' . mlb_rd($M / $P, 2) . ' m/s.'], 'v = momentum ÷ mass, not mass ÷ momentum.']]); },
    ],
    'PH-037' => [
        // Typed: centripetal force on a roundabout.
        static function (MlbRng $r) { $m = $r->int(15, 30) * 10; $v = $r->int(4, 12); $rad = $r->pick([5, 10, 20, 25, 40, 50]);
            return phy_num('An okada and its rider (' . $m . ' kg together) go round a roundabout of radius ' . $rad . ' m at a steady ' . $v . ' m/s. What centripetal force is needed?', mlb_dec($m * $v * $v / $rad), 'N',
                ['F = mv² ÷ r, towards the centre.', 'F = ' . $m . ' × ' . $v . '² ÷ ' . $rad . ' = ' . ($m * $v * $v) . ' ÷ ' . $rad . ' = ' . mlb_dec($m * $v * $v / $rad) . ' N (given by friction on the tyres).'], 'Which formula gives the force towards the centre?', 'procedure', 45); },
        // The string breaks: straight on along the tangent.
        static function (MlbRng $r) { $d = $r->pick(['north', 'east', 'south', 'west']); $opp = ['north' => 'south', 'east' => 'west', 'south' => 'north', 'west' => 'east'][$d];
            return mlb_mcq($r, 'A stone is whirled in a horizontal circle on a string. At the instant the string snaps, the stone is moving due ' . $d . '. Seen from above, how does it move just afterwards?', 'In a straight line, due ' . $d . ' (along the tangent)',
                [['Straight outwards, away from the centre of the circle', 'There is no outward force: the string only ever pulled INWARDS, and now nothing pulls at all.'], ['On round the same circle, slowly widening', 'Without the string’s pull there is nothing to bend its path.'], ['Due ' . $opp . ', back the way it came', 'Nothing reverses its velocity.']],
                ['The string’s pull towards the centre is what kept bending the path into a circle.', 'With that force gone, the stone carries on in a straight line in the direction it was moving (Newton’s first law).'], 'What force acts sideways on it once the string has gone?', 'reasoning', 40); },
        // Typed: the fastest safe speed round a bend.
        static function (MlbRng $r) { $m = $r->int(8, 20) * 100; $v = $r->int(8, 18); $rad = $r->pick([20, 25, 40, 50, 100]); $F = $m * $v * $v / $rad; $veh = $r->pick(['A car', 'A danfo', 'A pick-up van']);
            return phy_num($veh . ' of mass ' . mlb_p($m) . ' kg takes a level bend of radius ' . $rad . ' m. The greatest sideways friction its tyres can give is ' . mlb_p($F) . ' N. What is the fastest it can go round without skidding?', $v, 'm/s',
                ['Friction supplies the centripetal force: F = mv² ÷ r, so v = √(Fr ÷ m).', 'v = √(' . mlb_p($F) . ' × ' . $rad . ' ÷ ' . mlb_p($m) . ') = √' . ($v * $v) . ' = ' . $v . ' m/s.'], 'Rearrange F = mv² ÷ r for v.', 'challenge', 60); },
    ],
    'PH-038' => [
        // Typed, rearranged: the length for a given period.
        static function (MlbRng $r) { $T = $r->pick([1, 1.5, 2, 2.5, 3]); $L = PHY_G * $T * $T / (4 * 3.14 * 3.14);
            return phy_num('A clock-maker needs a pendulum with a period of ' . mlb_dec($T) . ' s. How long must it be? (g = 10 m/s², π = 3.14; give 2 decimal places)', mlb_rd($L, 2), 'm',
                ['T = 2π√(L ÷ g), so L = gT² ÷ (4π²).', 'L = 10 × ' . mlb_dec($T) . '² ÷ (4 × 3.14²) = ' . mlb_dec(PHY_G * $T * $T) . ' ÷ ' . mlb_rd(4 * 3.14 * 3.14, 4) . ' = ' . mlb_rd($L, 2) . ' m.'], 'Square both sides of T = 2π√(L/g) first.', 'challenge', 65, 2); },
        // Compare: the period goes with √L.
        static function (MlbRng $r) { [$k, $right, $w1] = $r->pick([[4, 'It doubles', 'It becomes 4 times as long'], [9, 'It becomes 3 times as long', 'It becomes 9 times as long'], [0.25, 'It halves', 'It becomes a quarter as long']]);
            $what = $k > 1 ? ($k === 4 ? 'four' : 'nine') . ' times as LONG' : 'a quarter as long';
            return mlb_mcq($r, 'A simple pendulum’s string is made ' . $what . '. What happens to its period?', $right,
                [[$w1, 'The period goes with the SQUARE ROOT of the length: T ∝ √L.'], ['It does not change', 'The period does not depend on the mass, but it does depend on the length.'], [$k > 1 ? 'It halves' : 'It doubles', 'A ' . ($k > 1 ? 'longer' : 'shorter') . ' pendulum swings more ' . ($k > 1 ? 'slowly' : 'quickly') . ': the period goes ' . ($k > 1 ? 'up' : 'down') . '.']],
                ['T = 2π√(L ÷ g), so T ∝ √L.', 'Length × ' . mlb_dec($k) . ' → period × √' . mlb_dec($k) . ' = × ' . mlb_dec(sqrt($k)) . '.'], 'Which power of L does the period depend on?', 'reasoning', 40); },
        // Spot the error: T = 2π√(L/g).
        static function (MlbRng $r) { [$L, $q, $s] = $r->pick([[0.4, 0.04, 0.2], [0.9, 0.09, 0.3], [1.6, 0.16, 0.4], [2.5, 0.25, 0.5], [3.6, 0.36, 0.6]]); $T = 2 * 3.14 * $s;
            $right = ['T = 2π√(L ÷ g).', 'L ÷ g = ' . mlb_dec($L) . ' ÷ 10 = ' . mlb_dec($q) . '.', '√' . mlb_dec($q) . ' = ' . mlb_dec($s) . '.', 'T = 2 × 3.14 × ' . mlb_dec($s) . ' = ' . mlb_dec($T) . ' s.'];
            return phy_err($r, $r->pick(MLB_NAMES) . ' finds the period of a simple pendulum ' . mlb_dec($L) . ' m long. (g = 10 m/s², π = 3.14) Which line of the working holds the first mistake?', $right,
                [[2, ['T = 2π√(L ÷ g).', 'L ÷ g = ' . mlb_dec($L) . ' ÷ 10 = ' . mlb_dec($q) . '.', '√' . mlb_dec($q) . ' = ' . mlb_dec($q) . '.', 'T = 2 × 3.14 × ' . mlb_dec($q) . ' = ' . mlb_dec(6.28 * $q) . ' s.'], 'The square root has not been taken: √' . mlb_dec($q) . ' = ' . mlb_dec($s) . '.'],
                 [1, ['T = 2π√(L ÷ g).', 'L ÷ g = 10 ÷ ' . mlb_dec($L) . ' = ' . mlb_rd(10 / $L, 3) . '.', '√' . mlb_rd(10 / $L, 3) . ' = ' . mlb_rd(1 / $s, 3) . '.', 'T = 2 × 3.14 × ' . mlb_rd(1 / $s, 3) . ' = ' . mlb_rd(6.28 / $s, 2) . ' s.'], 'It is L divided by g, not g divided by L.'],
                 [3, ['T = 2π√(L ÷ g).', 'L ÷ g = ' . mlb_dec($L) . ' ÷ 10 = ' . mlb_dec($q) . '.', '√' . mlb_dec($q) . ' = ' . mlb_dec($s) . '.', 'T = 3.14 × ' . mlb_dec($s) . ' = ' . mlb_dec(3.14 * $s) . ' s.'], 'The formula has 2π, not π.']]); },
    ],
    'PH-039' => [
        // Typed: apparent weight in water.
        static function (MlbRng $r) { $U = $r->int(2, 30); $W = $U + $r->int(5, 60); $what = $r->pick(['A stone', 'A metal key', 'A fishing sinker', 'A brass weight']);
            return phy_num($what . ' weighs ' . $W . ' N in air. When it is fully under water, the upthrust on it is ' . $U . ' N. What does a spring balance read now?', $W - $U, 'N',
                ['The upthrust pushes up, so the balance supports less.', 'Apparent weight = weight − upthrust = ' . $W . ' − ' . $U . ' = ' . ($W - $U) . ' N.'], 'Which way does the upthrust act?', 'procedure', 35); },
        // Deeper does not mean more upthrust.
        static function (MlbRng $r) { $what = $r->pick(['A stone hanging from a spring balance', 'A metal block on a string', 'A fishing sinker on a line']);
            return mlb_mcq($r, $what . ' is fully under water in a deep bucket. It is lowered deeper, still not touching the bottom. What happens to the upthrust on it?', 'It stays the same',
                [['It increases, because the pressure increases with depth', 'The pressure on the top AND the bottom both rise; their difference — the upthrust — does not change.'], ['It decreases, because there is more water above it', 'Water above pushes down on the top, but more water below pushes up: the difference is unchanged.'], ['It becomes zero near the bottom', 'Upthrust acts as long as it is surrounded by water.']],
                ['Archimedes: upthrust = weight of fluid displaced.', 'Fully under water, it displaces its own volume wherever it is, so the upthrust is the same at every depth.'], 'Does the volume of water it pushes aside change?', 'reasoning', 40); },
        // Typed: volume from the upthrust.
        static function (MlbRng $r) { [$liq, $rho] = $r->pick([['water', 1000], ['kerosene', 800]]); $V = $r->int(2, 40) * 50; $U = $rho * $V / 1000000 * PHY_G;
            return phy_num('An object fully under ' . $liq . ' (density ' . $rho . ' kg/m³) feels an upthrust of ' . mlb_dec($U) . ' N. What is its volume, in cm³? (g = 10 m/s²)', $V, 'cm³',
                ['Upthrust = weight of liquid displaced = Vρg, so V = U ÷ (ρg).', 'V = ' . mlb_dec($U) . ' ÷ (' . $rho . ' × 10) = ' . mlb_dec($V / 1000000) . ' m³ = ' . $V . ' cm³ (1 m³ = 1 000 000 cm³).'], 'Rearrange U = Vρg, then change m³ to cm³.', 'challenge', 60); },
    ],
    'PH-040' => [
        // A ship floats higher in denser water.
        static function (MlbRng $r) { $ctx = $r->pick(['A cargo ship sails down the River Niger and out into the Atlantic Ocean.', 'A fishing canoe is paddled from the creek out into the salt-water sea.', 'A barge moves from a freshwater river into the sea at the Niger Delta.']);
            return mlb_mcq($r, $ctx . ' Sea water is denser than river water. What happens to how it floats?', 'It floats a little higher, because it displaces less of the denser water',
                [['It sinks lower, because salt water is heavier and pulls it down', 'Denser water gives the same upthrust with LESS volume pushed aside, so it rises.'], ['It floats exactly as before, because its weight has not changed', 'The upthrust is the same, but the volume that gives it changes with the density.'], ['The upthrust on it increases, because sea water pushes harder on everything', 'A floating body’s upthrust always equals its weight, which has not changed.']],
                ['Floating: upthrust = weight, and upthrust = V × ρ × g.', 'Same weight, bigger ρ: a smaller V is under water, so it floats higher.'], 'The upthrust must still equal the weight. What can change?', 'reasoning', 40); },
        // Spot the error: relative density from weighings.
        static function (MlbRng $r) { $rd = $r->pick([2, 2.5, 4, 5, 8]); $U = $r->int(2, 12) * 2; $Wa = $rd * $U; $Ww = $Wa - $U;
            $right = ['Loss of weight in water = ' . mlb_dec($Wa) . ' − ' . mlb_dec($Ww) . ' = ' . $U . ' N.', 'RD = weight in air ÷ loss of weight in water.', 'RD = ' . mlb_dec($Wa) . ' ÷ ' . $U . ' = ' . mlb_dec($rd) . '.'];
            return phy_err($r, 'A solid weighs ' . mlb_dec($Wa) . ' N in air and ' . mlb_dec($Ww) . ' N fully under water. Find its relative density. Which line holds the first mistake?', $right,
                [[1, ['Loss of weight in water = ' . mlb_dec($Wa) . ' − ' . mlb_dec($Ww) . ' = ' . $U . ' N.', 'RD = loss of weight ÷ weight in air.', 'RD = ' . $U . ' ÷ ' . mlb_dec($Wa) . ' = ' . mlb_rd($U / $Wa, 3) . '.'], 'It is weight in air ÷ loss in water. A solid that sinks must have RD above 1.'],
                 [2, ['Loss of weight in water = ' . mlb_dec($Wa) . ' − ' . mlb_dec($Ww) . ' = ' . $U . ' N.', 'RD = weight in air ÷ loss of weight in water.', 'RD = ' . mlb_dec($Wa) . ' ÷ ' . mlb_dec($Ww) . ' = ' . mlb_rd($Wa / $Ww, 3) . '.'], 'Divide by the LOSS of weight (' . $U . ' N), not by the weight in water.'],
                 [0, ['Loss of weight in water = ' . mlb_dec($Wa) . ' + ' . mlb_dec($Ww) . ' = ' . mlb_dec($Wa + $Ww) . ' N.', 'RD = weight in air ÷ loss of weight in water.', 'RD = ' . mlb_dec($Wa) . ' ÷ ' . mlb_dec($Wa + $Ww) . ' = ' . mlb_rd($Wa / ($Wa + $Ww), 3) . '.'], 'The loss is the DIFFERENCE between the two weighings.']]); },
    ],
    ];
}

/* ═══ Stage 5 — Heat, Waves and Light ═══ */
function phy_more_5(): array {
    return [
    'PH-041' => [
        // Spot the error: a temperature difference in kelvin.
        static function (MlbRng $r) { $a = $r->int(15, 30); $b = $a + $r->int(5, 40); $A = $a + 273; $B = $b + 273;
            $right = ['T₁ = ' . $a . ' + 273 = ' . $A . ' K.', 'T₂ = ' . $b . ' + 273 = ' . $B . ' K.', 'Rise = ' . $B . ' − ' . $A . ' = ' . ($b - $a) . ' K.'];
            return phy_err($r, 'Water in a pot warms from ' . $a . ' °C to ' . $b . ' °C. Find the rise in temperature in kelvin. Which line holds the first mistake?', $right,
                [[0, ['T₁ = ' . $a . ' − 273 = ' . ($a - 273) . ' K.', 'T₂ = ' . $b . ' + 273 = ' . $B . ' K.', 'Rise = ' . $B . ' − (' . ($a - 273) . ') = ' . ($B - $a + 273) . ' K.'], 'Celsius to kelvin ADDS 273: kelvin numbers are always the bigger ones.'],
                 [2, ['T₁ = ' . $a . ' + 273 = ' . $A . ' K.', 'T₂ = ' . $b . ' + 273 = ' . $B . ' K.', 'Rise = ' . ($b - $a) . ' + 273 = ' . ($b - $a + 273) . ' K.'], 'The 273s cancel in a difference: a change of 1 °C IS a change of 1 K.'],
                 [1, ['T₁ = ' . $a . ' + 273 = ' . $A . ' K.', 'T₂ = ' . $b . ' − 273 = ' . ($b - 273) . ' K.', 'Rise = ' . ($b - 273) . ' − ' . $A . ' = ' . ($b - 273 - $A) . ' K.'], 'Both temperatures convert the same way: add 273.']]); },
        // Typed: a temperature rise is the same number in K and °C.
        static function (MlbRng $r) { $city = $r->pick(['Kano', 'Maiduguri', 'Sokoto', 'Jos', 'Kaduna']); $a = $r->int(10, 20); $b = $a + $r->int(12, 25);
            return phy_num('On a harmattan day in ' . $city . ', the temperature rises from ' . $a . ' °C at dawn to ' . $b . ' °C in the afternoon. What is the rise in KELVIN?', $b - $a, 'K',
                ['A kelvin is the same SIZE as a degree Celsius; the scales differ only in where zero is.', 'So the rise is ' . $b . ' − ' . $a . ' = ' . ($b - $a) . ' K. (Adding 273 to both temperatures changes nothing in the difference.)'], 'Would adding 273 to both readings change their difference?', 'reasoning', 35); },
    ],
    'PH-042' => [
        // Typed: linear expansivity from an experiment.
        static function (MlbRng $r) { [$metal, $al] = $r->pick([['steel', 12], ['iron', 12], ['copper', 17], ['brass', 19], ['aluminium', 23]]); $L = $r->pick([0.5, 1, 2]); $dT = $r->pick([50, 80, 100]); $dL = $al * $L * $dT / 1000;
            return phy_num(($metal === 'aluminium' ? 'An ' : 'A ') . $metal . ' rod ' . mlb_dec($L) . ' m long expands by ' . mlb_dec($dL) . ' mm when heated through ' . $dT . ' °C. What is its linear expansivity? Give it in units of 10⁻⁶ /°C.', $al, '× 10⁻⁶ /°C',
                ['α = increase in length ÷ (original length × temperature rise), with both lengths in the same unit.', mlb_dec($dL) . ' mm = ' . mlb_dec($dL / 1000) . ' m. α = ' . mlb_dec($dL / 1000) . ' ÷ (' . mlb_dec($L) . ' × ' . $dT . ') = ' . $al . ' × 10⁻⁶ /°C.'], 'Put both lengths in metres before you divide.', 'application', 60); },
        // Typed: the gap to leave between rails.
        static function (MlbRng $r) { $L = $r->pick([10, 12, 15, 20]); $a = $r->int(18, 25); $b = $r->int(45, 60); $dL = 12 * $L * ($b - $a) / 1000;
            return phy_num('Steel rails ' . $L . ' m long are laid on a cool harmattan morning at ' . $a . ' °C. In the hottest afternoon sun they reach ' . $b . ' °C. What gap, in mm, must be left between neighbouring rails? (α for steel = 12 × 10⁻⁶ /°C)', mlb_rd($dL, 3), 'mm',
                ['Expansion = α × L × temperature rise.', '12 × 10⁻⁶ × ' . $L . ' × ' . ($b - $a) . ' = ' . mlb_rd($dL / 1000, 6) . ' m = ' . mlb_rd($dL, 3) . ' mm.'], 'The gap must take the whole expansion of one rail.', 'application', 55); },
        // A hole grows on heating.
        static function (MlbRng $r) { $what = $r->pick(['a steel washer', 'an iron plate with a hole for a bolt', 'a brass ring']);
            return mlb_mcq($r, 'There is a hole in ' . $what . '. The metal is heated evenly. What happens to the size of the hole?', 'It gets bigger',
                [['It gets smaller, because the metal expands into it', 'The metal expands in every direction, like a photograph being enlarged: the hole is enlarged with it.'], ['It stays the same', 'Every length in the metal grows, including the edge around the hole.'], ['It gets bigger on one side only', 'Even heating means even expansion.']],
                ['When a solid expands, every length in it grows by the same fraction.', 'The circle around the hole is a length too, so the hole gets bigger. (That is how a tight metal ring is fitted: heat it, slip it on, let it cool.)'], 'Imagine the ring of metal around the hole getting longer.', 'reasoning', 40); },
    ],
    'PH-043' => [
        // Typed, rearranged: specific heat capacity from data.
        static function (MlbRng $r) { [$metal, $c] = $r->pick([['copper', 390], ['iron', 450], ['aluminium', 900], ['lead', 130]]); $m = $r->pick([0.5, 1, 2]); $dT = $r->pick([10, 20, 25, 40, 50]); $Q = $m * $c * $dT;
            return phy_num('A ' . mlb_dec($m) . ' kg block of ' . $metal . ' is given ' . mlb_p($Q) . ' J of heat, and its temperature rises by ' . $dT . ' °C. What is the specific heat capacity of ' . $metal . '?', $c, 'J/kg°C',
                ['Q = mcΔθ, so c = Q ÷ (mΔθ).', 'c = ' . mlb_p($Q) . ' ÷ (' . mlb_dec($m) . ' × ' . $dT . ') = ' . $c . ' J/kg°C.'], 'Rearrange Q = mcΔθ for c.', 'procedure', 45); },
        // Heat energy is not temperature.
        static function (MlbRng $r) { [$small, $big] = $r->pick([['a cup of tea', 'a big pot of soup'], ['a spoonful of hot water', 'a bucket of hot water'], ['a teaspoon of hot oil', 'a large pot of hot oil']]); $t = $r->int(6, 9) * 10;
            return mlb_mcq($r, ucfirst($small) . ' and ' . $big . ' are both at ' . $t . ' °C. Which holds more heat (internal) energy?', ucfirst($big) . ', because there is much more of it at the same temperature',
                [['Neither: they hold the same, because their temperature is the same', 'Temperature says how hot each particle is on average; the total energy also depends on how much there is.'], [ucfirst($small) . ', because the heat is more concentrated', 'Concentration does not add energy: more substance at the same temperature holds more.'], ['Neither holds any heat until it starts to cool', 'Both hold internal energy now; “heat” is the energy that flows when they cool.']],
                ['Temperature measures how hot something is; heat energy depends on the temperature AND the mass (and the material).', 'At the same temperature, ' . $big . ' has far more mass, so it holds far more energy — it would melt far more ice.'], 'Which would melt more ice?', 'concept', 40); },
    ],
    'PH-044' => [
        // Steam scalds worse.
        static function (MlbRng $r) { $src = $r->pick(['the spout of a boiling kettle', 'the lid of a pot of boiling rice', 'the valve of a pressure cooker']);
            return mlb_mcq($r, 'Steam from ' . $src . ' at 100 °C gives a much worse scald than the same mass of boiling water at 100 °C. Why?', 'The steam gives out its latent heat as it condenses on the skin, and then more heat as the water cools',
                [['Steam is much hotter than 100 °C, even though a thermometer in it reads 100 °C', 'Both are at 100 °C here: the difference is the hidden (latent) heat.'], ['Steam moves much faster than water, so it strikes the skin harder and gets deeper in', 'It is the energy given out, not the speed of the steam.'], ['Water at 100 °C cannot burn skin, because it cools the moment it touches you', 'It can and does; steam just carries much more energy per kilogram.']],
                ['Each kilogram of steam that condenses gives out about 2 260 000 J of latent heat — far more than the water gives in cooling.', 'So steam at 100 °C delivers far more energy to the skin than water at 100 °C.'], 'What happens to steam when it touches cooler skin?', 'reasoning', 40); },
        // Typed, rearranged: latent heat of fusion from a heater experiment.
        static function (MlbRng $r) { $L = $r->pick([330000, 332000, 334000, 336000, 340000]); $m = $r->pick([0.05, 0.1, 0.2]); $P = $r->pick([50, 100, 200]); $t = $L * $m / $P;
            return phy_num('In an experiment, a ' . $P . ' W heater melts ' . mlb_dec($m) . ' kg of ice at 0 °C in ' . mlb_dec($t) . ' s. Assuming no heat is lost, what value does this give for the specific latent heat of fusion of ice?', $L, 'J/kg',
                ['Heat supplied = power × time = ' . $P . ' × ' . mlb_dec($t) . ' = ' . mlb_p($P * $t) . ' J.', 'L = Q ÷ m = ' . mlb_p($P * $t) . ' ÷ ' . mlb_dec($m) . ' = ' . mlb_p($L) . ' J/kg.'], 'Find the energy supplied first, then share it per kilogram.', 'application', 55); },
        // Spot the error: no temperature change while melting.
        static function (MlbRng $r) { $m = $r->int(1, 20) / 10;
            $right = ['While ice melts its temperature does not change, so use Q = mL.', 'Q = ' . mlb_dec($m) . ' × 336 000.', 'Q = ' . mlb_p(round($m * 336000)) . ' J.'];
            return phy_err($r, 'How much heat melts ' . mlb_dec($m) . ' kg of ice at 0 °C into water at 0 °C? (L = 336 000 J/kg) Which line holds the first mistake?', $right,
                [[0, ['Use Q = mcΔθ, with c = 4200 J/kg°C.', 'Q = ' . mlb_dec($m) . ' × 4200 × 0.', 'Q = 0 J.'], 'There is no temperature change while ice melts: the heat is latent heat, Q = mL.'],
                 [1, ['While ice melts its temperature does not change, so use Q = mL.', 'Q = 336 000 ÷ ' . mlb_dec($m) . '.', 'Q = ' . mlb_p(round(336000 / $m)) . ' J.'], 'Q = mL means multiply the mass by L.'],
                 [2, ['While ice melts its temperature does not change, so use Q = mL.', 'Q = ' . mlb_dec($m) . ' × 336 000.', 'Q = ' . mlb_p(round($m * 336000 * 10)) . ' J.'], 'Check the multiplication: ' . mlb_dec($m) . ' × 336 000 = ' . mlb_p(round($m * 336000)) . '.']]); },
    ],
    'PH-045' => [
        // Typed: the pressure law with a Celsius-to-kelvin step.
        static function (MlbRng $r) { $P1 = $r->pick([200, 220, 240, 250, 300]); $a = $r->pick([17, 27]); $b = $a + $r->pick([15, 20, 30, 33]); $T1 = $a + 273; $T2 = $b + 273; $P2 = $P1 * $T2 / $T1;
            return phy_num('A car tyre is at ' . $P1 . ' kPa on a harmattan morning at ' . $a . ' °C. After a long drive in the afternoon sun the air inside is at ' . $b . ' °C. Assuming its volume does not change, what is the new pressure? (Give 1 decimal place.)', mlb_rd($P2, 1), 'kPa',
                ['Fixed volume: p ÷ T is constant, with T in KELVIN: T₁ = ' . $T1 . ' K, T₂ = ' . $T2 . ' K.', 'p₂ = ' . $P1 . ' × ' . $T2 . ' ÷ ' . $T1 . ' = ' . mlb_rd($P2, 1) . ' kPa.'], 'Gas laws work in kelvin.', 'application', 60, 1); },
        // Spot the error: Charles' law in Celsius.
        static function (MlbRng $r) { $V1 = $r->int(2, 10) * 60; $T2 = $r->pick([330, 360, 375, 400, 450]); $b = $T2 - 273; $V2 = $V1 * $T2 / 300;
            $right = ['T₁ = 27 + 273 = 300 K; T₂ = ' . $b . ' + 273 = ' . $T2 . ' K.', 'At constant pressure V ÷ T is constant: V₂ = V₁ × T₂ ÷ T₁.', 'V₂ = ' . $V1 . ' × ' . $T2 . ' ÷ 300 = ' . mlb_dec($V2) . ' cm³.'];
            return phy_err($r, 'A gas has a volume of ' . $V1 . ' cm³ at 27 °C. At constant pressure, what is its volume at ' . $b . ' °C? Which line holds the first mistake?', $right,
                [[0, ['T₁ = 27; T₂ = ' . $b . '.', 'At constant pressure V ÷ T is constant: V₂ = V₁ × T₂ ÷ T₁.', 'V₂ = ' . $V1 . ' × ' . $b . ' ÷ 27 = ' . mlb_rd($V1 * $b / 27, 1) . ' cm³.'], 'Gas-law temperatures must be in kelvin; in °C, a gas at 0 °C would have no volume.'],
                 [1, ['T₁ = 27 + 273 = 300 K; T₂ = ' . $b . ' + 273 = ' . $T2 . ' K.', 'At constant pressure V ÷ T is constant: V₂ = V₁ × T₁ ÷ T₂.', 'V₂ = ' . $V1 . ' × 300 ÷ ' . $T2 . ' = ' . mlb_rd($V1 * 300 / $T2, 1) . ' cm³.'], 'Hotter gas at the same pressure takes MORE room: V₂ = V₁ × T₂ ÷ T₁.']]); },
        // Which graph is a straight line through the origin?
        static function (MlbRng $r) { $boyle = $r->int(0, 1) === 0;
            if ($boyle) return mlb_mcq($r, 'For a fixed mass of gas at constant TEMPERATURE, which graph is a straight line through the origin?', 'Pressure against 1 ÷ volume',
                [['Pressure against volume', 'p against V is a curve: p falls as V rises (pV is constant).'], ['Volume against temperature in °C', 'That is a different law, and in °C the line does not pass through the origin.'], ['Pressure against volume squared', 'pV = constant gives p ∝ 1/V, not 1/V² or V².']],
                ['Boyle’s law: pV = constant, so p = constant × (1/V).', 'A graph of p against 1/V is therefore a straight line through the origin.'], 'Rewrite pV = k as p = k × (something).', 'concept', 40);
            return mlb_mcq($r, 'For a fixed mass of gas at constant PRESSURE, which graph is a straight line through the origin?', 'Volume against temperature in kelvin',
                [['Volume against temperature in °C', 'In °C the line is straight but meets the temperature axis at −273 °C, not at the origin.'], ['Volume against 1 ÷ temperature', 'V is proportional to T itself, not to 1/T.'], ['Pressure against volume', 'Pressure is held constant here.']],
                ['Charles’ law: V ÷ T is constant, with T in kelvin.', 'So V against T (in K) is a straight line through the origin, at 0 K.'], 'Which temperature scale starts at the true zero?', 'concept', 40); },
    ],
    'PH-046' => [
        // Typed, rearranged: the frequency.
        static function (MlbRng $r) { $f = $r->int(2, 12); $lam = $r->pick([0.1, 0.2, 0.25, 0.4, 0.5, 1.5]); $where = $r->pick(['a fish pond', 'a ripple tank in the laboratory', 'a puddle after the rain']);
            return phy_num('Ripples on ' . $where . ' travel at ' . mlb_dec($f * $lam) . ' m/s and have a wavelength of ' . mlb_dec($lam) . ' m. What is their frequency?', $f, 'Hz',
                ['v = fλ, so f = v ÷ λ.', 'f = ' . mlb_dec($f * $lam) . ' ÷ ' . mlb_dec($lam) . ' = ' . $f . ' Hz.'], 'Rearrange v = fλ.', 'procedure', 40); },
        // Typed: the wavelength of an FM station.
        static function (MlbRng $r) { $f = $r->pick([88.9, 92.3, 93.7, 95.1, 96.9, 99.3, 100.5, 103.5, 105.9]);
            return phy_num('An FM radio station in Lagos broadcasts on ' . mlb_dec($f) . ' MHz. Radio waves travel at 3 × 10⁸ m/s. What is the wavelength? (Give 2 decimal places.)', mlb_rd(300 / $f, 2), 'm',
                ['λ = v ÷ f, with f in hertz: ' . mlb_dec($f) . ' MHz = ' . mlb_dec($f) . ' × 10⁶ Hz.', 'λ = 3 × 10⁸ ÷ (' . mlb_dec($f) . ' × 10⁶) = 300 ÷ ' . mlb_dec($f) . ' = ' . mlb_rd(300 / $f, 2) . ' m.'], 'Mega means a million: change MHz to Hz.', 'application', 50, 2); },
        // What stays the same when a wave changes medium.
        static function (MlbRng $r) { $ctx = $r->pick(['Water waves move from deep water into shallow water, where they travel more slowly.', 'Sound passes from air into water, where it travels faster.', 'Light passes from air into a glass block, where it travels more slowly.']);
            return mlb_mcq($r, $ctx . ' Which property of the wave stays the SAME?', 'Its frequency',
                [['Its speed', 'The speed is exactly what changes between the two media.'], ['Its wavelength', 'With the speed changed and v = fλ, the wavelength must change too.'], ['Its direction, always', 'At an angle the direction changes too: that is refraction.']],
                ['The frequency is set by the source: every wave crest arriving at the boundary leaves it.', 'So f is fixed, and since v = fλ, a change in speed changes the wavelength.'], 'What decides how many waves arrive each second?', 'reasoning', 40); },
    ],
    'PH-047' => [
        // Typed: lightning and thunder — not an echo.
        static function (MlbRng $r) { $t = $r->int(2, 12);
            return phy_num('During a storm, a boy sees a flash of lightning and hears the thunder ' . $t . ' s later. How far away was the lightning? (sound: 330 m/s; the light arrives almost instantly)', 330 * $t, 'm',
                ['The light arrives at once; the sound takes ' . $t . ' s to travel ONE way.', 'd = 330 × ' . $t . ' = ' . mlb_p(330 * $t) . ' m. (No halving: this is not an echo.)'], 'Does the sound go there and back, or just one way?', 'reasoning', 40); },
        // Typed: the time for an echo.
        static function (MlbRng $r) { $where = $r->pick(['down a dry well', 'towards a cliff', 'towards a tall school building']); $d = $where === 'down a dry well' ? $r->pick([33, 66]) : $r->int(5, 20) * 33;
            return phy_num('A girl shouts ' . $where . ($where === 'down a dry well' ? ' whose water surface is ' : ' ') . $d . ' m away. Sound travels at 330 m/s. How long after the shout does she hear the echo?', mlb_dec(2 * $d / 330), 's',
                ['The echo goes there AND back: ' . $d . ' × 2 = ' . (2 * $d) . ' m.', 't = distance ÷ speed = ' . (2 * $d) . ' ÷ 330 = ' . mlb_dec(2 * $d / 330) . ' s.'], 'How far does the sound travel before she hears it?', 'application', 45); },
        // Loudness against pitch.
        static function (MlbRng $r) { $c = $r->int(0, 2);
            [$act, $right, $w] = [
                ['A guitar string is plucked HARDER.', 'It sounds louder; the pitch stays the same', 'A harder pluck gives a bigger amplitude (louder), not a faster vibration.'],
                ['A talking drum is struck harder, with its strings held the same.', 'It sounds louder; the pitch stays the same', 'Striking harder gives a bigger amplitude (louder); squeezing the strings is what changes the pitch.'],
                ['A guitar string is TIGHTENED and plucked as before.', 'Its pitch rises; the loudness stays about the same', 'Tightening makes the string vibrate faster: a higher frequency, a higher pitch.']][$c];
            $opts = [['It sounds louder; the pitch stays the same', 'Loudness comes from the amplitude.'], ['Its pitch rises; the loudness stays about the same', 'Pitch comes from the frequency.'], ['It sounds louder and higher', 'Amplitude and frequency are separate: one change does not set both.'], ['Nothing changes', 'Something about the vibration has changed.']];
            $wrong = []; foreach ($opts as [$t, $why]) if ($t !== $right) $wrong[] = [$t, $why];
            return mlb_mcq($r, $act . ' What changes in the sound?', $right, $wrong, ['Loudness depends on amplitude; pitch depends on frequency.', $w], 'Is the vibration bigger, or faster?', 'concept', 35); },
    ],
    'PH-048' => [
        // Typed: walking towards a mirror.
        static function (MlbRng $r) { $d = $r->int(4, 10); $k = $r->int(1, $d - 1); $who = $r->pick(MLB_NAMES);
            return phy_num($who . ' stands ' . $d . ' m in front of a large plane mirror, then walks ' . $k . ' m straight towards it. How far is ' . $who . ' from the image now?', 2 * ($d - $k), 'm',
                ['The image is as far BEHIND the mirror as the object is in front.', 'Now ' . ($d - $k) . ' m from the mirror, so the image is ' . ($d - $k) . ' m behind it: ' . ($d - $k) . ' + ' . ($d - $k) . ' = ' . (2 * ($d - $k)) . ' m apart.'], 'Find the distance to the mirror first; where is the image?', 'application', 45); },
        // Lateral inversion.
        static function (MlbRng $r) { if ($r->int(0, 1) === 0)
                return mlb_mcq($r, 'Why is the word AMBULANCE written back-to-front on the front of an ambulance?', 'So drivers ahead read it the right way round in their mirrors',
                    [['So that it is harder for other vehicles to copy the sign', 'It is about reading, not copying.'], ['Because a driver’s mirror turns all writing upside down', 'A plane mirror reverses left and right (lateral inversion), not up and down.'], ['So that people on the pavement can read it as it passes', 'They would see it reversed; only a mirror turns it back.']],
                    ['A plane mirror reverses left and right (lateral inversion).', 'Written reversed, the word is turned back the right way in a driver’s mirror.'], 'Who looks at the front of an ambulance through a mirror?', 'concept', 30);
            $hand = $r->pick(['RIGHT', 'LEFT']); $other = $hand === 'RIGHT' ? 'left' : 'right';
            return mlb_mcq($r, 'A boy facing a plane mirror raises his ' . $hand . ' hand. To him, which hand does his image seem to raise?', 'Its ' . $other . ' hand',
                [['Its ' . strtolower($hand) . ' hand', 'The image faces him, so its sides are swapped: lateral inversion.'], ['Both hands', 'The image copies exactly one hand.'], ['Neither: images do not move', 'The image moves with him, point for point.']],
                ['A plane mirror gives lateral inversion: left and right are swapped.', 'So his ' . strtolower($hand) . ' hand appears as the image’s ' . $other . ' hand.'], 'Imagine the image as a person facing you.', 'concept', 30); },
    ],
    'PH-049' => [
        // Typed: real and apparent depth.
        static function (MlbRng $r) { $d = $r->pick([1.2, 1.6, 2, 2.4, 3, 4]); $where = $r->pick(['a clear swimming pool', 'a clear stream', 'a well of clear water']);
            return phy_num('The bottom of ' . $where . ' is ' . mlb_dec($d) . ' m below the surface. Looking straight down, how deep does it appear? (refractive index of water = 4/3)', mlb_dec($d * 3 / 4), 'm',
                ['Refractive index = real depth ÷ apparent depth, so apparent depth = real ÷ n.', mlb_dec($d) . ' ÷ (4/3) = ' . mlb_dec($d) . ' × 3/4 = ' . mlb_dec($d * 3 / 4) . ' m: shallower than it really is.'], 'n = real depth ÷ apparent depth.', 'application', 45); },
        // Why the bottom looks shallow.
        static function (MlbRng $r) { [$what, $seem] = $r->pick([['A coin at the bottom of a bucket of water', 'seems nearer the surface than it really is'], ['A fish in a clear pond', 'seems nearer the surface than it really is'], ['Stones on the bed of a clear stream', 'seem nearer the surface than they really are']]);
            return mlb_mcq($r, $what . ' ' . $seem . '. Why?', 'Light from them bends AWAY from the normal as it leaves the water',
                [['The water magnifies them', 'A flat water surface does not magnify; it shifts where the light seems to come from.'], ['Light bends TOWARDS the normal as it leaves the water', 'Going from water into air (less dense) it bends AWAY from the normal.'], ['Light slows down as it comes out into the air', 'It speeds up in air; that is WHY it bends away from the normal.']],
                ['Leaving water for air, light speeds up and bends away from the normal.', 'Your eye traces the rays back in straight lines, to a point above where the object really is.'], 'Which way does light bend going into a less dense medium?', 'reasoning', 40); },
    ],
    'PH-050' => [
        // Where the object is decides the image.
        static function (MlbRng $r) { $c = $r->int(0, 2);
            $rows = [['closer to a converging lens than its principal focus F', 'Virtual, upright and magnified (a magnifying glass)'], ['between F and 2F in front of a converging lens', 'Real, inverted and magnified (a projector)'], ['beyond 2F in front of a converging lens', 'Real, inverted and diminished (a camera or the eye)']];
            [$where, $right] = $rows[$c];
            $wrong = []; foreach ($rows as $i => $x) if ($i !== $c) $wrong[] = [$x[1], 'That is the image when the object is ' . $x[0] . '.'];
            $wrong[] = ['No image is formed at all', 'Only an object exactly AT F gives no image (the rays come out parallel).'];
            return mlb_mcq($r, 'An object is placed ' . $where . '. What kind of image forms?', $right, $wrong,
                ['Draw two rays: one parallel to the axis (bent through F), one through the optical centre (straight on).', 'With the object ' . $where . ', they give: ' . mb_strtolower($right) . '.'], 'Where is the object compared with F and 2F?', 'concept', 40); },
        // Spot the error: the lens formula.
        static function (MlbRng $r) { [$f, $u, $v] = $r->pick([[10, 15, 30], [10, 20, 20], [15, 20, 60], [12, 20, 30], [20, 30, 60], [10, 30, 15], [6, 10, 15]]);
            $right = ['1/f = 1/u + 1/v.', '1/v = 1/' . $f . ' − 1/' . $u . ' = ' . mlb_frac($u - $f, $f * $u) . '.', 'v = ' . $v . ' cm.'];
            return phy_err($r, 'An object is ' . $u . ' cm from a converging lens of focal length ' . $f . ' cm. Find the image distance (real-is-positive). Which line holds the first mistake?', $right,
                [[2, ['1/f = 1/u + 1/v.', '1/v = 1/' . $f . ' − 1/' . $u . ' = ' . mlb_frac($u - $f, $f * $u) . '.', 'v = ' . mlb_frac($u - $f, $f * $u) . ' cm.'], 'That is 1/v. Turn it upside down to get v.'],
                 [1, ['1/f = 1/u + 1/v.', '1/v = 1/' . $f . ' + 1/' . $u . ' = ' . mlb_frac($u + $f, $f * $u) . '.', 'v = ' . mlb_frac($f * $u, $u + $f) . ' cm.'], 'Moving 1/u to the other side SUBTRACTS it: 1/v = 1/f − 1/u.'],
                 [0, ['f = u + v.', 'v = ' . $f . ' − ' . $u . ' = ' . ($f - $u) . '.', 'v = ' . ($f - $u) . ' cm.'], 'The lens formula adds RECIPROCALS: 1/f = 1/u + 1/v.']]); },
        // Typed: the focal length from an object and image distance.
        static function (MlbRng $r) { [$f, $u, $v] = $r->pick([[10, 15, 30], [10, 20, 20], [15, 20, 60], [12, 20, 30], [20, 30, 60], [10, 30, 15], [6, 10, 15], [8, 12, 24]]);
            return phy_num('A candle ' . $u . ' cm from a converging lens gives a sharp image on a screen ' . $v . ' cm on the other side. What is the focal length of the lens?', $f, 'cm',
                ['1/f = 1/u + 1/v = 1/' . $u . ' + 1/' . $v . ' = ' . mlb_frac($u + $v, $u * $v) . '.', 'f = ' . $f . ' cm. (Or f = uv ÷ (u + v) = ' . ($u * $v) . ' ÷ ' . ($u + $v) . '.)'], 'Add the two reciprocals, then turn the result upside down.', 'procedure', 50); },
    ],
    ];
}

/* ═══ Stage 6 — Electricity, Magnetism and the Nucleus ═══ */
function phy_more_6(): array {
    return [
    'PH-051' => [
        // Typed: how many electrons pass.
        static function (MlbRng $r) { $I = $r->pick([0.2, 0.4, 0.5, 1, 2]); $t = $r->pick([2, 4, 8, 10, 16]); $n = 6.25 * $I * $t; $what = $r->pick(['a torch bulb', 'a phone charger cable', 'a ceiling fan']);
            return phy_num('A current of ' . mlb_dec($I) . ' A flows through ' . $what . ' for ' . $t . ' s. How many electrons pass any point? Give the answer in units of 10¹⁸. (charge on an electron = 1.6 × 10⁻¹⁹ C)', mlb_dec($n), '× 10¹⁸',
                ['Charge Q = It = ' . mlb_dec($I) . ' × ' . $t . ' = ' . mlb_dec($I * $t) . ' C.', 'Number = Q ÷ e = ' . mlb_dec($I * $t) . ' ÷ (1.6 × 10⁻¹⁹) = ' . mlb_dec($n) . ' × 10¹⁸.'], 'Find the total charge, then divide by the charge on one electron.', 'application', 60); },
        // Current is not used up.
        static function (MlbRng $r) { $I = $r->pick([0.2, 0.3, 0.5, 1.5, 2]); $what = $r->pick(['a torch bulb', 'a small motor', 'a phone charger', 'a ceiling fan']);
            return mlb_mcq($r, 'A current of ' . mlb_dec($I) . ' A flows INTO ' . $what . '. What current flows OUT of it on the other side?', mlb_dec($I) . ' A',
                [['Less than ' . mlb_dec($I) . ' A, because some current is used up', 'Current is not used up: the charges flow all the way round. What the device takes is ENERGY.'], ['0 A, because it is all turned into light, heat or motion', 'Energy is transferred, but every charge that goes in comes out.'], ['More than ' . mlb_dec($I) . ' A', 'Nothing adds charge inside the device.']],
                ['In a series path, the current is the same everywhere: charge is conserved.', 'The device converts electrical ENERGY into other forms; the charge flows on, carrying less energy (it has dropped through a p.d.).'], 'Can charges pile up or vanish inside a wire?', 'reasoning', 35); },
    ],
    'PH-052' => [
        // Typed: resistance from a table of readings.
        static function (MlbRng $r) { $R = $r->pick([5, 10, 20, 25, 40, 50]); $dI = $r->pick([0.05, 0.1, 0.2]); $Is = [0, $dI, 2 * $dI, 3 * $dI, 4 * $dI];
            $Vs = array_map(static fn($i) => mlb_dec($i * $R), $Is);
            return phy_num('A student measures a resistor. Current (A): ' . implode(', ', array_map('mlb_dec', $Is)) . '. Voltage (V): ' . implode(', ', $Vs) . '. What is its resistance?', $R, 'Ω',
                ['The readings rise in proportion, so the resistor obeys Ohm’s law: R = V ÷ I for any pair (the gradient of V against I).', 'For example, ' . $Vs[2] . ' ÷ ' . mlb_dec($Is[2]) . ' = ' . $R . ' Ω.'], 'Pick any row with a current that is not zero.', 'application', 45); },
        // A curving I–V graph.
        static function (MlbRng $r) { $dev = $r->pick(['a filament lamp', 'a torch bulb', 'a car headlamp bulb']);
            return mlb_mcq($r, 'The current–voltage graph of ' . $dev . ' is not straight: it gets flatter as the voltage rises. What does this show?', 'Its resistance increases as it gets hotter',
                [['It obeys Ohm’s law', 'Ohm’s law gives a STRAIGHT line through the origin.'], ['Its resistance decreases as it gets hotter', 'Flatter means each extra volt gives LESS extra current: more resistance.'], ['The current is being used up', 'Current is not used up; the shape is about resistance.']],
                ['On an I–V graph, a flatter line means less current per volt: a bigger resistance.', 'The filament heats up as the current rises, and a hotter metal has a higher resistance.'], 'Flatter means: more volts for each extra amp, or fewer?', 'reasoning', 40); },
    ],
    'PH-053' => [
        // Typed: the total current from a parallel pair.
        static function (MlbRng $r) { [$a, $b] = $r->pick([[2, 3], [3, 6], [4, 12], [6, 12], [2, 6], [4, 6]]); $V = $r->pick([6, 12, 24]); $I = $V / $a + $V / $b;
            return phy_num('A ' . $V . ' V battery is connected across a ' . $a . ' Ω resistor and a ' . $b . ' Ω resistor in PARALLEL. What total current does the battery supply?', mlb_dec($I), 'A',
                ['In parallel each resistor has the full ' . $V . ' V across it.', 'I = ' . $V . ' ÷ ' . $a . ' + ' . $V . ' ÷ ' . $b . ' = ' . mlb_dec($V / $a) . ' + ' . mlb_dec($V / $b) . ' = ' . mlb_dec($I) . ' A.'], 'Find the current in each branch, then add.', 'application', 50); },
        // Spot the error: the parallel formula.
        static function (MlbRng $r) { [$a, $b, $R] = $r->pick([[3, 6, 2], [4, 12, 3], [6, 12, 4], [10, 15, 6], [20, 30, 12], [6, 3, 2]]);
            $right = ['1/R = 1/R₁ + 1/R₂.', '1/R = 1/' . $a . ' + 1/' . $b . ' = ' . mlb_frac($a + $b, $a * $b) . '.', 'R = ' . $R . ' Ω.'];
            return phy_err($r, $r->pick(MLB_NAMES) . ' finds the combined resistance of ' . $a . ' Ω and ' . $b . ' Ω in parallel. Which line holds the first mistake?', $right,
                [[2, ['1/R = 1/R₁ + 1/R₂.', '1/R = 1/' . $a . ' + 1/' . $b . ' = ' . mlb_frac($a + $b, $a * $b) . '.', 'R = ' . mlb_frac($a + $b, $a * $b) . ' Ω.'], 'That is 1/R: turn it upside down.'],
                 [0, ['R = R₁ + R₂.', 'R = ' . $a . ' + ' . $b . '.', 'R = ' . ($a + $b) . ' Ω.'], 'Adding is the rule for SERIES. In parallel the total is less than either resistor.'],
                 [1, ['1/R = 1/R₁ + 1/R₂.', '1/R = 1/(' . $a . ' + ' . $b . ') = 1/' . ($a + $b) . '.', 'R = ' . ($a + $b) . ' Ω.'], 'Add the two reciprocals; 1/(a + b) is not 1/a + 1/b.']]); },
    ],
    'PH-054' => [
        // Typed: kilowatt-hours.
        static function (MlbRng $r) { $P = $r->pick([40, 60, 75, 100, 200, 500, 1500]); $h = $r->int(2, 10); $d = $r->pick([1, 7, 10, 30]); $what = $r->pick(['a fan', 'a TV', 'a bulb', 'a radio']); if ($P >= 500) $what = $r->pick(['an electric iron', 'an electric cooker ring', 'a water heater']);
            $E = $P / 1000 * $h * $d;
            return phy_num('A ' . $P . ' W ' . preg_replace('/^an? /', '', $what) . ' is used for ' . $h . ' hours a day for ' . $d . ' day' . ($d > 1 ? 's' : '') . '. How much electrical energy does it use, in kWh?', mlb_dec($E), 'kWh',
                ['Energy (kWh) = power (kW) × time (h).', $P . ' W = ' . mlb_dec($P / 1000) . ' kW; time = ' . $h . ' × ' . $d . ' = ' . ($h * $d) . ' h; E = ' . mlb_dec($P / 1000) . ' × ' . ($h * $d) . ' = ' . mlb_dec($E) . ' kWh.'], 'Kilowatts × hours.', 'application', 45); },
        // What the electricity bill is for.
        static function (MlbRng $r) { $ctx = $r->pick(['A family’s monthly electricity bill', 'The units bought on a prepaid electricity meter', 'The electricity company’s charge to a shop']);
            return mlb_mcq($r, $ctx . ' is worked out from what?', 'The electrical energy used, in kilowatt-hours',
                [['The current used up, in amperes', 'Current is not used up: the charge flows back. Energy is what is used.'], ['The power of the appliances, in watts', 'Power is a RATE; the bill is for energy = power × time.'], ['The voltage supplied, in volts', 'The voltage is the same for everyone; use varies.']],
                ['The meter counts energy in kilowatt-hours (one “unit”).', 'A 1 kW appliance running for 1 hour uses 1 kWh.'], 'What does a meter add up over the month?', 'concept', 30); },
        // Spot the error: watts left as watts.
        static function (MlbRng $r) { $P = $r->pick([500, 750, 1000, 1500, 2000]); $h = $r->int(2, 6); $rate = $r->pick([50, 60, 75, 100]); $E = $P / 1000 * $h;
            $right = ['Power = ' . $P . ' W = ' . mlb_dec($P / 1000) . ' kW.', 'Energy = ' . mlb_dec($P / 1000) . ' × ' . $h . ' = ' . mlb_dec($E) . ' kWh.', 'Cost = ' . mlb_dec($E) . ' × ₦' . $rate . ' = ₦' . mlb_p($E * $rate) . '.'];
            return phy_err($r, 'A ' . $P . ' W pressing iron is used for ' . $h . ' hours. Electricity costs ₦' . $rate . ' per kWh. Find the cost. Which line holds the first mistake?', $right,
                [[0, ['Power = ' . $P . ' kW.', 'Energy = ' . $P . ' × ' . $h . ' = ' . mlb_p($P * $h) . ' kWh.', 'Cost = ' . mlb_p($P * $h) . ' × ₦' . $rate . ' = ₦' . mlb_p($P * $h * $rate) . '.'], 'Watts must be divided by 1000 to give kilowatts.'],
                 [2, ['Power = ' . $P . ' W = ' . mlb_dec($P / 1000) . ' kW.', 'Energy = ' . mlb_dec($P / 1000) . ' × ' . $h . ' = ' . mlb_dec($E) . ' kWh.', 'Cost = ' . mlb_dec($E) . ' ÷ ₦' . $rate . ' = ₦' . mlb_rd($E / $rate, 3) . '.'], 'The price is PER kWh: multiply the units by the price.'],
                 [1, ['Power = ' . $P . ' W = ' . mlb_dec($P / 1000) . ' kW.', 'Energy = ' . mlb_dec($P / 1000) . ' ÷ ' . $h . ' = ' . mlb_rd($P / 1000 / $h, 3) . ' kWh.', 'Cost = ' . mlb_rd($P / 1000 / $h, 3) . ' × ₦' . $rate . ' = ₦' . mlb_rd($P / 1000 / $h * $rate, 2) . '.'], 'Energy = power × time.']]); },
    ],
    'PH-055' => [
        // Typed: internal resistance from the readings.
        static function (MlbRng $r) { $E = $r->pick([6, 9, 12]); $rr = $r->pick([0.5, 1, 1.5, 2]); $I = $r->pick([0.5, 1, 2]); $V = $E - $I * $rr;
            return phy_num('A battery of e.m.f. ' . $E . ' V gives a terminal p.d. of ' . mlb_dec($V) . ' V while it drives a current of ' . mlb_dec($I) . ' A. What is its internal resistance?', mlb_dec($rr), 'Ω',
                ['The “lost volts” inside the battery = E − V = ' . $E . ' − ' . mlb_dec($V) . ' = ' . mlb_dec($E - $V) . ' V.', 'r = lost volts ÷ I = ' . mlb_dec($E - $V) . ' ÷ ' . mlb_dec($I) . ' = ' . mlb_dec($rr) . ' Ω.'], 'Where do the missing volts go?', 'application', 50); },
        // Spot the error: leaving out r.
        static function (MlbRng $r) { $E = $r->pick([3, 6, 9, 12]); $rr = $r->pick([1, 2]); $R = $r->pick([4, 5, 10]); $S = $R + $rr; $I = $E / $S;
            $right = ['Total resistance = R + r = ' . $R . ' + ' . $rr . ' = ' . $S . ' Ω.', 'I = E ÷ (R + r).', 'I = ' . $E . ' ÷ ' . $S . ' = ' . mlb_rd($I, 2) . ' A.'];
            return phy_err($r, 'A ' . $r->pick(['torch cell', 'radio battery', 'clock battery', 'battery']) . ' of e.m.f. ' . $E . ' V and internal resistance ' . $rr . ' Ω is connected to a ' . $R . ' Ω resistor. Find the current. Which line holds the first mistake?', $right,
                [[0, ['Total resistance = R = ' . $R . ' Ω.', 'I = E ÷ R.', 'I = ' . $E . ' ÷ ' . $R . ' = ' . mlb_rd($E / $R, 2) . ' A.'], 'The current flows through the cell too: its internal resistance adds to the circuit’s.'],
                 [1, ['Total resistance = R + r = ' . $R . ' + ' . $rr . ' = ' . $S . ' Ω.', 'I = E × (R + r).', 'I = ' . $E . ' × ' . $S . ' = ' . ($E * $S) . ' A.'], 'I = E ÷ total resistance (Ohm’s law).']]); },
        // Typed: lost volts.
        static function (MlbRng $r) { $rr = $r->pick([0.2, 0.5, 1, 1.5]); $I = $r->pick([2, 4, 5, 10]); $what = $r->pick(['an old car battery', 'a generator’s starter battery', 'a power bank']);
            return phy_num(ucfirst($what) . ' has an internal resistance of ' . mlb_dec($rr) . ' Ω. How many volts are “lost” inside it while it supplies ' . $I . ' A?', mlb_dec($I * $rr), 'V',
                ['The lost volts are the p.d. across the internal resistance: Ir.', mlb_dec($I) . ' × ' . mlb_dec($rr) . ' = ' . mlb_dec($I * $rr) . ' V.'], 'Ohm’s law, inside the battery.', 'procedure', 35); },
    ],
    'PH-056' => [
        // Series capacitance is less than the smallest.
        static function (MlbRng $r) { [$a, $b] = $r->pick([[2, 3], [4, 6], [5, 10], [10, 20], [3, 6]]);
            return mlb_mcq($r, 'A ' . $a . ' µF and a ' . $b . ' µF capacitor are joined in SERIES. What can you say about their combined capacitance?', 'It is less than ' . $a . ' µF, the smaller one',
                [['It is ' . ($a + $b) . ' µF, the two added together', 'Adding capacitances is the rule for PARALLEL.'], ['It is between ' . $a . ' µF and ' . $b . ' µF, the average of the two', 'In series it is less than either one.'], ['It is more than ' . $b . ' µF, the bigger one', 'That would be true in parallel, not in series.']],
                ['In series, 1/C = 1/C₁ + 1/C₂ — the same shape as resistors in parallel.', '1/C is bigger than 1/' . $a . ', so C is smaller than ' . $a . ' µF: here C = ' . mlb_rd($a * $b / ($a + $b), 2) . ' µF.'], 'Capacitors combine the opposite way to resistors.', 'reasoning', 40); },
        // Typed: two capacitors in series.
        static function (MlbRng $r) { [$a, $b, $C] = $r->pick([[3, 6, 2], [4, 12, 3], [6, 12, 4], [10, 15, 6], [2, 2, 1], [20, 30, 12]]);
            return phy_num('Capacitors of ' . $a . ' µF and ' . $b . ' µF are connected in SERIES. What is their combined capacitance?', $C, 'µF',
                ['In series, 1/C = 1/C₁ + 1/C₂.', '1/C = 1/' . $a . ' + 1/' . $b . ' = ' . mlb_frac($a + $b, $a * $b) . ', so C = ' . $C . ' µF. (Or C = C₁C₂ ÷ (C₁ + C₂).)'], 'In series, add the reciprocals.', 'procedure', 50); },
        // Typed, rearranged: the voltage from the charge.
        static function (MlbRng $r) { $C = $r->pick([2, 5, 10, 22, 47, 100]); $V = $r->int(2, 24);
            return phy_num('A ' . $C . ' µF capacitor holds a charge of ' . ($C * $V) . ' µC. What is the p.d. across it?', $V, 'V',
                ['Q = CV, so V = Q ÷ C.', 'V = ' . ($C * $V) . ' µC ÷ ' . $C . ' µF = ' . $V . ' V. (The micro- prefixes cancel.)'], 'Rearrange Q = CV.', 'procedure', 35); },
    ],
    'PH-057' => [
        // Typed, rearranged: the field strength.
        static function (MlbRng $r) { $B = $r->pick([0.1, 0.2, 0.4, 0.5]); $I = $r->int(2, 10); $L = $r->pick([0.05, 0.1, 0.2, 0.5]); $F = $B * $I * $L;
            return phy_num('A wire ' . mlb_dec($L) . ' m long carries ' . $I . ' A at right angles to a magnetic field and feels a force of ' . mlb_dec($F) . ' N. What is the magnetic flux density?', mlb_dec($B), 'T',
                ['F = BIL, so B = F ÷ (IL).', 'B = ' . mlb_dec($F) . ' ÷ (' . $I . ' × ' . mlb_dec($L) . ') = ' . mlb_dec($B) . ' T.'], 'Rearrange F = BIL for B.', 'procedure', 45); },
        // Typed, rearranged: the current.
        static function (MlbRng $r) { $B = $r->pick([0.1, 0.2, 0.4, 0.5]); $I = $r->int(2, 12); $L = $r->pick([0.05, 0.1, 0.2, 0.5]); $F = $B * $I * $L;
            return phy_num('In a loudspeaker, a coil wire ' . mlb_dec($L) . ' m long sits at right angles to a ' . mlb_dec($B) . ' T field. What current gives a force of ' . mlb_dec($F) . ' N on it?', $I, 'A',
                ['F = BIL, so I = F ÷ (BL).', 'I = ' . mlb_dec($F) . ' ÷ (' . mlb_dec($B) . ' × ' . mlb_dec($L) . ') = ' . $I . ' A.'], 'Rearrange F = BIL for I.', 'procedure', 45); },
        // What changes a motor's speed, and what reverses it.
        static function (MlbRng $r) { if ($r->int(0, 1) === 0)
                return mlb_mcq($r, 'Which change makes a simple d.c. motor turn FASTER?', 'A bigger current through the coil',
                    [['Reversing the battery connections', 'That reverses the DIRECTION of rotation, not the speed.'], ['Fewer turns on the coil, so it is lighter', 'Fewer turns means a smaller total force, and that matters far more than the lighter coil.'], ['A weaker magnet', 'A weaker field means a smaller force (F = BIL).']],
                    ['The turning force on each side of the coil is F = BIL, for every turn.', 'More current, more turns or a stronger magnet: a bigger force, a faster motor.'], 'Use F = BIL.', 'concept', 35);
            return mlb_mcq($r, 'How can the DIRECTION of rotation of a simple d.c. motor be reversed?', 'Reverse the current (swap the battery connections)',
                [['Use a bigger current', 'That changes the speed, not the direction.'], ['Add more turns to the coil', 'That changes the force’s size, not its direction.'], ['Reverse the current AND swap the magnet’s poles', 'Reversing both puts the force back the way it was.']],
                ['Fleming’s left-hand rule: reversing either the current or the field reverses the force.', 'Reversing just one of them reverses the rotation.'], 'Fleming’s left-hand rule: what happens to the thumb if one finger is reversed?', 'reasoning', 40); },
    ],
    'PH-058' => [
        // Typed: the turns needed for a step-down transformer.
        static function (MlbRng $r) { $Vs = $r->pick([5, 6, 12, 24, 48]); $Np = $r->pick([960, 1200, 2400, 4800]); $Ns = $Np * $Vs / 240;
            return phy_num('A charger’s transformer steps the 240 V mains down to ' . $Vs . ' V. Its primary coil has ' . mlb_p($Np) . ' turns. How many turns must the secondary have?', $Ns, 'turns',
                ['Vs ÷ Vp = Ns ÷ Np, so Ns = Np × Vs ÷ Vp.', 'Ns = ' . mlb_p($Np) . ' × ' . $Vs . ' ÷ 240 = ' . $Ns . ' turns.'], 'The voltages are in the same ratio as the turns.', 'procedure', 45); },
        // Typed: transformer efficiency.
        static function (MlbRng $r) { $Ip = $r->pick([0.5, 1, 2]); $eta = $r->pick([80, 85, 90, 95]); $Vs = $r->pick([12, 24, 48]); $Is = 240 * $Ip * $eta / 100 / $Vs;
            return phy_num('A transformer takes ' . mlb_dec($Ip) . ' A from the 240 V mains, and its secondary delivers ' . mlb_dec($Is) . ' A at ' . $Vs . ' V. What is its efficiency?', $eta, '%',
                ['Power in = ' . mlb_dec($Ip) . ' × 240 = ' . mlb_dec(240 * $Ip) . ' W; power out = ' . mlb_dec($Is) . ' × ' . $Vs . ' = ' . mlb_dec($Is * $Vs) . ' W.', 'Efficiency = ' . mlb_dec($Is * $Vs) . ' ÷ ' . mlb_dec(240 * $Ip) . ' × 100% = ' . $eta . '%.'], 'Compare the power out with the power in (P = IV).', 'application', 55); },
        // A faster change gives a bigger e.m.f.
        static function (MlbRng $r) {
            return mlb_mcq($r, $r->pick(MLB_NAMES) . ' pushes a bar magnet into a coil connected to a ' . $r->pick(['galvanometer', 'sensitive ammeter', 'centre-zero meter']) . ', and the needle flicks. Which change gives a BIGGER flick?', $r->pick(['Pushing the magnet in faster', 'Using a coil with more turns']),
                [['Holding the magnet still inside the coil', 'No change in the magnetic field through the coil, so no e.m.f. at all.'], ['Pushing it in more slowly', 'A slower change gives a SMALLER e.m.f.'], ['Using a coil with fewer turns', 'Each turn adds its own e.m.f.: fewer turns, less.']],
                ['Faraday’s law: the induced e.m.f. depends on how FAST the magnetic flux through the coil changes, times the number of turns.', 'Faster movement, a stronger magnet or more turns all give a bigger e.m.f.'], 'What must be CHANGING for an e.m.f. to be induced?', 'concept', 35); },
    ],
    'PH-059' => [
        // Typed: after an alpha decay.
        static function (MlbRng $r) { [$sym, $Z, $A] = $r->pick([['U', 92, 238], ['Ra', 88, 226], ['Po', 84, 210], ['Th', 90, 232], ['Rn', 86, 222], ['Am', 95, 241]]); $askA = $r->int(0, 1) === 0;
            return phy_num('A nucleus of ' . $sym . '-' . $A . ' (proton number ' . $Z . ') emits an alpha particle. What is the ' . ($askA ? 'NUCLEON (mass) number' : 'PROTON (atomic) number') . ' of the new nucleus?', $askA ? $A - 4 : $Z - 2, '',
                ['An alpha particle is a helium nucleus: 2 protons and 2 neutrons (A = 4, Z = 2).', 'New A = ' . $A . ' − 4 = ' . ($A - 4) . '; new Z = ' . $Z . ' − 2 = ' . ($Z - 2) . '.'], 'What is an alpha particle made of?', 'procedure', 35); },
        // Typed: how many alphas in a decay chain.
        static function (MlbRng $r) { [$from, $to, $A1, $A2] = $r->pick([['uranium-238', 'lead-206', 238, 206], ['thorium-232', 'lead-208', 232, 208], ['uranium-235', 'lead-207', 235, 207], ['radium-226', 'lead-206', 226, 206], ['radon-222', 'lead-206', 222, 206]]);
            return phy_num('A decay chain runs from ' . $from . ' to ' . $to . ', by alpha and beta decays. How many ALPHA particles are given out along the way?', ($A1 - $A2) / 4, '',
                ['Only alpha decay changes the nucleon number, by 4 each time; beta decay leaves it the same.', '(' . $A1 . ' − ' . $A2 . ') ÷ 4 = ' . ($A1 - $A2) / 4 . ' alpha particles.'], 'Which kind of decay changes the nucleon number?', 'reasoning', 45); },
        // Irradiated is not radioactive.
        static function (MlbRng $r) { $what = $r->pick(['Spices for export', 'Hospital syringes', 'Bags of grain in a store']);
            return mlb_mcq($r, $what . ' are exposed to gamma rays to kill bacteria and insects. Do they become radioactive?', 'No: the gamma rays pass through and leave no radioactive material behind',
                [['Yes, because anything hit by radiation becomes radioactive', 'Being IRRADIATED is not being CONTAMINATED: no radioactive substance is added.'], ['Yes, for about one half-life', 'There is no radioactive material in them to decay.'], ['Only if they are eaten or used straight away', 'Nothing about timing makes them radioactive.']],
                ['Gamma rays are energy passing through; they kill living cells but do not make ordinary nuclei unstable.', 'The goods would only be dangerous if radioactive material got onto or into them (contamination).'], 'Has any radioactive substance been added?', 'concept', 40); },
    ],
    'PH-060' => [
        // What is left after whole half-lives — not nothing.
        static function (MlbRng $r) { $h = $r->int(2, 30); $n = $r->pick([2, 3]); $frac = $n === 2 ? '1/4' : '1/8';
            return mlb_mcq($r, 'A radioactive sample has a half-life of ' . $h . ' days. What fraction of it is still undecayed after ' . ($n * $h) . ' days?', $frac,
                [['None of it: it has all decayed', 'Each half-life halves what is LEFT; it never reaches zero in a few half-lives.'], ['1/' . (2 * $n), 'That divides by 2 × ' . $n . '; it halves ' . $n . ' times, so divide by 2^' . $n . '.'], ['1/2', 'That is after ONE half-life.']],
                [($n * $h) . ' days = ' . $n . ' half-lives.', 'It halves ' . $n . ' times: ' . ($n === 2 ? '1 → 1/2 → 1/4' : '1 → 1/2 → 1/4 → 1/8') . '.'], 'Halve, and halve again…', 'concept', 35); },
        // Typed: the percentage that has DECAYED.
        static function (MlbRng $r) { $n = $r->int(1, 4); $T = $r->pick([5, 8, 12, 30]); $iso = $r->pick(['iodine-131 in a hospital', 'a tracer isotope', 'a laboratory source']);
            $left = 100 / 2 ** $n;
            return phy_num('A sample of ' . $iso . ' has a half-life of ' . $T . ' days. What percentage of it has DECAYED after ' . ($n * $T) . ' days?', mlb_dec(100 - $left), '%',
                [($n * $T) . ' ÷ ' . $T . ' = ' . $n . ' half-lives, so the fraction LEFT is 1/2^' . $n . ' = ' . mlb_dec($left) . '%.', 'Decayed = 100 − ' . mlb_dec($left) . ' = ' . mlb_dec(100 - $left) . '%.'], 'Find what is left first; the question asks for the rest.', 'reasoning', 45); },
        // Spot the error: halving n times.
        static function (MlbRng $r) { $N = $r->pick([160, 320, 640, 800, 1600]); $T = $r->pick([2, 5, 6, 8]); $n = $r->int(2, 4); $chain = [$N]; for ($i = 0; $i < $n; $i++) $chain[] = $chain[$i] / 2;
            $right = ['Number of half-lives = ' . ($n * $T) . ' ÷ ' . $T . ' = ' . $n . '.', 'Halve ' . $n . ' times: ' . implode(' → ', array_map('mlb_dec', $chain)) . '.', 'Remaining = ' . mlb_dec(end($chain)) . ' g.'];
            return phy_err($r, 'A sample has ' . $N . ' g of a radioactive isotope with a half-life of ' . $T . ' hours. How much is left after ' . ($n * $T) . ' hours? Which line holds the first mistake?', $right,
                [[1, ['Number of half-lives = ' . ($n * $T) . ' ÷ ' . $T . ' = ' . $n . '.', 'Divide by the number of half-lives: ' . $N . ' ÷ ' . $n . ' = ' . mlb_rd($N / $n, 2) . '.', 'Remaining = ' . mlb_rd($N / $n, 2) . ' g.'], 'Each half-life HALVES what is left: divide by 2 a total of ' . $n . ' times (by 2^' . $n . ' = ' . (2 ** $n) . '), not by ' . $n . '.'],
                 [0, ['Number of half-lives = ' . ($n * $T) . ' × ' . $T . ' = ' . ($n * $T * $T) . '.', 'Halve ' . ($n * $T * $T) . ' times.', 'Remaining = almost nothing.'], 'The number of half-lives is the time ÷ the half-life.']]); },
    ],
    ];
}

/* ═══ Stage 7 — Thermal physics, waves and fields (senior) ═══ */
function phy_more_7(): array {
    return [
    'PH-061' => [
        // Typed: the rate of conduction through a slab.
        static function (MlbRng $r) { [$what, $k, $A, $d, $dT] = $r->pick([['a glass window pane', 1, $r->pick([1, 1.5, 2]), 0.005, $r->int(1, 5)], ['a concrete block wall', 1.5, $r->pick([4, 6, 10]), 0.15, $r->int(2, 12)], ['the aluminium base of a cooking pot', 200, $r->pick([0.02, 0.03, 0.05]), 0.004, $r->int(1, 3)], ['a copper plate', 400, $r->pick([0.01, 0.02]), 0.002, $r->int(1, 3)]]);
            $P = $k * $A * $dT / $d;
            return phy_num('Heat is conducted through ' . $what . ' of area ' . mlb_dec($A) . ' m² and thickness ' . mlb_dec($d) . ' m. Its thermal conductivity is ' . $k . ' W/m K, and one face is ' . $dT . ' K hotter than the other. At what rate does heat flow through it?', mlb_dec($P), 'W',
                ['Rate of conduction = kAΔθ ÷ d.', $k . ' × ' . mlb_dec($A) . ' × ' . $dT . ' ÷ ' . mlb_dec($d) . ' = ' . mlb_p($P) . ' W.'], 'More area, more temperature difference and a thinner slab all mean faster flow.', 'procedure', 55); },
        // Typed, rearranged: the temperature difference across a wall.
        static function (MlbRng $r) { $k = 1.5; $A = $r->pick([4, 6, 8, 10]); $d = $r->pick([0.15, 0.2, 0.3]); $dT = $r->int(2, 12); $P = $k * $A * $dT / $d;
            return phy_num('On a hot afternoon, an air-conditioned room GAINS heat through a concrete wall ' . mlb_dec($d) . ' m thick and ' . $A . ' m² in area at ' . mlb_dec($P) . ' W. Concrete conducts at 1.5 W/m K. How much hotter is the outside face than the inside face?', $dT, 'K',
                ['Rate = kAΔθ ÷ d, so Δθ = rate × d ÷ (kA).', 'Δθ = ' . mlb_dec($P) . ' × ' . mlb_dec($d) . ' ÷ (1.5 × ' . $A . ') = ' . $dT . ' K.'], 'Rearrange the conduction equation for Δθ.', 'application', 60); },
        // Metal feels colder than wood at the same temperature.
        static function (MlbRng $r) { [$m, $w, $M] = $r->pick([['a metal door handle', 'the wooden door', 'the handle'], ['an iron bench', 'a wooden bench beside it', 'the iron bench'], ['the tiled floor', 'a rug lying on it', 'the tiled floor']]);
            return mlb_mcq($r, 'On a cool harmattan morning, ' . $m . ' and ' . $w . ' have been in the same place all night, yet ' . $M . ' feels much colder to touch. Why?', 'It conducts heat away from your hand much faster',
                [['It is at a lower temperature', 'Left together all night, both are at the same temperature (the room’s).'], ['It gives out cold into your hand', 'There is no flow of “cold”: heat flows from your warm hand into the material.'], ['It is a worse conductor than ' . $w, 'It is a BETTER conductor; that is exactly why it feels colder.']],
                ['Your skin senses how fast it LOSES heat, not the temperature of what it touches.', 'A good conductor carries heat away from your hand quickly, so it feels colder even at the same temperature.'], 'Are they really at different temperatures?', 'reasoning', 40); },
    ],
    'PH-062' => [
        // Typed: a resistance thermometer.
        static function (MlbRng $r) { $R0 = $r->pick([20, 25, 40, 50, 100]); $span = $r->pick([10, 20, 40, 50]); $th = $r->int(1, 19) * 5; $Rt = $R0 + $span * $th / 100;
            return phy_num('A platinum resistance thermometer reads ' . $R0 . ' Ω in melting ice and ' . ($R0 + $span) . ' Ω in steam. In a liquid it reads ' . mlb_dec($Rt) . ' Ω. What is the temperature of the liquid?', $th, '°C',
                ['θ = (R_θ − R₀) ÷ (R₁₀₀ − R₀) × 100 °C.', '(' . mlb_dec($Rt) . ' − ' . $R0 . ') ÷ (' . ($R0 + $span) . ' − ' . $R0 . ') × 100 = ' . mlb_dec($Rt - $R0) . ' ÷ ' . $span . ' × 100 = ' . $th . ' °C.'], 'What fraction of the way from the ice reading to the steam reading is it?', 'application', 50); },
        // Typed: a constant-volume gas thermometer.
        static function (MlbRng $r) { $p0 = $r->pick([60, 75, 80, 100]); $span = $r->pick([20, 25, 30, 40]); $th = $r->int(1, 19) * 5; $pt = $p0 + $span * $th / 100;
            return phy_num('A constant-volume gas thermometer shows a pressure of ' . $p0 . ' kPa at the ice point and ' . ($p0 + $span) . ' kPa at the steam point. What temperature does a reading of ' . mlb_dec($pt) . ' kPa show?', $th, '°C',
                ['θ = (p_θ − p₀) ÷ (p₁₀₀ − p₀) × 100 °C.', '(' . mlb_dec($pt) . ' − ' . $p0 . ') ÷ ' . $span . ' × 100 = ' . $th . ' °C.'], 'The same method as any thermometer: what fraction of the fixed-point interval?', 'application', 50); },
        // Which property does each thermometer use?
        static function (MlbRng $r) {
            $rows = ['a liquid-in-glass thermometer' => 'The expansion of a liquid', 'a platinum resistance thermometer' => 'The electrical resistance of a metal', 'a thermocouple' => 'The e.m.f. (voltage) between two different metals joined together', 'a constant-volume gas thermometer' => 'The pressure of a gas'];
            $t = $r->pick(array_keys($rows)); $wrong = []; foreach ($rows as $k => $v) if ($k !== $t) $wrong[] = [$v, 'That is the thermometric property of ' . $k . '.'];
            return mlb_mcq($r, 'Which thermometric property does ' . $t . ' use?', $rows[$t], $wrong,
                ['A thermometric property is one that changes steadily and measurably with temperature.', ucfirst($t) . ' uses: ' . mb_strtolower($rows[$t]) . '.'], 'What does it actually measure, before turning it into a temperature?', 'concept', 30); },
    ],
    'PH-063' => [
        // How many loops → which harmonic.
        static function (MlbRng $r) { $n = $r->int(2, 5); $ord = [1 => '1st (fundamental)', 2 => '2nd', 3 => '3rd', 4 => '4th', 5 => '5th', 6 => '6th', 10 => '10th', 8 => '8th'];
            return mlb_mcq($r, 'A string fixed at both ends vibrates with ' . $n . ' loops (' . $n . ' antinodes) between its ends. Which harmonic is this?', 'The ' . $ord[$n] . ' harmonic',
                [['The ' . $ord[$n - 1] . ' harmonic', 'Count the loops: each loop is half a wavelength, and the nth harmonic has n loops.'], ['The ' . $ord[2 * $n] . ' harmonic', 'That counts each loop twice; one loop is half a wavelength.'], ['The ' . $ord[$n + 1] . ' harmonic', 'The number of loops IS the harmonic number for a string fixed at both ends.']],
                ['Each loop is half a wavelength; the fundamental is one loop.', $n . ' loops = ' . $n . ' half-wavelengths: the ' . $ord[$n] . ' harmonic, frequency ' . $n . 'f₁.'], 'How many loops does the fundamental have?', 'concept', 35); },
        // Typed: the frequency of a harmonic.
        static function (MlbRng $r) { $f1 = $r->pick([82, 110, 147, 196, 220, 247, 330]); $n = $r->int(2, 5);
            return phy_num('A guitar string has a fundamental frequency of ' . $f1 . ' Hz. Touched lightly at the right point, it vibrates in ' . $n . ' loops. What frequency does it give now?', $n * $f1, 'Hz',
                [$n . ' loops is the ' . $n . 'th harmonic.', 'f = ' . $n . ' × ' . $f1 . ' = ' . ($n * $f1) . ' Hz.'], 'The nth harmonic is n times the fundamental.', 'procedure', 35); },
        // Nodes and antinodes.
        static function (MlbRng $r) {
            $qs = [['the amplitude of vibration at a NODE', 'Zero: the string does not move there'], ['the amplitude of vibration at an ANTINODE', 'The largest anywhere on the string'], ['the distance between two neighbouring NODES', 'Half a wavelength']];
            [$q, $right] = $r->pick($qs);
            $all = ['Zero: the string does not move there' => 'That is true at a node.', 'The largest anywhere on the string' => 'That is true at an antinode.', 'Half a wavelength' => 'That is the node-to-node (or antinode-to-antinode) spacing.', 'One whole wavelength' => 'Node to node is only HALF a wavelength.'];
            $wrong = []; foreach ($all as $t => $w) if ($t !== $right) $wrong[] = [$t, $w];
            return mlb_mcq($r, 'On a stationary wave on a string, what is ' . $q . '?', $right, $wrong,
                ['A stationary wave has nodes (no movement) and antinodes (largest movement) in fixed places.', 'Neighbouring nodes are half a wavelength apart, with an antinode midway.'], 'Picture the loops on the string.', 'concept', 30); },
    ],
    'PH-064' => [
        // Typed: the length of a closed pipe that resonates.
        static function (MlbRng $r) { $f = $r->pick([256, 288, 320, 384, 480, 512]);
            return phy_num('In a resonance-tube experiment (a tube closed at one end, sound at 340 m/s), a ' . $f . ' Hz tuning fork is held over the tube. What is the SHORTEST air column that resonates, in cm? (Ignore the end correction; give 1 decimal place.)', mlb_rd(34000 / (4 * $f), 1), 'cm',
                ['The shortest resonance in a closed tube is a quarter-wavelength: L = λ ÷ 4.', 'λ = 340 ÷ ' . $f . ' = ' . mlb_rd(340 / $f, 4) . ' m, so L = ' . mlb_rd(340 / $f / 4, 4) . ' m = ' . mlb_rd(34000 / (4 * $f), 1) . ' cm.'], 'Closed at one end: node at the closed end, antinode at the open end.', 'application', 55, 1); },
        // Spot the error: closed against open pipes.
        static function (MlbRng $r) { [$L, $f] = $r->pick([[0.17, 500], [0.25, 340], [0.34, 250], [0.5, 170], [0.85, 100]]);
            $right = ['Closed at one end, the fundamental fits a quarter-wavelength: L = λ ÷ 4.', 'λ = 4L = 4 × ' . mlb_dec($L) . ' = ' . mlb_dec(4 * $L) . ' m.', 'f = v ÷ λ = 340 ÷ ' . mlb_dec(4 * $L) . ' = ' . $f . ' Hz.'];
            return phy_err($r, 'A pipe ' . mlb_dec($L) . ' m long is closed at one end. Find its fundamental frequency (sound at 340 m/s). Which line holds the first mistake?', $right,
                [[0, ['Closed at one end, the fundamental fits half a wavelength: L = λ ÷ 2.', 'λ = 2L = 2 × ' . mlb_dec($L) . ' = ' . mlb_dec(2 * $L) . ' m.', 'f = v ÷ λ = 340 ÷ ' . mlb_dec(2 * $L) . ' = ' . (2 * $f) . ' Hz.'], 'Half a wavelength is a pipe OPEN at both ends. A closed end is a node, the open end an antinode: a quarter-wavelength.'],
                 [1, ['Closed at one end, the fundamental fits a quarter-wavelength: L = λ ÷ 4.', 'λ = L ÷ 4 = ' . mlb_dec($L) . ' ÷ 4 = ' . mlb_dec($L / 4) . ' m.', 'f = v ÷ λ = 340 ÷ ' . mlb_dec($L / 4) . ' = ' . mlb_dec(340 / ($L / 4)) . ' Hz.'], 'If L = λ ÷ 4, then λ = 4L.'],
                 [2, ['Closed at one end, the fundamental fits a quarter-wavelength: L = λ ÷ 4.', 'λ = 4L = 4 × ' . mlb_dec($L) . ' = ' . mlb_dec(4 * $L) . ' m.', 'f = λ ÷ v = ' . mlb_dec(4 * $L) . ' ÷ 340 = ' . mlb_rd(4 * $L / 340, 4) . ' Hz.'], 'From v = fλ, f = v ÷ λ.']]); },
    ],
    'PH-065' => [
        // Typed: a source moving away.
        static function (MlbRng $r) { $f = $r->pick([400, 500, 600, 800, 1000]); $vs = $r->pick([10, 15, 20, 25, 30]); $what = $r->pick(['A police car’s siren', 'A train’s horn', 'An ambulance siren']);
            return phy_num($what . ' sounds at ' . $f . ' Hz while it moves AWAY from a listener at ' . $vs . ' m/s. What frequency does the listener hear? (sound: 340 m/s; 1 decimal place)', mlb_rd($f * 340 / (340 + $vs), 1), 'Hz',
                ['A source moving away stretches the waves: f′ = f × v ÷ (v + vₛ).', 'f′ = ' . $f . ' × 340 ÷ (340 + ' . $vs . ') = ' . mlb_rd($f * 340 / (340 + $vs), 1) . ' Hz — lower than ' . $f . ' Hz.'], 'Moving away: higher or lower than the true note?', 'procedure', 55, 1); },
        // Typed: a listener moving towards a still source.
        static function (MlbRng $r) { $f = $r->pick([300, 400, 500, 680, 850]); $vo = $r->pick([10, 17, 20, 34]); $who = $r->pick(['An okada rider', 'A cyclist', 'A motorist']);
            return phy_num($who . ' moves at ' . $vo . ' m/s straight TOWARDS a factory siren sounding at ' . $f . ' Hz. What frequency does the rider hear? (sound: 340 m/s; 1 decimal place)', mlb_rd($f * (340 + $vo) / 340, 1), 'Hz',
                ['A moving listener meets the waves more often: f′ = f × (v + v₀) ÷ v.', 'f′ = ' . $f . ' × (340 + ' . $vo . ') ÷ 340 = ' . mlb_rd($f * (340 + $vo) / 340, 1) . ' Hz.'], 'Moving into the waves: does the listener meet more of them each second, or fewer?', 'procedure', 55, 1); },
        // Doppler shifts pitch, not just loudness.
        static function (MlbRng $r) { $what = $r->pick(['an ambulance', 'a police car', 'a fire engine']);
            return mlb_mcq($r, 'As ' . $what . ' with its siren on comes towards you at a steady speed, then passes and drives away, what happens to the PITCH you hear?', 'Steady and higher than the siren’s own note, then a sudden drop to a steady lower note as it passes',
                [['It rises steadily the whole time it comes closer, then falls steadily as it leaves', 'At a steady speed the shift is steady. What grows as it comes closer is the LOUDNESS.'], ['It is lower while it approaches and then higher as it drives away from you', 'It is the other way round: approaching squeezes the waves (higher).'], ['It does not change at all; only the loudness rises and then falls as it passes', 'The frequency you hear really is shifted by the motion (the Doppler effect).']],
                ['Approaching, the waves are squeezed together: a higher frequency. Receding, they are stretched: lower.', 'At a steady speed each shift is steady, so the pitch jumps down as it passes; the loudness is what rises and falls smoothly.'], 'Separate what the pitch does from what the loudness does.', 'reasoning', 45); },
    ],
    'PH-066' => [
        // Typed: stress in MPa.
        static function (MlbRng $r) { $A = $r->pick([2, 4, 5, 8, 10]); $F = $r->int(2, 40) * 100; $what = $r->pick(['a steel guy-wire holding up a telecom mast', 'a cable on a crane', 'a wire holding up a ceiling fan']);
            return phy_num('A tension of ' . mlb_p($F) . ' N acts in ' . $what . ' with a cross-sectional area of ' . $A . ' mm². What is the stress, in MPa? (1 MPa = 1 N/mm²)', mlb_dec($F / $A), 'MPa',
                ['Stress = force ÷ area.', mlb_p($F) . ' ÷ ' . $A . ' = ' . mlb_dec($F / $A) . ' N/mm² = ' . mlb_dec($F / $A) . ' MPa.'], 'Force per unit area — and the unit hint helps.', 'procedure', 40); },
        // Typed, rearranged: the extension from Young's modulus.
        static function (MlbRng $r) { $F = $r->pick([100, 200, 400, 500, 1000]); $L = $r->pick([1, 2, 4]); $A = $r->pick([1, 2, 4, 5]); $e = $F * $L / (200 * $A);
            return phy_num('A steel wire (Young’s modulus 200 GPa) is ' . $L . ' m long with a cross-section of ' . $A . ' mm². By how much does a ' . $F . ' N load stretch it, in mm?', mlb_dec($e), 'mm',
                ['E = (F ÷ A) ÷ (e ÷ L), so e = FL ÷ (AE).', 'e = ' . $F . ' × ' . $L . ' ÷ (' . $A . ' × 10⁻⁶ × 200 × 10⁹) = ' . mlb_dec($e / 1000) . ' m = ' . mlb_dec($e) . ' mm.'], 'Put A in m² and E in Pa, then rearrange.', 'challenge', 70); },
        // Reading a stress–strain curve in words.
        static function (MlbRng $r) {
            $rows = ['Beyond this point the wire no longer returns to its original length when the load is removed.' => 'The elastic limit', 'At this point the wire suddenly stretches a lot for very little extra load.' => 'The yield point', 'This is the greatest stress the wire can bear before it starts to neck and break.' => 'The ultimate tensile stress', 'Up to this point, stress is exactly proportional to strain.' => 'The limit of proportionality'];
            $d = $r->pick(array_keys($rows)); $wrong = []; foreach ($rows as $k => $v) if ($k !== $d) $wrong[] = [$v, 'That is the point where: ' . mb_strtolower(rtrim($k, '.')) . '.'];
            return mlb_mcq($r, 'A copper wire is loaded until it breaks. ' . $d . ' Which point on its stress–strain curve is this?', $rows[$d], $wrong,
                ['In order along the curve: limit of proportionality, elastic limit, yield point, ultimate tensile stress, breaking point.', $d . ' That describes ' . mb_strtolower($rows[$d]) . '.'], 'Walk along the curve from the origin.', 'concept', 40); },
    ],
    'PH-067' => [
        // Typed: g on another planet.
        static function (MlbRng $r) { $k = $r->pick([0.5, 1, 2, 4, 8]); $j = $r->pick([0.5, 1, 2]); if ($k == 1 && $j == 1) $k = 2; $g = 10 * $k / ($j * $j);
            return phy_num('A planet has ' . mlb_dec($k) . ' times the mass of the Earth and ' . mlb_dec($j) . ' times its radius. What is g on its surface? (g on Earth = 10 N/kg)', mlb_dec($g), 'N/kg',
                ['g = GM ÷ R², so g ∝ M ÷ R².', 'g = 10 × ' . mlb_dec($k) . ' ÷ ' . mlb_dec($j) . '² = ' . mlb_dec($g) . ' N/kg.'], 'Mass on top, radius SQUARED underneath.', 'reasoning', 50); },
        // Typed: weight of a satellite at height.
        static function (MlbRng $r) { $m = $r->int(2, 20) * 50; $n = $r->int(1, 4); $W = $m * 10 / (($n + 1) ** 2);
            return phy_num('A ' . $m . ' kg satellite is ' . $n . ' Earth radi' . ($n > 1 ? 'i' : 'us') . ' ABOVE the Earth’s surface. What is its weight there? (g at the surface = 10 N/kg; give 1 decimal place)', mlb_rd($W, 1), 'N',
                ['Its distance from the Earth’s CENTRE is ' . ($n + 1) . ' radii, and g ∝ 1 ÷ r².', 'g = 10 ÷ ' . ($n + 1) . '² = ' . mlb_rd(10 / (($n + 1) ** 2), 3) . ' N/kg; W = ' . $m . ' × that = ' . mlb_rd($W, 1) . ' N.'], 'Measure from the centre of the Earth, not from the ground.', 'challenge', 60, 1); },
        // Weightless is not gravity-free.
        static function (MlbRng $r) { $where = $r->pick(['the International Space Station, about 400 km up', 'a satellite in low orbit', 'a space capsule orbiting the Earth']);
            return mlb_mcq($r, 'Astronauts in ' . $where . ' float about as if weightless. Why?', 'They and their craft are falling freely around the Earth together',
                [['There is no gravity in space, so nothing pulls them down', 'At 400 km up, g is still about 90% of its value on the ground.'], ['They are beyond the pull of the Earth, so nothing pulls on them', 'The Earth’s pull is what keeps them in orbit at all.'], ['The craft’s engines cancel gravity, so the astronauts float', 'The engines are off in orbit; nothing cancels gravity.']],
                ['Gravity is what bends their path into an orbit: they are in free fall.', 'The astronauts and the craft fall at the same rate, so nothing presses on them — they feel weightless.'], 'What keeps a satellite going round instead of flying off?', 'reasoning', 40); },
    ],
    'PH-068' => [
        // Typed: field strength from the force.
        static function (MlbRng $r) { $q = $r->pick([1, 2, 4, 5]); $E = $r->int(2, 50) * 100;
            return phy_num('A charge of ' . $q . ' µC placed in an electric field feels a force of ' . mlb_dec($q * $E / 1000) . ' mN. What is the field strength there?', $E, 'N/C',
                ['E = F ÷ q.', 'E = ' . mlb_dec($q * $E / 1000) . ' × 10⁻³ ÷ (' . $q . ' × 10⁻⁶) = ' . mlb_p($E) . ' N/C.'], 'Force per unit charge — mind the milli and the micro.', 'procedure', 45); },
        // Typed: field of a point charge.
        static function (MlbRng $r) { $Q = $r->pick([1, 2, 4, 5, 8]); $d = $r->pick([0.1, 0.2, 0.3, 0.5]); $E = 9000 * $Q / ($d * $d);
            return phy_num('What is the electric field strength ' . mlb_dec($d) . ' m from a point charge of ' . $Q . ' µC in air? (k = 9 × 10⁹ N m²/C²)', mlb_dec(round($E, 4)), 'N/C',
                ['E = kQ ÷ r².', 'E = 9 × 10⁹ × ' . $Q . ' × 10⁻⁶ ÷ ' . mlb_dec($d) . '² = ' . mlb_dec(9000 * $Q) . ' ÷ ' . mlb_dec($d * $d) . ' = ' . mlb_p(round($E)) . ' N/C.'], 'Distance squared underneath.', 'procedure', 50); },
        // The force on an electron is against the field.
        static function (MlbRng $r) { $d = $r->pick(['east', 'north', 'upwards', 'to the left']); $opp = ['east' => 'west', 'north' => 'south', 'upwards' => 'downwards', 'to the left' => 'to the right'][$d]; $p = $r->int(0, 1) === 0;
            $right = $p ? 'Along the field: ' . $d : 'Against the field: ' . $opp;
            return mlb_mcq($r, 'A uniform electric field points ' . $d . '. Which way is the force on ' . ($p ? 'a PROTON' : 'an ELECTRON') . ' placed in it?', $right,
                [[$p ? 'Against the field: ' . $opp : 'Along the field: ' . $d, $p ? 'A positive charge is pushed ALONG the field.' : 'The field direction is the force on a POSITIVE charge; an electron is negative.'], ['At right angles to the field', 'An electric force acts along the field line, one way or the other.'], ['There is no force unless it is moving', 'That is true of a MAGNETIC field, not an electric one.']],
                ['The field direction is the direction of the force on a positive charge.', $p ? 'A proton is positive: pushed ' . $d . '.' : 'An electron is negative: pushed the opposite way, ' . $opp . '.'], 'What does the direction of a field line mean?', 'concept', 35); },
    ],
    'PH-069' => [
        // Typed: capacitive reactance.
        static function (MlbRng $r) { $C = $r->pick([10, 20, 50, 100]); $f = $r->pick([50, 60, 100]); $X = 1 / (2 * 3.14 * $f * $C / 1000000);
            return phy_num('What is the reactance of a ' . $C . ' µF capacitor at ' . $f . ' Hz? (π = 3.14; give 1 decimal place)', mlb_rd($X, 1), 'Ω',
                ['X_C = 1 ÷ (2πfC), with C in farads.', 'X_C = 1 ÷ (2 × 3.14 × ' . $f . ' × ' . $C . ' × 10⁻⁶) = ' . mlb_rd($X, 1) . ' Ω.'], 'Change microfarads to farads first.', 'procedure', 55, 1); },
        // Phase in pure circuits.
        static function (MlbRng $r) { $rows = ['only a capacitor' => 'The current leads the voltage by 90°', 'only an inductor' => 'The current lags behind the voltage by 90°', 'only a resistor' => 'The current and voltage are in phase'];
            $k = $r->pick(array_keys($rows)); $wrong = []; foreach ($rows as $c => $v) if ($c !== $k) $wrong[] = [$v, 'That is the case for ' . $c . '.'];
            $wrong[] = ['The current leads the voltage by 180°', 'No single component gives a 180° shift.'];
            return mlb_mcq($r, 'An a.c. supply is connected across ' . $k . '. How are the current and the voltage related in time?', $rows[$k], $wrong,
                ['Resistor: in phase. Capacitor: the current flows first to charge it, so I LEADS V by 90°.', 'Inductor: it opposes changes in current, so I LAGS V by 90° (“CIVIL”: in a C, I before V; V before I in an L).'], 'Remember CIVIL.', 'concept', 35); },
        // Typed: peak from r.m.s.
        static function (MlbRng $r) { $V = $r->pick([110, 120, 220, 230, 240]);
            return phy_num('The mains supply is ' . $V . ' V r.m.s. What is its PEAK voltage? (Give 1 decimal place.)', mlb_rd($V * sqrt(2), 1), 'V',
                ['V_peak = √2 × V_rms.', '√2 × ' . $V . ' = ' . mlb_rd($V * sqrt(2), 1) . ' V. (So insulation must stand more than the number on the label.)'], 'The peak is bigger than the r.m.s. value.', 'procedure', 40, 1); },
    ],
    'PH-070' => [
        // Typed, rearranged: the current for a plating job.
        static function (MlbRng $r) { $I = $r->int(1, 5); $t = $r->pick([10, 20, 25, 30, 50]); $m = 0.33 * $I * $t * 60 / 1000;
            return phy_num('In ' . $t . ' minutes, ' . mlb_dec($m) . ' g of copper is deposited from copper sulphate solution. The electrochemical equivalent of copper is 0.33 mg/C. What steady current was used?', $I, 'A',
                ['m = ZIt, so I = m ÷ (Zt), with m in mg and t in seconds.', 'I = ' . mlb_dec($m * 1000) . ' mg ÷ (0.33 × ' . ($t * 60) . ') = ' . $I . ' A.'], 'Units first: grams to mg, minutes to seconds.', 'application', 55); },
        // What happens at each electrode.
        static function (MlbRng $r) { if ($r->int(0, 1) === 0)
                return mlb_mcq($r, 'Copper sulphate solution is electrolysed between two copper electrodes. What happens at the CATHODE?', 'Copper is deposited on it',
                    [['It dissolves, losing copper', 'That happens at the ANODE.'], ['Oxygen bubbles off it', 'With copper electrodes, no gas is given off here; copper ions take electrons and are deposited.'], ['Nothing: the ions only move about in the solution', 'Ions reaching the electrode gain electrons and come out of solution.']],
                    ['Positive copper ions move to the negative electrode (the cathode).', 'There each gains two electrons and is deposited as copper metal; the anode dissolves to replace them.'], 'Which ions are attracted to the negative electrode?', 'concept', 35);
            return mlb_mcq($r, 'A spoon is to be silver-plated by electrolysis in silver nitrate solution. How must it be connected?', 'As the cathode (to the negative terminal), with a silver anode',
                [['As the anode (to the positive terminal), so silver can reach it', 'At the anode metal dissolves; the spoon would be eaten away, not plated.'], ['As the cathode, with a copper anode to carry the current', 'The anode must be silver, to replace the silver ions deposited.'], ['It does not matter which terminal, as long as current flows', 'Positive silver ions go to the NEGATIVE electrode only.']],
                ['Silver ions are positive and are deposited on the negative electrode.', 'So the spoon is the cathode; a silver anode dissolves to keep the solution topped up.'], 'Where do positive metal ions go?', 'application', 40); },
        // Typed: the electrochemical equivalent from an experiment.
        static function (MlbRng $r) { [$metal, $Z] = $r->pick([['copper', 0.33], ['silver', 1.12], ['zinc', 0.34], ['nickel', 0.3]]); $I = $r->pick([0.5, 1, 2]); $t = $r->pick([600, 1000, 1200, 1500]); $m = $Z * $I * $t;
            return phy_num('A current of ' . mlb_dec($I) . ' A for ' . $t . ' s deposits ' . mlb_dec($m) . ' mg of ' . $metal . '. What is the electrochemical equivalent of ' . $metal . ', in mg/C?', mlb_dec($Z), 'mg/C',
                ['Charge passed: Q = It = ' . mlb_dec($I) . ' × ' . $t . ' = ' . mlb_dec($I * $t) . ' C.', 'Z = m ÷ Q = ' . mlb_dec($m) . ' ÷ ' . mlb_dec($I * $t) . ' = ' . mlb_dec($Z) . ' mg/C.'], 'Mass deposited per coulomb.', 'procedure', 45); },
    ],
    ];
}

/* ═══ Stage 8 — Modern physics ═══ */
function phy_more_8(): array {
    return [
    'PH-071' => [
        // Typed: the stopping potential.
        static function (MlbRng $r) { [$lam, $E] = $r->pick([[200, 6.2], [248, 5], [310, 4], [400, 3.1]]); $phi = $r->pick([1.8, 2, 2.3, 2.5]);
            return phy_num('Light of wavelength ' . $lam . ' nm falls on a metal with a work function of ' . mlb_dec($phi) . ' eV. What stopping potential just stops the fastest photoelectrons? (hc = 1240 eV nm)', mlb_dec($E - $phi), 'V',
                ['Photon energy = 1240 ÷ ' . $lam . ' = ' . mlb_dec($E) . ' eV. Fastest electrons: KE = ' . mlb_dec($E) . ' − ' . mlb_dec($phi) . ' = ' . mlb_dec($E - $phi) . ' eV.', 'A KE of ' . mlb_dec($E - $phi) . ' eV is stopped by ' . mlb_dec($E - $phi) . ' V (eV_s = KE_max).'], 'Photon energy minus work function, then think in electronvolts.', 'application', 55); },
        // Frequency, not brightness, sets the energy.
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Light is freeing electrons from a metal. The light is changed to a HIGHER frequency (bluer), at the same brightness. What happens?', 'The emitted electrons leave with more kinetic energy',
                [['More electrons are emitted, with the same energy as before', 'That is what a BRIGHTER light of the same colour does.'], ['Nothing changes, because the brightness is the same', 'Each photon now carries more energy (E = hf), and each electron gets one photon’s worth.'], ['Emission stops', 'A higher frequency is further above the threshold, not below it.']],
                ['Each electron absorbs one photon: KE_max = hf − φ.', 'A higher f means more energy per photon, so faster electrons. Brightness sets the NUMBER of photons, not their energy.'], 'What does frequency set: the number of photons, or the energy of each?', 'reasoning', 40); },
    ],
    'PH-072' => [
        // Typed: ionisation energy from a level.
        static function (MlbRng $r) { $n = $r->int(2, 5);
            return phy_num('In hydrogen, Eₙ = −13.6 ÷ n² eV. How much energy is needed to free (ionise) an electron that is in level n = ' . $n . '? (Give 2 decimal places.)', mlb_rd(13.6 / ($n * $n), 2), 'eV',
                ['Freeing it means raising it to n = ∞, where E = 0.', 'Energy needed = 0 − (−13.6 ÷ ' . ($n * $n) . ') = ' . mlb_rd(13.6 / ($n * $n), 2) . ' eV.'], 'How far below zero is that level?', 'procedure', 45, 2); },
        // Typed: the frequency of the photon.
        static function (MlbRng $r) { $E = $r->pick([1.89, 2.55, 3.4, 10.2, 12.09]);
            return phy_num('An atom emits a photon of energy ' . mlb_dec($E) . ' eV. What is its frequency, in units of 10¹⁴ Hz? (h = 4.14 × 10⁻¹⁵ eV s; give 2 decimal places)', mlb_rd($E / 4.14 * 10, 2), '× 10¹⁴ Hz',
                ['E = hf, so f = E ÷ h.', 'f = ' . mlb_dec($E) . ' ÷ (4.14 × 10⁻¹⁵) = ' . mlb_rd($E / 4.14 * 10, 2) . ' × 10¹⁴ Hz.'], 'Rearrange E = hf; h is given in eV s, so no conversion is needed.', 'procedure', 50, 2); },
        // Absorption lines.
        static function (MlbRng $r) { $gas = $r->pick(['hydrogen', 'sodium vapour', 'helium']);
            return mlb_mcq($r, 'White light from a hot source passes through cool ' . $gas . ' and then through a prism. What does the spectrum show?', 'A full rainbow with dark lines at exactly the colours ' . $gas . ' emits',
                [['Bright lines at the colours ' . $gas . ' emits, on a dark background', 'That is the EMISSION spectrum of the hot gas on its own.'], ['A full rainbow with no lines, since the light passes straight through', 'The cool gas absorbs photons whose energy matches its level gaps.'], ['Only the colours of ' . $gas . ', since the rest are absorbed', 'Most of the white light passes through untouched; only certain colours are removed.']],
                ['The atoms absorb only photons whose energy equals a gap between their levels — the same gaps they emit from.', 'So those exact colours are missing: dark absorption lines on a continuous spectrum.'], 'Which photons can the cool atoms absorb?', 'reasoning', 45); },
    ],
    'PH-073' => [
        // Typed: an electron's de Broglie wavelength.
        static function (MlbRng $r) { $v = $r->pick([1, 2, 4, 5]); $lam = 6.6e-34 / (9.1e-31 * $v * 1e6) * 1e9;
            return phy_num('An electron (mass 9.1 × 10⁻³¹ kg) moves at ' . $v . ' × 10⁶ m/s. What is its de Broglie wavelength, in nanometres? (h = 6.6 × 10⁻³⁴ J s; give 3 decimal places)', mlb_rd($lam, 3), 'nm',
                ['λ = h ÷ (mv).', 'λ = 6.6 × 10⁻³⁴ ÷ (9.1 × 10⁻³¹ × ' . $v . ' × 10⁶) = ' . mlb_rd($lam, 3) . ' × 10⁻⁹ m = ' . mlb_rd($lam, 3) . ' nm.'], 'Momentum first: mass × velocity.', 'procedure', 60, 3); },
        // Typed, rearranged: momentum from wavelength.
        static function (MlbRng $r) { $lam = $r->pick([0.1, 0.2, 0.3, 0.6, 1.1, 0.22]);
            return phy_num('A particle has a de Broglie wavelength of ' . mlb_dec($lam) . ' nm. What is its momentum, in units of 10⁻²⁴ kg m/s? (h = 6.6 × 10⁻³⁴ J s)', mlb_dec(round(0.66 / $lam, 6)), '× 10⁻²⁴ kg m/s',
                ['λ = h ÷ p, so p = h ÷ λ.', 'p = 6.6 × 10⁻³⁴ ÷ (' . mlb_dec($lam) . ' × 10⁻⁹) = ' . mlb_dec(round(0.66 / $lam, 6)) . ' × 10⁻²⁴ kg m/s.'], 'Rearrange λ = h/p, with λ in metres.', 'procedure', 50); },
        // Compare: same speed, different mass.
        static function (MlbRng $r) { [$a, $b] = $r->pick([['an electron', 'a proton'], ['an electron', 'a neutron'], ['a proton', 'an alpha particle']]);
            return mlb_mcq($r, ucfirst($a) . ' and ' . $b . ' move at the SAME speed. Which has the shorter de Broglie wavelength?', ucfirst($b) . ', because it is heavier and so has more momentum',
                [[ucfirst($a) . ', because it is smaller, so its wave is squeezed shorter', 'Wavelength depends on momentum, not size: λ = h ÷ mv.'], ['They are the same, because equal speeds give equal wavelengths', 'Equal speeds but different masses give different momenta.'], [ucfirst($a) . ', because it is lighter', 'Lighter means LESS momentum and so a LONGER wavelength.']],
                ['λ = h ÷ (mv).', 'Same v, bigger m: bigger momentum, shorter wavelength — so ' . $b . '.'], 'λ = h ÷ mv: what is different between them?', 'reasoning', 40); },
    ],
    'PH-074' => [
        // Typed: the gap between two levels.
        static function (MlbRng $r) { $E1 = $r->pick([0.5, 1, 2, 4]); $n = $r->int(1, 3); $m = $r->int($n + 1, 5);
            return phy_num('A particle in a box has E₁ = ' . mlb_dec($E1) . ' eV, with Eₙ = n²E₁. How much energy does it give out when it drops from n = ' . $m . ' to n = ' . $n . '?', mlb_dec(($m * $m - $n * $n) * $E1), 'eV',
                ['E' . $m . ' = ' . ($m * $m) . ' × ' . mlb_dec($E1) . ' = ' . mlb_dec($m * $m * $E1) . ' eV; E' . $n . ' = ' . ($n * $n) . ' × ' . mlb_dec($E1) . ' = ' . mlb_dec($n * $n * $E1) . ' eV.', 'Energy given out = ' . mlb_dec($m * $m * $E1) . ' − ' . mlb_dec($n * $n * $E1) . ' = ' . mlb_dec(($m * $m - $n * $n) * $E1) . ' eV.'], 'Find each level, then the difference.', 'procedure', 45); },
        // Why never zero energy.
        static function (MlbRng $r) { $what = $r->pick(['an electron trapped in a tiny box', 'a particle confined in a narrow quantum well', 'an electron held inside a nanocrystal']);
            return mlb_mcq($r, 'Why can ' . $what . ' never have zero energy, even at absolute zero?', 'At least half a wavelength must fit in the box, so it always has some momentum and kinetic energy',
                [['It is always being heated by the walls of the box, so it keeps a little thermal energy', 'This holds even at absolute zero: it is a property of a confined wave, not of heat.'], ['Its mass keeps turning into energy, so some energy is always present', 'Nothing is being converted; the minimum energy comes from confinement.'], ['It can — at absolute zero it sits still in the ground state, with E = 0', 'The ground state is E₁ = h² ÷ (8mL²), which is not zero.']],
                ['A trapped particle is a standing wave: the box must hold at least half a wavelength, λ ≤ 2L.', 'So p = h ÷ λ cannot be zero, and neither can the kinetic energy: E₁ = h² ÷ (8mL²).'], 'What is the longest wave that fits in the box?', 'reasoning', 45); },
    ],
    'PH-075' => [
        // Typed, rearranged: the mass turned into energy.
        static function (MlbRng $r) { $k = $r->pick([0.5, 1, 2, 3, 4, 8]);
            return phy_num('A nuclear power station releases ' . mlb_dec(9 * $k) . ' × 10¹³ J of energy. How much mass has been turned into energy, in grams? (c = 3 × 10⁸ m/s)', mlb_dec($k), 'g',
                ['E = mc², so m = E ÷ c².', 'm = ' . mlb_dec(9 * $k) . ' × 10¹³ ÷ (9 × 10¹⁶) = ' . mlb_dec($k) . ' × 10⁻³ kg = ' . mlb_dec($k) . ' g.'], 'Rearrange E = mc²; c² = 9 × 10¹⁶.', 'procedure', 50); },
        // Typed: mass lost each second by a star.
        static function (MlbRng $r) { $P = $r->pick([1.8, 2.7, 3.6, 4.5, 9]);
            return phy_num('A star radiates ' . mlb_dec($P) . ' × 10²⁶ W. How much mass does it lose each second, in units of 10⁹ kg? (c = 3 × 10⁸ m/s)', mlb_dec(round($P / 0.9, 6)), '× 10⁹ kg',
                ['Each second it gives out ' . mlb_dec($P) . ' × 10²⁶ J, and m = E ÷ c².', 'm = ' . mlb_dec($P) . ' × 10²⁶ ÷ (9 × 10¹⁶) = ' . mlb_dec(round($P / 0.9, 6)) . ' × 10⁹ kg every second.'], 'Power is energy per second: use E = mc² for one second.', 'application', 55); },
    ],
    'PH-076' => [
        // Typed: total binding energy.
        static function (MlbRng $r) { [$nuc, $A, $b] = $r->pick([['helium-4', 4, 7.07], ['carbon-12', 12, 7.68], ['oxygen-16', 16, 7.98], ['iron-56', 56, 8.8], ['uranium-238', 238, 7.6]]);
            return phy_num('The binding energy per nucleon of ' . $nuc . ' is ' . mlb_dec($b) . ' MeV. What is its TOTAL binding energy?', mlb_dec(round($A * $b, 4)), 'MeV',
                ['Total = binding energy per nucleon × number of nucleons.', mlb_dec($b) . ' × ' . $A . ' = ' . mlb_dec(round($A * $b, 4)) . ' MeV.'], 'How many nucleons does ' . $nuc . ' have?', 'procedure', 40); },
        // Why fusing light nuclei releases energy.
        static function (MlbRng $r) { $what = $r->pick(['two hydrogen nuclei fuse into helium in the Sun', 'deuterium and tritium fuse in a fusion reactor']);
            return mlb_mcq($r, 'Energy is released when ' . $what . '. Why?', 'The product has a larger binding energy per nucleon, so it has less mass, and the lost mass is released as energy',
                [['The binding energy per nucleon goes DOWN, so the nucleons are held less tightly and the spare energy escapes', 'If it went down, energy would have to be SUPPLIED.'], ['Mass is created in the reaction, and the extra mass is turned into energy by E = mc²', 'The products have LESS mass; that is where the energy comes from.'], ['The nuclei repel each other, and the energy of that repulsion is released when they fuse', 'The repulsion has to be OVERCOME (that is why fusion needs huge temperatures).']],
                ['For light nuclei, binding energy per nucleon rises as they combine (up towards iron-56).', 'More tightly bound means less total mass; the mass difference appears as energy, E = mc².'], 'Look at the binding-energy-per-nucleon curve for light nuclei.', 'reasoning', 45); },
    ],
    'PH-077' => [
        // Typed: the series resistor for an LED.
        static function (MlbRng $r) { $V = $r->pick([5, 9, 12]); $Vf = $r->pick([1.8, 2, 3]); $I = $r->pick([10, 20, 25]);
            return phy_num('An LED needs ' . mlb_dec($Vf) . ' V across it and a current of ' . $I . ' mA. What resistor must go in series with it on a ' . $V . ' V supply?', mlb_dec(($V - $Vf) / ($I / 1000)), 'Ω',
                ['The resistor takes the rest of the voltage: ' . $V . ' − ' . mlb_dec($Vf) . ' = ' . mlb_dec($V - $Vf) . ' V.', 'R = V ÷ I = ' . mlb_dec($V - $Vf) . ' ÷ ' . mlb_dec($I / 1000) . ' = ' . mlb_dec(($V - $Vf) / ($I / 1000)) . ' Ω.'], 'Mind the milliamps.', 'application', 55); },
        // Half-wave rectification.
        static function (MlbRng $r) { $what = $r->pick(['a resistor', 'a small lamp', 'a phone battery being charged']);
            return mlb_mcq($r, 'A single diode is connected in series with ' . $what . ' across an a.c. supply. What current flows through it?', 'Current in one direction only, in pulses during half of each cycle',
                [['A steady, smooth direct current, as from a battery', 'One diode only blocks the reverse half; smoothing needs a capacitor.'], ['The same alternating current as before, only a little smaller', 'The diode blocks current in the reverse direction.'], ['No current at all, because the diode blocks a.c. completely', 'In the forward half of each cycle, the diode conducts.']],
                ['A diode conducts in one direction only.', 'So current flows only in the forward half of each a.c. cycle: half-wave rectified, pulsing d.c.'], 'What does the diode do in the reverse half of the cycle?', 'concept', 40); },
    ],
    'PH-078' => [
        // Typed, rearranged: a temperature from the peak wavelength.
        static function (MlbRng $r) { [$what, $T] = $r->pick([['A red-hot piece of charcoal', 2000], ['A cool red star', 2900], ['A star', 5000], ['The Sun', 5800], ['A blue-white star', 10000], ['A hot star', 7250]]); $lam = 2.9e6 / $T;
            return phy_num($what . ' radiates most strongly at a wavelength of ' . mlb_dec($lam) . ' nm. What is its surface temperature? (Wien: λ_max T = 2.9 × 10⁻³ m K)', $T, 'K',
                ['T = 2.9 × 10⁻³ ÷ λ_max, with λ in metres.', 'T = 2.9 × 10⁻³ ÷ (' . mlb_dec($lam) . ' × 10⁻⁹) = ' . mlb_p($T) . ' K.'], 'Rearrange Wien’s law; nanometres to metres first.', 'procedure', 50); },
        // Typed: radiated power from Stefan's law.
        static function (MlbRng $r) { $A = $r->pick([0.01, 0.02, 0.05, 0.1]); $T = $r->pick([500, 1000, 1500, 2000]); $P = 5.67e-8 * $A * $T ** 4;
            return phy_num('A black body has a surface area of ' . mlb_dec($A) . ' m² and is at ' . $T . ' K. How much power does it radiate? (σ = 5.67 × 10⁻⁸ W/m² K⁴; nearest watt)', mlb_rd($P, 0), 'W',
                ['P = σAT⁴.', 'P = 5.67 × 10⁻⁸ × ' . mlb_dec($A) . ' × ' . $T . '⁴ = ' . mlb_rd($P, 0) . ' W.'], 'Raise the kelvin temperature to the fourth power.', 'procedure', 55, 0); },
    ],
    'PH-079' => [
        // Typed: the energy of the electrons in the tube.
        static function (MlbRng $r) { $kV = $r->pick([20, 30, 50, 80, 100, 150]);
            return phy_num('Electrons in an X-ray tube are accelerated through ' . $kV . ' kV. What kinetic energy does each gain, in units of 10⁻¹⁵ J? (e = 1.6 × 10⁻¹⁹ C)', mlb_dec(0.16 * $kV), '× 10⁻¹⁵ J',
                ['KE = eV.', '1.6 × 10⁻¹⁹ × ' . $kV . ' × 10³ = ' . mlb_dec(0.16 * $kV) . ' × 10⁻¹⁵ J.'], 'Charge × accelerating voltage.', 'procedure', 45); },
        // Typed: the highest X-ray frequency.
        static function (MlbRng $r) { $kV = $r->pick([20, 30, 50, 80, 100]); $f = 1.6e-19 * $kV * 1000 / 6.6e-34 / 1e18;
            return phy_num('An X-ray tube runs at ' . $kV . ' kV. What is the HIGHEST frequency of X-ray it can produce, in units of 10¹⁸ Hz? (e = 1.6 × 10⁻¹⁹ C, h = 6.6 × 10⁻³⁴ J s; 2 decimal places)', mlb_rd($f, 2), '× 10¹⁸ Hz',
                ['The most energetic photon takes ALL of one electron’s energy: hf = eV.', 'f = eV ÷ h = 1.6 × 10⁻¹⁹ × ' . $kV . ' × 10³ ÷ (6.6 × 10⁻³⁴) = ' . mlb_rd($f, 2) . ' × 10¹⁸ Hz.'], 'One electron’s whole energy goes into one photon.', 'challenge', 60, 2); },
        // Shielding.
        static function (MlbRng $r) { $what = $r->pick(['the apron a radiographer wears', 'the walls and door of an X-ray room', 'the bib a dentist puts on a patient']);
            return mlb_mcq($r, 'Which material is used in ' . $what . ' to stop X-rays?', 'Lead',
                [['Aluminium foil', 'Thin aluminium stops beta particles; X-rays pass straight through it.'], ['Thick plastic', 'Plastic is mostly light atoms, which absorb X-rays poorly.'], ['Ordinary glass', 'Glass lets most X-rays through.']],
                ['X-rays are absorbed best by dense materials made of heavy atoms.', 'Lead is dense, with a large atomic number, so a few millimetres absorb most of the X-rays.'], 'What makes bones show up on an X-ray?', 'concept', 30); },
    ],
    'PH-080' => [
        // Typed: rows in a truth table.
        static function (MlbRng $r) { $n = $r->int(2, 5); $ctx = $r->pick(['an alarm for an estate gate', 'a borehole pump controller', 'a classroom fan controller', 'a car’s warning light']);
            return phy_num('The logic circuit in ' . $ctx . ' has ' . $n . ' inputs, each 0 or 1. How many rows does its full truth table need?', 2 ** $n, '',
                ['Each input doubles the number of combinations.', '2 × 2' . str_repeat(' × 2', $n - 2) . ' = 2^' . $n . ' = ' . (2 ** $n) . ' rows.'], 'With one input there are 2 rows. What does each extra input do?', 'reasoning', 35); },
        // Typed: the output of a combination of gates.
        static function (MlbRng $r) { $A = $r->int(0, 1); $B = $r->int(0, 1); $C = $r->int(0, 1);
            $rows = [['Q = (A AND B) OR C', ($A & $B) | $C, 'A AND B = ' . ($A & $B) . '; then ' . ($A & $B) . ' OR ' . $C . ' = ' . (($A & $B) | $C) . '.'],
                     ['Q = (A OR B) AND C', ($A | $B) & $C, 'A OR B = ' . ($A | $B) . '; then ' . ($A | $B) . ' AND ' . $C . ' = ' . (($A | $B) & $C) . '.'],
                     ['Q = NOT (A AND B)', 1 - ($A & $B), 'A AND B = ' . ($A & $B) . '; NOT that = ' . (1 - ($A & $B)) . '.'],
                     ['Q = NOT (A OR B) AND C', (1 - ($A | $B)) & $C, 'A OR B = ' . ($A | $B) . '; NOT that = ' . (1 - ($A | $B)) . '; AND C = ' . ((1 - ($A | $B)) & $C) . '.']];
            [$eq, $q, $why] = $r->pick($rows);
            return phy_num('A logic circuit gives ' . $eq . '. What is Q when A = ' . $A . ', B = ' . $B . ' and C = ' . $C . '? (Answer 0 or 1.)', $q, '',
                ['Work from the innermost bracket outwards.', $why], 'Do the bracket first.', 'procedure', 45); },
        // Name the gate from its truth table.
        static function (MlbRng $r) { $g = ['AND' => '0, 0, 0, 1', 'OR' => '0, 1, 1, 1', 'NAND' => '1, 1, 1, 0', 'NOR' => '1, 0, 0, 0', 'XOR (exclusive OR)' => '0, 1, 1, 0'];
            $k = $r->pick(array_keys($g)); $wrong = []; foreach ($g as $n => $t) if ($n !== $k) $wrong[] = [$n . ' gate', 'An ' . $n . ' gate gives ' . $t . '.'];
            return mlb_mcq($r, 'For the inputs AB = 00, 01, 10, 11 in that order, the gate in ' . $r->pick(['a security light', 'a water-tank alarm', 'a door buzzer', 'a generator changeover switch']) . ' gives the outputs ' . $g[$k] . '. Which gate is it?', $k . ' gate', array_slice($r->shuffle($wrong), 0, 3),
                ['AND: 1 only when both are 1. OR: 1 when either is. NAND and NOR are their opposites. XOR: 1 when the inputs differ.', 'The outputs ' . $g[$k] . ' are the ' . $k . ' gate.'], 'When exactly is the output 1?', 'concept', 40); },
    ],
    ];
}

/* ═══ Stage 9 — Olympiad physics ═══ */
function phy_more_9(): array {
    return [
    'PH-081' => [
        // Typed: a scaling factor from a dimensional result.
        static function (MlbRng $r) { $k = $r->pick([2, 3, 5, 6, 9]);
            return phy_num('Dimensional analysis shows that the speed of a wave on a stretched string is v = k√(T ÷ μ), where T is the tension. The tension is made ' . $k . ' times as big. By what factor does the wave speed change? (Give 3 decimal places.)', mlb_rd(sqrt($k), 3), '',
                ['v ∝ √T.', 'Factor = √' . $k . ' = ' . mlb_rd(sqrt($k), 3) . '.'], 'Which power of T appears?', 'reasoning', 40, 3); },
        // Which equation cannot be right?
        static function (MlbRng $r) {
            $bad = [['s = ut + ½at', '½at is a speed (m/s), but s and ut are lengths (m).'], ['v = u + as', 'as is m²/s², not a speed.'], ['v² = u + 2as', 'u is a speed, but v² and 2as are speeds squared.'], ['KE = ½mv', '½mv is a momentum (kg m/s), not an energy (kg m²/s²).']];
            $good = [['v = u + at', 'Every term is a speed (m/s): it is consistent.'], ['s = ut + ½at²', 'Every term is a length (m): it is consistent.'], ['v² = u² + 2as', 'Every term is m²/s²: it is consistent.'], ['KE = ½mv²', 'Both sides are kg m²/s²: it is consistent.'], ['F = ma', 'Both sides are kg m/s²: it is consistent.']];
            [$w, $why] = $r->pick($bad); $opts = array_slice($r->shuffle($good), 0, 3);
            return mlb_mcq($r, $r->pick(MLB_NAMES) . ' writes down four equations from memory before a ' . $r->pick(['class test', 'mock exam', 'quiz', 'revision session']) . '. Using dimensions alone, which one CANNOT be right?', $w, $opts,
                ['Every term added or equated must have the same dimensions.', $w . ' fails: ' . $why], 'Check the units of every term separately.', 'reasoning', 45); },
    ],
    'PH-082' => [
        // Typed: an order of magnitude.
        static function (MlbRng $r) { $c = $r->int(0, 3);
            if ($c === 0) { $d = $r->pick([1, 30, 365, 3650]); $x = $d * 86400; $q = 'the number of seconds in ' . $d . ' day' . ($d > 1 ? 's' : '') . ' (1 day = 86 400 s)'; }
            elseif ($c === 1) { $b = $r->pick([60, 70, 80]); $x = $b * 60 * 24; $q = 'the number of times a heart beating ' . $b . ' times a minute beats in a day'; }
            elseif ($c === 2) { $m = $r->pick([25, 50]); $x = $m * 1000 / 0.02; $q = 'the number of grains in a ' . $m . ' kg bag of rice, if one grain has a mass of about 0.02 g'; }
            else { $n = $r->pick([12, 15, 20]); $x = $n * 60 * 24 * 365; $q = 'the number of breaths a person taking ' . $n . ' breaths a minute takes in a year'; }
            $e = (int)round(log10($x));
            return phy_num('To the nearest power of ten, estimate ' . $q . '. Give just the power: for 10⁵, type 5.', $e, '',
                ['Work it out roughly: about ' . mlb_p(round($x, -((int)floor(log10($x))) + 1)) . '.', 'Its logarithm is ' . mlb_rd(log10($x), 2) . ', so the nearest power of ten is 10^' . $e . '.'], 'Multiply roughly, then count the digits.', 'reasoning', 60); },
        // Typed: the energy to boil a kettle.
        static function (MlbRng $r) { $L = $r->pick([0.5, 1, 1.5, 2]); $t0 = $r->pick([20, 25, 30]);
            return phy_num('Roughly how much energy, in kJ, does it take to bring ' . mlb_dec($L) . ' litre' . ($L == 1 ? '' : 's') . ' of tap water at ' . $t0 . ' °C to the boil? (1 litre of water has a mass of 1 kg; c = 4200 J/kg°C)', mlb_dec($L * 4200 * (100 - $t0) / 1000), 'kJ',
                ['Q = mcΔθ = ' . mlb_dec($L) . ' × 4200 × (100 − ' . $t0 . ').', 'Q = ' . mlb_p($L * 4200 * (100 - $t0)) . ' J = ' . mlb_dec($L * 4200 * (100 - $t0) / 1000) . ' kJ — a little under a third of a kilowatt-hour per litre.'], 'Mass, specific heat capacity, temperature rise.', 'application', 50); },
    ],
    'PH-083' => [
        // Typed: orbital speed from radius and period.
        static function (MlbRng $r) { [$what, $rad, $T] = $r->pick([['A navigation satellite', 26.6, 12], ['A geostationary satellite', 42.2, 24], ['A weather satellite', 7.2, 1.6], ['A satellite', 8, 2]]);
            $v = 2 * 3.14 * $rad * 1e6 / ($T * 3600) / 1000;
            return phy_num($what . ' orbits ' . mlb_dec($rad) . ' × 10⁶ m from the Earth’s centre, once every ' . mlb_dec($T) . ' hours. What is its orbital speed, in km/s? (π = 3.14; 2 decimal places)', mlb_rd($v, 2), 'km/s',
                ['v = circumference ÷ period = 2πr ÷ T.', 'v = 2 × 3.14 × ' . mlb_dec($rad) . ' × 10⁶ ÷ (' . mlb_dec($T) . ' × 3600) = ' . mlb_rd($v * 1000, 0) . ' m/s = ' . mlb_rd($v, 2) . ' km/s.'], 'Distance once round ÷ time once round.', 'procedure', 55, 2); },
        // Kepler's second law.
        static function (MlbRng $r) { [$what, $c] = $r->pick([['a comet', 'the Sun'], ['a planet', 'the Sun'], ['a satellite in an elliptical orbit', 'the Earth']]);
            return mlb_mcq($r, 'Where in its elliptical orbit around ' . $c . ' does ' . $what . ' move FASTEST?', 'Where it is nearest to ' . $c,
                [['Where it is farthest from ' . $c, 'Far away it moves most SLOWLY.'], ['It moves at the same speed all the way round', 'Only a circular orbit has a constant speed.'], ['Halfway between nearest and farthest', 'Speed rises all the way in to the nearest point.']],
                ['Kepler’s second law: the line to ' . $c . ' sweeps out equal areas in equal times.', 'Close in, the line is short, so it must sweep faster to cover the same area: the speed is greatest at the nearest point.'], 'Equal areas in equal times: what happens to a short line?', 'reasoning', 40); },
    ],
    'PH-084' => [
        // A hoop against a disc.
        static function (MlbRng $r) { [$a, $b] = $r->pick([['a hollow pipe', 'a solid rod'], ['a thin hoop', 'a solid disc'], ['a bicycle wheel with its mass in the rim', 'a solid wooden wheel']]);
            return mlb_mcq($r, ucfirst($a) . ' and ' . $b . ' of the same mass and radius roll from rest down the same slope, without slipping. Which reaches the bottom first?', ucfirst($b),
                [[ucfirst($a), 'With its mass far from the axis, more of its energy goes into spinning, leaving less for moving down the slope.'], ['They arrive together, because their masses are equal', 'Equal mass is not enough: how the mass is spread out (the moment of inertia) matters.'], ['Whichever is pushed hardest at the start', 'Both start from rest.']],
                ['The same height gives the same energy, shared between moving along and spinning.', ucfirst($b) . ' has the smaller moment of inertia, so less goes into spinning and it moves faster.'], 'Where is each one’s mass, compared with its axis?', 'reasoning', 45); },
        // Typed: angular momentum.
        static function (MlbRng $r) { $m = $r->pick([2, 4, 5, 10]); $rad = $r->pick([0.1, 0.2, 0.5]); $w = $r->int(2, 20);
            return phy_num('A solid disc of mass ' . $m . ' kg and radius ' . mlb_dec($rad) . ' m spins at ' . $w . ' rad/s. What is its angular momentum? (I = ½mr²)', mlb_dec(0.5 * $m * $rad * $rad * $w), 'kg m²/s',
                ['I = ½ × ' . $m . ' × ' . mlb_dec($rad) . '² = ' . mlb_dec(0.5 * $m * $rad * $rad) . ' kg m².', 'L = Iω = ' . mlb_dec(0.5 * $m * $rad * $rad) . ' × ' . $w . ' = ' . mlb_dec(0.5 * $m * $rad * $rad * $w) . ' kg m²/s.'], 'Angular momentum is the rotational version of mv.', 'procedure', 45); },
    ],
    'PH-085' => [
        // Typed: the rate at which braking turns KE into heat.
        static function (MlbRng $r) { $F = $r->int(2, 30) * 1000; $v = $r->int(5, 40);
            return phy_num('The eddy-current brakes of a train exert a braking force of ' . mlb_p($F) . ' N while it moves at ' . $v . ' m/s. At what rate are they turning its kinetic energy into heat, in kW?', mlb_dec($F * $v / 1000), 'kW',
                ['Power = force × velocity.', mlb_p($F) . ' × ' . $v . ' = ' . mlb_p($F * $v) . ' W = ' . mlb_dec($F * $v / 1000) . ' kW.'], 'P = Fv.', 'application', 40); },
        // Why eddy brakes fade at low speed.
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Magnetic (eddy-current) brakes slow a train well at high speed but hardly at all near a stop, so ordinary brakes are needed at the end. Why?', 'The induced current, and so the braking force, is proportional to the speed',
                [['The magnets weaken as they warm up, so they grip the train less', 'Even with perfectly cool magnets, the force still fades as the train slows.'], ['Eddy currents only flow in one direction, so they cannot stop it fully', 'Their direction is not the issue; their size is.'], ['The braking force grows as the train slows, so it would jerk to a stop', 'It is the other way round: no motion, no changing flux, no current.']],
                ['The e.m.f. comes from the metal moving through the field: ε = BLv.', 'Slower motion gives a smaller e.m.f., a smaller current and a smaller force — zero when stopped.'], 'What makes the eddy currents flow in the first place?', 'reasoning', 45); },
    ],
    'PH-086' => [
        // Typed: an engine's efficiency from heat in and out.
        static function (MlbRng $r) { $Qh = $r->pick([100, 200, 250, 400, 500]); $e = $r->pick([20, 25, 30, 35, 40]); $Qc = $Qh * (100 - $e) / 100;
            return phy_num('Each second, a generator’s engine takes ' . $Qh . ' kJ of heat from burning fuel and rejects ' . mlb_dec($Qc) . ' kJ to its surroundings. What is its efficiency?', $e, '%',
                ['Work done = heat in − heat out = ' . $Qh . ' − ' . mlb_dec($Qc) . ' = ' . mlb_dec($Qh - $Qc) . ' kJ.', 'Efficiency = work ÷ heat in = ' . mlb_dec($Qh - $Qc) . ' ÷ ' . $Qh . ' × 100% = ' . $e . '%.'], 'The work is what the heat in did NOT throw away.', 'procedure', 50); },
        // Heat does not flow uphill by itself.
        static function (MlbRng $r) { $what = $r->pick(['a fridge', 'an air conditioner', 'a deep freezer']);
            return mlb_mcq($r, 'Why must ' . $what . ' be plugged in to keep moving heat from its cold inside out to a warmer room?', 'Heat flows by itself only from hot to cold; moving it the other way needs work to be done',
                [['To power the light and the fan inside it, which run all the time', 'The light is a tiny load; the work goes into pumping heat.'], ['Because cold has to be made by electricity and then pumped into the inside', 'There is no “cold” to make: heat is moved out.'], ['It does not need to: heat flows out of the cold inside by itself', 'Heat never flows from cold to hot unaided (the second law of thermodynamics).']],
                ['The second law: heat flows spontaneously only from a hotter body to a colder one.', 'A refrigerator moves heat from cold to hot, so a compressor must do work — which is why the back of it gets warm.'], 'Which way does heat flow when left alone?', 'reasoning', 40); },
    ],
    'PH-087' => [
        // How greenhouse gases warm the ground.
        static function (MlbRng $r) { $gas = $r->pick(['carbon dioxide', 'water vapour', 'methane']);
            return mlb_mcq($r, 'How does ' . $gas . ' in the atmosphere make the ground warmer?', 'It lets most sunlight through but absorbs the infrared the warm ground gives off, sending part of it back down',
                [['It makes a hole in the sky that lets in more of the Sun’s light, so more heat reaches the ground', 'That confuses the greenhouse effect with the ozone hole; it is about outgoing infrared.'], ['It traps the incoming sunlight and reflects it back down, so the ground gets it twice', 'It is the OUTGOING infrared it absorbs; most sunlight passes straight through.'], ['It produces heat by itself, like a gas fire burning slowly in the air', 'It only re-emits energy the ground has radiated.']],
                ['The Sun’s light (mostly visible) passes through; the ground warms and radiates infrared.', 'Greenhouse gases absorb that infrared and re-radiate part of it downwards, so the ground must be warmer to balance its energy.'], 'Which radiation does the gas absorb: incoming sunlight or outgoing infrared?', 'concept', 40); },
        // Typed: sunlight absorbed by a roof.
        static function (MlbRng $r) { $A = $r->pick([20, 30, 40, 50]); $a = $r->pick([0.1, 0.2, 0.3, 0.6, 0.7]); $roof = $a >= 0.6 ? 'white-painted' : 'dark';
            return phy_num('Noon sunlight in Kano delivers about 1000 W/m². A ' . $roof . ' roof of area ' . $A . ' m² reflects a fraction ' . mlb_dec($a) . ' of it (its albedo). How much power does the roof absorb, in kW?', mlb_dec($A * (1 - $a)), 'kW',
                ['Fraction absorbed = 1 − albedo = ' . mlb_dec(1 - $a) . '.', '1000 × ' . $A . ' × ' . mlb_dec(1 - $a) . ' = ' . mlb_p(round(1000 * $A * (1 - $a))) . ' W = ' . mlb_dec($A * (1 - $a)) . ' kW.'], 'What is NOT reflected is absorbed.', 'application', 45); },
    ],
    'PH-088' => [
        // A bigger resistor, a slower discharge.
        static function (MlbRng $r) { [$what, $right, $wr] = $r->pick([['The resistor is replaced by one of TWICE the resistance', 'It discharges more slowly: the time constant RC doubles', 'It discharges more quickly: the time constant RC halves'], ['The capacitor is replaced by one of HALF the capacitance', 'It discharges more quickly: the time constant RC halves', 'It discharges more slowly: the time constant RC doubles']]);
            return mlb_mcq($r, 'A capacitor discharges through a resistor. ' . $what . ', and it is charged to the same voltage again. How does the discharge change?', $right,
                [[$wr, 'Look at what happens to RC, the time constant.'], ['No change: the starting voltage is the same', 'The starting voltage is the same, but the RATE depends on RC.'], ['It never fully discharges now; some charge stays on the plates', 'It never fully discharges in any case (the decay is exponential); what changes is the rate.']],
                ['The time constant is τ = RC: the time for the voltage to fall to about 37% of its value.', 'A bigger RC means a slower discharge; a smaller RC a faster one.'], 'What is the time constant made of?', 'reasoning', 40); },
        // Typed: charging after whole time constants.
        static function (MlbRng $r) { $V0 = $r->pick([5, 6, 9, 12]); [$n, $e] = $r->pick([[1, 0.368], [2, 0.135], [3, 0.05]]);
            return phy_num('A capacitor is charged from a ' . $V0 . ' V supply through a resistor, starting empty. What is its voltage after ' . $n . ' time constant' . ($n > 1 ? 's' : '') . '? ($V = V_0(1 - e^{-t/RC})$; take e^−' . $n . ' = ' . mlb_dec($e) . '; 2 decimal places)', mlb_rd($V0 * (1 - $e), 2), 'V',
                ['t = ' . $n . 'RC, so e^(−t/RC) = e^−' . $n . ' = ' . mlb_dec($e) . '.', 'V = ' . $V0 . ' × (1 − ' . mlb_dec($e) . ') = ' . $V0 . ' × ' . mlb_dec(1 - $e) . ' = ' . mlb_rd($V0 * (1 - $e), 2) . ' V.'], 'Charging approaches the supply voltage; it does not decay towards zero.', 'procedure', 50, 2); },
    ],
    'PH-089' => [
        // Typed: length contraction.
        static function (MlbRng $r) { [$b, $f] = $r->pick([[0.6, 0.8], [0.8, 0.6], [0.96, 0.28]]); $L0 = $r->pick([10, 20, 50, 100]);
            return phy_num('A spaceship is ' . $L0 . ' m long when measured at rest. How long does it measure as it flies past an observer at ' . mlb_dec($b) . 'c?', mlb_dec($L0 * $f), 'm',
                ['L = L₀√(1 − v²/c²) — moving lengths shrink along the motion.', '√(1 − ' . mlb_dec($b) . '²) = √' . mlb_dec(1 - $b * $b) . ' = ' . mlb_dec($f) . '; L = ' . $L0 . ' × ' . mlb_dec($f) . ' = ' . mlb_dec($L0 * $f) . ' m.'], 'Shorter or longer than at rest?', 'procedure', 55); },
        // Each sees the other's clock run slow.
        static function (MlbRng $r) { [$a, $b] = array_slice($r->shuffle(MLB_NAMES), 0, 2); $v = $r->pick(['0.6c', '0.8c', '0.9c']);
            return mlb_mcq($r, $a . ' floats in space; ' . $b . ' flies past at a steady ' . $v . '. Each watches the other’s clock. What does each see?', 'Each sees the OTHER’s clock running slow',
                [['Both see ' . $b . '’s clock running slow', 'Neither frame is special: to ' . $b . ', it is ' . $a . ' who is moving.'], ['Both see ' . $a . '’s clock running slow', 'To ' . $a . ', ' . $b . ' is the one moving.'], ['Neither: clocks always agree', 'Moving clocks really do tick slower as measured by an observer they pass.']],
                ['In special relativity there is no absolute rest: each observer may say the other is moving.', 'So each measures the other’s clock running slow by the same factor γ. (The twin paradox needs one of them to turn round.)'], 'Who is moving — according to whom?', 'reasoning', 45); },
    ],
    'PH-090' => [
        // Typed, rearranged: the well width from the ground-state energy.
        static function (MlbRng $r) { $L = $r->pick([1, 1.5, 2, 2.5, 3]); $E1 = round(0.376 / ($L * $L), 4); $Lk = sqrt(0.376 / $E1);
            return phy_num('An electron in a box has a ground-state energy of ' . mlb_dec($E1) . ' eV, where E₁ ≈ 0.376 ÷ L² eV with L in nm. How wide is the box? (2 decimal places)', mlb_rd($Lk, 2), 'nm',
                ['E₁ = 0.376 ÷ L², so L = √(0.376 ÷ E₁).', 'L = √(0.376 ÷ ' . mlb_dec($E1) . ') = ' . mlb_rd($Lk, 2) . ' nm.'], 'Rearrange for L; take the square root last.', 'procedure', 55, 2); },
        // A transition in units of E1.
        static function (MlbRng $r) { [$m, $n] = $r->pick([[2, 1], [3, 1], [3, 2], [4, 3], [4, 2]]);
            return mlb_mcq($r, 'In a quantum well the levels are Eₙ = n²E₁. What energy does the photon carry when the electron drops from n = ' . $m . ' to n = ' . $n . '?', (($m * $m) - ($n * $n)) . 'E₁',
                [[($m - $n) . 'E₁', 'The energies go as n², so subtract the SQUARES: ' . $m . '² − ' . $n . '².'], [(($m * $m) + ($n * $n)) . 'E₁', 'A photon carries the DIFFERENCE between the levels, not their sum.'], [($m * $m) . 'E₁', 'That is the upper level’s whole energy; the electron does not fall to zero.']],
                ['Photon energy = E_upper − E_lower.', $m . '²E₁ − ' . $n . '²E₁ = ' . (($m * $m) - ($n * $n)) . 'E₁.'], 'Write each level as n²E₁, then subtract.', 'procedure', 40); },
    ],
    ];
}
