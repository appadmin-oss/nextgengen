<?php
declare(strict_types=1);

/**
 * The app shell, with each page's own head (SEO audit, 8 Nov 2026 — docs/SEO-AUDIT.md).
 *
 * Every public address used to receive the same index.html: the home page's title and
 * description, and `<link rel="canonical" href="…/">`. JavaScript corrected the head after
 * it ran, but Google reads the canonical in the RAW HTML first, so /about, /summer, /club
 * and every other page declared itself a duplicate of the home page. And an address that
 * does not exist answered 200 "index, follow" — a soft 404 for every mistyped link.
 *
 * This front reads the ROUTES registry (exported by build.js to routes.json — the same one
 * registry the app uses, never a second list) and writes the page's title, description,
 * canonical, robots and Open Graph tags into the shell before it is sent. An address that
 * matches no route is answered with a real 404 (the app still draws its not-found page).
 * The app takes over in the browser exactly as before.
 *
 * No database, no session: it is as cheap as serving the file.
 */

const SPA_ORIGIN = 'https://next.afrovanguard.org.ng';

/* Addresses the router accepts that are not route ids (pageFromPath in app.jsx): aliases
   and per-record pages. They are real pages, so never a 404 — and none is indexable on
   its own address, so they carry no canonical of their own. */
const SPA_ALIASES = ['login', 'signin', 'q', 's', 'mathlab', 'math-lab', 'mathslab', 'lab', 'member', 'pay', 'cert',
    'notice', 'notices', 'control', 'nextadmin', 'hq', 'admin', 'status', 'cards'];

function spa_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function spa_route_for(string $path, array $routes): array {
    $seg = explode('/', trim($path, '/'))[0] ?? '';
    if ($seg === '') return ['route' => $routes['home'] ?? null, 'status' => 200, 'path' => '/'];
    $parts = explode('/', trim($path, '/'));
    if ($seg === 'club' && ($parts[1] ?? '') === 'id-cards') return ['route' => $routes['id-cards'] ?? null, 'status' => 200, 'path' => '/club/id-cards'];
    if ($seg === 'join' && ($parts[1] ?? '') === 'volunteer') return ['route' => $routes['ngg-volunteer'] ?? null, 'status' => 200, 'path' => '/join/volunteer'];
    if (isset($routes[$seg])) return ['route' => $routes[$seg], 'status' => 200, 'path' => '/' . $seg];
    if (in_array($seg, SPA_ALIASES, true)) return ['route' => null, 'status' => 200, 'path' => ''];
    return ['route' => null, 'status' => 404, 'path' => ''];
}

function spa_render(string $html, array $hit, string $query = ''): string {
    $r = $hit['route'];
    $set = static function (string $html, string $pattern, string $replacement): string {
        $out = preg_replace($pattern, $replacement, $html, 1);
        return $out === null ? $html : $out;
    };
    if ($hit['status'] === 404) {
        $html = $set($html, '#<title>.*?</title>#s', '<title>Page not found · Next Generation Genius</title>');
        $html = $set($html, '#<meta name="robots"[^>]*>#', '<meta name="robots" content="noindex, follow"/>');
        $html = $set($html, '#<link rel="canonical"[^>]*>\s*#', '');
        return $html;
    }
    if (!$r) {   // an alias or a per-record page: the app decides; nothing claims to be the home page
        $html = $set($html, '#<link rel="canonical"[^>]*>\s*#', '');
        return $set($html, '#<meta name="robots"[^>]*>#', '<meta name="robots" content="noindex, follow"/>');
    }
    $title = spa_h((string)$r['title']); $desc = spa_h((string)$r['desc']);
    $url = SPA_ORIGIN . $hit['path'];
    $html = $set($html, '#<title>.*?</title>#s', '<title>' . $title . '</title>');
    if ($desc !== '') {
        $html = $set($html, '#<meta name="description"[^>]*>#', '<meta name="description" content="' . $desc . '"/>');
        $html = $set($html, '#<meta property="og:description"[^>]*>#', '<meta property="og:description" content="' . $desc . '"/>');
        $html = $set($html, '#<meta name="twitter:description"[^>]*>#', '<meta name="twitter:description" content="' . $desc . '"/>');
    }
    $html = $set($html, '#<meta property="og:title"[^>]*>#', '<meta property="og:title" content="' . $title . '"/>');
    $html = $set($html, '#<meta name="twitter:title"[^>]*>#', '<meta name="twitter:title" content="' . $title . '"/>');
    // Tracking parameters do not make a different page; anything else (?post=, ?centre=) does.
    parse_str($query, $q); $q = array_filter(array_keys($q), static fn($k) => !preg_match('/^(utm_|fbclid$|gclid$|ref$)/', (string)$k));
    if (!empty($r['index']) && !$q) {
        $html = $set($html, '#<link rel="canonical"[^>]*>#', '<link rel="canonical" href="' . spa_h($url) . '"/>');
        $html = $set($html, '#<meta property="og:url"[^>]*>#', '<meta property="og:url" content="' . spa_h($url) . '"/>');
    } else {
        // Not indexable, or a filtered/parameterised view of a page: no canonical claiming otherwise.
        $html = $set($html, '#<link rel="canonical"[^>]*>\s*#', '');
        if (empty($r['index'])) $html = $set($html, '#<meta name="robots"[^>]*>#', '<meta name="robots" content="noindex, follow"/>');
    }
    return $html;
}

if (PHP_SAPI !== 'cli' || getenv('SPA_SERVE')) {
    $root = dirname(__DIR__, 2);
    $html = @file_get_contents($root . '/index.html');
    $routes = [];
    foreach ((json_decode((string)@file_get_contents($root . '/routes.json'), true) ?: []) as $x) $routes[(string)$x['id']] = $x;
    $path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $hit = $routes ? spa_route_for($path, $routes) : ['route' => null, 'status' => 200, 'path' => ''];
    http_response_code($html === false ? 500 : $hit['status']);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');   // as index.html itself: a deploy is picked up at once
    echo $html === false ? 'The site is being updated. Please refresh in a moment.' : spa_render($html, $hit, (string)($_SERVER['QUERY_STRING'] ?? ''));
}
