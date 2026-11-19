<?php
declare(strict_types=1);

/**
 * Receipts drawn on the server — a PDF and an image, no browser involved.
 *
 * Owner, 18 Nov 2026: "Make receipts downloadable as PDF and image with server
 * drawing instead of browser." Until now a receipt was an HTML page the
 * browser printed (doc_render_receipt): fine on a laptop, unreliable on a
 * low-end phone, and impossible to attach to a WhatsApp message.
 *
 * ONE DRAWING, TWO FILES. receipt_draw() paints the receipt with GD at 2× an
 * A4 page (1588 × 2246 px) from the receipt's FROZEN copy (documents.data) —
 * the same data, labels and order as the HTML receipt, so all three agree.
 *   · The image (PNG) is that drawing cropped to the receipt.
 *   · The PDF is that drawing placed on an A4 page by receipt_pdf_wrap(): a
 *     small, standard PDF 1.4 writer (one page, one image, metadata), in plain
 *     PHP. No PDF library, no headless browser, no new dependency.
 * The two can never disagree, because there is only one drawing.
 *
 * FONT. Inter (OFL), kept server-side in api/_lib/fonts (blocked from the web
 * by api/.htaccess). It has ₦ and the Yoruba letters ẹ ọ ṣ; text is
 * NFC-normalised, and a tone mark that has no precomposed letter (ọ̀, ẹ́) is
 * placed over its letter by receipt_text(), because GD does not shape text.
 */

const RCPT_W = 794;            // CSS px of an A4 page; drawn at RCPT_SCALE
const RCPT_H = 1123;
const RCPT_SCALE = 2;
const RCPT_INK = [14, 22, 48], RCPT_MUTE = [106, 113, 144], RCPT_NAVY = [31, 50, 99], RCPT_GOLD = [245, 176, 38];
const RCPT_RULE = [228, 230, 236], RCPT_SOFT = [238, 240, 246], RCPT_WHITE = [255, 255, 255];

function receipt_font(string $w): string {
    $f = __DIR__ . '/../fonts/Inter-' . ['r' => 'Regular', 's' => 'SemiBold', 'b' => 'Bold'][$w] . '.otf';
    return is_file($f) ? $f : __DIR__ . '/../../../vendor/pdfjs-standard-fonts/LiberationSans-' . ($w === 'r' ? 'Regular' : 'Bold') . '.ttf';
}
function receipt_available(): bool { return function_exists('imagettftext') && function_exists('imagecreatetruecolor'); }

/** Text as GD can draw it: NFC, and a list of [base, marks[]] clusters. */
function receipt_clusters(string $s): array {
    if (class_exists('Normalizer')) $s = (string)Normalizer::normalize($s, Normalizer::FORM_C);
    $out = [];
    foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
        if (preg_match('/\p{Mn}/u', $ch) && $out) $out[count($out) - 1][1][] = $ch;
        else $out[] = [$ch, []];
    }
    return $out;
}

/** The pen advance of a run in device px (not its ink box): measured against a fixed letter so side bearings count. */
function receipt_advance(string $run, float $px, string $font): float {
    if ($run === '') return 0;
    $with = imagettfbbox($px, 0, $font, $run . 'H'); $h = imagettfbbox($px, 0, $font, 'H');
    return (float)(($with[2] - $with[0]) - ($h[2] - $h[0]));
}
/** Runs of text GD can draw in one call, split before each cluster that carries a left-over combining mark. */
function receipt_runs(string $s): array {
    $runs = []; $cur = '';
    foreach (receipt_clusters($s) as [$ch, $marks]) {
        if ($marks) { if ($cur !== '') $runs[] = [$cur, []]; $runs[] = [$ch, $marks]; $cur = ''; }
        else $cur .= $ch;
    }
    if ($cur !== '') $runs[] = [$cur, []];
    return $runs;
}

/** Width of a string in device px, at a font size in CSS px. */
function receipt_width(string $s, float $size, string $w): float {
    $px = $size * RCPT_SCALE * 0.75; $font = receipt_font($w); $t = 0;
    foreach (receipt_runs($s) as [$run]) $t += receipt_advance($run, $px, $font);
    return $t;
}

