<?php
declare(strict_types=1);

/**
 * WhatsApp through Kapso (owner, 14 Nov 2026: "Integrate Kapso" — every text WhatsApp first, SMS as the
 * fallback; replies from parents into the Control Room inbox).
 *
 * Kapso is a WhatsApp Business API platform that proxies Meta's Cloud API:
 *   POST https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages, header X-API-Key.
 * WhatsApp's own rule shapes everything here: a business may start a conversation only with a TEMPLATE
 * Meta has approved. Free text is allowed only inside the 24 hours after the person last wrote to us.
 * So:
 *   · every outgoing text (sms_send in api/_lib/sms.php) goes as ONE approved template whose body carries
 *     the message as its single parameter — "Next Generation Genius: {{1}}" — then falls to SMS if Kapso
 *     refuses it. Sign-in codes stay on SMS (their template category is "authentication", a different
 *     template, and a code is the one message that must not wait on a second channel);
 *   · a reply from staff to somebody who wrote on WhatsApp in the last 24 hours goes as plain text;
 *   · Kapso's webhook (api/hooks/kapso.php) brings the person's messages into the Control Room inbox as a
 *     Message, matched to the family by phone, one thread per person while it is open; and its "failed"
 *     event sends the same words by SMS, so a number that is not on WhatsApp still hears from us.
 *
 * config (Control Room → Settings → API keys → Kapso, or config.php):
 *   'whatsapp' => ['kapso' => ['api_key' => '', 'phone_number_id' => '', 'template' => 'ngg_message',
 *                              'template_lang' => 'en', 'webhook_secret' => '']]
 * With no key and number id, WhatsApp is simply not in the chain: nothing else changes.
 */

const KAPSO_BASE = 'https://api.kapso.ai/meta/whatsapp/v24.0';
const KAPSO_PARAM_MAX = 1000;          // a template body parameter; Meta refuses newlines and long runs of spaces in one
const KAPSO_WINDOW_HOURS = 24;         // free text only within this long of the person's last message
const KAPSO_THREAD_DAYS = 7;           // a follow-up within a week of an open WhatsApp message joins its thread

function kapso_cfg(): array
{
    $c = $GLOBALS['CONFIG']['whatsapp']['kapso'] ?? [];
    $c = is_array($c) ? $c : [];
    return [
        'api_key' => trim((string)($c['api_key'] ?? '')),
        'phone_number_id' => preg_replace('/\D/', '', (string)($c['phone_number_id'] ?? '')),
        'template' => trim((string)($c['template'] ?? '')) ?: 'ngg_message',
        'template_lang' => trim((string)($c['template_lang'] ?? '')) ?: 'en',
        'webhook_secret' => trim((string)($c['webhook_secret'] ?? '')),
        // Optional: an approved template with ONE body parameter and three quick-reply buttons, so the buttons
        // reach a family outside the 24-hour window too. Blank: the plain template, with "reply 1, 2 or 3".
        'reply_template' => trim((string)($c['reply_template'] ?? '')),
    ];
}
function kapso_on(): bool { $c = kapso_cfg(); return $c['api_key'] !== '' && $c['phone_number_id'] !== ''; }

/** One request to Kapso. Uses sms_http, so the suite's __sms_http_mock sees it too. */
function kapso_http(string $method, string $path, ?array $json = null): array
{
    $c = kapso_cfg();
    $opts = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => ['X-API-Key: ' . $c['api_key'], 'Content-Type: application/json', 'Accept: application/json']];
    if ($json !== null) $opts[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $r = sms_http(KAPSO_BASE . '/' . $c['phone_number_id'] . $path, $opts);
    $r['json'] = !empty($r['body']) ? json_decode((string)$r['body'], true) : null;
    return $r;
}

/** A WhatsApp number is the E.164 digits without the plus. */
function kapso_wa_number(string $e164): string { return preg_replace('/\D/', '', $e164); }

