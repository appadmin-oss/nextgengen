# App Store & Play Store readiness — Anchor Journal

The Anchor Journal (`/journal/`) is a **PWA**. This is how it reaches the two
stores, what's already done, and the exact remaining steps (the ones that need
your developer accounts, a production domain, and signing keys).

## What's done (in this repo)
- **Installable PWA** — complete `manifest.webmanifest`: id/scope/start_url,
  `standalone` display + `display_override`, portrait, categories, `lang`/`dir`,
  matching `theme_color`/`background_color` (#0c1432), and app **shortcuts**.
- **Real icon set** (`assets/icons/`): `icon-192.png`, `icon-512.png`, a padded
  **`maskable-512.png`** (20% safe zone for Android's adaptive mask), and
  `apple-touch-180.png`. Wired into the manifest + `journal/index.html`.
- **Screenshots** (`assets/screens/`) referenced in the manifest (`form_factor:
  narrow`) — richer install prompt + Play listing.
- **Offline-first** — service worker precaches the app shell, icons, manifest
  and self-hosted fonts; never caches `/api/*`. Works with no network.
- **Digital Asset Links** — `/.well-known/assetlinks.json` (served from the
  origin root; build copies `.well-known/` into `dist/`). Needs the real Play
  **app-signing SHA-256 fingerprint** dropped in.
- **Bubblewrap starter** — `deploy/twa-manifest.json`.
- iOS `apple-mobile-web-app-*` meta + apple-touch-icon already present.

## Google Play — via Trusted Web Activity (TWA / Bubblewrap)
A TWA is a thin Android wrapper that runs the PWA full-screen (no URL bar) once
Digital Asset Links verify you own the domain. Steps:
1. Deploy to the **production HTTPS domain** and set it in `deploy/twa-manifest.json`
   (`host`, the three `…Url` fields) and in `.well-known/assetlinks.json`.
2. `npx @bubblewrap/cli init --manifest ./deploy/twa-manifest.json`
3. `npx @bubblewrap/cli build` → produces a signed `.aab` (App Bundle).
4. In Play Console, enable **Play App Signing**, copy the **SHA-256 cert
   fingerprint**, paste it into `assetlinks.json` → redeploy the site. Verify at
   `https://<domain>/.well-known/assetlinks.json` (must be 200, `application/json`).
5. Upload the `.aab`, complete the **Data safety** form + privacy policy, add the
   store listing (icon 512, feature graphic 1024×500, the screenshots), submit.
- Requirements the app already meets: installable manifest, SW/offline, HTTPS,
  Lighthouse PWA pass, maskable icon.

## Apple App Store — via Capacitor (WKWebView wrapper)
Apple does **not** accept a bare PWA; wrap it with Capacitor:
1. `npm i @capacitor/core @capacitor/cli @capacitor/ios` in a small wrapper
   project; `server.url` → the production `/journal/` (or bundle the built PWA).
2. `npx cap add ios`, set icons/splash from `assets/icons/`, bundle id
   `org.afrovanguard.ngg.anchor`, open in Xcode, sign with your Apple team.
3. Ensure it clears **Guideline 4.2** (must feel like an app, not a bare site) —
   our standalone chrome, offline support and native-feel UI cover this.
4. Add the privacy policy + App Privacy answers; submit via App Store Connect.

## Dynamic season-aware icons (Duolingo-style)
`assets/seasonal-icon.js` is the single source of truth: a `SEASONS` date-range
table (New Year, Spring, Summer School, Independence, Halloween, Festive) with an
`anchor` default. At runtime it repaints the browser **tab / in-app favicon** from
today's date (navy badge + accent tint + logo + a seasonal glyph) and exposes
`window.NGGSeason = { key, label, accent, glyph }`. It never overrides
`theme_color` (a bright status bar over the dark UI reads poorly) and always leaves
the static `<link rel=icon>` as the offline/no-JS fallback. It's precached by the
journal service worker, so it works offline too.

The **installed home-screen icon** can't be repainted from JS — it's baked at
install time. To make *that* seasonal, the native wrapper switches a pre-rendered
alternate icon on a schedule that mirrors the `SEASONS` table:
- **iOS (Capacitor):** ship one `CFBundleAlternateIcons` entry per season and call
  `UIApplication.setAlternateIconName(_:)` (e.g. on launch/foreground). Pre-render
  each season's 1024² icon from the same logo + glyph used here.
- **Android (TWA):** declare an `activity-alias` per season (each with its own
  `<meta-data android:resource>` launcher icon) and enable/disable them with
  `PackageManager.setComponentEnabledSetting(...)`.
Mirror the `SEASONS` ranges verbatim in the wrapper so tab and home-screen stay in
sync; keep `assets/seasonal-icon.js` as the canonical table.

## Still needs YOU (can't be done from the repo)
- Google Play + Apple Developer accounts.
- The production domain (swap every `REPLACE_WITH_PROD_DOMAIN`).
- Signing keys (Android keystore / Apple certificates) and the Play app-signing
  SHA-256 → `assetlinks.json`.
- A hosted **privacy policy** URL + data-safety answers (note: the app collects
  journal reflections + a member session; the guardian Circle is read-only).
- Listing art: feature graphic (1024×500) and any extra marketing screenshots.

## Verify locally
- `node build.js` then serve `dist/` over HTTPS; run Lighthouse → PWA category.
- Confirm `https://<domain>/.well-known/assetlinks.json` and
  `https://<domain>/journal/manifest.webmanifest` both return 200.
