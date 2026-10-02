/**
 * Turn the NGG members workbook into a flat, reviewable roster.
 *
 * The workbook is twenty sheets of eight years of desk work: a master ID list,
 * two richer registry sheets, a Google Forms intake dump, a status snapshot,
 * and a lot of attendance. This module reduces the five that carry roster facts
 * to one record per member, and reports everything it could not place rather
 * than dropping it quietly — an import you cannot audit is an import nobody
 * should run.
 *
 * Nothing here writes to the database; see api/tools/seed-members.php.
 */
'use strict';

/* Which sheets carry what. Named here so a workbook that has been re-tabbed
   fails loudly on a missing sheet instead of silently importing less. */
const SHEET_MASTER   = 'MEMBERS';               // every ID ever issued: id, level, name
const SHEET_REGISTRY = 'NGGC MEMBERS';          // the live registry: names, faculties, dob, contact
const SHEET_AYOBO    = 'AYOBO NGG MEMBERS';     // the Ayobo centre's copy of the same
const SHEET_INTAKE   = 'Form responses 1';      // registration form: school, guardians, sex, class
const SHEET_STATE    = 'State of NGG';          // dated status snapshot, keyed by name

/* The registry sheets are split by a row whose first cell reads PASSIVE:
   everyone above it is on the current roster, everyone below has left. */
const PASSIVE_MARKER = 'PASSIVE';

/* The programme's two centres — see volunteers.php `directory_centres()`. */
const CENTRE_DEFAULT = 'Egbeda';
const CENTRE_AYOBO   = 'Ayobo';

/* The snapshot's own words → the member statuses the app counts on
   (see admin2.php `admin_overview`). */
const STATE_TO_STATUS = {
  'active': 'active',
  'suspended': 'suspended',
  'breached contract': 'inactive',
  'upgraded to ngv': 'graduated-vanguard',
};

const FACULTIES = ['TECH', 'MEDIA', 'ART'];

// ── Value normalisers ───────────────────────────────────────────────────────

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Excel serial → ISO date. Day 1 is 1900-01-01 with the 1900 leap-year bug,
 *  which puts the epoch at 1899-12-30. Serials are also how Sheets stores a
 *  timestamp, so the fractional part (time of day) is dropped. */
function excelDate(v) {
  const n = Number(clean(v));
  if (!Number.isFinite(n) || n < 1 || n > 80000) return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
}

/** Nigerian mobile → 0XXXXXXXXXX. Numbers that spent time in a numeric column
 *  arrive as floats ("8.160774973E9") and have lost their leading zero. */
function phone(v) {
  let s = clean(v);
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) s = Number(s).toFixed(0);
  s = s.replace(/\D/g, '');
  if (s.startsWith('234')) s = s.slice(3);
  if (s.length === 10) s = '0' + s;
  return s.length === 11 && s.startsWith('0') ? s : '';
}

function email(v) {
  const s = clean(v).toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : '';
}

/** Title-case only the tokens the sheet shouted or whispered. A token that is
 *  already mixed case ("McDonald", "Eno-Obong") was typed deliberately. */
