<?php
declare(strict_types=1);

/**
 * Physics Lab — the question forms (one list per topic, PH-001 … PH-060).
 *
 * Built with the SAME item builders as the Maths Lab (mlb_typed, mlb_mcq, mlb_error_of in
 * mathslab-gen.php) and marked by the same marker, so every guard the Maths Lab has — the key never
 * sent, a session regenerated from (topic, form, seed), rounding judged by `dp` — is this Lab's too.
 * The rules are the Maths Lab's (docs/LABS.md §3): every answer and every wrong option is DERIVED,
 * never typed; each wrong option names the misconception that makes it tempting; every question has
 * worked steps and a hint; forms are only ever APPENDED to a topic's list (a session stores form
 * numbers).
 *
 * A typed physical answer carries its unit (`unit`): it is shown after the answer box, printed with
 * the answer, and a learner who types the unit as well ("12 N", "3.5 m/s") is not marked wrong for it.
 * g = 10 m/s², as senior secondary papers take it.
 */

const PHY_G = 10;

/** A typed number with its unit; `dp` when the answer is rounded (any answer that rounds to the key is right). */
function phy_num(string $stem, $key, string $unit, array $steps, string $hint, string $dim = 'procedure', int $secs = 45, ?int $dp = null, array $x = []): array {
    if ($unit !== '') $x['unit'] = $unit;
    if ($dp !== null) $x['dp'] = $dp;
    return mlb_typed('num', $stem, is_string($key) ? $key : mlb_dec((float)$key), $steps, $hint, $dim, $secs, $x);
}
/** A question with its figure (phy-visuals.jsx draws every `phy-` type from these numbers). */
function phy_dia(array $it, array $d): array { $it['diagram'] = $d; return $it; }
/** A number for prose (4,728 / 0.35). */
function phy_p($x): string { return mlb_p(is_float($x) && floor($x) == $x ? (int)$x : $x); }

function phy_forms(): array {
    static $f = null;
    if ($f !== null) return $f;
    $f = phy_forms_1() + phy_forms_2() + phy_forms_3() + phy_forms_4() + phy_forms_5() + phy_forms_6() + phy_forms_7() + phy_forms_8() + phy_forms_9();
    /* The second layer of forms (physicslab-gen-more.php, audit of 8 Nov 2026), APPENDED after each
       topic's own list so no form already in use changes its number (a session stores form numbers). */
    if (function_exists('phy_forms_more')) foreach (phy_forms_more() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    return $f;
}

/* ═══ Stage 1 — Measurement and Matter ═══ */
function phy_forms_1(): array {
    return [
    'PH-001' => [
        static function (MlbRng $r) {
            $rows = [['mass', 'kilogram (kg)', ['gram (g)', 'The gram is a unit of mass, but the SI base unit is the kilogram.'], ['newton (N)', 'The newton measures force (weight), not mass.']],
                     ['length', 'metre (m)', ['centimetre (cm)', 'A centimetre is a hundredth of the SI unit, the metre.'], ['kilometre (km)', 'A kilometre is a thousand of the SI unit, the metre.']],
                     ['time', 'second (s)', ['minute (min)', 'A minute is 60 of the SI unit, the second.'], ['hour (h)', 'Hours are everyday units; SI uses the second.']],
                     ['temperature', 'kelvin (K)', ['degree Celsius (°C)', 'Celsius is in everyday use, but the SI base unit of temperature is the kelvin.'], ['joule (J)', 'The joule measures energy, not temperature.']],
                     ['electric current', 'ampere (A)', ['volt (V)', 'The volt measures potential difference, not current.'], ['coulomb (C)', 'The coulomb measures charge; current is charge per second.']],
                     ['amount of substance', 'mole (mol)', ['kilogram (kg)', 'The kilogram measures mass; amount of substance counts particles, in moles.'], ['litre (L)', 'A litre is a volume.']]];
            [$q, $right, $w1, $w2] = $r->pick($rows);
            return mlb_mcq($r, 'What is the SI unit of ' . $q . '?', $right, [$w1, $w2, ['metre per second (m/s)', 'That is the unit of speed, a derived quantity.']],
                ['Seven base quantities have SI units of their own: metre, kilogram, second, ampere, kelvin, mole and candela.', 'The SI unit of ' . $q . ' is the ' . $right . '.'],
                'Think of the seven SI base units.', 'concept', 25);
        },
        static function (MlbRng $r) {
            $base = $r->pick(['length', 'mass', 'time', 'electric current', 'temperature']);
            return mlb_mcq($r, 'Which of these is a fundamental (base) quantity?', ucfirst($base),
                [['Speed', 'Speed is derived: distance ÷ time.'], ['Force', 'Force is derived: mass × acceleration.'], ['Density', 'Density is derived: mass ÷ volume.'], ['Area', 'Area is derived: length × length.']],
                ['A fundamental quantity is not defined from other quantities.', ucfirst($base) . ' is one of the seven base quantities; the others listed are built from them.'],
                'Can it be written as a formula of other quantities?', 'concept', 25);
        },
        static function (MlbRng $r) {
            $rows = [['force (N)', 'kg m s⁻²'], ['pressure (Pa)', 'kg m⁻¹ s⁻²'], ['work (J)', 'kg m² s⁻²'], ['speed', 'm s⁻¹'], ['density', 'kg m⁻³'], ['acceleration', 'm s⁻²']];
            $k = $r->int(0, count($rows) - 1); [$q, $u] = $rows[$k];
            $why = ['force (N)' => 'That is force: mass × acceleration.', 'pressure (Pa)' => 'That is pressure: force ÷ area.', 'work (J)' => 'That is work: force × distance.',
                    'speed' => 'That is speed: distance ÷ time.', 'density' => 'That is density: mass ÷ volume.', 'acceleration' => 'That is acceleration: change of velocity ÷ time.'];
            $wrong = [];
            foreach ($rows as $i => [$q2, $u2]) if ($i !== $k) $wrong[] = [$u2, $why[$q2]];
            $wrong = array_slice($r->shuffle($wrong), 0, 3);
            return mlb_mcq($r, 'Which base units make up the unit of ' . $q . '?', $u, $wrong,
                ['Write the quantity as its defining formula, then replace each quantity by its units.', 'So ' . $q . ' is ' . $u . '.'],
                'Start from the formula that defines it.', 'reasoning', 40);
        },
    ],
    'PH-002' => [
        static function (MlbRng $r) {
            $c = $r->int(0, 5);
            if ($c === 0) { $v = $r->int(2, 95) / 10; return phy_num('Convert ' . phy_p($v) . ' km to metres.', $v * 1000, 'm', ['Kilo means a thousand: 1 km = 1000 m.', phy_p($v) . ' × 1000 = ' . phy_p($v * 1000) . ' m.'], 'Kilo = 1000.', 'procedure', 30); }
            if ($c === 1) { $v = $r->int(5, 950); return phy_num('Convert ' . $v . ' cm to metres.', $v / 100, 'm', ['Centi means a hundredth: 100 cm = 1 m.', $v . ' ÷ 100 = ' . mlb_dec($v / 100) . ' m.'], 'Centi = one hundredth.', 'procedure', 30); }
            if ($c === 2) { $v = $r->int(50, 9500); return phy_num('Convert ' . phy_p($v) . ' g to kilograms.', $v / 1000, 'kg', ['1 kg = 1000 g.', phy_p($v) . ' ÷ 1000 = ' . mlb_dec($v / 1000) . ' kg.'], 'Divide by 1000.', 'procedure', 30); }
            if ($c === 3) { $v = $r->int(5, 900); return phy_num('Convert ' . $v . ' ms (milliseconds) to seconds.', $v / 1000, 's', ['Milli means a thousandth: 1000 ms = 1 s.', $v . ' ÷ 1000 = ' . mlb_dec($v / 1000) . ' s.'], 'Milli = one thousandth.', 'procedure', 30); }
            if ($c === 4) { $v = $r->int(2, 60) / 2; return phy_num('Convert ' . phy_p($v) . ' kJ to joules.', $v * 1000, 'J', ['1 kJ = 1000 J.', phy_p($v) . ' × 1000 = ' . phy_p($v * 1000) . ' J.'], 'Kilo = 1000.', 'procedure', 30); }
            $v = $r->int(2, 80); return phy_num('Convert ' . $v . ' mm to centimetres.', $v / 10, 'cm', ['10 mm = 1 cm.', $v . ' ÷ 10 = ' . mlb_dec($v / 10) . ' cm.'], 'There are 10 mm in a centimetre.', 'procedure', 30);
        },
        static function (MlbRng $r) {
            $rows = [['kilo (k)', '10³'], ['mega (M)', '10⁶'], ['giga (G)', '10⁹'], ['centi (c)', '10⁻²'], ['milli (m)', '10⁻³'], ['micro (µ)', '10⁻⁶'], ['nano (n)', '10⁻⁹']];
            $k = $r->int(0, count($rows) - 1); [$p, $v] = $rows[$k];
            $wrong = [];
            foreach ($rows as $i => [$p2, $v2]) if ($i !== $k) $wrong[] = [$v2, 'That is ' . $p2 . '.'];
            return mlb_mcq($r, 'What does the prefix ' . $p . ' stand for?', $v, array_slice($r->shuffle($wrong), 0, 3),
                ['Each prefix is a power of ten.', $p . ' means × ' . $v . '.'], 'Big prefixes are positive powers, small ones negative.', 'concept', 25);
        },
        static function (MlbRng $r) { $k = $r->int(2, 12) * 9; $ms = $k * 5 / 18;
            return phy_num('A bus travels at ' . $k . ' km/h. What is this speed in m/s?', mlb_dec($ms), 'm/s',
                ['1 km/h = 1000 m ÷ 3600 s = $\\frac{5}{18}$ m/s.', $k . ' × $\\frac{5}{18}$ = ' . mlb_dec($ms) . ' m/s.'], 'Multiply by 1000, divide by 3600.', 'procedure', 45); },
        static function (MlbRng $r) { $ms = $r->int(2, 40) * 5; $kh = $ms * 18 / 5;
            return phy_num('A cheetah runs at ' . $ms . ' m/s. What is this in km/h?', $kh, 'km/h',
                ['To go from m/s to km/h multiply by 3.6 (= 3600 ÷ 1000).', $ms . ' × 3.6 = ' . phy_p($kh) . ' km/h.'], 'Seconds in an hour ÷ metres in a kilometre.', 'procedure', 45); },
    ],
    'PH-003' => [
        static function (MlbRng $r) { $l = $r->int(2, 15); $w = $r->int(2, 10); $h = $r->int(2, 8);
            return phy_num('A rectangular block measures ' . $l . ' cm by ' . $w . ' cm by ' . $h . ' cm. What is its volume?', $l * $w * $h, 'cm³',
                ['Volume of a rectangular block = length × width × height.', $l . ' × ' . $w . ' × ' . $h . ' = ' . ($l * $w * $h) . ' cm³.'], 'Multiply the three lengths.', 'procedure', 35); },
        static function (MlbRng $r) { $a = $r->int(4, 30) * 5; $d = $r->int(3, 24) * 2;
            return phy_dia(phy_num('A measuring cylinder holds ' . $a . ' cm³ of water. When a stone is lowered in, the level rises to ' . ($a + $d) . ' cm³. What is the volume of the stone?', $d, 'cm³',
                ['The stone pushes aside (displaces) its own volume of water.', 'Volume = ' . ($a + $d) . ' − ' . $a . ' = ' . $d . ' cm³.'], 'How much did the level rise?', 'application', 35), ['type' => 'phy-cylinder', 'before' => $a, 'after' => $a + $d]); },
        static function (MlbRng $r) { $a = $r->int(2, 30) * 10; $b = $r->int(2, 20) * 10; $m2 = $a * $b / 10000;
            return phy_num('A table top is ' . $a . ' cm long and ' . $b . ' cm wide. What is its area in square metres?', mlb_dec($m2), 'm²',
                ['Change to metres first: ' . mlb_dec($a / 100) . ' m and ' . mlb_dec($b / 100) . ' m.', 'Area = ' . mlb_dec($a / 100) . ' × ' . mlb_dec($b / 100) . ' = ' . mlb_dec($m2) . ' m². (1 m² = 10 000 cm².)'], 'Convert to metres before multiplying.', 'procedure', 45); },
        static function (MlbRng $r) {
            $rows = [['the diameter of a thin wire', 'Micrometer screw gauge', 'It reads to 0.01 mm, fine enough for a wire.'],
                     ['the internal diameter of a test tube', 'Vernier calipers', 'Its inside jaws measure an internal diameter, to 0.01 cm.'],
                     ['the length of a classroom', 'Measuring tape', 'Metres of length, read to the nearest centimetre.']];
            $k = $r->int(0, 2); [$what, $right] = $rows[$k];
            $wrong = [];
            foreach ($rows as $i => $x) if ($i !== $k) $wrong[] = [$x[1], 'That suits ' . $x[0] . '.'];
            $wrong[] = ['Beam balance', 'A beam balance measures mass, not length.'];
            return mlb_mcq($r, 'Which instrument is best for measuring ' . $what . '?', $right, $wrong,
                ['Choose the instrument whose range and precision fit the length.', $right . ': ' . $rows[$k][2]], 'How small is it, and how precisely must it be measured?', 'concept', 30);
        },
    ],
    'PH-004' => [
        static function (MlbRng $r) { $m = $r->int(2, 90);
            return phy_num('What is the weight of a ' . $m . ' kg bag of rice on Earth? (Take g = 10 N/kg.)', $m * PHY_G, 'N',
                ['Weight = mass × g.', '$W = ' . $m . ' \\times 10 = ' . ($m * PHY_G) . '$ N.'], 'Weight is a force, in newtons.', 'procedure', 30); },
        static function (MlbRng $r) { $m = $r->int(20, 90);
            return phy_num('An astronaut has a mass of ' . $m . ' kg. On the Moon, g = 1.6 N/kg. What is her weight there?', mlb_dec($m * 1.6), 'N',
                ['Weight = mass × the g where she stands.', '$W = ' . $m . ' \\times 1.6 = ' . mlb_dec($m * 1.6) . '$ N.'], 'Her mass does not change; g does.', 'application', 40); },
        static function (MlbRng $r) { $m = $r->int(20, 90);
            return mlb_mcq($r, 'An astronaut of mass ' . $m . ' kg travels to the Moon. What is her MASS on the Moon?', $m . ' kg',
                [[mlb_dec($m / 6) . ' kg', 'Her WEIGHT falls to about a sixth; mass, the amount of matter, stays the same.'], [mlb_dec($m * 1.6) . ' N', 'That is her weight on the Moon, a force in newtons.'], ['0 kg', 'Nothing about the Moon removes matter from her.']],
                ['Mass is the amount of matter in a body; it is the same everywhere.', 'So her mass is still ' . $m . ' kg. Only her weight (mass × g) changes.'], 'Mass or weight?', 'concept', 30); },
        static function (MlbRng $r) { $m = $r->int(3, 120) / 2; $w = $m * PHY_G;
            return phy_num('A box weighs ' . phy_p($w) . ' N on Earth. What is its mass? (g = 10 N/kg)', mlb_dec($m), 'kg',
                ['Mass = weight ÷ g.', '$m = ' . phy_p($w) . ' \\div 10 = ' . mlb_dec($m) . '$ kg.'], 'Undo × g.', 'procedure', 35); },
    ],
    'PH-005' => [
        static function (MlbRng $r) { $rho = $r->pick([800, 1000, 2700, 7800, 8900, 11300]); $v = $r->pick([0.002, 0.005, 0.01, 0.02, 0.05]); $m = $rho * $v;
            return phy_num('A block has a mass of ' . mlb_dec($m) . ' kg and a volume of ' . mlb_dec($v) . ' m³. What is its density?', $rho, 'kg/m³',
                ['Density = mass ÷ volume.', '$\\rho = ' . mlb_dec($m) . ' \\div ' . mlb_dec($v) . ' = ' . $rho . '$ kg/m³.'], 'ρ = m ÷ V.', 'procedure', 40); },
        static function (MlbRng $r) { $rho = $r->pick([0.8, 1.0, 2.7, 7.8, 8.9, 13.6]); $v = $r->int(5, 60);
            return phy_num('A liquid has a density of ' . mlb_dec($rho) . ' g/cm³. What is the mass of ' . $v . ' cm³ of it?', mlb_dec($rho * $v), 'g',
                ['Mass = density × volume.', '$m = ' . mlb_dec($rho) . ' \\times ' . $v . ' = ' . mlb_dec($rho * $v) . '$ g.'], 'Rearrange ρ = m ÷ V.', 'procedure', 40); },
        static function (MlbRng $r) { $rho = $r->pick([200, 450, 600, 920, 1300, 2500, 7800]); $floats = $rho < 1000;
            return mlb_mcq($r, 'A solid object has a density of ' . $rho . ' kg/m³. Water has a density of 1000 kg/m³. What happens when it is placed in water?', $floats ? 'It floats' : 'It sinks',
                [[$floats ? 'It sinks' : 'It floats', $floats ? 'Only an object DENSER than water sinks.' : 'An object denser than water cannot float, whatever its shape as a solid lump.'],
                 ['It floats only if it is small', 'Size does not decide it: the density does.'], ['It stays exactly halfway down', 'That only happens when the densities are equal.']],
                ['Compare the densities: an object less dense than water floats, a denser one sinks.', $rho . ($floats ? ' < ' : ' > ') . '1000, so ' . ($floats ? 'it floats.' : 'it sinks.')], 'Which is denser?', 'reasoning', 30); },
        static function (MlbRng $r) { $g = $r->pick([0.5, 0.8, 1.2, 2.5, 2.7, 7.8, 11.3, 19.3]);
            return phy_num('Gold, iron and others are often listed in g/cm³. Convert ' . mlb_dec($g) . ' g/cm³ to kg/m³.', $g * 1000, 'kg/m³',
                ['1 g/cm³ = 1000 kg/m³ (1 g = 0.001 kg and 1 cm³ = 0.000 001 m³).', mlb_dec($g) . ' × 1000 = ' . phy_p($g * 1000) . ' kg/m³.'], 'Multiply by 1000.', 'procedure', 35); },
    ],
    'PH-006' => [
        static function (MlbRng $r) { $T = $r->pick([0.8, 1.2, 1.4, 1.5, 1.6, 2.0]); $n = $r->pick([10, 20, 25, 40, 50]);
            return phy_num('A pendulum makes ' . $n . ' complete oscillations in ' . mlb_dec($T * $n) . ' s. What is its period?', mlb_dec($T), 's',
                ['The period is the time for ONE complete oscillation.', 'T = ' . mlb_dec($T * $n) . ' ÷ ' . $n . ' = ' . mlb_dec($T) . ' s. (Timing many and dividing makes the reaction-time error smaller.)'], 'Total time ÷ number of oscillations.', 'procedure', 35); },
        static function (MlbRng $r) { $f = $r->int(2, 25); $t = $r->int(2, 8);
            return phy_num('A vibrating rod makes ' . ($f * $t) . ' complete vibrations in ' . $t . ' s. What is its frequency?', $f, 'Hz',
                ['Frequency is the number of complete vibrations each second.', 'f = ' . ($f * $t) . ' ÷ ' . $t . ' = ' . $f . ' Hz.'], 'Vibrations per second.', 'procedure', 35); },
        static function (MlbRng $r) { $main = $r->int(10, 89) / 10; $v = $r->int(1, 9);
            return phy_num('On a vernier caliper the main scale reads ' . mlb_dec($main) . ' cm just before the vernier zero, and the ' . $v . 'th vernier mark lines up with a main-scale mark. What is the reading?', mlb_dec($main + $v / 100), 'cm',
                ['Each vernier mark adds 0.01 cm to the main-scale reading.', mlb_dec($main) . ' + ' . $v . ' × 0.01 = ' . mlb_dec($main + $v / 100) . ' cm.'], 'Main scale, then the vernier in hundredths of a cm.', 'procedure', 50); },
        static function (MlbRng $r) { $z = $r->int(1, 4) / 100; $read = $r->int(150, 900) / 100; $plus = $r->int(0, 1) === 1;
            $true = $plus ? $read - $z : $read + $z;
            return mlb_mcq($r, 'A micrometer screw gauge reads ' . ($plus ? '+' : '−') . mlb_dec($z) . ' mm when its jaws are closed. It then reads ' . mlb_dec($read) . ' mm on a wire. What is the wire’s true diameter?', mlb_dec($true) . ' mm',
                [[mlb_dec($plus ? $read + $z : $read - $z) . ' mm', 'The zero error was added the wrong way: a reading that is too big must be made smaller.'], [mlb_dec($read) . ' mm', 'The zero error has been left out.'], [mlb_dec($z) . ' mm', 'That is the zero error, not the diameter.']],
                ['A zero error of ' . ($plus ? '+' : '−') . mlb_dec($z) . ' mm means every reading is ' . ($plus ? 'too big' : 'too small') . ' by ' . mlb_dec($z) . ' mm.', 'True = ' . mlb_dec($read) . ($plus ? ' − ' : ' + ') . mlb_dec($z) . ' = ' . mlb_dec($true) . ' mm.'], 'Subtract the zero error (a negative error is added).', 'reasoning', 45); },
    ],
    'PH-007' => [
        static function (MlbRng $r) {
            $d = ['solid' => 'Packed close together in a fixed pattern, vibrating about fixed positions', 'liquid' => 'Close together but able to slide past one another', 'gas' => 'Far apart, moving fast and freely in all directions'];
            $s = $r->pick(array_keys($d)); $wrong = [];
            foreach ($d as $k => $v) if ($k !== $s) $wrong[] = [$v, 'That describes the particles of a ' . $k . '.'];
            $wrong[] = ['Not moving at all', 'Particles are always moving — in a solid they vibrate.'];
            return mlb_mcq($r, 'Which describes the particles in a ' . $s . '?', $d[$s], $wrong,
                ['Solids keep their shape, liquids flow but keep their volume, gases fill their container.', 'In a ' . $s . ' the particles are: ' . mb_strtolower($d[$s]) . '.'], 'What can a ' . $s . ' do that the others cannot?', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does a gas spread out to fill any container it is put in?', 'Its particles move quickly in all directions and have little force between them',
                [['Its particles get bigger', 'Particles do not grow; the spaces between them do.'], ['It is lighter than air', 'Even a heavy gas fills its whole container.'], ['Its particles are pushed by the container walls', 'The walls stop the particles; they do not drive them outwards.']],
                ['Gas particles move fast and randomly, with large spaces and weak attractions between them.', 'So they spread into every part of the space available.'], 'Think about how the particles move.', 'concept', 30); },
        static function (MlbRng $r) { $x = $r->pick(['a drop of ink in water', 'the smell of perfume across a room', 'smoke particles seen jiggling under a microscope']);
            $right = $x === 'smoke particles seen jiggling under a microscope' ? 'Brownian motion' : 'Diffusion';
            return mlb_mcq($r, 'What is shown by ' . $x . '?', $right,
                [[$right === 'Diffusion' ? 'Brownian motion' : 'Diffusion', $right === 'Diffusion' ? 'Brownian motion is the random jiggling of visible specks hit by invisible particles.' : 'Diffusion is particles spreading from where there are many to where there are few.'],
                 ['Evaporation', 'Evaporation is a liquid becoming a gas at its surface.'], ['Condensation', 'Condensation is a gas becoming a liquid.']],
                ['Both are evidence that particles are always moving.', $x . ' is ' . mb_strtolower($right) . '.'], 'Spreading out, or jiggling?', 'concept', 30); },
    ],
    'PH-008' => [
        static function (MlbRng $r) {
            $rows = [['solid', 'liquid', 'Melting'], ['liquid', 'solid', 'Freezing (solidification)'], ['liquid', 'gas', 'Boiling (vaporisation)'], ['gas', 'liquid', 'Condensation'], ['solid', 'gas', 'Sublimation']];
            $k = $r->int(0, 4); [$a, $b, $name] = $rows[$k];
            $wrong = [];
            foreach ($rows as $i => $x) if ($i !== $k) $wrong[] = [$x[2], 'That is ' . $x[0] . ' to ' . $x[1] . '.'];
            return mlb_mcq($r, 'What is the change from ' . $a . ' to ' . $b . ' called?', $name, array_slice($r->shuffle($wrong), 0, 3),
                ['Each change of state has its own name.', $a . ' → ' . $b . ' is ' . mb_strtolower($name) . '.'], 'Name the change.', 'concept', 25); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Ice is heated steadily. While it is melting, its temperature stays at 0 °C. Where is the heat going?', 'Into breaking the bonds between particles (latent heat)',
                [['Into the thermometer', 'The thermometer takes very little; the ice takes the rest.'], ['Nowhere: the heat stops flowing', 'Heat keeps flowing in; it is just not raising the temperature.'], ['Into making the particles move faster', 'Faster particles WOULD mean a higher temperature, and it is not rising.']],
                ['During a change of state, heat goes into separating the particles, not into speeding them up.', 'That hidden heat is called latent heat, so the temperature stays constant until all the ice has melted.'], 'What is changing, if not the temperature?', 'reasoning', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which is TRUE of evaporation but not of boiling?', 'It happens at any temperature, from the surface only',
                [['It happens at one fixed temperature', 'That is boiling: a liquid boils at its boiling point.'], ['Bubbles form all through the liquid', 'That is boiling.'], ['It needs a flame', 'Wet clothes dry in the sun with no flame at all.']],
                ['Evaporation: at any temperature, only at the surface, and it cools what is left.', 'Boiling: at a fixed temperature, throughout the liquid, with bubbles.'], 'How do wet clothes dry?', 'concept', 35); },
    ],
    'PH-009' => [
        static function (MlbRng $r) { $v = $r->pick(['Velocity', 'Displacement', 'Force', 'Acceleration', 'Momentum', 'Weight']);
            $sc = [['Speed', 'Speed has size only; velocity is speed in a direction.'], ['Distance', 'Distance has size only; displacement has direction too.'], ['Mass', 'Mass has no direction.'], ['Energy', 'Energy has size only.'], ['Temperature', 'Temperature has no direction.'], ['Time', 'Time has no direction.']];
            return mlb_mcq($r, 'Which of these is a VECTOR quantity?', $v, array_slice($r->shuffle($sc), 0, 3),
                ['A vector has size AND direction; a scalar has size only.', $v . ' has a direction, so it is a vector.'], 'Does it have a direction?', 'concept', 25); },
        static function (MlbRng $r) { $a = $r->int(3, 40); $b = $r->int(3, 40); $same = $r->int(0, 1) === 1; if (!$same && $a === $b) $b++;
            $res = $same ? $a + $b : abs($a - $b);
            return phy_dia(phy_num('Two forces of ' . $a . ' N and ' . $b . ' N act on a box ' . ($same ? 'in the SAME direction' : 'in OPPOSITE directions') . '. What is the size of the resultant force?', $res, 'N',
                [$same ? 'Forces in the same direction add.' : 'Forces in opposite directions subtract: the larger wins.', ($same ? $a . ' + ' . $b : max($a, $b) . ' − ' . min($a, $b)) . ' = ' . $res . ' N.'], 'Same way: add. Opposite: subtract.', 'procedure', 30),
                ['type' => 'phy-forces', 'f' => $same ? [['dir' => 'right', 'label' => $a . ' N', 'n' => $a, 'off' => -14], ['dir' => 'right', 'label' => $b . ' N', 'n' => $b, 'off' => 14, 'tone' => 2]] : [['dir' => 'right', 'label' => $a . ' N', 'n' => $a], ['dir' => 'left', 'label' => $b . ' N', 'n' => $b, 'tone' => 2]]]); },
        static function (MlbRng $r) { [$x, $y, $z] = $r->pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20]]);
            return phy_dia(phy_num('Forces of ' . $x . ' N and ' . $y . ' N act at right angles to each other. What is the size of their resultant?', $z, 'N',
                ['At right angles, the resultant is the hypotenuse of a right-angled triangle (Pythagoras).', '$R = \\sqrt{' . $x . '^2 + ' . $y . '^2} = \\sqrt{' . ($z * $z) . '} = ' . $z . '$ N.'], 'Draw the two forces nose to tail.', 'procedure', 45), ['type' => 'phy-forces', 'f' => [['dir' => 'right', 'label' => $x . ' N', 'n' => $x], ['dir' => 'up', 'label' => $y . ' N', 'n' => $y, 'tone' => 2]]]); },
        static function (MlbRng $r) { [$x, $y, $z] = $r->pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15]]);
            return mlb_mcq($r, 'A girl walks ' . $x . ' km east, then ' . $y . ' km north. What is her displacement from the start?', $z . ' km',
                [[($x + $y) . ' km', 'That is the DISTANCE walked; displacement is the straight line from start to finish.'], [abs($y - $x) . ' km', 'The two walks are at right angles, not opposite.'], ['0 km', 'She did not come back to where she started.']],
                ['Displacement is the straight-line distance, with direction, from start to finish.', '$\\sqrt{' . $x . '^2 + ' . $y . '^2} = ' . $z . '$ km (north of east).'], 'Straight line from start to end.', 'reasoning', 40); },
    ],
    'PH-010' => [
        static function (MlbRng $r) { $sf = $r->int(2, 3); $e = $r->int(-3, 2); $m = $r->int(1000, 9999) / 1000; $x = round($m * 10 ** $e, 6);
            $key = (float)sprintf('%.' . ($sf - 1) . 'e', $x);
            return phy_num('Write ' . mlb_dec($x) . ' correct to ' . $sf . ' significant figures.', mlb_dec($key), '',
                ['Count from the first non-zero digit.', 'Keep ' . $sf . ' of them and round: ' . mlb_dec($key) . '.'], 'Leading zeros are not significant.', 'procedure', 40); },
        static function (MlbRng $r) { $z = $r->int(1, 3); $d = $r->int(2, 4); $digits = (string)$r->int(10 ** ($d - 1) + 1, 10 ** $d - 1); $s = '0.' . str_repeat('0', $z) . $digits;
            $wrong = [[(string)($z + $d + 1), 'The zeros in front only place the decimal point; they are not significant.'], [(string)($z + $d), 'The leading zeros are not significant.'], [(string)($d + 1), 'Only the digits from the first non-zero one count.']];
            return mlb_mcq($r, 'How many significant figures are there in ' . $s . '?', (string)$d, $wrong,
                ['Zeros before the first non-zero digit only fix the decimal point.', 'The significant figures are ' . $digits . ': that is ' . $d . '.'], 'Start counting at the first non-zero digit.', 'concept', 30); },
        static function (MlbRng $r) { $t = $r->pick([20, 25, 40, 50, 80]); $e = $r->pick([1, 2, 4, 5]) * $t / 100; $over = $r->int(0, 1) === 1;
            $meas = $over ? $t + $e : $t - $e;
            return phy_num('A rod is really ' . $t . ' cm long. A student measures it as ' . mlb_dec($meas) . ' cm. What is the percentage error?', mlb_dec($e / $t * 100), '%',
                ['Percentage error = (error ÷ true value) × 100.', '(' . mlb_dec($e) . ' ÷ ' . $t . ') × 100 = ' . mlb_dec($e / $t * 100) . '%.'], 'Error compared with the true value.', 'procedure', 45); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A student times one swing of a pendulum with a stopwatch, and gets a slightly different time each try. What is the best way to reduce this error?', 'Time many swings and divide, and repeat and average',
                [['Use a heavier pendulum bob', 'The bob’s mass does not change the period, nor the timing error.'], ['Time just one swing very carefully', 'Reaction time is a large part of one short swing.'], ['Round every time to the nearest second', 'That throws precision away.']],
                ['Random errors such as reaction time are reduced by measuring a larger quantity and by averaging repeats.', 'Timing 20 swings makes a 0.2 s reaction error only 0.01 s per swing.'], 'Make the error a small part of what you measure.', 'reasoning', 40); },
    ],
    ];
}

