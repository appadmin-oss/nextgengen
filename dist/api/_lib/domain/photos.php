<?php
declare(strict_types=1);

/**
 * Photo pipeline — a governed image asset with its own lifecycle.
 *
 * Division of labour (cost-aware):
 *   • FREE vision AI (ai_photo_review) *points out problems* → gives Cloudinary
 *     a clear, minimal job and keeps analysis off Cloudinary's credit meter.
 *   • Cloudinary does the EDITING only: always a general optimization pass
 *     (exposure, colour, sharpness, face-framed crop), plus a credit-costed
 *     background replacement when the free analysis flags a busy background AND
 *     credits remain. Editing ENHANCES but never ALTERS the person — no
 *     generative face reconstruction (see cloudinary_edit's identity rule).
 *   • A human can still review any edit later; serious flags route to the
 *     editor queue before use.
 *   • Any failure — credit exhaustion, provider down — alerts humans on every
 *     integrated channel (email + Google Chat + webhooks, via the bus).
 *
 * Issuance (QR + printed ID) is gated on an approved asset elsewhere.
 */

/* ── Cloudinary editing (delivery-URL transforms) ─────────────────────────── */

/** Insert a transform chain right after /upload/ in a Cloudinary delivery URL. */
function cloudinary_apply(string $url, string $transform): string {
    if ($transform === '' || strpos($url, '/upload/') === false) return $url;
    return preg_replace('#/upload/#', '/upload/' . $transform . '/', $url, 1) ?? $url;
}

/**
 * Build the edited delivery URL. The base is ALWAYS a professional-grade
 * optimization + face crop; the only credit-costed AI step is background
 * replacement (added when recommended and $creditsOk). Returns
 * [url, transforms, aiUsed].
 *
 * IDENTITY-PRESERVATION RULE (non-negotiable): the pipeline may ENHANCE a
 * photo but must never ALTER the person. Every transform here is either a
 * non-generative adjustment of the *existing* pixels (exposure, colour,
 * sharpness, reframing) or a background swap that leaves the subject untouched.
 * We deliberately do NOT use generative operations — no e_gen_restore, no
 * generative upscale, no gen_replace/recolor — because those reconstruct
 * facial detail and can change how a face looks. A soft but real face is
 * always preferred over a sharpened but invented one; genuinely unusable
 * images are sent back for a retake by a human, not "fixed" by generative AI.
 */
function cloudinary_edit(string $sourceUrl, array $rec, bool $creditsOk): array {
    // General optimization + a tidy, face-framed crop — always applied and all
    // non-generative (they reframe/adjust the existing pixels only).
    $base = 'c_fill,g_face,w_600,h_750,f_auto,q_auto:good,e_improve:30';
    if (!empty($rec['brighten'])) $base .= ',e_brightness:18';
    // Perceived-detail recovery for soft/low-res captures — an unsharp mask,
    // NOT generative reconstruction. Enhances edges that are already there.
    if (!empty($rec['sharpen']))  $base .= ',e_sharpen:80';
    $chain = [$base];
    $aiUsed = false;
    if ($creditsOk) {
        // Background replacement isolates the subject against a clean studio
        // backdrop — it changes the environment, never the face. Identity safe.
        if (!empty($rec['removeBackground'])) { $chain[] = 'e_background_removal'; $chain[] = 'b_rgb:ffffff'; $aiUsed = true; }
    }
    $transforms = implode('/', $chain);
    return ['url' => cloudinary_apply($sourceUrl, $transforms), 'transforms' => $transforms, 'aiUsed' => $aiUsed];
}

/* ── Credit guard + refresh ───────────────────────────────────────────────── */

/** Cheap read of the cached credit state. Defaults to OK (never blocks blind). */
function cloudinary_credits_ok(): bool {
    return setting_raw('cloudinary_credits') !== 'exhausted';
}

/**
 * Poll Cloudinary's usage (Admin API) and cache an OK/exhausted flag; alert
 * once when it crosses the threshold. Admin-triggerable + cron-friendly.
 * Test seam: $GLOBALS['__cloudinary_usage_mock'] → returns a 0–100 percent.
 */
