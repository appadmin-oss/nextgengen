<?php
declare(strict_types=1);

/* ============================================================================
   Texts by Telegram — free, on any phone (Android or iPhone) and on a computer.

   A text message in Nigeria costs about ₦6 a time on a SIM. A Telegram message
   costs nothing, so wherever a person has connected Telegram, every text this
   site would have sent them goes there instead; sms_send() falls back to SMS
   only when they have not, or when Telegram cannot reach them.

   How a person connects (no account here needed, no code to type):
     1. They open the programme's bot — t.me/<bot> — from the link or QR the
        site shows, and press Start.
     2. The bot asks them to press "Share my phone number". Telegram sends the
        number of THEIR OWN Telegram account (it verified that number when
        they signed up) — a contact they forward is refused, so nobody can
        link somebody else's number.
     3. That number, in E.164, is stored with the chat (telegram_links). From
        then on sms_send() to that number goes to the chat.
   /stop in the chat disconnects; a person who blocks the bot is disconnected
   the first time a message to them is refused.

   Linking by phone number means nothing else needs to know about Telegram:
   guardians, members, volunteers, mentors — anyone this site texts — use the
   same door, because they are all texted by number.

   Setup: Control Room → Settings → API keys → Telegram. Make a bot with
   @BotFather (/newbot), paste its token, press Test: that checks the token
   and points the bot's webhook at /api/hooks/telegram.php with a secret only
   this site knows, so nobody else can post updates to it.
   ========================================================================== */

function telegram_cfg(): array { return (array)($GLOBALS['CONFIG']['telegram'] ?? []); }
function telegram_token(): string { return trim((string)(telegram_cfg()['bot_token'] ?? '')); }
function telegram_on(): bool { return (bool)preg_match('/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/', telegram_token()); }

/** The bot's @username (without @), as Telegram last reported it; '' until the first Test. */
function telegram_bot_username(): string {
    $u = trim((string)(telegram_cfg()['bot_username'] ?? ''), " @");
    if ($u === '' && function_exists('setting_raw')) $u = (string)setting_raw('telegram_bot_username');
    return preg_match('/^[A-Za-z0-9_]{5,32}$/', $u) ? $u : '';
}

/** Where people connect: t.me/<bot>?start=ngg, or '' when no bot is set up. */
function telegram_connect_url(): string {
    $u = telegram_bot_username();
    return telegram_on() && $u !== '' ? 'https://t.me/' . $u . '?start=ngg' : '';
}

/**
 * The secret Telegram sends back on every webhook call (X-Telegram-Bot-Api-
 * Secret-Token). Derived from the app secret and the bot token, so it needs no
 * setting, and changing the bot changes it.
 */
function telegram_webhook_secret(): string {
    return substr(hash_hmac('sha256', 'telegram-webhook|' . telegram_token(), (string)($GLOBALS['CONFIG']['cookie_secret'] ?? '')), 0, 48);
}

/** One Bot API call. Returns the decoded answer ({ok, result} or {ok:false, error_code, description}). Test seam: $GLOBALS['__tg_mock']. */
function telegram_api(string $method, array $params = []): array {
    if (isset($GLOBALS['__tg_mock']) && is_callable($GLOBALS['__tg_mock'])) return (array)($GLOBALS['__tg_mock'])($method, $params);
    if (!telegram_on() || !function_exists('curl_init')) return ['ok' => false, 'error_code' => 0, 'description' => 'not_configured'];
    $ch = curl_init('https://api.telegram.org/bot' . telegram_token() . '/' . $method);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($params, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2]);
    $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $j = is_string($out) ? json_decode($out, true) : null;
    return is_array($j) ? $j : ['ok' => false, 'error_code' => $code, 'description' => 'no_answer'];
}

function telegram_send_chat(string $chatId, string $text, array $extra = []): array {
    return telegram_api('sendMessage', ['chat_id' => $chatId, 'text' => mb_substr($text, 0, 3500), 'disable_web_page_preview' => true] + $extra);
}

/** The link for one E.164 number, or null. */
function telegram_link_for(string $e164): ?array {
    if ($e164 === '') return null;
    try { return db_row('SELECT * FROM telegram_links WHERE phone = ? LIMIT 1', [$e164]); } catch (\Throwable $e) { return null; }
}

