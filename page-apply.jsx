/* ============================================================================
   The Club application (/join?program=anchor) — v2026.10.

   Replaces the Google Form "Next Generation Genius Members" with seven steps
   that cannot take the bad data the old form took: a 2020 birth date for an
   SS2 student, "Yes" as a vision, a ten-digit phone, "@gmail" as an email, a
   phone number in the promo code, the surname typed twice. Every rule here is
   run again by public.apply (club_apply_details in domain/events.php), so a
   stale page cannot skip one.

   Layout follows the form's OWN width (a ResizeObserver on the root), never
   the window's: < 680 one column with a fixed Back / Continue bar, 680–999 the
   6-column field grid, ≥ 1000 the step list on the left, ≥ 1280 the ID card
   preview on the right. Summer School registers through its gated sign-up link (SummerSignupForward).
   ========================================================================== */

const APF_DRAFT_KEY = "ngg-apply";
const APF_POLICY_VERSION = "2026.10";
const APF_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
const APF_LGAS = {
  Lagos: ["Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere"],
  Ogun: ["Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Ewekoro", "Ifo", "Ijebu East", "Ijebu North", "Ijebu North East", "Ijebu Ode", "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode", "Odeda", "Odogbolu", "Ogun Waterside", "Remo North", "Sagamu", "Yewa North", "Yewa South"],
};
/* The same list the server accepts (CLUB_APPLY_CLASSES). */
const APF_CLASSES = [["Primary school", ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"]], ["Junior secondary", ["JSS 1", "JSS 2", "JSS 3"]], ["Senior secondary", ["SSS 1", "SSS 2", "SSS 3"]], ["Other", ["Finished secondary school"]]];
const APF_SCHOOLS = ["Abesan Junior High School", "Abesan Senior High School", "Abule Egba High School", "Agbado Ijaiye Senior High School", "Akowonjo Junior Grammar School", "Akowonjo Senior High School", "Alimosho Junior Grammar School", "Alimosho Senior Grammar School", "Anglican Senior Grammar School, Egbeda", "Ayobo Community Junior High School", "Ayobo Senior High School", "Baptist High School, Egbeda", "Bethel Academy", "Blessed Brain Schools", "Command Day Secondary School, Shasha", "Community Junior Grammar School, Egbeda", "Divine Covenant Group of Schools", "Efforts Will Academy", "Egbeda Junior High School", "Egbeda Senior High School", "Faith Academy", "Federal Government College, Ilorin", "Federal Government College, Ijanikin", "God’s Prominence College", "Great Michael Comprehensive College", "Idimu Junior High School", "Igando Community High School", "Igando Senior Grammar School", "Ijegun Comprehensive High School", "Ikotun Junior High School", "Ikotun Senior High School", "Ipaja Junior College", "Ipaja Senior High School", "Ipaja Town Senior High School", "Konsol Private College", "Lagos State Model College, Igbonla", "Ludi College", "Millennium Senior Secondary School, Egbeda", "Navy Secondary School, Ojo", "Oke Odo Junior High School", "Oke Odo Senior High School", "Olorunfunmi Senior Grammar School, Idimu", "Orisunbare Junior High School", "Orisunbare Senior High School", "Peacefield College", "Queen’s College, Yaba", "Rare Gems Creative Art School", "Re-invent Secondary School", "Revelation Model and High School", "Saint Saviour High School", "Sasa Community Senior High School", "Shasha Community Junior High School", "Sigma Bond Academy", "St. Andrew’s Primary School, Ipaja", "St. Anthony Nursery and Primary School", "State Junior High School, Alimosho", "State Senior High School, Alimosho", "Sun City College", "The Scholars College", "Timeon Kairos Cardinal College", "Triumphant Baptist College", "Unity Senior College, Oke Odo"];
const APF_NATIONALITIES = ["Nigerian", "Ghanaian", "Beninese", "Togolese", "Cameroonian", "British", "American"];
const APF_AREAS = ["Education", "Science and technology", "Health", "Media", "Law and order", "Hospitality", "Agriculture", "Sport", "Projects and infrastructure", "Business", "Community development", "Something else"];
const APF_HOBBIES = ["Reading", "Singing", "Dancing", "Drawing", "Football", "Playing music", "Chess", "Writing", "Acting", "Coding", "Cooking", "Gaming"];
const APF_HEAR = ["A friend or family member", "WhatsApp", "Instagram", "Facebook", "My school", "Church or mosque", "An NGG event", "Something else"];
const APF_OTHER_COURSE = "Something else";
const APF_POL = { participation: "Taking part and conduct", medical: "Emergency medical care", privacy: "Privacy and your data", updates: "Family updates", media: "Photos and videos", website: "Website feature", trips: "Off-site activities", fees: "Fees and payment" };
const APF_TIPS = {
  start: "Most parents fill this in with their child next to them. The child can then write the vision in their own words.",
  about: "Use the name on school records. We print the surname first on the ID card, so check the spelling.",
  school: "Start typing and pick from the list. If the school isn’t there, keep typing and choose “Use …”.",
  home: "Where you live now decides your nearest centre. State of origin is for records only.",
  family: "We send every update to the main contact. Add a second parent or guardian so we can reach someone if the first number is off.",
  dreams: "There are no wrong answers. Members who write a clear vision find it easier to set their first goal with a mentor.",
  finish: "The photo goes on the ID card, so we check it as soon as you add it. Tap the book icon on any agreement to read the full policy.",
  review: "Tap Edit on any section to change it. Nothing is sent until you press Send application.",
};
/* Column spans on the 6-column grid (≥ 680 wide); anything unlisted is full width. */
const APF_SPAN = { firstName: 2, middleName: 2, surname: 2, dob: 3, sex: 3, email: 3, mobile: 3, class: 3, classArm: 3, resState: 3, resLga: 3, originState: 3, originLga: 3, nationality: 3, parent1Name: 3, parent1Phone: 3, parent2Name: 3, parent2Phone: 3, promoCode: 3, heardFrom: 3 };
/* The agreements and the consent types they become (the Club requires all of them). */
const APF_AGREE = [
  { id: "cParticipation", pol: "participation", types: ["participation"], t: "Taking part", s: "Sessions, mentoring and projects, following the conduct and safeguarding rules." },
  { id: "cMedical", pol: "medical", types: ["medical"], t: "Emergency care", s: "If we can’t reach the family and care can’t wait, staff may arrange urgent treatment." },
  { id: "cData", pol: "privacy", types: ["data"], t: "Privacy", s: "Details are kept to run the programme under the Nigeria Data Protection Act, and never sold." },
  { id: "cComms", pol: "updates", types: ["comms"], t: "Family updates", s: "Reports, evaluations, results and notices go to the parents by SMS, email and WhatsApp." },
  { id: "cMedia", pol: "media", types: ["media", "site_visibility"], t: "Photos, videos and website", s: "NGG may use photos and videos from club activities, and show first name and work on its website. Never a surname, age or school with a photo." },
];
/* Kept for "Apply for another child": the family, not the child. */
const APF_SIBLING_KEEP = ["filledBy", "join", "centre", "address", "resState", "resLga", "originState", "originLga", "nationality", "parent1Rel", "parent1Name", "parent1Phone", "parent2None", "parent2Rel", "parent2Name", "parent2Phone", "heardFrom", "heardOther", "email", "promoCode"];
const APF_EMPTY = { filledBy: "", join: "", centre: "", nationality: "Nigerian", parent2None: false, hobbies: [], influenceAreas: [] };

function apfTitle(s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function apfPhone(s) { let d = String(s || "").replace(/\D/g, ""); if (d.startsWith("234")) d = "0" + d.slice(3); if (d.length === 10 && /^[789]/.test(d)) d = "0" + d; return d; }
/* NGV's application form, with what they already typed here carried over: a
   hand-off that opened an empty form (or, before, the programme's landing page,
   whose "Apply" was a WhatsApp group) lost people at exactly this step. The
   form pre-fills from these and saves nothing until it is sent. */
function apfNgvHref(base, v) {
  const u = new URL(base || "https://afrovanguard.org.ng/academy/ngv/register.php", location.href);
  const name = [v.firstName, v.middleName, v.surname].map(x => String(x || "").trim()).filter(Boolean).join(" ");
  const put = (k, x) => { if (x) u.searchParams.set(k, x); };
  put("from", "ngg"); put("name", name); put("dob", /^\d{4}-\d{2}-\d{2}$/.test(v.dob || "") ? v.dob : "");
  put("email", String(v.email || "").trim().toLowerCase()); put("phone", apfPhoneOk(apfPhone(v.mobile)) ? apfPhone(v.mobile) : "");
  return u.toString();
}
function apfPhoneOk(d) { return /^0[789][01]\d{8}$/.test(d); }
function apfAge(dob) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const b = new Date(dob + "T00:00"), n = new Date(); n.setHours(0, 0, 0, 0);
  if (isNaN(b)) return null;
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}
/* The usual age for a class, for the "check both are right" warning. */
function apfExpectedAge(cls) {
  let m = /Primary (\d)/.exec(cls || ""); if (m) return 5 + Number(m[1]);
  m = /JSS (\d)/.exec(cls || ""); if (m) return 10 + Number(m[1]);
  m = /SSS (\d)/.exec(cls || ""); if (m) return 13 + Number(m[1]);
  return cls ? 17 : null;
}
function apfEmailFix(e) {
  const s = String(e || "").trim().toLowerCase().replace(/\s+/g, "");
  const m = /^([^@]+)@([^@]+)$/.exec(s); if (!m) return null;
  const map = { "gmail.co": "gmail.com", "gmail": "gmail.com", "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.con": "gmail.com", "yahoo.co": "yahoo.com", "yahoo": "yahoo.com", "yaho.com": "yahoo.com", "outlook": "outlook.com", "hotmail.co": "hotmail.com" };
  return map[m[2]] ? m[1] + "@" + map[m[2]] : null;
}
function apfEmailOk(e) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(e || "").trim()); }
/* What joining costs, from the server's own fee terms, said before anybody applies. */
function apfFeesText(fees, kid, online) {
  const money = n => (typeof fmtMoney === "function" ? fmtMoney(n) : "₦" + Number(n).toLocaleString("en-NG"));
  /* NGG Online: the monthly price in dollars and naira, prepaid, mentor included; each course on top. */
  if (online) return "Nothing to pay today. If " + (kid ? "you are" : "your child is") + " offered a place, we send a private invoice link for the first month: "
    + (online.monthlyUsd ? "$" + online.monthlyUsd + " (" + money(online.monthly) + ")" : money(online.monthly)) + " a month, paid before each month, with a mentor included"
    + (online.course > 0 ? ", plus " + (online.courseUsd ? "$" + online.courseUsd + " (" + money(online.course) + ")" : money(online.course)) + (online.courseBasis === "once" ? " once" : " a month") + " for each course, with an instructor" : "")
    + ". No yearly membership fee.";
  if (!fees || !fees.enabled || !(fees.membershipFee > 0 || fees.monthlyCommitment > 0)) return "Nothing to pay today. After acceptance we send a private invoice link. The first month covers only the Saturdays left.";
  const parts = [];
  if (fees.membershipFee > 0) parts.push("the " + money(fees.membershipFee) + " membership fee" + (fees.membershipEveryMonths === 12 ? " (once a year)" : ""));
  if (fees.monthlyCommitment > 0) parts.push(money(fees.monthlyCommitment) + " a month");
  return "Nothing to pay today. If " + (kid ? "you are" : "your child is") + " offered a place, we send a private invoice link for " + parts.join(" and ")
    + ". The first month is charged only for the meetings left from the start date" + (fees.bank ? ". Pay online or by bank transfer." : ".");
}
function apfCourse(v) { return v.course === APF_OTHER_COURSE ? v.courseOther : v.course; }