/**
 * Draw text at (x, y-baseline) in CSS px. Align left/right/center. Returns
 * the advance in CSS px. Runs are drawn whole (so the font's kerning holds);
 * a combining mark left over after NFC is centred over its letter.
 */
function receipt_text($im, string $s, float $x, float $y, float $size, string $w, array $rgb, string $align = 'left', int $alpha = 0): float {
    if ($s === '') return 0;
    $k = RCPT_SCALE; $px = $size * $k * 0.75; $font = receipt_font($w);
    $col = imagecolorallocatealpha($im, $rgb[0], $rgb[1], $rgb[2], $alpha);
    $width = receipt_width($s, $size, $w);
    $pen = $x * $k - ($align === 'right' ? $width : ($align === 'center' ? $width / 2 : 0));
    $base = (int)round($y * $k);
    foreach (receipt_runs($s) as [$run, $marks]) {
        imagettftext($im, $px, 0, (int)round($pen), $base, $col, $font, $run);
        $adv = receipt_advance($run, $px, $font);
        foreach ($marks as $mk) {
            $mb = imagettfbbox($px, 0, $font, $mk); $mw = $mb[2] - $mb[0];
            $lift = preg_match('/\p{Lu}|[bdfhklt]/u', $run) && !preg_match('/[\x{0323}-\x{0331}]/u', $mk) ? $px * 0.22 : 0;
            imagettftext($im, $px, 0, (int)round($pen + ($adv - $mw) / 2 - $mb[0]), (int)round($base - $lift), $col, $font, $mk);
        }
        $pen += $adv;
    }
    return $width / $k;
}

/** Word-wrap to a width in CSS px; returns lines. */
function receipt_wrap(string $s, float $size, string $w, float $maxW): array {
    $lines = []; $cur = '';
    foreach (preg_split('/\s+/u', trim($s)) as $word) {
        $try = $cur === '' ? $word : $cur . ' ' . $word;
        if ($cur !== '' && receipt_width($try, $size, $w) / RCPT_SCALE > $maxW) { $lines[] = $cur; $cur = $word; } else $cur = $try;
    }
    if ($cur !== '') $lines[] = $cur;
    return $lines ?: [''];
}
function receipt_para($im, string $s, float $x, float $y, float $size, string $w, array $rgb, float $maxW, float $lh): float {
    foreach (receipt_wrap($s, $size, $w, $maxW) as $i => $l) receipt_text($im, $l, $x, $y + $i * $lh, $size, $w, $rgb);
    return $y + (count(receipt_wrap($s, $size, $w, $maxW)) - 1) * $lh;
}
function receipt_rect($im, float $x, float $y, float $w, float $h, array $rgb, float $r = 0): void {
    $k = RCPT_SCALE; $c = imagecolorallocate($im, $rgb[0], $rgb[1], $rgb[2]);
    $x0 = (int)round($x * $k); $y0 = (int)round($y * $k); $x1 = (int)round(($x + $w) * $k) - 1; $y1 = (int)round(($y + $h) * $k) - 1; $rr = (int)round($r * $k);
    if ($rr <= 0) { imagefilledrectangle($im, $x0, $y0, $x1, $y1, $c); return; }
    imagefilledrectangle($im, $x0 + $rr, $y0, $x1 - $rr, $y1, $c);
    imagefilledrectangle($im, $x0, $y0 + $rr, $x1, $y1 - $rr, $c);
    foreach ([[$x0 + $rr, $y0 + $rr], [$x1 - $rr, $y0 + $rr], [$x0 + $rr, $y1 - $rr], [$x1 - $rr, $y1 - $rr]] as [$cx, $cy]) imagefilledellipse($im, $cx, $cy, 2 * $rr, 2 * $rr, $c);
}
function receipt_money(int $kobo): string { return '₦' . number_format($kobo / 100, 2); }

