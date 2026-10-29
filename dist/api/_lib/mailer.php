<?php
declare(strict_types=1);

/**
 * NGG mailer. Uses SMTP when `mail.smtp.host` is configured (recommended on
 * shared hosting for deliverability), otherwise falls back to PHP mail().
 * Dependency-free — no Composer, matching the buildless philosophy.
 */

/** Public reply channels shown in every email footer — single source. */
function org_contact(): array {
    global $CONFIG;
    $o = $CONFIG['org'] ?? [];
    /* The example config's placeholder ("hello@yourdomain.com") was copied into
       live configs and printed in every email footer. A placeholder is no address. */
    $real = static fn($e) => ($e = trim((string)$e)) !== '' && !preg_match('/@(your)?domain\.|example\.(com|org)$/i', $e) ? $e : '';
    return [
        'email' => $real($o['email'] ?? '') ?: $real($CONFIG['mail']['reply_to'] ?? '') ?: 'next@afrovanguard.org.ng',
        'phone' => (string)($o['phone'] ?? '+234 903 777 6318'),
        'site'  => preg_replace('#^https?://#', '', (string)($CONFIG['app_origin'] ?? 'next.afrovanguard.org.ng')) ?: 'next.afrovanguard.org.ng',
    ];
}

function mail_from(): array {
    global $CONFIG;
    $m = $CONFIG['mail'] ?? [];
    return [
        'name'    => $m['from_name']  ?? 'Next Generation Genius',
        'email'   => $m['from_email'] ?? ('no-reply@' . (parse_url($CONFIG['app_origin'] ?? 'https://ngg.afrovanguard.org', PHP_URL_HOST) ?: 'localhost')),
        // Replies should reach a human even when the From is a no-reply box.
        'replyTo' => ($m['reply_to'] ?? '') ?: org_contact()['email'],
    ];
}

/**
 * Send one HTML email. Returns true on success. Never throws — a failed send
 * is logged and reported as false so callers can decide (auth cares, a
 * best-effort broadcast doesn't).
 */
