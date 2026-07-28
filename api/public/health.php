<?php
/**
 * Liveness probe for an uptime monitor. Unauthenticated on purpose — a check
 * that needs a session cannot run from outside, and outside is where you need
 * to be standing when the site is down.
 *
 * Answers 503 when the site cannot actually serve, because a monitor watches
 * the status code, not the body. "200 OK from the web server" is the useless
 * answer: the failures that matter are a read-only database after a disk fills
 * and code deployed ahead of its migrations, and both of those return a
 * perfectly healthy 200 from every other endpoint.
 *
 * A monitor polling this every minute also keeps the background jobs ticking,
 * since ordinary traffic is what drives them — on a quiet site that is a
 * useful side effect rather than an accident.
 *
 * The payload is four booleans. No counts, no versions, no table names —
 * nothing that helps someone who is not meant to be asking.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';

$h = ops_health_public();
header('Content-Type: application/json');
header('Cache-Control: no-store, max-age=0');
http_response_code(empty($h['ok']) ? 503 : 200);
echo json_encode($h, JSON_UNESCAPED_SLASHES);