/** The seven steps and their fields. `offer` is public.programme: the Club's centres and divisions. */
function apfSteps(v, offer) {
  const kid = v.filledBy === "child", you = kid ? "you" : "your child";
  const centres = ((offer && offer.centres) || []).map(c => [c.name, c.name, c.area || ""]);
  /* NGG Online is a way to take part, not one more centre in the list (docs/ONLINE-MEMBERS-PLAN.md): asked
     first, and choosing it removes the centre question — the server places the applicant itself. */
  const on = offer && offer.online && offer.online.available ? offer.online : null;
  const N = n => "₦" + Number(n || 0).toLocaleString("en-NG");
  const online = !!on && v.join === "online";
  const joinField = on ? [{ id: "join", type: "seg", label: "How will " + you + " take part?", req: 1, wide: 1, opts: [
    ["centre", "At a centre", "Scholarship · Saturdays in person", "map-pin"],
    ["online", "Online", (on.monthlyUsd ? "$" + on.monthlyUsd + " (" + N(on.monthly) + ")" : N(on.monthly)) + " a month · a mentor included", "globe"]] }] : [];
  const centreField = online ? [] : [{ id: "centre", type: "seg", label: "Which centre will you attend?", req: 1, opts: centres, loading: !offer }];
  return [
    { id: "start", l: "Start", t: "Let’s get started", s: "NGG is for ages 10 to 17. Two quick questions so we show you the right form.", f: [
      { id: "filledBy", type: "seg", label: "Who is filling in this form?", req: 1, wide: 1, opts: [["parent", "I’m a parent or guardian", "Applying for my child", "users"], ["child", "I’m applying for myself", "I’ll add my parents’ details", "user"]] },
      ...joinField, ...centreField,
      ...(online ? [{ id: "onlineInfo", type: "info", text: "Online members never come to a centre. You get a named mentor, a live online session every " + ((on.session && on.session.day) || "Saturday") + " at " + ((on.session && on.session.time) || "8:30") + ", an instructor for each course, the Labs with exams and certificates, the journal, the community, a monthly progress report and a digital member card." }] : [])] },
    { id: "about", l: "Applicant", t: kid ? "About you" : "About your child", s: "As written on their school records. This is the name we print on the ID card.", f: [
      { id: "firstName", type: "text", label: "First name", req: 1, ac: "given-name", ph: "e.g. Tolulope" },
      { id: "middleName", type: "text", label: "Middle name(s)", ac: "additional-name", ph: "Leave blank if none" },
      { id: "surname", type: "text", label: "Surname (family name)", req: 1, ac: "family-name", ph: "e.g. Adebayo" },
      { id: "dob", type: "text", inType: "date", label: "Date of birth", req: 1 },
      { id: "sex", type: "seg", label: "Sex", req: 1, narrow: 1, opts: [["Female", "Female"], ["Male", "Male"]] },
      { id: "email", type: "text", inType: "email", inputMode: "email", ac: "email", label: "Email address", req: 1, ph: "name@gmail.com", hint: "We send the application copy and portal sign-in here. A parent’s email is fine." },
      { id: "mobile", type: "text", inType: "tel", inputMode: "tel", ac: "tel", label: kid ? "Your mobile number" : "Child’s mobile number", prefix: "+234", ph: "0803 123 4567", hint: "If they don’t have one, use the parent’s number.", req: 1 }] },
    { id: "school", l: "School", t: "School", s: "Helps us group members and support schoolwork.", f: [
      { id: "school", type: "combo", label: "Name of school", req: 1, ph: "Start typing the school name", opts: APF_SCHOOLS, free: 1, remote: "schools" },
      { id: "class", type: "combo", label: "Class", req: 1, ph: "Search, e.g. JSS 2", groups: APF_CLASSES },
      { id: "classArm", type: "text", label: "Class arm or department", ph: "e.g. A, D, Science", hint: "Optional." }] },
    { id: "home", l: "Home", t: "Home and origin", s: "Where " + you + " live now, and where the family is from.", f: [
      { id: "address", type: "textarea", label: "Home address", req: 1, ph: "House number, street, area, nearest bus stop", rows: 3 },
      { id: "resState", type: "combo", label: "State you live in", req: 1, ph: "Search states", opts: APF_STATES },
      { id: "resLga", type: "combo", label: "Local government you live in", req: 1, ph: v.resState ? "Search " + v.resState + " local governments" : "Choose the state first", opts: APF_LGAS[v.resState] || [], free: !APF_LGAS[v.resState] },
      { id: "hOrigin", type: "heading", label: "Origin", hint: "For records only" },
      { id: "originState", type: "combo", label: "State of origin", req: 1, ph: "Search states", opts: APF_STATES },
      { id: "originLga", type: "combo", label: "Local government of origin", ph: "Optional", opts: APF_LGAS[v.originState] || [], free: 1 },
      { id: "nationality", type: "combo", label: "Nationality", req: 1, ph: "Search", opts: APF_NATIONALITIES, free: 1 }] },
    { id: "family", l: "Family", t: kid ? "Your parents or guardians" : "Parents and guardians", s: "We contact the main contact for every update. Their numbers are never shared.", f: [
      { id: "parent1Rel", type: "seg", label: "Main contact is", req: 1, narrow: 1, opts: [["Father", "Father"], ["Mother", "Mother"], ["Guardian", "Guardian"]] },
      { id: "parent1Name", type: "text", label: "Full name", req: 1, ac: "off", ph: "e.g. Mrs. Adunni Adebayo" },
      { id: "parent1Phone", type: "text", inType: "tel", inputMode: "tel", label: "Phone number", req: 1, prefix: "+234", ph: "0803 123 4567" },
      { id: "hSecond", type: "heading", label: "Second parent or guardian", hint: "" },
      { id: "parent2None", type: "toggle", text: "There is no second parent or guardian to add" },
      ...(v.parent2None ? [] : [
        { id: "parent2Rel", type: "seg", label: "Relationship", req: 1, narrow: 1, opts: [["Father", "Father"], ["Mother", "Mother"], ["Guardian", "Guardian"]] },
        { id: "parent2Name", type: "text", label: "Full name", req: 1, ph: "Full name" },
        { id: "parent2Phone", type: "text", inType: "tel", inputMode: "tel", label: "Phone number", prefix: "+234", ph: "Optional if it’s the same as above" }])] },
    { id: "dreams", l: "Interests", t: kid ? "Your interests and vision" : "Their interests and vision", s: kid ? "There are no wrong answers. Say it in your own words." : "Let your child answer these in their own words if they can.", f: [
      { id: "hCourse", type: "heading", label: "1 · Course", hint: "One to start; you can add more later" },
      { id: "course", type: "cards", label: "Which course would " + you + " like to take?", req: 1, loading: !offer },
      ...(v.course === APF_OTHER_COURSE ? [{ id: "courseOther", type: "text", label: "Which course?", req: 1, ph: "Tell us what you’d like to learn" }] : []),
      { id: "hVision", type: "heading", label: "2 · Vision", hint: "In your own words" },
      { id: "vision", type: "textarea", label: kid ? "Your vision" : "Their vision", req: 1, ph: "e.g. I want to become a doctor who opens a free clinic in my community.", hint: "Who do you want to become, and what difference do you want to make? A sentence or two.", minLen: 40, starters: ["I want to become ", "The change I want to see is ", "I want to help ", "In ten years I will "] },
      { id: "hHobbies", type: "heading", label: "3 · Hobbies", hint: "What you enjoy outside school" },
      { id: "hobbies", type: "chips", label: "Pick what " + (kid ? "you enjoy" : "they enjoy"), req: 1, opts: APF_HOBBIES.concat((v.hobbies || []).filter(h => !APF_HOBBIES.includes(h))), max: 8, addable: 1, hint: "Tap to choose. Not listed? Add your own." },
      { id: "hLead", type: "heading", label: "4 · Leadership", hint: "Up to three" },
      { id: "influenceAreas", type: "chips", label: "Where would " + you + " like to be a great influence and leader?", req: 1, opts: APF_AREAS, max: 3, hint: "Choose the areas that matter most." },
      ...((v.influenceAreas || []).includes("Something else") ? [{ id: "influenceOther", type: "text", label: "Which other area?", req: 1, ph: "e.g. Cybersecurity, music, women’s rights" }] : [])] },
    { id: "finish", l: "Finish", t: "Photo and agreements", s: kid ? "Last step. Fill in the agreements with your parent or guardian." : "Last step. The agreements come from the parent or guardian.", f: [
      { id: "photo", type: "photo", label: "Passport photo of " + (kid ? "you" : "your child"), req: 1 },
      { id: "agree", type: "agree", req: 1 },
      { id: "trips", type: "toggle", pol: "trips", text: "Supervised off-site activities are fine. The family is told before each one." },
      { id: "feesInfo", type: "info", pol: "fees", text: apfFeesText(offer && offer.fees, kid, online ? on : null) },
      { id: "promoCode", type: "text", label: "Referral or promo code", ph: "e.g. NEXTGENGENMEM", hint: "Only if someone gave you one. Letters and numbers, no spaces." },
      { id: "heardFrom", type: "combo", label: "How did you hear about NGG?", req: 1, ph: "Choose one", opts: APF_HEAR },
      ...(v.heardFrom === "Something else" ? [{ id: "heardOther", type: "text", label: "Tell us where", req: 1 }] : [])] },
    { id: "review", l: "Review", t: "Check and send", s: "Make sure everything is right. Tap Edit to change a section.", f: [] },
  ];
}

/** The one rule book for a field. '' when it is fine. The server runs the same rules. */
function apfErr(f, v) {
  const x = v[f.id];
  const empty = x == null || x === "" || (Array.isArray(x) && !x.length) || x === false;
  if (f.type === "agree") { const n = APF_AGREE.filter(it => v[it.id] !== true).length; return !n ? "" : n === APF_AGREE.length ? "Tick each agreement to continue." : n + (n > 1 ? " agreements" : " agreement") + " still to tick."; }
  if (f.type === "photo") {
    const m = v.photoMeta || {};
    if (!v.photoData && !v.photoUrl) return "Add a passport photo.";
    if (m.serverIssues && m.serverIssues.length) return m.serverIssues.slice(0, 2).map(i => PHOTO_QA_WORDS[i] || "").join(" ").trim();
    if (m.issues && m.issues.length) return PHOTO_QA_WORDS[m.issues[0]] || PHOTO_QA_WORDS.blurry;
    if (m.faces === 0) return "We couldn’t find a face. Fit the face in the oval and retake.";
    if (m.faces > 1) return "Only one person can be in the photo.";
    return "";
  }
  if (f.req && empty) return f.type === "seg" || f.type === "cards" || f.type === "combo" ? "Choose an option." : f.type === "chips" ? "Pick at least one." : "This is required.";
  if (empty) return "";
  if (f.id === "dob") {
    const a = apfAge(x);
    if (a == null) return "Enter a real date.";
    if (a < 0 || a > 40) return "Check the year of birth.";
    if (a < 10) return "NGG is for ages 10 to 17. This date makes them " + a + ".";
    if (a >= 18) return "NGG is for ages 10 to 17. At 18 and over, register for NGV instead.";
  }
  if (f.id === "email" && !apfEmailOk(x)) return "Enter a full email address, like name@gmail.com.";
  if (/Phone$|^mobile$/.test(f.id) && !apfPhoneOk(apfPhone(x))) return "Enter an 11-digit Nigerian number starting 070, 080, 081, 090 or 091.";
  if (f.minLen && String(x).trim().length < f.minLen) return "Write at least 40 characters: who you want to become and why.";
  if (f.type === "textarea" && /^(yes|no|nil|none|ok)$/i.test(String(x).trim())) return "Please answer in your own words.";
  if (f.id === "address" && String(x).trim().length < 6) return "Add the street and area.";
  if (f.id === "promoCode" && !/^[A-Za-z0-9]{4,20}$/.test(String(x).trim())) return "Codes are 4 to 20 letters or numbers, with no spaces or phone numbers.";
  if (f.id === "firstName" && v.surname && String(x).trim().toLowerCase() === String(v.surname).trim().toLowerCase()) return "First name and surname are the same. Check you haven’t typed the surname twice.";
  if ((f.id === "parent1Name" || f.id === "parent2Name") && String(x).trim().length < 3) return "Write the full name.";
  return "";
}