/** The message as a template parameter: one line, no tabs, no long runs of spaces, at most KAPSO_PARAM_MAX. */
function kapso_param(string $text): string
{
    $t = preg_replace('/\s*\n+\s*/u', ' · ', trim($text));
    $t = preg_replace('/[\t ]{2,}/u', ' ', (string)$t);
    return mb_substr((string)$t, 0, KAPSO_PARAM_MAX);
}

/** Record an outgoing message, so a late "failed" can fall back to SMS with the same words. */
function kapso_log(string $wamid, string $dir, string $phone, string $body, string $status, string $kind = ''): void
{
    if ($wamid === '') return;
    try {
        if (db_row('SELECT wamid FROM whatsapp_messages WHERE wamid = ?', [$wamid])) return;
        db_insert('whatsapp_messages', ['wamid' => $wamid, 'direction' => $dir, 'phone' => $phone, 'body' => mb_substr($body, 0, 2000),
            'kind' => $kind, 'status' => $status, 'error' => '', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    } catch (Throwable $e) { error_log('[kapso] log: ' . $e->getMessage()); }
}

/**
 * Send any message as the approved template (works whether or not a conversation is open).
 * Returns ['ok' => true, 'id' => wamid] or ['ok' => false, 'error' => …]. Never throws.
 */
function kapso_send_template(string $e164, string $text): array
{
    if (!kapso_on()) return ['ok' => false, 'error' => 'kapso_off'];
    $c = kapso_cfg();
    $r = kapso_http('POST', '/messages', ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => kapso_wa_number($e164), 'type' => 'template',
        'template' => ['name' => $c['template'], 'language' => ['code' => $c['template_lang']],
            'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => kapso_param($text)]]]]]]);
    $id = (string)($r['json']['messages'][0]['id'] ?? '');
    if (empty($r['ok']) || $id === '') return ['ok' => false, 'error' => (string)($r['error'] ?? 'kapso_no_id'), 'detail' => (string)($r['detail'] ?? '')];
    kapso_log($id, 'out', $e164, $text, 'sent', 'template');
    return ['ok' => true, 'id' => $id];
}

/** Plain text, for a reply inside the 24-hour window. Falls back to the template when Kapso refuses it. */
function kapso_send_text(string $e164, string $text): array
{
    if (!kapso_on()) return ['ok' => false, 'error' => 'kapso_off'];
    $r = kapso_http('POST', '/messages', ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => kapso_wa_number($e164),
        'type' => 'text', 'text' => ['body' => mb_substr($text, 0, 4096), 'preview_url' => false]]);
    $id = (string)($r['json']['messages'][0]['id'] ?? '');
    if (!empty($r['ok']) && $id !== '') { kapso_log($id, 'out', $e164, $text, 'sent', 'text'); return ['ok' => true, 'id' => $id]; }
    return kapso_send_template($e164, $text);
}

/**
 * A message the person can ANSWER with a tap: $buttons = [[id, title], …] (at most 3, titles ≤ 20 characters).
 *   · inside the 24-hour window: an interactive message with reply buttons;
 *   · outside it, with a reply template configured: that template, its quick replies carrying our ids;
 *   · otherwise: the plain template, the choices written as "Reply 1 …, 2 …, 3 …" (typed replies are read too).
 * `$kind` is recorded on the message, so an answer can be traced to what it answers. Never throws.
 */
function kapso_send_buttons(string $e164, string $text, array $buttons, string $kind = ''): array
{
    if (!kapso_on()) return ['ok' => false, 'error' => 'kapso_off'];
    $buttons = array_slice(array_values($buttons), 0, 3);
    $c = kapso_cfg();
    $to = kapso_wa_number($e164);
    if (kapso_window_open($e164)) {
        $r = kapso_http('POST', '/messages', ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $to, 'type' => 'interactive',
            'interactive' => ['type' => 'button', 'body' => ['text' => mb_substr($text, 0, 1024)],
                'action' => ['buttons' => array_map(static fn($b) => ['type' => 'reply', 'reply' => ['id' => mb_substr((string)$b[0], 0, 256), 'title' => mb_substr((string)$b[1], 0, 20)]], $buttons)]]]);
        $id = (string)($r['json']['messages'][0]['id'] ?? '');
        if (!empty($r['ok']) && $id !== '') { kapso_log($id, 'out', $e164, $text, 'sent', $kind); return ['ok' => true, 'id' => $id, 'how' => 'buttons']; }
    }
    if ($c['reply_template'] !== '') {
        $comp = [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => kapso_param($text)]]]];
        foreach ($buttons as $i => $b) $comp[] = ['type' => 'button', 'sub_type' => 'quick_reply', 'index' => (string)$i, 'parameters' => [['type' => 'payload', 'payload' => (string)$b[0]]]];
        $r = kapso_http('POST', '/messages', ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', 'to' => $to, 'type' => 'template',
            'template' => ['name' => $c['reply_template'], 'language' => ['code' => $c['template_lang']], 'components' => $comp]]);
        $id = (string)($r['json']['messages'][0]['id'] ?? '');
        if (!empty($r['ok']) && $id !== '') { kapso_log($id, 'out', $e164, $text, 'sent', $kind); return ['ok' => true, 'id' => $id, 'how' => 'reply_template']; }
    }
    $menu = implode(' · ', array_map(static fn($b, $i) => ($i + 1) . ' = ' . $b[1], $buttons, array_keys($buttons)));
    $r = kapso_send_template($e164, $text . ' Reply ' . $menu . '.');
    if (!empty($r['ok'])) { db_update('whatsapp_messages', ['kind' => $kind], ['wamid' => $r['id']]); $r['how'] = 'numbers'; }
    return $r;
}

