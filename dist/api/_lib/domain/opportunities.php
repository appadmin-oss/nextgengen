<?php
/**
 * Opportunities: bootcamps, competitions, volunteering and scholarships that
 * staff put in front of members (Member Portal → Learn → Opportunities).
 *
 * One list, kept in the `opportunities` setting and edited in the Control
 * Room (Learning → Opportunities, capability `content`). A member sees the
 * open ones that fit their age; nothing here is a ranking or an application.
 * "Save" is the member's own bookmark (member_state `mp9.opps`); "Ask my
 * mentor" is a message in the mentor thread, sent by the client.
 */

const OPP_TYPES = ['Training', 'Competition', 'Volunteering', 'Event', 'Scholarship', 'Internship'];
const OPP_MAX = 60;

/** The stored list, normalised. */
function opp_all(): array {
    $raw = setting_get('opportunities') ?? [];
    $out = [];
    foreach ((array)$raw as $o) {
        if (!is_array($o) || trim((string)($o['oppId'] ?? '')) === '') continue;
        $out[] = [
            'oppId' => (string)$o['oppId'], 'title' => (string)($o['title'] ?? ''), 'org' => (string)($o['org'] ?? ''),
            'type' => in_array((string)($o['type'] ?? ''), OPP_TYPES, true) ? (string)$o['type'] : 'Event',
            'closesOn' => (string)($o['closesOn'] ?? ''), 'why' => (string)($o['why'] ?? ''), 'url' => (string)($o['url'] ?? ''),
            'ageMin' => (int)($o['ageMin'] ?? 0), 'ageMax' => (int)($o['ageMax'] ?? 0),
            'status' => ($o['status'] ?? 'active') === 'hidden' ? 'hidden' : 'active',
            'updatedAt' => (string)($o['updatedAt'] ?? ''),
        ];
    }
    return $out;
}

function opp_age(string $dob, string $today): ?int {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob)) return null;
    [$y, $m, $d] = array_map('intval', explode('-', $dob));
    [$ty, $tm, $td] = array_map('intval', explode('-', $today));
    return $ty - $y - (($tm < $m || ($tm === $m && $td < $d)) ? 1 : 0);
}

/** member.opps — the open opportunities that fit this member, with their own bookmarks. */
function member_opps(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    $m = db_row("SELECT memberId, dob, type FROM members WHERE memberId = ? AND status = 'active'", [$me]);
    if (!$m) return ['ok' => false, 'error' => 'no_member'];
    $today = gmdate('Y-m-d');
    $age = opp_age((string)$m['dob'], $today);
    $saved = safe_json((string)(db_row("SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = 'mp9.opps'", [$me])['stateValue'] ?? '[]'));
    $saved = is_array($saved) ? array_values(array_map('strval', $saved)) : [];
    $items = [];
    foreach (opp_all() as $o) {
        if ($o['status'] !== 'active' || $o['title'] === '') continue;
        if ($o['closesOn'] !== '' && $o['closesOn'] < $today) continue;
        if ($age !== null && (($o['ageMin'] && $age < $o['ageMin']) || ($o['ageMax'] && $age > $o['ageMax']))) continue;
        $items[] = $o + ['saved' => in_array($o['oppId'], $saved, true)];
    }
    usort($items, static fn($a, $b) => strcmp($a['closesOn'] ?: '9999', $b['closesOn'] ?: '9999'));
    return ['ok' => true, 'items' => $items, 'age' => $age];
}

/** member.opps.save — bookmark or un-bookmark one opportunity for myself. */
function member_opps_save(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    $id = (string)($p['oppId'] ?? '');
    if (!db_row("SELECT 1 FROM members WHERE memberId = ? AND status = 'active'", [$me])) return ['ok' => false, 'error' => 'no_member'];
    if (!in_array($id, array_column(opp_all(), 'oppId'), true)) return ['ok' => false, 'error' => 'not_found'];
    $cur = safe_json((string)(db_row("SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = 'mp9.opps'", [$me])['stateValue'] ?? '[]'));
    $cur = is_array($cur) ? array_values(array_map('strval', $cur)) : [];
    $on = !in_array($id, $cur, true);
    $cur = $on ? array_values(array_unique(array_merge($cur, [$id]))) : array_values(array_diff($cur, [$id]));
    member_state_set(['memberId' => $me, 'key' => 'mp9.opps', 'value' => $cur]);
    return ['ok' => true, 'saved' => $on];
}

/** admin.opps.list — every opportunity, hidden ones included. Capability: content. */
function admin_opps_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (empty($g['ok'])) return $g;
    return ['ok' => true, 'items' => opp_all(), 'types' => OPP_TYPES, 'max' => OPP_MAX];
}

/**
 * admin.opps.save — add or change one (no oppId = new), or remove it
 * (`remove`). The whole row is validated before anything is written.
 * Capability: content.
 */
function admin_opps_save(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (empty($g['ok'])) return $g;
    $all = opp_all();
    $id = trim((string)($p['oppId'] ?? ''));
    if (!empty($p['remove'])) {
        $left = array_values(array_filter($all, static fn($o) => $o['oppId'] !== $id));
        if (count($left) === count($all)) return ['ok' => false, 'error' => 'not_found'];
        setting_set('opportunities', $left);
        audit('opps.remove', (string)$p['requesterId'], $id, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'items' => $left];
    }
    $title = trim((string)($p['title'] ?? ''));
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    foreach (['title' => 140, 'org' => 120, 'why' => 240, 'url' => 400] as $k => $max) {
        if (mb_strlen(trim((string)($p[$k] ?? ''))) > $max) return ['ok' => false, 'error' => 'too_long', 'field' => $k];
    }
    $type = (string)($p['type'] ?? 'Event');
    if (!in_array($type, OPP_TYPES, true)) return ['ok' => false, 'error' => 'bad_type'];
    $closes = trim((string)($p['closesOn'] ?? ''));
    if ($closes !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $closes)) return ['ok' => false, 'error' => 'bad_date'];
    $url = trim((string)($p['url'] ?? ''));
    if ($url !== '' && !preg_match('#^https?://#i', $url)) return ['ok' => false, 'error' => 'bad_url'];
    $min = max(0, min(25, (int)($p['ageMin'] ?? 0))); $max = max(0, min(25, (int)($p['ageMax'] ?? 0)));
    if ($min && $max && $min > $max) return ['ok' => false, 'error' => 'bad_ages'];
    $row = ['oppId' => $id !== '' ? $id : 'OPP-' . strtoupper(rand_hex(4)), 'title' => $title, 'org' => trim((string)($p['org'] ?? '')),
            'type' => $type, 'closesOn' => $closes, 'why' => trim((string)($p['why'] ?? '')), 'url' => $url,
            'ageMin' => $min, 'ageMax' => $max, 'status' => ($p['status'] ?? 'active') === 'hidden' ? 'hidden' : 'active', 'updatedAt' => now_iso()];
    $found = false;
    foreach ($all as $i => $o) if ($o['oppId'] === $row['oppId']) { $all[$i] = $row; $found = true; }
    if (!$found) {
        if ($id !== '') return ['ok' => false, 'error' => 'not_found'];
        if (count($all) >= OPP_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => OPP_MAX];
        $all[] = $row;
    }
    setting_set('opportunities', array_values($all));
    audit('opps.save', (string)$p['requesterId'], $row['oppId'], ['title' => $title], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'item' => $row, 'items' => array_values($all)];
}