/* ═══ Stage 2 — Forces and Machines ═══ */
function phy_forms_2(): array {
    return [
    'PH-011' => [
        static function (MlbRng $r) { $a = $r->int(10, 60); $b = $r->int(5, 40); $c = $r->int(5, 50);
            $res = $a + $b - $c; $dir = $res >= 0 ? 'to the right' : 'to the left';
            return phy_dia(phy_num('A cart is pulled to the right by ' . $a . ' N and ' . $b . ' N, and to the left by ' . $c . ' N. What is the size of the resultant force?', abs($res), 'N',
                ['Take right as positive: forces to the right add, forces to the left subtract.', $a . ' + ' . $b . ' − ' . $c . ' = ' . $res . ' N, so ' . abs($res) . ' N ' . $dir . '.'], 'Add one way, subtract the other.', 'procedure', 40),
                ['type' => 'phy-forces', 'ground' => true, 'f' => [['dir' => 'right', 'label' => $a . ' N', 'n' => $a, 'off' => -14], ['dir' => 'right', 'label' => $b . ' N', 'n' => $b, 'off' => 14, 'tone' => 1], ['dir' => 'left', 'label' => $c . ' N', 'n' => $c, 'tone' => 3]]]); },
        static function (MlbRng $r) { $moving = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'A ' . ($moving ? 'car moving along a straight road' : 'book resting on a table') . ' has balanced forces acting on it. What happens to it?', $moving ? 'It keeps moving at the same speed in a straight line' : 'It stays at rest',
                [[$moving ? 'It slows down and stops' : 'It starts to move slowly', 'Balanced forces cause NO change in motion.'], ['It speeds up', 'Speeding up needs an unbalanced (resultant) force.'], ['It moves in a circle', 'Turning needs a resultant force towards the centre.']],
                ['When the forces are balanced the resultant is zero.', 'Zero resultant: no change in motion — at rest stays at rest, moving keeps moving steadily.'], 'What does a zero resultant change?', 'concept', 30); },
        static function (MlbRng $r) { $nc = $r->pick(['Gravitational force', 'Magnetic force', 'Electrostatic force']);
            return mlb_mcq($r, 'Which of these forces can act WITHOUT the objects touching?', $nc,
                [['Friction', 'Friction needs two surfaces in contact.'], ['Tension in a rope', 'A rope must be attached to pull.'], ['Air resistance', 'Air resistance needs the air to touch the object.'], ['The push of a hand', 'A push needs contact.']],
                ['Field forces act at a distance: gravity, magnetism and electrostatic force.', $nc . ' acts across a gap.'], 'Which works across empty space?', 'concept', 25); },
    ],
    'PH-012' => [
        static function (MlbRng $r) { $mu = $r->pick([0.2, 0.25, 0.3, 0.4, 0.5]); $m = $r->int(2, 40); $R = $m * PHY_G;
            return phy_dia(phy_num('A ' . $m . ' kg box rests on a floor where the coefficient of friction is ' . mlb_dec($mu) . '. What friction force must be overcome to slide it? (g = 10 N/kg)', mlb_dec($mu * $R), 'N',
                ['The normal reaction equals the weight: R = mg = ' . $R . ' N.', '$F = \\mu R = ' . mlb_dec($mu) . ' \\times ' . $R . ' = ' . mlb_dec($mu * $R) . '$ N.'], 'F = μR, with R = the weight.', 'procedure', 45),
                ['type' => 'phy-forces', 'ground' => true, 'mass' => $m . ' kg', 'f' => [['dir' => 'right', 'label' => 'pull', 'n' => 2], ['dir' => 'left', 'label' => 'F = ?', 'n' => 2, 'tone' => 3], ['dir' => 'down', 'label' => 'W = ' . $R . ' N', 'n' => 3, 'tone' => 1], ['dir' => 'up', 'label' => 'R', 'n' => 3, 'tone' => 2]]]); },
        static function (MlbRng $r) { $R = $r->int(4, 40) * 10; $mu = $r->pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6]); $F = $mu * $R;
            return phy_num('A force of ' . mlb_dec($F) . ' N just starts a block moving, and the normal reaction is ' . $R . ' N. What is the coefficient of static friction?', mlb_dec($mu), '',
                ['$\\mu = \\frac{F}{R}$.', '$\\mu = ' . mlb_dec($F) . ' \\div ' . $R . ' = ' . mlb_dec($mu) . '$ (no unit: it is newtons ÷ newtons).'], 'Friction ÷ normal reaction.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which of these REDUCES friction in a machine?', $r->pick(['Oiling the moving parts', 'Using ball bearings']),
                [['Making the surfaces rougher', 'Rough surfaces increase friction.'], ['Pressing the surfaces together harder', 'A bigger normal force means more friction.'], ['Using rubber pads', 'Rubber grips: it raises friction.']],
                ['Friction is reduced by lubricants (oil, grease), by rollers or ball bearings, and by smooth surfaces.', 'Lubrication keeps the surfaces apart; bearings replace sliding with rolling.'], 'Keep the surfaces apart, or make them roll.', 'concept', 25); },
    ],
    'PH-013' => [
        static function (MlbRng $r) { $k = $r->int(2, 30) * 10; $e = $r->int(1, 15);
            return phy_num('A spring has a spring constant of ' . $k . ' N/m. What force stretches it by ' . $e . ' cm?', mlb_dec($k * $e / 100), 'N',
                ['Hooke’s law: F = ke, with e in METRES.', $e . ' cm = ' . mlb_dec($e / 100) . ' m, so F = ' . $k . ' × ' . mlb_dec($e / 100) . ' = ' . mlb_dec($k * $e / 100) . ' N.'], 'Change cm to m first.', 'procedure', 45); },
        static function (MlbRng $r) { $k = $r->int(2, 20) * 20; $F = $r->int(1, 12) * 2; $e = $F / $k * 100;
            return phy_num('A force of ' . $F . ' N stretches a spring whose spring constant is ' . $k . ' N/m. What is the extension, in centimetres?', mlb_rd($e, 2), 'cm',
                ['$e = \\frac{F}{k}$ (in metres).', '$e = ' . $F . ' \\div ' . $k . ' = ' . mlb_rd($F / $k, 4) . '$ m $= ' . mlb_rd($e, 2) . '$ cm.'], 'Rearrange F = ke.', 'procedure', 50, 2); },
        static function (MlbRng $r) { $L0 = $r->int(10, 30); $e = $r->int(2, 10); $F = $r->int(2, 12);
            $k = $F / ($e / 100);
            return phy_dia(phy_num('A spring is ' . $L0 . ' cm long. Hanging a ' . $F . ' N weight on it makes it ' . ($L0 + $e) . ' cm long. What is its spring constant?', mlb_rd($k, 1), 'N/m',
                ['The extension is the INCREASE in length: ' . ($L0 + $e) . ' − ' . $L0 . ' = ' . $e . ' cm = ' . mlb_dec($e / 100) . ' m.', '$k = \\frac{F}{e} = \\frac{' . $F . '}{' . mlb_dec($e / 100) . '} = ' . mlb_rd($k, 1) . '$ N/m.'], 'Extension is not the new length.', 'application', 55, 1), ['type' => 'phy-spring', 'ext' => $e, 'load' => $F . ' N', 'extLabel' => 'e = ' . $e . ' cm']); },
        static function (MlbRng $r) { $k = $r->int(2, 10) * 100; $e = $r->int(1, 10) / 100;
            return phy_num('A spring of spring constant ' . $k . ' N/m is stretched by ' . mlb_dec($e) . ' m. How much elastic energy does it store?', mlb_dec(0.5 * $k * $e * $e), 'J',
                ['Energy stored = ½ke².', '½ × ' . $k . ' × ' . mlb_dec($e) . '² = ' . mlb_dec(0.5 * $k * $e * $e) . ' J.'], 'It is the area under the force–extension line.', 'challenge', 55); },
    ],
    'PH-014' => [
        static function (MlbRng $r) { $A = $r->pick([0.01, 0.02, 0.05, 0.1, 0.2, 0.5]); $P = $r->int(2, 40) * 100;
            return phy_num('A force of ' . mlb_dec($P * $A) . ' N presses on an area of ' . mlb_dec($A) . ' m². What is the pressure?', $P, 'Pa',
                ['Pressure = force ÷ area.', '$P = ' . mlb_dec($P * $A) . ' \\div ' . mlb_dec($A) . ' = ' . $P . '$ Pa (N/m²).'], 'Force spread over area.', 'procedure', 40); },
        static function (MlbRng $r) { $m = $r->int(5, 60); $a = $r->pick([0.1, 0.2, 0.5]); $b = $r->pick([0.2, 0.4, 0.5, 1.0]); $W = $m * PHY_G;
            return phy_num('A ' . $m . ' kg block rests on a face that is ' . mlb_dec($a) . ' m by ' . mlb_dec($b) . ' m. What pressure does it exert on the floor? (g = 10 N/kg)', mlb_rd($W / ($a * $b), 1), 'Pa',
                ['Force = weight = ' . $m . ' × 10 = ' . $W . ' N; area = ' . mlb_dec($a) . ' × ' . mlb_dec($b) . ' = ' . mlb_dec($a * $b) . ' m².', '$P = ' . $W . ' \\div ' . mlb_dec($a * $b) . ' = ' . mlb_rd($W / ($a * $b), 1) . '$ Pa.'], 'The force is its weight.', 'application', 55, 1); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does a sharp knife cut better than a blunt one, pushed with the same force?', 'The force acts on a smaller area, so the pressure is greater',
                [['A sharp knife is heavier', 'Sharpening removes metal, if anything.'], ['The force is bigger', 'The force is the same in both cases.'], ['The area is bigger, so the pressure is greater', 'A bigger area gives a SMALLER pressure.']],
                ['P = F ÷ A.', 'Same force on a much smaller area means a much larger pressure.'], 'P = F ÷ A.', 'reasoning', 30); },
    ],
    'PH-015' => [
        static function (MlbRng $r) { $h = $r->int(2, 40); $rho = $r->pick([1000, 800, 1030]);
            $liq = [1000 => 'water', 800 => 'kerosene', 1030 => 'sea water'][$rho];
            return phy_num('What is the pressure due to ' . $liq . ' (density ' . $rho . ' kg/m³) at a depth of ' . $h . ' m? (g = 10 m/s²)', $h * $rho * PHY_G, 'Pa',
                ['Pressure in a liquid = hρg.', '$P = ' . $h . ' \\times ' . $rho . ' \\times 10 = ' . mlb_n($h * $rho * PHY_G) . '$ Pa.'], 'P = hρg.', 'procedure', 45); },
        static function (MlbRng $r) { $h = $r->int(2, 30);
            $tot = 100000 + $h * 1000 * PHY_G;
            return phy_num('The atmosphere presses with 100 000 Pa on the surface of a lake. What is the TOTAL pressure on a diver ' . $h . ' m below the surface? (water: 1000 kg/m³, g = 10 m/s²)', $tot, 'Pa',
                ['Water pressure = hρg = ' . $h . ' × 1000 × 10 = ' . mlb_p($h * 10000) . ' Pa.', 'Total = 100 000 + ' . mlb_p($h * 10000) . ' = ' . mlb_p($tot) . ' Pa.'], 'The air presses on the water too.', 'application', 55); },
        static function (MlbRng $r) { $A1 = $r->pick([0.01, 0.02, 0.05]); $k = $r->pick([10, 20, 25, 40, 50]); $A2 = $A1 * $k; $F1 = $r->int(2, 30) * 10;
            return phy_dia(phy_num('In a hydraulic press, a force of ' . $F1 . ' N is applied to a small piston of area ' . mlb_dec($A1) . ' m². The large piston has an area of ' . mlb_dec($A2) . ' m². What force does the large piston exert?', $F1 * $k, 'N',
                ['Pressure is passed on equally through the liquid: $\\frac{F_1}{A_1} = \\frac{F_2}{A_2}$.', '$F_2 = ' . $F1 . ' \\times \\frac{' . mlb_dec($A2) . '}{' . mlb_dec($A1) . '} = ' . ($F1 * $k) . '$ N.'], 'Same pressure on both pistons.', 'application', 55),
                ['type' => 'phy-hydraulic', 'f1' => $F1 . ' N', 'f2' => 'F₂ = ?', 'a1' => mlb_dec($A1) . ' m²', 'a2' => mlb_dec($A2) . ' m²']); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why is a dam built much thicker at the bottom than at the top?', 'Water pressure increases with depth',
                [['The water is colder at the bottom', 'Temperature does not decide it; depth does.'], ['To make the dam look stable', 'The shape answers a force, not a look.'], ['Water pressure is greatest at the surface', 'It is the reverse: P = hρg grows with h.']],
                ['P = hρg: the deeper the water, the greater the pressure.', 'The bottom of the dam must withstand the greatest pressure.'], 'P = hρg.', 'reasoning', 30); },
    ],
    'PH-016' => [
        static function (MlbRng $r) { $F = $r->int(5, 60); $d = $r->int(2, 18) / 10;
            return phy_num('A force of ' . $F . ' N is applied at right angles to a spanner, ' . mlb_dec($d) . ' m from the nut. What is the moment of the force?', mlb_dec($F * $d), 'N m',
                ['Moment = force × perpendicular distance from the pivot.', $F . ' × ' . mlb_dec($d) . ' = ' . mlb_dec($F * $d) . ' N m.'], 'Force × distance from the pivot.', 'procedure', 35); },
        static function (MlbRng $r) { $F1 = $r->int(2, 12) * 10; $d1 = $r->int(1, 8) * 10; $d2 = $r->pick([10, 20, 40, 50, 80]); $F2 = $F1 * $d1 / $d2;
            return phy_dia(phy_num('A seesaw balances. A child pushes down with ' . $F1 . ' N at ' . $d1 . ' cm from the pivot. What force acts on the other side, ' . $d2 . ' cm from the pivot?', mlb_dec($F2), 'N',
                ['Principle of moments: clockwise moments = anticlockwise moments.', '$' . $F1 . ' \\times ' . $d1 . ' = F \\times ' . $d2 . '$, so $F = ' . mlb_dec($F2) . '$ N.'], 'F₁d₁ = F₂d₂.', 'procedure', 50),
                ['type' => 'phy-lever', 'pivot' => 50, 'loads' => [['d' => -$d1, 'label' => $F1 . ' N'], ['d' => $d2, 'label' => 'F = ?']]]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why is a door handle placed far from the hinges?', 'A larger distance gives a larger turning moment for the same force',
                [['It is easier to reach', 'Reach is not why: the hinge side is just as reachable.'], ['It makes the door lighter', 'The door’s weight does not change.'], ['A smaller distance gives a larger moment', 'Moment = force × distance: more distance, more moment.']],
                ['Moment = force × perpendicular distance from the pivot (the hinge).', 'Far from the hinge, a small push gives a large turning effect.'], 'Moment = F × d.', 'reasoning', 30); },
        static function (MlbRng $r) { $F1 = $r->int(2, 9) * 10; $d1 = $r->int(2, 6) * 10; $F2 = $r->int(1, 4) * 10; $d2 = $F1 * $d1 / $F2;
            if ($d2 > 200) { $F2 = $F1; $d2 = $d1; }
            return phy_num('A ' . $F1 . ' N load hangs ' . $d1 . ' cm from the pivot of a light rod. How far from the pivot, on the other side, must a ' . $F2 . ' N weight hang for the rod to balance?', mlb_dec($d2), 'cm',
                ['Balance: ' . $F1 . ' × ' . $d1 . ' = ' . $F2 . ' × d.', 'd = ' . ($F1 * $d1) . ' ÷ ' . $F2 . ' = ' . mlb_dec($d2) . ' cm.'], 'Moments must be equal.', 'procedure', 50); },
    ],
    'PH-017' => [
        static function (MlbRng $r) {
            $rows = [['a cone standing on its flat base', 'Stable'], ['a cone balanced on its point', 'Unstable'], ['a cone lying on its side', 'Neutral'], ['a ball on a flat table', 'Neutral'], ['a pencil balanced on its tip', 'Unstable']];
            [$x, $eq] = $r->pick($rows);
            $why = ['Stable' => 'Stable: tilted slightly, it falls back.', 'Unstable' => 'Unstable: tilted slightly, it falls over.', 'Neutral' => 'Neutral: moved, it stays in its new position.'];
            $wrong = []; foreach ($why as $k => $w) if ($k !== $eq) $wrong[] = [$k, $w];
            $wrong[] = ['It has no equilibrium', 'Anything at rest is in equilibrium of some kind.'];
            return mlb_mcq($r, 'What kind of equilibrium is ' . $x . ' in?', $eq, $wrong,
                ['Ask what happens after a small push: does the centre of gravity rise, fall, or stay level?', $why[$eq]], 'Imagine giving it a small tilt.', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'How is a racing car made hard to topple?', 'A low centre of gravity and a wide wheel base',
                [['A high centre of gravity and a narrow base', 'That makes it topple more easily.'], ['A heavier roof', 'Weight high up raises the centre of gravity.'], ['Narrow tyres', 'A narrower base is less stable.']],
                ['An object topples when the line of its weight falls outside its base.', 'A low centre of gravity and a wide base keep that line inside the base for longer.'], 'Where must the weight line stay?', 'reasoning', 30); },
        static function (MlbRng $r) { $gap = $r->pick([5, 10]); $p = 50 - $gap; $dx = $r->pick([10, 20, 30]); $x = $p - $dx; $M = $r->pick([0.05, 0.1, 0.2]); $Wm = $M * PHY_G;
            $W = $Wm * $dx / $gap;
            return phy_dia(phy_num('A uniform metre rule balances on a knife edge at the ' . $p . ' cm mark when a ' . mlb_dec($M * 1000) . ' g mass hangs at the ' . $x . ' cm mark. What is the weight of the rule? (g = 10 N/kg)', mlb_dec($W), 'N',
                ['A uniform rule’s weight acts at its middle, the 50 cm mark: ' . $gap . ' cm from the pivot.', 'The mass weighs ' . mlb_dec($Wm) . ' N, ' . $dx . ' cm from the pivot: ' . mlb_dec($Wm) . ' × ' . $dx . ' = W × ' . $gap . ', so W = ' . mlb_dec($W) . ' N.'], 'Where does the rule’s own weight act?', 'challenge', 75),
                ['type' => 'phy-lever', 'pivot' => $p, 'marks' => [0, $x, $p, 50, 100], 'loads' => [['at' => $x, 'label' => mlb_dec($M * 1000) . ' g'], ['at' => 50, 'label' => 'W = ?']]]); },
    ],
    'PH-018' => [
        static function (MlbRng $r) { $E = $r->int(5, 50) * 10; $k = $r->pick([2, 2.5, 3, 4, 5, 6]);
            return phy_num('A machine lifts a load of ' . mlb_dec($E * $k) . ' N with an effort of ' . $E . ' N. What is its mechanical advantage?', mlb_dec($k), '',
                ['MA = load ÷ effort.', mlb_dec($E * $k) . ' ÷ ' . $E . ' = ' . mlb_dec($k) . '.'], 'Load ÷ effort.', 'procedure', 35); },
        static function (MlbRng $r) { $VR = $r->int(3, 8); $eff = $r->pick([50, 60, 75, 80]); $MA = $VR * $eff / 100;
            return phy_num('A machine has a velocity ratio of ' . $VR . ' and a mechanical advantage of ' . mlb_dec($MA) . '. What is its efficiency?', $eff, '%',
                ['Efficiency = (MA ÷ VR) × 100%.', '(' . mlb_dec($MA) . ' ÷ ' . $VR . ') × 100 = ' . $eff . '%.'], 'MA ÷ VR.', 'procedure', 40); },
        static function (MlbRng $r) { $n = $r->int(2, 6); $eff = $r->pick([50, 60, 75, 80]); $L = $r->int(4, 30) * 10 * 3;
            $E = $L / ($n * $eff / 100);
            return phy_num('A block-and-tackle pulley system has ' . $n . ' pulleys (velocity ratio ' . $n . ') and is ' . $eff . '% efficient. What effort lifts a load of ' . $L . ' N?', mlb_rd($E, 1), 'N',
                ['MA = efficiency × VR = ' . mlb_dec($eff / 100) . ' × ' . $n . ' = ' . mlb_dec($n * $eff / 100) . '.', 'Effort = load ÷ MA = ' . $L . ' ÷ ' . mlb_dec($n * $eff / 100) . ' = ' . mlb_rd($E, 1) . ' N.'], 'Find the MA first.', 'challenge', 60, 1); },
        static function (MlbRng $r) {
            $rows = [['a wheelbarrow', 'Second class: the load is between the pivot and the effort'], ['a pair of scissors', 'First class: the pivot is between the effort and the load'],
                     ['a pair of tongs', 'Third class: the effort is between the pivot and the load'], ['a crowbar lifting a stone', 'First class: the pivot is between the effort and the load']];
            [$x, $right] = $r->pick($rows);
            $all = ['First class: the pivot is between the effort and the load', 'Second class: the load is between the pivot and the effort', 'Third class: the effort is between the pivot and the load'];
            $wrong = []; foreach ($all as $a) if ($a !== $right) $wrong[] = [$a, 'Look at which of the three — pivot, load, effort — is in the middle.'];
            $wrong[] = ['It is not a lever', 'It turns about a pivot, so it is a lever.'];
            return mlb_mcq($r, 'What class of lever is ' . $x . '?', $right, $wrong,
                ['A lever’s class is decided by what is in the middle: pivot (1st), load (2nd) or effort (3rd).', ucfirst($x) . ': ' . mb_strtolower($right) . '.'], 'What is in the middle?', 'concept', 35); },
    ],
    'PH-019' => [
        static function (MlbRng $r) { $F = $r->int(5, 80); $d = $r->int(2, 30);
            return phy_num('A force of ' . $F . ' N pushes a crate ' . $d . ' m along the floor, in the direction of the force. How much work is done?', $F * $d, 'J',
                ['Work = force × distance moved in the direction of the force.', $F . ' × ' . $d . ' = ' . ($F * $d) . ' J.'], 'W = Fd.', 'procedure', 30); },
        static function (MlbRng $r) { $m = $r->int(2, 60); $h = $r->int(2, 15);
            return phy_num('How much work is done lifting a ' . $m . ' kg sack onto a shelf ' . $h . ' m high? (g = 10 N/kg)', $m * PHY_G * $h, 'J',
                ['The force needed equals the weight: ' . $m . ' × 10 = ' . ($m * PHY_G) . ' N.', 'W = ' . ($m * PHY_G) . ' × ' . $h . ' = ' . ($m * PHY_G * $h) . ' J.'], 'Lifting: the force is the weight.', 'application', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A boy pushes hard against a wall for a minute, but the wall does not move. How much work does he do on the wall?', 'None, because the wall does not move',
                [['A lot, because he is tired', 'Tiredness is energy used in his muscles, not work done on the wall.'], ['Force × time', 'Work is force × DISTANCE, not time.'], ['It depends on how hard he pushes', 'With no movement, the work done is zero however hard he pushes.']],
                ['Work is done only when a force moves its point of application.', 'Distance moved = 0, so work = F × 0 = 0.'], 'W = F × distance moved.', 'reasoning', 30); },
        static function (MlbRng $r) { $F = $r->int(2, 20) * 10; $d = $r->int(2, 20);
            return phy_num('A rope pulls a box with a force of ' . $F . ' N at 60° to the floor, moving it ' . $d . ' m along the floor. How much work is done? (cos 60° = 0.5)', $F * $d / 2, 'J',
                ['Only the part of the force along the motion does work: F cos θ = ' . $F . ' × 0.5 = ' . ($F / 2) . ' N.', 'W = ' . ($F / 2) . ' × ' . $d . ' = ' . ($F * $d / 2) . ' J.'], 'W = Fd cos θ.', 'challenge', 50); },
    ],
    'PH-020' => [
        static function (MlbRng $r) { $t = $r->int(2, 20); $P = $r->int(5, 100) * 10;
            return phy_num('A motor does ' . mlb_p($P * $t) . ' J of work in ' . $t . ' s. What is its power?', $P, 'W',
                ['Power = work done ÷ time taken.', mlb_p($P * $t) . ' ÷ ' . $t . ' = ' . $P . ' W.'], 'Work per second.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->int(30, 70); $h = $r->int(3, 15); $t = $r->pick([2, 3, 4, 5, 6, 10]);
            return phy_num('A ' . $m . ' kg student runs up stairs ' . $h . ' m high in ' . $t . ' s. What power does she develop? (g = 10 N/kg)', mlb_rd($m * PHY_G * $h / $t, 1), 'W',
                ['Work done = mgh = ' . $m . ' × 10 × ' . $h . ' = ' . ($m * PHY_G * $h) . ' J.', 'Power = ' . ($m * PHY_G * $h) . ' ÷ ' . $t . ' = ' . mlb_rd($m * PHY_G * $h / $t, 1) . ' W.'], 'Work against gravity, then ÷ time.', 'application', 55, 1); },
        static function (MlbRng $r) { $F = $r->int(2, 40) * 50; $v = $r->int(2, 30);
            return phy_num('A car’s engine keeps a driving force of ' . $F . ' N at a steady ' . $v . ' m/s. What power is it delivering?', $F * $v, 'W',
                ['Power = force × velocity (work per second = force × distance per second).', $F . ' × ' . $v . ' = ' . mlb_p($F * $v) . ' W.'], 'P = Fv.', 'challenge', 45); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which unit is the same as one watt?', 'One joule per second',
                [['One newton per second', 'Newtons per second is a rate of change of force.'], ['One joule × one second', 'Energy × time is not power: power is energy ÷ time.'], ['One newton metre', 'A newton metre is a joule (work), not a watt.']],
                ['Power is the rate of doing work: energy ÷ time.', 'So 1 W = 1 J/s.'], 'Power = work ÷ time.', 'concept', 25); },
    ],
    ];
}

