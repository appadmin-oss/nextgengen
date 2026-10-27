<?php
declare(strict_types=1);

/**
 * The NGG Club curriculum — what the Club teaches, and who has learnt it.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────────
 * A UNIT is one lesson. Its natural key is course → level → week → position,
 * so an import of the same sheet updates the lessons it already made rather
 * than adding a second copy of each. `course` is a course from the CLUB's
 * course list (club_catalogue() — the Club's own, not Summer School's academy
 * catalogue; see the comment there); blank means
 * the lesson is for everybody in the Club. A unit carries MATERIALS (files and
 * links) and CHECKS (the questions that say whether it was learnt).
 *
 * NGG only. Summer School is a phase with its own course log
 * (domain/instructor.php); this is the year-round programme a member belongs
 * to, and a `Summer` account never sees it (member_is_ngg()).
 *
 * ── PROGRESS IS ONE ROW PER MEMBER PER UNIT ──────────────────────────────────
 * Started on first open, completed when the checks are passed at the unit's
 * pass mark. A multiple-choice answer is marked on the spot. A written answer
 * is marked by the AI where one is configured — with its reasoning stored and
 * labelled as the AI's — or waits for an instructor (`pending`), and the
 * member is told which. A score is never invented for a mark nobody made.
 *
 * ── A VERSION, BECAUSE A LESSON MOVES ─────────────────────────────────────────
 * Changing a published unit's checks bumps its version. A progress row keeps
 * the version it was marked against, so a report can tell a score on today's
 * questions from a score on last term's — the same discipline as assessment.php,
 * where an instrument locks once it has results.
 *
 * ── THE AI DRAFTS, A PERSON PUBLISHES ────────────────────────────────────────
 * admin_curriculum_ai() turns a lesson's text into a summary, objectives and
 * checks. It returns a DRAFT for the editor to read; it never saves and never
 * publishes. Generated checks are marked `source = ai` so a reviewer can see
 * which questions nobody wrote.
 */

const CURR_STATUSES       = ['draft', 'published', 'retired'];
const CURR_MATERIAL_KINDS = ['pdf', 'slides', 'doc', 'sheet', 'video', 'audio', 'image', 'ebook', 'code', 'archive', 'interactive', 'link'];
/** A material's life: an editor's goes straight to approved; an instructor's waits. */
const CURR_MATERIAL_STATUSES = ['approved', 'pending', 'rejected'];
/* 'watch' is a question about a video the lesson sends them to: they watch
   it inside the exam and write what they took from it. It is marked like
   any other written answer — against the rubric, by the AI when one is
   configured and by the instructor otherwise. There is deliberately no
   keyword gate: a child who can guess which three words to type has not
   watched anything, and a child who writes it their own way would fail. */
const CURR_CHECK_KINDS    = ['mcq', 'short', 'task', 'essay', 'reflection', 'project', 'code', 'watch'];
/* How the AI marks each open kind. Only `short` has one right answer; the rest
 * are judged against the rubric, and a reflection is never marked for having
 * the "right" opinion. */
const CURR_MARKING_GUIDE = [
    'short'      => 'A short answer with a model answer. Award points for the ideas in the model answer, in any wording; spelling and grammar never cost marks.',
    'task'       => 'A practical task the learner reports on. Judge whether their account shows they did what was asked, against the rubric.',
    'essay'      => 'Extended writing with no single right answer. Judge against the rubric: a clear point, reasons or evidence, organisation, and answering the question asked. Reward a well-argued view you disagree with.',
    'reflection' => 'A personal reflection. There is no right answer and no opinion is marked down. Judge honesty, specific detail from their own experience, and a link to the lesson. Never mark down anything personal they disclose.',
    'project'    => 'A description of a project they made (perhaps with a link you cannot open). Judge the description against the rubric criteria: what they built, how, what they learned. If they give only a link and no description, you cannot judge it.',
    'code'       => 'Code they wrote. Trace it mentally: does it do what the prompt asks, is the logic sound, is it readable. Small syntax slips cost less than wrong logic.',
    /* VERIFYING A VIDEO. You cannot check that somebody pressed play, and a
       keyword gate would only check that they guessed which three words to
       type — passing the child who skimmed a transcript and failing the one
       who understood it and said so in their own words. So what is judged is
       what only watching could produce: the specifics. */
    'watch'      => 'What they took from a video the lesson sent them to. You cannot see whether they watched it, so judge what only watching could produce: specific details, an example or a moment from the video itself, and their own words rather than the title restated. A summary that could have been written from the title alone earns little, however well written; a rough account with a real detail in it earns more. Never mark down their English.',
];
const CURR_IMPORT_MAX     = 1000;
const CURR_BULK_MAX       = 500;
const CURR_MAX_MATERIALS  = 20;
const CURR_MAX_CHECKS     = 30;

/* ══ Shapes ═══════════════════════════════════════════════════════════════ */

function curriculum_clean_text(mixed $v, int $max): string {
    return mb_substr(trim(str_replace("\0", '', (string)$v)), 0, $max);
}

/** Objectives arrive as a list, or as one string split on new lines or `;`. */
function curriculum_list(mixed $v, int $maxItems = 12, int $maxLen = 240): array {
    if (is_string($v)) $v = preg_split('/\r\n|\r|\n|;/', $v) ?: [];
    if (!is_array($v)) return [];
    $out = [];
    foreach ($v as $x) {
        $x = curriculum_clean_text(is_array($x) ? ($x['text'] ?? '') : $x, $maxLen);
        if ($x !== '') $out[] = $x;
        if (count($out) >= $maxItems) break;
    }
    return $out;
}

/** The kind a material is, from what it was declared as, or from its URL. */
function curriculum_material_kind(string $kind, string $url): string {
    $kind = strtolower(trim($kind));
    if (in_array($kind, CURR_MATERIAL_KINDS, true)) return $kind;
    $path = strtolower((string)parse_url($url, PHP_URL_PATH));
    // A stored file's name is in its query (curriculum-file.php?f=<hash>.<ext>).
    parse_str((string)parse_url($url, PHP_URL_QUERY), $q);
    if (!empty($q['f']) && is_string($q['f'])) $path = strtolower($q['f']);
    return match (true) {
        (bool)preg_match('/\.pdf$/', $path) => 'pdf',
        (bool)preg_match('/\.(pptx?|key|odp)$/', $path) => 'slides',
        (bool)preg_match('/\.(docx?|odt|rtf|txt)$/', $path) => 'doc',
        (bool)preg_match('/\.(xlsx?|csv|ods)$/', $path) => 'sheet',
        (bool)preg_match('/\.(mp4|mov|webm)$/', $path) || (bool)preg_match('~(youtube\.com|youtu\.be|vimeo\.com)~', $url) => 'video',
        (bool)preg_match('/\.(mp3|m4a|wav|ogg)$/', $path) => 'audio',
        (bool)preg_match('/\.(png|jpe?g|webp|gif)$/', $path) => 'image',
        (bool)preg_match('/\.epub$/', $path) => 'ebook',
        (bool)preg_match('/\.(py|ino|js|sb3|md)$/', $path) => 'code',
        (bool)preg_match('/\.zip$/', $path) => 'archive',
        (bool)preg_match('~(scratch\.mit\.edu|replit\.com|codepen\.io|phet\.colorado\.edu|geogebra\.org|desmos\.com|tinkercad\.com|wokwi\.com|code\.org)~', $url) => 'interactive',
        default => 'link',
    };
}

/**
 * A material's URL: https, or a file in this deployment's own curriculum store
 * (`/api/member/curriculum-file.php?f=…`). Nothing else reaches an href.
 */
function curriculum_material_url(string $u): string {
    $u = trim($u);
    if (preg_match('#^https://[^\s<>"]+$#i', $u)) return mb_substr($u, 0, 1000);
    if (preg_match('#^/api/member/curriculum-file\.php\?f=[a-f0-9]{16,64}\.[a-z0-9]{2,5}$#', $u)) return $u;
    if (curriculum_media_key($u) !== '') return $u;
    return '';
}

/**
 * A storage-independent reference to a lesson's own media: `media:<key>`,
 * where the key is a path like `drums/backbeat.gif`.
 *
 * WHY THIS EXISTS. A lesson's diagrams, GIFs and audio outlive whatever is
 * hosting them this year. Writing `https://res.cloudinary.com/...` into three
 * hundred lesson rows means that moving to a bucket is a data migration over
 * published content — and published content is the thing we promise not to
 * rewrite under people. A `media:` key stores WHICH file the lesson wants and
 * nothing about where it currently lives, so the move is one setting.
 *
 * Resolution is at read time (curriculum_media_url), never at write time, so
 * the stored row never acquires a host.
 */
function curriculum_media_key(string $u): string {
    if (!preg_match('#^media:([a-z0-9][a-z0-9/_-]{0,180}\.[a-z0-9]{2,5})$#i', trim($u), $m)) return '';
    if (str_contains($m[1], '..') || str_contains($m[1], '//')) return '';     // no traversal, no empty segment
    return $m[1];
}

/** `media:drums/backbeat.gif` → the configured base plus that key. */
function curriculum_media_url(string $u): string {
    $key = curriculum_media_key($u);
    if ($key === '') return $u;
    $base = '';
    if (function_exists('setting_raw')) $base = trim((string)setting_raw('curriculum_media_base'));
    if ($base === '') $base = trim((string)($GLOBALS['CONFIG']['curriculum_media_base'] ?? ''));
    /* No base configured yet: resolve to nothing rather than to a broken host,
       so a lesson shows the material it has and silently omits what is not
       hosted yet. A half-built link is worse than no link. */
    if ($base === '' || !preg_match('#^https://#i', $base)) return '';
    return rtrim($base, '/') . '/' . $key;
}

function curriculum_unit_public(array $u, array $materials, array $checks, bool $withAnswers): array {
    return [
        'unitId' => (string)$u['unitId'], 'course' => (string)$u['course'], 'level' => (string)$u['level'],
        'week' => (int)$u['week'], 'position' => (int)$u['position'], 'title' => (string)$u['title'],
        'path' => curriculum_path((string)$u['level'], (int)$u['week']),
        'summary' => (string)$u['summary'], 'objectives' => json_decode((string)$u['objectives'], true) ?: [],
        'body' => (string)$u['body'], 'durationMins' => (int)$u['durationMins'], 'passMark' => (int)$u['passMark'],
        'status' => (string)$u['status'], 'version' => (int)$u['version'], 'source' => (string)$u['source'],
        'updatedAt' => (string)$u['updatedAt'], 'publishedAt' => (string)$u['publishedAt'],
        /* `media:` keys resolve here, at read time, so no stored row carries a
           host and moving buckets is one setting. A key with no base
           configured resolves to '' and the material is dropped rather than
           shown as a dead link. */
        'materials' => array_values(array_filter(array_map(static function ($m) {
            $url = curriculum_media_url((string)$m['url']);
            if ($url === '') return null;
            return ['materialId' => (string)$m['materialId'], 'kind' => (string)$m['kind'],
                    'title' => (string)$m['title'], 'url' => $url];
        }, $materials))),
        'checks' => array_map(static function ($c) use ($withAnswers) {
            $o = ['checkId' => (string)$c['checkId'], 'kind' => (string)$c['kind'], 'prompt' => (string)$c['prompt'],
                  'options' => json_decode((string)$c['options'], true) ?: [], 'points' => (int)$c['points'],
                  'source' => (string)$c['source']];
            /* The video travels with the question, to the learner as well as
               to the editor: it is what they are being asked about, not an
               answer, so withholding it would withhold the question. */
            if ((string)$c['kind'] === 'watch' && trim((string)($c['videoUrl'] ?? '')) !== '') $o['videoUrl'] = (string)$c['videoUrl'];
            if ($withAnswers) { $o['answer'] = (string)$c['answer']; $o['rubric'] = (string)$c['rubric']; }
            return $o;
        }, $checks),
    ];
}

/**
 * Units with their materials and checks — three queries for any number of
 * units, never one per unit.
 *
 * @return array<string,array{unit:array,materials:list<array>,checks:list<array>}>
 */
function curriculum_load(string $where = '1=1', array $args = [], string $order = 'course, level, week, position'): array {
    $units = db_all("SELECT * FROM curriculum_units WHERE $where ORDER BY $order", $args);
    if (!$units) return [];
    $ids = array_map(static fn($u) => (string)$u['unitId'], $units);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $out = [];
    foreach ($units as $u) $out[(string)$u['unitId']] = ['unit' => $u, 'materials' => [], 'checks' => []];
    /* Approved materials only. A submission waiting for review is not part
       of the lesson yet — not for members, and not in the editor's list,
       where saving would otherwise turn it into an approved one. */
    foreach (db_all("SELECT * FROM curriculum_materials WHERE unitId IN ($ph) AND COALESCE(status,'approved') = 'approved' ORDER BY position, id", $ids) as $m) $out[(string)$m['unitId']]['materials'][] = $m;
    foreach (db_all("SELECT * FROM curriculum_checks WHERE unitId IN ($ph) ORDER BY position, id", $ids) as $c) $out[(string)$c['unitId']]['checks'][] = $c;
    return $out;
}

/**
 * The NGG Club's divisions and their courses — the Club's own, never Summer
 * School's.
 *
 * NGG is organised in DIVISIONS (Creative & Performing Arts; Media & Content
 * Strategy; Technology & Applied Engineering; Business Strategy, Operations &
 * Administration), each with the courses a child can take inside it. The
 * structure is the same faculty → courses map every reader already takes
 * (`club_catalogue`), and a division carries three more things in
 * `club_division_meta`: its icon, the short label the member card prints
 * (TECH, MEDIA…) and the sentence the join form shows a family.
 *
 * This list used to be SEEDED FROM SUMMER SCHOOL'S catalogue — the first read
 * copied the academy list and stored it — so the NGG join form offered Summer
 * courses under Summer faculty names, and the two programmes looked like one.
 * The Club's divisions are now seeded from CLUB_DIVISIONS_DEFAULT, once per
 * seed version (CLUB_DIVISIONS_SEED): the list held before the seed is kept in
 * `club_catalogue_before_seed`, and an admin's later edits are never
 * overwritten, because the seed runs once.
 */
const CLUB_DIVISIONS_SEED = 'ngg-divisions-2026-10b-instruments';
/**
 * WHAT A GOOD QUESTION LOOKS LIKE IN THIS SUBJECT — the recognised exam a
 * course points at, and how that body actually assesses.
 *
 * Questions were being written out of nothing. An instructor and an AI both
 * reach for four options and a right answer, because that is the easiest
 * thing to produce — and a review made of those measures whether a child can
 * recognise the right words a week later, which in subjects that are almost
 * entirely practical is close to measuring nothing.
 *
 * Every one of these is a real award a Nigerian 10–17 year old can actually
 * sit or earn, and what is recorded is the SHAPE of its assessment, not its
 * syllabus: how the body decides somebody can do the thing. A question
 * modelled on that is a question somebody already thought hard about.
 *
 * Two rules about using it:
 *   · It is a MODEL, never a claim. Nothing here says a lesson is part of
 *     that qualification or prepares anyone for it — only that this is the
 *     standard the question should hold itself to.
 *   · The `assesses` line is what goes to the AI. It is written as the body
 *     ITSELF describes its assessment, at a level that does not invent
 *     syllabus detail — a drafted question that cites a unit number nobody
 *     checked is worse than no reference at all.
 */
const COURSE_EXAM_REFERENCE = [
    // ── Technology & Applied Engineering ──────────────────────────────────
    'Coding' => [
        'body' => 'freeCodeCamp', 'award' => 'Responsive Web Design / JavaScript Algorithms certifications',
        'assesses' => 'a set of projects you build and submit before a final exam — the certificate follows working code you wrote, not answers you picked',
        'ask' => 'ask for code that runs and a sentence on why it is written that way',
        'link' => 'https://www.freecodecamp.org/learn',
    ],
    'Software Development' => ['same' => 'Coding'],
    'Artificial Intelligence' => ['same' => 'Coding'],
    'Cybersecurity' => [
        'body' => 'Cisco Networking Academy', 'award' => 'Introduction to Cybersecurity (free, with a Credly badge)',
        'assesses' => 'scenario questions — you are given a situation and asked what you would do and why',
        'ask' => 'put them in a situation and ask for the action and the reason',
        'link' => 'https://www.netacad.com/',
    ],
    'Robotics' => ['same' => 'Coding'],
    'Automation' => ['same' => 'Coding'],
    'Tech Product Design' => ['same' => 'Coding'],

    // ── Creative & Performing Arts ────────────────────────────────────────
    'Music' => [
        'body' => 'Trinity College London', 'award' => 'Graded Music Exams, which run in Nigeria',
        'assesses' => 'you play pieces to an examiner, plus technical work and musical knowledge asked about what you just played',
        'ask' => 'ask them to play or record something and say what they did with it — nothing can hear a child play except a person',
        'link' => 'https://www.trinitycollege.com/qualifications/music',
    ],
    'Piano' => ['same' => 'Music'], 'Guitar' => ['same' => 'Music'], 'Drums' => ['same' => 'Music'],
    'Violin' => ['same' => 'Music'], 'Saxophone' => ['same' => 'Music'], 'Vocal Training' => ['same' => 'Music'],
    'Acting' => [
        'body' => 'Trinity College London', 'award' => 'Graded Drama & Speech exams, which run in Nigeria',
        'assesses' => 'you perform to an examiner and then answer questions about the choices you made',
        'ask' => 'ask them to perform or record a piece and account for one choice in it',
        'link' => 'https://www.trinitycollege.com/qualifications/drama-speech',
    ],
    'Stagecraft' => ['same' => 'Acting'],
    'Catering' => [
        'body' => 'NBTE', 'award' => 'National Skills Qualification — no academic entry requirement',
        'assesses' => 'an assessor watches you do the job to an industry standard and signs off what you can do',
        'ask' => 'ask for the finished work, photographed or brought in, and how they judged it was right',
        'link' => 'https://net.nbte.gov.ng/',
    ],
    'Adire' => ['same' => 'Catering'], 'Crafts' => ['same' => 'Catering'],
    'Music Production' => ['same' => 'Music'],

    // ── Media & Content Strategy ──────────────────────────────────────────
    'Graphic Design' => [
        'body' => 'Google / Coursera', 'award' => 'Google Career Certificates',
        'assesses' => 'graded work you produce for a brief, reviewed against a rubric, alongside short knowledge checks',
        'ask' => 'give them a brief and ask for the piece plus the reasoning behind one decision',
        'link' => 'https://grow.google/certificates/',
    ],
    'Branding' => ['same' => 'Graphic Design'], 'Video Production' => ['same' => 'Graphic Design'],
    'Cinematography' => ['same' => 'Graphic Design'], 'Digital Content Creation' => ['same' => 'Graphic Design'],
    'Social Media' => ['same' => 'Graphic Design'], 'Visual Storytelling' => ['same' => 'Graphic Design'],

    // ── Business Strategy, Operations & Administration ────────────────────
    'Project Management' => [
        'body' => 'Google / Coursera', 'award' => 'Google Project Management Certificate',
        'assesses' => 'you produce the real artefacts of the job — a plan, a register, a report — and they are marked against a rubric',
        'ask' => 'ask for the artefact itself and one decision they had to make while producing it',
        'link' => 'https://grow.google/certificates/project-management/',
    ],
    'Product Management' => ['same' => 'Project Management'],
    'Data Analysis' => ['same' => 'Project Management'],
    'Business Development' => ['same' => 'Project Management'],
    'Finance' => ['same' => 'Project Management'],
    'Human Resources' => ['same' => 'Project Management'],
    'Operations' => ['same' => 'Project Management'],
    'Administration' => ['same' => 'Project Management'],
    'Strategic Thinking' => ['same' => 'Project Management'],
];

/**
 * The exam reference for a course — following the strand to its parent, so
 * "Piano" answers with Music's and a lesson filed under a course that is a
 * part of a broader one is not left with nothing.
 */
function curriculum_exam_reference(string $course): ?array {
    $try = [$course];
    if (function_exists('course_scope')) foreach (course_scope($course) as $c) $try[] = $c;
    if (function_exists('curriculum_course_parent')) $try[] = curriculum_course_parent($course);
    $seen = [];
    foreach ($try as $name) {
        $name = trim((string)$name);
        if ($name === '' || isset($seen[$name])) continue;
        $seen[$name] = true;
        foreach (COURSE_EXAM_REFERENCE as $k => $v) {
            if (strcasecmp($k, $name) !== 0) continue;
            $hops = 0;
            while (isset($v['same']) && $hops++ < 4) $v = COURSE_EXAM_REFERENCE[$v['same']] ?? [];
            return $v ? $v + ['course' => $k] : null;
        }
    }
    return null;
}

const CLUB_DIVISIONS_DEFAULT = [
    ['name' => 'Creative & Performing Arts', 'icon' => '🎭', 'short' => 'CREATIVE ARTS',
     'blurb' => 'For children interested in music, catering, musical instruments, acting, stagecraft, vocal training, adire, crafts, music production and other creative expressions.',
     /* An instrument is its own course. "Musical Instruments" taught nothing in
        particular: a child learning piano and a child learning drums were on
        the same course and could not both be given the right lesson, and the
        144 written piano and guitar lessons had nowhere to live that a member
        could reach. The umbrella name still resolves (member_courses_from_text
        expands it to every instrument) so nobody on the old track is orphaned. */
     'courses' => ['Music', 'Piano', 'Guitar', 'Drums', 'Violin', 'Saxophone', 'Vocal Training', 'Music Production', 'Acting', 'Stagecraft', 'Catering', 'Adire', 'Crafts']],
    ['name' => 'Media & Content Strategy', 'icon' => '🎥', 'short' => 'MEDIA',
     'blurb' => 'For children interested in video production, cinematography, graphic design, branding, digital content creation, social media and visual storytelling.',
     'courses' => ['Video Production', 'Cinematography', 'Graphic Design', 'Branding', 'Digital Content Creation', 'Social Media', 'Visual Storytelling']],
    ['name' => 'Technology & Applied Engineering', 'icon' => '💻', 'short' => 'TECH',
     'blurb' => 'For children interested in artificial intelligence, coding, software development, robotics, automation, tech product design and cybersecurity.',
     'courses' => ['Artificial Intelligence', 'Coding', 'Software Development', 'Robotics', 'Automation', 'Tech Product Design', 'Cybersecurity']],
    ['name' => 'Business Strategy, Operations & Administration', 'icon' => '📊', 'short' => 'BUSINESS',
     'blurb' => 'For children interested in project management, product management, data analysis, business development, finance, HR, operations, administration and strategic thinking.',
     'courses' => ['Project Management', 'Product Management', 'Data Analysis', 'Business Development', 'Finance', 'Human Resources', 'Operations', 'Administration', 'Strategic Thinking']],
];
/** Bounds on what the divisions editor may save. */
const CLUB_DIVISIONS_MAX = 12;
const CLUB_DIVISION_SHORT_MAX = 14;
const CLUB_DIVISION_BLURB_MAX = 300;

function club_catalogue_default(): array {
    $out = [];
    foreach (CLUB_DIVISIONS_DEFAULT as $d) $out[$d['name']] = $d['courses'];
    return $out;
}
function club_division_meta_default(): array {
    $out = [];
    foreach (CLUB_DIVISIONS_DEFAULT as $d) $out[$d['name']] = ['icon' => $d['icon'], 'short' => $d['short'], 'blurb' => $d['blurb']];
    return $out;
}
/** Seed the NGG divisions, once per seed version. */
function club_divisions_seed_once(): void {
    if ((string)setting_raw('club_catalogue_seed') === CLUB_DIVISIONS_SEED) return;
    $prev = setting_get('club_catalogue');
    if ($prev) setting_set('club_catalogue_before_seed', $prev, 'system');
    setting_set('club_catalogue', club_catalogue_default(), 'system');
    setting_set('club_division_meta', club_division_meta_default(), 'system');
    setting_set('club_catalogue_seed', CLUB_DIVISIONS_SEED, 'system');
    if (function_exists('cache_invalidate')) cache_invalidate('catalogue');
}
function club_catalogue(): array {
    club_divisions_seed_once();
    $saved = academy_catalogue_clean(setting_get('club_catalogue'));
    return $saved ?: club_catalogue_default();
}
function club_courses(): array { $out = []; foreach (club_catalogue() as $courses) foreach ($courses as $c) if (!in_array($c, $out, true)) $out[] = $c; return $out; }

/** Clean a division's icon, short label and blurb. */
function club_division_meta_clean(string $name, $m): array {
    $m = is_array($m) ? $m : [];
    $icon = trim((string)($m['icon'] ?? ''));
    if (mb_strlen($icon) > 4) $icon = mb_substr($icon, 0, 4);
    $short = strtoupper(trim(preg_replace('/[^\p{L}\p{N} &\/-]+/u', '', (string)($m['short'] ?? ''))));
    if ($short === '') $short = strtoupper(mb_substr(preg_replace('/\s*[&,].*$/u', '', $name), 0, CLUB_DIVISION_SHORT_MAX));
    return ['icon' => $icon, 'short' => mb_substr($short, 0, CLUB_DIVISION_SHORT_MAX), 'blurb' => mb_substr(trim((string)($m['blurb'] ?? '')), 0, CLUB_DIVISION_BLURB_MAX)];
}
/** Every division, in order: name, icon, short, blurb, courses. */
function club_divisions(): array {
    $meta = setting_get('club_division_meta');
    $meta = is_array($meta) ? $meta : [];
    $out = [];
    foreach (club_catalogue() as $name => $courses) {
        $out[] = array_merge(['name' => (string)$name], club_division_meta_clean((string)$name, $meta[$name] ?? null), ['courses' => array_values($courses)]);
    }
    return $out;
}
/** The division a course belongs to ('' when none does). */
function club_division_of(string $course): string {
    foreach (club_catalogue() as $name => $courses) foreach ($courses as $c) if (strcasecmp($c, $course) === 0) return (string)$name;
    return '';
}
/** The short label the member card prints for a division. */
function club_division_short(string $division): string {
    foreach (club_divisions() as $d) if (strcasecmp($d['name'], $division) === 0) return $d['short'];
    return '';
}

