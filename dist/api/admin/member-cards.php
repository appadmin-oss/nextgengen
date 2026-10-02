<?php
/**
 * Admin: members' cards — what the CACENTRE gate reads (domain/member-cards.php).
 *
 *   GET                                  the card formats
 *   GET  ?memberId=…                     one member's cards (scoped)
 *   POST {action:'derive', example, number}          a format from an example card
 *   POST {action:'test', template, mask, sample}     does this sample read under it?
 *   POST {action:'saveFormat', id, label, template, mask, field, example}  (super admin)
 *   POST {action:'reissue', memberId, voidPrinted?}  a new secure card; the old one stops
 *   POST {action:'backfill', format?, limit?}        cards for everybody who has none
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$base = ['requesterId' => $s['mid'], 'ip' => client_ip()];

if ($method === 'GET') {
    $res = isset($_GET['memberId'])
        ? gs_call('admin.members.cards', $base + ['memberId' => (string)$_GET['memberId']])
        : gs_call('admin.members.cardFormats', $base);
} else {
    $b = read_json_body();
    switch ((string)($b['action'] ?? '')) {
        case 'derive': $res = gs_call('admin.members.cardFormats', $base + ['example' => (string)($b['example'] ?? ''), 'number' => (string)($b['number'] ?? '')]); break;
        case 'test': $res = gs_call('admin.members.cardFormats', $base + ['test' => ['template' => (string)($b['template'] ?? ''), 'mask' => (string)($b['mask'] ?? '')], 'sample' => (string)($b['sample'] ?? '')]); break;
        case 'saveFormat': $res = gs_call('admin.members.cardFormatSave', $base + array_intersect_key($b, array_flip(['id', 'label', 'template', 'mask', 'field', 'example']))); break;
        case 'reissue': $res = gs_call('admin.members.cardReissue', $base + ['memberId' => (string)($b['memberId'] ?? ''), 'voidPrinted' => !empty($b['voidPrinted'])]); break;
        case 'backfill': $res = gs_call('admin.members.cardsBackfill', $base + ['format' => array_key_exists('format', $b) ? (string)$b['format'] : 'member-number', 'limit' => (int)($b['limit'] ?? 200)]); break;
        default: json_error('unknown_action', 400);
    }
}
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']);
json_ok($res);
