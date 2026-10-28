<?php
declare(strict_types=1);

/**
 * Wi-Fi — each gateway's setup guide and script, written for its platform
 * (domain/wifi.php has the feed they read).
 *
 * Every command here is from the platform's own manual, checked for this
 * integration (docs/HANDOFF.md, "Wi-Fi gateways: what was verified"):
 *  - MikroTik: the router's own hotspot users and user profiles (not the User
 *    Manager package — fewer moving parts, and removing somebody is three
 *    plain commands); /tool fetch with check-certificate=yes and two header
 *    fields; replies cut at 64,512 bytes, hence the paging and the #end check.
 *  - openNDS: BinAuth's custom script and ndsctl deauth.
 *  - FreeRADIUS 3.2: the files module, reloaded with `systemctl reload`.
 *
 * The key is never stored to be shown again: a script is made with the
 * placeholder PASTE-THE-KEY-HERE, and the screen fills it in the one time it
 * holds the key (just added or rotated). Every script is safe to run again:
 * what NGG adds carries the comment `ngg`, and only that is ever replaced.
 */

const WIFI_KEY_PLACEHOLDER = 'PASTE-THE-KEY-HERE';

function admin_wifi_gateway_setup(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $f = wifi_gateway_for($g, (string)($p['gatewayId'] ?? '')); if (!$f['ok']) return $f;
    $r = $f['row'];
    $plat = WIFI_PLATFORMS[(string)$r['platform']] ?? WIFI_PLATFORMS['generic'];
    $url = wifi_feed_url();
    $fn = 'wifi_setup_' . (string)$r['platform'];
    $guide = function_exists($fn) ? $fn($r, $url) : wifi_setup_generic($r, $url);
    return ['ok' => true, 'platform' => (string)$r['platform'], 'label' => $plat['label'], 'needs' => $plat['needs'],
            'pilot' => $plat['status'] === 'pilot' ? $plat['pilot'] : '', 'feedUrl' => $url, 'canUsage' => !empty($plat['can']['usage'])] + $guide;
}

/**
 * op wifi.setup.script — the router fetches its own setup file, with its key
 * in the headers, and /imports it. One short command instead of pasting a
 * long script, which the RouterOS terminal cuts short (owner's router,
 * 2026-10-28: half the sync script arrived). The key is written into the file
 * only because the router just proved it holds it.
 */
