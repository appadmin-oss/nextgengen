<?php
declare(strict_types=1);

/**
 * Filesystem-backed sliding-window rate limiter. Adequate for shared hosting
 * without Redis. One file per (key, window).
 */

/**
 * Code-level safety floors for security-critical buckets. Config.php values
 * always win; these guarantee a sane throttle exists even on a deployment whose
 * config predates a new bucket — without them a missing key silently falls back
 * to the loose 'default' (60/min), which for mail-sending or minor-PII lookups
 * is a spam-relay / enumeration hazard.
 */
function rate_limit_default(string $op): ?array {
    static $d = [
        /* THE CREDENTIAL BUCKETS COME FIRST, because they are the ones this
         * function exists for and the ones it used to leave out.
         *
         * Every bucket below this group had a floor; `auth.verify`,
         * `auth.request`, `gate.unlock` and the two circle buckets did not —
         * they lived only in config.example.php. So a deployment whose
         * config.php predated them (the exact case the docblock above
         * describes) silently ran password sign-in, OTP delivery, TOTP
         * verification and the kiosk password at the loose 60/minute default.
         * The module was applying its own stated principle to the second-tier
         * buckets and not to the first-tier ones. */
        'auth.gateway'       => ['max' => 30, 'window' => 60],    // identifier lookup only; sends nothing
        'auth.request'       => ['max' => 5,  'window' => 60],    // EMAILS a sign-in code — mail-amplification
        /* The per-minute buckets above stop a burst; these stop the slow drip
           that stays under them all day. A whole centre on
           one WiFi signing in at once is ~30 lookups, not 120. The finer
           control is the per-address miss pause in auth_find_member(). */
        'auth.gateway.hour'  => ['max' => 120, 'window' => 3600],
        'auth.request.hour'  => ['max' => 30,  'window' => 3600],
        'auth.verify'        => ['max' => 10, 'window' => 60],    // password / OTP / TOTP checks
        'family.request'     => ['max' => 5,  'window' => 60],    // EMAILS a sign-in code, like auth.request
        'timetable.save'     => ['max' => 5,  'window' => 60],    // EMAILS a timetable link — mail-amplification
        'timetable.load'     => ['max' => 30, 'window' => 60],    // a link token is a bearer secret; slows guessing
        'family.verify'      => ['max' => 10, 'window' => 60],
        'family.write'       => ['max' => 30, 'window' => 60],
        // A report photo arrives in up to 80 pieces; one upload must fit, ten in a minute must not.
        'family.upload'      => ['max' => 160, 'window' => 60],
        // A case emails its owner and can page staff (P1/P2): per signed-in person.
        'support.open'       => ['max' => 6,  'window' => 3600],
        'support.write'      => ['max' => 30, 'window' => 600],   // replies, solve, rate
        'gate.unlock'        => ['max' => 8,  'window' => 300],   // kiosk desk password
        'circle.lookup'      => ['max' => 6,  'window' => 300],   // 6-digit code → a child's name
        'circle.connect'     => ['max' => 5,  'window' => 600],   // consumes a code; tighter still
        'upload.sign'        => ['max' => 30, 'window' => 60],    // mints a cloud upload signature
        'hook'               => ['max' => 120, 'window' => 60],   // inbound webhook bursts
        'wifi.feed'          => ['max' => 20, 'window' => 60],    // a router fetches every 5 minutes; a key guess is slowed
        'wifi.speed'         => ['max' => 40, 'window' => 600],   // a speed test is a handful of downloads; slows anybody using it as a pipe
        'wifi.pin'           => ['max' => 6,  'window' => 600],   // a member's own PIN reset (3 a day is the domain's rule)
        'member.coach'       => ['max' => 20, 'window' => 600],   // each reply is a paid model call
        'member.chat'        => ['max' => 20, 'window' => 600],   // a child's messages to their mentor; each one notifies an adult
        'results.read'       => ['max' => 6,  'window' => 600],   // reads a report card with a vision model — a paid call
        'results.draft'      => ['max' => 6,  'window' => 600],   // drafts a plan, may call a model
        'results.write'      => ['max' => 60, 'window' => 60],    // saves, ticks, sends
        'results.remind'     => ['max' => 20, 'window' => 600],   // pushes a reminder to a child
        'ids.plan'           => ['max' => 30, 'window' => 600],   // reads a print request, may call a model

        'apply'              => ['max' => 6,  'window' => 60],    // sends an acknowledgement email to a client-supplied address
        'apply.hour'         => ['max' => 30, 'window' => 3600],  // mail-amplification ceiling per IP
        'apply.check'        => ['max' => 10, 'window' => 60],    // "applied before?" — yes/no on email + date of birth
        'apply.check.hour'   => ['max' => 40, 'window' => 3600],  // so it cannot be walked through a list of birthdays
        'schools'            => ['max' => 120, 'window' => 60],   // the school picker searches as a family types
        'contact'            => ['max' => 5,  'window' => 60],    // notifies admins on every send
        'donate'             => ['max' => 10, 'window' => 60],    // inserts a row + outbound Paystack call
        'membership.pay'     => ['max' => 20, 'window' => 60],    // a family's invoice: read, start Paystack, verify
        'membership.receipt' => ['max' => 30, 'window' => 60],
        'cert'               => ['max' => 30, 'window' => 60],    // a certificate names a child, their centre and attendance
        'application.status' => ['max' => 20, 'window' => 300],   // (ref,email) brute-force lookup
        'summer.profile'     => ['max' => 12, 'window' => 300],   // a minor's name + photo + attendance, by guessable handle
        'student.login'      => ['max' => 8,  'window' => 300],   // ID-card credential check — brute-force ceiling
        /* The external scheduler endpoint. A secret in a URL is a secret worth
           a brute-force ceiling, and this bucket is checked BEFORE the key is
           compared so it also caps how often anyone can make the box do work.
           Generous enough for a per-minute cron, nowhere near enough to search
           a random key. */
        'cron.external'      => ['max' => 12, 'window' => 60],
        /* Raising a request reaches a human and can attach a receipt. Twelve an
           hour is more than anybody needs and far less than a flood. */
        'member.request'     => ['max' => 12, 'window' => 3600],
        /* Scoped per MEMBER at the route (see api/member/community.php), not per
           IP alone. A centre is one address: thirty children in a computer room
           shared twelve posts a minute between them, and the thirteenth was
           told to slow down. The same reasoning is written out for
           'summer.register' below and was never applied here.

           The real per-author control is community_spam_check(), which throttles
           on behaviour (15s between posts, duplicate detection, 15/hour). This
           stays a runaway-script ceiling, sized so a busy classroom never
           reaches it. */
        'community.post'     => ['max' => 12, 'window' => 60],    // per member
        'community.post.ip'  => ['max' => 240, 'window' => 60],   // per address — a whole centre
        /* Nudging. The rule that matters is one per child per day, enforced in
           community_homework_nudge(); this is only a ceiling on the endpoint so
           a stuck client cannot spin on it. Sized for the real action — a
           mentor pressing "Nudge all 10 outstanding" on two or three tasks in
           a sitting — not for one press. */
        'community.nudge'    => ['max' => 20, 'window' => 300],   // per mentor
        /* The Mentor Portal's writes, PER MENTOR (rate_limit_check_actor). They
           had no floor, so a deployment whose config predated them ran at the
           loose default, and they were keyed by IP — one centre's WiFi shared
           one bucket while a mentor on mobile data had a fresh one per hop.
           Sized for a real Saturday: a register of a pod, a dozen reviews. */
        'mentor.meeting'     => ['max' => 60, 'window' => 600],
        'mentor.review'      => ['max' => 40, 'window' => 600],
        'mentor.courage'     => ['max' => 40, 'window' => 600],
        'mentor.family'      => ['max' => 10, 'window' => 3600],  // each one texts and emails a family
        'mentor.concern'     => ['max' => 5,  'window' => 600],   // the per-day cap is sg_report_capped()
        'mentor.write'       => ['max' => 120, 'window' => 600],  // every other portal write
        'safeguarding.report' => ['max' => 5, 'window' => 600],
        'media.purge'        => ['max' => 3, 'window' => 3600],   // each press may run ~20 Cloudinary deletes
        /* A typing ping. One write per 3s while actually typing is 20/minute;
           this ceiling is triple that, so a real conversation never reaches it
           and a stuck client is stopped. */
        'community.typing'   => ['max' => 60, 'window' => 60],    // per member
        /* Journal writes, including the writer's autosave. Sized for somebody
           writing steadily for an hour with a save every few seconds, not for
           one press — an autosave that starts refusing mid-sentence loses the
           thing this screen exists to protect. */
        'journal.write'      => ['max' => 120, 'window' => 300],  // per member
        /* Telemetry, not an action: the client reports once per page when a
           configured media cloud refused an upload. Sized so a whole centre on
           one WiFi during a broken deployment still gets its warnings recorded —
           the point of this signal is that it arrives while the cloud is down. */
        'upload.fallback'    => ['max' => 30, 'window' => 300],
        // The public self-registration link. Its own buckets, so a queue of
        // families filling in the form cannot lock out the check-in desk they
        // are standing in front of.
        //
        // Both are keyed on IP + gate (see the $scope argument), and sized for
        // the case that is NORMAL rather than the one that is hostile: a whole
        // centre — or a whole mobile carrier — shares one address, so a queue of
        // families registering from the same WiFi is the expected traffic, not
        // an attack. At 4 per 5 minutes the fifth family was refused, and told
        // to check a connection that was fine. The same reasoning is already
        // written out for 'arcade.start' below; it was never applied here.
        //
        // These stay a runaway-script ceiling, nothing finer. The real control
        // is that a submission is not a registration: it lands as self_pending
        // and a human at the review desk has to approve it before anything
        // reaches a family (see api/public/selfreg.php).
        'selfreg.read'       => ['max' => 120, 'window' => 60],
        'selfreg.submit'     => ['max' => 40,  'window' => 300],
        'selfreg.desk'       => ['max' => 240, 'window' => 60],   // a reviewer works fast; the password is the real control
        /* Images, and they are requested in BULK by the page rather than one at
         * a time by a person: a review queue is 25 headshots, a printed card
         * sheet is 40, and a whole centre shares one address. The default
         * 60/minute turned the second page of a queue into broken frames, which
         * is indistinguishable from the photos being missing. The real control
         * here is that the id is an unguessable HMAC of the bytes — this is a
         * runaway ceiling, nothing finer. */
        'photo'              => ['max' => 600, 'window' => 60],
        'photo.framing'      => ['max' => 120, 'window' => 60],
        'qr'                 => ['max' => 300, 'window' => 60],
        // Starting a round writes a row and generates a question set. The limit
        // is keyed on IP, and a whole centre shares one connection — a class of
        // thirty children opening the arcade together is the NORMAL case, not
        // an attack, so this has to clear that comfortably. It is a ceiling on
        // a runaway script, nothing finer; the real gate is the session, and an
        // abandoned round is pruned within the week.
        'arcade.start'       => ['max' => 120, 'window' => 60],
        /* Inviting somebody to a match is the one action here that reaches
         * ANOTHER child, so it is rate-limited more tightly than play itself.
         * Keyed on IP, and a whole centre shares one connection, so this still
         * has to clear a class arranging games at break. Repeat invitations to
         * the same person are refused outright by the domain layer
         * (already_playing) — this is the ceiling on a script. */
        'match.invite'       => ['max' => 40, 'window' => 60],
        // A shared journal entry's token is the only thing between a guess and a
        // programme record, so guessing should be expensive. Generous enough for
        // a link legitimately opened by a group from one office connection.
        'journal.shared'     => ['max' => 30, 'window' => 300],
    ];
    return $d[$op] ?? null;
}

