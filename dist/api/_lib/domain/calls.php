<?php
/**
 * The NGG call room — live classes and mentor calls, monitored, with minutes.
 *
 * Shared hosting has no media server, so a call is browser to browser
 * (WebRTC, a mesh: everyone sends to everyone, which is why a room holds at
 * most CALL_MAX_PEOPLE). This server only introduces the browsers to each
 * other: offers, answers and network candidates are posted here and picked up
 * by the other side's next sync. Everything else a room needs travels the
 * same sync: who is in it, hands up, chat, and the words for the minutes.
 *
 * Safeguarding, which is the reason most of this file exists:
 *  - Only staff open a room (mentor_gate, screened). Children never start one.
 *  - A child is let in only while a staff host is in the room. When the last
 *    adult leaves, the children are told the call has paused.
 *  - Everyone sees, before joining, that the call is monitored and minuted.
 *  - Staff holding `people` (in their centres) can watch the live rooms list,
 *    join any room as an OBSERVER (shown to everyone as one), and end it.
 *  - Every join, leave, removal and end is an event on the room's record.
 *
 * Minutes. Each browser sends its OWN words, so every line is attributed to
 * the person who spoke it: audio pieces for the server to transcribe when a
 * speech-to-text key is configured (Groq or OpenAI Whisper), else the
 * browser's own live captions. When the room ends, the transcript and chat
 * become minutes: an AI summary (summary, points, decisions, actions) when AI
 * is configured, and always the attendance, times, chat and transcript.
 * Audio is deleted as soon as it is transcribed; the words are what is kept.
 */

const CALL_MAX_PEOPLE   = 8;      // a mesh past this costs every phone in the room
const CALL_PEER_STALE   = 25;     // seconds without a sync and a person has left
const CALL_HOST_GRACE   = 90;     // seconds a room stays open after the last adult drops
const CALL_SIGNAL_MAX   = 60000;  // bytes in one signal (an SDP offer is ~5 KB)
const CALL_AUDIO_MAX    = 2500000; // bytes in one audio piece (30s of opus is ~60 KB)
const CALL_TEXT_MAX     = 1000;
const CALL_TITLE_MAX    = 120;
const CALL_KINDS        = ['class', 'invite'];

/* ── Who someone is in a room ───────────────────────────────────────────── */

/** Staff reach for this person (mentor_gate), or null for a child. */
function call_staff(string $id): ?array {
    if ($id === '' || !function_exists('mentor_gate')) return null;
    $g = mentor_gate(['requesterId' => $id]);
    return !empty($g['ok']) ? $g : null;
}

/** Whether a staff gate covers a room: its course and centre, or every invitee. */
function call_staff_covers(array $g, array $room): bool {
    $centres = $g['centres'] ?? null;
    if ((string)$room['kind'] === 'class') {
        if ($centres !== null && (string)$room['centre'] !== '' && !in_array((string)$room['centre'], $centres, true)) return false;
        return function_exists('instructor_course_ok') ? instructor_course_ok($g, (string)$room['course']) : true;
    }
    foreach (call_invitees($room) as $mid) {
        $m = db_row('SELECT memberId, centre, track, courses FROM members WHERE memberId = ? LIMIT 1', [$mid]);
        if (!$m || !mentor_scope_ok($g, $m)) return false;
    }
    return true;
}

function call_invitees(array $room): array {
    $v = json_decode((string)($room['invitees'] ?? ''), true);
    return is_array($v) ? array_values(array_unique(array_filter(array_map('strval', $v)))) : [];
}

/** A monitor: holds `people` and the room's centre is in their scope. */
function call_monitor(string $id, array $room): bool {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m || !function_exists('member_effective_caps')) return false;
    if (!in_array('people', member_effective_caps($m), true)) return false;
    return (string)$room['centre'] === '' ? admin_centre_names_in_scope($m) === null : admin_centre_allowed($m, (string)$room['centre']);
}

/**
 * The part this person may play: host, staff, observer, member, or null (not
 * theirs). Decided on every request from the records, never from the client.
 */
function call_role(string $id, array $room): ?string {
    if ($id === '') return null;
    if ((string)$room['hostId'] === $id) return 'host';
    $g = call_staff($id);
    if ($g && call_staff_covers($g, $room)) return 'staff';
    if (call_monitor($id, $room)) return 'observer';
    if ($g) return null;   // staff, but not this class's
    if ((string)$room['kind'] === 'invite') return in_array($id, call_invitees($room), true) ? 'member' : null;
    $m = db_row('SELECT memberId, centre, track, courses, status FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m || (string)$m['status'] !== 'active') return null;
    if ((string)$room['centre'] !== '' && strcasecmp(trim((string)$m['centre']), (string)$room['centre']) !== 0) return null;
    return member_takes_any($m, [(string)$room['course']]) ? 'member' : null;
}

function call_is_adult(string $role): bool { return in_array($role, ['host', 'staff', 'observer'], true); }

function call_name(string $id): string {
    $a = function_exists('community_author') ? community_author($id) : ['name' => 'Member', 'initial' => ''];
    return trim($a['name'] . (($a['initial'] ?? '') !== '' ? ' ' . $a['initial'] : '')) ?: 'Member';
}

function call_room(string $roomId): ?array {
    return $roomId === '' ? null : db_row('SELECT * FROM call_rooms WHERE roomId = ? LIMIT 1', [$roomId]);
}

/** Milliseconds since the room went live (0 before), the clock of its record. */
function call_t(array $room): int {
    $s = strtotime((string)($room['startedAt'] ?? '')) ?: 0;
    return $s ? max(0, (int)round((microtime(true) - $s) * 1000)) : 0;
}

function call_event(array $room, string $personId, string $name, string $kind, string $body = ''): void {
    db_insert('call_events', ['roomId' => (string)$room['roomId'], 'personId' => $personId, 'name' => $name, 'kind' => $kind,
        'body' => mb_substr($body, 0, CALL_TEXT_MAX), 'atMs' => call_t($room), 'createdAt' => now_iso()]);
}

/** Whether an adult is in the room now (a host, staff or observer seen recently). */
function call_adult_present(string $roomId): bool {
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - CALL_PEER_STALE);
    return (bool)db_row("SELECT id FROM call_peers WHERE roomId = ? AND leftAt = '' AND lastSeen >= ? AND role IN ('host','staff','observer') LIMIT 1", [$roomId, $cut]);
}

