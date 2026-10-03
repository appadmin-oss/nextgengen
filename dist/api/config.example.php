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
            // Leave OFF. Only enable on a host with a chronically stale CA bundle
            // you cannot fix: it lets one send retry WITHOUT TLS cert verification
            // on a TLS error, which weakens protection for the AUTH credentials.
            'allow_insecure_fallback' => false,
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
        'accrue'    => 86400,  // seconds between fee-accrual passes (daily)
        'accrueBatch' => 500,  // members brought up to date per pass
    ],

    // -----------------------------------------------------------------------
    // EXTERNAL SCHEDULER (optional, and better than web-cron when you have one)
    //
    // Web-cron above rides real page traffic, so a site with a quiet weekend
    // does no background work until somebody visits. If your host CAN schedule
    // — cPanel Cron Jobs, an uptime pinger, a GitHub Action — point it at
    // api/public/cron.php instead and the work happens on the clock:
    //
    //   */15 * * * *  wget -q -O /dev/null "https://YOURDOMAIN/api/public/cron.php?key=THE_KEY"
    //
    // Add &job=accrue|reminders|deliver|maint to run one job rather than all.
    //
    // Set this to a long random string (e.g. `openssl rand -hex 24`). Leave it
    // EMPTY and the endpoint answers 404 — it is off, and says nothing about
    // itself to a scanner. Both paths use the same lock, so you can leave
    // web-cron on while you set the schedule up, then switch it off.
    //
    // The key travels in a URL and so ends up in access logs and in the cron
    // listing: rotate it like a password. It grants running maintenance that
    // was going to run anyway, and nothing else.
    // -----------------------------------------------------------------------
    'cron_key' => '',

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
    // Voice for the Quote of the week (OPTIONAL). Spitch (https://spitch.app)
    // reads Hausa, Igbo and Yoruba natively. Used only when staff press
    // "Generate voice" in Control Room → Quote of the week; the clip is stored,
    // so visitors never trigger a call. Staff voice-overs need no key at all.
    // -----------------------------------------------------------------------
    'tts' => [
        'spitch_key' => '',
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
        'provider'       => 'groq',                    // preference: groq | gemini | anthropic | openrouter
        'groq_api_key'   => '',                        // leave empty to disable
        'groq_model'     => 'llama-3.1-8b-instant',
        'gemini_api_key' => '',                        // leave empty to disable
        'gemini_model'   => 'gemini-1.5-flash',
        // Paid providers. Anything not set is simply skipped, and every
        // provider listed here is a fallback for every other — one exhausted
        // key degrades speed, not capability.
        'anthropic_api_key'  => '',
        'anthropic_model'    => 'claude-haiku-4-5-20251001',
        // OpenRouter is the "and everything else": one key reaches hundreds of
        // models from every major lab, so trying a different one is a config
        // line rather than a deploy. Model ids look like 'vendor/model'.
        'openrouter_api_key' => '',
        'openrouter_model'   => 'meta-llama/llama-3.1-8b-instruct',

        // Pro allocation — one key per purpose so a rate-limited or leaked
        // key degrades ONE feature. Every entry optional; each may carry a
        // 'fallback' => [provider, api_key, model] tried when the first
        // provider errors. All free-tier friendly.
        'profiles' => [
            // Marking open curriculum answers (essays, reflections, projects,
            // code). CAPABLE MODELS ONLY: small/fast tiers (Haiku, Flash,
            // Mini, Lite, anything under 30B) are refused for this profile,
            // and with none left an instructor marks instead.
            'marking'    => ['provider' => 'anthropic', 'api_key' => '', 'model' => 'claude-sonnet-4-5-20250929',
                             'fallback' => ['provider' => 'openrouter', 'api_key' => '', 'model' => 'anthropic/claude-sonnet-4.5']],
            // Reflection Coach — best free conversational quality.
            'coach'      => ['provider' => 'gemini', 'api_key' => '', 'model' => 'gemini-1.5-flash'],
            // Behaviour classification — high volume, fast, strict JSON.
            'behaviour'  => ['provider' => 'groq', 'api_key' => '', 'model' => 'llama-3.1-8b-instant'],
            // Digests / attendance & registration analysis.
            'analysis'   => ['provider' => 'gemini', 'api_key' => '', 'model' => 'gemini-1.5-flash'],
            // Cheap pre-screen of free text before storage.
            'moderation' => ['provider' => 'groq', 'api_key' => '', 'model' => 'llama-3.1-8b-instant'],

            /* Level 7 · the analyst panel (Analytics → "What a panel of
             * analysts makes of this").
             *
             * Four lenses read the SAME aggregate evidence and a fifth pass
             * keeps only what at least two of them reached independently. Point
             * each lens at a DIFFERENT provider or model where you can: four
             * lenses on one model is one opinion four times, and the agreement
             * between them then means nothing. The screen reports how many
             * distinct providers actually answered, so this is visible rather
             * than assumed.
             *
             * Each is optional and falls back to the default block. A strong
             * model is worth it for 'insight_synth', which does the cutting.
             *
             * Nothing identifying is sent — see api/_lib/domain/insight.php.
             * The payload is counts, rates and confidence intervals, and a
             * second pass refuses the whole run rather than send a name, an id,
             * a contact or a date of birth.
             */
            'insight_mechanism' => ['provider' => 'anthropic',  'api_key' => '', 'model' => 'claude-haiku-4-5-20251001'],
            'insight_action'    => ['provider' => 'gemini',     'api_key' => '', 'model' => 'gemini-1.5-flash'],
            'insight_risk'      => ['provider' => 'openrouter', 'api_key' => '', 'model' => 'deepseek/deepseek-chat'],
            'insight_equity'    => ['provider' => 'groq',       'api_key' => '', 'model' => 'llama-3.3-70b-versatile'],
            'insight_synth'     => ['provider' => 'anthropic',  'api_key' => '', 'model' => 'claude-sonnet-4-5-20250929'],
            /* Level 7b · the analyst chat.
             *
             * 'insight_router' only decides which lenses a question needs, so it
             * wants the cheapest, fastest model you have — it runs on every turn
             * and produces about forty tokens. Spending a large model there buys
             * nothing; the lens calls are where the thinking happens.
             *
             * 'insight_answer' composes the reply the coordinator actually reads
             * and is the one place worth a capable model: it has to hold a
             * disagreement between two analysts without tidying it away, which
             * is exactly what a small model does. */
            'insight_router'    => ['provider' => 'groq',       'api_key' => '', 'model' => 'llama-3.1-8b-instant'],
            'insight_answer'    => ['provider' => 'anthropic',  'api_key' => '', 'model' => 'claude-sonnet-4-5-20250929'],
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

    /* ---------------------------------------------------------------------
     * Whose word to take for "who is calling".
     *
     * `CF-Connecting-IP` and `X-Forwarded-For` are claims. They are worth
     * believing only when they arrive through something that would have
     * overwritten a forged one — otherwise a caller simply picks their own
     * address, and since EVERY rate limit is keyed on the answer, picking a
     * fresh one per request means no rate limit at all. That is the difference
     * between an eight-guess ceiling on the kiosk password and none.
     *
     * List the CIDRs your traffic genuinely arrives from. Only when Apache's
     * REMOTE_ADDR is inside one of them is a forwarded header believed.
     *
     * EMPTY (the default) = trust nothing, use REMOTE_ADDR. Correct for a
     * direct-to-Apache shared host. If you are behind Cloudflare and leave this
     * empty, every visitor looks like the same edge address: throttles get
     * stricter, never looser, which is the right way round to be wrong.
     *
     * Cloudflare publishes its ranges at https://www.cloudflare.com/ips/ —
     * paste the current v4 + v6 lists here if you sit behind it.
     * ------------------------------------------------------------------- */
    'trusted_proxies' => [
        // '173.245.48.0/20', '103.21.244.0/22', …   // Cloudflare IPv4
        // '2400:cb00::/32', '2606:4700::/32', …     // Cloudflare IPv6
        // '127.0.0.1',                              // local reverse proxy
    ],

    /* Browser origins allowed to call the PUBLIC api cross-origin. Sister sites
     * embed the volunteer form headlessly. No credentials cross the boundary;
     * an origin not on this list simply gets no CORS headers. Omit the key to
     * accept the built-in Afrovanguard defaults. */
    'cors_origins' => [
        'https://sts.afrovanguard.org.ng',
        'https://afrovanguard.org.ng',
        'https://www.afrovanguard.org.ng',
    ],

    /* Where application logs and PHP warnings are written. The folder ships
     * with a deny-all .htaccess; move it outside the web root if your host
     * allows. */
    'log_dir' => __DIR__ . '/logs',

    /* The MySQL schema mirror, replayed additively when its hash changes.
     * Only set this if the repo layout differs from the default. */
    'mysql_schema_path' => __DIR__ . '/../db/schema-mysql.sql',

    /* Organisation identity, used in emails, certificates and printed cards. */
    'org' => [
        'name'  => 'Next Generation Genius',
        'short' => 'NGG',
        'email' => 'hello@yourdomain.com',
    ],

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
        // A member promoted to NGV gets their NGV account on Afrovanguard
        // (domain/ngv-portal.php). The secret is the same value as
        // NGG_WEBHOOK_SECRET in Afrovanguard's environment; empty ⇒ off.
        'ngv_webhook_secret' => '',
        'ngv_webhook_url'    => '',   // empty ⇒ {org_url}/integrations/ngg.php
    ],

    // Per-IP rate limits — sliding window inside the configured period.
    'rate_limits' => [
        'auth.gateway' => ['max' => 30,  'window' => 60],  // identifier lookup only (sends nothing); generous for shared NATs
        'auth.request' => ['max' => 5,   'window' => 60],  // actually emails a sign-in code
        'auth.verify'  => ['max' => 10,  'window' => 60],
        'upload.sign'  => ['max' => 30,  'window' => 60],
        'gate'         => ['max' => 300, 'window' => 60],  // staff desk: high-volume check-ins
        'gate.unlock'  => ['max' => 8,   'window' => 300], // kiosk password: brute-force throttle
        'circle.lookup'=> ['max' => 6,   'window' => 300], // guardian invite-code lookup: safeguarding throttle (a 6-digit code → a child's name)
        'circle.connect'=> ['max' => 5,  'window' => 600], // guardian pairing: consumes a code, tighter still
        'id.resend'    => ['max' => 60,  'window' => 300], // admin resend-ID: guards against accidental mass re-send
        'apply'        => ['max' => 6,   'window' => 60],  // intake: sends an acknowledgement email to a client-supplied address
        'apply.hour'   => ['max' => 30,  'window' => 3600],// intake: mail-amplification ceiling per IP (checked alongside 'apply')
        'contact'      => ['max' => 5,   'window' => 60],  // contact form: notifies admins on every send
        'donate'       => ['max' => 10,  'window' => 60],  // donation init: inserts a row + outbound Paystack call
        'application.status' => ['max' => 20, 'window' => 300], // self-service status: throttle (ref,email) brute-force
        'summer.profile' => ['max' => 12, 'window' => 300],// public student profile: minor PII by guessable handle
        'qr'           => ['max' => 240, 'window' => 60],  // public QR image (referenced by emails; high because clients refetch)
        'hook'         => ['max' => 120, 'window' => 60],  // inbound webhook bursts
        'default'      => ['max' => 60,  'window' => 60],
    ],

    // Cache settings (filesystem cache, keyed by op + arg hash). Reduces
    // Apps Script round-trips for public reads.
    'cache_dir' => __DIR__ . '/_cache',
    // Every op read with useCache = true needs an entry here, or the read is
    // simply uncached (gs_cache_read bails on a non-positive TTL, and since the
    // write now honours the same rule, nothing is stored either). The admin
    // writes that change these purge them immediately via cache_invalidate(),
    // so the TTL is a backstop rather than the mechanism — which is why these
    // can be generous without a save appearing not to have happened.
    'cache_ttl' => [
        'public.stats'     => 300,  // 5 min
        'public.events'    => 120,
        'public.posts'     => 120,
        'public.session'   => 300,
        'public.anchorContent' => 300,
        'public.centres'   => 300,  // centre list; purged on centre_upsert/delete
        /* The /summer page's one read: the live edition, the academies and the
           centres with what runs at each. All configuration and aggregates, so
           a five-minute window is generous rather than risky — and it is the
           page a promotion drives traffic to, which is exactly when a cache
           earns its keep. Purged alongside public.centres on a centre write. */
        'public.summer'    => 300,
        'community.showcase' => 180, // admin-featured posts; purged on feature/hide
        'post.get'         => 120,  // a single post by slug; purged with public.posts
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
