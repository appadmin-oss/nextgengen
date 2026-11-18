<?php
declare(strict_types=1);

/**
 * The Membership Agreement — NGG's Memorandum of Understanding, signed online.
 *
 * The paper MoU (Okun Alimosho / Afrovanguard and the family) was a handout to
 * fill in, sign, photocopy and return. This is the same agreement, rewritten in
 * plain, professional English (owner, 18 Nov 2026: "refine the MoU, make it
 * standard and professional and understandable … merge it with some of the
 * consent features"), and signed by the people it binds:
 *
 *   1. THE FAMILY reads it — every clause has a one-line "In short" over the
 *      full wording — answers five short questions about what matters most
 *      (instant feedback, a wrong answer shows the clause and they try again;
 *      nobody is locked out), confirms the details, makes the consent choices
 *      and signs. A typed name AND a drawn signature.
 *   2. A WITNESS signs: another adult on the same screen, now; or NGG's
 *      representative witnesses at the centre when they countersign.
 *   3. NGG'S REPRESENTATIVE countersigns in the Control Room.
 *
 * A copy goes by email at every stage: the family's own signed copy straight
 * after they sign, and the completed agreement once NGG countersigns. The
 * printable copy (A4, "Print or save as PDF") lives behind a private link.
 *
 * MERGED WITH THE CONSENTS. Clause 8 is the consents of membership: when the
 * family signs, each one is written to the consents ledger (method `mou`, the
 * agreement's version as the policy version, the signer's name), so the family
 * app, the registration checklist and the member record all read ONE answer.
 *
 * MONEY IS NEVER HARD-CODED HERE. The figures quoted (monthly contribution,
 * membership fee, training place) are read from the fee settings at the moment
 * of signing and FROZEN on the agreement (`termsJson`), so the copy a family
 * signed always shows what they agreed to, and a later change of settings never
 * rewrites it.
 *
 * Electronic signatures: section 93 of the Evidence Act 2011 (Nigeria). The
 * record keeps who signed, when, from which address, and a SHA-256 of the exact
 * text and figures they saw.
 */

const MOU_VERSION = '2026.11';
const MOU_POLICY = 'MOU-2026.11';
const MOU_TOKEN_DAYS = 45;
const MOU_SIG_MAX = 200000;        // a drawn signature, as a PNG data URL
const MOU_BULK_MAX = 200;
const MOU_STATES = ['awaiting_family', 'awaiting_ngg', 'signed', 'void'];
const MOU_ORG = 'Okun Alimosho, the Alimosho chapter of Ambassadors for Community, Tech and Cultural Advancements (Afrovanguard), a non-governmental organisation registered in Nigeria (No. 186151)';
const MOU_CONTACT = 'next@afrovanguard.org.ng';
/* The consents of membership this agreement grants (clause 8). Trips stay a choice. */
const MOU_CONSENTS_GRANTED = ['participation', 'medical', 'data', 'comms', 'media', 'site_visibility'];

/**
 * The agreement, clause by clause. {placeholders} are filled from the fee
 * settings frozen on the record (mou_figures). `short` is the plain-language
 * line a parent reads first; `body` is the wording they sign.
 */
function mou_sections(): array {
    return [
        ['id' => 'parties', 'title' => 'Who this agreement is between',
         'short' => 'NGG and you, the parent or guardian, agree how your child will learn and grow with us.',
         'body' => ['This Membership Agreement ("the Agreement") is made between ' . MOU_ORG . ' ("NGG"), which runs the Next Generation Genius Club, and the parent or guardian named below ("the Family"), for the child named below ("the Member").',
                    'Afrovanguard works for the Alimosho community: youth empowerment, talent development, culture and community advancement. The Agreement sets out what each of us commits to, so that the Member receives quality training, steady support and clear expectations.']],
        ['id' => 'term', 'title' => 'Three years: learning, then serving',
         'short' => 'Membership lasts 3 years: about {trainingMonths} months of training, then {serviceMonths} months of service. Completing it makes your child an Afrovanguard Ambassador.',
         'body' => ['NGG is a finishing school. The Member will learn and serve at NGG for three (3) years from the date their membership starts: about {trainingMonths} months of training, followed by about {serviceMonths} months of service, in which the Member uses their skills for NGG and mentors younger members.',
                    'On completing the three years satisfactorily, the Member becomes an official Ambassador of Afrovanguard.']],
        ['id' => 'provides', 'title' => 'What NGG provides',
         'short' => 'Mentoring, training in your child’s course, preparation for competitions and scholarships, an ID card, and regular reports to you.',
         'body' => ['NGG will provide: a named mentor; training in the Member’s chosen division and course; preparation for local and international competitions and scholarships; an NGG ID card; a safe, supervised place to learn; and progress reports and updates to the Family through the NGG Family app and by email.']],
        ['id' => 'member', 'title' => 'What the Member commits to',
         'short' => 'Come to every class on time, practise weekly, join the monthly community engagement, carry the ID card, and follow the Membership Policy.',
         'body' => ['The Member will: attend classes, arriving on time as the Membership Policy sets out, and give at least one week’s written notice of any planned absence to ' . MOU_CONTACT . '; attend one practice session a week at the Okun Alimosho office to practise what has been taught; take part in the community engagement exercise held once a month, which is required of every member; carry the NGG ID card at all times; and follow the NGG Membership Policy in the Membership Handbook.']],
        ['id' => 'family', 'title' => 'What the Family commits to',
         'short' => 'Attend parents’ meetings, check your child’s weekly assessments, and be honest with us about your child.',
         'body' => ['The Family will: attend the monthly or quarterly parents’ meetings and NGG events; check the Member’s weekly assessments and discuss them with the Member; be honest and open with NGG about the Member’s behaviour, progress and challenges; and support the values NGG teaches at home.',
                    'Under the Policy for Parents, dishonesty about a member may lead to a suspension of up to two weeks and a fine of ₦10,000, and a family that does not take part may have this Agreement ended.']],
        ['id' => 'fees', 'title' => 'Fees and contributions',
         'short' => 'A monthly support contribution of {monthlyDues}{membershipLine}. The training place ({trainingFee}) is written off as your child serves — you only pay it if you end the Agreement early.',
         'body' => ['The Family will pay a monthly support contribution of {monthlyDues}, due at the end of each month, towards the running and maintenance of the CAC Centre.{membershipSentence}',
                    'The training NGG provides is valued at {trainingFee} ("the training place"). It is not a bill while the Member continues: it is written down as the Member serves, and by the end of the three years it is written down in full. If the Agreement ends early, the part not yet written down becomes payable (clause 12).',
                    'Fines under the Membership Policy, and any repair or replacement under clause 10, are added to the Member’s account. The Family can see the account and every payment in the NGG Family app.']],
        ['id' => 'conduct', 'title' => 'Conduct and discipline',
         'short' => 'Rules and fines are in the Membership Policy. Discipline is step by step; a suspension is not the end of membership.',
         'body' => ['The Member will follow NGG’s code of conduct throughout the programme. Breaches are dealt with step by step, as the Membership Policy sets out: a warning, a letter of query, a fine where the policy names one, and if necessary a suspension.',
                    'A suspension is a disciplinary measure, not the end of membership. Only the NGG Senate may end a membership for conduct. The Family will be told at each step and is encouraged to discuss it with the Member.']],
        ['id' => 'consents', 'title' => 'Consents',
         'short' => 'You allow your child to take part, emergency medical care, us keeping their records, updates to you, and photos/videos (first names only). Off-site trips are your choice.',
         'body' => ['By signing, the Family gives the following consents for as long as the Member is with NGG:',
                    '(a) Taking part: the Member may take part in all club activities. (b) Emergency medical care: in an emergency NGG may seek medical attention and treatment for the Member; every effort will first be made to reach the Family or the emergency contact on record. (c) Records and privacy: NGG keeps the Member’s records to run the programme, in line with the Nigeria Data Protection Act 2023, and never sells them. (d) Family updates: NGG may send updates by the Family app, email, SMS and similar. (e) Photos and videos: photos and videos of the Member taken during club activities may be used for promotional or educational purposes by Afrovanguard. Full names and other identifying details are never published without further consent. (f) The website: NGG may show the Member’s first name and work on its website.',
                    '(g) Off-site activities: this one is the Family’s choice, made below. If given, the Member may travel with authorised NGG staff for off-site activities and trips. Safe transport will be arranged; where a trip carries a transport cost, the Family will be told before and may be asked to pay it.']],
        ['id' => 'talent', 'title' => 'Talent management and earnings',
         'short' => 'NGG manages your child’s talent for 3 years. Prize money or sponsorship: child 30%, instructor 10%, NGG 60%. Scholarship money: 100% to your child.',
         'body' => ['NGG acts as the Member’s talent manager for the three years, in charge of developing and presenting the Member’s talent.',
                    'Any prize, award, ambassadorial deal or other income the Member earns through the programme during the three years is shared: the Member 30%, the instructor 10%, NGG 60%.',
                    'Money or resources given as a scholarship for the Member, in the exact amount needed for it, go 100% to the Member.',
                    'Gifts, in money or otherwise, given to members on a group visit are shared: the group of members 30%, NGG 70%.']],
        ['id' => 'property', 'title' => 'Care of NGG property',
         'short' => 'If your child damages, loses or misuses NGG equipment, the family pays to repair or replace it.',
         'body' => ['Gadgets, furniture and other items entrusted to the Member must be handled responsibly. If any is damaged, lost or misused by the Member, the Family will pay for its repair or replacement, as assessed by NGG.']],
        ['id' => 'liability', 'title' => 'Safety and liability',
         'short' => 'NGG takes care of your child, but you agree not to hold NGG liable for ordinary accidents — only for wilful misconduct or gross negligence.',
         'body' => ['NGG will take reasonable care of the Member. The Family releases NGG, its organisers, staff and volunteers from any claim arising from the Member’s participation in the programme, except a claim arising from wilful misconduct or gross negligence.']],
        ['id' => 'ending', 'title' => 'Ending the Agreement early',
         'short' => 'To leave before 3 years, give 3 months’ written notice (or pay ₦30,000) and settle the part of the training place not yet written off.',
         'body' => ['A party wishing to end this Agreement before the three years are complete must give at least three (3) months’ written notice to NGG management at ' . MOU_CONTACT . ', stating the reason and the preferred date. Shorter notice incurs an inconvenience fee of ₦30,000.',
                    'On early termination the part of the training place not yet written down (clause 6) becomes payable, as compensation for the training, resources and opportunities provided, together with any unpaid contributions and fines. NGG will provide a financial assessment; both parties sign a settlement confirming the amount, and the Agreement is then formally closed.']],
        ['id' => 'general', 'title' => 'Changes, copies and signatures',
         'short' => 'You get a copy by email. Policies may be updated with notice. Signing online is as valid as signing on paper.',
         'body' => ['The Membership Handbook and its policies may be updated by NGG; the Family will be told of any change. The figures in this Agreement are those in force on the day the Family signs.',
                    'A copy of the signed Agreement is emailed to the Family and kept by NGG. Signatures given electronically are valid and binding, as section 93 of the Evidence Act 2011 provides. NGG records who signed, when, and the exact text signed.']],
    ];
}