/** admin.club.catalogue.get — the Club's divisions and courses, for its editor. */
function admin_club_catalogue_get(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'people']); if (!$g['ok']) return $g;
    $inUse = [];
    foreach (db_all("SELECT DISTINCT course FROM curriculum_units WHERE course <> '' AND COALESCE(status,'') <> 'archived'") as $r) $inUse[(string)$r['course']] = true;
    foreach (db_all("SELECT DISTINCT course FROM timetable_slots WHERE status = 'active'") as $r) $inUse[(string)$r['course']] = true;
    // How many members are in each course and division, so the editor can say what a change touches.
    $members = [];
    // A member on two courses counts in both: their chosen courses, or the old track when none are chosen.
    foreach (db_all("SELECT track, courses FROM members WHERE COALESCE(type,'NGG') = 'NGG' AND COALESCE(status,'active') = 'active' AND (COALESCE(track,'') <> '' OR COALESCE(courses,'') <> '')") as $r)
        foreach (member_courses_of($r) ?: [(string)$r['track']] as $c) if ($c !== '') $members[$c] = ($members[$c] ?? 0) + 1;
    $divs = club_divisions();
    return ['ok' => true, 'catalogue' => array_map(static fn($d) => ['faculty' => $d['name'], 'courses' => $d['courses']], $divs),
            'divisions' => $divs, 'defaults' => array_map(static fn($d) => array_merge(['faculty' => $d['name']], $d), CLUB_DIVISIONS_DEFAULT),
            'customised' => true, 'inUse' => array_keys($inUse), 'members' => $members,
            'centres' => function_exists('centres_for_programme') ? array_column(centres_for_programme('ngg', 'name'), 'name') : [],
            'canEdit' => admin_cap_gate($p, 'curriculum')['ok']];
}
/** admin.club.catalogue.set — save the divisions (`curriculum`). `reset` restores the NGG divisions. */
function admin_club_catalogue_set(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    if (!empty($p['reset'])) {
        setting_set('club_catalogue', club_catalogue_default(), $by);
        setting_set('club_division_meta', club_division_meta_default(), $by);
        audit('club.catalogue.reset', $by, '', [], (string)($p['ip'] ?? ''));
        if (function_exists('cache_invalidate')) cache_invalidate('catalogue');
        return ['ok' => true, 'reset' => true];
    }
    $raw = $p['catalogue'] ?? null;
    $metaIn = [];
    if (is_array($raw) && $raw && isset($raw[0]) && is_array($raw[0])) {
        $map = [];
        foreach ($raw as $row) {
            if (!is_array($row)) continue;
            $name = trim((string)($row['faculty'] ?? $row['name'] ?? ''));
            if (isset($map[$name])) return ['ok' => false, 'error' => 'duplicate_division', 'detail' => $name . ' is listed twice.'];
            $map[$name] = is_array($row['courses'] ?? null) ? $row['courses'] : [];
            $metaIn[$name] = $row;
        }
        $raw = $map;
    }
    $clean = academy_catalogue_clean($raw);
    if (!$clean) return ['ok' => false, 'error' => 'catalogue_empty'];
    if (count($clean) > CLUB_DIVISIONS_MAX) return ['ok' => false, 'error' => 'too_many_faculties', 'detail' => 'At most ' . CLUB_DIVISIONS_MAX . ' divisions.'];
    // A course belongs to one division: the same name in two would file a member under either.
    $seen = [];
    foreach ($clean as $name => $courses) foreach ($courses as $c) {
        $k = mb_strtolower($c);
        if (isset($seen[$k])) return ['ok' => false, 'error' => 'course_in_two_divisions', 'detail' => $c . ' is in both ' . $seen[$k] . ' and ' . $name . '.'];
        $seen[$k] = $name;
    }
    $old = setting_get('club_division_meta');
    $old = is_array($old) ? $old : [];
    $meta = [];
    foreach (array_keys($clean) as $name) $meta[$name] = club_division_meta_clean($name, $metaIn[$name] ?? ($old[$name] ?? null));
    setting_set('club_catalogue', $clean, $by);
    setting_set('club_division_meta', $meta, $by);
    audit('club.catalogue.set', $by, '', ['divisions' => count($clean)], (string)($p['ip'] ?? ''));
    if (function_exists('cache_invalidate')) cache_invalidate('catalogue');
    return ['ok' => true, 'faculties' => count($clean), 'divisions' => club_divisions()];
}

/** The courses an editor may file a lesson under: the Club's course list, plus
 *  any course already holding lessons (a retired entry must not make its
 *  lessons unfindable). */
function curriculum_courses(): array {
    $all = club_courses();
    foreach (db_all("SELECT DISTINCT course FROM curriculum_units WHERE course <> ''") as $r) $all[] = (string)$r['course'];
    $all = array_values(array_unique(array_filter(array_map('strval', $all))));
    sort($all, SORT_NATURAL | SORT_FLAG_CASE);
    return $all;
}

/** A course name as the catalogue spells it, or null. Case- and space-blind,
 *  so "piano" and "Piano " are the catalogue's "Piano". */
function curriculum_course_canonical(string $course): ?string {
    $want = strtolower(preg_replace('/\s+/', ' ', trim($course)) ?? '');
    if ($want === '') return '';
    foreach (curriculum_courses() as $c) if (strtolower($c) === $want) return $c;
    /* A DIVISION is also a legitimate scope for a lesson — see course_division.
       Checked after the courses so a course always wins a name collision. */
    foreach (curriculum_divisions() as $d) if (strtolower($d) === $want) return $d;
    return null;
}

/** The nearest catalogue course to a misspelt one, for the refusal. */
function curriculum_course_suggest(string $course): string {
    $best = ''; $bestD = PHP_INT_MAX;
    foreach (curriculum_courses() as $c) {
        $d = levenshtein(strtolower($course), strtolower($c));
        if ($d < $bestD) { $bestD = $d; $best = $c; }
    }
    return $bestD <= max(3, (int)(strlen($course) / 3)) ? $best : '';
}

/* ══ Validation — one shape for the editor, the import and the AI draft ═════ */

/**
 * Validate one unit (with its materials and checks) WITHOUT writing.
 *
 * @return array{ok:bool,error?:string,detail?:string,unit?:array,materials?:list<array>,checks?:list<array>}
 */
/**
 * Is this a video the lesson can actually play?
 *
 * The same two hosts the member's renderer embeds, and nothing else: a link
 * the exam cannot play is a question the learner cannot answer, and it must
 * be refused where it is written rather than discovered on a Saturday.
 */
function curriculum_video_ok(string $url): bool {
    $u = trim($url);
    if (!preg_match('~^https://~i', $u)) return false;
    return (bool)preg_match('~^https://(?:www\\.)?(?:youtube\\.com/watch\\?v=|youtu\\.be/)[\\w-]{6,}~i', $u)
        || (bool)preg_match('~^https://(?:www\\.)?vimeo\\.com/\\d+~i', $u)
        || (bool)preg_match('~^https://player\\.vimeo\\.com/video/\\d+~i', $u);
}

function curriculum_validate(array $d, bool $allowNewCourse = false): array {
    $course = curriculum_clean_text($d['course'] ?? '', 120);
    $canon = curriculum_course_canonical($course);
    if ($canon === null) {
        if (!$allowNewCourse) {
            $sug = curriculum_course_suggest($course);
            return ['ok' => false, 'error' => 'unknown_course', 'detail' => $sug !== '' ? 'did you mean ' . $sug . '?' : 'not in the academy catalogue'];
        }
        $canon = $course;
    }
    $title = curriculum_clean_text($d['title'] ?? '', 200);
    if (mb_strlen($title) < 2) return ['ok' => false, 'error' => 'title_required'];
    $week = (int)($d['week'] ?? 1); $pos = (int)($d['position'] ?? ($d['order'] ?? 1));
    if ($week < 1 || $week > 104) return ['ok' => false, 'error' => 'bad_week', 'detail' => 'week must be 1–104'];
    if ($pos < 1 || $pos > 50) return ['ok' => false, 'error' => 'bad_position', 'detail' => 'position must be 1–50'];
    $status = (string)($d['status'] ?? 'draft');
    if (!in_array($status, CURR_STATUSES, true)) $status = 'draft';
    $pass = isset($d['passMark']) && $d['passMark'] !== '' ? (int)$d['passMark'] : 60;
    if ($pass < 0 || $pass > 100) return ['ok' => false, 'error' => 'bad_pass_mark'];
    $unit = [
        'course' => $canon, 'level' => curriculum_clean_text($d['level'] ?? '', 60), 'week' => $week, 'position' => $pos,
        'title' => $title, 'summary' => curriculum_clean_text($d['summary'] ?? '', 1200),
        'objectives' => json_encode(curriculum_list($d['objectives'] ?? []), JSON_UNESCAPED_UNICODE),
        'body' => curriculum_clean_text($d['body'] ?? '', 60000),
        'durationMins' => max(0, min(600, (int)($d['durationMins'] ?? ($d['duration'] ?? 0)))),
        'passMark' => $pass, 'status' => $status,
    ];

    // Materials: [{title,url,kind}] or "url | title" lines.
    $mats = $d['materials'] ?? [];
    if (is_string($mats)) {
        $mats = array_map(static function ($line) {
            [$u, $t] = array_pad(array_map('trim', explode('|', $line, 2)), 2, '');
            return ['url' => $u, 'title' => $t];
        }, array_filter(preg_split('/\r\n|\r|\n/', $mats) ?: [], static fn($l) => trim($l) !== ''));
    }
    if (!empty($d['materialUrl'])) $mats[] = ['url' => (string)$d['materialUrl'], 'title' => (string)($d['materialTitle'] ?? '')];
    $materials = [];
    foreach (is_array($mats) ? $mats : [] as $i => $m) {
        if (!is_array($m)) continue;
        $url = curriculum_material_url((string)($m['url'] ?? ''));
        if ($url === '') return ['ok' => false, 'error' => 'bad_material_url', 'detail' => 'material ' . ($i + 1) . ' needs an https link or an uploaded file'];
        $materials[] = ['url' => $url, 'kind' => curriculum_material_kind((string)($m['kind'] ?? ''), $url),
                        'title' => curriculum_clean_text($m['title'] ?? '', 200) ?: basename((string)parse_url($url, PHP_URL_PATH)) ?: 'Material'];
        if (count($materials) > CURR_MAX_MATERIALS) return ['ok' => false, 'error' => 'too_many_materials', 'max' => CURR_MAX_MATERIALS];
    }

    /* THE REVIEW IS NOT OPTIONAL ON A PUBLISHED LESSON.
       A lesson's questions are sat at the start of the NEXT session, so a
       published lesson with none is a week of teaching that is never asked
       about again — and nothing on any screen would ever say so. The floor
       here is one, deliberately, not the three the editor asks for: 587 of
       the 588 bundled lessons carry one or two, and a rule the shipped
       curriculum cannot meet is a rule that stops the boot seeder rather
       than one that raises anybody's standard. Three stays the standard an
       author is held to while writing; one is what the system refuses to
       publish below. */

    // Checks: [{kind,prompt,options,answer,rubric,points}].
    $checks = [];
    foreach (is_array($d['checks'] ?? null) ? $d['checks'] : [] as $i => $c) {
        if (!is_array($c)) continue;
        $prompt = curriculum_clean_text($c['prompt'] ?? ($c['question'] ?? ''), 1000);
        if ($prompt === '') continue;
        $kind = strtolower((string)($c['kind'] ?? (isset($c['options']) ? 'mcq' : 'short')));
        if (!in_array($kind, CURR_CHECK_KINDS, true)) $kind = 'short';
        $opts = curriculum_list($c['options'] ?? [], 8, 300);
        $answer = trim((string)($c['answer'] ?? ''));
        if ($kind === 'mcq') {
            if (count($opts) < 2) return ['ok' => false, 'error' => 'mcq_needs_options', 'detail' => 'check ' . ($i + 1)];
            /* The answer is an option's index — or its text, or its letter,
               because a sheet typed by a person says "B" or "photosynthesis".

               THE TEXT IS TRIED FIRST, and that order matters. A music theory
               question whose options are D / E / F / G and whose answer is "E"
               means the option reading "E", not the fifth option, which does
               not exist. Reading the letter first rejected the lesson, and the
               boot seeder skips a row it cannot validate — so a whole lesson
               vanished with nothing turning red. Where an answer exactly
               matches an option, that is what was meant; the letter convention
               is the fallback for when nothing matches. */
            $idx = null;
            foreach ($opts as $k => $o) if (strcasecmp($o, $answer) === 0) { $idx = $k; break; }
            if ($idx === null && ctype_digit($answer) && (int)$answer < count($opts)) $idx = (int)$answer;
            if ($idx === null && preg_match('/^[A-Ha-h]$/', $answer)) $idx = ord(strtoupper($answer)) - 65;
            if ($idx === null || $idx >= count($opts)) return ['ok' => false, 'error' => 'mcq_answer_missing', 'detail' => 'check ' . ($i + 1) . ': the answer must be one of its options'];
            $answer = (string)$idx;
        }
        /* Only a 'watch' question carries a video, and it must carry one —
           otherwise it is a question about a film nobody was shown. */
        $video = '';
        if ($kind === 'watch') {
            $video = trim((string)($c['videoUrl'] ?? ''));
            if ($video === '' || !curriculum_video_ok($video)) {
                return ['ok' => false, 'error' => 'watch_needs_video',
                        'detail' => 'check ' . ($i + 1) . ': a “watch and tell me” question needs a YouTube or Vimeo link'];
            }
        }
        $checks[] = ['checkId' => preg_match('/^CHK-[A-F0-9]{6,16}$/', (string)($c['checkId'] ?? '')) ? (string)$c['checkId'] : '',
            'kind' => $kind, 'prompt' => $prompt, 'options' => json_encode($opts, JSON_UNESCAPED_UNICODE), 'answer' => mb_substr($answer, 0, 2000),
            'rubric' => curriculum_clean_text($c['rubric'] ?? '', 2000), 'points' => max(1, min(20, (int)($c['points'] ?? 1))),
            'videoUrl' => $video, 'source' => (string)($c['source'] ?? '') === 'ai' ? 'ai' : 'manual'];
        if (count($checks) > CURR_MAX_CHECKS) return ['ok' => false, 'error' => 'too_many_checks', 'max' => CURR_MAX_CHECKS];
    }
    if ($status === 'published' && !$checks) {
        return ['ok' => false, 'error' => 'review_required',
                'detail' => 'a published lesson needs at least one question — your class sits them at the start of the next session'];
    }
    /* MORE THAN RECOGNITION.
       A review made only of multiple choice measures whether a child can
       pick the right words off a list a week later, which is not the same
       as being able to do the thing — and in a programme of practical
       subjects it is not close. Every published lesson must ask for at
       least one piece of work, explanation or reflection that cannot be
       guessed from four options.
       All 588 bundled lessons meet this; 45 of them did not until the
       practical question each one was missing was written. */
    if ($status === 'published' && !array_filter($checks, static fn($c) => $c['kind'] !== 'mcq')) {
        return ['ok' => false, 'error' => 'review_too_shallow',
                'detail' => 'a review cannot be multiple choice alone — add one question that asks them to do, explain or show something'];
    }
    return ['ok' => true, 'unit' => $unit, 'materials' => $materials, 'checks' => $checks];
}

/** A fingerprint of a validated unit's content, for "unchanged". */
function curriculum_fingerprint(array $v): string {
    $u = $v['unit'];
    unset($u['status']);
    $strip = static fn($xs) => array_map(static function ($x) { unset($x['checkId']); return $x; }, $xs);
    return hash('sha256', json_encode([$u, $v['materials'], $strip($v['checks'])], JSON_UNESCAPED_UNICODE));
}

function curriculum_fingerprint_stored(array $bundle): string {
    $u = $bundle['unit'];
    $unit = ['course' => (string)$u['course'], 'level' => (string)$u['level'], 'week' => (int)$u['week'], 'position' => (int)$u['position'],
        'title' => (string)$u['title'], 'summary' => (string)$u['summary'], 'objectives' => (string)$u['objectives'], 'body' => (string)$u['body'],
        'durationMins' => (int)$u['durationMins'], 'passMark' => (int)$u['passMark']];
    $mats = array_map(static fn($m) => ['url' => (string)$m['url'], 'kind' => (string)$m['kind'], 'title' => (string)$m['title']], $bundle['materials']);
    /* Every field the validated shape carries has to appear here too, in the
       same order: these two hashes are compared to decide "unchanged", so a
       field on one side and not the other makes every row look edited —
       which turns a re-import of the same sheet into an update of every
       lesson in it. That is what adding `videoUrl` did until this line
       learned about it. */
    $checks = array_map(static fn($c) => ['kind' => (string)$c['kind'], 'prompt' => (string)$c['prompt'], 'options' => (string)$c['options'],
        'answer' => (string)$c['answer'], 'rubric' => (string)$c['rubric'], 'points' => (int)$c['points'],
        'videoUrl' => (string)($c['videoUrl'] ?? ''), 'source' => (string)$c['source']], $bundle['checks']);
    return hash('sha256', json_encode([$unit, $mats, $checks], JSON_UNESCAPED_UNICODE));
}

/**
 * Write a validated unit. Updates in place when `$existing` is given; the
 * version moves when the CHECKS changed on a unit somebody has already sat,
 * because their score answered the old questions.
 */
function curriculum_write(array $v, ?array $existing, string $by, string $source): string {
    $now = now_iso();
    $unit = $v['unit'];
    $unitId = $existing ? (string)$existing['unitId'] : 'CUR-' . strtoupper(rand_hex(5));
    db_tx(function () use ($v, $existing, $by, $source, $now, $unit, $unitId) {
        $checksBefore = $existing ? db_all('SELECT kind, prompt, options, answer, points FROM curriculum_checks WHERE unitId = ? ORDER BY position, id', [$unitId]) : [];
        $checksAfter = array_map(static fn($c) => ['kind' => $c['kind'], 'prompt' => $c['prompt'], 'options' => $c['options'], 'answer' => $c['answer'], 'points' => $c['points']], $v['checks']);
        $sat = $existing ? (bool)db_row('SELECT id FROM curriculum_progress WHERE unitId = ? AND attempts > 0 LIMIT 1', [$unitId]) : false;
        $norm = static fn($rows) => json_encode(array_map(static fn($r) => array_map('strval', $r), $rows));
        $bump = $existing && $sat && $norm($checksBefore) !== $norm($checksAfter);
        $row = $unit + ['updatedBy' => $by, 'updatedAt' => $now];
        if ($unit['status'] === 'published' && (!$existing || (string)$existing['status'] !== 'published')) $row['publishedAt'] = $now;
        if ($existing) {
            if ($bump) $row['version'] = (int)$existing['version'] + 1;
            db_update('curriculum_units', $row, ['unitId' => $unitId]);
        } else {
            db_insert('curriculum_units', $row + ['unitId' => $unitId, 'source' => $source, 'createdBy' => $by, 'createdAt' => $now, 'version' => 1]);
        }
        // The editor's list replaces the APPROVED materials; submissions
        // waiting for review (or turned down) are left exactly as they are.
        db_exec("DELETE FROM curriculum_materials WHERE unitId = ? AND COALESCE(status,'approved') = 'approved'", [$unitId]);
        foreach ($v['materials'] as $i => $m) {
            db_insert('curriculum_materials', ['materialId' => 'MAT-' . strtoupper(rand_hex(5)), 'unitId' => $unitId, 'kind' => $m['kind'],
                'title' => $m['title'], 'url' => $m['url'], 'position' => $i + 1, 'createdAt' => $now, 'status' => 'approved', 'submittedBy' => $by]);
        }
        /* Checks keep their ids where the editor sent them back, so a progress
           row's answers still point at the question they answered. */
        $keep = array_values(array_filter(array_column($v['checks'], 'checkId')));
        if ($keep) {
            $ph = implode(',', array_fill(0, count($keep), '?'));
            db_exec("DELETE FROM curriculum_checks WHERE unitId = ? AND checkId NOT IN ($ph)", array_merge([$unitId], $keep));
        } else {
            db_exec('DELETE FROM curriculum_checks WHERE unitId = ?', [$unitId]);
        }
        foreach ($v['checks'] as $i => $c) {
            $fields = ['kind' => $c['kind'], 'prompt' => $c['prompt'], 'options' => $c['options'], 'answer' => $c['answer'],
                       'rubric' => $c['rubric'], 'points' => $c['points'], 'position' => $i + 1, 'source' => $c['source'],
                       'videoUrl' => (string)($c['videoUrl'] ?? '')];
            if ($c['checkId'] !== '' && db_row('SELECT id FROM curriculum_checks WHERE checkId = ? AND unitId = ?', [$c['checkId'], $unitId])) {
                db_update('curriculum_checks', $fields, ['checkId' => $c['checkId']]);
            } else {
                db_insert('curriculum_checks', $fields + ['checkId' => 'CHK-' . strtoupper(rand_hex(5)), 'unitId' => $unitId]);
            }
        }
    });
    return $unitId;
}

/* ══ The Control Room ═══════════════════════════════════════════════════════ */

function admin_curriculum_list(array $p): array {
    // Reads: the curriculum desk, and the Club desk that runs the classes.
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $where = ['1=1']; $args = [];
    $course = trim((string)($p['course'] ?? ''));
    if ($course !== '') { $where[] = 'course = ?'; $args[] = $course === '__all' ? '' : $course; }
    $status = (string)($p['status'] ?? '');
    if (in_array($status, CURR_STATUSES, true)) { $where[] = 'status = ?'; $args[] = $status; }
    else $where[] = "status <> 'retired'";
    [$qSql, $qArgs] = sql_text_search((string)($p['q'] ?? ''), ['title', 'summary']);
    if ($qSql !== '') { $where[] = $qSql; foreach ($qArgs as $a) $args[] = $a; }
    $units = db_all('SELECT * FROM curriculum_units WHERE ' . implode(' AND ', $where) . ' ORDER BY course, level, week, position LIMIT 2000', $args);
    $ids = array_map(static fn($u) => (string)$u['unitId'], $units);
    $counts = ['m' => [], 'c' => [], 'p' => []];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT unitId, COUNT(*) n FROM curriculum_materials WHERE unitId IN ($ph) AND COALESCE(status,'approved') = 'approved' GROUP BY unitId", $ids) as $r) $counts['m'][$r['unitId']] = (int)$r['n'];
        foreach (db_all("SELECT unitId, COUNT(*) n FROM curriculum_checks WHERE unitId IN ($ph) GROUP BY unitId", $ids) as $r) $counts['c'][$r['unitId']] = (int)$r['n'];
        foreach (db_all("SELECT unitId, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) done, COUNT(*) started,
                                SUM(pending) pend, AVG(CASE WHEN attempts > 0 THEN bestPct END) avgPct
                         FROM curriculum_progress WHERE unitId IN ($ph) GROUP BY unitId", $ids) as $r) {
            $counts['p'][$r['unitId']] = ['completed' => (int)$r['done'], 'started' => (int)$r['started'], 'pending' => (int)$r['pend'],
                                          'avgPct' => $r['avgPct'] !== null ? (int)round((float)$r['avgPct']) : null];
        }
    }
    $out = array_map(static fn($u) => [
        'unitId' => (string)$u['unitId'], 'course' => (string)$u['course'], 'level' => (string)$u['level'],
        'week' => (int)$u['week'], 'position' => (int)$u['position'], 'title' => (string)$u['title'],
        'path' => curriculum_path((string)$u['level'], (int)$u['week']),
        'status' => (string)$u['status'], 'version' => (int)$u['version'], 'source' => (string)$u['source'],
        'materials' => $counts['m'][$u['unitId']] ?? 0, 'checks' => $counts['c'][$u['unitId']] ?? 0,
        'progress' => $counts['p'][$u['unitId']] ?? ['completed' => 0, 'started' => 0, 'pending' => 0, 'avgPct' => null],
        'updatedAt' => (string)$u['updatedAt'],
    ], $units);
    /* Divisions as well as courses, because a lesson may be filed against a
       whole division (course_division) — and an editor that cannot offer the
       scope the matcher honours is an editor that cannot write half the
       curriculum. */
    /* The same reference the AI drafter is given, per course, so the person
       writing by hand is held to the standard the machine is held to. One
       map, two consumers — a second copy for the screen is how the two
       start recommending different things. */
    $refs = [];
    foreach (curriculum_courses() as $c) {
        $r = curriculum_exam_reference((string)$c);
        if ($r) $refs[(string)$c] = ['body' => $r['body'], 'award' => $r['award'], 'assesses' => $r['assesses'], 'ask' => $r['ask'], 'link' => $r['link']];
    }
    return ['ok' => true, 'units' => $out, 'courses' => curriculum_courses(), 'examRefs' => $refs, 'divisions' => curriculum_divisions(),
            'canWrite' => in_array('curriculum', member_effective_caps($g['requester']), true),
            'aiEnabled' => function_exists('ai_enabled') && ai_enabled(), 'aiMarking' => function_exists('ai_enabled') && ai_enabled('marking')];
}

function admin_curriculum_get(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $b = curriculum_load('unitId = ?', [(string)($p['unitId'] ?? '')]);
    if (!$b) return ['ok' => false, 'error' => 'not_found'];
    $x = reset($b);
    return ['ok' => true, 'unit' => curriculum_unit_public($x['unit'], $x['materials'], $x['checks'], true)];
}

function admin_curriculum_upsert(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $v = curriculum_validate($d, !empty($p['allowNewCourse']));
    if (!$v['ok']) return $v;
    $id = (string)($d['unitId'] ?? '');
    $existing = $id !== '' ? db_row('SELECT * FROM curriculum_units WHERE unitId = ?', [$id]) : null;
    if ($id !== '' && !$existing) return ['ok' => false, 'error' => 'not_found'];
    $u = $v['unit'];
    $clash = db_row('SELECT unitId FROM curriculum_units WHERE course = ? AND level = ? AND week = ? AND position = ? LIMIT 1',
                    [$u['course'], $u['level'], $u['week'], $u['position']]);
    if ($clash && (!$existing || (string)$clash['unitId'] !== $id)) {
        return ['ok' => false, 'error' => 'slot_taken', 'detail' => 'another lesson is already week ' . $u['week'] . ', position ' . $u['position'] . ' of this course', 'unitId' => (string)$clash['unitId']];
    }
    $unitId = curriculum_write($v, $existing, (string)$g['requester']['memberId'], (string)($d['source'] ?? '') === 'ai' ? 'ai' : 'manual');
    audit('curriculum.' . ($existing ? 'update' : 'create'), (string)$g['requester']['memberId'], $unitId,
          ['course' => $u['course'], 'week' => $u['week'], 'status' => $u['status']], (string)($p['ip'] ?? ''));
    return admin_curriculum_get(['requesterId' => $p['requesterId'], 'unitId' => $unitId]);
}

/**
 * Publish, unpublish (back to draft) or retire many units. A unit with progress
 * is retired rather than deleted, because its scores point at it; `delete` is
 * refused for those with `has_progress`.
 */
function admin_curriculum_status(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $action = (string)($p['action'] ?? '');
    $map = ['publish' => 'published', 'unpublish' => 'draft', 'retire' => 'retired', 'delete' => null];
    if (!array_key_exists($action, $map)) return ['ok' => false, 'error' => 'unknown_action'];
    $to = $map[$action];   // null = delete
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['unitIds'] ?? null) ? $p['unitIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > CURR_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CURR_BULK_MAX];
    $results = []; $applied = 0; $refused = 0; $unchanged = 0; $now = now_iso();
    foreach ($ids as $id) {
        $u = db_row('SELECT unitId, title, status FROM curriculum_units WHERE unitId = ?', [$id]);
        if (!$u) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; $refused++; continue; }
        if ($to === null) {
            if (db_row('SELECT id FROM curriculum_progress WHERE unitId = ? LIMIT 1', [$id])) {
                $results[] = ['id' => $id, 'name' => $u['title'], 'ok' => false, 'error' => 'has_progress']; $refused++; continue;
            }
            db_exec('DELETE FROM curriculum_checks WHERE unitId = ?', [$id]);
            db_exec('DELETE FROM curriculum_materials WHERE unitId = ?', [$id]);
            db_exec('DELETE FROM curriculum_units WHERE unitId = ?', [$id]);
            $results[] = ['id' => $id, 'name' => $u['title'], 'ok' => true]; $applied++; continue;
        }
        if ((string)$u['status'] === $to) { $results[] = ['id' => $id, 'name' => $u['title'], 'ok' => true, 'unchanged' => true]; $unchanged++; continue; }
        if ($to === 'published' && !db_row('SELECT id FROM curriculum_units WHERE unitId = ? AND title <> ?', [$id, ''])) {
            $results[] = ['id' => $id, 'ok' => false, 'error' => 'title_required']; $refused++; continue;
        }
        /* The same floor the editor's own save is held to. Publishing is a
           second door onto the same act, and a rule enforced on one door
           only is a rule anybody reaches past by using the other — here, by
           selecting forty drafts and pressing Publish. Refused per row and
           named, as every bulk op in this codebase is. */
        if ($to === 'published' && !db_row('SELECT id FROM curriculum_checks WHERE unitId = ? LIMIT 1', [$id])) {
            $results[] = ['id' => $id, 'name' => $u['title'], 'ok' => false, 'error' => 'review_required']; $refused++; continue;
        }
        if ($to === 'published' && !db_row("SELECT id FROM curriculum_checks WHERE unitId = ? AND kind <> 'mcq' LIMIT 1", [$id])) {
            $results[] = ['id' => $id, 'name' => $u['title'], 'ok' => false, 'error' => 'review_too_shallow']; $refused++; continue;
        }
        $row = ['status' => $to, 'updatedAt' => $now, 'updatedBy' => (string)$g['requester']['memberId']];
        if ($to === 'published') $row['publishedAt'] = $now;
        db_update('curriculum_units', $row, ['unitId' => $id]);
        $results[] = ['id' => $id, 'name' => $u['title'], 'ok' => true]; $applied++;
    }
    audit('curriculum.bulk', (string)$g['requester']['memberId'], '', ['action' => $action, 'count' => count($ids), 'applied' => $applied, 'refused' => $refused], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'results' => $results];
}

