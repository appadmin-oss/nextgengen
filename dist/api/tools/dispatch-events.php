<?php
/**
 * Integration-bus dispatcher — run from cron every minute (or few):
 *
 *   * * * * * php /path/to/site/api/tools/dispatch-events.php
 *
 * Delivers due outbox events to their destinations with retry/backoff.
 * Safe to run concurrently-ish (a dupe delivery attempt is harmless for
 * Chat/Sheets and idempotency-keyed for webhooks via X-NGG-Delivery).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$ROOT = dirname(__DIR__);
if (!file_exists($ROOT . '/config.php')) { fwrite(STDERR, "api/config.php missing\n"); exit(1); }
$GLOBALS['CONFIG'] = require $ROOT . '/config.php';

require $ROOT . '/_lib/response.php';
require $ROOT . '/_lib/db.php';
require $ROOT . '/_lib/util.php';
require $ROOT . '/_lib/bus.php';

$rounds = isset($argv[1]) ? max(1, (int)$argv[1]) : 4;
$totals = ['attempted' => 0, 'delivered' => 0, 'failed' => 0];
for ($i = 0; $i < $rounds; $i++) {
    $r = deliveries_dispatch(25);
    foreach (['attempted', 'delivered', 'failed'] as $k) $totals[$k] += $r[$k];
    if ($r['attempted'] === 0) break;
}
echo json_encode($totals) . PHP_EOL;