/* ═══ Stage 3 — Motion ═══ */
function phy_forms_3(): array {
    return [
    'PH-021' => [
        static function (MlbRng $r) { $v = $r->int(2, 30); $t = $r->int(3, 60);
            return phy_num('A cyclist covers ' . ($v * $t) . ' m in ' . $t . ' s. What is her average speed?', $v, 'm/s',
                ['Average speed = total distance ÷ total time.', ($v * $t) . ' ÷ ' . $t . ' = ' . $v . ' m/s.'], 'Distance ÷ time.', 'procedure', 30); },
        static function (MlbRng $r) { $v1 = $r->int(2, 8) * 10; $t1 = $r->int(1, 4); $v2 = $r->int(2, 8) * 10; $t2 = $r->int(1, 4); if ($v2 === $v1) $v2 += 10; if ($t2 === $t1) $t2 = $t1 % 4 + 1;
            $avg = ($v1 * $t1 + $v2 * $t2) / ($t1 + $t2);
            return mlb_mcq($r, 'A bus travels for ' . $t1 . ' h at ' . $v1 . ' km/h, then for ' . $t2 . ' h at ' . $v2 . ' km/h. What is its average speed for the whole journey?', mlb_dec(round($avg, 2)) . ' km/h',
                [[mlb_dec(($v1 + $v2) / 2) . ' km/h', 'Averaging the two speeds ignores that more time was spent at one of them.'], [mlb_dec($v1 * $t1 + $v2 * $t2) . ' km/h', 'That is the total distance in km, not a speed.'], [mlb_dec(max($v1, $v2)) . ' km/h', 'That is the faster part only.']],
                ['Total distance = ' . $v1 . ' × ' . $t1 . ' + ' . $v2 . ' × ' . $t2 . ' = ' . ($v1 * $t1 + $v2 * $t2) . ' km in ' . ($t1 + $t2) . ' h.', 'Average speed = ' . ($v1 * $t1 + $v2 * $t2) . ' ÷ ' . ($t1 + $t2) . ' = ' . mlb_dec(round($avg, 2)) . ' km/h.'], 'Total distance ÷ total time.', 'reasoning', 60); },
        static function (MlbRng $r) { $L = $r->int(1, 8) * 100;
            return mlb_mcq($r, 'An athlete runs exactly once round a ' . $L . ' m track and finishes where she started. What is her displacement?', '0 m',
                [[$L . ' m', 'That is the distance run. Displacement is from start to finish, and they are the same point.'], [($L / 2) . ' m', 'Half a lap is where she was furthest away, not where she finished.'], [($L * 2) . ' m', 'Nothing doubles: she ran one lap.']],
                ['Displacement is the straight line from start to finish, with direction.', 'She finishes at the start, so the displacement is 0 m, though the distance is ' . $L . ' m.'], 'Where does she end up?', 'concept', 30); },
    ],
    'PH-022' => [
        static function (MlbRng $r) { $u = $r->int(0, 10); $a = $r->int(1, 6); $t = $r->int(2, 10);
            return phy_num('A car speeds up from ' . $u . ' m/s to ' . ($u + $a * $t) . ' m/s in ' . $t . ' s. What is its acceleration?', $a, 'm/s²',
                ['Acceleration = change in velocity ÷ time.', '(' . ($u + $a * $t) . ' − ' . $u . ') ÷ ' . $t . ' = ' . $a . ' m/s².'], '(v − u) ÷ t.', 'procedure', 35); },
        static function (MlbRng $r) { $u = $r->int(10, 30); $t = $r->int(2, 10); $a = $r->pick([0.5, 1, 1.5, 2, 2.5, 3]); while ($a * $t > $u) $t--;
            $v = $u - $a * $t;
            return phy_num('A lorry slows from ' . $u . ' m/s to ' . mlb_dec($v) . ' m/s in ' . $t . ' s. What is its acceleration? (Give a negative number for a deceleration.)', mlb_dec(-$a), 'm/s²',
                ['a = (v − u) ÷ t.', '(' . mlb_dec($v) . ' − ' . $u . ') ÷ ' . $t . ' = ' . mlb_dec(-$a) . ' m/s². The minus sign says it is slowing down.'], 'Final minus initial — which is bigger?', 'procedure', 45); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A train moves along a straight track at a constant velocity of 20 m/s. What is its acceleration?', '0 m/s²',
                [['20 m/s²', 'Velocity is not acceleration: acceleration is how fast the VELOCITY changes.'], ['10 m/s²', 'That is g, which has nothing to do with a train on a level track.'], ['It cannot be found without the time', 'A constant velocity tells us at once: no change, no acceleration.']],
                ['Acceleration is the rate of change of velocity.', 'The velocity is not changing, so the acceleration is zero.'], 'Is the velocity changing?', 'concept', 25); },
    ],
    'PH-023' => [
        static function (MlbRng $r) { $u = $r->int(0, 20); $a = $r->int(1, 5); $t = $r->int(2, 12);
            return phy_num('A body starts at ' . $u . ' m/s and accelerates uniformly at ' . $a . ' m/s² for ' . $t . ' s. What is its final velocity?', $u + $a * $t, 'm/s',
                ['v = u + at.', 'v = ' . $u . ' + ' . $a . ' × ' . $t . ' = ' . ($u + $a * $t) . ' m/s.'], 'v = u + at.', 'procedure', 35); },
        static function (MlbRng $r) { $u = $r->int(0, 10); $a = $r->int(2, 6); $t = $r->int(2, 10); $v = $u + $a * $t;
            return phy_num('How long does it take a car to go from ' . $u . ' m/s to ' . $v . ' m/s with a uniform acceleration of ' . $a . ' m/s²?', $t, 's',
                ['From v = u + at: t = (v − u) ÷ a.', 't = (' . $v . ' − ' . $u . ') ÷ ' . $a . ' = ' . $t . ' s.'], 'Rearrange v = u + at.', 'procedure', 40); },
        static function (MlbRng $r) { $u = $r->int(2, 10); $a = $r->int(2, 6); $t = $r->int(3, 9); $v = $u + $a * $t;
            $right = ['$v = u + at$', '$' . $v . ' = ' . $u . ' + ' . $a . ' \\times ' . $t . '$', '$' . $v . ' = ' . ($u + $a * $t) . '$ ✓'];
            $task = 'Find the final velocity of a body that starts at ' . $u . ' m/s and accelerates at ' . $a . ' m/s² for ' . $t . ' s. Which line holds the first mistake?';
            $right = ['$v = u + at$', '$v = ' . $u . ' + ' . $a . ' \\times ' . $t . '$', '$v = ' . $u . ' + ' . ($a * $t) . '$', '$v = ' . $v . '$ m/s'];
            return mlb_error_of($r, $task, $right, [
                [0, ['$v = u \\times at$', '$v = ' . $u . ' \\times ' . $a . ' \\times ' . $t . '$', '$v = ' . ($u * $a * $t) . '$', '$v = ' . ($u * $a * $t) . '$ m/s'], 'the equation is v = u + at; the starting velocity is ADDED to the gain.'],
                [1, ['$v = u + at$', '$v = ' . $a . ' + ' . $u . ' \\times ' . $t . '$', '$v = ' . $a . ' + ' . ($u * $t) . '$', '$v = ' . ($a + $u * $t) . '$ m/s'], 'u and a have been swapped: it is the ACCELERATION that is multiplied by the time.'],
                [2, ['$v = u + at$', '$v = ' . $u . ' + ' . $a . ' \\times ' . $t . '$', '$v = ' . ($u + $a) . ' \\times ' . $t . '$', '$v = ' . (($u + $a) * $t) . '$ m/s'], 'the multiplication comes before the addition: ' . $a . ' × ' . $t . ' first.'],
            ]); },
    ],
    'PH-024' => [
        static function (MlbRng $r) { $u = $r->int(0, 10); $a = $r->pick([2, 4, 6]); $t = $r->int(2, 10);
            $s = $u * $t + $a * $t * $t / 2;
            return phy_num('A car starts at ' . $u . ' m/s and accelerates at ' . $a . ' m/s² for ' . $t . ' s. How far does it travel in that time?', $s, 'm',
                ['$s = ut + \\tfrac{1}{2}at^2$.', '$s = ' . $u . ' \\times ' . $t . ' + \\tfrac{1}{2} \\times ' . $a . ' \\times ' . $t . '^2 = ' . ($u * $t) . ' + ' . ($a * $t * $t / 2) . ' = ' . $s . '$ m.'], 's = ut + ½at².', 'procedure', 50); },
        static function (MlbRng $r) { [$u, $v] = $r->pick([[0, 10], [0, 20], [6, 10], [8, 10], [5, 13], [0, 30], [16, 20], [12, 20]]); $a = $r->pick([2, 4, 5]);
            $s = ($v * $v - $u * $u) / (2 * $a);
            return phy_num('A cyclist at ' . $u . ' m/s accelerates at ' . $a . ' m/s² over ' . mlb_dec($s) . ' m. What is her final speed?', $v, 'm/s',
                ['$v^2 = u^2 + 2as$ (no time is given, so use the equation without t).', '$v^2 = ' . $u . '^2 + 2 \\times ' . $a . ' \\times ' . mlb_dec($s) . ' = ' . ($v * $v) . '$, so $v = ' . $v . '$ m/s.'], 'v² = u² + 2as.', 'procedure', 55); },
        static function (MlbRng $r) { $u = $r->pick([10, 12, 15, 20, 24, 30]); $a = $r->pick([2, 3, 4, 5, 6]);
            $s = $u * $u / (2 * $a);
            return phy_num('A driver brakes from ' . $u . ' m/s and the car decelerates uniformly at ' . $a . ' m/s². How far does it travel before stopping?', mlb_rd($s, 1), 'm',
                ['Stopping: v = 0, so $0 = u^2 - 2as$.', '$s = \\frac{u^2}{2a} = \\frac{' . ($u * $u) . '}{' . (2 * $a) . '} = ' . mlb_rd($s, 1) . '$ m.'], 'The final speed is zero.', 'application', 55, 1); },
    ],
    'PH-025' => [
        static function (MlbRng $r) { $u = $r->int(0, 10); $v = $u + $r->int(2, 20); $t = $r->int(2, 12);
            return phy_dia(phy_num('On a velocity–time graph a car’s velocity rises steadily from ' . $u . ' m/s to ' . $v . ' m/s over ' . $t . ' s. How far does it travel in that time?', mlb_dec(($u + $v) * $t / 2), 'm',
                ['Distance is the AREA under a velocity–time graph — here a trapezium.', 'Area = ½(' . $u . ' + ' . $v . ') × ' . $t . ' = ' . mlb_dec(($u + $v) * $t / 2) . ' m.'], 'Area under the line.', 'procedure', 50), ['type' => 'phy-graph', 'pts' => [[0, $u], [$t, $v]], 'shade' => true]); },
        static function (MlbRng $r) { $v = $r->int(2, 15); $t = $r->int(2, 10);
            return phy_dia(phy_num('A distance–time graph is a straight line through (0 s, 0 m) and (' . $t . ' s, ' . ($v * $t) . ' m). What is the speed?', $v, 'm/s',
                ['The gradient (slope) of a distance–time graph is the speed.', 'Gradient = ' . ($v * $t) . ' ÷ ' . $t . ' = ' . $v . ' m/s.'], 'Rise ÷ run.', 'procedure', 40), ['type' => 'phy-graph', 'pts' => [[0, 0], [$t, $v * $t]], 'y' => 'distance / m']); },
        static function (MlbRng $r) {
            $rows = ['A straight line sloping upwards on a velocity–time graph' => 'Uniform acceleration', 'A horizontal line on a velocity–time graph' => 'Constant velocity',
                     'A horizontal line on a distance–time graph' => 'At rest', 'A straight line sloping upwards on a distance–time graph' => 'Constant speed'];
            $k = $r->pick(array_keys($rows)); $right = $rows[$k];
            $wrong = []; foreach ($rows as $g => $m) if ($m !== $right) $wrong[] = [$m, 'That is shown by: ' . mb_strtolower($g) . '.'];
            return mlb_mcq($r, $k . ' shows what kind of motion?', $right, $wrong,
                ['On a distance–time graph the slope is the speed; on a velocity–time graph the slope is the acceleration.', $k . ': ' . mb_strtolower($right) . '.'], 'Which axis is it, and what does the slope mean there?', 'concept', 40); },
    ],
    'PH-026' => [
        static function (MlbRng $r) { $t = $r->int(1, 6);
            return phy_num('A stone is dropped from rest from the top of a cliff and hits the ground ' . $t . ' s later. How high is the cliff? (g = 10 m/s², ignore air resistance)', 5 * $t * $t, 'm',
                ['From rest: $h = \\tfrac{1}{2}gt^2$.', '$h = \\tfrac{1}{2} \\times 10 \\times ' . $t . '^2 = ' . (5 * $t * $t) . '$ m.'], 'h = ½gt².', 'procedure', 45); },
        static function (MlbRng $r) { $t = $r->int(1, 6); $h = 5 * $t * $t;
            return phy_num('A ball is dropped from a height of ' . $h . ' m. How long does it take to reach the ground? (g = 10 m/s²)', $t, 's',
                ['$h = \\tfrac{1}{2}gt^2$, so $t = \\sqrt{\\frac{2h}{g}}$.', '$t = \\sqrt{\\frac{2 \\times ' . $h . '}{10}} = \\sqrt{' . ($t * $t) . '} = ' . $t . '$ s.'], 'Rearrange h = ½gt².', 'procedure', 50); },
        static function (MlbRng $r) { $t = $r->int(1, 8);
            return phy_num('A coconut falls from a tall palm and lands after ' . mlb_dec($t / 2) . ' s. How fast is it moving as it lands? (g = 10 m/s²)', 10 * $t / 2, 'm/s',
                ['From rest: v = gt.', 'v = 10 × ' . mlb_dec($t / 2) . ' = ' . mlb_dec(5 * $t) . ' m/s.'], 'v = u + at, with u = 0 and a = g.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In a vacuum, a feather and a hammer are dropped together from the same height. Which lands first?', 'They land together',
                [['The hammer', 'Without air, every object falls with the same acceleration, g.'], ['The feather', 'Nothing makes the feather faster.'], ['Neither falls in a vacuum', 'Gravity acts in a vacuum; only air resistance is missing.']],
                ['All objects fall with the same acceleration g when there is no air resistance.', 'So they land at the same moment (astronauts did this on the Moon in 1971).'], 'What does air resistance do?', 'concept', 30); },
    ],
    'PH-027' => [
        static function (MlbRng $r) { $t = $r->int(1, 4); $u = $r->int(2, 20); $h = 5 * $t * $t;
            return phy_dia(phy_num('A ball rolls off a table ' . mlb_dec($h) . ' m high at ' . $u . ' m/s horizontally. How far from the table does it land? (g = 10 m/s²)', $u * $t, 'm',
                ['The fall takes the same time as a straight drop: $t = \\sqrt{2h/g} = ' . $t . '$ s.', 'Sideways it keeps ' . $u . ' m/s, so the range = ' . $u . ' × ' . $t . ' = ' . ($u * $t) . ' m.'], 'Find the time from the height first.', 'challenge', 70), ['type' => 'phy-projectile', 'h' => mlb_dec($h) . ' m', 'u' => $u . ' m/s', 'range' => '?']); },
        static function (MlbRng $r) { $u = $r->int(1, 8) * 5;
            return phy_num('A ball is thrown straight up at ' . $u . ' m/s. How long is it in the air before it comes back to the hand? (g = 10 m/s²)', 2 * $u / PHY_G, 's',
                ['Going up: it stops after t = u ÷ g = ' . mlb_dec($u / PHY_G) . ' s.', 'Coming down takes the same time, so the total is 2u ÷ g = ' . mlb_dec(2 * $u / PHY_G) . ' s.'], 'Up time = down time.', 'application', 50); },
        static function (MlbRng $r) { $u = $r->int(1, 8) * 10;
            return phy_num('A stone is thrown straight upwards at ' . $u . ' m/s. What is the greatest height it reaches? (g = 10 m/s²)', $u * $u / (2 * PHY_G), 'm',
                ['At the top v = 0: $0 = u^2 - 2gH$.', '$H = \\frac{u^2}{2g} = \\frac{' . ($u * $u) . '}{20} = ' . mlb_dec($u * $u / 20) . '$ m.'], 'At the top it stops for an instant.', 'application', 50); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A ball is thrown horizontally off a cliff. Ignoring air resistance, which stays the same during its flight?', 'Its horizontal velocity',
                [['Its vertical velocity', 'Gravity makes the downward velocity grow by 10 m/s every second.'], ['Its speed', 'Its speed grows as it falls faster and faster.'], ['Its height', 'It is falling, so its height decreases.']],
                ['Gravity acts only downwards.', 'No force acts sideways, so the horizontal velocity is constant.'], 'Which way does gravity act?', 'reasoning', 35); },
    ],
    'PH-028' => [
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Passengers in a bus jerk forwards when it suddenly brakes. Why?', 'Their bodies tend to keep moving forward (inertia)',
                [['The brakes push them forwards', 'The brakes act on the wheels, not on the passengers.'], ['Gravity pulls them forwards', 'Gravity pulls downwards.'], ['The seat throws them forwards', 'The seat slows with the bus; the body keeps going.']],
                ['Newton’s first law: a body keeps its state of rest or uniform motion unless a resultant force acts on it.', 'The bus stops; the passengers keep moving until a force (a seat belt, the seat in front) stops them.'], 'What does a body do when no force acts on it?', 'reasoning', 30); },
        static function (MlbRng $r) { $a = $r->int(2, 40); $b = $r->int(50, 900);
            return mlb_mcq($r, 'Which has the greater inertia: a ' . $a . ' kg bicycle moving at 10 m/s or a ' . $b . ' kg car at rest?', 'The car, because it has more mass',
                [['The bicycle, because it is moving', 'Inertia depends on mass alone, not on speed.'], ['They have the same inertia', 'Inertia grows with mass, and the masses differ.'], ['Neither: inertia is only for moving things', 'A body at rest resists being moved too.']],
                ['Inertia is a body’s reluctance to change its motion, and it is measured by mass.', 'The ' . $b . ' kg car has more mass, so more inertia.'], 'What measures inertia?', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A coin rests on a card on top of a glass. The card is flicked away quickly. What happens to the coin?', 'It drops into the glass',
                [['It flies off with the card', 'The quick flick gives friction no time to drag the coin along.'], ['It stays in the air', 'Once the card is gone, gravity pulls it down.'], ['It is thrown upwards', 'Nothing pushes it up.']],
                ['The coin’s inertia keeps it where it was while the card is whisked away.', 'With no support, gravity then pulls it straight down into the glass.'], 'Inertia: it stays put.', 'application', 35); },
    ],
    'PH-029' => [
        static function (MlbRng $r) { $m = $r->int(2, 1200); $a = $r->pick([0.5, 1, 1.5, 2, 3, 4]);
            return phy_num('What resultant force gives a ' . $m . ' kg body an acceleration of ' . mlb_dec($a) . ' m/s²?', mlb_dec($m * $a), 'N',
                ['Newton’s second law: F = ma.', 'F = ' . $m . ' × ' . mlb_dec($a) . ' = ' . mlb_dec($m * $a) . ' N.'], 'F = ma.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->int(2, 50); $a = $r->int(1, 8); $F = $m * $a;
            return phy_num('A resultant force of ' . $F . ' N acts on a ' . $m . ' kg trolley. What is its acceleration?', $a, 'm/s²',
                ['a = F ÷ m.', $F . ' ÷ ' . $m . ' = ' . $a . ' m/s².'], 'Rearrange F = ma.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->int(2, 20); $a = $r->int(1, 5); $f = $r->int(2, 20); $F = $m * $a + $f;
            return phy_dia(phy_num('A ' . $m . ' kg box is pulled with ' . $F . ' N while friction of ' . $f . ' N opposes it. What is its acceleration?', $a, 'm/s²',
                ['The RESULTANT force accelerates it: ' . $F . ' − ' . $f . ' = ' . ($F - $f) . ' N.', 'a = ' . ($F - $f) . ' ÷ ' . $m . ' = ' . $a . ' m/s².'], 'Take friction away first.', 'application', 50),
                ['type' => 'phy-forces', 'ground' => true, 'mass' => $m . ' kg', 'f' => [['dir' => 'right', 'label' => $F . ' N', 'n' => $F], ['dir' => 'left', 'label' => $f . ' N', 'n' => $f, 'tone' => 3]]]); },
    ],
    'PH-030' => [
        static function (MlbRng $r) {
            $rows = [['A book presses down on a table with 5 N.', 'The table pushes up on the book with 5 N'], ['The Earth pulls a falling apple down.', 'The apple pulls the Earth up with an equal force'],
                     ['A swimmer pushes the water backwards.', 'The water pushes the swimmer forwards'], ['A rocket pushes hot gas downwards.', 'The gas pushes the rocket upwards']];
            [$a, $b] = $r->pick($rows);
            return mlb_mcq($r, $a . ' What is the reaction force, by Newton’s third law?', $b,
                [['There is none if nothing moves', 'Action and reaction exist whether or not anything moves.'], ['A smaller force in the opposite direction', 'Action and reaction are always EQUAL in size.'], ['The same force, in the same direction', 'They act in OPPOSITE directions, on different bodies.']],
                ['Newton’s third law: if A pushes B, B pushes A with an equal and opposite force.', $b . '.'], 'Swap the two objects round.', 'concept', 35); },
        static function (MlbRng $r) { $m = $r->int(2, 80); $v = $r->int(2, 30);
            return phy_num('What is the momentum of a ' . $m . ' kg body moving at ' . $v . ' m/s?', $m * $v, 'kg m/s',
                ['Momentum = mass × velocity.', 'p = ' . $m . ' × ' . $v . ' = ' . ($m * $v) . ' kg m/s.'], 'p = mv.', 'procedure', 30); },
        static function (MlbRng $r) { $m = $r->int(2, 40) * 50; $v = $r->int(2, 30); $p = $m * $v;
            return phy_num('A car has a momentum of ' . mlb_p($p) . ' kg m/s and a mass of ' . mlb_p($m) . ' kg. What is its velocity?', $v, 'm/s',
                ['v = p ÷ m.', mlb_p($p) . ' ÷ ' . mlb_p($m) . ' = ' . $v . ' m/s.'], 'Rearrange p = mv.', 'procedure', 35); },
    ],
    ];
}

