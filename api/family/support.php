<?php
/** Support cases from the Family account (domain/support.php). Same contract as api/member/support.php. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$f = require_family();
$who = support_who_guardian($f['guardian']);
require __DIR__ . '/../_lib/support-route.php';
