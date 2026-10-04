<?php
declare(strict_types=1);

/**
 * Behaviour monitor — staff/mentors log free-text observations about NGG
 * members and summer students; AI (profile: 'behaviour') categorises them;
 * wellbeing flags page the admins through the bus. Feeds trendlines and the
 * guardian portal's at-risk signal. Observations are staff-only — never
 * shown to the student, never shared to the circle portal.
 */

const BEHAVIOUR_CATEGORIES = ['respect', 'discipline', 'participation', 'peer', 'wellbeing', 'commendation'];
const BEHAVIOUR_SEVERITIES = ['positive', 'info', 'concern', 'urgent'];

/** Deterministic fallback classifier — keeps the feature honest with AI off. */
function behaviour_rule_classify(string $note): array {
    $n = strtolower($note);
    $has = fn(array $words) => (bool)array_filter($words, fn($w) => strpos($n, $w) !== false);
    if ($has(['unsafe', 'hurt', 'bully', 'bullied', 'crying', 'cried', 'afraid', 'scared', 'abuse', 'hungry', 'sick', 'injur', 'harm', 'withdrawn'])) {
        return ['category' => 'wellbeing', 'severity' => 'urgent', 'sentiment' => 'negative'];
    }
    if ($has(['excellent', 'brilliant', 'helped', 'kind', 'led', 'leader', 'proud', 'impressive', 'great job', 'well done'])) {
        return ['category' => 'commendation', 'severity' => 'positive', 'sentiment' => 'positive'];
    }
    if ($has(['rude', 'insult', 'talked back', 'disrespect', 'shout'])) {
        return ['category' => 'respect', 'severity' => 'concern', 'sentiment' => 'negative'];
    }
    if ($has(['late', 'absent', 'skipped', 'refused', 'cheat', 'lied', 'stole', 'phone in class'])) {
        return ['category' => 'discipline', 'severity' => 'concern', 'sentiment' => 'negative'];
    }
    if ($has(['friend', 'group', 'peer', 'influence', 'clique'])) {
        return ['category' => 'peer', 'severity' => 'info', 'sentiment' => 'neutral'];
    }
    return ['category' => 'participation', 'severity' => 'info', 'sentiment' => 'neutral'];
}

function behaviour_classify(string $note): array {
    if (ai_enabled('behaviour')) {
        $r = ai_classify(
            "You classify one behavioural observation about a teenager in a youth character-formation program. "
            . "Categories: respect, discipline, participation, peer, wellbeing, commendation. "
            . "Severity: positive, info, concern, urgent (urgent ONLY for safety/wellbeing risk). "
            . "Sentiment: positive, neutral, negative. "
            . 'Return {"category":"…","severity":"…","sentiment":"…"}.',
            $note, 120, 'behaviour'
        );
        if (!empty($r['ok'])) {
            $d = $r['data'];
            $cat = in_array(($d['category'] ?? ''), BEHAVIOUR_CATEGORIES, true) ? $d['category'] : null;
            $sev = in_array(($d['severity'] ?? ''), BEHAVIOUR_SEVERITIES, true) ? $d['severity'] : null;
            if ($cat && $sev) {
                return ['category' => $cat, 'severity' => $sev,
                    'sentiment' => in_array(($d['sentiment'] ?? ''), ['positive', 'neutral', 'negative'], true) ? $d['sentiment'] : 'neutral',
                    'aiSource' => 'ai'];
            }
        }
    }
    return behaviour_rule_classify($note) + ['aiSource' => ai_enabled('behaviour') ? 'fallback' : 'rules'];
}


/* ── Quick presets ───────────────────────────────────────────────────────────
 * A mentor at the end of a session has thirty children and five minutes. Free
 * text plus an AI round trip is the wrong shape for that: it is the accurate
 * option, not the fast one, and a tool that is too slow to use during the
 * session gets filled in from memory that evening — or not at all.
 *
 * Presets are one tap: a label, the stars it carries, and the category and
 * severity it files under. No classification needed, because the preset IS
 * the classification — which also means they work with AI switched off, on a
 * bad connection, and identically for every mentor, so the data stays
 * comparable across centres.
 *
 * Free text with AI classification stays for everything a preset cannot say.
 * Admin-overridable, because the behaviours a programme wants to name are
 * theirs to choose.
 */
