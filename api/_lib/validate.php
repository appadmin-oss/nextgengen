<?php
declare(strict_types=1);

/**
 * Tiny validator — sane runtime checks before we round-trip Apps Script.
 *
 * Usage:
 *   v_require($body, ['identifier', 'token']);
 *   v_email($body['email']);
 *   v_in($body['type'], ['Summer', 'NGG']);
 *   v_max($body['title'], 200);
 *   v_id($body['memberId'], 'NGG');   // matches NGG-2025-0042
 */

function v_require(array $body, array $keys): void {
    foreach ($keys as $k) {
        if (!isset($body[$k]) || $body[$k] === '' || $body[$k] === null) {
            json_error('missing_field:' . $k, 422);
        }
    }
}

function v_email($v): string {
    $v = trim((string)$v);
    if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
        json_error('bad_email', 422);
    }
    if (strlen($v) > 200) json_error('email_too_long', 422);
    return $v;
}

function v_in($v, array $allowed): string {
    $v = (string)$v;
    if (!in_array($v, $allowed, true)) json_error('bad_value', 422);
    return $v;
}

function v_max($v, int $max): string {
    $v = (string)$v;
    if (mb_strlen($v) > $max) json_error('too_long', 422);
    return $v;
}

function v_min($v, int $min): string {
    $v = (string)$v;
    if (mb_strlen($v) < $min) json_error('too_short', 422);
    return $v;
}

function v_int($v, ?int $min = null, ?int $max = null): int {
    if (!is_numeric($v)) json_error('bad_int', 422);
    $n = (int)$v;
    if ($min !== null && $n < $min) json_error('int_too_small', 422);
    if ($max !== null && $n > $max) json_error('int_too_large', 422);
    return $n;
}

function v_id($v, ?string $prefix = null): string {
    $v = trim((string)$v);
    // Format: PREFIX-YYYY-NNNN where prefix is 3-6 uppercase letters.
    if (!preg_match('/^[A-Z]{2,6}-\d{4}-\d{3,5}$/', $v)) {
        json_error('bad_id_format', 422);
    }
    if ($prefix !== null && stripos($v, $prefix . '-') !== 0) {
        json_error('bad_id_prefix', 422);
    }
    return $v;
}

function v_safe_text($v, int $max = 5000): string {
    $v = (string)$v;
    if (mb_strlen($v) > $max) json_error('too_long', 422);
    // Strip control characters except \n \r \t.
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $v);
    return $v;
}

function v_url($v): string {
    $v = trim((string)$v);
    if ($v === '') return '';
    if (!filter_var($v, FILTER_VALIDATE_URL)) json_error('bad_url', 422);
    if (strlen($v) > 2048) json_error('url_too_long', 422);
    // Only http(s) — block javascript:, data:, etc.
    if (!preg_match('#^https?://#i', $v)) json_error('bad_url_scheme', 422);
    return $v;
}