/** Crop to 3:4, keep it at 600 × 800 (never enlarged), and judge it by the photo quality gate
 *  (photoQa* in components.jsx — the server's rules, run here first). */
async function apfAnalysePhoto(el, w, h, bias) {
  const r = 3 / 4; let cw = w, ch = h;
  if (w / h > r) cw = Math.round(h * r); else ch = Math.round(w / r);
  const sx = Math.round((w - cw) / 2), sy = Math.round((h - ch) * bias);
  /* 600 × 800 when the original has the pixels; a smaller original keeps its own size and is
     refused as too small — enlarging it would only hide that it cannot print sharply. */
  const ow = Math.min(600, cw), oh = Math.round(ow * 4 / 3);
  const c = document.createElement("canvas"); c.width = ow; c.height = oh;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(el, sx, sy, cw, ch, 0, 0, ow, oh);
  /* Measured on the JPEG as it will be sent, so the browser and the server judge the same pixels. */
  const data = c.toDataURL("image/jpeg", 0.86);
  const back = new Image(); back.src = data; await back.decode();
  const k = document.createElement("canvas"); k.width = ow; k.height = oh;
  k.getContext("2d", { willReadFrequently: true }).drawImage(back, 0, 0);
  const qa = photoQaMeasure(k), issues = photoQaJudge(qa, cw, ch);
  let faces = null;
  if ("FaceDetector" in window) { try { faces = (await new window.FaceDetector({ maxDetectedFaces: 3 }).detect(c)).length; } catch (_) {} }
  return { data, meta: Object.assign({ w: cw, h: ch, faces, issues }, qa) };
}
function apfDataUrlFile(dataUrl) {
  const [head, b64] = String(dataUrl).split(",");
  const bin = atob(b64 || ""), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new File([u], "passport.jpg", { type: (/data:([^;]+)/.exec(head) || [])[1] || "image/jpeg" });
}
function apfLoadDraft() {
  try { const s = JSON.parse(localStorage.getItem(APF_DRAFT_KEY) || "null"); if (s && s.v) return s; } catch (_) {}
  return null;
}

/* Server refusals, in the words the form uses, and the step that fixes them. */
const APF_FIELD_STEP = { filledBy: 0, join: 0, centre: 0, firstName: 1, surname: 1, dob: 1, sex: 1, email: 1, mobile: 1, school: 2, class: 2, address: 3, resState: 3, resLga: 3, originState: 3, nationality: 3,
  parent1Rel: 4, parent1Name: 4, parent1Phone: 4, parent2Rel: 4, parent2Name: 4, parent2Phone: 4, vision: 5, hobbies: 5, influenceAreas: 5, heardFrom: 6, promoCode: 6 };
function apfServerWhy(e) {
  const code = (e && (e.code || e.message)) || "";
  const d = (e && e.data) || {};
  const map = {
    rate_limited: "Too many sends from this connection. Wait a few minutes and try again.",
    applications_closed: "Applications are closed right now. Your answers are saved on this device.",
    age_ngv: "NGG is for ages 10 to 17. At 18 and over, register for NGV instead.",
    bad_age: "NGG is for ages 10 to 17. Check the date of birth.",
    consent_required: "Every agreement is needed to join. Tick the ones still open.",
    bad_promo: "Codes are 4 to 20 letters or numbers, with no spaces or phone numbers.",
    vision_too_short: "Write at least 40 characters for the vision.",
    bad_phone: "One of the phone numbers isn’t an 11-digit Nigerian number.",
    photo_required: "Add a passport photo.",
    photo_low_quality: photoQaServerWords(e),
    centre_not_offered: d.detail || "That centre doesn’t run the Club. Choose another on the first step.",
    online_unavailable: d.detail || "NGG Online isn’t taking applications right now. Choose a centre on the first step.",
    upstream_unreachable: "We couldn’t reach the server. Your answers are saved here; try again in a moment.",
    bad_dob: "Check the date of birth: it must be a real date.",
    bad_sex: "Choose Female or Male.",
    bad_email: "Enter a full email address, like name@gmail.com.",
    phone_required: "Add a mobile number.",
    bad_division: "Choose the course again: the list has changed since this page opened.",
    division_required: "Choose a course.",
    course_not_in_division: d.detail ? d.detail + " Choose the course again." : "Choose the course again.",
    details_required: d.message || "Some answers did not reach us. Reload the page and send again; your answers are kept.",
  };
  const step = ["age_ngv", "bad_age", "bad_dob", "bad_sex", "bad_email", "phone_required"].includes(code) ? 1
    : ["bad_division", "division_required", "course_not_in_division"].includes(code) ? 5
    : code === "consent_required" || code === "photo_required" || code === "photo_low_quality" ? 6 : code === "centre_not_offered" || code === "online_unavailable" ? 0
    : d.field && APF_FIELD_STEP[d.field] != null ? APF_FIELD_STEP[d.field] : -1;
  return { text: map[code] || (d.field ? "Something in this section needs another look." : "We couldn’t send the application. Your answers are saved here; try again."), step };
}

/* ── The page ────────────────────────────────────────────────────────────── */

