<?php
declare(strict_types=1);

/**
 * ID card designs, stored as data.
 *
 * The artwork this programme prints has always been code: the layout lived in
 * JSX and only the data varied per child, so moving the QR two millimetres meant
 * a deploy. A template is that same document with the layout moved into the row
 * — a JSON design whose text and images can BIND to fields (`{{surname}}`,
 * `{{photo}}`, `{{centre.color}}`), rendered once per child.
 *
 * Two decisions worth stating, because they are what make this a credential
 * system rather than a drawing app:
 *
 *  1. **Publishing is a separate act from saving.** A draft is whatever the
 *     designer last typed; `publishedJson` is the frozen copy that print runs
 *     read. Nobody can change what three hundred cards look like by leaving an
 *     editor open, and a half-finished design cannot reach a printer.
 *
 *  2. **The version is recorded, not just bumped.** A print run stores the
 *     version it used, so "reprint card 147 exactly as it was in July" is
 *     answerable a year later. A design tool does not need this; anything that
 *     issues identity documents does.
 *
 * Validation lives here and not only in the browser, because the browser is not
 * where the trust boundary is: these ops accept a JSON document from an admin
 * session and it has to be safe to render server-side and store.
 */

/** Cap on a stored design. Generous for a card, small enough that a runaway
 *  client cannot fill a shared host's disk one autosave at a time. */
const CTPL_MAX_BYTES = 512 * 1024;
const CTPL_MAX_ELEMENTS = 200;
/* 'graphic' is everything that is not a credential — a poster, a certificate, a
   social post, a letterhead. It exists because this organisation is not only a
   summer programme, and a design tool that can only make ID cards says it is. */
/* 'member' is the NGG member card — the credential every year-round member
   carries. It was the ONE card this system could not express, so it stayed
   hand-coded JSX and moving a line on it meant a deploy: exactly the problem
   templates exist to end, left in place for the card it mattered most for. */
const CTPL_KINDS = ['member', 'student', 'volunteer', 'graphic'];
/** A card has two sides. 'single' is a design with no counterpart. */
const CTPL_FACES = ['single', 'front', 'back'];
const CTPL_ELEMENT_TYPES = ['rect', 'ellipse', 'line', 'text', 'image', 'qr', 'path', 'group'];

/** Which capability may change what a credential looks like.
 *
 *  Deliberately 'people' rather than 'summer': the staff who verify children and
 *  the staff who decide what an ID card looks like are not the same job, and the
 *  second one can invalidate every card at a gate. */
function ctpl_gate(array $p) { return admin_cap_gate($p, 'people'); }

/**
 * Reject a design that could not be rendered — or that could be rendered into
 * something dangerous.
 *
 * The size and shape checks are obvious. The interesting one is the image URL:
 * a template is drawn into a canvas and then exported with toDataURL(), and a
 * cross-origin image taints the canvas so the export silently produces nothing.
 * A `javascript:` or `data:text/html` src is the security half of the same
 * check. Both are refused here rather than discovered at the print run.
 */
