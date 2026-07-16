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
    // Outbound email. Uses SMTP when `smtp.host` is set (STRONGLY recommended —
    // shared-host PHP mail() is usually SPF-unaligned and lands in spam), else
    // PHP mail(). Every message carries Date + Message-ID + a text/plain part.
    //
    // DELIVERABILITY CHECKLIST (the usual cause of "emails don't arrive"):
    //   1. Set smtp.* below to an authenticated relay (Mailgun/SES/Postmark/etc).
    //   2. `from_email` MUST be on a domain you control and that the relay is
    //      authorized to send for — ideally the same mailbox as `smtp.user`.
    //   3. In that domain's DNS add SPF (include the relay), DKIM (the relay's
    //      key), and a DMARC record. Without these, mail is spam-filtered or
    //      rejected even when the send "succeeds".
    //   4. Verify from Control Room → Settings → Email delivery ("Send test
    //      email") — it reports the mode, resolved From/Reply-To, SMTP target,
    //      and flags SPF/From-alignment problems.
    // -----------------------------------------------------------------------
    // SMTP is sent through a bundled PHPMailer (api/_lib/phpmailer/) — the
    // same client the sibling Africa GATES app uses to deliver on Google
    // Workspace — so a correct config below "just works" without Composer.
    //
    // GOOGLE WORKSPACE / GMAIL EXAMPLE:
    //   'from_email' => 'youraccount@yourdomain.com',  // the signed-in mailbox
    //                    (or a Workspace "Send mail as" verified alias)
    //   'smtp' => [
    //       'host' => 'smtp.gmail.com', 'port' => 587, 'secure' => 'tls',
    //       'user' => 'youraccount@yourdomain.com',
    //       'pass' => 'abcd efgh ijkl mnop',   // a 16-char APP PASSWORD, not
    //                  your login password. Google Account → Security →
    //                  2-Step Verification → App passwords. (465 + secure 'ssl'
    //                  also works.) Workspace relay: smtp-relay.gmail.com.
    //   ],
    'mail' => [
        'from_name'  => 'Next Generation Genius',
        'from_email' => 'no-reply@ngg.afrovanguard.org',  // match the smtp.user mailbox
        'reply_to'   => 'next@afrovanguard.org.ng',
        'smtp' => [
            'host'   => '',            // e.g. 'smtp.gmail.com' — empty = skip SMTP
            'port'   => 587,
            'secure' => 'tls',         // 'tls' (587) | 'ssl' (465) | '' (plain)
            'user'   => '',
            'pass'   => '',
        ],
        // Resend HTTPS fallback (https://resend.com). Good on shared hosting
        // when the host blocks outbound SMTP ports AND silently drops PHP
        // mail(): Resend is a plain HTTPS POST. Free tier = 3,000/month; set
        // from_email to a domain verified in your Resend dashboard (or use
        // onboarding@resend.dev for testing).
        'resend_key' => '',            // e.g. 're_xxxxxxxx' — empty = disabled

        // Full delivery order: SMTP (if host set) → Apps Script MailApp (if
        // apps_script_url + shared_secret set) → Resend (if key set) → mail().
        // The Apps Script path is the most reliable on shared hosting — see the
        // Apps Script block below. Set this to false to skip it.
        'apps_script' => true,
    ],

    // -----------------------------------------------------------------------
    // Web-cron (for hosts with NO SSH/cron — the default assumption). A normal
    // request, at most once per interval, drains the integration bus, sends due
    // parent-verification reminders, and runs daily maintenance (publish
    // scheduled posts, expire promo, GC auth challenges, trim audit log) AFTER
    // the response is flushed. If you DO have a real cron driving api/tools/*,
    // set 'enabled' => false to avoid doing the work twice.
    // -----------------------------------------------------------------------
    'webcron' => [
        'enabled'   => true,
        'deliver'   => 60,     // seconds between integration-bus drains
        'reminders' => 900,    // seconds between reminder sweeps
        'maint'     => 3600,   // seconds between maintenance passes
    ],

    // -----------------------------------------------------------------------
    // Google Sheets read-only mirror (OPTIONAL). If set, api/tools/export-sheets.php
    // pushes DB snapshots here on a cron so admins keep a familiar spreadsheet
    // view. Not on the read path — the database above is authoritative. Leave
    // `apps_script_url` empty to disable the mirror entirely.
    //
    // EMAIL VIA APPS SCRIPT (recommended on shared hosting): the same Web App
    // also relays transactional email through Google's MailApp — the most
    // reliable path when the host blocks SMTP and drops mail() (it's how the
    // STS CEO site delivers). To enable: deploy apps-script/Code.gs as a Web
    // App (Execute as: Me, Access: Anyone), accept the Mail scope on first run,
    // set SHARED_SECRET in its Script Properties to match `shared_secret`
    // below, and put the /exec URL in `apps_script_url`. send_mail() then tries
    // SMTP → Apps Script → Resend → mail(). Set mail.apps_script = false to
    // opt out (e.g. keep the mirror but send email another way).
    // -----------------------------------------------------------------------
    'apps_script_url' => '',   // Apps Script Web App URL (…/exec) — mirror + email relay

    // -----------------------------------------------------------------------
    // Donations (OPTIONAL) — Paystack. Leave `secret` empty to hide the donate
    // flow entirely (public.donate.init returns donations_unavailable). Set the
    // Paystack webhook URL to  <app_origin>/api/hooks/paystack.php  and expose
    // the public key to the donate form via `public`.
    // -----------------------------------------------------------------------
    'paystack' => [
        'secret' => '',   // sk_live_… (or sk_test_…)
        'public' => '',   // pk_live_… (shown to the browser; safe)
    ],

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
    //
    // ADMINS SIGN IN WITH THIS PASSWORD — NOT AN EMAIL CODE. Every console
    // (staff/admin) account is password-only: the emailed sign-in code and
    // magic-link paths are refused for them, so set `password` here to a strong
    // value you control. Leave it empty only if you want one generated once —
    // reveal it with `php api/tools/seed-admin.php`. After signing in with the
    // password, set up the authenticator (TOTP) on the first Control Room visit.
    // (Forgot it? Use "Forgot your password?" — the email reset flow still
    // works; it sets a new password rather than logging in without one.)
    // -----------------------------------------------------------------------
    'super_admin' => [
        'email'    => 'mamcareer@afrovanguard.org.ng',
        'name'     => 'Super Admin',
        'password' => '',   // REQUIRED for password sign-in — set an exact password here
    ],

    // Shared HMAC secret for signing export-sink calls. Generate with
    // `openssl rand -hex 64`. Must match SHARED_SECRET in the Apps Script.
    'shared_secret'   => 'REPLACE_ME_64_HEX_BYTES',

    // Cookie signing key — independent from shared_secret. Generate the
    // same way. Used to sign session cookies issued to the browser.
    'cookie_secret'   => 'REPLACE_ME_64_HEX_BYTES_DIFFERENT_FROM_ABOVE',

    // Session lifetime in seconds (7 days = absolute cap on a signed cookie).
    'session_ttl'     => 7 * 24 * 3600,

    // Kiosk session lifetime (seconds) — a gate-scoped desk session minted when
    // field staff unlock a gate with its password. Kept short; it also never
    // outlives the gate link's own expiry.
    'kiosk_ttl'       => 12 * 3600,

    // Idle timeout: seconds of inactivity before a session is force-expired
    // (revoked server-side + cookie cleared). Staff are held to a tight window
    // per the operational policy; members get a longer leash. 0 disables a tier.
    'session_idle'    => ['admin' => 1800, 'member' => 43200],

    // Cookie name + flags.
    'cookie_name'     => 'ngg_sess',
    'cookie_domain'   => '',       // empty = same-host only
    'cookie_secure'   => true,     // set false only in local dev over http
    'cookie_samesite' => 'Lax',

    // Public origin (no trailing slash). Used in CORS + redirects.
    'app_origin'      => 'https://yourdomain.com',

    // -----------------------------------------------------------------------
    // Afrovanguard mentorship connection. NGG ("Next Gen") is a program inside
    // Afrovanguard's Street-To-Stardom (STS) — but NGG is the MAIN, live site.
    // Leave sts_url / volunteer_url EMPTY and they fall back to NGG's own pages
    // (this site + /volunteer); only set them once the external STS site is
    // actually live, so nothing links users to an unbuilt destination.
    // -----------------------------------------------------------------------
    'afrovanguard' => [
        'org_url'        => 'https://afrovanguard.org.ng',   // parent org (optional)
        'sts_url'        => '',   // empty ⇒ NGG (app_origin); set when STS is live
        'volunteer_url'  => '',   // empty ⇒ NGG's own /volunteer
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
        'auth.request' => ['max' => 5,   'window' => 60],
        'auth.verify'  => ['max' => 10,  'window' => 60],
        'upload.sign'  => ['max' => 30,  'window' => 60],
        'gate'         => ['max' => 300, 'window' => 60],  // staff desk: high-volume check-ins
        'gate.unlock'  => ['max' => 8,   'window' => 300], // kiosk password: brute-force throttle
        'circle.lookup'=> ['max' => 6,   'window' => 300], // guardian invite-code lookup: safeguarding throttle (a 6-digit code → a child's name)
        'circle.connect'=> ['max' => 5,  'window' => 600], // guardian pairing: consumes a code, tighter still
        'hook'         => ['max' => 120, 'window' => 60],  // inbound webhook bursts
        'default'      => ['max' => 60,  'window' => 60],
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
        // Photo-pipeline credit guard: poll /usage and stop spending AI-transform
        // credits (upscale/background/restore) once usage crosses the threshold —
        // Cloudinary still does the free optimization pass. Humans are alerted.
        'credit_guard' => ['enabled' => true, 'threshold_pct' => 90],
        'max_bytes'   => 25 * 1024 * 1024, // 25MB hard cap (advisory to client)
        // Allowed upload "kinds" → Cloudinary resource type + folder segment.
        // Any kind not listed here still works: it falls back to an image
        // upload in a folder of the same name (see upload-sign.php), so new
        // surfaces don't need a config change to a host you can't SSH into.
        'kinds' => [
            'proof'      => ['resource_type' => 'auto',  'folder' => 'proofs'],
            'submission' => ['resource_type' => 'auto',  'folder' => 'submissions'],
            'avatar'     => ['resource_type' => 'image', 'folder' => 'avatars'],
            'cover'      => ['resource_type' => 'image', 'folder' => 'covers'],
            'headshot'   => ['resource_type' => 'image', 'folder' => 'headshots'],
        ],
        // Public (unsigned) uploads — for registration photos captured by
        // applicants who have no account yet (the gate flow has no session).
        // Create an *unsigned* upload preset in Cloudinary (Settings → Upload →
        // Upload presets) and put its name here. Leave empty to disable the
        // public path; the signed path is then used when a staff member is
        // signed in (kiosk registration). The api_secret is never involved.
        'unsigned_preset' => '',             // e.g. 'ngg_public_headshots'
        'unsigned_folder' => 'ngg/headshots',
    ],

    // Debug — flip to true only in local dev. Leaks internal errors.
    'debug' => false,
];