/**
 * @param string $op    the bucket name
 * @param string $scope extra key material, so one tenant cannot exhaust another's
 *                      allowance. Everything here is keyed on IP, and on a mobile
 *                      carrier or a centre's WiFi an entire queue of people shares
 *                      one address — so for a per-link surface (a gate's public
 *                      sign-up) the gate id belongs in the key, or the busiest
 *                      centre silently rations every other centre.
 */
/** The same limit, keyed on the signed-in person alone, never the IP: for a
 *  write only an authenticated account can make, where the person is the
 *  thing being limited. */
function rate_limit_check_actor(string $op, string $actorId): void {
    if ($actorId === '') { rate_limit_check($op); return; }
    rate_limit_check($op, $actorId, true);
}

function rate_limit_check(string $op, string $scope = '', bool $actorOnly = false): void {
    global $CONFIG;
    // Config wins; then a hardcoded safety floor; then the loose default; then a
    // last-resort literal so a missing 'rate_limits' block can never fatal.
    $cfg = $CONFIG['rate_limits'][$op]
        ?? rate_limit_default($op)
        ?? $CONFIG['rate_limits']['default']
        ?? ['max' => 60, 'window' => 60];
    $max = (int)$cfg['max'];
    $window = (int)$cfg['window'];
    $ip = client_ip();
    $key = $actorOnly ? sha1($op . '|actor|' . $scope) : sha1($op . '|' . $ip . ($scope === '' ? '' : '|' . $scope));
    $dir = $CONFIG['cache_dir'] . '/_rl';
    @mkdir($dir, 0755, true);
    $path = $dir . '/' . $key;

    $now = time();
    $cutoff = $now - $window;

    // Hold an exclusive lock across the WHOLE read-modify-write so two concurrent
    // requests can't both read a sub-limit count and both append — the previous
    // unlocked read + LOCK_EX write let bursts slip past the cap, defeating the
    // brute-force throttles this exists to enforce.
    $fh = @fopen($path, 'c+');
    if ($fh === false) return; // fail-open rather than 500 on a cache-dir hiccup
    if (!flock($fh, LOCK_EX)) { fclose($fh); return; }

    $hits = [];
    $raw = stream_get_contents($fh);
    if ($raw) {
        foreach (explode("\n", trim($raw)) as $ts) {
            if (is_numeric($ts) && (int)$ts >= $cutoff) $hits[] = (int)$ts;
        }
    }
    if (count($hits) >= $max) {
        // Retry-After turns a refusal into something a client can obey. Without
        // it an offline outbox retries on its own schedule and simply keeps
        // hitting the wall; with it, it backs off until the window has actually
        // rolled. The oldest hit in the window is when a slot next frees up.
        $retry = max(1, ($hits ? min($hits) : $now) + $window - $now);
        flock($fh, LOCK_UN); fclose($fh);
        if (!headers_sent()) header('Retry-After: ' . $retry);
        json_error('rate_limited', 429);
    }
    $hits[] = $now;
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, implode("\n", $hits));
    fflush($fh);
    flock($fh, LOCK_UN); fclose($fh);

    // Opportunistic GC: the _rl dir otherwise grows one file per (op,IP) forever.
    // ~0.5% of calls sweep files untouched for 2× the longest window.
    if (function_exists('random_int') && random_int(0, 199) === 0) rate_limit_gc($dir);
}

/** Remove stale rate-limit files (older than a generous multiple of any window). */
function rate_limit_gc(string $dir): void {
    $stale = time() - 2 * 3600; // 2h: comfortably past every configured window
    foreach (@glob($dir . '/*') ?: [] as $f) {
        if (@filemtime($f) < $stale) @unlink($f);
    }
}
