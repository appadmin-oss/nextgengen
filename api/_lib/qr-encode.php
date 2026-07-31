<?php
declare(strict_types=1);

/**
 * A QR encoder, on the server.
 *
 * WHY THIS EXISTS
 *
 * Mail clients strip `data:` URIs, so a QR inside an email has to be a hosted
 * PNG. Every QR this codebase drew was drawn by a browser — the card studio, the
 * kiosk, the resend dialog — which is fine while a human is looking at a screen
 * and useless for the case that matters most: an ID issued at two in the morning
 * because a parent finally clicked the consent link. There was no browser to
 * borrow, so that family got a link and no code.
 *
 * The workaround was to have the card studio lend its encoder for the whole
 * roster. That works, and it is still there as a cache, but it means the first
 * automatic email after a deploy carries a link alone and nobody can tell which
 * families those were. A programme should not have to remember to open a screen
 * for its emails to be complete.
 *
 * SCOPE, DELIBERATELY NARROW
 *
 * Byte mode, error-correction level M, versions 1–20. That is the whole problem
 * this has: the payload is always `https://host/q/TOKEN`, which is 30–60 bytes,
 * and version 4 alone would carry it. Twenty versions is headroom for a long
 * hostname, not ambition. No kanji mode, no alphanumeric optimisation, no
 * structured append — every one of those is a source of bugs in exchange for
 * nothing, because the input is a URL and it is always a URL.
 *
 * Level M matches what the browser encoder uses (`qrcode(0, "M")`), so a code
 * produced here and a code produced there are the same code. That is not a
 * detail: the kiosks decode these, and two encoders disagreeing about error
 * correction would be found at a gate on a Saturday morning.
 *
 * VERIFICATION
 *
 * Nothing about this is verified by reading it. `tests/scanners.test.js` renders
 * the server's PNG and decodes it with jsQR — the same decoder the kiosks load —
 * and asserts the text comes back byte-identical, alongside the browser encoder's
 * output for the same payload. An encoder is only correct if a real reader agrees.
 */

/* ── Tables ───────────────────────────────────────────────────────────────────
 * From ISO/IEC 18004. Transcribed rather than computed: the block structure and
 * the BCH-coded format/version strings are not derivable at a glance, and a
 * subtly wrong table produces a QR that scans on one phone and not another.
 * Every row here is cross-checked by an assertion in qr_self_check().
 */

/** Level M: [ecPerBlock, group1Blocks, group1Data, group2Blocks, group2Data] */
const QR_M_BLOCKS = [
    1  => [10, 1, 16, 0, 0],
    2  => [16, 1, 28, 0, 0],
    3  => [26, 1, 44, 0, 0],
    4  => [18, 2, 32, 0, 0],
    5  => [24, 2, 43, 0, 0],
    6  => [16, 4, 27, 0, 0],
    7  => [18, 4, 31, 0, 0],
    8  => [22, 2, 38, 2, 39],
    9  => [22, 3, 36, 2, 37],
    10 => [26, 4, 43, 1, 44],
    11 => [30, 1, 50, 4, 51],
    12 => [22, 6, 36, 2, 37],
    13 => [22, 8, 37, 1, 38],
    14 => [24, 4, 40, 5, 41],
    15 => [24, 5, 41, 5, 42],
    16 => [28, 7, 45, 3, 46],
    17 => [28, 10, 46, 1, 47],
    18 => [26, 9, 43, 4, 44],
    19 => [26, 3, 44, 11, 45],
    20 => [26, 3, 41, 13, 42],
];

/** Alignment-pattern centre coordinates per version (level-independent). */
const QR_ALIGN = [
    1 => [], 2 => [6, 18], 3 => [6, 22], 4 => [6, 26], 5 => [6, 30], 6 => [6, 34],
    7 => [6, 22, 38], 8 => [6, 24, 42], 9 => [6, 26, 46], 10 => [6, 28, 50],
    11 => [6, 30, 54], 12 => [6, 32, 58], 13 => [6, 34, 62],
    14 => [6, 26, 46, 66], 15 => [6, 26, 48, 70], 16 => [6, 26, 50, 74],
    17 => [6, 30, 54, 78], 18 => [6, 30, 56, 82], 19 => [6, 30, 58, 86],
    20 => [6, 34, 62, 90],
];

