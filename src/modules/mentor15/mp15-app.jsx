/* The Mentor Portal (design: docs/design/portals/mentor-portal-v15.dc.html).
 *
 * Mp15View is the design, compiled (tools/dc-compile.js). This file is its
 * controller: it builds the view's values from the mentor API that already
 * exists — /member/mentor.php ?view= (reads) and action= (writes), every one
 * gated by mentor_gate / mp_gate on the server — and owns nothing the server
 * owns. The flags (struggling, overdue, relationship, stalled, family), the
 * urgency order, the scorecard lock, the commitment statuses and the quiz
 * score are the server's; the screen only displays them.
 *
 * The behaviour rules are the design's own (its DCLogic class), ported line by
 * line where they are presentation, and replaced by the server's answer where
 * they were sample data. Where the server has no write for something the design
 * shows (ticking off last supervision's agreed actions) it is the mentor's own
 * checklist on this device, and says so.
 *
 * Who gets this portal: NGG mentors in the pod, peer, lead and coordinator
 * roles. Instructors and Summer-only mentors keep the class portal
 * (MentorPortal in page-other.jsx), and so does anyone the API turns away, so
 * its sign-in doors and its not-cleared / no-centre answers still apply.
 */

/* The Saturday evaluation's scale and criteria, as the server sends them (mentor-portal.php MP_EVAL_*); this copy is only the fallback before the read lands. */
const MP15_EVAL_SCALE = ['Not yet', 'Emerging', 'Demonstrated', 'Strong'];
const MP15_EVAL_CRITERIA = [['punctuality', 'Punctuality', 'Here and checked in by 8:00am'], ['assignment', 'Assignment', 'The week’s assignment handed in at check-in'],
  ['participation', 'Participation', 'Took part in the huddle, the breakout and the class'], ['respect', 'Respect', 'To peers, mentors and instructors'],
  ['teamwork', 'Teamwork', 'Worked with others and helped them'], ['courage', 'Courage', 'Tried something hard or spoke up'],
  ['initiative', 'Initiative', 'Started things without being asked'], ['reflection', 'Reflection', 'Named what they learned and what is next']].map(([key, label, hint]) => ({ key, label, hint }));
const MP15_ROLES = { pod: 'Pod mentor', peer: 'Peer mentor', instructor: 'Instructor mentor', lead: 'Lead mentor', coord: 'Centre coordinator' };
const MP15_TONE = { bad: ['#fdeeea', '#b0361c'], warn: ['#fdf6e3', '#7a5600'], ok: ['#f3faf4', '#1d6b30'], neu: ['#f0efea', '#4a4a50'] };
const MP15_KIND_TYPE = { 'one-to-one': 'One-to-one', one_to_one: 'One-to-one', pod: 'Pod session', family: 'Family', phone: 'Phone or message', note: 'Note' };
const MP15_TYPE_ICON = { 'One-to-one': 'ph ph-user', 'Pod session': 'ph ph-users-three', Family: 'ph ph-house-line', 'Phone or message': 'ph ph-phone', Note: 'ph ph-note-pencil' };
const MP15_AREAS = ['Character', 'Competence', 'Wellbeing', 'Leadership'];
const MP15_LEVELS = ['Low', 'Steady', 'Strong', 'Exceptional'];
const MP15_CONCERN_KINDS = ['Something they told me', 'Injury or harm', 'Neglect', 'Online safety', 'An adult’s behaviour', 'Something else'];
const MP15_REL_Q = ['We talk about things that matter to them', 'They can tell me when something is wrong', 'I know what they want from our time', 'Our time helps them move forward'];
/* The class portal's tabs. A link that lands on one of these (the results
   email lands on ?tab=results) opens the class portal, as it always has. */
const MP15_CLASSIC_TABS = ['session', 'class', 'skills', 'curriculum', 'results', 'attention'];

