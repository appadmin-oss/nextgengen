<?php
/**
 * Public-profile enrichment: member PROJECTS ("work put into the world") and
 * mentor NOTES. Both hang off a subject — a summer student or a volunteer —
 * keyed by (subjectType, subjectId), so one model serves every profile.
 *
 * Privacy: projects are curated by admins and are public by nature. Notes are
 * private by default; ONLY notes flagged isPublic=1 are ever returned to the
 * public profile. Everything is a real, admin-entered record.
 */

const PROFILE_SUBJECT_TYPES = ['student', 'volunteer'];

/** Does this subject exist? Guards writes against dangling ids. */
function profile_subject_exists(string $type, string $id): bool {
    if ($id === '') return false;
    if ($type === 'student') return (bool)db_row('SELECT id FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
    if ($type === 'volunteer') return (bool)db_row('SELECT id FROM volunteers WHERE volunteerId = ? LIMIT 1', [$id]);
    return false;
}

/** Normalise a stored image/link URL for output (https only; drop junk). */
function profile_safe_url(string $u): string {
    $u = trim($u);
    return preg_match('#^https://#i', $u) ? substr($u, 0, 400) : '';
}

/** Public projects for a subject, ordered. */
function profile_projects_public(string $type, string $id): array {
    $rows = db_all('SELECT id, title, kind, url, imageUrl FROM profile_projects WHERE subjectType = ? AND subjectId = ? ORDER BY sortOrder ASC, id ASC', [$type, $id]);
    return array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)$r['title'], 'kind' => (string)$r['kind'],
        'url' => profile_safe_url((string)$r['url']), 'imageUrl' => profile_safe_url((string)$r['imageUrl']),
    ], $rows);
}

/** Public (isPublic=1) mentor notes for a subject, newest first. */
function profile_notes_public(string $type, string $id): array {
    $rows = db_all("SELECT author, note, createdAt FROM profile_notes WHERE subjectType = ? AND subjectId = ? AND isPublic = 1 ORDER BY id DESC", [$type, $id]);
    return array_map(fn($r) => [
        'author' => (string)$r['author'], 'note' => (string)$r['note'],
        'when' => profile_note_when((string)$r['createdAt']),
    ], $rows);
}

/** Compact "3 May" / "Wk n" style date for a note. Falls back to raw. */
function profile_note_when(string $iso): string {
    $t = strtotime($iso);
    return $t ? gmdate('j M Y', $t) : '';
}

/** Bundle both, for embedding in a public profile payload. */
function profile_public_extras(string $type, string $id): array {
    return [
        'projects' => profile_projects_public($type, $id),
        'notes'    => profile_notes_public($type, $id),
    ];
}

/* ── Admin: manage projects + notes ─────────────────────────────────────────
   Cap-gated on 'people' (the same surface that edits members/volunteers). */

function admin_profile_extras_get(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $type = (string)($p['subjectType'] ?? '');
    $id = (string)($p['subjectId'] ?? '');
    if (!in_array($type, PROFILE_SUBJECT_TYPES, true)) return ['ok' => false, 'error' => 'bad_subject'];
    $projects = db_all('SELECT id, title, kind, url, imageUrl, sortOrder FROM profile_projects WHERE subjectType = ? AND subjectId = ? ORDER BY sortOrder ASC, id ASC', [$type, $id]);
    $notes = db_all('SELECT id, author, note, isPublic, createdAt FROM profile_notes WHERE subjectType = ? AND subjectId = ? ORDER BY id DESC', [$type, $id]);
    return ['ok' => true, 'projects' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'title' => (string)$r['title'], 'kind' => (string)$r['kind'],
        'url' => (string)$r['url'], 'imageUrl' => (string)$r['imageUrl'], 'sortOrder' => (int)$r['sortOrder'],
    ], $projects), 'notes' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'author' => (string)$r['author'], 'note' => (string)$r['note'],
        'isPublic' => (int)$r['isPublic'] === 1, 'createdAt' => (string)$r['createdAt'],
    ], $notes)];
}

function admin_profile_project_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $type = (string)($p['subjectType'] ?? '');
    $id = (string)($p['subjectId'] ?? '');
    if (!in_array($type, PROFILE_SUBJECT_TYPES, true) || !profile_subject_exists($type, $id)) return ['ok' => false, 'error' => 'bad_subject'];
    $title = substr(trim((string)($p['title'] ?? '')), 0, 120);
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    $kind = substr(trim((string)($p['kind'] ?? '')), 0, 48);
    $url = profile_safe_url((string)($p['url'] ?? ''));
    $img = profile_safe_url((string)($p['imageUrl'] ?? ''));
    $sort = (int)($p['sortOrder'] ?? 0);
    $data = ['title' => $title, 'kind' => $kind, 'url' => $url, 'imageUrl' => $img, 'sortOrder' => $sort, 'updatedAt' => now_iso()];
    $pid = (int)($p['id'] ?? 0);
    if ($pid > 0 && db_row('SELECT id FROM profile_projects WHERE id = ? AND subjectType = ? AND subjectId = ?', [$pid, $type, $id])) {
        db_update('profile_projects', $data, ['id' => $pid]);
    } else {
        $pid = db_insert('profile_projects', $data + ['subjectType' => $type, 'subjectId' => $id, 'createdBy' => (string)$g['requester']['memberId'], 'createdAt' => now_iso()]);
    }
    audit('profile.project.upsert', $g['requester']['memberId'], $type . ':' . $id, ['title' => $title], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'id' => $pid];
}

function admin_profile_project_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $n = db_exec('DELETE FROM profile_projects WHERE id = ?', [(int)($p['id'] ?? 0)]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('profile.project.delete', $g['requester']['memberId'], (string)($p['id'] ?? ''), [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_profile_note_upsert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $type = (string)($p['subjectType'] ?? '');
    $id = (string)($p['subjectId'] ?? '');
    if (!in_array($type, PROFILE_SUBJECT_TYPES, true) || !profile_subject_exists($type, $id)) return ['ok' => false, 'error' => 'bad_subject'];
    $note = substr(trim((string)($p['note'] ?? '')), 0, 2000);
    if ($note === '') return ['ok' => false, 'error' => 'note_required'];
    // Author defaults to the acting admin's name when left blank.
    $author = substr(trim((string)($p['author'] ?? '')), 0, 80);
    if ($author === '') $author = (string)($g['requester']['fullName'] ?? $g['requester']['firstName'] ?? 'Mentor');
    $pub = !empty($p['isPublic']) ? 1 : 0;
    $nid = (int)($p['id'] ?? 0);
    if ($nid > 0 && db_row('SELECT id FROM profile_notes WHERE id = ? AND subjectType = ? AND subjectId = ?', [$nid, $type, $id])) {
        db_update('profile_notes', ['author' => $author, 'note' => $note, 'isPublic' => $pub], ['id' => $nid]);
    } else {
        $nid = db_insert('profile_notes', ['subjectType' => $type, 'subjectId' => $id, 'author' => $author, 'note' => $note, 'isPublic' => $pub, 'createdBy' => (string)$g['requester']['memberId'], 'createdAt' => now_iso()]);
    }
    audit('profile.note.upsert', $g['requester']['memberId'], $type . ':' . $id, ['public' => $pub], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'id' => $nid];
}

function admin_profile_note_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $n = db_exec('DELETE FROM profile_notes WHERE id = ?', [(int)($p['id'] ?? 0)]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('profile.note.delete', $g['requester']['memberId'], (string)($p['id'] ?? ''), [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