/** Close the peers nobody has heard from; one leave event each. */
function call_sweep(array $room): void {
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - CALL_PEER_STALE);
    foreach (db_all("SELECT peerId, personId, name FROM call_peers WHERE roomId = ? AND leftAt = '' AND lastSeen < ?", [(string)$room['roomId'], $cut]) as $p) {
        db_update('call_peers', ['leftAt' => now_iso()], ['peerId' => $p['peerId']]);
        call_event($room, (string)$p['personId'], (string)$p['name'], 'leave', 'lost connection');
    }
}

/* ── Opening, listing, ending ───────────────────────────────────────────── */

/** call.create — staff open a room for a class (course at a centre) or for named members. */
function call_create(array $p): array {
    $id = (string)($p['requesterId'] ?? '');
    $g = call_staff($id);
    if (!$g) return ['ok' => false, 'error' => 'forbidden'];
    if (array_key_exists('screened', $g) && !$g['screened']) return ['ok' => false, 'error' => 'not_screened', 'message' => 'Your safeguarding check is not complete yet, so you cannot open a call with children.'];
    $kind = (string)($p['kind'] ?? 'class');
    if (!in_array($kind, CALL_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $title = trim(mb_substr((string)($p['title'] ?? ''), 0, CALL_TITLE_MAX));
    $course = trim((string)($p['course'] ?? ''));
    $centre = trim((string)($p['centre'] ?? ''));
    $inv = array_values(array_unique(array_filter(array_map('strval', (array)($p['invitees'] ?? [])))));
    if ($kind === 'class') {
        if ($course === '') return ['ok' => false, 'error' => 'course_required'];
        if ($centre === '' && ($g['centres'] ?? null) !== null) $centre = (string)(($g['centres'] ?? [])[0] ?? '');
        $inv = [];
    } else {
        if (!$inv) return ['ok' => false, 'error' => 'invitees_required'];
        if (count($inv) > CALL_MAX_PEOPLE - 1) return ['ok' => false, 'error' => 'too_many', 'max' => CALL_MAX_PEOPLE - 1];
        $first = db_row('SELECT centre FROM members WHERE memberId = ? LIMIT 1', [$inv[0]]);
        $centre = (string)($first['centre'] ?? '');
    }
    $room = ['kind' => $kind, 'course' => $course, 'centre' => $centre, 'invitees' => json_encode($inv), 'hostId' => $id];
    if (!call_staff_covers($g, $room)) return ['ok' => false, 'error' => 'out_of_scope'];
    $at = trim((string)($p['scheduledAt'] ?? ''));
    if ($at !== '' && !strtotime($at)) return ['ok' => false, 'error' => 'bad_time'];
    $roomId = 'CALL-' . strtoupper(rand_hex(6));
    db_insert('call_rooms', $room + ['roomId' => $roomId, 'title' => $title !== '' ? $title : ($kind === 'class' ? $course . ' class' : 'Call with ' . call_name($id)),
        'status' => 'scheduled', 'scheduledAt' => $at !== '' ? gmdate('Y-m-d\TH:i:s\Z', strtotime($at)) : '', 'startedAt' => '', 'endedAt' => '',
        'minutesStatus' => 'none', 'minutesJson' => '', 'createdAt' => now_iso()]);
    $r = call_room($roomId);
    // The children it is for are told, with the time; nobody is told a room exists that they cannot join.
    $who = $kind === 'invite' ? $inv : array_column(call_class_members($r), 'memberId');
    foreach (array_slice($who, 0, 200) as $mid) push_notification($mid, ['kind' => 'call', 'title' => call_name($id) . ' opened a call: ' . $r['title'],
        'body' => $r['scheduledAt'] !== '' ? 'It starts ' . gmdate('D j M, H:i', strtotime($r['scheduledAt'])) . ' (UTC). Open it from your portal.' : 'Open it from your portal to join.', 'linkPage' => 'call/' . $roomId]);
    audit('call.create', $id, $roomId, ['kind' => $kind, 'course' => $course, 'centre' => $centre, 'invited' => count($who)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'room' => call_public($r, 'host')];
}

/** The members a class room is for (course + centre), in one query. */
function call_class_members(array $room): array {
    if ((string)$room['kind'] !== 'class') return [];
    [$sql, $args] = member_course_sql((string)$room['course']);
    $where = "status = 'active' AND COALESCE(type,'NGG') <> 'Summer' AND $sql";
    if ((string)$room['centre'] !== '') { $where .= ' AND lower(centre) = lower(?)'; $args[] = (string)$room['centre']; }
    return db_all("SELECT memberId, fullName FROM members WHERE $where LIMIT 500", $args);
}

function call_public(array $r, ?string $role = null): array {
    $live = (string)$r['status'] === 'live';
    $people = $live ? (int)(db_row("SELECT COUNT(*) c FROM call_peers WHERE roomId = ? AND leftAt = '' AND lastSeen >= ?", [(string)$r['roomId'], gmdate('Y-m-d\TH:i:s\Z', time() - CALL_PEER_STALE)])['c'] ?? 0) : 0;
    return ['roomId' => (string)$r['roomId'], 'title' => (string)$r['title'], 'kind' => (string)$r['kind'], 'course' => (string)$r['course'], 'centre' => (string)$r['centre'],
        'host' => call_name((string)$r['hostId']), 'hostId' => (string)$r['hostId'], 'status' => (string)$r['status'], 'scheduledAt' => (string)$r['scheduledAt'],
        'startedAt' => (string)$r['startedAt'], 'endedAt' => (string)$r['endedAt'], 'people' => $people, 'role' => $role ?? '',
        'minutesStatus' => (string)$r['minutesStatus'], 'max' => CALL_MAX_PEOPLE];
}

/** call.mine — the rooms this person may join (upcoming and live), and as staff the ones they host. */
function call_mine(array $p): array {
    $id = (string)($p['requesterId'] ?? '');
    $rows = db_all("SELECT * FROM call_rooms WHERE status IN ('scheduled','live') OR (status = 'ended' AND endedAt >= ?) ORDER BY (status = 'live') DESC, scheduledAt, createdAt DESC LIMIT 200",
        [gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400)]);
    $out = [];
    foreach ($rows as $r) {
        $role = call_role($id, $r);
        if ($role === null || ($role === 'observer' && (string)$r['hostId'] !== $id)) continue;   // the monitor desk is where observers find rooms
        if ((string)$r['status'] === 'ended' && !call_is_adult($role)) continue;
        $out[] = call_public($r, $role);
    }
    $g = call_staff($id);
    return ['ok' => true, 'rooms' => $out, 'canCreate' => (bool)$g && (!array_key_exists('screened', $g) || $g['screened']),
        'courses' => $g ? ($g['courses'] ?? null) : null, 'centres' => $g ? ($g['centres'] ?? null) : null, 'max' => CALL_MAX_PEOPLE];
}

/* ── Being in a room ────────────────────────────────────────────────────── */

/** call.join — a new connection (peer) for this person; the room goes live when its first adult joins. */
function call_join(array $p): array {
    $id = (string)($p['requesterId'] ?? '');
    $room = call_room((string)($p['roomId'] ?? ''));
    if (!$room) return ['ok' => false, 'error' => 'not_found'];
    $role = call_role($id, $room);
    if ($role === null) return ['ok' => false, 'error' => 'not_your_call'];
    if ((string)$room['status'] === 'ended') return ['ok' => false, 'error' => 'call_ended'];
    call_sweep($room);
    $adult = call_is_adult($role);
    // A child waits until an adult who belongs to the class is in the room.
    if (!$adult && ((string)$room['status'] !== 'live' || !call_adult_present((string)$room['roomId']))) {
        return ['ok' => false, 'error' => 'waiting_for_host', 'message' => 'Your ' . ((string)$room['kind'] === 'class' ? 'instructor' : 'mentor') . ' has not opened the room yet. It opens when they join.'];
    }
    // One connection per person: joining again (a second tab, a reload) replaces the first.
    foreach (db_all("SELECT peerId FROM call_peers WHERE roomId = ? AND personId = ? AND leftAt = ''", [(string)$room['roomId'], $id]) as $old)
        db_update('call_peers', ['leftAt' => now_iso()], ['peerId' => $old['peerId']]);
    $here = (int)(db_row("SELECT COUNT(*) c FROM call_peers WHERE roomId = ? AND leftAt = '' AND role != 'observer'", [(string)$room['roomId']])['c'] ?? 0);
    if ($role !== 'observer' && $here >= CALL_MAX_PEOPLE) return ['ok' => false, 'error' => 'room_full', 'max' => CALL_MAX_PEOPLE];
    if ((string)$room['status'] !== 'live') {
        if (!$adult || $role === 'observer') return ['ok' => false, 'error' => 'waiting_for_host'];
        db_update('call_rooms', ['status' => 'live', 'startedAt' => now_iso()], ['roomId' => (string)$room['roomId']]);
        $room = call_room((string)$room['roomId']);
        call_event($room, $id, call_name($id), 'start', '');
    }
    $peerId = 'P' . rand_hex(8);
    $name = call_name($id);
    db_insert('call_peers', ['peerId' => $peerId, 'roomId' => (string)$room['roomId'], 'personId' => $id, 'name' => $name, 'role' => $role,
        'mic' => 1, 'cam' => $role === 'observer' ? 0 : 1, 'hand' => 0, 'joinedAt' => now_iso(), 'lastSeen' => now_iso(), 'leftAt' => '']);
    call_event($room, $id, $name, 'join', $role);
    audit('call.join', $id, (string)$room['roomId'], ['role' => $role], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'peerId' => $peerId, 'role' => $role, 'room' => call_public($room, $role), 'name' => $name,
        'ice' => call_ice_servers(), 'transcribe' => call_can_transcribe(),
        'notice' => 'This call is monitored by NGG staff and minuted. What you say is written down for the record.'];
}

/** STUN always; TURN when the deployment has one (config: call.turn = [urls, username, credential]). */
function call_ice_servers(): array {
    $out = [['urls' => ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']]];
    $t = $GLOBALS['CONFIG']['call']['turn'] ?? null;
    if (is_array($t) && !empty($t['urls'])) $out[] = ['urls' => (array)$t['urls'], 'username' => (string)($t['username'] ?? ''), 'credential' => (string)($t['credential'] ?? '')];
    return $out;
}

/**
 * call.sync — one round trip a second or two: my state and outgoing signals
 * in; who is here, signals for me, and new events out. One request, so a room
 * of eight is eight requests a tick, not forty.
 */
function call_sync(array $p): array {
    $id = (string)($p['requesterId'] ?? '');
    $peerId = (string)($p['peerId'] ?? '');
    $me = db_row('SELECT * FROM call_peers WHERE peerId = ? LIMIT 1', [$peerId]);
    if (!$me || (string)$me['personId'] !== $id) return ['ok' => false, 'error' => 'not_in_call'];
    $room = call_room((string)$me['roomId']);
    if (!$room) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$me['leftAt'] !== '') return ['ok' => false, 'error' => (string)$me['role'] === 'removed' ? 'removed' : 'left', 'ended' => (string)$room['status'] === 'ended'];
    if ((string)$room['status'] === 'ended') return ['ok' => true, 'ended' => true, 'peers' => [], 'signals' => [], 'events' => []];
    $st = (array)($p['state'] ?? []);
    $patch = ['lastSeen' => now_iso()];
    foreach (['mic', 'cam', 'hand', 'screen'] as $k) if (array_key_exists($k, $st)) $patch[$k] = !empty($st[$k]) ? 1 : 0;
    if (isset($patch['hand']) && $patch['hand'] !== (int)$me['hand']) call_event($room, $id, (string)$me['name'], $patch['hand'] ? 'hand' : 'hand_down');
    db_update('call_peers', $patch, ['peerId' => $peerId]);
    // Outgoing signals: only to a peer in this room.
    $sent = 0;
    foreach (array_slice((array)($p['signals'] ?? []), 0, 40) as $sg) {
        $to = (string)($sg['to'] ?? ''); $kind = (string)($sg['kind'] ?? '');
        $data = json_encode($sg['data'] ?? null, JSON_UNESCAPED_SLASHES);
        if (!in_array($kind, ['offer', 'answer', 'ice', 'bye'], true) || strlen((string)$data) > CALL_SIGNAL_MAX) continue;
        if (!db_row("SELECT id FROM call_peers WHERE peerId = ? AND roomId = ? AND leftAt = ''", [$to, (string)$room['roomId']])) continue;
        db_insert('call_signals', ['roomId' => (string)$room['roomId'], 'fromPeer' => $peerId, 'toPeer' => $to, 'kind' => $kind, 'data' => (string)$data, 'createdAt' => now_iso()]);
        $sent++;
    }
    call_sweep($room);
    // Signals for me, once: read then deleted.
    $in = db_all('SELECT id, fromPeer, kind, data FROM call_signals WHERE toPeer = ? ORDER BY id LIMIT 200', [$peerId]);
    if ($in) db_exec('DELETE FROM call_signals WHERE toPeer = ? AND id <= ?', [$peerId, (int)end($in)['id']]);
    $since = max(0, (int)($p['since'] ?? 0));
    $ev = db_all('SELECT id, personId, name, kind, body, atMs FROM call_events WHERE roomId = ? AND id > ? AND kind IN (\'chat\',\'join\',\'leave\',\'hand\',\'removed\',\'start\',\'paused\') ORDER BY id LIMIT 200', [(string)$room['roomId'], $since]);
    $peers = array_map(static fn($x) => ['peerId' => (string)$x['peerId'], 'personId' => (string)$x['personId'], 'name' => (string)$x['name'], 'role' => (string)$x['role'],
        'mic' => (int)$x['mic'] === 1, 'cam' => (int)$x['cam'] === 1, 'hand' => (int)$x['hand'] === 1, 'screen' => (int)($x['screen'] ?? 0) === 1, 'joinedAt' => (string)$x['joinedAt']],
        db_all("SELECT * FROM call_peers WHERE roomId = ? AND leftAt = '' ORDER BY joinedAt", [(string)$room['roomId']]));
    $adultHere = call_adult_present((string)$room['roomId']);
    // No adult for the grace period: the room pauses for the children in it.
    $paused = !$adultHere;
    if ($paused && !call_is_adult((string)$me['role'])) {
        $lastAdult = db_row("SELECT MAX(lastSeen) t FROM call_peers WHERE roomId = ? AND role IN ('host','staff')", [(string)$room['roomId']]);
        if ((time() - (strtotime((string)($lastAdult['t'] ?? '')) ?: 0)) > CALL_HOST_GRACE) {
            db_update('call_peers', ['leftAt' => now_iso()], ['peerId' => $peerId]);
            call_event($room, $id, (string)$me['name'], 'leave', 'no adult in the room');
            return ['ok' => true, 'ended' => false, 'paused' => true, 'closed' => true, 'peers' => [], 'signals' => [], 'events' => []];
        }
    }
    return ['ok' => true, 'ended' => false, 'paused' => $paused, 'sent' => $sent, 'peers' => $peers,
        'signals' => array_map(static fn($x) => ['from' => (string)$x['fromPeer'], 'kind' => (string)$x['kind'], 'data' => json_decode((string)$x['data'], true)], $in),
        'events' => array_map(static fn($x) => ['id' => (int)$x['id'], 'personId' => (string)$x['personId'], 'name' => (string)$x['name'], 'kind' => (string)$x['kind'], 'body' => (string)$x['body'], 'atMs' => (int)$x['atMs']], $ev),
        't' => call_t($room)];
}

/** The peer row for this request, in a live room, or an error. */
function call_me(array $p): array {
    $me = db_row('SELECT * FROM call_peers WHERE peerId = ? LIMIT 1', [(string)($p['peerId'] ?? '')]);
    if (!$me || (string)$me['personId'] !== (string)($p['requesterId'] ?? '') || (string)$me['leftAt'] !== '') return ['ok' => false, 'error' => 'not_in_call'];
    $room = call_room((string)$me['roomId']);
    if (!$room || (string)$room['status'] !== 'live') return ['ok' => false, 'error' => 'call_ended'];
    return ['ok' => true, 'me' => $me, 'room' => $room];
}

/** call.say — a chat message, or a caption line (the speaker's own words, from their browser). */
function call_say(array $p): array {
    $c = call_me($p); if (empty($c['ok'])) return $c;
    $kind = (string)($p['kind'] ?? 'chat') === 'caption' ? 'caption' : 'chat';
    $text = trim(mb_substr((string)($p['text'] ?? ''), 0, CALL_TEXT_MAX));
    if ($text === '') return ['ok' => false, 'error' => 'empty'];
    if ($kind === 'chat' && function_exists('community_screen')) {
        $sc = community_screen($text);
        if (($sc['verdict'] ?? '') === 'block') return ['ok' => false, 'error' => 'blocked', 'message' => 'That message can’t be sent here.'];
    }
    // Captions arrive as the speaker talks; the observer role is a watcher, not a speaker.
    if ($kind === 'caption' && (string)$c['me']['role'] === 'observer' && empty($c['me']['mic'])) return ['ok' => true, 'skipped' => true];
    call_event($c['room'], (string)$c['me']['personId'], (string)$c['me']['name'], $kind, $text);
    return ['ok' => true];
}

/** call.leave — this connection leaves; the host leaving does not end the call (End does). */
function call_leave(array $p): array {
    $c = call_me($p); if (empty($c['ok'])) return ['ok' => true];
    db_update('call_peers', ['leftAt' => now_iso()], ['peerId' => (string)$c['me']['peerId']]);
    call_event($c['room'], (string)$c['me']['personId'], (string)$c['me']['name'], 'leave', '');
    return ['ok' => true];
}

/** call.remove — a host, staff member or observer takes someone out of the room. */
function call_remove(array $p): array {
    $c = call_me($p); if (empty($c['ok'])) return $c;
    if (!call_is_adult((string)$c['me']['role'])) return ['ok' => false, 'error' => 'forbidden'];
    $t = db_row("SELECT * FROM call_peers WHERE peerId = ? AND roomId = ? AND leftAt = ''", [(string)($p['target'] ?? ''), (string)$c['room']['roomId']]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['role'] === 'host') return ['ok' => false, 'error' => 'cannot_remove_host'];
    db_update('call_peers', ['leftAt' => now_iso(), 'role' => 'removed'], ['peerId' => (string)$t['peerId']]);
    call_event($c['room'], (string)$t['personId'], (string)$t['name'], 'removed', 'by ' . (string)$c['me']['name']);
    audit('call.remove', (string)$c['me']['personId'], (string)$c['room']['roomId'], ['who' => (string)$t['personId']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** call.end — the host, a staff member of the class, or a monitor ends the call for everyone. */
function call_end(array $p): array {
    $id = (string)($p['requesterId'] ?? '');
    $room = call_room((string)($p['roomId'] ?? ''));
    if (!$room) return ['ok' => false, 'error' => 'not_found'];
    $role = call_role($id, $room);
    if ($role === null || !call_is_adult($role)) return ['ok' => false, 'error' => 'forbidden'];
    if ((string)$room['status'] === 'ended') return ['ok' => true, 'already' => true];
    $wasLive = (string)$room['status'] === 'live';
    db_update('call_rooms', ['status' => 'ended', 'endedAt' => now_iso(), 'minutesStatus' => $wasLive ? 'pending' : 'none'], ['roomId' => (string)$room['roomId']]);
    db_exec("UPDATE call_peers SET leftAt = ? WHERE roomId = ? AND leftAt = ''", [now_iso(), (string)$room['roomId']]);
    db_exec('DELETE FROM call_signals WHERE roomId = ?', [(string)$room['roomId']]);
    if ($wasLive) call_event($room, $id, call_name($id), 'end', $role === 'observer' ? 'ended by a monitor' : '');
    audit('call.end', $id, (string)$room['roomId'], ['role' => $role, 'live' => $wasLive], (string)($p['ip'] ?? ''));
    // Minutes now when the words are already text; audio still to transcribe finishes on call.process / the nightly job.
    $res = $wasLive ? call_process(['requesterId' => $id, 'roomId' => (string)$room['roomId'], 'budget' => 6]) : ['ok' => true];
    return ['ok' => true, 'minutesStatus' => (string)(call_room((string)$room['roomId'])['minutesStatus'] ?? '')] + (isset($res['minutes']) ? ['minutes' => $res['minutes']] : []);
}

/* ── Audio, transcripts and minutes ─────────────────────────────────────── */

function call_audio_dir(): string {
    $base = (string)($GLOBALS['CONFIG']['db']['sqlite_path'] ?? '');
    $dir = ($base !== '' ? dirname($base) : (__DIR__ . '/../../storage')) . '/call-audio';
    if (!is_dir($dir)) @mkdir($dir, 0770, true);
    return $dir;
}

/** A transcription key: Groq or OpenAI (both serve Whisper), or the test seam. */
function call_transcriber(): ?array {
    if (isset($GLOBALS['__call_transcribe_mock']) && is_callable($GLOBALS['__call_transcribe_mock'])) return ['provider' => 'mock'];
    $cands = function_exists('ai_profile_chain') ? ai_profile_chain('default') : [];
    foreach ($cands as $c) if (in_array($c['provider'], ['groq', 'openai'], true)) return $c;
    return null;
}
function call_can_transcribe(): bool { return call_transcriber() !== null; }

/** Speech to text for one audio piece. Never throws: ['ok', 'text'] or an error. */
function call_transcribe_file(string $path, string $mime): array {
    $t = call_transcriber();
    if (!$t) return ['ok' => false, 'error' => 'no_transcriber'];
    if ($t['provider'] === 'mock') return ($GLOBALS['__call_transcribe_mock'])($path, $mime);
    if (!function_exists('curl_init') || !is_file($path)) return ['ok' => false, 'error' => 'unavailable'];
    $url = $t['provider'] === 'groq' ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions';
    $model = $t['provider'] === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $t['api_key']],
        CURLOPT_POSTFIELDS => ['model' => $model, 'response_format' => 'json', 'language' => 'en', 'file' => new CURLFile($path, $mime ?: 'audio/webm', 'piece.webm')]]);
    $body = (string)curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $j = json_decode($body, true);
    if ($code !== 200 || !is_array($j)) return ['ok' => false, 'error' => 'transcribe_failed', 'status' => $code];
    return ['ok' => true, 'text' => trim((string)($j['text'] ?? ''))];
}

/** call.audio — a piece of the sender's own microphone, kept until it is transcribed. */
function call_audio(array $p): array {
    $c = call_me($p); if (empty($c['ok'])) return $c;
    if (!call_can_transcribe()) return ['ok' => false, 'error' => 'no_transcriber'];
    $raw = (string)($p['bytes'] ?? '');
    if ($raw === '' || strlen($raw) > CALL_AUDIO_MAX) return ['ok' => false, 'error' => 'bad_audio'];
    $mime = (string)($p['mime'] ?? 'audio/webm');
    if (!preg_match('#^audio/(webm|ogg|mp4|mpeg|wav)#', $mime)) return ['ok' => false, 'error' => 'bad_audio'];
    $file = call_audio_dir() . '/' . (string)$c['room']['roomId'] . '-' . rand_hex(8) . '.bin';
    if (@file_put_contents($file, $raw) === false) return ['ok' => false, 'error' => 'storage'];
    db_insert('call_audio', ['roomId' => (string)$c['room']['roomId'], 'personId' => (string)$c['me']['personId'], 'name' => (string)$c['me']['name'],
        'atMs' => max(0, call_t($c['room']) - max(0, min(120000, (int)($p['durMs'] ?? 30000)))), 'path' => $file, 'mime' => $mime, 'status' => 'pending', 'createdAt' => now_iso()]);
    return ['ok' => true];
}

/**
 * call.process — transcribe waiting audio (a few pieces a call, so one request
 * stays short on shared hosting), and write the minutes once a room has ended
 * and nothing is waiting. Run by the host's browser during a call, at the end,
 * and by the nightly job for anything left.
 */
function call_process(array $p): array {
    $roomId = (string)($p['roomId'] ?? '');
    $budget = max(1, min(20, (int)($p['budget'] ?? 4)));
    if (empty($p['system'])) {
        $room = call_room($roomId);
        if (!$room) return ['ok' => false, 'error' => 'not_found'];
        $role = call_role((string)($p['requesterId'] ?? ''), $room);
        if ($role === null || !call_is_adult($role)) return ['ok' => false, 'error' => 'forbidden'];
    }
    $where = $roomId !== '' ? 'roomId = ? AND ' : '';
    $done = 0;
    foreach (db_all("SELECT * FROM call_audio WHERE {$where}status = 'pending' ORDER BY id LIMIT " . $budget, $roomId !== '' ? [$roomId] : []) as $a) {
        $r = call_transcribe_file((string)$a['path'], (string)$a['mime']);
        $ok = !empty($r['ok']);
        db_update('call_audio', ['status' => $ok ? 'done' : 'failed', 'text' => $ok ? mb_substr((string)$r['text'], 0, 4000) : ''], ['id' => (int)$a['id']]);
        @unlink((string)$a['path']);   // the words are kept; the voice is not
        $done++;
    }
    $made = null;
    $rooms = $roomId !== '' ? [$roomId] : array_column(db_all("SELECT roomId FROM call_rooms WHERE status = 'ended' AND minutesStatus = 'pending' LIMIT 10"), 'roomId');
    foreach ($rooms as $rid) {
        $room = call_room($rid);
        if (!$room || (string)$room['status'] !== 'ended' || (string)$room['minutesStatus'] !== 'pending') continue;
        if (db_row("SELECT id FROM call_audio WHERE roomId = ? AND status = 'pending' LIMIT 1", [$rid])) continue;
        $made = call_minutes_build($room);
    }
    return ['ok' => true, 'transcribed' => $done] + ($made ? ['minutes' => $made] : []);
}

/** The room's record as lines, in time order: who said what, and when. */
function call_transcript(string $roomId): array {
    $lines = [];
    foreach (db_all("SELECT personId, name, kind, body, atMs FROM call_events WHERE roomId = ? AND kind IN ('chat','caption') ORDER BY atMs, id", [$roomId]) as $e)
        $lines[] = ['atMs' => (int)$e['atMs'], 'who' => (string)$e['name'], 'personId' => (string)$e['personId'], 'kind' => (string)$e['kind'] === 'chat' ? 'chat' : 'speech', 'text' => (string)$e['body']];
    foreach (db_all("SELECT personId, name, text, atMs FROM call_audio WHERE roomId = ? AND status = 'done' AND text != ''", [$roomId]) as $a)
        $lines[] = ['atMs' => (int)$a['atMs'], 'who' => (string)$a['name'], 'personId' => (string)$a['personId'], 'kind' => 'speech', 'text' => (string)$a['text']];
    usort($lines, static fn($x, $y) => $x['atMs'] <=> $y['atMs']);
    // Audio and captions of the same words: when a speaker has audio, their captions are dropped.
    $hasAudio = [];
    foreach ($lines as $l) if ($l['kind'] === 'speech' && db_row("SELECT id FROM call_audio WHERE roomId = ? AND personId = ? AND status = 'done' LIMIT 1", [$roomId, $l['personId']])) $hasAudio[$l['personId']] = true;
    return array_values(array_filter($lines, static fn($l) => !($l['kind'] === 'speech' && isset($hasAudio[$l['personId']]) && !db_row("SELECT id FROM call_audio WHERE roomId = ? AND personId = ? AND text = ? LIMIT 1", [$roomId, $l['personId'], $l['text']]))));
}

function call_clock(int $ms): string { $s = intdiv($ms, 1000); return sprintf('%d:%02d', intdiv($s, 60), $s % 60); }

/** Write the minutes: attendance and times always; an AI summary when AI is configured. */
function call_minutes_build(array $room): array {
    $rid = (string)$room['roomId'];
    $att = [];
    foreach (db_all('SELECT personId, name, role, joinedAt, leftAt FROM call_peers WHERE roomId = ? ORDER BY joinedAt', [$rid]) as $x) {
        $k = (string)$x['personId'];
        $secs = max(0, (strtotime((string)$x['leftAt'] ?: now_iso()) ?: time()) - (strtotime((string)$x['joinedAt']) ?: time()));
        if (!isset($att[$k])) $att[$k] = ['name' => (string)$x['name'], 'role' => (string)$x['role'] === 'removed' ? 'member' : (string)$x['role'], 'firstIn' => (string)$x['joinedAt'], 'minutes' => 0, 'removed' => false];
        $att[$k]['minutes'] += (int)round($secs / 60);
        if ((string)$x['role'] === 'removed') $att[$k]['removed'] = true;
    }
    $lines = call_transcript($rid);
    $hands = (int)(db_row("SELECT COUNT(*) c FROM call_events WHERE roomId = ? AND kind = 'hand'", [$rid])['c'] ?? 0);
    $dur = max(0, (strtotime((string)$room['endedAt']) ?: time()) - (strtotime((string)$room['startedAt']) ?: time()));
    $m = ['title' => (string)$room['title'], 'course' => (string)$room['course'], 'centre' => (string)$room['centre'], 'host' => call_name((string)$room['hostId']),
        'startedAt' => (string)$room['startedAt'], 'endedAt' => (string)$room['endedAt'], 'durationMins' => (int)round($dur / 60),
        'attendance' => array_values($att), 'handsRaised' => $hands, 'lines' => count($lines),
        'transcript' => array_map(static fn($l) => ['at' => call_clock($l['atMs']), 'who' => $l['who'], 'kind' => $l['kind'], 'text' => $l['text']], array_slice($lines, 0, 1500)),
        'summary' => '', 'points' => [], 'decisions' => [], 'actions' => [], 'questions' => [], 'concerns' => [], 'ai' => false,
        'source' => db_row("SELECT id FROM call_audio WHERE roomId = ? LIMIT 1", [$rid]) ? 'audio' : ($lines ? 'captions' : 'none')];
    if ($lines && function_exists('ai_enabled') && ai_enabled('default')) {
        $txt = '';
        foreach ($lines as $l) { $txt .= '[' . call_clock($l['atMs']) . '] ' . $l['who'] . ($l['kind'] === 'chat' ? ' (chat)' : '') . ': ' . $l['text'] . "\n"; if (mb_strlen($txt) > 24000) break; }
        $sys = 'You write the minutes of a youth programme call (an NGG class or mentor call; most speakers are children, the host is an adult). '
             . 'From the transcript, reply with JSON only: {"summary": string (3-5 plain sentences), "points": [string], "decisions": [string], '
             . '"actions": [{"who": string, "what": string, "when": string}], "questions": [string] (questions left unanswered), '
             . '"concerns": [string] (anything a safeguarding lead should look at: unkindness, personal details shared, a child in distress; [] if none)}. '
             . 'Use only what was said. Name people as they are named in the transcript. No markdown.';
        $r = ai_complete($sys, "Call: " . $room['title'] . "\n\n" . $txt, 1100, 'default');
        $j = !empty($r['ok']) ? json_decode((string)preg_replace('/^```(?:json)?|```$/m', '', trim((string)($r['text'] ?? ''))), true) : null;
        if (is_array($j)) {
            $m['ai'] = true;
            $m['summary'] = mb_substr((string)($j['summary'] ?? ''), 0, 1500);
            foreach (['points', 'decisions', 'questions', 'concerns'] as $k) $m[$k] = array_slice(array_values(array_filter(array_map(static fn($x) => mb_substr(trim((string)$x), 0, 400), (array)($j[$k] ?? [])))), 0, 20);
            $m['actions'] = array_slice(array_values(array_filter(array_map(static fn($x) => is_array($x) ? ['who' => mb_substr((string)($x['who'] ?? ''), 0, 80), 'what' => mb_substr((string)($x['what'] ?? ''), 0, 300), 'when' => mb_substr((string)($x['when'] ?? ''), 0, 60)] : null, (array)($j['actions'] ?? [])), static fn($x) => $x && $x['what'] !== '')), 0, 20);
        }
    }
    db_update('call_rooms', ['minutesStatus' => 'ready', 'minutesJson' => json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], ['roomId' => $rid]);
    // A concern the summary raised reaches the safeguarding route, not only the minutes.
    if ($m['concerns'] && function_exists('ops_record')) ops_record('warn', 'call.concern', 'Call minutes raised a concern', 'room=' . $rid . ' · ' . $m['concerns'][0]);
    audit('call.minutes', 'system', $rid, ['lines' => count($lines), 'ai' => $m['ai']], '');
    return $m;
}

/** call.minutes — the record of a call, for its adults and the monitors. */
function call_minutes(array $p): array {
    $room = call_room((string)($p['roomId'] ?? ''));
    if (!$room) return ['ok' => false, 'error' => 'not_found'];
    $role = call_role((string)($p['requesterId'] ?? ''), $room);
    if ($role === null || !call_is_adult($role)) return ['ok' => false, 'error' => 'forbidden'];
    $m = json_decode((string)$room['minutesJson'], true);
    return ['ok' => true, 'room' => call_public($room, $role), 'minutesStatus' => (string)$room['minutesStatus'], 'minutes' => is_array($m) ? $m : null];
}

/* ── The monitor desk (Control Room) ────────────────────────────────────── */

/** admin.calls — live rooms with who is in them, and recent ones with their minutes' state; centre-scoped. */
function admin_calls(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM call_rooms WHERE status IN ('live','scheduled') OR endedAt >= ? ORDER BY (status = 'live') DESC, COALESCE(NULLIF(startedAt,''), scheduledAt, createdAt) DESC LIMIT 300",
        [gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400)]);
    $rows = array_values(array_filter($rows, static fn($r) => (string)$r['centre'] === '' ? admin_centre_names_in_scope($g['requester']) === null : admin_centre_allowed($g['requester'], (string)$r['centre'])));
    $live = array_values(array_filter($rows, static fn($r) => (string)$r['status'] === 'live'));
    $peers = [];
    if ($live) {
        $ids = array_column($live, 'roomId'); $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT roomId, name, role, mic, cam, hand, joinedAt, lastSeen FROM call_peers WHERE leftAt = '' AND roomId IN ($ph) ORDER BY joinedAt", $ids) as $x)
            $peers[(string)$x['roomId']][] = ['name' => (string)$x['name'], 'role' => (string)$x['role'], 'mic' => (int)$x['mic'] === 1, 'cam' => (int)$x['cam'] === 1, 'hand' => (int)$x['hand'] === 1, 'joinedAt' => (string)$x['joinedAt']];
    }
    $out = array_map(static function ($r) use ($peers) {
        $m = json_decode((string)$r['minutesJson'], true);
        return call_public($r) + ['peers' => $peers[(string)$r['roomId']] ?? [], 'adultHere' => (string)$r['status'] === 'live' ? call_adult_present((string)$r['roomId']) : false,
            'concerns' => is_array($m) ? count((array)($m['concerns'] ?? [])) : 0, 'summary' => is_array($m) ? mb_substr((string)($m['summary'] ?? ''), 0, 240) : ''];
    }, $rows);
    return ['ok' => true, 'rooms' => $out, 'live' => count($live)];
}

/* ── Nightly: rooms left open, audio left waiting ───────────────────────── */

/** End rooms nobody has been in for an hour, and a scheduled room a day past its time; then process. */
function call_nightly(): array {
    $ended = 0;
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - 3600);
    foreach (db_all("SELECT * FROM call_rooms WHERE status = 'live'") as $r) {
        $last = db_row('SELECT MAX(lastSeen) t FROM call_peers WHERE roomId = ?', [(string)$r['roomId']]);
        if ((string)($last['t'] ?? '') < $cut) {
            db_update('call_rooms', ['status' => 'ended', 'endedAt' => (string)($last['t'] ?? '') ?: now_iso(), 'minutesStatus' => 'pending'], ['roomId' => (string)$r['roomId']]);
            db_exec("UPDATE call_peers SET leftAt = ? WHERE roomId = ? AND leftAt = ''", [now_iso(), (string)$r['roomId']]);
            $ended++;
        }
    }
    db_exec("UPDATE call_rooms SET status = 'ended', endedAt = ?, minutesStatus = 'none' WHERE status = 'scheduled' AND scheduledAt != '' AND scheduledAt < ?", [now_iso(), gmdate('Y-m-d\TH:i:s\Z', time() - 86400)]);
    db_exec('DELETE FROM call_signals WHERE createdAt < ?', [$cut]);
    $r = call_process(['system' => true, 'budget' => 20]);
    return ['ended' => $ended, 'transcribed' => (int)($r['transcribed'] ?? 0)];
}