function send_mail(string $to, string $subject, string $html, ?string $text = null): bool {
    global $CONFIG;
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    // Test seam: simulate a relay failure (auth must degrade, not dead-end).
    if (!empty($GLOBALS['__mail_fail'])) { $GLOBALS['__mail_last_error'] = 'forced_test_failure'; return false; }
    // Test seam: capture instead of send when a sink is registered.
    if (isset($GLOBALS['__mail_sink']) && is_array($GLOBALS['__mail_sink'])) {
        $GLOBALS['__mail_sink'][] = ['to' => $to, 'subject' => $subject, 'html' => $html];
        return true;
    }
    $from = mail_from();
    $text = $text ?? trim(preg_replace('/\n{3,}/', "\n\n", strip_tags(preg_replace('#<br\s*/?>|</p>|</div>#i', "\n", $html)) ?? ''));

    $GLOBALS['__mail_last_error'] = '';
    $mail = $CONFIG['mail'] ?? [];
    $smtp = $mail['smtp'] ?? [];
    $errors = [];

    // Path 1 — Google Apps Script MailApp (signed with the script's SECRET).
    // Google sends from the authenticated account: no SMTP ports, no SPF/DKIM,
    // no third-party key — the path that delivers on shared hosting. Set it in
    // Settings → API keys → Google Apps Script (or apps_script_url +
    // shared_secret in config.php). First whenever it is set, so a slow or
    // broken SMTP relay never stands in front of it.
    [$asUrl, $asSecret] = mail_apps_script_cfg();
    if (($mail['apps_script'] ?? true) !== false && $asUrl !== '' && $asSecret !== '') {
        try {
            if (appsscript_send($asUrl, $asSecret, $from, $to, $subject, $html, $text)) return true;
            $errors[] = 'apps_script: send failed';
        } catch (Throwable $e) {
            $errors[] = 'apps_script: ' . $e->getMessage();
            error_log('[send_mail/apps_script] ' . $e->getMessage());
        }
    }

    // Path 2 — SMTP (authenticated relay). Most reliable when the host permits
    // outbound 587/465 and the relay is aligned with the From domain.
    if (!empty($smtp['host'])) {
        try {
            if (smtp_send($smtp, $from, $to, $subject, $html, $text)) return true;
            $errors[] = 'smtp: send returned false';
        } catch (Throwable $e) {
            $errors[] = 'smtp: ' . $e->getMessage();
            error_log('[send_mail/smtp] ' . $e->getMessage());
        }
    }

    // Path 2b — Brevo's relay, set in Settings → API keys → Brevo
    // (smtp-relay.brevo.com:587, STARTTLS, login + SMTP key).
    $brevo = $mail['brevo'] ?? [];
    if (trim((string)($brevo['user'] ?? '')) !== '' && trim((string)($brevo['pass'] ?? '')) !== '') {
        $bFrom = filter_var((string)($brevo['from'] ?? ''), FILTER_VALIDATE_EMAIL) ? array_merge($from, ['email' => (string)$brevo['from']]) : $from;
        try {
            if (smtp_send(['host' => 'smtp-relay.brevo.com', 'port' => 587, 'secure' => 'tls', 'user' => (string)$brevo['user'], 'pass' => (string)$brevo['pass']],
                          $bFrom, $to, $subject, $html, $text)) return true;
            $errors[] = 'brevo: send returned false';
        } catch (Throwable $e) {
            $errors[] = 'brevo: ' . $e->getMessage();
            error_log('[send_mail/brevo] ' . $e->getMessage());
        }
    }

    // Path 3 — Resend HTTPS API. Shared hosts that block SMTP ports and drop
    // mail() almost always still allow outbound HTTPS, so this is the most
    // reliable cross-host fallback. Free tier at https://resend.com — one key.
    $resendKey = trim((string)($mail['resend_key'] ?? ''));
    if ($resendKey !== '' && $resendKey !== 'YOUR_RESEND_KEY_HERE') {
        try {
            if (resend_send($resendKey, $from, $to, $subject, $html, $text)) return true;
            $errors[] = 'resend: send failed';
        } catch (Throwable $e) {
            $errors[] = 'resend: ' . $e->getMessage();
            error_log('[send_mail/resend] ' . $e->getMessage());
        }
    }

    // Path 4 — PHP mail() last resort (often silently dropped on shared hosts).
    try {
        if (mail_native($from, $to, $subject, $html, $text)) return true;
        $errors[] = 'php_mail(): rejected or unavailable';
    } catch (Throwable $e) {
        $errors[] = 'php_mail(): ' . $e->getMessage();
        error_log('[send_mail/native] ' . $e->getMessage());
    }

    /* A relay that fails mid-TLS can echo binary into its error text; keep
       only what a person can read, so the report says what went wrong. */
    $errors = array_map(static fn($e) => trim((string)preg_replace('/\s{2,}/', ' ', (string)preg_replace('/[^\x20-\x7E\x{2018}-\x{201D}]+/u', ' ', mb_convert_encoding((string)$e, 'UTF-8', 'UTF-8')))), $errors);
    $GLOBALS['__mail_last_error'] = $errors
        ? implode(' | ', $errors)
        : 'No delivery path available. Set mail.smtp.* or mail.resend_key in api/config.php.';
    error_log('[send_mail] all paths failed for ' . $to . ' — ' . $GLOBALS['__mail_last_error']);
    return false;
}

/** The Apps Script mail endpoint: Settings (mail.apps_script_*) first, then config.php's apps_script_url + shared_secret. */
function mail_apps_script_cfg(): array {
    global $CONFIG;
    $mail = $CONFIG['mail'] ?? [];
    $url = rtrim(trim((string)($mail['apps_script_url'] ?? '')) ?: trim((string)($CONFIG['apps_script_url'] ?? '')), '/');
    $secret = (string)($mail['apps_script_secret'] ?? '') ?: (string)($CONFIG['shared_secret'] ?? '');
    if ($secret === 'REPLACE_ME_64_HEX_BYTES') $secret = '';
    return [$url, $secret];
}

/** Which delivery path send_mail() will try first — for the Control Room diagnostic. */
function mail_mode(): string {
    global $CONFIG;
    $mail = $CONFIG['mail'] ?? [];
    [$asUrl, $asSecret] = mail_apps_script_cfg();
    if (($mail['apps_script'] ?? true) !== false && $asUrl !== '' && $asSecret !== '') return 'apps_script';
    if (!empty($mail['smtp']['host'] ?? '')) return 'smtp';
    if (trim((string)($mail['brevo']['user'] ?? '')) !== '' && trim((string)($mail['brevo']['pass'] ?? '')) !== '') return 'brevo';
    $k = trim((string)($mail['resend_key'] ?? ''));
    if ($k !== '' && $k !== 'YOUR_RESEND_KEY_HERE') return 'resend';
    return 'php_mail';
}

