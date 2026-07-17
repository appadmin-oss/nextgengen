# NGG / Summer School 2026 — Implementation Plan

Grounded against the actual code (`api/_lib/*`, `page-admin.jsx`, `page-other.jsx`,
`components.jsx`), not the docs. Every table / op / component named below either
exists today (cited) or is a new addition shaped to the existing conventions.
This plan supersedes nothing already shipped; it sequences what's next.

Two tracks:
- **Track A — Photos / headshots** (urgent; broken today, blocks good ID cards).
- **Track B — Platform** (dashboard, scoped admins, stars, awards, V3, status,
  curriculum, recognition). Builds on `docs/NGGFeatureDesign…` where it exists;
  this doc adds the missing pieces and one build order for everything.

---

## TRACK A — Fix the ID photo pipeline (do first)

### A0. Root-cause diagnosis (verified in code)

There are **two disjoint photo systems**, which is the source of most of the mess:

1. **Client `PhotoCapture`** (`components.jsx:1007`) — camera/upload →
   `NGGApi.uploadFile(file,"headshot")` → Cloudinary signed upload →
   `cldEnhance(url)` (a client-built `c_fill,g_face,…` transform string,
   `components.jsx:969`) → stored straight into `data.photoUrl`.
   Paste-link just does `onChange(linkVal.trim())` — the **raw external URL**,
   with no upload, no enhance, no validation.
2. **Server `photo_process` pipeline** (`api/_lib/domain/photos.php:170`) —
   `photo_ingest` → `ai_photo_review` (score + `no_face`/`multiple_faces`/
   `not_a_child_headshot` flags) → `cloudinary_edit` (face-crop + studio
   backdrop) → `editedUrl` → `photo_apply_to_subject` sets `photoUrl`
   (`photos.php:323`).

The card renders `card.photoUrl` (`admin_cards_data`), which can be set by
*either* path depending on how the person was registered — so validation and
cropping are inconsistent.

**The three reported bugs map to this exactly:**

| Symptom | Root cause | Evidence |
|---|---|---|
| **Upload doesn't work** | `upload-sign.php` starts with `require_session()` (`api/member/upload-sign.php:22`). The Join/apply flow and gate registration are **public — no session** → 401 → the UI shows "Uploads aren't configured." Guardians on the reshoot token page hit the same wall. | `PhotoCapture.uploadBlob` → `uploadFile` → `/member/upload-sign.php` (session-gated) |
| **Paste-link doesn't work** | Link-paste stores the raw URL verbatim (`components.jsx` link branch). It's never validated as an image, never ingested/cropped, and a Drive/Photos "share" link isn't a direct image → broken `<img>`; on export it's cross-origin → tainted → dropped. | `onChange(linkVal.trim())` |
| **Cloudinary edit "reverts" on download** | The card shows a Cloudinary/external URL on screen (fine), but `html2canvas` needs `Access-Control-Allow-Origin` to read cross-origin pixels. When it can't (external links, or an un-CORS'd transform), the image is **tainted and dropped**, so the exported PNG/PDF loses the photo (or shows the scene default) — reads as "the edit reverted." | `vendor/card-export.js` `nodeToImage` (`useCORS:true`) |

Plus: the **face crop mis-frames** on some captures (the "SEUN EL" half-face) —
`g_face` picks the wrong region on off-centre webcam selfies, and nothing
enforces a portrait framing before accept.

### A1. Fixes (in order)

1. **Public upload signing.** Add a public, rate-limited signer for the
   headshot kind only, OR relax `upload-sign.php` to allow the `headshot`
   kind pre-session behind the existing `upload.sign` rate limit + a size cap.
   Preferred: a dedicated `api/public/upload-headshot-sign.php` (kind locked to
   `headshot`, `resource_type=image`, tight `max_bytes`, `rate_limit_check`),
   so anonymous applicants and token-authed guardians can actually upload. No
   change to the authenticated `member/upload-sign.php`.
2. **One ingest path — always validated.** Route **every** capture (camera,
   upload, *and* paste-link) through `photo_ingest` → `photo_process` so the
   server AI validator (`ai_photo_review`) and the identity-safe crop always
   run, and issuance stays gated by the existing `photo_gate_issuance` +
   `photo_approved_for()`. Paste-link becomes "fetch the URL server-side →
   ingest as a normal asset" (with an allowlist / content-type + size check),
   not "trust a foreign URL forever."