function cloudinary_refresh_usage(): array {
    $cfg = $GLOBALS['CONFIG']['cloudinary'] ?? [];
    $guard = $cfg['credit_guard'] ?? [];
    if (empty($guard['enabled'])) return ['ok' => true, 'checked' => false];
    $threshold = (int)($guard['threshold_pct'] ?? 90);
    $pct = null;
    if (isset($GLOBALS['__cloudinary_usage_mock']) && is_callable($GLOBALS['__cloudinary_usage_mock'])) {
        $pct = (int)($GLOBALS['__cloudinary_usage_mock'])();
    } elseif (!empty($cfg['cloud_name']) && !empty($cfg['api_key']) && !empty($cfg['api_secret']) && function_exists('curl_init')) {
        $ch = curl_init('https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/usage');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_USERPWD => $cfg['api_key'] . ':' . $cfg['api_secret']]);
        $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        if ($out !== false && $code >= 200 && $code < 300) {
            $j = json_decode((string)$out, true);
            $used = (float)($j['credits']['usage'] ?? 0);
            $limit = (float)($j['credits']['limit'] ?? 0);
            if ($limit > 0) $pct = (int)round($used / $limit * 100);
        } elseif ($code === 420 || $code === 429) {
            $pct = 100; // rate/credit ceiling hit
        }
    }
    if ($pct === null) return ['ok' => true, 'checked' => false];
    $exhausted = $pct >= $threshold;
    setting_set('cloudinary_credits', $exhausted ? 'exhausted' : 'ok', 'system');
    setting_set('cloudinary_credits_pct', (string)$pct, 'system');
    if ($exhausted) photo_pipeline_alert('cloudinary_credits_low', ['usagePct' => $pct, 'threshold' => $threshold]);
    return ['ok' => true, 'checked' => true, 'pct' => $pct, 'exhausted' => $exhausted];
}

/* ── Alerts — email + Google Chat + every integrated platform ─────────────── */

/**
 * Notify humans of a pipeline problem on every channel. Throttled to once per
 * reason per hour so a sustained failure doesn't flood inboxes.
 */
function photo_pipeline_alert(string $reason, array $detail = []): void {
    $key = 'palert_' . preg_replace('/[^a-z_]/', '', $reason);
    $lastAt = (int)(setting_raw($key) ?: 0);
    if (time() - $lastAt < 3600) { // still emit to the bus (deduped downstream), skip repeat email
        @event_emit('photo.pipeline_alert', ['reason' => $reason, 'detail' => $detail, 'throttled' => true]);
        return;
    }
    setting_set($key, (string)time(), 'system');
    $titles = [
        'cloudinary_credits_low' => 'Cloudinary credits are running low',
        'ai_unavailable'         => 'Photo analysis AI is unavailable',
        'pipeline_error'         => 'A photo failed to process',
    ];
    $title = $titles[$reason] ?? 'Photo pipeline alert';
    $lines = [];
    foreach ($detail as $k => $v) $lines[] = '<b>' . esc_html((string)$k) . ':</b> ' . esc_html(is_scalar($v) ? (string)$v : json_encode($v));
    // Bus fan-out → Google Chat, webhooks, Sheets — everything wired.
    @event_emit('photo.pipeline_alert', ['reason' => $reason, 'title' => $title, 'detail' => $detail]);
    // Email the admissions inbox.
    if (function_exists('intake_admin_alert')) {
        intake_admin_alert('[Photo pipeline] ' . $title, [
            'title' => $title,
            'intro' => 'The registration photo pipeline needs attention.',
            'bodyHtml' => '<p style="margin:0 0 10px">Reason: <b>' . esc_html($reason) . '</b></p>'
                . ($lines ? '<p style="margin:0">' . implode('<br>', $lines) . '</p>' : ''),
            'footNote' => 'Automatic alert from the photo pipeline.',
        ]);
    }
    audit('photo.alert', null, $reason, $detail, '');
}

