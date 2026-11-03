# Wi-Fi — NGG's half

**CACENTRE runs the network and is the authority.** That is the estate's
decision (`cac/docs/wifi.md` in cacentre-site, 2026-10-28), and it is the
opposite of what NGG's own earlier design assumed: routers now fetch their
list from **CACENTRE**, not from here. Shared hosting can neither run RADIUS
nor reach a router behind NAT, and only one place should hold a PIN.

NGG's half is small and entirely about its own people:

| NGG does | NGG never does |
|---|---|
| says who its people are, and its **say** about each (`wifi.roster`) | decide who gets on |
| shows one member their own sign-in name and PIN (`wifi.card`) | hold a PIN |
| names the centres CACENTRE has no site for | talk to a router |

## No new connection

Both documents ride the connection this estate already has with CACENTRE —
the `DirectoryEnvelope` wire, the key **`DIR_PUSH_SECRET_NGG`**, CACENTRE's
address. Only the document type differs, and CACENTRE refuses a token of one
type at another's door.

**Setting that one key turns on both the person directory and the Wi-Fi.**
There is no second secret and no second address. If the Wi-Fi is not working,
check that key first — `admin.wifi.status` says whether it is set.

Everything here signs through `dirpush_token()` and posts through
`dirpush_call()` (`domain/directory-push.php`). One signer, because a second
copy of the envelope is a second place the wire can drift from CACENTRE's —
and a drift shows up as `bad_signature`, which does not say which side moved.

## Our say

`wifi_verdict_for()` reads the member row **every time**. Nothing is stored:
a saved verdict goes stale the moment somebody is suspended, and the gap
between the two is somebody on the internet who should not be.

First case that applies decides, worst first:

| Record | Our verdict | Kind |
|---|---|---|
| suspended, inactive, withdrawn, deactivated, deleted | `off` | — |
| graduated | `off` | — |
| Summer participant outside their edition's dates | `off` | `participant` |
| Summer participant inside them | `on`, with `validUntil` = the edition's end | `participant` |
| on the conduct ladder at evicted or suspended | `off` | — |
| on the Dormant Track | `limited` | — |
| a member with fees outstanding | `limited` | `member` |
| NGG staff, mentor, instructor | `on` | `staff` |
| an active member | `on` | `member` |

Money is a **limit, never a cut-off**. A child who owes fees is still a child
of this programme, and taking the internet off them is not how this
programme collects. Staff are not limited for fees at all.

CACENTRE decides what our say is worth: a CACENTRE block beats anything here.

## The push

A **full** push (`full: true`) means "this is everybody", and CACENTRE
withdraws anyone of ours missing from it. So a full push is only ever sent
when the whole roster fits in one — past `WIFI_ROSTER_MAX` (5,000, CACENTRE's
own cap) it goes as several partial pushes, which withdraw nobody. CACENTRE's
`too_many` refusal is the backstop if this side ever gets the arithmetic
wrong: it refuses the list whole rather than cutting it, because a cut list
called `full` would withdraw everybody past the cut.

The web-cron sends a full push every 30 minutes, so somebody suspended this
morning is off the Wi-Fi by the next tick.

**`unknownSites`.** A member's home site is their centre's CODE, lower-cased
(`EG` → `eg`). A centre CACENTRE has no site for comes back named, with how
many people it held; those people can sign in at the hubs only until somebody
adds the site at CACENTRE. It is kept in the `wifi_push` setting and shown in
the Control Room, because nothing else would ever surface it.

## A member's own card

`member.wifi.card` asks CACENTRE for the one person asking, every time.
Nothing is cached. `newPin` asks CACENTRE to mint a new one; **its** limit on
resets is the limit, because a second limit enforced here is two limits that
disagree.

`card: null` is CACENTRE saying it has not been told about this person yet —
a real answer, not a failure, and usually means the roster has not been
pushed since they joined.

## If it is not working

1. **Is `DIR_PUSH_SECRET_NGG` set?** Same key as the person directory. With
   no key nothing is sent, the member's card says so plainly, and
   `admin.wifi.status` reports `configured: false`.
2. **Does CACENTRE have the same key** for app `ngg`? A mismatch is
   `bad_signature`.
3. **Is CACENTRE's Wi-Fi deployed?** At the time of writing it lives on the
   branch `claude/cacentre-wifi-authority` and is **not merged to main**, so
   `/api/wifi-roster.php` does not exist on a deployment built from main.
4. **`unknownSites` in the Control Room** names centres CACENTRE has no site
   for. Those members reach the hubs only.