/**
 * Send via a Google Apps Script Web App (MailApp) — the same HMAC-signed
 * endpoint the Sheets mirror uses. Google relays the message from the
 * authenticated account, so it delivers on hosts that block SMTP and drop
 * mail(). Posts {op:'sendMail', ...}; Apps Script /exec 302-redirects to
 * googleusercontent, so redirects must be followed.
 */
function appsscript_send(string $url, string $secret, array $from, string $to, string $subject, string $html, string $text): bool {
    appsscript_call($url, $secret, 'mail.send', [
        'to'       => $to,
        'subject'  => $subject,
        'html'     => $html,
        'text'     => $text,
        'name'     => $from['name'] ?? '',
        'reply_to' => $from['replyTo'] ?? '',
    ]);
    return true;
}

/**
 * One call to the Apps Script Web App:
 * POST {action, token, data, source} → {ok|success, message, …}. The token is
 * the script's SECRET; apps-script/Code.gs answers mail.send and mail.quota.
 * /exec answers with a 302 to googleusercontent; the body is at the far end.
 * Returns the JSON on success; throws with a sentence an operator can act on.
 */
function appsscript_call(string $url, string $secret, string $action, array $data = []): array {
    if (isset($GLOBALS['__gas_mock']) && is_callable($GLOBALS['__gas_mock'])) return ($GLOBALS['__gas_mock'])($url, $secret, $action, $data);
    if (!function_exists('curl_init')) throw new RuntimeException('PHP has no curl extension');
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => appsscript_body(['action' => $action, 'token' => $secret, 'data' => $data, 'source' => 'ngg']),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $raw  = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);
    if ($raw === false) throw new RuntimeException('could not reach it (' . $cerr . ')');
    if ($code < 200 || $code >= 400) throw new RuntimeException('could not reach it (HTTP ' . $code . ')');
    $j = json_decode((string)$raw, true);
    if (!is_array($j)) throw new RuntimeException('it did not answer JSON — usually an old deployment, or access not set to “Anyone”: paste the latest script and Deploy → Manage deployments → New version');
    if (!empty($j['ok']) || !empty($j['success'])) return $j;
    /* An earlier NGG Code.gs checks an HMAC of the body (?sig=) before it reads
       anything, so it answers this format with bad_signature. Speak its
       format instead: the same secret signs the body, and its ops are
       sendMail (and ping, on newer copies). */
    if (($j['error'] ?? '') === 'bad_signature') return appsscript_call_signed($url, $secret, $action, $data);
    $msg = (string)($j['message'] ?? $j['error'] ?? 'refused');
    if (str_starts_with($msg, 'Unknown action')) $msg = 'the deployed script is older than the mail action — paste the latest script and deploy a New version';
    throw new RuntimeException($msg);
}

/** A request body for the script: JSON in pure ASCII (non-ASCII as \uXXXX), so a signature over it is the same on both sides. */
function appsscript_body(array $payload): string {
    return (string)json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** The earlier NGG Code.gs: POST {op, …} with ?sig=HMAC-SHA256(body, secret). */
function appsscript_call_signed(string $url, string $secret, string $action, array $data): array {
    $payload = $action === 'mail.send'
        ? ['op' => 'sendMail', 'to' => $data['to'] ?? '', 'subject' => $data['subject'] ?? '', 'html' => $data['html'] ?? '',
           'text' => $data['text'] ?? '', 'fromName' => $data['name'] ?? '', 'replyTo' => $data['reply_to'] ?? '']
        : ['op' => 'ping'];
    /* Pure ASCII on the wire. Apps Script's computeHmacSha256Signature(text, key)
       does not hash text as UTF-8, so a body with “—” or curly quotes signed
       differently on each side: a short ping matched and every real email was
       refused. \uXXXX escapes keep the body ASCII; JSON.parse restores it. */
    $body = appsscript_body($payload);
    $ch = curl_init($url . (strpos($url, '?') === false ? '?' : '&') . 'sig=' . hash_hmac('sha256', $body, $secret));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);
    if ($raw === false) throw new RuntimeException('could not reach it (' . $cerr . ')');
    $j = json_decode((string)$raw, true);
    if (!is_array($j)) throw new RuntimeException('could not reach it (HTTP ' . $code . ')');
    if (!empty($j['ok'])) return $j;
    $err = (string)($j['error'] ?? '');
    if ($err === 'bad_signature') throw new RuntimeException('Bad token');
    // Signed and accepted, but too old to answer ping: the URL and the secret are right.
    if ($err === 'unknown_op' && $action === 'mail.quota') return ['ok' => true, 'legacy' => true];
    if (str_contains((string)($j['detail'] ?? ''), 'SHARED_SECRET')) throw new RuntimeException('the script has no SHARED_SECRET in its Script properties');
    throw new RuntimeException($err !== '' ? $err . (isset($j['detail']) ? ' (' . $j['detail'] . ')' : '') : 'refused');
}