/** The comprehension check: five questions on what matters most. `a` is the right option. */
function mou_quiz(): array {
    return [
        ['id' => 'q1', 'clause' => 'term', 'q' => 'How long does the Agreement last?',
         'o' => ['One year', 'Three years: training, then service', 'Until secondary school ends'], 'a' => 1],
        ['id' => 'q2', 'clause' => 'ending', 'q' => 'You decide to leave after one year. What must you do?',
         'o' => ['Nothing — just stop coming', 'Give 3 months’ written notice and settle the training place not yet written off', 'Pay one month’s contribution'], 'a' => 1],
        ['id' => 'q3', 'clause' => 'talent', 'q' => 'Your child wins ₦100,000 in a competition through NGG. How is it shared?',
         'o' => ['All of it to your child', 'Your child 30%, the instructor 10%, NGG 60%', 'Half to your child, half to NGG'], 'a' => 1],
        ['id' => 'q4', 'clause' => 'talent', 'q' => 'A sponsor gives money for your child’s scholarship. Who gets it?',
         'o' => ['Your child — all of it', 'NGG keeps 70%', 'It is shared with the group'], 'a' => 0],
        ['id' => 'q5', 'clause' => 'property', 'q' => 'Your child carelessly breaks an NGG laptop. Who pays to repair it?',
         'o' => ['NGG', 'The instructor', 'Your family'], 'a' => 2],
    ];
}

/** The fee figures in force now, in words, to freeze on a new agreement. */
function mou_figures(): array {
    $cfg = function_exists('fees_settings') ? fees_settings() : [];
    $money = static fn($n) => function_exists('fees_money_text') ? fees_money_text((int)$n) : '₦' . number_format((int)$n);
    $train = (int)($cfg['trainingFee'] ?? 300000);
    $basis = (string)($cfg['trainingBasis'] ?? 'total');
    $per = ['total' => ' for the three years', 'session' => ' a training session', 'day' => ' a training day', 'week' => ' a training week'][$basis] ?? '';
    $mem = (int)($cfg['membershipFee'] ?? 0);
    $every = (int)($cfg['membershipEveryMonths'] ?? 12);
    return [
        'monthlyDues' => $money((int)($cfg['monthlyDues'] ?? 0) > 0 ? (int)$cfg['monthlyDues'] : 1000),
        'trainingFee' => $money($train) . $per,
        'membershipLine' => $mem > 0 ? ', and a membership fee of ' . $money($mem) . ($every > 0 && $every !== 12 ? ' every ' . $every . ' months' : ' a year') : '',
        'membershipSentence' => $mem > 0 ? ' A membership fee of ' . $money($mem) . ' is due on joining' . ($every > 0 ? ' and every ' . ($every === 12 ? 'year' : $every . ' months') . ' after' : '') . '.' : '',
        'trainingMonths' => (string)(int)($cfg['trainingMonths'] ?? 18),
        'serviceMonths' => (string)(int)($cfg['serviceMonths'] ?? 18),
    ];
}

/** The sections with a record's frozen figures filled in. */
function mou_terms(array $figures): array {
    $fill = static fn($s) => strtr($s, array_combine(array_map(static fn($k) => '{' . $k . '}', array_keys($figures)), array_values($figures)));
    return array_map(static fn($s) => ['id' => $s['id'], 'title' => $s['title'], 'short' => $fill($s['short']), 'body' => array_map($fill, $s['body'])], mou_sections());
}

/* ── The record ────────────────────────────────────────────────────────── */

