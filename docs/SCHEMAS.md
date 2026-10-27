# NGG — data schema

> **Architecture note (updated):** the backend now runs on **PHP + a database**
> (SQLite by default, MySQL in prod) on the shared host — that is the source of
> truth. The canonical schema lives in code: `api/_lib/db.php` (SQLite
> migrations) mirrored by `db/schema-mysql.sql`. DB **column names are the same
> camelCase field names** documented below, so rows map straight to API
> payloads. A few SQL-reserved words are stored under a safe alias and mapped
> back in their handler: `order`→`orderIndex`, `key`→`settingKey`,
> `value`→`settingValue`, `private`→`isPrivate`, assignment `text`→`answerText`.
>
> The tables below double as the layout of the **optional** read-only Google
> Sheets mirror (`api/tools/export-sheets.php` → `apps-script/`). Nothing reads
> from the Sheet; it exists only for admins who want a spreadsheet view. If you
> keep the mirror, header row is row 1 — freeze it.

---

## Tab: `Members`

Directory + auth lookup. One row per teen.

| Column        | Type      | Required | Notes                                                                          |
|---------------|-----------|----------|--------------------------------------------------------------------------------|
| `memberId`    | text      | ✅       | Primary key. Format `NGG-2025-0042` (NGG) or `SUM-2025-0007` (Summer Students).|
| `fullName`    | text      | ✅       | Display name. Used everywhere.                                                  |
| `email`       | text      | ✅       | Login email — magic link + OTP delivered here.                                  |
| `phone`       | text      |          | E.164 format `+234…`. Reserved for SMS OTP later.                               |
| `type`        | enum      | ✅       | `Summer` \| `NGG`                                                               |
| `status`      | enum      | ✅       | `active` \| `graduated-ngg` \| `graduated-vanguard` \| `suspended` \| `inactive` |
| `role`        | enum      |          | `member` (default) \| `admin` \| `super_admin`. Empty = `member`.               |
| `centre`      | enum      | ✅       | `Egbeda` \| `Ayobo`                                                             |
| `photoUrl`    | url       |          | Direct image URL. Drive share links converted automatically by Apps Script.     |
| `track`       | text      |          | `Music` / `Tech` / `Storyteller` / `Public Speaking` / `Leadership` / `Arts` / `Community Intel.` / `Entrepreneurship` |
| `cohort`      | text      |          | "Summer 2025", "NGG 2024" etc. — graduation cohort label.                       |
| `joinDate`    | date      |          | ISO `2025-07-15`.                                                               |
| `dob`         | date      |          | For age gating. Optional.                                                       |
| `parentName`  | text      |          | Parent / guardian name.                                                         |
| `parentEmail` | text      |          | Parent contact — used for parent digest.                                        |
| `parentPhone` | text      |          | Parent phone.                                                                   |
| `school`      | text      |          | School name.                                                                    |
| `bio`         | text      |          | Member-edited self-description (max 280 chars).                                 |
| `socials`     | json      |          | JSON `{"ig":"@handle","x":"@handle","yt":"channel"}`.                           |
| `totpSecret`  | text      |          | Base32 TOTP secret (admins only). Written by `/api/auth/admin-totp-setup`.      |
| `notes`       | text      |          | Admin-only freeform.                                                            |
| `createdAt`   | timestamp | auto     | Filled by Apps Script on insert.                                                |
| `updatedAt`   | timestamp | auto     | Filled on every write.                                                          |

---

## Tab: `Mentors`

Separate from members. A mentor *may* also be a member, but their mentor
record is independent.

| Column         | Type      | Required | Notes                                                          |
|----------------|-----------|----------|----------------------------------------------------------------|
| `mentorId`     | text      | ✅       | `MEN-2025-0007`                                                |
| `fullName`     | text      | ✅       |                                                                |
| `email`        | text      | ✅       |                                                                |
| `phone`        | text      |          |                                                                |
| `status`       | enum      | ✅       | `active` \| `pending-checks` \| `on-break` \| `retired`        |
| `tracks`       | text      | ✅       | Comma-separated tracks they mentor: `Music, Tech`              |
| `centre`       | enum      | ✅       | `Egbeda` \| `Ayobo` \| `Both`                                  |
| `bio`          | text      |          | Public-facing bio.                                             |
| `photoUrl`     | url       |          |                                                                |
| `maxMentees`   | int       |          | Default 8. Used by assignment logic to throttle.               |
| `availability` | json      |          | `{"sat":"09:00-15:00","wed":"16:00-18:00"}`                    |
| `checkedAt`    | date      |          | Last background-check verification date.                       |
| `joinedAt`     | date      |          |                                                                |
| `createdAt`    | timestamp | auto     |                                                                |
| `updatedAt`    | timestamp | auto     |                                                                |

