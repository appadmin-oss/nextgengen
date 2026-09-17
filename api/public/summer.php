<?php
/**
 * Public: everything the /summer promotion page needs to let somebody find
 * their way in — the live edition and its dates, the academies and their
 * courses, and the centres with the courses actually running at each.
 *
 * One read rather than three, because it is one page. Cacheable: every field
 * is configuration or an aggregate, and none of it is a child's data. See
 * api/_lib/domain/summer-editions.php → public_summer_page().
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.summer', [], true);   // cacheable public read
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
json_ok($res);