function mou_token(): string { return rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '='); }
function mou_hash(string $t): string { return hash('sha256', 'mou|' . $t); }
function mou_origin(): string { return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'); }

/** The agreement open (or signed) for a member, newest first; null when none. */
function mou_current(string $memberId): ?array {
    return db_row("SELECT * FROM mou_agreements WHERE memberId = ? AND status <> 'void' ORDER BY id DESC LIMIT 1", [$memberId]) ?: null;
}

/** What the family is asked to confirm, pre-filled from the member and their application. */
function mou_prefill(array $m): array {
    $det = [];
    $app = db_row("SELECT details, phone FROM applications WHERE convertedMemberId = ? ORDER BY id DESC LIMIT 1", [(string)$m['memberId']]);
    if ($app) $det = json_decode((string)($app['details'] ?? ''), true) ?: [];
    $pj = json_decode((string)($m['profileJson'] ?? ''), true) ?: [];
    $father = ''; $mother = ''; $guardian = '';
    foreach ([1, 2] as $i) {
        $rel = (string)($det['parent' . $i . 'Rel'] ?? ''); $nm = (string)($det['parent' . $i . 'Name'] ?? '');
        if ($nm === '') continue;
        if ($rel === 'Father' && $father === '') $father = $nm; elseif ($rel === 'Mother' && $mother === '') $mother = $nm; elseif ($guardian === '') $guardian = $nm;
    }
    if ($father === '' && $mother === '' && $guardian === '') $guardian = (string)($m['parentName'] ?? '');
    $age = !empty($m['dob']) && function_exists('dob_age') ? dob_age((string)$m['dob']) : -1;
    return [
        'family' => ['fatherName' => $father, 'motherName' => $mother, 'guardianName' => $guardian,
                     'address' => (string)($det['address'] ?? $pj['address'] ?? ''), 'phone' => (string)($m['parentPhone'] ?? ''), 'email' => (string)($m['parentEmail'] ?? $m['email'] ?? '')],
        'member' => ['fullName' => (string)$m['fullName'], 'address' => (string)($pj['address'] ?? $det['address'] ?? ''), 'phone' => (string)($m['phone'] ?? ''),
                     'age' => $age >= 0 ? (string)$age : '', 'school' => (string)($m['school'] ?? ''), 'class' => (string)($pj['class'] ?? $det['class'] ?? ''),
                     'department' => (string)($m['disciplines'] ?? $m['track'] ?? '')],
    ];
}

/**
 * Start an agreement for a member and send the family the link. Idempotent:
 * a member with one already open or signed gets that one back (`existed`).
 * Returns ['ok', 'mouId', 'link', 'sentTo' => [...], 'existed'?].
 */
function mou_start(array $m, string $by, bool $send = true): array {
    if (function_exists('member_is_ngg') && !member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg', 'message' => 'The Membership Agreement is for NGG members, not Summer School.'];
    $cur = mou_current((string)$m['memberId']);
    if ($cur) return ['ok' => true, 'mouId' => (string)$cur['mouId'], 'status' => (string)$cur['status'], 'existed' => true];
    $token = mou_token(); $now = now_iso();
    $id = new_id('MOU', 'mou_agreements', 'mouId');
    db_insert('mou_agreements', [
        'mouId' => $id, 'memberId' => (string)$m['memberId'], 'version' => MOU_VERSION, 'status' => 'awaiting_family',
        'tokenHash' => mou_hash($token), 'tokenExp' => gmdate('Y-m-d\TH:i:s\Z', time() + MOU_TOKEN_DAYS * 86400),
        'termsJson' => json_encode(mou_figures(), JSON_UNESCAPED_UNICODE), 'prefillJson' => json_encode(mou_prefill($m), JSON_UNESCAPED_UNICODE),
        'createdBy' => $by, 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    $link = mou_origin() . '/mou/' . $token;
    $to = $send ? mou_send_invite($m, $link, false) : [];
    db_update('mou_agreements', ['sentAt' => $to ? $now : '', 'sentTo' => implode(', ', $to)], ['mouId' => $id]);
    audit('mou.start', $by, (string)$m['memberId'], ['mouId' => $id, 'sentTo' => count($to)]);
    return ['ok' => true, 'mouId' => $id, 'status' => 'awaiting_family', 'link' => $link, 'sentTo' => $to];
}

/** Everyone the family's link goes to: the member record's parent email and the linked guardians. */
function mou_family_emails(array $m): array {
    $to = [];
    foreach ([(string)($m['parentEmail'] ?? ''), (string)($m['email'] ?? '')] as $e) { $e = strtolower(trim($e)); if (filter_var($e, FILTER_VALIDATE_EMAIL)) { $to[] = $e; break; } }
    foreach (db_all("SELECT g.email FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId WHERE w.memberId = ? AND w.status = 'active' AND g.status = 'active'", [(string)$m['memberId']]) as $r) {
        $e = strtolower(trim((string)$r['email'])); if (filter_var($e, FILTER_VALIDATE_EMAIL)) $to[] = $e;
    }
    return array_values(array_unique($to));
}

function mou_send_invite(array $m, string $link, bool $reminder): array {
    $to = mou_family_emails($m);
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
    foreach ($to as $addr) {
        @send_mail($addr, ($reminder ? 'Reminder: ' : '') . 'Please read and sign ' . $first . '’s NGG Membership Agreement', email_template([
            'eyebrow' => 'Membership Agreement', 'title' => 'One last step for ' . $first,
            'intro' => 'Before ' . $first . ' starts, please read and sign the NGG Membership Agreement.',
            'bodyHtml' => '<p style="margin:0 0 12px">It takes about ten minutes on your phone. Each part of the agreement has a short summary in plain words, then five quick questions to make sure the important parts are clear — you can try again as many times as you like.</p>'
                . '<p style="margin:0 0 12px">If another adult is with you, they can sign as your witness on the same screen. If not, someone from NGG will witness it at the centre.</p>'
                . '<p style="margin:0">A copy of the signed agreement is emailed to you.</p>',
            'ctaLabel' => 'Read and sign', 'ctaUrl' => $link,
            'footNote' => 'This link is private to your family and works for ' . MOU_TOKEN_DAYS . ' days. Questions: ' . MOU_CONTACT . '.',
        ]));
    }
    return $to;
}

/** The agreement behind a family link, or a refusal. */
function mou_by_token(string $token): array {
    $token = trim($token);
    if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $token)) return [null, ['ok' => false, 'error' => 'not_found']];
    $r = db_row('SELECT * FROM mou_agreements WHERE tokenHash = ? LIMIT 1', [mou_hash($token)]);
    if (!$r || (string)$r['status'] === 'void') return [null, ['ok' => false, 'error' => 'not_found', 'message' => 'This link is not valid any more. Ask NGG to send a new one.']];
    if ((string)$r['status'] === 'awaiting_family' && strtotime((string)$r['tokenExp']) < time())
        return [null, ['ok' => false, 'error' => 'expired', 'message' => 'This link has expired. Ask NGG to send a new one: ' . MOU_CONTACT . '.']];
    return [$r, null];
}

/** What the signed parties look like on screen and on paper (no signature images, no addresses). */
function mou_parties_public(array $r): array {
    return [
        'family'  => (string)$r['clientSignedAt'] !== '' ? ['name' => (string)$r['clientName'], 'relation' => (string)$r['clientRel'], 'at' => (string)$r['clientSignedAt']] : null,
        'witness' => (string)$r['witnessSignedAt'] !== '' ? ['name' => (string)$r['witnessName'], 'at' => (string)$r['witnessSignedAt']] : null,
        'ngg'     => (string)$r['nggSignedAt'] !== '' ? ['name' => (string)$r['nggName'], 'role' => (string)$r['nggRole'], 'at' => (string)$r['nggSignedAt']] : null,
    ];
}

/* ── The family's page (/mou/<token>) ──────────────────────────────────── */

/** public.mou.get — the agreement to read, the questions, the details to confirm, and where it stands. */
function public_mou_get(array $p): array {
    [$r, $no] = mou_by_token((string)($p['token'] ?? '')); if ($no) return $no;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['viewedAt'] === '') db_update('mou_agreements', ['viewedAt' => now_iso()], ['id' => (int)$r['id']]);
    $fig = json_decode((string)$r['termsJson'], true) ?: mou_figures();
    $pre = json_decode((string)$r['prefillJson'], true) ?: mou_prefill($m);
    return ['ok' => true, 'status' => (string)$r['status'], 'version' => (string)$r['version'],
            'member' => ['first' => explode(' ', trim((string)$m['fullName']))[0], 'fullName' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? ''), 'displayId' => (string)($m['displayId'] ?? '')],
            'org' => MOU_ORG, 'contact' => MOU_CONTACT, 'sections' => mou_terms($fig),
            'quiz' => array_map(static fn($q) => $q, mou_quiz()), 'prefill' => $pre,
            'consents' => ['granted' => MOU_CONSENTS_GRANTED, 'trips' => (string)$r['tripsChoice']],
            'parties' => mou_parties_public($r), 'quizPassed' => (string)$r['quizPassedAt'] !== ''];
}

