<?php
// End-to-end check of smtp_send against a minimal fake SMTP server (STARTTLS
// skipped — 'secure'=>'' — so we can read the plaintext DATA the client emits).
require __DIR__ . '/../_lib/mailer.php';
$GLOBALS['CONFIG'] = ['app_origin' => 'https://ngg.example.org', 'mail' => []];

$server = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
if (!$server) { fwrite(STDERR, "server failed: $errstr\n"); exit(2); }
$name = stream_socket_get_name($server, false);
$port = (int)substr($name, strrpos($name, ':') + 1);

$pid = pcntl_fork();
if ($pid === 0) {
    // Child: the SMTP server. Accept one client, run the dialogue, capture DATA.
    $conn = stream_socket_accept($server, 10);
    if (!$conn) exit(0);
    $captured = '';
    fwrite($conn, "220 fake ESMTP\r\n");
    $inData = false; $msg = ''; $authStep = 0;
    while (($line = fgets($conn, 1024)) !== false) {
        if ($inData) {
            if ($line === ".\r\n") { $inData = false; fwrite($conn, "250 OK queued\r\n"); $captured = $msg; continue; }
            $msg .= $line; continue;
        }
        if ($authStep === 1) { $authStep = 2; fwrite($conn, "334 UGFzc3dvcmQ6\r\n"); continue; } // got username → prompt password
        if ($authStep === 2) { $authStep = 0; fwrite($conn, "235 Authentication succeeded\r\n"); continue; } // got password
        $c = strtoupper(substr(trim($line), 0, 4));
        if (str_starts_with($c, 'EHLO') || str_starts_with($c, 'HELO')) fwrite($conn, "250-fake\r\n250 AUTH LOGIN\r\n");
        elseif (str_starts_with($c, 'AUTH')) { $authStep = 1; fwrite($conn, "334 VXNlcm5hbWU6\r\n"); } // prompt username
        elseif (str_starts_with($c, 'MAIL')) fwrite($conn, "250 OK\r\n");
        elseif (str_starts_with($c, 'RCPT')) fwrite($conn, "250 OK\r\n");
        elseif (str_starts_with($c, 'DATA')) { fwrite($conn, "354 End data with <CR><LF>.<CR><LF>\r\n"); $inData = true; }
        elseif (str_starts_with($c, 'QUIT')) { fwrite($conn, "221 Bye\r\n"); break; }
        else fwrite($conn, "250 OK\r\n");
    }
    file_put_contents(sys_get_temp_dir() . '/ngg-smtp-capture.txt', $captured);
    fclose($conn);
    exit(0);
}

// Parent: the client.
usleep(200000);
$ok = smtp_send(
    ['host' => '127.0.0.1', 'port' => $port, 'secure' => '', 'user' => 'u@afrovanguard.org.ng', 'pass' => 'p'],
    ['name' => 'NGG', 'email' => 'no-reply@afrovanguard.org.ng', 'replyTo' => 'next@afrovanguard.org.ng'],
    'ada@example.com', 'Subject line', '<p>Hello .dotline</p>' . "\n" . '.leading dot', 'Hello dotline'
);
pcntl_waitpid($pid, $st);
$cap = @file_get_contents(sys_get_temp_dir() . '/ngg-smtp-capture.txt') ?: '';
@unlink(sys_get_temp_dir() . '/ngg-smtp-capture.txt');

$fail = 0; $t = function ($cond, $m) use (&$fail) { echo ($cond ? "  ✓ " : "  ✗ ") . $m . "\n"; if (!$cond) $fail++; };
$t($ok === true, 'smtp_send returned true through full EHLO/AUTH/MAIL/RCPT/DATA');
$t((bool)preg_match('/(^|\r\n)Date: \w{3}, /', $cap), 'message carries a Date header');
$t((bool)preg_match('/\r\nMessage-ID: <[0-9a-f]{32}@afrovanguard\.org\.ng>\r\n/', $cap), 'domain-scoped Message-ID present');
$t(str_contains($cap, 'multipart/alternative'), 'multipart/alternative content type');
$t(str_contains($cap, 'text/plain') && str_contains($cap, 'text/html'), 'both text and html parts present');
$t(str_contains($cap, 'Reply-To: next@afrovanguard.org.ng'), 'reply-to preserved');
$t(!preg_match('/[^\r]\n/', $cap), 'no bare LF — CRLF throughout');
$t(str_contains($cap, '..leading dot'), 'leading-dot line is dot-stuffed');
$t(str_contains($cap, 'Subject: =?UTF-8?B?'), 'subject MIME-encoded');
fclose($server);
echo $fail ? "\nSMTP VERIFY: $fail failure(s)\n" : "\n✅ SMTP VERIFY: all checks passed\n";
exit($fail ? 1 : 0);