function properName(v) {
  return clean(v)
    .split(' ')
    .map((w) => (w === w.toLowerCase() || w === w.toUpperCase()
      ? w.replace(/[\p{L}]+/gu, (p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
      : w))
    .join(' ');
}

/** A member ID as the sheets spell it, variously: "024-016", "025- 107",
 *  "23-001" (a spreadsheet ate the year's zero), or an older card's shape
 *  altogether ("NGG/23/042"). Anything else that is ID-like — a digit in it,
 *  no spaces, short — is kept AS PRINTED rather than treated as no ID: the
 *  importer checks it against the ID formats the desk has declared, and an
 *  extractor that threw it away lost exactly the members with the oldest
 *  cards. "N/A", "-" and "TBD" are not IDs. */
function memberRef(v) {
  const s = clean(v).replace(/\s+/g, '').toUpperCase();
  if (!s) return '';
  const today = s.match(/^(\d{2,3})[-/.](\d{1,4})$/);
  if (today) return today[1].padStart(3, '0') + '-' + today[2];
  return /\d/.test(s) && s.length <= 24 && /^[A-Z0-9][A-Z0-9/._-]*$/.test(s) ? s : '';
}

/** The intake year an ID encodes: "023-001" was issued in 2023. An older shape says nothing about it. */
const cohortOf = (ref) => (/^\d{3}-/.test(ref) ? String(2000 + Number(ref.slice(0, 3))) : '');

/** Match people across sheets that share no ID — order-insensitive, because
 *  "Eleyinmi Josiah" and "Josiah Eleyinmi" are one child. */
function nameKey(...parts) {
  const tokens = parts
    .flatMap((p) => clean(p).split(' '))
    .map((t) => t.toLowerCase().replace(/[^\p{L}]/gu, ''))
    .filter((t) => t.length > 1);
  return [...new Set(tokens)].sort().join(' ');
}

/** Levenshtein distance, capped — only used to decide whether two spellings of
 *  one child's name are the same child. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Do two name keys plausibly belong to one person? Same tokens, or one set
 *  inside the other ("Abodunrin Deborah" ⊂ "Abodunrin Adenike Deborah"), or a
 *  shared surname with a first name that is one or two keystrokes out
 *  ("Micheal"/"Michael", "Eno-Obong"/"Enobong"). */
function sameName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const shared = ta.filter((t) => tb.includes(t));
  if (!shared.length) return false;
  if (shared.length === Math.min(ta.length, tb.length)) return true;   // subset
  const ra = ta.filter((t) => !shared.includes(t));
  const rb = tb.filter((t) => !shared.includes(t));
  if (ra.length !== 1 || rb.length !== 1) return false;
  return ra[0].startsWith(rb[0]) || rb[0].startsWith(ra[0]) || editDistance(ra[0], rb[0]) <= 2;
}

/**
 * Look one name up in a Map keyed by name key. Exact hits win outright; a
 * near-spelling is accepted only when exactly one candidate is close, because
 * "probably this one of two" is how an import puts a child's school record on
 * the wrong child.
 *
 * @returns {{key: string, value: *, exact: boolean}|null}
 */
function lookupName(key, index) {
  if (index.has(key)) return { key, value: index.get(key), exact: true };
  const near = [...index.keys()].filter((k) => sameName(key, k));
  return near.length === 1 ? { key: near[0], value: index.get(near[0]), exact: false } : null;
}

const faculty = (v) => (FACULTIES.includes(clean(v).toUpperCase()) ? clean(v).toUpperCase() : '');

// ── Sheet readers ───────────────────────────────────────────────────────────

/** Header row → column index, so a re-ordered sheet still reads correctly. */
function headerIndex(row) {
  const idx = {};
  (row || []).forEach((h, i) => {
    const k = clean(h).toLowerCase();
    if (k && !(k in idx)) idx[k] = i;
  });
  return idx;
}

function requireSheet(wb, name) {
  if (!wb[name]) throw new Error(`workbook has no "${name}" sheet — was it re-tabbed?`);
  return wb[name];
}

/** One of the two registry sheets. Returns records keyed by member ref, plus
 *  the rows that carry a name but no ID, for the caller to match by name. */
function readRegistry(rows, sheetName, warn) {
  const h = headerIndex(rows[0]);
  const col = {
    ref: 0,                              // the ID column's header is a stray "j"
    joined: h['date_joined'],
    level: h['level'],
    first: h['first_name'],
    last: h['last_name'],
    fac1: h['first_faculty'],
    fac2: h['second_faculty'],
    dob: h['birthday'],
    email: h['email'],
    phone: h['mobile_line'],
  };

  const byRef = new Map();
  const unidentified = [];
  let onRoster = true;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length) continue;
    if (clean(r[col.ref]).toUpperCase() === PASSIVE_MARKER) { onRoster = false; continue; }

    const first = properName(r[col.first]);
    const last = properName(r[col.last]);
    if (!first && !last) continue;

    const disciplines = [faculty(r[col.fac1]), faculty(r[col.fac2])].filter(Boolean);
    const rec = {
      firstName: first,
      lastName: last,
      fullName: [first, last].filter(Boolean).join(' '),
      level: clean(r[col.level]).toUpperCase(),
      track: disciplines[0] || '',
      disciplines: [...new Set(disciplines)].join(','),
      joinDate: excelDate(r[col.joined]),
      dob: excelDate(r[col.dob]),
      email: email(r[col.email]),
      phone: phone(r[col.phone]),
      onRoster,
      source: sheetName,
    };

    const ref = memberRef(r[col.ref]);
    if (!ref) { unidentified.push({ row: i + 1, rec }); continue; }
    rec.displayId = ref;

    const prior = byRef.get(ref);
    if (!prior) { byRef.set(ref, rec); continue; }

    /* The same ID twice. Usually one person the desk listed in both the
       on-roster and the passive block — merge those, because each copy has
       fields the other is missing. Two DIFFERENT names on one ID is a
       collision no import can resolve, so it is reported and the later row
       dropped rather than guessed at. */
    if (nameKey(prior.fullName) !== nameKey(rec.fullName)) {
      /* Different names on one ID is either a misspelling or two children
         sharing an ID by mistake. A matching email or birthday settles it;
         without one, nothing here can, so the row is reported, not guessed. */
      const sameChild = (prior.email && prior.email === rec.email) || (prior.dob && prior.dob === rec.dob);
      if (!sameChild) {
        warn(`${sheetName} row ${i + 1}: member ID ${ref} carries two different people — "${prior.fullName}" and "${rec.fullName}", with nothing in common to link them. Kept ${prior.fullName}; ${rec.fullName} needs an ID of their own before they can be imported`);
        continue;
      }
      warn(`${sheetName} row ${i + 1}: ${ref} is spelled both "${prior.fullName}" and "${rec.fullName}" — same birthday and contact, so treated as one person under "${prior.fullName}"`);
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'onRoster') continue;
      if (v !== '' && (prior[k] === undefined || prior[k] === '')) prior[k] = v;
    }
    prior.onRoster = prior.onRoster || rec.onRoster;
  }

  return { byRef, unidentified };
}

