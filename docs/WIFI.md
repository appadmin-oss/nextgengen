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

## No new connection — the attendance one

The owner's decision of **2026-10-31** (`cac/docs/wifi.md` §2): NGG's Wi-Fi
rides the **attendance** connection, not the person directory's.

```
NGG  --signed with hooks.attendance_secret-->  the gate
the gate  --signed with its own `wifi` key-->  CACENTRE
```

`POST {gate}/v1/issuers/ngg/wifi`, signed exactly as NGG's attendance calls
are: `X-NGG-Timestamp` and `X-NGG-Signature: sha256=<hex HMAC of ts.body>`.
The gate checks it, **spends the signature once** (so a captured roster or
"set my password" cannot be replayed inside its five minutes), stamps the
issuer itself — NGG can only ever speak for NGG's people — and passes it on.

**Wi-Fi works wherever check-in works.** There is no key to add and nothing
to set up. `DIR_PUSH_SECRET_NGG` carries the person directory and only the
person directory; an earlier draft of this integration rode that one, and it
was wrong — CACENTRE deleted those doors on 2026-10-31.

## Passwords

CACENTRE gives each person a **starting password** and holds it until they
replace it with one of their own. A password the member chose is never sent
back to anybody, including them — so the card shows a starting code while one
is in force, and afterwards just says they have set their own.

`setPassword` sets theirs; `newStartCode` asks for a fresh starting one.
CACENTRE's own limit on changes is the limit — a second limit enforced here
would be two limits that disagree.

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

1. **Is the gate connection set up?** `hooks.attendance_secret` in NGG, `NGG_SECRET` on the gate — the same one check-in uses. With
   no key nothing is sent, the member's card says so plainly, and
   `admin.wifi.status` reports `configured: false`.
2. **Does CACENTRE have the same key** for app `ngg`? A mismatch is
   `bad_signature`.
3. **Is CACENTRE's Wi-Fi deployed?** At the time of writing it lives on the
   branch `claude/cacentre-wifi-authority` and is **not merged to main**, so
   `/api/wifi-roster.php` does not exist on a deployment built from main.
4. **`unknownSites` in the Control Room** names centres CACENTRE has no site
   for. Those members reach the hubs only.
