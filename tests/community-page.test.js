#!/usr/bin/env node
/* ============================================================================
   The community, as a PAGE.

   Every other test in this repo mounts one community component into a bare
   fixture. That is why a screenshot of the real thing was full of defects
   while the whole suite was green: a component rendered on its own never has
   a site nav above it, never has a viewport it can overflow, and is never
   handed the kind of picture a child's phone actually takes.

   So this one boots the REAL page — real bundle, real stylesheet, real
   AuthProvider, real router — and stubs only the network. The three things it
   caught, all measured rather than eyeballed:

     · A post photo had no height ceiling. Children post from phone cameras,
       so the pictures are portrait: a 1200×1600 rendered 892px tall on a
       900px laptop — 99% of the viewport — and a 9:16 phone shot would have
       been 132% of it. One photo was the whole screen.

     · The filter row measured 508px against a 390px phone, hid its scrollbar,
       cut "Saved" off at the edge and put "Yours" past it. A hidden scrollbar
       on a row that overflows is a filter nobody knows exists.

     · The wordmark's ink ran 42px OUTSIDE its own box on a phone, under the
       buttons beside it, while every box measurement said it fitted.

   Run:  node tests/community-page.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CMPAGE_PORT || 8493;
const BASE = 'http://127.0.0.1:' + PORT;

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

const img = (w, h, bg, fg) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
  + `<rect width="${w}" height="${h}" fill="${bg}"/>`
  + `<circle cx="${w / 2}" cy="${h * 0.35}" r="${w * 0.22}" fill="${fg}"/></svg>`).toString('base64');
/* 3:4 — what a phone camera produces, and what made the feed a slideshow. */
const TALL = img(1200, 1600, '#2f7a45', '#e8f5ec');
/* 16:9 — fits inside the cap untouched, so nothing may claim it is cropped. */
const WIDE = img(1600, 900, '#2f7a45', '#e8f5ec');
const FACE = img(600, 800, '#4a7fd4', '#f2c9a0');

const CHANNELS = [
  { channelId: 'C1', slug: 'commons', name: 'The Commons', icon: '🏛️', color: '#3b5bdb', kind: 'club', unread: 3, description: '' },
  /* A real channel name from the product, and the one that broke the header. */
  { channelId: 'C2', slug: 'ai-tools', name: 'AI Tools Application & Digital Problem Solving', icon: '🔬', color: '#7048e8', kind: 'course', unread: 12,
    description: 'Prompting, tooling and the week\u2019s build homework.', rules: 'Ask before you post someone else\u2019s work.' },
];
/* Two centres, one mentor, and more people than the stack shows — so the
   "+N" and the centres chip both have something true to say. */
const MEMBERS = [
  { name: 'Coach Bisi Adeyemi', centre: 'Egbeda', posts: 9, staff: true,  photo: '' },
  { name: 'Tunde A.',           centre: 'Ayobo',  posts: 6, staff: false, photo: '' },
  { name: 'Zara I.',            centre: 'Egbeda', posts: 4, staff: false, photo: '' },
  { name: 'Adaeze O.',          centre: 'Egbeda', posts: 3, staff: false, photo: '' },
  { name: 'Ife B.',             centre: 'Ayobo',  posts: 1, staff: false, photo: '' },
];
const author = (name, centre, photo, staff) => ({ name, centre, photo: photo || '', staff: !!staff, isMe: false, kind: 'member' });
const post = (o) => Object.assign({
  postId: 'p', kind: 'post', channel: CHANNELS[1], author: author('Elizabeth A.', 'Egbe-Idimu', FACE),
  body: '', mediaType: 'none', mediaUrl: '', createdAt: '2026-08-22T09:00:00Z',
  commentCount: 0, reactions: [], myReactions: [], bookmarked: false, stars: 0, starred: false,
  status: 'published', moderationNote: '' }, o);

const ME = { memberId: 'NGG-2025-0007', fullName: 'Amaka Obi', email: 'a@example.com',
             centre: 'Egbeda', role: 'member', type: 'NGG', status: 'active', photoUrl: FACE, track: 'Tech' };