/** The intake form, deduplicated. Families re-submitted; later rows win. */
function readIntake(rows) {
  const h = headerIndex(rows[0]);
  /* The form was rebuilt mid-programme and the export kept both generations of
     the name questions. In the old shape the second column repeats the surname;
     in the new one it holds the given name and the first column is blank. So
     the given name is "whichever of the two is filled, first one wins". */
  const cols = Object.keys(h);
  const firstA = h['first name'];
  const firstB = cols.includes('first name') ? rows[0].findIndex((c, i) => i !== firstA && clean(c).toLowerCase() === 'first name') : -1;

  const out = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length) continue;
    const given = properName(r[firstA]) || properName(r[firstB >= 0 ? firstB : -1]);
    const surname = properName(r[h['surname']]);
    if (!given && !surname) continue;

    const guardians = [
      { name: properName(r[h["father's full name"]]), phone: phone(r[h["father's number"]]), relation: 'Father' },
      { name: properName(r[h["mother's full name"]]), phone: phone(r[h["mother's number"]]), relation: 'Mother' },
    ].filter((g) => g.name || g.phone);

    out.set(nameKey(given, surname), {
      displayName: [given, surname].filter(Boolean).join(' '),
      dob: excelDate(r[h['date of birth']]),
      email: email(r[h['email']]),
      phone: phone(r[h['mobile number']]),
      sex: /^m/i.test(clean(r[h['sex']])) ? 'Male' : /^f/i.test(clean(r[h['sex']])) ? 'Female' : '',
      school: clean(r[h['name of school']]),
      grade: clean(r[h['class']]).toUpperCase(),
      address: clean(r[h['address']]),
      lga: clean(r[h['local government']]),
      guardians,
    });
  }
  return out;
}

/** The dated status snapshot, keyed by name. */
function readState(rows, warn) {
  const h = headerIndex(rows[0]);
  const stateCol = (rows[0] || []).findIndex((c) => /^state\b|status/i.test(clean(c)));
  const out = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length) continue;
    const key = nameKey(r[h['first_name']], r[h['last_name']]);
    if (!key) continue;
    const raw = clean(r[stateCol]).toLowerCase();
    const status = STATE_TO_STATUS[raw];
    if (!status) { warn(`${SHEET_STATE} row ${i + 1}: unrecognised state "${clean(r[stateCol])}" — status left as the registry had it`); continue; }
    out.set(key, { status, raw: clean(r[stateCol]) });
  }
  return out;
}

// ── Merge ───────────────────────────────────────────────────────────────────

/**
 * @param {Record<string,string[][]>} wb  workbook as read by ./xlsx.js
 * @returns {{members: object[], warnings: string[], stats: object}}
 */
