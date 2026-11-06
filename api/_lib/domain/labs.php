<?php
declare(strict_types=1);

/**
 * The Labs — one registry for every subject Lab NGG runs (owner, 5 Nov 2026: "prepare, we'll be
 * adding more labs"; 6 Nov 2026: Physics is the second, English the third).
 *
 * The Maths Lab came first, and its engine (domain/mathslab.php) is subject-neutral: sessions as
 * (topic, form, seed), mastery states, the climb, reviews, the boss, certificates, the mini review,
 * the chest. What belongs to a SUBJECT is its content — the map (stages and topics), the bands,
 * the prerequisite edges, the courses, the question forms and any proofs — and that is all a Lab
 * declares here, by naming the functions that return it. The engine reads content ONLY through
 * lab_call(); it never names a subject's function itself. A new Lab must not fork the engine:
 * two copies of the guards (marking, the server's clock, "never send the key") is how one of them
 * ends up missing a guard.
 *
 * This is the ONE list of Labs (CLAUDE.md §11). Every topic id is "<PREFIX>-NNN" with the Lab's own
 * two-letter prefix, so ids never collide and the shared tables (mlab_state, mlab_sessions,
 * mlab_track, mlab_enrol) hold every Lab's rows. docs/LABS.md is the step-by-step for adding one.
 *
 *   content   key → the function returning that piece of the Lab:
 *               stages  [n => [title, [ten topic titles]]]   strands [n => strand]
 *               bands   [[id, name, level, from, to, what, summit?]]
 *               edges   [topic number => [numbers it needs]]  courses [id => course]
 *               forms   [topic id => [fn(MlbRng): item]]      why     [topic id => proof] (optional)
 *   features  what this Lab offers beyond the path: 'daily' (a daily problem from its summit band),
 *             'exams' (timed practice papers), 'explore' (interactive explorers in the client).
 *   noun      what one step on its map is called in copy ("topic").
 */
const LABS = [
    'maths' => ['id' => 'maths', 'title' => 'Maths Lab', 'subject' => 'Mathematics', 'prefix' => 'MC', 'path' => '/study/lab', 'status' => 'live', 'icon' => 'ph-function',
        'docProgram' => 'mathslab', 'emoji' => '➗',
        'what' => 'From why 1 + 1 = 2 to senior school, Further Mathematics, olympiad problems and timed practice papers.',
        'content' => ['stages' => 'mlb_maths_stage_table', 'strands' => 'mlb_maths_strands', 'bands' => 'mlb_maths_bands', 'edges' => 'mlb_maths_edges',
                      'courses' => 'mlb_maths_courses', 'forms' => 'mlb_maths_forms', 'why' => 'mlb_why', 'papers' => 'mlb_maths_papers'],
        'features' => ['daily', 'exams', 'explore'], 'dailyName' => 'Daily Olympiad Problem'],
    'physics' => ['id' => 'physics', 'title' => 'Physics Lab', 'subject' => 'Physics', 'prefix' => 'PH', 'path' => '/study/physics', 'status' => 'live', 'icon' => 'ph-atom',
        'docProgram' => 'mathslab', 'emoji' => '⚛️',
        'what' => 'From measuring and forces to motion, energy, waves, electricity and the atom — from JSS Basic Science through senior secondary Physics.',
        'content' => ['stages' => 'phy_stage_table', 'strands' => 'phy_strands', 'bands' => 'phy_bands', 'edges' => 'phy_edges',
                      'courses' => 'phy_courses', 'forms' => 'phy_forms', 'formulas' => 'phy_formulas', 'papers' => 'phy_papers'],
        'features' => ['daily', 'exams', 'explore'], 'dailyName' => 'Daily Physics Puzzle'],
    // The third Lab (owner, 6 Nov 2026: "build the engine. Make it modular"): content in a kit and five
    // modules (englishlab-kit.php and englishlab-{words,grammar,sounds,reading,writing}.php), on the
    // same engine. No explorers yet, so no 'explore'.
    'english' => ['id' => 'english', 'title' => 'English Lab', 'subject' => 'English', 'prefix' => 'EN', 'path' => '/study/english', 'status' => 'live', 'icon' => 'ph-book-open-text',
        'docProgram' => 'mathslab', 'emoji' => '📖',
        'what' => 'From nouns, tenses and punctuation to speech work, comprehension, summary and writing well — JSS English Studies through senior secondary English Language.',
        'content' => ['stages' => 'eng_stage_table', 'strands' => 'eng_strands', 'bands' => 'eng_bands', 'edges' => 'eng_edges',
                      'courses' => 'eng_courses', 'forms' => 'eng_forms', 'formulas' => 'eng_formulas', 'papers' => 'eng_papers'],
        'features' => ['daily', 'exams'], 'dailyName' => 'Daily Word Challenge'],
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

/**
 * The Lab this request is about. One PHP request serves one op, so the Lab is set once at the top
 * of it (lab_from()) and every listing the engine draws — the map, Home, courses, progress, the
 * certificates — is that Lab's. Anything keyed by a TOPIC (marking an item, a topic's title) goes by
 * the topic's own prefix instead (lab_for_comp), so it can never be read through the wrong Lab.
 */
function lab_use(?string $id = null): array {
    static $cur = 'maths';
    if ($id !== null && isset(LABS[$id])) $cur = $id;
    return LABS[$cur];
}
function lab_cur(): array { return lab_use(); }
function lab_id(): string { return lab_use()['id']; }
/** Set the Lab from an op's arguments: `lab` names it (default maths, so every old link works).
 *  Returns null for an unknown Lab — the op refuses rather than quietly showing Maths. */
function lab_from(array $p): ?array {
    $id = (string)($p['lab'] ?? 'maths');
    if ($id === '') $id = 'maths';
    if (!isset(LABS[$id])) return null;
    $l = LABS[$id];
    if (!function_exists($l['content']['stages']) || !function_exists($l['content']['forms'])) return null;
    return lab_use($id);
}
/** One piece of a Lab's content, through the function the registry names (memoised per Lab). */
function lab_call(string $key, ?string $lab = null) {
    static $memo = [];
    $l = $lab !== null ? (LABS[$lab] ?? null) : lab_cur();
    if (!$l) return [];
    $k = $l['id'] . '|' . $key;
    if (array_key_exists($k, $memo)) return $memo[$k];
    $fn = $l['content'][$key] ?? null;
    return $memo[$k] = ($fn && function_exists($fn)) ? $fn() : [];
}
function lab_has(string $feature, ?array $lab = null): bool { return in_array($feature, ($lab ?? lab_cur())['features'] ?? [], true); }

/** labs.list — every Lab, for the hub and the study-tools tabs: live ones with their size. */
function labs_list(array $p = []): array {
    $out = [];
    $was = lab_id();
    foreach (LABS as $l) {
        $row = ['id' => $l['id'], 'title' => $l['title'], 'subject' => $l['subject'], 'path' => $l['path'], 'status' => $l['status'], 'icon' => $l['icon'],
                'emoji' => $l['emoji'] ?? '', 'what' => $l['what'], 'features' => $l['features']];
        if (function_exists('mlb_competencies') && function_exists($l['content']['stages'])) {
            lab_use($l['id']);
            $row += ['topics' => count(mlb_competencies()), 'stages' => count(mlb_stages())];
        }
        $out[] = $row;
    }
    lab_use($was);
    return ['ok' => true, 'labs' => $out];
}
