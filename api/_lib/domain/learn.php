<?php
declare(strict_types=1);

/**
 * The Learn app's own record of a member and a lesson (page-learn.jsx).
 *
 * Three things a learner keeps that the curriculum does not:
 *   · a NOTE on a lesson — private, theirs, never read by staff or the AI;
 *   · SAVED for later — a lesson they mean to come back to;
 *   · when they last OPENED it — what "pick up where you left off" reads.
 * One row per member per lesson (`learn_state`, migration 188).
 *
 * And the figures This week leads with, derived from the curriculum's own
 * completions rather than stored: the run of weeks in a row with a lesson
 * finished, the minutes of finished lessons, and how many this week. A stored
 * streak is a second copy of the progress table that drifts from it.
 *
 * Every write is checked against the member's OWN lessons
 * (curriculum_member_units), so nobody keeps a note on, or learns the title
 * of, a lesson that is not theirs.
 */

const LEARN_NOTE_MAX = 4000;
const LEARN_RECENT = 5;

/** The member's state for every lesson, and the figures, for the list read. */
function learn_state_for(array $m, array $units): array {
    $mid = (string)$m['memberId'];
    $rows = db_all('SELECT unitId, note, noteAt, saved, savedAt, openedAt FROM learn_state WHERE memberId = ?', [$mid]);
    $notes = []; $saved = []; $opened = [];
    $ids = [];
    foreach ($units as $u) $ids[(string)$u['unitId']] = $u;
    foreach ($rows as $r) {
        $id = (string)$r['unitId'];
        if (!isset($ids[$id])) continue;   // a lesson no longer theirs keeps its row, unread
        if (trim((string)$r['note']) !== '') $notes[] = ['unitId' => $id, 'note' => (string)$r['note'], 'at' => (string)$r['noteAt']];
        if ((int)$r['saved'] === 1) $saved[] = ['unitId' => $id, 'at' => (string)$r['savedAt']];
        if ((string)$r['openedAt'] !== '') $opened[] = ['unitId' => $id, 'at' => (string)$r['openedAt']];
    }
    $byAt = static fn($a, $b) => strcmp((string)$b['at'], (string)$a['at']);
    usort($notes, $byAt); usort($saved, $byAt); usort($opened, $byAt);
    return ['notes' => $notes, 'saved' => $saved, 'recent' => array_slice($opened, 0, LEARN_RECENT), 'stats' => learn_stats($units)];
}

/**
 * The figures: weeks in a row with a lesson finished (this week counts if
 * one is done, and an unfinished week so far does not break the run), the
 * minutes of finished lessons, and this week's finishes. Weeks are Monday to
 * Sunday on the programme's own date.
 */
function learn_stats(array $units): array {
    $today = attendance_today();
    $monday = static function (string $d): string { $t = strtotime($d . 'T12:00:00Z'); return gmdate('Y-m-d', $t - ((int)gmdate('N', $t) - 1) * 86400); };
    $thisWeek = $monday($today);
    $weeks = []; $minutes = 0; $week = 0; $done = 0;
    foreach ($units as $u) {
        $p = $u['progress'] ?? null;
        if (!$p || ($p['status'] ?? '') !== 'completed') continue;
        $done++;
        $minutes += (int)($u['durationMins'] ?? 0);
        $at = substr((string)($p['completedAt'] ?? ''), 0, 10);
        if ($at === '') continue;
        $w = $monday($at);
        $weeks[$w] = true;
        if ($w === $thisWeek) $week++;
    }
    $streak = 0;
    $cur = strtotime($thisWeek . 'T12:00:00Z');
    if (!isset($weeks[$thisWeek])) $cur -= 7 * 86400;   // this week is not over yet
    while (isset($weeks[gmdate('Y-m-d', $cur)])) { $streak++; $cur -= 7 * 86400; }
    return ['streakWeeks' => $streak, 'minutes' => $minutes, 'doneThisWeek' => $week, 'done' => $done];
}

