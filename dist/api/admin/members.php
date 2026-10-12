<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    /* Every id matching the current filters, for "apply to all N matching".
       Same filters, resolved by the SERVER, so the page and the bulk cannot
       disagree about who matched. */
    /* The four divisions a member can be placed in, with counts — the editor's
       picker reads them here rather than keeping its own copy (formation.php). */
    if ((string)($_GET['view'] ?? '') === 'divisions') {
        $res = gs_call('admin.divisions.overview', ['requesterId' => $s['mid']]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
        unset($res['ok']);
        json_ok($res);
    }
    /* Who else the roster search might mean: a Summer School participant on an
       accurate match, an NGG member on a very close one (admin_members_suggest). */
    if ((string)($_GET['view'] ?? '') === 'suggest') {
        $res = gs_call('admin.members.suggest', ['requesterId' => $s['mid'], 'q' => (string)($_GET['q'] ?? '')]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
        unset($res['ok']);
        json_ok($res);
    }
    if ((string)($_GET['view'] ?? '') === 'ids') {
        $res = gs_call('admin.members.ids', [
            'requesterId' => $s['mid'],
            'q' => $_GET['q'] ?? '', 'centre' => $_GET['centre'] ?? '',
            'status' => $_GET['status'] ?? '', 'type' => $_GET['type'] ?? '',
            'missing' => $_GET['missing'] ?? '', 'level' => $_GET['level'] ?? '',
            // The segment the roster is filtered to: without it "select all N
            // matching" named every member, not the N the list was showing.
            'segment' => $_GET['segment'] ?? null,
            'staff' => $_GET['staff'] ?? null,
            'sort' => $_GET['sort'] ?? '', 'dir' => $_GET['dir'] ?? '',
            'ip' => client_ip(),
        ]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
        unset($res['ok']);
        json_ok($res);
    }
    $res = gs_call('admin.members.list', [
        'requesterId' => $s['mid'],
        'q'      => $_GET['q']      ?? '',
        'centre' => $_GET['centre'] ?? '',
        'status' => $_GET['status'] ?? '',
        'type'   => $_GET['type']   ?? '',
        // Rows with something missing (photo / printedId / discipline), for the
        // print preflight. Allow-listed in the domain, same as sort.
        'missing' => $_GET['missing'] ?? '',
        'level'  => $_GET['level']  ?? '',
        // Forward pagination + scope the domain layer (and the UI) rely on.
        // Dropping these silently broke the pager, truncated "export all" to
        // the first page, and turned the staff roster into "first 50 members".
        'page'     => $_GET['page']     ?? null,
        'pageSize' => $_GET['pageSize'] ?? null,
        'all'      => $_GET['all']      ?? null,
        'staff'    => $_GET['staff']    ?? null,
        /* The roster filtered to exactly what a dashboard figure counted.
           Dropped here once already, which turned "214 with no email" into
           a number with no list behind it. */
        'segment'  => $_GET['segment']  ?? null,
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
    $body = read_json_body();
    /* A body over post_max_size arrives as nothing at all — PHP empties both
       php://input and $_POST and only logs a warning — so a request that
       declared a length and delivered no body is this host's limit, not a
       caller error. Named here, because the alternative is falling through to
       the upsert branch with an empty payload and reporting something else. */
    if (!$body && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
        && file_get_contents('php://input') === '') {
        json_error('request_too_large', 400,
            'The request was larger than this host accepts (post_max_size). Import from a shell, or split the roster.');
    }
    $action = (string)($body['action'] ?? '');
    if ($action === 'bulk') {
        /* One action over many members. The action name, its payload and the
           per-row verdicts all live in the domain — this route only forwards,
           and deliberately does NOT forward `requesterId` from the body: the
           operator is the verified session, never a field the caller sets. */
        $res = gs_call('admin.members.bulk', array_merge(
            is_array($body) ? $body : [],
            // `action` on the wire selects the ROUTE branch; `op` names the
            // bulk action. Two meanings for one key is how a caller ends up
            // asking for "bulk" and getting "unknown_action" back.
            ['action' => (string)($body['op'] ?? ''), 'requesterId' => $s['mid'], 'ip' => client_ip()]));
    } elseif ($action === 'reset2fa') {
        $res = gs_call('admin.members.reset2fa', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        $res = gs_call('admin.members.delete', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'import') {
        /* Roster import from the members workbook, for hosts with no shell.
         * Preview needs 'people'; applying needs super-admin (see the domain).
         *
         * `rosterJson` is the file's own text, carried as ONE value — because
         * this host's firewall counts the values in a JSON body and refuses a
         * request with a few thousand of them, which a roster posted as an
         * array of objects always is. The reasoning, and what was measured, is
         * in _lib/domain/members-import.php. */
        $raw = $body['rosterJson'] ?? null;
        if (is_string($raw) && trim($raw) !== '') {
            $up = members_import_args($body, $raw);
            if (empty($up['ok'])) json_error((string)$up['error'], 400);
            $res = gs_call('admin.members.import',
                $up['args'] + ['requesterId' => $s['mid'], 'ip' => client_ip()]);
        } else {
            // The older shape: rows already parsed by the browser, and its word
            // for the file hash. Still served, for a cached bundle.
            $res = gs_call('admin.members.import', ['requesterId' => $s['mid'],
                'members' => $body['members'] ?? null, 'apply' => !empty($body['apply']),
                'overwrite' => !empty($body['overwrite']), 'source' => $body['source'] ?? '',
                // The digest the dry run returned, echoed back so the apply can
                // be held to the file it previewed.
                'expectDigest' => $body['expectDigest'] ?? '',
                'fileSha' => $body['fileSha'] ?? '',
                'cardFormat' => array_key_exists('cardFormat', $body) ? (string)$body['cardFormat'] : 'member-number',
                'idStrict' => !empty($body['idStrict']),
                'ip' => client_ip()]);
        }
    } elseif ($action === 'ngvPortalSync') {
        // Everybody already promoted to NGV, sent to Afrovanguard for their NGV account.
        $res = gs_call('admin.members.ngvPortalSync', ['requesterId' => $s['mid'], 'ip' => client_ip()]);
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
    } elseif ($action === 'paperConsents') {
        // Every permission, granted on the paper form, for imported members still missing one.
        $res = gs_call('admin.members.paperConsents', ['requesterId' => $s['mid'], 'apply' => !empty($body['apply']), 'ip' => client_ip()]);
    } elseif ($action === 'resetPassword') {
        $res = gs_call('admin.members.resetPassword', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'promoteNgv') {
        $args = ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'role' => $body['role'] ?? '',
                 // §20: a new promotion says why. Ignored on the already-promoted
                 // path, which is how "Resend ID" reaches the same op.
                 'evidence' => $body['evidence'] ?? '', 'ip' => client_ip()];
        if (array_key_exists('sendId', $body)) $args['sendId'] = $body['sendId']; // only forward when the client set it (domain defaults to send on create)
        $res = gs_call('admin.members.promoteNgv', $args);
    } elseif ($action === 'readiness') {
        // The formation record, for the screen that decides a promotion.
        $res = gs_call('admin.members.readiness', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '']);
    } elseif ($action === 'promotions') {
        $res = gs_call('admin.members.promotions', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '']);
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
