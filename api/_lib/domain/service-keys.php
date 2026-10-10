<?php
declare(strict_types=1);

/* ============================================================================
   API keys entered on screen — Control Room → Settings → API keys.

   Every outside service (AI providers, Cloudinary, Paystack, email, SMS,
   voice) was configured only in api/config.php, which on shared hosting means
   a file manager and a text editor. This lets a person with the Settings
   permission add, change, test and remove those keys in the Control Room.

   - ONE registry (SERVICE_KEYS) names every service and the config paths it
     may set. Nothing outside it can be written; a path is never caller text.
   - The stored values are laid OVER the loaded config at the start of every
     request (service_keys_apply), so every consumer — paystack_secret(),
     ops_cloudinary_health(), the mailer, ai_profile_candidates() — sees them
     with no change of its own. A value here wins over config.php; removing it
     falls back to config.php.
   - Secrets are sealed (AES-256-GCM, key from the app secret; ai_ui_seal in
     photo-framing.php) and never sent back to a browser: the screen sees "set
     here, ends …4f2a" or "from config.php".
   - Paystack is money: once a secret key is in use, changing it is a proposal
     a SECOND person with Fees and Settings confirms by entering the same key,
     and every Fees holder is emailed — the rule the bank account follows.
   - Every change is audited by service and field name, never value.
   ========================================================================== */

/* [path, label, kind, optional, help]
   kind: secret | text | port | secure | email | model */