function ctpl_validate(array $t): array {
    $errors = [];
    $name = trim((string)($t['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 120) $errors[] = 'name';
    if (!in_array((string)($t['kind'] ?? ''), CTPL_KINDS, true)) $errors[] = 'kind';
    if (isset($t['face']) && !in_array((string)$t['face'], CTPL_FACES, true)) $errors[] = 'face';
    $w = (int)($t['w'] ?? 0); $h = (int)($t['h'] ?? 0);
    if ($w < 100 || $w > 8000 || $h < 100 || $h > 8000) $errors[] = 'size';
    /* The real-world size, which decides export resolution and every millimetre
       check. Bounded generously — a roll-up banner is 2 metres tall — but not
       unbounded: a template claiming 40 metres would ask the browser to render a
       raster nothing can hold. */
    $wMm = (float)($t['wMm'] ?? 54); $hMm = (float)($t['hMm'] ?? 0);
    if ($wMm < 10 || $wMm > 3000 || $hMm < 0 || $hMm > 3000) $errors[] = 'sizeMm';

    $els = $t['elements'] ?? null;
    if (!is_array($els)) { $errors[] = 'elements'; $els = []; }
    if (count($els) > CTPL_MAX_ELEMENTS) $errors[] = 'too_many_elements';

    $seen = [];
    foreach ($els as $i => $el) {
        if (!is_array($el)) { $errors[] = "element.$i"; continue; }
        $type = (string)($el['type'] ?? '');
        if (!in_array($type, CTPL_ELEMENT_TYPES, true)) { $errors[] = "element.$i.type"; continue; }
        $id = (string)($el['id'] ?? '');
        if ($id === '' || isset($seen[$id])) $errors[] = "element.$i.id";   // ids address elements; duplicates break that
        $seen[$id] = true;
        foreach (['x', 'y', 'w', 'h'] as $k) {
            if (isset($el[$k]) && !is_numeric($el[$k])) $errors[] = "element.$i.$k";
        }
        foreach (['src', 'fill', 'stroke', 'color'] as $k) {
            $v = (string)($el[$k] ?? '');
            if ($v === '') continue;
            if (strpos($v, '{{') !== false) continue;                       // a binding, resolved at render
            if ($k === 'src' && !ctpl_safe_url($v)) $errors[] = "element.$i.src";
        }
    }
    return $errors;
}

/** Same-origin, a data: image, or an https URL — nothing that can taint a canvas
 *  export or execute. Relative paths are ours by construction. */
function ctpl_safe_url(string $u): bool {
    $u = trim($u);
    if ($u === '') return true;
    if ($u[0] === '/') return true;                                          // our own storage
    if (stripos($u, 'data:image/') === 0) return true;
    if (preg_match('#^https://#i', $u)) return true;
    return false;
}

function ctpl_row_public(array $r, bool $withSchema = true): array {
    $out = [
        'templateId' => (string)$r['templateId'],
        'name' => (string)$r['name'],
        'kind' => (string)$r['kind'],
        'status' => (string)$r['status'],
        'version' => (int)$r['version'],
        'face' => (string)($r['face'] ?? 'single'),
        'pairId' => (string)($r['pairId'] ?? ''),
        'system' => strpos((string)$r['templateId'], 'sys-') === 0,
        'updatedAt' => (string)($r['updatedAt'] ?? ''),
        'publishedAt' => (string)($r['publishedAt'] ?? ''),
    ];
    if ($withSchema) {
        $out['schema'] = json_decode((string)($r['schemaJson'] ?? ''), true) ?: null;
        $out['published'] = json_decode((string)($r['publishedJson'] ?? ''), true) ?: null;
    }
    return $out;
}

function admin_card_templates(array $p): array {
    $g = ctpl_gate($p); if (!$g['ok']) return $g;
    $kind = (string)($p['kind'] ?? '');
    $where = $kind !== '' && in_array($kind, CTPL_KINDS, true) ? 'WHERE kind = ?' : '';
    $args = $where !== '' ? [$kind] : [];
    $rows = db_all("SELECT * FROM card_templates $where ORDER BY id DESC LIMIT 200", $args);
    return ['ok' => true, 'templates' => array_map(fn($r) => ctpl_row_public($r, false), $rows)];
}

function admin_card_template_get(array $p): array {
    $g = ctpl_gate($p); if (!$g['ok']) return $g;
    $r = db_row('SELECT * FROM card_templates WHERE templateId = ? LIMIT 1', [(string)($p['templateId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'template' => ctpl_row_public($r)];
}

/**
 * Create or update a draft.
 *
 * A system template is never written in place — saving one forks it into a new
 * design owned by whoever pressed save. There is always a known-good card to
 * fall back to, and "somebody edited the standard student ID" cannot happen.
 */
function admin_card_template_save(array $p): array {
    $g = ctpl_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $t = $p['template'] ?? null;
    if (!is_array($t)) return ['ok' => false, 'error' => 'missing_template'];

    $json = json_encode($t, JSON_UNESCAPED_SLASHES);
    if ($json === false) return ['ok' => false, 'error' => 'bad_json'];
    if (strlen($json) > CTPL_MAX_BYTES) return ['ok' => false, 'error' => 'too_large'];

    $errors = ctpl_validate($t);
    if ($errors) return ['ok' => false, 'error' => 'invalid', 'fields' => array_slice($errors, 0, 12)];

    $id = trim((string)($p['templateId'] ?? ''));
    $existing = $id !== '' ? db_row('SELECT * FROM card_templates WHERE templateId = ? LIMIT 1', [$id]) : null;
    $forked = false;
    if ($id === '' || strpos($id, 'sys-') === 0 || !$existing) {
        // A fork keeps the drawing and drops the identity — including the name,
        // so a list of designs never shows two rows called the same thing.
        $forked = $id !== '';
        $id = 'ctpl-' . strtolower(rand_hex(5));
        $t['id'] = $id;
        if ($forked && isset($t['name'])) $t['name'] = mb_substr((string)$t['name'] . ' (copy)', 0, 120);
        unset($t['system']);
        db_insert('card_templates', [
            'templateId' => $id, 'name' => (string)$t['name'], 'kind' => (string)$t['kind'],
            'status' => 'draft', 'version' => 1,
            'face' => in_array((string)($t['face'] ?? 'single'), CTPL_FACES, true) ? (string)$t['face'] : 'single',
            /* A fork does NOT inherit the pairing. Two designs claiming the
               same back is how a duplex run comes out with one member's front
               and another's back — the pairing has to be re-stated on the copy
               deliberately. */
            'pairId' => $forked ? '' : (string)($t['pairId'] ?? ''),
            'schemaJson' => json_encode($t, JSON_UNESCAPED_SLASHES), 'publishedJson' => '',
            'createdById' => $me, 'updatedById' => $me,
            'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'publishedAt' => '',
        ]);
    } else {
        $t['id'] = $id;
        db_update('card_templates', [
            'name' => (string)$t['name'], 'kind' => (string)$t['kind'],
            'face' => in_array((string)($t['face'] ?? ($existing['face'] ?? 'single')), CTPL_FACES, true)
                      ? (string)($t['face'] ?? ($existing['face'] ?? 'single')) : 'single',
            'schemaJson' => json_encode($t, JSON_UNESCAPED_SLASHES),
            'updatedById' => $me, 'updatedAt' => now_iso(),
        ], ['templateId' => $id]);
    }
    audit('card.template.save', $me, $id, ['forked' => $forked, 'elements' => count($t['elements'] ?? [])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'templateId' => $id, 'forked' => $forked];
}

/**
 * Freeze a draft as the design print runs will use.
 *
 * Publishing runs the same preflight the designer shows, on the server, because
 * a check that only runs in the browser is a check somebody can skip with a
 * crafted request — and the thing it is protecting is three hundred pieces of
 * card. Warnings are reported and allowed; errors refuse.
 */
function admin_card_template_publish(array $p): array {
    $g = ctpl_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $r = db_row('SELECT * FROM card_templates WHERE templateId = ? LIMIT 1', [(string)($p['templateId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $t = json_decode((string)$r['schemaJson'], true);
    if (!is_array($t)) return ['ok' => false, 'error' => 'bad_json'];

    $problems = ctpl_preflight($t);
    $errors = array_values(array_filter($problems, fn($x) => $x['level'] === 'error'));
    if ($errors) return ['ok' => false, 'error' => 'preflight', 'problems' => $problems];

    $version = (int)$r['version'] + ((string)$r['publishedJson'] !== '' ? 1 : 0);
    db_update('card_templates', [
        'status' => 'published', 'version' => $version,
        'publishedJson' => json_encode($t, JSON_UNESCAPED_SLASHES),
        'publishedAt' => now_iso(), 'updatedById' => $me, 'updatedAt' => now_iso(),
    ], ['templateId' => (string)$r['templateId']]);
    audit('card.template.publish', $me, (string)$r['templateId'], ['version' => $version], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'version' => $version, 'problems' => $problems];
}

function admin_card_template_delete(array $p): array {
    $g = ctpl_gate($p); if (!$g['ok']) return $g;
    $id = (string)($p['templateId'] ?? '');
    if (strpos($id, 'sys-') === 0) return ['ok' => false, 'error' => 'system_template'];
    $n = db_exec('DELETE FROM card_templates WHERE templateId = ?', [$id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('card.template.delete', (string)($g['requester']['memberId'] ?? ''), $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * The checks that stop three hundred unusable cards.
 *
 * Mirrors tplPreflight() in card-template.jsx — the designer needs it live as
 * you drag, and publish needs it where it cannot be bypassed. Two copies of a
 * rule is a real cost; the alternative is a browser-only guarantee on a print
 * run, which is not a guarantee.
 */
/* What actually decides whether a camera can read a code is the MODULE size —
 * one dark square, in millimetres — not the code's overall size. A 9mm code
 * carrying a short token is comfortable; the same 9mm carrying a long URL is
 * unreadable, because a longer payload needs a higher version and therefore
 * more, smaller squares in the same space. Mirrors card-template.jsx. */
const CTPL_QR_GOOD_MODULE_MM = 0.40;
const CTPL_QR_MIN_MODULE_MM = 0.30;
/** Millimetres per design unit, from the template's OWN trim size — not from the
 *  width of an ID card, which is what this assumed while an ID card was the only
 *  thing it could make. The same 98 units is 9mm on a card and 15mm on A4. */
function ctpl_mm_per_unit(array $t): float {
    $w = (float)($t['w'] ?? 590) ?: 590.0;
    return ((float)($t['wMm'] ?? 54) ?: 54.0) / $w;
}

/* ── Can you read it? ────────────────────────────────────────────────────────
 * Mirrors tplInkProblems() in card-template.jsx. Preflight knew whether the QR
 * would scan and whether type sat too near the trim; it did not know whether
 * the type was legible, so a card with its role line printed in the tier colour
 * ON a pill filled with the tier colour published with zero errors.
 *
 * The server has no roster to resolve {{bindings}} against, so it checks the
 * two cases that need no data: ink and paint that are the SAME STRING (1:1
 * whatever they resolve to), and pairs that are literal on both sides. The
 * client, which is proofing against real rows, additionally measures the bound
 * pairs and warns. Publish refuses on what is decidable here.
 *
 * 3:1 refuses and 4.5:1 warns, at every size: WCAG's large-text allowance is
 * defined in CSS pixels and this is a document measured in millimetres for a
 * printer, so borrowing the number would borrow a precision we do not have. */
const CTPL_INK_ERROR_RATIO = 3.0;
const CTPL_INK_WARN_RATIO = 4.5;

/** WCAG 2.1 relative luminance. Null for anything that is not a hex we read. */
function ctpl_lum(string $hex): ?float {
    $h = ltrim(trim($hex), '#');
    if (strlen($h) === 3) $h = $h[0] . $h[0] . $h[1] . $h[1] . $h[2] . $h[2];
    if (!preg_match('/^[0-9a-fA-F]{6}$/', $h)) return null;
    $l = 0.0;
    foreach ([0.2126, 0.7152, 0.0722] as $i => $k) {
        $c = hexdec(substr($h, $i * 2, 2)) / 255;
        $l += $k * ($c <= 0.04045 ? $c / 12.92 : pow(($c + 0.055) / 1.055, 2.4));
    }
    return $l;
}
function ctpl_contrast(string $a, string $b): ?float {
    $x = ctpl_lum($a); $y = ctpl_lum($b);
    if ($x === null || $y === null) return null;
    return (max($x, $y) + 0.05) / (min($x, $y) + 0.05);
}
function ctpl_covers(array $el, float $x, float $y): bool {
    $ex = (float)($el['x'] ?? 0); $ey = (float)($el['y'] ?? 0);
    return $x >= $ex && $y >= $ey && $x <= $ex + (float)($el['w'] ?? 0) && $y <= $ey + (float)($el['h'] ?? 0);
}

/**
 * The paint under element $i, or null when we cannot say.
 * Returns ['card' => true] when nothing is between the text and the card.
 */
function ctpl_paint_under(array $els, int $i) {
    $el = $els[$i];
    $cx = (float)($el['x'] ?? 0) + (float)($el['w'] ?? 0) / 2;
    $cy = (float)($el['y'] ?? 0) + (float)($el['h'] ?? 0) / 2;
    for ($j = $i - 1; $j >= 0; $j--) {
        $u = $els[$j];
        if (!empty($u['hidden']) || !ctpl_covers($u, $cx, $cy)) continue;
        // A photograph under the words. WCAG cannot measure that either, and
        // warning about every name over a picture would teach people to ignore
        // this check — the one outcome worse than not having it.
        if (($u['type'] ?? '') === 'image') return null;
        if (!in_array($u['type'] ?? '', ['rect', 'shape', 'ellipse'], true)) continue;
        if (isset($u['opacity']) && (float)$u['opacity'] < 1) return null;   // composited
        return $u['fill'] ?? '';
    }
    return ['card' => true];
}

/** Every literal colour a paint value can be — a gradient counts as all of its
 *  stops, because text only has to be illegible over part of one. */
function ctpl_paint_colours($paint): array {
    if (is_array($paint) && isset($paint['stops']) && is_array($paint['stops'])) {
        $out = [];
        foreach ($paint['stops'] as $st) {
            $c = (string)($st['color'] ?? '');
            if ($c !== '') $out[] = $c;
        }
        return $out;
    }
    return is_string($paint) && $paint !== '' ? [$paint] : [];
}

function ctpl_ink_problems(array $t, callable $add): void {
    $els = is_array($t['elements'] ?? null) ? array_values($t['elements']) : [];
    foreach ($els as $i => $el) {
        if (($el['type'] ?? '') !== 'text' || !empty($el['hidden'])) continue;
        $text = trim((string)($el['text'] ?? ''));
        if ($text === '') continue;                       // an empty line cannot be unreadable
        $under = ctpl_paint_under($els, $i);
        if ($under === null) continue;
        $isCard = is_array($under) && !empty($under['card']);
        $paint = $isCard ? (string)($t['background'] ?? '#ffffff') : $under;
        $where = $isCard ? 'the card' : 'what it sits on';
        $ink = $el['color'] ?? '';
        $label = '“' . mb_substr($text, 0, 24) . '”';

        // 1 · The same string: 1:1 whatever it resolves to. No data needed.
        if (is_string($ink) && is_string($paint) && trim($ink) !== ''
            && strcasecmp(trim($ink), trim($paint)) === 0) {
            $add('error', $label . ' is the same colour as ' . $where . ' — it will print invisible',
                 (string)($el['id'] ?? ''));
            continue;
        }

        // 2 · Measured, where both sides are literal. A {{binding}} is the
        //     client's to resolve — it has the roster and this does not.
        if (!is_string($ink) || strpos($ink, '#') !== 0) continue;
        $worst = null; $worstFor = '';
        foreach (ctpl_paint_colours($paint) as $bg) {
            if (strpos($bg, '#') !== 0) continue;
            $r = ctpl_contrast($ink, $bg);
            if ($r === null) continue;
            if ($worst === null || $r < $worst) { $worst = $r; $worstFor = $ink . ' on ' . $bg; }
        }
        if ($worst === null) continue;
        $said = $label . ' measures ' . number_format($worst, 2) . ':1 against ' . $where
              . ' (' . $worstFor . ')';
        if ($worst < CTPL_INK_ERROR_RATIO) {
            $add('error', $said . ' — that cannot be read', (string)($el['id'] ?? ''));
        } elseif ($worst < CTPL_INK_WARN_RATIO) {
            $add('warn', $said . ' — ' . CTPL_INK_WARN_RATIO
                 . ':1 is the floor for text somebody has to read across a hall',
                 (string)($el['id'] ?? ''));
        }
    }
}

function ctpl_preflight(array $t): array {
    $problems = [];
    $add = function (string $level, string $message, string $elId = '') use (&$problems) {
        $problems[] = ['level' => $level, 'message' => $message, 'elId' => $elId];
    };
    $els = is_array($t['elements'] ?? null) ? $t['elements'] : [];

    // Which fields the design actually shows.
    $bound = [];
    foreach ($els as $el) {
        foreach ($el as $v) {
            if (!is_string($v)) continue;
            if (preg_match_all('/\{\{\s*([\w.]+)\s*\}\}/', $v, $m)) {
                foreach ($m[1] as $k) $bound[$k] = ($bound[$k] ?? 0) + 1;
            }
        }
    }
    $kind = (string)($t['kind'] ?? 'student');
    $face = (string)($t['face'] ?? 'single');
    /* What a card of this kind must show, per kind. Mirrors TPL_REQUIRED in
       card-template.jsx.
     *
     * The BACK of a card is exempt. A back carries terms, an emergency
     * number, a signature strip — it is not where the name and the code live,
     * and running the front's rules over it would refuse every back for want
     * of a QR, which teaches people to route around the checks that matter
     * (the same reasoning that exempts a poster). The FRONT still has to
     * satisfy them, so a two-sided card cannot lose its identity by moving
     * everything to the back. */
    $required = ($kind === 'graphic' || $face === 'back') ? []
        : ($kind === 'volunteer' ? ['surname', 'token', 'displayId', 'role']
        : ($kind === 'member'    ? ['name', 'displayId']
                                 : ['surname', 'token', 'displayId']));
    foreach ($required as $f) {
        // `role` is satisfied by either field that prints it.
        if ($f === 'role' && (isset($bound['role']) || isset($bound['roleFaculty']))) continue;
        /* A member card may carry either the split name or the full one — the
           roster holds a single `fullName` for members, unlike the summer
           intake which asks for the parts separately. */
        if ($f === 'name' && (isset($bound['fullName']) || isset($bound['surname']) || isset($bound['firstName'])
            // The two-weight member lockup counts as showing a name.
            || isset($bound['member.given']) || isset($bound['member.family']))) continue;
        if (empty($bound[$f])) $add('error', 'Nothing on this card shows ' . $f);
    }

    $qr = array_values(array_filter($els, fn($e) => ($e['type'] ?? '') === 'qr'));
    // A poster is not a credential. Running the credential rules on one would
    // refuse every poster for want of a QR, which teaches people to route around
    // the checks that matter.
    /* A back with no QR is fine; a FRONT without one is a card nobody can
       scan. A member card's QR points at their profile rather than a gate
       token, so it is required for the same reason and refused the same way. */
    if (!$qr && $kind !== 'graphic' && $face !== 'back') $add('error', 'No QR — the card cannot be scanned at a gate');
    if (count($qr) > 1) $add('error', 'Two QR codes — a scanner reads whichever it sees first');
    /* Ask our own encoder how many modules a real payload needs, rather than
       assuming a version — it is the same function that produces the printed
       code, so the check and the artwork cannot disagree. */
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? 'https://next.afrovanguard.org.ng'), '/');
    $modules = 29;
    if (function_exists('qr_pick_version')) {
        $v = qr_pick_version(strlen($origin . '/q/SUMQR-0000'));
        if ($v > 0) $modules = 17 + 4 * $v;
    }
    foreach ($qr as $q) {
        $mm = min((float)($q['w'] ?? 0), (float)($q['h'] ?? 0)) * ctpl_mm_per_unit($t);
        $per = $modules > 0 ? $mm / $modules : 0.0;
        if ($per < CTPL_QR_MIN_MODULE_MM) {
            $add('error', 'The QR is ' . number_format($mm, 1) . 'mm, which is ' . number_format($per, 2)
                . 'mm per square — under ' . number_format(CTPL_QR_MIN_MODULE_MM, 2)
                . 'mm a phone camera cannot read it', (string)($q['id'] ?? ''));
        } elseif ($per < CTPL_QR_GOOD_MODULE_MM) {
            $add('warn', 'The QR is ' . number_format($mm, 1) . 'mm, which is ' . number_format($per, 2)
                . 'mm per square — it will scan, but ' . number_format(CTPL_QR_GOOD_MODULE_MM, 2)
                . 'mm is the comfortable floor for print', (string)($q['id'] ?? ''));
        }
        if (abs((float)($q['w'] ?? 0) - (float)($q['h'] ?? 0)) > 1) $add('error', 'The QR must stay square', (string)($q['id'] ?? ''));
    }

    $safe = (float)($t['safe'] ?? 0);
    $tw = (float)($t['w'] ?? 590); $th = (float)($t['h'] ?? 972);
    if ($safe > 0) {
        foreach ($els as $el) {
            if (($el['role'] ?? '') === 'background') continue;           // deliberate full bleed
            $x = (float)($el['x'] ?? 0); $y = (float)($el['y'] ?? 0);
            $w = (float)($el['w'] ?? 0); $h = (float)($el['h'] ?? 0);
            if ($x < $safe || $y < $safe || $x + $w > $tw - $safe || $y + $h > $th - $safe) {
                $add('warn', 'Inside the ' . (int)$safe . '-unit safe area — this may be trimmed off', (string)($el['id'] ?? ''));
            }
        }
    }
    /* Legibility, last: the messages read better after the structural ones. */
    ctpl_ink_problems($t, $add);

    return $problems;
}

/** Preflight without publishing — what the designer's "Check" button calls. */
function admin_card_template_check(array $p): array {
    $g = ctpl_gate($p); if (!$g['ok']) return $g;
    $t = $p['template'] ?? null;
    if (!is_array($t)) {
        $r = db_row('SELECT schemaJson FROM card_templates WHERE templateId = ? LIMIT 1', [(string)($p['templateId'] ?? '')]);
        if (!$r) return ['ok' => false, 'error' => 'not_found'];
        $t = json_decode((string)$r['schemaJson'], true);
    }
    if (!is_array($t)) return ['ok' => false, 'error' => 'bad_json'];
    $problems = ctpl_preflight($t);
    return ['ok' => true, 'problems' => $problems,
            'errors' => count(array_filter($problems, fn($x) => $x['level'] === 'error'))];
}
