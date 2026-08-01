<?php
declare(strict_types=1);

/**
 * The design asset library.
 *
 * WHY THIS EXISTS, precisely: an image placed in a design used to be a data:
 * URL written into the design's own JSON, and a design is capped at 512KB. A
 * 1600px photograph is around 400KB of JPEG, which is 548KB once base64-encoded
 * — so a poster with one photograph on it could not be saved at all. The save
 * came back `too_large` and the work was lost. That is a bug, not a limitation,
 * and inlining was the wrong architecture anyway: the same NGG logo on ten
 * posters was ten copies of the same bytes, and no design could ever be reused
 * with a different picture.
 *
 * So: bytes live once, here, and a design holds a URL.
 *
 * Where the bytes actually go depends on the deployment, and deliberately does
 * not change anything else. With Cloudinary configured the browser has already
 * uploaded and hands us the delivery URL; without it, the data URL is written
 * to the same content-addressed photo store every headshot uses. Both are just
 * a URL to a template, which is what lets a host switch between them without
 * touching a single design.
 *
 * Content-addressed at this layer too: uploading the same file twice returns
 * the row that already exists. A logo dropped into eleven posters is one file
 * and one row.
 */

/** A design asset is bigger than a headshot — a background photograph for an A3
 *  poster is legitimately a few megabytes — but not unbounded on a shared host. */
const DASSET_MAX_BYTES = 8 * 1024 * 1024;
const DASSET_MAX_ROWS = 2000;
const DASSET_FOLDERS = ['general', 'logo', 'photo', 'texture', 'icon'];

/** Same capability as the designs themselves: whoever can change what a
 *  credential looks like can manage the pictures on it. */
function dasset_gate(array $p) { return admin_cap_gate($p, 'people'); }

function dasset_public(array $r): array {
    return [
        'assetId' => (string)$r['assetId'],
        'name' => (string)$r['name'],
        'url' => (string)$r['url'],
        'folder' => (string)$r['folder'],
        'mime' => (string)$r['mime'],
        'width' => (int)$r['width'],
        'height' => (int)$r['height'],
        'bytes' => (int)$r['bytes'],
        // Which side of the Cloudinary question this one landed on. Shown in the
        // library so "why is this one slow" has an answer.
        'local' => (string)($r['storeId'] ?? '') !== '',
        'createdAt' => (string)($r['createdAt'] ?? ''),
    ];
}

function admin_design_assets(array $p): array {
    $g = dasset_gate($p); if (!$g['ok']) return $g;
    $folder = (string)($p['folder'] ?? '');
    $where = ["archivedAt = ''"]; $args = [];
    if ($folder !== '' && in_array($folder, DASSET_FOLDERS, true)) { $where[] = 'folder = ?'; $args[] = $folder; }
    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') { $where[] = 'name LIKE ?'; $args[] = '%' . $q . '%'; }
    $rows = db_all('SELECT * FROM design_assets WHERE ' . implode(' AND ', $where)
                   . ' ORDER BY id DESC LIMIT 300', $args);
    $total = (int)(db_row("SELECT COUNT(*) n FROM design_assets WHERE archivedAt = ''")['n'] ?? 0);
    $bytes = (int)(db_row("SELECT COALESCE(SUM(bytes), 0) b FROM design_assets WHERE archivedAt = ''")['b'] ?? 0);
    return ['ok' => true, 'assets' => array_map('dasset_public', $rows),
            'folders' => DASSET_FOLDERS, 'total' => $total, 'bytes' => $bytes,
            'maxBytes' => DASSET_MAX_BYTES];
}

/**
 * Take an image into the library.
 *
 * Two shapes, one op, because the CALLER should not have to know how this
 * deployment stores things:
 *
 *   dataUrl  the browser has the bytes (no cloud, or the cloud refused). They
 *            go to the local content-addressed store.
 *   url      the browser already uploaded to Cloudinary and has a delivery URL.
 *            We record it; the bytes were never ours to hold.
 *
 * Either way the answer is an asset with a URL, and the designer does not branch.
 */