function extractMembers(wb) {
  const warnings = [];
  const warn = (m) => warnings.push(m);

  const master   = requireSheet(wb, SHEET_MASTER);
  const registry = readRegistry(requireSheet(wb, SHEET_REGISTRY), SHEET_REGISTRY, warn);
  const ayobo    = readRegistry(requireSheet(wb, SHEET_AYOBO), SHEET_AYOBO, warn);
  const intake   = readIntake(requireSheet(wb, SHEET_INTAKE));
  const state    = readState(requireSheet(wb, SHEET_STATE), warn);

  /* The Ayobo sheet is the main registry copied, with that centre's own
     members added on top. Only the IDs it does NOT share are Ayobo's. */
  const ayoboOnly = new Set([...ayobo.byRef.keys()].filter((ref) => !registry.byRef.has(ref)));

  const byRef = new Map();
  const upsert = (ref, patch) => {
    const cur = byRef.get(ref) || { displayId: ref, sources: [] };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'sources') continue;
      if (v !== '' && v !== undefined && v !== null && (cur[k] === undefined || cur[k] === '')) cur[k] = v;
    }
    if (patch.source && !cur.sources.includes(patch.source)) cur.sources.push(patch.source);
    byRef.set(ref, cur);
    return cur;
  };

  // 1. The registries first — they carry structured names and faculties.
  for (const [ref, rec] of registry.byRef) upsert(ref, { ...rec, centre: CENTRE_DEFAULT });
  for (const ref of ayoboOnly) upsert(ref, { ...ayobo.byRef.get(ref), centre: CENTRE_AYOBO });
  /* An ID the Ayobo copy marks as still on the roster is on the roster, even
     where the main sheet has already filed it under PASSIVE. */
  for (const [ref, rec] of ayobo.byRef) if (rec.onRoster && byRef.has(ref)) byRef.get(ref).onRoster = true;

  // 2. The master list: every ID ever issued, so it decides who exists at all.
  const hm = headerIndex(master[0]);
  const masterByName = new Map();
  const masterRows = [];
  for (let i = 1; i < master.length; i++) {
    const r = master[i];
    if (!r.length) continue;
    const ref = memberRef(r[hm['members id']]);
    const name = properName(r[hm['name']]);
    if (!ref) continue;
    masterRows.push({ row: i + 1, ref, name, level: clean(r[hm['level']]).toUpperCase() });
    if (name) {
      const key = nameKey(name);
      if (masterByName.has(key)) {
        warn(`${masterByName.get(key)} and ${ref} are both "${name}" — one person holding two member IDs, or two children with the same name. Both imported; merge them by hand if they are one person`);
      } else masterByName.set(key, ref);
    }
  }

  /* Registry rows that never got an ID typed in. The master list has the same
     names against real IDs, so match on the name rather than throwing the
     faculties, birthday and contact details away. */
  for (const { row, rec } of [...registry.unidentified, ...ayobo.unidentified]) {
    const hit = lookupName(nameKey(rec.fullName), masterByName);
    if (!hit) {
      /* A member on the registry with no ID anywhere. They used to be dropped
         here — "not imported" — so the app's ID minter never saw them, and the
         newest members were the ones who never got an ID. They come through
         with a blank ID now; the importer issues one (YYY-NNN, from their
         intake year) and reports it so it can be written back. The copies of
         one person in two registry sheets are one member, by name. */
      const key = '~' + nameKey(rec.fullName);
      const had = byRef.has(key);
      upsert(key, { ...rec, centre: rec.source === SHEET_AYOBO ? CENTRE_AYOBO : CENTRE_DEFAULT });
      byRef.get(key).displayId = '';
      if (!had) warn(`${rec.source} row ${row}: "${rec.fullName}" has no member ID and no match on the master list — imported without one; the app issues one on import`);
      continue;
    }
    const ref = hit.value;
    upsert(ref, { ...rec, displayId: ref, centre: byRef.get(ref)?.centre || CENTRE_DEFAULT });
    warn(`${rec.source} row ${row}: "${rec.fullName}" had no member ID — matched to ${ref} by name${hit.exact ? '' : ' (spelling differs on the master list)'}`);
  }

  for (const { row, ref, name, level } of masterRows) {
    const known = byRef.get(ref);
    if (known) {
      if (!known.level) known.level = level;
      if (!known.sources.includes(SHEET_MASTER)) known.sources.push(SHEET_MASTER);
      continue;
    }
    /* Not in either registry. The master sheet writes names in no consistent
       order — "Eleyinmi Josiah" is surname-first, "Naomi Akintola" is not — so
       the string is kept verbatim rather than guessed at. */
    if (!name) { warn(`${SHEET_MASTER} row ${row}: ${ref} has no name — skipped`); continue; }
    upsert(ref, { fullName: name, level, centre: CENTRE_DEFAULT, onRoster: false, source: SHEET_MASTER });
    warn(`${ref} ("${name}") is on the master list but in no registry sheet — imported as inactive, and the name is stored as written because the sheet's word order is not consistent`);
  }

  // 3. The intake form and the status snapshot, both matched on name.
  const intakeUsed = new Set();
  let stateHits = 0;
  for (const m of byRef.values()) {
    const key = nameKey(m.fullName);
    const formHit = lookupName(key, intake);
    /* A near-spelling match is only trusted when the birthdays agree — the one
       fact both sheets record independently. Two children in a family often
       have similar names, and a wrong match writes one child's school,
       address and guardians onto their sibling. */
    const form = formHit && (formHit.exact || !m.dob || !formHit.value.dob || m.dob === formHit.value.dob)
      ? formHit.value : null;
    if (form) {
      intakeUsed.add(formHit.key);
      if (!formHit.exact) warn(`${m.displayId} (${m.fullName}) matched the registration of "${form.displayName}" on a near spelling — check it is the same child`);
      for (const k of ['dob', 'email', 'phone', 'sex', 'school', 'grade', 'address', 'lga']) {
        if (!m[k] && form[k]) m[k] = form[k];
      }
      if (form.guardians.length) {
        m.guardians = form.guardians;
        m.parentName = form.guardians[0].name;
        m.parentPhone = form.guardians[0].phone;
      }
      if (!m.sources.includes(SHEET_INTAKE)) m.sources.push(SHEET_INTAKE);
    }
    const snapHit = lookupName(key, state);
    const snap = snapHit ? snapHit.value : null;
    if (snap) {
      stateHits++;
      m.status = snap.status;
      m.stateNote = snap.raw;
      if (!m.sources.includes(SHEET_STATE)) m.sources.push(SHEET_STATE);
    } else {
      m.status = m.onRoster ? 'active' : 'inactive';
    }
  }

  /* A registration nobody on the roster answers to. Either the child never
     enrolled or their name is spelled differently in the two places — the
     desk can tell which, and cannot if the row is dropped in silence. */
  for (const [key, form] of intake) {
    if (intakeUsed.has(key)) continue;
    warn(`${SHEET_INTAKE}: "${form.displayName}" registered but matches nobody on the roster — no member imported for them`);
  }

  const members = [...byRef.values()]
    // Members with an ID in ID order; the ones the app will number, after them by name.
    .sort((a, b) => (!a.displayId - !b.displayId) || (a.displayId || a.fullName).localeCompare(b.displayId || b.fullName))
    .map((m) => ({
      displayId: m.displayId,
      fullName: m.fullName,
      type: 'NGG',
      status: m.status,
      centre: m.centre || CENTRE_DEFAULT,
      cohort: cohortOf(m.displayId),
      level: m.level || '',
      track: m.track || '',
      disciplines: m.disciplines || '',
      joinDate: m.joinDate || '',
      dob: m.dob || '',
      email: m.email || '',
      phone: m.phone || '',
      school: m.school || '',
      sex: m.sex || '',
      grade: m.grade || '',
      lga: m.lga || '',
      address: m.address || '',
      parentName: m.parentName || '',
      parentPhone: m.parentPhone || '',
      guardians: m.guardians || [],
      stateNote: m.stateNote || '',
      sources: m.sources,
    }));

  /* Two children in one family share an address and, on these forms, an email.
     Only one of them can ever sign in with it, so the desk needs the list. */
  const seenEmail = new Map();
  for (const m of members) {
    if (!m.email) continue;
    if (seenEmail.has(m.email)) warn(`${m.displayId || 'no ID yet'} (${m.fullName}) shares the email ${m.email} with ${seenEmail.get(m.email)} — only one of them can sign in with it`);
    else seenEmail.set(m.email, m.displayId || m.fullName);
  }

  const tally = (fn) => members.filter(fn).length;
  return {
    members,
    warnings,
    stats: {
      total: members.length,
      active: tally((m) => m.status === 'active'),
      inactive: tally((m) => m.status === 'inactive'),
      suspended: tally((m) => m.status === 'suspended'),
      graduated: tally((m) => m.status.startsWith('graduated')),
      byCentre: { [CENTRE_DEFAULT]: tally((m) => m.centre === CENTRE_DEFAULT), [CENTRE_AYOBO]: tally((m) => m.centre === CENTRE_AYOBO) },
      withEmail: tally((m) => !!m.email),
      withPhone: tally((m) => !!m.phone),
      withDob: tally((m) => !!m.dob),
      withSchool: tally((m) => !!m.school),
      withGuardian: tally((m) => m.guardians.length > 0),
      matchedIntake: intakeUsed.size,
      matchedState: stateHits,
      intakeRowsUnmatched: intake.size - intakeUsed.size,
    },
  };
}

module.exports = { extractMembers, nameKey, phone, email, excelDate, properName, memberRef };