---

## Tab: `MentorAssignments`

Links members to mentors. Many-to-many through this table.

| Column        | Type      | Notes                                          |
|---------------|-----------|------------------------------------------------|
| `memberId`    | text      | FK to Members                                  |
| `mentorId`    | text      | FK to Mentors                                  |
| `track`       | text      | Which track the mentorship covers              |
| `sessionId`   | text      | FK to Sessions — assignments are per-session   |
| `status`      | enum      | `active` \| `ended`                            |
| `startedAt`   | timestamp |                                                |
| `endedAt`     | timestamp |                                                |

---

## Tab: `Sessions`

Calendar of the four annual sessions. Hybrid defaults: Apps Script will
auto-create rows for the current year using defaults if missing, but admin
can override any row.

| Column      | Type      | Required | Notes                                                      |
|-------------|-----------|----------|------------------------------------------------------------|
| `sessionId` | text      | ✅       | Format `TONI-2026`, `MEDI-2026`, `SUMMER-2026`, `DOMI-2026` |
| `code`      | enum      | ✅       | `TONI` \| `MEDI` \| `SUMMER` \| `DOMI`                      |
| `year`      | int       | ✅       | `2026`                                                      |
| `name`      | text      |          | Override display name; defaults to code                     |
| `startDate` | date      | ✅       | ISO `2026-01-04`                                            |
| `endDate`   | date      | ✅       | ISO `2026-03-29`                                            |
| `theme`     | text      |          | Session theme, e.g. "Build the room."                       |
| `isActive`  | bool      |          | Computed by Apps Script daily; admin can force.             |
| `coverUrl`  | url       |          | Hero image for the session.                                 |
| `notes`     | text      |          | Internal notes (rooms, partner sponsors, etc).              |
| `createdAt` | timestamp | auto     |                                                             |
| `updatedAt` | timestamp | auto     |                                                             |

**Defaults** (Apps Script `Sessions.ensureYear()` will seed these if a year has no rows):
- `TONI`   → Jan 4 → Mar 29  (~12 weeks)
- `MEDI`   → Apr 6 → Jun 28  (~12 weeks)
- `SUMMER` → Jul 6 → Aug 30  (~8 weeks intensive)
- `DOMI`   → Sep 7 → Dec 13  (~14 weeks)

These are starting points — admin edits them on the sheet for each year.

---

## Tab: `AnchorMissions`

Master list of all anchor missions, sourced from the Anchor book. One row
per mission. Admin manages these.

| Column         | Type      | Notes                                                       |
|----------------|-----------|-------------------------------------------------------------|
| `missionId`    | text      | `ANCH-W03-M02` (week 3, mission 2)                          |
| `week`         | int       | 1-12                                                        |
| `order`        | int       | Display order within the week                               |
| `theme`        | text      | Week theme (Identity, Discipline, Communication…)           |
| `title`        | text      | Short title                                                 |
| `prompt`       | text      | What the teen must do                                       |
| `proof`        | enum      | `photo` \| `text` \| `audio` \| `video` \| `link` \| `none` |
| `xp`           | int       | Award on completion                                         |
| `type`         | enum      | `Make` \| `Read` \| `Speak` \| `Reflect` \| `Serve` \| `Move` |
| `estimatedMin` | int       | Time estimate                                               |
| `bookPage`     | int       | Page reference in the Anchor book                           |
| `isActive`     | bool      | Whether currently assignable                                |
| `createdAt`    | timestamp | auto                                                        |
| `updatedAt`    | timestamp | auto                                                        |

---

## Tab: `MemberProgress`

Per-member, per-mission progress. One row per (memberId × missionId) once
the member has touched it.

