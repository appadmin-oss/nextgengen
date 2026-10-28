# Free data for learners — what an operator needs from us

## 0. Read this first: none of this is automatic

There is a national scheme, it is live, and **it does not switch itself on for
us.**

On **1 October 2026** the NCC and ALTON (the operators' association) launched
the *Zero Rated Data Access to Approved Educational Platforms and Content
Initiative*: eligible learners get **up to 100 MB of free data a day**, and it
works **only on approved platforms**. Anything off that list comes out of the
learner's own bundle as usual.

Two halves, and only one of them is automatic:

- **For the learner — automatic.** On an operator that has implemented it,
  nothing is installed and nothing is signed up for. They open an approved
  site and it does not bill them.
- **For NGG — an application.** The approved list is decided by the Federal
  Ministry of Education together with the NCC, under an operator-sponsored
  model. A platform is on that list because somebody put it there.

So building the app well does not earn free data. It makes NGG **approvable**,
and makes the thing being approved one line instead of six. The rest of this
file is what you put in front of them.

### What to be careful about when making the case

- **Eligibility, as announced, is narrower than NGG.** Reporting describes the
  first phase as targeting senior secondary and tertiary students, widening to
  other learners later. NGG members are 10–17 and many are in junior
  secondary. Whether they are covered in phase one is a question to ask, not
  one to assume — and it is the first thing a submission should address.
- **The approved categories are a good fit.** The announced categories include
  learning management systems and technical and vocational training
  platforms. NGG is plainly both.
- **Nobody should pay anybody.** There is no fee for this, and warnings about
  people charging students to "register" are already circulating.
- **Confirm before quoting.** The figures and dates here come from reporting
  and from the NCC's own consultation material (the Joint NCC-Industry
  Committee consultation ran 19 June – 9 July 2026). The platform
  accreditation route itself was not published anywhere I could reach, so the
  next step is the NCC and the Federal Ministry of Education directly, and
  ALTON for the operator side. Do not build a plan on this paragraph without
  checking it.


A mobile operator asked to zero-rate an educational service does not want a
description of the service. It wants two things it can put in a contract:

1. **The hostnames to whitelist.** Zero-rating is implemented by matching
   traffic. Every extra host is a separate agreement and a separate thing to
   go wrong — and a learner on free data whose fonts, icons or scripts come
   from a host nobody whitelisted either pays for them or waits for them to
   time out, and cannot tell which.
2. **What a session costs, in bytes.** "Lightweight" is not a number.

This file is the answer to both, and `npm run zero-rating` is where the
numbers come from. It serves the production build, loads it in a real
browser, and records every request: where it went and what it weighed. Do
not edit the figures below by hand — re-run it.

---

## 1. The inventory

**One hostname.** The service you are whitelisting is the single origin the
programme is deployed on — for the live deployment, `next.afrovanguard.org.ng`.

Everything a learner loads is served from it: the application, the
stylesheets, every typeface, every icon, the lesson text, the exam, the
member's own photographs and files. There is no CDN, no font host, no
analytics host and no avatar service. `tests/zero-rating.js` loads the home,
about, join and dashboard pages and **fails** if a single request leaves that
origin, so this stays true rather than having been true once.

That took work, and it is worth saying what was removed so it is not
casually added back:

| Was | Now |
|---|---|
| `fonts.googleapis.com` + `fonts.gstatic.com` — Sora, Caveat Brush, JetBrains Mono | `/assets/fonts`, with the rest |
| `fonts.googleapis.com` — Geist, in the ID Card Studio | already self-hosted; the fetch was redundant |
| `fonts.googleapis.com` — Poppins + IBM Plex Mono, in the card renderer | `/assets/fonts` |
| `fonts.googleapis.com` — Archivo, Caveat, Kalam, Instrument Serif, in the timetable poster | `/assets/fonts` |
| `api.dicebear.com` — a member's avatar, seeded with **their name** | drawn here, as initials, in a data URI |
| `images.unsplash.com` — stock photography on the marketing pages | a switch; see §3 |