const SERVICE_KEYS = [
    'gemini' => ['group' => 'ai', 'label' => 'Google Gemini', 'link' => 'https://aistudio.google.com/apikey',
        'what' => 'AI coaching replies, summaries and photo checks. Generous free tier.', 'test' => 'ai',
        'fields' => [['ai.gemini_api_key', 'API key', 'secret', false, 'Starts “AQ.” or “AIza”.'], ['ai.gemini_model', 'Model', 'model', true, 'Blank: the best model the key can use.']]],
    'groq' => ['group' => 'ai', 'label' => 'Groq', 'link' => 'https://console.groq.com/keys',
        'what' => 'Fast, free-tier AI for classifying observations and screening posts.', 'test' => 'ai',
        'fields' => [['ai.groq_api_key', 'API key', 'secret', false, 'Starts “gsk_”.'], ['ai.groq_model', 'Model', 'model', true, 'Blank: llama-3.1-8b-instant.']]],
    'anthropic' => ['group' => 'ai', 'label' => 'Anthropic (Claude)', 'link' => 'https://console.anthropic.com/settings/keys',
        'what' => 'Paid. The capable model that marks written answers and writes the Analyst’s reports.', 'test' => 'ai',
        'fields' => [['ai.anthropic_api_key', 'API key', 'secret', false, 'Starts “sk-ant-”.'], ['ai.anthropic_model', 'Model', 'model', true, '']]],
    'openrouter' => ['group' => 'ai', 'label' => 'OpenRouter', 'link' => 'https://openrouter.ai/keys',
        'what' => 'One key for hundreds of models from every major lab.', 'test' => 'ai',
        'fields' => [['ai.openrouter_api_key', 'API key', 'secret', false, 'Starts “sk-or-”.'], ['ai.openrouter_model', 'Model', 'model', true, '']]],
    'cloudinary' => ['group' => 'photos', 'label' => 'Cloudinary', 'link' => 'https://console.cloudinary.com/settings/api-keys',
        'what' => 'Stores and edits headshots in the cloud. Without it, photos are kept on this server.', 'test' => 'cloudinary',
        'fields' => [['cloudinary.cloud_name', 'Cloud name', 'text', false, ''], ['cloudinary.api_key', 'API key', 'text', false, 'The number.'], ['cloudinary.api_secret', 'API secret', 'secret', false, '']]],
    'paystack' => ['group' => 'payments', 'label' => 'Paystack', 'link' => 'https://dashboard.paystack.com/#/settings/developers',
        'what' => 'Card and bank payments for joining invoices and donations. Point its webhook at /api/hooks/paystack.php.', 'test' => 'paystack', 'guard' => true,
        'fields' => [['paystack.secret', 'Secret key', 'secret', false, 'sk_live_… (or sk_test_… while testing).'], ['paystack.public', 'Public key', 'text', true, 'pk_live_…']]],
    'appsscript' => ['group' => 'email', 'label' => 'Google Apps Script', 'link' => 'https://script.google.com/home',
        'what' => 'Sends every email through a Google account with MailApp, the way Africa GATES does: no SMTP ports, no DNS setup. Tried first whenever it is set. The Africa GATES deployment works as it is — paste its /exec URL (GAS_URL) and its SECRET (GAS_SECRET). About 100 emails a day on a Gmail account, 1,500 on Workspace.', 'test' => 'appsscript',
        'fields' => [['mail.apps_script_url', 'Web app URL', 'gasurl', false, 'Ends in /exec — the same as GAS_URL in Africa GATES.'], ['mail.apps_script_secret', 'Secret', 'secret', false, 'The SECRET at the top of the script — GAS_SECRET in Africa GATES.']]],
    'brevo' => ['group' => 'email', 'label' => 'Brevo', 'link' => 'https://app.brevo.com/settings/keys/smtp',
        'what' => 'Email through Brevo’s relay (smtp-relay.brevo.com, port 587) — the way Africa GATES sends. The same Brevo login and SMTP key work here; the sender address must be one verified in Brevo.', 'test' => 'mail',
        'fields' => [['mail.brevo.user', 'SMTP login', 'text', false, 'From Brevo → SMTP & API, e.g. 7a1b2c001@smtp-brevo.com.'], ['mail.brevo.pass', 'SMTP key', 'secret', false, 'The SMTP key (xsmtpsib-…), not the API key.'],
                     ['mail.brevo.from', 'Send from', 'email', true, 'A sender verified in Brevo, e.g. noreply@afrovanguard.org.ng.']]],
    'smtp' => ['group' => 'email', 'label' => 'Email (SMTP)', 'link' => 'https://support.google.com/accounts/answer/185833',
        'what' => 'Sends every email: sign-in codes, invoices, receipts, alerts. For Gmail or Workspace use an app password.', 'test' => 'mail',
        'fields' => [['mail.smtp.host', 'Server', 'text', false, 'e.g. smtp.gmail.com'], ['mail.smtp.port', 'Port', 'port', true, '587 (TLS) or 465 (SSL)'],
                     ['mail.smtp.secure', 'Encryption', 'secure', true, 'tls, ssl or blank'], ['mail.smtp.user', 'Username', 'text', true, 'Usually the mailbox address.'],
                     ['mail.smtp.pass', 'Password', 'secret', true, 'An app password, not the account password.'], ['mail.from_email', 'Send from', 'email', true, 'Match the mailbox above.']]],
    'resend' => ['group' => 'email', 'label' => 'Resend', 'link' => 'https://resend.com/api-keys',
        'what' => 'Email over HTTPS, for hosts that block SMTP. Used when no SMTP server is set.', 'test' => 'mail',
        'fields' => [['mail.resend_key', 'API key', 'secret', false, 'Starts “re_”.']]],
    'termii' => ['group' => 'sms', 'label' => 'Termii', 'link' => 'https://accounts.termii.com/',
        'what' => 'Text messages to Nigerian numbers: guardian checks, volunteer IDs.', 'test' => '',
        'fields' => [['sms.termii.api_key', 'API key', 'secret', false, ''], ['sms.termii.sender', 'Sender ID', 'text', true, 'Approved by Termii, e.g. NGG.']]],
    'twilio' => ['group' => 'sms', 'label' => 'Twilio', 'link' => 'https://console.twilio.com/',
        'what' => 'Text messages to numbers outside Nigeria, and a fallback for Termii.', 'test' => '',
        'fields' => [['sms.twilio.sid', 'Account SID', 'text', false, ''], ['sms.twilio.token', 'Auth token', 'secret', false, ''], ['sms.twilio.from', 'From number', 'text', true, '+1…']]],
    'googlemaps' => ['group' => 'maps', 'label' => 'Google Maps', 'link' => 'https://console.cloud.google.com/google/maps-apis/credentials',
        'what' => 'Finds where an address is, to suggest the nearest NGG centre. Without it, OpenStreetMap is used (free, less exact for Nigerian addresses). Enable the Geocoding API for the key.', 'test' => 'maps',
        'fields' => [['maps.google_key', 'API key', 'secret', false, 'Starts “AIza”. Restrict it to the Geocoding API.']]],
    'spitch' => ['group' => 'voice', 'label' => 'Spitch', 'link' => 'https://spitch.app',
        'what' => 'Reads the Quote of the week aloud in Hausa, Igbo and Yoruba.', 'test' => '',
        'fields' => [['tts.spitch_key', 'API key', 'secret', false, '']]],
];
const SERVICE_KEY_GROUPS = ['ai' => 'AI', 'photos' => 'Photos', 'payments' => 'Payments', 'email' => 'Email', 'sms' => 'Text messages', 'maps' => 'Maps', 'voice' => 'Voice'];