| Column         | Type      | Notes                                                  |
|----------------|-----------|--------------------------------------------------------|
| `memberId`     | text      | FK                                                     |
| `missionId`    | text      | FK                                                     |
| `sessionId`    | text      | FK — Anchor 12 progress is per-session                 |
| `status`       | enum      | `started` \| `submitted` \| `verified` \| `rejected`   |
| `proofUrl`     | text      | Uploaded media / text                                  |
| `verifiedBy`   | text      | Mentor or admin memberId who verified                  |
| `verifiedAt`   | timestamp |                                                        |
| `xpAwarded`    | int       | Captured at time of verification (so XP edits are auditable) |
| `note`         | text      | Member's reflection                                    |
| `startedAt`    | timestamp |                                                        |
| `submittedAt`  | timestamp |                                                        |

---

## Tab: `MemberStats`

Denormalized cache of per-member rollups for fast dashboard rendering. One
row per member. Apps Script recomputes on every progress write.

| Column          | Type      | Notes                            |
|-----------------|-----------|----------------------------------|
| `memberId`      | text      | FK                               |
| `xpTotal`       | int       |                                  |
| `level`         | int       | floor(xpTotal/250)+1             |
| `badgeCount`    | int       |                                  |
| `badges`        | json      | Array of badge slugs             |
| `streak`        | int       | Consecutive days with any activity |
| `lastActiveAt`  | timestamp |                                  |
| `currentWeek`   | int       | 1-12, derived from sessions      |
| `completedThisSession` | int |                                |
| `updatedAt`     | timestamp | auto                             |

---

## Tab: `Events`

Upcoming events, showcases, parent meetings, etc. Admin posts. Members RSVP.

| Column        | Type      | Notes                                                |
|---------------|-----------|------------------------------------------------------|
| `eventId`     | text      | `EVT-2026-0001`                                      |
| `title`       | text      |                                                      |
| `kind`        | enum      | `session` \| `showcase` \| `parent-meet` \| `community` \| `online` |
| `sessionId`   | text      | optional FK to Sessions                              |
| `startAt`     | timestamp |                                                      |
| `endAt`       | timestamp |                                                      |
| `centre`      | enum      | `Egbeda` \| `Ayobo` \| `Online` \| `Both`            |
| `location`    | text      | Free text — room number, online URL, etc.            |
| `coverUrl`    | url       |                                                      |
| `body`        | text      | Long description (markdown allowed)                  |
| `capacity`    | int       | Max RSVPs (0 = unlimited)                            |
| `isPublic`    | bool      | If true, shown to non-members on public Events page  |
| `status`      | enum      | `draft` \| `published` \| `cancelled`                |
| `createdBy`   | text      | admin memberId                                       |
| `createdAt`   | timestamp | auto                                                 |
| `updatedAt`   | timestamp | auto                                                 |

---

## Tab: `EventRSVPs`

| Column      | Type      | Notes                              |
|-------------|-----------|------------------------------------|
| `eventId`   | text      | FK                                 |
| `memberId`  | text      | FK                                 |
| `status`    | enum      | `going` \| `maybe` \| `cancelled`  |
| `rsvpAt`    | timestamp |                                    |
| `attendedAt`| timestamp | filled at check-in                 |

---

## Tab: `Posts`

Blog / news / updates / promotions — one schema, filtered by `kind`.

| Column       | Type      | Notes                                                          |
|--------------|-----------|----------------------------------------------------------------|
| `postId`     | text      | `POST-2026-0001`                                               |
| `slug`       | text      | URL-safe, unique                                               |
| `kind`       | enum      | `blog` \| `news` \| `update` \| `promo`                        |
| `title`      | text      |                                                                |
| `excerpt`    | text      |                                                                |
| `body`       | text      | Markdown                                                       |
| `coverUrl`   | url       |                                                                |
| `category`   | text      | Editorial — "Member Story", "Mentor Note", etc.                |
| `authorId`   | text      | memberId of author                                             |
| `tags`       | text      | comma-separated                                                |
| `status`     | enum      | `draft` \| `published` \| `archived`                           |
| `publishAt`  | timestamp | scheduled publish; Apps Script flips status when reached       |
| `featured`   | bool      | Pin to top of blog index                                       |
| `promoCta`   | text      | (kind=promo only) CTA button label                             |
| `promoUrl`   | text      | (kind=promo only) CTA URL                                      |
| `promoExpires`| timestamp| (kind=promo only)                                              |
| `createdAt`  | timestamp | auto                                                           |
| `updatedAt`  | timestamp | auto                                                           |