/** A lesson the member may keep state on, or null. */
function learn_own_unit(array $p): ?array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return null;
    $id = trim((string)($p['unitId'] ?? ''));
    $units = curriculum_member_units($m);
    return isset($units[$id]) ? ['m' => $m, 'id' => $id, 'unit' => $units[$id]['unit']] : null;
}

function learn_upsert(string $mid, string $unitId, array $set): void {
    $row = db_row('SELECT id FROM learn_state WHERE memberId = ? AND unitId = ?', [$mid, $unitId]);
    if ($row) { db_update('learn_state', $set, ['id' => (int)$row['id']]); return; }
    try { db_insert('learn_state', $set + ['memberId' => $mid, 'unitId' => $unitId]); }
    catch (\Throwable $e) { db_update('learn_state', $set, ['memberId' => $mid, 'unitId' => $unitId]); }   // a double tap raced the insert
}

/** Opening a lesson: remembered for "pick up where you left off". Called by member_curriculum_unit. */
function learn_touch(string $mid, string $unitId): void {
    try {
        $row = db_row('SELECT id, opens FROM learn_state WHERE memberId = ? AND unitId = ?', [$mid, $unitId]);
        if ($row) db_update('learn_state', ['openedAt' => now_iso(), 'opens' => (int)$row['opens'] + 1], ['id' => (int)$row['id']]);
        else learn_upsert($mid, $unitId, ['openedAt' => now_iso(), 'opens' => 1]);
    } catch (\Throwable $e) { /* remembering is a convenience; it never costs anybody the lesson */ }
}

/** The member's note and save on one lesson, for the lesson read. */
function learn_mine(string $mid, string $unitId): array {
    $r = db_row('SELECT note, noteAt, saved FROM learn_state WHERE memberId = ? AND unitId = ?', [$mid, $unitId]);
    return ['note' => $r ? (string)$r['note'] : '', 'noteAt' => $r ? (string)$r['noteAt'] : '', 'saved' => $r ? (int)$r['saved'] === 1 : false];
}

/** member.learn.note — keep, change or clear (empty) a private note on one of their lessons. */
function member_learn_note(array $p): array {
    $o = learn_own_unit($p); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    $note = trim(str_replace("\r\n", "\n", (string)($p['note'] ?? '')));
    if (mb_strlen($note) > LEARN_NOTE_MAX) return ['ok' => false, 'error' => 'too_long', 'max' => LEARN_NOTE_MAX, 'detail' => 'A note can be up to ' . LEARN_NOTE_MAX . ' characters.'];
    $at = $note === '' ? '' : now_iso();
    learn_upsert((string)$o['m']['memberId'], $o['id'], ['note' => $note, 'noteAt' => $at]);
    return ['ok' => true, 'note' => $note, 'noteAt' => $at];
}

/** member.learn.save — save a lesson for later, or take it off the list. */
function member_learn_save(array $p): array {
    $o = learn_own_unit($p); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    $on = !empty($p['saved']);
    learn_upsert((string)$o['m']['memberId'], $o['id'], ['saved' => $on ? 1 : 0, 'savedAt' => $on ? now_iso() : '']);
    return ['ok' => true, 'saved' => $on];
}

/* ── Go deeper: good sources for a lesson ────────────────────────────────────
 *
 * Two kinds, both named on screen with where they come from:
 *
 *   1. A short read on the lesson's topic, FETCHED from Simple English
 *      Wikipedia (written for younger readers), English Wikipedia if it has
 *      nothing — with the licence and a link back, as CC BY-SA requires. The
 *      article is only used when its title shares a real word with the lesson
 *      or the course, so a lesson titled "Open a sheet and record a week of
 *      sales" never comes back with an article about something else.
 *   2. A short list of free, reputable places to go further, by course —
 *      chosen and checked by hand (each URL answered when added, 27 Oct 2026):
 *      Khan Academy, OpenStax, CS50, MDN, Lichess and the like. No ads, no
 *      sign-up wall in front of the first lesson, nothing a child pays for.
 *
 * Fetched on the server, cached for a month (a day for a miss), with the
 * User-Agent Wikimedia's API policy asks for. A failed fetch is not an error
 * anybody sees: the list still shows. Nothing the member typed is sent.
 */

