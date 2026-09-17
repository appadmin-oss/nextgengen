<?php
$root = __DIR__ . '/api';
$CONFIG = require $root . '/config.php';
$GLOBALS['CONFIG'] = $CONFIG;
date_default_timezone_set('UTC');
require $root . '/_lib/db.php';
require $root . '/_lib/util.php';
require $root . '/_lib/session.php';
$row = db_row("SELECT * FROM members WHERE role='super_admin' ORDER BY id LIMIT 1");
echo session_issue($row, true);