---

## Tab: `Notifications`

Per-member notification feed. Admin can push, system can push.

| Column      | Type      | Notes                                                    |
|-------------|-----------|----------------------------------------------------------|
| `notifId`   | text      |                                                          |
| `memberId`  | text      | FK — `*` means broadcast to all members                  |
| `kind`      | enum      | `mission` \| `event` \| `badge` \| `announcement` \| `mentor` |
| `title`     | text      |                                                          |
| `body`      | text      |                                                          |
| `linkPage`  | text      | App route to deep-link (e.g. `anchor`, `event:EVT-…`)    |
| `readAt`    | timestamp |                                                          |
| `createdAt` | timestamp | auto                                                     |

---

## Tab: `Journal`

Private member journal. Only the member + admins can read theirs.

| Column      | Type      | Notes                            |
|-------------|-----------|----------------------------------|
| `entryId`   | text      |                                  |
| `memberId`  | text      | FK                               |
| `sessionId` | text      | FK                               |
| `week`      | int       |                                  |
| `mood`      | enum      | `🔥` \| `🙂` \| `😐` \| `😔` \| `😴` |
| `body`      | text      |                                  |
| `private`   | bool      | If false, mentor can read         |
| `createdAt` | timestamp | auto                             |

---

## Tab: `AuthSessions`

Short-lived login challenges. Apps Script GCs expired rows daily.

| Column       | Notes                                                  |
|--------------|--------------------------------------------------------|
| `token`      | 32-byte hex random — goes in the magic-link URL        |
| `memberId`   |                                                        |
| `email`      | snapshot                                               |
| `otp`        | 6-digit code (also valid for verifying)                |
| `attempts`   | int — 5 strikes and the row is invalid                  |
| `createdAt`  | ISO timestamp                                          |
| `expiresAt`  | ISO timestamp (15 min after createdAt)                 |
| `verifiedAt` | filled when consumed                                   |
| `ip`         | for abuse signals                                      |
| `userAgent`  | for abuse signals                                      |

---

## Tab: `AuditLog`

Rolling log, capped to last ~5000 rows by Apps Script (oldest deleted).

| Column     | Notes                                                                  |
|------------|------------------------------------------------------------------------|
| `at`       | timestamp                                                              |
| `actorId`  | who did it (memberId or `system`)                                      |
| `event`    | `login.request`, `login.success`, `login.fail`, `mission.complete`, `admin.member.create`, etc. |
| `subject`  | what they did it to (memberId / eventId / postId)                      |
| `ip`       |                                                                        |
| `meta`     | JSON freeform                                                          |

---

## Tab: `Newsletter`

Auto-created the first time someone subscribes. One row per unique email
(idempotent upsert).

| Column      | Notes                                          |
|-------------|------------------------------------------------|
| `email`     | lowercased                                     |
| `source`    | where they subscribed — `footer`, `blog`, etc. |
| `status`    | `subscribed` \| `unsubscribed`                 |
| `createdAt` | first subscribe time                            |
| `updatedAt` | last touch                                      |
| `ip`        | snapshot at subscribe (abuse signals)           |

---

## Tab: `Settings`

Singleton key-value store for site-wide config admin can tweak without a deploy.

| Column      | Notes                                          |
|-------------|------------------------------------------------|
| `key`       | text                                           |
| `value`     | JSON                                           |
| `updatedAt` | timestamp                                      |
| `updatedBy` | memberId                                       |

Suggested initial keys:
- `featured_session_id` → which session ID drives the homepage countdown
- `homepage_promo` → JSON object with active promo banner content
- `applications_open` → bool
- `mentor_applications_open` → bool

---

## Indexes Apps Script maintains

Apps Script keeps two **named ranges** as fast lookup indexes (rebuilt on
member write):

- `IDX_EMAIL_TO_MEMBER` — sheet with two columns: email, memberId. Used for
  O(1) lookups during sign-in.
- `IDX_SLUG_TO_POST` — published-post-only index for the public blog feed.

---

## Tab: `Assignments`

Mentor/admin-set work with per-member submissions + grading. Distinct from
Anchor missions (which are the fixed XP curriculum).