The content security policy in `.htaccess` is the machine-readable version of
this list, and the two are meant to be read together.

## 2. What it costs

Measured on a 390 px phone viewport against the production build, gzipped the
way the host serves it (`mod_deflate`, `.htaccess`):

| | |
|---|---|
| **First visit** | **≈ 2,260 KB** over 31 requests |
| **Every visit after** | **≈ 5 KB** |

The second number is the one that matters. A member opens this once, and then
once a week for a year: the application is fingerprinted and cached for a
year, so a Saturday lesson costs about five kilobytes of shell plus the
lesson's own text.

Where the first visit goes:

| | |
|---|---|
| script | ≈ 1,509 KB |
| style | ≈ 341 KB |
| fonts | ≈ 306 KB |
| images | ≈ 95 KB |
| document + other | ≈ 9 KB |

**The first visit used to be about 1,300 KB larger than this**, for nothing: the
build emitted `<link rel="modulepreload">` for a bundle loaded as a classic
`<script defer>`. A modulepreload is fetched with module semantics, so the
browser could not reuse it and downloaded the whole application twice. The
browser's own Resource Timing said so — two entries, 4.97 MB each. It is
`rel="preload" as="script"` now.

### Honest about the 1.5 MB of script

One bundle carries the public site, the member portal, the Control Room, the
ID Card Studio, the Design Studio and the Timetable Maker, because the build
is a single concatenation (CLAUDE.md §1) and that is what shared hosting
without a build step buys us. A learner downloads the Control Room they will
never open.

Splitting it by audience is the next real reduction and it is **not done**.
It would take the learner's first visit to roughly a third of this. Nothing
in this document should be read as claiming otherwise.

## 3. The one switch

`photos.js` carries the marketing pages' scene photography, which is stock
imagery on Unsplash's CDN. A deployment being zero-rated turns it off:

```html
<meta name="ngg-local-media" content="true"/>
```

or `window.NGG_LOCAL_MEDIA = true` before the app boots. Scenes are then
composed locally and no request leaves the origin. This is the mode
`npm run zero-rating` measures.

**The better fix is neither.** Those are photographs of other people's
children standing in for NGG's own cohort — one of them is captioned
"Current cohort". The programme has its own photographs from its own
centres. Putting them in `/assets` removes the host and the pretence at the
same time, and is the thing to do before any of this is shown to an operator.

## 4. What is deliberately outside the whitelist

**Video lessons.** A `watch` question plays a YouTube or Vimeo embed, and
video is the one thing no operator will zero-rate — it is the cost they are
protecting themselves against. This is why video is never the only way a
lesson teaches something, and why a lesson that uses one still carries its
own text, diagrams and practical work. A learner on free data can complete
every lesson without playing a video; they will be told what they missed, not
locked out of it.

**Object storage**, if a deployment configures it for photographs and files
(`STORAGE_PROVIDERS`). On the default deployment, member files are served
from the application's own origin and this does not arise. If it is
configured, the bucket's host joins the whitelist and belongs in this table.

## 5. Making the case

This is the part that goes to the NCC, the Federal Ministry of Education and
ALTON — not to an operator's account manager, because under the
operator-sponsored model the approval comes first.

What is defensible to say, because it is measured:

- One hostname. No third-party request on any page a learner uses, enforced
  by a test that fails if that changes.
- About 2.3 MB once, about 5 KB a week after that.
- No tracking, no advertising, no analytics host.
- A curriculum of 588 lessons across 39 courses, taught at centres in
  Nigeria, to 10–17 year olds.

What is not yet true, and should not be claimed:

- The bundle is not split by audience, so a learner carries staff tooling
  they cannot open.
- The marketing pages use stock photography unless §3 is turned on.
- No operator has agreed to anything, and NGG is not on the approved list.
  This document is what you submit; it is not evidence that anybody has said
  yes, and nothing in the codebase can make them.
- Whether 10–17 year olds outside senior secondary are eligible in the first
  phase is unknown to us. Ask it directly rather than discovering it later.