/** Read a dotted path out of a nested array. */
function service_cfg_read(array $cfg, string $path) {
    foreach (explode('.', $path) as $k) { if (!is_array($cfg) || !array_key_exists($k, $cfg)) return null; $cfg = $cfg[$k]; }
    return $cfg;
}
/** Write a dotted path into $GLOBALS['CONFIG']. */
function service_cfg_write(string $path, $value): void {
    $ref = &$GLOBALS['CONFIG'];
    foreach (explode('.', $path) as $k) { if (!isset($ref[$k]) || !is_array($ref[$k])) $ref[$k] = $ref[$k] ?? []; $ref = &$ref[$k]; }
    $ref = $value;
}
function service_key_field(string $path): ?array {
    foreach (SERVICE_KEYS as $svc => $d) foreach ($d['fields'] as $f) if ($f[0] === $path) return ['service' => $svc, 'kind' => $f[2], 'label' => $f[1]];
    return null;
}

/** What is stored: ['v' => [path => sealed|plain], 'meta' => [service => [at, byName]]]. */
function service_keys_stored(): array {
    try { $s = setting_get('service_keys'); } catch (\Throwable $e) { return ['v' => [], 'meta' => []]; }
    $s = is_array($s) ? $s : [];
    return ['v' => is_array($s['v'] ?? null) ? $s['v'] : [], 'meta' => is_array($s['meta'] ?? null) ? $s['meta'] : []];
}
/** A stored value, opened. */
function service_key_value(string $path, array $stored): string {
    $f = service_key_field($path);
    $raw = (string)($stored['v'][$path] ?? '');
    if (!$f || $raw === '') return '';
    return $f['kind'] === 'secret' ? ai_ui_open($raw) : $raw;
}

/**
 * Lay the stored keys over the loaded config, once per request. The file's own
 * values are kept aside so the screen can say where each one comes from.
 */
function service_keys_apply(bool $force = false): void {
    static $done = false;
    if ($done && !$force) return;
    $done = true;
    if (!isset($GLOBALS['__config_file'])) {
        $GLOBALS['__config_file'] = [];
        foreach (SERVICE_KEYS as $d) foreach ($d['fields'] as $f) $GLOBALS['__config_file'][$f[0]] = service_cfg_read($GLOBALS['CONFIG'] ?? [], $f[0]);
    }
    $stored = service_keys_stored();
    foreach (SERVICE_KEYS as $d) foreach ($d['fields'] as $f) {
        $v = service_key_value($f[0], $stored);
        if ($v !== '') service_cfg_write($f[0], $f[2] === 'port' ? (int)$v : $v);
        elseif (($GLOBALS['__config_file'][$f[0]] ?? null) !== null) service_cfg_write($f[0], $GLOBALS['__config_file'][$f[0]]);
    }
}

