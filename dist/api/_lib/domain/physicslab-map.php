<?php
declare(strict_types=1);

/**
 * Physics Lab — the map (owner, 6 Nov 2026: Physics is the second Lab).
 *
 * Six stages of ten topics, PH-001 … PH-060, on the road a Nigerian learner walks: the measuring,
 * matter and forces of JSS Basic Science, then senior secondary Physics — motion,
 * energy and momentum, heat, waves and light, electricity, magnetism and the atom. This file is the
 * ONE place a Physics topic's id, stage, title, strand and prerequisites are declared; the shared
 * Lab engine (domain/mathslab.php) reads it only through the Lab registry (domain/labs.php).
 *
 * g is taken as 10 m/s² throughout, as senior secondary papers take it. No exam body is named
 * anywhere in this Lab (owner, 6 Nov 2026): the questions are our own, written to the syllabus.
 */

/** Stage number → [stage title, [10 topic titles in order]]. */
function phy_stage_table(): array {
    return [
        1 => ['Measurement and Matter', [
            'Physical quantities and SI units',
            'Prefixes and converting units',
            'Length, area and volume',
            'Mass and weight',
            'Density',
            'Measuring time and reading instruments',
            'The particle model: solids, liquids and gases',
            'Changes of state',
            'Scalars and vectors',
            'Significant figures and errors',
        ]],
        2 => ['Forces and Machines', [
            'Forces and the resultant force',
            'Friction',
            'Springs and Hooke’s law',
            'Pressure in solids',
            'Pressure in liquids and hydraulics',
            'Moments and the principle of moments',
            'Centre of gravity and stability',
            'Simple machines: MA, VR and efficiency',
            'Work',
            'Power',
        ]],
        3 => ['Motion', [
            'Distance, displacement and speed',
            'Velocity and acceleration',
            'Equations of motion: v = u + at',
            'Equations of motion: s and v²',
            'Motion graphs',
            'Free fall',
            'Projectiles',
            'Newton’s first law and inertia',
            'Newton’s second law: F = ma',
            'Newton’s third law and momentum',
        ]],
        4 => ['Energy and Momentum', [
            'Kinetic energy',
            'Gravitational potential energy',
            'Conservation of energy',
            'Efficiency and energy transfers',
            'Impulse and change of momentum',
            'Conservation of momentum',
            'Circular motion',
            'The simple pendulum',
            'Archimedes’ principle and upthrust',
            'Flotation and relative density',
        ]],
        5 => ['Heat, Waves and Light', [
            'Temperature and its scales',
            'Thermal expansion',
            'Specific heat capacity',
            'Latent heat',
            'The gas laws',
            'Waves: speed, frequency and wavelength',
            'Sound and echoes',
            'Reflection and plane mirrors',
            'Refraction and refractive index',
            'Lenses',
        ]],
        6 => ['Electricity, Magnetism and the Atom', [
            'Charge and current',
            'Ohm’s law',
            'Resistors in series and parallel',
            'Electrical power and energy',
            'E.m.f. and internal resistance',
            'Capacitors',
            'Magnetic force on a current',
            'Electromagnetic induction and transformers',
            'The nucleus and radioactive decay',
            'Half-life',
        ]],
        /* Stages 7–8: what senior Physics papers ask most that Stages 1–6 did not yet hold (owner,
           6 Nov 2026, with past papers in hand: waves, fields and heat transfer; then modern physics). */
        7 => ['Waves, Fields and Heat Transfer', [
            'Conduction, convection and radiation',
            'Thermometers and thermometric properties',
            'Stationary waves on strings',
            'Resonance in pipes, and beats',
            'The Doppler effect',
            'Elasticity and Young’s modulus',
            'Gravitational fields and satellites',
            'Electric fields and Coulomb’s law',
            'Alternating current and reactance',
            'Electrolysis and Faraday’s laws',
        ]],
        8 => ['Modern Physics', [
            'Photons and the photoelectric effect',
            'Energy levels and spectra',
            'Matter waves: de Broglie',
            'A particle in a box',
            'Mass and energy: E = mc²',
            'Binding energy, fission and fusion',
            'Semiconductors and diodes',
            'Black-body radiation: Wien and Stefan',
            'X-rays and their uses',
            'Logic gates and simple electronics',
        ]],
        /* Stage 9 — the summit (owner, 6 Nov 2026, with olympiad problems in hand): each problem is one
           hard idea cut into small guided steps, the way olympiad problems are written, so it is tough
           and still within reach. */
        9 => ['Physics Olympiad', [
            'Dimensional analysis',
            'Estimation and orders of magnitude',
            'Orbits and Kepler’s laws',
            'Rotation and moment of inertia',
            'Magnetic braking and eddy currents',
            'Heat engines and refrigerators',
            'Radiation balance and the greenhouse effect',
            'Charging and discharging a capacitor',
            'Special relativity: time dilation',
            'Quantum wells and energy levels',
        ]],
    ];
}