function wifi_setup_script(array $p): array {
    $r = wifi_gateway_by_key((string)($p['gatewayId'] ?? ''), (string)($p['key'] ?? ''));
    if (!$r) {
        audit('wifi.setup.bad_key', null, substr(preg_replace('/[^\w]/', '', (string)($p['gatewayId'] ?? '')), 0, 16), [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'bad_key'];
    }
    if ((string)$r['platform'] !== 'mikrotik') return ['ok' => false, 'error' => 'not_mikrotik'];
    audit('wifi.setup.fetched', null, (string)$r['gatewayId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'script' => wifi_setup_mikrotik($r, wifi_feed_url(), (string)$p['key'])['script']];
}

/** The one line a MikroTik router runs to fetch and import its setup. */
function wifi_setup_oneliner(string $gw, string $url, string $key = WIFI_KEY_PLACEHOLDER): string {
    $setup = preg_replace('/wifi-feed\.php$/', 'wifi-setup.php', $url);
    return '/tool fetch url="' . $setup . '" http-header-field="X-NGG-Gateway: ' . $gw . ',X-NGG-Key: ' . $key . '" check-certificate=yes dst-path=ngg-wifi.rsc; :delay 2s; /import file-name=ngg-wifi.rsc';
}

/** A value safe inside a RouterOS double-quoted string. */
function wifi_ros_str(string $s): string { return str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $s); }

/* ── MikroTik RouterOS 7 ─────────────────────────────────────────────────── */

function wifi_setup_mikrotik(array $r, string $url, string $key = ''): array {
    $gw = (string)$r['gatewayId'];
    // The key goes into the file only when the router itself asked for it with that key (wifi.setup.script).
    $keyHere = $key !== '' ? $key : WIFI_KEY_PLACEHOLDER;
    $script = <<<ROS
# NGG Wi-Fi for {$r['label']} ({$r['centre']}) · gateway {$gw}
# Installed with /import (the one-line command in the guide fetches this file and
# imports it). Don't paste it into a terminal: the terminal cuts long pastes short.
# Safe to run again. What NGG adds carries the comment "ngg"; nothing else is touched.

# 0. Stop at once, with the reason, if this file can't work on this router.
:if ([:len "{$keyHere}"] != 40) do={ :error "NGG Wi-Fi: this copy has no key. Open the gateway in NGG, press Rotate the key, and use the command the guide shows then." }
:if ([:len [/ip hotspot find]] = 0) do={ :error "NGG Wi-Fi: this router has no hotspot yet. Do the guide's step 3 (IP > Hotspot > Hotspot Setup) first, then run this again." }

# 1. The clock: certificates are checked against it.
/system ntp client set enabled=yes servers=time.cloudflare.com,pool.ntp.org

# 2. Sign-in: remembered on the device for 30 days.
/ip hotspot profile set [find] login-by=http-chap,cookie,mac-cookie http-cookie-lifetime=30d

# 3. The sync script. It fetches this centre's list from NGG, applies it, and
#    keeps the people it has if NGG cannot be reached.
/system script remove [find name="ngg-wifi-sync"]
/system script add name="ngg-wifi-sync" policy=read,write,test comment="ngg" source={
:global nggWifiBusy
:global nggWifiErr
:if (\$nggWifiBusy = true) do={ :error "NGG Wi-Fi: the last sync is still running" }
:set nggWifiBusy true
:local gw "{$gw}"
:local key "{$keyHere}"
:if ([:len \$key] != 40) do={ :set nggWifiBusy false; :set nggWifiErr "no_key"; :error "NGG Wi-Fi: no key in the script. Rotate the key in NGG and install again." }
:local base "{$url}"
:local hv do={ :local k (\$2 . "="); :local i [:find \$1 \$k]; :if ([:typeof \$i] = "nil") do={ :return "" }; :local a (\$i + [:len \$k]); :local b [:find \$1 ";" (\$a - 1)]; :if ([:typeof \$b] = "nil") do={ :set b [:len \$1] }; :return [:pick \$1 \$a \$b] }
:local since 0
:local st [/system script find name="ngg-wifi-state"]
:if ([:len \$st] > 0) do={ :set since [:tonum [/system script get \$st source]] }
:if ([:typeof \$since] != "num") do={ :set since 0 }
:local err ""
:if ([:typeof \$nggWifiErr] = "str") do={ :set err \$nggWifiErr }
:local os [/system resource get version]
:set os [:pick \$os 0 [:find (\$os . " ") " "]]
# What the router reports of itself: people online, CPU, free memory (MB), uptime, and a measured line if it has one.
:global nggWifiDl
:local tele ("&act=" . [:len [/ip hotspot active find]] . "&cpu=" . [/system resource get cpu-load] . "&mem=" . ([/system resource get free-memory] / 1048576) . "&up=" . [:tonum [/system resource get uptime]])
:if ([:typeof \$nggWifiDl] = "str" && [:len \$nggWifiDl] > 0) do={ :set tele (\$tele . "&dl=" . \$nggWifiDl) }
# The data each signed-in person has used so far this session, 100 sessions a report (NGG keeps the difference).
:local uurl ([:pick \$base 0 [:find \$base "wifi-feed.php"]] . "wifi-usage.php")
:local uhd ("X-NGG-Gateway: " . \$gw . ",X-NGG-Key: " . \$key . ",Content-Type: text/plain")
:local ub ""
:local un 0
:foreach a in=[/ip hotspot active find] do={
  :do {
    :local x [/ip hotspot active get \$a]
    :set ub (\$ub . "s;" . (\$x->"user") . ";" . \$a . "|" . (\$x->"mac-address") . ";" . (\$x->"bytes-in") . ";" . (\$x->"bytes-out") . "\\n")
    :set un (\$un + 1)
  } on-error={}
  :if (\$un >= 100) do={ :do { /tool fetch url=\$uurl http-method=post http-data=\$ub http-header-field=\$uhd check-certificate=yes output=none } on-error={ :log warning "NGG Wi-Fi: data used not sent" }; :set ub ""; :set un 0 }
}
:if (\$un > 0) do={ :do { /tool fetch url=\$uurl http-method=post http-data=\$ub http-header-field=\$uhd check-certificate=yes output=none } on-error={ :log warning "NGG Wi-Fi: data used not sent" } }
:local body ""
:local head ""
:local page 1
:local pages 1
:local ok true
:while (\$ok && \$page <= \$pages) do={
  :do {
    :local r [/tool fetch url=(\$base . "?since=" . \$since . "&os=" . \$os . "&page=" . \$page . "&error=" . \$err . \$tele) http-header-field=("X-NGG-Gateway: " . \$gw . ",X-NGG-Key: " . \$key) check-certificate=yes output=user as-value]
    :local d (\$r->"data")
    :if ([:len \$d] >= 64512) do={ :set ok false; :set nggWifiErr "truncated" }
    :if (\$ok && [:typeof [:find \$d "#end"]] = "nil") do={ :set ok false; :set nggWifiErr "incomplete" }
    :if (\$ok) do={
      :local nl [:find \$d "\\n"]
      :local h [:pick \$d 0 \$nl]
      :if (\$page = 1) do={ :set head \$h; :set pages [:tonum [\$hv \$h "pages"]] }
      :set body (\$body . [:pick \$d (\$nl + 1) [:find \$d "#end"]])
    }
  } on-error={ :set ok false; :set nggWifiErr "fetch_failed" }
  :set page (\$page + 1)
}
:if (!\$ok) do={ :set nggWifiBusy false; :error ("NGG Wi-Fi: " . \$nggWifiErr . "; keeping the current users") }
:local seen [:toarray ""]
:local pos 0
:local n [:len \$body]
:while (\$pos < \$n) do={
  :local e [:find \$body "\\n" (\$pos - 1)]
  :if ([:typeof \$e] = "nil") do={ :set e \$n }
  :local line [:pick \$body \$pos \$e]
  :set pos (\$e + 1)
  :local f [:toarray ""]
  :local a 0
  :local i 0
  :while (\$a <= [:len \$line]) do={
    :local b [:find \$line ";" (\$a - 1)]
    :if ([:typeof \$b] = "nil") do={ :set b [:len \$line] }
    :set (\$f->\$i) [:pick \$line \$a \$b]
    :set i (\$i + 1)
    :set a (\$b + 1)
  }
  :local t (\$f->0)
  :if (\$t = "p") do={
    # rate-limit is upload/download from the router's side; burst doubles it for 8 s, priority 1 goes first.
    :local up [:tonum (\$f->3)]
    :local dn [:tonum (\$f->2)]
    :local rl ((\$f->3) . "M/" . (\$f->2) . "M")
    :if ((\$f->6) = "1") do={ :set rl (\$rl . " " . (\$up * 2) . "M/" . (\$dn * 2) . "M " . (\$up * 750) . "k/" . (\$dn * 750) . "k 8/8 " . (\$f->7)) } else={ :set rl (\$rl . " 0/0 0/0 0/0 " . (\$f->7)) }
    :local pid [/ip hotspot user profile find name=(\$f->1)]
    :if ([:len \$pid] = 0) do={ /ip hotspot user profile add name=(\$f->1) rate-limit=\$rl shared-users=(\$f->4) add-mac-cookie=yes mac-cookie-timeout=30d } else={ /ip hotspot user profile set \$pid rate-limit=\$rl shared-users=(\$f->4) add-mac-cookie=yes mac-cookie-timeout=30d }
  }
  :if (\$t = "u") do={
    :local u (\$f->1)
    :local id [/ip hotspot user find name=\$u comment="ngg"]
    :if ((\$f->4) = "remove") do={
      /ip hotspot active remove [find user=\$u]
      /ip hotspot cookie remove [find user=\$u]
      :if ([:len \$id] > 0) do={ /ip hotspot user remove \$id }
    } else={
      :set (\$seen->\$u) 1
      :if ([:len \$id] = 0) do={
        :if ([:len [/ip hotspot user find name=\$u]] = 0) do={ /ip hotspot user add name=\$u password=(\$f->2) profile=(\$f->3) comment="ngg" } else={ :log warning ("NGG Wi-Fi: " . \$u . " is already a hotspot user not made by NGG; left alone") }
      } else={
        :local was [/ip hotspot user get \$id profile]
        /ip hotspot user set \$id password=(\$f->2) profile=(\$f->3)
        :if (\$was != (\$f->3)) do={ /ip hotspot active remove [find user=\$u] }
      }
    }
  }
}
:if ([\$hv \$head "full"] = "1") do={
  :foreach id in=[/ip hotspot user find comment="ngg"] do={
    :local u [/ip hotspot user get \$id name]
    :if ([:typeof (\$seen->\$u)] = "nothing") do={ /ip hotspot active remove [find user=\$u]; /ip hotspot cookie remove [find user=\$u]; /ip hotspot user remove \$id }
  }
}
:if ([:len \$st] = 0) do={ /system script add name="ngg-wifi-state" comment="ngg" source="0"; :set st [/system script find name="ngg-wifi-state"] }
/system script set \$st source=[\$hv \$head "v"]
:local next [:tonum [\$hv \$head "next"]]
:if ([:typeof \$next] = "num" && \$next >= 60) do={ /system scheduler set [find name="ngg-wifi"] interval=[:totime (\$next . "s")] }
:set nggWifiErr ""
:set nggWifiDl ""
# A line test, when the Control Room asks for one (or the nightly schedule does): 8 MB from NGG, timed.
:global nggWifiTestNow
:if ([\$hv \$head "test"] = "1" || \$nggWifiTestNow = true) do={
  :set nggWifiTestNow false
  :do {
    :local sr [/tool fetch url=([:pick \$base 0 [:find \$base "wifi-feed.php"]] . "wifi-speed.php?bytes=8000000") http-header-field=("X-NGG-Gateway: " . \$gw . ",X-NGG-Key: " . \$key) check-certificate=yes dst-path="ngg-speed.bin" as-value]
    :local secs [:tonum (\$sr->"duration")]
    :if (\$secs < 1) do={ :set secs 1 }
    :local tenths (640 / \$secs)
    :set nggWifiDl ((\$tenths / 10) . "." . (\$tenths % 10))
    /file remove [find name="ngg-speed.bin"]
  } on-error={ :log warning "NGG Wi-Fi: the line test could not run" }
}
:set nggWifiBusy false
}

# 4. Run it every 2 minutes (NGG asks for sooner or later as things change), and now.
#    Newer RouterOS refuses schedules until device-mode allows them (the guide's step 1).
/system scheduler remove [find name="ngg-wifi"]
/system scheduler remove [find name="ngg-wifi-test"]
:do {
  /system scheduler add name="ngg-wifi" interval=2m start-time=startup on-event="/system script run ngg-wifi-sync" policy=read,write,test comment="ngg"
  /system scheduler add name="ngg-wifi-test" interval=1d start-time=03:15:00 on-event=":global nggWifiTestNow true" policy=read,write,test comment="ngg"
} on-error={ :put "NGG Wi-Fi: this router's device-mode does not allow schedules. Do the guide's step 1, then install again." }
:global nggWifiBusy false
:do { /system script run ngg-wifi-sync; :put "NGG Wi-Fi: the first sync worked." } on-error={ :put "NGG Wi-Fi: the first sync failed. Run: /log print where message~\"NGG\"   to see why." }

# 5. Filtering for under-18s on the hotspot's network: a family DNS service
#    (adult content and malware), SafeSearch, YouTube Restricted, DNS forced
#    through the router, and private DNS (DoT, port 853) closed. Remove this
#    block if this router's hotspot is for adults only.
/ip dns set servers=1.1.1.3,1.0.0.3 allow-remote-requests=yes
/ip dns static remove [find comment="ngg"]
:foreach n in={"www.google.com";"www.google.com.ng"} do={ /ip dns static add name=\$n type=CNAME cname=forcesafesearch.google.com comment="ngg" }
:foreach n in={"www.youtube.com";"m.youtube.com";"youtubei.googleapis.com";"youtube.googleapis.com";"www.youtube-nocookie.com"} do={ /ip dns static add name=\$n type=CNAME cname=restrict.youtube.com comment="ngg" }
/ip dns static add name=www.bing.com type=CNAME cname=strict.bing.com comment="ngg"
# One block, so the hotspot's interface is still known on every line, and every hotspot is covered.
/ip firewall nat remove [find comment="ngg"]
/ip firewall filter remove [find comment="ngg"]
:foreach h in=[/ip hotspot find] do={
  :local hs [/ip hotspot get \$h interface]
  /ip firewall nat add chain=dstnat in-interface=\$hs protocol=udp dst-port=53 action=redirect to-ports=53 comment="ngg"
  /ip firewall nat add chain=dstnat in-interface=\$hs protocol=tcp dst-port=53 action=redirect to-ports=53 comment="ngg"
  /ip firewall filter add chain=forward in-interface=\$hs protocol=tcp dst-port=853 action=reject comment="ngg"
  /ip firewall filter add chain=forward in-interface=\$hs protocol=udp dst-port=853 action=reject comment="ngg"
}
:put "NGG Wi-Fi: installed. Check this gateway in NGG: it should say Working within two minutes."
ROS;
    $host = parse_url($url, PHP_URL_HOST) ?: 'the NGG site';
    return [
        'scriptName' => 'The setup file (the one-line command downloads it for you)',
        'script' => $script,
        'oneLiner' => wifi_setup_oneliner($gw, $url),
        'summary' => 'Connects this centre’s MikroTik router to NGG. Every two minutes the router fetches who may use the Wi-Fi, signs out anybody removed, and reports how much data each person has used. You type five short commands; nothing long is pasted.',
        'time' => 'About 15 minutes',
        'before' => [
            'A MikroTik router on RouterOS 7 that already gives devices internet.',
            'WinBox on a computer, signed in to the router as admin. Commands go in WinBox → New Terminal: type or paste ONE line at a time and press Enter.',
            'Somebody who can reach the router, for one button press in step 1.',
            'This gateway’s key, which is shown once. If you don’t have it, press “Rotate the key” on this gateway: the guide opens again with the key already in step 4’s command.',
        ],
        'steps' => [
            ['h' => 'Let the router run NGG’s script', 'text' => "New RouterOS versions block downloads and schedules until you allow them (“not allowed by device-mode”). Run this line. The router then waits up to 5 minutes for you to prove you are there: press its reset button once, briefly (under a second), or unplug its power and plug it back in.",
             'cmd' => '/system device-mode update scheduler=yes fetch=yes',
             'tip' => "To check it worked, run /system device-mode print — it should say scheduler: yes and fetch: yes. If it says “unknown command”, your RouterOS is older and doesn’t need this step: carry on."],
            ['h' => 'Check the version and the clock', 'text' => "Run these two lines. The version should be 7.19 or newer, and the date and time should be right (a wrong clock makes every download fail).",
             'cmd' => "/system resource print\n/system clock print",
             'tip' => "Older than 7.19? System → Packages → Check For Updates → Download & Install, then come back. Clock wrong? Run: /system ntp client set enabled=yes servers=time.cloudflare.com"],
            ['h' => 'Turn on the sign-in page', 'text' => "Skip this if the router already has a hotspot (IP → Hotspot lists one).\nIn WinBox: IP → Hotspot → Hotspot Setup. Choose the interface the members’ Wi-Fi is on (usually “bridge”) and press Next through the questions. When it asks for a user, leave it empty: NGG supplies every user.", 'cmd' => ''],
            ['h' => 'Install NGG’s setup — one line', 'text' => "Copy this ONE line, paste it into New Terminal and press Enter. The router downloads its own setup file from NGG and runs it. It ends by printing “NGG Wi-Fi: installed”.", 'cmd' => wifi_setup_oneliner($gw, $url), 'oneLiner' => true,
             'tip' => "It still says PASTE-THE-KEY-HERE? Then you don’t have the key on screen: press “Rotate the key” on this gateway and use the line the guide shows then."],
            ['h' => 'Check it is working', 'text' => "Run these. The first should end without an error; the second prints how many people the router got from NGG. Within two minutes this gateway’s card in NGG says Working.",
             'cmd' => "/system script run ngg-wifi-sync\n/ip hotspot user print count-only where comment=\"ngg\""],
            ['h' => 'Tell members how to sign in', 'text' => "Join the centre’s Wi-Fi; the sign-in page opens by itself.\nUsername: their printed ID, like 026-014.\nPassword: their Wi-Fi PIN, from the NGG app under Me → Wi-Fi.\nThe phone is remembered for 30 days.", 'cmd' => '',
             'tip' => 'A phone with “private Wi-Fi address” switched on forgets the sign-in when that address changes. For this network, set it to use the phone’s own address.'],
        ],
        'reports' => 'Each fetch tells NGG how many people are online, the router’s CPU, memory and uptime, and how much data each signed-in person has used (amounts only). Never which sites anybody visits. Every night at 03:15, or when you press “Test the line”, it downloads 8 MB from NGG and reports the speed.',
        'trouble' => [
            ['“failure: not allowed by device-mode”', 'Do step 1, including the button press (or power off and on) within 5 minutes, then step 4 again.'],
            ['“NGG Wi-Fi: fetch_failed” or the download fails', 'In order: is the key in the command (not PASTE-THE-KEY-HERE)? Did step 1 allow fetch? Is the clock right (step 2)? Can the router reach the internet (/ping ' . $host . ')? Then run step 4 again.'],
            ['“certificate verify failed” or “SSL” in the error', 'The clock is wrong, or RouterOS is older than 7.19. Fix either (step 2), then step 4 again.'],
            ['“ambiguous value of interface”', 'That came from pasting the old long script. The one-line install (step 4) doesn’t have this problem: run it, it replaces everything the old paste left.'],
            ['Lines like {{{... with nothing after them', 'The terminal cut a long paste short. Don’t paste long scripts: use step 4’s one line.'],
            ['“the key is wrong or was rotated”', 'Press Rotate the key on this gateway in NGG and run the new step 4 line. Each wrong-key attempt is counted on the gateway’s card.'],
            ['One member can’t sign in', 'Look them up under “Why can’t somebody get on?”: it says whether they are on the list, and why not.'],
            ['To see the router’s own messages', 'Run: /log print where message~"NGG"'],
        ],
    ];
}

/* ── RADIUS bridge: FreeRADIUS 3.2 on a small Linux machine ──────────────── */

function wifi_setup_radius(array $r, string $url): array {
    $gw = (string)$r['gatewayId'];
    $script = <<<SH
#!/bin/sh
# /usr/local/bin/ngg-wifi-sync — NGG Wi-Fi for {$r['label']} ({$r['centre']}) · gateway {$gw}
# Fetches this centre's list as a FreeRADIUS users file and reloads FreeRADIUS
# when it changed. On any failure the current file stays, so people keep working.
set -u
GW="{$gw}"
KEY="PASTE-THE-KEY-HERE"
URL="{$url}"
DIR=/etc/freeradius/3.0/mods-config/files
STATE=/var/lib/ngg-wifi
mkdir -p "\$STATE"
SINCE=\$(cat "\$STATE/version" 2>/dev/null || echo 0)
ERR=\$(cat "\$STATE/error" 2>/dev/null || echo "")
OS=\$(freeradius -v 2>/dev/null | head -1 | grep -o '[0-9][0-9.]*' | head -1)
TMP=\$(mktemp)
if ! curl -fsS --max-time 30 -H "X-NGG-Gateway: \$GW" -H "X-NGG-Key: \$KEY" \
     "\$URL?since=\$SINCE&os=FreeRADIUS+\$OS&error=\$ERR" -o "\$TMP"; then
  echo fetch_failed > "\$STATE/error"; rm -f "\$TMP"; exit 1
fi
if ! tail -1 "\$TMP" | grep -q '^# end'; then echo incomplete > "\$STATE/error"; rm -f "\$TMP"; exit 1; fi
V=\$(head -1 "\$TMP" | sed -n 's/.* v=\\([0-9]*\\).*/\\1/p')
if grep -q '^# unchanged' "\$TMP"; then rm -f "\$TMP"; : > "\$STATE/error"; exit 0; fi
cp "\$DIR/ngg-users" "\$STATE/ngg-users.last" 2>/dev/null || true
install -m 0640 -o freerad -g freerad "\$TMP" "\$DIR/ngg-users"; rm -f "\$TMP"
if freeradius -XC >/dev/null 2>&1 && systemctl reload freeradius; then
  echo "\$V" > "\$STATE/version"; : > "\$STATE/error"
else
  cp "\$STATE/ngg-users.last" "\$DIR/ngg-users" 2>/dev/null; echo reload_failed > "\$STATE/error"; exit 1
fi
SH;
    return [
        'scriptName' => 'The sync script — save as /usr/local/bin/ngg-wifi-sync',
        'script' => $script,
        'summary' => 'For Wi-Fi controllers that check sign-ins against a RADIUS server (UniFi, Omada, pfSense, OPNsense…). A small Linux machine at the centre keeps NGG’s list and answers the controller.',
        'time' => 'About 45 minutes',
        'before' => [
            'A Raspberry Pi or any small Linux machine on the centre’s network, always on, with a fixed address.',
            'Admin access to the Wi-Fi controller or firewall, and a way to type commands on the Linux machine.',
            'This gateway’s key (already in the script if you opened this guide right after adding the gateway or rotating its key).',
        ],
        'steps' => [
            ['h' => 'Install the RADIUS server', 'text' => 'On the Linux machine (Raspberry Pi OS Lite is fine), run:', 'cmd' => 'sudo apt update && sudo apt install -y freeradius curl'],
            ['h' => 'Let the controller ask it', 'text' => "Add the controller to /etc/freeradius/3.0/clients.conf. Put its address in ipaddr and make up a long secret; you will type the same secret into the controller.",
             'cmd' => "client centre-wifi {\n  ipaddr = 192.168.1.2\n  secret = A-LONG-RANDOM-SECRET\n  require_message_authenticator = yes\n}",
             'tip' => 'If the controller cannot sign anybody in afterwards, change require_message_authenticator to no: some older controllers don’t send it.'],
            ['h' => 'Make it read NGG’s list', 'text' => 'Add this line near the top of /etc/freeradius/3.0/mods-config/files/authorize:', 'cmd' => "\$INCLUDE ngg-users",
             'tip' => 'Then create the file empty: sudo touch /etc/freeradius/3.0/mods-config/files/ngg-users'],
            ['h' => 'Save the sync script and run it every 2 minutes', 'text' => 'Click “Copy the script”, save it as /usr/local/bin/ngg-wifi-sync, then run:', 'script' => true,
             'cmd' => "sudo chmod 700 /usr/local/bin/ngg-wifi-sync\necho '*/2 * * * * root /usr/local/bin/ngg-wifi-sync' | sudo tee /etc/cron.d/ngg-wifi\nsudo /usr/local/bin/ngg-wifi-sync"],
            ['h' => 'Point the controller at the machine', 'text' => "In the controller’s guest portal, set sign-in to RADIUS with this machine’s address and the secret from step 2.\nUniFi: the hotspot portal → RADIUS. Test that a member’s speed limit applies before relying on it.\nOmada: Site → Network Config → Authentication → Portal → RADIUS Server.\npfSense: Services → Captive Portal → RADIUS, and turn on “Reauthenticate connected users every minute”.\nOPNsense: Captive portal → RADIUS (it does not apply per-person speeds).", 'cmd' => ''],
            ['h' => 'Check it is working', 'text' => 'This prints the people on the list; it should match “People on it” here.', 'cmd' => 'sudo /usr/local/bin/ngg-wifi-sync && grep -c Cleartext-Password /etc/freeradius/3.0/mods-config/files/ngg-users'],
        ],
        'reports' => 'It fetches the list every two minutes. It does not report data used yet: per-person usage and data allowances need a MikroTik router or the JSON feed.',
        'trouble' => [
            ['Somebody removed can still get on', 'A RADIUS machine cannot sign anybody out by itself. A removal takes effect at their next sign-in: within a minute on pfSense with re-authentication on, otherwise within 8 hours.'],
            ['“Devices at once” isn’t enforced', 'It needs FreeRADIUS session tracking (radutmp) switched on in sites-available/default, and even then it lets people in when it cannot check. Don’t rely on it.'],
            ['“reload_failed”', 'Run sudo freeradius -XC to see why. The last good list was put back, so people kept working.'],
            ['To test one person', 'radtest 026-014 <their PIN> 127.0.0.1 0 testing123'],
        ],
    ];
}

/* ── OpenWrt with openNDS ────────────────────────────────────────────────── */

function wifi_setup_openwrt(array $r, string $url): array {
    $gw = (string)$r['gatewayId'];
    $script = <<<SH
#!/bin/sh
# /usr/bin/ngg-wifi-sync — NGG Wi-Fi for {$r['label']} ({$r['centre']}) · gateway {$gw}
# Keeps /etc/ngg-wifi/users ("username pin profile down up" per line) as NGG's
# list, and signs out anybody removed. On a failure the current list stays.
GW="{$gw}"
KEY="PASTE-THE-KEY-HERE"
URL="{$url}"
D=/etc/ngg-wifi
mkdir -p "\$D"
SINCE=\$(cat "\$D/version" 2>/dev/null || echo 0)
OS=\$(. /etc/openwrt_release; echo "\$DISTRIB_RELEASE")
PAGE=1; PAGES=1; : > /tmp/ngg-feed
while [ "\$PAGE" -le "\$PAGES" ]; do
  uclient-fetch -q -T 30 -O /tmp/ngg-page --header="X-NGG-Gateway: \$GW" --header="X-NGG-Key: \$KEY" \
    "\$URL?since=\$SINCE&os=OpenWrt+\$OS&page=\$PAGE" || { logger -t ngg-wifi fetch_failed; exit 1; }
  tail -1 /tmp/ngg-page | grep -q '^#end' || { logger -t ngg-wifi incomplete; exit 1; }
  [ "\$PAGE" = 1 ] && HEAD=\$(head -1 /tmp/ngg-page) && PAGES=\$(echo "\$HEAD" | sed -n 's/.*pages=\\([0-9]*\\).*/\\1/p')
  sed '1d;\$d' /tmp/ngg-page >> /tmp/ngg-feed
  PAGE=\$((PAGE + 1))
done
V=\$(echo "\$HEAD" | sed -n 's/.*;v=\\([0-9]*\\);.*/\\1/p')
FULL=\$(echo "\$HEAD" | sed -n 's/.*;full=\\([01]\\);.*/\\1/p')
touch "\$D/users"; [ "\$FULL" = 1 ] && cp "\$D/users" /tmp/ngg-old && : > "\$D/users"
grep '^p;' /tmp/ngg-feed | cut -d';' -f2-5 | tr ';' ' ' > "\$D/profiles"
grep '^u;' /tmp/ngg-feed | while IFS=';' read -r t u pin prof act; do
  sed -i "/^\$u /d" "\$D/users"
  if [ "\$act" = remove ]; then
    MAC=\$(grep "^\$u " "\$D/macs" 2>/dev/null | cut -d' ' -f2); [ -n "\$MAC" ] && ndsctl deauth "\$MAC"
  else
    echo "\$u \$pin \$prof" >> "\$D/users"
  fi
done
if [ "\$FULL" = 1 ] && [ -f /tmp/ngg-old ]; then
  cut -d' ' -f1 /tmp/ngg-old | while read -r u; do grep -q "^\$u " "\$D/users" || { MAC=\$(grep "^\$u " "\$D/macs" 2>/dev/null | cut -d' ' -f2); [ -n "\$MAC" ] && ndsctl deauth "\$MAC"; }; done
fi
echo "\$V" > "\$D/version"
SH;
    $binauth = <<<SH
#!/bin/sh
# /etc/ngg-wifi/custombinauth.sh — openNDS calls this; it checks the ID and PIN
# against NGG's list and sets the person's speeds. (PILOT: prove on one router.)
METHOD="\$1"; MAC="\$2"; USER="\$3"; PASS="\$4"
if [ "\$METHOD" = auth_client ]; then
  LINE=\$(grep "^\$USER \$PASS " /etc/ngg-wifi/users)
  [ -z "\$LINE" ] && exitlevel=1 && return 1 2>/dev/null
  PROF=\$(echo "\$LINE" | cut -d' ' -f3)
  set -- \$(grep "^\$PROF " /etc/ngg-wifi/profiles)
  upload_rate=\$((\$3 * 1000)); download_rate=\$((\$2 * 1000)); sessiontimeout=43200
  sed -i "/^\$USER /d" /etc/ngg-wifi/macs 2>/dev/null; echo "\$USER \$MAC" >> /etc/ngg-wifi/macs
fi
SH;
    return [
        'scriptName' => 'Two scripts — the sync, then the sign-in check',
        'script' => $script . "\n\n" . $binauth,
        'summary' => 'For OpenWrt routers with openNDS. The router keeps NGG’s list, checks each sign-in against it and signs out anybody removed. A pilot: prove it on one router first.',
        'time' => 'About 30 minutes',
        'before' => [
            'An OpenWrt 23.05 or newer router that already gives members’ devices internet, and SSH access to it.',
            'This gateway’s key (already in the scripts if you opened this guide right after adding the gateway or rotating its key).',
        ],
        'steps' => [
            ['h' => 'Install the packages', 'text' => 'Over SSH on the router, run:', 'cmd' => 'opkg update && opkg install opennds ca-bundle libustream-mbedtls'],
            ['h' => 'Save the two scripts', 'text' => "Click “Copy the script”. The first part goes in /usr/bin/ngg-wifi-sync, the second (from the line starting #!/bin/sh again) in /etc/ngg-wifi/custombinauth.sh. Make both runnable:", 'script' => true,
             'cmd' => 'chmod 700 /usr/bin/ngg-wifi-sync /etc/ngg-wifi/custombinauth.sh'],
            ['h' => 'Run the sync every 2 minutes', 'text' => '', 'cmd' => "echo '*/2 * * * * /usr/bin/ngg-wifi-sync' >> /etc/crontabs/root && service cron restart"],
            ['h' => 'Use NGG’s list for sign-in', 'text' => 'Point openNDS at the sign-in check, and use its ThemeSpec login page (login_option_enabled 3) with two fields, the ID and the PIN.',
             'cmd' => "uci set opennds.@opennds[0].custombinauth='/etc/ngg-wifi/custombinauth.sh' && uci commit opennds && service opennds restart",
             'tip' => 'This is the part to prove on one router before any other.'],
            ['h' => 'Check it is working', 'text' => 'This prints the people on the list; it should match “People on it” here.', 'cmd' => '/usr/bin/ngg-wifi-sync && wc -l /etc/ngg-wifi/users'],
        ],
        'reports' => 'It fetches the list every two minutes. It does not report data used yet: per-person usage and data allowances need a MikroTik router or the JSON feed.',
        'trouble' => [
            ['The sign-in page doesn’t accept the PIN', 'It is the pilot step: until it is proven, use a MikroTik router or the RADIUS machine at that centre.'],
            ['To see what happened', 'logread -e ngg-wifi'],
            ['People stay signed in a long time', 'openNDS keeps a sign-in for the session time (here 30 days): that is how it remembers a device. Removing somebody at NGG still signs them out at the next fetch.'],
        ],
    ];
}

/* ── Anything else: the JSON feed ────────────────────────────────────────── */

function wifi_setup_generic(array $r, string $url): array {
    $gw = (string)$r['gatewayId'];
    $usage = preg_replace('/wifi-feed\.php$/', 'wifi-usage.php', $url);
    return [
        'scriptName' => 'An example request',
        'script' => "curl -fsS -H 'X-NGG-Gateway: {$gw}' -H 'X-NGG-Key: PASTE-THE-KEY-HERE' '{$url}?since=0'",
        'summary' => 'For your own script or controller integration: fetch the list as JSON over HTTPS, apply it, and (optionally) report the data each person used.',
        'time' => 'Depends on your system',
        'before' => [
            'Something that can make HTTPS requests with two headers and apply a list of users.',
            'This gateway’s key. Send it in a header, never in the address.',
        ],
        'steps' => [
            ['h' => 'Ask for the list', 'text' => "GET the address below with the headers X-NGG-Gateway: {$gw} and X-NGG-Key: <its key>.\nsince is the version you last applied completely (0 the first time). Optional: os=<your platform>, error=<a short word for the last problem>, full=1 for everything.",
             'cmd' => "GET {$url}?since=<version>", 'script' => true],
            ['h' => 'Read the reply', 'text' => 'Speeds are Mbit/s; dayMb and monthMb are data allowances NGG applies itself; hours is blank (all day) or like 08:00-18:00.',
             'cmd' => "{ \"version\": 12, \"full\": false, \"next\": 120, \"count\": 214,\n  \"profiles\": { \"ngg-member\": { \"down\": 10, \"up\": 5, \"devices\": 1, \"hours\": \"\" }, … },\n  \"users\": [ { \"username\": \"026-014\", \"pin\": \"482913\", \"profile\": \"ngg-member\", \"action\": \"add\" }, … ] }"],
            ['h' => 'Apply it', 'text' => "add and set: create or update the user with that PIN and profile. remove: delete the user and end their session.\nfull: true means this is everybody: remove every user you made from NGG that isn’t in it.\nOnly once everything is applied, send that version as since next time, and ask again after next seconds. If anything fails, keep the users you have.", 'cmd' => ''],
            ['h' => 'Report data used (for usage figures and allowances)', 'text' => 'Before each fetch, POST each signed-in person’s running totals for their current session, from the person’s side, with the same two headers. NGG keeps the difference between reports.',
             'cmd' => "POST {$usage}\nContent-Type: application/json\n{ \"sessions\": [ { \"username\": \"026-014\", \"session\": \"<your id for this session>\", \"down\": 52428800, \"up\": 3145728 } ] }"],
            ['h' => 'Check it is working', 'text' => 'The first request returns full: true with everybody. Ask again with since=<that version>: an empty users list means nothing changed.', 'cmd' => ''],
        ],
        'reports' => 'Whatever you send: the list is confirmed by the version you send back, and data used by the usage report. Never which sites anybody visits.',
        'trouble' => [
            ['401 with “#error;bad_key”', 'The key is wrong or was rotated. Each wrong-key request is counted on this gateway’s card.'],
            ['A full list every time', 'You are sending an older since than the version you were last handed. Send the version from the reply you applied.'],
        ],
    ];
}
