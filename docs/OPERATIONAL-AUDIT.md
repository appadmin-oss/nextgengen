# NGG — Operational & Architectural Gap Audit

Produced by a multi-agent workflow (map → find → adversarially verify → synthesize): 6 mappers inventoried routes/client-API/backend-ops/admin/forms/journal, 6 finders hunted gaps, each candidate was adversarially verified against the code. **28 candidates → 21 confirmed** (the synthesize step and 6 verifiers were cut off by a session limit; findings below are the verified set).

> Runtime baseline (verified directly): `node build.js` clean, PHP suite **319/319**, and **all 25 SPA routes + deep links + 404 + journal PWA render with zero uncaught errors**. Nothing is broken at load; the gaps below are unwired features, SEO/privacy, and placeholder content.


## HIGH

### Mission verification/approval (anchor.mission.verify) is fully built server-side but wired to no route, client method, or admin UI — members' proof submissions can never be approved
- **Kind:** orphaned-backend · **File:** `api/_lib/domain/anchor.php` · **Verdict:** CONFIRMED
- **Why it matters:** Real feature gap, not dead code. anchor_mission_submit (api/_lib/domain/anchor.php:37-77) sets status='submitted' with xpAwarded=0 for any mission whose proof !== 'none' (photo/text-evidence missions) and tells the member 'Your mentor will verify soon.' anchor_mission_verify is the ONLY code path that can move 'submitted' -> 'verified' (award XP) or 'rejected'. With no front-end surface for mentors/admins, every proof-requiring submission is stranded in 'submitted' forever: no XP, no stat recompute, no learner feedback. The mentorship and member-detail admin sections expose no submission-revie
- **Fix:** Wire the existing handler to a surface: (1) add an admin/mentor route action (e.g. POST action:'verify' in api/admin/missions.php, or a new api/member|admin route) that calls gs_call('anchor.mission.verify', ['verifierId'=>$s['mid'], 'memberId'=>..., 'missionId'=>..., 'approve'=>bool, 'note'=>..., 'ip'=>client_ip()]); (2) add a new backend op + route to list member_progress WHERE status='submitted' for the active session (none exists today); (3) add NGGApi client methods for both; (4) add a submission-review queue UI in page-admin.jsx (mentorship or missions section) so mentors/admins can appr

