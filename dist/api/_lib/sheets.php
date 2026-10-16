<?php
declare(strict_types=1);

/**
 * gs_call — historically a signed HTTP call to Google Apps Script. The backend
 * is now a local PHP + database layer (see _lib/backend.php), so this is a thin
 * shim that dispatches in-process. The name + signature are kept so the ~35
 * route files need no changes. Filesystem caching for public reads is retained.
 *
 * (The old Apps Script deployment now only serves as a read-only Sheets mirror,
 * written to by api/tools/export-sheets.php — it is no longer on the read path.)
 */

function gs_call(string $op, array $args = [], bool $useCache = false): array {
    if ($useCache) {
        $cached = gs_cache_read($op, $args);
        if ($cached !== null) return $cached;
    }

    $data = backend_dispatch($op, $args);

    if ($useCache && !empty($data['ok'])) {
        gs_cache_write($op, $args, $data);
    }
    return $data;
}

function gs_cache_read(string $op, array $args): ?array {
    global $CONFIG;
    $ttl = $CONFIG['cache_ttl'][$op] ?? $CONFIG['cache_ttl']['default'] ?? 0;
    if ($ttl <= 0) return null;
    $path = gs_cache_path($op, $args);
    if (!file_exists($path)) return null;
    if (time() - filemtime($path) > $ttl) return null;
    $raw = @file_get_contents($path);
    if (!$raw) return null;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function gs_cache_write(string $op, array $args, array $data): void {
    global $CONFIG;
    // Only write what a read could actually serve. An op with no positive TTL
    // is a no-cache op: gs_cache_read bails on it, so writing the file just
    // litters the cache dir with entries nothing ever reads — and turns into a
    // stale-data trap the day someone adds a TTL for that op and the old file
    // is suddenly live. Keep read and write agreeing on what is cacheable.
    $ttl = $CONFIG['cache_ttl'][$op] ?? $CONFIG['cache_ttl']['default'] ?? 0;
    if ($ttl <= 0) return;
    $path = gs_cache_path($op, $args);
    @mkdir(dirname($path), 0755, true);
    @file_put_contents($path, json_encode($data, JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function gs_cache_path(string $op, array $args): string {
    global $CONFIG;
    $hash = substr(hash('sha256', json_encode($args, JSON_UNESCAPED_SLASHES)), 0, 16);
    return $CONFIG['cache_dir'] . '/' . str_replace('.', '_', $op) . '__' . $hash . '.json';
}

function gs_cache_purge(string $op): void {
    global $CONFIG;
    foreach (glob($CONFIG['cache_dir'] . '/' . str_replace('.', '_', $op) . '__*.json') ?: [] as $f) {
        @unlink($f);
    }
}

/**
 * Which admin write invalidates which cached public read.
 *
 * The relationship used to live at the call sites, which meant it lived in
 * three of them: posts, events and anchor content each remembered to purge,
 * and every other admin write that changes a cached public read simply left
 * the stale copy in place until its TTL expired. That is the "I saved it and
 * the site still shows the old one" class of bug, and it is invisible in
 * development where the TTL passes before anyone looks.
 *
 * Declared as a map so the question "what goes stale when I change this?" has
 * one answer in one place, and adding a cached read means adding a line here
 * rather than auditing every endpoint.
 *
 * Keys are cache-invalidation topics, not op names — one write often
 * invalidates several reads, and one read is often invalidated by several
 * writes.
 */
function gs_cache_topics(): array {
    return [
        'posts'    => ['public.posts', 'post.get'],
        'events'   => ['public.events'],
        'anchor'   => ['public.anchorContent'],
        /* A centre's name, code and colour drive the public centre list, the
           stats block that counts them, AND the /summer page — which lists the
           centres and the courses running at each, so a centre change that did
           not purge it left the promotion page advertising a centre that had
           been renamed or retired. */
        'centres'  => ['public.centres', 'public.stats', 'public.summer', 'public.timetable', 'public.programme'],
        /* Either programme's course list — the Club's (curriculum) or Summer
           School's academy catalogue — changes what the join form offers and
           the /summer page's academies. */
        'catalogue' => ['public.programme', 'public.summer'],
        // A centre's published timetable — changed by the timetable desk.
        'timetable' => ['public.timetable'],
        // Featuring or hiding a post changes the public Showcase.
        'community' => ['community.showcase'],
        /* Enrolment counts feed the public stats block, and the /summer page's
           "places left" per centre. A centre filling up while the promotion is
           running is exactly the fact that must not be five minutes stale. */
        'students' => ['public.stats', 'public.summer'],
        /* The edition's dates and its application window are on the promotion
           page, so changing them has to reach it. Groups too: the page lists
           the courses actually running at each centre, which comes from them. */
        'summer'   => ['public.summer'],
        /* The current and next programme session headline the public site, so
           opening or closing a term must reach it on the next request, not
           five minutes later. */
        'sessions' => ['public.session'],
    ];
}

/** Purge every cached read affected by one or more topics. */
function cache_invalidate($topics): void {
    foreach ((array)$topics as $topic) {
        foreach (gs_cache_topics()[$topic] ?? [] as $op) gs_cache_purge($op);
    }
}