| Column          | Type      | Notes                                                       |
|-----------------|-----------|-------------------------------------------------------------|
| `assignmentId`  | text      | `ASG-2026-0001`                                             |
| `title`         | text      |                                                             |
| `instructions`  | text      | What the member must do (markdown ok)                       |
| `track`         | text      | Blank/`All` = every track                                   |
| `centre`        | enum      | Blank/`All`/`Both` \| `Egbeda` \| `Ayobo`                   |
| `sessionId`     | text      | Optional FK — scopes to a session                           |
| `week`          | int       | Optional week label                                         |
| `dueAt`         | timestamp |                                                             |
| `points`        | int       | Max grade                                                   |
| `attachmentUrl` | url       | Brief / resource (Cloudinary or any URL)                    |
| `proof`         | enum      | `text` \| `link` \| `photo` \| `audio` \| `video` \| `file` |
| `status`        | enum      | `draft` \| `published` \| `archived`                        |
| `createdBy`     | text      | admin memberId                                              |
| `createdAt`     | timestamp | auto                                                        |
| `updatedAt`     | timestamp | auto                                                        |

---

## Tab: `AssignmentSubmissions`

One row per (assignment × member). DB column `answerText` is surfaced to the
client as `text`.

| Column         | Type      | Notes                                          |
|----------------|-----------|------------------------------------------------|
| `submissionId` | text      | `SUB-2026-0001`                                |
| `assignmentId` | text      | FK                                             |
| `memberId`     | text      | FK                                             |
| `sessionId`    | text      | FK snapshot                                    |
| `answerText`   | text      | Member's written response (API field: `text`)  |
| `fileUrl`      | url       | Uploaded file (Cloudinary)                     |
| `status`       | enum      | `submitted` \| `graded`                        |
| `grade`        | int       | 0..points                                      |
| `feedback`     | text      | Mentor/admin feedback                          |
| `gradedBy`     | text      | admin memberId                                 |
| `gradedAt`     | timestamp |                                                |
| `submittedAt`  | timestamp |                                                |
| `createdAt`    | timestamp | auto                                           |

## SQL-only tables (post-Sheets) — Volunteers & deployment planning

These live in SQLite/MySQL only (never in the legacy Sheet). Managed via
`api/_lib/domain/volunteers.php` + `events.php`.

### `applications` (kind='volunteer') — new columns
| field     | type | notes |
|-----------|------|-------|
| `centre`  | text | Required for volunteer intake; must match an active `centres.name`. |
| `faculty` | text | Required for `mentor`/`instructor`; from the Form-Builder faculty catalogue. |

### `volunteers` — new columns (migration 40)
| field     | type | notes |
|-----------|------|-------|
| `centre`  | text | Home centre, carried from the approved application. |
| `faculty` | text | Teaching group (mentor/instructor); powers the `/v-status` faculty breakdown. |

### `volunteer_needs` (migration 40) — admin target headcount
| field       | type      | notes |
|-------------|-----------|-------|
| `id`        | int PK    | |
| `centreId`  | text      | FK → `centres.centreId` |
| `role`      | enum      | `admin` \| `mentor` \| `instructor` |
| `faculty`   | text      | `''` = role-level need; non-empty = finer per-faculty target |
| `needCount` | int       | Target headcount |
| `updatedAt` | timestamp | |
| `updatedBy` | text      | admin memberId |

UNIQUE(`centreId`,`role`,`faculty`). Read by `public.volunteer.status` (the
public `/v-status` board) and edited via `admin.volunteers.needs.*`. The
faculty **catalogue** is now the admin-editable `academy_catalogue` setting
(Registration → Academy catalogue), a faculty→courses map that also drives the
volunteer form's per-faculty instructor course picker (`coursesByFaculty` in
`public.volunteer.context`); the Form-Builder `faculty`/`course` fields stay
authoritative for their own flat lists.

### `item_needs` (migration 43) — material (non-headcount) needs
| field         | type      | notes |
|---------------|-----------|-------|
| `id`          | int PK    | |
| `centreId`    | text      | FK → `centres.centreId` |
| `item`        | text      | e.g. Laptops, Keyboards, Chairs, Data |
| `needCount`   | int       | How many the centre needs; **0 = open request** (no set amount — never reads as "met") |
| `filledCount` | int       | How many have come in (tracked directly — no roster) |
| `unit`        | text      | Optional (units, GB, sets, …) |
| `note`        | text      | Optional public note |
| `updatedAt`   | timestamp | |
| `updatedBy`   | text      | admin memberId |