/** The screen's view of one service. Secrets: whether set and how they end, never the value. */
function service_key_view(string $svc, array $stored): array {
    $d = SERVICE_KEYS[$svc];
    $fields = []; $anyHere = false; $required = true;
    foreach ($d['fields'] as [$path, $label, $kind, $optional, $help]) {
        $here = service_key_value($path, $stored);
        $file = (string)($GLOBALS['__config_file'][$path] ?? '');
        $val = $here !== '' ? $here : $file;
        $src = $here !== '' ? 'here' : ($file !== '' ? 'file' : '');
        if ($here !== '') $anyHere = true;
        if (!$optional && $val === '') $required = false;
        $fields[] = ['path' => $path, 'label' => $label, 'kind' => $kind, 'optional' => (bool)$optional, 'help' => $help, 'source' => $src,
                     'set' => $val !== '', 'ending' => $kind === 'secret' && $val !== '' ? substr($val, -4) : '', 'value' => $kind === 'secret' ? '' : $val];
    }
    return ['id' => $svc, 'group' => $d['group'], 'label' => $d['label'], 'what' => $d['what'], 'link' => $d['link'], 'testable' => $d['test'] !== '',
            'guarded' => !empty($d['guard']), 'connected' => $required, 'setHere' => $anyHere, 'fields' => $fields,
            'changedAt' => (string)($stored['meta'][$svc]['at'] ?? ''), 'changedBy' => (string)($stored['meta'][$svc]['byName'] ?? '')];
}

function service_keys_pending(): ?array {
    $p = setting_get('service_keys_pending');
    return is_array($p) && !empty($p['service']) ? $p : null;
}

/** admin.keys.list — every service, where its keys come from, and any change waiting for a second person. */
function admin_keys_list(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    service_keys_apply();
    $stored = service_keys_stored();
    $pend = service_keys_pending();
    return ['ok' => true, 'groups' => SERVICE_KEY_GROUPS, 'services' => array_map(static fn($s) => service_key_view($s, $stored), array_keys(SERVICE_KEYS)),
            'pending' => $pend ? ['service' => $pend['service'], 'by' => (string)$pend['by'], 'byName' => (string)$pend['byName'], 'at' => (string)$pend['at'], 'fields' => array_keys((array)$pend['v'])] : null,
            'me' => (string)$g['requester']['memberId'], 'sealed' => function_exists('openssl_encrypt'),
            'canMoney' => in_array('fees', member_effective_caps($g['requester']), true)];
}

/** Check one entered value against its field's kind. Returns '' or the reason. */
function service_key_check(string $kind, string $v): string {
    if ($v === '') return '';
    switch ($kind) {
        case 'secret': return preg_match('/^[\x21-\x7e]{8,400}$/', $v) ? '' : 'Paste the key exactly, with no spaces.';
        case 'port':   return preg_match('/^\d{2,5}$/', $v) && (int)$v <= 65535 ? '' : 'A port number, such as 587 or 465.';
        case 'secure': return in_array($v, ['tls', 'ssl'], true) ? '' : 'tls, ssl, or blank for none.';
        case 'email':  return filter_var($v, FILTER_VALIDATE_EMAIL) ? '' : 'An email address.';
        case 'gasurl': return preg_match('#^https://script\.google\.com/(a/[^/]+/)?macros/s/[A-Za-z0-9_-]{20,}/exec$#', $v) ? '' : 'The Web app URL from Deploy, ending in /exec.';
        case 'model':  return preg_match('/^[A-Za-z0-9._:\/\-]{1,100}$/', $v) ? '' : 'A model name, such as gemini-3.8-flash.';
        default:       return preg_match('/^[^\x00-\x1f]{1,300}$/u', $v) ? '' : 'Too long, or it has a line break in it.';
    }
}

