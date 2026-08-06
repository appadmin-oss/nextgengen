<?php
/**
 * Weekly engagement snapshot — run once a week from cron:
 *
 *   5 0 * * 1  php /path/to/site/api/tools/engagement-snapshot.php   # Mondays 00:05
 *
 * Captures one engagement row per volunteer / instructor / mentor (with their
 * centre) into engagement_snapshots for the current ISO week. Idempotent — safe
 * to run more than once a week; it just refreshes the week in progress. The
 * built-in web-cron also does this opportunistically, so this script is only
 * needed where you prefer a real scheduler.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$ROOT = dirname(__DIR__);
if (!file_exists($ROOT . '/config.php')) { fwrite(STDERR, "api/config.php missing\n"); exit(1); }
$GLOBALS['CONFIG'] = require $ROOT . '/config.php';

require $ROOT . '/_lib/response.php';
require $ROOT . '/_lib/db.php';
require $ROOT . '/_lib/util.php';
require $ROOT . '/_lib/domain/engagement.php';

$week = $argv[1] ?? null; // optional explicit weekStart (YYYY-MM-DD) for backfill
$res = engagement_snapshot_week($week);
fwrite(STDOUT, 'engagement snapshot ' . $res['weekStart'] . ': wrote ' . $res['written'] . " rows\n");