const LEARN_WIKI_TTL = 2592000;      // 30 days
const LEARN_WIKI_MISS_TTL = 86400;   // a day: try again tomorrow, not on every view
const LEARN_STOP = ['the', 'and', 'for', 'with', 'your', 'you', 'how', 'what', 'from', 'into', 'week', 'lesson', 'part', 'about',
                    'make', 'making', 'using', 'use', 'first', 'second', 'one', 'two', 'three', 'open', 'record', 'learn', 'basics', 'introduction', 'intro'];

/** [course pattern, [[title, url, by, why], …]] — first match wins; the last row is everyone's. */
const LEARN_SOURCES = [
    ['/chess/i', [
        ['Learn chess, step by step', 'https://lichess.org/learn', 'Lichess', 'Free, open-source, no adverts — from how the pieces move to checkmates.'],
        ['Practice positions', 'https://lichess.org/practice', 'Lichess', 'Checkmate patterns, tactics and endgames to drill.'],
    ]],
    ['/artificial intelligence|\\bai\\b|machine learning/i', [
        ['Elements of AI', 'https://www.elementsofai.com/', 'University of Helsinki', 'A free course in what AI is and is not, with no maths needed.'],
        ['AI for young people', 'https://code.org/ai', 'Code.org', 'Short videos and activities on how AI learns from data.'],
        ['Machine Learning Crash Course', 'https://developers.google.com/machine-learning/crash-course', 'Google', 'For the ones ready to go deeper.'],
    ]],
    ['/cyber|security/i', [
        ['picoCTF', 'https://picoctf.org/', 'Carnegie Mellon University', 'Safe, legal security puzzles made for secondary-school students.'],
        ['Staying secure online', 'https://www.ncsc.gov.uk/collection/top-tips-for-staying-secure-online', 'UK National Cyber Security Centre', 'Passwords, updates and backups, explained plainly.'],
        ['Be Internet Awesome', 'https://beinternetawesome.withgoogle.com/', 'Google', 'Online safety and spotting scams, made for young people.'],
    ]],
    ['/robot|automation|electronic|engineering/i', [
        ['Arduino: learn', 'https://docs.arduino.cc/learn/', 'Arduino', 'The boards many robots start on, from the first blinking light.'],
        ['Circuits in the browser', 'https://www.tinkercad.com/learn/circuits', 'Autodesk Tinkercad', 'Build and test circuits without any parts.'],
        ['Electrical engineering', 'https://www.khanacademy.org/science/electrical-engineering', 'Khan Academy', 'How the circuits behind a robot work.'],
    ]],
    ['/coding|software|programming|computer|web/i', [
        ['CS50: Introduction to Computer Science', 'https://cs50.harvard.edu/x/', 'Harvard University', 'The famous free course — lectures, notes and problem sets.'],
        ['Learn to code', 'https://www.freecodecamp.org/learn/', 'freeCodeCamp', 'Free, step-by-step coding in the browser.'],
        ['Learn web development', 'https://developer.mozilla.org/en-US/docs/Learn', 'MDN (Mozilla)', 'The reference web developers use, with a path for beginners.'],
        ['Computing', 'https://www.khanacademy.org/computing', 'Khan Academy', 'Programming and computer science from the start.'],
    ]],
    ['/product|design|ux/i', [
        ['UX articles', 'https://www.nngroup.com/articles/', 'Nielsen Norman Group', 'Research on what makes things easy to use.'],
        ['Design library', 'https://design.google/library', 'Google Design', 'How real product teams design.'],
        ['Resource library', 'https://www.figma.com/resource-library/', 'Figma', 'Guides to the design tool and to design itself.'],
    ]],
    ['/data|analys|statistic/i', [
        ['Statistics and probability', 'https://www.khanacademy.org/math/statistics-probability', 'Khan Academy', 'Reading and summarising data, from the start.'],
        ['Our World in Data', 'https://ourworldindata.org/', 'University of Oxford', 'Real data on real problems, and how to read a chart honestly.'],
    ]],
    ['/financ|business|admin|operation|human resources|project|strateg|entrepreneur/i', [
        ['Entrepreneurship', 'https://www.khanacademy.org/college-careers-more/entrepreneurship2', 'Khan Academy', 'Founders talk about starting things.'],
        ['Financial literacy', 'https://www.khanacademy.org/college-careers-more/financial-literacy', 'Khan Academy', 'Money, budgets and saving, plainly.'],
        ['Business textbooks', 'https://openstax.org/subjects/business', 'OpenStax (Rice University)', 'Free, peer-reviewed textbooks — management, accounting and more.'],
        ['Principles of Management', 'https://openstax.org/details/books/principles-management', 'OpenStax', 'Teams, planning and organisations.'],
    ]],
    ['/music|piano|guitar|drum|violin|saxophone|vocal|voice|production/i', [
        ['Music theory lessons', 'https://www.musictheory.net/lessons', 'musictheory.net', 'Notes, rhythm, scales and chords, one screen at a time.'],
        ['Chrome Music Lab', 'https://musiclab.chromeexperiments.com/', 'Google', 'Play with rhythm, melody and sound in the browser.'],
        ['Learning Music', 'https://learningmusic.ableton.com/', 'Ableton', 'How beats, basslines and songs are put together.'],
    ]],
    ['/graphic|brand|cinemat|video|story|social media|content|media|animation/i', [
        ['Pixar in a Box', 'https://www.khanacademy.org/computing/pixar', 'Khan Academy with Pixar', 'Storytelling, colour and animation from Pixar’s own artists.'],
        ['Design library', 'https://design.google/library', 'Google Design', 'Type, colour and layout from working designers.'],
        ['Creator basics', 'https://support.google.com/youtube/answer/2802268', 'YouTube Help', 'Uploading and the rules every creator works under.'],
        ['Be Internet Awesome', 'https://beinternetawesome.withgoogle.com/', 'Google', 'Being safe and kind online, for anybody who posts.'],
    ]],
    ['/acting|stage|craft|adire|art|catering|food/i', [
        ['Google Arts & Culture', 'https://artsandculture.google.com/', 'Google Arts & Culture', 'Museums’ own collections — search it for adire and Yoruba textiles.'],
        ['Art history', 'https://www.khanacademy.org/humanities/art-history', 'Khan Academy', 'Looking closely at how things are made and why.'],
        ['Five keys to safer food', 'https://www.who.int/publications/i/item/9789241594639', 'World Health Organization', 'Kitchen hygiene, in five rules.'],
    ]],
    ['/./', [
        ['Khan Academy', 'https://www.khanacademy.org/', 'Khan Academy', 'Free lessons in nearly every school subject.'],
        ['OpenStax textbooks', 'https://openstax.org/subjects', 'OpenStax (Rice University)', 'Free, peer-reviewed textbooks.'],
        ['BBC Bitesize', 'https://www.bbc.co.uk/bitesize', 'BBC', 'Short revision guides and videos.'],
    ]],
];