/** The receipt's logo, once per request. */
function receipt_logo() {
    static $logo = false;
    if ($logo === false) { $f = __DIR__ . '/../../../assets/logo.png'; $logo = is_file($f) ? @imagecreatefrompng($f) : null; }
    return $logo;
}

/**
 * Paint the receipt. Returns [GdImage, usedHeightCssPx].
 * Reads only the frozen copy (doc_data) and the organisation details as they
 * were frozen on it (doc_org_for), exactly as doc_render_receipt does.
 */
function receipt_draw(array $doc): array {
    $d = doc_data($doc); $s = doc_org_for($d);
    $k = RCPT_SCALE; $W = RCPT_W; $L = 52; $R = $W - 52;
    $im = imagecreatetruecolor($W * $k, RCPT_H * $k);
    imagealphablending($im, true); imagesavealpha($im, false);
    receipt_rect($im, 0, 0, $W, RCPT_H, RCPT_WHITE);
    // The strip: navy, with gold at the end — the receipt's mark.
    receipt_rect($im, 0, 0, $W * 0.85, 6, RCPT_NAVY); receipt_rect($im, $W * 0.85, 0, $W * 0.15, 6, RCPT_GOLD);

    // Letterhead.
    if ($logo = receipt_logo()) imagecopyresampled($im, $logo, $L * $k, 34 * $k, 0, 0, 46 * $k, 46 * $k, imagesx($logo), imagesy($logo));
    receipt_text($im, (string)$s['legalName'], $L + 58, 54, 15, 'b', RCPT_INK);
    $ids = implode(' · ', array_filter([$s['rcNo'] !== '' ? 'RC ' . $s['rcNo'] : '', $s['tin'] !== '' ? 'TIN ' . $s['tin'] : '']));
    if ($ids !== '') receipt_text($im, $ids, $L + 58, 73, 12, 'r', RCPT_MUTE);
    receipt_text($im, 'Receipt', $R, 60, 26, 'b', RCPT_INK, 'right');
    receipt_text($im, (string)$doc['docNo'], $R, 80, 12, 's', RCPT_MUTE, 'right');

    // The hero: what was paid, and when.
    $kobo = array_sum(array_column($d['lines'] ?? [], 'kobo'));
    $paid = (string)($d['paidAt'] ?? '');
    receipt_rect($im, $L, 108, $R - $L, 138, RCPT_NAVY, 16);
    receipt_text($im, 'Total paid', $L + 28, 144, 13, 'r', [205, 211, 230]);
    $naira = '₦' . number_format(intdiv($kobo, 100));
    $nw = receipt_text($im, $naira, $L + 28, 204, 46, 'b', RCPT_WHITE);
    receipt_text($im, '.' . str_pad((string)($kobo % 100), 2, '0', STR_PAD_LEFT), $L + 28 + $nw, 204, 46, 'b', [140, 152, 190]);
    receipt_text($im, 'Received with thanks on ' . doc_local($paid, 'j F Y') . '.', $L + 28, 230, 14, 'r', RCPT_WHITE);
    $pill = 'Paid in full'; $pw = receipt_width($pill, 13, 's') / $k + 44;
    receipt_rect($im, $R - 28 - $pw, 196, $pw, 32, RCPT_GOLD, 16);
    receipt_text($im, '✓', $R - 28 - $pw + 14, 217, 13, 'b', RCPT_INK);
    receipt_text($im, $pill, $R - 28 - $pw + 32, 217, 13, 's', RCPT_INK);

    // Who, what, how.
    $m = $d['member'] ?? []; $py = $d['payer'] ?? [];
    $cols = [$L, $L + 239, $L + 479]; $cw = 220;
    $facts = [
        ['Received from', (string)($py['name'] ?? ''), (string)($py['rel'] ?? '')],
        ['For member', (string)($m['name'] ?? ''), trim((string)($m['id'] ?? '') . ((($m['centre'] ?? '') !== '') ? ' · ' . $m['centre'] . ' centre' : ''))],
        ['Settles invoice', (string)($d['invoiceNo'] ?? ''), 'Issued ' . doc_local((string)($d['invoiceIssued'] ?? ''), 'j M Y')],
        ['Paid on', doc_local($paid, 'j M Y, H:i') . ' WAT', ''],
        ['Method', (string)($d['method']['text'] ?? ''), ''],
        ['Transaction ref.', (string)($d['ref'] ?? '') ?: '—', ''],
    ];
    $y = 290;
    foreach ([0, 3] as $row) {
        $bottom = $y;
        for ($i = 0; $i < 3; $i++) {
            [$lab, $val, $sub] = $facts[$row + $i];
            receipt_text($im, $lab, $cols[$i], $y, 12, 'r', RCPT_MUTE);
            $ly = receipt_para($im, $val, $cols[$i], $y + 21, 14.5, 's', RCPT_INK, $cw, 19);
            if ($sub !== '') $ly = receipt_para($im, $sub, $cols[$i], $ly + 21, 12.5, 'r', RCPT_MUTE, $cw, 17);
            $bottom = max($bottom, $ly);
        }
        $y = $bottom + 44;
    }

    // The lines.
    $y += 4;
    receipt_text($im, 'Description', $L, $y, 12, 'r', RCPT_MUTE);
    receipt_text($im, 'Period', $L + 404, $y, 12, 'r', RCPT_MUTE);
    receipt_text($im, 'Amount', $R, $y, 12, 'r', RCPT_MUTE, 'right');
    receipt_rect($im, $L, $y + 10, $R - $L, 1.2, RCPT_INK);
    $y += 38;
    foreach ($d['lines'] ?? [] as $l) {
        $label = (string)$l['label']; $detail = (string)($l['detail'] ?? '');
        $lw = receipt_text($im, $label, $L, $y, 14, 'r', RCPT_INK);
        $last = $y;
        if ($detail !== '') {
            // The detail runs on after the label, then wraps under it at the full column width.
            $words = preg_split('/\s+/u', '· ' . $detail); $line = ''; $lines = []; $avail = 380 - $lw - 5;
            foreach ($words as $wd) {
                $try = $line === '' ? $wd : $line . ' ' . $wd;
                if ($line !== '' && receipt_width($try, 14, 'r') / $k > $avail) { $lines[] = $line; $line = $wd; $avail = 380; } else $line = $try;
            }
            $lines[] = $line;
            foreach ($lines as $i => $ln) receipt_text($im, $ln, $i ? $L : $L + $lw + 5, $y + $i * 19, 14, 'r', RCPT_MUTE);
            $last = $y + (count($lines) - 1) * 19;
        }
        receipt_text($im, (string)$l['period'], $L + 404, $y, 14, 'r', RCPT_MUTE);
        receipt_text($im, receipt_money((int)$l['kobo']), $R, $y, 14, 'r', RCPT_INK, 'right');
        receipt_rect($im, $L, $last + 14, $R - $L, 1, RCPT_RULE);
        $y = $last + 40;
    }

    // Words and totals.
    $vat = doc_vat_inside($kobo, (string)($d['vat'] ?? 'exempt'));
    $wy = receipt_para($im, 'Amount in words: ' . doc_words(intdiv($kobo, 100)), $L, $y + 4, 12.5, 'r', RCPT_INK, 380, 18);
    $tx = $L + 440;
    receipt_text($im, 'Subtotal', $tx, $y + 4, 13.5, 'r', RCPT_INK); receipt_text($im, receipt_money($kobo - $vat), $R, $y + 4, 13.5, 'r', RCPT_MUTE, 'right');
    receipt_text($im, 'VAT', $tx, $y + 30, 13.5, 'r', RCPT_INK); receipt_text($im, $vat ? receipt_money($vat) . ' (7.5%)' : 'Exempt', $R, $y + 30, 13.5, 'r', RCPT_MUTE, 'right');
    receipt_rect($im, $tx, $y + 44, $R - $tx, 2, RCPT_GOLD);
    receipt_text($im, 'Total paid', $tx, $y + 74, 14, 's', RCPT_INK); receipt_text($im, receipt_money($kobo), $R, $y + 74, 19, 'b', RCPT_INK, 'right');
    $y = max($wy, $y + 74) + 34;

    // The balance after this payment.
    $bal = $d['balanceAfter'] ?? null;
    if ($bal !== null) {
        receipt_rect($im, $L, $y, $R - $L, 48, RCPT_SOFT, 10);
        $bt = 'Balance after this payment: ' . receipt_money(max(0, (int)$bal) * 100) . '.';
        $bw = receipt_text($im, $bt, $L + 22, $y + 30, 13.5, 's', RCPT_NAVY);
        if ((int)$bal > 0) receipt_text($im, ' The rest is on the Family Portal statement.', $L + 22 + $bw, $y + 30, 13.5, 'r', RCPT_INK);
        $y += 48;
    }

    // Verification and signature, then the legal line — at the foot of the page, or below the content if it runs long.
    $fy = max($y + 60, RCPT_H - 196);
    [$n, $mx] = function_exists('qr_matrix') ? qr_matrix(doc_verify_url((string)$doc['docNo'])) : [0, []];
    receipt_rect($im, $L, $fy, 62, 62, RCPT_RULE, 8); receipt_rect($im, $L + 1, $fy + 1, 60, 60, RCPT_WHITE, 7);
    if ($n) {
        $cell = 52 / $n; $ink = imagecolorallocate($im, RCPT_INK[0], RCPT_INK[1], RCPT_INK[2]);
        foreach ($mx as $qy => $qrow) foreach ($qrow as $qx => $on) if ($on)
            imagefilledrectangle($im, (int)round(($L + 5 + $qx * $cell) * $k), (int)round(($fy + 5 + $qy * $cell) * $k), (int)round(($L + 5 + ($qx + 1) * $cell) * $k) - 1, (int)round(($fy + 5 + ($qy + 1) * $cell) * $k) - 1, $ink);
    }
    receipt_text($im, 'Verify this receipt', $L + 76, $fy + 14, 13.5, 'b', RCPT_INK);
    $vy = receipt_para($im, 'Scan it, or open ' . preg_replace('#^https?://#', '', doc_origin()) . '/verify and enter the number and check code.', $L + 76, $fy + 35, 12.5, 'r', RCPT_INK, 360, 18);
    receipt_text($im, doc_code_line($doc), $L + 76, $vy + 22, 12, 's', RCPT_MUTE);
    $sx = $L + 479;
    receipt_rect($im, $sx, $fy + 22, $R - $sx, 1.2, RCPT_INK);
    receipt_text($im, (string)$s['feesOfficer'], $sx, $fy + 42, 13, 's', RCPT_INK);
    receipt_para($im, 'Fees Officer, for ' . $s['legalName'], $sx, $fy + 61, 12, 'r', RCPT_MUTE, $R - $sx, 16);
    $gy = max($vy + 52, $fy + 100);
    receipt_rect($im, $L, $gy, $R - $L, 1, RCPT_RULE);
    $who = implode(' · ', array_filter([$s['legalName'], $s['address'], implode(' · ', array_filter([$s['feesEmail'], $s['feesPhone']]))]));
    $ly = receipt_para($im, $who . '. Computer-generated receipt, valid without signature or stamp. Fees are governed by the NGG fees policy accepted at enrolment. Keep for your records.', $L, $gy + 22, 11, 'r', RCPT_MUTE, 560, 16);
    receipt_text($im, 'Page 1 of 1', $R, $gy + 22, 11, 'r', RCPT_MUTE, 'right');
    return [$im, $ly + 30];
}