const BEHAVIOUR_PRESET_DEFAULTS = [
    ['id' => 'helped',    'label' => 'Helped a classmate',   'stars' => 2, 'category' => 'commendation',  'severity' => 'positive', 'icon' => '🤝'],
    ['id' => 'led',       'label' => 'Led the group well',   'stars' => 3, 'category' => 'commendation',  'severity' => 'positive', 'icon' => '⭐'],
    ['id' => 'effort',    'label' => 'Strong effort today',  'stars' => 2, 'category' => 'participation', 'severity' => 'positive', 'icon' => '💪'],
    ['id' => 'spoke',     'label' => 'Spoke up in class',    'stars' => 1, 'category' => 'participation', 'severity' => 'positive', 'icon' => '🙋'],
    ['id' => 'improved',  'label' => 'Much improved',        'stars' => 2, 'category' => 'commendation',  'severity' => 'positive', 'icon' => '📈'],
    ['id' => 'tidy',      'label' => 'Left the space tidy',  'stars' => 1, 'category' => 'respect',       'severity' => 'positive', 'icon' => '🧹'],
    ['id' => 'quiet',     'label' => 'Withdrawn / very quiet', 'stars' => 0, 'category' => 'wellbeing',   'severity' => 'concern',  'icon' => '🫥'],
    ['id' => 'disrupt',   'label' => 'Disrupted the session', 'stars' => 0, 'category' => 'discipline',   'severity' => 'concern',  'icon' => '⚠️'],
    ['id' => 'conflict',  'label' => 'Conflict with a peer', 'stars' => 0, 'category' => 'peer',          'severity' => 'concern',  'icon' => '💢'],
];

function behaviour_presets(): array {
    $saved = setting_get('behaviour_presets');
    if (!is_array($saved) || !$saved) return BEHAVIOUR_PRESET_DEFAULTS;
    $out = [];
    foreach ($saved as $r) {
        if (!is_array($r)) continue;
        $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string)($r['id'] ?? '')));
        $label = substr(trim((string)($r['label'] ?? '')), 0, 80);
        if ($id === '' || $label === '') continue;
        $out[] = [
            'id' => $id, 'label' => $label,
            'stars' => max(0, min(3, (int)($r['stars'] ?? 0))),
            'category' => in_array(($r['category'] ?? ''), BEHAVIOUR_CATEGORIES, true) ? (string)$r['category'] : 'participation',
            'severity' => in_array(($r['severity'] ?? ''), BEHAVIOUR_SEVERITIES, true) ? (string)$r['severity'] : 'info',
            'icon' => substr(trim((string)($r['icon'] ?? '')), 0, 8),
        ];
    }
    return $out ?: BEHAVIOUR_PRESET_DEFAULTS;
}