3. **Client-side headshot validator (fast reject before upload).** In
   `PhotoCapture`, before `uploadBlob`, run cheap local checks on the captured
   canvas and reject with specific guidance:
   - resolution ≥ ~600×750 after cover-crop;
   - brightness in range (mean luma) — reject too-dark/blown-out;
   - blur check (variance of Laplacian on a downscaled grey copy) — reject soft;
   - **face presence + single face + centred** via the `FaceDetector` API where
     available (Chrome/Android — our primary audience), falling back to "server
     will check" where it isn't. This is the "proper validator" — pair the cheap
     client gate with the existing server AI gate so bad photos never reach a card.
4. **Export CORS — stop the "revert."** In `card-export.js`, before rasterising,
   inline every card image as a same-origin data URI (fetch → dataURL), exactly
   like the QR-email fix already does. If a fetch is cross-origin-blocked, route
   it through a tiny same-origin image proxy (`api/public/img-proxy.php?u=…`,
   allowlisted to the Cloudinary cloud + rate-limited) so `html2canvas` never
   sees a foreign origin and the edited photo always lands in the PNG/PDF.
5. **Crop safety.** Keep `g_face` but add `g_face:center`/`z_` guard and a
   visible crop preview + nudge control in `PhotoCapture` (and the reshoot page)
   so a mis-framed auto-crop can be corrected before it's saved — the person
   sees exactly what the card will show.

**Effort:** ~2–3 focused days. A1.1 + A1.4 are the quick, high-impact wins
(uploads work for the public; the download stops losing the photo). A1.2 + A1.3
are the "proper headshot + validator" the request asks for.

---

## TRACK B — Platform features

> The dashboard / scoped-admins / stars / awards / V3 designs are specced in
> `docs/NGG…DashboardStarsAwards.md` and remain accurate. Summarised here for
> sequencing, with the **new** items (curriculum, top-5, public status,
> summer/volunteer status, the 13-section Summer dashboard) added in full.

### B1. Centre FK backfill (foundation)
`members.centre` / `summer_students.centre` are free text; a real `centres`
table exists (migration 14). Add `centreId` columns + backfill so every
per-centre query joins reliably. **Everything below depends on this.** (½ day.)

### B2. Scoped admins
New `members.centreScope` (JSON array of `centreId`, NULL = all — today's
behaviour). New `admin_centre_gate()` helper next to `admin_cap_gate`; every
per-centre list adds one scope clause. Editable in **Access & roles** via the
existing `admin.members.caps` op. Also: **fix the dead `audit` (M&E) role** —
add `"audit"` to `hasConsole` (`page-admin.jsx:107`) and give it a Dashboard
section, since it currently signs in to an empty console.

### B3. General dashboard + per-centre analytics (the Summer School 2026 board)
One read-only aggregation op `admin.dashboard.overview` (live `GROUP BY`, same
style as `admin_behaviour_list`), scoped by `centreScope`. Maps directly to the
requested **13-section board**:

| Requested section | Source |
|---|---|
| 1. Hero (week/day, centre count, enrolled, attendance) | `attendance`, `summer_students`, session state |
| 2. Sticky global filter bar (week/day/centre/dept/activity/age/gender/subject) | client filter over one payload |
| 3. Executive KPIs w/ trends (▲▼ vs last week) | dashboard op + `daily_summary` (B6) for deltas |
| 4. Live programme timeline | `sessions` / schedule + `date=today` |
| 5. Centre performance (sortable table + cards) | `byCentre` roll-up |
| 6. Interactive map (pins → drill-down) | `centres` (needs lat/lng — already used by geofence) |
| 7. Activity analytics | `member_progress`, `attendance`, `assignments` |
| 8. Academic insights (subject averages, growth) | **needs curriculum/subjects (B8)** + `assignment_submissions` grades |
| 9. Attendance analytics (trends, heatmap, late/absent) | `attendance` (+ `status`/`lateMinutes`, already shipped) |
| 10. Weekly recognition (best student/centre/teacher/volunteer/dept) | **top-5 / awards (B5, B7)** |
| 11. Impact gallery | `photo_assets` (approved) + posts/media |
| 12. Research & impact (correlations, pre/post) | dashboard op + exports |
| 13. Public downloads (PDF/CSV/datasets) | reuse the existing CSV export + a PDF export |

Ship in two passes: **B3a** = KPIs + centre table + attendance analytics + live
timeline (covers §1,3,4,5,9); **B3b** = academic/activity/map/research/gallery
(§6,7,8,11,12) once curriculum + recognition land.