/* ═══ Stage 4 — Energy and Momentum ═══ */
function phy_forms_4(): array {
    return [
    'PH-031' => [
        static function (MlbRng $r) { $m = $r->int(1, 80); $v = $r->int(2, 20);
            return phy_num('What is the kinetic energy of a ' . $m . ' kg body moving at ' . $v . ' m/s?', mlb_dec($m * $v * $v / 2), 'J',
                ['$KE = \\tfrac{1}{2}mv^2$.', '$KE = \\tfrac{1}{2} \\times ' . $m . ' \\times ' . $v . '^2 = ' . mlb_dec($m * $v * $v / 2) . '$ J.'], 'Square the speed first.', 'procedure', 40); },
        static function (MlbRng $r) { $m = $r->pick([2, 4, 8, 10, 20, 50]); $v = $r->int(2, 15); $KE = $m * $v * $v / 2;
            return phy_num('A ' . $m . ' kg ball has ' . mlb_dec($KE) . ' J of kinetic energy. How fast is it moving?', $v, 'm/s',
                ['$v = \\sqrt{\\frac{2 KE}{m}}$.', '$v = \\sqrt{\\frac{2 \\times ' . mlb_dec($KE) . '}{' . $m . '}} = \\sqrt{' . ($v * $v) . '} = ' . $v . '$ m/s.'], 'Rearrange KE = ½mv².', 'application', 55); },
        static function (MlbRng $r) { $k = $r->pick([2, 3]);
            return mlb_mcq($r, 'A car’s speed is multiplied by ' . $k . '. What happens to its kinetic energy?', 'It is multiplied by ' . ($k * $k),
                [['It is multiplied by ' . $k, 'KE depends on the SQUARE of the speed.'], ['It stays the same', 'More speed always means more kinetic energy.'], ['It is multiplied by ' . (2 * $k), 'Squaring ' . $k . ' gives ' . ($k * $k) . ', not ' . (2 * $k) . '.']],
                ['$KE = \\tfrac{1}{2}mv^2$: KE grows with v².', 'Multiplying v by ' . $k . ' multiplies v² by ' . ($k * $k) . '. (This is why a fast car needs so much more distance to stop.)'], 'KE ∝ v².', 'reasoning', 35); },
    ],
    'PH-032' => [
        static function (MlbRng $r) { $m = $r->int(1, 60); $h = $r->int(2, 40);
            return phy_num('How much gravitational potential energy does a ' . $m . ' kg load gain when lifted ' . $h . ' m? (g = 10 m/s²)', $m * PHY_G * $h, 'J',
                ['PE = mgh.', $m . ' × 10 × ' . $h . ' = ' . mlb_p($m * PHY_G * $h) . ' J.'], 'PE = mgh.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->int(2, 50); $h = $r->int(2, 30); $E = $m * PHY_G * $h;
            return phy_num('A crane gives a ' . $m . ' kg crate ' . mlb_p($E) . ' J of potential energy. How high does it lift it? (g = 10 m/s²)', $h, 'm',
                ['h = PE ÷ (mg).', mlb_p($E) . ' ÷ (' . $m . ' × 10) = ' . $h . ' m.'], 'Rearrange PE = mgh.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which has more gravitational potential energy: a 2 kg book on a 2 m shelf, or a 1 kg book on a 3 m shelf?', 'The 2 kg book (40 J against 30 J)',
                [['The 1 kg book, because it is higher', 'Height is only one factor: PE = mgh multiplies mass by height.'], ['They have the same', '2 × 2 = 4 but 1 × 3 = 3: they differ.'], ['Neither has any until it falls', 'PE is stored by position; it is there before it falls.']],
                ['PE = mgh.', '2 × 10 × 2 = 40 J; 1 × 10 × 3 = 30 J.'], 'Work out mgh for each.', 'reasoning', 40); },
    ],
    'PH-033' => [
        static function (MlbRng $r) { $k = $r->int(1, 5); $h = 5 * $k * $k; $v = 10 * $k;
            return phy_num('A ball falls from rest through ' . $h . ' m. Ignoring air resistance, how fast is it going at the bottom? (g = 10 m/s²)', $v, 'm/s',
                ['PE lost = KE gained: $mgh = \\tfrac{1}{2}mv^2$, and the mass cancels.', '$v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ' . $h . '} = ' . $v . '$ m/s.'], 'mgh = ½mv².', 'application', 55); },
        static function (MlbRng $r) { $v = $r->int(1, 8);
            return phy_num('A pendulum bob passes its lowest point at ' . $v . ' m/s. How high above that point does it swing? (g = 10 m/s², no air resistance)', mlb_dec($v * $v / 20), 'm',
                ['KE at the bottom becomes PE at the top: $\\tfrac{1}{2}mv^2 = mgh$.', '$h = \\frac{v^2}{2g} = \\frac{' . ($v * $v) . '}{20} = ' . mlb_dec($v * $v / 20) . '$ m.'], 'KE turns into PE.', 'application', 55); },
        static function (MlbRng $r) { $m = $r->int(1, 10); $h = $r->int(2, 20); $h2 = $r->int(1, $h - 1);
            $KE = $m * PHY_G * ($h - $h2);
            return phy_num('A ' . $m . ' kg stone is dropped from ' . $h . ' m. How much kinetic energy does it have when it is ' . $h2 . ' m above the ground? (g = 10 m/s², no air resistance)', $KE, 'J',
                ['KE gained = PE lost = mg × (height fallen).', 'It has fallen ' . ($h - $h2) . ' m: ' . $m . ' × 10 × ' . ($h - $h2) . ' = ' . $KE . ' J.'], 'How far has it fallen?', 'challenge', 55); },
    ],
    'PH-034' => [
        static function (MlbRng $r) { $in = $r->int(2, 40) * 100; $eff = $r->pick([20, 25, 40, 50, 60, 75, 80, 90]);
            return phy_num('A machine is given ' . mlb_p($in) . ' J and does ' . mlb_p($in * $eff / 100) . ' J of useful work. What is its efficiency?', $eff, '%',
                ['Efficiency = (useful output ÷ total input) × 100%.', '(' . mlb_p($in * $eff / 100) . ' ÷ ' . mlb_p($in) . ') × 100 = ' . $eff . '%.'], 'Useful ÷ total.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->int(5, 40); $h = $r->int(2, 10); $eff = $r->pick([40, 50, 60, 75, 80]);
            $useful = $m * PHY_G * $h; $in = $useful * 100 / $eff;
            return phy_num('A motor lifts a ' . $m . ' kg load through ' . $h . ' m and is ' . $eff . '% efficient. How much energy does it take from the supply? (g = 10 m/s²)', mlb_rd($in, 1), 'J',
                ['Useful work = mgh = ' . $useful . ' J.', 'Input = useful ÷ efficiency = ' . $useful . ' ÷ ' . mlb_dec($eff / 100) . ' = ' . mlb_rd($in, 1) . ' J.'], 'The input is MORE than the useful work.', 'challenge', 60, 1); },
        static function (MlbRng $r) { $dev = $r->pick(['an electric motor', 'a car engine', 'a filament bulb', 'a generator']);
            return mlb_mcq($r, 'Where does most of the wasted energy from ' . $dev . ' end up?', 'As heat in the surroundings',
                [['It is destroyed', 'Energy is never destroyed: it is changed into less useful forms.'], ['It is stored for later', 'Wasted energy spreads out and cannot easily be used again.'], ['As light', 'Some devices waste a little as light or sound, but heat is the main one.']],
                ['Energy is conserved: input = useful output + wasted energy.', 'Most of the wasted energy becomes heat (often through friction or electrical resistance) and spreads into the surroundings.'], 'Energy cannot be destroyed.', 'concept', 30); },
    ],
    'PH-035' => [
        static function (MlbRng $r) { $F = $r->int(2, 80) * 10; $t = $r->pick([0.01, 0.02, 0.05, 0.1, 0.2]);
            return phy_num('A footballer kicks a ball with an average force of ' . $F . ' N for ' . mlb_dec($t) . ' s. What impulse does the ball receive?', mlb_dec($F * $t), 'N s',
                ['Impulse = force × time.', $F . ' × ' . mlb_dec($t) . ' = ' . mlb_dec($F * $t) . ' N s.'], 'Ft.', 'procedure', 35); },
        static function (MlbRng $r) { $m = $r->pick([0.1, 0.2, 0.4, 0.5]); $v = $r->int(5, 30); $t = $r->pick([0.01, 0.02, 0.05, 0.1]);
            return phy_num('A ' . mlb_dec($m) . ' kg ball at rest is struck and leaves at ' . $v . ' m/s. The contact lasts ' . mlb_dec($t) . ' s. What is the average force?', mlb_rd($m * $v / $t, 1), 'N',
                ['Force = change in momentum ÷ time.', '(' . mlb_dec($m) . ' × ' . $v . ' − 0) ÷ ' . mlb_dec($t) . ' = ' . mlb_rd($m * $v / $t, 1) . ' N.'], 'Ft = mv − mu.', 'application', 55, 1); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why do cars have crumple zones and airbags?', 'They make a collision last longer, so the force is smaller',
                [['They make the car lighter', 'They add weight if anything.'], ['They reduce the change in momentum', 'The car still stops: the change in momentum is the same.'], ['They make the collision shorter', 'A shorter collision would mean a LARGER force.']],
                ['Force = change in momentum ÷ time.', 'Stretching out the time of the stop, for the same change in momentum, makes the force on the people smaller.'], 'F = Δp ÷ t.', 'reasoning', 35); },
    ],
    'PH-036' => [
        static function (MlbRng $r) { $m1 = $r->int(1, 6) * 500; $u1 = $r->int(2, 20); $m2 = $r->int(1, 6) * 500; $tot = $m1 + $m2;
            $v = $m1 * $u1 / $tot;
            return phy_num('A ' . mlb_p($m1) . ' kg car moving at ' . $u1 . ' m/s hits a ' . mlb_p($m2) . ' kg car at rest, and they move off locked together. What is their common speed?', mlb_rd($v, 2), 'm/s',
                ['Momentum before = momentum after: ' . mlb_p($m1) . ' × ' . $u1 . ' + 0 = (' . mlb_p($m1) . ' + ' . mlb_p($m2) . ')v.', 'v = ' . mlb_p($m1 * $u1) . ' ÷ ' . mlb_p($tot) . ' = ' . mlb_rd($v, 2) . ' m/s.'], 'Total momentum is conserved.', 'application', 60, 2); },
        static function (MlbRng $r) { $mb = $r->pick([0.01, 0.02, 0.05]); $vb = $r->int(20, 60) * 10; $mg = $r->int(2, 8);
            return phy_num('A ' . $mg . ' kg gun fires a ' . mlb_dec($mb) . ' kg bullet at ' . $vb . ' m/s. With what speed does the gun recoil?', mlb_rd($mb * $vb / $mg, 2), 'm/s',
                ['Before firing the total momentum is 0, so after: ' . mlb_dec($mb) . ' × ' . $vb . ' = ' . $mg . ' × V.', 'V = ' . mlb_dec($mb * $vb) . ' ÷ ' . $mg . ' = ' . mlb_rd($mb * $vb / $mg, 2) . ' m/s, backwards.'], 'Zero momentum before.', 'application', 55, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In which kind of collision is KINETIC ENERGY also conserved?', 'An elastic collision',
                [['An inelastic collision', 'Inelastic means some kinetic energy becomes heat, sound or crumpling.'], ['Every collision', 'Only momentum is conserved in every collision.'], ['A collision where the bodies stick together', 'Sticking together is the MOST inelastic kind.']],
                ['Momentum is conserved in every collision (with no outside force).', 'Kinetic energy is conserved too only in an elastic collision.'], 'Momentum always; kinetic energy only sometimes.', 'concept', 30); },
    ],
    'PH-037' => [
        static function (MlbRng $r) { $rad = $r->int(1, 20); $T = $r->int(2, 20);
            return phy_num('A stone on a string moves in a circle of radius ' . $rad . ' m, going round once every ' . $T . ' s. What is its speed? (π = 3.14)', mlb_rd(2 * 3.14 * $rad / $T, 2), 'm/s',
                ['Speed = circumference ÷ period: $v = \\frac{2\\pi r}{T}$.', '$v = \\frac{2 \\times 3.14 \\times ' . $rad . '}{' . $T . '} = ' . mlb_rd(2 * 3.14 * $rad / $T, 2) . '$ m/s.'], 'One lap is 2πr.', 'procedure', 50, 2); },
        static function (MlbRng $r) { $v = $r->int(2, 20); $rad = $r->pick([1, 2, 4, 5, 8, 10, 20]);
            return phy_num('A car takes a bend of radius ' . $rad . ' m at ' . $v . ' m/s. What is its centripetal acceleration?', mlb_rd($v * $v / $rad, 2), 'm/s²',
                ['$a = \\frac{v^2}{r}$, towards the centre of the circle.', '$a = \\frac{' . $v . '^2}{' . $rad . '} = ' . mlb_rd($v * $v / $rad, 2) . '$ m/s².'], 'v² ÷ r.', 'procedure', 45, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A stone whirled on a string moves in a circle at a steady speed. In which direction is the resultant force on it?', 'Towards the centre of the circle',
                [['Outwards, away from the centre', 'Nothing pushes it outwards; let go and it flies off along the tangent.'], ['Along the direction it is moving', 'A force along the motion would speed it up.'], ['There is no resultant force, as its speed is constant', 'Its DIRECTION keeps changing, so it is accelerating, and that needs a force.']],
                ['Moving in a circle means the velocity keeps changing direction.', 'That change is caused by a centripetal force, pointing to the centre (here, the tension in the string).'], 'Its velocity is changing direction.', 'reasoning', 40); },
    ],
    'PH-038' => [
        static function (MlbRng $r) { $L = $r->pick([0.4, 0.9, 1.6, 2.5, 3.6, 0.1, 0.25]);
            $T = 2 * 3.14 * sqrt($L / PHY_G);
            return phy_dia(phy_num('What is the period of a simple pendulum ' . mlb_dec($L) . ' m long? (g = 10 m/s², π = 3.14)', mlb_rd($T, 2), 's',
                ['$T = 2\\pi\\sqrt{\\frac{L}{g}}$.', '$T = 2 \\times 3.14 \\times \\sqrt{\\frac{' . mlb_dec($L) . '}{10}} = 6.28 \\times ' . mlb_dec(sqrt($L / PHY_G)) . ' = ' . mlb_rd($T, 2) . '$ s.'], 'T = 2π√(L/g).', 'procedure', 55, 2), ['type' => 'phy-pendulum', 'L' => mlb_dec($L) . ' m']); },
        static function (MlbRng $r) { $T = $r->pick([0.5, 0.8, 1.25, 2, 2.5, 4]);
            return phy_num('A pendulum has a period of ' . mlb_dec($T) . ' s. What is its frequency?', mlb_dec(1 / $T), 'Hz',
                ['Frequency is the number of swings per second: f = 1 ÷ T.', '1 ÷ ' . mlb_dec($T) . ' = ' . mlb_dec(1 / $T) . ' Hz.'], 'f = 1/T.', 'procedure', 30); },
        static function (MlbRng $r) { $c = $r->pick(['mass of the bob', 'length of the string']);
            $isMass = $c === 'mass of the bob';
            return mlb_mcq($r, 'The ' . $c . ' of a simple pendulum is made four times as big. What happens to its period?', $isMass ? 'It stays the same' : 'It doubles',
                [[$isMass ? 'It doubles' : 'It stays the same', $isMass ? 'Mass does not appear in T = 2π√(L/g).' : 'Length is in the formula: T depends on √L.'], ['It becomes four times as long', 'T depends on the SQUARE ROOT of the length, not the length itself.'], ['It halves', 'A longer pendulum swings more slowly, not faster.']],
                ['T = 2π√(L/g): only the length and g matter.', $isMass ? 'The mass is not in the formula, so the period does not change.' : '√4 = 2, so the period doubles.'], 'Look at the formula.', 'reasoning', 35); },
    ],
    'PH-039' => [
        static function (MlbRng $r) { $air = $r->int(10, 60); $up = $r->int(2, $air - 2);
            return phy_num('A metal block weighs ' . $air . ' N in air and ' . ($air - $up) . ' N when fully under water. What is the upthrust on it?', $up, 'N',
                ['Upthrust = apparent loss of weight.', $air . ' − ' . ($air - $up) . ' = ' . $up . ' N.'], 'How much lighter does it seem?', 'procedure', 35); },
        static function (MlbRng $r) { $V = $r->pick([0.001, 0.002, 0.005, 0.01, 0.02]); $rho = $r->pick([1000, 800, 1030]);
            return phy_num('A ' . mlb_dec($V) . ' m³ object is fully under a liquid of density ' . $rho . ' kg/m³. What is the upthrust? (g = 10 m/s²)', mlb_dec($V * $rho * PHY_G), 'N',
                ['Archimedes: upthrust = weight of liquid displaced = Vρg.', mlb_dec($V) . ' × ' . $rho . ' × 10 = ' . mlb_dec($V * $rho * PHY_G) . ' N.'], 'Weight of the liquid pushed aside.', 'application', 50); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Archimedes’ principle says that the upthrust on an object in a fluid is equal to…', 'the weight of the fluid it displaces',
                [['the weight of the object', 'That is only true for a FLOATING object.'], ['the volume of the object', 'Upthrust is a force (N), not a volume.'], ['the mass of the fluid displaced', 'It is the WEIGHT of that fluid, a force.']],
                ['When an object is wholly or partly in a fluid, it experiences an upthrust.', 'That upthrust equals the weight of the fluid displaced.'], 'What is pushed aside?', 'concept', 30); },
    ],
    'PH-040' => [
        static function (MlbRng $r) { $rd = $r->pick([0.8, 1.2, 2.5, 2.7, 7.8, 8.9, 11.3, 13.6]);
            return phy_num('A substance has a density of ' . phy_p($rd * 1000) . ' kg/m³. What is its relative density? (water: 1000 kg/m³)', mlb_dec($rd), '',
                ['Relative density = density of substance ÷ density of water.', phy_p($rd * 1000) . ' ÷ 1000 = ' . mlb_dec($rd) . ' (no unit).'], 'Compare with water.', 'procedure', 35); },
        static function (MlbRng $r) { $loss = $r->int(2, 10); $rd = $r->pick([2, 2.5, 3, 4, 5, 8]); $air = $loss * $rd;
            return phy_num('A stone weighs ' . mlb_dec($air) . ' N in air and ' . mlb_dec($air - $loss) . ' N in water. What is its relative density?', mlb_dec($rd), '',
                ['Relative density = weight in air ÷ loss of weight in water.', 'Loss = ' . mlb_dec($air) . ' − ' . mlb_dec($air - $loss) . ' = ' . $loss . ' N; ' . mlb_dec($air) . ' ÷ ' . $loss . ' = ' . mlb_dec($rd) . '.'], 'Weight in air ÷ upthrust.', 'application', 50); },
        static function (MlbRng $r) { $obj = $r->pick([400, 500, 600, 700, 800, 900]); $liq = $r->pick([1000, 1000, 1200]); if ($obj >= $liq) $obj = 600;
            $pc = $obj / $liq * 100;
            return phy_num('A block of wood of density ' . $obj . ' kg/m³ floats in a liquid of density ' . $liq . ' kg/m³. What percentage of its volume is under the surface?', mlb_rd($pc, 1), '%',
                ['A floating body displaces its own weight of liquid, so the fraction under = ρ(object) ÷ ρ(liquid).', $obj . ' ÷ ' . $liq . ' = ' . mlb_rd($pc / 100, 3) . ', that is ' . mlb_rd($pc, 1) . '%.'], 'Floating: upthrust = weight.', 'challenge', 55, 1); },
    ],
    ];
}

