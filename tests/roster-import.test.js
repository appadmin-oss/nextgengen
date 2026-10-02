#!/usr/bin/env node
/* ============================================================================
   The roster extractor — tools/ngg-import/.

   Eight years of NGG's roster lived in a Google Sheet before it lived in the
   database, and the sheet shows it: one child listed twice under two levels,
   two children sharing one member ID, a registration form rebuilt mid-programme
   so the same question appears in two columns, and names spelled three ways.

   What is tested here is the judgement, not the plumbing: which of two
   conflicting rows wins, when a near-spelling is the same child and when it is
   their sibling, and that every row the extractor could not place comes back as
   a warning instead of vanishing. An import that loses a child in silence is
   worse than one that refuses to run.

   The .xlsx reader gets its own fixture, built here rather than committed,
   because the bug it exists to prevent — an empty `<c .../>` swallowing the
   next cell and shifting a whole row's columns left — is invisible in any
   sample small enough to eyeball.

   Run:  node tests/roster-import.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const { readWorkbook } = require(path.join(ROOT, 'tools/ngg-import/xlsx'));
const { extractMembers, phone, email, excelDate, properName, nameKey } =
  require(path.join(ROOT, 'tools/ngg-import/members'));

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

// ── A minimal .xlsx writer, so the reader can be tested on a real container ──

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Write a ZIP the way Excel does: deflated entries, central directory last. */
function writeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const raw = Buffer.from(text, 'utf8');
    const data = zlib.deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(8, 8);                    // deflate
    head.writeUInt32LE(crc32(raw), 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    locals.push(head, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc32(raw), 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + data.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

function fixtureWorkbook() {
  const strings = ['Members ID', 'Level', 'Name', '023-001', 'A', 'Eleyinmi Josiah', 'TECH'];
  const si = strings.map((s) => `<si><t>${s}</t></si>`).join('');
  /* Row 2 deliberately carries an empty styled cell in column C, immediately
     before a value in D — the exact shape that shifted every later column. */
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" s="9"/><c r="D2" t="s"><v>5</v></c><c r="E2"><v>45195.0</v></c></row>
  </sheetData></worksheet>`;
  return writeZip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['xl/sharedStrings.xml', `<?xml version="1.0"?><sst>${si}</sst>`],
    ['xl/_rels/workbook.xml.rels',
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0"?><workbook><sheets><sheet name="MEMBERS" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

// ── The reader ──────────────────────────────────────────────────────────────

console.log('\nxlsx reader');
{
  const file = path.join(os.tmpdir(), `ngg-roster-fixture-${process.pid}.xlsx`);
  fs.writeFileSync(file, fixtureWorkbook());
  try {
    const wb = readWorkbook(file);
    const rows = wb['MEMBERS'];
    chk('reads the sheet by the name the workbook gives it', Array.isArray(rows));
    chk('resolves shared strings', rows[0][0] === 'Members ID' && rows[1][2] === '');
    chk('an empty <c/> holds its column open instead of swallowing the next cell',
      rows[1][3] === 'Eleyinmi Josiah' && rows[1][4] === '45195.0');
    chk('numbers arrive unparsed, for the caller to interpret', rows[1][4] === '45195.0');
  } finally { fs.unlinkSync(file); }
}

// ── Value normalisers ───────────────────────────────────────────────────────

console.log('\nvalue normalisers');
chk('a mobile that spent time in a numeric column gets its leading zero back',
  phone('8.160774973E9') === '08160774973');
chk('a mobile typed with spaces and a country code still lands as 11 digits',
  phone('+234 807 134 0384') === '08071340384');
chk('a cell holding "y" is not a phone number', phone('y') === '');
chk('an email is lower-cased and trimmed', email('  Tosbid03@Gmail.com ') === 'tosbid03@gmail.com');
chk('a cell that is not an address is dropped rather than stored', email('CACENTRE') === '');
chk('an Excel serial reads as the date the desk typed', excelDate('45195.0') === '2023-09-26');
chk('a birthday reads as a birthday, not 1970', excelDate('40291.0') === '2010-04-23');
chk('an empty date cell stays empty', excelDate('') === '' && excelDate('0') === '');
chk('a SHOUTED name is calmed down', properName('DANIEL LAWAL') === 'Daniel Lawal');
chk('a whispered name is raised', properName('khaleed abdulrazak') === 'Khaleed Abdulrazak');
chk('a name someone capitalised on purpose is left alone', properName('Eno-Obong McArthur') === 'Eno-Obong McArthur');
chk('the same child written in either order is the same key',
  nameKey('Eleyinmi Josiah') === nameKey('Josiah Eleyinmi'));

// ── The merge ───────────────────────────────────────────────────────────────

const REGISTRY_HEADER = ['j', 'Date_Joined', 'Level', 'First_Name', 'Last_Name', 'Image',
  'First_Faculty', 'Second_Faculty', 'Birthday', 'Email', 'Address', 'Mobile_Line'];
const reg = (id, level, first, last, extra = {}) => [
  id, extra.joined || '45195.0', level, first, last, '',
  extra.fac1 || 'TECH', extra.fac2 || 'MEDIA', extra.dob || '', extra.email || '', 'CACENTRE', extra.phone || '',
];

const INTAKE_HEADER = ['Timestamp', 'First Name', 'First name', 'Middle Name', 'Surname',
  'Date of Birth', 'Email', 'Sex', 'Name of school', 'Class', 'Mobile Number', 'Address',
  'Local Government', 'State', 'Country', "Father's Full Name", "Father's Number",
  "Mother's Full Name", "Mother's Number"];
const intake = (o) => [
  '45158.0', o.first || '', o.firstAlt || '', o.middle || '', o.surname || '',
  o.dob || '', o.email || '', o.sex || '', o.school || '', o.grade || '', o.phone || '',
  o.address || '', o.lga || '', '', '', o.father || '', o.fatherPhone || '', o.mother || '', o.motherPhone || '',
];

/** A workbook shaped like the real one, with only the rows a case needs. */
function book({ master = [], registry = [], ayobo = [], forms = [], state = [] }) {
  return {
    'MEMBERS': [['Members ID', 'Level', 'Name'], ...master],
    'NGGC MEMBERS': [REGISTRY_HEADER, ...registry],
    'AYOBO NGG MEMBERS': [REGISTRY_HEADER, ...ayobo],
    'Form responses 1': [INTAKE_HEADER, ...forms],
    'State of NGG': [['First_Name', 'Last_Name', 'State/Status 30/05/2026'], ...state],
  };
}
const find = (res, id) => res.members.find((m) => m.displayId === id);
const warned = (res, needle) => res.warnings.some((w) => w.includes(needle));

console.log('\nwho ends up on the roster');
{
  const res = extractMembers(book({
    master: [['023-001', 'A', 'Eleyinmi Josiah'], ['023-002', 'O', 'Lawal Daniel']],
    registry: [reg('023-001', 'B', 'Josiah', 'Eleyinmi', { dob: '40291.0', email: 'j@example.com' })],
  }));
  chk('a member in the registry carries the registry\'s structured name',
    find(res, '023-001').fullName === 'Josiah Eleyinmi');
  chk('…and the registry\'s level, not the master list\'s', find(res, '023-001').level === 'B');
  chk('a member the registry never got is still imported from the master list',
    find(res, '023-002').fullName === 'Lawal Daniel');
  chk('…as inactive, because only the registry says who is still attending',
    find(res, '023-002').status === 'inactive');
  chk('…and with a warning, because the master list\'s word order cannot be trusted',
    warned(res, '023-002'));
  chk('the intake year comes off the member ID', find(res, '023-001').cohort === '2023');
  chk('both faculties reach the ID card', find(res, '023-001').disciplines === 'TECH,MEDIA');
  chk('the first faculty is the track the rest of the app reads',
    find(res, '023-001').track === 'TECH');
}

console.log('\nthe PASSIVE divider');
{
  const res = extractMembers(book({
    master: [['023-001', 'A', 'Eleyinmi Josiah'], ['023-002', 'A', 'Lawal Daniel']],
    registry: [reg('023-001', 'A', 'Josiah', 'Eleyinmi'),
               ['PASSIVE'],
               reg('023-002', 'A', 'Daniel', 'Lawal')],
  }));
  chk('everyone above the PASSIVE row is on the roster', find(res, '023-001').status === 'active');
  chk('everyone below it has left', find(res, '023-002').status === 'inactive');
}

console.log('\none ID, two rows');
{
  const res = extractMembers(book({
    master: [['024-019', 'A', 'Afolabi Habeebah']],
    registry: [reg('024-019', 'B', 'Habeebah', 'Afolabi', { dob: '40615.0', phone: 'y' }),
               ['PASSIVE'],
               reg('024-019', 'A', 'Habeebah', 'Afolabi', { dob: '40615.0', phone: '08038019084' })],
  }));
  chk('the on-roster copy of a person listed twice wins on level',
    find(res, '024-019').level === 'B');
  chk('…and the passive copy still donates the fields it alone has',
    find(res, '024-019').phone === '08038019084');
  chk('…and they are counted once', res.members.length === 1);
}
{
  const res = extractMembers(book({
    master: [['024-088', 'O', 'Success Samuel']],
    registry: [reg('024-088', 'O', 'Samuel', 'Success'),
               reg('024-088', 'O', 'Khaleed', 'Abdulrazak')],
  }));
  chk('two different children on one ID is reported, not merged',
    warned(res, 'carries two different people'));
  chk('…and the second is left out rather than overwriting the first',
    res.members.length === 1 && find(res, '024-088').fullName === 'Samuel Success');
}
{
  const res = extractMembers(book({
    master: [['023-020', 'A', 'Afolabi Aisha']],
    registry: [reg('023-020', 'A', 'Aisha', 'Afolabi', { dob: '40616.0', email: 'a@example.com' }),
               reg('023-020', 'O', 'Aisha', 'Afolaba', { dob: '40616.0', email: 'a@example.com' })],
  }));
  chk('one misspelling with a matching birthday is one child, not a collision',
    res.members.length === 1 && !warned(res, 'carries two different people'));
  chk('…and the spelling difference is still reported', warned(res, 'spelled both'));
}

console.log('\nrows the desk never gave an ID');
{
  const res = extractMembers(book({
    master: [['023-018', 'O', 'Abodunrin Adenike Deborah']],
    registry: [reg('', 'O', 'Deborah', 'Abodunrin', { dob: '39944.0' })],
  }));
  chk('a registry row with no ID is matched to the master list by name',
    find(res, '023-018').dob === '2009-05-11');
  chk('…and the match is written down', warned(res, 'had no member ID'));
}
{
  const res = extractMembers(book({
    master: [['023-018', 'O', 'Abodunrin Adenike Deborah']],
    registry: [reg('', 'O', 'Chidinma', 'Anyanwu')],
  }));
  /* It used to be dropped ("not imported"), so the app never numbered the
     newest members. It comes through with no ID now, for the importer to issue. */
  const nid = res.members.find((m) => m.fullName === 'Chidinma Anyanwu');
  chk('a registry row with no ID and no match is imported without one, for the app to number',
    res.members.length === 2 && nid && nid.displayId === '' && nid.cohort === '' && warned(res, 'the app issues one'));
  chk('…and it is listed after the members who have IDs', res.members[1] === nid);
}
{
  const res = extractMembers(book({
    master: [['023-018', 'O', 'Abodunrin Adenike Deborah']],
    registry: [reg('', 'O', 'Chidinma', 'Anyanwu')],
    ayobo: [reg('', 'O', 'Chidinma', 'Anyanwu')],
  }));
  chk('…once, though both registry sheets list them', res.members.filter((m) => m.fullName === 'Chidinma Anyanwu').length === 1);
}

console.log('\nID shapes');
{
  const res = extractMembers(book({
    master: [['23-007', 'O', 'Kunle Ade'], ['NGG/22/042', 'A', 'Ola Bisi'], ['N/A', 'O', 'Not Anid']],
    registry: [reg('23-007', 'O', 'Kunle', 'Ade'), reg('NGG/22/042', 'A', 'Ola', 'Bisi')],
  }));
  chk('a year that lost its zero to a spreadsheet gets it back', !!find(res, '023-007') && find(res, '023-007').cohort === '2023');
  chk('an older card\'s ID shape is kept as printed, for the importer to check', !!find(res, 'NGG/22/042') && find(res, 'NGG/22/042').cohort === '');
  chk('"N/A" is not an ID', !res.members.some((m) => m.displayId === 'N/A'));
}

console.log('\nthe registration form');
{
  const res = extractMembers(book({
    master: [['024-015', 'O', 'Ajibola Micheal'], ['024-016', 'O', 'Adams Anthony']],
    registry: [reg('024-015', 'O', 'Micheal', 'Ajibola', { dob: '39623.0' }),
               reg('024-016', 'O', 'Anthony', 'Adams')],
    forms: [
      intake({ first: 'Michael', surname: 'Ajibola', dob: '39623.0', school: 'Alimosho Grammar',
               grade: 'SS2', sex: 'Male', lga: 'Alimosho', address: '12 Ponle Street',
               father: 'Mr Ajibola', fatherPhone: '08064803738',
               mother: 'Mrs Ajibola', motherPhone: '08071340384' }),
      intake({ firstAlt: 'Praise', surname: 'Anjorin', school: 'Nobody Secondary' }),
    ],
  }));
  const m = find(res, '024-015');
  chk('"Michael" and "Micheal" with one birthday between them are one child',
    m.school === 'Alimosho Grammar');
  chk('…and the near match is flagged for someone to confirm', warned(res, 'near spelling'));
  chk('the form fills in what the registry has no column for',
    m.sex === 'Male' && m.grade === 'SS2' && m.lga === 'Alimosho' && m.address === '12 Ponle Street');
  chk('both guardians are kept, and the first becomes the parent on file',
    m.guardians.length === 2 && m.parentName === 'Mr Ajibola' && m.parentPhone === '08064803738');
  chk('the second name column of the rebuilt form is read as a given name',
    warned(res, 'Praise Anjorin'));
  chk('a registration matching nobody imports nobody', !find(res, '024-016').school);
  const ap = res.applicants || [];
  chk('…but it travels as an applicant for the desk, not as a member',
    ap.length === 1 && ap[0].fullName === 'Praise Anjorin' && ap[0].school === 'Nobody Secondary'
    && !res.members.some((x) => x.fullName === 'Praise Anjorin') && res.stats.applicants === 1);
  chk('…keyed so the same workbook files them once', /^intake:/.test(ap[0].importKey));
  chk('a matched registration is not an applicant', !ap.some((x) => /Ajibola/.test(x.fullName)));
}
{
  const res = extractMembers(book({
    master: [['024-040', 'O', 'Ofor Christabel']],
    registry: [reg('024-040', 'O', 'Christabel', 'Ofor', { dob: '39385.0' })],
    forms: [intake({ first: 'Chidiebere', surname: 'Ofor', dob: '40122.0', school: 'Wrong School' })],
  }));
  chk('a sibling with a different birthday does not inherit the other one\'s school',
    !find(res, '024-040').school);
}

console.log('\nthe status snapshot');
{
  const res = extractMembers(book({
    master: [['023-001', 'A', 'Eleyinmi Josiah'], ['023-003', 'A', 'Sobo Imoleayo'],
             ['023-004', 'A', 'Okwodua Esther'], ['023-005', 'A', 'Olubanjo Titilayo']],
    registry: [reg('023-001', 'A', 'Josiah', 'Eleyinmi'), reg('023-003', 'A', 'Imoleayo', 'Sobo'),
               reg('023-004', 'A', 'Esther', 'Okwodua'), reg('023-005', 'A', 'Titilayo', 'Olubanjo')],
    state: [['Josiah', 'Eleyinmi', 'Upgraded to NGV'], ['Imoleayo', 'Sobo', 'Breached Contract'],
            ['Esther', 'Okwodua', 'Suspended'], ['Titilayo', 'Olubanjo', 'Active']],
  }));
  chk('"Upgraded to NGV" is a graduation the app can count',
    find(res, '023-001').status === 'graduated-vanguard');
  chk('"Breached Contract" leaves the roster', find(res, '023-003').status === 'inactive');
  chk('"Suspended" is suspended, not deleted', find(res, '023-004').status === 'suspended');
  chk('"Active" stays active', find(res, '023-005').status === 'active');
  chk('the snapshot outranks the registry, being the later record',
    find(res, '023-003').status === 'inactive' && find(res, '023-003').stateNote === 'Breached Contract');
}
{
  const res = extractMembers(book({
    master: [['023-001', 'A', 'Eleyinmi Josiah']],
    registry: [reg('023-001', 'A', 'Josiah', 'Eleyinmi')],
    state: [['Josiah', 'Eleyinmi', 'Gone fishing']],
  }));
  chk('a state nobody has mapped is reported instead of guessed at',
    warned(res, 'unrecognised state'));
  chk('…and the member keeps the status the registry implied',
    find(res, '023-001').status === 'active');
}

console.log('\ncentres, and the things a human has to resolve');
{
  const res = extractMembers(book({
    master: [['023-001', 'A', 'Eleyinmi Josiah']],
    registry: [reg('023-001', 'A', 'Josiah', 'Eleyinmi')],
    ayobo: [reg('026-001', 'O', 'Mujidat', 'Makinde'), reg('023-001', 'A', 'Josiah', 'Eleyinmi')],
  }));
  chk('only the IDs the Ayobo sheet does not share with the main registry are Ayobo\'s',
    find(res, '026-001').centre === 'Ayobo' && find(res, '023-001').centre === 'Egbeda');
}
{
  const res = extractMembers(book({
    master: [['024-061', 'O', 'Udeukwu Kingsley'], ['024-077', 'O', 'Kingsley Udeukwu']],
  }));
  chk('one name against two member IDs is surfaced for a human to merge',
    warned(res, 'two member IDs'));
  chk('…and both are imported meanwhile, because guessing loses a child',
    res.members.length === 2);
}
{
  const res = extractMembers(book({
    master: [['023-010', 'O', 'Adewale Flourish'], ['023-011', 'O', 'Adewale Adedotun']],
    registry: [reg('023-010', 'O', 'Flourish', 'Adewale', { email: 'family@example.com' }),
               reg('023-011', 'O', 'Adedotun', 'Adewale', { email: 'family@example.com' })],
  }));
  chk('siblings sharing one email address are flagged — only one of them can sign in',
    warned(res, 'shares the email'));
}

console.log('\na re-tabbed workbook');
{
  let threw = false;
  try { extractMembers({ 'MEMBERS': [[]] }); } catch (_) { threw = true; }
  chk('a missing sheet fails loudly instead of importing less', threw);
}

// ── The file's hash ─────────────────────────────────────────────────────────
/* A roster file carries children's home addresses and guardians' phone numbers
   from a laptop to a shared host, usually by whatever route is to hand. The
   sha256 the extractor prints is what makes "the file I made" and "the file the
   Control Room is importing" one checkable claim — so it has to be the hash of
   the bytes actually on disk, and it has to come out even under --quiet, since
   a hash nobody sees is a hash nobody compares. */
console.log('\nthe file hash');
{
  const { main } = require(path.join(ROOT, 'tools/ngg-import/extract'));

  /* book() returns already-parsed sheets; main() needs a real .xlsx, so write
     one. Inline strings rather than a shared-string table — the reader handles
     both and this is about the hash, not the parser. */
  const asXlsx = (sheets) => {
    const names = Object.keys(sheets);
    const cell = (v, i) => `<c r="${String.fromCharCode(65 + i)}1" t="inlineStr"><is><t>${
      String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`;
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships>'
        + names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + '</Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0"?><workbook><sheets>'
        + names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets></workbook>'],
    ];
    names.forEach((n, i) => {
      const rows = sheets[n].map((r, ri) =>
        `<row r="${ri + 1}">` + r.map((v, ci) => cell(v, ci).replace(/r="([A-Z])1"/, `r="$1${ri + 1}"`)).join('') + '</row>').join('');
      files.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`]);
    });
    return writeZip(files);
  };

  const bookFile = path.join(os.tmpdir(), `ngg-sha-book-${process.pid}.xlsx`);
  const out = path.join(os.tmpdir(), `ngg-sha-out-${process.pid}.json`);
  fs.writeFileSync(bookFile, asXlsx(book({
    master: [['023-001', 'A', 'Eleyinmi Josiah']],
    registry: [['', '45195', 'A', 'Eleyinmi', 'Josiah', '', 'TECH']],
  })));

  /* --quiet puts the hash on stdout so a script can capture it; capture it the
     same way rather than reading it back out of the module. */
  const realWrite = process.stdout.write.bind(process.stdout);
  let out1 = '';
  process.stdout.write = (c) => { out1 += c; return true; };
  let code;
  try { code = main([bookFile, '--out', out, '--quiet']); } finally { process.stdout.write = realWrite; }

  const printed = out1.trim();
  const onDisk = require('crypto').createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  chk('the extractor prints a sha256 even under --quiet', code === 0 && /^[0-9a-f]{64}$/.test(printed));
  chk('…and it is the hash of the bytes it actually wrote', printed === onDisk);

  /* Re-extracting the same workbook must NOT give the same file hash, because
     the file carries extractedAt. That is exactly why the import digest exists
     separately — the file hash answers "is this the same file", not "is this
     the same roster". */
  const out2 = path.join(os.tmpdir(), `ngg-sha-out2-${process.pid}.json`);
  let cap2 = '';
  process.stdout.write = (c) => { cap2 += c; return true; };
  try { main([bookFile, '--out', out2, '--quiet']); } finally { process.stdout.write = realWrite; }
  const a = JSON.parse(fs.readFileSync(out, 'utf8')), b = JSON.parse(fs.readFileSync(out2, 'utf8'));
  chk('two extracts of one workbook hold the same members…',
    JSON.stringify(a.members) === JSON.stringify(b.members));
  chk('the file carries its applicants beside its members', Array.isArray(a.applicants));
  chk('…and are still different FILES, which is the file hash doing its job',
    cap2.trim() !== printed && a.extractedAt !== b.extractedAt);

  for (const f of [bookFile, out, out2]) { try { fs.unlinkSync(f); } catch (_) {} }
}

console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
  + passed + ' passed, ' + failed + ' failed (roster extractor)');
process.exit(failed === 0 ? 0 : 1);