/** 18-bit BCH version information, versions 7+. */
const QR_VERSION_BITS = [
    7 => 0x07C94, 8 => 0x085BC, 9 => 0x09A99, 10 => 0x0A4D3, 11 => 0x0BBF6,
    12 => 0x0C762, 13 => 0x0D847, 14 => 0x0E60D, 15 => 0x0F928, 16 => 0x10B78,
    17 => 0x1145D, 18 => 0x12A17, 19 => 0x13532, 20 => 0x149A6,
];

/** 15-bit BCH format information for level M, indexed by mask 0–7. */
const QR_FORMAT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

/* ── GF(256) ──────────────────────────────────────────────────────────────── */

/** Log/antilog tables for the field with primitive polynomial 0x11D. */
function qr_gf(): array {
    static $t = null;
    if ($t !== null) return $t;
    $exp = array_fill(0, 512, 0); $log = array_fill(0, 256, 0);
    $x = 1;
    for ($i = 0; $i < 255; $i++) {
        $exp[$i] = $x;
        $log[$x] = $i;
        $x <<= 1;
        if ($x & 0x100) $x ^= 0x11D;
    }
    for ($i = 255; $i < 512; $i++) $exp[$i] = $exp[$i - 255];
    return $t = [$exp, $log];
}

function qr_gf_mul(int $a, int $b): int {
    if ($a === 0 || $b === 0) return 0;
    [$exp, $log] = qr_gf();
    return $exp[$log[$a] + $log[$b]];
}

/** The generator polynomial for `n` error-correction codewords. */
function qr_rs_generator(int $n): array {
    $g = [1];
    [$exp] = qr_gf();
    for ($i = 0; $i < $n; $i++) {
        // multiply g(x) by (x - a^i)
        $next = array_fill(0, count($g) + 1, 0);
        foreach ($g as $j => $c) {
            $next[$j] ^= qr_gf_mul($c, $exp[$i]);
            $next[$j + 1] ^= $c;
        }
        $g = $next;
    }
    /* Reversed, because the loop above accumulates lowest-degree-first and the
     * synthetic division below expects the LEADING (monic) coefficient at index 0.
     * Built the other way the polynomial is still correct — its α-exponents read
     * 45 32 94 … 251 0 against the published 0 251 … 32 45 — and every codeword it
     * produces is wrong, which is invisible until a reader refuses the code. */
    return array_reverse($g);
}

/** Reed–Solomon remainder: the EC codewords for one data block. */
function qr_rs_encode(array $data, int $ecLen): array {
    $gen = qr_rs_generator($ecLen);
    $res = array_merge($data, array_fill(0, $ecLen, 0));
    $n = count($data);
    for ($i = 0; $i < $n; $i++) {
        $factor = $res[$i];
        if ($factor === 0) continue;
        foreach ($gen as $j => $g) {
            if ($i + $j < count($res)) $res[$i + $j] ^= qr_gf_mul($g, $factor);
        }
    }
    return array_slice($res, $n, $ecLen);
}

/* ── Bit stream ───────────────────────────────────────────────────────────── */

/** Byte capacity for level M at a version, derived rather than tabulated so the
 *  two cannot disagree. */
function qr_capacity(int $version): int {
    [$ec, $b1, $d1, $b2, $d2] = QR_M_BLOCKS[$version];
    $dataCodewords = $b1 * $d1 + $b2 * $d2;
    $countBits = $version >= 10 ? 16 : 8;
    return $dataCodewords - (int)ceil((4 + $countBits) / 8);
}

/** The smallest version that holds `$len` bytes at level M, or 0. */
function qr_pick_version(int $len): int {
    foreach (array_keys(QR_M_BLOCKS) as $v) {
        if ($len <= qr_capacity($v)) return $v;
    }
    return 0;
}

/* ── The matrix ───────────────────────────────────────────────────────────── */

