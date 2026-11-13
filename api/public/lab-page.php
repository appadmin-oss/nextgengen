<?php
/**
 * A Lab address (/study/lab…, /study/physics…) for browsers AND crawlers: the same app shell as
 * index.html, with that page's own title, description, canonical, JSON-LD and readable content inside
 * #root (domain/lab-seo.php says why). React replaces the content when it starts. Anything this cannot
 * serve falls back to the plain shell, so a Lab address never fails because of SEO.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$shell = @file_get_contents(__DIR__ . '/../../index.html');
if ($shell === false) { http_response_code(500); exit; }
$path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
header('Content-Type: text/html; charset=utf-8');
$page = lab_seo_shell($shell, $path);
/* Not a Lab (/study/labs, /study/tools, /study/revise, and the forwarded /study/maths…): the study
   app's own head from the ROUTES registry, the way spa.php serves every other page. The raw shell
   carries the HOME page's title and canonical, which declared these addresses duplicates of "/". */
if ($page === $shell) {
    define('SPA_LIBRARY', true);
    require_once __DIR__ . '/spa.php';
    $routes = [];
    foreach ((json_decode((string)@file_get_contents(__DIR__ . '/../../routes.json'), true) ?: []) as $x) $routes[(string)$x['id']] = $x;
    if (isset($routes['study'])) $page = spa_render($shell, ['route' => $routes['study'], 'status' => 200, 'path' => '/study'], (string)($_SERVER['QUERY_STRING'] ?? ''));
}
echo $page;
