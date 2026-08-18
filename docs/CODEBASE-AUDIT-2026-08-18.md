# Codebase audit — flaws & gaps

_Date:_ 2026-08-18 · _Scope:_ full repository (~56k LOC PHP, ~40k LOC JSX,
398 dispatcher ops, 2,105 backend tests) · _Schema:_ `schema_version` **92**
· _Branch:_ `claude/codebase-audit-analysis-eu8x7a`

This is a fresh pass, not a re-read of `NGG-AUDIT-INDEX.md`. Every finding
below was verified against the running code — two of them with a reproduction
inside the test harness. Findings already recorded in the audit index (CSP
`unsafe-eval`, giant single-file modules, `fees_balance` scan cost) are not
repeated; §6 notes what has drifted in that document since it was written.

---

## 0. Method

- Static sweeps for SQL interpolation, `ORDER BY`/`LIMIT` injection, XSS sinks,
  committed secrets, and ungated endpoints.
- Gate-coverage check across all 200 API files (`require_session` /
  `require_admin` / `require_super_admin`).
- `php api/tests/run.php` — **2,105 passed, 0 failed**.
- `node build.js` — clean; `dist/` is byte-identical to a fresh build (only the
  `builtAt` timestamp in `build-manifest.json` moves). No deploy-artifact drift.
- Dispatcher map integrity: all 398 op→handler pairs resolve to a defined
  function.

## 1. What is sound

Worth stating plainly, because it shapes the priority of everything below.

- **No SQL injection surface.** Every query is placeholder-bound. The four
  places that interpolate (`ORDER BY $order` in `registration.php:2199` and
  `selfreg.php:538`; `LIMIT $per` in `journal.php:349`; `LIMIT $limit` in
  `nudges.php`) all interpolate whitelisted literals or clamped integers.
- **No client-trusted identity.** Across `api/member/**` and `api/admin/**` the
  requester is always `$s['mid']` from the signed session; only the *target* id
  comes from the request, and the domain layer re-gates on it.
- **CSRF is enforced centrally** (`bootstrap.php:113`), not per-endpoint, with a
  small and individually reasoned exemption list.
- **Webhooks verify HMACs** before doing anything (`hooks/attendance.php`,
  `hooks/paystack.php`), with `hash_equals` and a timestamp window.
- **No XSS sinks.** Exactly one `dangerouslySetInnerHTML` in the app, fed by a
  server-generated QR SVG. The markdown renderer emits React nodes by design.
- **No secrets committed**; `config.php` is gitignored in both `api/` and `dist/`.
- **Account-level lockout** on password sign-in (8 failures → 15 min) and a
  per-challenge attempt cap on OTP. These survive IP spoofing — which is why
  finding 2 below is scoped the way it is.
- **The chess engine is genuinely well-tested**: castling rights, castling
  through check, en passant, under-promotion, stalemate vs. check, threefold
  repetition, plus a full game played to mate.

---

## 2. Findings

### HIGH-1 — TOTP enrolment silently overwrites an existing second factor

`api/_lib/domain/auth.php:417` · `api/auth/admin-totp-setup.php:5`

`auth_totp_setup()` mints a fresh secret and backup codes and writes them over
whatever was there, unconditionally. It never checks whether the admin is
already enrolled. The HTTP endpoint in front of it calls `session_read()` — not
`require_admin()` — so it is reachable by a session that has **not** passed 2FA
(`adminOk` is `false` until `auth/admin-2fa.php` runs).

**Impact — full 2FA bypass.** An attacker holding only an admin password:

1. `POST /api/auth/login.php` → session cookie, `adminOk: false`.
2. `POST /api/auth/admin-totp-setup.php` → receives a new secret, and the
   legitimate admin's authenticator is silently invalidated.
3. `POST /api/auth/admin-2fa.php` with a code from that secret → `adminOk: true`.

Reproduced in the harness (temporary probe, since reverted):

```
✗ FAIL: POC: re-enrolment is REFUSED once TOTP is already set
```

