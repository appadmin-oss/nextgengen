<?php
declare(strict_types=1);

/**
 * Support cases — how somebody who is stuck reaches a person.
 *
 * Modelled on how Cloudflare runs support, adapted to a youth programme:
 *
 *   · The answer may already exist. The page searches the help answers first
 *     and keeps them beside the form while the case is written (deflection).
 *   · A case has a CATEGORY (what it is about, with sub-categories) and a
 *     PRIORITY chosen by impact, P1–P4, each with the plain sentence that
 *     decides it. Priority sets the response target; staff can move it.
 *   · Each category says what to include, because the case nobody can act on
 *     is the one that has to ask for the member ID, the date and the receipt.
 *   · A lifecycle, not a flag: new → open → pending (waiting for the person)
 *     → solved → closed. A reply from the person reopens it; a solved case
 *     nobody replies to closes after SUPPORT_CLOSE_DAYS, and a reply to a
 *     closed case becomes a follow-up case that points back to it.
 *   · Cases live INSIDE the portals — the member app, its community and the
 *     family app — for people who are signed in. The public /support page is
 *     help notes and the contact form; it opens no case. A case is always
 *     somebody's, so "My cases" needs no link tokens and no typed email.
 *
 * It is a case, never a "ticket": the word on every screen and in every email.
 *
 * Identity comes from the route's own session check (require_session for a
 * member, require_family for a guardian), passed in as `who` — never from the
 * request body: who somebody is decides which cases they can read.
 *
 * Safeguarding is deliberately NOT a category. A worry about a child's safety
 * must reach the safeguarding lead, not wait in a general queue behind a
 * forgotten password; the page says so above the form.
 */

const SUPPORT_CATEGORIES = [
    'account' => ['label' => 'Signing in and my account', 'icon' => 'key',
        'subs' => ['I can’t sign in', 'Forgot my password or code', 'Two-step sign-in', 'Change my details'],
        'ask' => ['Your member ID, or the email you sign in with', 'What the screen says, word for word', 'Phone or computer, and which browser']],
    'fees' => ['label' => 'Fees, fines and payments', 'icon' => 'wallet',
        'subs' => ['A payment isn’t showing', 'A fine I don’t understand', 'Joining invoice', 'A receipt'],
        'ask' => ['The amount, the date you paid and how (card, transfer, cash)', 'The payment reference or receipt number', 'A screenshot of the bank alert, if you have one']],
    'attendance' => ['label' => 'Attendance and absences', 'icon' => 'calendar-check',
        'subs' => ['Marked absent but was there', 'Asking for an absence', 'Academic leave', 'Late or signing out'],
        'ask' => ['The date it is about', 'The member’s name and centre']],
    'cards' => ['label' => 'ID cards', 'icon' => 'identification-card',
        'subs' => ['Lost or damaged card', 'Wrong details on the card', 'The photo', 'The card won’t scan'],
        'ask' => ['The name and ID printed on the card', 'What is wrong with it']],
    'family' => ['label' => 'Family account', 'icon' => 'house-line',
        'subs' => ['Linking a child', 'I can’t see my child', 'Messages and alerts'],
        'ask' => ['Your child’s name and member ID', 'The email you use for the family account']],
    'summer' => ['label' => 'Summer School', 'icon' => 'sun',
        'subs' => ['Registration', 'Confirming my child’s place', 'Pickup', 'Certificate'],
        'ask' => ['The participant’s name and centre', 'The ID on their card, if they have one']],
    'learning' => ['label' => 'Lessons, mentoring and results', 'icon' => 'graduation-cap',
        'subs' => ['A lesson or assignment', 'My mentor', 'Results and plans'],
        'ask' => ['The course, lesson or assignment', 'What you expected to happen']],
    'website' => ['label' => 'Something on the site isn’t working', 'icon' => 'bug',
        'subs' => ['A page won’t load', 'An error message', 'Something looks wrong'],
        'ask' => ['The page address', 'What you pressed, what you expected, and what happened instead', 'Roughly when it happened', 'A screenshot']],
    'joining' => ['label' => 'Joining NGG or volunteering', 'icon' => 'user-plus',
        'subs' => ['An application', 'Volunteering', 'Partnerships'],
        'ask' => ['The name the application was made in', 'Roughly when it was sent']],
    'other' => ['label' => 'Something else', 'icon' => 'question',
        'subs' => [],
        'ask' => ['What happened, and what you need']],
];

/** Priority by impact. `hours` is the response target the queue is sorted by. */
const SUPPORT_PRIORITIES = [
    'P1' => ['label' => 'Urgent', 'hours' => 4,   'when' => 'A child can’t take part today, or the site is down for everyone.'],
    'P2' => ['label' => 'High',   'hours' => 24,  'when' => 'Something with a date is blocked: a payment due, a card needed this Saturday.'],
    'P3' => ['label' => 'Normal', 'hours' => 48,  'when' => 'Something is wrong, but there is a way around it for now.'],
    'P4' => ['label' => 'Low',    'hours' => 120, 'when' => 'A question, or a suggestion.'],
];

/** What each status is called to the person who opened the case. */
const SUPPORT_STATUSES = [
    'new'     => 'Received',
    'open'    => 'With the team',
    'pending' => 'Waiting for you',
    'solved'  => 'Solved',
    'closed'  => 'Closed',
];
const SUPPORT_ACTIVE = ['new', 'open', 'pending'];
/** A solved case nobody replies to closes after this many days. */
const SUPPORT_CLOSE_DAYS = 7;
/** A case waiting on the person with no reply is solved after this many days. */
const SUPPORT_PENDING_DAYS = 10;
const SUPPORT_FILES_MAX = 3;
const SUPPORT_BODY_MAX = 6000;
const SUPPORT_SUBJECT_MAX = 160;
const SUPPORT_BULK_MAX = 200;
const SUPPORT_PAGE = 25;

/**
 * Help answers shown before and beside the form. Each says what is true of this
 * system and where to do it; none promises what the code does not do.
 */
