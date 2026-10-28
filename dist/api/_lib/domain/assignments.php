<?php
declare(strict_types=1);

/**
 * Assignments — work an admin, an instructor or a mentor sets for the members
 * of a course, with per-member submissions, marking and feedback.
 * Distinct from Anchor missions (fixed XP curriculum) and from the curriculum's
 * own lesson checks. DB column `answerText` is surfaced to the client as `text`.
 *
 * Who can set and mark:
 *   - an admin holding content, curriculum or club, within their centre scope
 *     (the Control Room, admin route);
 *   - an instructor or mentor, for the courses and centre on their record
 *     (the portals, member route — mentor_gate decides the reach, exactly as
 *     it does for the curriculum and the class).
 * A course of '' means the whole Club; only an admin sets one of those.
 *
 * Who receives it: the members whose course it is, by the same resolution the
 * curriculum uses (curriculum_member_courses — a TECH member takes Coding),
 * at the centre named (or every centre), in the session named (or any).
 * Membership is checked again on submission: an assignment id is not a key.
 */

/* How work is handed in. `either` is the original "writing or a file" and
 * stays valid; `any` is its broader successor (writing, files or a link). */
const ASG_PROOFS     = ['text', 'file', 'photo', 'recording', 'link', 'checklist', 'either', 'any'];
const ASG_PROOF_META = [
    'text'      => ['label' => 'Writing',             'hint' => 'A written answer, typed in the portal.'],
    'file'      => ['label' => 'A document or file',  'hint' => 'A PDF, Word, Excel, PowerPoint, image or zip.'],
    'photo'     => ['label' => 'A photo',             'hint' => 'A photo of the work — taken now or chosen from the phone.'],
    'recording' => ['label' => 'A recording',         'hint' => 'Audio or video — recorded in the portal or uploaded.'],
    'link'      => ['label' => 'A link',              'hint' => 'A Google Doc, Sheet or Slides, a Canva design, a GitHub repo, a video…'],
    'checklist' => ['label' => 'A checklist',         'hint' => 'Tick each step as it is done, with a short note.'],
    'either'    => ['label' => 'Writing or a file',   'hint' => 'Either a written answer or a file.'],
    'any'       => ['label' => 'Anything that shows it', 'hint' => 'Writing, files or a link — whatever shows the work best.'],
];
const ASG_FILES_MAX  = 5;
const ASG_STEPS_MAX  = 12;
const ASG_EXT = [
    'photo'     => ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'],
    'recording' => ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'weba', 'webm', 'mp4', 'mov', 'm4v', '3gp'],
];
const ASG_STATUSES   = ['draft', 'published', 'closed'];
const ASG_POINTS_MAX = 1000;
const ASG_TEXT_MAX   = 20000;
const ASG_REMIND_QUIET = 86400;
const ASG_BULK_MAX   = 500;

/* ── Who gets it ─────────────────────────────────────────────────────────── */

/** Does this assignment reach this member? $ctx: curriculum_course_ctx(), reused across a list. */
function assignment_matches_member(array $a, array $member, string $currentSessionId, ?array &$ctx = null, ?array $placed = null): bool {
    /* Compared the way the rest of the record is: an imported row says
     * "Active", or leaves it blank, and a centre is typed "egbeda " as often
     * as "Egbeda". Compared exactly, those members saw no assignments at all
     * while their lessons (matched loosely) showed. */
    $st = strtolower(trim((string)($member['status'] ?? '')));
    if ($st !== '' && $st !== 'active') return false;
    $c = trim((string)($a['centre'] ?? ''));
    if ($c !== '' && $c !== 'All' && $c !== 'Both' && mb_strtolower($c) !== mb_strtolower(trim((string)($member['centre'] ?? '')))) return false;
    $sid = (string)($a['sessionId'] ?? '');
    if ($sid !== '' && $currentSessionId !== '' && $sid !== $currentSessionId) return false;
    /* An assignment drawn from a lesson reaches the year that lesson is for:
     * a Year 2 lesson's homework is not set for Year 1 (members see only their
     * own year's lessons, so the homework follows the same rule). */
    $uy = assignment_unit_year((string)($a['unitId'] ?? ''));
    if ($uy > 0 && function_exists('curriculum_member_year') && assignment_member_year($member, $placed) !== $uy) return false;
    $track = trim((string)($a['track'] ?? ''));
    if ($track === '' || $track === 'All') return true;
    $courses = function_exists('curriculum_member_courses') ? curriculum_member_courses($member, $ctx) : [(string)($member['track'] ?? '')];
    $mine = array_map(fn($x) => mb_strtolower(trim((string)$x)), $courses);
    if (in_array(mb_strtolower($track), $mine, true)) return true;
    /* An assignment set for a division word or a family ("Tech", "Music")
       reaches a member who takes any course it stands for — the same reading
       a member's own track gets, so it works for chosen courses too. */
    if (function_exists('member_courses_from_text')) {
        [$want] = member_courses_from_text($track, $ctx);
        foreach ($want as $w) if ($w !== 'Chess' && in_array(mb_strtolower($w), $mine, true)) return true;
    }
    return false;
}

/** The programme year of the lesson an assignment came from (0: none, or a year-less lesson). Cached per request. */
function assignment_unit_year(string $unitId): int {
    static $cache = [];
    if ($unitId === '' || !function_exists('curriculum_level_year')) return 0;
    if (!array_key_exists($unitId, $cache)) $cache[$unitId] = curriculum_level_year((string)(db_row('SELECT level FROM curriculum_units WHERE unitId = ?', [$unitId])['level'] ?? ''));
    return $cache[$unitId];
}
/** Every member's placed programme year, in one query: a list's callers read it once, not once per member. */
function assignment_placed_years(): array {
    $placed = [];
    foreach (db_all('SELECT memberId, stateValue FROM member_state WHERE stateKey = ?', [CURR_YEAR_KEY]) as $r) $placed[(string)$r['memberId']] = (int)$r['stateValue'];
    return $placed;
}
/** A member's placed year: from $placed when the caller loaded it, else read for this one member. */
function assignment_member_year(array $m, ?array $placed = null): int {
    $id = (string)($m['memberId'] ?? '');
    return $placed !== null ? curriculum_member_year($m, $placed[$id] ?? 0)['year'] : curriculum_member_year($m)['year'];
}

function assignment_session_id(): string {
    $sc = function_exists('session_current') ? session_current() : [];
    return (string)($sc['current']['sessionId'] ?? '');
}

/** Every active member this assignment reaches. One members query, courses resolved in PHP. */
function assignment_audience(array $a): array {
    $sid = assignment_session_id();
    $args = [];
    $sql = "SELECT memberId, fullName, email, centre, track, courses, disciplines, division, status, type, role FROM members WHERE (status IS NULL OR LOWER(TRIM(status)) IN ('active', ''))";
    $c = trim((string)($a['centre'] ?? ''));
    if ($c !== '' && $c !== 'All' && $c !== 'Both') { $sql .= ' AND LOWER(TRIM(centre)) = ?'; $args[] = mb_strtolower($c); }
    $ctx = null; $out = [];
    $placed = assignment_unit_year((string)($a['unitId'] ?? '')) > 0 ? assignment_placed_years() : null;
    foreach (db_all($sql, $args) as $m) {
        if (is_admin_role((string)($m['role'] ?? ''))) continue;   // staff are not set homework
        if (assignment_matches_member($a, $m, $sid, $ctx, $placed)) $out[] = $m;
    }
    return $out;
}

