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
echo lab_seo_shell($shell, $path);
