/* ============================================================================
   "My week" — a child's PERSONAL timetable, made by tapping (/timetable?easy=1,
   and what a signed-in member with no timetable yet sees at /timetable).

   Owner, 19 Nov 2026: "The timetable is also pretty complicated for kids. It
   needs to be reviewed and fixed" … "The focus is not school week. Personal
   timetable first!" The maker (tt-app.jsx) is a full tool — four kinds of
   entry, free times, colours, one-off skips, posters, print options. A child
   making their own week needs four questions, one screen each:

     1. School — which days, when it starts, when it ends. (Or "I don't go".)
     2. After school and weekends — tap what you do (homework, extra lessons,
        football, chores, church, mosque, Arabic school…), then the days, the
        time and how long. Add as many as you like.
     3. NGG — your own sessions at your centre, already ticked.
     4. Check your week, day by day; anything that overlaps is pointed out
        in words, and you save.

   Taps, not typing (one optional box for something not listed); every target
   at least 56px; one question on screen; a progress bar; the words a
   twelve-year-old uses. Nothing needs a drag.

   It writes the SAME document the maker keeps (member_timetables), through
   the member's own save op with the version it read, so a change made in the
   maker meanwhile is never overwritten unseen. Only what this flow made (ids
   "mw…") and the NGG sessions are replaced; anything else in the week stays.
   The registration checklist's "Personal timetable on the site" item
   (domain/registration-checklist.php) is met by school on three weekdays and
   one thing of the child's own.
   ========================================================================== */

const MW_DAYS = [[1, "Mon", "Monday"], [2, "Tue", "Tuesday"], [3, "Wed", "Wednesday"], [4, "Thu", "Thursday"], [5, "Fri", "Friday"], [6, "Sat", "Saturday"], [7, "Sun", "Sunday"]];
const MW_SCHOOL_START = ["07:00", "07:30", "07:45", "08:00", "08:30"];
const MW_SCHOOL_END = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
/* What children here do with their week, in their words. kind: the maker's (tt-core TT_KINDS). */
const MW_ACTIVITIES = [
  ["Homework", "study"], ["Study time", "study"], ["Extra lessons", "study"], ["Reading", "study"], ["Arabic school", "study"], ["Coding practice", "study"],
  ["Football", "activity"], ["Sport", "activity"], ["Music practice", "activity"], ["Chores", "activity"], ["Church", "activity"], ["Mosque", "activity"],
  ["Family time", "activity"], ["Free time", "break"],
];
const MW_PARTS = { morning: ["Morning", 5 * 60, 12 * 60], afternoon: ["Afternoon", 12 * 60, 17 * 60], evening: ["Evening", 17 * 60, 22 * 60] };
const MW_LENGTHS = [[30, "30 min"], [60, "1 hour"], [90, "1½ hours"], [120, "2 hours"]];
const MW_DEFAULT_SCHOOL = { on: true, days: [1, 2, 3, 4, 5], start: "08:00", end: "14:00" };

/* ── The model (pure; tests/timetable-myweek.test.js) ── */

/** The week as timetable entries: school, the child's own things, and the NGG sessions they keep. */
function mwEntries(school, items, ngg) {
  const out = [];
  if (school && school.on && school.days.length && ttMin(school.end) > ttMin(school.start))
    out.push({ id: "mwschool", title: "School", days: school.days.slice().sort((a, b) => a - b), start: school.start, end: school.end, place: "", color: 0, kind: "class" });
  (items || []).forEach((x, i) => {
    const a = ttMin(x.start); if (a === null || !x.days.length) return;
    out.push({ id: "mw" + i.toString(36), title: String(x.title).slice(0, 60), days: x.days.slice().sort((p, q) => p - q), start: x.start,
      end: ttHhmm(Math.min(a + x.len, 23 * 60 + 59)), place: "", color: (i + 1) % 8, kind: x.kind });
  });
  (ngg || []).filter(e => e.keep).forEach((e, i) => out.push(Object.assign({}, e.entry, { id: "mwngg" + i.toString(36) })));
  return out;
}