function phy_strands(): array {
    return [1 => 'Measurement & Matter', 2 => 'Forces', 3 => 'Motion', 4 => 'Energy & Momentum', 5 => 'Heat, Waves & Light', 6 => 'Electricity & the Atom',
            7 => 'Waves, Fields & Heat', 8 => 'Modern Physics', 9 => 'Olympiad Physics'];
}

/** The road in four bands — one table: the map, Progress and the hub read it. */
function phy_bands(): array {
    return [
        ['id' => 'phy-basics', 'name' => 'Foundations', 'level' => 'JSS · Basic Science', 'from' => 1, 'to' => 2,
         'what' => 'Measuring things properly, what matter is made of, and how forces push, pull, press, turn and lift.'],
        ['id' => 'phy-mechanics', 'name' => 'Mechanics', 'level' => 'SS 1–2 · Senior Physics', 'from' => 3, 'to' => 4,
         'what' => 'Motion and Newton’s laws, energy, momentum, circles, pendulums and floating.'],
        ['id' => 'phy-waves', 'name' => 'Heat, waves and light', 'level' => 'SS 2 · Senior Physics', 'from' => 5, 'to' => 5,
         'what' => 'Temperature, heating and the gas laws; waves and sound; mirrors, refraction and lenses.'],
        ['id' => 'phy-fields', 'name' => 'Electricity and the atom', 'level' => 'SS 3 · Senior Physics and exam year', 'from' => 6, 'to' => 6,
         'what' => 'Current, resistance, power, capacitors, magnetism, transformers, the nucleus and half-life.'],
        ['id' => 'phy-modern', 'name' => 'Fields and modern physics', 'level' => 'SS 3 · Exam year and beyond', 'from' => 7, 'to' => 8,
         'what' => 'Heat transfer, stationary waves, resonance, Doppler, fields, a.c., photons, energy levels, the nucleus’ energy and semiconductors.'],
        ['id' => 'phy-olympiad', 'name' => 'Physics Olympiad', 'level' => 'Olympiad and competition level', 'from' => 9, 'to' => 9, 'summit' => true,
         'what' => 'Hard problems cut into small steps: dimensions, estimates, orbits, rotation, eddy currents, engines, climate, relativity and quantum wells.'],
    ];
}

/**
 * Where a topic needs something other than the topic before it. A stage's first topic rests on what it
 * truly uses (forces on vectors, motion on vectors and units), so a learner placed in Motion is not
 * held back by Power.
 */
function phy_edges(): array {
    return [
        5 => [3, 4], 11 => [9], 15 => [5, 14], 19 => [11], 20 => [19], 21 => [9, 2], 26 => [23, 4], 29 => [28, 22], 30 => [29],
        31 => [29, 19], 32 => [19, 4], 33 => [31, 32], 35 => [30], 36 => [35], 39 => [5, 15], 41 => [7, 8], 43 => [41], 44 => [43, 8],
        45 => [41, 15], 46 => [6], 48 => [9], 51 => [2], 57 => [53, 9], 59 => [7], 60 => [59],
        // Stage 7 rests on the topics each extends; Stage 8 on waves, energy and the atom; the summit on the school topic it deepens.
        61 => [43], 62 => [41], 63 => [46], 64 => [63, 47], 65 => [47], 66 => [13], 67 => [37, 32], 68 => [51], 69 => [54, 58], 70 => [51],
        71 => [46, 54], 72 => [71], 73 => [71, 30], 74 => [73], 75 => [31], 76 => [75, 59], 77 => [52], 78 => [61], 79 => [72], 80 => [77],
        81 => [2], 82 => [10], 83 => [67], 84 => [37], 85 => [58, 69], 86 => [34, 45], 87 => [78], 88 => [56], 89 => [21], 90 => [74],
    ];
}

