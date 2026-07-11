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
    'trips'         => ['p' => 2, 'label' => 'Off-site activities'],
    'comms'         => ['p' => 2, 'label' => 'Program updates by SMS/email'],
];
const FORM_FIELD_TYPES = ['text', 'longtext', 'email', 'phone', 'number', 'date', 'choice', 'multi', 'yesno', 'file', 'section', 'info'];

/** The seed form — created on first read; 'locked' fields cannot be removed. */
function form_default_fields(): array {
    return [
        ['key' => 'fullName', 'label' => 'Full name', 'type' => 'text', 'required' => true, 'locked' => true],
        ['key' => 'age', 'label' => 'Age', 'type' => 'number', 'required' => true, 'min' => 5, 'max' => 19, 'locked' => true],
        ['key' => 'course', 'label' => 'Course', 'type' => 'choice', 'required' => true, 'locked' => true, 'options' => ['Coding & Robotics', 'Design & Media', 'Public Speaking', 'Chess & Strategy']],
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
    $row['fields'] = json_decode((string)$row['fields'], true) ?: [];
    return $row;
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
        $keys[$key] = true;
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
            $clean['showIf'] = ['key' => preg_replace('/[^a-zA-Z0-9_]/', '', (string)$f['showIf']['key']), 'value' => substr((string)($f['showIf']['value'] ?? ''), 0, 80)];
        }
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
    $visible = function (array $f) use ($data): bool {
        if (empty($f['showIf'])) return true;
        return (string)($data[$f['showIf']['key']] ?? '') === (string)$f['showIf']['value'];
    };
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
            case 'choice': if (!in_array($v, $f['options'] ?? [], true)) $errors[$k] = 'Pick one of the listed options.'; break;
            case 'multi':
                $v = array_values(array_intersect(is_array($v) ? $v : [$v], $f['options'] ?? []));
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

function admin_gates_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    return ['ok' => true, 'gates' => db_all('SELECT gateId, name, cohortId, status, createdBy, expiresAt, usedCount, createdAt FROM gate_links ORDER BY id DESC LIMIT 50')];
}

