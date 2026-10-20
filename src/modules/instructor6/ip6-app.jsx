/* The Instructor Portal (design: docs/design/portals/instructor-portal-v6.dc.html).
 *
 * Ip6View is the design, compiled (tools/dc-compile.js). This controller builds
 * its values from the teaching API that already exists — /member/teaching.php
 * (today, class, history, student, skills, results), /member/curriculum.php
 * (staff view, marking, materials), /member/community.php (the course channel
 * and its homework) and the concern queue — every one gated on the server to
 * the instructor's own centres and courses. Nothing here invents a figure: a
 * number on screen is one the server returned, or a count of rows it did.
 *
 * Writes that matter on a Saturday with no signal (roll, plan, hinge tally,
 * exit ticket, log, skill marks) go through the outbox (`teaching.act`): they
 * are kept on the device first and sent when the network allows, and the bar
 * at the top says how many are waiting. Each is an upsert on the server, so a
 * replay is safe.
 *
 * The design's AI suggestions are not called: there is no model on this host.
 * Where the design drafts a line, this drafts it from the record itself (who
 * can teach the skill, the model answer, the child's own numbers) and says so.
 */

const IP6_LEVELS = ['Not yet', 'Getting there', 'Can do it', 'Can teach it'];
const IP6_LVBG = ['#fdeeea', '#fdf6e3', '#e9f6ec', '#0b0b0c'], IP6_LVFG = ['#b0361c', '#7a5600', '#1d6b30', '#ffffff'];
const IP6_LVCOL = ['#e8590c', '#e0a100', '#2f9e44', '#0b0b0c'];
const IP6_EXIT = ['got', 'partly', 'not'];
/* The four ways a division teaches (the design's KITS), keyed by division id. */
const IP6_KITS = {
  tech: { kind: 'tech', short: 'TECH', icon: 'ph ph-code', solo: 'ph ph-laptop', evidence: 'A working file or screenshot', kitT: 'Technology: learn by building', kit: 'Evidence is something that runs. Pair learners at the keyboard (one types, one navigates) and debug out loud. Exit tickets are a small build, not a written answer.',
    ph: [['Retrieval review', 8, 'Questions from earlier weeks, answered from memory. Spaced practice makes learning stick.', 'e.g. Answers on mini-whiteboards'], ['New material in small steps', 15, 'Model one worked example. Stop after each step and check before the next.', 'e.g. Build it live, one step at a time'], ['Hinge question', 4, 'One question everyone answers at once. Move on only if most get it.', 'e.g. Fingers up for A, B, C or D'], ['Guided practice', 18, 'Pairs from the skills board. Circulate and ask questions; don’t take the keyboard.', 'e.g. Helpers point, learners type'], ['Independent practice', 25, 'Everyone builds alone. A stretch task for anyone at “Can teach it”.', 'e.g. Stretch: add a second section'], ['Exit ticket', 10, 'One short task that shows whether today’s goal was met.', 'e.g. A small build in the portal']],
    misc: ['Skipped a step', 'Didn’t read the error first', 'Copied without understanding', 'Ran out of time'] },
  arts: { kind: 'perform', short: 'ARTS', icon: 'ph ph-piano-keys', solo: 'ph ph-metronome', evidence: 'A 30-second audio or video clip', kitT: 'Performing arts: practise, then perform', kit: 'Evidence is a recording, so progress is heard, not guessed. Keep demonstrations short, practise slowly, and end every session with a take.',
    ph: [['Warm-up and recall', 8, 'Warm-ups, then material from earlier weeks, from memory.', 'e.g. Scales, hands separately'], ['Model it, then break it down', 12, 'Perform it once, then slowly, a small section at a time.', 'e.g. Bars 1–4 only'], ['Quick check', 4, 'Everyone answers at once. Move on only if most get it.', 'e.g. Show fingers for the beat count'], ['Pairs: one performs, one listens', 18, 'Swap every 3 minutes. The listener checks one thing only.', 'e.g. A confident reader with a new one'], ['Practise it', 26, 'Slow first. Speed up only after three clean runs.', 'e.g. 60 bpm, then 72'], ['Record it', 12, 'A 30-second take shows what was learned better than any test.', 'e.g. One take each, phone on the stand']],
    misc: ['Rushes the easy parts', 'Loses the pulse', 'Watches hands and loses the place', 'Stops at every mistake'] },
  media: { kind: 'studio', short: 'MEDIA', icon: 'ph ph-film-slate', solo: 'ph ph-camera', evidence: 'A photo or clip of the work', kitT: 'Media and studio: make, show, improve', kit: 'Evidence is the work itself. Rotate crew roles so everyone does each job, and end with a short critique: two things that work, one to change.',
    ph: [['Look back', 8, 'Show two pieces from last week. What worked, and why?', 'e.g. Two student pieces, one minute each'], ['Demonstrate the technique', 15, 'Show it, name it, then show a common mistake.', 'e.g. One subject, three framings'], ['Quick check', 4, 'Everyone answers at once. Move on only if most get it.', 'e.g. Point to the right one on screen'], ['Crews of three', 20, 'Rotate roles so everyone does each job.', 'e.g. Crews from the skills board'], ['Make it', 23, 'Everyone produces something you can see by the end.', 'e.g. Three shots, any subject'], ['Show your work', 10, 'Share a work-in-progress and give one piece of peer feedback.', 'e.g. Two stars and a wish']],
    misc: ['No plan before making', 'Same choice every time', 'Ignored the light', 'Unfinished at the end'] },
  business: { kind: 'biz', short: 'BUSINESS', icon: 'ph ph-kanban', solo: 'ph ph-notepad', evidence: 'A short written plan or decision', kitT: 'Business: decide with real cases', kit: 'Evidence is a decision with a reason. Use real NGG projects as cases, give each team member a role, and end with one written decision.',
    ph: [['Recall', 8, 'Questions on last week’s ideas, answered from memory.', 'e.g. One question per card'], ['Worked case', 15, 'Walk through one real example step by step.', 'e.g. Planning the club’s open day'], ['Quick check', 4, 'Everyone answers at once. Move on only if most get it.', 'e.g. Fingers up for A, B, C or D'], ['Teams on a live case', 20, 'Small teams apply it to a real NGG project. You ask; they decide.', 'e.g. Teams of three, one role each'], ['Your own plan', 23, 'Each person applies it to a project they care about.', 'e.g. Their own event or business idea'], ['One decision and why', 10, 'A short written answer shows whether they can use it.', 'e.g. Paper slip or the portal']],
    misc: ['Too vague to act on', 'No owner named', 'No deadline', 'Goal written as a task'] },
};
const IP6_PHASE_KEYS = ['review', 'new', 'hinge', 'guided', 'solo', 'exit'];
const IP6_PHASE_ICONS = ['ph ph-arrow-counter-clockwise', 'ph ph-chalkboard-teacher', 'ph ph-question', 'ph ph-users-three', '', 'ph ph-ticket'];
const IP6_REMARK_CHIPS = ['Helped a classmate', 'Asked a good question', 'Finished the task', 'Needs smaller steps', 'Distracted today', 'Kept trying after errors'];
const IP6_LOG_PROMPTS = ['What we covered', 'What went well', 'What I’d change next time'];
const IP6_CONCERN_KINDS = ['Something they told me', 'Injury or harm', 'Neglect', 'Online safety', 'An adult’s behaviour', 'Something else'];
const IP6_SUPPORT = ['A student is struggling to keep up', 'Behaviour in the room', 'I need materials or equipment', 'I can’t make Saturday', 'Talk to the centre lead'];
const IP6_ERR = {
  not_your_course: 'That course isn’t yours.', not_your_centre: 'That centre isn’t yours.', unmarked: 'Mark everyone first, or close with the rest as away.',
  aim_required: 'Write the lesson goal first.', question_and_two_options: 'The hinge needs a question and two options.', no_results: 'Mark at least one exit ticket.',
  summary_required: 'Write what you covered first.', roll_not_closed: 'Close the roll before filing the log.', evidence_required: 'Say what you saw for each child who moved up.',
  no_marks: 'Nothing to save.', not_found: 'That record wasn’t found.', network: 'You’re offline. It’s saved on this device and will send.', rate_limited: 'Too many in a row. Wait a minute.',
  orientation_required: 'Finish “Start here” in the Academy first. It opens the rest of your portal.', answer_all: 'Answer every question first.',
  retry_later: 'That is three tries at this module today. Read it again and try tomorrow.',
  choose_the_child: 'Choose the child first.', choose_the_kind: 'Choose what kind of concern.', say_what_happened: 'Write what happened first.', report_limit: 'You have sent the most reports allowed today. If a child is in danger now, phone your safeguarding officer.',
};
function ip6Err(e) { const c = (e && (e.code || e.message)) || 'failed'; return IP6_ERR[c] || ('Couldn’t save (' + c + ').'); }
function ip6Ini(n) { const p = String(n || '').replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function ip6First(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
function ip6Clock(hhmm) { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); if (!m) return ''; return m[1].padStart(2, '0') + ':' + m[2]; }
function ip6Mins(a, b) { const t = x => { const m = /^(\d{1,2}):(\d{2})/.exec(String(x || '')); return m ? +m[1] * 60 + +m[2] : null; }; const x = t(a), y = t(b); return x !== null && y !== null && y > x ? y - x : null; }
function ip6Date(iso, o) { const d = /^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z') : null; return d ? d.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o || { day: 'numeric', month: 'short' })) : ''; }
function ip6Short(skill) { const w = String(skill || '').split(/\s+/); return w.length <= 3 ? skill : w.slice(0, 3).join(' '); }
function ip6Slug(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

/* The screens open before "Start here" is done. */
const IP6_ORI_OPEN = ['academy', 'support', 'report'];

const ip6Api = {
  today: o => NGGApi.member.teachToday(o), cls: o => NGGApi.member.teachClass(o), hist: o => NGGApi.member.classHistory(o),
  board: (c, ce) => NGGApi.member.skillsBoard(c, ce), stu: id => NGGApi.member.teachStudent(id), curr: () => NGGApi.member.curriculumStaff(),
  results: o => NGGApi.member.classResults(o), result: (id, t) => NGGApi.member.classResult(id, t),
  /* A Saturday write: banked on the device, then sent. */
  act: (body, label) => (window.outbox ? window.outbox.send('teaching.act', body, { label }) : NGGApi.__outboxOps['teaching.act'](body)),
};

class Ip6Portal extends React.Component {
  rootRef = React.createRef();
  state = { scr: 'today', hist: [], w: 1200, d: {}, ld: {}, er: {}, course: '', centre: '', here: {}, q: '', log: null, remarks: {}, remFor: null, remText: '', sk: 0, marks: {}, ev: {}, mk: {}, fb: {}, mi: 0,
            sel: null, timer: null, cat: null, sent: null, toast: null, stTab: 'overview', anaRange: 'term', sumText: {}, goal: null, phM: {}, phN: {}, rIdx: null, hq: null, ex: {}, mc: {}, called: [], ccNow: null, ccOut: {}, ccLater: [],
            tIdx: 0, tEnd: null, tPaused: null, taught: false, rollEdit: false, queue: [], online: true, cKid: '', cText: '', rsF: 'all', rsQ: '', rsOpen: null, rsNote: {}, rsAck: {}, cpOpen: false, cpQ: '' };

  componentDidMount() {
    const el = this.rootRef.current;
    if (el && window.ResizeObserver) { this.ro = new ResizeObserver(([e]) => this.setState({ w: e.contentRect.width })); this.ro.observe(el); }
    this.tick = setInterval(() => { const s = this.state; if ((s.tEnd && !s.tPaused) || s.timer) { if (s.timer && Date.now() >= s.timer) { this.setState({ timer: null }); this.toast('Time’s up'); } else this.forceUpdate(); } }, 1000);
    this._k = e => { const tag = (e.target && e.target.tagName) || ''; if (e.key === 'Escape' && this.state.cpOpen) return this.setState({ cpOpen: false });
      if (this.state.scr === 'teach' && !/INPUT|TEXTAREA|SELECT/.test(tag)) { if (e.key === 'c' || e.key === 'C') { e.preventDefault(); return this.coldCall(); } if (e.key === 'ArrowRight') { e.preventDefault(); return this.nextPhase(); } }
      if (e.key === 'Escape' && this.state.hist.length) this.goBack(); };
    window.addEventListener('keydown', this._k);
    this.onNet = () => this.setState({ online: navigator.onLine !== false });
    window.addEventListener('online', this.onNet); window.addEventListener('offline', this.onNet); this.onNet();
    if (window.outbox && window.outbox.subscribe) this.unsub = window.outbox.subscribe(() => this.readQueue());
    this.readQueue();
    this.loadAll();
  }
  componentWillUnmount() { this.ro && this.ro.disconnect(); clearInterval(this.tick); window.removeEventListener('keydown', this._k); window.removeEventListener('online', this.onNet); window.removeEventListener('offline', this.onNet); this.unsub && this.unsub(); Object.values(this.timers || {}).forEach(clearTimeout); }
  readQueue() { if (!window.outbox || !window.outbox.pending) return; Promise.resolve(window.outbox.pending('teaching.act')).then(rows => { const q = (rows || []).map(r => ({ label: r.label || 'A change', at: new Date(r.at || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })); this.setState({ queue: q }); }).catch(() => {}); }

  slotArgs() { return { course: this.state.course || '', centre: this.state.centre || '' }; }
  load(key, fn) {
    this.setState(s => ({ ld: { ...s.ld, [key]: true }, er: { ...s.er, [key]: null } }));
    return fn().then(r => { this.setState(s => ({ d: { ...s.d, [key]: r }, ld: { ...s.ld, [key]: false } })); return r; })
      .catch(e => { this.setState(s => ({ ld: { ...s.ld, [key]: false }, er: { ...s.er, [key]: e } })); return null; });
  }
  loadAll() {
    const a = this.slotArgs();
    // The Instructor Academy first: it decides whether the rest of the portal is open yet.
    this.load('acad', () => NGGApi.member.teachAcademy());
    return this.load('today', () => ip6Api.today(a)).then(t => {
      if (!t) return;
      const slot = { course: t.course, centre: t.centre };
      if (this.state.course !== t.course || this.state.centre !== t.centre) this.setState(slot);
      this.load('cls', () => ip6Api.cls(slot)); this.load('hist', () => ip6Api.hist(slot)); this.load('board', () => ip6Api.board(t.course, t.centre));
      this.load('curr', () => ip6Api.curr()); this.load('res', () => ip6Api.results(Object.assign({ filter: 'all' }, slot)));
      this.load('form', () => NGGApi.public.formation('instructor'));
      this.load('me', () => NGGApi.auth.me());
      this.load('comm', () => NGGApi.member.community.channels().then(c => { const ch = ((c && c.channels) || []).find(x => x.kind === 'course' && (x.name || '').toLowerCase() === String(t.course).toLowerCase()) || ((c && c.channels) || []).find(x => x.slug === ip6Slug(t.course));
        if (!ch) return { channel: null, posts: [], hw: null };
        return Promise.all([NGGApi.member.community.feed(ch.slug, 'latest', 0).catch(() => ({ posts: [] })), NGGApi.member.community.homework(ch.slug).catch(() => ({ homework: null }))]).then(([f, h]) => ({ channel: ch, posts: (f && f.posts) || [], hw: (h && h.homework) || null })); }));
    });
  }
  refreshClass() { const slot = this.slotArgs(); this.load('cls', () => ip6Api.cls(slot)); this.load('today', () => ip6Api.today(slot)); }
  /* Save, with the outbox. A queued write is not an error: it is safe and says so. */
  save(body, label, okText) {
    return ip6Api.act(Object.assign(this.slotArgs(), body), label)
      .then(r => { if (okText) this.toast(typeof okText === 'function' ? okText(r || {}) : okText); this.readQueue(); return r || {}; })
      .catch(e => { this.readQueue(); if (e && e.queued) { this.toast('Saved on this phone. It sends when the signal is back.'); return { queued: true }; } this.toast(ip6Err(e)); return null; });
  }
  later(key, fn, ms) { this.timers = this.timers || {}; clearTimeout(this.timers[key]); this.timers[key] = setTimeout(fn, ms || 900); }

  toast(text, undo) { clearTimeout(this._t); this.setState({ toast: { text, undo } }); this._t = setTimeout(() => this.setState({ toast: null }), 6500); }
  scrollTop() { const m = this.rootRef.current && this.rootRef.current.querySelector('main'); if (m) m.scrollTop = 0; }
  /* "Start here" (domain/academy.php): until the portal guides are passed the
     portal opens on the Academy, with Support and Report a concern. */
  oriLocked() { const a = this.state.d.acad; return !!(a && a.orientation && a.orientation.ok === false); }
  oriGate(scr) { if (this.oriLocked() && !IP6_ORI_OPEN.includes(scr)) { this.toast('Finish “Start here” in the Academy first — it opens the rest of your portal.'); return 'academy'; } return scr; }
  componentDidUpdate() { if (this.oriLocked() && !IP6_ORI_OPEN.includes(this.state.scr)) this.setState({ scr: 'academy', hist: [] }); }
  goTop(scr) { scr = this.oriGate(scr); this.setState({ scr, hist: [] }); this.scrollTop(); }
  goTo(scr, extra) { if (this.oriGate(scr) !== scr) return this.goTop('academy'); const s = this.state; this.setState(Object.assign({ scr, hist: s.hist.concat([s.scr]) }, extra || {})); this.scrollTop(); if (scr === 'student' && extra && extra.sel) this.loadStu(extra.sel); }
  goBack() { const h = this.state.hist; this.setState({ scr: h.length ? h[h.length - 1] : 'today', hist: h.slice(0, -1) }); this.scrollTop(); }
  loadStu(id) { if (id && !this.state.d['stu:' + id]) this.load('stu:' + id, () => ip6Api.stu(id)); }

  /* ── The class, as the design reads a child ─────────────────────────── */
  ctx() {
    const S = this.state, D = S.d;
    const cls = D.cls || {}, board = D.board || {}, hist = D.hist || {};
    const skills = board.skills || cls.skills || [];
    const bByKid = {}; (board.students || []).forEach(x => { bByKid[x.studentId] = x; });
    const hByKid = {}; (hist.students || []).forEach(x => { hByKid[x.memberId] = x; });
    const roll = ((cls.session || {}).roll) || {};
    const L = (cls.roster || []).map((r, i) => { const b = bByKid[r.memberId] || {}; const mk = b.marks || {}, pv = b.prev || {}; const h = hByKid[r.memberId] || {};
      return { id: r.memberId, i, name: r.fullName, first: ip6First(r.fullName), age: r.age, mentor: r.mentor || '', initials: ip6Ini(r.fullName), photo: r.photoUrl,
        sk: skills.map(k => mk[k] ? mk[k] - 1 : null), prev: skills.map(k => pv[k] !== undefined && pv[k] !== null ? pv[k] - 1 : (mk[k] ? mk[k] - 1 : null)),
        rollMark: roll[r.memberId] || (r.scanned ? (r.scanLate ? 'late' : 'here') : ''), scanned: !!r.scanned, att: h.attendance, exitGot: h.exitGot }; });
    const isHere = m => S.here[m.id] !== undefined ? S.here[m.id] : (m.rollMark === 'here' || m.rollMark === 'late');
    const lvlOf = (m, k) => S.marks[m.id + '_' + k] !== undefined ? S.marks[m.id + '_' + k] : m.sk[k];
    const div = cls.division || 'tech'; const kit = IP6_KITS[div] || IP6_KITS.tech;
    return { D, cls, board, hist, skills, short: skills.map(ip6Short), L, isHere, lvlOf, kit, here: L.filter(isHere) };
  }
  phases(kit) { const saved = (((this.state.d.cls || {}).session || {}).plan || {}).steps || [];
    return kit.ph.map((p, i) => { const sv = saved.find(x => x.title === p[0]); return [IP6_PHASE_KEYS[i], p[0], IP6_PHASE_ICONS[i] || kit.solo, this.state.phM[i] !== undefined ? this.state.phM[i] : (sv ? sv.minutes : p[1]), p[2], p[3]]; }); }
  coldCall() { const C = this.ctx(); const S = this.state; const pool = C.here; if (!pool.length) return; let called = S.called; let left = pool.filter(m => !called.includes(m.id)); if (!left.length) { called = []; left = pool.filter(m => m.id !== S.ccNow); if (!left.length) left = pool; }
    const later = S.ccLater.map(id => left.find(m => m.id === id)).filter(Boolean); const pick = later.length && Math.random() < 0.5 ? later[0] : left[Math.floor(Math.random() * left.length)];
    this.setState({ ccNow: pick.id, called: called.concat([pick.id]), ccLater: S.ccLater.filter(id => id !== pick.id) }); }
  nextPhase() { const P = this.phases(this.ctx().kit); const i = this.state.tIdx || 0;
    if (i >= P.length - 1) { this.setState({ tEnd: null, tPaused: null, taught: true }); this.goTo('exit'); this.toast('Lesson finished. Mark the exit tickets while they’re fresh.'); return; }
    this.setState({ tIdx: i + 1, tEnd: Date.now() + P[i + 1][3] * 60000, tPaused: null }); }
  savePlan(share) {
    const C = this.ctx(); const S = this.state; const sess = C.cls.session || {}; const aim = (S.goal !== null ? S.goal : (sess.plan || {}).aim || '').trim();
    if (aim.length < 4) return Promise.resolve(null);
    const P = this.phases(C.kit);
    return this.save({ action: 'classPlan', plan: { aim, carryOver: this.carryText(C), steps: P.map(p => ({ title: p[1], minutes: p[3] })), support: this.pairText(C), stretch: (S.phN || {})[4] || '' } }, 'Lesson plan', share ? 'Plan saved' : null)
      .then(r => { if (r && r.session) this.setState(s => ({ d: { ...s.d, cls: { ...s.d.cls, session: r.session } } })); return r; });
  }
  carryText(C) { const co = C.cls.carryOver || {}; return co.notYet && co.notYet.length ? 'From last week’s exit ticket: reteach first for ' + co.notYet.map(x => ip6First(x.fullName)).join(', ') + (co.misconception ? ' (' + co.misconception.toLowerCase() + ')' : '') + '.' : ''; }
  pairText(C) { const k0 = this.state.sk || 0; const helpers = C.here.filter(m => C.lvlOf(m, k0) === 3), learners = C.here.filter(m => C.lvlOf(m, k0) === 0);
    return learners.length ? 'Pairs from the skills board (' + (C.short[k0] || 'skill').toLowerCase() + '): ' + learners.map((m, i) => m.first + ' with ' + (helpers.length ? helpers[i % helpers.length].first : 'you')).join(' · ') : 'No one is at “Not yet” on ' + (C.short[k0] || 'this skill').toLowerCase() + '. Pair by choice.'; }
  hinge(C) { const sess = C.cls.session || {}; const h = (sess.hinge && sess.hinge.question) ? sess.hinge : ((C.cls.questions || {}).hinge || null); if (!h) return null;
    const L = ['A', 'B', 'C', 'D', 'E']; return { q: h.question, opts: h.options.map((o, i) => [L[i], o]), right: h.correct !== null && h.correct !== undefined ? L[h.correct] : null }; }

  /* ── Loading and an honest error, inside <main> ─────────────────────── */
  slot() {
    const S = this.state; const need = ['today', 'cls'];
    if (S.scr === 'assignments' || S.scr === 'academy') return null;   // the desk and the Academy load their own data, and say so
    const e = need.map(k => S.er[k]).find(Boolean);
    if (e) { const c = (e && (e.code || e.message)) || ''; return <div className="m15x-slot"><div className="m15x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{c === 'network' ? 'You’re offline and this class hasn’t been opened on this device yet.' : c === 'not_your_course' || c === 'not_your_centre' ? 'That class isn’t yours.' : c === 'not_cleared' ? (e.detail || 'Your safeguarding check has not been recorded yet. Your courses are under Curriculum; your learners appear once your centre admin clears the check.') : 'Your class couldn’t load (' + (c || 'error') + ').'}</span><button type="button" onClick={() => { this.setState({ er: {} }); this.loadAll(); }}>Retry</button></div></div>; }
    if (need.some(k => S.ld[k] || !S.d[k])) return <div className="m15x-slot"><div className="m15x-load" role="status" aria-live="polite"><span className="m15x-bar"/><span className="m15x-sr">Loading your class</span></div></div>;
    // Analytics before any Saturday has a closed roll: say why the attendance chart is empty, and what fills it.
    if (S.scr === 'analytics' && S.d.hist && !((S.d.hist.weeks) || []).some(w => w.closed))
      return <div className={"ip6-slot" + (S.w < 760 ? " is-narrow" : "")}><p className="ip6-note" role="status"><i className="ph ph-info" aria-hidden="true"/>No Saturday has a closed roll yet, so attendance has nothing to show. Close the roll after the class starts and each Saturday appears here.</p></div>;
    return null;
  }

  renderVals() {
    const C = this.ctx(); const { D, cls, L, isHere, lvlOf, kit, here } = C; const S = this.state, set = o => this.setState(o), cur = S.scr;
    const today = D.today || {}; const sess = cls.session || {}; const loop = cls.loop || today.loop || { steps: {} };
    const narrow = S.w < 760, wide = !narrow;
    const meM = ((D.me || {}).member) || {}; const meName = meM.fullName || '';
    const slotInfo = cls.slotInfo || null; const time = slotInfo ? ip6Clock(slotInfo.start) + ' – ' + ip6Clock(slotInfo.end) : 'Saturday';
    const lesson = cls.lesson || today.lesson || null;
    const course = { name: cls.course || today.course || '', division: kit.kitT.split(':')[0], week: lesson ? lesson.week : '', unit: lesson ? lesson.title : 'No lesson scheduled this week', room: slotInfo && slotInfo.room ? slotInfo.room : cls.centre || '', time };
    const me = { first: ip6First(meName), name: meName, role: 'Instructor · ' + kit.short.charAt(0) + kit.short.slice(1).toLowerCase(), centre: cls.centre || today.centre || '', initials: ip6Ini(meName) };
    const hereN = here.length;
    const pending = ((D.curr || {}).pending) || [];
    const markItems = []; pending.forEach(p => (p.checks || []).forEach(c => { if (String(p.unitId) && (!cls.course || true)) markItems.push({ progressId: p.progressId, checkId: c.checkId, who: p.memberName, unit: p.unitTitle, q: c.prompt, a: c.answer, max: c.points || 1, model: c.modelAnswer || '', rubric: c.rubric || '' }); }));
    const markLeft = markItems.filter((x, i) => !S.mk[i + '_saved']).length;
    const hw = (D.comm || {}).hw; const toGrade = hw && hw.submitted ? hw.submitted.filter(x => !x.reviewedAt).length : 0;
    const remN = Object.values(S.remarks).reduce((n, a) => n + a.length, 0);
    const rollClosed = !!sess.rollClosedAt && !S.rollEdit;
    const steps = loop.steps || {};
    const resAttn = ((D.res || {}).counts || {}).attn || 0;
    const cmNeed = this.cmNeedRows();
    const oriL = this.oriLocked(); const acad = D.acad || {}; const ori = acad.orientation || {};
    const acadTodo = (acad.modules || []).filter(m => (m.orientation || m.required) && !(m.passedAt && !(m.renewBy && m.renewBy < new Date().toISOString().slice(0, 10)))).length;
    const groups = [
      { h: '', items: [['today', 'Today', 'ph ph-sun-horizon', ''], ['roll', 'Class roll', 'ph ph-list-checks', rollClosed ? '' : String(L.filter(m => !m.rollMark && S.here[m.id] === undefined).length || '')]] },
      { h: 'This Saturday', items: [['plan', 'Plan', 'ph ph-path', steps.plan === 'done' ? '' : '1'], ['teach', 'Teach', 'ph ph-presentation-chart', ''], ['exit', 'Exit ticket', 'ph ph-ticket', steps.exit === 'done' ? '' : '1'], ['log', 'Session log', 'ph ph-notebook', steps.log === 'done' ? '' : '1']] },
      { h: 'Teach', items: [['analytics', 'Analytics', 'ph ph-chart-bar', ''], ['skills', 'Skills board', 'ph ph-ladder', ''], ['marking', 'Marking', 'ph ph-check-square', markLeft ? String(markLeft) : ''], ['assignments', 'Assignments', 'ph ph-clipboard-text', ''], ['curriculum', 'Curriculum', 'ph ph-books', '']] },
      { h: 'People', items: [['students', 'Students', 'ph ph-users-three', ''], ['results', 'School results', 'ph ph-exam', resAttn ? String(resAttn) : ''], ['community', 'Community', 'ph ph-chats-circle', cmNeed.length ? String(cmNeed.length) : ''], ['support', 'Support', 'ph ph-lifebuoy', ''], ['academy', 'Academy', 'ph ph-graduation-cap', acadTodo ? String(acadTodo) : '']] },
    ];
    if (oriL) groups.splice(0, groups.length, { h: 'Start here', items: [['academy', 'Academy', 'ph ph-graduation-cap', acadTodo ? String(acadTodo) : ''], ['support', 'Support', 'ph ph-lifebuoy', '']] });
    const navCur = cur === 'student' ? 'students' : cur === 'report' ? 'support' : cur;
    const flat = [].concat(...groups.map(g => g.items));
    const tabIds = ['today', 'roll', 'teach', 'exit'];
    const moreList = flat.filter(x => !tabIds.includes(x[0])).map(([id, label, icon, badge]) => ({ label, icon, badge, hasBadge: !!badge, go: () => this.goTo(id) }));
    const bOf = id => (flat.find(z => z[0] === id) || [])[3] || '';
    const AREAS = [['Today', 'ph ph-sun-horizon', [['today', 'Today']]], ['Saturday', 'ph ph-presentation-chart', [['roll', 'Roll'], ['plan', 'Plan'], ['teach', 'Teach'], ['exit', 'Exit ticket'], ['log', 'Session log']]], ['Progress', 'ph ph-chart-bar', [['marking', 'Marking'], ['assignments', 'Assignments'], ['skills', 'Skills board'], ['analytics', 'Analytics'], ['results', 'School results']]], ['Students', 'ph ph-users-three', [['students', 'Students'], ['community', 'Community']]], ['Resources', 'ph ph-books', [['curriculum', 'Curriculum'], ['support', 'Support'], ['academy', 'Academy']]]]
      .concat(this.props.onSummer ? [['Summer School', 'ph ph-sun', [['summer', 'Summer School']]]] : [])
      .map(([label, icon, kids]) => { const b = kids.filter(([id]) => bOf(id)).length; return { label, icon, kids, ids: kids.map(k => k[0]), b }; });
    if (oriL) AREAS.splice(0, AREAS.length, { label: 'Start here', icon: 'ph ph-graduation-cap', kids: [['academy', 'Academy'], ['support', 'Support']], ids: ['academy', 'support'], b: acadTodo ? 1 : 0 });
    const area = AREAS.find(a => a.ids.includes(navCur)) || AREAS[0];
    const IP6_HUE = { today: 'amber', roll: 'blue', marking: 'teal', students: 'violet', curriculum: 'slate', summer: 'amber' };
    const hue = a => PORTAL_HUE[IP6_HUE[a.ids[0]] || 'slate'], hueOn = hue(area);
    const inDetail = cur === 'student' || cur === 'report';
    const toScr = id => { if (id === 'summer') return this.props.onSummer(); this.setState({ scr: this.oriGate(id) }); this.scrollTop(); };
    const areaNav = [{ h: '', hasH: false, items: AREAS.map(a => { const on = a === area; return { label: a.label, icon: on ? a.icon.replace('ph ', 'ph-fill ') : a.icon, cur: on ? 'page' : undefined, bg: on ? '#fff' : 'transparent', sh: on ? '0 0 0 1px #e8e5dd' : 'none', fw: on ? 600 : 500, badge: a.b ? String(a.b) : '', hasBadge: !!a.b, go: () => a.ids[0] === 'summer' ? this.props.onSummer() : this.goTop(a.ids[0]) }; }) }];
    const areaTabbar = AREAS.filter(a => a.ids[0] !== 'summer').map(a => { const on = a === area; return { label: a.label, icon: on ? a.icon.replace('ph ', 'ph-fill ') : a.icon, cur: on ? 'page' : undefined, fw: on ? 600 : 500, fg: on ? hue(a) : '#626a6e', hasBadge: !!a.b, go: () => this.goTop(a.ids[0]) }; });
    const areaTabs = area.kids.map(([id, l]) => { const on = cur === id; const b = bOf(id); return { l, on: on ? 'true' : 'false', fg: on ? hueOn : '#5a5a60', fw: on ? 600 : 500, bar: on ? hueOn : 'transparent', badge: b, hasBadge: !!b, go: () => toScr(id) }; });
    const selM = L.find(m => m.id === S.sel) || L[0] || { id: '', name: '', first: '', age: null, mentor: '', sk: [], prev: [], initials: '' };
    const titles = { results: 'School results', community: 'Community', plan: 'Plan the lesson', teach: 'Teach', exit: 'Exit ticket', analytics: 'Class analytics', today: wide ? 'Good morning' + (me.first ? ', ' + me.first : '') : 'Today', roll: 'Class roll', log: 'Session log', skills: 'Skills board', marking: 'Marking', assignments: 'Assignments', curriculum: 'Curriculum', students: 'Students', student: selM.name, support: 'Support', report: 'Report a concern', more: 'More', academy: 'Instructor Academy' };
    const subs = { assignments: 'Set work for your courses, see who handed in, and mark it', results: 'Term results and growth plans for your class', community: 'Opens in its own page · what’s waiting for you here', plan: (course.week ? 'Week ' + course.week + ' · ' : '') + course.unit + ' · built on what works in the classroom', teach: time + ' · ' + hereN + ' here',
      exit: 'Find out who learned it, then give one piece of feedback to the whole class', analytics: course.name + ' · ' + L.length + ' students', today: course.name + (course.week ? ' · week ' + course.week : '') + ' · ' + ip6Date(cls.date || today.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + time + (course.room ? ' · ' + course.room : ''),
      roll: hereN + ' of ' + L.length + ' here', log: course.name + (course.week ? ' · week ' + course.week : ''), skills: course.name + ' · ' + C.skills.length + ' skills · four levels, not scores', marking: markLeft + ' answers and ' + toGrade + ' homework to review',
      curriculum: course.name, students: L.length + ' in your class', student: [selM.age !== null && selM.age !== undefined ? 'Age ' + selM.age : '', selM.mentor ? 'mentor ' + selM.mentor : 'no mentor yet'].filter(Boolean).join(' · '), support: 'You’re not on your own', report: 'Goes straight to the safeguarding officer', more: '',
      academy: oriL ? 'Start here: ' + (ori.done || 0) + ' of ' + (ori.required || 0) + ' portal guides done' : 'How to use this portal, and the training for teaching at NGG' };
    const rem = S.timer ? Math.max(0, Math.ceil((S.timer - Date.now()) / 1000)) : 0;
    const out = {
      rootRef: this.rootRef, mainSlot: this.slot(), mainSlotEnd: cur === 'assignments' ? <div className={'ip6-asd' + (narrow ? ' is-narrow' : '')}><AssignmentDesk api={NGGApi.member.assignDesk()} title={false}/></div>
        : cur === 'academy' ? <div className={'ip6-asd' + (narrow ? ' is-narrow' : '')}><Ip6Academy data={D.acad} err={S.er.acad} reload={() => this.load('acad', () => NGGApi.member.teachAcademy())} toast={t => this.toast(t)}/></div> : null, narrow, wide, outerPad: '0', frameW: '100%', frameH: '100%', frameR: '0', frameSh: 'none',
      // The assignment desk follows the column, so the column keeps no bottom padding above it.
      mainPad: narrow ? (cur === 'assignments' || cur === 'academy' ? '16px 16px 0' : '16px 16px 28px') : (cur === 'assignments' || cur === 'academy' ? '32px 40px 0' : '32px 40px 56px'), toastBottom: narrow ? '92px' : '24px',
      me, course, navGroups: areaNav, tabbar: areaTabbar, moreList, areaTabs, hasAreaTabs: area.kids.length > 1 && !inDetail, areaLabel: area.label, title: area.kids.length > 1 && !inDetail ? area.label : titles[cur], subtitle: subs[cur] || '', showBack: S.hist.length > 0, back: () => this.goBack(),
      goReport: () => this.goTo('report'), go: id => () => this.goTo(id),
      timerOn: !!S.timer, timerText: Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0'), stopTimer: () => set({ timer: null }),
      timers: [5, 10, 15, 20].map(n => ({ n: n + ' min', start: () => set({ timer: Date.now() + n * 60000 }) })),
      on: Object.fromEntries(['today', 'community', 'plan', 'teach', 'exit', 'roll', 'log', 'skills', 'marking', 'curriculum', 'students', 'student', 'support', 'report', 'more', 'analytics', 'results'].map(k => [k, cur === k])),
      ...this.cpVals(C, kit, time),
      toastOn: !!S.toast, toastText: S.toast ? S.toast.text : '', toastUndo: !!(S.toast && S.toast.undo), toastUndoFn: () => { S.toast && S.toast.undo && S.toast.undo(); set({ toast: null }); },
    };
    this._ctx = { C, D, S, set, L, isHere, hereN, lvlOf, markItems, markLeft, toGrade, remN, selM, course, me, kit, sess, loop, steps, rollClosed, hw, time };
    return Object.assign(out, this.screenVals(), this.loopVals(), this.anaVals(), this.cmVals(), this.rwVals(), this.resVals());
  }

  cpVals(C, kit, time) {
    const S = this.state; const t = this.state.d.today || {};
    const q = (S.cpQ || '').trim().toLowerCase();
    const list = (t.courses || []).flatMap(c => (t.centres || []).map(ce => ({ c, ce }))).filter(x => !q || (x.c + ' ' + x.ce).toLowerCase().includes(q));
    const pick = (c, ce) => { if (c === C.cls.course && ce === C.cls.centre) return this.setState({ cpOpen: false, cpQ: '' }); this.setState({ course: c, centre: ce, cpOpen: false, cpQ: '', d: { me: S.d.me, form: S.d.form }, here: {}, marks: {}, ev: {}, ex: {}, mc: {}, hq: null, goal: null, phM: {}, phN: {}, log: null, remarks: {}, tIdx: 0, tEnd: null, taught: false }, () => this.loadAll()); this.toast('Now teaching ' + c + ' · ' + ce); };
    return { cs: { name: C.cls.course || '', short: kit.short, icon: kit.icon, tagBg: '#0b0b0c', tagFg: '#f5b026', meta: [C.cls.centre, 'Sat ' + time, (C.cls.slotInfo || {}).room].filter(Boolean).join(' · '), channel: '#' + (((S.d.comm || {}).channel || {}).slug || ip6Slug(C.cls.course)), evidence: kit.evidence, kitT: kit.kitT, kit: kit.kit },
      cpOpen: !!S.cpOpen, cpOpenA: S.cpOpen ? 'true' : 'false', cpToggle: () => this.setState({ cpOpen: !S.cpOpen, cpQ: '' }), cpQ: S.cpQ || '', onCpQ: e => this.setState({ cpQ: e.target.value }),
      cpKey: e => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); pick(list[0].c, list[0].ce); } },
      cpList: list.map(({ c, ce }) => { const on = c === C.cls.course && ce === C.cls.centre; return { name: c, short: (IP6_KITS[C.cls.division] || kit).short, sub: ce, cur: on, on: on ? 'true' : 'false', bg: on ? '#f4f4f2' : '#fff', tagBg: on ? '#0b0b0c' : '#f4f4f2', tagFg: on ? '#f5b026' : '#4a4a50', pick: () => pick(c, ce) }; }), cpNone: list.length === 0 };
  }

  screenVals() {
    const { C, D, S, set, L, isHere, hereN, lvlOf, markItems, markLeft, toGrade, remN, selM, course, steps, rollClosed, hw, sess } = this._ctx;
    const o = {};
    // today: the Saturday formation schedule, the instructor's part.
    const blocks = ((D.form || {}).blocks) || []; const nowL = new Date(Date.now() + 3600000); const sat = nowL.getUTCDay() === 6; const nm = nowL.getUTCHours() * 60 + nowL.getUTCMinutes();
    const tm = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h); return m ? +m[1] * 60 + +m[2] : 0; };
    const planNow = sat ? blocks.findIndex(b => nm >= tm(b.start) && nm < tm(b.end)) : -1;
    o.plan = blocks.map((b, i) => ({ t: b.start, a: b.title + (b.key === 'division' ? ' · ' + course.name + (course.room ? ' · ' + course.room : '') : ''), bg: i === planNow ? '#fdf6e3' : 'transparent', fw: i === planNow ? 600 : 400, fg: planNow >= 0 && i < planNow ? '#8a8a90' : '#0b0b0c' }));
    const skSaved = !!S.skSavedAt;
    o.todayCards = [
      { icon: 'ph ph-list-checks', t: 'Class roll', d: rollClosed ? 'Closed · ' + hereN + ' here' : hereN + ' of ' + L.length + ' here · not closed', tone: rollClosed ? '#1d6b30' : '#7a5600', go: () => this.goTo('roll') },
      { icon: 'ph ph-notebook', t: 'Session log', d: steps.log === 'done' ? 'Filed · ' + remN + ' remarks' : 'Not filed yet · ' + remN + ' remarks so far', tone: steps.log === 'done' ? '#1d6b30' : '#7a5600', go: () => this.goTo('log') },
      { icon: 'ph ph-ladder', t: 'Skills board', d: skSaved ? 'Marked today' : C.short.length ? 'Mark ' + (C.short[S.sk] || '').toLowerCase() + ' today' : 'No skills set for this course', tone: skSaved ? '#1d6b30' : '#7a5600', go: () => this.goTo('skills') },
      { icon: 'ph ph-check-square', t: 'Marking', d: markLeft + ' answers · ' + toGrade + ' homework', tone: markLeft ? '#7a5600' : '#1d6b30', go: () => this.goTo('marking') },
    ];
    // roll
    const q = S.q.toLowerCase();
    const queueRoll = id => { this.rollDirty = Object.assign(this.rollDirty || {}, { [id]: true }); this.later('roll', () => { const ids = Object.keys(this.rollDirty || {}); this.rollDirty = {}; const marks = {}; ids.forEach(i => { marks[i] = this.state.here[i] ? 'here' : 'away'; }); this.save({ action: 'classRoll', marks }, 'Roll · ' + ids.length + (ids.length === 1 ? ' mark' : ' marks')); }, 700); };
    o.q = S.q; o.onQ = e => set({ q: e.target.value }); o.hasQ = !!S.q; o.clearQ = () => set({ q: '' });
    o.roll = L.filter(m => !q || m.name.toLowerCase().includes(q)).map(m => { const h = isHere(m); return { ...m, h, label: h ? (m.rollMark === 'late' && S.here[m.id] === undefined ? 'Late' : 'Here') : 'Away', bg: h ? '#e9f6ec' : '#fff', fg: h ? '#1d6b30' : '#626a6e', bd: h ? '#cfe8d5' : '#d6d4cc', icon: h ? 'ph ph-check' : 'ph ph-minus',
      pct: m.att !== null && m.att !== undefined ? m.att + '% this term' : (m.scanned ? 'Scanned at the gate' : 'No sessions recorded yet'),
      toggle: () => { if (rollClosed) return this.toast('The roll is closed. Reopen it to change a mark.'); set({ here: { ...this.state.here, [m.id]: !h } }); queueRoll(m.id); }, open: () => this.goTo('student', { sel: m.id }) }; });
    o.rollEmpty = o.roll.length === 0; o.rollClosed = rollClosed; o.rollOpen = !rollClosed; o.hereN = hereN; o.awayN = L.length - hereN;
    o.allHere = () => { const x = {}; L.forEach(m => { x[m.id] = true; }); set({ here: x }); const marks = {}; L.forEach(m => { marks[m.id] = 'here'; }); this.save({ action: 'classRoll', marks }, 'Roll · everyone here'); };
    o.closeRoll = () => { const marks = {}; L.forEach(m => { marks[m.id] = isHere(m) ? (m.rollMark === 'late' && S.here[m.id] === undefined ? 'late' : 'here') : 'away'; });
      this.save({ action: 'classRoll', marks, close: true, awayRest: true }, 'Close the roll', r => 'Roll closed · ' + hereN + ' here, ' + (L.length - hereN) + ' away' + (r.attendanceAdded ? ' · ' + r.attendanceAdded + ' added to the centre’s attendance' : '') + '.').then(r => { if (r) { set({ rollEdit: false }); this.refreshClass(); } }); };
    o.reopenRoll = () => set({ rollEdit: true });
    // log
    const srvLog = sess.log || {}; const logV = S.log || (() => { const t = String(srvLog.summary || ''); const parts = {}; IP6_LOG_PROMPTS.forEach((p, i) => { const m = new RegExp(p.replace(/[’']/g, '.') + ':\\s*([^\\n]*)').exec(t); if (m) parts[i] = m[1]; }); if (!Object.keys(parts).length && t) parts[0] = t; return parts; })();
    const remarksAll = { ...Object.fromEntries(Object.entries(srvLog.remarks || {}).map(([k, v]) => [k, String(v).split('; ').filter(Boolean)])), ...S.remarks };
    const logDraft = () => this.later('log', () => this.save({ action: 'classLog', summary: this.logSummary(), remarks: this.logRemarks() }, 'Session log draft'), 1500);
    o.logPrompts = IP6_LOG_PROMPTS.map((p, i) => ({ p, v: logV[i] || '', on: e => { set({ log: { ...logV, [i]: e.target.value } }); logDraft(); } }));
    o.logFiled = steps.log === 'done'; o.logOpen = steps.log !== 'done';
    const logOk = (logV[0] || '').trim().length > 5;
    o.logCant = !logOk; o.logOp = logOk ? 1 : 0.4;
    o.fileLog = () => { if (!logOk) return this.toast('Write what you covered first.'); this.save({ action: 'classLog', summary: this.logSummary(), remarks: this.logRemarks(), file: true }, 'File the session log', r => 'Session log filed. ' + (r.remarksSent || 0) + ' remark' + (r.remarksSent === 1 ? '' : 's') + ' sent to mentors.').then(r => { if (r && !r.queued) this.refreshClass(); }); };
    o.remRows = L.filter(isHere).map(m => { const r = remarksAll[m.id] || []; const open = S.remFor === m.id; return { ...m, n: r.length, hasN: r.length > 0, last: r[r.length - 1] || '', open, toggle: () => set({ remFor: open ? null : m.id, remText: '' }),
      chips: IP6_REMARK_CHIPS.map(c => ({ c, add: () => { set({ remarks: { ...remarksAll, [m.id]: r.concat([c]) } }); logDraft(); } })) }; });
    o.remText = S.remText; o.onRem = e => set({ remText: e.target.value });
    o.addRem = e => { e.preventDefault(); const t = S.remText.trim(); if (!t || !S.remFor) return; set({ remarks: { ...remarksAll, [S.remFor]: (remarksAll[S.remFor] || []).concat([t]) }, remText: '' }); logDraft(); };
    this._remarksAll = remarksAll; this._logV = logV;
    // skills
    const lv = IP6_LEVELS; const skI = Math.min(S.sk, Math.max(0, C.skills.length - 1));
    o.skTabs = C.short.map((t, k) => ({ t, on: skI === k, ring: skI === k ? '#0b0b0c' : '#d6d4cc', bw: skI === k ? '2px' : '1px', pick: () => set({ sk: k, plan: null }) }));
    o.skTitle = C.skills[skI] || 'No skills are set for this course yet'; o.skN = C.skills.length ? skI + 1 : 0; o.skTotal = C.skills.length;
    const here = L.filter(isHere);
    const dist = [0, 0, 0, 0]; here.forEach(m => { const v = lvlOf(m, skI); if (v !== null && v !== undefined) dist[v]++; });
    const marked = dist.reduce((a, b) => a + b, 0);
    o.skDist = lv.map((l, i) => ({ l, n: dist[i], w: marked ? Math.round(dist[i] / marked * 100) + '%' : '0%', bg: IP6_LVCOL[i] }));
    o.skRows = here.map(m => { const v = lvlOf(m, skI), p = m.prev[skI]; const up = v !== null && v !== undefined && p !== null && p !== undefined && v > p; return { ...m, delta: up ? 'Up from ' + lv[p].toLowerCase() : v === null || v === undefined ? 'Not marked yet' : '', hasDelta: up,
      opts: lv.map((l, li) => ({ l, on: v === li, bg: v === li ? IP6_LVBG[li] : '#fff', fg: v === li ? IP6_LVFG[li] : '#0b0b0c', ring: v === li ? (li === 3 ? '#0b0b0c' : IP6_LVFG[li]) : '#d6d4cc', pick: () => set({ marks: { ...this.state.marks, [m.id + '_' + skI]: li }, skSavedAt: null }) })) }; });
    o.skSave = () => {
      const skill = C.skills[skI]; if (!skill) return;
      const changed = here.filter(m => S.marks[m.id + '_' + skI] !== undefined && S.marks[m.id + '_' + skI] !== m.sk[skI]);
      if (!changed.length) return this.toast('Nothing changed on ' + (C.short[skI] || '').toLowerCase() + '.');
      Promise.all(changed.map(m => { const lvN = S.marks[m.id + '_' + skI] + 1; const ev = ((S.ev || {})[m.id + '_' + skI] || '').trim();
        return ip6Api.act({ action: 'skills', subjectId: m.id, course: C.cls.course, marks: { [skill]: lvN }, evidence: ev ? { [skill]: ev } : {} }, (C.short[skI] || 'Skill') + ' · ' + m.first).then(() => true).catch(e => (e && e.queued ? true : e)); }))
        .then(res => { const bad = res.filter(x => x !== true); this.readQueue(); if (bad.length) this.toast(ip6Err(bad[0]) + ' ' + (changed.length - bad.length) + ' of ' + changed.length + ' saved.'); else { set({ skSavedAt: Date.now() }); this.toast((C.short[skI] || 'Skill') + ' marked for ' + changed.length + ' student' + (changed.length === 1 ? '' : 's')); }
          this.load('board', () => ip6Api.board(C.cls.course, C.cls.centre)); });
    };
    o.skSaved = skSaved;
    const helpers = here.filter(m => lvlOf(m, skI) === 3), learners = here.filter(m => lvlOf(m, skI) === 0);
    o.pairs = learners.map((m, i) => ({ a: m.first, b: helpers.length ? helpers[i % helpers.length].first : 'you' })); o.hasPairs = o.pairs.length > 0;
    o.planIdle = !S.plan; o.planBusy = false; o.planHas = !!S.plan;
    o.planLines = S.plan ? S.plan : [];
    /* "Suggest a plan", drafted from the board itself rather than a model. */
    o.runPlan = () => { const retr = ((C.cls.questions || {}).retrieval || [])[0];
      set({ plan: [{ k: 'Warm-up', t: retr ? retr.q : 'Ask the room to show, from memory, the last thing they learned in ' + (C.short[skI] || 'this skill').toLowerCase() + '.' },
        { k: 'Pairs', t: learners.length ? learners.map((m, i) => m.first + ' with ' + (helpers.length ? helpers[i % helpers.length].first : 'you')).join(' · ') + '. Helpers point, learners do.' : 'Nobody is at “Not yet”. Pair by choice and circulate.' },
        { k: 'Stretch', t: helpers.length ? helpers.map(m => m.first).join(', ') + ': show it to a classmate and spot their mistakes.' : 'Ask the strongest to explain their method to the class.' }] }); };
    // marking
    const mi = Math.min(S.mi, Math.max(0, markItems.length - 1)); const M = markItems[mi] || { who: '', unit: '', q: '', a: '', max: 1 };
    o.mkLeft = markLeft; o.mkAll = markLeft === 0; o.mkHas = markLeft > 0;
    o.mk = { ...M, n: markItems.length ? mi + 1 : 0, of: markItems.length, scores: Array.from({ length: (M.max || 1) + 1 }, (_, v) => ({ v, on: S.mk[mi] === v, bg: S.mk[mi] === v ? '#0b0b0c' : '#fff', fg: S.mk[mi] === v ? '#fff' : '#0b0b0c', pick: () => set({ mk: { ...this.state.mk, [mi]: v } }) })), fb: S.fb[mi] || '', saved: !!S.mk[mi + '_saved'] };
    o.onFb = e => set({ fb: { ...S.fb, [mi]: e.target.value } });
    o.fbBusy = false; o.canDraft = S.mk[mi] !== undefined;
    o.draftFb = () => { const sc = S.mk[mi]; const t = sc >= M.max ? 'Right. ' + (M.model ? 'That’s the key point: ' + M.model.replace(/\s+/g, ' ').slice(0, 120) : 'Clear and complete.') : 'Good start. ' + (M.rubric ? 'To get full marks: ' + M.rubric.replace(/\s+/g, ' ').slice(0, 140) : M.model ? 'Add this: ' + M.model.replace(/\s+/g, ' ').slice(0, 120) : 'Add why it matters.'); set({ fb: { ...S.fb, [mi]: t } }); };
    o.mkCant = S.mk[mi] === undefined; o.mkOp = S.mk[mi] === undefined ? 0.4 : 1;
    o.saveMk = () => { if (S.mk[mi] === undefined || !M.progressId) return; const sc = S.mk[mi];
      NGGApi.member.curriculumMark(M.progressId, { [M.checkId]: { points: sc, feedback: (S.fb[mi] || '').trim() } }).then(() => {
        const nx = markItems.findIndex((x, i) => i !== mi && !this.state.mk[i + '_saved']); set({ mk: { ...this.state.mk, [mi + '_saved']: true }, mi: nx < 0 ? mi : nx }); this.toast(ip6First(M.who) + ' marked ' + sc + '/' + M.max);
      }).catch(e => this.toast(ip6Err(e))); };
    o.mkPrev = () => set({ mi: (mi - 1 + markItems.length) % Math.max(1, markItems.length) }); o.mkNext = () => set({ mi: (mi + 1) % Math.max(1, markItems.length) });
    o.assignments = hw ? [{ t: hw.title, div: course.name, due: ip6Date(hw.dueAt, { weekday: 'short', day: 'numeric', month: 'short' }), sub: (hw.submitted || []).length, of: (hw.submitted || []).length + (hw.outstanding || []).length, toGrade, w: Math.round((hw.submitted || []).length / Math.max(1, (hw.submitted || []).length + (hw.outstanding || []).length) * 100) + '%' }] : [];
    // curriculum (the same rows feed Analytics' unit table)
    const units = (((D.curr || {}).units) || []).filter(u => !u.course || String(u.course).toLowerCase() === String(C.cls.course).toLowerCase());
    o.units = units.map(u => { const st = u.stats || {}; const done = st.audience ? Math.round((st.completed || 0) / st.audience * 100) : 0; return { w: u.week, t: u.title, st: 'Published', done, pct: done + '%', donePct: done + '%', avg: st.started ? st.completed + '/' + st.started : '—',
      mats: (u.materials || []).map(m => m.title || m.kind || 'Material'), hasMats: (u.materials || []).length > 0, fg: '#1d6b30', bg: '#e9f6ec', canPublish: false, pub: () => {},
      upload: () => this.uploadMaterial(u) }; });
    // students
    o.studentRows = L.map(m => { const vs = m.sk.filter(v => v !== null && v !== undefined); const avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      return { ...m, attendText: m.att !== null && m.att !== undefined ? m.att + '%' : '—', top: avg === null ? 'Not marked' : IP6_LEVELS[Math.round(avg)], open: () => this.goTo('student', { sel: m.id }),
        cells: m.sk.map((v, k) => ({ bg: v === null || v === undefined ? '#e6e5e0' : IP6_LVCOL[lvlOf(m, k)], t: C.short[k] + ': ' + (v === null || v === undefined ? 'not marked' : IP6_LEVELS[lvlOf(m, k)]) })) }; });
    o.st = { ...selM, rem: (remarksAll[selM.id] || []).map(t => ({ t })), hasRem: (remarksAll[selM.id] || []).length > 0, pct: selM.att !== null && selM.att !== undefined ? selM.att + '%' : '—',
      skills: C.skills.map((t, k) => { const v = lvlOf(selM, k), p = selM.prev[k]; const has = v !== null && v !== undefined; return { t, v: has ? IP6_LEVELS[v] : 'Not marked', up: has && p !== null && v > p, upText: has && p !== null && v > p ? 'Up from ' + IP6_LEVELS[p].toLowerCase() : '', segs: [0, 1, 2, 3].map(x => ({ bg: has && x <= v ? IP6_LVCOL[v] : '#e6e5e0' })) }; }) };
    o.supportOpts = IP6_SUPPORT.map(t => ({ t, pick: () => this.support(t) }));
    { const A = D.acad || {}, O = A.orientation || {};
      o.academy = (O.required ? [{ m: 'Start here: using the portal', s: O.ok ? 'Done' : O.done + ' of ' + O.required + ' guides' }] : [])
        .concat((A.modules || []).filter(m => m.required).slice(0, 3).map(m => ({ m: m.title, s: m.passedAt ? 'Passed ' + m.score + '%' : 'Not started' }))); }
    o.cats = IP6_CONCERN_KINDS.map(c => ({ c, on: S.cat === c, ring: S.cat === c ? '#0b0b0c' : '#d6d4cc', bw: S.cat === c ? '2px' : '1px', pick: () => set({ cat: c }) }));
    o.kidOpts = [{ id: '', name: 'Choose…' }].concat(L.map(m => ({ id: m.id, name: m.name })));
    o.cKid = S.cKid; o.onCKid = e => set({ cKid: e.target.value }); o.cText = S.cText; o.onCText = e => set({ cText: e.target.value });
    o.hasCat = !!S.cat && !S.sent; o.sent = !!S.sent; o.notSent = !S.sent; o.cRef = S.sent ? S.sent.ref : '';
    o.sendConcern = () => { if (!S.cKid) return this.toast('Choose the child first.'); if (S.cText.trim().length <= 10) return this.toast('Write what happened, in a sentence or two.');
      NGGApi.member.mentorAct('concern', { subjectId: S.cKid, category: S.cat, body: S.cText.trim() }).then(r => set({ sent: { ref: r.ref }, cText: '', cKid: '' })).catch(e => this.toast(ip6Err(e))); };
    o.resetConcern = () => set({ sent: null, cat: null });
    return o;
  }
  logSummary() { const v = this._logV || this.state.log || {}; return IP6_LOG_PROMPTS.map((p, i) => (v[i] || '').trim() ? p + ': ' + v[i].trim() : '').filter(Boolean).join('\n'); }
  logRemarks() { const r = this._remarksAll || this.state.remarks; const out = {}; Object.keys(r).forEach(k => { if ((r[k] || []).length) out[k] = r[k].join('; '); }); return out; }
  uploadMaterial(u) {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; this.toast('Uploading ' + f.name + '…');
      NGGApi.member.curriculumUpload(f).then(r => NGGApi.member.curriculumMaterial({ unitId: u.unitId, title: f.name.replace(/\.[a-z0-9]+$/i, ''), url: r.url, kind: 'file' }))
        .then(() => { this.toast('Sent for approval. It joins week ' + u.week + ' once a curriculum lead approves it.'); this.load('curr', () => ip6Api.curr()); }).catch(e => this.toast(ip6Err(e))); };
    inp.click();
  }
  support(topic) {
    const meM = ((this.state.d.me || {}).member) || {}; const C = this.ctx();
    if (topic === 'Talk to the centre lead' || !meM.email) { /* the same desk, by name */ }
    NGGApi.public.contact({ name: meM.fullName || 'Instructor', email: meM.email || '', subject: 'Instructor support: ' + topic, message: topic + '\n\nCourse: ' + (C.cls.course || '') + '\nCentre: ' + (C.cls.centre || '') + '\nFrom the Instructor Portal.' })
      .then(() => this.toast('Sent to the NGG team. They’ll reply to ' + (meM.email || 'you') + '.')).catch(e => this.toast(ip6Err(e)));
  }

  loopVals() {
    const { C, D, S, set, L, isHere, lvlOf, sess, steps, course, kit, time } = this._ctx; const o = {};
    const P = this.phases(kit); const mins = P.map(p => p[3]), tot = mins.reduce((a, b) => a + b, 0);
    const budget = ip6Mins((C.cls.slotInfo || {}).start, (C.cls.slotInfo || {}).end) || 90;
    const here = L.filter(isHere); const ex = this.exMarks(C);
    const exDone = here.filter(m => ex[m.id] !== undefined).length;
    const taught = S.taught || steps.teach === 'done';
    o.loop = [['1', 'Plan', 'ph ph-path', steps.plan === 'done', steps.plan === 'done' ? tot + ' min planned' : 'Not started', () => this.goTo('plan')], ['2', 'Teach', 'ph ph-presentation-chart', taught, S.tEnd ? 'In progress · phase ' + ((S.tIdx || 0) + 1) : taught ? 'Done' : 'Starts ' + time.split(' ')[0], () => this.goTo('teach')], ['3', 'Exit ticket', 'ph ph-ticket', steps.exit === 'done', steps.exit === 'done' ? 'Feedback ready' : exDone ? exDone + ' of ' + here.length + ' marked' : 'After the lesson', () => this.goTo('exit')], ['4', 'Session log', 'ph ph-notebook', steps.log === 'done', steps.log === 'done' ? 'Filed' : 'Before you leave', () => this.goTo('log')]]
      .map(([n, t, icon, done, st, go]) => ({ n: 'Step ' + n, t, icon: done ? 'ph-fill ph-check-circle' : icon, ic: done ? '#1d6b30' : '#3a3a40', s: st, fg: done ? '#1d6b30' : '#6b6b72', bd: done ? '#cfe8d5' : '#e8e5dd', bg: done ? '#f3faf4' : '#fff', go }));
    o.nextAct = steps.plan !== 'done' ? { l: 'Plan today’s lesson', icon: 'ph ph-path', go: () => this.goTo('plan') } : !taught ? { l: S.tEnd ? 'Back to the lesson' : 'Start teaching', icon: 'ph ph-play', go: () => { if (!S.tEnd) set({ tIdx: 0, tEnd: Date.now() + mins[0] * 60000, tPaused: null }); this.goTo('teach'); } } : steps.exit !== 'done' ? { l: 'Mark exit tickets', icon: 'ph ph-ticket', go: () => this.goTo('exit') } : steps.log !== 'done' ? { l: 'File the session log', icon: 'ph ph-notebook', go: () => this.goTo('log') } : { l: 'All done · see analytics', icon: 'ph ph-chart-bar', go: () => this.goTo('analytics') };
    o.loopMeta = [steps.plan === 'done', taught, steps.exit === 'done', steps.log === 'done'].filter(Boolean).length + ' of 4 done';
    const low = L.filter(m => m.att !== null && m.att !== undefined && m.att < 80);
    const warn = (C.cls.loop || {}).warning || '';
    o.hasWarn = !!warn || low.length > 0; o.warnText = warn || (low.slice(0, 4).map(m => m.first).join(', ') + (low.length > 4 ? ' and ' + (low.length - 4) + ' more' : '') + (low.length === 1 ? ' has' : ' have') + ' attended under 80% this term. Worth a word with their mentors.');
    // plan
    o.goal = S.goal !== null ? S.goal : ((sess.plan || {}).aim || (C.cls.lesson ? 'Everyone can ' + C.cls.lesson.title.charAt(0).toLowerCase() + C.cls.lesson.title.slice(1) : ''));
    const planLater = () => this.later('plan', () => this.savePlan(), 1200);
    o.onGoal = e => { set({ goal: e.target.value }); planLater(); };
    o.phTot = tot + ' min'; o.phTotFg = tot > budget ? '#b0361c' : tot < budget - 5 ? '#7a5600' : '#1d6b30'; o.phBudgetL = 'of ' + budget + ' minutes';
    const carry = this.carryText(C); o.hasCarry = !!carry; o.carryText = carry;
    const setM = (i, v) => { set({ phM: { ...S.phM, [i]: Math.max(2, Math.min(40, v)) } }); planLater(); };
    o.phases = P.map((p, i) => ({ n: i + 1, t: p[1], icon: p[2], m: mins[i], why: p[4], ph: p[5], note: (S.phN || {})[i] || '', onNote: e => { set({ phN: { ...S.phN, [i]: e.target.value } }); planLater(); }, up: () => setM(i, mins[i] + 1), dn: () => setM(i, mins[i] - 1), isReview: p[0] === 'review', isHinge: p[0] === 'hinge', isGuided: p[0] === 'guided' }));
    const RETR = ((C.cls.questions || {}).retrieval || []).map(r => [(r.week ? 'Week ' + r.week : '') + (r.ago ? ' · ' + (r.ago === 1 ? 'last week' : r.ago + ' weeks ago') : ''), r.q]);
    const rIdx = S.rIdx || RETR.slice(0, 3).map((_, i) => i);
    o.retr = rIdx.filter(ri => RETR[ri]).map((ri, j) => ({ tag: RETR[ri][0], q: RETR[ri][1], swap: () => { if (RETR.length <= rIdx.length) return this.toast('No other questions from earlier weeks yet.'); let n = (ri + 1) % RETR.length; while (rIdx.includes(n)) n = (n + 1) % RETR.length; const nx = rIdx.slice(); nx[j] = n; set({ rIdx: nx }); } }));
    const H = this.hinge(C);
    o.hinge = H ? { q: H.q, optsText: H.opts.map(x => x[0] + ' ' + x[1]).join(' · ') } : { q: 'This week’s lesson has no multiple-choice check to use as a hinge question.', optsText: 'Add one to the lesson in Curriculum, or ask a quick show-of-hands question.' };
    o.pairText = this.pairText(C);
    o.resetPlan = () => set({ phM: {}, phN: {}, rIdx: null, goal: null });
    o.startTeach = () => { this.savePlan(); set({ tIdx: 0, tEnd: Date.now() + mins[0] * 60000, tPaused: null }); this.goTo('teach'); };
    // teach
    const ti = S.tIdx || 0, PH = P[ti];
    const remMs = S.tPaused ? S.tPaused : S.tEnd ? S.tEnd - Date.now() : mins[ti] * 60000;
    const over = remMs < 0, ab = Math.abs(Math.round(remMs / 1000));
    o.tSegs = mins.map((m, i) => ({ f: m, bg: i < ti ? '#1d6b30' : i === ti ? '#0b0b0c' : '#d6d4cc' }));
    o.tp = { n: ti + 1, of: mins.length, t: PH[1], cue: PH[4], note: (S.phN || {})[ti] || '', hasNote: !!((S.phN || {})[ti]), clock: (over ? '+' : '') + Math.floor(ab / 60) + ':' + String(ab % 60).padStart(2, '0'), clockFg: over ? '#f5b026' : '#fff', pIcon: S.tPaused ? 'ph ph-play' : 'ph ph-pause', pL: !S.tEnd ? 'Start' : S.tPaused ? 'Resume' : 'Pause', nextL: ti >= mins.length - 1 ? 'Finish · mark exit tickets' : 'Next: ' + P[ti + 1][1] };
    o.tPause = () => { if (!S.tEnd) return set({ tEnd: Date.now() + mins[ti] * 60000 }); if (S.tPaused) set({ tEnd: Date.now() + S.tPaused, tPaused: null }); else set({ tPaused: S.tEnd - Date.now() }); };
    o.tAdd = () => { if (S.tPaused) set({ tPaused: S.tPaused + 120000 }); else set({ tEnd: (S.tEnd || Date.now() + mins[ti] * 60000) + 120000 }); };
    o.tNext = () => this.nextPhase();
    const ccM = L.find(m => m.id === S.ccNow);
    o.ccName = ccM ? ccM.name : 'Ready when you are'; o.ccHas = !!ccM; o.ccPick = () => this.coldCall();
    const ccO = S.ccOut[S.ccNow];
    o.ccOut = [['well', 'Answered well', 'ph ph-thumbs-up', 'Answered a cold-call question well'], ['help', 'Needed help', 'ph ph-lifebuoy', 'Needed help with a cold-call question'], ['skip', 'Passed', 'ph ph-arrow-u-up-left', 'Passed on a cold-call question']].map(([k, l, icon, rem]) => ({ l, icon, on: ccO === k ? 'true' : 'false', ring: ccO === k ? '#0b0b0c' : '#d6d4cc', bg: ccO === k ? '#f4f4f2' : '#fff',
      go: () => { if (!ccM || ccO === k) return; const r0 = (this._remarksAll || {})[ccM.id] || []; set({ ccOut: { ...S.ccOut, [ccM.id]: k }, remarks: { ...(this._remarksAll || {}), [ccM.id]: r0.concat([rem]) } }); this.toast('Noted for ' + ccM.first + '’s session log', () => this.setState(st => { const co = { ...st.ccOut }; delete co[ccM.id]; return { ccOut: co, remarks: { ...st.remarks, [ccM.id]: r0 } }; })); } }));
    o.goRoll = () => this.goTo('roll');
    o.ccMeta = S.called.length + ' of ' + here.length + ' called';
    o.ccLater = () => { if (!ccM) return; set({ ccLater: S.ccLater.concat([ccM.id]), called: S.called.filter(id => id !== ccM.id), ccNow: null }); this.toast('You’ll come back to ' + ccM.first + ' soon'); };
    const srvT = ((sess.hinge || {}).tally) || []; const hq = S.hq || (H ? Object.fromEntries(H.opts.map((x, i) => [x[0], srvT[i] || 0])) : {});
    const hTot = H ? H.opts.reduce((n, x) => n + (hq[x[0]] || 0), 0) : 0; const hRight = H && H.right ? hq[H.right] || 0 : 0; const pct = hTot ? Math.round(hRight / hTot * 100) : 0;
    const topWrong = H ? H.opts.filter(x => x[0] !== H.right).sort((a, b) => (hq[b[0]] || 0) - (hq[a[0]] || 0))[0] : null;
    const saveHq = nh => { set({ hq: nh }); this.later('hinge', () => this.save({ action: 'classHinge', question: H.q, options: H.opts.map(x => x[1]), correct: H.right ? H.right.charCodeAt(0) - 65 : -1, tally: H.opts.map(x => nh[x[0]] || 0), trippedUp: topWrong && nh[topWrong[0]] ? topWrong[1] : '' }, 'Hinge tally'), 1200); };
    o.hq = H ? H.opts.map(([k, l]) => ({ k, l, n: hq[k] || 0, bd: hTot && k === H.right ? '#1d6b30' : '#e8e5dd', bg: hTot && k === H.right ? '#f3faf4' : '#fff', up: () => saveHq({ ...hq, [k]: (hq[k] || 0) + 1 }), dn: () => saveHq({ ...hq, [k]: Math.max(0, (hq[k] || 0) - 1) }) })) : [];
    o.hqMeta = hTot + ' of ' + here.length + ' answered'; o.hqHas = hTot > 0; o.hqPct = pct + '%';
    const missT = topWrong && hq[topWrong[0]] ? hq[topWrong[0]] + ' chose ' + topWrong[0] + ' (' + topWrong[1] + ').' : '';
    o.hqAdvice = !H || !H.right ? 'Tally the answers, then decide: move on if most got it.' : pct >= 80 ? 'Move on. Help the few who missed it during guided practice.' : pct >= 50 ? 'Re-explain with a second example, then ask a similar question. ' + missT : 'Stop and reteach the step before practice. ' + missT;
    o.hqBg = pct >= 80 ? '#f3faf4' : pct >= 50 ? '#fdf6e3' : '#fdeeea'; o.hqFg = pct >= 80 ? '#14501f' : pct >= 50 ? '#5c4100' : '#7a2410';
    // exit
    o.exitQ = (C.cls.questions || {}).exit || ((sess.exit || {}).question) || (o.goal ? 'Show me you can: ' + o.goal : 'One short task that shows whether today’s goal was met.');
    const LV = [['Got it', '#1d6b30', '#e9f6ec'], ['Partly', '#7a5600', '#fdf6e3'], ['Not yet', '#b0361c', '#fdeeea']];
    const cnt = [0, 1, 2].map(v => here.filter(m => ex[m.id] === v).length);
    const exLater = nx => { set({ ex: nx }); this.later('exit', () => this.save({ action: 'classExit', question: o.exitQ, results: this.exResults(nx), misconception: this.miscText(kit) }, 'Exit ticket marks'), 1200); };
    o.exSum = LV.map(([l, fg], i) => ({ l, fg, n: cnt[i] }));
    o.exMeta = exDone + ' of ' + here.length + ' marked';
    o.exRows = here.map(m => ({ name: m.name, initials: m.initials, opts: LV.map(([l, fg, bg], v) => { const on = ex[m.id] === v; return { l, on: on ? 'true' : 'false', ring: on ? fg : '#d6d4cc', bg: on ? bg : '#fff', fg: on ? fg : '#0b0b0c', pick: () => exLater({ ...ex, [m.id]: v }) }; }) }));
    o.exAllGot = () => { const n = { ...ex }; here.forEach(m => { if (n[m.id] === undefined) n[m.id] = 0; }); exLater(n); };
    const mc = S.mc || {};
    o.miscs = kit.misc.map(l => ({ l, on: mc[l] ? 'true' : 'false', ring: mc[l] ? '#0b0b0c' : '#d6d4cc', bw: mc[l] ? '2px' : '1px', pick: () => set({ mc: { ...mc, [l]: !mc[l] } }) }));
    o.hqHint = !!(H && topWrong && hq[topWrong[0]]); o.hqHintT = o.hqHint ? 'From the hinge check: ' + missT : '';
    const notYet = here.filter(m => ex[m.id] === 2), partly = here.filter(m => ex[m.id] === 1);
    const misc = kit.misc.filter(l => mc[l]);
    o.wcf = [['Well done', cnt[0] ? cnt[0] + ' of ' + here.length + ' showed it.' : 'Mark some tickets first.'], ['Fix together', misc.length ? misc.join('; ') + '.' : 'Choose what tripped them up.'], ['Next Saturday', notYet.length || partly.length ? 'Start with a 5-minute reteach for ' + notYet.concat(partly).map(m => m.first).join(', ') + ', while the others start the stretch task.' : 'Everyone is ready. Go straight to ' + (course.week ? 'week ' + (course.week + 1) : 'the next lesson') + '.']].map(([k, t]) => ({ k, t }));
    this._wcf = o.wcf;
    const exOk = exDone === here.length && here.length > 0;
    o.exOp = exOk ? 1 : 0.4; o.exSaveL = steps.exit === 'done' ? 'Saved · feeds next week’s plan' : exOk ? 'Save and add to next week’s plan' : 'Mark every student to save (' + exDone + ' of ' + here.length + ')';
    o.exSave = () => { if (!exOk) return this.toast('Mark every student first. “Mark the rest Got it” is quickest.');
      this.save({ action: 'classExit', question: o.exitQ, results: this.exResults(ex), misconception: this.miscText(kit), feedback: this._wcf.map(w => w.k + ': ' + w.t).join('\n'), done: true }, 'Save the exit ticket', 'Saved. Next week’s plan starts with who didn’t get it.').then(r => { if (r && !r.queued) this.refreshClass(); }); };
    return o;
  }
  exMarks(C) { if (this.state.exTouched || Object.keys(this.state.ex).length) return this.state.ex; const r = ((C.cls.session || {}).exit || {}).results || {}; const out = {}; Object.keys(r).forEach(k => { const i = IP6_EXIT.indexOf(r[k]); if (i >= 0) out[k] = i; }); return out; }
  exResults(ex) { const out = {}; Object.keys(ex).forEach(k => { out[k] = IP6_EXIT[ex[k]]; }); return out; }
  miscText(kit) { const mc = this.state.mc || {}; return kit.misc.filter(l => mc[l]).join('; '); }

  anaVals() {
    const { C, D, S, set, L, lvlOf, selM } = this._ctx; const o = {};
    const weeks = ((C.hist.weeks) || []).filter(w => w.closed);
    o.anaRanges = [['term', 'This term'], ['4w', 'Last 4 weeks']].map(([id, l]) => ({ l, on: S.anaRange === id, bg: S.anaRange === id ? '#fff' : 'transparent', sh: S.anaRange === id ? '0 1px 2px rgba(11,11,12,.1)' : 'none', pick: () => set({ anaRange: id }) }));
    const wk = S.anaRange === '4w' ? weeks.slice(-4) : weeks;
    const totHere = wk.reduce((n, w) => n + w.here, 0), totAll = wk.reduce((n, w) => n + w.here + w.away, 0);
    const ups = L.reduce((n, m) => n + m.sk.filter((v, k) => v !== null && m.prev[k] !== null && lvlOf(m, k) > m.prev[k]).length, 0);
    const ex = wk.reduce((a, w) => ({ got: a.got + w.exit.got, all: a.all + w.exit.got + w.exit.partly + w.exit.not }), { got: 0, all: 0 });
    const stalled = L.filter(m => m.exitGot !== null && m.exitGot !== undefined && m.exitGot < 50), atRisk = L.filter(m => m.att !== null && m.att !== undefined && m.att < 80);
    const stretch = L.filter(m => C.skills.filter((_, k) => lvlOf(m, k) === 3).length >= 3);
    o.kpis = [['Attendance', totAll ? Math.round(totHere / totAll * 100) + '%' : '—', S.anaRange === '4w' ? 'last 4 Saturdays' : wk.length + ' Saturdays with a closed roll'], ['Skill moves up', String(ups), 'across ' + C.skills.length + ' skills'], ['Exit tickets', ex.all ? Math.round(ex.got / ex.all * 100) + '%' : '—', 'got it, first time'], ['Need support', String(new Set(stalled.concat(atRisk).map(m => m.id)).size), 'low attendance or exit tickets']].map(([k, v, d]) => ({ k, v, d }));
    o.attBars = wk.map(w => { const n = w.here, mx = Math.max(1, w.here + w.away); return { w: ip6Date(w.date), n, h: Math.round(n / mx * 100) + '%', lbl: n + ' of ' + mx + ' on ' + ip6Date(w.date) }; });
    o.skillAvg = C.short.map((t, k) => { const vs = L.map(m => lvlOf(m, k)).filter(v => v !== null && v !== undefined); const a = vs.length ? vs.reduce((n, v) => n + v, 0) / vs.length : 0; const up = L.filter(m => m.prev[k] !== null && lvlOf(m, k) !== null && lvlOf(m, k) > m.prev[k]).length;
      return { t, a: vs.length ? a.toFixed(1) : '—', w: Math.round(a / 3 * 100) + '%', up, hasUp: up > 0, dist: [0, 1, 2, 3].map(l => ({ bg: IP6_LVCOL[l], w: L.length ? Math.round(vs.filter(v => v === l).length / L.length * 100) + '%' : '0%' }))
        // Out of the whole class, not of those marked: one child marked is not a full bar. The rest is "not marked yet".
        .concat(L.length > vs.length ? [{ bg: '#e6e5e0', w: Math.round((L.length - vs.length) / L.length * 100) + '%' }] : []) }; });
    o.heat = L.map(m => ({ name: m.first, open: () => this.goTo('student', { sel: m.id, stTab: 'overview' }), att: m.att !== null && m.att !== undefined ? m.att + '%' : '—', attFg: m.att !== null && m.att < 80 ? '#b0361c' : '#4a4a50',
      cells: C.skills.map((_, k) => { const v = lvlOf(m, k); const has = v !== null && v !== undefined; return { bg: has ? IP6_LVCOL[v] : '#e6e5e0', fg: v === 3 ? '#fff' : '#0b0b0c', t: has ? IP6_LEVELS[v][0] : '·', tip: C.short[k] + ': ' + (has ? IP6_LEVELS[v] : 'not marked'), up: has && m.prev[k] !== null && v > m.prev[k] }; }) }));
    o.heatHead = C.short.map(t => ({ t }));
    const lst = (arr, why) => arr.map(m => ({ name: m.name, initials: m.initials, why: why(m), open: () => this.goTo('student', { sel: m.id, stTab: 'overview' }) }));
    o.watch = lst(atRisk, m => 'Attended ' + m.att + '% this term').concat(lst(stalled.filter(m => !atRisk.includes(m)), m => 'Got ' + m.exitGot + '% of exit tickets first time'));
    o.stretch = lst(stretch, m => C.skills.filter((_, k) => lvlOf(m, k) === 3).length + ' skills at can teach it · could co-teach');
    o.hasWatch = o.watch.length > 0; o.hasStretch = o.stretch.length > 0;
    // one student
    const sd = D['stu:' + selM.id] || null;
    o.stTabs = [['overview', 'Overview'], ['skills', 'Skills'], ['work', 'Work'], ['attendance', 'Attendance'], ['remarks', 'Remarks']].map(([id, l]) => ({ l, on: S.stTab === id, ring: S.stTab === id ? '#0b0b0c' : 'transparent', fw: S.stTab === id ? 600 : 500, pick: () => set({ stTab: id }) }));
    ['overview', 'skills', 'work', 'attendance', 'remarks'].forEach(t => { o['st_' + t] = S.stTab === t; });
    const vs = selM.sk.map((v, k) => lvlOf(selM, k)).filter(v => v !== null && v !== undefined); const avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    const upN = selM.sk.filter((v, k) => v !== null && selM.prev[k] !== null && lvlOf(selM, k) > selM.prev[k]).length;
    o.stK = [['Attendance', selM.att !== null && selM.att !== undefined ? selM.att + '%' : '—'], ['Skills up', upN + ' of ' + C.skills.length], ['Average level', avg === null ? 'Not marked' : IP6_LEVELS[Math.round(avg)]], ['Exit tickets', selM.exitGot !== null && selM.exitGot !== undefined ? selM.exitGot + '% got it' : '—']].map(([k, v]) => ({ k, v }));
    const order = C.skills.map((_, k) => k).filter(k => lvlOf(selM, k) !== null && lvlOf(selM, k) !== undefined).sort((a, b) => lvlOf(selM, b) - lvlOf(selM, a));
    o.stStrong = order.length ? C.short[order[0]] + ' (' + IP6_LEVELS[lvlOf(selM, order[0])].toLowerCase() + ')' : 'Not marked yet'; o.stNext = order.length ? C.short[order[order.length - 1]] + ' (' + IP6_LEVELS[lvlOf(selM, order[order.length - 1])].toLowerCase() + ')' : 'Mark the skills board first';
    o.stHistL = 'Before and now';
    o.stHist = C.skills.map((t, k) => { const now = lvlOf(selM, k), p = selM.prev[k]; return { t, now: now === null || now === undefined ? 'Not marked' : IP6_LEVELS[now], bars: [p, now].map((v, w) => ({ h: v === null || v === undefined ? '6%' : Math.round((v + 1) / 4 * 100) + '%', bg: v === null || v === undefined ? '#e6e5e0' : IP6_LVCOL[v], tip: (w ? 'Now: ' : 'Before: ') + (v === null || v === undefined ? 'not marked' : IP6_LEVELS[v]) })) }; });
    const tl = (sd && sd.timeline) || [];
    o.stWork = tl.filter(x => x.exit).map(x => ({ w: ip6Date(x.date), t: 'Exit ticket', s: x.exit === 'got' ? 'Got it' : x.exit === 'partly' ? 'Partly' : 'Not yet', fg: x.exit === 'got' ? '#1d6b30' : x.exit === 'partly' ? '#7a5600' : '#b0361c', w100: x.exit === 'got' ? '100%' : x.exit === 'partly' ? '50%' : '15%' }));
    o.stAtt = ((sd && sd.attendance) || []).map(a => ({ d: ip6Date(a.date, { weekday: 'short', day: 'numeric', month: 'short' }), st: a.status === 'late' ? 'Late' : 'Present', bg: a.status === 'late' ? '#e0a100' : '#2f9e44', fg: a.status === 'late' ? '#7a5600' : '#1d6b30', inT: a.method === 'instructor' ? 'By roll' : a.method === 'mentor' ? 'By mentor' : 'At the gate' }));
    o.stRemHist = ((this._remarksAll || {})[selM.id] || []).map(t => ({ d: 'Today', t })).concat(((sd && sd.remarks) || []).map(r => ({ d: ip6Date(r.createdAt), t: r.body })));
    const sm = S.sumText[selM.id];
    o.sumIdle = !sm; o.sumBusy = false; o.sumHas = !!sm; o.sumText = sm || '';
    /* "Summarise for the mentor", drafted from the record: the strongest and weakest skills, attendance, exit tickets. */
    o.runSum = () => { const t = selM.first + (upN ? ' moved up in ' + upN + ' skill' + (upN === 1 ? '' : 's') + ' this term' : ' has held steady this term') + (order.length ? '; strongest at ' + C.short[order[0]].toLowerCase() : '') + (selM.att !== null && selM.att !== undefined ? ', attendance ' + selM.att + '%' : '') + '. ' + (order.length > 1 ? 'Next to support: ' + C.short[order[order.length - 1]].toLowerCase() + '.' : 'Next: mark the skills board so there is something to build on.');
      set({ sumText: { ...S.sumText, [selM.id]: t } }); };
    o.sendSum = () => { const t = S.sumText[selM.id]; if (!t) return; NGGApi.member.remarkAdd(selM.id, 'progress', t).then(() => this.toast('Sent to ' + (selM.mentor || 'their mentor') + ' as a note on ' + selM.first + '’s record')).catch(e => this.toast(ip6Err(e))); };
    return o;
  }

  cmNeedRows() { const cm = this.state.d.comm || {}; const posts = cm.posts || []; const cut = Date.now() - 14 * 86400000;
    return posts.filter(p => !(p.author || {}).staff && !(p.author || {}).isMe && !p.commentCount && new Date(p.createdAt).getTime() > cut); }
  cmVals() {
    const { C, D, S, set, L, isHere } = this._ctx; const cm = D.comm || {}; const ch = cm.channel; const hw = cm.hw;
    const base = (window.NGG_COMMUNITY_URL || '/community') + (ch ? '/' + ch.slug : '');
    const need = this.cmNeedRows();
    const out = hw && hw.outstanding ? hw.outstanding : [];
    return {
      cmMeta: ch ? L.length + ' students · their mentors can read' : 'There is no channel for ' + (C.cls.course || 'this course') + ' yet',
      cmUrl: base, cmCompose: [['New post', 'ph ph-megaphone-simple', 'post'], ['Set homework', 'ph ph-house-line', 'homework'], ['Start a poll', 'ph ph-chart-bar-horizontal', 'poll']].map(([l, icon, k]) => ({ l, icon, url: base + '?compose=' + k })),
      cmNeed: need.map(p => ({ who: (p.author || {}).name || 'A member', ini: ip6Ini((p.author || {}).name), kind: /\?\s*$/.test(p.body || '') ? 'Question' : 'Shared work, no feedback yet', body: p.body, cta: /\?\s*$/.test(p.body || '') ? 'Reply' : 'Give feedback', url: base + '?post=' + encodeURIComponent(p.postId) })),
      cmNeedMeta: 'Posts from your class in the last two weeks with no reply yet', cmNeedNone: need.length === 0,
      hwHas: !!hw, hw: hw ? { t: hw.title, due: ip6Date(hw.dueAt, { weekday: 'short', day: 'numeric', month: 'short' }), n: (hw.submitted || []).length, of: (hw.submitted || []).length + out.length, pct: Math.round((hw.submitted || []).length / Math.max(1, (hw.submitted || []).length + out.length) * 100) + '%',
        missing: out.map(x => ip6First(x.name)), hasMissing: out.length > 0,
        nudgeL: !hw.nudgeableNow ? (out.length ? 'Nudged today' : 'Everyone has handed in') : 'Nudge the ' + hw.nudgeableNow + ' who haven’t', nOp: hw.nudgeableNow ? 1 : 0.5,
        nudge: () => { if (!hw.nudgeableNow) return; NGGApi.member.community.homeworkNudge(hw.homeworkId, '', true).then(r => { this.toast('Reminder sent to ' + ((r && r.nudged) || hw.nudgeableNow) + ' students. One nudge per child per day.'); this.loadAll(); }).catch(e => this.toast(ip6Err(e))); },
        review: () => { window.location.href = base + '?homework=' + encodeURIComponent(hw.homeworkId); }, url: base + '?homework=' + encodeURIComponent(hw.homeworkId) } : { missing: [] },
      shareWcfL: S.wcfShared ? (ch ? 'Posted to #' + ch.slug : 'Posted') : (ch ? 'Post to #' + ch.slug : 'No course channel yet'),
      shareWcf: () => { if (S.wcfShared || !ch) return; NGGApi.member.community.post({ channel: ch.slug, kind: 'post', body: 'Feedback from Saturday’s exit ticket\n' + (this._wcf || []).map(w => w.k + ': ' + w.t).join('\n') })
        .then(() => { set({ wcfShared: true }); this.toast('Whole-class feedback posted in #' + ch.slug + '.'); }).catch(e => this.toast(ip6Err(e))); },
    };
  }

  rwVals() {
    const { C, S, set } = this._ctx; const o = {};
    const q = S.queue || []; const net = !S.online ? 'offline' : q.length ? 'flaky' : 'online';
    const NET = { offline: ['ph ph-wifi-slash', '#fdeeea', '#f3cfc5', '#7a2410', 'You’re offline. Keep working: marks, roll and notes save on this phone and send automatically.'], flaky: ['ph ph-cloud-arrow-up', '#fdf6e3', '#f1e3b8', '#5c4100', q.length + ' change' + (q.length === 1 ? '' : 's') + ' waiting to send. They retry on their own.'] };
    const nb = NET[net];
    o.rw = { netBar: !!nb, netIcon: nb ? nb[0] : '', netBg: nb ? nb[1] : '', netBd: nb ? nb[2] : '', netFg: nb ? nb[3] : '', netT: nb ? nb[4] : '',
      hasQueue: q.length > 0, queue: q, queueL: q.length + ' waiting', queueOpen: !!S.qOpen && q.length > 0, queueOpenA: S.qOpen ? 'true' : 'false', toggleQueue: () => set({ qOpen: !S.qOpen }),
      retry: () => { if (!S.online) return this.toast('Still offline. We’ll keep trying.'); if (window.outbox) window.outbox.flush(); this.loadAll(); this.toast(q.length ? 'Sending ' + q.length + ' change' + (q.length === 1 ? '' : 's') + '…' : 'Reloaded'); },
      roBar: false, roT: '', sessOn: false, stay: () => {}, signOut: () => {} };
    const AN = ['Needs step-by-step help to do this.', 'Does it with a prompt or an example to copy. Some slips.', 'Does it alone and correctly, more than once.', 'Explains it to a classmate and spots their mistakes.'];
    o.skAnchors = IP6_LEVELS.map((l, i) => ({ l, d: AN[i], bg: IP6_LVBG[i], fg: IP6_LVFG[i] }));
    o.skAnchOpen = S.anch !== false; o.skAnchA = o.skAnchOpen ? 'true' : 'false'; o.skAnchChev = o.skAnchOpen ? 'ph ph-caret-up' : 'ph ph-caret-down'; o.toggleAnch = () => set({ anch: S.anch === false });
    return o;
  }

  /* Evidence for a move up: the design's rule, and the server's (evidence_required). */
  resVals() {
    const { C, D, S, set } = this._ctx; const o = {};
    // the skills rows with their evidence field (wraps screenVals' rows)
    const res = D.res || {}; const rows2 = res.rows || [];
    const F = [['all', 'All'], ['attn', 'Needs attention'], ['missing', 'Not uploaded'], ['up', 'Improving']];
    const fk = S.rsF || 'all', qq = (S.rsQ || '').trim().toLowerCase();
    const counts = res.counts || {};
    const list = rows2.filter(x => fk === 'all' || (fk === 'attn' ? x.attention : fk === 'missing' ? !x.uploaded : x.uploaded && (x.change || 0) > 0)).filter(x => !qq || x.name.toLowerCase().includes(qq));
    const sgn = n => n === null || n === undefined ? '' : (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
    const k = res.kpis || {};
    o.rsK = [['Uploaded', (k.uploaded || 0) + ' of ' + (k.class || 0), res.dueOn ? 'Due ' + ip6Date(res.dueOn, { weekday: 'long', day: 'numeric', month: 'long' }) : res.termLabel || ''], ['Needs attention', k.attention || 0, 'Low, falling or off-plan'], ['Not uploaded', k.missing || 0, 'A reminder goes to them and the family'], ['Class change', k.avgChange === null || k.avgChange === undefined ? '—' : sgn(k.avgChange), 'on last term, average']].map(([l, v, s2]) => ({ l, v: String(v), s: s2 }));
    o.rsQ = S.rsQ || ''; o.rsOnQ = e => set({ rsQ: e.target.value });
    o.rsF = F.map(([key, l]) => ({ l, n: key === 'all' ? counts.all || 0 : key === 'attn' ? counts.attn || 0 : key === 'missing' ? counts.missing || 0 : counts.up || 0, on: fk === key ? 'true' : 'false', ring: fk === key ? '#0b0b0c' : '#d6d4cc', bw: fk === key ? '2px' : '1px', pick: () => set({ rsF: key }) }));
    o.rsRows = list.map(x => { const open = S.rsOpen === x.studentId; const det = D['res:' + x.studentId]; const rec = det && det.record; const m = (C.L.find(z => z.id === x.studentId) || {});
      const subsList = rec && rec.subjects ? rec.subjects : [];
      return { name: x.name, first: ip6First(x.name), initials: ip6Ini(x.name), mentor: m.mentor || 'the mentor', up: x.uploaded, missing: !x.uploaded, isOpen: open, exp: open ? 'true' : 'false', chev: open ? 'ph ph-caret-up' : 'ph ph-caret-down', bg: open ? '#fcfcfb' : '#fff',
        toggle: () => { set({ rsOpen: open ? null : x.studentId }); if (!open && !det) this.load('res:' + x.studentId, () => ip6Api.result(x.studentId, res.term)); },
        avgT: x.uploaded && x.avg !== null ? x.avg + '%' : '—', dT: x.uploaded && x.change !== null ? sgn(x.change) + ' on last term' : '', dFg: (x.change || 0) >= 0 ? '#1d6b30' : '#b0361c',
        stT: !x.uploaded ? (x.status === 'in_progress' ? 'Started, not sent' : 'Not uploaded') : x.attention ? (x.adherence !== null && x.adherence < 50 ? 'Off plan · ' + x.adherence + '% of sessions' : 'Needs attention') : x.status === 'live' ? 'On plan' + (x.adherence !== null ? ' · ' + x.adherence + '% of sessions' : '') : 'Plan waiting for the mentor',
        stFg: !x.uploaded ? '#6b6b72' : x.attention ? '#b0361c' : '#1d6b30', stIcon: !x.uploaded ? 'ph ph-clock' : x.attention ? 'ph ph-warning-circle' : 'ph ph-check-circle',
        subs: subsList.map(z => ({ s: z.subject || z.name, sc: z.score, dT: z.change !== null && z.change !== undefined ? sgn(z.change) : '', dFg: (z.change || 0) >= 0 ? '#1d6b30' : '#b0361c', bd: z.score < 50 ? '#f3cfc5' : '#e8e5dd' })),
        summary: rec && rec.plan && rec.plan.summary ? rec.plan.summary : open && !det ? 'Loading…' : x.uploaded ? 'Average ' + x.avg + '%.' : 'Not uploaded yet for ' + (res.termLabel || 'this term') + '.',
        plan: rec && rec.plan && rec.plan.items ? rec.plan.items.map(it => ({ s: it.subject + (it.target ? ' · target ' + it.target + '%' : ''), method: it.method || '', what: it.what || it.text || '', when: it.when || '', w: (it.adherence || 0) + '%', adhT: (it.adherence || 0) + '% of sessions done', barBg: (it.adherence || 0) >= 70 ? '#1d6b30' : (it.adherence || 0) >= 50 ? '#e0a100' : '#b0361c' })) : [],
        noteV: S.rsNote[x.studentId] || '', onNote: e => set({ rsNote: { ...S.rsNote, [x.studentId]: e.target.value } }),
        sendNote: () => { const t = (S.rsNote[x.studentId] || '').trim(); if (!t) return this.toast('Write a note first.'); NGGApi.member.resultNote(x.studentId, res.term, t).then(() => { set({ rsNote: { ...S.rsNote, [x.studentId]: '' } }); this.toast('Note sent to ' + (m.mentor || 'the mentor') + ' and added to ' + ip6First(x.name) + '’s plan.'); }).catch(e => this.toast(ip6Err(e))); },
        acked: !!(S.rsAck[x.studentId] || x.seen), ackOp: S.rsAck[x.studentId] || x.seen ? 0.6 : 1, ackL: S.rsAck[x.studentId] || x.seen ? 'Seen' : 'Mark as seen',
        ack: () => { if (S.rsAck[x.studentId] || x.seen) return; NGGApi.member.resultSeen(x.studentId, res.term).then(() => set({ rsAck: { ...S.rsAck, [x.studentId]: true } })).catch(e => this.toast(ip6Err(e))); },
        nudge: () => NGGApi.member.resultRemind(x.studentId, res.term).then(() => this.toast('Reminder sent to ' + ip6First(x.name) + ' and the family.')).catch(e => this.toast(ip6Err(e))),
        audit: ((det && det.history) || []).slice(0, 6).map(h => ({ when: ip6Date(h.at, { weekday: 'short' }), who: h.who, what: h.what })) }; });
    o.rsLoading = !!S.ld.res && !D.res; o.rsErr = !!S.er.res; o.rsErrT = 'Check the connection and try again.'; o.rsSkel = ['55%', '42%', '60%', '48%', '52%', '38%'].map(w => ({ w }));
    o.rsNone = !!D.res && list.length === 0; o.rsMore = res.nextCursor !== null && res.nextCursor !== undefined; o.rsMoreL = 'Show more';
    o.rsShowMore = () => ip6Api.results(Object.assign({ filter: 'all', cursor: res.nextCursor }, this.slotArgs())).then(r => this.setState(s => ({ d: { ...s.d, res: { ...r, rows: (s.d.res.rows || []).concat(r.rows || []) } } }))).catch(e => this.toast(ip6Err(e)));
    return o;
  }

  render() {
    const v = this.renderVals();
    /* The skills rows carry their evidence field: a move up needs a line of what you saw. */
    const { S, set } = this._ctx; const ev = S.ev || {}; const skI = Math.max(0, (v.skN || 1) - 1); const key = r => r.id + '_' + skI;
    /* The server's rule: moving a child UP from the level on record needs a line of evidence. */
    const movesUp = r => S.marks[key(r)] !== undefined && r.sk[skI] !== null && r.sk[skI] !== undefined && S.marks[key(r)] > r.sk[skI];
    v.skRows = (v.skRows || []).map(r => ({ ...r, evOn: movesUp(r), evV: ev[key(r)] || '', evBd: S.skTried && movesUp(r) && !(ev[key(r)] || '').trim() ? '#b0361c' : '#d6d4cc', evPh: 'What did you see ' + (r.first || r.name) + ' do?', onEv: e => set({ ev: { ...(this.state.ev || {}), [key(r)]: e.target.value } }) }));
    const saveSk = v.skSave; const missing = v.skRows.filter(r => r.evOn && !(ev[key(r)] || '').trim());
    v.skSave = () => { if (missing.length) { set({ skTried: true }); return this.toast('Add what you saw for ' + missing.length + (missing.length > 1 ? ' students' : ' student') + ' who moved up.'); } set({ skTried: false }); saveSk(); };
    /* First visit: a short tour. Any visit with something due: the duty reminder,
       whose buttons open the screen that does it. */
    const dutyGo = d => { const k = String(d.key || '').replace(/^instructor:/, '');
      const scr = /^log-/.test(k) ? 'log' : k === 'marking' ? 'marking' : /^results/.test(k) ? 'results' : /^(plan|carry)/.test(k) ? 'plan' : k === 'safeguarding' ? 'students' : 'today';
      this.goTop(scr); return true; };
    return <>{Ip6View(v)}{typeof GuideTour === 'function' && <GuideTour portal="instructor"/>}{typeof DutyPopup === 'function' && <DutyPopup role="instructor" onGo={dutyGo}/>}</>;
  }
}

/* /instructor: one address per programme, like /mentor.
     /instructor/ngg     the NGG Club class (this portal)
     /instructor/summer  a Summer School track (the class portal, Summer only)
   /instructor sends someone who teaches one programme straight there, and
   offers the choice to anyone who teaches both. */
function ip6Sub() { const p = (location.pathname || '').replace(/^\/+|\/+$/g, '').split('/'); return p[0] === 'instructor' && ['ngg', 'summer'].includes(p[1]) ? p[1] : ''; }
function InstructorHome() {
  const [sub, setSub] = React.useState(ip6Sub);
  const [st, setSt] = React.useState({ state: 'loading', ngg: false, summer: false });
  const auth = (window.useAuth || (() => null))();
  const probe = React.useCallback(() => {
    /* An instructor whose check isn't recorded yet still gets this portal: the
       Academy and Curriculum are theirs now, and the class says plainly why it's empty. */
    Promise.all([NGGApi.member.teachToday({}).then(() => true).catch(e => (e && (e.code === 'unauthorized')) ? 'auth' : (e && e.code === 'not_cleared') ? true : false),
                 NGGApi.member.mentorRoster('', '', 'summer').then(() => true).catch(() => false)])
      .then(([n, s]) => setSt({ state: n === 'auth' ? 'auth' : 'ready', ngg: n === true, summer: s === true }));
  }, []);
  React.useEffect(() => { probe(); }, [probe]);
  React.useEffect(() => { if (auth && auth.isSignedIn && st.state === 'auth') probe(); }, [auth && auth.isSignedIn]);
  React.useEffect(() => { const f = () => setSub(ip6Sub()); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);
  const go = to => { try { history.pushState({ page: 'instructor' }, '', '/instructor' + (to ? '/' + to : '')); } catch (_) {} setSub(to); try { window.scrollTo(0, 0); } catch (_) {} };
  React.useEffect(() => { if (st.state !== 'ready' || sub) return; const one = st.ngg && !st.summer ? 'ngg' : st.summer && !st.ngg ? 'summer' : ''; if (one) { try { history.replaceState({ page: 'instructor' }, '', '/instructor/' + one); } catch (_) {} setSub(one); } }, [st, sub]);
  if (st.state === 'loading' && sub !== 'summer') return <div className="m15x-boot" role="status" aria-live="polite"><img src="/assets/logo.png" alt="" width="40" height="40"/><span className="m15x-bar"/><span className="m15x-sr">Loading the instructor portal</span></div>;
  const hub = st.ngg && st.summer;
  if (sub === 'summer') return <>{hub && <button type="button" className="m15x-back" onClick={() => go('')}><i className="ph ph-squares-four" aria-hidden="true"/>Instructor portals</button>}<MentorPortal key="i-summer" programme="summer"/></>;
  /* Not signed in, not cleared, or teaching nothing: the class portal owns those answers and its sign-in doors. */
  if (st.state !== 'ready' || (!st.ngg && !st.summer)) return <MentorPortal key="i-any"/>;
  if (sub === 'ngg' || (!hub && st.ngg)) return st.ngg ? <Ip6Portal onSummer={st.summer ? () => go('summer') : null}/> : <MentorPortal key="i-any2"/>;
  return <div className="m15x-hub"><div className="m15x-hub-in"><img src="/assets/logo.png" alt="" width="40" height="40"/><h1>Which class?</h1>
    <p>You teach in both programmes. NGG and Summer School are separate, so each has its own portal and its own class.</p>
    <ul className="m15x-cards">
      <li><a href="/instructor/ngg" onClick={e => { e.preventDefault(); go('ngg'); }}><i className="ph ph-chalkboard-teacher" aria-hidden="true"/><span><b>NGG Club class</b><span>Roll, plan, teach, exit ticket, log, skills, marking and school results.</span></span><i className="ph ph-caret-right" aria-hidden="true"/></a></li>
      <li><a href="/instructor/summer" onClick={e => { e.preventDefault(); go('summer'); }}><i className="ph ph-sun" aria-hidden="true"/><span><b>Summer School</b><span>This edition’s participants on your track.</span></span><i className="ph ph-caret-right" aria-hidden="true"/></a></li>
    </ul></div></div>;
}

/* ── The Instructor Academy ─────────────────────────────────────────────────
   "Start here: using the portal" — one short guide per area, naming the right
   tool for each job — then the teaching and safeguarding modules. A module is
   lessons, an optional "what would you do?" (which shows its answer: it
   teaches), and questions whose key stays on the server; the score comes back
   when the module is finished. Until "Start here" is passed, this is the
   portal (Ip6Portal.oriLocked). */
function Ip6Academy({ data, err, reload, toast }) {
  const [mod, setMod] = React.useState(null);
  const [step, setStep] = React.useState(0);
  const [ans, setAns] = React.useState({});
  const [res, setRes] = React.useState(null);
  const topRef = React.useRef(null);
  const today = new Date().toISOString().slice(0, 10);
  const done = m => !!m.passedAt && !(m.renewBy && m.renewBy < today);
  React.useEffect(() => { if (topRef.current) { topRef.current.focus(); } }, [mod, step]);
  if (err) return <div className="m15x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>The Academy couldn’t load ({(err.code || err.message || 'error')}).</span><button type="button" onClick={reload}>Retry</button></div>;
  if (!data) return <div className="m15x-load" role="status" aria-live="polite"><span className="m15x-bar"/><span className="m15x-sr">Loading the Academy</span></div>;
  const mods = data.modules || []; const ori = data.orientation || { ok: true };
  const m = mods.find(x => x.id === mod);
  if (!m) {
    const n = mods.filter(done).length;
    return (
      <div className="ip6a">
        {!ori.ok && <section className="ip6a-lock" role="note" aria-labelledby="ip6a-lock-h"><i className="ph-fill ph-graduation-cap" aria-hidden="true"/>
          <div><h2 id="ip6a-lock-h">Start here: {ori.done} of {ori.required} portal guides done</h2>
            <p>Before your portal opens, take the short guides under “Start here: using the portal” (about {ori.mins} minutes in all). Each shows you the right tool for one part of the job — Today, the roll and the plan, teaching and the exit ticket, the session log, marking and skills, your students, and what to do when you’re worried about a child. Support and Report a concern work the whole time.</p></div></section>}
        <section className="ip6a-card ip6a-prog" aria-label="Your progress"><div><b>{n} of {mods.length} modules complete</b><span>{Math.round(n / Math.max(1, mods.length) * 100)}%</span></div>
          <div className="ip6a-bar"><span style={{ width: (n / Math.max(1, mods.length) * 100) + '%' }}/></div></section>
        {(data.groups || []).map((h, gi) => (
          <section key={gi} className="ip6a-card" aria-labelledby={'ip6a-g' + gi}><h2 id={'ip6a-g' + gi} className="ip6a-h">{h}</h2>
            <ul className="ip6a-list">{mods.filter(x => x.group === gi).map(x => { const d = done(x), lapsed = !!x.passedAt && !d;
              return <li key={x.id}><i className={d ? 'ph-fill ph-check-circle is-done' : 'ph ph-circle'} aria-hidden="true"/>
                <span className="ip6a-t"><b>{x.title}</b><span>{d ? 'Passed ' + x.score + '%' + (x.renewBy ? ' · renew by ' + ip6Date(x.renewBy, { day: 'numeric', month: 'short', year: 'numeric' }) : '') : (lapsed ? 'Needs renewing · ' : '') + x.mins + ' min' + (x.orientation ? ' · opens your portal' : x.required ? ' · required' : '') + (x.note && !x.orientation ? ' · ' + x.note : '')}</span></span>
                <button type="button" className={'ip6a-btn' + (d ? '' : ' is-primary')} onClick={() => { setMod(x.id); setStep(0); setAns({}); setRes(null); }}>{d ? 'Review' : lapsed ? 'Renew' : 'Start'}<span className="m15x-sr"> {x.title}</span></button></li>; })}</ul></section>
        ))}
      </div>
    );
  }
  const steps = (m.lessons || []).map(l => ({ k: 'lesson', h: l.h, b: l.body }));
  if (m.scenario) steps.push({ k: 'scen', h: m.scenario.situation, opts: m.scenario.options.map(o => o.text), right: m.scenario.options.map(o => !!o.right), why: m.scenario.options.map(o => o.why) });
  (m.quiz || []).forEach(q => steps.push({ k: 'quiz', h: q.q, opts: q.options }));
  steps.push({ k: 'result' });
  const i = Math.min(step, steps.length - 1), st = steps[i], a = ans[i];
  const qIdx = steps.map((s, j) => s.k === 'quiz' ? j : -1).filter(j => j >= 0);
  const choice = st.k === 'scen' || st.k === 'quiz', answered = a !== undefined;
  const pass = !!(res && res.passed), pending = !!(res && res.pending);
  const to = n => {
    if (steps[n] && steps[n].k === 'result') {
      setRes({ pending: true });
      const wasLocked = !ori.ok;
      NGGApi.member.teachAcademyResult(m.id, qIdx.map(j => ans[j])).then(r => { setRes(r); if (r.passed) { reload(); if (wasLocked && r.orientation && r.orientation.ok) toast('“Start here” is done. Your whole portal is open.'); } })
        .catch(e => setRes({ error: ip6Err(e) }));
    }
    setStep(n);
  };
  return (
    <div className="ip6a">
      <button type="button" className="ip6a-back" onClick={() => setMod(null)}><i className="ph ph-arrow-left" aria-hidden="true"/>Academy</button>
      <section className="ip6a-card ip6a-player" aria-labelledby="ip6a-mh">
        <div className="ip6a-meta"><span>{st.k === 'result' ? 'Finished' : 'Step ' + (i + 1) + ' of ' + (steps.length - 1)}</span><span>{m.mins} min</span></div>
        <div className="ip6a-bar"><span style={{ width: (i / Math.max(1, steps.length - 1) * 100) + '%' }}/></div>
        <p className="ip6a-kind">{m.title} · {st.k === 'lesson' ? 'Lesson ' + (i + 1) + ' of ' + (m.lessons || []).length : st.k === 'scen' ? 'What would you do?' : st.k === 'quiz' ? 'Question ' + (qIdx.indexOf(i) + 1) + ' of ' + qIdx.length : 'Result'}</p>
        {st.k !== 'result' ? <>
          <h2 id="ip6a-mh" className="ip6a-mh" tabIndex={-1} ref={topRef}>{st.h}</h2>
          {st.k === 'lesson' && <p className="ip6a-body">{st.b}</p>}
          {choice && <div className="ip6a-opts" role="radiogroup" aria-labelledby="ip6a-mh">{st.opts.map((l, j) => { const on = a === j; const scen = st.k === 'scen'; const ok = scen && answered && st.right[j], bad = scen && answered && on && !st.right[j];
            return <button key={j} type="button" role="radio" aria-checked={on} className={'ip6a-opt' + (on ? ' is-on' : '') + (ok ? ' is-ok' : '') + (bad ? ' is-bad' : '')}
              onClick={() => { if (scen && answered) return; setAns(Object.assign({}, ans, { [i]: j })); }}>
              <i className={ok ? 'ph-fill ph-check-circle' : bad ? 'ph-fill ph-x-circle' : on ? 'ph-fill ph-radio-button' : 'ph ph-circle'} aria-hidden="true"/>{l}</button>; })}</div>}
          {choice && answered && <p className={'ip6a-fb' + (st.k === 'scen' ? (st.right[a] ? ' is-ok' : ' is-warn') : '')} role="status">
            <b>{st.k === 'scen' ? (st.right[a] ? 'Right. ' : 'Not quite. ') : 'Answer recorded. '}</b>{st.k === 'scen' ? st.why[a] : 'You can change it before you go on. Your score is worked out when you finish.'}</p>}
        </> : <div className="ip6a-res" role="status" aria-live="polite">
          <i className={pending ? 'ph ph-hourglass' : pass ? 'ph-fill ph-seal-check is-done' : 'ph ph-arrow-counter-clockwise'} aria-hidden="true"/>
          <h2 id="ip6a-mh" className="ip6a-mh" tabIndex={-1} ref={topRef}>{pending ? 'Checking your answers…' : res && res.error ? 'Not saved' : pass ? 'Passed · ' + res.score + '%' : (res ? res.score : 0) + '% · the pass mark is ' + (data.pass || 80) + '%'}</h2>
          <p className="ip6a-body">{pending ? '' : res && res.error ? res.error : pass ? 'Saved to your record.' + (m.renewDays ? ' You’ll be reminded before it needs renewing.' : '') : 'Read the lessons again, then retake the questions. Nothing is recorded until you pass.'}</p></div>}
        <div className="ip6a-nav">
          {i > 0 && st.k !== 'result' && <button type="button" className="ip6a-btn" onClick={() => to(i - 1)}>Back</button>}
          <span className="ip6a-grow"/>
          <button type="button" className="ip6a-btn is-primary" aria-disabled={(choice && !answered) || pending}
            onClick={() => { if (pending) return; if (st.k === 'result') { if (pass || (res && res.error)) setMod(null); else { setStep(0); setAns({}); setRes(null); } return; } if (choice && !answered) return toast('Choose an answer first'); to(i + 1); }}>
            {st.k === 'result' ? (pass || (res && res.error) ? 'Back to Academy' : 'Try again') : steps[i + 1].k === 'result' ? 'See result' : 'Continue'}</button>
        </div>
      </section>
    </div>
  );
}