/**
 * Send via the Resend HTTPS API (https://resend.com/docs). One JSON POST with
 * the key as a bearer token — no SMTP socket, no Composer dependency, so it
 * works on locked-down shared hosts where SMTP and mail() both fail.
 */
function resend_send(string $apiKey, array $from, string $to, string $subject, string $html, string $text): bool {
    if (!function_exists('curl_init')) throw new RuntimeException('curl_unavailable');
    $payload = [
        'from'    => ($from['name'] ?? '') !== '' ? ($from['name'] . ' <' . $from['email'] . '>') : $from['email'],
        'to'      => [$to],
        'subject' => $subject,
        'html'    => $html,
        'text'    => $text,
    ];
    if (!empty($from['replyTo'])) $payload['reply_to'] = [$from['replyTo']];

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $raw  = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($raw === false) throw new RuntimeException('curl: ' . $cerr);
    if ($code >= 200 && $code < 300) return true;
    throw new RuntimeException('HTTP ' . $code . ' · ' . substr((string)$raw, 0, 200));
}

/** The domain an address belongs to (for Message-ID / diagnostics). */
function mail_domain_of(string $email): string {
    return substr((string)strrchr($email, '@'), 1) ?: 'localhost';
}

/**
 * RFC 5322 Date + a domain-scoped Message-ID. Omitting either is a strong spam
 * signal and some strict MTAs reject outright — every message must carry both.
 */
function mail_std_headers(string $fromEmail): array {
    return [
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . mail_domain_of($fromEmail) . '>',
    ];
}

/**
 * A multipart/alternative body carrying BOTH a text/plain and a text/html part
 * (HTML-only mail places worse). CRLF-normalized per RFC 5322.
 */
function mail_alt_body(string $html, string $text, string $boundary): string {
    $crlf = fn($s) => preg_replace('/\r\n|\r|\n/', "\r\n", $s) ?? $s;
    return "--$boundary\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n\r\n"
        . $crlf($text) . "\r\n\r\n"
        . "--$boundary\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n\r\n"
        . $crlf($html) . "\r\n\r\n"
        . "--$boundary--\r\n";
}

function mail_native(array $from, string $to, string $subject, string $html, string $text = ''): bool {
    $boundary = 'ngg_' . bin2hex(random_bytes(8));
    $headers = array_merge([
        'MIME-Version: 1.0',
    ], mail_std_headers($from['email']), [
        'From: ' . mb_encode_mimeheader($from['name']) . ' <' . $from['email'] . '>',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ]);
    if (!empty($from['replyTo'])) $headers[] = 'Reply-To: ' . $from['replyTo'];
    $body = mail_alt_body($html, $text !== '' ? $text : strip_tags($html), $boundary);
    // Set the envelope sender (-f). Many shared hosts drop or SPF-fail mail
    // without a real envelope-from on the sending domain. Only when it's a
    // valid address (from trusted config) — never interpolate untrusted input.
    $params = filter_var($from['email'], FILTER_VALIDATE_EMAIL) ? ('-f' . $from['email']) : '';
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $hdr  = implode("\r\n", $headers);
    $ok = @mail($to, $subj, $body, $hdr, $params);
    // Some hosts reject the -f envelope param unless the sender is sendmail-trusted; retry without it.
    if (!$ok && $params !== '') $ok = @mail($to, $subj, $body, $hdr);
    return (bool)$ok;
}

/**
 * Load the bundled PHPMailer (no Composer — 3 files under phpmailer/src/, the
 * same manual-install approach the STS sites use). Returns true when the class
 * is available.
 */
function ngg_load_phpmailer(): bool {
    if (class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) return true;
    $base = __DIR__ . '/phpmailer/src/';
    if (is_file($base . 'PHPMailer.php')) {
        require_once $base . 'Exception.php';
        require_once $base . 'PHPMailer.php';
        require_once $base . 'SMTP.php';
    }
    return class_exists(\PHPMailer\PHPMailer\PHPMailer::class);
}

/**
 * SMTP send via PHPMailer — the battle-tested client that reliably completes
 * the Gmail/Google-Workspace handshake (EHLO, STARTTLS, AUTH) where a
 * hand-rolled client can quietly fail. Configured exactly like the sibling
 * Africa GATES app that delivers on the same Workspace SMTP. Throws on failure
 * so send_mail() can log and fall through. If PHPMailer isn't present for any
 * reason, falls back to the raw client below.
 */
