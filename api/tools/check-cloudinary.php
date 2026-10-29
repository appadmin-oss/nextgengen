<?php
/**
 * Is Cloudinary actually connected?
 *
 * The client is built to survive the media cloud being unavailable: when an
 * upload cannot be made it keeps the image on this server instead and the
 * family's registration completes normally. That is the right behaviour, and it
 * means a cloud with rotated keys, an exhausted plan or a firewall in front of
 * it looks EXACTLY like a healthy one from every screen in the product. The only
 * symptom is that nothing new arrives in the Cloudinary dashboard, which is how
 * this gets reported weeks later as "uploads don't save to Cloudinary anymore".
 *
 * This answers it in one command, from the host, with no admin session:
 *
 *   php api/tools/check-cloudinary.php
 *
 * It reports which of four states the host is in — no keys, keys refused, plan
 * exhausted, unreachable, or connected — how much of the plan is used, how many
 * recent photographs actually went to the cloud, and whether any upload has
 * already fallen back. Exit 0 = healthy, 1 = a fault it names, 2 = could not
 * start.
 *
 * Writes nothing.
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$root = dirname(__DIR__);
if (!is_file($root . '/config.php')) {
    fwrite(STDERR, "No api/config.php on this host — nothing to check.\n");
    exit(2);
}
require_once $root . '/_lib/bootstrap.php';

function line(string $s = ''): void { fwrite(STDOUT, $s . "\n"); }

$cfg = $GLOBALS['CONFIG']['cloudinary'] ?? [];
line('Cloudinary');
line('══════════');

$h = ops_cloudinary_health();

$label = [
    'not_configured'  => 'NOT CONFIGURED',
    'bad_credentials' => 'REFUSED',
    'exhausted'       => 'EXHAUSTED',
    'unreachable'     => 'UNREACHABLE',
    'ok'              => 'CONNECTED',
][$h['state']] ?? strtoupper((string)$h['state']);

line('  state      ' . $label);
if (!empty($h['cloud'])) line('  cloud      ' . $h['cloud']);
if (!empty($cfg['api_key'])) {
    // Enough to tell two keys apart in a support conversation, not enough to use.
    $k = (string)$cfg['api_key'];
    line('  api key    ' . substr($k, 0, 4) . str_repeat('•', max(0, strlen($k) - 8)) . substr($k, -4));
}
if (isset($h['usedPercent']) && $h['usedPercent'] !== null) line('  plan used  ' . round((float)$h['usedPercent']) . '%');
line('  detail     ' . (string)($h['detail'] ?? ''));
line();

/* What actually happened to the photographs, which is the question behind the
   question. The check above is about this instant; these rows are the record. */
try {
    $r = db_row("SELECT COUNT(*) n,
                        SUM(CASE WHEN photoUrl LIKE '%cloudinary%' THEN 1 ELSE 0 END) cloud,
                        SUM(CASE WHEN photoUrl LIKE 'data:%' OR photoUrl LIKE '/api/public/photo%' THEN 1 ELSE 0 END) local
                 FROM (SELECT photoUrl FROM summer_students WHERE photoUrl != '' ORDER BY id DESC LIMIT 50) t");
    $n = (int)($r['n'] ?? 0);
    if ($n > 0) {
        line('Last ' . $n . ' photographs on record');
        line('  in the cloud   ' . (int)($r['cloud'] ?? 0));
        line('  on this server ' . (int)($r['local'] ?? 0));
        line();
    }
} catch (Throwable $e) { /* a reporting tool must not fail on a reporting query */ }

try {
    $ev = db_row("SELECT hits, firstAt, lastAt, detail FROM ops_events WHERE source = 'cloudinary.upload' LIMIT 1");
    if ($ev) {
        line('Uploads that fell back to local storage');
        line('  count      ' . (int)$ev['hits']);
        line('  first      ' . (string)$ev['firstAt']);
        line('  most recent ' . (string)$ev['lastAt']);
        line('  last reason ' . (string)$ev['detail']);
        line();
    }
} catch (Throwable $e) { /* same */ }

/* What to do about it, named per state — the point of the tool is that somebody
   can act on the answer without reading the source. */
$advice = [
    'not_configured' => 'Running without a media cloud is supported: photographs are kept on this server.'
        . "\n  " . 'To connect one, set the cloudinary block in api/config.php (see api/config.example.php).',
    'bad_credentials' => 'Cloudinary is refusing these keys. Compare cloud_name, api_key and api_secret in'
        . "\n  " . 'api/config.php with the Cloudinary dashboard — a rotated secret is the usual cause.'
        . "\n  " . 'Nothing has been lost: those uploads are on this server and can be migrated afterwards.',
    'exhausted' => 'The plan is rate-limited or out of credit. Uploads land on this server until it resets.',
    'unreachable' => 'This host could not reach Cloudinary. Usually outbound HTTPS blocked by the host,'
        . "\n  " . 'not a problem with the account. Check any proxy settings and firewall rules.',
    'ok' => 'Connected. Uploads are going to the cloud.',
];
line((string)($advice[$h['state']] ?? 'Unrecognised state.'));

exit(empty($h['ok']) ? 1 : 0);