function ClubApplyPage({ setPage }) {
  const rootRef = React.useRef(null);
  const [W, setW] = React.useState(1200);
  const draft = React.useMemo(apfLoadDraft, []);
  const [v, setV] = React.useState(() => {
    const seed = {};
    try { const q = new URLSearchParams(location.search); if (q.get("centre")) seed.centre = q.get("centre"); } catch (_) {}
    return Object.assign({}, APF_EMPTY, seed, draft ? draft.v : {});
  });
  const [step, setStep] = React.useState(draft ? Math.min(7, draft.step || 0) : 0);
  const [saved, setSaved] = React.useState(!!draft);
  const [touched, setTouched] = React.useState({});
  const [tried, setTried] = React.useState({});
  const [done, setDone] = React.useState(null);           // { ref, updated, first, email, centre }
  const [busy, setBusy] = React.useState(false);
  const [sendErr, setSendErr] = React.useState("");
  /* Changing an application already sent needs the code emailed to that
     address (the server sends it when the same child applies again). */
  const [codeAsk, setCodeAsk] = React.useState(null);   // { text } once a code has been emailed
  const [editCode, setEditCode] = React.useState("");
  const [toast, setToast] = React.useState("");
  const [pol, setPol] = React.useState("");
  const [offer, setOffer] = React.useState(null);
  const [offerErr, setOfferErr] = React.useState(null);
  const say = React.useCallback(t => { clearTimeout(say._t); setToast(t); say._t = setTimeout(() => setToast(""), 3500); }, []);

  React.useLayoutEffect(() => {
    const el = rootRef.current; if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* NGV registers on Afrovanguard: its address is the deployment's (afrovanguard.ngv_url). */
  const [ngvUrl, setNgvUrl] = React.useState(window.NGV_URL || "");
  React.useEffect(() => {
    if (window.NGV_URL) return;
    NGGApi.config().then(c => { const u = c && c.afrovanguard && c.afrovanguard.ngvUrl; if (u) setNgvUrl(u); }).catch(() => {});
  }, []);
  const loadOffer = React.useCallback(() => { setOfferErr(null); NGGApi.public.programme("anchor").then(setOffer, setOfferErr); }, []);
  React.useEffect(loadOffer, [loadOffer]);
  // A centre from a link or an old draft that the Club does not run is cleared, not sent.
  React.useEffect(() => {
    if (!offer || !v.centre) return;
    const hit = (offer.centres || []).find(c => c.name.toLowerCase() === String(v.centre).toLowerCase());
    if (!hit) set({ centre: "" }); else if (hit.name !== v.centre) set({ centre: hit.name });
  }, [offer]);
  // Autosave: every change, on this device, cleared on send.
  React.useEffect(() => {
    if (done) return;
    try { localStorage.setItem(APF_DRAFT_KEY, JSON.stringify({ v, step })); setSaved(true); } catch (_) {}
  }, [v, step, done]);

  function set(patch) { setV(cur => Object.assign({}, cur, typeof patch === "function" ? patch(cur) : patch)); }
  const touch = id => setTouched(t => (t[id] ? t : Object.assign({}, t, { [id]: true })));

  /* The photo: analysed here, then uploaded in the background so Send is quick. */
  const upSeq = React.useRef(0);
  const takePhoto = async (el, w, h, src, bias) => {
    const { data, meta } = await apfAnalysePhoto(el, w, h, bias);
    const seq = ++upSeq.current;
    set({ photoData: data, photoMeta: Object.assign({ src }, meta), photoUrl: "" });
    touch("photo");
    const bad = apfErr({ id: "photo", type: "photo", req: 1 }, { photoData: data, photoMeta: meta });
    say(bad ? "This photo needs another try" : "Photo meets the ID card rules");
    if (bad) return;
    try { const up = await NGGApi.uploadOrInline(apfDataUrlFile(data), "headshot"); if (seq === upSeq.current) set({ photoUrl: up.url }); } catch (_) { /* retried on Send */ }
  };
  const addPhotoFile = async (file, src) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return say("Choose a photo (JPG or PNG).");
    if (file.size > 8e6) return say("That photo is over 8 MB. Try a smaller one.");
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); await takePhoto(img, img.naturalWidth, img.naturalHeight, src, 0.35); }
    catch (_) { say("We couldn’t open that photo. Try a JPG or PNG."); }
    finally { URL.revokeObjectURL(url); }
  };

  /* "Applied before?" — asked once the email and date of birth are both
     good, debounced. The server answers yes or no and nothing else. */
  const [seen, setSeen] = React.useState(null);     // null | { seen, open }
  React.useEffect(() => {
    setSeen(null);
    const email = String(v.email || "").trim().toLowerCase();
    if (!apfEmailOk(email) || apfAge(v.dob) == null || !NGGApi.public.applyCheck) return;
    const t = setTimeout(() => { NGGApi.public.applyCheck(email, v.dob).then(r => setSeen(r && r.seen ? r : null), () => {}); }, 700);
    return () => clearTimeout(t);
  }, [v.email, v.dob]);
  const steps = apfSteps(v, offer);
  const last = steps.length - 1;
  const st = steps[Math.min(step, last)];
  const issues = i => steps[i].f.filter(f => apfErr(f, v)).length;
  const firstBad = steps.findIndex((s, i) => i < last && issues(i) > 0);
  const maxReach = firstBad < 0 ? last : firstBad;
  const errs = st.f.map(f => [f, apfErr(f, v)]).filter(x => x[1]);
  const age = apfAge(v.dob);
  const wide = W >= 1000, xl = W >= 1280, mid = W >= 680, tiny = W < 380;
  const sideOn = wide && !done, rightOn = xl && !done;

  const scrollTop = () => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) { window.scrollTo(0, 0); } };
  const go = i => { setSendErr(""); setStep(i); scrollTop(); };
  const focusField = id => setTimeout(() => {
    const el = document.getElementById("apf-fld-" + id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
    const inp = el.querySelector("input,textarea,button"); inp && inp.focus({ preventScroll: true });
  }, 30);

  async function send() {
    if (firstBad >= 0) { setTried(t => Object.assign({}, t, { [steps[firstBad].id]: true })); go(firstBad); say("Something in “" + steps[firstBad].l + "” needs fixing."); return; }
    setBusy(true); setSendErr("");
    try {
      let photoUrl = v.photoUrl;
      if (!photoUrl && v.photoData) { photoUrl = (await NGGApi.uploadOrInline(apfDataUrlFile(v.photoData), "headshot")).url; set({ photoUrl }); }
      const course = v.course === APF_OTHER_COURSE ? "" : v.course;
      const division = course ? (((offer && offer.faculties) || []).find(f => f.courses.includes(course)) || {}).faculty || "" : "";
      const consents = { trips: !!v.trips };
      APF_AGREE.forEach(a => a.types.forEach(t => { consents[t] = v[a.id] === true; }));
      const r = await sendIntake("public.apply", {
        kind: "teen", program: "anchor",
        firstName: v.firstName.trim(), lastName: v.surname.trim(), otherName: (v.middleName || "").trim(),
        email: v.email.trim().toLowerCase(), phone: apfPhone(v.mobile), sex: v.sex, dob: v.dob,
        centre: v.join === "online" ? "" : v.centre, ...(v.join === "online" ? { mode: "online" } : {}), track: course, ...(division ? { division } : {}),
        why: v.vision.trim(), photoUrl,
        details: {
          filledBy: v.filledBy, school: v.school, class: v.class, classArm: v.classArm || "",
          address: v.address, resState: v.resState, resLga: v.resLga, originState: v.originState, originLga: v.originLga || "", nationality: v.nationality,
          parent1Rel: v.parent1Rel, parent1Name: v.parent1Name, parent1Phone: apfPhone(v.parent1Phone),
          parent2None: !!v.parent2None, parent2Rel: v.parent2Rel || "", parent2Name: v.parent2Name || "", parent2Phone: v.parent2Phone ? apfPhone(v.parent2Phone) : "",
          courseOther: v.course === APF_OTHER_COURSE ? v.courseOther : "",
          hobbies: v.hobbies, influenceAreas: (v.influenceAreas || []).filter(a => a !== "Something else").concat(v.influenceOther ? [v.influenceOther] : []),
          influenceOther: v.influenceOther || "", heardFrom: v.heardFrom === "Something else" ? (v.heardOther || "Something else") : v.heardFrom,
          heardOther: v.heardOther || "", promoCode: (v.promoCode || "").trim().toUpperCase(),
        },
        consents,
        ...(codeAsk && editCode.trim() ? { editCode: editCode.trim() } : {}),
      });
      setCodeAsk(null); setEditCode("");
      try { localStorage.removeItem(APF_DRAFT_KEY); } catch (_) {}
      setDone({ ref: (r && r.ref) || "", updated: !!(r && r.updated), queued: !!(r && r.queued), first: v.firstName, email: v.email, centre: v.join === "online" ? "" : v.centre, online: v.join === "online", phone: v.parent1Phone || v.mobile });
      scrollTop();
    } catch (e) {
      const code = (e && (e.code || e.message)) || "";
      if (code === "edit_code_sent" || code === "edit_code_wrong") {
        const m = (e.data && e.data.message) || (code === "edit_code_wrong" ? "That code is not right. Check the latest email from NGG." : "This child has already applied. We emailed a 6-digit code: enter it to update the application.");
        setCodeAsk({ text: m }); setSendErr(""); if (code === "edit_code_sent") setEditCode("");
        return;
      }
      if (code === "photo_low_quality") {
        // The server measured the photo again and refused it: say why on the photo itself.
        const iss = (e.data && Array.isArray(e.data.issues)) ? e.data.issues : ["blurry"];
        set(cur => ({ photoMeta: Object.assign({}, cur.photoMeta || {}, { serverIssues: iss }) }));
      }
      const w = apfServerWhy(e);
      setSendErr(w.text);
      if (w.step >= 0 && steps[w.step]) { setTried(t => Object.assign({}, t, { [steps[w.step].id]: true })); go(w.step); setSendErr(w.text); }
    } finally { setBusy(false); }
  }
  function next() {
    if (step === last) return send();
    if (errs.length) { setTried(t => Object.assign({}, t, { [st.id]: true })); focusField(errs[0][0].id); return; }
    go(step + 1);
  }
  const sibling = () => {
    const nv = Object.assign({}, APF_EMPTY);
    APF_SIBLING_KEEP.forEach(k => { if (v[k] !== undefined) nv[k] = v[k]; });
    setV(nv); setTouched({}); setTried({}); setDone(null); setStep(1); scrollTop();
    say("Parent, address and centre kept. Add the next child’s details.");
  };
  const restart = () => {
    try { localStorage.removeItem(APF_DRAFT_KEY); } catch (_) {}
    setV(Object.assign({}, APF_EMPTY)); setTouched({}); setTried({}); setDone(null); setStep(0); setSaved(false); scrollTop();
  };

  const cls = "apf" + (mid ? " apf--mid" : "") + (wide ? " apf--wide" : "") + (xl ? " apf--xl" : "") + (tiny ? " apf--tiny" : "");
  /* An error shows once the person has left the field, or pressed Continue on
     this step. "Tried" is keyed by the step's id, not its position: steps come
     and go with the applicant's age, and a position would carry a Continue
     press over to a step they have not reached. */
  const showErr = id => !!(touched[id] || tried[st.id]);
  const ngvOn = st.id === "about" && age != null && age >= 18 && age <= 40;

  return (
    <div ref={rootRef} className={cls} data-screen-label="09 Join · Club">
      <header className="apf-head">
        <div className="apf-head-in">
          <span className="apf-head-t"><b>Join the Next Generation Genius Club</b><span>Application · about 8 minutes</span></span>
          {!tiny && <span className="apf-saved"><i className="ph ph-floppy-disk" aria-hidden="true"/>{saved ? "Saved on this device" : "Saves as you go"}</span>}
        </div>
      </header>

      <main className={"apf-main" + (rightOn ? " has-right" : sideOn ? " has-side" : "")}>
        {sideOn && (
          <aside className="apf-side" aria-label="Application steps">
            <nav className="apf-steplist">
              {steps.map((s, i) => {
                const cur = i === step, n = issues(i), ok = i < step && !n, bad = i < step && n > 0, locked = i > maxReach && i > step;
                return (
                  <button key={s.id} type="button" className={"apf-steprow" + (cur ? " is-cur" : "") + (ok ? " is-done" : "") + (bad ? " is-bad" : "")} disabled={locked} aria-current={cur ? "step" : undefined} onClick={() => go(i)}>
                    <span className="apf-stepdot">{ok ? <i className="ph ph-check" aria-hidden="true"/> : i + 1}</span>
                    <span className="apf-steptext"><span>{s.l}</span><em>{cur ? "You’re here" : ok ? "Done" : bad ? n + " to fix" : locked ? "Not yet" : "Ready"}</em></span>
                  </button>
                );
              })}
            </nav>
            <div className="apf-sidenote">
              <span><i className="ph ph-clock" aria-hidden="true"/>About 8 minutes in total</span>
              <span><i className="ph ph-floppy-disk" aria-hidden="true"/>Close the page any time; we keep your answers on this device.</span>
            </div>
            {!rightOn && <ApfTip id={st.id} small/>}
          </aside>
        )}

        <div className="apf-col">
          {!done && <>
            {!sideOn && (
              <div className="apf-topsteps">
                <div className="apf-topsteps-t"><b>Step {step + 1} of {steps.length} · {st.l}</b><span>{step === last ? "Last step" : (last - step) + " to go"}</span></div>
                <ol aria-label="Steps">
                  {steps.map((s, i) => {
                    const locked = i > maxReach && i > step;
                    return <li key={s.id}><button type="button" className={i < step ? "is-done" : i === step ? "is-cur" : ""} disabled={locked} title={s.l}
                      aria-label={"Step " + (i + 1) + ": " + s.l + (i < step ? ", done" : "")} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}/></li>;
                  })}
                </ol>
              </div>
            )}
            <section className="apf-card" aria-labelledby="apf-h1">
              <div className="apf-card-h"><h1 id="apf-h1">{st.t}</h1><span>{st.s}</span></div>
              {tried[st.id] && errs.length > 0 && (
                <div className="apf-errsum" role="alert">
                  <b><i className="ph ph-warning-circle" aria-hidden="true"/>{errs.length === 1 ? "One thing needs fixing" : errs.length + " things need fixing"}</b>
                  {errs.map(([f, e]) => <button key={f.id} type="button" onClick={() => focusField(f.id)}>{(f.label || (f.type === "agree" ? "Agreements" : "This")) + ": " + e}</button>)}
                </div>
              )}
              {sendErr && <div className="apf-errsum" role="alert"><b><i className="ph ph-warning-circle" aria-hidden="true"/>{sendErr}</b></div>}
              {codeAsk && (
                <div className="apf-note apf-code" role="alert">
                  <i className="ph ph-envelope-simple" aria-hidden="true"/>
                  <div className="apf-code-in">
                    <span>{codeAsk.text}</span>
                    <label className="apf-code-l" htmlFor="apf-editcode">6-digit code</label>
                    <input id="apf-editcode" className="apf-input apf-code-f" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={editCode}
                      onChange={e => setEditCode(e.target.value.replace(/\D/g, "").slice(0, 6))}/>
                    <span className="apf-hint">Then press Send again. Didn’t get it? Press Send with the box empty and we send a new one.</span>
                  </div>
                </div>
              )}
              {st.id === "about" && seen && (
                <div className="apf-note" role="note"><i className="ph ph-info" aria-hidden="true"/>
                  <span>{seen.open ? "Looks like this child has applied before. Sending this will update that application instead of creating a second one."
                    : "Looks like this child has applied before, and that application has been decided. If you’re not sure, contact us before sending another."}</span>
                </div>
              )}
              {ngvOn && (
                <div className="apf-ngv" role="alert">
                  <span className="apf-ngv-k">NEXT GENERATION VANGUARD</span>
                  <b>{(v.firstName ? v.firstName + " is " : "You’re ") + age + ": register for NGV instead"}</b>
                  <span>NGG is for ages 10 to 17. At 18 and over, members join NGV, our leadership class: mentor younger members, lead projects and grow as a young leader.</span>
                  <div className="apf-ngv-row">
                    <a href={apfNgvHref(ngvUrl, v)} className="apf-ngv-btn" rel="noopener">Register for NGV<i className="ph ph-arrow-right" aria-hidden="true"/></a>
                    <a href="/join/volunteer" className="apf-ngv-alt" onClick={e => { e.preventDefault(); setPage("ngg-volunteer"); }}>Or volunteer with NGG at a centre</a>
                    <span>Wrong date of birth? Fix it below.</span>
                  </div>
                </div>
              )}
              {st.id !== "review" && (
                <div className="apf-grid">
                  {st.f.map(f => <ApfField key={f.id} f={f} v={v} set={set} touch={touch} shown={!!apfErr(f, v) && showErr(f.id)} err={apfErr(f, v)}
                    W={W} offer={offer} offerErr={offerErr} reloadOffer={loadOffer} openPol={setPol} addPhotoFile={addPhotoFile} takePhoto={takePhoto} say={say} age={age}/>)}
                </div>
              )}
              {st.id === "review" && <ApfReview v={v} age={age} go={go}/>}
            </section>
            {sideOn && (
              <div className="apf-inlinebar">
                {step > 0 && <button type="button" className="apf-btn apf-btn--ghost" onClick={() => go(step - 1)}><i className="ph ph-arrow-left" aria-hidden="true"/>Back</button>}
                <span className="apf-grow apf-left">{step === last ? "Last step" : (last - step) + " to go"}</span>
                <ApfNext step={step} last={last} busy={busy} next={next} nextL={(steps[step + 1] || {}).l}/>
              </div>
            )}
          </>}
          {done && <ApfDone done={done} sibling={sibling} restart={restart} setPage={setPage}/>}
        </div>

        {rightOn && (
          <aside className="apf-right" aria-label="Summary">
            <section className="apf-idprev">
              <div className="apf-idprev-h"><img src="/assets/logo.png" alt=""/><b>NGG MEMBER</b><span>Preview</span></div>
              <div className="apf-idprev-b">
                <span className="apf-idprev-ph">{v.photoData || v.photoUrl ? <img src={v.photoData || v.photoUrl} alt=""/> : <i className="ph ph-camera" aria-hidden="true"/>}</span>
                <span className="apf-idprev-t">
                  <b>{v.surname || v.firstName ? [String(v.surname || "").toUpperCase(), [v.firstName, v.middleName].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "Your name here"}</b>
                  <span>{[v.class, v.school].filter(Boolean).join(" · ") || "Class and school"}</span>
                  <span>{[apfCourse(v), v.centre].filter(Boolean).join(" · ") || "Course and centre"}</span>
                </span>
              </div>
              <span className="apf-idprev-n">{v.photoData || v.photoUrl ? "Your photo, cropped to ID card size." : "Add the photo in the last step."}</span>
            </section>
            <ApfTip id={st.id}/>
          </aside>
        )}
      </main>

      {!wide && !done && (
        <div className="apf-bar">
          <div className="apf-bar-in">
            {step > 0 && <button type="button" className="apf-btn apf-btn--ghost" onClick={() => go(step - 1)}><i className="ph ph-arrow-left" aria-hidden="true"/>Back</button>}
            <span className="apf-grow"/>
            <ApfNext step={step} last={last} busy={busy} next={next} nextL={(steps[step + 1] || {}).l}/>
          </div>
        </div>
      )}
      {pol && <ApfPolicySheet pol={pol} wide={wide} v={v} set={set} close={() => setPol("")}/>}
      {toast && <div className="apf-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

/* The forward button names where it goes ("Next: School"), and the step before
   the last says what happens there — not "Continue" / "Review". */
function ApfNext({ step, last, busy, next, nextL }) {
  const l = step === last ? (busy ? "Sending…" : "Send application") : step === last - 1 ? "Check my answers" : nextL ? "Next: " + nextL : "Next step";
  return <button type="button" className="apf-btn apf-btn--ink" onClick={next} disabled={busy} aria-busy={busy || undefined}>{l}<i className={"ph " + (step === last ? "ph-paper-plane-tilt" : "ph-arrow-right")} aria-hidden="true"/></button>;
}
function ApfTip({ id, small }) {
  return <section className={"apf-tip" + (small ? " is-small" : "")}><span><i className="ph ph-lightbulb" aria-hidden="true"/>{id === "review" ? "Before you send" : "Why we ask"}</span><p>{APF_TIPS[id] || ""}</p></section>;
}

/* ── Fields ──────────────────────────────────────────────────────────────── */

function ApfField({ f, v, set, touch, shown, err, W, offer, offerErr, reloadOffer, openPol, addPhotoFile, takePhoto, say, age }) {
  const span = W >= 680 && APF_SPAN[f.id] ? " apf-span-" + APF_SPAN[f.id] : "";
  /* Never judge a field while it is being typed in. An error already showing
     when the person comes back to fix it stays until the value is right, then
     goes; a new one waits for them to leave the field. */
  const [foc, setFoc] = React.useState(false);
  const [hold, setHold] = React.useState(false);
  /* Typing in the INPUT, not focus anywhere in the field: the email's "Use it"
     button lives inside the field, so hiding the suggestion on any focus
     unmounted it the moment it was pressed, and the fix never landed. */
  const [typing, setTyping] = React.useState(false);
  React.useEffect(() => { if (foc && hold && !err) setHold(false); }, [foc, hold, err]);
  const onFoc = () => { if (!foc) { setFoc(true); setHold(!!shown); } };
  const onOut = e => { if (!e.currentTarget.contains(e.relatedTarget)) setFoc(false); };
  shown = !!shown && (!foc || hold);
  const inputId = "apf-in-" + f.id, errId = "apf-er-" + f.id;
  const val = v[f.id];
  const upd = x => set({ [f.id]: x });
  if (f.type === "heading") return <div className={"apf-fld apf-heading" + span}><h2>{f.label}</h2>{f.hint && <span>{f.hint}</span>}</div>;
  const hasLabel = !!f.label && !["toggle", "info", "agree"].includes(f.type);
  let help = null;
  if (f.id === "email" && !typing) { const fx = apfEmailFix(val); if (fx && fx !== String(val || "").trim().toLowerCase()) help = { tone: "warn", icon: "lightbulb", text: "Did you mean " + fx + "?", fixL: "Use it", fix: () => upd(fx) }; }
  if (f.id === "dob" && age != null && !err) help = { tone: "ok", icon: "check-circle", text: "Age " + age + " today" };
  if (f.id === "surname" && v.firstName && v.surname && !err && !foc) help = { tone: "muted", icon: "identification-card", text: "ID card: " + String(v.surname).toUpperCase() + ", " + v.firstName + (v.middleName ? " " + v.middleName : "") };
  if (f.id === "parent2Phone" && val && apfPhone(val) === apfPhone(v.parent1Phone)) help = { tone: "muted", icon: "info", text: "Same number as the main contact. That’s fine if they share a phone." };
  if (f.id === "class") { const exp = apfExpectedAge(val); if (age != null && exp != null && Math.abs(age - exp) > 2) help = { tone: "warn", icon: "warning", text: val + " is usually age " + exp + ", but the date of birth says " + age + ". Check both are right." }; }
  if (f.id === "resLga" && !v.resState) help = { tone: "muted", icon: "info", text: "Choose the state first." };
  const blurText = () => {
    let x = String(val || "");
    if (["firstName", "middleName", "surname", "parent1Name", "parent2Name", "courseOther", "heardOther", "influenceOther"].includes(f.id)) x = apfTitle(x);
    if (/Phone$|^mobile$/.test(f.id)) x = apfPhone(x);
    if (f.id === "email") x = x.trim().toLowerCase().replace(/\s+/g, "");
    if (f.id === "promoCode") x = x.trim().toUpperCase().replace(/\s+/g, "");
    if (x !== (val || "")) upd(x);
    touch(f.id);
  };
  return (
    <div id={"apf-fld-" + f.id} className={"apf-fld" + span} onFocus={onFoc} onBlur={onOut}>
      {hasLabel && (
        <div className="apf-label-row">
          <label htmlFor={inputId} className="apf-label">{f.label}{!f.req && f.type !== "photo" && <span>Optional</span>}</label>
        </div>
      )}
      {f.hint && f.type !== "chips" && <span className="apf-hint" id={"apf-hint-" + f.id}>{f.hint}</span>}

      {f.type === "text" && (
        <div className={"apf-input" + (shown ? " is-bad" : "")}>
          {f.prefix && <span className="apf-prefix">{f.prefix}</span>}
          <input id={inputId} type={f.inType || "text"} inputMode={f.inputMode} autoComplete={f.ac || "on"} value={val || ""} placeholder={f.ph || ""}
            max={f.inType === "date" ? new Date().toISOString().slice(0, 10) : undefined}
            onChange={e => upd(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => { setTyping(false); blurText(); }} aria-invalid={shown || undefined} aria-describedby={shown ? errId : f.hint ? "apf-hint-" + f.id : undefined}/>
        </div>
      )}
      {f.type === "textarea" && <ApfTextarea f={f} val={val} upd={upd} touch={touch} shown={shown} inputId={inputId} errId={errId}/>}
      {f.type === "seg" && (
        f.loading ? <ApfLoading err={offerErr} retry={reloadOffer} what="the centres"/> :
        !f.opts.length ? <p className="apf-hint">No centre is taking Club applications right now.</p> :
        <div role="radiogroup" aria-label={f.label} className={"apf-seg" + (f.wide ? " is-wide" : f.narrow ? " is-narrow" : "")}>
          {f.opts.map(([value, l, s2, icon]) => {
            const on = val === value;
            return (
              <button key={value} type="button" role="radio" aria-checked={on} className={"apf-opt" + (on ? " is-on" : "") + (shown ? " is-bad" : "")} onClick={() => { upd(value); touch(f.id); }}>
                {icon && <i className={"ph ph-" + icon} aria-hidden="true"/>}
                <span><b>{l}</b>{s2 && <em>{s2}</em>}</span>
              </button>
            );
          })}
        </div>
      )}
      {f.type === "chips" && <ApfChips f={f} val={val || []} upd={x => { upd(x); touch(f.id); }} say={say}/>}
      {f.type === "combo" && <ApfCombo f={f} val={val || ""} pick={x => { const p = { [f.id]: x }; if (f.id === "resState" && x !== v.resState) p.resLga = ""; if (f.id === "originState" && x !== v.originState) p.originLga = ""; set(p); touch(f.id); }}
        touch={() => touch(f.id)} shown={shown} inputId={inputId} errId={errId} phone={W < 680}/>}
      {f.type === "cards" && (f.loading ? <ApfLoading err={offerErr} retry={reloadOffer} what="the courses"/> : <ApfCourses offer={offer} val={val} pick={x => { upd(x); touch(f.id); }} shown={shown}/>)}
      {f.type === "photo" && <ApfPhoto v={v} err={err} W={W} addPhotoFile={addPhotoFile} takePhoto={takePhoto}/>}
      {f.type === "agree" && <ApfAgree v={v} set={set} shown={shown} touch={() => touch("agree")} openPol={openPol} W={W}/>}
      {f.type === "info" && <div className="apf-info"><i className="ph ph-receipt" aria-hidden="true"/><span>{f.text}</span></div>}
      {f.type === "toggle" && (
        <button type="button" role="switch" aria-checked={!!val} className={"apf-switch" + (val ? " is-on" : "")} onClick={() => upd(!val)}>
          <span className="apf-switch-track" aria-hidden="true"><span/></span><span>{f.text}</span>
        </button>
      )}
      {f.pol && !hasLabel && <button type="button" className="apf-pollink" onClick={() => openPol(f.pol)}><i className="ph ph-book-open-text" aria-hidden="true"/>{"Read the " + APF_POL[f.pol].toLowerCase() + " policy"}</button>}
      {help && <span className={"apf-help is-" + help.tone}><i className={"ph ph-" + help.icon} aria-hidden="true"/><span className="apf-help-t">{help.text}</span>{help.fix && <button type="button" onClick={help.fix}>{help.fixL}</button>}</span>}
      {shown && <span className="apf-err" id={errId}><i className="ph ph-warning-circle" aria-hidden="true"/>{err}</span>}
    </div>
  );
}

function ApfLoading({ err, retry, what }) {
  if (err) return <div className="apf-loaderr" role="alert"><span>We couldn’t load {what}. Check the connection.</span><button type="button" className="apf-btn apf-btn--ghost apf-btn--sm" onClick={retry}>Try again</button></div>;
  return <div className="apf-loading" role="status">Loading {what}…</div>;
}

function ApfTextarea({ f, val, upd, touch, shown, inputId, errId }) {
  const len = String(val || "").trim().length;
  const starter = s => {
    const cur = String(val || "");
    upd(cur ? cur.replace(/\s*$/, " ") + s : s);
    setTimeout(() => { const el = document.getElementById(inputId); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 30);
  };
  return <>
    {f.starters && len < f.minLen && (
      <div className="apf-starters"><span>Stuck? Start with:</span>{f.starters.map(s => <button key={s} type="button" onClick={() => starter(s)}>{s.trim()}…</button>)}</div>
    )}
    <textarea id={inputId} className={"apf-textarea" + (shown ? " is-bad" : "")} rows={f.rows || 4} value={val || ""} placeholder={f.ph || ""}
      onChange={e => upd(e.target.value)} onBlur={() => touch(f.id)} aria-invalid={shown || undefined} aria-describedby={shown ? errId : undefined}/>
    {f.minLen && (
      <div className="apf-meter">
        <span aria-hidden="true"><i className={len >= f.minLen ? "is-ok" : ""} style={{ width: Math.min(100, Math.round(len / f.minLen * 100)) + "%" }}/></span>
        <em className={len < f.minLen ? "is-warn" : ""}>{len < f.minLen ? (f.minLen - len) + " more characters" : "Great · " + len + " characters"}</em>
      </div>
    )}
  </>;
}

function ApfChips({ f, val, upd, say }) {
  const [q, setQ] = React.useState("");
  const full = f.max && val.length >= f.max;
  const add = () => {
    const x = apfTitle(q); if (!x) return;
    if (full) return say("You can pick up to " + f.max + ". Remove one first.");
    if (!val.map(a => a.toLowerCase()).includes(x.toLowerCase())) upd(val.concat([x]));
    setQ("");
  };
  return <>
    <span className="apf-hint">{f.hint}</span>
    <div role="group" aria-label={f.label} className="apf-chips">
      {f.opts.map(o => {
        const on = val.includes(o);
        return <button key={o} type="button" aria-pressed={on} disabled={!on && full} className={"apf-chip" + (on ? " is-on" : "")}
          onClick={() => upd(on ? val.filter(x => x !== o) : val.concat([o]))}>{on && <i className="ph ph-check" aria-hidden="true"/>}{o}</button>;
      })}
    </div>
    {f.addable && (
      <div className="apf-addown">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Add your own, e.g. baking" aria-label="Add your own hobby"/>
        <button type="button" className="apf-btn apf-btn--ghost apf-btn--sm" onClick={add}><i className="ph ph-plus" aria-hidden="true"/>Add</button>
      </div>
    )}
    <span className="apf-hint" aria-live="polite">{(val.length ? val.length + " chosen" : "None chosen yet") + (f.max ? " · up to " + f.max : "")}</span>
  </>;
}

/** Every word of a (lower-cased) search, in any order: "grammar ikeja" finds "Ikeja Grammar School". */
function apfHit(text, q) {
  const words = String(q || "").split(/\s+/).filter(Boolean);
  const t = String(text || "").toLowerCase();
  return words.every(w => t.includes(w));
}

function apfStarts(text, q) { const t = String(text || "").toLowerCase(), w = String(q || "").trim().toLowerCase(); return w !== "" && t.startsWith(w); }
/** Matches that begin with the query first, then those with a word beginning with it; otherwise the list's order. */
function apfRank(items, q) {
  const w = String(q || "").trim().toLowerCase();
  if (!w) return items;
  const score = o => { const t = String(o).toLowerCase(); return t.startsWith(w) ? 0 : (" " + t).includes(" " + w) ? 1 : 2; };
  return items.map((o, i) => [o, score(o), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
}

/** A searchable picker: a dropdown on a wide form, a full-screen sheet on a phone. */
function ApfCombo({ f, val, pick, touch, shown, inputId, errId, phone }) {
  const [q, setQ] = React.useState(null);     // null = not typing; shows the value
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const qq = (q || "").trim().toLowerCase();
  /* A remote list (the schools of Lagos and Ogun, from GRID3's open data)
     is searched on the server as the family types; the short local list is
     what shows before they type and if the server cannot be reached. */
  const [remote, setRemote] = React.useState(null);   // null | [{name, lga, state}]
  React.useEffect(() => {
    // The previous search's answers never stand in for this one's: until the
    // server answers, the local list filters what was typed.
    setRemote(null);
    if (!f.remote || qq.length < 2 || !(NGGApi.public && NGGApi.public[f.remote])) return;
    let live = true;
    const t = setTimeout(() => NGGApi.public[f.remote](qq).then(r => { if (live) setRemote((r && r.schools) || []); }, () => { if (live) setRemote(null); }), 220);
    return () => { live = false; clearTimeout(t); };
  }, [qq, f.remote]);
  const list = [], flat = [];
  if (f.groups) f.groups.forEach(([h, items]) => { const it = items.filter(o => apfHit(o, qq)); if (it.length) { list.push({ g: h }); it.forEach(o => { list.push({ o }); flat.push(o); }); } });
  else {
    /* Names that START with what was typed come first, here as on the server:
       in the list's own (alphabetical) order, "Egbeda Sen" + Enter chose
       "Anglican Senior Grammar School, Egbeda". The schools near our centres
       stay offered while the open-data answer is on screen. */
    const local = apfRank((f.opts || []).filter(o => apfHit(o, qq)), qq).slice(0, 40);
    if (remote) {
      const have = new Set(remote.map(r => String(r.name).toLowerCase()));
      local.filter(o => !have.has(String(o).toLowerCase()) && apfStarts(o, qq)).forEach(o => { list.push({ o }); flat.push(o); });
      remote.forEach(r => { list.push({ o: r.name, sub: [r.lga, r.state].filter(Boolean).join(", ") }); flat.push(r.name); });
    } else local.forEach(o => { list.push({ o }); flat.push(o); });
  }
  const h = Math.min(hi, Math.max(0, flat.length - 1));
  const listId = "apf-lb-" + f.id;
  const choose = o => { pick(o); setQ(null); setOpen(false); setHi(0); };
  const typed = (q || "").trim();
  const finish = () => { if (f.free && typed && typed !== val) choose(apfTitle(typed)); else { setOpen(false); setQ(null); } touch(); };
  const onKey = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi(Math.min(flat.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[h]) choose(flat[h]); else if (f.free && typed) choose(apfTitle(typed)); }
    else if (e.key === "Escape") { setOpen(false); setQ(null); }
  };
  let k = -1;
  const options = (big) => list.map((x, i) => {
    if (x.g) return <span key={"g" + i} className="apf-lb-g" role="presentation">{x.g}</span>;
    k++; const idx = k;
    return <button key={x.o + "|" + (x.sub || "") + "|" + idx} type="button" role="option" id={listId + "-" + idx} aria-selected={idx === h} className={"apf-lb-o" + (idx === h ? " is-hi" : "") + (big ? " is-big" : "")}
      onMouseDown={e => { e.preventDefault(); choose(x.o); }} onClick={big ? () => choose(x.o) : undefined}>
      <span>{x.o}{x.sub && <em className="apf-lb-sub">{x.sub}</em>}</span>{x.o === val && <i className="ph-bold ph-check" aria-hidden="true"/>}
    </button>;
  });
  const none = flat.length === 0 && <div className="apf-lb-none"><span>No match for “{typed}”.</span>{f.free && typed && <button type="button" onMouseDown={e => { e.preventDefault(); choose(apfTitle(typed)); }} onClick={() => choose(apfTitle(typed))}>Use “{typed}”</button>}</div>;
  React.useEffect(() => {
    if (!(open && phone)) return;
    const esc = e => { if (e.key === "Escape") { setOpen(false); setQ(null); } };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [open, phone]);
  return (
    <div className="apf-combo">
      <div className={"apf-input" + (open ? " is-focus" : "") + (shown ? " is-bad" : "")}>
        <i className="ph ph-magnifying-glass apf-input-ico" aria-hidden="true"/>
        <input id={inputId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={shown || undefined} aria-describedby={shown ? errId : undefined}
          aria-activedescendant={open && !phone && flat.length ? listId + "-" + h : undefined}
          readOnly={phone} value={q !== null && !phone ? q : val} placeholder={f.ph} autoComplete="off"
          onClick={() => setOpen(true)} onFocus={() => { if (!phone) setOpen(true); }} onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onBlur={phone ? undefined : () => setTimeout(finish, 150)} onKeyDown={phone ? undefined : onKey}/>
        {val && <button type="button" className="apf-iconbtn" aria-label={"Clear " + f.label} onMouseDown={e => { e.preventDefault(); pick(""); setQ(""); setOpen(true); }}><i className="ph ph-x" aria-hidden="true"/></button>}
        <i className="ph ph-caret-down apf-input-ico" aria-hidden="true"/>
      </div>
      {open && !phone && <div className="apf-lb" role="listbox" id={listId} aria-label={f.label}>{options(false)}{none}</div>}
      {open && phone && (
        <div className="apf-sheet" role="dialog" aria-modal="true" aria-label={f.label}>
          <div className="apf-sheet-h">
            <button type="button" className="apf-iconbtn is-44" aria-label="Close" onClick={() => { setOpen(false); setQ(null); }}><i className="ph ph-x" aria-hidden="true"/></button>
            <b>{f.label}</b>
            <button type="button" className="apf-btn apf-btn--ink apf-btn--sm" onClick={finish}>Done</button>
          </div>
          <div className="apf-sheet-s">
            <div className="apf-input is-focus"><i className="ph ph-magnifying-glass apf-input-ico" aria-hidden="true"/>
              <input autoFocus role="combobox" aria-expanded="true" aria-controls={listId} value={q || ""} onChange={e => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder={f.ph} autoComplete="off" aria-label={"Search " + f.label}/>
            </div>
          </div>
          <div className="apf-sheet-l" role="listbox" id={listId} aria-label={f.label}>{options(true)}{none}</div>
        </div>
      )}
    </div>
  );
}

/* A division's icon, by what it is about (the stored icons are emoji, which this form does not use). */
function apfDivisionIcon(name) {
  /* Whole words, not fragments: "art" inside "Smart Technology" or "cod" inside "Decoding" once picked the wrong icon. */
  const n = String(name || "").toLowerCase(), w = new Set(n.split(/[^a-z]+/).filter(Boolean));
  const any = list => list.some(x => w.has(x));
  return /not sure/.test(n) ? "question" : any(["tech", "technology", "coding", "code", "engineering"]) ? "code"
    : any(["media", "film", "content"]) ? "film-slate"
    : any(["art", "arts", "music", "performing", "creative"]) ? "music-notes"
    : any(["business", "administration", "admin", "operations"]) ? "briefcase" : "squares-four";
}

/** Courses as cards grouped by the Club's divisions, plus "Something else". */
function ApfCourses({ offer, val, pick, shown }) {
  const [q, setQ] = React.useState("");
  const qq = q.trim().toLowerCase();
  const groups = ((offer && offer.faculties) || []).map(d => ({ h: d.faculty, blurb: d.blurb || "", items: d.courses.map(c => [c, d.faculty]) }))
    .concat([{ h: "Not sure yet", items: [[APF_OTHER_COURSE, "Tell us below"]] }])
    .map(g => Object.assign({}, g, { items: g.items.filter(([l, s]) => apfHit(l + " " + s + " " + g.h, qq)) })).filter(g => g.items.length);
  return (
    <div className="apf-courses">
      <div className="apf-input apf-input--search"><i className="ph ph-magnifying-glass apf-input-ico" aria-hidden="true"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses"/></div>
      {groups.map(g => (
        <div key={g.h} className="apf-cgroup">
          <span className="apf-cgroup-h"><i className={"ph ph-" + apfDivisionIcon(g.h)} aria-hidden="true"/>{g.h}</span>
          {g.blurb && <span className="apf-cgroup-b">{g.blurb}</span>}
          <div role="radiogroup" aria-label={g.h} className="apf-cgrid">
            {g.items.map(([l, s]) => (
              <button key={l} type="button" role="radio" aria-checked={val === l} className={"apf-opt apf-course" + (val === l ? " is-on" : "") + (shown ? " is-bad" : "")} onClick={() => pick(l)}>
                <span><b>{l}</b><em>{s}</em></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!groups.length && <span className="apf-hint">No course matches. Choose “Something else” and tell us.</span>}
    </div>
  );
}

/* ── Photo ───────────────────────────────────────────────────────────────── */

function ApfPhoto({ v, err, W, addPhotoFile, takePhoto }) {
  const [cam, setCam] = React.useState(null);   // { facing, ready, err }
  const videoRef = React.useRef(null), streamRef = React.useRef(null);
  const upRef = React.useRef(null), camFileRef = React.useRef(null);
  const stop = () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } };
  React.useEffect(() => stop, []);
  const start = async facing => {
    stop();
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = st;
      const vd = videoRef.current; if (vd) { vd.muted = true; vd.srcObject = st; try { await vd.play(); } catch (_) {} }
      setCam(c => c && Object.assign({}, c, { ready: true, err: "" }));
    } catch (e) { setCam(c => c && Object.assign({}, c, { err: e && e.name === "NotAllowedError" ? "denied" : "unavailable" })); }
  };
  const openCam = () => {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { camFileRef.current && camFileRef.current.click(); return; }
    setCam({ facing: "user", ready: false, err: "" }); setTimeout(() => start("user"), 0);
  };
  const closeCam = () => { stop(); setCam(null); };
  const flip = () => { const f = cam.facing === "user" ? "environment" : "user"; setCam({ facing: f, ready: false, err: "" }); setTimeout(() => start(f), 0); };
  const shoot = () => {
    const vd = videoRef.current; if (!vd || !vd.videoWidth) return;
    const c = document.createElement("canvas"); c.width = vd.videoWidth; c.height = vd.videoHeight; c.getContext("2d").drawImage(vd, 0, 0);
    closeCam(); takePhoto(c, c.width, c.height, "camera", 0.5);
  };
  React.useEffect(() => {
    if (!cam) return;
    const esc = e => { if (e.key === "Escape") closeCam(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [!!cam]);
  const m = v.photoData || v.photoUrl ? (v.photoMeta || {}) : null;
  const compact = W < 1000, row = W >= 560;
  const SHORT = { "One face, looking straight at the camera": "One face, straight on", "Good, even light on the face": "Good light", "Sharp and in focus": "In focus", "Big enough to print": "Print size" };
  const check = (t, s, sub) => ({ t: compact ? SHORT[t] || t : t, s, sub });
  const checks = [
    check("One face, looking straight at the camera", !m || m.faces == null ? "idle" : m.faces === 1 ? "ok" : "bad", m && m.faces === 0 ? "No face found" : m && m.faces > 1 ? "More than one face" : ""),
    check("Good, even light on the face", !m || !m.issues ? "idle" : m.issues.some(i => ["too_dark", "too_bright", "clipped", "low_contrast"].includes(i)) ? "bad" : "ok",
      m && m.issues ? (m.issues.includes("too_dark") ? "Too dark" : m.issues.includes("too_bright") ? "Washed out" : m.issues.includes("clipped") ? "Uneven light" : m.issues.includes("low_contrast") ? "Flat or foggy" : "") : ""),
    check("Sharp and in focus", !m || !m.issues ? "idle" : m.issues.includes("blurry") ? "bad" : "ok", m && m.issues && m.issues.includes("blurry") ? "Blurry. Hold still, tap the face to focus, retake." : ""),
    check("Big enough to print", !m || !m.issues ? "idle" : m.issues.includes("too_small") ? "bad" : "ok", m && m.issues && m.issues.includes("too_small") ? "Too small: use the camera" : ""),
  ].concat(compact ? [] : [check("Plain, light background. No hat, sunglasses or filter. Religious head coverings are fine.", "idle", "")]);
  const ICON = { idle: "ph ph-circle", ok: "ph-fill ph-check-circle", warn: "ph-fill ph-warning-circle", bad: "ph-fill ph-x-circle" };
  const pick = (ev, src) => { const fl = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (src === "camera") closeCam(); addPhotoFile(fl, src); };
  return (
    <div className={"apf-photo" + (row ? " is-row" : "") + (compact ? " is-compact" : "") + (err && m ? " is-bad" : "")}>
      <div className="apf-photo-pv">
        {m ? <>
          <img src={v.photoData || v.photoUrl} alt="Passport photo preview"/>
          <span className={"apf-photo-badge " + (err ? "is-bad" : "is-ok")}><i className={"ph " + (err ? "ph-x" : "ph-check")} aria-hidden="true"/>{err ? "Needs another try" : "Meets the rules"}</span>
        </> : <span className="apf-photo-oval" aria-hidden="true"><i className="ph ph-user"/></span>}
      </div>
      <div className="apf-photo-body">
        <ul className="apf-photo-checks" aria-label="Photo requirements">
          {checks.map(c => <li key={c.t} className={"is-" + c.s}><i className={ICON[c.s]} aria-hidden="true"/><span>{c.t}{c.sub && <b>{c.sub}</b>}</span></li>)}
        </ul>
        <span className="apf-photo-foot">{compact ? "Plain light background. No hat, sunglasses or filter; religious head coverings are fine. JPG or PNG up to 8 MB, cropped to ID size." : "JPG or PNG, up to 8 MB. Cropped to ID size and checked by a person before printing."}</span>
        <div className="apf-photo-btns">
          <button type="button" className="apf-btn apf-btn--ink" onClick={openCam}><i className="ph ph-camera" aria-hidden="true"/>{m ? "Retake" : "Take a photo"}</button>
          <button type="button" className="apf-btn apf-btn--ghost" onClick={() => upRef.current && upRef.current.click()}><i className="ph ph-upload-simple" aria-hidden="true"/>{m ? "Choose another" : "Upload a photo"}</button>
        </div>
      </div>
      <input ref={upRef} type="file" accept="image/*" className="apf-file" onChange={e => pick(e, "upload")} aria-label="Upload a passport photo" tabIndex={-1}/>
      <input ref={camFileRef} type="file" accept="image/*" capture="user" className="apf-file" onChange={e => pick(e, "camera")} aria-label="Take a passport photo with the camera app" tabIndex={-1}/>
      {cam && (
        <div className="apf-cam" role="dialog" aria-modal="true" aria-label="Take a passport photo">
          <div className="apf-cam-box">
            <div className="apf-cam-h">
              <button type="button" className="apf-cam-ib" onClick={closeCam} aria-label="Close camera"><i className="ph ph-x" aria-hidden="true"/></button>
              <b>Passport photo</b>
              <button type="button" className="apf-cam-ib" onClick={flip} aria-label="Switch camera"><i className="ph ph-camera-rotate" aria-hidden="true"/></button>
            </div>
            <div className="apf-cam-view">
              <video ref={videoRef} autoPlay playsInline muted className={cam.facing === "user" ? "is-mirror" : ""}/>
              <div className="apf-cam-oval" aria-hidden="true"/>
              {!cam.ready && !cam.err && <span className="apf-cam-wait">Starting the camera…</span>}
              {cam.err && (
                <div className="apf-cam-err">
                  <i className="ph ph-camera-slash" aria-hidden="true"/>
                  <span>{cam.err === "denied" ? "Camera access is blocked. Allow it in your browser settings, or use your phone’s camera app." : "We couldn’t start the camera here. Use your phone’s camera app or upload a photo."}</span>
                  <button type="button" className="apf-btn apf-btn--gold" onClick={() => camFileRef.current && camFileRef.current.click()}><i className="ph ph-camera" aria-hidden="true"/>Use the camera app</button>
                  <button type="button" className="apf-linkbtn" onClick={() => upRef.current && upRef.current.click()}>Upload a photo instead</button>
                </div>
              )}
            </div>
            <div className="apf-cam-f">
              <span>Fit the face in the oval. Plain wall behind, light in front, no hat or sunglasses.</span>
              <button type="button" className={"apf-shutter" + (cam.ready ? " is-ready" : "")} onClick={shoot} disabled={!cam.ready} aria-label="Take photo"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Agreements ──────────────────────────────────────────────────────────── */

function ApfAgree({ v, set, shown, touch, openPol, W }) {
  const n = APF_AGREE.filter(a => v[a.id] === true).length, all = n === APF_AGREE.length;
  return (
    <div className={"apf-agree" + (shown ? " is-bad" : "")}>
      <div className="apf-agree-h">
        <span><b>Agreements</b><em className={all ? "is-ok" : ""}>{all ? "All agreed" : n + " of " + APF_AGREE.length + " ticked · all are needed to join"}</em></span>
        {!all && <button type="button" className="apf-btn apf-btn--ghost apf-btn--sm" onClick={() => { const p = {}; APF_AGREE.forEach(a => { p[a.id] = true; }); set(p); touch(); }}><i className="ph ph-checks" aria-hidden="true"/>Agree to all</button>}
      </div>
      {APF_AGREE.map(a => {
        const on = v[a.id] === true;
        return (
          <div key={a.id} className={"apf-agree-row" + (on ? " is-on" : "")}>
            <button type="button" role="checkbox" aria-checked={on} className="apf-agree-cb" onClick={() => { set({ [a.id]: !on }); touch(); }}>
              <i className={on ? "ph-fill ph-check-square" : "ph ph-square"} aria-hidden="true"/>
              <span><b>{a.t}</b><span>{a.s}</span></span>
            </button>
            <button type="button" className="apf-agree-read" onClick={() => openPol(a.pol)} aria-label={"Read the " + a.t.toLowerCase() + " policy"} title={"Read the " + a.t.toLowerCase() + " policy"}>
              <i className="ph ph-book-open-text" aria-hidden="true"/>{W >= 560 && <span>Read</span>}
            </button>
          </div>
        );
      })}
      <div className="apf-agree-f">Recorded with today’s date and policy version {APF_POLICY_VERSION}.</div>
    </div>
  );
}

/** The policy, in place: a right drawer on a wide form, a bottom sheet on a phone. */
function ApfPolicySheet({ pol, wide, v, set, close }) {
  const ref = React.useRef(null), backTo = React.useRef(document.activeElement);
  const item = APF_AGREE.find(a => a.pol === pol);
  React.useEffect(() => {
    const esc = e => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    const body = ref.current && ref.current.querySelector(".apf-pol-body");
    const target = body && body.querySelector("#pol-" + pol);
    if (body && target) body.scrollTop = target.offsetTop - 8;
    ref.current && ref.current.querySelector(".apf-pol-x").focus();
    return () => { window.removeEventListener("keydown", esc); try { backTo.current && backTo.current.focus(); } catch (_) {} };
  }, [pol]);
  return (
    <div className={"apf-pol" + (wide ? " is-wide" : "")} role="dialog" aria-modal="true" aria-label="NGG policies" ref={ref}>
      <div className="apf-pol-scrim" onClick={close}/>
      <div className="apf-pol-panel">
        {!wide && <span className="apf-pol-handle" aria-hidden="true"/>}
        <div className="apf-pol-h">
          <span><em>NGG policy · v{APF_POLICY_VERSION}</em><b>{APF_POL[pol] || "Policies"}</b></span>
          <a href={"/policies#pol-" + pol} target="_blank" rel="noopener"><i className="ph ph-arrow-square-out" aria-hidden="true"/>Full page</a>
          <button type="button" className="apf-iconbtn is-44 apf-pol-x" onClick={close} aria-label="Close"><i className="ph ph-x" aria-hidden="true"/></button>
        </div>
        <div className="apf-pol-body"><ClubPolicies embed/></div>
        <div className="apf-pol-f">
          {item && v[item.id] !== true && <button type="button" className="apf-btn apf-btn--ink" onClick={() => { set({ [item.id]: true }); close(); }}><i className="ph ph-check" aria-hidden="true"/>I agree</button>}
          <button type="button" className="apf-btn apf-btn--ghost" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Review and done ─────────────────────────────────────────────────────── */

function ApfReview({ v, age, go }) {
  const R = (k, val) => ({ k, v: val || "" });
  const photoBad = apfErr({ id: "photo", type: "photo", req: 1 }, v);
  const agreed = APF_AGREE.every(a => v[a.id] === true);
  const secs = [
    ["Start", 0, [R("Filled in by", v.filledBy === "child" ? "The applicant" : v.filledBy ? "Parent or guardian" : ""), R("Taking part", v.join === "online" ? "Online (NGG Online)" : v.centre ? "At " + v.centre : "")]],
    ["Applicant", 1, [R("Name", [v.firstName, v.middleName, v.surname].filter(Boolean).join(" ")), R("Date of birth", v.dob ? new Date(v.dob + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) + (age != null ? " · age " + age : "") : ""), R("Sex", v.sex), R("Email", v.email), R("Mobile", v.mobile)]],
    ["School", 2, [R("School", v.school), R("Class", [v.class, v.classArm].filter(Boolean).join(" · "))]],
    ["Home and origin", 3, [R("Address", v.address), R("Lives in", [v.resLga, v.resState].filter(Boolean).join(", ")), R("Origin", [v.originLga, v.originState].filter(Boolean).join(", ")), R("Nationality", v.nationality)]],
    ["Parents and guardians", 4, [R("Main contact", v.parent1Name ? v.parent1Name + " (" + (v.parent1Rel || "") + ") · " + (v.parent1Phone || "") : ""), R("Second contact", v.parent2None ? "None" : v.parent2Name ? v.parent2Name + " (" + (v.parent2Rel || "") + ")" + (v.parent2Phone ? " · " + v.parent2Phone : "") : "")]],
    ["Interests and vision", 5, [R("Course", apfCourse(v)), R("Vision", v.vision), R("Hobbies", (v.hobbies || []).join(", ")), R("Areas of influence", (v.influenceAreas || []).filter(a => a !== "Something else").concat(v.influenceOther ? [v.influenceOther] : []).join(", "))]],
    ["Photo and agreements", 6, [R("Passport photo", v.photoData || v.photoUrl ? (photoBad ? "Needs another try" : "Added · meets the rules") : ""), R("Agreements", agreed ? "All agreed (v" + APF_POLICY_VERSION + ")" : ""), R("Off-site activities", v.trips ? "Yes" : "No"), R("Referral or promo code", v.promoCode), R("Heard about us", v.heardFrom === "Something else" ? v.heardOther : v.heardFrom)]],
  ];
  return (
    <div className="apf-review">
      {secs.map(([h, i, rows]) => (
        <section key={h} className="apf-rev">
          <div className="apf-rev-h"><b>{h}</b><button type="button" onClick={() => go(i)} aria-label={"Edit " + h}>Edit</button></div>
          {rows.map(x => <div key={x.k} className="apf-rev-r"><span>{x.k}</span><b className={x.v ? "" : "is-empty"}>{x.v || "—"}</b></div>)}
        </section>
      ))}
    </div>
  );
}

function ApfDone({ done, sibling, restart, setPage }) {
  const steps = [["We check the details", "Usually within 3 working days. If something’s missing we’ll call the main contact."],
    ["Pay with the link we send", "Only after acceptance. Paystack or bank transfer; the receipt is emailed to you."],
    done.online
      ? ["Meet your mentor online", "Your mentor gets in touch, and the online Saturday session opens in the portal. Your digital member card is in the portal too."]
      : ["Come to " + (done.centre || "your centre") + " on Saturday", "Bring this reference. Your ID card is printed from the photo you sent."]];
  return (
    <section className="apf-card apf-done" aria-labelledby="apf-done-h">
      <i className="ph-fill ph-check-circle apf-done-ico" aria-hidden="true"/>
      <h1 id="apf-done-h">{(done.queued ? "Application saved" : done.updated ? "Application updated" : "Application sent") + (done.first ? " for " + done.first : "")}</h1>
      {done.queued
        ? <p>You’re offline, so it is saved on this device and sends itself when you’re back online.</p>
        : <p>Reference <span className="apf-mono">{done.ref}</span>. {done.updated ? "We had an application for this child already, so we updated it with these answers instead of adding a second one. " : ""}We sent a copy to {done.email || "your email"}.</p>}
      <ol className="apf-next">{steps.map(([t, s], i) => <li key={t}><span>{i + 1}</span><span><b>{t}</b><em>{s}</em></span></li>)}</ol>
      <div className="apf-done-btns">
        <button type="button" className="apf-btn apf-btn--ink" onClick={sibling}><i className="ph ph-user-plus" aria-hidden="true"/>Apply for another child</button>
        <button type="button" className="apf-btn apf-btn--ghost" onClick={restart}>Start a new application</button>
      </div>
      <span className="apf-hint">Applying for a brother or sister? We’ll keep the parent, address and centre details so you don’t type them again.</span>
      <span className="apf-hint">To see where it stands later, enter this reference and your email under “Check your status” on the <a href="/contact" onClick={e => { e.preventDefault(); setPage && setPage("contact"); }}>contact page</a>.</span>
    </section>
  );
}

/* ── Member and family policies (/policies, and the sheet inside the form) ─ */

const CLUB_POLICY_SECTIONS = [
  ["participation", "Taking part and conduct", <>
    <p>Members attend Saturday sessions at their centre, take part in their course, mentoring and club projects, and keep the Anchor Journal. Each member has a mentor who tracks their goals, attendance and Leadership Index scores.</p>
    <ul><li>Arrive on time, wear the ID card, and treat members, mentors and instructors with respect.</li><li>Repeated absence or lateness follows the club’s attendance policy, which can lead to a warning, suspension or loss of a place. The family is told at every stage.</li><li>Members upload their school results each session so mentors can plan support.</li></ul></>],
  ["safeguarding", "Safeguarding", <p>Every mentor and instructor is vetted and trained before working with children. Adults never meet a member alone in private, and all online contact happens through the NGG platform or with a parent included. Concerns about a child’s safety are passed to the NGG safeguarding lead the same day, and to the family unless doing so would put the child at risk.</p>],
  ["medical", "Emergency medical care", <p>If a member is hurt or falls ill, we call the main contact first, then the second contact. If neither can be reached and care cannot wait, NGG staff may take the member to the nearest hospital or clinic and allow urgent treatment. We keep calling the family until we reach someone, and write up what happened.</p>],
  ["privacy", "Privacy and your data", <>
    <p>NGG processes personal data under the Nigeria Data Protection Act 2023. We collect only what we need to run the programme: the details in this form, the passport photo, attendance, scores, uploaded school results and mentor notes.</p>
    <ul><li><strong>Who sees it:</strong> the member’s mentor, instructors and NGG admin. Not other families.</li><li><strong>AI tools:</strong> we use AI to check photo quality and to draft study plans from results. A person reviews every plan before it is used.</li><li><strong>Never sold:</strong> we never sell or rent personal data, and never share phone numbers or addresses publicly.</li><li><strong>How long:</strong> while the member is active, then up to three years for records, after which we delete or anonymise it.</li><li><strong>Your rights:</strong> you can ask to see, correct or delete your data, or withdraw a consent. You can also complain to the Nigeria Data Protection Commission.</li></ul></>],
  ["updates", "Family updates", <>
    <p>NGG works in partnership with families, so updates are part of membership. The main contact, and the second contact if given, receive:</p>
    <ul><li>Attendance alerts, including same-day notice of an absence.</li><li>Termly reports, Leadership Index scores and mentor evaluations.</li><li>Results analysis and the study plan agreed with the mentor.</li><li>Notices about sessions, events, fees and anything that affects the member’s place.</li><li>Invitations to parent meetings.</li></ul>
    <p>Updates go by SMS, email and WhatsApp to the contacts on file. This is a condition of membership. We do not send advertising from other organisations.</p></>],
  ["media", "Photos and videos", <>
    <p>NGG is a non-profit. Photos and videos from club activities are how we show supporters and partners the work, which keeps the club running. If you say yes, we may use them in reports, on our website and on social media.</p>
    <ul><li>We use first names only, and never show addresses, schools’ uniforms close-up, or phone numbers.</li><li>We never sell images or let others use them for advertising.</li><li>You can withdraw at any time. We stop new use straight away and remove images we control within 30 days.</li></ul>
    <p>This consent is a condition of membership. If you have a concern about a particular image, tell us and we will remove it. The ID card photo is separate and is only used on the card and in the member’s record.</p></>],
  ["website", "Website feature", <p>With your permission, we may show the member’s first name and work, such as a project, artwork or performance, on the NGG website. We never publish a surname, age or school together with a photo.</p>],
  ["trips", "Off-site activities", <p>Some activities happen away from the centre, such as visits, competitions and outreach. If you agree, members may take part under NGG supervision. We always send details to the family beforehand, and you can say no to any single trip.</p>],
  ["fees", "Fees and payment", <p>Nothing is paid when you apply. After acceptance we send a private invoice link by email and SMS for the membership fee and the first month’s commitment fee. The first month is charged only for the Saturdays left from the start date. Pay online with Paystack, or by bank transfer using the invoice number. Receipts are emailed.</p>],
  ["changes", "Changing your choices", <p>You can change your off-site answer and contact details at any time from the member portal or by contacting us. If we change these policies, we tell the family first and ask again where the law requires it.</p>],
  ["contact", "Contact", <p>Questions, data requests or concerns: email <a href="mailto:privacy@afrovanguard.org.ng">privacy@afrovanguard.org.ng</a>, or speak to the coordinator at your centre on a Saturday.</p>],
];

function ClubPolicies({ embed }) {
  return (
    <article className={"pol-doc" + (embed ? " is-embed" : "")}>
      <div className="pol-doc-h">
        <span className="pol-eyebrow">MEMBER AND FAMILY POLICIES</span>
        <h1>What you agree to when you join NGG</h1>
        <span>Version {APF_POLICY_VERSION} · Effective 10 October 2026. These apply to every member aged 10 to 17 and their parents or guardians. We record which version you agreed to and when.</span>
      </div>
      {CLUB_POLICY_SECTIONS.map(([id, h, body]) => <section key={id} id={"pol-" + id} className="pol-sec"><h2>{h}</h2>{body}</section>)}
    </article>
  );
}

function PoliciesPage({ setPage }) {
  const ref = React.useRef(null);
  const [W, setW] = React.useState(1200);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const goHash = () => { const id = decodeURIComponent(location.hash.slice(1)); const el = id && document.getElementById(id); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80); };
    const t = setTimeout(goHash, 60); window.addEventListener("hashchange", goHash);
    return () => { clearTimeout(t); window.removeEventListener("hashchange", goHash); };
  }, []);
  return (
    <div ref={ref} className={"pol-page" + (W >= 900 ? " is-wide" : "")} data-screen-label="Policies">
      {W >= 900 && (
        <nav className="pol-toc" aria-label="On this page">
          <span>On this page</span>
          {CLUB_POLICY_SECTIONS.map(([id, h]) => <a key={id} href={"#pol-" + id}>{h}</a>)}
        </nav>
      )}
      <div className="pol-main">
        <a className="pol-back" href="/join?program=anchor" onClick={e => { e.preventDefault(); goApply(setPage, "anchor"); }}><i className="ph ph-arrow-left" aria-hidden="true"/>Back to the application</a>
        <ClubPolicies/>
      </div>
    </div>
  );
}

Object.assign(window, { ClubApplyPage, ClubPolicies, PoliciesPage });
