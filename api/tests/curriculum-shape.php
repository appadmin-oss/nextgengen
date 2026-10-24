<?php
/**
 * The shape every NGG course must hold — the pedagogy, as a test.
 *
 * Written before the courses it governs, so the structure is enforced on all
 * of them rather than asserted about them afterwards. Each rule below names
 * the evidence it rests on, and how strong that evidence actually is, because
 * three of these are well replicated and one is not.
 *
 *  · RETRIEVAL  Every lesson ends by making the learner recall, not re-read.
 *               Best supported of the four: g ≈ 0.50 against re-reading
 *               (Rowland 2014, 159 effect sizes). Cheap, so it is universal.
 *
 *  · SPACING    A concept is met again in a LATER week, not only the week it
 *               is taught. Robust across domains, size varies by field
 *               (g ≈ 0.28 in maths, higher for spaced retrieval). Encoded as:
 *               every block ends with a lesson that revisits earlier weeks.
 *
 *  · PROJECT    A block ends in something made. PBL moves motivation by about
 *               d ≈ 0.50, moderate and heterogeneous — good reason to end a
 *               block with one, poor reason to make the whole course a
 *               project. Hence a cadence, not a method.
 *
 *  · AUTONOMY   Every lesson offers a real choice and two routes through it
 *               (new to this / already can). Self-determination work supports
 *               autonomy and competence in adolescents; the two routes are
 *               also the expertise-reversal guard, since a worked example that
 *               helps a novice slows someone who is already fluent — and NGG's
 *               learners are ten to seventeen in the same room.
 *
 *  · AI         Every course teaches using AI honestly, because every one of
 *               these trades now uses it and a child who cannot check what it
 *               says is not safer for having avoided it. Bounded at both ends:
 *               a floor of one, and a ceiling proportionate to how much the
 *               trade actually uses the thing (NGG_AI_INTERVAL). It is a step
 *               inside the work, never a section appended to every lesson —
 *               taught as a ritual it stops being read.
 *
 * INTERLEAVING is deliberately NOT enforced. It is the least established of
 * the family — most classroom studies cannot separate it from spacing, and the
 * large single-study results have not replicated — so it is used lightly in
 * review weeks and not built into the spine.
 */

const NGG_TERM_WEEKS = 12;

/**
 * How often a learner should meet AI, by course — at most one moment per N
 * sessions. N is set by how much the trade itself actually uses the tool, not
 * by how interesting the tool is.
 */
const NGG_AI_INTERVAL = [
    // Part of the job; a working practitioner uses it most days.
    'Coding' => 3, 'Data Analysis' => 3, 'Software Development' => 3,
    'Artificial Intelligence' => 2, 'Cybersecurity' => 3,
    // Real in the trade, but the craft is the eye, not the prompt.
    'Graphic Design' => 4, 'Branding' => 4, 'Visual Storytelling' => 4,
    'Digital Content Creation' => 4, 'Social Media' => 4,
    'Video Production' => 4, 'Cinematography' => 4, 'Tech Product Design' => 4,
    // Drafting and summarising help; the judgement being taught does not come
    // from a model, and these courses are mostly judgement.
    'Administration' => 4, 'Business Development' => 4, 'Finance' => 4,
    'Human Resources' => 4, 'Operations' => 4, 'Project Management' => 4,
    'Strategic Thinking' => 4, 'Product Management' => 4,
    /* Physical and performed skills. Nothing can hear you play, taste your
       cooking or watch your hands fold a dye. Only the parts that are
       genuinely information — theory, drills, practice plans — qualify. */
    'Piano' => 8, 'Guitar' => 8, 'Drums' => 8, 'Violin' => 8, 'Saxophone' => 8,
    'Vocal Training' => 8, 'Music' => 8, 'Acting' => 8, 'Stagecraft' => 8,
    'Catering' => 8, 'Adire' => 8, 'Crafts' => 8, 'Robotics' => 6,
];
const NGG_AI_INTERVAL_DEFAULT = 4;

/** Courses where AI is the subject, not a tool used inside another subject. */
const NGG_AI_IS_THE_SUBJECT = ['Artificial Intelligence' => true];

/** Lessons grouped by course, from the bundled seeds plus anything published. */
function ngg_course_lessons(): array {
    $out = [];
    foreach (glob(__DIR__ . '/../_lib/seeds/curriculum-*.json') ?: [] as $f) {
        $j = json_decode((string)file_get_contents($f), true);
        foreach ($j['lessons'] ?? [] as $L) {
            $c = trim((string)($L['course'] ?? ''));
            if ($c === '') continue;                 // the shared foundation is every course's
            $out[$c][] = $L;
        }
    }
    foreach ($out as &$ls) usort($ls, fn($a, $b) => [$a['level'] ?? '', (int)$a['week'], (int)$a['position']] <=> [$b['level'] ?? '', (int)$b['week'], (int)$b['position']]);
    return $out;
}

/** Everything a lesson's text carries, lowercased, for the content rules. */
function ngg_lesson_text(array $L): string {
    $s = (string)($L['title'] ?? '') . ' ' . (string)($L['summary'] ?? '') . ' ' . (string)($L['body'] ?? '');
    foreach ($L['objectives'] ?? [] as $o) $s .= ' ' . (string)$o;
    return mb_strtolower($s);
}

/**
 * Check one course against the shape. Returns [] when it holds, or a list of
 * what is missing — named, so a failure says which course and which rule.
 */