function admin_behaviour_presets_save(array $p): array {
    // Shared configuration — one owner, not "either desk".
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $in = is_array($p['presets'] ?? null) ? array_slice($p['presets'], 0, 40) : [];
    setting_set('behaviour_presets', $in, (string)$g['requester']['memberId']);
    audit('behaviour.presets.set', (string)$g['requester']['memberId'], '', ['count' => count($in)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'presets' => behaviour_presets()];
}

/**
 * A WRITE about one person is gated by who that person is, never by "people
 * OR summer": a Summer School participant is the summer desk's, an NGG member
 * the people desk's — and, for a scoped admin, only inside their centres.
 */
function behaviour_subject_gate(array $requester, string $subjectId): array {
    $caps = member_effective_caps($requester);
    $st = db_row('SELECT centre FROM summer_students WHERE studentId = ? LIMIT 1', [$subjectId]);
    if ($st) {
        if (!in_array('summer', $caps, true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:summer'];
        return admin_centre_allowed($requester, (string)$st['centre']) ? ['ok' => true] : ['ok' => false, 'error' => 'out_of_scope'];
    }
    if (!in_array('people', $caps, true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:people'];
    $sg = admin_member_scope_gate($requester, $subjectId);
    if (!$sg['ok'] && ($sg['error'] ?? '') === 'not_found') return ['ok' => false, 'error' => 'subject_not_found'];
    return $sg['ok'] ? ['ok' => true] : $sg;
}

/** Staff with people OR summer capability may observe/read. */
function behaviour_gate(array $p): array {
    $g = admin_cap_gate($p, 'people');
    if ($g['ok']) return $g;
    return admin_cap_gate($p, 'summer');
}

function admin_behaviour_log(array $p): array {
    $g = behaviour_gate($p); if (!$g['ok']) return $g;
    $subjectId = trim((string)($p['subjectId'] ?? ''));
    $note = trim((string)($p['note'] ?? ''));
    if ($subjectId === '') return ['ok' => false, 'error' => 'no_subject'];
    $sg = behaviour_subject_gate($g['requester'], $subjectId); if (!$sg['ok']) return $sg;
    if (strlen($note) < 5) return ['ok' => false, 'error' => 'note_too_short'];
    $note = substr($note, 0, 1500);

    // Resolve subject: summer student or NGG member.
    $subjectName = ''; $cohortId = '';
    $st = db_row('SELECT fullName, cohortId FROM summer_students WHERE studentId = ? LIMIT 1', [$subjectId]);
    if ($st) { $subjectName = (string)$st['fullName']; $cohortId = (string)$st['cohortId']; }
    else {
        $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$subjectId]);
        if (!$m) return ['ok' => false, 'error' => 'subject_not_found'];
        $subjectName = (string)$m['fullName'];
    }

    // Manual pick wins; otherwise the 'behaviour' AI profile (rules fallback).
    $manualCat = (string)($p['category'] ?? '');
    if (in_array($manualCat, BEHAVIOUR_CATEGORIES, true)) {
        $cls = ['category' => $manualCat,
            'severity' => in_array(($p['severity'] ?? ''), BEHAVIOUR_SEVERITIES, true) ? (string)$p['severity'] : 'info',
            'sentiment' => 'neutral', 'aiSource' => 'manual'];
    } else {
        $cls = behaviour_classify($note);
    }

    $logId = 'BL-' . strtoupper(rand_hex(6));
    db_insert('behaviour_logs', [
        'logId' => $logId, 'subjectId' => $subjectId, 'subjectName' => $subjectName, 'cohortId' => $cohortId,
        'observerId' => $g['requester']['memberId'], 'observerName' => (string)$g['requester']['fullName'],
        'note' => $note, 'category' => $cls['category'], 'severity' => $cls['severity'],
        'sentiment' => $cls['sentiment'], 'aiSource' => $cls['aiSource'],
        'status' => 'open', 'createdAt' => now_iso(),
    ]);
    audit('behaviour.log', $g['requester']['memberId'], $subjectId, ['category' => $cls['category'], 'severity' => $cls['severity']], (string)($p['ip'] ?? ''));

    // Wellbeing risk pages the admins NOW (Chat space etc.), name included —
    // internal destinations only; the payload never reaches student surfaces.
    if ($cls['category'] === 'wellbeing' || $cls['severity'] === 'urgent') {
        event_emit('behaviour.flagged', ['ref' => $logId, 'subject' => $subjectName, 'subjectId' => $subjectId,
            'category' => $cls['category'], 'severity' => $cls['severity'], 'by' => (string)$g['requester']['fullName']]);
    }
    return ['ok' => true, 'logId' => $logId, 'category' => $cls['category'], 'severity' => $cls['severity'], 'aiSource' => $cls['aiSource']];
}

function admin_behaviour_list(array $p): array {
    $g = behaviour_gate($p); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['subjectId'])) { $where[] = 'subjectId = ?'; $params[] = (string)$p['subjectId']; }
    if (!empty($p['status']) && in_array($p['status'], ['open', 'reviewed'], true)) { $where[] = 'status = ?'; $params[] = (string)$p['status']; }
    if (!empty($p['category']) && in_array($p['category'], BEHAVIOUR_CATEGORIES, true)) { $where[] = 'category = ?'; $params[] = (string)$p['category']; }
    $rows = db_all('SELECT * FROM behaviour_logs' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 300', $params);
    /* A scoped admin reads only the people in their centres — two grouped
       lookups for the whole list, not one per row. */
    $names = admin_centre_names_in_scope($g['requester']);
    if ($names !== null && $rows) {
        $ids = array_values(array_unique(array_column($rows, 'subjectId')));
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $centreOf = [];
        foreach (db_all("SELECT memberId id, centre FROM members WHERE memberId IN ($ph)", $ids) as $r) $centreOf[(string)$r['id']] = (string)$r['centre'];
        foreach (db_all("SELECT studentId id, centre FROM summer_students WHERE studentId IN ($ph)", $ids) as $r) $centreOf[(string)$r['id']] = (string)$r['centre'];
        $rows = array_values(array_filter($rows, static fn($r) => in_array($centreOf[(string)$r['subjectId']] ?? '', $names, true)));
    }

    // 30-day trend: counts per category + open flags — the M&E feed.
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);
    $trend = [];
    foreach (db_all('SELECT category, COUNT(*) c FROM behaviour_logs WHERE createdAt >= ? GROUP BY category', [$since]) as $t) $trend[$t['category']] = (int)$t['c'];
    $openFlags = (int)(db_row("SELECT COUNT(*) c FROM behaviour_logs WHERE status = 'open' AND (category = 'wellbeing' OR severity = 'urgent')")['c'] ?? 0);
    return ['ok' => true, 'logs' => $rows, 'trend' => $trend, 'openFlags' => $openFlags, 'categories' => BEHAVIOUR_CATEGORIES];
}

function admin_behaviour_review(array $p): array {
    $g = behaviour_gate($p); if (!$g['ok']) return $g;
    $log = db_row('SELECT subjectId FROM behaviour_logs WHERE logId = ? LIMIT 1', [(string)($p['logId'] ?? '')]);
    if (!$log) return ['ok' => false, 'error' => 'not_found'];
    $sg = behaviour_subject_gate($g['requester'], (string)$log['subjectId']); if (!$sg['ok']) return $sg;
    $n = db_update('behaviour_logs', ['status' => 'reviewed', 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso()], ['logId' => (string)($p['logId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('behaviour.review', $g['requester']['memberId'], (string)$p['logId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