UNIQUE(`centreId`,`item`). Edited via `admin.items.needs.upsert|delete` in the
Volunteer → Needs editor; surfaced per-centre, on the `/v-status` **overview**
(a "Materials needed" roll-up + an "Items needed" KPI), and as
`itemNeed/itemFilled/itemGap/itemTypes/itemStillNeeded/itemOpen` KPIs. Unlike
volunteer needs (filled from the live roster), items have no roster so the
received count is entered by an admin. An **open** item (`needCount` 0) is a
standing request: it shows the running received count, reads as "any amount
welcome", and always counts as still-wanted.

### `profile_projects` / `profile_notes` (migration 45) — public profile enrichment
Both keyed by (`subjectType` ∈ `student`|`volunteer`, `subjectId`), so one model
serves every profile.

**`profile_projects`** — a member's public work: `title`, `kind` (label, e.g.
`CODE · CIVIC`), `url`, `imageUrl` (both https-only on output), `sortOrder`.
Curated by admins; always public.

**`profile_notes`** — mentor notes: `author`, `note`, `isPublic`. **Private by
default — only `isPublic=1` notes are ever returned to the public profile.**

Edited via `admin.profile.{extras.get, project.upsert, project.delete,
note.upsert, note.delete}` (cap `people`), surfaced in the admin Student/Volunteer
editors ("Profile projects & mentor notes"). `public.summerProfile` embeds
`projects` (all) + `notes` (public only) into the profile payload, rendered on
the `/q/<token>` · `/s/<handle>` profile page.

## SQL-only tables — the NGG Club curriculum (migration 125)

Managed by `api/_lib/domain/curriculum.php`.

### `curriculum_units`
| field | notes |
|---|---|
| `unitId` | `CUR-…`, unique. |
| `course` | An academy catalogue course, or `''` for the whole Club. |
| `level`, `week`, `position` | The slot. UNIQUE (`course`, `level`, `week`, `position`). |
| `title`, `summary`, `objectives`, `body` | Plain text; the SPA renders paragraphs, `- ` lists and `## ` headings, never HTML. |
| `durationMins`, `passMark` | `passMark` default 60 (%). |
| `status` | `draft` \| `published` \| `retired`. |
| `version` | Bumped when checks change after somebody has answered. |
| `source` | `manual` \| `import` \| `ai`. |

### `curriculum_materials`
`materialId`, `unitId`, `kind` (`pdf, slides, doc, sheet, video, audio, image, ebook, code, archive, interactive, link`), `status` (`approved` | `pending` | `rejected`, migration 126 — members and the editor see approved only), `note`, `submittedBy`, `reviewedBy`, `reviewedAt`, `reviewNote`, `title`, `url` (https, or `/api/member/curriculum-file.php?f=<sha256>.<ext>` for an uploaded file), `position`.

### `curriculum_checks`
`checkId`, `unitId`, `kind` (`mcq, short, task`), `prompt`, `options` (JSON array), `answer` (MCQ: option index), `rubric`, `points`, `position`, `source` (`manual`/`ai`).

### `curriculum_progress`
One row per (`unitId`, `memberId`), UNIQUE. `status` `started` \| `attempted` (below the pass mark) \| `submitted` (written answers awaiting a marker) \| `completed`; `unitVersion`, `score`, `maxScore`, `bestPct`, `attempts`, `answers` / `marks` (JSON keyed by checkId), `feedback`, `pending` (written answers awaiting a marker), `markedBy`, `startedAt`, `completedAt`. Moved on a member merge (`MOVE_UNIQUE`).

## `member_assessments` (migration 127)
The companion's weekly check-in (`api/_lib/domain/companion.php`). One row per (`memberId`, `period`) — `period` is the week's Monday. `rating` `on_track` | `watch` | `at_risk` (rules); `reasons`, `metrics`, `strengths`, `focus` are JSON; `summary` text; `source` `ai` | `rules`; `mailedAt`. Moved on a member merge (`MOVE_UNIQUE`).

