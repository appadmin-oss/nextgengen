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

    // 30-day trend: counts per category + open flags — the M&E feed.
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);
    $trend = [];
    foreach (db_all('SELECT category, COUNT(*) c FROM behaviour_logs WHERE createdAt >= ? GROUP BY category', [$since]) as $t) $trend[$t['category']] = (int)$t['c'];
    $openFlags = (int)(db_row("SELECT COUNT(*) c FROM behaviour_logs WHERE status = 'open' AND (category = 'wellbeing' OR severity = 'urgent')")['c'] ?? 0);
    return ['ok' => true, 'logs' => $rows, 'trend' => $trend, 'openFlags' => $openFlags, 'categories' => BEHAVIOUR_CATEGORIES];
}

function admin_behaviour_review(array $p): array {
    $g = behaviour_gate($p); if (!$g['ok']) return $g;
    $n = db_update('behaviour_logs', ['status' => 'reviewed', 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso()], ['logId' => (string)($p['logId'] ?? '')]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('behaviour.review', $g['requester']['memberId'], (string)$p['logId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
