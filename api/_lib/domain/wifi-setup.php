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
    $g = admin_cap_gate($p, 'network'); if (!$g['ok']) return $g;
    $r = wifi_gateway_live((string)($p['gatewayId'] ?? ''));
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $plat = WIFI_PLATFORMS[(string)$r['platform']] ?? WIFI_PLATFORMS['generic'];
    $url = wifi_feed_url();
    $fn = 'wifi_setup_' . (string)$r['platform'];
    $guide = function_exists($fn) ? $fn($r, $url) : wifi_setup_generic($r, $url);
    return ['ok' => true, 'platform' => (string)$r['platform'], 'label' => $plat['label'], 'needs' => $plat['needs'],
            'pilot' => $plat['status'] === 'pilot' ? $plat['pilot'] : '', 'feedUrl' => $url] + $guide;
}

/** A value safe inside a RouterOS double-quoted string. */
function wifi_ros_str(string $s): string { return str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $s); }

/* ── MikroTik RouterOS 7 ─────────────────────────────────────────────────── */

function wifi_setup_mikrotik(array $r, string $url): array {
    $gw = (string)$r['gatewayId'];
    $script = <<<ROS
# NGG Wi-Fi for {$r['label']} ({$r['centre']}) · gateway {$gw}
# Paste into a RouterOS 7 terminal (WinBox → New Terminal). Safe to paste again.
# What NGG adds carries the comment "ngg"; nothing else on the router is touched.

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
:local key "PASTE-THE-KEY-HERE"
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
/system scheduler remove [find name="ngg-wifi"]
/system scheduler add name="ngg-wifi" interval=2m start-time=startup on-event="/system script run ngg-wifi-sync" policy=read,write,test comment="ngg"
/system scheduler remove [find name="ngg-wifi-test"]
/system scheduler add name="ngg-wifi-test" interval=1d start-time=03:15:00 on-event=":global nggWifiTestNow true" policy=read,write,test comment="ngg"
:global nggWifiBusy false
/system script run ngg-wifi-sync

# 5. Filtering for under-18s on the hotspot's network: a family DNS service
#    (adult content and malware), SafeSearch, YouTube Restricted, DNS forced
#    through the router, and private DNS (DoT, port 853) closed. Remove this
#    block if this router's hotspot is for adults only.
/ip dns set servers=1.1.1.3,1.0.0.3 allow-remote-requests=yes
/ip dns static remove [find comment="ngg"]
:foreach n in={"www.google.com";"www.google.com.ng"} do={ /ip dns static add name=\$n type=CNAME cname=forcesafesearch.google.com comment="ngg" }
:foreach n in={"www.youtube.com";"m.youtube.com";"youtubei.googleapis.com";"youtube.googleapis.com";"www.youtube-nocookie.com"} do={ /ip dns static add name=\$n type=CNAME cname=restrict.youtube.com comment="ngg" }
/ip dns static add name=www.bing.com type=CNAME cname=strict.bing.com comment="ngg"
:local hs [/ip hotspot get [:pick [/ip hotspot find] 0] interface]
/ip firewall nat remove [find comment="ngg"]
/ip firewall nat add chain=dstnat in-interface=\$hs protocol=udp dst-port=53 action=redirect to-ports=53 comment="ngg"
/ip firewall nat add chain=dstnat in-interface=\$hs protocol=tcp dst-port=53 action=redirect to-ports=53 comment="ngg"
/ip firewall filter remove [find comment="ngg"]
/ip firewall filter add chain=forward in-interface=\$hs protocol=tcp dst-port=853 action=reject comment="ngg"
/ip firewall filter add chain=forward in-interface=\$hs protocol=udp dst-port=853 action=reject comment="ngg"
ROS;
    return [
        'scriptName' => 'RouterOS script — paste into New Terminal',
        'script' => $script,
        'steps' => [
            ['h' => '1. Update the router', 'text' => "System → Packages → Check for updates. RouterOS 7.19 or newer trusts NGG’s certificate with nothing to import.\nOn 7.1–7.18: download the certificate of " . (parse_url($url, PHP_URL_HOST) ?: 'this site') . "’s issuer (for Let’s Encrypt, ISRG Root X1 from letsencrypt.org/certificates), drag it into Files, then run:\n/certificate import file-name=isrgrootx1.pem trusted=yes"],
            ['h' => '2. A hotspot on the members’ network', 'text' => "If the router has no hotspot yet: IP → Hotspot → Hotspot Setup, and choose the bridge or VLAN the members’ Wi-Fi is on. Skip the step that creates a user — NGG supplies them.\nKeep staff devices and the office on a different network: the filtering in step 5 applies to the hotspot’s network only."],
            ['h' => '3. Paste the script', 'text' => "WinBox → New Terminal, paste the whole script, press Enter. It can be pasted again at any time — after rotating the key, or to repair the setup."],
            ['h' => '4. Members sign in', 'text' => "Members join the Wi-Fi and the sign-in page opens. They type their printed ID (e.g. 026-014) as the username and their Wi-Fi PIN, which the app shows under Me → Wi-Fi. Their device is remembered for 30 days.\nPhones that use a private (rotating) Wi-Fi address forget the sign-in when the address changes; set that network to use the phone’s own address."],
        ],
        'diagnose' => "Each fetch also tells NGG how many people are online, the router’s CPU and free memory, and how long it has been up — as hourly summaries, never who visited what. Every night at 03:15, or when you press “Test the line” here, it downloads 8 MB from NGG and reports the speed (to the nearest second’s timing, so treat it as a guide).",
        'check' => "In the terminal:\n/system script run ngg-wifi-sync\n/ip hotspot user print count-only where comment=\"ngg\"\nThe count should match “People on it” here, and this gateway shows as Working within two minutes. /log print where message~\"NGG\" shows any problem.",
        'trouble' => "“fetch_failed”: the router cannot reach NGG — check its internet, DNS and clock.\n“certificate verify failed”: the clock is wrong, or RouterOS is older than 7.19 without the certificate imported (step 1).\n“truncated” or “incomplete”: a reply was cut short; nothing was applied and the router kept its users.\nA member can’t sign in: check them under “Who gets on” here first — it says why somebody is not on the list.",
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
        'scriptName' => 'Sync script — save as /usr/local/bin/ngg-wifi-sync',
        'script' => $script,
        'steps' => [
            ['h' => '1. The bridge', 'text' => "A Raspberry Pi (or any small Linux machine) on the centre’s network, always on, with a fixed address. Install Raspberry Pi OS Lite, then:\nsudo apt update && sudo apt install -y freeradius curl"],
            ['h' => '2. Let the controller ask it', 'text' => "Add the controller (or firewall) to /etc/freeradius/3.0/clients.conf, with a long random secret you also give the controller:\nclient centre-wifi {\n  ipaddr = 192.168.1.2\n  secret = A-LONG-RANDOM-SECRET\n  require_message_authenticator = yes\n}\nIf the controller cannot sign in afterwards, set require_message_authenticator = no — some older controllers don’t send it."],
            ['h' => '3. Read NGG’s list', 'text' => "In /etc/freeradius/3.0/mods-config/files/authorize add this line near the top:\n\$INCLUDE ngg-users\nThen create it empty: sudo touch /etc/freeradius/3.0/mods-config/files/ngg-users"],
            ['h' => '4. The sync, every 2 minutes', 'text' => "Save the script below as /usr/local/bin/ngg-wifi-sync, then:\nsudo chmod 700 /usr/local/bin/ngg-wifi-sync\necho '*/2 * * * * root /usr/local/bin/ngg-wifi-sync' | sudo tee /etc/cron.d/ngg-wifi\nsudo /usr/local/bin/ngg-wifi-sync"],
            ['h' => '5. Point the controller at the bridge', 'text' => "UniFi Network: the guest hotspot portal’s authentication set to RADIUS, with the bridge’s address and secret. Test that a member’s speed limit is applied before relying on it.\nTP-Link Omada: Site → Network Config → Authentication → Portal, authentication type “RADIUS Server”.\npfSense: Services → Captive Portal → the zone → RADIUS authentication; turn on “Reauthenticate connected users every minute” so somebody removed from NGG is signed out within a minute.\nOPNsense: Captive portal → the zone → authenticate with a RADIUS server (it does not apply per-person speeds)."],
        ],
        'check' => "sudo /usr/local/bin/ngg-wifi-sync && grep -c Cleartext-Password /etc/freeradius/3.0/mods-config/files/ngg-users\nThe count should match “People on it” here. radtest 026-014 <their PIN> 127.0.0.1 0 testing123 checks one person against the bridge itself.",
        'trouble' => "The bridge cannot take anybody off a controller by itself: a removal bites at that person’s next sign-in, within a minute on pfSense with re-authentication on, and at most after 8 hours otherwise (every session NGG allows is given that end).\n“Devices at once” needs FreeRADIUS’s session tracking (radutmp) switched on in sites-available/default, and even then it lets people in when it cannot check. Don’t rely on it as a limit.\n“reload_failed”: run sudo freeradius -XC to see why; the last good list was put back.",
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
        'scriptName' => 'Sync script — save as /usr/bin/ngg-wifi-sync',
        'script' => $script . "\n\n" . $binauth,
        'steps' => [
            ['h' => '1. Packages', 'text' => "opkg update && opkg install opennds ca-bundle libustream-mbedtls"],
            ['h' => '2. The list', 'text' => "Save the first script as /usr/bin/ngg-wifi-sync (chmod 700), then run it every 2 minutes:\necho '*/2 * * * * /usr/bin/ngg-wifi-sync' >> /etc/crontabs/root && service cron restart"],
            ['h' => '3. The sign-in check', 'text' => "Save the second script as /etc/ngg-wifi/custombinauth.sh (chmod 700) and point openNDS at it:\nuci set opennds.@opennds[0].custombinauth='/etc/ngg-wifi/custombinauth.sh' && uci commit opennds && service opennds restart\nThe sign-in page must ask for the ID and the PIN: use openNDS’s ThemeSpec login (login_option_enabled 3) with two fields. This is the step to prove on one router before any other."],
        ],
        'check' => "/usr/bin/ngg-wifi-sync && wc -l /etc/ngg-wifi/users — the count should match “People on it” here. logread -e ngg-wifi shows any problem.",
        'trouble' => "Pilot: openNDS documents the sign-in hook and ndsctl deauth, but the PIN sign-in page has to be proven on a real router first. Until it is, use a MikroTik router or the RADIUS bridge at a centre.\nopenNDS keeps a person signed in for the session time (here 30 days) — that is its “remember this device”.",
    ];
}