## `guardians`, `guardian_wards` (migration 128)
Family accounts (`api/_lib/domain/family.php`). `guardians`: `guardianId` (`GDN-` + 10 hex), `email` (unique, lower-case — the sign-in), `fullName`, `phone`, `status`, `sessionEpoch` (the family cookie carries it; bumping it signs out every device), `weeklySentFor` (the Monday last mailed — claimed before sending). `guardian_wards`: `linkId` (`GW-…`), `guardianId`, `memberId`, `relationship` (`parent` | `guardian` | `carer` | `relative`), `status` `active` | `pending` | `refused` | `revoked` | `removed`, `via` `code` | `record`, `notify` JSON `{checkin, weekly, alerts}`, `note` (the desk's reason), `decidedBy`, `decidedAt`. Moved on a member merge (`MOVE`). Sign-in codes live in `auth_sessions` with `purpose = 'family_login'`.

`member_requests.raisedBy` — `guardian:<guardianId>` when a parent raised the request from their family account; empty otherwise. Only `family_request_create()` sets it.

`member_requests.topic`, `.centre`, `.passedAt` (migration 169) — feedback only (`kind = 'feedback'`). `topic` is `idea | change | love` (`MEMBER_FEEDBACK_TOPICS`). `centre` is the member's centre at the time, and the only scope an anonymous row has: an anonymous feedback row stores `memberId = ''`. `passedAt` is when the desk passed it to the centre lead; it stays `open` until thanked (`status = 'approved'`, `decision` = the thank-you).

## `timetable_slots` (migration 129)
A centre's weekly timetable (`api/_lib/domain/timetable.php`). `slotId` (`TT-` + hex), `centreId`, `course` (a curriculum/catalogue course), `level`, `weekday` 1 (Mon)–7 (Sun), `startTime` / `endTime` `HH:MM` (end after start, at most 8 hours), `room`, `instructorId` (a volunteer), `note`, `status` `active` | `removed`, `createdAt`, `updatedAt`, `updatedBy`. Indexed on (`centreId`, `status`) and (`instructorId`, `status`). Clashes (room, instructor across centres, course+level, centre day, centre hours) are refused on save by `tt_clashes()`; rows saved before a rule are reported, not rewritten.

Setting `wisdom_week_pins` — `{ "<Monday YYYY-MM-DD>": "<wisdomId>" }`, the saying locked for each week once shown (last 26 kept).

## `centres.programmes` (migration 130)
Which programmes run at a centre: `ngg`, `summer`, or `ngg,summer` (the default, and what blank means). Read through `centre_serves()` / `centres_for_programme()` in `domain/registration.php`; every programme's centre list is filtered by it.

Setting `club_catalogue` — the NGG Club's own faculty → courses map (`club_catalogue()` in `domain/curriculum.php`), separate from Summer School's `academy_catalogue`. Materialised from the academy catalogue on first read, then edited only under Curriculum → Courses.


## `guardian_notices`, `club_announcements.smsBody` (migration 163)
A guardian's family-account inbox (`api/_lib/domain/family.php`). `noticeId` (`GN-` + 12 hex), `guardianId`, `kind` (`announcement`), `refId` (the announcement's `annId`), `title`, `body`, `fromName`, `createdAt`, `readAt` (`''` = unread). Unique on (`guardianId`, `kind`, `refId`), so a re-send is not a second notice. `club_announcements.smsBody`: the short SMS version of a long announcement — written or AI-shortened, checked by `cp_ann_lost_facts`, approved with the rest; `''` when the message fits a text or SMS is not used.

## `academy_passes`, `academy_attempts` (migration 164)
Progress in an Academy other than the mentors' (they keep `mentor_academy` / `mentor_academy_attempts`), keyed by `track` (`instructor`) and `personId` (the signed-in member id). `academy_passes`: `moduleId`, `score`, `passedAt`, unique on (`track`, `personId`, `moduleId`) — only passes are stored. `academy_attempts`: every try, `score`, `passed` 0/1, `at` — three a module a day. Content is `api/_lib/seeds/<track>-academy.json`; modules flagged `orientation` are the "Start here" guides that open the portal (`api/_lib/domain/academy.php`).

