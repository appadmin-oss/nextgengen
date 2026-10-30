<?php
declare(strict_types=1);

/**
 * Official notices — what management says to members and their families, in
 * the shape it is actually written:
 *
 *   STREET TO STARDOM (STS)                   ← org (the letterhead)
 *   *MANAGEMENT OFFICIAL NOTICE*              ← kind
 *   SUBJECT: *REVISED SATURDAY RESUMPTION…*   ← subject
 *   …numbered sections, bullets, *bold*…      ← body, WhatsApp-formatted
 *   *STS MANAGEMENT*                          ← sign-off
 *
 * An announcement used to be a 140-character title and a 2,000-character body
 * in the notification feed: a notice like that could not be sent at all, its
 * asterisks would have shown as asterisks, and nobody could say who had read
 * it. Here:
 *
 *   · ONE formatter (notice_html) turns the WhatsApp text into the page, the
 *     preview and the email — so what the desk previews is what a parent
 *     reads, and the copy for WhatsApp is the text it came from;
 *   · a pasted notice is split into its parts (notice_parse) for the desk to
 *     check, never sent as it guessed;
 *   · publishing reaches each member's feed (with a push), each guardian's
 *     family inbox once however many children, and — when asked — an email
 *     to each address once, from a queue (notice_mail_drain);
 *   · every reader's read and "I have read and understood" is one row, so the
 *     desk can see who has not, and remind only them;
 *   · a published notice can be corrected (and says so, with when and why)
 *     or withdrawn (and says that instead of vanishing).
 */

const NOTICE_BODY_MAX     = 40000;
const NOTICE_AUDIENCE_MAX = 5000;   // members one publish reaches — named in the refusal
const NOTICE_MAIL_BATCH   = 40;     // emails a minute (notice_mail_drain)
const NOTICE_REMIND_QUIET = 86400;  // one reminder a day at most
const NOTICE_REACH        = ['both' => 'Members and their families', 'members' => 'Members only', 'guardians' => 'Families only'];

/* ── The text ─────────────────────────────────────────────────────────────── */

/** Strip WhatsApp's own markers from a short line ("*STS MANAGEMENT*" → "STS MANAGEMENT"). */
function notice_unmark(string $s): string {
    return trim(preg_replace('/^[\s*_~]+|[\s*_~]+$/u', '', $s));
}

/**
 * A notice as written (pasted from WhatsApp) → its parts. The lines before
 * "SUBJECT:" are the letterhead (the first the organisation, the rest the kind
 * of notice); a short last line that is all capitals or wholly in *bold* is
 * the sign-off; the rest is the body, kept exactly. With no SUBJECT line the
 * first line is the subject. Nothing is dropped: the desk sees every part and
 * can move a line before anything is sent.
 */
function notice_parse(string $raw): array {
    $text = str_replace(["\r\n", "\r"], "\n", $raw);
    $text = preg_replace('/[\x{200B}\x{FEFF}]/u', '', $text);
    $lines = explode("\n", $text);
    $out = ['org' => '', 'kind' => '', 'subject' => '', 'body' => '', 'signoff' => ''];
    $subjAt = -1;
    foreach ($lines as $i => $l) {
        if (preg_match('/^\s*[*_]*\s*SUBJECT\s*[*_]*\s*:\s*(.+?)\s*$/iu', $l, $m)) { $subjAt = $i; $out['subject'] = notice_unmark($m[1]); break; }
    }
    if ($subjAt >= 0) {
        $head = array_values(array_filter(array_map('trim', array_slice($lines, 0, $subjAt)), static fn($x) => $x !== ''));
        $out['org'] = notice_unmark((string)($head[0] ?? ''));
        $out['kind'] = notice_unmark(implode(' ', array_slice($head, 1)));
        $rest = array_slice($lines, $subjAt + 1);
    } else {
        $first = null;
        foreach ($lines as $i => $l) if (trim($l) !== '') { $first = $i; break; }
        if ($first === null) return $out;
        $out['subject'] = notice_unmark($lines[$first]);
        $rest = array_slice($lines, $first + 1);
    }
    // The sign-off: the last non-empty line, if it reads like one.
    for ($i = count($rest) - 1; $i >= 0; $i--) {
        $l = trim($rest[$i]);
        if ($l === '') continue;
        $plain = notice_unmark($l);
        $bold = (bool)preg_match('/^\*[^*]+\*$/u', $l);
        $caps = $plain !== '' && mb_strtoupper($plain) === $plain && preg_match('/\p{L}/u', $plain);
        if ($plain !== '' && mb_strlen($plain) <= 60 && ($bold || $caps) && !preg_match('/^\d+\./', $plain)) {
            $out['signoff'] = $plain;
            $rest = array_slice($rest, 0, $i);
        }
        break;
    }
    $out['body'] = trim(implode("\n", $rest), "\n");
    $out['body'] = preg_replace('/^[ \t]+$/m', '', $out['body']);
    return $out;
}