/**
 * Build the module matrix for a payload.
 *
 * Returns [size, matrix] where matrix[row][col] is 0 or 1. Function patterns,
 * data placement, mask selection and format/version information all happen here,
 * in the order the specification requires — the format bits depend on the chosen
 * mask, and the mask is chosen by scoring the finished matrix.
 */
function qr_matrix(string $text): array {
    $len = strlen($text);
    $version = qr_pick_version($len);
    if ($version === 0) return [0, []];

    [$ecLen, $b1, $d1, $b2, $d2] = QR_M_BLOCKS[$version];
    $countBits = $version >= 10 ? 16 : 8;
    $dataCodewords = $b1 * $d1 + $b2 * $d2;

    // ── bit stream: mode (byte = 0100), length, payload, terminator, padding ──
    $bits = '';
    $bits .= '0100';
    $bits .= str_pad(decbin($len), $countBits, '0', STR_PAD_LEFT);
    for ($i = 0; $i < $len; $i++) $bits .= str_pad(decbin(ord($text[$i])), 8, '0', STR_PAD_LEFT);
    $totalBits = $dataCodewords * 8;
    // Terminator: up to four zeros, but never past the capacity.
    $bits .= str_repeat('0', min(4, $totalBits - strlen($bits)));
    // Pad to a byte boundary, then alternate the two specified pad codewords.
    if (strlen($bits) % 8) $bits .= str_repeat('0', 8 - strlen($bits) % 8);
    $pad = ['11101100', '00010001']; $pi = 0;
    while (strlen($bits) < $totalBits) { $bits .= $pad[$pi % 2]; $pi++; }

    $codewords = [];
    for ($i = 0; $i < $totalBits; $i += 8) $codewords[] = bindec(substr($bits, $i, 8));

    // ── split into blocks, compute EC, interleave ────────────────────────────
    $blocks = []; $off = 0;
    for ($i = 0; $i < $b1; $i++) { $blocks[] = array_slice($codewords, $off, $d1); $off += $d1; }
    for ($i = 0; $i < $b2; $i++) { $blocks[] = array_slice($codewords, $off, $d2); $off += $d2; }
    $ecBlocks = array_map(fn($b) => qr_rs_encode($b, $ecLen), $blocks);

    /* Interleaved by column, which is what makes a burst of damage spread across
       blocks instead of destroying one. Short blocks simply have no entry in the
       final column. */
    $final = [];
    $maxData = max(array_map('count', $blocks));
    for ($i = 0; $i < $maxData; $i++) {
        foreach ($blocks as $b) if (isset($b[$i])) $final[] = $b[$i];
    }
    for ($i = 0; $i < $ecLen; $i++) {
        foreach ($ecBlocks as $b) if (isset($b[$i])) $final[] = $b[$i];
    }

    // ── function patterns ────────────────────────────────────────────────────
    $size = 21 + ($version - 1) * 4;
    $m = array_fill(0, $size, array_fill(0, $size, 0));
    $fixed = array_fill(0, $size, array_fill(0, $size, false));   // reserved, not for data
    $set = function (int $r, int $c, int $v, bool $reserve = true) use (&$m, &$fixed, $size) {
        if ($r < 0 || $c < 0 || $r >= $size || $c >= $size) return;
        $m[$r][$c] = $v;
        if ($reserve) $fixed[$r][$c] = true;
    };

    // Finders + separators, at the three corners.
    foreach ([[0, 0], [0, $size - 7], [$size - 7, 0]] as [$fr, $fc]) {
        for ($r = -1; $r <= 7; $r++) {
            for ($c = -1; $c <= 7; $c++) {
                $rr = $fr + $r; $cc = $fc + $c;
                if ($rr < 0 || $cc < 0 || $rr >= $size || $cc >= $size) continue;
                $inRing = ($r >= 0 && $r <= 6 && ($c === 0 || $c === 6))
                       || ($c >= 0 && $c <= 6 && ($r === 0 || $r === 6));
                $inCore = $r >= 2 && $r <= 4 && $c >= 2 && $c <= 4;
                $set($rr, $cc, ($inRing || $inCore) ? 1 : 0);
            }
        }
    }
    // Timing patterns.
    for ($i = 8; $i < $size - 8; $i++) {
        $set(6, $i, $i % 2 === 0 ? 1 : 0);
        $set($i, 6, $i % 2 === 0 ? 1 : 0);
    }
    // Alignment patterns, skipping the three that would land on a finder.
    $centres = QR_ALIGN[$version];
    foreach ($centres as $ar) {
        foreach ($centres as $ac) {
            $nearFinder = ($ar <= 8 && $ac <= 8) || ($ar <= 8 && $ac >= $size - 9) || ($ar >= $size - 9 && $ac <= 8);
            if ($nearFinder) continue;
            for ($r = -2; $r <= 2; $r++) {
                for ($c = -2; $c <= 2; $c++) {
                    $edge = abs($r) === 2 || abs($c) === 2;
                    $set($ar + $r, $ac + $c, ($edge || ($r === 0 && $c === 0)) ? 1 : 0);
                }
            }
        }
    }
    /* Reserve the format areas, THEN the dark module — in that order.
     *
     * Two bugs lived in these four lines, and both produce a code no reader will
     * decode rather than one that decodes imperfectly:
     *
     *  · Index 6 is SKIPPED on both strips. The format area runs along row 8 and
     *    column 8; the timing patterns run along row 6 and column 6. They cross,
     *    and the timing module wins. Reserving the crossing as format blanked the
     *    timing modules at (6,8) and (8,6).
     *  · The dark module at (size-8, 8) is set AFTER the reservation loops. Set
     *    before, the loop that reserves the lower vertical strip walked straight
     *    over it and wrote a zero. */
    for ($i = 0; $i < 9; $i++) {
        if ($i === 6) continue;
        $set(8, $i, 0); $set($i, 8, 0);
    }
    for ($i = 0; $i < 8; $i++) { $set(8, $size - 1 - $i, 0); $set($size - 1 - $i, 8, 0); }
    $set($size - 8, 8, 1);
    // Version information area (v7+), reserved before data placement.
    if ($version >= 7) {
        for ($i = 0; $i < 18; $i++) {
            $set(intdiv($i, 3), $size - 11 + $i % 3, 0);
            $set($size - 11 + $i % 3, intdiv($i, 3), 0);
        }
    }

    // ── data placement: two-column zigzag from the bottom right ──────────────
    $dataBits = '';
    foreach ($final as $cw) $dataBits .= str_pad(decbin($cw), 8, '0', STR_PAD_LEFT);
    $bi = 0; $up = true;
    for ($col = $size - 1; $col > 0; $col -= 2) {
        if ($col === 6) $col--;                 // the vertical timing column is skipped entirely
        for ($n = 0; $n < $size; $n++) {
            $row = $up ? $size - 1 - $n : $n;
            foreach ([$col, $col - 1] as $c) {
                if ($fixed[$row][$c]) continue;
                $m[$row][$c] = ($bi < strlen($dataBits) && $dataBits[$bi] === '1') ? 1 : 0;
                $bi++;
            }
        }
        $up = !$up;
    }

    // ── mask selection: apply each, score, keep the best ─────────────────────
    $best = null; $bestScore = PHP_INT_MAX; $bestMask = 0;
    for ($mask = 0; $mask < 8; $mask++) {
        $cand = $m;
        for ($r = 0; $r < $size; $r++) {
            for ($c = 0; $c < $size; $c++) {
                if ($fixed[$r][$c]) continue;
                if (qr_mask_bit($mask, $r, $c)) $cand[$r][$c] ^= 1;
            }
        }
        qr_write_format($cand, $size, $mask, $version);
        $score = qr_penalty($cand, $size);
        if ($score < $bestScore) { $bestScore = $score; $best = $cand; $bestMask = $mask; }
    }
    return [$size, $best];
}