/**
 * Import lessons in bulk — the seed, and every later revision of it.
 *
 * Rows are the editor's shape (course, level, week, position, title, summary,
 * objectives, body, materials, checks). Matched on the natural key, so a
 * second run of the same sheet reports `unchanged` and a corrected one
 * `update`. A dry run first, always: the apply must send back the dry run's
 * digest, so the rows somebody read are the rows that are written. Unknown
 * courses are refused with the nearest catalogue course, unless the run says
 * new courses are intended.
 */
function admin_curriculum_import(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $rows = is_array($p['rows'] ?? null) ? array_values($p['rows']) : [];
    if (!$rows) return ['ok' => false, 'error' => 'nothing_to_import'];
    if (count($rows) > CURR_IMPORT_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CURR_IMPORT_MAX];
    $allowNew = !empty($p['allowNewCourse']);
    $publish = !empty($p['publish']);
    $digest = hash('sha256', json_encode([$rows, $allowNew, $publish], JSON_UNESCAPED_UNICODE));
    $dry = !empty($p['dryRun']);
    if (!$dry && (string)($p['digest'] ?? '') !== $digest) return ['ok' => false, 'error' => 'import_changed',
        'message' => 'These rows are not the ones that were checked. Run the check again.'];

    // Validate EVERYTHING before writing anything (and catch duplicate keys in the file).
    $plan = []; $seen = [];
    foreach ($rows as $i => $r) {
        if (!is_array($r)) { $plan[] = ['row' => $i + 1, 'verdict' => 'failed', 'error' => 'not_a_row']; continue; }
        /* A row with nothing to ask comes in as a DRAFT rather than being
           thrown out. The invariant stands — nothing publishes without a
           question for the next session's review — but a spreadsheet of a
           hundred lessons must not import zero of them because some rows
           have no questions yet. The row lands, it is named, and somebody
           writes the question and publishes it.
           Only a row that did not ASK to be published is moved; a sheet
           that says `status: published` outright is still refused by
           curriculum_validate, because that one is a stated intention. */
        $rChecks = is_array($r['checks'] ?? null) ? $r['checks'] : [];
        $noAsk = !$rChecks && !($r['check1'] ?? '') && !($r['check1_prompt'] ?? '');
        // Multiple choice alone is held back for the same reason nothing at
        // all is: it would publish a week that is never really revisited.
        if (!$noAsk && $rChecks) {
            $noAsk = !array_filter($rChecks, static fn($c) => is_array($c) && strtolower((string)($c['kind'] ?? 'short')) !== 'mcq');
        }
        $heldBack = false;
        if ($publish && !isset($r['status'])) {
            if ($noAsk) { $r['status'] = 'draft'; $heldBack = true; }
            else $r['status'] = 'published';
        }
        $v = curriculum_validate($r, $allowNew);
        // A refused row still says which course and week it was, so the operator can see what to fix.
        if (!$v['ok']) { $plan[] = ['row' => $i + 1, 'title' => (string)($r['title'] ?? ''), 'course' => mb_substr(trim((string)($r['course'] ?? '')), 0, 120), 'week' => (int)($r['week'] ?? 0),
                                    'verdict' => 'failed', 'error' => $v['error'], 'detail' => $v['detail'] ?? '']; continue; }
        $u = $v['unit'];
        $key = strtolower($u['course'] . '|' . $u['level'] . '|' . $u['week'] . '|' . $u['position']);
        if (isset($seen[$key])) { $plan[] = ['row' => $i + 1, 'title' => $u['title'], 'verdict' => 'failed', 'error' => 'duplicate_in_file', 'detail' => 'same course, level, week and position as row ' . $seen[$key]]; continue; }
        $seen[$key] = $i + 1;
        $existing = db_row('SELECT * FROM curriculum_units WHERE course = ? AND level = ? AND week = ? AND position = ? LIMIT 1', [$u['course'], $u['level'], $u['week'], $u['position']]);
        $verdict = 'create';
        if ($existing) {
            $b = curriculum_load('unitId = ?', [(string)$existing['unitId']]);
            $same = curriculum_fingerprint_stored(reset($b)) === curriculum_fingerprint($v);
            $verdict = ($same && ((string)$existing['status'] === $u['status'] || !isset($r['status']))) ? 'unchanged' : 'update';
            if (!isset($r['status'])) $v['unit']['status'] = (string)$existing['status'];
        }
        $plan[] = ['row' => $i + 1, 'title' => $u['title'], 'course' => $u['course'], 'week' => $u['week'], 'position' => $u['position'],
                   'verdict' => $verdict, 'unitId' => $existing ? (string)$existing['unitId'] : '', '_v' => $v, '_e' => $existing,
                   'materials' => count($v['materials']), 'checks' => count($v['checks'])]
                   + ($heldBack ? ['note' => 'review_required', 'detail' => 'imported as a draft: no question for the next session to review'] : []);
    }
    $tally = ['create' => 0, 'update' => 0, 'unchanged' => 0, 'failed' => 0, 'drafted' => 0];
    foreach ($plan as $x) { $tally[$x['verdict']]++; if (($x['note'] ?? '') === 'review_required') $tally['drafted']++; }
    $public = static fn($pl) => array_map(static function ($x) { unset($x['_v'], $x['_e']); return $x; }, $pl);
    if ($dry) return ['ok' => true, 'dryRun' => true, 'digest' => $digest, 'tally' => $tally, 'rows' => $public($plan)];

    $by = (string)$g['requester']['memberId'];
    foreach ($plan as &$x) {
        if (!in_array($x['verdict'], ['create', 'update'], true)) continue;
        $x['unitId'] = curriculum_write($x['_v'], $x['_e'], $by, 'import');
    }
    unset($x);
    audit('curriculum.import', $by, '', $tally + ['rows' => count($rows)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'dryRun' => false, 'tally' => $tally, 'rows' => $public($plan)];
}

/**
 * Bundled courses — curricula that ship with the code (api/_lib/seeds/
 * curriculum-*.json). There is no shell on the host, so "seed the course"
 * cannot mean a script somebody runs: it means a file the Control Room can
 * load into the ordinary import, where it is checked, shown row by row and
 * written only when somebody presses Import. Running it again after a revised
 * file ships updates the changed lessons and reports the rest as unchanged.
 *
 * admin.curriculum.seed — with no key, the list; with a key, that course's rows.
 */
function curriculum_seed_files(): array {
    $out = [];
    foreach (glob(__DIR__ . '/../seeds/curriculum-*.json') ?: [] as $f) {
        $j = json_decode((string)file_get_contents($f), true);
        if (!is_array($j) || !preg_match('/^[a-z0-9-]{3,60}$/', (string)($j['key'] ?? ''))) continue;
        $out[(string)$j['key']] = $j;
    }
    ksort($out);
    return $out;
}
/**
 * Seed the bundled curricula into the live lessons, once, on boot.
 *
 * Importing four files by hand in the Control Room is fine for a deployment
 * somebody is setting up deliberately, and wrong for every other one: a fresh
 * install had 336 written lessons sitting in the repository and a member
 * opening Learn saw an empty list until an admin happened to find the import
 * screen and press it four times.
 *
 * Runs from db_run_seeds(), so it happens on the first request after a deploy
 * with no shell and nothing to remember.
 *
 * Three things it will not do:
 *
 *  · It never TOUCHES a lesson that already exists. A course, level, week and
 *    position that is already there belongs to whoever put it there — an
 *    instructor's own lesson is not overwritten by a shipped one.
 *  · It records progress PER FILE. 336 lessons with their checks and materials
 *    is more work than a shared host should do in one request, so each request
 *    seeds at most one file and the next picks up where it stopped. A timeout
 *    costs one file's worth of retry, never the whole set.
 *  · It writes through curriculum_write(), the same path the import screen
 *    uses, so a seeded lesson is indistinguishable from an imported one and
 *    carries the same fingerprint, version and audit trail.
 *
 * Published, not drafted: these are the programme's own reviewed curricula,
 * not an AI draft waiting on a human. A lesson nobody can see teaches nobody.
 */
function curriculum_seed_bundled_once(): int {
    if (!function_exists('setting_raw')) return 0;
    /* A deployment may decline the bundled curriculum. NGG's own courses ship
       with the code and seed themselves, which is right for NGG and wrong for
       anyone running this for a different programme — and for a test that is
       about what the IMPORT does, where 540 lessons arriving unasked is the
       difference between "2 new" and "2 unchanged".
       Set 'seed_bundled_curriculum' => false in api/config.php. Absent, it
       seeds: the default is the behaviour the programme wants. */
    if (array_key_exists('seed_bundled_curriculum', (array)($GLOBALS['CONFIG'] ?? []))
        && !$GLOBALS['CONFIG']['seed_bundled_curriculum']) return 0;
    $written = 0;
    foreach (curriculum_seed_files() as $key => $j) {
        $flag = 'seed_curriculum_' . preg_replace('/[^a-z0-9]+/', '_', strtolower($key));
        if ((string)setting_raw($flag) === '1') continue;
        foreach (($j['lessons'] ?? []) as $row) {
            if (!is_array($row)) continue;
            $row['status'] = 'published';
            $v = curriculum_validate($row, !empty($j['allowNewCourse']));
            if (!$v['ok']) continue;                       // a bad row is skipped, never guessed at
            $u = $v['unit'];
            $existing = db_row('SELECT * FROM curriculum_units WHERE course = ? AND level = ? AND week = ? AND position = ? LIMIT 1',
                               [$u['course'], $u['level'], $u['week'], $u['position']]);
            if ($existing) continue;                       // somebody else's lesson stays theirs
            curriculum_write($v, null, 'system', 'seed');
            $written++;
        }
        setting_set($flag, '1', 'system');
        if (function_exists('audit')) audit('curriculum.seed', null, $key, ['written' => $written], '');
        break;                                             // one file per request
    }
    return $written;
}

function admin_curriculum_seed(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $all = curriculum_seed_files();
    $key = (string)($p['key'] ?? '');
    if ($key === '') {
        return ['ok' => true, 'seeds' => array_values(array_map(static fn($j) => ['key' => (string)$j['key'], 'title' => (string)($j['title'] ?? $j['key']),
            'description' => (string)($j['description'] ?? ''), 'source' => (string)($j['source'] ?? ''), 'lessons' => count($j['lessons'] ?? [])], $all))];
    }
    if (!isset($all[$key])) return ['ok' => false, 'error' => 'not_found'];
    /* A seed may file its lessons under a course the catalogue does not list
       (the Media Lab spans design, photography, video and social media, so it is
       not one of Graphics Design / Video Editing). It says so, and the import
       screen ticks "allow new courses" visibly rather than refusing every row. */
    return ['ok' => true, 'key' => $key, 'title' => (string)($all[$key]['title'] ?? $key), 'allowNewCourse' => !empty($all[$key]['allowNewCourse']),
        'rows' => array_values($all[$key]['lessons'] ?? [])];
}

/* ══ Course coverage, and a term's outline for a course that has none ══════
 *
 * The catalogue lists the courses NGG offers; lessons exist for some of them.
 * A member whose course has no published lesson opens Learn to an empty list,
 * and nothing told staff which courses those were. admin.curriculum.coverage
 * says, course by course, what is written, for which years and weeks, and how
 * many members take it — courses with members and no lessons first.
 * admin.curriculum.plan drafts a term's outline for one course (titles,
 * summaries, objectives) for the ordinary import to check and write as DRAFTS;
 * each is then written with "Write the lesson" (admin.curriculum.ai) and
 * published. Nothing reaches a member until somebody publishes it.
 */
const CURR_PLAN_WEEKS_MAX = 24;
/* The NGG term arc: fundamentals, a mini project, a real brief, a capstone, a
 * showcase. Used as written when no AI is configured, and as the spine the AI
 * is asked to follow when one is. */
const CURR_PLAN_ARC = [
    ['Welcome to {c}: tools, safety and a first win', 'Meet the tools, agree how we work, and finish something small today.'],
    ['{c} fundamentals: the core idea', 'The one idea everything else in {c} builds on, practised until it is easy.'],
    ['{c} fundamentals: practising the basics', 'Short, repeated practice of the basics, with feedback from a partner.'],
    ['{c} fundamentals: putting it together', 'Combine the basics into one complete piece of work.'],
    ['Mini project: plan it', 'Choose a small project, plan it in steps, and agree what "done" looks like.'],
    ['Mini project: make it and show it', 'Build the mini project, test it, fix what does not work, and show it to the group.'],
    /* Weeks 7 and 11 reach BACK before they go forward. Spacing and retrieval
     * are the best-evidenced things in this arc — a concept met again a few
     * weeks later sticks far better than the same time spent re-reading it —
     * and nothing in the old arc did either. Every other week ends in a recall
     * check; these two are where the course revisits on purpose. */
    ['Looking back, and a new technique', 'Pick up the fundamentals from weeks 1–4 again, this time to serve a technique that takes your {c} work up a level.'],
    /* Every trade in this programme now uses AI, and a child who cannot check
     * what it tells them is not safer for having avoided it. */
    ['AI in {c}: what it does well, and where it is wrong', 'Use an AI tool on a real {c} task, then find where it was confidently wrong and correct it.'],
    ['Real-world brief: a problem in our community', 'Use {c} on a real problem someone in Nigeria has, and explain your choices.'],
    ['Capstone: plan and prototype', 'Plan the term capstone and make a first rough version.'],
    ['Capstone: build and test', 'Finish the capstone using what you learned earlier in the term, and test it with someone who has not seen it.'],
    ['Showcase and reflection', 'Present the capstone, celebrate the term, and set one goal for next term.'],
];

/**
 * THE DIVISION COVERAGE BOARD — which division has a curriculum, for which year.
 *
 * `courseSource = division` makes the division the enrolment, so a division
 * with no lessons for a year is not a gap in a report: it is that year's
 * members opening their portal and finding nothing. The spine that ships
 * (curriculum-divisions-2026.json) covers Year 1 only, so this board exists
 * to make the other two years visible while they are written, rather than
 * discovered by a child.
 *
 * Counts the division's OWN course — the one named after it — because that is
 * exactly what the mode delivers. Strand courses are reported separately by
 * admin_curriculum_coverage().
 */
function admin_curriculum_divisions(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'audit']); if (!$g['ok']) return $g;
    $cfg = curriculum_schedule();
    $divisions = function_exists('nggc_divisions') ? nggc_divisions() : [];

    $byCourse = [];
    foreach (db_all("SELECT course, level, status, COUNT(*) n FROM curriculum_units
                     WHERE status IN ('published','draft') AND course <> '' GROUP BY course, level, status") as $r) {
        $y = curriculum_level_year((string)$r['level']);
        $byCourse[mb_strtolower(trim((string)$r['course']))][$y][(string)$r['status']]
            = ($byCourse[mb_strtolower(trim((string)$r['course']))][$y][(string)$r['status']] ?? 0) + (int)$r['n'];
    }

    /* Who it would reach. Counted through the SAME resolver a member's own
       page uses, so this cannot drift from what they actually see. */
    $heads = []; $unplaced = 0;
    $placed = [];
    foreach (db_all('SELECT memberId, stateValue FROM member_state WHERE stateKey = ?', [CURR_YEAR_KEY]) as $r) $placed[(string)$r['memberId']] = (int)$r['stateValue'];
    $scope = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    $where = "status = 'active' AND COALESCE(type,'NGG') <> 'Summer'"; $args = [];
    if ($scope !== null) {
        if (!$scope) $where .= ' AND 1 = 0';
        else { $where .= ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = $scope; }
    }
    foreach (db_all("SELECT memberId, track, courses, division, centre FROM members WHERE $where", $args) as $m) {
        $dv = curriculum_member_division($m);
        if ($dv === '') { $unplaced++; continue; }
        $y = curriculum_member_year($m, $placed[(string)$m['memberId']] ?? 0)['year'];
        $k2 = mb_strtolower($dv);
        $heads[$k2]['n'] = ($heads[$k2]['n'] ?? 0) + 1;
        $heads[$k2][$y] = ($heads[$k2][$y] ?? 0) + 1;
    }

    $rows = [];
    foreach ($divisions as $d) {
        $k = mb_strtolower((string)$d['name']);
        $years = [];
        for ($y = 1; $y <= CURR_PROGRAMME_YEARS; $y++) {
            $pub = (int)($byCourse[$k][$y]['published'] ?? 0);
            $drf = (int)($byCourse[$k][$y]['draft'] ?? 0);
            $years[] = ['year' => $y, 'published' => $pub, 'draft' => $drf, 'has' => $pub > 0,
                        /* The number that matters: members placed in this
                           year who, in division mode, would open their portal
                           and find nothing. */
                        'members' => (int)($heads[$k][$y] ?? 0)];
        }
        $rows[] = ['id' => (string)$d['id'], 'name' => (string)$d['name'],
                   'members' => (int)($heads[$k]['n'] ?? 0),
                   'noYear' => (int)($byCourse[$k][0]['published'] ?? 0),   // lessons whose level names no year
                   'years' => $years,
                   'gaps' => array_values(array_map(static fn($y) => $y['year'], array_filter($years, static fn($y) => !$y['has'])))];
    }
    /* Members who, in division mode, are placed in a year their division has
       no published spine for. Counted, not estimated — it is the cost of
       turning the mode on today, and nobody should have to infer it. */
    $stranded = 0;
    foreach ($rows as $r) foreach ($r['years'] as $y) if (!$y['has']) $stranded += (int)$y['members'];
    return ['ok' => true, 'rows' => $rows, 'courseSource' => (string)$cfg['courseSource'],
            'years' => CURR_PROGRAMME_YEARS, 'unplaced' => $unplaced, 'stranded' => $stranded];
}

function admin_curriculum_coverage(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'audit']); if (!$g['ok']) return $g;
    $catalogue = function_exists('club_catalogue') ? club_catalogue() : [];
    $divOf = []; $courses = [];
    foreach ($catalogue as $div => $cs) foreach ($cs as $c) { $k = mb_strtolower(trim((string)$c)); if (!isset($courses[$k])) { $courses[$k] = (string)$c; $divOf[$k] = (string)$div; } }
    $stat = [];
    foreach (db_all("SELECT course, level, week, status, body FROM curriculum_units WHERE status IN ('published', 'draft') AND course <> ''") as $u) {
        $k = mb_strtolower(trim((string)$u['course']));
        if (!isset($courses[$k])) { $courses[$k] = (string)$u['course']; $divOf[$k] = ''; }
        $s = &$stat[$k];
        $s = ($s ?? []) + ['published' => 0, 'draft' => 0, 'years' => [], 'weeks' => 0, 'homework' => 0];
        if ($u['status'] === 'published') {
            $s['published']++;
            $s['weeks'] = max($s['weeks'], (int)$u['week']);
            $y = curriculum_level_year((string)$u['level']); if ($y) $s['years'][$y] = true;
            if (preg_match("/##\s*This week(?:'|’)s assignment/u", (string)$u['body'])) $s['homework']++;
        } else $s['draft']++;
        unset($s);
    }
    // Members per course, through the same matching the member's own Learn page uses (one pass, one context).
    $scope = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    $where = "status = 'active' AND COALESCE(type,'NGG') <> 'Summer' AND COALESCE(role,'member') NOT IN ('admin','super_admin','editor','club_admin')"; $args = [];
    if ($scope !== null) { if (!$scope) $where .= ' AND 1 = 0'; else { $where .= ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = $scope; } }
    $members = [];
    $none = 0; $ctx = null;
    $taught = []; foreach ($stat as $k => $s) if ($s['published'] > 0) $taught[$k] = true;
    foreach (db_all("SELECT memberId, track, courses, disciplines, division FROM members WHERE $where", $args) as $m) {
        $mine = array_map(static fn($c) => mb_strtolower(trim((string)$c)), curriculum_member_courses($m, $ctx));
        $has = false;
        foreach (array_unique($mine) as $k) { if (isset($courses[$k])) $members[$k] = ($members[$k] ?? 0) + 1; if (isset($taught[$k])) $has = true; }
        if (!$has && isset($taught[''])) $has = true;
        if (!$has) $none++;
    }
    $rows = [];
    foreach ($courses as $k => $name) {
        $s = $stat[$k] ?? ['published' => 0, 'draft' => 0, 'years' => [], 'weeks' => 0, 'homework' => 0];
        $years = array_keys($s['years']); sort($years);
        $rows[] = ['course' => $name, 'division' => $divOf[$k] ?? '', 'published' => $s['published'], 'drafts' => $s['draft'], 'years' => $years,
                   'weeks' => $s['weeks'], 'homework' => $s['homework'], 'members' => $members[$k] ?? 0,
                   'state' => $s['published'] > 0 ? 'taught' : ($s['draft'] > 0 ? 'drafting' : 'empty')];
    }
    usort($rows, static function ($a, $b) {
        $rank = static fn($r) => $r['state'] === 'taught' ? 2 : ($r['members'] > 0 ? 0 : 1);
        return [$rank($a), -$a['members'], $a['course']] <=> [$rank($b), -$b['members'], $b['course']];
    });
    $empty = count(array_filter($rows, static fn($r) => $r['state'] !== 'taught'));
    return ['ok' => true, 'courses' => $rows, 'emptyCourses' => $empty, 'membersWithoutLessons' => $none, 'canWrite' => admin_cap_gate($p, 'curriculum')['ok']];
}

function admin_curriculum_plan(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $course = curriculum_clean_text($p['course'] ?? '', 120);
    if ($course === '') return ['ok' => false, 'error' => 'course_required'];
    $level = curriculum_clean_text($p['level'] ?? '', 60);
    $weeks = max(4, min(CURR_PLAN_WEEKS_MAX, (int)($p['weeks'] ?? 12) ?: 12));
    $start = max(1, min(104 - $weeks + 1, (int)($p['fromWeek'] ?? 1) ?: 1));
    // The arc stretched (or squeezed) to the term's length.
    $arc = [];
    $n = count(CURR_PLAN_ARC);
    for ($i = 0; $i < $weeks; $i++) {
        $j = $weeks === 1 ? 0 : (int)round($i * ($n - 1) / ($weeks - 1));
        [$t, $sum] = CURR_PLAN_ARC[$j];
        $arc[] = ['title' => str_replace('{c}', $course, $t), 'summary' => str_replace('{c}', $course, $sum)];
    }
    $seen = [];
    foreach ($arc as $i => $a) { $k = $a['title']; $seen[$k] = ($seen[$k] ?? 0) + 1; if ($seen[$k] > 1) $arc[$i]['title'] .= ' (part ' . $seen[$k] . ')'; }
    $lessons = []; $via = 'template';
    if (!empty($p['ai']) && function_exists('ai_classify') && function_exists('ai_enabled') && ai_enabled('default')) {
        $r = ai_classify("You plan courses for Next Generation Genius, a Saturday programme for 10–17 year olds in Nigeria. Plan ONE term of the course given: "
            . "exactly $weeks weekly lessons that build on each other, following this arc: fundamentals, a mini project, a feedback round, a new technique, "
            . "a real-world brief rooted in Nigerian life, a capstone, and a showcase. Plain British English, no invented facts. "
            . 'Return JSON: {"lessons": [{"title": "under 70 characters", "summary": "1–2 sentences", "objectives": ["3 to 5 short items starting You will…"]}]}.',
            "Course: $course" . ($level !== '' ? "\nLevel: $level" : '') . "\nWeeks: $weeks\nArc to follow:\n" . implode("\n", array_map(static fn($a, $i) => ($i + 1) . '. ' . $a['title'], $arc, array_keys($arc))),
            2400, 'default');
        $got = is_array($r['data']['lessons'] ?? null) ? array_values($r['data']['lessons']) : [];
        if (!empty($r['ok']) && count($got) >= $weeks) {
            foreach (array_slice($got, 0, $weeks) as $x) {
                $t = curriculum_clean_text(is_array($x) ? ($x['title'] ?? '') : '', 200);
                if (mb_strlen($t) < 3) { $lessons = []; break; }
                $lessons[] = ['title' => $t, 'summary' => curriculum_clean_text($x['summary'] ?? '', 600),
                              'objectives' => array_slice(array_values(array_filter(array_map(static fn($o) => curriculum_clean_text((string)$o, 200), is_array($x['objectives'] ?? null) ? $x['objectives'] : []))), 0, 5)];
            }
            if ($lessons) $via = 'ai';
        }
    }
    if (!$lessons) foreach ($arc as $a) $lessons[] = ['title' => $a['title'], 'summary' => $a['summary'], 'objectives' => []];
    // Never on top of a lesson already in that slot: each week takes the next free position.
    $taken = [];
    foreach (db_all('SELECT week, position FROM curriculum_units WHERE course = ? AND level = ?', [$course, $level]) as $r) $taken[(int)$r['week']][(int)$r['position']] = true;
    $rows = [];
    foreach ($lessons as $i => $l) {
        $wk = $start + $i; $pos = 1; while (isset($taken[$wk][$pos])) $pos++;
        $rows[] = ['course' => $course, 'level' => $level, 'week' => $wk, 'position' => $pos, 'title' => $l['title'], 'summary' => $l['summary'],
                   'objectives' => $l['objectives'], 'status' => 'draft'];
    }
    return ['ok' => true, 'rows' => $rows, 'via' => $via, 'aiAvailable' => function_exists('ai_enabled') && ai_enabled('default')];
}

/**
 * Draft a lesson's summary, objectives and checks from its text, with the AI.
 * Returns a DRAFT for a person to read — nothing is saved. Fails with
 * `ai_disabled` when no provider is configured, which the editor says plainly.
 */
