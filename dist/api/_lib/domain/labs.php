<?php
declare(strict_types=1);

/**
 * The Labs — one registry for every subject Lab NGG runs (owner, 5 Nov 2026: "prepare, we'll be
 * adding more labs").
 *
 * The Maths Lab is the first. Its engine — sessions as (topic, form, seed), mastery states, the
 * climb, reviews, the boss, certificates, the daily problem, exam papers — is subject-neutral; what
 * is Maths is its MAP (stages and topics), its FORMS (question generators), its PROOFS and its
 * explorers. A new Lab brings those and is registered here; it must not fork the engine.
 *
 * This is the ONE list of Labs (CLAUDE.md §11: one registry, everything derived). Every topic id
 * is "<PREFIX>-NNN" with the Lab's own two-letter prefix — MC for Maths — so ids never collide
 * across Labs and the shared tables (mlab_state, mlab_sessions, mlab_profile) can hold every Lab's
 * rows without a migration. docs/LABS.md is the step-by-step for adding one.
 */
const LABS = [
    'maths' => ['id' => 'maths', 'title' => 'Maths Lab', 'subject' => 'Mathematics', 'prefix' => 'MC', 'path' => '/study/lab', 'status' => 'live', 'icon' => 'ph-function',
        'docProgram' => 'mathslab', 'what' => 'From why 1 + 1 = 2 to WAEC, Further Mathematics, olympiad problems and JAMB/SAT practice papers.'],
];

/** A topic id: two capital letters, a dash, three digits. */
const LAB_COMP_RE = '/^([A-Z]{2})-(\d{3})$/';

function lab_get(string $id): ?array { return LABS[$id] ?? null; }
/** The Lab a topic id belongs to, by its prefix — null for a malformed id or an unknown prefix. */
function lab_for_comp(string $comp): ?array {
    if (!preg_match(LAB_COMP_RE, $comp, $m)) return null;
    foreach (LABS as $l) if ($l['prefix'] === $m[1]) return $l;
    return null;
}
function lab_comp_ok(string $comp): bool { return lab_for_comp($comp) !== null; }

/** labs.list — every Lab, for a hub page: live ones with their size, planned ones marked "soon". */
function labs_list(array $p = []): array {
    $out = [];
    foreach (LABS as $l) {
        $row = ['id' => $l['id'], 'title' => $l['title'], 'subject' => $l['subject'], 'path' => $l['path'], 'status' => $l['status'], 'icon' => $l['icon'], 'what' => $l['what']];
        if ($l['id'] === 'maths' && function_exists('mlb_competencies')) $row += ['topics' => count(mlb_competencies()), 'stages' => count(mlb_stages())];
        $out[] = $row;
    }
    return ['ok' => true, 'labs' => $out];
}
