<?php
/** Where to connect Telegram for free messages: {enabled, url, bot}. Public; reveals only the bot's public link. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
json_ok(gs_call('public.telegram', []));
