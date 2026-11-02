/* ============================================================================
   The Control Room's panels — the v1 screens, mounted inside Control Room v2.

   Control Room v2 (src/modules/control/) is the shell: its registry
   (cr-pages.jsx), navigation, layers and the tabs rebuilt as blocks. The tabs
   not yet rebuilt mount the panel that served them in v1, from this file, in a
   `custom` block (cr-tab-*.jsx) — the same component, so nothing an operator
   could do in v1 is lost on the way to v2. A tab rebuilt natively stops
   mounting its panel; the panel can then be deleted here.

   v1's own shell — its section registry, router, sidebar, top bar and Home —
   is NOT here: one registry, CR_PAGES (CLAUDE.md §11). A panel that jumps to
   another section does so through adminJump(), which hands the section id
   (an old id is fine: crResolve forwards it) to the v2 shell.
   ========================================================================== */

/** Ask the open panel to switch to `tab` (the pending-tab store is in page-portals.jsx). */
function setPendingAdminTab(tab) {
  _pendingAdminTab = tab || "";
  _pendingTabSubs.forEach(fn => { try { fn(); } catch (_) {} });
}

/** Go to another Control Room section, and optionally one of its sub-tabs. */
function adminJump(sectionId, tab) {
  if (window.__adminSection) window.__adminSection(sectionId, tab);
  else setPendingAdminTab(tab);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Member accounts ─────────────────────────────────────────────────────────
 *
 * Five signals about SIGNING IN, which is the one thing the members roster
 * assumes and never checks. Each is a count, a sentence saying why it matters,
 * and the members it counts — because a count nobody can act on is an
 * accusation rather than a tool, and "14 locked out" with no names is exactly
 * that.
 *
 * Nothing here ends an account. Whether a membership continues is settled by
 * the MoU between NGG and the family; the screen says so rather than leaving
 * an operator to look for a button that is deliberately absent.
 */
function AdminAccounts() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [openId, setOpenId] = React.useState("");

  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.admin.accounts.overview().then(setD)
      .catch(e => setErr(e.code || e.message || "load_failed"));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const unlock = async (m) => {
    setBusy(m.memberId);
    try {
      await NGGApi.admin.accounts.unlock(m.memberId);
      toast.success(m.fullName + " can sign in again.", "Lock lifted");
      await load();
    } catch (e) { toast.error(humanizeError(e.message, e.code), "Lock not lifted"); }
    finally { setBusy(""); }
  };

  if (err) return <ErrorState code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;

  const clean = (d.signals || []).every(s => s.count === 0);

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Member accounts</h2>
        <div className="admin-section-actions">
          <span className="mono acct-totals">
            {fmtNum(d.totals.active)} active{d.totals.closed ? " · " + fmtNum(d.totals.closed) + " erased" : ""}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>
      <p className="admin-hint" style={{ marginTop: 0 }}>
        Whether somebody can get in, which the roster assumes and never checks.
        <b> Ending a membership is not done here</b> — that is settled by the agreement
        between NGG and the family, and no button on this screen or a member&rsquo;s own
        dashboard closes an account.
      </p>

      {clean ? (
        <div className="admin-empty">
          Nobody is locked out, everybody has an email to sign in with, and every staff
          account has a second factor. Nothing to do.
        </div>
      ) : (
        <div className="acct-signals">
          {(d.signals || []).filter(s => s.count > 0).map(sig => {
            const isOpen = openId === sig.id;
            return (
              <div key={sig.id} className="admin-panel acct-signal">
                <button type="button" className="acct-signal-head"
                  aria-expanded={isOpen} aria-controls={"acct-" + sig.id}
                  onClick={() => setOpenId(isOpen ? "" : sig.id)}>
                  <span className="mono acct-signal-n">{fmtNum(sig.count)}</span>
                  <span className="acct-signal-text">
                    <b>{sig.label}</b>
                    <span className="acct-signal-why">{sig.why}</span>
                  </span>
                  <span className="acct-signal-caret" aria-hidden="true">{isOpen ? "–" : "+"}</span>
                </button>
                {isOpen && (
                  <div id={"acct-" + sig.id} className="acct-list">
                    {sig.members.map(m => (
                      <div key={m.memberId} className="acct-row">
                        <span className="acct-row-name">
                          {m.fullName || "—"}
                          <span className="mono acct-row-meta">
                            {[m.displayId, m.centre].filter(Boolean).join(" · ") || m.memberId}
                          </span>
                        </span>
                        {sig.id === "locked"
                          ? <button type="button" className="btn btn-ghost btn-sm"
                              disabled={busy === m.memberId} onClick={() => unlock(m)}>
                              {busy === m.memberId ? "…" : "Lift the lock"}
                            </button>
                          : <span className="mono acct-row-meta">{m.email || "no email"}</span>}
                      </div>
                    ))}
                    {sig.count > sig.members.length && (
                      <div className="acct-more">
                        …and {fmtNum(sig.count - sig.members.length)} more. The roster holds them all.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminAttendanceDuty() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const load = (d) => { setErr(""); return NGGApi.admin.attendance.admin(d || date).then(setData).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { setData(null); load(date); /* eslint-disable-next-line */ }, [date]);
  const vols = (data && data.volunteers) || [];
  const setTaker = async (centre, volunteerId) => { if (!volunteerId) return; setBusy(centre); try { const r = await NGGApi.admin.attendance.set(date, centre, volunteerId); setData(r); toast.success("Duty updated"); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  const closeRoll = async (centre, volunteerId) => {
    if (!(await dialog.confirm({ title: "Close the roll for " + centre + "?", body: "This finalises today's attendance for " + centre + " and awards the duty volunteer their service points. It can't be reopened here.", cta: "Close roll" }))) return;
    setBusy(centre); try { const r = await NGGApi.admin.attendance.complete(date, centre, volunteerId); toast.success(r.message || "Roll closed"); await load(date); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const [board, setBoard] = React.useState(null);
  const loadBoard = () => NGGApi.admin.attendance.leaderboard().then(r => setBoard(r.leaderboard || [])).catch(() => setBoard([]));
  React.useEffect(() => { loadBoard(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Attendance duty</h2>
        <input type="date" className="admin-input" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: 180 }} aria-label="Duty date"/>
      </div>
      <p className="admin-hint">One volunteer per centre is on the roll each day — auto-rotated across active volunteers; override any pick. Closing the roll awards points toward levels + awards (emailed and shown on the volunteer's digital ID).{data ? " " + data.pool + " volunteers in rotation." : ""}</p>
      {err ? <ErrorState code={err} onRetry={() => load(date)}/> :
        !data ? <div className="dash-spinner"/> :
        (data.duties || []).length === 0 ? <EmptyState title="No centres in rotation yet" message="Enrol summer students to a centre, and register volunteers, to start the daily rotation."/> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Centre</th><th>On duty</th><th>Source</th><th>Status</th><th>Override</th><th></th></tr></thead>
          <tbody>
            {data.duties.map(d => (
              <tr key={d.centre}>
                <td className="admin-cell-name">{d.centre}</td>
                <td>{d.volunteer ? d.volunteer.fullName : "—"}</td>
                <td><span className="chip" style={{ fontSize: 10 }}>{d.source}</span></td>
                <td>{d.completedAt ? <span className="chip chip-lime" style={{ fontSize: 10 }}>closed · {d.takenCount} present</span> : <span className="mono" style={{ color: "var(--ink-400)", fontSize: 12 }}>open</span>}</td>
                <td>
                  <select className="admin-select" value={d.volunteerId} disabled={busy === d.centre} onChange={e => setTaker(d.centre, e.target.value)} aria-label={"Attendance taker for " + d.centre}>
                    {vols.map(v => <option key={v.volunteerId} value={v.volunteerId}>{v.fullName} · {v.role}</option>)}
                  </select>
                </td>
                <td>{!d.completedAt && <button className="btn btn-ghost btn-sm" disabled={busy === d.centre} onClick={() => closeRoll(d.centre, d.volunteerId)}>Close roll</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      }
      <div className="admin-fields-h" style={{ marginTop: 22, fontWeight: 700 }}>Service leaderboard</div>
      <p className="admin-hint">Volunteers ranked by attendance-duty service points — recognise your most reliable stewards.</p>
      {board === null ? <div className="dash-spinner"/> :
        board.length === 0 ? <div className="admin-empty">No points logged yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th className="admin-num">#</th><th>Volunteer</th><th className="admin-num">Level</th><th className="admin-num">Streak</th><th className="admin-num">Points</th></tr></thead>
          <tbody>{board.map(v => (
            <tr key={v.volunteerId}><td className="mono admin-num">{v.rank}</td><td>{v.fullName} <span className="chip" style={{ fontSize: 10 }}>{v.role}</span></td><td className="admin-num">L{v.level} · {v.levelName}</td><td className="admin-num">{v.streak}d</td><td className="admin-num"><b>{fmtNum(v.points)}</b></td></tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

// ============================================================================
// Team engagement — volunteers / instructors / mentors (M&E · audit cap)
// ============================================================================

const ENG_BAND_STYLE = {
  engaged:  { background: "#e6f7ec", color: "#137a3a" },
  slipping: { background: "#fff4e0", color: "#9a5b00" },
  at_risk:  { background: "#fdecec", color: "#c0322b" },
};
const ENG_ROLE_LABEL = { volunteer: "Volunteer", instructor: "Instructor", mentor: "Mentor" };

function engActivity(r) {
  const s = r.stats || {};
  if (r.role === "volunteer")  return (s.dutyCompleted || 0) + "/" + (s.dutyAssigned || 0) + " rolls · " + (s.points || 0) + " pts";
  if (r.role === "instructor") return (s.sessions || 0) + "/" + (s.target || 0) + " classes · " + (s.learnersMarked || 0) + " marked";
  if (r.role === "mentor")     return (s.activeMentees || 0) + "/" + (s.menteeTarget || 0) + " mentees · " + (s.stars || 0) + " stars" + (s.linked ? "" : " (unlinked)");
  return "";
}

const ENG_LINE = { all: "#111827", volunteer: "#2b8a3e", instructor: "#1971c2", mentor: "#9c36b5" };

/* ── Community engagement ──
 *
 * The bands are on REPLY RATE, not on volume, because volume is the metric
 * that rises while a community dies: one enthusiastic child posting forty
 * times to silence scores beautifully on posts, reactions and members alike.
 * A channel where nobody answers is a noticeboard, and that is what the word
 * says. */
const CENG_BAND_STYLE = {
  healthy:     { background: "#e6f7ec", color: "#137a3a" },
  quiet:       { background: "#fff4e0", color: "#9a5b00" },
  noticeboard: { background: "#fdecec", color: "#c0322b" },
};
const CENG_BAND_LABEL = { healthy: "Healthy", quiet: "Quiet", noticeboard: "Noticeboard" };
/* Named rungs rather than a score. A reader is not a failure — most healthy
   communities are mostly readers — so the ladder describes what somebody did,
   and only `silent` is phrased as something to act on. */
const CENG_RUNG = {
  /* `label` counts them ("6 started conversations"); `was` describes one
     person in the past ("was posting"). One string cannot do both — "was
     started conversations" is what you get if you try. */
  poster:  { label: "Started conversations", was: "posting",   tone: "#137a3a" },
  replier: { label: "Replied to others",     was: "replying",  tone: "#1971c2" },
  reactor: { label: "Reacted or voted",      was: "reacting",  tone: "#7048e8" },
  reader:  { label: "Read, said nothing",    was: "reading",   tone: "#5f6874" },
  silent:  { label: "Gone quiet",            was: "quiet",     tone: "#c0322b" },
};

/** A stat with its own sentence under it. A number with no unit and no
 *  denominator is the thing people misread on a dashboard. */
/* Portal time: how long members actually use the portals (engagement.php
   admin_engagement_portal). Counted only while a page is open, visible and
   touched in the last two minutes; a tab left open overnight counts nothing. */
const PT_PORTAL_LABEL = { member: "Member portal", mentor: "Mentor portal", instructor: "Instructor portal", community: "Community", family: "Family", club: "Club", site: "Website", other: "Other" };
function ptMins(n) { n = Number(n) || 0; return n >= 90 ? (Math.round(n / 6) / 10) + "h" : n + "m"; }
function PortalTimePanel() {
  const [days, setDays] = React.useState(30);
  const [centre, setCentre] = React.useState("");
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");
  const load = () => { setErr(""); setData(null); return NGGApi.admin.engagementPortal({ days, centre }).then(setData).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [days, centre]);
  const t = (data && data.totals) || {};
  const daily = (data && data.daily) || [];
  const peak = Math.max(1, ...daily.map(d => d.minutes));
  const hours = (data && data.byHour) || [];
  const hPeak = Math.max(1, ...hours);
  const centres = (data && data.byCentre) || [];
  const rows = ((data && data.rows) || []).filter(r => !q || (r.name + " " + r.memberId + " " + r.centre).toLowerCase().indexOf(q.toLowerCase()) >= 0);
  const exportCsv = () => {
    const csv = [["Member ID", "Name", "Centre", "Minutes", "Days active", "Minutes per active day", "Most used", "Last seen"]]
      .concat(rows.map(r => [r.memberId, r.name, r.centre, r.minutes, r.daysActive, r.avgPerDay, PT_PORTAL_LABEL[r.topPortal] || r.topPortal, r.lastAt]))
      .map(row => row.map(nggCsvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "portal-time-" + days + "d.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  return (
    <React.Fragment>
      <div className="pt-bar">
        <select className="admin-select" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Window">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
        <select className="admin-select" value={centre} onChange={e => setCentre(e.target.value)} aria-label="Centre">
          <option value="">All centres</option>
          {centres.filter(c => c.centre !== "No centre").map(c => <option key={c.centre} value={c.centre}>{c.centre}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </div>
      <p className="admin-hint">NGG members only. Time counts while a portal is open, on screen and in use (touched in the last two minutes), so a tab left open adds nothing. Counting started with this release.</p>
      {err ? <ErrorState code={err} onRetry={load}/> :
       !data ? <div className="dash-spinner"/> :
       <React.Fragment>
         <div className="pt-stats" aria-live="polite">
           <CengStat label="Used the portal" value={fmtNum(t.active)} sub={t.reach + "% of " + fmtNum(t.members) + " members"} warn={t.members > 0 && t.reach < 40}/>
           <CengStat label="Total time" value={ptMins(t.minutes)} sub={"in the last " + days + " days"}/>
           <CengStat label="Per active member" value={ptMins(t.avgMinutes)} sub={"median " + ptMins(t.medianMinutes)}/>
           <CengStat label="Days active" value={t.avgDaysActive} sub="average, of those who came"/>
           <CengStat label="Not seen" value={fmtNum(t.quiet)} sub="no time recorded in the window" warn={t.quiet > 0}/>
         </div>
         <h3 className="admin-h3">Minutes per day</h3>
         <div className="pt-chart" role="img" aria-label={"Minutes on the portal per day, last " + days + " days; busiest day " + peak + " minutes"}>
           {daily.map(d => <span key={d.day} className="pt-col" style={{ height: Math.max(2, Math.round(100 * d.minutes / peak)) + "%" }} title={d.day + ": " + d.minutes + " min, " + d.members + " members"}/>)}
         </div>
         <div className="pt-two">
           <div>
             <h3 className="admin-h3">Where the time goes</h3>
             {(data.byPortal || []).length === 0 ? <p className="admin-hint">No time recorded yet.</p> :
               <table className="admin-table"><thead><tr><th scope="col">Portal</th><th scope="col">Time</th><th scope="col">Members</th></tr></thead>
                 <tbody>{data.byPortal.map(b => <tr key={b.portal}><td>{PT_PORTAL_LABEL[b.portal] || b.portal}</td><td className="mono">{ptMins(b.minutes)}</td><td className="mono">{b.members}</td></tr>)}</tbody></table>}
           </div>
           <div>
             <h3 className="admin-h3">Time of day</h3>
             <div className="pt-hours" role="img" aria-label="Minutes by hour of the day">
               {hours.map((m, h) => <span key={h} className="pt-col" style={{ height: Math.max(2, Math.round(100 * m / hPeak)) + "%" }} title={h + ":00 — " + m + " min"}/>)}
             </div>
             <div className="pt-hours-axis mono"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
           </div>
         </div>
         <h3 className="admin-h3">By centre</h3>
         <table className="admin-table"><thead><tr><th scope="col">Centre</th><th scope="col">Members</th><th scope="col">Used it</th><th scope="col">Reach</th><th scope="col">Time</th></tr></thead>
           <tbody>{centres.map(c => <tr key={c.centre}><td>{c.centre}</td><td className="mono">{c.members}</td><td className="mono">{c.active}</td><td className="mono">{c.reach}%</td><td className="mono">{ptMins(c.minutes)}</td></tr>)}</tbody></table>
         <h3 className="admin-h3">Members</h3>
         <form role="search" className="pt-bar" onSubmit={e => e.preventDefault()}>
           <input className="admin-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, ID or centre" aria-label="Search members"/>
           <span role="status" className="admin-hint">{rows.length} shown</span>
         </form>
         {rows.length === 0 ? <EmptyState title="No members match" message="Change the search or the centre."/> :
           <div className="admin-table-wrap"><table className="admin-table">
             <thead><tr><th scope="col">Member</th><th scope="col">Centre</th><th scope="col">Time</th><th scope="col">Days</th><th scope="col">Per day</th><th scope="col">Most used</th><th scope="col">Last seen</th></tr></thead>
             <tbody>{rows.slice(0, 300).map(r => (
               <tr key={r.memberId}><td>{r.name}<div className="mono admin-hint">{r.memberId}</div></td><td>{r.centre || "—"}</td>
                 <td className="mono">{r.minutes ? ptMins(r.minutes) : "—"}</td><td className="mono">{r.daysActive || "—"}</td>
                 <td className="mono">{r.avgPerDay ? ptMins(r.avgPerDay) : "—"}</td><td>{PT_PORTAL_LABEL[r.topPortal] || "—"}</td>
                 <td className="mono">{r.lastAt ? r.lastAt.slice(0, 16).replace("T", " ") : "never"}</td></tr>))}</tbody>
           </table></div>}
         {rows.length > 300 && <p className="admin-hint">Showing the first 300. Export the CSV for everyone.</p>}
       </React.Fragment>}
    </React.Fragment>
  );
}

function CengStat({ label, value, sub, warn }) {
  return (
    <div style={{ border: "1px solid var(--line,#e7e9ee)", borderRadius: 12, padding: "12px 14px" }}>
      <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em",
                                     color: "var(--ink-400,#5f6874)" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                    color: warn ? "#c0322b" : "inherit" }}>{value}</div>
      <div style={{ fontSize: ".82rem", color: "var(--ink-400,#5f6874)" }}>{sub}</div>
    </div>
  );
}

function CommunityEngagementPanel() {
  const [days, setDays] = React.useState(30);
  const [channel, setChannel] = React.useState("");
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(() => {
    setErr(""); setData(null);
    return NGGApi.admin.communityEngagement({ days, channel })
      .then(setData).catch(e => setErr(e.code || e.message || "load_failed"));
  }, [days, channel]);
  React.useEffect(() => { load(); }, [load]);

  const h = (data && data.headline) || {};
  const chans = (data && data.channels) || [];
  const unanswered = (data && data.unanswered) || [];
  const quiet = (data && data.quiet) || [];
  const ladder = (data && data.ladder) || {};

  return (
    <React.Fragment>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 6px" }}>
        <select className="admin-select" value={days} onChange={e => setDays(Number(e.target.value))}
                aria-label="Window" style={{ maxWidth: 150 }}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select className="admin-select" value={channel} onChange={e => setChannel(e.target.value)}
                aria-label="Channel" style={{ maxWidth: 200 }}>
          <option value="">Every channel</option>
          {chans.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <p className="admin-hint">
        Not post counts — those rise while a community dies. The reply rate is the
        headline because it is the only number here one determined person cannot
        produce alone. Posts under 24 hours old are left out: this morning's post
        has not been ignored.
      </p>

      {err ? <ErrorState code={err} onRetry={load}/> :
       !data ? <div className="dash-spinner"/> :
       <React.Fragment>
         <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
                       gap: 12, margin: "6px 0 18px" }}>
           <CengStat label="Posts answered" value={h.replyRate + "%"}
                     warn={h.band === "noticeboard"}
                     sub={(h.postsJudged - h.unanswered) + " of " + h.postsJudged + " · "
                          + (CENG_BAND_LABEL[h.band] || h.band)}/>
           <CengStat label="Voices" value={fmtNum(h.contributors)}
                     sub={h.contributorRate + "% of the " + fmtNum(h.audience) + " who have ever taken part"}/>
           <CengStat label="Came back" value={h.returnRate + "%"}
                     warn={h.returnedOf > 0 && h.returnRate < 40}
                     sub={h.returnedOf
                       ? "of the " + fmtNum(h.returnedOf) + " active last period · " + fmtNum(h.newcomers) + " new"
                       : "nobody was active last period"}/>
           <CengStat label="First reply" value={h.medianFirstReplyHours == null ? "—" : h.medianFirstReplyHours + "h"}
                     sub={h.medianFirstReplyHours == null ? "nothing was answered" : "median wait for an answer"}/>
           <CengStat label="Opened it" value={fmtNum(h.reach)}
                     sub={h.reachRate + "% of the audience read something"}/>
           <CengStat label="Never turned up" value={fmtNum(h.neverJoinedIn)}
                     sub={"of " + fmtNum(h.roster) + " active members, have never opened it"}/>
         </div>

         {/* The ladder. Reading is not a failure and is not drawn as one. */}
         <h3 className="admin-h3" style={{ margin: "0 0 6px" }}>Who took part</h3>
         <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 18px" }}>
           {["poster", "replier", "reactor", "reader", "silent"].map(k => (
             <span key={k} className="chip" style={{ fontWeight: 700 }}>
               <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8,
                                                 background: CENG_RUNG[k].tone, marginRight: 6 }}/>
               {fmtNum(ladder[k] || 0)} {CENG_RUNG[k].label.toLowerCase()}
             </span>
           ))}
         </div>

         {/* Per channel, worst first — "the community is quiet" is not an
             answer, and this is what turns it into one. */}
         {chans.length > 0 && (
           <React.Fragment>
             <h3 className="admin-h3" style={{ margin: "0 0 6px" }}>By channel, worst first</h3>
             <div className="admin-table-wrap" style={{ margin: "0 0 18px" }}>
               <table className="admin-table">
                 <thead><tr>
                   <th scope="col">Channel</th>
                   <th scope="col" className="admin-num">Answered</th>
                   <th scope="col" className="admin-num">Posts</th>
                   <th scope="col" className="admin-num">Voices</th>
                   <th scope="col" className="admin-num">First reply</th>
                 </tr></thead>
                 <tbody>
                   {chans.map(c => (
                     <tr key={c.slug}>
                       <td>{c.name}{" "}
                         <span className="chip" style={Object.assign({ fontWeight: 800, fontSize: 11 },
                                                                     CENG_BAND_STYLE[c.band] || {})}>
                           {CENG_BAND_LABEL[c.band] || c.band}
                         </span>
                       </td>
                       <td className="mono admin-num">{c.answered}/{c.judged} ({c.replyRate}%)</td>
                       <td className="mono admin-num">{fmtNum(c.posts)}</td>
                       <td className="mono admin-num">{fmtNum(c.voices)}</td>
                       <td className="mono admin-num">{c.medianFirstReplyHours == null ? "—" : c.medianFirstReplyHours + "h"}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </React.Fragment>
         )}

         {/* The two lists somebody can act on this afternoon. Everything above
             is context for these. */}
         <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18 }}>
           <div>
             <h3 className="admin-h3" style={{ margin: "0 0 6px" }}>
               Waiting for an answer{data.unansweredTotal > unanswered.length
                 ? " (" + unanswered.length + " of " + fmtNum(data.unansweredTotal) + ")" : ""}
             </h3>
             {unanswered.length === 0
               ? <EmptyState title="Everything has been answered" message="Every post old enough to judge has at least one reply."/>
               : <ul className="admin-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                   {unanswered.map(p => (
                     <li key={p.postId} style={{ padding: "8px 0", borderBottom: "1px solid var(--line,#e7e9ee)" }}>
                       <div style={{ fontSize: ".9rem" }}>{p.excerpt || "(no text)"}</div>
                       <div className="mono" style={{ fontSize: 12, color: "var(--ink-400,#5f6874)" }}>
                         {p.authorName || p.authorId}{p.centre ? " · " + p.centre : ""} · {fmtDate(p.createdAt)}
                       </div>
                     </li>
                   ))}
                 </ul>}
           </div>
           <div>
             <h3 className="admin-h3" style={{ margin: "0 0 6px" }}>
               Gone quiet{data.quietTotal > quiet.length
                 ? " (" + quiet.length + " of " + fmtNum(data.quietTotal) + ")" : ""}
             </h3>
             <p className="admin-hint" style={{ margin: "0 0 6px" }}>
               Took part last period and has done nothing since — not even opened it.
               Somebody who has dropped from posting to reading is still here, and is not listed.
             </p>
             {quiet.length === 0
               ? <EmptyState title="Nobody has dropped off" message="Everybody who took part last period is still here."/>
               : <ul className="admin-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                   {quiet.map(q => (
                     <li key={q.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line,#e7e9ee)" }}>
                       <div style={{ fontSize: ".9rem" }}>{q.name}</div>
                       <div className="mono" style={{ fontSize: 12, color: "var(--ink-400,#5f6874)" }}>
                         {q.centre || "no centre"}{q.was && CENG_RUNG[q.was] ? " · was " + CENG_RUNG[q.was].was : ""}
                       </div>
                     </li>
                   ))}
                 </ul>}
           </div>
         </div>
       </React.Fragment>}
    </React.Fragment>
  );
}

// Compact inline-SVG line chart of weekly average engagement (overall + per role).
function EngTrendChart({ series }) {
  if (!series || !series.length) return <div className="admin-empty">No snapshots yet — the weekly job hasn't run.</div>;
  const W = 720, H = 180, padL = 30, padR = 12, padT = 12, padB = 24, n = series.length;
  const x = i => padL + (n === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (n - 1));
  const y = v => padT + (100 - v) * (H - padT - padB) / 100;
  const keys = ["all", "volunteer", "instructor", "mentor"];
  const path = k => { let d = "", on = false; series.forEach((s, i) => { const v = s[k]; if (v == null) { on = false; return; } d += (on ? " L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); on = true; }); return d; };
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", minWidth: 520, height: "auto" }} role="img" aria-label="Weekly engagement trend">
        {[0, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke={g === 75 ? "#137a3a55" : g === 50 ? "#9a5b0055" : "#e7e9ee"} strokeDasharray={(g === 50 || g === 75) ? "4 4" : ""}/>
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="10" fill="var(--ink-400,#5f6874)">{g}</text>
          </g>
        ))}
        {keys.map(k => <path key={k} d={path(k)} fill="none" stroke={ENG_LINE[k]} strokeWidth={k === "all" ? 2.5 : 1.5} opacity={k === "all" ? 1 : 0.85}/>)}
        {series.map((s, i) => <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--ink-400,#5f6874)">{String(s.weekStart).slice(5)}</text>)}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: ".8rem", marginTop: 2 }}>
        {keys.map(k => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 3, background: ENG_LINE[k], display: "inline-block", borderRadius: 2 }}/>{k === "all" ? "Overall" : ENG_ROLE_LABEL[k]}</span>)}
      </div>
    </div>
  );
}

function EngagementPanel() {
  const DT = (typeof window !== "undefined") ? window.DataTable : null;
  const [tab, setTab] = React.useState("now");
  const [role, setRole] = React.useState("");
  // Now tab
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  // Trends tab
  const [weeks, setWeeks] = React.useState(12);
  const [centre, setCentre] = React.useState("");
  const [trends, setTrends] = React.useState(null);
  const [tErr, setTErr] = React.useState("");

  const load = () => { setErr(""); setData(null); return NGGApi.admin.engagement({ days, role }).then(setData).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { if (tab === "now") load(); /* eslint-disable-next-line */ }, [tab, days, role]);
  const loadTrends = () => { setTErr(""); setTrends(null); return NGGApi.admin.engagementTrends({ weeks, centre, role }).then(setTrends).catch(e => setTErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { if (tab === "trends") loadTrends(); /* eslint-disable-next-line */ }, [tab, weeks, centre, role]);

  const rows = (data && data.rows) || [];
  const summary = (data && data.summary) || {};
  const detail = (trends && trends.detail) || [];
  const centres = (trends && trends.centres) || [];

  const roleSelect = (
    <select className="admin-select" value={role} onChange={e => setRole(e.target.value)} aria-label="Role" style={{ maxWidth: 150 }}>
      <option value="">All roles</option><option value="volunteer">Volunteers</option>
      <option value="instructor">Instructors</option><option value="mentor">Mentors</option>
    </select>
  );

  const columns = React.useMemo(() => [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "role", header: "Role", cell: c => ENG_ROLE_LABEL[c.getValue()] || c.getValue() },
    { accessorKey: "engagement", header: "Engagement", cell: c => <span className="chip" style={Object.assign({ fontWeight: 800 }, ENG_BAND_STYLE[c.row.original.band] || {})}>{c.getValue()}%</span> },
    { id: "activity", header: "Activity", enableSorting: false, cell: c => <span className="mono" style={{ fontSize: 12 }}>{engActivity(c.row.original)}</span> },
    { accessorKey: "lastActive", header: "Last active", cell: c => c.getValue() || "—" },
  ], [data]);

  const tColumns = React.useMemo(() => [
    { accessorKey: "weekStart", header: "Week" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "role", header: "Role", cell: c => ENG_ROLE_LABEL[c.getValue()] || c.getValue() },
    { accessorKey: "centre", header: "Centre", cell: c => c.getValue() || "—" },
    { accessorKey: "engagement", header: "Engagement", cell: c => <span className="chip" style={Object.assign({ fontWeight: 800 }, ENG_BAND_STYLE[c.row.original.band] || {})}>{c.getValue()}%</span> },
  ], [trends]);

  const dl = (name, headArr, bodyArr) => {
    // nggCsvCell, not hand-rolled quoting: these rows carry names typed into
    // public forms, and a leading = makes the cell a formula when staff open it.
    const csv = [headArr].concat(bodyArr).map(row => row.map(nggCsvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const exportNow = () => dl("engagement-" + days + "d" + (role ? "-" + role : "") + ".csv",
    ["Name", "Role", "Engagement", "Band", "LastActive", "Activity"],
    rows.map(r => [r.name, ENG_ROLE_LABEL[r.role] || r.role, r.engagement, r.band, r.lastActive, engActivity(r).replace(/·/g, "-")]));
  const exportTrends = () => dl("engagement-trends" + (centre ? "-" + centre : "") + (role ? "-" + role : "") + ".csv",
    ["Week", "Name", "Role", "Centre", "Engagement", "Band"],
    detail.map(r => [r.weekStart, r.name, ENG_ROLE_LABEL[r.role] || r.role, r.centre, r.engagement, r.band]));

  const tabBtn = (id, label) => <button className={"btn btn-sm" + (tab === id ? "" : " btn-ghost")} onClick={() => setTab(id)}>{label}</button>;

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Engagement</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {tabBtn("now", "Team")}{tabBtn("portal", "Portal time")}{tabBtn("trends", "Trends")}{tabBtn("community", "Community")}
        </div>
      </div>

      {tab === "community" ? <CommunityEngagementPanel/> :
       tab === "portal" ? <PortalTimePanel/> :
       tab === "now" ?
        <React.Fragment>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 6px" }}>
            {roleSelect}
            <select className="admin-select" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Window" style={{ maxWidth: 150 }}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportNow} disabled={!rows.length}>Export CSV</button>
          </div>
          <p className="admin-hint">Rolling {days}-day engagement — duty completion, class delivery, mentee coverage and recency, most-at-risk first. 🟢 ≥75 · 🟡 50–74 · 🔴 &lt;50.</p>
          {err ? <ErrorState code={err} onRetry={load}/> :
            !data ? <div className="dash-spinner"/> :
            <React.Fragment>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "6px 0 18px" }}>
                {["volunteer", "instructor", "mentor"].map(r => {
                  const st = summary[r] || { count: 0, avg: 0, atRisk: 0 };
                  return (
                    <div key={r} style={{ border: "1px solid var(--line,#e7e9ee)", borderRadius: 12, padding: "12px 14px" }}>
                      <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-400,#5f6874)" }}>{ENG_ROLE_LABEL[r]}s</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{st.avg}%<span style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--ink-400,#5f6874)" }}> avg</span></div>
                      <div style={{ fontSize: ".82rem", color: "var(--ink-400,#5f6874)" }}>{st.count} tracked · {st.atRisk} at-risk</div>
                    </div>
                  );
                })}
              </div>
              {!DT ? <div className="admin-empty">Table component unavailable — reload the page.</div> :
                rows.length === 0 ? <EmptyState title="No engagement data yet" message="Once volunteers take attendance duty, instructors log classes and mentors award stars, their engagement appears here."/> :
                <DT columns={columns} data={rows} searchable dense pageSize={25} searchPlaceholder="Search people…"/>}
            </React.Fragment>}
        </React.Fragment>
      :
        <React.Fragment>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 6px" }}>
            {roleSelect}
            <select className="admin-select" value={centre} onChange={e => setCentre(e.target.value)} aria-label="Centre" style={{ maxWidth: 170 }}>
              <option value="">All centres</option>
              {centres.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="admin-select" value={weeks} onChange={e => setWeeks(Number(e.target.value))} aria-label="Weeks" style={{ maxWidth: 150 }}>
              <option value={6}>Last 6 weeks</option><option value={12}>Last 12 weeks</option><option value={26}>Last 26 weeks</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportTrends} disabled={!detail.length}>Export CSV</button>
          </div>
          <p className="admin-hint">Weekly engagement snapshots — one row per member per centre, captured every week. Trend lines are headcount-weighted averages; the table below is the detail per member per centre.</p>
          {tErr ? <ErrorState code={tErr} onRetry={loadTrends}/> :
            !trends ? <div className="dash-spinner"/> :
            <React.Fragment>
              <div style={{ border: "1px solid var(--line,#e7e9ee)", borderRadius: 12, padding: "12px 14px", margin: "6px 0 16px" }}>
                <EngTrendChart series={trends.series || []}/>
              </div>
              {!DT ? <div className="admin-empty">Table component unavailable — reload the page.</div> :
                detail.length === 0 ? <EmptyState title="No snapshots yet" message="The weekly job captures a row per member each week. Once it has run (or you run api/tools/engagement-snapshot.php), the per-member, per-centre history appears here."/> :
                <DT columns={tColumns} data={detail} searchable dense pageSize={25} searchPlaceholder="Search snapshots…"/>}
            </React.Fragment>}
        </React.Fragment>
      }
    </div>
  );
}

// ============================================================================
// Members
// ============================================================================

/* ── The member dashboard ──────────────────────────────────────────────────
 *
 * There was no such thing. "Analytics" is a SUMMER ATTENDANCE board, and
 * Members was a filterable table with a pager. Between them nobody could
 * answer how many members there are, where they are, how fast the roll is
 * growing, or what is wrong with the records.
 *
 * Every figure comes from admin.members.overview, scoped exactly as the
 * roster is scoped, so a centre coordinator's dashboard and their roster
 * cannot disagree.
 */

// Monthly joins. One series, so no legend — the heading names it. Bars
// rather than a line because twelve monthly counts are discrete events,
// not a continuous quantity sampled over time.
function MemberJoinsChart({ series }) {
  if (!series || !series.length) return <div className="admin-empty">No joins recorded yet.</div>;
  const W = 720, H = 170, padL = 34, padR = 10, padT = 14, padB = 26;
  const n = series.length;
  const max = Math.max(1, ...series.map(s => s.joined));
  const band = (W - padL - padR) / n;
  const bw = Math.max(6, band - 6);                 // 6px of surface between bars
  const y = v => padT + (1 - v / max) * (H - padT - padB);
  const base = H - padB;
  // Ticks a person reads, not an arbitrary 5 divisions.
  const step = max <= 4 ? 1 : max <= 20 ? 5 : Math.ceil(max / 4 / 10) * 10;
  const ticks = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const peak = series.reduce((a, b) => (b.joined > a.joined ? b : a), series[0]);

  return (
    /* No minWidth, unlike the engagement line chart beside it. That one
       needs the room for four overlapping series; twelve bars scale down
       to a phone perfectly well, and a horizontally-scrolled chart with no
       affordance just reads as cut off. */
    <div>
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto" }}
           role="img" aria-label={"Members joined per month over " + n + " months"}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line-200,#e7e9ee)"/>
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-400,#5f6874)">{v}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const h = Math.max(s.joined > 0 ? 2 : 0, base - y(s.joined));
          const x = padL + i * band + (band - bw) / 2;
          return (
            <g key={s.month}>
              {/* Hit target spans the whole band so a 2px bar is still hoverable. */}
              <rect x={padL + i * band} y={padT} width={band} height={base - padT} fill="transparent">
                <title>{s.month} — {s.joined} {s.joined === 1 ? "member" : "members"}</title>
              </rect>
              <rect x={x} y={base - h} width={bw} height={h} rx="4" ry="4"
                    fill={s === peak ? "#111827" : "#9aa3b2"} pointerEvents="none"/>
            </g>
          );
        })}
        {/* Direct-label the peak only — a number on every bar is noise. */}
        {peak.joined > 0 && (
          <text x={padL + series.indexOf(peak) * band + band / 2} y={y(peak.joined) - 5}
                textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink-600,#3c434f)">{peak.joined}</text>
        )}
        {series.map((s, i) => (
          <text key={s.month} x={padL + i * band + band / 2} y={H - 8} textAnchor="middle"
                fontSize="9" fill="var(--ink-400,#5f6874)">{s.month.slice(5)}</text>
        ))}
      </svg>
    </div>
  );
}

function MemberBar({ label, value, max, sub }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0;
  return (
    <div className="mem-bar-row">
      <div className="mem-bar-label">{label}{sub ? <span className="mem-bar-sub"> {sub}</span> : null}</div>
      <div className="mem-bar-track"><div className="mem-bar-fill" style={{ width: Math.max(pct, value > 0 ? 2 : 0) + "%" }}/></div>
      <div className="mono mem-bar-n">{fmtNum(value)}</div>
    </div>
  );
}

function MembersDashboard({ onFilter }) {
  const [o, setO] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.membersOverview().then(r => setO(r.overview)).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (err) return <ErrorState code={err} onRetry={load}/>;
  if (!o) return <div className="dash-spinner"/>;
  if (o.empty) return <div className="admin-empty">Your account is scoped to centres that no longer exist, so there is nothing to show. Ask a super admin to set your centres.</div>;

  const h = o.headline;
  const q = o.quality || {};
  const maxCentre = Math.max(1, ...(o.byCentre || []).map(c => c.total));
  const fmtN = (v) => fmtNum(v || 0);
  // Only the problems that exist. A panel of zeroes trains people to skip it.
  const issues = [
    { k: "duplicate_groups",  n: q.duplicate_groups,  label: "possible duplicate records", hint: "The same person entered twice. Sign-in resolves an email to one member, so a shared address locks one of them out." },
    { k: "minor_no_guardian", n: q.minor_no_guardian, label: "children with no guardian contact", hint: "No parent phone or email on a member under 18." },
    { k: "no_email",          n: q.no_email,          label: "members with no email", hint: "They cannot sign in or be sent anything." },
    { k: "no_centre",         n: q.no_centre,         label: "members in no centre", hint: "Invisible to every centre-scoped coordinator." },
    { k: "unknown_centre",    n: q.unknown_centre,    label: "members in a centre that no longer exists", hint: "Usually a renamed or closed centre. They still appear, filtered by a name nothing matches." },
    { k: "no_phone",          n: q.no_phone,          label: "members with no phone" },
    { k: "no_dob",            n: q.no_dob,            label: "members with no date of birth", hint: "Age-based safeguarding checks skip them." },
  ].filter(x => (x.n || 0) > 0);

  return (
    <div className="mem-dash">
      <div className="admin-tiles">
        <AdminTile n={fmtN(h.total)} l="Members"/>
        <AdminTile n={fmtN(h.active)} l="Active" onClick={() => onFilter({ status: "active" })}/>
        <AdminTile n={fmtN(h.inactive)} l="Not active"/>
        <AdminTile n={"+" + fmtN(h.new30)} l="Joined · 30 days"/>
        <AdminTile n={"+" + fmtN(h.new365)} l="Joined · 12 months"/>
        {/* Active on paper, nothing recorded for 60 days. The number that
            says whether a membership is real. */}
        <AdminTile n={fmtN(h.dormant)} l="Active but dormant"/>
      </div>

      {/* Conduct and progression. Each count is the roster segment it opens,
          read on the server from the same SQL, so a tile cannot promise a
          list that says something else. */}
      {o.conduct && (
        <>
          <h3 className="admin-h3 mem-dash-sub">Conduct &amp; progression</h3>
          <div className="admin-tiles">
            <AdminTile n={fmtN(o.conduct.fined)} l="Fined" onClick={() => onFilter({ segment: "fined" })}/>
            <AdminTile n={fmtN(o.conduct.finesOwedBy)} l={"Owing · " + fmtMoney(o.conduct.finesOwed)}
                       onClick={() => onFilter({ segment: "fines_owed" })}/>
            <AdminTile n={fmtN(o.conduct.suspended)} l="Suspended now" onClick={() => onFilter({ segment: "suspended" })}/>
            <AdminTile n={fmtN(o.conduct.evicted)} l="Evicted" onClick={() => onFilter({ segment: "evicted" })}/>
            <AdminTile n={fmtN(o.conduct.awaitingReview)} l="Sanction to decide"
                       onClick={() => onFilter({ segment: "conduct_review" })}/>
            <AdminTile n={fmtN(o.conduct.promoted)} l="Promoted to NGV"
                       onClick={() => onFilter({ segment: "promoted_ngv" })}/>
          </div>
          <p className="mem-consent">
            Fines imposed to date: <strong>{fmtMoney(o.conduct.finesImposed)}</strong>, of which
            {" "}<strong>{fmtMoney(o.conduct.finesOwed)}</strong> is still owed. Proposed, waived and lifted
            fines are not counted.
            {" "}<strong>{fmtN(o.conduct.promoted365)}</strong> promoted to NGV in the last 12 months.
          </p>
        </>
      )}

      <div className="mem-dash-grid">
        <section className="admin-panel">
          <h3 className="admin-h3">Joining, month by month</h3>
          <MemberJoinsChart series={o.growth}/>
        </section>

        <section className="admin-panel">
          <h3 className="admin-h3">By centre</h3>
          {(o.byCentre || []).length
            ? o.byCentre.map(c => <MemberBar key={c.name} label={c.name} value={c.total} max={maxCentre} sub={"· " + c.active + " active"}/>)
            : <div className="admin-empty">No centres yet.</div>}
        </section>

        <section className="admin-panel">
          <h3 className="admin-h3">By status</h3>
          {Object.entries(o.byStatus || {}).map(([k, v]) =>
            <MemberBar key={k} label={memberStatusLabel(k)} value={v} max={Math.max(1, h.total)}/>)}
          <h3 className="admin-h3" style={{ marginTop: 18 }}>By type</h3>
          {Object.entries(o.byType || {}).map(([k, v]) =>
            <MemberBar key={k} label={k} value={v} max={Math.max(1, h.total)}/>)}
        </section>

        <section className="admin-panel">
          <h3 className="admin-h3">Records needing attention</h3>
          {issues.length === 0
            ? <div className="admin-empty">Nothing outstanding — every record has a name, a way to reach someone, and a centre.</div>
            : <ul className="mem-issues">
                {issues.map(x => (
                  <li key={x.k} className="mem-issue">
                    <span className="mono mem-issue-n">{fmtN(x.n)}</span>
                    <span className="mem-issue-text">
                      {x.label}
                      {x.hint ? <span className="mem-issue-hint">{x.hint}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>}
          {o.consent && o.consent.participants > 0 && (
            <div className="mem-consent">
              <strong>{fmtN(o.consent.unrecorded)}</strong> of {fmtN(o.consent.participants)} participants have no
              publication consent recorded. They are not named publicly until one is.
            </div>
          )}
        </section>

        {o.dues && (
          <section className="admin-panel">
            <h3 className="admin-h3">Dues</h3>
            <MemberBar label="People with a balance" value={o.dues.people} max={Math.max(1, h.total)}/>
            <div className="mem-consent">Outstanding: <strong>{fmtMoney(o.dues.outstanding)}</strong></div>
          </section>
        )}

        {Object.keys(o.staff || {}).length > 0 && (
          <section className="admin-panel">
            <h3 className="admin-h3">Staff</h3>
            {/* ROLE_OPTS labels carry a parenthetical for the editor's
                select ("Super admin (full access)") that truncates to
                nothing useful in a 9rem bar label. */}
            {Object.entries(o.staff).map(([k, v]) =>
              <MemberBar key={k} label={adminRoleLabel(k)}
                         value={v} max={Math.max(1, ...Object.values(o.staff))}/>)}
          </section>
        )}
      </div>

      {o.scoped && <p className="mem-scope-note">These figures cover only the centres you administer.</p>}
    </div>
  );
}

/* Shown, never merged. Two records with one email is refused on save; two
 * with a shared phone is a judgement somebody has to make, and merging
 * automatically would eventually join two real siblings. */
function MembersDuplicates({ onOpen, onMerge }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.membersDuplicates().then(r => setD(r.groups || [])).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (err) return <ErrorState code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;
  if (!d.length) return <div className="admin-empty">No two records look like the same person.</div>;

  return (
    <div className="mem-dupes">
      <p className="mem-scope-note">
        These are shown, not merged. Joining two records automatically would eventually
        join two real people — siblings sharing a parent's phone, or a common name.
      </p>
      {d.map((g, i) => (
        <section className="admin-panel" key={g.on + ":" + g.value + ":" + i}>
          <div className="mem-dupe-head">
            <h3 className="admin-h3">{g.count} records share {g.why}{g.on !== "name" ? <span className="mono"> · {g.value}</span> : null}</h3>
            {/* Only offered for a pair. Three records sharing a parent's
                phone are usually three siblings, and a "merge these" button
                over them is an invitation to destroy a family. */}
            {g.members.length === 2 && onMerge && (
              <button className="btn btn-ghost btn-sm"
                      onClick={() => onMerge(g.members[0].memberId, g.members[1].memberId)}>
                Same person?
              </button>
            )}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Member</th><th>Centre</th><th>Status</th><th>Added</th></tr></thead>
              <tbody>
                {g.members.map(m => (
                  <tr key={m.memberId} className="admin-row-click" onClick={() => onOpen(m.memberId)}>
                    <td>
                      <div className="admin-cell-name">{m.fullName}</div>
                      <div className="mono admin-cell-sub">{m.memberId}{m.email ? " · " + m.email : ""}{m.phone ? " · " + m.phone : ""}</div>
                    </td>
                    <td>{m.centre || "—"}</td>
                    <td><span className={"chip status-" + m.status}>{memberStatusLabel(m.status)}</span></td>
                    <td className="mono">{String(m.createdAt || "").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}


/* Printed IDs that do not mean one person. Two kinds, both from the server
 * (admin_members_id_duplicates): one number on two records — the database
 * claimed it for the earliest, and the other is the one to resolve — and one
 * person, by name and birthday, holding two numbers. A pair is offered the
 * ordinary merge; anything else is opened and decided record by record. */
function MembersIdDuplicates({ onOpen, onMerge }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.membersIdDuplicates().then(r => setD({ shared: r.shared || [], twoIds: r.twoIds || [] })).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (err) return <ErrorState code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;
  if (!d.shared.length && !d.twoIds.length) return <div className="admin-empty mem-iddupes-clear">Every printed member ID belongs to one record, and nobody holds two.</div>;

  const table = (members, claimedBy) => (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th scope="col">Member</th><th scope="col">Member ID</th><th scope="col">Born</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {members.map(m => (
            <tr key={m.memberId} className="admin-row-click" onClick={() => onOpen(m.memberId)}>
              <td>
                <div className="admin-cell-name">{m.fullName}</div>
                <div className="mono admin-cell-sub">{m.memberId}{m.centre ? " · " + m.centre : ""}</div>
              </td>
              <td className="mono">{m.displayId || "—"}{claimedBy === m.memberId ? " · holds it" : ""}</td>
              <td className="mono">{m.dob || "—"}</td>
              <td><span className={"chip status-" + m.status}>{memberStatusLabel(m.status)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mem-iddupes" aria-live="polite">
      {d.shared.map(g => (
        <section className="admin-panel" key={"s:" + g.displayId}>
          <div className="mem-dupe-head">
            <h3 className="admin-h3">{g.members.length} records carry member ID <span className="mono">{g.displayId}</span></h3>
            {g.members.length === 2 && onMerge && (
              <button className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const keep = g.members.find(m => m.memberId === g.claimedBy) || g.members[0];
                        const other = g.members.find(m => m.memberId !== keep.memberId);
                        onMerge(keep.memberId, other.memberId);
                      }}>
                {g.samePerson ? "Merge — same person" : "Same person?"}
              </button>
            )}
          </div>
          <p className="mem-scope-note">
            {g.samePerson
              ? "The same child entered twice. Merge them and the record that holds the ID keeps it."
              : "Two different children given one number. The card in the hand of the one who does not hold it reads as the other child — give them a new ID from their record."}
          </p>
          {table(g.members.map(m => ({ ...m, displayId: g.displayId })), g.claimedBy)}
        </section>
      ))}
      {d.twoIds.map((g, i) => (
        <section className="admin-panel" key={"t:" + i}>
          <div className="mem-dupe-head">
            <h3 className="admin-h3">One person, {g.members.length} member IDs — {g.members[0].fullName}</h3>
            {g.members.length === 2 && onMerge && (
              <button className="btn btn-ghost btn-sm" onClick={() => onMerge(g.members[0].memberId, g.members[1].memberId)}>Same person?</button>
            )}
          </div>
          <p className="mem-scope-note">
            {g.dobKnown ? "Same name and date of birth." : "Same name, and neither record has a date of birth — check before merging."}
            {" "}A merge keeps both cards working: the retired number resolves to the survivor.
          </p>
          {table(g.members, null)}
        </section>
      ))}
    </div>
  );
}

/* ── Data quality: a finding, and the records behind it ───────────────────
 *
 * The dashboard says "214 with no email". This is the list. They are one
 * screen because a count nobody can act on is a poster, and the only
 * reason the dashboard's figures were trustworthy enough to act on is
 * that the segment that filters the roster is defined beside the figure
 * that counts it. */
function MembersSegments({ onFilter }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.membersSegments().then(r => setRows(r.segments || [])).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (err) return <ErrorState code={err} onRetry={load}/>;
  if (!rows) return <div className="dash-spinner"/>;

  const outstanding = rows.filter(r => r.count > 0);

  return (
    <div>
      <p className="mem-scope-note">
        Each of these is a list, not a statistic. Open one and the roster shows exactly
        the records it counted.
      </p>
      {!outstanding.length && (
        <div className="admin-empty">Nothing is missing. Every record has the contact
          details, centre and consent the register expects.</div>
      )}
      <div className="mem-seg-grid">
        {rows.map(r => (
          <button key={r.key} className={"mem-seg" + (r.count ? "" : " is-clear")}
                  disabled={!r.count}
                  onClick={() => onFilter({ segment: r.key })}>
            <span className="mem-seg-n mono">{fmtNum(r.count)}</span>
            <span className="mem-seg-l">{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Merging two records for one person ───────────────────────────────────
 *
 * The preview is not a confirmation dialog with the word "sure" in it. It
 * is the actual list of what moves, what is discarded and what the
 * survivor would gain — because a merge cannot be undone and "are you
 * sure" is a question nobody can answer without that list. */
function AdminMemberMerge({ keepId, mergeId, onClose, onDone }) {
  const { panelRef, close } = useAdminDrawer(onClose, false);
  const [keep, setKeep] = React.useState(keepId);
  const [preview, setPreview] = React.useState(null);
  const [problem, setProblem] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const loser = keep === keepId ? mergeId : keepId;

  const look = React.useCallback(() => {
    setPreview(null); setProblem(null);
    return NGGApi.admin.membersMerge(keep, loser, false)
      .then(r => setPreview(r.preview || null))
      .catch(e => setProblem({ code: e.code || e.message, detail: e.detail, preview: (e.data || {}).preview }));
  }, [keep, loser]);

  React.useEffect(() => { look(); }, [look]);

  const go = async () => {
    setBusy(true);
    try {
      await NGGApi.admin.membersMerge(keep, loser, true);
      toast.ok("Merged. " + loser + " now points at " + keep + ".");
      onDone && onDone();
      close();
    } catch (e) {
      setProblem({ code: e.code || e.message, detail: e.detail });
    } finally { setBusy(false); }
  };

  const moves = preview ? Object.entries(preview.moves || {}) : [];
  const filled = preview ? Object.keys(preview.fieldsFilled || {}) : [];
  const dropped = preview ? Object.entries(preview.discarded || {}) : [];

  /* The console's drawer is a BACKDROP (.admin-drawer) wrapping a panel
     (.admin-drawer-panel). Built the other way round once, the heading and
     the buttons rendered on the grey scrim outside the white panel and the
     whole thing read as broken — caught by rendering it, not by reading
     it. */
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true"
         aria-label="Merge two member records"
         onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Merge two records</h3>
          <button type="button" className="admin-drawer-close" onClick={close} aria-label="Close">✕</button>
        </div>

        <div className="admin-fields">
          <p className="mem-scope-note">
            One of these survives and keeps its member ID. The other is retired, not
            deleted — its ID has been printed on cards and typed into spreadsheets, and
            somebody looking it up should find out where it went.
          </p>

          <div className="mem-merge-pick">
            {[keepId, mergeId].map(id => (
              <label key={id} className={"mem-merge-opt" + (keep === id ? " is-on" : "")}>
                <input type="radio" name="keep" checked={keep === id} onChange={() => setKeep(id)}/>
                <span className="mono">{id}</span>
                <span className="mem-merge-role">{keep === id ? "survives" : "is absorbed"}</span>
              </label>
            ))}
          </div>

          {problem && (
            <div className="mem-issue mem-issue-bad">
              <strong>{problem.code === "merge_blocked" ? "This merge is blocked." : "Refused."}</strong>
              <p>{problem.detail || problem.code}</p>
              {problem.preview && problem.preview.blocked && Object.entries(problem.preview.blocked).map(([t, b]) => (
                <p key={t} className="mono">{t}: {(b.examples || []).join(", ") || b.rows.length + " rows"}</p>
              ))}
            </div>
          )}

          {!preview && !problem && <div className="dash-spinner"/>}

          {preview && (
            <>
              <section className="admin-panel">
                <h4 className="admin-h4">What moves</h4>
                {moves.length ? (
                  <ul className="mem-merge-list">
                    {moves.map(([t, n]) => (
                      <li key={t}><span className="mono">{t}</span> — {n.move} row(s)
                        {n.collide ? <em> ({n.collide} already recorded on the survivor, so dropped)</em> : null}</li>
                    ))}
                  </ul>
                ) : <p className="admin-empty">Nothing is attached to the absorbed record.</p>}
              </section>

              <section className="admin-panel">
                <h4 className="admin-h4">What the survivor gains</h4>
                {filled.length
                  ? <p>Fills in: {filled.join(", ")}. Nothing already entered is overwritten.</p>
                  : <p className="admin-empty">Nothing — the surviving record already has every field.</p>}
                {preview.notesAppended && <p>Notes are appended, not replaced.</p>}
              </section>

              {dropped.length > 0 && (
                <section className="admin-panel">
                  <h4 className="admin-h4">What is discarded</h4>
                  <ul className="mem-merge-list">
                    {dropped.map(([t, n]) => <li key={t}><span className="mono">{t}</span> — {n} row(s)</li>)}
                  </ul>
                  <p className="mem-scope-note">Sign-in state and non-additive counters.
                     The figures are recorded in the audit entry, so nothing goes silently.</p>
                </section>
              )}
            </>
          )}
        </div>

        <div className="admin-drawer-foot">
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={!preview || busy} onClick={go}>
            {busy ? "Merging…" : "Merge — this cannot be undone"}
          </button>
        </div>
      </div>
    </div>
  );
}


/* The labels the roster uses when a segment is in force. Mirrors
   member_segments() on the server; the server is the authority and sends
   the list, but the roster has to name the one it is filtered by before
   that list has loaded. */
const SEGMENT_LABELS = {
  no_email: "members with no email address",
  no_phone: "members with no phone number",
  no_centre: "members not in any centre",
  unknown_centre: "members filed under a centre that no longer exists",
  no_dob: "members with no date of birth",
  minor_no_guardian: "members under 18 with no guardian contact",
  dormant: "active members with nothing recorded for 60 days",
  no_consent: "members with no publication consent recorded",
  fined: "members who have been fined",
  fines_owed: "members owing a fine",
  suspended: "members suspended now",
  evicted: "members evicted under the policy",
  conduct_review: "members with a sanction awaiting a decision",
  promoted_ngv: "members promoted to NGV",
};

/* ============================================================================
   THE MEMBER DESK

   The roster screen an administrator lives on. It already had server-side
   search, filtering, sorting and paging — the expensive half — and none of the
   things you do once you have found people:

     · NO BULK ACTIONS AT ALL. Four hundred members, one drawer at a time.
       Posting a centre's intake to that centre, or graduating a cohort, was
       four hundred separate saves, so nobody did it and the roster drifted.
     · SELECTION WAS IMPOSSIBLE, so "these eleven" had no expression.
     · A PAGED TABLE CANNOT TICK WHAT IT CANNOT SEE. A filter matching 340
       members can only ever offer the 50 rows in hand, so "all 340" has to be
       a separate, explicit decision — resolved by the SERVER from the same
       filters, not by unioning whatever pages the client happens to hold.
     · ONE EMPTY STATE for two different situations. "No members match." was
       shown both to a brand-new deployment and to somebody who had just
       filtered themselves into a corner, and neither could act on it.
     · A SPINNER ON EVERY PAGE TURN. The rows were dropped to null before each
       fetch, so paging flashed the table away and back.

   The bulk actions and the per-row menu are built from ONE list of action
   declarations (see the admin action layer in components.jsx), so an individual
   action and its bulk equivalent cannot drift into asking differently, being
   permitted differently, or doing different things. The guards that make them
   safe — own account, staff accounts, centre scope, batch bounds, per-row
   verdicts — are server-side in domain/members-bulk.php, because a guard in
   the UI is a suggestion.
   ============================================================================ */
function AdminMembers() {
  const [list, setList] = React.useState(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState("");
  const centreOpts = useCentreOptions();
  const { hasCap } = useAuth();
  const BLANK_FILTERS = { q: "", centre: "", status: "", type: "", missing: "", level: "", segment: "" };
  const [filters, setFilters] = React.useState(BLANK_FILTERS);
  const [page, setPage] = React.useState(1);
  const [meta, setMeta] = React.useState({ total: 0, pageSize: 50 });
  const [editing, setEditing] = React.useState(null);
  const [viewing, setViewing] = React.useState(null);
  /* The pair the duplicates tab handed to the merge drawer. */
  const [merging, setMerging] = React.useState(null);
  const [printing, setPrinting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  /* Cards for everybody who came in before cards existed — the imported roll
     above all. Bounded per call on the server; repeated until none remain. */
  const [issuing, setIssuing] = React.useState(false);
  /* New promotions reach Afrovanguard on their own; this is for the vanguards
     promoted before that, and is safe to repeat — Afrovanguard keys on the
     NGG member id and creates nothing twice. */
  const [syncingNgv, setSyncingNgv] = React.useState(false);
  const syncNgv = async () => {
    setSyncingNgv(true);
    try {
      const r = await NGGApi.admin.members.ngvPortalSync();
      toast.success(r.delivered + " of " + r.announced + " sent now; any others are queued and retried.", "NGVs sent to Afrovanguard");
    } catch (e) { toast.error(e.detail || e.code || e.message, "Couldn't send them"); }
    finally { setSyncingNgv(false); }
  };
  const issueCards = async () => {
    const ok = await dialog.confirm({ title: "Give every member a gate card?",
      body: "Members with no card get a new secure card for the CACENTRE gate. The member number on the card they already hold is recorded too, so it keeps working until they are reprinted. Nobody's existing card is replaced.",
      cta: "Issue cards" });
    if (!ok) return;
    setIssuing(true);
    let issued = 0, printed = 0;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await NGGApi.admin.members.cards.backfill();
        issued += r.issued || 0; printed += r.printed || 0;
        if (!r.remaining || !r.issued) break;
      }
      toast.success(issued + " secure card" + (issued === 1 ? "" : "s") + " · " + printed + " printed card" + (printed === 1 ? "" : "s") + " recorded", "Cards issued");
    } catch (e) { toast.error(e.detail || e.code || e.message, "Couldn't issue cards"); }
    finally { setIssuing(false); }
  };
  const [bulkForm, setBulkForm] = React.useState(null);   // which bulk action is asking for a value
  /* Ordering lives on the SERVER, not in the rendered page: this table is
     paged, so sorting the fifty rows in hand would order page three of the
     roster and call it the roster. The column allow-list is in
     admin_members_list.

     Declared above every reader — the CSV export and the print run both send
     it now, and a `const` read from a line above the one that declares it is
     a temporal dead zone waiting for somebody to move a function. */
  const [sort, setSort] = React.useState({ col: "createdAt", dir: "desc" });

  const filtered = !!(filters.q || filters.centre || filters.status || filters.type || filters.missing || filters.level);

  /* A failed fetch must surface an error + retry, never leave the spinner
     hanging forever. Server-paged.

     `keep` holds the rows on screen while the next page loads. Dropping them
     to null first is what made every page turn and every sort flash the table
     away — which reads as the data going missing, on the screen where that is
     the most alarming thing it could read as. */
  /* Only the LATEST request may draw. Typing "amina" sends a request per
     pause, and the answers can come back in any order: without this, a slow
     answer for "am" landing after the one for "amina" put the wrong roster
     under the right search. */
  const loadSeq = React.useRef(0);
  const load = React.useCallback((p, so, f) => {
    const pg = p || page, s0 = so || sort, ff = f || filters;
    const n = ++loadSeq.current;
    setErr(""); setRefreshing(true);
    return NGGApi.admin.members.list(Object.assign({}, ff, { page: pg, pageSize: meta.pageSize, sort: s0.col, dir: s0.dir }))
      .then(r => { if (n !== loadSeq.current) return; setList(r.members || []); setMeta(m => ({ total: r.total || 0, pageSize: r.pageSize || m.pageSize })); })
      .catch(e => { if (n === loadSeq.current) setErr(e.code || e.message || "load_failed"); })
      .finally(() => { if (n === loadSeq.current) setRefreshing(false); });
    // eslint-disable-next-line
  }, [page, sort, filters, meta.pageSize]);
  /* Dashboard first. Opening the section on a 50-row page of a roster
     answers no question anybody arrived with. */
  const [tab, setTab] = useAdminTab("dashboard", React.useCallback(t => ["dashboard", "roster", "quality", "duplicates"].indexOf(t) !== -1, []));

  /* Re-sorting goes back to page one. Keeping the page number would land
     somebody on "page 4 of a different order", which is a place nobody meant
     to be and which looks exactly like data going missing. */
  const onSort = (col, dir) => { const so = { col, dir }; setSort(so); setPage(1); load(1, so); };
  // Filter changes reset to page 1; the debounced search does too.
  React.useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [filters.centre, filters.status, filters.type, filters.missing, filters.level, filters.segment]);
  React.useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [filters.q]);
  const goPage = (p) => { setPage(p); load(p); };
  const reload = () => load(page, sort, filters);

  const rows = list || [];
  const sel = useAdminSelection(rows, m => m.memberId);

  /* "Select all N matching the filter."
   *
   * The ids come from the server, resolved from the same filters this page was
   * built with. A client-side union of the pages it happens to have loaded is
   * a different set, and the difference is invisible until somebody acts on it. */
  const [selectingAll, setSelectingAll] = React.useState(false);
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const r = await NGGApi.admin.members.ids(Object.assign({}, filters, { sort: sort.col, dir: sort.dir }));
      sel.replace(r.memberIds || []);
      if (r.capped) {
        toast.warn("Selected the first " + fmtNum((r.memberIds || []).length) + " of " + fmtNum(r.total)
          + " — one action can cover " + fmtNum(r.max) + " members at a time.", "Selection capped");
      }
    } catch (e) { toast.error(humanizeError(e.message, e.code), "Couldn't select them all"); }
    finally { setSelectingAll(false); }
  };

  const [exporting, setExporting] = React.useState(false);
  const exportCsv = async (onlySelected) => {
    setExporting(true);
    try {
      // Same rule as the print run: the file comes out in the order the
      // person exporting it was looking at.
      const r = await NGGApi.admin.members.list(Object.assign({}, filters, {
        all: 1, sort: sort.col, dir: sort.dir }));
      let out = r.members || [];
      if (onlySelected) { const want = new Set(sel.ids); out = out.filter(m => want.has(m.memberId)); }
      downloadCsv("members", out.map(m => ({ memberId: m.memberId, displayId: m.displayId || "", fullName: m.fullName, email: m.email, type: m.type, status: m.status, centre: m.centre, level: m.level || "", track: m.track || "" })));
    } catch (e) { toast.error(e.code || e.message, "Export failed"); } finally { setExporting(false); }
  };

  /* ── The action declarations ───────────────────────────────────────────────
     ONE list. The bulk bar renders them across a selection; the row menu
     renders them for a single member. Both go through runAdminAction, so the
     confirm copy, the capability check, the partial-failure reporting and the
     audit trail are identical whether one member or two hundred are involved.

     An action that needs a VALUE (which status? which centre?) opens a small
     form first — the value cannot be a submenu of buttons, because "set status"
     has five options and "post to centre" has as many as there are centres. */
  const ACTIONS = React.useMemo(() => [
    { id: "status", label: "Set status…", cap: "people",
      open: (ids) => setBulkForm({ op: "status", ids }) },
    { id: "centre", label: "Post to centre…", cap: "people",
      open: (ids) => setBulkForm({ op: "centre", ids }) },
    { id: "level", label: "Set level…", cap: "people",
      open: (ids) => setBulkForm({ op: "level", ids }) },
    { id: "type", label: "Set membership type…", cap: "people",
      open: (ids) => setBulkForm({ op: "type", ids }) },
    { id: "remindersOff", label: "Dues reminders…", cap: "fees",
      hint: "Turn the monthly dues reminder on or off for these families",
      open: (ids) => setBulkForm({ op: "remindersOff", ids }) },
    /* Two per-member actions with no sensible bulk form. `rowOnly` keeps them
       out of the bulk bar: resetting two hundred people's 2FA in one press is
       not a feature anybody wants to have available. */
    { id: "reset2fa", label: "Reset 2FA", rowLabel: "Reset their 2FA", cap: "rbac", bulkHidden: true, danger: true,
      confirm: () => ({ title: "Reset their authenticator?", body: "They'll be asked to enrol a new authenticator the next time they open the Control Room. Their existing backup codes stop working.", cta: "Reset 2FA", danger: true }),
      runOne: (id) => NGGApi.admin.members.reset2fa(id), pastTense: "reset" },
    { id: "resetPw", label: "Send a password reset", rowLabel: "Send a password reset", cap: "rbac", bulkHidden: true,
      confirm: () => ({ title: "Send a password reset?", body: "They get a one-time link by email. Their current password keeps working until they use it.", cta: "Send it" }),
      runOne: (id) => NGGApi.admin.members.resetPassword(id), pastTense: "emailed" },
  ], []);
  const showRoster = (patch) => { setFilters(f => Object.assign({}, f, patch || {})); setTab("roster"); };

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Members {meta.total ? <span className="admin-count mono">{fmtNum(meta.total)}</span> : null}</h2>
        <div className="admin-section-actions">
          {tab === "roster" && <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(false)} disabled={exporting || !meta.total} title="Exports every member matching the current filters">{exporting ? "Exporting…" : "Export CSV"}</button>}
          {tab === "roster" && <button className="btn btn-ghost btn-sm" onClick={() => setPrinting(true)} disabled={!meta.total} title="Print ID cards for every member matching the current filters">Print IDs</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setImporting(true)} title="Load the roster file produced from the members workbook">Import roster</button>
          <button className="btn btn-ghost btn-sm" onClick={syncNgv} disabled={syncingNgv} title="Make sure everybody promoted to NGV has their NGV account on Afrovanguard">{syncingNgv ? "Sending…" : "Send NGVs to Afrovanguard"}</button>
          <button className="btn btn-ghost btn-sm" onClick={issueCards} disabled={issuing} title="Give every member with no card a secure card for the CACENTRE gate, and record the member number on the card they already hold">{issuing ? "Issuing…" : "Issue cards"}</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New member</button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {[["dashboard", "Dashboard"], ["roster", "Roster"], ["quality", "Data quality"], ["duplicates", "Duplicates"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id}
                  className={"admin-tab" + (tab === id ? " is-active" : "")}
                  onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "dashboard" && <MembersDashboard onFilter={showRoster}/>}
      {tab === "quality" && <MembersSegments onFilter={showRoster}/>}
      {tab === "duplicates" && <>
        <h3 className="admin-h3 mem-dupes-sub">Member IDs</h3>
        <MembersIdDuplicates onOpen={setViewing} onMerge={(a, b) => setMerging({ keepId: a, mergeId: b })}/>
        <h3 className="admin-h3 mem-dupes-sub">Shared contact details</h3>
        <MembersDuplicates onOpen={setViewing} onMerge={(a, b) => setMerging({ keepId: a, mergeId: b })}/>
      </>}
      {tab === "roster" && <>
      {filters.segment && (
        <div className="mem-seg-on">
          Showing <strong>{(SEGMENT_LABELS[filters.segment] || filters.segment).toLowerCase()}</strong>.
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters(f => ({...f, segment: ""}))}>Show everybody</button>
        </div>
      )}
      <div className="admin-filters admin-filters-6">
        <input className="admin-input" type="search" placeholder="Search name, ID, email or phone…" aria-label="Search members by name, printed ID, email or phone"
          value={filters.q} onChange={(e) => setFilters(f => ({...f, q: e.target.value}))}/>
        <select className="admin-select" aria-label="Filter by centre" value={filters.centre} onChange={(e) => setFilters(f => ({...f, centre: e.target.value}))}>
          <option value="">All centres</option>{centreOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="admin-select" aria-label="Filter by membership type" value={filters.type} onChange={(e) => setFilters(f => ({...f, type: e.target.value}))}>
          <option value="">All types</option><option value="NGG">NGG</option><option value="Summer">Summer</option>
        </select>
        {/* Rows with something missing. Exists because the print preflight
            counts these three and, until it did, there was no way in the
            product to get from "90 have no photograph" to those ninety. The
            values match $missingSql in admin_members_list. */}
        <select className="admin-select" value={filters.missing} onChange={(e) => setFilters(f => ({...f, missing: e.target.value}))}
          aria-label="Filter by what is missing from a member's ID card"
          title="Members with something missing from their ID card">
          <option value="">Complete or not</option>
          <option value="photo">No photograph</option>
          <option value="printedId">No printed ID</option>
          <option value="discipline">No discipline</option>
        </select>
        <select className="admin-select" aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters(f => ({...f, status: e.target.value}))}>
          <option value="">All statuses</option>
          {MEMBER_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {/* Level. The roster workbook files every member at one and the column
            has existed for a while, but nothing could filter by it — so
            "everyone at level C" meant exporting the roster and opening a
            spreadsheet. */}
        <select className="admin-select" aria-label="Filter by level" value={filters.level} onChange={(e) => setFilters(f => ({...f, level: e.target.value}))}>
          <option value="">All levels</option>
          {"ABCDEFG".split("").map(x => <option key={x} value={x}>Level {x}</option>)}
        </select>
      </div>

      {/* What is actually filtered, and how to undo it one piece at a time.
          Five dropdowns can be left in a state that explains an empty table,
          and reading five controls to work out why is worse than being told. */}
      {filtered && (
        <div className="admin-chipbar" role="group" aria-label="Active filters">
          {[
            ["q", "Search: " + filters.q],
            ["centre", "Centre: " + filters.centre],
            ["type", "Type: " + filters.type],
            ["missing", { photo: "Missing a photograph", printedId: "Missing a printed ID", discipline: "Missing a discipline" }[filters.missing]],
            ["status", "Status: " + memberStatusLabel(filters.status)],
            ["level", "Level: " + filters.level],
          ].filter(([k]) => filters[k]).map(([k, label]) => (
            <button key={k} type="button" className="admin-chip-x" onClick={() => setFilters(f => ({ ...f, [k]: "" }))}>
              {label} <span aria-hidden="true">✕</span>
              <span className="sr-only">— remove this filter</span>
            </button>
          ))}
          <button type="button" className="admin-bulk-link" onClick={() => setFilters(BLANK_FILTERS)}>Clear all filters</button>
        </div>
      )}

      <AdminBulkBar selection={sel} noun="member" hasCap={hasCap} actions={ACTIONS.filter(a => !a.bulkHidden)}
        total={meta.total} busy={selectingAll}
        selectAllMatching={selectAllMatching}>
        <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(true)} disabled={exporting}>Export selected</button>
      </AdminBulkBar>

      {err && list === null ? <ErrorState title="Couldn't load the roster" code={err} onRetry={reload}/> :
       list === null ? <div className="dash-spinner"/> :
        <div className={"admin-table-wrap" + (refreshing ? " is-refreshing" : "")} aria-busy={refreshing ? "true" : undefined}>
          {/* An error on a REFRESH keeps the rows on screen — they are still
              the last true answer — and says the refresh failed. */}
          {err && <p className="admin-form-err" role="alert" style={{ margin: "0 0 10px" }}>
            Couldn't refresh the roster ({err}). These rows are from the last successful load.{" "}
            <button className="admin-bulk-link" onClick={reload}>Try again</button>
          </p>}
          <table className="admin-table">
            <caption className="sr-only">
              Members{filtered ? " matching the current filters" : ""} — {fmtNum(meta.total)} in total,
              page {page} of {Math.max(1, Math.ceil(meta.total / meta.pageSize))}
            </caption>
            <thead><tr>
              <th scope="col" style={{ width: 34 }}><AdminSelectAll selection={sel} label="Select all members on this page"/></th>
              <SortTh label="Member" col="fullName" sort={sort} onSort={onSort}/>
              <SortTh label="Type" col="type" sort={sort} onSort={onSort}/>
              <SortTh label="Centre" col="centre" sort={sort} onSort={onSort}/>
              <SortTh label="Status" col="status" sort={sort} onSort={onSort}/>
              {/* Track is not a column the server can order by — it lives on
                  the enrolment, not the member row — so it stays a plain
                  header rather than a control that would do nothing. */}
              <th scope="col">Track</th>
              <SortTh label="Joined" col="createdAt" sort={sort} onSort={onSort} defaultDir="desc"/>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.memberId} className={"admin-row-click" + (sel.has(m.memberId) ? " is-selected" : "")} onClick={() => setViewing(m.memberId)}>
                  <td style={{ width: 34 }}><AdminRowCheck selection={sel} id={m.memberId} label={"Select " + (m.fullName || m.memberId)}/></td>
                  <td>
                    {/* The name is the control, not the row.
                        Opening a member was a click handler on the <tr> and
                        nothing else: reachable with a mouse, and by keyboard
                        not at all — you could tab to Edit but never to the
                        primary action on the primary admin screen. A row is
                        not a button and cannot become one without swallowing
                        the Edit button inside it, so the NAME is the button
                        and the row click stays as a convenience on top. */}
                    <button type="button" className="admin-cell-link"
                            onClick={(e) => { e.stopPropagation(); setViewing(m.memberId); }}>
                      <span className="admin-cell-name">{m.fullName}</span>
                    </button>
                    <div className="mono admin-cell-sub">{m.memberId} · {m.email}</div>
                  </td>
                  <td>{m.type}</td>
                  <td>{m.centre || <span className="admin-cell-sub">— none</span>}</td>
                  <td><span className={"chip status-" + m.status}>{memberStatusLabel(m.status)}</span></td>
                  <td>{m.track || <span className="admin-cell-sub">—</span>}</td>
                  <td className="mono admin-cell-sub">{fmtDate(m.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button>
                    {/* The same declarations as the bulk bar, for one member. */}
                    <AdminRowActions id={m.memberId} actions={ACTIONS} hasCap={hasCap} noun="member" reload={reload}/>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan="8">
                  {/* Two different situations, two different answers. "No
                      members match." was shown to a brand-new deployment and to
                      somebody who had filtered themselves into a corner, and
                      neither could act on it. */}
                  {filtered
                    ? <EmptyState icon="⌕" title="No members match these filters"
                        message="Nothing in the roster fits every filter at once. Widen one of them, or clear them all."
                        action={<button className="btn btn-ghost btn-sm" onClick={() => setFilters(BLANK_FILTERS)}>Clear all filters</button>}/>
                    : <EmptyState icon="◯" title="No members yet"
                        message="Add the first one by hand, or load the roster file produced from the members workbook."
                        action={<>
                          <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New member</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setImporting(true)}>Import roster</button>
                        </>}/>}
                </td></tr>
              )}
            </tbody>
          </table>
          <Pager page={page} pageSize={meta.pageSize} total={meta.total} onPage={goPage}/>
        </div>
      }
      </>}
      {bulkForm && <AdminMemberBulkForm form={bulkForm} centreOpts={centreOpts}
        onClose={() => setBulkForm(null)}
        onDone={() => { setBulkForm(null); sel.clear(); reload(); }}/>}
      {editing && <AdminMemberEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }}/>}
      {viewing && <AdminMemberDetail memberId={viewing} onClose={() => setViewing(null)} onEdit={(m) => { setViewing(null); setEditing(m); }} onChanged={reload}/>}
      {printing && <AdminMemberIdBatch filters={filters} sort={sort} onClose={() => setPrinting(false)}
        onFilter={(missing) => { setFilters(f => ({ ...f, missing })); setPrinting(false); }}/>}
      {merging && <AdminMemberMerge keepId={merging.keepId} mergeId={merging.mergeId}
                                    onClose={() => setMerging(null)}
                                    onDone={() => { setMerging(null); reload(); }}/>}
      {importing && <AdminRosterImport onClose={() => setImporting(false)} onApplied={() => { setImporting(false); setPage(1); setList(null); load(1); }}/>}
    </div>
  );
}

/* The value a bulk action needs, asked for once.
 *
 * "Set status" has five options and "post to centre" has as many as there are
 * centres; neither fits in a row of buttons. This is deliberately a small
 * modal rather than a dropdown-inside-the-bulk-bar: the count being acted on
 * has to be visible at the moment the value is chosen, and it is the number
 * this dialog was opened with — never re-read afterwards, so a background
 * refresh cannot change what "these 40" meant between the question and the
 * answer.
 *
 * Every refusal the server can return is named. The partial case is the normal
 * one: a selection that includes a staff account or somebody outside a scoped
 * admin's centres comes back with those rows refused and the rest applied, and
 * this says which and why rather than reporting a clean success.
 */
function AdminMemberBulkForm({ form, centreOpts, onClose, onDone }) {
  const drawer = useAdminDrawer(onClose, false);
  const count = (form.ids || []).length;   // read once, on open
  const [value, setValue] = React.useState(() => (
    form.op === "status" ? "active" :
    form.op === "type" ? "NGG" :
    form.op === "remindersOff" ? "1" : ""));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const META = {
    status: { title: "Set status", label: "New status",
      hint: "Suspended and Inactive are refused for staff accounts — staff lifecycle belongs to Access & roles, where the last-super-admin rule lives.",
      options: MEMBER_STATUS_OPTS, key: "status" },
    centre: { title: "Post to a centre", label: "Centre",
      hint: "The member's record stores the centre NAME. “— no centre —” clears it, which the roster has a filter for.",
      options: [{ value: "", label: "— no centre —" }].concat(centreOpts.map(c => ({ value: c, label: c }))), key: "centre" },
    type:   { title: "Set membership type", label: "Type",
      hint: "NGG is the year-round membership; Summer is a Summer School participant record.",
      options: [{ value: "NGG", label: "NGG" }, { value: "Summer", label: "Summer" }], key: "type" },
    level:  { title: "Set level", label: "Level",
      hint: "A single letter, as it appears on the roster workbook. Blank clears it.",
      options: [{ value: "", label: "— clear —" }].concat("ABCDEFG".split("").map(x => ({ value: x, label: "Level " + x }))), key: "level" },
    remindersOff: { title: "Dues reminders", label: "Monthly reminders",
      hint: "Off is a per-family opt-out. It stops the reminder only; the obligation and the balance are unchanged.",
      options: [{ value: "1", label: "Off — don't remind these families" }, { value: "0", label: "On — remind them as normal" }], key: "off" },
  }[form.op] || { title: "Apply", label: "Value", options: [], key: "value" };

  const apply = async () => {
    setBusy(true);
    try {
      const payload = {};
      payload[META.key] = form.op === "remindersOff" ? (value === "1" ? 1 : 0) : value;
      const r = await NGGApi.admin.members.bulk(form.op, form.ids, payload);
      setResult(r);
      const refused = (r.results || []).filter(x => x && x.ok === false);
      const unchanged = (r.results || []).filter(x => x && x.ok === true && x.unchanged).length;
      if (refused.length && r.applied) {
        toast.warn(r.applied + " of " + count + " updated · " + refused.length + " refused ("
          + adminFailSummary(refused.map(x => ({ ok: false, error: x.error }))) + ").", META.title);
      } else if (refused.length) {
        toast.error("Nothing was changed — all " + refused.length + " refused ("
          + adminFailSummary(refused.map(x => ({ ok: false, error: x.error }))) + ").", META.title);
      } else if (!r.applied && unchanged) {
        toast.info(unchanged + " already had that value — nothing to change.", META.title);
      } else {
        toast.success(r.applied + " member" + (r.applied === 1 ? "" : "s") + " updated.", META.title);
      }
    } catch (e) {
      const code = e.code || e.message;
      const map = {
        bad_status: "That status isn't one the member desk can set.",
        centre_not_found: "That centre isn't in the directory any more.",
        centre_out_of_scope: "That centre isn't one of yours.",
        bad_type: "Pick NGG or Summer.",
        bad_level: "A level is a single letter.",
        too_many: "Too many members selected for one action.",
        nothing_selected: "Nothing was selected.",
        forbidden: "You don't have permission for this action.",
      };
      toast.error(map[code] || humanizeError(e.message, code), META.title);
    } finally { setBusy(false); }
  };

  const REFUSALS = {
    own_account: "your own account — use the member editor for that",
    staff_account: "a staff account — staff lifecycle lives in Access & roles",
    out_of_scope: "outside your centres",
    not_found: "no longer in the roster",
    write_failed: "the write failed",
  };

  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <div className="admin-drawer-panel" role="dialog" aria-modal="true" {...drawer.titleProps}
        ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>{META.title} · {fmtNum(count)} member{count === 1 ? "" : "s"}</h3>
          <button className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll">
          {!result ? (
            <div className="admin-fields">
              <FieldSelect label={META.label} value={value} onChange={setValue} options={META.options}/>
              <p className="admin-hint" style={{ margin: 0 }}>{META.hint}</p>
              <p className="admin-hint" style={{ margin: 0 }}>
                This applies to the <b>{fmtNum(count)}</b> member{count === 1 ? "" : "s"} selected when you opened
                this — not to whatever is selected later.
              </p>
            </div>
          ) : (
            <div className="admin-fields">
              <div className="admin-tiles">
                <AdminTile n={result.applied} l="Updated"/>
                <AdminTile n={(result.results || []).filter(x => x && x.ok && x.unchanged).length} l="Already set"/>
                <AdminTile n={result.refused} l="Refused"/>
              </div>
              {(result.results || []).filter(x => x && x.ok === false).length > 0 && (
                <>
                  <h4 className="admin-h4">What was refused, and why</h4>
                  <div className="admin-table-wrap"><table className="admin-table">
                    <thead><tr><th scope="col">Member</th><th scope="col">Reason</th></tr></thead>
                    <tbody>
                      {(result.results || []).filter(x => x && x.ok === false).map(x => (
                        <tr key={x.id}>
                          <td>{x.name || <span className="mono">{x.id}</span>}</td>
                          <td className="admin-cell-sub">{REFUSALS[x.error] || String(x.error || "refused").replace(/_/g, " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="admin-drawer-foot">
          {!result
            ? <>
                <button className="btn btn-ghost btn-sm" onClick={drawer.close}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={apply} disabled={busy}>
                  {busy ? "Applying…" : "Apply to " + fmtNum(count)}
                </button>
              </>
            : <button className="btn btn-primary btn-sm" onClick={onDone}>Done</button>}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Batch ID cards — one file, every member the filters match.
//
// The member ID card is hand-coded (window.MemberIDCard), not a Fabric template,
// so the ID Card Studio's merge engine — which drives a designed template over a
// roster — cannot print it. This is the member equivalent: it reads the same
// filtered roster the table and the CSV export use, renders each card on the
// on-demand CardExport path, and hands back one of three files. Rendering runs
// entirely in the browser (the host has no headless renderer), one card at a
// time, cancellable, so the whole cohort neither locks the tab nor blows memory.
// ============================================================================
/* Roster import — the members workbook, without a shell.
 *
 * NGG runs on shared hosting: no SSH, no cron. api/tools/seed-members.php is
 * the same import, but a CLI-only importer is one the person who actually keeps
 * the roster cannot run. So the browser reads the file the extractor produced,
 * posts it, and gets back the identical dry run the command line prints.
 *
 * Two steps on purpose, and the Apply button does not appear until the first
 * one has been read. A roster file rewrites the membership table in one action;
 * seeing what it would do first is the whole safety property.
 */
/* The desk's side of member self-service.
 *
 * A queue, not an inbox: every row is something a member is waiting on, and the
 * only two things to do with one are approve it or say why not. Declining
 * without words is refused by the server, because a bare refusal is how a
 * decision becomes a grievance — the form here says so rather than letting
 * somebody discover it by pressing the button.
 *
 * Approving a payment claim posts through the ordinary ledger path. The amount
 * is editable at the point of approval: when ₦1,000 arrived against a ₦6,000
 * claim, posting ₦1,000 and saying so beats arguing with the member first.
 */
/* ── Approvals ───────────────────────────────────────────────────────────────
 *
 * A club admin's sensitive actions are queued by backend_dispatch() instead of
 * run (domain/approvals.php). This is the queue: an approver approves (the
 * action runs then, as the person who asked — every check it makes still
 * applies to them) or rejects with a reason; the club admin sees their own
 * requests and may withdraw one nobody has decided yet.
 */
const APPROVAL_STATUS_LABEL = { pending: "Waiting", approved: "Approved", rejected: "Rejected", failed: "Approved — refused when run", withdrawn: "Withdrawn", running: "Running" };

/* ── The NGG Club curriculum ─────────────────────────────────────────────────
 *
 * Lessons (course → week → position), their materials and checks, a bulk
 * import that matches on that natural key so a corrected sheet updates rather
 * than duplicates, and the progress members have made. The AI drafts a
 * lesson's summary, objectives and checks from its text; a person reads the
 * draft and saves it. domain/curriculum.php has the rules.
 */
function AdminCurriculum() {
  const [tab, setTab] = useAdminTab("lessons", React.useCallback(t => ["lessons", "courses", "submissions", "import", "progress"].indexOf(t) !== -1, []));
  // Materials instructors sent, waiting for review — on the tab, so a queue
  // nobody opens still says it is there.
  const [pendingSubs, setPendingSubs] = React.useState(0);
  React.useEffect(() => { NGGApi.admin.curriculum.submissions("pending").then(r => setPendingSubs((r.counts || {}).pending || 0)).catch(() => {}); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">NGG curriculum</h2></div>
      <p className="admin-hint">What the Club teaches, lesson by lesson. Members see the published lessons for their course and the Club-wide ones on their dashboard; instructors and NGG mentors see them in their portal and mark the written answers.</p>
      <div className="admin-tabs" role="tablist">
        {[["lessons", "Lessons"], ["courses", "Courses"], ["submissions", "Submissions"], ["import", "Import"], ["progress", "Progress"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"admin-tab" + (tab === k ? " is-active" : "")} onClick={() => setTab(k)}>
            {l}{k === "submissions" && pendingSubs > 0 && <span className="admin-tab-count" aria-label={pendingSubs + " waiting"}>{pendingSubs}</span>}
          </button>
        ))}
      </div>
      {tab === "lessons" && <CurriculumLessons/>}
      {tab === "courses" && <AcademyCatalogue source="club"/>}
      {tab === "submissions" && <CurriculumSubmissions onCount={setPendingSubs}/>}
      {tab === "import" && <CurriculumImport/>}
      {tab === "progress" && <CurriculumProgress/>}
    </div>
  );
}

/* Materials NGG instructors and mentors submitted to lessons. Pending ones are
   not part of any lesson until approved here; a rejection carries a note back
   to the person who sent it. One declaration per action, for the bulk bar and
   the row menu alike. */
function CurriculumSubmissions({ onCount }) {
  const [status, setStatus] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [rejecting, setRejecting] = React.useState(null);   // ids awaiting a note
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.admin.curriculum.submissions(status).then(r => { setD(r); onCount && onCount((r.counts || {}).pending || 0); }).catch(e => setErr(e.code || e.message));
  }, [status, onCount]);
  React.useEffect(() => { load(); }, [load]);
  const rows = (d && d.materials) || [];
  const sel = useAdminSelection(rows, m => m.materialId);
  const actions = [
    { id: "approve", label: "Approve", pastTense: "approved", reload: load, rowHidden: status === "approved",
      confirm: ({ count }) => ({ title: "Approve " + count + " material" + (count === 1 ? "" : "s") + "?", body: "Members studying those lessons will see them straight away.", cta: "Approve" }),
      run: (ids) => NGGApi.admin.curriculum.review("approve", ids) },
    { id: "reject", label: "Send back…", rowHidden: status === "rejected",
      open: (ids) => { setNote(""); setRejecting(ids); } },
  ];
  const reject = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const ids = rejecting;
    // The note form IS the confirmation, so no second dialog.
    const r = await runAdminAction({ id: "reject", label: "Send back", pastTense: "sent back", confirm: false,
      run: (x) => NGGApi.admin.curriculum.review("reject", x, note.trim()) }, ids, { noun: "material" });
    setBusy(false);
    if (r.ran) { setRejecting(null); sel.clear(); load(); }
  };
  return (
    <div className="cur-subs">
      <p className="admin-hint">Links and files that NGG instructors and mentors added to lessons in their courses. A pending one is not part of the lesson — members do not see it — until it is approved. Sending one back needs a reason, which goes to the instructor.</p>
      <div className="admin-filters" role="group" aria-label="Which submissions">
        {[["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Sent back"]].map(([k, l]) => (
          <button key={k} className={"btn btn-sm " + (status === k ? "btn-primary" : "btn-ghost")} aria-pressed={status === k} onClick={() => { setStatus(k); sel.clear(); }}>
            {l}{d && d.counts && d.counts[k] ? " · " + d.counts[k] : ""}
          </button>
        ))}
      </div>
      <AdminBulkBar selection={sel} noun="material" actions={actions.filter(a => !(a.id === "approve" && status === "approved") && !(a.id === "reject" && status === "rejected"))}/>
      {rejecting && (
        <form className="cur-subs-reject" onSubmit={reject}>
          <label className="admin-field"><span>Why is {rejecting.length === 1 ? "it" : "each of these " + rejecting.length} being sent back? The instructor reads this.</span>
            <textarea className="admin-input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. The video is private — make it public or upload the file" autoFocus/></label>
          <div className="cur-ed-row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !note.trim()}>{busy ? "Sending…" : "Send back"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(null)}>Cancel</button>
          </div>
        </form>
      )}
      {err ? <ErrorState title="Couldn't load submissions" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        !rows.length ? <div className="admin-empty">{status === "pending" ? "Nothing waiting. Materials instructors add to their lessons appear here." : "None yet."}</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <caption className="sr-only">Submitted materials</caption>
          <thead><tr>
            <th scope="col"><AdminSelectAll selection={sel} label="Select every submission shown"/></th>
            <th scope="col">Material</th><th scope="col">Lesson</th><th scope="col">From</th><th scope="col">Note</th><th scope="col"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{rows.map(m => (
            <tr key={m.materialId} className={sel.has(m.materialId) ? "is-selected" : ""}>
              <td><AdminRowCheck selection={sel} id={m.materialId} label={"Select " + m.title}/></td>
              <td><span aria-hidden="true">{CUR_MATERIAL_ICON[m.kind] || "🔗"}</span> <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a>
                <div className="admin-cell-sub">{m.kind}{m.reviewNote ? " · " + m.reviewNote : ""}</div></td>
              <td>{m.unitTitle}</td>
              <td>{m.submitterName || m.submittedBy}<div className="admin-cell-sub">{fmtDate(m.submittedAt)}</div></td>
              <td className="admin-cell-sub">{m.note || "—"}</td>
              <td><AdminRowActions id={m.materialId} actions={actions} noun="material" reload={load}/></td>
            </tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

function CurriculumLessons() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [f, setF] = React.useState({ course: "", status: "", q: "" });
  const [edit, setEdit] = React.useState(null);   // null | {} (new) | unit
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.admin.curriculum.list(f).then(setD).catch(e => setErr(e.code || e.message));
  }, [f]);
  React.useEffect(() => { const t = setTimeout(load, f.q ? 250 : 0); return () => clearTimeout(t); }, [load]);
  const rows = (d && d.units) || [];
  const sel = useAdminSelection(rows, u => u.unitId);
  const actions = [
    { id: "publish", label: "Publish", pastTense: "published", reload: load,
      run: (ids) => NGGApi.admin.curriculum.status("publish", ids) },
    { id: "unpublish", label: "Back to draft", pastTense: "moved to draft", reload: load,
      run: (ids) => NGGApi.admin.curriculum.status("unpublish", ids) },
    { id: "retire", label: "Retire", pastTense: "retired", reload: load,
      confirm: ({ count }) => ({ title: "Retire " + count + " lesson" + (count === 1 ? "" : "s") + "?", body: "Members stop seeing them. Their progress is kept.", cta: "Retire" }),
      run: (ids) => NGGApi.admin.curriculum.status("retire", ids) },
    { id: "delete", label: "Delete", danger: true, pastTense: "deleted", reload: load,
      confirm: ({ count }) => ({ title: "Delete " + count + " lesson" + (count === 1 ? "" : "s") + "?", body: "Only lessons nobody has started can be deleted — retire the rest.", cta: "Delete", danger: true }),
      run: (ids) => NGGApi.admin.curriculum.status("delete", ids) },
  ];
  const openUnit = async (u) => {
    try { const r = await NGGApi.admin.curriculum.get(u.unitId); setEdit(r.unit); }
    catch (e) { toast.error(humanizeError(e.code, e.code)); }
  };
  if (edit) return <CurriculumEditor unit={edit} courses={(d && d.courses) || []} divisions={(d && d.divisions) || []} examRefs={(d && d.examRefs) || {}} canWrite={!!(d && d.canWrite)} aiEnabled={!!(d && d.aiEnabled)}
    onClose={() => setEdit(null)} onSaved={(u) => { setEdit(u); load(); }}/>;
  return (
    <div>
      <div className="admin-filters cur-admin-filters" role="search">
        <input className="admin-input" placeholder="Search lessons…" value={f.q} onChange={e => setF(x => ({ ...x, q: e.target.value }))} aria-label="Search lessons"/>
        <select className="admin-select" value={f.course} onChange={e => setF(x => ({ ...x, course: e.target.value }))} aria-label="Course">
          <option value="">Every course</option><option value="__all">Whole Club (no course)</option>
          {((d && d.courses) || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="admin-select" value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value }))} aria-label="Status">
          <option value="">Draft and published</option><option value="draft">Draft</option><option value="published">Published</option><option value="retired">Retired</option>
        </select>
        {d && d.canWrite && <button className="btn btn-primary btn-sm" onClick={() => setEdit({})}>New lesson</button>}
      </div>
      <AdminBulkBar selection={sel} noun="lesson" actions={d && d.canWrite ? actions : []}/>
      {err ? <ErrorState title="Couldn't load the curriculum" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        !rows.length ? <div className="admin-empty">{f.q || f.course || f.status ? "No lesson matches these filters." : "No lessons yet. Add one, or import the curriculum."}</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <caption className="sr-only">Curriculum lessons</caption>
          <thead><tr>
            <th scope="col"><AdminSelectAll selection={sel} label="Select every lesson shown"/></th>
            <th scope="col">Lesson</th><th scope="col">Course</th><th scope="col" className="admin-num">Week</th>
            <th scope="col">Status</th><th scope="col" className="admin-num">Checks</th><th scope="col">Progress</th>
          </tr></thead>
          <tbody>{rows.map(u => (
            <tr key={u.unitId} className={sel.has(u.unitId) ? "is-selected" : ""}>
              <td><AdminRowCheck selection={sel} id={u.unitId} label={"Select " + u.title}/></td>
              <td><button type="button" className="admin-bulk-link cur-admin-title" onClick={() => openUnit(u)}>{u.title}</button>
                <div className="admin-cell-sub">{u.level ? u.level + " · " : ""}{u.materials} material{u.materials === 1 ? "" : "s"}{u.source !== "manual" ? " · " + u.source : ""}{u.version > 1 ? " · v" + u.version : ""}</div></td>
              <td>{u.course || <span className="admin-cell-sub">Whole Club</span>}</td>
              <td className="admin-num">{u.week}.{u.position}</td>
              <td><span className={"chip " + (u.status === "published" ? "chip-lime" : u.status === "retired" ? "status-archived" : "")}>{u.status}</span></td>
              <td className="admin-num">{u.checks}</td>
              <td className="admin-cell-sub">{u.progress.completed} done · {u.progress.started} started{u.progress.pending ? " · " + u.progress.pending + " to mark" : ""}{u.progress.avgPct != null ? " · avg " + u.progress.avgPct + "%" : ""}</td>
            </tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

/* A new question is a PRACTICAL one, not a multiple choice.
   The default is the answer most people give: four options is the quickest
   thing to type, and a review made of them measures whether a child can
   recognise the right words a week later, not whether they can do the
   thing. The server refuses to publish a review that is multiple choice
   alone, so defaulting to mcq was defaulting to a lesson that would be
   refused. Multiple choice is one press away, and worth having — alongside
   something they did. */
const CUR_EMPTY_CHECK = { kind: "task", prompt: "", options: ["", ""], answer: "", rubric: "", points: 3, videoUrl: "" };
/* The kinds of question, as CURR_CHECK_KINDS has them. Only multiple choice is
   marked by the computer; the rest are marked by a capable AI model against
   the rubric when one is configured for marking, and by the instructor if not
   — or whenever the AI is unsure, or the answer raises a safeguarding worry. */
const CUR_CHECK_KIND_OPTS = [["mcq", "Multiple choice"], ["short", "Written answer"], ["essay", "Essay / extended writing"],
  ["reflection", "Reflection"], ["project", "Project write-up"], ["code", "Code"], ["task", "Practical task"],
  ["watch", "Watch a video and tell me"]];
const CUR_MARK_HINT = {
  short: "Marked against the model answer — any wording that has the ideas earns the points.",
  essay: "No single right answer: marked against the rubric (a clear point, reasons, evidence).",
  reflection: "Marked for honesty and specific detail, never for the opinion. A worrying answer is held for the instructor and flagged.",
  project: "Marked from the learner's description against the rubric; a bare link waits for the instructor.",
  code: "Marked on whether it does what was asked and the logic is sound.",
  task: "Marked from the learner's account of what they did, against the rubric.",
  watch: "Marked on what only watching could produce — a detail, an example, a moment from the video — in their own words. Nothing can check that play was pressed, and a keyword gate would only check that they guessed the words.",
};

/* The markdown toolbar that used to live here — eighteen buttons over a
   textarea, inserting "## " and ```` ```keys ```` for an instructor to get
   right — is gone. Writing a lesson is now lesson-editor.jsx, where a
   heading is drawn as a heading and the piano is drawn as the piano. The
   markdown it produces is byte-for-byte what this toolbar produced, because
   the member's renderer did not change and must not. */

/**
 * What the programme asks of every lesson, checked while it is being written.
 *
 * These are the rules in api/tests/curriculum-shape.php, which fail the build
 * for the bundled courses. An instructor writing a new lesson had no way to
 * know any of them existed, so the standard lived in a test file and nowhere
 * a person could read it. Shown here, with the reason beside each — a rule
 * whose reason is not given is a rule people route around.
 *
 * ADVISORY, NEVER BLOCKING. The same shape as the Design Studio's preflight:
 * it tells you what is missing and lets you save anyway, because an
 * instructor part-way through a lesson is not writing a defect. The server
 * still validates what it validates.
 */
function lessonShape(f) {
  const body = String(f.body || ""), text = (body + " " + (f.title || "") + " " + (f.summary || "") + " " + (f.objectives || "")).toLowerCase();
  const has = (...w) => w.every(x => text.includes(x));
  return [
    { id: "review", ok: (f.checks || []).length >= 3,
      want: "Questions for next week", why: "Your class sits these at the start of the next session. Pulling a week-old lesson back out of a cold memory is what fixes it there — three questions is the floor." },
    { id: "routes", ok: has("if this is new") && has("if you already can"),
      want: "Two routes through it", why: "Ten- and seventeen-year-olds sit in the same room. A worked example that helps one of them slows the other." },
    { id: "made", ok: (f.checks || []).some(c => c.kind === "project" || c.kind === "task"),
      want: "Something made or done", why: "These are practical subjects and they are marked that way: the observed work is worth six, the written check one." },
    { id: "back", ok: /earlier|back to|again|revisit/.test(text),
      want: "The lesson itself reaches back", why: "Not only the review: the teaching should pick something up from an earlier week and use it, or the weeks never join into a skill." },
    { id: "ai", ok: /\bai\b|chatgpt|copilot/.test(text),
      want: "AI, where it is true", why: "Optional, and deliberately rare — about one lesson in four, one in eight for an instrument. Nothing can hear a child play." },
  ];
}

/**
 * The parts of an NGG Saturday, in the order they happen, read out of the
 * headings the instructor has actually written. A generic editor cannot do
 * this: it is the programme's own shape, and knowing which part is missing
 * at a glance is most of what a curriculum lead is looking for.
 *
 * Matching is loose on purpose — "Warm-up", "Warm up (10 minutes)" and
 * "Warm-up and tuning" are all the warm-up. A spine that only recognised one
 * spelling would report a part missing that is plainly there, and an
 * instructor who is told something false once stops reading it.
 */
const LESSON_SPINE = [
  { id: "review", label: "Opening review", note: "last week, before anything new" },
  { id: "warm",   label: "Warm-up",        re: /^##+\s*warm[\s-]?up/im },
  { id: "learn",  label: "Learn",          re: /^##+\s*(learn|what to do|today'?s tool|essentials|guided)/im },
  { id: "play",   label: "Play or do",     re: /^##+\s*(play|do it|practice|practise|hands[\s-]?on|workshop|make)/im },
  { id: "home",   label: "Practise at home", re: /^##+\s*(practise at home|practice at home|at home|this week'?s assignment|independent assignment)/im },
  { id: "fit",    label: "Make it fit you", re: /^##+\s*make it fit/im },
];

/* The two words that send an operator to the wrong screen (CLAUDE.md §11).
   Not a ban on the English words — "cohort completion rate" is fine. What is
   flagged is the EDITION called a cohort and a Summer PARTICIPANT called a
   student, because those two are the ones that mislead. */
const LESSON_WORDS = [
  { re: /\b(archive|close|activate|start|end|this|the|next|last)\s+(the\s+)?cohort\b/i,
    say: "“cohort” for a season", use: "A season of Summer School is an edition. A cohort, to a coordinator, means a group." },
  { re: /\bsummer(\s+school)?\s+students?\b/i,
    say: "“Summer student”", use: "Summer School has participants. Students belong to the Club." },
];

function lessonSpine(f) {
  const body = String(f.body || "");
  return LESSON_SPINE.map(p => ({
    id: p.id, label: p.label, note: p.note,
    ok: p.id === "review" ? (f.checks || []).length >= 3 : p.re.test(body),
  }));
}
function lessonWords(f) {
  const text = String(f.body || "") + " " + (f.title || "") + " " + (f.summary || "");
  return LESSON_WORDS.filter(w => w.re.test(text));
}

function CurriculumShape({ f }) {
  const rows = lessonShape(f);
  const met = rows.filter(r => r.ok).length;
  const spine = lessonSpine(f);
  const here = spine.filter(p => p.ok).length;
  const words = lessonWords(f);
  return (
    <div className="cur-check">
      <section className="cur-spine-wrap" aria-label="The session, part by part">
        <h3 className="admin-h3">The session <span className="admin-cell-sub">{here} of {spine.length} parts</span></h3>
        <ol className="cur-spine">
          {spine.map(p => (
            <li key={p.id} className={"cur-spine-p " + (p.ok ? "is-here" : "is-gone")}>
              <span className="cur-spine-dot" aria-hidden="true"/>
              <span className="cur-spine-l">{p.label}</span>
              <span className="cur-spine-s">{p.ok ? "written" : (p.note || "not written yet")}</span>
            </li>
          ))}
        </ol>
      </section>

      {!!words.length && (
        <section className="cur-words" aria-label="Words to change">
          <h3 className="admin-h3">Words to change</h3>
          {words.map((w, i) => (
            <p key={i} className="cur-word-row"><b>{w.say}</b> — {w.use}</p>
          ))}
        </section>
      )}

      <section className="cur-shape" aria-label="What the programme asks of a lesson">
        <h3 className="admin-h3">What the programme asks <span className="admin-cell-sub">{met} of {rows.length}</span></h3>
        <p className="admin-hint">Guidance, not a gate — you can save a lesson that does not meet all of these.</p>
        <ul className="cur-shape-list">
          {rows.map(r => (
            <li key={r.id} className={"cur-shape-row " + (r.ok ? "is-met" : "is-unmet")}>
              <span className="cur-shape-mark" aria-hidden="true">{r.ok ? "✓" : "○"}</span>
              <span className="cur-shape-want"><b>{r.want}</b> <span className="sr-only">{r.ok ? "— done" : "— not yet"}</span></span>
              <span className="cur-shape-why">{r.why}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* Real glyphs, not emoji. An emoji is drawn by the operating system, so the
   same toolbar is a flat pictogram on one machine and a glossy 3-D sticker on
   another — and on a Saturday at a centre those are different machines. These
   are 16px line icons on the current colour, so they inherit state. */
const LED_ICONS = {
  back:  "M10 3 4.5 8 10 13",
  x:     "M4 4l8 8M12 4l-8 8",
  eye:   "M1.6 8S4 3.6 8 3.6 14.4 8 14.4 8 12 12.4 8 12.4 1.6 8 1.6 8Z M8 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z",
  alert: "M8 2.2 15 13.6H1L8 2.2Z M8 6.6v3.1 M8 11.6v.01",
  keys:  "M2 3h12v10H2z M5.2 3v6.2 M8 3v6.2 M10.8 3v6.2",
  chord: "M3 3v10 M6 3v10 M9 3v10 M12 3v10 M3 5.4h9 M3 8.2h9 M3 11h9",
  staff: "M2 4h12 M2 6.5h12 M2 9h12 M2 11.5h12 M11.4 8.6a1.5 1.2 0 1 0 0-2.4 1.5 1.2 0 0 0 0 2.4Z",
  swatch:"M3 3h4.4v10H3z M8.6 3H13v10H8.6z M3 7.6h4.4 M8.6 10.1H13",
  steps: "M2 4.5h4 M2 8h8 M2 11.5h11",
};
function LedIcon({ name }) {
  const d = LED_ICONS[name];
  if (!d) return null;
  return (
    <svg className="led-i" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"
         fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => <path key={i} d={(i ? "M" : "") + seg}/>)}
    </svg>
  );
}

/**
 * `desk` is how the SAME editor serves two portals.
 *
 * The Control Room and an instructor's own screen were two different things:
 * a full editor here, a four-field box there. That is the wrong axis to
 * differ on — what an instructor may do is narrower than what a curriculum
 * lead may do, but what they are WRITING is the same lesson, to the same
 * standard, with the same opening review and the same two routes. A smaller
 * editor did not make the standard smaller; it just hid it.
 *
 * So the screen is one screen, and the portal supplies three things: how a
 * lesson is saved, how a file is uploaded, and whether this person may
 * publish. Every actual permission is still decided on the server.
 */
const CUR_DESK_ADMIN = {
  save: (d) => NGGApi.admin.curriculum.upsert(d).then(r => r.unit),
  upload: (f) => NGGApi.admin.curriculum.upload(f),
  ai: (d) => NGGApi.admin.curriculum.ai(d),
  canPublish: true,
};

function CurriculumEditor({ unit, courses, divisions, examRefs, canWrite, aiEnabled, desk, onClose, onSaved }) {
  const api = desk || CUR_DESK_ADMIN;
  const canPublish = api.canPublish !== false;
  const isNew = !unit.unitId;
  const [f, setF] = React.useState(() => ({
    unitId: unit.unitId || "", course: unit.course || "", level: unit.level || "", week: unit.week || 1, position: unit.position || 1,
    title: unit.title || "", summary: unit.summary || "", objectives: (unit.objectives || []).join("\n"), body: unit.body || "",
    durationMins: unit.durationMins || "", passMark: unit.passMark ?? 60, status: unit.status || "draft",
    materials: (unit.materials || []).map(m => ({ ...m })),
    checks: (unit.checks || []).map(c => ({ ...c, options: c.options && c.options.length ? c.options : ["", ""], answer: String(c.answer ?? ""), videoUrl: c.videoUrl || "" })),
  }));
  const [busy, setBusy] = React.useState("");
  const examRef = (examRefs || {})[f.course] || null;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setCheck = (i, k, v) => setF(x => ({ ...x, checks: x.checks.map((c, j) => j === i ? { ...c, [k]: v } : c) }));
  const setMat = (i, k, v) => setF(x => ({ ...x, materials: x.materials.map((m, j) => j === i ? { ...m, [k]: v } : m) }));
  const save = async () => {
    setBusy("save");
    try {
      const data = { ...f, objectives: f.objectives, checks: f.checks.map(c => ({ ...c, options: c.kind === "mcq" ? c.options.filter(o => o.trim()) : [], videoUrl: c.kind === "watch" ? (c.videoUrl || "") : "" })) };
      const saved = await api.save(data);
      toast.success(
        canPublish ? (isNew ? "Lesson created." : "Lesson saved.")
                   : (isNew ? "Saved as a draft." : "Draft saved."),
        canPublish ? (saved && saved.title) : "A curriculum lead publishes it; your class sees it then.");
      onSaved(saved);
    } catch (e) {
      toast.error(e.code === "unknown_course" ? "That course isn't in the academy catalogue" + (e.detail ? " — " + e.detail : "") + "."
        : e.code === "slot_taken" ? "Another lesson already holds week " + f.week + ", position " + f.position + " of this course."
        : (e.detail ? humanizeError(e.code, e.code) + " (" + e.detail + ")" : humanizeError(e.code, e.code)), "Not saved");
    } finally { setBusy(""); }
  };
  const draftAi = async () => {
    if (!f.title.trim() && !f.body.trim()) { toast.error("Give the lesson a title or some notes for the AI to work from."); return; }
    setBusy("ai");
    try {
      const r = await api.ai({ title: f.title, text: f.body, course: f.course, level: f.level, checks: 5 });
      // With only a title the AI writes the whole lesson in the NGG Saturday standard; real notes are never replaced.
      setF(x => ({ ...x, body: x.body.trim().length < 80 && r.draft.body ? r.draft.body : x.body, summary: x.summary || r.draft.summary, objectives: x.objectives || r.draft.objectives.join("\n"),
        checks: x.checks.concat(r.draft.checks.map(c => ({ ...c, answer: String(c.answer), options: c.options && c.options.length ? c.options : ["", ""] }))) }));
      toast.success((r.draft.body && f.body.trim().length < 80 ? "Lesson written in the NGG Saturday standard" : "Draft added") + " — read it before saving. AI checks are marked AI." + (r.note ? " " + r.note : ""), "AI draft");
    } catch (e) { toast.error(e.message && e.code === "ai_disabled" ? "No AI provider is configured (Settings → AI)." : humanizeError(e.code, e.code), "No draft"); }
    finally { setBusy(""); }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy("upload");
    try {
      const r = await api.upload(file);
      setF(x => ({ ...x, materials: x.materials.concat([{ title: file.name.replace(/\.[^.]+$/, ""), url: r.url, kind: r.kind }]) }));
      toast.success("Uploaded — save the lesson to keep it.", file.name);
    } catch (e) { toast.error(e.code === "bad_type" ? "That file type isn't allowed (" + (e.detail || "") + ")." : e.code === "too_large" ? "That file is larger than 25 MB." : humanizeError(e.code, e.code), "Upload failed"); }
    finally { setBusy(""); }
  };
  const ro = !canWrite;
  return (
    <div className={"led" + (ro ? " is-readonly" : "")}>

      {/* One bar, always in reach: where you are, what state it is in, and
          the only two actions that matter. It used to be a back link at the
          top and a save button somewhere in the middle of the page. */}
      <header className="led-top">
        <button type="button" className="led-back" onClick={onClose} aria-label="Back to all lessons">
          <LedIcon name="back"/><span>All lessons</span>
        </button>
        <div className="led-ident">
          <input className="led-title" value={f.title} disabled={ro} aria-label="Lesson title"
                 onChange={e => set("title", e.target.value)} placeholder="Name this lesson"/>
          <p className="led-sub">{isNew ? "New lesson" : unit.unitId + " · version " + unit.version + (unit.publishedAt ? " · published " + fmtDate(unit.publishedAt) : "")}</p>
        </div>
        {!ro && <div className="led-act">
          {canPublish
            ? <label className="led-status">
                <span className="sr-only">Status</span>
                <select className="admin-select" value={f.status} onChange={e => set("status", e.target.value)}>
                  <option value="draft">Draft — staff only</option>
                  <option value="published">Published — members see it</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
            /* Not a disabled select saying "Published" they cannot choose —
               a control that cannot act is not left on the screen. */
            : <span className="led-draftnote">Saves as a draft · a curriculum lead publishes it</span>}
          <button className="btn btn-primary" disabled={!!busy} onClick={save}>
            {busy === "save" ? "Saving…" : canPublish ? (isNew ? "Create lesson" : "Save lesson") : (isNew ? "Save for review" : "Save draft")}
          </button>
        </div>}
      </header>

      <div className="led-work">
        <div className="led-write">

          {/* Who it is for, and where it sits. Three fields that are always
              decided; the rest are folded away because they are almost always
              already right. Nine fields in a row was the whole of the old
              screen's first impression. */}
          <section className="led-card" aria-label="Placement">
            <div className={"led-row3" + (canPublish ? "" : " is-two")}>
              <label className="led-f"><span>Who it is for</span>
                <select className="admin-select" value={f.course} disabled={ro} onChange={e => set("course", e.target.value)}>
                  <option value="">Whole Club — every member</option>
                  {!!(divisions || []).length && <optgroup label="A whole division">
                    {(divisions || []).map(dv => <option key={dv} value={dv}>{dv}</option>)}
                  </optgroup>}
                  <optgroup label="One course">
                    {(f.course && !courses.includes(f.course) && !(divisions || []).includes(f.course) ? [f.course, ...courses] : courses)
                      .map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                </select></label>
              <label className="led-f"><span>Week</span>
                <input className="admin-input" type="number" min={1} max={104} value={f.week} disabled={ro} onChange={e => set("week", e.target.value)}/></label>
              {/* Placing a lesson inside a week is a curriculum lead's act, and
                  the server chooses it for anyone else — so for them the field
                  cannot act, and is not drawn. */}
              {canPublish && <label className="led-f"><span>Session in that week</span>
                <input className="admin-input" type="number" min={1} max={50} value={f.position} disabled={ro} onChange={e => set("position", e.target.value)}/></label>}
            </div>
            <details className="led-more">
              <summary>Level, length and pass mark</summary>
              <div className="led-row3">
                <label className="led-f"><span>Level</span>
                  <input className="admin-input" value={f.level} disabled={ro} onChange={e => set("level", e.target.value)} placeholder="Year 1 · Foundation"/></label>
                <label className="led-f"><span>Minutes</span>
                  <input className="admin-input" type="number" min={0} max={600} value={f.durationMins} disabled={ro} onChange={e => set("durationMins", e.target.value)}/></label>
                <label className="led-f"><span>Pass mark %</span>
                  <input className="admin-input" type="number" min={0} max={100} value={f.passMark} disabled={ro} onChange={e => set("passMark", e.target.value)}/></label>
              </div>
            </details>
          </section>

          <section className="led-card" aria-label="Summary and objectives">
            <label className="led-f"><span>The two sentences a member reads first</span>
              <textarea className="admin-input" rows={2} value={f.summary} disabled={ro}
                        onChange={e => set("summary", e.target.value)} placeholder="What this session is, in plain words."/></label>
            <label className="led-f"><span>What they will be able to do — one per line</span>
              <textarea className="admin-input" rows={3} value={f.objectives} disabled={ro}
                        onChange={e => set("objectives", e.target.value)}
                        placeholder={"You will find middle C\nYou will play a C major scale"}/></label>
            <p className="led-hint">These three become the exam's marking rubric, two marks each.</p>
          </section>

          /* THE OPENING REVIEW.
           *
           * Written HERE, with this lesson, by the person who knows what it
           * taught — and sat at the START OF THE NEXT SESSION, a week later,
           * before anything new is taught.
           *
           * Those are two different moments on purpose, and it is worth
           * being plain about why, because the obvious design is to ask at
           * the end of the hour. A test at the end measures the hour that
           * just happened, with everything still in the room and still on
           * the whiteboard. A test a week later measures what survived the
           * week — and the act of pulling it back out of a cold memory is
           * itself the thing that fixes it there.
           *
           * So the questions belong to THIS lesson, the sitting belongs to
           * the next one, and an empty set is drawn as a problem because it
           * means a week's teaching will never be asked about again. */
          <section className={"led-card led-exam" + (f.checks.length ? "" : " is-missing")} aria-label="The opening review">
            <h3 className="led-h">The opening review <span className="led-count">{f.checks.length}</span></h3>
            <p className="led-hint">Written here, with this lesson. Your class sits it at the <b>start of the next session</b>, a week later, before anything new is taught.</p>
            {/* The standard, named. An instructor writing by hand is held to
                what the AI drafter is held to — the same map, one source. */}
            {!!examRef && <p className="led-ref">
              <b>{examRef.body}</b> assesses {f.course} by {examRef.assesses}. For a question here, {examRef.ask}.
              {" "}<a href={examRef.link} target="_blank" rel="noopener noreferrer">{examRef.award}</a>
            </p>}
            {!f.checks.length ? null : !f.checks.some(c => c.kind !== "mcq") && (
              <p className="led-warn"><LedIcon name="alert"/> Every question here is multiple choice. A week later that shows whether they can recognise an answer, not whether they can do it — add one that asks them to make, play or explain something. This will not publish as it is.</p>
            )}
            {!f.checks.length
              ? <p className="led-warn"><LedIcon name="alert"/> No questions yet — so nothing from this session is ever asked about again. A week later your class walks into the next one with this one already fading.</p>
              : <p className="led-hint">{f.checks.reduce((n, c) => n + (Number(c.points) || 1), 0)} marks · passes at {f.passMark}%</p>}
            {/* A QUESTION IS A BLOCK, like everything else in this editor.
                What was here was a form: a full-width native dropdown, a bare
                number beside a bare ×, and two textareas whose placeholders
                were doing the work of labels — so the lesson above was a
                writing surface and the exam below it was a 2014 admin panel
                on the same screen. Placeholders are not labels (they vanish
                when you type, and a screen reader is left with nothing), so
                every field here has one. */}
            {f.checks.map((c, i) => {
              const marking = CUR_MARK_HINT[c.kind] || "";
              const kindLabel = (CUR_CHECK_KIND_OPTS.find(([k]) => k === c.kind) || [, c.kind])[1];
              const badVideo = c.kind === "watch" && c.videoUrl && !curVideoEmbed(c.videoUrl);
              return (
                <article key={c.checkId || i} className={"lq" + (c.kind === "mcq" ? " is-mcq" : "")} aria-label={"Question " + (i + 1) + " — " + kindLabel}>
                  <header className="lq-top">
                    <span className="lq-n" aria-hidden="true">{i + 1}</span>
                    <label className="lq-kind">
                      <span className="sr-only">{"What question " + (i + 1) + " asks for"}</span>
                      <select value={c.kind} onChange={e => setCheck(i, "kind", e.target.value)} disabled={ro}>
                        {CUR_CHECK_KIND_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </label>
                    <label className="lq-pts">
                      <span>Marks</span>
                      <input type="number" min={1} max={20} value={c.points}
                             onChange={e => setCheck(i, "points", e.target.value)} disabled={ro}
                             aria-label={"Marks for question " + (i + 1)}/>
                    </label>
                    {c.source === "ai" && <span className="lq-ai" title="Written by the AI — read it before publishing">AI</span>}
                    {!ro && <button type="button" className="lq-del" aria-label={"Remove question " + (i + 1)}
                      onClick={() => setF(x => ({ ...x, checks: x.checks.filter((_, j) => j !== i) }))}><LedIcon name="x"/></button>}
                  </header>

                  <label className="lq-f lq-ask">
                    <span>What you are asking</span>
                    <textarea rows={2} value={c.prompt} onChange={e => setCheck(i, "prompt", e.target.value)} disabled={ro}
                              placeholder={c.kind === "watch" ? "What did her thumb do before the hand moved?" : "Ask it the way you would say it out loud"}/>
                  </label>

                  {c.kind === "mcq" ? (
                    <div className="lq-opts">
                      <span className="lq-label" id={"lqo-" + i}>The options — tick the right one</span>
                      <ul role="radiogroup" aria-labelledby={"lqo-" + i}>
                        {c.options.map((o, k) => {
                          const right = String(k) === String(c.answer);
                          return (
                            <li key={k} className={"lq-opt" + (right ? " is-right" : "")}>
                              <label className="lq-tick">
                                <input type="radio" name={"ans-" + i} checked={right} disabled={ro}
                                       onChange={() => setCheck(i, "answer", String(k))}
                                       aria-label={"Option " + (k + 1) + " is the right answer"}/>
                                <span aria-hidden="true"/>
                              </label>
                              <input className="lq-opt-text" value={o} disabled={ro}
                                     onChange={e => setCheck(i, "options", c.options.map((x, j) => j === k ? e.target.value : x))}
                                     placeholder={"Option " + (k + 1)} aria-label={"Option " + (k + 1)}/>
                              {!ro && c.options.length > 2 && <button type="button" className="lq-del" aria-label={"Remove option " + (k + 1)}
                                onClick={() => setF(x => ({ ...x, checks: x.checks.map((cc, j) => j !== i ? cc : { ...cc, options: cc.options.filter((_, kk) => kk !== k), answer: String(Number(cc.answer) === k ? 0 : Number(cc.answer) > k ? Number(cc.answer) - 1 : Number(cc.answer)) }) }))}><LedIcon name="x"/></button>}
                            </li>
                          );
                        })}
                      </ul>
                      {!ro && c.options.length < 8 && <button type="button" className="lq-add" onClick={() => setCheck(i, "options", c.options.concat([""]))}>Add an option</button>}
                    </div>
                  ) : (
                    <div className="lq-mark">
                      {/* Only a 'watch' question carries a video, and it must:
                          a question about a film nobody was shown is a question
                          nobody can answer, so it is refused on save. */}
                      {c.kind === "watch" && (
                        <label className="lq-f lq-video">
                          <span>The video they watch</span>
                          <input value={c.videoUrl || ""} inputMode="url" disabled={ro}
                                 placeholder="https://www.youtube.com/watch?v=…"
                                 aria-invalid={badVideo ? "true" : undefined}
                                 aria-label={"Video for question " + (i + 1)}
                                 onChange={e => setCheck(i, "videoUrl", e.target.value.trim())}/>
                          {badVideo
                            ? <em className="lq-bad" role="alert">That is not a YouTube or Vimeo link — the exam can only play those.</em>
                            : <em className="lq-note">It plays inside the exam, so they never leave the question to find it.</em>}
                        </label>
                      )}
                      <label className="lq-f lq-model">
                        <span>{c.kind === "reflection" ? "What a thoughtful answer touches on" : "What full marks looks like"}</span>
                        <textarea rows={2} value={c.answer} onChange={e => setCheck(i, "answer", e.target.value)} disabled={ro}
                          placeholder={c.kind === "short" ? "The ideas it has to contain, in any wording"
                            : c.kind === "reflection" ? "There is no right answer here — say what an honest one would mention"
                            : c.kind === "watch" ? "Something only somebody who actually watched it could say"
                            : "What a strong answer includes"}/>
                      </label>
                      <label className="lq-f lq-rubric">
                        <span>How the marks are earned</span>
                        <textarea rows={2} value={c.rubric} onChange={e => setCheck(i, "rubric", e.target.value)} disabled={ro}
                          placeholder={"Up to " + (Number(c.points) || 1) + ": what earns each one"}/>
                      </label>
                      {!!marking && <p className="lq-hint">{marking}</p>}
                    </div>
                  )}
                </article>
              );
            })}
            {!ro && <div className="led-add">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(x => ({ ...x, checks: x.checks.concat([{ ...CUR_EMPTY_CHECK }]) }))}>Add a question</button>
              {!!api.ai && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !aiEnabled} onClick={draftAi}
                title={aiEnabled ? "Drafts a summary, objectives and five review questions from the title and the lesson" : "No AI provider is configured (Settings → AI)"}>
                {busy === "ai" ? "Writing…" : f.body.trim().length < 80 ? "Write the lesson with AI" : "Draft the review with AI"}</button>}
            </div>}
          </section>

          <section className="led-card led-card-wide" aria-label="The lesson">
            <h3 className="led-h" id="led-lesson-h">The lesson</h3>
            <LessonBlockEditor value={f.body} onChange={v => set("body", v)} readOnly={ro} labelledBy="led-lesson-h"
                               onUpload={async (file) => {
                                 try { const r = await api.upload(file); return r.url; }
                                 catch (e) { toast.error(e.code === "too_large" ? "That image is over 25 MB." : humanizeError(e.code, e.code)); return ""; }
                               }}/>
          </section>

          <section className="led-card" aria-label="Materials">
            <h3 className="led-h">Materials <span className="led-count">{f.materials.length}</span></h3>
            {!f.materials.length && <p className="led-hint">Nothing attached. Lessons work without materials — a link or a worksheet is a bonus, not a requirement.</p>}
            {f.materials.map((m, i) => (
              <div key={i} className="led-mat">
                <input className="admin-input" value={m.title} onChange={e => setMat(i, "title", e.target.value)} aria-label={"Material " + (i + 1) + " title"} placeholder="What it is" disabled={ro}/>
                <input className="admin-input" value={m.url} onChange={e => setMat(i, "url", e.target.value)} aria-label={"Material " + (i + 1) + " link"} placeholder="https://…" disabled={ro}/>
                <input className="admin-input led-mat-guide" value={m.guide || ""} maxLength={240} onChange={e => setMat(i, "guide", e.target.value)} aria-label={"Material " + (i + 1) + ": what the learner should do with it"} placeholder="What to do with it — e.g. “Do the first three exercises, then check yourself”" disabled={ro}/>
                <span className="chip">{m.kind || "link"}</span>
                {!ro && <button type="button" className="led-x" aria-label={"Remove " + (m.title || "material " + (i + 1))}
                  onClick={() => setF(x => ({ ...x, materials: x.materials.filter((_, j) => j !== i) }))}><LedIcon name="x"/></button>}
              </div>
            ))}
            {!ro && <div className="led-add">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(x => ({ ...x, materials: x.materials.concat([{ title: "", url: "", kind: "link" }]) }))}>Add a link</button>
              <label className="btn btn-ghost btn-sm led-upload">{busy === "upload" ? "Uploading…" : "Upload a file"}
                <input type="file" className="sr-only" accept={CUR_FILE_ACCEPT}
                  onChange={e => { upload(e.target.files && e.target.files[0]); e.target.value = ""; }} disabled={!!busy}/></label>
              <span className="led-hint">Documents, sheets, images, audio, video, code · up to 25 MB</span>
            </div>}
          </section>

        </div>

        {/* There was a live copy of the member's page here, beside the text.
            It is gone because the editor now DRAWS the lesson rather than its
            markup — a heading is a heading and the piano is the piano — so a
            second rendering of the same words showed nothing the first one
            did not, and re-ran the whole renderer on every keystroke.
            What the rail holds instead is the part the writing surface
            genuinely cannot show you: whether the lesson meets the standard
            the programme asks of it. */}
        <aside className="led-see" aria-label="How this lesson is shaping up">
          <CurriculumShape f={f}/>
        </aside>
      </div>
    </div>
  );
}

function curriculumParseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  /* Excel saves "CSV" with semicolons where the comma is the decimal mark, and
     some sheets are pasted as tabs. The header line says which. */
  const first = s.split(/\r?\n/, 1)[0] || "";
  const cnt = (ch) => first.split(ch).length - 1;
  const sep = cnt(",") >= cnt(";") && cnt(",") >= cnt("\t") ? "," : (cnt(";") >= cnt("\t") ? ";" : "\t");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => String(c).trim() !== ""));
  if (!clean.length) return [];
  const head = clean[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  return clean.slice(1).map(r => { const o = {}; head.forEach((h, k) => { o[h] = (r[k] ?? "").trim(); }); return o; });
}

/* An .xlsx workbook's first sheet → the same objects curriculumParseCsv gives
   (header row → keys). Read in the browser with JSZip; numbers come back as
   typed, so an Excel date arrives as a serial and the caller converts it. */
async function readXlsxRows(buf) {
  const JSZip = await loadVendor("jszip");
  const zip = await JSZip.loadAsync(buf);
  const xml = async (p) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null; };
  const shared = [];
  const ss = await xml("xl/sharedStrings.xml");
  if (ss) Array.from(ss.getElementsByTagName("si")).forEach(si => shared.push(Array.from(si.getElementsByTagName("t")).map(t => t.textContent).join("")));
  // The first sheet in the workbook's own order, not whichever file is sheet1.
  let path = "xl/worksheets/sheet1.xml";
  const wb = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
  const firstSheet = wb && wb.getElementsByTagName("sheet")[0];
  if (firstSheet && rels) {
    const rid = firstSheet.getAttribute("r:id") || firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === rid);
    if (rel) { const t = rel.getAttribute("Target").replace(/^\//, ""); path = t.startsWith("xl/") ? t : "xl/" + t; }
  }
  const sheet = await xml(path);
  if (!sheet) throw new Error("That workbook has no sheet I can read.");
  const colIdx = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const grid = Array.from(sheet.getElementsByTagName("row")).map(r => {
    const out = [];
    Array.from(r.getElementsByTagName("c")).forEach(c => {
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
      let val = "";
      if (t === "s") val = shared[+((v && v.textContent) || 0)] || "";
      else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map(x => x.textContent).join("");
      else val = v ? v.textContent : "";
      out[colIdx(c.getAttribute("r"))] = String(val).trim();
    });
    return Array.from(out, x => x || "");
  }).filter(r => r.some(x => x !== ""));
  if (!grid.length) return [];
  const head = grid[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  return grid.slice(1).map(r => { const o = {}; head.forEach((h, k) => { if (h) o[h] = (r[k] ?? "").trim(); }); return o; });
}
/** Any sheet a person is likely to have: .xlsx, or CSV with commas, semicolons or tabs. */
async function readSheetFile(file) {
  if (/\.xlsx$/i.test(file.name)) return readXlsxRows(await file.arrayBuffer());
  if (/\.(xls|numbers|pdf|docx?)$/i.test(file.name)) throw new Error("That file type can't be read here. In Excel or Google Sheets choose File → Download → CSV (or save as .xlsx) and choose that file.");
  return curriculumParseCsv(await file.text());
}

/* One spreadsheet row → the lesson shape the server validates. Flexible on
   column names, because a sheet typed by a person says "Lesson", "Order" or
   "Q1 options". Checks come as check1, check1_options (a|b|c), check1_answer,
   check1_rubric, check1_points, up to check10. */
function curriculumRowFromSheet(r) {
  const pick = (...ks) => { for (const k of ks) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; };
  const checks = [];
  for (let n = 1; n <= 10; n++) {
    const prompt = pick("check" + n, "q" + n, "question" + n, "check_" + n);
    if (!prompt) continue;
    const opts = pick("check" + n + "_options", "q" + n + "_options", "question" + n + "_options");
    checks.push({ prompt, kind: opts ? "mcq" : "short", options: opts ? opts.split("|").map(x => x.trim()).filter(Boolean) : [],
      answer: pick("check" + n + "_answer", "q" + n + "_answer", "question" + n + "_answer"),
      rubric: pick("check" + n + "_rubric", "q" + n + "_rubric"), points: Number(pick("check" + n + "_points", "q" + n + "_points")) || 1 });
  }
  const mats = pick("materials", "material", "material_url", "materials_urls");
  return {
    course: pick("course", "subject"), level: pick("level", "stage"), week: Number(pick("week")) || 1,
    position: Number(pick("position", "order", "lesson_no", "lesson_number")) || 1,
    title: pick("title", "lesson", "lesson_title", "topic"), summary: pick("summary", "overview"),
    objectives: pick("objectives", "learning_objectives", "outcomes"), body: pick("body", "content", "notes", "lesson_notes"),
    durationMins: Number(pick("duration", "duration_mins", "minutes")) || 0, passMark: pick("pass_mark", "passmark") === "" ? undefined : Number(pick("pass_mark", "passmark")),
    materials: mats ? mats.split(/\s*;;\s*|\n/).filter(Boolean).map(x => { const [url, title] = x.split("|").map(y => y.trim()); return { url, title: title || "" }; }) : [],
    checks,
  };
}

const CUR_CSV_TEMPLATE = "course,level,week,position,title,summary,objectives,body,duration,materials,check1,check1_options,check1_answer,check2,check2_answer,check2_rubric\n"
  + "Piano,Foundation,1,1,Finding middle C,Where the keyboard starts.,Find middle C; Play C major,\"Middle C sits in the centre of the keyboard.\n\n- Find the two black keys\n- C is just left of them\",30,https://example.org/c-major.pdf|Scale sheet,How many white keys in an octave?,5|7|8,7,Why curve your fingers?,Control and speed,Mentions control or speed\n";

function CurriculumImport() {
  const [rows, setRows] = React.useState(null);
  const [name, setName] = React.useState("");
  const [opts, setOpts] = React.useState({ publish: false, allowNewCourse: false });
  const [plan, setPlan] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const read = async (file) => {
    if (!file) return;
    setErr(""); setPlan(null);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const out = (await readXlsxRows(await file.arrayBuffer())).map(curriculumRowFromSheet);
        if (!out.length) throw new Error("No lessons found in that file.");
        setRows(out); setName(file.name); return;
      }
      const text = await file.text();
      let out;
      if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
        const j = JSON.parse(text);
        out = Array.isArray(j) ? j : (j.units || j.lessons || []);
      } else {
        out = curriculumParseCsv(text).map(curriculumRowFromSheet);
      }
      if (!out.length) throw new Error("No lessons found in that file.");
      setRows(out); setName(file.name);
    } catch (e) { setRows(null); setErr(e.message || "Couldn't read that file."); }
  };
  /* Courses that ship with the platform. Loading one only fills the same
     check-then-import flow as a file — nothing is written until Import. */
  const [seeds, setSeeds] = React.useState(null);
  React.useEffect(() => { NGGApi.admin.curriculum.seed().then(r => setSeeds(r.seeds || [])).catch(() => setSeeds([])); }, []);
  const loadSeed = async (s) => {
    setErr(""); setPlan(null); setBusy("seed:" + s.key);
    try { const r = await NGGApi.admin.curriculum.seed(s.key); setRows(r.rows); setName(r.title); if (r.allowNewCourse) setOpts(o => ({ ...o, allowNewCourse: true })); }
    catch (e) { setErr(humanizeError(e.code, e.code)); }
    finally { setBusy(""); }
  };
  const check = async () => {
    setBusy("check");
    try { setPlan(await NGGApi.admin.curriculum.importRows(rows, { dryRun: true, ...opts })); }
    catch (e) { toast.error(e.code === "too_many" ? "That is more than 1,000 lessons — split the file." : humanizeError(e.code, e.code)); }
    finally { setBusy(""); }
  };
  const apply = async () => {
    const n = plan.tally.create + plan.tally.update;
    if (!(await dialog.confirm({ title: "Import " + n + " lesson" + (n === 1 ? "" : "s") + "?", body: plan.tally.create + " new · " + plan.tally.update + " updated · " + plan.tally.unchanged + " unchanged · " + plan.tally.failed + " refused (not imported).", cta: "Import" }))) return;
    setBusy("apply");
    try {
      const r = await NGGApi.admin.curriculum.importRows(rows, { digest: plan.digest, ...opts });
      setPlan(r);
      toast.success(r.tally.create + " created · " + r.tally.update + " updated.", "Curriculum imported");
    } catch (e) { toast.error(e.code === "import_changed" ? "The file changed since it was checked — check it again." : humanizeError(e.code, e.code)); }
    finally { setBusy(""); }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([CUR_CSV_TEMPLATE], { type: "text/csv" }));
    a.download = "ngg-curriculum-template.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="cur-imp">
      <p className="admin-hint">Upload a CSV (from Excel or Google Sheets) or a JSON file of lessons. Each lesson is matched on course, level, week and position — importing a corrected file updates those lessons instead of adding copies. Nothing is written until you have checked the file and pressed Import.</p>
      <div className="cur-ed-row">
        <label className="btn btn-ghost btn-sm">Choose a file
          <input type="file" className="sr-only" accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { read(e.target.files && e.target.files[0]); e.target.value = ""; }}/></label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={download}>Download the CSV template</button>
        {name && <span className="admin-cell-sub">{name} · {rows ? rows.length : 0} lesson{rows && rows.length === 1 ? "" : "s"}</span>}
      </div>
      {seeds && seeds.length > 0 && (
        <div className="cur-imp-seeds">
          <h4 className="admin-h4">Courses that come with the platform</h4>
          {seeds.map(s => (
            <div key={s.key} className="cur-imp-seed">
              <div><b>{s.title}</b> <span className="admin-cell-sub">· {s.lessons} lessons</span>
                {s.description && <p className="admin-cell-sub">{s.description}</p>}</div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => loadSeed(s)}>{busy === "seed:" + s.key ? "Loading…" : "Load to check"}</button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="admin-form-err" role="alert">{err}</p>}
      {rows && <div className="cur-ed-row">
        <label className="cur-imp-opt"><input type="checkbox" checked={opts.publish} onChange={e => { setOpts(o => ({ ...o, publish: e.target.checked })); setPlan(null); }}/> Publish new lessons straight away</label>
        <label className="cur-imp-opt"><input type="checkbox" checked={opts.allowNewCourse} onChange={e => { setOpts(o => ({ ...o, allowNewCourse: e.target.checked })); setPlan(null); }}/> Allow courses not in the academy catalogue</label>
        <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={check}>{busy === "check" ? "Checking…" : "Check the file"}</button>
      </div>}
      {plan && (
        <div className="cur-imp-plan">
          <p className="cur-imp-tally" aria-live="polite">
            <b>{plan.tally.create}</b> new · <b>{plan.tally.update}</b> updated · <b>{plan.tally.unchanged}</b> unchanged · <b>{plan.tally.failed}</b> refused{plan.dryRun ? " — nothing written yet." : " — imported."}
          </p>
          {plan.dryRun && plan.tally.create + plan.tally.update > 0 && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={apply}>{busy === "apply" ? "Importing…" : "Import"}</button>}
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th scope="col" className="admin-num">Row</th><th scope="col">Lesson</th><th scope="col">Course · week</th><th scope="col">Result</th></tr></thead>
            <tbody>{plan.rows.map(r => (
              <tr key={r.row}><td className="admin-num">{r.row}</td><td>{r.title || "—"}</td>
                <td className="admin-cell-sub">{r.course !== undefined ? (r.course || "Whole Club") + " · " + r.week + "." + r.position : ""}</td>
                <td>{r.verdict === "failed" ? <span className="chip status-archived" title={r.detail}>refused: {String(r.error).replace(/_/g, " ")}{r.detail ? " — " + r.detail : ""}</span>
                  : <span className={"chip " + (r.verdict === "create" ? "chip-lime" : r.verdict === "update" ? "chip-gold" : "")}>{r.verdict}</span>}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function CurriculumProgress() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [course, setCourse] = React.useState("");
  const [courses, setCourses] = React.useState([]);
  const load = React.useCallback(() => { setErr(""); return NGGApi.admin.curriculum.report({ course }).then(setD).catch(e => setErr(e.code || e.message)); }, [course]);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { NGGApi.admin.curriculum.list({}).then(r => setCourses(r.courses || [])).catch(() => {}); }, []);
  return (
    <div>
      <div className="admin-filters cur-admin-filters">
        <select className="admin-select" value={course} onChange={e => setCourse(e.target.value)} aria-label="Course">
          <option value="">Every course</option>{courses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {d && d.scoped && <span className="admin-cell-sub">Your centres only.</span>}
      </div>
      <CurriculumSchedule onSaved={load}/>
      {d && d.overdue && d.overdue.length > 0 && (
        <section className="cur-behind" aria-labelledby="cur-behind-h">
          <h3 id="cur-behind-h" className="admin-h3">Behind — {d.overdue.length} member{d.overdue.length === 1 ? "" : "s"} with overdue assessments</h3>
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th scope="col">Member</th><th scope="col">Centre · course</th><th scope="col" className="admin-num">Overdue</th><th scope="col" className="admin-num">Longest</th><th scope="col">Lessons</th><th scope="col" className="admin-num">Fined</th></tr></thead>
            <tbody>{d.overdue.map(m => (
              <tr key={m.memberId}>
                <td>{m.fullName}<div className="admin-cell-sub">{m.displayId || m.memberId}</div></td>
                <td className="admin-cell-sub">{m.centre || "—"} · {m.track || "—"}</td>
                <td className="admin-num">{m.overdue}</td>
                <td className="admin-num">{m.worstDays} day{m.worstDays === 1 ? "" : "s"}</td>
                <td className="admin-cell-sub">{m.lessons.join(", ")}{m.overdue > m.lessons.length ? "…" : ""}</td>
                <td className="admin-num">{m.finedAmount ? naira(m.finedAmount) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      {err ? <ErrorState title="Couldn't load progress" code={err} onRetry={load}/> : !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        !d.units.length ? <div className="admin-empty">No published lessons{course ? " for " + course : ""} yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <caption className="sr-only">Progress through the published curriculum</caption>
          <thead><tr><th scope="col">Lesson</th><th scope="col">Course</th><th scope="col">Completed</th><th scope="col" className="admin-num">Started</th><th scope="col" className="admin-num">To mark</th><th scope="col" className="admin-num">Avg best</th></tr></thead>
          <tbody>{d.units.map(u => {
            const pct = u.audience ? Math.round(u.completed / u.audience * 100) : 0;
            return (
              <tr key={u.unitId}>
                <td>W{u.week}.{u.position} · {u.title}</td>
                <td>{u.course || <span className="admin-cell-sub">Whole Club</span>}</td>
                <td><div className="cur-bar" role="img" aria-label={u.completed + " of " + u.audience + " completed"}><span style={{ width: pct + "%" }}/></div>
                  <span className="admin-cell-sub">{u.completed} of {u.audience} ({pct}%)</span></td>
                <td className="admin-num">{u.started}</td>
                <td className="admin-num">{u.pending || ""}</td>
                <td className="admin-num">{u.avgPct != null ? u.avgPct + "%" : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table></div>}
    </div>
  );
}

/* The term, and what an undone assessment costs. Reminders and fines are
   sent by the server's own clock (domain/curriculum.php, curriculum_due_run);
   this only sets the rules. Changing the fine needs the fees permission. */
function CurriculumSchedule({ onSaved }) {
  const [s, setS] = React.useState(null);
  const [orig, setOrig] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Open on arrival when no term is set; never re-collapsed by typing a date.
  const [startOpen, setStartOpen] = React.useState(null);
  const load = React.useCallback(() => { setErr(""); NGGApi.admin.curriculum.schedule().then(r => { setS(r.schedule); setOrig(JSON.stringify(r.schedule)); setStartOpen(o => o === null ? !r.schedule.startDate : o); }).catch(e => setErr(e.code || e.message)); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <ErrorState title="Couldn't load the term" code={err} onRetry={load}/>;
  if (!s) return null;
  const set = (k, v) => setS(o => ({ ...o, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.curriculum.scheduleSave(s); setS(r.schedule); setOrig(JSON.stringify(r.schedule)); toast.success("Deadlines saved."); onSaved && onSaved(); }
    catch (e) { toast.error(e.code === "fees_cap_required" ? "Changing the fine needs the Dues & fees permission." : humanizeError(e.code, e.code)); }
    finally { setBusy(false); }
  };
  return (
    <details className="cur-sched" open={!!startOpen}>
      <summary>Deadlines, reminders and fines{s.startDate ? " — term began " + s.startDate : " — not set: nothing is due yet"}</summary>
      <p className="admin-hint">With the review on, a member opening a session sits the previous session&rsquo;s questions first, from memory, before today&rsquo;s teaching — they can always skip to the lesson. A lesson with checks in week N is due N weeks after the term starts — or after the member joined, if later. Members (and the parent on their record) are reminded by email while anything is outstanding, from a few days before it is due; an assessment left undone past the fine window is fined once, on their account.</p>
      <div className="admin-fields cur-sched-grid">
        <label className="admin-field admin-field-check"><input type="checkbox" checked={!!s.enabled} onChange={e => set("enabled", e.target.checked)}/><span>Deadlines on</span></label>
        {/* The opening review, on or off for the whole Club. On is the
            programme's position; off is for a short holiday course, or a
            term whose rota has nobody to mark. The questions stay on the
            lessons either way — only the sitting moves. */}
        <label className="admin-field admin-field-check"><input type="checkbox" checked={s.reviewAtStart !== false} onChange={e => set("reviewAtStart", e.target.checked)}/><span>Open each session with last week&rsquo;s review</span></label>
        <label className="admin-field"><span>Term starts</span><input type="date" className="admin-input" value={s.startDate || ""} onChange={e => set("startDate", e.target.value)}/></label>
        <label className="admin-field"><span>Remind from (days before due)</span><input type="number" min={0} max={30} className="admin-input" value={s.remindBeforeDays} onChange={e => set("remindBeforeDays", Number(e.target.value))}/></label>
        <label className="admin-field"><span>Remind every (days)</span><input type="number" min={1} max={30} className="admin-input" value={s.remindEveryDays} onChange={e => set("remindEveryDays", Number(e.target.value))}/></label>
        <label className="admin-field"><span>Fine after (days overdue)</span><input type="number" min={1} max={60} className="admin-input" value={s.fineAfterDays} onChange={e => set("fineAfterDays", Number(e.target.value))}/></label>
        <label className="admin-field"><span>Fine (₦, 0 = none)</span><input type="number" min={0} step={100} className="admin-input" value={s.fineAmount} onChange={e => set("fineAmount", Number(e.target.value))}/></label>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy || JSON.stringify(s) === orig} onClick={save}>{busy ? "Saving…" : "Save deadlines"}</button>
    </details>
  );
}

/* ── The companion board: who needs support this week ──────────────────────
   Each NGG member's weekly check-in (domain/companion.php), at-risk first. The
   rating is rules, with its reasons on the row; Re-assess redoes it now (after
   a correction to a register or a mark). */
const COMPANION_RATING_LABEL = { on_track: "On track", watch: "Watch", at_risk: "Needs support" };
function AdminCompanion() {
  const [rating, setRating] = React.useState("");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => { setErr(""); return NGGApi.admin.companion.board(rating).then(setD).catch(e => setErr(e.code || e.message)); }, [rating]);
  React.useEffect(() => { load(); }, [load]);
  const rows = (d && d.rows) || [];
  const sel = useAdminSelection(rows, r => r.memberId);
  const actions = [
    { id: "assess", label: "Re-assess now", pastTense: "re-assessed", reload: load,
      confirm: ({ count }) => ({ title: "Re-assess " + count + " member" + (count === 1 ? "" : "s") + "?", body: "Their check-in for this week is worked out again from today's record. It is not emailed again.", cta: "Re-assess" }),
      run: (ids) => NGGApi.admin.companion.assess(ids) },
  ];
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Companion check-ins</h2></div>
      <p className="admin-hint">Every week the companion looks at each NGG member's last four weeks — attendance, sign-outs, curriculum and conduct — rates them by fixed rules, and writes them a short note (by AI when it is set up) with what is going well and what to do next. Members and their parents get it by email. Those who need support are listed first, with the reasons.</p>
      {d && <p className="admin-cell-sub" role="status">Week of {d.period}: {d.counts.at_risk} need support · {d.counts.watch} to watch · {d.counts.on_track} on track · {d.members - (d.counts.at_risk + d.counts.watch + d.counts.on_track)} not assessed yet{d.scoped ? " · your centres only" : ""}.</p>}
      <div className="admin-filters" role="group" aria-label="Filter by rating">
        {[["", "Everyone"], ["at_risk", "Needs support"], ["watch", "Watch"], ["on_track", "On track"]].map(([k, l]) => (
          <button key={k || "all"} className={"btn btn-sm " + (rating === k ? "btn-primary" : "btn-ghost")} aria-pressed={rating === k} onClick={() => { setRating(k); sel.clear(); }}>{l}</button>
        ))}
      </div>
      <AdminBulkBar selection={sel} noun="member" actions={actions}/>
      {err ? <ErrorState title="Couldn't load the companion board" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        !rows.length ? <div className="admin-empty">No check-ins {rating ? "with that rating " : ""}yet this week. They are worked out through the week, a few at a time.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <caption className="sr-only">This week's companion check-ins</caption>
          <thead><tr>
            <th scope="col"><AdminSelectAll selection={sel} label="Select every member shown"/></th>
            <th scope="col">Member</th><th scope="col">Rating</th><th scope="col">Why</th><th scope="col">Next steps</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.memberId} className={sel.has(r.memberId) ? "is-selected" : ""}>
              <td><AdminRowCheck selection={sel} id={r.memberId} label={"Select " + r.fullName}/></td>
              <td>{r.fullName}<div className="admin-cell-sub">{r.displayId || r.memberId} · {r.centre || "—"}{r.track ? " · " + r.track : ""}</div></td>
              <td><span className={"chip " + (r.rating === "at_risk" ? "status-archived" : r.rating === "watch" ? "chip-gold" : "chip-lime")}>{COMPANION_RATING_LABEL[r.rating]}</span></td>
              <td className="admin-cell-sub">{r.reasons.join(" · ") || "—"}</td>
              <td className="admin-cell-sub">{r.focus.join(" ")}{r.source === "ai" ? " (AI)" : ""}</td>
            </tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

/* ── Family accounts ──────────────────────────────────────────────────────────
 *
 * Parents sign in with their own email (/family) and connect to their children.
 * The child's Anchor code + name connects at once; a match on the record's
 * parent email only ASKS, and lands here — holding an inbox is not proof of
 * being the parent, so somebody who knows the family confirms it. Revoking
 * ends the connection immediately and tells the parent why.
 */
const FAMILY_REFUSALS = { out_of_scope: "outside your centres", unchanged: "already done", wrong_state: "no longer waiting", not_found: "gone" };
function AdminFamilies() {
  const [status, setStatus] = React.useState("pending");
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [form, setForm] = React.useState(null);
  const load = React.useCallback(() => { setErr(""); return NGGApi.admin.families.list({ status, q }).then(setD).catch(e => { setD(null); setErr(e.code || e.message); }); }, [status, q]);
  React.useEffect(() => { setD(null); load(); }, [load]);
  const rows = (d && d.rows) || [];
  const sel = useAdminSelection(rows, r => r.linkId);
  const actions = status === "pending" ? [
    { id: "approve", label: "Approve", pastTense: "approved", reload: load,
      confirm: ({ count }) => ({ title: "Connect " + count + " famil" + (count === 1 ? "y" : "ies") + "?", body: "Each parent will see their child's attendance, conduct, fees and lessons, and the child is told. Only approve when you know this is the parent or guardian.", cta: "Approve" }),
      run: (ids) => NGGApi.admin.families.decide("approve", ids) },
    { id: "refuse", label: "Refuse…", open: (ids) => setForm({ action: "refuse", ids }) },
  ] : status === "active" ? [
    { id: "revoke", label: "Disconnect…", danger: true, open: (ids) => setForm({ action: "revoke", ids }) },
  ] : [];
  const counts = (d && d.counts) || {};
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Family accounts{counts.pending ? <span className="admin-count mono">{counts.pending} waiting</span> : null}</h2></div>
      <p className="admin-hint">Parents and guardians follow their children from their own family account at <b>/family</b>. A child's code connects at once. A match on the parent email in the record waits here until someone confirms it. Disconnecting takes effect immediately, and the parent is emailed your reason.</p>
      <div className="admin-filters">
        <div role="group" aria-label="Filter by status" className="admin-filters">
          {[["pending", "Waiting"], ["active", "Connected"], ["refused", "Refused"], ["revoked", "Disconnected"], ["removed", "Left by the parent"]].map(([k, l]) => (
            <button key={k} className={"btn btn-sm " + (status === k ? "btn-primary" : "btn-ghost")} aria-pressed={status === k} onClick={() => { setStatus(k); sel.clear(); }}>{l}{counts[k] ? " (" + counts[k] + ")" : ""}</button>
          ))}
        </div>
        <form role="search" onSubmit={e => { e.preventDefault(); load(); }}>
          <input className="admin-input" type="search" aria-label="Search by member, parent name or email" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}/>
        </form>
      </div>
      {d && <p className="admin-cell-sub" role="status">{rows.length} shown{d.scoped ? " · your centres only" : ""}.</p>}
      {actions.length > 0 && <AdminBulkBar selection={sel} noun="connection" actions={actions}/>}
      {err ? <ErrorState title="Couldn't load family accounts" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        !rows.length ? <div className="admin-empty">{status === "pending" ? "Nobody is waiting to connect." : "Nothing here."}</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <caption className="sr-only">Family account connections</caption>
          <thead><tr>
            {actions.length > 0 && <th scope="col"><AdminSelectAll selection={sel} label="Select every connection shown"/></th>}
            <th scope="col">Member</th><th scope="col">Parent or guardian</th><th scope="col">On the record</th><th scope="col">How</th><th scope="col">When</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.linkId} className={sel.has(r.linkId) ? "is-selected" : ""}>
              {actions.length > 0 && <td><AdminRowCheck selection={sel} id={r.linkId} label={"Select " + r.fullName}/></td>}
              <td>{r.fullName}<div className="admin-cell-sub">{r.displayId || r.memberId} · {r.centre || "—"}</div></td>
              <td>{r.guardianName || "—"} <span className="admin-cell-sub">({r.relationshipLabel})</span><div className="admin-cell-sub">{r.guardianEmail}{r.guardianPhone ? " · " + r.guardianPhone : ""}</div></td>
              <td className="admin-cell-sub">{r.recordParentName || "—"}<div>{r.recordParentEmail || "—"}</div></td>
              <td className="admin-cell-sub">{r.via === "code" ? "Child's code" : "Record email"}{r.note ? <div>{r.note}</div> : null}</td>
              <td className="admin-cell-sub">{fmtDate(r.decidedAt || r.createdAt)}</td>
            </tr>
          ))}</tbody>
        </table></div>}
      {form && <AdminFamilyReason form={form} onClose={() => setForm(null)} onDone={() => { setForm(null); sel.clear(); load(); }}/>}
    </div>
  );
}

function AdminFamilyReason({ form, onClose, onDone }) {
  const drawer = useAdminDrawer(onClose, false);
  const count = form.ids.length;
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const title = form.action === "refuse" ? "Refuse" : "Disconnect";
  const apply = async () => {
    setBusy(true);
    try {
      const r = await NGGApi.admin.families.decide(form.action, form.ids, note.trim());
      const refused = (r.results || []).filter(x => x && x.ok === false);
      if (refused.length && r.done) toast.warn(r.done + " of " + count + " done · " + refused.length + " refused (" + refused.map(x => FAMILY_REFUSALS[x.error] || x.error).join(", ") + ").", title);
      else if (refused.length) toast.error("Nothing changed — " + refused.map(x => FAMILY_REFUSALS[x.error] || x.error).join(", ") + ".", title);
      else toast.success(r.done + " done. The parent" + (r.done === 1 ? " has" : "s have") + " been emailed.", title);
      onDone();
    } catch (e) { toast.error(e.detail || humanizeError(e.message, e.code), title); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <div className="admin-drawer-panel" role="dialog" aria-modal="true" {...drawer.titleProps} ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>{title} · {fmtNum(count)} connection{count === 1 ? "" : "s"}</h3>
          <button className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll"><div className="admin-fields">
          <label className="admin-field"><span className="admin-label">Your reason — the parent reads this</span>
            <textarea className="admin-input" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder={form.action === "refuse" ? "We couldn't confirm you're on the child's record. Please visit the centre." : "At the family's request."}/>
          </label>
          <p className="admin-hint">Applies to the <b>{fmtNum(count)}</b> selected when you opened this.</p>
        </div></div>
        <div className="admin-drawer-foot">
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={drawer.close}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()} onClick={apply}>{busy ? "…" : title}</button>
        </div>
      </div>
    </div>
  );
}

/* ── The timetable desk ───────────────────────────────────────────────────────
 *
 * Add, move and remove slots per centre. Every save goes through the server's
 * clash check — the same room, the same instructor, the same course twice, a
 * day the centre does not meet, or outside its hours — and a refusal says
 * exactly what it clashes with. Clashes already in the timetable (a centre that
 * changed its days later) are listed at the top, each with a way to fix it.
 */
function AdminTimetable() {
  const [centre, setCentre] = React.useState(() => { try { return localStorage.getItem("ngg.tt.centre") || ""; } catch (_) { return ""; } });
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [form, setForm] = React.useState(null);
  const load = React.useCallback(() => { setErr(""); return NGGApi.admin.timetable.list(centre).then(setD).catch(e => { setD(null); setErr(e.code || e.message); }); }, [centre]);
  React.useEffect(() => { load(); try { localStorage.setItem("ngg.tt.centre", centre); } catch (_) {} }, [load]);
  const remove = async (x) => {
    if (!(await dialog.confirm({ title: "Remove " + x.course + " on " + x.day + " " + x.startTime + "?", body: "It comes off the timetable for members, parents and the public page.", cta: "Remove", danger: true }))) return;
    try { const r = await NGGApi.admin.timetable.remove([x.slotId]); if (r.done) toast.success("Removed."); else toast.error(humanizeError(r.results[0].error, r.results[0].error)); load(); }
    catch (e) { toast.error(humanizeError(e.code, e.code)); }
  };
  const clashed = d ? d.slots.filter(x => x.clashes.length) : [];
  const centreName = d && centre ? ((d.centres.find(c => c.centreId === centre) || {}).name || "") : "";
  const cinfo = d && centre ? d.centres.find(c => c.centreId === centre) : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Timetable{d && d.clashCount ? <span className="admin-count mono">{d.clashCount} clash{d.clashCount === 1 ? "" : "es"}</span> : null}</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => window.open("/timetable" + (cinfo && cinfo.slug ? "?centre=" + cinfo.slug : ""), "_blank", "noopener")}>Public page ↗</button>
          {d && d.canEdit && <button className="btn btn-primary btn-sm" disabled={!d.centres.length} onClick={() => setForm({ centreId: centre || (d.centres[0] || {}).centreId, weekday: 6, startTime: "10:00", endTime: "11:00", course: "", level: "", room: "", instructorId: "", note: "" })}>Add a slot</button>}
        </div>
      </div>
      <p className="admin-hint">Which course meets when, where and with whom at each centre. Members see their own centre's timetable on their dashboard (with their course marked), parents see it on their family account, and each centre's is public at <b>/timetable</b> — without instructors' names. A slot that clashes is not saved: the same room at the same time, one instructor in two places, the same course twice, a day the centre does not meet, or outside its hours.</p>
      <div className="admin-filters">
        <label className="admin-field"><span className="admin-label">Centre</span>
          <select className="admin-select" value={centre} onChange={e => setCentre(e.target.value)}>
            <option value="">Every centre</option>
            {(d ? d.centres : []).map(c => <option key={c.centreId} value={c.centreId}>{c.name}</option>)}
          </select></label>
        {cinfo && <span className="admin-cell-sub">Meets {cinfo.meetDays || "— days not set"}{cinfo.meetTime ? ", " + cinfo.meetTime : ""}. Change that under People → Centres.</span>}
        {d && d.scoped && <span className="admin-cell-sub">Your centres only.</span>}
      </div>
      {err ? <ErrorState title="Couldn't load the timetable" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> : <>
        {clashed.length > 0 && (
          <div className="admin-card tt-clash-box" role="alert">
            <b>{clashed.length} slot{clashed.length === 1 ? " clashes" : "s clash"}.</b> These were fine when saved, but something changed since (usually a centre's meeting days). Move or remove them:
            <ul>{clashed.map(x => <li key={x.slotId}>{x.centre} · {x.day} {x.startTime}–{x.endTime} · {x.course}: {x.clashes.map(c => c.detail).join("; ")}
              {d.canEdit && <> <button className="btn btn-ghost btn-sm" onClick={() => setForm(x)}>Fix</button></>}</li>)}</ul>
          </div>
        )}
        {centre ? <div className="tt-print"><h3 className="admin-h3">{centreName}</h3>
            <TimetableView slots={d.slots} showInstructor title={centreName} emptyText={"Nothing on " + centreName + "'s timetable yet."}
              actions={d.canEdit ? (x => <><button className="btn btn-ghost btn-sm" onClick={() => setForm(x)} aria-label={"Edit " + x.course + " " + x.day + " " + x.startTime}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(x)} aria-label={"Remove " + x.course + " " + x.day + " " + x.startTime}>Remove</button></>) : null}/></div>
          : d.centres.map(c => {
              const mine = d.slots.filter(x => x.centreId === c.centreId);
              return <section key={c.centreId} className="tt-centre"><h3 className="admin-h3">{c.name} <span className="admin-cell-sub">· {mine.length} slot{mine.length === 1 ? "" : "s"}</span></h3>
                <TimetableView slots={mine} showInstructor title={c.name} emptyText="Nothing on this centre's timetable yet."
                  actions={d.canEdit ? (x => <><button className="btn btn-ghost btn-sm" onClick={() => setForm(x)} aria-label={"Edit " + x.course + " " + x.day + " " + x.startTime}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(x)} aria-label={"Remove " + x.course + " " + x.day + " " + x.startTime}>Remove</button></>) : null}/></section>;
            })}
        {centre && <button className="btn btn-ghost btn-sm tt-noprint" onClick={() => window.print()}>Print this timetable</button>}
      </>}
      {form && d && <AdminTimetableForm form={form} d={d} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }}/>}
    </div>
  );
}

function AdminTimetableForm({ form, d, onClose, onSaved }) {
  const drawer = useAdminDrawer(onClose, false);
  const [f, setF] = React.useState({ ...form });
  const [busy, setBusy] = React.useState(false);
  const [clash, setClash] = React.useState(null);
  const set = (k, v) => { setF(o => ({ ...o, [k]: v })); setClash(null); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setClash(null);
    try { await NGGApi.admin.timetable.save({ ...f, weekday: Number(f.weekday) }); toast.success(form.slotId ? "Slot moved." : "Slot added."); onSaved(); }
    catch (x) { setClash(x.data && x.data.clashes ? x.data.clashes.map(c => c.detail) : [x.detail || humanizeError(x.code, x.code)]); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <form className="admin-drawer-panel" role="dialog" aria-modal="true" {...drawer.titleProps} ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>{form.slotId ? "Move or change a slot" : "Add a slot"}</h3>
          <button type="button" className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll"><div className="admin-fields">
          <label className="admin-field"><span className="admin-label">Centre</span>
            <select className="admin-select" value={f.centreId} onChange={e => set("centreId", e.target.value)} required>
              {d.centres.map(c => <option key={c.centreId} value={c.centreId}>{c.name}</option>)}</select></label>
          <label className="admin-field"><span className="admin-label">Day</span>
            <select className="admin-select" value={f.weekday} onChange={e => set("weekday", e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{TT_DAY_NAMES[n]}</option>)}</select></label>
          <div className="admin-grid2">
            <label className="admin-field"><span className="admin-label">Starts</span><input className="admin-input" type="time" value={f.startTime} onChange={e => set("startTime", e.target.value)} required/></label>
            <label className="admin-field"><span className="admin-label">Ends</span><input className="admin-input" type="time" value={f.endTime} onChange={e => set("endTime", e.target.value)} required/></label>
          </div>
          <label className="admin-field"><span className="admin-label">Course</span>
            <select className="admin-select" value={f.course} onChange={e => set("course", e.target.value)} required>
              <option value="">Choose a course…</option>{d.courses.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="admin-field"><span className="admin-label">Level or group (optional)</span><input className="admin-input" value={f.level} onChange={e => set("level", e.target.value)} placeholder="e.g. Beginners"/></label>
          <label className="admin-field"><span className="admin-label">Room (blank means the centre's main room)</span><input className="admin-input" value={f.room} onChange={e => set("room", e.target.value)} placeholder="e.g. Studio 2"/></label>
          <label className="admin-field"><span className="admin-label">Instructor (optional)</span>
            <select className="admin-select" value={f.instructorId || ""} onChange={e => set("instructorId", e.target.value)}>
              <option value="">Not assigned</option>{d.instructors.map(v => <option key={v.volunteerId} value={v.volunteerId}>{v.fullName}{v.summerOnly ? " (signed up for Summer School)" : ""}{v.courses ? " — " + String(v.courses).replace(/[\[\]"]/g, "").replace(/,/g, ", ") : ""}</option>)}</select></label>
          <label className="admin-field"><span className="admin-label">Note (optional)</span><input className="admin-input" value={f.note} onChange={e => set("note", e.target.value)} placeholder="e.g. Bring your phone charged"/></label>
          {clash && <div className="admin-form-err" role="alert"><b>Not saved — it clashes:</b><ul>{clash.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
        </div></div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={drawer.close}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Checking…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminApprovals() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [status, setStatus] = React.useState("pending");
  const [open, setOpen] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const headId = React.useId();
  const trigger = React.useRef(null);

  const load = () => { setErr(""); return NGGApi.admin.approvals.list(status).then(setD).catch(e => { setD(null); setErr(e.code || e.message); }); };
  React.useEffect(() => { setD(null); load(); /* eslint-disable-next-line */ }, [status]);

  const close = () => { if (busy) return; setOpen(null); try { trigger.current && trigger.current.focus(); } catch (_) {} };
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const decide = async (decision) => {
    if (decision === "reject" && !reason.trim()) { toast.error("Say why — the person who asked reads this."); return; }
    setBusy(decision);
    try {
      const r = await NGGApi.admin.approvals.decide(open.approvalId, decision, reason.trim());
      if (r.status === "failed") toast.error("Approved, but the action itself was refused: " + humanizeError((r.result && r.result.error) || "", (r.result && r.result.error) || ""), open.approvalId);
      else toast.success(decision === "approve" ? "Approved — it has been done." : "Rejected, with your reason.", open.approvalId);
      setOpen(null); load();
    } catch (e) { toast.error(e.code === "own_request" ? "You can't approve your own request." : humanizeError(e.code, e.code), "Not decided"); }
    finally { setBusy(""); }
  };
  const withdraw = async (r) => {
    try { await NGGApi.admin.approvals.withdraw(r.approvalId); toast.success("Withdrawn — nothing was changed.", r.approvalId); load(); }
    catch (e) { toast.error(humanizeError(e.code, e.code)); }
  };

  const canDecide = !!(d && d.canDecide);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Approvals
          {d && d.pending > 0 && <span className="admin-count mono" aria-live="polite">{d.pending} waiting</span>}
        </h2>
      </div>
      <p className="admin-hint">
        {canDecide
          ? "Sensitive actions a club admin has asked for. Nothing has changed yet: approving does it, as the person who asked; rejecting tells them why."
          : "Your sensitive actions — suspending or deactivating someone, merging records, renaming or retiring a centre, removing a volunteer — wait here for an admin. Nothing changes until one approves."}
      </p>
      <div className="appr-filters" role="group" aria-label="Show">
        {["pending", "approved", "rejected", "failed", "withdrawn", "all"].map(k => (
          <button key={k} type="button" className={"btn btn-sm " + (status === k ? "btn-primary" : "btn-ghost")}
            aria-pressed={status === k} onClick={() => setStatus(k)}>{k === "all" ? "Everything" : APPROVAL_STATUS_LABEL[k]}</button>
        ))}
      </div>

      {d === null ? (err ? <ErrorState code={err} onRetry={load}/> : <div className="dash-spinner" role="status" aria-label="Loading"/>) :
        !d.approvals.length ? <div className="admin-empty">{status === "pending" ? "Nothing is waiting for approval." : "Nothing here."}</div> :
        <ul className="appr-list">
          {d.approvals.map(r => (
            <li key={r.approvalId} className={"appr-item is-" + r.status}>
              <div className="appr-main">
                <div className="appr-summary">{r.summary}</div>
                <div className="appr-meta mono">
                  {r.approvalId} · asked by {r.requesterName || r.requesterId} · {String(r.createdAt).slice(0, 16).replace("T", " ")}
                  {r.decidedBy && r.status !== "pending" ? " · " + (r.status === "withdrawn" ? "withdrawn" : "decided by " + (r.decidedByName || r.decidedBy)) : ""}
                </div>
                {r.reason && <div className="appr-reason">“{r.reason}”</div>}
                {r.resultError && <div className="appr-reason is-error">When it ran: {humanizeError(r.resultError, r.resultError)}</div>}
              </div>
              <div className="appr-side">
                {r.status === "pending" && canDecide &&
                  <button type="button" className="btn btn-primary btn-sm"
                    onClick={e => { trigger.current = e.currentTarget; setReason(""); setOpen(r); }}>Decide</button>}
                {r.status === "pending" && !canDecide &&
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => withdraw(r)}>Withdraw</button>}
                {r.status !== "pending" && <span className="chip">{APPROVAL_STATUS_LABEL[r.status] || r.status}</span>}
              </div>
            </li>
          ))}
        </ul>}

      {open && (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby={headId}
          onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="admin-drawer-panel">
            <div className="admin-drawer-head">
              <h3 id={headId}>Approve this?</h3>
              <button type="button" className="admin-drawer-close" aria-label="Close" onClick={close}>✕</button>
            </div>
            <div className="admin-fields">
              <p className="appr-summary">{open.summary}</p>
              <p className="admin-hint">Asked by {open.requesterName || open.requesterId} · {open.approvalId}. Approving runs it now, as them.</p>
              <label className="admin-field"><span className="admin-label">Note — required to reject; they read it</span>
                <textarea className="admin-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why, in a sentence."/>
              </label>
            </div>
            <div className="admin-drawer-foot">
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={close}>Cancel</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !reason.trim()} onClick={() => decide("reject")}
                title={reason.trim() ? "" : "A rejection needs a reason"}>{busy === "reject" ? "…" : "Reject"}</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => decide("approve")}>{busy === "approve" ? "…" : "Approve"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminRequests() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [f, setF] = React.useState({ status: "open", kind: "" });
  const [open, setOpen] = React.useState(null);      // the row being decided
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const decideId = React.useId();

  const load = () => { setErr(""); return NGGApi.admin.requests.list(f).then(setD).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { setD(null); load(); /* eslint-disable-next-line */ }, [f.status, f.kind]);

  const start = (r) => { setOpen(r); setReason(""); setAmount(r.kind === "payment" ? String(r.amount || "") : ""); };
  const decide = async (approve) => {
    if (!approve && !reason.trim()) { toast.error("Say why — the member sees this."); return; }
    setBusy(approve ? "yes" : "no");
    try {
      await NGGApi.admin.requests.decide(open.requestId, approve, reason.trim(),
        open.kind === "payment" && approve && amount !== "" ? Number(amount) : undefined);
      toast.success(approve ? "Approved." : "Declined, with your reason.", open.requestId);
      setOpen(null); load();
    } catch (e) { toast.error(e.detail || e.code || e.message); } finally { setBusy(""); }
  };

  const kinds = (d && d.kinds) || {};
  const tally = (d && d.openByKind) || {};
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Member requests
          {Object.values(tally).reduce((a, b) => a + b, 0) > 0 &&
            <span className="admin-count mono">{Object.values(tally).reduce((a, b) => a + b, 0)} open</span>}
        </h2>
      </div>
      <p className="admin-hint">
        What members have asked for from their own dashboard. Approving a payment posts it to the
        ledger exactly as the Dues &amp; fees screen would — a claim is evidence, not an entry.
      </p>
      <div className="admin-filters">
        <select className="admin-select" value={f.status} onChange={e => setF(o => ({ ...o, status: e.target.value }))}>
          <option value="open">Waiting</option><option value="approved">Approved</option>
          <option value="declined">Declined</option><option value="withdrawn">Withdrawn</option>
        </select>
        <select className="admin-select" value={f.kind} onChange={e => setF(o => ({ ...o, kind: e.target.value }))}>
          <option value="">Every kind</option>
          {Object.keys(kinds).map(k => <option key={k} value={k}>{kinds[k]}{tally[k] ? " (" + tally[k] + ")" : ""}</option>)}
        </select>
      </div>

      {d === null ? (err ? <ErrorState code={err} onRetry={load}/> : <div className="dash-spinner"/>) :
        !d.requests.length ? <div className="admin-empty">Nothing here.</div> :
        d.requests.map(r => (
          <div key={r.requestId} className="admin-card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.subject || r.kindLabel}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>
                  {r.fullName || r.displayId} · {r.centre} · {r.kindLabel} · {String(r.createdAt).slice(0, 10)}
                </div>
                {r.byFamily && <div className="admin-cell-sub">From their family account{r.raisedByName ? ": " + r.raisedByName : ""} — the parent is emailed your reply.</div>}
              </div>
              {r.status === "open"
                ? <button className="btn btn-primary btn-sm" onClick={() => start(r)}>Decide</button>
                : <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>{r.status.toUpperCase()}</span>}
            </div>
            {r.body && <p style={{ margin: "8px 0 0", fontSize: 13 }}>{r.body}</p>}
            {r.kind === "payment" && (
              <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>
                Claims {fmtMoney(r.amount || 0)}
                {r.reference ? " · ref " + r.reference : ""}{r.paidAt ? " · paid " + r.paidAt : ""}
              </div>
            )}
            {r.kind === "leave" && <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>{r.fromDate} → {r.toDate || "open-ended"}</div>}
            {r.decision && <div className="admin-hint" style={{ marginTop: 8 }}>Replied: {r.decision}</div>}
          </div>
        ))}

      {open && (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby={decideId}
          onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(null); }}>
          <div className="admin-drawer-panel">
            <div className="admin-drawer-head">
              <h3 id={decideId}>{open.kindLabel}</h3>
              <button type="button" className="admin-drawer-close" onClick={() => !busy && setOpen(null)}>✕</button>
            </div>
            <div className="admin-fields">
              <p className="admin-hint" style={{ marginTop: 0 }}>
                {open.fullName || open.displayId} · {open.requestId}
              </p>
              {open.body && <p style={{ fontSize: 13 }}>{open.body}</p>}
              {open.kind === "payment" && (
                <Field label="Amount to post (what actually arrived)" value={amount} onChange={setAmount}
                  placeholder={String(open.amount || 0)}/>
              )}
              <label className="admin-field"><span className="admin-label">Your reply — the member reads this</span>
                <textarea className="admin-input" rows={4} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={open.kind === "payment" ? "Found it on the 3rd, thank you." : "Why, in a sentence."}/>
              </label>
            </div>
            <div className="admin-drawer-foot">
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setOpen(null)}>Cancel</button>
              <button className="btn btn-ghost btn-sm" disabled={!!busy || !reason.trim()} onClick={() => decide(false)}
                title={reason.trim() ? "" : "A decline needs a reason"}>{busy === "no" ? "…" : "Decline"}</button>
              <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => decide(true)}>{busy === "yes" ? "…" : "Approve"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── How the cards members already hold read ─────────────────────────────────
 *
 * An imported member used to arrive with no card the CACENTRE gate could read.
 * Now every member gets a secure MEMQR- card, and the card already in their
 * wallet keeps working: the importer says what it looks like. Not a regular
 * expression — "paste what an old card scans as, and point at the number in
 * it" — and the gate decodes by the same rules (domain/member-cards.php,
 * gate/src/cards.ts). A format can be tried against a real card before it is
 * saved, because a format that reads nothing fails silently at the door.
 */
function MemberCardFormatPicker({ value, onChange, disabled }) {
  /* Outside the auth provider (a mounted fixture) there is no session: offer
     nothing that needs a capability, rather than crash the drawer around it. */
  const auth = useAuth() || {};
  const hasCap = typeof auth.hasCap === "function" ? auth.hasCap : () => false;
  const [formats, setFormats] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [ex, setEx] = React.useState({ example: "", number: "", label: "", field: "code" });
  const [derived, setDerived] = React.useState(null);
  const [tryText, setTryText] = React.useState("");
  const [tryRes, setTryRes] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.members.cards.formats().then(r => setFormats(r.formats || [])).catch(() => setFormats([]));
  React.useEffect(() => { load(); }, []);
  const current = (formats || []).find(f => f.id === value);

  const derive = async () => {
    setErr(""); setDerived(null);
    try {
      const r = await NGGApi.admin.members.cards.derive(ex.example, ex.number);
      if (!r.derived || !r.derived.ok) { setErr((r.derived && r.derived.error) || "That did not describe a card."); return; }
      setDerived({ template: r.derived.template, mask: r.derived.mask });
    } catch (e) { setErr(e.detail || e.code || e.message); }
  };
  const save = async () => {
    setErr("");
    const id = (ex.label || "printed").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "printed";
    try {
      const r = await NGGApi.admin.members.cards.saveFormat({ id, label: ex.label || "Printed cards", template: derived.template, mask: derived.mask, field: ex.field, example: ex.example });
      setFormats(r.formats || []); onChange(r.format.id); setAdding(false); setDerived(null);
      toast.success("The gate picks it up within a quarter of an hour.", "Card format saved");
    } catch (e) { setErr(e.detail || e.code || e.message); }
  };
  const tryCard = async () => {
    const f = derived || current;
    if (!f) return;
    try { const r = await NGGApi.admin.members.cards.test(f.template, f.mask, tryText); setTryRes(r.test); }
    catch (e) { setTryRes({ ok: false, error: e.detail || e.code || e.message }); }
  };

  return (
    <div className="admin-field">
      <span className="admin-label">Cards these members already hold</span>
      <select className="admin-select" value={value} disabled={disabled || formats === null}
        onChange={(e) => { if (e.target.value === "__add") { setAdding(true); return; } onChange(e.target.value); setTryRes(null); }}>
        {(formats || []).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        <option value="">None — they hold no card yet</option>
        {hasCap("rbac") && <option value="__add">Describe another kind of card…</option>}
      </select>
      <p className="admin-hint" style={{ margin: "4px 0 0" }}>
        Everybody imported gets a new secure card for the gate either way. This says how the card already in their
        wallet reads, so it keeps opening the door until they are reprinted.
        {current && <> Reads <span className="mono">{current.template.replace("{id}", "[" + current.mask + "]")}</span>.</>}
      </p>
      {adding && (
        <div className="admin-card admin-note-card" style={{ marginTop: 8 }}>
          <label className="admin-field"><span className="admin-label">What one of the old cards scans as</span>
            <input className="admin-input mono" value={ex.example} placeholder="https://old.example.org/member/023-001"
              onChange={(e) => setEx(x => ({ ...x, example: e.target.value }))}/></label>
          <label className="admin-field"><span className="admin-label">The member's number in it</span>
            <input className="admin-input mono" value={ex.number} placeholder="023-001"
              onChange={(e) => setEx(x => ({ ...x, number: e.target.value }))}/></label>
          <label className="admin-field"><span className="admin-label">That number is</span>
            <select className="admin-select" value={ex.field} onChange={(e) => setEx(x => ({ ...x, field: e.target.value }))}>
              <option value="displayId">The member number printed on the card</option>
              <option value="memberId">The member id (NGG-…)</option>
              <option value="code">Neither — a code recorded at import (the roster's cardCode column)</option>
            </select></label>
          <label className="admin-field"><span className="admin-label">A name for these cards</span>
            <input className="admin-input" value={ex.label} placeholder="2023 laminated cards"
              onChange={(e) => setEx(x => ({ ...x, label: e.target.value }))}/></label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={derive} disabled={!ex.example || !ex.number}>Work out the format</button>
          {derived && <p className="admin-hint">Reads <span className="mono">{derived.template}</span> where the number looks like <span className="mono">{derived.mask}</span> (9 a digit).</p>}
          {derived && <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save this format</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setDerived(null); }}>Cancel</button>
        </div>
      )}
      {(current || derived) && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input className="admin-input mono" value={tryText} placeholder="Try a card: scan or paste one" aria-label="Try a card against this format"
            onChange={(e) => { setTryText(e.target.value); setTryRes(null); }} onKeyDown={(e) => { if (e.key === "Enter") tryCard(); }}/>
          <button type="button" className="btn btn-ghost btn-sm" onClick={tryCard} disabled={!tryText}>Try</button>
        </div>
      )}
      {tryRes && <div className="admin-hint" style={{ color: tryRes.ok && tryRes.decodes ? "var(--ok, #2f9e44)" : "var(--danger, #c0392b)" }}>
        {tryRes.ok ? (tryRes.decodes ? "Reads as " + tryRes.decodes + "." : "That card does not read under this format.") : tryRes.error}</div>}
      {err && <div className="admin-hint" style={{ color: "var(--danger, #c0392b)" }}>{err}</div>}
    </div>
  );
}

/* The member IDs an import issued or corrected, as a CSV for the workbook.
 * Built in the browser from the report — the server has no file to hand out
 * on this host. A cell that opens with = + - @ is quoted with a leading ' so a
 * spreadsheet shows a name rather than evaluating it. */
function downloadImportIdList(list, source, applied) {
  const cell = (v) => {
    let t = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const what = { issued: applied ? "issued" : "to be issued", normalized: "sheet spells it differently", matched: "sheet has none" };
  const lines = [["Name", "In the sheet", "Member ID", "What happened", "Record"].map(cell).join(",")]
    .concat(list.map(r => [r.name, r.sheet, r.displayId, what[r.action] || r.action, r.memberId].map(cell).join(",")));
  const blob = new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "member-ids-" + String(source || "roster").replace(/\.[a-z0-9]+$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-") + (applied ? "" : "-preview") + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function AdminRosterImport({ onClose, onApplied }) {
  const [cardFormat, setCardFormat] = React.useState("member-number");
  const [file, setFile] = React.useState(null);        // { source, members[] }
  const [overwrite, setOverwrite] = React.useState(false);
  /* Refuse IDs that fit no declared ID format. On by default here: a typo
     ("O24-016" with a letter O) filed as an ID is a card nobody can scan. */
  const [idStrict, setIdStrict] = React.useState(true);
  const [declaring, setDeclaring] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [done, setDone] = React.useState(null);
  const [err, setErr] = React.useState("");
  const panelRef = React.useRef(null);
  /* This drawer keeps its own close guard (a run in flight must not be
     dismissed) rather than useAdminDrawer's, so it mints its own heading id. */
  const titleId = React.useId();
  const titleProps = { "aria-labelledby": titleId }, headingProps = { id: titleId };
  const close = () => { if (!busy) onClose(); };

  /* SHA-256 of the bytes as read, before parsing.
   *
   * This is the FILE's identity — the same number extract.js prints when it
   * writes the file — so an operator can see that what the browser is holding
   * is what the extractor made, and a recorded run can be traced back to a file
   * on disk. It is not the same thing as the import digest the server returns:
   * that one hashes what the roster would DO, and survives re-serialisation.
   *
   * crypto.subtle needs a secure context. On plain http (a LAN box, someone
   * testing over an IP) it is simply absent, so this degrades to no file hash
   * rather than to a broken importer — nothing downstream requires it. */
  const sha256Hex = async (buf) => {
    if (!(window.crypto && window.crypto.subtle)) return "";
    try {
      const d = await window.crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (_) { return ""; }
  };

  const read = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";                                // re-picking the same file must re-read it
    if (!f) return;
    setErr(""); setPreview(null); setDone(null);
    try {
      const bytes = await f.arrayBuffer();
      const fileSha = await sha256Hex(bytes);
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text);
      const members = Array.isArray(parsed) ? parsed : parsed.members;
      if (!Array.isArray(members) || !members.length) throw new Error("no members in that file");
      /* `text` is what is posted: the file itself, as a single value, because a
         roster sent as 136 objects is a few thousand values and this host's
         firewall refuses the request with a 406 before it reaches the site (see
         rosterOneValueBody in api-client.js). `members` stays for the counts
         shown here and for the fallback shape. */
      setFile({ source: parsed.source || f.name, members, warnings: parsed.warnings || [],
                fileSha, text, bytes: f.size });
    } catch (ex) {
      setFile(null);
      setErr("That is not a roster file — run tools/ngg-import/extract.js on the workbook first. (" + (ex.message || "unreadable") + ")");
    }
  };

  const run = async (apply) => {
    if (!file) return;
    if (apply && !(await dialog.confirm({
      title: (preview.created + preview.updated) > 0 ? "Write " + (preview.created + preview.updated) + " member record(s)?" : "Issue " + ((preview.cards && preview.cards.wouldIssue) || 0) + " card(s)?",
      body: preview.created + " new, " + preview.updated + " updated"
        + (overwrite ? ". Overwrite is ON — values already in the Control Room will be replaced." : ". Existing values are kept; only blanks are filled.")
        + (preview.previous ? " This exact roster was already applied on " + String(preview.previous.at).slice(0, 10) + "." : ""),
      cta: "Import roster", danger: overwrite }))) return;
    setBusy(apply ? "apply" : "preview"); setErr("");
    try {
      /* The apply names the import the dry run described. The server recomputes
         it from what it receives and refuses a mismatch, so picking a different
         file after reading the preview fails closed instead of writing a roster
         nobody confirmed. */
      const r = await NGGApi.admin.members.importRoster(file,
        apply ? { apply, overwrite, cardFormat, idStrict, expectDigest: (preview && preview.digest) || "" } : { apply, overwrite, cardFormat, idStrict });
      apply ? (setDone(r), toast.success(r.created + " new · " + r.updated + " updated" + (r.cards ? " · " + r.cards.issued + " cards issued" : ""), "Roster imported")) : setPreview(r);
    } catch (ex) {
      /* roster_changed is not a failure to retry — it means the file in hand is
         not the one that was read, so the dry run has to happen again. */
      if (ex.code === "roster_changed") { setPreview(null); setDone(null); }
      setErr(ex.detail || ex.code || ex.message || "The import failed");
    } finally { setBusy(""); }
  };

  /* Declare an ID shape the dry run found in the sheet, from its first example,
     then read the file again — the dry run it replaces promised the old answer. */
  const [years, setYears] = React.useState({});      // shape → the intake year its first example belongs to
  const declare = async (u) => {
    setDeclaring(u.shape); setErr("");
    try {
      await NGGApi.admin.members.cards.declareIdFormat(u.examples[0], "Member IDs like " + u.examples[0], false, years[u.shape] || 0);
      toast.success("IDs shaped like " + u.examples[0] + " are accepted now, and the gate reads their cards.", "ID format declared");
      setPreview(null);
      const r = await NGGApi.admin.members.importRoster(file, { apply: false, overwrite, cardFormat, idStrict });
      setPreview(r);
    } catch (ex) { setErr(ex.detail || ex.code || ex.message || "Could not declare that format"); }
    finally { setDeclaring(""); }
  };

  const res = done || preview;
  const MARK = { create: "+", update: "~", failed: "!", unchanged: "=" };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel">
        <div className="admin-drawer-head">
          <h3 {...headingProps}>Import roster</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <p className="admin-hint">
            Loads the roster file produced from the members workbook by
            <span className="mono"> node tools/ngg-import/extract.js</span>. Members are matched on
            their printed ID, so running it twice updates the same people instead of duplicating them.
            The file holds children&rsquo;s personal data — delete your copy once this has run.
          </p>

          <label className="admin-field"><span className="admin-label">Roster file</span>
            <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", margin: 0, alignSelf: "flex-start" }}>
              {file ? "Choose a different file" : "Choose file…"}
              <input type="file" accept="application/json,.json" onChange={read} style={{ display: "none" }}/>
            </label>
          </label>

          {file && (
            <div className="mono" style={{ fontSize: 13 }}>
              {file.source} · {fmtNum(file.members.length)} member{file.members.length === 1 ? "" : "s"}
              {file.warnings.length ? " · " + file.warnings.length + " extractor warning" + (file.warnings.length === 1 ? "" : "s") : ""}
              {/* The file's own SHA-256, which extract.js prints when it writes
                  the file. Twelve characters is what a person can actually
                  compare against a terminal; the whole thing is on the title so
                  it can still be copied. Absent on plain http, where
                  crypto.subtle does not exist — the importer does not need it. */}
              {file.fileSha
                ? <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}
                    title={"sha256:" + file.fileSha}>sha256 {file.fileSha.slice(0, 12)}…</div>
                : null}
            </div>
          )}

          {/* Already loaded this exact roster? Said BEFORE the apply button,
              because a half-remembered re-import is the mistake this catches —
              and it is a heads-up, not a block: re-running after fixing four
              rows in the sheet is the normal workflow. */}
          {preview && preview.previous && (
            <div className="admin-card admin-note-card">
              <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 6 }}>
                Already imported
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                This exact roster was applied on <b>{String(preview.previous.at).slice(0, 10)}</b>
                {preview.previous.actorId ? <> by <span className="mono">{preview.previous.actorId}</span></> : null}
                {" — "}{fmtNum(preview.previous.created)} new, {fmtNum(preview.previous.updated)} updated then.
              </div>
              <p className="admin-hint" style={{ marginBottom: 0 }}>
                Running it again is safe and usually a no-op — the dry run above says what it would do this time.
              </p>
            </div>
          )}

          <MemberCardFormatPicker value={cardFormat} disabled={!!busy || !!done}
            onChange={(v) => { setCardFormat(v); setPreview(null); }}/>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={idStrict} disabled={!!busy || !!done}
              onChange={(e) => { setIdStrict(e.target.checked); setPreview(null); }}/>
            Refuse member IDs that fit no declared ID format (today&rsquo;s is 023-001)
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={overwrite} disabled={!!busy || !!done}
              onChange={(e) => { setOverwrite(e.target.checked); setPreview(null); }}/>
            Replace values the record already has (default: fill blanks only)
          </label>

          {err && <div className="admin-hint" style={{ color: "var(--danger, #c0392b)" }}>{err}</div>}

          {res && (
            <div>
              <div className="mono" style={{ marginBottom: 8 }}>
                {done ? "Imported" : "Would import"} — new {res.created} · updated {res.updated}
                {" "}· already current {res.unchanged} · unusable {res.failed}
              </div>
              {res.cards && (
                <div className="mono" style={{ marginBottom: 8, fontSize: 13 }}>
                  {done
                    ? <>Cards — {res.cards.issued} secure card{res.cards.issued === 1 ? "" : "s"} issued · {res.cards.printed} printed card{res.cards.printed === 1 ? "" : "s"} recorded{res.cards.taken ? " · " + res.cards.taken + " printed codes already someone else's" : ""}</>
                    : <>Cards — {res.cards.wouldIssue} member{res.cards.wouldIssue === 1 ? "" : "s"} would get a secure card{res.cards.format ? "; old cards read as “" + res.cards.format + "”" : ""}</>}
                </div>
              )}
              {res.ids && (
                <div className="mono imp-ids" style={{ marginBottom: 8, fontSize: 13 }}>
                  Member IDs — {res.ids.kept} kept · {res.ids.issued} {done ? "issued" : "to be issued"}
                  {res.ids.normalized ? " · " + res.ids.normalized + " read differently" : ""}
                  {res.ids.refused ? " · " + res.ids.refused + " refused" : ""}
                </div>
              )}
              {/* The IDs the workbook does not carry yet — issued here, or
                  spelled differently in the sheet. Written back, the next
                  import matches these members on the ID instead of the name. */}
              {res.idList && res.idList.length > 0 && (
                <div className="imp-writeback">
                  <span className="admin-hint">
                    {res.idList.length} member ID{res.idList.length === 1 ? "" : "s"} {done ? "to copy" : "that will need copying"} into the workbook
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadImportIdList(res.idList, file && file.source, !!done)}>
                    Download the ID list (CSV)
                  </button>
                </div>
              )}
              {/* Registrations with no roster row. Filed as applications for the
                  desk to confirm — the import never makes a member of them. */}
              {res.applicants && (res.applicants.filed + res.applicants.already + res.applicants.onRoster) > 0 && (
                <div className="admin-card admin-note-card imp-applicants">
                  <div className="imp-cap">Registered, but not on the roster</div>
                  <div className="mono imp-applicants-n">
                    {res.applicants.filed} {done ? "filed" : "to be filed"} as applications · {res.applicants.already} filed before · {res.applicants.onRoster} already members here
                  </div>
                  <p className="admin-hint imp-last">
                    They are not members. Each waits in Applications for somebody to confirm, and confirming one
                    creates the member and issues their member ID.
                  </p>
                </div>
              )}
              {/* Shapes the sheet's IDs take that no format declares. Each is
                  offered for declaring from its first example: old cards keep
                  their IDs, and the gate reads them. */}
              {res.ids && Object.values(res.ids.undeclared || {}).length > 0 && !done && (
                <div className="admin-card admin-note-card">
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 6 }}>
                    ID formats this sheet uses that are not declared
                  </div>
                  {Object.values(res.ids.undeclared).map(u => (
                    <div key={u.shape} className="imp-shape">
                      <span><b className="mono">{u.examples.join(", ")}</b>{u.count > u.examples.length ? " and " + (u.count - u.examples.length) + " more" : ""}
                        {" "}<span className="admin-hint">({u.count} ID{u.count === 1 ? "" : "s"}, shape {u.shape})</span>
                        {(u.suggest || []).map(g => (
                          <span key={g.from} className="imp-sug">{g.from} looks like a typo for <b className="mono">{g.id}</b>{g.holder ? " (" + g.holder + ")" : ""} — correct the sheet rather than declaring it.</span>
                        ))}
                      </span>
                      <label className="imp-year">
                        <span>Intake year of {u.examples[0]}</span>
                        <input type="number" inputMode="numeric" min="2000" max={new Date().getFullYear() + 1} placeholder="optional"
                               value={years[u.shape] || ""} onChange={e => setYears(y => ({ ...y, [u.shape]: e.target.value }))}
                               aria-label={"Intake year of " + u.examples[0] + ", so members with this shape of ID land in the right intake"}/>
                      </label>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!!declaring || !!busy} onClick={() => declare(u)}>
                        {declaring === u.shape ? "Declaring…" : "Declare this format"}
                      </button>
                    </div>
                  ))}
                  <p className="admin-hint" style={{ marginBottom: 0 }}>
                    Declaring tells the importer these are real member IDs and the gate how to read the cards
                    that carry them. Only a super admin can. If one is a typo, correct the sheet instead.
                  </p>
                </div>
              )}
              {/* A list, not a table. Four columns in a drawer this narrow put
                  "what changes" off the right-hand edge, which is the one
                  column somebody reading a dry run is here for. */}
              {res.rows.length > 0 && (
                <div style={{ maxHeight: 360, overflowY: "auto", borderTop: "1px solid var(--admin-hair, #e6e8ec)" }}>
                  {res.rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 2px", borderBottom: "1px solid var(--admin-hair, #e6e8ec)" }}>
                      <span className="mono" style={{ width: 12, flex: "none", opacity: .7 }}>{MARK[r.action] || "?"}</span>
                      <span className="mono" style={{ width: 74, flex: "none", fontSize: 12 }}>{r.ref}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div>{r.name}{r.displayId && r.displayId !== r.ref ? <span className="mono" style={{ fontSize: 12, marginLeft: 6 }}>→ {r.displayId}</span> : null}</div>
                        {r.detail && <div className="mono" style={{ fontSize: 12, opacity: .72, wordBreak: "break-word" }}>{r.detail}</div>}
                        {(r.warnings || []).map((w, j) => (
                          <div key={j} className="admin-hint" style={{ margin: "3px 0 0" }}>↳ {w}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={close} disabled={!!busy}>{done ? "Close" : "Cancel"}</button>
          {!done && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={!file || !!busy} onClick={() => run(false)}>
              {busy === "preview" ? "Checking…" : "Check what would change"}
            </button>
          )}
          {!done && preview && ((preview.created + preview.updated) > 0 || (preview.cards && preview.cards.wouldIssue > 0) || (preview.applicants && preview.applicants.filed > 0)) && (
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run(true)}>
              {busy === "apply" ? "Importing…" : (preview.created + preview.updated) > 0
                ? "Import " + (preview.created + preview.updated) + " record(s)"
                : preview.cards && preview.cards.wouldIssue > 0 ? "Issue " + preview.cards.wouldIssue + " card(s)"
                : "File " + preview.applicants.filed + " applicant(s)"}
            </button>
          )}
          {done && <button type="button" className="btn btn-primary btn-sm" onClick={onApplied}>Back to the roster</button>}
        </div>
      </div>
    </div>
  );
}

function AdminMemberIdBatch({ filters, sort, onFilter, onClose }) {
  const { panelRef, close, titleProps, headingProps } = useAdminDrawer(onClose, false);
  const [mode, setMode] = React.useState("zip");
  const [dpi, setDpi] = React.useState(300);
  const [design, setDesign] = React.useState("classic"); // classic | a5 | a5-wallet
  const [run, setRun] = React.useState(null);        // { i, n, note } while rendering
  const [roster, setRoster] = React.useState(null);  // the members this run covers
  const [loadErr, setLoadErr] = React.useState("");
  const [failed, setFailed] = React.useState([]);
  const cancelRef = React.useRef(false);
  const doneRef = React.useRef(false);

  /* ── Read the roster when the drawer opens, not when Print is pressed ──────
   *
   * Two reasons, and the second is the one that matters. The count on the
   * button becomes the real number rather than the table's `total`; and the
   * cards can be CHECKED before a run instead of after it. A print run is
   * paper, a print shop and a day — finding out afterwards that ninety of the
   * hundred cards have an empty photo box is the expensive way to learn it. */
  React.useEffect(() => {
    let alive = true;
    NGGApi.admin.members.list(Object.assign({}, filters, {
      all: 1, sort: (sort && sort.col) || "", dir: (sort && sort.dir) || "" }))
      .then(r => { if (alive) setRoster(r.members || []); })
      .catch(e => { if (alive) setLoadErr(e.code || e.message || "load_failed"); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, []);

  /* What is missing across the selection. Each of these makes a card that is
     printable but wrong in a way nobody notices until it is in a hand.
   *
   * `key` is the server-side predicate that finds the same rows — see
   * $missingSql in admin_members_list. The two MUST agree: a count that sends
   * you to a roster showing a different number is worse than no link at all.
   * tests/id-batch-ui.test.js and api/tests/run.php pin both ends. */
  const gaps = React.useMemo(() => {
    const r = roster || [];
    const miss = {
      photo: m => !nggPhotoSrc(m.photoUrl),
      printedId: m => !String(m.displayId || "").trim(),
      discipline: m => !String(m.disciplines || m.track || "").trim(),
    };
    return {
      n: r.length,
      rows: [
        { key: "photo", n: r.filter(miss.photo).length,
          thing: "a photograph", so: "the card prints with an empty box" },
        { key: "printedId", n: r.filter(miss.printedId).length,
          thing: "a printed ID", so: "the card falls back to the raw member id" },
        { key: "discipline", n: r.filter(miss.discipline).length,
          thing: "a discipline", so: "that line is left off the card" },
      ],
    };
  }, [roster]);
  const gapTotal = gaps.rows.reduce((a, x) => a + x.n, 0);

  /* The failure list is something to act on, and the action is almost always
     "go and find these people". Reading thirty names six at a time out of a
     scrolling box and retyping them is not that. */
  const [copied, setCopied] = React.useState(false);
  const copyFailed = async () => {
    try {
      await navigator.clipboard.writeText(failed.join("\n"));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (_) { toast.error("The browser would not give us the clipboard — select and copy by hand."); }
  };

  const MODES = [
    { value: "zip", label: "ZIP of images", hint: "A PNG per member, named for them — for emailing or a print merge." },
    { value: "pdf", label: "PDF · a page each", hint: "One page per member at the 54×85mm trim size — a print shop's cut file." },
    { value: "sheet", label: "PDF · imposed sheet", hint: "As many as fit an A4 sheet, with bleed and crop marks, for a print run." },
  ];

  const start = async () => {
    if (run) return;
    const exportFn = design === "classic" ? window.MemberIDCardBatch : window.NggcMemberCardExport;
    if (!exportFn) { toast.error("The card renderer isn't loaded — reload and try again."); return; }
    cancelRef.current = false;
    setFailed([]);
    /* Already read, in the order the table was showing — the sort is carried
       into the print because a run's order is the whole reason somebody sorted
       the table. */
    const members = roster || [];
    if (!members.length) { toast.error("Nobody matches these filters."); return; }
    setRun({ i: 0, n: members.length, note: "" });
    try {
      const out = await exportFn(members, {
        mode, dpi,
        size: design === "a5-wallet" ? "wallet" : "a5",
        cancel: () => cancelRef.current,
        onProgress: (i, n, m) => setRun({ i, n, note: (m && m.fullName) || "" }),
      });
      doneRef.current = true;
      /* Kept in the drawer, not only in a toast. A toast truncated the list to
         three names and then vanished, so a run with eleven gaps left nobody
         able to say which eleven. */
      setFailed(out.failed || []);
      if (out.made > 0) {
        const msg = out.made + " card" + (out.made === 1 ? "" : "s")
          + (out.failed.length ? " · " + out.failed.length + " could not be rendered" : "");
        out.failed.length ? toast.error(msg, "Printed with gaps") : toast.success(msg, "Printed");
        if (!cancelRef.current && !out.failed.length) { close(); return; }
      } else {
        toast.error(cancelRef.current ? "Cancelled before anything was written." : "Nothing could be rendered.");
      }
    } catch (e) {
      toast.error(e.message || "The run failed", "Print failed");
    }
    setRun(null);
  };

  const hintFor = (MODES.find(x => x.value === mode) || {}).hint || "";
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !run) close(); }}>
      <div className="admin-drawer-panel">
        <div className="admin-drawer-head">
          <h3 {...headingProps}>Print member ID cards</h3>
          <button type="button" className="admin-drawer-close" onClick={() => { if (!run) close(); }}>✕</button>
        </div>
        <div className="admin-fields">
          {/* Nothing renders until the roster lands.
              The alternative — a preflight that pops in ABOVE the three selects
              — shifted them down ~50px under a cursor already on its way to
              one, and reserving the space instead only works if you know how
              tall three gap rows will be. Every control here depends on the
              roster regardless, so there is nothing to usefully show first. */}
          {loadErr ? <ErrorState code={loadErr}/> : !roster ? <div className="dash-spinner"/> : (
          <React.Fragment>
          <p className="admin-hint">
            One card for every member the current filters match — <b>{fmtNum(roster.length)}</b> in all,
            in the order the table is sorted. Narrow the list first (centre, type, status) to print a subset.
          </p>

          {/* ── What is missing, BEFORE the run ────────────────────────────
              A card with an empty photo box prints perfectly well and is wrong
              in the hand. Saying so here costs a glance; finding out costs a
              print run.

              The height is reserved while the roster loads, because this block
              sits ABOVE the three selects — letting it pop in shifts everything
              under it down by ~50px, under a cursor already on its way. */}
            <div className="admin-card admin-note-card" style={{ marginBottom: 4 }}>
              {gapTotal === 0 ? (
                <div className="mono" style={{ fontSize: 12 }}>
                  All {fmtNum(gaps.n)} have a photograph, a printed ID and a discipline.
                </div>
              ) : (
                <React.Fragment>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>
                    Before you print
                  </div>
                  {gaps.rows.filter(r => r.n > 0).map(r => (
                    <div key={r.key} style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 6 }}>
                      {/* "40 of 40" is a thing a person has to decode. */}
                      {r.n === gaps.n
                        ? <><b>Nobody</b> has {r.thing}</>
                        : <><b>{fmtNum(r.n)}</b> of {fmtNum(gaps.n)} have no {r.thing.replace(/^an? /, "")}</>}
                      {" — " + r.so + "."}
                      {/* A count nobody can act on is an accusation, not a tool.
                          The roster has no "no photograph" filter to reach for,
                          so this link IS the route to those members. */}
                      {onFilter && (
                        <button type="button" className="admin-inline-link" style={{ marginLeft: 6 }}
                          onClick={() => onFilter(r.key)}>
                          Show {r.n === gaps.n ? "them" : "these " + fmtNum(r.n)}
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="admin-hint" style={{ marginBottom: 0 }}>
                    Printable either way — this is a heads-up, not a block.
                  </p>
                </React.Fragment>
              )}
            </div>
          <label className="admin-field"><span className="admin-label">Card design</span>
            <select className="admin-select" value={design} onChange={e => setDesign(e.target.value)} disabled={!!run}>
              <option value="classic">Classic · 54×85mm</option>
              <option value="a5">NGGC redesign · A5 (148×210mm)</option>
              <option value="a5-wallet">NGGC redesign · wallet (54×85mm)</option>
            </select>
          </label>
          <label className="admin-field"><span className="admin-label">What to make</span>
            <select className="admin-select" value={mode} onChange={e => setMode(e.target.value)} disabled={!!run}>
              {MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <p className="admin-hint" style={{ marginTop: -6 }}>{hintFor}</p>
          <label className="admin-field"><span className="admin-label">Resolution</span>
            <select className="admin-select" value={dpi} onChange={e => setDpi(Number(e.target.value))} disabled={!!run}>
              <option value={150}>150dpi · proof</option>
              <option value={300}>300dpi · print</option>
              <option value={600}>600dpi · fine</option>
            </select>
          </label>
          {failed.length > 0 && (
            <div className="admin-card admin-note-card" style={{ marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#b03535" }}>
                  {fmtNum(failed.length)} could not be rendered
                </div>
                {/* Reading thirty names six at a time and retyping them is not
                    acting on a list. */}
                <button type="button" className="admin-inline-link" onClick={copyFailed}>
                  {copied ? "Copied" : "Copy names"}
                </button>
              </div>
              {/* tabIndex: Chrome 127+ makes an overflowing region focusable on
                  its own, Firefox and Safari do not — without it the names past
                  the sixth are unreachable by keyboard. Named, because an
                  unlabelled focus stop is just "group". */}
              <div tabIndex={0} role="group" aria-label={fmtNum(failed.length) + " members that could not be rendered"}
                style={{ maxHeight: 160, overflowY: "auto", fontSize: 13, lineHeight: 1.7 }}>
                {failed.map((n, i) => <div key={i}>{n}</div>)}
              </div>
            </div>
          )}
          {run && (
            <p className="admin-hint" role="status" style={{ marginTop: 4 }}>
              {run.note === "reading the roster…" || run.note === "writing the file…"
                ? run.note
                : "Rendering " + Math.min(run.i + 1, run.n) + " of " + run.n + (run.note ? " — " + run.note : "")}
            </p>
          )}
          </React.Fragment>
          )}
        </div>
        <div className="admin-drawer-foot">
          {run
            ? <button type="button" className="btn btn-ghost" onClick={() => { cancelRef.current = true; }}>Stop</button>
            : <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>}
          {/* Never falls back to the table's `total`: that is the PAGE count,
              and a button reading "Print 999" for the length of the fetch —
              then correcting itself to "Print 40" — is the exact lie reading
              the roster on open was meant to stop telling. */}
          <button type="button" className="btn btn-primary" onClick={start} disabled={!!run || !roster || !roster.length}>
            {run ? "Working…" : !roster ? "Print…" : "Print " + fmtNum(roster.length)}
          </button>
        </div>
      </div>
    </div>
  );
}
/* The staff roles come from the server (ADMIN_ROLES in util.php, via
   admin.roles) — the screen keeps no copy, because the copy it used to keep
   had drifted: it had no Auditor, so nobody could be made one from here.
   Loaded once per page; every picker, label and matrix reads this. */
let _adminRolesCache = null, _adminRolesLoad = null;
function loadAdminRoles() {
  if (_adminRolesCache) return Promise.resolve(_adminRolesCache);
  if (!_adminRolesLoad) _adminRolesLoad = NGGApi.admin.roles().then(r => (_adminRolesCache = r)).catch(e => { _adminRolesLoad = null; throw e; });
  return _adminRolesLoad;
}
function useAdminRoles() {
  const [r, setR] = React.useState(_adminRolesCache);
  React.useEffect(() => { if (!r) loadAdminRoles().then(setR).catch(() => {}); }, []);
  return r;
}
function adminRoleLabel(id) {
  if (!id || id === "member") return "Member";
  const r = _adminRolesCache && _adminRolesCache.roles.find(x => x.id === id);
  return r ? r.label : String(id).replace(/_/g, " ");
}
/* Options for a role picker: "Member" plus the roles this operator may grant,
   and the account's current role even if they may not (so it still reads). */
function adminRoleOptions(roles, current) {
  const list = [{ value: "member", label: "Member (no staff access)" }];
  ((roles && roles.roles) || []).forEach(r => { if (r.mayGrant || r.id === current) list.push({ value: r.id, label: r.label + (r.scoped ? " · own centres only" : "") }); });
  return list;
}
/* "Elevated" = reaches as far as an admin: granting it is confirmed. */
function adminRoleElevated(id) {
  const r = _adminRolesCache && _adminRolesCache.roles.find(x => x.id === id);
  return r ? r.tier >= 4 : (id === "admin" || id === "super_admin");
}

function AdminMemberEditor({ data, onClose, onSaved }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose);
  const rolesReg = useAdminRoles();
  const { hasCap, member: me } = useAuth();
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  // Role changes are the highest-consequence edit here. Confirm before granting
  // elevated access, and warn a staffer editing THEIR OWN record before they
  // drop their own access (a lock-out risk the server also guards).
  const isSelf = me && d.memberId && d.memberId === me.memberId;
  const setRole = async (v) => {
    const from = d.role || "member";
    if (v === from) return;
    if (isSelf && adminRoleElevated(from) && !adminRoleElevated(v)) {
      const ok = await dialog.confirm({ title: "Change your own access?", body: "You're lowering your OWN staff level. You may immediately lose access to parts of the Control Room. The last active super admin cannot be demoted.", cta: "Change my access", cancel: "Keep as is", danger: true });
      if (!ok) return;
    } else if (adminRoleElevated(v)) {
      const ok = await dialog.confirm({ title: "Grant " + (v === "super_admin" ? "super admin" : "admin") + " access?", body: (d.fullName || "This member") + " will be able to " + (v === "super_admin" ? "manage everything, including roles and the audit trail." : "manage members, content and the inbox."), cta: "Grant access", cancel: "Cancel", danger: v === "super_admin" });
      if (!ok) return;
    }
    set("role", v);
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await NGGApi.admin.members.upsert(d);
      onSaved();
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{d.memberId ? "Edit member" : "New member"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Full name" value={d.fullName||""} onChange={v => set("fullName", v)} required/>
          <Field label="Email"     value={d.email||""}    onChange={v => set("email", v)}    required type="email"/>
          <Field label="Phone"     value={d.phone||""}    onChange={v => set("phone", v)}/>
          <div className="admin-fields-row">
            <FieldSelect label="Type" value={d.type||"NGG"} onChange={v => set("type", v)} options={["NGG","Summer"]}/>
            <FieldCentre value={d.centre} onChange={v => set("centre", v)}/>
          </div>
          <div className="admin-fields-row">
            <FieldSelect label="Status" value={d.status||"active"} onChange={v => set("status", v)} options={MEMBER_STATUS_OPTS}/>
            <Field label="Track" value={d.track||""} onChange={v => set("track", v)}/>
          </div>
          {/* ID-card (NGGC redesign): printed year-chapter-serial + up to two
              disciplines shown on the card. Blank falls back to the member id
              and the single track respectively. */}
          <div className="admin-fields-row">
            <Field label="Printed ID" value={d.displayId||""} onChange={v => set("displayId", v)} placeholder="26-AM-135"/>
            <Field label="Disciplines (1–2)" value={d.disciplines||""} onChange={v => set("disciplines", v)} placeholder="TECH, MEDIA"/>
          </div>
          {/* NGG level — the first thing a centre lead asks about a child, and
              a column since schema 109. Free text rather than a fixed list:
              the roster has used A, B, C and O so far and the programme has
              renamed its levels before. */}
          <Field label="NGG level" value={d.level||""} onChange={v => set("level", v.toUpperCase())} placeholder="A"/>
          {/* Division — the brief's four (§5), and a fixed list where NGG level
              above is free text, for the opposite reason: the levels have been
              renamed before, the divisions are a commitment with a mandate
              attached. "Not placed yet" is an option rather than an empty
              first entry, because unplaced is a real answer a lead gives on
              purpose and it should be possible to say it deliberately. */}
          <FieldSelect label="Division" value={d.division||""} onChange={v => set("division", v)}
            options={[{ value: "", label: "— Not placed yet —" }].concat(
              (window.NGGC_DIVISIONS || []).map(x => ({ value: x.id, label: x.code + " · " + x.name })))}/>
          <div className="admin-field"><span>Photo</span><PhotoCapture value={d.photoUrl||""} onChange={v => set("photoUrl", v)}/></div>
          <Field label="Parent email" value={d.parentEmail||""} onChange={v => set("parentEmail", v)} type="email"/>
          <Field label="School" value={d.school||""} onChange={v => set("school", v)}/>
          {/* Staff level — only super_admins (the 'rbac' capability) may assign roles.
              setRole confirms elevation and warns on self-demotion. */}
          {hasCap && hasCap("rbac") && (
            <FieldSelect label="Staff level (access)" value={d.role||"member"} onChange={setRole} options={adminRoleOptions(rolesReg, data.role)}/>
          )}
          {hasCap && hasCap("rbac") && d.memberId && (
            <div className="admin-field">
              <span className="admin-label">Account recovery</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!(await dialog.confirm({ title: "Reset this member's 2FA?",
                    body: "They will re-enrol an authenticator the next time they sign in to the Console. Until they do, they cannot get in.",
                    cta: "Reset 2FA" }))) return;
                  try { await NGGApi.admin.members.reset2fa(d.memberId); toast.success("2FA reset — they'll set it up again next sign-in.", "Done"); } catch (e) { toast.error(e.code || e.message); }
                }}>Reset 2FA</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!(await dialog.confirm({ title: "Clear this member's password?",
                    body: "Their current password stops working. They sign in with an emailed code and set a new one.",
                    cta: "Clear password" }))) return;
                  try { await NGGApi.admin.members.resetPassword(d.memberId); toast.success("Password cleared — they can sign in by email code.", "Done"); } catch (e) { toast.error(e.code || e.message); }
                }}>Reset password</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!(await dialog.confirm({ title: "View the app as " + (d.fullName || "this member") + "?",
                    body: "You will be signed in as them — and anything you do will be recorded against them — until you stop impersonating.",
                    cta: "View as them" }))) return;
                  try { await NGGApi.admin.members.impersonate(d.memberId); window.location.href = "/dashboard"; } catch (e) { toast.error(e.code || e.message); }
                }}>View as member</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={async () => {
                  if (!(await dialog.confirm({ title: "Delete and anonymise " + (d.fullName || "this member") + "?",
                    body: "Their name, contact details and journal entries are scrubbed and every session is revoked. The record of the deletion stays in the audit log. This cannot be undone.",
                    cta: "Delete and anonymise", cancel: "Keep the member", danger: true }))) return;
                  try { await NGGApi.admin.members.remove(d.memberId); toast.success("Member deleted & anonymised.", "Done"); (onSaved || onClose)(); } catch (e) { toast.error(e.code || e.message); }
                }}>Delete member</button>
              </div>
            </div>
          )}
          {hasCap && hasCap("rbac") && d.memberId && d.role && d.role !== "member" && (
            <MemberCapsEditor member={d}/>
          )}
          {d.memberId && (!d.role || d.role === "member") && (
            <MemberConsentEditor member={d}/>
          )}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : (d.memberId ? "Save changes" : "Create member")}</button>
        </div>
      </form>
    </div>
  );
}

/* ---- Publication consent for one child ------------------------------------
 * Club members are minors — their record carries a date of birth, a guardian
 * and a school — so their name and face are published only if a guardian said
 * so. Staff record here what a guardian actually told them, on the paper form
 * or over the phone, which is how the programme already works.
 *
 * `method` is mandatory. A ledger row that does not say how the decision was
 * obtained is a checkbox, not evidence, and this is the record the programme
 * would have to stand behind.
 *
 * One child at a time, on purpose. A "mark this whole centre consented" button
 * is the obvious next request and the wrong feature: it manufactures a
 * permission for people nobody spoke to, and the ledger would then be worth
 * nothing exactly when it mattered.
 */
const CONSENT_METHODS = ["Paper form", "Parent portal", "By phone", "In person", "Email/SMS reply"];

function MemberConsentEditor({ member }) {
  const [state, setState] = React.useState(member.consent || {});
  const [method, setMethod] = React.useState(CONSENT_METHODS[0]);
  const [guardian, setGuardian] = React.useState("");
  const [busy, setBusy] = React.useState("");

  /* `guardianOnly` rows record the guardian's own decision, so the ledger
     names the guardian — never the staff member pressing the button. */
  const record = async (type, status, guardianOnly) => {
    if (guardianOnly && guardian.trim().length < 3) { toast.error("Enter the guardian's name first."); return; }
    setBusy(type + status);
    try {
      const r = await NGGApi.admin.members.consent(member.memberId, type, status, method, guardianOnly ? guardian.trim() : undefined);
      setState(Object.assign({}, state, r.consent, { mayName: r.mayName }));
      toast.success(status === "granted" ? "Consent recorded." : "Refusal recorded.", "Saved");
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };

  const row = (type, label, note, guardianOnly) => {
    const cur = state[type];
    const st = cur && cur.status;
    return (
      <div key={type} data-consent-row={type} style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
        padding: "10px 0", borderTop: "1px solid var(--line,#e4ddcc)" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{note}</div>
          {cur
            ? <div style={{ fontSize: 12, marginTop: 3, color: st === "granted" ? "#2f7a3f" : "#b03535" }}>
                {st === "granted" ? "Granted" : "Declined"} · {cur.method || "no method recorded"}
                {cur.by ? " · by " + cur.by : ""}{cur.at ? " · " + String(cur.at).slice(0, 10) : ""}
              </div>
            /* Not "declined" — nobody has been asked. Saying so is the point:
               it is a task outstanding, not a decision that was made. */
            : <div style={{ fontSize: 12, marginTop: 3, color: "var(--ink-500)", fontStyle: "italic" }}>
                Not recorded — this child is not named publicly
              </div>}
        </div>
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <button type="button" className={"btn btn-sm" + (st === "granted" ? " btn-primary" : " btn-ghost")}
            disabled={!!busy} onClick={() => record(type, "granted", guardianOnly)}>{busy === type + "granted" ? "…" : "Granted"}</button>
          <button type="button" className={"btn btn-sm" + (st === "declined" ? " btn-primary" : " btn-ghost")}
            disabled={!!busy} onClick={() => record(type, "declined", guardianOnly)}>{busy === type + "declined" ? "…" : "Declined"}</button>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-field">
      <span className="admin-label">Publication consent</span>
      <p className="admin-hint" style={{ margin: "2px 0 8px" }}>
        What a guardian has agreed may appear on the public website. With nothing recorded this child
        appears on the boards as <b>{state.handle || "a handle"}</b> — keeping their rank and score, but not their name.
      </p>
      <label className="admin-field">
        <span>How was this decision obtained?</span>
        <select className="admin-select" value={method} onChange={e => setMethod(e.target.value)}>
          {CONSENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      {row("site_visibility", "Feature on our website", "Their first name and last initial may be shown.")}
      {row("media", "Photos & media", "Their photograph may be published — needs the one above as well.")}
      <label className="admin-field">
        <span>Guardian who gave it (for the NGV row)</span>
        <input className="admin-input" value={guardian} onChange={e => setGuardian(e.target.value)} placeholder="The guardian's full name"/>
      </label>
      {row("ngv_transfer", "Share with NextGen Vanguard",
           "Share my child's details with Afrovanguard's NextGen Vanguard. Needed before a member under 18 can be promoted to NGV.", true)}
    </div>
  );
}

// ============================================================================
// Mentors
// ============================================================================

/* Which centre somebody belongs to, readable without reading.
   On a list of forty volunteers the centre was a word in small grey type, in
   the same place on every row — so nobody could tell at a glance who worked
   where. Centres already carried their own colour; this puts it on the photo
   and keeps the CODE next to it, because colour alone is not a label. */
function CentreRing({ centre, centres, url, name, size }) {
  const c = (centres || {})[centre];
  const px = size || 56;
  const tint = c ? c.color : "rgba(12,20,50,0.18)";
  /* The code chip and the initial both sit ON the centre colour, and both used
     to be white with a drop shadow regardless of what that colour was. A shadow
     does not rescue white on the pale yellow an admin can pick in one click — it
     smudges it. The ink comes from the colour now, and a pale chip gets a
     hairline so it still reads as a chip against the white ring and the white
     row behind it. */
  const ink = inkOn(c ? c.color : "");
  return (
    <span className="centre-ring" style={{ width: px, height: px, borderColor: tint }}
      title={centre || "No centre set"}>
      {url
        ? <img src={url} alt="" className="centre-ring-img"/>
        : <span className="centre-ring-img centre-ring-fallback" style={{ background: tint, color: ink.ink }}>{(name || "?").charAt(0)}</span>}
      {c && <span className="centre-ring-code mono" style={{ background: c.color, color: ink.ink, textShadow: ink.shadow,
                                                            outline: ink.light ? "1px solid " + ink.hairline : "none", outlineOffset: -3 }}>{c.code}</span>}
    </span>
  );
}

function RankChip({ rank }) {
  if (rank !== "lead") return null;
  return <span className="chip chip-gold" title="Runs this centre — sees every child there, and the mentors working with them">LEAD</span>;
}

/* Promote somebody already in the programme onto the mentor roster.
   A picker, because "make X a mentor" over a list of hundreds is mostly the
   problem of finding X — members and volunteers together, since a coordinator
   thinks in people, not in which table they live in. */
function MentorPromote({ centres, onClose, onDone }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [pick, setPick] = React.useState(null);
  const [rank, setRank] = React.useState("mentor");
  const [programme, setProgramme] = React.useState("summer");
  const [centre, setCentre] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      NGGApi.admin.mentor.candidates(q).then(r => { if (live) setRows(r.candidates || []); }).catch(() => { if (live) setRows([]); });
    }, q ? 220 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const choose = (c) => { setPick(c); setCentre(c.centre || ""); setDept(c.faculty || ""); };
  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.mentor.promote(pick.personId, { rank, programme, centre, department: dept });
      toast.success(pick.fullName + " is now a " + (rank === "lead" ? "lead mentor" : "mentor") + (r.created ? "" : " (record updated)"), "Added to the roster");
      onDone();
    } catch (e) { toast.error(e.code || e.message); setBusy(false); }
  };
  const { panelRef, close, titleProps, headingProps } = useAdminDrawer(onClose, false);
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel">
        <div className="admin-drawer-head">
          <h3 {...headingProps}>Make someone a mentor</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
      <p className="admin-hint">Anyone already in the programme — a member, or a summer volunteer. Their mentor record remembers which account or card they sign in with, so an instructor holding an ID card is matched too.</p>
      <label className="admin-field"><span className="admin-label">Search</span>
        <input className="admin-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email or ID" autoFocus/>
      </label>
      <div style={{ maxHeight: 210, overflowY: "auto", border: "1px solid rgba(12,20,50,0.1)", borderRadius: 10, margin: "8px 0 14px" }}>
        {rows === null && <p className="admin-hint" style={{ padding: 12 }}>Searching…</p>}
        {rows && !rows.length && <p className="admin-hint" style={{ padding: 12 }}>Nobody matches — or everyone who does is already a mentor.</p>}
        {(rows || []).map(c => (
          <button key={c.kind + c.personId} onClick={() => choose(c)}
            className={"admin-pick-row" + (pick && pick.personId === c.personId ? " is-on" : "")}>
            <CentreRing centre={c.centre} centres={centres} name={c.fullName} size={36}/>
            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <span style={{ fontWeight: 600, display: "block" }}>{c.fullName}</span>
              <span className="mono admin-cell-sub">{c.kind} · {c.centre || "no centre"}{c.email ? " · " + c.email : ""}</span>
            </span>
          </button>
        ))}
      </div>
      {pick && <>
        <div className="admin-fields-row">
          <FieldSelect label="Rank" value={rank} onChange={setRank}
            options={[{ value: "mentor", label: "Mentor — their class" }, { value: "lead", label: "Lead mentor — the whole centre" }]}/>
          <FieldSelect label="Programme" value={programme} onChange={setProgramme}
            options={[{ value: "summer", label: "Summer School" }, { value: "ngg", label: "NGG Club" }, { value: "both", label: "Both" }]}/>
        </div>
        <div className="admin-fields-row">
          <FieldSelect label="Centre" value={centre} onChange={setCentre}
            options={[{ value: "", label: "— every centre —" }].concat(Object.keys(centres || {}).map(n => ({ value: n, label: n })))}/>
          <Field label={rank === "lead" ? "Faculty (ignored for a lead)" : "Faculty (blank = the whole centre)"}
            value={dept} onChange={setDept}/>
        </div>
        <p className="admin-hint">
          {rank === "lead"
            ? "A lead sees every child at their centre and how active the mentors there are."
            : "A mentor sees their centre, narrowed to their department if one is set."}
        </p>
      </>}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!pick || busy} onClick={submit}>
            {busy ? "Saving…" : pick ? "Make " + pick.fullName.split(" ")[0] + " a " + (rank === "lead" ? "lead mentor" : "mentor") : "Pick someone"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Two active mentor records answering to one email.
 *
 * The portal gate refuses to resolve an ambiguous address rather than pick
 * between two people's classes, which means everybody in a pair is locked out
 * of the Mentor Portal until somebody separates them. They cannot report it:
 * the thing that is broken is their way in. So it is surfaced here, on the
 * screen where it gets fixed, rather than waiting in a log.
 *
 * No "merge" button on purpose. Resolving a pair means deciding whether it is
 * one person with a duplicate record or two people on a shared family mailbox,
 * and getting that wrong hands an adult another adult's children. Each record
 * opens for editing; the desk decides which address changes. */
function MentorEmailClashes({ onOpen }) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.admin.mentors.duplicates()
      .then(r => { if (alive) setD(r); })
      .catch(() => { if (alive) setD(null); });
    return () => { alive = false; };
  }, []);
  if (!d || !d.duplicates || !d.duplicates.length) return null;
  return (
    <div className="admin-clash" role="alert">
      <div className="admin-clash-h">
        {d.duplicates.length === 1 ? "One email is claimed by two mentor records."
          : d.duplicates.length + " emails are each claimed by more than one mentor record."}
      </div>
      <p className="admin-clash-p">
        The Mentor Portal cannot tell these records apart, so it lets none of them in.
        Give each person their own address — or retire the record that is not theirs —
        and they are back in immediately.
      </p>
      {d.duplicates.map(g => (
        <div key={g.email} className="admin-clash-group">
          <div className="mono admin-clash-email">{g.email}</div>
          <ul className="admin-clash-rows">
            {g.records.map(r => (
              <li key={r.mentorId}>
                <button type="button" onClick={() => onOpen && onOpen(r.mentorId)}>
                  <span className="admin-clash-name">{r.fullName || r.mentorId}</span>
                  <span className="mono admin-clash-meta">
                    {r.centre || "no centre"}
                    {r.source ? " · " + r.source : ""}
                    {/* A linked record is reached by its member/volunteer id and
                        never by the email fallback — so it still works, and it
                        is usually the one to keep. Worth saying, because it is
                        the fact that decides most of these. */}
                    {r.linked ? " · linked — still signs in" : " · locked out"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AdminMentors() {
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);
  const [promoting, setPromoting] = React.useState(false);
  const [centres, setCentres] = React.useState({});
  const [titles, setTitles] = React.useState(null);
  const load = () => {
    setErr("");
    NGGApi.admin.mentorship.roster().then(r => setCentres(r.centres || {})).catch(() => {});
    return NGGApi.admin.mentors.list().then(r => { setList(r.mentors || []); setTitles({ list: r.titles || [], def: r.titleDefault || "" }); }).catch(e => setErr(e.code || e.message || "load_failed"));
  };
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Mentors</h2>
        <div className="admin-section-actions">
          {/* The gap the field reported: records only appeared by converting a
              mentor APPLICATION, so somebody already in the programme had to
              have one invented for them. */}
          <button className="btn btn-primary btn-sm" onClick={() => setPromoting(true)}>+ Make someone a mentor</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing({})}>Add from scratch</button>
        </div>
      </div>
      {promoting && <MentorPromote centres={centres} onClose={() => setPromoting(false)} onDone={() => { setPromoting(false); load(); }}/>}
      <MentorEmailClashes onOpen={(mentorId) => {
        const row = (list || []).find(x => x.mentorId === mentorId);
        setEditing(row || { mentorId });
      }}/>
      {list === null ? (err ? <ErrorState code={err} onRetry={load}/> : <div className="dash-spinner"/>) :
        <div className="admin-grid-cards">
          {list.map(m => (
            <button key={m.mentorId} className="admin-card" onClick={() => setEditing(m)}>
              <CentreRing centre={m.centre} centres={centres} url={m.photoUrl} name={m.fullName} size={72}/>
              <div className="admin-card-name">{m.fullName} <RankChip rank={m.rank}/></div>
              {/* Which cohort they supervise, on the card rather than only in
                  the drawer: it decides whose children they can see, and that
                  is not something anyone should have to open twenty drawers
                  to audit. */}
              <div className="mono admin-card-meta">
                {{ ngg: "NGG Club", both: "Both programmes" }[m.programme] || "Summer School"}
                {m.centre ? " · " + m.centre : ""}
              </div>
              <div className="mono admin-card-meta">{(m.tracks || []).join(", ")}</div>
            </button>
          ))}
          {list.length === 0 && <div className="admin-empty">No mentors yet.</div>}
        </div>
      }
      {editing && <AdminMentorEditor data={editing} titles={titles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminMentorEditor({ data, titles: titlesIn, onClose, onSaved }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose);
  const [d, setD] = React.useState(Object.assign({}, data, { tracks: Array.isArray(data.tracks) ? data.tracks.join(", ") : (data.tracks || "") }));
  /* Opened from the Mentorship roster, whose rows are not the mentor record:
     the titles and this mentor's own title come from the mentors list. */
  const [titles, setTitles] = React.useState(titlesIn || null);
  React.useEffect(() => {
    if (titlesIn && data.honorific !== undefined) return;
    NGGApi.admin.mentors.list().then(r => {
      setTitles({ list: r.titles || [], def: r.titleDefault || "" });
      const me = (r.mentors || []).find(m => m.mentorId === data.mentorId);
      if (me && d.honorific === undefined) setD(o => Object.assign({ honorific: me.honorific || "" }, o));
    }).catch(() => {});
    /* eslint-disable-next-line */
  }, []);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.mentors.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code === "bad_title" ? "Choose a title from the list." : e.code === "email_taken" ? "Another active mentor already uses that email." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{d.mentorId ? "Edit mentor" : "New mentor"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Full name" value={d.fullName||""} onChange={v => set("fullName", v)} required/>
          {/* How a child addresses them: title and surname, never the first name. */}
          {titles && titles.list.length > 0 && <FieldSelect label={"Title — children see “" + (d.honorific || titles.def) + " " + ((d.fullName || "").trim().split(/\s+/).pop() || "…") + "”"}
            value={d.honorific || ""} onChange={v => set("honorific", v)} options={[{ value: "", label: "None (" + titles.def + ")" }].concat(titles.list.map(t => ({ value: t, label: t })))}/>}
          <Field label="Email" value={d.email||""} onChange={v => set("email", v)} required type="email"/>
          <Field label="Phone" value={d.phone||""} onChange={v => set("phone", v)}/>
          <Field label="Tracks (comma separated)" value={d.tracks||""} onChange={v => set("tracks", v)} placeholder="Music, Tech, Leadership"/>
          <FieldCentre value={d.centre} onChange={v => set("centre", v)} extra={["Both"]}/>
          {/* Which cohort this mentor supervises. It decides whose names appear
              on their roster and whom they can award stars to, so it is a
              safeguarding control, not a label — an NGG mentor set to 'both'
              can see and rate every summer child. Defaults to Summer School,
              which is exactly what every mentor could see before the field
              existed. */}
          <FieldSelect label="Supervises" value={d.programme||"summer"} onChange={v => set("programme", v)}
            options={[{ value: "summer", label: "Summer School" }, { value: "ngg", label: "NGG Club" }, { value: "both", label: "Both programmes" }]}/>
          {/* Lead or not is set here, so a lead can be stepped down without re-promoting them. */}
          <FieldSelect label="Role" value={d.rank||"mentor"} onChange={v => set("rank", v)}
            options={[{ value: "mentor", label: "Mentor" }, { value: "lead", label: "Lead mentor (runs the centre's mentors)" }, { value: "peer", label: "Peer mentor (supports a mentor; cannot approve)" }]}/>
          <Field label="Department (a course, to narrow who they see)" value={d.department||""} onChange={v => set("department", v)} placeholder="Leave empty to mentor across courses"/>
          <FieldSelect label="Status" value={d.status||"pending-checks"} onChange={v => set("status", v)} options={["active","pending-checks","on-break","retired"]}/>
          <Field label="Max mentees" value={d.maxMentees||"8"} onChange={v => set("maxMentees", v)} type="number"/>
          <div className="admin-field"><span>Photo</span><PhotoCapture value={d.photoUrl||""} onChange={v => set("photoUrl", v)}/></div>
          <FieldTextarea label="Public bio" value={d.bio||""} onChange={v => set("bio", v)}/>
          <div className="admin-fields-row">
            <FieldSelect label="Source" value={d.source||"ngg"} onChange={v => set("source", v)} options={["ngg","afrovanguard"]}/>
            <Field label="STS program" value={d.program||""} onChange={v => set("program", v)} placeholder="Street-To-Stardom · Next Gen"/>
          </div>
          <Field label="Skills / expertise" value={d.skills||""} onChange={v => set("skills", v)} placeholder="Guitar, public speaking, coding…"/>
          <div className="admin-fields-row">
            <Field label="LinkedIn" value={d.linkedin||""} onChange={v => set("linkedin", v)}/>
            <Field label="Afrovanguard ref" value={d.afrovanguardRef||""} onChange={v => set("afrovanguardRef", v)} placeholder="STS volunteer ID / note"/>
          </div>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : (d.mentorId ? "Save changes" : "Create mentor")}</button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Mentorship manager — overview, roster + mentee pairing, mentor applications,
// and the Afrovanguard (Street-To-Stardom) connection.
// ============================================================================

function AdminMentorship() {
  const [promoting, setPromoting] = React.useState(false);
  const [ov, setOv] = React.useState(null);
  const [roster, setRoster] = React.useState(null);
  const [apps, setApps] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [err, setErr] = React.useState("");

  const load = () => {
    NGGApi.admin.mentorship.overview().then(r => setOv(r.overview)).catch(e => setErr(e.code || e.message));
    NGGApi.admin.mentorship.roster().then(r => setRoster(r)).catch(e => setErr(e.code || e.message));
    NGGApi.admin.applications.list({ kind: "mentor", status: "new" }).then(r => setApps(r.applications || [])).catch(() => {});
  };
  React.useEffect(() => { load(); }, []);

  const convert = async (id) => {
    try { const r = await NGGApi.admin.mentorship.convertApp(id); toast.success("Mentor created: " + r.mentorId); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const pair = async (mentorId, memberId, sessionId) => {
    if (!memberId) return;
    try { await NGGApi.admin.mentorship.assign(memberId, mentorId, sessionId); toast.success("Mentee paired"); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const unpair = async (memberId, name, sessionId) => {
    const ok = await dialog.confirm({ title: "Unpair " + (name || "this mentee") + "?", body: "Ends the active mentor pairing for this session.", cta: "Unpair" });
    if (!ok) return;
    try { await NGGApi.admin.mentorship.unassign(memberId, sessionId); toast.success("Unpaired"); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };

  if (err) return <ErrorState title="Couldn't load" code={err} onRetry={load}/>;
  if (!ov || !roster) return <div className="admin-section"><div className="dash-spinner"/></div>;
  const av = ov.afrovanguard || {};
  const unassigned = roster.unassigned || [];

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Mentorship</h2>
        <div className="admin-section-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setPromoting(true)}>+ Make someone a mentor</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing({})}>Add from scratch</button>
        </div>
      </div>
      {promoting && <MentorPromote centres={roster.centres || {}} onClose={() => setPromoting(false)} onDone={() => { setPromoting(false); load(); }}/>}

      {/* Afrovanguard connection */}
      <div className="admin-av-panel">
        <div>
          <div className="mono admin-av-eyebrow">CONNECTED · AFROVANGUARD MENTORSHIP</div>
          <div className="admin-av-prog">{av.mentorProgram || "Street-To-Stardom"}</div>
          <p className="admin-av-note">NGG mentorship runs inside Afrovanguard's Street-To-Stardom. Mentors are drawn from the shared volunteer pool.</p>
        </div>
        <div className="admin-av-links">
          <a className="btn btn-ghost btn-sm" href={av.volunteerUrl} target="_blank" rel="noopener noreferrer">Volunteer hub ↗</a>
          <a className="btn btn-ghost btn-sm" href={av.stsUrl} target="_blank" rel="noopener noreferrer">STS programs ↗</a>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="admin-tiles" style={{ marginTop: 4 }}>
        <AdminTile n={ov.active} l="Active mentors"/>
        <AdminTile n={ov.pending} l="Pending checks"/>
        <AdminTile n={ov.applications} l="Applications"/>
        <AdminTile n={ov.openSeats} l="Open seats"/>
        <AdminTile n={ov.unassignedMembers} l="Unpaired members"/>
        <AdminTile n={ov.fromAfrovanguard} l="From Afrovanguard"/>
      </div>

      {/* Pending mentor applications */}
      {apps.length > 0 && (
        <div className="admin-panel" style={{ marginTop: 18 }}>
          <h3 className="admin-h3">Mentor applications · {apps.length}</h3>
          {apps.map(a => (
            <div key={a.id} className="admin-mentor-app">
              <div>
                <b>{a.name}</b> <span className="mono admin-cell-sub">{a.email}{a.role ? " · " + a.role : ""}{a.centre ? " · " + a.centre : ""}</span>
                {a.why && <p className="admin-app-why">{a.why}</p>}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => convert(a.id)}>Approve → mentor</button>
            </div>
          ))}
        </div>
      )}

      {/* Roster with pairing */}
      <h3 className="admin-h3" style={{ marginTop: 20 }}>Mentor roster · {roster.mentors.length}</h3>
      <div className="admin-roster">
        {roster.mentors.map(m => (
          <div key={m.mentorId} className="admin-roster-card">
            <div className="admin-roster-head">
              {m.photoUrl ? <img src={m.photoUrl} alt="" className="admin-roster-avatar" onError={e => { e.target.style.display = "none"; }}/> : <div className="admin-roster-avatar admin-card-img-fallback">{(m.fullName || "?").charAt(0)}</div>}
              <CentreRing centre={m.centre} centres={roster.centres} url={m.photoUrl} name={m.fullName} size={38}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="admin-roster-name">
                  {m.fullName}
                  {m.rank === "lead" && <span className="chip chip-gold" style={{ marginLeft: 8 }} title="Runs this centre — sees every child there, and how active its mentors are">LEAD</span>}
                  <span className={"chip " + (m.status === "active" ? "chip-lime" : "chip-gold")} style={{ marginLeft: 8 }}>{m.status}</span>
                  {m.source === "afrovanguard" && <span className="chip chip-navy" style={{ marginLeft: 6 }}>AV</span>}
                </div>
                <div className="mono admin-cell-sub">{m.centre}{m.department ? " · " + m.department : ""}{(m.tracks || []).length ? " · " + m.tracks.join(", ") : ""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button>
            </div>
            <div className="admin-roster-cap">
              <span className="mono">{m.menteeCount} / {m.maxMentees || 0} mentees</span>
              <span className={"chip " + (m.openSeats > 0 ? "chip-lime" : "chip-coral")}>{m.openSeats > 0 ? m.openSeats + " open" : "full"}</span>
            </div>
            {m.mentees.length > 0 && (
              <div className="admin-roster-mentees">
                {m.mentees.map(x => (
                  <span key={x.memberId} className="chip admin-mentee-chip" title={x.centre + " · " + x.track}>
                    {x.fullName}
                    <button className="admin-mentee-x" onClick={() => unpair(x.memberId, x.fullName, roster.sessionId)} aria-label={"Unpair " + x.fullName}>✕</button>
                  </span>
                ))}
              </div>
            )}
            {m.openSeats > 0 && unassigned.length > 0 && (
              <select className="admin-select admin-roster-pair" defaultValue="" onChange={e => { pair(m.mentorId, e.target.value, roster.sessionId); e.target.value = ""; }}>
                <option value="">+ Pair a mentee…</option>
                {unassigned.map(u => <option key={u.memberId} value={u.memberId}>{u.fullName} · {u.centre}{u.track ? " · " + u.track : ""}</option>)}
              </select>
            )}
          </div>
        ))}
        {roster.mentors.length === 0 && <div className="admin-empty">No mentors yet. Approve an application or add one.</div>}
      </div>

      {unassigned.length > 0 && (
        <p className="admin-hint" style={{ marginTop: 14 }}>{unassigned.length} active member{unassigned.length === 1 ? "" : "s"} still need a mentor this session.</p>
      )}

      {editing && <AdminMentorEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}
function CheckinDesks() { return <GateLinks scope="checkin"/>; }

// ============================================================================
// Sessions (TONI/MEDI/SUMMER/DOMI)
// ============================================================================

function AdminSessions() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [list, setList] = React.useState(null);
  const [source, setSource] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [syncing, setSyncing] = React.useState(false);
  const load = () => NGGApi.admin.sessions.list(year).then(r => { setList(r.sessions || []); setSource(r.source || null); }).catch(e => { toast.error(e.code || e.message); setList([]); });
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);
  // CACENTRE keeps the one calendar; NGG fills its sessions from it (sessions_sync).
  const fromCac = !!(source && source.fromCacentre);
  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await NGGApi.admin.sessions.sync();
      if (r.sync && r.sync.ok === false) toast.error("CACENTRE did not answer: " + (r.sync.error || "try again later"));
      else toast.success("Sessions brought in from CACENTRE");
      load();
    } catch (e) { toast.error(e.code || e.message); }
    finally { setSyncing(false); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Sessions · {year}</h2>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>◀ {year - 1}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>{year + 1} ▶</button>
        </div>
      </div>
      {source && !source.off && (
        <div className="admin-sessions-source" role="status">
          {fromCac
            ? <span>Kept on CACENTRE, the one calendar for every site{source.syncedAt ? " · brought in " + fmtDate(source.syncedAt) : ""}.{source.error ? " Last try failed: " + source.error : ""}</span>
            : <span>Edited here until CACENTRE answers{source.error ? " (" + source.error + ")" : ""}. After that, sessions are changed on CACENTRE.</span>}
          <span style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            <button className="btn btn-ghost btn-sm" onClick={syncNow} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</button>
            {source.editUrl && <a className="btn btn-primary btn-sm" href={source.editUrl} target="_blank" rel="noopener noreferrer">Edit in CACENTRE ↗</a>}
          </span>
        </div>
      )}
      {list === null ? <div className="dash-spinner"/> :
        <div className="admin-sessions-grid">
          {list.map(s => (
            <button key={s.sessionId} className={"admin-session-card" + (s.isActive ? " is-active" : "")} onClick={() => setEditing(s)}>
              <div className="mono">{s.code}</div>
              <div className="admin-session-name">{s.name}</div>
              <div className="admin-session-dates">{fmtDate(s.startDate)} — {fmtDate(s.endDate)}</div>
              {s.theme && <div className="admin-session-theme">"{s.theme}"</div>}
              {s.isActive && <div className="mono admin-session-live">LIVE NOW</div>}
            </button>
          ))}
        </div>
      }
      {editing && <AdminSessionEditor data={editing} readOnly={fromCac} editUrl={source && source.editUrl} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminSessionEditor({ data, readOnly, editUrl, onClose, onSaved }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose);
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    try { await NGGApi.admin.sessions.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code === "sessions_on_cacentre" ? "Sessions are kept on CACENTRE — change them there." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{d.sessionId} · {d.year}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        {readOnly
          ? <div className="admin-fields">
              <p className="admin-sessions-note">This session comes from CACENTRE. Change its dates, name, theme or cover there; every site picks the change up within ten minutes.</p>
              <dl className="admin-session-dl">
                <dt>Name</dt><dd>{d.name}</dd>
                <dt>Dates</dt><dd>{fmtDate(d.startDate)} — {fmtDate(d.endDate)}</dd>
                <dt>Theme</dt><dd>{d.theme || "—"}</dd>
              </dl>
            </div>
          : <div className="admin-fields">
              <Field label="Display name" value={d.name||""} onChange={v => set("name", v)}/>
              <Field label="Start date" value={d.startDate||""} onChange={v => set("startDate", v)} type="date" required/>
              <Field label="End date"   value={d.endDate||""}   onChange={v => set("endDate", v)}   type="date" required/>
              <Field label="Theme" value={d.theme||""} onChange={v => set("theme", v)} placeholder='"Build the room." etc.'/>
              <Field label="Cover image URL" value={d.coverUrl||""} onChange={v => set("coverUrl", v)}/>
              <FieldTextarea label="Internal notes" value={d.notes||""} onChange={v => set("notes", v)}/>
            </div>}
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>{readOnly ? "Close" : "Cancel"}</button>
          {readOnly
            ? (editUrl && <a className="btn btn-primary" href={editUrl} target="_blank" rel="noopener noreferrer">Edit in CACENTRE ↗</a>)
            : <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Missions, Events, Posts (compact CRUD)
// ============================================================================

/* Proof-review queue — verify/reject the mission submissions that require it.
   Without this, proof-requiring submissions sat 'submitted' forever (no XP,
   no learner feedback). Approve awards XP + recomputes stats; reject returns
   it for another pass with optional feedback. */
function AdminMissionQueue() {
  const [subs, setSubs] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const load = () => NGGApi.admin.missions.submissions().then(r => setSubs(r.submissions || [])).catch(e => { toast.error(e.code || e.message); setSubs([]); });
  React.useEffect(() => { load(); }, []);
  const act = async (s, approve) => {
    const key = s.memberId + "/" + s.missionId;
    if (busy) return;
    let note = "";
    if (!approve) { note = window.prompt("Feedback for " + (s.fullName || "the member") + " (optional):", "") || ""; }
    setBusy(key);
    try {
      await NGGApi.admin.missions.verify(s.memberId, s.missionId, approve, note);
      toast.success(approve ? "Verified · +" + (s.xp || 0) + " XP awarded" : "Returned for another pass");
      setSubs(list => (list || []).filter(x => !(x.memberId === s.memberId && x.missionId === s.missionId)));
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };
  if (subs === null) return <div className="admin-card" style={{ padding: 16 }}><div className="dash-spinner"/></div>;
  return (
    <div className="admin-card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: subs.length ? 12 : 0 }}>
        <h3 className="admin-h3" style={{ margin: 0 }}>Proof review queue {subs.length ? <span className="chip chip-gold" style={{ marginLeft: 8 }}>{subs.length}</span> : null}</h3>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      {!subs.length && <p className="admin-hint" style={{ margin: "8px 0 0" }}>Nothing waiting — proof-requiring submissions land here for a mentor or admin to verify.</p>}
      {subs.map(s => (
        <div key={s.memberId + "/" + s.missionId} className="admin-proof-row">
          <div>
            <div style={{ fontWeight: 700 }}>{s.fullName || s.memberId} <span className="mono" style={{ color: "var(--ink-500)", fontWeight: 400 }}>· {s.centre || ""}</span></div>
            <div style={{ fontSize: 13, color: "var(--ink-700)" }}>Wk {s.week} · {s.title} <span className="mono">+{s.xp} XP</span></div>
            {s.note ? <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>“{s.note}”</div> : null}
            {/* A link only when the proof IS a link; a child's typed answer is shown as their words (it was opened as a broken address). */}
            {s.proofUrl && /^https?:\/\//i.test(String(s.proofUrl).trim()) ? <a href={s.proofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>View proof ↗</a>
              : s.proofUrl ? <div className="admin-proof-text">{s.proofUrl}</div> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(s, false)}>Return</button>
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act(s, true)}>{busy === (s.memberId + "/" + s.missionId) ? "…" : "Verify +" + s.xp}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminMissions() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const load = () => NGGApi.admin.missions.list().then(r => setList(r.missions || [])).catch(e => { toast.error(e.code || e.message); setList([]); });
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Anchor missions</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New mission</button>
      </div>
      <AdminMissionQueue/>
      {list === null ? <div className="dash-spinner"/> :
        <div className="admin-mission-list">
          {Array.from({length: 12}).map((_, idx) => {
            const w = idx + 1;
            const ms = list.filter(m => Number(m.week) === w);
            return (
              <div key={w} className="admin-mission-week">
                <div className="admin-mission-week-h">
                  <span className="mono">WK {String(w).padStart(2, "0")}</span>
                  <span>{ms[0]?.theme || ""}</span>
                  <span className="admin-mission-week-c">{ms.length} missions</span>
                </div>
                <div className="admin-mission-rows">
                  {ms.map(m => (
                    <button key={m.missionId} className="admin-mission-row" onClick={() => setEditing(m)}>
                      <span className="mono">{m.missionId}</span>
                      <span className="admin-mission-row-t">{m.title}</span>
                      <span className="mono admin-mission-row-x">+{m.xp} XP</span>
                    </button>
                  ))}
                  {ms.length === 0 && <button className="admin-mission-row admin-mission-row-empty" onClick={() => setEditing({ week: w })}>+ Add mission to week {w}</button>}
                </div>
              </div>
            );
          })}
        </div>
      }
      {editing && <AdminMissionEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminMissionEditor({ data, onClose, onSaved }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose);
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.missions.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{d.missionId ? "Edit mission" : "New mission"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <div className="admin-fields-row">
            <Field label="Week (1-12)" value={d.week||""} onChange={v => set("week", Number(v))} type="number" required/>
            <Field label="Order" value={d.order||"1"} onChange={v => set("order", Number(v))} type="number"/>
          </div>
          <Field label="Theme" value={d.theme||""} onChange={v => set("theme", v)} placeholder="Identity, Discipline…"/>
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <FieldTextarea label="Prompt — what the teen has to do" value={d.prompt||""} onChange={v => set("prompt", v)}/>
          <div className="admin-fields-row">
            <FieldSelect label="Type" value={d.type||"Make"} onChange={v => set("type", v)} options={["Make","Read","Speak","Reflect","Serve","Move"]}/>
            <FieldSelect label="Proof" value={d.proof||"text"} onChange={v => set("proof", v)} options={["photo","text","audio","video","link","none"]}/>
          </div>
          <div className="admin-fields-row">
            <Field label="XP" value={d.xp||"60"} onChange={v => set("xp", Number(v))} type="number"/>
            <Field label="Time (min)" value={d.estimatedMin||"15"} onChange={v => set("estimatedMin", Number(v))} type="number"/>
            <Field label="Book page" value={d.bookPage||""} onChange={v => set("bookPage", Number(v) || "")} type="number"/>
          </div>
          <FieldCheckbox label="Active — assignable to members now" value={d.missionId ? (d.isActive !== false) : (d.isActive === undefined ? true : d.isActive)} onChange={v => set("isActive", v)}/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminEvents() {
  const [editing, setEditing] = React.useState(null);
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  // Admin list = ALL events (drafts, internal, past), not the public feed.
  const load = () => NGGApi.admin.events.list()
    .then(r => { setList(r.events || []); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Events</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New event</button>
      </div>
      {err ? <div className="admin-empty">Couldn't load events: {err}</div> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No events yet.</div> :
        <div className="admin-event-list">
          {list.map(ev => (
            <button key={ev.eventId} className="admin-event-row" onClick={() => setEditing(ev)}>
              <div className="admin-event-date-block">
                <div>{ev.startAt ? new Date(ev.startAt).getDate() : "—"}</div>
                <div className="mono">{ev.startAt ? fmtDayMonth(ev.startAt) : ""}</div>
              </div>
              <div>
                <div className="admin-event-title">{ev.title}</div>
                <div className="mono admin-event-meta">{ev.kind} · {ev.centre} · {ev.location || ""}</div>
              </div>
              <span className={"chip status-" + (ev.status || "draft")} style={{marginLeft:"auto"}}>{ev.status || "draft"}{ev.isPublic ? "" : " · internal"}</span>
            </button>
          ))}
        </div>
      }
      {editing && <AdminEventEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminEventEditor({ data, onClose, onSaved }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose);
  const [d, setD] = React.useState(Object.assign({ status:"draft", kind:"session", centre:"Egbeda", isPublic: false }, data));
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.events.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{d.eventId ? "Edit event" : "New event"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <div className="admin-fields-row">
            <FieldSelect label="Kind"   value={d.kind} onChange={v => set("kind", v)} options={["session","showcase","parent-meet","community","online"]}/>
            <FieldCentre value={d.centre} onChange={v => set("centre", v)} extra={["Both","Online"]}/>
          </div>
          <div className="admin-fields-row">
            <Field label="Start" value={d.startAt||""} onChange={v => set("startAt", v)} type="datetime-local"/>
            <Field label="End"   value={d.endAt||""}   onChange={v => set("endAt", v)}   type="datetime-local"/>
          </div>
          <Field label="Location" value={d.location||""} onChange={v => set("location", v)} placeholder="Room 3, Egbeda Annex"/>
          <FieldUpload label="Cover image" value={d.coverUrl||""} onChange={v => set("coverUrl", v)} kind="cover"/>
          <FieldTextarea label="Description (markdown ok)" value={d.body||""} onChange={v => set("body", v)} rows={6}/>
          <div className="admin-fields-row">
            <Field label="Capacity (0 = open)" value={d.capacity||"0"} onChange={v => set("capacity", Number(v))} type="number"/>
            <FieldSelect label="Status" value={d.status} onChange={v => set("status", v)} options={["draft","published","cancelled"]}/>
            <FieldCheckbox label="Show on public events page" value={d.isPublic} onChange={v => set("isPublic", v)}/>
          </div>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminPosts() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [err, setErr] = React.useState("");
  // Admin list = ALL posts (drafts/archived too), via the admin endpoint.
  // The public feed only returns published, which hid every draft.
  const load = () => NGGApi.admin.posts.list()
    .then(r => { setList(r.posts || []); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  // Open the full record (any status, incl. body) for editing.
  const open = (postId) => NGGApi.admin.posts.get(postId)
    .then(r => setEditing(r.post))
    .catch(e => toast.error(e.code || e.message));
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Posts · blog · news · updates · promos</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New post</button>
      </div>
      {err ? <div className="admin-empty">Couldn't load posts: {err}</div> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No posts yet.</div> :
        <ul className="admin-post-list">
          {list.map(p => (
            <li key={p.postId} className="admin-post-row" onClick={() => open(p.postId)}>
              <div>
                <div className="admin-post-title">{p.title}</div>
                <div className="mono admin-post-meta">{p.kind} · {p.category || ""} · {fmtDate(p.publishAt)}</div>
              </div>
              <div style={{display:"flex", gap:6, alignItems:"center"}}>
                <span className={"chip status-" + (p.status || "draft")}>{p.status || "draft"}</span>
                <span className={"chip post-kind-" + p.kind}>{p.kind}</span>
              </div>
            </li>
          ))}
        </ul>
      }
      {editing && <AdminPostEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminPostEditor({ data, onClose, onSaved }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose);
  const [d, setD] = React.useState(Object.assign({ kind:"blog", status:"draft" }, data));
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.posts.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{d.postId ? "Edit post" : "New post"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <div className="admin-fields-row">
            <FieldSelect label="Kind"   value={d.kind}   onChange={v => set("kind", v)}   options={["blog","news","update","promo"]}/>
            <FieldSelect label="Status" value={d.status} onChange={v => set("status", v)} options={["draft","published","archived"]}/>
            <FieldCheckbox label="Featured" value={d.featured} onChange={v => set("featured", v)}/>
          </div>
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <Field label="Slug (auto from title if blank)" value={d.slug||""} onChange={v => set("slug", v)}/>
          <Field label="Category" value={d.category||""} onChange={v => set("category", v)}/>
          <Field label="Tags (comma)" value={d.tags||""} onChange={v => set("tags", v)}/>
          <FieldUpload label="Cover image" value={d.coverUrl||""} onChange={v => set("coverUrl", v)} kind="cover"/>
          <FieldTextarea label="Excerpt" value={d.excerpt||""} onChange={v => set("excerpt", v)} rows={2}/>
          <FieldTextarea label="Body (markdown)" value={d.body||""} onChange={v => set("body", v)} rows={12}/>
          {d.kind === "promo" && (
            <>
              <div className="admin-fields-row">
                <Field label="CTA label" value={d.promoCta||""} onChange={v => set("promoCta", v)}/>
                <Field label="CTA URL"   value={d.promoUrl||""} onChange={v => set("promoUrl", v)}/>
                <Field label="Expires"   value={d.promoExpires||""} onChange={v => set("promoExpires", v)} type="datetime-local"/>
              </div>
            </>
          )}
          <Field label="Publish at (leave blank for now)" value={d.publishAt||""} onChange={v => set("publishAt", v)} type="datetime-local"/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminBroadcast() {
  const [d, setD] = React.useState({ title:"", body:"", linkPage:"", audience:"all", email:false });
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState("");
  const [history, setHistory] = React.useState(null);
  const loadHistory = () => NGGApi.admin.broadcastHistory().then(r => setHistory(r.announcements || [])).catch(() => setHistory([]));
  React.useEffect(() => { loadHistory(); }, []);
  const audienceLabel = {
    all: "every active member", Egbeda: "members at Egbeda", Ayobo: "members at Ayobo",
    Summer: "Summer School participant", NGG: "NGG member",
  }[d.audience] || "every active member";
  const send = async (e) => {
    e.preventDefault();
    const ok = await dialog.confirm({
      title: "Send this announcement?",
      body: "This posts an in-app announcement to " + audienceLabel + (d.email ? " and emails them too." : ".") + " There's no undo.",
      cta: "Send announcement",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.broadcast(d);
      setSent(d.email ? ("SENT ✓ · emailed " + (r.emailed || 0)) : "SENT ✓");
      setD({ title:"", body:"", linkPage:"", audience:"all", email:false });
      loadHistory();
      setTimeout(() => setSent(""), 3200);
    }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Announcements</h2></div>
      <p className="admin-hint">Post an in-app announcement to members' notification feeds, optionally emailing them as well. Great for deadlines, showcases and program news.</p>
      <form onSubmit={send} className="admin-broadcast">
        <Field label="Title" value={d.title} onChange={v => setD(o => ({...o, title: v}))} required/>
        <FieldTextarea label="Body" value={d.body} onChange={v => setD(o => ({...o, body: v}))} rows={4}/>
        <div className="admin-fields-row">
          <FieldSelect label="Audience" value={d.audience} onChange={v => setD(o => ({...o, audience: v}))} options={["all","Egbeda","Ayobo","Summer","NGG"]}/>
          <Field label="Deep-link to page (optional)" value={d.linkPage} onChange={v => setD(o => ({...o, linkPage: v}))} placeholder="anchor, dashboard, blog…"/>
        </div>
        <FieldCheckbox label="Also send as email (quota-aware, up to 300)" value={d.email} onChange={v => setD(o => ({...o, email: v}))}/>
        <div className="admin-drawer-foot">
          <span className="mono" style={{color:sent ? "var(--lime-ink)" : "var(--ink-500)"}}>{sent || (busy ? "SENDING…" : "")}</span>
          <button className="btn btn-primary" disabled={busy || !d.title}>Send to {audienceLabel}</button>
        </div>
      </form>
      <div className="admin-fields-h" style={{ marginTop: 22, fontWeight: 700 }}>Recent announcements</div>
      {history === null ? <div className="dash-spinner"/> :
        history.length === 0 ? <div className="admin-empty">Nothing sent yet.</div> :
        <div className="admin-app-list">
          {history.map(a => (
            <div className="admin-app" key={a.notifId}>
              <div className="admin-app-top">
                <div className="admin-cell-name">{a.title || "(untitled)"} <span className="chip chip-navy">{a.audience}</span></div>
                <span className="mono admin-cell-sub">{fmtDate(a.createdAt)}</span>
              </div>
              {a.body && <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>}
            </div>
          ))}
        </div>}
    </div>
  );
}

/* ── Status board ─────────────────────────────────────────────────────────────
 * One screen for "how is everything?": members, centres, mentors,
 * instructors, centre leads and staff. Every status is derived on the server
 * from records the platform already keeps (domain/status.php says what each
 * word means); each tab appears only to somebody whose capabilities cover it,
 * and a scoped admin sees their centres only. Words, not colour alone: every
 * chip says its state.
 */
const STATUS_TABS = [
  ["members", "Members"], ["centres", "Centres"], ["mentors", "Mentors"],
  ["instructors", "Instructors"], ["leads", "Centre leads"], ["staff", "Staff & admins"],
];
const STATUS_WORD = { active: "Active", quiet: "Quiet", dormant: "Dormant", never: "No activity yet", ok: "OK", attention: "Needs attention", unled: "No lead" };
function StatusChip({ state, days }) {
  return <span className={"st-chip is-" + state}>{STATUS_WORD[state] || state}{days != null && state !== "active" ? " · " + days + "d" : ""}</span>;
}
function StatusKpi({ n, label, tone, onClick }) {
  const body = <><b className="st-kpi-n">{fmtNum(n || 0)}</b><span className="st-kpi-l">{label}</span></>;
  return onClick ? <button type="button" className={"st-kpi" + (tone ? " is-" + tone : "")} onClick={onClick}>{body}</button>
    : <div className={"st-kpi" + (tone ? " is-" + tone : "")}>{body}</div>;
}
function AdminStatus() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [tab, setTab] = useAdminTab("members", React.useCallback(t => STATUS_TABS.some(([k]) => k === t), []));
  const [only, setOnly] = React.useState(false);   // only what needs attention
  const load = React.useCallback(() => { setErr(null); return NGGApi.admin.status().then(setD).catch(setErr); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <div className="admin-section"><ErrorState title="Couldn't load the status board" message={err.message} code={err.code} onRetry={load}/></div>;
  if (!d) return <div className="admin-section"><div className="dash-spinner" role="status" aria-label="Loading the status board"/></div>;
  const tabs = STATUS_TABS.filter(([k]) => d.parts.indexOf(k) !== -1);
  const cur = tabs.some(([k]) => k === tab) ? tab : (tabs[0] || [""])[0];
  const m = d.members, c = d.centres;
  const quietStaff = (t) => t ? (t.quiet || 0) + (t.dormant || 0) + (t.never || 0) : 0;
  return (
    <div className="admin-section st-board">
      <div className="admin-section-head">
        <h2 className="admin-h2">Status board</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="admin-hint">Today is {fmtDate(d.today)} (Lagos). {d.scoped ? "Your centres only: " + d.scopeNames.join(", ") + "." : "Every centre."} Active means work recorded in the last 14 days, quiet within 30, dormant beyond that.</p>

      <div className="st-kpis" role="list" aria-label="Headline figures">
        {m && <StatusKpi n={m.tally.active} label="active members" onClick={() => setTab("members")}/>}
        {m && <StatusKpi n={m.tally.presentToday} label={"in today" + (m.tally.lateToday ? " · " + m.tally.lateToday + " late" : "")}/>}
        {m && <StatusKpi n={m.tally.atRisk + (m.conduct.suspended || 0) + (m.conduct.evicted || 0)} label="at risk or blocked" tone={m.tally.atRisk ? "warn" : ""} onClick={() => setTab("members")}/>}
        {m && m.withFees && <StatusKpi n={m.tally.owing} label={"owing · " + naira(m.tally.owingTotal)} tone={m.tally.owing ? "warn" : ""}/>}
        {c && <StatusKpi n={c.withIssues} label={"of " + c.total + " centres need attention"} tone={c.withIssues ? "warn" : ""} onClick={() => setTab("centres")}/>}
        {d.mentors && <StatusKpi n={quietStaff(d.mentors.tally)} label="mentors quiet or dormant" tone={quietStaff(d.mentors.tally) ? "warn" : ""} onClick={() => setTab("mentors")}/>}
        {d.instructors && <StatusKpi n={quietStaff(d.instructors.tally)} label="instructors quiet or dormant" tone={quietStaff(d.instructors.tally) ? "warn" : ""} onClick={() => setTab("instructors")}/>}
        {d.leads && <StatusKpi n={d.leads.unled} label="centres with no lead" tone={d.leads.unled ? "bad" : ""} onClick={() => setTab("leads")}/>}
        {d.staff && <StatusKpi n={d.staff.tally.no2fa} label="staff without 2FA" tone={d.staff.tally.no2fa ? "bad" : ""} onClick={() => setTab("staff")}/>}
      </div>

      <div className="st-bar">
        <div className="admin-tabs" role="tablist" aria-label="Status by area">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={cur === k} className={"admin-tab" + (cur === k ? " is-active" : "")} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <label className="st-only"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)}/> Only what needs attention</label>
      </div>

      {cur === "members" && m && <StatusMembers m={m} only={only}/>}
      {cur === "centres" && c && <StatusCentres c={c} only={only}/>}
      {cur === "mentors" && d.mentors && <StatusPeople rows={d.mentors.rows} only={only} cols={[["Kind", r => r.kind], ["Centre", r => r.centre || "—"], ["Mentees", r => r.mentees, true], ["Stars · remarks (60d)", r => r.stars + " · " + r.remarks, true]]} empty="No mentors in your centres yet." caption="Mentors"/>}
      {cur === "instructors" && d.instructors && <StatusPeople rows={d.instructors.rows} only={only} cols={[["Centre", r => r.centre || "—"], ["Courses", r => r.courses || "—"], ["Classes", r => r.classes, true], ["Sessions (60d)", r => r.sessions, true], ["Materials waiting", r => r.pendingMaterials, true]]} empty="No instructors in your centres yet." caption="Instructors"/>}
      {cur === "leads" && d.leads && <StatusLeads l={d.leads} only={only}/>}
      {cur === "staff" && d.staff && <StatusStaff s={d.staff} only={only}/>}
    </div>
  );
}
function StatusMembers({ m, only }) {
  const t = m.tally;
  const rows = m.attention;
  return (
    <div className="st-pane">
      <div className="st-strip">
        <span><b>{t.onTrack}</b> on track</span><span><b>{t.watch}</b> watch</span><span><b>{t.atRisk}</b> at risk</span><span><b>{t.unrated}</b> not yet rated this week</span>
        <span><b>{m.conduct.warned || 0}</b> conduct warning</span><span><b>{(m.conduct.suspended || 0) + (m.conduct.evicted || 0)}</b> suspended or evicted</span>
        <span><b>{t.newThisMonth}</b> joined this month</span><span><b>{t.neverSignedIn}</b> never signed in</span><span><b>{t.notSignedIn60}</b> not signed in for 60 days</span>
        {Object.entries(m.byStatus).filter(([k]) => k !== "active").map(([k, n]) => <span key={k}><b>{n}</b> {k.replace(/-/g, " ")}</span>)}
      </div>
      <h3 className="admin-h4">Members who need attention <span className="admin-count mono">{m.attentionTotal}</span></h3>
      {!rows.length ? <EmptyState title="Nobody flagged" message="No member is at risk, blocked, warned or owing a large balance."/> :
      <div className="admin-table-wrap"><table className="admin-table">
        <caption className="sr-only">Members who need attention, most urgent first</caption>
        <thead><tr><th scope="col">Member</th><th scope="col">Centre</th><th scope="col">Why</th><th scope="col">Last signed in</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.memberId}>
            <td><div className="admin-cell-name">{r.fullName}</div><div className="mono admin-cell-sub">{r.memberId}</div></td>
            <td className="admin-cell-sub">{r.centre || "—"}</td>
            <td><div className="st-reasons">{r.reasons.map(x => <span key={x} className={"st-chip " + (r.severity >= 3 ? "is-dormant" : "is-quiet")}>{x}</span>)}</div></td>
            <td className="admin-cell-sub">{r.lastSignIn ? fmtDate(r.lastSignIn) : "never"}</td>
          </tr>
        ))}</tbody>
      </table></div>}
      {m.attentionTotal > rows.length && <p className="admin-hint">Showing the {rows.length} most urgent of {m.attentionTotal}.</p>}
    </div>
  );
}
function StatusCentres({ c, only }) {
  const rows = only ? c.rows.filter(r => r.state !== "ok") : c.rows;
  return (
    <div className="st-pane">
      {!rows.length ? <EmptyState title={only ? "Every centre is in order" : "No centres"} message={only ? "No centre has an open issue." : "Add a centre under People → Centres."}/> :
      <div className="admin-table-wrap"><table className="admin-table">
        <caption className="sr-only">Centres and what each needs</caption>
        <thead><tr><th scope="col">Centre</th><th scope="col" className="admin-num">Members</th><th scope="col" className="admin-num">In today</th><th scope="col" className="admin-num">Classes</th><th scope="col">Lead</th><th scope="col">Status</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.centreId}>
            <td><div className="admin-cell-name">{r.name}</div><div className="admin-cell-sub">{r.meetDays || "meeting days not set"}{r.meetsToday ? " · meets today" : ""}</div></td>
            <td className="admin-num">{r.members}{r.capacity ? <span className="admin-cell-sub"> / {r.capacity}</span> : null}</td>
            <td className="admin-num">{r.presentToday}{r.lateToday ? <span className="admin-cell-sub"> ({r.lateToday} late)</span> : null}</td>
            <td className="admin-num">{r.classes}</td>
            <td className="admin-cell-sub">{[r.lead].concat(r.leadAccounts).filter(Boolean).join(", ") || "—"}</td>
            <td>{r.issues.length ? <div className="st-reasons">{r.issues.map(x => <span key={x} className="st-chip is-quiet">{x}</span>)}</div> : <StatusChip state="ok"/>}</td>
          </tr>
        ))}</tbody>
      </table></div>}
    </div>
  );
}
function StatusPeople({ rows, only, cols, empty, caption }) {
  const list = only ? rows.filter(r => r.state !== "active") : rows;
  return (
    <div className="st-pane">
      {!list.length ? <EmptyState title={only ? "Everybody is active" : "Nobody here"} message={only ? "Nobody has gone quiet." : empty}/> :
      <div className="admin-table-wrap"><table className="admin-table">
        <caption className="sr-only">{caption}, quietest first</caption>
        <thead><tr><th scope="col">Name</th>{cols.map(([h, , num]) => <th key={h} scope="col" className={num ? "admin-num" : ""}>{h}</th>)}<th scope="col">Last active</th><th scope="col">Status</th></tr></thead>
        <tbody>{list.map(r => (
          <tr key={r.id}>
            <td className="admin-cell-name">{r.fullName}</td>
            {cols.map(([h, f, num]) => <td key={h} className={num ? "admin-num" : "admin-cell-sub"}>{f(r)}</td>)}
            <td className="admin-cell-sub">{r.lastActive ? fmtDate(r.lastActive) : "—"}</td>
            <td><StatusChip state={r.state} days={r.days}/></td>
          </tr>
        ))}</tbody>
      </table></div>}
    </div>
  );
}
function StatusLeads({ l, only }) {
  const rows = only ? l.rows.filter(r => r.state !== "active") : l.rows;
  return (
    <div className="st-pane">
      <p className="admin-hint">A centre's leads are its lead volunteer (People → Centres), its lead mentors, and any <b>Centre lead</b> account scoped to it (Access &amp; roles).</p>
      {!rows.length ? <EmptyState title="Every centre is led" message="Each centre has an active lead."/> :
      <div className="admin-table-wrap"><table className="admin-table">
        <caption className="sr-only">Who leads each centre</caption>
        <thead><tr><th scope="col">Centre</th><th scope="col">Leads</th><th scope="col">Status</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.centreId}>
            <td className="admin-cell-name">{r.centre}</td>
            <td>{r.leads.length ? <ul className="st-leads">{r.leads.map((p, i) => <li key={i}><b>{p.name}</b> <span className="admin-cell-sub">{p.kind}</span> <StatusChip state={p.state} days={p.days}/></li>)}</ul> : <span className="admin-cell-sub">Nobody — name a lead volunteer or give somebody the Centre lead role.</span>}</td>
            <td><StatusChip state={r.state === "unled" ? "unled" : r.state}/></td>
          </tr>
        ))}</tbody>
      </table></div>}
    </div>
  );
}
function StatusStaff({ s, only }) {
  const rows = only ? s.rows.filter(r => r.state !== "active" || r.flags.length) : s.rows;
  return (
    <div className="st-pane">
      <div className="st-strip"><span><b>{s.tally.active}</b> active</span><span><b>{s.tally.quiet}</b> quiet</span><span><b>{s.tally.dormant + s.tally.never}</b> dormant or never</span><span><b>{s.tally.no2fa}</b> without 2FA</span><span><b>{s.tally.noCentre}</b> with no centre</span></div>
      {!rows.length ? <EmptyState title="Nothing to flag" message="Every staff account is active, has 2FA and has what its role needs."/> :
      <div className="admin-table-wrap"><table className="admin-table">
        <caption className="sr-only">Staff accounts</caption>
        <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Centres</th><th scope="col">2FA</th><th scope="col">Last signed in · acted</th><th scope="col" className="admin-num">Awaiting approval</th><th scope="col">Status</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.memberId}>
            <td><div className="admin-cell-name">{r.fullName}</div>{r.extraCaps.length > 0 && <div className="admin-cell-sub">+ {r.extraCaps.join(", ")}</div>}</td>
            <td className="admin-cell-sub">{r.roleLabel}</td>
            <td className="admin-cell-sub">{r.centres.length ? r.centres.join(", ") : "All"}</td>
            <td>{r.twoFactor ? <span className="st-chip is-active">On</span> : <span className="st-chip is-dormant">Off</span>}</td>
            <td className="admin-cell-sub">{r.lastSignIn ? fmtDate(r.lastSignIn) : "never"} · {r.lastAction ? fmtDate(r.lastAction) : "—"}</td>
            <td className="admin-num">{r.pendingApprovals}</td>
            <td><div className="st-reasons"><StatusChip state={r.state} days={r.days}/>{r.flags.map(f => <span key={f} className="st-chip is-dormant">{f}</span>)}</div></td>
          </tr>
        ))}</tbody>
      </table></div>}
    </div>
  );
}

// Access & roles — every staff account, its role and what it can actually do,
// and the matrix of roles × capabilities × the sections each opens. All of it
// derived from the server's registry (admin.roles), so it cannot drift.
function AdminAccess() {
  const { member: me } = useAuth();
  const reg = useAdminRoles();
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [tab, setTab] = React.useState("staff");
  const [centreNames, setCentreNames] = React.useState({});
  React.useEffect(() => { NGGApi.admin.registration.centres().then(r => { const m = {}; (r.centres || []).forEach(c => { m[c.centreId] = c.name; }); setCentreNames(m); }).catch(() => {}); }, []);
  const load = () => { setErr(""); return NGGApi.admin.members.list({ staff: 1, pageSize: 200 }).then(r => setList(r.members || [])).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const roleOf = (id) => ((reg && reg.roles) || []).find(r => r.id === id);
  const capsOf = (m) => { const r = roleOf(m.role); const base = r ? r.caps : []; return base.concat((m.capsExtra || []).filter(c => base.indexOf(c) === -1)); };
  const changeRole = async (m, v) => {
    if (v === m.role) return;
    const isSelf = me && m.memberId === me.memberId;
    if (isSelf && adminRoleElevated(m.role) && !adminRoleElevated(v)) {
      const ok = await dialog.confirm({ title: "Change your own access?", body: "You're lowering your OWN staff level and may lose access. The last active super admin cannot be demoted.", cta: "Change my access", cancel: "Keep as is", danger: true });
      if (!ok) return;
    } else if (adminRoleElevated(v)) {
      const ok = await dialog.confirm({ title: "Grant " + adminRoleLabel(v) + "?", body: m.fullName + " will gain elevated access.", cta: "Grant access", cancel: "Cancel", danger: v === "super_admin" });
      if (!ok) return;
    }
    const nr = roleOf(v);
    setBusy(m.memberId);
    try {
      await NGGApi.admin.members.upsert({ memberId: m.memberId, role: v });
      toast.success(nr && nr.scoped && !(m.centreScope || []).length ? "Role updated. " + nr.label + " has no access until you give them a centre (open them in Members → Edit → Access)." : "Role updated");
      await load();
    } catch (e) {
      const map = { last_super_admin: "That's the last active super admin — promote another first.", cannot_demote_self: "Ask another super admin to change your role.", cannot_suspend_self: "You can't suspend yourself." };
      toast.error(map[e.code || e.message] || humanizeError(e.code, e.code));
    } finally { setBusy(""); }
  };
  const noCentre = (list || []).filter(m => { const r = roleOf(m.role); return r && r.scoped && !(m.centreScope || []).length; });
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Access &amp; roles{list ? <span className="admin-count mono">{list.length}</span> : null}</h2>
      </div>
      <p className="admin-hint">Who has staff access and what each level can do. Roles are fixed bundles of capabilities; a super admin can add single capabilities and limit anyone to named centres (Members → Edit → Access). Nobody can grant a role that reaches further than their own, and the last super admin cannot be demoted.</p>
      <div className="admin-tabs" role="tablist" aria-label="Access and roles">
        {[["staff", "Staff"], ["matrix", "What each role can do"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"admin-tab" + (tab === k ? " is-active" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "staff" && (err ? <ErrorState code={err} onRetry={load}/> :
        list === null || !reg ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        <>
          {noCentre.length > 0 && <p className="access-warn" role="status"><b>{noCentre.length} account{noCentre.length === 1 ? "" : "s"} with no access yet:</b> {noCentre.map(m => m.fullName).join(", ")} — {noCentre.length === 1 ? "this role works" : "these roles work"} only for named centres. Give {noCentre.length === 1 ? "them" : "each"} a centre in Members → Edit → Access.</p>}
          {list.length === 0 ? <EmptyState title="No staff yet" message="Grant a member a staff role from the Members editor."/> :
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="sr-only">Staff accounts and their access</caption>
              <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Centres</th><th scope="col">Can access</th></tr></thead>
              <tbody>
                {list.map(m => {
                  const r = roleOf(m.role);
                  const opts = adminRoleOptions(reg, m.role).filter(o => o.value !== "member" || r == null);
                  return (
                    <tr key={m.memberId}>
                      <td>
                        <div className="admin-cell-name">{m.fullName}{me && m.memberId === me.memberId ? <span className="chip access-you">you</span> : null}</div>
                        <div className="mono admin-cell-sub">{m.memberId} · {m.email}</div>
                      </td>
                      <td className="access-role">
                        <select className="admin-select" value={m.role} disabled={busy === m.memberId || !opts.some(o => o.value !== m.role)} onChange={(e) => changeRole(m, e.target.value)} aria-label={"Role for " + m.fullName}>
                          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          <option value="member">Remove staff access</option>
                        </select>
                      </td>
                      <td className="admin-cell-sub">{(m.centreScope || []).length ? m.centreScope.map(id => centreNames[id] || id).join(", ") : (r && r.scoped ? <span className="access-none">none — no access</span> : "All centres")}</td>
                      <td><div className="access-caps">{capsOf(m).length ? capsOf(m).map(c => <span key={c} className={"chip" + ((m.capsExtra || []).indexOf(c) !== -1 && !(r && r.caps.indexOf(c) !== -1) ? " chip-gold" : "")} title={((reg.caps.find(x => x.id === c) || {}).label) || c}>{c}</span>) : <span className="admin-cell-sub">—</span>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </>)}
      {tab === "matrix" && (!reg ? <div className="dash-spinner" role="status" aria-label="Loading"/> : <AccessMatrix reg={reg}/>)}
    </div>
  );
}

/* The matrix: one row per role (what it is for, whether it is limited to its
   centres, whether its sensitive acts wait for approval), one column per
   capability — and, under it, which Control Room sections each capability
   opens, read from CR_PAGES so the answer is the real navigation. */
function AccessMatrix({ reg }) {
  const sectionsFor = (cap) => Object.keys(CR_PAGES).reduce((out, pid) => out.concat(CR_PAGES[pid].tabs.filter(t => t.cap === cap || (Array.isArray(t.cap) && t.cap.indexOf(cap) !== -1)).map(t => CR_PAGES[pid].label + " › " + t.label)), []);
  return (
    <div className="access-matrix">
      <div className="admin-table-wrap">
        <table className="admin-table access-table">
          <caption className="sr-only">Which capabilities each staff role holds</caption>
          <thead><tr><th scope="col">Role</th>{reg.caps.map(c => <th scope="col" key={c.id} title={c.label}><span className="access-cap-h">{c.id}</span></th>)}</tr></thead>
          <tbody>
            {reg.roles.map(r => (
              <tr key={r.id}>
                <th scope="row" className="access-role-cell">
                  <b>{r.label}</b>
                  <span className="admin-cell-sub">{r.summary}</span>
                  <span className="access-flags">{r.scoped && <span className="chip">own centres only</span>}{r.queued && <span className="chip">second admin approves</span>}</span>
                </th>
                {reg.caps.map(c => { const has = r.caps.indexOf(c.id) !== -1; return <td key={c.id} className={"access-cell" + (has ? " is-on" : "")}>{has ? <span aria-label="Yes">✓</span> : <span className="sr-only">No</span>}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="admin-h4">What each capability opens</h3>
      <dl className="access-capdefs">
        {reg.caps.map(c => (
          <div key={c.id}><dt className="mono">{c.id}</dt><dd>{c.label}{sectionsFor(c.id).length ? <span className="admin-cell-sub"> — {sectionsFor(c.id).join(", ")}</span> : null}</dd></div>
        ))}
      </dl>
      <p className="admin-hint">Money (<span className="mono">fees</span>), the institutional record (<span className="mono">journal</span>) and the system (<span className="mono">settings</span>, <span className="mono">rbac</span>) are in no bundle but the super admin's on purpose. Grant them to a named person, never to a role.</p>
    </div>
  );
}

// Per-member capability editor (super only): grant caps beyond the role.
// Every capability is one super_admin holds; derived, so it cannot drift (it
// had: 'journal' was missing here, so it could never be granted per person).
function MemberCapsEditor({ member }) {
  const reg = useAdminRoles();
  const ALL_CAPS = reg ? reg.caps.map(c => c.id) : [];
  const roleCaps = ((reg && reg.roles.find(r => r.id === member.role)) || {}).caps || [];
  const [extra, setExtra] = React.useState(() => new Set(member.capsExtra || []));
  const [scope, setScope] = React.useState(() => new Set(member.centreScope || []));
  const [centres, setCentres] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { NGGApi.admin.registration.centres().then(r => setCentres(r.centres || [])).catch(() => {}); }, []);
  /* Only read when the verified tab is open. It walks the cohort's QR cache on
     disk, which is cheap but not free, and nobody on the pending tab is asking. */
  const loadGaps = React.useCallback(() => {
    NGGApi.admin.registration.qrGaps().then(setGaps).catch(() => setGaps(null));
  }, []);
  React.useEffect(() => { if (status === "verified") loadGaps(); }, [status, loadGaps]);
  const toggle = (c) => setExtra(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleScope = (id) => setScope(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setBusy(true);
    try { await NGGApi.admin.members.setCaps(member.memberId, Array.from(extra), Array.from(scope)); toast.success("Access updated.", "Access"); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  return (
    <div className="admin-field">
      <span className="admin-label">Extra capabilities (beyond the {member.role} role)</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 8px" }}>
        {ALL_CAPS.map(c => {
          const inRole = roleCaps.includes(c);
          return <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, opacity: inRole ? 0.5 : 1 }}>
            <input type="checkbox" checked={inRole || extra.has(c)} disabled={inRole} onChange={() => toggle(c)}/> {c}
          </label>;
        })}
      </div>
      <span className="admin-label">Centre scope {scope.size === 0 ? "(all centres)" : "(" + scope.size + " selected)"}</span>
      <p className="admin-hint" style={{ margin: "2px 0 6px" }}>Leave empty for full access. Selecting centres limits this admin's members, roster and dashboard to those centres only.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 8px" }}>
        {centres.map(c => (
          <label key={c.centreId} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13 }}>
            <input type="checkbox" checked={scope.has(c.centreId)} onChange={() => toggleScope(c.centreId)}/> {c.name}
          </label>
        ))}
        {!centres.length && <span className="mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>No centres configured yet.</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save access"}</button>
    </div>
  );
}

// ============================================================================
// Donations ledger (Paystack)
// ============================================================================

/* ── Baseline & endline ──────────────────────────────────────────────────────
 *
 * The screen that makes the measurement real. An instrument nobody can enter
 * scores into is not an instrument, and the entry has to be a REGISTER — forty
 * children off a paper sheet in one save — or it will not be used and the
 * evidence will not exist.
 *
 * Three tabs because there are three jobs, done by different people at
 * different times: define the test, run a sitting, read the result.
 */
function AdminAssessment() {
  const [tab, setTab] = React.useState("gains");
  const [inst, setInst] = React.useState(null);
  const [wins, setWins] = React.useState(null);
  const [gains, setGains] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [edit, setEdit] = React.useState(null);      // instrument being edited
  const [sheet, setSheet] = React.useState(null);    // { window, instrument, students }
  const [marks, setMarks] = React.useState({});      // studentId → { score, absent }
  const [cat, setCat] = React.useState(null);        // published-instrument shortlist
  const [catNote, setCatNote] = React.useState("");
  const [catFam, setCatFam] = React.useState("All");
  const [picked, setPicked] = React.useState({});    // catalogue key → selected

  const load = React.useCallback(() => {
    NGGApi.admin.assessInstruments().then(r => setInst(r.instruments || [])).catch(() => setInst([]));
    NGGApi.admin.assessWindows().then(r => setWins(r.windows || [])).catch(() => setWins([]));
    NGGApi.admin.assessGains().then(r => setGains(r.gains || [])).catch(() => setGains([]));
    NGGApi.admin.assessCatalogue().then(r => { setCat(r.catalogue || []); setCatNote(r.note || ""); }).catch(() => setCat([]));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const instById = {};
  (inst || []).forEach(i => { instById[i.instrumentId] = i; });

  const saveInstrument = async () => {
    setBusy("inst");
    try {
      await NGGApi.admin.assessInstrumentSave(edit.instrumentId || "", edit);
      toast.success("Instrument saved."); setEdit(null); load();
    } catch (e) {
      toast.error(e.code === "locked" ? (e.data && e.data.note) || "This instrument is locked."
        : e.code === "bad_max" ? "The maximum score must be between 1 and 1000."
        : e.code === "bad_grade_range" ? "The last class cannot come before the first."
        : (e.code || e.message), e.code === "locked" ? "Locked" : "Could not save");
    } finally { setBusy(""); }
  };

  const openSheet = async (w) => {
    setBusy("sheet");
    try {
      const r = await NGGApi.admin.assessSheet(w.windowId, "");
      setSheet(r);
      const m = {};
      (r.students || []).forEach(st => {
        if (st.result) m[st.studentId] = { score: st.result.absent ? "" : String(st.result.score), absent: st.result.absent };
      });
      setMarks(m);
      setTab("record");
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };

  const saveSheet = async () => {
    if (!sheet) return;
    setBusy("record");
    try {
      const results = (sheet.students || []).map(st => ({
        studentId: st.studentId,
        score: (marks[st.studentId] || {}).score ?? "",
        absent: !!(marks[st.studentId] || {}).absent,
      }));
      const r = await NGGApi.admin.assessRecord(sheet.window.windowId, results);
      /* Rejections are named, not counted. A silent "38 of 40 saved" leaves a
         coordinator to find the two by eye against a paper register. */
      if ((r.rejected || []).length) {
        toast.error(r.rejected.length + " score(s) were outside 0–" + sheet.instrument.maxScore
          + " and were NOT saved: " + r.rejected.slice(0, 6).join(", "), "Check these");
      } else {
        toast.success(r.saved + " recorded" + (r.cleared ? ", " + r.cleared + " cleared" : "") + ".");
      }
      load(); openSheet(sheet.window);
    } catch (e) {
      toast.error(e.code === "window_closed" ? "This sitting is closed — reopen it to change scores." : (e.code || e.message));
    } finally { setBusy(""); }
  };

  const newWindow = async (instrumentId, phase) => {
    try {
      await NGGApi.admin.assessWindowSave("", { instrumentId, phase, label: phase === "baseline" ? "Baseline" : "Endline" });
      load();
    } catch (e) {
      toast.error(e.code === "phase_exists"
        ? "There is already a " + phase + " sitting for this instrument. One per phase — two would leave it ambiguous which score pairs with the endline."
        : (e.code || e.message));
    }
  };

  const tone = (lvl) => ({ error: "#b91c1c", warn: "#b45309", method: "var(--ink-500,#5a6488)" }[lvl] || "var(--ink-500)");

  const adopt = async (keys) => {
    if (!keys.length) return;
    setBusy("adopt");
    try {
      const r = await NGGApi.admin.assessAdopt(keys);
      const made = (r.created || []).length, had = (r.existing || []).length;
      toast.success(made + " instrument" + (made === 1 ? "" : "s") + " adopted"
        + (had ? ", " + had + " already in use" : "") + ". Open a baseline sitting when you are ready.");
      setPicked({}); load();
    } catch (e) { toast.error(e.code || e.message, "Could not adopt"); } finally { setBusy(""); }
  };
  const pickedKeys = Object.keys(picked).filter(k => picked[k]);
  /* A rate has no maximum to be a percentage of and a ladder's rungs are not
     equally spaced, so the screen prints the unit in place of "out of N". */
  const outOf = (i) => i.scale === "rate" ? (i.unit || "per minute")
    : i.scale === "level" ? (i.unit || "levels")
    : "out of " + i.maxScore;

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-h2">Baseline &amp; endline</h2>
          <p className="admin-hint" style={{ maxWidth: 720 }}>
            The same test, twice, to the same children — which is what a funder means by measuring learning.
            Coursework grades are different tasks marked by different people, so a trend across them is not a
            learning gain and cannot be defended as one.
          </p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {[["gains", "Results"], ["catalogue", "Catalogue"], ["instruments", "Instruments"], ["record", "Record scores"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"admin-tab" + (tab === k ? " is-active" : "")}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {tab === "gains" && (
        gains === null ? <div className="admin-empty">Loading…</div>
        : gains.length === 0 ? <div className="admin-empty">
            No instrument yet has both a baseline and an endline with scores in them. Define an instrument, open
            a baseline sitting at the start of the programme and an endline at the end, and the paired result
            appears here.
          </div>
        : gains.map(g => (
          <div key={g.instrument.instrumentId} className="admin-section">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h3 className="admin-h3" style={{ margin: 0 }}>{g.instrument.name}</h3>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
                {g.instrument.domainLabel} · {outOf(g.instrument)} · v{g.instrument.version}
              </span>
            </div>
            {/* Where it came from, next to what it found. A gain with no
                instrument behind it is the first thing a reviewer discounts. */}
            {g.instrument.source && <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
              {g.instrument.source}{g.instrument.citation ? " · " + g.instrument.citation : ""}
            </div>}

            {/* The headline is the PAIRED difference. The two cohort means sit
                beside it deliberately: quoting the endline mean against the
                baseline mean is the mistake this whole feature exists to
                prevent, so both numbers are on screen and labelled. */}
            <div className="admin-tiles" style={{ marginTop: 14 }}>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                {/* Coloured by whether the movement is GOOD, not by whether it
                    is upward — on a difficulties score the fall is the win. */}
                <div className="admin-tile-n" style={{ color: g.improved === true ? "#15803d" : g.improved === false ? "#b91c1c" : undefined }}>
                  {g.gain.mean === null ? "—" : (g.gain.mean > 0 ? "+" : "") + g.gain.mean}
                </div>
                <div className="mono admin-tile-l">Mean change, per child{g.unit ? " (" + g.unit + ")" : ""}</div>
                {g.gain.lo !== null && <div className="admin-hint" style={{ margin: 0 }}>
                  95% CI {g.gain.lo} to {g.gain.hi}{g.gain.d !== null ? " · d = " + g.gain.d : ""}
                </div>}
              </div>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="admin-tile-n">{g.paired}</div>
                <div className="mono admin-tile-l">Sat both papers</div>
                <div className="admin-hint" style={{ margin: 0 }}>{g.satBaseline} baseline · {g.satEndline} endline</div>
              </div>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="admin-tile-n">{g.pctMeaningful
                  ? (g.pairedBaselinePct === null ? "—" : g.pairedBaselinePct + "%")
                  : (g.pairedBaselineMean === null ? "—" : g.pairedBaselineMean)}</div>
                <div className="mono admin-tile-l">Their baseline</div>
                <div className="admin-hint" style={{ margin: 0 }}>whole edition {g.pctMeaningful
                  ? (g.baselineMeanPct === null ? "—" : g.baselineMeanPct + "%")
                  : (g.baselineMean === null ? "—" : g.baselineMean)}</div>
              </div>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="admin-tile-n" style={{ color: g.attrition.baselineOnly ? "#b45309" : undefined }}>{g.attrition.baselineOnly}</div>
                <div className="mono admin-tile-l">Did not return</div>
                {g.attrition.bias && <div className="admin-hint" style={{ margin: 0 }}>
                  they scored {g.pctMeaningful ? g.attrition.bias.leftMean + "%" : g.attrition.bias.leftMeanRaw}
                  {" vs "}{g.pctMeaningful ? g.attrition.bias.stayedMean + "%" : g.attrition.bias.stayedMeanRaw}
                </div>}
              </div>
            </div>

            {/* Caveats above the breakdown, not below it. A reader who has
                already absorbed the split by sex will not go back and re-read
                the number with the caveat applied. */}
            {(g.caveats || []).length > 0 && (
              <ul style={{ margin: "16px 0 0", paddingLeft: 18 }}>
                {g.caveats.map((c, i) => (
                  <li key={i} style={{ color: tone(c.level), fontSize: 13, lineHeight: 1.55, marginBottom: 4 }}>{c.text}</li>
                ))}
              </ul>
            )}

            {[["bySex", "By sex"], ["byBand", "By class band"], ["byCentre", "By centre"]].map(([k, label]) =>
              (g[k] || []).length ? (
                <div key={k} style={{ marginTop: 18 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13.5 }}>{label}</h4>
                  <table className="admin-table">
                    <thead><tr><th>{label.replace("By ", "")}</th><th>Pairs</th><th>Mean gain</th><th>95% CI</th><th/></tr></thead>
                    <tbody>{g[k].map(r => (
                      <tr key={r.group}>
                        <td><b>{r.group}</b></td>
                        <td className="mono">{r.n}</td>
                        <td className="mono">{r.meanGain === null ? "—" : (r.meanGain > 0 ? "+" : "") + r.meanGain}</td>
                        <td className="mono">{r.lo === null ? "—" : r.lo + " to " + r.hi}</td>
                        <td>{r.tooThin
                          ? <span className="mono" style={{ fontSize: 11, color: "#b45309" }}>too few to say</span>
                          : r.significant ? <span className="mono" style={{ fontSize: 11, color: "#15803d" }}>clear of zero</span>
                          : <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>within noise</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : null)}
          </div>
        ))
      )}

      {/* ── Catalogue ───────────────────────────────────────────────────────
          Published instruments with their provenance. "A test we wrote" is the
          weakest answer to "measured with what?", and every fund this
          programme applies to asks the question. Adopting is deliberate and
          audited, because the choice of measure decides what can be claimed. */}
      {tab === "catalogue" && (
        <div className="admin-section">
          <div className="admin-section-head">
            <div>
              <h3 className="admin-h3" style={{ margin: 0 }}>Published instruments</h3>
              <p className="admin-hint" style={{ margin: "6px 0 0", maxWidth: 760 }}>{catNote}</p>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!pickedKeys.length || busy === "adopt"}
              onClick={() => adopt(pickedKeys)}>
              {busy === "adopt" ? "Adopting…" : "Adopt " + (pickedKeys.length || "") + " selected"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 14px" }}>
            {["All"].concat(Array.from(new Set((cat || []).map(c => c.family)))).map(f => (
              <button key={f} className={"chip" + (catFam === f ? " is-active" : "")} onClick={() => setCatFam(f)}
                style={{ cursor: "pointer", border: "var(--rs-border-112, 1px solid var(--line,#e5e8ee))", background: catFam === f ? "var(--ink-900,#0a1130)" : "#fff", color: catFam === f ? "#fff" : "inherit" }}>{f}</button>
            ))}
          </div>
          {cat === null ? <div className="admin-empty">Loading…</div>
            : cat.length === 0 ? <div className="admin-empty">The catalogue is empty.</div>
            : <div style={{ display: "grid", gap: 12 }}>
              {cat.filter(c => catFam === "All" || c.family === catFam).map(c => (
                <div key={c.key} className="admin-card" style={{ padding: 16, border: "var(--rs-border-112, 1px solid var(--line,#e5e8ee))", borderRadius: 12, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {!c.adopted && <input type="checkbox" checked={!!picked[c.key]} aria-label={"Adopt " + c.name}
                      style={{ marginTop: 4 }}
                      onChange={e => setPicked(x => ({ ...x, [c.key]: e.target.checked }))}/>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 15 }}>{c.name}</b>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                          {c.domainLabel} · {outOf(c)} · {c.gradeFromLabel}–{c.gradeToLabel}
                        </span>
                        {c.adopted
                          ? <span className="mono" style={{ fontSize: 10.5, color: "#15803d" }}>✓ adopted</span>
                          : null}
                        {c.higherIsBetter === false && <span className="mono" style={{ fontSize: 10.5, color: "#b45309" }}>lower is better</span>}
                      </div>
                      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55 }}>{c.notes}</p>
                      {/* The adaptation note is not fine print: importing another
                          country's word list measures the wrong thing while
                          looking rigorous, so it sits at full size. */}
                      <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "#b45309" }}>
                        <b>Before you use it:</b> {c.adapt}
                      </p>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 10, lineHeight: 1.6 }}>
                        <div>{c.source}</div>
                        <div>{c.licence}</div>
                        <div>{c.citation}</div>
                        {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.sourceUrl}</a>}
                      </div>
                    </div>
                    {!c.adopted && <button className="btn btn-ghost btn-sm" disabled={busy === "adopt"}
                      onClick={() => adopt([c.key])}>Adopt</button>}
                  </div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {/* ── Instruments ─────────────────────────────────────────────────── */}
      {tab === "instruments" && (
        <div className="admin-section">
          <div className="admin-section-head">
            <h3 className="admin-h3" style={{ margin: 0 }}>Instruments</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setTab("catalogue")}>Browse the catalogue</button>
              <button className="btn btn-primary btn-sm" onClick={() => setEdit({ name: "", domain: "literacy", maxScore: 50, items: 0, gradeFrom: "", gradeTo: "", notes: "", unit: "", scale: "points", higherIsBetter: true, source: "", sourceUrl: "", licence: "", citation: "" })}>＋ New instrument</button>
            </div>
          </div>
          {inst === null ? <div className="admin-empty">Loading…</div>
            : inst.length === 0 ? <div className="admin-empty">No instrument defined yet.</div>
            : <table className="admin-table">
                <thead><tr><th>Instrument</th><th>Domain</th><th>Scored in</th><th>Classes</th><th>Results</th><th>Sittings</th><th/></tr></thead>
                <tbody>{inst.map(i => (
                  <tr key={i.instrumentId}>
                    <td><b>{i.name}</b>{i.version > 1 ? <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}> v{i.version}</span> : null}
                      {i.locked && <div className="mono" style={{ fontSize: 10.5, color: "var(--gold-700,#7a5600)" }}>locked — has results</div>}
                      {i.source && <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{i.source}</div>}</td>
                    <td>{i.domainLabel}</td>
                    <td className="mono">{outOf(i)}{i.higherIsBetter === false ? " · lower is better" : ""}</td>
                    <td className="mono">{i.gradeFrom || i.gradeTo ? (i.gradeFrom || "?") + "–" + (i.gradeTo || "?") : "any"}</td>
                    <td className="mono">{i.results}</td>
                    <td className="mono">{i.windows}</td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...i, gradeFrom: i.gradeFrom || "", gradeTo: i.gradeTo || "" })}>Edit</button>
                      {["baseline", "endline"].map(ph =>
                        (wins || []).some(w => w.instrumentId === i.instrumentId && w.phase === ph)
                          ? null
                          : <button key={ph} className="btn btn-ghost btn-sm" onClick={() => newWindow(i.instrumentId, ph)}>＋ {ph}</button>)}
                      {i.locked && <button className="btn btn-ghost btn-sm" title="A new version, so old pairs stay comparable"
                        onClick={async () => { await NGGApi.admin.assessInstrumentRevise(i.instrumentId); load(); }}>New version</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>}

          <h3 className="admin-h3" style={{ marginTop: 24 }}>Sittings</h3>
          {(wins || []).length === 0 ? <div className="admin-empty">No sitting opened yet.</div>
            : <table className="admin-table">
                <thead><tr><th>Instrument</th><th>Phase</th><th>Dates</th><th>Sat</th><th>Absent</th><th/></tr></thead>
                <tbody>{(wins || []).map(w => (
                  <tr key={w.windowId}>
                    <td><b>{(instById[w.instrumentId] || {}).name || w.instrumentId}</b></td>
                    <td>{w.phase}</td>
                    <td className="mono">{w.opensAt || "—"} → {w.closesAt || "—"}</td>
                    <td className="mono">{w.sat}</td>
                    <td className="mono">{w.absent}</td>
                    <td><button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => openSheet(w)}>Record scores →</button></td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>
      )}

      {/* ── The register ────────────────────────────────────────────────── */}
      {tab === "record" && (
        !sheet ? <div className="admin-empty">Pick a sitting on the Instruments tab.</div>
        : <div className="admin-section">
            <div className="admin-section-head">
              <div>
                <h3 className="admin-h3" style={{ margin: 0 }}>{sheet.instrument.name} · {sheet.window.phase}</h3>
                <p className="admin-hint" style={{ margin: "4px 0 0" }}>
                  {sheet.instrument.unit ? "Scored in " + sheet.instrument.unit + ", 0–" + sheet.instrument.maxScore + "."
                    : "Out of " + sheet.instrument.maxScore + "."} Leave blank for a child who has not been marked yet;
                  tick <b>absent</b> for one who did not sit — that is not a zero, and recording it as one would
                  turn an attendance problem into a learning finding.
                </p>
              </div>
              <button className="btn btn-primary" disabled={busy === "record"} onClick={saveSheet}>
                {busy === "record" ? "Saving…" : "Save register"}
              </button>
            </div>
            <table className="admin-table">
              <thead><tr><th>Child</th><th>Centre</th><th>Class</th><th>Score</th><th>Absent</th></tr></thead>
              <tbody>{(sheet.students || []).map(st => {
                const m = marks[st.studentId] || {};
                return (
                  <tr key={st.studentId} style={st.outOfRange ? { background: "rgba(245,176,38,.07)" } : undefined}>
                    <td><b>{st.name}</b>
                      {st.outOfRange && <div className="mono" style={{ fontSize: 10.5, color: "#b45309" }}>outside this instrument's classes</div>}
                      {st.noGrade && <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-500)" }}>no class on file</div>}</td>
                    <td>{st.centre}</td>
                    <td className="mono">{st.grade || "—"}</td>
                    <td>
                      <input className="admin-input" type="number" min={0} max={sheet.instrument.maxScore}
                        style={{ width: 90 }} value={m.score || ""} disabled={!!m.absent}
                        aria-label={"Score for " + st.name}
                        onChange={e => setMarks(x => ({ ...x, [st.studentId]: { ...(x[st.studentId] || {}), score: e.target.value } }))}/>
                    </td>
                    <td>
                      <input type="checkbox" checked={!!m.absent} aria-label={"Absent: " + st.name}
                        onChange={e => setMarks(x => ({ ...x, [st.studentId]: { ...(x[st.studentId] || {}), absent: e.target.checked } }))}/>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
      )}

      {/* ── The instrument editor ───────────────────────────────────────── */}
      {edit && (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-label="Instrument"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="admin-drawer-head">
            <b>{edit.instrumentId ? "Edit instrument" : "New instrument"}</b>
            <button type="button" className="admin-drawer-close" onClick={() => setEdit(null)}>✕</button>
          </div>
          {edit.locked && <p className="admin-hint" style={{ color: "var(--gold-700,#7a5600)" }}>
            This instrument has results against it. Its name and notes can still be corrected, but what it
            measures and what it is out of are fixed — changing those would make every existing baseline/endline
            pair incomparable with nothing in the numbers to show it. Use <b>New version</b> instead.
          </p>}
          <Field label="Name" value={edit.name} onChange={v => setEdit(x => ({ ...x, name: v }))}/>
          <FieldSelect label="Domain" value={edit.domain} onChange={v => setEdit(x => ({ ...x, domain: v }))}
            options={["literacy", "numeracy", "sel", "gender_attitudes", "other"]}/>
          <Field label="Maximum score" type="number" value={String(edit.maxScore)} onChange={v => setEdit(x => ({ ...x, maxScore: parseInt(v, 10) || 0 }))}/>
          <Field label="Number of items (optional)" type="number" value={String(edit.items || "")} onChange={v => setEdit(x => ({ ...x, items: parseInt(v, 10) || 0 }))}/>
          {/* Scale decides whether a percentage may be printed at all. A rate
              has no maximum to be a fraction of; a ladder's rungs are not
              equally spaced. Both report in their own unit instead. */}
          <FieldSelect label="Kind of score" value={edit.scale || "points"} onChange={v => setEdit(x => ({ ...x, scale: v }))}
            options={["points", "rate", "level"]}/>
          <Field label="Unit — how the score is written (e.g. correct words per minute)" value={edit.unit || ""}
            onChange={v => setEdit(x => ({ ...x, unit: v }))}/>
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", fontSize: 13.5 }}>
            <input type="checkbox" checked={edit.higherIsBetter !== false}
              onChange={e => setEdit(x => ({ ...x, higherIsBetter: e.target.checked }))}/>
            A higher score is the better result
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <FieldSelect label="From class" value={edit.gradeFrom || ""} onChange={v => setEdit(x => ({ ...x, gradeFrom: v }))}
              options={["", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"]}/>
            <FieldSelect label="To class" value={edit.gradeTo || ""} onChange={v => setEdit(x => ({ ...x, gradeTo: v }))}
              options={["", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"]}/>
          </div>
          <FieldTextarea label="Notes — how it is administered" rows={3} value={edit.notes || ""}
            onChange={v => setEdit(x => ({ ...x, notes: v }))}/>
          {/* Provenance is editable even on a home-grown instrument, because
              "measured with what?" gets asked about those too. */}
          <Field label="Source — who published it" value={edit.source || ""} onChange={v => setEdit(x => ({ ...x, source: v }))}/>
          <Field label="Source link" value={edit.sourceUrl || ""} onChange={v => setEdit(x => ({ ...x, sourceUrl: v }))}/>
          <Field label="Licence" value={edit.licence || ""} onChange={v => setEdit(x => ({ ...x, licence: v }))}/>
          <FieldTextarea label="Citation" rows={2} value={edit.citation || ""} onChange={v => setEdit(x => ({ ...x, citation: v }))}/>
          <FieldTextarea label="Local adaptation needed before use" rows={2} value={edit.adaptNote || ""}
            onChange={v => setEdit(x => ({ ...x, adaptNote: v }))}/>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy === "inst"} onClick={saveInstrument}>Save</button>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDonations() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.donations().then(setD).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  /* Uses the module's shared `naira` — this had a local copy of the same
     formatter, which is one more place the currency would have to be changed. */
  const rows = d ? d.donations : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Donations {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {naira(d.totalPaid)} raised</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!rows || !rows.length} onClick={() => downloadCsv("donations", rows)}>Export CSV</button>
      </div>
      {d && !d.enabled && <p className="admin-hint" style={{ color: "var(--amber-800, #9a3412)" }}>⚠ Donations are off — set <span className="mono">paystack.secret</span> in api/config.php and point the Paystack webhook at <span className="mono">/api/hooks/paystack.php</span>.</p>}
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        rows === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">No donations yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Reference</th><th>Donor</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.reference}><td className="mono">{r.reference}</td><td>{r.name || r.email}</td><td>{naira(r.amount)}</td><td><span className={"chip status-" + (r.status === "paid" ? "published" : "draft")}>{r.status}</span></td><td className="mono">{fmtDate(r.paidAt || r.createdAt)}</td></tr>)}</tbody>
        </table></div>}
    </div>
  );
}

// ============================================================================
// Comment moderation — approve/reject member comments before they go public
// ============================================================================

/* ── Community 2.0 — moderation queue + channel management ─────────────── */
/* How hard the feed is screened. Super-admin only — the server enforces that
   too; this hides a control the account cannot use rather than relying on it. */
function AdminCommunityModeration({ mode, onChanged }) {
  const { hasCap } = useAuth();
  const [busy, setBusy] = React.useState("");
  if (!hasCap || !hasCap("rbac")) return null;
  const MODES = [
    ["strict", "Hold for review", "A borderline post waits for a mentor before anyone sees it. Every video waits."],
    ["flag",   "Publish, then review", "Nothing is held up. Borderline posts go live and appear in your review queue."],
    ["off",    "No screening", "Nothing is checked automatically. Reporting and deleting still work."],
  ];
  const pick = async (m) => {
    if (m === mode || busy) return;
    if (m === "off" && !(await dialog.confirm({
      title: "Turn off automatic screening?",
      body: "Posts and comments from members aged 10–17 will go straight to the feed with nothing checking them first.\n\n"
          + "Reporting, deleting and your review queue keep working, and a member writing about harming themselves is still picked up and offered help — that is not part of this setting.\n\n"
          + "This is recorded in the audit log against your account.",
      cta: "Turn it off", danger: true,
    }))) return;
    setBusy(m);
    try {
      const r = await NGGApi.admin.community.moderation(m);
      toast.success(r.released ? "Saved · " + r.released + " waiting item" + (r.released === 1 ? "" : "s") + " published"
        : "Saved.");
      if (r.videosStillHeld) toast.info(r.videosStillHeld + " video" + (r.videosStillHeld === 1 ? "" : "s") + " still waiting — frames aren't the whole clip, so those need a look.");
      onChanged && onChanged(r.mode);
    } catch (e) { toast.error(e.code === "forbidden" ? "Only a super admin can change this." : (e.code || e.message)); }
    finally { setBusy(""); }
  };
  return (
    <div className="admin-modmode">
      <div className="admin-field-label">Automatic screening</div>
      <div className="admin-modmode-row">
        {MODES.map(([k, label, hint]) => (
          <button key={k} type="button" className={"admin-modmode-opt" + (mode === k ? " is-on" : "")}
            aria-pressed={mode === k} disabled={!!busy} onClick={() => pick(k)}>
            <b>{label}</b><span>{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
/* ============================================================================
   Programme promotions — house announcements in the members' own surfaces.

   Deliberately narrow. There is no URL field, no audience builder beyond the
   facts the roster already holds, and no third-party anything: the audience is
   children, and behavioural advertising to minors is a different product with
   a different legal footing. See api/_lib/domain/promos.php.
   ========================================================================== */

const PROMO_PLACEMENT_LABEL = {
  chess: "Chess screen", community: "Community feed",
  dashboard: "Member dashboard", arcade: "Arcade", game: "Beside a game",
};
const PROMO_SHAPE_LABEL = {
  card: "Strip in the screen", popup: "Small card, once",
};
const PROMO_KIND_LABEL = {
  programme: "Programme", event: "Event", tournament: "Tournament", notice: "Notice",
};

function AdminPromos() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    NGGApi.admin.promos.list()
      .then(r => { setD(r); setErr(""); })
      .catch(e => setErr(e.code || e.message || "Couldn't load promotions."));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const save = async (data) => {
    setBusy("save");
    try { await NGGApi.admin.promos.save(data); toast.success("Saved."); setEditing(null); load(); }
    catch (e) { toast.error(e.detail || e.code || e.message); }
    finally { setBusy(""); }
  };
  const remove = async (p) => {
    if (!(await dialog.confirm({ title: "Delete “" + p.title + "”?",
      body: "The promotion and its counts go. This cannot be undone.", confirmLabel: "Delete" }))) return;
    try { await NGGApi.admin.promos.remove(p.promoId); toast.success("Deleted."); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const setStatus = async (p, status) => {
    /* Everything, not just the status: save() is an upsert of the whole row,
       so a Publish that forwards three fields silently blanks the rest. */
    await save(Object.assign({}, p, { status, kinds: p.audience.kinds,
      centres: p.audience.centres, programme: p.audience.programme }));
  };

  if (editing) {
    return <AdminPromoEdit promo={editing} meta={d} busy={busy === "save"}
                           onCancel={() => setEditing(null)} onSave={save}/>;
  }

  const rows = (d && d.promos) || [];
  const live = rows.filter(p => p.status === "live");
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Promotions</h2></div>
      <p className="admin-hint">
        Announcements for your own programmes, shown inside the screens members already use —
        one per screen, never a stack, and always dismissible. They can only link to a page in
        this app: there is no field for an outside address, because the audience is children.
      </p>
      {err && <div className="admin-err" role="alert">{err}</div>}

      <div className="admin-card trn-host-card" style={{ marginBottom: 18 }}>
        <div className="admin-field-label">New promotion</div>
        <p className="admin-hint" style={{ margin: "0 0 12px" }}>
          {live.length === 0 ? "Nothing is live right now."
            : live.length + (live.length === 1 ? " promotion is" : " promotions are") + " live across "
              + new Set(live.map(p => p.placement)).size + " screen(s)."}
        </p>
        <button className="btn btn-primary" onClick={() => setEditing({ status: "draft", placement: "chess",
          kind: "programme", priority: 0, audience: { kinds: [], centres: [], programme: "" } })}>
          Write a promotion →
        </button>
      </div>

      {!d ? <div className="admin-skel"/> : rows.length === 0 ? (
        <div className="admin-empty">No promotions yet. Write one and it appears on the screen you choose.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr>
              <th>Promotion</th><th>Where</th><th>Audience</th><th>Seen</th><th>Clicks</th><th>Hidden</th><th/>
            </tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.promoId}>
                  <td>
                    <div className="admin-cell-name">{p.title}</div>
                    <div className="mono admin-cell-sub">
                      {PROMO_KIND_LABEL[p.kind] || p.kind}
                      {p.shape === "popup" ? " · popup" : ""}
                      {p.ctaPage ? " → " + p.ctaPage : " · no link"}
                      {p.startsAt || p.endsAt ? " · scheduled" : ""}
                      {p.imageUrl ? (p.inlineImage ? " · picture (in database)" : " · picture") : ""}
                    </div>
                  </td>
                  <td>
                    <div>{PROMO_PLACEMENT_LABEL[p.placement] || p.placement}</div>
                    <span className={"chip " + (p.status === "live" ? "chip-lime" : p.status === "draft" ? "status-draft" : "status-archived")}>{p.status}</span>
                  </td>
                  <td className="mono admin-cell-sub">
                    {p.audience.kinds.length || p.audience.centres.length || p.audience.programme
                      ? [p.audience.kinds.join("/"), p.audience.centres.join("/"), p.audience.programme]
                          .filter(Boolean).join(" · ")
                      : p.tournamentId ? "one event" : "everyone"}
                    {p.tournamentId && p.audience.kinds.length ? " · one event" : ""}
                  </td>
                  <td className="mono">{p.impressions}</td>
                  <td className="mono">
                    {p.clicks}
                    {/* A rate under thirty impressions is noise, and a number
                        that looks like a measurement invites a decision it
                        cannot support. The server withholds it; so do we. */}
                    {p.ctr !== null && p.ctr !== undefined
                      ? <div className="admin-cell-sub">{p.ctr}%</div>
                      : <div className="admin-cell-sub">—</div>}
                  </td>
                  <td className="mono">{p.dismissals}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {p.status !== "live"
                      ? <button className="btn btn-primary btn-sm" onClick={() => setStatus(p, "live")}>Publish</button>
                      : <button className="btn btn-ghost btn-sm" onClick={() => setStatus(p, "ended")}>End</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={() => remove(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Write one. Short on purpose — a promotion is a headline, a line and a
    destination, and a form that asks for more gets filled in with less. */
/**
 * The picture on a promotion.
 *
 * Goes through the same upload path as every other image in the product, which
 * tries the configured cloud first and falls back to an inline data URI when
 * there is no cloud. Both are supported, and the difference is stated here
 * rather than hidden, because it is a real one: a cloud URL is a hundred bytes
 * inside every promo the members fetch, and an inline image is its whole size,
 * every time, on a connection somebody is paying for by the megabyte.
 */
function AdminPromoImage({ value, max, onChange }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const inline = typeof value === "string" && value.slice(0, 5) === "data:";

  const pick = async (file) => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      /* `kind` decides how hard the shrink is before upload. A promo image is
         drawn at about 320px wide, so anything bigger is data nobody sees. */
      const r = await NGGApi.uploadOrInline(file, "promo");
      if (r.inline && r.url.length > max) {
        setErr("That picture is too big to store without a cloud set up (" +
               Math.round(r.url.length / 1024) + "KB, limit " + Math.round(max / 1024) + "KB). Try a smaller one.");
      } else {
        onChange(r.url);
      }
    } catch (e) {
      setErr((e && e.message) || "That upload did not work.");
    } finally { setBusy(false); }
  };

  return (
    <div className="trn-field">
      <span className="trn-field-l">Picture <span>optional</span></span>
      <div className="promo-img-row">
        {value ? (
          <span className="promo-img-thumb">
            <img src={value} alt="The picture on this promotion, as members will see it."/>
          </span>
        ) : <span className="promo-img-thumb is-empty" aria-hidden="true">◫</span>}
        <div className="promo-img-acts">
          <label className="btn btn-ghost btn-sm">
            {busy ? "Uploading…" : value ? "Change picture" : "Add a picture"}
            <input type="file" accept="image/*" className="sr-only" disabled={busy}
                   onChange={e => pick(e.target.files && e.target.files[0])}/>
          </label>
          {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>Remove</button>}
          <p className="admin-hint" style={{ margin: "6px 0 0" }}>
            {!value ? "Wide pictures work best — it is shown small, beside the words."
              : inline ? "Stored in the database, because no image cloud is set up. It is sent to every member who sees this promotion, so keep it small."
              : "On the image cloud, so it costs members almost nothing to load."}
          </p>
          {err && <div className="admin-err" role="alert">{err}</div>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Quote of the week — Hausa riddles, Igbo and Yoruba proverbs.
   The home page cycles Hausa → Igbo → Yoruba one week at a time; each
   language walks its own list top to bottom. See api/_lib/domain/wisdom.php.
   ========================================================================== */
const WISDOM_LANG_LABEL = { hausa: "Hausa", igbo: "Igbo", yoruba: "Yorùbá" };
const WISDOM_ERR = {
  tts_not_configured: "Voice generation needs a Spitch key in api/config.php ('tts' → 'spitch_key'). A voice-over works without one.",
  has_custom_voice: "This saying has a staff voice-over. Remove it first if you want a generated one instead.",
  tts_failed: "The voice service didn't answer. Try again in a minute.",
  tts_bad_audio: "The voice service sent something that isn't audio.",
  bad_audio: "That file isn't an audio format we can play (MP3, M4A, WAV, OGG or WebM).",
  audio_too_big: "That clip is too big — trim it or export it as MP3.",
  text_required: "Write the saying first.",
  consent_required: "Tick the consent box — a voice is only cloned with the speaker's permission.",
  transcript_required: "Type exactly what the speaker says in the recording.",
  name_required: "Give the voice a name.",
  too_many_voices: "Twenty cloned voices is the limit here. Delete one first.",
  clone_failed: "The voice service couldn't make a voice from that recording.",
};
const wisdomErr = (e) => WISDOM_ERR[e && e.code] || (e && (e.detail || e.code || e.message)) || "Something went wrong.";
const wisdomFmtWeek = (iso) => fmtDayMonth(iso + "T12:00:00");
const wisdomCap = (v) => v ? v[0].toUpperCase() + v.slice(1) : "";
/* The listen-back: Spitch's own speech-to-text heard the clip and this is how
   closely it matched the words. Shown so a stumble is caught here, not by a
   parent on the home page. */
function WisdomScore({ score }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const good = score >= 0.85;
  return <span className={"wis-score" + (good ? " is-good" : " is-low")}
               title="The voice service transcribed this clip and compared it with the words.">
    {good ? "Pronunciation check " + pct + "%" : pct + "% match — listen before it goes live"}
  </span>;
}

/* Voice options for a language: its own system voices first, then the
   programme's cloned voices (any voice can speak any language). */
function wisdomVoiceOptions(d, lang) {
  const own = ((d.voices || {})[lang] || []).map(v => ({ value: v, label: wisdomCap(v) }));
  const cloned = (d.customVoices || []).map(c => ({ value: c.voiceId, label: c.name + " (cloned)" }));
  return own.concat(cloned);
}

/* Record from the microphone, or pick a file. Hands back a Blob. */
function useWisdomRecorder(onBlob) {
  const [rec, setRec] = React.useState(null);
  const [secs, setSecs] = React.useState(0);
  const can = typeof window !== "undefined" && !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      const parts = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); clearInterval(mr._t); setRec(null); onBlob(new Blob(parts, { type: mr.mimeType || "audio/webm" })); };
      mr.start();
      setSecs(0); mr._t = setInterval(() => setSecs(x => x + 1), 1000);
      setRec(mr);
    } catch (_) { toast.error("The microphone isn't available — allow it in the browser, or upload a file instead."); }
  };
  React.useEffect(() => () => { if (rec && rec.state !== "inactive") rec.stop(); }, [rec]);
  return { can, rec, secs, start, stop: () => rec && rec.stop() };
}
const wisdomBlobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });

function AdminWisdom() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [lang, setLang] = React.useState("hausa");
  const [editing, setEditing] = React.useState(null);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    NGGApi.admin.wisdom.list().then(r => { setD(r); setErr(""); })
      .catch(e => setErr(wisdomErr(e)));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const act = async (key, fn, ok) => {
    setBusy(key);
    try { const r = await fn(); if (ok) toast.success(typeof ok === "function" ? ok(r) : ok); load(); return r || true; }
    catch (e) { toast.error(wisdomErr(e)); return false; }
    finally { setBusy(""); }
  };
  const save = async (data) => {
    const r = await act("save", () => NGGApi.admin.wisdom.save(data), (r) =>
      r && r.voice && r.voice.made && r.voice.made.length ? "Saved and voiced." : r && r.voice && r.voice.ok === false ? "Saved. The voice couldn't be made — try Generate." : "Saved.");
    if (r) setEditing(null);
  };
  const remove = async (w) => {
    if (!(await dialog.confirm({ title: "Delete this saying?", body: "“" + w.text + "” and its voice clips go. The rotation closes the gap.", confirmLabel: "Delete" }))) return;
    act("del" + w.wisdomId, () => NGGApi.admin.wisdom.remove(w.wisdomId), "Deleted.");
  };

  if (err && !d) return (
    <div className="admin-section"><div className="admin-err" role="alert">{err} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div></div>
  );
  if (!d) return <div className="admin-section"><div className="admin-skel"/></div>;

  if (editing) return <AdminWisdomEdit w={editing} kinds={d.kinds} busy={busy === "save"} ttsReady={d.ttsReady} onCancel={() => setEditing(null)} onSave={save}/>;

  const rows = d.sayings.filter(w => w.language === lang);
  const nowId = d.schedule[0] && d.schedule[0].wisdomId;
  return (
    <div className="admin-section wis">
      <div className="admin-section-head">
        <h2 className="admin-h2">Quote of the week</h2>
        <button className="btn btn-primary" onClick={() => setEditing({ language: lang, kind: lang === "hausa" ? "riddle" : "proverb", status: "live" })}>Add a saying</button>
      </div>
      <p className="admin-hint">
        One saying a week, taking turns by language: <b>Hausa 1, Igbo 1, Yorùbá 1, then Hausa 2, Igbo 2, Yorùbá 2</b>, and so on.
        The number in each language's list below is its turn. A language with nothing live sits out until it has one.
        It changes <b>once a week, at midnight at the end of Sunday</b> (00:00 Monday, Lagos time), and this week's saying is
        locked once it has been shown — adding or re-ordering sayings changes the weeks after it, never the one already running.
        Retiring this week's saying is the exception: the next one takes its place straight away.
      </p>

      <div className="wis-sched" aria-label="The next nine weeks">
        {d.schedule.map((s, i) => (
          <div key={s.week} className={"wis-sched-cell wis-" + s.language + (i === 0 ? " is-now" : "")}>
            <span className="wis-sched-wk">{i === 0 ? "This week" : wisdomFmtWeek(s.week)}</span>
            <span className="wis-sched-lang">{WISDOM_LANG_LABEL[s.language]} <span className="wis-sched-n">#{s.number}</span></span>
            <span className="wis-sched-tx" title={s.text}>{s.text}</span>
          </div>
        ))}
        {d.schedule.length === 0 && <div className="admin-hint">Nothing is live, so the home page hides the section.</div>}
      </div>

      <WisdomVoiceSettings d={d} busy={busy} act={act}/>

      <div className="wis-tabs" role="tablist" aria-label="Language">
        {d.languages.map(l => {
          const n = d.sayings.filter(w => w.language === l).length;
          return <button key={l} role="tab" aria-selected={lang === l} className={"wis-tab" + (lang === l ? " is-on" : "")} onClick={() => setLang(l)}>{WISDOM_LANG_LABEL[l]} <span className="wis-count">{n}</span></button>;
        })}
      </div>

      {rows.length === 0 ? (
        <div className="admin-card wis-empty">No {WISDOM_LANG_LABEL[lang]} sayings yet. <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ language: lang, kind: "proverb", status: "live" })}>Add the first</button></div>
      ) : (
        <ol className="wis-list">
          {rows.map((w, i) => (
            <li key={w.wisdomId} className={"admin-card wis-item" + (w.status === "hidden" ? " is-hidden" : "")}>
              <div className="wis-item-main">
                <div className="wis-item-meta">
                  <span className="wis-pos" aria-label={"Turn " + (i + 1)}>{i + 1}</span>
                  <span className="chip">{w.kind}</span>
                  {w.status === "hidden" && <span className="chip">hidden</span>}
                  {w.wisdomId === nowId && <span className="chip wis-live">on the site now</span>}
                </div>
                <p className="wis-text" lang={w.langCode}>{w.text}</p>
                {w.translation && <p className="wis-tr">{w.translation}</p>}
                {w.answer && <p className="wis-ans"><b>Answer:</b> {w.answer}{w.answerTranslation ? " — " + w.answerTranslation : ""}</p>}
              </div>
              <div className="wis-item-side">
                <div className="wis-order">
                  <button className="btn btn-ghost btn-sm" aria-label="Move up" disabled={i === 0 || !!busy} onClick={() => act("mv", () => NGGApi.admin.wisdom.move(w.wisdomId, "up"))}>↑</button>
                  <button className="btn btn-ghost btn-sm" aria-label="Move down" disabled={i === rows.length - 1 || !!busy} onClick={() => act("mv", () => NGGApi.admin.wisdom.move(w.wisdomId, "down"))}>↓</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(w)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === "del" + w.wisdomId} onClick={() => remove(w)}>Delete</button>
                </div>
                <WisdomVoice w={w} d={d} busy={busy} act={act}/>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* The voices the sayings are read in: a default per language, "voice
   everything", and voices cloned from a real speaker. */
function WisdomVoiceSettings({ d, busy, act }) {
  const [defs, setDefs] = React.useState(d.voiceDefaults || {});
  const [cloning, setCloning] = React.useState(false);
  React.useEffect(() => { setDefs(d.voiceDefaults || {}); }, [d.voiceDefaults]);
  const dirty = JSON.stringify(defs) !== JSON.stringify(d.voiceDefaults || {});
  const langs = d.languages.concat(["english"]);
  const label = (l) => l === "english" ? "English (translation)" : WISDOM_LANG_LABEL[l];

  const voiceAll = () => act("all", () => NGGApi.admin.wisdom.voiceAll(), (r) =>
    (r.voiced ? r.voiced + " voiced" : "Nothing voiced") + (r.failed && r.failed.length ? ", " + r.failed.length + " failed" : "")
    + (r.remaining ? " — " + r.remaining + " left, press again." : "."));
  const delVoice = async (c) => {
    if (!(await dialog.confirm({ title: "Delete the voice “" + c.name + "”?", body: "Clips already made keep playing. New ones can't use it.", confirmLabel: "Delete voice" }))) return;
    act("dv", () => NGGApi.admin.wisdom.deleteVoice(c.voiceId), "Voice deleted.");
  };

  return (
    <section className="admin-card wis-vs" aria-labelledby="wis-vs-h">
      <div className="wis-vs-head">
        <h3 className="admin-field-label" id="wis-vs-h">Voices</h3>
        {d.ttsReady
          ? <button className="btn btn-primary btn-sm" disabled={!!busy || !d.missingVoice} onClick={voiceAll}>
              {busy === "all" ? "Voicing…" : d.missingVoice ? "Voice everything missing (" + d.missingVoice + ")" : "Everything is voiced"}
            </button>
          : null}
      </div>
      {!d.ttsReady ? (
        <p className="admin-hint wis-note">Generated voices are off: add a Spitch key under <code>'tts' → 'spitch_key'</code> in api/config.php.
          Once it's there, every saying is voiced automatically — in its own language and then in English. Uploading or recording a voice-over works now.</p>
      ) : (
        <p className="admin-hint wis-note">Each clip is generated <b>once</b> when a saying is saved and kept — it is never made again for the same words and voice.
          Every new clip is listened back to by the voice service in the same language; if a voice stumbles, the next native voice is tried and the best is kept.
          A recorded voice-over always wins over a generated one.</p>
      )}
      {d.ttsReady && <div className="wis-vs-grid">
        {langs.map(l => (
          <label key={l} className="admin-field">
            <span>{label(l)}</span>
            <select className="admin-select" value={defs[l] || ""} onChange={e => setDefs(Object.assign({}, defs, { [l]: e.target.value }))}>
              {wisdomVoiceOptions(d, l).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>}
      {d.ttsReady && dirty && (
        <div className="wis-form-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setDefs(d.voiceDefaults || {})}>Undo</button>
          <button className="btn btn-primary btn-sm" disabled={busy === "defs"} onClick={() => act("defs", () => NGGApi.admin.wisdom.voiceDefaults(defs), "Default voices saved. Regenerate a saying to hear the new voice.")}>Save default voices</button>
        </div>
      )}
      {d.ttsReady && (
        <div className="wis-clones">
          <div className="wis-vs-head">
            <span className="admin-field-label">Cloned voices</span>
            {!cloning && <button className="btn btn-ghost btn-sm" onClick={() => setCloning(true)}>Clone a voice from a recording</button>}
          </div>
          {(d.customVoices || []).length === 0 && !cloning && (
            <p className="admin-hint wis-note">A native speaker you know — a teacher, a parent — records 10 to 30 seconds. Every saying can then be read in their voice.</p>
          )}
          {(d.customVoices || []).map(c => (
            <div key={c.voiceId} className="wis-clone-row">
              <span className="wis-clone-name">{c.name}</span>
              <span className="wis-clone-meta">{label(c.language) || c.language} · {fmtDate(c.createdAt)}</span>
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => delVoice(c)}>Delete</button>
            </div>
          ))}
          {cloning && <WisdomCloneForm d={d} busy={busy} act={act} onDone={() => setCloning(false)}/>}
        </div>
      )}
    </section>
  );
}

function WisdomCloneForm({ d, busy, act, onDone }) {
  const [f, setF] = React.useState({ name: "", language: "yoruba", transcript: "", consent: false });
  const [blob, setBlob] = React.useState(null);
  const [url, setUrl] = React.useState("");
  const fileRef = React.useRef(null);
  const take = (b) => { if (b.size > 8 * 1024 * 1024) { toast.error("That recording is over 8 MB. Thirty seconds is plenty."); return; } setBlob(b); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(b); }); };
  const r = useWisdomRecorder(take);
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const ready = blob && f.name.trim() && f.transcript.trim() && f.consent;
  const submit = async () => {
    const audio = await wisdomBlobToDataUrl(blob);
    const ok = await act("clone", () => NGGApi.admin.wisdom.cloneVoice(Object.assign({ audio }, f)), "Voice created. Choose it as a default or on any saying.");
    if (ok) onDone();
  };
  return (
    <div className="wis-clone-form">
      <p className="admin-hint wis-note">One speaker, a quiet room, 10–30 seconds of natural speech — reading one of the sayings aloud works well. Type exactly what they say.</p>
      <div className="wis-form-row">
        <Field label="Voice name" value={f.name} onChange={v => set("name", v)} placeholder="e.g. Mrs Adebayo"/>
        <FieldSelect label="Language they speak" value={f.language} onChange={v => set("language", v)}
          options={d.languages.concat(["english"]).map(l => ({ value: l, label: l === "english" ? "English" : WISDOM_LANG_LABEL[l] }))}/>
      </div>
      <div className="wis-voice-row">
        {r.can && (r.rec
          ? <button className="btn btn-primary btn-sm" aria-pressed="true" onClick={r.stop}>■ Stop · {r.secs}s</button>
          : <button className="btn btn-ghost btn-sm" aria-pressed="false" onClick={r.start}>● Record</button>)}
        <button className="btn btn-ghost btn-sm" disabled={!!r.rec} onClick={() => fileRef.current && fileRef.current.click()}>Upload a recording</button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={e => { const x = e.target.files && e.target.files[0]; e.target.value = ""; if (x) take(x); }}/>
        {r.rec && r.secs >= 30 && <span className="wis-warn" role="status">30 seconds is the most the voice service uses — stop now.</span>}
      </div>
      {url && <audio className="wis-audio" controls src={url}/>}
      <FieldTextarea label="Exactly what is said in the recording" rows={3} value={f.transcript} onChange={v => set("transcript", v)}/>
      <FieldCheckbox label="The speaker has agreed to their voice being cloned and used to read these sayings on the NGG site." value={f.consent} onChange={v => set("consent", v)}/>
      <div className="wis-form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!ready || busy === "clone"} onClick={submit}>{busy === "clone" ? "Creating…" : "Create the voice"}</button>
      </div>
    </div>
  );
}

/* One saying's audio: both clips, the voice each is read in, and a staff
   voice-over. A voice-over outranks a generated clip and is never silently
   replaced. */
function WisdomVoice({ w, d, busy, act }) {
  const defs = d.voiceDefaults || {};
  const [voice, setVoice] = React.useState(w.voice && w.audioSource === "tts" ? w.voice : (defs[w.language] || ""));
  const [voiceEn, setVoiceEn] = React.useState(w.voiceEn || defs.english || "");
  const fileRef = React.useRef(null);
  const key = "v" + w.wisdomId;
  const working = busy === key;

  const sendBlob = async (blob) => {
    if (blob.size > d.audioMax) { toast.error(WISDOM_ERR.audio_too_big); return; }
    const audio = await wisdomBlobToDataUrl(blob);
    act(key, () => NGGApi.admin.wisdom.upload(w.wisdomId, audio), "Voice-over saved.");
  };
  const r = useWisdomRecorder(sendBlob);
  const gen = async (which) => {
    const replace = which !== "english" && w.audioSource === "custom";
    if (replace && !(await dialog.confirm({ title: "Replace the voice-over?", body: "A staff recording is on this saying. The generated voice will replace it.", confirmLabel: "Replace" }))) return;
    act(key, () => NGGApi.admin.wisdom.generate(w.wisdomId, { which, voice, voiceEn, replace }), (res) =>
      res && res.partial ? "Partly voiced — one clip failed. Try again." : "Voice saved.");
  };
  const nameOf = (v) => { const c = (d.customVoices || []).find(x => x.voiceId === v); return c ? c.name : wisdomCap(v); };

  return (
    <div className="wis-voice">
      <div className="wis-voice-head">
        <span className="admin-field-label">{WISDOM_LANG_LABEL[w.language]}</span>
        <span className="wis-voice-src">{w.audioSource === "custom" ? "Staff voice-over" : w.audioSource === "tts" ? "Generated · " + nameOf(w.voice) : "No voice yet"}</span>
      </div>
      {w.audioUrl && <audio className="wis-audio" controls preload="none" src={w.audioUrl} aria-label={"The saying in " + WISDOM_LANG_LABEL[w.language]}/>}
      {w.audioSource === "tts" && <WisdomScore score={w.ttsScore}/>}
      {d.ttsReady && (
        <div className="wis-voice-row">
          <select className="admin-select wis-voice-sel" aria-label={WISDOM_LANG_LABEL[w.language] + " voice"} value={voice} onChange={e => setVoice(e.target.value)}>
            {wisdomVoiceOptions(d, w.language).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {/* Generated once and saved: nothing to press for the voice it already has. */}
          {!w.audioUrl || w.audioSource !== "tts" || voice !== w.voice
            ? <button className="btn btn-ghost btn-sm" disabled={working || !!r.rec} onClick={() => gen("native")}>
                {working ? "Working…" : !w.audioUrl ? "Generate" : "Use this voice"}</button>
            : <span className="wis-saved">Saved</span>}
        </div>
      )}
      <div className="wis-voice-row">
        {r.can && (r.rec
          ? <button className="btn btn-primary btn-sm" aria-pressed="true" onClick={r.stop}>■ Stop · {r.secs}s</button>
          : <button className="btn btn-ghost btn-sm" aria-pressed="false" disabled={working} onClick={r.start}>● Record</button>)}
        <button className="btn btn-ghost btn-sm" disabled={working || !!r.rec} onClick={() => fileRef.current && fileRef.current.click()}>Upload</button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) sendBlob(f); }}/>
        {w.audioUrl && <button className="btn btn-ghost btn-sm" disabled={working || !!r.rec} onClick={() => act(key, () => NGGApi.admin.wisdom.clearVoice(w.wisdomId, "native"), "Voice removed.")}>Remove</button>}
      </div>

      {w.translation && (
        <>
          <div className="wis-voice-head wis-voice-en">
            <span className="admin-field-label">English</span>
            <span className="wis-voice-src">{w.audioUrlEn ? "Generated · " + nameOf(w.voiceEn) : "No voice yet"}</span>
          </div>
          {w.audioUrlEn && <audio className="wis-audio" controls preload="none" src={w.audioUrlEn} aria-label="The English translation"/>}
          {w.audioUrlEn && <WisdomScore score={w.ttsScoreEn}/>}
          {d.ttsReady ? (
            <div className="wis-voice-row">
              <select className="admin-select wis-voice-sel" aria-label="English voice" value={voiceEn} onChange={e => setVoiceEn(e.target.value)}>
                {wisdomVoiceOptions(d, "english").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!w.audioUrlEn || voiceEn !== w.voiceEn
                ? <button className="btn btn-ghost btn-sm" disabled={working} onClick={() => gen("english")}>{!w.audioUrlEn ? "Generate" : "Use this voice"}</button>
                : <span className="wis-saved">Saved</span>}
              {w.audioUrlEn && <button className="btn btn-ghost btn-sm" disabled={working} onClick={() => act(key, () => NGGApi.admin.wisdom.clearVoice(w.wisdomId, "english"), "English clip removed.")}>Remove</button>}
            </div>
          ) : !w.audioUrlEn && <p className="admin-hint wis-note">Read automatically once a Spitch key is set.</p>}
        </>
      )}
    </div>
  );
}

function AdminWisdomEdit({ w, kinds, busy, ttsReady, onCancel, onSave }) {
  const [f, setF] = React.useState({
    wisdomId: w.wisdomId || "", language: w.language || "hausa", kind: w.kind || "proverb",
    text: w.text || "", translation: w.translation || "", answer: w.answer || "",
    answerTranslation: w.answerTranslation || "", meaning: w.meaning || "", status: w.status || "live",
    spokenText: w.spokenText || "",
  });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  return (
    <div className="admin-section">
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>← All sayings</button>
      <div className="admin-section-head" style={{ marginTop: 10 }}>
        <h2 className="admin-h2">{f.wisdomId ? "Edit saying" : "New saying"}</h2>
      </div>
      <div className="admin-card wis-form">
        <div className="wis-form-row">
          <FieldSelect label="Language" value={f.language} onChange={v => set("language", v)} options={Object.keys(WISDOM_LANG_LABEL).map(k => ({ value: k, label: WISDOM_LANG_LABEL[k] }))}/>
          <FieldSelect label="Kind" value={f.kind} onChange={v => set("kind", v)} options={(kinds || ["riddle", "proverb", "quote"]).map(k => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))}/>
          <FieldSelect label="On the site" value={f.status} onChange={v => set("status", v)} options={[{ value: "live", label: "In the rotation" }, { value: "hidden", label: "Hidden" }]}/>
        </div>
        <FieldTextarea label={"The saying, in " + WISDOM_LANG_LABEL[f.language]} rows={2} value={f.text} onChange={v => set("text", v)}/>
        <FieldTextarea label="English translation" rows={2} value={f.translation} onChange={v => set("translation", v)}/>
        <FieldTextarea label="How it should be read (optional) — the same words with full tone marks, if the saying above is written without them. Only the voice uses this." rows={2} value={f.spokenText} onChange={v => set("spokenText", v)}/>
        {f.kind === "riddle" && (
          <div className="wis-form-row">
            <Field label="Answer" value={f.answer} onChange={v => set("answer", v)}/>
            <Field label="Answer in English" value={f.answerTranslation} onChange={v => set("answerTranslation", v)}/>
          </div>
        )}
        <FieldTextarea label="Deeper meaning" rows={4} value={f.meaning} onChange={v => set("meaning", v)}/>
        <p className="admin-hint">{ttsReady ? "Saving voices it automatically — the saying, then the English translation. " : ""}
          {f.wisdomId ? "Changing the words remakes a generated voice (the old one would read the old words). A staff voice-over is kept — re-record it if the wording changed." : ""}</p>
        <div className="wis-form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || f.text.trim().length < 3} onClick={() => onSave(f)}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function AdminPromoEdit({ promo, meta, busy, onCancel, onSave }) {
  const [f, setF] = React.useState({
    promoId: promo.promoId || "", title: promo.title || "", body: promo.body || "",
    kind: promo.kind || "programme", placement: promo.placement || "chess",
    ctaLabel: promo.ctaLabel || "", ctaPage: promo.ctaPage || "", imageUrl: promo.imageUrl || "",
    shape: promo.shape || "card", tournamentId: promo.tournamentId || "",
    priority: promo.priority || 0, status: promo.status || "draft",
    startsAt: promo.startsAt || "", endsAt: promo.endsAt || "",
    kinds: (promo.audience && promo.audience.kinds) || [],
    centres: (promo.audience && promo.audience.centres) || [],
    programme: (promo.audience && promo.audience.programme) || "",
  });
  const set = (patch) => setF(v => Object.assign({}, v, patch));
  const pages = (meta && meta.pages) || ["community", "club", "summer", "events"];
  const centres = (meta && meta.centres) || [];
  const toggle = (list, v) => list.indexOf(v) >= 0 ? list.filter(x => x !== v) : list.concat(v);

  return (
    <div className="admin-section">
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>← All promotions</button>
      <div className="admin-section-head" style={{ marginTop: 10 }}>
        <h2 className="admin-h2">{f.promoId ? "Edit promotion" : "New promotion"}</h2>
      </div>

      <div className="cm-tokens trn-admin-wrap">
        <label className="trn-field">
          <span className="trn-field-l">Headline</span>
          <input className="trn-in" value={f.title} maxLength={120}
                 placeholder="e.g. Summer intake is open" onChange={e => set({ title: e.target.value })}/>
        </label>
        <label className="trn-field">
          <span className="trn-field-l">A line about it <span>optional</span></span>
          <textarea className="trn-in trn-ta" rows={2} value={f.body} maxLength={400}
                    placeholder="Eight weeks, five centres, starts 6 July."
                    onChange={e => set({ body: e.target.value })}/>
        </label>

        <fieldset className="trn-fs">
          <legend className="trn-legend">Where it appears</legend>
          <div className="trn-seg">
            {Object.keys(PROMO_PLACEMENT_LABEL).map(k => (
              <button key={k} type="button" aria-pressed={f.placement === k}
                      className={"trn-seg-b" + (f.placement === k ? " is-on" : "")}
                      onClick={() => set({ placement: k })}>{PROMO_PLACEMENT_LABEL[k]}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="trn-fs">
          <legend className="trn-legend">How it appears</legend>
          <div className="trn-seg">
            {Object.keys(PROMO_SHAPE_LABEL).map(k => (
              <button key={k} type="button" aria-pressed={f.shape === k}
                      className={"trn-seg-b" + (f.shape === k ? " is-on" : "")}
                      onClick={() => set({ shape: k })}>{PROMO_SHAPE_LABEL[k]}</button>
            ))}
          </div>
          <p className="trn-hint">
            {f.shape === "popup"
              ? "A small card beside a game that has just finished or is about to start. Each member sees it once, ever — being seen is what spends it, so nobody gets it twice."
              : "A strip inside the screen. It stays until the member hides it, and a member who hides it is not shown it again."}
          </p>
        </fieldset>

        <AdminPromoImage value={f.imageUrl} max={(meta && meta.inlineMax) || 60000}
                         onChange={(url) => set({ imageUrl: url })}/>

        <div className="trn-band">
          <label className="trn-field">
            <span className="trn-field-l">Button says</span>
            <input className="trn-in" value={f.ctaLabel} maxLength={48}
                   placeholder="See the programme" onChange={e => set({ ctaLabel: e.target.value })}/>
          </label>
          <label className="trn-field">
            <span className="trn-field-l">Takes them to <span>a page in this app</span></span>
            <select className="trn-in" value={f.ctaPage} onChange={e => set({ ctaPage: e.target.value })}>
              <option value="">Nowhere — just a notice</option>
              {pages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <fieldset className="trn-fs">
          <legend className="trn-legend">Who sees it</legend>
          <p className="trn-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Leave everything unticked to reach the whole club. Targeting uses the roster —
            centre, programme and role — and nothing about what anybody has read or played.
          </p>
          {TRN_KINDS.map(k => (
            <label key={k.id} className={"trn-check" + (f.kinds.indexOf(k.id) >= 0 ? " is-on" : "")}>
              <input type="checkbox" checked={f.kinds.indexOf(k.id) >= 0}
                     onChange={() => set({ kinds: toggle(f.kinds, k.id) })}/>
              <span>{k.label}</span>
            </label>
          ))}
          {/* One event's players, and nobody else. "Round three is drawn" is
              news to an entrant and noise to the other ninety members. */}
          {(meta && meta.tournaments || []).length > 0 && (
            <label className="trn-field" style={{ marginTop: 12 }}>
              <span className="trn-field-l">Only the people in one tournament <span>optional</span></span>
              <select className="trn-in" value={f.tournamentId}
                      onChange={e => set({ tournamentId: e.target.value })}>
                <option value="">Anybody who matches above</option>
                {(meta.tournaments || []).map(t => (
                  <option key={t.tournamentId} value={t.tournamentId}>{t.name} · {t.status}</option>
                ))}
              </select>
            </label>
          )}
          {centres.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span className="trn-field-l" style={{ display: "block", marginBottom: 6 }}>Centres</span>
              {centres.map(c => (
                <label key={c} className={"trn-check" + (f.centres.indexOf(c) >= 0 ? " is-on" : "")}>
                  <input type="checkbox" checked={f.centres.indexOf(c) >= 0}
                         onChange={() => set({ centres: toggle(f.centres, c) })}/>
                  <span>{c}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="trn-band">
          <label className="trn-field">
            <span className="trn-field-l">Starts <span>optional</span></span>
            <input className="trn-in" type="datetime-local"
                   value={f.startsAt ? f.startsAt.slice(0, 16) : ""}
                   onChange={e => set({ startsAt: e.target.value ? e.target.value + ":00Z" : "" })}/>
          </label>
          <label className="trn-field">
            <span className="trn-field-l">Ends <span>optional</span></span>
            <input className="trn-in" type="datetime-local"
                   value={f.endsAt ? f.endsAt.slice(0, 16) : ""}
                   onChange={e => set({ endsAt: e.target.value ? e.target.value + ":00Z" : "" })}/>
          </label>
        </div>

        <label className="trn-field">
          <span className="trn-field-l">Priority <span>higher wins when two are live on one screen</span></span>
          <input className="trn-in" type="number" min="0" max="100" value={f.priority}
                 onChange={e => set({ priority: Math.max(0, Math.min(100, +e.target.value || 0)) })}/>
        </label>

        <div className="trn-wiz-foot" style={{ position: "static", padding: "14px 0 0" }}>
          <button className="trn-back" onClick={onCancel}>Cancel</button>
          <button className="cmm-cta" disabled={busy || f.title.trim().length < 3}
                  onClick={() => onSave(f)}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// Tournaments — centre rounds through to a final
// ============================================================================

const TRN_STATUS_CHIP = {
  draft: "status-draft", open: "chip-lime", running: "chip-gold",
  complete: "chip-navy", cancelled: "status-archived",
};

function AdminTournaments() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [openId, setOpenId] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    NGGApi.admin.tournaments.list()
      .then(r => { setData(r); setErr(""); })
      .catch(e => setErr(e.code || e.message || "Couldn't load tournaments."));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  /* ONE creation interface, not two.
     This screen used to carry its own inline form — a name, a programme
     dropdown and a Create button — which could not ask for a format, a clock,
     who may enter or how many rounds. Rather than grow a second wizard beside
     the one on the chess screen, the console opens the same component: a
     director gets the same four steps wherever they start, and there is one
     place to change when the questions change. */
  if (creating && typeof CmTrnCreate === "function") {
    return (
      <div className="admin-section">
        <div className="cm-tokens trn-admin-wrap">
          <CmTrnCreate onBack={() => setCreating(false)}
                       onCreated={(id) => { setCreating(false); load(); setOpenId(id); }}/>
        </div>
      </div>
    );
  }

  if (openId) return <AdminTournamentBracket tournamentId={openId} onBack={() => { setOpenId(""); load(); }}/>;

  const rows = (data && data.tournaments) || [];
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Tournaments</h2></div>
      <p className="admin-hint">
        Five formats. A <b>Swiss</b> is usually the right one for a club session — everybody plays
        every round and nobody goes home after one loss. A <b>centre cup</b> runs a knockout per
        centre and puts the champions in a final, so a child at a small centre can win something
        without meeting a big one in round one. Players enter themselves from the chess screen.
      </p>
      {err && <div className="admin-err" role="alert">{err}</div>}

      <div className="admin-card trn-host-card" style={{ marginBottom: 18 }}>
        <div className="admin-field-label">Host a new one</div>
        <p className="admin-hint" style={{ margin: "0 0 12px" }}>
          Swiss, knockout, round robin, a centre cup or a timed arena — with a real clock,
          and a rating that moves. Four steps, and you can see the whole thing before it is published.
        </p>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>Host a tournament →</button>
      </div>

      {!data ? <div className="admin-skel"/> : rows.length === 0 ? (
        <div className="admin-empty">No tournaments yet. Create one above, add the players, then start round one.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr>
              <th>Name</th><th>Format</th><th>Stage</th><th>Entrants</th><th>Still in</th><th>Games open</th><th/>
            </tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.tournamentId}>
                  <td>
                    <div className="admin-cell-name">{t.name}</div>
                    <div className="mono admin-cell-sub">{t.tournamentId}{t.programme ? " · " + t.programme : ""}</div>
                  </td>
                  <td>
                    <div>{t.formatName || t.format || "Centre cup"}</div>
                    <div className="mono admin-cell-sub">
                      {admTc(t.timeControl)} · {t.rated === false ? "casual" : "rated"}
                    </div>
                  </td>
                  <td>
                    <span className={"chip " + (TRN_STATUS_CHIP[t.status] || "status-draft")}>{t.status}</span>
                    {t.status === "running" && <div className="mono admin-cell-sub">{t.stage} · round {t.round}</div>}
                    {t.winnerName && <div className="admin-cell-sub">🏆 {t.winnerName}</div>}
                  </td>
                  <td className="mono">{t.entrants}</td>
                  <td className="mono">{t.live}</td>
                  <td className="mono">{t.openMatches > 0
                    ? <span className="chip chip-gold">{t.openMatches}</span>
                    : <span className="admin-cell-sub">none</span>}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(t.tournamentId)}>Open tournament</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Standings and pairings inside the console, from the same components the
    members' screen uses — so a director and a player are never looking at two
    different renderings of the same table. */
/* Wire values, not labels. "1day" printed straight out reads as a typo, and
   the tournament list and the control room were both printing it. */
const ADM_TC_LABEL = { "3+2": "3+2", "5+3": "5+3", "10+0": "10+0", "15+10": "15+10", "1day": "1 day" };
function admTc(id) { return ADM_TC_LABEL[id] || id || "1 day"; }

function AdminTrnTables({ tournamentId }) {
  const [tab, setTab] = React.useState("standings");
  const [st, setSt] = React.useState(null);
  const [rounds, setRounds] = React.useState(null);
  /* This is a panel INSIDE the director's control room, so it has to fail on
     its own. A rejected promise was already caught; a call that throws before
     it returns one was not, and that took the whole bracket screen down with
     it — advance control, entrants and all — for a table that is nice to have
     open beside them. */
  React.useEffect(() => {
    const load = (fn, ok, no) => {
      try { fn().then(ok).catch(no); } catch (_) { no(); }
    };
    load(() => NGGApi.admin.tournaments.standings(tournamentId), setSt, () => setSt(null));
    load(() => NGGApi.admin.tournaments.rounds(tournamentId), r => setRounds(r.rounds || []), () => setRounds([]));
  }, [tournamentId]);
  if (!st) return null;
  /* These are the members' own components. They are built against the
     community palette, which is scoped away from the admin console — see
     `.cm-tokens` in styles.css. */
  return (
    <div className="cm-tokens trn-admin-wrap" style={{ marginTop: 18 }}>
      <div className="trn-tabs" role="tablist" aria-label="Tournament tables">
        {[["standings", "Standings"], ["rounds", "Pairings"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id}
                  className={"trn-tab" + (tab === id ? " is-on" : "")}
                  onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "standings"
        ? (typeof CmTrnStandings === "function" ? <CmTrnStandings st={st}/> : null)
        : (typeof CmTrnRounds === "function" ? <CmTrnRounds rounds={rounds} onOpenMatch={() => {}}/> : null)}
    </div>
  );
}

/** One tournament: entrants, the advance control, and the bracket. */
function AdminTournamentBracket({ tournamentId, onBack }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [pool, setPool] = React.useState([]);
  const [q, setQ] = React.useState("");

  const load = React.useCallback(() => {
    NGGApi.admin.tournaments.bracket(tournamentId)
      .then(r => { setD(r); setErr(""); })
      .catch(e => setErr(e.code || e.message || "Couldn't load the bracket."));
  }, [tournamentId]);
  React.useEffect(() => { load(); }, [load]);

  // Who can still be added. Only while entries are open.
  React.useEffect(() => {
    if (!d || d.tournament.status !== "open") { setPool([]); return; }
    NGGApi.admin.members.list({ status: "active", type: d.tournament.programme === "summer" ? "Summer" : "NGG", limit: 200 })
      .then(r => setPool(r.members || [])).catch(() => setPool([]));
  }, [d && d.tournament.status, d && d.tournament.programme]);

  const act = async (label, fn) => {
    setBusy(label);
    try { const r = await fn(); return r; }
    catch (e) {
      const map = {
        round_in_progress: "Some games from this round are still being played.",
        no_entrants: "Nobody has been entered yet.",
        already_finished: "This tournament is already over.",
        player_has_no_centre: "That member has no centre, so they would have no bracket.",
        already_entered: "They are already in.",
        wrong_programme: "They are not in this tournament's programme.",
        entries_closed: "Entries closed when round one started.",
      };
      toast.error(map[e.code] || e.code || e.message);
      return null;
    } finally { setBusy(""); load(); }
  };

  if (err) return <div className="admin-section">
    <button className="btn btn-ghost btn-sm" onClick={onBack}>← All tournaments</button>
    <div className="admin-err" role="alert">{err}</div></div>;
  if (!d) return <div className="admin-section"><div className="admin-skel"/></div>;

  const t = d.tournament;
  const centres = d.centres || {};
  const rounds = d.rounds || {};
  const roundKeys = Object.keys(rounds).sort();
  const openGames = Object.keys(rounds).reduce((n, k) =>
    n + rounds[k].filter(m => m.status === "active" || m.status === "invited").length, 0);
  const draws = Object.keys(rounds).reduce((acc, k) =>
    acc.concat(rounds[k].filter(m => m.result === "draw")), []);
  const entered = Object.keys(centres).reduce((acc, c) => acc.concat(centres[c].map(x => x.playerId)), []);
  const shortlist = pool
    .filter(m => entered.indexOf(m.memberId) === -1)
    .filter(m => !q || (m.fullName || "").toLowerCase().indexOf(q.toLowerCase()) !== -1)
    .slice(0, 24);

  return (
    <div className="admin-section">
      <button className="btn btn-ghost btn-sm" onClick={onBack}>← All tournaments</button>
      <div className="admin-section-head" style={{ marginTop: 10 }}>
        <h2 className="admin-h2">{t.name} <span className={"chip " + (TRN_STATUS_CHIP[t.status] || "status-draft")}>{t.status}</span></h2>
      </div>
      <p className="admin-hint">
        <b>{t.formatName || "Centre cup"}</b> · {admTc(t.timeControl)} · {t.rated === false ? "casual" : "rated"}
        {t.totalRounds ? " · " + t.totalRounds + " rounds" : ""}
        {" — "}
        {t.status === "open" && "entries are open. Players can enter themselves from the chess screen; drawing round one closes entries."}
        {t.status === "running" && t.stage === "centre" && "each centre plays its own knockout until one player is left."}
        {t.status === "running" && t.stage === "final" && "the centre champions are playing each other."}
        {t.status === "running" && t.stage === "main" && "round " + t.round + (t.totalRounds ? " of " + t.totalRounds : "") + " is being played."}
        {t.status === "complete" && (t.winnerName ? "won by " + t.winnerName + "." : "finished.")}
        {t.status === "cancelled" && "cancelled. The games are closed but still on the record."}
      </p>

      {/* The one control that moves it forward, with the reason it is refused
          stated up front rather than as an error after a click. */}
      {t.status !== "complete" && t.status !== "cancelled" && (
        <div className="trn-advance">
          <div>
            <b>{t.stage === "centre" ? "Centre stage" : "Final"}{t.round > 0 ? " · round " + t.round : ""}</b>
            <div className="admin-cell-sub">
              {openGames > 0
                ? openGames + " game" + (openGames === 1 ? "" : "s") + " still being played — the next round waits for them."
                : t.round === 0 ? "Ready to start." : "All games finished. Ready for the next round."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!!busy || openGames > 0}
              onClick={() => act("adv", () => NGGApi.admin.tournaments.draw(tournamentId))}>
              {busy === "adv" ? "Working…" : t.round === 0 ? "Draw round one" : "Draw round " + (t.round + 1)}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => {
              if (!(await dialog.confirm({ title: "Cancel " + t.name + "?",
                body: "Open games are closed. Nothing is deleted — the games stay on the record.",
                cta: "Cancel it", danger: true }))) return;
              act("cancel", () => NGGApi.admin.tournaments.cancel(tournamentId));
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* A drawn knockout game eliminates nobody, so it blocks the round until
          somebody decides. Surfaced here rather than left for staff to find. */}
      {draws.length > 0 && (
        <div className="trn-draws">
          <b>{draws.length} drawn game{draws.length === 1 ? "" : "s"} to replay</b>
          <p className="admin-cell-sub" style={{ margin: "2px 0 8px" }}>
            A draw knocks nobody out. Replaying swaps the colours.
          </p>
          {draws.map(m => (
            <div key={m.matchId} className="trn-draw-row">
              <span>{m.a.name} vs {m.b.name} <span className="admin-cell-sub">· {m.centre}</span></span>
              <button className="btn btn-primary btn-sm" disabled={!!busy}
                onClick={() => act("rp" + m.matchId, () => NGGApi.admin.tournaments.replay(tournamentId, m.matchId))}>
                Replay
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Standings and pairings, from the same components the members' screen
          renders — a director and a player never look at two different
          versions of one table. */}
      <AdminTrnTables tournamentId={tournamentId}/>

      {/* Entrants, grouped by the bracket they actually play in. */}
      <h3 className="admin-h3" style={{ marginTop: 20 }}>Entrants</h3>
      {Object.keys(centres).length === 0 && <div className="admin-empty">Nobody entered yet.</div>}
      <div className="trn-centres">
        {Object.keys(centres).sort().map(c => (
          <div key={c} className="trn-centre">
            <div className="trn-centre-h">{c || "No centre"} <span className="admin-cell-sub">
              {centres[c].filter(x => x.status === "active").length} of {centres[c].length} still in</span></div>
            {centres[c].map(p => (
              <div key={p.playerId} className={"trn-player" + (p.status === "eliminated" ? " is-out" : "")}>
                <span>{p.name}</span>
                {p.centreChampion && <span className="chip chip-gold">champion</span>}
                {p.status === "eliminated" && <span className="admin-cell-sub">out{p.eliminatedRound ? " · round " + p.eliminatedRound : ""}</span>}
                {t.status === "open" && (
                  <button className="trn-x" aria-label={"Withdraw " + p.name} disabled={!!busy}
                    onClick={() => act("w" + p.playerId, () => NGGApi.admin.tournaments.withdraw(tournamentId, p.playerId))}>✕</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {t.status === "open" && (
        <div className="admin-card" style={{ marginTop: 14 }}>
          <div className="admin-field-label">Add players</div>
          <input className="admin-in" value={q} placeholder="Search by name" onChange={e => setQ(e.target.value)} aria-label="Search members"/>
          <div className="trn-pool">
            {shortlist.map(m => (
              <button key={m.memberId} className="trn-pool-item" disabled={!!busy}
                onClick={() => act("e" + m.memberId, () => NGGApi.admin.tournaments.enter(tournamentId, m.memberId))}>
                <b>{m.fullName}</b>
                <span className="admin-cell-sub">{m.centre || "no centre"}</span>
              </button>
            ))}
            {shortlist.length === 0 && <p className="admin-cell-sub">Nobody left to add.</p>}
          </div>
        </div>
      )}

      {/* The bracket itself, round by round. */}
      {roundKeys.length > 0 && <>
        <h3 className="admin-h3" style={{ marginTop: 22 }}>Games</h3>
        {roundKeys.map(k => (
          <div key={k} className="trn-round">
            <div className="trn-round-h mono">{k.replace("centre-", "CENTRE ROUND ").replace("final-", "FINAL ROUND ")}</div>
            {rounds[k].map(m => (
              <div key={m.matchId} className="trn-game">
                <span className={"trn-side" + (m.winnerId === m.a.id ? " is-win" : m.winnerId ? " is-lose" : "")}>{m.a.name}</span>
                <span className="trn-v">v</span>
                <span className={"trn-side" + (m.winnerId === m.b.id ? " is-win" : m.winnerId ? " is-lose" : "")}>{m.b.name}</span>
                <span className="admin-cell-sub trn-game-meta">
                  {m.centre}
                  {m.status === "complete"
                    ? " · " + (m.result === "draw" ? "drawn" : "won") + (m.reason ? " (" + String(m.reason).replace(/_/g, " ") + ")" : "")
                    : " · in play, move " + Math.max(1, Math.ceil(m.ply / 2))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </>}
    </div>
  );
}

function AdminCommunity() {
  const auth = typeof useAuth === "function" ? useAuth() : {};
  /* Safeguarding cases are for trained leads (the `safeguarding` capability),
     not everyone who edits the feed; the server refuses the rest. */
  const canSg = typeof auth.hasCap === "function" && auth.hasCap("safeguarding");
  const [tab, setTab] = React.useState("moderation");
  const [pending, setPending] = React.useState(null);
  const [mode, setMode] = React.useState("");
  const [safeguarding, setSafeguarding] = React.useState(0);
  const loadPending = () => NGGApi.admin.community.overview().then(r => { setPending(r.pending); setMode(r.moderation || "strict"); setSafeguarding(r.safeguarding || 0); }).catch(() => {});
  React.useEffect(() => { loadPending(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        {/* Two badges, never one number. "Four things to review" and "a child
            said something about hurting themselves" are different queues and
            must not be summed into a single figure somebody can clear by
            clicking Approve four times. */}
        <h2 className="admin-h2">Community {pending && (pending.posts + pending.comments + (pending.reported || 0)) > 0 ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle" }}>{pending.posts + pending.comments + (pending.reported || 0)} to review</span> : null}{safeguarding > 0 ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle", marginLeft: 6 }}>🛟 {safeguarding} safeguarding</span> : null}</h2>
      </div>
      <p className="admin-hint">The members' social feed. {mode === "off" ? "Automatic screening is OFF — nothing is checked before it appears." : mode === "flag" ? "Posts publish immediately; anything borderline lands in the queue below." : "Posts & comments are screened on submit; video and anything borderline waits here for your approval."} Channels mirror the summer courses — add or archive them below.</p>
      <div className="admin-filters">
        <button className={"btn btn-sm " + (tab === "moderation" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("moderation")}>Moderation</button>
        <button className={"btn btn-sm " + (tab === "channels" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("channels")}>Channels</button>
        {canSg && <button className={"btn btn-sm " + (tab === "safeguarding" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("safeguarding")}>
          Safeguarding{safeguarding > 0 ? " · " + safeguarding : ""}
        </button>}
      </div>
      {!canSg && safeguarding > 0 && <p className="admin-hint">{safeguarding} safeguarding {safeguarding === 1 ? "case is" : "cases are"} open. Only trained safeguarding leads can open them; a super admin can grant that.</p>}
      {tab === "moderation" && <AdminCommunityModeration mode={mode} onChanged={setMode}/>}
      {tab === "moderation" ? <AdminCommunityQueue onChange={loadPending}/>
        : tab === "safeguarding" ? <AdminCommunitySafeguarding onChange={loadPending}/>
        : <AdminCommunityChannels/>}
    </div>
  );
}

/* Open safeguarding cases.
   A child wrote something the crisis gate caught. The post was refused and
   they were shown a helpline — this is the record of it, which used not to
   exist at all. Its own screen on purpose: moderation is about whether a
   message belongs in the feed, and running these past somebody in the same
   list as "approve, approve, approve" is how a disclosure gets clicked past. */
function AdminCommunitySafeguarding({ onChange }) {
  const [status, setStatus] = React.useState("open");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const load = () => NGGApi.admin.community.safeguarding(status).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  const ack = async (caseId) => {
    setBusy(caseId);
    try { await NGGApi.admin.community.safeguardingAck(caseId); load(); onChange && onChange(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };
  return (
    <div>
      <p className="admin-hint">
        Caught by the crisis screen before anything was posted. The child saw the helpline reply
        and their message was <b>not</b> published. Acknowledging records who read it and when —
        it does not contact anybody, so make the call first.
      </p>
      <div className="admin-filters">
        <label className="sr-only" htmlFor="admin-sg-status">Show cases</label>
        <select id="admin-sg-status" className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="all">All</option>
        </select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        d === null ? <div className="dash-spinner"/> :
        d.cases.length === 0 ? <div className="admin-empty">{status === "open" ? "No open safeguarding cases." : "Nothing here."}</div> :
        <div className="admin-app-list">
          {d.cases.map(c => (
            <div className={"admin-app" + (c.status === "open" ? " admin-app-urgent" : "")} key={c.caseId}>
              <div className="admin-app-top">
                <div>
                  <div className="admin-cell-name">{c.author} {c.status === "open" && <span className="chip chip-crimson">needs a person</span>}</div>
                  <div className="mono admin-cell-sub">{fmtDate(c.createdAt)} · in a {c.surface}{c.channel ? " · #" + c.channel : ""} · {c.caseId}</div>
                </div>
                <span className={"chip status-" + (c.status === "open" ? "draft" : "published")}>{c.status}</span>
              </div>
              <blockquote className="admin-sg-body">{c.body}</blockquote>
              <div className="admin-app-actions">
                {c.status === "open"
                  ? <button className="btn btn-primary btn-sm" disabled={busy === c.caseId} onClick={() => ack(c.caseId)}>{busy === c.caseId ? "Saving…" : "I've spoken to them"}</button>
                  : <span className="mono admin-cell-sub">Acknowledged {fmtDate(c.acknowledgedAt)}</span>}
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

/* What the people who reported this actually said.
   community_reports has been collecting that sentence since schema v49 and no
   screen ever read it — the whole table was write-only apart from its own
   duplicate check. A count tells a moderator something is wrong; only the
   reason tells them what, and whether it needs a safeguarding response rather
   than a moderation one. */
function AdminCommunityReports({ reports }) {
  if (!reports || !reports.length) return null;
  return (
    <div className="admin-reports">
      <div className="mono admin-reports-h">🚩 {reports.length} report{reports.length === 1 ? "" : "s"}</div>
      <ul className="admin-reports-list">
        {reports.map((r, i) => (
          <li key={i}>
            <span className="admin-reports-by">{r.by}</span>
            <span className="admin-reports-why">{r.reason || <em>no reason given</em>}</span>
            <span className="mono admin-reports-at">{fmtDate(r.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminCommunityQueue({ onChange }) {
  const [status, setStatus] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.community.queue(status).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  const act = async (kind, id, a) => { try { await NGGApi.admin.community.moderate(kind, id, a); load(); onChange && onChange(); } catch (e) { toast.error(e.code || e.message); } };
  return (
    <div>
      <div className="admin-filters">
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pending review</option><option value="reported">Reported</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="removed">Removed</option><option value="all">All (live)</option>
        </select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        d === null ? <div className="dash-spinner"/> :
        (d.posts.length === 0 && d.comments.length === 0) ? <div className="admin-empty">Nothing to review.</div> :
        <div>
          {d.posts.length > 0 && <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "var(--ink-500)", margin: "6px 0 10px" }}>POSTS</div>}
          <div className="admin-app-list">
            {d.posts.map(p => (
              <div className="admin-app" key={p.postId}>
                <div className="admin-app-top">
                  <div><div className="admin-cell-name">{p.author} <span className="chip" style={{ background: p.color, color: inkOn(p.color).ink }}>{p.channel}</span> {p.pinned && <span className="chip chip-lime">📌 pinned</span>} {p.featured && <span className="chip chip-lime">✨ showcase</span>} {p.reportCount > 0 && <span className="chip chip-crimson">🚩 {p.reportCount}</span>}</div>
                    <div className="mono admin-cell-sub">{fmtDate(p.createdAt)}{p.centre ? " · " + p.centre : ""}{p.mediaType !== "none" ? " · " + p.mediaType : ""}</div></div>
                  <span className={"chip status-" + (p.status === "published" ? "published" : p.status === "removed" ? "archived" : "draft")}>{p.status}</span>
                </div>
                {p.body && <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>}
                {p.mediaType === "image" && p.mediaUrl && <img src={p.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 10, marginBottom: 8 }}/>}
                {p.mediaType === "video" && p.mediaUrl && <video src={p.mediaUrl} poster={p.mediaPoster} controls style={{ maxWidth: 260, borderRadius: 10, marginBottom: 8 }}/>}
                {p.moderation && p.moderation.reason && <div className="mono admin-cell-sub" style={{ marginBottom: 8 }}>AI: {p.moderation.verdict} · {p.moderation.reason}</div>}
                <AdminCommunityReports reports={p.reports}/>
                <div className="admin-app-actions">
                  {p.status !== "published" && <button className="btn btn-primary btn-sm" onClick={() => act("post", p.postId, "approve")}>Approve</button>}
                  {p.status !== "hidden" && <button className="btn btn-ghost btn-sm" onClick={() => act("post", p.postId, "hide")}>Hide</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => act("post", p.postId, p.pinned ? "unpin" : "pin")}>{p.pinned ? "Unpin" : "Pin"}</button>
                  {p.status === "published" && <button className="btn btn-ghost btn-sm" onClick={() => act("post", p.postId, p.featured ? "unfeature" : "feature")}>{p.featured ? "Unfeature" : "✨ Feature"}</button>}
                  <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={() => act("post", p.postId, "remove")}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          {d.comments.length > 0 && <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "var(--ink-500)", margin: "18px 0 10px" }}>COMMENTS</div>}
          <div className="admin-app-list">
            {d.comments.map(c => (
              <div className="admin-app" key={c.commentId}>
                <div className="admin-app-top">
                  {/* A reported comment could not appear here at all until the
                      queue stopped filtering them by a status the moderation
                      map never writes. Comments are where bullying lives. */}
                  <div className="admin-cell-name">{c.name} {c.reportCount > 0 && <span className="chip chip-crimson">🚩 {c.reportCount}</span>}</div>
                  <span className={"chip status-" + (c.status === "published" ? "published" : c.status === "removed" ? "archived" : "draft")}>{c.status}</span>
                </div>
                <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
                <AdminCommunityReports reports={c.reports}/>
                <div className="admin-app-actions">
                  {c.status !== "published" && <button className="btn btn-primary btn-sm" onClick={() => act("comment", c.commentId, "approve")}>Approve</button>}
                  {c.status !== "hidden" && <button className="btn btn-ghost btn-sm" onClick={() => act("comment", c.commentId, "hide")}>Hide</button>}
                  <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={() => act("comment", c.commentId, "remove")}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>}
    </div>
  );
}

function AdminCommunityChannels() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const blank = { channelId: "", name: "", icon: "", color: "#3b5bdb", kind: "topic", faculty: "", description: "", rules: "", pinned: false, status: "active", sortOrder: 0 };
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.community.overview().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const edit = (c) => setF({ channelId: c.channelId, name: c.name, icon: c.icon, color: c.color, kind: c.kind, faculty: c.faculty || "", description: c.description || "", rules: c.rules || "", pinned: !!c.pinned, status: c.status, sortOrder: c.sortOrder || 0 });
  const save = async () => {
    if (f.name.trim().length < 2) { toast.error("Give the channel a name."); return; }
    setBusy(true);
    try { await NGGApi.admin.community.channelUpsert(f); toast.success("Channel saved."); setF(blank); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600,#47506e)", marginBottom: 3 };
  return (
    <div>
      <div style={{ background: "rgba(12,20,50,0.03)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div className="mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 10 }}>{f.channelId ? "EDIT CHANNEL" : "ADD A CHANNEL"}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}><span style={lbl}>Name</span><input className="admin-input" style={{ width: "100%" }} value={f.name} maxLength={120} onChange={e => set("name", e.target.value)}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Icon</span><input className="admin-input" value={f.icon} maxLength={4} onChange={e => set("icon", e.target.value)} style={{ width: 64 }} placeholder="💻"/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Colour</span><input type="color" value={f.color} onChange={e => set("color", e.target.value)} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Kind</span><select className="admin-select" value={f.kind} onChange={e => set("kind", e.target.value)}><option value="course">Course</option><option value="topic">Topic</option><option value="centre">Centre</option><option value="commons">Commons</option></select></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Serves</span><select className="admin-select" value={f.programme} onChange={e => set("programme", e.target.value)} aria-label="Which programme they serve"><option value="ngg">NGG Club, year-round</option><option value="summer">Summer School</option><option value="both">Both</option></select></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Status</span><select className="admin-select" value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="archived">Archived</option></select></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={f.pinned} onChange={e => set("pinned", e.target.checked)}/> Pinned</label>
        </div>
        <div style={{ marginTop: 10 }}><span style={lbl}>Description</span><input className="admin-input" style={{ width: "100%" }} value={f.description} maxLength={400} onChange={e => set("description", e.target.value)}/></div>
        <div style={{ marginTop: 10 }}><span style={lbl}>Channel rules <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>— shown to members in this channel. One rule per line.</span></span><textarea className="admin-input" style={{ width: "100%", minHeight: 84, resize: "vertical" }} value={f.rules} maxLength={1200} onChange={e => set("rules", e.target.value)} placeholder={"Be kind and specific with feedback.\nShip something every week.\nNo personal contact details."}/></div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : (f.channelId ? "Save channel" : "Add channel")}</button>
          {f.channelId && <button className="btn btn-ghost btn-sm" onClick={() => setF(blank)}>Cancel edit</button>}
        </div>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        d === null ? <div className="dash-spinner"/> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Channel</th><th>Kind</th><th>Posts</th><th>Status</th><th></th></tr></thead>
          <tbody>{d.channels.map(c => (
            <tr key={c.channelId}>
              <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", background: c.color, color: inkOn(c.color).ink, fontSize: 12 }}>{c.icon || "#"}</span><b>{c.name}</b>{c.pinned && <span className="chip chip-lime">pinned</span>}</span></td>
              <td className="mono admin-cell-sub">{c.kind}</td>
              <td>{c.total || 0}</td>
              <td>{c.status === "active" ? <span className="chip chip-lime">active</span> : <span className="chip status-archived">archived</span>}</td>
              <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => edit(c)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

function AdminComments() {
  const [status, setStatus] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.comments(status).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  const act = async (commentId, a) => { try { await NGGApi.admin.commentModerate(commentId, a); load(); } catch (e) { toast.error(e.code || e.message); } };
  const rows = d ? d.comments : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Comment moderation {d && d.pending ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle" }}>{d.pending} pending</span> : null}</h2>
      </div>
      <p className="admin-hint">Member comments on posts stay hidden until you approve them. Nothing is public until it's cleared here.</p>
      <div className="admin-filters">
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        rows === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">Nothing here.</div> :
        <div className="admin-app-list">
          {rows.map(c => (
            <div className="admin-app" key={c.commentId}>
              <div className="admin-app-top">
                <div><div className="admin-cell-name">{c.memberName} <span className="chip chip-navy">{c.postTitle || c.postSlug || c.postId}</span></div>
                  <div className="mono admin-cell-sub">{fmtDate(c.createdAt)}</div></div>
                <span className={"chip status-" + (c.status === "approved" ? "published" : c.status === "rejected" ? "archived" : "draft")}>{c.status}</span>
              </div>
              <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
              <div className="admin-app-actions">
                {c.status !== "approved" && <button className="btn btn-ghost btn-sm" onClick={() => act(c.commentId, "approve")}>Approve</button>}
                {c.status !== "rejected" && <button className="btn btn-ghost btn-sm" onClick={() => act(c.commentId, "reject")}>Reject</button>}
                <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={async () => { if (await dialog.confirm({ title: "Delete this comment?", body: "Permanently removes the comment. This can't be undone.", cta: "Delete", danger: true })) act(c.commentId, "delete"); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

// ============================================================================
// Behaviour monitor — log observations, AI/rule triage, wellbeing flags
// ============================================================================

/* ── Staff activity ──────────────────────────────────────────────────────────
   What the programme knows about the adults, not the children.

   Deliberately activity, not judgement: counts of what each person filed over
   a window, next to how many children they are responsible for. No score and
   no ranking — a coordinator reading this should be able to see who has gone
   quiet and go and ask them why, which is the only use of it that helps
   anybody. Quietest first, because sorting by the busiest buries exactly the
   people the screen exists to find. */
/* ── Diagnostics ─────────────────────────────────────────────────────────────
   Everything here already existed and none of it was visible. Handler
   exceptions went to api/logs/php-error.log — correct, and unreadable by
   anyone actually running the programme — so the first report of a broken
   endpoint came from a centre phoning to say the desk was down. The web-cron
   runs in a shutdown hook that swallows throwables so a background job can
   never break a page, which also meant that when reminders and integration
   deliveries stopped, they stopped in silence. */
function AdminOps() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.ops.status().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  const clear = async (id) => {
    setBusy(true);
    try { const r = await NGGApi.admin.ops.clear(id); toast.success(r.cleared + " marked as dealt with", "Acknowledged"); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  // Background jobs are normally driven by ordinary traffic; on a quiet host
  // this runs one (or all) on demand rather than waiting for the next visitor.
  const runCron = async (job) => {
    setBusy(true);
    try {
      const r = await NGGApi.admin.ops.run(job);
      const ran = r.ran || {};
      const busyJobs = Object.keys(ran).filter(k => ran[k] === "busy");
      const failed = Object.keys(ran).filter(k => ran[k] === "error");
      if (failed.length) toast.error("Failed: " + failed.join(", "));
      else if (busyJobs.length) toast.info("Already running — try again in a moment.");
      else toast.success((job === "all" ? "All jobs" : job) + " ran.", "Done");
      load();
    }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const h = (d && d.health) || {};
  const c = h.checks || {};
  const ago = (s) => s === null || s === undefined ? "never" : s < 90 ? s + "s ago" : s < 5400 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago";
  const light = (ok, label, detail) => (
    <div className="admin-tile" style={{ cursor: "default" }}>
      {/* Never colour alone: a red dot and a green dot are the same dot to
          about one man in twelve, and this is the screen you read in a hurry. */}
      <div className="admin-tile-n" style={{ fontSize: "var(--rs-fsize-1, 22px)", color: ok ? "var(--lime-ink)" : "var(--coral, #c0341a)" }}>{ok ? "✓" : "✕"}</div>
      <div className="admin-tile-l">{label}</div>
      <div className="mono admin-cell-sub">{ok ? "ok" : detail || "failing"}</div>
    </div>
  );

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Diagnostics</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
          {d && d.events && d.events.length > 0 &&
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => clear(0)}>Mark all dealt with</button>}
        </div>
      </div>
      <p className="admin-hint">
        Faults are grouped, so one broken endpoint is one row with a count rather than ten thousand rows.
        Acknowledging a fault does not silence it — if it happens again it comes straight back.
        For an uptime monitor, watch <code>/api/public/health.php</code>: it answers 503 when the site cannot serve.
      </p>
      {err && <p role="alert" className="admin-error">{err}</p>}
      {!d && !err && <p className="admin-hint">Loading…</p>}

      {d && <>
        <div className="admin-tiles" style={{ marginBottom: 18 }}>
          {light(!!(c.db && c.db.ok), "Database", "read-only — the disk may be full")}
          {light(!!(c.schema && c.schema.ok), "Schema", c.schema ? "at " + c.schema.at + ", code wants " + d.schemaTarget : "unreadable")}
          {light(!!(c.cron && c.cron.ok), "Background jobs", c.cron && c.cron.stale ? "stalled: " + c.cron.stale.join(", ") : "")}
          {light((d.errors24h || 0) === 0, "Errors (24h)", d.errors24h + " in the last day")}
        </div>

        {/* Photo storage. On a deployment without Cloudinary every headshot is
            written to disk, and "the web user cannot write to a directory you
            uploaded" is the commonest way a PHP deploy is broken. The symptom is
            a blank frame on the review desk, which looks exactly like a family
            sending no photo — so it gets reported as "photos don't display" with
            nothing to go on. This is the answer, in one place, in words. */}
        {c.photos && (
          <div style={{ marginBottom: 18 }}>
            <h3 className="admin-h3">Photo storage</h3>
            <div className="admin-tiles">
              {light(!!c.photos.ok, "Saving photos",
                c.photos.where === "unwritable" ? "the image directory is NOT writable — no photo can be saved"
                : c.photos.where === "cache_fallback" ? "writing to the cache directory as a fallback — fix permissions on api/storage"
                : c.photos.error ? c.photos.stage + ": " + c.photos.error
                : "")}
              {c.photosOnRecord && light(!!c.photosOnRecord.ok, "Recent sign-ups",
                c.photosOnRecord.missing + " of the last " + c.photosOnRecord.checked + " arrived with no photo")}
              {/* A URL on a record whose file is gone. Renders as an empty frame
                  and a 404 in the console, and until this light existed the two
                  could not be connected by anyone looking at the product. */}
              {c.photoLinks && light(!!c.photoLinks.ok, "Images on record",
                c.photoLinks.missing + " of " + c.photoLinks.checked + " point at a file that is no longer on disk")}
            </div>
            <p className="admin-cell-sub" style={{ marginTop: 6 }}>
              {c.photos.dir ? <>Directory <code>{c.photos.dir}</code> · </> : null}
              {c.photos.files} image{c.photos.files === 1 ? "" : "s"} held
              {c.photos.bytes ? " · " + (c.photos.bytes / 1048576).toFixed(1) + " MB" : ""}
              {c.photos.where === "storage" ? " · checked by writing and reading back a test image just now" : ""}
            </p>
            {/* Named where it can be acted on: which table lost them says which
                screen to go and fix, and the count says how big the job is. */}
            {c.photoLinks && !c.photoLinks.ok && (
              <p className="admin-hint" style={{ marginTop: 4 }}>
                {c.photoLinks.missing} image{c.photoLinks.missing === 1 ? "" : "s"} referenced by a record
                {" "}{c.photoLinks.missing === 1 ? "is" : "are"} no longer on disk
                {Object.keys(c.photoLinks.where || {}).length
                  ? " — " + Object.keys(c.photoLinks.where).map(k => c.photoLinks.where[k] + " in " + k).join(", ")
                  : ""}.
                {" "}The bytes cannot be recovered: send those members a retake link
                (Admin {"→"} Registrations {"→"} the child {"→"} Photo). Cards and rosters print
                without a headshot in the meantime.
              </p>
            )}
            {!c.photos.ok && (
              <p className="admin-hint" style={{ marginTop: 4 }}>
                Make <code>api/storage</code> writable by the web user (<code>chmod 775</code>, or 755 if PHP runs as
                the owner) and press Refresh. Photos already accepted are not lost by fixing this — but any
                submission that arrived while it was broken has no image, and those families need a retake link.
              </p>
            )}
          </div>
        )}

        {/* The media cloud. Nothing checked this, and the client is built to
            survive it being gone — uploadOrInline() stores the image locally
            whenever Cloudinary cannot be used. That is right, and it meant a
            disconnected cloud looked identical to a working one everywhere in
            the product. This says which of the four states it is in, because
            they have four different fixes. */}
        {c.cloudinary && (
          <div style={{ marginBottom: 18 }}>
            <h3 className="admin-h3">Media cloud</h3>
            <div className="admin-tiles">
              {light(!!c.cloudinary.ok, "Cloudinary", c.cloudinary.detail || "")}
              {c.photoStorage && light(!!c.photoStorage.ok, "Where photos landed",
                c.photoStorage.note || (c.photoStorage.local + " of the last " + c.photoStorage.checked + " kept locally"))}
            </div>
            {c.cloudinary.state === "bad_credentials" && (
              <p className="admin-hint" style={{ marginTop: 6 }}>
                Cloudinary is refusing these keys. Check <code>cloudinary</code> in <code>api/config.php</code> against
                the Cloud name, API key and API secret on the Cloudinary dashboard — a rotated secret is the usual
                cause. Uploads are still being accepted and stored on this server in the meantime, so nothing has been
                lost; they simply are not in the cloud.
              </p>
            )}
            {c.cloudinary.state === "exhausted" && (
              <p className="admin-hint" style={{ marginTop: 6 }}>
                The plan is rate-limited or out of credit. Uploads are landing on this server until it resets.
              </p>
            )}
            {c.cloudinary.state === "unreachable" && (
              <p className="admin-hint" style={{ marginTop: 6 }}>
                This host could not reach Cloudinary at all — usually outbound HTTPS being blocked rather than
                anything wrong with the account.
              </p>
            )}
            {c.cloudinary.state === "not_configured" && (
              <p className="admin-cell-sub" style={{ marginTop: 6 }}>
                Running without a media cloud is supported: every photograph is kept on this server instead.
              </p>
            )}
          </div>
        )}

        <div className="admin-section-head" style={{ marginTop: 4 }}>
          <h3 className="admin-h3">Background jobs</h3>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runCron("all")}>Run all now</button>
        </div>
        <div className="admin-chips" style={{ marginBottom: 8 }}>
          {Object.keys(h.cron || {}).map(job => {
            const j = h.cron[job];
            const stale = j.ageSeconds !== null && j.ageSeconds > j.interval * 10;
            return <span key={job} className="chip-run" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6 }}>
              <span className={"chip " + (j.ageSeconds === null ? "chip-navy" : stale ? "chip-crimson" : "chip-lime")}>{job}: {ago(j.ageSeconds)}</span>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runCron(job)} title={"Run " + job + " now"}>Run now</button>
            </span>;
          })}
        </div>
        <p className="admin-cell-sub" style={{ marginBottom: 18 }}>Driven by ordinary traffic — a quiet site runs them less often, which is not a fault. Use <b>Run now</b> to kick one by hand instead of waiting for the next visitor.</p>

        <h3 className="admin-h3">Open faults{d.clearedCount ? <span className="admin-count">{d.clearedCount} dealt with</span> : null}</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Where</th><th>What</th><th>Seen</th><th>Last</th><th></th></tr></thead>
            <tbody>
              {!d.events.length && <tr><td colSpan={5} className="admin-empty">Nothing has failed. That is the expected state — this table being empty is the good news.</td></tr>}
              {d.events.map(e => (
                <tr key={e.id}>
                  <td>
                    <div className="admin-cell-name">{e.source}</div>
                    <div className="mono admin-cell-sub">{e.kind}{e.detail ? " · " + e.detail : ""}</div>
                  </td>
                  <td>{e.message || "—"}</td>
                  <td><span className={"chip " + (e.hits > 20 ? "chip-crimson" : e.hits > 1 ? "chip-gold" : "chip-navy")}>{e.hits}×</span></td>
                  <td className="mono">{(e.lastAt || "").replace("T", " ").slice(0, 16)}
                    <div className="mono admin-cell-sub">first {(e.firstAt || "").slice(0, 10)}</div></td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => clear(e.id)}>Dealt with</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.build && <p className="admin-hint" style={{ marginTop: 12 }}>Server build <code>{d.build}</code> · schema {h.schema} of {d.schemaTarget}</p>}
      </>}
    </div>
  );
}

function AdminStaff() {
  const [d, setD] = React.useState(null);
  const [days, setDays] = React.useState(30);
  const [err, setErr] = React.useState("");
  const [skills, setSkills] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState("activity");
  React.useEffect(() => {
    NGGApi.admin.staff.performance(days).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  }, [days]);
  React.useEffect(() => {
    if (tab === "skills" && skills === null) NGGApi.admin.staff.skills().then(r => setSkills(r.skills || {})).catch(e => toast.error(e.code || e.message));
  }, [tab]);

  const saveSkills = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.staff.saveSkills(skills); setSkills(r.skills || {}); setDirty(false); toast.success("Instructors mark against these from now on", "Skills saved"); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  const rows = (d && d.staff) || [];
  const t = (d && d.totals) || {};
  const centres = (d && d.centres) || {};
  /* A count with no denominator says nothing. 12 stars is diligent for a
     mentor with 8 children and thin for one with 40, so coverage is the
     column that carries the meaning. */
  const covChip = (c) => c === null ? "chip-navy" : c >= 70 ? "chip-lime" : c >= 30 ? "chip-gold" : "chip-crimson";

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Staff activity</h2>
        <div className="admin-section-actions">
          <FieldSelect label="" value={String(days)} onChange={v => setDays(parseInt(v, 10) || 30)}
            options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]}/>
        </div>
      </div>
      <div className="admin-tabs">
        <button className={"admin-tab" + (tab === "activity" ? " is-active" : "")} onClick={() => setTab("activity")}>Who is filing{t.silent ? " · " + t.silent + " silent" : ""}</button>
        <button className={"admin-tab" + (tab === "skills" ? " is-active" : "")} onClick={() => setTab("skills")}>Course skills</button>
      </div>

      {tab === "activity" && <>
        <p className="admin-hint">
          Mentors and instructors together, quietest first. These are counts of work filed, not a rating — the point is to notice who has stopped, not to rank anyone.
          {d && d.scope === "lead" && " You're seeing your own centre."}
        </p>
        {err && <p role="alert" className="admin-error">{err}</p>}
        {!d && !err && <p className="admin-hint">Loading…</p>}
        {d && (
          <div className="admin-chips" style={{ marginBottom: 12 }}>
            <span className="chip chip-navy">{t.staff} staff</span>
            {t.silent > 0 && <span className="chip chip-crimson">{t.silent} never filed anything</span>}
            <span className="chip chip-navy">{t.stars} stars</span>
            <span className="chip chip-navy">{t.remarks} notes</span>
            {t.flags > 0 && <span className="chip chip-gold">{t.flags} safeguarding</span>}
            <span className="chip chip-navy">{t.sessions} sessions</span>
            <span className="chip chip-navy">{t.skillMarks} skill marks</span>
          </div>
        )}
        {d && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Person</th><th>Centre</th><th>Last active</th><th>Coverage</th><th>Stars</th><th>Notes</th><th>Sessions</th><th>Skills</th></tr></thead>
              <tbody>
                {!rows.length && <tr><td colSpan={8} className="admin-empty">No mentors or instructors on record yet.</td></tr>}
                {rows.map(s => (
                  <tr key={s.staffId + s.kind}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <CentreRing centre={s.centre} centres={centres} name={s.fullName} size={34}/>
                        <span style={{ minWidth: 0 }}>
                          <span className="admin-cell-name">{s.fullName}</span>
                          {s.kind === "lead mentor" && <RankChip rank="lead"/>}
                          <div className="mono admin-cell-sub">{s.kind}{s.focus ? " · " + s.focus : ""}</div>
                        </span>
                      </div>
                    </td>
                    <td className="mono">{s.centre || "—"}</td>
                    <td>
                      {/* Never-filed is a different thing from "quiet for a
                          while", and the two must not read the same. */}
                      {s.lastActive
                        ? <>{s.quietDays === 0 ? "today" : s.quietDays + "d ago"}<div className="mono admin-cell-sub">{s.lastActive}</div></>
                        : <span className="chip chip-crimson">never</span>}
                    </td>
                    <td>
                      {s.coverage === null
                        ? <span className="admin-cell-sub">no class set</span>
                        : <><span className={"chip " + covChip(s.coverage)}>{s.coverage}%</span>
                            <div className="mono admin-cell-sub">{s.childrenStarred} of {s.classSize}</div></>}
                    </td>
                    <td>{s.stars || "—"}</td>
                    <td>{s.remarks || "—"}{s.flags > 0 && <div className="mono admin-cell-sub">{s.flags} flagged</div>}</td>
                    <td>{s.sessions || "—"}</td>
                    <td>{s.skillMarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {tab === "skills" && <>
        <p className="admin-hint">What instructors mark each child against, per course. Four levels — not yet · getting there · can do it · can teach it — and no numbers, because a score invites a ranking between children and this is meant to say what one child can now do. Seeded from the catalogue; correct them to whatever the people teaching the course actually mean.</p>
        {skills === null && <p className="admin-hint">Loading…</p>}
        {skills && Object.keys(skills).map(course => (
          <div key={course} className="admin-field" style={{ marginBottom: 14 }}>
            <span className="admin-label">{course}</span>
            <textarea className="admin-input" rows={Math.max(3, (skills[course] || []).length + 1)}
              value={(skills[course] || []).join("\n")}
              placeholder="One skill per line — verb-led and observable, e.g. “Plays hands together”."
              onChange={e => { setSkills(s => ({ ...s, [course]: e.target.value.split("\n") })); setDirty(true); }}/>
            <span className="admin-cell-sub">{(skills[course] || []).filter(x => x.trim()).length} skills</span>
          </div>
        ))}
        {skills && <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={saveSkills}>{busy ? "Saving…" : "Save skills"}</button>}
      </>}
    </div>
  );
}

function AdminBehaviour() {
  const [d, setD] = React.useState(null);
  const [f, setF] = React.useState({ status: "", category: "" });
  const [err, setErr] = React.useState("");
  const [form, setForm] = React.useState({ subjectId: "", note: "", category: "", severity: "" });
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.behaviour.list(f).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [f.status, f.category]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await NGGApi.admin.behaviour.log(form.subjectId.trim(), form.note.trim(), form.category, form.severity);
      toast.success("Logged as " + r.category + " · " + r.severity + (r.aiSource === "manual" ? "" : " (" + r.aiSource + ")"), "Observation saved");
      setForm({ subjectId: "", note: "", category: "", severity: "" }); load();
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const review = async (logId) => { try { await NGGApi.admin.behaviour.review(logId); load(); } catch (e) { toast.error(e.code || e.message); } };
  const sevChip = (s) => s === "urgent" ? "chip-crimson" : s === "concern" ? "chip-gold" : s === "positive" ? "chip-lime" : "chip-navy";
  const logs = d ? d.logs : null;
  const cats = (d && d.categories) || ["wellbeing", "commendation", "respect", "discipline", "peer", "participation"];
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Behaviour monitor {d && d.openFlags ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle" }}>{d.openFlags} open flag{d.openFlags === 1 ? "" : "s"}</span> : null}</h2>
      </div>
      <p className="admin-hint">Log an observation about a student or member; it's auto-triaged (AI when configured, rules otherwise). Wellbeing/urgent notes page the team through configured integrations.</p>
      <form onSubmit={submit} className="admin-fields" style={{ maxWidth: 640, marginBottom: 18 }}>
        <div className="admin-fields-row">
          <Field label="Subject ID (student or member)" value={form.subjectId} onChange={v => setForm(o => ({ ...o, subjectId: v }))}/>
          <FieldSelect label="Category (blank = auto)" value={form.category} onChange={v => setForm(o => ({ ...o, category: v }))} options={[""].concat(cats)}/>
          <FieldSelect label="Severity (blank = auto)" value={form.severity} onChange={v => setForm(o => ({ ...o, severity: v }))} options={["", "info", "concern", "urgent", "positive"]}/>
        </div>
        <label className="admin-field"><span className="admin-label">Observation</span>
          <textarea className="admin-input" rows={3} value={form.note} onChange={e => setForm(o => ({ ...o, note: e.target.value }))} placeholder="What happened, in a sentence or two."/>
        </label>
        <div><button className="btn btn-primary btn-sm" disabled={busy || form.subjectId.trim() === "" || form.note.trim().length < 5}>{busy ? "Saving…" : "Log observation"}</button></div>
      </form>
      {d && d.trend && Object.keys(d.trend).length > 0 && (
        <div className="admin-chips" style={{ marginBottom: 12 }}>
          <span className="admin-hint" style={{ marginRight: 6 }}>Last 30 days:</span>
          {Object.entries(d.trend).map(([k, v]) => <span key={k} className="chip chip-navy" style={{ marginRight: 6 }}>{k}: {v}</span>)}
        </div>
      )}
      <div className="admin-filters">
        <select className="admin-select" value={f.status} onChange={e => setF(o => ({ ...o, status: e.target.value }))}><option value="">All statuses</option><option value="open">Open</option><option value="reviewed">Reviewed</option></select>
        <select className="admin-select" value={f.category} onChange={e => setF(o => ({ ...o, category: e.target.value }))}><option value="">All categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        logs === null ? <div className="dash-spinner"/> :
        logs.length === 0 ? <div className="admin-empty">No observations logged.</div> :
        <div className="admin-app-list">
          {logs.map(l => (
            <div className="admin-app" key={l.logId}>
              <div className="admin-app-top">
                <div>
                  <div className="admin-cell-name">{l.subjectName || l.subjectId} <span className={"chip " + sevChip(l.severity)}>{l.category} · {l.severity}</span></div>
                  <div className="mono admin-cell-sub">{l.observerName || l.observerId} · {fmtDate(l.createdAt)}{l.aiSource ? " · " + l.aiSource : ""}</div>
                </div>
                <span className={"chip status-" + (l.status === "reviewed" ? "published" : "draft")}>{l.status}</span>
              </div>
              <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{l.note}</p>
              {l.status === "open" && <div className="admin-app-actions"><button className="btn btn-ghost btn-sm" onClick={() => review(l.logId)}>Mark reviewed</button></div>}
            </div>
          ))}
        </div>}
    </div>
  );
}

// ============================================================================
// Integrations & delivery — bus destinations, delivery log, manual dispatch
// ============================================================================

// Step-by-step setup for each integration type — the piece that was missing
// (the Sheets mirror "didn't post" because the Apps Script wasn't deployed for
// "Anyone" access, or the doPost didn't match our payload).
const APPS_SCRIPT_SHEETS = `function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  // Optional shared-secret check (matches the "Signing secret" you saved):
  // if (body.secret !== 'PASTE_SECRET') return ok('bad secret');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(body.event) || ss.insertSheet(body.event);
  var rows = [].concat(body.data.members || [body.data]);
  rows.forEach(function (r) { sheet.appendRow([new Date(), JSON.stringify(r)]); });
  return ok('ok');
}
  function ok(msg){ return ContentService.createTextOutput(msg); }`;
const APPS_SCRIPT_DRIVE = `function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var d = body.data;                       // { name, url, channel, author }
  var file = UrlFetchApp.fetch(d.url).getBlob().setName(d.name || 'document');
  var folder = DriveApp.getFoldersByName('NGG Community Docs').hasNext()
    ? DriveApp.getFoldersByName('NGG Community Docs').next()
    : DriveApp.createFolder('NGG Community Docs');
  folder.createFile(file);
  return ContentService.createTextOutput('ok');
}`;
function AdminIntegrationGuide({ kind }) {
  const [open, setOpen] = React.useState(false);
  const isScript = kind === "sheets" || kind === "drive";
  const code = kind === "drive" ? APPS_SCRIPT_DRIVE : APPS_SCRIPT_SHEETS;
  return (
    <div className="admin-guide">
      <button type="button" className="admin-guide-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? "▾" : "▸"} Setup guide — {kind === "gchat" ? "Google Chat" : kind === "webhook" ? "signed webhook" : kind === "drive" ? "Drive (any provider)" : "Google Sheets"}
      </button>
      {open && (
        <div className="admin-guide-body">
          {kind === "gchat" && (
            <ol><li>In your Google Chat space → <b>Apps & integrations → Manage webhooks</b>.</li>
              <li>Create a webhook, copy its URL (starts with <code>https://chat.googleapis.com/</code>).</li>
              <li>Paste it above, choose the events, save. Use <b>Send test</b> to confirm.</li></ol>
          )}
          {kind === "webhook" && (
            <ol><li>Point the URL at your HTTPS endpoint.</li>
              <li>We sign every POST: header <code>X-NGG-Signature: sha256=HMAC(timestamp + "." + body, secret)</code>. Verify it with the signing secret shown once on save.</li>
              <li>Respond <code>2xx</code> within 15s. Non-2xx retries with backoff (8 tries → dead).</li></ol>
          )}
          {isScript && (
            <>
              <ol>
                <li>Open <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">a Google Sheet</a>{kind === "drive" ? " (any Google account with Drive)" : ""} → <b>Extensions → Apps Script</b>.</li>
                <li>Delete the sample and paste the code below. Save.</li>
                <li><b>Deploy → New deployment → Web app.</b> Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>. <em>(This is the step that's usually missed — without “Anyone”, Google shows a sign-in page and nothing is written.)</em></li>
                <li>Copy the <b>/exec</b> Web app URL, paste it above, save, then <b>Send test</b>.</li>
                {kind === "drive" && <li>Set events to <code>community.document</code> so shared docs are filed to your Drive automatically.</li>}
              </ol>
              <div className="admin-guide-code">
                <div className="admin-guide-code-h"><span>Apps Script — paste into the editor</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { try { navigator.clipboard.writeText(code); toast.success("Copied"); } catch (_) {} }}>Copy</button></div>
                <pre>{code}</pre>
              </div>
              <p className="admin-guide-note">Cross-compatible: for Dropbox / OneDrive / S3, point the URL at a Zapier / Make webhook (or your own endpoint) instead — it receives the same signed JSON, so any drive works.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AdminIntegrations() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const blank = { integrationId: "", kind: "gchat", name: "", url: "", events: "*", secret: "", status: "active" };
  const [form, setForm] = React.useState(blank);
  const load = () => NGGApi.admin.integrations.list().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const edit = (i) => setForm({ integrationId: i.integrationId, kind: i.kind, name: i.name, url: i.url, events: (i.events || ["*"]).join(", "), secret: "", status: i.status });
  const save = async (e) => {
    e.preventDefault(); setBusy("save");
    try {
      const events = form.events.split(",").map(s => s.trim()).filter(Boolean);
      const r = await NGGApi.admin.integrations.upsert({ integrationId: form.integrationId || undefined, kind: form.kind, name: form.name, url: form.url, events: events.length ? events : ["*"], secret: form.secret || undefined, status: form.status });
      if (r.secret) toast.show({ kind: "success", title: "Saved — copy the secret now", body: "Signing secret (shown once): " + r.secret, ttl: 20000 });
      else toast.success("Saved.", "Integration");
      setForm(blank); load();
    } catch (e) { toast.error(e.code || e.message, "Couldn't save"); } finally { setBusy(""); }
  };
  const test = async (id) => { setBusy("t" + id); try { const r = await NGGApi.admin.integrations.test(id); r.delivered ? toast.success("Test delivered.", "Integration test") : toast.error(r.error || "No detail", "Test failed"); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  const remove = async (id) => { if (!(await dialog.confirm({ title: "Delete this integration?",
    body: "Anything relying on it stops working immediately.", cta: "Delete", danger: true }))) return; try { await NGGApi.admin.integrations.remove(id); load(); } catch (e) { toast.error(e.code || e.message); } };
  const dispatch = async () => { setBusy("disp"); try { const r = await NGGApi.admin.integrations.dispatch(); toast.success("Attempted " + (r.attempted || 0) + ", delivered " + (r.delivered || 0) + ", failed " + (r.failed || 0) + ".", "Queue drained"); load(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  const retry = async (id = "") => { setBusy("r" + id); try { const r = await NGGApi.admin.integrations.retry(id); const dsp = r.dispatch || {}; toast.success("Requeued " + (r.requeued || 0) + " · delivered " + (dsp.delivered || 0) + ", failed " + (dsp.failed || 0) + ".", "Retry"); load(); } catch (e) { toast.error(e.code || e.message, "Retry failed"); } finally { setBusy(""); } };
  const syncMembers = async () => { setBusy("sync"); try { const r = await NGGApi.admin.integrations.syncMembers(); toast.success("Sent " + (r.chunksSent || 0) + " chunk(s), " + (r.total || 0) + " members.", "Sheets sync"); } catch (e) { toast.error(e.code || e.message, "Sync failed"); } finally { setBusy(""); } };
  const items = d ? d.integrations : null;
  const health = (d && d.health) || {};
  const log = (d && d.log) || [];
  const pending = log.filter(x => x.status === "pending" || x.status === "failed").length;
  const kindHint = { gchat: "https://chat.googleapis.com/…", sheets: "https://script.google.com/macros/s/…/exec", webhook: "https://your-endpoint.example/…", drive: "https://script.google.com/macros/s/…/exec  (or any drive webhook)" }[form.kind];
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Integrations & delivery {pending ? <span className="chip chip-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>{pending} queued</span> : null}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy === "disp"} onClick={dispatch}>{busy === "disp" ? "Draining…" : "Run delivery queue now"}</button>
          <button className="btn btn-ghost btn-sm" disabled={busy === "sync"} onClick={syncMembers}>{busy === "sync" ? "Syncing…" : "Sync members → Sheets"}</button>
        </div>
      </div>
      <p className="admin-hint">Send events (registrations, attendance, awards, wellbeing flags, shared documents) to Google Chat, a signed webhook, the Sheets mirror, or a Drive sink. Pick a type below for a step-by-step setup guide. Delivery runs automatically via web-cron; use "Run delivery queue now" to flush immediately.</p>
      <form onSubmit={save} className="admin-fields" style={{ maxWidth: 640, marginBottom: 18 }}>
        <div className="admin-fields-row">
          <FieldSelect label="Type" value={form.kind} onChange={v => setForm(o => ({ ...o, kind: v }))} options={["gchat", "webhook", "sheets", "drive"]}/>
          <Field label="Name" value={form.name} onChange={v => setForm(o => ({ ...o, name: v }))}/>
          <FieldSelect label="Status" value={form.status} onChange={v => setForm(o => ({ ...o, status: v }))} options={["active", "paused"]}/>
        </div>
        <Field label={"Destination URL"} value={form.url} onChange={v => setForm(o => ({ ...o, url: v }))} placeholder={kindHint}/>
        <Field label="Events (comma-separated; * = all, prefix.* matches)" value={form.events} onChange={v => setForm(o => ({ ...o, events: v }))} placeholder={form.kind === "drive" ? "community.document" : "* or attendance.*, registration.created"}/>
        {form.kind !== "gchat" && <Field label={"Signing secret " + (form.integrationId ? "(blank = keep current)" : "(blank = auto-generate)")} value={form.secret} onChange={v => setForm(o => ({ ...o, secret: v }))}/>}
        <AdminIntegrationGuide kind={form.kind}/>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={busy === "save" || !form.url}>{form.integrationId ? "Update" : "Add integration"}</button>
          {form.integrationId ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>Cancel</button> : null}
        </div>
      </form>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        items === null ? <div className="dash-spinner"/> :
        <>
          {items.length === 0 ? <div className="admin-empty">No integrations yet.</div> :
            <div className="admin-app-list">
              {items.map(i => { const h = health[i.integrationId] || {}; const stuck = (h.pending || 0) + (h.dead || 0); return (
                <div className="admin-app" key={i.integrationId}>
                  <div className="admin-app-top">
                    <div>
                      <div className="admin-cell-name">{i.name} <span className="chip chip-navy">{i.kind}</span> {i.status === "paused" ? <span className="chip status-draft">paused</span> : null}</div>
                      <div className="mono admin-cell-sub">{i.url}{i.hasSecret ? " · secret " + i.secretHint : ""} · {(i.events || []).join(", ")}</div>
                      {/* Delivery health — the at-a-glance answer to "is the mirror actually receiving events?" */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                        <span className="chip chip-lime" style={{ fontSize: 11 }}>{h.ok || 0} delivered</span>
                        {h.pending ? <span className="chip status-draft" style={{ fontSize: 11 }}>{h.pending} pending</span> : null}
                        {h.dead ? <span className="chip status-archived" style={{ fontSize: 11 }}>{h.dead} dead</span> : null}
                        {h.lastOkAt ? <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>last OK {fmtDate(h.lastOkAt)}</span> : null}
                      </div>
                      {h.lastError ? <div className="mono" style={{ fontSize: 11.5, color: "#b03535", marginTop: 4, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis" }}>Last error: {h.lastError}</div> : null}
                    </div>
                  </div>
                  <div className="admin-app-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy === "t" + i.integrationId} onClick={() => test(i.integrationId)}>{busy === "t" + i.integrationId ? "Testing…" : "Send test"}</button>
                    {stuck ? <button className="btn btn-ghost btn-sm" disabled={busy === "r" + i.integrationId} onClick={() => retry(i.integrationId)} style={{ color: "var(--gold-600,#a07400)" }}>{busy === "r" + i.integrationId ? "Retrying…" : "Retry " + stuck + " stuck"}</button> : null}
                    <button className="btn btn-ghost btn-sm" onClick={() => edit(i)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(i.integrationId)}>Delete</button>
                  </div>
                </div>
              ); })}
            </div>}
          <div className="admin-fields-h" style={{ marginTop: 18, fontWeight: 700 }}>Recent deliveries</div>
          {log.length === 0 ? <div className="admin-empty">No deliveries yet.</div> :
            <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Event</th><th>Status</th><th>Tries</th><th>Last error</th><th>When</th></tr></thead>
              <tbody>{log.map((x, i) => (
                <tr key={i}><td>{x.kind || x.eventId}</td><td><span className={"chip status-" + (x.status === "ok" ? "published" : x.status === "dead" ? "archived" : "draft")}>{x.status}</span></td><td>{x.attempts}</td><td className="mono" style={{ fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{x.lastError || ""}</td><td className="mono" style={{ fontSize: 12 }}>{fmtDate(x.deliveredAt || x.nextAttemptAt)}</td></tr>
              ))}</tbody>
            </table></div>}
        </>}
    </div>
  );
}

function AdminAudit() {
  const [data, setData] = React.useState(null);
  const [f, setF] = React.useState({ actor: "", event: "", staffOnly: false });
  const [page, setPage] = React.useState(1);
  const [err, setErr] = React.useState("");
  const roleChip = (role) => role === "super_admin" ? "chip-gold" : role === "admin" ? "chip-navy" : role === "editor" ? "chip-lime" : "";
  const load = (p = page) => NGGApi.admin.audit({ page: p, pageSize: 100, actor: f.actor, event: f.event, staffOnly: f.staffOnly ? 1 : "" })
    .then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [f.actor, f.event, f.staffOnly]);
  const goPage = (p) => { setPage(p); setData(null); load(p); };
  const rows = data ? data.audit : null;
  const actors = (data && data.actors) || [];
  const exportCsv = async () => {
    try {
      const r = await NGGApi.admin.audit({ all: 1, actor: f.actor, event: f.event, staffOnly: f.staffOnly ? 1 : "" });
      downloadCsv("audit-trail", (r.audit || []).map(x => ({ at: x.at, actor: x.actorName || x.actorId || "system", role: x.actorRole || "", event: x.event, subject: x.subject || "", ip: x.ip || "" })));
    } catch (e) { toast.error(e.code || e.message, "Export failed"); }
  };

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Audit trail <span className="chip chip-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>super admin</span></h2>
        <button className="btn btn-ghost btn-sm" disabled={!rows || !rows.length} onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="admin-hint">Every action taken by admins and managers, most recent first. This accountability record is visible to super admins only.{data && data.total ? " " + fmtNum(data.total) + " entries." : ""}</p>
      <div className="admin-filters">
        <select className="admin-select" value={f.actor} onChange={e => setF(o => ({ ...o, actor: e.target.value }))}>
          <option value="">All actors</option>
          {actors.map(a => <option key={a.actorId} value={a.actorId}>{a.fullName || a.actorId} · {a.role}</option>)}
        </select>
        <input className="admin-input" style={{ maxWidth: 220 }} placeholder="Filter by event (e.g. member, anchor)" value={f.event} onChange={e => setF(o => ({ ...o, event: e.target.value }))}/>
        <label className="admin-field admin-field-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={f.staffOnly} onChange={e => setF(o => ({ ...o, staffOnly: e.target.checked }))}/>
          <span>Staff actions only</span>
        </label>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        rows === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">No matching activity.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>When</th><th>Who</th><th>Role</th><th>Event</th><th>Subject</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtDateTime(r.at)}</td>
                <td>{r.actorName || r.actorId || "system"}</td>
                <td>{r.actorRole ? <span className={"chip " + roleChip(r.actorRole)} style={{ fontSize: 10 }}>{r.actorRole}</span> : <span className="mono" style={{ color: "var(--ink-400)" }}>—</span>}</td>
                <td className="mono">{r.event}</td>
                <td className="mono">{r.subject || "—"}</td>
                <td className="mono">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={data ? data.page : 1} pageSize={data ? data.pageSize : 100} total={data ? data.total : 0} onPage={goPage}/>
        </div>
      }
    </div>
  );
}

// ============================================================================
// Anchor Journal app — manage the content the member PWA renders:
// the 12 weekly build-sheets, the quote library, the daily systems, and the
// 3D tilt toggle. Saved to settings; the app reads it live.
// ============================================================================

// Move item at index i by `dir` (-1 up, +1 down) within an array (immutable).
function arrMove(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
  return next;
}

function AdminAnchor() {
  const [c, setC] = React.useState(null);
  const [defaults, setDefaults] = React.useState(null);
  const [tab, setTab] = React.useState("weeks");
  const [previewIdx, setPreviewIdx] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [draft, setDraft] = React.useState(null); // recovered unsaved draft
  const DRAFT_KEY = "ngg.anchorDraft";
  const update = (fn) => { setC(o => fn(o)); setDirty(true); setSaved(false); };

  React.useEffect(() => {
    NGGApi.admin.anchor.get()
      .then(r => {
        setC(r.content || {}); setDefaults(r.defaults || null);
        try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) { const d = JSON.parse(raw); if (d && d.savedAt) setDraft(d); } } catch (_) {}
      })
      .catch(e => { toast.error(e.code || e.message); setC({}); });
  }, []);
  // Autosave every edit to localStorage so a refresh / crash never loses work.
  React.useEffect(() => {
    if (dirty && c) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...c, savedAt: new Date().toISOString() })); } catch (_) {} }
  }, [c, dirty]);
  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} setDraft(null); };
  const restoreDraft = () => { if (draft) { const d = { ...draft }; delete d.savedAt; update(() => d); } setDraft(null); };
  const save = async () => {
    setBusy(true);
    try { await NGGApi.admin.anchor.set(c); setSaved(true); setDirty(false); clearDraft(); setTimeout(() => setSaved(false), 2400); toast.success("Published to the Anchor Journal"); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  const resetAll = async () => {
    const ok = await dialog.confirm({ title: "Reset all Anchor content?", body: "Restores the default 12 weeks, quote library and daily systems. Nothing is published until you press Save.", cta: "Reset to defaults" });
    if (!ok) return;
    const d = defaults || (await NGGApi.admin.anchor.defaults().then(r => r.content).catch(() => null));
    if (d) update(() => JSON.parse(JSON.stringify(d)));
  };
  if (!c) return <div className="admin-section"><div className="dash-spinner"/></div>;

  const weeks = c.weeks || [], quotes = c.quotes || [], systems = c.systems || [];
  const setWeek = (i, k, v) => update(o => ({ ...o, weeks: o.weeks.map((w, idx) => idx === i ? { ...w, [k]: v } : w) }));
  const moveWeek = (i, dir) => update(o => ({ ...o, weeks: arrMove(o.weeks, i, dir) }));
  const resetWeek = (i) => { if (defaults && defaults.weeks && defaults.weeks[i]) update(o => ({ ...o, weeks: o.weeks.map((w, idx) => idx === i ? { ...defaults.weeks[i] } : w) })); };
  const setQuote = (i, v) => update(o => ({ ...o, quotes: o.quotes.map((q, idx) => idx === i ? v : q) }));
  const addQuote = () => update(o => ({ ...o, quotes: [...(o.quotes || []), ""] }));
  const rmQuote = (i) => update(o => ({ ...o, quotes: o.quotes.filter((_, idx) => idx !== i) }));
  const moveQuote = (i, dir) => update(o => ({ ...o, quotes: arrMove(o.quotes, i, dir) }));
  const setSys = (i, k, v) => update(o => ({ ...o, systems: o.systems.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }));
  const addSys = () => update(o => ({ ...o, systems: [...(o.systems || []), { key: "sys" + Date.now(), label: "", icon: "ph-check-circle" }] }));
  const rmSys = (i) => update(o => ({ ...o, systems: o.systems.filter((_, idx) => idx !== i) }));
  const moveSys = (i, dir) => update(o => ({ ...o, systems: arrMove(o.systems, i, dir) }));
  const blankWeek = { title: "", system: "", focus: "", home: "", school: "", peer: "", journal: "", stop: "", start: "", automate: "" };
  const addWeek = () => update(o => ({ ...o, weeks: [...(o.weeks || []), { ...blankWeek }] }));
  const dupWeek = (i) => update(o => { const w = o.weeks.slice(); w.splice(i + 1, 0, { ...w[i] }); return { ...o, weeks: w }; });
  const rmWeek = async (i) => { const ok = await dialog.confirm({ title: "Delete week " + (i + 1) + "?", body: (weeks[i] && weeks[i].title) || "This week", cta: "Delete" }); if (ok) update(o => ({ ...o, weeks: o.weeks.filter((_, idx) => idx !== i) })); };

  // Import / export the whole content bundle as JSON (backup / migrate).
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "anchor-content-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.weeks)) { toast.error("Not a valid Anchor content file"); return; }
      const ok = await dialog.confirm({ title: "Replace all content?", body: "Import " + parsed.weeks.length + " weeks, " + (parsed.quotes || []).length + " quotes, " + (parsed.systems || []).length + " systems. Nothing publishes until you Save.", cta: "Import" });
      if (ok) update(() => ({ weeks: parsed.weeks, quotes: parsed.quotes || [], systems: parsed.systems || [], tilt: parsed.tilt !== false }));
    } catch (_) { toast.error("Couldn't read that file"); }
  };

  // Completeness — how much of each week is filled in.
  const WEEK_FIELDS = ["title", "system", "focus", "home", "school", "peer", "journal"];
  const weekFilled = (w) => WEEK_FIELDS.filter(k => String((w || {})[k] || "").trim()).length;
  const weeksComplete = weeks.filter(w => weekFilled(w) === WEEK_FIELDS.length).length;

  const emptyQuotes = quotes.filter(q => !String(q).trim()).length;
  const warnings = [];
  if (weeks.length !== 12) warnings.push(weeks.length + " weeks (the journey expects 12)");
  if (quotes.length === 0) warnings.push("no quotes in the library");
  if (systems.length === 0) warnings.push("no daily systems");
  if (emptyQuotes) warnings.push(emptyQuotes + " empty quote" + (emptyQuotes === 1 ? "" : "s") + " (dropped on save)");

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Anchor Journal manager</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="mono" style={{ color: saved ? "var(--lime-ink)" : dirty ? "var(--coral)" : "var(--ink-500)" }}>{saved ? "PUBLISHED ✓" : busy ? "SAVING…" : dirty ? "UNSAVED CHANGES" : ""}</span>
          <a className="btn btn-ghost btn-sm" href="/journal/" target="_blank" rel="noopener noreferrer">Open preview ↗</a>
          <button className="btn btn-ghost btn-sm" onClick={exportJson}>Export</button>
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", margin: 0 }}>Import<input type="file" accept="application/json,.json" onChange={importJson} style={{ display: "none" }}/></label>
          <button className="btn btn-ghost btn-sm" onClick={resetAll} disabled={busy}>Reset all</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>Save &amp; publish</button>
        </div>
      </div>
      <p className="admin-hint">Everything here renders live in the members' Anchor Journal PWA. Edit and reorder the weekly build-sheets, the morning-quote library and the daily systems checklist, then publish.</p>

      {draft && !dirty && (
        <div className="admin-anchor-restore">
          <span>↩ You have an unsaved draft{draft.savedAt ? " from " + fmtDateTime(draft.savedAt) : ""}.</span>
          <span style={{ flex: 1 }}/>
          <button className="btn btn-primary btn-sm" onClick={restoreDraft}>Restore draft</button>
          <button className="btn btn-ghost btn-sm" onClick={clearDraft}>Discard</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="admin-anchor-warn">⚠ {warnings.join(" · ")}</div>
      )}

      <div className="admin-anchor-complete">
        <span className="mono">{weeksComplete} / {weeks.length} weeks complete</span>
        <div className="admin-bar" style={{ maxWidth: 260 }}><div className="admin-bar-fill" style={{ width: (weeks.length ? weeksComplete / weeks.length * 100 : 0) + "%" }}/></div>
      </div>

      <div className="admin-anchor-tabs">
        {[["weeks", "Weeks (" + weeks.length + ")"], ["quotes", "Quotes (" + quotes.length + ")"], ["systems", "Daily systems (" + systems.length + ")"], ["preview", "Preview"], ["settings", "Settings"]].map(([id, lbl]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "weeks" && (
        <div className="admin-anchor-weeks">
          <div className="admin-anchor-weeks-bar">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { document.querySelectorAll(".admin-anchor-week").forEach(d => d.open = true); }}>Expand all</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { document.querySelectorAll(".admin-anchor-week").forEach(d => d.open = false); }}>Collapse all</button>
            <span style={{ flex: 1 }}/>
            <button type="button" className="btn btn-primary btn-sm" onClick={addWeek}>+ Add week</button>
          </div>
          {weeks.map((w, i) => (
            <details key={i} className="admin-anchor-week">
              <summary>
                <span className="mono">WK {String(i + 1).padStart(2, "0")}</span> {w.title || "Untitled"}
                <span className={"admin-anchor-wk-pct" + (weekFilled(w) === WEEK_FIELDS.length ? " is-full" : "")}>{weekFilled(w)}/{WEEK_FIELDS.length}</span>
                <span className="admin-anchor-wk-tools" onClick={e => e.preventDefault()}>
                  <button type="button" className="admin-anchor-mv" disabled={i === 0} onClick={() => moveWeek(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="admin-anchor-mv" disabled={i === weeks.length - 1} onClick={() => moveWeek(i, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="admin-anchor-mv" onClick={() => dupWeek(i)} title="Duplicate week">⎘</button>
                  {defaults && defaults.weeks && defaults.weeks[i] && <button type="button" className="admin-anchor-mv" onClick={() => resetWeek(i)} title="Reset this week to default">⟲</button>}
                  <button type="button" className="admin-anchor-mv admin-anchor-del" onClick={() => rmWeek(i)} title="Delete week">✕</button>
                </span>
              </summary>
              <div className="admin-fields">
                <Field label="Week title" value={w.title || ""} onChange={v => setWeek(i, "title", v)}/>
                <Field label="System being built" value={w.system || ""} onChange={v => setWeek(i, "system", v)}/>
                <Field label="Personal focus" value={w.focus || ""} onChange={v => setWeek(i, "focus", v)}/>
                <Field label="Home actions" value={w.home || ""} onChange={v => setWeek(i, "home", v)}/>
                <Field label="School actions" value={w.school || ""} onChange={v => setWeek(i, "school", v)}/>
                <Field label="Peer modeling" value={w.peer || ""} onChange={v => setWeek(i, "peer", v)}/>
                <FieldTextarea label="Journal prompt" value={w.journal || ""} onChange={v => setWeek(i, "journal", v)} rows={2}/>
                <div className="admin-anchor-habit-lbl mono">HABIT FOCUS · shown on the Growth &amp; Weekly Review screens</div>
                <Field label="Stop" value={w.stop || ""} onChange={v => setWeek(i, "stop", v)}/>
                <Field label="Start" value={w.start || ""} onChange={v => setWeek(i, "start", v)}/>
                <Field label="Automate" value={w.automate || ""} onChange={v => setWeek(i, "automate", v)}/>
              </div>
            </details>
          ))}
        </div>
      )}

      {tab === "quotes" && (
        <div className="admin-anchor-list">
          {quotes.map((q, i) => (
            <div className="admin-anchor-row" key={i}>
              <span className="mono admin-anchor-n">{String(i + 1).padStart(2, "0")}</span>
              <textarea className="admin-input" rows={2} value={q} onChange={e => setQuote(i, e.target.value)}/>
              <div className="admin-anchor-rowtools">
                <button className="admin-anchor-mv" disabled={i === 0} onClick={() => moveQuote(i, -1)} aria-label="Move up">↑</button>
                <button className="admin-anchor-mv" disabled={i === quotes.length - 1} onClick={() => moveQuote(i, 1)} aria-label="Move down">↓</button>
                <button className="admin-anchor-rm" onClick={() => rmQuote(i)} aria-label="Remove">✕</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addQuote}>+ Add quote</button>
        </div>
      )}

      {tab === "systems" && (
        <div className="admin-anchor-list">
          {systems.map((s, i) => (
            <div className="admin-anchor-row" key={i}>
              <input className="admin-input" style={{ flex: 2 }} placeholder="Label (e.g. Woke up on time)" value={s.label || ""} onChange={e => setSys(i, "label", e.target.value)}/>
              <input className="admin-input" style={{ flex: 1 }} placeholder="ph-icon" value={s.icon || ""} onChange={e => setSys(i, "icon", e.target.value)}/>
              <div className="admin-anchor-rowtools">
                <button className="admin-anchor-mv" disabled={i === 0} onClick={() => moveSys(i, -1)} aria-label="Move up">↑</button>
                <button className="admin-anchor-mv" disabled={i === systems.length - 1} onClick={() => moveSys(i, 1)} aria-label="Move down">↓</button>
                <button className="admin-anchor-rm" onClick={() => rmSys(i)} aria-label="Remove">✕</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addSys}>+ Add system</button>
          <p className="admin-hint" style={{ marginTop: 10 }}>Icons use Phosphor names (e.g. <code>ph-sun-horizon</code>, <code>ph-book-open-text</code>). See phosphoricons.com.</p>
        </div>
      )}

      {tab === "preview" && (() => {
        const i = Math.min(previewIdx, Math.max(0, weeks.length - 1));
        const w = weeks[i] || {};
        const q = quotes.length ? quotes[i % quotes.length] : "";
        return (
          <div className="admin-anchor-preview">
            <div className="admin-anchor-preview-bar">
              <label className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-500)" }}>PREVIEW WEEK</label>
              <select className="admin-select" value={i} onChange={e => setPreviewIdx(Number(e.target.value))}>
                {weeks.map((ww, idx) => <option key={idx} value={idx}>WK {String(idx + 1).padStart(2, "0")} · {ww.title || "Untitled"}</option>)}
              </select>
              <span style={{ flex: 1 }}/>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>as members see it</span>
            </div>
            {/* Journal-themed member view (violet cosmic theme, mirrors the PWA). */}
            <div className="aj-preview-shell">
              <div className="aj-preview-quote">"{q || "Add a quote in the Quotes tab."}"</div>
              <div className="aj-preview-card">
                <div className="aj-preview-wk">WEEK {String(i + 1).padStart(2, "0")}</div>
                <div className="aj-preview-title">{w.title || "Untitled week"}</div>
                {w.system && <div className="aj-preview-system">◇ {w.system}</div>}
                {w.focus && <p className="aj-preview-focus">{w.focus}</p>}
                <div className="aj-preview-rows">
                  {[["Home", w.home], ["School", w.school], ["Peer", w.peer]].map(([k, v]) => v ? (
                    <div className="aj-preview-row" key={k}><span className="aj-preview-k">{k}</span><span>{v}</span></div>
                  ) : null)}
                </div>
                {w.journal && <div className="aj-preview-journal"><span className="aj-preview-k">Journal prompt</span>{w.journal}</div>}
              </div>
              <div className="aj-preview-systems">
                {systems.map((s, si) => <span key={si} className="aj-preview-sys">{s.label || "—"}</span>)}
              </div>
            </div>
            <p className="admin-hint" style={{ marginTop: 12 }}>Live preview of your unsaved edits. For the full interactive app, use <b>Open preview ↗</b> above (shows the last <em>published</em> version).</p>
          </div>
        );
      })()}

      {tab === "settings" && (
        <div className="admin-fields" style={{ maxWidth: 420 }}>
          <FieldCheckbox label="3D tilt effect on cards" value={c.tilt !== false} onChange={v => update(o => ({ ...o, tilt: v }))}/>
          <p className="admin-hint">The tilt effect gives journal cards a subtle 3D response to the pointer. Disable it for lower-powered devices.</p>
        </div>
      )}
    </div>
  );
}

// Assignments live in one desk shared with the instructor portal: src/modules/learn/assign-desk.jsx.

/* ── What has happened to this member ─────────────────────────────────────
 *
 * Status, centre, type and role are columns that get OVERWRITTEN. "Why is
 * this person inactive, and since when" was unanswerable without reading
 * the audit log as JSON.
 *
 * Derived from the audit log rather than a second history table, so it
 * cannot disagree with the record of who did what — and so it covers
 * changes made before this screen existed. */
function MemberTimeline({ memberId }) {
  const [tl, setTl] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.memberTimeline(memberId).then(setTl).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [memberId]);

  if (err) return <div className="admin-empty">Couldn't load the history. <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>;
  if (!tl) return <div className="dash-spinner"/>;
  if (!(tl.events || []).length) {
    return <div className="admin-empty">
      Nothing has been recorded against this member yet. Not "nothing happened" —
      nothing that was audited.
    </div>;
  }

  return (
    <ol className="mem-tl">
      {tl.events.map((e, i) => (
        <li key={e.at + ":" + i}>
          <span className="mem-tl-when mono">{String(e.at).slice(0, 16).replace("T", " ")}</span>
          <span className="mem-tl-what">{e.what}</span>
          <span className="mem-tl-who">{e.by}</span>
        </li>
      ))}
    </ol>
  );
}

/* A member's cards, as the CACENTRE gate reads them: the secure one, and any
   older printed card recorded at import. Reissuing voids the secure card at
   once — a lost card stops at the door — and can retire the printed ones too. */
function MemberCardsSection({ memberId }) {
  const [cards, setCards] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.members.cards.of(memberId).then(r => setCards(r.cards || [])).catch(() => setCards([]));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [memberId]);
  const reissue = async (voidPrinted) => {
    const ok = await dialog.confirm({ title: voidPrinted ? "Replace every card?" : "Issue a new card?",
      body: voidPrinted ? "The current card and any old printed card stop working at the gate now. Print the new one before they next come in."
                        : "The current secure card stops working at the gate now. Their old printed card, if any, keeps working.",
      cta: "Issue new card", danger: true });
    if (!ok) return;
    setBusy(true);
    try { const r = await NGGApi.admin.members.cards.reissue(memberId, voidPrinted); setCards(r.cards || []); toast.success(r.code, "New card issued"); }
    catch (e) { toast.error(e.detail || e.code || e.message); } finally { setBusy(false); }
  };
  const active = (cards || []).filter(c => c.status === "active");
  return (
    <div className="admin-detail-section">
      <div className="admin-detail-h">Cards at the gate</div>
      {cards === null ? <div className="admin-hint">Loading…</div> : (
        <>
          {!active.length && <div className="admin-hint">No card yet — the gate can only find them by name. Issue one below, or use “Issue cards” on the roster.</div>}
          {active.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, padding: "2px 0" }}>
              <span className="chip" style={{ flex: "none" }}>{c.kind === "secure" ? "Secure" : "Printed"}</span>
              <span className="mono">{c.code}</span>
              <span className="admin-hint" style={{ margin: 0 }}>{c.kind === "printed" ? "read as “" + c.format + "”" : ""}{c.issuedAt ? " · " + String(c.issuedAt).slice(0, 10) : ""}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reissue(false)}>{active.some(c => c.kind === "secure") ? "Lost card — issue a new one" : "Issue a card"}</button>
            {active.some(c => c.kind === "printed") && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reissue(true)}>Reprinted — retire the old card</button>}
          </div>
        </>
      )}
    </div>
  );
}

function AdminMemberDetail({ memberId, onClose, onEdit, onChanged }) {
  const { panelRef, close, onInput, titleProps, headingProps } = useAdminDrawer(onClose, false);
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [mentors, setMentors] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [ngvRole, setNgvRole] = React.useState("volunteer");
  const [rtab, setRtab] = React.useState("overview");
  const load = () => { setErr(""); return NGGApi.admin.memberDetail(memberId).then(r => setD(r.detail)).catch(e => { setErr(e.code || e.message || "load_failed"); }); };
  React.useEffect(() => { load(); NGGApi.admin.mentors.list().then(r => setMentors(r.mentors || [])).catch(() => {}); /* eslint-disable-next-line */ }, [memberId]);
  const STATUS_LABEL = { active: "Activate", suspended: "Suspend", "graduated-ngg": "Graduate from NGG", "graduated-vanguard": "Graduate as Vanguard", inactive: "Deactivate" };
  const setStatus = async (status) => {
    // Suspend / graduate change a real member's standing and are hard to
    // reverse — confirm first (consistent with the rest of the console).
    if (status !== "active") {
      const ok = await dialog.confirm({ title: (STATUS_LABEL[status] || "Change status") + "?", body: "This changes " + ((m && m.fullName) || "this member") + "'s standing" + (status === "suspended" ? " and revokes their access" : "") + ". You can change it again later.", cta: STATUS_LABEL[status] || "Change", cancel: "Cancel", danger: status === "suspended" });
      if (!ok) return;
    }
    setBusy(true); try { await NGGApi.admin.members.upsert({ memberId, status }); toast.success("Status → " + status); await load(); onChanged && onChanged(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const assign = async (mentorId) => { setBusy(true); try { await NGGApi.admin.assignMentor({ memberId, mentorId }); toast.success(mentorId ? "Mentor assigned" : "Mentor cleared"); await load(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };
  /* §20: progression is evidence of formation, never time served.
   *
   * So the promotion asks for the evidence rather than a Yes/No — and puts the
   * formation record in the question, because an admin who has to scroll away
   * to find out how a child is actually doing will promote on the name they
   * recognise. Tenure is shown and labelled as not being evidence, which is
   * the brief's own argument and the reason it is not left out.
   *
   * The readiness read is best-effort: it informs the decision and must never
   * block it, so a failed fetch asks the question without the summary rather
   * than refusing to open. */
  const promoteNgv = async () => {
    let summary = "";
    try {
      const rr = await NGGApi.admin.members.readiness(memberId);
      const f = rr && rr.readiness;
      if (f) {
        const bits = [];
        bits.push(f.courage && f.courage.current !== null
          ? "Courage " + f.courage.current + "/5 (" + f.courage.marks + " observed)"
          : "Courage: nothing recorded");
        bits.push("Reviewed " + f.review.weeksReviewed + " of the last " + f.review.ofWeeks + " weeks"
          + (f.review.concerns ? " · " + f.review.concerns + " concern(s) raised" : ""));
        bits.push("Attendance " + f.attendance.total + " sessions, " + f.attendance.last90 + " in 90 days");
        bits.push("Stars " + f.stars);
        if (f.dues) bits.push(f.dues.owes ? "Dues: owing" : "Dues: clear");
        if (f.tenure && f.tenure.months !== null) bits.push("In the programme " + f.tenure.months + " months — time served is not evidence of formation.");
        summary = bits.join("\n");
      }
    } catch (e) { /* informs, never blocks */ }

    const evidence = await dialog.prompt({
      title: "Promote to NGV?",
      body: (summary ? summary + "\n\n" : "")
        + "This advances " + ((m && m.fullName) || "this member")
        + " into the volunteer tier as a " + ngvRole
        + ", provisions their NGV record + ID card, and emails them their digital ID. Reversible.",
      label: "What is the evidence of formation?",
      placeholder: "What they have carried, led or changed — not how long they have been here.",
      multiline: true, required: true, cta: "Promote", cancel: "Cancel",
    });
    if (!evidence) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.members.promoteNgv(memberId, ngvRole, { evidence });
      const via = Array.isArray(r.sent) && r.sent.length ? " · ID sent by " + r.sent.join(" + ") : "";
      toast.success((r.already ? "Already an NGV · " : "Promoted to NGV · ") + r.volunteerId + via);
      await load(); onChanged && onChanged();
    } catch (e) { toast.error(e.code === "guardian_consent_required" && e.detail ? e.detail : (e.code || e.message)); } finally { setBusy(false); }
  };
  const resendNgvId = async () => {
    setBusy(true);
    try {
      const r = await NGGApi.admin.members.promoteNgv(memberId, undefined, { sendId: true });
      toast.success(Array.isArray(r.sent) && r.sent.length ? "ID re-sent by " + r.sent.join(" + ") : "No delivery channel on file (add an email/phone).");
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const demoteNgv = async () => {
    const ok = await dialog.confirm({ title: "Revoke NGV standing?", body: "This deactivates " + ((m && m.fullName) || "this member") + "'s volunteer record and removes their NGV standing. Their attendance and hours history is kept, and you can re-promote them later to reactivate the same record.", cta: "Revoke", cancel: "Cancel", danger: true });
    if (!ok) return;
    setBusy(true); try { await NGGApi.admin.members.demoteNgv(memberId); toast.success("NGV standing revoked"); await load(); onChanged && onChanged(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  const m = d && d.member;
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{m ? m.fullName : "Member"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close} aria-label="Close">✕</button>
        </div>
        {err ? <div className="admin-empty">Couldn't load this member. <button className="btn btn-ghost btn-sm" onClick={() => { setD(null); load(); }}>Retry</button></div> :
         !d ? <div className="dash-spinner"/> : (
          <div className="admin-detail">
            <div className="admin-detail-top">
              <div>
                <div className="mono admin-cell-sub">{m.memberId} · {m.email}{m.phone ? " · " + m.phone : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span className={"chip status-" + m.status}>{m.status}</span>
                  <span className="chip">{m.type}</span>
                  <span className="chip">{m.centre}</span>
                  {m.track && <span className="chip">{m.track}</span>}
                  {m.role && m.role !== "member" && <span className="chip chip-gold">{m.role}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(m)}>Edit profile</button>
            </div>

            <div className="admin-tabs mr-tabs" role="tablist" aria-label="Member record">
              {MEMBER_RECORD_TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={rtab === k} className={"admin-tab" + (rtab === k ? " is-active" : "")} onClick={() => setRtab(k)}>{l}</button>)}
            </div>

            {rtab !== "overview" ? <MemberRecordPanel memberId={memberId} tab={rtab}/> : <>
            <div className="admin-detail-stats">
              <div><b>{(d.stats || {}).level ?? "—"}</b><span>Level</span></div>
              <div><b>{(d.stats || {}).streak ?? "—"}</b><span>Streak</span></div>
              <div><b>{(d.stats || {}).xp ?? "—"}</b><span>XP</span></div>
              <div><b>{(d.progress || {}).verified ?? 0}/{(d.progress || {}).total ?? 0}</b><span>Missions</span></div>
              <div><b>{(d.journal || []).length}</b><span>Journals</span></div>
            </div>

            <MemberCardsSection memberId={memberId}/>

            <div className="admin-detail-section">
              <div className="admin-detail-h">History</div>
              <MemberTimeline memberId={memberId}/>
            </div>

            <div className="admin-detail-section">
              <div className="admin-detail-h">Mentor</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select className="admin-select" value={d.mentor ? d.mentor.mentorId : ""} disabled={busy} onChange={(e) => assign(e.target.value)}>
                  <option value="">— No mentor —</option>
                  {mentors.map(mt => <option key={mt.mentorId} value={mt.mentorId}>{mt.fullName}{mt.tracks && mt.tracks.length ? " · " + mt.tracks.join(", ") : ""}</option>)}
                </select>
              </div>
            </div>

            <div className="admin-detail-section">
              <div className="admin-detail-h">Chain of command</div>
              {m.ngvVolunteerId
                ? <div>
                    <div className="admin-hint" style={{ margin: "0 0 8px" }}>Promoted to <b>NGV</b> — volunteer id <span className="mono">{m.ngvVolunteerId}</span>{m.ngvAt ? " · " + String(m.ngvAt).slice(0, 10) : ""}. Their NGV dashboard is active.</div>
                    <div className="admin-detail-actions" style={{ alignItems: "center" }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={resendNgvId}>Resend ID</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} disabled={busy} onClick={demoteNgv}>Revoke NGV</button>
                    </div>
                  </div>
                : <div className="admin-detail-actions" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    <select className="admin-select" value={ngvRole} disabled={busy || !memberIsNgg(m) || m.status !== "active"} onChange={(e) => setNgvRole(e.target.value)} aria-label="Volunteer role">
                      <option value="volunteer">Volunteer</option>
                      <option value="instructor">Instructor</option>
                      <option value="mentor">Mentor</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" disabled={busy || !memberIsNgg(m) || m.status !== "active"} onClick={promoteNgv}>Promote to NGV</button>
                    <span className="admin-hint" style={{ margin: 0 }}>Advances an active NGG member into the volunteer tier, provisions their NGV ID, and emails it to them.</span>
                  </div>}
            </div>

            <div className="admin-detail-section">
              <div className="admin-detail-h">Status</div>
              <div className="admin-detail-actions">
                {m.status !== "active" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("active")}>Activate</button>}
                {m.status !== "suspended" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("suspended")}>Suspend</button>}
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("graduated-ngg")}>Graduate NGG</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("graduated-vanguard")}>Graduate Vanguard</button>
              </div>
            </div>

            {(m.parentName || m.parentEmail || m.school) && (
              <div className="admin-detail-section">
                <div className="admin-detail-h">Guardian &amp; school</div>
                <div className="admin-detail-kv">
                  {m.parentName && <div><span>Parent</span>{m.parentName}</div>}
                  {m.parentEmail && <div><span>Parent email</span>{m.parentEmail}</div>}
                  {m.parentPhone && <div><span>Parent phone</span>{m.parentPhone}</div>}
                  {m.school && <div><span>School</span>{m.school}</div>}
                </div>
              </div>
            )}

            {d.submissions.length > 0 && (
              <div className="admin-detail-section">
                <div className="admin-detail-h">Assignment submissions</div>
                {d.submissions.map((s, i) => (
                  <div className="admin-detail-row" key={i}><span>{s.title}</span><span className={"chip status-" + (s.status === "graded" ? "published" : "draft")}>{s.status === "graded" ? (s.grade + "/" + s.points) : s.status}</span></div>
                ))}
              </div>
            )}

            {/* Their ID card, and whether it is the current design. This is
                the question a desk asks with the person standing there, and
                the member record was the one place it could not be asked —
                the print log lived in another section and had to be searched
                by id. Loaded lazily: most visits to this drawer are not about
                a card, and the history is a second read. */}
            <MemberCardHistorySection memberId={m.memberId}/>

            <div className="admin-detail-section">
              <div className="admin-detail-h">Recent journal</div>
              {d.journal.length === 0 ? <div className="admin-empty" style={{ padding: 14 }}>No entries yet.</div> :
                d.journal.slice(0, 8).map((j, i) => (
                  <div className="admin-detail-journal" key={i}><span className="mono admin-detail-jdate">WK{j.week} · {fmtDate(j.createdAt)}</span><p>{(j.body || "").split("\n")[0]}</p></div>
                ))}
            </div>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

/* The member record's tabs beyond Overview, from ONE read
 * (admin.members.record). Answering "how is this child doing?" used to mean
 * six sections; it is one drawer now. A part the server leaves out is one the
 * reader may not see (money without `fees`, conduct outside policy scope), and
 * the panel says so — "not yours to see" is not "nothing here". Loaded the
 * first time a tab is opened and shared by every tab after that, so moving
 * between them costs nothing. */
const MEMBER_RECORD_TABS = [["overview", "Overview"], ["attendance", "Attendance"], ["conduct", "Conduct"], ["fees", "Fees"],
  ["curriculum", "Curriculum"], ["companion", "Companion"], ["family", "Family & mentor"], ["classes", "Classes"]];
const MR_RATING = { on_track: "On track", watch: "Watch", at_risk: "At risk" };
const MR_KIND = { present: "Present", late: "Late", absent: "Absent" };
const mrCache = {};
function MemberRecordPanel({ memberId, tab }) {
  const [r, setR] = React.useState(mrCache[memberId] || null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(() => {
    setErr(null);
    return NGGApi.admin.memberRecord(memberId).then(x => { mrCache[memberId] = x; setR(x); }).catch(setErr);
  }, [memberId]);
  // Always re-read once per drawer opening; show the cached copy meanwhile.
  React.useEffect(() => { load(); }, [load]);
  if (err && !r) return <ErrorState title="Couldn't load this member's record" message={err.message} code={err.code} onRetry={load}/>;
  if (!r) return <div className="dash-spinner" role="status" aria-label="Loading the record"/>;
  const hidden = (what) => <div className="admin-empty mr-hidden">{what} is not part of your access. Somebody holding the right capability can see it.</div>;
  const none = (what) => <div className="admin-empty">{what}</div>;
  const Kv = ({ items }) => <div className="mr-kv">{items.filter(Boolean).map(([k, v], i) => <div key={i}><b>{v}</b><span>{k}</span></div>)}</div>;
  const days = r.days;

  if (tab === "attendance") {
    const a = r.attendance;
    return <div className="mr-panel">
      <Kv items={[["Attendance rate", a.rate == null ? "—" : a.rate + "%"], ["Days in", a.present], ["Of them late", a.late], ["Absences recorded", a.absent]]}/>
      <div className="admin-hint">The last {days} days. An absence is one the nightly sweep recorded against a meeting day.</div>
      {a.recent.length === 0 ? none("Nothing recorded in the last " + days + " days.") :
        <table className="admin-table mr-table"><caption className="sr-only">Recent attendance</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Day</th><th scope="col">In</th><th scope="col">Out</th></tr></thead>
          <tbody>{a.recent.map((x, i) => <tr key={i}><td className="mono">{x.date}</td><td><span className={"st-chip is-" + (x.kind === "present" ? "active" : x.kind === "late" ? "quiet" : "dormant")}>{MR_KIND[x.kind]}{x.lateMinutes ? " · " + x.lateMinutes + " min" : ""}</span></td><td className="mono">{x.in || "—"}</td><td className="mono">{x.out || "—"}</td></tr>)}</tbody>
        </table>}
    </div>;
  }
  if (tab === "conduct") {
    if (!r.conduct) return hidden("Conduct");
    const c = r.conduct;
    return <div className="mr-panel">
      <Kv items={[["Standing", c.state + (c.until ? " until " + c.until : "")], ["Lates (term)", c.lates], ["Absences", c.absences + (c.absenceLimit ? " / " + c.absenceLimit : "")], ["Fines owed", fmtMoney(c.finesOwed)]]}/>
      {c.awaitingReview && <div className="admin-hint mr-warn">A sanction is waiting for review.</div>}
      <div className="admin-detail-h">Infractions</div>
      {c.infractions.length === 0 ? none("None recorded.") : c.infractions.map(x => <div className="admin-detail-row" key={x.id}><span className={x.voidedAt ? "mr-void" : ""}><span className="mono">{x.date}</span> · {x.kind}{x.note ? " — " + x.note : ""}{x.guardianReason ? " · " + guardianReasonText(x.guardianReason) : ""}</span>{x.voidedAt && <span className="chip">voided</span>}</div>)}
      <div className="admin-detail-h">Sanctions</div>
      {c.sanctions.length === 0 ? none("None.") : c.sanctions.map(x => <div className="admin-detail-row" key={x.id}><span><span className="mono">{String(x.issuedAt || "").slice(0, 10)}</span> · {x.kind}{x.amount ? " · " + fmtMoney(x.amount) : ""}{x.reason ? " — " + x.reason : ""}</span><span className="chip">{x.status}</span></div>)}
    </div>;
  }
  if (tab === "fees") {
    if (!r.fees) return hidden("Money");
    const f = r.fees;
    return <div className="mr-panel">
      <Kv items={[["Outstanding", fmtMoney(f.outstanding)], ["Payable now", fmtMoney(f.payable)], ["Charged", fmtMoney(f.charged)], ["Paid / credited", fmtMoney(f.credited)],
        f.programmeCost ? ["Programme covered", fmtMoney(f.programmeCovered) + " of " + fmtMoney(f.programmeCost)] : null]}/>
      {f.phase && <div className="admin-hint">Tenure phase: {f.phase}. Record payments in Fees.</div>}
      {f.recent.length === 0 ? none("No ledger entries yet.") : f.recent.map((e, i) => <div className="admin-detail-row" key={i}><span className={e.voided ? "mr-void" : ""}><span className="mono">{e.date}</span> · {e.kind}{e.note ? " — " + e.note : ""}</span><span className="mono">{e.direction === "credit" ? "−" : "+"}{fmtMoney(e.amount)}</span></div>)}
    </div>;
  }
  if (tab === "curriculum") {
    const c = r.curriculum;
    if (!c || !c.total) return none("No curriculum is published for " + (r.course || "this member's course") + " yet.");
    return <div className="mr-panel">
      <Kv items={[["Through the course", c.pct + "%"], ["Units done", c.completed + " / " + c.total], ["Overdue", c.overdue]]}/>
      {c.next && <div className="admin-hint">Next: week {c.next.week} — {c.next.title}</div>}
      <div className="admin-detail-h">Overdue</div>
      {c.overdueUnits.length === 0 ? none("Nothing overdue.") : c.overdueUnits.map((u, i) => <div className="admin-detail-row" key={i}><span>Week {u.week} — {u.title}</span><span className="st-chip is-dormant">{u.overdueDays}d late</span></div>)}
    </div>;
  }
  if (tab === "companion") {
    return <div className="mr-panel">
      <div className="admin-hint">The weekly assessment the companion writes from attendance, conduct, curriculum and journal. It informs a conversation; it decides nothing.</div>
      {r.companion.length === 0 ? none("No assessments yet — the first is written at the end of a week.") :
        r.companion.map((x, i) => <div className="mr-assess" key={i}>
          <div className="mr-assess-h"><span className="mono">{x.period}</span><span className={"st-chip is-" + (x.rating === "at_risk" ? "dormant" : x.rating === "watch" ? "quiet" : "active")}>{MR_RATING[x.rating] || x.rating}</span></div>
          <p>{x.summary}</p>
          {x.focus.length > 0 && <ul>{x.focus.map((f, j) => <li key={j}>{typeof f === "string" ? f : (f.text || f.title || "")}</li>)}</ul>}
        </div>)}
    </div>;
  }
  if (tab === "family") {
    const g = r.guardian, mt = r.mentorship;
    return <div className="mr-panel">
      <div className="admin-detail-h">Guardian on the record</div>
      {g.name || g.email || g.phone ? <div className="admin-detail-kv">{g.name && <div><span>Name</span>{g.name}</div>}{g.email && <div><span>Email</span>{g.email}</div>}{g.phone && <div><span>Phone</span>{g.phone}</div>}</div> : none("No guardian on the record.")}
      <div className="admin-detail-h">Family accounts linked</div>
      {r.family.length === 0 ? none("No family account is linked. A guardian can request a link from the family page.") :
        r.family.map((f, i) => <div className="admin-detail-row" key={i}><span>{f.fullName}{f.relationship ? " · " + f.relationship : ""} <span className="mono admin-cell-sub">{f.email}</span></span><span className="chip">{f.status}</span></div>)}
      <div className="admin-detail-h">Mentorship</div>
      {mt.mentor ? <Kv items={[["Mentor", mt.mentor], ["Since", mt.since || "—"], ["Meetings (90 days)", mt.meetings90], ["Last met", mt.lastMet || "—"]]}/> : none("No mentor assigned. Assign one on Overview.")}
      {mt.mentor && !mt.meetings90 && <div className="admin-hint mr-warn">No meeting logged in 90 days.</div>}
    </div>;
  }
  if (tab === "classes") {
    const cl = r.classes || [];
    if (!r.centre) return none("No centre on the record, so no timetable.");
    return <div className="mr-panel">
      {cl.length === 0 ? none("No classes for " + (r.course || "their course") + " on " + r.centre + "'s timetable.") :
        <table className="admin-table mr-table"><caption className="sr-only">Their classes</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Time</th><th scope="col">Class</th><th scope="col">Room · instructor</th></tr></thead>
          <tbody>{cl.map((s, i) => <tr key={i}><td>{s.day}</td><td className="mono">{s.startTime}–{s.endTime}</td><td>{s.course}{s.level ? " · " + s.level : ""}</td><td>{[s.room, s.instructor].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody>
        </table>}
    </div>;
  }
  return null;
}

/* One member's card history, inside their record.
 *
 * The same block the ID cards section shows, so there is one rendering of
 * "their card is / is not the current design" rather than two that can come to
 * disagree. Collapsed by default and fetched on open: the drawer already makes
 * two reads, and most visits to it are not about a card. */
function MemberCardHistorySection({ memberId }) {
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!open || d || err) return;
    NGGApi.admin.registration.cardHistory(memberId, "member")
      .then(setD).catch(e => setErr(e.code || e.message || "load_failed"));
  }, [open, memberId, d, err]);
  return (
    <div className="admin-detail-section">
      <div className="admin-detail-h">ID card</div>
      {!open
        ? <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}
            aria-expanded="false">Show their card history</button>
        : err ? <ErrorState title="Couldn't read the card history" code={err} onRetry={() => { setErr(""); setD(null); }}/>
        : !d ? <div className="dash-spinner"/>
        : <AdminCardHistory data={d}/>}
    </div>
  );
}

// ============================================================================
// Applications — review teen/mentor applications, convert to members
// ============================================================================

// One labelled row in the applicant/volunteer detail grid. Renders "—" for any
// empty value so the layout stays structured even with sparse data.
function DetailRow({ label, children }) {
  const empty = children === null || children === undefined || children === "" || (Array.isArray(children) && children.length === 0);
  return (
    <div className="admin-detail-row">
      <div className="admin-detail-key mono">{label}</div>
      <div className="admin-detail-val">{empty ? "—" : children}</div>
    </div>
  );
}

// Full, readable breakdown of everything an application/volunteer submitted —
// the structured intake data that the one-line summary can't surface.
function ApplicantDetail({ a }) {
  const fullName = [a.firstName, a.otherName, a.lastName].filter(Boolean).join(" ") || a.name || "";
  const age = (a.dobAge != null && a.dobAge >= 0) ? a.dobAge : (a.age || null);
  const dobLine = a.dob ? (a.dob + (age != null ? " · age " + age : "")) : (age != null ? "age " + age : "");
  return (
    <div className="admin-detail">
      {a.photoUrl ? <img className="admin-detail-photo" src={a.photoUrl} alt="" onError={e => { e.target.style.display = "none"; }}/> : null}
      <DetailRow label="Reference">{a.ref ? <span className="mono">{a.ref}</span> : null}</DetailRow>
      <DetailRow label="Full name">{fullName}</DetailRow>
      {(a.firstName || a.lastName) ? <DetailRow label="Name parts">{"First: " + (a.firstName || "—") + "  ·  Other: " + (a.otherName || "—") + "  ·  Last: " + (a.lastName || "—")}</DetailRow> : null}
      <DetailRow label="Email">{a.email ? <a href={"mailto:" + a.email}>{a.email}</a> : null}</DetailRow>
      <DetailRow label="Phone">{a.phone ? <a href={"tel:" + a.phone}>{a.phone}</a> : null}</DetailRow>
      <DetailRow label="Date of birth">{dobLine}</DetailRow>
      {a.sex ? <DetailRow label="Sex">{a.sex}</DetailRow> : null}
      {a.program ? <DetailRow label="Programme">{a.program}</DetailRow> : null}
      {a.centre ? <DetailRow label="Centre">{a.centre}</DetailRow> : null}
      {a.track ? <DetailRow label="Track">{a.track}</DetailRow> : null}
      {a.role ? <DetailRow label="Role">{a.role}</DetailRow> : null}
      {(a.courses && a.courses.length) ? <DetailRow label="Courses">{a.courses.join(", ")}</DetailRow> : null}
      <DetailRow label="Submitted">{fmtDate(a.createdAt)}</DetailRow>
      <DetailRow label="Reason">{a.why ? <span style={{ whiteSpace: "pre-wrap" }}>{a.why}</span> : null}</DetailRow>
    </div>
  );
}

/* Correct a pending application's data before converting/approving it.
   Mirrors admin.application.update. */
function ApplicationEditor({ a, onSaved, onDelete }) {
  const centreOpts = useCentreOptions();
  const [f, setF] = React.useState({
    name: a.name || "", email: a.email || "", phone: a.phone || "", age: a.age != null ? String(a.age) : "",
    centre: a.centre || "", track: a.track || "", role: a.role || "", faculty: a.faculty || "",
    program: a.program || "", courses: (a.courses || []).join(", "), why: a.why || "", photoUrl: a.photoUrl || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    if (f.name.trim().length < 2) { toast.error("Name needs at least 2 characters."); return; }
    setBusy(true);
    try {
      await NGGApi.admin.applications.update(a.id, { ...f, age: f.age === "" ? 0 : parseInt(f.age, 10) || 0, courses: f.courses.split(",").map(c => c.trim()).filter(Boolean) });
      toast.success("Application saved."); onSaved();
    } catch (e) { toast.error(e.code === "bad_email" ? "That email isn't valid." : e.code === "bad_age" ? "Age looks off." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  const fld = (key, label, opts = {}) => (
    <div style={{ flex: "1 1 170px", minWidth: opts.min || 140 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} type={opts.type || "text"} value={f[key]} onChange={e => set(key, e.target.value)} placeholder={opts.ph || ""}/>
    </div>
  );
  return (
    <div style={{ padding: "14px 2px", display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #eef0f4", marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {fld("name", "Full name", { min: 200 })}
        {fld("email", "Email", { type: "email", min: 200 })}
        {fld("phone", "Phone")}
        {fld("age", "Age", { type: "number" })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 180px", minWidth: 150 }}><span style={lbl}>Centre</span>
          <select className="admin-input" style={{ width: "100%" }} value={f.centre || ""} onChange={e => set("centre", e.target.value)}>
            <option value="">— select —</option>
            {((f.centre && !centreOpts.includes(f.centre)) ? [f.centre, ...centreOpts] : centreOpts).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {fld("track", "Track")}
        {fld("role", "Role")}
        {fld("faculty", "Faculty")}
        {fld("courses", "Courses (comma-separated)", { min: 200 })}
      </div>
      <div><span style={lbl}>Why / message</span><textarea className="admin-input" rows={2} value={f.why} onChange={e => set("why", e.target.value)} style={{ width: "100%", resize: "vertical" }}/></div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save application"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSaved}>Cancel</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: "#b03535", marginLeft: "auto" }}>Delete application</button>
      </div>
    </div>
  );
}

function AdminApplications() {
  const [list, setList] = React.useState(null);
  const [filter, setFilter] = React.useState({ kind: "", status: "" });
  const [err, setErr] = React.useState("");
  const [sel, setSel] = React.useState(() => new Set());
  const [expanded, setExpanded] = React.useState(() => new Set());
  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const load = () => NGGApi.admin.applications.list(filter).then(r => { setList(r.applications || []); setErr(""); setSel(new Set()); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.kind, filter.status]);
  const setStatus = async (id, status) => { try { await NGGApi.admin.applications.status(id, status); load(); } catch (e) { toast.error(e.code || e.message); } };
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = list && list.length > 0 && sel.size === list.length;
  const toggleAll = () => setSel(allSelected ? new Set() : new Set((list || []).map(a => a.id)));
  // Bulk status change — one confirm, then apply to every selected row and
  // report how many succeeded. Beats changing dozens of rows one at a time.
  const bulkStatus = async (status) => {
    if (!sel.size || bulkBusy) return;
    const ids = Array.from(sel);
    const ok = await dialog.confirm({ title: "Set " + ids.length + " to " + status + "?", body: "Applies the “" + status + "” status to every selected application.", cta: "Apply to " + ids.length, danger: status === "rejected" });
    if (!ok) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map(id => NGGApi.admin.applications.status(id, status)));
    const failed = results.filter(r => r.status === "rejected").length;
    setBulkBusy(false);
    if (failed) toast.error(failed + " of " + ids.length + " couldn't be updated."); else toast.success(ids.length + " applications updated.");
    load();
  };
  const convert = async (id) => {
    const ok = await dialog.confirm({ title: "Convert to member?", body: "This creates an active member account from this application.", cta: "Create member" });
    if (!ok) return;
    try { const r = await NGGApi.admin.applications.convert(id); toast.success("Member created: " + r.memberId); load(); } catch (e) { toast.error(e.code || e.message); }
  };
  const [editId, setEditId] = React.useState(0);
  const [zoomUrl, setZoomUrl] = React.useState("");
  const removeApp = async (a) => {
    if (!(await dialog.confirm({ title: "Delete this application?", body: "Permanently removes " + a.name + "'s application. Use this for spam, duplicates or test entries. This can't be undone.", cta: "Delete", danger: true }))) return;
    try { await NGGApi.admin.applications.remove(a.id); toast.success("Application deleted."); setEditId(0); load(); } catch (e) { toast.error(e.code || e.message); }
  };
  return (
    <div className="admin-section">
      {zoomUrl && <ImageLightbox url={zoomUrl} alt="Applicant photo" onClose={() => setZoomUrl("")}/>}
      <div className="admin-section-head">
        <h2 className="admin-h2">Applications</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" disabled={!list || !list.length} onClick={() => downloadCsv("applications", (list || []).map(a => ({ kind: a.kind, program: a.program || "", name: a.name, email: a.email, age: a.age || "", centre: a.centre || "", track: a.track || "", role: a.role || "", status: a.status, createdAt: a.createdAt })))}>Export CSV</button>
        </div>
      </div>
      <div className="admin-filters">
        <select className="admin-select" value={filter.kind} onChange={e => setFilter(f => ({ ...f, kind: e.target.value }))}><option value="">All kinds</option><option value="teen">Teen</option><option value="mentor">Mentor</option></select>
        <select className="admin-select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}><option value="">All statuses</option><option value="new">New</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="waitlist">Waitlist</option></select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No applications.</div> :
        <React.Fragment>
        <div className="admin-bulkbar">
          <label className="admin-bulk-all"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all applications"/> <span>{sel.size ? sel.size + " selected" : "Select all"}</span></label>
          {sel.size > 0 && (
            <div className="admin-bulk-actions">
              <span className="mono admin-bulk-label">Set status:</span>
              {["reviewing", "accepted", "waitlist", "rejected"].map(s => (
                <button key={s} className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => bulkStatus(s)}>{s}</button>
              ))}
              <button className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => setSel(new Set())}>Clear</button>
            </div>
          )}
        </div>
        <div className="admin-app-list">
          {list.map(a => (
            <div className={"admin-app" + (sel.has(a.id) ? " is-selected" : "")} key={a.id}>
              <div className="admin-app-top">
                <div style={{display:"flex", gap:12, alignItems:"center"}}>
                  <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={"Select " + a.name} style={{flex:"0 0 auto", width:18, height:18}}/>
                  {a.photoUrl && <img src={a.photoUrl} alt="" title="View photo" onClick={() => setZoomUrl(a.photoUrl)} style={{width:40, height:40, borderRadius:"50%", objectFit:"cover", flex:"0 0 auto", cursor:"zoom-in"}} onError={e => { e.target.style.display = "none"; }}/>}
                  <div>
                    <div className="admin-cell-name">{a.name} <span className="chip">{a.kind}</span>{a.program ? <span className={"chip " + (a.program === "summer" ? "chip-gold" : "chip-navy")}>{a.program}</span> : null}</div>
                    <div className="mono admin-cell-sub">{a.email}{a.age ? " · age " + a.age : ""}{a.centre ? " · " + a.centre : ""}{a.track ? " · " + a.track : ""}{a.role ? " · " + a.role : ""} · {fmtDate(a.createdAt)}</div>
                  </div>
                </div>
                <span className={"chip status-" + (a.status === "accepted" ? "published" : a.status === "rejected" ? "archived" : "draft")}>{a.status}</span>
              </div>
              {!expanded.has(a.id) && a.why && <p className="admin-app-why">{a.why}</p>}
              {expanded.has(a.id) && <ApplicantDetail a={a}/>}
              {editId === a.id && <ApplicationEditor a={a} onSaved={() => { setEditId(0); load(); }} onDelete={() => removeApp(a)}/>}
              <div className="admin-app-actions">
                <button className="btn btn-ghost btn-sm" aria-expanded={expanded.has(a.id)} onClick={() => toggleExpand(a.id)}>{expanded.has(a.id) ? "Hide details ▴" : "View details ▾"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(editId === a.id ? 0 : a.id)}>{editId === a.id ? "Close editor" : "Edit"}</button>
                <select className="admin-select admin-app-status" value={a.status} onChange={e => setStatus(a.id, e.target.value)}>
                  <option value="new">New</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="waitlist">Waitlist</option>
                </select>
                {a.kind === "teen" && a.status !== "accepted" && <button className="btn btn-primary btn-sm" onClick={() => convert(a.id)}>Convert to member →</button>}
              </div>
            </div>
          ))}
        </div>
        </React.Fragment>
      }
    </div>
  );
}

// ============================================================================
// Volunteers — review desk + approved roster + safeguarding
// ============================================================================

/* Public status pages manager — publish/unpublish each board (/s-status,
   /v-status) and edit its editorial copy. Backed by the `status_pages` setting;
   the public boards read this live. */
const STATUS_BOARDS = [
  { key: "attendance", name: "Summer School attendance", route: "/s-status", accent: "#16a34a", desc: "Live per-centre attendance & participation — PII-free aggregates." },
  { key: "volunteer", name: "Volunteer status", route: "/v-status", accent: "#5a3fb0", desc: "Live volunteer needs vs filled, by centre / role / faculty / course." },
];
const STATUS_FIELDS = [
  ["title", "Headline title", "input", "The big hero heading."],
  ["tagline", "Sub-line", "input", "The line under the heading."],
  ["transparencyTitle", "Transparency heading", "input", ""],
  ["transparencyBody", "Transparency body", "textarea", "The privacy/safeguarding explainer."],
  ["ctaLabel", "Button label", "input", ""],
  ["ctaPage", "Button target page", "input", "A page id, e.g. join, volunteer, home."],
];
const STATUS_SECTION_LABELS = { kpis: "KPI tiles", centres: "Per-centre cards", trend: "Trend chart", transparency: "Transparency section", cta: "Call-to-action buttons" };
const STATUS_KPI_LABELS = { centres: "Centres", enrolled: "Students enrolled", registered: "Registered (all-time)", consentVerified: "Consent complete", consentPending: "Awaiting parent", capacity: "Capacity", capacityFill: "Capacity filled", presentToday: "Present today", attendanceRate: "Attendance rate", activeVolunteers: "Active volunteers", starsThisWeek: "Stars this week", totalVolunteers: "Total volunteers", totalNeed: "Total need", totalFilled: "Slots filled", totalGap: "Open slots" };
function StatusGroup({ label, children }) {
  return <div style={{ marginTop: 16 }}>
    <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>{label}</div>
    {children}
  </div>;
}
/* ── Dues & fees ──────────────────────────────────────────────────────────────
 * Three admin-defined amounts and one ledger. A member's account is the sum of
 * its entries, never a stored total, so "how did it get to that?" always has an
 * answer on the screen.
 *
 * Two things this screen is deliberately careful about:
 *
 * The TRAINING FEE microcopy. One quiet line under the figure, no emphasis, no
 * exclamation. It has to be true for the family who leaves early as well as the
 * one who finishes — they will owe the balance — so it states the condition
 * rather than promising the outcome. A page that shouted about a full refund
 * would have promised something the terms do not.
 *
 * The ARREARS list is sorted by what is PAYABLE, not by what is charged. A
 * member mid-service carries a large training charge that is on course to be
 * written off; ranking by the charge would put them at the top of a call list
 * they do not belong on.
 */
const FEE_KIND_LABEL = {
  membership: "Membership fee", dues: "Monthly dues", training: "Training fee",
  fine: "Fine", adjustment: "Adjustment",
  payment: "Payment received", writeoff: "Written off", waiver: "Waived",
};
/* The settings an uprate can move, by the name they carry on the form — so the
   confirm dialog names the field an admin just read rather than its key. */
const FEE_SETTING_LABEL = {
  membershipFee: "Membership fee", monthlyDues: "Monthly dues", trainingFee: "Training fee",
};
/* Why a fine was issued. Mirrors FEES_FINE_REASONS on the server; the server
   validates, this only names them. A dropdown rather than free text because a
   fine is the charge a family disputes, and "late three times in August" is
   answerable where "misconduct" is not. */
const FEE_FINE_REASONS = [
  ["late", "Late arrival"],
  ["absent", "Missed a session without notice"],
  ["equipment", "Equipment lost or damaged"],
  ["conduct", "Conduct"],
  ["other", "Other (say why)"],
];
/* The server's refusals, in words. A money screen that prints `note_required`
   at somebody has told them nothing. */
const ENTRY_ERROR = {
  bad_amount: "Enter an amount above zero.",
  bad_reason: "Choose why this fine is being issued.",
  note_required: "Say why — this one needs a written reason.",
  reason_required: "Say why this is being waived. It stays on the account.",
  nothing_outstanding: "There is nothing outstanding to waive.",
  bad_kind: "That is not something this screen can post.",
};
const ENTRY_TITLE = {
  payment: "Record a payment", fine: "Issue a fine",
  adjustment: "Adjust the account", waiver: "Waive what is owed",
};
/* `naira` is defined once further down this module and shared — these files
   concatenate into one scope, so a second copy is a build error, not a local. */

/**
 * The panel both fee dialogs sit in.
 *
 * WHY THIS EXISTS. Both of them were written against `<Modal>`, and there is no
 * `Modal` in this bundle — never has been. So opening an account from the fees
 * screen threw `Modal is not defined` and blanked the whole pane, and nothing
 * caught it because no test had ever clicked "Open →". It is the drawer idiom
 * every other admin panel uses, with the escape key, the focus trap and the
 * click-outside that come with `useAdminDrawer`.
 */
function FeeModal({ title, onClose, children }) {
  const { panelRef, close, titleProps, headingProps } = useAdminDrawer(onClose, false);
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel admin-drawer-wide">
        <div className="admin-drawer-head">
          <h3 {...headingProps}>{title}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div style={{ padding: "16px 20px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * One form for every money entry.
 *
 * Payment, fine, adjustment and waiver differ only in which fields they need, so
 * they share a component: an amount, and then whatever makes the entry
 * answerable six months later. The alternative — a prompt per action — is what
 * was here, and it could not carry a bank reference or a reason at all.
 */
function FeeEntryForm({ kind, account, busy, onCancel, onSubmit }) {
  const [f, setF] = React.useState({
    kind, amount: "", method: "cash", reference: "", note: "",
    reason: kind === "fine" ? FEE_FINE_REASONS[0][0] : "",
  });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const isPay = kind === "payment", isFine = kind === "fine", isWaive = kind === "waiver";
  const owed = account.balance.outstanding;
  return (
    <FeeModal onClose={onCancel} title={ENTRY_TITLE[kind] + " — " + account.fullName}>
      <div data-fee-entry={kind}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>
            Amount
          </span>
          <input className="admin-input" type="number" min="1" autoFocus value={f.amount}
            onChange={e => set("amount", e.target.value)} style={{ maxWidth: 200, display: "block", marginTop: 6 }}/>
          {/* What is actually owed, next to the box, so a waiver is typed against
              a figure rather than from memory. */}
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5 }}>
            {naira(owed)} outstanding{isWaive && owed > 0 ? " — more than this is capped to it" : ""}.
          </div>
        </label>
        {isPay && (
          <div style={{ display: "grid", gridTemplateColumns: "var(--rs-gcolumns-16, 1fr 1fr)", gap: 12, marginBottom: 12 }}>
            <label>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>How it came</span>
              <select className="admin-input" value={f.method} onChange={e => set("method", e.target.value)} style={{ marginTop: 6 }}>
                <option value="cash">Cash</option>
                <option value="transfer">Bank transfer</option>
                <option value="pos">POS</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Reference</span>
              <input className="admin-input" value={f.reference} placeholder="TRF-… or receipt no."
                onChange={e => set("reference", e.target.value)} style={{ marginTop: 6 }}/>
            </label>
          </div>
        )}
        {isFine && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Why</span>
            <select className="admin-input" value={f.reason} onChange={e => set("reason", e.target.value)} style={{ marginTop: 6 }}>
              {FEE_FINE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: "block", marginBottom: 14 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>
            {isWaive ? "Why it is being waived" : "Note"}
            {(isWaive || kind === "adjustment" || (isFine && f.reason === "other")) && " · required"}
          </span>
          <textarea className="admin-input" rows={2} value={f.note} onChange={e => set("note", e.target.value)}
            placeholder={isWaive ? "Hard month at home — agreed with the coordinator" : ""}
            style={{ display: "block", marginTop: 6, width: "100%", resize: "vertical" }}/>
          {isWaive && (
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5, lineHeight: 1.5 }}>
              {/* The distinction that keeps the ledger honest, said where the
                  choice is made rather than in a document nobody opens. */}
              A waiver keeps the charge and records that you are not asking for it.
              Voiding says it should never have existed — that is a different thing.
            </div>
          )}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSubmit(f)}>
            {busy ? "Saving…" : ENTRY_TITLE[kind]}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </FeeModal>
  );
}

/* ── Upload fines: a sheet of fines, matched to members, checked first ──────
   The server decides every match and says how it made it (printed ID, member
   number, email, name); this screen shows that before anybody is charged, and
   Upload writes exactly what was checked. See admin_fees_fine_import. */
const FINES_CSV_TEMPLATE = "member,name,email,amount,reason,date,note\n"
  + "026-014,,,2000,late,2026-10-04,\n"
  + ",Ada Okafor,okafor.family@example.com,5000,conduct,04/10/2026,Fighting during break\n";
const FINE_COLS = {
  member: ["member", "memberid", "member id", "id", "displayid", "display id", "member no", "member number", "card", "card number"],
  name: ["name", "fullname", "full name", "member name"],
  email: ["email", "e-mail", "email address", "parent email"],
  amount: ["amount", "fine", "fines", "fine (₦)", "fine (n)", "outstanding fine", "outstanding", "naira", "amount (₦)", "amount (n)"],
  reason: ["reason", "offence", "offense", "why", "type"],
  date: ["date", "day", "on"],
  note: ["note", "notes", "comment", "comments", "details", "remark", "remarks"],
};
function finesRowFromSheet(r) {
  const out = {};
  const keys = Object.keys(r);
  Object.entries(FINE_COLS).forEach(([field, names]) => {
    const k = keys.find(x => names.includes(String(x).trim().toLowerCase().replace(/_/g, " ")));
    if (k !== undefined) out[field] = String(r[k] == null ? "" : r[k]).trim();
  });
  // An Excel date cell arrives as a day count from 1899-12-30.
  if (/^\d{5}(\.\d+)?$/.test(out.date || "")) out.date = new Date(Date.UTC(1899, 11, 30) + Math.floor(+out.date) * 86400000).toISOString().slice(0, 10);
  return out;
}
const FINE_ERRORS = {
  ambiguous: "more than one member matches", no_match: "no member matches", member_required: "no member given",
  not_ngg_member: "not an NGG member", out_of_scope: "outside your centres", bad_amount: "amount unreadable",
  reason_required: "no reason", note_required: "say why", bad_date: "date unreadable", duplicate_in_file: "repeated in this file",
  post_failed: "could not be posted", no_amount: "no fine on this row",
};
const FINE_MATCHED = { id: "ID", email: "email", "email+name": "email + name", name: "name only", name_any: "name, words reordered" };
function FinesUpload({ onDone }) {
  const [rows, setRows] = React.useState(null);
  const [name, setName] = React.useState("");
  const [plan, setPlan] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [reason, setReason] = React.useState("");
  const read = async (file) => {
    if (!file) return;
    setErr(""); setPlan(null);
    try {
      const raw = await readSheetFile(file);
      const out = raw.map(finesRowFromSheet).filter(r => Object.values(r).some(v => v !== ""));
      if (!out.length) throw new Error("No fines found in that file.");
      if (!out.some(r => r.member || r.name || r.email)) throw new Error("That sheet has no column for who is being fined. Name a column “Name”, “Member ID” or “Email”.");
      if (!out.some(r => r.amount)) throw new Error("That sheet has no column for the amount. Name a column “Fine” or “Amount”.");
      setRows(out); setName(file.name);
    } catch (e) { setRows(null); setErr(e.message || "Couldn't read that file."); }
  };
  // The reason typed once, for every row whose sheet gave none. Sent with the
  // rows, so it is part of what is checked and of the digest that is applied.
  const sent = () => (rows || []).map(r => (r.reason || !reason.trim()) ? r : { ...r, reason: reason.trim() });
  const noReason = (rows || []).filter(r => !r.reason).length;
  const check = async () => {
    setBusy("check");
    try { setPlan(await NGGApi.admin.fees.fineImport(sent(), { dryRun: true })); }
    catch (e) { toast.error(e.code === "too_many" ? "That is more than " + (e.max || 500) + " fines — split the file." : humanizeError(e.code, e.code)); }
    finally { setBusy(""); }
  };
  const apply = async () => {
    const t = plan.tally;   // read before the confirm, so what is agreed is what runs
    if (!(await dialog.confirm({ title: "Post " + t.fine + " fine" + (t.fine === 1 ? "" : "s") + " — " + naira(t.total) + "?",
      body: t.fine + " to post · " + t.already + " already on the ledger · " + (t.skipped || 0) + " with no fine · " + t.failed + " refused (not posted). Each fine lands on the member's account and in their next reminder.", cta: "Post fines" }))) return;
    setBusy("apply");
    try {
      const r = await NGGApi.admin.fees.fineImport(sent(), { digest: plan.digest });
      setPlan(r);
      if (r.tally.failed) toast.info(r.tally.fine + " posted · " + r.tally.failed + " refused.", "Fines partly posted");
      else toast.success(r.tally.fine + " fine" + (r.tally.fine === 1 ? "" : "s") + " posted · " + naira(r.tally.total) + ".", "Fines posted");
      if (onDone) onDone();
    } catch (e) { toast.error(e.code === "import_changed" ? "The file changed since it was checked — check it again." : humanizeError(e.code, e.code)); }
    finally { setBusy(""); }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([FINES_CSV_TEMPLATE], { type: "text/csv" }));
    a.download = "ngg-fines-template.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="fine-imp">
      <p className="admin-hint">Upload a sheet of fines — an Excel workbook (.xlsx) or a CSV from Excel or Google Sheets. Columns are recognised by their heading (Name, Member ID, Email, Fine or Amount, Reason, Date, Note); any other column is ignored, and a row whose fine is empty or “Null” is skipped. Name each member by their printed ID or member number where you can; an email or a name also works, but only when it points at exactly one member — siblings sharing a parent's email, or two members with one name, are refused and named so you can fix the row. Reasons: late, absent, equipment, conduct, or anything else (kept as the written reason). Uploading the same sheet twice fines nobody twice. Nothing is posted until you have checked the file and pressed Post fines.</p>
      <div className="cur-ed-row">
        <label className="btn btn-ghost btn-sm">Choose a file
          <input type="file" className="sr-only" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { read(e.target.files && e.target.files[0]); e.target.value = ""; }}/></label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={download}>Download the CSV template</button>
        {name && <span className="admin-cell-sub">{name} · {rows ? rows.length : 0} row{rows && rows.length === 1 ? "" : "s"}</span>}
        {rows && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={check}>{busy === "check" ? "Checking…" : "Check the file"}</button>}
      </div>
      {err && <p className="admin-form-err" role="alert">{err}</p>}
      {rows && noReason > 0 && (
        <label className="fine-imp-reason"><span>Reason for the {noReason} row{noReason === 1 ? "" : "s"} that give none</span>
          <input className="admin-input" value={reason} onChange={e => { setReason(e.target.value); setPlan(null); }}
            placeholder="e.g. late, absent, conduct — or words such as “Outstanding fine, term 1”"/></label>
      )}
      {plan && (
        <div className="fine-imp-plan">
          <p className="fine-imp-tally" aria-live="polite">
            <b>{plan.tally.fine}</b> to post ({naira(plan.tally.total)}) · <b>{plan.tally.already}</b> already posted · <b>{plan.tally.skipped || 0}</b> with no fine · <b>{plan.tally.failed}</b> refused{plan.dryRun ? " — nothing posted yet." : " — posted."}
          </p>
          {plan.dryRun && plan.tally.fine > 0 && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={apply}>{busy === "apply" ? "Posting…" : "Post fines"}</button>}
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th scope="col" className="admin-num">Row</th><th scope="col">Member</th><th scope="col">Matched by</th><th scope="col" className="admin-num">Amount</th><th scope="col">Reason</th><th scope="col">Result</th></tr></thead>
            <tbody>{plan.rows.map(r => (
              <tr key={r.row}>
                <td className="admin-num">{r.row}</td>
                <td>{r.fullName ? <>{r.fullName}<div className="admin-cell-sub">{r.displayId || r.memberId}</div></> : "—"}
                  {r.candidates && r.candidates.length > 0 && <div className="admin-cell-sub">Could be: {r.candidates.map(c => c.fullName + " (" + (c.displayId || c.memberId) + ")").join(", ")}</div>}</td>
                <td className="admin-cell-sub">{r.matchedBy ? <span className={r.matchedBy === "name" || r.matchedBy === "name_any" ? "fine-imp-weak" : ""}>{FINE_MATCHED[r.matchedBy] || r.matchedBy}</span> : ""}</td>
                <td className="admin-num">{r.amount ? naira(r.amount) : ""}</td>
                <td className="admin-cell-sub">{r.reasonLabel ? r.reasonLabel + (r.date ? " · " + r.date : "") + (r.note ? " — " + r.note : "") : ""}</td>
                <td>{r.verdict === "skipped" ? <span className="chip">skipped: no fine</span> : r.verdict === "failed" ? <span className="chip status-archived" title={r.detail}>refused: {FINE_ERRORS[r.error] || String(r.error).replace(/_/g, " ")}</span>
                  : <span className={"chip " + (r.verdict === "fine" ? "chip-lime" : "")}>{r.verdict === "fine" ? (plan.dryRun ? "to post" : "posted") : "already posted"}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

/* ── Training fees across the programme ──────────────────────────────────────
 *
 * The member watches their training fee being earned off; this is the same
 * watch for the desk, for everybody at once: what has been charged, how much
 * service has covered, what is left, and whose credit is paused or stopped.
 * Opening a row shows that member's whole schedule in the account drawer.
 * Filters and sort are names the server allow-lists, and the list is scoped to
 * the operator's centres.
 */
const FEE_TRAIN_FILTERS = [["all", "Everybody"], ["training", "In training"], ["service", "Serving"], ["complete", "Complete"], ["paused", "Credit paused"], ["stopped", "Credit stopped"], ["nojoin", "No join date"]];
const FEE_TRAIN_SORTS = [["charged", "Most charged"], ["remaining", "Most still to cover"], ["earned", "Most earned off"], ["month", "Furthest in"], ["name", "Name"]];
function FeeTrainingWatch({ onOpen }) {
  const [f, setF] = React.useState({ filter: "all", sort: "charged", q: "" });
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => { setErr(""); return NGGApi.admin.fees.training(f).then(setD).catch(e => { setD(null); setErr(e.code || e.message); }); }, [f]);
  React.useEffect(() => { setD(null); load(); }, [load]);
  const c = (d && d.counts) || {};
  const t = (d && d.totals) || {};
  return (
    <div>
      <div className="fee-train-filters" role="group" aria-label="Filter the training fees">
        {FEE_TRAIN_FILTERS.map(([k, l]) => (
          <button key={k} className={"btn btn-sm " + (f.filter === k ? "btn-primary" : "btn-ghost")} aria-pressed={f.filter === k}
            onClick={() => setF(o => ({ ...o, filter: k }))}>{l}{c[k] ? " (" + c[k] + ")" : ""}</button>
        ))}
        <select className="admin-select" aria-label="Sort by" value={f.sort} onChange={e => setF(o => ({ ...o, sort: e.target.value }))}>
          {FEE_TRAIN_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <form role="search" onSubmit={e => { e.preventDefault(); setF(o => ({ ...o, q: q.trim() })); }}>
          <input className="admin-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, ID or centre" aria-label="Search the training fees"/>
        </form>
      </div>
      {err ? <ErrorState title="Couldn't load the training fees" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner" role="status" aria-label="Loading"/> :
        <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="fee-train-sum" role="status">
            <b>{fmtNum(t.members || 0)}</b> member{t.members === 1 ? "" : "s"} shown · <b>{naira(t.charged || 0)}</b> charged as training
            {" "}· <b>{naira((t.earned || 0) + (t.writtenOff || 0))}</b> covered by service ({naira(t.earned || 0)} earned, {naira(t.writtenOff || 0)} written off)
            {" "}· <b>{naira(t.remaining || 0)}</b> still to cover.
            {" "}Charged at {naira(d.perUnit)} per {d.basis === "day" ? "programme day" : d.basis}, for the first {d.trainingMonths} months; covered over the {d.serviceMonths} months of service.
            {d.scoped && " Your centres only."}
            {d.truncated && <> Showing the first {d.rows.length} of {d.matched}.</>}
          </div>
          {!d.rows.length ? <div className="admin-empty">Nobody here{f.filter !== "all" ? " for that filter" : ""}{f.q ? " matching “" + f.q + "”" : ""}.</div> :
          <div className="admin-table-wrap"><table className="admin-table">
            <caption className="sr-only">Training fee by member</caption>
            <thead><tr><th scope="col">Member</th><th scope="col">Where they are</th><th scope="col">Charged</th><th scope="col">Covered</th><th scope="col">Still to cover</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{d.rows.map(r => (
              <tr key={r.memberId}>
                <td><b>{r.fullName}</b><div className="admin-cell-sub">{r.displayId || r.memberId} · {r.centre || "—"}</div></td>
                <td>{r.phase === "unknown" ? "No join date" : <>Month {r.months} · {r.phase}{r.phase === "service" ? " · " + r.servedMonths + " served" : ""}</>}
                  {r.mouAt && <div className="admin-cell-sub">MOU done</div>}
                  {r.creditStopped && <div className="admin-cell-sub">Credit stopped {fmtDate(r.creditPausedAt)}</div>}
                  {!r.creditStopped && r.creditPausedAt && <div className="admin-cell-sub">Credit paused from {fmtDate(r.creditPausedAt)}</div>}</td>
                <td className="mono">{naira(r.charged)}<div className="admin-cell-sub">{r.units} charge{r.units === 1 ? "" : "s"}</div></td>
                <td className="mono">{naira(r.covered)} <span className="admin-cell-sub">({r.coveredPct}%)</span>
                  <div className="fee-train-bar" aria-hidden="true"><span style={{ width: r.coveredPct + "%" }}/></div></td>
                <td className="mono">{r.remaining > 0 ? naira(r.remaining) : "—"}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => onOpen(r.memberId)} aria-label={"Open " + r.fullName + "'s account"}>Open →</button></td>
              </tr>
            ))}</tbody>
          </table></div>}
        </div>}
    </div>
  );
}

function AdminFees() {
  const [tab, setTab] = React.useState("arrears");   // arrears | settings
  const [cfg, setCfg] = React.useState(null);
  const [orig, setOrig] = React.useState("");
  /* `bounds` comes from the server with the settings — every maximum this form
     enforces and every number it states. Nothing here keeps its own copy: a
     floor written twice is a floor that disagrees with itself the day one of the
     two changes, and the admin is the one who finds out. */
  const [meta, setMeta] = React.useState({ defaults: {}, bounds: null });
  const [arr, setArr] = React.useState(null);
  const [acct, setAcct] = React.useState(null);
  /* The preview is loaded and shown BEFORE the send, always. Sixty messages to
     sixty guardians cannot be recalled, so "who, and how many" is a question
     that gets answered first rather than discovered afterwards. */
  const [prev, setPrev] = React.useState(null);
  /* Same rule for the uprate: what it WOULD do, field by field, before anybody
     presses anything. A price rise applied sight-unseen is the version of this
     feature that gets switched off again a week later. */
  const [up, setUp] = React.useState(null);
  /* Finding somebody who does NOT owe. The arrears list was the only door into
     an account, so a paid-up member was unreachable and "has Ada paid?" could
     not be answered on the screen that exists to answer it. */
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState(null);
  /* One form for every money entry — payment, fine, adjustment, waiver. A
     `window.prompt` for the amount could not carry a method, a reference or a
     reason, which is most of what makes an entry answerable later. */
  const [entry, setEntry] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  /* The server's bounds, under a short name because every number on this screen
     comes through here. Empty until the settings land; the render waits for it
     rather than guessing, since a form that guesses its own maximum is the
     hardcoded copy this is meant to remove. */
  const B = meta.bounds || {};

  const loadCfg = () => NGGApi.admin.fees.settings()
    .then(r => { setCfg(r.fees); setOrig(JSON.stringify(r.fees)); setMeta({ defaults: r.defaults || {}, bounds: r.bounds || null }); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  const loadArr = () => NGGApi.admin.fees.arrears()
    .then(setArr).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { loadCfg(); loadArr(); loadUprate(); }, []);

  const dirty = cfg && orig && JSON.stringify(cfg) !== orig;
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.fees.settingsSet(cfg); setCfg(r.fees); setOrig(JSON.stringify(r.fees));
          /* Said out loud when the server floors it, rather than silently
             showing a different number than was typed. */
          if (r.fees.remindEveryDays !== cfg.remindEveryDays) toast.success("Saved — reminder spacing raised to the " + r.fees.remindEveryDays + "-day minimum.");
          else toast.success("Saved."); }
    catch (e) { toast.error(e.code === "training_rate_required" ? (e.detail || "Changing what the training fee is charged per needs a new amount for it.") : (e.code || e.message)); } finally { setBusy(false); }
  };
  const openAcct = (memberId) => NGGApi.admin.fees.member(memberId)
    .then(r => setAcct(r.account)).catch(e => toast.error(e.code || e.message));
  const refreshAcct = () => acct && openAcct(acct.memberId);

  const doLookup = async (term) => {
    const t = (term === undefined ? q : term).trim();
    if (t.length < 2) { setFound(null); return; }
    try { const r = await NGGApi.admin.fees.lookup(t); setFound(r); }
    catch (e) { toast.error(e.code || e.message); }
  };
  /* Submits whatever kind of entry the form was opened for. One path, because
     every one of them is "an amount, a reason, and who did it" — and a second
     code path is where the audit line goes missing. */
  const submitEntry = async (f) => {
    const amount = parseInt(f.amount, 10) || 0;
    if (amount <= 0) { toast.error("Enter an amount."); return; }
    setBusy(true);
    try {
      if (f.kind === "payment") {
        await NGGApi.admin.fees.payment(acct.memberId, amount, f.method, f.reference, f.note);
        toast.success(naira(amount) + " recorded.");
      } else if (f.kind === "waiver") {
        const r = await NGGApi.admin.fees.waive(acct.memberId, amount, f.note);
        /* Said out loud when less was waived than was typed — otherwise somebody
           wonders why the balance did not reach zero. */
        toast.success(naira(r.waived) + " waived." + (r.clamped ? " That was all that was outstanding." : ""));
      } else {
        const r = await NGGApi.admin.fees.charge(acct.memberId, f.kind, amount, f.reason, f.note);
        toast.success(naira(amount) + " charged.");
        if (r.overCap) toast.error("This account is now past the ceiling. Nothing further will accrue automatically.");
      }
      setEntry(null); refreshAcct(); loadArr(); if (found) doLookup();
    } catch (e) {
      toast.error(ENTRY_ERROR[e.code] || e.code || e.message);
    } finally { setBusy(false); }
  };
  const voidEntry = async (e) => {
    const reason = await dialog.prompt({
      title: "Void this entry?",
      body: "Voiding says the entry should never have existed. If the charge was real and you are choosing not to ask for it, waive it instead — that keeps the reason on the account.",
      label: "Why is this being voided?", placeholder: "Charged twice", cta: "Void it",
    });
    if (!reason) return;
    try { await NGGApi.admin.fees.void(e.entryId, reason); toast.success("Voided."); refreshAcct(); loadArr(); }
    catch (x) { toast.error(x.code || x.message); }
  };
  const completeMou = async () => {
    if (!(await dialog.confirm({ title: "Mark the MOU accomplished?",
      body: "This writes off whatever is left of the training fee and records the date. It cannot be undone from here.",
      cta: "Mark accomplished" }))) return;
    try { const r = await NGGApi.admin.fees.mou(acct.memberId);
          toast.success(r.writtenOff > 0 ? naira(r.writtenOff) + " of training fee written off." : "Recorded.");
          refreshAcct(); loadArr(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const loadPreview = () => NGGApi.admin.fees.remindPreview()
    .then(r => setPrev(r.preview)).catch(e => toast.error(e.code || e.message));
  const loadUprate = () => NGGApi.admin.fees.upratePreview()
    .then(r => setUp({ ...r.uprate, maxPct: r.maxPct, fields: r.fields || [] }))
    .catch(e => toast.error(e.code || e.message));
  const applyUprate = async () => {
    const ch = (up && up.changes) || {};
    const keys = Object.keys(ch);
    if (!keys.length) return;
    /* The confirm lists every figure, old → new, and says the one thing an admin
       most needs to hear: balances already on accounts do not move. Somebody who
       believes this reprices August will never press it; somebody who believes it
       silently forgives arrears will press it for the wrong reason. */
    if (!(await dialog.confirm({
      title: "Raise the amounts by " + up.pct + "%?",
      body: keys.map(k => (FEE_SETTING_LABEL[k] || k) + ": " + naira(ch[k].from) + " → " + naira(ch[k].to)).join(" · ")
          + ". This changes what is charged from now on. Balances already on accounts are not touched, "
          + "and it cannot be applied again for " + up.everyMonths + " months.",
      cta: "Raise the amounts" }))) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.fees.uprateApply();
      setCfg(r.fees); setOrig(JSON.stringify(r.fees));
      toast.success(Object.keys(r.applied || {}).length + " amount(s) raised by " + r.pct + "%.");
      loadUprate(); loadArr();
    } catch (e) {
      toast.error(e.code === "not_due" ? "Already raised inside the last " + ((up && up.everyMonths) || 12) + " months."
                : (e.code || e.message));
      loadUprate();
    } finally { setBusy(false); }
  };
  const sendReminders = async () => {
    const n = (prev && prev.count) || 0;
    if (!n) return;
    /* The confirm names the NUMBER and the fact that it goes to guardians. A
       bulk send whose size you cannot see is one people press once and regret,
       and these land in the inboxes of families, not colleagues. */
    if (!(await dialog.confirm({
      title: "Send " + n + " reminder" + (n === 1 ? "" : "s") + "?",
      body: "This emails " + n + " guardian" + (n === 1 ? "" : "s") + " about their outstanding balance. "
          + "It cannot be recalled. Nobody will be reminded again for at least "
          + prev.everyDays + " days.",
      cta: "Send " + n }))) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.fees.remindRun(B.remindBatch);
      const res = r.result || {};
      toast.success(res.sent + " sent" + (res.failed ? " · " + res.failed + " could not be delivered" : "") + ".");
      loadPreview(); loadArr();
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const runAccrual = async () => {
    if (!(await dialog.confirm({ title: "Bring charges up to date?",
      body: "Adds any membership fee, monthly dues and session training fees that have not been charged yet. Safe to run twice — it cannot charge the same month twice.",
      cta: "Run" }))) return;
    setBusy(true);
    try { const r = await NGGApi.admin.fees.accrue(B.accrueBatch);
          const a = r.accrued;
          toast.success([a.dues + " dues", a.training + " training", a.membership + " joining"].join(" · ") + " charged across " + a.members + " members.");
          if (a.atCap) toast.error(a.atCap + " account(s) are at the ceiling and were not charged further.");
          loadArr(); refreshAcct(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  if (err) return <div className="admin-empty" style={{ color: "var(--coral)" }}>{err}</div>;
  if (!cfg || !meta.bounds) return <div className="admin-empty">Loading…</div>;

  /* Due AND with something to change: a percentage set against amounts that are
     all zero is not a review anybody needs to be nudged about. */
  const upDue = !!(up && up.enabled && up.due && Object.keys(up.changes || {}).length);

  /* `attrs` defaults to the money bounds because most of these fields ARE money.
     Every one of them comes from the server: the input's own max is the same
     number the save clamps to, so the form cannot offer what the backend will
     silently reduce. */
  const num = (k, label, hint, extra, attrs) => (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>{label}</span>
      <input className="admin-input" type="number" value={cfg[k]} style={{ maxWidth: 220, display: "block", marginTop: 6 }}
        min={(attrs && attrs.min !== undefined) ? attrs.min : 0}
        max={(attrs && attrs.max !== undefined) ? attrs.max : B.amountMax}
        onChange={e => set(k, e.target.value === "" ? 0 : parseInt(e.target.value, 10))}/>
      {hint && <div data-fee-hint="1" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
      {extra}
    </label>
  );

  return (
    <div>
      <div className="admin-filters">
        {[["arrears", "Who owes"], ["training", "Training fees"], ["fines", "Upload fines"], ["reminders", "Reminders"], ["settings", "Amounts"]].map(([k, l]) => (
          <button key={k} className={"btn btn-sm " + (tab === k ? "btn-primary" : "btn-ghost")} onClick={() => setTab(k)}>
            {l}
            {/* A dot on the tab, because an overdue review that is only visible
                once you open the tab is a review nobody performs — nothing tells
                you to look. The ops journal carries the same nudge monthly. */}
            {/* aria-hidden: the dot is decoration beside a label that already
                names the tab, and a `title` on it would otherwise be read out as
                part of the button's name. The nudge beside the tabs says it in
                words for anybody who cannot see a 7px circle. */}
            {k === "settings" && upDue && <span data-uprate-due="1" aria-hidden="true" title="A review of the amounts is due"
              style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginLeft: 6,
                       background: "var(--gold-700,#a07400)", verticalAlign: "middle" }}/>}
          </button>
        ))}
        {upDue && tab !== "settings" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setTab("settings")}
            style={{ color: "var(--gold-700,#a07400)", fontSize: 12 }}>
            Amounts last raised {up.lastAt ? up.monthsSince + " months ago" : "never"} — review due →
          </button>
        )}
        {!cfg.enabled && <span className="mono" style={{ fontSize: 11, color: "var(--gold-700,#a07400)", marginLeft: 8 }}>
          Dues are switched off — nothing is being charged.
        </span>}
        <button className="btn btn-ghost btn-sm" disabled={busy || !cfg.enabled} onClick={runAccrual} style={{ marginLeft: "auto" }}>
          {busy ? "Working…" : "Bring charges up to date"}
        </button>
      </div>

      {tab === "reminders" && (
        <div className="admin-card" style={{ maxWidth: 720 }}>
          {!cfg.remindEnabled || !cfg.enabled ? (
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-600,#3c4460)" }}>
              Reminders are switched off, so nothing is being sent.
              {" "}Turn them on under <b>Amounts</b> to start.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-600,#3c4460)", marginBottom: 14 }}>
                {/* Says what the schedule actually does, because the cron ticking
                    every fifteen minutes is the thing people reasonably fear when
                    they read the word "reminder". */}
                These go out automatically, at most once every <b>{cfg.remindEveryDays} days</b> per family.
                The background job checks far more often than that; the spacing above is what decides,
                so nobody is chased faster than you set it.
                <div style={{ marginTop: 8, color: "var(--ink-500)" }}>
                  A family is only included when they have something <b>payable</b> — a training fee
                  that service is writing off is not money owed, and nobody is chased for it.
                </div>
              </div>
              {!prev
                ? <button className="btn btn-ghost btn-sm" onClick={loadPreview}>See who would be reminded</button>
                : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <b style={{ fontSize: 15 }}>{prev.count} due a reminder now</b>
                    <button className="btn btn-ghost btn-sm" onClick={loadPreview}>Refresh</button>
                    <button className="btn btn-primary btn-sm" disabled={busy || !prev.count} onClick={sendReminders}>
                      {busy ? "Sending…" : "Send " + prev.count}
                    </button>
                  </div>
                  {/* WHY NOT, for everyone else. "It will send 4 of 60" is not a
                      number anybody can check, and "why was I never told" is the
                      question a coordinator actually gets asked. */}
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.7, marginBottom: 14 }}>
                    Not included:{" "}
                    {[[prev.skipped.nothingPayable, "nothing payable"],
                      [prev.skipped.tooSoon, "reminded recently"],
                      [prev.skipped.optedOut, "asked not to be reminded"],
                      [prev.skipped.underMinimum, "under the minimum balance"],
                      [prev.skipped.noContact, "no way to reach the family (no app account, email or phone)"]]
                      .filter(([n]) => n > 0).map(([n, why]) => n + " " + why).join(" · ") || "nobody — everyone with a balance is on the list"}.
                  </div>
                  {prev.count > 0 && (
                    <table className="admin-table">
                      <thead><tr><th>Member</th><th>Payable</th><th>Last reminded</th></tr></thead>
                      <tbody>{prev.due.map(d => (
                        <tr key={d.memberId}>
                          <td><b>{d.fullName}</b><div className="mono an-sub-xs">{d.memberId}</div></td>
                          <td className="mono">{naira(d.payable)}</td>
                          <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                            {d.lastRemindedAt ? String(d.lastRemindedAt).slice(0, 10) : "never"}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="admin-card" style={{ maxWidth: 620 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
            <input type="checkbox" checked={!!cfg.enabled} onChange={e => set("enabled", e.target.checked)}/>
            <b>Charge dues and fees</b>
          </label>
          {num("membershipFee", "Membership fee",
            (cfg.membershipEveryMonths > 0
              ? "Charged on the anniversary of joining, every " + (cfg.membershipEveryMonths === 12 ? "year" : cfg.membershipEveryMonths + " months") + "."
              : "Charged once, when a member joins."))}
          {/* The cycle, not a date. Anniversary-based, so a member who joined in
              November renews in November — billing everyone on 1 January would
              charge a November joiner twice in six weeks. 0 = the old one-off. */}
          {num("membershipEveryMonths", "…how often, in months",
            "12 is yearly. Set 0 to charge it once, on joining, and never again.",
            null, { min: 0, max: 120 })}
          {num("monthlyDues", "Monthly dues", "Charged for each month a member has been active.")}
          {/* What the training fee is PER. On 'day' the figure above is a day
              rate off the meeting calendar in Conduct & fines, not a session
              total — the label changes with it so the number on screen is never
              ambiguous about which it is. */}
          <label style={{ display: "block", marginBottom: 14 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Training fee is charged</span>
            <select className="admin-select" style={{ maxWidth: 260, display: "block", marginTop: 6 }}
              value={cfg.trainingBasis || "total"} onChange={e => set("trainingBasis", e.target.value)}>
              <option value="total">Once, as a fixed total for the place</option>
              <option value="session">Once per session</option>
              <option value="day">For every day the programme meets</option>
              <option value="week">For every week the programme meets</option>
            </select>
            <div data-fee-hint="1" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5, lineHeight: 1.5 }}>
              {cfg.trainingBasis === "day"
                ? "One charge for each meeting day inside a session's dates — using the weekdays, holidays and extra days set in Conduct & fines. A session already charged as a whole is never also charged by the day."
                : cfg.trainingBasis === "week"
                ? "One charge for each week (Monday to Sunday) with at least one meeting day inside a session's dates — the same calendar as by the day. A week already charged by the day is never charged again."
                : cfg.trainingBasis === "session"
                ? "One charge for each training session (TONI, MEDI, DOMI) that started after they joined. Summer School is never charged as a training session."
                : "One charge, the day they start, for the whole training place."}
              {" "}Each member keeps the terms they started on: a change here applies to members who start after it. Changing this needs a new amount below, because the amount means something different on each.
            </div>
          </label>
          {num("trainingFee", cfg.trainingBasis === "day" ? "Training fee, per meeting day" : cfg.trainingBasis === "week" ? "Training fee, per week" : cfg.trainingBasis === "session" ? "Training fee, per session" : "Training fee, for the whole place",
            cfg.trainingBasis === "day"
              ? "Charged for each day the programme meets, while they are in the training half."
              : cfg.trainingBasis === "week"
              ? "Charged for each week the programme meets, while they are in the training half."
              : cfg.trainingBasis === "session"
              ? "Charged for each training session that has started since they joined."
              : "The whole cost of the training place. Earned off by the days they serve; what is not earned off is owed only if they leave before the MOU is complete.",
            /* THE MICROCOPY. Quiet, one line, no emphasis — and stating the
               condition rather than promising the outcome, because a member who
               leaves before the MOU is complete still owes it. */
            /* The quietest text in the group, and measurably so: smaller than
               the explanatory line above it, normal weight, muted, italic. The
               browser test asserts the rendered size rather than the source, so
               a later edit that promotes this into a selling point fails. */
            <div data-fee-microcopy="1" style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4, fontStyle: "italic" }}>
              Written off in full once the MOU is accomplished.
            </div>)}
          <div style={{ display: "grid", gridTemplateColumns: "var(--rs-gcolumns-16, 1fr 1fr)", gap: 14 }}>
            {num("trainingMonths", "Training months", "", null, { min: B.phaseMin, max: B.phaseMax })}
            {num("serviceMonths", "Service months", "", null, { min: B.phaseMin, max: B.phaseMax })}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-500)", margin: "-4px 0 16px", lineHeight: 1.5 }}>
            Three years by default: {cfg.trainingMonths} months of training, then {cfg.serviceMonths} of service.
            Service is what earns the training fee off, a month at a time.
          </div>
          {num("balanceCap", "Stop charging at",
            "A ceiling on one member's balance. Once reached, nothing further is charged. 0 means no ceiling — available, but an account that grows past what anyone can pay pushes a family out of the programme.")}
          <label style={{ display: "flex", alignItems: "center", gap: 9, margin: "18px 0 10px" }}>
            <input type="checkbox" checked={!!cfg.remindEnabled} onChange={e => set("remindEnabled", e.target.checked)}/>
            <b>Remind guardians about arrears</b>
          </label>
          {num("remindEveryDays", "No more often than every",
            "Days between reminders to the same family. The minimum is " + B.remindMinDays + " — a family reminded daily stops reading anything you send, and your sender gets blocked.",
            null, { min: B.remindMinDays, max: B.remindMaxDays })}
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save amounts"}</button>
        </div>
      )}

      {/* ── Keeping the amounts worth what they were ───────────────────────────
          A fixed naira figure loses value every year it is left alone, so a
          programme that never revisits its amounts is quietly taking a pay cut.
          This raises them on a schedule — but only ever as a proposal an admin
          presses, never from the cron, and never over a balance already charged. */}
      {tab === "settings" && (
        <div className="admin-card" style={{ maxWidth: 620, marginTop: 16 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 10 }}>
            Keeping up with inflation
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "var(--rs-gcolumns-16, 1fr 1fr)", gap: 14 }}>
            {num("upratePct", "Raise amounts by", "Per cent. 0 switches it off. At most " + B.uprateMaxPct + "% at a time.",
              null, { min: 0, max: B.uprateMaxPct })}
            {num("uprateEveryMonths", "No more often than every",
              "Months. " + (meta.defaults.uprateEveryMonths || B.uprateEveryMax) + " is a yearly review.",
              null, { min: B.uprateEveryMin, max: B.uprateEveryMax })}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6, margin: "-4px 0 14px" }}>
            {/* Both halves matter. The first is what people fear; the second is
                what they'd otherwise assume moved with it and be wrong about. */}
            {/* The list of what moves is the server's list, not a sentence somebody
                has to remember to edit when the fields change. */}
            Only the {(B.uprateFields || []).map(f => (FEE_SETTING_LABEL[f] || f).toLowerCase()).join(", ")} move,
            rounded to the nearest {naira(B.uprateRound)}.
            {" "}<b>Charges already on an account stay exactly as they were</b> — a family quoted
            {" " + naira(cfg.monthlyDues)} for a month owes that for that month, whatever the figure becomes later.
            <div style={{ marginTop: 6, color: "var(--ink-400)" }}>
              Fines are not included — those live under <b>Policy</b> and are set there.
            </div>
          </div>
          {!up ? <div className="admin-empty" style={{ padding: "8px 0" }}>Checking…</div>
            : !up.enabled ? (
            <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
              Switched off. Set a percentage above and save to use it.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, marginBottom: 10 }}>
                {up.lastAt
                  ? <>Last raised {String(up.lastAt).slice(0, 10)}{up.monthsSince !== null && <> · {up.monthsSince} month{up.monthsSince === 1 ? "" : "s"} ago</>}.</>
                  : <>Never raised.</>}
                {" "}
                {up.due ? <b style={{ color: "var(--gold-700,#a07400)" }}>Due now.</b>
                        : <span style={{ color: "var(--ink-500)" }}>Not due for another {Math.max(0, up.everyMonths - (up.monthsSince || 0))} month(s).</span>}
              </div>
              {Object.keys(up.changes || {}).length === 0
                ? <div style={{ fontSize: 13, color: "var(--ink-500)" }}>Nothing to raise — no amount is set.</div>
                : (
                <>
                  <table className="admin-table" style={{ marginBottom: 12 }}>
                    <thead><tr><th>Amount</th><th>Now</th><th>Would become</th></tr></thead>
                    <tbody>{Object.keys(up.changes).map(k => (
                      <tr key={k}>
                        <td>{FEE_SETTING_LABEL[k] || k}</td>
                        <td className="mono" style={{ color: "var(--ink-500)" }}>{naira(up.changes[k].from)}</td>
                        <td className="mono"><b>{naira(up.changes[k].to)}</b></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <button className="btn btn-primary btn-sm" disabled={busy || !up.due} onClick={applyUprate}>
                    {busy ? "Working…" : "Raise the amounts"}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={loadUprate}>Recheck</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === "fines" && <FinesUpload onDone={loadArr}/>}
      {tab === "training" && <FeeTrainingWatch onOpen={openAcct}/>}
      {tab === "arrears" && (
        <div>
          {/* Above the list, because the list is only the people who owe. Anybody
              paid up, square or in credit was previously unreachable from here. */}
          <div className="admin-card" style={{ marginBottom: 14, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="admin-input" value={q} placeholder="Find any account by name or ID…"
                onChange={e => { setQ(e.target.value); if (!e.target.value.trim()) setFound(null); }}
                onKeyDown={e => { if (e.key === "Enter") doLookup(); }}
                style={{ maxWidth: 320 }} aria-label="Find an account"/>
              <button className="btn btn-ghost btn-sm" onClick={() => doLookup()}>Find</button>
              {found && <button className="btn btn-ghost btn-sm" onClick={() => { setFound(null); setQ(""); }}>Clear</button>}
            </div>
            {found && (found.tooShort
              ? <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 8 }}>Two letters at least.</div>
              : (found.members || []).length === 0
                ? <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 8 }}>Nobody matches “{found.q}”.</div>
                : (
                <table className="admin-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>Member</th><th>Centre</th><th>Payable</th><th>Charged</th><th>Received</th><th/></tr></thead>
                  <tbody>{found.members.map(mm => (
                    <tr key={mm.memberId}>
                      <td><b>{mm.fullName}</b><div className="mono an-sub-xs">{mm.memberId} · {mm.type}</div></td>
                      <td>{mm.centre}</td>
                      {/* Zero shown as "nothing owed" rather than ₦0 — the answer
                          to "has Ada paid?" is a sentence, not a figure. */}
                      <td className="mono">{mm.payable > 0 ? <b>{naira(mm.payable)}</b>
                        : <span style={{ color: "var(--green,#2f9e44)" }}>nothing owed</span>}</td>
                      <td className="mono" style={{ color: "var(--ink-500)" }}>{naira(mm.charged)}</td>
                      <td className="mono" style={{ color: "var(--ink-500)" }}>{naira(mm.credited)}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => openAcct(mm.memberId)}>Open →</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              ))}
            {found && found.truncated && (
              <div style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 6 }}>
                First {found.max} matches — narrow it to see the rest.
              </div>
            )}
          </div>
          {!arr ? <div className="admin-empty">Loading…</div>
            : (arr.arrears || []).length === 0 ? <div className="admin-empty">Nobody is in arrears.</div> : (
            <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", fontSize: 13, color: "var(--ink-600)" }}>
                <b>{naira(arr.totalPayable)}</b> payable across {arr.matched} member{arr.matched === 1 ? "" : "s"}.
                {" "}Ranked by what is actually payable — a training fee on course to be written off is not money owed.
                {arr.truncated && <> Showing the first {(arr.arrears || []).length}.</>}
              </div>
              <table className="admin-table">
                <thead><tr><th>Member</th><th>Centre</th><th>Payable</th><th>Of which training</th><th>Phase</th><th/></tr></thead>
                <tbody>{arr.arrears.map(a => (
                  <tr key={a.memberId}>
                    <td><b>{a.fullName}</b><div className="mono an-sub-xs">{a.memberId}</div></td>
                    <td>{a.centre}</td>
                    <td className="mono"><b>{naira(a.payable)}</b>{a.atCap && <div style={{ fontSize: 11, color: "var(--coral)" }}>at the ceiling</div>}</td>
                    <td className="mono" style={{ color: "var(--ink-500)" }}>{a.trainingEarned > 0 ? "−" + naira(a.trainingEarned) + " earned off" : "—"}</td>
                    <td style={{ textTransform: "capitalize" }}>{a.phase}{a.remindOff && <div style={{ fontSize: 11, color: "var(--ink-400)" }}>reminders off</div>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openAcct(a.memberId)}>Open →</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {acct && (
        <FeeModal onClose={() => setAcct(null)} title={acct.fullName + " — account"}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
            {[["Payable now", naira(acct.balance.payable)],
              ["Charged", naira(acct.balance.charged)],
              ["Received", naira(acct.balance.credited)],
              ["Training earned off", naira(acct.balance.trainingEarned)]].map(([l, v]) => (
              <div key={l} style={{ background: "var(--surface-2,#faf6ec)", borderRadius: 10, padding: "10px 12px" }}>
                <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)" }}>{l}</div>
                <div style={{ fontWeight: 700, fontSize: 17, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}>
            {acct.balance.tenure.phase === "unknown"
              ? "No join date on this record, so the three-year clock cannot be worked out."
              : <>Month {acct.balance.tenure.months} of {acct.balance.tenure.trainingMonths + acct.balance.tenure.serviceMonths} — currently in <b>{acct.balance.tenure.phase}</b>.
                 {acct.balance.tenure.phase === "service" && <> {acct.balance.tenure.servedMonths} of {acct.balance.tenure.serviceMonths} service months served.</>}</>}
            {acct.mouAt && <> MOU accomplished {String(acct.mouAt).slice(0, 10)}.</>}
          </div>
          {acct.training && <TrainingFeeWatch w={acct.training} audience="staff"/>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEntry("payment")}>Record a payment</button>
            {/* Both of these existed as valid ledger kinds and neither could be
                posted — the reminder email even rendered a Fines line that could
                never appear. A waiver is the one that matters most: without it,
                forgiving a hard month meant voiding a real charge. */}
            <button className="btn btn-ghost btn-sm" onClick={() => setEntry("fine")}>Issue a fine</button>
            <button className="btn btn-ghost btn-sm" disabled={acct.balance.outstanding <= 0}
              title={acct.balance.outstanding <= 0 ? "Nothing outstanding to waive" : ""}
              onClick={() => setEntry("waiver")}>Waive</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEntry("adjustment")}>Adjust</button>
            {!acct.mouAt && <button className="btn btn-ghost btn-sm" onClick={completeMou}>Mark MOU accomplished</button>}
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              try { await NGGApi.admin.fees.remindOff(acct.memberId, !acct.remindOff); refreshAcct(); loadArr(); }
              catch (e) { toast.error(e.code || e.message); }
            }}>{acct.remindOff ? "Allow reminders" : "Stop reminders for this family"}</button>
          </div>
          <table className="admin-table">
            <thead><tr><th>What</th><th>When</th><th>Amount</th><th/></tr></thead>
            <tbody>{acct.entries.map(e => (
              <tr key={e.entryId} style={e.void ? { opacity: .5 } : undefined}>
                <td>
                  {FEE_KIND_LABEL[e.kind] || e.kind}
                  {e.periodKey && e.periodKey.match(/^\d{4}-\d{2}$/) && <span className="mono" style={{ color: "var(--ink-400)" }}> {e.periodKey}</span>}
                  {e.note && <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{e.note}</div>}
                  {/* A corrected mistake stays visible with its reason — that is
                      the point of voiding rather than deleting. */}
                  {e.void && <div style={{ fontSize: 11.5, color: "var(--coral)" }}>Voided — {e.voidReason}</div>}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{String(e.createdAt).slice(0, 10)}</td>
                <td className="mono" style={{ color: e.direction === "charge" ? "var(--ink-800,#0a1130)" : "var(--green,#2f9e44)" }}>
                  {e.direction === "charge" ? "" : "−"}{naira(e.amount)}
                </td>
                <td>{!e.void && <button className="btn btn-ghost btn-sm" onClick={() => voidEntry(e)}>Void</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </FeeModal>
      )}

      {acct && entry && (
        <FeeEntryForm kind={entry} account={acct} busy={busy}
          onCancel={() => setEntry(null)} onSubmit={submitEntry}/>
      )}
    </div>
  );
}
function AdminStatusPages() {
  const [cfg, setCfg] = React.useState(null);
  const [orig, setOrig] = React.useState(null);
  const [meta, setMeta] = React.useState({ defaults: {}, centres: [] });
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const load = () => NGGApi.admin.statusPages().then(r => { setCfg(r.statusPages); setOrig(JSON.stringify(r.statusPages)); setMeta({ defaults: r.defaults || {}, centres: r.centreOptions || [] }); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const dirty = cfg && orig && JSON.stringify(cfg) !== orig;
  const set = (board, key, val) => setCfg(c => ({ ...c, [board]: { ...c[board], [key]: val } }));
  const setSub = (board, key, sub, val) => setCfg(c => ({ ...c, [board]: { ...c[board], [key]: { ...c[board][key], [sub]: val } } }));
  const toggleCentre = (board, name) => setCfg(c => {
    const all = meta.centres.map(x => x.name);
    let cur = (c[board].centres && c[board].centres.length) ? [...c[board].centres] : all.slice();
    cur = cur.includes(name) ? cur.filter(x => x !== name) : [...cur, name];
    return { ...c, [board]: { ...c[board], centres: cur.length === all.length ? [] : cur } };
  });
  const reset = async (board) => {
    const ok = await dialog.confirm({ title: "Reset to defaults?", body: "This restores the built-in copy, sections and settings for this board. You can still Save or discard afterwards.", cta: "Reset" });
    if (ok && meta.defaults[board]) setCfg(c => ({ ...c, [board]: JSON.parse(JSON.stringify(meta.defaults[board])) }));
  };
  const save = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.statusPagesSet(cfg); setCfg(r.statusPages); setOrig(JSON.stringify(r.statusPages)); toast.success("Status pages updated."); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };

  if (err) return <ErrorState title="Couldn't load status pages" code={err} onRetry={load}/>;
  if (!cfg) return <div className="dash-spinner"/>;

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Public status pages</h2>
        <div className="admin-section-actions">
          {dirty && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setCfg(JSON.parse(orig)); }}>Discard</button>}
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
        </div>
      </div>
      <p className="admin-hint" style={{ marginTop: 0 }}>Full control of each live board — publish, copy, which sections and KPI tiles show, accent colour, trend window, which centres appear, and an announcement banner. Numbers stay aggregate-only and PII-free; you control the wrapper here, and edit the underlying data in the places below.</p>
      <div className="card" style={{ padding: 16, margin: "0 0 18px", background: "var(--bg-sunken, #f7f7f4)" }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-500)", marginBottom: 8 }}>Where the board's data is edited</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("centres")}>🏫 Centres — name, address, lead, meeting times →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("summer", "catalogue")}>🎓 Academy catalogue — faculties &amp; their courses →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("volunteers", "needs")}>◈ Volunteer needs (the /v-status targets) →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("summer", "roster")}>❑ Participants (Summer School roster) →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("volunteers", "roster")}>◈ Volunteers (roster) →</button>
        </div>
        <p className="admin-hint" style={{ margin: "10px 0 0" }}>The live KPIs (attendance %, present today, leaderboard) are computed from real attendance, stars and activity records — they update automatically as those are logged; there's nothing to type here.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(400px,1fr))", gap: 18 }}>
        {STATUS_BOARDS.map(b => {
          const c = cfg[b.key] || {};
          const on = !!c.published;
          const shownAll = !c.centres || c.centres.length === 0;
          return (
            <div key={b.key} className="card" style={{ padding: 20, borderTop: "4px solid " + b.accent }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{b.name}</div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{b.route}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreview(preview === b.key ? null : b.key)}>{preview === b.key ? "Hide preview" : "Preview"}</button>
                  <a className="btn btn-ghost btn-sm" href={b.route} target="_blank" rel="noreferrer">Live ↗</a>
                </div>
              </div>

              <button type="button" onClick={() => set(b.key, "published", !on)}
                style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", padding: "10px 12px", borderRadius: 12, width: "100%", cursor: "pointer",
                  border: "1px solid " + (on ? "rgba(22,163,74,.4)" : "var(--line-cool,#e5e8ee)"), background: on ? "rgba(22,163,74,.08)" : "var(--cream-50,#faf7ef)" }}>
                <span style={{ width: 40, height: 22, borderRadius: 99, background: on ? "#16a34a" : "#c4cad8", position: "relative", flex: "none", transition: "background calc(.15s * var(--motion, 1))" }}>
                  <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left calc(.15s * var(--motion, 1))" }}/>
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: on ? "#15803d" : "var(--ink-500)" }}>{on ? "Published — live to the public" : "Unpublished — hidden with an “offline” notice"}</span>
              </button>

              <div style={{ opacity: on ? 1 : 0.55, pointerEvents: on ? "auto" : "none" }}>
                <StatusGroup label="Copy">
                  <div style={{ display: "grid", gap: 10 }}>
                    {STATUS_FIELDS.map(([key, label, type, hint]) => (
                      <div key={key} className="field">
                        <label style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
                        {type === "textarea"
                          ? <textarea className="admin-input" rows={3} value={c[key] || ""} onChange={e => set(b.key, key, e.target.value)} style={{ resize: "vertical" }}/>
                          : <input className="admin-input" value={c[key] || ""} onChange={e => set(b.key, key, e.target.value)}/>}
                        {hint && <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 3 }}>{hint}</div>}
                      </div>
                    ))}
                  </div>
                </StatusGroup>

                <StatusGroup label="Sections shown">
                  <div style={{ display: "grid", gap: 6 }}>
                    {Object.keys(c.sections || {}).map(sk => (
                      <label key={sk} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={c.sections[sk] !== false} onChange={e => setSub(b.key, "sections", sk, e.target.checked)}/> {STATUS_SECTION_LABELS[sk] || sk}
                      </label>
                    ))}
                  </div>
                </StatusGroup>

                <StatusGroup label="KPI tiles">
                  <div style={{ display: "grid", gridTemplateColumns: "var(--rs-gcolumns-16, 1fr 1fr)", gap: 6 }}>
                    {Object.keys(c.kpis || {}).map(kk => (
                      <label key={kk} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={c.kpis[kk] !== false} onChange={e => setSub(b.key, "kpis", kk, e.target.checked)}/> {STATUS_KPI_LABELS[kk] || kk}
                      </label>
                    ))}
                  </div>
                </StatusGroup>

                <StatusGroup label="Appearance">
                  <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      Accent <input type="color" value={c.accent || "#d0ff3a"} onChange={e => set(b.key, "accent", e.target.value)} style={{ width: 40, height: 30, border: "1px solid var(--line-cool)", borderRadius: 8, background: "none", cursor: "pointer" }}/>
                    </label>
                    {"trendDays" in c && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        Trend window
                        <select className="admin-input" style={{ width: "auto" }} value={c.trendDays} onChange={e => set(b.key, "trendDays", parseInt(e.target.value, 10))}>
                          <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
                        </select>
                      </label>
                    )}
                  </div>
                </StatusGroup>

                <StatusGroup label={"Centres shown" + (shownAll ? " · all" : " · " + c.centres.length + " selected")}>
                  {meta.centres.length === 0 ? <div style={{ fontSize: 12, color: "var(--ink-400)" }}>No active centres yet.</div>
                    : <div style={{ display: "grid", gridTemplateColumns: "var(--rs-gcolumns-16, 1fr 1fr)", gap: 6 }}>
                      {meta.centres.map(ct => (
                        <label key={ct.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                          <input type="checkbox" checked={shownAll || c.centres.includes(ct.name)} onChange={() => toggleCentre(b.key, ct.name)}/>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: ct.color || "#999", display: "inline-block" }}/> {ct.name}
                        </label>
                      ))}
                    </div>}
                  <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4 }}>Uncheck to hide a centre from the public board. All checked = show every centre.</div>
                </StatusGroup>

                <StatusGroup label="Announcement banner">
                  <input className="admin-input" placeholder="Optional banner text (leave blank for none)" value={(c.banner && c.banner.text) || ""} onChange={e => setSub(b.key, "banner", "text", e.target.value)}/>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {["info", "success", "warn"].map(t => (
                      <button key={t} type="button" onClick={() => setSub(b.key, "banner", "tone", t)}
                        className={"chip" + ((c.banner && c.banner.tone) === t ? " chip-navy" : "")}
                        style={{ textTransform: "capitalize", cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                </StatusGroup>

                <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => reset(b.key)}>↺ Reset to defaults</button>
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 18, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line-cool,#e5e8ee)", flexWrap: "wrap" }}>
            <b>Live preview — {(STATUS_BOARDS.find(x => x.key === preview) || {}).name}</b>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>Copy, sections, KPIs, accent &amp; banner update as you edit · centre &amp; trend filters apply after saving</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
          <div style={{ maxHeight: 680, overflow: "auto", background: "var(--paper,#fbf7ed)" }}>
            {preview === "attendance" ? <StatusPage previewConfig={cfg.attendance}/> : <VolunteerStatusPage previewConfig={cfg.volunteer}/>}
          </div>
        </div>
      )}
    </div>
  );
}

/* Volunteer needs editor — the admin sets target headcount per centre × role
   (and optionally per faculty), with live filled counts so they never edit
   blind. Feeds the public /v-status fulfilment board. */
/* One editable material-need row: item name (fixed), received count, and an
 * OPTIONAL needed target (blank = open-ended request, no specific amount).
 * Saves on blur; local state seeded from props so a reload refreshes it. */
function ItemNeedRow({ it, busy, onSave, onRemove }) {
  const [need, setNeed] = React.useState((it.needCount ?? 0) ? String(it.needCount) : "");
  const [filled, setFilled] = React.useState(String(it.filledCount ?? 0));
  const needN = parseInt(need || "0", 10) || 0;
  const filledN = parseInt(filled || "0", 10) || 0;
  const open = needN === 0;
  const gap = Math.max(0, needN - filledN);
  const save = () => { if (needN !== (it.needCount ?? 0) || filledN !== (it.filledCount ?? 0)) onSave(it.item, need, filled, it.unit, it.note); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 120px", minWidth: 100 }}>{it.item}{it.unit ? <span className="mono" style={{ fontSize: 10, color: "var(--ink-400)", marginLeft: 4 }}>{it.unit}</span> : null}</span>
      <input className="admin-input" type="number" min="0" style={{ width: 62 }} value={filled} onChange={e => setFilled(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} aria-label={"received " + it.item}/>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>/</span>
      <input className="admin-input" type="number" min="0" style={{ width: 62 }} value={need} placeholder="any" onChange={e => setNeed(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} aria-label={"needed " + it.item + " (blank = no set amount)"}/>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)", minWidth: 54 }}>
        {busy ? "saving…" : (open ? <b style={{ color: "#7a6cff" }}>open</b> : (gap > 0 ? <b style={{ color: "#c0851a" }}>{gap} gap</b> : <b style={{ color: "#2f9e44" }}>met ✓</b>))}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => onRemove(it.item)} title="Remove item" style={{ padding: "2px 8px" }}>✕</button>
    </div>
  );
}

function VolunteerNeedsEditor() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState("");
  const [facOpen, setFacOpen] = React.useState(() => new Set());
  const [itemOpen, setItemOpen] = React.useState(() => new Set());
  const [newItem, setNewItem] = React.useState({});   // centreId -> {item, needCount, filledCount, unit}
  const [itemBusy, setItemBusy] = React.useState("");
  const load = () => NGGApi.admin.volunteers.needsList().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);

  const itemsByCentre = {};
  (d ? (d.items || []) : []).forEach(it => { (itemsByCentre[it.centreId] = itemsByCentre[it.centreId] || []).push(it); });
  const toggleItems = (cid) => setItemOpen(s => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const saveItem = async (centreId, item, needCount, filledCount, unit, note) => {
    const nm = String(item || "").trim();
    if (!nm) { toast.error("Give the item a name."); return; }
    setItemBusy(centreId + "|" + nm);
    try { await NGGApi.admin.volunteers.itemUpsert(centreId, nm, Math.max(0, parseInt(needCount || "0", 10) || 0), Math.max(0, parseInt(filledCount || "0", 10) || 0), unit || "", note || ""); }
    catch (e) { toast.error(e.code || e.message); }
    setItemBusy(""); load();
  };
  const addItem = async (centreId) => {
    const n = newItem[centreId] || {};
    if (!String(n.item || "").trim()) { toast.error("Give the item a name."); return; }
    await saveItem(centreId, n.item, n.needCount, n.filledCount, n.unit, "");
    setNewItem(s => ({ ...s, [centreId]: {} }));
  };
  const removeItem = async (centreId, item) => {
    if (!(await dialog.confirm({ title: "Remove \"" + item + "\"?", body: "This item need stops showing on the board.", cta: "Remove" }))) return;
    try { await NGGApi.admin.volunteers.itemDelete(centreId, item); load(); } catch (e) { toast.error(e.code || e.message); }
  };

  const needMap = {};
  (d ? d.needs : []).forEach(n => { needMap[n.centreId + "|" + n.role + "|" + (n.faculty || "")] = n.needCount; });
  const filled = (d && d.filled) || { centre: {}, role: {}, faculty: {} };
  const roleMeta = { admin: "Admin / Ops", mentor: "Mentor", instructor: "Instructor" };

  const cellVal = (key, fallback) => (key in draft ? draft[key] : (fallback === undefined ? "" : fallback));
  const commit = async (centreId, role, faculty) => {
    const key = centreId + "|" + role + "|" + faculty;
    if (!(key in draft)) return;
    const v = Math.max(0, parseInt(draft[key] || "0", 10) || 0);
    setSaving(key);
    try { await NGGApi.admin.volunteers.needUpsert(centreId, role, faculty, v); }
    catch (e) { toast.error(e.code || e.message); }
    setSaving(""); setDraft(s => { const n = { ...s }; delete n[key]; return n; }); load();
  };
  const toggleFac = (cid) => setFacOpen(s => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

  if (err) return <ErrorState title="Couldn't load needs" code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;
  if (!d.centres.length) return <div className="admin-empty">No active centres yet — add centres under <b>People → Centres</b> first.</div>;

  const numInput = (centreId, role, faculty, filledCount) => {
    const key = centreId + "|" + role + "|" + faculty;
    const need = cellVal(key, needMap[key] ?? "");
    const needN = parseInt(need || "0", 10) || 0;
    const gap = Math.max(0, needN - filledCount);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input className="admin-input" type="number" min="0" style={{ width: 74 }} value={need}
          onChange={e => setDraft(s => ({ ...s, [key]: e.target.value }))}
          onBlur={() => commit(centreId, role, faculty)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          placeholder="0" aria-label={"need for " + role}/>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>
          {saving === key ? "saving…" : <>{filledCount} on board{needN > 0 ? (gap > 0 ? " · " : " · ") : ""}{needN > 0 && (gap > 0 ? <b style={{ color: "#c0851a" }}>{gap} gap</b> : <b style={{ color: "#2f9e44" }}>full ✓</b>)}</>}
        </span>
      </div>
    );
  };

  return (
    <div>
      <p className="admin-hint" style={{ marginTop: 0 }}>Set how many volunteers each centre needs per role (live counts show who's already signed up), and the <b>items</b> a centre needs — laptops, keyboards, chairs, data — with how many have come in. Both drive the public <b>/v-status</b> board. Optionally set finer per-faculty targets.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
        {d.centres.map(c => (
          <div key={c.centreId} className="card" style={{ padding: 18, borderTop: "4px solid " + (c.color || "#5a3fb0") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{c.name} <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{c.code}</span></div>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{filled.centre[c.centreId] || 0} on board</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {d.roles.map(role => (
                <div key={role} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 96 }}>{roleMeta[role] || role}</span>
                  {numInput(c.centreId, role, "", filled.role[c.centreId + "|" + role] || 0)}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => toggleFac(c.centreId)} aria-expanded={facOpen.has(c.centreId)}>
              {facOpen.has(c.centreId) ? "Hide faculty targets ▴" : "Faculty targets (optional) ▾"}
            </button>
            {facOpen.has(c.centreId) && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line-cool-soft,#eef0f4)", paddingTop: 12, display: "grid", gap: 12 }}>
                {["mentor", "instructor"].map(role => (
                  <div key={role}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 6 }}>{roleMeta[role]} · by faculty</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {d.faculties.map(f => (
                        <div key={f} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, minWidth: 120 }}>{f}</span>
                          {numInput(c.centreId, role, f, filled.faculty[c.centreId + "|" + f] || 0)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => toggleItems(c.centreId)} aria-expanded={itemOpen.has(c.centreId)}>
              {itemOpen.has(c.centreId) ? "Hide items needed ▴" : "Items needed" + ((itemsByCentre[c.centreId] || []).length ? " · " + itemsByCentre[c.centreId].length : "") + " ▾"}
            </button>
            {itemOpen.has(c.centreId) && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line-cool-soft,#eef0f4)", paddingTop: 12 }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>Materials · received / needed <span style={{ textTransform: "none", letterSpacing: 0 }}>(leave needed blank for an open request)</span></div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(itemsByCentre[c.centreId] || []).map(it => (
                    <ItemNeedRow key={it.item} it={it} busy={itemBusy === c.centreId + "|" + it.item}
                      onSave={(item, need, filled, unit, note) => saveItem(c.centreId, item, need, filled, unit, note)}
                      onRemove={(item) => removeItem(c.centreId, item)}/>
                  ))}
                  {!(itemsByCentre[c.centreId] || []).length && <div className="admin-cell-sub" style={{ fontSize: 12 }}>No items yet — add one below (e.g. Laptops, Keyboards, Chairs, Data).</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                  <input className="admin-input" placeholder="Item (e.g. Laptops)" value={(newItem[c.centreId] || {}).item || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], item: e.target.value } }))} style={{ flex: "1 1 130px", minWidth: 110 }}/>
                  <input className="admin-input" type="number" min="0" placeholder="have" value={(newItem[c.centreId] || {}).filledCount || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], filledCount: e.target.value } }))} style={{ width: 58 }} aria-label="received"/>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>/</span>
                  <input className="admin-input" type="number" min="0" placeholder="any" value={(newItem[c.centreId] || {}).needCount || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], needCount: e.target.value } }))} style={{ width: 58 }} aria-label="needed (blank = no set amount)"/>
                  <input className="admin-input" placeholder="unit" value={(newItem[c.centreId] || {}).unit || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], unit: e.target.value } }))} style={{ width: 66 }} aria-label="unit"/>
                  <button className="btn btn-primary btn-sm" onClick={() => addItem(c.centreId)}>+ Add</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Edit an active volunteer's data — name, contact, role, centre, faculty,
   courses, visibility consent, status, photo. Mirrors admin.volunteers.update. */
/**
 * Summer School → NGG for one volunteer. The centre list is the open NGG
 * centres, nearest to where their Summer School met; Summer venues are never
 * offered. "Keep serving Summer School" makes them both. Their mentor record,
 * if they have one, moves with them (admin_volunteer_promote_ngg).
 */
function VolunteerNggMove({ v, onDone }) {
  const [opts, setOpts] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [centre, setCentre] = React.useState("");
  const [keep, setKeep] = React.useState(true);
  const [newCard, setNewCard] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const load = () => { setErr(""); NGGApi.admin.volunteers.nggOptions(v.volunteerId).then(r => { setOpts(r); setCentre(r.suggested || ""); }).catch(e => setErr(e.code || e.message)); };
  React.useEffect(load, [v.volunteerId]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await NGGApi.admin.volunteers.promoteNgg(v.volunteerId, centre, keep, newCard);
      toast.success(v.fullName + " now serves " + (r.programme === "both" ? "NGG and Summer School" : "NGG") + " at " + r.centre + (r.mentorRecords ? " · mentor record moved too" : "")
        + ". " + (r.card && r.card.keeps ? "Their card scans at NGG desks from now on" + (r.card.expiresAt ? ", until " + r.card.expiresAt : "") + "." : "")
        + (r.queued ? " An NGG-style card is queued in the ID Card Studio." : ""));
      onDone();
    } catch (e) { toast.error(({ invalid_centre: "Choose one of the open NGG centres.", centre_required: "Choose the NGG centre they will serve.", already_ngg: "They already serve NGG." })[e.code] || e.message); setBusy(false); }
  };
  if (err) return <div className="vol-ngg"><p role="alert">Couldn’t load the NGG centres ({err}).</p><button className="btn btn-ghost btn-sm" onClick={load}>Try again</button></div>;
  if (!opts) return <div className="vol-ngg"><p>Loading the NGG centres…</p></div>;
  return (
    <div className="vol-ngg">
      <p className="vol-ngg-lead">Bring <b>{v.fullName}</b> from Summer School into the NGG Club. Their ID card stays the same; it keeps working all year.</p>
      {!opts.centres.length ? <p role="alert">There are no open NGG centres you can place them at. Add one in Members → Centres.</p> : <>
        <fieldset className="vol-ngg-centres">
          <legend>NGG centre{opts.summerCentre ? " · nearest to " + opts.summerCentre + " first" : ""}</legend>
          {opts.centres.map((c, i) => <label key={c.name} className="vol-ngg-opt">
            <input type="radio" name={"ngg-" + v.volunteerId} checked={centre === c.name} onChange={() => setCentre(c.name)}/>
            {c.name}{c.minutes != null ? " · ~" + c.minutes + " min drive" + (c.roadKm != null ? ", " + c.roadKm + " km by road" : "") : c.km != null ? " · " + c.km + " km in a straight line" : ""}{i === 0 && opts.suggested === c.name ? " · suggested" : ""}
          </label>)}
        </fieldset>
        <label className="vol-ngg-opt"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)}/> Keep serving Summer School too</label>
        <label className="vol-ngg-opt"><input type="checkbox" checked={newCard} onChange={e => setNewCard(e.target.checked)}/> Also print them an NGG-style card (their current card keeps working)</label>
        <div className="vol-ngg-acts">
          <button className="btn btn-primary btn-sm" disabled={busy || !centre} onClick={go}>{busy ? "Moving…" : "Bring into NGG"}</button>
          <button className="btn btn-ghost btn-sm" onClick={onDone} disabled={busy}>Cancel</button>
        </div>
      </>}
    </div>
  );
}

/* Edit a volunteer's details — the Control Room's own form (ctx.form), the
   same layer every other record in the Control Room edits through.

   What used to go wrong, each now closed:
   · it sent EVERY field back, so anything the roster row did not carry was
     written over: the photo (the list had no photoUrl) was wiped on every
     save. Now only the fields that changed are sent.
   · it required a first and last name even on a record that only ever had a
     full name, and kept three name boxes that could disagree. Now: first and
     last name, split from the full name when the record has only that, and
     the server rebuilds the full name from them.
   · an empty email was refused, so a volunteer who signs in with an ID card
     (and has no email) could not be edited at all. Blank is allowed now.
   · a blank programme was sent as "summer", quietly moving NGG volunteers
     (and their card's expiry) to Summer School. Programme is a field now. */
const VOL_ROLE_OPTS = [["mentor", "Mentor"], ["instructor", "Instructor"], ["admin", "Admin / Ops"]];
const VOL_PROG_OPTS = [["summer", "Summer School"], ["ngg", "NGG Club"], ["both", "Both"]];
const VOL_STATUS_OPTS = [["active", "Active"], ["inactive", "Inactive"], ["archived", "Archived"]];
const VOL_ERR_FIELD = { bad_title: ["honorific", "Choose a title from the list."], bad_email: ["email", "That email isn’t valid."], bad_dob: ["dob", "That date of birth isn’t a real date in the past."],
  bad_name: ["firstName", "Enter a first and last name."], bad_role: ["role", "Pick a role."], bad_programme: ["programme", "Pick a programme."],
  out_of_scope: ["centre", "That centre is outside the centres you manage."] };
function volunteerNameParts(v) {
  const first = String(v.firstName || "").trim(), last = String(v.lastName || "").trim();
  if (first || last) return [first, last];
  const w = String(v.fullName || "").trim().split(/\s+/).filter(Boolean);
  return [w[0] || "", w.slice(1).join(" ")];
}
function volunteerEditForm(v, centres, onSaved, titles) {
  const [first, last] = volunteerNameParts(v);
  /* The title is how a child addresses them ("Mrs Adeyemi"); the server's
     list is the only list, and blank reads as its default. */
  const tl = (titles && titles.list) || [];
  const init = { honorific: v.honorific || "", firstName: first, lastName: last, email: v.email || "", phone: v.phone || "", role: VOL_ROLE_OPTS.some(o => o[0] === v.role) ? v.role : "mentor",
    programme: v.programme || "summer", status: v.status || "active", centre: v.centre || "", faculty: v.faculty || "",
    courses: (v.courses || []).join(", "), dob: /^\d{4}-\d{2}-\d{2}/.test(v.dob || "") ? String(v.dob).slice(0, 10) : "", visibilityConsent: !!Number(v.visibilityConsent) };
  const centreOpts = (v.centre && !centres.includes(v.centre) ? [v.centre].concat(centres) : centres).map(c => [c, c]);
  return {
    title: "Edit " + (v.fullName || "volunteer"),
    intro: "Only what you change is saved. The photo, portal access and profile are under More.",
    submit: "Save",
    values: init,
    fields: [
      { id: "honorific", l: "Title", type: "select", opts: tl.map(t => [t, t]), ph: "None (" + ((titles && titles.def) || "Coach") + ")",
        help: "Children and families see them as the title and surname — " + (v.honorific || (titles && titles.def) || "Coach") + " " + (last || "…") + " — never the first name." },
      { id: "firstName", l: "First name", req: true, max: 80, ac: "given-name" },
      { id: "lastName", l: "Last name", req: true, max: 80, ac: "family-name" },
      { id: "email", l: "Email", type: "email", email: true, max: 160, help: "Leave blank for someone who signs in with their ID card." },
      { id: "phone", l: "Phone", type: "tel", max: 48, im: "tel" },
      { id: "role", l: "Role", type: "chips", req: true, opts: VOL_ROLE_OPTS },
      { id: "programme", l: "Programme", type: "chips", req: true, opts: VOL_PROG_OPTS, help: "Moving between Summer School and NGG changes when their card stops opening the door." },
      { id: "centre", l: "Centre", type: "select", opts: centreOpts, ph: "No centre" },
      { id: "faculty", l: "Faculty", max: 80 },
      { id: "courses", l: "Courses", max: 600, help: "What they teach, separated by commas. For NGG this is their class, so each must be a course in the catalogue; spelling and capitals are fixed for you." },
      { id: "dob", l: "Date of birth", type: "date" },
      { id: "status", l: "Status", type: "chips", req: true, opts: VOL_STATUS_OPTS },
      { id: "visibilityConsent", l: "Consented to be featured (photo and first name) on the public site and boards", type: "switch" },
    ],
    onSubmit: async vals => {
      const out = {};
      Object.keys(init).forEach(k => {
        const a = typeof init[k] === "string" ? init[k].trim() : init[k], b = typeof vals[k] === "string" ? vals[k].trim() : vals[k];
        if (a !== b) out[k] = b;
      });
      /* The name is one thing: change either part and both are sent, so a
         record that only ever had a full name gets both parts at once. */
      if (out.firstName !== undefined || out.lastName !== undefined) { out.firstName = vals.firstName.trim(); out.lastName = vals.lastName.trim(); }
      if (out.courses !== undefined) out.courses = out.courses.split(",").map(c => c.trim()).filter(Boolean);
      if (out.visibilityConsent !== undefined) out.visibilityConsent = out.visibilityConsent ? 1 : 0;
      if (!Object.keys(out).length) return { unchanged: true };
      try { await NGGApi.admin.volunteers.update(v.volunteerId, out); }
      catch (e) {
        if (e.code === "unknown_course") return { fieldErrors: { courses: e.detail || "One of those is not a course in the catalogue." } };
        const fe = VOL_ERR_FIELD[e.code]; if (fe) return { fieldErrors: { [fe[0]]: fe[1] } }; throw e;
      }
      onSaved();
      return { saved: Object.keys(out).length };
    },
    done: (vals, r) => r && r.unchanged ? "Nothing changed." : (vals.firstName.trim() + " " + vals.lastName.trim()).trim() + " saved.",
  };
}

/* What else this volunteer is: a mentor as well (one person, both portals;
   admin.mentor.promote / demote), and whether the online Instructor Academy is
   waived because they did it in person (admin.volunteers.academy). */
function VolunteerRoles({ v, onSaved }) {
  const [busy, setBusy] = React.useState("");
  const isMentor = !!v.mentorId, cleared = !!v.academyClearedAt;
  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); toast.success(ok); onSaved(); }
    catch (e) { toast.error(e.code === "own_account" ? "You can’t change this on your own record." : e.code === "out_of_scope" ? "That volunteer’s centre is outside the centres you manage." : "Not saved (" + (e.code || e.message) + "). Try again."); }
    finally { setBusy(""); }
  };
  return (
    <div className="vol-roles">
      <span className="admin-field-label">Also</span>
      <label className="vol-role-row">
        <input type="checkbox" checked={isMentor} disabled={!!busy} onChange={() => run("mentor",
          () => isMentor ? NGGApi.admin.mentor.demote(v.mentorId) : NGGApi.admin.mentor.promote(v.volunteerId, { rank: "mentor", programme: v.programme === "summer" ? "summer" : "ngg", centre: v.centre || "" }),
          isMentor ? (v.fullName || "They") + " is no longer a mentor. Their instructor role is unchanged." : (v.fullName || "They") + " is now a mentor too: the Mentor Portal opens for them, and pair mentees in Mentors & volunteers → Pairings.")}/>
        <span><b>A mentor as well</b><small>{isMentor ? "On the mentor roster" + (v.role === "instructor" ? " and teaching: both portals open for them." : ".") : "Adds them to the mentor roster without changing their role here."}</small></span>
      </label>
      {v.role === "instructor" && (
        <label className="vol-role-row">
          <input type="checkbox" checked={cleared} disabled={!!busy} onChange={() => run("academy", () => NGGApi.admin.volunteers.academy(v.volunteerId, !cleared),
            !cleared ? "Academy marked as done in person. Their portal opens without the online modules." : "Academy waiver removed. They complete the online modules again.")}/>
          <span><b>Skip the online Academy</b><small>{cleared ? "Done in person, recorded " + String(v.academyClearedAt).slice(0, 10) + "." : "Tick when they trained in person or need none. The portal stops asking for the modules."}</small></span>
        </label>
      )}
      {busy && <span className="admin-hint" role="status">Saving…</span>}
    </div>
  );
}

/* The rest of a volunteer's record: the photo (saved on its own, the moment
   it is taken), their public profile, and delete. Portal access sits below. */
function VolunteerMore({ v, onSaved, onDelete }) {
  const [photo, setPhoto] = React.useState(v.photoUrl || "");
  const [busy, setBusy] = React.useState(false);
  const savePhoto = async val => {
    const prev = photo; setPhoto(val); setBusy(true);
    try { await NGGApi.admin.volunteers.update(v.volunteerId, { photoUrl: val || "" }); toast.success(val ? "Photo saved." : "Photo removed."); onSaved(); }
    catch (e) { setPhoto(prev); toast.error("Couldn’t save the photo (" + (e.code || e.message) + "). Try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="vol-more">
      <div className="vol-more-photo">
        <span className="admin-field-label">Photo</span>
        <PhotoCapture value={photo} onChange={savePhoto} size={80} label={"Photo of " + (v.fullName || "the volunteer")}/>
        {busy && <span className="admin-hint" role="status">Saving…</span>}
      </div>
      <VolunteerRoles v={v} onSaved={onSaved}/>
      <ProfileExtrasEditor subjectType="volunteer" subjectId={v.volunteerId}/>
      <div className="vol-more-acts">
        <button type="button" className="btn btn-ghost btn-sm vol-del" onClick={onDelete}>Delete volunteer</button>
      </div>
    </div>
  );
}

/* Sentinel for "no centre on file". A real centre name is trimmed non-empty,
   so it can never collide, and the filter stays one value instead of a value
   plus a boolean that can contradict it. */
const VOL_NO_CENTRE = " none";

/* Portal access for a volunteer.
   The centres are run by volunteers, and the ones running them need the
   roster. What must not happen is a public form being one edit away from a
   child's behaviour record — so this is a deliberate, per-person grant, it is
   super-admin only, and it is audited. The two options are the two rosters;
   a volunteer's reach is always the centre on their own record. */
function VolunteerPortalAccess({ v, onSaved }) {
  const { hasCap } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const caps = v.caps || [];
  if (!hasCap || !hasCap("rbac")) return null;
  const noCentre = !(v.centre || "").trim();
  const toggle = async (cap) => {
    const next = caps.indexOf(cap) === -1 ? caps.concat([cap]) : caps.filter(c => c !== cap);
    setBusy(true);
    try { await NGGApi.admin.volunteers.caps(v.volunteerId, next); toast.success(next.length ? "Portal access updated." : "Portal access removed."); onSaved && onSaved(); }
    catch (e) { toast.error(e.code === "volunteer_has_no_centre" ? "Give them a centre first — access is scoped to it." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(12,20,50,.10)" }}>
      <div className="admin-field-label">Mentor portal access</div>
      <p className="admin-hint" style={{ margin: "2px 0 8px" }}>
        {noCentre
          ? "This volunteer has no centre. Access is scoped to a centre, so set one above before granting it."
          : <>Opens the roster for {v.centre} only. Registering as a volunteer grants nothing on its own — this is the grant.</>}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["summer", "Summer School roster"], ["club", "NGG Club roster"]].map(([cap, label]) => (
          <button key={cap} type="button" role="switch" aria-checked={caps.indexOf(cap) !== -1}
            disabled={busy || noCentre} onClick={() => toggle(cap)}
            className={"btn btn-sm " + (caps.indexOf(cap) !== -1 ? "btn-primary" : "btn-ghost")}>
            {caps.indexOf(cap) !== -1 ? "✓ " : ""}{label}
          </button>
        ))}
      </div>
    </div>
  );
}

const VOL_PROGRAMME_SHORT = { summer: "Summer", ngg: "NGG Club", both: "Club + Summer" };

function AdminVolunteers({ crCtx } = {}) {
  const volCentres = useCentreOptions();
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [tab, setTab] = useAdminTab("pending", React.useCallback(t => t === "pending" || t === "roster" || t === "needs" || t === "ngg-activities", []));
  const [q, setQ] = React.useState("");
  const [vCentre, setVCentre] = React.useState("");
  /* Which programme — filtered on the server, above the roster's cap.
     "ngg" includes those who serve both. */
  const [vProg, setVProg] = React.useState("");
  const [expanded, setExpanded] = React.useState(() => new Set());
  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const load = () => NGGApi.admin.volunteers.list(vProg).then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [vProg]);

  const approve = async (a) => {
    if (a.role === "instructor" && !a.phone) { toast.error("Instructors need a phone before approval."); return; }
    const ok = await dialog.confirm({ title: "Approve " + a.name + "?", body: "This issues a volunteer ID + QR attendance profile and emails" + (a.phone ? "/SMSes" : "") + " it to them. " + (a.role !== "admin" ? "Safeguarding screening is still required before they work with young people." : ""), cta: "Approve & issue ID" });
    if (!ok) return;
    setBusy("a" + a.id);
    try { const r = await NGGApi.admin.volunteers.approve(a.id); toast.success("Approved · " + r.volunteer.volunteerId + (r.idSent && r.idSent.length ? " · ID sent by " + r.idSent.join(" + ") : "")); load(); }
    catch (e) { toast.error(e.code === "phone_required" ? "Instructors need a phone first." : (e.code || e.message)); }
    finally { setBusy(""); }
  };
  const decline = async (a) => {
    const reason = await dialog.prompt({ title: "Decline " + a.name + "?", body: "Optional reason — included in the courteous email we send.", placeholder: "e.g. Intake full this season", cta: "Decline" });
    if (reason === null) return;
    setBusy("d" + a.id);
    try { await NGGApi.admin.volunteers.decline(a.id, reason); toast.success("Declined."); load(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };
  const setSafeguard = async (v, status) => {
    setBusy("s" + v.volunteerId);
    try { await NGGApi.admin.volunteers.safeguard(v.volunteerId, status); toast.success(status === "cleared" ? "Marked screened." : "Set to pending."); load(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };
  const [editId, setEditId] = React.useState("");
  const removeVol = async (v) => {
    if (!(await dialog.confirm({ title: "Delete " + v.fullName + "?", body: "This permanently removes the volunteer record and their check-in QR. This can't be undone.", cta: "Delete", danger: true }))) return;
    try { await NGGApi.admin.volunteers.remove(v.volunteerId); toast.success("Volunteer deleted."); setEditId(""); load(); } catch (e) { toast.error(e.code || e.message); }
  };

  const progChip = (p) => <span className="chip chip-navy" title="Which programme they serve">{VOL_PROGRAMME_SHORT[p] || VOL_PROGRAMME_SHORT.summer}</span>;
  const roleChip = (r) => <span className={"chip " + (r === "instructor" ? "chip-gold" : r === "mentor" ? "chip-lime" : "chip-navy")}>{r}</span>;
  const pending = (data && data.pending) || [];
  const all = (data && data.volunteers) || [];
  /* A volunteer with no centre is invisible in every per-site count and prints
     an ID card with nothing on it saying where they belong. The list of
     centres cannot surface them — "none" is not a centre — so it gets its own
     option, and a count next to it so nobody has to go looking. */
  const noCentre = all.filter(v => !(v.centre || "").trim()).length;
  const centreOpts = Array.from(new Set(all.map(v => (v.centre || "").trim()).filter(Boolean))).sort();
  const inCentre = (v) => {
    const c = (v.centre || "").trim();
    if (vCentre === VOL_NO_CENTRE) return !c;
    if (vCentre) return c === vCentre;
    return true;
  };
  const nggCount = all.filter(v => v.programme === "ngg").length;
  const roster = all.filter(v => {
    if (!inCentre(v)) return false;
    if (vProg && (v.programme || "summer") !== vProg) return false;
    if (!q.trim()) return true;
    const s = (v.fullName + " " + v.volunteerId + " " + v.email + " " + v.role).toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Volunteers {data ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {pending.length} pending · {(data.volunteers || []).length} active</span> : null}</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" disabled={!data || !(data.volunteers || []).length} onClick={() => downloadCsv("volunteers", (data.volunteers || []).map(v => ({ volunteerId: v.volunteerId, name: v.fullName, email: v.email, phone: v.phone || "", role: v.role, programme: v.programme || "summer", centre: v.centre || "", faculty: v.faculty || "", courses: (v.courses || []).join("; "), safeguarding: v.safeguarding, status: v.status, createdAt: v.createdAt })))}>Export CSV</button>
        </div>
      </div>

      <div className="admin-filters vol-prog-filter">
        <select className="admin-select" value={vProg} onChange={e => { setData(null); setVProg(e.target.value); }} aria-label="Filter volunteers by programme">
          <option value="">Every programme</option>
          <option value="ngg">NGG Club (incl. both)</option>
          <option value="summer">Summer School (incl. both)</option>
          <option value="both">Serving both</option>
        </select>
      </div>

      <div className="admin-tabs">
        <button className={"admin-tab" + (tab === "pending" ? " is-active" : "")} onClick={() => setTab("pending")}>Review queue{pending.length ? " · " + pending.length : ""}</button>
        <button className={"admin-tab" + (tab === "roster" ? " is-active" : "")} onClick={() => setTab("roster")}>Roster · {(data && (data.volunteers || []).length) || 0}</button>
        <button className={"admin-tab" + (tab === "needs" ? " is-active" : "")} onClick={() => setTab("needs")}>Needs &amp; /v-status</button>
        <button className={"admin-tab" + (tab === "ngg-activities" ? " is-active" : "")} onClick={() => setTab("ngg-activities")}>NGG activities</button>
      </div>

      {tab === "needs" ? <VolunteerNeedsEditor/> :
        tab === "ngg-activities" ? <AcademyCatalogue source="ngg-volunteer"/> :
        err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        data === null ? <div className="dash-spinner"/> :

        tab === "pending" ? (
          pending.length === 0 ? <div className="admin-empty">No volunteers waiting for review. 🎉</div> :
          <div className="admin-app-list">
            {pending.map(a => (
              <div className="admin-app" key={a.id}>
                <div className="admin-app-top">
                  <div>
                    <div className="admin-cell-name">{a.name} {roleChip(a.role)} {progChip(a.programme)}</div>
                    <div className="mono admin-cell-sub">{a.email}{a.phone ? " · " + a.phone : " · no phone"}{a.centre ? " · 🏫 " + a.centre : ""}{a.faculty ? " · " + a.faculty : ""}{(a.courses || []).length ? " · " + a.courses.join(", ") : ""} · {fmtDate(a.createdAt)}</div>
                  </div>
                  {a.role === "instructor" && !a.phone && <span className="chip status-archived">phone required</span>}
                </div>
                {!expanded.has(a.id) && a.why && <p className="admin-app-why">{a.why}</p>}
                {expanded.has(a.id) && <ApplicantDetail a={a}/>}
                <div className="admin-app-actions">
                  <button className="btn btn-ghost btn-sm" aria-expanded={expanded.has(a.id)} onClick={() => toggleExpand(a.id)}>{expanded.has(a.id) ? "Hide details ▴" : "View details ▾"}</button>
                  <button className="btn btn-primary btn-sm" disabled={busy === "a" + a.id || (a.role === "instructor" && !a.phone)} onClick={() => approve(a)}>{busy === "a" + a.id ? "Approving…" : "Approve & issue ID →"}</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === "d" + a.id} onClick={() => decline(a)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="admin-filters">
              <input className="admin-input" placeholder="Search name, ID, email, role…" value={q} onChange={e => setQ(e.target.value)}/>
              <select className="admin-select" value={vCentre} onChange={e => setVCentre(e.target.value)} aria-label="Filter volunteers by centre">
                <option value="">All centres · {all.length}</option>
                {centreOpts.map(c => <option key={c} value={c}>{c} · {all.filter(v => (v.centre || "").trim() === c).length}</option>)}
                {noCentre > 0 && <option value={VOL_NO_CENTRE}>⚠ No centre on file · {noCentre}</option>}
              </select>
              <select className="admin-select" value={vProg} onChange={e => setVProg(e.target.value)} aria-label="Filter volunteers by programme">
                <option value="">Summer + NGG · {all.length}</option>
                <option value="ngg">NGG (year-round) · {nggCount}</option>
                <option value="summer">Summer (seasonal) · {all.length - nggCount}</option>
              </select>
              {noCentre > 0 && vCentre !== VOL_NO_CENTRE &&
                <button className="btn btn-ghost btn-sm" onClick={() => setVCentre(VOL_NO_CENTRE)}>⚠ {noCentre} with no centre</button>}
            </div>
            {vCentre === VOL_NO_CENTRE && roster.length > 0 &&
              <p className="admin-hint" style={{ margin: "-2px 0 10px" }}>
                These volunteers are missing from every per-centre count, and their ID card prints with no centre colour, code or band. Edit each one to set it.
              </p>}
            {roster.length === 0 ? <div className="admin-empty">{all.length ? "No volunteer matches that filter." : "No volunteers yet."}</div> :
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th scope="col">Volunteer</th><th scope="col">Role</th><th scope="col">Serves</th><th scope="col">Centre</th><th scope="col">Faculty / Courses</th><th scope="col">Safeguarding</th><th scope="col">ID</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {roster.map(v => (
                    <React.Fragment key={v.volunteerId}>
                    <tr>
                      <td><div className="admin-cell-name">{v.fullName} {progChip(v.programme)}</div><div className="mono admin-cell-sub">{v.volunteerId} · {v.email}</div></td>
                      <td>{roleChip(v.role)}</td>
                      <td>{progChip(v.programme)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{v.centre || "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{[v.faculty, (v.courses || []).join(", ")].filter(Boolean).join(" · ") || "—"}</td>
                      <td>
                        {v.safeguarding === "cleared"
                          ? <span className="chip chip-lime">✓ screened</span>
                          : <span className="chip status-archived">pending</span>}
                        {/* Who can open the roster is a safeguarding fact, so it
                            belongs next to the screening state rather than
                            behind an Edit click. */}
                        {(v.caps || []).length > 0 &&
                          <span className="chip chip-navy" style={{ marginLeft: 6 }}
                            title={"Mentor portal access at " + (v.centre || "—") + ": " + (v.caps || []).join(" + ")}>
                            portal · {(v.caps || []).join(" + ")}
                          </span>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}><a href={"/q/" + v.token} target="_blank" rel="noreferrer">/q/{(v.token || "").slice(0, 10)}…</a></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {crCtx && <button className="btn btn-ghost btn-sm" onClick={() => crCtx.form(volunteerEditForm(v, volCentres, load, { list: data.titles, def: data.titleDefault }))}>Edit details</button>}
                        <button className="btn btn-ghost btn-sm" aria-expanded={editId === v.volunteerId} onClick={() => setEditId(editId === v.volunteerId ? "" : v.volunteerId)}>{editId === v.volunteerId ? "Close" : "Photo & portal access"}</button>
                        {(v.programme || "summer") === "summer" && v.status === "active" &&
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditId(editId === "ngg:" + v.volunteerId ? "" : "ngg:" + v.volunteerId)}>{editId === "ngg:" + v.volunteerId ? "Close" : "Bring into NGG"}</button>}
                        {v.safeguarding === "cleared"
                          ? <button className="btn btn-ghost btn-sm" disabled={busy === "s" + v.volunteerId} onClick={() => setSafeguard(v, "pending")}>Un-clear</button>
                          : <button className="btn btn-primary btn-sm" disabled={busy === "s" + v.volunteerId} onClick={() => setSafeguard(v, "cleared")}>{busy === "s" + v.volunteerId ? "…" : "Mark screened"}</button>}
                      </td>
                    </tr>
                    {editId === "ngg:" + v.volunteerId && <tr><td colSpan={8} className="vol-ngg-cell">
                      <VolunteerNggMove v={v} onDone={() => { setEditId(""); load(); }}/>
                    </td></tr>}
                    {editId === v.volunteerId && <tr><td colSpan={8} style={{ background: "rgba(12,20,50,0.03)" }}>
                      <VolunteerMore v={v} onSaved={load} onDelete={() => removeVol(v)}/>
                      <VolunteerPortalAccess v={v} onSaved={load}/>
                    </td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>}
          </>
        )
      }
    </div>
  );
}

// ============================================================================
// Newsletter
// ============================================================================

/* Homepage promo banner editor — text + optional CTA + expiry. */
function AdminPromo() {
  const [p, setP] = React.useState({ text: "", ctaLabel: "", ctaUrl: "", expires: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { NGGApi.admin.promotions.get().then(r => { if (r.promo) setP({ text: r.promo.text || "", ctaLabel: r.promo.ctaLabel || "", ctaUrl: r.promo.ctaUrl || "", expires: (r.promo.expires || "").slice(0, 10) }); }).catch(() => {}); }, []);
  const save = async (clear) => {
    setBusy(true);
    try {
      const promo = clear ? null : { text: p.text.trim(), ctaLabel: p.ctaLabel.trim(), ctaUrl: p.ctaUrl.trim(), expires: p.expires ? p.expires + "T23:59:59Z" : "" };
      await NGGApi.admin.promotions.set(promo);
      if (clear) setP({ text: "", ctaLabel: "", ctaUrl: "", expires: "" });
      toast.success(clear ? "Promo cleared." : "Promo saved — live on the homepage.", "Homepage promo");
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Homepage promo banner</div>
      <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>A dismissible banner across the top of the public homepage. Leave the text blank (or Clear) to hide it; set an expiry to auto-retire it.</p>
      <Field label="Banner text" value={p.text} onChange={v => setP(o => ({ ...o, text: v }))} placeholder="e.g. Summer School registration closes Friday!"/>
      <div className="admin-fields-row">
        <Field label="Button label (optional)" value={p.ctaLabel} onChange={v => setP(o => ({ ...o, ctaLabel: v }))} placeholder="Register now"/>
        <Field label="Button link (optional)" value={p.ctaUrl} onChange={v => setP(o => ({ ...o, ctaUrl: v }))} placeholder="/join"/>
        <Field label="Expires (optional)" type="date" value={p.expires} onChange={v => setP(o => ({ ...o, expires: v }))}/>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !p.text.trim()} onClick={() => save(false)}>Save promo</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save(true)}>Clear</button>
      </div>
    </>
  );
}

function AdminNewsletter() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [msg, setMsg] = React.useState({ subject: "", body: "" });
  const [busy, setBusy] = React.useState(false);
  const load = () => { setErr(""); NGGApi.admin.newsletter().then(setD).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { load(); }, []);
  const send = async () => {
    const active = (d && d.active) || 0;
    if (!(await dialog.confirm({ title: "Send to " + active + " subscriber(s)?", body: "Emails the current newsletter to everyone subscribed. There's no undo.", cta: "Send newsletter", danger: true }))) return;
    setBusy(true);
    try { const r = await NGGApi.admin.newsletterSend(msg.subject, msg.body); toast.success("Sent to " + (r.sent || 0) + (r.skipped ? " (" + r.skipped + " skipped)" : "") + ".", "Newsletter"); setMsg({ subject: "", body: "" }); }
    catch (e) { toast.error(e.code || e.message, "Couldn't send"); } finally { setBusy(false); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Newsletter {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {d.active}/{d.total} active</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!d || !d.subscribers.length} onClick={() => downloadCsv("newsletter", d.subscribers)}>Export CSV</button>
      </div>
      <div className="admin-fields" style={{ maxWidth: 640, marginBottom: 18 }}>
        <div className="admin-fields-h" style={{ fontWeight: 700 }}>Compose &amp; send</div>
        <Field label="Subject" value={msg.subject} onChange={v => setMsg(o => ({ ...o, subject: v }))}/>
        <label className="admin-field"><span className="admin-label">Body</span><textarea className="admin-input" rows={6} value={msg.body} onChange={e => setMsg(o => ({ ...o, body: e.target.value }))} placeholder="Write your update — plain text; links become clickable."/></label>
        <div><button className="btn btn-primary btn-sm" disabled={busy || msg.subject.trim().length < 3 || msg.body.trim().length < 10} onClick={send}>{busy ? "Sending…" : "Send newsletter"}</button> <span className="admin-hint">Each email includes a one-click unsubscribe link.</span></div>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        !d ? <div className="dash-spinner"/> :
        d.subscribers.length === 0 ? <div className="admin-empty">No subscribers yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Email</th><th>Source</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>{d.subscribers.map((s, i) => <tr key={i}><td>{s.email}</td><td>{s.source}</td><td><span className={"chip status-" + (s.status === "subscribed" ? "published" : "archived")}>{s.status}</span></td><td className="mono">{fmtDate(s.createdAt)}</td></tr>)}</tbody>
        </table></div>
      }
    </div>
  );
}

// ============================================================================
// Messages — contact-form inbox
// ============================================================================

function AdminContact() {
  const [d, setD] = React.useState(null);
  const [filter, setFilter] = React.useState({ status: "", purpose: "" });
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.contact.list(filter).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.status, filter.purpose]);
  const setStatus = async (id, status) => { try { await NGGApi.admin.contact.status(id, status); load(); } catch (e) { toast.error(e.code || e.message); } };
  const msgs = d ? d.messages : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Messages {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {d.unread} new</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!msgs || !msgs.length} onClick={() => downloadCsv("messages", (msgs || []).map(m => ({ ref: m.ref, purpose: m.purpose, name: m.name, email: m.email, phone: m.phone || "", subject: m.subject || "", message: m.message, status: m.status, createdAt: m.createdAt })))}>Export CSV</button>
      </div>
      <div className="admin-filters">
        <select className="admin-select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}><option value="">All statuses</option><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option></select>
        <select className="admin-select" value={filter.purpose} onChange={e => setFilter(f => ({ ...f, purpose: e.target.value }))}><option value="">All topics</option><option value="general">General</option><option value="apply">Admissions</option><option value="mentor">Mentoring</option><option value="partner">Partnership</option><option value="media">Media</option><option value="support">Support</option></select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        msgs === null ? <div className="dash-spinner"/> :
        msgs.length === 0 ? <div className="admin-empty">No messages.</div> :
        <div className="admin-app-list">
          {msgs.map(m => (
            <div className="admin-app" key={m.id}>
              <div className="admin-app-top">
                <div>
                  <div className="admin-cell-name">{m.name} <span className="chip chip-navy">{m.purpose}</span></div>
                  <div className="mono admin-cell-sub">{m.email}{m.phone ? " · " + m.phone : ""} · {fmtDate(m.createdAt)} · {m.ref}</div>
                </div>
                <span className={"chip status-" + (m.status === "replied" ? "published" : m.status === "archived" ? "archived" : "draft")}>{m.status}</span>
              </div>
              {m.subject && <div style={{ fontWeight: 600, marginTop: 6 }}>{m.subject}</div>}
              <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{m.message}</p>
              <div className="admin-app-actions">
                <select className="admin-select admin-app-status" value={m.status} onChange={e => setStatus(m.id, e.target.value)}>
                  <option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option>
                </select>
                <a className="btn btn-ghost btn-sm" href={"mailto:" + m.email + "?subject=" + encodeURIComponent("Re: " + (m.subject || "Your message") + " (" + m.ref + ")")}>Reply by email →</a>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ============================================================================
// Settings
// ============================================================================

/* ── AI status ───────────────────────────────────────────────────────────────
   Every AI feature here falls back to deterministic rules when no key is
   configured. That is correct and completely silent: the behaviour monitor
   keeps classifying and nothing says the intelligent half is switched off, so
   an operator can run for months believing observations are being read by a
   model when they are being matched against a word list.

   The probe matters as much as the status. A key that is SET but rejected —
   revoked, out of credit, wrong project — looks identical to a working one
   from configuration alone, and that is exactly the failure worth catching
   before somebody relies on it. */
function AiStatusPanel() {
  const [rows, setRows] = React.useState(null);
  const [any, setAny] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = (probe) => {
    setBusy(true); setErr("");
    NGGApi.admin.summer.aiStatus(probe)
      .then(r => { setRows(r.ai || []); setAny(!!r.anyEnabled); })
      .catch(e => setErr(e.code || e.message))
      .then(() => setBusy(false));
  };
  React.useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  if (err) return <ErrorState title="Couldn't read AI status" code={err} onRetry={() => load(false)}/>;
  if (!rows) return <div className="dash-spinner"/>;

  return (
    <div style={{ marginTop: 28 }}>
      <div className="admin-section-head" style={{ marginBottom: 10 }}>
        <h3 className="admin-h2" style={{ fontSize: 18 }}>AI</h3>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => load(true)}>
          {busy ? "Testing…" : "Test the keys"}
        </button>
      </div>
      <div className="policy-callout" data-tone={any ? "ok" : "warn"}>
        {any
          ? <><b>AI is on.</b> Profiles below show which provider answers each feature. Press <b>Test the keys</b> to send one real request per profile — a key that is set but rejected looks identical to a working one until you do.</>
          : <><b>AI is off — everything still works.</b> No provider key is configured, so every feature below runs on its built-in rules instead. Nothing is broken; it is just not intelligent. Add a Groq or Gemini key in <code>api/config.php</code> to switch it on.</>}
      </div>
      <div className="admin-table-wrap" style={{ marginTop: 12 }}><table className="admin-table">
        <thead><tr><th>Feature</th><th>Status</th><th>Provider</th><th>Test</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.profile}>
            <td><b>{r.profile}</b><div className="admin-cell-sub" style={{ fontSize: 12 }}>{r.what}</div></td>
            <td>
              {r.enabled
                ? <span className="chip status-published">On</span>
                : <span className="chip status-draft">Rules only</span>}
              {!r.enabled && <div className="admin-cell-sub" style={{ fontSize: 11.5 }}>{r.behaviourWhenOff}</div>}
            </td>
            <td className="mono" style={{ fontSize: 12 }}>
              {r.enabled ? (r.provider + (r.model ? " · " + r.model : "")) : "—"}
              {r.fallbacks > 0 && <div className="admin-cell-sub" style={{ fontSize: 11 }}>+{r.fallbacks} fallback{r.fallbacks === 1 ? "" : "s"}</div>}
            </td>
            <td>
              {!r.probe ? <span className="admin-cell-sub" style={{ fontSize: 12 }}>not tested</span>
                : r.probe.ok ? <span className="chip status-published">OK · {r.probe.ms}ms</span>
                : <span className="chip" style={{ background: "var(--coral)", color: "#fff" }}>{r.probe.error}</span>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function AdminSettings() {
  const [s, setS] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    NGGApi.admin.settings.get().then(r => setS(r.settings)).catch(e => { toast.error(e.code || e.message); setS({}); });
    NGGApi.admin.sessions.list(new Date().getFullYear()).then(r => setSessions(r.sessions || [])).catch(() => {});
  }, []);
  const save = async () => { setBusy(true); try { await NGGApi.admin.settings.set(s); setSaved(true); setTimeout(() => setSaved(false), 2200); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };
  const [mailTo, setMailTo] = React.useState("");
  const [mailBusy, setMailBusy] = React.useState(false);
  const [mailRes, setMailRes] = React.useState(null);
  const testMail = async () => {
    setMailBusy(true);
    try {
      const r = await NGGApi.admin.settings.testMail(mailTo.trim());
      setMailRes(r);
      if (r.delivered) toast.success("Sent to " + r.to + " via " + r.mode + ". Check the inbox (and spam).", "Email OK");
      else toast.error((r.mode === "php_mail" ? "PHP mail() failed. " : "SMTP failed. ") + (r.error || "No detail.") , "Delivery failed");
    } catch (e) { toast.error(e.code || e.message); }
    finally { setMailBusy(false); }
  };
  if (!s) return <div className="admin-section"><div className="dash-spinner"/></div>;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Settings</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="mono" style={{ color: saved ? "var(--lime-ink)" : "var(--ink-500)" }}>{saved ? "SAVED ✓" : busy ? "SAVING…" : ""}</span><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Save</button></div>
      </div>
      <div className="admin-fields" style={{ maxWidth: 520 }}>
        <FieldCheckbox label="Teen applications open" value={s.applications_open} onChange={v => setS(o => ({ ...o, applications_open: v }))}/>
        <FieldCheckbox label="Mentor applications open" value={s.mentor_applications_open} onChange={v => setS(o => ({ ...o, mentor_applications_open: v }))}/>
        <FieldCheckbox label="Summer volunteer registration open (/volunteer — the summer season only)" value={s.volunteer_applications_open} onChange={v => setS(o => ({ ...o, volunteer_applications_open: v }))}/>
        <FieldCheckbox label="NGG volunteer registration open (/join/volunteer — all year)" value={s.ngg_volunteer_applications_open !== false} onChange={v => setS(o => ({ ...o, ngg_volunteer_applications_open: v }))}/>
        <FieldCheckbox label="Text volunteer IDs by SMS (when phone on file)" value={s.volunteer_sms_notify} onChange={v => setS(o => ({ ...o, volunteer_sms_notify: v }))}/>
        <FieldCheckbox label="Email a state note on check-in (award-focus when doing well, a nudge otherwise)" value={s.checkin_state_emails} onChange={v => setS(o => ({ ...o, checkin_state_emails: v }))}/>
        <FieldCheckbox label="Email NGG members the Quote of the Week every Monday (the same quote as their Anchor Journal)" value={s.qotw_mail} onChange={v => setS(o => ({ ...o, qotw_mail: v }))}/>
        <FieldCheckbox label="Companion: assess every NGG member weekly and email them (and their parent) the check-in" value={s.companion_enabled} onChange={v => setS(o => ({ ...o, companion_enabled: v }))}/>
        <Field label="Hours credited per volunteer session" type="number" value={s.volunteer_session_hours} onChange={v => setS(o => ({ ...o, volunteer_session_hours: v }))}/>
        <FieldSelect label="Featured session (homepage countdown)" value={s.featured_session_id || ""} onChange={v => setS(o => ({ ...o, featured_session_id: v }))} options={[""].concat(sessions.map(x => x.sessionId))}/>
        <FieldCheckbox label="Geo-fenced registration (auto-pick the centre by location; block off-site sign-ups)" value={s.geofence_enabled} onChange={v => setS(o => ({ ...o, geofence_enabled: v }))}/>
        {s.geofence_enabled && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>Walk-ups must be on-site at a mapped centre to register. Map each centre's point under <b>People → Centres → Map</b>.</p>}
        <FieldCheckbox label="Require a headshot on the public intake forms (teen, volunteer, kiosk)" value={s.intake_photo_required} onChange={v => setS(o => ({ ...o, intake_photo_required: v }))}/>
        {!s.intake_photo_required && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>Photo is optional on sign-up. It can still be added later via Photo review or the ID studio.</p>}
        <FieldCheckbox label="Hold the ID until the photo is approved (issue only after an editor approves the headshot)" value={s.photo_gate_issuance} onChange={v => setS(o => ({ ...o, photo_gate_issuance: v }))}/>
        {s.photo_gate_issuance && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>The QR/ID is bound only once both parent consent is in AND the photo is approved in <b>Photo review</b>. Registrations without a photo are never held.</p>}

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Attendance &amp; punctuality</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Set when each member type is due. Every card scan is stamped <span className="mono">present</span> or <span className="mono">late</span> against these times, and the check-in desk shows it live.</p>
        {(() => {
          const a = s.attendance || {};
          const setA = (k, v) => setS(o => ({ ...o, attendance: { ...(o.attendance || {}), [k]: v } }));
          const rbt = a.resumptionByType || {};
          const setR = (type, v) => setS(o => ({ ...o, attendance: { ...(o.attendance || {}), resumptionByType: { ...((o.attendance || {}).resumptionByType || {}), [type]: v } } }));
          const TYPES = [["member", "NGG Club members"], ["student", "Summer School participants"], ["volunteer", "Volunteers"], ["default", "Everyone else (default)"]];
          const cbt = a.closeByType || {};
          const setC = (type, v) => setS(o => ({ ...o, attendance: { ...(o.attendance || {}), closeByType: { ...((o.attendance || {}).closeByType || {}), [type]: v } } }));
          return (
            <React.Fragment>
              <FieldCheckbox label="Flag lateness at check-in" value={a.enabled !== false} onChange={v => setA("enabled", v)}/>
              {a.enabled !== false && <React.Fragment>
                {TYPES.map(([type, label]) => (
                  <Field key={type} label={"Resumption time — " + label} type="time" value={rbt[type] || (type === "volunteer" ? "08:30" : "09:00")} onChange={v => setR(type, v)}/>
                ))}
                <div className="admin-fields-row">
                  <Field label="Grace period (minutes) before 'late'" type="number" value={a.graceMinutes ?? 10} onChange={v => setA("graceMinutes", parseInt(v, 10) || 0)}/>
                  <Field label="Timezone offset from UTC (minutes; WAT = 60)" type="number" value={a.tzOffset ?? 60} onChange={v => setA("tzOffset", parseInt(v, 10) || 0)}/>
                </div>
              </React.Fragment>}
              <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Closing time</div>
              <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Nobody can sign out before closing time — the desk, the kiosk and the CACENTRE gate all refuse it, so a sign-out is proof somebody stayed to the end. Somebody who leaves early has no sign-out for the day, and the conduct policy counts that. An admin signed in to the Control Room can still let a person go early with a written reason, which is recorded. Leave a time blank for no closing time.</p>
              {[["member", "NGG Club members"], ["student", "Summer School participants"], ["volunteer", "Summer volunteers"]].map(([type, label]) => (
                <Field key={type} label={"Closing time — " + label} type="time" value={cbt[type] || ""} onChange={v => setC(type, v)}/>
              ))}
            </React.Fragment>
          );
        })()}

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Email delivery</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Send a real test email and see exactly what happened. If it fails on <span className="mono">php_mail</span>, set <span className="mono">mail.smtp.*</span> in <span className="mono">api/config.php</span> — shared hosts usually drop plain mail().</p>
        <div className="admin-fields-row" style={{ alignItems: "end" }}>
          <Field label="Send test to (blank = your email)" value={mailTo} onChange={setMailTo} type="email"/>
          <button className="btn btn-ghost btn-sm" disabled={mailBusy} onClick={testMail} style={{ height: 40 }}>{mailBusy ? "Sending…" : "Send test email"}</button>
        </div>
        {mailRes && (
          <div className="admin-hint" style={{ margin: "2px 0 0", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line-200, #e6e8ee)", background: "var(--surface-50, #f8fafc)", fontSize: 12.5, lineHeight: 1.6 }}>
            <div><b>{mailRes.delivered ? "✓ Delivered" : "✗ Not delivered"}</b> · mode <span className="mono">{mailRes.mode}</span> · to <span className="mono">{mailRes.to}</span></div>
            <div>From <span className="mono">{mailRes.from}</span>{mailRes.replyTo ? <> · reply-to <span className="mono">{mailRes.replyTo}</span></> : null}</div>
            {mailRes.smtp && <div>SMTP <span className="mono">{mailRes.smtp.host}:{mailRes.smtp.port}</span> ({mailRes.smtp.secure || "plain"}){mailRes.smtp.authUser ? <> · auth <span className="mono">{mailRes.smtp.authUser}</span></> : null}</div>}
            {mailRes.error ? <div style={{ color: "var(--danger-600, #b91c1c)" }}>Error: {mailRes.error}</div> : null}
            {(mailRes.hints || []).map((h, i) => <div key={i} style={{ color: "var(--amber-800, #9a3412)" }}>⚠ {h}</div>)}
          </div>
        )}

        <AdminPromo/>

        <AiStatusPanel/>

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Staff sign-in</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>How long a Control Room session may sit with nobody touching it before it locks. A warning appears two minutes before, and reading or clicking anywhere keeps it alive — the clock only runs when nobody is there.</p>
        <FieldSelect label="Sign out staff after" value={String(s.session_idle_admin ?? 1800)}
          onChange={v => setS(o => ({ ...o, session_idle_admin: Number(v) }))}
          options={[
            { value: "900", label: "15 minutes" },
            { value: "1800", label: "30 minutes (default)" },
            { value: "3600", label: "1 hour" },
            { value: "14400", label: "4 hours" },
            { value: "43200", label: "12 hours — a full working day" },
            { value: "0", label: "Never — only for a locked, private office" },
          ]}/>

        {/* The Control Room has no site nav, so this is where the accessibility
            controls live for staff. Device-local, like everywhere else: they
            describe how THIS screen needs to behave, and a coordinator on a
            shared desk machine should not have to change an account setting to
            turn contrast up for an afternoon. */}
        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Accessibility (this device)</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Applies to the Control Room and the public site in this browser. Nothing here is saved to your account or shared with anyone else.</p>
        <A11ySettingsPanel/>

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>ID card branding</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Drives the printed cards + digital IDs. The card QR always encodes the student's <span className="mono">/q/&lt;token&gt;</span> profile URL, so scanning with any phone opens their page.</p>
        {(() => {
          const id = s.idcard || {};
          const setId = (k, v) => setS(o => ({ ...o, idcard: { ...(o.idcard || {}), [k]: v } }));
          return (
            <React.Fragment>
              <div className="admin-fields-row">
                <Field label="Programme name" value={id.program || ""} onChange={v => setId("program", v)}/>
                <Field label="Year" value={id.year || ""} onChange={v => setId("year", v)}/>
              </div>
              <Field label="Motto" value={id.motto || ""} onChange={v => setId("motto", v)}/>
              {/* How long a newly issued card stays valid. Existing cards keep
                  the expiry they were issued with — changing this must not
                  silently revoke a card already in a child's pocket. */}
              <div className="admin-fields-row">
                <Field label="ID valid for (days · 0 = never expires)" type="number"
                  value={id.validityDays == null ? 90 : id.validityDays}
                  onChange={v => setId("validityDays", v === "" ? 0 : parseInt(v, 10) || 0)}/>
                <div style={{ alignSelf: "end", paddingBottom: 8 }}>
                  <span className="admin-hint" style={{ margin: 0 }}>
                    {Number(id.validityDays) === 0
                      ? "Cards never expire. Anyone issued one keeps gate access indefinitely."
                      : "New cards expire " + (id.validityDays == null ? 90 : id.validityDays) + " days after they are issued. Expired cards are refused at every gate."}
                  </span>
                </div>
              </div>
              <div className="admin-fields-row">
                <Field label="Website (printed on card)" value={id.website || ""} onChange={v => setId("website", v)}/>
                <Field label="Phone (printed on card)" value={id.phone || ""} onChange={v => setId("phone", v)}/>
              </div>
              <Field label="Lockup logo URL" value={id.logoLockup || ""} onChange={v => setId("logoLockup", v)}/>
              <Field label="Okun/partner logo URL (card back)" value={id.logoOkun || ""} onChange={v => setId("logoOkun", v)}/>
            </React.Fragment>
          );
        })()}
      </div>
    </div>
  );
}

/* ============================================================================
   ID CARDS — the print log, and "is the card in their hand the current one?"

   The design studio could draw a card and the batch drawer could print three
   hundred, and NOTHING recorded that it had happened. A run left an audit line
   and no rows, so three questions an ID desk asks out loud had no answer:

     · has this member ever been issued a card, and how many times?
     · which DESIGN is the one in their hand — the current published version,
       or a version from before the centre changed colour?
     · what did we send to the printer in July, and can we do exactly that
       again for the eleven that came back creased?

   Now every credential run writes one row for the batch and one per person,
   each carrying the FROZEN template version (see api/_lib/domain/card-runs.php).
   This screen is where those rows are read. It deliberately does not print
   anything: rendering happens in the Design Studio, on the canvas that drew the
   proof, because that is where the renderer is.
   ============================================================================ */
const CARD_RUN_MODE_META = {
  print:   { label: "New issue", chip: "chip-lime" },
  reprint: { label: "Reprint",   chip: "chip-gold" },
  proof:   { label: "Proof",     chip: "" },
};

function AdminIdCards() {
  const [tab, setTab] = useAdminTab("log", React.useCallback(t => t === "log" || t === "history", []));
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">ID cards</h2>
        <div className="admin-section-actions">
          {/* The studio renders; this screen records. Both doors, side by side,
              because an operator arriving here to check a card usually wants to
              reprint it, and the studio had no nav of its own for years. */}
          <a className="btn btn-ghost btn-sm" href="/designer" target="_blank" rel="noreferrer">Open the Design Studio ↗</a>
          <a className="btn btn-ghost btn-sm" href="/cards" target="_blank" rel="noreferrer">Open the Card Studio ↗</a>
        </div>
      </div>
      <p className="admin-hint">
        Every credential run is recorded with the design and the exact published <b>version</b> it used, so
        “reprint that batch as it was in July” and “is the card in their hand current?” are both answerable.
        Cards are designed and rendered in the <b>Design Studio</b>; member cards can also be printed straight
        from <b>Members → Print IDs</b>.
      </p>
      <div className="admin-anchor-tabs" role="tablist" aria-label="ID card sections">
        {[["log", "Print log"], ["history", "One person's cards"]].map(([id, lbl]) => (
          <button key={id} role="tab" id={"idctab-" + id} aria-selected={tab === id} aria-controls="idcpanel"
            tabIndex={tab === id ? 0 : -1}
            className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>
      <div id="idcpanel" role="tabpanel" aria-labelledby={"idctab-" + tab} tabIndex={-1}>
        {tab === "log" && <AdminCardRuns/>}
        {tab === "history" && <AdminCardHistoryLookup/>}
      </div>
    </div>
  );
}

function AdminCardRuns() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [f, setF] = React.useState({ kind: "", mode: "" });
  const [page, setPage] = React.useState(1);
  const [openRun, setOpenRun] = React.useState(null);

  const load = React.useCallback((p) => {
    setErr("");
    return NGGApi.admin.registration.cardRuns(Object.assign({}, f, { page: p || page, pageSize: 25 }))
      .then(setD).catch(e => setErr(e.code || e.message || "load_failed"));
    // eslint-disable-next-line
  }, [f, page]);
  React.useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [f.kind, f.mode]);

  if (err) return <ErrorState title="Couldn't load the print log" code={err} onRetry={() => load()}/>;
  if (!d) return <div className="dash-spinner"/>;
  const runs = d.runs || [];

  return (
    <div>
      <div className="admin-filters">
        <select className="admin-select" value={f.kind} onChange={e => setF(x => ({ ...x, kind: e.target.value }))}
          aria-label="Filter the print log by card kind">
          <option value="">Every card</option>
          <option value="member">NGG member cards</option>
          <option value="student">Summer School cards</option>
          <option value="volunteer">Volunteer cards</option>
        </select>
        <select className="admin-select" value={f.mode} onChange={e => setF(x => ({ ...x, mode: e.target.value }))}
          aria-label="Filter the print log by run type">
          <option value="">New issues and reprints</option>
          <option value="print">New issues only</option>
          <option value="reprint">Reprints only</option>
          <option value="proof">Proofs</option>
        </select>
      </div>
      {runs.length === 0
        ? <EmptyState icon="▣" title="Nothing has been printed yet"
            message="A run appears here the moment the Design Studio finishes writing a file. Runs made before this log existed are not in it — the record starts now."/>
        : <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="sr-only">Card print runs, newest first</caption>
              <thead><tr>
                <th scope="col">When</th>
                <th scope="col">Design</th>
                <th scope="col">Type</th>
                <th scope="col" className="admin-num">Cards</th>
                <th scope="col">Output</th>
                <th scope="col">Run by</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>{runs.map(r => {
                const m = CARD_RUN_MODE_META[r.mode] || { label: r.mode, chip: "" };
                return (
                  <tr key={r.runId}>
                    <td className="admin-cell-sub">{fmtDateTime(r.finishedAt || r.startedAt)}<div className="mono admin-cell-sub">{r.runId}</div></td>
                    <td>
                      <b>{r.templateName || <span className="admin-cell-sub">built-in card</span>}</b>
                      {/* The version is the whole point of the record. */}
                      <div className="mono admin-cell-sub">
                        {r.templateVersion ? "v" + r.templateVersion : "no version — hand-coded card"}
                        {r.backTemplateId ? " · with a back" : ""}
                      </div>
                    </td>
                    <td>
                      <span className={"chip " + m.chip}>{m.label}</span>
                      {r.reason ? <div className="admin-cell-sub">{r.reason}</div> : null}
                    </td>
                    <td className="admin-num">
                      {fmtNum(r.issued)}
                      {r.failed ? <div className="admin-cell-sub" style={{ color: "#b03535" }}>{r.failed} failed</div> : null}
                    </td>
                    <td className="admin-cell-sub">{(r.output || "—").toUpperCase()}{r.dpi ? " · " + r.dpi + "dpi" : ""}{r.sheet ? " · " + r.sheet : ""}</td>
                    <td className="admin-cell-sub">{r.actorName || r.actorId || "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setOpenRun(r)}>Who was in it</button>
                      {/* A reprint is a rendering job, so it happens in the
                          studio. The link carries the design so the operator
                          does not have to remember which of forty it was. */}
                      {r.templateId
                        ? <a className="btn btn-ghost btn-sm" href={"/designer?template=" + encodeURIComponent(r.templateId) + "&reprintOf=" + encodeURIComponent(r.runId)}
                             target="_blank" rel="noreferrer">Reprint ↗</a>
                        : null}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            <Pager page={page} pageSize={d.pageSize || 25} total={d.total || 0} onPage={(p) => { setPage(p); load(p); }}/>
          </div>}
      {openRun && <AdminCardRunDetail run={openRun} onClose={() => setOpenRun(null)}/>}
    </div>
  );
}

function AdminCardRunDetail({ run, onClose }) {
  const drawer = useAdminDrawer(onClose, false);
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    NGGApi.admin.registration.cardRunGet(run.runId).then(setD).catch(e => setErr(e.code || e.message));
  }, [run.runId]);
  const m = CARD_RUN_MODE_META[run.mode] || { label: run.mode, chip: "" };
  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <div className="admin-drawer-panel admin-drawer-wide" role="dialog" aria-modal="true" {...drawer.titleProps}
        ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>{run.templateName || "Built-in card"} · {m.label}</h3>
          <button className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll">
          <div className="admin-fields">
            <p className="admin-hint" style={{ margin: 0 }}>
              <b>{fmtNum(run.issued)}</b> card{run.issued === 1 ? "" : "s"} on {fmtDateTime(run.finishedAt || run.startedAt)}
              {run.templateVersion ? <> from <b>version {run.templateVersion}</b></> : <> from the built-in card, which carries no version</>}.
              {run.failed ? <> {run.failed} could not be rendered and are not in the file.</> : null}
            </p>
            {err ? <ErrorState title="Couldn't load the run" code={err}/> :
             !d ? <div className="dash-spinner"/> :
             <div className="admin-table-wrap"><table className="admin-table">
               <caption className="sr-only">People in run {run.runId}</caption>
               <thead><tr>
                 <th scope="col">Printed ID</th><th scope="col">Record</th>
                 <th scope="col">First or repeat</th><th scope="col">Result</th>
               </tr></thead>
               <tbody>{(d.issues || []).map((i, k) => (
                 <tr key={i.subjectId + ":" + k}>
                   <td className="mono">{i.displayId || <span className="admin-cell-sub">—</span>}</td>
                   <td className="mono admin-cell-sub">{i.subjectId}</td>
                   <td>{i.reprint ? <span className="chip chip-gold">repeat</span> : <span className="chip chip-lime">first</span>}</td>
                   <td>{i.ok ? <span className="admin-cell-sub">printed</span>
                            : <span className="chip chip-crimson" title={i.note || ""}>not printed</span>}</td>
                 </tr>
               ))}</tbody>
             </table></div>}
          </div>
        </div>
        <div className="admin-drawer-foot">
          <button className="btn btn-ghost btn-sm" onClick={drawer.close}>Close</button>
          {run.templateId && (
            <a className="btn btn-primary btn-sm" href={"/designer?template=" + encodeURIComponent(run.templateId) + "&reprintOf=" + encodeURIComponent(run.runId)}
               target="_blank" rel="noreferrer">Reprint in the Design Studio ↗</a>
          )}
        </div>
      </div>
    </div>
  );
}

/* "Is the card in their hand the current design?"
 *
 * Asked at a desk, out loud, with the person standing there — so the answer
 * leads with the latest issue and whether the published design has moved on
 * since, which is the difference between "reprint it" and "it's fine". */
function AdminCardHistoryLookup() {
  const [type, setType] = React.useState("member");
  const [id, setId] = React.useState("");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const look = async (e) => {
    e && e.preventDefault();
    if (!id.trim()) return;
    setBusy(true); setErr(""); setD(null);
    try { setD(await NGGApi.admin.registration.cardHistory(id.trim(), type)); }
    catch (e2) { setErr(e2.code || e2.message || "load_failed"); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <form className="admin-filters" onSubmit={look}>
        <select className="admin-select" value={type} onChange={e => setType(e.target.value)} aria-label="Whose card">
          <option value="member">NGG member</option>
          <option value="student">Summer School participant</option>
          <option value="volunteer">Volunteer</option>
        </select>
        <input className="admin-input" value={id} onChange={e => setId(e.target.value)}
          placeholder="Member ID, e.g. NGG-2026-0141" aria-label="The record's id"/>
        <button className="btn btn-primary btn-sm" disabled={busy || !id.trim()}>{busy ? "Looking…" : "Look it up"}</button>
      </form>
      {err && <ErrorState title="Couldn't read the card history" code={err} onRetry={look}/>}
      {d && <AdminCardHistory data={d}/>}
    </div>
  );
}

/** The history block itself, so the member detail drawer can show the same
 *  thing without a second implementation of it. */
function AdminCardHistory({ data }) {
  if (!data) return null;
  if (!data.count) {
    return <EmptyState icon="▣" title="No card has been issued to them"
      message="Either they have never been printed, or their card predates the print log — the record starts from when it was added."/>;
  }
  const l = data.latest || {};
  return (
    <div>
      <div className="admin-callout" role="status">
        {data.designMovedOn === true && (
          <p style={{ margin: "0 0 8px", color: "#8a6d00" }}>
            <b>The design has moved on.</b> Their card was printed from version {l.templateVersion} of
            “{l.templateName}”, which has been republished since. A reprint would look different.
          </p>
        )}
        {data.designMovedOn === false && (
          <p style={{ margin: "0 0 8px" }}>
            <b>Their card is the current design</b> — version {l.templateVersion} of “{l.templateName}”.
          </p>
        )}
        {data.designMovedOn === null && (
          <p style={{ margin: "0 0 8px" }}>
            Their card came from the <b>built-in card</b>, which carries no version — so whether it matches
            today's cannot be answered from the record.
          </p>
        )}
        {fmtNum(data.count)} card{data.count === 1 ? "" : "s"} issued
        {data.reprints ? <> · {fmtNum(data.reprints)} of them replacements</> : null}
      </div>
      <div className="admin-table-wrap"><table className="admin-table">
        <caption className="sr-only">Cards issued, newest first</caption>
        <thead><tr>
          <th scope="col">When</th><th scope="col">Printed ID</th>
          <th scope="col">Design</th><th scope="col">Type</th><th scope="col">Result</th>
        </tr></thead>
        <tbody>{(data.issues || []).map((i, k) => (
          <tr key={i.runId + ":" + k}>
            <td className="admin-cell-sub">{fmtDateTime(i.at)}<div className="mono admin-cell-sub">{i.runId}</div></td>
            <td className="mono">{i.displayId || <span className="admin-cell-sub">—</span>}</td>
            <td>{i.templateName || <span className="admin-cell-sub">built-in</span>}
              <div className="mono admin-cell-sub">{i.templateVersion ? "v" + i.templateVersion : "no version"}</div></td>
            <td>{i.reprint ? <span className="chip chip-gold">reprint</span> : <span className="chip chip-lime">first</span>}</td>
            <td>{i.ok ? <span className="admin-cell-sub">printed</span> : <span className="chip chip-crimson">not printed</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ============================================================================
   THE NGG CENTRE DIRECTORY

   A centre is a PLACE, and it belongs to NGG the organisation. An NGG member is
   posted to one all year round, their record points at it BY NAME, and its
   1–4 letter code is the prefix on the ID card in their hand (IJ-26-001) with
   its colour as the card's accent band. Summer School runs at centres; so do
   volunteers, attendance, the public centre pages and the status boards.

   This screen used to live inside Summer School → Registration and the whole
   directory gated on the `summer` capability, which had it backwards in both
   directions: a Summer School coordinator could rename or delete the centre
   every member's record and printed card depended on, and a year-round member
   administrator could not add one at all. Reading is open to either desk;
   writing is `people`, and the server enforces it either way — `canWrite` in
   the payload only stops this screen offering buttons that would 403.

   The counts are per programme, deliberately. One column labelled "enrolled"
   meant Summer School participants in the active edition, which is not what a
   member administrator reads it as.
   ============================================================================ */
function AdminCentres() {
  const [centres, setCentres] = React.useState(null);
  const [leadOptions, setLeadOptions] = React.useState([]);
  const [canWrite, setCanWrite] = React.useState(true);
  /* Set once CACENTRE's locations list has arrived: centres are then added,
     renamed and retired in CACENTRE, and arrive here (domain/cac-locations.php). */
  const [cac, setCac] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");
  const [d, setD] = React.useState({ name: "", code: "", color: "#76B043", capacity: "", programmes: "ngg" });
  /* NGG and Summer School keep separate centre lists: which programme a centre
     runs decides which forms, desks and timetables offer it. The directory is
     filtered by programme so each list can be read on its own. */
  const [prog, setProg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState("");   // "" | "<id>:edit" | "<id>:map"
  const load = () => NGGApi.admin.registration.centres()
    .then(r => { setCentres(r.centres || []); setLeadOptions(r.leadOptions || []); setCanWrite(r.canWrite !== false); setCac(r.cacentre || null); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  // A centre added from the Control Room's own "Add a centre" form appears here at once.
  React.useEffect(() => { const f = () => load(); window.addEventListener("ngg:centres-changed", f); return () => window.removeEventListener("ngg:centres-changed", f); }, []);
  const add = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try { await NGGApi.admin.registration.centreUpsert({ ...d, programmes: d.programmes.split(","), capacity: d.capacity === "" ? 0 : parseInt(d.capacity, 10) || 0 }); invalidateCentreOptCache(); setD({ name: "", code: "", color: "#76B043", capacity: "", programmes: "ngg" }); toast.success("Centre added — open Edit to add its address, lead and contacts."); load(); }
    catch (e2) {
      toast.error(e2.code === "code_taken" ? "That code is already used — it's the printed ID prefix, so it has to be unique."
        : e2.code === "forbidden" ? "Adding a centre needs the member-desk (people) capability."
        : "Check the name (2+) and code (1–4 letters).");
    }
    finally { setBusy(false); }
  };

  /* Removing a centre.
   *
   * This was an unconditional DELETE on a row that member records point at BY
   * NAME, that participants point at by name, that summer groups point at by
   * id, and whose code is already printed on physical cards. Nothing broke
   * loudly — the records simply started pointing at a centre that no longer
   * existed, and the pickers stopped offering theirs.
   *
   * So the server refuses and says what points at it, and the operator gets the
   * choice that is almost always the right one: RETIRE, which keeps the row so
   * every record still resolves and only stops the centre being offered.
   * Deleting outright stays available and has to be asked for twice. */
  const remove = async (c) => {
    if (!(await dialog.confirm({
      title: "Remove " + c.name + "?",
      body: "Members already posted here keep the centre on their record, and cards already printed keep this code and colour.",
      cta: "Remove", danger: true,
    }))) return;
    try {
      await NGGApi.admin.registration.centreDelete(c.centreId);
      invalidateCentreOptCache(); toast.success(c.name + " removed."); load();
    } catch (e) {
      if ((e.code || e.message) !== "centre_in_use") { toast.error(humanizeError(e.message, e.code), "Couldn't remove the centre"); return; }
      const u = (e.data && e.data.uses) || {};
      const parts = [];
      if (u.members) parts.push(u.members + " NGG member" + (u.members === 1 ? "" : "s"));
      if (u.participants) parts.push(u.participants + " Summer School participant" + (u.participants === 1 ? "" : "s"));
      if (u.summerGroups) parts.push(u.summerGroups + " group" + (u.summerGroups === 1 ? "" : "s"));
      if (u.volunteers) parts.push(u.volunteers + " volunteer" + (u.volunteers === 1 ? "" : "s"));
      const retire = await dialog.confirm({
        title: "Still in use by " + (parts.join(", ") || "other records"),
        body: "Retiring is almost certainly what you want: the centre stops being offered anywhere, and every record that names it still resolves. "
          + "Deleting it outright leaves those records pointing at a centre that doesn't exist.",
        cta: "Retire it", cancel: "Delete anyway", danger: false,
      });
      try {
        await NGGApi.admin.registration.centreDelete(c.centreId, retire ? { retire: true } : { force: true });
        invalidateCentreOptCache();
        toast.success(retire ? c.name + " retired — no longer offered, records intact." : c.name + " deleted.");
        load();
      } catch (e2) { toast.error(humanizeError(e2.message, e2.code), "Couldn't remove the centre"); }
    }
  };

  const geoLabel = (c) => c.lat == null ? <span className="chip status-archived">— unmapped</span> : c.geofence ? <span className="chip chip-lime">🟢 fence on · {c.radiusM || 150}m</span> : <span className="chip">mapped · off</span>;
  const toggle = (c, mode) => setOpenId(openId === c.centreId + ":" + mode ? "" : c.centreId + ":" + mode);
  /* Every hook runs before any early return. This useMemo used to sit BELOW
     the error branch, so the first render called ten hooks and the re-render
     after a failed load called nine — React threw "Rendered fewer hooks than
     expected" and the section died exactly when it was meant to be showing
     its honest error with a retry (CLAUDE.md §9). */
  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = (centres || []).filter(c => !prog || centreProgrammes(c).indexOf(prog) !== -1);
    if (!needle) return all;
    return all.filter(c => (c.name || "").toLowerCase().indexOf(needle) !== -1
      || (c.code || "").toLowerCase().indexOf(needle) !== -1
      || (c.area || "").toLowerCase().indexOf(needle) !== -1
      || (c.address || "").toLowerCase().indexOf(needle) !== -1);
  }, [centres, q, prog]);

  if (err) return <ErrorState title="Couldn't load the centre directory" code={err} onRetry={load}/>;

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Centres {centres ? <span className="admin-count mono">{fmtNum(centres.length)}</span> : null}</h2>
      </div>
      <p className="admin-hint">
        The organisation's places. Each centre's 1–4 letter <b>code</b> is the printed ID prefix
        (<span className="mono">IJ-26-001</span>) and its colour is the card's accent band, so both are effectively
        permanent once cards are in circulation. <b>Edit</b> sets the address, centre lead, contacts and meeting
        times shown on the public status boards, plus the public page at <span className="mono">/centres/&lt;slug&gt;</span>.
        <b> Map</b> draws the geo-fence. Summer School classes that meet here are set up under
        <b> Summer School → Editions &amp; groups</b>.
      </p>
      {!canWrite && (
        <p className="admin-hint" role="status" style={{ background: "rgba(255,206,84,.1)", border: "1px solid rgba(255,206,84,.4)", borderRadius: 10, padding: "10px 12px" }}>
          You can see the directory but not change it. A centre's code and colour are printed on member ID cards, so
          editing it needs the member-desk (<span className="mono">people</span>) capability. Ask an NGG administrator
          to add or amend one.
        </p>
      )}
      {cac && (
        <p className="admin-hint centres-cac-note" role="status">
          <b>Centres come from CACENTRE.</b> Its locations list is the only list of places: a location added, renamed or
          taken off in CACENTRE → Attendance → Desks and settings → Locations is added, renamed (with every record that
          names it) or retired here within minutes. The code, colour, address, lead and page are still set here.
          {cac.at ? <> Last update from CACENTRE: <span className="mono">{fmtDateTime(cac.at)}</span>.</> : null}
        </p>
      )}
      {canWrite && !cac && <h3 className="admin-h3">Add a centre</h3>}
      {canWrite && !cac && (
        <form onSubmit={add} className="admin-filters" style={{ alignItems: "center" }} aria-label="Add a centre">
          <input className="admin-input" placeholder="Centre name" aria-label="New centre name" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} style={{ minWidth: 200 }}/>
          <input className="admin-input" placeholder="CODE" aria-label="New centre code (1–4 letters, the printed ID prefix)" value={d.code} maxLength={4} onChange={e => setD({ ...d, code: e.target.value.toUpperCase() })} style={{ maxWidth: 100 }}/>
          <input type="color" aria-label="New centre card colour" value={d.color} onChange={e => setD({ ...d, color: e.target.value })} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/>
          <select className="admin-input" aria-label="Which programme the new centre runs" value={d.programmes} onChange={e => setD({ ...d, programmes: e.target.value })}>
            <option value="ngg">Runs the NGG Club</option>
            <option value="summer">Runs Summer School</option>
            <option value="ngg,summer">Runs both</option>
          </select>
          {d.programmes !== "ngg" && <input className="admin-input" type="number" min="0" placeholder="Summer capacity (0=∞)" aria-label="Summer School capacity, 0 for unlimited" value={d.capacity} onChange={e => setD({ ...d, capacity: e.target.value })} style={{ maxWidth: 180 }}/>}
          <button className="btn btn-primary btn-sm" disabled={busy || d.name.length < 2 || !d.code}>{busy ? "…" : "+ Add centre"}</button>
        </form>
      )}
      <div className="admin-filters">
        <div className="admin-seg" role="radiogroup" aria-label="Show centres that run">
          {[["", "All centres"], ["ngg", "NGG Club"], ["summer", "Summer School"]].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={prog === k} className={"btn btn-sm " + (prog === k ? "btn-primary" : "btn-ghost")} onClick={() => setProg(k)}>
              {l}{centres ? " · " + fmtNum(centres.filter(c => !k || centreProgrammes(c).indexOf(k) !== -1).length) : ""}
            </button>
          ))}
        </div>
        {(centres || []).length > 6 && <input className="admin-input" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search centres by name, code or area…" aria-label="Search the centre directory"/>}
      </div>
      {centres === null ? <div className="dash-spinner"/> :
        centres.length === 0
          ? <EmptyState icon="◉" title="No centres yet"
              message="A centre is a place the whole organisation uses. Its code becomes the ID prefix on every member card issued there, so pick it carefully."/>
        : rows.length === 0
          ? <div className="admin-empty">{q ? <>No centre matches “{q}”. <button className="btn btn-ghost btn-sm" onClick={() => setQ("")}>Clear the search</button></> : <>No centre runs {prog === "ngg" ? "the NGG Club" : "Summer School"} yet. <button className="btn btn-ghost btn-sm" onClick={() => setProg("")}>Show every centre</button></>}</div>
        : <div className="admin-table-wrap"><table className="admin-table">
          <caption className="sr-only">NGG centres, with the year-round membership and the current Summer School edition counted separately</caption>
          <thead><tr>
            <th scope="col">Centre</th>
            <th scope="col">Location</th>
            <th scope="col">Lead</th>
            <th scope="col" className="admin-num">NGG members</th>
            <th scope="col" className="admin-num">Summer School</th>
            <th scope="col">Geo-fence</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{rows.map(c => (
            <React.Fragment key={c.centreId}>
            <tr>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, background: c.color, border: "1px solid rgba(0,0,0,0.1)", flex: "0 0 auto" }}/><b>{c.name}</b> <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{c.code}</span></span>
                {c.status === "retired" && <span className="chip status-archived" style={{ marginLeft: 8 }} title="Kept so existing records still resolve; no longer offered anywhere">retired</span>}
                {c.status === "archived" && <span className="chip status-archived" style={{ marginLeft: 8 }}>archived</span>}
                {c.cacLocationId
                  ? <span className="chip chip-cac" title="A CACENTRE location: its name and whether it is open are set in CACENTRE">From CACENTRE</span>
                  : cac ? <span className="chip chip-cac-not" title="Not on CACENTRE's locations list. Retire it here, or add it in CACENTRE.">Not a CACENTRE location</span> : null}
                <span className="chip" style={{ marginLeft: 8 }} title="Which programme's forms, desks and lists offer this centre">{centreProgrammes(c).length === 2 ? "NGG + Summer" : centreProgrammes(c)[0] === "ngg" ? "NGG Club only" : "Summer only"}</span>
                {c.pageStatus === "published"
                  ? <a className="chip chip-lime" href={"/centres/" + (c.slug || "")} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, textDecoration: "var(--rs-textdecoration-47, none)" }}>page live ↗</a>
                  : <span className="chip" style={{ marginLeft: 8, opacity: 0.7 }}>page draft</span>}
              </td>
              <td>{c.area || c.address ? <span style={{ lineHeight: 1.3 }}><b style={{ fontWeight: 600 }}>{c.area || "—"}</b>{c.address ? <><br/><span className="admin-cell-sub" style={{ fontSize: 12 }}>{c.address}</span></> : null}</span> : <span className="admin-cell-sub">—</span>}</td>
              <td>
                {centreProgrammes(c).indexOf("ngg") !== -1 && (c.leadName ? <span className="chip chip-lime" title="NGG centre lead">{c.leadName}</span> : <span className="admin-cell-sub">No NGG lead</span>)}
                {centreProgrammes(c).length === 2 && <br/>}
                {centreProgrammes(c).indexOf("summer") !== -1 && (c.summerLeadName ? <span className="chip" title="Summer School lead">Summer · {c.summerLeadName}</span> : <span className="admin-cell-sub">No Summer lead</span>)}
              </td>
              {/* Two programmes, two numbers. The year-round roster first,
                  because this is the NGG directory. */}
              <td className="admin-num">{c.members ? fmtNum(c.members) : <span className="admin-cell-sub">0</span>}</td>
              <td className="admin-num">
                {(c.capacity || 0) > 0
                  ? <span className={c.full ? "chip chip-crimson" : ""}>{c.summerEnrolled || 0}/{c.capacity}{c.full ? " full" : ""}</span>
                  : <span title="No Summer School cap set">{c.summerEnrolled || 0} <span className="admin-cell-sub">/ ∞</span></span>}
                {c.summerWaitlisted ? <div className="admin-cell-sub">{c.summerWaitlisted} waitlisted</div> : null}
                {c.groups ? <div className="admin-cell-sub">{c.groups} group{c.groups === 1 ? "" : "s"}</div> : null}
              </td>
              <td>{geoLabel(c)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {canWrite ? <>
                  <button className="btn btn-ghost btn-sm" aria-expanded={openId === c.centreId + ":edit"} onClick={() => toggle(c, "edit")}>{openId === c.centreId + ":edit" ? "Close" : "Edit"}</button>
                  <button className="btn btn-ghost btn-sm" aria-expanded={openId === c.centreId + ":map"} onClick={() => toggle(c, "map")}>{openId === c.centreId + ":map" ? "Close" : "Map"}</button>
                  <button className="btn btn-ghost btn-sm" aria-expanded={openId === c.centreId + ":summer"} onClick={() => toggle(c, "summer")}
                    title="Where Summer School meets, when it is not the Club's building">{openId === c.centreId + ":summer" ? "Close" : (c.summerLat != null || c.summerAddress ? "Summer venue ✓" : "Summer venue")}</button>
                  {!c.cacLocationId && <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} style={{ color: "#b03535" }}>Remove</button>}
                </> : <span className="admin-cell-sub">read-only</span>}
              </td>
            </tr>
            {canWrite && openId === c.centreId + ":edit" && <tr><td colSpan={7} style={{ background: "rgba(12,20,50,0.03)" }}><CentreDetailsEditor c={c} leadOptions={leadOptions} onSaved={() => { setOpenId(""); load(); }}/></td></tr>}
            {canWrite && openId === c.centreId + ":map" && <tr><td colSpan={7} style={{ background: "rgba(12,20,50,0.03)" }}><CentreGeoEditor c={c} onSaved={() => { setOpenId(""); load(); }}/></td></tr>}
            {canWrite && openId === c.centreId + ":summer" && <tr><td colSpan={7} className="svenue-cell"><SummerVenueEditor c={c} onSaved={() => { setOpenId(""); load(); }}/></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

/* Full centre editor — the operational record: identity (name/code/colour/
 * status/capacity), where it is (address/area), who leads it (a volunteer),
 * how to reach it (phone/email), and when it meets. Address, area, schedule
 * and the lead surface on the public status boards' "find us" cards. */
// Mirror of the server's centre_slugify() for the live URL preview.
function centreSlugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
} // (NFD + combining-mark strip mirrors iconv//TRANSLIT on the server)

/* Which programmes run at a centre (centres.programmes). Blank means both —
   every row before the column existed. Each programme's forms and lists offer
   only its own centres. */
const CENTRE_PROGRAMMES = [["ngg", "NGG Club", "members, the Club timetable and curriculum"], ["summer", "Summer School", "the Summer form, desks and groups"]];
function centreProgrammes(c) {
  const v = String((c && c.programmes) || "").split(",").map(x => x.trim()).filter(x => x === "ngg" || x === "summer");
  return v.length ? CENTRE_PROGRAMMES.map(p => p[0]).filter(k => v.indexOf(k) !== -1) : ["ngg", "summer"];
}
function CentreDetailsEditor({ c, leadOptions, onSaved }) {
  const [f, setF] = React.useState({
    name: c.name || "", code: c.code || "", color: c.color || "#76B043",
    status: c.status || "active", capacity: c.capacity != null ? String(c.capacity) : "",
    address: c.address || "", area: c.area || "", leadVolunteerId: c.leadVolunteerId || "",
    summerLeadVolunteerId: c.summerLeadVolunteerId || "",
    phone: c.phone || "", email: c.email || "", meetDays: c.meetDays || "", meetTime: c.meetTime || "", notes: c.notes || "",
    whatsappUrl: c.whatsappUrl || "",
    slug: c.slug || "", pageStatus: c.pageStatus || "draft",
    tagline: c.tagline || "", headline: c.headline || "",
    heroImageUrl: c.heroImageUrl || "", heroImageMobileUrl: c.heroImageMobileUrl || "",
    heroPosition: c.heroPosition || "center bottom",
    story: c.story || "", gallery: Array.isArray(c.gallery) ? c.gallery : [],
    programmes: centreProgrammes(c),
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const toggleProg = (k) => set("programmes", f.programmes.indexOf(k) !== -1 ? f.programmes.filter(x => x !== k) : CENTRE_PROGRAMMES.map(p => p[0]).filter(x => x === k || f.programmes.indexOf(x) !== -1));
  const galleryAdd = () => set("gallery", [...(f.gallery || []), ""]);
  const gallerySet = (i, v) => set("gallery", (f.gallery || []).map((x, j) => (j === i ? v : x)));
  const galleryRemove = (i) => set("gallery", (f.gallery || []).filter((_, j) => j !== i));
  const effectiveSlug = (f.slug && f.slug.trim()) ? centreSlugify(f.slug) : centreSlugify(f.name);
  // Volunteers based at this centre float to the top of the lead picker.
  const leads = React.useMemo(() => {
    const opts = leadOptions || [];
    const here = opts.filter(o => o.centre === c.name);
    const rest = opts.filter(o => o.centre !== c.name);
    return here.concat(rest);
  }, [leadOptions, c.name]);
  const save = async () => {
    if (f.name.trim().length < 2) { toast.error("Centre name needs at least 2 characters."); return; }
    if (!f.code.trim()) { toast.error("Add a 1–4 letter code."); return; }
    if (!f.programmes.length) { toast.error("Tick the NGG Club, Summer School, or both."); return; }
    setBusy(true);
    try {
      await NGGApi.admin.registration.centreUpsert({
        centreId: c.centreId, name: f.name.trim(), code: f.code.trim().toUpperCase(), color: f.color,
        status: f.status, capacity: f.capacity === "" ? 0 : parseInt(f.capacity, 10) || 0,
        address: f.address, area: f.area, leadVolunteerId: f.leadVolunteerId,
        summerLeadVolunteerId: f.summerLeadVolunteerId,
        phone: f.phone, email: f.email, meetDays: f.meetDays, meetTime: f.meetTime, notes: f.notes,
        whatsappUrl: f.whatsappUrl.trim(),
        slug: f.slug.trim(), pageStatus: f.pageStatus,
        tagline: f.tagline, headline: f.headline,
        heroImageUrl: f.heroImageUrl.trim(), heroImageMobileUrl: f.heroImageMobileUrl.trim(),
        heroPosition: f.heroPosition,
        story: f.story, gallery: (f.gallery || []).map(s => (s || "").trim()).filter(Boolean),
        programmes: f.programmes,
      });
      invalidateCentreOptCache();
      toast.success("Centre saved."); onSaved();
    } catch (e) {
      toast.error(e.code === "code_taken" ? "That code is already used." : e.code === "code_reserved" ? (e.detail || "That code is reserved.") : e.code === "programme_required" ? "Tick the NGG Club, Summer School, or both." : e.code === "bad_email" ? "That email address isn't valid." : e.code === "bad_whatsapp" ? "The WhatsApp link must start with https://" : e.code === "bad_lead" ? "Pick a current volunteer as lead." : e.code === "bad_color" ? "Pick a valid colour." : e.code === "bad_image" ? "Image links must start with https://" : (e.code || e.message));
    } finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  const field = (key, label, opts = {}) => (
    <div style={{ flex: opts.grow ? "1 1 100%" : "1 1 200px", minWidth: opts.min || 160 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} value={f[key]} maxLength={opts.max} placeholder={opts.ph || ""} type={opts.type || "text"} min={opts.type === "number" ? 0 : undefined} onChange={e => set(key, opts.upper ? e.target.value.toUpperCase() : e.target.value)}/>
    </div>
  );
  return (
    <div style={{ padding: "16px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 8 }}>IDENTITY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {c.cacLocationId
            ? <div className="centre-cac-fixed"><span className="centre-cac-lbl">Centre name</span><p className="centre-cac-val">{c.name} <span className="chip chip-cac">From CACENTRE</span></p></div>
            : field("name", "Centre name", { max: 80, min: 200 })}
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Code</span><input className="admin-input" value={f.code} maxLength={4} onChange={e => set("code", e.target.value.toUpperCase())} style={{ width: 90 }}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Colour</span><input type="color" value={f.color} onChange={e => set("color", e.target.value)} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/></div>
          {c.cacLocationId
            ? <div className="centre-cac-fixed"><span className="centre-cac-lbl">Status</span><p className="centre-cac-val">{f.status === "active" ? "Open" : "Retired"} — set in CACENTRE</p></div>
            : <div style={{ flex: "0 0 auto" }}><span style={lbl}>Status</span><select className="admin-select" value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="archived">Archived</option></select></div>}
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Capacity</span><input className="admin-input" type="number" min="0" placeholder="0 = ∞" value={f.capacity} onChange={e => set("capacity", e.target.value)} style={{ width: 120 }}/></div>
        </div>
        <fieldset className="centre-progs">
          <legend>Programmes at this centre</legend>
          {CENTRE_PROGRAMMES.map(([k, label, hint]) => (
            <label key={k} className="centre-prog"><input type="checkbox" checked={f.programmes.indexOf(k) !== -1} onChange={() => toggleProg(k)}/> <b>{label}</b> <span className="admin-cell-sub">{hint}</span></label>
          ))}
        </fieldset>
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 8 }}>LOCATION &amp; LEAD</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("area", "Area / city", { max: 120, ph: "e.g. Alimosho · Lagos" })}
          {field("address", "Street address", { max: 240, grow: true, min: 260, ph: "Building, street, landmark" })}
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <span style={lbl}>NGG centre lead (volunteer)</span>
            <select className="admin-select" style={{ width: "100%" }} value={f.leadVolunteerId} onChange={e => set("leadVolunteerId", e.target.value)}
              disabled={f.programmes.indexOf("ngg") === -1} title={f.programmes.indexOf("ngg") === -1 ? "The NGG Club doesn't run here" : undefined}>
              <option value="">— none —</option>
              {leads.map(o => <option key={o.volunteerId} value={o.volunteerId}>{o.name}{o.role ? " · " + o.role : ""}{o.centre && o.centre !== c.name ? " (" + o.centre + ")" : ""}</option>)}
            </select>
          </div>
          {/* Summer School names its own lead: a different person from the NGG lead. */}
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <span style={lbl}>Summer School lead (volunteer)</span>
            <select className="admin-select" style={{ width: "100%" }} value={f.summerLeadVolunteerId} onChange={e => set("summerLeadVolunteerId", e.target.value)}
              disabled={f.programmes.indexOf("summer") === -1} title={f.programmes.indexOf("summer") === -1 ? "Summer School doesn't run here" : undefined}>
              <option value="">— none —</option>
              {leads.map(o => <option key={o.volunteerId} value={o.volunteerId}>{o.name}{o.role ? " · " + o.role : ""}{o.centre && o.centre !== c.name ? " (" + o.centre + ")" : ""}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 8 }}>CONTACT &amp; SCHEDULE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("phone", "Phone", { max: 40, ph: "+234 …" })}
          {field("email", "Email", { max: 160, type: "email", ph: "centre@afrovanguard.org.ng" })}
          {field("meetDays", "Meeting days", { max: 120, ph: "e.g. Saturdays" })}
          {field("meetTime", "Meeting time", { max: 60, ph: "e.g. 09:00 – 13:00" })}
          {field("whatsappUrl", "Group / join link", { max: 240, grow: true, min: 260, ph: "chat.whatsapp.com/… · wa.me/… · forms.gle/…" })}
        </div>
        <p className="admin-hint" style={{ margin: "6px 0 0" }}>Shown to an applicant right after they submit — matched to the centre they picked. Works with a WhatsApp <b>Invite via Link</b>, a <b>wa.me</b> number link, or a <b>form</b> link. You can paste it without <span className="mono">https://</span>.</p>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)" }}>PUBLIC PAGE</span>
          <select className="admin-select" value={f.pageStatus} onChange={e => set("pageStatus", e.target.value)} style={{ padding: "3px 8px" }}>
            <option value="draft">Draft — hidden</option>
            <option value="published">Published — live</option>
          </select>
          {effectiveSlug ? (
            <a className="mono" href={"/centres/" + effectiveSlug} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: "var(--ink-500)", textDecoration: "var(--rs-textdecoration-47, none)" }}>
              next.afrovanguard.org.ng/centres/<b style={{ color: "var(--ink-800, #0a1130)" }}>{effectiveSlug}</b> ↗
            </a>
          ) : null}
        </div>
        <p className="admin-hint" style={{ marginTop: 0 }}>The immersive centre landing page at <span className="mono">/centres/&lt;slug&gt;</span> — a giant hero image, a tagline and a story. Publish to make it live; the directory at <span className="mono">/centres</span> lists every published centre.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("slug", "URL slug", { max: 64, ph: effectiveSlug || "auto from name" })}
          {field("tagline", "Tagline (hero eyebrow)", { max: 200, grow: true, min: 260, ph: "e.g. LCASP 2026 · ÌLÚ Ẹ̀KÒ · EMPOWERED 360°" })}
          {field("headline", "Headline (big display)", { max: 200, grow: true, min: 260, ph: "e.g. No dey settle for less." })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <FieldUpload label="Hero image (giant model — portrait works best)" value={f.heroImageUrl} onChange={v => set("heroImageUrl", v)} kind="cover" placeholder="Paste an https:// image URL or upload →"/>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <FieldUpload label="Hero image — mobile (optional)" value={f.heroImageMobileUrl} onChange={v => set("heroImageMobileUrl", v)} kind="cover" placeholder="Optional alternate for small screens"/>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ flex: "0 0 auto" }}>
            <span style={lbl}>Hero focal position</span>
            <select className="admin-select" value={f.heroPosition} onChange={e => set("heroPosition", e.target.value)}>
              <option value="center bottom">Bottom · centre</option>
              <option value="center center">Centre</option>
              <option value="center top">Top · centre</option>
              <option value="left bottom">Bottom · left</option>
              <option value="right bottom">Bottom · right</option>
              <option value="left center">Centre · left</option>
              <option value="right center">Centre · right</option>
            </select>
          </div>
          <p className="admin-hint" style={{ margin: 0, flex: "1 1 240px" }}>Where the giant hero image sits. Admins can also <b>drag to position</b> it directly on the live centre page.</p>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={lbl}>Story</span>
          <textarea className="admin-input" value={f.story} maxLength={6000} onChange={e => set("story", e.target.value)} rows={5} style={{ width: "100%", resize: "vertical" }} placeholder="What happens at this centre, who it's for, what a Saturday feels like. One blank line starts a new paragraph."/>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={lbl}>Gallery ({(f.gallery || []).length})</span>
          {(f.gallery || []).map((url, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldUpload label={""} value={url} onChange={v => gallerySet(i, v)} kind="cover" placeholder="Paste an https:// image URL or upload →"/>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => galleryRemove(i)} style={{ color: "#b03535", marginTop: 2 }}>Remove</button>
            </div>
          ))}
          {(f.gallery || []).length < 12 && <button type="button" className="btn btn-ghost btn-sm" onClick={galleryAdd}>+ Add gallery image</button>}
        </div>
      </div>
      <div>
        <span style={lbl}>Notes (internal)</span>
        <textarea className="admin-input" value={f.notes} maxLength={400} onChange={e => set("notes", e.target.value)} rows={2} style={{ width: "100%", resize: "vertical" }} placeholder="Anything the ops team should know about this centre."/>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save centre"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSaved}>Cancel</button>
        <span className="admin-hint" style={{ margin: 0 }}>Area, address, meeting times and the lead show on the public status boards.</span>
      </div>
    </div>
  );
}

/* Per-centre geo-fence editor: capture the point on-site (device GPS) or enter
 * coordinates from a dependable source, set the radius, and toggle the fence. */
/* Where Summer School meets for this centre, when it is not the Club's building.
   Same centre, same code and colour and printed prefix — only the venue moves.
   Blank means Summer meets where the Club does (centre_point() in
   registration.php). It drives the Summer registration desk's fence and the
   nearest-Club suggestion when a participant is promoted. */
function SummerVenueEditor({ c, onSaved }) {
  const [f, setF] = React.useState({
    summerAddress: c.summerAddress || "", summerArea: c.summerArea || "",
    summerLat: c.summerLat != null ? String(c.summerLat) : "", summerLng: c.summerLng != null ? String(c.summerLng) : "",
  });
  const [busy, setBusy] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const capture = () => {
    if (!navigator.geolocation) { toast.error("This device can't capture GPS."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setF(x => ({ ...x, summerLat: p.coords.latitude.toFixed(6), summerLng: p.coords.longitude.toFixed(6) })); setLocating(false); toast.success("Captured this spot (±" + Math.round(p.coords.accuracy) + "m). Review and save."); },
      e => { setLocating(false); toast.error(e && e.code === 1 ? "Location permission was blocked." : "Couldn't get a GPS fix — try again outdoors."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  const save = async (clear) => {
    const la = parseFloat(f.summerLat), ln = parseFloat(f.summerLng);
    if (!clear && (f.summerLat !== "" || f.summerLng !== "") && (isNaN(la) || isNaN(ln))) { toast.error("Enter both coordinates, or neither."); return; }
    setBusy(true);
    try {
      const data = { centreId: c.centreId, name: c.name, code: c.code, color: c.color };
      if (clear) data.summerClear = true;
      else {
        data.summerAddress = f.summerAddress; data.summerArea = f.summerArea;
        if (!isNaN(la) && !isNaN(ln)) { data.summerLat = la; data.summerLng = ln; }
      }
      await NGGApi.admin.registration.centreUpsert(data);
      toast.success(clear ? "Summer School meets at the Club again." : "Summer venue saved.", c.name); onSaved();
    } catch (e) { toast.error(e.code === "bad_latlng" ? "Those coordinates aren't valid." : humanizeError(e.code, e.code)); }
    finally { setBusy(false); }
  };
  const hasVenue = c.summerLat != null || !!c.summerAddress;
  return (
    <div className="svenue">
      <p className="admin-hint svenue-lede">
        Same centre — name, code, colour and printed prefix — but Summer School can meet in a different building.
        Leave this blank if Summer meets at the Club's address{c.address ? " (" + c.address + ")" : ""}.
      </p>
      <div className="svenue-grid">
        <label className="admin-field svenue-wide"><span className="admin-label">Summer venue address</span>
          <input className="admin-input" value={f.summerAddress} onChange={set("summerAddress")} placeholder="e.g. Community Grammar School, Ayobo Road"/></label>
        <label className="admin-field"><span className="admin-label">Area</span>
          <input className="admin-input" value={f.summerArea} onChange={set("summerArea")} placeholder="e.g. Ayobo"/></label>
        <label className="admin-field"><span className="admin-label">Latitude</span>
          <input className="admin-input" inputMode="decimal" value={f.summerLat} onChange={set("summerLat")} placeholder="6.601234"/></label>
        <label className="admin-field"><span className="admin-label">Longitude</span>
          <input className="admin-input" inputMode="decimal" value={f.summerLng} onChange={set("summerLng")} placeholder="3.301234"/></label>
      </div>
      <div className="svenue-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={locating} onClick={capture}>{locating ? "Locating…" : "📍 Capture on-site"}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save Summer venue"}</button>
        {hasVenue && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save(true)}>Summer meets at the Club</button>}
      </div>
      <p className="admin-hint svenue-foot">Used by the Summer registration desk's location check, and to suggest the nearest Club when a participant is promoted.</p>
    </div>
  );
}

function CentreGeoEditor({ c, onSaved }) {
  const [lat, setLat] = React.useState(c.lat != null ? String(c.lat) : "");
  const [lng, setLng] = React.useState(c.lng != null ? String(c.lng) : "");
  const [radiusM, setRadiusM] = React.useState(c.radiusM || 150);
  const [fence, setFence] = React.useState(!!c.geofence);
  const [src, setSrc] = React.useState(c.mapSource || "");
  const [acc, setAcc] = React.useState(c.mapAccuracyM != null ? c.mapAccuracyM : null);
  const [capBusy, setCapBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const capture = () => {
    if (!navigator.geolocation) { toast.error("This device can't capture GPS."); return; }
    setCapBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setAcc(Math.round(p.coords.accuracy)); setSrc("onsite"); setCapBusy(false); toast.success("Captured this spot (±" + Math.round(p.coords.accuracy) + "m). Review and save."); },
      e => { setCapBusy(false); toast.error(e && e.code === 1 ? "Location permission was blocked." : "Couldn't get a GPS fix — try again outdoors."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };
  const save = async () => {
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (fence && (isNaN(la) || isNaN(ln))) { toast.error("Map a point (capture on-site or enter coordinates) before turning the fence on."); return; }
    setBusy(true);
    try {
      const data = { centreId: c.centreId, name: c.name, code: c.code, color: c.color, geofence: fence, radiusM: Number(radiusM) || 150 };
      if (!isNaN(la) && !isNaN(ln)) { data.lat = la; data.lng = ln; data.mapSource = src || "coordinates"; if (acc != null) data.mapAccuracyM = acc; }
      await NGGApi.admin.registration.centreUpsert(data);
      toast.success("Geo-fence saved."); onSaved();
    } catch (e) { toast.error(e.code === "bad_latlng" ? "Those coordinates aren't valid." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  return (
    <div style={{ padding: "14px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <div><span style={lbl}>Latitude</span><input className="admin-input" value={lat} onChange={e => { setLat(e.target.value); setSrc("coordinates"); }} placeholder="6.601234" style={{ width: 140 }}/></div>
        <div><span style={lbl}>Longitude</span><input className="admin-input" value={lng} onChange={e => { setLng(e.target.value); setSrc("coordinates"); }} placeholder="3.301234" style={{ width: 140 }}/></div>
        <div><span style={lbl}>Radius (m)</span><input className="admin-input" type="number" min={25} max={5000} value={radiusM} onChange={e => setRadiusM(e.target.value)} style={{ width: 100 }}/></div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={capBusy} onClick={capture}>{capBusy ? "Locating…" : "📍 Capture on-site"}</button>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600 }}>
        <input type="checkbox" checked={fence} onChange={e => setFence(e.target.checked)}/>
        Fence on — auto-assign walk-ups here and block off-site sign-ups
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save geo-fence"}</button>
        <span className="admin-cell-sub" style={{ fontSize: 12 }}>
          {src === "onsite" ? "Source: on-site GPS" + (acc != null ? " (±" + acc + "m)" : "") : (lat && lng) ? "Source: entered coordinates" : "Not mapped yet"}
          {c.mappedAt ? " · last mapped " + fmtDate(c.mappedAt) : ""}
        </span>
      </div>
      <p className="admin-hint" style={{ margin: 0 }}>Stand at the centre entrance and tap <b>Capture on-site</b> for the most accurate point, or paste coordinates from Google Maps (right-click → the lat,lng at the top). The global fence toggle lives in Settings.</p>
    </div>
  );
}

// ============================================================================
// Photo review — the editor's console. Free-AI triage flags problems; Cloudinary
// does identity-safe edits; a human approves, requests a retake, or rejects.
// ============================================================================
function AdminPhotos() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busyId, setBusyId] = React.useState("");
  const [zoom, setZoom] = React.useState("");
  /* Children with NO photograph, which the queue above structurally cannot show
     — it lists photo ASSETS, and these have none. Every registration that
     arrived before the image store existed lost its headshot at submit time and
     cannot be recovered, so the only fix is to ask those families again. */
  const [missing, setMissing] = React.useState(null);
  const [asking, setAsking] = React.useState(false);
  const loadMissing = () => NGGApi.admin.photos.missing(200).then(setMissing).catch(() => setMissing(null));
  const load = () => { loadMissing(); return NGGApi.admin.photos.queue().then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { load(); }, []);

  const askMissing = async () => {
    const n = (missing && missing.students || []).filter(s => s.reachable && !s.askedAt).length;
    const go = await dialog.confirm({
      title: "Send retake links",
      body: "Emails each guardian a one-tap link to take a new photo. " + n + " famil" + (n === 1 ? "y is" : "ies are") +
            " due — anyone asked in the last 3 days is skipped, so pressing this again continues rather than asking twice." +
            " Sent in batches of 50; press again for the next batch.",
      cta: "Send " + Math.min(50, n),
    });
    if (!go) return;
    setAsking(true);
    try {
      const r = await NGGApi.admin.photos.requestMissing(50, 3);
      toast.success(r.asked ? "Asked " + r.asked + " famil" + (r.asked === 1 ? "y" : "ies") + (r.remaining ? " · " + r.remaining + " still due" : " · that's everyone") : (r.message || "Nobody was due."));
      loadMissing();
    } catch (e) { toast.error(e.code || e.message); } finally { setAsking(false); }
  };

  const claim = async (a) => { setBusyId(a.assetId); try { await NGGApi.admin.photos.claim(a.assetId); toast.success("Claimed — you're reviewing this one."); load(); } catch (e) { toast.error(e.code === "already_claimed" ? "Another editor already claimed it." : (e.code || e.message)); } finally { setBusyId(""); } };
  const approve = async (a) => {
    const edited = await dialog.prompt({ title: "Approve this photo", body: "Approves the edited image for the ID card. Paste a corrected Cloudinary URL to override it, or leave it as-is.", cta: "Approve", required: false, defaultValue: a.editedUrl || "", placeholder: "https://res.cloudinary.com/…" });
    if (edited === null) return;
    setBusyId(a.assetId);
    try { await NGGApi.admin.photos.approve(a.assetId, (edited || "").trim() || a.editedUrl, ""); toast.success("Photo approved."); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusyId(""); }
  };
  const retake = async (a) => {
    const reason = await dialog.prompt({ title: "Request a retake", body: "Tell the desk what to fix (lighting, framing, background). The registration keeps its place in the queue.", cta: "Request retake", placeholder: "e.g. Please retake against a plain wall." });
    if (!reason) return;
    setBusyId(a.assetId);
    try { await NGGApi.admin.photos.retake(a.assetId, reason.trim()); toast.success("Retake requested."); load(); }
    catch (e) { toast.error(e.code === "reason_required" ? "Add a short reason." : (e.code || e.message)); } finally { setBusyId(""); }
  };
  const reject = async (a) => {
    const reason = await dialog.prompt({ title: "Reject this photo", body: "Rejects the image entirely — for inappropriate or unusable uploads. Needs elevated (People) access.", cta: "Reject", danger: true, placeholder: "Reason" });
    if (!reason) return;
    setBusyId(a.assetId);
    try { await NGGApi.admin.photos.reject(a.assetId, reason.trim()); toast.success("Photo rejected."); load(); }
    catch (e) { toast.error(e.code === "forbidden" ? "Rejecting needs the People permission." : (e.code || e.message)); } finally { setBusyId(""); }
  };

  const shot = (url, label, tone) => (
    <div style={{ flex: "1 1 160px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 5 }}>{label}</div>
      <button type="button" onClick={() => url && setZoom(url)} title={url ? "View full size" : ""} style={{ display: "grid", placeItems: "center", width: "100%", aspectRatio: "4/5", borderRadius: 10, overflow: "hidden", background: "rgba(12,20,50,0.05)", border: "1px solid " + (tone || "rgba(12,20,50,0.12)"), padding: 0, cursor: url ? "zoom-in" : "default" }}>
        {url ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ color: "var(--ink-400)", fontSize: 12 }}>—</span>}
      </button>
    </div>
  );

  return (
    <div className="admin-section">
      {zoom && <ImageLightbox url={zoom} alt="Headshot" onClose={() => setZoom("")}/>}
      <div className="admin-section-head">
        <h2 className="admin-h2">Photo review {data && data.pending ? <span className="chip chip-lime">{data.pending} waiting</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="admin-hint">The free AI only <b>flags</b> problems; Cloudinary <b>enhances</b> — it never alters the person. Approve the edit, request a retake, or (for unusable/inappropriate uploads) reject. You can paste a corrected image URL when approving.</p>

      {/* The children this queue cannot show. A card with no face on it is not a
          smaller problem than a badly-lit one, and it is invisible here because
          there is no asset to list — so it needs its own block, above the
          queue, with the one action that fixes it. */}
      {missing && missing.total > 0 && (
        <div className="admin-card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(245,176,38,.45)", background: "rgba(245,176,38,.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 className="admin-h3" style={{ margin: 0 }}>
              {missing.total} child{missing.total === 1 ? "" : "ren"} with no photo on file
            </h3>
            <button className="btn btn-primary btn-sm" disabled={asking} onClick={askMissing}>
              {asking ? "Sending…" : "Send retake links"}
            </button>
          </div>
          <p className="admin-hint" style={{ marginTop: 6 }}>
            {(() => {
              const rows = missing.students || [];
              const self = rows.filter(s => s.selfRegistered).length;
              const unreachable = rows.filter(s => !s.reachable).length;
              const asked = rows.filter(s => s.askedAt).length;
              return <>
                {self > 0 && <><b>{self}</b> registered themselves — that form cannot be submitted without a photo, so those images
                were lost before reaching the record and cannot be recovered. </>}
                Each link lets a guardian take a new one on their phone in under a minute.
                {asked > 0 && <> {asked} already asked.</>}
                {unreachable > 0 && <> <b>{unreachable} have no email on file</b> and cannot be reached this way — a coordinator
                has to photograph them at the centre.</>}
              </>;
            })()}
          </p>
          <div className="admin-table-wrap" style={{ maxHeight: 260, overflow: "auto" }}>
            <table className="admin-table">
              <thead><tr><th>Child</th><th>Centre</th><th>Registered</th><th>Guardian</th><th>Asked</th></tr></thead>
              <tbody>
                {(missing.students || []).map(sx => (
                  <tr key={sx.studentId}>
                    <td><b>{sx.fullName}</b><div className="mono admin-cell-sub">{sx.displayId || sx.studentId}{sx.selfRegistered ? " · self-registered" : ""}</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{sx.centre || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{(sx.registeredAt || "").slice(0, 10) || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{sx.reachable ? sx.parentEmail : <span style={{ color: "#b3001b" }}>no email</span>}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{sx.askedAt ? sx.askedAt.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.shown < missing.total && <p className="admin-cell-sub" style={{ marginTop: 6 }}>Showing the {missing.shown} most recent of {missing.total}.</p>}
        </div>
      )}
      {err ? <ErrorState title="Couldn't load the queue" code={err} onRetry={load}/> :
        data === null ? <div className="dash-spinner"/> :
        (data.queue || []).length === 0 ? <div className="admin-empty">Nothing waiting — clean photos auto-approve and only flagged ones land here. 🎉</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.queue.map(a => {
            const f = a.aiFindings || {};
            const flags = f.flags || [];
            const issues = f.issues || [];
            const claimed = a.status === "in_review";
            const busy = busyId === a.assetId;
            return (
              <div key={a.assetId} className="admin-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div><b className="mono">{a.subjectType}:{a.subjectId}</b> <span className="admin-cell-sub">· v{a.version} · {a.assetId}</span></div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {a.aiScore != null && <span className="chip" style={{ background: a.aiScore >= 70 ? "rgba(118,176,67,.16)" : a.aiScore >= 45 ? "rgba(255,206,84,.18)" : "rgba(255,120,120,.16)" }}>AI score {a.aiScore}</span>}
                    <span className={"chip " + (claimed ? "chip-lime" : "status-archived")}>{claimed ? "in review" : "waiting"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  {shot(a.sourceUrl, "AS CAPTURED", null)}
                  {shot(a.editedUrl, "ENHANCED (IDENTITY-SAFE)", "rgba(118,176,67,.4)")}
                  <div style={{ flex: "2 1 220px", minWidth: 200 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 6 }}>AI FINDINGS</div>
                    {flags.length === 0 && issues.length === 0 ? <p className="admin-cell-sub" style={{ margin: 0 }}>No specific issues flagged.</p> : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {flags.map((fl, i) => <span key={i} className="chip" style={{ background: "rgba(255,120,120,.14)" }}>{String(fl).replace(/_/g, " ")}</span>)}
                      </div>
                    )}
                    {issues.length > 0 && <ul style={{ margin: "0 0 0 16px", padding: 0, color: "var(--ink-600)", fontSize: 13, lineHeight: 1.5 }}>{issues.map((it, i) => <li key={i}>{it}</li>)}</ul>}
                    {flags.indexOf("ai_unavailable") >= 0 && <p className="admin-cell-sub" style={{ margin: "6px 0 0" }}>Analysis was unavailable — please eyeball this one carefully.</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {!claimed && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => claim(a)}>Claim to review</button>}
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => approve(a)}>Approve</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => retake(a)}>Request retake</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reject(a)} style={{ color: "#b03535" }}>Reject</button>
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

// ============================================================================
// Forms — one visual builder, every public form (registration/volunteer/contact)
// ============================================================================
function AdminForms() {
  const [forms, setForms] = React.useState(null);
  const [active, setActive] = React.useState("summer-reg");
  const [err, setErr] = React.useState("");
  React.useEffect(() => { NGGApi.admin.registration.formsList().then(r => setForms(r.forms || [])).catch(e => setErr(e.code || e.message)); }, []);
  if (err) return <div className="admin-section"><ErrorState title="Couldn't load forms" code={err} onRetry={() => location.reload()}/></div>;
  if (!forms) return <div className="admin-section"><div className="dash-spinner"/></div>;
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Forms</h2></div>
      <p className="admin-hint">Every public form, edited with the same visual builder. Locked system fields stay put; add, reorder and configure the rest, then publish a new live version.</p>
      <div className="admin-anchor-tabs">
        {forms.map(f => (
          <button key={f.formId} className={"admin-anchor-tab" + (active === f.formId ? " is-active" : "")} onClick={() => setActive(f.formId)}>
            {f.name} <span className="mono" style={{ opacity: 0.6, fontSize: 11 }}>· v{f.version} · {f.fieldCount}f</span>
          </button>
        ))}
      </div>
      <SummerFormBuilder formId={active} key={active}/>
    </div>
  );
}

// ============================================================================
// Site content — homepage hero + taglines (website management)
// ============================================================================
function AdminSite() {
  const [c, setC] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const load = () => NGGApi.admin.settings.get().then(r => setC({ ...(r.settings.site_content || {}) })).catch(e => { toast.error(e.code || e.message); setC({}); });
  React.useEffect(() => { load(); }, []);
  const set = (k) => (v) => setC(o => ({ ...o, [k]: v }));
  const save = async () => { setBusy(true); try { await NGGApi.admin.settings.set({ site_content: c }); setSaved(true); setTimeout(() => setSaved(false), 2200); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };
  if (!c) return <div className="admin-section"><div className="dash-spinner"/></div>;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Site content</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="mono" style={{ color: saved ? "var(--lime-ink)" : "var(--ink-500)" }}>{saved ? "SAVED ✓ · live" : busy ? "SAVING…" : ""}</span><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Publish</button></div>
      </div>
      <p className="admin-hint">Edit the public homepage copy. Changes go live immediately — leave a field blank to restore its default.</p>

      <div className="site-editor">
        <div className="admin-fields">
          <div className="mono admin-cell-sub" style={{ marginBottom: 4 }}>HERO</div>
          <Field label="'Live now' word" value={c.heroEyebrowLive || ""} onChange={set("heroEyebrowLive")} placeholder="Live now"/>
          <Field label="Headline line 1" value={c.heroTitle1 || ""} onChange={set("heroTitle1")} placeholder="Africa's next geniuses"/>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Line 2 lead" value={c.heroTitle2 || ""} onChange={set("heroTitle2")} placeholder="are"/>
            <Field label="Line 2 emphasis (gold)" value={c.heroEmphasis || ""} onChange={set("heroEmphasis")} placeholder="not waiting"/>
          </div>
          <FieldTextarea label="Sub-headline" rows={3} value={c.heroSubhead || ""} onChange={set("heroSubhead")}/>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Primary button" value={c.heroCtaPrimary || ""} onChange={set("heroCtaPrimary")} placeholder="Join the Summer Program"/>
            <Field label="Secondary button" value={c.heroCtaSecondary || ""} onChange={set("heroCtaSecondary")} placeholder="Explore Anchor 12"/>
          </div>
          <div className="mono admin-cell-sub" style={{ margin: "10px 0 4px" }}>MOVEMENT</div>
          <FieldTextarea label="Footer tagline" rows={3} value={c.movementTagline || ""} onChange={set("movementTagline")}/>
        </div>

        {/* Live preview of the hero copy */}
        <div className="site-editor-preview">
          <div className="mono admin-cell-sub" style={{ marginBottom: 8 }}>PREVIEW</div>
          <div style={{ background: "var(--navy-900)", borderRadius: 16, padding: "var(--rs-p-113, 28px 24px)", color: "#fff", overflow: "hidden" }}>
            <span className="chip chip-on-dark" style={{ fontSize: 10 }}><span className="dot dot-coral"/> {(c.heroEyebrowLive || "Live now").toUpperCase()} · SUMMER 2026</span>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, lineHeight: 0.98, margin: "12px 0 10px" }}>
              {c.heroTitle1 || "Africa's next geniuses"}<br/>{c.heroTitle2 || "are"} <span style={{ color: "var(--gold-500)" }}>{c.heroEmphasis || "not waiting"}</span>.
            </div>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 16px" }}>{c.heroSubhead || "A twelve-week growth journey…"}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="btn btn-gold btn-sm">{c.heroCtaPrimary || "Join the Summer Program"} →</span>
              <span className="btn btn-on-dark-ghost btn-sm">{c.heroCtaSecondary || "Explore Anchor 12"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// Called after any centre is added/edited/removed so every cached <select>
// refetches the live list on next mount (otherwise new centres stay invisible
// until a full reload). Hoisted, so the editor handlers above can call it.
function invalidateCentreOptCache() { _centreOptCache = null; }
function FieldCheckbox({ label, value, onChange }) {
  return (
    <label className="admin-field admin-field-check">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}/>
      <span>{label}</span>
    </label>
  );
}
// A URL field with an inline Cloudinary upload button + thumbnail preview.
// The Uploader renders nothing if the server has no Cloudinary configured, so
// this degrades gracefully to a plain paste-a-URL field.
function FieldUpload({ label, value, onChange, kind, accept, placeholder }) {
  const id = React.useId ? React.useId() : "fu";
  /* A <div>, not a <label>. Wrapping the whole row in one put the Uploader's
     hidden <input type=file> inside a label whose labeled control is the URL
     text box — so the label owns the click and hands activation to the text
     box. Chrome tolerates it; Safari and iOS re-dispatch and can swallow the
     file picker outright, which is an upload button that does nothing. */
  return (
    <div className="admin-field">
      <label htmlFor={id}><span>{label}</span></label>
      <div className="admin-upload-row">
        <input id={id} type="text" className="admin-input" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Paste a URL or upload →"}/>
        <Uploader kind={kind || "cover"} accept={accept || "image/*"} onUploaded={(url) => onChange(url)} compact/>
      </div>
      {value && /^https?:\/\//.test(value) && (
        <span className="admin-upload-preview"><img src={value} alt="" onError={(e) => { e.target.style.display = "none"; }}/></span>
      )}
    </div>
  );
}
Object.assign(window, { AdminVolunteers, AdminPromos });