/** A drawn signature: a PNG data URL that decodes, is a sensible size, and is not blank. */
function mou_signature_ok(string $s): bool {
    if (strlen($s) > MOU_SIG_MAX || !preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $s, $mm)) return false;
    $bin = base64_decode($mm[1], true);
    $info = $bin !== false ? @getimagesizefromstring($bin) : false;
    if (!$info || $info[0] < 120 || $info[1] < 40) return false;
    if (!function_exists('imagecreatefromstring')) return true;
    $im = @imagecreatefromstring($bin); if (!$im) return false;
    // Ink: enough non-transparent, non-white pixels on a sparse grid to be a mark, not a dot.
    $w = imagesx($im); $h = imagesy($im); $ink = 0; $step = max(1, (int)floor(min($w, $h) / 60));
    for ($y = 0; $y < $h; $y += $step) for ($x = 0; $x < $w; $x += $step) {
        $c = imagecolorat($im, $x, $y); $a = ($c >> 24) & 0x7F; $l = (($c >> 16) & 255) + (($c >> 8) & 255) + ($c & 255);
        if ($a < 100 && $l < 600) $ink++;
    }
    imagedestroy($im);
    return $ink >= 12;
}

function mou_clean(string $s, int $max): string { return mb_substr(trim(preg_replace('/\s+/', ' ', $s)), 0, $max); }

/**
 * public.mou.sign — the family signs. Everything is checked before anything is
 * written: the answers (all five right), the details, the consent choice, a
 * typed full name that is a name, and a drawn signature; a witness, when one
 * signs now, is a different person with their own name and signature.
 */