function admin_curriculum_ai(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    if (!function_exists('ai_classify')) return ['ok' => false, 'error' => 'ai_disabled'];
    $title = curriculum_clean_text($p['title'] ?? '', 200);
    $text = curriculum_clean_text($p['text'] ?? '', 12000);
    if ($title === '' && $text === '') return ['ok' => false, 'error' => 'nothing_to_draft'];
    $course = curriculum_clean_text($p['course'] ?? '', 120);
    $level = curriculum_clean_text($p['level'] ?? '', 60);
    $n = max(1, min(10, (int)($p['checks'] ?? 5)));
    /* With only a title (or a line or two of notes) the AI WRITES the lesson,
       in the NGG Saturday standard every bundled course uses, so a lesson
       written in the editor reads like the rest of the programme. */
    $write = mb_strlen($text) < 80;
    $bodySpec = $write ? "body (the lesson in Markdown, using exactly these '## ' sections in this order: 'Why it matters', 'Demonstration (20 minutes)', "
        . "'Guided hands-on practice (60 minutes)', 'Independent assignment (25 minutes)', 'Demonstration, feedback and submission (15 minutes)', "
        . "'Success criteria' (3 bullet points a learner can check themselves), "
        . "'Make it fit you' (a bullet starting '**If this is new to you:**' and one starting '**If you already can:**'), "
        . "and 'This week's assignment' (one sentence naming the deliverable). Use bullets, short sentences, Nigerian examples where natural), " : "";
    /* THE EXAM THE QUESTIONS ARE MODELLED ON.
       The drafter was writing questions out of nothing but the lesson text,
       and what comes out of nothing is four options and a right answer.
       Given the body that actually certifies this subject and the way that
       body decides somebody can do the thing, it writes to a standard
       somebody else already thought hard about.
       It is a MODEL, not a claim: the prompt says so, because a drafted
       question that implies the lesson is part of a qualification is worse
       than a weak question. */
    $ref = curriculum_exam_reference($course);
    $refSpec = $ref ? "This course points at " . $ref['award'] . " from " . $ref['body'] . ". "
        . "That body assesses by " . $ref['assesses'] . ". Model the STANDARD and the SHAPE of your questions on that — "
        . $ref['ask'] . ". Do NOT say or imply the lesson is part of that qualification, do not cite its syllabus, "
        . "unit numbers or grade boundaries, and do not name it in a question. " : "";
    $instructions = "You help instructors at Next Generation Genius, a youth programme for 10–17 year olds in Nigeria, "
        . ($write ? "write a complete 120-minute Saturday lesson from its title. " : "turn lesson notes into a clear lesson. ")
        . "Write for the learner, in plain British English, without inventing facts "
        . ($write ? "you are not sure of. " : "the notes do not support. ")
        . "Return JSON with keys: " . $bodySpec . "summary (2–3 sentences), objectives (3–6 short 'You will…' items), "
        . "checks (exactly $n items; each {kind:'mcq'|'short'|'task', prompt, options (4 strings, mcq only), answer (mcq: the "
        . "0-based index of the correct option; short/task: a model answer), rubric (short/task only: what a full-mark answer includes)}). "
        /* These are sat a week later, at the start of the next session, and
           they decide whether the programme can tell a child is learning.
           Multiple choice alone measures whether they can pick the right
           words off a list; in subjects that are almost entirely practical
           it is close to measuring nothing. The server refuses to publish a
           review that is mcq-only, so a draft made of four mcqs is a draft
           somebody then has to rewrite — better that the model never
           produces one. */
        . $refSpec
        . "AT MOST HALF may be 'mcq', and at least one must be a 'task': something the learner DOES and then "
        . "describes — made, played, built, recorded, measured — with a rubric worth up to 6 points in three "
        . "parts. These are practical subjects; a review that only asks them to recognise an answer does not "
        . "show whether they can do it. Mix recall with understanding; no trick questions. "
        /* AI belongs where the lesson's own work has a step an assistant
           genuinely changes — not as a section in every lesson. Taught as a
           ritual it stops being read; taught where it is true it is a skill.
           When it does belong it goes INSIDE the independent work, as the
           last step, and it always ends with the learner checking the output
           or judging it. See api/tests/curriculum-shape.php. */
        . "Only if this particular lesson's work has a step an AI assistant genuinely changes, add ONE final bullet to "
        . "'Independent assignment' starting '**With an AI assistant —**', saying what to ask it and how the learner "
        . "checks or judges what it gives back. Most lessons do not need one — a physical skill, a rehearsal or a "
        . "conversation is not improved by it. Never add it to more than one section, and never let it produce the "
        . "deliverable.";
    $input = "Course: " . ($course ?: 'General') . ($level ? "\nLevel: $level" : '') . "\nLesson title: $title\n\nLesson notes:\n$text";
    $r = ai_classify($instructions, $input, $write ? 3600 : 1800, 'default');
    if (empty($r['ok'])) {
        $err = (string)($r['error'] ?? 'ai_failed');
        return ['ok' => false, 'error' => $err, 'message' => $err === 'ai_disabled'
            ? 'No AI provider is configured. Add one in Settings → AI to draft lessons.'
            : 'The AI could not draft this lesson just now. Try again, or write it by hand.'];
    }
    $d = $r['data'];
    $checks = [];
    foreach (is_array($d['checks'] ?? null) ? $d['checks'] : [] as $c) {
        if (!is_array($c)) continue;
        $c['source'] = 'ai';
        $checks[] = $c;
    }
    // Run the draft through the same validation as a saved lesson, so the
    // editor is never handed a check it would then refuse to save.
    $probe = curriculum_validate(['course' => $course, 'title' => $title ?: 'Draft', 'week' => 1, 'position' => 1, 'checks' => $checks], true);
    $valid = $probe['ok'] ? array_map(static function ($c) {
        return ['kind' => $c['kind'], 'prompt' => $c['prompt'], 'options' => json_decode($c['options'], true) ?: [],
                'answer' => $c['answer'], 'rubric' => $c['rubric'], 'points' => $c['points'], 'source' => 'ai'];
    }, $probe['checks']) : [];
    audit('curriculum.ai_draft', (string)$g['requester']['memberId'], '', ['course' => $course, 'checks' => count($valid), 'provider' => $r['provider'] ?? ''], (string)($p['ip'] ?? ''));
    $body = $write ? trim((string)($d['body'] ?? '')) : '';
    if ($body !== '' && !preg_match('/^##\s/m', $body)) $body = '';   // not the standard shape: leave the notes alone
    return ['ok' => true, 'draft' => [
        'body' => mb_substr($body, 0, 12000),
        'summary' => curriculum_clean_text($d['summary'] ?? '', 1200),
        'objectives' => curriculum_list($d['objectives'] ?? []),
        'checks' => $valid,
    ], 'provider' => (string)($r['provider'] ?? ''), 'note' => $probe['ok'] ? '' : 'Some generated checks were unusable and were dropped.'];
}

/**
 * Progress across the curriculum: per unit (started, completed, pending marks,
 * average best score) and, with `memberId`, one member's record. Centre scope
 * applies — a scoped admin sees only their centres' members.
 */
function admin_curriculum_report(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'audit']); if (!$g['ok']) return $g;
    $scope = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    $mWhere = "m.status = 'active' AND COALESCE(m.type,'NGG') <> 'Summer'"; $mArgs = [];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'units' => [], 'members' => [], 'scoped' => true];
        $mWhere .= ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $mArgs = $scope;
    }
    $mid = trim((string)($p['memberId'] ?? ''));
    if ($mid !== '') {
        $m = db_row("SELECT memberId, fullName, displayId, centre, track, courses, joinDate, createdAt, type FROM members m WHERE $mWhere AND m.memberId = ?", array_merge($mArgs, [$mid]));
        if (!$m) return ['ok' => false, 'error' => 'not_found'];
        return ['ok' => true, 'member' => $m + ['curriculum' => curriculum_for_member($m)]];
    }
    $course = trim((string)($p['course'] ?? ''));
    $uWhere = "u.status = 'published'"; $uArgs = [];
    if ($course !== '') { $uWhere .= ' AND u.course = ?'; $uArgs[] = $course; }
    $rows = db_all("SELECT u.unitId, u.course, u.level, u.week, u.position, u.title,
                           COUNT(p.id) started, SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) completed,
                           SUM(COALESCE(p.pending, 0)) pending, AVG(CASE WHEN p.attempts > 0 THEN p.bestPct END) avgPct
                    FROM curriculum_units u
                    LEFT JOIN curriculum_progress p ON p.unitId = u.unitId
                      AND p.memberId IN (SELECT m.memberId FROM members m WHERE $mWhere)
                    WHERE $uWhere GROUP BY u.unitId, u.course, u.level, u.week, u.position, u.title
                    ORDER BY u.course, u.level, u.week, u.position", array_merge($mArgs, $uArgs));
    // How many members each course is FOR, so "12 completed" has a denominator.
    $enrolled = [];
    $everyone = 0;
    foreach (db_all("SELECT m.track, m.courses FROM members m WHERE $mWhere", $mArgs) as $r) {
        $everyone++;
        foreach (member_courses_of($r) ?: [(string)$r['track']] as $c) $enrolled[$c] = ($enrolled[$c] ?? 0) + 1;
    }
    $units = array_map(static fn($r) => [
        'unitId' => (string)$r['unitId'], 'course' => (string)$r['course'], 'level' => (string)$r['level'], 'week' => (int)$r['week'],
        'position' => (int)$r['position'], 'title' => (string)$r['title'], 'started' => (int)$r['started'], 'completed' => (int)$r['completed'],
        'pending' => (int)$r['pending'], 'avgPct' => $r['avgPct'] !== null ? (int)round((float)$r['avgPct']) : null,
        'audience' => (string)$r['course'] === '' ? $everyone : ($enrolled[(string)$r['course']] ?? 0),
    ], $rows);
    return ['ok' => true, 'units' => $units, 'scoped' => $scope !== null,
            'overdue' => curriculum_overdue_board($mWhere, $mArgs, $course), 'schedule' => curriculum_schedule()];
}

/* ══ Members ═════════════════════════════════════════════════════════════════ */

/** The units a member's curriculum holds: their course's, and the Club-wide ones. */
/**
 * The course names a member takes, for matching lessons.
 *
 * WHY THIS EXISTS. Lessons are filed under a course ("Coding", "Robotics"),
 * but a member's `track` is the roster's First_Faculty, upper-cased on import
 * ("TECH", "MEDIA", "MUSIC"), and `disciplines` is the one or two faculties on
 * their card. Matching lessons to `track` verbatim meant a TECH member was
 * shown no Technology lesson at all, only the Club-wide ones — which is the
 * "members are not seeing their curriculum" report.
 *
 * Each word in track and disciplines resolves, in order:
 *   1. a course of the catalogue, by name            → that course;
 *   2. a faculty or division (TECH, Technology…)    → every course of it;
 *   3. otherwise kept as written, so a course somebody filed under the
 *      member's literal track still matches, as it always did.
 * With nothing at all on the record, the member's `division` decides.
 */
/** What course matching reads, built once — callers that place many members
 *  (an assignment's audience) pass it in rather than re-reading it per member. */
function curriculum_course_ctx(): array {
    $catalogue = function_exists('club_catalogue') ? club_catalogue() : [];
    $byLower = [];
    foreach ($catalogue as $courses) foreach ($courses as $c) $byLower[mb_strtolower(trim((string)$c))] = (string)$c;
    $unitCourses = array_column(db_all("SELECT DISTINCT course FROM curriculum_units WHERE course <> '' AND status = 'published'"), 'course');
    /* Read ONCE here rather than per member: curriculum_due_run() resolves
       courses for every active member on the programme, and a setting_get()
       inside that loop is a per-row query by another name. */
    $src = function_exists('curriculum_schedule') ? (string)curriculum_schedule()['courseSource'] : 'member';
    return ['catalogue' => $catalogue, 'byLower' => $byLower, 'unitCourses' => $unitCourses, 'div' => [], 'courseSource' => $src];
}

/* ── A member's courses, chosen, not guessed ─────────────────────────────────
 *
 * `members.courses` is a JSON list of catalogue course names, picked in the
 * Control Room. When it is set it IS the member's courses: lessons, channels
 * and assignments read it as it stands. Free text in `track` ("Tech", a typo)
 * was matched by words and gave whole families of courses or none; it stays
 * only as the fallback for records nobody has assigned yet, and is kept equal
 * to the first chosen course so every older reader still sees one. */
const MEMBER_COURSES_MAX = 8;

/** Every course a member can be put on: the live catalogue, plus Chess (every division's). */
function member_course_names(): array {
    $out = function_exists('club_courses') ? club_courses() : [];
    if (!in_array('Chess', $out, true)) $out[] = 'Chess';
    return $out;
}

/** [clean list, unknown names] from a list or a comma-separated string, matched case-insensitively to the catalogue. */
function member_courses_clean($raw): array {
    $items = is_array($raw) ? $raw : preg_split('/\s*[,;\n]\s*/', (string)$raw);
    $byLower = [];
    foreach (member_course_names() as $c) $byLower[mb_strtolower($c)] = $c;
    $out = []; $bad = [];
    foreach ($items ?: [] as $c) {
        $c = trim((string)$c);
        if ($c === '') continue;
        $k = mb_strtolower($c);
        if (!isset($byLower[$k])) { $bad[] = mb_substr($c, 0, 60); continue; }
        if (!in_array($byLower[$k], $out, true)) $out[] = $byLower[$k];
    }
    return [$out, $bad];
}

/**
 * SQL for "this member takes this course": one of their chosen courses, or —
 * when they have none chosen — their old track. [fragment, args]; `$a` is the
 * table alias with its dot ("m.") or ''. A course is stored JSON-encoded, so
 * the quoted name matches exactly, never a course whose name merely holds it.
 */
function member_course_sql(string $course, string $a = ''): array {
    $json = json_encode($course, JSON_UNESCAPED_UNICODE);
    $like = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], (string)$json) . '%';
    return ["(COALESCE({$a}courses,'') LIKE ? ESCAPE '!' OR (COALESCE({$a}courses,'') = '' AND lower({$a}track) = lower(?)))", [$like, $course]];
}

/**
 * Does this person take any of these courses? Their chosen courses, or their
 * track when none are chosen (a Summer participant has only a track), compared
 * without regard to case. When the row was read without `courses`, it is read
 * here, once per person per request — a scope check must not miss a second
 * course because a caller selected fewer columns.
 */
function member_takes_any(array $m, array $courses): bool {
    if (!$courses) return false;
    if (!array_key_exists('courses', $m) && ($id = (string)($m['memberId'] ?? '')) !== '') {
        static $cache = [];
        $m['courses'] = $cache[$id] ??= (string)(db_row('SELECT courses FROM members WHERE memberId = ? LIMIT 1', [$id])['courses'] ?? '');
    }
    $mine = array_map(fn($c) => mb_strtolower(trim((string)$c)), member_courses_of($m) ?: [(string)($m['track'] ?? '')]);
    foreach ($courses as $c) if (in_array(mb_strtolower(trim((string)$c)), $mine, true)) return true;
    return false;
}

/** The courses chosen for this member ([] when none have been). */
function member_courses_of(array $m): array {
    $v = json_decode((string)($m['courses'] ?? ''), true);
    return is_array($v) ? array_values(array_filter(array_map('strval', $v), fn($c) => trim($c) !== '')) : [];
}

/* Words that name ONE course, when nobody chose courses from the list. Each
 * maps to a single catalogue course (used only when the catalogue has it). A
 * word with no single meaning — "Tech", "Media", "Design" — maps to nothing:
 * the member is listed for staff to choose, never given a division's worth of
 * courses they did not sign up for ("Piano" once brought Catering and Adire). */
/**
 * Broad courses, and the strands under them.
 *
 * Some courses are a subject, not a skill: "Music" does not say whether a child
 * is at a piano or behind a drum kit, and one lesson cannot serve both. The
 * strand is what is actually taught and timetabled; the parent is the subject
 * they belong to.
 *
 * This replaces three separate pieces of string-matching that each tried to
 * infer the same relationship — a regex over course names, a hardcoded
 * `$lw === 'music'` branch, and a word map pointing at a course that taught
 * nothing in particular. One map, read by everything:
 *
 *   course_scope('Piano')  → ['Piano', 'Music']       a strand, plus its subject
 *   course_scope('Music')  → ['Music', …every strand]  the subject, taught across
 *   course_scope('Acting') → ['Acting']                a course that is just itself
 *
 * To make another broad course behave this way, add a row. Nothing else changes.
 */
const COURSE_STRANDS = [
    'Music' => ['Piano', 'Guitar', 'Drums', 'Violin', 'Saxophone', 'Vocal Training', 'Music Production'],
];

/** The strands under a broad course; [] when the course is a leaf. */
function course_strands(string $course): array {
    foreach (COURSE_STRANDS as $parent => $kids) if (strcasecmp($parent, $course) === 0) return $kids;
    return [];
}
/** The broad course a strand sits under; '' when it sits under nothing. */
function course_parent(string $course): string {
    foreach (COURSE_STRANDS as $parent => $kids) foreach ($kids as $k) if (strcasecmp($k, $course) === 0) return (string)$parent;
    return '';
}
/** Every course name that belongs to the same subject, parent first. */
function course_family(string $course): array {
    $parent = course_parent($course);
    if ($parent !== '') return array_merge([$parent], course_strands($parent));
    $kids = course_strands($course);
    return $kids ? array_merge([$course], $kids) : [$course];
}
/**
 * What a member on `$course` should be shown.
 *
 * A strand gets its own lessons AND the subject's shared ones — a pianist
 * should still learn to read music. A broad course gets everything under it.
 * A leaf gets itself. Nothing here looks at the spelling of a name.
 */
function course_scope(string $course): array {
    $parent = course_parent($course);
    if ($parent !== '') return [$course, $parent];
    $kids = course_strands($course);
    return $kids ? array_merge([$course], $kids) : [$course];
}

/**
 * Everything a member on this course can REACH — the course, its subject, and
 * their division. This is deliberately NOT course_scope().
 *
 * A member's courses are their identity: what they chose, what the roster
 * shows, what "My course" says, what an instructor is assigned against. A
 * division is none of those — nobody enrols in Technology & Applied
 * Engineering. Putting it in course_scope() pushed the division's NAME into
 * the member's own course list, where it read as a course they had taken, and
 * that is the failure the roster tests were written to catch.
 *
 * So reach is its own idea, used only where lessons are matched.
 */
function course_reach(string $course): array {
    $out = course_scope($course);
    $div = course_division($course);
    if ($div !== '' && !in_array($div, $out, true)) $out[] = $div;
    return $out;
}

/**
 * The division a course sits in — Robotics → Technology & Applied Engineering.
 *
 * WHY A LESSON MAY BE SCOPED TO A DIVISION. A centre does not always have an
 * instructor for every course. When the Robotics instructor is unavailable for
 * a term, the Robotics learners must still have a Saturday that teaches them
 * something, and it should be the same Saturday the rest of their division is
 * having rather than an improvised one. So a lesson may be filed against a
 * DIVISION as well as against a course, and a member reaches, in order:
 *
 *     their course   →   its parent strand   →   their division   →   ''
 *     Robotics           (none)                  Technology          everyone
 *     Piano              Music                   Creative Arts       everyone
 *
 * The division curriculum is the one that holds when the specialist is not in
 * the room. It is not a replacement for the course: a member who has both sees
 * both, and the course lesson is the one that carries their week.
 */
function course_division(string $course): string {
    $course = trim($course);
    if ($course === '') return '';
    $parent = course_parent($course);
    foreach (club_catalogue() as $division => $courses) {
        foreach ($courses as $c) {
            if (strcasecmp($c, $course) === 0 || ($parent !== '' && strcasecmp($c, $parent) === 0)) return (string)$division;
        }
    }
    return '';
}

/** Every division name, as the catalogue spells it. */
function curriculum_divisions(): array { return array_keys(club_catalogue()); }

/** Every value a lesson may be filed against: the courses, plus the divisions. */
function curriculum_scopes(): array {
    return array_values(array_unique(array_merge(curriculum_courses(), curriculum_divisions())));
}
/* Words that name a SUBJECT rather than a course — including "Musical
   Instruments", the umbrella that was retired when the instruments became
   courses of their own. Each resolves to a broad course, and from there to its
   whole family, so no member on an old track is left with nothing. */
const BROAD_COURSE_WORDS = [
    'musical instruments' => 'Music', 'instruments' => 'Music', 'instrument' => 'Music', 'musical' => 'Music',
];
const MEMBER_COURSE_WORDS = [
    /* An instrument names its own course now. 'trumpet', 'flute' and 'bass' have
       no course of their own yet and stay pointed at the nearest one that does,
       so a child who wrote one on their card still reaches a real lesson. */
    'piano' => 'Piano', 'keyboard' => 'Piano',
    'guitar' => 'Guitar', 'bass' => 'Guitar', 'bass guitar' => 'Guitar',
    'drums' => 'Drums', 'drum' => 'Drums', 'percussion' => 'Drums',
    'violin' => 'Violin', 'strings' => 'Violin',
    'saxophone' => 'Saxophone', 'sax' => 'Saxophone', 'trumpet' => 'Saxophone', 'flute' => 'Saxophone',
    'vocal' => 'Vocal Training', 'vocals' => 'Vocal Training', 'singing' => 'Vocal Training', 'voice' => 'Vocal Training', 'choir' => 'Vocal Training',
    'drama' => 'Acting', 'theatre' => 'Acting', 'theater' => 'Acting',
    'ai' => 'Artificial Intelligence', 'code' => 'Coding', 'programming' => 'Coding', 'software' => 'Software Development',
    'robots' => 'Robotics', 'robot' => 'Robotics', 'cyber' => 'Cybersecurity', 'cyber security' => 'Cybersecurity',
    'film' => 'Video Production', 'video' => 'Video Production', 'videography' => 'Video Production',
    'pm' => 'Project Management',
];

/**
 * Once per deployment: every NGG member with no chosen courses whose track
 * names courses exactly and nothing vague ("Coding, Robotics", "Piano") has
 * them written as chosen courses. A vague track ("Tech") is left for a person
 * to choose (the roster's "No courses chosen" filter lists them). Recorded,
 * so it never runs twice; one audit event with the count.
 */
const MEMBER_COURSES_BACKFILL = 'member_courses_backfill_v1';
function member_courses_backfill_once(): int {
    if ((string)setting_raw(MEMBER_COURSES_BACKFILL) !== '') return 0;
    setting_set(MEMBER_COURSES_BACKFILL, gmdate('c'), 'system');
    $ctx = null; $n = 0; $now = now_iso();
    foreach (db_all("SELECT memberId, track FROM members WHERE COALESCE(courses,'') = '' AND COALESCE(type,'NGG') = 'NGG' AND TRIM(COALESCE(track,'')) <> ''") as $m) {
        // Only a track that names its courses precisely: a broad word (Music, TECH) is left as it is.
        [$c, $vague, $broad] = member_courses_from_text((string)$m['track'], $ctx);
        if (!$c || $vague || $broad) continue;
        db_update('members', ['courses' => json_encode(array_slice($c, 0, MEMBER_COURSES_MAX), JSON_UNESCAPED_UNICODE), 'updatedAt' => $now], ['memberId' => (string)$m['memberId']]);
        $n++;
    }
    audit('member.courses.backfill', 'system', '', ['converted' => $n], '');
    return $n;
}

/** The words that stand for a whole division (as on the card: TECH, MEDIA), never an instrument or a hobby. */
const MEMBER_DIVISION_WORDS = [
    'tech' => 'tech', 'technology' => 'tech', 'media' => 'media', 'business' => 'business',
    'arts' => 'arts', 'art' => 'arts', 'creative' => 'arts', 'performing arts' => 'arts', 'creative arts' => 'arts',
];
/** The music courses (the music faculty's own: Music, its instruments, voice and production). */
/**
 * Kept as the name other code may still call, but it is now one line over
 * COURSE_STRANDS. It used to match course names with a regex and a word map,
 * which is how "Piano" ended up a music course by spelling rather than by
 * belonging to one.
 */
function member_music_courses(array $ctx = []): array { return course_family('Music'); }

/**
 * What free text names, word by word: [courses, vague words, broad].
 *   - a course's exact name → that course;
 *   - a word in MEMBER_COURSE_WORDS → its one course ("Piano" → Musical Instruments);
 *   - "music" → the music courses (broad);
 *   - a division word (TECH, MEDIA…) → that division's courses (broad);
 *   - anything else → nothing, and it is reported as vague.
 * An instrument used to be read as "the arts" and brought the whole division:
 * Piano was given Catering and Adire. That path is gone.
 */
function member_courses_from_text(string $text, ?array &$ctx = null): array {
    if ($ctx === null) $ctx = curriculum_course_ctx();
    $byLower = $ctx['byLower'];
    foreach ($ctx['unitCourses'] as $c) $byLower[mb_strtolower((string)$c)] ??= (string)$c;
    $byLower['chess'] ??= 'Chess';
    $out = []; $vague = []; $broad = false;
    foreach (preg_split('/\s*[,;\/|:]\s*|\s+and\s+|\s*&\s*/i', trim($text)) ?: [] as $w) {
        $w = trim($w); if ($w === '') continue;
        $lw = mb_strtolower($w);
        /* A broad course named directly, or the retired umbrella that used to
           stand for one. Either way the answer is the subject's whole family,
           read off COURSE_STRANDS rather than matched against spellings. */
        $broadName = (BROAD_COURSE_WORDS[$lw] ?? '') ?: (course_strands($byLower[$lw] ?? $w) ? ($byLower[$lw] ?? $w) : '');
        if ($broadName !== '') { $out = array_merge($out, course_family($broadName)); $broad = true; continue; }
        if (isset($byLower[$lw])) { $out[] = $byLower[$lw]; continue; }
        $syn = MEMBER_COURSE_WORDS[$lw] ?? null;
        if ($syn !== null && isset($byLower[mb_strtolower($syn)])) { $out[] = $byLower[mb_strtolower($syn)]; continue; }
        if (isset(MEMBER_DIVISION_WORDS[$lw])) { $out = array_merge($out, curriculum_division_courses(MEMBER_DIVISION_WORDS[$lw], $ctx)); $broad = true; continue; }
        $vague[] = $w;
    }
    return [array_values(array_unique($out)), $vague, $broad];
}
/** The words themselves too, as course names: a lesson filed under exactly "Design" is a Design member's. */
function member_text_words(string $text): array {
    return array_values(array_filter(array_map('trim', preg_split('/\s*[,;\/|:]\s*|\s+and\s+|\s*&\s*/i', trim($text)) ?: []), fn($w) => $w !== ''));
}

/**
 * A division's courses: the seeded list, plus every course of each catalogue
 * division that is the same division under the admin's own name ("AI &
 * Technology" is Technology), plus every course lessons are filed under that
 * reads as the division ("Media Lab" is Media). Names only — a division is
 * found from a division's or a course's NAME, never from an instrument.
 */
function curriculum_division_courses(string $divId, array &$ctx): array {
    if (isset($ctx['div'][$divId])) return $ctx['div'][$divId];
    $d = function_exists('nggc_division') ? nggc_division($divId) : null;
    if (!$d) return $ctx['div'][$divId] = [];
    $divOf = function (string $name): string {
        if (!function_exists('nggc_division_for_track')) return '';
        $id = nggc_division_for_track($name);
        if ($id !== '') return $id;
        foreach (preg_split('/[^\p{L}]+/u', $name) ?: [] as $w) { if ($w !== '' && ($id = nggc_division_for_track($w)) !== '') return $id; }
        return '';
    };
    $out = array_values($d['courses'] ?? []);
    foreach ($ctx['catalogue'] as $name => $courses) {
        if ($divOf((string)$name) === $d['id']) { $out = array_merge($out, array_values($courses)); continue; }
        foreach ($courses as $c) if ($divOf((string)$c) === $d['id']) $out[] = (string)$c;
    }
    foreach ($ctx['unitCourses'] as $c) if ($divOf((string)$c) === $d['id']) $out[] = (string)$c;
    return $ctx['div'][$divId] = array_values(array_unique($out));
}

/**
 * The division a member belongs to, by the NAME the catalogue spells it with,
 * or ''. Resolved the way the rest of the programme resolves it: what is on
 * the record, else what their track plainly means, else the division of a
 * course they already carry.
 */
function curriculum_member_division(array $m): string {
    $d = trim((string)($m['division'] ?? ''));
    if ($d !== '' && function_exists('nggc_division') && ($x = nggc_division($d))) return (string)$x['name'];
    if (function_exists('nggc_division_for_track')) {
        $id = nggc_division_for_track((string)($m['track'] ?? ''));
        if ($id !== '' && ($x = nggc_division($id))) return (string)$x['name'];
    }
    foreach (member_courses_of($m) as $c) { $dv = course_division((string)$c); if ($dv !== '') return $dv; }
    return '';
}

/**
 * A member's courses.
 *
 * TWO MODES, and which one is live is a setting — `courseSource` on the
 * curriculum schedule (Control Room → Learning → Curriculum → Schedule).
 *
 *   'member'   (default) the courses chosen for them (members.courses), or —
 *              for a record nobody has assigned yet — what their track and
 *              the disciplines on their card name, or, failing those, every
 *              course in their division.
 *
 *   'division' THE DIVISION IS THE ENROLMENT. A member takes their division's
 *              OWN shared curriculum — the spine every course inside it
 *              shares (curriculum-divisions-2026.json) — and nothing from the
 *              individual strands. This exists because the fallback above was
 *              doing a bad impression of it: a member with no courses on
 *              record was handed all seven of Technology's strands at once,
 *              which is a wall of lessons, not a curriculum. A division has
 *              one spine; that is what the mode delivers.
 *
 * Club-wide lessons (course = '') reach everybody in both modes, and Chess is
 * every division's (§6), so it is added in both.
 */