/** WhatsApp's inline marks on already-escaped text: *bold*, _italic_, ~strike~, ```mono```, and links. */
function notice_inline(string $esc): string {
    $s = preg_replace('/```(.+?)```/su', '<code>$1</code>', $esc);
    $s = preg_replace('/(?<![\p{L}\p{N}*])\*(?=\S)(.+?)(?<=\S)\*(?![\p{L}\p{N}*])/su', '<strong>$1</strong>', $s);
    $s = preg_replace('/(?<![\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/su', '<em>$1</em>', $s);
    $s = preg_replace('/(?<![\p{L}\p{N}~])~(?=\S)(.+?)(?<=\S)~(?![\p{L}\p{N}~])/su', '<s>$1</s>', $s);
    // Links: a full URL, or a bare domain on a common ending ("next.afrovanguard.org.ng").
    $s = preg_replace_callback('~(?<![\w/@.-])((?:https?://)[^\s<]+[^\s<.,;:!?)]|(?:[a-z0-9-]+\.)+(?:ng|com|org|net|edu|gov|io)(?:/[^\s<]*[^\s<.,;:!?)])?)(?![\w@-])~iu', static function ($m) {
        $u = $m[1]; $href = preg_match('~^https?://~i', $u) ? $u : 'https://' . $u;
        return '<a href="' . $href . '" target="_blank" rel="noopener">' . $u . '</a>';
    }, $s);
    return $s;
}

/**
 * The body as HTML — the one formatter, used by the page, the preview and the
 * email. The text is escaped FIRST, so nothing anybody types becomes markup:
 * only the marks below do.
 *
 *   a blank line           a new paragraph
 *   "1. *A HEADING*"       a numbered section heading (wholly bold after the number)
 *   "*A HEADING*" alone    a heading
 *   "- item" / "• item"    a bullet list
 *   "1. text"              a numbered line, kept as written
 */
function notice_html(string $body): string {
    $blocks = preg_split("/\n[ \t]*\n+/u", trim(str_replace(["\r\n", "\r"], "\n", $body)));
    $out = [];
    foreach ($blocks as $block) {
        $lines = array_values(array_filter(explode("\n", $block), static fn($l) => trim($l) !== ''));
        if (!$lines) continue;
        $list = []; $para = [];
        $flushList = static function () use (&$list, &$out) { if ($list) { $out[] = '<ul>' . implode('', array_map(static fn($i) => '<li>' . $i . '</li>', $list)) . '</ul>'; $list = []; } };
        $flushPara = static function () use (&$para, &$out) { if ($para) { $out[] = '<p>' . implode('<br>', $para) . '</p>'; $para = []; } };
        foreach ($lines as $l) {
            $t = trim($l);
            $esc = htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            if (preg_match('/^(?:[-•●▪]|\*(?=\s))\s+(.+)$/u', $esc, $m)) { $flushPara(); $list[] = notice_inline($m[1]); continue; }
            $flushList();
            if (preg_match('/^(\d{1,2})[.)]\s*\*([^*]+)\*\s*$/u', $esc, $m)) { $flushPara(); $out[] = '<h3><span class="nt-num">' . $m[1] . '.</span> ' . trim($m[2]) . '</h3>'; continue; }
            if (preg_match('/^\*([^*]{2,90})\*$/u', $esc, $m) && count($lines) === 1) { $flushPara(); $out[] = '<h3>' . trim($m[1]) . '</h3>'; continue; }
            $para[] = notice_inline($esc);
        }
        $flushList(); $flushPara();
    }
    return implode("\n", $out);
}

/** The words without the marks — for a feed line, a push, an email's plain part. */
function notice_plain(string $body): string {
    $s = preg_replace('/```(.+?)```/su', '$1', $body);
    $s = preg_replace('/(?<![\p{L}\p{N}])[*_~](?=\S)(.+?)(?<=\S)[*_~](?![\p{L}\p{N}])/su', '$1', $s);
    return trim($s);
}
/** One line of it: the first sentence or so, for a feed item and a push. */
function notice_excerpt(string $body, int $max = 180): string {
    $p = trim(preg_replace('/\s+/u', ' ', notice_plain($body)));
    return mb_strlen($p) <= $max ? $p : rtrim(mb_substr($p, 0, $max - 1)) . '…';
}

/**
 * A notice with a letterhead is an OFFICIAL notice and is headed "SUBJECT:", as
 * management writes them; one without is an announcement, and its subject is
 * simply its title ("No class this Saturday") — the same rule on the page, in
 * the email and in the copy for WhatsApp.
 */
function notice_is_official(array $n): bool { return trim((string)$n['org']) !== '' || trim((string)$n['kind']) !== ''; }
/** The subject as a heading line: "SUBJECT: …" on an official notice, the bare subject otherwise. */
function notice_title(array $n): string { return (notice_is_official($n) ? 'SUBJECT: ' : '') . (string)$n['subject']; }

/** The notice as it is pasted into WhatsApp — the parts, in WhatsApp's own marks. */
function notice_whatsapp(array $n): string {
    $parts = [];
    if ((string)$n['org'] !== '') $parts[] = (string)$n['org'];
    if ((string)$n['kind'] !== '') $parts[] = '*' . (string)$n['kind'] . '*';
    $parts[] = (notice_is_official($n) ? 'SUBJECT: ' : '') . '*' . (string)$n['subject'] . '*';
    $parts[] = trim((string)$n['body']);
    if ((string)$n['signoff'] !== '') $parts[] = '*' . (string)$n['signoff'] . '*';
    return implode("\n\n", array_filter($parts, static fn($x) => $x !== ''));
}