function support_articles(): array {
    $absences = 2;
    if (function_exists('policy_for')) { $b = policy_for('member'); $absences = (int)($b['absenceLimit'] ?? $absences); }
    return [
        ['id' => 'signin', 'cat' => 'account', 'title' => 'I can’t sign in',
         'body' => 'Sign in with your member ID or email. If you have forgotten your password, choose “Email me a code”: a 6-digit code goes to the email on your record (or your guardian’s), and you set a new password with it. Five wrong tries pause sign-in for 15 minutes.',
         'link' => '/dashboard', 'linkL' => 'Go to sign in'],
        ['id' => 'twostep', 'cat' => 'account', 'title' => 'Two-step sign-in on a new phone',
         'body' => 'If you set up a two-step code and changed phones, the centre can let you in for ten minutes so you can set it up again. Open a case and say which centre you belong to.',
         'link' => '', 'linkL' => ''],
        ['id' => 'pay', 'cat' => 'fees', 'title' => 'Paying, and a payment that isn’t showing',
         'body' => 'Families pay in the Family account under Fees & fines. A transfer is checked by a second person against the evidence you upload, so it can take a working day to show. Open a case with the amount, the date and the reference if it is longer than that.',
         'link' => '/family', 'linkL' => 'Open the Family account'],
        ['id' => 'training', 'cat' => 'fees', 'title' => 'The training place is not a bill',
         'body' => 'The training place is the cost of a child’s place, covered by NGG and earned off by service. It is never added to what a family is asked to pay.',
         'link' => '/policies', 'linkL' => 'Read the family policies'],
        ['id' => 'absence', 'cat' => 'attendance', 'title' => 'Asking for an absence',
         'body' => 'Ask before the Saturday, with a reason: in My NGG under “I’ll be away”, or in the Family account. Only ' . $absences . ' absences are allowed in the programme. An absence nobody asked about can be fined; one that was asked about is reviewed before any fine. School exams have their own “academic leave”.',
         'link' => '/policies', 'linkL' => 'Read the attendance rules'],
        ['id' => 'card', 'cat' => 'cards', 'title' => 'A lost or wrong ID card',
         'body' => 'The number on an NGG card never changes, so a replacement carries the same ID. Tell us what is wrong and the centre reprints it; a new photo is requested through the app when one is needed.',
         'link' => '', 'linkL' => ''],
        ['id' => 'link', 'cat' => 'family', 'title' => 'Linking a child to the Family account',
         'body' => 'Your child’s link code is in their member app, under Me → Family. Enter it in the Family account. After a few wrong tries it pauses for 15 minutes.',
         'link' => '/family', 'linkL' => 'Open the Family account'],
        ['id' => 'summer-confirm', 'cat' => 'summer', 'title' => 'Confirming a Summer School place',
         'body' => 'After registering, the guardian gets an email with a link to confirm. Nobody receives a card until the place is confirmed. If the email did not arrive, open a case with the participant’s name and centre.',
         'link' => '/summer', 'linkL' => 'About Summer School'],
        ['id' => 'status', 'cat' => 'website', 'title' => 'Is something down for everyone?',
         'body' => 'The live status board shows attendance and the desks across the centres. If a page will not load for you, try another browser, then open a case with the page address and a screenshot.',
         'link' => '/s-status', 'linkL' => 'See the live status'],
        ['id' => 'join', 'cat' => 'joining', 'title' => 'Applying to NGG or Summer School',
         'body' => 'Applications are made on the Apply page. You get an email when one is received, and another when it is decided.',
         'link' => '/join', 'linkL' => 'Apply'],
    ];
}

