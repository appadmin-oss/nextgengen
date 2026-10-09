<?php
declare(strict_types=1);

/**
 * Registration stack — the gated desk flow that turns a walk-up into a
 * verified summer student:
 *
 *   Draft (desk) → Parent pending (auto SMS/email) → Verified (parent
 *   consents) → ID/QR bound → attendance live.
 *
 * Pieces:
 *  - Versioned form definitions (main-admin form builder; submissions pin
 *    the version they were collected with; system fields can't be deleted).
 *  - Gate links: shareable, revocable tokens that open the desk page. The
 *    desk operator must ALSO hold a staff session — the token scopes and
 *    revokes the link, the session authenticates the human.
 *  - Parent verification: a no-account page reached by SMS/email where the
 *    parent grants typed consents (P0 blocking, P1/P2 optional) + feedback.
 *  - Typed consents ledger (one row per grant/decline, never overwritten).
 */

const CONSENT_TYPES = [
    'participation' => ['p' => 0, 'label' => 'Program participation'],
    'medical'       => ['p' => 0, 'label' => 'Emergency medical care'],
    'data'          => ['p' => 0, 'label' => 'Data processing (NDPR)'],
    /* `mustAnswer` = the parent has to make an explicit choice; both answers
     * are accepted. Not the same as p=0, which REFUSES the registration until
     * the consent is granted. Conditioning a child's place on permission to
     * publish their photograph would make that consent worthless — it is not
     * freely given if refusing costs them their place — so these are required
     * to be ANSWERED, never required to be granted. */
    'media'         => ['p' => 1, 'mustAnswer' => true, 'label' => 'Photos & media'],
    'site_visibility' => ['p' => 1, 'mustAnswer' => true, 'label' => 'Feature on our website'],
    'trips'         => ['p' => 2, 'label' => 'Off-site activities'],
    'comms'         => ['p' => 2, 'label' => 'Program updates by SMS/email'],
];
const FORM_FIELD_TYPES = ['text', 'longtext', 'email', 'phone', 'number', 'date', 'choice', 'multi', 'yesno', 'file', 'section', 'info'];
/* The ages the programme takes. Named once because three places need to agree:
 * the date-of-birth validator, the record it writes, and the message a family
 * reads when they mistype a year. */
const REG_MIN_AGE = 5;
const REG_MAX_AGE = 19;

/**
 * Conditional-logic operators for a field's `showIf`.
 *
 *   is / isNot   exact match against another field's answer
 *   in           the answer is one of several values (comma-separated)
 *   answered     the field has any value at all
 *   empty        the field has no value
 *
 * `showIf` predates this and was a bare {key, value} meaning `is`; that shape
 * still loads and is normalised on the next save, so published forms keep
 * working across the upgrade.
 */
const FORM_LOGIC_OPS = ['is', 'isNot', 'in', 'answered', 'empty'];

/**
 * Does `$f` show, given the answers so far? The single source of truth for
 * conditional logic on the server; page-other.jsx mirrors it exactly for the
 * live form, and tests pin the two together.
 *
 * A multi-select answer satisfies `is` when the value is among the choices —
 * "show this when they picked Music" should not require Music to be their
 * ONLY pick.
 */
function form_field_visible(array $f, array $data): bool {
    if (empty($f['showIf']) || empty($f['showIf']['key'])) return true;
    $c = $f['showIf'];
    $raw = $data[$c['key']] ?? '';
    $vals = is_array($raw) ? array_map(fn($x) => trim((string)$x), $raw) : [trim((string)$raw)];
    $vals = array_values(array_filter($vals, fn($x) => $x !== ''));
    $want = trim((string)($c['value'] ?? ''));
    switch ((string)($c['op'] ?? 'is')) {
        case 'answered': return count($vals) > 0;
        case 'empty':    return count($vals) === 0;
        case 'isNot':    return !in_array($want, $vals, true);
        case 'in':
            $set = array_values(array_filter(array_map('trim', explode(',', $want)), fn($x) => $x !== ''));
            foreach ($vals as $v) if (in_array($v, $set, true)) return true;
            return false;
        case 'is':
        default:         return in_array($want, $vals, true);
    }
}

/**
 * The options a choice field actually offers, given the answers so far.
 * A field with `optionsFrom` takes its list from the academy catalogue entry
 * for whatever faculty the referenced field holds — which is what makes Course
 * follow Faculty. With no faculty chosen yet the full catalogue is returned so
 * the field is never a dead end.
 */
function form_field_options(array $f, array $data): array {
    $base = array_values((array)($f['options'] ?? []));
    if (empty($f['optionsFrom'])) return $base;
    $picked = trim((string)($data[(string)$f['optionsFrom']] ?? ''));
    if ($picked === '') return $base;
    $sub = academy_courses_for($picked);
    return $sub ?: $base;
}

/** The seed form — created on first read; 'locked' fields cannot be removed. */
/**
 * The programme's academies (faculties) and the courses within each — the
 * seeded catalogue that drives the volunteer Faculty options and the student
 * course catalogue. Admins can still edit these in the Form Builder afterwards;
 * this is only the starting point. The Leadership academy is intentionally
 * excluded from the public catalogue.
 */
/** The built-in starting catalogue — used until an admin edits it. */
function academy_catalogue_default(): array {
    /* The programme's actual 2026 catalogue, as the coordinators run it.
     * Some of these are one course, not two: "AI Tools Application & Digital
     * Problem Solving" and "Drawing & Visual Design" are each taught as a
     * single strand, and splitting them on the ampersand — which the earlier
     * seed did — put courses on the form that nobody teaches. */
    return [
        'AI & Technology'  => ['Practical Coding', 'AI Tools Application & Digital Problem Solving'],
        'Entrepreneurship' => ['Google Workspace'],
        'Media'            => ['Graphics Design', 'Video Editing'],
        'Creative Arts'    => ['Tie & Dye', 'Catering', 'Dance / Acting', 'Drawing & Visual Design'],
        'Music'            => ['Talking Drums', 'Piano', 'Guitar'],
    ];
}

/** Normalise a raw faculty→courses structure into an ordered map of
 *  clean strings: trims names, drops blanks/dupes, and keeps only faculties
 *  that have at least one course. Returns [] if nothing usable survives. */
function academy_catalogue_clean($raw): array {
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $fac => $courses) {
        $fac = trim((string)$fac);
        if ($fac === '' || mb_strlen($fac) > 80) continue;
        if (!is_array($courses)) continue;
        $seen = [];
        foreach ($courses as $c) {
            $c = trim((string)$c);
            if ($c === '' || mb_strlen($c) > 80) continue;
            if (!in_array($c, $seen, true)) $seen[] = $c;
        }
        if ($seen && !isset($out[$fac])) $out[$fac] = $seen;
    }
    return $out;
}

/**
 * The live academy catalogue — the admin-editable faculty→courses map. Stored
 * in the `academy_catalogue` setting; falls back to the built-in default until
 * an admin saves their own. The Leadership academy is intentionally excluded.
 */
function academy_catalogue(): array {
    $saved = academy_catalogue_clean(setting_get('academy_catalogue'));
    return $saved ?: academy_catalogue_default();
}
/** Academy (faculty) names, in catalogue order. */
function academy_faculties(): array { return array_keys(academy_catalogue()); }
/** Every course across all academies, flattened, in catalogue order. */
function academy_courses(): array { $out = []; foreach (academy_catalogue() as $courses) foreach ($courses as $c) $out[] = $c; return $out; }
/** The courses that belong to a single faculty (empty if the faculty is
 *  unknown). Powers the "courses under the chosen faculty" instructor picker. */
function academy_courses_for(string $faculty): array {
    $cat = academy_catalogue();
    return array_values($cat[trim($faculty)] ?? []);
}

/**
 * Section headings, seeded into forms that predate them.
 *
 * Twelve boxes in one unbroken column is a wall on a phone, and the questions
 * are not one subject: three are about the child, three about the course,
 * three about a parent, three about school. Undivided, a family scrolls past
 * "Parent's phone" without registering that the form has changed who it is
 * asking about — and the commonest support call on a registration desk is a
 * child's own number typed into the guardian field.
 *
 * Same one-shot mechanism as School type: optional, seeded once, deletable.
 * Each is inserted ABOVE its anchor rather than below, so it introduces the
 * group instead of trailing the one before it.
 *
 * `before` lists the whole group, not just its first question. A form that
 * dropped Faculty but kept Course still has a group to head, and anchoring
 * only to the first member would leave it bare. A group with none of its
 * members left has nothing to introduce, and gets no heading — see
 * form_seed_optional_field().
 */
const FORM_SECTIONS = [
    ['key' => 'secChild',  'before' => ['firstName', 'lastName', 'dob', 'age'],          'label' => 'About the child'],
    ['key' => 'secCourse', 'before' => ['faculty', 'course', 'centre'],                 'label' => 'What they want to learn'],
    ['key' => 'secParent', 'before' => ['parentName', 'parentPhone', 'parentEmail'],    'label' => 'Parent or guardian'],
    ['key' => 'secSchool', 'before' => ['school', 'schoolType', 'allergies'],           'label' => 'School and health'],
];

function form_default_fields(): array {
    return [
        ['key' => 'secChild', 'label' => 'About the child', 'type' => 'section'],
        // Asked as two fields, not one. A single "Full name" box left everything
        // downstream guessing: the ID card split on spaces and took the last
        // word as the surname, which is wrong for a double-barrelled name and
        // backwards for a family that writes surname first — on a card that
        // costs money to reprint. `fullName` is still stored, composed from
        // these two.
        ['key' => 'firstName', 'label' => 'First name', 'type' => 'text', 'required' => true, 'locked' => true],
        ['key' => 'lastName', 'label' => 'Last name', 'type' => 'text', 'required' => true, 'locked' => true],
        /* Date of birth, not age.
         *
         * An age typed into a box is stale within months, cannot be corrected
         * without asking the family again, and is the input to every age band,
         * cohort comparison and safeguarding rule downstream. A date of birth
         * stays true. The age is computed from it — shown back to the family as
         * they type so a slipped year is obvious, and stored alongside so the
         * dozen places that read `age` keep working. */
        ['key' => 'dob', 'label' => 'Date of birth', 'type' => 'date', 'required' => true, 'locked' => true,
         'help' => 'We work the age out from this — please check it looks right.',
         'adminHelp' => 'Replaces the old free-typed Age. The age is derived on submit and still stored, so every report that reads age is unaffected.'],
        /* Sex. LOCKED, and asked of every child.
         *
         * Two columns for this existed and neither was ever written, because
         * the form never asked — so the analytics gender panel reported every
         * child as "Not recorded" in every cohort this programme has run.
         *
         * It is locked for the same reason `centre` is: it is not a question an
         * admin should be able to remove by republishing the form. Every serious
         * education funder asks for outcomes disaggregated by sex, and a cohort
         * registered without it can never be disaggregated afterwards — the
         * answer is not recoverable from a name, and asking two hundred families
         * again in November is not a plan.
         *
         * Two options, because that is the disaggregation the reporting standard
         * uses and the answer that gets counted. It is NOT required: a family
         * who would rather not say leaves it blank, and "Not recorded" is
         * carried through the reports as its own category rather than being
         * folded into one of the two. */
        ['key' => 'sex', 'label' => 'Sex', 'type' => 'choice', 'required' => false, 'locked' => true,
         'options' => SEX_VALUES,
         'help' => 'Optional. We report attendance and learning separately for girls and boys, which is how we show the programme is reaching both.',
         'adminHelp' => 'Locked: funder reporting and the gender analysis on the analytics page count off this field, and a cohort registered without it cannot be disaggregated later.'],
        ['key' => 'secCourse', 'label' => 'What they want to learn', 'type' => 'section'],
        // Faculty is asked FIRST and narrows Course. Both are locked keys: the
        // catalogue, the /v-status breakdowns and instructor matching read them.
        /* `help` is read by the FAMILY filling the form in. `adminHelp` is the
         * note for whoever is editing the form in the builder, and it never
         * leaves the console — these three used to carry their builder
         * guidance in `help`, so a parent on their phone was told to go and
         * edit the option list in Admin → Settings. */
        ['key' => 'faculty', 'label' => 'Faculty', 'type' => 'choice', 'required' => true, 'locked' => true, 'options' => academy_faculties(),
         'help' => 'Pick the faculty first — the courses below change to match.',
         'adminHelp' => 'Starts from the academy catalogue in Admin → Settings. Picking one narrows the Course list below to that faculty\'s courses; edit these options to override the list for this form.'],
        ['key' => 'course', 'label' => 'Course', 'type' => 'choice', 'required' => true, 'locked' => true, 'optionsFrom' => 'faculty', 'options' => academy_courses(),
         'adminHelp' => 'Courses are filtered by the chosen faculty — that mapping always comes live from Admin → Settings. This option list starts from the catalogue; type your own here to override it for this form.'],
        // Locked. This is not a question, it is the record's home: it sets the
        // printed ID prefix and card colour, every per-centre board counts off
        // it, and the parent group link is looked up by it. It was NOT locked,
        // so a republish dropped it — and every registration afterwards stored
        // an empty centre with nothing anywhere saying so.
        ['key' => 'centre', 'label' => 'Centre', 'type' => 'choice', 'required' => true, 'locked' => true, 'options' => ['Main'],
         'help' => 'The site your child will attend.',
         'adminHelp' => 'Options come from Admin → Centres; drives the ID prefix and card colour.'],
        ['key' => 'secParent', 'label' => 'Parent or guardian', 'type' => 'section'],
        // Locked: the consent record, the verification message and every
        // safeguarding follow-up name this person. A republish that dropped
        // the question left guardianName empty on every child registered
        // afterwards, and nothing said so.
        ['key' => 'parentName', 'label' => "Parent / guardian's name", 'type' => 'text', 'required' => true, 'locked' => true],
        ['key' => 'parentPhone', 'label' => "Parent's phone", 'type' => 'phone', 'required' => false, 'help' => 'Either phone or email is required — both is best.', 'locked' => true],
        ['key' => 'parentEmail', 'label' => "Parent's email", 'type' => 'email', 'required' => false, 'locked' => true],
        ['key' => 'secSchool', 'label' => 'School and health', 'type' => 'section'],
        ['key' => 'school', 'label' => 'School', 'type' => 'text', 'required' => false],
        // Asked as a dropdown, not a free-text box, because it is a fact that
        // gets COUNTED. Typed, the same answer arrives as "public", "Public
        // school", "govt", "LGEA" and "state" — five spellings of one number,
        // and every funder report that asks for the public/private split then
        // has to be reconstructed by hand. Two options is also the whole
        // question: it stays optional, so a child who is not in school (or a
        // family who would rather not say) simply leaves it blank.
        ['key' => 'schoolType', 'label' => 'School type', 'type' => 'choice', 'required' => false,
         'options' => ['Public', 'Private'],
         'help' => 'Public means a government school (state, LGEA or federal). Optional — leave blank if the child is not in school.'],
        /* The class the child is in. LOCKED, and asked in the words a Lagos
         * parent uses rather than as "grade 8" — the column stores the
         * international number, see grade_normalise() in util.php.
         *
         * Why it is locked and why it is here at all: the evidence funds a
         * programme like this applies to scope their eligibility to two
         * transition windows, grades 4–6 and 7–9, because that is where gender
         * gaps in schooling widen. Without a class on the record, "how many of
         * our children are at the transition point" is unanswerable — and that
         * is the first section of the application form. It also cannot be
         * recovered later: age is a poor proxy in a system with repeated years,
         * and asking two hundred families again is not a plan.
         *
         * Optional, like sex. A child out of school leaves it blank, and "Not
         * recorded" stays its own category rather than being guessed from age. */
        ['key' => 'grade', 'label' => 'Class', 'type' => 'choice', 'required' => false, 'locked' => true,
         'options' => grade_options(),
         'help' => 'The class they are in at school this year. Leave blank if they are not in school.',
         'adminHelp' => 'Locked: stored as an international grade number (Primary 1–6 → 1–6, JSS → 7–9, SSS → 10–12) so funder eligibility written as "grades 4 to 6" can be answered directly. The date it was recorded is stored with it, because a class ages and a birthday does not.'],
        ['key' => 'allergies', 'label' => 'Allergies or medical notes', 'type' => 'longtext', 'required' => false, 'sensitive' => true, 'help' => 'Visible to program staff only. Never exported.'],
    ];
}

/** The public volunteer form. The first block is structural (the wizard +
 *  approval pipeline depend on these keys) and locked; admins append their
 *  own custom questions after them, which render on the public form. */
function volunteer_default_fields(): array {
    return [
        ['key' => 'role', 'label' => 'Volunteer role', 'type' => 'choice', 'required' => true, 'locked' => true, 'options' => ['Admin / Ops', 'Mentor', 'Instructor']],
        ['key' => 'name', 'label' => 'Full name', 'type' => 'text', 'required' => true, 'locked' => true],
        // Same rule as a child's, and the same reason: a volunteer body that
        // cannot be described by sex cannot be reported on either.
        ['key' => 'sex', 'label' => 'Sex', 'type' => 'choice', 'required' => false, 'locked' => true,
         'options' => SEX_VALUES,
         'help' => 'Optional. Used for reporting on who volunteers with us, never for selection.',
         'adminHelp' => 'Locked: the volunteer body is reported by sex to funders and boards.'],
        ['key' => 'email', 'label' => 'Email', 'type' => 'email', 'required' => true, 'locked' => true],
        ['key' => 'phone', 'label' => 'Phone', 'type' => 'phone', 'required' => false, 'locked' => true,
         'help' => 'Required if you are applying to be an instructor.',
         'adminHelp' => 'Enforced at submit for instructors, and again at approval.'],
        // Faculty is the teaching group mentors & instructors belong to. Locked
        // key (the /v-status board + validation read it), but its OPTIONS are
        // admin-editable here — the single source of truth for the catalogue.
        ['key' => 'faculty', 'label' => 'Faculty', 'type' => 'choice', 'required' => false, 'locked' => true, 'options' => academy_faculties(),
         'help' => 'Which teaching group you would join. Required for mentors and instructors.',
         'adminHelp' => 'The academy / faculty catalogue — edit these options freely (add/rename/remove). Drives the /v-status faculty breakdown.'],
        ['key' => 'why', 'label' => 'Why you', 'type' => 'longtext', 'required' => false, 'locked' => true],
    ];
}

/** The public contact form — fully builder-driven. */
function contact_default_fields(): array {
    return [
        ['key' => 'name', 'label' => 'Your name', 'type' => 'text', 'required' => true, 'locked' => true],
        ['key' => 'email', 'label' => 'Email', 'type' => 'email', 'required' => true, 'locked' => true],
        ['key' => 'purpose', 'label' => 'What is this about?', 'type' => 'choice', 'required' => false, 'options' => ['General', 'Volunteering', 'Partnership', 'Press', 'Safeguarding concern']],
        ['key' => 'message', 'label' => 'Message', 'type' => 'longtext', 'required' => true, 'locked' => true],
    ];
}

/**
 * Registry of every admin-editable form. formId → metadata + default-field
 * factory. This is the single source that makes the builder multi-form.
 */
function form_registry(): array {
    return [
        'summer-reg' => ['name' => 'Summer registration', 'defaults' => 'form_default_fields',
            'note' => 'The public gate registration form — drives student sign-up, IDs and the instructor course catalogue.'],
        'volunteer'  => ['name' => 'Volunteer registration', 'defaults' => 'volunteer_default_fields',
            'note' => 'The public /volunteer form. Core fields are locked; add custom questions to collect more from volunteers.'],
        'contact'    => ['name' => 'Contact form', 'defaults' => 'contact_default_fields',
            'note' => 'The public contact form.'],
    ];
}
function form_defaults_for(string $formId): array {
    $reg = form_registry();
    $fn = $reg[$formId]['defaults'] ?? 'form_default_fields';
    return $fn();
}

function form_live(string $formId = 'summer-reg'): array {
    $row = db_row("SELECT * FROM form_defs WHERE formId = ? AND status = 'live' ORDER BY version DESC LIMIT 1", [$formId]);
    if (!$row) {
        $reg = form_registry();
        $nm = $reg[$formId]['name'] ?? 'Form';
        db_insert('form_defs', ['formId' => $formId, 'version' => 1, 'name' => $nm, 'fields' => json_encode(form_defaults_for($formId), JSON_UNESCAPED_SLASHES), 'status' => 'live', 'publishedBy' => 'system', 'createdAt' => now_iso()]);
        $row = db_row("SELECT * FROM form_defs WHERE formId = ? AND status = 'live' ORDER BY version DESC LIMIT 1", [$formId]);
    }
    $stored = json_decode((string)$row['fields'], true) ?: [];
    if ($formId === 'summer-reg') {
        $stored = form_seed_once($row, $stored, 'schoolType', 'school');
        /* The headings go in as a set, under one flag. Four separate flags
           would let a half-applied run leave a form with two of its four
           groups labelled, which reads as a mistake rather than a decision —
           and there is no state in which "some of the sections" is what
           anybody wanted. */
        $stored = form_seed_once($row, $stored, FORM_SECTIONS, '', 'before', 'form_seeded_sections');
    }
    $row['fields'] = form_hydrate_options(form_restore_locked($stored, $formId), $formId);
    return $row;
}

/**
 * Introduce a new OPTIONAL default question into a form that predates it —
 * once, and only once, and only if the write actually landed.
 *
 * form_restore_locked() cannot do this job. It reinstates locked fields on
 * every read, which is right for a field the system depends on and wrong for
 * a question the organisation is allowed to decide it does not want: delete
 * School type in the builder and the next page load would put it straight
 * back. So the seed is gated on a setting.
 *
 * Which makes the ORDER the whole design. The flag is the record that the
 * question has been introduced, so it must not be written until the question
 * is in the database — a flag set ahead of a failed write is a question that
 * never arrives and never retries, and the only symptom is a form that does
 * not have it. Likewise the UPDATE is scoped to the row while it is still
 * `live`: an admin publishing a new version in the same second archives the
 * row underneath us, and writing the field into an archived row while
 * claiming the job is done loses it just as completely. Either failure simply
 * leaves the flag unset and the next read tries again.
 *
 * Written back to the row, not patched on the way out, because the point is
 * that the organisation now OWNS the question — the builder reads form_live()
 * too, so it edits and republishes like any other field.
 */
function form_seed_once(array $row, array $stored, $key, string $anchor, string $side = 'after', string $flagName = ''): array {
    $flag = $flagName !== '' ? $flagName : 'form_seeded_' . $key;
    if (setting_raw($flag) !== null) return $stored;

    /* One field, or a set that goes in together. A set is all-or-nothing on
       the same flag: see the caller. */
    $seeded = $stored;
    foreach (is_array($key) ? $key : [['key' => $key, 'before' => $anchor, 'after' => $anchor]] as $spec) {
        // NOT cast to string — an anchor may be a whole group.
        $seeded = form_seed_optional_field($seeded, (string)$spec['key'], $spec[$side] ?? $anchor, $side);
    }
    // Already there (or no such default) — nothing to write, but the job IS
    // done, so record it rather than re-checking on every read forever.
    if ($seeded === $stored) { setting_set($flag, '1'); return $stored; }

    $n = db_exec("UPDATE form_defs SET fields = ? WHERE id = ? AND status = 'live'",
        [json_encode($seeded, JSON_UNESCAPED_SLASHES), (int)($row['id'] ?? 0)]);
    if ($n < 1) return $stored;          // row moved or write refused — retry next read

    setting_set($flag, '1');
    return $seeded;
}

/**
 * Put back any LOCKED field the stored definition is missing.
 *
 * Publishing has refused to drop a locked field for a while, but a form row
 * written before a locked field existed simply has no such key — and nothing
 * ever added it. That is how the live summer form ended up with no Faculty
 * and no Course: the fields were introduced in code, the published row was
 * older, and `form_live()` served the row verbatim. The catalogue was fine
 * the whole time; there was nowhere on the form to show it.
 *
 * Each missing field goes back beside the NEIGHBOUR it has in the defaults,
 * not at its default numeric index. The index is a position in a different
 * list: a stored form that has dropped four questions and gained two of the
 * admin's own is not the same shape, so index 9 in one is somewhere arbitrary
 * in the other. That is not theoretical — adding the section headings shifted
 * every default index down, and the numeric splice started dropping "Parent /
 * guardian's name" in between School and School type, in the middle of a
 * group it has nothing to do with.
 *
 * Anchoring keeps Faculty ahead of Course, which the conditional-logic pass
 * requires (it resolves top-down, so a field that narrows another has to come
 * first), and it keeps a restored field inside the right section heading.
 * Fields the admin added are left where they are.
 */
function form_restore_locked(array $stored, string $formId = 'summer-reg'): array {
    $defaults = form_defaults_for($formId);
    $have = [];
    foreach ($stored as $f) if (is_array($f) && isset($f['key'])) $have[(string)$f['key']] = true;

    $indexOf = function (array $list, string $key) {
        foreach ($list as $i => $f) if (is_array($f) && ($f['key'] ?? '') === $key) return $i;
        return -1;
    };
    foreach ($defaults as $i => $def) {
        if (empty($def['locked'])) continue;
        if (isset($have[$def['key']])) continue;
        // Nearest default field ABOVE this one that the stored form still has.
        $at = -1;
        for ($j = $i - 1; $j >= 0 && $at < 0; $j--) {
            $k = $indexOf($stored, (string)($defaults[$j]['key'] ?? ''));
            if ($k >= 0) $at = $k + 1;
        }
        // Otherwise the nearest one BELOW, so it lands above that instead.
        for ($j = $i + 1; $j < count($defaults) && $at < 0; $j++) {
            $k = $indexOf($stored, (string)($defaults[$j]['key'] ?? ''));
            if ($k >= 0) $at = $k;
        }
        if ($at < 0) $at = count($stored);       // nothing in common — append
        array_splice($stored, $at, 0, [$def]);
        $have[$def['key']] = true;
    }

    /* Reinstate a locked field's STRUCTURE, not just its existence.
     *
     * Restoring only whole missing fields was not enough. A form published by
     * an earlier builder kept the Course field but lost `optionsFrom`, because
     * that publish path rebuilt each field from a fixed list of properties and
     * silently dropped the rest. The key was still there, so the loop above
     * skipped it; `optionsFrom` was gone, so form_hydrate_options() skipped it
     * too — the one property that identifies the field as catalogue-driven was
     * also the property both repairs keyed on.
     *
     * The visible result is the bug that keeps being reported as "the courses
     * aren't seeded": Course offers every course in the programme, and picking
     * a faculty narrows nothing. Fixing the builder stopped NEW publishes
     * losing it and did nothing for the definition already in the database.
     *
     * Only structural properties are restored. A locked field's label, options
     * and help text are the admin's to edit; which other field it cascades
     * from is not — the builder does not even expose it, so a missing value is
     * always damage rather than a decision.
     *
     * `adminHelp` is on the same footing. It is the note explaining what a
     * locked field is wired to, written in code and shown only in the builder,
     * so it belongs to the code and not to whoever last hit Publish — and it
     * is re-asserted rather than filled in only when absent, because an edit
     * to that explanation has to reach forms already published. */
    $structural = ['optionsFrom'];
    $defByKey = [];
    foreach ($defaults as $def) if (!empty($def['locked'])) $defByKey[(string)$def['key']] = $def;
    foreach ($stored as &$f) {
        if (!is_array($f)) continue;
        $def = $defByKey[(string)($f['key'] ?? '')] ?? null;
        if (!$def) continue;
        // Also re-assert the lock itself, so a field that lost it cannot be
        // deleted next time round and vanish from the form for good.
        $f['locked'] = true;
        foreach ($structural as $prop) {
            if (!empty($def[$prop]) && empty($f[$prop])) $f[$prop] = $def[$prop];
        }
        // Overwritten, not filled in — see above.
        if (isset($def['adminHelp'])) $f['adminHelp'] = $def['adminHelp'];
        else unset($f['adminHelp']);
    }
    unset($f);

    /* Retire the old single "Full name" box once its replacements are in.
     * Without this, a form published before the split asks for a full name
     * AND a first name AND a last name — three boxes for two facts, and a
     * parent at a registration desk filling in whichever they see first. The
     * stored answers are untouched; only the question goes away. */
    if ($formId === 'summer-reg' && isset($have['firstName']) && isset($have['lastName'])) {
        $stored = array_values(array_filter($stored, fn($f) => !is_array($f) || ($f['key'] ?? '') !== 'fullName'));
    }
    return $stored;
}