/* ── Who it reaches ───────────────────────────────────────────────────────── */

/** Everyone, a programme, or a centre — the same audiences an announcement has always had. */
function notice_audience_ok(string $aud): bool {
    return function_exists('admin_broadcast_audience') ? admin_broadcast_audience($aud) !== null : in_array($aud, ['all', 'NGG', 'Summer'], true);
}
/** The members a notice is for: active, not staff, in its audience. */
function notice_members(array $n): array {
    $aud = admin_broadcast_audience((string)$n['audience']) ?? ['kind' => 'all', 'key' => ''];
    $where = "status = 'active'"; $args = [];
    if ($aud['kind'] === 'centre') { $where .= ' AND centre = ?'; $args[] = $aud['key']; }
    elseif ($aud['kind'] === 'type') { $where .= ' AND type = ?'; $args[] = $aud['key']; }
    $out = [];
    foreach (db_all("SELECT memberId, fullName, email, parentEmail, centre, type, role FROM members WHERE $where ORDER BY fullName LIMIT " . (NOTICE_AUDIENCE_MAX + 1), $args) as $m) {
        if (is_admin_role((string)($m['role'] ?? ''))) continue;   // staff write notices; they are not their audience
        $out[(string)$m['memberId']] = $m;
    }
    return $out;
}
/** Is this member in the notice's audience? */
function notice_for_member(array $n, string $memberId): bool {
    $m = db_row('SELECT memberId, centre, type, status, role FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m) return false;
    if (is_admin_role((string)($m['role'] ?? ''))) return true;   // staff may read every notice
    $aud = admin_broadcast_audience((string)$n['audience']) ?? ['kind' => 'all', 'key' => ''];
    if ($aud['kind'] === 'centre') return (string)$m['centre'] === $aud['key'];
    if ($aud['kind'] === 'type') return (string)$m['type'] === $aud['key'];
    return true;
}
/** The children of this guardian the notice is for. */
function notice_wards_for(array $n, string $guardianId): array {
    $out = [];
    foreach (db_all("SELECT w.memberId, m.fullName FROM guardian_wards w JOIN members m ON m.memberId = w.memberId WHERE w.guardianId = ? AND w.status = 'active'", [$guardianId]) as $w)
        if (notice_for_member($n, (string)$w['memberId'])) $out[] = ['memberId' => (string)$w['memberId'], 'fullName' => (string)$w['fullName']];
    return $out;
}

/* ── Shapes ───────────────────────────────────────────────────────────────── */

function notice_get(string $id): ?array { return db_row('SELECT * FROM notices WHERE noticeId = ? LIMIT 1', [$id]) ?: null; }

/** What a reader is handed: the parts, the formatted body, and its history. */
function notice_public(array $n): array {
    return ['noticeId' => (string)$n['noticeId'], 'org' => (string)$n['org'], 'kind' => (string)$n['kind'], 'subject' => (string)$n['subject'],
            'html' => notice_html((string)$n['body']), 'signoff' => (string)$n['signoff'], 'needsAck' => (bool)(int)$n['needsAck'],
            'official' => notice_is_official($n), 'status' => (string)$n['status'], 'publishedAt' => (string)$n['publishedAt'],
            'correctedAt' => (string)$n['correctedAt'], 'correctionNote' => (string)$n['correctionNote'],
            'withdrawnAt' => (string)$n['withdrawnAt'], 'withdrawReason' => (string)$n['withdrawReason'],
            'whatsapp' => notice_whatsapp($n)];
}
/** The desk's view: the source text too, and the counts. */
function notice_admin(array $n, ?array $counts = null): array {
    return notice_public($n) + ['body' => (string)$n['body'], 'audience' => (string)$n['audience'], 'reach' => (string)$n['reach'],
            'emailOn' => (bool)(int)$n['emailOn'], 'createdAt' => (string)$n['createdAt'], 'updatedAt' => (string)$n['updatedAt'],
            'stats' => safe_json((string)$n['stats']) ?: null, 'remindedAt' => (string)$n['remindedAt']]
        + ($counts ?? []);
}
/** Readers and acknowledgements, for one notice or many, in two grouped queries. */
function notice_counts(array $ids): array {
    $out = [];
    if (!$ids) return $out;
    foreach (array_chunk($ids, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT noticeId, COUNT(DISTINCT CASE WHEN readAt <> '' THEN memberId END) readers, COUNT(DISTINCT CASE WHEN ackAt <> '' THEN memberId END) acked
                         FROM notice_reads WHERE noticeId IN ($ph) AND memberId <> '' GROUP BY noticeId", $chunk) as $r)
            $out[(string)$r['noticeId']] = ['readers' => (int)$r['readers'], 'acked' => (int)$r['acked']];
    }
    return $out;
}

/* ── The desk ─────────────────────────────────────────────────────────────── */

/** notice_admin() with how many it reaches and who has read it — what the editor's Publish confirm reads. */
function notice_admin_counted(array $n): array {
    return notice_admin($n, ['reachMembers' => count(notice_members($n))] + (notice_counts([(string)$n['noticeId']])[(string)$n['noticeId']] ?? ['readers' => 0, 'acked' => 0]));
}

/** Validate the parts the desk sends. ['ok'=>false,…] or the clean row fields. */
function notice_clean(array $p): array {
    $t = static fn($k, $max) => trim(mb_substr(str_replace(["\r\n", "\r"], "\n", (string)($p[$k] ?? '')), 0, $max));
    $row = ['org' => $t('org', 160), 'kind' => $t('kind', 160), 'subject' => $t('subject', 300), 'body' => $t('body', NOTICE_BODY_MAX), 'signoff' => $t('signoff', 160)];
    if (mb_strlen((string)($p['body'] ?? '')) > NOTICE_BODY_MAX) return ['ok' => false, 'error' => 'too_long', 'field' => 'body', 'detail' => 'A notice is at most ' . number_format(NOTICE_BODY_MAX) . ' characters.'];
    if (mb_strlen($row['subject']) < 3) return ['ok' => false, 'error' => 'subject_required', 'field' => 'subject', 'detail' => 'Give the notice its subject.'];
    // A notice may be one line ("No class this Saturday — the centre is closed for repairs."): only an empty one is refused.
    if (mb_strlen($row['body']) < 2) return ['ok' => false, 'error' => 'body_required', 'field' => 'body', 'detail' => 'Write the notice.'];
    $aud = trim((string)($p['audience'] ?? 'all')) ?: 'all';
    if (!notice_audience_ok($aud)) return ['ok' => false, 'error' => 'bad_audience', 'field' => 'audience', 'detail' => 'Choose everyone, a programme, or one of the centres.'];
    $reach = (string)($p['reach'] ?? 'both');
    $row += ['audience' => $aud, 'reach' => isset(NOTICE_REACH[$reach]) ? $reach : 'both', 'needsAck' => !empty($p['needsAck']) ? 1 : 0, 'emailOn' => !empty($p['emailOn']) ? 1 : 0];
    return ['ok' => true, 'row' => $row];
}

/** admin.notices.parse — a pasted notice split into its parts. Writes nothing. */
function admin_notices_parse(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $raw = (string)($p['text'] ?? '');
    if (mb_strlen($raw) > NOTICE_BODY_MAX + 2000) return ['ok' => false, 'error' => 'too_long'];
    $parts = notice_parse($raw);
    return ['ok' => true, 'parts' => $parts, 'html' => notice_html($parts['body'])];
}
/** admin.notices.preview — the formatted body for what the desk is writing. Writes nothing. */
function admin_notices_preview(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    return ['ok' => true, 'html' => notice_html(mb_substr((string)($p['body'] ?? ''), 0, NOTICE_BODY_MAX))];
}

/** admin.notices.list — every notice, newest first, with who has read and acknowledged it. */
function admin_notices_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM notices ORDER BY CASE WHEN publishedAt = \'\' THEN updatedAt ELSE publishedAt END DESC, id DESC LIMIT 200');
    $counts = notice_counts(array_column($rows, 'noticeId'));
    $reach = [];
    $out = [];
    foreach ($rows as $n) {
        $k = (string)$n['audience'];
        if (!isset($reach[$k])) $reach[$k] = count(notice_members($n));
        $out[] = notice_admin($n, ['reachMembers' => $reach[$k]] + ($counts[(string)$n['noticeId']] ?? ['readers' => 0, 'acked' => 0]));
    }
    $aud = function_exists('admin_broadcast_history') ? (admin_broadcast_history($p)['audiences'] ?? []) : [];
    // The last letterhead used, so "+ Letterhead" on a new notice starts from it rather than from nothing.
    $lh = db_row("SELECT org, kind, signoff FROM notices WHERE org <> '' OR signoff <> '' ORDER BY id DESC LIMIT 1");
    return ['ok' => true, 'notices' => $out, 'audiences' => $aud, 'reachLabels' => NOTICE_REACH, 'max' => NOTICE_BODY_MAX,
            'lastLetterhead' => $lh ? ['org' => (string)$lh['org'], 'kind' => (string)$lh['kind'], 'signoff' => (string)$lh['signoff']] : null];
}