/**
 * admin.keys.set — {service, values: {path: value}, clear: [path]}. A blank
 * value leaves that field as it is; `clear` removes what was set here (the
 * field falls back to config.php). Paystack's secret, once one is in use,
 * becomes a proposal for a second person.
 */
function admin_keys_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $svc = (string)($p['service'] ?? '');
    if (!isset(SERVICE_KEYS[$svc])) return ['ok' => false, 'error' => 'unknown_service'];
    if (!function_exists('openssl_encrypt')) return ['ok' => false, 'error' => 'no_openssl', 'detail' => 'This server cannot encrypt keys (PHP openssl is missing), so they are not stored. Set them in api/config.php instead.'];
    $d = SERVICE_KEYS[$svc];
    $by = (string)$g['requester']['memberId'];
    if (!empty($d['guard']) && !in_array('fees', member_effective_caps($g['requester']), true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'Payment keys take the Fees permission as well as Settings.'];
    $vals = is_array($p['values'] ?? null) ? $p['values'] : [];
    $clear = array_values(array_filter((array)($p['clear'] ?? []), 'is_string'));
    $paths = array_column($d['fields'], 2, 0);
    // Validate the whole request before anything is written.
    $set = [];
    foreach ($vals as $path => $v) {
        if (!isset($paths[$path])) return ['ok' => false, 'error' => 'unknown_field'];
        $v = trim((string)$v);
        if ($v === '') continue;
        $why = service_key_check($paths[$path], $v);
        if ($why !== '') return ['ok' => false, 'error' => 'bad_value', 'field' => $path, 'detail' => $why];
        $set[$path] = $v;
    }
    foreach ($clear as $path) if (!isset($paths[$path])) return ['ok' => false, 'error' => 'unknown_field'];
    if (!$set && !$clear) return ['ok' => true, 'unchanged' => true];

    service_keys_apply();
    $stored = service_keys_stored();
    // Money: replacing or removing a secret already in use waits for a second person.
    if (!empty($d['guard'])) {
        $sec = 'paystack.secret';
        $current = (string)service_cfg_read($GLOBALS['CONFIG'], $sec);
        $touches = (isset($set[$sec]) && $set[$sec] !== $current) || in_array($sec, $clear, true);
        if ($touches && $current !== '') {
            $pv = [];
            foreach ($set as $path => $v) $pv[$path] = $paths[$path] === 'secret' ? ai_ui_seal($v) : $v;
            setting_set('service_keys_pending', ['service' => $svc, 'v' => $pv, 'clear' => $clear, 'by' => $by, 'byName' => membership_staff_name($by), 'at' => now_iso()], $by);
            audit('keys.proposed', $by, '', ['service' => $svc, 'fields' => array_merge(array_keys($set), $clear)], (string)($p['ip'] ?? ''));
            if (function_exists('membership_bank_notify')) membership_bank_notify('NGG payments: a change of Paystack keys is waiting',
                membership_staff_name($by) . ' asked to change the Paystack keys that take every payment. It takes effect only when another member of staff with the Fees and Settings permissions confirms it in Control Room → Settings → API keys. If you did not expect this, cancel it there.', $by);
            return ['ok' => true, 'applied' => false, 'pending' => true];
        }
    }
    service_keys_write($svc, $set, $clear, $paths, $by);
    audit('keys.set', $by, '', ['service' => $svc, 'set' => array_keys($set), 'cleared' => $clear], (string)($p['ip'] ?? ''));
    if (!empty($d['guard']) && function_exists('membership_bank_notify')) membership_bank_notify('NGG payments: Paystack keys set', 'The Paystack keys were set by ' . membership_staff_name($by) . '.', $by);
    return ['ok' => true, 'applied' => true, 'service' => service_key_view($svc, service_keys_stored())];
}

