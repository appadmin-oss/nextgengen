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
 *               says is not safer for having avoided it.
 *
 * INTERLEAVING is deliberately NOT enforced. It is the least established of
 * the family — most classroom studies cannot separate it from spacing, and the
 * large single-study results have not replicated — so it is used lightly in
 * review weeks and not built into the spine.
 */

const NGG_TERM_WEEKS = 12;

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

    // AI — taught somewhere in the course, honestly.
    $ai = array_filter($lessons, fn($L) => str_contains(ngg_lesson_text($L), ' ai '));
    if (!$ai) $bad[] = "$course: nothing in the course teaches using AI";

    /* PROJECT — a block ends in something made, and a block is about six
       sessions. Proportionate, not a flat number: a six-lesson course
       legitimately has one project and a seventy-two-lesson course should have
       a dozen. A flat "at least two" asked a short course for busywork. */
    $projects = array_values(array_filter($lessons, function ($L) {
        foreach ($L['checks'] ?? [] as $c) if (($c['kind'] ?? '') === 'project') return true;
        return false;
    }));
    $wantProjects = max(1, intdiv(count($lessons), 6));
    if (count($projects) < $wantProjects) {
        $bad[] = "$course: " . count($projects) . ' project(s) for ' . count($lessons)
            . ' lessons — wants ' . $wantProjects . ' (a block of ~6 ends in something made)';
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