function qr_mask_bit(int $mask, int $i, int $j): bool {
    switch ($mask) {
        case 0: return ($i + $j) % 2 === 0;
        case 1: return $i % 2 === 0;
        case 2: return $j % 3 === 0;
        case 3: return ($i + $j) % 3 === 0;
        case 4: return (intdiv($i, 2) + intdiv($j, 3)) % 2 === 0;
        case 5: return (($i * $j) % 2) + (($i * $j) % 3) === 0;
        case 6: return ((($i * $j) % 2) + (($i * $j) % 3)) % 2 === 0;
        default: return (((($i + $j) % 2) + (($i * $j) % 3)) % 2) === 0;
    }
}

/**
 * Format (and, from v7, version) information into the reserved areas.
 *
 * The placement is transcribed from the specification's two copies exactly, in the
 * bit order the reference implementations use (bit 0 first). The first draft here
 * mixed the two conventions — the vertical copy read as though bit 0 were at the
 * top and the horizontal copy as though it were at the right — so the two copies
 * disagreed and every reader rejected the code. There is no partial credit for
 * this: format info is how a decoder learns the mask, and a wrong mask makes the
 * data region noise.
 */
function qr_write_format(array &$m, int $size, int $mask, int $version): void {
    $fmt = QR_FORMAT_M[$mask];
    // Vertical copy, down the left of the top-left finder and up from the bottom.
    for ($i = 0; $i < 15; $i++) {
        $bit = ($fmt >> $i) & 1;
        if ($i < 6)      $m[$i][8] = $bit;
        elseif ($i < 8)  $m[$i + 1][8] = $bit;
        else             $m[$size - 15 + $i][8] = $bit;
    }
    // Horizontal copy, right to left along row 8.
    for ($i = 0; $i < 15; $i++) {
        $bit = ($fmt >> $i) & 1;
        if ($i < 8)      $m[8][$size - 1 - $i] = $bit;
        elseif ($i < 9)  $m[8][8] = $bit;
        else             $m[8][14 - $i] = $bit;
    }
    // The dark module is part of the format area's geometry, so it is re-asserted
    // here rather than trusted to have survived data placement.
    $m[$size - 8][8] = 1;
    if ($version >= 7) {
        /* Version information, two copies. Bit i goes to (floor(i/3), size-11+i%3)
         * and its mirror. The first draft wrote `5 - floor(i/3)` for the row, which
         * reverses the three-row block: versions 1–6 have no version area at all so
         * every code up to 41×41 decoded, and version 7 upward decoded on nothing.
         * A bug that only appears past a size threshold is the kind a short test
         * payload never reaches. */
        $vb = QR_VERSION_BITS[$version];
        for ($i = 0; $i < 18; $i++) {
            $bit = ($vb >> $i) & 1;
            $m[intdiv($i, 3)][$size - 11 + $i % 3] = $bit;
            $m[$size - 11 + $i % 3][intdiv($i, 3)] = $bit;
        }
    }
}

