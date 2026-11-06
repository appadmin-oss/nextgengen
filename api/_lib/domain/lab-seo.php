<?php
declare(strict_types=1);

/**
 * The Labs, as search engines and link previews see them (owner, 6 Nov 2026: "The SEO for the maths
 * lab is still 100% terrible").
 *
 * The Labs are drawn in the browser, so every address under /study used to answer a crawler with the
 * same empty app shell: one title ("Study tools · NGG"), one description about flashcards, a canonical
 * pointing at /study, nothing about maths in the HTML, and no Lab page in the sitemap. The host has no
 * server-side renderer and must not get one, so the answer is this: .htaccess sends a Lab address to
 * api/public/lab-page.php, which serves the SAME app shell with, for that address,
 *   · its own <title>, description, canonical, Open Graph and robots;
 *   · JSON-LD (Course for a Lab and a course, LearningResource for a topic, BreadcrumbList);
 *   · the page's real content inside #root — the hub's bands and stages, a stage's ten topics, a
 *     topic's worked example with its steps — as plain HTML with links, which React replaces the
 *     moment it starts, so a learner sees nothing different.
 * The content comes from the same map and the same generators the Lab serves (one renderer of the
 * facts, CLAUDE.md §11); a topic's example is drawn with a fixed seed, so a page does not change
 * between crawls.
 */

const LAB_SEO_BASE = 'https://next.afrovanguard.org.ng';

