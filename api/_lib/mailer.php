<?php
declare(strict_types=1);

/**
 * NGG mailer. Uses SMTP when `mail.smtp.host` is configured (recommended on
 * shared hosting for deliverability), otherwise falls back to PHP mail().
 * Dependency-free — no Composer, matching the buildless philosophy.
 */

function mail_from(): array {
    global $CONFIG;
    $m = $CONFIG['mail'] ?? [];
    return [
        'name'    => $m['from_name']  ?? 'Next Generation Genius',
        'email'   => $m['from_email'] ?? ('no-reply@' . (parse_url($CONFIG['app_origin'] ?? 'https://ngg.afrovanguard.org', PHP_URL_HOST) ?: 'localhost')),
        'replyTo' => $m['reply_to']   ?? '',
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
    $from = mail_from();
    $text = $text ?? trim(preg_replace('/\n{3,}/', "\n\n", strip_tags(preg_replace('#<br\s*/?>|</p>|</div>#i', "\n", $html)) ?? ''));

    $smtp = $CONFIG['mail']['smtp'] ?? [];
    try {
        if (!empty($smtp['host'])) {
            return smtp_send($smtp, $from, $to, $subject, $html, $text);
        }
        return mail_native($from, $to, $subject, $html);
    } catch (Throwable $e) {
        error_log('[send_mail] ' . $e->getMessage());
        return false;
    }
}

function mail_native(array $from, string $to, string $subject, string $html): bool {
    $boundary = 'ngg_' . bin2hex(random_bytes(8));
    $headers = [
        'MIME-Version: 1.0',
        'From: ' . mb_encode_mimeheader($from['name']) . ' <' . $from['email'] . '>',
        'Content-Type: text/html; charset=UTF-8',
    ];
    if (!empty($from['replyTo'])) $headers[] = 'Reply-To: ' . $from['replyTo'];
    unset($boundary);
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, implode("\r\n", $headers));
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
        if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('smtp_tls_failed');
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

    $headers = "From: " . mb_encode_mimeheader($from['name']) . " <" . $from['email'] . ">\r\n"
        . "To: <$to>\r\n"
        . ($from['replyTo'] ? "Reply-To: " . $from['replyTo'] . "\r\n" : '')
        . "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n\r\n";
    // Dot-stuff lines beginning with '.'
    $body = preg_replace('/^\./m', '..', $html) ?? $html;
    $cmd($headers . $body . "\r\n.", '250');
    fwrite($sock, "QUIT\r\n");
    fclose($sock);
    return true;
}

/** Branded HTML shell so every outbound email stays on-brand (navy + gold). */
function email_template(array $opts): string {
    global $CONFIG;
    $origin = $CONFIG['app_origin'] ?? '';
    $cta = (!empty($opts['ctaLabel']) && !empty($opts['ctaUrl']))
        ? '<tr><td style="padding:8px 0 4px"><a href="' . esc_html($opts['ctaUrl']) . '" style="display:inline-block;background:#f5b026;color:#0c1432;text-decoration:none;font-weight:700;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:13px 26px;border-radius:10px">' . esc_html($opts['ctaLabel']) . '</a></td></tr>'
        : '';
    return '<div style="background:#0c1432;padding:32px 0;font-family:Arial,Helvetica,sans-serif">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">'
        . '<tr><td style="background:#0c1432;padding:22px 28px">'
        . '<span style="color:#f5b026;font-weight:800;font-size:18px;letter-spacing:.5px">Next Generation Genius</span>'
        . '<span style="color:#8a93b8;font-size:11px;letter-spacing:2px;display:block;margin-top:2px;text-transform:uppercase">Afrovanguard</span>'
        . '</td></tr>'
        . '<tr><td style="padding:30px 28px 8px">'
        . '<h1 style="margin:0 0 6px;color:#0c1432;font-size:22px">' . esc_html($opts['title'] ?? '') . '</h1>'
        . (!empty($opts['intro']) ? '<p style="margin:0 0 14px;color:#4a5170;font-size:15px;line-height:1.55">' . esc_html($opts['intro']) . '</p>' : '')
        . '</td></tr>'
        . '<tr><td style="padding:0 28px 8px;color:#2a3050;font-size:15px;line-height:1.6">' . ($opts['bodyHtml'] ?? '') . '</td></tr>'
        . '<tr><td style="padding:6px 28px 26px"><table role="presentation" cellpadding="0" cellspacing="0">' . $cta . '</table></td></tr>'
        . '<tr><td style="background:#f5f6fa;padding:16px 28px;color:#8a93b8;font-size:12px;line-height:1.5">'
        . esc_html($opts['footNote'] ?? 'You are receiving this because you are a member of Next Generation Genius.')
        . ($origin ? '<br><a href="' . esc_html($origin) . '" style="color:#8a93b8">' . esc_html(preg_replace('#^https?://#', '', $origin) ?? $origin) . '</a>' : '')
        . '</td></tr></table></td></tr></table></div>';
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