/** The four penalty rules. Only their relative sizes matter — this picks a mask,
 *  it does not report a number to anybody. */
function qr_penalty(array $m, int $size): int {
    $p = 0;
    // N1 — runs of five or more in a row or column.
    for ($k = 0; $k < 2; $k++) {
        for ($a = 0; $a < $size; $a++) {
            $run = 1; $prev = -1;
            for ($b = 0; $b < $size; $b++) {
                $v = $k === 0 ? $m[$a][$b] : $m[$b][$a];
                if ($v === $prev) { $run++; if ($run === 5) $p += 3; elseif ($run > 5) $p += 1; }
                else { $run = 1; $prev = $v; }
            }
        }
    }
    // N2 — 2x2 blocks of one colour.
    for ($r = 0; $r < $size - 1; $r++) {
        for ($c = 0; $c < $size - 1; $c++) {
            $v = $m[$r][$c];
            if ($v === $m[$r][$c + 1] && $v === $m[$r + 1][$c] && $v === $m[$r + 1][$c + 1]) $p += 3;
        }
    }
    // N3 — the 1:1:3:1:1 finder-lookalike, with four light modules either side.
    $pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    $pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for ($k = 0; $k < 2; $k++) {
        for ($a = 0; $a < $size; $a++) {
            for ($b = 0; $b <= $size - 11; $b++) {
                $hit1 = true; $hit2 = true;
                for ($i = 0; $i < 11; $i++) {
                    $v = $k === 0 ? $m[$a][$b + $i] : $m[$b + $i][$a];
                    if ($v !== $pat1[$i]) $hit1 = false;
                    if ($v !== $pat2[$i]) $hit2 = false;
                    if (!$hit1 && !$hit2) break;
                }
                if ($hit1) $p += 40;
                if ($hit2) $p += 40;
            }
        }
    }
    // N4 — deviation of the dark ratio from 50%, per 5%.
    $dark = 0;
    for ($r = 0; $r < $size; $r++) $dark += array_sum($m[$r]);
    $ratio = $dark * 100 / ($size * $size);
    $p += (int)(floor(abs($ratio - 50) / 5) * 10);
    return $p;
}