function public_mou_sign(array $p): array {
    [$r, $no] = mou_by_token((string)($p['token'] ?? '')); if ($no) return $no;
    if ((string)$r['status'] !== 'awaiting_family') return ['ok' => false, 'error' => 'already_signed', 'message' => 'This agreement has already been signed by the family.'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    // The check: every question answered right. The page gives instant feedback; this is the record of it.
    $ans = is_array($p['answers'] ?? null) ? $p['answers'] : [];
    foreach (mou_quiz() as $q) if (!isset($ans[$q['id']]) || (int)$ans[$q['id']] !== (int)$q['a']) return ['ok' => false, 'error' => 'quiz_incomplete', 'field' => 'quiz', 'message' => 'Answer each question about the agreement first.'];
    // The details on the paper form, confirmed (or corrected) by the family.
    $f = is_array($p['family'] ?? null) ? $p['family'] : []; $mi = is_array($p['member'] ?? null) ? $p['member'] : [];
    $fam = ['fatherName' => mou_clean((string)($f['fatherName'] ?? ''), 120), 'motherName' => mou_clean((string)($f['motherName'] ?? ''), 120), 'guardianName' => mou_clean((string)($f['guardianName'] ?? ''), 120),
            'address' => mou_clean((string)($f['address'] ?? ''), 300), 'phone' => mou_clean((string)($f['phone'] ?? ''), 32), 'email' => strtolower(mou_clean((string)($f['email'] ?? ''), 160))];
    if ($fam['fatherName'] === '' && $fam['motherName'] === '' && $fam['guardianName'] === '') return ['ok' => false, 'error' => 'bad_details', 'field' => 'fatherName', 'message' => 'Give at least one parent’s or guardian’s name.'];
    if (mb_strlen($fam['address']) < 6) return ['ok' => false, 'error' => 'bad_details', 'field' => 'address', 'message' => 'Add the family’s home address.'];
    $ph = function_exists('club_phone') ? club_phone($fam['phone']) : $fam['phone'];
    if ($ph === '') return ['ok' => false, 'error' => 'bad_details', 'field' => 'phone', 'message' => 'Enter an 11-digit Nigerian phone number.'];
    $fam['phone'] = $ph;
    if (!filter_var($fam['email'], FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_details', 'field' => 'email', 'message' => 'Enter the email address the copy should go to.'];
    $mem = ['address' => mou_clean((string)($mi['address'] ?? ''), 300), 'phone' => mou_clean((string)($mi['phone'] ?? ''), 32), 'age' => mou_clean((string)($mi['age'] ?? ''), 3),
            'school' => mou_clean((string)($mi['school'] ?? ''), 160), 'class' => mou_clean((string)($mi['class'] ?? ''), 40), 'department' => mou_clean((string)($mi['department'] ?? ''), 80)];
    if (mb_strlen($mem['school']) < 2) return ['ok' => false, 'error' => 'bad_details', 'field' => 'school', 'message' => 'Add the member’s school.'];
    $trips = (string)($p['trips'] ?? '');
    if (!in_array($trips, ['granted', 'declined'], true)) return ['ok' => false, 'error' => 'trips_required', 'field' => 'trips', 'message' => 'Choose yes or no for off-site activities.'];
    // The signer.
    $name = mou_clean((string)($p['clientName'] ?? ''), 120);
    $rel = in_array($p['clientRel'] ?? '', ['Father', 'Mother', 'Guardian'], true) ? (string)$p['clientRel'] : '';
    if (mb_strlen($name) < 5 || !preg_match('/\S+\s+\S+/u', $name)) return ['ok' => false, 'error' => 'bad_name', 'field' => 'clientName', 'message' => 'Type your full name: first name and surname.'];
    if ($rel === '') return ['ok' => false, 'error' => 'bad_relation', 'field' => 'clientRel', 'message' => 'Say whether you are the father, mother or guardian.'];
    $sig = (string)($p['clientSignature'] ?? '');
    if (!mou_signature_ok($sig)) return ['ok' => false, 'error' => 'bad_signature', 'field' => 'clientSignature', 'message' => 'Draw your signature in the box.'];
    if (empty($p['agree'])) return ['ok' => false, 'error' => 'agree_required', 'field' => 'agree', 'message' => 'Tick that you have read and agree to the Membership Agreement.'];
    // A witness now, or NGG witnesses later.
    $w = is_array($p['witness'] ?? null) ? $p['witness'] : null; $wit = [];
    if ($w && trim((string)($w['name'] ?? '')) !== '') {
        $wn = mou_clean((string)$w['name'], 120);
        if (mb_strlen($wn) < 5 || !preg_match('/\S+\s+\S+/u', $wn)) return ['ok' => false, 'error' => 'bad_witness', 'field' => 'witnessName', 'message' => 'Type the witness’s full name.'];
        if (mb_strtolower($wn) === mb_strtolower($name)) return ['ok' => false, 'error' => 'bad_witness', 'field' => 'witnessName', 'message' => 'The witness must be a different person from the one signing.'];
        $wp = function_exists('club_phone') ? club_phone((string)($w['phone'] ?? '')) : (string)($w['phone'] ?? '');
        if ($wp === '') return ['ok' => false, 'error' => 'bad_witness', 'field' => 'witnessPhone', 'message' => 'Give the witness’s phone number.'];
        if (!mou_signature_ok((string)($w['signature'] ?? ''))) return ['ok' => false, 'error' => 'bad_witness', 'field' => 'witnessSignature', 'message' => 'The witness draws their signature in their box.'];
        if (hash_equals((string)$w['signature'], $sig)) return ['ok' => false, 'error' => 'bad_witness', 'field' => 'witnessSignature', 'message' => 'The witness signs for themselves, in their own box.'];
        $wit = ['witnessName' => $wn, 'witnessPhone' => $wp, 'witnessSignature' => (string)$w['signature'], 'witnessSignedAt' => now_iso(), 'witnessBy' => 'family'];
    }
    $now = now_iso();
    $fig = json_decode((string)$r['termsJson'], true) ?: mou_figures();
    // What exactly was signed: the text with its figures, and the details. Kept so the copy can be proven unchanged.
    $digest = hash('sha256', json_encode(['v' => (string)$r['version'], 'terms' => mou_terms($fig), 'family' => $fam, 'member' => $mem, 'trips' => $trips, 'name' => $name], JSON_UNESCAPED_UNICODE));
    $docToken = mou_token();
    $claimed = db_exec("UPDATE mou_agreements SET status = 'awaiting_ngg', updatedAt = ? WHERE id = ? AND status = 'awaiting_family'", [$now, (int)$r['id']]);
    if (!$claimed) return ['ok' => false, 'error' => 'already_signed', 'message' => 'This agreement has already been signed by the family.'];
    db_update('mou_agreements', [
        'familyJson' => json_encode($fam, JSON_UNESCAPED_UNICODE), 'memberJson' => json_encode($mem, JSON_UNESCAPED_UNICODE), 'tripsChoice' => $trips,
        'quizPassedAt' => $now, 'quizAttempts' => max(1, (int)($p['attempts'] ?? 1)),
        'clientName' => $name, 'clientRel' => $rel, 'clientSignature' => $sig, 'clientSignedAt' => $now, 'clientIp' => mb_substr((string)($p['ip'] ?? ''), 0, 64),
        'docHash' => $digest, 'docTokenHash' => mou_hash($docToken),
    ] + $wit, ['id' => (int)$r['id']]);
    // Clause 8 IS the consents: one ledger, read by the family app, the checklist and the record.
    foreach (array_merge(array_fill_keys(MOU_CONSENTS_GRANTED, 'granted'), ['trips' => $trips]) as $type => $st)
        db_insert('consents', ['studentId' => (string)$m['memberId'], 'type' => $type, 'status' => $st, 'method' => 'mou', 'actorName' => $name,
                               'policyVersion' => MOU_POLICY, 'createdAt' => $now]);
    audit('mou.family_signed', null, (string)$m['memberId'], ['mouId' => (string)$r['mouId'], 'witness' => $wit ? 'family' : 'ngg', 'trips' => $trips], (string)($p['ip'] ?? ''));
    if (function_exists('staff_inbox_alert')) staff_inbox_alert('approvals', ['who' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? ''),
        'what' => 'Membership Agreement signed by the family — countersign' . ($wit ? '' : ' and witness')]);
    $row = db_row('SELECT * FROM mou_agreements WHERE id = ?', [(int)$r['id']]);
    $sent = mou_mail_copy($row, $m, $docToken, false, [$fam['email']]);
    return ['ok' => true, 'status' => 'awaiting_ngg', 'copyTo' => $sent, 'docUrl' => mou_origin() . '/api/public/mou.php?doc=' . $docToken, 'parties' => mou_parties_public($row)];
}

/* ── Staff (Control Room → Members → Agreements) ───────────────────────── */

function mou_row_public(array $r, ?array $m = null): array {
    return ['mouId' => (string)$r['mouId'], 'memberId' => (string)$r['memberId'], 'fullName' => (string)($m['fullName'] ?? ''), 'displayId' => (string)($m['displayId'] ?? ''),
            'centre' => (string)($m['centre'] ?? ''), 'photoUrl' => (string)($m['photoUrl'] ?? ''), 'status' => (string)$r['status'], 'version' => (string)$r['version'],
            'sentAt' => (string)$r['sentAt'], 'sentTo' => (string)$r['sentTo'], 'viewedAt' => (string)$r['viewedAt'], 'createdAt' => (string)$r['createdAt'],
            'quizAttempts' => (int)$r['quizAttempts'], 'tripsChoice' => (string)$r['tripsChoice'], 'parties' => mou_parties_public($r),
            'needsWitness' => (string)$r['status'] === 'awaiting_ngg' && (string)$r['witnessSignedAt'] === '', 'voidReason' => (string)$r['voidReason']];
}

/** admin.mou.list — every agreement in the requester's centres, by state, plus the NGG members with none. */
function admin_mou_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $scope = admin_centre_names_in_scope($g['requester']);
    $filter = in_array($p['status'] ?? '', ['awaiting_family', 'awaiting_ngg', 'signed', 'void', 'none', 'all'], true) ? (string)$p['status'] : 'awaiting_ngg';
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $rows = []; $counts = array_fill_keys(['awaiting_family', 'awaiting_ngg', 'signed', 'void', 'none'], 0);
    $byMember = [];
    foreach (db_all('SELECT * FROM mou_agreements ORDER BY id') as $r) $byMember[(string)$r['memberId']][] = $r;
    foreach (db_all("SELECT memberId, fullName, displayId, centre, photoUrl, type, status FROM members WHERE type = 'NGG' AND status = 'active' AND COALESCE(role,'member') = 'member' ORDER BY fullName") as $m) {
        if ($scope !== null && !in_array((string)$m['centre'], $scope, true)) continue;
        $list = $byMember[(string)$m['memberId']] ?? [];
        $live = null; foreach (array_reverse($list) as $r) if ((string)$r['status'] !== 'void') { $live = $r; break; }
        $st = $live ? (string)$live['status'] : 'none';
        $counts[$st]++;
        foreach ($list as $r) if ((string)$r['status'] === 'void') $counts['void']++;
        if ($q !== '' && !str_contains(mb_strtolower((string)$m['fullName'] . ' ' . $m['memberId'] . ' ' . $m['displayId']), $q)) continue;
        if ($filter === 'none' && $st === 'none') $rows[] = ['mouId' => '', 'memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)$m['displayId'], 'centre' => (string)$m['centre'], 'photoUrl' => (string)$m['photoUrl'], 'status' => 'none'];
        elseif ($filter === 'void') { foreach ($list as $r) if ((string)$r['status'] === 'void') $rows[] = mou_row_public($r, $m); }
        elseif ($live && ($filter === 'all' || $filter === $st)) $rows[] = mou_row_public($live, $m);
        elseif ($filter === 'all' && !$live) $rows[] = ['mouId' => '', 'memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)$m['displayId'], 'centre' => (string)$m['centre'], 'photoUrl' => (string)$m['photoUrl'], 'status' => 'none'];
    }
    return ['ok' => true, 'status' => $filter, 'rows' => array_slice($rows, 0, 1000), 'total' => count($rows), 'counts' => $counts, 'max' => MOU_BULK_MAX];
}

/** The agreement for staff, scoped; with the signatures (staff witness them). */
function mou_for_admin(array $g, string $mouId): array {
    $r = db_row('SELECT * FROM mou_agreements WHERE mouId = ? LIMIT 1', [$mouId]);
    if (!$r) return [null, null, ['ok' => false, 'error' => 'not_found']];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    if (!$m) return [null, null, ['ok' => false, 'error' => 'not_found']];
    if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) return [null, null, ['ok' => false, 'error' => 'out_of_scope']];
    return [$r, $m, null];
}

function admin_mou_get(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    [$r, $m, $no] = mou_for_admin($g, (string)($p['mouId'] ?? '')); if ($no) return $no;
    return ['ok' => true, 'mou' => mou_row_public($r, $m) + [
        'family' => json_decode((string)$r['familyJson'], true) ?: null, 'member' => json_decode((string)$r['memberJson'], true) ?: null,
        'clientSignature' => (string)$r['clientSignature'], 'witnessSignature' => (string)$r['witnessSignature'], 'nggSignature' => (string)$r['nggSignature'],
        'witnessPhone' => (string)$r['witnessPhone'], 'docHash' => (string)$r['docHash'], 'clientIp' => (string)$r['clientIp'],
    ]];
}

/**
 * admin.mou.countersign — NGG's representative signs (and witnesses, when the
 * family had no witness with them). The representative is the requester: their
 * name, a role they type, and their own drawn signature. Completes the
 * agreement and emails the family the finished copy.
 */
function admin_mou_countersign(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    [$r, $m, $no] = mou_for_admin($g, (string)($p['mouId'] ?? '')); if ($no) return $no;
    if ((string)$r['status'] !== 'awaiting_ngg') return ['ok' => false, 'error' => 'not_awaiting_ngg', 'message' => (string)$r['status'] === 'signed' ? 'Already countersigned.' : 'The family has not signed yet.'];
    $role = mou_clean((string)($p['role'] ?? ''), 80);
    if (mb_strlen($role) < 3) return ['ok' => false, 'error' => 'bad_role', 'field' => 'role', 'message' => 'Give your role, for example “Centre coordinator, Egbeda”.'];
    $sig = (string)($p['signature'] ?? '');
    if (!mou_signature_ok($sig)) return ['ok' => false, 'error' => 'bad_signature', 'field' => 'signature', 'message' => 'Draw your signature in the box.'];
    if (hash_equals((string)$r['clientSignature'], $sig)) return ['ok' => false, 'error' => 'bad_signature', 'field' => 'signature', 'message' => 'That is the family’s signature. Sign with your own.'];
    $me = $g['requester']; $now = now_iso();
    $upd = ['status' => 'signed', 'nggName' => (string)$me['fullName'], 'nggRole' => $role, 'nggById' => (string)$me['memberId'], 'nggSignature' => $sig, 'nggSignedAt' => $now, 'updatedAt' => $now];
    if ((string)$r['witnessSignedAt'] === '') {
        // Nobody witnessed at home: NGG's representative witnesses, and says so on the copy.
        $upd += ['witnessName' => (string)$me['fullName'], 'witnessPhone' => '', 'witnessSignature' => $sig, 'witnessSignedAt' => $now, 'witnessBy' => 'ngg'];
    }
    $claimed = db_exec("UPDATE mou_agreements SET status = 'signed', updatedAt = ? WHERE id = ? AND status = 'awaiting_ngg'", [$now, (int)$r['id']]);
    if (!$claimed) return ['ok' => false, 'error' => 'not_awaiting_ngg', 'message' => 'Someone else countersigned it just now.'];
    db_update('mou_agreements', $upd, ['id' => (int)$r['id']]);
    $docToken = mou_token();
    db_update('mou_agreements', ['docTokenHash' => mou_hash($docToken)], ['id' => (int)$r['id']]);
    $row = db_row('SELECT * FROM mou_agreements WHERE id = ?', [(int)$r['id']]);
    $fam = json_decode((string)$row['familyJson'], true) ?: [];
    $sent = mou_mail_copy($row, $m, $docToken, true, array_filter([(string)($fam['email'] ?? '')]));
    audit('mou.countersigned', (string)$me['memberId'], (string)$m['memberId'], ['mouId' => (string)$r['mouId'], 'witnessedByNgg' => isset($upd['witnessBy'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => 'signed', 'copyTo' => $sent];
}

/** admin.mou.start — start (and send) agreements for members who have none. Per-row verdicts, capped. */
function admin_mou_start(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : []))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > MOU_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => MOU_BULK_MAX, 'message' => 'At most ' . MOU_BULK_MAX . ' in one go.'];
    $res = []; $applied = 0;
    foreach ($ids as $id) {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
        if (!$m) { $res[] = ['memberId' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) { $res[] = ['memberId' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        $r = mou_start($m, (string)$g['requester']['memberId']);
        if (empty($r['ok'])) { $res[] = ['memberId' => $id] + $r; continue; }
        if (!empty($r['existed'])) { $res[] = ['memberId' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        $applied++; $res[] = ['memberId' => $id, 'ok' => true, 'sentTo' => count($r['sentTo'] ?? [])];
    }
    audit('admin.mou.start', (string)$g['requester']['memberId'], '', ['count' => count($ids), 'applied' => $applied, 'refused' => count(array_filter($res, fn($x) => empty($x['ok'])))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => $applied, 'results' => $res];
}

/** admin.mou.resend — a fresh link to the family (the old one stops working). Only while they have not signed. */
function admin_mou_resend(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    [$r, $m, $no] = mou_for_admin($g, (string)($p['mouId'] ?? '')); if ($no) return $no;
    if ((string)$r['status'] !== 'awaiting_family') return ['ok' => false, 'error' => 'not_awaiting_family', 'message' => 'The family has already signed.'];
    $token = mou_token(); $now = now_iso(); $link = mou_origin() . '/mou/' . $token;
    db_update('mou_agreements', ['tokenHash' => mou_hash($token), 'tokenExp' => gmdate('Y-m-d\TH:i:s\Z', time() + MOU_TOKEN_DAYS * 86400), 'updatedAt' => $now], ['id' => (int)$r['id']]);
    $to = mou_send_invite($m, $link, true);
    db_update('mou_agreements', ['sentAt' => $to ? $now : (string)$r['sentAt'], 'sentTo' => $to ? implode(', ', $to) : (string)$r['sentTo']], ['id' => (int)$r['id']]);
    audit('admin.mou.resend', (string)$g['requester']['memberId'], (string)$m['memberId'], ['mouId' => (string)$r['mouId'], 'sentTo' => count($to)], (string)($p['ip'] ?? ''));
    // The link itself, so staff can also send it by WhatsApp: a family without email is not stuck.
    return ['ok' => true, 'link' => $link, 'sentTo' => $to];
}

/** admin.mou.void — withdraw an agreement (wrong child, details beyond repair). Kept, never deleted; a new one can start. */
function admin_mou_void(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    [$r, $m, $no] = mou_for_admin($g, (string)($p['mouId'] ?? '')); if ($no) return $no;
    $why = mou_clean((string)($p['reason'] ?? ''), 300);
    if (mb_strlen($why) < 10) return ['ok' => false, 'error' => 'reason_required', 'field' => 'reason', 'message' => 'Say why, in at least ten characters.'];
    if ((string)$r['status'] === 'void') return ['ok' => true, 'unchanged' => true];
    db_update('mou_agreements', ['status' => 'void', 'voidReason' => $why, 'voidedAt' => now_iso(), 'voidedBy' => (string)$g['requester']['memberId'], 'updatedAt' => now_iso(), 'tokenHash' => ''], ['id' => (int)$r['id']]);
    audit('admin.mou.void', (string)$g['requester']['memberId'], (string)$m['memberId'], ['mouId' => (string)$r['mouId'], 'reason' => $why], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** admin.mou.doc — the printable copy for staff. */
function admin_mou_doc(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    [$r, $m, $no] = mou_for_admin($g, (string)($p['mouId'] ?? '')); if ($no) return $no;
    return ['ok' => true, 'html' => mou_document_html($r, $m)];
}

/** public.mou.doc — the family's printable copy, by the private link in their email. */
function public_mou_doc(array $p): array {
    $t = trim((string)($p['doc'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $t)) return ['ok' => false, 'error' => 'not_found'];
    $r = db_row('SELECT * FROM mou_agreements WHERE docTokenHash = ? LIMIT 1', [mou_hash($t)]);
    if (!$r || (string)$r['status'] === 'void') return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$r['memberId']]);
    return $m ? ['ok' => true, 'html' => mou_document_html($r, $m)] : ['ok' => false, 'error' => 'not_found'];
}

/* ── The copy: printable page and email ─────────────────────────────────── */

function mou_when(string $iso): string {
    $t = strtotime($iso); if (!$t) return '';
    return gmdate('j M Y', $t + 3600) . ', ' . gmdate('H:i', $t + 3600) . ' WAT';
}

/** The A4 document in the report design system (assets/report/report.css). */
function mou_document_html(array $r, array $m): string {
    $e = static fn($s) => esc_html((string)$s);
    $fig = json_decode((string)$r['termsJson'], true) ?: mou_figures();
    $fam = json_decode((string)$r['familyJson'], true) ?: (json_decode((string)$r['prefillJson'], true)['family'] ?? []);
    $mem = json_decode((string)$r['memberJson'], true) ?: (json_decode((string)$r['prefillJson'], true)['member'] ?? []);
    $st = (string)$r['status'];
    $badge = ['signed' => 'Signed by all parties', 'awaiting_ngg' => 'Signed by the family', 'awaiting_family' => 'Not yet signed', 'void' => 'Withdrawn'][$st] ?? '';
    $o = dues_doc_head('Membership Agreement', 'Memorandum of Understanding · version ' . (string)$r['version'], $badge, (string)$r['mouId']);
    $kv = static fn(array $rows) => '<table class="rp-kv"><tbody>' . implode('', array_map(static fn($pair) => '<tr><th scope="row">' . esc_html($pair[0]) . '</th><td>' . esc_html($pair[1] !== '' ? $pair[1] : '—') . '</td><th scope="row">' . esc_html($pair[2]) . '</th><td>' . esc_html($pair[3] !== '' ? $pair[3] : '—') . '</td></tr>', $rows)) . '</tbody></table>';
    $o .= '<section class="rp-sec" aria-labelledby="mou-p"><h2 id="mou-p">The parties</h2>'
        . $kv([['Member', (string)$m['fullName'], 'ID number', (string)(($m['displayId'] ?? '') ?: $m['memberId'])],
               ['Centre', (string)($m['centre'] ?? ''), 'Age', (string)($mem['age'] ?? '')],
               ['School', (string)($mem['school'] ?? ''), 'Class', (string)($mem['class'] ?? '')],
               ['Department', (string)($mem['department'] ?? ''), 'Member’s phone', (string)($mem['phone'] ?? '')],
               ['Father', (string)($fam['fatherName'] ?? ''), 'Mother', (string)($fam['motherName'] ?? '')],
               ['Guardian', (string)($fam['guardianName'] ?? ''), 'Family phone', (string)($fam['phone'] ?? '')],
               ['Family email', (string)($fam['email'] ?? ''), 'Home address', (string)($fam['address'] ?? '')]])
        . '</section>';
    foreach (mou_terms($fig) as $i => $s) {
        $o .= '<section class="rp-sec rp-clause" aria-labelledby="mou-' . $e($s['id']) . '"><h2 id="mou-' . $e($s['id']) . '">' . ($i + 1) . '. ' . $e($s['title']) . '</h2>'
            . '<p class="rp-clause-short"><b>In short:</b> ' . $e($s['short']) . '</p>'
            . implode('', array_map(static fn($b) => '<p>' . esc_html($b) . '</p>', $s['body']))
            . ($s['id'] === 'consents' && (string)$r['tripsChoice'] !== '' ? '<p class="rp-clause-short"><b>Off-site activities:</b> ' . ((string)$r['tripsChoice'] === 'granted' ? 'Yes — the Family gives this consent.' : 'No — the Family does not give this consent.') . '</p>' : '')
            . '</section>';
    }
    $sigBox = static function (string $label, string $name, string $sub, string $img, string $at) use ($e): string {
        return '<div class="rp-sign"><span class="rp-over">' . $e($label) . '</span>'
            . ($img !== '' ? '<img class="rp-sign-img" src="' . $e($img) . '" alt="Signature of ' . $e($name) . '">' : '<span class="rp-sign-empty">Not yet signed</span>')
            . '<span class="rp-sign-n">' . $e($name !== '' ? $name : '—') . '</span><span class="rp-sign-s">' . $e($sub) . ($at !== '' ? ' · ' . $e(mou_when($at)) : '') . '</span></div>';
    };
    $o .= '<section class="rp-sec" aria-labelledby="mou-s"><h2 id="mou-s">Signatures</h2><div class="rp-signs">'
        . $sigBox('Parent or guardian (the Family)', (string)$r['clientName'], (string)$r['clientRel'], (string)$r['clientSignature'], (string)$r['clientSignedAt'])
        . $sigBox('Witness', (string)$r['witnessName'], (string)$r['witnessBy'] === 'ngg' ? 'Witnessed by NGG' : ((string)$r['witnessPhone'] !== '' ? 'Witness' : ''), (string)$r['witnessSignature'], (string)$r['witnessSignedAt'])
        . $sigBox('For Okun Alimosho (NGG)', (string)$r['nggName'], (string)$r['nggRole'], (string)$r['nggSignature'], (string)$r['nggSignedAt'])
        . '</div>'
        . ((string)$r['docHash'] !== '' ? '<p class="rp-foot-note">Signed electronically under section 93 of the Evidence Act 2011. The family confirmed they read the agreement and answered its questions on ' . $e(mou_when((string)$r['quizPassedAt'])) . '. Fingerprint of the signed text: <code>' . $e(substr((string)$r['docHash'], 0, 32)) . '</code>.</p>' : '')
        . '<p class="rp-foot-note">Afrovanguard · 2 Abolude / Oremeji Street, Bakery Bus Stop, Egbeda, Alimosho, Lagos · +234 903 777 6318 · ' . $e(MOU_CONTACT) . '</p>'
        . '</section>';
    return preport_document('Membership Agreement — ' . (string)$m['fullName'], '<div class="rp-page rp">' . $o . '</div>');
}

/**
 * The copy, by email — always. The whole agreement travels in the message (a
 * mail client cannot run the printable page), laid out to read on a phone: the
 * summary line of each clause, the parties and signatures, and a button to the
 * full printable copy. Returns the addresses it went to.
 */
function mou_mail_copy(array $r, array $m, string $docToken, bool $final, array $extra = []): array {
    $to = array_values(array_unique(array_filter(array_merge(array_map('strtolower', $extra), mou_family_emails($m)), static fn($x) => filter_var($x, FILTER_VALIDATE_EMAIL))));
    if (!$to) return [];
    $fig = json_decode((string)$r['termsJson'], true) ?: mou_figures();
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
    $docUrl = mou_origin() . '/api/public/mou.php?doc=' . $docToken;
    $ink = '#0c1432'; $gold = '#e8ac14'; $mute = '#5f6672'; $hair = '#e6e8ee';
    $rows = '';
    foreach (mou_terms($fig) as $i => $s) {
        $rows .= '<tr><td style="padding:12px 0;border-top:1px solid ' . $hair . ';vertical-align:top;width:34px;font:700 13px/1.4 Helvetica,Arial,sans-serif;color:' . $gold . '">' . sprintf('%02d', $i + 1) . '</td>'
            . '<td style="padding:12px 0;border-top:1px solid ' . $hair . '"><div style="font:700 14px/1.35 Helvetica,Arial,sans-serif;color:' . $ink . '">' . esc_html($s['title']) . '</div>'
            . '<div style="font:400 14px/1.5 Helvetica,Arial,sans-serif;color:#2c3240;margin-top:3px">' . esc_html($s['short']) . '</div></td></tr>';
    }
    $sig = static function (string $label, string $name, string $sub, string $at) use ($ink, $mute, $hair): string {
        return '<td style="padding:12px;border:1px solid ' . $hair . ';border-radius:8px;vertical-align:top;width:33%">'
            . '<div style="font:600 10px/1.3 Helvetica,Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:' . $mute . '">' . esc_html($label) . '</div>'
            . '<div style="font:700 14px/1.4 Helvetica,Arial,sans-serif;color:' . $ink . ';margin-top:6px">' . esc_html($name !== '' ? $name : 'Awaiting') . '</div>'
            . '<div style="font:400 12px/1.4 Helvetica,Arial,sans-serif;color:' . $mute . '">' . esc_html(trim($sub . ($at !== '' ? ' · ' . mou_when($at) : ''), ' ·')) . '</div></td>';
    };
    $wSub = (string)$r['witnessBy'] === 'ngg' ? 'Witnessed by NGG' : ((string)$r['witnessName'] !== '' ? 'Witness' : 'NGG witnesses at the centre');
    $body = '<div style="background:#fbf7ec;border-left:4px solid ' . $gold . ';padding:14px 16px;border-radius:6px;margin:0 0 18px;font:400 14px/1.5 Helvetica,Arial,sans-serif;color:' . $ink . '">'
        . ($final ? '<b>Signed by everyone.</b> This is the completed Membership Agreement for ' . esc_html((string)$m['fullName']) . '. Keep this email: it is your copy.'
                  : '<b>Thank you for signing.</b> This is your copy of ' . esc_html($first) . '’s Membership Agreement. NGG’s representative countersigns next' . ((string)$r['witnessSignedAt'] === '' ? ' and witnesses it at the centre' : '') . ', and you will get the completed copy.')
        . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px">'
        . '<tr><td style="font:600 10px/1.3 Helvetica,Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:' . $mute . ';padding:0 0 6px">Member</td><td style="font:600 10px/1.3 Helvetica,Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:' . $mute . ';padding:0 0 6px">Agreement</td></tr>'
        . '<tr><td style="font:700 15px/1.4 Helvetica,Arial,sans-serif;color:' . $ink . '">' . esc_html((string)$m['fullName']) . '<div style="font:400 13px/1.4 Helvetica,Arial,sans-serif;color:' . $mute . '">' . esc_html(trim(((string)($m['displayId'] ?? '')) . ' · ' . (string)($m['centre'] ?? ''), ' ·')) . '</div></td>'
        . '<td style="font:700 15px/1.4 Helvetica,Arial,sans-serif;color:' . $ink . '">' . esc_html((string)$r['mouId']) . '<div style="font:400 13px/1.4 Helvetica,Arial,sans-serif;color:' . $mute . '">Version ' . esc_html((string)$r['version']) . ' · 3 years</div></td></tr></table>'
        . '<div style="font:700 16px/1.3 Helvetica,Arial,sans-serif;color:' . $ink . ';margin:22px 0 4px">What you agreed, clause by clause</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' . $rows . '</table>'
        . '<div style="font:400 13px/1.5 Helvetica,Arial,sans-serif;color:' . $mute . ';margin:8px 0 0">Off-site activities: <b style="color:' . $ink . '">' . ((string)$r['tripsChoice'] === 'granted' ? 'yes' : 'no') . '</b>. The full wording of every clause is in the printable copy.</div>'
        . '<div style="font:700 16px/1.3 Helvetica,Arial,sans-serif;color:' . $ink . ';margin:24px 0 8px">Signatures</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate"><tr>'
        . $sig('Parent / guardian', (string)$r['clientName'], (string)$r['clientRel'], (string)$r['clientSignedAt'])
        . $sig('Witness', (string)$r['witnessName'], $wSub, (string)$r['witnessSignedAt'])
        . $sig('For NGG', (string)$r['nggName'], (string)$r['nggRole'], (string)$r['nggSignedAt'])
        . '</tr></table>';
    $subject = $final ? $first . '’s Membership Agreement is complete — your copy' : 'Your copy: ' . $first . '’s NGG Membership Agreement';
    foreach ($to as $addr) @send_mail($addr, $subject, email_template([
        'eyebrow' => $final ? 'Signed by all parties' : 'Signed by you', 'title' => 'Membership Agreement',
        'intro' => $final ? 'The agreement for ' . $first . ' is complete.' : 'We have your signature for ' . $first . '’s agreement.',
        'bodyHtml' => $body, 'ctaLabel' => 'Open the printable copy (PDF)', 'ctaUrl' => $docUrl,
        'footNote' => 'Next Generation Genius · Okun Alimosho, Afrovanguard · ' . MOU_CONTACT . '. The printable copy opens from this private link; choose “Save as PDF” to keep it on your phone.',
    ]));
    db_update('mou_agreements', [$final ? 'finalMailedAt' : 'familyMailedAt' => now_iso()], ['id' => (int)$r['id']]);
    return $to;
}

/** Is the agreement complete for this member? (the registration checklist's `mou` item) */
function mou_signed_ids(array $ids): array {
    $out = [];
    foreach (array_chunk(array_values(array_unique(array_map('strval', $ids))), 400) as $chunk) {
        if (!$chunk) continue;
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT DISTINCT memberId FROM mou_agreements WHERE status = 'signed' AND memberId IN ($ph)", $chunk) as $r) $out[(string)$r['memberId']] = true;
    }
    return $out;
}

/** The family app: where this member's agreement stands, and the link while it waits on them. */
function mou_family_view(string $memberId): ?array {
    $r = mou_current($memberId);
    if (!$r) return null;
    return ['status' => (string)$r['status'], 'mouId' => (string)$r['mouId'], 'parties' => mou_parties_public($r)];
}
