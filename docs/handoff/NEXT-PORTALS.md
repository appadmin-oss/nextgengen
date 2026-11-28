# Next: the portal home screens (28 Nov 2026)

Read `docs/design/HANDOFF-REDESIGN.md` (the owner's redesign handoff; the bundle is not in this repo) first.

## Done on `claude/ngg-portal-navigation`
The member portal's MENU is the v10 design's, one menu for every age and view (`mp9Areas` in
`src/modules/member9/mp9-more.jsx`; parity held by `tests/member-nav.test.js`). The family portal's phone bar
already matched the v4 design and was left alone.

## Not done, in this order
1. **Member v10 Today screen, 9–13 first** (handoff §4.4). Findings from a first attempt, so you start further on:
   - The handoff's `patches/dc-compile.patch` applies cleanly to `tools/dc-compile.js` (`git apply`); it was NOT kept.
   - The compiler needs the `*-subs.json` file to EXIST before it runs (start it as `{}`).
   - Compiled as-is, `member-portal-v10-913(-phone).dc.html` give views with only **3** `v.` fields: the board is
     sample copy ("Hi Ada!", "Ask a grown-up about their first job", "6 days", "240"…). The real work is the subs
     file: map each sample string to a `{{ field }}` (as `src/modules/member9/mp9-subs.json` does for v9), then
     build those fields in the controller from what `mp9` Today already loads (`this.dd("today")`, missions,
     streak, badges, points). Do not ship the board with sample copy: a child would see somebody else's name.
   - Pick desktop or phone by the portal container's width, not the viewport (phone below 760px), and keep
     every other section on `Mp9View`. `PetMini` is a slot (handoff §4.5).
   - What the 9–13 board shows, checked against the code: streak, points, level, daily quests, promises,
     courage dare, mood check, the Helper, the Saturday schedule all have sources in `src/modules/member9` /
     `api/domain`. **The proverb of the week has none** — leave that card out, or ask the owner for a source;
     never ship it with the sample proverb. About 70 sample strings in all; budget a full session.
   - Prove with `tests/member-v9.test.js` (60 checks today) and add a check that no sample name ("Ada") renders.
2. **Family v4 Today + child switcher** (handoff §4.6): same method; `fp3-app.jsx` is the controller to extend.
3. **Learn and Labs v2** (handoff §4.7).
4. Then the 14–15 and 16–17 member bands.

Faithful (`appadmin-oss/faithful`): `faithful outline <board>` lists a board's copy and structure in seconds,
which is the fastest way to write the subs map; `faithful verify <board> --build <url>` once it renders.