function curriculum_member_courses(array $m, ?array &$ctx = null): array {
    if ($ctx === null) $ctx = curriculum_course_ctx();
    if (($ctx['courseSource'] ?? 'member') === 'division') {
        $dv = curriculum_member_division($m);
        /* No division on the record is not a reason to hand them somebody
           else's curriculum: they get the Club-wide lessons and Chess, and
           the coverage board names them as unplaced. */
        return $dv === '' ? ['Chess'] : [$dv, 'Chess'];
    }
    $out = member_courses_of($m);
    if (!$out) {
        $track = (string)($m['track'] ?? ''); $dis = (string)($m['disciplines'] ?? '');
        $out = array_merge(member_courses_from_text($track, $ctx)[0], member_text_words($track));
        /* The interests on the card add courses only inside the track's own
           division. A Tech member who also ticked "Media" was given the whole
           Media division (Media Lab included) beside their Technology courses. */
        $trackDiv = function_exists('nggc_division_for_track') ? nggc_division_for_track($track) : '';
        if ($trackDiv === '' && trim((string)($m['division'] ?? '')) !== '' && function_exists('nggc_division') && nggc_division((string)$m['division'])) $trackDiv = (string)nggc_division((string)$m['division'])['id'];
        $fromDis = array_merge(member_courses_from_text($dis, $ctx)[0], member_text_words($dis));
        if ($trackDiv !== '' && trim($track) !== '') {
            $mine = array_map('mb_strtolower', array_merge(curriculum_division_courses($trackDiv, $ctx), ['Chess']));
            $fromDis = array_filter($fromDis, static fn($c) => in_array(mb_strtolower((string)$c), $mine, true));
        }
        $out = array_merge($out, $fromDis);
        if (!$out && trim((string)($m['division'] ?? '')) !== '') $out = curriculum_division_courses((string)$m['division'], $ctx);
    }
    /* Widen each course to its subject: a pianist is shown Piano's lessons and
       Music's shared ones, because reading music is not a piano skill. A leaf
       course widens to itself, so this is a no-op for most of the catalogue. */
    $wide = [];
    foreach ($out as $c) foreach (course_scope((string)$c) as $x) $wide[] = $x;
    $out = $wide;
    $seen = []; $uniq = [];
    foreach ($out as $c) { $k = mb_strtolower(trim((string)$c)); if ($k !== '' && !isset($seen[$k])) { $seen[$k] = 1; $uniq[] = (string)$c; } }
    $out = $uniq;
    if ($out && !isset($seen['chess'])) $out[] = 'Chess';
    return $out;
}

/* ── A three-year programme that adapts to the member ───────────────────────
 *
 * NGG lasts three years, so a course's lessons carry their year in `level`
 * ("Year 2 · Developing"). A lesson whose level names no year is for everyone,
 * as before. Progress through the years follows MASTERY, not the calendar:
 *   - a member starts at Year 1, or where staff place them (an experienced
 *     pianist can begin at Year 2: staff.curriculum.year);
 *   - per course, finishing CURR_ADVANCE_PCT of a year's lessons opens the
 *     next year — a fast learner is never held to an intake's pace, and one who
 *     needs longer is never pushed on with gaps;
 *   - the unfinished lessons of a year they have moved past stay, as catch-up;
 *   - a course with no lessons for a year carries on with its nearest one.
 * Deadlines (and so fines) follow the term for the year a member is PLACED in;
 * a year opened early by progress is self-paced. */
const CURR_PROGRAMME_YEARS = 3;
const CURR_ADVANCE_PCT     = 80;
const CURR_YEAR_KEY        = 'staff.curriculum.year';

/** The programme year a lesson's level names — "Year 2", "Yr 2", "Level 2" — or 0. */
function curriculum_level_year(string $level): int {
    return preg_match('/\b(?:year|yr|level)\s*-?\s*([1-9])\b/i', $level, $h) ? min(CURR_PROGRAMME_YEARS, (int)$h[1]) : 0;
}

/* ── The NGG Learning Path: Year → Term → Week ──────────────────────────────
 *
 * One way of naming where a lesson sits, the same in every course: three
 * programme YEARS, each of two TERMS of twelve WEEKS (a Saturday each). A
 * lesson is coded `Y1·T2·W3` — Year 1, Term 2, week 3 of that term — and its
 * term carries a name when the level gives one ("Year 1 · Module 2:
 * Spreadsheets…" → "Spreadsheets…"). The year comes from the level; the term
 * from the level ("Term 2", or "Module N", two modules a year), or else from
 * the week (weeks 13–24 are Term 2). A lesson with no year is "Club-wide".
 */
const CURR_TERM_WEEKS = 12;
function curriculum_path(string $level, int $week): array {
    $year = curriculum_level_year($level);
    $term = 0;
    if (preg_match('/\bterm\s*([1-9])\b/i', $level, $h)) $term = (int)$h[1];
    elseif (preg_match('/\bmodule\s*([1-9]\d?)\b/i', $level, $h)) $term = (((int)$h[1] - 1) % 2) + 1;
    if ($term === 0) $term = $week > CURR_TERM_WEEKS ? 2 : 1;
    $wk = $week > CURR_TERM_WEEKS ? (($week - 1) % CURR_TERM_WEEKS) + 1 : max(1, $week);
    $name = '';
    if (preg_match('/(?:module|term)\s*\d+\s*[:—–-]\s*(.+)$/iu', $level, $h)) $name = trim($h[1]);
    elseif (preg_match('/^year\s*\d+\s*[·:—–-]\s*(.+)$/iu', trim($level), $h)) $name = trim($h[1]);
    return ['year' => $year, 'term' => $term, 'week' => $wk, 'termName' => $name,
            'code' => ($year ? 'Y' . $year . '·' : '') . 'T' . $term . '·W' . $wk,
            'label' => ($year ? 'Year ' . $year . ' · ' : '') . 'Term ' . $term . ($name !== '' ? ': ' . $name : '') . ' · Week ' . $wk];
}

/** Where staff placed a member: ['year' => 1..3, 'source' => 'set'|'default']. */
function curriculum_member_year(array $m, ?int $override = null): array {
    if ($override === null) $override = (int)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [(string)$m['memberId'], CURR_YEAR_KEY])['stateValue'] ?? 0);
    return $override >= 1 && $override <= CURR_PROGRAMME_YEARS ? ['year' => $override, 'source' => 'set'] : ['year' => 1, 'source' => 'default'];
}

/**
 * The adaptive filter. `$units` are rows with unitId, course, level; `$prog`
 * is unitId → progress row. Returns unitId → stage: '' (a year-less lesson),
 * 'current' (the year they are working in), 'catchup' (left behind in a year
 * they moved past). A unit not in the result is not open to them yet. Also
 * fills `$courses`: course → ['placed', 'year', 'pct'] for the screen.
 * Pure: a sweep over every member loads each table once.
 */
function curriculum_adapt(array $units, int $placedYear, array $prog, ?array &$courses = null): array {
    $byCourse = []; $names = [];
    foreach ($units as $u) {
        $y = curriculum_level_year((string)$u['level']);
        if (!$y) continue;
        $c = mb_strtolower((string)$u['course']); $names[$c] = (string)$u['course'];
        $byCourse[$c][$y][] = (string)$u['unitId'];
    }
    $done = fn(string $id): bool => ($prog[$id]['status'] ?? '') === 'completed';
    $pct = function (array $ids) use ($done): int { $n = 0; foreach ($ids as $id) if ($done($id)) $n++; return $ids ? (int)floor($n * 100 / count($ids)) : 0; };
    $courses = []; $plan = [];
    foreach ($byCourse as $c => $years) {
        ksort($years);
        $have = array_keys($years);
        $below = array_filter($have, fn($y) => $y <= $placedYear);
        $placed = $below ? max($below) : min($have);
        $cur = $placed;
        foreach ($have as $y) { if ($y < $placed) continue; $cur = $y; if ($pct($years[$y]) < CURR_ADVANCE_PCT) break; }
        $plan[$c] = [$placed, $cur];
        $courses[$names[$c]] = ['placed' => $placed, 'year' => $cur, 'pct' => $pct($years[$cur]), 'years' => $have, 'advancePct' => CURR_ADVANCE_PCT];
    }
    $out = [];
    foreach ($units as $u) {
        $id = (string)$u['unitId']; $y = curriculum_level_year((string)$u['level']);
        if ($y === 0) { $out[$id] = ''; continue; }
        [$placed, $cur] = $plan[mb_strtolower((string)$u['course'])];
        $st = (string)($prog[$id]['status'] ?? '');
        if ($y === $cur) $out[$id] = 'current';
        elseif ($y < $cur && $y >= $placed && !$done($id)) $out[$id] = 'catchup';
        elseif ($y < $placed && $st !== '' && !$done($id)) $out[$id] = 'catchup';
    }
    return $out;
}

/**
 * curriculum.material — a lesson's PDF (or other file), served from this
 * origin. Lesson files live on Cloudinary or the bucket, and a Cloudinary
 * account refuses to DELIVER a PDF unless "Allow delivery of PDF and ZIP
 * files" is switched on — so the link opened a 401 page, and a PDF never
 * displayed. This fetches it through the signed download the Community's
 * documents already use (cm3_doc_get), for a member whose lessons include it,
 * or for staff. A link that is not ours (Google Drive, YouTube) is not
 * fetched: `external` tells the page to open it as a link.
 */
function curriculum_material_doc(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $mat = db_row("SELECT * FROM curriculum_materials WHERE materialId = ? LIMIT 1", [(string)($p['materialId'] ?? '')]);
    if ($viewer === '' || !$mat) return ['ok' => false, 'error' => 'not_found'];
    $unit = db_row("SELECT * FROM curriculum_units WHERE unitId = ? LIMIT 1", [(string)$mat['unitId']]);
    if (!$unit) return ['ok' => false, 'error' => 'not_found'];
    $staff = function_exists('community_actor_is_staff') && community_actor_is_staff($viewer);
    if (!$staff) {
        // A member sees an approved file of a published lesson that is theirs.
        if ((string)$unit['status'] !== 'published' || (string)($mat['status'] ?? 'approved') !== 'approved') return ['ok' => false, 'error' => 'not_found'];
        $m = curriculum_member_row($viewer);
        if (!$m || !isset(curriculum_member_units_all($m)[(string)$unit['unitId']])) return ['ok' => false, 'error' => 'not_found'];
    }
    $url = trim((string)$mat['url']);
    $src = function_exists('cm3_doc_source') ? cm3_doc_source($url) : null;
    if (!$src) return ['ok' => false, 'error' => 'external', 'url' => $url];
    $got = cm3_doc_get($src);
    if ((int)$got['code'] !== 200 || $got['body'] === '') return ['ok' => false, 'error' => 'fetch_failed'];
    if (strlen($got['body']) > CM3_DOC_MAX_BYTES) return ['ok' => false, 'error' => 'doc_too_big'];
    $ext = strtolower($src['format'] ?? '') ?: strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));
    if ($ext === '' && strncmp($got['body'], '%PDF', 4) === 0) $ext = 'pdf';
    $types = (defined('STORE_TYPES') ? STORE_TYPES['pdf'] + STORE_TYPES['raw'] : []) + ['pdf' => 'application/pdf'];
    $name = trim((string)preg_replace('/[^A-Za-z0-9 ._()-]+/', '', (string)$mat['title'])) ?: 'Lesson file';
    if ($ext !== '' && !preg_match('/\.' . preg_quote($ext, '/') . '$/i', $name)) $name .= '.' . $ext;
    return ['ok' => true, 'name' => $name, 'ext' => $ext, 'mime' => (string)($types[$ext] ?? 'application/octet-stream'), 'body' => $got['body']];
}

/** Whether a lesson of this stage and year falls due on the term's clock. */
function curriculum_stage_due(string $stage, int $year, int $placedYear): bool {
    return $stage === '' || ($stage === 'current' && ($year === 0 || $year <= $placedYear));
}

/** Every published lesson of the member's courses, before the year is applied. */
function curriculum_member_units_all(array $m): array {
    /* Reach, not identity. curriculum_member_courses() has ALREADY widened each
       course to its subject — a guitarist's list holds Guitar and Music — so
       only the DIVISION is added here. Running the full course_reach() over
       that list widens Music a second time, back down to every strand under
       it, and the guitarist starts receiving Piano's lessons. Add the
       division; do not re-widen. */
    $courses = [];
    foreach (curriculum_member_courses($m) as $c) {
        $courses[mb_strtolower((string)$c)] = true;
        $div = course_division((string)$c);
        if ($div !== '') $courses[mb_strtolower($div)] = true;
    }
    $courses = array_keys($courses);
    if (!$courses) return curriculum_load("status = 'published' AND course = ''", [], 'week, course, position');
    $ph = implode(',', array_fill(0, count($courses), '?'));
    return curriculum_load("status = 'published' AND (course = '' OR lower(course) IN ($ph))", $courses, 'week, course, position');
}

/** The member's lessons for where they are in the programme; each bundle carries its `stage`. */
function curriculum_member_units(array $m, ?array &$placement = null): array {
    $all = curriculum_member_units_all($m);
    $placement = curriculum_member_year($m) + ['courses' => []];
    if (!$all) return [];
    $ids = array_keys($all);
    $prog = [];
    foreach (db_all('SELECT unitId, status FROM curriculum_progress WHERE memberId = ? AND unitId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')',
                    array_merge([(string)$m['memberId']], $ids)) as $r) $prog[(string)$r['unitId']] = $r;
    $stages = curriculum_adapt(array_map(fn($b) => $b['unit'], $all), (int)$placement['year'], $prog, $courses);
    $placement['courses'] = $courses;
    $out = [];
    foreach ($all as $id => $b) if (array_key_exists($id, $stages)) $out[$id] = $b + ['stage' => $stages[$id]];
    return $out;
}

/** staff.curriculum.year — place a member in a programme year (0 clears it: they start at Year 1 and progress moves them on). */
function staff_curriculum_year(array $p): array {
    // From the Control Room it is the `curriculum` capability within the admin's centres; from a portal, the instructor's own members.
    if (!empty($p['viaAdmin'])) {
        $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
        $by = (string)$g['requester']['memberId'];
    } else {
        $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
        $by = (string)$g['member']['memberId'];
    }
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($p['viaAdmin']) ? !admin_centre_allowed($g['requester'], (string)$m['centre'])
                              : ($g['centres'] !== null && !in_array((string)$m['centre'], $g['centres'], true))) return ['ok' => false, 'error' => 'out_of_scope'];
    $year = (int)($p['year'] ?? -1);
    if (!is_numeric($p['year'] ?? null) || $year < 0 || $year > CURR_PROGRAMME_YEARS) return ['ok' => false, 'error' => 'bad_year', 'max' => CURR_PROGRAMME_YEARS];
    $was = curriculum_member_year($m);
    if ($year === 0) db_exec('DELETE FROM member_state WHERE memberId = ? AND stateKey = ?', [(string)$m['memberId'], CURR_YEAR_KEY]);
    else db_upsert('member_state', ['memberId' => (string)$m['memberId'], 'stateKey' => CURR_YEAR_KEY, 'stateValue' => (string)$year, 'updatedAt' => now_iso()],
                   ['memberId', 'stateKey'], ['stateValue' => (string)$year, 'updatedAt' => now_iso()]);
    $now = curriculum_member_year($m);
    audit('curriculum.year', $by, (string)$m['memberId'], ['from' => $was['year'], 'to' => $now['year'], 'source' => $now['source']]);
    return ['ok' => true, 'placement' => $now, 'unchanged' => $was['year'] === $now['year'] && $was['source'] === $now['source']];
}

/* ── Placing a whole class in the curriculum, quickly ──────────────────────
 *
 * "We have to assess all of them where they should be in the curriculum: how
 * do we quickly do that?" One screen: every child of the class with the year
 * they are placed in now and a SUGGESTED year with its reason, from how long
 * they have been in NGG (their intake year) and how much of their current
 * year's lessons they have done. The instructor confirms or changes each and
 * saves the class in one press; each row goes through staff_curriculum_year,
 * so there is one placement, not two. */
const CURR_PLACE_MAX = 200;

function curriculum_suggest_year(array $m, ?array $state = null): array {
    $intake = function_exists('member_intake_year') ? member_intake_year($m) : 0;
    $byTime = $intake > 0 ? max(1, min(CURR_PROGRAMME_YEARS, (int)gmdate('Y') - $intake + 1)) : 1;
    $why = $intake > 0 ? 'Joined in ' . $intake . ': year ' . $byTime . ' of NGG' : 'No intake year on record: starts at Year 1';
    $year = $byTime;
    if ($state && $state['total'] >= 4) {
        $share = $state['done'] / max(1, $state['total']);
        if ($share >= 0.8 && $year < CURR_PROGRAMME_YEARS && ($state['avg'] ?? 0) >= 70) { $year++; $why .= '; has done ' . $state['done'] . ' of ' . $state['total'] . ' lessons well, so one year up'; }
        elseif ($share < 0.2 && $year > 1 && $state['done'] < 2) { $year--; $why .= '; has done little of the lessons yet, so a year back to fill the gaps'; }
    }
    return ['year' => $year, 'why' => $why];
}

/** staff.curriculum.placement — the class (or the admin's members) with their placement and a suggestion. */
function staff_curriculum_placement(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $where = "status = 'active' AND lower(COALESCE(type,'NGG')) = 'ngg'"; $args = [];
    $centres = $g['centres'] ?? null;
    if ($centres !== null) { if (!$centres) return ['ok' => true, 'rows' => [], 'max' => CURR_PROGRAMME_YEARS];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')'; $args = array_merge($args, $centres); }
    $course = trim((string)($p['course'] ?? ''));
    if ($course !== '') { [$cs, $ca] = member_course_sql($course); $where .= ' AND ' . $cs; $args = array_merge($args, $ca); }
    $rows = [];
    foreach (db_all("SELECT memberId, fullName, centre, track, courses, disciplines, division, cohort, joinDate, createdAt FROM members WHERE $where ORDER BY fullName LIMIT " . CURR_PLACE_MAX, $args) as $m) {
        if (($g['courses'] ?? null) !== null && !member_takes_any($m, (array)$g['courses'])) continue;
        $st = curriculum_child_state($m, $course);
        $now = curriculum_member_year($m);
        $sug = curriculum_suggest_year($m, $st);
        $rows[] = ['memberId' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'centre' => (string)$m['centre'],
            'year' => (int)$now['year'], 'placed' => $now['source'] === 'set', 'suggested' => $sug['year'], 'why' => $sug['why'],
            'done' => $st['done'], 'total' => $st['total'], 'avg' => $st['avg']];
    }
    return ['ok' => true, 'rows' => $rows, 'max' => CURR_PROGRAMME_YEARS, 'course' => $course];
}

/** staff.curriculum.place — save many placements at once; per-row verdicts, one audit event. */
function staff_curriculum_place(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $in = is_array($p['placements'] ?? null) ? $p['placements'] : [];
    if (!$in) return ['ok' => false, 'error' => 'nothing_to_place'];
    if (count($in) > CURR_PLACE_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CURR_PLACE_MAX];
    foreach ($in as $x) if (!is_array($x) || !is_numeric($x['year'] ?? null) || (int)$x['year'] < 1 || (int)$x['year'] > CURR_PROGRAMME_YEARS) return ['ok' => false, 'error' => 'bad_year', 'max' => CURR_PROGRAMME_YEARS];
    $results = []; $applied = 0; $unchanged = 0; $failed = 0;
    foreach ($in as $x) {
        $r = staff_curriculum_year(['requesterId' => (string)$p['requesterId'], 'memberId' => (string)($x['memberId'] ?? ''), 'year' => (int)$x['year']] + (isset($p['as']) ? ['as' => $p['as']] : []));
        $results[] = ['memberId' => (string)($x['memberId'] ?? ''), 'ok' => !empty($r['ok']), 'error' => (string)($r['error'] ?? ''), 'unchanged' => !empty($r['unchanged'])];
        if (empty($r['ok'])) $failed++; elseif (!empty($r['unchanged'])) $unchanged++; else $applied++;
    }
    audit('curriculum.place', (string)$g['member']['memberId'], 'class', ['applied' => $applied, 'unchanged' => $unchanged, 'failed' => $failed], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'failed' => $failed, 'results' => $results];
}

/**
 * staff.curriculum.confirm — the instructor says what a child HAS done: ticks
 * lessons done (or takes a tick back). The portal's numbers are an estimate;
 * this is the instructor's validation. A lesson the child completed online
 * keeps its score; a ticked one is completed with no score and says who
 * confirmed it. Only the instructor's own children and courses.
 */
