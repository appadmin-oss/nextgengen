/* The Saturday Formation Schedule, as one audience reads it. The day comes
   from the server (public.formation → saturday_formation, which an admin
   edits); nothing here holds a copy of it. Used by the Mentor Portal's This
   week and Saturday screens; the member, instructor and family portals take
   the same component with their own audience. */
function useFormation(audience) {
  const [d, setD] = React.useState(null); const [err, setErr] = React.useState(null);
  const load = React.useCallback(() => { setErr(null); NGGApi.public.formation(audience).then(setD).catch(setErr); }, [audience]);
  React.useEffect(() => { load(); }, [load]);
  return [d, err, load];
}
function sfNowMin() { const t = new Date(Date.now() + 3600000); return { sat: t.getUTCDay() === 6, min: t.getUTCHours() * 60 + t.getUTCMinutes() }; }
function sfMin(h) { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); }
function sfClock(h) { const m = sfMin(h), hh = Math.floor(m / 60), mm = m % 60; return ((hh + 11) % 12 + 1) + ':' + String(mm).padStart(2, '0') + (hh < 12 ? 'am' : 'pm'); }
function FormationDay({ audience, compact, onMore }) {
  const [d, err, load] = useFormation(audience);
  const [open, setOpen] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t); }, []);
  if (err) return <div className="m15x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>The Saturday schedule couldn’t load.</span><button type="button" onClick={load}>Retry</button></div>;
  if (!d) return <div className="m15x-load" role="status" aria-live="polite"><span className="m15x-bar"/><span className="m15x-sr">Loading the Saturday schedule</span></div>;
  const n = sfNowMin(); const blocks = d.blocks || [];
  const cur = n.sat ? blocks.findIndex(b => n.min >= sfMin(b.start) && n.min < sfMin(b.end)) : -1;
  const shown = compact ? (cur >= 0 ? blocks.slice(cur, cur + 2) : blocks.slice(0, 3)) : blocks;
  return <section className="sf-day" aria-labelledby="sf-h">
    <div className="sf-head"><h2 id="sf-h">Saturday formation · {d.hours}</h2><span>{d.theme}</span></div>
    <ol className="sf-list">
      {shown.map((b) => { const i = blocks.indexOf(b); const on = i === cur; const past = n.sat && cur >= 0 && i < cur; const part = b.part; const isOpen = open === b.key || on;
        return <li key={b.key} className={'sf-b' + (on ? ' is-now' : '') + (past ? ' is-past' : '')}>
          <button type="button" className="sf-row" aria-expanded={isOpen ? 'true' : 'false'} onClick={() => setOpen(open === b.key ? null : b.key)}>
            <span className="sf-t">{sfClock(b.start)}</span><span className="sf-ti">{b.title}{on && <em className="sf-now">Now</em>}</span><span className="sf-fl">{b.flow}</span>
          </button>
          {isOpen && <div className="sf-body">
            <p className="sf-p">{b.purpose}</p>
            {Array.isArray(part) ? (part.length ? <ul>{part.map((x, j) => <li key={j}>{x}</li>)}</ul> : null) : (part ? <p>{part}</p> : null)}
            {b.quote && <blockquote>{b.quote}</blockquote>}
          </div>}
        </li>; })}
    </ol>
    {!compact && <p className="sf-logic">{d.logic}</p>}
    {compact && onMore && <button type="button" className="sf-more" onClick={onMore}>The whole Saturday, {blocks.length} blocks<i className="ph ph-caret-right" aria-hidden="true"/></button>}
  </section>;
}