The rest of the system already assumes this cannot happen: `util.php:839`
computes `needsTotp` as `is_admin_role($role) && empty($totpSecret)`, the admin
client only shows the setup panel when that flag is set (`page-admin.jsx:324`),
and a proper recovery path exists for a lost authenticator —
`admin_member_reset_2fa()` (`auth.php:466`), which is super-admin-only and
clears the secret so the next sign-in re-enrols. Self-service re-enrolment is
not a designed capability; it is an unguarded write.

**Fix.** Refuse in the domain layer when `totpSecret` is already set — the
guard belongs there, not in the endpoint, because `backend_dispatch` is the
seam every caller passes through:

```php
if (!empty($member['totpSecret'])) return ['ok' => false, 'error' => 'already_enrolled'];
```

Add `require_admin()`-equivalent semantics is *not* the fix on its own (a
first-time enrolling admin has no `adminOk` yet and must be able to reach it);
the enrolment-state check is what closes the hole. Tests to add: re-setup is
refused; the stored secret is unchanged after a refused attempt; a super-admin
reset re-opens enrolment.

---

### HIGH-2 — `client_ip()` trusts forwarded headers from anyone

`api/_lib/bootstrap.php:119-129`

```php
foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $h) {
```

There is no trusted-proxy check. Any client can send
`X-Forwarded-For: 10.0.0.<n>` and be treated as a different address on every
request. `REMOTE_ADDR` is only consulted when both headers are absent or
malformed.

`rate_limit_check()` keys every bucket on `client_ip()`
(`rate-limit.php`), so **every IP-keyed throttle in the product is bypassable
by rotating one header.** The limiter itself is otherwise well built —
`flock`-guarded read-modify-write, `Retry-After`, opportunistic GC.

What this actually costs, given the account-level guards that *do* survive:

| Surface | Sole defence | Consequence |
|---|---|---|
| `auth.totpVerify` (`auth.php:437`) | `rate_limit_check('auth.verify')` — **no attempt counter, no lockout** | Admin TOTP (6 digits, ±1 window) is brute-forceable |
| `gate_unlock` (`registration.php:1103`) | `gate.unlock` 8/5min — no counter | Kiosk password guessable |
| `circle_lookup` (`circle.php:219`) | `circle.lookup` 6/5min — no counter | 6-digit code + a name part → a child's name and `memberId`. `config.example.php:307` calls this "safeguarding throttle" |
| `summer.profile`, `application.status`, `student.login` | IP buckets only | Minor-PII enumeration |

Password sign-in and OTP are **not** in scope here — `AUTH_LOCK_AFTER`
(`auth.php:18`) and the per-challenge `attempts >= 5` cap are account-keyed and
hold regardless.

Secondary effect: `audit(..., client_ip())` writes attacker-chosen addresses
into the audit trail, so the log cannot be trusted for attribution or for
building a block list.

**Fix.** Add a `trusted_proxies` config key (CIDR list; Cloudflare's ranges for
this deployment) and only honour `CF-Connecting-IP` / `X-Forwarded-For` when
`REMOTE_ADDR` falls inside it — otherwise return `REMOTE_ADDR`. Separately,
give `auth_totp_verify()`, `gate_unlock()` and `circle_lookup()` account- or
target-keyed failure counters so they do not depend on an IP being honest.

---

### MEDIUM-3 — `config.php` is loaded with no defaults and no validation

`api/_lib/bootstrap.php:52` — `$CONFIG = require __DIR__ . '/../config.php';`

There is no merge against a default array and no boot-time assertion. Security
decisions then read keys directly, without `??`:

```
session.php:34,109,150,180   hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true)
session.php:41,113,154,165   'secure'   => (bool)$CONFIG['cookie_secure']
session.php:43,113,154,167   'samesite' => $CONFIG['cookie_samesite']
session.php:37,111,152,161   setcookie($CONFIG['cookie_name'], …)
csrf.php:23,26,28            same three, for the CSRF cookie
bootstrap.php:76             if ($CONFIG['debug'])
```

On a deployment whose `config.php` predates a key — the normal state of affairs
on shared hosting, where code is redeployed and config is not — PHP 8 emits a
warning and yields `null`, which degrades **silently and in the unsafe
direction**: `(bool)null` turns the `Secure` flag off, `samesite` becomes empty,
and an empty `cookie_secret` means session tokens are signed with an empty HMAC
key — i.e. forgeable.

