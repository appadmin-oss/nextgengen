<?php
/**
 * The assignment desk for instructors and mentors, in their portals
 * (domain/assignments.php). mentor_gate decides the courses and centre they
 * reach; an admin who opens a portal gets an admin's reach there, as the
 * portals already give them.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
// A volunteer card session is how most instructors sign in; a desk kiosk is not a person.
$s = require_session();
if (!empty($s['kiosk'])) json_error('forbidden', 403);
$viaAdmin = false;
require __DIR__ . '/../_lib/assign-desk-route.php';