function service_keys_write(string $svc, array $set, array $clear, array $paths, string $by): void {
    $s = setting_get('service_keys'); $s = is_array($s) ? $s : [];
    $v = is_array($s['v'] ?? null) ? $s['v'] : [];
    foreach ($set as $path => $val) $v[$path] = $paths[$path] === 'secret' ? (strncmp($val, 'v1:', 3) === 0 && ai_ui_open($val) !== '' ? $val : ai_ui_seal($val)) : $val;
    foreach ($clear as $path) unset($v[$path]);
    $meta = is_array($s['meta'] ?? null) ? $s['meta'] : [];
    $meta[$svc] = ['at' => now_iso(), 'byName' => membership_staff_name($by)];
    setting_set('service_keys', ['v' => $v, 'meta' => $meta], $by);
    if (function_exists('cache_delete')) { cache_delete('ops.cloudinary'); }
    service_keys_apply(true);
}

/** admin.keys.confirm — a second person enters the same Paystack secret key, and the change applies. */
function admin_keys_confirm(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    if (!in_array('fees', member_effective_caps($g['requester']), true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'Payment keys take the Fees permission as well as Settings.'];
    $pend = service_keys_pending();
    if (!$pend) return ['ok' => false, 'error' => 'nothing_pending'];
    $by = (string)$g['requester']['memberId'];
    if ($by === (string)$pend['by']) return ['ok' => false, 'error' => 'needs_second_person', 'detail' => 'You proposed this change. Another member of staff with Fees and Settings must confirm it.'];
    $svc = (string)$pend['service'];
    $paths = array_column(SERVICE_KEYS[$svc]['fields'], 2, 0);
    $newSecret = isset($pend['v']['paystack.secret']) ? ai_ui_open((string)$pend['v']['paystack.secret']) : '';
    if ($newSecret !== '' && !hash_equals($newSecret, trim((string)($p['confirm'] ?? '')))) {
        audit('keys.confirm_mismatch', $by, '', ['service' => $svc], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'mismatch', 'detail' => 'That is not the key that was proposed. Copy it from the Paystack dashboard yourself.'];
    }
    service_keys_write($svc, (array)$pend['v'], (array)($pend['clear'] ?? []), $paths, $by);
    setting_set('service_keys_pending', [], $by);
    audit('keys.set', $by, '', ['service' => $svc, 'proposedBy' => $pend['by'], 'set' => array_keys((array)$pend['v']), 'cleared' => (array)($pend['clear'] ?? [])], (string)($p['ip'] ?? ''));
    if (function_exists('membership_bank_notify')) membership_bank_notify('NGG payments: the Paystack keys changed', 'Proposed by ' . $pend['byName'] . ', confirmed by ' . membership_staff_name($by) . '.');
    return ['ok' => true, 'applied' => true];
}

/** admin.keys.cancel — withdraw a waiting change. */
function admin_keys_cancel(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $pend = service_keys_pending();
    if (!$pend) return ['ok' => true, 'unchanged' => true];
    setting_set('service_keys_pending', [], (string)$g['requester']['memberId']);
    audit('keys.cancelled', (string)$g['requester']['memberId'], '', ['service' => $pend['service'], 'proposedBy' => $pend['by']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** admin.keys.test — one small real request with the keys in effect. Never shows a key. */
function admin_keys_test(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $svc = (string)($p['service'] ?? '');
    if (!isset(SERVICE_KEYS[$svc])) return ['ok' => false, 'error' => 'unknown_service'];
    service_keys_apply();
    $t = microtime(true);
    $done = fn(array $r) => $r + ['ms' => (int)round((microtime(true) - $t) * 1000)];
    $c = $GLOBALS['CONFIG'];
    switch (SERVICE_KEYS[$svc]['test']) {
        case 'ai':
            $key = (string)service_cfg_read($c, 'ai.' . $svc . '_api_key');
            if ($key === '') return ['ok' => true, 'pass' => false, 'detail' => 'No key is set.'];
            $cand = ['provider' => $svc, 'api_key' => $key, 'model' => (string)(service_cfg_read($c, 'ai.' . $svc . '_model') ?: (AI_DEFAULT_MODEL[$svc] ?? ''))];
            $r = isset($GLOBALS['__ai_mock']) && is_callable($GLOBALS['__ai_mock']) ? ($GLOBALS['__ai_mock'])('keytest', '', [])
                : ai_call_candidate($cand, 'Reply with the single word OK.', [['role' => 'me', 'text' => 'Test']], 16, 0.0);
            return ['ok' => true] + $done(['pass' => !empty($r['ok']), 'detail' => !empty($r['ok']) ? 'Answered' . (!empty($r['model']) ? ' using ' . $r['model'] : '') . '.' : trim(($r['detail'] ?? '') . ' (' . ($r['error'] ?? 'failed') . ')')]);
        case 'cloudinary':
            if (function_exists('cache_delete')) cache_delete('ops.cloudinary');
            $h = ops_cloudinary_health();
            return ['ok' => true] + $done(['pass' => !empty($h['ok']) && !empty($h['configured']), 'detail' => (string)($h['detail'] ?? '')]);
        case 'paystack':
            if (paystack_secret() === '') return ['ok' => true, 'pass' => false, 'detail' => 'No secret key is set.'];
            $r = paystack_http('GET', '/transaction?perPage=1');
            $pass = !empty($r['status']);
            $mode = str_starts_with(paystack_secret(), 'sk_test_') ? ' (test mode — no real money moves)' : '';
            return ['ok' => true] + $done(['pass' => $pass, 'detail' => $pass ? 'Paystack accepted the key' . $mode . '.' : 'Paystack refused it: ' . (string)($r['message'] ?? $r['error'] ?? 'no answer')]);
        case 'maps':
            $key = trim((string)service_cfg_read($c, 'maps.google_key'));
            if ($key === '') return ['ok' => true, 'pass' => false, 'detail' => 'No key is set; addresses are looked up on OpenStreetMap.'];
            $g = isset($GLOBALS['__geocode_mock']) && is_callable($GLOBALS['__geocode_mock']) ? ($GLOBALS['__geocode_mock'])('Egbeda, Lagos, Nigeria') : geo_google('Egbeda, Lagos, Nigeria', $key);
            return ['ok' => true] + $done(['pass' => (bool)$g, 'detail' => $g ? 'Found Egbeda, Lagos at ' . round($g['lat'], 4) . ', ' . round($g['lng'], 4) . '.' : 'Google did not answer. Check the key, and that the Geocoding API is enabled for it.']);
        case 'mail':
            return ['ok' => true, 'pass' => null, 'detail' => 'Use “Send test email” to send one to yourself.'];
        case 'appsscript':
            [$url, $secret] = mail_apps_script_cfg();
            if ($url === '' || $secret === '') return ['ok' => true, 'pass' => false, 'detail' => 'Set the Web app URL and the shared secret.'];
            try {
                $r = appsscript_call($url, $secret, 'mail.quota');
                $left = isset($r['remaining']) ? (int)$r['remaining'] : null;
                return ['ok' => true] + $done(['pass' => $left === null || $left > 0, 'detail' => 'The Apps Script answered' . (!empty($r['account']) ? ' as ' . $r['account'] : '')
                    . ($left !== null ? '; it may send to ' . $left . ' more recipient' . ($left === 1 ? '' : 's') . ' today.' : '.')]);
            } catch (\Throwable $e) {
                $m = $e->getMessage();
                $why = $m === 'Bad token' ? 'The secret does not match the SECRET in the script.'
                     : (preg_match('/HTTP (401|403|404)/', $m) ? 'Google refused the URL. Deploy as a Web app with access “Anyone”, and use the /exec URL.' : ucfirst($m) . '.');
                return ['ok' => true] + $done(['pass' => false, 'detail' => $why]);
            }
    }
    return ['ok' => true, 'pass' => null, 'detail' => 'This service has no safe test; it is used the next time it is needed.'];
}