function routesFor(media) {
  const POSTS = [
    post({ postId: 'p1', body: 'Here is the model I trained today.',
           mediaType: 'image', mediaUrl: media, altText: 'A chart', commentCount: 4 }),
    post({ postId: 'p2', author: author('Coach Bisi Adeyemi', 'Egbeda', '', true), channel: CHANNELS[0],
           body: 'Reminder: Saturday session moves to 10am.' }),
  ];
  return {
    'auth/me.php': { ok: true, member: ME, adminOk: false, impersonating: null },
    'member/community.php': (u) => {
      const v = u.searchParams.get('view');
      if (v === 'channels') return { ok: true, channels: CHANNELS };
      if (v === 'today') return { ok: true, unread: 16, mentions: 2, saved: 1 };
      if (v === 'digest') return { ok: true, posts: POSTS, stars: [] };
      if (v === 'feed') return { ok: true, posts: POSTS, hasMore: false, channel: null };
      if (v === 'members') return { ok: true, members: MEMBERS, count: MEMBERS.length };
      return { ok: true };
    },
  };
}

async function openPage(browser, width, height, media) {
  const routes = routesFor(media);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const h = routes[u.pathname.replace(/^.*\/api\//, '')];
    const body = typeof h === 'function' ? h(u) : (h || { ok: true });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  /* The router reads location.pathname, so the clean URL has to be served the
     app shell — which is what the real host does. */
  await page.route('**/community', r => r.fulfill({
    status: 200, contentType: 'text/html',
    body: fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8') }));
  await page.goto(BASE + '/community', { waitUntil: 'networkidle' });
  await page.waitForSelector('.cmm-msg', { timeout: 10000 });
  await page.waitForTimeout(400);
  return { page, errs };
}

(async () => {
  const chromium = loadChromium();
  const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
  if (!chromium || !fs.existsSync(exe)) { console.log('… skipped: no chromium available'); process.exit(0); }

  /* dist/ IS the site root — index.html resolves every asset from '/'. */
  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', path.join(ROOT, 'dist')], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE + '/index.html');

    for (const [label, W, H] of [['phone 390×844', 390, 844], ['laptop 1280×900', 1280, 900]]) {
      console.log('\n── ' + label + ' ─────────────────────────────────────────');
      const { page, errs } = await openPage(browser, W, H, TALL);

      ok('the community page renders with no script error', errs.length === 0);
      if (errs.length) console.log('    ' + errs.slice(0, 2).join(' | '));

      const m = await page.evaluate(() => {
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
        const media = document.querySelector('.cm-msg-media img');
        const chips = document.querySelector('.cmm-chips');
        const brand = document.querySelector('.topnav .brand');
        let ink = 0;
        if (brand) {
          const rng = document.createRange(); rng.selectNodeContents(brand);
          Array.from(rng.getClientRects()).forEach(x => { if (x.right > ink) ink = x.right; });
          brand.querySelectorAll('*').forEach(e => { const x = e.getBoundingClientRect().right; if (x > ink) ink = x; });
        }
        return {
          vh: window.innerHeight,
          media: r(media),
          chipCount: document.querySelectorAll('.cmm-chip').length,
          chipsOver: chips ? chips.scrollWidth - chips.clientWidth : -1,
          chipsRight: chips ? Math.max(...Array.from(document.querySelectorAll('.cmm-chip'))
            .map(c => Math.round(c.getBoundingClientRect().right))) : -1,
          brand: r(brand), brandInk: Math.round(ink),
          docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          badge: !!document.querySelector('.cm-msg-media-more'),
        };
      });

      /* A feed shows more than one thing. 60% is the ceiling the stylesheet
         sets; the assertion is deliberately looser so a tweak to the cap does
         not fail it, but 99% never passes. */
      const pct = Math.round(m.media.h / m.vh * 100);
      ok('a portrait photo cannot take the whole screen (' + m.media.h + 'px = ' + pct + '% of the viewport)',
         pct <= 70);

      /* And the crop is recoverable, or it is just destruction. */
      ok('the photo is a real control that opens it whole',
         await page.evaluate(() => {
           const b = document.querySelector('.cm-msg-media-btn');
           return !!b && b.tagName === 'BUTTON' && (b.getAttribute('aria-label') || '').length > 8;
         }));

      /* Every filter is reachable. "Yours" was off the screen entirely. */
      ok('every filter chip is on the screen (' + m.chipCount + ' chips, ' + m.chipsOver + 'px hidden)',
         m.chipCount === 5 && m.chipsOver <= 0);
      ok('…and none of them is cut off at the edge (' + m.chipsRight + ' ≤ ' + W + ')',
         m.chipsRight <= W);

      /* The wordmark ran outside its own box, under the buttons beside it. */
      ok('the wordmark stays inside its own box (ink ' + m.brandInk + ' ≤ box ' + m.brand.right + ')',
         m.brandInk <= m.brand.right + 1);
      ok('…and the page never scrolls sideways (' + m.docOver + 'px over)', m.docOver <= 0);

      await page.close();
    }

    /* ── The desktop layout the handoff actually specifies ────────────────
       Handoff §11, artboard 3A: rail · 260px channel list · centre · thread,
       as floating panes on the warm canvas, in a window that does not scroll
       as one page.

       What shipped was rail + ONE pane. On a 1280px screen the feed sat in its
       72ch reading column with ~430px of empty canvas beside it, there was no
       way to change channel without leaving what you were reading, and opening
       a thread covered the whole screen to show four replies — the phone
       pattern wearing a desktop's clothes, which is the exact thing the
       bundle's 3A supersedes. */
    console.log('\n── The desktop panes (handoff §11 / 3A) ──────────────────────');
    {
      const { page } = await openPage(browser, 1280, 900, WIDE);
      /* The artboard's centre pane is a CHANNEL, so open one. */
      await page.locator('.cmd-row').first().click();
      await page.waitForTimeout(600);
      const L = () => page.evaluate(() => {
        const r = (sel) => { const e = document.querySelector(sel); if (!e) return null;
          const b = e.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left) }; };
        return { rail: r('.cmm-tabs'), side: r('.cmm-side'), body: r('.cmm-body'),
                 thread: r('.cmm-thread'), over: r('.cmm-over'),
                 shell: r('.cmm'), vh: window.innerHeight,
                 pageScroll: document.documentElement.scrollHeight - window.innerHeight };
      });

      let m = await L();
      ok('the rail, the channel list and the centre are three separate panes',
         !!m.rail && !!m.side && !!m.body);
      ok('…laid out left to right in that order (' + m.rail.l + ' < ' + m.side.l + ' < ' + m.body.l + ')',
         m.rail.l < m.side.l && m.side.l < m.body.l);
      /* 268, measured off the artboard itself — the README's prose rounds it
         to 260 and the artboard is the authority. */
      ok('…with the channel list at the 268px the artboard draws (' + m.side.w + 'px)',
         m.side.w === 268);
      ok('…and the rail at 68px (' + m.rail.w + 'px)', m.rail.w === 68);
      /* A workspace, not a long page: each pane scrolls inside itself. */
      ok('the workspace fits the window rather than scrolling as one page ('
         + m.shell.h + 'px in ' + m.vh + 'px)', m.shell.h <= m.vh);

      /* The judgement call the bundle states outright: "destinations and
         conversations are separate concerns, so switching one never hides the
         other." Opening a thread must NARROW the centre, not cover it. */
      const bodyBefore = m.body.w;
      await page.locator('.cmm-msg-act', { hasText: 'replies' }).first().click();
      await page.waitForTimeout(500);
      m = await L();
      ok('a thread opens as a fourth pane, not an overlay',
         !!m.thread && !m.over);
      ok('…so the channel list and the rail are still there',
         !!m.rail && !!m.side);
      ok('…and the centre narrows to make room rather than being covered ('
         + bodyBefore + ' → ' + m.body.w + ')',
         m.body.w < bodyBefore && m.body.w > 300);
      ok('…and the thread pane does not overlap the centre ('
         + (m.body.l + m.body.w) + ' ≤ ' + m.thread.l + ')',
         m.body.l + m.body.w <= m.thread.l + 1);

      /* A 260px list is not a reading column, and a long channel name must not
         turn a 63px row into a 128px one. */
      ok('a long channel name is one ellipsised line in the list',
         await page.evaluate(() => {
           const n = Array.from(document.querySelectorAll('.cmd-row-n'))
             .find(x => x.textContent.length > 20);
           return !!n && n.getBoundingClientRect().height < 26 && n.scrollWidth > n.clientWidth;
         }));

      /* ── The artboard's chrome ────────────────────────────────────────── */
      ok('the workspace has its own global bar, and the marketing nav is gone',
         await page.evaluate(() => {
           const bar = document.querySelector('.cmd-bar');
           const site = document.querySelector('.topnav');
           return !!bar && Math.round(bar.getBoundingClientRect().height) === 54
             && (!site || getComputedStyle(site).display === 'none');
         }));
      ok('…carrying the command bar the artboard specifies, as a real button',
         await page.evaluate(() => {
           const j = document.querySelector('.cmd-jump');
           return !!j && j.tagName === 'BUTTON'
             && /Jump to a channel, person, entry/.test(j.textContent)
             && /⌘K/.test(j.textContent);
         }));
      ok('…and "Catch me up", the bell with its count, and the account avatar',
         await page.evaluate(() =>
           /Catch me up/.test(document.querySelector('.cmd-catch').textContent)
           && !!document.querySelector('.cmd-badge') && !!document.querySelector('.cmd-me')));

      /* Five destinations on the rail, not the phone's four. */
      ok('the rail carries all five destinations including Saved',
         await page.evaluate(() => {
           const t = Array.from(document.querySelectorAll('.cmm-tab .cmm-tab-l')).map(x => x.textContent);
           return t.length === 5 && t.join(',') === 'Today,Chans,Play,Journal,Saved';
         }));

      /* The channel pane's own furniture. */
      ok('the channel pane has All / Unread / Mine and a compose button',
         await page.evaluate(() => {
           /* Scoped to the pane. The same segmented control now also sits in
              the channel header (Newest / Hot), so an unscoped query counts
              five buttons and this used to read that as a broken pane. */
           const seg = Array.from(document.querySelectorAll('.cmm-side .cmd-seg-b')).map(x => x.textContent.trim());
           return seg.length === 3 && seg[0] === 'All' && /^Unread/.test(seg[1]) && seg[2] === 'Mine'
             && !!document.querySelector('.cmd-plus');
         }));
      ok('…and the ⌥↑/↓ hint, which actually walks the unread channels',
         await page.evaluate(() => /next unread/.test(document.querySelector('.cmd-foot').textContent)));

      /* The hint has to be true. Alt+ArrowDown must move to an unread channel
         — a printed shortcut that does nothing is worse than none. */
      const before = await page.evaluate(() => {
        const on = document.querySelector('.cmd-row.is-on'); return on ? on.textContent : ''; });
      await page.keyboard.down('Alt'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Alt');
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => {
        const on = document.querySelector('.cmd-row.is-on'); return on ? on.textContent : ''; });
      ok('…so ⌥↓ really moves to the next unread channel', !!after && after !== before);

      /* A channel you cannot type into is one you are reading, not one you
         are in. The artboard pins a composer to the pane. */
      ok('the channel pane has a docked composer',
         await page.evaluate(() => {
           const c = document.querySelector('.cmd-composer .cm-composer');
           if (!c) return false;
           const pane = document.querySelector('.cmm-body').getBoundingClientRect();
           const b = c.getBoundingClientRect();
           return b.bottom <= pane.bottom + 2 && b.top > pane.top + 100;
         }));
      /* …and the header is the full-bleed bar the artboard draws, not the
         narrow centred pill the reading-column cap made of it. */
      ok('the channel header spans the pane rather than floating in it',
         await page.evaluate(() => {
           const h = document.querySelector('.cmm-ch-head');
           const p = document.querySelector('.cmm-body');
           if (!h || !p) return false;
           return h.getBoundingClientRect().width >= p.getBoundingClientRect().width - 4;
         }));
      /* ── The header controls, handoff §3 and §11 ── */
      ok('the channel header carries the presence stack, the centres and the purpose',
         await page.evaluate(() => {
           const faces = document.querySelectorAll('.cmm-ch-head .cmd-ch-face');
           const centres = document.querySelector('.cmm-ch-centres');
           const sub = document.querySelector('.cmm-ch-head .cmm-sub');
           if (!faces.length || !sub) return false;
           /* Overlapped, not spaced: the artboard's -8px. */
           const a = faces[0].getBoundingClientRect(), b = faces[1] && faces[1].getBoundingClientRect();
           const overlapped = !b || b.left < a.right;
           return overlapped && !!centres && sub.textContent.trim().length > 0;
         }));
      ok('…and Newest / Hot, in the bundle\'s own words', await page.evaluate(() => {
        const seg = Array.from(document.querySelectorAll('.cmd-ch-tools .cmd-seg-b')).map(x => x.textContent.trim());
        return seg.length === 2 && seg[0] === 'Newest' && seg[1] === 'Hot';
      }));
      /* Every control clears 24x24 (WCAG 2.2 2.5.8); the artboard draws 34. */
      ok('…and every one of them is at least 34px, as the artboard draws them',
         await page.evaluate(() =>
           Array.from(document.querySelectorAll('.cmd-ch-tools .cmd-seg, .cmd-ch-tools .cmd-ch-btn'))
             .every(el => { const r = el.getBoundingClientRect(); return r.height >= 33.5 && r.width >= 33.5; })));

      /* ⓘ carries the roster the permanent rail used to hold (handoff §11) —
         and it must NOT push the conversation down the screen. */
      const streamTopBefore = await page.evaluate(() =>
        document.querySelector('.cmm-stream').getBoundingClientRect().top);
      await page.locator('.cmd-ch-tools .cmd-ch-btn').last().click();
      await page.waitForTimeout(300);
      ok('ⓘ opens channel info, carrying the member roster',
         await page.evaluate(() => {
           const p = document.querySelector('.cmd-chinfo');
           return !!p && p.querySelectorAll('.cmd-chinfo-roster li').length > 0;
         }));
      const streamTopAfter = await page.evaluate(() =>
        document.querySelector('.cmm-stream').getBoundingClientRect().top);
      ok('…as a popover, so the conversation does not move under the reader',
         Math.abs(streamTopAfter - streamTopBefore) < 2);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      ok('…and Escape closes it', await page.evaluate(() => !document.querySelector('.cmd-chinfo')));
      /* …and closing it did NOT take the thread with it. A thread is a pane
         beside the channel here, not a modal over it: only a modal owns
         Escape. This threw away an open thread every time. */
      ok('…without throwing away the thread beside it',
         await page.evaluate(() => !!document.querySelector('.cmm-thread')));

      /* The chrome is pinned and only the stream scrolls — the artboard's
         <main> is overflow:hidden. With the whole pane scrolling, the header
         and composer slid away with the conversation. */
      ok('the header and the composer stay put while the messages scroll',
         await page.evaluate(async () => {
           const head = document.querySelector('.cmm-ch-head');
           const dock = document.querySelector('.cmd-composer');
           const stream = document.querySelector('.cmm-stream');
           const h0 = head.getBoundingClientRect().top, d0 = dock.getBoundingClientRect().top;
           stream.scrollTop = stream.scrollHeight;
           await new Promise(r => requestAnimationFrame(r));
           return Math.abs(head.getBoundingClientRect().top - h0) < 1
               && Math.abs(dock.getBoundingClientRect().top - d0) < 1;
         }));

      /* ⤢ — handoff §11: "replying no longer costs you the channel; ⤢ expands
         it". Expanding must WIDEN the thread and must not take the channel
         away, which would be the phone overlay again in a desktop's clothes. */
      const widths = await page.evaluate(async () => {
        const w = () => ({ t: document.querySelector('.cmm-thread').getBoundingClientRect().width,
                           c: document.querySelector('.cmm-body').getBoundingClientRect().width });
        const before = w();
        document.querySelector('.cm-thread-wide').click();
        await new Promise(r => setTimeout(r, 260));
        const after = w();
        document.querySelector('.cm-thread-wide').click();
        await new Promise(r => setTimeout(r, 260));
        return { before, after, back: w() };
      });
      ok('⤢ widens the thread', widths.after.t > widths.before.t + 40);
      ok('…without taking the channel away', widths.after.c > 320);
      ok('…and it goes back', Math.abs(widths.back.t - widths.before.t) < 2);
      /* Widened, the channel pane loses ~340px. The header must give that up
         from the controls, not from the channel's name: it rendered a single
         letter — "A" — while the presence stack kept every pixel of its own. */
      const narrowTitle = await page.evaluate(async () => {
        document.querySelector('.cm-thread-wide').click();
        await new Promise(r => setTimeout(r, 300));
        const t = document.querySelector('.cmm-ch-title');
        const w = t.getBoundingClientRect().width;
        document.querySelector('.cm-thread-wide').click();
        await new Promise(r => setTimeout(r, 300));
        return w;
      });
      ok('…and the channel keeps a readable name while it is widened', narrowTitle >= 100);

      /* Newest / Hot is a real sort, not a label: switching it must re-ask the
         server, and the server takes `sort` on the feed. */
      const sortAsk = new Promise(res => {
        const h = (r) => { const u = new URL(r.url());
          if (u.searchParams.get('view') === 'feed' && u.searchParams.get('sort') === 'trending') {
            page.off('request', h); res(true); } };
        page.on('request', h);
        setTimeout(() => res(false), 4000);
      });
      await page.locator('.cmd-ch-tools .cmd-seg-b', { hasText: 'Hot' }).click();
      ok('Hot asks the server for the trending ranking', await sortAsk);
      await page.locator('.cmd-ch-tools .cmd-seg-b', { hasText: 'Newest' }).click();
      await page.waitForTimeout(400);

      /* The bookmark filter narrows to saved — and when nothing is saved it
         says so, instead of the channel's "be the first to post" empty state
         in a channel with messages in it. */
      await page.locator('.cmd-ch-tools .cmd-ch-btn').first().click();
      await page.waitForTimeout(300);
      ok('the saved filter says it is a filter when it finds nothing',
         await page.evaluate(() => {
           const e = document.querySelector('.cmm-stream .cmm-empty, .cmm-stream [class*="empty"]');
           const txt = document.querySelector('.cmm-stream').textContent;
           return /saved/i.test(txt) && !/be the first/i.test(txt) && !!e;
         }));
      await page.locator('.cmd-ch-tools .cmd-ch-btn').first().click();
      await page.waitForTimeout(300);

      /* And the thread's own header stacks instead of running together. */
      ok('the thread header keeps its title clear of the channel and the close button',
         await page.evaluate(() => {
           const t = document.querySelector('.cm-thread-title');
           const c = document.querySelector('.cm-thread-chan');
           const x = document.querySelector('.cm-thread-x');
           if (!t || !c || !x) return false;
           const tb = t.getBoundingClientRect(), cb = c.getBoundingClientRect(), xb = x.getBoundingClientRect();
           return cb.top >= tb.bottom - 1 && cb.right <= xb.left + 1;
         }));
      await page.close();
    }

    /* A phone keeps every one of the phone behaviours. */
    console.log('\n── …and the phone is untouched ───────────────────────────────');
    {
      const { page } = await openPage(browser, 390, 844, WIDE);
      ok('no channel-list pane on a phone — it is a tab, as it has always been',
         await page.evaluate(() => !document.querySelector('.cmm-side')));
      await page.locator('.cmm-msg-act', { hasText: 'replies' }).first().click();
      await page.waitForTimeout(500);
      ok('…and a thread is still the full-screen overlay it has always been',
         await page.evaluate(() =>
           !!document.querySelector('.cmm-over') && !document.querySelector('.cmm-thread')));
      ok('…with the tab bar hidden under it, as the bundle says',
         await page.evaluate(() => !document.querySelector('.cmm-tabs')));
      await page.close();
    }

    /* The badge must tell the truth. It says "tap to see it all", so it may
       only appear when there IS more to see. */
    console.log('\n── Does the crop badge tell the truth? ───────────────────────');
    for (const [label, W, H, media, expect] of [
      ['a portrait photo on a laptop is cropped', 1280, 900, TALL, true],
      ['a landscape photo is not', 1280, 900, WIDE, false],
      ['…nor is one that fits on a phone', 390, 844, WIDE, false],
    ]) {
      const { page } = await openPage(browser, W, H, media);
      const badge = await page.evaluate(() => !!document.querySelector('.cm-msg-media-more'));
      ok(label + ' — badge ' + (badge ? 'shown' : 'hidden'), badge === expect);
      await page.close();
    }
  } finally {
    await browser.close();
    srv.kill();
  }

  console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ': ' + pass + ' passed, ' + fail + ' failed (community page)');
  process.exit(fail === 0 ? 0 : 1);
})();