/* ── PNG output ───────────────────────────────────────────────────────────── */

/**
 * A 1-bit greyscale PNG, written by hand.
 *
 * No GD. It is usually present and it is not always present, and "the ID email
 * has no QR on this host" is a bad way to find out which — this needs nothing but
 * zlib, which is core. One-bit greyscale keeps a 25-module code at 8px per module
 * under a kilobyte, which matters when it is being fetched by a mail client on a
 * phone.
 */
function qr_png(array $matrix, int $size, int $scale = 8, int $quiet = 4): string {
    $px = ($size + $quiet * 2) * $scale;
    $rowBytes = (int)ceil($px / 8);
    $raw = '';
    for ($y = 0; $y < $px; $y++) {
        $row = array_fill(0, $rowBytes, 0xFF);          // 1 = white in 1-bit grey
        $my = intdiv($y, $scale) - $quiet;
        if ($my >= 0 && $my < $size) {
            for ($x = 0; $x < $px; $x++) {
                $mx = intdiv($x, $scale) - $quiet;
                if ($mx < 0 || $mx >= $size) continue;
                if ($matrix[$my][$mx]) $row[intdiv($x, 8)] &= ~(0x80 >> ($x % 8));
            }
        }
        $raw .= "\x00" . implode('', array_map('chr', $row));   // filter byte 0
    }
    $chunk = function (string $type, string $data): string {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    };
    return "\x89PNG\r\n\x1a\n"
        . $chunk('IHDR', pack('NN', $px, $px) . chr(1) . chr(0) . chr(0) . chr(0) . chr(0))
        . $chunk('IDAT', gzcompress($raw, 9))
        . $chunk('IEND', '');
}

/**
 * The one function callers want: payload in, PNG bytes out.
 *
 * Returns '' rather than throwing. A missing QR in an email is a degraded
 * message; an exception on the consent path would be a family who cannot
 * register, and the two are not close in cost.
 */
function qr_encode_png(string $text, int $scale = 8): string {
    try {
        /* No magic ceiling: qr_pick_version() already returns 0 for anything the
         * supported versions cannot hold, and a hand-picked 600 was both wrong
         * (version 20 carries 666) and a second place for the limit to live. */
        if ($text === '') return '';
        [$size, $m] = qr_matrix($text);
        if ($size === 0 || !$m) return '';
        return qr_png($m, $size, max(2, min(16, $scale)));
    } catch (Throwable $e) {
        error_log('[qr] encode failed: ' . $e->getMessage());
        return '';
    }
}

/**
 * Internal consistency check for the transcribed tables, so a typo in one is
 * found by the test suite rather than by a phone at a gate. Returns a list of
 * problems; empty means the tables agree with themselves.
 */
function qr_self_check(): array {
    $bad = [];
    // Total codewords per version, from the specification, against the blocks.
    $totals = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581,
               655, 733, 815, 901, 991, 1085];
    foreach (QR_M_BLOCKS as $v => [$ec, $b1, $d1, $b2, $d2]) {
        $got = $b1 * ($d1 + $ec) + $b2 * ($d2 + $ec);
        if ($got !== $totals[$v - 1]) $bad[] = "v$v codewords $got != {$totals[$v - 1]}";
        if (!isset(QR_ALIGN[$v])) $bad[] = "v$v has no alignment row";
        if ($v >= 7 && !isset(QR_VERSION_BITS[$v])) $bad[] = "v$v has no version bits";
    }
    if (count(QR_FORMAT_M) !== 8) $bad[] = 'format table is not 8 long';
    return $bad;
}
