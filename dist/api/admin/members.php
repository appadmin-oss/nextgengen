<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.members.list', [
        'requesterId' => $s['mid'],
        'q'      => $_GET['q']      ?? '',
        'centre' => $_GET['centre'] ?? '',
        'status' => $_GET['status'] ?? '',
        'type'   => $_GET['type']   ?? '',
        // Rows with something missing (photo / printedId / discipline), for the
        // print preflight. Allow-listed in the domain, same as sort.
        'missing' => $_GET['missing'] ?? '',
        // Forward pagination + scope the domain layer (and the UI) rely on.
        // Dropping these silently broke the pager, truncated "export all" to
        // the first page, and turned the staff roster into "first 50 members".
        'page'     => $_GET['page']     ?? null,
        'pageSize' => $_GET['pageSize'] ?? null,
        'all'      => $_GET['all']      ?? null,
        'staff'    => $_GET['staff']    ?? null,
        // Which column the roster is ordered by, and which way. Validated
        // against an allow-list in admin_members_list — the value ends up in
        // SQL text, so it is never interpolated as given.
        'sort'     => $_GET['sort']     ?? '',
        'dir'      => $_GET['dir']      ?? '',
        'ip'     => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    /* ── The roster import arrives as a file part ────────────────────────────
     *
     * Not as a JSON body: a roster is 110KB–1.6MB of children's records, which
     * is over the 128KB a stock mod_security allows in a body with no upload in
     * it, and the firewall refuses the request with 406 before PHP is reached.
     * The reasoning is with the parser, in _lib/domain/members-import.php.
     *
     * php://input is empty for a multipart request, so the fields are in $_POST
     * and nothing below this would find an action at all — hence the branch
     * here, ahead of read_json_body(). */
    /* A request body over post_max_size leaves $_POST AND $_FILES empty, with
       nothing but a warning in the log — so a multipart request that arrives
       carrying nothing is this host's limit, not a caller error. Said plainly
       here, because the alternative is falling through to the upsert branch
       below with an empty payload and reporting something unrelated. */
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') === 0 && !$_POST && !$_FILES) {
        json_error('roster_too_large', 400,
            'The request was larger than this host accepts (post_max_size). Raise it, or import from a shell.');
    }

    if ((string)($_POST['action'] ?? '') === 'import') {
        $f = is_array($_FILES['roster'] ?? null) ? $_FILES['roster'] : ['error' => UPLOAD_ERR_NO_FILE];
        $bad = members_import_upload_error((int)($f['error'] ?? UPLOAD_ERR_NO_FILE));
        // A tmp_name that is not an upload is either a misconfigured host or an
        // attempt to have us read a path of somebody else's choosing.
        if (!$bad && !is_uploaded_file((string)($f['tmp_name'] ?? ''))) {
            $bad = ['error' => 'no_roster_file', 'detail' => 'No roster file arrived with the request.'];
        }
        if ($bad) json_error((string)$bad['error'], 400, $bad['detail'] ?? null);

        $raw = (string)@file_get_contents((string)$f['tmp_name']);
        $up = members_import_upload_args($_POST, $raw);
        if (empty($up['ok'])) json_error((string)$up['error'], 400);

        $res = gs_call('admin.members.import',
            $up['args'] + ['requesterId' => $s['mid'], 'ip' => client_ip()]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['detail'] ?? null);
        unset($res['ok']);
        json_ok($res);
    }

    $body = read_json_body();
    $action = (string)($body['action'] ?? '');
    if ($action === 'reset2fa') {
        $res = gs_call('admin.members.reset2fa', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        $res = gs_call('admin.members.delete', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'import') {
        // Roster import from the members workbook, for hosts with no shell.
        // Preview needs 'people'; applying needs super-admin (see the domain).
        $res = gs_call('admin.members.import', ['requesterId' => $s['mid'],
            'members' => $body['members'] ?? null, 'apply' => !empty($body['apply']),
            'overwrite' => !empty($body['overwrite']), 'source' => $body['source'] ?? '',
            // The digest the dry run returned, echoed back so the apply can be
            // held to the file it previewed; and the raw sha256 of the bytes the
            // browser read, recorded so a run can be traced to a file on disk.
            'expectDigest' => $body['expectDigest'] ?? '',
            'fileSha' => $body['fileSha'] ?? '',
            'ip' => client_ip()]);
    } elseif ($action === 'setCaps') {
        $args = ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'caps' => $body['caps'] ?? [], 'ip' => client_ip()];
        if (array_key_exists('centreScope', $body)) $args['centreScope'] = $body['centreScope']; // only when explicitly set — avoids clobbering
        $res = gs_call('admin.members.caps', $args);
    } elseif ($action === 'consent') {
        // Recording a guardian's publication decision for a child. Append-only;
        // `method` says how it was obtained and is required by the domain layer.
        $res = gs_call('admin.members.consent', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '',
            'type' => $body['type'] ?? '', 'status' => $body['status'] ?? '', 'method' => $body['method'] ?? '',
            'ip' => client_ip()]);
    } elseif ($action === 'resetPassword') {
        $res = gs_call('admin.members.resetPassword', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'promoteNgv') {
        $args = ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'role' => $body['role'] ?? '', 'ip' => client_ip()];
        if (array_key_exists('sendId', $body)) $args['sendId'] = $body['sendId']; // only forward when the client set it (domain defaults to send on create)
        $res = gs_call('admin.members.promoteNgv', $args);
    } elseif ($action === 'demoteNgv') {
        $res = gs_call('admin.members.demoteNgv', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.members.upsert', ['requesterId' => $s['mid'], 'data' => $body, 'ip' => client_ip()]);
    }
    /* Forward `detail` as well as the code. The domain writes a sentence for
       every refusal the operator has to act on — "read the dry run again before
       applying", "applying needs super-admin access" — and dropping it left the
       drawer showing a bare `roster_changed` for a thing it could have explained. */
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['detail'] ?? null);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
