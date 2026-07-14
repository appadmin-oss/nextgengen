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
    return [
        'email' => (string)(($o['email'] ?? '') ?: ($CONFIG['mail']['reply_to'] ?? '') ?: 'next@afrovanguard.org.ng'),
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

    // Path 1 — SMTP (authenticated relay). Most reliable when the host permits
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

    // Path 2 — Resend HTTPS API. Shared hosts that block SMTP ports and drop
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

    // Path 3 — PHP mail() last resort (often silently dropped on shared hosts).
    try {
        if (mail_native($from, $to, $subject, $html, $text)) return true;
        $errors[] = 'php_mail(): rejected or unavailable';
    } catch (Throwable $e) {
        $errors[] = 'php_mail(): ' . $e->getMessage();
        error_log('[send_mail/native] ' . $e->getMessage());
    }

    $GLOBALS['__mail_last_error'] = $errors
        ? implode(' | ', $errors)
        : 'No delivery path available. Set mail.smtp.* or mail.resend_key in api/config.php.';
    error_log('[send_mail] all paths failed for ' . $to . ' — ' . $GLOBALS['__mail_last_error']);
    return false;
}

/** Which delivery path send_mail() will try first — for the Control Room diagnostic. */
function mail_mode(): string {
    global $CONFIG;
    $mail = $CONFIG['mail'] ?? [];
    if (!empty($mail['smtp']['host'] ?? '')) return 'smtp';
    $k = trim((string)($mail['resend_key'] ?? ''));
    if ($k !== '' && $k !== 'YOUR_RESEND_KEY_HERE') return 'resend';
    return 'php_mail';
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
 * Minimal SMTP client: EHLO, optional STARTTLS, AUTH LOGIN, one HTML message.
 * `secure` = 'tls' (STARTTLS on 587), 'ssl' (implicit on 465), or '' (plain).
 */
function smtp_send(array $smtp, array $from, string $to, string $subject, string $html, string $text): bool {
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
    $cmd('MAIL FROM:<' . $from['email'] . '>', '250');
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
function email_template(array $opts): string {
    global $CONFIG;
    $origin = $CONFIG['app_origin'] ?? '';
    $c = org_contact();
    $navy = '#00225F'; $crimson = '#E4155F'; $ink = '#333A4D'; $muted = '#8A93A6';
    // Hidden preview text — controls the one-line snippet inboxes show.
    $pre = trim((string)($opts['preheader'] ?? $opts['intro'] ?? $opts['title'] ?? ''));
    $preheader = $pre !== ''
        ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef1f5;opacity:0">' . esc_html($pre) . '</div>'
        : '';
    $cta = (!empty($opts['ctaLabel']) && !empty($opts['ctaUrl']))
        ? '<tr><td style="padding:22px 0 2px"><a href="' . esc_html($opts['ctaUrl']) . '" style="display:inline-block;background:' . $navy . ';color:#ffffff;text-decoration:none;font-weight:700;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:.2px;padding:13px 26px;border-radius:10px">' . esc_html($opts['ctaLabel']) . '</a></td></tr>'
        : '';
    return '<div style="background:#eef1f5;padding:36px 0;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">'
        . $preheader
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        . '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;overflow:hidden">'
        . '<tr><td style="height:4px;background:' . $crimson . ';font-size:0;line-height:0">&nbsp;</td></tr>'
        . '<tr><td style="padding:28px 34px 0">'
        . '<div style="font-size:11px;letter-spacing:2.5px;color:' . $navy . ';font-weight:700;text-transform:uppercase">Next Generation Genius</div>'
        . '<div style="font-size:10px;letter-spacing:2px;color:' . $muted . ';text-transform:uppercase;margin-top:3px">Afrovanguard</div>'
        . '</td></tr>'
        . '<tr><td style="padding:22px 34px 0">'
        . '<h1 style="margin:0;color:' . $navy . ';font-size:21px;font-weight:800;line-height:1.25">' . esc_html($opts['title'] ?? '') . '</h1>'
        . (!empty($opts['intro']) ? '<p style="margin:12px 0 0;color:' . $ink . ';font-size:15px;line-height:1.6">' . esc_html($opts['intro']) . '</p>' : '')
        . '</td></tr>'
        . (!empty($opts['bodyHtml']) ? '<tr><td style="padding:14px 34px 0;color:' . $ink . ';font-size:15px;line-height:1.65">' . $opts['bodyHtml'] . '</td></tr>' : '')
        . '<tr><td style="padding:0 34px"><table role="presentation" cellpadding="0" cellspacing="0">' . $cta . '</table></td></tr>'
        . '<tr><td style="padding:26px 34px 30px"><div style="border-top:1px solid #eef0f4;padding-top:16px;color:' . $muted . ';font-size:12px;line-height:1.6">'
        . esc_html($opts['footNote'] ?? 'You are receiving this because you are part of Next Generation Genius.')
        . '<br>Reply to this email, or reach us at <a href="mailto:' . esc_html($c['email']) . '" style="color:' . $muted . ';text-decoration:none">' . esc_html($c['email']) . '</a> · ' . esc_html($c['phone'])
        . ($origin ? '<br><a href="' . esc_html($origin) . '" style="color:' . $muted . ';text-decoration:none">' . esc_html($c['site']) . '</a>' : '')
        . '</div></td></tr></table></td></tr></table></div>';
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
