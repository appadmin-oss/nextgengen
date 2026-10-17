<?php
/**
 * Admin: assignments (domain/assignments.php), the Control Room's desk — the
 * same ops the portals use, with an admin's reach (content | curriculum | club,
 * within the centre scope).
 * GET  ?assignmentId=  → submissions + who has not handed in · ?audience=1&track=&centre= · else the list
 * POST action=save|status|remind|grade|return|suggest
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$viaAdmin = true;
require __DIR__ . '/../_lib/assign-desk-route.php';