/** The answer a message carries: a reply button's id and title (interactive or template quick reply), else ['','']. */
function kapso_button_of(array $msg): array
{
    $type = (string)($msg['type'] ?? '');
    if ($type === 'interactive') {
        $b = (array)($msg['interactive']['button_reply'] ?? []);
        return [(string)($b['id'] ?? ''), (string)($b['title'] ?? '')];
    }
    if ($type === 'button') return [(string)($msg['button']['payload'] ?? ''), (string)($msg['button']['text'] ?? '')];
    return ['', ''];
}

/** A number that answered STOP. */
function kapso_opted_out(string $e164): bool { try { return (bool)db_row('SELECT 1 x FROM whatsapp_optout WHERE phone = ?', [$e164]); } catch (Throwable $e) { return false; } }

/** When this person last wrote to us on WhatsApp (ISO), or ''. */
function kapso_last_inbound(string $e164): string
{
    return (string)(db_row("SELECT createdAt FROM whatsapp_messages WHERE direction = 'in' AND phone = ? ORDER BY createdAt DESC LIMIT 1", [$e164])['createdAt'] ?? '');
}
function kapso_window_open(string $e164): bool
{
    $at = kapso_last_inbound($e164);
    return $at !== '' && strtotime($at) >= time() - KAPSO_WINDOW_HOURS * 3600;
}

/* ── The webhook ─────────────────────────────────────────────────────────────────────────────────── */

/** X-Webhook-Signature: hex HMAC-SHA256 of the raw body with the webhook's secret. */
function kapso_signature_ok(string $raw, string $sig): bool
{
    $secret = kapso_cfg()['webhook_secret'];
    if ($secret === '' || $sig === '') return false;
    return hash_equals(hash_hmac('sha256', $raw, $secret), strtolower(trim(preg_replace('/^sha256=/i', '', $sig))));
}