function assignment_due_ts(array $a): int {
    $d = trim((string)($a['dueAt'] ?? ''));
    if ($d === '') return 0;
    // A bare date is due at the end of that day, Lagos time.
    $t = strtotime(strlen($d) === 10 ? $d . 'T23:59:59+01:00' : $d);
    return $t ?: 0;
}

/* ── Who may set and mark ────────────────────────────────────────────────── */

/**
 * The staff side's gate. ['ok', 'who' => 'admin'|'instructor'|'mentor',
 * 'me', 'centres' => null|list, 'courses' => null|list, 'canWhole' => bool].
 * $p['viaAdmin'] is set by the Control Room route only (require_admin: a
 * console session with its second factor); the portals come through the
 * member route and mentor_gate.
 */
function assignment_staff_gate(array $p): array {
    if (!empty($p['viaAdmin'])) {
        $g = admin_cap_gate_any($p, ['content', 'curriculum', 'club']);
        if (!$g['ok']) return $g;
        return ['ok' => true, 'who' => 'admin', 'me' => (string)$g['requester']['memberId'], 'name' => (string)($g['requester']['fullName'] ?? ''),
                'centres' => admin_centre_names_in_scope($g['requester']), 'courses' => null, 'canWhole' => true];
    }
    $g = function_exists('mentor_gate') ? mentor_gate($p) : ['ok' => false, 'error' => 'forbidden'];
    if (empty($g['ok'])) return ['ok' => false, 'error' => (string)($g['error'] ?? 'forbidden')];
    $role = (string)($g['role'] ?? '');
    return ['ok' => true, 'who' => $role === 'admin' ? 'admin' : ($role === 'instructor' ? 'instructor' : 'mentor'),
            'me' => (string)($g['member']['memberId'] ?? ''), 'name' => (string)($g['member']['fullName'] ?? ($g['mentor']['fullName'] ?? '')),
            'centres' => $g['centres'] ?? null, 'courses' => $g['courses'] ?? null, 'canWhole' => $role === 'admin'];
}

function assignment_in_reach(array $g, array $a): bool {
    $course = trim((string)($a['track'] ?? ''));
    $centre = trim((string)($a['centre'] ?? ''));
    if ($course === '' || $course === 'All') { if (empty($g['canWhole'])) return false; }
    elseif ($g['courses'] !== null && !in_array(mb_strtolower($course), array_map('mb_strtolower', $g['courses']), true)) return false;
    if ($g['centres'] !== null) {
        if ($centre === '' || $centre === 'All' || $centre === 'Both') return false;   // "every centre" is wider than a scoped reach
        if (!in_array($centre, $g['centres'], true)) return false;
    }
    return true;
}

/** May they mark it? Their course, set for their centre or for every centre — each hand-in is then checked against their centre. */
function assignment_can_mark(array $g, array $a): bool {
    if (assignment_in_reach($g, $a)) return true;
    $course = trim((string)($a['track'] ?? ''));
    if ($course === '' || $course === 'All') return false;
    if ($g['courses'] !== null && !in_array(mb_strtolower($course), array_map('mb_strtolower', $g['courses']), true)) return false;
    return in_array(trim((string)($a['centre'] ?? '')), ['', 'All', 'Both'], true);
}

/** May this marker touch this member's submission? Their centre must be in reach. */
function assignment_member_in_reach(array $g, string $memberId): bool {
    if ($g['centres'] === null) return true;
    $m = db_row('SELECT centre FROM members WHERE memberId = ?', [$memberId]);
    return $m && in_array((string)$m['centre'], $g['centres'], true);
}


/* ── What a hand-in may carry ────────────────────────────────────────────── */

/** The success-criteria steps, cleaned: at most ASG_STEPS_MAX short lines. */
function assignment_steps_clean($v): array {
    $list = is_array($v) ? $v : preg_split('/\r?\n/', (string)$v);
    $out = [];
    foreach ($list ?: [] as $x) { $x = trim(preg_replace('/^\s*(?:[-*•]|\d+[.)])\s*/u', '', (string)$x)); if ($x !== '') $out[] = mb_substr($x, 0, 200); }
    return array_slice(array_values(array_unique($out)), 0, ASG_STEPS_MAX);
}

/** What a link points at, in words a member recognises ('' when it is just a website). */
function assignment_link_kind(string $url): string {
    $h = strtolower((string)parse_url($url, PHP_URL_HOST)); $path = (string)parse_url($url, PHP_URL_PATH);
    if ($h === 'docs.google.com') {
        foreach (['/document/' => 'Google Doc', '/spreadsheets/' => 'Google Sheet', '/presentation/' => 'Google Slides', '/forms/' => 'Google Form', '/drawings/' => 'Google Drawing'] as $k => $l) if (str_contains($path, $k)) return $l;
        return 'Google Docs';
    }
    $map = ['drive.google.com' => 'Google Drive', 'forms.gle' => 'Google Form', 'lookerstudio.google.com' => 'Looker Studio', 'datastudio.google.com' => 'Looker Studio',
            'canva.com' => 'Canva design', 'github.com' => 'GitHub', 'youtube.com' => 'YouTube video', 'youtu.be' => 'YouTube video', 'trello.com' => 'Trello board',
            'figma.com' => 'Figma', 'airtable.com' => 'Airtable', 'replit.com' => 'Replit', 'codepen.io' => 'CodePen', 'scratch.mit.edu' => 'Scratch project',
            'app.diagrams.net' => 'draw.io diagram', 'drawio.com' => 'draw.io diagram', 'soundcloud.com' => 'SoundCloud', 'vimeo.com' => 'Vimeo video',
            'tiktok.com' => 'TikTok', 'instagram.com' => 'Instagram', 'notion.so' => 'Notion', 'bandlab.com' => 'BandLab', 'musescore.com' => 'MuseScore',
            'make.com' => 'Make scenario', 'onedrive.live.com' => 'OneDrive', 'dropbox.com' => 'Dropbox', 'netlify.app' => 'Website', 'github.io' => 'Website', 'vercel.app' => 'Website'];
    foreach ($map as $d => $l) if ($h === $d || str_ends_with($h, '.' . $d)) return $l;
    return '';
}

/** A file on a hand-in: an https (or this site's own /) link, its name, and what sort of thing it is. */
function assignment_file_clean($f): ?array {
    if (is_string($f)) $f = ['url' => $f];
    if (!is_array($f)) return null;
    $url = trim((string)($f['url'] ?? ''));
    /* https, or this site's own uploaded-file endpoint — never another
     * same-origin path (an <img src="/api/auth/logout.php"> signs the marker
     * out), and never a backslash, which browsers read as "//elsewhere". */
    if ($url === '' || strpbrk($url, "\\ \t\r\n\"'<>") !== false) return null;
    if (!preg_match('#^https://[a-z0-9.-]+(:\d+)?/#i', $url) && !preg_match('#^/api/member/curriculum-file\.php\?f=[a-f0-9]{16,64}\.[a-z0-9]{2,5}$#', $url)) return null;
    $name = mb_substr(trim((string)($f['name'] ?? '')), 0, 160) ?: basename((string)parse_url($url, PHP_URL_PATH));
    $ext = strtolower(pathinfo($name !== '' ? $name : $url, PATHINFO_EXTENSION));
    $kind = in_array($ext, ASG_EXT['photo'], true) ? 'photo' : (in_array($ext, ASG_EXT['recording'], true) ? 'recording' : (string)($f['kind'] ?? 'file'));
    if (!in_array($kind, ['photo', 'recording', 'file'], true)) $kind = 'file';
    if ($kind === 'file' && in_array((string)($f['kind'] ?? ''), ['photo', 'recording'], true)) $kind = (string)$f['kind'];
    return ['url' => $url, 'name' => $name, 'kind' => $kind];
}