This is not hypothetical: the test run surfaces it today —

```
PHP Warning: Undefined array key "cookie_name" in api/_lib/session.php on line 173
```

Related, same root cause: four keys are read by the code but absent from
`config.example.php` — `cors_origins` (security-relevant: it controls the
cross-origin allow-list at `bootstrap.php:59`), `log_dir`, `mysql_schema_path`,
`org`.

**Fix.** Merge `config.example.php`'s defaults under the deployment's
`config.php` at load, and hard-fail at boot on missing/weak secrets
(`cookie_secret` short or absent → 500, not a warning). Add the four
undocumented keys to the example file.

---

### MEDIUM-4 — Brute-force floors omit the buckets that matter most

`api/_lib/rate-limit.php:16-80`

`rate_limit_default()` exists for a stated reason:

> …these guarantee a sane throttle exists even on a deployment whose config
> predates a new bucket — without them a missing key silently falls back to the
> loose 'default' (60/min), which for mail-sending or minor-PII lookups is a
> spam-relay / enumeration hazard.

The floors cover `apply`, `contact`, `donate`, `summer.profile`, `arcade.start`,
`photo`, `qr` and others. They do **not** cover `auth.verify`, `auth.request`,
`auth.gateway`, `gate.unlock`, `circle.lookup`, `circle.connect`, `upload.sign`
or `hook` — which exist only in `config.example.php:301-317`. A deployment
missing those entries drops password/OTP/TOTP verification and the kiosk
password from 10/min and 8/5min to the loose 60/min default, with no signal.

The module applies its own principle to the second-tier buckets and not to the
first-tier ones. **Fix:** move the security-critical floors into
`rate_limit_default()`; config may still raise them.

---

### MEDIUM-5 — No transaction boundary around multi-row business writes

`api/_lib/db.php:2502` is the **only** `beginTransaction()` in the codebase, and
it wraps schema migrations. There is no `db_tx()` helper, so every multi-statement
business operation is non-atomic on MySQL/InnoDB. Examples:

- `match_move()` (`matches.php:188`) — inserts into `match_moves`, then updates
  `match_games`. A failure between them leaves a recorded move that the game
  state does not reflect.
- Fee accrual and settlement (`fees.php:531` ledger insert, then member updates).
- `tournament.advance` — bracket progression writes.

`match_moves` has `UNIQUE (matchId, ply)` (`schema-mysql.sql:1641`), which does
prevent the double-move race from corrupting anything — the second concurrent
insert throws and the game row is never updated. That is the right outcome
reached by accident: it surfaces to the player as a generic `internal` error
rather than `not_your_turn`.

**Fix.** Add a `db_tx(callable)` helper (begin / commit / rollback, nestable via
a depth counter, no-op-safe on SQLite) and wrap the ledger, match and
tournament write paths in it.

---

### MEDIUM-6 — Eleven vendored libraries have no recorded version

`vendor/` ships 25 files (~7.1 MB). `vendor-build.js` pins and can `--check`
five of them (`fabric@7.4.0`, `tui-image-editor@3.15.3`,
`tui-color-picker@2.2.6`, `filerobot-image-editor@5.0.0`, `docx@9.7.1`), and an
npm script rebuilds `tanstack-table`. The rest are committed minified blobs with
no version, no integrity hash, and no reproducible recipe:

```
react.production.min.js      react-dom.production.min.js   babel.min.js (3.1 MB)
jspdf.umd.min.js             jszip.min.js                  html2canvas.min.js
jsQR.min.js                  pica.min.js                   qrcode.min.js
fflate.min.js                cropper.min.js
```

None carries a version string in its header. `package-lock.json` is gitignored,
so the build toolchain (`esbuild ^0.23.0`) is unpinned too.

**Impact.** "Are we exposed to CVE-X in jspdf?" cannot be answered without
reverse-engineering a minified file. This is a maintenance and supply-chain
gap, not a live vulnerability. **Fix:** extend `vendor-build.js`'s `PACKAGES`
map to cover every vendored file (or, for the ones with no build step, record
version + SHA-256 in a `vendor/VERSIONS.json` that `--check` verifies), and
commit `package-lock.json`.