### Summer-student profile pages (/s/*, /q/*) are indexable while the equivalent member profile is noindex
- **Kind:** other · **File:** `` · **Verdict:** CONFIRMED
- **Why it matters:** These are per-child public profiles of minors reached by QR token or handle. They are crawlable and collapse to a single stale canonical, which is both an SEO duplicate problem and a safeguarding/privacy inconsistency versus the deliberately noindexed member 'profile' page.
- **Fix:** In app.jsx:195, add "summerprofile" (and "certificate", which is likewise a per-person public deep page reached at /cert/*) to the noindexPages array so robots is set to "noindex, nofollow" on those routes. This is the minimal, correct fix for the safeguarding issue and makes the stale-canonical collapse moot for these pages. If canonical correctness is also desired, additionally update the canonical/og:url logic (app.jsx:189-193) to derive the URL from window.location.pathname rather than gating on PAGE_IDS.includes(page), so deep-linked profile/cert URLs get an accurate self-canonical instea


## MEDIUM

### 404 sentinel page is served as indexable (robots index,follow) and keeps a stale canonical
- **Kind:** other · **File:** `` · **Verdict:** CONFIRMED
- **Why it matters:** Every mistyped or dead deep-link (the exact thing pageFromPath maps to '_notfound' at app.jsx:157) renders the NotFound component but tells crawlers to index it, with a canonical pointing at the homepage. That invites soft-404 indexing and duplicate-of-home penalties. 404s should emit noindex.
- **Fix:** Treat the '_notfound' sentinel as noindex and stop pinning a stale canonical for it. Minimal change in the app.jsx meta effect: (1) force noindex for non-real pages, e.g. change the robots line to noindex when the page is not a real route: `const isRealPage = PAGE_IDS.includes(page); rob.setAttribute('content', (!isRealPage || noindexPages.includes(page)) ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');` — or simply add '_notfound' to the noindexPages array. (2) For the canonical/og:url, on '_notfound' either drop/neutralize the canonical (remove the element or point it at th

### All certificates share one canonical (/certificate) and it mismatches the real /cert/<id> URL
- **Kind:** other · **File:** `` · **Verdict:** CONFIRMED
- **Why it matters:** Every distinct verifiable certificate at /cert/<id> is indexable yet declares the same canonical (/certificate), which is both a bare id-less page and a URL that differs from the one actually served — crawlers will collapse all certificates into one and index a broken canonical.
- **Fix:** Treat /cert/<id> like summerprofile so its canonical reflects the real served URL instead of a shared id-less page. Two workable approaches: (1) In the meta effect, special-case dynamic routes so canonical/og:url use the actual pathname, e.g. const dynamicRoute = (page === "certificate" || page === "summerprofile"); const canonicalUrl = "https://next.afrovanguard.org.ng" + (dynamicRoute ? window.location.pathname : (page === "home" ? "/" : "/" + page)); and set canonical/og:url when (PAGE_IDS.includes(page) || dynamicRoute). This gives each certificate a correct, distinct canonical (https://ne

### Integrations subsystem is fully built in backend + client API but has NO admin console UI
- **Kind:** orphaned-backend · **File:** `api-client.js` · **Verdict:** CONFIRMED
- **Why it matters:** Staff have no way to configure, test, manually dispatch, or sync integrations (e.g. Google Sheets member export, webhook dispatch) from the Control Room. Cron tools api/tools/dispatch-events.php and export-sheets.php exercise the backend, but integration records can never be created/edited/tested through the app because the management UI was never built. A large capability gated on the 'settings' cap with no entry point.
- **Fix:** Add an integrations section to the Control Room: (a) add one row to ADMIN_SECTIONS in page-admin.jsx, e.g. { id: "integrations", group: "System", label: "Integrations", title: "Integrations", icon: "⇄", cap: "settings" } (matching the 'settings' cap the domain enforces at integrations.php lines 25/34/77/86/96/106); (b) add {view === "integrations" && <AdminIntegrations/>} to the router block; (c) build an AdminIntegrations component that calls NGGApi.admin.integrations.list()/upsert()/remove()/test()/dispatch()/syncMembers() to create/edit/test/manually-dispatch integration records and trigger

### Behaviour tracking (log/list/review) is wired in client + backend but has no admin section or UI
- **Kind:** unwired-feature · **File:** `api-client.js` · **Verdict:** CONFIRMED
- **Why it matters:** Staff cannot log a behaviour note against a student/member or review flagged incidents anywhere in the console, even though the backend module, capability gating (people/summer), and client methods all exist. A safeguarding/behaviour feature is effectively dead on the frontend.
- **Fix:** Add an ADMIN_SECTIONS entry (e.g. { id: "behaviour", group: "People", label: "Behaviour", title: "Behaviour monitor", icon: "⚑", cap: "people" }) — note the cap must be "people" to match the SECTION_CAP/route gating, though staff with only "summer" cap also pass behaviour_gate() server-side, so ideally the section should be visible under either people or summer capability. Then add a router case in the section renderer (around page-admin.jsx:282) and build an AdminBehaviour component that calls NGGApi.admin.behaviour.list to show logs/trends (filterable by subjectId/status/category), NGGApi.ad

### Media page shows fabricated press mentions as real coverage
- **Kind:** placeholder · **File:** `page-other.jsx:81-88` · **Verdict:** CONFIRMED
- **Why it matters:** Named real publications are presented as having featured the organization, on a live public route, with no substantiation — misleading content rather than a functional feature.
- **Fix:** Replace the hardcoded press array with real, substantiated data. Either (a) drive it from backend data (e.g. a press_mentions op/table) where each entry carries a name, year, and a link to the actual coverage, rendering the card name as an anchor to the source; or (b) if no real press coverage exists yet, remove the section entirely or reframe it honestly (e.g. "Partners we're building toward" / an empty state) so named publications are not presented as having featured the organization. At minimum, do not display real publication names with a "FEATURED · {year}" label unless a verifiable link 


## LOW

### Registry op session.ensureYear (session_ensure_year) has no caller anywhere — no route, no client, no internal reference
- **Kind:** orphaned-backend · **File:** `api/_lib/domain/events.php` · **Verdict:** CONFIRMED
- **Why it matters:** Dead registry entry / orphaned helper. Year-session seeding is actually reached via the session_current() util (api/_lib/util.php), so the feature exists; this explicit op is unreachable. Low impact, no user-facing gap.
- **Fix:** Remove the dead entry 'session.ensureYear' => 'session_ensure_year' from the op registry in api/_lib/backend.php:54 and delete the unused session_ensure_year() wrapper in api/_lib/domain/events.php:93-96. If the intent was to expose an admin-triggerable year-seed operation, instead wire the op into an admin route (and, if desired, NGGApi/page-admin.jsx) so it is actually dispatchable; otherwise the standalone ensure_year() already covers all seeding needs.

### Registry op event.list (event_list) is dispatched by no route and called by no other function — orphaned
- **Kind:** orphaned-backend · **File:** `api/_lib/domain/events.php` · **Verdict:** CONFIRMED
- **Why it matters:** Dead registry op. The event-listing feature is delivered to clients via public_events() (public.events) and member_dashboard(), so this is redundant/unreachable code rather than a missing feature. Low impact.
- **Fix:** Remove the dead op: delete the `'event.list' => 'event_list'` line at api/_lib/backend.php:48 and delete the event_list() function (events.php lines 6-31). Leave event_rsvp() directly below it intact — it is live via the member.event.rsvp op. No client or route changes are needed since nothing references event.list.

### Registry op session.current (op_session_current) is only ever dispatched by the test runner
- **Kind:** orphaned-backend · **File:** `api/_lib/domain/events.php` · **Verdict:** CONFIRMED
- **Why it matters:** Dead-in-production registry op (test-only). Not a user-facing gap; noted for completeness as an op with no client/UI surface. Low impact.
- **Fix:** Cosmetic/dead-code cleanup, not a functional gap. Either (a) remove the 'session.current' => 'op_session_current' registry entry and op_session_current function, updating tests/run.php:68 to dispatch 'session.list' or call session_current() directly; or (b) keep it but consolidate: op_public_session could delegate to op_session_current and drop 'all' from its response, eliminating the duplicate. No user-facing change required.

### Operational/token pages `reshoot` and `cards` are left indexable (missing from noindexPages)
- **Kind:** other · **File:** `` · **Verdict:** PARTIAL
- **Why it matters:** reshoot is a personal, token-gated page tied to a specific minor's photo, and cards is an internal ID-generation tool; both should be noindex like the sibling operational/token pages (gate/verify/circle) rather than crawlable.
- **Fix:** Add 'reshoot' and 'cards' to the noindexPages array at app.jsx:195, so it reads ["dashboard","profile","admin","summer-admin","club-admin","gate","verify","circle","reshoot","cards"]. This makes robots emit "noindex, nofollow" for both, matching their operational/token siblings. (Leave certificate out; it is intentionally indexable.)

### admin canonical URL (/admin) disagrees with its actual served path (/nextadmin)
- **Kind:** other · **File:** `` · **Verdict:** CONFIRMED
- **Why it matters:** The emitted canonical points to a legacy alias (/admin) rather than the real route (/nextadmin). It is masked only because admin happens to be noindexed; the URL-building logic is still inconsistent and would surface if admin's index status changed.
- **Fix:** Reuse the single source of truth for path building in the canonical/og:url line. Replace `const canonicalUrl = "https://next.afrovanguard.org.ng" + (page === "home" ? "/" : "/" + page);` at app.jsx:189 with `const canonicalUrl = "https://next.afrovanguard.org.ng" + pathForPage(page);`. `pathForPage` already handles home (`/`) and admin (`/nextadmin`) correctly, keeping the canonical/og:url consistent with the pushed history path for every current and future aliased route.

### Meta/OG description is never cleared on pages with empty desc, so it retains the prior route's text
- **Kind:** other · **File:** `` · **Verdict:** CONFIRMED
- **Why it matters:** Indexable pages in this set (reshoot, cards) end up advertising an unrelated page's description to crawlers and share-link previews; combining with the noindex fix would resolve most impact, but the stale-description logic is a latent gap.
- **Fix:** Add a site-default description constant and write it unconditionally so empty-desc pages reset the tag instead of retaining the prior value: `const desc = meta.desc || SITE_DESC; if (m) m.setAttribute("content", desc); ... if (ogd) ogd.setAttribute("content", desc);` (replacing the `&& meta.desc` guards at app.jsx:182 and :186). Additionally, add "reshoot" and "cards" to the noindexPages array (app.jsx:195) since they are personal/operational studio pages that should not be indexed at all — which removes most of the residual impact.

### Static sitemap.xml is out of sync with the live sitemap.php (missing /volunteer and /legal)
- **Kind:** other · **File:** `` · **Verdict:** CONFIRMED
- **Why it matters:** If the static sitemap.xml is what gets served (or referenced in robots) instead of the PHP endpoint, two legitimate indexable routes are excluded from discovery and the two files present conflicting sitemaps.
- **Fix:** Two parts. (1) Make the dynamic endpoint actually win by moving the sitemap rewrite above the exists-guard in .htaccess: place 'RewriteRule ^sitemap\.xml$ api/public/sitemap.php [L]' BEFORE the 'RewriteCond %{REQUEST_FILENAME} -f [OR] / -d / RewriteRule ^ - [L]' block so the -f short-circuit no longer pre-empts it (apply in both /.htaccess and /dist/.htaccess). (2) Since the static file is the fallback for non-rewrite hosts, bring it in sync by adding the two missing entries to /sitemap.xml (and /dist/sitemap.xml): '<url><loc>https://next.afrovanguard.org.ng/volunteer</loc><changefreq>monthly<

### admin.promotions.set (homepage promo banner) is orphaned - no UI writes it and nothing reads the value
- **Kind:** orphaned-backend · **File:** `api-client.js` · **Verdict:** CONFIRMED
- **Why it matters:** The promotions feature is dead end-to-end: no console control to set the homepage promo and no consumer of the stored value, so the client method and backend op are unreachable/unused. Minor, but an orphaned op with no CRUD entry point where one would be expected (a 'set' with no accompanying UI or read path).
- **Fix:** Two valid directions. (1) If the homepage promo banner is intended: add an admin control in page-admin.jsx calling NGGApi.admin.promotions.set(...), add a reader returning setting_get('homepage_promo') from a public endpoint (api/public/config.php or site.php), and render it in page-home.jsx. (2) If not intended, remove the dead op: delete the promotions block in api-client.js (lines 229-231), api/admin/promotions.php, the 'admin.promotions.set' => 'admin_promotions_set' entry in api/_lib/backend.php:136, admin_promotions_set in api/_lib/domain/admin.php:299-305, and the promo-expiry block in 

### Media room is entirely non-operational — every item is a hardcoded 'coming soon' placeholder
- **Kind:** unwired-feature · **File:** `page-other.jsx:6-170 (MediaPage/FeatureCard/MediaModal); data.js:147-154 (MEDIA_ITEMS)` · **Verdict:** PARTIAL
- **Why it matters:** 'Media' is a top-level nav item (components.jsx:322) and a dashboard shortcut (page-dashboard.jsx:919), presented as a full content section ('12.4k views', filter tabs, item counts). Every play control is dead; the entire route is a waitlist capture dressed as a live media library.
- **Fix:** The frontend already supports real playback: handlePlay opens item.url in a new tab. The minimal fix is data-only — add a `url` field to each MEDIA_ITEMS entry (data.js:147-154) pointing at the hosted video/podcast (e.g. YouTube/Vimeo/audio link). Once urls exist, cards play immediately and the coming-soon MediaModal is bypassed. Then drop the hardcoded "SOON" badge (page-other.jsx:125), the "preview coming soon" aria-label (line 117), and the coming-soon modal copy for items that have a url. For a dynamic library, add a public backend op (e.g. media.list) in api/_lib/domain/*.php returning me

### Footer social links on every page point to bare domain roots, not NGG accounts
- **Kind:** dead-link · **File:** `data.js:179-185 (CONTACT.socials); components.jsx:789-794 (footer)` · **Verdict:** CONFIRMED
- **Why it matters:** The footer renders site-wide, so on every page the five social icons open the generic home page of each platform instead of an NGG account — visibly broken outbound links on the primary marketing surface.
- **Fix:** Replace the five placeholder URLs in CONTACT.socials (data.js:180-184) with the real NGG account URLs once confirmed, e.g. instagram: "https://instagram.com/nextgengenius" etc. Optionally harden SocialLink (components.jsx:589) to skip rendering (return null) when href is a bare platform root or "#", so placeholders never surface publicly; but the primary fix is supplying the real handles in data.js — no other changes needed since the footer already reads from this single source.

### Book page renders a hardcoded placeholder chapter outline; the intended endpoint does not exist
- **Kind:** placeholder · **File:** `page-book.jsx:32-53, 214-229` · **Verdict:** PARTIAL
- **Why it matters:** The Book route (top-level nav) presents 12 chapters with mission counts and read times as the real table of contents, but it is static placeholder data with no wired data source and no working preorder/purchase path.
- **Fix:** Either (a) wire a real data source — add a book.php route + a public.book op in backend.php that returns the ToC (e.g. from a book_chapters setting), and have the useEffect fetch it with DEFAULT_CHAPTERS as fallback; or (b) if the book is genuinely pre-launch, keep the static outline but remove the misleading 'admin can fill via book_chapters setting' comment (lines 33-36, 214) so it doesn't imply a mechanism that doesn't exist, and optionally label the outline as a provisional/sample table of contents in the UI. The waitlist CTA itself needs no change.

### Profile route renders a fixed fictional member with a mocked habit grid
- **Kind:** placeholder · **File:** `page-anchor.jsx:527-560, 503-525` · **Verdict:** PARTIAL
- **Why it matters:** 'profile' is a live (noindex) route linked from the Club and Home pages; it always shows the same fictional member and a fake activity grid rather than any real per-member data. Real per-member profiles are an unbuilt feature.
- **Fix:** To make it a real per-member profile: have the Club/Home member cards pass the clicked member's id (via a URL segment like /profile/<id> or shared state) instead of a bare setPage('profile'), and change ProfilePage to resolve that id (props/URL) rather than the hardcoded MEMBERS.find(x => x.id === 2), backed by real per-member data (including real habit/activity data to replace the LCG mock in HabitGrid). Until that feature is built, the existing prominent 'not a real member' banner + noindex is the correct interim mitigation, so no urgent change is required.

### Summer and Club pages present fictional seed members as real students/roster
- **Kind:** placeholder · **File:** `page-club.jsx:6-11, 96, 225; data.js (MEMBERS)` · **Verdict:** CONFIRMED
- **Why it matters:** Two public marketing routes display a fabricated roster as though it were the live cohort/membership, with clickable profiles that all resolve to the single sample profile.
- **Fix:** Either (a) clearly label the cohort/directory sections as illustrative/sample data in the UI, or (b) wire them to live data: add a public read endpoint (e.g. public.summerRoster / public.clubMembers backed by the existing admin summer/club domain functions) and fetch it in SummerPage/ClubPage instead of importing the static MEMBERS array; drive the "164" count and mission-progress numbers from that response rather than hardcoded strings. For the profile links, pass the real member id (e.g. setPage('profile', m.id) or a query param) and have ProfilePage load that member instead of the hardcoded

### Blog always renders hardcoded seed posts beneath API posts
- **Kind:** placeholder · **File:** `page-blog.jsx:6, 30, 57` · **Verdict:** CONFIRMED
- **Why it matters:** Fabricated seed articles are permanently presented as published blog content on the live Blog route; they are never suppressed even once real admin-authored posts are returned.
- **Fix:** Use the seed array only as an empty-state fallback instead of always concatenating. Replace line 30 `const ALL = [...apiPosts, ...BLOG_POSTS];` with `const ALL = apiPosts.length ? apiPosts : BLOG_POSTS;` so fabricated posts vanish as soon as any real post is returned. (If a permanent empty state without fake articles is preferred, drop BLOG_POSTS entirely and render an "no posts yet" message when apiPosts is empty.) The related-posts list in BlogArticle (line 167) and the pull-quote/figure garnish should likewise be sourced from real posts or gated when no seed content remains.