/** The assignment's hand-in rules, for both screens. */
function assignment_proof_public(array $a): array {
    $proof = in_array((string)($a['proof'] ?? ''), ASG_PROOFS, true) ? (string)$a['proof'] : 'text';
    return ['proof' => $proof, 'proofLabel' => ASG_PROOF_META[$proof]['label'], 'proofHint' => ASG_PROOF_META[$proof]['hint'],
            'steps' => assignment_steps_clean(json_decode((string)($a['steps'] ?? ''), true) ?: [])];
}

/**
 * The kind of hand-in a lesson calls for, read from the lesson itself: a
 * Sheets or Docs lesson hands in a link, a music lesson a recording, a design
 * or photo lesson a photo. The steps are the lesson's own success criteria.
 */
function assignment_infer_from_unit(array $u): array {
    $t = mb_strtolower((string)$u['course'] . ' ' . (string)$u['title'] . ' ' . mb_substr((string)$u['body'], 0, 1500));
    $proof = 'any';
    if (preg_match('/google (docs|sheets|slides|forms|drive|calendar)|looker|trello|canva|github|airtable|draw\.io|figma|replit|codepen|scratch|make\b/u', $t)) $proof = 'link';
    elseif (preg_match('/piano|guitar|keyboard|drum|violin|sing|vocal|recording|record it|perform|podcast|voice/u', $t)) $proof = 'recording';
    elseif (preg_match('/photo|poster|drawing|sketch|craft|adire|design|portrait/u', $t)) $proof = 'photo';
    $steps = [];
    if (preg_match('/##\s*Success criteria\s*\n+(.+?)(?:\n##|$)/su', (string)$u['body'], $h)) $steps = assignment_steps_clean($h[1]);
    return ['proof' => $proof, 'steps' => $steps];
}

/* ── The member's side ───────────────────────────────────────────────────── */

function assignment_public_sub(?array $sub): ?array {
    if (!$sub) return null;
    $files = array_values(array_filter(array_map('assignment_file_clean', json_decode((string)($sub['filesJson'] ?? ''), true) ?: [])));
    if (!$files && trim((string)($sub['fileUrl'] ?? '')) !== '') $files = array_values(array_filter([assignment_file_clean(['url' => (string)$sub['fileUrl']])]));
    foreach ($files as &$f) $f['url'] = normalize_image_url($f['url']);
    unset($f);
    $link = (string)($sub['linkUrl'] ?? '');
    return ['submissionId' => $sub['submissionId'], 'status' => $sub['status'] ?: 'submitted',
        'text' => $sub['answerText'] ?: '', 'fileUrl' => normalize_image_url($sub['fileUrl'] ?? ''),
        'files' => $files, 'linkUrl' => $link, 'linkKind' => $link !== '' ? assignment_link_kind($link) : '',
        'steps' => array_values(array_map('intval', json_decode((string)($sub['stepsJson'] ?? ''), true) ?: [])),
        'grade' => ($sub['grade'] === null || $sub['grade'] === '') ? null : (int)$sub['grade'],
        'feedback' => $sub['feedback'] ?: '', 'submittedAt' => $sub['submittedAt'] ?: '', 'gradedAt' => $sub['gradedAt'] ?: ''];
}

function assignment_list_for_member(array $p): array {
    assignment_auto_tick();
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];
    $sid = assignment_session_id();
    $subs = [];
    foreach (db_all('SELECT * FROM assignment_submissions WHERE memberId = ?', [$memberId]) as $r) $subs[$r['assignmentId']] = $r;
    $now = time(); $ctx = null; $out = [];
    $placed = [$memberId => (int)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [$memberId, CURR_YEAR_KEY])['stateValue'] ?? 0)];
    foreach (db_all("SELECT * FROM assignments WHERE status IN ('published','closed') ORDER BY COALESCE(NULLIF(dueAt,''), createdAt)") as $a) {
        $sub = $subs[$a['assignmentId']] ?? null;
        // A closed assignment stays on the list only for the people who handed something in.
        if ($a['status'] === 'closed' && !$sub) continue;
        if (!$sub && !assignment_matches_member($a, $member, $sid, $ctx, $placed)) continue;
        $due = assignment_due_ts($a);
        $state = $sub ? ((string)$sub['status'] === 'graded' ? 'marked' : ((string)$sub['status'] === 'returned' ? 'returned' : 'submitted'))
                      : ($a['status'] === 'closed' ? 'closed' : ($due && $due < $now ? 'late' : 'todo'));
        $out[] = [
            'assignmentId' => $a['assignmentId'], 'title' => $a['title'], 'instructions' => $a['instructions'] ?: '',
            'track' => $a['track'] ?: '', 'week' => (int)$a['week'], 'dueAt' => $a['dueAt'] ?: '',
            'points' => (int)$a['points'], 'unitId' => (string)($a['unitId'] ?? ''),
            'attachmentUrl' => normalize_image_url($a['attachmentUrl'] ?? ''),
            'state' => $state, 'dueInDays' => $due ? (int)floor(($due - $now) / 86400) : null,
            'canSubmit' => $a['status'] === 'published' && (!$sub || in_array((string)$sub['status'], ['submitted', 'returned'], true)),
            'late' => $sub ? ($due && strtotime((string)$sub['submittedAt']) > $due) : ($due && $due < $now),
            'submission' => assignment_public_sub($sub),
        ] + assignment_proof_public($a);
    }
    return ['ok' => true, 'assignments' => $out, 'filesMax' => ASG_FILES_MAX];
}