## `projects`, `project_people` (migration 166)
Projects and activities set in the Mentor Portal (`api/_lib/domain/projects.php`). `projects`: `projectId` (`PRJ-` + 10 hex, unique), `title`, `detail`, `startOn` / `dueOn` (`YYYY-MM-DD`, at most 366 days apart), `centre`, `status` (`open` | `closed` | `cancelled`), `createdBy` (the setter's memberId — only they may edit it or set others' parts), `createdByName`, `createdAt`, `updatedAt`. `project_people`: one row per person on a project, unique on (`projectId`, `kind`, `personId`) — `kind` `mentor` (`personId` = mentorId) or `member` (`personId` = memberId), `groupName` ('' = no group), `status` (`assigned` | `done` | `excused`; excused parts are not counted), `note` (what they did, or why excused), `doneAt`.

## `ai_usage` (migration 167)
One row per AI call (`api/_lib/ai.php` `ai_log_usage`): `at`, `month` (`YYYY-MM`), `profile`, `job` (`everyday` | `brain`), `provider`, `model`, `tier` (`free` | `paid`), `inTokens`, `outTokens`, `costMicros` (USD × 1,000,000 — the provider's reported cost for OpenRouter, otherwise tokens × the price table), `estimated` (1 when the provider returned no token counts), `ok`, `error` (`ai_limit_reached` marks a paid call the monthly limit held back, at no cost). The month's spend is `SUM(costMicros)`; the limit is setting `ai_routing` (`monthlyLimitUsd`, `paidEveryday`, `prices`).

## `members.feesSettledThrough` (migration 168)
`YYYY-MM-DD` or ''. The last day the member's membership and dues are settled outside this system. `fees_accrue_member` never charges a membership period due, or a dues month, on or before it; `fees_settle_through()` sets it (never backwards) and posts one `waiver` with periodKey `settle:<date>` for what was still unpaid on those periods (payments applied oldest first).

`member_requests.rating` (migration 170) — 1–5 on an `experience` feedback row (`MEMBER_FEEDBACK_RATINGS`: Not good … Great); 0 everywhere else.

`mentor_messages.mediaJson` (migration 171) — a voice note on a chat message: `journal_media_clean`'s shape, audio only, one clip. `journal.mediaJson` now accepts `type: audio` (it was coerced to image) and site paths under `/api/public|member/` as well as https URLs.

`mentor_supports` (migration 172) — supporting mentors: memberId, mentorId, focus, endsOn (YYYY-MM-DD, '' = until ended), status active|ended, startedAt, endedAt, createdBy. The primary stays in `mentor_assignments`. Merge policy: MOVE.

## `wifi_accounts`, `wifi_gateways` (migration 189)

`wifi_accounts`: one per person with Wi-Fi — `subjectType` (`member` |
`summer`), `subjectId`, `username` (the printed ID; unique), `pinSealed`
(AES-256-GCM, not a hash: the gateway is handed it), `pinSetAt`,
`pinResetDay`/`pinResets` (three a day), and an `override` (`on` | `limited` |
`off`) with `overrideWhy`/`overrideBy`/`overrideAt`. Access itself is never
stored: `wifi_access_for()` derives it from the record.

`wifi_gateways`: `gatewayId` (`G` + 8 hex), `platform` (`mikrotik` | `radius` |
`openwrt` | `generic`), `centre`/`centreId`, `label`, `keyHash` (sha256)/
`keyTail`/`keySetAt`, `lastSeenAt`, `lastFullAt`, `lastChangeAt`, `osVersion`,
`lastError`, `lastVersion` + `ackedJson` (what the gateway confirmed) +
`pendingJson`/`pendingVersion` (what it was last handed), `removedAt`.

## `wifi_gateway_stats`, `wifi_speed_tests` (migration 190)

`wifi_gateways` gains `testAsked` and `lastStatsJson` (the latest report:
active, cpu, memFree, uptime). `wifi_gateway_stats`: one row per gateway per
UTC hour (`hour` = `YYYY-MM-DDTHH`) — `samples`, `activeMax`, `activeSum`,
`cpuMax`, `memFreeMin`; kept 14 days. `wifi_speed_tests`: `centre`/`centreId`,
`gatewayId` (blank for a device), `source` (`gateway` | `device`), `downMbps`,
`upMbps`, `rttMs`, `byId`, `note`, `at`. No table holds who browsed what.