/* ═══ Stage 5 — Heat, Waves and Light ═══ */
function phy_forms_5(): array {
    return [
    'PH-041' => [
        static function (MlbRng $r) { $c = $r->int(-40, 120);
            return phy_num('Convert ' . $c . ' °C to kelvin.', $c + 273, 'K',
                ['T(K) = θ(°C) + 273.', $c . ' + 273 = ' . ($c + 273) . ' K.'], 'Add 273.', 'procedure', 25); },
        static function (MlbRng $r) { $k = $r->int(200, 400);
            return phy_num('Convert ' . $k . ' K to degrees Celsius.', $k - 273, '°C',
                ['θ(°C) = T(K) − 273.', $k . ' − 273 = ' . ($k - 273) . ' °C.'], 'Subtract 273.', 'procedure', 25); },
        static function (MlbRng $r) { $c = $r->int(-8, 20) * 5;
            return phy_num('Convert ' . $c . ' °C to degrees Fahrenheit.', $c * 9 / 5 + 32, '°F',
                ['$F = \\tfrac{9}{5}C + 32$.', '$\\tfrac{9}{5} \\times ' . $c . ' + 32 = ' . ($c * 9 / 5) . ' + 32 = ' . ($c * 9 / 5 + 32) . '$ °F.'], 'Times 9/5, then add 32.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'What is absolute zero?', '0 K, or −273 °C: the lowest temperature possible',
                [['0 °C: the temperature at which water freezes', 'Water freezes at 0 °C = 273 K, far above absolute zero.'], ['−100 °C', 'Absolute zero is −273 °C.'], ['The temperature of outer space', 'Space is cold (about 3 K) but not absolute zero.']],
                ['At absolute zero the particles have the least energy they can have.', 'It is 0 K, which is −273 °C (more exactly −273.15 °C).'], 'The bottom of the kelvin scale.', 'concept', 25); },
    ],
    'PH-042' => [
        static function (MlbRng $r) { [$mat, $a] = $r->pick([['steel', 12], ['copper', 17], ['brass', 19], ['aluminium', 23]]); $L = $r->int(2, 50); $dT = $r->int(2, 10) * 5;
            $dL = $a * 1e-6 * $L * $dT * 1000;
            return phy_num('A ' . $mat . ' rod ' . $L . ' m long is heated through ' . $dT . ' °C. Its linear expansivity is ' . $a . ' × 10⁻⁶ /°C. By how many millimetres does it expand?', mlb_rd($dL, 2), 'mm',
                ['ΔL = αLΔθ.', 'ΔL = ' . $a . ' × 10⁻⁶ × ' . $L . ' × ' . $dT . ' = ' . mlb_rd($dL / 1000, 6) . ' m = ' . mlb_rd($dL, 2) . ' mm.'], 'ΔL = αLΔθ, then metres to millimetres.', 'procedure', 60, 2); },
        static function (MlbRng $r) { $why = $r->pick(['Gaps are left between lengths of railway line', 'Telephone wires are hung slack in hot weather']);
            return mlb_mcq($r, $why . '. Why?', 'To allow room for expansion when it gets hot',
                [['To save metal', 'Gaps and slack exist because of temperature, not cost.'], ['To make them easier to repair', 'The reason is the effect of temperature.'], ['Because metals shrink when heated', 'Metals EXPAND when heated.']],
                ['Solids expand when heated and contract when cooled.', 'Without the gaps (or slack), the expansion (or contraction) would buckle rails or snap wires.'], 'What happens to metal on a hot day?', 'reasoning', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A bimetallic strip of brass and iron is heated and bends. Which metal is on the OUTSIDE of the curve?', 'Brass, because it expands more',
                [['Iron, because it expands more', 'Brass has the larger expansivity.'], ['Neither: the strip does not bend', 'It bends because the two metals expand by different amounts.'], ['Brass, because it expands less', 'The metal that expands MORE is longer, so it is on the outside.']],
                ['The two metals are joined, so the one that expands more becomes longer.', 'The longer metal has to go round the outside of the curve: brass. (This is how a thermostat switches.)'], 'The longer strip is on the outside.', 'reasoning', 40); },
    ],
    'PH-043' => [
        static function (MlbRng $r) { $m = $r->pick([0.5, 1, 1.5, 2, 2.5, 4]); $c = $r->pick([4200, 900, 380, 2100]); $dT = $r->int(2, 16) * 5;
            $sub = [4200 => 'water', 900 => 'aluminium', 380 => 'copper', 2100 => 'ice'][$c];
            return phy_num('How much heat raises ' . mlb_dec($m) . ' kg of ' . $sub . ' (c = ' . $c . ' J/kg°C) by ' . $dT . ' °C?', mlb_dec($m * $c * $dT), 'J',
                ['Q = mcΔθ.', 'Q = ' . mlb_dec($m) . ' × ' . $c . ' × ' . $dT . ' = ' . mlb_p($m * $c * $dT) . ' J.'], 'Q = mcΔθ.', 'procedure', 45); },
        static function (MlbRng $r) { $m = $r->pick([0.5, 1, 2]); $dT = $r->int(2, 15) * 5; $Q = $m * 4200 * $dT;
            return phy_num('A heater gives ' . mlb_p($Q) . ' J to ' . mlb_dec($m) . ' kg of water (c = 4200 J/kg°C). By how much does its temperature rise?', $dT, '°C',
                ['Δθ = Q ÷ (mc).', mlb_p($Q) . ' ÷ (' . mlb_dec($m) . ' × 4200) = ' . $dT . ' °C.'], 'Rearrange Q = mcΔθ.', 'procedure', 50); },
        static function (MlbRng $r) { $P = $r->int(5, 30) * 100; $m = $r->pick([1, 2, 3]); $dT = $r->int(2, 8) * 10; $t = $m * 4200 * $dT / $P;
            return phy_num('A ' . phy_p($P) . ' W kettle heats ' . $m . ' kg of water (c = 4200 J/kg°C) through ' . $dT . ' °C. Assuming no heat is lost, how long does it take?', mlb_rd($t, 1), 's',
                ['Heat needed = mcΔθ = ' . $m . ' × 4200 × ' . $dT . ' = ' . mlb_p($m * 4200 * $dT) . ' J.', 'Time = energy ÷ power = ' . mlb_p($m * 4200 * $dT) . ' ÷ ' . phy_p($P) . ' = ' . mlb_rd($t, 1) . ' s.'], 'Energy = power × time.', 'challenge', 70, 1); },
        static function (MlbRng $r) { $m = $r->int(2, 6); $dT = $r->int(2, 6) * 5;
            $right = ['$Q = mc\\Delta\\theta$', '$Q = ' . $m . ' \\times 4200 \\times ' . $dT . '$', '$Q = ' . mlb_n($m * 4200 * $dT) . '$ J'];
            return mlb_error_of($r, 'Find the heat needed to warm ' . $m . ' kg of water (c = 4200 J/kg°C) from 20 °C to ' . (20 + $dT) . ' °C. Which line holds the first mistake?', $right, [
                [1, ['$Q = mc\\Delta\\theta$', '$Q = ' . $m . ' \\times 4200 \\times ' . (20 + $dT) . '$', '$Q = ' . mlb_n($m * 4200 * (20 + $dT)) . '$ J'], 'Δθ is the CHANGE in temperature, ' . $dT . ' °C, not the final temperature.'],
                [0, ['$Q = mc \\div \\Delta\\theta$', '$Q = ' . $m . ' \\times 4200 \\div ' . $dT . '$', '$Q = ' . mlb_n(round($m * 4200 / $dT)) . '$ J'], 'the temperature change MULTIPLIES: Q = mcΔθ.'],
                [2, ['$Q = mc\\Delta\\theta$', '$Q = ' . $m . ' \\times 4200 \\times ' . $dT . '$', '$Q = ' . mlb_n($m * 420 * $dT) . '$ J'], 'the multiplication has dropped a zero: it is ' . mlb_p($m * 4200 * $dT) . '.'],
            ]); },
    ],
    'PH-044' => [
        static function (MlbRng $r) { $m = $r->pick([0.1, 0.2, 0.25, 0.5, 1, 2]);
            return phy_num('How much heat melts ' . mlb_dec($m) . ' kg of ice at 0 °C? (specific latent heat of fusion of ice = 336 000 J/kg)', mlb_dec($m * 336000), 'J',
                ['Q = mL.', 'Q = ' . mlb_dec($m) . ' × 336 000 = ' . mlb_p($m * 336000) . ' J.'], 'Q = mL: no temperature change.', 'procedure', 40); },
        static function (MlbRng $r) { $m = $r->pick([0.1, 0.2, 0.5, 1]);
            return phy_num('How much heat turns ' . mlb_dec($m) . ' kg of boiling water at 100 °C into steam? (latent heat of vaporisation = 2 260 000 J/kg)', mlb_dec($m * 2260000), 'J',
                ['Q = mL.', 'Q = ' . mlb_dec($m) . ' × 2 260 000 = ' . mlb_p($m * 2260000) . ' J.'], 'Q = mL.', 'procedure', 40); },
        static function (MlbRng $r) { $m = $r->pick([0.1, 0.2, 0.5]); $T = $r->int(1, 8) * 10;
            $Q = $m * 336000 + $m * 4200 * $T;
            return phy_num('How much heat turns ' . mlb_dec($m) . ' kg of ice at 0 °C into water at ' . $T . ' °C? (L = 336 000 J/kg; c of water = 4200 J/kg°C)', mlb_dec($Q), 'J',
                ['Two steps: first melt it (mL), then warm the water (mcΔθ).', mlb_dec($m) . ' × 336 000 + ' . mlb_dec($m) . ' × 4200 × ' . $T . ' = ' . mlb_p($m * 336000) . ' + ' . mlb_p($m * 4200 * $T) . ' = ' . mlb_p($Q) . ' J.'], 'Melt first, then warm.', 'challenge', 75); },
    ],
    'PH-045' => [
        static function (MlbRng $r) { $P1 = $r->int(1, 6) * 100; $V1 = $r->int(2, 12) * 10; $k = $r->pick([2, 4, 5]); $up = $r->int(0, 1) === 1;
            $P2 = $up ? $P1 * $k : $P1; $V2 = $up ? $V1 / $k : $V1 * $k; if (!$up) $P2 = $P1 / $k;
            return phy_num('A gas occupies ' . $V1 . ' cm³ at ' . $P1 . ' kPa. At constant temperature, what is its volume at ' . mlb_dec($P2) . ' kPa?', mlb_dec($V2), 'cm³',
                ['Boyle’s law: $P_1V_1 = P_2V_2$ at constant temperature.', '$V_2 = \\frac{' . $P1 . ' \\times ' . $V1 . '}{' . mlb_dec($P2) . '} = ' . mlb_dec($V2) . '$ cm³.'], 'Pressure up, volume down.', 'procedure', 50); },
        static function (MlbRng $r) { $t1 = $r->pick([27, 7, 47, 77]); $T1 = $t1 + 273; $k = $r->pick([1.5, 2]); $T2 = $T1 * $k; $V1 = $r->int(2, 12) * 10;
            return phy_num('A gas has a volume of ' . $V1 . ' cm³ at ' . $t1 . ' °C. At constant pressure, what is its volume at ' . ($T2 - 273) . ' °C?', mlb_dec($V1 * $k), 'cm³',
                ['Charles’s law: $\\frac{V_1}{T_1} = \\frac{V_2}{T_2}$ with T in KELVIN.', '$T_1 = ' . $T1 . '$ K, $T_2 = ' . mlb_dec($T2) . '$ K: $V_2 = ' . $V1 . ' \\times \\frac{' . mlb_dec($T2) . '}{' . $T1 . '} = ' . mlb_dec($V1 * $k) . '$ cm³.'], 'Change °C to K first.', 'challenge', 60); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does a car tyre’s pressure rise after a long drive on a hot day?', 'The air inside gets hotter, so its particles hit the walls harder and more often',
                [['More air leaks in', 'No air enters a sealed tyre.'], ['The tyre gets smaller', 'The tyre’s volume stays roughly the same.'], ['The air particles get bigger', 'Particles do not grow; they move faster.']],
                ['Pressure law: at constant volume, pressure rises with (kelvin) temperature.', 'Hotter particles move faster, hitting the walls harder and more often.'], 'Think about the particles.', 'reasoning', 35); },
    ],
    'PH-046' => [
        static function (MlbRng $r) { $f = $r->int(2, 50) * 10; $lam = $r->pick([0.2, 0.5, 0.75, 1.5, 2, 3.4]);
            return phy_dia(phy_num('A sound wave has a frequency of ' . $f . ' Hz and a wavelength of ' . mlb_dec($lam) . ' m. What is its speed?', mlb_dec($f * $lam), 'm/s',
                ['v = fλ.', 'v = ' . $f . ' × ' . mlb_dec($lam) . ' = ' . mlb_dec($f * $lam) . ' m/s.'], 'v = fλ.', 'procedure', 35), ['type' => 'phy-wave', 'lambda' => 'λ = ' . mlb_dec($lam) . ' m']); },
        static function (MlbRng $r) { $v = $r->pick([330, 340, 1500]); $f = $r->pick([110, 165, 220, 330, 440, 660, 1100]);
            return phy_num('Sound travels at ' . $v . ' m/s. What is the wavelength of a ' . $f . ' Hz note?', mlb_rd($v / $f, 3), 'm',
                ['λ = v ÷ f.', $v . ' ÷ ' . $f . ' = ' . mlb_rd($v / $f, 3) . ' m.'], 'Rearrange v = fλ.', 'procedure', 40, 3); },
        static function (MlbRng $r) { $t = $r->pick(['transverse', 'longitudinal']);
            $ex = ['transverse' => ['Light (and every electromagnetic wave)', 'Sound in air'], 'longitudinal' => ['Sound in air', 'Light (and every electromagnetic wave)']][$t];
            return mlb_mcq($r, 'Which of these is a ' . $t . ' wave?', $ex[0],
                [[$ex[1], 'That is ' . ($t === 'transverse' ? 'longitudinal: the air vibrates along the direction of travel.' : 'transverse: the vibrations are across the direction of travel.')], ['Neither: a wave cannot be ' . $t, 'Both kinds exist.'], ['A water ripple’s sound', 'That mixes two different waves.']],
                ['Transverse: vibrations at right angles to the direction of travel. Longitudinal: vibrations along it.', $ex[0] . ' is ' . $t . '.'], 'How do the particles vibrate?', 'concept', 30); },
    ],
    'PH-047' => [
        static function (MlbRng $r) { $v = $r->pick([320, 330, 340]); $t = $r->pick([0.4, 0.5, 0.8, 1, 1.2, 1.5, 2, 3]);
            return phy_num('A boy claps in front of a cliff and hears the echo ' . mlb_dec($t) . ' s later. If sound travels at ' . $v . ' m/s, how far away is the cliff?', mlb_dec($v * $t / 2), 'm',
                ['The sound goes TO the cliff and BACK: total distance = vt.', 'Distance to the cliff = vt ÷ 2 = ' . $v . ' × ' . mlb_dec($t) . ' ÷ 2 = ' . mlb_dec($v * $t / 2) . ' m.'], 'There and back.', 'application', 50); },
        static function (MlbRng $r) { $d = $r->int(5, 30) * 10; $v = $r->pick([320, 330, 340, 350]); $t = 2 * $d / $v;
            return phy_num('A student stands ' . $d . ' m from a wall and hears the echo of a shout ' . mlb_rd($t, 3) . ' s later. What is the speed of sound?', $v, 'm/s',
                ['The sound travels 2 × ' . $d . ' = ' . (2 * $d) . ' m.', 'v = ' . (2 * $d) . ' ÷ ' . mlb_rd($t, 3) . ' ≈ ' . $v . ' m/s.'], 'v = 2d ÷ t.', 'application', 50, 0); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'An astronaut on the Moon cannot hear a rock falling nearby. Why?', 'Sound needs a medium, and there is no air on the Moon',
                [['Sound is too slow on the Moon', 'Sound cannot travel at all without a medium.'], ['The Moon’s gravity stops sound', 'Gravity has nothing to do with it.'], ['The rock makes no vibrations', 'The rock vibrates; nothing carries those vibrations to her.']],
                ['Sound is a longitudinal wave made by particles vibrating.', 'In a vacuum there are no particles to pass the vibrations on.'], 'What does sound travel through?', 'concept', 30); },
    ],
    'PH-048' => [
        static function (MlbRng $r) { $i = $r->int(10, 80);
            return phy_dia(phy_num('A ray of light hits a plane mirror at an angle of incidence of ' . $i . '°. What is the angle of reflection?', $i, '°',
                ['First law of reflection: the angle of reflection equals the angle of incidence (both measured from the normal).', 'So it is ' . $i . '°.'], 'i = r.', 'concept', 25), ['type' => 'phy-mirror', 'i' => $i, 'iLabel' => $i . '°', 'rLabel' => '?']); },
        static function (MlbRng $r) { $g = $r->int(10, 80);
            return phy_num('A ray makes an angle of ' . $g . '° with the SURFACE of a plane mirror. What is the angle of reflection?', 90 - $g, '°',
                ['Angles of incidence and reflection are measured from the NORMAL, which is at 90° to the surface.', 'i = 90 − ' . $g . ' = ' . (90 - $g) . '°, so r = ' . (90 - $g) . '°.'], 'Measure from the normal, not the mirror.', 'reasoning', 45); },
        static function (MlbRng $r) { $th = $r->pick([30, 36, 40, 45, 60, 72, 90]);
            return phy_num('Two plane mirrors are inclined at ' . $th . '° to each other. How many images of an object between them are formed?', 360 / $th - 1, '',
                ['n = (360 ÷ θ) − 1.', '360 ÷ ' . $th . ' − 1 = ' . (360 / $th - 1) . ' images.'], 'n = 360/θ − 1.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which describes the image of you in a plane mirror?', 'Virtual, upright, the same size and laterally inverted',
                [['Real, upside down and smaller', 'That describes an image made by a converging lens far away.'], ['Virtual, upright and larger', 'A plane mirror image is the same size.'], ['Real, upright and the same size', 'A plane mirror image cannot be caught on a screen: it is virtual.']],
                ['A plane mirror image is as far behind the mirror as the object is in front.', 'It is virtual, upright, the same size and laterally inverted (left and right swapped).'], 'Can you catch it on a screen?', 'concept', 30); },
    ],
    'PH-049' => [
        static function (MlbRng $r) { [$si, $sr] = $r->pick([[0.75, 0.5], [0.6, 0.4], [0.9, 0.6], [0.8, 0.5], [0.66, 0.5], [0.5, 0.375]]);
            return phy_dia(phy_num('Light passes from air into glass. sin i = ' . mlb_dec($si) . ' and sin r = ' . mlb_dec($sr) . '. What is the refractive index of the glass?', mlb_rd($si / $sr, 2), '',
                ['Snell’s law: $n = \\frac{\\sin i}{\\sin r}$.', '$n = ' . mlb_dec($si) . ' \\div ' . mlb_dec($sr) . ' = ' . mlb_rd($si / $sr, 2) . '$.'], 'sin i ÷ sin r.', 'procedure', 40, 2), ['type' => 'phy-refract', 'i' => round(rad2deg(asin($si))), 'n' => $si / $sr]); },
        static function (MlbRng $r) { $n = $r->pick([1.25, 1.33, 1.5, 2, 2.4]);
            return phy_num('Light travels at 3 × 10⁸ m/s in air. In a material of refractive index ' . mlb_dec($n) . ', how fast does it travel, in units of 10⁸ m/s?', mlb_rd(3 / $n, 2), '× 10⁸ m/s',
                ['n = (speed in air) ÷ (speed in the material).', 'Speed = 3 ÷ ' . mlb_dec($n) . ' = ' . mlb_rd(3 / $n, 2) . ' × 10⁸ m/s.'], 'n = c ÷ v.', 'procedure', 45, 2); },
        static function (MlbRng $r) { [$n, $C] = $r->pick([[2, 30], [1.414, 45], [1.155, 60]]);
            return phy_num('The refractive index of a material is ' . mlb_dec($n) . '. What is its critical angle? (sin C = 1/n)', $C, '°',
                ['sin C = 1 ÷ n = 1 ÷ ' . mlb_dec($n) . ' = ' . mlb_rd(1 / $n, 3) . '.', 'C = ' . $C . '°.'], 'sin C = 1/n.', 'challenge', 50); },
        static function (MlbRng $r) { $into = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'A ray of light passes at an angle from ' . ($into ? 'air into glass' : 'glass into air') . '. Which way does it bend?', $into ? 'Towards the normal' : 'Away from the normal',
                [[$into ? 'Away from the normal' : 'Towards the normal', 'Light bends towards the normal when it SLOWS DOWN (entering a denser material), away when it speeds up.'], ['It does not bend', 'At an angle, a change of speed always bends it.'], ['Back the way it came', 'That is reflection, not refraction.']],
                ['Light slows down in glass and speeds up again in air.', $into ? 'Slowing down, it bends towards the normal.' : 'Speeding up, it bends away from the normal.'], 'Slowing down bends it towards the normal.', 'concept', 30); },
    ],
    'PH-050' => [
        static function (MlbRng $r) { [$u, $f] = $r->pick([[30, 20], [30, 15], [40, 20], [24, 12], [20, 15], [60, 20], [15, 10], [36, 12]]); $v = $u * $f / ($u - $f);
            return phy_dia(phy_num('An object is ' . $u . ' cm from a converging lens of focal length ' . $f . ' cm. How far from the lens is the image formed?', mlb_dec($v), 'cm',
                ['Lens formula: $\\frac{1}{f} = \\frac{1}{u} + \\frac{1}{v}$.', '$\\frac{1}{v} = \\frac{1}{' . $f . '} - \\frac{1}{' . $u . '}$, so $v = \\frac{' . $u . ' \\times ' . $f . '}{' . $u . ' - ' . $f . '} = ' . mlb_dec($v) . '$ cm.'], 'Rearrange 1/f = 1/u + 1/v.', 'challenge', 70), ['type' => 'phy-lens', 'u' => $u, 'f' => $f, 'labels' => 'u = ' . $u . ' cm, f = ' . $f . ' cm']); },
        static function (MlbRng $r) { $u = $r->int(2, 10) * 5; $m = $r->pick([0.5, 2, 3, 4]); $v = $u * $m;
            return phy_num('An object ' . $u . ' cm from a lens forms an image ' . mlb_dec($v) . ' cm from the lens. What is the magnification?', mlb_dec($m), '',
                ['Magnification = image distance ÷ object distance = v ÷ u.', mlb_dec($v) . ' ÷ ' . $u . ' = ' . mlb_dec($m) . '.'], 'm = v ÷ u.', 'procedure', 40); },
        static function (MlbRng $r) { $f = $r->pick([10, 20, 25, 40, 50]);
            return phy_num('A converging lens has a focal length of ' . $f . ' cm. What is its power, in dioptres?', 100 / $f, 'D',
                ['Power = 1 ÷ focal length IN METRES.', $f . ' cm = ' . mlb_dec($f / 100) . ' m, so P = 1 ÷ ' . mlb_dec($f / 100) . ' = ' . mlb_dec(100 / $f) . ' D.'], 'Change cm to m first.', 'procedure', 40); },
    ],
    ];
}