const CURR_CONFIRM_MAX = 300;
function staff_curriculum_confirm(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $by = (string)$g['member']['memberId'];
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (($g['centres'] ?? null) !== null && !in_array((string)$m['centre'], $g['centres'], true)) return ['ok' => false, 'error' => 'out_of_scope'];
    $done = !array_key_exists('done', $p) || !empty($p['done']);
    $ids = array_values(array_unique(array_filter(array_map('strval', (array)($p['unitIds'] ?? [])))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_to_confirm'];
    if (count($ids) > CURR_CONFIRM_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CURR_CONFIRM_MAX];
    $mine = curriculum_member_units($m, $placement);
    $all = curriculum_member_units_all($m);   // their courses' lessons, any year
    $now = now_iso(); $applied = 0; $unchanged = 0; $refused = [];
    foreach ($ids as $uid) {
        $b = $all[$uid] ?? $mine[$uid] ?? null;
        if (!$b) { $refused[] = ['unitId' => $uid, 'error' => 'not_their_lesson']; continue; }
        if (($g['courses'] ?? null) !== null && (string)$b['unit']['course'] !== '' && !in_array(mb_strtolower((string)$b['unit']['course']), array_map('mb_strtolower', (array)$g['courses']), true)) { $refused[] = ['unitId' => $uid, 'error' => 'not_your_course']; continue; }
        $pr = db_row('SELECT * FROM curriculum_progress WHERE memberId = ? AND unitId = ? LIMIT 1', [(string)$m['memberId'], $uid]);
        if ($done) {
            if ($pr && (string)$pr['status'] === 'completed') { $unchanged++; continue; }
            if ($pr) db_update('curriculum_progress', ['status' => 'completed', 'completedAt' => $now, 'updatedAt' => $now, 'markedBy' => 'confirmed:' . $by, 'pending' => 0], ['id' => (int)$pr['id']]);
            else db_insert('curriculum_progress', ['unitId' => $uid, 'memberId' => (string)$m['memberId'], 'status' => 'completed', 'unitVersion' => (int)($b['unit']['version'] ?? 1),
                'score' => 0, 'maxScore' => 0, 'bestPct' => 0, 'attempts' => 0, 'answers' => '', 'marks' => '', 'feedback' => '', 'pending' => 0,
                'markedBy' => 'confirmed:' . $by, 'startedAt' => $now, 'completedAt' => $now, 'updatedAt' => $now]);
            $applied++;
        } else {
            // Only a tick can be taken back; a lesson the child did online stays theirs.
            if (!$pr || !str_starts_with((string)$pr['markedBy'], 'confirmed:') || (int)$pr['attempts'] > 0) { $unchanged++; continue; }
            db_exec('DELETE FROM curriculum_progress WHERE id = ?', [(int)$pr['id']]);
            $applied++;
        }
    }
    audit('curriculum.confirm', $by, (string)$m['memberId'], ['done' => $done, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => count($refused)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'state' => curriculum_child_state($m)];
}

/** A member's curriculum with their progress — the portal, a mentor's view and the report share it. */
function curriculum_for_member(array $m): array {
    $units = curriculum_member_units($m, $placement);
    $prog = [];
    if ($units) {
        $ids = array_keys($units);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT * FROM curriculum_progress WHERE memberId = ? AND unitId IN ($ph)", array_merge([(string)$m['memberId']], $ids)) as $r) $prog[(string)$r['unitId']] = $r;
    }
    $out = []; $done = 0; $overdue = 0;
    $cfg = curriculum_schedule();
    $start = curriculum_member_start($m, $cfg);
    $today = attendance_today();
    foreach ($units as $id => $b) {
        $u = $b['unit']; $pr = $prog[$id] ?? null;
        if ($pr && $pr['status'] === 'completed') $done++;
        // Catch-up, and a year opened early by progress, is self-paced: never overdue.
        $due = curriculum_stage_due($b['stage'], curriculum_level_year((string)$u['level']), (int)$placement['year']) ? curriculum_due_facts($start, $u, count($b['checks']), $pr, $today, $cfg)
             : ['dueDate' => '', 'overdueDays' => 0, 'outstanding' => false];
        if ($due['overdueDays'] > 0) $overdue++;
        $out[] = ['unitId' => $id, 'course' => (string)$u['course'], 'level' => (string)$u['level'], 'week' => (int)$u['week'],
            'position' => (int)$u['position'], 'title' => (string)$u['title'], 'summary' => (string)$u['summary'],
            'stage' => (string)$b['stage'], 'year' => curriculum_level_year((string)$u['level']), 'path' => curriculum_path((string)$u['level'], (int)$u['week']),
            'durationMins' => (int)$u['durationMins'], 'materials' => count($b['materials']), 'checks' => count($b['checks']),
            'dueDate' => $due['dueDate'], 'overdueDays' => $due['overdueDays'],
            'fineAfterDays' => (int)$cfg['fineAfterDays'], 'fineAmount' => (int)$cfg['fineAmount'],
            'progress' => $pr ? ['status' => (string)$pr['status'], 'bestPct' => (int)$pr['bestPct'], 'attempts' => (int)$pr['attempts'],
                                 'pending' => (int)$pr['pending'] > 0, 'completedAt' => (string)$pr['completedAt'],
                                 'stale' => (int)$pr['unitVersion'] !== (int)$u['version'] && (int)$pr['attempts'] > 0] : null];
    }
    return ['units' => $out, 'total' => count($out), 'completed' => $done, 'overdue' => $overdue,
            'pct' => $out ? (int)round($done / count($out) * 100) : 0, 'placement' => $placement];
}

function curriculum_member_row(string $memberId): ?array {
    $m = db_row('SELECT memberId, fullName, track, courses, disciplines, division, centre, type, status, cohort, displayId, joinDate, createdAt FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    return ($m && member_is_ngg($m)) ? $m : null;
}

function member_curriculum_list(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $c = curriculum_for_member($m);
    // The Learn app's notes, saves, recently opened and figures (domain/learn.php), in the same read.
    return ['ok' => true, 'track' => (string)$m['track']] + $c
         + (function_exists('learn_state_for') ? ['learn' => learn_state_for($m, $c['units'])] : []);
}

function member_curriculum_unit(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $id = (string)($p['unitId'] ?? '');
    if (!isset($units[$id])) return ['ok' => false, 'error' => 'not_found'];
    $b = $units[$id];
    $pr = db_row('SELECT * FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [$id, (string)$m['memberId']]);
    if (!$pr) {
        // Opening a lesson starts it; a duplicate from a double tap is harmless.
        try { db_insert('curriculum_progress', ['unitId' => $id, 'memberId' => (string)$m['memberId'], 'status' => 'started',
            'unitVersion' => (int)$b['unit']['version'], 'startedAt' => now_iso(), 'updatedAt' => now_iso()]); } catch (\Throwable $e) {}
        $pr = db_row('SELECT * FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [$id, (string)$m['memberId']]);
    }
    /* How they said today went, so the taps show their own answer back
       (domain/lesson-feedback.php). This is NOT the testimonial — that is
       asked once a session, not once a Saturday. */
    $say = function_exists('member_lesson_feedback_mine')
        ? (member_lesson_feedback_mine(['memberId' => (string)$m['memberId'], 'unitId' => $id])['mine'] ?? null) : null;
    if (function_exists('learn_touch')) learn_touch((string)$m['memberId'], $id);
    return ['ok' => true, 'unit' => curriculum_unit_public($b['unit'], $b['materials'], $b['checks'], false),
            'mine' => function_exists('learn_mine') ? learn_mine((string)$m['memberId'], $id) : null,
            'progress' => curriculum_progress_public($pr, $b),
            'review' => curriculum_opening_review($units, $id, (string)$m['memberId']),
            'feedback' => $say];
}

/**
 * THE OPENING REVIEW: the previous session's questions, sat at the start of
 * this one.
 *
 * A lesson's questions are written with it, by the person who knows what it
 * taught, and asked a week later — because a test at the end of the hour
 * measures the hour, with everything still on the whiteboard, and a test a
 * week later measures what survived. Having to pull a cold memory back out
 * is itself what fixes it there.
 *
 * Deliberately NOT a new table, a new op or a new progress row. The member
 * answers through `member.curriculum.submit` against the PREVIOUS unitId, so
 * the attempt is recorded against the lesson the questions belong to, which
 * is where every report, deadline and completion already looks for it. The
 * only new thing is WHEN they are put in front of somebody.
 *
 * It is offered, never forced. A child who joined this term late, or who was
 * away, must still be able to read today's lesson — a review they cannot
 * pass is not a reason to lock them out of the teaching.
 */
function curriculum_opening_review(array $units, string $unitId, string $memberId): ?array {
    if (!curriculum_schedule()['reviewAtStart']) return null;   // Control Room → Curriculum → Schedule
    $ids = array_keys($units);
    $at = array_search($unitId, $ids, true);
    if ($at === false || $at === 0) return null;          // the first lesson reviews nothing

    $prevId = (string)$ids[$at - 1];
    $prev = $units[$prevId];
    if (!$prev['checks']) return null;                     // nothing was ever asked of it
    // A different course's lesson is not last week's lesson.
    if (mb_strtolower((string)$prev['unit']['course']) !== mb_strtolower((string)$units[$unitId]['unit']['course'])) return null;

    $pr = db_row('SELECT status, bestPct, pending FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [$prevId, $memberId]);
    if ($pr && (string)$pr['status'] === 'completed') return null;   // already done, don't ask twice

    $pub = curriculum_unit_public($prev['unit'], [], $prev['checks'], false);
    return [
        'unitId' => $prevId,
        'title' => (string)$prev['unit']['title'],
        'week' => (int)$prev['unit']['week'],
        'passMark' => (int)$prev['unit']['passMark'],
        'checks' => $pub['checks'],
        'attempted' => $pr ? in_array((string)$pr['status'], ['attempted', 'submitted'], true) : false,
        'pending' => $pr ? (int)$pr['pending'] > 0 : false,
    ];
}

/**
 * The member's curriculum as one document — every published lesson of their
 * course and the Club-wide ones, in teaching order, with what they have done.
 *
 * Data only. How it LOOKS is api/_lib/templates/curriculum-document.*, so a
 * design pass replaces the template without touching what goes into it. The
 * checks' prompts travel; their answers and rubrics never do — a downloaded
 * file is a file that can be forwarded.
 */
function member_curriculum_document(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $prog = [];
    if ($units) {
        $ids = array_keys($units);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT unitId, status, bestPct, completedAt FROM curriculum_progress WHERE memberId = ? AND unitId IN ($ph)",
                        array_merge([(string)$m['memberId']], $ids)) as $r) $prog[(string)$r['unitId']] = $r;
    }
    $weeks = []; $done = 0;
    foreach ($units as $id => $b) {
        $u = curriculum_strip_assignments(curriculum_unit_public($b['unit'], $b['materials'], $b['checks'], false));
        $pr = $prog[$id] ?? null;
        $u['progress'] = $pr ? ['status' => (string)$pr['status'], 'bestPct' => (int)$pr['bestPct'], 'completedAt' => (string)$pr['completedAt']] : null;
        if ($pr && $pr['status'] === 'completed') $done++;
        $weeks[(int)$u['week']][] = $u;
    }
    ksort($weeks);
    return ['ok' => true, 'document' => [
        'title' => trim((string)$m['track']) !== '' ? trim((string)$m['track']) . ' curriculum' : 'NGG Club curriculum',
        'member' => ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'],
                     'track' => (string)$m['track'], 'centre' => (string)$m['centre']],
        'generatedAt' => now_iso(),
        'total' => count($units), 'completed' => $done,
        'pct' => $units ? (int)round($done / count($units) * 100) : 0,
        'weeks' => array_map(static fn($w, $list) => ['week' => $w, 'lessons' => $list], array_keys($weeks), array_values($weeks)),
    ]];
}

/**
 * A lesson as a member's copy carries no assignment: the weekly homework is set,
 * dated and marked on the assignments desk, so a printed copy that also lists
 * it would be a second, undated version of the same work. The section headed
 * "…assignment" / "homework" goes, and so do the marked tasks that are that
 * homework (a task, project or essay check); the quick checks stay.
 */
function curriculum_strip_assignments(array $u): array {
    $u['body'] = trim((string)preg_replace('/(^|\n)#{2,4}[^\n]*(assignment|homework)[^\n]*\n.*?(?=\n#{2,4}\s|\n>|$)/isu', '$1', (string)$u['body']));
    $u['checks'] = array_values(array_filter($u['checks'] ?? [], static fn($c) => !in_array((string)$c['kind'], ['task', 'project', 'essay'], true)
        && !preg_match('/^\s*assignment\b/i', (string)$c['prompt'])));
    return $u;
}

/**
 * admin.curriculum.document — one course (optionally one level) as a printable
 * document. `edition` 'staff' carries the answers and marking guides; 'member'
 * is the copy a member may be handed: no answers, and no assignments.
 */
function admin_curriculum_document(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $course = trim((string)($p['course'] ?? ''));
    $level = trim((string)($p['level'] ?? ''));
    $staff = (string)($p['edition'] ?? 'staff') !== 'member';
    $where = "status = 'published' AND lower(course) = ?"; $args = [mb_strtolower($course)];
    if ($level !== '') { $where .= ' AND level = ?'; $args[] = $level; }
    $units = curriculum_load($where, $args, 'level, week, position');
    if (!$units) return ['ok' => false, 'error' => 'not_found', 'detail' => 'No published lessons for that course' . ($level !== '' ? ' and level' : '') . '.'];
    $groups = [];
    foreach ($units as $b) {
        $u = curriculum_unit_public($b['unit'], $b['materials'], $b['checks'], $staff);
        if (!$staff) $u = curriculum_strip_assignments($u);
        if ($staff) foreach ($u['checks'] as &$c) {
            if ($c['kind'] === 'mcq' && ctype_digit((string)$c['answer']) && isset($c['options'][(int)$c['answer']])) $c['answerText'] = $c['options'][(int)$c['answer']];
            elseif ((string)$c['answer'] !== '') $c['answerText'] = (string)$c['answer'];
        }
        unset($c);
        $u['progress'] = null;
        $key = $u['path']['label'];
        $groups[$key][] = $u;
    }
    return ['ok' => true, 'document' => [
        'edition' => $staff ? 'staff' : 'member',
        'title' => ($units ? (string)reset($units)['unit']['course'] : $course) . ' curriculum' . ($level !== '' ? ' — ' . $level : ''),
        'member' => ['memberId' => '', 'fullName' => $staff ? 'Instructor edition' : 'Member edition', 'track' => $course, 'centre' => ''],
        'generatedAt' => now_iso(), 'total' => count($units), 'completed' => 0, 'pct' => 0,
        'weeks' => array_map(static fn($k, $list) => ['label' => $k, 'week' => (int)$list[0]['week'], 'lessons' => $list], array_keys($groups), array_values($groups)),
    ]];
}

/* ── The study helper: a member asks about a lesson they are taking ──────────
 *
 * The AI answers from the lesson itself (its text, objectives and materials),
 * as a patient tutor: it explains, gives a worked example, asks a question
 * back — and never hands over the answers to the lesson's checks, which it is
 * not shown. A daily allowance per member keeps it a study aid, and the count
 * lives under an `ai.` key that member_state_set refuses, so a member cannot
 * reset their own. Distress in a question is answered with a trusted adult,
 * not a lesson.
 */
const CURR_TUTOR_PER_DAY = 20;
const CURR_TUTOR_Q_MAX   = 600;
/* How much of the conversation travels back. Enough for a follow-up and a
   follow-up to that; not so much that a long thread crowds out the lesson. */
const CURR_TUTOR_TURNS   = 8;

/**
 * THE STUDY HELPER — a tutor, not a search box.
 *
 * It was a one-shot form: one question in, one paragraph out, no memory. A
 * child who read the answer and said "I still don't get it" was starting
 * again from nothing, because only the latest question was ever sent. That is
 * not what being stuck is like, and it is the whole reason the thing felt
 * useless. It carries the conversation now.
 *
 * Three things it is given that it never had:
 *   - the THREAD, so a follow-up is a follow-up;
 *   - the member's programme YEAR, so a Year 1 child and a Year 3 child
 *     asking the same question are not answered the same way;
 *   - WHAT THEY GOT WRONG on this lesson's review, when they have sat it. A
 *     tutor who can see the actual mistake teaches the actual gap instead of
 *     re-explaining the part they already understood.
 *
 * What it still must not do: give away an answer to a graded question, do an
 * assignment, or carry on as if distress were a study question.
 */
function member_curriculum_ask(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $q = trim(mb_substr((string)($p['question'] ?? ''), 0, CURR_TUTOR_Q_MAX));
    if (mb_strlen($q) < 4) return ['ok' => false, 'error' => 'question_too_short'];
    $units = curriculum_member_units($m, $placement);
    $id = (string)($p['unitId'] ?? '');
    if (!isset($units[$id])) return ['ok' => false, 'error' => 'not_found'];
    $key = 'ai.tutor.' . gmdate('Y-m-d');
    $used = (int)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [(string)$m['memberId'], $key])['stateValue'] ?? 0);
    if ($used >= CURR_TUTOR_PER_DAY) return ['ok' => false, 'error' => 'daily_limit', 'limit' => CURR_TUTOR_PER_DAY, 'left' => 0];
    if (!function_exists('ai_enabled') || !ai_enabled('coach')) return ['ok' => false, 'error' => 'ai_disabled'];
    // Distress is not a study question: point to people, and count nothing.
    if (preg_match('/\b(kill myself|suicide|hurt myself|self[- ]harm|abuse[ds]?|touch(ed|es) me|want to die)\b/i', $q))
        return ['ok' => true, 'answer' => 'That sounds really important, and it is not something to work out alone. Please talk to your mentor, your instructor or a parent today — or use "Report a concern" in your portal, which goes straight to the safeguarding team.', 'safeguarding' => true, 'left' => CURR_TUTOR_PER_DAY - $used];
    // Spend the allowance BEFORE the model is called, so parallel requests cannot all slip under it.
    db_upsert('member_state', ['memberId' => (string)$m['memberId'], 'stateKey' => $key, 'stateValue' => (string)($used + 1), 'updatedAt' => now_iso()],
              ['memberId', 'stateKey'], ['stateValue' => (string)($used + 1), 'updatedAt' => now_iso()]);

    $b = $units[$id];
    $u = $b['unit'];
    $obj = implode('; ', json_decode((string)$u['objectives'], true) ?: []);
    $lesson = "Course: {$u['course']}\nLesson: {$u['title']}\nObjectives: $obj\n\n"
            . mb_substr(preg_replace('/##\s*This week.s assignment.*$/su', '', (string)$u['body']), 0, 6000);

    /* WHAT THEY ALREADY GOT WRONG. The prompt, their answer and the mark —
       never the model answer, which is the thing they must not be handed. */
    $wrong = curriculum_ask_gaps($b, (string)$m['memberId']);

    $year = (int)($placement['year'] ?? 1);
    $system = 'You are the NGG study helper: a patient, encouraging tutor for a ' . (($year >= 3) ? '15-17' : ($year === 2 ? '12-15' : '10-13'))
        . ' year old member of Next Generation Genius in Nigeria, in year ' . $year . ' of three. '
        . 'Teach, do not lecture. Explain the ONE thing they are stuck on, in short sentences, with a concrete example they could '
        . 'actually try — use Nigerian everyday things for examples, not American ones. Build on what has already been said in this '
        . 'conversation rather than starting again. End with one short question that checks they followed. '
        . 'At most 200 words, plain British English, no markdown headings. '
        . 'NEVER give the answer to a graded question and never do their assignment — help them work it out. '
        . 'If they ask about something close to the lesson, help anyway; only decline if it is nothing to do with their studies. '
        . 'Never ask for personal details.'
        . ($wrong !== '' ? "\n\nTHEY RECENTLY GOT THESE WRONG in this lesson's review. Teach to this gap; do not read them the answer:\n" . $wrong : '')
        . "\n\nTHE LESSON:\n" . $lesson;

    /* The thread. The client sends it back; it is capped here rather than
       trusted, and only the text is taken — a role the client invents must
       not be able to put words in the system's mouth. */
    $turns = [];
    foreach (is_array($p['history'] ?? null) ? $p['history'] : [] as $t) {
        if (!is_array($t)) continue;
        $text = trim(mb_substr((string)($t['text'] ?? ''), 0, 1200));
        if ($text === '') continue;
        $turns[] = ['role' => (string)($t['role'] ?? '') === 'ai' ? 'ai' : 'me', 'text' => $text];
    }
    $turns = array_slice($turns, -CURR_TUTOR_TURNS);
    $turns[] = ['role' => 'me', 'text' => $q];

    $r = ai_chat($system, $turns, 560, 'coach');
    if (empty($r['ok'])) {
        // A failed answer is given back.
        db_exec('UPDATE member_state SET stateValue = ? WHERE memberId = ? AND stateKey = ?', [(string)$used, (string)$m['memberId'], $key]);
        return ['ok' => false, 'error' => (string)($r['error'] ?? 'ai_failed')];
    }
    return ['ok' => true, 'answer' => mb_substr(trim((string)$r['text']), 0, 2400), 'left' => CURR_TUTOR_PER_DAY - $used - 1, 'limit' => CURR_TUTOR_PER_DAY];
}

/**
 * The questions this member got wrong on a lesson, as a line each: the
 * question, what they wrote, and what it scored. Never the model answer —
 * that is precisely what the tutor must not hand over.
 */
function curriculum_ask_gaps(array $b, string $memberId): string {
    $pr = db_row('SELECT answers, marks FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [(string)$b['unit']['unitId'], $memberId]);
    if (!$pr) return '';
    $answers = json_decode((string)$pr['answers'], true) ?: [];
    $marks = json_decode((string)$pr['marks'], true) ?: [];
    if (!$marks) return '';
    $out = [];
    foreach ($b['checks'] as $c) {
        $cid = (string)$c['checkId'];
        $mk = $marks[$cid] ?? null;
        if (!is_array($mk) || !isset($mk['points'])) continue;
        $pts = (int)$c['points'];
        if ($pts <= 0 || (float)$mk['points'] >= $pts) continue;      // they got it
        $mine = $answers[$cid] ?? '';
        if ((string)$c['kind'] === 'mcq') {
            $opts = json_decode((string)$c['options'], true) ?: [];
            $mine = is_numeric($mine) && isset($opts[(int)$mine]) ? (string)$opts[(int)$mine] : '(no answer)';
        }
        $mine = trim(mb_substr((string)$mine, 0, 300));
        $out[] = '- Question: ' . mb_substr((string)$c['prompt'], 0, 240)
               . "\n  They answered: " . ($mine === '' ? '(nothing)' : $mine)
               . "\n  Scored " . (int)$mk['points'] . ' of ' . $pts;
        if (count($out) >= 4) break;
    }
    return implode("\n", $out);
}

/** Render the curriculum document through its template (api/_lib/templates). */
function curriculum_document_html(array $doc, string $format): string {
    $dir = dirname(__DIR__) . '/templates';
    $css = (string)@file_get_contents($dir . '/curriculum-document.css');
    ob_start();
    (static function () use ($doc, $format, $css, $dir) { require $dir . '/curriculum-document.php'; })();
    return (string)ob_get_clean();
}

/** A lesson's text as HTML: the same three rules the portal's CurriculumText
 *  applies — blank lines make paragraphs, "- " a list, "## " a heading — and
 *  everything escaped, so nothing a lesson says becomes markup. */
function curriculum_text_html(string $text): string {
    $e = static fn($v) => htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safe = static fn($u) => (bool)preg_match('#^(https://[^\s<>"\']+|/api/member/curriculum-file\.php\?f=[a-f0-9]{16,64}\.[a-z0-9]{2,5})$#i', $u);
    // Inline: **bold**, *italic*, `code`, [text](url) — escaped first, so a
    // lesson's own angle brackets stay text.
    $inline = static function (string $line) use ($e, $safe): string {
        $out = ''; $last = 0;
        if (preg_match_all('/\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/', $line, $mm, PREG_OFFSET_CAPTURE | PREG_SET_ORDER)) {
            foreach ($mm as $m) {
                $out .= $e(substr($line, $last, $m[0][1] - $last));
                if (($m[1][0] ?? '') !== '') $out .= '<strong>' . $e($m[1][0]) . '</strong>';
                elseif (($m[2][0] ?? '') !== '') $out .= '<em>' . $e($m[2][0]) . '</em>';
                elseif (($m[3][0] ?? '') !== '') $out .= '<code>' . $e($m[3][0]) . '</code>';
                else { $u = (string)($m[5][0] ?? ''); $href = str_starts_with($u, '/') ? curriculum_absolute_url($u) : $u;
                       $out .= $safe($u) ? '<a href="' . $e($href) . '">' . $e($m[4][0]) . '</a>' : $e($m[4][0]); }
                $last = $m[0][1] + strlen($m[0][0]);
            }
        }
        return $out . $e(substr($line, $last));
    };
    $out = '';
    $parts = preg_split('/^```[^\n]*\R?/m', str_replace("\r\n", "\n", trim($text)));
    foreach ($parts as $pi => $part) {
        if ($pi % 2 === 1) { $out .= '<pre><code>' . $e(rtrim($part, "\n")) . '</code></pre>'; continue; }
        foreach (preg_split("/\\R\\s*\\R/", trim($part)) as $block) {
            $lines = array_values(array_filter(array_map('rtrim', preg_split("/\\R/", $block)), static fn($l) => trim($l) !== ''));
            if (!$lines) continue;
            $all = static fn($re) => count(array_filter($lines, static fn($l) => (bool)preg_match($re, ltrim($l)))) === count($lines);
            if ($all('/^[-*•]\s+/')) { $out .= '<ul>' . implode('', array_map(static fn($l) => '<li>' . $inline(preg_replace('/^[-*•]\s+/', '', ltrim($l))) . '</li>', $lines)) . '</ul>'; continue; }
            if ($all('/^\d+[.)]\s+/')) { $out .= '<ol>' . implode('', array_map(static fn($l) => '<li>' . $inline(preg_replace('/^\d+[.)]\s+/', '', ltrim($l))) . '</li>', $lines)) . '</ol>'; continue; }
            if ($all('/^>\s?/')) { $out .= '<blockquote>' . implode('<br>', array_map(static fn($l) => $inline(preg_replace('/^>\s?/', '', ltrim($l))), $lines)) . '</blockquote>'; continue; }
            if (count($lines) === 1) {
                $one = trim($lines[0]);
                if (preg_match('/^-{3,}$/', $one)) { $out .= '<hr>'; continue; }
                if (preg_match('/^!\[([^\]]*)\]\(([^)\s]+)\)$/', $one, $im) && $safe($im[2])) {
                    $src = str_starts_with($im[2], '/') ? curriculum_absolute_url($im[2]) : $im[2];
                    $out .= '<figure><img src="' . $e($src) . '" alt="' . $e($im[1]) . '" style="max-width:100%">' . ($im[1] !== '' ? '<figcaption>' . $e($im[1]) . '</figcaption>' : '') . '</figure>'; continue;
                }
                if (preg_match('~^https://(?:www\.|m\.)?(?:youtube\.com|youtu\.be|vimeo\.com)/\S+$~i', $one)) { $out .= '<p>Video: <a href="' . $e($one) . '">' . $e($one) . '</a></p>'; continue; }
            }
            foreach ($lines as $i => $l) {
                if (preg_match('/^(#{1,3})\s+(.*)$/', ltrim($l), $h)) { $out .= '<h4>' . $inline($h[2]) . '</h4>'; unset($lines[$i]); }
                else break;
            }
            if ($lines) $out .= '<p>' . implode('<br>', array_map($inline, $lines)) . '</p>';
        }
    }
    return $out;
}

/** A material's address as somebody holding the file would need it. */
function curriculum_absolute_url(string $url): string {
    if (str_starts_with($url, '/')) return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . $url;
    return $url;
}

function curriculum_progress_public(?array $pr, array $b): ?array {
    if (!$pr) return null;
    $marks = json_decode((string)$pr['marks'], true) ?: [];
    $answers = json_decode((string)$pr['answers'], true) ?: [];
    return ['status' => (string)$pr['status'], 'score' => (float)$pr['score'], 'maxScore' => (float)$pr['maxScore'],
            'bestPct' => (int)$pr['bestPct'], 'attempts' => (int)$pr['attempts'], 'pending' => (int)$pr['pending'] > 0,
            'passMark' => (int)$b['unit']['passMark'], 'feedback' => (string)$pr['feedback'], 'answers' => $answers,
            'marks' => $marks, 'completedAt' => (string)$pr['completedAt'],
            'stale' => (int)$pr['unitVersion'] !== (int)$b['unit']['version'] && (int)$pr['attempts'] > 0];
}

/**
 * Mark one written answer with the AI, or return null to leave it for a person.
 * The mark is a whole number of points; the reason is stored with it and shown
 * labelled as the AI's.
 */
function curriculum_ai_mark(array $check, string $answer): ?array {
    if (!function_exists('ai_classify') || trim($answer) === '') return null;
    $kind = isset(CURR_MARKING_GUIDE[$check['kind']]) ? (string)$check['kind'] : 'short';
    /* Safeguarding before marking: a reflection that discloses harm is not a
       thing to score. It is held for a person, and flagged. */
    if (function_exists('coach_is_crisis') && coach_is_crisis($answer)) return ['hold' => true, 'flag' => 'safeguarding'];
    $pts = (int)$check['points'];
    $r = ai_classify("You are an experienced, fair and kind teacher marking work by a 10–17 year old in the NGG Club. "
        . CURR_MARKING_GUIDE[$kind] . " Award whole points from 0 to $pts. Give one or two encouraging sentences: what was good, and the one "
        . "thing that would earn more. Also say how confident you are that another good teacher would give the same mark (0 to 1). "
        . "Return JSON {points:int, feedback:string, confidence:number}.",
        "Kind of question: $kind\nQuestion: {$check['prompt']}\n"
        . (trim((string)$check['answer']) !== '' ? ($kind === 'short' ? 'Model answer: ' : 'What a strong answer includes: ') . $check['answer'] . "\n" : '')
        . (trim((string)$check['rubric']) !== '' ? "Rubric: {$check['rubric']}\n" : '')
        . "Maximum points: $pts\n\nLearner's answer:\n" . mb_substr($answer, 0, 6000),
        400, 'marking');
    if (empty($r['ok']) || !isset($r['data']['points'])) return null;
    // An unsure mark is not a mark: a person decides it.
    $conf = isset($r['data']['confidence']) ? (float)$r['data']['confidence'] : 1.0;
    if ($conf < 0.6) return null;
    return ['points' => max(0, min($pts, (int)$r['data']['points'])), 'feedback' => curriculum_clean_text($r['data']['feedback'] ?? '', 600),
            'by' => 'ai', 'confidence' => round($conf, 2)];
}

/** Recompute a progress row's totals from its per-check marks. */
function curriculum_progress_total(array $checks, array $marks, int $passMark): array {
    $score = 0.0; $max = 0.0; $pending = 0;
    foreach ($checks as $c) {
        $max += (int)$c['points'];
        $mk = $marks[(string)$c['checkId']] ?? null;
        if ($mk === null || !isset($mk['points'])) { $pending++; continue; }
        $score += (float)$mk['points'];
    }
    $pct = $max > 0 ? (int)round($score / $max * 100) : 100;
    return ['score' => $score, 'max' => $max, 'pct' => $pct, 'pending' => $pending, 'passed' => $pending === 0 && $pct >= $passMark];
}

function member_curriculum_submit(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $id = (string)($p['unitId'] ?? '');
    if (!isset($units[$id])) return ['ok' => false, 'error' => 'not_found'];
    $b = $units[$id];
    $answers = is_array($p['answers'] ?? null) ? $p['answers'] : [];
    $marks = []; $clean = []; $feedback = [];
    foreach ($b['checks'] as $c) {
        $cid = (string)$c['checkId'];
        $a = $answers[$cid] ?? null;
        if ($c['kind'] === 'mcq') {
            $pick = is_numeric($a) ? (int)$a : -1;
            $clean[$cid] = $pick;
            $marks[$cid] = ['points' => $pick === (int)$c['answer'] ? (int)$c['points'] : 0, 'by' => 'auto'];
        } else {
            $text = curriculum_clean_text($a ?? '', 4000);
            $clean[$cid] = $text;
            if ($text === '') { $marks[$cid] = ['points' => 0, 'by' => 'auto', 'feedback' => 'No answer given.']; continue; }
            $ai = curriculum_ai_mark($c, $text);
            if ($ai && !empty($ai['hold'])) {
                // Held for a person, unmarked, with the reason the instructor sees.
                $marks[$cid] = ['flag' => $ai['flag']];
                audit('curriculum.safeguarding', (string)$m['memberId'], $id, ['checkId' => $cid]);
                continue;
            }
            if ($ai) { $marks[$cid] = $ai; if ($ai['feedback'] !== '') $feedback[] = $ai['feedback']; }
            // No capable AI, or it was unsure: left unmarked for an instructor.
        }
    }
    $t = curriculum_progress_total($b['checks'], $marks, (int)$b['unit']['passMark']);
    $now = now_iso();
    $pr = db_row('SELECT * FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [$id, (string)$m['memberId']]);
    $best = max($pr ? (int)$pr['bestPct'] : 0, $t['pending'] === 0 ? $t['pct'] : 0);
    $completedBefore = $pr && (string)$pr['status'] === 'completed';
    $row = ['status' => $t['passed'] || $completedBefore ? 'completed' : ($t['pending'] > 0 ? 'submitted' : 'attempted'),
            'unitVersion' => (int)$b['unit']['version'], 'score' => $t['score'], 'maxScore' => $t['max'], 'bestPct' => $best,
            'attempts' => ($pr ? (int)$pr['attempts'] : 0) + 1, 'answers' => json_encode($clean, JSON_UNESCAPED_UNICODE),
            'marks' => json_encode($marks, JSON_UNESCAPED_UNICODE), 'feedback' => mb_substr(implode(' ', $feedback), 0, 2000),
            'pending' => $t['pending'] > 0 ? 1 : 0, 'updatedAt' => $now];
    if ($t['passed'] && !$completedBefore) $row['completedAt'] = $now;
    if ($pr) db_update('curriculum_progress', $row, ['id' => $pr['id']]);
    else db_insert('curriculum_progress', $row + ['unitId' => $id, 'memberId' => (string)$m['memberId'], 'startedAt' => $now]);
    if ($t['passed'] && !$completedBefore && function_exists('event_emit')) {
        event_emit('curriculum.completed', ['memberId' => (string)$m['memberId'], 'unitId' => $id, 'title' => (string)$b['unit']['title'], 'pct' => $t['pct']]);
    }
    $pr = db_row('SELECT * FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [$id, (string)$m['memberId']]);
    return ['ok' => true, 'progress' => curriculum_progress_public($pr, $b),
            // The answers are revealed only once the attempt is fully marked.
            'review' => $t['pending'] === 0 ? curriculum_unit_public($b['unit'], $b['materials'], $b['checks'], true)['checks'] : null];
}

/* ══ Instructors and mentors ═══════════════════════════════════════════════ */

/** The portal's own gate, narrowed to the Club: Summer-only staff have no NGG curriculum. */
function curriculum_staff_gate(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    if (!in_array('ngg', $g['programmes'] ?? [], true)) return ['ok' => false, 'error' => 'not_ngg_staff',
        'message' => 'The Club curriculum is for NGG mentors and instructors. Ask an admin to set your programme to NGG.'];
    return $g;
}

/**
 * What an instructor or mentor sees: the lessons for their courses, how their
 * members are getting on with each, and the written answers waiting for them.
 */
function staff_curriculum(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $courses = $g['courses'];   // null = every course
    $where = "status = 'published'"; $args = [];
    if ($courses !== null) {
        if (!$courses) return ['ok' => true, 'units' => [], 'pending' => [], 'members' => 0];
        /* A course's lessons include those filed under its parts: "Piano" and
           "Guitar" lessons are Musical Instruments lessons. Matching the name
           exactly gave a Musical Instruments instructor "0 lessons". */
        $fam = [];
        foreach ($courses as $c) foreach (curriculum_course_family((string)$c) as $f) $fam[mb_strtolower($f)] = true;
        $fam = array_keys($fam);
        $where .= " AND (course = '' OR lower(course) IN (" . implode(',', array_fill(0, count($fam), '?')) . '))'; $args = $fam;
    }
    $units = curriculum_load($where, $args, 'course, week, position');
    $mWhere = "status = 'active' AND COALESCE(type,'NGG') <> 'Summer'"; $mArgs = [];
    /* No centre in reach (an instructor whose safeguarding check is pending,
     * or a record with no centre): the lessons are still theirs to read and
     * prepare; no member, no answer and no progress reaches them. */
    $noChildren = $g['centres'] !== null && !$g['centres'];
    if ($g['centres'] !== null && !$noChildren) {
        $mWhere .= ' AND centre IN (' . implode(',', array_fill(0, count($g['centres']), '?')) . ')'; $mArgs = $g['centres'];
    }
    if ($courses !== null) {
        // Members who take any of the instructor's courses, chosen or by their old track.
        $or = [];
        foreach ($courses as $c) { [$cs, $ca] = member_course_sql((string)$c); $or[] = $cs; $mArgs = array_merge($mArgs, $ca); }
        $mWhere .= $or ? ' AND (' . implode(' OR ', $or) . ')' : ' AND 1 = 0';
    }
    $members = $noChildren ? [] : db_all("SELECT memberId, fullName, displayId, centre, track, courses, disciplines, division, joinDate, createdAt FROM members WHERE $mWhere ORDER BY fullName LIMIT 2000", $mArgs);
    $byId = []; foreach ($members as $mm) $byId[(string)$mm['memberId']] = $mm;
    // Each member's courses, worked out once (the same matching their own page uses).
    $cCtx = null; $cCache = [];
    $coursesOf = function (string $id, array $mm) use (&$cCtx, &$cCache): array {
        return $cCache[$id] ??= array_map('mb_strtolower', curriculum_member_courses($mm, $cCtx));
    };
    $stats = []; $pending = []; $doneBy = [];
    if ($units && $byId) {
        $uids = array_keys($units); $mids = array_keys($byId);
        $rows = db_all('SELECT * FROM curriculum_progress WHERE unitId IN (' . implode(',', array_fill(0, count($uids), '?')) . ')
                        AND memberId IN (' . implode(',', array_fill(0, count($mids), '?')) . ')', array_merge($uids, $mids));
        foreach ($rows as $r) {
            $s = &$stats[(string)$r['unitId']];
            $s['started'] = ($s['started'] ?? 0) + 1;
            if ($r['status'] === 'completed') {
                $s['completed'] = ($s['completed'] ?? 0) + 1;
                $s['scoreSum'] = ($s['scoreSum'] ?? 0) + (int)($r['bestPct'] ?? 0);
            }
            unset($s);
            if (in_array((string)$r['status'], ['completed', 'submitted'], true)) $doneBy[(string)$r['unitId']][(string)$r['memberId']] = true;
            if ((int)$r['pending'] > 0) {
                $b = $units[(string)$r['unitId']];
                $marks = json_decode((string)$r['marks'], true) ?: [];
                $answers = json_decode((string)$r['answers'], true) ?: [];
                $open = [];
                foreach ($b['checks'] as $c) {
                    if (isset($marks[$c['checkId']]['points'])) continue;
                    $open[] = ['checkId' => (string)$c['checkId'], 'kind' => (string)$c['kind'], 'flag' => (string)($marks[$c['checkId']]['flag'] ?? ''),
                               'prompt' => (string)$c['prompt'], 'points' => (int)$c['points'],
                               'modelAnswer' => (string)$c['answer'], 'rubric' => (string)$c['rubric'], 'answer' => (string)($answers[$c['checkId']] ?? '')];
                }
                $pending[] = ['progressId' => (int)$r['id'], 'unitId' => (string)$r['unitId'], 'unitTitle' => (string)$b['unit']['title'],
                              'memberId' => (string)$r['memberId'], 'memberName' => (string)$byId[(string)$r['memberId']]['fullName'],
                              'submittedAt' => (string)$r['updatedAt'], 'checks' => $open];
            }
        }
    }
    /* Where the term is: the week the Club is on (from the term's start date,
       Control Room → Curriculum → Schedule), each lesson's due date, and who
       is past it without having done it — all from the rows already read. */
    $cfg = curriculum_schedule(); $today = gmdate('Y-m-d');
    $weekNow = (string)$cfg['startDate'] !== '' && $today >= (string)$cfg['startDate'] ? intdiv((int)((strtotime($today . ' UTC') - strtotime($cfg['startDate'] . ' UTC')) / 86400), 7) + 1 : null;
    $out = [];
    foreach ($units as $id => $b) {
        $audience = 0; $behind = [];
        $due = curriculum_due_date((string)$cfg['startDate'], (int)$b['unit']['week']);
        foreach ($members as $mm) {
            $uc = (string)$b['unit']['course'];
            if ($uc !== '' && !array_intersect([mb_strtolower($uc), mb_strtolower(curriculum_course_parent($uc))], $coursesOf((string)$mm['memberId'], $mm))) continue;
            $audience++;
            if ($due !== '' && $today > $due && $b['checks'] && empty($doneBy[$id][(string)$mm['memberId']])) {
                // A member who joined after it fell due is not behind on it.
                $start = curriculum_member_start($mm, $cfg);
                if ($start !== '' && curriculum_due_date($start, (int)$b['unit']['week']) < $today) $behind[] = (string)$mm['fullName'];
            }
        }
        $done = $stats[$id]['completed'] ?? 0;
        $out[] = curriculum_unit_public($b['unit'], $b['materials'], $b['checks'], true)
            + ['family' => curriculum_course_parent((string)$b['unit']['course']),
               'stats' => ['audience' => $audience, 'started' => $stats[$id]['started'] ?? 0, 'completed' => $done,
                           'avgScore' => $done ? (int)round(($stats[$id]['scoreSum'] ?? 0) / $done) : null, 'behind' => count($behind), 'behindNames' => array_slice($behind, 0, 12)],
               'due' => $due];
    }
    return ['ok' => true, 'units' => $out, 'pending' => $pending, 'members' => count($members), 'role' => (string)$g['role'],
            'weekNow' => $weekNow, 'termStart' => (string)$cfg['startDate'], 'termWeeks' => CURR_TERM_WEEKS,
            'clearance' => (string)($g['clearance'] ?? 'cleared'),
            'submissions' => curriculum_submissions_by((string)$g['member']['memberId']),
            /* The courses this person may file a lesson under, so their own
               editor offers those and nothing else. null means every course,
               which the screen reads as "use the catalogue". */
            'courses' => $g['courses'] === null ? null : array_values(array_map('strval', $g['courses'])),
            /* The standard an instructor's own questions are held to, same
               map the AI drafter reads. */
            'examRefs' => (static function () {
                $out = [];
                foreach (curriculum_courses() as $c) {
                    $r = curriculum_exam_reference((string)$c);
                    if ($r) $out[(string)$c] = ['body' => $r['body'], 'award' => $r['award'], 'assesses' => $r['assesses'], 'ask' => $r['ask'], 'link' => $r['link']];
                }
                return $out;
            })(),
            'selfApprove' => in_array('curriculum', member_effective_caps($g['member']), true)];
}

/** The catalogue course a lesson's course belongs to: "Piano" → Musical Instruments; a catalogue course is its own. */
function curriculum_course_parent(string $course): string {
    $c = trim($course); if ($c === '') return '';
    // The catalogue first ("Coding" is its own), then the word's one course
    // ("Piano" → Musical Instruments), even when lessons already exist as "Piano".
    foreach (club_courses() as $k) if (mb_strtolower($k) === mb_strtolower($c)) return $k;
    $syn = MEMBER_COURSE_WORDS[mb_strtolower($c)] ?? null;
    if ($syn !== null) foreach (club_courses() as $k) if (mb_strtolower($k) === mb_strtolower($syn)) return $k;
    return curriculum_course_canonical($c) ?: $c;
}

/**
 * A course and every course name whose lessons it should teach from.
 *
 * Two different relationships, kept apart on purpose:
 *   · A STRAND of a broad course (COURSE_STRANDS) is a real part of the
 *     subject, so a broad course always teaches across its strands — even
 *     when it has lessons of its own.
 *   · A name nobody catalogued ("Drone Flying") is a FALLBACK: it is taught
 *     only while the course has nothing written, and is dropped the moment it
 *     does, so a half-matched name can never dilute a real curriculum.
 */
function curriculum_course_family(string $course): array {
    $strands = course_strands($course);
    if ($strands) return array_merge([$course], $strands);
    if (db_row("SELECT unitId FROM curriculum_units WHERE lower(course) = lower(?) AND status = 'published' LIMIT 1", [$course])) return [$course];
    $out = [$course];
    foreach (MEMBER_COURSE_WORDS as $w => $parent) if (mb_strtolower($parent) === mb_strtolower($course)) $out[] = $w;
    foreach (db_all("SELECT DISTINCT course FROM curriculum_units WHERE course <> ''") as $r)
        if (mb_strtolower(curriculum_course_parent((string)$r['course'])) === mb_strtolower($course)) $out[] = (string)$r['course'];
    return array_values(array_unique($out));
}

/**
 * staff.curriculum.lesson — an instructor writes a lesson for one of THEIR
 * courses, from the portal. It is a draft for a curriculum lead to publish,
 * unless the instructor holds `curriculum` themselves. Week and position:
 * the week asked for, at the next free position in it.
 */
/**
 * An instructor writes — or edits — a lesson for a course they teach.
 *
 * This used to take four fields: course, week, title, body. The Control Room
 * had objectives, an opening review, materials, placement and the whole
 * lesson editor; an instructor had a box. So the people who actually teach
 * the thing could file a draft and nothing more, and every lesson that
 * needed a review question or a worksheet had to be finished by somebody
 * else in a different portal.
 *
 * It now takes the same lesson the Control Room does, through the same
 * editor, and the difference between the two is where it SHOULD be — in what
 * each person is allowed to do, not in what each person is shown:
 *
 *   · only their own courses, on the way in and on the way out;
 *   · without the `curriculum` capability it saves as a draft, every time,
 *     and a curriculum lead publishes it;
 *   · and an instructor without that capability may only edit a draft THEY
 *     wrote. A published lesson is in children's hands this Saturday, and
 *     editing it is a curriculum lead's act, not a correction.
 */
function staff_curriculum_lesson(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $me = (string)$g['member']['memberId'];
    $own = in_array('curriculum', member_effective_caps($g['member']), true);
    $mine = static function (string $course) use ($g): bool {
        return $g['courses'] === null
            || in_array(mb_strtolower($course), array_map('mb_strtolower', $g['courses']), true);
    };

    $course = curriculum_course_canonical((string)($p['course'] ?? ''));
    if (!$course) return ['ok' => false, 'error' => 'unknown_course'];
    if (!$mine($course)) return ['ok' => false, 'error' => 'not_your_course'];

    $id = trim((string)($p['unitId'] ?? ''));
    $existing = $id !== '' ? db_row('SELECT * FROM curriculum_units WHERE unitId = ?', [$id]) : null;
    if ($id !== '' && !$existing) return ['ok' => false, 'error' => 'not_found'];
    if ($existing) {
        // Reached on the way IN, against the lesson as it is stored — never
        // against the course the request claims it is in.
        if (!$mine((string)$existing['course']) && (string)$existing['course'] !== '') return ['ok' => false, 'error' => 'not_your_course'];
        if (!$own) {
            if ((string)$existing['status'] !== 'draft') return ['ok' => false, 'error' => 'already_published',
                'message' => 'That lesson is published and children are working from it. A curriculum lead can change it.'];
            if ((string)$existing['createdBy'] !== $me) return ['ok' => false, 'error' => 'not_your_lesson',
                'message' => 'That draft is somebody else\'s. You can write your own lesson for this week.'];
        }
    }

    $week = max(1, min(104, (int)($p['week'] ?? 1)));
    $level = $existing ? (string)$existing['level'] : curriculum_clean_text($p['level'] ?? '', 60);
    /* WHERE IN THE WEEK IS THE SERVER'S, NOT THE REQUEST'S.
       Honouring a position from here looked harmless and was not: an
       instructor's editor opens a brand new lesson with position 1 because
       that is the sensible default for a field, not because anybody chose
       it — so every first lesson an instructor wrote collided with whatever
       already sat at position 1 and came back "slot taken" for a slot they
       had never picked. Placing a lesson inside a week is a curriculum
       lead's act, through the Control Room's own op. */
    $pos = $existing ? (int)$existing['position']
         : 1 + (int)(db_row('SELECT MAX(position) m FROM curriculum_units WHERE course = ? AND level = ? AND week = ?', [$course, $level, $week])['m'] ?? 0);

    /* Publishing is the capability, not the screen. Without it the status is
       'draft' whatever the request says — including on an edit, so a draft
       cannot be walked into publication from here. */
    $status = $own ? (string)($p['status'] ?? 'published') : 'draft';
    if (!in_array($status, CURR_STATUSES, true)) $status = $own ? 'published' : 'draft';

    $v = curriculum_validate([
        'course' => $course, 'level' => $level, 'week' => $week, 'position' => $pos,
        'title' => (string)($p['title'] ?? ''), 'summary' => (string)($p['summary'] ?? ''), 'body' => (string)($p['body'] ?? ''),
        'objectives' => $p['objectives'] ?? [], 'materials' => $p['materials'] ?? [], 'checks' => $p['checks'] ?? [],
        'durationMins' => $p['durationMins'] ?? 0, 'passMark' => $p['passMark'] ?? 60, 'status' => $status,
    ]);
    if (!$v['ok']) return $v;

    $u = $v['unit'];
    $clash = db_row('SELECT unitId FROM curriculum_units WHERE course = ? AND level = ? AND week = ? AND position = ? LIMIT 1',
                    [$u['course'], $u['level'], $u['week'], $u['position']]);
    if ($clash && (!$existing || (string)$clash['unitId'] !== $id)) {
        return ['ok' => false, 'error' => 'slot_taken',
                'detail' => 'another lesson is already week ' . $u['week'] . ', position ' . $u['position'] . ' of this course',
                'unitId' => (string)$clash['unitId']];
    }

    $unitId = curriculum_write($v, $existing, $me, 'instructor');
    audit('curriculum.' . ($existing ? 'update' : 'create'), $me, $unitId,
          ['course' => $course, 'week' => $week, 'by' => 'instructor', 'status' => $u['status']], (string)($p['ip'] ?? ''));

    $full = curriculum_load('unitId = ?', [$unitId]);
    $row = $full ? reset($full) : null;
    return ['ok' => true, 'unitId' => $unitId, 'status' => $u['status'], 'week' => $week, 'position' => $u['position'],
            'unit' => $row ? ($row['unit'] + ['checks' => $row['checks'], 'materials' => $row['materials']]) : null];
}

/** One member's curriculum, for the mentor or instructor whose member it is. */
function staff_curriculum_member(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ($g['centres'] !== null && !in_array((string)$m['centre'], $g['centres'], true)) return ['ok' => false, 'error' => 'out_of_scope'];
    // An instructor reaches a member who takes ANY of their courses.
    if ($g['courses'] !== null && !array_intersect(array_map('mb_strtolower', member_courses_of($m) ?: [(string)$m['track']]), array_map('mb_strtolower', $g['courses']))) return ['ok' => false, 'error' => 'out_of_scope'];
    return ['ok' => true, 'member' => ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'track' => (string)$m['track']]] + curriculum_for_member($m);
}

/** Mark the written answers waiting on one attempt. */
function staff_curriculum_mark(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $pr = db_row('SELECT * FROM curriculum_progress WHERE id = ?', [(int)($p['progressId'] ?? 0)]);
    if (!$pr) return ['ok' => false, 'error' => 'not_found'];
    $m = curriculum_member_row((string)$pr['memberId']);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ($g['centres'] !== null && !in_array((string)$m['centre'], $g['centres'], true)) return ['ok' => false, 'error' => 'out_of_scope'];
    $b = curriculum_load('unitId = ?', [(string)$pr['unitId']]);
    if (!$b) return ['ok' => false, 'error' => 'not_found'];
    $b = reset($b);
    if ($g['courses'] !== null && (string)$b['unit']['course'] !== '' && !in_array(mb_strtolower((string)$b['unit']['course']), array_map('mb_strtolower', $g['courses']), true)) return ['ok' => false, 'error' => 'out_of_scope'];
    $marks = json_decode((string)$pr['marks'], true) ?: [];
    $in = is_array($p['marks'] ?? null) ? $p['marks'] : [];
    $byId = []; foreach ($b['checks'] as $c) $byId[(string)$c['checkId']] = $c;
    foreach ($in as $cid => $mk) {
        if (!isset($byId[$cid]) || !is_array($mk) || !isset($mk['points'])) continue;
        $marks[$cid] = ['points' => max(0, min((int)$byId[$cid]['points'], (int)$mk['points'])),
                        'feedback' => curriculum_clean_text($mk['feedback'] ?? '', 600), 'by' => (string)$g['member']['memberId']];
    }
    $t = curriculum_progress_total($b['checks'], $marks, (int)$b['unit']['passMark']);
    $completedBefore = (string)$pr['status'] === 'completed';
    $row = ['marks' => json_encode($marks, JSON_UNESCAPED_UNICODE), 'score' => $t['score'], 'maxScore' => $t['max'],
            'pending' => $t['pending'] > 0 ? 1 : 0, 'markedBy' => (string)$g['member']['memberId'], 'updatedAt' => now_iso(),
            'bestPct' => max((int)$pr['bestPct'], $t['pending'] === 0 ? $t['pct'] : 0),
            'status' => $t['passed'] || $completedBefore ? 'completed' : ($t['pending'] > 0 ? 'submitted' : 'attempted')];
    if ($t['passed'] && !$completedBefore) $row['completedAt'] = now_iso();
    db_update('curriculum_progress', $row, ['id' => $pr['id']]);
    audit('curriculum.mark', (string)$g['member']['memberId'], (string)$pr['memberId'], ['unitId' => (string)$pr['unitId'], 'pct' => $t['pct']], (string)($p['ip'] ?? ''));
    /* The child is told when the last written answer is marked: the score,
       and the instructor's words if there are any. A mark nobody hears about
       is feedback that never reached the learner. Once per lesson marked. */
    if ($t['pending'] === 0 && (int)$pr['pending'] > 0 && function_exists('push_notification')) {
        $fb = [];
        foreach ($in as $cid => $mk) if (isset($byId[$cid]) && trim((string)($mk['feedback'] ?? '')) !== '') $fb[] = curriculum_clean_text($mk['feedback'], 300);
        $who = trim((string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? '')) ?: 'Your instructor';
        try {
            push_notification((string)$pr['memberId'], ['kind' => 'curriculum', 'title' => mb_substr($who . ' marked “' . (string)$b['unit']['title'] . '”: ' . $t['pct'] . '%', 0, 160),
                'body' => mb_substr($fb ? implode(' ', $fb) : ($t['passed'] ? 'Well done — that lesson is complete.' : 'Have a look at what to work on, and try it again.'), 0, 400), 'linkPage' => 'dashboard']);
        } catch (\Throwable $e) { error_log('[curriculum.mark.notify] ' . $e->getMessage()); }
    }
    return ['ok' => true, 'pct' => $t['pct'], 'pending' => $t['pending'], 'status' => $row['status']];
}

/* ══ Materials stored on this server ══════════════════════════════════════════
 *
 * Cloudinary is optional on this platform, and without it the only store was
 * for images — so a PDF, a slide deck or a worksheet had nowhere to go and the
 * curriculum could hold links and nothing else. This is that store: documents
 * only, named by their own SHA-256 (so the same file uploaded twice is stored
 * once, and a name reveals nothing), in a directory the web server refuses to
 * serve directly. They are read back through api/member/curriculum-file.php,
 * which wants a signed-in session.
 *
 * The type is decided from the file's BYTES, never from what the browser said
 * or the name it carried: a `.pdf` that is really a script is refused.
 */
const CURR_FILE_MAX_BYTES = 25 * 1024 * 1024;
const CURR_FILE_TYPES = [
    'pdf'  => ['application/pdf'],
    'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
    'pptx' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
    'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
    'doc'  => ['application/msword', 'application/x-ole-storage', 'application/CDFV2'],
    'ppt'  => ['application/vnd.ms-powerpoint', 'application/x-ole-storage', 'application/CDFV2'],
    'xls'  => ['application/vnd.ms-excel', 'application/x-ole-storage', 'application/CDFV2'],
    'odt'  => ['application/vnd.oasis.opendocument.text'],
    'odp'  => ['application/vnd.oasis.opendocument.presentation'],
    'txt'  => ['text/plain'],
    'csv'  => ['text/plain', 'text/csv'],
    'png'  => ['image/png'], 'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'webp' => ['image/webp'],
    'mp3'  => ['audio/mpeg'], 'm4a' => ['audio/mp4', 'audio/x-m4a'], 'mp4' => ['video/mp4'],
    // The wider range instructors teach from: spreadsheets and rich text,
    // e-books, project packs, Scratch projects and code, more audio and video.
    'ods'  => ['application/vnd.oasis.opendocument.spreadsheet'],
    'rtf'  => ['text/rtf', 'application/rtf'],
    'md'   => ['text/plain', 'text/markdown', 'text/x-markdown'],
    'epub' => ['application/epub+zip'],
    'zip'  => ['application/zip', 'application/x-zip-compressed'],
    'sb3'  => ['application/zip'],
    'py'   => ['text/x-python', 'text/x-script.python', 'text/plain'],
    'ino'  => ['text/x-c', 'text/x-c++', 'text/plain'],
    'gif'  => ['image/gif'],
    'wav'  => ['audio/x-wav', 'audio/wav', 'audio/vnd.wave'],
    'ogg'  => ['audio/ogg', 'video/ogg', 'application/ogg'],
    'webm' => ['video/webm', 'audio/webm'],
    'mov'  => ['video/quicktime'],
];

function curriculum_file_dir(): string {
    $base = (string)(($GLOBALS['CONFIG'] ?? [])['db']['sqlite_path'] ?? '');
    $dir = ($base !== '' ? dirname($base) : (__DIR__ . '/../../storage')) . '/curriculum';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $ht = $dir . '/.htaccess';
    if (is_dir($dir) && !is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\nOptions -Indexes\n");
    }
    return $dir;
}

/**
 * Store one uploaded file. `$p` carries the PHP upload: tmp (path), name, size.
 * @return array{ok:bool,url?:string,kind?:string,bytes?:int,name?:string,error?:string}
 */
function admin_curriculum_file_put(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    return curriculum_file_store($p, (string)$g['requester']['memberId']);
}

/** Store one uploaded file for whoever the caller's gate already admitted. */
function curriculum_file_store(array $p, string $by): array {
    $tmp = (string)($p['tmp'] ?? '');
    $name = basename((string)($p['name'] ?? ''));
    if ($tmp === '' || !is_file($tmp)) return ['ok' => false, 'error' => 'no_file'];
    $size = (int)filesize($tmp);
    if ($size <= 0) return ['ok' => false, 'error' => 'empty_file'];
    if ($size > CURR_FILE_MAX_BYTES) return ['ok' => false, 'error' => 'too_large', 'max' => CURR_FILE_MAX_BYTES];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!isset(CURR_FILE_TYPES[$ext])) return ['ok' => false, 'error' => 'bad_type', 'detail' => 'allowed: ' . implode(', ', array_keys(CURR_FILE_TYPES))];
    $mime = function_exists('finfo_open') ? (string)finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp) : '';
    if ($mime !== '' && !in_array($mime, CURR_FILE_TYPES[$ext], true)) {
        return ['ok' => false, 'error' => 'type_mismatch', 'detail' => 'the file is not a real .' . $ext];
    }
    $hash = hash_file('sha256', $tmp);
    $file = substr($hash, 0, 40) . '.' . $ext;
    $dest = curriculum_file_dir() . '/' . $file;
    if (!is_file($dest)) {
        $ok = is_uploaded_file($tmp) ? @move_uploaded_file($tmp, $dest) : @copy($tmp, $dest);
        if (!$ok) return ['ok' => false, 'error' => 'store_failed'];
        @chmod($dest, 0644);
    }
    audit('curriculum.file', $by, $file, ['name' => $name, 'bytes' => $size], (string)($p['ip'] ?? ''));
    $url = '/api/member/curriculum-file.php?f=' . $file;
    return ['ok' => true, 'url' => $url, 'kind' => curriculum_material_kind('', 'x.' . $ext), 'bytes' => $size, 'name' => $name];
}

/** The path of a stored file for a valid name, or '' — a bad name and a
 *  missing file look the same to the caller. */
function curriculum_file_path(string $f): string {
    if (!preg_match('/^([a-f0-9]{16,64})\.([a-z0-9]{2,5})$/', $f, $m) || !isset(CURR_FILE_TYPES[$m[2]])) return '';
    $path = curriculum_file_dir() . '/' . $f;
    return is_file($path) ? $path : '';
}

/* ══ Due dates, reminders, and the fine for a lesson left undone ══════════════
 *
 * A lesson in week N is due N weeks into the member's own term: the term
 * starts on `curriculum.startDate`, or on the day they joined if that is
 * later — a member who joins in week 6 does not owe weeks 1–5 on day one.
 * Only lessons with checks are assessments, so only those fall due.
 *
 * A lesson is OUTSTANDING until it is completed or its answers are waiting on
 * a marker (the second is ours to finish, not theirs). An outstanding lesson
 * is reminded about from `remindBeforeDays` before it is due, every
 * `remindEveryDays`, in one mail listing everything outstanding; once it has
 * been overdue for `fineAfterDays` (a week) the member is fined, once per
 * lesson, on their ledger.
 *
 * The fine amount is money, so changing it needs the `fees` permission as
 * well as `curriculum`: what a lesson costs to skip is not the curriculum
 * editor's decision alone.
 */
const CURR_SCHEDULE_DEFAULTS = ['enabled' => true, 'startDate' => '', 'remindBeforeDays' => 2, 'remindEveryDays' => 2,
                                'fineAfterDays' => 7, 'fineAmount' => 1000,
                                /* Whether a session opens with the previous
                                   session's questions. On by default — it is
                                   the programme's position — but a centre
                                   running a short holiday course, or a term
                                   where the rota has nobody to mark, can turn
                                   it off rather than leave children staring
                                   at a review nobody will ever mark. The
                                   questions stay on the lesson either way. */
                                'reviewAtStart' => true,
                                /* WHERE A MEMBER'S COURSES COME FROM.
                                   'member'   — the courses chosen for each
                                                member (the default).
                                   'division' — the division is the enrolment:
                                                everyone takes their division's
                                                own shared curriculum and
                                                nothing from the strands.
                                   curriculum_member_courses() is the whole
                                   behaviour; this names which half runs. */
                                'courseSource' => 'member'];
const CURR_COURSE_SOURCES = ['member', 'division'];
const CURR_DUE_BATCH = 60;

function curriculum_schedule(): array {
    $c = setting_get('curriculum');
    $c = (is_array($c) ? $c : []) + CURR_SCHEDULE_DEFAULTS;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$c['startDate'])) $c['startDate'] = '';
    if (!in_array((string)$c['courseSource'], CURR_COURSE_SOURCES, true)) $c['courseSource'] = 'member';
    return $c;
}

/** The first day of this member's term, or '' when no term is set. */
function curriculum_member_start(array $m, ?array $cfg = null): string {
    $cfg = $cfg ?? curriculum_schedule();
    $start = (string)$cfg['startDate'];
    if ($start === '') return '';
    $join = substr((string)(($m['joinDate'] ?? '') ?: ($m['createdAt'] ?? '')), 0, 10);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $join) && $join > $start ? $join : $start;
}