/**
 * Insert a default field next to its anchor, so it lands beside the question
 * it belongs with rather than at the bottom under the medical notes. Returns
 * the list UNCHANGED — same array, so callers can compare with `===` — when
 * the field is already present or there is no such default.
 *
 * `$side` is 'after' for a question (School type belongs under School) and
 * 'before' for a heading, which has to introduce its group rather than trail
 * the group above it. Getting that backwards puts "Parent or guardian" under
 * the parent's email, where it reads as a label for the school questions
 * beneath — worse than no heading at all.
 *
 * Pure: whether this should happen at all, and what to record once it has, is
 * form_seed_once()'s job.
 */
function form_seed_optional_field(array $stored, string $key, $anchor, string $side = 'after'): array {
    foreach ($stored as $f) if (is_array($f) && ($f['key'] ?? '') === $key) return $stored;
    $def = null;
    foreach (form_default_fields() as $d) if (($d['key'] ?? '') === $key) { $def = $d; break; }
    if (!$def) return $stored;
    /* An anchor can be a group. The first member still on the form wins, in
       the order given, so a heading lands above whatever survives of what it
       describes. */
    $at = -1;
    foreach ((array)$anchor as $want) {
        foreach ($stored as $i => $f) {
            if (is_array($f) && ($f['key'] ?? '') === $want) { $at = $side === 'before' ? $i : $i + 1; break 2; }
        }
    }
    if ($at < 0) {
        /* No anchor. A question can still go in at the end — a worse position,
           not a reason to drop it. A HEADING cannot: it exists to introduce
           the group below it, and appended to the bottom it introduces
           nothing and reads as a fault. */
        if ($side === 'before') return $stored;
        $at = count($stored);
    }
    array_splice($stored, $at, 0, [$def]);
    return $stored;
}

/**
 * Refresh catalogue-backed options against the LIVE data, every read.
 *
 * A published form stores its fields as JSON, options included — a snapshot
 * of the catalogue at the moment somebody hit Publish. That is wrong for any
 * option list that is maintained elsewhere:
 *
 *  - Editing the academy catalogue in Settings changed nothing on the live
 *    form. The Faculty select kept whatever was frozen into the stored
 *    definition, so faculties and courses added later never appeared, and a
 *    form published before the faculty/course fields existed showed nothing
 *    at all. This is the "the courses and faculties aren't on the form" bug.
 *  - Adding or renaming a centre had the same problem, which is why
 *    gate_context already patched `centre` back up on its way out. That fix
 *    only helped the gate; the admin preview and submission validation still
 *    saw the stale copy.
 *
 * Doing it here means every consumer — public form, gate, preview and the
 * validator — agrees, and a course removed from the catalogue stops being
 * accepted rather than lingering as a valid answer.
 *
 * Only lists that HAVE an external source are touched. A plain choice field
 * an admin typed options into is left exactly as published.
 *
 * Scoped to the summer registration form on purpose. The VOLUNTEER form's
 * Faculty options are the volunteer faculty list and are edited in the form
 * builder itself (brief §5.4) — overwriting them from the academy catalogue
 * silently discards an admin's edit. Two different lists that happen to share
 * a field name; worth knowing before unifying them.
 */
function form_hydrate_options(array $fields, string $formId = 'summer-reg'): array {
    if ($formId !== 'summer-reg') return $fields;
    $catalogue = academy_catalogue();
    $faculties = array_keys($catalogue);
    $centres = centre_names_for_programme('summer');

    foreach ($fields as &$f) {
        if (!is_array($f)) continue;
        $key = (string)($f['key'] ?? '');
        $empty = empty($f['options']) || !is_array($f['options']);
        if ($key === 'faculty') {
            // Catalogue fills the list; an admin who typed their own options
            // in the builder keeps them. Those edits are a supported source
            // in their own right (they feed public.volunteer.context), so
            // overwriting them here would silently discard someone's work.
            if ($empty && $faculties) $f['options'] = $faculties;
        } elseif (!empty($f['optionsFrom']) && (string)$f['optionsFrom'] === 'faculty') {
            if ($empty) $f['options'] = array_values(array_unique(array_merge(...(array_values($catalogue) ?: [[]]))));
            // optionsBy is ALWAYS live — it is the faculty→courses mapping,
            // which has no builder equivalent and is what narrows the list
            // once a faculty is picked. Stale here means a cascade that
            // offers courses from the wrong faculty.
            $f['optionsBy'] = $catalogue;
        } elseif ($key === 'centre' && $centres) {
            $f['type'] = 'choice';
            $f['options'] = $centres;
        }
    }
    unset($f);
    return $fields;
}

/** Validate + normalise a builder-submitted field list. Returns [ok, fields|error]. */
function form_validate_fields(array $fields, ?array $systemFields = null): array {
    $out = []; $keys = [];
    foreach ($fields as $f) {
        if (!is_array($f)) return ['ok' => false, 'error' => 'bad_field'];
        $key = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($f['key'] ?? ''));
        $type = (string)($f['type'] ?? 'text');
        if ($key === '' || strlen($key) > 40) return ['ok' => false, 'error' => 'bad_field_key'];
        if (isset($keys[$key])) return ['ok' => false, 'error' => 'duplicate_field_key'];
        if (!in_array($type, FORM_FIELD_TYPES, true)) return ['ok' => false, 'error' => 'bad_field_type'];
        $clean = [
            'key' => $key,
            'label' => substr(trim((string)($f['label'] ?? $key)), 0, 120),
            'type' => $type,
            'required' => !empty($f['required']),
            'sensitive' => !empty($f['sensitive']),
            'locked' => !empty($f['locked']),
        ];
        foreach (['help', 'placeholder', 'requiredMessage'] as $k) if (!empty($f[$k])) $clean[$k] = substr((string)$f[$k], 0, 200);
        if (in_array($type, ['choice', 'multi'], true)) {
            $opts = array_values(array_filter(array_map(fn($o) => substr(trim((string)$o), 0, 80), (array)($f['options'] ?? []))));
            if (!$opts) return ['ok' => false, 'error' => 'choice_needs_options'];
            $clean['options'] = array_slice($opts, 0, 30);
        }
        if ($type === 'number') { if (isset($f['min'])) $clean['min'] = (int)$f['min']; if (isset($f['max'])) $clean['max'] = (int)$f['max']; }
        if (!empty($f['showIf']) && is_array($f['showIf']) && !empty($f['showIf']['key'])) {
            $op = (string)($f['showIf']['op'] ?? 'is');
            if (!in_array($op, FORM_LOGIC_OPS, true)) $op = 'is';
            $clean['showIf'] = [
                'key' => preg_replace('/[^a-zA-Z0-9_]/', '', (string)$f['showIf']['key']),
                'op' => $op,
                // answered/empty take no operand; storing one would be noise
                // that the editor then has to explain away.
                'value' => in_array($op, ['answered', 'empty'], true) ? '' : substr((string)($f['showIf']['value'] ?? ''), 0, 200),
            ];
            // A field cannot depend on itself, and only on one ABOVE it — the
            // renderer resolves top-down in one pass, so a forward reference
            // would read an answer that has not been collected yet, and a cycle
            // would never settle.
            if ($clean['showIf']['key'] === $key || !isset($keys[$clean['showIf']['key']])) {
                return ['ok' => false, 'error' => 'logic_forward_reference', 'field' => $key];
            }
        }
        if (!empty($f['optionsFrom'])) {
            $src = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$f['optionsFrom']);
            if ($src !== '' && $src !== $key && isset($keys[$src])) $clean['optionsFrom'] = $src;
        }
        // Registered only now, so `showIf`/`optionsFrom` above can only resolve
        // to a field ALREADY seen — self-reference and forward references fail.
        $keys[$key] = true;
        $out[] = $clean;
    }
    // System fields the lifecycle depends on must survive every edit. The
    // set is per-form (defaults to the summer registration fields).
    foreach (($systemFields ?? form_default_fields()) as $sys) {
        if (!empty($sys['locked']) && !isset($keys[$sys['key']])) return ['ok' => false, 'error' => 'locked_field_missing', 'field' => $sys['key']];
    }
    if (count($out) > 60) return ['ok' => false, 'error' => 'too_many_fields'];
    return ['ok' => true, 'fields' => $out];
}

/** Validate a registration submission against a form def. */
function form_validate_submission(array $fields, array $data): array {
    $clean = []; $errors = [];
    $visible = fn(array $f): bool => form_field_visible($f, $data);
    foreach ($fields as $f) {
        if (in_array($f['type'], ['section', 'info'], true)) continue;
        $k = $f['key'];
        $v = $data[$k] ?? '';
        $v = is_array($v) ? array_map(fn($x) => substr(trim((string)$x), 0, 300), $v) : substr(trim((string)$v), 0, ($f['type'] === 'longtext' ? 2000 : 300));
        if (!$visible($f)) continue;
        $empty = is_array($v) ? !count($v) : $v === '';
        if ($empty) {
            if (!empty($f['required'])) $errors[$k] = $f['requiredMessage'] ?? ($f['label'] . ' is required.');
            continue;
        }
        switch ($f['type']) {
            case 'email': if (!filter_var(is_array($v) ? '' : $v, FILTER_VALIDATE_EMAIL)) $errors[$k] = 'That email doesn\'t look right.'; break;
            case 'phone': if (sms_normalize(is_array($v) ? '' : $v) === '') $errors[$k] = 'That phone number doesn\'t look right.'; break;
            case 'number':
                $n = (int)$v;
                if (isset($f['min']) && $n < $f['min']) $errors[$k] = $f['label'] . ' must be at least ' . $f['min'] . '.';
                if (isset($f['max']) && $n > $f['max']) $errors[$k] = $f['label'] . ' must be at most ' . $f['max'] . '.';
                $v = (string)$n;
                break;
            // Against the RESOLVED options: a course that exists under some
            // other faculty must not pass just because it exists somewhere.
            case 'choice':
                $allowed = form_field_options($f, $data);
                if (!in_array($v, $allowed, true)) {
                    $errors[$k] = !empty($f['optionsFrom'])
                        ? 'Pick a course from the chosen faculty.'
                        : 'Pick one of the listed options.';
                }
                break;
            case 'multi':
                $v = array_values(array_intersect(is_array($v) ? $v : [$v], form_field_options($f, $data)));
                break;
            case 'date':
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', is_array($v) ? '' : $v)) { $errors[$k] = 'Use the date picker.'; break; }
                /* A date of birth is checked as an AGE, because that is what the
                 * mistake looks like: the commonest slip is the current year, and
                 * "1 January 2026" is a perfectly valid date and an impossible
                 * child. The bounds are the programme's, so the message can say
                 * what is actually wrong rather than "invalid date". */
                if ($k === 'dob') {
                    $a = dob_age($v);
                    if ($a < 0) { $errors[$k] = 'That date is in the future — check the year.'; break; }
                    if ($a < REG_MIN_AGE) $errors[$k] = 'That works out to ' . $a . ' years old. The programme starts at ' . REG_MIN_AGE . ' — check the year.';
                    elseif ($a > REG_MAX_AGE) $errors[$k] = 'That works out to ' . $a . ' years old, which is above the ' . REG_MAX_AGE . ' the programme takes.';
                }
                break;
        }
        $clean[$k] = $v;
    }
    return $errors ? ['ok' => false, 'errors' => $errors] : ['ok' => true, 'data' => $clean];
}

/* ── Form builder (main admin) ────────────────────────────────────────────── */

function admin_forms_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $out = [];
    foreach (form_registry() as $formId => $meta) {
        $live = form_live($formId);
        $out[] = ['formId' => $formId, 'name' => (string)$live['name'], 'note' => $meta['note'],
            'version' => (int)$live['version'], 'fieldCount' => count($live['fields'])];
    }
    return ['ok' => true, 'forms' => $out];
}

function admin_forms_get(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $formId = (string)($p['formId'] ?? 'summer-reg');
    if (!isset(form_registry()[$formId])) return ['ok' => false, 'error' => 'unknown_form'];
    $live = form_live($formId);
    $versions = db_all("SELECT version, name, publishedBy, createdAt, status FROM form_defs WHERE formId = ? ORDER BY version DESC LIMIT 20", [$formId]);
    return ['ok' => true, 'form' => ['formId' => $formId, 'version' => (int)$live['version'], 'name' => (string)$live['name'], 'fields' => $live['fields'], 'note' => form_registry()[$formId]['note']], 'versions' => $versions, 'fieldTypes' => FORM_FIELD_TYPES];
}

function admin_forms_publish(array $p): array {
    // Publishing a live public form is super_admin only.
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    if (strtolower((string)$g['requester']['role']) !== 'super_admin') return ['ok' => false, 'error' => 'forbidden'];
    $formId = (string)($p['formId'] ?? 'summer-reg');
    if (!isset(form_registry()[$formId])) return ['ok' => false, 'error' => 'unknown_form'];
    // Validate the field list, enforcing THIS form's locked/system fields.
    $v = form_validate_fields(is_array($p['fields'] ?? null) ? $p['fields'] : [], form_defaults_for($formId));
    if (empty($v['ok'])) return $v;
    $live = form_live($formId);
    $next = (int)$live['version'] + 1;
    db_exec("UPDATE form_defs SET status = 'archived' WHERE formId = ? AND status = 'live'", [$formId]);
    db_insert('form_defs', ['formId' => $formId, 'version' => $next, 'name' => substr((string)($p['name'] ?? $live['name']), 0, 160), 'fields' => json_encode($v['fields'], JSON_UNESCAPED_SLASHES), 'status' => 'live', 'publishedBy' => $g['requester']['memberId'], 'createdAt' => now_iso()]);
    audit('forms.publish', $g['requester']['memberId'], $formId, ['version' => $next], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'version' => $next];
}

/* ── Gate links ───────────────────────────────────────────────────────────── */

/**
 * A desk password a volunteer can read off a screen and type on a phone at a
 * noisy registration table. Two four-character groups from an alphabet with
 * the look-alikes removed (no O/0, I/1/L, S/5, B/8) — 30^8, about 40 bits,
 * which is far beyond a 5-per-15-minutes unlock throttle, while staying
 * hard to mistype and easy to read aloud.
 */
/**
 * Normalise a requested validity into the exact shape gate_resolve compares
 * against. That check is a STRING comparison against now_iso(), so anything
 * stored in another format ("2026-08-01", a local time, an offset) either
 * never expires or expires immediately. Everything funnels through here.
 *
 * Accepts a day count ("expire in N days") or a calendar date, which is taken
 * to mean the end of that day — a link valid "until the 8th" should still work
 * on the evening of the 8th. Returns '' for no expiry.
 */
function gate_expiry_normalise($value, $days = null): ?string {
    if ($days !== null && $days !== '') {
        $d = (int)$days;
        if ($d <= 0) return '';
        if ($d > 3650) return null;                       // ten years is a typo
        return gmdate('Y-m-d\TH:i:s\Z', time() + $d * 86400);
    }
    $v = trim((string)$value);
    if ($v === '') return '';
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) $v .= 'T23:59:59Z';
    $t = strtotime($v);
    if ($t === false) return null;
    return gmdate('Y-m-d\TH:i:s\Z', $t);
}

/** Days until this link stops working, or null when it never does. */
function gate_expires_in_days(array $gate): ?int {
    $exp = (string)($gate['expiresAt'] ?? '');
    if ($exp === '') return null;
    $t = strtotime($exp);
    if (!$t) return null;
    return (int)ceil(($t - time()) / 86400);
}

function gate_password_new(): string {
    $abc = 'ACDEFGHJKMNPQRTUVWXYZ2346789';
    $n = strlen($abc);
    $out = '';
    for ($i = 0; $i < 8; $i++) {
        if ($i === 4) $out .= '-';
        $out .= $abc[random_int(0, $n - 1)];
    }
    return $out;
}

/**
 * Write a desk password (hash only), stamp when it was set, and set the date
 * it dies if this gate has an expiry policy.
 *
 * Expiry and rotation are different policies and are meant to be combinable.
 * Rotation REPLACES a password on schedule and deliberately fails open — a
 * desk is never locked out because nobody could be told the new one. Expiry
 * KILLS a password on schedule and deliberately fails closed. Set both and
 * the expiry is the backstop: if rotation is silently not running, the
 * password still stops working instead of living forever.
 */
function gate_password_store(string $gateId, string $pw): void {
    $days = (int)(db_row('SELECT passExpiryDays FROM gate_links WHERE gateId = ?', [$gateId])['passExpiryDays'] ?? 0);
    db_update('gate_links', [
        'passHash' => password_hash($pw, PASSWORD_DEFAULT),
        'passSetAt' => now_iso(),
        'passExpiresAt' => $days > 0 ? gmdate('Y-m-d\TH:i:s\Z', time() + $days * 86400) : '',
    ], ['gateId' => $gateId]);
}

/** Has this desk's password passed its expiry date? */
function gate_password_expired(array $gate): bool {
    $exp = (string)($gate['passExpiresAt'] ?? '');
    return $exp !== '' && $exp < now_iso();
}

/** Days until the password stops working, or null when it never does. */
function gate_password_expires_in(array $gate): ?int {
    $exp = (string)($gate['passExpiresAt'] ?? '');
    if ($exp === '' || ($gate['passHash'] ?? '') === '') return null;
    $t = strtotime($exp);
    return $t ? (int)ceil(($t - time()) / 86400) : null;
}

/** Days until this gate is due to roll, or null when rotation is off. */
function gate_rotation_due_in(array $gate): ?int {
    $days = (int)($gate['passRotateDays'] ?? 0);
    if ($days <= 0 || ($gate['passHash'] ?? '') === '') return null;
    $set = (string)($gate['passSetAt'] ?? '');
    $from = $set !== '' ? strtotime($set) : strtotime((string)($gate['createdAt'] ?? ''));
    if (!$from) return null;
    return (int)ceil(($from + $days * 86400 - time()) / 86400);
}

/* ── Gate link kinds ─────────────────────────────────────────────────────
 * Four kinds of link, and who owns each follows what it is FOR:
 *   desk     the door — check-in only, for everyone       → `checkin`
 *   self     a family's own Summer School sign-up          → `summer`
 *   review   approving those sign-ups                      → `summer`
 *   register staff enrolling a Summer walk-in at a desk    → `summer`
 * The door used to be a Summer School link; it checks in members and
 * volunteers all year, so it moved out (Control Room → Check-in desks). */
const GATE_KINDS = ['desk' => ['cap' => 'checkin', 'path' => '/gate?g='],
                    'self' => ['cap' => 'summer', 'path' => '/apply?g='],
                    'review' => ['cap' => 'summer', 'path' => '/review?g='],
                    'register' => ['cap' => 'summer', 'path' => '/enrol?g=']];

function gate_kind_of($kind): string {
    $k = trim((string)($kind ?? ''));
    return isset(GATE_KINDS[$k]) ? $k : 'desk';
}
function gate_kind_path($kind): string { return GATE_KINDS[gate_kind_of($kind)]['path']; }

/** The admin gate for one existing link: the capability its kind needs. An
 *  unknown id is checked against `summer` and then reported not_found by the
 *  caller, so its existence is not revealed to somebody holding neither. */
function admin_gate_for_link(array $p): array {
    $row = db_row('SELECT kind FROM gate_links WHERE gateId = ?', [(string)($p['gateId'] ?? '')]);
    return admin_cap_gate($p, $row ? GATE_KINDS[gate_kind_of($row['kind'])]['cap'] : 'summer');
}

/** A live link of the door kind — the only kind that checks people in. */
function gate_is_desk(string $gateId): bool {
    $g = gate_resolve($gateId);
    return $g !== null && gate_kind_of($g['kind'] ?? '') === 'desk';
}

function admin_gates_list(array $p): array {
    // A read: either desk may list, and sees only the kinds it owns.
    $g = admin_cap_gate_any($p, ['checkin', 'summer']); if (!$g['ok']) return $g;
    $have = member_effective_caps($g['requester']);
    $scope = (string)($p['scope'] ?? '');              // 'checkin' | 'summer' | '' (both)
    $kinds = array_keys(array_filter(GATE_KINDS, fn($k) => in_array($k['cap'], $have, true) && ($scope === '' || $k['cap'] === $scope)));
    if (!$kinds) return ['ok' => true, 'gates' => []];
    $ph = implode(',', array_fill(0, count($kinds), '?'));
    $kindSql = in_array('desk', $kinds, true) ? "(COALESCE(kind,'') IN ($ph) OR COALESCE(kind,'') = '')" : "kind IN ($ph)";
    $rows = db_all("SELECT gateId, kind, name, cohortId, centreId, status, createdBy, expiresAt, usedCount, createdAt, passHash, passSetAt, passRotateDays, passNotify, passExpiryDays, passExpiresAt FROM gate_links WHERE $kindSql ORDER BY id DESC LIMIT 50", $kinds);
    /* A scoped admin sees their centres' desks. A desk for every centre (no
       centreId) is not theirs to see or reset: it opens doors they do not run. */
    $scopeIds = admin_centre_ids_in_scope($g['requester']);
    if ($scopeIds !== null) $rows = array_values(array_filter($rows, static fn($r) => in_array((string)$r['centreId'], $scopeIds, true)));
    foreach ($rows as &$r) {
        $r['kind'] = gate_kind_of($r['kind'] ?? '');
        $r['path'] = gate_kind_path($r['kind']);
        $r['hasPassword'] = ($r['passHash'] ?? '') !== '';
        $due = gate_rotation_due_in($r);
        $r['rotateDays'] = (int)($r['passRotateDays'] ?? 0);
        $r['rotatesInDays'] = $due;                     // null when rotation is off
        $r['rotationDue'] = $due !== null && $due <= 0;
        $r['notifyEmail'] = (string)($r['passNotify'] ?? '');
        $exp = gate_expires_in_days($r);
        $r['expiresInDays'] = $exp;                     // null when it never expires
        $r['expired'] = $exp !== null && (string)$r['expiresAt'] < now_iso();
        $r['expiryDays'] = (int)($r['passExpiryDays'] ?? 0);
        $r['passExpiresInDays'] = gate_password_expires_in($r);
        $r['passExpired'] = $r['hasPassword'] && gate_password_expired($r);
        unset($r['passExpiryDays'], $r['passExpiresAt']);
        unset($r['passHash'], $r['passRotateDays'], $r['passNotify']);
    }
    unset($r);
    return ['ok' => true, 'gates' => $rows];
}

function admin_gates_create(array $p): array {
    $kind = gate_kind_of($p['kind'] ?? 'desk');
    $g = admin_cap_gate($p, GATE_KINDS[$kind]['cap']); if (!$g['ok']) return $g;
    $scopeIds = admin_centre_ids_in_scope($g['requester']);
    if ($scopeIds !== null && !in_array((string)($p['centreId'] ?? ''), $scopeIds, true)) {
        return ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'Choose one of your centres for this desk.'];
    }
    $c = summer_ensure_cohort();
    $gateId = 'GL-' . strtoupper(rand_hex(6));
    // Optional kiosk password: field staff without an admin login unlock the
    // desk with it (see gate_unlock). Stored as a bcrypt hash, never plaintext.
    $passHash = ''; $plain = '';
    $pw = (string)($p['password'] ?? '');
    // `generate` asks the server for one. Generating server-side keeps it off
    // the wire on the way in and out of a human's head — and a typed password
    // at a registration desk is almost always the centre's name.
    if ($pw === '' && !empty($p['generate'])) $pw = $plain = gate_password_new();
    if ($pw !== '') {
        if (strlen($pw) < 4) return ['ok' => false, 'error' => 'weak_password'];
        $passHash = password_hash($pw, PASSWORD_DEFAULT);
    }
    $expiresAt = gate_expiry_normalise($p['expiresAt'] ?? '', $p['validDays'] ?? null);
    if ($expiresAt === null) return ['ok' => false, 'error' => 'bad_expiry'];
    $rotate = max(0, min(365, (int)($p['rotateDays'] ?? 0)));
    $expiryDays = max(0, min(365, (int)($p['expiryDays'] ?? 0)));
    $notify = strtolower(trim((string)($p['notifyEmail'] ?? '')));
    if ($notify !== '' && !filter_var($notify, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    /* Three kinds of door, not one. `self` is the public registration link and
     * must never carry a password — a public link with one is just a desk link
     * somebody shared. `review` is where those submissions are checked, and it
     * has its own, so the volunteer who can scan cards at the gate cannot also
     * wave strangers into the programme. */
    if ($kind === 'self') { $passHash = ''; $plain = ''; }
    /* A review desk approves sign-ups and a registration desk enrols children:
       neither may be an open link. */
    if (($kind === 'review' || $kind === 'register') && $passHash === '') return ['ok' => false, 'error' => 'password_required'];
    db_insert('gate_links', [
        'gateId' => $gateId, 'kind' => $kind,
        'name' => substr(trim((string)($p['name'] ?? 'Front desk')), 0, 160),
        'cohortId' => $c['cohortId'], 'centreId' => (string)($p['centreId'] ?? ''), 'status' => 'active',
        'createdBy' => $g['requester']['memberId'], 'passHash' => $passHash,
        'passSetAt' => $passHash !== '' ? now_iso() : '',
        'passRotateDays' => $rotate, 'passNotify' => $notify,
        'passExpiryDays' => $expiryDays,
        'passExpiresAt' => ($passHash !== '' && $expiryDays > 0) ? gmdate('Y-m-d\TH:i:s\Z', time() + $expiryDays * 86400) : '',
        'expiresAt' => $expiresAt, 'createdAt' => now_iso(),
    ]);
    audit('gate.create', $g['requester']['memberId'], $gateId, ['kind' => $kind, 'kiosk' => $passHash !== '', 'rotateDays' => $rotate], (string)($p['ip'] ?? ''));
    // The plaintext is returned exactly once, here. Only the hash is stored,
    // so nothing can hand it back later — the panel has to show it now.
    $path = gate_kind_path($kind);
    return ['ok' => true, 'gateId' => $gateId, 'kind' => $kind, 'hasPassword' => $passHash !== '', 'password' => $plain,
            'url' => rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . $path . $gateId];
}

/** Set or clear a gate's kiosk password. Empty password removes it. */
function admin_gates_setpass(array $p): array {
    $g = admin_gate_for_link($p); if (!$g['ok']) return $g;
    $gateId = (string)($p['gateId'] ?? '');
    if (!db_row('SELECT gateId FROM gate_links WHERE gateId = ?', [$gateId])) return ['ok' => false, 'error' => 'not_found'];
    $pw = (string)($p['password'] ?? '');
    $plain = '';
    if ($pw === '' && !empty($p['generate'])) $pw = $plain = gate_password_new();
    if ($pw === '') {
        db_update('gate_links', ['passHash' => '', 'passSetAt' => ''], ['gateId' => $gateId]);
        audit('gate.password_cleared', $g['requester']['memberId'], $gateId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'hasPassword' => false];
    }
    if (strlen($pw) < 4) return ['ok' => false, 'error' => 'weak_password'];
    gate_password_store($gateId, $pw);
    audit('gate.password_set', $g['requester']['memberId'], $gateId, ['generated' => $plain !== ''], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'hasPassword' => true, 'password' => $plain];
}

/** Roll the desk password now and hand back the new one, once. */
function admin_gates_rotate(array $p): array {
    $g = admin_gate_for_link($p); if (!$g['ok']) return $g;
    $gateId = (string)($p['gateId'] ?? '');
    $gate = db_row('SELECT gateId, status FROM gate_links WHERE gateId = ?', [$gateId]);
    if (!$gate) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$gate['status'] !== 'active') return ['ok' => false, 'error' => 'not_active'];
    $pw = gate_password_new();
    gate_password_store($gateId, $pw);
    audit('gate.password_rotated', $g['requester']['memberId'], $gateId, ['by' => 'admin'], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'hasPassword' => true, 'password' => $pw];
}