/** Into the saved document: what this flow made and the NGG sessions are replaced (the NGG ones only when `nggFresh`); everything else stays. */
function mwMerge(doc, entries, nggFresh) {
  const d = doc && typeof doc === "object" ? doc : {};
  const keep = (Array.isArray(d.entries) ? d.entries : []).filter(e => e && !/^mw/.test(String(e.id || "")) && !(nggFresh && e.official));
  const settings = Object.assign({ title: "My week" }, d.settings || {});
  return { settings, entries: keep.concat(entries).slice(0, 120), exceptions: d.exceptions || {} };
}

/** What this flow made before, read back: the school answers and the child's own things. */
function mwFrom(doc) {
  const es = doc && Array.isArray(doc.entries) ? doc.entries : [];
  const s = es.find(e => e && e.id === "mwschool");
  const items = es.filter(e => e && /^mw[0-9a-z]+$/.test(String(e.id)) && e.id !== "mwschool" && !/^mwngg/.test(e.id))
    .map(e => ({ title: e.title, kind: e.kind, days: e.days.slice(), start: e.start, len: ttMin(e.end) - ttMin(e.start) }));
  const madeHere = !!s || items.length > 0;
  return { school: s ? { on: true, days: s.days.slice(), start: s.start, end: s.end } : (madeHere ? Object.assign({}, MW_DEFAULT_SCHOOL, { on: false }) : null), items };
}

/** Pairs that overlap on a day, in words a child reads: [{ day, a, b }]. */
function mwClashes(entries) {
  const out = [];
  MW_DAYS.forEach(([d, , name]) => {
    const on = entries.filter(e => e.days.includes(d)).sort((x, y) => ttMin(x.start) - ttMin(y.start));
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++)
      if (ttMin(on[j].start) < ttMin(on[i].end)) out.push({ day: name, a: on[i].title, b: on[j].title });
  });
  return out;
}

/* ── The screens ── */

/** One question answered by tapping: big chips; `multi` for days. */
function MwChips({ label, value, options, onPick, multi }) {
  return (
    <fieldset className="tsw-q"><legend>{label}</legend>
      <div className="tsw-chips" role={multi ? "group" : "radiogroup"} aria-label={label}>
        {options.map(([v, l]) => {
          const on = multi ? value.includes(v) : value === v;
          return <button key={String(v)} type="button" role={multi ? "checkbox" : "radio"} aria-checked={on} className={"tsw-chip" + (on ? " is-on" : "")}
            onClick={() => onPick(multi ? (on ? value.filter(x => x !== v) : value.concat([v])) : v)}>{l}</button>;
        })}
      </div>
    </fieldset>
  );
}

/** Add (or change) one thing the child does: which days, when, how long. */
function MwItemForm({ item, onSave, onCancel }) {
  const [x, setX] = React.useState(item);
  const [part, setPart] = React.useState(() => { const m = ttMin(item.start); return m === null ? "afternoon" : m < 12 * 60 ? "morning" : m < 17 * 60 ? "afternoon" : "evening"; });
  const [, from, to] = MW_PARTS[part];
  const times = []; for (let t = from; t < to; t += 30) times.push([ttHhmm(t), ttFmt(t, "12")]);
  const ok = x.days.length > 0 && ttMin(x.start) !== null;
  return (
    <div className="tsw-sheet" role="group" aria-label={"When is " + x.title + "?"} onKeyDown={e => { if (e.key === "Escape") onCancel(); }}>
      <h3 className="tsw-h3">{x.title}</h3>
      <MwChips label="Which days?" multi value={x.days} options={MW_DAYS.map(([d, s]) => [d, s])} onPick={v => setX(Object.assign({}, x, { days: v }))}/>
      <MwChips label="What part of the day?" value={part} options={Object.keys(MW_PARTS).map(k => [k, MW_PARTS[k][0]])} onPick={setPart}/>
      <MwChips label="It starts at" value={x.start} options={times} onPick={v => setX(Object.assign({}, x, { start: v }))}/>
      <MwChips label="It lasts" value={x.len} options={MW_LENGTHS} onPick={v => setX(Object.assign({}, x, { len: v }))}/>
      <div className="tsw-nav">
        <button type="button" className="tsw-back" onClick={onCancel}>Cancel</button>
        <button type="button" className="tsw-go" disabled={!ok} onClick={() => onSave(x)}>{ok ? "Add to my week" : "Pick days and a time"}</button>
      </div>
    </div>
  );
}