/** A member, as the route's session check found them. */
function support_who_member(string $memberId): ?array {
    $m = db_row('SELECT memberId, fullName, email, parentEmail, phone, centre, status FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m || (string)$m['status'] === 'suspended') return null;
    return ['kind' => 'member', 'id' => (string)$m['memberId'], 'name' => (string)$m['fullName'],
        'email' => (string)($m['email'] ?: ($m['parentEmail'] ?? '')), 'phone' => (string)($m['phone'] ?? ''), 'centre' => (string)$m['centre']];
}

/** A guardian, from require_family()'s row. */
function support_who_guardian(array $g): array {
    return ['kind' => 'guardian', 'id' => (string)$g['guardianId'], 'name' => (string)($g['fullName'] ?? ''),
        'email' => (string)($g['email'] ?? ''), 'phone' => (string)($g['phone'] ?? ''), 'centre' => ''];
}

/** Nobody — the public help page and anything without a portal session. */
function support_nobody(): array { return ['kind' => 'none', 'id' => '', 'name' => '', 'email' => '', 'phone' => '', 'centre' => '']; }

/** The children a guardian may open a case about, or the member themselves. */
function support_subjects(array $who): array {
    if ($who['kind'] === 'member') return [['id' => $who['id'], 'name' => $who['name']]];
    if ($who['kind'] !== 'guardian') return [];
    return array_map(static fn($r) => ['id' => (string)$r['memberId'], 'name' => (string)$r['fullName']],
        db_all("SELECT m.memberId, m.fullName FROM guardian_wards w JOIN members m ON m.memberId = w.memberId WHERE w.guardianId = ? AND w.status = 'active' ORDER BY m.fullName", [$who['id']]));
}

/** support.meta — everything the page draws before anybody types. */
function support_meta(array $p): array {
    $who = $p['who'] ?? support_nobody();
    $cats = [];
    foreach (SUPPORT_CATEGORIES as $k => $c) $cats[] = ['id' => $k] + $c;
    $pri = [];
    foreach (SUPPORT_PRIORITIES as $k => $v) $pri[] = ['id' => $k] + $v;
    return ['ok' => true, 'categories' => $cats, 'priorities' => $pri, 'statuses' => SUPPORT_STATUSES, 'articles' => support_articles(),
        'who' => ['kind' => $who['kind'], 'name' => $who['name'], 'email' => $who['email'] !== '' ? preg_replace('/^(.).*(@.*)$/', '$1…$2', $who['email']) : '', 'canOpen' => in_array($who['kind'], ['member', 'guardian'], true)],
        'subjects' => support_subjects($who), 'limits' => ['files' => SUPPORT_FILES_MAX, 'fileMb' => (int)(MPAY_EVIDENCE_MAX >> 20), 'body' => SUPPORT_BODY_MAX, 'subject' => SUPPORT_SUBJECT_MAX]];
}

/** support.suggest — help answers for what is being typed. Words, not SQL. */
function support_suggest(array $p): array {
    $q = mb_strtolower(trim(mb_substr((string)($p['q'] ?? ''), 0, 200)));
    $cat = (string)($p['category'] ?? '');
    $words = array_values(array_filter(preg_split('/[^\p{L}\p{N}]+/u', $q), static fn($w) => mb_strlen($w) >= 3));
    $out = [];
    foreach (support_articles() as $a) {
        $hay = mb_strtolower($a['title'] . ' ' . $a['body']);
        $score = $cat !== '' && $a['cat'] === $cat ? 2 : 0;
        foreach ($words as $w) if (mb_strpos($hay, $w) !== false) $score += mb_strpos(mb_strtolower($a['title']), $w) !== false ? 3 : 1;
        if ($score > 0) $out[] = $a + ['score' => $score];
    }
    usort($out, static fn($x, $y) => $y['score'] <=> $x['score']);
    return ['ok' => true, 'articles' => array_slice($out, 0, 4)];
}

/** The next case number: one above the highest, never a count (a gap is a case somebody quoted). */
function support_next_no(): int {
    $max = (int)(db_row('SELECT MAX(caseNo) m FROM support_cases')['m'] ?? 0);
    return max(100001, $max + 1);
}

function support_respond_by(string $priority, ?int $from = null): string {
    $h = (int)(SUPPORT_PRIORITIES[$priority]['hours'] ?? 48);
    return gmdate('Y-m-d\TH:i:s\Z', ($from ?? time()) + $h * 3600);
}

/** Store up to SUPPORT_FILES_MAX images or PDFs; the bytes decide the type. */
function support_store_files(array $files): array {
    $out = [];
    if (count($files) > SUPPORT_FILES_MAX) return ['ok' => false, 'error' => 'too_many_files', 'detail' => 'At most ' . SUPPORT_FILES_MAX . ' files.'];
    foreach ($files as $f) {
        $d = membership_evidence_decode((string)(is_array($f) ? ($f['data'] ?? '') : $f));
        if (empty($d['ok'])) return ['ok' => false, 'error' => 'file_' . preg_replace('/^evidence_/', '', (string)$d['error']),
            'detail' => (string)($d['error'] === 'evidence_type' ? 'A screenshot or photo (JPG, PNG, WebP) or a PDF.' : ($d['detail'] ?? 'That file could not be read.'))];
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'][$d['type']];
        $dir = __DIR__ . '/../../storage/support-files';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $id = substr($d['sha'], 0, 24);
        @file_put_contents($dir . '/' . $id . '.' . $ext, $d['bytes']);
        $name = is_array($f) ? mb_substr(preg_replace('/[^\p{L}\p{N} ._-]+/u', '', (string)($f['name'] ?? '')), 0, 80) : '';
        $out[] = ['id' => $id, 'type' => $d['type'], 'ext' => $ext, 'name' => $name !== '' ? $name : 'attachment.' . $ext, 'size' => strlen($d['bytes'])];
    }
    return ['ok' => true, 'files' => $out];
}

/** A case as the person who opened it sees it: no internal notes, no staff ids. */
function support_case_public(array $c, bool $withThread = true): array {
    $out = ['caseNo' => (int)$c['caseNo'], 'status' => (string)$c['status'], 'statusL' => SUPPORT_STATUSES[$c['status']] ?? $c['status'],
        'priority' => (string)$c['priority'], 'priorityL' => SUPPORT_PRIORITIES[$c['priority']]['label'] ?? '',
        'category' => (string)$c['category'], 'categoryL' => SUPPORT_CATEGORIES[$c['category']]['label'] ?? '', 'subcategory' => (string)$c['subcategory'],
        'subject' => (string)$c['subject'], 'createdAt' => (string)$c['createdAt'], 'lastActivityAt' => (string)$c['lastActivityAt'],
        'lastReplyBy' => (string)$c['lastReplyBy'], 'rating' => (int)$c['rating'], 'followUpOf' => (int)$c['followUpOf'],
        'canReply' => $c['status'] !== 'closed', 'canSolve' => in_array($c['status'], SUPPORT_ACTIVE, true),
        'canRate' => in_array($c['status'], ['solved', 'closed'], true) && (int)$c['rating'] === 0];
    if ($withThread) {
        $out['messages'] = array_map(static fn($m) => ['id' => (int)$m['id'], 'by' => (string)$m['authorKind'],
            'name' => $m['authorKind'] === 'staff' ? (function_exists('staff_public_name') ? staff_public_name((string)$m['authorId'], 'NGG support') : 'NGG support') : (string)$m['authorName'],
            'body' => (string)$m['body'], 'files' => array_map(static fn($f) => ['id' => $f['id'], 'name' => $f['name'], 'type' => $f['type']], json_decode((string)$m['files'], true) ?: []),
            'at' => (string)$m['createdAt']],
            db_all('SELECT * FROM support_messages WHERE caseNo = ? AND internal = 0 ORDER BY id', [(int)$c['caseNo']]));
    }
    return $out;
}

/** May this person read this case? Only if it is theirs — there are no shared links. */
function support_case_for(array $who, int $caseNo): ?array {
    if (!in_array($who['kind'] ?? '', ['member', 'guardian'], true) || (string)$who['id'] === '') return null;
    $c = db_row('SELECT * FROM support_cases WHERE caseNo = ? LIMIT 1', [$caseNo]);
    if (!$c) return null;
    return (string)$c['requesterKind'] === $who['kind'] && (string)$c['requesterId'] === $who['id'] ? $c : null;
}

/** Where the person reads their case: the portal they opened it from. */
function support_case_url(int $caseNo, string $kind = 'member'): string {
    $o = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    return $o . ($kind === 'guardian' ? '/family?view=account&sub=help&case=' : '/dashboard?case=') . $caseNo;
}

function support_mail(string $to, string $subject, string $title, string $intro, string $body, string $url): bool {
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || !function_exists('send_mail')) return false;
    return @send_mail($to, $subject, email_template(['title' => $title, 'eyebrow' => 'NGG support', 'intro' => $intro,
        'bodyHtml' => '<p style="margin:0 0 10px">' . nl2br(esc_html($body)) . '</p>', 'ctaLabel' => 'Open the case', 'ctaUrl' => $url,
        'footNote' => 'Reply on the case page, so it stays with everything else about it.']));
}

/**
 * support.open — open a case, or add to the one already open about the same thing.
 * `who` is resolved by the route's own session check; the name and email are the account's.
 */
