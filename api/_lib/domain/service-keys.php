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

/* The S3-compatible services File storage can use, each with the steps to
   connect it. One protocol (presigned PUT, domain/media-objects.php), so a new
   provider is a row here, never new upload code. `endpoint`, `region` and
   `public` are the shapes to type; `cors` is whether the bucket needs the CORS
   rule (all of these do — the browser PUTs straight to the bucket). */
const STORAGE_PROVIDERS = [
    ['id' => 'r2', 'label' => 'Cloudflare R2', 'note' => 'Recommended. 10 GB free, and downloads are never charged.', 'link' => 'https://dash.cloudflare.com/?to=/:account/r2',
     'endpoint' => 'https://<account id>.r2.cloudflarestorage.com', 'region' => 'auto', 'public' => 'https://pub-<id>.r2.dev or your custom domain',
     'steps' => ['Cloudflare dashboard → R2 → Create bucket (e.g. ngg-media).', 'Bucket → Settings → Public access → allow the r2.dev subdomain, or connect a custom domain. That address is the Public address.',
                 'R2 → Manage API tokens → Create API token with Object Read & Write on this bucket. Copy the Access Key ID and Secret Access Key — the secret is shown once.',
                 'The endpoint is on the R2 overview page: https://<account id>.r2.cloudflarestorage.com. Region: auto.', 'Bucket → Settings → CORS policy → paste the rule below.']],
    ['id' => 'b2', 'label' => 'Backblaze B2', 'note' => '10 GB free; downloads are free up to three times what you store.', 'link' => 'https://secure.backblaze.com/b2_buckets.htm',
     'endpoint' => 'https://s3.<region>.backblazeb2.com', 'region' => 'us-west-004 (the part of the endpoint after s3.)', 'public' => 'https://f004.backblazeb2.com/file/<bucket>',
     'steps' => ['Buckets → Create a Bucket. Set Files in Bucket to Public.', 'Note the bucket’s Endpoint (e.g. s3.us-west-004.backblazeb2.com). The region is the middle part.',
                 'App Keys → Add a New Application Key, with Read and Write access to this bucket only. Copy the keyID (Access key ID) and applicationKey (Secret).',
                 'Public address: https://f<cluster>.backblazeb2.com/file/<bucket> — open any uploaded file in the B2 browser to see your cluster number.',
                 'CORS: B2’s web console cannot allow uploads (PUT), so set the rule with the B2 command-line tool — the command is below.']],
    ['id' => 's3', 'label' => 'Amazon S3', 'note' => 'Pay as you go. The most widely used.', 'link' => 'https://s3.console.aws.amazon.com/s3/buckets',
     'endpoint' => 'https://s3.<region>.amazonaws.com', 'region' => 'af-south-1 (Cape Town) or eu-west-2 (London)', 'public' => 'https://<bucket>.s3.<region>.amazonaws.com',
     'steps' => ['S3 → Create bucket in a region near Nigeria (af-south-1 Cape Town, or eu-west-2 London).', 'Permissions → turn off Block all public access for this bucket, then add a bucket policy allowing s3:GetObject for everyone on arn:aws:s3:::<bucket>/*.',
                 'IAM → Users → create a user for NGG with a policy allowing s3:PutObject, s3:GetObject and s3:DeleteObject on this bucket only. Security credentials → Create access key.',
                 'Endpoint: https://s3.<region>.amazonaws.com. Public address: https://<bucket>.s3.<region>.amazonaws.com (or a CloudFront domain).', 'Permissions → Cross-origin resource sharing (CORS) → paste the rule below.']],
    ['id' => 'wasabi', 'label' => 'Wasabi', 'note' => 'Flat price per TB, no download charges. 90-day minimum storage.', 'link' => 'https://console.wasabisys.com/',
     'endpoint' => 'https://s3.<region>.wasabisys.com', 'region' => 'eu-central-1 (or the bucket’s region)', 'public' => 'https://s3.<region>.wasabisys.com/<bucket>',
     'steps' => ['Buckets → Create Bucket and pick a region.', 'Bucket → Settings → Policies → add a public-read policy for s3:GetObject (Wasabi needs public files enabled on the account first).',
                 'Access Keys → Create New Access Key (a sub-user limited to this bucket is best). Copy both keys.', 'Endpoint: https://s3.<region>.wasabisys.com. Public address: https://s3.<region>.wasabisys.com/<bucket>.', 'Bucket → Settings → CORS → paste the rule below.']],
    ['id' => 'spaces', 'label' => 'DigitalOcean Spaces', 'note' => '250 GB and a CDN for a flat monthly fee.', 'link' => 'https://cloud.digitalocean.com/spaces',
     'endpoint' => 'https://<region>.digitaloceanspaces.com', 'region' => 'fra1, lon1, ams3 …', 'public' => 'https://<space>.<region>.cdn.digitaloceanspaces.com',
     'steps' => ['Spaces Object Storage → Create a Space; enable the CDN; set File Listing to Restricted.', 'API → Spaces Keys → Generate New Key. Copy the Key (Access key ID) and Secret.',
                 'Endpoint: https://<region>.digitaloceanspaces.com. Bucket: the Space’s name. Region: e.g. fra1.', 'Public address: the CDN endpoint, https://<space>.<region>.cdn.digitaloceanspaces.com.', 'Space → Settings → CORS Configurations → add the rule below.']],
    ['id' => 'supabase', 'label' => 'Supabase Storage', 'note' => '1 GB free on the free plan.', 'link' => 'https://supabase.com/dashboard/project/_/storage/buckets',
     'endpoint' => 'https://<project ref>.supabase.co/storage/v1/s3', 'region' => 'the project’s region, e.g. eu-west-2', 'public' => 'https://<project ref>.supabase.co/storage/v1/object/public/<bucket>',
     'steps' => ['Storage → New bucket, marked Public.', 'Project Settings → Storage → S3 Connection: copy the Endpoint and Region, then New access key for the Access key ID and Secret.',
                 'Public address: https://<project ref>.supabase.co/storage/v1/object/public/<bucket>.', 'Supabase allows browser uploads from any origin by default; no CORS rule is needed.']],
    ['id' => 'idrive', 'label' => 'IDrive e2', 'note' => 'Low-cost, no download charges.', 'link' => 'https://app.idrivee2.com/',
     'endpoint' => 'https://<endpoint>.idrivee2-<n>.com', 'region' => 'the region shown with the endpoint', 'public' => 'https://<endpoint>.idrivee2-<n>.com/<bucket>',
     'steps' => ['Buckets → Create Bucket, then enable public access for it.', 'Access Keys → Create Access Key with read/write on this bucket.', 'The endpoint and region are on the Regions page. Public address: <endpoint>/<bucket>.', 'Bucket → CORS → add the rule below.',
                 'IDrive’s addresses carry a region number, so add your endpoint’s host to connect-src and frame-src in the site’s .htaccess, or the browser blocks the upload.']],
    ['id' => 'other', 'label' => 'Another S3-compatible service', 'note' => 'MinIO, Linode, Scaleway, Hetzner … anything that speaks S3 presigned uploads.', 'link' => 'https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html',
     'endpoint' => 'https://<the service’s S3 endpoint>', 'region' => 'the service’s region name (or auto)', 'public' => 'the address files are read from',
     'steps' => ['Create a bucket whose files can be read publicly.', 'Create an access key limited to that bucket, with read and write.', 'Enter the S3 endpoint, region, bucket, keys and public address here.', 'Allow browser uploads from this site with the CORS rule below.',
                 'Add the endpoint’s and the public address’s hosts to connect-src and frame-src in the site’s .htaccess, or the browser blocks the upload.']],
];

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
    'openai' => ['group' => 'ai', 'label' => 'OpenAI (ChatGPT)', 'link' => 'https://platform.openai.com/api-keys',
        'what' => 'Paid. GPT models, used wherever an AI profile names OpenAI, and as a fallback.', 'test' => 'ai',
        'fields' => [['ai.openai_api_key', 'API key', 'secret', false, 'Starts “sk-”.'], ['ai.openai_model', 'Model', 'model', true, 'Blank: gpt-4.1-mini.']]],
    'openrouter' => ['group' => 'ai', 'label' => 'OpenRouter', 'link' => 'https://openrouter.ai/keys',
        'what' => 'One key for hundreds of models from every major lab.', 'test' => 'ai',
        'fields' => [['ai.openrouter_api_key', 'API key', 'secret', false, 'Starts “sk-or-”.'], ['ai.openrouter_model', 'Model', 'model', true, '']]],
    'cloudinary' => ['group' => 'photos', 'label' => 'Cloudinary', 'link' => 'https://console.cloudinary.com/settings/api-keys',
        'what' => 'Stores and edits headshots in the cloud. Without it, photos are kept on this server.', 'test' => 'cloudinary',
        'fields' => [['cloudinary.cloud_name', 'Cloud name', 'text', false, ''], ['cloudinary.api_key', 'API key', 'text', false, 'The number.'], ['cloudinary.api_secret', 'API secret', 'secret', false, '']]],
    'cloudinary_backup' => ['group' => 'photos', 'label' => 'Cloudinary · backup account', 'link' => 'https://console.cloudinary.com/settings/api-keys',
        'what' => 'A second Cloudinary account (a free one is fine). When the main account runs low on credits, new photos and edits move here on their own, and move back when the main account renews. Photos already on the main account keep showing.', 'test' => 'cloudinary_backup',
        'fields' => [['cloudinary.backup.cloud_name', 'Cloud name', 'text', false, ''], ['cloudinary.backup.api_key', 'API key', 'text', false, 'The number.'], ['cloudinary.backup.api_secret', 'API secret', 'secret', false, ''], ['cloudinary.backup.unsigned_preset', 'Upload preset (unsigned)', 'text', true, 'Optional. For photos on the public application form. Blank: those go to this site while the backup is in use.']]],
    'storage' => ['group' => 'storage', 'label' => 'File storage (S3-compatible)', 'providers' => 'STORAGE_PROVIDERS', 'link' => 'https://dash.cloudflare.com/?to=/:account/r2',
        'what' => 'Where every new photo and file is kept once it is set: any S3-compatible bucket — Cloudflare R2, Backblaze B2, Amazon S3, Wasabi, DigitalOcean Spaces, Supabase Storage, IDrive e2 or your own. Cloudflare R2 is recommended (10 GB free, and nobody pays for downloads). Pick your provider below for its step-by-step guide. What Cloudinary already holds stays there and keeps working. The bucket must allow uploads from this site: see docs/SETUP.md → File storage for the CORS rule.', 'test' => 'storage',
        'fields' => [['storage.endpoint', 'S3 endpoint', 'https', false, 'R2: https://<account id>.r2.cloudflarestorage.com · B2: https://s3.<region>.backblazeb2.com'],
                     ['storage.region', 'Region', 'text', true, 'R2: auto (or blank). B2: the region in the endpoint, e.g. us-west-004.'],
                     ['storage.bucket', 'Bucket', 'bucket', false, 'The bucket name, e.g. ngg-media.'],
                     ['storage.access_key', 'Access key ID', 'text', false, 'R2: Manage API tokens → Object Read & Write. B2: the keyID of an application key.'],
                     ['storage.secret_key', 'Secret access key', 'secret', false, 'Shown once when the key is made.'],
                     ['storage.public_base', 'Public address', 'https', false, 'Where files are read from. R2: the r2.dev URL or your custom domain. B2: https://f004.backblazeb2.com/file/<bucket>.'],
                     ['storage.provider', 'Provider', 'text', true, 'Which service the bucket is on — only a label, so the screen can show its guide.']]],
    'paystack' => ['group' => 'payments', 'label' => 'Paystack', 'link' => 'https://dashboard.paystack.com/#/settings/developers',
        'what' => 'Card and bank payments for joining invoices and donations. Point its webhook at /api/hooks/paystack.php.', 'test' => 'paystack', 'guard' => true,
        'fields' => [['paystack.secret', 'Secret key', 'secret', false, 'sk_live_… (or sk_test_… while testing).'], ['paystack.public', 'Public key', 'text', true, 'pk_live_…']]],
    'appsscript' => ['group' => 'email', 'label' => 'Google Apps Script', 'link' => 'https://script.google.com/home',
        'what' => 'Sends every email through a Google account with MailApp: no SMTP ports, no DNS setup. Tried first whenever it is set. Deploy the script as a Web app (Execute as: Me · Who has access: Anyone) and paste its /exec URL and its SECRET here. About 100 emails a day on a Gmail account, 1,500 on Workspace.', 'test' => 'appsscript',
        'fields' => [['mail.apps_script_url', 'Web app URL', 'gasurl', false, 'From Deploy → Manage deployments. Ends in /exec.'], ['mail.apps_script_secret', 'Secret', 'secret', false, 'The script’s secret: SHARED_SECRET (or SECRET) in Project Settings → Script properties.']]],
    'brevo' => ['group' => 'email', 'label' => 'Brevo', 'link' => 'https://app.brevo.com/settings/keys/smtp',
        'what' => 'Email through Brevo’s relay (smtp-relay.brevo.com, port 587). The sender address must be one verified in Brevo.', 'test' => 'mail',
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
    'telegram' => ['group' => 'sms', 'label' => 'Telegram (free messages)', 'link' => 'https://t.me/BotFather',
        'what' => 'Free messages on any phone, Android or iPhone. Once a parent, member or volunteer connects (they open the bot and share their number), every text this site would send them goes to Telegram instead of SMS — and if Telegram cannot reach them, the SMS goes as before. Make a bot: open @BotFather in Telegram, send /newbot, and paste the token it gives you. Then press Test: that connects the bot to this site.', 'test' => 'telegram',
        'fields' => [['telegram.bot_token', 'Bot token', 'secret', false, 'From @BotFather, e.g. 123456789:AAH…']]],
    'smsgate' => ['group' => 'sms', 'label' => 'SMS Gateway for Android (free)', 'link' => 'https://sms-gate.app',
        'what' => 'Free and open source: sends text messages from the programme\'s own Android phone and SIM, with no monthly fee and no message cap. Install the SMS Gateway app (Play Store or sms-gate.app), turn on Cloud Server, and copy the username and password it shows. Messages cost only what the SIM\'s carrier charges — put an SMS bundle on it. Used first for Nigerian numbers.', 'test' => '',
        'fields' => [['sms.smsgate.username', 'Username', 'text', false, 'From the app → Cloud Server.'], ['sms.smsgate.password', 'Password', 'secret', false, 'From the app → Cloud Server.'],
                     ['sms.smsgate.device_id', 'Device ID', 'text', true, 'Blank: the account\'s phone. Only with several phones.'],
                     ['sms.smsgate.sim', 'SIM slot (1–3)', 'text', true, 'Only on a dual-SIM phone; blank uses the default SIM.'],
                     ['sms.smsgate.url', 'Server address', 'https', true, 'Blank: the free public server. Set only for a private server.']]],
    'textbee' => ['group' => 'sms', 'label' => 'textbee', 'link' => 'https://textbee.dev/dashboard',
        'what' => 'Sends text messages from the programme\'s own Android phone and SIM (install the textbee app, register the phone, then generate an API key). Paid past 300 messages a month (Pro $9.99). Used after SMS Gateway; Termii and Twilio are the fallbacks.', 'test' => '',
        'fields' => [['sms.textbee.api_key', 'API key', 'secret', false, 'From the textbee dashboard → API keys.'], ['sms.textbee.device_id', 'Device ID', 'text', true, 'Blank: the account\'s default phone.'],
                     ['sms.textbee.sim', 'SIM slot (subscription ID)', 'text', true, 'Only on a dual-SIM phone; blank uses the default SIM.']]],
    'termii' => ['group' => 'sms', 'label' => 'Termii', 'link' => 'https://accounts.termii.com/',
        'what' => 'Text messages to Nigerian numbers: guardian checks, volunteer IDs.', 'test' => '',
        'fields' => [['sms.termii.api_key', 'API key', 'secret', false, ''], ['sms.termii.sender', 'Sender ID', 'text', true, 'Approved by Termii, e.g. NGG.']]],
    'twilio' => ['group' => 'sms', 'label' => 'Twilio', 'link' => 'https://console.twilio.com/',
        'what' => 'Text messages to numbers outside Nigeria, and a fallback for Termii.', 'test' => '',
        'fields' => [['sms.twilio.sid', 'Account SID', 'text', false, ''], ['sms.twilio.token', 'Auth token', 'secret', false, ''], ['sms.twilio.from', 'From number', 'text', true, '+1…']]],
    'googlemaps' => ['group' => 'maps', 'label' => 'Google Maps', 'link' => 'https://console.cloud.google.com/google/maps-apis/credentials',
        'what' => 'Finds where an address is, to suggest the nearest NGG centre. Without it, OpenStreetMap is used (free, less exact for Nigerian addresses). Enable the Geocoding API for the key.', 'test' => 'maps',
        'fields' => [['maps.google_key', 'API key', 'secret', false, 'Starts “AIza”. Restrict it to the Geocoding API.']]],
    'cacentre' => ['group' => 'crm', 'label' => 'CACENTRE CRM', 'link' => 'https://cacentre.afrovanguard.org.ng/crm/audience.php#sites',
        'what' => 'Sends NGG’s newsletter subscribers (and unsubscribes), contact-form enquiries, donors, adult volunteers and parents to the CACENTRE CRM’s Audience, signed. No child’s record is ever sent. In the CACENTRE console: Audience → Sites → Next Generation Genius → Generate secret, and paste it here.', 'test' => '',
        'fields' => [['cacentre.crm_secret', 'Audience secret', 'secret', false, 'Shown once by CACENTRE when generated.'], ['cacentre.crm_url', 'CACENTRE address', 'text', true, 'Blank: https://cacentre.afrovanguard.org.ng']]],
    'spitch' => ['group' => 'voice', 'label' => 'Spitch', 'link' => 'https://spitch.app',
        'what' => 'Reads the Quote of the week aloud in Hausa, Igbo and Yoruba.', 'test' => '',
        'fields' => [['tts.spitch_key', 'API key', 'secret', false, '']]],
];
const SERVICE_KEY_GROUPS = ['ai' => 'AI', 'storage' => 'File storage', 'photos' => 'Photos', 'payments' => 'Payments', 'email' => 'Email', 'sms' => 'Text messages', 'maps' => 'Maps', 'voice' => 'Voice', 'crm' => 'CACENTRE CRM'];

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
    // Undo a Cloudinary failover swap first, so the main account's keys are what get re-laid (media-storage.php).
    if (isset($GLOBALS['CLOUDINARY_PRIMARY'])) { $GLOBALS['CONFIG']['cloudinary'] = $GLOBALS['CLOUDINARY_PRIMARY']; unset($GLOBALS['CLOUDINARY_PRIMARY']); }
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
    if (function_exists('cloudinary_account_apply')) cloudinary_account_apply();
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
            'providers' => isset($d['providers']) ? STORAGE_PROVIDERS : null,
            'cors' => isset($d['providers']) ? cm_storage_cors_rule() : '',
            'corsB2' => isset($d['providers']) ? cm_storage_cors_b2() : '',
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
            'mailMode' => function_exists('mail_mode') ? mail_mode() : '',
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
        // Consumer (/macros/s/ID/exec) and Workspace (/a/macros/DOMAIN/s/ID/exec) deployments both count.
        case 'gasurl': return preg_match('#^https://script\.google(usercontent)?\.com/(a/(macros/)?[^/\s]+/)*macros/s/[A-Za-z0-9_-]{10,}/(exec|dev)/?(\?\S*)?$#', $v)
                           || preg_match('#^https://script\.google\.com/a/macros/[^/\s]+/s/[A-Za-z0-9_-]{10,}/(exec|dev)/?(\?\S*)?$#', $v)
                           ? '' : 'The Web app URL from Deploy, e.g. https://script.google.com/macros/s/…/exec.';
        case 'https':  return preg_match('#^https://[A-Za-z0-9.-]+(:\d{2,5})?(/[A-Za-z0-9._~/-]*)?$#', $v) ? '' : 'An https:// address, with no spaces or query.';
        case 'bucket': return preg_match('/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/', $v) ? '' : 'A bucket name: lower-case letters, digits, dots and dashes.';
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
            $h = ops_cloudinary_health(function_exists('media_primary_cfg') ? media_primary_cfg() : null);
            if (function_exists('cache_delete')) cache_delete('ops.cloudinary');   // the next health read is the active account's own
            return ['ok' => true] + $done(['pass' => !empty($h['ok']) && !empty($h['configured']), 'detail' => (string)($h['detail'] ?? '')]);
        case 'cloudinary_backup':
            if (!cloudinary_backup_cfg()) return ['ok' => true, 'pass' => false, 'detail' => 'Set all three: cloud name, API key and API secret.'];
            $r = cloudinary_with_account('backup', fn() => media_api('GET', '/usage'));
            $code = (int)($r['code'] ?? 0);
            $pc = is_array($r['body'] ?? null) && ($cp = media_part($r['body'], 'credits')) ? $cp['pct'] : null;
            // Keys that work are acted on now, not at the next six-hourly check: a main account already past 70% hands over at once.
            if ($code >= 200 && $code < 300) media_usage_refresh(true);
            return ['ok' => true] + $done(['pass' => $code >= 200 && $code < 300, 'detail' => $code >= 200 && $code < 300
                ? 'Cloudinary accepted the backup account' . ($pc !== null ? ' (' . round((float)$pc) . '% of its credits used)' : '') . '. ' . (cloudinary_active() === 'backup' ? 'It is in use now.' : 'It takes over when the main account runs low.')
                : 'Cloudinary refused the backup account (HTTP ' . $code . ').']);
        case 'telegram':
            return ['ok' => true] + $done(telegram_setup());
        case 'storage':
            return ['ok' => true] + $done(store_health());
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
                if (!empty($r['legacy'])) return ['ok' => true] + $done(['pass' => true, 'detail' => 'The Apps Script answered and accepted the secret. It is an older copy of the script: email will send, and pasting the latest apps-script/Code.gs (Deploy → New version) also shows today’s quota.']);
                $left = isset($r['remaining']) ? (int)$r['remaining'] : null;
                /* Some scripts answer the quota without checking the token, so
                   prove the token on mail.send with an address that cannot be
                   delivered: a right token is told "No valid recipient" and
                   nothing is sent; a wrong one is told "Bad token". */
                try { appsscript_call($url, $secret, 'mail.send', ['to' => 'token-check', 'subject' => 'Token check', 'html' => '', 'text' => '']); }
                catch (\Throwable $e2) { if ($e2->getMessage() === 'Bad token') throw $e2; }
                return ['ok' => true] + $done(['pass' => $left === null || $left > 0, 'detail' => 'The Apps Script answered' . (!empty($r['account']) ? ' as ' . $r['account'] : '')
                    . ' and accepted the secret' . ($left !== null ? '; it may send to ' . $left . ' more recipient' . ($left === 1 ? '' : 's') . ' today.' : '.')]);
            } catch (\Throwable $e) {
                $m = $e->getMessage();
                $why = $m === 'Bad token' ? 'The secret does not match the script’s SHARED_SECRET (or SECRET) in Project Settings → Script properties.'
                     : (preg_match('/HTTP (401|403|404)/', $m) ? 'Google refused the URL. Deploy as a Web app with access “Anyone”, and use the /exec URL.' : ucfirst($m) . '.');
                return ['ok' => true] + $done(['pass' => false, 'detail' => $why]);
            }
    }
    return ['ok' => true, 'pass' => null, 'detail' => 'This service has no safe test; it is used the next time it is needed.'];
}

/** The CORS rule a bucket needs so this site's browsers can upload to it. */
function cm_storage_cors_rule(): string {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') ?: 'https://your-ngg-site.example';
    return json_encode([['AllowedOrigins' => [$origin], 'AllowedMethods' => ['PUT', 'GET', 'HEAD'], 'AllowedHeaders' => ['content-type'],
        'ExposeHeaders' => ['ETag'], 'MaxAgeSeconds' => 3600]], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}

/** The same rule for Backblaze B2, whose console cannot allow PUT: a b2 CLI command. */
function cm_storage_cors_b2(): string {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') ?: 'https://your-ngg-site.example';
    $rule = json_encode([['corsRuleName' => 'ngg', 'allowedOrigins' => [$origin], 'allowedOperations' => ['s3_put', 's3_get', 's3_head'],
        'allowedHeaders' => ['content-type'], 'exposeHeaders' => ['ETag'], 'maxAgeSeconds' => 3600]], JSON_UNESCAPED_SLASHES);
    return "b2 bucket update --cors-rules '" . $rule . "' <bucket> allPublic";
}