/** When a lesson of week `$week` falls due for a member whose term began `$start`. */
function curriculum_due_date(string $start, int $week): string {
    return $start === '' ? '' : gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC') + max(1, $week) * 7 * 86400);
}

/** Facts about one lesson's deadline for one member: dueDate, overdueDays, fined. */
function curriculum_due_facts(string $start, array $unit, int $checks, ?array $pr, string $today, ?array $cfg = null): array {
    $cfg = $cfg ?? curriculum_schedule();
    if (empty($cfg['enabled']) || $start === '' || $checks === 0) return ['dueDate' => '', 'overdueDays' => 0, 'outstanding' => false];
    $due = curriculum_due_date($start, (int)$unit['week']);
    $status = (string)($pr['status'] ?? '');
    $outstanding = !in_array($status, ['completed', 'submitted'], true);
    $over = $outstanding && $today > $due ? (int)round((strtotime($today . ' UTC') - strtotime($due . ' UTC')) / 86400) : 0;
    return ['dueDate' => $due, 'overdueDays' => $over, 'outstanding' => $outstanding];
}

/**
 * The reminder and fine sweep. Idempotent and bounded: a fine is keyed on the
 * lesson (one per lesson, ever), a reminder on the member and the reminder
 * period, so firing every fifteen minutes costs nothing.
 */