/**
 * admin.notices.save — a draft created or changed; or, for a published
 * notice, a CORRECTION: it needs a note, is stamped with when and by whom,
 * and readers see that it was corrected. A withdrawn notice is not edited.
 */
function admin_notices_save(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $c = notice_clean($p); if (!$c['ok']) return $c;
    $by = (string)$g['requester']['memberId']; $now = now_iso();
    $id = trim((string)($p['noticeId'] ?? ''));
    if ($id === '') {
        $id = 'NTC-' . gmdate('Y') . '-' . strtoupper(rand_hex(4));
        db_insert('notices', $c['row'] + ['noticeId' => $id, 'status' => 'draft', 'stats' => '', 'createdBy' => $by, 'createdAt' => $now, 'updatedAt' => $now]);
        audit('notice.create', $by, $id, ['subject' => $c['row']['subject']], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'notice' => notice_admin_counted(notice_get($id))];
    }
    $n = notice_get($id);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$n['status'] === 'withdrawn') return ['ok' => false, 'error' => 'withdrawn', 'detail' => 'A withdrawn notice is not edited. Write a new one.'];
    if ((string)$n['status'] === 'published') {
        $note = trim(mb_substr((string)($p['correctionNote'] ?? ''), 0, 240));
        if (mb_strlen($note) < 5) return ['ok' => false, 'error' => 'note_required', 'field' => 'correctionNote', 'detail' => 'Say what was corrected — readers are shown it.'];
        // Who it is for is fixed once it has gone out: re-addressing a sent notice is a new notice.
        $row = array_diff_key($c['row'], ['audience' => 1, 'reach' => 1, 'emailOn' => 1]);
        db_update('notices', $row + ['correctedBy' => $by, 'correctedAt' => $now, 'correctionNote' => $note, 'updatedAt' => $now], ['noticeId' => $id]);
        audit('notice.correct', $by, $id, ['note' => $note], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'notice' => notice_admin_counted(notice_get($id)), 'corrected' => true];
    }
    db_update('notices', $c['row'] + ['updatedAt' => $now], ['noticeId' => $id]);
    return ['ok' => true, 'notice' => notice_admin_counted(notice_get($id))];
}