/* ═══ Stage 6 — Electricity, Magnetism and the Atom ═══ */
function phy_forms_6(): array {
    return [
    'PH-051' => [
        static function (MlbRng $r) { $I = $r->pick([0.2, 0.5, 1, 1.5, 2, 3, 4, 5]); $t = $r->int(2, 60) * 5;
            return phy_num('A current of ' . mlb_dec($I) . ' A flows for ' . $t . ' s. How much charge passes?', mlb_dec($I * $t), 'C',
                ['Q = It.', 'Q = ' . mlb_dec($I) . ' × ' . $t . ' = ' . mlb_dec($I * $t) . ' C.'], 'Charge = current × time.', 'procedure', 30); },
        static function (MlbRng $r) { $I = $r->pick([0.5, 1, 2, 4, 5]); $t = $r->int(2, 30) * 10; $Q = $I * $t;
            return phy_num(mlb_dec($Q) . ' C of charge flows through a lamp in ' . $t . ' s. What is the current?', mlb_dec($I), 'A',
                ['I = Q ÷ t.', mlb_dec($Q) . ' ÷ ' . $t . ' = ' . mlb_dec($I) . ' A.'], 'Current is charge per second.', 'procedure', 30); },
        static function (MlbRng $r) { $min = $r->int(1, 10); $I = $r->pick([0.5, 2, 3, 4]);
            return phy_num('A current of ' . mlb_dec($I) . ' A flows for ' . $min . ' minute' . ($min > 1 ? 's' : '') . '. How much charge flows?', mlb_dec($I * $min * 60), 'C',
                ['Time must be in SECONDS: ' . $min . ' min = ' . ($min * 60) . ' s.', 'Q = ' . mlb_dec($I) . ' × ' . ($min * 60) . ' = ' . mlb_dec($I * $min * 60) . ' C.'], 'Minutes to seconds first.', 'application', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In a circuit, which way does conventional current flow?', 'From the positive terminal round to the negative',
                [['From the negative terminal round to the positive', 'That is the way ELECTRONS flow; conventional current was defined the other way.'], ['Both ways at once', 'In a d.c. circuit the current flows one way.'], ['Only inside the cell', 'Current flows all the way round the circuit.']],
                ['Conventional current flows from + to − around the circuit outside the cell.', 'Electrons actually move from − to +; the convention was fixed before electrons were discovered.'], 'Plus to minus.', 'concept', 30); },
    ],
    'PH-052' => [
        static function (MlbRng $r) { $I = $r->pick([0.1, 0.2, 0.25, 0.5, 1, 2, 3]); $R = $r->int(2, 60);
            return phy_dia(phy_num('A current of ' . mlb_dec($I) . ' A flows through a ' . $R . ' Ω resistor. What is the potential difference across it?', mlb_dec($I * $R), 'V',
                ['Ohm’s law: V = IR.', 'V = ' . mlb_dec($I) . ' × ' . $R . ' = ' . mlb_dec($I * $R) . ' V.'], 'V = IR.', 'procedure', 30), ['type' => 'phy-circuit', 'r' => [$R . ' Ω'], 'ammeter' => true, 'voltmeter' => true]); },
        static function (MlbRng $r) { $R = $r->int(2, 50); $I = $r->pick([0.2, 0.5, 1, 2, 4]); $V = $R * $I;
            return phy_num('A ' . mlb_dec($V) . ' V battery drives a current through a ' . $R . ' Ω resistor. What is the current?', mlb_dec($I), 'A',
                ['I = V ÷ R.', mlb_dec($V) . ' ÷ ' . $R . ' = ' . mlb_dec($I) . ' A.'], 'Rearrange V = IR.', 'procedure', 30); },
        static function (MlbRng $r) { $I = $r->pick([0.2, 0.5, 2, 4]); $R = $r->int(3, 40); $V = $I * $R;
            return phy_num('A lamp takes ' . mlb_dec($I) . ' A from a ' . mlb_dec($V) . ' V supply. What is its resistance?', $R, 'Ω',
                ['R = V ÷ I.', mlb_dec($V) . ' ÷ ' . mlb_dec($I) . ' = ' . $R . ' Ω.'], 'Rearrange V = IR.', 'procedure', 30); },
        static function (MlbRng $r) { $R = $r->int(2, 20); $I = $r->int(2, 6);
            $right = ['$V = IR$', '$I = \\frac{V}{R}$', '$I = \\frac{' . ($I * $R) . '}{' . $R . '}$', '$I = ' . $I . '$ A'];
            return mlb_error_of($r, 'Find the current when ' . ($I * $R) . ' V is applied across a ' . $R . ' Ω resistor. Which line holds the first mistake?', $right, [
                [1, ['$V = IR$', '$I = VR$', '$I = ' . ($I * $R) . ' \\times ' . $R . '$', '$I = ' . ($I * $R * $R) . '$ A'], 'to get I on its own, DIVIDE both sides by R: I = V ÷ R.'],
                [1, ['$V = IR$', '$I = \\frac{R}{V}$', '$I = \\frac{' . $R . '}{' . ($I * $R) . '}$', '$I = ' . mlb_ftex($R, $I * $R) . '$ A'], 'the fraction is upside down: I = V ÷ R.'],
                [3, ['$V = IR$', '$I = \\frac{V}{R}$', '$I = \\frac{' . ($I * $R) . '}{' . $R . '}$', '$I = ' . ($I + 1) . '$ A'], 'the division is wrong: ' . ($I * $R) . ' ÷ ' . $R . ' = ' . $I . '.'],
            ]); },
    ],
    'PH-053' => [
        static function (MlbRng $r) { $a = $r->int(2, 30); $b = $r->int(2, 30); $c = $r->int(2, 30);
            return phy_dia(phy_num('Resistors of ' . $a . ' Ω, ' . $b . ' Ω and ' . $c . ' Ω are connected in series. What is the total resistance?', $a + $b + $c, 'Ω',
                ['In series, resistances add: R = R₁ + R₂ + R₃.', $a . ' + ' . $b . ' + ' . $c . ' = ' . ($a + $b + $c) . ' Ω.'], 'Series: add.', 'procedure', 30), ['type' => 'phy-circuit', 'r' => [$a . ' Ω', $b . ' Ω', $c . ' Ω']]); },
        static function (MlbRng $r) { [$a, $b] = $r->pick([[3, 6], [4, 12], [6, 12], [10, 15], [12, 24], [20, 30], [6, 3], [12, 4], [2, 2], [10, 10], [5, 20]]); $R = $a * $b / ($a + $b);
            return phy_dia(phy_num('Resistors of ' . $a . ' Ω and ' . $b . ' Ω are connected in parallel. What is their combined resistance?', mlb_dec($R), 'Ω',
                ['For two in parallel: $R = \\frac{R_1 R_2}{R_1 + R_2}$ (product over sum).', '$R = \\frac{' . $a . ' \\times ' . $b . '}{' . $a . ' + ' . $b . '} = ' . mlb_dec($R) . '$ Ω.'], 'Product over sum.', 'procedure', 45), ['type' => 'phy-circuit', 'layout' => 'parallel', 'r' => [$a . ' Ω', $b . ' Ω']]); },
        static function (MlbRng $r) { $a = $r->int(2, 10); $b = $r->int(2, 10); $I = $r->pick([0.5, 1, 2]); $V = $I * ($a + $b);
            return phy_dia(phy_num('A ' . mlb_dec($V) . ' V supply is connected to ' . $a . ' Ω and ' . $b . ' Ω resistors in series. What current flows?', mlb_dec($I), 'A',
                ['Total resistance = ' . $a . ' + ' . $b . ' = ' . ($a + $b) . ' Ω.', 'I = V ÷ R = ' . mlb_dec($V) . ' ÷ ' . ($a + $b) . ' = ' . mlb_dec($I) . ' A.'], 'Find the total resistance first.', 'application', 45), ['type' => 'phy-circuit', 'cell' => mlb_dec($V) . ' V', 'r' => [$a . ' Ω', $b . ' Ω'], 'ammeter' => true]); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Two identical resistors are joined in parallel instead of in series. What happens to the total resistance?', 'It becomes a quarter of what it was',
                [['It doubles', 'Parallel paths make it EASIER for current to flow, lowering the resistance.'], ['It halves', 'Each pair: series gives 2R, parallel gives R/2 — a quarter.'], ['It stays the same', 'How resistors are joined changes the total.']],
                ['In series: R + R = 2R. In parallel: R × R ÷ 2R = R/2.', 'R/2 is a quarter of 2R.'], 'Work out both.', 'reasoning', 45); },
    ],
    'PH-054' => [
        static function (MlbRng $r) { $V = $r->pick([6, 12, 24, 220, 240]); $I = $r->pick([0.5, 1, 2, 3, 5]);
            return phy_num('An appliance on a ' . $V . ' V supply takes a current of ' . mlb_dec($I) . ' A. What is its power?', mlb_dec($V * $I), 'W',
                ['P = IV.', 'P = ' . mlb_dec($I) . ' × ' . $V . ' = ' . mlb_dec($V * $I) . ' W.'], 'P = IV.', 'procedure', 30); },
        static function (MlbRng $r) { $I = $r->int(1, 6); $R = $r->int(2, 40);
            return phy_num('A current of ' . $I . ' A flows through a ' . $R . ' Ω heating element. At what rate is heat produced?', $I * $I * $R, 'W',
                ['P = I²R.', 'P = ' . $I . '² × ' . $R . ' = ' . ($I * $I * $R) . ' W.'], 'P = I²R.', 'procedure', 35); },
        static function (MlbRng $r) { $P = $r->pick([100, 200, 500, 1000, 1500, 2000]); $h = $r->int(1, 10); $rate = $r->pick([50, 60, 68, 75, 100]);
            $kwh = $P / 1000 * $h;
            return phy_num('A ' . $P . ' W iron is used for ' . $h . ' hour' . ($h > 1 ? 's' : '') . '. Electricity costs ₦' . $rate . ' per kWh. What does it cost?', mlb_dec($kwh * $rate), '₦',
                ['Energy in kWh = power in kW × time in hours = ' . mlb_dec($P / 1000) . ' × ' . $h . ' = ' . mlb_dec($kwh) . ' kWh.', 'Cost = ' . mlb_dec($kwh) . ' × ₦' . $rate . ' = ₦' . mlb_p($kwh * $rate) . '.'], 'Kilowatts × hours.', 'application', 55); },
    ],
    'PH-055' => [
        static function (MlbRng $r) { $R = $r->int(2, 20); $rr = $r->pick([0.5, 1, 2]); $I = $r->pick([0.5, 1, 1.5, 2]); $E = $I * ($R + $rr);
            return phy_dia(phy_num('A cell of e.m.f. ' . mlb_dec($E) . ' V and internal resistance ' . mlb_dec($rr) . ' Ω is connected to a ' . $R . ' Ω resistor. What current flows?', mlb_dec($I), 'A',
                ['E = I(R + r), so I = E ÷ (R + r).', 'I = ' . mlb_dec($E) . ' ÷ (' . $R . ' + ' . mlb_dec($rr) . ') = ' . mlb_dec($I) . ' A.'], 'Include the internal resistance.', 'procedure', 50), ['type' => 'phy-circuit', 'cell' => mlb_dec($E) . ' V, r = ' . mlb_dec($rr) . ' Ω', 'r' => [$R . ' Ω'], 'ammeter' => true]); },
        static function (MlbRng $r) { $R = $r->int(2, 20); $rr = $r->pick([0.5, 1, 2]); $I = $r->pick([0.5, 1, 2]); $E = $I * ($R + $rr);
            return phy_num('A battery of e.m.f. ' . mlb_dec($E) . ' V and internal resistance ' . mlb_dec($rr) . ' Ω drives ' . mlb_dec($I) . ' A through a resistor. What is the terminal potential difference?', mlb_dec($E - $I * $rr), 'V',
                ['Lost volts = Ir = ' . mlb_dec($I) . ' × ' . mlb_dec($rr) . ' = ' . mlb_dec($I * $rr) . ' V.', 'Terminal p.d. = E − Ir = ' . mlb_dec($E) . ' − ' . mlb_dec($I * $rr) . ' = ' . mlb_dec($E - $I * $rr) . ' V.'], 'E − Ir.', 'application', 50); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why is the voltage across a battery’s terminals less than its e.m.f. when it is driving a current?', 'Some voltage is used up driving current through the battery’s own internal resistance',
                [['The battery loses charge instantly', 'The e.m.f. stays the same; the loss is inside the battery.'], ['The wires store some of the voltage', 'Wires do not store voltage.'], ['The e.m.f. becomes bigger', 'The terminal p.d. is SMALLER, not larger.']],
                ['Terminal p.d. = E − Ir.', 'The "lost volts" Ir are used inside the battery, so less is available outside.'], 'Lost volts.', 'reasoning', 35); },
    ],
    'PH-056' => [
        static function (MlbRng $r) { $C = $r->pick([2, 5, 10, 20, 47, 100]); $V = $r->int(2, 24);
            return phy_num('A ' . $C . ' µF capacitor is charged to ' . $V . ' V. How much charge does it store, in microcoulombs?', $C * $V, 'µC',
                ['Q = CV.', 'Q = ' . $C . ' µF × ' . $V . ' V = ' . ($C * $V) . ' µC.'], 'Q = CV.', 'procedure', 35); },
        static function (MlbRng $r) { $C = $r->pick([2, 4, 10, 20, 50]); $V = $r->int(2, 20);
            return phy_num('A ' . $C . ' µF capacitor is charged to ' . $V . ' V. How much energy does it store, in microjoules?', mlb_dec($C * $V * $V / 2), 'µJ',
                ['E = ½CV².', 'E = ½ × ' . $C . ' × ' . $V . '² = ' . mlb_dec($C * $V * $V / 2) . ' µJ.'], 'E = ½CV².', 'procedure', 45); },
        static function (MlbRng $r) { $a = $r->int(2, 20); $b = $r->int(2, 20); $c = $r->int(1, 10);
            return phy_num('Capacitors of ' . $a . ' µF, ' . $b . ' µF and ' . $c . ' µF are connected in PARALLEL. What is the total capacitance?', $a + $b + $c, 'µF',
                ['In parallel, capacitances add (the opposite of resistors).', $a . ' + ' . $b . ' + ' . $c . ' = ' . ($a + $b + $c) . ' µF.'], 'Parallel capacitors: add.', 'procedure', 35); },
    ],
    'PH-057' => [
        static function (MlbRng $r) { $B = $r->pick([0.1, 0.2, 0.25, 0.4, 0.5]); $I = $r->int(1, 10); $L = $r->pick([0.05, 0.1, 0.2, 0.5]);
            return phy_num('A wire ' . mlb_dec($L) . ' m long carries ' . $I . ' A at right angles to a magnetic field of ' . mlb_dec($B) . ' T. What force acts on it?', mlb_dec($B * $I * $L), 'N',
                ['F = BIL (field at right angles to the wire).', 'F = ' . mlb_dec($B) . ' × ' . $I . ' × ' . mlb_dec($L) . ' = ' . mlb_dec($B * $I * $L) . ' N.'], 'F = BIL.', 'procedure', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In Fleming’s LEFT-hand rule, what does the FIRST finger point along?', 'The magnetic field (north to south)',
                [['The current', 'The seCond finger is the Current.'], ['The force (motion)', 'The thuMb is the Motion (force).'], ['The voltage', 'Voltage is not part of the rule.']],
                ['Thumb: motion (force). First finger: field. Second finger: current.', 'So the first finger points along the field, from north to south.'], 'First finger = field.', 'concept', 30); },
        static function (MlbRng $r) { $k = $r->pick(['current is doubled', 'field strength is halved', 'wire is made three times as long']);
            $m = ['current is doubled' => 'It doubles', 'field strength is halved' => 'It halves', 'wire is made three times as long' => 'It triples'][$k];
            $all = ['It doubles', 'It halves', 'It triples', 'It stays the same'];
            $wrong = []; foreach ($all as $a) if ($a !== $m) $wrong[] = [$a, 'F = BIL: the force is in direct proportion to each of B, I and L.'];
            return mlb_mcq($r, 'A current-carrying wire sits in a magnetic field. The ' . $k . '. What happens to the force on it?', $m, $wrong,
                ['F = BIL: the force is directly proportional to B, to I and to L.', 'So when the ' . $k . ', the force ' . mb_strtolower(substr($m, 3)) . '.'], 'F = BIL.', 'reasoning', 35); },
    ],
    'PH-058' => [
        static function (MlbRng $r) { $Vp = $r->pick([240, 220, 120]); [$Np, $Ns] = $r->pick([[1000, 50], [1200, 60], [500, 25], [2000, 100], [100, 500], [200, 1000]]);
            return phy_dia(phy_num('A transformer has ' . $Np . ' turns on its primary coil and ' . $Ns . ' turns on its secondary. If ' . $Vp . ' V a.c. is put in, what voltage comes out?', mlb_dec($Vp * $Ns / $Np), 'V',
                ['$\\frac{V_s}{V_p} = \\frac{N_s}{N_p}$.', '$V_s = ' . $Vp . ' \\times \\frac{' . $Ns . '}{' . $Np . '} = ' . mlb_dec($Vp * $Ns / $Np) . '$ V.'], 'Turns ratio = voltage ratio.', 'procedure', 45),
                ['type' => 'phy-transformer', 'np' => $Np, 'ns' => $Ns, 'vp' => $Vp . ' V', 'vs' => '?', 'npDraw' => $Np > $Ns ? 10 : 3, 'nsDraw' => $Np > $Ns ? 3 : 10]); },
        static function (MlbRng $r) { $Vp = 240; $Vs = $r->pick([6, 12, 24, 48]); $Is = $r->pick([1, 2, 4, 5]);
            return phy_num('An ideal transformer steps 240 V down to ' . $Vs . ' V, and the secondary supplies ' . $Is . ' A. What current does the primary take?', mlb_dec($Vs * $Is / $Vp), 'A',
                ['An ideal transformer wastes nothing: power in = power out, $V_pI_p = V_sI_s$.', '$I_p = \\frac{' . $Vs . ' \\times ' . $Is . '}{240} = ' . mlb_dec($Vs * $Is / $Vp) . '$ A.'], 'Power in = power out.', 'challenge', 55); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does a transformer not work on a steady d.c. supply?', 'A steady current makes a steady magnetic field, which induces no voltage',
                [['D.c. is too weak', 'The size of the supply is not the problem.'], ['D.c. flows the wrong way round the core', 'Direction is not the issue: CHANGE is.'], ['The coils would melt', 'They might overheat, but that is not why no voltage is induced.']],
                ['A voltage is induced only when the magnetic field through a coil CHANGES (Faraday’s law).', 'Alternating current makes a constantly changing field; steady d.c. does not.'], 'Induction needs a changing field.', 'reasoning', 40); },
    ],
    'PH-059' => [
        static function (MlbRng $r) { [$sym, $Z, $A] = $r->pick([['C', 6, 14], ['N', 7, 14], ['Na', 11, 23], ['Al', 13, 27], ['U', 92, 238], ['Ra', 88, 226], ['Co', 27, 60], ['Sr', 38, 90]]);
            return phy_num('A nucleus of ' . $sym . ' has proton (atomic) number ' . $Z . ' and nucleon (mass) number ' . $A . '. How many neutrons does it have?', $A - $Z, '',
                ['Nucleons = protons + neutrons.', 'Neutrons = ' . $A . ' − ' . $Z . ' = ' . ($A - $Z) . '.'], 'Mass number minus atomic number.', 'procedure', 35); },
        static function (MlbRng $r) { $Z = $r->int(84, 94); $A = $r->int(210, 240); $alpha = $r->int(0, 1) === 1;
            $Z2 = $alpha ? $Z - 2 : $Z + 1; $A2 = $alpha ? $A - 4 : $A;
            return mlb_mcq($r, 'A nucleus with Z = ' . $Z . ' and A = ' . $A . ' emits ' . ($alpha ? 'an alpha particle' : 'a beta particle') . '. What are the new Z and A?', 'Z = ' . $Z2 . ', A = ' . $A2,
                [[$alpha ? 'Z = ' . ($Z + 1) . ', A = ' . $A : 'Z = ' . ($Z - 2) . ', A = ' . ($A - 4), $alpha ? 'That is beta decay.' : 'That is alpha decay.'],
                 ['Z = ' . ($Z - 4) . ', A = ' . ($A - 2), 'The 4 and the 2 are swapped: an alpha particle takes 2 protons and 4 nucleons.'],
                 ['Z = ' . ($Z - 1) . ', A = ' . $A, 'In beta decay a neutron becomes a PROTON, so Z goes up.']],
                ['Alpha (a helium nucleus): Z − 2, A − 4. Beta (an electron from the nucleus): Z + 1, A unchanged.', ($alpha ? 'Alpha' : 'Beta') . ': Z = ' . $Z2 . ', A = ' . $A2 . '.'], 'What does each particle carry away?', 'procedure', 45); },
        static function (MlbRng $r) { $q = $r->pick(['most penetrating', 'most ionising', 'stopped by a sheet of paper']);
            $right = ['most penetrating' => 'Gamma rays', 'most ionising' => 'Alpha particles', 'stopped by a sheet of paper' => 'Alpha particles'][$q];
            $wrong = $right === 'Gamma rays'
                ? [['Alpha particles', 'Alpha is stopped by paper: the LEAST penetrating.'], ['Beta particles', 'Beta is stopped by a few mm of aluminium.']]
                : [['Gamma rays', 'Gamma ionises weakly and passes through paper easily.'], ['Beta particles', 'Beta ionises less than alpha and passes through paper.']];
            $wrong[] = ['X-rays', 'X-rays are not one of the three radiations from the nucleus.'];
            return mlb_mcq($r, 'Which nuclear radiation is ' . $q . '?', $right, $wrong,
                ['Alpha: heavy, highly ionising, stopped by paper. Beta: stopped by aluminium. Gamma: highly penetrating, needs thick lead.', $right . '.'], 'Paper, aluminium, lead.', 'concept', 30); },
    ],
    'PH-060' => [
        static function (MlbRng $r) { $N0 = $r->pick([80, 160, 320, 640, 1000, 1600]); $n = $r->int(1, 4);
            return phy_dia(phy_num('A sample contains ' . $N0 . ' mg of a radioactive isotope. How much is left after ' . $n . ' half-li' . ($n > 1 ? 'ves' : 'fe') . '?', mlb_dec($N0 / 2 ** $n), 'mg',
                ['Each half-life halves what is left.', $N0 . ' × (½)^' . $n . ' = ' . mlb_dec($N0 / 2 ** $n) . ' mg.'], 'Halve it once for each half-life.', 'procedure', 40), ['type' => 'phy-decay', 'n0' => $N0 . ' mg']); },
        static function (MlbRng $r) { $T = $r->pick([2, 3, 5, 6, 8, 10, 12, 30]); $n = $r->int(2, 5); $unit = $r->pick(['days', 'years', 'hours']);
            return phy_num('An isotope has a half-life of ' . $T . ' ' . $unit . '. How long does it take for its activity to fall to 1/' . (2 ** $n) . ' of the start?', $T * $n, $unit,
                ['1/' . (2 ** $n) . ' = (½)^' . $n . ': that is ' . $n . ' half-lives.', $n . ' × ' . $T . ' = ' . ($T * $n) . ' ' . $unit . '.'], 'How many halvings make 1/' . (2 ** $n) . '?', 'application', 45); },
        static function (MlbRng $r) { $n = $r->int(2, 5); $t = $r->pick([4, 6, 8, 10, 12, 20, 24]) * $n;
            return phy_num('The activity of a sample falls to 1/' . (2 ** $n) . ' of its first value in ' . $t . ' minutes. What is its half-life?', mlb_dec($t / $n), 'min',
                ['1/' . (2 ** $n) . ' means ' . $n . ' half-lives have passed.', 'Half-life = ' . $t . ' ÷ ' . $n . ' = ' . mlb_dec($t / $n) . ' min.'], 'Count the halvings.', 'application', 45); },
    ],
    ];
}

/* ═══ Stage 7 — Waves, Fields and Heat Transfer ═══ */
function phy_forms_7(): array {
    return [
    'PH-061' => [
        static function (MlbRng $r) {
            $rows = [['Heat from the Sun reaching the Earth through space', 'Radiation', 'Space is a vacuum: no particles to conduct or carry heat — only radiation crosses it.'],
                     ['A metal spoon in hot tea getting hot at the handle', 'Conduction', 'Heat passes particle to particle along the solid metal.'],
                     ['A cool breeze from the sea on a hot afternoon', 'Convection', 'Warm air over the land rises and cooler sea air flows in to replace it.'],
                     ['Water at the bottom of a pot heating the water at the top', 'Convection', 'Warm water rises and cooler water sinks: a convection current.']];
            [$x, $right, $why] = $r->pick($rows);
            $all = ['Conduction' => 'Conduction needs particles in contact passing on energy, mostly in solids.', 'Convection' => 'Convection is a FLUID moving and carrying the heat with it.', 'Radiation' => 'Radiation is infrared waves; it needs no material at all.'];
            $wrong = []; foreach ($all as $k => $w) if ($k !== $right) $wrong[] = [$k, $w];
            $wrong[] = ['Evaporation', 'Evaporation is a change of state, not a way heat travels.'];
            return mlb_mcq($r, 'How is heat mainly transferred here: ' . mb_strtolower(mb_substr($x, 0, 1)) . mb_substr($x, 1) . '?', $right, $wrong, [$why, 'So this is ' . mb_strtolower($right) . '.'], 'Solid, fluid moving, or no material at all?', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why are the inner walls of a vacuum flask silvered?', 'To reduce heat lost or gained by radiation',
                [['To reduce heat lost by conduction', 'The VACUUM between the walls stops conduction.'], ['To reduce heat lost by convection', 'The vacuum stops convection too; there is no air to move.'], ['To make the flask stronger', 'Silvering is a thin coat; it is about radiation.']],
                ['A shiny surface is a poor emitter and a poor absorber of radiation, and reflects it back.', 'The vacuum stops conduction and convection; the silvering cuts radiation; the stopper stops convection out of the top.'], 'Which of the three can cross a vacuum?', 'reasoning', 35); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which surface is the best ABSORBER (and the best emitter) of heat radiation?', 'Dull black',
                [['Shiny white', 'Shiny and white reflect most radiation: the poorest absorbers.'], ['Shiny silver', 'Shiny metal reflects radiation; that is why it lines a flask.'], ['Glossy white', 'White reflects; glossy reflects more.']],
                ['Dark, dull (matt) surfaces absorb and emit radiation best.', 'This is why solar water heaters are painted matt black.'], 'Think of a black car on a sunny day.', 'concept', 25); },
    ],
    'PH-062' => [
        static function (MlbRng $r) { $L0 = $r->int(2, 6); $span = $r->pick([10, 20, 25]); $th = $r->int(1, 19) * 5; $Lt = $L0 + $span * $th / 100;
            return phy_num('A liquid-in-glass thermometer has a column ' . $L0 . ' cm long at 0 °C and ' . ($L0 + $span) . ' cm at 100 °C. In warm water the column is ' . mlb_dec($Lt) . ' cm. What is the temperature?', $th, '°C',
                ['$\\theta = \\frac{L_\\theta - L_0}{L_{100} - L_0} \\times 100$.', '$\\theta = \\frac{' . mlb_dec($Lt) . ' - ' . $L0 . '}{' . ($L0 + $span) . ' - ' . $L0 . '} \\times 100 = ' . $th . '$ °C.'], 'How far along the 0–100 range is it?', 'procedure', 55); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does a clinical thermometer have a narrow kink (constriction) just above the bulb?', 'It stops the mercury falling back, so the reading can be taken after it leaves the mouth',
                [['To make the mercury expand faster', 'The bulb’s size and the bore decide that, not the kink.'], ['To measure lower temperatures', 'A clinical thermometer only reads about 35–42 °C.'], ['To protect the glass from breaking', 'It is about keeping the reading, not strength.']],
                ['When the thermometer is taken out, the mercury in the bulb contracts.', 'The thread breaks at the constriction and the column above stays put, holding the reading until it is shaken down.'], 'What must not happen after you take it out?', 'reasoning', 35); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why is alcohol, not mercury, used in thermometers for very cold places?', 'Alcohol freezes at a much lower temperature (about −115 °C)',
                [['Alcohol is cheaper', 'Price is not the physics reason.'], ['Alcohol boils at a higher temperature', 'Alcohol boils at about 78 °C, LOWER than mercury.'], ['Mercury is not a liquid below 0 °C', 'Mercury stays liquid down to about −39 °C, but no lower.']],
                ['Mercury freezes at −39 °C, so it fails in polar cold.', 'Alcohol stays liquid down to about −115 °C.'], 'What happens to mercury below −39 °C?', 'concept', 30); },
    ],
    'PH-063' => [
        static function (MlbRng $r) { $d = $r->int(5, 60);
            return phy_num('On a vibrating string, neighbouring nodes are ' . $d . ' cm apart. What is the wavelength of the wave?', 2 * $d, 'cm',
                ['In a stationary wave, the distance between neighbouring nodes is HALF a wavelength.', 'λ = 2 × ' . $d . ' = ' . (2 * $d) . ' cm.'], 'Node to node is λ/2.', 'concept', 35); },
        static function (MlbRng $r) { $L = $r->pick([0.25, 0.4, 0.5, 0.6, 0.8, 1.0]); $v = $r->int(10, 50) * 10;
            return phy_num('A string ' . mlb_dec($L) . ' m long is fixed at both ends, and waves travel along it at ' . $v . ' m/s. What is its fundamental frequency?', mlb_rd($v / (2 * $L), 1), 'Hz',
                ['In the fundamental mode the string is ONE loop: L = λ/2, so λ = 2L.', 'f = v ÷ λ = ' . $v . ' ÷ ' . mlb_dec(2 * $L) . ' = ' . mlb_rd($v / (2 * $L), 1) . ' Hz.'], 'One loop is half a wavelength.', 'procedure', 50, 1); },
        static function (MlbRng $r) { $v = $r->int(4, 30) * 10; $mu = $r->pick([0.001, 0.002, 0.005, 0.01]); $T = $v * $v * $mu;
            return phy_num('A string has a mass per unit length of ' . mlb_dec($mu) . ' kg/m and is under a tension of ' . mlb_dec($T) . ' N. How fast do waves travel along it?', $v, 'm/s',
                ['$v = \\sqrt{\\frac{T}{\\mu}}$.', '$v = \\sqrt{\\frac{' . mlb_dec($T) . '}{' . mlb_dec($mu) . '}} = \\sqrt{' . ($v * $v) . '} = ' . $v . '$ m/s.'], 'Tighter or lighter string: faster waves.', 'procedure', 50); },
    ],
    'PH-064' => [
        static function (MlbRng $r) { $L = $r->pick([0.17, 0.25, 0.34, 0.5, 0.85]); $v = 340;
            return phy_num('A pipe closed at one end is ' . mlb_dec($L) . ' m long. If sound travels at 340 m/s, what is its fundamental frequency?', mlb_rd($v / (4 * $L), 1), 'Hz',
                ['A closed pipe’s fundamental has a node at the closed end and an antinode at the open end: L = λ/4.', 'λ = 4L = ' . mlb_dec(4 * $L) . ' m, so f = 340 ÷ ' . mlb_dec(4 * $L) . ' = ' . mlb_rd($v / (4 * $L), 1) . ' Hz.'], 'Closed pipe: a quarter wavelength fits.', 'procedure', 55, 1, ['diagram' => ['type' => 'phy-pipe', 'closed' => true, 'L' => mlb_dec($L) . ' m']]); },
        static function (MlbRng $r) { $L = $r->pick([0.17, 0.25, 0.34, 0.5, 0.85]);
            return phy_num('A pipe OPEN at both ends is ' . mlb_dec($L) . ' m long. If sound travels at 340 m/s, what is its fundamental frequency?', mlb_rd(340 / (2 * $L), 1), 'Hz',
                ['An open pipe has antinodes at both ends: L = λ/2.', 'λ = 2L = ' . mlb_dec(2 * $L) . ' m, so f = 340 ÷ ' . mlb_dec(2 * $L) . ' = ' . mlb_rd(340 / (2 * $L), 1) . ' Hz.'], 'Open pipe: half a wavelength fits.', 'procedure', 55, 1, ['diagram' => ['type' => 'phy-pipe', 'closed' => false, 'L' => mlb_dec($L) . ' m']]); },
        static function (MlbRng $r) { $f1 = $r->int(200, 500); $b = $r->int(2, 8); $up = $r->int(0, 1) === 1;
            return phy_num('Two tuning forks of ' . $f1 . ' Hz and ' . ($up ? $f1 + $b : $f1 - $b) . ' Hz are sounded together. How many beats are heard each second?', $b, 'Hz',
                ['The beat frequency is the DIFFERENCE of the two frequencies.', '|' . $f1 . ' − ' . ($up ? $f1 + $b : $f1 - $b) . '| = ' . $b . ' beats per second.'], 'Subtract.', 'procedure', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'In a resonance-tube experiment with a pipe closed at one end, the lowest resonant frequency is f₁. What is the NEXT resonant frequency?', '3f₁',
                [['2f₁', 'A closed pipe has only ODD harmonics: there is no 2f₁.'], ['4f₁', 'Closed pipes go 1, 3, 5 …'], ['f₁/2', 'Higher resonances have higher frequencies.']],
                ['A closed pipe fits ¼λ, ¾λ, 5/4λ…: the frequencies are f₁, 3f₁, 5f₁ …', 'So the next one is 3f₁.'], 'Which harmonics can a closed pipe make?', 'reasoning', 40); },
    ],
    'PH-065' => [
        static function (MlbRng $r) { $vs = $r->pick([10, 20, 30, 40]); $f = $r->int(20, 60) * 10; $toward = $r->int(0, 1) === 1; $v = 340;
            $fp = $toward ? $f * $v / ($v - $vs) : $f * $v / ($v + $vs);
            return phy_num('An ambulance siren sounds at ' . $f . ' Hz. It moves at ' . $vs . ' m/s ' . ($toward ? 'TOWARDS' : 'AWAY FROM') . ' a person standing still. What frequency does the person hear? (sound: 340 m/s)', mlb_rd($fp, 1), 'Hz',
                ['$f\' = f \\times \\frac{v}{v ' . ($toward ? '-' : '+') . ' v_s}$ (the source moving ' . ($toward ? 'towards' : 'away') . ' squeezes ' . ($toward ? 'together' : 'apart') . ' the waves).', '$f\' = ' . $f . ' \\times \\frac{340}{' . ($toward ? 340 - $vs : 340 + $vs) . '} = ' . mlb_rd($fp, 1) . '$ Hz.'], $toward ? 'Coming closer: higher.' : 'Going away: lower.', 'application', 60, 1); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A motorbike passes you with its horn sounding. What do you hear?', 'A higher note as it comes, a lower note as it goes',
                [['The same note all the time', 'The motion of the source changes the note you hear: the Doppler effect.'], ['A lower note as it comes, a higher note as it goes', 'It is the other way round: waves bunch up in front of a moving source.'], ['The note gets louder but never changes pitch', 'Loudness changes too, but so does the pitch.']],
                ['In front of a moving source the waves are squashed together (shorter λ, higher f); behind it they are stretched out.', 'So the pitch drops as it passes.'], 'Are the waves bunched up or spread out?', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Light from a distant galaxy is red-shifted (its wavelengths are longer than expected). What does this tell us?', 'The galaxy is moving away from us',
                [['The galaxy is moving towards us', 'Moving towards us would SHORTEN the wavelengths (blue-shift).'], ['The galaxy is very hot', 'Temperature changes the colour mix, not the shift of known spectral lines.'], ['The galaxy is very small', 'Size does not shift spectral lines.']],
                ['A source moving away stretches its waves: longer wavelength, towards the red.', 'Red-shift of distant galaxies is the evidence that the universe is expanding.'], 'Stretched or squeezed?', 'reasoning', 35); },
    ],
    'PH-066' => [
        static function (MlbRng $r) { $E = $r->pick([70, 100, 120, 200, 210]); $L = $r->pick([1, 2, 2.5, 3]); $A = $r->pick([0.5, 1, 2]); $e = $r->pick([0.5, 1, 1.5, 2]); $F = $E * $A * $e / $L;
            return phy_num('A wire ' . mlb_dec($L) . ' m long with a cross-section of ' . mlb_dec($A) . ' mm² stretches by ' . mlb_dec($e) . ' mm under a force of ' . mlb_dec($F) . ' N. What is its Young’s modulus, in GPa?', mlb_dec($E), 'GPa',
                ['$E = \\frac{\\text{stress}}{\\text{strain}} = \\frac{F/A}{e/L} = \\frac{FL}{Ae}$.', 'With A in mm² and e in mm, the powers of ten give GPa directly: $\\frac{' . mlb_dec($F) . ' \\times ' . mlb_dec($L) . '}{' . mlb_dec($A) . ' \\times ' . mlb_dec($e) . '} = ' . mlb_dec($E) . '$ GPa.'], 'Stress ÷ strain.', 'challenge', 75); },
        static function (MlbRng $r) { $L = $r->pick([1, 2, 2.5, 4]); $e = $r->pick([0.5, 1, 2, 4]);
            return phy_num('A wire ' . mlb_dec($L) . ' m long stretches by ' . mlb_dec($e) . ' mm. What is the strain, in units of 10⁻³?', mlb_dec($e / $L), '× 10⁻³',
                ['Strain = extension ÷ original length (no unit).', mlb_dec($e) . ' mm ÷ ' . mlb_dec($L * 1000) . ' mm = ' . mlb_dec($e / ($L * 1000)) . ' = ' . mlb_dec($e / $L) . ' × 10⁻³.'], 'Same units top and bottom.', 'procedure', 45); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Two wires of the same steel and length are pulled with the same force. Wire B is twice as thick (twice the diameter) as wire A. How does B’s extension compare?', 'It is a quarter of A’s',
                [['It is half of A’s', 'Twice the DIAMETER means four times the AREA.'], ['It is the same', 'A thicker wire spreads the force over more area: less stress, less stretch.'], ['It is twice A’s', 'A thicker wire stretches LESS.']],
                ['$e = \\frac{FL}{AE}$: the extension is inversely proportional to the area.', 'Area ∝ diameter², so twice the diameter is 4 × the area and ¼ of the extension.'], 'Area goes as diameter squared.', 'reasoning', 45); },
    ],
    'PH-067' => [
        static function (MlbRng $r) { $k = $r->pick([1, 2, 3, 4]);
            return phy_num('g at the Earth’s surface is 10 N/kg. What is g at a height of ' . ($k === 1 ? 'one Earth radius' : $k . ' Earth radii') . ' above the surface?', mlb_rd(10 / (($k + 1) ** 2), 3), 'N/kg',
                ['Gravity falls as 1/r², with r measured from the Earth’s CENTRE.', 'r = ' . ($k + 1) . 'R, so g = 10 ÷ ' . ($k + 1) . '² = ' . mlb_rd(10 / (($k + 1) ** 2), 3) . ' N/kg.'], 'Measure from the centre.', 'challenge', 50, 3); },
        static function (MlbRng $r) { $v = $r->pick([5, 6, 7, 7.5, 8]); $GM = 4.0e14; $rad = $GM / ($v * 1000) ** 2;
            return phy_num('A satellite circles the Earth (GM = 4.0 × 10¹⁴ m³/s²) at ' . mlb_dec($rad / 1e6) . ' × 10⁶ m from the Earth’s centre. What is its orbital speed, in km/s?', mlb_dec($v), 'km/s',
                ['Gravity provides the centripetal force: $\\frac{GMm}{r^2} = \\frac{mv^2}{r}$, so $v = \\sqrt{\\frac{GM}{r}}$.', '$v = \\sqrt{\\frac{4.0 \\times 10^{14}}{' . mlb_dec($rad / 1e6) . ' \\times 10^6}} = ' . mlb_dec($v * 1000) . '$ m/s = ' . mlb_dec($v) . ' km/s.'], 'Gravity is the centripetal force.', 'challenge', 75); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A geostationary satellite stays above the same point on the equator. What is its period?', '24 hours',
                [['12 hours', 'It must turn with the Earth, which takes a full day.'], ['90 minutes', 'That is a LOW orbit, like the space station’s.'], ['It does not orbit at all', 'It is falling round the Earth at exactly the Earth’s rate of turning.']],
                ['To stay over one spot it must go round once while the Earth turns once.', 'So its period is 24 hours (more exactly 23 h 56 min), at about 36 000 km up.'], 'It keeps pace with the Earth.', 'concept', 30); },
    ],
    'PH-068' => [
        static function (MlbRng $r) { $q1 = $r->int(1, 6); $q2 = $r->int(1, 6); $d = $r->pick([3, 5, 6, 10, 15, 30]);
            $F = 90 * $q1 * $q2 / ($d * $d);
            return phy_num('Two charges of ' . $q1 . ' µC and ' . $q2 . ' µC are ' . $d . ' cm apart in air. What force does each exert on the other? (k = 9 × 10⁹ N m²/C²)', mlb_rd($F, 2), 'N',
                ['$F = \\frac{kq_1q_2}{r^2}$ with q in C and r in m.', '$F = \\frac{9 \\times 10^9 \\times ' . $q1 . ' \\times 10^{-6} \\times ' . $q2 . ' \\times 10^{-6}}{(' . mlb_dec($d / 100) . ')^2} = ' . mlb_rd($F, 2) . '$ N.'], 'Change µC to C and cm to m first.', 'challenge', 70, 2); },
        static function (MlbRng $r) { $q = $r->int(1, 9); $E = $r->int(2, 50) * 100;
            return phy_num('A charge of ' . $q . ' µC sits in an electric field of ' . $E . ' N/C. What force acts on it, in millinewtons?', mlb_dec($q * $E / 1000), 'mN',
                ['F = qE.', $q . ' × 10⁻⁶ × ' . $E . ' = ' . mlb_dec($q * $E / 1e6) . ' N = ' . mlb_dec($q * $E / 1000) . ' mN.'], 'F = qE.', 'procedure', 40); },
        static function (MlbRng $r) { $k = $r->pick([2, 3]);
            return mlb_mcq($r, 'The distance between two charges is made ' . $k . ' times SMALLER. What happens to the force between them?', 'It becomes ' . ($k * $k) . ' times bigger',
                [['It becomes ' . $k . ' times bigger', 'The force goes as 1/r²: square the factor.'], ['It becomes ' . ($k * $k) . ' times smaller', 'Closer charges push or pull HARDER.'], ['It stays the same', 'Distance is in Coulomb’s law.']],
                ['F ∝ 1/r² (an inverse-square law, like gravity).', 'r ÷ ' . $k . ' makes F × ' . ($k * $k) . '.'], 'Inverse square.', 'reasoning', 35); },
    ],
    'PH-069' => [
        static function (MlbRng $r) { $V0 = $r->pick([10, 14.1, 20, 100, 311, 340]);
            return phy_num('An alternating voltage has a peak value of ' . mlb_dec($V0) . ' V. What is its r.m.s. value?', mlb_rd($V0 / sqrt(2), 1), 'V',
                ['For a sine wave, V(r.m.s.) = V₀ ÷ √2 — the steady voltage that would give the same heating.', mlb_dec($V0) . ' ÷ 1.414 = ' . mlb_rd($V0 / sqrt(2), 1) . ' V.'], 'Divide by √2.', 'procedure', 40, 1); },
        static function (MlbRng $r) { $f = $r->pick([50, 60, 100, 500]); $L = $r->pick([0.1, 0.2, 0.5, 1]);
            return phy_num('What is the reactance of a ' . mlb_dec($L) . ' H inductor at ' . $f . ' Hz? (π = 3.14)', mlb_rd(2 * 3.14 * $f * $L, 1), 'Ω',
                ['$X_L = 2\\pi fL$.', '$2 \\times 3.14 \\times ' . $f . ' \\times ' . mlb_dec($L) . ' = ' . mlb_rd(2 * 3.14 * $f * $L, 1) . '$ Ω.'], 'Higher frequency: bigger X_L.', 'procedure', 45, 1); },
        static function (MlbRng $r) { [$R, $X, $Z] = $r->pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20]]); $k = $r->pick([1, 10]);
            return phy_num('A resistor of ' . ($R * $k) . ' Ω and an inductor of reactance ' . ($X * $k) . ' Ω are in series on an a.c. supply. What is the impedance?', $Z * $k, 'Ω',
                ['Resistance and reactance are a quarter-cycle out of step, so they add like perpendicular arrows: $Z = \\sqrt{R^2 + X^2}$.', '$Z = \\sqrt{' . ($R * $k) . '^2 + ' . ($X * $k) . '^2} = ' . ($Z * $k) . '$ Ω.'], 'Pythagoras, not plain addition.', 'challenge', 55); },
    ],
    'PH-070' => [
        static function (MlbRng $r) { $Z = 0.33; $I = $r->pick([0.5, 1, 1.5, 2, 3]); $t = $r->int(2, 30) * 60;
            return phy_num('A current of ' . mlb_dec($I) . ' A passes through copper sulphate solution for ' . ($t / 60) . ' minutes. The electrochemical equivalent of copper is 0.33 mg/C. What mass of copper is deposited, in grams?', mlb_rd($Z * $I * $t / 1000, 3), 'g',
                ['Faraday’s first law: m = ZIt (Z in mg/C, t in seconds).', 'm = 0.33 × ' . mlb_dec($I) . ' × ' . $t . ' = ' . mlb_rd($Z * $I * $t, 1) . ' mg = ' . mlb_rd($Z * $I * $t / 1000, 3) . ' g.'], 'Charge first: Q = It.', 'procedure', 60, 3); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Copper is plated onto a key by electrolysis. Where must the key be placed?', 'As the cathode (connected to the negative terminal)',
                [['As the anode (positive)', 'The anode is where copper DISSOLVES; positive copper ions are attracted to the negative electrode.'], ['Anywhere in the solution, not connected', 'It must be an electrode to receive the ions.'], ['Either electrode works', 'Only the negative electrode attracts the positive copper ions.']],
                ['Copper ions are positive (Cu²⁺), so they move to the negative electrode, the cathode, and are deposited there.', 'So the object to be plated is made the cathode.'], 'Opposite charges attract.', 'concept', 35); },
        static function (MlbRng $r) { $I = $r->pick([1, 2, 4, 5]); $m = $r->pick([0.66, 1.32, 1.98]); $t = $m * 1000 / (0.33 * $I);
            return phy_num('How long must a current of ' . $I . ' A flow to deposit ' . mlb_dec($m) . ' g of copper (Z = 0.33 mg/C)? Give your answer in seconds.', mlb_rd($t, 0), 's',
                ['t = m ÷ (ZI), with m in mg.', mlb_dec($m * 1000) . ' ÷ (0.33 × ' . $I . ') = ' . mlb_rd($t, 0) . ' s.'], 'Rearrange m = ZIt.', 'application', 55, 0); },
    ],
    ];
}