### B4. Mentor stars (behaviour tracking, one-time/daily-capped)
New `member_stars` ledger (1–3 stars, **one rating per student per day**,
guard-query like `volunteer_points`). Given only by the *assigned* mentor
(`mentor_assignments`, `status='active'`). Extends `recompute_member_stats()` to
mint star-derived badges. New **Mentor Portal** (4th portal, same `PortalGate`
pattern) is where stars are given. Also emits a lightweight `behaviour_logs` row
so stars show in the existing M&E trend for free.
- **Mentors grouped by department** → mentor's `mentor_assignments` scoped to a
  department/track; add a `department` field to the assignment or mentor row.
- **In-class mentoring + supervision** → the portal's mentee list is the mentor's
  assigned class for the day.

### B5. Top-5 recognition (mentor decides, with notes)
New op `admin.recognition.top` — a mentor/centre-lead picks the top N (default 5)
per centre/period with a required note, stored as `awards` rows (B7,
`name='Top 5 — <period>'`, `note` mandatory). Feeds dashboard §10.

### B6. Daily summary / status
Nightly `api/tools/daily-summary.php` (cron, same pattern as
`sync-afrovanguard.php`) writes one `daily_summary` row per centre per day
(present/absent/late, stars, flags). Powers KPI deltas (B3 §3) and a
staff morning digest via the existing `Notifications`/`email_template()`.

### B7. Awards + "Afrovanguard value"
New `awards` table (supersedes the volunteer-only `kind='award'` rows in
`volunteer_points`): `subjectType`, `name`, `tier`, `valueNaira` (the
Afrovanguard-assigned ₦ amount), `eligibilityStatus`. Mint is gated by the
`POLICY.md` attendance-strike rule (freeze eligibility when dormant). Confirm the
real ₦ figures with the policy owner before wiring money-adjacent logic live.

### B8. Curriculum / subjects (secondary) — new, enables Academic Insights
New `subjects` table (`subjectId`, `name`, `track`, `level` — e.g. secondary) +
`curriculum` entries (week → subject → lesson/topic). `assignments` already
carry `track`; extend to reference `subjectId`. This unlocks dashboard §8
(subject averages, knowledge growth) and per-subject assessment completion.

### B9. V3 Champion (Verbal · Vocal · Visual)
New `v3_scores` table (1–5 each, weekly, one per student per week), composite
/15. "Champion" minted as an `awards` row per centre per period, with the same
attendance-freeze check. Rated in the Mentor Portal (B4).

### B10. Public status page + status for summer students / volunteers
- **Public status page** — a no-auth, read-only board (like a live "how's the
  programme doing"): per-centre attendance traffic-lights + headline KPIs,
  served from a cached, PII-free slice of B3 (no names — aggregates only), at a
  public route (`/status`). Auto-refresh by polling (no WebSocket in this stack).
- **Individual status** — for a summer student (via `/q/<token>`) and a volunteer
  (via `/q/<token>`): "here's where you stand" — attendance days, stars,
  badges/awards, V3, next milestone. Extends the existing profile pages rather
  than a new surface.

---

## Consolidated build order

1. **A1.1 + A1.4** — public upload signing + export CORS inlining (photos work
   end-to-end and stop reverting on download). *Quick, unblocks the ID cards.*
2. **A1.2 + A1.3 + A1.5** — one validated ingest path + client headshot
   validator + crop preview. *"Proper headshot with a proper validator."*
3. **B1** — centre FK backfill. *Foundation for all analytics.*
4. **B2** — scoped admins + revive the `audit`/M&E role.
5. **B3a** — dashboard KPIs + centre table + attendance + live timeline.
6. **B4 + B9** — Mentor Portal, stars, V3 (same portal, ship together).
7. **B6** — daily summary job (trivial once B3 queries exist).
8. **B8** — curriculum/subjects → then **B3b** (academic/activity/map/gallery).
9. **B5 + B7** — recognition + awards (confirm ₦ values first).
10. **B10** — public status page + individual status.

## Schema diff (new)
`members.centreId`, `summer_students.centreId`, `members.centreScope`,
`member_stars`, `v3_scores`, `daily_summary`, `awards`, `subjects`,
`curriculum` — plus `mentor_assignments.department`. All additive migrations
(next after 35), mirrored into `db/schema-mysql.sql`.

## What I need from you to start
- **Go/priority**: start with Track A (photos) — yes/no.
- **₦ award values** (B7/B9) — the real figures, or confirm 0/non-monetary for now.
- **Public status page**: aggregates-only (no names) confirmed? (safeguarding).
