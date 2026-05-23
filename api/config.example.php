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
    // The Apps Script Web App URL (ends in /exec). Get this from the Apps
    // Script editor → Deploy → Manage deployments.
    'apps_script_url' => 'https://script.google.com/macros/s/REPLACE_ME/exec',

    // 64+ random bytes hex. MUST match the SHARED_SECRET set in Apps Script
    // Script Properties. Generate with: `openssl rand -hex 64`.
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

    // Debug — flip to true only in local dev. Leaks internal errors.
    'debug' => false,
];