/** The vetted sources for a course, with a deep link that searches the topic where the site allows it. */
function learn_curated(string $course, string $topic): array {
    foreach (LEARN_SOURCES as [$re, $list]) {
        if (!preg_match($re, $course)) continue;
        $out = array_map(static fn($x) => ['title' => $x[0], 'url' => $x[1], 'by' => $x[2], 'why' => $x[3]], $list);
        if ($topic !== '') $out[] = ['title' => 'Search Khan Academy for “' . $topic . '”', 'url' => 'https://www.khanacademy.org/search?page_search_query=' . rawurlencode($topic),
                                     'by' => 'Khan Academy', 'why' => 'Free lessons and videos on the topic.'];
        return $out;
    }
    return [];
}

/** The words of a title that carry its meaning: lower-case, four letters or more, not filler. */
function learn_words(string $s): array {
    $w = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($s)) ?: [];
    return array_values(array_unique(array_filter($w, static fn($x) => mb_strlen($x) >= 4 && !in_array($x, LEARN_STOP, true))));
}

/** GET a Wikimedia URL. Test seam: $GLOBALS['__learn_http'] = fn($url) => ['ok'=>…, 'code'=>…, 'body'=>…]. */
function learn_http_get(string $url): array {
    if (isset($GLOBALS['__learn_http']) && is_callable($GLOBALS['__learn_http'])) return ($GLOBALS['__learn_http'])($url);
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'no_curl'];
    $c = org_contact();
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        // Wikimedia's API policy: say who is asking and how to reach them.
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: NGGLearn/1.0 (https://' . $c['site'] . '; ' . $c['email'] . ')'],
    ]);
    $out = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['ok' => $out !== false && $code >= 200 && $code < 300, 'code' => $code, 'body' => (string)$out];
}

