<?php
/** Sign out this browser, or every browser (`everywhere`). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$b = read_json_body();
if (!empty($b['everywhere']) && family_session_read()) {
    $f = require_family();
    gs_call('family.signout_all', ['guardianId' => $f['gid'], 'ip' => client_ip()]);
}
family_session_clear();
json_ok([]);