/** The receipt as a PNG, cropped to the receipt (no empty A4 tail): for sharing on a phone. */
function receipt_png(array $doc): string {
    [$im, $used] = receipt_draw($doc);
    $h = (int)min(imagesy($im), ceil($used * RCPT_SCALE));
    $crop = imagecreatetruecolor(imagesx($im), $h);
    imagecopy($crop, $im, 0, 0, 0, 0, imagesx($im), $h);
    imagedestroy($im);
    ob_start(); imagepng($crop, null, 6); imagedestroy($crop);
    return (string)ob_get_clean();
}

/** The receipt as an A4 PDF: the same drawing, placed on the page. */
function receipt_pdf(array $doc): string {
    [$im] = receipt_draw($doc);
    ob_start(); imagejpeg($im, null, 92); $jpg = (string)ob_get_clean();
    $w = imagesx($im); $h = imagesy($im); imagedestroy($im);
    $d = doc_data($doc);
    $kobo = array_sum(array_column($d['lines'] ?? [], 'kobo'));
    return receipt_pdf_wrap($jpg, $w, $h, [
        'Title' => 'Receipt ' . $doc['docNo'], 'Author' => (string)doc_org_for($d)['legalName'],
        'Subject' => 'Payment of ' . number_format($kobo / 100, 2) . ' naira for ' . (string)(($d['member'] ?? [])['name'] ?? ''),
        'Keywords' => implode(', ', array_filter([(string)$doc['docNo'], (string)($d['invoiceNo'] ?? ''), (string)($d['ref'] ?? '')])),
        'Creator' => 'NGG documents (receipt-draw.php)',
    ]);
}

