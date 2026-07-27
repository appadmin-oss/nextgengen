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
    'media'         => ['p' => 1, 'label' => 'Photos & media'],
    'site_visibility' => ['p' => 1, 'label' => 'Feature on our website'],
    'trips'         => ['p' => 2, 'label' => 'Off-site activities'],
    'comms'         => ['p' => 2, 'label' => 'Program updates by SMS/email'],
];
const FORM_FIELD_TYPES = ['text', 'longtext', 'email', 'phone', 'number', 'date', 'choice', 'multi', 'yesno', 'file', 'section', 'info'];

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
    return [
        'AI & Technology'  => ['Practical Coding', 'AI Tools Application', 'Digital Problem-Solving'],
        'Entrepreneurship' => ['Data Appreciation', 'Google Workspace'],
        'Media'            => ['Graphics', 'Video', 'Editing', 'Content Management'],
        'Creative Arts'    => ['Tie & Dye', 'Dance', 'Acting', 'Catering', 'Visual Design', 'Drawing', 'High-Impact Artistic Expressions'],
        'Music'            => ['Talking Drums', 'Piano', 'Guitar', 'Drums'],
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

function form_default_fields(): array {
    return [
        ['key' => 'fullName', 'label' => 'Full name', 'type' => 'text', 'required' => true, 'locked' => true],
        ['key' => 'age', 'label' => 'Age', 'type' => 'number', 'required' => true, 'min' => 5, 'max' => 19, 'locked' => true],
        // Faculty is asked FIRST and narrows Course. Both are locked keys: the
        // catalogue, the /v-status breakdowns and instructor matching read them.
        ['key' => 'faculty', 'label' => 'Faculty', 'type' => 'choice', 'required' => true, 'locked' => true, 'options' => academy_faculties(), 'help' => 'Starts from the academy catalogue in Admin → Settings. Picking one narrows the Course list below to that faculty\'s courses; edit these options to override the list for this form.'],
        ['key' => 'course', 'label' => 'Course', 'type' => 'choice', 'required' => true, 'locked' => true, 'optionsFrom' => 'faculty', 'options' => academy_courses(), 'help' => 'Courses are filtered by the chosen faculty — that mapping always comes live from Admin → Settings. This option list starts from the catalogue; type your own here to override it for this form.'],
        ['key' => 'centre', 'label' => 'Centre', 'type' => 'choice', 'required' => true, 'options' => ['Main'], 'help' => 'Options come from Admin → Centres; drives the ID prefix and card colour.'],
        ['key' => 'parentName', 'label' => "Parent / guardian's name", 'type' => 'text', 'required' => true],
        ['key' => 'parentPhone', 'label' => "Parent's phone", 'type' => 'phone', 'required' => false, 'help' => 'Either phone or email is required — both is best.', 'locked' => true],
        ['key' => 'parentEmail', 'label' => "Parent's email", 'type' => 'email', 'required' => false, 'locked' => true],
        ['key' => 'school', 'label' => 'School', 'type' => 'text', 'required' => false],
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
        ['key' => 'email', 'label' => 'Email', 'type' => 'email', 'required' => true, 'locked' => true],
        ['key' => 'phone', 'label' => 'Phone', 'type' => 'phone', 'required' => false, 'locked' => true, 'help' => 'Required for instructors — enforced at submit.'],
        // Faculty is the teaching group mentors & instructors belong to. Locked
        // key (the /v-status board + validation read it), but its OPTIONS are
        // admin-editable here — the single source of truth for the catalogue.
        ['key' => 'faculty', 'label' => 'Faculty', 'type' => 'choice', 'required' => false, 'locked' => true, 'options' => academy_faculties(), 'help' => 'The academy / faculty catalogue — edit these options freely (add/rename/remove). Required for mentors & instructors; drives the /v-status faculty breakdown.'],
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
    $row['fields'] = form_hydrate_options(form_restore_locked($stored, $formId), $formId);
    return $row;
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
 * Missing fields are inserted at their default position, which keeps Faculty
 * ahead of Course — the conditional-logic pass resolves top-down, so a field
 * that narrows another has to come first. Fields the admin added are left
 * where they are.
 */
function form_restore_locked(array $stored, string $formId = 'summer-reg'): array {
    $defaults = form_defaults_for($formId);
    $have = [];
    foreach ($stored as $f) if (is_array($f) && isset($f['key'])) $have[(string)$f['key']] = true;

    foreach ($defaults as $i => $def) {
        if (empty($def['locked'])) continue;
        if (isset($have[$def['key']])) continue;
        array_splice($stored, min($i, count($stored)), 0, [$def]);
        $have[$def['key']] = true;
    }
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
    $centres = array_column(db_all("SELECT name FROM centres WHERE status = 'active' ORDER BY name"), 'name');

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
            case 'date': if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', is_array($v) ? '' : $v)) $errors[$k] = 'Use the date picker.'; break;
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

function admin_gates_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT gateId, name, cohortId, centreId, status, createdBy, expiresAt, usedCount, createdAt, passHash, passSetAt, passRotateDays, passNotify, passExpiryDays, passExpiresAt FROM gate_links ORDER BY id DESC LIMIT 50');
    foreach ($rows as &$r) {
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
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
    db_insert('gate_links', [
        'gateId' => $gateId, 'name' => substr(trim((string)($p['name'] ?? 'Front desk')), 0, 160),
        'cohortId' => $c['cohortId'], 'centreId' => (string)($p['centreId'] ?? ''), 'status' => 'active',
        'createdBy' => $g['requester']['memberId'], 'passHash' => $passHash,
        'passSetAt' => $passHash !== '' ? now_iso() : '',
        'passRotateDays' => $rotate, 'passNotify' => $notify,
        'passExpiryDays' => $expiryDays,
        'passExpiresAt' => ($passHash !== '' && $expiryDays > 0) ? gmdate('Y-m-d\TH:i:s\Z', time() + $expiryDays * 86400) : '',
        'expiresAt' => $expiresAt, 'createdAt' => now_iso(),
    ]);
    audit('gate.create', $g['requester']['memberId'], $gateId, ['kiosk' => $passHash !== '', 'rotateDays' => $rotate], (string)($p['ip'] ?? ''));
    // The plaintext is returned exactly once, here. Only the hash is stored,
    // so nothing can hand it back later — the panel has to show it now.
    return ['ok' => true, 'gateId' => $gateId, 'hasPassword' => $passHash !== '', 'password' => $plain,
            'url' => rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/gate?g=' . $gateId];
}

/** Set or clear a gate's kiosk password. Empty password removes it. */
function admin_gates_setpass(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
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
              . '<p>Desk link: <a href="' . htmlspecialchars($origin . '/gate?g=' . $gate['gateId'], ENT_QUOTES) . '">' . htmlspecialchars($origin . '/gate?g=' . $gate['gateId'], ENT_QUOTES) . '</a></p>'
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $gateId = (string)($p['gateId'] ?? '');
    if (!db_row('SELECT gateId FROM gate_links WHERE gateId = ?', [$gateId])) return ['ok' => false, 'error' => 'not_found'];
    $expiresAt = gate_expiry_normalise($p['expiresAt'] ?? '', $p['validDays'] ?? null);
    if ($expiresAt === null) return ['ok' => false, 'error' => 'bad_expiry'];
    db_update('gate_links', ['expiresAt' => $expiresAt], ['gateId' => $gateId]);
    audit('gate.validity_set', $g['requester']['memberId'], $gateId, ['expiresAt' => $expiresAt], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'expiresAt' => $expiresAt];
}

function admin_gates_revoke(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $n = db_update('gate_links', ['status' => 'revoked', 'revokedAt' => now_iso()], ['gateId' => (string)($p['gateId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('gate.revoke', $g['requester']['memberId'], (string)$p['gateId'], [], (string)($p['ip'] ?? ''));
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
    $pw = (string)($p['password'] ?? '');
    if ($pw === '' || !password_verify($pw, (string)$gate['passHash'])) {
        audit('gate.unlock_fail', 'kiosk', (string)$gate['gateId'], [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'bad_password'];
    }
    audit('gate.unlock', 'kiosk:' . $gate['gateId'], (string)$gate['gateId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'gate' => [
        'gateId' => (string)$gate['gateId'], 'name' => (string)$gate['name'],
        'cohortId' => (string)$gate['cohortId'], 'expiresAt' => (string)($gate['expiresAt'] ?? ''),
    ]];
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
    $centres = db_all("SELECT name, code FROM centres WHERE status = 'active' ORDER BY name");
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
        'consentTypes' => CONSENT_TYPES];
}

function gate_register(array $p): array {
    $gate = gate_resolve((string)($p['gate'] ?? ''));
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    $live = form_live();

    // Capture the device location if the client sent one — recorded regardless
    // of the toggle, for the anti-cheat ledger.
    $regLat = (isset($p['lat']) && is_numeric($p['lat'])) ? (float)$p['lat'] : null;
    $regLng = (isset($p['lng']) && is_numeric($p['lng'])) ? (float)$p['lng'] : null;
    $regGeoOk = null; $regGeoDist = null;
    $incoming = is_array($p['data'] ?? null) ? $p['data'] : [];

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
    $centreNames = array_column(db_all("SELECT name FROM centres WHERE status = 'active'"), 'name');
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
        'fullName' => (string)$d['fullName'], 'age' => (int)($d['age'] ?? 0),
        'centre' => substr((string)($d['centre'] ?? ''), 0, 48), 'track' => substr((string)($d['course'] ?? ''), 0, 64),
        'photoUrl' => (string)($p['photoUrl'] ?? ''),
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

    // Photo pipeline: ingest the captured headshot and run the free-AI triage →
    // identity-safe Cloudinary edit → auto-approve / editor-queue. Best-effort —
    // a pipeline hiccup must never fail the registration itself.
    $photoUrl = (string)($p['photoUrl'] ?? '');
    if ($photoUrl !== '' && function_exists('photo_ingest')) {
        try {
            $ing = photo_ingest('student', $studentId, $photoUrl, (string)($p['byId'] ?? ''));
            if (!empty($ing['ok']) && function_exists('photo_process')) photo_process($ing['assetId']);
        } catch (Throwable $e) { error_log('[gate_register] photo pipeline: ' . $e->getMessage()); }
    }

    $sent = registration_send_verification($studentId);
    event_emit('registration.created', [
        'ref' => $studentId, 'name' => (string)$d['fullName'], 'course' => (string)($d['course'] ?? ''),
        'parentContact' => $pEmail !== '' ? mask_email($pEmail) : substr($pPhone, 0, 7) . '•••',
        'status' => 'parent_pending', 'gate' => (string)$gate['name'],
    ]);
    return ['ok' => true, 'ref' => $studentId, 'studentId' => $studentId, 'regStatus' => 'parent_pending',
        'verificationSent' => $sent, 'centre' => (string)($d['centre'] ?? ''),
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
        $html = email_template([
            'title' => 'Confirm ' . esc_html($first) . "'s registration",
            'intro' => 'Hello' . (!empty($s['guardianName']) ? ' ' . esc_html((string)$s['guardianName']) : '') . ' — ' . esc_html((string)$s['fullName']) . ' was registered for NGG Summer School today.',
            'bodyHtml' => '<p style="margin:0 0 10px"><b>Why you got this:</b> we need your consent before the registration is complete. It takes about a minute, and you can also tell us anything we should know.</p>',
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

function parent_verify_context(array $p): array {
    $s = db_row('SELECT * FROM summer_students WHERE verifyToken = ? LIMIT 1', [(string)($p['t'] ?? '')]);
    if (!$s) return ['ok' => false, 'error' => 'link_invalid'];
    if ((string)$s['regStatus'] === 'verified') return ['ok' => true, 'done' => true, 'student' => ['name' => $s['fullName']]];
    if (!empty($s['verifyExpiresAt']) && $s['verifyExpiresAt'] < now_iso()) return ['ok' => false, 'error' => 'link_expired'];
    return ['ok' => true, 'done' => false,
        'student' => ['name' => (string)$s['fullName'], 'course' => (string)$s['track'], 'photoUrl' => (string)$s['photoUrl']],
        'guardianName' => (string)$s['guardianName'],
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
    $actor = substr(trim((string)($p['actorName'] ?? $s['guardianName'] ?? '')), 0, 160);
    foreach (CONSENT_TYPES as $type => $meta) {
        db_insert('consents', ['studentId' => $s['studentId'], 'type' => $type,
            'status' => !empty($consents[$type]) ? 'granted' : 'declined',
            'method' => 'parent_link', 'actorName' => $actor, 'createdAt' => now_iso()]);
    }

    // Consent recorded → mark verified. ID/QR issuance may still be gated on
    // photo approval (see registration_issue_id); whichever finishes last —
    // consent here or the editor approving the photo — triggers the ID.
    db_update('summer_students', ['regStatus' => 'verified', 'verifiedAt' => now_iso(), 'updatedAt' => now_iso()], ['studentId' => $s['studentId']]);
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
function registration_issue_id(string $studentId): array {
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($s['token'])) return ['ok' => true, 'already' => true, 'token' => (string)$s['token']];
    if ((string)$s['regStatus'] !== 'verified') return ['ok' => true, 'held' => true, 'reason' => 'consent_pending'];
    // Photo gate: only hold when the toggle is on AND a photo is actually in the
    // pipeline for this student — a registration with no photo is never blocked.
    if (setting_raw('photo_gate_issuance') === '1' && function_exists('photo_approved_for')) {
        $hasPhoto = db_row("SELECT id FROM photo_assets WHERE subjectType = 'student' AND subjectId = ? AND status NOT IN ('rejected','superseded') LIMIT 1", [$studentId]);
        if ($hasPhoto && !photo_approved_for('student', $studentId)) return ['ok' => true, 'held' => true, 'reason' => 'photo_pending'];
    }
    // Bind the ID/QR (mint a blank if the pool is dry).
    $qr = db_row("SELECT * FROM qr_codes WHERE status = 'blank' ORDER BY id ASC LIMIT 1");
    if (!$qr) {
        $tok = 'SUMQR-' . strtoupper(rand_hex(4));
        db_insert('qr_codes', ['token' => $tok, 'batch' => 'AUTO', 'cohortId' => $s['cohortId'], 'status' => 'blank', 'studentId' => '', 'assignedName' => '', 'createdAt' => now_iso(), 'assignedAt' => '']);
        $qr = db_row('SELECT * FROM qr_codes WHERE token = ?', [$tok]);
    }
    db_update('qr_codes', ['status' => 'assigned', 'studentId' => $s['studentId'], 'assignedName' => (string)$s['handle'], 'assignedAt' => now_iso(), 'cohortId' => $s['cohortId']], ['token' => $qr['token']]);
    db_update('summer_students', ['token' => $qr['token'], 'updatedAt' => now_iso()], ['studentId' => $s['studentId']]);
    card_display_id(db_row('SELECT * FROM summer_students WHERE studentId = ?', [$s['studentId']]) ?: $s);
    audit('registration.id_issued', null, $studentId, ['token' => $qr['token']], '');
    event_emit('registration.id_issued', ['ref' => $studentId, 'name' => (string)$s['fullName'], 'token' => (string)$qr['token']]);
    return ['ok' => true, 'issued' => true, 'token' => (string)$qr['token']];
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
        // Embed the scannable QR when we have a hosted copy for this token.
        $qrHtml = qr_cache_exists((string)$s['token'])
            ? '<div style="text-align:center;margin:6px 0 14px"><img src="' . esc_html(qr_public_url((string)$s['token'])) . '" width="180" height="180" alt="Check-in QR for ' . $first . '" style="width:180px;height:180px;border:1px solid #e4e4e4;border-radius:12px;padding:8px;background:#fff"/><div style="font:400 12px monospace;color:#888;margin-top:6px">Scan at any centre to check in</div></div>'
            : '';
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
        $v = db_row('SELECT volunteerId, token FROM volunteers WHERE volunteerId = ? LIMIT 1', [$id]);
        if (!$v) return ['ok' => false, 'error' => 'not_found'];
        if (empty($v['token'])) return ['ok' => false, 'error' => 'no_id'];
        if ($qrPng !== '') qr_cache_store((string)$v['token'], $qrPng);
        $channels = volunteer_send_id($id);
        audit('admin.id.resend', $g['requester']['memberId'], $id, ['kind' => 'volunteer', 'channels' => $channels, 'qr' => qr_cache_exists((string)$v['token'])], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'channels' => $channels, 'kind' => 'volunteer', 'qr' => qr_cache_exists((string)$v['token'])];
    }

    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $st = db_row('SELECT token FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
    if ($qrPng !== '' && $st && !empty($st['token'])) qr_cache_store((string)$st['token'], $qrPng);
    $res = student_send_id($id);
    if (empty($res['ok'])) return $res;
    $hasQr = $st && !empty($st['token']) && qr_cache_exists((string)$st['token']);
    audit('admin.id.resend', $g['requester']['memberId'], $id, ['kind' => 'student', 'channels' => $res['channels'], 'qr' => $hasQr], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'channels' => $res['channels'], 'kind' => 'student', 'qr' => $hasQr];
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
    $url = (string)($p['photoUrl'] ?? '');
    if ($url === '' || !preg_match('#^https://#', $url)) return ['ok' => false, 'error' => 'bad_photo'];
    if (!function_exists('photo_ingest')) return ['ok' => false, 'error' => 'pipeline_unavailable'];
    $ing = photo_ingest('student', (string)$s['studentId'], $url, 'guardian');
    if (empty($ing['ok'])) return $ing;
    $pr = function_exists('photo_process') ? photo_process($ing['assetId']) : ['status' => 'captured'];
    audit('photo.reshoot', 'guardian', (string)$s['studentId'], ['assetId' => $ing['assetId'], 'v' => $ing['version']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $pr['status'] ?? 'analyzing', 'version' => $ing['version']];
}

/* ── Admin registration queue (the "Needs you" list) ─────────────────────── */

function admin_registrations_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $rows = db_all("SELECT studentId, fullName, track, regStatus, guardianName, guardianPhone, parentEmail, enrolledAt, remindedAt, verifiedAt, photoUrl, token FROM summer_students WHERE cohortId = ? ORDER BY id DESC LIMIT 500", [$c['cohortId']]);
    $consents = [];
    foreach (db_all("SELECT studentId, type, status FROM consents WHERE status = 'granted'") as $cr) $consents[$cr['studentId']][] = $cr['type'];
    foreach ($rows as &$r) { $r['consents'] = $consents[$r['studentId']] ?? []; }
    $pending = array_values(array_filter($rows, fn($r) => $r['regStatus'] === 'parent_pending'));
    return ['ok' => true, 'registrations' => $rows, 'pendingCount' => count($pending)];
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

/** Active centres that are fenced AND carry a mapped point. */
function geo_fenced_centres(): array {
    return db_all("SELECT centreId, name, code, color, lat, lng, radiusM FROM centres
                   WHERE status = 'active' AND geofence = 1 AND lat IS NOT NULL AND lng IS NOT NULL");
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

function admin_centres_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $rows = db_all("SELECT centreId, name, code, color, status, capacity, address, area, leadVolunteerId, phone, email, meetDays, meetTime, notes, whatsappUrl, lat, lng, radiusM, geofence, mapSource, mapAccuracyM, mappedAt, slug, pageStatus, tagline, headline, heroImageUrl, heroImageMobileUrl, heroPosition, story, gallery, pageUpdatedAt FROM centres ORDER BY name");
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
        $r['enrolled'] = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND centre = ? AND status = 'active'", [$c['cohortId'], (string)$r['name']])['c'] ?? 0);
        $r['waitlisted'] = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND centre = ? AND status = 'waitlisted'", [$c['cohortId'], (string)$r['name']])['c'] ?? 0);
        $r['full'] = ((int)$r['capacity'] > 0 && $r['enrolled'] >= (int)$r['capacity']);
        $lid = (string)($r['leadVolunteerId'] ?? '');
        $r['leadName'] = $lid !== '' ? ($volById[$lid] ?? db_row('SELECT fullName FROM volunteers WHERE volunteerId = ?', [$lid])['fullName'] ?? '') : '';
        // gallery is stored as a JSON array of image URLs — hand the editor an array.
        $g2 = json_decode((string)($r['gallery'] ?? ''), true);
        $r['gallery'] = is_array($g2) ? array_values(array_filter(array_map('strval', $g2))) : [];
        if (($r['slug'] ?? '') === '') $r['slug'] = centre_slugify((string)$r['name']);
    }
    unset($r);
    return ['ok' => true, 'centres' => $rows, 'leadOptions' => $leadOptions, 'geofenceEnabled' => geofence_enabled()];
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

function admin_centres_upsert(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $name = substr(trim((string)($d['name'] ?? '')), 0, 80);
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($d['code'] ?? '')));
    $color = (string)($d['color'] ?? '#76B043');
    if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name'];
    if (strlen($code) < 1 || strlen($code) > 4) return ['ok' => false, 'error' => 'bad_code'];
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

    // Operational detail — where the centre is, who leads it, how to reach it,
    // when it meets. Each is optional and only written when the key is present,
    // so a partial save (e.g. the geo editor) never wipes contact fields.
    $textFields = [
        'address' => 240, 'area' => 120, 'phone' => 40, 'email' => 160,
        'meetDays' => 120, 'meetTime' => 60, 'notes' => 400,
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

function admin_centres_delete(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $n = db_exec('DELETE FROM centres WHERE centreId = ?', [(string)($p['centreId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('centre.delete', $g['requester']['memberId'], (string)$p['centreId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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
    ];
}

/** Public: the directory of published Summer School centres (for /centres). */
function public_centres_list(): array {
    $rows = db_all("SELECT centreId, name, code, color, slug, tagline, headline, heroImageUrl, heroPosition, area, address, meetDays, meetTime, capacity, leadVolunteerId, whatsappUrl
                    FROM centres WHERE status = 'active' AND pageStatus = 'published' AND slug <> '' ORDER BY name");
    $c = summer_ensure_cohort();
    $centres = [];
    foreach ($rows as $r) {
        $enrolled = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND centre = ? AND status = 'active'", [$c['cohortId'], (string)$r['name']])['c'] ?? 0);
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
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
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
                    WHERE m.status = 'active' AND m.centre = ?
                    ORDER BY xp DESC, m.fullName ASC LIMIT " . max(1, min(10, $limit)), [$centreName]);
    $out = []; $rank = 0;
    foreach ($rows as $r) {
        if ((int)$r['xp'] <= 0) continue; // only rank members who've actually earned XP
        $rank++;
        $parts = preg_split('/\s+/', trim((string)$r['fullName'])) ?: [];
        $first = $parts[0] ?? 'Member';
        $initial = count($parts) > 1 ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
        $out[] = [
            'rank' => $rank, 'first' => $first, 'initial' => $initial, 'track' => (string)($r['track'] ?? ''),
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
    $code = $centre ? (string)$centre['code'] : 'ST';
    $yy = gmdate('y');
    $n = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE displayId LIKE ?", [$code . '-' . $yy . '-%'])['c'] ?? 0) + 1;
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
    $centres = [];
    foreach (db_all("SELECT name, code, color FROM centres WHERE status = 'active'") as $cr) {
        $centres[strtolower($cr['name'])] = $cr;
    }
    $cards = [];
    foreach ($rows as $s) {
        $ctr = $centres[strtolower((string)$s['centre'])] ?? null;
        // The printed ID carries exactly TWO names: first given name + surname.
        // Middle names are dropped so the card never crowds or overflows.
        $names = preg_split('/\s+/', trim((string)$s['fullName'])) ?: [''];
        $first = array_shift($names);
        $surname = $names ? (string)array_pop($names) : '';
        $cards[] = [
            'studentId' => $s['studentId'],
            'firstName' => $first, 'surname' => $surname,
            'track' => (string)$s['track'],
            'centre' => ['name' => $ctr['name'] ?? (string)$s['centre'], 'code' => $ctr['code'] ?? 'ST', 'color' => $ctr['color'] ?? '#76B043'],
            'displayId' => card_display_id($s),
            'token' => (string)$s['token'],
            'photoUrl' => (string)$s['photoUrl'],
        ];
    }
    return ['ok' => true, 'cards' => $cards, 'program' => idcard_program()];
}

// Program/branding identity block for the ID cards — admin-editable via the
// 'idcard' setting (see admin.settings). Logos are configurable URLs so a wrong
// or missing mark can be corrected without a code change.
function idcard_program(): array {
    $cfg = setting_get('idcard');
    $p = is_array($cfg) ? $cfg : [];
    // Default the printed website to NGG (the main site, where every /q/<token>
    // profile resolves) — not the not-yet-live STS domain. Admin-overridable.
    $siteHost = preg_replace('#^https?://#', '', rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? 'next.afrovanguard.org.ng'), '/')) ?: 'next.afrovanguard.org.ng';
    $p += [
        'program' => 'LCASP', 'year' => gmdate('Y'), 'motto' => 'EMPOWERED 360°',
        'website' => $siteHost, 'phone' => '+234 903 777 6318',
        'logoLockup' => '/assets/idcard/logo-lockup.png',
        'logoOkun' => '/assets/idcard/logo-okun.png',
        'widthMm' => 54, 'heightMm' => 75,
    ];
    // Physical print size (mm). The card artwork reflows to any proportion in
    // this range without distortion; the bounds just keep it legible.
    $p['widthMm']  = idcard_clamp_mm($p['widthMm'], 50, 60, 54);
    $p['heightMm'] = idcard_clamp_mm($p['heightMm'], 64, 100, 75);
    return $p;
}

/** Clamp a card dimension (mm) to [min,max], falling back to $def when unparseable. */
function idcard_clamp_mm($v, float $min, float $max, float $def): float {
    if (!is_numeric($v)) return $def;
    return round(max($min, min($max, (float)$v)), 1);
}

// Validate + persist the ID-card branding block (called from admin.settings.set).
function idcard_program_save(array $in, string $by): void {
    // Merge onto the stored blob so a partial update (e.g. just the card size
    // from the ID studio) never wipes the branding fields, and vice-versa.
    $cur = setting_get('idcard');
    $clean = is_array($cur) ? $cur : [];
    foreach (['program', 'year', 'motto', 'website', 'phone', 'logoLockup', 'logoOkun'] as $k) {
        if (array_key_exists($k, $in)) $clean[$k] = substr(trim((string)$in[$k]), 0, 512);
    }
    // Card proportions (mm) — validated to the same safe range as on read.
    if (array_key_exists('widthMm', $in))  $clean['widthMm']  = idcard_clamp_mm($in['widthMm'], 50, 60, 54);
    if (array_key_exists('heightMm', $in)) $clean['heightMm'] = idcard_clamp_mm($in['heightMm'], 64, 100, 75);
    setting_set('idcard', $clean, $by);
}