function support_open(array $p): array {
    $who = $p['who'] ?? support_nobody();
    if (!in_array($who['kind'], ['member', 'guardian'], true)) return ['ok' => false, 'error' => 'sign_in_required', 'detail' => 'Cases are opened from inside My NGG or the Family account.'];
    $cat = (string)($p['category'] ?? '');
    if (!isset(SUPPORT_CATEGORIES[$cat])) return ['ok' => false, 'error' => 'category_required', 'detail' => 'Choose what the case is about.'];
    $pri = (string)($p['priority'] ?? 'P3');
    if (!isset(SUPPORT_PRIORITIES[$pri])) $pri = 'P3';
    $sub = trim((string)($p['subcategory'] ?? ''));
    if ($sub !== '' && !in_array($sub, SUPPORT_CATEGORIES[$cat]['subs'], true)) $sub = '';
    $subject = trim(preg_replace('/\s+/u', ' ', mb_substr((string)($p['subject'] ?? ''), 0, SUPPORT_SUBJECT_MAX)));
    $body = trim(mb_substr((string)($p['body'] ?? ''), 0, SUPPORT_BODY_MAX));
    if (mb_strlen($subject) < 4) return ['ok' => false, 'error' => 'subject_required', 'detail' => 'Say in a few words what is wrong.'];
    if (mb_strlen($body) < 20) return ['ok' => false, 'error' => 'body_required', 'detail' => 'Describe what happened in a sentence or two, so the team can act on it.'];
    $name = $who['name'];
    $email = $who['email'];
    // A case about a child: only one the asker may speak for.
    $about = trim((string)($p['memberId'] ?? ''));
    if ($about !== '' && !in_array($about, array_column(support_subjects($who), 'id'), true)) $about = '';
    $centre = $who['centre'];
    if ($about !== '' && $centre === '') $centre = (string)(db_row('SELECT centre FROM members WHERE memberId = ?', [$about])['centre'] ?? '');
    $files = support_store_files(is_array($p['files'] ?? null) ? $p['files'] : []);
    if (empty($files['ok'])) return $files;

    // Already open about the same thing? A person pressing again after a quiet
    // day adds to their case and pushes it up the queue; they do not get two
    // numbers for one problem.
    {
        $have = db_row("SELECT * FROM support_cases WHERE requesterKind = ? AND requesterId = ? AND category = ? AND status IN ('new','open','pending')
                        AND createdAt >= ? ORDER BY caseNo DESC LIMIT 1", [$who['kind'], $who['id'], $cat, gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400)]);
        if ($have && mb_strtolower((string)$have['subject']) === mb_strtolower($subject)) {
            support_add_message((int)$have['caseNo'], 'requester', $who['id'], $name, $body, false, $files['files']);
            db_update('support_cases', ['status' => 'open', 'lastReplyBy' => 'requester', 'lastActivityAt' => now_iso(), 'updatedAt' => now_iso()], ['caseNo' => (int)$have['caseNo']]);
            return ['ok' => true, 'caseNo' => (int)$have['caseNo'], 'appended' => true];
        }
    }
    $no = 0;
    for ($i = 0; $i < 5 && $no === 0; $i++) {
        $try = support_next_no();
        try {
            db_insert('support_cases', [
                'caseNo' => $try, 'status' => 'new', 'priority' => $pri, 'category' => $cat, 'subcategory' => $sub, 'subject' => $subject,
                'requesterKind' => $who['kind'], 'requesterId' => $who['id'], 'name' => $name, 'email' => $email,
                'phone' => mb_substr(trim((string)($who['phone'] ?: ($p['phone'] ?? ''))), 0, 30), 'memberId' => $about, 'centre' => $centre,
                'source' => in_array((string)($p['source'] ?? ''), ['portal', 'community', 'family', 'staff'], true) ? (string)$p['source'] : 'portal',
                'pageUrl' => mb_substr((string)($p['pageUrl'] ?? ''), 0, 400),
                'userAgent' => mb_substr((string)($p['userAgent'] ?? ''), 0, 280), 'ipHash' => (string)($p['ip'] ?? '') !== '' ? hash('sha256', (string)$p['ip']) : '',
                'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'lastActivityAt' => now_iso(), 'lastReplyBy' => 'requester',
                'respondBy' => support_respond_by($pri), 'followUpOf' => max(0, (int)($p['followUpOf'] ?? 0)),
            ]);
            $no = $try;
        } catch (Throwable $e) { /* two cases minted the same number at once: take the next */ }
    }
    if ($no === 0) return ['ok' => false, 'error' => 'open_failed', 'detail' => 'The case could not be opened. Try again in a moment.'];
    support_add_message($no, 'requester', $who['id'], $name, $body, false, $files['files']);
    $url = support_case_url($no, $who['kind']);
    support_mail($email, 'Case ' . $no . ': ' . $subject, 'We have your case', 'Your case number is ' . $no . '. The team replies by email and on the case page.',
        'Priority: ' . $pri . ' (' . SUPPORT_PRIORITIES[$pri]['label'] . '). We aim to reply within ' . support_target_words($pri) . '.', $url);
    // An urgent or high case reaches the people who answer cases at once.
    if (in_array($pri, ['P1', 'P2'], true) && function_exists('staff_with_cap')) {
        notify_people(staff_with_cap('support'), ['kind' => 'support', 'title' => $pri . ' case ' . $no . ': ' . $subject,
            'body' => SUPPORT_CATEGORIES[$cat]['label'] . ' · from ' . $name, 'linkPage' => 'admin',
            'ctaLabel' => 'Open the case', 'ctaPath' => '/control/support/cases/' . $no, 'eyebrow' => 'NGG support']);
    }
    audit('support.open', $who['id'], (string)$no, ['category' => $cat, 'priority' => $pri, 'kind' => $who['kind']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'caseNo' => $no, 'appended' => false];
}

function support_target_words(string $pri): string {
    $h = (int)(SUPPORT_PRIORITIES[$pri]['hours'] ?? 48);
    return $h < 24 ? $h . ' hours' : ($h === 24 ? 'a day' : intdiv($h, 24) . ' days');
}

function support_add_message(int $caseNo, string $kind, string $authorId, string $authorName, string $body, bool $internal, array $files = []): void {
    db_insert('support_messages', ['caseNo' => $caseNo, 'authorKind' => $kind, 'authorId' => $authorId, 'authorName' => mb_substr($authorName, 0, 120),
        'body' => $body, 'internal' => $internal ? 1 : 0, 'files' => $files ? json_encode($files, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '',
        'createdAt' => now_iso()]);
}

/** support.mine — the signed-in person's cases, newest activity first. */
function support_mine(array $p): array {
    $who = $p['who'] ?? support_nobody();
    if (!in_array($who['kind'], ['member', 'guardian'], true)) return ['ok' => true, 'cases' => [], 'signedIn' => false];
    $rows = db_all('SELECT * FROM support_cases WHERE requesterKind = ? AND requesterId = ? ORDER BY lastActivityAt DESC LIMIT 50', [$who['kind'], $who['id']]);
    return ['ok' => true, 'signedIn' => true, 'cases' => array_map(static fn($c) => support_case_public($c, false), $rows)];
}

/** support.case — one case and its visible thread. */
function support_view(array $p): array {
    $c = support_case_for($p['who'] ?? support_nobody(), (int)($p['caseNo'] ?? 0));
    if (!$c) return ['ok' => false, 'error' => 'not_found', 'detail' => 'That case was not found, or the link is not yours.'];
    return ['ok' => true, 'case' => support_case_public($c)];
}

/** support.reply — the person writes back. A closed case gets a follow-up instead. */
function support_reply(array $p): array {
    $who = $p['who'] ?? support_nobody();
    $c = support_case_for($who, (int)($p['caseNo'] ?? 0));
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    $body = trim(mb_substr((string)($p['body'] ?? ''), 0, SUPPORT_BODY_MAX));
    if ($body === '') return ['ok' => false, 'error' => 'body_required', 'detail' => 'Write a reply first.'];
    $files = support_store_files(is_array($p['files'] ?? null) ? $p['files'] : []);
    if (empty($files['ok'])) return $files;
    if ((string)$c['status'] === 'closed') {
        $f = support_open(['who' => $who, 'category' => (string)$c['category'], 'priority' => (string)$c['priority'], 'subject' => 'Follow-up: ' . (string)$c['subject'],
            'body' => $body, 'followUpOf' => (int)$c['caseNo'], 'source' => (string)$c['source'], 'ip' => $p['ip'] ?? '']);
        return $f + ['followUp' => true];
    }
    support_add_message((int)$c['caseNo'], 'requester', $who['id'], (string)$c['name'], $body, false, $files['files']);
    $patch = ['lastReplyBy' => 'requester', 'lastActivityAt' => now_iso(), 'updatedAt' => now_iso()];
    if (in_array($c['status'], ['pending', 'solved'], true)) { $patch['status'] = 'open'; $patch['solvedAt'] = ''; }
    db_update('support_cases', $patch, ['caseNo' => (int)$c['caseNo']]);
    if ((string)$c['assigneeId'] !== '') push_notification((string)$c['assigneeId'], ['kind' => 'support', 'title' => 'Case ' . $c['caseNo'] . ': a reply', 'body' => mb_substr($body, 0, 140), 'linkPage' => 'admin']);
    return ['ok' => true, 'status' => $patch['status'] ?? (string)$c['status']];
}

/** support.solve — the person says it is fixed. */
function support_solve(array $p): array {
    $c = support_case_for($p['who'] ?? support_nobody(), (int)($p['caseNo'] ?? 0));
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array($c['status'], SUPPORT_ACTIVE, true)) return ['ok' => true, 'status' => (string)$c['status']];
    db_update('support_cases', ['status' => 'solved', 'solvedAt' => now_iso(), 'lastActivityAt' => now_iso(), 'updatedAt' => now_iso()], ['caseNo' => (int)$c['caseNo']]);
    support_add_message((int)$c['caseNo'], 'system', '', '', 'Marked solved by ' . ((string)$c['name'] ?: 'the person who opened it') . '.', true);
    return ['ok' => true, 'status' => 'solved'];
}

/** support.rate — 1 to 5, once, on a solved or closed case. */
function support_rate(array $p): array {
    $c = support_case_for($p['who'] ?? support_nobody(), (int)($p['caseNo'] ?? 0));
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    $r = (int)($p['rating'] ?? 0);
    if ($r < 1 || $r > 5) return ['ok' => false, 'error' => 'bad_rating'];
    if (!in_array($c['status'], ['solved', 'closed'], true)) return ['ok' => false, 'error' => 'not_solved', 'detail' => 'Rate a case once it is solved.'];
    if ((int)$c['rating'] > 0) return ['ok' => false, 'error' => 'already_rated'];
    db_update('support_cases', ['rating' => $r, 'ratingNote' => mb_substr(trim((string)($p['note'] ?? '')), 0, 600), 'updatedAt' => now_iso()], ['caseNo' => (int)$c['caseNo']]);
    return ['ok' => true];
}

/** A file on a case, for the person or for staff. Returns the path to stream. */
function support_file(array $p): array {
    $no = (int)($p['caseNo'] ?? 0);
    if (!empty($p['staff'])) {
        $g = admin_cap_gate($p, 'support'); if (!$g['ok']) return $g;
        $c = db_row('SELECT * FROM support_cases WHERE caseNo = ?', [$no]);
        if (!$c || !support_in_scope($g['requester'], $c)) return ['ok' => false, 'error' => 'not_found'];
        $internalOk = true;
    } else {
        $c = support_case_for($p['who'] ?? support_nobody(), $no);
        if (!$c) return ['ok' => false, 'error' => 'not_found'];
        $internalOk = false;
    }
    $id = preg_replace('/[^a-f0-9]/', '', (string)($p['fileId'] ?? ''));
    foreach (db_all('SELECT files, internal FROM support_messages WHERE caseNo = ?', [$no]) as $m) {
        if ((int)$m['internal'] === 1 && !$internalOk) continue;
        foreach (json_decode((string)$m['files'], true) ?: [] as $f) {
            if ($f['id'] !== $id) continue;
            $path = __DIR__ . '/../../storage/support-files/' . $id . '.' . preg_replace('/[^a-z]/', '', (string)$f['ext']);
            if (!is_file($path)) return ['ok' => false, 'error' => 'file_missing'];
            return ['ok' => true, 'path' => $path, 'type' => (string)$f['type'], 'name' => (string)$f['name']];
        }
    }
    return ['ok' => false, 'error' => 'not_found'];
}

/* ── Staff ───────────────────────────────────────────────────────────────── */

/** A case's centre is in this staff member's scope (an unscoped admin sees all; a case with no centre is for unscoped staff). */
function support_in_scope(array $req, array $c): bool {
    $names = admin_centre_names_in_scope($req);
    if ($names === null) return true;
    return (string)$c['centre'] !== '' && in_array((string)$c['centre'], $names, true);
}

function support_staff_row(array $c, array $names): array {
    $due = (string)$c['respondBy'];
    $waiting = in_array($c['status'], ['new', 'open'], true);
    return ['caseNo' => (int)$c['caseNo'], 'subject' => (string)$c['subject'], 'status' => (string)$c['status'], 'priority' => (string)$c['priority'],
        'category' => (string)$c['category'], 'categoryL' => SUPPORT_CATEGORIES[$c['category']]['label'] ?? '', 'subcategory' => (string)$c['subcategory'],
        'name' => (string)$c['name'], 'kind' => (string)$c['requesterKind'], 'centre' => (string)$c['centre'],
        'assigneeId' => (string)$c['assigneeId'], 'assignee' => $names[(string)$c['assigneeId']] ?? '',
        'createdAt' => (string)$c['createdAt'], 'lastActivityAt' => (string)$c['lastActivityAt'], 'lastReplyBy' => (string)$c['lastReplyBy'],
        'respondBy' => $due, 'overdue' => $waiting && $due !== '' && $due < now_iso(), 'rating' => (int)$c['rating']];
}

/** admin.support.list — the queue. Filters allow-listed; unknown values fall back. */
function admin_support_list(array $p): array {
    $g = admin_cap_gate($p, 'support'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $where = ['1 = 1']; $args = [];
    $scope = admin_centre_names_in_scope($req);
    if ($scope !== null) {
        if (!$scope) $where[] = '1 = 0';
        else { $where[] = 'centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; foreach ($scope as $n) $args[] = $n; }
    }
    $base = implode(' AND ', $where); $baseArgs = $args;
    $status = (string)($p['status'] ?? 'active');
    if ($status === 'active') $where[] = "status IN ('new','open','pending')";
    elseif (isset(SUPPORT_STATUSES[$status])) { $where[] = 'status = ?'; $args[] = $status; }
    else $status = 'all';
    $pri = (string)($p['priority'] ?? '');
    if (isset(SUPPORT_PRIORITIES[$pri])) { $where[] = 'priority = ?'; $args[] = $pri; }
    $cat = (string)($p['category'] ?? '');
    if (isset(SUPPORT_CATEGORIES[$cat])) { $where[] = 'category = ?'; $args[] = $cat; }
    $who = (string)($p['assignee'] ?? '');
    if ($who === 'me') { $where[] = 'assigneeId = ?'; $args[] = (string)$req['memberId']; }
    elseif ($who === 'none') $where[] = "assigneeId = ''";
    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') {
        if (ctype_digit($q)) { $where[] = 'caseNo = ?'; $args[] = (int)$q; }
        else { [$tSql, $tArgs] = sql_text_search($q, ['subject', 'name', 'email', 'centre']); if ($tSql !== '') { $where[] = $tSql; foreach ($tArgs as $a) $args[] = $a; } }
    }
    $w = implode(' AND ', $where);
    $total = (int)(db_row("SELECT COUNT(*) c FROM support_cases WHERE $w", $args)['c'] ?? 0);
    $sort = (string)($p['sort'] ?? 'due');
    $order = ['due' => "CASE WHEN status IN ('new','open') THEN 0 ELSE 1 END, priority, respondBy", 'recent' => 'lastActivityAt DESC', 'oldest' => 'createdAt', 'number' => 'caseNo DESC'][$sort] ?? null;
    if ($order === null) { $sort = 'due'; $order = "CASE WHEN status IN ('new','open') THEN 0 ELSE 1 END, priority, respondBy"; }
    $page = max(0, (int)($p['page'] ?? 0));
    $rows = db_all("SELECT * FROM support_cases WHERE $w ORDER BY $order LIMIT " . SUPPORT_PAGE . ' OFFSET ' . ($page * SUPPORT_PAGE), $args);
    $ids = array_values(array_unique(array_filter(array_column($rows, 'assigneeId'))));
    $names = [];
    if ($ids) foreach (db_all('SELECT memberId, fullName FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $m) $names[(string)$m['memberId']] = (string)$m['fullName'];
    $counts = array_fill_keys(array_keys(SUPPORT_STATUSES), 0);
    foreach (db_all("SELECT status, COUNT(*) n FROM support_cases WHERE $base GROUP BY status", $baseArgs) as $r) $counts[(string)$r['status']] = (int)$r['n'];
    $now = now_iso();
    $kp = db_row("SELECT SUM(CASE WHEN status IN ('new','open') AND respondBy <> '' AND respondBy < ? THEN 1 ELSE 0 END) overdue,
                         SUM(CASE WHEN status IN ('new','open','pending') AND assigneeId = '' THEN 1 ELSE 0 END) unassigned,
                         SUM(CASE WHEN status IN ('new','open','pending') AND priority IN ('P1','P2') THEN 1 ELSE 0 END) urgent
                  FROM support_cases WHERE $base", array_merge([$now], $baseArgs)) ?: [];
    $rated = db_row("SELECT AVG(rating) a, COUNT(*) n FROM support_cases WHERE rating > 0 AND $base", $baseArgs) ?: [];
    return ['ok' => true, 'rows' => array_map(static fn($c) => support_staff_row($c, $names), $rows), 'total' => $total, 'page' => $page, 'pageSize' => SUPPORT_PAGE,
        'counts' => $counts, 'applied' => ['status' => $status, 'priority' => isset(SUPPORT_PRIORITIES[$pri]) ? $pri : '', 'category' => isset(SUPPORT_CATEGORIES[$cat]) ? $cat : '', 'assignee' => in_array($who, ['me', 'none'], true) ? $who : '', 'sort' => $sort],
        'kpis' => ['active' => $counts['new'] + $counts['open'] + $counts['pending'], 'overdue' => (int)($kp['overdue'] ?? 0), 'unassigned' => (int)($kp['unassigned'] ?? 0),
                   'urgent' => (int)($kp['urgent'] ?? 0), 'rating' => $rated && (int)$rated['n'] > 0 ? round((float)$rated['a'], 1) : null, 'rated' => (int)($rated['n'] ?? 0)],
        'meta' => ['categories' => array_map(static fn($k) => ['id' => $k, 'label' => SUPPORT_CATEGORIES[$k]['label']], array_keys(SUPPORT_CATEGORIES)),
                   'priorities' => array_map(static fn($k) => ['id' => $k] + SUPPORT_PRIORITIES[$k], array_keys(SUPPORT_PRIORITIES)), 'statuses' => SUPPORT_STATUSES, 'bulkMax' => SUPPORT_BULK_MAX]];
}

/** admin.support.case — everything about one case, internal notes included. */
function admin_support_case(array $p): array {
    $g = admin_cap_gate($p, 'support'); if (!$g['ok']) return $g;
    $c = db_row('SELECT * FROM support_cases WHERE caseNo = ? LIMIT 1', [(int)($p['caseNo'] ?? 0)]);
    if (!$c || !support_in_scope($g['requester'], $c)) return ['ok' => false, 'error' => 'not_found'];
    $msgs = array_map(static function ($m) {
        $f = json_decode((string)$m['files'], true) ?: [];
        return ['id' => (int)$m['id'], 'by' => (string)$m['authorKind'], 'authorId' => (string)$m['authorId'], 'name' => (string)$m['authorName'],
            'body' => (string)$m['body'], 'internal' => (int)$m['internal'] === 1, 'files' => array_map(static fn($x) => ['id' => $x['id'], 'name' => $x['name'], 'type' => $x['type']], $f), 'at' => (string)$m['createdAt']];
    }, db_all('SELECT * FROM support_messages WHERE caseNo = ? ORDER BY id', [(int)$c['caseNo']]));
    $staffIds = array_values(array_unique(array_filter(array_merge([(string)$c['assigneeId']], array_column(array_filter($msgs, static fn($m) => $m['by'] === 'staff'), 'authorId')))));
    $names = [];
    if ($staffIds) foreach (db_all('SELECT memberId, fullName FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($staffIds), '?')) . ')', $staffIds) as $m) $names[(string)$m['memberId']] = (string)$m['fullName'];
    foreach ($msgs as &$m) if ($m['by'] === 'staff') $m['name'] = $names[$m['authorId']] ?? $m['name'];
    unset($m);
    $others = (string)$c['requesterId'] !== ''
        ? db_all('SELECT caseNo, subject, status, createdAt FROM support_cases WHERE requesterKind = ? AND requesterId = ? AND caseNo <> ? ORDER BY caseNo DESC LIMIT 10', [(string)$c['requesterKind'], (string)$c['requesterId'], (int)$c['caseNo']])
        : db_all("SELECT caseNo, subject, status, createdAt FROM support_cases WHERE email = ? AND email <> '' AND caseNo <> ? ORDER BY caseNo DESC LIMIT 10", [(string)$c['email'], (int)$c['caseNo']]);
    $agents = array_map(static fn($s) => ['id' => (string)$s['memberId'], 'name' => (string)$s['fullName']], function_exists('staff_with_cap') ? staff_with_cap('support') : []);
    $row = support_staff_row($c, $names);
    return ['ok' => true, 'case' => $row + ['email' => (string)$c['email'], 'phone' => (string)$c['phone'], 'memberId' => (string)$c['memberId'],
        'pageUrl' => (string)$c['pageUrl'], 'userAgent' => (string)$c['userAgent'], 'firstResponseAt' => (string)$c['firstResponseAt'],
        'solvedAt' => (string)$c['solvedAt'], 'closedAt' => (string)$c['closedAt'], 'ratingNote' => (string)$c['ratingNote'], 'followUpOf' => (int)$c['followUpOf'],
        'source' => (string)$c['source'], 'ask' => SUPPORT_CATEGORIES[$c['category']]['ask'] ?? []],
        'messages' => $msgs, 'others' => $others, 'agents' => $agents, 'replies' => support_canned()];
}

/** Saved replies: the openings staff type most, kept short and editable before sending. */
function support_canned(): array {
    return [
        ['id' => 'more', 'l' => 'Ask for details', 'body' => "Thank you for writing. So we can look into this, please reply with:\n- \n\nWe’ll pick it up as soon as we hear back."],
        ['id' => 'fixed', 'l' => 'Fixed', 'body' => "This is sorted now. Please check, and reply here if anything is still not right."],
        ['id' => 'centre', 'l' => 'Passed to the centre', 'body' => "I’ve passed this to the team at your centre, who can sort it on Saturday. You’ll hear from us here."],
    ];
}

/**
 * admin.support.reply — a staff reply or an internal note. A public reply emails
 * the person and, by default, waits for them (pending); `status` may say solved.
 */
function admin_support_reply(array $p): array {
    $g = admin_cap_gate($p, 'support'); if (!$g['ok']) return $g;
    $c = db_row('SELECT * FROM support_cases WHERE caseNo = ? LIMIT 1', [(int)($p['caseNo'] ?? 0)]);
    if (!$c || !support_in_scope($g['requester'], $c)) return ['ok' => false, 'error' => 'not_found'];
    $body = trim(mb_substr((string)($p['body'] ?? ''), 0, SUPPORT_BODY_MAX));
    if ($body === '') return ['ok' => false, 'error' => 'body_required', 'detail' => 'Write the reply first.'];
    $internal = !empty($p['internal']);
    $files = support_store_files(is_array($p['files'] ?? null) ? $p['files'] : []);
    if (empty($files['ok'])) return $files;
    $me = $g['requester'];
    support_add_message((int)$c['caseNo'], 'staff', (string)$me['memberId'], (string)$me['fullName'], $body, $internal, $files['files']);
    $patch = ['updatedAt' => now_iso(), 'lastActivityAt' => now_iso()];
    if ((string)$c['assigneeId'] === '') $patch['assigneeId'] = (string)$me['memberId'];
    if (!$internal) {
        $to = in_array((string)($p['status'] ?? ''), ['solved', 'open', 'pending'], true) ? (string)$p['status'] : 'pending';
        if ((string)$c['status'] === 'closed') $to = 'closed';
        $patch += ['status' => $to, 'lastReplyBy' => 'staff'];
        if ((string)$c['firstResponseAt'] === '') $patch['firstResponseAt'] = now_iso();
        if ($to === 'solved') $patch['solvedAt'] = now_iso();
        // The next reply from staff is due when the person writes back, not before.
        $patch['respondBy'] = $to === 'open' ? support_respond_by((string)$c['priority']) : '';
        $email = (string)$c['email'];
        $sent = support_mail($email, 'Case ' . $c['caseNo'] . ': ' . ($to === 'solved' ? 'solved' : 'a reply from NGG'), $to === 'solved' ? 'We think this is solved' : 'A reply on your case',
            'Case ' . $c['caseNo'] . ': ' . (string)$c['subject'], $body . ($to === 'solved' ? "\n\nIf it is not, reply on the case page within " . SUPPORT_CLOSE_DAYS . ' days and it opens again.' : ''),
            support_case_url((int)$c['caseNo'], (string)$c['requesterKind']));
        if ((string)$c['requesterKind'] === 'member') push_notification((string)$c['requesterId'], ['kind' => 'support', 'title' => 'A reply on case ' . $c['caseNo'], 'body' => mb_substr($body, 0, 140), 'linkPage' => 'support', 'linkRef' => (string)$c['caseNo'], 'actionLabel' => 'Open the case']);
    }
    db_update('support_cases', $patch, ['caseNo' => (int)$c['caseNo']]);
    audit($internal ? 'support.note' : 'support.reply', (string)$me['memberId'], (string)$c['caseNo'], ['status' => $patch['status'] ?? (string)$c['status']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $patch['status'] ?? (string)$c['status'], 'emailed' => !$internal && !empty($sent)];
}

/**
 * admin.support.bulk — assign, status or priority for one case or many. One op,
 * declared actions, per-row verdicts, one audit event, a named cap.
 */
function admin_support_bulk(array $p): array {
    $g = admin_cap_gate($p, 'support'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $action = (string)($p['action'] ?? '');
    $value = (string)($p['value'] ?? '');
    if (!in_array($action, ['assign', 'status', 'priority', 'category'], true)) return ['ok' => false, 'error' => 'unknown_action'];
    if ($action === 'status' && !in_array($value, ['open', 'pending', 'solved', 'closed'], true)) return ['ok' => false, 'error' => 'bad_status'];
    if ($action === 'priority' && !isset(SUPPORT_PRIORITIES[$value])) return ['ok' => false, 'error' => 'bad_priority'];
    if ($action === 'category' && !isset(SUPPORT_CATEGORIES[$value])) return ['ok' => false, 'error' => 'bad_category'];
    if ($action === 'assign') {
        if ($value === 'me') $value = (string)$req['memberId'];
        if ($value !== '' && !in_array($value, array_map(static fn($s) => (string)$s['memberId'], staff_with_cap('support')), true)) return ['ok' => false, 'error' => 'bad_assignee', 'detail' => 'Only somebody who answers cases can be given one.'];
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($p['caseNos'] ?? null) ? $p['caseNos'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > SUPPORT_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => SUPPORT_BULK_MAX, 'detail' => 'At most ' . SUPPORT_BULK_MAX . ' cases at once.'];
    $results = []; $applied = 0; $unchanged = 0; $refused = 0;
    foreach ($ids as $no) {
        $c = db_row('SELECT * FROM support_cases WHERE caseNo = ? LIMIT 1', [$no]);
        if (!$c) { $refused++; $results[] = ['caseNo' => $no, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!support_in_scope($req, $c)) { $refused++; $results[] = ['caseNo' => $no, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        $col = ['assign' => 'assigneeId', 'status' => 'status', 'priority' => 'priority', 'category' => 'category'][$action];
        if ((string)$c[$col] === $value) { $unchanged++; $results[] = ['caseNo' => $no, 'ok' => true, 'unchanged' => true]; continue; }
        if ($action === 'status' && (string)$c['status'] === 'closed') { $refused++; $results[] = ['caseNo' => $no, 'ok' => false, 'error' => 'closed', 'detail' => 'A closed case stays closed; a reply opens a follow-up.']; continue; }
        $patch = [$col => $value, 'updatedAt' => now_iso()];
        if ($action === 'priority' && in_array($c['status'], ['new', 'open'], true)) $patch['respondBy'] = support_respond_by($value, strtotime((string)$c['lastActivityAt']) ?: time());
        if ($action === 'status') {
            if ($value === 'solved') $patch['solvedAt'] = now_iso();
            if ($value === 'closed') $patch['closedAt'] = now_iso();
            if ($value === 'open') $patch['respondBy'] = support_respond_by((string)$c['priority']);
        }
        db_update('support_cases', $patch, ['caseNo' => $no]);
        if ($action === 'assign' && $value !== '' && $value !== (string)$req['memberId']) push_notification($value, ['kind' => 'support', 'title' => 'Case ' . $no . ' is yours', 'body' => (string)$c['subject'], 'linkPage' => 'admin']);
        $applied++; $results[] = ['caseNo' => $no, 'ok' => true];
    }
    audit('support.bulk', (string)$req['memberId'], '', ['action' => $action, 'value' => $value, 'requested' => count($ids), 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'results' => $results];
}

/** admin.support.open — staff open a case for a member who rang or walked in; it appears in their portal. */
function admin_support_open(array $p): array {
    $g = admin_cap_gate($p, 'support'); if (!$g['ok']) return $g;
    $who = support_who_member(trim((string)($p['memberId'] ?? '')));
    if (!$who) return ['ok' => false, 'error' => 'member_required', 'detail' => 'Choose the member the case is for.'];
    if (!admin_centre_allowed($g['requester'], $who['centre'] ?: null) && admin_centre_names_in_scope($g['requester']) !== null) return ['ok' => false, 'error' => 'out_of_scope'];
    $r = support_open(array_merge($p, ['who' => $who, 'memberId' => $who['id'], 'source' => 'staff']));
    if (!empty($r['ok']) && empty($r['appended'])) db_update('support_cases', ['assigneeId' => (string)$g['requester']['memberId']], ['caseNo' => (int)$r['caseNo']]);
    return $r;
}

/**
 * The nightly tidy (webcron): a solved case nobody reopened closes after
 * SUPPORT_CLOSE_DAYS; a case waiting on the person who never wrote back is
 * solved after SUPPORT_PENDING_DAYS, with a note saying so.
 */
function support_housekeeping(): array {
    $closeBefore = gmdate('Y-m-d\TH:i:s\Z', time() - SUPPORT_CLOSE_DAYS * 86400);
    $closed = db_exec("UPDATE support_cases SET status = 'closed', closedAt = ?, updatedAt = ? WHERE status = 'solved' AND solvedAt <> '' AND solvedAt < ?", [now_iso(), now_iso(), $closeBefore]);
    $quiet = db_all("SELECT caseNo FROM support_cases WHERE status = 'pending' AND lastActivityAt < ? LIMIT 200", [gmdate('Y-m-d\TH:i:s\Z', time() - SUPPORT_PENDING_DAYS * 86400)]);
    foreach ($quiet as $q) {
        db_update('support_cases', ['status' => 'solved', 'solvedAt' => now_iso(), 'updatedAt' => now_iso()], ['caseNo' => (int)$q['caseNo']]);
        support_add_message((int)$q['caseNo'], 'system', '', '', 'Solved after ' . SUPPORT_PENDING_DAYS . ' days without a reply. A reply opens it again.', false);
    }
    return ['closed' => $closed, 'solved' => count($quiet)];
}