function smtp_send(array $smtp, array $from, string $to, string $subject, string $html, string $text): bool {
    if (!ngg_load_phpmailer()) {
        return smtp_send_raw($smtp, $from, $to, $subject, $html, $text);
    }

    // One configured attempt. $relaxTls skips certificate verification — the
    // fallback for shared hosts whose CA bundle is stale/missing, where an
    // otherwise-correct STARTTLS to smtp.gmail.com fails cert verification
    // (the #1 cause of "the exact same SMTP works elsewhere but not here").
    $attempt = function (bool $relaxTls) use ($smtp, $from, $to, $subject, $html, $text): array {
        $m = new \PHPMailer\PHPMailer\PHPMailer(true);
        $m->isSMTP();
        // Capture only the SERVER side of the exchange for diagnostics — never
        // the CLIENT lines, which carry the base64-encoded credentials.
        $srv = '';
        $m->SMTPDebug = \PHPMailer\PHPMailer\SMTP::DEBUG_SERVER;
        $m->Debugoutput = function ($str, $level) use (&$srv) {
            if (stripos((string)$str, 'CLIENT -> SERVER') !== false) return;
            $srv .= trim((string)$str) . "\n";
        };
        $m->Host = (string)$smtp['host'];
        $m->Port = (int)($smtp['port'] ?? 587);
        $secure = strtolower((string)($smtp['secure'] ?? 'tls'));
        if ($secure === 'ssl') {
            $m->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($secure === '' || $secure === 'none') {
            $m->SMTPSecure = '';
            $m->SMTPAutoTLS = false;
        } else {
            $m->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        }
        if (!empty($smtp['user'])) {
            $m->SMTPAuth = true;
            $m->Username = (string)$smtp['user'];
            $m->Password = (string)($smtp['pass'] ?? '');
        }
        if ($relaxTls || ($smtp['verify_peer'] ?? true) === false) {
            $m->SMTPOptions = ['ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true]];
        }
        $m->Timeout = 12;
        $m->CharSet = \PHPMailer\PHPMailer\PHPMailer::CHARSET_UTF8;
        $m->setFrom($from['email'], (string)($from['name'] ?? ''));
        // Envelope-from aligned with the authenticated mailbox — Gmail requires
        // it, and it keeps SPF/DMARC happy on any authenticated relay.
        $m->Sender = (!empty($smtp['user']) && filter_var($smtp['user'], FILTER_VALIDATE_EMAIL))
            ? (string)$smtp['user'] : (string)$from['email'];
        if (!empty($from['replyTo'])) $m->addReplyTo((string)$from['replyTo']);
        $m->addAddress($to);
        $m->isHTML(true);
        $m->Subject = $subject;
        $m->Body = $html;
        $m->AltBody = $text !== '' ? $text : strip_tags($html);
        try {
            $m->send();
            return ['ok' => true];
        } catch (\Throwable $e) {
            $info = trim((string)($m->ErrorInfo ?? '')) ?: $e->getMessage();
            return ['ok' => false, 'error' => $info, 'log' => $srv];
        }
    };

    $r = $attempt(false);
    if (!empty($r['ok'])) return true;

    // Retry once WITHOUT cert verification only when the failure looks like a
    // TLS/connect problem AND the operator has explicitly opted in. Downgrading
    // TLS silently would let a MITM who can induce a TLS error strip verification
    // off a connection carrying the SMTP AUTH credentials — so it is off by
    // default and must be turned on deliberately (smtp.allow_insecure_fallback).
    $err = (string)($r['error'] ?? '');
    $tlsish = preg_match('/certificate|ssl|tls|verify|self.signed|could not connect|connect\(\)|stream_socket/i', $err) === 1;
    $optedIn = ($smtp['allow_insecure_fallback'] ?? false) === true && ($smtp['verify_peer'] ?? true) !== false;
    if ($tlsish && $optedIn) {
        error_log('[smtp] cert verification failed — retrying without peer verification (operator opt-in): ' . $err);
        $r2 = $attempt(true);
        if (!empty($r2['ok'])) return true;
        $r = $r2;
    } elseif ($tlsish) {
        error_log('[smtp] TLS/connect failure; insecure fallback is disabled (set mail.smtp.allow_insecure_fallback=true to permit): ' . $err);
    }

    $log = trim((string)($r['log'] ?? ''));
    $log = $log !== '' ? ' | server: ' . substr((string)preg_replace('/\s+/', ' ', $log), -300) : '';
    throw new \RuntimeException(((string)($r['error'] ?? 'smtp_failed')) . $log);
}

/**
 * Minimal hand-rolled SMTP client (fallback when PHPMailer is unavailable):
 * EHLO, optional STARTTLS, AUTH LOGIN, one HTML message.
 * `secure` = 'tls' (STARTTLS on 587), 'ssl' (implicit on 465), or '' (plain).
 */
function smtp_send_raw(array $smtp, array $from, string $to, string $subject, string $html, string $text): bool {
    $host = (string)$smtp['host'];
    $port = (int)($smtp['port'] ?? 587);
    $secure = strtolower((string)($smtp['secure'] ?? 'tls'));
    $transport = ($secure === 'ssl') ? "ssl://$host" : $host;

    $sock = @stream_socket_client("$transport:$port", $errno, $errstr, 15);
    if (!$sock) throw new RuntimeException("smtp_connect_failed: $errstr");
    stream_set_timeout($sock, 15);

    $read = function () use ($sock) {
        $data = '';
        while (($line = fgets($sock, 512)) !== false) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function (string $c, string $expect) use ($sock, $read) {
        fwrite($sock, $c . "\r\n");
        $resp = $read();
        if (strncmp($resp, $expect, strlen($expect)) !== 0) {
            throw new RuntimeException("smtp_unexpected: sent=" . trim($c) . " got=" . trim($resp));
        }
        return $resp;
    };

    $ehloHost = parse_url($GLOBALS['CONFIG']['app_origin'] ?? '', PHP_URL_HOST) ?: 'localhost';
    $read(); // greeting
    $cmd("EHLO $ehloHost", '250');
    if ($secure === 'tls') {
        $cmd('STARTTLS', '220');
        // Explicitly offer TLS 1.1/1.2/1.3. On some PHP builds the bare
        // *_TLS_CLIENT flag negotiates only TLS 1.0, which modern relays
        // (Gmail included) refuse — the handshake would fail silently.
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT')) $crypto |= STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) $crypto |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
        if (!stream_socket_enable_crypto($sock, true, $crypto)) {
            throw new RuntimeException('smtp_tls_failed: could not negotiate TLS with ' . $host);
        }
        $cmd("EHLO $ehloHost", '250');
    }
    if (!empty($smtp['user'])) {
        $cmd('AUTH LOGIN', '334');
        $cmd(base64_encode((string)$smtp['user']), '334');
        $cmd(base64_encode((string)($smtp['pass'] ?? '')), '235');
    }
    // Envelope sender must be the authenticated mailbox for Gmail (and most
    // relays) — a mismatched MAIL FROM gets rejected or SPF-failed. Fall back
    // to the configured From only when no SMTP user is set (open relay/local).
    $envelopeFrom = (!empty($smtp['user']) && filter_var($smtp['user'], FILTER_VALIDATE_EMAIL))
        ? (string)$smtp['user'] : $from['email'];
    $cmd('MAIL FROM:<' . $envelopeFrom . '>', '250');
    $cmd('RCPT TO:<' . $to . '>', '250');
    $cmd('DATA', '354');

    $boundary = 'ngg_' . bin2hex(random_bytes(8));
    $msg = implode("\r\n", mail_std_headers($from['email'])) . "\r\n"
        . "From: " . mb_encode_mimeheader($from['name']) . " <" . $from['email'] . ">\r\n"
        . "To: <$to>\r\n"
        . ($from['replyTo'] ? "Reply-To: " . $from['replyTo'] . "\r\n" : '')
        . "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n\r\n"
        . mail_alt_body($html, $text, $boundary);
    // Normalize to CRLF (RFC 5321) then dot-stuff any line starting with '.'.
    $msg = preg_replace('/\r\n|\r|\n/', "\r\n", $msg) ?? $msg;
    $msg = preg_replace('/^\./m', '..', $msg) ?? $msg;
    $cmd($msg . "\r\n.", '250');
    fwrite($sock, "QUIT\r\n");
    fclose($sock);
    return true;
}

/**
 * Minimalist HTML shell — the email counterpart of the printed ID cards:
 * a white card on a light ground, a thin crimson identity rule, the navy
 * wordmark, clean type, and a single quiet navy button. No heavy header bar,
 * no gold slab. Table-based + inline styles for email-client safety.
 */
/**
 * Branded, email-client-safe HTML wrapper (tables + inline styles, no external
 * CSS/fonts). Design system: navy #0c1432 / gold #f5b026 on cool neutrals with
 * crisp hairline borders — mirrors the NGG public brand.
 *
 * Options (all optional, backward-compatible with every caller):
 *   title, intro, bodyHtml, ctaLabel + ctaUrl, preheader, footNote
 *   eyebrow      — small pill label above the title (e.g. "Verify your email")
 *   eyebrowTone  — 'gold' (default) | 'coral'
 *   badge        — tiny mono label in the header's top-right (e.g. "Cohort 03")
 *   otp          — a code string; rendered as spaced digit cells in a panel
 */
function email_template(array $opts): string {
    global $CONFIG;
    $origin = rtrim((string)($CONFIG['app_origin'] ?? ''), '/');
    $c = org_contact();
    // Cool-neutral palette + brand accents.
    $navy = '#0c1432'; $navyTop = '#1a2954';
    $gold = '#f5b026'; $darkGold = '#7a5600'; $coral = '#a3331c';
    $ink = '#414a63'; $muted = '#5a6488'; $faint = '#8088a6';
    $hair = '#f0f1f5'; $panelLine = '#eceef2'; $cardLine = '#e8eaef'; $cellLine = '#e2e5ec';
    $panel = '#f7f8fa'; $outer = '#eef0f4';
    $disp = "'Sora','Segoe UI',Helvetica,Arial,sans-serif";
    $sans = "'Inter','Segoe UI',Helvetica,Arial,sans-serif";
    $monoF = "'JetBrains Mono',ui-monospace,'Courier New',monospace";

    // Hidden preview text — controls the one-line snippet inboxes show.
    $pre = trim((string)($opts['preheader'] ?? $opts['intro'] ?? $opts['title'] ?? ''));
    $preheader = $pre !== ''
        ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:' . $outer . ';opacity:0">' . esc_html($pre) . '</div>'
        : '';

    // Eyebrow pill (gold by default; coral tone available).
    $eyebrow = '';
    if (!empty($opts['eyebrow'])) {
        $coralTone = ($opts['eyebrowTone'] ?? '') === 'coral';
        $dot = $coralTone ? '#ff5a3c' : $gold;
        $fg  = $coralTone ? $coral : $darkGold;
        $bg  = $coralTone ? 'rgba(255,90,60,0.10)' : 'rgba(245,176,38,0.14)';
        $bd  = $coralTone ? 'rgba(255,90,60,0.24)' : 'rgba(245,176,38,0.30)';
        $eyebrow = '<div style="padding:36px 36px 0"><span style="display:inline-block;font-family:' . $monoF . ';font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:' . $fg . ';background:' . $bg . ';border:1px solid ' . $bd . ';padding:5px 12px;border-radius:999px"><span style="color:' . $dot . '">&#9679;</span>&nbsp;' . esc_html($opts['eyebrow']) . '</span></div>';
    }

    // OTP digit cells (email-safe: a row of bordered table cells).
    $otpBlock = '';
    if (!empty($opts['otp'])) {
        $digits = preg_split('//u', trim((string)$opts['otp']), -1, PREG_SPLIT_NO_EMPTY);
        $cells = '';
        foreach ($digits as $d) {
            $cells .= '<td style="padding:0 4px"><div style="width:44px;height:52px;line-height:52px;text-align:center;background:#ffffff;border:1px solid ' . $cellLine . ';border-radius:10px;font-family:' . $disp . ';font-size:22px;font-weight:700;color:' . $navy . '">' . esc_html($d) . '</div></td>';
        }
        $otpBlock = '<tr><td style="padding:24px 36px 0">'
            . '<div style="background:' . $panel . ';border:1px solid ' . $panelLine . ';border-radius:14px;padding:20px">'
            . '<div style="font-family:' . $monoF . ';font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:' . $faint . ';text-align:center">Or enter this code</div>'
            . '<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:12px auto 0"><tr>' . $cells . '</tr></table>'
            . '</div></td></tr>';
    }

    $badge = !empty($opts['badge'])
        ? '<span style="font-family:' . $monoF . ';font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:' . $faint . '">' . esc_html($opts['badge']) . '</span>'
        : '';

    // Navy CTA — solid base for Outlook, gradient as progressive enhancement.
    $cta = (!empty($opts['ctaLabel']) && !empty($opts['ctaUrl']))
        ? '<tr><td style="padding:28px 36px 0"><a href="' . esc_html($opts['ctaUrl']) . '" style="display:block;text-align:center;background:' . $navy . ';background:linear-gradient(180deg,' . $navyTop . ',' . $navy . ');color:#ffffff;text-decoration:none;font-family:' . $sans . ';font-size:15px;font-weight:600;letter-spacing:.2px;padding:15px 24px;border-radius:12px">' . str_replace(' →', '&nbsp;→', esc_html($opts['ctaLabel'])) . '</a></td></tr>'
        : '';

    return '<div style="background:' . $outer . ';padding:40px 0;font-family:' . $sans . ';-webkit-font-smoothing:antialiased">'
        . $preheader
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        . '<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border:1px solid ' . $cardLine . ';border-radius:18px;overflow:hidden">'
        // header — real logo (falls back to a navy monogram if no origin is set
        // so the mark still shows when images are blocked or the URL is unknown)
        . '<tr><td style="padding:22px 36px;border-bottom:1px solid ' . $hair . '">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        . '<td style="vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
        . ($origin !== ''
            ? '<td style="width:36px;vertical-align:middle"><img src="' . esc_html($origin . '/assets/logo.png') . '" width="36" height="36" alt="NGG" style="display:block;width:36px;height:36px;border-radius:9px"></td>'
            : '<td style="width:34px;height:34px;background:' . $navy . ';border-radius:9px;text-align:center;vertical-align:middle;font-family:' . $disp . ';font-size:18px;font-weight:800;color:' . $gold . '">G</td>')
        . '<td style="padding-left:11px;vertical-align:middle;line-height:1.1">'
        . '<div style="font-family:' . $disp . ';color:' . $navy . ';font-size:14px;font-weight:700;letter-spacing:-.01em">Next Generation Genius</div>'
        . '<div style="font-family:' . $monoF . ';color:' . $faint . ';font-size:9px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Afrovanguard</div>'
        . '</td></tr></table></td>'
        . '<td align="right" style="vertical-align:middle">' . $badge . '</td>'
        . '</tr></table></td></tr>'
        // eyebrow + title + intro
        . ($eyebrow !== '' ? '<tr><td>' . $eyebrow . '</td></tr>' : '')
        . '<tr><td style="padding:' . ($eyebrow !== '' ? '18px' : '36px') . ' 36px 0">'
        . '<h1 style="margin:0;font-family:' . $disp . ';color:' . $navy . ';font-size:26px;font-weight:800;line-height:1.16;letter-spacing:-.02em">' . esc_html($opts['title'] ?? '') . '</h1>'
        . (!empty($opts['intro']) ? '<p style="margin:14px 0 0;color:' . $ink . ';font-size:15px;line-height:1.65">' . esc_html($opts['intro']) . '</p>' : '')
        . '</td></tr>'
        . (!empty($opts['bodyHtml']) ? '<tr><td style="padding:14px 36px 0;color:' . $ink . ';font-size:15px;line-height:1.65">' . $opts['bodyHtml'] . '</td></tr>' : '')
        . $cta
        . $otpBlock
        // footer — cool-neutral panel, crisp top border
        . '<tr><td style="padding:28px 36px 30px;margin-top:26px;background:' . $panel . ';border-top:1px solid ' . $panelLine . '">'
        . '<div style="color:' . $faint . ';font-size:12px;line-height:1.7">'
        . esc_html($opts['footNote'] ?? 'You are receiving this because you are part of Next Generation Genius.')
        . '<br>Reply to this email, or reach us at <a href="mailto:' . esc_html($c['email']) . '" style="color:' . $muted . ';text-decoration:underline">' . esc_html($c['email']) . '</a> &middot; ' . esc_html($c['phone'])
        . '</div>'
        . ($origin ? '<div style="margin-top:14px"><a href="' . esc_html($origin) . '" style="font-family:' . $monoF . ';font-size:11px;letter-spacing:.5px;color:' . $muted . ';text-decoration:none">' . esc_html($c['site']) . '</a></div>' : '')
        . '</td></tr>'
        . '</table></td></tr></table></div>';
}

/**
 * Fan a templated email out to a list of member rows. Bounded by $cap so one
 * broadcast can't hammer the host's mail relay. Returns { sent, skipped }.
 */
function email_members(array $members, string $subject, callable $htmlBuilder, int $cap = 250): array {
    $sent = 0; $skipped = 0;
    foreach ($members as $m) {
        $to = trim((string)($m['email'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || $sent >= $cap) { $skipped++; continue; }
        if (send_mail($to, $subject, $htmlBuilder($m))) $sent++; else $skipped++;
    }
    return ['sent' => $sent, 'skipped' => $skipped];
}