function admin_gates_create(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $gateId = 'GL-' . strtoupper(rand_hex(6));
    db_insert('gate_links', [
        'gateId' => $gateId, 'name' => substr(trim((string)($p['name'] ?? 'Front desk')), 0, 160),
        'cohortId' => $c['cohortId'], 'status' => 'active',
        'createdBy' => $g['requester']['memberId'],
        'expiresAt' => (string)($p['expiresAt'] ?? ''), 'createdAt' => now_iso(),
    ]);
    audit('gate.create', $g['requester']['memberId'], $gateId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'gateId' => $gateId, 'url' => rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/gate?g=' . $gateId];
}

function admin_gates_revoke(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $n = db_update('gate_links', ['status' => 'revoked', 'revokedAt' => now_iso()], ['gateId' => (string)($p['gateId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('gate.revoke', $g['requester']['memberId'], (string)$p['gateId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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
        return array_intersect_key($f, array_flip(['key', 'label', 'type', 'required', 'options', 'help', 'placeholder', 'min', 'max', 'showIf', 'sensitive']));
    }, $live['fields']);
    // Centres drive the 'centre' choice field + the card's ID prefix/color.
    $centres = db_all("SELECT name, code FROM centres WHERE status = 'active' ORDER BY name");
    foreach ($fields as &$f) {
        if ($f['key'] === 'centre' && $centres) { $f['type'] = 'choice'; $f['options'] = array_column($centres, 'name'); }
    }
    unset($f);
    return ['ok' => true, 'gate' => ['name' => $gate['name'], 'cohortId' => $gate['cohortId']],
        'cohort' => $c ? ['cohortId' => $c['cohortId'], 'name' => $c['name']] : null,
        'form' => ['version' => (int)$live['version'], 'fields' => $fields],
        'consentTypes' => CONSENT_TYPES];
}

function gate_register(array $p): array {
    $gate = gate_resolve((string)($p['gate'] ?? ''));
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    $live = form_live();
    // The centre choice is driven by the centres table (same source the gate
    // context serves) — validate against it, not the stored placeholder.
    $fields = $live['fields'];
    $centreNames = array_column(db_all("SELECT name FROM centres WHERE status = 'active'"), 'name');
    if ($centreNames) {
        foreach ($fields as &$f) if ($f['key'] === 'centre') { $f['type'] = 'choice'; $f['options'] = $centreNames; }
        unset($f);
    }
    $v = form_validate_submission($fields, is_array($p['data'] ?? null) ? $p['data'] : []);
    if (empty($v['ok'])) return $v;
    $d = $v['data'];

    // Parent reachability is the verification lifeline: at least one channel.
    $pPhone = sms_normalize((string)($d['parentPhone'] ?? ''));
    $pEmail = (string)($d['parentEmail'] ?? '');
    if ($pPhone === '' && $pEmail === '') return ['ok' => false, 'errors' => ['parentPhone' => 'Add a parent phone or email — we need one to get consent.']];

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
        'notes' => '', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_exec('UPDATE gate_links SET usedCount = usedCount + 1 WHERE gateId = ?', [$gate['gateId']]);
    audit('registration.create', (string)($p['byId'] ?? ''), $studentId, ['gate' => $gate['gateId']], (string)($p['ip'] ?? ''));

    $sent = registration_send_verification($studentId);
    event_emit('registration.created', [
        'ref' => $studentId, 'name' => (string)$d['fullName'], 'course' => (string)($d['course'] ?? ''),
        'parentContact' => $pEmail !== '' ? mask_email($pEmail) : substr($pPhone, 0, 7) . '•••',
        'status' => 'parent_pending', 'gate' => (string)$gate['name'],
    ]);
    return ['ok' => true, 'ref' => $studentId, 'studentId' => $studentId, 'regStatus' => 'parent_pending', 'verificationSent' => $sent];
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

    // Verified → bind the ID/QR immediately (mint if the blank pool is dry).
    $qr = db_row("SELECT * FROM qr_codes WHERE status = 'blank' ORDER BY id ASC LIMIT 1");
    if (!$qr) {
        $tok = 'SUMQR-' . strtoupper(rand_hex(4));
        db_insert('qr_codes', ['token' => $tok, 'batch' => 'AUTO', 'cohortId' => $s['cohortId'], 'status' => 'blank', 'studentId' => '', 'assignedName' => '', 'createdAt' => now_iso(), 'assignedAt' => '']);
        $qr = db_row('SELECT * FROM qr_codes WHERE token = ?', [$tok]);
    }
    db_update('qr_codes', ['status' => 'assigned', 'studentId' => $s['studentId'], 'assignedName' => (string)$s['handle'], 'assignedAt' => now_iso(), 'cohortId' => $s['cohortId']], ['token' => $qr['token']]);
    db_update('summer_students', ['regStatus' => 'verified', 'verifiedAt' => now_iso(), 'token' => $qr['token'], 'updatedAt' => now_iso()], ['studentId' => $s['studentId']]);
    card_display_id(db_row('SELECT * FROM summer_students WHERE studentId = ?', [$s['studentId']]) ?: $s);

    $feedback = substr(trim((string)($p['feedback'] ?? '')), 0, 1000);
    audit('registration.verified', null, $s['studentId'], ['feedback' => $feedback !== ''], '');
    event_emit('registration.verified', ['ref' => $s['studentId'], 'name' => (string)$s['fullName'], 'course' => (string)$s['track'], 'status' => 'verified', 'feedback' => $feedback]);
    return ['ok' => true, 'student' => ['name' => (string)$s['fullName']]];
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

function admin_centres_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    return ['ok' => true, 'centres' => db_all("SELECT centreId, name, code, color, status FROM centres ORDER BY name")];
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
    if ($existing) db_update('centres', $row, ['centreId' => $id]);
    else { $id = 'CTR-' . strtoupper(rand_hex(4)); db_insert('centres', $row + ['centreId' => $id, 'createdAt' => now_iso()]); }
    audit('centre.upsert', $g['requester']['memberId'], $id, ['code' => $code], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'centreId' => $id];
}

function admin_centres_delete(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $n = db_exec('DELETE FROM centres WHERE centreId = ?', [(string)($p['centreId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('centre.delete', $g['requester']['memberId'], (string)$p['centreId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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
        $names = preg_split('/\s+/', trim((string)$s['fullName'])) ?: [''];
        $first = array_shift($names);
        $cards[] = [
            'studentId' => $s['studentId'],
            'firstName' => $first, 'surname' => implode(' ', $names),
            'track' => (string)$s['track'],
            'centre' => ['name' => $ctr['name'] ?? (string)$s['centre'], 'code' => $ctr['code'] ?? 'ST', 'color' => $ctr['color'] ?? '#76B043'],
            'displayId' => card_display_id($s),
            'token' => (string)$s['token'],
            'photoUrl' => (string)$s['photoUrl'],
        ];
    }
    // Program identity block — admin-editable via settings key 'idcard'.
    $cfg = setting_get('idcard');
    $program = is_array($cfg) ? $cfg : [];
    $program += ['program' => 'LCASP', 'year' => gmdate('Y'), 'motto' => 'EMPOWERED 360°',
        'website' => 'sts.afrovanguard.org.ng', 'phone' => '+234 903 777 6318'];
    return ['ok' => true, 'cards' => $cards, 'program' => $program];
}