/**
 * A one-page PDF 1.4 holding one JPEG on an A4 page. Hand-written, standard:
 * catalog, pages, page, image XObject (DCTDecode), content stream, info, xref.
 */
function receipt_pdf_wrap(string $jpg, int $pxW, int $pxH, array $info): string {
    $pw = 595.28; $ph = 841.89;
    $esc = static function (string $s): string {
        // A PDF text string in UTF-16BE with a BOM, so names with accents survive in the metadata.
        $u = mb_convert_encoding($s, 'UTF-16BE', 'UTF-8');
        return '<FEFF' . strtoupper(bin2hex($u)) . '>';
    };
    $content = sprintf("q %.2F 0 0 %.2F 0 0 cm /Im1 Do Q\n", $pw, $ph);
    $info['CreationDate'] = 'D:' . gmdate('YmdHis') . 'Z';
    $infoDict = '<< ' . implode(' ', array_map(static fn($k, $v) => '/' . $k . ' ' . ($k === 'CreationDate' ? '(' . $v . ')' : $esc((string)$v)), array_keys($info), $info)) . ' >>';
    $objs = [
        1 => '<< /Type /Catalog /Pages 2 0 R >>',
        2 => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3 => sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>', $pw, $ph),
        4 => "<< /Type /XObject /Subtype /Image /Width $pxW /Height $pxH /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($jpg) . " >>\nstream\n" . $jpg . "\nendstream",
        5 => '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "endstream",
        6 => $infoDict,
    ];
    $out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; $off = [];
    foreach ($objs as $n => $body) { $off[$n] = strlen($out); $out .= $n . " 0 obj\n" . $body . "\nendobj\n"; }
    $xref = strlen($out);
    $out .= "xref\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n";
    foreach ($off as $o) $out .= sprintf("%010d 00000 n \n", $o);
    $out .= "trailer\n<< /Size " . (count($objs) + 1) . " /Root 1 0 R /Info 6 0 R >>\nstartxref\n" . $xref . "\n%%EOF\n";
    return $out;
}

/** Send a receipt download: as = pdf | png. Exits. */
function receipt_send(array $doc, string $as): void {
    if (!receipt_available()) { http_response_code(503); header('Content-Type: text/plain; charset=utf-8'); echo 'Receipts cannot be drawn on this server (PHP GD with FreeType is missing). Use "Print or save as PDF" on the receipt page.'; exit; }
    $name = 'NGG-receipt-' . preg_replace('/[^A-Za-z0-9-]/', '', (string)$doc['docNo']);
    $body = $as === 'png' ? receipt_png($doc) : receipt_pdf($doc);
    header('Content-Type: ' . ($as === 'png' ? 'image/png' : 'application/pdf'));
    header('Content-Disposition: attachment; filename="' . $name . ($as === 'png' ? '.png' : '.pdf') . '"');
    header('Content-Length: ' . strlen($body));
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex');
    echo $body;
    exit;
}
