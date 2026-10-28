<?php
/**
 * The old Anchor Circle portal (code-paired, no account). Retired 2026-10-28:
 * parents follow a child's Anchor week in the family account
 * (/family), and mentors in the mentor portal, connected by their assignment.
 * Every call answers `moved`, with where to go, so a page left open somewhere
 * says something useful rather than failing.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('circle.dashboard', []);
json_error($res['error'] ?? 'moved', 410, $res['detail'] ?? null);