/* ── Anything else: the JSON feed ────────────────────────────────────────── */

function wifi_setup_generic(array $r, string $url): array {
    $gw = (string)$r['gatewayId'];
    return [
        'scriptName' => 'Example request',
        'script' => "curl -fsS -H 'X-NGG-Gateway: {$gw}' -H 'X-NGG-Key: PASTE-THE-KEY-HERE' '{$url}?since=0'",
        'steps' => [
            ['h' => 'The request', 'text' => "GET {$url}?since=<version>\nHeaders: X-NGG-Gateway: {$gw} and X-NGG-Key: <its key>. Never put the key in the address.\nsince is the version you last applied in full (0 the first time). Optional: os=<your platform and version>, error=<a short word for what went wrong last time>, full=1 to ask for everything."],
            ['h' => 'The reply', 'text' => "{ \"version\": 12, \"full\": false, \"next\": 120, \"count\": 214,\n  \"profiles\": { \"ngg-member\": { \"down\": 10, \"up\": 5, \"devices\": 1, \"hours\": \"\" }, … },\n  \"users\": [ { \"username\": \"026-014\", \"pin\": \"482913\", \"profile\": \"ngg-member\", \"action\": \"add\" }, … ] }\nSpeeds are Mbit/s. hours is blank (all day) or like 08:00-18:00; NGG already leaves people off outside their hours."],
            ['h' => 'Applying it', 'text' => "add and set: create or update the user with that PIN and profile. remove: delete the user and end their session.\nfull: true means the list is everybody — remove every user you made from NGG that is not on it.\nOnly after applying everything, send the version back as since next time. If you send an older one, NGG sends a full list again. Ask again after next seconds.\nOn any failure keep the users you have: NGG never assumes a list was applied until you confirm it."],
        ],
        'check' => "The first request returns full: true with everybody. Request again with since=<that version>: an empty users list means nothing changed.",
        'trouble' => "401 with “#error;bad_key”: the key is wrong or was rotated. Each wrong-key request is shown on this gateway here.",
    ];
}