function TtMyWeek() {
  const auth = useAuth() || {};
  const member = auth.member || null;
  const first = member ? String(member.fullName || "").trim().split(/\s+/)[0] : "";
  const [step, setStep] = React.useState(0);            // 0 school · 1 my things · 2 NGG · 3 check · 4 saved
  const [school, setSchool] = React.useState(MW_DEFAULT_SCHOOL);
  const [items, setItems] = React.useState([]);
  const [editing, setEditing] = React.useState(null);   // { i, item } | null
  const [other, setOther] = React.useState("");
  const [ngg, setNgg] = React.useState({ state: "idle", list: [], centre: "" });
  const [server, setServer] = React.useState({ state: "idle", doc: null, base: "" });
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");
  const topRef = React.useRef(null);

  const load = React.useCallback(() => {
    if (!member) return;
    setServer(s => Object.assign({}, s, { state: "loading" }));
    NGGApi.member.myTimetable().then(r => {
      const doc = (r && r.timetable) || null;
      setServer({ state: "ready", doc, base: (doc && doc.updatedAt) || "" });
      const back = mwFrom(doc);
      if (back.school) setSchool(back.school);
      if (back.items.length) setItems(back.items);
    }, () => setServer({ state: "error", doc: null, base: "" }));
    // Their own sessions at their centre, already ticked (member_timetable marks which are theirs).
    setNgg(n => Object.assign({}, n, { state: "loading" }));
    NGGApi.member.timetable().then(r => {
      const list = r && Array.isArray(r.slots) ? ttSlotsToEntries(r, member).map(e => ({ entry: e, keep: !!e.mine })) : [];
      setNgg({ state: "ready", list, centre: (r && r.centre) || "" });
    }, () => setNgg({ state: "none", list: [], centre: "" }));
  }, [member && member.memberId]);
  React.useEffect(() => { load(); }, [load]);

  const go = n => { setStep(n); setEditing(null); setErr(""); try { (topRef.current || document.body).scrollIntoView({ block: "start" }); } catch (_) {} };

  if (!member) {
    return (
      <div className="tsw" ref={topRef}>
        <div className="tsw-card tsw-center">
          <h1 className="tsw-h1">My week</h1>
          <p className="tsw-lead">Sign in as yourself first, so your week is saved to your NGG account.</p>
          <button type="button" className="tsw-go" onClick={() => auth.openSignIn && auth.openSignIn()}>Sign in</button>
          <a className="tsw-out" href="/timetable">Make a timetable without signing in</a>
        </div>
      </div>
    );
  }

  const entries = mwEntries(school, items, ngg.list);
  const clashes = mwClashes(entries);
  const hasNgg = ngg.state === "ready" && ngg.list.length > 0;
  const steps = hasNgg ? 4 : 3;
  const shown = step === 3 && !hasNgg ? 2 : step;   // the progress, without a step that is not there

  async function saveWeek() {
    setSaving(true); setErr("");
    const fresh = ngg.state === "ready";
    const send = (doc, base) => NGGApi.member.saveMyTimetable(Object.assign(mwMerge(doc, entries, fresh), { baseUpdatedAt: base }));
    try {
      try { await send(server.doc, server.base); }
      catch (e) {
        // Changed somewhere else since this page read it: read it again and put the week into THAT.
        if (!(e && e.data && e.data.error === "conflict")) throw e;
        const now = e.data.server || ((await NGGApi.member.myTimetable()) || {}).timetable || null;
        await send(now, (now && now.updatedAt) || "");
      }
      go(4);
    } catch (e) {
      setErr("That didn’t save. Check your connection and try again." + (e && e.data && e.data.error ? " (" + e.data.error + ")" : ""));
    } finally { setSaving(false); }
  }

  const fmt = t => ttFmt(ttMin(t), "12");
  const dayWord = days => days.length === 7 ? "Every day" : days.join() === "1,2,3,4,5" ? "Weekdays" : days.join() === "6,7" ? "Weekends"
    : days.map(d => MW_DAYS[d - 1][1]).join(", ");

  return (
    <div className="tsw" ref={topRef}>
      <header className="tsw-head">
        <a className="tsw-out" href="/timetable?full=1">Full timetable maker</a>
        <h1 className="tsw-h1">{step === 4 ? "Saved!" : first ? first + "’s week" : "My week"}</h1>
        {step < 4 && <div className="tsw-bar" role="progressbar" aria-valuemin={1} aria-valuemax={steps} aria-valuenow={shown + 1} aria-label={"Step " + (shown + 1) + " of " + steps}>
          <span style={{ width: ((shown + 1) / steps * 100) + "%" }}/></div>}
      </header>
      {server.state === "error" && <p className="tsw-warn" role="alert">Your saved timetable couldn’t load. <button type="button" className="tsw-link" onClick={load}>Try again</button></p>}

      {step === 0 && <section className="tsw-card" aria-labelledby="mw-0">
        <h2 id="mw-0" className="tsw-h2">School</h2>
        <p className="tsw-lead">Tap the answers. You can change them later.</p>
        <MwChips label="Do you go to school?" value={school.on} options={[[true, "Yes"], [false, "No"]]} onPick={v => setSchool(Object.assign({}, school, { on: v }))}/>
        {school.on && <>
          <MwChips label="Which days?" multi value={school.days} options={MW_DAYS.map(([d, s]) => [d, s])} onPick={v => setSchool(Object.assign({}, school, { days: v }))}/>
          <MwChips label="School starts at" value={school.start} options={MW_SCHOOL_START.map(t => [t, fmt(t)])} onPick={v => setSchool(Object.assign({}, school, { start: v }))}/>
          <MwChips label="School ends at" value={school.end} options={MW_SCHOOL_END.map(t => [t, fmt(t)])} onPick={v => setSchool(Object.assign({}, school, { end: v }))}/>
        </>}
        <div className="tsw-nav"><span/><button type="button" className="tsw-go" disabled={school.on && !school.days.length} onClick={() => go(1)}>Next</button></div>
      </section>}

      {step === 1 && <section className="tsw-card" aria-labelledby="mw-1">
        <h2 id="mw-1" className="tsw-h2">What else do you do?</h2>
        {editing
          ? <MwItemForm item={editing.item} onCancel={() => setEditing(null)}
              onSave={x => { setItems(l => editing.i >= 0 ? l.map((y, k) => k === editing.i ? x : y) : l.concat([x])); setEditing(null); }}/>
          : <>
            <p className="tsw-lead">After school and at weekends. Tap one, then say when. Add as many as you like.</p>
            {items.length > 0 && <ul className="tsw-mine" aria-label="In your week">
              {items.map((x, i) => <li key={i}>
                <button type="button" className="tsw-mine-item" onClick={() => setEditing({ i, item: x })}><b>{x.title}</b><span>{dayWord(x.days)} · {fmt(x.start)}</span></button>
                <button type="button" className="tsw-x" aria-label={"Remove " + x.title} onClick={() => setItems(l => l.filter((_, k) => k !== i))}>Remove</button></li>)}
            </ul>}
            <div className="tsw-subjects">
              {MW_ACTIVITIES.map(([t, kind]) => <button key={t} type="button" className="tsw-subj" onClick={() => setEditing({ i: -1, item: { title: t, kind, days: [], start: "", len: 60 } })}>{t}</button>)}
            </div>
            <form className="tsw-other" onSubmit={e => { e.preventDefault(); const t = other.trim().slice(0, 40); if (t) { setOther(""); setEditing({ i: -1, item: { title: t, kind: "activity", days: [], start: "", len: 60 } }); } }}>
              <label htmlFor="mw-other">Something else</label>
              <input id="mw-other" value={other} maxLength={40} placeholder="Type it here" onChange={e => setOther(e.target.value)}/>
              <button type="submit" className="tsw-chip" disabled={!other.trim()}>Next</button>
            </form>
            <div className="tsw-nav">
              <button type="button" className="tsw-back" onClick={() => go(0)}>Back</button>
              <button type="button" className="tsw-go" onClick={() => go(hasNgg ? 2 : 3)}>{items.length ? "Next" : "Skip for now"}</button>
            </div>
          </>}
      </section>}

      {step === 2 && <section className="tsw-card" aria-labelledby="mw-2">
        <h2 id="mw-2" className="tsw-h2">Your NGG sessions</h2>
        <p className="tsw-lead">At {ngg.centre || "your centre"}. Yours are ticked. Tap to change.</p>
        <div className="tsw-chips tsw-col" role="group" aria-label="NGG sessions">
          {ngg.list.map((x, i) => <button key={i} type="button" role="checkbox" aria-checked={x.keep} className={"tsw-chip tsw-row" + (x.keep ? " is-on" : "")}
            onClick={() => setNgg(n => Object.assign({}, n, { list: n.list.map((y, k) => k === i ? Object.assign({}, y, { keep: !y.keep }) : y) }))}>
            <b>{x.entry.title}</b><span>{MW_DAYS[x.entry.days[0] - 1][2]} · {fmt(x.entry.start)}–{fmt(x.entry.end)}</span></button>)}
        </div>
        <div className="tsw-nav"><button type="button" className="tsw-back" onClick={() => go(1)}>Back</button><button type="button" className="tsw-go" onClick={() => go(3)}>Next</button></div>
      </section>}

      {step === 3 && <section className="tsw-card" aria-labelledby="mw-3">
        <h2 id="mw-3" className="tsw-h2">Is this your week?</h2>
        {clashes.length > 0 && <p className="tsw-warn" role="status">These happen at the same time: {clashes.slice(0, 3).map(c => c.a + " and " + c.b + " on " + c.day).join("; ")}. Tap Back to change one, or keep it if that is right.</p>}
        <ol className="tsw-week">
          {MW_DAYS.map(([d, , name]) => {
            const on = entries.filter(e => e.days.includes(d)).sort((x, y) => ttMin(x.start) - ttMin(y.start));
            return <li key={d}><h3 className="tsw-h3">{name}</h3>
              {on.length ? <ul>{on.map(e => <li key={e.id + d}><span className="tsw-t">{fmt(e.start)}</span><b>{e.title}</b></li>)}</ul> : <p className="tsw-none">Nothing yet</p>}</li>;
          })}
        </ol>
        {err && <p className="tsw-warn" role="alert">{err}</p>}
        <div className="tsw-nav">
          <button type="button" className="tsw-back" onClick={() => go(hasNgg ? 2 : 1)}>Back</button>
          <button type="button" className="tsw-go" disabled={saving || !entries.length} onClick={saveWeek}>{saving ? "Saving…" : "Save my week"}</button>
        </div>
      </section>}

      {step === 4 && <section className="tsw-card tsw-center" aria-live="polite">
        <p className="tsw-big" aria-hidden="true">✓</p>
        <h2 className="tsw-h2">Your week is saved{first ? ", " + first : ""}.</h2>
        <p className="tsw-lead">It is on your NGG account. Open it any time, print it, or set it as your phone’s wallpaper.</p>
        <a className="tsw-go" href="/timetable?full=1">See and print my week</a>
        <button type="button" className="tsw-back" onClick={() => go(1)}>Change something</button>
      </section>}
    </div>
  );
}