function admin_design_asset_upload(array $p): array {
    $g = dasset_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');

    $name = trim((string)($p['name'] ?? ''));
    if ($name === '') $name = 'Untitled';
    $name = mb_substr($name, 0, 200);
    $folder = (string)($p['folder'] ?? 'general');
    if (!in_array($folder, DASSET_FOLDERS, true)) $folder = 'general';

    if ((int)(db_row("SELECT COUNT(*) n FROM design_assets WHERE archivedAt = ''")['n'] ?? 0) >= DASSET_MAX_ROWS) {
        return ['ok' => false, 'error' => 'library_full'];
    }

    $dataUrl = (string)($p['dataUrl'] ?? '');
    $url = trim((string)($p['url'] ?? ''));
    $storeId = ''; $bytes = 0; $mime = ''; $w = 0; $h = 0; $sha = '';

    if ($dataUrl !== '') {
        if (!preg_match('#^data:image/([a-z0-9.+-]+);base64,#i', $dataUrl)) return ['ok' => false, 'error' => 'not_an_image'];
        $raw = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1) ?: '', true);
        if ($raw === false || strlen($raw) < 100) return ['ok' => false, 'error' => 'unreadable'];
        if (strlen($raw) > DASSET_MAX_BYTES) return ['ok' => false, 'error' => 'too_large'];
        $bytes = strlen($raw);
        $sha = hash('sha256', $raw);
        // Dedupe before writing anything: the same file uploaded twice is one file.
        $dupe = db_row("SELECT * FROM design_assets WHERE sha = ? AND archivedAt = '' LIMIT 1", [$sha]);
        if ($dupe) return ['ok' => true, 'asset' => dasset_public($dupe), 'deduped' => true];

        if (function_exists('getimagesizefromstring')) {
            $info = @getimagesizefromstring($raw);
            if (is_array($info)) { $w = (int)($info[0] ?? 0); $h = (int)($info[1] ?? 0); $mime = (string)($info['mime'] ?? ''); }
        }
        /* Reuses the photo store rather than inventing a second one: it is
           already content-addressed under the app secret, already served
           immutable by api/public/photo.php, and already the thing a deployment
           without Cloudinary depends on. A second image directory would be a
           second set of permissions to get wrong. */
        if (!function_exists('photo_store_put')) return ['ok' => false, 'error' => 'no_store'];
        $put = photo_store_put($dataUrl);
        if (empty($put['ok'])) return ['ok' => false, 'error' => (string)($put['error'] ?? 'store_failed')];
        $storeId = (string)($put['id'] ?? '');
        $url = (string)($put['url'] ?? photo_store_url($storeId));
    } elseif ($url !== '') {
        // A cloud URL the browser already obtained. Same safety rule as a design's
        // image src: it will be drawn into a canvas that then gets exported, and a
        // src we cannot fetch cleanly produces a blank export rather than an error.
        if (!function_exists('ctpl_safe_url') || !ctpl_safe_url($url)) return ['ok' => false, 'error' => 'bad_url'];
        $bytes = max(0, (int)($p['bytes'] ?? 0));
        $w = max(0, (int)($p['width'] ?? 0));
        $h = max(0, (int)($p['height'] ?? 0));
        $mime = (string)($p['mime'] ?? '');
        // No bytes here to hash, so identity is the URL — enough to stop the same
        // upload being listed twice.
        $sha = hash('sha256', $url);
        $dupe = db_row("SELECT * FROM design_assets WHERE sha = ? AND archivedAt = '' LIMIT 1", [$sha]);
        if ($dupe) return ['ok' => true, 'asset' => dasset_public($dupe), 'deduped' => true];
    } else {
        return ['ok' => false, 'error' => 'nothing_to_store'];
    }

    $assetId = 'ast-' . strtolower(rand_hex(6));
    db_insert('design_assets', [
        'assetId' => $assetId, 'name' => $name, 'url' => $url, 'storeId' => $storeId,
        'sha' => $sha, 'mime' => $mime, 'width' => $w, 'height' => $h, 'bytes' => $bytes,
        'folder' => $folder, 'uploadedById' => $me, 'createdAt' => now_iso(), 'archivedAt' => '',
    ]);
    audit('design.asset.upload', $me, $assetId, ['bytes' => $bytes, 'local' => $storeId !== ''], (string)($p['ip'] ?? ''));
    $row = db_row('SELECT * FROM design_assets WHERE assetId = ?', [$assetId]);
    return ['ok' => true, 'asset' => dasset_public($row ?: []), 'deduped' => false];
}

function admin_design_asset_rename(array $p): array {
    $g = dasset_gate($p); if (!$g['ok']) return $g;
    $name = mb_substr(trim((string)($p['name'] ?? '')), 0, 200);
    if ($name === '') return ['ok' => false, 'error' => 'name_required'];
    $n = db_exec('UPDATE design_assets SET name = ? WHERE assetId = ?', [$name, (string)($p['assetId'] ?? '')]);
    return $n ? ['ok' => true] : ['ok' => false, 'error' => 'not_found'];
}

/**
 * Archive an asset — and refuse while a design still points at it.
 *
 * Deleting a picture that eleven posters use would break eleven posters
 * silently: the design still saves, still publishes, and renders a grey
 * placeholder that nobody notices until it prints. So the check names the
 * designs, and the admin decides.
 *
 * Archive rather than delete: the bytes stay, because a print run from last
 * November must still render, and `archivedAt` only takes it out of the picker.
 */
function admin_design_asset_delete(array $p): array {
    $g = dasset_gate($p); if (!$g['ok']) return $g;
    $id = (string)($p['assetId'] ?? '');
    $a = db_row('SELECT * FROM design_assets WHERE assetId = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];

    $used = dasset_usage((string)$a['url']);
    if ($used && empty($p['force'])) {
        return ['ok' => false, 'error' => 'in_use', 'usedBy' => $used];
    }
    db_update('design_assets', ['archivedAt' => now_iso()], ['assetId' => $id]);
    audit('design.asset.delete', (string)($g['requester']['memberId'] ?? ''), $id,
        ['forced' => !empty($p['force']), 'usedBy' => count($used)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'usedBy' => $used];
}

/** Which designs reference this URL. Read from the stored JSON rather than from
 *  a join table: a design is edited as a whole document and a reference table
 *  would need updating on every save, which is a second thing to get wrong. */
function dasset_usage(string $url): array {
    if ($url === '') return [];
    $out = [];
    foreach (db_all('SELECT templateId, name, schemaJson, publishedJson FROM card_templates LIMIT 500') as $t) {
        if (strpos((string)$t['schemaJson'], $url) !== false || strpos((string)$t['publishedJson'], $url) !== false) {
            $out[] = ['templateId' => (string)$t['templateId'], 'name' => (string)$t['name']];
        }
        if (count($out) >= 20) break;
    }
    return $out;
}

/** What the library holds and what it is costing. Its own read so the designer
 *  can show it without pulling 300 rows. */
function admin_design_asset_usage(array $p): array {
    $g = dasset_gate($p); if (!$g['ok']) return $g;
    $a = db_row('SELECT url FROM design_assets WHERE assetId = ? LIMIT 1', [(string)($p['assetId'] ?? '')]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'usedBy' => dasset_usage((string)$a['url'])];
}