/* ═══ Stage 8 — Modern Physics ═══ (hc = 1240 eV nm; 1 u ↔ 931.5 MeV) */
function phy_forms_8(): array {
    return [
    'PH-071' => [
        static function (MlbRng $r) { $lam = $r->pick([248, 310, 400, 413, 496, 620, 248 * 2]);
            return phy_num('What is the energy of a photon of light of wavelength ' . $lam . ' nm, in electronvolts? (hc = 1240 eV nm)', mlb_rd(1240 / $lam, 2), 'eV',
                ['$E = hf = \\frac{hc}{\\lambda}$.', '$E = \\frac{1240}{' . $lam . '} = ' . mlb_rd(1240 / $lam, 2) . '$ eV.'], 'Shorter wavelength, more energy.', 'procedure', 40, 2); },
        static function (MlbRng $r) { $W = $r->pick([2.0, 2.3, 2.5, 3.0, 4.2, 4.5]); $E = $W + $r->int(2, 30) / 10;
            return phy_num('Photons of energy ' . mlb_dec($E) . ' eV fall on a metal whose work function is ' . mlb_dec($W) . ' eV. What is the maximum kinetic energy of the electrons emitted?', mlb_dec($E - $W), 'eV',
                ['Einstein: photon energy = work function + maximum kinetic energy.', 'KE(max) = ' . mlb_dec($E) . ' − ' . mlb_dec($W) . ' = ' . mlb_dec($E - $W) . ' eV.'], 'hf = W + KE.', 'procedure', 45); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Light is shining on a metal and electrons are being emitted. The light is made BRIGHTER, with its colour unchanged. What happens?', 'More electrons come out each second, with the same maximum energy',
                [['The electrons come out with more energy', 'Each electron gets ONE photon’s energy; brighter means more photons, not bigger ones.'], ['No change at all', 'More photons per second free more electrons per second.'], ['Fewer electrons come out', 'More light frees more, never fewer.']],
                ['Light arrives as photons, each of energy hf.', 'Brighter light = more photons of the same energy: more electrons, same maximum KE. Only a higher frequency raises the KE.'], 'One photon, one electron.', 'reasoning', 40); },
        static function (MlbRng $r) { $W = $r->pick([2.0, 2.48, 3.1, 4.13]);
            return phy_num('A metal has a work function of ' . mlb_dec($W) . ' eV. What is the longest wavelength of light that can free electrons from it? (hc = 1240 eV nm)', mlb_rd(1240 / $W, 0), 'nm',
                ['At the threshold the photon has just enough energy: hc/λ₀ = W.', 'λ₀ = 1240 ÷ ' . mlb_dec($W) . ' = ' . mlb_rd(1240 / $W, 0) . ' nm. Longer wavelengths free none, however bright.'], 'Threshold: photon energy = work function.', 'challenge', 50, 0); },
    ],
    'PH-072' => [
        static function (MlbRng $r) { [$hi, $lo] = $r->pick([[2, 1], [3, 1], [3, 2], [4, 2], [4, 3], [5, 2]]); $E = 13.6 * (1 / ($lo * $lo) - 1 / ($hi * $hi));
            return phy_num('In hydrogen, $E_n = -\\frac{13.6}{n^2}$ eV. What energy does the photon carry when the electron drops from level ' . $hi . ' to level ' . $lo . '?', mlb_rd($E, 2), 'eV',
                ['The photon carries the DIFFERENCE between the two levels.', '$E_' . $hi . ' = ' . mlb_rd(-13.6 / ($hi * $hi), 2) . '$ eV, $E_' . $lo . ' = ' . mlb_rd(-13.6 / ($lo * $lo), 2) . '$ eV; difference ' . mlb_rd($E, 2) . ' eV.'], 'Top level minus bottom level.', 'procedure', 55, 2, ['diagram' => ['type' => 'phy-levels', 'from' => $hi, 'to' => $lo]]); },
        static function (MlbRng $r) { $dE = $r->pick([1.89, 2.55, 2.86, 3.02, 10.2, 12.09]);
            return phy_num('An atom emits a photon as an electron falls through ' . mlb_dec($dE) . ' eV. What is its wavelength? (hc = 1240 eV nm)', mlb_rd(1240 / $dE, 0), 'nm',
                ['λ = hc ÷ ΔE.', '1240 ÷ ' . mlb_dec($dE) . ' = ' . mlb_rd(1240 / $dE, 0) . ' nm.'], 'λ = 1240 / E.', 'procedure', 45, 0); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does each element give out light of only certain exact colours (a line spectrum)?', 'Its electrons can only have certain energies, so only certain energy jumps are possible',
                [['Its atoms are different sizes', 'Size does not pick out exact colours.'], ['It only reflects those colours', 'An emission spectrum is light given OUT, not reflected.'], ['Hot gases always glow white', 'A hot gas glows in sharp lines; a hot solid glows in a continuous spread.']],
                ['Electron energies in an atom are quantised: only certain levels exist.', 'A photon’s energy equals one jump between levels, and E = hf fixes its colour.'], 'Only certain jumps.', 'reasoning', 40); },
    ],
    'PH-073' => [
        static function (MlbRng $r) { $p = $r->pick([1.1, 2.2, 3.3, 6.6, 0.66]);
            return phy_num('A particle has momentum ' . mlb_dec($p) . ' × 10⁻²⁴ kg m/s. What is its de Broglie wavelength, in nanometres? (h = 6.6 × 10⁻³⁴ J s)', mlb_rd(0.66 / $p, 3), 'nm',
                ['$\\lambda = \\frac{h}{p}$.', '$\\frac{6.6 \\times 10^{-34}}{' . mlb_dec($p) . ' \\times 10^{-24}} = ' . mlb_rd(0.66 / $p, 3) . ' \\times 10^{-9}$ m.'], 'λ = h ÷ p.', 'procedure', 50, 3); },
        static function (MlbRng $r) { $k = $r->pick([2, 3, 4]);
            return mlb_mcq($r, 'An electron is made to move ' . $k . ' times as fast. What happens to its de Broglie wavelength?', 'It becomes ' . $k . ' times shorter',
                [['It becomes ' . $k . ' times longer', 'λ = h/p: more momentum, SHORTER wavelength.'], ['It becomes ' . ($k * $k) . ' times shorter', 'λ depends on momentum, which is proportional to speed (at ordinary speeds), not its square.'], ['It does not change', 'The wavelength depends on the momentum.']],
                ['λ = h/(mv).', 'Multiplying v by ' . $k . ' divides λ by ' . $k . '. (That is why fast electrons in a microscope see finer detail.)'], 'λ ∝ 1/v.', 'reasoning', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Which experiment showed that electrons behave as waves?', 'Electrons passing through a crystal make a diffraction pattern',
                [['Electrons are deflected by a magnet', 'That shows they are charged particles, not waves.'], ['Light frees electrons from a metal', 'That (the photoelectric effect) shows LIGHT behaving as particles.'], ['Electrons have a fixed charge', 'Charge says nothing about waves.']],
                ['Diffraction and interference are what waves do.', 'Electron diffraction by crystals (Davisson and Germer, G. P. Thomson) showed electrons do it too.'], 'What only waves do.', 'concept', 35); },
    ],
    'PH-074' => [
        static function (MlbRng $r) { $E1 = $r->pick([0.5, 1, 1.5, 2, 4]); $n = $r->int(2, 5);
            return phy_num('A particle trapped in a box has ground-state energy E₁ = ' . mlb_dec($E1) . ' eV. The allowed energies are Eₙ = n²E₁. What is E' . ['', '₁', '₂', '₃', '₄', '₅'][$n] . '?', mlb_dec($n * $n * $E1), 'eV',
                ['The box only allows standing waves with nodes at the walls: L = nλ/2.', 'Energy grows as n²: E = ' . $n . '² × ' . mlb_dec($E1) . ' = ' . mlb_dec($n * $n * $E1) . ' eV.'], 'Square the level number.', 'procedure', 45, null, ['diagram' => ['type' => 'phy-box', 'n' => $n]]); },
        static function (MlbRng $r) { $E1 = $r->pick([0.5, 1, 2, 4]);
            return phy_num('A particle in a box has E₁ = ' . mlb_dec($E1) . ' eV (and Eₙ = n²E₁). It drops from n = 2 to n = 1. What is the wavelength of the photon emitted? (hc = 1240 eV nm)', mlb_rd(1240 / (3 * $E1), 1), 'nm',
                ['Step 1: E₂ − E₁ = 4E₁ − E₁ = 3E₁ = ' . mlb_dec(3 * $E1) . ' eV.', 'Step 2: λ = hc ÷ ΔE = 1240 ÷ ' . mlb_dec(3 * $E1) . ' = ' . mlb_rd(1240 / (3 * $E1), 1) . ' nm.'], 'Find the energy jump first.', 'challenge', 70, 1); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A particle is trapped in a box, which is then made TWICE as wide. What happens to its ground-state energy?', 'It falls to a quarter',
                [['It halves', 'E₁ = h²/(8mL²): it goes as 1/L².'], ['It doubles', 'A wider box allows LONGER waves, which carry less energy.'], ['It stays the same', 'The box size sets the allowed wavelengths.']],
                ['The ground state fits half a wavelength: λ = 2L, so p = h/λ = h/(2L).', 'E = p²/2m = h²/(8mL²): doubling L divides E by 4.'], 'Longer wave, less momentum, less energy.', 'reasoning', 45); },
    ],
    'PH-075' => [
        static function (MlbRng $r) { $m = $r->int(1, 9);
            return phy_num('How much energy is equivalent to ' . $m . ' g of mass? Give the answer in units of 10¹³ J. (c = 3 × 10⁸ m/s)', 9 * $m, '× 10¹³ J',
                ['E = mc², with m in kilograms.', $m . ' g = ' . mlb_dec($m / 1000) . ' kg: E = ' . mlb_dec($m / 1000) . ' × (3 × 10⁸)² = ' . (9 * $m) . ' × 10¹³ J.'], 'Change grams to kilograms.', 'procedure', 45); },
        static function (MlbRng $r) { $dm = $r->pick([0.002, 0.005, 0.01, 0.0189, 0.03]);
            return phy_num('In a nuclear reaction the products have ' . mlb_dec($dm) . ' u less mass than what went in. How much energy is released, in MeV? (1 u ↔ 931.5 MeV)', mlb_rd($dm * 931.5, 2), 'MeV',
                ['The missing mass becomes energy: E = Δm c².', mlb_dec($dm) . ' × 931.5 = ' . mlb_rd($dm * 931.5, 2) . ' MeV.'], 'Mass defect × 931.5.', 'procedure', 45, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why does the Sun lose about 4 million tonnes of mass every second?', 'It turns mass into the energy it radiates (E = mc²)',
                [['Its gas escapes into space as wind', 'There is a solar wind, but it carries far less; the main loss is mass turned into energy.'], ['It is burning like a fire', 'Burning (chemical) would have used it up in thousands of years; fusion turns mass to energy.'], ['Its gravity is weakening', 'Gravity does not destroy mass.']],
                ['In fusion, four hydrogen nuclei become one helium nucleus with a little less mass.', 'That missing mass is released as energy: E = mc², which is why the Sun shines.'], 'E = mc².', 'reasoning', 40); },
    ],
    'PH-076' => [
        static function (MlbRng $r) { [$A, $BE] = $r->pick([[4, 28.3], [12, 92.2], [16, 127.6], [56, 492.3], [238, 1801.7]]);
            return phy_num('A nucleus with ' . $A . ' nucleons has a binding energy of ' . mlb_dec($BE) . ' MeV. What is its binding energy per nucleon?', mlb_rd($BE / $A, 2), 'MeV',
                ['Binding energy per nucleon = total binding energy ÷ number of nucleons.', mlb_dec($BE) . ' ÷ ' . $A . ' = ' . mlb_rd($BE / $A, 2) . ' MeV per nucleon.'], 'Share it among the nucleons.', 'procedure', 40, 2); },
        static function (MlbRng $r) { $f = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'Which describes nuclear ' . ($f ? 'FISSION' : 'FUSION') . '?', $f ? 'A heavy nucleus splits into two smaller ones' : 'Two light nuclei join to make a heavier one',
                [[$f ? 'Two light nuclei join to make a heavier one' : 'A heavy nucleus splits into two smaller ones', 'That is ' . ($f ? 'fusion' : 'fission') . '.'], ['An electron is given out by the nucleus', 'That is beta decay.'], ['Atoms join by sharing electrons', 'That is a chemical bond, not a nuclear change.']],
                ['Both release energy because the products are more tightly bound (higher binding energy per nucleon).', ($f ? 'Fission powers nuclear power stations: uranium splits.' : 'Fusion powers the Sun: hydrogen joins to make helium.')], 'Split or join?', 'concept', 30); },
        static function (MlbRng $r) { $n = $r->pick([1e20, 2e20, 5e20]); $E = 200;
            return phy_num('Each fission of uranium-235 releases about 200 MeV. How much energy is released when ' . (['1e+20' => '1 × 10²⁰', '2e+20' => '2 × 10²⁰', '5e+20' => '5 × 10²⁰'][sprintf('%.0e', $n)]) . ' nuclei split, in megajoules? (1 MeV = 1.6 × 10⁻¹³ J)', mlb_dec($n * $E * 1.6e-13 / 1e6), 'MJ',
                ['Total = number × energy per fission = ' . (['1e+20' => '1 × 10²⁰', '2e+20' => '2 × 10²⁰', '5e+20' => '5 × 10²⁰'][sprintf('%.0e', $n)]) . ' × 200 MeV.', '× 1.6 × 10⁻¹³ J/MeV = ' . mlb_dec($n * $E * 1.6e-13) . ' J = ' . mlb_dec($n * $E * 1.6e-13 / 1e6) . ' MJ.'], 'MeV to joules.', 'challenge', 70); },
    ],
    'PH-077' => [
        static function (MlbRng $r) { $V = $r->pick([3, 5, 6, 9, 12]); $R = $r->pick([100, 220, 330, 470, 1000]);
            return phy_num('A silicon diode (forward voltage 0.7 V) and a ' . $R . ' Ω resistor are in series with a ' . $V . ' V battery, the diode forward-biased. What current flows, in milliamperes?', mlb_rd(($V - 0.7) / $R * 1000, 2), 'mA',
                ['The diode takes about 0.7 V when it conducts; the rest is across the resistor.', 'I = (' . $V . ' − 0.7) ÷ ' . $R . ' = ' . mlb_rd(($V - 0.7) / $R * 1000, 2) . ' mA.'], 'Take the diode’s 0.7 V off first.', 'application', 55, 2); },
        static function (MlbRng $r) { $n = $r->int(0, 1) === 1;
            return mlb_mcq($r, 'Silicon is doped with ' . ($n ? 'phosphorus (5 outer electrons)' : 'boron (3 outer electrons)') . '. What kind of semiconductor results?', $n ? 'n-type: extra free electrons carry the current' : 'p-type: holes carry the current',
                [[$n ? 'p-type: holes carry the current' : 'n-type: extra free electrons carry the current', 'That comes from the other kind of impurity (' . ($n ? '3' : '5') . ' outer electrons).'], ['An insulator', 'Doping makes silicon conduct BETTER.'], ['A metal', 'It is still a semiconductor, just doped.']],
                ['Silicon has 4 outer electrons. A 5-electron atom leaves one spare (n-type); a 3-electron atom leaves a gap, a hole (p-type).', $n ? 'So phosphorus gives n-type.' : 'So boron gives p-type.'], 'One spare, or one missing?', 'concept', 40); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'What is a diode used for in a phone charger?', 'Rectification: letting current through one way only, turning a.c. into d.c.',
                [['Stepping the voltage down', 'That is the transformer’s job.'], ['Storing charge', 'That is a capacitor.'], ['Increasing the current', 'A diode cannot make more current.']],
                ['A diode conducts when forward-biased and blocks when reverse-biased.', 'So it lets only one direction of the a.c. through: rectification.'], 'One-way valve.', 'concept', 30); },
    ],
    'PH-078' => [
        static function (MlbRng $r) { $T = $r->pick([2900, 3000, 4000, 5800, 6000, 10000]);
            return phy_num('A star’s surface is at ' . $T . ' K. At what wavelength does it radiate most strongly? (Wien: λmax T = 2.9 × 10⁻³ m K)', mlb_rd(2.9e6 / $T, 0), 'nm',
                ['λmax = 2.9 × 10⁻³ ÷ T.', '2.9 × 10⁻³ ÷ ' . $T . ' = ' . mlb_rd(2.9e-3 / $T * 1e9, 0) . ' × 10⁻⁹ m.'], 'Hotter: shorter peak wavelength.', 'procedure', 50, 0); },
        static function (MlbRng $r) { $k = $r->pick([2, 3, 1.5]);
            return phy_num('A black body’s kelvin temperature is multiplied by ' . mlb_dec($k) . '. By what factor does the total power it radiates increase? (Stefan: P = σAT⁴)', mlb_rd($k ** 4, 2), '',
                ['P ∝ T⁴.', mlb_dec($k) . '⁴ = ' . mlb_rd($k ** 4, 2) . '.'], 'Fourth power.', 'reasoning', 40, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A piece of iron is heated: it glows dull red, then orange, then yellow-white. Why does the colour change?', 'Hotter bodies radiate most strongly at shorter wavelengths (Wien’s law)',
                [['The iron is melting', 'The colour changes well before it melts.'], ['It is reflecting the flame', 'It glows on its own, in the dark too.'], ['Hotter bodies give out longer wavelengths', 'The peak moves to SHORTER wavelengths as T rises.']],
                ['λmax ∝ 1/T: as T rises, the peak moves from infrared through red towards blue.', 'So the glow goes red → orange → yellow → white.'], 'Where is the peak?', 'concept', 35); },
    ],
    'PH-079' => [
        static function (MlbRng $r) { $kV = $r->pick([10, 20, 25, 40, 50, 100]);
            return phy_num('An X-ray tube runs at ' . $kV . ' kV. What is the shortest wavelength of the X-rays it produces, in nanometres? (hc = 1240 eV nm)', mlb_rd(1240 / ($kV * 1000), 4), 'nm',
                ['An electron accelerated through V gains eV of energy; the most energetic X-ray photon takes all of it.', 'λmin = 1240 ÷ ' . ($kV * 1000) . ' = ' . mlb_rd(1240 / ($kV * 1000), 4) . ' nm.'], 'All the electron’s energy into one photon.', 'challenge', 55, 4); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why do bones show up clearly on an X-ray photograph?', 'Bone absorbs X-rays much more than soft tissue does',
                [['Bone gives out X-rays', 'Bone does not emit X-rays; it blocks them.'], ['X-rays bounce off bone into the camera', 'X-ray images are shadows, not reflections.'], ['Soft tissue absorbs more than bone', 'It is the reverse: that is why bone looks white.']],
                ['X-rays pass easily through flesh but are absorbed by dense bone.', 'So bone casts a shadow on the film.'], 'A shadow picture.', 'concept', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'How are X-rays produced in an X-ray tube?', 'Fast electrons hit a metal target and suddenly stop',
                [['A hot filament glows very brightly', 'The filament only supplies the electrons.'], ['Radioactive atoms decay', 'That gives gamma rays, not tube X-rays.'], ['A magnet bends light', 'Magnets do not turn light into X-rays.']],
                ['Electrons boiled off a hot filament are accelerated by a high voltage.', 'When they crash into the target (often tungsten), some of their energy comes out as X-ray photons.'], 'Electrons stopping suddenly.', 'concept', 30); },
    ],
    'PH-080' => [
        static function (MlbRng $r) { $g = $r->pick(['AND', 'OR', 'NAND', 'NOR', 'XOR']); $a = $r->int(0, 1); $b = $r->int(0, 1);
            $out = ['AND' => $a & $b, 'OR' => $a | $b, 'NAND' => 1 - ($a & $b), 'NOR' => 1 - ($a | $b), 'XOR' => $a ^ $b][$g];
            return mlb_mcq($r, 'A ' . $g . ' gate has inputs A = ' . $a . ' and B = ' . $b . '. What is its output?', (string)$out,
                [[(string)(1 - $out), ['AND' => 'AND gives 1 only when BOTH inputs are 1.', 'OR' => 'OR gives 1 when EITHER input is 1.', 'NAND' => 'NAND is NOT-AND: it gives 0 only when both are 1.', 'NOR' => 'NOR is NOT-OR: it gives 1 only when both are 0.', 'XOR' => 'XOR gives 1 when the inputs DIFFER.'][$g]],
                 ['It depends on the voltage', 'A logic gate’s output is fixed by its truth table.']],
                ['Write out the truth table: ' . ['AND' => '1 only for 1,1.', 'OR' => '0 only for 0,0.', 'NAND' => '0 only for 1,1.', 'NOR' => '1 only for 0,0.', 'XOR' => '1 when the inputs differ.'][$g], 'For A = ' . $a . ', B = ' . $b . ' the output is ' . $out . '.'], 'Use the truth table.', 'procedure', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A security light should come on only when it is dark AND someone moves. Which gate joins the two sensors?', 'AND',
                [['OR', 'OR would switch on when it is dark even if nobody moves.'], ['NOT', 'NOT has one input only.'], ['NOR', 'NOR gives 1 only when BOTH inputs are 0.']],
                ['Both conditions must be true together.', 'That is exactly an AND gate.'], 'Both together.', 'application', 30); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A NAND gate has both its inputs joined together. What does it now behave as?', 'A NOT gate',
                [['An AND gate', 'With equal inputs AND would just copy the input; NAND inverts it.'], ['An OR gate', 'OR of a signal with itself is the signal; NAND inverts.'], ['It always gives 1', 'Input 1,1 gives 0.']],
                ['With A = B: input 0 → NAND(0,0) = 1; input 1 → NAND(1,1) = 0.', 'Output is always the opposite of the input: NOT.'], 'Try both inputs 0, then both 1.', 'reasoning', 40); },
    ],
    ];
}