/** Who a WhatsApp number belongs to: a guardian, else a member, else nobody we know. */
function kapso_who(string $e164): array
{
    $tail = substr(preg_replace('/\D/', '', $e164), -10);
    if (strlen($tail) < 10) return ['name' => '', 'email' => ''];
    $like = '%' . $tail;
    try {
        $g = db_row("SELECT fullName, email FROM guardians WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? LIMIT 1", [$like]);
        if ($g) return ['name' => (string)$g['fullName'], 'email' => (string)($g['email'] ?? '')];
    } catch (Throwable $e) {}
    try {
        $m = db_row("SELECT fullName, parentName, parentEmail, email, phone, parentPhone FROM members WHERE REPLACE(REPLACE(REPLACE(parentPhone, ' ', ''), '-', ''), '+', '') LIKE ? OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? LIMIT 1", [$like, $like]);
        if ($m) {
            $isParent = str_ends_with(preg_replace('/\D/', '', (string)$m['parentPhone']), $tail);
            return $isParent ? ['name' => (string)($m['parentName'] ?: 'Parent of ' . $m['fullName']), 'email' => (string)($m['parentEmail'] ?? '')]
                             : ['name' => (string)$m['fullName'], 'email' => (string)($m['email'] ?? '')];
        }
    } catch (Throwable $e) {}
    return ['name' => '', 'email' => ''];
}

/** One received message → the inbox. A follow-up joins the person's open thread. Idempotent on the message id. */
function kapso_receive(array $ev): array
{
    $msg = (array)($ev['message'] ?? []);
    $wamid = (string)($msg['id'] ?? '');
    $from = (string)($msg['from'] ?? ($ev['conversation']['phone_number'] ?? ''));
    $e164 = function_exists('sms_normalize') ? sms_normalize('+' . ltrim($from, '+')) : '+' . preg_replace('/\D/', '', $from);
    if ($wamid === '' || $e164 === '') return ['ok' => true, 'skipped' => 'no_sender'];
    if (db_row('SELECT wamid FROM whatsapp_messages WHERE wamid = ?', [$wamid])) return ['ok' => true, 'duplicate' => true];
    $type = (string)($msg['type'] ?? 'text');
    [, $btnTitle] = kapso_button_of($msg);
    $text = trim((string)($msg['text']['body'] ?? ($btnTitle !== '' ? $btnTitle : ($msg[$type]['caption'] ?? ($msg['kapso']['content'] ?? '')))));
    if ($text === '') $text = '(' . ($type === 'text' ? 'an empty message' : 'a ' . $type . ' — open WhatsApp to see it') . ')';
    $text = mb_substr($text, 0, 4000);
    kapso_log($wamid, 'in', $e164, $text, 'received', $type);
    /* An answer to a registration reminder acts by itself (domain/registration-checklist.php): a date, a
       request for help, a photo of a document, STOP. Whatever it does not understand goes to the inbox. */
    if (function_exists('rcl_wa_inbound')) {
        try { $h = rcl_wa_inbound($e164, $msg, $text); if (!empty($h['handled'])) return ['ok' => true] + $h; }
        catch (Throwable $e) { error_log('[kapso] registration reply: ' . $e->getMessage()); }
    }

    $who = kapso_who($e164);
    $name = $who['name'] !== '' ? $who['name'] : (trim((string)($ev['conversation']['contact_name'] ?? '')) ?: $e164);
    $open = db_row("SELECT id FROM contact_messages WHERE purpose = 'whatsapp' AND phone = ? AND status IN ('new', 'read', 'replied') AND createdAt >= ? ORDER BY id DESC LIMIT 1",
        [$e164, gmdate('Y-m-d H:i:s', time() - KAPSO_THREAD_DAYS * 86400)]);
    if ($open) {
        db_insert('contact_replies', ['messageId' => (int)$open['id'], 'body' => $text, 'sentBy' => '', 'sentByName' => $name, 'sentAt' => now_iso(), 'channel' => 'whatsapp-in']);
        db_update('contact_messages', ['status' => 'new'], ['id' => (int)$open['id']]);
        return ['ok' => true, 'thread' => (int)$open['id']];
    }
    $ref = 'WA-' . strtoupper(substr(md5($wamid), 0, 8));
    db_insert('contact_messages', ['ref' => $ref, 'purpose' => 'whatsapp', 'name' => $name, 'email' => $who['email'], 'phone' => $e164,
        'subject' => 'WhatsApp message', 'message' => $text, 'status' => 'new', 'createdAt' => gmdate('Y-m-d H:i:s'), 'ip' => '']);
    try { audit('whatsapp.received', null, $e164, ['ref' => $ref, 'known' => $who['name'] !== ''], ''); } catch (Throwable $e) {}
    return ['ok' => true, 'ref' => $ref];
}

