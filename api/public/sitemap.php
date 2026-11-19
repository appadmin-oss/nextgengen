<?php
/**
 * Dynamic sitemap — static routes + every published blog post, always
 * current. /sitemap.xml rewrites here (.htaccess); the static sitemap.xml
 * remains only as a fallback for hosts without mod_rewrite.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
header('Content-Type: application/xml; charset=utf-8');

$base = 'https://next.afrovanguard.org.ng';
$pages = [
    ['/', 'weekly', '1.0'],   ['/about', 'monthly', '0.9'], ['/summer', 'monthly', '0.9'], ['/club', 'monthly', '0.8'],
    ['/anchor', 'monthly', '0.9'], ['/book', 'monthly', '0.7'], ['/media', 'weekly', '0.7'],
    ['/parents', 'monthly', '0.8'], ['/volunteers', 'monthly', '0.7'], ['/volunteer', 'monthly', '0.8'], ['/join/volunteer', 'monthly', '0.8'], ['/legal', 'yearly', '0.4'], ['/join', 'monthly', '0.9'],
    ['/centres', 'weekly', '0.8'],
    ['/blog', 'weekly', '0.7'], ['/contact', 'monthly', '0.6'], ['/mentors', 'monthly', '0.7'],
    ['/s-status', 'daily', '0.6'], ['/v-status', 'daily', '0.6'],
];
$out = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($pages as [$path, $freq, $pri]) {
    $out .= "  <url><loc>{$base}{$path}</loc><changefreq>{$freq}</changefreq><priority>{$pri}</priority></url>\n";
}
try {
    $posts = db_all("SELECT slug, publishAt, updatedAt FROM posts WHERE status = 'published' AND slug != '' ORDER BY publishAt DESC LIMIT 500");
    foreach ($posts as $p) {
        $mod = substr((string)($p['updatedAt'] ?: $p['publishAt']), 0, 10);
        $out .= '  <url><loc>' . $base . '/blog?post=' . rawurlencode((string)$p['slug']) . '</loc>'
              . ($mod ? "<lastmod>{$mod}</lastmod>" : '') . "<changefreq>monthly</changefreq><priority>0.6</priority></url>\n";
    }
} catch (Throwable $e) { /* posts table unavailable — static part still serves */ }
try {
    $centres = db_all("SELECT slug, pageUpdatedAt FROM centres WHERE status = 'active' AND pageStatus = 'published' AND slug <> '' ORDER BY name");
    foreach ($centres as $c) {
        $mod = substr((string)($c['pageUpdatedAt'] ?? ''), 0, 10);
        $out .= '  <url><loc>' . $base . '/centres/' . rawurlencode((string)$c['slug']) . '</loc>'
              . ($mod ? "<lastmod>{$mod}</lastmod>" : '') . "<changefreq>monthly</changefreq><priority>0.7</priority></url>\n";
    }
} catch (Throwable $e) { /* centres table unavailable — rest still serves */ }
try {
    // Every Lab: the Lab, its courses, every stage guide and every topic (domain/lab-seo.php).
    foreach (lab_seo_urls() as [$path, $freq, $pri]) $out .= "  <url><loc>{$base}{$path}</loc><changefreq>{$freq}</changefreq><priority>{$pri}</priority></url>\n";
} catch (Throwable $e) { /* the rest still serves */ }
echo $out . '</urlset>';