/** LaTeX as a reader sees it in plain text: $\frac{3}{4}$ → 3/4, \times → ×, x^{2} → x². */
function lab_seo_text(string $s): string {
    $sup = ['0' => '⁰', '1' => '¹', '2' => '²', '3' => '³', '4' => '⁴', '5' => '⁵', '6' => '⁶', '7' => '⁷', '8' => '⁸', '9' => '⁹', '-' => '⁻', 'n' => 'ⁿ'];
    $s = preg_replace_callback('/\$([^$]*)\$/', static function ($m) use ($sup) {
        $t = $m[1];
        for ($i = 0; $i < 3; $i++) $t = preg_replace('/\\\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/', '($1)/($2)', $t);
        $t = preg_replace('/\(([0-9a-z]+)\)\/\(([0-9a-z]+)\)/i', '$1/$2', $t);
        $t = preg_replace('/\\\\sqrt\{([^{}]*)\}/', '√($1)', $t);
        $t = preg_replace_callback('/\^\{?(-?[0-9n]+)\}?/', static fn($x) => strtr($x[1], $sup), $t);
        $t = preg_replace('/_\{([^{}]*)\}|_([0-9a-z])/i', '$1$2', $t);
        $t = strtr($t, ['\\times' => '×', '\\div' => '÷', '\\cdot' => '·', '\\pi' => 'π', '\\theta' => 'θ', '\\alpha' => 'α', '\\beta' => 'β', '\\lambda' => 'λ', '\\mu' => 'μ',
            '\\rho' => 'ρ', '\\Delta' => 'Δ', '\\le' => '≤', '\\ge' => '≥', '\\neq' => '≠', '\\approx' => '≈', '\\infty' => '∞', '\\pm' => '±', '\\circ' => '°', '\\%' => '%',
            '\\left' => '', '\\right' => '', '\\,' => ' ', '\\ ' => ' ', '\\log' => 'log', '\\ln' => 'ln', '\\sin' => 'sin', '\\cos' => 'cos', '\\tan' => 'tan', '\\text' => '', '\\tfrac' => '', '{' => '', '}' => '']);
        return trim(preg_replace('/\\\\[a-zA-Z]+/', '', $t));
    }, $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}
function lab_seo_e(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/**
 * public.lab.page — the head and body for one Lab address, or null when the address is not a Lab's.
 * {lab, title, desc, canonical, robots, jsonld[], html}
 */
function lab_seo_page(array $p): array {
    $path = '/' . trim((string)($p['path'] ?? ''), '/');
    $seg = explode('/', trim($path, '/'));
    if (($seg[0] ?? '') !== 'study') return ['ok' => false, 'error' => 'not_a_lab'];
    $lab = null; foreach (LABS as $l) if ($l['path'] === '/study/' . ($seg[1] ?? '')) $lab = $l;
    if (!$lab) return ['ok' => false, 'error' => 'not_a_lab'];
    $was = lab_id(); lab_use($lab['id']);
    try { $out = lab_seo_build($lab, array_slice($seg, 2)); } finally { lab_use($was); }
    return ['ok' => true] + $out;
}

function lab_seo_build(array $lab, array $rest): array {
    $base = LAB_SEO_BASE . $lab['path']; $L = $lab['title']; $subj = $lab['subject'];
    $org = ['@type' => 'EducationalOrganization', 'name' => 'Next Generation Genius', 'url' => LAB_SEO_BASE . '/'];
    $crumbs = static fn(array $items) => ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => array_map(static fn($it, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $it[0], 'item' => $it[1]], $items, array_keys($items))];
    $stages = mlb_stages(); $bands = mlb_bands(); $view = $rest[0] ?? '';
    $nav = '<nav aria-label="' . lab_seo_e($L) . '"><a href="' . $lab['path'] . '">' . lab_seo_e($L) . '</a> · <a href="' . $lab['path'] . '/map">The map</a> · <a href="' . $lab['path'] . '/courses">Courses</a></nav>';

    /* A topic: /study/<lab>/learn/XX-NNN — the page that wins searches like "how to find the HCF". */
    if ($view === 'learn' && ($c = mlb_comp((string)($rest[1] ?? ''))) && (lab_for_comp($c['id'])['id'] ?? '') === $lab['id']) {
        $st = $stages[$c['stage']]; $band = mlb_band((int)$c['stage']);
        $ex = mlb_available($c['id']) ? mlb_item($c['id'], 0, crc32('seo|' . $c['id']) & 0x7FFFFFFF) : null;
        $why = mlb_why_of($c['id']);
        $title = $c['title'] . ' — ' . $subj . ' practice with worked examples · NGG ' . $L;
        $desc = mb_substr('Learn ' . $c['title'] . ' step by step: ' . ($why ? lab_seo_text($why['idea']) . ' ' : '') . ($ex ? 'A worked example, a hint and free practice with instant marking.' : 'Coming soon to the ' . $L . '.') . ' Stage ' . $c['stage'] . ', ' . $st['title'] . ' (' . $band['level'] . ').', 0, 300);
        $needs = array_values(array_filter(array_map('mlb_comp', $c['needs'])));
        $html = '<main class="seo-page">' . $nav . '<p>Stage ' . $c['stage'] . ' · ' . lab_seo_e($st['title']) . ' · ' . lab_seo_e($band['name']) . ' (' . lab_seo_e($band['level']) . ')</p>'
            . '<h1>' . lab_seo_e($c['title']) . '</h1>'
            . ($why ? '<h2>The idea</h2><p>' . lab_seo_e(lab_seo_text($why['idea'])) . '</p><p>' . lab_seo_e(lab_seo_text($why['claim'])) . '</p>' : '')
            . ($ex ? '<h2>Worked example</h2><p>' . lab_seo_e(lab_seo_text($ex['stem'])) . '</p>'
                . (!empty($ex['options']) ? '<ul>' . implode('', array_map(static fn($o) => '<li>' . lab_seo_e(lab_seo_text((string)$o)) . '</li>', $ex['options'])) . '</ul>' : '')
                . '<p><b>Answer:</b> ' . lab_seo_e(lab_seo_text(mlb_answer_text($ex))) . '</p><ol>' . implode('', array_map(static fn($s) => '<li>' . lab_seo_e(lab_seo_text((string)$s)) . '</li>', $ex['steps'])) . '</ol>'
                . '<p><b>Hint:</b> ' . lab_seo_e(lab_seo_text((string)$ex['hint'])) . '</p>' : '')
            . ($needs ? '<h2>Before this topic</h2><ul>' . implode('', array_map(static fn($n) => '<li><a href="' . $lab['path'] . '/learn/' . $n['id'] . '">' . lab_seo_e($n['title']) . '</a></li>', $needs)) . '</ul>' : '')
            . '<h2>More in ' . lab_seo_e($st['title']) . '</h2><ul>' . implode('', array_map(static fn($id) => '<li><a href="' . $lab['path'] . '/learn/' . $id . '">' . lab_seo_e(mlb_comp($id)['title']) . '</a></li>', $st['comps'])) . '</ul>'
            . '<p><a href="' . $lab['path'] . '/learn/' . $c['id'] . '">Practise ' . lab_seo_e($c['title']) . ' free in the ' . lab_seo_e($L) . '</a></p></main>';
        $ld = [['@context' => 'https://schema.org', '@type' => 'LearningResource', 'name' => $c['title'], 'description' => $desc, 'url' => $base . '/learn/' . $c['id'],
                 'learningResourceType' => ['Worked example', 'Practice problems'], 'educationalLevel' => $band['level'], 'teaches' => $c['title'], 'inLanguage' => 'en', 'isAccessibleForFree' => true,
                 'about' => ['@type' => 'Thing', 'name' => $subj], 'isPartOf' => ['@type' => 'Course', 'name' => $L, 'url' => $base], 'provider' => $org],
               $crumbs([[$L, $base], ['Stage ' . $c['stage'] . ': ' . $st['title'], $base . '/guide/' . $c['stage']], [$c['title'], $base . '/learn/' . $c['id']]])];
        return ['lab' => $lab['id'], 'title' => $title, 'desc' => $desc, 'canonical' => $base . '/learn/' . $c['id'], 'robots' => 'index, follow, max-image-preview:large', 'jsonld' => $ld, 'html' => $html];
    }

    /* A stage's guidebook: /study/<lab>/guide/N — ten topics, each with its key idea and tip. */
    if ($view === 'guide' && isset($stages[(int)($rest[1] ?? 0)])) {
        $n = (int)$rest[1]; $st = $stages[$n]; $band = mlb_band($n);
        $title = 'Stage ' . $n . ': ' . $st['title'] . ' — ' . $subj . ' guide with worked examples · NGG ' . $L;
        $desc = mb_substr('Stage ' . $n . ' of the ' . $L . ' (' . $band['level'] . '): ' . implode(', ', array_map(static fn($id) => mlb_comp($id)['title'], array_slice($st['comps'], 0, 6))) . ' and more — each with a worked example and free practice.', 0, 300);
        $items = '';
        foreach ($st['comps'] as $id) {
            $ex = mlb_available($id) ? mlb_item($id, 0, crc32('guide|' . $id) & 0x7FFFFFFF) : null;
            $items .= '<li><h2><a href="' . $lab['path'] . '/learn/' . $id . '">' . lab_seo_e(mlb_comp($id)['title']) . '</a></h2>' . ($ex ? '<p>' . lab_seo_e(lab_seo_text((string)$ex['hint'])) . '</p>' : '') . '</li>';
        }
        $html = '<main class="seo-page">' . $nav . '<p>' . lab_seo_e($band['name']) . ' · ' . lab_seo_e($band['level']) . '</p><h1>Stage ' . $n . ': ' . lab_seo_e($st['title']) . '</h1><ol>' . $items . '</ol>'
            . ($n > 1 ? '<p><a href="' . $lab['path'] . '/guide/' . ($n - 1) . '">← Stage ' . ($n - 1) . '</a></p>' : '') . (isset($stages[$n + 1]) ? '<p><a href="' . $lab['path'] . '/guide/' . ($n + 1) . '">Stage ' . ($n + 1) . ' →</a></p>' : '') . '</main>';
        $ld = [['@context' => 'https://schema.org', '@type' => 'Course', 'name' => 'Stage ' . $n . ': ' . $st['title'], 'description' => $desc, 'url' => $base . '/guide/' . $n, 'provider' => $org, 'educationalLevel' => $band['level'], 'isAccessibleForFree' => true, 'inLanguage' => 'en',
                 'hasPart' => array_map(static fn($id) => ['@type' => 'LearningResource', 'name' => mlb_comp($id)['title'], 'url' => $base . '/learn/' . $id], $st['comps'])],
               $crumbs([[$L, $base], ['Stage ' . $n . ': ' . $st['title'], $base . '/guide/' . $n]])];
        return ['lab' => $lab['id'], 'title' => $title, 'desc' => $desc, 'canonical' => $base . '/guide/' . $n, 'robots' => 'index, follow, max-image-preview:large', 'jsonld' => $ld, 'html' => $html];
    }

    /* The courses: public, each a Course with its promise. */
    if ($view === 'courses') {
        $cs = mlb_courses();
        $title = $L . ' courses — ' . implode(', ', array_slice(array_column($cs, 'title'), 0, 4)) . ' · NGG';
        $desc = mb_substr('Free ' . $subj . ' courses with certificates: ' . implode('; ', array_map(static fn($c) => $c['title'] . ' (' . $c['for'] . ')', array_values($cs))) . '.', 0, 300);
        $html = '<main class="seo-page">' . $nav . '<h1>' . lab_seo_e($L) . ' courses</h1>' . implode('', array_map(static fn($c) => '<section><h2>' . lab_seo_e($c['title']) . '</h2><p>' . lab_seo_e($c['promise']) . '</p><p>For: ' . lab_seo_e($c['for']) . ' · about ' . (int)$c['hours'] . ' hours · Stages ' . implode(', ', $c['stages']) . '</p></section>', array_values($cs))) . '</main>';
        $ld = array_map(static fn($c) => ['@context' => 'https://schema.org', '@type' => 'Course', 'name' => $c['title'], 'description' => $c['promise'], 'provider' => $org, 'url' => $base . '/courses', 'isAccessibleForFree' => true, 'inLanguage' => 'en',
            'hasCourseInstance' => ['@type' => 'CourseInstance', 'courseMode' => 'online', 'courseWorkload' => 'PT' . (int)$c['hours'] . 'H']], array_values($cs));
        return ['lab' => $lab['id'], 'title' => $title, 'desc' => $desc, 'canonical' => $base . '/courses', 'robots' => 'index, follow', 'jsonld' => $ld, 'html' => $html];
    }

    /* The Lab itself (and its map): every band and stage, linked. Member-only screens are not indexed. */
    $private = in_array($view, ['progress', 'certificates', 'daily', 'exams'], true);
    $topics = count(mlb_competencies());
    $title = $lab['id'] === 'maths'
        ? 'Maths Lab — free maths practice from counting to calculus, with worked examples · NGG'
        : $L . ' — free ' . mb_strtolower($subj) . ' practice with diagrams and simulations · NGG';
    $desc = mb_substr($lab['what'] . ' ' . $topics . ' topics in ' . count($stages) . ' stages, each with a worked example, hints and instant marking — free.', 0, 300);
    $html = '<main class="seo-page">' . $nav . '<h1>' . lab_seo_e($L) . '</h1><p>' . lab_seo_e($lab['what']) . '</p>';
    foreach ($bands as $b) {
        $html .= '<section><h2>' . lab_seo_e($b['name']) . ' <small>' . lab_seo_e($b['level']) . '</small></h2><p>' . lab_seo_e($b['what']) . '</p><ul>';
        for ($n = $b['from']; $n <= $b['to']; $n++) if (isset($stages[$n])) $html .= '<li><a href="' . $lab['path'] . '/guide/' . $n . '">Stage ' . $n . ': ' . lab_seo_e($stages[$n]['title']) . '</a> — ' . lab_seo_e(implode(', ', array_map(static fn($id) => mlb_comp($id)['title'], array_slice($stages[$n]['comps'], 0, 4)))) . '…</li>';
        $html .= '</ul></section>';
    }
    $html .= '</main>';
    $ld = [['@context' => 'https://schema.org', '@type' => 'Course', 'name' => $L, 'description' => $desc, 'url' => $base, 'provider' => $org, 'isAccessibleForFree' => true, 'inLanguage' => 'en',
             'about' => ['@type' => 'Thing', 'name' => $subj], 'educationalLevel' => implode(', ', array_column($bands, 'level')),
             'hasPart' => array_values(array_map(static fn($s) => ['@type' => 'Course', 'name' => 'Stage ' . $s['n'] . ': ' . $s['title'], 'url' => $base . '/guide/' . $s['n']], $stages))],
           $crumbs([['Study tools', LAB_SEO_BASE . '/study'], [$L, $base]])];
    return ['lab' => $lab['id'], 'title' => $private ? $L . ' · NGG' : $title, 'desc' => $desc, 'canonical' => $base, 'robots' => $private ? 'noindex, follow' : 'index, follow, max-image-preview:large', 'jsonld' => $private ? [] : $ld, 'html' => $html];
}

/** Every Lab address worth a search engine's time, for the sitemap: the Lab, its courses, every stage guide, every topic. */
function lab_seo_urls(): array {
    $out = []; $was = lab_id();
    foreach (LABS as $l) {
        if (($l['status'] ?? '') !== 'live') continue;
        lab_use($l['id']);
        $out[] = [$l['path'], 'weekly', '0.9']; $out[] = [$l['path'] . '/courses', 'monthly', '0.7'];
        foreach (mlb_stages() as $n => $s) $out[] = [$l['path'] . '/guide/' . $n, 'monthly', '0.7'];
        foreach (mlb_competencies() as $id => $c) if (mlb_available($id)) $out[] = [$l['path'] . '/learn/' . $id, 'monthly', '0.6'];
    }
    lab_use($was);
    return $out;
}

/** The app shell with one Lab address's head and content put in. Anything that is not a Lab address, or
 *  that fails, gets the shell back untouched: SEO must never be why a page does not open. */
function lab_seo_shell(string $shell, string $path): string {
    try { $r = gs_call('public.lab.page', ['path' => $path]); } catch (\Throwable $e) { return $shell; }
    if (empty($r['ok'])) return $shell;
    $e = static fn(string $s) => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $swap = [
        '/<title>[^<]*<\/title>/' => '<title>' . $e($r['title']) . '</title>',
        '/<meta name="description" content="[^"]*"\s*\/?>/' => '<meta name="description" content="' . $e($r['desc']) . '"/>',
        '/<meta name="robots" content="[^"]*"\s*\/?>/' => '<meta name="robots" content="' . $e($r['robots']) . '"/>',
        '/<link rel="canonical" href="[^"]*"\s*\/?>/' => '<link rel="canonical" href="' . $e($r['canonical']) . '"/>',
        '/<meta property="og:url" content="[^"]*"\s*\/?>/' => '<meta property="og:url" content="' . $e($r['canonical']) . '"/>',
        '/<meta property="og:title" content="[^"]*"\s*\/?>/' => '<meta property="og:title" content="' . $e($r['title']) . '"/>',
        '/<meta property="og:description" content="[^"]*"\s*\/?>/' => '<meta property="og:description" content="' . $e($r['desc']) . '"/>',
    ];
    // preg_replace_callback, so a "$1" or "\\" in a topic's text can never be read as a back-reference.
    foreach ($swap as $re => $to) $shell = preg_replace_callback($re, static fn() => $to, $shell, 1);
    $ld = '';
    foreach ($r['jsonld'] as $j) $ld .= '<script type="application/ld+json">' . json_encode($j, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . "</script>\n";
    $shell = preg_replace_callback('/<\/head>/', static fn() => $ld . '</head>', $shell, 1);
    return preg_replace_callback('/<div id="root"><\/div>/', static fn() => '<div id="root">' . $r['html'] . '</div>', $shell, 1);
}
