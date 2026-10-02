<?php
/* SPA router for `php -S` — mirrors .htaccess: real files served, /api passed
   through, everything else falls back to index.html. */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;
if ($path !== '/' && file_exists($file) && !is_dir($file)) return false;
if (preg_match('#^/(api|assets|vendor|journal|docs|apps-script)/#', $path)) return false;
$_SERVER['SCRIPT_NAME'] = '/index.html';
readfile(__DIR__ . '/index.html');