/* ── Ingest + process ─────────────────────────────────────────────────────── */

/** Create a governed asset for a freshly captured image (versions on re-capture). */
function photo_ingest(string $subjectType, string $subjectId, string $sourceUrl, string $byId = ''): array {
    $subjectType = in_array($subjectType, ['student', 'volunteer'], true) ? $subjectType : 'student';
    if ($sourceUrl === '' || !preg_match('#^https://#', $sourceUrl)) return ['ok' => false, 'error' => 'bad_source'];
    $prev = db_row("SELECT id, version FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status NOT IN ('superseded','rejected') ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);
    $version = $prev ? ((int)$prev['version'] + 1) : 1;
    if ($prev) db_update('photo_assets', ['status' => 'superseded', 'updatedAt' => now_iso()], ['id' => $prev['id']]);
    $assetId = 'PH-' . strtoupper(rand_hex(6));
    while (db_row('SELECT id FROM photo_assets WHERE assetId = ?', [$assetId])) $assetId = 'PH-' . strtoupper(rand_hex(6));
    db_insert('photo_assets', [
        'assetId' => $assetId, 'subjectType' => $subjectType, 'subjectId' => $subjectId,
        'version' => $version, 'status' => 'captured', 'sourceUrl' => $sourceUrl,
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    audit('photo.captured', $byId, $assetId, ['subject' => $subjectType . ':' . $subjectId, 'v' => $version], '');
    @event_emit('photo.captured', ['ref' => $assetId, 'subjectType' => $subjectType, 'subjectId' => $subjectId, 'version' => $version]);
    return ['ok' => true, 'assetId' => $assetId, 'version' => $version];
}

/**
 * Run the pipeline for one asset: free AI analysis → Cloudinary edit
 * (credit-gated) → auto-approve clean images or route flagged ones to review.
 * Never throws; failures alert humans and fall through to human review.
 */
function photo_process(string $assetId): array {
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ? LIMIT 1', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array((string)$a['status'], ['captured', 'analyzing'], true)) return ['ok' => true, 'status' => $a['status'], 'noop' => true];
    db_update('photo_assets', ['status' => 'analyzing', 'updatedAt' => now_iso()], ['assetId' => $assetId]);

    $review = ai_photo_review((string)$a['sourceUrl']);
    $score = null; $flags = []; $issues = []; $rec = ['crop' => true]; $provider = '';
    if (!empty($review['ok']) && is_array($review['data'] ?? null)) {
        $d = $review['data'];
        $score = isset($d['score']) ? (int)$d['score'] : null;
        $flags = array_values(array_filter(array_map('strval', is_array($d['flags'] ?? null) ? $d['flags'] : [])));
        $issues = array_values(array_filter(array_map('strval', is_array($d['issues'] ?? null) ? $d['issues'] : [])));
        $rec = is_array($d['recommend'] ?? null) ? $d['recommend'] : $rec;
        $provider = (string)($review['provider'] ?? '');
    } else {
        // Analysis unavailable — Cloudinary still does a safe optimization,
        // but a human MUST review. Alert on the outage.
        $flags = ['ai_unavailable'];
        photo_pipeline_alert('ai_unavailable', ['error' => (string)($review['error'] ?? 'unknown'), 'asset' => $assetId]);
    }
    // Derive Cloudinary intents from flags. Softness/low-res are handled with a
    // non-generative unsharp mask (never generative restore/upscale — see the
    // identity-preservation rule in cloudinary_edit). Very low-res images that
    // sharpening can't save are flagged for a human retake, not reconstructed.
    if (in_array('too_blurry', $flags, true)) $rec['sharpen'] = true;
    if (in_array('low_resolution', $flags, true)) $rec['sharpen'] = true;
    if (in_array('too_dark', $flags, true)) $rec['brighten'] = true;
    // Every ID headshot gets a clean, uniform studio backdrop by default — it is
    // an environment swap that leaves the face untouched (identity safe), and it
    // makes the printed card look consistent regardless of where the photo was
    // taken. Still credit-gated below and switchable off via the setting.
    if (setting_raw('photo_bg_removal') !== '0') $rec['removeBackground'] = true;

    $creditsOk = cloudinary_credits_ok();
    $wantedAi = !empty($rec['removeBackground']);
    if ($wantedAi && !$creditsOk) photo_pipeline_alert('cloudinary_credits_low', ['asset' => $assetId, 'degraded' => true]);
    $edit = cloudinary_edit((string)$a['sourceUrl'], $rec, $creditsOk);

    $serious = array_intersect($flags, ['no_face', 'multiple_faces', 'not_a_child_headshot', 'inappropriate', 'ai_unavailable']);
    $threshold = (int)(setting_raw('photo_review_threshold') ?: 55);
    $autoOk = setting_raw('photo_autoapprove') !== '0';
    $needsHuman = !empty($serious) || ($score !== null && $score < $threshold) || !$autoOk;

    $findings = json_encode(['score' => $score, 'issues' => $issues, 'flags' => $flags, 'recommend' => $rec], JSON_UNESCAPED_SLASHES);
    $row = [
        'editedUrl' => $edit['url'], 'transforms' => $edit['transforms'],
        'aiScore' => $score, 'aiProvider' => $provider, 'aiFindings' => $findings,
        'updatedAt' => now_iso(),
    ];
    if ($needsHuman) {
        $row['status'] = 'pending_review';
    } else {
        $row['status'] = 'approved'; $row['autoApproved'] = 1;
        $row['reviewedBy'] = 'ai-auto'; $row['reviewedAt'] = now_iso();
    }
    db_update('photo_assets', $row, ['assetId' => $assetId]);
    audit('photo.' . ($needsHuman ? 'ai_analyzed' : 'auto_approved'), $provider ? 'ai:' . $provider : 'ai', $assetId, ['score' => $score, 'flags' => $flags, 'aiUsed' => $edit['aiUsed']], '');
    if (!$needsHuman) {
        photo_apply_to_subject(array_merge($a, ['editedUrl' => $edit['url']]));
        photo_after_approve($a);
        @event_emit('photo.approved', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'auto' => true]);
    }
    return ['ok' => true, 'status' => $row['status'], 'score' => $score, 'flags' => $flags, 'aiUsed' => $edit['aiUsed'], 'editedUrl' => $edit['url']];
}

/* ── Editor queue + transitions ───────────────────────────────────────────── */

function photo_public(array $a): array {
    return [
        'assetId' => $a['assetId'], 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'],
        'version' => (int)$a['version'], 'status' => $a['status'],
        'sourceUrl' => $a['sourceUrl'], 'editedUrl' => $a['editedUrl'],
        'aiScore' => isset($a['aiScore']) ? (int)$a['aiScore'] : null,
        'aiFindings' => json_decode((string)($a['aiFindings'] ?? ''), true) ?: null,
        'claimedBy' => $a['claimedBy'], 'autoApproved' => (int)$a['autoApproved'],
        'reviewedBy' => $a['reviewedBy'], 'createdAt' => $a['createdAt'],
    ];
}

function admin_photo_queue(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM photo_assets WHERE status IN ('pending_review','in_review') ORDER BY (status='in_review'), createdAt LIMIT 300");
    return ['ok' => true, 'queue' => array_map('photo_public', $rows), 'pending' => count($rows)];
}

/** Atomic claim — only one editor can hold an item; guards against double review. */
function photo_claim(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $n = db_exec("UPDATE photo_assets SET status='in_review', claimedBy=?, claimedAt=? WHERE assetId=? AND status='pending_review'",
        [$g['requester']['memberId'], now_iso(), $assetId]);
    if (!$n) return ['ok' => false, 'error' => 'already_claimed'];
    audit('photo.claimed', $g['requester']['memberId'], $assetId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function photo_approve(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ?', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if ($a['status'] === 'approved') return ['ok' => true, 'already' => true];
    if (!in_array((string)$a['status'], ['pending_review', 'in_review', 'changes_requested'], true)) return ['ok' => false, 'error' => 'bad_state'];
    $edited = trim((string)($p['editedUrl'] ?? '')) ?: (string)$a['editedUrl'];
    db_update('photo_assets', ['status' => 'approved', 'editedUrl' => $edited, 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso(), 'decisionNote' => substr((string)($p['note'] ?? ''), 0, 300), 'autoApproved' => 0, 'updatedAt' => now_iso()], ['assetId' => $assetId]);
    photo_apply_to_subject(array_merge($a, ['editedUrl' => $edited]));
    photo_after_approve($a);
    audit('photo.approved', $g['requester']['memberId'], $assetId, [], (string)($p['ip'] ?? ''));
    @event_emit('photo.approved', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'auto' => false]);
    return ['ok' => true];
}

/** Once a photo is approved, retry the issuance gate for its student subject —
 *  the ID is bound if consent is already in (photo_gate_issuance flow). */
function photo_after_approve(array $a): void {
    if (($a['subjectType'] ?? '') === 'student' && function_exists('registration_issue_id')) {
        try { registration_issue_id((string)$a['subjectId']); } catch (Throwable $e) {}
    }
}

function photo_request_retake(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $reason = substr(trim((string)($p['reason'] ?? '')), 0, 300);
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ?', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    db_update('photo_assets', ['status' => 'changes_requested', 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso(), 'decisionNote' => $reason, 'updatedAt' => now_iso()], ['assetId' => $assetId]);
    audit('photo.retake_requested', $g['requester']['memberId'], $assetId, ['reason' => $reason], (string)($p['ip'] ?? ''));
    @event_emit('photo.retake_requested', ['ref' => $assetId, 'subjectType' => $a['subjectType'], 'subjectId' => $a['subjectId'], 'reason' => $reason]);
    // Email the guardian a re-shoot link (students only — volunteers re-upload
    // through the admin console).
    if (($a['subjectType'] ?? '') === 'student' && function_exists('reshoot_notify_guardian')) {
        try { reshoot_notify_guardian((string)$a['subjectId'], $reason); } catch (Throwable $e) {}
    }
    return ['ok' => true];
}

function photo_reject(array $p): array {
    // Hard reject needs the elevated 'people' capability (segregation of duties).
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $assetId = (string)($p['assetId'] ?? '');
    $reason = substr(trim((string)($p['reason'] ?? '')), 0, 300);
    $a = db_row('SELECT * FROM photo_assets WHERE assetId = ?', [$assetId]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    db_update('photo_assets', ['status' => 'rejected', 'reviewedBy' => $g['requester']['memberId'], 'reviewedAt' => now_iso(), 'decisionNote' => $reason, 'updatedAt' => now_iso()], ['assetId' => $assetId]);
    audit('photo.rejected', $g['requester']['memberId'], $assetId, ['reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Push the approved (edited) image back onto the subject's record so the ID
 *  card + profile always render the approved photo. Best-effort. */
function photo_apply_to_subject(array $a): void {
    $url = (string)($a['editedUrl'] ?? '') ?: (string)($a['sourceUrl'] ?? '');
    if ($url === '') return;
    try {
        if ($a['subjectType'] === 'student')        db_update('summer_students', ['photoUrl' => $url, 'updatedAt' => now_iso()], ['studentId' => $a['subjectId']]);
        elseif ($a['subjectType'] === 'volunteer')  db_update('volunteers', ['photoUrl' => $url, 'updatedAt' => now_iso()], ['volunteerId' => $a['subjectId']]);
    } catch (Throwable $e) { /* subject may not exist yet in tests */ }
}

/** Is a subject's current photo approved? (The issuance gate reads this.) */
function photo_approved_for(string $subjectType, string $subjectId): bool {
    return (bool)db_row("SELECT id FROM photo_assets WHERE subjectType = ? AND subjectId = ? AND status = 'approved' ORDER BY version DESC LIMIT 1", [$subjectType, $subjectId]);
}