/** One article on a topic: the best title match, its plain-text summary and its address. Null when none fits. */
function learn_wiki(string $topic, array $mustShare): ?array {
    foreach (['simple' => 'Simple English Wikipedia', 'en' => 'Wikipedia'] as $lang => $label) {
        $s = learn_http_get('https://' . $lang . '.wikipedia.org/w/rest.php/v1/search/title?limit=3&q=' . rawurlencode($topic));
        if (!$s['ok']) return null;   // rate-limited or down: a miss today, not a fallback that hammers the next wiki
        $pages = json_decode($s['body'], true)['pages'] ?? [];
        foreach ($pages as $pg) {
            $key = (string)($pg['key'] ?? '');
            if ($key === '' || !array_intersect(learn_words((string)($pg['title'] ?? '')), $mustShare)) continue;
            $r = learn_http_get('https://' . $lang . '.wikipedia.org/api/rest_v1/page/summary/' . rawurlencode($key));
            if (!$r['ok']) continue;
            $j = json_decode($r['body'], true);
            if (!is_array($j) || ($j['type'] ?? '') !== 'standard') continue;   // a disambiguation page is not a read
            $text = trim((string)($j['extract'] ?? ''));
            if (mb_strlen($text) < 80) continue;
            if (mb_strlen($text) > 700) $text = rtrim(mb_substr($text, 0, mb_strrpos(mb_substr($text, 0, 700), '. ') ?: 700)) . '.';
            return ['title' => (string)($j['title'] ?? $pg['title']), 'extract' => $text,
                    'url' => (string)($j['content_urls']['desktop']['page'] ?? ('https://' . $lang . '.wikipedia.org/wiki/' . rawurlencode($key))),
                    'source' => $label, 'licence' => 'CC BY-SA 4.0', 'licenceUrl' => 'https://creativecommons.org/licenses/by-sa/4.0/'];
        }
    }
    return null;
}

/** member.learn.sources — Go deeper on one of the member's lessons. */
function member_learn_sources(array $p): array {
    $o = learn_own_unit($p); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    $u = $o['unit'];
    $course = trim((string)$u['course']) ?: 'NGG Club';
    $title = trim(preg_replace('/^(week|lesson|session)\s*\d+\s*[:.\-–—]\s*/iu', '', (string)$u['title']));
    $words = learn_words($title);
    $courseWords = learn_words($course);
    $read = null;
    foreach (array_filter([$title => $words, $course => $courseWords]) as $q => $share) {
        $key = 'learn-wiki-' . sha1(mb_strtolower((string)$q));
        $hit = cache_get($key, LEARN_WIKI_TTL);
        if (is_array($hit) && isset($hit['miss'])) {
            if (time() - (int)$hit['at'] < LEARN_WIKI_MISS_TTL) continue;
            $hit = null;
        }
        if (!is_array($hit)) {
            $found = learn_wiki((string)$q, $share);
            $hit = $found ?? ['miss' => 1, 'at' => time()];
            cache_put($key, $hit);
        }
        if (!isset($hit['miss'])) { $read = $hit; break; }
    }
    return ['ok' => true, 'read' => $read, 'sources' => learn_curated($course, $title !== '' ? $title : $course)];
}