/* ── Dates: the server works in Lagos calendar dates (YYYY-MM-DD) ────────── */
function mp15D(iso) { const s = String(iso || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00Z') : null; }
function mp15Iso(d) { return d.toISOString().slice(0, 10); }
function mp15AddDays(iso, n) { const d = mp15D(iso); return d ? mp15Iso(new Date(d.getTime() + n * 86400000)) : ''; }
function mp15Days(from, to) { const a = mp15D(from), b = mp15D(to); return a && b ? Math.round((b - a) / 86400000) : null; }
function mp15Fmt(iso, o) { const d = mp15D(iso); return d ? d.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o || { day: 'numeric', month: 'long' })) : ''; }
function mp15Month(ym) { return ym ? mp15Fmt(ym + '-01', { month: 'long' }) : ''; }
function mp15Ago(n) { return n === null || n === undefined ? 'Never' : n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n + ' days ago'; }
function mp15When(at, today) { const n = mp15Days(at, today); return n === null ? '' : n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? mp15Fmt(at, { weekday: 'short' }) : mp15Fmt(at, { day: 'numeric', month: 'short' }); }
function mp15LastSat(today) { const d = mp15D(today); if (!d) return ''; return mp15AddDays(today, -((d.getUTCDay() + 1) % 7)); }
function mp15NextSat(today) { const d = mp15D(today); if (!d) return ''; return mp15AddDays(today, (6 - d.getUTCDay() + 7) % 7); }
function mp15Monday(iso) { const d = mp15D(iso); if (!d) return ''; return mp15AddDays(iso, -((d.getUTCDay() + 6) % 7)); }
function mp15Initials(name) { const p = String(name || '').replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function mp15First(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }

/* What an API refusal means, in the portal's words. Unknown codes are shown
   as themselves rather than as a reassurance. */
const MP15_ERR = {
  not_in_caseload: 'That child isn’t in your caseload.', peer_no_family: 'Peer mentors don’t contact families. Your lead will.',
  say_what_happened: 'Write what happened first.', reviewed_by_another: 'Another mentor already reviewed this week. Ask your lead if it needs changing.', not_a_saturday: 'The register and reviews are for a Saturday the pod met.', family_daily_limit: 'This family has had two messages today already. Send it tomorrow.', report_limit: 'You have sent the most reports allowed today. If a child is in danger now, phone your safeguarding officer.', choose_a_mentee: 'Choose a mentee first.', nobody_here: 'Nobody was marked here on Saturday.',
  bad_date: 'That date isn’t right.', date_out_of_range: 'That Saturday is outside the two-week window for writing it up.',
  locked: 'This month’s scores are locked.', ten_scores: 'Score all ten skills.', answer_all_four: 'Answer all four first.',
  write_a_message: 'Write a message first.', write_a_reply: 'Write a reply first.', no_guardian_contact: 'There’s no family contact on their record. Ask your coordinator to add one.',
  not_delivered: 'The message didn’t reach the family. Nothing was logged.', rate_all_three: 'Rate effort, character and wellbeing first.',
  no_lead: 'You have no lead mentor on record.', no_mentor_record: 'Your mentor record isn’t set up yet. Ask your coordinator.',
  answer_one: 'Answer at least one question.', not_agreed: 'Agree it with them first, then make it active.', no_wish: 'Write the wish first.',
  goals_locked_connect: 'The first weeks are for getting to know each other. Goals open in week 3.', active_needs_agreed: 'A live goal stays agreed. Pause it first.',
  progress_out_of_range: 'How close is 1 to 5.', fixed_item_missing: 'The huddle, one-to-ones and close stay on the agenda.',
  choose_the_child: 'Choose the child first.', choose_the_kind: 'Choose what kind of concern.', not_found: 'That record wasn’t found.',
  forbidden: 'That isn’t yours to do.', not_in_team: 'That mentor isn’t in your team.', answer_all: 'Answer every question first.', retry_later: 'That is three tries at this module today. Read it again and try tomorrow.',
  rate_limited: 'Too many in a row. Wait a minute and try again.', network: 'You’re offline. Nothing was saved.', too_long: 'That’s too long.',
};
function mp15ErrText(e) { const c = (e && (e.code || e.message)) || 'failed'; return MP15_ERR[c] || ('Couldn’t save (' + c + ').'); }

const mp15Api = {
  view: (view, opts) => NGGApi.member.mentorView(view, opts),
  act: (action, body) => NGGApi.member.mentorAct(action, body),
};

class Mp15Portal extends React.Component {
  rootRef = React.createRef();
  state = {
    scr: this.props.initial || 'week', hist: [], kid: null, ktab: 'overview', filter: 'all', q: '', sort: 'urgent', sel: {}, rel: {}, pTpl: 'saw', pBody: null,
    step: 'before', agenda: null, aim: 'All', here: {}, obs: {}, rv: {}, rvDone: {}, mf: 'all', msel: '', read: {}, reply: '', sup: null,
    cKid: '', cText: '', cCat: '', more: false, w: 1200, toast: '', undo: null,
    d: {}, ld: {}, er: {}, centre: '', gEdit: {}, hidden: {},
  };

  componentDidMount() {
    this.onKey = e => { if (e.key === 'Escape' && this.state.more) this.setState({ more: false }); };
    window.addEventListener('keydown', this.onKey);
    const el = this.rootRef.current;
    if (el && window.ResizeObserver) { this.ro = new ResizeObserver(([e]) => this.setState({ w: e.contentRect.width })); this.ro.observe(el); }
    const week = this.props.boot;
    this.setState({ d: { week }, centre: (week && week.me && week.me.centreOnScreen) || '' }, () => this.loadAll());
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this.onKey); this.ro && this.ro.disconnect(); clearTimeout(this.tt);
    Object.values(this.timers || {}).forEach(clearTimeout);
    this.flushRegister(); this.flushPlan();
  }

  /* ── Data ─────────────────────────────────────────────────────────────── */
  me() { return ((this.state.d.week || {}).me) || {}; }
  today() { return (this.state.d.week || {}).today || mp15Iso(new Date()); }
  role() { return this.me().role || 'pod'; }
  isLead() { return this.role() === 'lead' || this.role() === 'coord'; }
  satNextDate() { const t = this.today(); return mp15D(t) && mp15D(t).getUTCDay() === 6 ? t : mp15NextSat(t); }
  satLastDate() { const t = this.today(); return mp15D(t) && mp15D(t).getUTCDay() === 6 ? t : mp15LastSat(t); }

  load(key, view, opts) {
    this.setState(s => ({ ld: { ...s.ld, [key]: true }, er: { ...s.er, [key]: null } }));
    return mp15Api.view(view, Object.assign({ centre: this.state.centre || '' }, opts || {}))
      .then(r => { this.setState(s => ({ d: { ...s.d, [key]: r }, ld: { ...s.ld, [key]: false } })); return r; })
      .catch(e => { this.setState(s => ({ ld: { ...s.ld, [key]: false }, er: { ...s.er, [key]: e } })); return null; });
  }
  loadAll() {
    this.load('week', 'week'); this.load('case', 'caseload'); this.load('goals', 'goals'); this.load('sess', 'sessions');
    this.load('satNext', 'saturday', { date: this.satNextDate() });
    if (this.satLastDate() !== this.satNextDate()) this.load('satLast', 'saturday', { date: this.satLastDate() });
    this.load('msgs', 'messages'); this.load('index', 'index'); this.load('role', 'commitments'); if (this.me().mentorId) this.load('academy', 'academy');
    if (this.isLead()) this.load('team', 'team');
  }
  loadKid(id) { if (id) return this.load('kid:' + id, 'mentee', { subjectId: id }); }
  /* After a write, re-read what it changed. The server is the record. */
  refresh(keys, kid) {
    const map = { week: ['week', 'week'], case: ['case', 'caseload'], goals: ['goals', 'goals'], sess: ['sess', 'sessions'], msgs: ['msgs', 'messages'],
                  index: ['index', 'index'], role: ['role', 'commitments'], academy: ['academy', 'academy'], team: ['team', 'team'] };
    keys.forEach(k => {
      if (k === 'sat') { this.load('satNext', 'saturday', { date: this.satNextDate() }); if (this.satLastDate() !== this.satNextDate()) this.load('satLast', 'saturday', { date: this.satLastDate() }); }
      else if (map[k]) this.load(map[k][0], map[k][1]);
    });
    if (kid) this.loadKid(kid);
  }
  /* One write. Resolves to the server's answer or null; a refusal is a toast. */
  act(action, body, okText) {
    return mp15Api.act(action, Object.assign({ centre: this.state.centre || '' }, body || {}))
      .then(r => { if (okText) this.say(typeof okText === 'function' ? okText(r) : okText); return r || {}; })
      .catch(e => { this.say(mp15ErrText(e)); return null; });
  }

  say(t, undo) { clearTimeout(this.tt); this.setState({ toast: t, undo: undo || null }); this.tt = setTimeout(() => { this.setState({ toast: '', undo: null }); }, undo ? 6500 : 4000); }
  go(scr, extra) {
    const S = this.state; const m = this.rootRef.current && this.rootRef.current.querySelector('main'); if (m) m.scrollTop = 0;
    this.setState({ scr, more: false, hist: scr === S.scr ? S.hist : S.hist.concat([S.scr]).slice(-12), ...(scr !== S.scr ? { mOpen: false } : {}), ...(scr === 'concern' ? { cSent: null } : {}), ...(extra || {}) });
    /* Stars & results has an address of its own (/mentor/class), so a reload or a shared link reopens it. */
    if ((scr === 'classic') !== (S.scr === 'classic')) { try { history.replaceState({ page: 'mentor' }, '', '/mentor/' + (scr === 'classic' ? 'class' : 'ngg')); } catch (_) {} }
    const kid = (extra && extra.kid) || (scr === 'kid' ? S.kid : null);
    if (scr === 'kid' && kid && !S.d['kid:' + kid]) this.loadKid(kid);
    if (scr === 'module' && extra && extra.mod) this.setState({ mRes: null });
  }
  back() { const h = this.state.hist; this.setState({ scr: h.length ? h[h.length - 1] : 'week', hist: h.slice(0, -1) }); }
  goDue(g) {
    if (!g) return;
    const tab = { scorecard: 'score', overview: 'overview', goals: 'goals', family: 'family' }[g.tab] || 'overview';
    if (g.screen === 'mentee') return this.go('kid', { kid: g.id, ktab: tab, pBody: null });
    if (g.screen === 'mentees') return this.go('list', { filter: g.filter || 'all' });
    if (g.screen === 'messages') return this.go('msg');
    if (g.screen === 'saturday') return this.go('sat', { step: g.step || 'before' });
    if (g.screen === 'goals') return this.go('goals', { gf: g.filter || 'active' });
    if (g.screen === 'role' || g.screen === 'academy') return this.go(g.screen);
  }

  /* ── The caseload, as the design reads a child ────────────────────────── */
  kids() {
    const c = this.state.d.case; if (!c || !c.mentees) return [];
    if (this._kSrc === c) return this._k;
    const today = c.today || this.today();
    this._kSrc = c;
    return (this._k = c.mentees.map(r => ({
      id: r.id, first: r.first, name: r.name, ini: r.initials, age: r.age, school: r.school || '', phase: r.phase || 'Grow', week: r.week,
      contact: r.flags ? r.flags.contactDays : null, wb: r.wellbeing || 'Okay', relM: r.rel ? r.rel.mentor : null, relC: r.rel ? r.rel.child : null,
      relDue: !!(r.rel && r.rel.due), mentor: r.mentorName || '', guardian: r.guardianName || '', flags: r.flags || {}, urgency: r.urgency || 0,
      ag: r.activeGoal, famDays: r.lastFamilyUpdateAt ? mp15Days(r.lastFamilyUpdateAt, today) : null, pills: r.pills || [],
    })));
  }
  goalRows() { return ((this.state.d.goals || {}).goals) || []; }
  goalsOfKid(id) { return this.goalRows().filter(g => g.subjectId === id); }

  /* ── Saturday writes, saved as tapped ─────────────────────────────────── */
  queueRegister(id) {
    this.regDirty = Object.assign(this.regDirty || {}, { [id]: true });
    this.timers = this.timers || {}; clearTimeout(this.timers.reg);
    this.timers.reg = setTimeout(() => this.flushRegister(), 700);
  }
  flushRegister() {
    const ids = Object.keys(this.regDirty || {}); if (!ids.length) return Promise.resolve();
    this.regDirty = {};
    const rows = ids.map(id => ({ subjectId: id, here: this.hereOf(id), observed: this.obsOf(id), checks: this.chkOf(id), note: this.noteOf(id) }));
    clearTimeout((this.timers || {}).reg);
    return mp15Api.act('register', { centre: this.state.centre || '', date: this.satLastDate(), rows })
      .then(() => this.setState(st => { const sv = { ...(st.savedNotes || {}) }; rows.forEach(r => { sv[r.subjectId] = r.note; }); return { savedNotes: sv }; }))
      .catch(e => { ids.forEach(id => { this.regDirty[id] = true; }); this.say(mp15ErrText(e) + ' The register will retry.'); this.timers.reg = setTimeout(() => this.flushRegister(), 8000); });
  }
  satDuring() { return this.state.d.satLast || this.state.d.satNext || null; }
  hereOf(id) { const S = this.state; if (S.here[id] !== undefined) return S.here[id]; const r = (this.satDuring() || {}).register || {}; return !!(r[id] && r[id].here); }
  obsOf(id) { const S = this.state; if (S.obs[id]) return Object.keys(S.obs[id]).filter(v => S.obs[id][v]); const r = (this.satDuring() || {}).register || {}; return (r[id] && r[id].observed) || []; }
  /* The detail line: what the mentor saw, written on the day. */
  noteOf(id) { const S = this.state; if (S.notes && S.notes[id] !== undefined) return S.notes[id]; const r = (this.satDuring() || {}).register || {}; return (r[id] && r[id].note) || ''; }
  /* The formation duties (On time · Assignment in · Checked out): the mentor's tick, or the gate's arrival time for On time. */
  chkOf(id) { const S = this.state; if (S.chk && S.chk[id]) return Object.keys(S.chk[id]).filter(v => S.chk[id][v]); const r = (this.satDuring() || {}).register || {}; return (r[id] && r[id].checks) || []; }
  agendaNow() {
    const S = this.state; if (S.agenda) return S.agenda;
    const a = (this.state.d.satNext || {}).agenda || [];
    return a.map(x => ({ t: x.title, s: x.sub || '', m: Number(x.minutes) || 0, fixed: !!x.fixed }));
  }
  setAgenda(n) { this.setState({ agenda: n }); this.timers = this.timers || {}; clearTimeout(this.timers.plan); this.planDirty = true; this.timers.plan = setTimeout(() => this.flushPlan(), 900); }
  flushPlan(share) {
    if (!this.planDirty && !share) return Promise.resolve(null);
    this.planDirty = false;
    const sat = this.state.d.satNext || {};
    return this.act('saturdayPlan', { date: sat.date || this.satNextDate(), agenda: this.agendaNow().map(a => ({ title: a.t, sub: a.s, minutes: a.m, fixed: a.fixed })), oneToOnes: sat.oneToOnes || [], share: !!share });
  }

  /* ── Goals: the WOOP fields save as they are typed ────────────────────── */
  goalDraft(g) { return Object.assign({}, g, this.state.gEdit[g.id] || {}); }
  editGoal(kidId, g, patch) {
    this.setState(s => ({ gEdit: { ...s.gEdit, [g.id]: { ...(s.gEdit[g.id] || {}), ...patch } } }));
    this.timers = this.timers || {}; clearTimeout(this.timers['g' + g.id]);
    this.timers['g' + g.id] = setTimeout(() => this.saveGoal(kidId, g.id), 800);
  }
  saveGoal(kidId, gid) {
    const kd = this.state.d['kid:' + kidId]; const base = kd && (kd.goals || []).find(x => x.id === gid); if (!base) return Promise.resolve(null);
    const g = this.goalDraft(base);
    return this.act('goal', { subjectId: kidId, id: gid, goal: g.goal || '', outcome: g.outcome || '', obstacle: g.obstacle || '', plan: g.plan || '',
                              area: g.area || 'Character', reviewBy: g.reviewBy || '', dueOn: g.reviewBy || '', agreed: !!g.agreed });
  }

  /* ── Reports: built in the browser (the host has no renderer) ─────────── */
  async report(kind) {
    try {
      await loadVendor('jspdf');
      const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const me = this.me(); const today = this.today();
      let y = 18; const L = 18, W = 174;
      const line = (t, size, bold, col) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size || 10.5); doc.setTextColor(col || '#0b0b0c');
        doc.splitTextToSize(String(t), W).forEach(s => { if (y > 280) { doc.addPage(); y = 18; } doc.text(s, L, y); y += (size || 10.5) * 0.45; }); y += 1.5; };
      const rule = () => { doc.setDrawColor('#e8e5dd'); doc.line(L, y, L + W, y); y += 5; };
      const series = (items) => items.forEach(it => {
        const pts = it.series || []; const real = pts.filter(v => v !== null && v !== undefined);
        line(it.label + ' · ' + it.source, 10.5, true);
        if (!real.length) { line('Nothing recorded in the last 8 Saturdays.', 9.5, false, '#6b6b72'); return; }
        const x0 = L, bw = 9, gap = 3, hMax = 16; const top = y;
        pts.forEach((v, i) => { const h = v === null || v === undefined ? 0.6 : Math.max(0.6, hMax * v / 100); doc.setFillColor(i === pts.length - 1 ? '#0b0b0c' : '#d6d4cc'); doc.rect(x0 + i * (bw + gap), top + hMax - h, bw, h, 'F'); });
        y = top + hMax + 5; line('Latest ' + real[real.length - 1] + '%' + (real.length > 1 ? ' · change ' + (real[real.length - 1] - real[0] > 0 ? '+' : '') + (real[real.length - 1] - real[0]) + ' points since ' + mp15Fmt((this.state.d.index || {}).outcomes ? '' : '', {}) : ''), 9.5, false, '#4a4a50');
      });
      if (kind === 'kid') {
        const k = this.kids().find(x => x.id === this.state.kid); const kd = this.state.d['kid:' + (k && k.id)];
        if (!k || !kd) return this.say('Open the mentee first, then make the report.');
        line('NGG · Progress report', 9, true, '#6b6b72'); line(k.name, 20, true); line(k.phase + ' phase · ' + (k.school || 'School not recorded') + ' · ' + mp15Fmt(today, { day: 'numeric', month: 'long', year: 'numeric' }), 10, false, '#4a4a50'); rule();
        const ag = (kd.goals || []).find(g => g.status === 'active');
        line('Active goal', 12.5, true);
        if (ag) { line('“' + ag.goal + '” · ' + ag.area, 10.5); const c = ag.checks || []; line(c.length ? 'How close: ' + c[c.length - 1].progress + ' of 5 · ' + c.length + ' check-ins, the last on ' + mp15Fmt(c[c.length - 1].at) : 'Not checked in yet', 10, false, '#4a4a50'); }
        else line('No active goal yet.', 10, false, '#4a4a50');
        rule();
        const sc = kd.scorecard || {}; const skills = kd.skills || [];
        line('NGG Leadership Index · ' + (sc.cur ? mp15Month(sc.month) : (sc.prevMonth ? mp15Month(sc.prevMonth) : 'not scored yet')), 12.5, true);
        const cur = sc.cur || sc.prev;
        if (cur) { skills.forEach((s, i) => line(s[0] + ': ' + cur[i] + ' of 10' + (sc.cur && sc.prev ? '  (' + (cur[i] - sc.prev[i] >= 0 ? '+' : '') + (cur[i] - sc.prev[i]) + ')' : ''), 10)); line('Total ' + cur.reduce((a, b) => a + b, 0) + ' of 100', 10.5, true); }
        else line('No scorecard on record yet.', 10, false, '#4a4a50');
        rule(); line('The last 8 Saturdays', 12.5, true); series(((kd.progress || {}).items) || []);
        rule(); line('Mentor: ' + (me.name || '') + ' · ' + (MP15_ROLES[me.role] || 'Mentor') + ' · ' + (me.centre || ''), 9, false, '#6b6b72');
        line('This report carries no contact, health or safeguarding details.', 8.5, false, '#6b6b72');
        doc.save('NGG-progress-' + k.first + '-' + today + '.pdf');
        return this.say('Progress report for ' + k.first + ' saved as a PDF');
      }
      const ix = this.state.d.index || {};
      line('NGG · Pod report', 9, true, '#6b6b72'); line((me.name || 'Mentor') + ' · ' + this.kids().length + ' mentees', 20, true);
      line((me.centre || '') + ' · ' + mp15Fmt(today, { day: 'numeric', month: 'long', year: 'numeric' }), 10, false, '#4a4a50'); rule();
      line('NGG Leadership Index · ' + mp15Month(ix.month) + ' · ' + (ix.scored || 0) + ' of ' + (ix.of || 0) + ' scored', 12.5, true);
      (ix.skills || []).forEach(s => line(s.skill + ': ' + (s.avg === null ? '—' : s.avg.toFixed(1)) + (s.change !== null && s.change !== undefined ? '  (' + (s.change >= 0 ? '+' : '') + s.change.toFixed(1) + ')' : ''), 10));
      rule(); line('The last 8 Saturdays', 12.5, true); series(((ix.outcomes || {}).items) || []);
      rule(); line('By mentee, lowest total first', 12.5, true);
      (ix.byMentee || []).filter(b => b.total !== null && b.total !== undefined).forEach(b => line(b.name + ': ' + b.total + (b.prevTotal !== null && b.prevTotal !== undefined ? ' (' + (b.total - b.prevTotal >= 0 ? '+' : '') + (b.total - b.prevTotal) + ')' : '') + ' · lowest: ' + b.lowSkill, 10));
      doc.save('NGG-pod-report-' + today + '.pdf');
      this.say('Pod report saved as a PDF');
    } catch (e) { this.say('Couldn’t build the PDF. Check your connection and try again.'); }
  }

  /* ── The values the view reads ────────────────────────────────────────── */
  renderVals() {
    const S = this.state, set = o => this.setState(o), D = S.d;
    const me = this.me(), today = this.today();
    const roleId = MP15_ROLES[me.role] ? me.role : 'pod'; const roleLabel = MP15_ROLES[roleId];
    const isPeer = roleId === 'peer', isLead = roleId === 'lead' || roleId === 'coord';
    const narrow = S.w < 760, wide = !narrow;
    const lead = (me.lead && me.lead.first) || (isLead ? 'your coordinator' : 'your lead');
    const all = this.kids(); const N = all.length;
    const B = { wellbeing: k => !!k.flags.wellbeing, contact: k => !!k.flags.contact, rel: k => !!k.flags.rel, goal: k => !!k.flags.goal, family: k => !isPeer && !!k.flags.family };
    const FL = [['all', 'All'], ['wellbeing', 'Struggling'], ['contact', 'One-to-one overdue'], ['rel', 'Relationship check'], ['goal', 'Goal needs work'], ['family', 'Family update']].filter(f => !(isPeer && f[0] === 'family'));
    const wk = D.week || {}; const badgesSrv = wk.badges || {};
    const msgRows = ((D.msgs || {}).messages) || [];
    const unreadN = msgRows.filter(m => !m.read && !S.read[m.id] && m.kind !== 'From your lead').length;

    /* Saturday: Before plans the next one; During and After are the one just gone (or today). */
    const satN = D.satNext || {}, satL = this.satDuring() || {};
    const satKidsAll = all;
    /* Done means evaluated: the Saturday's criteria, a strength and a next step, not only the three ratings. */
    const reviewed = id => !!(S.rvDone[id] !== undefined ? S.rvDone[id] : ((satL.reviews || {})[id] || {}).evaluated);
    const hereIds = satKidsAll.filter(k => this.hereOf(k.id)).map(k => k.id);
    const revKids = hereIds.length ? satKidsAll.filter(k => hereIds.includes(k.id)) : [];
    const revTotal = revKids.length, revDoneN = revKids.filter(k => reviewed(k.id)).length;

    const dueN = all.filter(k => Object.keys(B).some(id => B[id](k))).length;
    const acMods = ((D.academy || {}).modules) || [];
    const modDone = m => !!m.passedAt && !(m.renewBy && m.renewBy < today);
    const badges = { list: badgesSrv.mentees !== undefined ? badgesSrv.mentees : dueN, sat: revTotal - revDoneN, msg: unreadN, academy: badgesSrv.academy || 0 };
    /* The Academy is a mentor's own record: staff overseeing a centre with no mentor record have none to complete. */
    const AREAS = [['This week', 'ph ph-sun-horizon', [['week', 'This week']]], ['Mentees', 'ph ph-users-three', [['list', 'All mentees'], ['goals', 'Goals'], ['sess', 'Sessions'], ['growth', 'Pod growth']].concat(isLead ? [['mentors', 'Mentors']] : [])], ['Saturday', 'ph ph-calendar-star', [['sat', 'Saturday']]], ['Messages', 'ph ph-chat-circle-text', [['msg', 'Messages']]], ['Me', 'ph ph-seal-check', [['role', 'My role'], ...(me.mentorId ? [['academy', 'Academy']] : []), ['classic', 'Stars & results']].concat(this.props.onHub ? [['hub', 'Other portals']] : [])]]
      .map(([l, icon, kids]) => { const n = kids.reduce((a, [id]) => a + (badges[id] || 0), 0); return { l, icon, kids, ids: kids.map(x => x[0]), b: n }; });
    const navCur = S.scr === 'kid' ? 'list' : S.scr === 'module' ? 'academy' : S.scr === 'concern' ? 'role' : S.scr;
    const goId = id => id === 'hub' ? this.props.onHub() : this.go(id);
    const area = AREAS.find(a => a.ids.includes(navCur)) || AREAS[0];
    const areaNav = AREAS.map(a => { const on = a === area; return { l: a.l, icon: on ? a.icon.replace('ph ph-', 'ph-fill ph-') : a.icon, cur: on ? 'page' : undefined, bg: on ? '#fff' : 'transparent', sh: on ? '0 0 0 1px #e8e5dd, 0 1px 2px rgba(11,11,12,.06)' : 'none', fw: on ? 600 : 500, b: a.b, hasB: !!a.b, go: () => goId(a.ids[0]) }; });
    const areaTabbar = AREAS.map(a => { const on = a === area; return { l: a.l === 'This week' ? 'Week' : a.l, icon: on ? a.icon.replace('ph ph-', 'ph-fill ph-') : a.icon, cur: on ? 'page' : undefined, fg: on ? '#0b0b0c' : '#626a6e', fw: on ? 600 : 500, hasB: !!a.b, go: () => goId(a.ids[0]) }; });
    const areaTabs = area.kids.map(([id, l]) => { const on = S.scr === id; const b = badges[id] || 0; return { l, on: on ? 'true' : 'false', fg: on ? '#0b0b0c' : '#5a5a60', fw: on ? 600 : 500, bar: on ? '#0b0b0c' : 'transparent', b, hasB: !!b, go: () => goId(id) }; });
    const inDetail = S.scr === 'kid' || S.scr === 'concern' || S.scr === 'module';
    const navDef = [['week', 'This week', 'ph ph-sun-horizon'], ['list', 'Mentees', 'ph ph-users-three'], ['goals', 'Goals', 'ph ph-target'], ['sess', 'Sessions', 'ph ph-notebook'], ['sat', 'Saturday', 'ph ph-calendar-star'], ['msg', 'Messages', 'ph ph-chat-circle-text'], ['growth', 'Pod growth', 'ph ph-chart-line-up'], ...(me.mentorId ? [['academy', 'Academy', 'ph ph-graduation-cap']] : []), ['role', 'My role', 'ph ph-seal-check'], ['classic', 'Stars & results', 'ph ph-star']].concat(this.props.onHub ? [['hub', 'Other portals', 'ph ph-squares-four']] : []);
    if (isLead) navDef.splice(2, 0, ['mentors', 'Mentors', 'ph ph-chalkboard-teacher']);
    const tabIds = ['week', 'list', 'sat', 'msg'];
    const moreItems = navDef.filter(n => !tabIds.includes(n[0])).map(([id, l, icon]) => ({ l, icon, b: badges[id], hasB: !!badges[id], go: () => goId(id) }));

    const ck0 = all.find(k => k.id === S.kid) || all[0] || { id: '', first: '', name: '', ini: '', age: null, school: '', phase: '', contact: null, wb: 'Okay', relM: null, relC: null, relDue: false, guardian: '', flags: {}, famDays: null };
    const kd = D['kid:' + ck0.id] || null;
    const q = S.q.trim().toLowerCase();
    let kids = all.filter(k => (S.filter === 'all' || (B[S.filter] && B[S.filter](k))) && (!q || (k.name + ' ' + k.school).toLowerCase().includes(q)));
    kids = kids.slice().sort((a, b) => S.sort === 'name' ? a.name.localeCompare(b.name) : S.sort === 'contact' ? (b.contact === null ? 9999 : b.contact) - (a.contact === null ? 9999 : a.contact) : b.urgency - a.urgency);
    const selIds = Object.keys(S.sel).filter(k => S.sel[k] && all.some(x => x.id === k)); const nSel = selIds.length;
    const wideCols = S.w >= 1180;
    const flagsOf = k => { const f = []; if (B.wellbeing(k)) f.push(['Struggling', 'bad']); if (B.contact(k)) f.push(['One-to-one overdue', 'warn']); if (B.rel(k)) f.push([k.relDue ? 'Check due' : 'Relationship', 'warn']); if (!wideCols && B.goal(k)) f.push([k.ag ? (k.ag.stalled ? 'Stalled' : 'On track') : 'No plan yet', 'neu']); if (B.family(k)) f.push(['Family update', 'neu']); return f.slice(0, 2).map(([l, t]) => ({ l, bg: MP15_TONE[t][0], fg: MP15_TONE[t][1] })); };
    const struggling = all.filter(B.wellbeing), overdue = all.filter(B.contact);
    const due = (wk.due || []).map(x => { const t = MP15_TONE[x.tone] || MP15_TONE.neu; return { icon: 'ph ph-' + x.icon, bg: t[0], fg: t[1], t: x.title, s: x.sub, go: () => this.goDue(x.go) }; });

    const firstMe = mp15First(me.name);
    /* No guardian on record: greet without a name, never "Good afternoon their family". */
    const hello = 'Good afternoon' + (ck0.guardian ? ' ' + ck0.guardian : '');
    const PT = { saw: ['Something I saw', hello + '. On Saturday I saw ' + ck0.first + ' [what you saw]. What have you noticed at home this month? – ' + firstMe],
                 plan: ['Their growth plan', hello + '. ' + ck0.first + ' and I agreed a plan' + (ck0.ag ? ': ' + ck0.ag.title : '') + '. You can help by asking how it went after school. – ' + firstMe],
                 meet: ['Ask to meet', hello + '. Could we have 15 minutes after Saturday’s session to talk about how ' + ck0.first + ' is growing? – ' + firstMe] };
    const draft = kd && kd.familyDraft;
    const pBody = S.pBody != null ? S.pBody : (draft && S.pTpl === 'saw' ? draft.body : PT[S.pTpl][1]);

    /* An outcome series from the server (percent, null = nothing recorded). */
    const mkOut = (it, sinceIso) => { const pts = it.series || []; const real = pts.filter(v => v !== null && v !== undefined); const d = real.length > 1 ? real[real.length - 1] - real[0] : 0;
      return { l: it.label, note: it.source, d: real.length > 1 ? (d > 0 ? '+' : '') + d + ' pts since ' + mp15Fmt(sinceIso, { day: 'numeric', month: 'short' }) : real.length ? real[real.length - 1] + '% latest' : 'Nothing recorded yet',
               fg: d > 0 ? '#1d6b30' : d < 0 ? '#b0361c' : '#6b6b72', pts: pts.map((v, i) => ({ h: (v === null || v === undefined ? 0 : v) + '%', c: v === null || v === undefined ? '#f0efea' : i === pts.length - 1 ? '#0b0b0c' : '#d6d4cc' })) }; };

    const agenda = this.agendaNow();
    let t0 = 510; /* the Musing & mentor breakout starts at 8:30 */ const total = agenda.reduce((n, a) => n + a.m, 0);
    const LIB = satN.activities || [];
    const ooIds = satN.oneToOnes || [];
    const ooKids = ooIds.map(id => (satN.mentees || []).find(m => m.id === id) || all.find(k => k.id === id)).filter(Boolean);

    /* My role: the twelve commitments, from the registers and records. */
    const R = D.role || {};
    const routeOf = a => {
      if (!a) return null;
      if (a.route === 'saturday:before') return () => this.go('sat', { step: 'before' });
      if (a.route === 'saturday:after') return () => this.go('sat', { step: 'after' });
      if (a.route === 'messages') return () => this.go('msg');
      if (a.route === 'mentees:family') return () => this.go('list', { filter: 'family' });
      if (a.route === 'action:retreat.book') return () => this.act('retreatBook', { retreatId: a.retreatId }, r => 'Place booked for ' + mp15Fmt(r.date)).then(r => r && this.refresh(['role', 'week']));
      return () => this.askLead(R);
    };
    const CM = (R.commitments || []).map(r => [r.title, r.rule, r.statusText, r.status, r.source, r.action ? r.action.label : null, routeOf(r.action)]);
    const met = CM.filter(r => r[3] === 'ok').length, tot = CM.length;
    const supA = (R.agreedLast && R.agreedLast.items) || [];
    const supKey = 'mp15.sup.' + ((R.agreedLast && R.agreedLast.date) || '');
    let supDone = {}; try { supDone = JSON.parse(localStorage.getItem(supKey) || '{}') || {}; } catch (_) {}
    const supAns = S.sup || ((R.supervision && R.supervision.prep) || ['', '', '']);

    const mList = msgRows.filter(m => S.mf === 'all' || m.filter === S.mf || (S.mf === 'journal' && /Journal/.test(m.kind)));
    const mSel0 = mList.find(m => m.id === S.msel) || mList[0];
    const mView = m => m ? { ...m, who: m.from, when: mp15When(m.at, today), t: m.body } : {};

    const titles = { module: ((acMods.find(m => m.id === S.mod)) || {}).title || 'Module', goals: 'Goals', sess: 'Sessions', week: 'This week', list: 'Mentees', kid: ck0.name, sat: 'Saturday', msg: 'Messages', growth: 'Pod growth', academy: 'Academy', role: 'My role', mentors: 'Mentors', concern: 'Report a concern', classic: 'Stars & results' };
    const nTeam = ((D.team || {}).mentors || []).length;
    const subs = { module: 'Academy', goals: 'Every mentee’s goal, how close they are, and when it was last checked', sess: 'Every one-to-one, pod session and family contact you’ve logged',
      week: mp15Fmt(today, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + N + ' mentees · ' + roleLabel.toLowerCase(), list: N + ' in your care · sorted by who needs you most', kid: '',
      sat: 'Musing & mentor breakout at 8:30am · ' + mp15Fmt(S.step === 'before' ? (satN.date || this.satNextDate()) : this.satLastDate(), { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + all.length + ' mentees',
      msg: unreadN + ' unread', growth: 'Last 8 Saturdays', academy: acMods.filter(modDone).length + ' of ' + acMods.length + ' modules complete', role: 'NGGC Mentorship Commitment and Conduct Policy', mentors: nTeam + ' mentors', concern: 'Goes straight to the safeguarding officer' };
    const pill = on => ({ bw: on ? '2px' : '1px', ring: on ? '#0b0b0c' : '#d6d4cc' });
    const chip = on => ({ line: on ? '#0b0b0c' : '#d6d4cc', bg: on ? '#0b0b0c' : '#fff', fg: on ? '#fff' : '#0b0b0c' });
    const seg = on => ({ bg: on ? '#fff' : 'transparent', sh: on ? '0 1px 2px rgba(0,0,0,.1)' : 'none' });
    const officer = (me.officer && me.officer.name) || 'the safeguarding officer';
    const officerFirst = me.officer && me.officer.name ? mp15First(me.officer.name.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, '')) : 'The officer';
    const nextSatL = mp15Fmt(this.satNextDate(), { weekday: 'long', day: 'numeric', month: 'long' });

    return {
      rootRef: this.rootRef, wide, narrow, narrowSub: narrow && !!subs[S.scr], mainPad: narrow ? '16px 16px 28px' : '32px 40px 56px', toastB: narrow ? '96px' : '24px',
      mainSlot: this.slot(),
      /* The class tools (stars, V3, notes, curriculum, school results and growth
         plans) are this portal's own screen, under its title and tabs: the same
         component /mentor/class has always run, as a panel, on the centre on screen. */
      mainSlotEnd: this.slotEnd(narrow), roleLabel, centre: me.centreOnScreen || me.centre || '', meName: me.name || '', meIni: mp15Initials(me.name), nav: areaNav, tabbar: areaTabbar, moreItems, moreOpen: S.more, closeMore: () => set({ more: false }),
      areaTabs, hasAreaTabs: area.kids.length > 1 && !inDetail, areaLabel: area.l,
      glance: [['Mentees', String(N), roleLabel, '#0b0b0c', () => this.go('list')],
               ['Seen in last 14 days', N ? Math.round((N - overdue.length) / N * 100) + '%' : '—', overdue.length + ' overdue', overdue.length ? '#7a5600' : '#1d6b30', () => this.go('list', { filter: 'contact' })],
               ['Struggling this week', String(struggling.length), struggling.length ? 'Talk before Saturday' : 'Nobody flagged', struggling.length ? '#b0361c' : '#1d6b30', () => this.go('list', { filter: 'wellbeing' })],
               ['Saturday evaluations', revDoneN + ' of ' + revTotal, revTotal ? 'Due Monday' : 'Nobody marked here', revDoneN === revTotal ? '#1d6b30' : '#0b0b0c', () => this.go('sat', { step: 'after' })]].map(([k, v, s, fg, go]) => ({ k, v, s, fg, go })),
      title: area.kids.length > 1 && !inDetail ? area.l : titles[S.scr], sub: S.scr === 'kid' ? '' : subs[S.scr], showBack: inDetail, back: () => this.back(), backL: S.scr === 'kid' ? 'Mentees' : S.scr === 'module' ? 'Academy' : 'Back',
      goConcern: () => this.go('concern'), lead, isPeer, notPeer: !isPeer,
      onWeek: S.scr === 'week', onModule: S.scr === 'module', onGoals: S.scr === 'goals', onSess: S.scr === 'sess', onList: S.scr === 'list', onKid: S.scr === 'kid', onSat: S.scr === 'sat', onMsg: S.scr === 'msg', onGrowth: S.scr === 'growth', onAcademy: S.scr === 'academy', onRole: S.scr === 'role', onMentors: S.scr === 'mentors' && isLead, onConcern: S.scr === 'concern',
      due: S.dueAll ? due : due.slice(0, 5), noDue: due.length === 0 && !!D.week, dueMore: due.length > 5 && !S.dueAll, dueRestL: 'Show ' + (due.length - 5) + ' more', seeAllDue: () => set({ dueAll: true }),
      week: (wk.week || []).map(x => ({ d: x.day, t: x.time, l: x.label, done: !!x.done })),
      filters: FL.map(([id, l]) => ({ l, n: (id === 'all' ? all : all.filter(B[id])).length, on: S.filter === id, ...chip(S.filter === id), go: () => set({ filter: id }) })),
      q: S.q, onQ: e => set({ q: e.target.value }), sort: S.sort, onSort: e => set({ sort: e.target.value }), barBg: nSel ? '#fff8e6' : '#fff',
      noSel: !nSel, hasSel: !!nSel, selText: nSel + ' selected', selAllIcon: !nSel ? 'ph ph-square' : nSel >= kids.length ? 'ph-fill ph-check-square' : 'ph-fill ph-minus-square', selAllL: nSel ? 'Clear selection' : 'Select all shown',
      selAll: () => { if (nSel) return set({ sel: {} }); const m = {}; kids.forEach(k => { m[k.id] = true; }); set({ sel: m }); }, clearSel: () => set({ sel: {} }),
      bulk: [['Add to Saturday one-to-ones', 'ph ph-calendar-plus', () => this.act('oneToOnesAdd', { subjectIds: selIds }, r => (r.added || 0) + ' added to ' + mp15Fmt(r.date, { weekday: 'long', day: 'numeric', month: 'long' }) + '’s one-to-ones').then(r => { if (r) { set({ sel: {} }); this.refresh(['sat']); } }), false],
             ['Family update', 'ph ph-house-line', () => this.act('familyDrafts', { subjectIds: selIds }, r => 'Drafts ready for ' + r.drafted + ' families. Review each before sending.').then(r => { if (r) set({ sel: {} }); }), isPeer],
             ['Add a note', 'ph ph-note-pencil', () => this.bulkNote(selIds), false]].map(([l, icon, go, off]) => ({ l, icon, go: off ? () => this.say('Your lead mentor contacts families') : go, off, why: off ? 'Your lead mentor contacts families' : '', op: off ? 0.4 : 1 })),
      wideCols, cols: wideCols ? '40px minmax(200px, 1.5fr) 120px 110px minmax(110px, 1fr) 250px' : '40px minmax(0, 1fr) minmax(0, max-content)',
      kids: kids.map(k => { const on = !!S.sel[k.id]; return { ...k, sub: [k.age !== null && k.age !== undefined ? 'Age ' + k.age : '', k.phase, isLead ? (k.mentor || 'No mentor') : k.school].filter(Boolean).join(' · '), contact: mp15Ago(k.contact), cFg: B.contact(k) ? '#7a5600' : '#4a4a50', cFw: B.contact(k) ? 600 : 400,
        rel: k.relC === null && k.relM === null ? 'Not asked' : (k.relC === null ? '–' : k.relC) + ' · ' + (k.relM === null ? '–' : k.relM), relTip: k.relC === null && k.relM === null ? 'No relationship check yet' : k.first + ' rates ' + (k.relC === null ? 'not yet' : k.relC) + ', you rate ' + (k.relM === null ? 'not yet' : k.relM),
        relDot: k.relC !== null && k.relC <= 2 ? '#b0361c' : k.relC !== null && k.relM !== null && k.relM - k.relC >= 2 ? '#e0a100' : k.relC === null ? '#d6d4cc' : '#2f9e44',
        goal: k.ag ? k.ag.title : 'No goal yet', flags: wideCols ? flagsOf(k) : flagsOf(k).slice(0, 1), bg: on ? '#fff8e6' : '#fff', selIcon: on ? 'ph-fill ph-check-square' : 'ph ph-square', selFg: on ? '#0b0b0c' : '#9a9aa0', selA: on ? 'true' : 'false', selL: (on ? 'Deselect ' : 'Select ') + k.name,
        toggle: () => set({ sel: { ...S.sel, [k.id]: !on } }), open: () => this.go('kid', { kid: k.id, ktab: 'overview', pBody: null }) }; }),
      noKids: kids.length === 0 && !!D.case, emptyT: !N ? 'Nobody is paired with you yet. Your coordinator makes the match.' : S.filter === 'all' ? 'Nobody matches that search.' : 'Nobody in this group right now.', resetF: () => set({ filter: 'all', q: '' }),
      ck: { ...ck0, sub: [ck0.age !== null && ck0.age !== undefined ? 'Age ' + ck0.age : '', ck0.phase ? ck0.phase + ' phase' : '', ck0.school, ck0.guardian ? 'Family: ' + ck0.guardian : ''].filter(Boolean).join(' · '),
        relCT: ck0.relC === null || ck0.relC === undefined ? 'Not yet' : ck0.relC + ' / 5', relMT: ck0.relM === null || ck0.relM === undefined ? 'Not yet' : ck0.relM + ' / 5',
        famWho: ck0.guardian || 'No family contact named', famT: ck0.famDays === null || ck0.famDays === undefined ? 'no update yet' : ck0.famDays <= 0 ? 'last update today' : 'last update ' + ck0.famDays + (ck0.famDays === 1 ? ' day ago' : ' days ago'), relGap: ck0.relM !== null && ck0.relC !== null && ck0.relM - ck0.relC >= 2 },
      facts: [['Last one-to-one', mp15Ago(ck0.contact), B.contact(ck0) ? '#7a5600' : '#0b0b0c'], ['This week', ck0.wb, B.wellbeing(ck0) ? '#b0361c' : '#0b0b0c'],
              ['Relationship', ck0.relC === null ? 'Not asked yet' : ck0.relC + ' / 5 from ' + ck0.first, ck0.relC !== null && ck0.relC <= 2 ? '#b0361c' : '#0b0b0c'],
              ['Active goal', ck0.ag ? (ck0.ag.lastCheckAt ? ck0.ag.progress + ' of 5 · ' + ck0.ag.area : 'Not checked yet') : 'None yet', ck0.ag && !ck0.ag.stalled ? '#1d6b30' : '#7a5600']].map(([k, v, fg]) => ({ k, v, fg })),
      kTabs: [['overview', 'Overview'], ['goals', 'Goals'], ['score', 'Scorecard'], ['sess', 'Sessions'], ['rel', 'Relationship'], ['family', 'Family'], ['prog', 'Progress']].filter(t => !(isPeer && t[0] === 'family')).map(([id, l]) => ({ l, on: S.ktab === id, fw: S.ktab === id ? 600 : 500, fg: S.ktab === id ? '#0b0b0c' : '#6b6b72', line: S.ktab === id ? '#0b0b0c' : 'transparent', go: () => set({ ktab: id }) })),
      kOverview: S.ktab === 'overview', kGoals: S.ktab === 'goals', kScore: S.ktab === 'score', kSess: S.ktab === 'sess', kRel: S.ktab === 'rel', kFamily: S.ktab === 'family' && !isPeer, kProg: S.ktab === 'prog',
      noTimeline: !!kd && !((kd.timeline || []).length), tlLog: () => this.go('sess', { logOpen: true, lf: { ...this.lfBlank(), kid: ck0.id, goalId: ck0.ag ? ck0.ag.id : '' } }),
      timeline: ((kd && kd.timeline) || []).map(x => ({ icon: 'ph ph-' + x.icon, fg: x.icon === 'binoculars' ? '#1d6b30' : x.icon === 'flame' ? '#a07400' : '#4a4a50', t: x.text, w: mp15Fmt(x.at, { day: 'numeric', month: 'short' }) + ' · ' + x.source })),
      relQs: MP15_REL_Q.map((qq, i) => { const relA = S.rel[ck0.id] || ((kd && kd.rel && kd.rel.mentor && kd.rel.mentor.answers) || {}); return { q: qq, opts: [1, 2, 3, 4, 5].map(n => ({ l: String(n), on: relA[i] === n, ...pill(relA[i] === n), go: () => set({ rel: { ...S.rel, [ck0.id]: { ...relA, [i]: n } } }) })) }; }),
      saveRel: () => { const a = S.rel[ck0.id] || {}; if ([0, 1, 2, 3].some(i => !a[i])) return this.say('Answer all four first'); this.act('relCheck', { subjectId: ck0.id, answers: [a[0], a[1], a[2], a[3]] }, 'Saved. ' + ck0.first + ' answers their side this week.').then(r => r && this.refresh(['case'], ck0.id)); },
      askFit: () => this.act('relFit', { subjectId: ck0.id }, 'Sent to ' + (isLead ? 'the coordinator' : lead) + '. Nothing changes until you’ve talked.'),
      pTpls: Object.keys(PT).map(id => ({ l: PT[id][0], on: S.pTpl === id, ...pill(S.pTpl === id), go: () => set({ pTpl: id, pBody: null }) })), pBody, onPBody: e => set({ pBody: e.target.value }),
      outcomes: (((kd && kd.progress) || {}).items || []).map(it => mkOut(it, ((kd.progress || {}).saturdays || [])[0])),
      makeReport: () => this.report('kid'),
      steps: [['before', 'Before', 'Plan the session'], ['during', 'During', hereIds.length + ' here'], ['after', 'After', revDoneN + ' of ' + revTotal + ' evaluated']].map(([id, l, s]) => ({ l, s, on: S.step === id, ...seg(S.step === id), go: () => { if (S.step === 'during' && id !== 'during') this.flushRegister(); set({ step: id }); } })),
      sBefore: S.step === 'before', sDuring: S.step === 'during', sAfter: S.step === 'after',
      agenda: agenda.map((a, i) => { const at = t0; t0 += a.m; return { ...a, at: Math.floor(at / 60) + ':' + String(at % 60).padStart(2, '0'), first: i === 0, upOp: i ? 1 : 0.3, rmOp: a.fixed ? 0.3 : 1,
        up: () => { if (!i) return; const n = agenda.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; this.setAgenda(n); }, rm: () => { if (a.fixed) return this.say('The huddle, one-to-ones and close stay on the agenda'); this.setAgenda(agenda.filter((_, j) => j !== i)); } }; }),
      agTotal: total + ' of 90 min', agFg: total > 90 ? '#b0361c' : '#4a4a50',
      ooN: ooKids.length, ooNames: ooKids.map(k => mp15First(k.name) + ' (' + (k.contactDays === null || k.contactDays === undefined ? (k.contact === null || k.contact === undefined ? 'never' : k.contact + ' days') : k.contactDays + ' days') + ')').join(' · ') || 'Nobody picked yet. Use “Add to Saturday one-to-ones” on Mentees.',
      sharePlan: () => this.flushPlan(true).then(r => { if (r) this.say(me.lead ? 'Agenda shared with ' + lead : 'Agenda saved. There’s no lead on your record to share it with.'); }),
      aims: ['All'].concat(Array.from(new Set(LIB.map(x => x.aim)))).map(a => ({ l: a, on: S.aim === a, ...pill(S.aim === a), go: () => set({ aim: a }) })),
      lib: LIB.filter(x => S.aim === 'All' || x.aim === S.aim).map(x => { const added = agenda.some(a => a.t === x.title); return { t: x.title, d: x.sub, meta: x.aim + ' · ' + x.minutes + ' min', added, op: added ? 0.5 : 1, addL: added ? 'Added' : 'Add',
        add: () => { if (added) return; const n = agenda.slice(); n.splice(Math.max(1, n.length - 2), 0, { t: x.title, s: x.aim, m: Number(x.minutes) || 15, fixed: false }); this.setAgenda(n); } }; }),
      hereText: hereIds.length + ' of ' + satKidsAll.length + ' here',
      toAfter: () => { this.flushRegister(); set({ step: 'after' }); },
      reg: satKidsAll.map(k => { const h = this.hereOf(k.id); const o = this.obsOf(k.id); const VALS = satL.values || ['Courage', 'Responsibility', 'Respect', 'Teamwork'];
        const note = this.noteOf(k.id); const nOpen = !!(S.noteOpen || {})[k.id] && h; const sv = (S.savedNotes || {})[k.id]; const saved = (sv !== undefined ? sv : ((((satL.register || {})[k.id]) || {}).note || '')) === note;
        return { name: k.name, open: () => { const w = this.flushRegister(); this.go('kid', { kid: k.id, ktab: 'overview', pBody: null }); w.then(() => this.loadKid(k.id)); },
          sub: !h ? 'Away' : note ? '“' + (note.length > 70 ? note.slice(0, 68) + '…' : note) + '”' : o.length ? o.join(', ') + ' · no detail yet' : 'Nothing noted yet',
          noteA: nOpen ? 'true' : 'false', noteOpen: nOpen, noteL: note ? 'Edit detail' : 'Add detail', noteId: 'm15-note-' + k.id, note,
          noteGo: () => { if (!h) return this.say('Mark ' + k.first + ' here first'); set({ noteOpen: { ...(this.state.noteOpen || {}), [k.id]: !nOpen } }); },
          onNote: e => { set({ notes: { ...(this.state.notes || {}), [k.id]: e.target.value.slice(0, 500) } }); this.queueRegister(k.id); },
          noteMeta: note.length + ' of 500' + (note && !saved ? ' · not saved yet' : ''),
          noteSave: () => { this.queueRegister(k.id); this.flushRegister(); set({ noteOpen: { ...(this.state.noteOpen || {}), [k.id]: false } }); this.say(note.trim() ? 'Detail saved for ' + k.first : 'Detail cleared for ' + k.first); },
          hereA: h ? 'true' : 'false', hereL: h ? 'Here' : 'Away', icon: h ? 'ph ph-check' : 'ph ph-minus', line: h ? '#1d6b30' : '#d6d4cc', bg: h ? '#f3faf4' : '#fff', fg: h ? '#1d6b30' : '#6b6b72', away: !h, op: h ? 1 : 0.4,
          toggle: () => { set({ here: { ...this.state.here, [k.id]: !h } }); this.queueRegister(k.id); },
          vals: VALS.map(v => { const on = o.includes(v); return { l: v, on, ...pill(on), bg: on ? '#f3faf4' : '#fff', go: () => { if (!h) return this.say('Mark ' + k.first + ' here first'); const m = {}; o.forEach(x => { m[x] = true; }); m[v] = !on; set({ obs: { ...this.state.obs, [k.id]: m } }); this.queueRegister(k.id); } }; })
            .concat((satL.checks || ['On time', 'Assignment in', 'Checked out']).map(v => { const cs = this.chkOf(k.id); const on = cs.includes(v); const arr = (((satL.register || {})[k.id]) || {}).arrivedAt;
              return { l: v === 'On time' && arr ? v + ' · ' + arr : v, on, ...pill(on), bg: on ? '#eef3fb' : '#fff', go: () => { if (!h) return this.say('Mark ' + k.first + ' here first'); const m = {}; cs.forEach(x => { m[x] = true; }); m[v] = !on; set({ chk: { ...(this.state.chk || {}), [k.id]: m } }); this.queueRegister(k.id); } }; })) }; }),
      revText: revDoneN + ' of ' + revTotal + ' evaluated · due Monday', revPct: (revTotal ? revDoneN / revTotal * 100 : 0) + '%', noReviews: revTotal === 0 && !!satL.date,
      reviews: revKids.map((k, ki) => this.evalCard(k, ki, revKids, satL, reviewed, pill)),
      mFilters: [['all', 'All'], ['journal', 'Journal'], ['checkin', 'Check-ins'], ['chat', 'Mentees']].concat(isPeer ? [] : [['family', 'Families']]).concat([['lead', isLead ? 'Mentors' : 'From ' + lead]]).filter(([id]) => id === 'all' || msgRows.some(m => m.filter === id)).map(([id, l]) => ({ l, on: S.mf === id, ...chip(S.mf === id), go: () => set({ mf: id }) })),
      mCols: S.w >= 1000 ? 'minmax(0, 1fr) minmax(0, 1.2fr)' : 'minmax(0, 1fr)',
      hasMsg: !!mSel0, mSel: mView(mSel0), reply: S.reply, onReply: e => set({ reply: e.target.value }), replyPh: mSel0 && /Journal/.test(mSel0.kind) ? 'Name what you noticed. One line is enough.' : 'Write a reply',
      sendReply: () => { if (!S.reply.trim() || !mSel0) return this.say('Write a reply first');
        this.act('messageReply', { threadId: mSel0.threadId, subjectId: mSel0.subjectId || '', body: S.reply.trim() }, r => r.queued ? 'Reply saved. It goes at 8am.' : 'Reply sent to ' + mp15First(mSel0.from)).then(r => { if (r) { set({ reply: '', read: { ...S.read, [mSel0.id]: true } }); this.refresh(['msgs', 'week', 'role']); } }); },
      podOut: (((D.index || {}).outcomes || {}).items || []).map(it => mkOut(it, (((D.index || {}).outcomes || {}).saturdays || [])[0])),
      podReport: () => this.report('pod'),
      acPctT: Math.round(acMods.filter(modDone).length / Math.max(1, acMods.length) * 100) + '%', acPct: (acMods.filter(modDone).length / Math.max(1, acMods.length) * 100) + '%',
      cmMet: met, cmTot: tot, cmDaysLeft: R.daysLeft !== undefined ? R.daysLeft + ' days left in the month' : '', cmMonthL: 'commitments on track for ' + mp15Month(R.month), roleCols: S.w >= 1000 ? 'minmax(0, 1.3fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
      cmBar: CM.map(r => ({ c: r[3] === 'ok' ? '#1d6b30' : r[3] === 'bad' ? '#b0361c' : '#e0a100' })).sort((x, y) => (x.c === '#1d6b30' ? 0 : 1) - (y.c === '#1d6b30' ? 0 : 1)),
      cmAttn: CM.filter(r => r[3] !== 'ok').map(r => ({ t: r[0], s: r[1], st: r[2], dot: r[3] === 'bad' ? '#b0361c' : '#e0a100', cta: r[5] || 'Talk to ' + lead, go: r[6] || (() => this.askLead(R, r[0])) })), cmAttnN: CM.filter(r => r[3] !== 'ok').length + ' to do', cmNoAttn: !!D.role && CM.every(r => r[3] === 'ok'),
      cmOk: CM.filter(r => r[3] === 'ok').map(r => ({ t: r[0], st: r[2], src: r[4] })),
      supWhen: R.supervision ? mp15Fmt(R.supervision.date, { weekday: 'long', day: 'numeric', month: 'long' }) + ', after the STS meeting · 20 minutes' : 'Not booked yet. ' + (me.lead ? lead + ' books it' : 'Your lead books it') + ', usually on a Tuesday after STS.',
      supAgreedL: R.agreedLast ? 'Agreed last time · ' + mp15Fmt(R.agreedLast.date) + ' · your own checklist, on this device' : 'Nothing agreed at a supervision yet',
      supActs: supA.map((x, i) => { const t = typeof x === 'string' ? x : (x && (x.t || x.text)) || ''; const d = !!supDone[i]; return { t, a: d ? 'true' : 'false', icon: d ? 'ph-fill ph-check-square' : 'ph ph-square', fg: d ? '#1d6b30' : '#9a9aa0', tfg: d ? '#6b6b72' : '#0b0b0c',
        go: () => { try { localStorage.setItem(supKey, JSON.stringify({ ...supDone, [i]: !d })); } catch (_) {} this.forceUpdate(); } }; }),
      supNote: supAns.filter(v => v && String(v).trim()).length + ' of 3 answered',
      askFeedback: () => this.askLead(R, null, 2), readPolicy: () => { try { window.__navigate ? window.__navigate('policies') : (location.href = '/policies'); } catch (_) {} },
      supQs: ['What went well with a mentee since we last met?', 'Where are you stuck?', 'What do you need from me?'].map((qq, i) => ({ q: qq, v: supAns[i] || '', on: e => { const n = supAns.slice(); n[i] = e.target.value; set({ sup: n }); } })),
      sendSup: () => this.act('supervisionPrep', { answers: supAns }, me.lead ? 'Sent to ' + lead + '. See you on ' + (R.supervision ? mp15Fmt(R.supervision.date, { weekday: 'long' }) : 'Tuesday') + '.' : 'Saved for your supervision.').then(r => r && this.refresh(['role'])),
      fbText: R.feedback ? '“' + R.feedback.text + '”' : 'No feedback from ' + lead + ' yet. It appears here after supervision.', fbWhen: R.feedback ? mp15Fmt(R.feedback.at) + ' · after supervision' : '',
      polText: R.policy && R.policy.acceptedAt ? 'You accepted the NGGC Mentorship Commitment and Conduct Policy on ' + mp15Fmt(R.policy.acceptedAt, { day: 'numeric', month: 'long', year: 'numeric' }) + '. The 12 commitments you can act on each month are tracked here.'
                                               : 'Your acceptance of the NGGC Mentorship Commitment and Conduct Policy isn’t on record yet. Your coordinator records it. The 12 commitments you can act on each month are tracked here.',
      polStandard: (R.policy && R.policy.standard) || 'A mentor observes, models, guides, challenges, encourages, documents, collaborates and follows through.',
      officer, cText: S.cText, onCText: e => set({ cText: e.target.value }),
      ...this.gsVals({ all, ck: ck0, kd, pill, chip, seg, set, wideCols, today, isPeer }),
      pkLog: this.picker('log', (S.lf || {}).kid || '', id => this.setState(st => ({ lf: { ...(st.lf || this.lfBlank()), kid: id, goalId: '' } })), all),
      pkCon: this.picker('con', S.cKid, id => this.setState({ cKid: id }), all),
      ...this.scVals({ all, ck: ck0, kd, set, wideCols }),
      ...this.xVals({ all, ck: ck0, kd, set, pill, chip, wideCols, isPeer, isLead, roleId, B, lead, mList, mSel: mSel0, pBody, today, officerFirst, acMods, modDone, nextSatL, draft }),
      hasToast: !!S.toast, toast: S.toast, toastUndo: !!S.undo, onUndo: () => { const u = S.undo; clearTimeout(this.tt); set({ toast: '', undo: null }); u && u(); },
    };
  }

  lfBlank() { return { type: 'One-to-one', kid: '', date: this.today(), mins: '15', goalId: '', p: 0, what: '', next: '' }; }
  /* "Talk to my lead": the supervision prep is the channel to the lead that
     is on record, so the commitment goes in there, ready to send. */
  askLead(R, about, field) {
    const ans = (this.state.sup || ((R && R.supervision && R.supervision.prep) || ['', '', ''])).slice();
    const i = field === undefined ? 1 : field;
    if (about && !String(ans[i] || '').includes(about)) ans[i] = (ans[i] ? ans[i] + '\n' : '') + 'About “' + about + '”: ';
    this.go('role', { sup: ans });
    setTimeout(() => { const el = this.rootRef.current && this.rootRef.current.querySelectorAll('textarea')[i]; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 60);
    this.say('Write it here and press Send. It reaches ' + ((this.me().lead && this.me().lead.first) || 'your lead') + ' on record.');
  }
  bulkNote(ids) {
    const t = window.prompt('A note for ' + ids.length + ' record' + (ids.length === 1 ? '' : 's') + '. It is logged as a note on each.');
    if (t === null) return;
    if (t.trim().length <= 3) return this.say('Write what happened first.');
    this.act('session', { type: 'Note', subjectIds: ids, date: this.today(), what: t.trim(), minutes: 0 }, r => 'Note added to ' + r.count + ' records').then(r => { if (r) { this.setState({ sel: {} }); this.refresh(['sess']); } });
  }

  /* Loading and an honest error, inside <main>, for the screen on display. */
  slot() {
    const inner = this.slotInner();
    const cs = this.me().centres || [];
    if (this.role() !== 'coord' || cs.length < 2) return inner;
    /* A coordinator over several centres works one at a time; switching re-reads every screen for that centre. */
    return <>
      <div className="m15x-slot m15x-centre"><label><span>Centre</span>
        <select value={this.state.centre || this.me().centreOnScreen || ''} onChange={e => this.setState({ centre: e.target.value, d: { week: this.state.d.week }, sel: {}, here: {}, obs: {}, chk: {}, agenda: null }, () => this.loadAll())}>
          {cs.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>
      {inner}</>;
  }
  /* One child's Saturday evaluation on After: the week's three ratings, the
     formation criteria (pre-filled from the register, confirmed by the mentor),
     a strength and a next step the child and family read, and a staff-only line.
     One card open at a time; "Save and next child" walks the pod. */
  evalPrefill(id, satL) {
    if (!this.hereOf(id)) return { criteria: {}, strength: '' };
    const chk = this.chkOf(id), obs = this.obsOf(id), arr = (((satL.register || {})[id]) || {}).arrivedAt || '';
    const c = { assignment: chk.includes('Assignment in') ? 'Demonstrated' : 'Not yet' };
    if (chk.includes('On time')) c.punctuality = 'Demonstrated'; else if (arr) c.punctuality = 'Emerging';
    [['Respect', 'respect'], ['Teamwork', 'teamwork'], ['Courage', 'courage']].forEach(([v, key]) => { if (obs.includes(v)) c[key] = 'Demonstrated'; });
    return { criteria: c, strength: (this.noteOf(id) || '').trim() };
  }
  evalCard(k, ki, kids, satL, reviewed, pill) {
    const S = this.state, set = o => this.setState(o);
    const CR = satL.evalCriteria || MP15_EVAL_CRITERIA, SCALE = satL.evalScale || MP15_EVAL_SCALE;
    /* The pre-fill mirrors mp_eval_prefill on the server, from the register as it stands on this screen
       (taps on During this morning included), so After never starts from a stale read. */
    const srv = (satL.reviews || {})[k.id], pre = this.evalPrefill(k.id, satL);
    const base = srv ? { Effort: srv.effort, Character: srv.characterLevel, Wellbeing: srv.wellbeing, line: srv.line || '' } : {};
    const sev = srv && srv.eval ? srv.eval : null;
    const v = S.rv[k.id] || { ...base, crit: sev ? { ...sev.criteria } : { ...pre.criteria }, strength: sev ? sev.strength : (pre.strength || ''), next: sev ? sev.next : '' };
    const put = p => set({ rv: { ...this.state.rv, [k.id]: { ...v, ...p } }, evErr: { ...(this.state.evErr || {}), [k.id]: '' } });
    const done = reviewed(k.id);
    const firstOpen = kids.find(x => !reviewed(x.id));
    const openId = S.evOpen !== undefined ? S.evOpen : (firstOpen ? firstOpen.id : null);
    const open = openId === k.id;
    const crit = v.crit || {};
    const ratedN = CR.filter(c => crit[c.key]).length;
    const ok3 = v.Effort && v.Character && v.Wellbeing;
    const ok = ok3 && ratedN === CR.length && (v.strength || '').trim() && (v.next || '').trim();
    const obs = this.obsOf(k.id), note = this.noteOf(k.id);
    const next = kids.slice(ki + 1).find(x => !reviewed(x.id)) || kids.find((x, i) => i !== ki && !reviewed(x.id));
    const err = (S.evErr || {})[k.id] || '';
    const missing = () => [!ok3 ? 'effort, character and wellbeing' : '', ratedN < CR.length ? (CR.length - ratedN) + ' of the Saturday criteria' : '', !(v.strength || '').trim() ? 'a strength' : '', !(v.next || '').trim() ? 'a next step' : ''].filter(Boolean);
    const save = goNext => {
      if (!ok) { const m = missing(); return set({ evErr: { ...(this.state.evErr || {}), [k.id]: 'Still to do: ' + m.join(', ') + '.' } }); }
      const body = { subjectId: k.id, date: this.satLastDate(), effort: v.Effort, character: v.Character, wellbeing: v.Wellbeing, line: v.line || '',
        eval: { criteria: crit, strength: (v.strength || '').trim(), next: (v.next || '').trim() } };
      mp15Api.act('weekReview', Object.assign({ centre: this.state.centre || '' }, body)).then(r => {
        set({ rvDone: { ...this.state.rvDone, [k.id]: true }, evOpen: goNext && next ? next.id : null });
        this.say('Evaluation saved for ' + k.first, () => this.act('weekReviewUndo', { subjectId: k.id, period: r.period }).then(u => { if (u) { const rv = { ...this.state.rvDone }; delete rv[k.id]; set({ rvDone: rv, evOpen: k.id }); this.refresh(['sat', 'sess', 'week']); } }));
        this.refresh(['sat', 'sess', 'week']);
      }).catch(e => { const c = e.code || e.message || ''; set({ evErr: { ...(this.state.evErr || {}), [k.id]: c === 'rate_every_criterion' ? 'Rate every Saturday criterion first.' : c === 'strength_and_next' ? 'Write a strength and a next step first.' : mp15ErrText(e) } }); });
    };
    const sumLine = done && sev ? 'Strength: ' + sev.strength + ' · Next: ' + sev.next : done ? 'Evaluated' : '';
    return { name: k.name, first: k.first, done, open, openA: open ? 'true' : 'false', panelId: 'm15-ev-' + k.id, chev: open ? 'ph ph-caret-up' : 'ph ph-caret-down',
      toggleL: open ? 'Close' : done ? 'Edit' : 'Evaluate', toggle: () => set({ evOpen: open ? null : k.id }),
      bd: open ? '#0b0b0c' : '#e8e5dd', stL: done ? 'Evaluated' : 'To do', stBg: done ? '#f3faf4' : '#fdf6e3', stFg: done ? '#1d6b30' : '#7a5600',
      seen: (obs.length ? 'Observed: ' + obs.join(', ') : 'Here on Saturday') + (note ? '. Noted: “' + note + '”' : ''),
      hasSum: !open && !!sumLine, sum: sumLine,
      scales: ['Effort', 'Character', 'Wellbeing'].map(l => ({ l, opts: MP15_LEVELS.map(o => ({ l: o, on: v[l] === o ? 'true' : 'false', ...pill(v[l] === o), go: () => put({ [l]: o }) })) })),
      critMeta: ratedN + ' of ' + CR.length + ' rated',
      crit: CR.map(c => { const cur = crit[c.key]; const fromReg = !sev && !(S.rv[k.id]) && pre.criteria[c.key] && pre.criteria[c.key] === cur;
        return { l: c.label, h: c.hint, pre: !!fromReg, preL: 'From the register',
          opts: SCALE.map(o => { const on = cur === o; return { l: o, on: on ? 'true' : 'false', ...pill(on), bg: on ? '#f3faf4' : '#fff', go: () => put({ crit: { ...crit, [c.key]: o } }) }; }) }; }),
      strength: v.strength || '', onStrength: e => put({ strength: e.target.value.slice(0, 400) }), strBd: err && !(v.strength || '').trim() ? '#b0361c' : '#d6d4cc',
      next: v.next || '', onNext: e => put({ next: e.target.value.slice(0, 400) }), nextBd: err && !(v.next || '').trim() ? '#b0361c' : '#d6d4cc',
      line: v.line || '', onLine: e => put({ line: e.target.value }),
      hasErr: !!err, err, cantA: ok ? 'false' : 'true', btnBg: ok ? '#0b0b0c' : '#efefed', btnFg: ok ? '#fff' : '#6b6b72',
      hasNext: !!next, submit: () => save(false), submitNext: () => save(true) };
  }
  /* After the screen's own title and content (v.mainSlotEnd): the Saturday
     Formation Schedule, the mentor's part of each block (the next blocks on
     This week, the whole day on Saturday), and the class tools (stars, V3,
     notes, curriculum, school results and growth plans) as this portal's own
     screen, on the centre on screen. Below the title, never above it. */
  slotEnd(narrow) {
    const S = this.state; const cls = 'm15x-slot m15x-end' + (narrow ? ' is-narrow' : '');
    const need = { week: ['week'], sat: ['satNext'] }[S.scr];
    if (need && need.some(k => S.ld[k] || S.er[k] || !S.d[k])) return null;
    if (S.scr === 'week') return <div className={cls}><FormationDay audience="mentor" compact={true} onMore={() => this.go('sat', { step: 'before' })}/></div>;
    if (S.scr === 'sat') return <div className={cls}><FormationDay audience="mentor" compact={true}/></div>;
    if (S.scr === 'classic') { const cs = this.me().centres || []; const ce = this.state.centre || this.me().centreOnScreen || (cs.length === 1 ? cs[0] : '');
      return <div className={cls}><MentorPortal key={'class:' + ce} programme="ngg" embedded={true} centre={ce}/></div>; }
    return null;
  }
  slotInner() {
    const S = this.state;
    const need = { week: ['week', 'case'], list: ['case'], goals: ['goals', 'case'], sess: ['sess', 'case'], sat: ['satNext', 'case'].concat(this.satLastDate() !== this.satNextDate() ? ['satLast'] : []),
                   msg: ['msgs'], growth: ['index'], academy: ['academy'], module: ['academy'], role: ['role'], mentors: ['team'], kid: ['kid:' + S.kid], concern: ['case'] }[S.scr] || [];
    const failed = need.filter(k => S.er[k]); const loading = need.some(k => S.ld[k] || (!S.d[k] && !S.er[k]));
    if (failed.length) {
      const e = S.er[failed[0]]; const code = (e && (e.code || e.message)) || '';
      return <div className="m15x-slot"><div className="m15x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{code === 'network' ? 'You’re offline. This screen couldn’t load.' : code === 'not_in_caseload' ? 'That child isn’t in your caseload.' : 'This screen couldn’t load (' + (code || 'error') + ').'}</span>
        <button type="button" onClick={() => { this.setState({ er: {} }); this.loadAll(); if (S.scr === 'kid') this.loadKid(S.kid); }}>Retry</button></div></div>;
    }
    if (loading) return <div className="m15x-slot"><div className="m15x-load" role="status" aria-live="polite"><span className="m15x-bar"/><span className="m15x-sr">Loading</span></div></div>;
    /* The class tools (stars, V3, notes, curriculum, school results and growth
       plans) are this portal's own screen: the same component /mentor/class
       has always run, in the portal's frame, on the centre on screen. */
    return null;
  }

  gsVals(c) {
    const S = this.state, set = c.set, all = c.all, ck = c.ck, kd = c.kd, today = c.today;
    const rows = this.goalRows();
    const stat = g => g.stalled ? ['Stalled', '#fdf6e3', '#7a5600'] : g.status === 'active' ? ['Active', '#f0efea', '#2b2b30'] : g.status === 'achieved' ? ['Achieved', '#f3faf4', '#1d6b30'] : [g.status === 'paused' ? 'Paused' : 'Draft', '#f4f4f2', '#6b6b72'];
    const segsP = (p, g) => { const col = g.stalled ? '#e0a100' : g.status === 'achieved' ? '#1d6b30' : '#0b0b0c'; return [1, 2, 3, 4, 5].map(i => ({ c: i <= p ? col : '#e8e5dd' })); };
    const fmtDue = d => d ? mp15Fmt(d, { day: 'numeric', month: 'short' }) : '—';
    const gf = S.gf || 'active', ga = S.gArea || 'All areas';
    const byId = Object.fromEntries(all.map(k => [k.id, k]));
    const noneK = ((S.d.goals || {}).noGoal || []).map(x => byId[x.subjectId] || { id: x.subjectId, name: x.name, ini: x.initials, phase: x.phase });
    const lastDays = g => g.lastCheckAt ? mp15Days(g.lastCheckAt, today) : null;
    const picked = gf === 'none' ? noneK.map(k => [k, null]) : rows.filter(g => gf === 'active' ? g.status === 'active' : gf === 'stalled' ? g.stalled : gf === 'achieved' ? g.status === 'achieved' : g.status === 'draft' || g.status === 'paused').map(g => [byId[g.subjectId] || { id: g.subjectId, name: g.name, ini: g.initials }, g]);
    const list = picked.filter(([, g]) => ga === 'All areas' || !g || g.area === ga).sort((a, b) => a[1] && b[1] ? ((b[1].stalled ? 1 : 0) - (a[1].stalled ? 1 : 0)) || ((lastDays(b[1]) === null ? 999 : lastDays(b[1])) - (lastDays(a[1]) === null ? 999 : lastDays(a[1]))) : 0);

    const G = (kd && kd.goals) || []; const gsel = (S.gsel || {})[ck.id];
    const g0 = G.find(x => x.id === gsel) || G.find(x => x.status === 'active') || G[0];
    const g = g0 ? this.goalDraft(g0) : null;
    const ci = (S.ci || {})[g ? g.id : ''] || {};
    const checks = g ? (g.checks || []) : [];
    const lastCk = checks.length ? checks[checks.length - 1] : null;
    const gLast = lastCk ? mp15Days(lastCk.at, today) : null;
    const locked = !!(kd && kd.goalsLocked);

    /* Sessions: a pod session is one row per child on the server; on screen
       it is the session, once. */
    const srvS = (((S.d.sess || {}).sessions) || []).filter(s => !S.hidden[s.id]);
    const grouped = []; const podAt = {};
    srvS.forEach(s => { const type = MP15_KIND_TYPE[s.kind] || 'Note';
      if (type === 'Pod session') { if (podAt[s.metOn]) { podAt[s.metOn].ids.push(s.id); podAt[s.metOn].n++; return; } const r = { ids: [s.id], n: 1, s, type }; podAt[s.metOn] = r; grouped.push(r); return; }
      grouped.push({ ids: [s.id], n: 1, s, type }); });
    const st = S.sType || 'All';
    const sess = grouped.map(({ ids, n, s, type }) => { const k = byId[s.subjectId];
      return { id: ids.join(','), ids, date: mp15Fmt(s.metOn, { weekday: 'short', day: 'numeric', month: 'short' }), week: 'Week of ' + mp15Fmt(mp15Monday(s.metOn)), type, kid: type === 'Pod session' ? '' : s.subjectId,
        who: type === 'Pod session' ? 'Pod · ' + n + (n === 1 ? ' mentee' : ' mentees') : type === 'Family' || type === 'Phone or message' ? ((k && k.guardian) || 'Family') + ' · ' + (s.fullName || '') : (s.fullName || 'A mentee'),
        mins: Number(s.minutes) || 0, what: s.discussed || '', next: s.agreed || '—', goal: s.goalTitle || '' }; });
    const sf = sess.filter(s => st === 'All' || s.type === st || (st === 'Family' && s.type === 'Phone or message'));
    const weeks = []; sf.forEach(s => { let w = weeks.find(x => x.l === s.week); if (!w) weeks.push(w = { l: s.week, rows: [] }); w.rows.push(s); });
    const lf = S.lf || this.lfBlank();
    const upLf = p => set({ lf: { ...lf, ...p } });
    const lfKidObj = all.find(k => k.id === lf.kid);
    const lfGoals = lfKidObj ? this.goalsOfKid(lfKidObj.id).filter(x => x.status === 'active' || x.status === 'draft') : [];
    const lfOk = (lf.type === 'Pod session' || !!lfKidObj) && lf.what.trim().length > 3 && !(c.isPeer && lf.type === 'Family');
    const stats = (S.d.sess || {}).stats || {};
    const kSess = ((kd && kd.sessions) || []).map(s => { const type = MP15_KIND_TYPE[s.kind] || 'Note'; return { id: String(s.id), date: mp15Fmt(s.metOn, { weekday: 'short', day: 'numeric', month: 'short' }), type, icon: MP15_TYPE_ICON[type], who: type === 'Pod session' ? 'Pod session' : type === 'Family' || type === 'Phone or message' ? ck.guardian : ck.name, mins: Number(s.minutes) || 0, what: s.discussed || '', next: s.agreed || '—', hasGoal: !!s.goalId, goal: '' }; });
    const sv = (msg) => (r) => { this.refresh(['goals', 'case', 'week'], ck.id); return r; };

    return {
      gStats: [['active', 'Active', '#2b2b30', rows.filter(x => x.status === 'active').length, 'One per mentee'], ['stalled', 'Stalled', '#7a5600', rows.filter(x => x.stalled).length, 'Needs a check-in'], ['none', 'No goal yet', '#7a5600', noneK.length, 'Set one after week 3'],
               ['achieved', 'Achieved', '#1d6b30', rows.filter(x => x.status === 'achieved').length, 'All time'], ['other', 'Draft or paused', '#6b6b72', rows.filter(x => x.status === 'draft' || x.status === 'paused').length, 'Not live yet']].map(([id, l, fg, n, rule]) => ({ l, fg, n, rule, on: gf === id, ...c.pill(gf === id), go: () => set({ gf: id }) })),
      areaNames: ['All areas'].concat(MP15_AREAS), areaPick: MP15_AREAS, gArea: ga, onGArea: e => set({ gArea: e.target.value }),
      gCols: c.wideCols ? 'minmax(180px, 1.2fr) minmax(180px, 1.6fr) 140px 110px 90px 100px' : 'minmax(0, 1fr) minmax(0, 1.2fr) auto',
      gCount: list.length + (gf === 'none' ? (list.length === 1 ? ' mentee' : ' mentees') : (list.length === 1 ? ' goal' : ' goals')),
      gRows: list.map(([k, x]) => { if (!x) return { ini: k.ini, name: k.name, area: (k.phase || 'Grow') + ' phase', title: 'No goal yet', tFg: '#6b6b72', segs: [], pT: '', last: '—', lFg: '#6b6b72', due: '—', status: 'Set a goal', sBg: '#0b0b0c', sFg: '#fff', go: () => this.go('kid', { kid: k.id, ktab: 'goals' }) };
        const s = stat(x); const ld = lastDays(x); return { ini: k.ini, name: k.name, area: x.area, title: x.title || 'Untitled goal', tFg: '#0b0b0c', segs: segsP(x.progress, x), pT: x.progress ? x.progress + ' of 5' : 'Not checked', last: x.status === 'achieved' ? 'Done' : mp15Ago(ld), lFg: (ld === null || ld > 21) && x.status === 'active' ? '#7a5600' : '#4a4a50', due: fmtDue(x.reviewBy), status: s[0], sBg: s[1], sFg: s[2],
          go: () => this.go('kid', { kid: x.subjectId, ktab: 'goals', gsel: { ...(S.gsel || {}), [x.subjectId]: x.id } }) }; }),
      gEmpty: list.length === 0 && !!S.d.goals, gEmptyT: gf === 'stalled' ? 'No goals have stalled. Every active goal has moved recently.' : gf === 'none' ? 'Every mentee has an active goal.' : 'No goals here yet.',
      kgCols: c.wideCols ? '300px minmax(0, 1fr)' : 'minmax(0, 1fr)',
      kGoalList: G.map(x0 => { const x = this.goalDraft(x0); const s = stat(x); const cc = x.checks || []; const p = cc.length ? cc[cc.length - 1].progress : 0; return { title: x.goal || 'Untitled goal', area: x.area, segs: segsP(p, x), status: s[0], sBg: s[1], sFg: s[2], cur: g && x.id === g.id ? 'true' : undefined, bg: g && x.id === g.id ? '#fafaf8' : '#fff', go: () => set({ gsel: { ...(S.gsel || {}), [ck.id]: x.id } }) }; }),
      newGoal: () => { if (locked) return this.say('The first weeks are for getting to know each other. Goals open in week 3.');
        this.act('goal', { subjectId: ck.id, id: 0, goal: '', dueOn: '' }).then(r => { if (r && r.id) { set({ gsel: { ...(S.gsel || {}), [ck.id]: r.id } }); this.refresh(['goals'], ck.id); } }); },
      hasGoal: !!g, noGoal: !g,
      gd: g ? {
        area: g.area, onArea: e => this.editGoal(ck.id, g0, { area: e.target.value }), due: g.reviewBy || g.dueOn || '', onDue: e => this.editGoal(ck.id, g0, { reviewBy: e.target.value }),
        statusOpts: ['Draft', 'Active', 'Achieved', 'Paused'].map(l => { const cur = g.status === l.toLowerCase(); return { l, on: cur, ...c.seg(cur), go: () => {
          if (cur) return; if (l === 'Active' && !g.agreed) return this.say('Agree it with ' + ck.first + ' first, then make it active.'); if (l === 'Active' && !(g.goal || '').trim()) return this.say('Write the wish first.');
          if (l === 'Draft' && g.status !== 'draft') return this.say('A goal that has been live goes to Paused, not back to Draft.');
          clearTimeout((this.timers || {})['g' + g.id]);
          this.saveGoal(ck.id, g.id).then(ok => ok && this.act('goalStatus', { subjectId: ck.id, id: g.id, status: l.toLowerCase() }, r => r.paused ? 'One active goal at a time. “' + r.paused.goal + '” is now paused.' : l === 'Achieved' ? 'Marked achieved. ' + ck.first + ' sees it in their growth passport.' : l === 'Active' ? 'Goal is live. You’ll be reminded to check in every 2 weeks' + (g.reviewBy ? ' and before the review date.' : '.') : 'Goal paused.')).then(r => r && sv()(r)); } }; }),
        woop: [['goal', 'Wish', 'What do they want, in their words?', 'e.g. Get confident speaking in class'], ['outcome', 'Best outcome', 'What would it look like if it worked?', 'e.g. Present at the showcase without notes'], ['obstacle', 'Obstacle inside them', 'What in them gets in the way?', 'e.g. My voice shakes when people look'], ['plan', 'Plan: if… then I will…', 'One if–then plan for that obstacle', 'If my voice shakes, then I will pause and breathe once']].map(([k, l, hh, ph]) => ({ l, h: hh, ph, v: g[k] || '', on: e => this.editGoal(ck.id, g0, { [k]: e.target.value }) })),
        agreedA: g.agreed ? 'true' : 'false', track: g.agreed ? '#0b0b0c' : '#d6d4cc', knob: g.agreed ? '24px' : '4px', toggleAgreed: () => { if (g.status === 'active' && g.agreed) return this.say('A live goal stays agreed. Pause it first.'); this.editGoal(ck.id, g0, { agreed: !g.agreed }); },
        hasChecks: checks.length > 0, ciMeta: checks.length ? checks.length + ' so far · last ' + mp15Ago(gLast).toLowerCase() : 'None yet',
        checks: checks.map((x, i) => ({ h: (x.progress / 5 * 100) + '%', c: i === checks.length - 1 ? '#0b0b0c' : '#d6d4cc' })),
        checksRev: checks.slice().reverse().map(x => ({ d: mp15Fmt(x.at, { day: 'numeric', month: 'short' }), p: x.progress, n: x.note || '—' })),
        ciOpts: [1, 2, 3, 4, 5].map(n => ({ l: String(n), on: ci.p === n, ...c.pill(ci.p === n), go: () => set({ ci: { ...(S.ci || {}), [g.id]: { ...ci, p: n } } }) })),
        ciNote: ci.n || '', onCiNote: e => set({ ci: { ...(S.ci || {}), [g.id]: { ...ci, n: e.target.value } } }),
        ciCantA: ci.p ? 'false' : 'true', ciBg: ci.p ? '#0b0b0c' : '#efefed', ciFg: ci.p ? '#fff' : '#6b6b72',
        addCi: () => { if (!ci.p) return this.say('Choose how close, 1 to 5');
          this.act('goalCheckin', { subjectId: ck.id, goalId: g.id, progress: ci.p, note: (ci.n || '').trim() }, r => r.achieved ? 'Check-in added. Goal achieved.' : 'Check-in added').then(r => { if (r) { set({ ci: { ...(S.ci || {}), [g.id]: {} } }); sv()(r); } }); },
      } : {},
      sStats: [['Seen in the last 2 weeks', (stats.seenPct || 0) + '%', (stats.seen || 0) + ' of ' + (stats.of || 0) + ' mentees', (stats.seenPct || 0) < 80 ? '#7a5600' : '#1d6b30'], ['One-to-ones', stats.oneToOnes || 0, 'All you’ve logged', '#0b0b0c'], ['Pod sessions', stats.pod || 0, 'Saturdays logged', '#0b0b0c'], ['Family contacts', stats.family || 0, 'Calls, meetings and messages', '#0b0b0c']].map(([l, v, n, fg]) => ({ l, v, n, fg })),
      sTypes: ['All', 'One-to-one', 'Pod session', 'Family'].map(l => ({ l, on: st === l, ...c.chip(st === l), go: () => set({ sType: l }) })),
      sCols: c.wideCols ? '150px minmax(0, 1.6fr) minmax(0, 1fr) 40px' : '110px minmax(0, 1fr) 40px',
      sWeeks: weeks.map(w => ({ l: w.l, meta: w.rows.length + (w.rows.length === 1 ? ' session · ' : ' sessions · ') + w.rows.reduce((n, r) => n + Number(r.mins), 0) + ' min', rows: w.rows.map(r => ({ ...r, icon: MP15_TYPE_ICON[r.type] || 'ph ph-user', hasGoal: !!r.goal,
        del: () => { const hide = {}; r.ids.forEach(id => { hide[id] = true; }); set({ hidden: { ...this.state.hidden, ...hide } });
          const tm = setTimeout(() => { Promise.all(r.ids.map(id => mp15Api.act('sessionDelete', { id }).catch(e => e))).then(res => { const bad = res.filter(x => x && x.code); if (bad.length) { this.say(mp15ErrText(bad[0])); const un = { ...this.state.hidden }; r.ids.forEach(id => { delete un[id]; }); set({ hidden: un }); } this.refresh(['sess', 'case', 'week']); }); }, 6500);
          this.say('Session deleted', () => { clearTimeout(tm); const un = { ...this.state.hidden }; r.ids.forEach(id => { delete un[id]; }); set({ hidden: un }); }); } })) })),
      sEmpty: sf.length === 0 && !!S.d.sess,
      logOpen: !!S.logOpen, logClosed: !S.logOpen, openLog: () => set({ logOpen: true }), closeLog: () => set({ logOpen: false, lf: null }),
      logForKid: () => this.go('sess', { logOpen: true, lf: { ...this.lfBlank(), kid: ck.id, type: 'One-to-one', goalId: ck.ag ? ck.ag.id : '' } }),
      lf, lfTypes: [['One-to-one', 'ph ph-user'], ['Pod session', 'ph ph-users-three']].concat(c.isPeer ? [] : [['Family', 'ph ph-house-line']]).concat([['Phone or message', 'ph ph-phone']]).map(([l, icon]) => ({ l, icon, on: lf.type === l, ...c.pill(lf.type === l), go: () => upLf({ type: l, mins: l === 'Pod session' ? '90' : lf.mins === '90' ? '15' : lf.mins }) })),
      lfNeedsKid: lf.type !== 'Pod session', lfPod: lf.type === 'Pod session', lfPodText: 'Everyone marked here on ' + mp15Fmt(this.satLastDate(), { weekday: 'long', day: 'numeric', month: 'short' }),
      lfKid: e => upLf({ kid: e.target.value, goalId: '' }), lfDate: e => upLf({ date: e.target.value }), lfMins: e => upLf({ mins: e.target.value }), lfGoal: e => upLf({ goalId: e.target.value, p: 0 }),
      minsOpts: ['10', '15', '20', '30', '45', '60', '90'].map(v => ({ v, l: v + ' minutes' })),
      lfHasGoals: lf.type !== 'Pod session' && lfGoals.length > 0, lfGoals: lfGoals.map(x => ({ id: x.id, title: x.title || 'Untitled goal' })),
      lfShowP: !!lf.goalId && lf.type !== 'Pod session', lfP: [1, 2, 3, 4, 5].map(n => ({ l: String(n), on: lf.p === n, ...c.pill(lf.p === n), go: () => upLf({ p: n }) })),
      lfWhat: e => upLf({ what: e.target.value }), lfNext: e => upLf({ next: e.target.value }),
      lfCantA: lfOk ? 'false' : 'true', lfBg: lfOk ? '#0b0b0c' : '#efefed', lfFg: lfOk ? '#fff' : '#6b6b72',
      saveLog: () => { if (!lfOk) return this.say(lf.type !== 'Pod session' && !lfKidObj ? 'Choose a mentee first.' : 'Write what happened first.');
        const body = { type: lf.type, date: lf.date, minutes: Number(lf.mins) || 0, what: lf.what.trim(), next: lf.next.trim() };
        if (lf.type !== 'Pod session') body.subjectId = lf.kid;
        if (lf.goalId && lf.type !== 'Pod session') { body.goalId = Number(lf.goalId); if (lf.p) body.progress = lf.p; }
        this.act('session', body, r => 'Session saved' + (lf.type === 'One-to-one' && lfKidObj && B_contact(lfKidObj) ? '. ' + lfKidObj.first + ' is no longer overdue.' : r.count > 1 ? ' for ' + r.count + ' mentees' : '')).then(r => { if (r) { set({ logOpen: false, lf: null }); this.refresh(['sess', 'case', 'week', 'goals', 'role'], lfKidObj && lfKidObj.id); } }); },
      kSessList: kSess, kSessEmpty: kSess.length === 0 && !!kd, kSessMeta: (kSess.length ? kSess.length + ' logged · last one-to-one ' : 'Last one-to-one ') + mp15Ago(ck.contact).toLowerCase(),
    };
    function B_contact(k) { return !!(k.flags && k.flags.contact); }
  }

  picker(key, selId, onPick, all) {
    const S = this.state; const P = (S.pk || {})[key] || {}; const selK = all.find(k => k.id === selId);
    const q = P.q !== undefined ? P.q : (selK ? selK.name : ''); const qq = (P.q || '').trim().toLowerCase();
    const list = all.filter(k => !qq || (k.name + ' ' + k.school).toLowerCase().includes(qq)).slice(0, 8);
    const setP = p => this.setState(st => ({ pk: { ...(st.pk || {}), [key]: { ...((st.pk || {})[key] || {}), ...p } } }));
    const pick = k => { onPick(k.id); setP({ q: undefined, open: false }); };
    return { q, open: !!P.open, openA: P.open ? 'true' : 'false', line: P.open ? '#0b0b0c' : '#d6d4cc', hasVal: !!q,
      opts: list.map((k, i) => ({ ini: k.ini, name: k.name, sub: [k.age !== null && k.age !== undefined ? 'Age ' + k.age : '', k.school].filter(Boolean).join(' · '), on: i === (P.hi || 0) ? 'true' : 'false', bg: i === (P.hi || 0) ? '#f4f4f2' : '#fff', pick: e => { e.preventDefault(); pick(k); } })),
      none: !!P.open && list.length === 0,
      onQ: e => { setP({ q: e.target.value, open: true, hi: 0 }); if (selK) onPick(''); }, onFocus: () => setP({ open: true }), onBlur: () => setTimeout(() => setP({ open: false, q: undefined }), 120),
      onKey: e => { if (e.key === 'ArrowDown') { e.preventDefault(); setP({ open: true, hi: Math.min(list.length - 1, (P.hi || 0) + 1) }); } else if (e.key === 'ArrowUp') { e.preventDefault(); setP({ hi: Math.max(0, (P.hi || 0) - 1) }); } else if (e.key === 'Enter' && P.open && list[P.hi || 0]) { e.preventDefault(); pick(list[P.hi || 0]); } else if (e.key === 'Escape') setP({ open: false }); },
      clear: e => { e.preventDefault(); onPick(''); setP({ q: '', open: true }); } };
  }

  xVals(c) {
    const S = this.state, set = c.set, all = c.all, ck = c.ck, kd = c.kd, today = c.today;
    const btn = p => ({ line: p ? '#0b0b0c' : '#d6d4cc', bg: p ? '#0b0b0c' : '#fff', fg: p ? '#fff' : '#0b0b0c' });
    const scMonth = mp15Month(((kd && kd.scorecard) || {}).month || today.slice(0, 7));
    const kActs = [['Log a session', 'ph ph-plus', () => this.go('sess', { logOpen: true, lf: { ...this.lfBlank(), kid: ck.id, goalId: ck.ag ? ck.ag.id : '' } }), true], ['Score ' + scMonth, 'ph ph-chart-bar', () => set({ ktab: 'score' })],
      c.isPeer ? ['Note for ' + c.lead, 'ph ph-note-pencil', () => this.go('sess', { logOpen: true, lf: { ...this.lfBlank(), kid: ck.id } })] : ['Family update', 'ph ph-house-line', () => set({ ktab: 'family' })],
      ['Report a concern', 'ph ph-shield-warning', () => this.go('concern', { cKid: ck.id })]].map(([l, icon, go, p]) => ({ l, icon, go, ...btn(p) }));
    const famHist = ((kd && kd.family) || []).map(s => ({ date: mp15Fmt(s.metOn, { day: 'numeric', month: 'short' }), kind: s.kind === 'update' ? 'Family update' + (s.status === 'queued' ? ' · goes at 8am' : s.status === 'failed' ? ' · not delivered' : ' sent') : s.kind === 'phone' ? 'Phone or message' : 'Family conversation', what: s.discussed || '' }));
    const wideMsg = S.w >= 1000;
    const ix = S.d.index || {};
    const bm = ix.byMentee || []; const bmShow = S.bmAll ? bm : bm.slice(0, 8);
    const A = S.d.academy || {}; const acMods = c.acMods; const mod = acMods.find(m => m.id === S.mod);
    let md = {};
    if (mod) {
      const steps = (mod.lessons || []).map(l => ({ k: 'lesson', h: l.h, b: l.body }));
      if (mod.scenario) steps.push({ k: 'scen', h: mod.scenario.situation, opts: mod.scenario.options.map(o => o.text), right: mod.scenario.options.map(o => !!o.right), why: mod.scenario.options.map(o => o.why) });
      (mod.quiz || []).forEach(q => steps.push({ k: 'quiz', h: q.q, opts: q.options }));
      steps.push({ k: 'result' });
      const i = Math.min(S.mStep || 0, steps.length - 1), st = steps[i], ans = (S.mAns || {})[i];
      const qIdx = steps.map((s, j) => s.k === 'quiz' ? j : -1).filter(j => j >= 0);
      const choice = st.k === 'scen' || st.k === 'quiz', answered = ans !== undefined;
      const res = S.mRes; const pass = !!(res && res.passed); const score = res ? res.score : null;
      const toStep = n => {
        if (steps[n] && steps[n].k === 'result') {
          set({ mRes: { pending: true } });
          const answers = qIdx.map(j => (S.mAns || {})[j]);
          mp15Api.act('academyResult', { moduleId: mod.id, answers }).then(r => { set({ mRes: r }); if (r.passed) this.refresh(['academy', 'week']); }).catch(e => { set({ mRes: { error: mp15ErrText(e) } }); });
        }
        const m = this.rootRef.current && this.rootRef.current.querySelector('main'); if (m) m.scrollTop = 0; set({ mStep: n });
      };
      const pending = !!(res && res.pending), err = res && res.error;
      md = {
        stepL: st.k === 'result' ? 'Finished' : 'Step ' + (i + 1) + ' of ' + (steps.length - 1), mins: mod.mins + ' min' + (mod.note ? ' · ' + mod.note : ''), pct: (i / Math.max(1, steps.length - 1) * 100) + '%',
        kindL: st.k === 'lesson' ? 'Lesson ' + (i + 1) + ' of ' + (mod.lessons || []).length : st.k === 'scen' ? 'What would you do?' : st.k === 'quiz' ? 'Question ' + (qIdx.indexOf(i) + 1) + ' of ' + qIdx.length : 'Result',
        isLesson: st.k === 'lesson', isChoice: choice, isResult: st.k === 'result', h: st.h, body: st.b, locked: st.k === 'scen' && answered,
        /* The scenario teaches, so it shows its answer. The quiz is part of what
           clears a mentor to work with children: its key stays on the server,
           and the score comes back when the module is finished. */
        opts: choice ? st.opts.map((l, j) => { const p = ans === j; const scen = st.k === 'scen'; const r = scen && st.right[j]; const showOk = scen && answered && r, showBad = scen && answered && p && !r;
          return { l, on: p ? 'true' : 'false', bw: showOk || showBad || p ? '2px' : '1px', ring: showOk ? '#1d6b30' : showBad ? '#b0361c' : p ? '#0b0b0c' : '#d6d4cc', bg: showOk ? '#f3faf4' : showBad ? '#fdeeea' : '#fff',
                   icon: showOk ? 'ph-fill ph-check-circle' : showBad ? 'ph-fill ph-x-circle' : p ? 'ph-fill ph-radio-button' : 'ph ph-circle', ic: showOk ? '#1d6b30' : showBad ? '#b0361c' : p ? '#0b0b0c' : '#9a9aa0',
                   go: () => { if (scen && answered) return; set({ mAns: { ...(S.mAns || {}), [i]: j } }); } }; }) : [],
        fb: choice && answered, fbBg: st.k === 'scen' ? (st.right[ans] ? '#f3faf4' : '#fdf6e3') : '#f4f4f2', fbFg: st.k === 'scen' ? (st.right[ans] ? '#14501f' : '#5c4100') : '#2b2b30',
        fbH: st.k === 'scen' ? (st.right[ans] ? 'Right.' : 'Not quite.') : 'Answer recorded.', fbT: answered ? (st.k === 'scen' ? st.why[ans] : 'You can change it before you go on. Your score is worked out when you finish.') : '',
        rIcon: pending ? 'ph ph-hourglass' : pass ? 'ph-fill ph-seal-check' : 'ph ph-arrow-counter-clockwise', rFg: pass ? '#1d6b30' : '#7a5600',
        rH: pending ? 'Checking your answers…' : err ? 'Not saved' : pass ? 'Passed · ' + score + '%' : score + '% · the pass mark is ' + (A.pass || 80) + '%',
        rT: pending ? '' : err ? err : pass ? 'Saved to your record. Your coordinator can see it' + (mod.renewDays ? ', and you’ll be reminded before it needs renewing.' : '.') : 'Read the lessons again, then retake the questions. Nothing is recorded until you pass.',
        canPrev: i > 0 && st.k !== 'result', prev: () => toStep(i - 1),
        nextL: st.k === 'result' ? (pass ? 'Back to Academy' : 'Try again') : steps[i + 1].k === 'result' ? 'See result' : 'Continue',
        nextOffA: (choice && !answered) || pending ? 'true' : 'false', nextBg: (choice && !answered) || pending ? '#efefed' : '#0b0b0c', nextFg: (choice && !answered) || pending ? '#6b6b72' : '#fff',
        next: () => { if (pending) return; if (st.k === 'result') { if (pass) this.go('academy'); else set({ mStep: 0, mAns: {}, mRes: null }); return; } if (choice && !answered) return this.say('Choose an answer first'); toStep(i + 1); },
      };
    }
    const CATS = MP15_CONCERN_KINDS;
    const cOk = !!S.cKid && !!S.cCat && S.cText.trim().length > 10;
    const cHint = !S.cKid ? 'Choose the child first.' : !S.cCat ? 'Choose what kind of concern.' : S.cText.trim().length <= 10 ? 'Write what happened, in a sentence or two.' : '';
    const mtAll = (c.isLead ? ((S.d.team || {}).mentors || []) : []).map(m => { const pct = m.seenPct; const tone = m.commitments === 'On track' ? 'ok' : m.commitments === 'Below 5 mentees' ? 'bad' : 'warn'; const booked = m.booked || !!(S.supBooked || {})[m.mentorId];
      return { name: m.name, kind: m.kind + (m.evalOf ? ' · ' + (m.evalDone || 0) + ' of ' + m.evalOf + ' evaluated Saturday' : ''), n: m.mentees, pctN: pct === null ? 101 : pct, pct: pct === null ? '—' : pct + '%', pBg: pct === null ? '#d6d4cc' : pct < 60 ? '#b0361c' : pct < 80 ? '#e0a100' : '#1d6b30', rel: m.relAvg === null ? '—' : Number(m.relAvg).toFixed(1),
        commit: m.commitments, cBg: MP15_TONE[tone][0], cFg: MP15_TONE[tone][1], need: !!m.needSupport, supL: booked ? 'Booked' : 'Book supervision', supOp: booked ? 0.55 : 1,
        sup: () => { if (booked) return; this.act('supervisionBook', { mentorId: m.mentorId }, r => 'Supervision booked with ' + m.first + ' for ' + mp15Fmt(r.date, { weekday: 'long', day: 'numeric', month: 'long' }) + ' after STS').then(r => { if (r) { set({ supBooked: { ...(S.supBooked || {}), [m.mentorId]: true } }); this.refresh(['team']); } }); } }; });
    const mq = (S.mtQ || '').trim().toLowerCase(), mf = S.mtF || 'all';
    const mt = mtAll.filter(m => (mf === 'all' || m.need) && (!mq || m.name.toLowerCase().includes(mq))).sort((a, b) => mf === 'need' ? a.pctN - b.pctN : 0);
    const withPct = mtAll.filter(m => m.pctN <= 100);
    const needN = mtAll.filter(m => m.need).length, avgSeen = withPct.length ? Math.round(withPct.reduce((n, m) => n + m.pctN, 0) / withPct.length) : 0;
    const liRows = (ix.skills || []).filter(r => r.avg !== null && r.avg !== undefined).map(r => { const dd = r.change; return { l: r.skill, v: Number(r.avg).toFixed(1), w: (r.avg * 10) + '%', c: r.avg < 5 ? '#e0a100' : '#0b0b0c', d: dd ? (dd > 0 ? '+' : '') + Number(dd).toFixed(1) : '–', dFg: dd > 0 ? '#1d6b30' : dd < 0 ? '#b0361c' : '#9a9aa0' }; });
    return {
      kActs, famHist, famNone: famHist.length === 0 && !!kd,
      sendParent: () => { const txt = (c.pBody || '').trim(); if (!txt) return this.say('Write a message first'); if (/\[what you saw\]/.test(txt)) return this.say('Say what you saw first: replace the words in brackets.');
        this.act('familySend', { subjectId: ck.id, body: txt, draftId: c.draft && txt === c.draft.body ? c.draft.id : 0 }, r => r.queued ? 'Saved. It goes to ' + r.guardian + ' at 8am, and is logged in Sessions.' : 'Sent to ' + r.guardian + '. Logged in Sessions.')
          .then(r => { if (r) { set({ pBody: null }); this.refresh(['sess', 'case', 'week', 'role'], ck.id); } }); },
      pkGoal: this.picker('goal', '', id => { if (!id) return; const k = all.find(x => x.id === id); if (!k) return;
        this.act('goal', { subjectId: k.id, id: 0, goal: '', dueOn: '' }).then(r => { if (!r || !r.id) return; this.go('kid', { kid: k.id, ktab: 'goals', gsel: { ...(this.state.gsel || {}), [k.id]: r.id } }); this.refresh(['goals'], k.id); this.say('Draft goal started for ' + k.first); }); }, all),
      showInbox: wideMsg || !S.mOpen, showDetail: !!c.mSel && (wideMsg || !!S.mOpen), mBackShow: !wideMsg, mBack: () => set({ mOpen: false }), mEmpty: c.mList.length === 0 && !!S.d.msgs,
      msgs: c.mList.map(m => ({ ...m, who: m.from, when: mp15When(m.at, today), t: m.body, unread: !m.read && !S.read[m.id] && m.kind !== 'From your lead', cur: c.mSel && m.id === c.mSel.id ? 'true' : undefined, bg: wideMsg && c.mSel && m.id === c.mSel.id ? '#fafaf8' : '#fff',
        go: () => { set({ msel: m.id, mOpen: true, read: { ...S.read, [m.id]: true }, reply: '' }); if (!m.read) mp15Api.act('messageRead', { threadId: m.id.indexOf('m:') === 0 ? m.id : m.threadId }).catch(() => {}); } })),
      bmCols: c.wideCols ? 'minmax(0, 1.4fr) minmax(0, 1fr) 96px 56px' : 'minmax(0, 1fr) 96px 48px',
      bmRows: bmShow.map(r => { const un = r.total === null || r.total === undefined; const d = un || r.prevTotal === null || r.prevTotal === undefined ? null : r.total - r.prevTotal; return { ini: r.initials, name: r.name, lowT: un ? 'Not scored for ' + mp15Month(ix.month || today.slice(0, 7)) + ' yet' : 'Lowest: ' + r.lowSkill, tot: un ? '—' : r.total, d: d ? (d > 0 ? '+' : '') + d : '–', dFg: d > 0 ? '#1d6b30' : d < 0 ? '#b0361c' : '#9a9aa0', go: () => this.go('kid', { kid: r.subjectId, ktab: 'score' }) }; }),
      bmMore: bm.length > 8 && !S.bmAll, bmMoreL: 'Show all ' + bm.length, bmShowAll: () => set({ bmAll: true }),
      liMeta: (ix.scored ? 'out of 10 · ' + ix.scored + ' of ' + ix.of + ' scored for ' + mp15Month(ix.month) + ((ix.skills || []).some(x => x.change !== null && x.change !== undefined) ? ' · change since ' + mp15Month(ix.prevMonth) : ' · no earlier month to compare') : 'Nobody scored for ' + mp15Month(ix.month || today.slice(0, 7)) + ' yet'), liRows,
      md,
      acText: acMods.filter(c.modDone).length + ' of ' + acMods.length + ' modules complete',
      acGroups: (A.groups || []).map((h, gi) => ({ h, mods: acMods.filter(m => m.group === gi).map(m => { const done = c.modDone(m); const lapsed = !!m.passedAt && !done;
        return { t: m.title, s: done ? 'Passed ' + m.score + '% · ' + mp15Fmt(m.passedAt, { day: 'numeric', month: 'short' }) + (m.renewBy ? ' · renew by ' + mp15Fmt(m.renewBy, { day: 'numeric', month: 'short', year: 'numeric' }) : '') : (lapsed ? 'Needs renewing · ' : '') + m.mins + ' min' + (m.required ? ' · required' : '') + (m.note ? ' · ' + m.note : ''),
          icon: done ? 'ph-fill ph-check-circle' : 'ph ph-circle', ic: done ? '#1d6b30' : '#9a9aa0', cta: done ? 'Review' : lapsed ? 'Renew' : 'Start', bd: done ? '1px solid #d6d4cc' : '0', bg: done ? '#fff' : '#0b0b0c', fg: done ? '#0b0b0c' : '#fff', go: () => this.go('module', { mod: m.id, mStep: 0, mAns: {} }) }; }) })),
      cForm: !S.cSent, cSent: !!S.cSent, cRef: S.cSent ? S.cSent.ref : '', cSentWhen: S.cSent ? 'Today, ' + new Date(S.cSent.at || Date.now()).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }) : '',
      cNext: [c.officerFirst + ' reads it today and calls you if they need more detail.', 'They decide the next step with the centre lead. You won’t need to investigate.', 'Carry on as normal with the child. Don’t promise them it stays secret.'].map((t, i) => ({ i: i + 1, t })),
      cDone: () => { set({ cSent: null }); this.go('week'); }, cAnother: () => set({ cSent: null }),
      cCats: CATS.map(l => ({ l, on: S.cCat === l ? 'true' : 'false', ...c.pill(S.cCat === l), go: () => set({ cCat: l }) })),
      cCantA: cOk ? 'false' : 'true', cBg: cOk ? '#b0361c' : '#c9a49c', cHint, cHasHint: !!S.cTried && !!cHint,
      sendConcern: () => { if (!cOk) return set({ cTried: true });
        if (this.cBusy) return; this.cBusy = true;
        this.act('concern', { subjectId: S.cKid, category: S.cCat, body: S.cText.trim() }).then(r => { this.cBusy = false; if (r) set({ cKid: '', cText: '', cCat: '', cTried: false, cSent: { ref: r.ref, at: r.at } }); }); },
      mtStats: [['Mentors', mtAll.length, c.roleId === 'lead' ? 'In your team' : 'At this centre', '#0b0b0c'], ['Seen in 2 weeks', withPct.length ? avgSeen + '%' : '—', 'Average across mentors · standard 80%', avgSeen < 80 ? '#7a5600' : '#1d6b30'], ['Need support', needN, 'Below standard or a commitment due', needN ? '#7a5600' : '#1d6b30']].map(([l, v, n, fg]) => ({ l, v, n, fg })),
      mtQ: S.mtQ || '', onMtQ: e => set({ mtQ: e.target.value }),
      mtFilters: [['all', 'All', mtAll.length], ['need', 'Need support', needN]].map(([id, l, n]) => ({ l, n, on: mf === id, ...c.chip(mf === id), go: () => set({ mtF: id }) })),
      mentors: mt, mtEmpty: c.isLead && mt.length === 0 && !!S.d.team,
    };
  }

  scVals(c) {
    const S = this.state, ck = c.ck, kd = c.kd, set = c.set;
    const sc = (kd && kd.scorecard) || {}; const skills = (kd && kd.skills) || [];
    const zero = skills.map(() => 0);
    const prev = sc.prev || zero; const cur = (S.sc || {})[ck.id] || sc.cur || sc.prev || zero;
    const tot = cur.reduce((a, b) => a + b, 0), ptot = prev.reduce((a, b) => a + b, 0), d = tot - ptot;
    const locked = !!sc.locked; const month = mp15Month(sc.month);
    const setV = (i, v) => { if (locked) return this.say(month + '’s scores are locked.'); const n = cur.slice(); n[i] = Math.max(0, Math.min(10, v)); set({ sc: { ...(S.sc || {}), [ck.id]: n } }); };
    const dirty = !!(S.sc || {})[ck.id] && (S.sc[ck.id].join(',') !== (sc.cur || []).join(','));
    return {
      scLast: sc.prevMonth ? mp15Month(sc.prevMonth) : 'never', scTotal: tot, scDelta: sc.prev ? (d > 0 ? '+' : '') + d + ' since ' + mp15Month(sc.prevMonth) : 'First scorecard', scDFg: d > 0 && sc.prev ? '#1d6b30' : d < 0 ? '#b0361c' : '#6b6b72',
      scCols: c.wideCols ? 'minmax(180px, 1fr) minmax(160px, 1fr) auto 56px' : 'minmax(0, 1fr) auto 48px',
      scRows: skills.map(([l, hh], i) => { const v = cur[i], p = prev[i], dd = v - p; return { l, h: hh, v, d: sc.prev && dd ? (dd > 0 ? '+' : '') + dd : '–', dFg: dd > 0 ? '#1d6b30' : dd < 0 ? '#b0361c' : '#9a9aa0', segs: Array.from({ length: 10 }, (_, j) => ({ c: j < v ? '#0b0b0c' : j < p ? '#d6d4cc' : '#f0efea' })), up: () => setV(i, v + 1), dn: () => setV(i, v - 1) }; }),
      scSaveL: locked ? 'Locked' : !sc.savedAt && !dirty ? 'Save ' + month + ' scores' : dirty ? (sc.savedAt ? 'Save changes' : 'Save ' + month + ' scores') : 'Saved', scSaveOp: locked || (sc.savedAt && !dirty) ? 0.55 : 1,
      scNote: locked ? 'Locked on ' + mp15Fmt(sc.lockOn) + '. An NGG admin can reopen it.' : !sc.savedAt ? 'Score what you’ve seen across the month, not one Saturday. Grey marks last month.' : dirty ? 'You’ve changed scores since saving.' : 'Saved ' + mp15When(sc.savedAt, this.today()).toLowerCase() + '. You can change it until ' + mp15Fmt(sc.lockOn) + ', then it locks.',
      scSave: () => { if (locked) return this.say(month + '’s scores are locked.'); if (sc.savedAt && !dirty) return;
        this.act('scorecard', { subjectId: ck.id, month: sc.month, scores: cur }, month + ' scores saved for ' + ck.first + '.').then(r => { if (r) { const n = { ...(S.sc || {}) }; delete n[ck.id]; set({ sc: n }); this.refresh(['index', 'week', 'role'], ck.id); } }); },
    };
  }

  render() { return Mp15View(this.renderVals()); }
}

/* /mentor and its three portals — one address per programme, so nobody (an
   admin least of all) is ever shown NGG members and Summer School participants
   in one list:
     /mentor/ngg     the NGG Mentor Portal (v15): pod, peer, lead, coordinator
     /mentor/summer  Summer School: participants only (the server narrows it)
     /mentor/class   the NGG class: instructors' sessions, stars, school results
   /mentor itself sends a person with one portal straight to it and shows a
   chooser to anyone with more. Old links (/mentor?tab=results, from the school
   results email) land on /mentor/class with their tab. */
const MP15_SUBS = ['ngg', 'summer', 'class'];
function mp15Sub() { const p = (location.pathname || '').replace(/^\/+|\/+$/g, '').split('/'); return p[0] === 'mentor' && MP15_SUBS.includes(p[1]) ? p[1] : ''; }
function mp15Portals(r) {
  const me = (r && r.me) || {}; const progs = me.programmes || []; const out = [];
  const v15 = ['pod', 'peer', 'lead', 'coord'].includes(me.role) && me.ngg !== false && progs.includes('ngg');
  if (v15) out.push('ngg');
  if (progs.includes('summer')) out.push('summer');
  if (progs.includes('ngg') && (me.role === 'instructor' || me.gateRole === 'admin' || v15)) out.push('class');
  return { v15, out };
}
function MentorHome() {
  const [sub, setSub] = React.useState(() => {
    const t = (() => { try { return new URLSearchParams(location.search).get('tab') || ''; } catch (_) { return ''; } })();
    if (!mp15Sub() && MP15_CLASSIC_TABS.includes(t)) { try { history.replaceState({ page: 'mentor' }, '', '/mentor/class' + location.search); } catch (_) {} return 'class'; }
    return mp15Sub();
  });
  const [boot, setBoot] = React.useState(null);
  const [state, setState] = React.useState('loading');   // loading | ready | refused
  const auth = (window.useAuth || (() => null))();
  const probe = React.useCallback(() => {
    mp15Api.view('week', {}).then(r => { setBoot(r); setState('ready'); }).catch(() => setState('refused'));
  }, []);
  React.useEffect(() => { probe(); }, [probe]);
  React.useEffect(() => { if (auth && auth.isSignedIn && state === 'refused') probe(); }, [auth && auth.isSignedIn]);
  React.useEffect(() => { const f = () => setSub(mp15Sub()); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);
  const go = to => { try { history.pushState({ page: 'mentor' }, '', '/mentor' + (to ? '/' + to : '')); } catch (_) {} setSub(to); try { window.scrollTo(0, 0); } catch (_) {} };
  const { v15, out } = mp15Portals(boot);
  /* With no sub-route: one portal → straight there; several → choose. */
  React.useEffect(() => {
    if (state !== 'ready' || sub) return;
    /* The class tools are inside the NGG portal (Stars & results), so they are
       not a reason to choose: only covering Summer School as well is. */
    const main = v15 && !out.includes('summer') ? 'ngg' : out.length === 1 ? out[0] : '';
    if (main) { try { history.replaceState({ page: 'mentor' }, '', '/mentor/' + main + location.search); } catch (_) {} setSub(main); }
  }, [state, sub, v15, out.join()]);
  if (state === 'loading' && sub !== 'summer') return <div className="m15x-boot" role="status" aria-live="polite"><img src="/assets/logo.png" alt="" width="40" height="40"/><span className="m15x-bar"/><span className="m15x-sr">Loading the mentor portal</span></div>;
  /* Refused (not signed in, not cleared, no centre, not a mentor): the class
     portal owns those answers and its sign-in doors. */
  const hubBtn = out.includes('summer') && out.length > 1 && <button type="button" className="m15x-back" onClick={() => go('')}><i className="ph ph-squares-four" aria-hidden="true"/>Mentor portals</button>;
  if (sub === 'summer') return <>{hubBtn}<MentorPortal key="summer" programme="summer"/></>;
  /* A v15 mentor's class tools open inside their portal; an instructor or an admin with no pod keeps the stand-alone class page. */
  if (sub === 'class' && v15) return <Mp15Portal key="ngg" boot={boot} initial="classic" onHub={out.includes('summer') ? () => go('') : null}/>;
  if (sub === 'class') return <>{hubBtn}<MentorPortal key="class" programme="ngg"/></>;
  if (state === 'refused') return <MentorPortal key="any"/>;
  if (sub === 'ngg') {
    if (v15) return <Mp15Portal boot={boot} onHub={out.includes('summer') ? () => go('') : null}/>;
    return <div className="m15x-hub"><div className="m15x-hub-in"><h1>The NGG mentor portal isn’t yours</h1>
      <p>It opens for NGG pod, peer and lead mentors and for coordinators.{out.length ? ' These are open to you:' : ' Ask your coordinator if you think that’s wrong.'}</p>
      <Mp15HubCards out={out} go={go}/></div></div>;
  }
  if (!out.length) return <MentorPortal key="any"/>;
  return <div className="m15x-hub"><div className="m15x-hub-in">
    <img src="/assets/logo.png" alt="" width="40" height="40"/>
    <h1>Which portal?</h1>
    <p>NGG and Summer School are separate programmes, so each has its own portal and its own list of children.</p>
    <Mp15HubCards out={out} go={go}/>
  </div></div>;
}
function Mp15HubCards({ out, go }) {
  const C = { ngg: ['ph ph-users-three', 'NGG mentor portal', 'Your NGG mentees, the week, Saturday formation, goals, the Leadership Index, families.', '/mentor/ngg'],
              summer: ['ph ph-sun', 'Summer School', 'This edition’s participants: stars, notes, weekly reviews, concerns.', '/mentor/summer'],
              class: ['ph ph-chalkboard', 'NGG class tools', 'Today’s session, stars, skills, curriculum and school results.', '/mentor/class'] };
  return <ul className="m15x-cards">{out.map(k => <li key={k}><a href={C[k][3]} onClick={e => { e.preventDefault(); go(k); }}>
    <i className={C[k][0]} aria-hidden="true"/><span><b>{C[k][1]}</b><span>{C[k][2]}</span></span><i className="ph ph-caret-right" aria-hidden="true"/></a></li>)}</ul>;
}