function assignment_submit(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $assignmentId = (string)($p['assignmentId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'member_not_found'];
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$assignmentId]);
    if (!$a) return ['ok' => false, 'error' => 'assignment_not_found'];
    if ((string)$a['status'] !== 'published') return ['ok' => false, 'error' => 'not_open'];
    $existing = db_row('SELECT * FROM assignment_submissions WHERE assignmentId = ? AND memberId = ? LIMIT 1', [$assignmentId, $memberId]);
    // Somebody else's work is not yours to hand in: the id alone is not enough.
    if (!$existing && !assignment_matches_member($a, $member, assignment_session_id())) return ['ok' => false, 'error' => 'not_for_you'];
    if ($existing && (string)$existing['status'] === 'graded') return ['ok' => false, 'error' => 'already_graded'];

    $text = mb_substr(trim((string)($p['text'] ?? '')), 0, ASG_TEXT_MAX);
    $rawFiles = is_array($p['files'] ?? null) ? $p['files'] : [];
    if (trim((string)($p['fileUrl'] ?? '')) !== '') $rawFiles[] = ['url' => (string)$p['fileUrl'], 'name' => (string)($p['fileName'] ?? '')];
    if (count($rawFiles) > ASG_FILES_MAX) return ['ok' => false, 'error' => 'too_many_files', 'max' => ASG_FILES_MAX];
    $files = [];
    foreach ($rawFiles as $f) { $c = assignment_file_clean($f); if (!$c) return ['ok' => false, 'error' => 'bad_file']; $files[] = $c; }
    $link = trim((string)($p['linkUrl'] ?? ''));
    if ($link !== '' && (!preg_match('#^https://[^\s/$.?\#].[^\s]*$#i', $link) || mb_strlen($link) > 1000)) return ['ok' => false, 'error' => 'bad_link', 'detail' => 'A link that starts with https://'];
    $rules = assignment_proof_public($a);
    $proof = $rules['proof'];
    $ticked = array_values(array_unique(array_filter(array_map('intval', is_array($p['steps'] ?? null) ? $p['steps'] : []), fn($i) => $i >= 0 && $i < count($rules['steps']))));
    sort($ticked);
    $has = ['text' => $text !== '', 'file' => (bool)$files, 'link' => $link !== ''];
    $kinds = array_column($files, 'kind');
    $err = null;
    if (!$has['text'] && !$has['file'] && !$has['link'] && !($proof === 'checklist' && $ticked)) $err = 'empty_submission';
    elseif ($proof === 'text' && !$has['text']) $err = 'text_required';
    elseif ($proof === 'file' && !$has['file']) $err = 'file_required';
    elseif ($proof === 'photo' && !in_array('photo', $kinds, true)) $err = 'photo_required';
    elseif ($proof === 'recording' && !in_array('recording', $kinds, true)) $err = 'recording_required';
    elseif ($proof === 'link' && !$has['link']) $err = 'link_required';
    elseif ($proof === 'either' && !$has['text'] && !$has['file']) $err = 'text_or_file_required';
    // The success criteria are the member's own check: every step ticked before it goes in.
    if (!$err && $rules['steps'] && count($ticked) < count($rules['steps'])) $err = 'steps_incomplete';
    if ($err) return ['ok' => false, 'error' => $err, 'steps' => count($rules['steps']), 'ticked' => count($ticked)];
    $fileUrl = $files[0]['url'] ?? '';
    $row = ['answerText' => $text, 'fileUrl' => $fileUrl, 'linkUrl' => $link, 'filesJson' => $files ? json_encode($files, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '',
            'stepsJson' => $ticked ? json_encode($ticked) : '', 'status' => 'submitted', 'submittedAt' => now_iso()];

    $sessionId = (string)($a['sessionId'] ?: assignment_session_id());
    if ($existing) {
        db_update('assignment_submissions', $row, ['id' => $existing['id']]);
    } else {
        db_insert('assignment_submissions', $row + [
            'submissionId' => 'SUB-' . gmdate('Y') . '-' . rand_hex(4), 'assignmentId' => $assignmentId,
            'memberId' => $memberId, 'sessionId' => $sessionId,
            'grade' => null, 'feedback' => '', 'gradedBy' => '', 'gradedAt' => '', 'createdAt' => now_iso(),
        ]);
    }
    $due = assignment_due_ts($a);
    audit('assignment.submit', $memberId, $assignmentId, ['late' => $due && time() > $due, 'resubmit' => (bool)$existing], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'late' => $due && time() > $due];
}

/* ── The staff side ──────────────────────────────────────────────────────── */

function assignment_row_public(array $a, array $counts, bool $canEdit): array {
    $k = $counts[$a['assignmentId']] ?? [];
    return [
        'assignmentId' => $a['assignmentId'], 'title' => $a['title'], 'instructions' => $a['instructions'] ?: '',
        'track' => $a['track'] ?: '', 'centre' => $a['centre'] ?: '', 'sessionId' => $a['sessionId'] ?: '',
        'week' => (int)$a['week'], 'dueAt' => $a['dueAt'] ?: '', 'points' => (int)$a['points'],
        'attachmentUrl' => $a['attachmentUrl'] ?: '', 'status' => $a['status'] ?: 'draft',
        'unitId' => (string)($a['unitId'] ?? ''), 'remindedAt' => (string)($a['remindedAt'] ?? ''),
        'submissionCount' => (int)($k['c'] ?? 0), 'gradedCount' => (int)($k['g'] ?? 0), 'toMark' => (int)($k['m'] ?? 0),
        'canEdit' => $canEdit, 'overdue' => ($d = assignment_due_ts($a)) > 0 && $d < time(),
        'fromLesson' => (string)($a['createdBy'] ?? '') === 'curriculum',
    ] + assignment_proof_public($a);
}

/** staff.assignments.list — what this person may see, newest first; with counts and their courses. */
function staff_assignments_list(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    assignment_auto_tick();
    $counts = [];
    foreach (db_all("SELECT assignmentId, COUNT(*) c, SUM(CASE WHEN status='graded' THEN 1 ELSE 0 END) g, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) m FROM assignment_submissions GROUP BY assignmentId") as $r) {
        $counts[$r['assignmentId']] = ['c' => (int)$r['c'], 'g' => (int)$r['g'], 'm' => (int)$r['m']];
    }
    $status = (string)($p['status'] ?? '');
    $rows = db_all('SELECT * FROM assignments ORDER BY CASE status WHEN \'published\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END, COALESCE(NULLIF(dueAt,\'\'), createdAt) DESC');
    $out = [];
    foreach ($rows as $a) {
        if ($status !== '' && in_array($status, ASG_STATUSES, true) && $a['status'] !== $status) continue;
        $reach = assignment_in_reach($g, $a);
        // An instructor also sees the whole-Club ones that land on their learners, read-only.
        if (!$reach && !assignment_can_mark($g, $a) && !($g['who'] !== 'admin' && trim((string)$a['track']) === '' && (trim((string)$a['centre']) === '' || $g['centres'] === null || in_array($a['centre'], $g['centres'] ?? [], true)))) continue;
        $out[] = assignment_row_public($a, $counts, $reach);
    }
    $courses = $g['courses'] ?? (function_exists('club_courses') ? club_courses() : []);
    // An admin also sets work for a course that has lessons but is not in the catalogue (an imported programme's "Piano").
    if ($g['courses'] === null) {
        $lower = array_map('mb_strtolower', $courses);
        foreach (db_all("SELECT DISTINCT course FROM curriculum_units WHERE status = 'published' AND course <> '' ORDER BY course") as $r)
            if (!in_array(mb_strtolower((string)$r['course']), $lower, true)) { $courses[] = (string)$r['course']; $lower[] = mb_strtolower((string)$r['course']); }
    }
    $units = [];
    if (function_exists('curriculum_load')) {
        foreach (db_all("SELECT unitId, course, level, week, position, title FROM curriculum_units WHERE status = 'published' ORDER BY course, level, week, position") as $u) {
            if ($g['courses'] !== null && !in_array(mb_strtolower((string)$u['course']), array_map('mb_strtolower', $g['courses']), true)) continue;
            $units[] = ['unitId' => $u['unitId'], 'course' => $u['course'], 'label' => curriculum_path((string)$u['level'], (int)$u['week'])['code'] . ' · ' . $u['title']];
        }
    }
    return ['ok' => true, 'assignments' => $out, 'who' => $g['who'], 'courses' => array_values($courses), 'canWhole' => $g['canWhole'],
            'centres' => $g['centres'] ?? array_column(db_all("SELECT name FROM centres WHERE status = 'active' ORDER BY name"), 'name'),
            'scopedCentres' => $g['centres'] !== null, 'units' => $units,
            'auto' => ['on' => assignment_auto_on(), 'week' => assignment_term_week(function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d')),
                       'canSet' => $g['who'] === 'admin' && !empty($p['viaAdmin'])],
            'aiMarking' => function_exists('ai_enabled') && ai_enabled('marking'),
            'proofs' => array_map(fn($k) => ['id' => $k] + ASG_PROOF_META[$k], array_values(array_diff(ASG_PROOFS, ['either'])))];
}

/** Next Saturday, 23:59 Lagos — the default due date when none is given at publish. */
function assignment_default_due(?int $now = null): string {
    $t = ($now ?? time()) + 3600;
    $dow = (int)gmdate('w', $t);
    $days = (6 - $dow + 7) % 7; if ($days === 0) $days = 7;
    return gmdate('Y-m-d', $t + $days * 86400);
}

/** staff.assignments.save — create or change one; validated whole before writing. */
function staff_assignments_save(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $id = trim((string)($d['assignmentId'] ?? ''));
    $existing = $id !== '' ? db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$id]) : null;
    if ($id !== '' && !$existing) return ['ok' => false, 'error' => 'not_found'];
    if ($existing && !assignment_in_reach($g, $existing)) return ['ok' => false, 'error' => 'out_of_scope'];

    $row = [
        'title' => mb_substr(trim((string)($d['title'] ?? ($existing['title'] ?? ''))), 0, 160),
        'instructions' => mb_substr(trim((string)($d['instructions'] ?? ($existing['instructions'] ?? ''))), 0, 8000),
        'track' => mb_substr(trim((string)($d['track'] ?? ($existing['track'] ?? ''))), 0, 80),
        'centre' => mb_substr(trim((string)($d['centre'] ?? ($existing['centre'] ?? ''))), 0, 80),
        'sessionId' => mb_substr(trim((string)($d['sessionId'] ?? ($existing['sessionId'] ?? ''))), 0, 40),
        'dueAt' => trim((string)($d['dueAt'] ?? ($existing['dueAt'] ?? ''))),
        'points' => (int)($d['points'] ?? ($existing['points'] ?? 10)),
        'proof' => (string)($d['proof'] ?? ($existing['proof'] ?? 'text')),
        'attachmentUrl' => trim((string)($d['attachmentUrl'] ?? ($existing['attachmentUrl'] ?? ''))),
        'unitId' => trim((string)($d['unitId'] ?? ($existing['unitId'] ?? ''))),
        'week' => (int)($d['week'] ?? ($existing['week'] ?? 0)),
        'steps' => json_encode(assignment_steps_clean(array_key_exists('steps', $d) ? $d['steps'] : (json_decode((string)($existing['steps'] ?? ''), true) ?: [])), JSON_UNESCAPED_UNICODE),
        'status' => (string)($d['status'] ?? ($existing['status'] ?? 'draft')),
    ];
    if ($row['track'] === 'All') $row['track'] = '';
    if (in_array($row['centre'], ['All', 'Both'], true)) $row['centre'] = '';
    // An instructor scoped to one centre sets work for that centre, not every centre.
    if ($row['centre'] === '' && $g['centres'] !== null && count($g['centres']) === 1) $row['centre'] = $g['centres'][0];
    $errors = [];
    if (mb_strlen($row['title']) < 3) $errors['title'] = 'Give it a title of at least 3 letters.';
    if ($row['steps'] === '[]') $row['steps'] = '';
    if (!in_array($row['proof'], ASG_PROOFS, true)) $errors['proof'] = 'Choose how it is handed in.';
    if ($row['proof'] === 'checklist' && $row['steps'] === '') $errors['steps'] = 'A checklist needs at least one step.';
    if (!in_array($row['status'], ASG_STATUSES, true)) $errors['status'] = 'Unknown status.';
    if ($row['points'] < 0 || $row['points'] > ASG_POINTS_MAX) $errors['points'] = 'Between 0 and ' . ASG_POINTS_MAX . ' points.';
    if ($row['dueAt'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/', $row['dueAt'])) $errors['dueAt'] = 'A date, like 2026-10-24.';
    if ($row['attachmentUrl'] !== '' && !preg_match('#^https://#i', $row['attachmentUrl'])) $errors['attachmentUrl'] = 'A link that starts with https://';
    if ($row['unitId'] !== '') {
        $u = db_row('SELECT unitId, course, week FROM curriculum_units WHERE unitId = ?', [$row['unitId']]);
        if (!$u) $errors['unitId'] = 'That lesson no longer exists.';
        else {
            // Linked to a lesson: the lesson's course and week, unless one was chosen.
            if ($row['track'] === '') $row['track'] = (string)$u['course'];
            if ($row['week'] === 0) $row['week'] = (int)$u['week'];
        }
    }
    if (!assignment_in_reach($g, $row)) $errors[$row['track'] === '' ? 'track' : ($g['centres'] !== null && !in_array($row['centre'], $g['centres'] ?? [], true) ? 'centre' : 'track')] =
        $row['track'] === '' ? 'Only an admin sets work for the whole Club. Choose your course.' : 'That is outside the courses and centre you teach.';
    if ($row['status'] === 'published' && $row['instructions'] === '') $errors['instructions'] = 'Say what to do before you publish it.';
    if ($errors) return ['ok' => false, 'error' => 'invalid', 'fieldErrors' => $errors];
    if ($row['status'] === 'published' && $row['dueAt'] === '') $row['dueAt'] = assignment_default_due();

    $wasPublished = $existing && (string)$existing['status'] === 'published';
    $row['updatedAt'] = now_iso();
    if ($existing) {
        db_update('assignments', $row, ['id' => $existing['id']]);
        audit('assignment.update', $g['me'], $id, ['status' => $row['status']], (string)($p['ip'] ?? ''));
    } else {
        $id = 'ASG-' . gmdate('Y') . '-' . rand_hex(4);
        db_insert('assignments', $row + ['assignmentId' => $id, 'createdBy' => $g['me'], 'createdAt' => now_iso()]);
        audit('assignment.create', $g['me'], $id, ['status' => $row['status']], (string)($p['ip'] ?? ''));
    }
    $reached = null;
    if ($row['status'] === 'published' && !$wasPublished) $reached = notify_assignment_published($id, !empty($p['email']));
    return ['ok' => true, 'assignmentId' => $id, 'dueAt' => $row['dueAt'], 'notified' => $reached];
}

/** staff.assignments.audience — who it would reach, before it is published. */
function staff_assignments_audience(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $a = ['track' => trim((string)($p['track'] ?? '')), 'centre' => trim((string)($p['centre'] ?? '')), 'sessionId' => trim((string)($p['sessionId'] ?? ''))];
    if ($a['centre'] === '' && $g['centres'] !== null && count($g['centres']) === 1) $a['centre'] = $g['centres'][0];
    $aud = assignment_audience($a);
    if ($g['centres'] !== null) $aud = array_values(array_filter($aud, fn($m) => in_array((string)$m['centre'], $g['centres'], true)));
    return ['ok' => true, 'count' => count($aud), 'sample' => array_map(fn($m) => (string)$m['fullName'], array_slice($aud, 0, 6)),
            'centres' => array_count_values(array_map(fn($m) => (string)$m['centre'], $aud))];
}

/** staff.assignments.submissions — what came in, and who has not handed anything in. */
function staff_assignment_submissions(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [(string)($p['assignmentId'] ?? '')]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    $reach = assignment_in_reach($g, $a);
    // An assignment id is not a key: outside their courses and centre, nothing comes back.
    if (!$reach && !assignment_can_mark($g, $a) && $g['who'] !== 'admin') return ['ok' => false, 'error' => 'out_of_scope'];
    $due = assignment_due_ts($a);
    $names = [];
    foreach (db_all('SELECT s.*, m.fullName, m.centre FROM assignment_submissions s LEFT JOIN members m ON m.memberId = s.memberId WHERE s.assignmentId = ? ORDER BY s.submittedAt DESC', [$a['assignmentId']]) as $r) {
        if ($g['centres'] !== null && !in_array((string)$r['centre'], $g['centres'], true)) continue;
        $names[] = ['memberId' => $r['memberId'], 'memberName' => $r['fullName'] ?: $r['memberId'], 'centre' => (string)($r['centre'] ?? '')]
            + assignment_public_sub($r) + ['late' => $due && strtotime((string)$r['submittedAt']) > $due];
    }
    $handed = array_flip(array_column($names, 'memberId'));
    $missing = [];
    if ($a['status'] !== 'draft') {
        foreach (assignment_audience($a) as $m) {
            if (isset($handed[$m['memberId']])) continue;
            if ($g['centres'] !== null && !in_array((string)$m['centre'], $g['centres'], true)) continue;
            $missing[] = ['memberId' => $m['memberId'], 'memberName' => $m['fullName'], 'centre' => $m['centre']];
        }
    }
    return ['ok' => true, 'canMark' => $reach || $g['who'] === 'admin' || assignment_can_mark($g, $a),
            'assignment' => assignment_row_public($a, [], $reach), 'submissions' => $names, 'missing' => $missing,
            'aiMarking' => function_exists('ai_enabled') && ai_enabled('marking')];
}

function staff_assignment_submission_gate(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM assignment_submissions WHERE submissionId = ? LIMIT 1', [(string)($p['submissionId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$row['assignmentId']]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if (!(assignment_can_mark($g, $a) || $g['who'] === 'admin') || !assignment_member_in_reach($g, (string)$row['memberId'])) return ['ok' => false, 'error' => 'out_of_scope'];
    return ['ok' => true, 'g' => $g, 'row' => $row, 'a' => $a];
}

/** staff.assignment.grade — a mark and feedback, told to the member. */
function staff_assignment_grade(array $p): array {
    global $CONFIG;
    $x = staff_assignment_submission_gate($p); if (!$x['ok']) return $x;
    ['g' => $g, 'row' => $row, 'a' => $a] = $x;
    $max = (int)$a['points'];
    if (!isset($p['grade']) || $p['grade'] === '' || !is_numeric($p['grade'])) return ['ok' => false, 'error' => 'grade_required'];
    $grade = (int)$p['grade'];
    if ($grade < 0 || ($max > 0 && $grade > $max)) return ['ok' => false, 'error' => 'grade_out_of_range', 'detail' => 'Between 0 and ' . $max . '.'];
    $feedback = mb_substr(trim((string)($p['feedback'] ?? '')), 0, 4000);
    db_update('assignment_submissions', ['status' => 'graded', 'grade' => $grade, 'feedback' => $feedback, 'gradedBy' => $g['me'], 'gradedAt' => now_iso()], ['id' => $row['id']]);
    push_notification((string)$row['memberId'], ['kind' => 'announcement', 'title' => 'Assignment marked: ' . $a['title'],
        'body' => 'You scored ' . $grade . ($max ? '/' . $max : '') . '. Tap to see the feedback.', 'linkPage' => 'dashboard']);
    if (!empty($p['email'])) {
        $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$row['memberId']]);
        if ($member && $member['email']) {
            send_mail((string)$member['email'], 'Your assignment was marked · ' . $a['title'], email_template([
                'title' => 'Assignment marked', 'intro' => $a['title'] . ' has been reviewed.',
                'bodyHtml' => '<p style="margin:0 0 8px;font-size:20px"><strong>' . $grade . ($max ? '/' . $max : '') . '</strong></p>' . ($feedback ? '<p style="margin:0;color:#4a5170">' . nl2br(esc_html($feedback)) . '</p>' : ''),
                'ctaLabel' => 'See your dashboard', 'ctaUrl' => ($CONFIG['app_origin'] ?? '') . '/dashboard/learn',
            ]));
        }
    }
    audit('assignment.grade', $g['me'], (string)$row['submissionId'], ['grade' => $grade, 'by' => $g['who']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** staff.assignment.return — back to the member to revise, with what to change. */
function staff_assignment_return(array $p): array {
    $x = staff_assignment_submission_gate($p); if (!$x['ok']) return $x;
    ['g' => $g, 'row' => $row, 'a' => $a] = $x;
    $feedback = mb_substr(trim((string)($p['feedback'] ?? '')), 0, 4000);
    if ($feedback === '') return ['ok' => false, 'error' => 'feedback_required', 'detail' => 'Say what to change, so they can.'];
    db_update('assignment_submissions', ['status' => 'returned', 'feedback' => $feedback, 'gradedBy' => $g['me'], 'gradedAt' => now_iso()], ['id' => $row['id']]);
    push_notification((string)$row['memberId'], ['kind' => 'announcement', 'title' => 'Revise and resubmit: ' . $a['title'],
        'body' => 'Feedback: ' . mb_substr($feedback, 0, 140) . ' Tap to resubmit.', 'linkPage' => 'dashboard']);
    audit('assignment.return', $g['me'], (string)$row['submissionId'], ['by' => $g['who']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * staff.assignment.suggest — a mark and feedback drafted by a capable model
 * against the instructions, for the marker to accept, change or ignore. It
 * never writes: a person marks the work.
 */
function staff_assignment_suggest(array $p): array {
    $x = staff_assignment_submission_gate($p); if (!$x['ok']) return $x;
    ['row' => $row, 'a' => $a] = $x;
    if (!function_exists('ai_enabled') || !ai_enabled('marking')) return ['ok' => false, 'error' => 'ai_unavailable', 'detail' => (function_exists('ai_route_note') ? ai_route_note('marking') : '') ?: 'No capable AI model is set up for marking. Add one under Settings → API keys.'];
    $text = trim((string)$row['answerText']);
    if ($text === '') return ['ok' => false, 'error' => 'nothing_to_read', 'detail' => 'This submission is a file only. Open it and mark it yourself.'];
    $max = max(1, (int)$a['points']);
    $r = ai_classify('You are an experienced, fair and kind teacher marking work by a 10–17 year old in the NGG Club, a Nigerian youth programme. '
        . 'Mark ONLY against the assignment instructions. Be specific and encouraging: one thing done well, one thing to improve, one next step. '
        . 'Never mention that you are an AI. Reply as JSON: {"grade": integer 0..' . $max . ', "feedback": "2–4 short sentences, speaking to the learner as you", "confidence": "high"|"low"}.',
        json_encode(['assignment' => $a['title'], 'instructions' => (string)$a['instructions'], 'points' => $max, 'answer' => mb_substr($text, 0, 6000)], JSON_UNESCAPED_SLASHES),
        500, 'marking');
    if (empty($r['ok']) || !is_array($r['data'] ?? null)) return ['ok' => false, 'error' => 'ai_failed', 'detail' => 'The model did not answer. Mark it yourself.'];
    $grade = max(0, min($max, (int)($r['data']['grade'] ?? 0)));
    return ['ok' => true, 'grade' => $grade, 'feedback' => mb_substr(trim((string)($r['data']['feedback'] ?? '')), 0, 1200),
            'confidence' => (string)($r['data']['confidence'] ?? 'low') === 'high' ? 'high' : 'low'];
}

/**
 * staff.assignments.draft — an assignment drafted from a curriculum lesson, for
 * the staff member to read and save. The lesson's own "This week's assignment",
 * objectives and marked task are lifted as they are (works with no AI at all);
 * with a capable model the instructions are rewritten as clear steps with
 * success criteria. It never writes.
 */
/** A lesson's own "This week's assignment" section, or ''. */
function assignment_unit_task(array $u): string {
    return preg_match("/##\s*This week(?:'|’)s assignment\s*\n+(.+?)(?:\n##|\n>|$)/su", (string)$u['body'], $h) ? trim($h[1]) : '';
}

/** The assignment a lesson sets, lifted as written: its task, objectives and marking. No AI. */
function assignment_draft_from_unit(array $u): array {
    $task = assignment_unit_task($u);
    $objectives = array_values(array_filter(array_map('strval', json_decode((string)($u['objectives'] ?? '[]'), true) ?: [])));
    $rubric = (string)(db_row("SELECT rubric FROM curriculum_checks WHERE unitId = ? AND kind IN ('task','project','essay','code') AND rubric <> '' ORDER BY position LIMIT 1", [(string)$u['unitId']])['rubric'] ?? '');
    $lines = [$task !== '' ? $task : ('Show what you learned in "' . $u['title'] . '".')];
    if ($objectives) $lines[] = "\nBy the end you should be able to:\n" . implode("\n", array_map(fn($o) => '- ' . preg_replace('/^You will /i', '', $o), $objectives));
    $lines[] = "\nHand in: what you made or practised, and one thing that is still hard.";
    if ($rubric !== '') $lines[] = "\nHow it is marked: " . $rubric;
    return ['title' => mb_substr('Week ' . (int)$u['week'] . ': ' . ($task !== '' ? preg_replace('/[.:].*$/su', '', $task) : $u['title']), 0, 120),
            'instructions' => trim(implode("\n", $lines)), 'track' => (string)$u['course'], 'week' => (int)$u['week'], 'unitId' => (string)$u['unitId'],
            'points' => 10, 'dueAt' => assignment_default_due()] + assignment_infer_from_unit($u);
}

/* ── Lessons set their own homework ─────────────────────────────────────────
 *
 * A published lesson that says "This week's assignment" sets it, by itself,
 * when its week of the term begins: one published assignment per lesson, due
 * when the lesson is due (curriculum_due_date), for the lesson's course and
 * year, at every centre. Before this, a lesson's homework reached members only
 * if a member of staff re-typed it on the desk, so a member saw the lesson and
 * an empty Assignments list. A lesson that already has an assignment (set by
 * hand, or issued before) is left alone; staff can edit, close or delete an
 * issued one like any other. Off with the `assignments_auto` setting.
 */
const ASG_AUTO_KEY = 'assignments_auto';

function assignment_auto_on(): bool {
    $v = function_exists('setting_get') ? setting_get(ASG_AUTO_KEY) : null;
    return is_array($v) && array_key_exists('on', $v) ? !empty($v['on']) : true;   // on unless an admin turned it off
}

/** The week of the term that $today falls in (1-based), or 0 when no term is set or it has not begun. */
function assignment_term_week(string $today): int {
    if (!function_exists('curriculum_schedule')) return 0;
    $start = (string)curriculum_schedule()['startDate'];
    if ($start === '' || $today < $start) return 0;
    return intdiv((int)((strtotime($today . ' UTC') - strtotime($start . ' UTC')) / 86400), 7) + 1;
}

function assignment_auto_issue(?string $today = null): array {
    if (!assignment_auto_on()) return ['ok' => true, 'issued' => 0, 'skipped' => 'off'];
    $today = $today ?? (function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'));
    $week = assignment_term_week($today);
    if ($week < 1) return ['ok' => true, 'issued' => 0, 'skipped' => 'no_term'];
    $start = (string)curriculum_schedule()['startDate'];
    $have = [];
    foreach (db_all("SELECT unitId FROM assignments WHERE unitId <> ''") as $r) $have[(string)$r['unitId']] = true;
    $issued = [];
    // This week's lessons, and last week's if they were never issued (a term set up mid-week).
    foreach (db_all("SELECT * FROM curriculum_units WHERE status = 'published' AND week IN (?, ?) ORDER BY week, course, position", [$week, max(1, $week - 1)]) as $u) {
        if (isset($have[(string)$u['unitId']]) || assignment_unit_task($u) === '') continue;
        $due = curriculum_due_date($start, (int)$u['week']);
        if ($due !== '' && $due < $today) continue;   // its week is over: issuing it now would be late on arrival
        $d = assignment_draft_from_unit($u);
        $id = 'ASG-' . gmdate('Y') . '-' . rand_hex(4);
        $now = now_iso();
        db_insert('assignments', ['assignmentId' => $id, 'title' => $d['title'], 'instructions' => $d['instructions'], 'track' => (string)$u['course'], 'centre' => '',
            'sessionId' => assignment_session_id(), 'dueAt' => $due ?: assignment_default_due(), 'points' => 10, 'proof' => in_array($d['proof'], ASG_PROOFS, true) ? $d['proof'] : 'any',
            'attachmentUrl' => '', 'unitId' => (string)$u['unitId'], 'week' => (int)$u['week'], 'steps' => $d['steps'] ? json_encode($d['steps'], JSON_UNESCAPED_UNICODE) : '',
            'status' => 'published', 'createdBy' => 'curriculum', 'createdAt' => $now, 'updatedAt' => $now]);
        $have[(string)$u['unitId']] = true;
        $issued[] = $id;
        notify_assignment_published($id, false);
    }
    if ($issued) audit('assignment.auto_issue', 'curriculum', '', ['issued' => count($issued), 'week' => $week, 'ids' => $issued], '');
    return ['ok' => true, 'issued' => count($issued), 'week' => $week, 'ids' => $issued];
}

/** staff.assignments.auto — an admin turns "lessons set their own homework" on or off; on issues this week's now. */
function staff_assignments_auto(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    if ($g['who'] !== 'admin' || empty($p['viaAdmin'])) return ['ok' => false, 'error' => 'forbidden'];
    $on = !empty($p['on']);
    setting_set(ASG_AUTO_KEY, ['on' => $on], (string)$g['me']);
    audit('assignment.auto_' . ($on ? 'on' : 'off'), (string)$g['me'], '', [], (string)($p['ip'] ?? ''));
    $r = $on ? assignment_auto_issue() : ['issued' => 0];
    return ['ok' => true, 'on' => $on, 'issued' => (int)($r['issued'] ?? 0), 'week' => (int)($r['week'] ?? 0), 'skipped' => (string)($r['skipped'] ?? '')];
}

/** Run the issue at most once an hour from a page view, so nobody waits for the nightly job. */
function assignment_auto_tick(): void {
    try {
        if (!assignment_auto_on()) return;
        // Settings are JSON objects (setting_get reads a bare number as nothing), so the stamp is one too.
        $last = (int)((setting_get('assignments_auto_at') ?: [])['at'] ?? 0);
        if ($last > time() - 3600) return;
        setting_set('assignments_auto_at', ['at' => time()]);
        assignment_auto_issue();
    } catch (\Throwable $e) {}
}

function staff_assignments_draft(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $u = db_row("SELECT * FROM curriculum_units WHERE unitId = ? AND status = 'published'", [(string)($p['unitId'] ?? '')]);
    if (!$u) return ['ok' => false, 'error' => 'not_found', 'detail' => 'Choose a published lesson.'];
    if ($g['courses'] !== null && !in_array(mb_strtolower((string)$u['course']), array_map('mb_strtolower', $g['courses']), true))
        return ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'That lesson is outside the courses you teach.'];
    $body = (string)$u['body'];
    $task = assignment_unit_task($u);
    $objectives = array_values(array_filter(array_map('strval', json_decode((string)($u['objectives'] ?? '[]'), true) ?: [])));
    $rubric = (string)(db_row("SELECT rubric FROM curriculum_checks WHERE unitId = ? AND kind IN ('task','project','essay','code') AND rubric <> '' ORDER BY position LIMIT 1", [(string)$u['unitId']])['rubric'] ?? '');
    $draft = assignment_draft_from_unit($u);
    $via = 'lesson';
    if (!empty($p['ai']) && function_exists('ai_enabled') && ai_enabled('marking')) {
        $r = ai_classify('You write homework for 10–17 year olds in the NGG Club, a Nigerian youth programme. From the lesson given, write ONE assignment that '
            . 'practises the lesson, can be done at home in under an hour a day, and can be evidenced (a note, a photo or a recording). '
            . 'Reply as JSON: {"title": "under 70 characters", "instructions": "3–6 numbered steps, then a line starting \"Success looks like:\" with 2–3 criteria", "proof": "text"|"file"|"either"}.',
            json_encode(['course' => $u['course'], 'level' => $u['level'], 'week' => (int)$u['week'], 'title' => $u['title'], 'objectives' => $objectives,
                         'lessonAssignment' => $task, 'rubric' => $rubric, 'lesson' => mb_substr($body, 0, 5000)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 700, 'marking');
        if (!empty($r['ok']) && is_array($r['data'] ?? null) && trim((string)($r['data']['instructions'] ?? '')) !== '') {
            $draft['title'] = mb_substr(trim((string)($r['data']['title'] ?? $draft['title'])) ?: $draft['title'], 0, 120);
            $draft['instructions'] = mb_substr(trim((string)$r['data']['instructions']), 0, 4000);
            if (in_array($r['data']['proof'] ?? '', ASG_PROOFS, true)) $draft['proof'] = (string)$r['data']['proof'];
            $via = 'ai';
        }
    }
    return ['ok' => true, 'draft' => $draft, 'via' => $via, 'aiAvailable' => function_exists('ai_enabled') && ai_enabled('marking')];
}

/** staff.assignments.remind — those who have not handed anything in; once a day at most. */
function staff_assignments_remind(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [(string)($p['assignmentId'] ?? '')]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if (!assignment_in_reach($g, $a)) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$a['status'] !== 'published') return ['ok' => false, 'error' => 'not_open'];
    $last = strtotime((string)($a['remindedAt'] ?? '')) ?: 0;
    if ($last > time() - ASG_REMIND_QUIET && empty($p['force'])) return ['ok' => false, 'error' => 'quiet_period', 'detail' => 'They were reminded in the last 24 hours.'];
    $sub = sub_ids_for($a['assignmentId']);
    $targets = array_values(array_filter(assignment_audience($a), fn($m) => !isset($sub[$m['memberId']])
        && ($g['centres'] === null || in_array((string)$m['centre'], $g['centres'], true))));
    $due = assignment_due_ts($a);
    foreach ($targets as $m) push_notification((string)$m['memberId'], ['kind' => 'announcement', 'title' => 'Reminder: ' . $a['title'],
        'body' => ($due ? ($due < time() ? 'This was due ' . gmdate('D j M', $due) . '. ' : 'Due ' . gmdate('D j M', $due) . '. ') : '') . 'Open your dashboard to hand it in.', 'linkPage' => 'dashboard']);
    db_update('assignments', ['remindedAt' => now_iso()], ['id' => $a['id']]);
    audit('assignment.remind', $g['me'], (string)$a['assignmentId'], ['count' => count($targets)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'reminded' => count($targets)];
}
function sub_ids_for(string $assignmentId): array {
    return array_flip(array_column(db_all('SELECT memberId FROM assignment_submissions WHERE assignmentId = ?', [$assignmentId]), 'memberId'));
}

/** staff.assignments.status — publish, back to draft, close, or delete one never handed in. One audit event. */
function staff_assignments_status(array $p): array {
    $g = assignment_staff_gate($p); if (!$g['ok']) return $g;
    $action = (string)($p['action'] ?? '');
    if (!in_array($action, ['publish', 'draft', 'close', 'delete'], true)) return ['ok' => false, 'error' => 'bad_action'];
    $ids = array_values(array_unique(array_map('strval', (array)($p['ids'] ?? []))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > ASG_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => ASG_BULK_MAX];
    $results = []; $done = 0;
    foreach ($ids as $id) {
        $a = db_row('SELECT * FROM assignments WHERE assignmentId = ?', [$id]);
        if (!$a) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!assignment_in_reach($g, $a)) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if ($action === 'delete') {
            if (db_row('SELECT 1 FROM assignment_submissions WHERE assignmentId = ? LIMIT 1', [$id])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'has_submissions']; continue; }
            db_exec('DELETE FROM assignments WHERE id = ?', [$a['id']]); $results[] = ['id' => $id, 'ok' => true]; $done++; continue;
        }
        $to = ['publish' => 'published', 'draft' => 'draft', 'close' => 'closed'][$action];
        if ($a['status'] === $to) { $results[] = ['id' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        if ($to === 'published' && trim((string)$a['instructions']) === '') { $results[] = ['id' => $id, 'ok' => false, 'error' => 'no_instructions']; continue; }
        $patch = ['status' => $to, 'updatedAt' => now_iso()];
        if ($to === 'published' && trim((string)$a['dueAt']) === '') $patch['dueAt'] = assignment_default_due();
        db_update('assignments', $patch, ['id' => $a['id']]);
        if ($to === 'published') notify_assignment_published($id, false);
        $results[] = ['id' => $id, 'ok' => true]; $done++;
    }
    audit('assignment.' . $action, $g['me'], count($ids) === 1 ? $ids[0] : '', ['count' => count($ids), 'applied' => $done], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $done, 'results' => $results];
}

function notify_assignment_published(string $assignmentId, bool $alsoEmail): int {
    global $CONFIG;
    $a = db_row('SELECT * FROM assignments WHERE assignmentId = ? LIMIT 1', [$assignmentId]);
    if (!$a) return 0;
    $targets = assignment_audience($a);
    $due = ($t = assignment_due_ts($a)) ? (' Due ' . gmdate('D j M', $t) . '.') : '';
    foreach ($targets as $m) {
        push_notification($m['memberId'], ['kind' => 'announcement', 'title' => 'New assignment: ' . $a['title'], 'body' => 'Open your dashboard to start.' . $due, 'linkPage' => 'dashboard']);
    }
    if ($alsoEmail && function_exists('email_members')) {
        email_members($targets, 'New assignment · ' . $a['title'], function ($m) use ($a, $CONFIG) {
            $due = ($t = assignment_due_ts($a)) ? ('<p style="margin:0;color:#b45309"><strong>Due ' . esc_html(gmdate('D j M', $t)) . '</strong></p>') : '';
            return email_template([
                'title' => 'New assignment: ' . $a['title'],
                'intro' => 'Hi ' . (explode(' ', (string)$m['fullName'])[0] ?: 'there') . ', a new assignment is waiting for you.',
                'bodyHtml' => '<p style="margin:0 0 10px">' . nl2br(esc_html((string)$a['instructions'])) . '</p>' . $due,
                'ctaLabel' => 'Open your dashboard', 'ctaUrl' => ($CONFIG['app_origin'] ?? '') . '/dashboard/learn',
            ]);
        }, 300);
    }
    return count($targets);
}

/* ── The Control Room's older op names, kept for the routes and bookmarks that call them ── */
function admin_assignments_list(array $p): array { return staff_assignments_list($p + ['viaAdmin' => true]); }
function admin_assignments_upsert(array $p): array { return staff_assignments_save($p + ['viaAdmin' => true]); }
function admin_assignment_submissions(array $p): array { return staff_assignment_submissions($p + ['viaAdmin' => true]); }
function assignment_grade(array $p): array { return staff_assignment_grade($p + ['viaAdmin' => true]); }
function assignment_return(array $p): array { return staff_assignment_return($p + ['viaAdmin' => true]); }
