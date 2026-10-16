<?php
/**
 * Push the whole roster to CACENTRE's person directory, once.
 *
 * The web-cron tick sends one page of each store an hour and takes as many
 * ticks as the rosters need. That is right for keeping up and wrong for
 * starting — nobody wants to watch a review queue fill over a day wondering
 * whether it is working. This walks both stores in one go.
 *
 *   php api/tools/directory-push.php --dry      what WOULD be sent
 *   php api/tools/directory-push.php            send it
 *   php api/tools/directory-push.php --max=5    stop after five batches
 *
 * Safe to run again and safe to interrupt: every row upserts on its source
 * key over there, so a second run changes nothing but the timestamps.
 *
 * It does NOT move the web-cron's cursors. The two are independent sweeps of
 * the same tables, and a backfill that advanced them would look like progress
 * the tick had made and hide a tick that had stopped running.
 *
 * EVERY ROW OF THIS LANDS IN REVIEW over there, by design: neither NGG table
 * enforces one row per address, and siblings share a parent's inbox. See the
 * domain file for why that is the only safe direction for this app's data.
 *
 * Exit 0 = sent (or dry), 1 = refused or not configured.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }

$ROOT = dirname(__DIR__);
if (!file_exists($ROOT . '/config.php')) { fwrite(STDERR, "api/config.php missing\n"); exit(1); }

/* Bootstrap, never a bare require of the domain: an op whose function is not
   loaded is a fatal, and the load order is kept in exactly one list. */
require $ROOT . '/_lib/bootstrap.php';

$args = $argv ?? [];
$dry  = in_array('--dry', $args, true);
$max  = 0;
foreach ($args as $a) {
    if (preg_match('/^--max=(\d+)$/', (string)$a, $m)) $max = (int)$m[1];
}

if (!$dry && !dirpush_ready()) {
    fwrite(STDERR, "No push secret is set.\n"
        . "Put a 32+ character value in api/config.php as 'dir_push_secret' (or the\n"
        . "DIR_PUSH_SECRET_NGG environment variable), and the SAME value in CACENTRE's\n"
        . "includes/.env as DIR_PUSH_SECRET_NGG.\n");
    exit(1);
}

fwrite(STDOUT, ($dry ? 'Would push' : 'Pushing') . ' to ' . dirpush_endpoint() . "\n");

$sent = $written = $refused = $batches = 0;

foreach (DIRPUSH_STORES as $store) {
    $cursor = 0;
    while (true) {
        $b = dirpush_batch($store, $cursor);
        if ($b['rows'] === []) break;

        $batches++;
        $sent += count($b['rows']);

        if ($dry) {
            fwrite(STDOUT, sprintf("  %-11s %d row(s), ids %s…%s\n", $store, count($b['rows']),
                $b['rows'][0]['local_id'], $b['rows'][count($b['rows']) - 1]['local_id']));
        } else {
            $res = dirpush_send($b['rows']);
            $written += (int)($res['written'] ?? 0);
            $refused += (int)($res['refused'] ?? 0);

            if (empty($res['ok'])) {
                fwrite(STDOUT, sprintf("  %-11s REFUSED: %s\n", $store, (string)($res['error'] ?? $res['why'] ?? 'unknown')));
                /* CACENTRE names which rows it refused and why. Printing them
                   is the difference between fixing a shaper in five minutes
                   and guessing from an exit code. */
                foreach (array_slice((array)($res['details'] ?? []), 0, 5) as $d) {
                    fwrite(STDOUT, '                ' . (string)($d['local_id'] ?? '?') . ' — ' . (string)($d['why'] ?? '?') . "\n");
                }
                fwrite(STDERR, "\nStopped on a refusal. Nothing already sent is undone — every row upserts,\n"
                    . "so fix the cause and run this again.\n");
                exit(1);
            }
            fwrite(STDOUT, sprintf("  %-11s %d written\n", $store, (int)($res['written'] ?? 0)));
        }

        $cursor = $b['cursor'];
        if ($b['wrapped']) break;
        if ($max > 0 && $batches >= $max) { fwrite(STDOUT, "  stopped at --max\n"); break 2; }
    }
}

fwrite(STDOUT, sprintf("\n%s %d row(s) in %d batch(es); %d written, %d refused.\n",
    $dry ? 'Would send' : 'Sent', $sent, $batches, $written, $refused));
fwrite(STDOUT, "Every one of them waits in CACENTRE's review queue: neither NGG table\n"
    . "enforces one row per address, so nothing here is auto-linked.\n");
exit(0);