/**
 * Send a text to a number by Telegram, if that number is connected.
 * ['ok' => true] when Telegram took it; ['ok' => false, 'error' => 'not_linked'
 * | 'unlinked' | …] otherwise, and the caller sends an SMS instead. A refusal
 * that means "this person can no longer be reached here" (blocked the bot,
 * deleted the account) removes the link, so the next text goes by SMS at once.
 */
function telegram_send_to_phone(string $e164, string $text): array {
    if (!telegram_on()) return ['ok' => false, 'error' => 'telegram_off'];
    $l = telegram_link_for($e164);
    if (!$l) return ['ok' => false, 'error' => 'not_linked'];
    $r = telegram_send_chat((string)$l['chatId'], $text);
    if (!empty($r['ok'])) {
        db_exec('UPDATE telegram_links SET lastSentAt = ?, sent = sent + 1 WHERE id = ?', [now_iso(), (int)$l['id']]);
        return ['ok' => true, 'ref' => (string)($r['result']['message_id'] ?? '')];
    }
    $code = (int)($r['error_code'] ?? 0);
    if ($code === 403 || ($code === 400 && stripos((string)($r['description'] ?? ''), 'chat not found') !== false)) {
        db_exec('DELETE FROM telegram_links WHERE id = ?', [(int)$l['id']]);
        audit('telegram.unlinked', null, $e164, ['why' => 'refused_' . $code], '');
        return ['ok' => false, 'error' => 'unlinked'];
    }
    return ['ok' => false, 'error' => 'telegram_' . $code];
}

/** The number Telegram gave, as the E.164 this site texts. */
function telegram_phone_e164(string $raw): string {
    $d = preg_replace('/\D/', '', $raw);
    return $d === '' || strlen($d) < 8 || strlen($d) > 15 ? '' : '+' . $d;
}

function telegram_mask(string $e164): string {
    return strlen($e164) > 7 ? substr($e164, 0, 7) . str_repeat('•', max(0, strlen($e164) - 10)) . substr($e164, -3) : $e164;
}

const TELEGRAM_SHARE_KEYBOARD = ['keyboard' => [[['text' => '📱 Share my phone number', 'request_contact' => true]]], 'one_time_keyboard' => true, 'resize_keyboard' => true];

/**
 * hooks.telegram — one update from Telegram (the route has already checked the
 * secret). Private chats only; everything else is ignored. Never throws: a
 * webhook that errors is retried by Telegram for hours.
 */
