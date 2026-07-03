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
