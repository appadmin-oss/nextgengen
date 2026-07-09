<?php
/**
 * NGG Platform — config template.
 *
 * Copy this file to `api/config.php` (which is git-ignored) and fill in the
 * values from your Apps Script deployment.
 *
 * NEVER commit `api/config.php`. It contains secrets.
 */

return [
    // -----------------------------------------------------------------------
    // Database — the source of truth. Leave `dsn` empty to use the bundled
    // SQLite file (auto-migrates on first request; perfect for a single
    // shared-host site). For higher traffic, point `dsn` at MySQL/MariaDB and
    // apply db/schema-mysql.sql once.
    // -----------------------------------------------------------------------
    'db' => [
        'dsn'         => '',   // e.g. 'mysql:host=localhost;dbname=ngg;charset=utf8mb4'
        'username'    => '',
        'password'    => '',
        // Where the SQLite file lives when dsn is empty. Must be writable and
        // OUTSIDE the web root ideally; api/storage is denied via .htaccess.
        'sqlite_path' => __DIR__ . '/storage/ngg.db',
    ],

    // -----------------------------------------------------------------------
    // Outbound email. Uses SMTP when `smtp.host` is set (recommended for
    // deliverability on shared hosting), else PHP mail().
    // -----------------------------------------------------------------------
    'mail' => [
        'from_name'  => 'Next Generation Genius',
        'from_email' => 'no-reply@ngg.afrovanguard.org',
        'reply_to'   => 'hello@afrovanguard.org',
        'smtp' => [
            'host'   => '',            // e.g. 'smtp.mailgun.org' — empty = use mail()
            'port'   => 587,
            'secure' => 'tls',         // 'tls' (587) | 'ssl' (465) | '' (plain)
            'user'   => '',
            'pass'   => '',
        ],
    ],

    // -----------------------------------------------------------------------
    // Google Sheets read-only mirror (OPTIONAL). If set, api/tools/export-sheets.php
    // pushes DB snapshots here on a cron so admins keep a familiar spreadsheet
    // view. Not on the read path — the database above is authoritative. Leave
    // `apps_script_url` empty to disable the mirror entirely.
    // -----------------------------------------------------------------------
    'apps_script_url' => '',   // Apps Script Web App URL for the export sink (…/exec)

    // -----------------------------------------------------------------------
    // AI layer (OPTIONAL) — Summer School coordinator insights. Entirely opt-in:
    // with no key set the dashboard shows a deterministic rule-based summary and
    // makes no external call. Add a free-tier key to enable AI narratives.
    // Get keys: Groq → https://console.groq.com  ·  Gemini → https://aistudio.google.com
    // -----------------------------------------------------------------------
    'ai' => [
        // Default profile (legacy flat block — used when a purpose below has
        // no key of its own):
        'provider'       => 'groq',                    // preference: 'groq' | 'gemini'
        'groq_api_key'   => '',                        // leave empty to disable
        'groq_model'     => 'llama-3.1-8b-instant',
        'gemini_api_key' => '',                        // leave empty to disable
        'gemini_model'   => 'gemini-1.5-flash',

        // Pro allocation — one key per purpose so a rate-limited or leaked
        // key degrades ONE feature. Every entry optional; each may carry a
        // 'fallback' => [provider, api_key, model] tried when the first
        // provider errors. All free-tier friendly.
        'profiles' => [
            // Reflection Coach — best free conversational quality.
            'coach'      => ['provider' => 'gemini', 'api_key' => '', 'model' => 'gemini-1.5-flash'],
            // Behaviour classification — high volume, fast, strict JSON.
            'behaviour'  => ['provider' => 'groq', 'api_key' => '', 'model' => 'llama-3.1-8b-instant'],
            // Digests / attendance & registration analysis.
            'analysis'   => ['provider' => 'gemini', 'api_key' => '', 'model' => 'gemini-1.5-flash'],
            // Cheap pre-screen of free text before storage.
            'moderation' => ['provider' => 'groq', 'api_key' => '', 'model' => 'llama-3.1-8b-instant'],
        ],
    ],

    // -----------------------------------------------------------------------
    // SMS — Termii first for Nigerian numbers, Twilio first elsewhere; each
    // falls through to the other on failure. Leave both empty to disable
    // (parent verification then goes email-only).
    // -----------------------------------------------------------------------
    'sms' => [
        'default_country' => 'NG',
        'termii' => ['api_key' => '', 'sender' => 'NGG'],
        'twilio' => ['sid' => '', 'token' => '', 'from' => ''],
    ],

    // -----------------------------------------------------------------------
    // Inbound webhooks. Empty secret = endpoint disabled. The sender signs
    // every request (see docs/attendance-webhook.md).
    // -----------------------------------------------------------------------
    'hooks' => [
        'attendance_secret' => '',
    ],

    // -----------------------------------------------------------------------
    // Default Super Admin. Auto-provisioned on first sign-in so a fresh NGG
    // deploy always has a top-tier staff account (role=super_admin → every
    // capability). Separate from Afrovanguard's admin — its own account here.
    // Leave `password` empty to have a strong one generated once; reveal it
    // with `php api/tools/seed-admin.php`. Sign in with email + password, then
    // set up the authenticator (TOTP) on the first Control Room visit.
    // -----------------------------------------------------------------------
    'super_admin' => [
        'email'    => 'mamcareer@afrovanguard.org.ng',
        'name'     => 'Super Admin',
        'password' => '',   // set an exact password here (recommended), or leave blank
    ],

    // Shared HMAC secret for signing export-sink calls. Generate with
    // `openssl rand -hex 64`. Must match SHARED_SECRET in the Apps Script.
    'shared_secret'   => 'REPLACE_ME_64_HEX_BYTES',

    // Cookie signing key — independent from shared_secret. Generate the
    // same way. Used to sign session cookies issued to the browser.
    'cookie_secret'   => 'REPLACE_ME_64_HEX_BYTES_DIFFERENT_FROM_ABOVE',

    // Session lifetime in seconds (7 days).
    'session_ttl'     => 7 * 24 * 3600,

    // Cookie name + flags.
    'cookie_name'     => 'ngg_sess',
    'cookie_domain'   => '',       // empty = same-host only
    'cookie_secure'   => true,     // set false only in local dev over http
    'cookie_samesite' => 'Lax',

    // Public origin (no trailing slash). Used in CORS + redirects.
    'app_origin'      => 'https://yourdomain.com',

    // -----------------------------------------------------------------------
    // Afrovanguard mentorship connection. NGG ("Next Gen") is a program inside
    // Afrovanguard's Street-To-Stardom (STS). Mentors are drawn from the same
    // pool; these links wire the NGG mentorship surface to Afrovanguard's, and
    // the mentor sign-up funnels into the shared STS volunteer pipeline.
    // -----------------------------------------------------------------------
    'afrovanguard' => [
        'org_url'        => 'https://afrovanguard.org.ng',
        'sts_url'        => 'https://afrovanguard.org.ng/projects/sts/programs/',
        'volunteer_url'  => 'https://cacentre.afrovanguard.org.ng/volunteer',
        'mentor_program' => 'Street-To-Stardom · Next Gen',
        // Sync: pull Afrovanguard's approved mentor/volunteer pool into NGG's
        // mentors table (source='afrovanguard'). Leave `api_token` empty to
        // disable the sync. Mint the token in Afrovanguard's Studio →
        // Webhooks → API tokens with the `mentors:read` scope.
        'api_base'  => 'https://afrovanguard.org.ng/integrations/api.php',
        'api_token' => '',   // av_int_… (scope: mentors:read)
    ],

    // Per-IP rate limits — sliding window inside the configured period.
    'rate_limits' => [
        'auth.request' => ['max' => 5,  'window' => 60],
        'auth.verify'  => ['max' => 10, 'window' => 60],
        'upload.sign'  => ['max' => 30, 'window' => 60],
        'default'      => ['max' => 60, 'window' => 60],
    ],

    // Cache settings (filesystem cache, keyed by op + arg hash). Reduces
    // Apps Script round-trips for public reads.
    'cache_dir' => __DIR__ . '/_cache',
    'cache_ttl' => [
        'public.stats'     => 300,  // 5 min
        'public.events'    => 120,
        'public.posts'     => 120,
        'public.session'   => 300,
        'public.anchorContent' => 300,
        'default'          => 0,    // 0 = no cache
    ],

    // -----------------------------------------------------------------------
    // Cloudinary — direct-to-CDN media uploads (mission proofs, assignment
    // submissions, profile photos, cover images). We use SIGNED uploads: the
    // browser never sees the api_secret. It asks this proxy for a short-lived
    // signature (`/api/member/upload-sign.php`), then POSTs the file straight
    // to Cloudinary. Leave `cloud_name` empty to disable uploads entirely —
    // the UI then falls back to pasting a URL.
    //
    // Get these from your Cloudinary dashboard → Settings → API Keys.
    // -----------------------------------------------------------------------
    'cloudinary' => [
        'cloud_name'  => '',               // e.g. 'ngg-afrovanguard'
        'api_key'     => '',               // numeric key
        'api_secret'  => '',               // secret — NEVER exposed to the browser
        'folder'      => 'ngg',            // base folder; per-kind subfolders appended
        'max_bytes'   => 25 * 1024 * 1024, // 25MB hard cap (advisory to client)
        // Allowed upload "kinds" → Cloudinary resource type + folder segment.
        'kinds' => [
            'proof'      => ['resource_type' => 'auto',  'folder' => 'proofs'],
            'submission' => ['resource_type' => 'auto',  'folder' => 'submissions'],
            'avatar'     => ['resource_type' => 'image', 'folder' => 'avatars'],
            'cover'      => ['resource_type' => 'image', 'folder' => 'covers'],
        ],
    ],

    // Debug — flip to true only in local dev. Leaks internal errors.
    'debug' => false,
];