function telegram_handle_update(array $p): array {
    $u = is_array($p['update'] ?? null) ? $p['update'] : [];
    $m = is_array($u['message'] ?? null) ? $u['message'] : null;
    if (!$m || (string)($m['chat']['type'] ?? '') !== 'private') return ['ok' => true, 'ignored' => true];
    $chatId = (string)($m['chat']['id'] ?? '');
    $fromId = (string)($m['from']['id'] ?? '');
    if (!preg_match('/^-?\d{1,20}$/', $chatId) || $fromId === '') return ['ok' => true, 'ignored' => true];
    $org = 'Next Generation Genius';

    if (is_array($m['contact'] ?? null)) {
        $c = $m['contact'];
        // Their OWN number only: a forwarded contact carries someone else's user_id, or none.
        if ((string)($c['user_id'] ?? '') !== $fromId) {
            telegram_send_chat($chatId, 'That is someone else\'s number. Press the button below to share your own — it is the number of this Telegram account.', ['reply_markup' => TELEGRAM_SHARE_KEYBOARD]);
            audit('telegram.refused_contact', null, '', ['chat' => $chatId], '');
            return ['ok' => true, 'refused' => 'not_own'];
        }
        $e164 = telegram_phone_e164((string)($c['phone_number'] ?? ''));
        if ($e164 === '') { telegram_send_chat($chatId, 'Telegram did not send a phone number we can use. Please try again.'); return ['ok' => true, 'refused' => 'no_phone']; }
        $name = mb_substr(trim((string)($c['first_name'] ?? '') . ' ' . (string)($c['last_name'] ?? '')), 0, 120);
        $now = now_iso();
        $had = telegram_link_for($e164);
        if ($had) db_exec('UPDATE telegram_links SET chatId = ?, tgUserId = ?, tgName = ?, linkedAt = ? WHERE id = ?', [$chatId, $fromId, $name, $now, (int)$had['id']]);
        else db_insert('telegram_links', ['phone' => $e164, 'chatId' => $chatId, 'tgUserId' => $fromId, 'tgName' => $name, 'linkedAt' => $now, 'lastSentAt' => '', 'sent' => 0]);
        audit('telegram.linked', null, $e164, ['chat' => $chatId, 'relinked' => (bool)$had], '');
        telegram_send_chat($chatId, "Connected ✅\n\nMessages from {$org} for " . telegram_mask($e164) . " will now come here instead of by SMS — free, for you and for us.\n\nMake sure this is the number on your NGG record (or your child's). Send /stop at any time to go back to SMS.",
            ['reply_markup' => ['remove_keyboard' => true]]);
        return ['ok' => true, 'linked' => $e164];
    }

    $text = trim((string)($m['text'] ?? ''));
    if (preg_match('#^/stop\b#i', $text)) {
        $n = db_exec('DELETE FROM telegram_links WHERE chatId = ?', [$chatId]);
        audit('telegram.stopped', null, '', ['chat' => $chatId, 'links' => $n], '');
        telegram_send_chat($chatId, $n ? 'Disconnected. Messages will come by SMS again. Send /start to reconnect.' : 'This chat was not connected. Send /start to connect.', ['reply_markup' => ['remove_keyboard' => true]]);
        return ['ok' => true, 'stopped' => $n];
    }
    if (preg_match('#^/status\b#i', $text)) {
        $rows = db_all('SELECT phone FROM telegram_links WHERE chatId = ?', [$chatId]);
        telegram_send_chat($chatId, $rows ? 'Connected for ' . implode(', ', array_map(static fn($r) => telegram_mask((string)$r['phone']), $rows)) . '. Send /stop to disconnect.' : 'Not connected yet. Press the button below.',
            $rows ? [] : ['reply_markup' => TELEGRAM_SHARE_KEYBOARD]);
        return ['ok' => true];
    }
    // /start, or anything else: explain, and offer the one button.
    telegram_send_chat($chatId, "Welcome to {$org}.\n\nGet our messages — sign-in codes, check-ins, notices about your child — here on Telegram, free, instead of by SMS.\n\nPress the button below to share your phone number. Use the number that is on your NGG record.",
        ['reply_markup' => TELEGRAM_SHARE_KEYBOARD]);
    return ['ok' => true, 'prompted' => true];
}

/** Check the token, remember the bot's username, and point its webhook here. */
function telegram_setup(): array {
    if (!telegram_on()) return ['pass' => false, 'detail' => 'Paste the bot token from @BotFather (it looks like 123456789:AA…).'];
    $me = telegram_api('getMe');
    if (empty($me['ok'])) return ['pass' => false, 'detail' => 'Telegram refused the token: ' . (string)($me['description'] ?? 'no answer') . '.'];
    $user = (string)($me['result']['username'] ?? '');
    if ($user !== '' && function_exists('setting_set')) setting_set('telegram_bot_username', $user, 'system');
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    if (!preg_match('#^https://#i', $origin)) return ['pass' => false, 'detail' => 'The token works (@' . $user . '), but Telegram only delivers to an https:// site, and app_origin is ' . ($origin ?: 'not set') . '.'];
    $wh = telegram_api('setWebhook', ['url' => $origin . '/api/hooks/telegram.php', 'secret_token' => telegram_webhook_secret(),
                                      'allowed_updates' => ['message'], 'drop_pending_updates' => false, 'max_connections' => 10]);
    if (empty($wh['ok'])) return ['pass' => false, 'detail' => 'The token works (@' . $user . '), but the webhook was refused: ' . (string)($wh['description'] ?? 'no answer') . '.'];
    $n = 0; try { $n = (int)(db_row('SELECT COUNT(*) AS n FROM telegram_links')['n'] ?? 0); } catch (\Throwable $e) {}
    return ['pass' => true, 'detail' => 'Connected as @' . $user . '. People join at t.me/' . $user . ' — ' . $n . ' ' . ($n === 1 ? 'number is' : 'numbers are') . ' connected.'];
}

/** public.telegram — what the site shows to invite people: the link, or nothing. */
function public_telegram(array $p): array {
    $url = telegram_connect_url();
    return ['ok' => true, 'enabled' => $url !== '', 'url' => $url, 'bot' => $url !== '' ? telegram_bot_username() : ''];
}