function curriculum_due_run(?string $today = null, int $limit = CURR_DUE_BATCH): array {
    $cfg = curriculum_schedule();
    $out = ['reminded' => 0, 'fined' => 0, 'members' => 0];
    if (empty($cfg['enabled']) || $cfg['startDate'] === '') return $out + ['skipped' => 'no_term'];
    $today = $today ?? attendance_today();
    $units = db_all("SELECT u.unitId, u.course, u.level, u.week, u.title, (SELECT COUNT(*) FROM curriculum_checks c WHERE c.unitId = u.unitId) checks
                     FROM curriculum_units u WHERE u.status = 'published'");
    $units = array_values(array_filter($units, static fn($u) => (int)$u['checks'] > 0));
    if (!$units) return $out + ['skipped' => 'no_assessments'];
    $byCourse = [];
    foreach ($units as $u) $byCourse[mb_strtolower((string)$u['course'])][] = $u;
    $members = db_all("SELECT memberId, fullName, email, parentEmail, track, courses, disciplines, division, cohort, displayId, centre, joinDate, createdAt, type FROM members
                       WHERE COALESCE(type,'NGG') <> 'Summer' AND status = 'active'");
    $prog = [];
    foreach (db_all("SELECT memberId, unitId, status FROM curriculum_progress") as $r) $prog[(string)$r['memberId']][(string)$r['unitId']] = $r;
    $placed = [];
    foreach (db_all('SELECT memberId, stateValue FROM member_state WHERE stateKey = ?', [CURR_YEAR_KEY]) as $r) $placed[(string)$r['memberId']] = (int)$r['stateValue'];
    $ctx = curriculum_course_ctx();
    $every = max(1, (int)$cfg['remindEveryDays']);
    $period = intdiv((int)(strtotime($today . ' UTC') / 86400), $every);
    $fineAfter = max(1, (int)$cfg['fineAfterDays']);
    $amount = max(0, (int)$cfg['fineAmount']);
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');

    foreach ($members as $m) {
        if ($out['reminded'] >= $limit) break;
        $start = curriculum_member_start($m, $cfg);
        if ($start === '' || $start > $today) continue;
        // The same courses and the same year the member's own page shows — not a bare track match.
        $mine = $byCourse[''] ?? [];
        foreach (curriculum_member_courses($m, $ctx) as $c) $mine = array_merge($mine, $byCourse[mb_strtolower($c)] ?? []);
        $mine = array_values(array_column($mine, null, 'unitId'));
        $py = curriculum_member_year($m, $placed[(string)$m['memberId']] ?? 0)['year'];
        $stages = curriculum_adapt($mine, $py, $prog[(string)$m['memberId']] ?? []);
        $mine = array_values(array_filter($mine, fn($u) => isset($stages[(string)$u['unitId']]) && curriculum_stage_due($stages[(string)$u['unitId']], curriculum_level_year((string)$u['level']), $py)));
        $due = []; $finedNow = [];
        foreach ($mine as $u) {
            $f = curriculum_due_facts($start, $u, (int)$u['checks'], $prog[(string)$m['memberId']][(string)$u['unitId']] ?? null, $today, $cfg);
            if (!$f['outstanding']) continue;
            $daysLeft = (int)round((strtotime($f['dueDate'] . ' UTC') - strtotime($today . ' UTC')) / 86400);
            if ($daysLeft > (int)$cfg['remindBeforeDays']) continue;
            if ($f['overdueDays'] > $fineAfter && $amount > 0 && function_exists('fees_post')) {
                $key = 'curr-overdue:' . $u['unitId'];
                $had = db_row("SELECT id FROM member_ledger WHERE memberId = ? AND kind = 'fine' AND periodKey = ? LIMIT 1", [(string)$m['memberId'], $key]);
                if (!$had && fees_post((string)$m['memberId'], 'fine', $amount, ['periodKey' => $key, 'method' => 'curriculum', 'by' => 'curriculum',
                        'note' => 'Assessment overdue more than ' . $fineAfter . ' days — ' . mb_substr((string)$u['title'], 0, 120)])) {
                    $finedNow[] = $u['title']; $out['fined']++;
                }
            }
            $due[] = $u + $f + ['daysLeft' => $daysLeft];
        }
        if (!$due) continue;
        $out['members']++;
        // One reminder per member per reminder period.
        $mkey = 'curriculum-due:' . $period;
        if (db_row('SELECT id FROM nudge_log WHERE messageKey = ? AND recipient = ? LIMIT 1', [$mkey, (string)$m['memberId']])) continue;
        $to = [];
        foreach ([(string)$m['email'], (string)($m['parentEmail'] ?? '')] as $e) {
            $e = strtolower(trim($e));
            if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL) && !in_array($e, $to, true)) $to[] = $e;
        }
        if (!$to) continue;
        usort($due, static fn($a, $b) => strcmp($a['dueDate'], $b['dueDate']));
        $rows = '';
        foreach ($due as $d) {
            $when = $d['overdueDays'] > 0 ? '<b style="color:#b42318">' . $d['overdueDays'] . ' day' . ($d['overdueDays'] === 1 ? '' : 's') . ' overdue</b>'
                  : ($d['daysLeft'] === 0 ? '<b>due today</b>' : 'due in ' . $d['daysLeft'] . ' day' . ($d['daysLeft'] === 1 ? '' : 's'));
            $rows .= '<li style="margin:0 0 6px">' . esc_html((string)$d['title']) . ' — ' . $when . '</li>';
        }
        $first = esc_html(explode(' ', trim((string)$m['fullName']))[0] ?: 'there');
        $over = count(array_filter($due, static fn($d) => $d['overdueDays'] > 0));
        $subject = $over ? "{$first}, {$over} assessment" . ($over === 1 ? ' is' : 's are') . ' overdue' : "{$first}, an assessment is due soon";
        $body = '<ul style="margin:0 0 12px;padding-left:18px">' . $rows . '</ul>'
              . ($amount > 0 ? '<p style="margin:0 0 10px">An assessment left undone for more than ' . $fineAfter . ' days after it is due is fined ₦' . number_format($amount) . ', on your account.</p>' : '')
              . ($finedNow ? '<p style="margin:0 0 10px"><b>Fined today:</b> ' . esc_html(implode(', ', $finedNow)) . '.</p>' : '');
        $html = email_template(['title' => 'Assessments due', 'eyebrow' => 'NGG Club · Curriculum',
            'intro' => 'Here is what is waiting for you in your curriculum.', 'bodyHtml' => $body,
            'ctaLabel' => 'Open my lessons →', 'ctaUrl' => $origin . '/dashboard/learning',
            'footNote' => 'Sent to an NGG member and the parent on their record while assessments are outstanding.']);
        foreach ($to as $addr) @send_mail($addr, $subject, $html);
        try { db_insert('nudge_log', ['messageKey' => $mkey, 'recipient' => (string)$m['memberId'], 'channel' => 'email', 'sentAt' => now_iso()]); } catch (\Throwable $e) {}
        $out['reminded']++;
    }
    if ($out['fined']) audit('curriculum.overdue_fines', 'system', '', ['fined' => $out['fined'], 'date' => $today]);
    return $out;
}

/** admin.curriculum.schedule — read, and with `data`, save. */
function admin_curriculum_schedule(array $p): array {
    if (!isset($p['data'])) {
        $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
        return ['ok' => true, 'schedule' => curriculum_schedule()];
    }
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $in = is_array($p['data']) ? $p['data'] : [];
    $cur = curriculum_schedule();
    $start = trim((string)($in['startDate'] ?? $cur['startDate']));
    if ($start !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) return ['ok' => false, 'error' => 'bad_date'];
    $next = [
        'enabled' => array_key_exists('enabled', $in) ? !empty($in['enabled']) : !empty($cur['enabled']),
        'reviewAtStart' => array_key_exists('reviewAtStart', $in) ? !empty($in['reviewAtStart']) : !empty($cur['reviewAtStart']),
        'courseSource' => in_array((string)($in['courseSource'] ?? ''), CURR_COURSE_SOURCES, true)
            ? (string)$in['courseSource'] : (string)$cur['courseSource'],
        'startDate' => $start,
        'remindBeforeDays' => max(0, min(30, (int)($in['remindBeforeDays'] ?? $cur['remindBeforeDays']))),
        'remindEveryDays' => max(1, min(30, (int)($in['remindEveryDays'] ?? $cur['remindEveryDays']))),
        'fineAfterDays' => max(1, min(60, (int)($in['fineAfterDays'] ?? $cur['fineAfterDays']))),
        'fineAmount' => max(0, min(FEES_AMOUNT_MAX, (int)($in['fineAmount'] ?? $cur['fineAmount']))),
    ];
    // What skipping a lesson costs is a money decision: it needs `fees` too.
    if (($next['fineAmount'] !== (int)$cur['fineAmount'] || $next['fineAfterDays'] !== (int)$cur['fineAfterDays'])
        && !in_array('fees', member_effective_caps($g['requester']), true)) {
        return ['ok' => false, 'error' => 'fees_cap_required'];
    }
    setting_set('curriculum', $next, (string)$g['requester']['memberId']);
    audit('curriculum.schedule', (string)$g['requester']['memberId'], '', $next, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'schedule' => $next];
}

/**
 * Who is behind: members with overdue assessments, most overdue first, with
 * what they have been fined for it. Three queries whatever the roster size —
 * units, progress, fines — never one per member.
 */
function curriculum_overdue_board(string $mWhere, array $mArgs, string $course = '', int $limit = 100): array {
    $cfg = curriculum_schedule();
    if (empty($cfg['enabled']) || $cfg['startDate'] === '') return [];
    $today = attendance_today();
    $units = db_all("SELECT u.unitId, u.course, u.week, u.title FROM curriculum_units u
                     WHERE u.status = 'published' AND EXISTS (SELECT 1 FROM curriculum_checks c WHERE c.unitId = u.unitId)");
    if (!$units) return [];
    $byCourse = [];
    foreach ($units as $u) $byCourse[mb_strtolower((string)$u['course'])][] = $u;
    [$cSql, $cArgs] = $course !== '' ? member_course_sql($course, 'm.') : ['', []];
    $members = db_all("SELECT m.memberId, m.fullName, m.displayId, m.centre, m.track, m.courses, m.joinDate, m.createdAt FROM members m WHERE $mWhere"
                      . ($cSql !== '' ? ' AND ' . $cSql : ''), array_merge($mArgs, $cArgs));
    $prog = [];
    foreach (db_all("SELECT memberId, unitId, status FROM curriculum_progress") as $r) $prog[(string)$r['memberId']][(string)$r['unitId']] = $r;
    $fined = [];
    foreach (db_all("SELECT memberId, COUNT(*) n, SUM(amount) amt FROM member_ledger WHERE kind = 'fine' AND periodKey LIKE 'curr-overdue:%' AND COALESCE(voidedAt,'') = '' GROUP BY memberId") as $r)
        $fined[(string)$r['memberId']] = ['n' => (int)$r['n'], 'amount' => (int)$r['amt']];
    $out = [];
    foreach ($members as $m) {
        $start = curriculum_member_start($m, $cfg);
        if ($start === '') continue;
        // The same courses and the same year the member's own page shows — not a bare track match.
        $mine = $byCourse[''] ?? [];
        foreach (curriculum_member_courses($m, $ctx) as $c) $mine = array_merge($mine, $byCourse[mb_strtolower($c)] ?? []);
        $mine = array_values(array_column($mine, null, 'unitId'));
        $py = curriculum_member_year($m, $placed[(string)$m['memberId']] ?? 0)['year'];
        $stages = curriculum_adapt($mine, $py, $prog[(string)$m['memberId']] ?? []);
        $mine = array_values(array_filter($mine, fn($u) => isset($stages[(string)$u['unitId']]) && curriculum_stage_due($stages[(string)$u['unitId']], curriculum_level_year((string)$u['level']), $py)));
        $n = 0; $worst = 0; $titles = [];
        foreach ($mine as $u) {
            $f = curriculum_due_facts($start, $u, 1, $prog[(string)$m['memberId']][(string)$u['unitId']] ?? null, $today, $cfg);
            if ($f['overdueDays'] > 0) { $n++; $worst = max($worst, $f['overdueDays']); $titles[] = (string)$u['title']; }
        }
        if (!$n) continue;
        $out[] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                  'centre' => (string)$m['centre'], 'track' => (string)$m['track'], 'overdue' => $n, 'worstDays' => $worst,
                  'lessons' => array_slice($titles, 0, 5), 'fines' => $fined[(string)$m['memberId']]['n'] ?? 0,
                  'finedAmount' => $fined[(string)$m['memberId']]['amount'] ?? 0];
    }
    usort($out, static fn($a, $b) => [$b['worstDays'], $b['overdue']] <=> [$a['worstDays'], $a['overdue']]);
    return array_slice($out, 0, $limit);
}

/* ══ Materials instructors submit, and their approval ══════════════════════════
 *
 * An NGG instructor or mentor adds a material — a link, or a file in any of
 * the store's types — to a lesson in one of THEIR courses. It is pending: not
 * part of the lesson, not seen by members, not in the editor's list, until
 * somebody holding `curriculum` approves it. A rejection carries a note back
 * to the person who sent it. A submitter who already holds `curriculum`
 * approves their own as they add it — there is nobody above them to wait for.
 */
const CURR_SUBMIT_NOTE_MAX = 500;

function curriculum_material_public(array $m, array $names = [], array $titles = []): array {
    return ['materialId' => (string)$m['materialId'], 'unitId' => (string)$m['unitId'], 'unitTitle' => (string)($titles[(string)$m['unitId']] ?? ''),
            'kind' => (string)$m['kind'], 'title' => (string)$m['title'], 'url' => (string)$m['url'], 'note' => (string)($m['note'] ?? ''),
            'status' => (string)($m['status'] ?: 'approved'), 'submittedBy' => (string)($m['submittedBy'] ?? ''),
            'submitterName' => (string)($names[(string)($m['submittedBy'] ?? '')] ?? ''), 'submittedAt' => (string)$m['createdAt'],
            'reviewedAt' => (string)($m['reviewedAt'] ?? ''), 'reviewNote' => (string)($m['reviewNote'] ?? '')];
}

/** staff.curriculum.material — an instructor submits a material to a lesson. */
function staff_curriculum_material(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $u = db_row('SELECT unitId, course, title, status FROM curriculum_units WHERE unitId = ? LIMIT 1', [(string)($p['unitId'] ?? '')]);
    if (!$u || (string)$u['status'] === 'retired') return ['ok' => false, 'error' => 'not_found'];
    // Their courses only: an instructor's reach is their courses, here as in the roster.
    if ($g['courses'] !== null && (string)$u['course'] !== '' && !in_array((string)$u['course'], $g['courses'], true)) {
        return ['ok' => false, 'error' => 'out_of_scope', 'message' => 'That lesson is not in one of your courses.'];
    }
    $url = curriculum_material_url(trim((string)($p['url'] ?? '')));
    if ($url === '') return ['ok' => false, 'error' => 'bad_material_url', 'detail' => 'a link must start with https://, or upload a file'];
    $title = curriculum_clean_text($p['title'] ?? '', 160);
    if (mb_strlen($title) < 2) return ['ok' => false, 'error' => 'title_required'];
    $by = (string)$g['member']['memberId'];
    $self = in_array('curriculum', member_effective_caps($g['member']), true);
    $id = 'MAT-' . strtoupper(rand_hex(5));
    $pos = (int)(db_row('SELECT COALESCE(MAX(position),0) p FROM curriculum_materials WHERE unitId = ?', [(string)$u['unitId']])['p'] ?? 0) + 1;
    db_insert('curriculum_materials', ['materialId' => $id, 'unitId' => (string)$u['unitId'],
        'kind' => curriculum_material_kind((string)($p['kind'] ?? ''), $url), 'title' => $title, 'url' => $url, 'position' => $pos,
        'note' => curriculum_clean_text($p['note'] ?? '', CURR_SUBMIT_NOTE_MAX), 'status' => $self ? 'approved' : 'pending',
        'submittedBy' => $by, 'createdAt' => now_iso()] + ($self ? ['reviewedBy' => $by, 'reviewedAt' => now_iso()] : []));
    audit('curriculum.material.submit', $by, $id, ['unitId' => (string)$u['unitId'], 'title' => $title, 'self' => $self], (string)($p['ip'] ?? ''));
    if (!$self) {
        // The curriculum editors are told a submission is waiting.
        notify_people(staff_with_cap('curriculum', [$by]), ['kind' => 'approval', 'title' => 'A material is waiting for approval: ' . mb_substr($title, 0, 80),
            'intro' => ((string)($g['member']['fullName'] ?? $by)) . ' added a material to “' . (string)$u['title'] . '”.',
            'body' => $title . "\n" . $url . ((string)($p['note'] ?? '') !== '' ? "\n\nTheir note: " . mb_substr((string)$p['note'], 0, 300) : '') . "\n\nApprove or send it back in Control Room → Curriculum → Submissions.",
            'linkPage' => 'admin', 'ctaPath' => '/nextadmin?s=curriculum&t=submissions', 'ctaLabel' => 'Review it →']);
    }
    $m = db_row('SELECT * FROM curriculum_materials WHERE materialId = ?', [$id]);
    return ['ok' => true, 'material' => curriculum_material_public($m, [], [(string)$u['unitId'] => (string)$u['title']]), 'approved' => $self];
}

/** staff.curriculum.file — an instructor uploads the file for a submission. */
function staff_curriculum_file_put(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    return curriculum_file_store($p, (string)$g['member']['memberId']);
}

/** What this person has submitted, newest first, with each one's verdict. */
function curriculum_submissions_by(string $memberId, int $limit = 50): array {
    $rows = db_all("SELECT * FROM curriculum_materials WHERE submittedBy = ? AND COALESCE(status,'approved') IN ('pending','rejected','approved') AND reviewedBy <> submittedBy
                    ORDER BY id DESC LIMIT " . (int)$limit, [$memberId]);
    return curriculum_materials_shaped($rows);
}

function curriculum_materials_shaped(array $rows): array {
    if (!$rows) return [];
    $uids = array_values(array_unique(array_column($rows, 'unitId')));
    $titles = array_column(db_all('SELECT unitId, title FROM curriculum_units WHERE unitId IN (' . implode(',', array_fill(0, count($uids), '?')) . ')', $uids), 'title', 'unitId');
    $mids = array_values(array_unique(array_filter(array_column($rows, 'submittedBy'))));
    $names = $mids ? array_column(db_all('SELECT memberId, fullName FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($mids), '?')) . ')', $mids), 'fullName', 'memberId') : [];
    return array_map(static fn($m) => curriculum_material_public($m, $names, $titles), $rows);
}

/** admin.curriculum.submissions — the review queue (pending first, then recent decisions). */
function admin_curriculum_submissions(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? 'pending');
    if (!in_array($status, CURR_MATERIAL_STATUSES, true)) $status = 'pending';
    $rows = db_all("SELECT * FROM curriculum_materials WHERE status = ? AND submittedBy <> '' AND COALESCE(reviewedBy,'') <> submittedBy ORDER BY id " . ($status === 'pending' ? 'ASC' : 'DESC') . ' LIMIT 300', [$status]);
    $counts = array_column(db_all("SELECT status, COUNT(*) n FROM curriculum_materials WHERE submittedBy <> '' AND COALESCE(reviewedBy,'') <> submittedBy GROUP BY status"), 'n', 'status');
    return ['ok' => true, 'materials' => curriculum_materials_shaped($rows), 'counts' => array_map('intval', $counts) + ['pending' => 0, 'approved' => 0, 'rejected' => 0]];
}

/**
 * admin.curriculum.review — approve or reject submissions, one or many.
 * Per-row verdicts; `unchanged` for one already decided that way; one audit
 * event for the run; the submitter is told either way.
 */
function admin_curriculum_review(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $decision = (string)($p['decision'] ?? '');
    if (!in_array($decision, ['approve', 'reject'], true)) return ['ok' => false, 'error' => 'bad_decision'];
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['materialIds'] ?? null) ? $p['materialIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'no_ids'];
    if (count($ids) > CURR_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CURR_BULK_MAX];
    $note = curriculum_clean_text($p['note'] ?? '', CURR_SUBMIT_NOTE_MAX);
    if ($decision === 'reject' && $note === '') return ['ok' => false, 'error' => 'note_required', 'message' => 'Say why, so the instructor can fix it.'];
    $by = (string)$g['requester']['memberId'];
    $to = $decision === 'approve' ? 'approved' : 'rejected';
    $rows = array_column(db_all('SELECT * FROM curriculum_materials WHERE materialId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids), null, 'materialId');
    $results = []; $applied = 0; $told = [];
    foreach ($ids as $id) {
        $m = $rows[$id] ?? null;
        if (!$m || (string)($m['submittedBy'] ?? '') === '') { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if ((string)$m['status'] === $to) { $results[] = ['id' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        db_update('curriculum_materials', ['status' => $to, 'reviewedBy' => $by, 'reviewedAt' => now_iso(), 'reviewNote' => $note], ['materialId' => $id]);
        $results[] = ['id' => $id, 'ok' => true];
        $applied++;
        $told[(string)$m['submittedBy']][] = $m;
    }
    foreach ($told as $who => $list) curriculum_review_notify($who, $list, $to, $note);
    audit('curriculum.material.review', $by, '', ['decision' => $decision, 'count' => count($ids), 'applied' => $applied,
        'refused' => count(array_filter($results, static fn($r) => !$r['ok']))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'results' => $results];
}

/** Tell an instructor what became of what they sent: in-app, and by mail. */
function curriculum_review_notify(string $memberId, array $list, string $to, string $note): void {
    $m = db_row('SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m) return;
    $titles = implode(', ', array_map(static fn($x) => (string)$x['title'], $list));
    $n = count($list);
    $head = $to === 'approved' ? ($n === 1 ? 'Your material was approved' : "{$n} of your materials were approved")
                               : ($n === 1 ? 'Your material needs changes' : "{$n} of your materials need changes");
    if (function_exists('push_notification')) {
        push_notification($memberId, ['kind' => 'curriculum', 'title' => $head, 'body' => mb_substr($titles . ($note !== '' ? ' — ' . $note : ''), 0, 240), 'linkPage' => 'mentor']);
    }
    $email = trim((string)$m['email']);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return;
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $body = '<p style="margin:0 0 10px">' . esc_html($titles) . '</p>'
          . ($to === 'approved' ? '<p style="margin:0 0 10px">Members studying the lesson can see it now. Thank you.</p>'
                                : '<p style="margin:0 0 10px"><b>Why:</b> ' . esc_html($note) . '</p><p style="margin:0 0 10px">Fix it and send it again from the Curriculum tab of your portal.</p>');
    @send_mail($email, $head, email_template(['title' => $head, 'eyebrow' => 'NGG Club · Curriculum', 'intro' => 'A curriculum editor has looked at what you sent.',
        'bodyHtml' => $body, 'ctaLabel' => 'Open my portal →', 'ctaUrl' => $origin . '/mentor']));
}


/**
 * Where one child is in their curriculum, lesson by lesson, for the adults
 * who teach or mentor them: done (with the score), waiting for a mark, started,
 * not started, opens later; and catch-up from a year moved past. Optionally one
 * course. One read of the lessons, one of the progress rows.
 */
function curriculum_child_state(array $m, string $course = ''): array {
    $units = function_exists('curriculum_member_units') ? curriculum_member_units($m, $placement) : [];
    if ($course !== '') $units = array_filter($units, static fn($b) => strcasecmp((string)$b['unit']['course'], $course) === 0 || (string)$b['unit']['course'] === '');
    $ids = array_keys($units);
    $prog = [];
    if ($ids) foreach (db_all('SELECT unitId, status, bestPct, attempts, pending, feedback, completedAt, updatedAt FROM curriculum_progress WHERE memberId = ? AND unitId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')',
        array_merge([(string)$m['memberId']], $ids)) as $r) $prog[(string)$r['unitId']] = $r;
    $out = [];
    foreach ($units as $id => $b) {
        $u = $b['unit']; $pr = $prog[$id] ?? null;
        $state = !$pr ? 'not_started' : ((int)$pr['pending'] > 0 ? 'to_mark' : ((string)$pr['status'] === 'completed' ? 'done' : 'started'));
        $out[] = ['unitId' => (string)$id, 'title' => (string)$u['title'], 'course' => (string)$u['course'], 'week' => (int)$u['week'], 'level' => (string)$u['level'],
            'stage' => (string)($b['stage'] ?? ''), 'state' => $state, 'pct' => $pr ? (int)$pr['bestPct'] : null, 'attempts' => $pr ? (int)$pr['attempts'] : 0,
            'feedback' => $pr ? mb_substr((string)$pr['feedback'], 0, 200) : '', 'at' => $pr ? substr((string)($pr['completedAt'] ?: $pr['updatedAt']), 0, 10) : '',
            'confirmed' => $pr ? str_starts_with((string)$pr['markedBy'], 'confirmed:') : false];
    }
    usort($out, static fn($a, $b) => [$a['week'], $a['course'], $a['title']] <=> [$b['week'], $b['course'], $b['title']]);
    $done = count(array_filter($out, static fn($x) => $x['state'] === 'done'));
    $scores = array_values(array_filter(array_column(array_filter($out, static fn($x) => $x['state'] === 'done'), 'pct'), static fn($v) => $v !== null));
    return ['lessons' => $out, 'total' => count($out), 'done' => $done, 'toMark' => count(array_filter($out, static fn($x) => $x['state'] === 'to_mark')),
        'avg' => $scores ? (int)round(array_sum($scores) / count($scores)) : null, 'year' => (int)($placement['year'] ?? 1)];
}