---

### LOW-7 — `api/_cache/.htaccess` uses Apache 2.2-only syntax

`api/storage/.htaccess` guards both syntaxes and explains exactly why:

> `Require` is Apache 2.4 (mod_authz_core) and hard-fails a 2.2 host with a 500
> …; `Order`/`Deny` is 2.2 and is ignored by 2.4 unless mod_access_compat
> happens to be loaded. A shared host can be either…

That lesson was not applied to its neighbours. `api/_cache/.htaccess` is
`Order Deny,Allow` / `Deny from all` — **ignored on Apache 2.4** without
`mod_access_compat`, exposing the response cache and `_rl/` rate-limit state.
`api/logs/.htaccess` is the mirror image (`Require all denied`, 2.4-only). The
root `.htaccess` deny blocks (lines 186-195, covering dotfiles, `.sql`, `.md`,
stray `config.php`) are likewise 2.4-only.

Exposure is limited — `cache_ttl` (`config.example.php:330`) only caches public
aggregates — so this is LOW, but it is a one-line inconsistency with a rule the
repo has already written down. **Fix:** use the dual-syntax block everywhere.

---

## 3. Test-coverage gaps

2,105 assertions pass and coverage is broad. Two structural holes:

**The dispatcher map is never exercised as a map.** No test asserts that each of
the 398 `op → handler` pairs resolves to a function that exists. I verified all
398 do resolve today, so this is preventive: a renamed handler or a typo'd op
string would ship and surface in production as a generic `internal` error. A
~10-line test closes it permanently.

**The whole `match.*` family is tested below the dispatcher.** The chess tests
call `match_invite()` / `match_move()` / `match_list()` directly rather than
through `backend_dispatch('match.move', …)`, so the eleven map entries wiring
chess to the API are unverified. Ops with no `backend_dispatch` coverage at all
(62 of 398) cluster in the same way — `match.*` (11), community write paths
(`comment`, `bookmark`, `digest`, `report`, `delete`), integrations
(`test`, `dispatch`, `delete`), `member.deleteAccount`, `member.compliance`,
`admin.policy.sweep`, `admin.photo.replace`.

`member.deleteAccount` deserves its own line: it is the GDPR erasure path and
has no test.

## 4. Nothing found (checked, clean)

Recorded so the next pass need not redo them: SQL injection; client-supplied
requester identity; CSRF bypass; unauthenticated admin/member endpoints (all
files under `api/admin/**` and `api/member/**` carry a gate); webhook signature
verification; committed secrets; XSS sinks; `dist/` drift; dispatcher handler
resolution. `match_poll()`'s lack of a player check is **not** a finding —
spectating is a documented design decision (`matches.php:322-332`), writes are
gated independently, and the poll payload carries no PII.

## 5. Suggested order of work

1. **HIGH-1** — one-line domain guard plus tests. Smallest fix, largest payoff.
2. **HIGH-2** — `trusted_proxies` in `client_ip()`, then failure counters on
   `auth_totp_verify` / `gate_unlock` / `circle_lookup`.
3. **MEDIUM-3 / MEDIUM-4** together — both are "config drift degrades security
   silently"; a defaults merge plus boot-time assertions covers both.
4. **Test gaps** — the dispatcher-map integrity test is ~10 lines and permanent.
5. **MEDIUM-5** `db_tx()`, then **MEDIUM-6** vendor manifest, then **LOW-7**.

## 6. Drift in `docs/NGG-AUDIT-INDEX.md`

The index is otherwise accurate and its open findings still stand. Stale facts:

- `schema_version` is **92**, not 83.
- `api/tests/run.php` is **14,844 lines / 2,105 assertions**, not "~923KB, 427
  tests" — finding 7 in the index ("figures are no longer verifiable") can be
  closed with those numbers.
- File sizes in index finding 3 have moved: `page-admin.jsx` 11,422 LOC,
  `page-other.jsx` 7,916, `page-club.jsx` 3,634, `page-analytics.jsx` 3,383;
  backend `domain/registration.php` 3,464.
- `PAGE_IDS` and the dispatcher have grown; chess/tournaments/Math Lab/mentor
  portal post-date the index entirely.
