<?php
/**
 * External scheduler entry point.
 *
 * The app runs its background work opportunistically off real page traffic
 * (api/_lib/webcron.php), because most NGG deployments are shared hosting with
 * no scheduler at all. That is a good default and a poor guarantee: a site with
 * no visitors between Friday and Monday does no work in between, and "the
 * reminders went out late because nobody loaded a page" is not something an
 * operator can act on.
 *
 * So a host that HAS a scheduler — cPanel cron, an uptime pinger, GitHub
 * Actions, anything that can fetch a URL — can drive the same jobs from
 * outside:
 *
 *   curl -fsS "https://example.org/api/public/cron.php?key=SECRET"
 *   curl -fsS "https://example.org/api/public/cron.php?key=SECRET&job=accrue"
 *
 * Or, with no shell:  Cron Jobs → wget -q -O /dev/null "https://…?key=SECRET"
 *
 * It is the SAME jobs behind the SAME lock as the opportunistic path, so the
 * two are safe to run together — which is what makes moving from one to the
 * other a config change rather than a migration. Jobs are idempotent; running
 * one twice in a minute costs a no-op, not a double charge.
 *
 * ── Access ───────────────────────────────────────────────────────────────────
 * Make the key in Control Room → Settings → Integrations → Make.com (or set
 * $CONFIG['cron_key'] to a long random string). With none this endpoint
 * is OFF and answers 404 — indistinguishable from not being deployed, because a
 * 403 tells a scanner the door exists. The key is compared with hash_equals and
 * the endpoint is rate-limited, so guessing it is not cheaper than guessing a
 * password.
 *
 * The key travels in a URL, which is the one real weakness: URLs end up in
 * access logs and in a cPanel cron listing. That is an accepted trade — every
 * scheduler on this class of host can fetch a URL and almost none can set a
 * header — but the key is therefore worth rotating like a password, and it
 * grants exactly this: running maintenance that was going to run anyway.
 * `X-NGG-Cron-Key` is accepted too, for a scheduler that can send one.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';

header('Cache-Control: no-store');

$configured = cron_key_effective();   // made on screen (Settings → Integrations → Make.com), or config.php
$given = (string)($_GET['key'] ?? ($_SERVER['HTTP_X_NGG_CRON_KEY'] ?? ''));

/* Unset means not deployed, as far as the outside world is concerned. */
if ($configured === '') { http_response_code(404); echo "not found\n"; exit; }

/* Rate-limited BEFORE the comparison, so this cannot be used as an oracle to
   time-search the key, and cannot be used to make the box do work at will. */
rate_limit_check('cron.external', client_ip());

if (!hash_equals($configured, $given)) {
    http_response_code(404);
    echo "not found\n";
    exit;
}

/*
 * The jobs are the scheduler's own registry (web_cron_jobs) — one list, so the
 * outside scheduler and the visitor tick can never disagree about what exists.
 * `all` (the default) runs everything due, most overdue first, within
 * WEB_CRON_EXT_BUDGET — under Cloudflare's 100 s — and marks the outside
 * scheduler as the driver: for the next five minutes visitors' pages do no
 * background work at all, which is the point. A named job runs now, whatever
 * its interval. `crm` is kept as the old name of crm_push.
 */
$JOBS = array_map(static fn($j) => $j[1], web_cron_jobs());
$want = trim((string)($_GET['job'] ?? 'all'));
if ($want === 'crm') $want = 'crm_push';
$started = microtime(true);
if ($want === '' || $want === 'all') {
    web_cron_touch('external');
    if (function_exists('set_time_limit')) @set_time_limit(WEB_CRON_EXT_BUDGET + 10);
    $result = web_cron_tick((float)WEB_CRON_EXT_BUDGET, 99);
    if (!empty($result['busy'])) $result = ['all' => 'busy'];
} elseif (isset($JOBS[$want])) {
    $result = web_cron_run_now([$want => $JOBS[$want]]);
} else {
    http_response_code(400);
    echo "unknown job: {$want}\navailable: " . implode(', ', array_keys($JOBS)) . ", all\n";
    exit;
}
$ms = (int)round((microtime(true) - $started) * 1000);

audit('cron.external', 'cron', '', ['jobs' => $result, 'ms' => $ms], client_ip());

/* Plain text, not JSON: the reader is a cron log or a person running curl, and
   a non-zero exit from `curl -f` plus one legible line is what either needs. */
$bad = array_filter($result, fn($v) => $v === 'error');
http_response_code($bad ? 500 : 200);
foreach ($result as $name => $state) echo str_pad($name, 12) . $state . "\n";
echo "took {$ms}ms\n";