/** admin.notices.delete — a draft only. What went out is withdrawn, never deleted. */
function admin_notices_delete(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $n = notice_get((string)($p['noticeId'] ?? '')); if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$n['status'] !== 'draft') return ['ok' => false, 'error' => 'not_draft', 'detail' => 'Only a draft is deleted. Withdraw a published notice instead.'];
    db_exec('DELETE FROM notices WHERE noticeId = ?', [(string)$n['noticeId']]);
    audit('notice.delete', (string)$g['requester']['memberId'], (string)$n['noticeId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * admin.notices.publish — send it. The count was read before the confirm on
 * the screen; here every member of the audience gets one feed item (with a
 * push), each guardian with a family account one inbox notice, and — when the
 * notice asks — every address one email from the queue. A notice published
 * twice is refused, so a double press cannot send it twice.
 */
function admin_notices_publish(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $n = notice_get((string)($p['noticeId'] ?? '')); if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$n['status'] !== 'draft') return ['ok' => false, 'error' => 'already_published', 'detail' => 'This notice has already gone out.'];
    $c = notice_clean($n + ['needsAck' => (int)$n['needsAck'], 'emailOn' => (int)$n['emailOn']]); if (!$c['ok']) return $c;
    $members = notice_members($n);
    if (count($members) > NOTICE_AUDIENCE_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'A notice reaches at most ' . NOTICE_AUDIENCE_MAX . ' members at once; choose a programme or a centre.'];
    if (!$members) return ['ok' => false, 'error' => 'nobody', 'detail' => 'Nobody is in that audience.'];
    $by = (string)$g['requester']['memberId']; $now = $now0 = now_iso();
    $id = (string)$n['noticeId'];
    // Claimed first: a second press finds it published and stops here.
    if (db_exec("UPDATE notices SET status = 'published', publishedBy = ?, publishedAt = ?, updatedAt = ? WHERE noticeId = ? AND status = 'draft'", [$by, $now, $now, $id]) !== 1)
        return ['ok' => false, 'error' => 'already_published', 'detail' => 'This notice has already gone out.'];
    $title = mb_substr(((string)$n['kind'] !== '' ? notice_unmark((string)$n['kind']) . ': ' : 'Notice: ') . (string)$n['subject'], 0, 200);
    $excerpt = notice_excerpt((string)$n['body']);
    $reach = (string)$n['reach'];
    $stats = ['members' => 0, 'families' => 0, 'emailsQueued' => 0];
    if ($reach !== 'guardians') {
        foreach ($members as $mid => $m) {
            try {
                push_notification($mid, ['kind' => 'notice', 'title' => $title, 'body' => $excerpt, 'linkPage' => 'notice', 'linkRef' => $id,
                    'actionLabel' => (int)$n['needsAck'] ? 'Read and acknowledge' : 'Read the notice', 'url' => '/notice/' . rawurlencode($id), 'groupKey' => 'notice:' . $id]);
                $stats['members']++;
            } catch (Throwable $e) { error_log('[notice.publish] ' . $e->getMessage()); }
        }
    }
    $gIds = [];
    if ($reach !== 'members') {
        foreach (array_chunk(array_keys($members), 400) as $chunk) {
            foreach (db_all("SELECT DISTINCT g.guardianId FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId WHERE w.status = 'active' AND COALESCE(g.status,'active') = 'active' AND w.memberId IN ("
                . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk) as $r) $gIds[(string)$r['guardianId']] = true;
        }
        foreach (array_keys($gIds) as $gid) if (function_exists('family_notice_add') && family_notice_add($gid, 'notice', $id, $title, $excerpt, (string)$n['signoff'])) $stats['families']++;
        // A notice that asks for an acknowledgement is one the family inbox asks them to sign — and signing it is the acknowledgement.
        if ((int)$n['needsAck']) db_exec("UPDATE guardian_notices SET sign = 1 WHERE kind = 'notice' AND refId = ?", [$id]);
    }
    if ((int)$n['emailOn']) {
        $to = [];
        foreach ($members as $m) {
            if ($reach !== 'guardians') { $e = strtolower(trim((string)$m['email'])); if (filter_var($e, FILTER_VALIDATE_EMAIL)) $to[$e] = (string)$m['fullName']; }
            if ($reach !== 'members') { $e = strtolower(trim((string)($m['parentEmail'] ?? ''))); if (filter_var($e, FILTER_VALIDATE_EMAIL)) $to[$e] = $to[$e] ?? ''; }
        }
        if ($reach !== 'members') foreach (array_chunk(array_keys($gIds), 400) as $chunk) {
            foreach (db_all('SELECT email, fullName FROM guardians WHERE guardianId IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk) as $r) {
                $e = strtolower(trim((string)$r['email'])); if (filter_var($e, FILTER_VALIDATE_EMAIL)) $to[$e] = (string)($r['fullName'] ?? '');
            }
        }
        foreach ($to as $e => $name) {
            try { db_insert('notice_mail', ['noticeId' => $id, 'email' => $e, 'name' => mb_substr($name, 0, 160), 'status' => 'queued', 'createdAt' => $now0]); $stats['emailsQueued']++; }
            catch (Throwable $e2) { /* already queued for this address */ }
        }
    }
    db_update('notices', ['stats' => json_encode($stats)], ['noticeId' => $id]);
    audit('notice.publish', $by, $id, ['audience' => (string)$n['audience'], 'reach' => $reach] + $stats, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'notice' => notice_admin(notice_get($id)), 'stats' => $stats];
}

/** admin.notices.withdraw — taken back, with the reason; readers are told it was withdrawn rather than finding nothing. */
function admin_notices_withdraw(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $n = notice_get((string)($p['noticeId'] ?? '')); if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$n['status'] !== 'published') return ['ok' => false, 'error' => 'not_published'];
    $why = trim(mb_substr((string)($p['reason'] ?? ''), 0, 240));
    if (mb_strlen($why) < 5) return ['ok' => false, 'error' => 'reason_required', 'field' => 'reason', 'detail' => 'Say why — readers are shown it.'];
    $by = (string)$g['requester']['memberId'];
    db_update('notices', ['status' => 'withdrawn', 'withdrawnBy' => $by, 'withdrawnAt' => now_iso(), 'withdrawReason' => $why, 'updatedAt' => now_iso()], ['noticeId' => (string)$n['noticeId']]);
    db_exec("UPDATE notice_mail SET status = 'cancelled' WHERE noticeId = ? AND status = 'queued'", [(string)$n['noticeId']]);
    audit('notice.withdraw', $by, (string)$n['noticeId'], ['reason' => $why], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'notice' => notice_admin(notice_get((string)$n['noticeId']))];
}

/**
 * admin.notices.readers — every member the notice is for, with whether they
 * (or a parent for them) have read it and acknowledged it. Centre-scoped.
 */
function admin_notices_readers(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $n = notice_get((string)($p['noticeId'] ?? '')); if (!$n) return ['ok' => false, 'error' => 'not_found'];
    $reads = [];
    foreach (db_all("SELECT memberId, readerKey, readAt, ackAt, ackName FROM notice_reads WHERE noticeId = ? AND memberId <> ''", [(string)$n['noticeId']]) as $r) {
        $mid = (string)$r['memberId'];
        $cur = $reads[$mid] ?? ['readAt' => '', 'ackAt' => '', 'ackBy' => ''];
        if ((string)$r['readAt'] !== '' && ($cur['readAt'] === '' || $r['readAt'] < $cur['readAt'])) $cur['readAt'] = (string)$r['readAt'];
        if ((string)$r['ackAt'] !== '' && ($cur['ackAt'] === '' || $r['ackAt'] < $cur['ackAt'])) { $cur['ackAt'] = (string)$r['ackAt']; $cur['ackBy'] = str_starts_with((string)$r['readerKey'], 'g:') ? 'parent' : 'member'; }
        $reads[$mid] = $cur;
    }
    $rows = []; $tot = ['members' => 0, 'read' => 0, 'acked' => 0];
    foreach (notice_members($n) as $mid => $m) {
        if (!admin_centre_allowed($g['requester'], (string)$m['centre'])) continue;
        $r = $reads[$mid] ?? ['readAt' => '', 'ackAt' => '', 'ackBy' => ''];
        $rows[] = ['memberId' => $mid, 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre']] + $r;
        $tot['members']++; if ($r['readAt'] !== '') $tot['read']++; if ($r['ackAt'] !== '') $tot['acked']++;
    }
    return ['ok' => true, 'rows' => $rows, 'totals' => $tot, 'needsAck' => (bool)(int)$n['needsAck'], 'remindedAt' => (string)$n['remindedAt']];
}

/**
 * admin.notices.remind — a second feed item and push to the members who have
 * not acknowledged it (or, for a notice that asks for no acknowledgement, not
 * read it). Once a day at most, and only to them.
 */
function admin_notices_remind(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $n = notice_get((string)($p['noticeId'] ?? '')); if (!$n) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$n['status'] !== 'published') return ['ok' => false, 'error' => 'not_published'];
    $last = strtotime((string)$n['remindedAt']) ?: 0;
    if ($last > time() - NOTICE_REMIND_QUIET) return ['ok' => false, 'error' => 'too_soon', 'detail' => 'A reminder went out ' . gmdate('j M H:i', $last) . '. One a day at most.'];
    $r = admin_notices_readers($p);
    $ack = (int)$n['needsAck'];
    $left = array_values(array_filter($r['rows'], static fn($x) => $ack ? $x['ackAt'] === '' : $x['readAt'] === ''));
    $id = (string)$n['noticeId'];
    $sent = 0;
    foreach ($left as $x) {
        try {
            push_notification($x['memberId'], ['kind' => 'notice', 'title' => 'Reminder: ' . (string)$n['subject'], 'body' => $ack ? 'Please read this notice and confirm you have understood it.' : notice_excerpt((string)$n['body']),
                'linkPage' => 'notice', 'linkRef' => $id, 'actionLabel' => $ack ? 'Read and acknowledge' : 'Read the notice', 'url' => '/notice/' . rawurlencode($id), 'groupKey' => 'notice:' . $id]);
            $sent++;
        } catch (Throwable $e) { error_log('[notice.remind] ' . $e->getMessage()); }
    }
    db_update('notices', ['remindedAt' => now_iso()], ['noticeId' => $id]);
    audit('notice.remind', (string)$g['requester']['memberId'], $id, ['sent' => $sent], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'reminded' => $sent];
}

/* ── Readers ──────────────────────────────────────────────────────────────── */

/** Mark a reader's read (and, with $ack, their acknowledgement) — once each, the first time. */
function notice_mark(string $noticeId, string $readerKey, string $memberId, bool $ack, string $name = ''): void {
    $now = now_iso();
    $have = db_row('SELECT id, readAt, ackAt FROM notice_reads WHERE noticeId = ? AND readerKey = ? LIMIT 1', [$noticeId, $readerKey]);
    if (!$have) {
        try { db_insert('notice_reads', ['noticeId' => $noticeId, 'readerKey' => $readerKey, 'memberId' => $memberId, 'readAt' => $now, 'ackAt' => $ack ? $now : '', 'ackName' => $ack ? mb_substr($name, 0, 160) : '']); }
        catch (Throwable $e) { /* a second tab got there first */ }
        return;
    }
    $set = [];
    if ((string)$have['readAt'] === '') $set['readAt'] = $now;
    if ($ack && (string)$have['ackAt'] === '') { $set['ackAt'] = $now; $set['ackName'] = mb_substr($name, 0, 160); }
    if ($set) db_update('notice_reads', $set, ['id' => (int)$have['id']]);
}

/** member.notices — the notices this member may read, newest first, with what they have done. */
function member_notices(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $mine = [];
    foreach (db_all("SELECT readerKey, noticeId, readAt, ackAt FROM notice_reads WHERE readerKey = ?", ['m:' . $mid]) as $r) $mine[(string)$r['noticeId']] = $r;
    $out = [];
    foreach (db_all("SELECT * FROM notices WHERE status IN ('published','withdrawn') ORDER BY publishedAt DESC LIMIT 60") as $n) {
        if (!notice_for_member($n, $mid)) continue;
        $out[] = ['noticeId' => (string)$n['noticeId'], 'org' => (string)$n['org'], 'kind' => (string)$n['kind'], 'subject' => (string)$n['subject'],
                  'excerpt' => (string)$n['status'] === 'withdrawn' ? 'Withdrawn.' : notice_excerpt((string)$n['body']), 'publishedAt' => (string)$n['publishedAt'],
                  'status' => (string)$n['status'], 'needsAck' => (bool)(int)$n['needsAck'],
                  'read' => (string)($mine[(string)$n['noticeId']]['readAt'] ?? '') !== '', 'acked' => (string)($mine[(string)$n['noticeId']]['ackAt'] ?? '') !== ''];
    }
    return ['ok' => true, 'notices' => $out];
}

/** member.notice — one notice, read (and marked read) by a member. A withdrawn one says so, with why. */
function member_notice(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $n = notice_get((string)($p['noticeId'] ?? ''));
    if (!$n || (string)$n['status'] === 'draft' || !notice_for_member($n, $mid)) return ['ok' => false, 'error' => 'not_found'];
    $me = db_row('SELECT fullName, role FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    $staff = $me && is_admin_role((string)($me['role'] ?? ''));
    if ((string)$n['status'] === 'published' && !$staff) notice_mark((string)$n['noticeId'], 'm:' . $mid, $mid, !empty($p['ack']), (string)($me['fullName'] ?? ''));
    $r = db_row('SELECT readAt, ackAt FROM notice_reads WHERE noticeId = ? AND readerKey = ? LIMIT 1', [(string)$n['noticeId'], 'm:' . $mid]);
    return ['ok' => true, 'notice' => notice_public($n), 'reader' => ['kind' => $staff ? 'staff' : 'member', 'name' => (string)($me['fullName'] ?? ''),
            'readAt' => (string)($r['readAt'] ?? ''), 'ackAt' => (string)($r['ackAt'] ?? '')]];
}

/**
 * family.notice — one notice, read by a guardian for the children it is for.
 * Their acknowledgement counts for each of those children, so the desk sees a
 * family answer once rather than chasing a parent of three three times.
 */
function family_notice(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $n = notice_get((string)($p['noticeId'] ?? ''));
    if (!$n || (string)$n['status'] === 'draft') return ['ok' => false, 'error' => 'not_found'];
    $wards = notice_wards_for($n, $gid);
    if (!$wards) return ['ok' => false, 'error' => 'not_found'];
    $g = db_row('SELECT fullName FROM guardians WHERE guardianId = ? LIMIT 1', [$gid]);
    if ((string)$n['status'] === 'published') foreach ($wards as $w) notice_mark((string)$n['noticeId'], 'g:' . $gid . ':' . $w['memberId'], $w['memberId'], !empty($p['ack']), (string)($g['fullName'] ?? ''));
    if (!empty($p['ack']) && (string)$n['status'] === 'published')
        db_exec("UPDATE guardian_notices SET signedAt = ? WHERE guardianId = ? AND kind = 'notice' AND refId = ? AND COALESCE(signedAt,'') = ''", [now_iso(), $gid, (string)$n['noticeId']]);
    if (function_exists('family_notices_read')) {
        $gn = db_row("SELECT noticeId FROM guardian_notices WHERE guardianId = ? AND kind = 'notice' AND refId = ? LIMIT 1", [$gid, (string)$n['noticeId']]);
        if ($gn) family_notices_read(['guardianId' => $gid, 'noticeId' => (string)$gn['noticeId']]);
    }
    $r = db_row('SELECT MIN(readAt) readAt, MIN(NULLIF(ackAt, \'\')) ackAt FROM notice_reads WHERE noticeId = ? AND readerKey LIKE ?', [(string)$n['noticeId'], 'g:' . $gid . ':%']);
    return ['ok' => true, 'notice' => notice_public($n), 'reader' => ['kind' => 'family', 'name' => (string)($g['fullName'] ?? ''), 'for' => array_column($wards, 'fullName'),
            'readAt' => (string)($r['readAt'] ?? ''), 'ackAt' => (string)($r['ackAt'] ?? '')]];
}

/* ── Email, from the queue ────────────────────────────────────────────────── */

/** The notice as an email: the letterhead, the formatted body, the sign-off, and the link to acknowledge. */
function notice_email_html(array $n): string {
    global $CONFIG;
    $origin = rtrim((string)($CONFIG['app_origin'] ?? ''), '/');
    $head = ((string)$n['org'] !== '' ? '<p style="margin:0 0 4px;font-weight:700;letter-spacing:.04em">' . esc_html((string)$n['org']) . '</p>' : '')
          . ((string)$n['kind'] !== '' ? '<p style="margin:0 0 14px;font-weight:700">' . esc_html(notice_unmark((string)$n['kind'])) . '</p>' : '');
    $body = str_replace(['<h3>', '<p>', '<ul>'], ['<h3 style="margin:18px 0 6px;font-size:16px">', '<p style="margin:0 0 12px;line-height:1.55">', '<ul style="margin:0 0 12px;padding-left:20px;line-height:1.55">'], notice_html((string)$n['body']));
    $sign = (string)$n['signoff'] !== '' ? '<p style="margin:18px 0 0;font-weight:700">' . esc_html((string)$n['signoff']) . '</p>' : '';
    return email_template(['title' => notice_title($n), 'eyebrow' => (string)$n['org'] !== '' ? (string)$n['org'] : 'NGG',
        'bodyHtml' => $head . $body . $sign,
        'ctaLabel' => (int)$n['needsAck'] ? 'Read and acknowledge' : 'Open the notice', 'ctaUrl' => $origin . '/notice/' . rawurlencode((string)$n['noticeId'])]);
}

/** A batch of queued notice emails (webcron, a minute at a time). Withdrawn notices' mail was cancelled. */
function notice_mail_drain(int $batch = NOTICE_MAIL_BATCH): array {
    $out = ['sent' => 0, 'failed' => 0];
    if (!function_exists('send_mail')) return $out;
    $rows = db_all("SELECT q.*, n.status nstatus FROM notice_mail q JOIN notices n ON n.noticeId = q.noticeId WHERE q.status = 'queued' ORDER BY q.id LIMIT " . max(1, $batch));
    $cache = [];
    foreach ($rows as $r) {
        if ((string)$r['nstatus'] !== 'published') { db_update('notice_mail', ['status' => 'cancelled'], ['id' => (int)$r['id']]); continue; }
        $id = (string)$r['noticeId'];
        $n = $cache[$id] ??= notice_get($id);
        $html = $cache['h:' . $id] ??= notice_email_html($n);
        $ok = false;
        try { $ok = (bool)send_mail((string)$r['email'], notice_title($n), $html); } catch (Throwable $e) { $ok = false; }
        $tries = (int)$r['attempts'] + 1;
        db_update('notice_mail', ['status' => $ok ? 'sent' : ($tries >= 3 ? 'failed' : 'queued'), 'attempts' => $tries, 'sentAt' => $ok ? now_iso() : ''], ['id' => (int)$r['id']]);
        $ok ? $out['sent']++ : $out['failed']++;
    }
    return $out;
}