function phy_courses(): array {
    return [
        'physics-foundations' => ['id' => 'physics-foundations', 'title' => 'Physics Foundations', 'stages' => [1, 2],
            'promise' => 'Units and measuring, matter and its states, forces, pressure, moments, machines, work and power — the ground every later topic stands on.',
            'for' => 'JSS 1 to JSS 3 Basic Science, and anyone starting Physics', 'hours' => 25],
        'physics-mechanics' => ['id' => 'physics-mechanics', 'title' => 'Mechanics', 'stages' => [3, 4],
            'promise' => 'Motion, Newton’s laws, energy and momentum, circles, pendulums and flotation, worked the way senior secondary exams ask about them.',
            'for' => 'SS 1 to SS 2 Physics', 'hours' => 30],
        'physics-heat-waves' => ['id' => 'physics-heat-waves', 'title' => 'Heat, Waves and Light', 'stages' => [5],
            'promise' => 'Temperature, expansion, heat capacity, latent heat, the gas laws, waves, sound, mirrors, refraction and lenses.',
            'for' => 'SS 2 Physics', 'hours' => 15],
        'physics-electricity' => ['id' => 'physics-electricity', 'title' => 'Electricity and the Atom', 'stages' => [6],
            'promise' => 'Current, Ohm’s law, circuits, power and cost, e.m.f., capacitors, magnetism, transformers, radioactivity and half-life.',
            'for' => 'SS 3 Physics and the exam year', 'hours' => 15],
        'physics-modern' => ['id' => 'physics-modern', 'title' => 'Fields and Modern Physics', 'stages' => [7, 8],
            'promise' => 'Heat transfer, stationary waves and resonance, Doppler, gravitational and electric fields, a.c., photons and energy levels, E = mc², semiconductors and logic.',
            'for' => 'SS 3 and the exam year', 'hours' => 25],
        'physics-olympiad' => ['id' => 'physics-olympiad', 'title' => 'Physics Olympiad', 'stages' => [9],
            'promise' => 'Olympiad problems, one small step at a time: dimensional analysis, estimation, orbits, rotation, magnetic braking, engines, climate, relativity and quantum wells.',
            'for' => 'Olympiad and physics-competition hopefuls', 'hours' => 30],
    ];
}

/**
 * The timed Physics paper (owner, 6 Nov 2026, with past papers in hand): forty four-option questions in
 * forty minutes across the whole senior road, drawn fresh every time from this Lab's own questions —
 * never a copy of a past paper, and no exam body named. The score is out of 100, by area (strand).
 */
function phy_papers(): array {
    return ['waec' => ['id' => 'waec', 'title' => 'Standard exam', 'exam' => 'waec', 'board' => 'waec', 'n' => 50, 'minutes' => 38, 'boardMinutes' => 75, 'options' => 4,
                'stages' => [1, 8], 'typed' => 0,
                'what' => 'The senior school certificate Physics objective paper: 50 questions, A–D, across the whole syllabus, in half the real time — 38 minutes instead of 1¼ hours.'],
            'phy' => ['id' => 'phy', 'title' => 'Timed Physics paper', 'exam' => 'phy', 'n' => 40, 'minutes' => 40, 'stages' => [1, 8], 'typed' => 0,
        'what' => '40 questions in 40 minutes, from measurement to modern physics — mechanics, heat, waves and light, electricity and the atom. Every paper is new.']];
}

/** The formulas behind a Physics certificate's pattern (documents.php), in the order a learner meets them. */
function phy_formulas(): array {
    return ['λmax T = b', 'P = σT⁴', 'E = hf', 'λ = h/p', 'E = mc²', 'T² ∝ r³', 'τ = RC', 'Δt = γΔt₀', 'ρ = m/V', 'W = mg', 'F = ke', 'P = F/A', 'P = hρg', 'F₁d₁ = F₂d₂', 'W = Fd', 'P = W/t', 'v = u + at', 's = ut + ½at²', 'v² = u² + 2as',
            'F = ma', 'p = mv', 'KE = ½mv²', 'PE = mgh', 'Ft = mv − mu', 'a = v²/r', 'T = 2π√(L/g)', 'Q = mcΔθ', 'Q = mL', 'PV = const', 'v = fλ',
            'n = sin i / sin r', '1/f = 1/u + 1/v', 'Q = It', 'V = IR', 'P = IV', 'E = I(R + r)', 'Q = CV', 'F = BIL', 'Vs/Vp = Ns/Np', 'N = N₀(½)ⁿ'];
}