/** A status event for something we sent. "failed" sends the same words by SMS, once. */
function kapso_status(string $event, array $ev): array
{
    $msg = (array)($ev['message'] ?? []);
    $wamid = (string)($msg['id'] ?? '');
    $row = $wamid !== '' ? db_row('SELECT * FROM whatsapp_messages WHERE wamid = ?', [$wamid]) : null;
    if (!$row) return ['ok' => true, 'unknown' => true];
    $status = substr($event, strlen('whatsapp.message.'));
    if ($status === 'failed') {
        $err = '';
        foreach ((array)($msg['kapso']['statuses'] ?? []) as $s) foreach ((array)($s['errors'] ?? []) as $e) $err = trim((int)($e['code'] ?? 0) . ' ' . ($e['title'] ?? ''));
        db_update('whatsapp_messages', ['status' => 'failed', 'error' => mb_substr($err, 0, 200), 'updatedAt' => now_iso()], ['wamid' => $wamid]);
        if ($row['direction'] === 'out' && $row['status'] !== 'failed' && function_exists('sms_send')) {
            $r = sms_send((string)$row['phone'], (string)$row['body'], ['noWhatsApp' => true]);
            try { audit('whatsapp.failed', null, (string)$row['phone'], ['error' => $err, 'smsFallback' => !empty($r['ok']) ? ($r['provider'] ?? 'sms') : 'none'], ''); } catch (Throwable $e) {}
            return ['ok' => true, 'fallback' => !empty($r['ok'])];
        }
        return ['ok' => true];
    }
    if (in_array($status, ['sent', 'delivered', 'read'], true) && $row['status'] !== 'failed') db_update('whatsapp_messages', ['status' => $status, 'updatedAt' => now_iso()], ['wamid' => $wamid]);
    return ['ok' => true];
}

/** hooks.kapso {event, body} — a verified webhook delivery, unbuffered or a batch. */
function kapso_handle_webhook(array $p): array
{
    $event = (string)($p['event'] ?? '');
    $body = (array)($p['body'] ?? []);
    $items = !empty($body['batch']) && is_array($body['data'] ?? null) ? $body['data'] : [$body];
    $out = [];
    foreach ($items as $ev) {
        if (!is_array($ev)) continue;
        $e = $event !== '' ? $event : (string)($ev['event'] ?? $body['type'] ?? '');
        if ($e === 'whatsapp.message.received') $out[] = kapso_receive($ev);
        elseif (str_starts_with($e, 'whatsapp.message.')) $out[] = kapso_status($e, $ev);
    }
    return ['ok' => true, 'handled' => count($out)];
}

/** admin.keys.test for Kapso: read the phone number's details — proves the key and the number id, sends nothing. */
function kapso_test(): array
{
    if (!kapso_on()) return ['pass' => false, 'detail' => 'Set the API key and the phone number ID.'];
    $r = kapso_http('GET', '?fields=display_phone_number,verified_name,quality_rating');
    if (empty($r['ok'])) return ['pass' => false, 'detail' => 'Kapso refused it (' . (string)($r['error'] ?? 'no answer') . '). Check the API key and the phone number ID.'];
    $j = (array)$r['json'];
    $num = (string)($j['display_phone_number'] ?? ''); $name = (string)($j['verified_name'] ?? '');
    $hook = kapso_cfg()['webhook_secret'] === '' ? ' Replies will not reach the inbox until the webhook secret is set.' : '';
    return ['pass' => true, 'detail' => 'Kapso accepted it' . ($num !== '' ? ': WhatsApp number ' . $num . ($name !== '' ? ' (' . $name . ')' : '') : '') . '. Messages go out as the template “' . kapso_cfg()['template'] . '”.' . $hook];
}