/* ═══ Stage 9 — Physics Olympiad: one hard idea, cut into steps ═══ */
function phy_forms_9(): array {
    return [
    'PH-081' => [
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Guess a pendulum’s period from dimensions alone: T = k Lᵃ gᵇ (k a pure number). What are a and b?', 'a = ½, b = −½',
                [['a = 1, b = −1', 'Then T would have units of s², not s: check [L/g] = s².'], ['a = ½, b = ½', 'g in the numerator gives m/s², not s.'], ['a = −½, b = ½', 'That is 1/T: frequency.']],
                ['[T] = s; [L] = m; [g] = m s⁻². So m^a (m s⁻²)^b = s.', 'Metres: a + b = 0; seconds: −2b = 1 → b = −½, a = ½. So T = k√(L/g), and the full theory gives k = 2π.'], 'Match the metres and the seconds separately.', 'challenge', 75); },
        static function (MlbRng $r) { $k = $r->pick([4, 9, 16, 25, 2, 3]);
            return phy_num('From dimensional analysis, the period of a pendulum is proportional to √L. If the pendulum is made ' . $k . ' times longer, by what factor does its period change?', mlb_rd(sqrt($k), 3), '',
                ['T ∝ √L.', '√' . $k . ' = ' . mlb_rd(sqrt($k), 3) . '.'], 'Square root of the factor.', 'reasoning', 40, 3); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'The drag force on a fast-moving ball depends on air density ρ, speed v and cross-section area A: F = k ρᵃ vᵇ Aᶜ. What are a, b and c?', 'a = 1, b = 2, c = 1',
                [['a = 1, b = 1, c = 1', 'Then F would be kg m s⁻¹ ÷ m … check the seconds: you need s⁻².'], ['a = 2, b = 2, c = 1', 'kg appears once in a force, so a = 1.'], ['a = 1, b = 2, c = 2', 'Then the metres do not balance.']],
                ['[F] = kg m s⁻². [ρ] = kg m⁻³, [v] = m s⁻¹, [A] = m².', 'kg: a = 1. s: −b = −2, b = 2. m: −3a + b + 2c = 1 → c = 1. So F ∝ ρv²A: double the speed, four times the drag.'], 'One unit at a time: kg, then s, then m.', 'challenge', 90); },
    ],
    'PH-082' => [
        static function (MlbRng $r) { $L = $r->int(6, 12); $W = $r->int(5, 9); $H = 3;
            return phy_num('Estimate: a classroom is ' . $L . ' m × ' . $W . ' m × ' . $H . ' m. Air has a density of about 1.2 kg/m³. What is the mass of the air in it, to the nearest kilogram?', mlb_rd(1.2 * $L * $W * $H, 0), 'kg',
                ['Volume = ' . $L . ' × ' . $W . ' × ' . $H . ' = ' . ($L * $W * $H) . ' m³.', 'Mass = 1.2 × ' . ($L * $W * $H) . ' ≈ ' . mlb_rd(1.2 * $L * $W * $H, 0) . ' kg — more than the people in it.'], 'Mass = density × volume.', 'application', 50, 0); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Roughly how many times does a human heart beat in a 70-year life?', 'About 3 × 10⁹ (three billion)',
                [['About 3 × 10⁶', 'That is only about one month of beats.'], ['About 3 × 10¹²', 'That would need tens of thousands of beats a second.'], ['About 3 × 10⁴', 'That is less than a day.']],
                ['About 70 beats a minute × 60 × 24 × 365 ≈ 3.7 × 10⁷ beats a year.', '× 70 years ≈ 2.6 × 10⁹: about three billion.'], 'Per minute → per year → per life.', 'reasoning', 60); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'About how many seconds are there in a year, to the nearest power of ten?', '10⁷',
                [['10⁵', 'A day alone has about 10⁵ seconds (86 400).'], ['10⁹', 'That is about 30 years.'], ['10⁶', '10⁶ s is under 12 days.']],
                ['60 × 60 × 24 × 365 ≈ 3.2 × 10⁷ s.', 'So about 10⁷ — "π × 10⁷ s" is a physicist’s rule of thumb.'], 'A day is about 10⁵ s.', 'concept', 40); },
    ],
    'PH-083' => [
        static function (MlbRng $r) { $T1 = $r->pick([1, 2, 10, 27]); $k = $r->pick([4, 9, 2, 1.5]);
            return phy_num('A moon orbits a planet with period ' . $T1 . ' days. A second moon orbits ' . mlb_dec($k) . ' times as far from the planet. What is its period, in days? (Kepler: T² ∝ r³)', mlb_rd($T1 * $k ** 1.5, 2), 'days',
                ['T ∝ r^{3/2}.', 'T₂ = ' . $T1 . ' × ' . mlb_dec($k) . '^{1.5} = ' . mlb_rd($T1 * $k ** 1.5, 2) . ' days.'], 'Cube the distance ratio, then square-root.', 'challenge', 60, 2); },
        static function (MlbRng $r) { $rad = $r->pick([7.0, 8.0, 10.0, 20.0, 42.0]); $GM = 4.0e14; $T = 2 * M_PI * sqrt(($rad * 1e6) ** 3 / $GM) / 3600;
            return phy_num('A satellite orbits ' . mlb_dec($rad) . ' × 10⁶ m from the Earth’s centre (GM = 4.0 × 10¹⁴ m³/s²). What is its period, in hours?', mlb_rd($T, 2), 'h',
                ['Step 1: gravity is the centripetal force, so $v = \\sqrt{GM/r}$.', 'Step 2: $T = \\frac{2\\pi r}{v} = 2\\pi\\sqrt{\\frac{r^3}{GM}} = ' . mlb_rd($T * 3600, 0) . '$ s $= ' . mlb_rd($T, 2) . '$ h.'], 'Find the speed, then one lap.', 'challenge', 90, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Two satellites orbit the Earth in circles, one higher than the other. Which moves faster?', 'The lower one',
                [['The higher one', 'v = √(GM/r): further out, SLOWER.'], ['They move at the same speed', 'Speed depends on the orbit’s radius.'], ['Whichever is heavier', 'The satellite’s own mass cancels out.']],
                ['Gravity provides the centripetal force: GMm/r² = mv²/r → v = √(GM/r).', 'Smaller r, larger v — and a much shorter period.'], 'v = √(GM/r).', 'reasoning', 45); },
    ],
    'PH-084' => [
        static function (MlbRng $r) { $h = $r->pick([0.3, 0.6, 1.2, 2.4, 3]);
            $v = sqrt(4 * PHY_G * $h / 3);
            return phy_num('A solid cylinder rolls without slipping from rest down a slope, dropping ' . mlb_dec($h) . ' m in height. How fast is it moving at the bottom? (I = ½mr², g = 10 m/s²)', mlb_rd($v, 2), 'm/s',
                ['Energy: mgh = ½mv² + ½Iω², and rolling means ω = v/r.', 'With I = ½mr²: mgh = ½mv² + ¼mv² = ¾mv², so $v = \\sqrt{4gh/3} = ' . mlb_rd($v, 2) . '$ m/s — slower than sliding, because some energy spins it.'], 'Part of the energy goes into spinning.', 'challenge', 90, 2); },
        static function (MlbRng $r) { $w1 = $r->pick([2, 3, 4]); $k = $r->pick([2, 3]);
            return phy_num('A skater spins at ' . $w1 . ' turns per second with arms out. Pulling her arms in makes her moment of inertia ' . $k . ' times smaller. How fast does she spin now, in turns per second?', $w1 * $k, 'turns/s',
                ['No outside torque: angular momentum Iω stays the same.', 'I ÷ ' . $k . ' → ω × ' . $k . ' = ' . ($w1 * $k) . ' turns per second.'], 'Iω is conserved.', 'application', 50); },
        static function (MlbRng $r) { $m = $r->pick([2, 4, 5]); $rr = $r->pick([0.1, 0.2, 0.5]); $w = $r->pick([10, 20, 30]); $I = 0.5 * $m * $rr * $rr;
            return phy_num('A ' . $m . ' kg solid disc of radius ' . mlb_dec($rr) . ' m spins at ' . $w . ' rad/s. What is its rotational kinetic energy? (I = ½mr²)', mlb_rd(0.5 * $I * $w * $w, 2), 'J',
                ['I = ½ × ' . $m . ' × ' . mlb_dec($rr) . '² = ' . mlb_dec($I) . ' kg m².', 'KE = ½Iω² = ½ × ' . mlb_dec($I) . ' × ' . $w . '² = ' . mlb_rd(0.5 * $I * $w * $w, 2) . ' J.'], 'The spinning version of ½mv².', 'procedure', 55, 2); },
    ],
    'PH-085' => [
        static function (MlbRng $r) { $B = $r->pick([0.1, 0.2, 0.5]); $L = $r->pick([0.1, 0.2, 0.5]); $v = $r->int(2, 10);
            return phy_num('Step 1 of magnetic braking: a metal rod ' . mlb_dec($L) . ' m long moves at ' . $v . ' m/s across a magnetic field of ' . mlb_dec($B) . ' T. What e.m.f. is induced across it, in millivolts?', mlb_dec($B * $L * $v * 1000), 'mV',
                ['A conductor cutting field lines has an e.m.f. ε = BLv.', mlb_dec($B) . ' × ' . mlb_dec($L) . ' × ' . $v . ' = ' . mlb_dec($B * $L * $v) . ' V = ' . mlb_dec($B * $L * $v * 1000) . ' mV.'], 'ε = BLv.', 'procedure', 50); },
        static function (MlbRng $r) { $B = $r->pick([0.2, 0.5, 1]); $L = $r->pick([0.1, 0.2, 0.5]); $v = $r->int(2, 10); $R = $r->pick([0.01, 0.02, 0.05, 0.1]);
            $F = $B * $B * $L * $L * $v / $R;
            return phy_num('Step 2: the rod (length ' . mlb_dec($L) . ' m, moving at ' . $v . ' m/s in ' . mlb_dec($B) . ' T) is part of a circuit of resistance ' . mlb_dec($R) . ' Ω. The induced current then feels a force from the field. How big is that braking force?', mlb_rd($F, 3), 'N',
                ['Current I = ε/R = BLv/R; the field pushes on it with F = BIL.', '$F = \\frac{B^2L^2v}{R} = ' . mlb_rd($F, 3) . '$ N — and it grows with speed, so it is a drag, opposing the motion (Lenz’s law).'], 'ε → I → F = BIL.', 'challenge', 90, 3); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A copper plate swings like a pendulum between the poles of a strong magnet and stops after a few swings, though copper is not magnetic. Why?', 'Currents induced in the plate (eddy currents) make a force that opposes its motion',
                [['The magnet attracts the copper', 'Copper is not attracted by a magnet at rest.'], ['Air resistance is bigger near a magnet', 'Air does not care about magnets.'], ['The copper becomes magnetised permanently', 'It is not magnetised; currents flow only while it moves.']],
                ['Moving through the field, the plate has e.m.f.s induced in it, driving swirling eddy currents.', 'By Lenz’s law those currents push back against the motion: magnetic braking, used in trains and roller coasters. A plate with slots cut in it barely slows, because the currents cannot circulate.'], 'Moving metal + field → current → force.', 'reasoning', 50); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'A metal ball spins about an axis parallel to a uniform magnetic field. Which is true?', 'Eddy currents flow in it and their magnetic effect slowly brakes the spin',
                [['Nothing happens, as the field is uniform', 'The metal moves through the field, so charges in it feel forces and currents can flow.'], ['The ball speeds up', 'Induced effects always oppose the motion that causes them (Lenz).'], ['The ball becomes a permanent magnet', 'The effect lasts only while it spins.']],
                ['Charges moving with the spinning metal feel a magnetic force qv × B; this drives circulating currents.', 'Those currents dissipate energy as heat, so the spin slows — and they make the ball a small magnet while it turns, which is what a second ball nearby would feel.'], 'Moving conductor + field.', 'challenge', 70); },
    ],
    'PH-086' => [
        static function (MlbRng $r) { $Th = $r->pick([500, 600, 800, 900, 1000]); $Tc = $r->pick([300, 250, 400]);
            return phy_num('What is the maximum (Carnot) efficiency of a heat engine working between ' . $Th . ' K and ' . $Tc . ' K?', mlb_rd((1 - $Tc / $Th) * 100, 1), '%',
                ['$\\eta = 1 - \\frac{T_c}{T_h}$ (kelvin temperatures).', '1 − ' . $Tc . '/' . $Th . ' = ' . mlb_rd(1 - $Tc / $Th, 3) . ' = ' . mlb_rd((1 - $Tc / $Th) * 100, 1) . '%.'], 'Only the temperatures matter.', 'procedure', 45, 1); },
        static function (MlbRng $r) { $Tc = $r->pick([250, 260, 270, 280]); $Th = $r->pick([300, 310]);
            return phy_num('An ideal refrigerator keeps its inside at ' . $Tc . ' K in a ' . $Th . ' K room. What is its best possible coefficient of performance (heat removed per joule of work)?', mlb_rd($Tc / ($Th - $Tc), 2), '',
                ['$COP = \\frac{T_c}{T_h - T_c}$.', $Tc . ' ÷ (' . $Th . ' − ' . $Tc . ') = ' . mlb_rd($Tc / ($Th - $Tc), 2) . '. The colder you go, the harder it gets.'], 'Cold temperature over the difference.', 'challenge', 60, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Why can no refrigerator ever cool something all the way to absolute zero?', 'The work needed per joule of heat removed grows without limit as the cold side nears 0 K',
                [['Fridges are not well enough insulated', 'Even a perfect, ideal refrigerator cannot.'], ['Absolute zero is below the freezing point of every gas', 'That is true, but it is not the reason.'], ['Heat flows from cold to hot by itself', 'It does not: that is why a fridge needs work.']],
                ['COP = Tc/(Th − Tc) → 0 as Tc → 0.', 'So each step colder needs ever more work: absolute zero can be approached but never reached (the third law of thermodynamics).'], 'Look at COP as Tc → 0.', 'reasoning', 60); },
    ],
    'PH-087' => [
        static function (MlbRng $r) { $S = $r->pick([1360, 1370, 1350]); $al = $r->pick([0.3, 0.29, 0.31]);
            return phy_num('Step 1: sunlight brings ' . $S . ' W/m² to the top of the atmosphere. The Earth reflects a fraction ' . mlb_dec($al) . ' of it, and the absorbed power is spread over the whole sphere (4 × the area of the Earth’s disc). How much is absorbed per square metre on average?', mlb_rd($S * (1 - $al) / 4, 1), 'W/m²',
                ['Absorbed per m² of disc: S(1 − albedo) = ' . mlb_rd($S * (1 - $al), 1) . ' W/m².', 'Shared over a sphere, whose area is 4 × the disc’s: ÷ 4 = ' . mlb_rd($S * (1 - $al) / 4, 1) . ' W/m².'], 'Disc catches it; the sphere shares it.', 'challenge', 75, 1); },
        static function (MlbRng $r) { $P = $r->pick([238, 240, 236]);
            $T = ($P / 5.67e-8) ** 0.25;
            return phy_num('Step 2: with no atmosphere, the Earth would radiate away exactly the ' . $P . ' W/m² it absorbs. Using σT⁴ = ' . $P . ' (σ = 5.67 × 10⁻⁸ W/m² K⁴), what would its temperature be, to the nearest kelvin?', mlb_rd($T, 0), 'K',
                ['Balance: σT⁴ = ' . $P . ', so $T = \\left(\\frac{' . $P . '}{5.67 \\times 10^{-8}}\\right)^{1/4}$.', 'T ≈ ' . mlb_rd($T, 0) . ' K ≈ ' . mlb_rd($T - 273, 0) . ' °C — far colder than the real average of about 15 °C.'], 'Fourth root.', 'challenge', 90, 0); },
        static function (MlbRng $r) { $Te = $r->pick([255, 254, 256]);
            return phy_num('Step 3: model the greenhouse effect as one atmospheric layer that absorbs all the ground’s infrared and radiates equally up and down. Then the ground’s temperature is $2^{1/4}$ times the no-atmosphere temperature of ' . $Te . ' K. What is it?', mlb_rd($Te * 2 ** 0.25, 0), 'K',
                ['The layer sends half its radiation back down, so the ground must radiate TWICE the sunlight it absorbs: σT_s⁴ = 2σT_e⁴.', 'T_s = 2^{1/4} × ' . $Te . ' ≈ 1.189 × ' . $Te . ' = ' . mlb_rd($Te * 2 ** 0.25, 0) . ' K: warmer than the real Earth, because the real atmosphere does not absorb all infrared.'], 'Twice the power, fourth-root.', 'challenge', 90, 0); },
    ],
    'PH-088' => [
        static function (MlbRng $r) { $R = $r->pick([10, 20, 47, 100]); $C = $r->pick([10, 22, 47, 100]);
            return phy_num('A ' . $R . ' kΩ resistor and a ' . $C . ' µF capacitor are in series. What is the time constant, in seconds?', mlb_rd($R * $C / 1000, 3), 's',
                ['τ = RC.', $R . ' × 10³ × ' . $C . ' × 10⁻⁶ = ' . mlb_rd($R * $C / 1000, 3) . ' s.'], 'kΩ × µF gives milliseconds.', 'procedure', 45, 3); },
        static function (MlbRng $r) { $V0 = $r->pick([6, 9, 12]); $n = $r->pick([1, 2, 3]);
            return phy_num('A capacitor charged to ' . $V0 . ' V discharges through a resistor. What is its voltage after ' . $n . ' time constant' . ($n > 1 ? 's' : '') . '? ($V = V_0 e^{-t/RC}$)', mlb_rd($V0 * exp(-$n), 2), 'V',
                ['After t = ' . $n . 'RC, V = V₀e^{−' . $n . '}.', $V0 . ' × ' . mlb_rd(exp(-$n), 4) . ' = ' . mlb_rd($V0 * exp(-$n), 2) . ' V. (After one time constant, 37% is left.)'], 'e^{−n}.', 'challenge', 60, 2); },
        static function (MlbRng $r) { $tau = $r->pick([1, 2, 5, 10]);
            return phy_num('A capacitor discharges with time constant ' . $tau . ' s. How long until its charge has halved? (ln 2 = 0.693)', mlb_rd($tau * 0.693, 2), 's',
                ['½ = e^{−t/τ} → t = τ ln 2.', $tau . ' × 0.693 = ' . mlb_rd($tau * 0.693, 2) . ' s — the same idea as a radioactive half-life.'], 'Set e^{−t/τ} = ½.', 'challenge', 60, 2); },
    ],
    'PH-089' => [
        static function (MlbRng $r) { [$b, $g] = $r->pick([[0.6, 1.25], [0.8, 1.6667], [0.28, 1.0417], [0.96, 3.5714]]);
            return phy_num('A spaceship moves at ' . mlb_dec($b) . 'c. What is its Lorentz factor γ = 1/√(1 − v²/c²)? Give 2 decimal places.', mlb_rd(1 / sqrt(1 - $b * $b), 2), '',
                ['1 − ' . mlb_dec($b) . '² = ' . mlb_dec(1 - $b * $b) . '.', 'γ = 1 ÷ √' . mlb_dec(1 - $b * $b) . ' = ' . mlb_rd(1 / sqrt(1 - $b * $b), 2) . '.'], 'Square, subtract from 1, square-root, flip.', 'procedure', 60, 2); },
        static function (MlbRng $r) { [$b, $g] = $r->pick([[0.6, 1.25], [0.8, 5 / 3]]); $t0 = $r->pick([3, 6, 12, 30]);
            return phy_num('A clock on a spaceship moving at ' . mlb_dec($b) . 'c ticks off ' . $t0 . ' minutes. How long does that take as measured on Earth?', mlb_rd($t0 * $g, 2), 'min',
                ['Moving clocks run slow: Δt = γΔt₀.', 'γ = ' . mlb_rd($g, 3) . ', so ' . $t0 . ' × ' . mlb_rd($g, 3) . ' = ' . mlb_rd($t0 * $g, 2) . ' minutes.'], 'Earth sees MORE time.', 'challenge', 60, 2); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Muons made high in the atmosphere live only about 2 µs, yet many reach the ground 10 km below. How?', 'Moving near light speed, their clocks run slow as seen from Earth, so they live much longer for us',
                [['They travel faster than light', 'Nothing with mass reaches the speed of light.'], ['They are made right next to the ground', 'They are made 10–15 km up.'], ['The air pushes them down faster', 'Air only slows them.']],
                ['At 0.998c, γ ≈ 16: a 2 µs life becomes about 32 µs as Earth measures it.', 'In 32 µs at nearly 3 × 10⁸ m/s they cover about 10 km — direct evidence for time dilation.'], 'Time dilation.', 'reasoning', 50); },
    ],
    'PH-090' => [
        static function (MlbRng $r) { $L = $r->pick([0.5, 1, 2]);
            return phy_num('Step 1: an electron in a box of width ' . mlb_dec($L) . ' nm has ground-state energy E₁ = h²/(8mL²) ≈ 0.376/L² eV (L in nm). What is E₁?', mlb_rd(0.376 / ($L * $L), 3), 'eV',
                ['The box allows standing waves with a node at each wall; the longest has λ = 2L.', 'E₁ = 0.376 ÷ ' . mlb_dec($L) . '² = ' . mlb_rd(0.376 / ($L * $L), 3) . ' eV.'], 'Square the width, then divide.', 'challenge', 60, 3, ['diagram' => ['type' => 'phy-box', 'n' => 1]]); },
        static function (MlbRng $r) { $L = $r->pick([0.5, 1, 2]); $E1 = 0.376 / ($L * $L);
            return phy_num('Step 2: in the same box (E₁ = ' . mlb_rd($E1, 3) . ' eV), the electron drops from n = 3 to n = 1. What is the photon’s wavelength? (hc = 1240 eV nm)', mlb_rd(1240 / (8 * $E1), 0), 'nm',
                ['E₃ − E₁ = 9E₁ − E₁ = 8E₁ = ' . mlb_rd(8 * $E1, 3) . ' eV.', 'λ = 1240 ÷ ' . mlb_rd(8 * $E1, 3) . ' = ' . mlb_rd(1240 / (8 * $E1), 0) . ' nm.'], 'Energy jump first, then λ.', 'challenge', 80, 0); },
        static function (MlbRng $r) {
            return mlb_mcq($r, 'Quantum dots are tiny crystals that glow in colours set by their SIZE. Which glows bluer?', 'The smaller dot',
                [['The larger dot', 'A larger box has LOWER energy levels: smaller jumps, redder light.'], ['Both the same', 'The levels depend on the box size.'], ['Neither glows blue', 'Small enough dots do glow blue.']],
                ['Energies go as 1/L²: a smaller dot has more widely spaced levels.', 'Bigger jumps → more energetic photons → shorter (bluer) wavelength. This is used in QLED screens.'], 'Smaller box, bigger gaps.', 'reasoning', 45); },
    ],
    ];
}