function ngg_course_shape_faults(string $course, array $lessons): array {
    $bad = [];
    if (!$lessons) return ["$course: no lessons at all"];

    // RETRIEVAL — every lesson makes the learner recall something.
    $noCheck = array_values(array_filter($lessons, fn($L) => !($L['checks'] ?? [])));
    if ($noCheck) $bad[] = "$course: " . count($noCheck) . ' lesson(s) end without a retrieval check — first: "' . ($noCheck[0]['title'] ?? '?') . '"';

    // AUTONOMY — a choice, and a route for the fluent as well as the new.
    $noRoutes = array_values(array_filter($lessons, function ($L) {
        $t = ngg_lesson_text($L);
        return !str_contains($t, 'if this is new') || !str_contains($t, 'if you already can');
    }));
    if ($noRoutes) $bad[] = "$course: " . count($noRoutes) . ' lesson(s) offer one route only — first: "' . ($noRoutes[0]['title'] ?? '?') . '"';

    /* AI — present, but in proportion, and always inside the work.
       A floor AND a ceiling. The floor is there because every one of these
       trades now uses the thing and a child who cannot check what it says is
       not safer for having avoided it. The ceiling is there because it was
       once stamped on 298 of 336 lessons — more shelf space than the weekly
       assignment — and a lesson a learner skips teaches nothing. */
    /* A course whose SUBJECT is the tool is exempt from the budget: in
       Artificial Intelligence, AI is not an aside used in proportion, it is
       the thing being taught, and every lesson is properly about it. Budgeting
       it like a course that merely uses the tool would be the rule mistaking
       its own units for the point. */
    if (isset(NGG_AI_IS_THE_SUBJECT[$course])) return $bad;

    $ai = array_values(array_filter($lessons, fn($L) => preg_match('/\bai\b|chatgpt|copilot/u', ngg_lesson_text($L))));
    if (!$ai) {
        $bad[] = "$course: nothing in the course teaches using AI";
    } else {
        /* A course may teach AI head-on ONCE — a lesson whose subject is the
           tool itself, where it is worth an hour. Everything else is an
           incidental step inside other work, and that is what the budget
           bounds. Counting the dedicated lesson against the budget would
           punish the course for teaching the thing properly. */
        $dedicated = array_values(array_filter($ai, fn($L) => preg_match('/\bai\b|chatgpt|copilot/iu', (string)($L['title'] ?? ''))));
        if (count($dedicated) > 1) {
            $bad[] = "$course: " . count($dedicated) . ' lessons are ABOUT AI — one is the budget for that'
                . ' (first: "' . ($dedicated[0]['title'] ?? '?') . '")';
        }
        $every = NGG_AI_INTERVAL[$course] ?? NGG_AI_INTERVAL_DEFAULT;
        $cap   = max(1, (int)ceil(count($lessons) / $every));
        $incidental = count($ai) - min(1, count($dedicated));
        if ($incidental > $cap) {
            $bad[] = "$course: AI is a step in $incidental of " . count($lessons)
                . ' lessons — the budget is ' . $cap . ' (one per ' . $every . ' sessions)';
        }
    }

    /* And where it appears it is a step of the work, not an appendix. The old
       trailing "## AI, used well" section was read after the lesson was over,
       which is why it became wallpaper. */
    $appendix = array_values(array_filter($lessons, fn($L) => str_contains((string)($L['body'] ?? ''), '## AI, used well')));
    if ($appendix) {
        $bad[] = "$course: " . count($appendix) . ' lesson(s) still carry AI as a trailing section rather than a step'
            . ' of the work — first: "' . ($appendix[0]['title'] ?? '?') . '"';
    }

    /* PROJECT — the course ends in things made, on the cadence the programme
       actually runs: a term. NGG terms are twelve sessions and end in a
       showcase, a recital or a portfolio piece, which is where a graded
       `project` belongs. An earlier version of this rule asked for one per six
       sessions; held against the real seeds that wanted twelve recitals in a
       seventy-two-session piano course, which is not a cadence, it is a
       treadmill. The rule was wrong, not the curriculum.

       A course shorter than one term is a strand inside a wider programme —
       two sessions of Cinematography inside Media Lab — and its project lives
       at the programme level. It still has to end in something made, so it
       owes a `task` even where it does not owe a `project`. */
    $hasKind = function (array $L, string $kind): bool {
        foreach ($L['checks'] ?? [] as $c) if (($c['kind'] ?? '') === $kind) return true;
        return false;
    };
    $projects = array_values(array_filter($lessons, fn($L) => $hasKind($L, 'project')));
    $wantProjects = intdiv(count($lessons), NGG_TERM_WEEKS);
    if (count($lessons) < NGG_TERM_WEEKS) {
        $made = array_filter($lessons, fn($L) => $hasKind($L, 'project') || $hasKind($L, 'task'));
        if (!$made) {
            $bad[] = "$course: " . count($lessons) . ' lesson(s) and nothing is made in any of them'
                . ' — a strand still ends in a task';
        }
    } elseif (count($projects) < $wantProjects) {
        $bad[] = "$course: " . count($projects) . ' project(s) for ' . count($lessons)
            . ' lessons — wants ' . $wantProjects . ' (a term of ' . NGG_TERM_WEEKS . ' ends in something made)';
    }

    // SPACING — the last lesson of a block reaches back to earlier weeks.
    if (count($lessons) >= NGG_TERM_WEEKS) {
        $revisits = array_filter($lessons, function ($L) {
            $t = ngg_lesson_text($L);
            return str_contains($t, 'earlier') || str_contains($t, 'back to') || str_contains($t, 'again') || str_contains($t, 'revisit');
        });
        if (!$revisits) $bad[] = "$course: no lesson revisits an earlier week — nothing is spaced";
    }
    return $bad;
}