/** How often this desk's password should roll, and who to tell when it does. */
function admin_gates_rotation(array $p): array {
    $g = admin_gate_for_link($p); if (!$g['ok']) return $g;
    $gateId = (string)($p['gateId'] ?? '');
    if (!db_row('SELECT gateId FROM gate_links WHERE gateId = ?', [$gateId])) return ['ok' => false, 'error' => 'not_found'];
    $days = max(0, min(365, (int)($p['rotateDays'] ?? 0)));
    $expiryDays = max(0, min(365, (int)($p['expiryDays'] ?? 0)));
    $notify = strtolower(trim((string)($p['notifyEmail'] ?? '')));
    if ($notify !== '' && !filter_var($notify, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    $fields = ['passRotateDays' => $days, 'passNotify' => $notify, 'passExpiryDays' => $expiryDays];
    // Changing the expiry re-dates the CURRENT password from when it was set,
    // so turning expiry on retires an old password instead of granting it a
    // fresh full term.
    $row = db_row('SELECT passHash, passSetAt FROM gate_links WHERE gateId = ?', [$gateId]);
    if (($row['passHash'] ?? '') !== '') {
        $from = strtotime((string)($row['passSetAt'] ?? '')) ?: time();
        $fields['passExpiresAt'] = $expiryDays > 0 ? gmdate('Y-m-d\TH:i:s\Z', $from + $expiryDays * 86400) : '';
    }
    db_update('gate_links', $fields, ['gateId' => $gateId]);
    audit('gate.rotation_set', $g['requester']['memberId'], $gateId, ['rotateDays' => $days, 'expiryDays' => $expiryDays, 'notify' => $notify !== ''], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'rotateDays' => $days, 'expiryDays' => $expiryDays, 'notifyEmail' => $notify];
}

/**
 * Scheduled rotation. Run from the daily job.
 *
 * A gate is only rolled unattended when it has somewhere to send the new
 * password. Rotating a desk with no notify address would lock out the very
 * people it exists for — a field team mid-session with no admin to hand — so
 * those are reported as due instead, and the panel shows the badge until an
 * admin rotates by hand. Silent lockout is a worse outcome than a password
 * that lived a few days longer.
 */
function gates_rotate_due(): array {
    $rotated = 0; $pending = 0; $failed = 0;
    $rows = db_all("SELECT * FROM gate_links WHERE status = 'active' AND passRotateDays > 0 AND passHash != ''");
    foreach ($rows as $gate) {
        $due = gate_rotation_due_in($gate);
        if ($due === null || $due > 0) continue;
        $to = trim((string)($gate['passNotify'] ?? ''));
        if ($to === '') { $pending++; continue; }
        $pw = gate_password_new();
        $name = (string)($gate['name'] ?? $gate['gateId']);
        $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
        $html = '<p>The desk password for <b>' . htmlspecialchars($name, ENT_QUOTES) . '</b> has rotated on schedule.</p>'
              . '<p style="font:700 22px ui-monospace,monospace;letter-spacing:2px">' . htmlspecialchars($pw, ENT_QUOTES) . '</p>'
              . '<p>Desk link: <a href="' . htmlspecialchars($origin . gate_kind_path($gate['kind'] ?? '') . $gate['gateId'], ENT_QUOTES) . '">' . htmlspecialchars($origin . gate_kind_path($gate['kind'] ?? '') . $gate['gateId'], ENT_QUOTES) . '</a></p>'
              . '<p>The previous password stopped working the moment this was sent. Rotation runs every '
              . (int)$gate['passRotateDays'] . ' days; change or switch it off in Admin → Gate links.</p>';
        $sent = send_mail($to, 'Desk password rotated — ' . $name, $html);
        if (!$sent) { $failed++; continue; }   // keep the old password working
        gate_password_store((string)$gate['gateId'], $pw);
        audit('gate.password_rotated', 'system', (string)$gate['gateId'], ['by' => 'schedule', 'notified' => $to], '');
        $rotated++;
    }
    return ['rotated' => $rotated, 'pending_manual' => $pending, 'send_failed' => $failed];
}

/** Set, extend or clear how long a link stays usable. */
function admin_gates_validity(array $p): array {
    $g = admin_gate_for_link($p); if (!$g['ok']) return $g;
    $gateId = (string)($p['gateId'] ?? '');
    if (!db_row('SELECT gateId FROM gate_links WHERE gateId = ?', [$gateId])) return ['ok' => false, 'error' => 'not_found'];
    $expiresAt = gate_expiry_normalise($p['expiresAt'] ?? '', $p['validDays'] ?? null);
    if ($expiresAt === null) return ['ok' => false, 'error' => 'bad_expiry'];
    db_update('gate_links', ['expiresAt' => $expiresAt], ['gateId' => $gateId]);
    audit('gate.validity_set', $g['requester']['memberId'], $gateId, ['expiresAt' => $expiresAt], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'expiresAt' => $expiresAt];
}

function admin_gates_revoke(array $p): array {
    $g = admin_gate_for_link($p); if (!$g['ok']) return $g;
    $n = db_update('gate_links', ['status' => 'revoked', 'revokedAt' => now_iso()], ['gateId' => (string)($p['gateId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('gate.revoke', $g['requester']['memberId'], (string)$p['gateId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * Permanently remove a link. Only a REVOKED link can be deleted — an active or
 * expired one is still a live credential and must be revoked first, so a single
 * click can never both cut off and erase a link that people are still using.
 * Revoke is the reversible, auditable step; delete is only ever tidying up
 * after it.
 */
function admin_gates_delete(array $p): array {
    $g = admin_gate_for_link($p); if (!$g['ok']) return $g;
    $gateId = (string)($p['gateId'] ?? '');
    $gate = db_row('SELECT gateId, status FROM gate_links WHERE gateId = ?', [$gateId]);
    if (!$gate) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$gate['status'] !== 'revoked') return ['ok' => false, 'error' => 'not_revoked'];
    db_exec('DELETE FROM gate_links WHERE gateId = ?', [$gateId]);
    audit('gate.delete', $g['requester']['memberId'], $gateId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * Verify a gate's kiosk password. On success the ROUTE mints a short-lived,
 * gate-scoped kiosk session (never an admin session) — see gate-unlock.php.
 * This lets field staff run the desk without an admin login while the gate
 * link itself remains the revocable credential.
 */
function gate_unlock(array $p): array {
    $gate = gate_resolve((string)($p['gate'] ?? ''));
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    if (($gate['passHash'] ?? '') === '') return ['ok' => false, 'error' => 'no_password'];
    // Checked BEFORE the password is compared: an expired password must not be
    // usable even by someone holding the correct one.
    if (gate_password_expired($gate)) {
        audit('gate.unlock_expired', 'kiosk', (string)$gate['gateId'], [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'password_expired'];
    }
    /* A ceiling counted against THIS GATE, not against whoever is knocking.
     * The IP bucket in front of this endpoint (gate.unlock, 8 per 5 minutes) is
     * the only thing that used to stand between a kiosk password and a script,
     * and an IP bucket can be shed by rotating a forwarded header. A centre's
     * check-in desk is worth more than that. */
    $gid = (string)$gate['gateId'];
    if (attempt_locked('gate.unlock', $gid)) {
        audit('gate.unlock_locked', 'kiosk', $gid, [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'too_many_attempts'];
    }
    $pw = (string)($p['password'] ?? '');
    if ($pw === '' || !password_verify($pw, (string)$gate['passHash'])) {
        // Ten, not eight: a busy desk mistypes, and locking a centre out of
        // its own check-in is itself a harm. Fifteen minutes either way.
        $locked = attempt_fail('gate.unlock', $gid, 10, 900);
        audit($locked ? 'gate.unlock_lockout' : 'gate.unlock_fail', 'kiosk', $gid, [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => $locked ? 'too_many_attempts' : 'bad_password'];
    }
    attempt_reset('gate.unlock', $gid);
    audit('gate.unlock', 'kiosk:' . $gate['gateId'], (string)$gate['gateId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'gate' => [
        'gateId' => (string)$gate['gateId'], 'name' => (string)$gate['name'],
        'cohortId' => (string)$gate['cohortId'], 'expiresAt' => (string)($gate['expiresAt'] ?? ''),
    ]];
}

/**
 * May THIS session operate THIS gate?
 *
 * Two doors, and only two: a staff account, or a kiosk session that was minted
 * by unlocking this exact gate with its own password. Everything else is a no,
 * including sessions that look reassuring — a signed-in parent, a mentor, a
 * volunteer or student holding an ID card, or a staffer who unlocked a
 * different gate in the same browser. None of those authorise a registration
 * desk, and the kiosk claim is compared against the gate in the request rather
 * than merely being present, so one desk's password never opens another's.
 *
 * Lifted out of api/public/gate.php so the decision can be tested. It was four
 * lines in a route file, which is exactly the sort of place a guard drifts
 * without anyone noticing.
 */
function gate_operator_ok(array $session, string $reqGate): bool {
    if (is_admin_role((string)($session['role'] ?? ''))) return true;
    if (strtolower((string)($session['role'] ?? '')) !== 'kiosk') return false;
    $bound = (string)($session['gate'] ?? '');
    if ($bound === '' || $reqGate === '') return false;
    return hash_equals($bound, $reqGate);
}

/** Resolve + validate a gate token (staff session is checked at the route). */
function gate_resolve(string $gateId): ?array {
    $gate = db_row("SELECT * FROM gate_links WHERE gateId = ? LIMIT 1", [$gateId]);
    if (!$gate || $gate['status'] !== 'active') return null;
    if (!empty($gate['expiresAt']) && $gate['expiresAt'] < now_iso()) return null;
    return $gate;
}

/* ── The gate: context, register, check-in ────────────────────────────────── */

function gate_context(array $p): array {
    $gate = gate_resolve((string)($p['gate'] ?? ''));
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    $live = form_live();
    $c = summer_current_cohort();
    // Public subset only — no sensitive flags leak ordering/keys beyond need.
    $fields = array_map(function ($f) {
        return array_intersect_key($f, array_flip(['key', 'label', 'type', 'required', 'options', 'help', 'placeholder', 'min', 'max', 'showIf', 'sensitive', 'optionsFrom']));
    }, $live['fields']);
    // Ship the whole faculty→courses map with the dependent field so the form
    // can narrow the list as soon as a faculty is picked, with no round trip
    // and no chance of the client's copy of the catalogue drifting from ours.
    foreach ($fields as &$__f) {
        if (!empty($__f['optionsFrom'])) $__f['optionsBy'] = academy_catalogue();
    }
    unset($__f);
    // Centres drive the 'centre' choice field + the card's ID prefix/color.
    $centres = centres_for_programme('summer', 'name, code');
    foreach ($fields as &$f) {
        if ($f['key'] === 'centre' && $centres) { $f['type'] = 'choice'; $f['options'] = array_column($centres, 'name'); }
    }
    unset($f);
    // Geo-fence context: when on, the client must capture a location and the
    // matching fenced centre is chosen automatically. We publish the fenced
    // centres (physical program sites) so the desk can resolve + map locally.
    $geo = null;
    if (geofence_enabled()) {
        $geo = ['enabled' => true, 'required' => true, 'centres' => array_map(fn($c) => [
            'code' => $c['code'], 'name' => $c['name'],
            'lat' => (float)$c['lat'], 'lng' => (float)$c['lng'], 'radiusM' => (int)($c['radiusM'] ?: 150),
        ], geo_fenced_centres())];
    }
    // Attendance-taker rotation: resolve this gate's centre name and today's
    // on-duty volunteer, so the kiosk can show the duty banner + close the roll.
    $centreName = (string)($gate['centreId'] ?? '');
    if ($centreName !== '') {
        $cc = db_row("SELECT name FROM centres WHERE name = ? OR code = ? LIMIT 1", [$centreName, $centreName]);
        if ($cc) $centreName = (string)$cc['name'];
    }
    $duty = ($centreName !== '' && function_exists('attendance_duty_for')) ? attendance_duty_for(gmdate('Y-m-d'), $centreName) : null;
    return ['ok' => true, 'gate' => ['name' => $gate['name'], 'cohortId' => $gate['cohortId']],
        'cohort' => $c ? ['cohortId' => $c['cohortId'], 'name' => $c['name']] : null,
        'form' => ['version' => (int)$live['version'], 'fields' => $fields],
        'geo' => $geo, 'centre' => $centreName, 'duty' => $duty,
        // When sign-out opens, per kind of person, so the desk can say so.
        'closing' => array_filter(['member' => attendance_close_time('member'), 'student' => attendance_close_time('student'),
                                   'volunteer' => attendance_close_time('volunteer')]),
        'consentTypes' => CONSENT_TYPES];
}

function gate_register(array $p): array {
    $gate = gate_resolve((string)($p['gate'] ?? ''));
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    /* A review desk checks registrations; it does not take them. Without this
     * the review link's password would also open a registration form, which
     * is the opposite of the reason it has its own password. */
    /* Nor does a check-in desk: the door checks people in, and registering a
     * child there was moved to its own Summer School link (`register`). The
     * public link registers only through the self-service path. */
    $gk = gate_kind_of($gate['kind'] ?? '');
    $selfServe0 = !empty($p['selfServe']);
    if ($gk === 'review' || $gk === 'desk' || ($gk === 'self' && !$selfServe0) || ($gk === 'register' && $selfServe0)) return ['ok' => false, 'error' => 'gate_invalid'];
    /* Self-service submissions run every one of the rules below — the fields,
     * the duplicate check, the id — and then stop short of telling anybody.
     * Nothing reaches a family until a human at the review desk has looked at
     * it, so the caller finishes the job rather than this one. */
    $selfServe = !empty($p['selfServe']);
    $live = form_live();

    // Capture the device location if the client sent one — recorded regardless
    // of the toggle, for the anti-cheat ledger.
    $regLat = (isset($p['lat']) && is_numeric($p['lat'])) ? (float)$p['lat'] : null;
    $regLng = (isset($p['lng']) && is_numeric($p['lng'])) ? (float)$p['lng'] : null;
    $regGeoOk = null; $regGeoDist = null;
    $incoming = is_array($p['data'] ?? null) ? $p['data'] : [];

    /* Accept a legacy single-name submission.
     *
     * The form now asks for First and Last, and both are required — so a
     * client still running the previous bundle (a kiosk tab left open across
     * a deploy, a cached page on a slow connection) would post `fullName` and
     * be told two required fields are missing, with no way for the operator
     * to supply them. Split it here instead. A parent standing at a desk must
     * not lose their registration to our deploy timing.
     *
     * Same split the ID card used before the parts were collected: first word
     * and last word, middle names dropped. */
    if (trim((string)($incoming['firstName'] ?? '')) === '' && trim((string)($incoming['lastName'] ?? '')) === ''
        && trim((string)($incoming['fullName'] ?? '')) !== '') {
        $parts = preg_split('/\s+/', trim((string)$incoming['fullName'])) ?: [];
        $incoming['firstName'] = (string)array_shift($parts);
        $incoming['lastName'] = $parts ? (string)array_pop($parts) : $incoming['firstName'];
    }

    // Geo-fence: the centre is derived from real location, not the operator's
    // claim, so a walk-up can't be booked at a centre they're not at. Only a
    // full admin may override a missing/out-of-fence location — kiosk operators
    // cannot. A matching fence AUTO-SELECTS its centre.
    $geoEnforced = geofence_enabled();
    $canOverride = !empty($p['isAdmin']) && !empty($p['geoOverride']);
    if ($geoEnforced) {
        if ($regLat === null || $regLng === null) {
            if (!$canOverride) return ['ok' => false, 'error' => 'geo_unavailable'];
        } else {
            $m = geo_match_centre($regLat, $regLng);
            if ($m === null) {
                $regGeoOk = null; // toggle on but no centre mapped yet — don't hard-block
            } elseif ($m['inFence']) {
                $regGeoOk = 1; $regGeoDist = $m['distanceM'];
                $incoming['centre'] = (string)$m['centre']['name']; // authoritative
            } else {
                $regGeoOk = 0; $regGeoDist = $m['distanceM'];
                if (!$canOverride) return ['ok' => false, 'error' => 'geo_out_of_fence',
                    'nearest' => ['name' => (string)$m['centre']['name'], 'distanceM' => $m['distanceM'], 'radiusM' => (int)($m['centre']['radiusM'] ?: 150)]];
            }
        }
    }

    // The centre choice is driven by the centres table (same source the gate
    // context serves). When the fence is on it assigns the centre, so we don't
    // force the field on the operator.
    $fields = $live['fields'];
    $centreNames = centre_names_for_programme('summer');
    foreach ($fields as &$f) {
        if ($f['key'] === 'centre') {
            if ($centreNames) { $f['type'] = 'choice'; $f['options'] = $centreNames; }
            if ($geoEnforced) $f['required'] = false;
        }
    }
    unset($f);
    $v = form_validate_submission($fields, $incoming);
    if (empty($v['ok'])) return $v;
    $d = $v['data'];

    /* Compose the legacy full name from the two parts.
     *
     * Registration now asks for First and Last separately, but `fullName` is
     * what search, the duplicate guard, the handle slug and every existing row
     * are built on, so it stays authoritative and is derived here rather than
     * being asked for twice. A submission from an older cached client that
     * still posts `fullName` keeps working — it just does not get the exact
     * parts, which is the pre-existing behaviour rather than a regression. */
    $first = trim((string)($d['firstName'] ?? ''));
    $last  = trim((string)($d['lastName'] ?? ''));
    if ($first !== '' || $last !== '') {
        $d['fullName'] = trim($first . ' ' . $last);
    } else {
        $legacy = preg_split('/\s+/', trim((string)($d['fullName'] ?? ''))) ?: [];
        $first = (string)array_shift($legacy);
        $last  = $legacy ? (string)array_pop($legacy) : '';
    }
    if (trim((string)($d['fullName'] ?? '')) === '') {
        return ['ok' => false, 'errors' => ['firstName' => 'A first and last name are both required.']];
    }

    // Parent reachability is the verification lifeline: at least one channel.
    $pPhone = sms_normalize((string)($d['parentPhone'] ?? ''));
    $pEmail = (string)($d['parentEmail'] ?? '');
    if ($pPhone === '' && $pEmail === '') return ['ok' => false, 'errors' => ['parentPhone' => 'Add a parent phone or email — we need one to get consent.']];

    // A headshot is required by default (same gate as the public apply forms) —
    // the ID card and roster depend on it. Admin can relax via intake_photo_required.
    if (intake_photo_required() && trim((string)($p['photoUrl'] ?? '')) === '') {
        return ['ok' => false, 'error' => 'photo_required'];
    }

    // Duplicate guard: same child name + same parent contact in this cohort.
    $c = summer_ensure_cohort();
    if (empty($p['force'])) {
        $dupe = db_row("SELECT studentId, fullName, track, regStatus FROM summer_students WHERE cohortId = ? AND lower(fullName) = ? AND (parentEmail = ? AND parentEmail != '' OR guardianPhone = ? AND guardianPhone != '') LIMIT 1",
            [$c['cohortId'], strtolower((string)$d['fullName']), $pEmail, $pPhone]);
        if ($dupe) return ['ok' => false, 'error' => 'duplicate_suspect', 'existing' => $dupe];
    }

    // Create the student in 'parent_pending' — no QR/ID until consent.
    $n = (int)(db_row('SELECT COUNT(*) c FROM summer_students WHERE cohortId = ?', [$c['cohortId']])['c'] ?? 0) + 1;
    $studentId = $c['cohortId'] . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
    if (db_row('SELECT id FROM summer_students WHERE studentId = ?', [$studentId])) $studentId .= '-' . strtolower(rand_hex(2));
    $base = summer_slug((string)$d['fullName']) ?: 'student';
    $handle = $base . '-' . strtolower(rand_hex(2));
    $vtoken = 'VR' . rand_hex(16);

    // Sensitive answers stay in formData; never in events or the mirror.
    $sensitiveKeys = array_column(array_filter($live['fields'], fn($f) => !empty($f['sensitive'])), 'key');

    db_insert('summer_students', [
        'studentId' => $studentId, 'cohortId' => $c['cohortId'], 'token' => '', 'handle' => $handle,
        'fullName' => (string)$d['fullName'],
        'firstName' => substr($first, 0, 120), 'lastName' => substr($last, 0, 120),
        /* Age DERIVED from the date of birth, never taken from the payload.
         * A client-supplied age could disagree with the date it was supposedly
         * computed from, and every age band downstream would then depend on
         * which of the two a given query happened to read. `dob` is the fact;
         * `age` is a cache of it kept because a dozen readers want it. */
        'dob' => (string)($d['dob'] ?? ''),
        'age' => (string)($d['dob'] ?? '') !== '' ? max(0, dob_age((string)$d['dob'])) : (int)($d['age'] ?? 0),
        /* Normalised on the way in, never on the way out. A column holding "M",
           "male" and "Male " is three spellings of one number, and the report
           that has to reconcile them is written the night before a deadline. */
        'sex' => sex_normalise($d['sex'] ?? ''),
        /* The class, as a number, WITH the day it was true. A grade recorded
           and then read three years later is a false statement about
           eligibility, not a stale one. */
        'gradeLevel' => grade_normalise($d['grade'] ?? ''),
        'gradeAsAt' => grade_normalise($d['grade'] ?? '') > 0 ? gmdate('Y-m-d') : '',
        'centre' => substr((string)($d['centre'] ?? ''), 0, 48), 'track' => substr((string)($d['course'] ?? ''), 0, 64),
        /* A URL, never an image. The staff desk uploads to Cloudinary first and
         * passes a short hosted URL; the PUBLIC sign-up form posts the headshot
         * inline as a base64 data: URL, which is tens of thousands of characters
         * and does not belong in a VARCHAR(512).
         *
         * SQLite does not enforce column lengths, so it silently stored the
         * whole data URL and everything appeared to work. MySQL runs in
         * STRICT_ALL_TABLES (see db_conn) and rejects it outright — 1406 Data
         * too long — which means every public self-registration failed on
         * production and passed in every test. The photo pipeline below is what
         * turns the data URL into a hosted one; it writes the real value back. */
        'photoUrl' => preg_match('#^data:#i', (string)($p['photoUrl'] ?? '')) ? '' : substr((string)($p['photoUrl'] ?? ''), 0, 512),
        'guardianName' => substr((string)($d['parentName'] ?? ''), 0, 255),
        'guardianPhone' => $pPhone, 'parentEmail' => $pEmail,
        'status' => 'active', 'regStatus' => 'parent_pending',
        'verifyToken' => $vtoken, 'verifyExpiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + 7 * 86400),
        'formVersion' => (int)$live['version'], 'formData' => json_encode($d, JSON_UNESCAPED_SLASHES),
        'regLat' => $regLat, 'regLng' => $regLng, 'regGeoOk' => $regGeoOk, 'regGeoDist' => $regGeoDist,
        'notes' => '', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_exec('UPDATE gate_links SET usedCount = usedCount + 1 WHERE gateId = ?', [$gate['gateId']]);
    audit('registration.create', (string)($p['byId'] ?? ''), $studentId, ['gate' => $gate['gateId'], 'geoOk' => $regGeoOk], (string)($p['ip'] ?? ''));

    /* Photo. Two steps, and the ORDER is the whole point.
     *
     * First the bytes are put somewhere they can be served from. The public
     * self-registration form posts its headshot inline, as a data: URL, because
     * it has no session and cannot use the signed upload path — and a data URL
     * cannot go in this column (VARCHAR(512), and MySQL is strict). It used to
     * be handed straight to photo_ingest, which refuses anything that is not
     * https, so on a deployment without Cloudinary — which is every deployment
     * until somebody sets three keys — the bytes were dropped. The registration
     * succeeded and the reviewer got an empty frame for the one thing the review
     * desk exists to look at. photo_store_put keeps the original and gives back
     * a short, stable URL that works with no cloud account at all.
     *
     * Then the governed pipeline runs on top of it — AI triage, the
     * identity-safe Cloudinary edit, the editor queue — fed the ABSOLUTE url,
     * because both the model and Cloudinary have to fetch the image. When that
     * path completes, photo_apply_to_subject replaces photoUrl with the edited
     * hosted version. Local first, hosted when there is a host: at no point is
     * there no photo.
     *
     * Best-effort throughout. A pipeline hiccup must never fail a registration.
     */
    $photoUrl = function_exists('photo_intake_url')
        ? photo_intake_url((string)($p['photoUrl'] ?? ''))
        : '';
    // The insert above deliberately left this column empty when the client sent
    // the image inline (a data: URL will not fit a VARCHAR(512)); now that the
    // bytes are stored there is a short URL to put in it.
    if ($photoUrl !== '') db_update('summer_students', ['photoUrl' => $photoUrl], ['studentId' => $studentId]);
    if ($photoUrl !== '' && function_exists('photo_ingest')) {
        try {
            // photo_ingest needs a URL an outside service can GET. A relative
            // one is ours to expand; anything already absolute passes through.
            $source = function_exists('photo_store_absolute') ? photo_store_absolute($photoUrl) : $photoUrl;
            $ing = $source !== '' ? photo_ingest('student', $studentId, $source, (string)($p['byId'] ?? '')) : ['ok' => false];
            if (!empty($ing['ok']) && function_exists('photo_process')) photo_process($ing['assetId']);
        } catch (Throwable $e) { error_log('[gate_register] photo pipeline: ' . $e->getMessage()); }
    }

    /* Off the critical path. The row is committed and the registration is
     * complete; telling the parent is a separate, slow, failure-prone errand
     * (SMS 15s x two providers, then SMTP 15s) and the desk must not be held
     * open for it — still less have a working registration reported to them as
     * a failure because the request outlived max_execution_time.
     *
     * What we can promise honestly is which channels we HAVE a contact for.
     * The outcome is recorded on the student (remindedAt) and the parent link
     * can be re-sent from the roster if a provider was down. */
    $willSend = [];
    if ($pEmail !== '') $willSend[] = 'email';
    if ($pPhone !== '' && function_exists('sms_enabled') && sms_enabled()) $willSend[] = 'sms';
    if ($selfServe) {
        // Deliberately nothing sent and nothing announced as a registration:
        // an unreviewed submission that could email a family is a way for
        // anyone holding the public link to send mail in the programme's name.
        event_emit('registration.submitted', [
            'ref' => $studentId, 'name' => (string)$d['fullName'], 'course' => (string)($d['course'] ?? ''),
            'centre' => (string)($d['centre'] ?? ''), 'status' => 'self_pending', 'gate' => (string)$gate['name'],
        ]);
        return ['ok' => true, 'ref' => $studentId, 'studentId' => $studentId, 'regStatus' => 'self_pending',
            'verificationSending' => [], 'centre' => (string)($d['centre'] ?? ''), 'geo' => null];
    }
    after_response('registration.verify', function () use ($studentId) {
        registration_send_verification($studentId);
    });

    event_emit('registration.created', [
        'ref' => $studentId, 'name' => (string)$d['fullName'], 'course' => (string)($d['course'] ?? ''),
        'parentContact' => $pEmail !== '' ? mask_email($pEmail) : substr($pPhone, 0, 7) . '•••',
        'status' => 'parent_pending', 'gate' => (string)$gate['name'],
    ]);
    return ['ok' => true, 'ref' => $studentId, 'studentId' => $studentId, 'regStatus' => 'parent_pending',
        'verificationSending' => $willSend, 'centre' => (string)($d['centre'] ?? ''),
        'geo' => $geoEnforced ? ['ok' => $regGeoOk, 'distanceM' => $regGeoDist, 'autoCentre' => $regGeoOk === 1 ? (string)($d['centre'] ?? '') : null] : null];
}

/** Send (or resend) the parent verification link. Returns channels used. */
function registration_send_verification(string $studentId): array {
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s || empty($s['verifyToken'])) return [];
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/verify?t=' . $s['verifyToken'];
    $first = explode(' ', (string)$s['fullName'])[0] ?: 'your child';
    $channels = [];
    if (!empty($s['parentEmail'])) {
        /* The consents, spelled out in the email itself.
         *
         * This said only "we need your consent" and put everything behind a
         * link. A parent deciding whether to click an unfamiliar link about
         * their child could not see what they were being asked to agree to
         * until after they had clicked it — and the ones who did not click
         * are exactly the registrations that stall. Naming the permissions
         * here also means the email is a record of what was asked, which a
         * link that can be edited later is not.
         *
         * Which ones are optional is stated too: refusing to have a child
         * photographed must visibly not cost them their place, or the consent
         * is not freely given and therefore worth nothing. */
        $rows = '';
        foreach (CONSENT_TYPES as $ct) {
            $need = ((int)$ct['p']) === 0
                ? '<span style="color:#8a6d00;font-weight:700">required</span>'
                : '<span style="color:#4a5578">optional</span>';
            $rows .= '<tr><td style="padding:5px 10px 5px 0;font-size:14px;color:#1b2340">'
                  . esc_html((string)$ct['label']) . '</td>'
                  . '<td style="padding:5px 0;font-size:12px;white-space:nowrap">' . $need . '</td></tr>';
        }
        $body = '<p style="margin:0 0 10px"><b>Why you got this:</b> we need your consent before the registration is complete. '
              . 'It takes about a minute, and you can also tell us anything we should know.</p>'
              . '<p style="margin:0 0 6px;font-size:14px"><b>What you will be asked:</b></p>'
              . '<table role="presentation" style="border-collapse:collapse;margin:0 0 10px">' . $rows . '</table>'
              . '<p style="margin:0 0 10px;font-size:13px;color:#4a5578">The optional ones are genuinely optional — saying no to photographs '
              . 'or to appearing on our website does not affect ' . esc_html($first) . "'s place.</p>";
        $html = email_template([
            'title' => 'Confirm ' . esc_html($first) . "'s registration",
            'intro' => 'Hello' . (!empty($s['guardianName']) ? ' ' . esc_html((string)$s['guardianName']) : '') . ' — ' . esc_html((string)$s['fullName']) . ' was registered for NGG Summer School.',
            'bodyHtml' => $body,
            'ctaLabel' => 'Review & consent →', 'ctaUrl' => $url,
        ]);
        if (send_mail((string)$s['parentEmail'], "Confirm {$first}'s NGG Summer School registration", $html)) $channels[] = 'email';
    }
    if (!empty($s['guardianPhone']) && sms_enabled()) {
        $r = sms_send((string)$s['guardianPhone'], "NGG Summer School: {$first} was registered today. Please confirm and give consent here: {$url}");
        if (!empty($r['ok'])) $channels[] = 'sms';
    }
    if ($channels) db_update('summer_students', ['remindedAt' => now_iso()], ['studentId' => $studentId]);
    return $channels;
}

/* ── Parent verification (public, token-authenticated) ────────────────────── */

/** The centre's parent/guardian group link, if the centre has set one.
 *
 * Reuses the centre's existing `whatsappUrl` rather than adding a second
 * "group link" column beside it. Two fields meaning the same thing is how an
 * admin ends up filling in one and wondering why the other screen is empty —
 * and this one is already validated to https on save and already surfaced on
 * the centre page and event confirmations. */
function centre_parent_group(string $centre): array {
    $centre = trim($centre);
    if ($centre === '') return [];
    $c = db_row("SELECT name, whatsappUrl FROM centres WHERE name = ? OR code = ? LIMIT 1", [$centre, $centre]);
    $url = trim((string)($c['whatsappUrl'] ?? ''));
    // Belt-and-braces on read as well as on save: this lands in an href on a
    // page a parent opens from a text message.
    if ($url === '' || !preg_match('#^https://#i', $url)) return [];
    return ['url' => $url, 'centre' => (string)($c['name'] ?? $centre)];
}

function parent_verify_context(array $p): array {
    $s = db_row('SELECT * FROM summer_students WHERE verifyToken = ? LIMIT 1', [(string)($p['t'] ?? '')]);
    if (!$s) return ['ok' => false, 'error' => 'link_invalid'];
    // The group link is useful on the already-done screen too — a parent who
    // reopens the link later is exactly someone looking for it.
    if ((string)$s['regStatus'] === 'verified') return ['ok' => true, 'done' => true,
        'student' => ['name' => $s['fullName']], 'parentGroup' => centre_parent_group((string)($s['centre'] ?? ''))];
    if (!empty($s['verifyExpiresAt']) && $s['verifyExpiresAt'] < now_iso()) return ['ok' => false, 'error' => 'link_expired'];
    return ['ok' => true, 'done' => false,
        'student' => ['name' => (string)$s['fullName'], 'course' => (string)$s['track'], 'photoUrl' => (string)$s['photoUrl']],
        'guardianName' => (string)$s['guardianName'],
        'parentGroup' => centre_parent_group((string)($s['centre'] ?? '')),
        'consentTypes' => CONSENT_TYPES];
}

function parent_verify_submit(array $p): array {
    $s = db_row('SELECT * FROM summer_students WHERE verifyToken = ? LIMIT 1', [(string)($p['t'] ?? '')]);
    if (!$s) return ['ok' => false, 'error' => 'link_invalid'];
    if ((string)$s['regStatus'] === 'verified') return ['ok' => true, 'already' => true];
    if (!empty($s['verifyExpiresAt']) && $s['verifyExpiresAt'] < now_iso()) return ['ok' => false, 'error' => 'link_expired'];

    $consents = is_array($p['consents'] ?? null) ? $p['consents'] : [];
    // Every P0 consent must be explicitly granted — no defaults, no silence.
    foreach (CONSENT_TYPES as $type => $meta) {
        if ($meta['p'] === 0 && empty($consents[$type])) {
            return ['ok' => false, 'error' => 'consent_required', 'missing' => $type];
        }
    }
    /* And the must-answer ones need a decision either way. Previously an
     * unticked box was indistinguishable from an unread one — both landed as
     * 'declined' — so a parent who never noticed the photography clause was
     * recorded as having refused it. Requiring the key to be PRESENT makes
     * "no" a choice the parent made rather than one made by their scrolling. */
    foreach (CONSENT_TYPES as $type => $meta) {
        if (!empty($meta['mustAnswer']) && !array_key_exists($type, $consents)) {
            return ['ok' => false, 'error' => 'consent_answer_required', 'missing' => $type];
        }
    }
    $actor = substr(trim((string)($p['actorName'] ?? $s['guardianName'] ?? '')), 0, 160);

    /* The signature the parent drew, if the form captured one.
     *
     * Accepted only as an inline PNG data URI produced by the signature pad.
     * A remote URL would let a submission point the consent record at any
     * image on the internet — including one that changes after the fact,
     * which is precisely what a signature must not do. Bounded because this
     * is written straight into the row: a generous pad drawing is well under
     * 100KB and anything larger is not a signature. */
    $sig = (string)($p['signature'] ?? '');
    if ($sig !== '' && (!preg_match('#^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$#', $sig) || strlen($sig) > 400000)) {
        $sig = '';
    }

    foreach (CONSENT_TYPES as $type => $meta) {
        db_insert('consents', ['studentId' => $s['studentId'], 'type' => $type,
            'status' => !empty($consents[$type]) ? 'granted' : 'declined',
            'method' => 'parent_link', 'actorName' => $actor,
            'signatureUrl' => $sig, 'createdAt' => now_iso()]);
    }

    // Consent recorded → mark verified. ID/QR issuance may still be gated on
    // photo approval (see registration_issue_id); whichever finishes last —
    // consent here or the editor approving the photo — triggers the ID.
    db_update('summer_students', ['regStatus' => 'verified', 'verifiedAt' => now_iso(), 'updatedAt' => now_iso()]
        + ($sig !== '' ? ['consentSignatureUrl' => $sig, 'consentSignedName' => $actor, 'consentSignedAt' => now_iso()] : []),
        ['studentId' => $s['studentId']]);
    $issue = registration_issue_id($s['studentId']);

    $feedback = substr(trim((string)($p['feedback'] ?? '')), 0, 1000);
    audit('registration.verified', null, $s['studentId'], ['feedback' => $feedback !== '', 'idHeld' => !empty($issue['held'])], '');
    event_emit('registration.verified', ['ref' => $s['studentId'], 'name' => (string)$s['fullName'], 'course' => (string)$s['track'], 'status' => 'verified', 'feedback' => $feedback]);
    return ['ok' => true, 'student' => ['name' => (string)$s['fullName']],
        'idIssued' => !empty($issue['issued']) || !empty($issue['already']),
        'photoPending' => !empty($issue['held']) && ($issue['reason'] ?? '') === 'photo_pending'];
}

/**
 * Bind a student's ID card + attendance QR — the single issuance gate. Requires
 * (a) parent consent recorded (regStatus 'verified') and (b) when the optional
 * 'photo_gate_issuance' setting is on and a photo is in the pipeline, an
 * APPROVED photo. Idempotent: no-ops once a token is bound. Safe to call from
 * both the consent flow and the photo-approval hook — the last one to satisfy
 * the gate issues the ID.
 */
/**
 * Why this student has no ID — '' when nothing is stopping one being issued.
 *
 * The gate's conditions, asked WITHOUT performing the write, so a screen can say
 * "nine children are ready, two are held on a photo" before anybody presses
 * anything. Extracted from registration_issue_id rather than restated, because a
 * second copy of these conditions is how a screen ends up promising an outcome
 * the writer then refuses.
 */
function registration_issue_reason(string $studentId): string {
    $s = db_row('SELECT regStatus, token FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return 'not_found';
    if (!empty($s['token'])) return 'already';
    if ((string)$s['regStatus'] !== 'verified') return 'consent_pending';
    // Photo gate: only holds when the toggle is on AND a photo is actually in the
    // pipeline for this student — a registration with no photo is never blocked,
    // and a REJECTED one counts as no photo (see photo_retry_issuance).
    if (setting_raw('photo_gate_issuance') === '1' && function_exists('photo_approved_for')) {
        $hasPhoto = db_row("SELECT id FROM photo_assets WHERE subjectType = 'student' AND subjectId = ? AND status NOT IN ('rejected','superseded') LIMIT 1", [$studentId]);
        if ($hasPhoto && !photo_approved_for('student', $studentId)) return 'photo_pending';
    }
    return '';
}

function registration_issue_id(string $studentId): array {
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($s['token'])) return ['ok' => true, 'already' => true, 'token' => (string)$s['token']];
    $why = registration_issue_reason($studentId);
    if ($why !== '') return ['ok' => true, 'held' => true, 'reason' => $why];
    // Bind the ID/QR (mint a blank if the pool is dry).
    $qr = db_row("SELECT * FROM qr_codes WHERE status = 'blank' ORDER BY id ASC LIMIT 1");
    if (!$qr) {
        $tok = 'SUMQR-' . strtoupper(rand_hex(4));
        db_insert('qr_codes', ['token' => $tok, 'batch' => 'AUTO', 'cohortId' => $s['cohortId'], 'status' => 'blank', 'studentId' => '', 'assignedName' => '', 'createdAt' => now_iso(), 'assignedAt' => '']);
        $qr = db_row('SELECT * FROM qr_codes WHERE token = ?', [$tok]);
    }
    db_update('qr_codes', ['status' => 'assigned', 'studentId' => $s['studentId'], 'assignedName' => (string)$s['handle'], 'assignedAt' => now_iso(), 'expiresAt' => summer_edition_card_expiry((string)$s['cohortId']), 'cohortId' => $s['cohortId']], ['token' => $qr['token']]);
    db_update('summer_students', ['token' => $qr['token'], 'updatedAt' => now_iso()], ['studentId' => $s['studentId']]);
    card_display_id(db_row('SELECT * FROM summer_students WHERE studentId = ?', [$s['studentId']]) ?: $s);
    audit('registration.id_issued', null, $studentId, ['token' => $qr['token']], '');
    event_emit('registration.id_issued', ['ref' => $studentId, 'name' => (string)$s['fullName'], 'token' => (string)$qr['token']]);
    /* THE ID GOES OUT WHEN THE ID IS ISSUED.
     *
     * This used to be the caller's job, and three of the five callers did it. The
     * two that did not were the parent-consent link — the path most families
     * actually take — and the photo-hold release, so a parent could click the
     * link, have the child verified, have a QR bound to their name, and never
     * receive it. The desk had no idea: the roster showed a token, so it looked
     * done.
     *
     * Moving the send here makes "issued" and "sent" the same event by
     * construction. This is the single gate every path funnels through, and it
     * only reaches this line on the branch that actually binds a token — an
     * already-issued student returns earlier, so pressing anything twice cannot
     * mail a family twice.
     *
     * Deferred past the response: a parent submitting consent must not wait on
     * SMTP, and a coordinator clearing a queue of two hundred must not either. */
    $issuedToken = (string)$qr['token'];
    if (function_exists('after_response')) {
        after_response('registration.issueId.send', function () use ($studentId) {
            try { student_send_id($studentId); } catch (\Throwable $e) { error_log('[issueId.send] ' . $studentId . ': ' . $e->getMessage()); }
        });
    } else {
        try { student_send_id($studentId); } catch (\Throwable $e) { error_log('[issueId.send] ' . $studentId . ': ' . $e->getMessage()); }
    }
    return ['ok' => true, 'issued' => true, 'token' => $issuedToken, 'sending' => true];
}

/* ── Emailable QR image cache ────────────────────────────────────────────────
 * Reliable in-email QR needs a hosted PNG (mail clients strip data: URIs), so
 * the browser (which already renders the card QR) hands us a PNG we cache and
 * serve from api/public/qr.php. Stored under the persistent storage dir (not
 * _cache, which is swept) so an already-sent email keeps rendering its QR. */
function qr_cache_dir(): string {
    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    $dir = ($base !== '' ? dirname($base) : (__DIR__ . '/../../storage')) . '/qr';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}
function qr_cache_path(string $token): string { return qr_cache_dir() . '/' . sha1($token) . '.png'; }
function qr_cache_exists(string $token): bool { return $token !== '' && is_file(qr_cache_path($token)); }

/**
 * Make sure a hosted QR exists for this token, encoding one if it does not.
 *
 * This is what turned the ID email from "a link, and a QR if somebody happened to
 * open the card studio first" into "a QR". The browser-rendered cache is still
 * used when it is there — it is the same code, and re-encoding 300 tokens on a
 * shared host to produce identical bytes is waste — but a miss is no longer a
 * missing QR, it is one encode.
 */
function qr_ensure_cached(string $token): bool {
    if ($token === '') return false;
    if (qr_cache_exists($token)) return true;
    $png = qr_encode_png(qr_payload_for($token), 8);
    if ($png === '') return false;
    $path = qr_cache_path($token);
    // Written via a temp file: a half-written PNG served to a mail client is a
    // broken image in an email nobody can re-send from.
    $tmp = $path . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $png) === false) return false;
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    return true;
}

/** What a token's QR encodes: the profile URL, not the bare token — so an
 *  ordinary phone camera opens the child's page, and the kiosk decoder pulls the
 *  token back out. Must match CardQR in the client exactly. */
function qr_payload_for(string $token): string {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    return $origin . '/q/' . $token;
}
/** Persist a client-rendered QR PNG (a data: URL). Validates it's a real,
 *  reasonably-sized PNG before writing — never trust the bytes blindly. */
function qr_cache_store(string $token, string $dataUrl): bool {
    if ($token === '' || strpos($dataUrl, 'data:image/png;base64,') !== 0) return false;
    $bytes = base64_decode(substr($dataUrl, strlen('data:image/png;base64,')), true);
    if ($bytes === false || strlen($bytes) < 60 || strlen($bytes) > 262144) return false;
    if (substr($bytes, 0, 8) !== "\x89PNG\r\n\x1a\n") return false; // PNG magic
    return @file_put_contents(qr_cache_path($token), $bytes) !== false;
}
/** The public URL the email uses for a token's QR (served by api/public/qr.php). */
function qr_public_url(string $token): string {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    return $origin . '/api/public/qr.php?t=' . rawurlencode($token);
}

/** Deliver (or re-deliver) a student's Genius ID to the guardian — email
 *  always when on file, SMS when SMS is configured. Idempotent + side-effect
 *  free beyond the messages, so it is safe for an admin to press again. */
function student_send_id(string $studentId): array {
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (empty($s['token'])) return ['ok' => false, 'error' => 'no_id']; // ID not issued yet
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $url = $origin . '/q/' . rawurlencode((string)$s['token']);
    $firstRaw = explode(' ', trim((string)$s['fullName']))[0] ?: 'your child';
    $first = esc_html($firstRaw);
    $displayId = card_display_id($s);
    $channels = [];
    $email = trim((string)($s['parentEmail'] ?? ''));
    if (function_exists('email_template') && function_exists('send_mail') && $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        /* The QR is ALWAYS referenced now, and it is always an image.
         *
         * This used to be conditional on a hosted file existing at send time, so a
         * family whose PNG had not been cached got a message with no code in it and
         * no way to tell. Two things changed: the file is encoded here if it is
         * missing, and api/public/qr.php encodes on demand as well — so the URL
         * resolves even for messages sent before any of this existed, and even if
         * the storage directory is later cleared.
         *
         * That makes the conditional the wrong shape: withholding the <img> to
         * avoid a broken image is only correct while the URL can 404, and it no
         * longer can. */
        qr_ensure_cached((string)$s['token']);
        $qrHtml = '<div style="text-align:center;margin:6px 0 14px"><img src="' . esc_html(qr_public_url((string)$s['token'])) . '" width="180" height="180" alt="Check-in QR for ' . $first . '" style="width:180px;height:180px;border:1px solid #e4e4e4;border-radius:12px;padding:8px;background:#fff"/><div style="font:400 12px monospace;color:#888;margin-top:6px">Scan at any centre to check in</div></div>';
        $html = email_template([
            'title' => $first . "'s Genius ID",
            'intro' => 'Hello' . (!empty($s['guardianName']) ? ' ' . esc_html((string)$s['guardianName']) : '') . " — here is {$first}'s Next Generation Genius ID.",
            'bodyHtml' => '<p style="margin:0 0 10px"><b>Student ID:</b> ' . esc_html($displayId) . '</p>'
                . $qrHtml
                . '<p style="margin:0 0 10px">The QR above (and the button below) open ' . $first . "'s digital ID and attendance profile — the same code printed on the card. Show either at any centre to check in.</p>",
            'ctaLabel' => "Open {$first}'s ID →", 'ctaUrl' => $url,
            'footNote' => "You are receiving this because you are {$firstRaw}'s guardian at Next Generation Genius.",
        ]);
        if (send_mail($email, "{$firstRaw}'s NGG Genius ID", $html)) $channels[] = 'email';
    }
    $phone = trim((string)($s['guardianPhone'] ?? ''));
    if ($phone !== '' && function_exists('sms_enabled') && sms_enabled()) {
        $r = sms_send($phone, "NGG: {$firstRaw}'s Genius ID ({$displayId}). Digital ID: {$url}");
        if (!empty($r['ok'])) $channels[] = 'sms';
    }
    return ['ok' => true, 'channels' => $channels, 'url' => $url, 'displayId' => $displayId];
}

/**
 * Cache QR images for a batch of tokens.
 *
 * The reason this exists is unglamorous and decides whether the automatic ID
 * email carries a scannable code or just a link. Mail clients strip `data:` URIs,
 * so an in-email QR has to be a hosted PNG — and there is no QR encoder on the
 * server, only the vendored one the browser already uses to draw the cards. A
 * resend has a browser to render one; an ID issued at 2am when a parent clicks a
 * consent link does not.
 *
 * So the card studio, which has just rendered every token's QR on screen anyway,
 * hands them over. After one visit every token in the cohort has a hosted image,
 * and every ID mailed from then on embeds it. Cheap, and it fixes the case that
 * has no browser in it by borrowing one from earlier.
 *
 * Only tokens that belong to a real record are accepted, and the PNG bytes are
 * validated (magic number, size bounds) before anything is written.
 */
function admin_qr_cache_warm(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $items = is_array($p['items'] ?? null) ? $p['items'] : [];
    if (!$items) return ['ok' => false, 'error' => 'no_items'];
    if (count($items) > 600) return ['ok' => false, 'error' => 'too_many'];

    /* probe: which of these tokens still need an image? The studio used to send
       every token's PNG on every visit — sixty to a request, a quarter of a
       megabyte each — and a shared host's request filter reset the connection
       (ERR_HTTP2_PROTOCOL_ERROR in the console) for images it already held.
       Now it asks first and sends only what is missing, a few at a time. */
    if (!empty($p['probe'])) {
        $missing = [];
        foreach ($items as $it) {
            $token = trim((string)(is_array($it) ? ($it['token'] ?? '') : $it));
            if ($token === '' || in_array($token, $missing, true) || qr_cache_exists($token)) continue;
            $known = db_row('SELECT 1 FROM qr_codes WHERE token = ? LIMIT 1', [$token])
                  || db_row('SELECT 1 FROM summer_students WHERE token = ? LIMIT 1', [$token])
                  || db_row('SELECT 1 FROM volunteers WHERE token = ? LIMIT 1', [$token]);
            if ($known) $missing[] = $token;
        }
        return ['ok' => true, 'missing' => $missing];
    }

    $stored = 0; $skipped = 0;
    foreach ($items as $it) {
        $token = trim((string)($it['token'] ?? ''));
        $png = (string)($it['qrPng'] ?? '');
        if ($token === '' || $png === '') { $skipped++; continue; }
        // Never an open QR-cache-for-anything: the token has to be bound already.
        $known = db_row('SELECT 1 FROM qr_codes WHERE token = ? LIMIT 1', [$token])
              || db_row('SELECT 1 FROM summer_students WHERE token = ? LIMIT 1', [$token])
              || db_row('SELECT 1 FROM volunteers WHERE token = ? LIMIT 1', [$token]);
        if (!$known) { $skipped++; continue; }
        // Already hosted — a studio visit should not rewrite 300 identical files.
        if (qr_cache_exists($token)) { $skipped++; continue; }
        if (qr_cache_store($token, $png)) $stored++; else $skipped++;
    }
    if ($stored) audit('admin.qr.warm', (string)($g['requester']['memberId'] ?? ''), '', ['stored' => $stored], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'stored' => $stored, 'skipped' => $skipped];
}

/**
 * Resend the ID to every verified student — or every one still missing a QR.
 *
 * The single resend is for a parent on the phone. This is for the case that
 * actually happened: a cohort verified before the ID email carried a QR at all,
 * three hundred families holding a message with a link in it, and no screen
 * anywhere that would send the rest.
 *
 * `scope` is the whole point:
 *  · `missing_qr` — only children whose token has no hosted QR image yet. This is
 *    the repair pass, and after the server-side encoder it is usually empty,
 *    which is the correct answer to "who did we shortchange".
 *  · `all` — every verified student, whatever they already received. Wasteful by
 *    design and occasionally what you want after changing the email itself.
 *
 * Bounded per call and reports what is left, because three hundred emails is not a
 * request, it is a job. Deferred past the response for the same reason.
 */
const ID_RESEND_SWEEP_MAX = 200;

function admin_id_resend_bulk(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $scope = (string)($p['scope'] ?? 'missing_qr');
    if (!in_array($scope, ['missing_qr', 'all'], true)) return ['ok' => false, 'error' => 'bad_scope'];

    $c = summer_ensure_cohort();
    $centre = trim((string)($p['centre'] ?? ''));
    /* Only families we can actually reach. A "sent 300" that counted 90 children
       with no email and no phone would be a number nobody could act on. */
    $reachable = "((parentEmail IS NOT NULL AND parentEmail != '') OR (guardianPhone IS NOT NULL AND guardianPhone != ''))";

    /* ── Children with no ID come FIRST, and are issued rather than resent ─────
     *
     * This is what the reported bug was. The query filtered `token != ''`, so
     * "resend to everyone" walked straight past every child who had never been
     * issued one — the only children for whom the button was the actual fix. You
     * could press it all day and the roster would not change.
     *
     * They need registration_issue_id(), not student_send_id(): there is no token
     * to send yet. Issuance binds one and sends it in the same act, and it refuses
     * on its own terms when a gate still holds — so a child awaiting consent or a
     * photo decision is reported as held here rather than quietly counted as done.
     */
    $issued = []; $held = [];
    if ($scope === 'all') {
        $uw = ["cohortId = ?", "status = 'active'", "regStatus = 'verified'", "(token IS NULL OR token = '')", $reachable];
        $ua = [$c['cohortId']];
        if ($centre !== '') { $uw[] = 'centre = ?'; $ua[] = $centre; }
        foreach (db_all("SELECT studentId FROM summer_students WHERE " . implode(' AND ', $uw)
                        . " ORDER BY id ASC LIMIT " . ID_RESEND_SWEEP_MAX, $ua) as $r) {
            $sid = (string)$r['studentId'];
            $why = registration_issue_reason($sid);
            if ($why !== '') { $held[] = ['studentId' => $sid, 'reason' => $why]; continue; }
            $res = registration_issue_id($sid);          // binds the token AND sends
            if (!empty($res['issued']) || !empty($res['already'])) $issued[] = $sid;
            else $held[] = ['studentId' => $sid, 'reason' => (string)($res['reason'] ?? 'unknown')];
        }
    }

    $where = ["cohortId = ?", "regStatus = 'verified'", "token != ''", $reachable]; $args = [$c['cohortId']];
    if ($centre !== '') { $where[] = 'centre = ?'; $args[] = $centre; }
    $rows = db_all("SELECT studentId, token FROM summer_students WHERE " . implode(' AND ', $where)
                   . " ORDER BY id ASC", $args);

    $targets = [];
    foreach ($rows as $r) {
        // The repair pass asks the filesystem, not the database — "has a hosted
        // QR" is a fact about the cache, and that is where it is kept.
        if ($scope === 'missing_qr' && qr_cache_exists((string)$r['token'])) continue;
        // Issued a moment ago, and issuance already sent it. Sending again here
        // would mail the same family twice for one press.
        if (in_array((string)$r['studentId'], $issued, true)) continue;
        $targets[] = (string)$r['studentId'];
    }
    $remaining = max(0, count($targets) - ID_RESEND_SWEEP_MAX);
    $batch = array_slice($targets, 0, ID_RESEND_SWEEP_MAX);
    if (!$batch && !$issued) {
        return ['ok' => true, 'queued' => 0, 'issued' => 0, 'held' => $held, 'remaining' => 0, 'scope' => $scope,
                'note' => $scope === 'missing_qr'
                    ? 'Every verified student already has a scannable QR on file.'
                    : ($held
                        ? 'Nobody could be sent an ID: ' . count($held) . ' ' . (count($held) === 1 ? 'child is' : 'children are') . ' still held.'
                        : 'No verified students with a contact on file' . ($centre !== '' ? ' at ' . $centre : '') . '.')];
    }

    audit('admin.id.resend.bulk', $me, $centre ?: 'all', ['scope' => $scope, 'count' => count($batch),
        'issued' => count($issued), 'held' => count($held), 'remaining' => $remaining], (string)($p['ip'] ?? ''));
    if ($batch) {
        after_response('admin.id.resend.bulk', function () use ($batch) {
            foreach ($batch as $id) {
                // qr_ensure_cached() runs inside student_send_id(), so a child with no
                // hosted image gets one encoded on the way out.
                try { student_send_id($id); } catch (\Throwable $e) { error_log('[id.resend.bulk] ' . $id . ': ' . $e->getMessage()); }
            }
        });
    }
    /* Three numbers, not one total. "Sent 312" over a run that issued 9 new IDs
       and could not touch 4 held children reads as complete when it is not. */
    return ['ok' => true, 'queued' => count($batch), 'issued' => count($issued),
            'held' => $held, 'remaining' => $remaining, 'scope' => $scope];
}

/**
 * How many verified students are missing a scannable QR.
 *
 * Its own read, because the admin screen needs to be able to say "nine of these
 * families got a link with no code" without sending anything — a bulk action whose
 * size you cannot see before pressing it is one people press once and never again.
 */
function admin_id_qr_gaps(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    /* ── Children with NO ID AT ALL ──────────────────────────────────────────
     *
     * The reported problem, and the one this screen could not see: every read and
     * every repair here filtered on `token != ''`, so a verified child who was
     * never issued an ID was invisible to the count AND to the sweep. The two
     * things an admin could do about it — look, and fix — both skipped exactly the
     * children who needed it.
     *
     * They get there because issuance is retried only by the events that release
     * its gate. A child held on a pending photo whose photo is then rejected, or
     * one held while `photo_gate_issuance` was on and it is later switched off, is
     * eligible from that moment and nothing runs again to notice. The reject path
     * is fixed at source (see photo_retry_issuance); the setting change and any
     * historical row are what the sweep is for.
     *
     * The reason comes from the issuance gate itself rather than being guessed
     * here, so the number on the screen and what the button will do cannot
     * disagree. */
    $unissued = []; $heldPhoto = 0; $ready = 0;
    foreach (db_all("SELECT studentId, fullName, centre FROM summer_students
                     WHERE cohortId = ? AND status = 'active' AND regStatus = 'verified' AND (token IS NULL OR token = '')
                     ORDER BY id ASC LIMIT 400", [$c['cohortId']]) as $r) {
        $why = registration_issue_reason((string)$r['studentId']);
        if ($why === 'photo_pending') $heldPhoto++; else $ready++;
        if (count($unissued) < 50) {
            $unissued[] = ['studentId' => (string)$r['studentId'], 'fullName' => (string)$r['fullName'],
                           'centre' => (string)($r['centre'] ?? ''), 'reason' => $why];
        }
    }
    // Not a fault and not fixable from here — the parent has not consented yet —
    // but it is the other half of "why has this child no ID", so it is said too.
    $awaitingConsent = (int)(db_row("SELECT COUNT(*) n FROM summer_students
                                     WHERE cohortId = ? AND status = 'active' AND regStatus != 'verified'", [$c['cohortId']])['n'] ?? 0);

    $rows = db_all("SELECT studentId, fullName, centre, token, parentEmail, guardianPhone, guardianName
                    FROM summer_students
                    WHERE cohortId = ? AND regStatus = 'verified' AND token != '' ORDER BY id ASC", [$c['cohortId']]);
    $missing = []; $unreachableList = []; $total = 0;
    foreach ($rows as $r) {
        $noQr = !qr_cache_exists((string)$r['token']);
        if ($noQr) $total++;
        $email = trim((string)($r['parentEmail'] ?? ''));
        $phone = trim((string)($r['guardianPhone'] ?? ''));
        if ($email === '' && $phone === '') {
            /* LISTED, not just counted.
             *
             * These are the families the ID never reached and never will: no email
             * and no phone on the record, usually because the row predates the form
             * asking for either, or because a desk skipped it. Sending harder does
             * nothing for them — the only fix is a contact — and a bare count told
             * an admin a number without telling them whose. Naming them is what
             * makes the problem finishable. */
            if (count($unreachableList) < 200) {
                $unreachableList[] = ['studentId' => (string)$r['studentId'],
                    'fullName' => (string)$r['fullName'],
                    'centre' => (string)($r['centre'] ?? ''),
                    'guardianName' => (string)($r['guardianName'] ?? ''),
                    'hasQr' => !$noQr];
            }
            continue;
        }
        if ($noQr && count($missing) < 50) {
            $missing[] = ['studentId' => (string)$r['studentId'], 'fullName' => (string)$r['fullName'],
                          'centre' => (string)($r['centre'] ?? '')];
        }
    }
    return ['ok' => true, 'verified' => count($rows), 'missingQr' => $total,
            // Named separately: these cannot be fixed by sending, only by getting
            // a contact for the family.
            'unreachable' => count($unreachableList), 'unreachableList' => $unreachableList,
            'sample' => $missing,
            /* Three different problems, three numbers, because the remedy differs:
               `noId` is a button press, `heldPhoto` needs a photo decision, and
               `awaitingConsent` needs the family (or a desk recording a paper
               form). One combined "missing ID" figure would hide which. */
            'noId' => $ready + $heldPhoto, 'noIdReady' => $ready, 'heldPhoto' => $heldPhoto,
            'unissuedList' => $unissued, 'awaitingConsent' => $awaitingConsent,
            'encoder' => function_exists('qr_encode_png')];
}

/** Admin: resend a student's or volunteer's ID. Gated per kind (students →
 *  'summer', volunteers → 'people'), audited, and reports the channels used so
 *  staff see exactly what went out (and what didn't). */
function admin_id_resend(array $p): array {
    $kind = (string)($p['kind'] ?? 'student');
    $id = trim((string)($p['id'] ?? ''));
    $qrPng = (string)($p['qrPng'] ?? ''); // optional client-rendered QR PNG (data URL)
    if ($id === '') return ['ok' => false, 'error' => 'missing_id'];

    if ($kind === 'volunteer') {
        $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
        $v = db_row('SELECT volunteerId, token, email, phone FROM volunteers WHERE volunteerId = ? LIMIT 1', [$id]);
        if (!$v) return ['ok' => false, 'error' => 'not_found'];
        if (empty($v['token'])) return ['ok' => false, 'error' => 'no_id'];
        if ($qrPng !== '') qr_cache_store((string)$v['token'], $qrPng);
        $channels = volunteer_send_id($id);
        audit('admin.id.resend', $g['requester']['memberId'], $id, ['kind' => 'volunteer', 'channels' => $channels, 'qr' => qr_cache_exists((string)$v['token'])], (string)($p['ip'] ?? ''));
        // onFile tells "nobody to send to" apart from a send that failed.
        return ['ok' => true, 'channels' => $channels, 'kind' => 'volunteer', 'qr' => qr_cache_exists((string)$v['token']),
            'onFile' => trim((string)$v['email']) !== '' || trim((string)$v['phone']) !== ''];
    }

    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $st = db_row('SELECT token, parentEmail, guardianPhone FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
    if ($qrPng !== '' && $st && !empty($st['token'])) qr_cache_store((string)$st['token'], $qrPng);
    $res = student_send_id($id);
    if (empty($res['ok'])) return $res;
    $hasQr = $st && !empty($st['token']) && qr_cache_exists((string)$st['token']);
    audit('admin.id.resend', $g['requester']['memberId'], $id, ['kind' => 'student', 'channels' => $res['channels'], 'qr' => $hasQr], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'channels' => $res['channels'], 'kind' => 'student', 'qr' => $hasQr,
        'onFile' => $st && (trim((string)$st['parentEmail']) !== '' || trim((string)$st['guardianPhone']) !== '')];
}

/* ── Guardian photo re-shoot (public, token-authenticated) ────────────────── */

/** Ensure a student has a stable re-shoot token; returns it. */
function reshoot_token_for(string $studentId): string {
    $s = db_row('SELECT photoToken FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return '';
    if (!empty($s['photoToken'])) return (string)$s['photoToken'];
    $tok = 'PT' . rand_hex(18);
    db_update('summer_students', ['photoToken' => $tok], ['studentId' => $studentId]);
    return $tok;
}

/**
 * Email the guardian a link to recapture the headshot. Called from the photo
 * pipeline when an editor requests a retake for a STUDENT subject. Best-effort.
 */
function reshoot_notify_guardian(string $studentId, string $reason): void {
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s || empty($s['parentEmail'])) return;
    $tok = reshoot_token_for($studentId);
    if ($tok === '') return;
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/reshoot?t=' . $tok;
    $first = explode(' ', (string)$s['fullName'])[0] ?: 'your child';
    if (!function_exists('email_template') || !function_exists('send_mail')) return;
    $html = email_template([
        'title' => 'A quick new photo for ' . esc_html($first),
        'intro' => 'Hello' . (!empty($s['guardianName']) ? ' ' . esc_html((string)$s['guardianName']) : '') . ' — the photo for ' . esc_html((string)$s['fullName']) . "'s ID needs a quick retake.",
        'bodyHtml' => '<p style="margin:0 0 10px">' . ($reason !== '' ? '<b>What to fix:</b> ' . esc_html($reason) : 'Please take a clear, front-facing photo in good light.') . '</p>'
            . '<p style="margin:0">It takes under a minute on your phone — tap below.</p>',
        'ctaLabel' => 'Take a new photo →', 'ctaUrl' => $url,
    ]);
    send_mail((string)$s['parentEmail'], 'A quick new photo for ' . $first, $html);
}

function reshoot_context(array $p): array {
    $t = (string)($p['t'] ?? '');
    if ($t === '') return ['ok' => false, 'error' => 'link_invalid'];
    $s = db_row('SELECT * FROM summer_students WHERE photoToken = ? LIMIT 1', [$t]);
    if (!$s) return ['ok' => false, 'error' => 'link_invalid'];
    $a = db_row("SELECT status, editedUrl, sourceUrl, decisionNote, aiFindings FROM photo_assets WHERE subjectType = 'student' AND subjectId = ? ORDER BY version DESC LIMIT 1", [$s['studentId']]);
    $reason = '';
    if ($a && $a['status'] === 'changes_requested') $reason = (string)$a['decisionNote'];
    return ['ok' => true,
        'student' => ['name' => (string)$s['fullName'], 'photoUrl' => (string)($a['editedUrl'] ?? '') ?: (string)$s['photoUrl']],
        'status' => $a ? (string)$a['status'] : 'none',
        'reason' => $reason,
        'awaiting' => !$a || in_array((string)$a['status'], ['changes_requested', 'rejected'], true)];
}

function reshoot_submit(array $p): array {
    $t = (string)($p['t'] ?? '');
    if ($t === '') return ['ok' => false, 'error' => 'link_invalid'];
    $s = db_row('SELECT * FROM summer_students WHERE photoToken = ? LIMIT 1', [$t]);
    if (!$s) return ['ok' => false, 'error' => 'link_invalid'];
    /* Whatever the guardian's browser could manage: a hosted URL if a cloud is
     * configured, the image itself if not. This used to demand https and answer
     * `bad_photo` otherwise — so on a deployment with no Cloudinary the retake
     * link a guardian had been emailed could not be completed at all, and the
     * reason it gave blamed their photograph. */
    $url = function_exists('photo_intake_url')
        ? photo_intake_url((string)($p['photoUrl'] ?? ''))
        : (string)($p['photoUrl'] ?? '');
    if ($url === '') return ['ok' => false, 'error' => 'bad_photo'];
    // The retake IS the new photo — apply it whether or not the governed
    // pipeline can run, or a guardian who did what they were asked would see
    // the old picture on the card indefinitely.
    db_update('summer_students', ['photoUrl' => photo_store_relativise($url), 'updatedAt' => now_iso()], ['studentId' => (string)$s['studentId']]);
    if (!function_exists('photo_ingest')) {
        audit('photo.reshoot', 'guardian', (string)$s['studentId'], ['stored' => true, 'pipeline' => false], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'status' => 'captured', 'version' => 1];
    }
    $source = function_exists('photo_store_absolute') ? photo_store_absolute($url) : $url;
    $ing = $source !== '' ? photo_ingest('student', (string)$s['studentId'], $source, 'guardian') : ['ok' => false];
    if (empty($ing['ok'])) {
        // Stored and applied; only the AI/Cloudinary pass could not run. That is
        // an editor's problem, not the guardian's, so it is not an error to them.
        audit('photo.reshoot', 'guardian', (string)$s['studentId'], ['stored' => true, 'pipeline' => (string)($ing['error'] ?? 'failed')], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'status' => 'captured', 'version' => 1];
    }
    $pr = function_exists('photo_process') ? photo_process($ing['assetId']) : ['status' => 'captured'];
    audit('photo.reshoot', 'guardian', (string)$s['studentId'], ['assetId' => $ing['assetId'], 'v' => $ing['version']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $pr['status'] ?? 'analyzing', 'version' => $ing['version']];
}

/* ── Admin registration queue (the "Needs you" list) ─────────────────────── */

/**
 * The registrations screen — searchable, filterable, paged.
 *
 * This used to be "newest 500, no search". Two things wrong with that at any
 * real size, and the second is not a nuisance:
 *
 *  - Finding one child meant scrolling every registration in the cohort.
 *  - A child outside the newest 500 could not be found AT ALL, so their
 *    parent's consent link could never be resent. Across a hundred centres
 *    that is most of the cohort, and the people it strands are exactly the
 *    ones who registered earliest and are still waiting.
 *
 * It also read EVERY granted consent row in the database on every load, to
 * annotate at most 500 students. Consents are now fetched for the page only.
 *
 * Default order is longest-waiting first, because this screen exists to chase
 * people, and the person who registered nine days ago needs chasing before the
 * one who registered this morning.
 */
function admin_registrations_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();

    $where = ['cohortId = ?']; $args = [$c['cohortId']];

    $status = (string)($p['status'] ?? '');
    if ($status !== '' && $status !== 'all') { $where[] = 'regStatus = ?'; $args[] = $status; }

    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '') { $where[] = 'centre = ?'; $args[] = $centre; }

    /* Search covers everything a staffer actually has to hand when a parent
     * calls: the child's name, the ID on the card, and the parent's own phone
     * or email. Matching only the child's name is why this was painful — the
     * caller is the parent, and their number is the thing being read out. */
    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') {
        $like = '%' . strtolower($q) . '%';
        // Digits only, so a number typed with spaces or a +234 prefix still finds
        // a row stored in either shape.
        $digits = preg_replace('/\D/', '', $q);
        $terms = ['lower(fullName) LIKE ?', 'lower(studentId) LIKE ?', 'lower(parentEmail) LIKE ?', 'lower(guardianName) LIKE ?'];
        array_push($args, $like, $like, $like, $like);
        if ($digits !== '' && strlen($digits) >= 4) {
            $terms[] = "replace(replace(replace(COALESCE(guardianPhone,''), ' ', ''), '-', ''), '+', '') LIKE ?";
            $args[] = '%' . $digits . '%';
        }
        $where[] = '(' . implode(' OR ', $terms) . ')';
    }
    $whereSql = implode(' AND ', $where);

    $total = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE $whereSql", $args)['c'] ?? 0);
    $pageSize = max(1, min(100, (int)($p['pageSize'] ?? 25)));
    $page = max(1, (int)($p['page'] ?? 1));

    // Oldest first for the pending queue (chase the longest wait), newest first
    // for everything else (the usual "what just happened" reading).
    $order = ($status === 'parent_pending') ? 'id ASC' : 'id DESC';
    $rows = db_all("SELECT studentId, fullName, dob, age, centre, track, regStatus, guardianName, guardianPhone,
                           parentEmail, enrolledAt, remindedAt, verifiedAt, photoUrl, token
                    FROM summer_students WHERE $whereSql ORDER BY $order LIMIT ? OFFSET ?",
                   array_merge($args, [$pageSize, ($page - 1) * $pageSize]));

    // Consents for THIS PAGE, not for the whole database.
    $consents = [];
    if ($rows) {
        $ids = array_column($rows, 'studentId');
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT studentId, type FROM consents WHERE status = 'granted' AND studentId IN $in", $ids) as $cr) {
            $consents[(string)$cr['studentId']][] = (string)$cr['type'];
        }
    }
    $now = time();
    foreach ($rows as &$r) {
        $r['consents'] = $consents[(string)$r['studentId']] ?? [];
        // Precomputed here so the screen can sort and colour by it without every
        // client re-deriving the same arithmetic from two timestamps.
        $enrolled = strtotime((string)($r['enrolledAt'] ?? '')) ?: 0;
        $r['waitingDays'] = $enrolled ? (int)floor(($now - $enrolled) / 86400) : 0;
        $rem = strtotime((string)($r['remindedAt'] ?? '')) ?: 0;
        $r['remindedDaysAgo'] = $rem ? (int)floor(($now - $rem) / 86400) : null;
    }
    unset($r);

    // Cohort-wide counts, independent of the filter — the tab badges.
    $counts = [];
    foreach (db_all("SELECT regStatus, COUNT(*) c FROM summer_students WHERE cohortId = ? GROUP BY regStatus",
                    [$c['cohortId']]) as $cr) {
        $counts[(string)$cr['regStatus']] = (int)$cr['c'];
    }
    return ['ok' => true, 'registrations' => $rows, 'total' => $total,
            'page' => $page, 'pageSize' => $pageSize,
            'counts' => $counts, 'pendingCount' => (int)($counts['parent_pending'] ?? 0),
            'cohortTotal' => array_sum($counts)];
}

/**
 * Remind every parent matching the current filter, in one go.
 *
 * Chasing a hundred families one button at a time is the actual complaint
 * behind "stressful". Bounded per call so one click cannot fan out into
 * thousands of messages, and deferred past the response for the same reason
 * the gate desk is: this is slow network I/O and nobody should watch it.
 *
 * Only ever touches rows that are genuinely awaiting a parent, whatever filter
 * was passed — a bulk send is not the place to trust a client-supplied status.
 */
function admin_registrations_remind_bulk(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $where = ["cohortId = ?", "regStatus = 'parent_pending'"]; $args = [$c['cohortId']];
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '') { $where[] = 'centre = ?'; $args[] = $centre; }
    // "Only those we have not chased recently" — the default, so repeated
    // clicking cannot pester the same family twice in a day.
    $quietDays = max(0, min(30, (int)($p['quietDays'] ?? 1)));
    if ($quietDays > 0) {
        $cut = gmdate('Y-m-d H:i:s', time() - $quietDays * 86400);
        $where[] = "(remindedAt IS NULL OR remindedAt = '' OR remindedAt < ?)";
        $args[] = $cut;
    }
    $cap = max(1, min(200, (int)($p['limit'] ?? 100)));
    $rows = db_all("SELECT studentId FROM summer_students WHERE " . implode(' AND ', $where)
                   . " ORDER BY id ASC LIMIT ?", array_merge($args, [$cap]));
    $ids = array_column($rows, 'studentId');
    if (!$ids) return ['ok' => true, 'queued' => 0, 'note' => 'Nobody is waiting who has not already been reminded.'];

    audit('registration.remind.bulk', $g['requester']['memberId'], $centre ?: 'all',
          ['count' => count($ids), 'quietDays' => $quietDays], (string)($p['ip'] ?? ''));
    after_response('registration.remind.bulk', function () use ($ids) {
        foreach ($ids as $id) {
            try { registration_send_verification((string)$id); }
            catch (\Throwable $e) { error_log('[remind.bulk] ' . $id . ': ' . $e->getMessage()); }
        }
    });
    return ['ok' => true, 'queued' => count($ids)];
}

/* ── Recording a consent that was given off-line ──────────────────────────────
 *
 * A desk registration parks at `parent_pending` and waits for a parent to click
 * a link. Most do. The ones who do not are not edge cases: a guardian with no
 * email address, a phone that cannot open the link, a paper form filled in at
 * the centre while the child stood there. Until now those children stayed
 * pending forever and never got an ID, and the only workaround was editing the
 * database.
 *
 * So an admin can record the consent instead — and the point of this function is
 * everything it refuses to let them do while recording it.
 *
 *  · It is NOT a "mark verified" button. A consent has content: which
 *    permissions were granted, who gave them, and how. A button that skipped
 *    that would turn the consent ledger into a field that says "yes" and destroy
 *    the only record the programme has that anybody agreed to anything.
 *  · The METHOD is recorded and is different from the parent link's. A
 *    safeguarding review has to be able to tell a signed form from a click, and
 *    a ledger that flattens the two is worse than one with gaps in it.
 *  · The STAFF MEMBER is recorded (migration 75). An in-person consent is only
 *    as good as the person who witnessed it.
 *  · The required permissions must actually be granted, and the ones that must be
 *    ANSWERED must be answered either way — the same rules the parent link
 *    enforces, because a family who says no to photographs at a desk has said no.
 *
 * There IS a bulk version below, and its shape is the whole argument. A
 * coordinator with a stack of twenty signed paper forms on the desk is doing one
 * real thing twenty times, and making them click through twenty dialogs does not
 * make the record truer — it makes them stop using the feature. What would make
 * the record false is different, and that is what the bulk version refuses:
 *
 *  · It takes an EXPLICIT list of children. Never "everybody pending", never a
 *    filter the server expands, because the difference between those is the
 *    difference between twenty forms somebody is holding and forty children
 *    somebody has not thought about.
 *  · It uses each child's OWN guardian on file, not one name typed once. Twenty
 *    families did not all send the same person, and stamping one name across them
 *    would be the lie.
 *  · A child with no guardian on file is SKIPPED and named in the result. There
 *    is nobody to record as having consented, so nothing is recorded.
 */
const CONSENT_DESK_METHODS = [
    'paper'     => 'Signed paper form, on file at the centre',
    'in_person' => 'Given in person to staff at the centre',
    'phone'     => 'Given by phone to staff',
];

function admin_registration_consent_record(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');

    $studentId = trim((string)($p['studentId'] ?? ''));
    $s = db_row("SELECT * FROM summer_students WHERE studentId = ? LIMIT 1", [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$s['regStatus'] === 'verified') return ['ok' => true, 'already' => true];
    /* A public self-registration is a different question — has this submission
       been reviewed — and it has its own desk with the photograph and the
       submitted answers side by side. Sending an admin there beats answering the
       wrong question here. */
    if ((string)$s['regStatus'] === 'self_pending') {
        return ['ok' => false, 'error' => 'use_review_desk'];
    }
    if ((string)$s['regStatus'] !== 'parent_pending') {
        return ['ok' => false, 'error' => 'not_pending', 'regStatus' => (string)$s['regStatus']];
    }

    $method = (string)($p['method'] ?? '');
    if (!isset(CONSENT_DESK_METHODS[$method])) return ['ok' => false, 'error' => 'method_required'];

    /* Who gave it. Not the admin's name — the admin is the witness, and conflating
       the two would record staff as having consented on a family's behalf. */
    $actor = trim((string)($p['guardianName'] ?? ''));
    if (mb_strlen($actor) < 3) return ['ok' => false, 'error' => 'guardian_name_required'];
    $actor = mb_substr($actor, 0, 160);

    /* The same consent rules the parent link enforces, because the answers mean
       the same thing whichever desk they were given at. */
    $consents = is_array($p['consents'] ?? null) ? $p['consents'] : [];
    $missing = [];
    foreach (CONSENT_TYPES as $type => $meta) {
        $answered = array_key_exists($type, $consents);
        if ((int)$meta['p'] === 0 && empty($consents[$type])) { $missing[] = $type; continue; }
        if (!empty($meta['mustAnswer']) && !$answered) $missing[] = $type;
    }
    if ($missing) return ['ok' => false, 'error' => 'consents_incomplete', 'missing' => $missing];

    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 300);

    foreach (CONSENT_TYPES as $type => $meta) {
        db_insert('consents', ['studentId' => $studentId, 'type' => $type,
            'status' => !empty($consents[$type]) ? 'granted' : 'declined',
            // 'desk_paper' | 'desk_in_person' | 'desk_phone' — never 'parent_link'.
            'method' => 'desk_' . $method,
            'actorName' => $actor, 'signatureUrl' => '',
            'recordedById' => $me, 'createdAt' => now_iso()]);
    }

    db_update('summer_students', [
        'regStatus' => 'verified', 'verifiedAt' => now_iso(),
        'consentSignedName' => $actor, 'consentSignedAt' => now_iso(),
        'reviewedById' => $me, 'reviewedAt' => now_iso(),
        'reviewNote' => $note !== '' ? $note : CONSENT_DESK_METHODS[$method],
        'updatedAt' => now_iso(),
    ], ['studentId' => $studentId]);

    // The same issuance gate as every other path, so the photo hold and the QR
    // pool behave identically however the consent arrived.
    /* The send is inside the issuance gate now, so there is nothing to do here.
       It was a second call at this call site, which after the move would have
       mailed the family twice. */
    $issue = registration_issue_id($studentId);

    audit('registration.consent.desk', $me, $studentId,
        ['method' => $method, 'granted' => array_keys(array_filter($consents)), 'idHeld' => !empty($issue['held'])],
        (string)($p['ip'] ?? ''));
    event_emit('registration.verified', ['ref' => $studentId, 'name' => (string)$s['fullName'],
        'course' => (string)($s['track'] ?? ''), 'status' => 'verified', 'feedback' => '']);

    return ['ok' => true, 'studentId' => $studentId, 'regStatus' => 'verified',
            'method' => CONSENT_DESK_METHODS[$method],
            'idIssued' => !empty($issue['issued']) || !empty($issue['already']),
            'photoPending' => !empty($issue['held']) && ($issue['reason'] ?? '') === 'photo_pending'];
}

/**
 * The same record, for an explicitly chosen list of children.
 *
 * One method and one set of answers across the selection — which is what a stack
 * of identical signed forms actually is — but each child's own guardian, and each
 * child checked individually against the same rules the single version applies.
 * Bounded, so one click cannot verify a cohort.
 */
const CONSENT_BULK_MAX = 60;
/* The everyone-at-once ceiling. Higher than the ticked-selection cap because the
 * work is the same per child and the caller has asked for the whole queue; still
 * bounded, so one request cannot run for minutes and time out halfway through
 * with no way to tell what got written. The response says what is left. */
const CONSENT_SWEEP_MAX = 400;

function admin_registration_consent_record_bulk(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');

    /* Two ways in.
     *
     * A ticked SELECTION is the honest default: somebody working through a stack
     * of forms, naming the children in front of them.
     *
     * `scope: all_pending` is the whole queue, and it exists because a programme
     * that collected consent on paper at intake has a queue of four hundred that
     * a stack-at-a-time interface will never clear. The safeguards that matter
     * survive either way and are per child, not per request: each child's own
     * guardian is recorded, a child with no guardian on file is skipped and
     * named, and the ledger records the method and the staff member. What
     * changes is only who names the list. */
    $scope = (string)($p['scope'] ?? '');
    $centre = trim((string)($p['centre'] ?? ''));
    $sweep = $scope === 'all_pending';
    $remaining = 0;

    if ($sweep) {
        $c = summer_ensure_cohort();
        $where = ["cohortId = ?", "regStatus = 'parent_pending'"]; $args = [$c['cohortId']];
        if ($centre !== '') { $where[] = 'centre = ?'; $args[] = $centre; }
        $sql = "SELECT studentId FROM summer_students WHERE " . implode(' AND ', $where) . " ORDER BY id ASC";
        $all = array_column(db_all($sql, $args), 'studentId');
        $ids = array_slice($all, 0, CONSENT_SWEEP_MAX);
        $remaining = max(0, count($all) - count($ids));
        if (!$ids) return ['ok' => true, 'recorded' => [], 'skipped' => [], 'remaining' => 0,
                           'note' => 'Nobody is waiting on a parent' . ($centre !== '' ? ' at ' . $centre : '') . '.'];
    } else {
        $ids = array_values(array_unique(array_filter(array_map(
            fn($x) => trim((string)$x), (array)($p['studentIds'] ?? [])))));
        if (!$ids) return ['ok' => false, 'error' => 'no_students'];
        /* Explicitly capped rather than paged. A ticked bulk is somebody working
           through a physical stack; sixty is already more than one sitting, and a
           ceiling is what stops a scripted client verifying a whole cohort by
           enumerating ids. The sweep above is the deliberate, named way to do
           that, and it is auditable as one. */
        if (count($ids) > CONSENT_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => CONSENT_BULK_MAX];
    }

    $method = (string)($p['method'] ?? '');
    if (!isset(CONSENT_DESK_METHODS[$method])) return ['ok' => false, 'error' => 'method_required'];

    $consents = is_array($p['consents'] ?? null) ? $p['consents'] : [];
    $missing = [];
    foreach (CONSENT_TYPES as $type => $meta) {
        $answered = array_key_exists($type, $consents);
        if ((int)$meta['p'] === 0 && empty($consents[$type])) { $missing[] = $type; continue; }
        if (!empty($meta['mustAnswer']) && !$answered) $missing[] = $type;
    }
    if ($missing) return ['ok' => false, 'error' => 'consents_incomplete', 'missing' => $missing];

    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 300);
    $recorded = []; $skipped = [];
    $issuedIds = [];

    foreach ($ids as $studentId) {
        $s = db_row("SELECT studentId, fullName, track, regStatus, guardianName FROM summer_students WHERE studentId = ? LIMIT 1", [$studentId]);
        if (!$s) { $skipped[] = ['studentId' => $studentId, 'reason' => 'not_found']; continue; }
        if ((string)$s['regStatus'] === 'verified') { $skipped[] = ['studentId' => $studentId, 'name' => (string)$s['fullName'], 'reason' => 'already_verified']; continue; }
        if ((string)$s['regStatus'] === 'self_pending') { $skipped[] = ['studentId' => $studentId, 'name' => (string)$s['fullName'], 'reason' => 'use_review_desk']; continue; }
        if ((string)$s['regStatus'] !== 'parent_pending') { $skipped[] = ['studentId' => $studentId, 'name' => (string)$s['fullName'], 'reason' => 'not_pending']; continue; }

        /* Each child's own guardian. No guardian on file means there is nobody to
           record as having consented, and inventing one — or reusing the last
           name typed — would put a fabrication in the consent ledger. */
        $actor = mb_substr(trim((string)($s['guardianName'] ?? '')), 0, 160);
        if (mb_strlen($actor) < 3) {
            $skipped[] = ['studentId' => $studentId, 'name' => (string)$s['fullName'], 'reason' => 'no_guardian_on_file'];
            continue;
        }

        foreach (CONSENT_TYPES as $type => $meta) {
            db_insert('consents', ['studentId' => $studentId, 'type' => $type,
                'status' => !empty($consents[$type]) ? 'granted' : 'declined',
                'method' => 'desk_' . $method, 'actorName' => $actor, 'signatureUrl' => '',
                'recordedById' => $me, 'createdAt' => now_iso()]);
        }
        db_update('summer_students', [
            'regStatus' => 'verified', 'verifiedAt' => now_iso(),
            'consentSignedName' => $actor, 'consentSignedAt' => now_iso(),
            'reviewedById' => $me, 'reviewedAt' => now_iso(),
            'reviewNote' => $note !== '' ? $note : CONSENT_DESK_METHODS[$method],
            'updatedAt' => now_iso(),
        ], ['studentId' => $studentId]);

        $issue = registration_issue_id($studentId);
        if (!empty($issue['issued']) || !empty($issue['already'])) $issuedIds[] = $studentId;
        $recorded[] = ['studentId' => $studentId, 'name' => (string)$s['fullName'],
                       'guardian' => $actor,
                       'idIssued' => !empty($issue['issued']) || !empty($issue['already']),
                       'photoPending' => !empty($issue['held']) && ($issue['reason'] ?? '') === 'photo_pending'];
        event_emit('registration.verified', ['ref' => $studentId, 'name' => (string)$s['fullName'],
            'course' => (string)($s['track'] ?? ''), 'status' => 'verified', 'feedback' => '']);
    }

    /* No send here either: the issuance gate defers one per child already. A
       second pass over $issuedIds would double every message in the batch. */

    /* Audited as what it was. A sweep and a ticked batch are the same writes and
       different decisions, and six months later the only way to tell them apart
       is this line. */
    audit($sweep ? 'registration.consent.desk.sweep' : 'registration.consent.desk.bulk', $me,
        $sweep ? ($centre !== '' ? $centre : 'all centres') : '',
        ['method' => $method, 'recorded' => array_column($recorded, 'studentId'),
         'skipped' => count($skipped), 'remaining' => $remaining,
         'granted' => array_keys(array_filter($consents))], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'recorded' => $recorded, 'skipped' => $skipped,
            'scope' => $sweep ? 'all_pending' : 'selection',
            // How many the caller still has to come back for, so a queue of 900
            // does not look finished after 400.
            'remaining' => $remaining,
            'method' => CONSENT_DESK_METHODS[$method]];
}

/** The consent ledger for one child, so a desk can see what is already on file
 *  before recording anything — and so an audit can read it without SQL. */
function admin_registration_consents(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $studentId = trim((string)($p['studentId'] ?? ''));

    /* The permission list and the method list do not belong to a child — they are
     * the programme's, and the form needs them before it knows which children it is
     * about. Asking for them WITHOUT a studentId is therefore legitimate, and it is
     * exactly what the sweep does: "record consent for everyone waiting" has no
     * single student to probe.
     *
     * Requiring one here shipped a dialog with an empty method dropdown, no
     * permissions to tick and a disabled button — the form rendered, so it looked
     * like a styling problem rather than a missing payload. */
    $s = $studentId !== ''
        ? db_row("SELECT studentId, fullName, regStatus, guardianName, parentEmail, guardianPhone,
                         consentSignedName, consentSignedAt, verifiedAt
                  FROM summer_students WHERE studentId = ? LIMIT 1", [$studentId])
        : null;
    if ($studentId !== '' && !$s) return ['ok' => false, 'error' => 'not_found'];
    $rows = $s ? db_all("SELECT type, status, method, actorName, recordedById, createdAt
                         FROM consents WHERE studentId = ? ORDER BY id ASC", [$studentId]) : [];
    return ['ok' => true,
        'student' => $s ? ['studentId' => (string)$s['studentId'], 'fullName' => (string)$s['fullName'],
                      'regStatus' => (string)$s['regStatus'],
                      'guardianName' => (string)($s['guardianName'] ?? ''),
                      'parentEmail' => (string)($s['parentEmail'] ?? ''),
                      'guardianPhone' => (string)($s['guardianPhone'] ?? ''),
                      'signedName' => (string)($s['consentSignedName'] ?? ''),
                      'signedAt' => (string)($s['consentSignedAt'] ?? '')] : null,
        'types' => array_map(fn($t, $m) => ['type' => $t, 'label' => $m['label'],
                                            'required' => (int)$m['p'] === 0,
                                            'mustAnswer' => !empty($m['mustAnswer'])],
                             array_keys(CONSENT_TYPES), array_values(CONSENT_TYPES)),
        'methods' => array_map(fn($k, $v) => ['key' => $k, 'label' => $v],
                               array_keys(CONSENT_DESK_METHODS), array_values(CONSENT_DESK_METHODS)),
        'ledger' => array_map(fn($r) => [
            'type' => (string)$r['type'], 'status' => (string)$r['status'],
            'method' => (string)$r['method'], 'actorName' => (string)$r['actorName'],
            'recordedById' => (string)($r['recordedById'] ?? ''), 'at' => (string)$r['createdAt'],
        ], $rows)];
}

function admin_registrations_remind(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $studentId = (string)($p['studentId'] ?? '');
    $s = db_row("SELECT studentId, regStatus FROM summer_students WHERE studentId = ? LIMIT 1", [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ($s['regStatus'] !== 'parent_pending') return ['ok' => false, 'error' => 'not_pending'];
    $channels = registration_send_verification($studentId);
    audit('registration.remind', $g['requester']['memberId'], $studentId, ['channels' => $channels], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'channels' => $channels];
}

/* ── Centres (admin-managed: name + code + card accent color) ─────────────── */

/* ── Geo-fencing — a fence mapped to a CENTRE, not a device ───────────────── */

/** Master toggle. Off by default; admins flip it in Settings. */
function geofence_enabled(): bool {
    return setting_raw('geofence_enabled') === '1';
}

/** Great-circle distance in metres (Haversine). */
function geo_distance_m(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $R = 6371000.0; // mean Earth radius, metres
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

/**
 * Where a centre IS, for one programme.
 *
 * One centre, two possible buildings: the Club's address and point, and — when
 * Summer School runs somewhere else — the Summer venue's (migration 124). A
 * Summer reader with no venue set gets the Club's, which is what "Summer meets
 * where the Club does" means. An NGG reader never sees the Summer venue.
 *
 * @return array{lat:?float,lng:?float,address:string,area:string,venue:string}
 *         venue: 'summer' when the Summer venue answered, 'club' otherwise
 */
function centre_point(array $c, string $programme = 'ngg'): array {
    $summer = $programme === 'summer' && isset($c['summerLat'], $c['summerLng'])
        && $c['summerLat'] !== null && $c['summerLat'] !== '' && $c['summerLng'] !== null && $c['summerLng'] !== '';
    $summerText = $programme === 'summer' && trim((string)($c['summerAddress'] ?? '')) !== '';
    $hasClub = isset($c['lat'], $c['lng']) && $c['lat'] !== null && $c['lat'] !== '' && $c['lng'] !== null && $c['lng'] !== '';
    return [
        'lat' => $summer ? (float)$c['summerLat'] : ($hasClub ? (float)$c['lat'] : null),
        'lng' => $summer ? (float)$c['summerLng'] : ($hasClub ? (float)$c['lng'] : null),
        'address' => $summerText ? (string)$c['summerAddress'] : (string)($c['address'] ?? ''),
        'area' => ($programme === 'summer' && trim((string)($c['summerArea'] ?? '')) !== '') ? (string)$c['summerArea'] : (string)($c['area'] ?? ''),
        'venue' => ($summer || $summerText) ? 'summer' : 'club',
    ];
}

/**
 * The NGG centres nearest a Summer School participant's centre, nearest first.
 *
 * Measured from where Summer School actually met (the centre's Summer venue,
 * or the Club's address when it has none) to where each active centre's CLUB
 * meets — the place a promoted member will have to get to every week. Centres
 * with no mapped Club point cannot be ranked and are left out of the list; the
 * caller falls back to the participant's own centre.
 *
 * @param array<int,array>|null $centres an already-loaded centres list, so a
 *        roster page computes every suggestion from one query
 * @return list<array{name:string,code:string,km:float,same:bool}>
 */
function centre_suggest_ngg(string $summerCentre, ?array $centres = null): array {
    $centres ??= db_all("SELECT name, code, status, lat, lng, summerLat, summerLng, address, summerAddress, area, summerArea FROM centres");
    $from = null;
    foreach ($centres as $c) {
        if (strcasecmp((string)$c['name'], $summerCentre) === 0) { $from = centre_point($c, 'summer'); break; }
    }
    if (!$from || $from['lat'] === null) return [];
    $out = [];
    foreach ($centres as $c) {
        if ((string)($c['status'] ?? 'active') !== 'active') continue;
        $to = centre_point($c, 'ngg');
        if ($to['lat'] === null) continue;
        $out[] = ['name' => (string)$c['name'], 'code' => (string)$c['code'],
                  'km' => round(geo_distance_m($from['lat'], $from['lng'], $to['lat'], $to['lng']) / 1000, 1),
                  'same' => strcasecmp((string)$c['name'], $summerCentre) === 0];
    }
    usort($out, fn($a, $b) => $a['km'] <=> $b['km'] ?: strcmp($a['name'], $b['name']));
    return $out;
}

/** Active centres that are fenced AND carry a mapped point — the point of the
 *  SUMMER venue, because the only fence is the Summer registration desk's. */
function geo_fenced_centres(): array {
    $out = [];
    foreach (db_all("SELECT centreId, name, code, color, lat, lng, summerLat, summerLng, summerAddress, address, radiusM FROM centres
                     WHERE status = 'active' AND geofence = 1") as $c) {
        $pt = centre_point($c, 'summer');
        if ($pt['lat'] === null) continue;
        $c['lat'] = $pt['lat']; $c['lng'] = $pt['lng'];
        $out[] = $c;
    }
    return $out;
}

/**
 * Match a device location to the nearest fenced centre. Returns
 * ['centre'=>row, 'distanceM'=>int, 'inFence'=>bool] for the NEAREST fenced
 * centre, or null when none are mapped. inFence=false = nearest fence was out
 * of range (the anti-cheat signal).
 */
function geo_match_centre(float $lat, float $lng): ?array {
    $best = null;
    foreach (geo_fenced_centres() as $c) {
        $d = geo_distance_m($lat, $lng, (float)$c['lat'], (float)$c['lng']);
        if ($best === null || $d < $best['distanceM']) {
            $best = ['centre' => $c, 'distanceM' => (int)round($d), 'inFence' => $d <= (float)($c['radiusM'] ?: 150)];
        }
    }
    return $best;
}

/**
 * The NGG CENTRE DIRECTORY.
 *
 * A centre is a PLACE, and it belongs to NGG the organisation — not to Summer
 * School. An NGG member is posted to one all year round, `members.centre`
 * points at its name, and `centres.code` is the printed ID prefix and the band
 * colour on that member's card. Summer School RUNS AT centres, and so do
 * volunteers, attendance, the public centre pages and the status boards.
 *
 * That is why READING is open to the member desk and the Summer School desk
 * alike (both need the list to do their jobs) while WRITING is `people` only:
 * this whole file used to gate the directory on `summer`, so a Summer School
 * coordinator could rename or delete the centre every NGG member's record and
 * ID card depended on, and a year-round member administrator could not add
 * one at all. See admin_centres_upsert / admin_centres_delete.
 *
 * The counts are reported per programme rather than as one number: "enrolled"
 * on a centre row used to mean Summer School participants in the active
 * edition, which is not what a member administrator reads it as.
 */
function admin_centres_list(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $canWrite = in_array('people', member_effective_caps($g['requester']), true);
    $c = summer_ensure_cohort();
    $rows = db_all("SELECT centreId, name, code, color, status, capacity, address, area, leadVolunteerId, phone, email, meetDays, meetTime, notes, whatsappUrl, lat, lng, radiusM, geofence, mapSource, mapAccuracyM, mappedAt, summerAddress, summerArea, summerLat, summerLng, slug, pageStatus, tagline, headline, heroImageUrl, heroImageMobileUrl, heroPosition, story, gallery, pageUpdatedAt, programmes FROM centres ORDER BY name");
    // A scoped admin's directory is their centres.
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    if ($scopeNames !== null) $rows = array_values(array_filter($rows, static fn($r) => in_array((string)$r['name'], $scopeNames, true)));
    /* Grouped counts for the whole directory — this ran four queries per
       centre, which is the N+1 CLAUDE.md §6 calls a defect. */
    $sumBy = [];
    foreach (db_all("SELECT centre, status, COUNT(*) c FROM summer_students WHERE cohortId = ? AND status IN ('active','waitlisted') GROUP BY centre, status", [$c['cohortId']]) as $x) $sumBy[(string)$x['centre']][(string)$x['status']] = (int)$x['c'];
    $memBy = [];
    foreach (db_all("SELECT centre, COUNT(*) c FROM members WHERE status = 'active' GROUP BY centre") as $x) $memBy[(string)$x['centre']] = (int)$x['c'];
    $grpBy = [];
    foreach (db_all("SELECT centreId, COUNT(*) c FROM summer_groups WHERE cohortId = ? GROUP BY centreId", [$c['cohortId']]) as $x) $grpBy[(string)$x['centreId']] = (int)$x['c'];
    // Volunteers available to lead a centre — active only, labelled for the picker.
    $vols = db_all("SELECT volunteerId, fullName, firstName, role, centre FROM volunteers WHERE status = 'active' ORDER BY fullName");
    $volById = [];
    $leadOptions = [];
    foreach ($vols as $v) {
        $vid = (string)$v['volunteerId'];
        $nm = trim((string)$v['fullName']) !== '' ? (string)$v['fullName'] : trim((string)$v['firstName']);
        $volById[$vid] = $nm;
        $leadOptions[] = ['volunteerId' => $vid, 'name' => $nm, 'role' => (string)$v['role'], 'centre' => (string)$v['centre']];
    }
    foreach ($rows as &$r) {
        /* Two programmes, two numbers. `enrolled`/`waitlisted` keep their
           meaning — Summer School participants in the ACTIVE edition — and are
           aliased under summer* names so a reader cannot mistake them for the
           year-round membership. `members` is the NGG side: who is posted here
           all year, which is what capacity on an NGG centre is about. */
        $r['summerEnrolled'] = $sumBy[(string)$r['name']]['active'] ?? 0;
        $r['summerWaitlisted'] = $sumBy[(string)$r['name']]['waitlisted'] ?? 0;
        $r['enrolled'] = $r['summerEnrolled'];
        $r['waitlisted'] = $r['summerWaitlisted'];
        $r['members'] = $memBy[(string)$r['name']] ?? 0;
        $r['groups'] = $grpBy[(string)$r['centreId']] ?? 0;
        $r['full'] = ((int)$r['capacity'] > 0 && $r['summerEnrolled'] >= (int)$r['capacity']);
        $lid = (string)($r['leadVolunteerId'] ?? '');
        $r['leadName'] = $lid !== '' ? ($volById[$lid] ?? db_row('SELECT fullName FROM volunteers WHERE volunteerId = ?', [$lid])['fullName'] ?? '') : '';
        // gallery is stored as a JSON array of image URLs — hand the editor an array.
        $g2 = json_decode((string)($r['gallery'] ?? ''), true);
        $r['gallery'] = is_array($g2) ? array_values(array_filter(array_map('strval', $g2))) : [];
        if (($r['slug'] ?? '') === '') $r['slug'] = centre_slugify((string)$r['name']);
    }
    unset($r);
    return ['ok' => true, 'centres' => $rows, 'leadOptions' => $leadOptions,
            'geofenceEnabled' => geofence_enabled(),
            // So the screen can show a read-only directory rather than buttons
            // that 403. The server still refuses either way.
            'canWrite' => $canWrite,
            'summerEditionId' => (string)$c['cohortId']];
}

/**
 * PII-safe public metadata for a centre row — its location, meeting schedule
 * and lead. The lead volunteer shows by FIRST NAME only when they granted the
 * site-visibility consent; otherwise an anonymous handle and a role initial.
 * A surname, email or phone of the lead never leaves the server. Pass a centre
 * row that already includes area/address/leadVolunteerId/meetDays/meetTime.
 */
function centre_public_meta(array $c): array {
    $lead = null;
    $lid = (string)($c['leadVolunteerId'] ?? '');
    if ($lid !== '') {
        $v = db_row("SELECT fullName, firstName, lastName, role, faculty, visibilityConsent, photoUrl FROM volunteers WHERE volunteerId = ?", [$lid]);
        if ($v) {
            $consent = (int)($v['visibilityConsent'] ?? 0) === 1;
            $first = trim((string)($v['firstName'] ?? '')); if ($first === '') $first = explode(' ', (string)$v['fullName'])[0] ?? 'Lead';
            $lastInit = strtolower(substr(trim((string)($v['lastName'] ?? '')), 0, 1));
            $lead = [
                'name'    => $consent ? $first : '',
                'handle'  => $consent ? ('@' . strtolower(preg_replace('/[^a-z]/i', '', $first)) . ($lastInit ? '.' . $lastInit : '')) : ('@vol-' . substr(md5($lid), 0, 4)),
                'role'    => (string)$v['role'],
                'faculty' => $consent ? (string)($v['faculty'] ?? '') : '',
                'face'    => $consent ? (string)($v['photoUrl'] ?? '') : '',
                'initial' => strtoupper(substr($consent ? $first : (string)$v['role'], 0, 1)),
            ];
        }
    }
    return [
        'area'     => (string)($c['area'] ?? ''),
        'address'  => (string)($c['address'] ?? ''),
        'meetDays' => (string)($c['meetDays'] ?? ''),
        'meetTime' => (string)($c['meetTime'] ?? ''),
        'lead'     => $lead,
    ];
}

/** Is a centre (by NAME) at/over capacity for the active cohort? capacity 0 = unlimited. */
function centre_is_full(string $centreName, string $cohortId): bool {
    if ($centreName === '') return false;
    $cap = (int)(db_row('SELECT capacity FROM centres WHERE name = ? LIMIT 1', [$centreName])['capacity'] ?? 0);
    if ($cap <= 0) return false;
    $active = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND centre = ? AND status = 'active'", [$cohortId, $centreName])['c'] ?? 0);
    return $active >= $cap;
}

/* ── Which programmes run at a centre ──────────────────────────────────────
 * One centres table serves the year-round NGG Club and Summer School. A centre
 * says which of the two it runs (`programmes`, migration 130), and every list a
 * programme offers is filtered by it — so a Summer-only venue is not offered to
 * an NGG member, and a Club-only centre is not on the Summer form. Empty reads
 * as both, which is what every row was before the column existed. */
const CENTRE_PROGRAMMES = ['ngg', 'summer'];
const CENTRE_FALLBACK_CODE = 'ST';
function centre_programmes_clean($raw): array {
    $list = is_array($raw) ? $raw : preg_split('/[\s,]+/', (string)$raw);
    $out = [];
    foreach ($list as $x) { $x = strtolower(trim((string)$x)); if ($x === 'club' || $x === 'anchor') $x = 'ngg'; if (in_array($x, CENTRE_PROGRAMMES, true) && !in_array($x, $out, true)) $out[] = $x; }
    return array_values(array_intersect(CENTRE_PROGRAMMES, $out));
}
function centre_programmes(array $c): array {
    $pr = centre_programmes_clean($c['programmes'] ?? '');
    return $pr ?: CENTRE_PROGRAMMES;
}
function centre_serves(array $c, string $programme): bool {
    $programme = strtolower($programme) === 'summer' ? 'summer' : 'ngg';
    return in_array($programme, centre_programmes($c), true);
}
/** Active centres a programme runs at, by name — the list every form of that programme offers. */
function centres_for_programme(string $programme, string $cols = 'name'): array {
    $rows = db_all("SELECT $cols, programmes FROM centres WHERE status = 'active' ORDER BY name");
    return array_values(array_filter($rows, static fn($c) => centre_serves($c, $programme)));
}
function centre_names_for_programme(string $programme): array {
    return array_column(centres_for_programme($programme), 'name');
}

/* Writing the directory is `people`, not `summer` — see admin_centres_list for
   why. A Summer School coordinator who needs a new centre asks the member desk;
   what a coordinator owns is the EDITION and its GROUPS
   (_lib/domain/summer-editions.php), which is their structure, not NGG's. */
function admin_centres_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    /* A scoped admin edits only their own centres and cannot add one: a new
       centre is a new place in the organisation, decided above a centre. */
    if (admin_centre_names_in_scope($g['requester']) !== null) {
        $cid0 = (string)($d['centreId'] ?? '');
        $own = $cid0 !== '' ? db_row('SELECT name FROM centres WHERE centreId = ?', [$cid0]) : null;
        if (!$own) return ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'Only an admin for every centre can add a centre.'];
        if (!admin_centre_allowed($g['requester'], (string)$own['name'])) return ['ok' => false, 'error' => 'out_of_scope'];
    }
    $name = substr(trim((string)($d['name'] ?? '')), 0, 80);
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($d['code'] ?? '')));
    $color = (string)($d['color'] ?? '#76B043');
    if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name'];
    if (strlen($code) < 1 || strlen($code) > 4) return ['ok' => false, 'error' => 'bad_code'];
    /* 'ST' is the prefix a Summer card falls back to when its centre is not
       found, so a centre holding it would share numbers with every unplaced
       child. An all-digit code reads as an NGG intake year ('026-014'). */
    if ($code === CENTRE_FALLBACK_CODE) return ['ok' => false, 'error' => 'code_reserved', 'detail' => CENTRE_FALLBACK_CODE . ' is kept for Summer cards whose centre is unknown.'];
    if (ctype_digit($code)) return ['ok' => false, 'error' => 'code_reserved', 'detail' => 'A code of only digits looks like an NGG member number. Use letters.'];
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) return ['ok' => false, 'error' => 'bad_color'];
    $id = (string)($d['centreId'] ?? '');
    $existing = $id !== '' ? db_row('SELECT * FROM centres WHERE centreId = ?', [$id]) : null;
    // The code is the printed ID prefix — it must stay unique across centres.
    $clash = db_row('SELECT centreId FROM centres WHERE code = ? LIMIT 1', [$code]);
    if ($clash && (!$existing || $clash['centreId'] !== $id)) return ['ok' => false, 'error' => 'code_taken'];
    $row = ['name' => $name, 'code' => $code, 'color' => $color,
        'status' => in_array((string)($d['status'] ?? 'active'), ['active', 'archived'], true) ? (string)($d['status'] ?? 'active') : 'active',
        'updatedAt' => now_iso()];
    if (array_key_exists('capacity', $d)) $row['capacity'] = max(0, (int)$d['capacity']);
    if (array_key_exists('programmes', $d)) {
        $pr = centre_programmes_clean($d['programmes']);
        if (!$pr) return ['ok' => false, 'error' => 'programme_required', 'detail' => 'A centre runs the NGG Club, Summer School, or both.'];
        $row['programmes'] = implode(',', $pr);
    }

    // Operational detail — where the centre is, who leads it, how to reach it,
    // when it meets. Each is optional and only written when the key is present,
    // so a partial save (e.g. the geo editor) never wipes contact fields.
    $textFields = [
        'address' => 240, 'area' => 120, 'phone' => 40, 'email' => 160,
        'meetDays' => 120, 'meetTime' => 60, 'notes' => 400,
        'summerAddress' => 240, 'summerArea' => 120,
    ];
    foreach ($textFields as $f => $max) {
        if (array_key_exists($f, $d)) $row[$f] = substr(trim((string)$d[$f]), 0, $max);
    }
    if (array_key_exists('email', $row) && $row['email'] !== '' && !filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'bad_email'];
    }
    // Group join link — optional. Accepts a chat.whatsapp.com invite, a wa.me
    // link, or a form link (Google Forms, etc.). A bare host (no scheme) gets
    // https:// prepended; anything that isn't https after that is rejected.
    if (array_key_exists('whatsappUrl', $d)) {
        $wa = trim((string)$d['whatsappUrl']);
        if ($wa !== '') {
            if (!preg_match('#^[a-z][a-z0-9+.-]*://#i', $wa) && preg_match('#^[a-z0-9.-]+\.[a-z]{2,}(/|$)#i', $wa)) {
                $wa = 'https://' . $wa;
            }
            $wa = substr($wa, 0, 240);
            if (!preg_match('#^https://#i', $wa)) return ['ok' => false, 'error' => 'bad_whatsapp'];
        }
        $row['whatsappUrl'] = $wa;
    }
    // Centre lead — a volunteer. Empty clears it; otherwise it must resolve to a
    // real volunteer (any status, so an archived lead still shows for history).
    if (array_key_exists('leadVolunteerId', $d)) {
        $lead = trim((string)$d['leadVolunteerId']);
        if ($lead !== '' && !db_row('SELECT id FROM volunteers WHERE volunteerId = ?', [$lead])) {
            return ['ok' => false, 'error' => 'bad_lead'];
        }
        $row['leadVolunteerId'] = $lead;
    }

    // ── Public centre-page content (the immersive /centres/<slug> landing) ──
    // Each field is optional and only written when its key is present, so a
    // partial save (identity, geo, contacts) never wipes page content.
    if (array_key_exists('pageStatus', $d)) {
        $row['pageStatus'] = in_array((string)$d['pageStatus'], ['published', 'draft'], true) ? (string)$d['pageStatus'] : 'draft';
    }
    // Slug — the URL segment. Explicit value is sanitised; a blank one is
    // derived from the name. Kept unique across centres (append -2, -3, …).
    if (array_key_exists('slug', $d) || (!$existing && !array_key_exists('slug', $d))) {
        $want = centre_slugify((string)($d['slug'] ?? '') !== '' ? (string)$d['slug'] : $name);
        if ($want === '') $want = 'centre';
        $slug = $want; $n = 2;
        while (db_row('SELECT centreId FROM centres WHERE slug = ? AND centreId <> ? LIMIT 1', [$slug, $id ?: '—'])) {
            $slug = $want . '-' . $n; $n++;
        }
        $row['slug'] = $slug;
    }
    $pageTouched = false;
    $pageText = ['tagline' => 200, 'headline' => 200, 'story' => 6000];
    foreach ($pageText as $f => $max) {
        if (array_key_exists($f, $d)) { $row[$f] = mb_substr(trim((string)$d[$f]), 0, $max); $pageTouched = true; }
    }
    foreach (['heroImageUrl', 'heroImageMobileUrl'] as $f) {
        if (array_key_exists($f, $d)) {
            $u = trim((string)$d[$f]);
            if ($u !== '' && !preg_match('#^https://#i', $u)) return ['ok' => false, 'error' => 'bad_image'];
            $row[$f] = mb_substr($u, 0, 500); $pageTouched = true;
        }
    }
    // Hero focal position — a safe CSS object-position (keywords or two
    // percentages), used to position the giant hero image on the page.
    if (array_key_exists('heroPosition', $d)) {
        $hp = strtolower(trim((string)$d['heroPosition']));
        $tok = '(left|right|center|top|bottom|-?\d{1,3}(\.\d+)?%)';
        $row['heroPosition'] = ($hp !== '' && preg_match('/^' . $tok . '( ' . $tok . ')?$/', $hp)) ? mb_substr($hp, 0, 32) : 'center bottom';
        $pageTouched = true;
    }
    if (array_key_exists('gallery', $d)) {
        $g = is_array($d['gallery']) ? $d['gallery'] : [];
        $clean = [];
        foreach ($g as $u) {
            $u = trim((string)$u);
            if ($u === '' || !preg_match('#^https://#i', $u)) continue; // drop blanks / non-https
            $clean[] = mb_substr($u, 0, 500);
            if (count($clean) >= 12) break;
        }
        $row['gallery'] = json_encode($clean, JSON_UNESCAPED_SLASHES);
        $pageTouched = true;
    }
    if ($pageTouched || array_key_exists('pageStatus', $d)) $row['pageUpdatedAt'] = now_iso();

    /* The Summer venue's point, when Summer School meets somewhere else. Both
       or neither; `summerClear` removes it, so the venue falls back to the
       Club's (centre_point()). */
    if (!empty($d['summerClear'])) {
        $row['summerLat'] = null; $row['summerLng'] = null; $row['summerAddress'] = ''; $row['summerArea'] = '';
    } else {
        $sLat = isset($d['summerLat']) && $d['summerLat'] !== '' && $d['summerLat'] !== null;
        $sLng = isset($d['summerLng']) && $d['summerLng'] !== '' && $d['summerLng'] !== null;
        if ($sLat || $sLng) {
            if (!$sLat || !$sLng) return ['ok' => false, 'error' => 'bad_latlng'];
            $la = (float)$d['summerLat']; $lo = (float)$d['summerLng'];
            if ($la < -90 || $la > 90 || $lo < -180 || $lo > 180 || ($la === 0.0 && $lo === 0.0)) return ['ok' => false, 'error' => 'bad_latlng'];
            $row['summerLat'] = $la; $row['summerLng'] = $lo;
        }
    }

    // Optional geo-mapping. Partial updates preserve any existing point: lat/lng
    // are only written when BOTH are supplied and valid; the fence flag only
    // when explicitly present. mapSource distinguishes an on-site GPS capture
    // from a coordinate entered from a dependable source.
    $hasLat = isset($d['lat']) && $d['lat'] !== '' && $d['lat'] !== null;
    $hasLng = isset($d['lng']) && $d['lng'] !== '' && $d['lng'] !== null;
    if ($hasLat || $hasLng) {
        if (!$hasLat || !$hasLng) return ['ok' => false, 'error' => 'bad_latlng'];
        $lat = (float)$d['lat']; $lng = (float)$d['lng'];
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ($lat === 0.0 && $lng === 0.0)) return ['ok' => false, 'error' => 'bad_latlng'];
        $row['lat'] = $lat; $row['lng'] = $lng;
        $src = (string)($d['mapSource'] ?? 'coordinates');
        $row['mapSource'] = in_array($src, ['onsite', 'coordinates', 'address'], true) ? $src : 'coordinates';
        $row['mapAccuracyM'] = (isset($d['mapAccuracyM']) && $d['mapAccuracyM'] !== '') ? max(0, (int)$d['mapAccuracyM']) : null;
        $row['mappedAt'] = now_iso();
    }
    if (isset($d['radiusM']) && $d['radiusM'] !== '') $row['radiusM'] = max(25, min(5000, (int)$d['radiusM']));
    if (array_key_exists('geofence', $d)) $row['geofence'] = !empty($d['geofence']) ? 1 : 0;

    if ($existing) db_update('centres', $row, ['centreId' => $id]);
    else { $id = 'CTR-' . strtoupper(rand_hex(4)); db_insert('centres', $row + ['centreId' => $id, 'createdAt' => now_iso()]); }
    audit('centre.upsert', $g['requester']['memberId'], $id, ['code' => $code, 'geofence' => $row['geofence'] ?? null], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'centreId' => $id];
}

/**
 * Remove a centre from the directory.
 *
 * Refused while anything still points at it, unless the caller says so
 * explicitly. Deleting a centre used to be an unconditional DELETE on a row
 * that NGG member records reference by NAME, that summer participants
 * reference by name, that summer GROUPS reference by id, and whose code is the
 * prefix already printed on physical cards. Nothing broke loudly; the records
 * simply started pointing at a centre that no longer existed, and the pickers
 * that offer centres stopped offering theirs.
 */
function admin_centres_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (string)($p['centreId'] ?? '');
    $c = $id !== '' ? db_row('SELECT * FROM centres WHERE centreId = ?', [$id]) : null;
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)$c['name'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $name = (string)$c['name'];
    $uses = [
        'members'       => (int)(db_row("SELECT COUNT(*) c FROM members WHERE centre = ?", [$name])['c'] ?? 0),
        'participants'  => (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE centre = ?", [$name])['c'] ?? 0),
        'summerGroups'  => (int)(db_row("SELECT COUNT(*) c FROM summer_groups WHERE centreId = ?", [$id])['c'] ?? 0),
        'volunteers'    => (int)(db_row("SELECT COUNT(*) c FROM volunteers WHERE centre = ?", [$name])['c'] ?? 0),
        'timetable'     => function_exists('tt_centre_uses') ? tt_centre_uses((string)$c['centreId']) : 0,
    ];
    /* Retiring, not deleting, is almost always what is meant, and it is the
       ANSWER to the refusal below rather than something it should block: the
       records keep a name that still resolves and the centre stops being
       offered anywhere. So it is checked first. */
    if (!empty($p['retire'])) {
        db_update('centres', ['status' => 'retired', 'updatedAt' => now_iso()], ['centreId' => $id]);
        audit('centre.retire', $g['requester']['memberId'], $id, ['name' => $name, 'uses' => $uses], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'retired' => true, 'uses' => $uses];
    }
    $total = array_sum($uses);
    if ($total > 0 && empty($p['force'])) {
        return ['ok' => false, 'error' => 'centre_in_use', 'uses' => $uses, 'name' => $name];
    }
    db_exec('DELETE FROM centres WHERE centreId = ?', [$id]);
    audit('centre.delete', $g['requester']['memberId'], $id, ['name' => $name, 'uses' => $uses, 'forced' => !empty($p['force'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'uses' => $uses];
}

/** URL-safe slug from a centre name: lowercase, accents stripped, spaces → "-". */
function centre_slugify(string $s): string {
    $s = trim($s);
    // Best-effort transliteration of accented Latin (Yorùbá diacritics, etc.).
    if (function_exists('iconv')) {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        if ($t !== false) $s = $t;
    }
    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim((string)$s, '-');
}

/**
 * Public projection of a centre's page — everything the immersive /centres
 * page renders, and nothing that isn't safe to publish. Reuses
 * centre_public_meta() for the PII-safe lead + location/schedule.
 */
function centre_page_public(array $c): array {
    $gallery = json_decode((string)($c['gallery'] ?? ''), true);
    $gallery = is_array($gallery) ? array_values(array_filter(array_map('strval', $gallery))) : [];
    $meta = centre_public_meta($c);
    return [
        'slug'      => (string)($c['slug'] ?? ''),
        'name'      => (string)($c['name'] ?? ''),
        'code'      => (string)($c['code'] ?? ''),
        'color'     => (string)($c['color'] ?? '#76B043'),
        'tagline'   => (string)($c['tagline'] ?? ''),
        'headline'  => (string)($c['headline'] ?? ''),
        'story'     => (string)($c['story'] ?? ''),
        'heroImageUrl'       => (string)($c['heroImageUrl'] ?? ''),
        'heroImageMobileUrl' => (string)($c['heroImageMobileUrl'] ?? ''),
        'heroPosition'       => (string)($c['heroPosition'] ?? '') ?: 'center bottom',
        'gallery'   => $gallery,
        'area'      => $meta['area'],
        'address'   => $meta['address'],
        'meetDays'  => $meta['meetDays'],
        'meetTime'  => $meta['meetTime'],
        'lead'      => $meta['lead'],
        'whatsappUrl' => (string)($c['whatsappUrl'] ?? ''),
        /* Where Summer School meets, when it is not here — so a Summer family
           reading the centre's page is not sent to the Club's building. Null
           when Summer meets at the Club's address. */
        'summerVenue' => ($sv = centre_point($c, 'summer'))['venue'] === 'summer'
            ? ['address' => $sv['address'], 'area' => $sv['area']] : null,
    ];
}

/** Public: the directory of published Summer School centres (for /centres). */
function public_centres_list(): array {
    $rows = db_all("SELECT centreId, name, code, color, slug, tagline, headline, heroImageUrl, heroPosition, area, address, meetDays, meetTime, capacity, leadVolunteerId, whatsappUrl, programmes
                    FROM centres WHERE status = 'active' AND pageStatus = 'published' AND slug <> '' ORDER BY name");
    // These are Summer School's centre pages: a Club-only centre is not one.
    $rows = array_values(array_filter($rows, static fn($r) => centre_serves($r, 'summer')));
    $c = summer_ensure_cohort();
    // One grouped count for the list, not one query per centre.
    $byCentre = [];
    foreach (db_all("SELECT centre, COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active' GROUP BY centre", [$c['cohortId']]) as $x) $byCentre[(string)$x['centre']] = (int)$x['c'];
    $centres = [];
    foreach ($rows as $r) {
        $enrolled = $byCentre[(string)$r['name']] ?? 0;
        $meta = centre_public_meta($r);
        $centres[] = [
            'slug'    => (string)$r['slug'],
            'name'    => (string)$r['name'],
            'code'    => (string)$r['code'],
            'color'   => (string)$r['color'],
            'tagline' => (string)$r['tagline'],
            'headline'=> (string)$r['headline'],
            'heroImageUrl' => (string)$r['heroImageUrl'],
            'heroPosition' => (string)($r['heroPosition'] ?? '') ?: 'center bottom',
            'area'    => $meta['area'],
            'meetDays'=> $meta['meetDays'],
            'meetTime'=> $meta['meetTime'],
            'lead'    => $meta['lead'],
            'enrolled'=> $enrolled,
        ];
    }
    return ['ok' => true, 'centres' => $centres];
}

/** Public: one published centre's full immersive page, by slug. */
function public_centre_page(array $p): array {
    $slug = centre_slugify((string)($p['slug'] ?? ''));
    if ($slug === '') return ['ok' => false, 'error' => 'not_found'];
    $c = db_row("SELECT * FROM centres WHERE slug = ? AND status = 'active' AND pageStatus = 'published' LIMIT 1", [$slug]);
    if (!$c || !centre_serves($c, 'summer')) return ['ok' => false, 'error' => 'not_found'];
    $cohort = summer_ensure_cohort();
    $enrolled = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND centre = ? AND status = 'active'", [$cohort['cohortId'], (string)$c['name']])['c'] ?? 0);
    $page = centre_page_public($c);
    $page['enrolled'] = $enrolled;
    $page['capacity'] = (int)($c['capacity'] ?? 0);
    $page['topStudents'] = centre_top_students((string)$c['name']);
    $page['needs'] = centre_needs((string)$c['name']);
    return ['ok' => true, 'centre' => $page];
}

/**
 * Top members at a centre, ranked by XP — PII-safe (first name + last initial
 * only, never a surname). Powers the centre page's "Top students" board.
 */
function centre_top_students(string $centreName, int $limit = 4): array {
    if ($centreName === '') return [];
    $rows = db_all("SELECT m.memberId, m.fullName, m.track, COALESCE(s.xpTotal,0) xp, COALESCE(s.level,1) level, COALESCE(s.badgeCount,0) badges, COALESCE(s.streak,0) streak
                    FROM members m LEFT JOIN member_stats s ON s.memberId = m.memberId
                    /* `type = 'NGG'` is not cosmetic. `members` also holds
                     * type='Summer' rows, and this is a PUBLIC page: without the
                     * filter a summer child appeared here by name, on a surface
                     * with no consent check, while the summer board was
                     * carefully withholding that same child's name until a
                     * guardian granted site_visibility. The sibling
                     * public_leaderboard() has always filtered; this one was
                     * simply missing it. */
                    WHERE m.status = 'active' AND m.type = 'NGG' AND m.centre = ?
                    ORDER BY xp DESC, m.fullName ASC LIMIT " . max(1, min(10, $limit)), [$centreName]);
    // Same public surface, same rule as the leaderboard: no recorded grant, no
    // name. Not batched — this returns at most ten rows.
    $out = []; $rank = 0;
    foreach ($rows as $r) {
        if ((int)$r['xp'] <= 0) continue; // only rank members who've actually earned XP
        $rank++;
        $mid = (string)$r['memberId'];
        $mayName = consent_may_publish($mid)['mayName'];
        $parts = preg_split('/\s+/', trim((string)$r['fullName'])) ?: [];
        $first = $mayName ? ($parts[0] ?? 'Member') : consent_handle_for($mid);
        $initial = ($mayName && count($parts) > 1) ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
        $out[] = [
            'rank' => $rank, 'first' => $first, 'initial' => $initial, 'named' => $mayName,
            'track' => (string)($r['track'] ?? ''),
            'xp' => (int)$r['xp'], 'level' => (int)$r['level'], 'badges' => (int)$r['badges'], 'streak' => (int)$r['streak'],
        ];
    }
    return $out;
}

/**
 * What a centre still needs — the public, actionable slice of the volunteer +
 * material fulfilment board (see volunteer_status_compute). Only unmet needs
 * (gap > 0, or open standing item requests) are surfaced.
 */
function centre_needs(string $centreName): array {
    $out = ['volunteers' => [], 'materials' => [], 'volunteerGap' => 0];
    if ($centreName === '' || !function_exists('volunteer_status_compute')) return $out;
    $mine = null;
    foreach (volunteer_status_compute()['byCentre'] as $b) {
        if ((string)$b['name'] === $centreName) { $mine = $b; break; }
    }
    if (!$mine) return $out;
    foreach (($mine['byRole'] ?? []) as $r) {
        if ((int)$r['gap'] > 0) $out['volunteers'][] = ['role' => (string)$r['role'], 'gap' => (int)$r['gap']];
    }
    foreach (($mine['items'] ?? []) as $it) {
        if (!empty($it['wanted'])) $out['materials'][] = [
            'item' => (string)$it['item'], 'gap' => (int)$it['gap'], 'open' => !empty($it['open']),
            'unit' => (string)($it['unit'] ?? ''), 'filled' => (int)$it['filled'], 'need' => (int)$it['need'],
        ];
    }
    $out['volunteerGap'] = (int)($mine['gap'] ?? 0);
    return $out;
}

/**
 * The academy catalogue editor. Returns the live faculty→courses map (whatever
 * an admin has saved, or the built-in default) plus the default so the UI can
 * offer a "reset" and a flag telling whether the current map is customised.
 */
function admin_academy_catalogue_get(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $saved = academy_catalogue_clean(setting_get('academy_catalogue'));
    // Emit as an ordered list of {faculty, courses} so JSON key order is stable.
    $emit = function (array $map): array {
        $out = [];
        foreach ($map as $fac => $courses) $out[] = ['faculty' => $fac, 'courses' => array_values($courses)];
        return $out;
    };
    return [
        'ok' => true,
        'customised' => (bool)$saved,
        'catalogue' => $emit($saved ?: academy_catalogue_default()),
        'defaults' => $emit(academy_catalogue_default()),
    ];
}

/**
 * Save the academy catalogue (faculty→courses). Accepts either a plain
 * faculty→[courses] map or a list of {faculty, courses}. Cleans/dedupes and
 * requires at least one faculty with one course. Passing an empty map (or the
 * `reset` flag) clears the setting, reverting to the built-in default.
 */
function admin_academy_catalogue_set(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    if (!empty($p['reset'])) {
        setting_set('academy_catalogue', '', $g['requester']['memberId']);
        audit('academy.catalogue.reset', $g['requester']['memberId'], '', [], (string)($p['ip'] ?? ''));
        cache_invalidate('catalogue');
        return ['ok' => true, 'reset' => true];
    }
    // Normalise a {faculty, courses} list into a plain map first.
    $raw = $p['catalogue'] ?? null;
    if (is_array($raw) && $raw && isset($raw[0]) && is_array($raw[0])) {
        $map = [];
        foreach ($raw as $row) {
            if (!is_array($row)) continue;
            $map[(string)($row['faculty'] ?? '')] = is_array($row['courses'] ?? null) ? $row['courses'] : [];
        }
        $raw = $map;
    }
    $clean = academy_catalogue_clean($raw);
    if (!$clean) return ['ok' => false, 'error' => 'catalogue_empty'];
    if (count($clean) > 40) return ['ok' => false, 'error' => 'too_many_faculties'];
    setting_set('academy_catalogue', $clean, $g['requester']['memberId']);
    audit('academy.catalogue.set', $g['requester']['memberId'], '', ['faculties' => count($clean)], (string)($p['ip'] ?? ''));
    cache_invalidate('catalogue');
    return ['ok' => true, 'faculties' => count($clean)];
}

/**
 * The printed card ID: CODE-YY-serial (e.g. IJ-26-001), allocated once per
 * student, serialled per centre + year in allocation order.
 */
function card_display_id(array $student): string {
    if (!empty($student['displayId'])) return (string)$student['displayId'];
    $centre = db_row("SELECT code FROM centres WHERE (name = ? OR code = ?) AND status = 'active' LIMIT 1",
        [(string)($student['centre'] ?? ''), strtoupper((string)($student['centre'] ?? ''))]);
    $code = $centre ? (string)$centre['code'] : CENTRE_FALLBACK_CODE;
    $yy = gmdate('y');
    /* From the highest serial, never a count: a count reuses the number of a
       card that was printed and then removed here, and that card is still in
       somebody's hand. */
    $n = 0; $pre = $code . '-' . $yy . '-';
    foreach (db_all("SELECT displayId FROM summer_students WHERE displayId LIKE ?", [$pre . '%']) as $r) {
        $tail = substr((string)$r['displayId'], strlen($pre));
        if (ctype_digit($tail)) $n = max($n, (int)$tail);
    }
    $n++;
    $displayId = $code . '-' . $yy . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);
    // Serial race safety on shared hosting: bump until free (bounded).
    for ($i = 0; $i < 50 && db_row('SELECT id FROM summer_students WHERE displayId = ?', [$displayId]); $i++) {
        $n++; $displayId = $code . '-' . $yy . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);
    }
    db_update('summer_students', ['displayId' => $displayId], ['studentId' => $student['studentId']]);
    return $displayId;
}

/** Everything the card studio needs to draw front + back for students. */
function admin_cards_data(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $where = "cohortId = ? AND regStatus = 'verified' AND token != ''";
    $params = [$c['cohortId']];
    if (!empty($p['studentId'])) { $where .= ' AND studentId = ?'; $params[] = (string)$p['studentId']; }
    $rows = db_all("SELECT * FROM summer_students WHERE $where ORDER BY id ASC LIMIT 500", $params);
    /* Expiry lives on the CARD (qr_codes), not the child — a reissued card
       starts a fresh window, and the student record outlives any one card.
       Batched: one read for the whole print run, not one per card. */
    $expiryOf = [];
    if ($rows) {
        $ids = array_column($rows, 'studentId');
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT studentId, expiresAt FROM qr_codes WHERE status = 'assigned' AND studentId IN $in", $ids) as $q) {
            $expiryOf[(string)$q['studentId']] = (string)($q['expiresAt'] ?? '');
        }
    }
    $centres = [];
    foreach (db_all("SELECT name, code, color FROM centres WHERE status = 'active'") as $cr) {
        $centres[strtolower($cr['name'])] = $cr;
    }
    $cards = [];
    foreach ($rows as $s) {
        $cards[] = card_row_student($s, $centres[strtolower((string)$s['centre'])] ?? null,
            $expiryOf[(string)$s['studentId']] ?? '');
    }
    return ['ok' => true, 'cards' => $cards, 'program' => idcard_program()];
}

/**
 * One child, in the shape everything that DRAWS a child expects.
 *
 * Its own function because there are now two callers — the card studio's print
 * run and the design studio's data merge — and a second hand-written copy of
 * this mapping is a guarantee that the two eventually disagree. That is not
 * hypothetical: the volunteer card printed no expiry date for months because
 * one of two payload builders read `qr_codes.expiresAt` and the other did not,
 * and nothing said so because both looked complete on their own.
 *
 * `$ctr` is the centres row for this child (or null when the centre they name
 * is not on file), `$expiry` the assigned card's expiry — both looked up in
 * batch by the caller, because a print run of 300 must not be 300 queries.
 */
function card_row_student(array $s, ?array $ctr, string $expiry): array {
    /* The printed ID carries exactly TWO names: first given name + surname.
     * Prefer the parts the family actually gave us — the space-split below
     * is a guess, and it gets a double-barrelled surname wrong and a
     * surname-first entry backwards, on a card that costs money to
     * reprint. It stays as the fallback for rows registered before the
     * form asked for the two separately. */
    $first = trim((string)($s['firstName'] ?? ''));
    $surname = trim((string)($s['lastName'] ?? ''));
    if ($first === '' && $surname === '') {
        $names = preg_split('/\s+/', trim((string)($s['fullName'] ?? ''))) ?: [''];
        $first = (string)array_shift($names);
        $surname = $names ? (string)array_pop($names) : '';
    }
    return [
        'studentId' => $s['studentId'],
        'firstName' => $first, 'surname' => $surname,
        'track' => (string)($s['track'] ?? ''),
        'centre' => ['name' => $ctr['name'] ?? (string)($s['centre'] ?? ''), 'code' => $ctr['code'] ?? 'ST', 'color' => $ctr['color'] ?? '#76B043'],
        'displayId' => card_display_id($s),
        'token' => (string)($s['token'] ?? ''),
        // Printed on the card so the holder and the desk can both see it.
        'expiresAt' => $expiry,
        'photoUrl' => (string)($s['photoUrl'] ?? ''),
        /* Not printed — this is what lets the studio cut a run by date.
           A print run is almost never "everybody": it is the children who
           registered since the last batch went to the printer, and without
           a date on the card record the only way to express that was to
           tick a hundred boxes by hand. */
        'enrolledAt' => (string)($s['enrolledAt'] ?? ''),
    ];
}

/**
 * One NGG MEMBER, in the shape every card renderer reads.
 *
 * The counterpart of card_row_student() / card_row_volunteer(), and it did not
 * exist — which is why the member card could not be driven by a design. The
 * member card was hand-coded JSX reading the raw member row directly, so the
 * design system had no member-shaped row to bind to and the batch could not be
 * cut by a filter the way the summer runs are.
 *
 * `centre` resolves through centre_index() so the card's accent band and its
 * printed prefix come from the CENTRE DIRECTORY rather than from the free-text
 * name on the member's row — which is the only way a colour change at a centre
 * reaches the next card printed there.
 *
 * The name is NOT split here. The member roster holds a single `fullName`
 * (unlike the summer intake, which asks for the parts separately), and any
 * split is a guess about surname order; the template's `member.given` /
 * `member.family` bindings make that guess where it is visible and
 * overridable, not silently in the data layer.
 */
/**
 * NGG MEMBER card rows — the third subject, and the one with no studio.
 *
 * The Card Studio printed Summer School participants and volunteers; members
 * were printed from a drawer inside the member roster instead — the same job,
 * in a different place, through different code. Three subjects, three
 * production paths, two of them in one studio and the third somewhere else.
 *
 * The payload is deliberately IDENTICAL to admin_cards_data and
 * admin_volunteer_cards_data: { ok, cards[], program }. That is what lets the
 * studio gain a third MODE rather than a third implementation.
 *
 * Gated on `people`, not `summer`: a member belongs to the member desk, and a
 * Summer School coordinator has no business printing member credentials.
 * Centre scope is applied to the QUERY, so a scoped admin's run cannot reach
 * past their centres however the studio asks.
 */
function admin_mcards_data(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = ["COALESCE(status,'') <> 'inactive'"];
    $params = [];
    if (!empty($p['memberId'])) { $where[] = 'memberId = ?'; $params[] = (string)$p['memberId']; }
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    if ($scopeNames !== null) {
        if (!$scopeNames) return ['ok' => true, 'cards' => [], 'program' => idcard_program('member')];
        $where[] = 'centre IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')';
        foreach ($scopeNames as $nm) $params[] = $nm;
    }
    /* Members with no printed ID are INCLUDED, not filtered out. The studio's
       value at this step is showing what will come off the printer wrong
       before it does; a run that silently omits the incomplete records is how
       they stay incomplete. The row carries the blank and the studio flags it. */
    $rows = db_all('SELECT * FROM members WHERE ' . implode(' AND ', $where)
        . ' ORDER BY centre ASC, fullName ASC LIMIT 500', $params);
    $centres = centre_index();
    $cards = [];
    foreach ($rows as $m) $cards[] = card_row_member($m, $centres);
    return ['ok' => true, 'cards' => $cards, 'program' => idcard_program('member')];
}

function card_row_member(array $m, array $centres): array {
    $name = trim((string)($m['fullName'] ?? ''));
    $centreName = trim((string)($m['centre'] ?? ''));
    $ctr = $centres[strtolower($centreName)] ?? null;
    /* Disciplines: the card shows up to two, and falls back to the single
       `track` — the same rule the hand-coded renderer uses, kept here so the
       two cannot disagree. */
    $raw = trim((string)($m['disciplines'] ?? ''));
    $list = $raw !== '' ? preg_split('/[,\/|]+/', $raw) : [];
    $list = array_values(array_filter(array_map('trim', $list ?: [])));
    if (!$list && trim((string)($m['track'] ?? '')) !== '') $list = [trim((string)$m['track'])];
    return [
        'memberId'  => (string)($m['memberId'] ?? ''),
        'fullName'  => $name,
        'firstName' => '', 'surname' => '',
        /* The PRINTED id, falling back to the internal one — a card must not
           print a blank where its identifier goes. But the fallback also HID
           the problem: the member roster treats a blank displayId as a
           missing printed ID, filters for it and counts it in the print
           preflight, while the card row silently substituted the internal id
           so nothing downstream could tell the two apart. The card renders
           something valid AND says which it is. */
        'displayId' => (string)($m['displayId'] ?? '') !== '' ? (string)$m['displayId'] : (string)($m['memberId'] ?? ''),
        'displayIdMissing' => (string)($m['displayId'] ?? '') === '',
        'level'     => (string)($m['level'] ?? ''),
        'type'      => (string)($m['type'] ?? ''),
        'status'    => (string)($m['status'] ?? ''),
        'track'     => (string)($m['track'] ?? ''),
        'disciplines' => array_slice($list, 0, 2),
        'centre'    => [
            'name'  => $ctr['name'] ?? $centreName,
            'code'  => $ctr['code'] ?? 'NG',
            'color' => $ctr['color'] ?? '#1B2B6B',
        ],
        /* The member's SECURE card (MEMQR-…, domain/member-cards.php): what the
           CACENTRE gate reads and what /q/ opens. A member with none yet falls
           back to the member id, which the gate still reads by NGG's
           "app-card" format — the shape every card printed before this has. */
        /* A card about to be printed is given its secure code now if it has
           none: a member id in the QR opened the home page when a phone
           scanned it, and a member number is not a secret. */
        'token'     => (function_exists('member_cards_ensure') ? member_cards_ensure($m, 'card', 'created')['secure'] : null) ?? (string)($m['memberId'] ?? ''),
        'cardSecure' => function_exists('member_card_secure') && member_card_secure((string)($m['memberId'] ?? '')) !== null,
        'photoUrl'  => normalize_image_url((string)($m['photoUrl'] ?? '')),
        'joinDate'  => (string)($m['joinDate'] ?? ''),
        'createdAt' => (string)($m['createdAt'] ?? ''),
        /* A member card is not a season pass, so it carries no hard expiry by
           default. A design that prints "VALID TO" gets a blank rather than a
           date the programme never set — which is honest, and visible in the
           proof before three hundred are cut. */
        'expiresAt' => '',
    ];
}

/**
 * Every centre, indexed by lower-cased name AND code, for the callers that have
 * to resolve a free-text centre against the table once per person. One read
 * instead of one query per row: the volunteer card payload used to do the
 * latter, which is 300 queries for a print run of 300 on a shared host.
 */
function centre_index(bool $activeOnly = false): array {
    $sql = 'SELECT name, code, color, status FROM centres' . ($activeOnly ? " WHERE status = 'active'" : '');
    $rows = db_all($sql);
    $out = [];
    // Names in a first pass, codes in a second, so a centre whose NAME is "EG"
    // is never shadowed by a different centre whose CODE is EG.
    foreach ($rows as $c) {
        $out[mb_strtolower((string)$c['name'])] =
            ['name' => (string)$c['name'], 'code' => (string)$c['code'], 'color' => (string)($c['color'] ?: '#76B043')];
    }
    foreach ($rows as $c) {
        $k = mb_strtolower((string)$c['code']);
        if ($k !== '' && !isset($out[$k])) {
            $out[$k] = ['name' => (string)$c['name'], 'code' => (string)$c['code'], 'color' => (string)($c['color'] ?: '#76B043')];
        }
    }
    return $out;
}

// Program/branding identity block for the ID cards — admin-editable via the
// 'idcard' setting (see admin.settings). Logos are configurable URLs so a wrong
// or missing mark can be corrected without a code change.
/**
 * The editable parts of the parental consent document.
 *
 * The form was entirely hardcoded, which is fine until an organisation needs
 * its registered name on a document a parent signs, its own retention period,
 * or a clause its lawyer asked for. None of that should require a deploy —
 * it is their document, not ours.
 *
 * Branding falls back to the ID card settings so there is one place to change
 * a logo or a phone number, and the consent form picks it up.
 */
/**
 * May this person's name / photograph be published on a PUBLIC page?
 *
 * The rule the summer board already applies, in one callable place. It was
 * written out twice (admin2.php for the board, summer.php for the profile) and
 * a third surface — the community showcase — was published with no gate at
 * all, which is precisely what happens when a policy lives in its callers
 * rather than in a function.
 *
 *   site_visibility  → the name may be shown
 *   media            → the photograph may be, and ONLY together with
 *                      site_visibility. Permission to take and use pictures
 *                      internally is not permission to publish a child's face
 *                      on the open web.
 *
 * `regStatus` is a second lock on the same door: a registration the guardian
 * never completed cannot have produced a valid grant, whatever the ledger
 * says. Read live, because `consents` is append-only and last-row-wins — that
 * is how a withdrawal takes effect on the next request rather than at some
 * later rebuild.
 *
 * WHO IS GATED. Children, on both programmes. A summer student, and an NGG
 * Club member whose role is 'member' — the Club's participants are minors too
 * (their record carries a date of birth, a guardian and a school), and for a
 * long time the only reason they were not gated was that nobody had built
 * them a ledger.
 *
 * Everyone else passes through: volunteers and mentors are adults who signed
 * up to be listed, and a `members` row with any staff role is an adult acting
 * in a professional capacity. Role is the right discriminator here rather than
 * `type`, because a child promoted out of the Summer School keeps role
 * 'member' while their type changes.
 *
 * The default for a gated child with no ledger row is NOT NAMED. That is the
 * only safe direction: a missing record means nobody asked, and nobody asked
 * is not the same as yes.
 */
function consent_may_publish(string $subjectId): array {
    if ($subjectId === '') return ['mayName' => false, 'mayPhoto' => false, 'gated' => false];

    $verified = true;
    $stu = db_row("SELECT regStatus FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
    if ($stu) {
        // A registration the guardian never completed cannot have produced a
        // valid grant, whatever the ledger says — a second lock on the door.
        $verified = ((string)($stu['regStatus'] ?? 'verified')) === 'verified';
    } else {
        $mem = db_row("SELECT role FROM members WHERE memberId = ? LIMIT 1", [$subjectId]);
        // Not a child on either programme: nothing to gate.
        if (!$mem || strtolower((string)($mem['role'] ?? '')) !== 'member') {
            return ['mayName' => true, 'mayPhoto' => true, 'gated' => false];
        }
    }

    $cs = [];
    foreach (db_all("SELECT type, status FROM consents WHERE studentId = ? AND type IN ('site_visibility','media') ORDER BY id",
                    [$subjectId]) as $c) {
        $cs[(string)$c['type']] = (string)$c['status'];
    }
    $mayName  = $verified && (($cs['site_visibility'] ?? '') === 'granted');
    $mayPhoto = $mayName && (($cs['media'] ?? '') === 'granted');
    return ['mayName' => $mayName, 'mayPhoto' => $mayPhoto, 'gated' => true];
}

/**
 * The same decision for many subjects at once.
 *
 * Boards ask this for every row, and a per-row lookup is the N+1 that has had
 * to be undone twice already in this codebase. It exists mainly so that the
 * batched callers do not each hand-roll the policy — which is precisely how
 * the community showcase ended up with no gate at all while two other
 * surfaces had one.
 *
 * Returns a map keyed by id; ids that resolve to nobody are simply absent.
 */
function consent_may_publish_many(array $subjectIds): array {
    $ids = array_values(array_unique(array_filter(array_map('strval', $subjectIds), fn($x) => $x !== '')));
    if (!$ids) return [];
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';

    $verifiedOf = [];   // summer students, by studentId
    foreach (db_all("SELECT studentId, regStatus FROM summer_students WHERE studentId IN $in", $ids) as $r) {
        $verifiedOf[(string)$r['studentId']] = ((string)($r['regStatus'] ?? 'verified')) === 'verified';
    }
    $roleOf = [];       // members, by memberId
    foreach (db_all("SELECT memberId, role FROM members WHERE memberId IN $in", $ids) as $r) {
        $roleOf[(string)$r['memberId']] = strtolower((string)($r['role'] ?? ''));
    }
    $csOf = [];
    foreach (db_all("SELECT studentId, type, status FROM consents
                     WHERE studentId IN $in AND type IN ('site_visibility','media') ORDER BY id", $ids) as $c) {
        $csOf[(string)$c['studentId']][(string)$c['type']] = (string)$c['status'];
    }

    $out = [];
    foreach ($ids as $id) {
        $isStudent = array_key_exists($id, $verifiedOf);
        $isChild   = $isStudent || (($roleOf[$id] ?? '') === 'member');
        if (!$isChild) { $out[$id] = ['mayName' => true, 'mayPhoto' => true, 'gated' => false]; continue; }
        $verified = $isStudent ? $verifiedOf[$id] : true;
        $cs = $csOf[$id] ?? [];
        $mayName  = $verified && (($cs['site_visibility'] ?? '') === 'granted');
        $out[$id] = ['mayName' => $mayName, 'gated' => true,
                     'mayPhoto' => $mayName && (($cs['media'] ?? '') === 'granted')];
    }
    return $out;
}

/**
 * A stable, non-revealing stand-in for a child who may not be named.
 *
 * Derived from the id, never from the name — a handle built out of the name is
 * not a pseudonym, it is the name with extra steps. Matches the fallback the
 * summer board already uses for a student with no handle of their own.
 */
function consent_handle_for(string $subjectId): string {
    $tail = strtolower(substr(preg_replace('/[^A-Za-z0-9]/', '', $subjectId), -4));
    return 'ngg' . ($tail !== '' ? $tail : '0000');
}

/**
 * Record a guardian's publication decision for a child. Append-only: the last
 * row for a type is the current answer, which is how a withdrawal works.
 *
 * `method` and `actorName` are not decoration. A ledger row that does not say
 * how the decision was obtained and who recorded it is a checkbox, not
 * evidence, and this is the record the programme would have to stand behind.
 */
function consent_record(string $subjectId, string $type, string $status, string $method, string $actorName): array {
    if (!isset(CONSENT_TYPES[$type])) return ['ok' => false, 'error' => 'bad_type'];
    if (!in_array($status, ['granted', 'declined'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $method = trim($method);
    if ($method === '') return ['ok' => false, 'error' => 'method_required'];
    db_insert('consents', [
        'studentId' => $subjectId, 'type' => $type, 'status' => $status,
        'method' => mb_substr($method, 0, 60), 'actorName' => mb_substr(trim($actorName), 0, 120),
        'createdAt' => now_iso(),
    ]);
    return ['ok' => true];
}

/** The current decision per type for a subject, with how it was recorded. */
function consent_state(string $subjectId): array {
    $out = [];
    foreach (db_all("SELECT type, status, method, actorName, createdAt FROM consents WHERE studentId = ? ORDER BY id", [$subjectId]) as $c) {
        $out[(string)$c['type']] = ['status' => (string)$c['status'], 'method' => (string)($c['method'] ?? ''),
                                    'by' => (string)($c['actorName'] ?? ''), 'at' => (string)($c['createdAt'] ?? '')];
    }
    return $out;
}

function consent_doc_settings(): array {
    $card = idcard_program();
    $cfg = setting_get('consent_doc');
    $c = is_array($cfg) ? $cfg : [];
    $c += [
        'orgName'      => '',                                  // registered legal name, if different
        'orgAddress'   => '',
        'rcNumber'     => '',                                  // CAC registration
        'dpoContact'   => '',                                  // who a parent writes to about their data
        'retentionYears' => 6,
        'formRef'      => 'CF-1',
        'formRev'      => '2026.1',
        'extraClause'  => '',                                  // an additional clause, if their adviser adds one
        'extraClauseTitle' => '',
        /* Where the FULL consent text lives, for the self-serve form to link
         * out to. One tick standing for seven clauses is only honest if the
         * clauses are one tap away, so this is not decoration. Defaults to the
         * site's own Parental Consent document; override it to point at a
         * hosted PDF or a version your legal adviser signed off. */
        'consentUrl'   => '',
        'logoUrl'      => (string)($card['logoLockup'] ?? ''),
        'website'      => (string)($card['website'] ?? ''),
        'phone'        => (string)($card['phone'] ?? ''),
    ];
    $c['retentionYears'] = max(1, min(50, (int)$c['retentionYears']));
    return $c;
}

/** The link the public form points at for the full consent wording. Falls back
 *  to the site's own Parental Consent document, which is always present — a
 *  blank setting must never produce a dead "read the full consent" link. */
function consent_public_url(): string {
    $u = trim((string)(consent_doc_settings()['consentUrl'] ?? ''));
    return $u !== '' ? $u : '/legal?doc=consent';
}

function consent_doc_save(array $in, string $by): array {
    $cur = consent_doc_settings();
    $out = $cur;
    foreach (['orgName' => 160, 'orgAddress' => 300, 'rcNumber' => 40, 'dpoContact' => 200,
              'formRef' => 20, 'formRev' => 20, 'extraClauseTitle' => 120, 'extraClause' => 2000,
              'logoUrl' => 512, 'website' => 160, 'phone' => 60, 'consentUrl' => 512] as $k => $max) {
        if (array_key_exists($k, $in)) $out[$k] = substr(trim((string)$in[$k]), 0, $max);
    }
    if (array_key_exists('retentionYears', $in)) $out['retentionYears'] = max(1, min(50, (int)$in['retentionYears']));
    setting_set('consent_doc', $out, $by);
    return $out;
}

/* ── How long an ID is valid ────────────────────────────────────────────────
 * A summer card is a season pass, not a life membership. Without an expiry a
 * child who finished in August still opens a gate the following March, and a
 * volunteer who left still scans as active staff — the card outlives the
 * relationship it represents, which is the whole risk of issuing one.
 *
 * Admin-defined, defaulting to three months. Zero means never expires, which
 * some programmes will legitimately want for their NGG members; it is spelled
 * out rather than implied by an empty box.
 */
function idcard_validity_days(): int {
    $cfg = setting_get('idcard');
    $d = is_array($cfg) && array_key_exists('validityDays', $cfg) ? (int)$cfg['validityDays'] : 90;
    return $d <= 0 ? 0 : max(1, min(3650, $d));
}

/** The expiry date for a card issued now (''=never). */
function idcard_expiry_for(?int $from = null): string {
    $days = idcard_validity_days();
    if ($days === 0) return '';
    return gmdate('Y-m-d', ($from ?? time()) + $days * 86400);
}

/** Has this card passed its expiry? Blank expiry never expires. */
function idcard_expired(?string $expiresAt, ?string $on = null): bool {
    $e = trim((string)$expiresAt);
    if ($e === '') return false;
    return substr($e, 0, 10) < ($on ?? gmdate('Y-m-d'));
}

/**
 * The ID-card configuration for ONE subject.
 *
 * This was a single blob serving both programmes, so an NGG member's card and
 * a Summer School participant's card were issued under the same programme
 * name, the same motto, the same validity clock and the same trim. They are
 * not the same thing: Summer School is a PHASE — one season, a card that
 * expires with it, a lanyard — and NGG is the programme somebody belongs to
 * for years, on an ID-1 card that lives in a wallet and does not expire on a
 * ninety-day timer.
 *
 * What is genuinely SHARED stays shared: the organisation's website, phone
 * and logos are the same organisation whichever card is printed, and keeping
 * them in one place is why a phone-number change does not have to be made
 * twice. What is per-programme is per-programme.
 *
 * Backwards compatible on purpose: the stored blob IS the Summer School
 * config, unchanged and still edited by the same screens, so no deployment
 * needs a migration or a re-save. NGG's overrides live under `ngg` beside it.
 */
function idcard_program(string $subject = 'student'): array {
    $cfg = setting_get('idcard');
    $p = is_array($cfg) ? $cfg : [];
    $isMember = ($subject === 'member');
    /* NGG's own block, layered over the shared organisation fields. Absent on
       an existing deployment, which is why every key below has a default. */
    if ($isMember) {
        $ngg = is_array($p['ngg'] ?? null) ? $p['ngg'] : [];
        // Only the SHARED organisation identity carries over; everything that
        // describes the programme or the card is NGG's own.
        $shared = array_intersect_key($p, array_flip(['website', 'phone', 'logoLockup', 'logoOkun']));
        $p = $ngg + $shared + [
            'program'      => 'NGG',
            'motto'        => 'EMPOWERED 360°',
            // ID-1, the size of a wallet slot. See docs/PRINT-SPEC.md.
            'widthMm'      => 54, 'heightMm' => 85,
            // A membership is not a season. 0 = does not expire, which is a
            // stated choice rather than an empty box meaning it by accident.
            'validityDays' => 0,
        ];
    }
    // Default the printed website to NGG (the main site, where every /q/<token>
    // profile resolves) — not the not-yet-live STS domain. Admin-overridable.
    $siteHost = preg_replace('#^https?://#', '', rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? 'next.afrovanguard.org.ng'), '/')) ?: 'next.afrovanguard.org.ng';
    $p += [
        'program' => 'LCASP', 'year' => gmdate('Y'), 'motto' => 'EMPOWERED 360°',
        'website' => $siteHost, 'phone' => '+234 903 777 6318',
        'logoLockup' => '/assets/idcard/logo-lockup.png',
        'logoOkun' => '/assets/idcard/logo-okun.png',
        'widthMm' => 54, 'heightMm' => 75,
        'validityDays' => 90,
    ];
    // Physical print size (mm). The card artwork reflows to any proportion in
    // this range without distortion; the bounds just keep it legible.
    $p['widthMm']  = idcard_clamp_mm($p['widthMm'], 50, 60, 54);
    $p['heightMm'] = idcard_clamp_mm($p['heightMm'], 64, 100, $isMember ? 85 : 75);
    $p['subject']  = $isMember ? 'member' : 'student';
    return $p;
}

/** Clamp a card dimension (mm) to [min,max], falling back to $def when unparseable. */
function idcard_clamp_mm($v, float $min, float $max, float $def): float {
    if (!is_numeric($v)) return $def;
    return round(max($min, min($max, (float)$v)), 1);
}

// Validate + persist the ID-card branding block (called from admin.settings.set).
function idcard_program_save(array $in, string $by, string $subject = 'student'): void {
    // Merge onto the stored blob so a partial update (e.g. just the card size
    // from the ID studio) never wipes the branding fields, and vice-versa.
    $cur = setting_get('idcard');
    $root = is_array($cur) ? $cur : [];
    $isMember = ($subject === 'member');
    /* A member's settings are written into their own block, so saving one
       programme's card can never move the other's. The organisation fields
       are the exception and stay at the root, because they describe the
       organisation rather than either programme. */
    $clean = $isMember ? (is_array($root['ngg'] ?? null) ? $root['ngg'] : []) : $root;
    foreach (['program', 'year', 'motto', 'website', 'phone', 'logoLockup', 'logoOkun'] as $k) {
        if (array_key_exists($k, $in)) $clean[$k] = substr(trim((string)$in[$k]), 0, 512);
    }
    // Card proportions (mm) — validated to the same safe range as on read.
    if (array_key_exists('widthMm', $in))  $clean['widthMm']  = idcard_clamp_mm($in['widthMm'], 50, 60, 54);
    if (array_key_exists('heightMm', $in)) $clean['heightMm'] = idcard_clamp_mm($in['heightMm'], 64, 100, 75);
    // How long a newly issued card is valid. 0 = never expires, which is a
    // deliberate choice an admin can make rather than an empty box meaning it
    // by accident. Existing cards keep the expiry they were issued with —
    // changing the policy must not silently extend or revoke a card already
    // in a child's pocket.
    if (array_key_exists('validityDays', $in)) {
        $d = (int)$in['validityDays'];
        $clean['validityDays'] = $d <= 0 ? 0 : max(1, min(3650, $d));
    }
    if ($isMember) {
        foreach (['website', 'phone', 'logoLockup', 'logoOkun'] as $k) {
            if (array_key_exists($k, $clean)) { $root[$k] = $clean[$k]; unset($clean[$k]); }
        }
        $root['ngg'] = $clean;
        setting_set('idcard', $root, $by);
        return;
    }
    setting_set('idcard', $clean, $by);
}
