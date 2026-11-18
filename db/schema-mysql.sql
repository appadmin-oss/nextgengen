-- NGG — MySQL / MariaDB schema (production).
--
-- The SQLite build (api/_lib/db.php) auto-migrates; MySQL does not. Apply this
-- file ONCE when you set db.dsn to MySQL (phpMyAdmin → Import, or
-- `mysql -u USER -p DBNAME < db/schema-mysql.sql`). It is idempotent
-- (CREATE TABLE IF NOT EXISTS) so re-running is safe.
--
-- Column names match the camelCase API fields exactly (same as SQLite). Keep
-- this in lockstep with the $migrations array in api/_lib/db.php and bump the
-- schema_version INSERT at the bottom when NGG_SCHEMA_TARGET changes.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_version (version INT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) UNIQUE NOT NULL,
  fullName VARCHAR(255), email VARCHAR(200), phone VARCHAR(40),
  type VARCHAR(32), status VARCHAR(32) DEFAULT 'active', role VARCHAR(32) DEFAULT 'member',
  centre VARCHAR(32), photoUrl TEXT, track VARCHAR(64), cohort VARCHAR(64),
  joinDate VARCHAR(40), dob VARCHAR(40),
  parentName VARCHAR(255), parentEmail VARCHAR(200), parentPhone VARCHAR(40), school VARCHAR(255),
  bio TEXT, socials TEXT, totpSecret VARCHAR(64), passwordHash VARCHAR(255) DEFAULT '', notes TEXT,
  anchorCode VARCHAR(12),
  mouAt VARCHAR(40) DEFAULT '', mouBy VARCHAR(64) DEFAULT '',
  duesRemindOff TINYINT DEFAULT 0, duesRemindedAt VARCHAR(40) DEFAULT '',
  ngvVolunteerId VARCHAR(64) DEFAULT '', ngvAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_members_email (email), INDEX idx_members_centre (centre), INDEX idx_members_status (status),
  UNIQUE KEY idx_members_anchorcode (anchorCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* `email` carries no UNIQUE constraint, and that is a decision rather than an
   omission. The invariant IS enforced — one active mentor per address, refused
   at every write path (admin_mentors_upsert, the application accept, the
   Afrovanguard sync) and failed closed at the portal gate, which will not
   resolve an ambiguous address rather than pick between two people's classes.
   What is not done is adding the index, because adding it means first deciding
   what to do with any pair already in the data, and that decision cannot be
   made by a machine: two rows on one address may be one person with a
   duplicate record or two people on a shared family mailbox — a distinction
   mentor_gate's own comment has named for longer than this note has existed.
   Choosing wrong hands an adult another adult's children.
   admin_mentors_duplicates() puts each pair in front of the desk instead, and
   a UNIQUE index becomes safe to add once that list is empty. */
CREATE TABLE IF NOT EXISTS mentors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(64) UNIQUE NOT NULL,
  fullName VARCHAR(255), email VARCHAR(200), phone VARCHAR(40), status VARCHAR(32),
  tracks VARCHAR(255), centre VARCHAR(32), bio TEXT, photoUrl TEXT,
  maxMentees INT, availability TEXT, checkedAt VARCHAR(40), joinedAt VARCHAR(40),
  source VARCHAR(24) DEFAULT 'ngg', program VARCHAR(64) DEFAULT '', skills TEXT,
  linkedin VARCHAR(255) DEFAULT '', afrovanguardRef VARCHAR(255) DEFAULT '',
  createdAt VARCHAR(40), updatedAt VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mentor_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64), mentorId VARCHAR(64), track VARCHAR(64), sessionId VARCHAR(64),
  status VARCHAR(32) DEFAULT 'active', startedAt VARCHAR(40), endedAt VARCHAR(40),
  INDEX idx_ma_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sessionId VARCHAR(64) UNIQUE NOT NULL,
  code VARCHAR(32), year INT, name VARCHAR(128),
  startDate VARCHAR(40), endDate VARCHAR(40), theme VARCHAR(255),
  isActive TINYINT DEFAULT 0, coverUrl TEXT, notes TEXT,
  createdAt VARCHAR(40), updatedAt VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS anchor_missions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  missionId VARCHAR(64) UNIQUE NOT NULL,
  week INT, orderIndex INT DEFAULT 0, theme VARCHAR(255),
  title VARCHAR(255), prompt TEXT, proof VARCHAR(16) DEFAULT 'text',
  xp INT DEFAULT 0, type VARCHAR(32), estimatedMin INT DEFAULT 0,
  bookPage INT DEFAULT 0, isActive TINYINT DEFAULT 1,
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_missions_week (week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64), missionId VARCHAR(64), sessionId VARCHAR(64),
  status VARCHAR(32) DEFAULT 'started', proofUrl TEXT,
  verifiedBy VARCHAR(64), verifiedAt VARCHAR(40), xpAwarded INT DEFAULT 0,
  note TEXT, startedAt VARCHAR(40), submittedAt VARCHAR(40),
  INDEX idx_progress_member (memberId),
  UNIQUE KEY idx_progress_unique (memberId, missionId, sessionId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) UNIQUE NOT NULL,
  xpTotal INT DEFAULT 0, level INT DEFAULT 1,
  badgeCount INT DEFAULT 0, badges TEXT,
  streak INT DEFAULT 0, lastActiveAt VARCHAR(40),
  currentWeek INT DEFAULT 1, completedThisSession INT DEFAULT 0,
  updatedAt VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(64) UNIQUE NOT NULL,
  title VARCHAR(255), kind VARCHAR(32), sessionId VARCHAR(64),
  startAt VARCHAR(40), endAt VARCHAR(40), centre VARCHAR(32), location VARCHAR(255),
  coverUrl TEXT, body TEXT, capacity INT DEFAULT 0,
  isPublic TINYINT DEFAULT 0, status VARCHAR(32) DEFAULT 'draft', createdBy VARCHAR(64),
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_events_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_rsvps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(64), memberId VARCHAR(64), status VARCHAR(32),
  rsvpAt VARCHAR(40), attendedAt VARCHAR(40),
  UNIQUE KEY idx_rsvp_unique (eventId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  postId VARCHAR(64) UNIQUE NOT NULL,
  slug VARCHAR(120), kind VARCHAR(32), title VARCHAR(255), excerpt TEXT, body MEDIUMTEXT,
  coverUrl TEXT, category VARCHAR(120), authorId VARCHAR(64), tags VARCHAR(255),
  status VARCHAR(32) DEFAULT 'draft', publishAt VARCHAR(40),
  featured TINYINT DEFAULT 0, promoCta VARCHAR(120), promoUrl TEXT, promoExpires VARCHAR(40),
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_posts_slug (slug), INDEX idx_posts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notifId VARCHAR(64) UNIQUE NOT NULL,
  memberId VARCHAR(64), kind VARCHAR(32), title VARCHAR(255), body TEXT,
  linkPage VARCHAR(64), readAt VARCHAR(40), createdAt VARCHAR(40),
  INDEX idx_notif_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS journal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entryId VARCHAR(64) UNIQUE NOT NULL,
  memberId VARCHAR(64), sessionId VARCHAR(64), week INT,
  mood VARCHAR(16), body TEXT, isPrivate TINYINT DEFAULT 1, createdAt VARCHAR(40),
  INDEX idx_journal_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(128), memberId VARCHAR(64), email VARCHAR(200), otp VARCHAR(8),
  attempts INT DEFAULT 0, createdAt VARCHAR(40), expiresAt VARCHAR(40),
  verifiedAt VARCHAR(40), ip VARCHAR(64), userAgent VARCHAR(256),
  purpose VARCHAR(16) DEFAULT 'login',
  INDEX idx_auth_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  at VARCHAR(40), actorId VARCHAR(64), event VARCHAR(64), subject VARCHAR(128), ip VARCHAR(64), meta TEXT,
  INDEX idx_audit_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  settingKey VARCHAR(64) UNIQUE NOT NULL,
  settingValue TEXT, updatedAt VARCHAR(40), updatedBy VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(200) UNIQUE NOT NULL, source VARCHAR(64),
  status VARCHAR(32) DEFAULT 'subscribed',
  createdAt VARCHAR(40), updatedAt VARCHAR(40), ip VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignmentId VARCHAR(64) UNIQUE NOT NULL,
  title VARCHAR(255), instructions TEXT, track VARCHAR(80), sessionId VARCHAR(64),
  week INT DEFAULT 0, dueAt VARCHAR(40), points INT DEFAULT 0,
  attachmentUrl TEXT, proof VARCHAR(16) DEFAULT 'text', centre VARCHAR(80),
  status VARCHAR(32) DEFAULT 'draft', createdBy VARCHAR(64),
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_assign_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submissionId VARCHAR(64) UNIQUE NOT NULL,
  assignmentId VARCHAR(64), memberId VARCHAR(64), sessionId VARCHAR(64),
  answerText TEXT, fileUrl TEXT, status VARCHAR(32) DEFAULT 'submitted',
  grade INT, feedback TEXT, gradedBy VARCHAR(64), gradedAt VARCHAR(40),
  submittedAt VARCHAR(40), createdAt VARCHAR(40),
  INDEX idx_sub_assignment (assignmentId),
  UNIQUE KEY idx_sub_unique (assignmentId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16), name VARCHAR(255), age INT, centre VARCHAR(64), track VARCHAR(64),
  role VARCHAR(64), why TEXT, email VARCHAR(200), status VARCHAR(32) DEFAULT 'new',
  program VARCHAR(16) DEFAULT '', photoUrl VARCHAR(512) DEFAULT '',
  phone VARCHAR(24) DEFAULT '', courses TEXT,
  firstName VARCHAR(80) DEFAULT '', lastName VARCHAR(80) DEFAULT '',
  otherName VARCHAR(80) DEFAULT '', dob VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40), ip VARCHAR(64),
  INDEX idx_apps_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  stateKey VARCHAR(80) NOT NULL,
  stateValue MEDIUMTEXT,
  updatedAt VARCHAR(40),
  UNIQUE KEY idx_member_state (memberId, stateKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(48) UNIQUE NOT NULL,
  purpose VARCHAR(24) DEFAULT 'general',
  name VARCHAR(255), email VARCHAR(200), phone VARCHAR(40),
  subject VARCHAR(255), message TEXT, status VARCHAR(24) DEFAULT 'new',
  createdAt VARCHAR(40), ip VARCHAR(64),
  INDEX idx_contact_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS summer_cohorts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cohortId VARCHAR(48) UNIQUE NOT NULL,
  year INT, name VARCHAR(120), startDate VARCHAR(40), endDate VARCHAR(40),
  status VARCHAR(24) DEFAULT 'active', createdAt VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qr_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(48) UNIQUE NOT NULL,
  batch VARCHAR(48), cohortId VARCHAR(48),
  status VARCHAR(24) DEFAULT 'blank',
  studentId VARCHAR(48), assignedName VARCHAR(255),
  createdAt VARCHAR(40), assignedAt VARCHAR(40),
  INDEX idx_qr_status (status), INDEX idx_qr_cohort (cohortId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS summer_students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  studentId VARCHAR(48) UNIQUE NOT NULL,
  cohortId VARCHAR(48), token VARCHAR(48), handle VARCHAR(80),
  fullName VARCHAR(255), age INT, centre VARCHAR(48), track VARCHAR(64), photoUrl VARCHAR(512),
  guardianName VARCHAR(255), guardianPhone VARCHAR(48),
  status VARCHAR(24) DEFAULT 'active', notes TEXT,
  enrolledAt VARCHAR(40), updatedAt VARCHAR(40),
  daysPresent INT, attendanceRate INT, firstSeen VARCHAR(12), lastSeen VARCHAR(12), archivedAt VARCHAR(40),
  INDEX idx_sstu_cohort (cohortId), INDEX idx_sstu_handle (handle), INDEX idx_sstu_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cohortId VARCHAR(48), studentId VARCHAR(48), token VARCHAR(48),
  date VARCHAR(12), checkInAt VARCHAR(40), method VARCHAR(16) DEFAULT 'qr',
  byId VARCHAR(48), device VARCHAR(64), createdAt VARCHAR(40),
  UNIQUE KEY idx_attend_unique (studentId, date), INDEX idx_attend_cohort_date (cohortId, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Anchor Circle — consent-based read-only guardian/mentor links.
CREATE TABLE IF NOT EXISTS circle_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  linkId VARCHAR(48) UNIQUE NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  role VARCHAR(24) NOT NULL,
  guardianName VARCHAR(255),
  status VARCHAR(16) DEFAULT 'active',
  createdAt VARCHAR(40), lastSeenAt VARCHAR(40), revokedAt VARCHAR(40),
  INDEX idx_circle_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS circle_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  linkId VARCHAR(48) NOT NULL, memberId VARCHAR(64) NOT NULL, role VARCHAR(24),
  date VARCHAR(12) NOT NULL, createdAt VARCHAR(40),
  UNIQUE KEY idx_circle_conf_unique (linkId, date), INDEX idx_circle_conf_member (memberId, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS circle_remarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  linkId VARCHAR(48) NOT NULL, memberId VARCHAR(64) NOT NULL, role VARCHAR(24),
  weekStart VARCHAR(12), text TEXT, createdAt VARCHAR(40),
  INDEX idx_circle_remark_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Identity & security core: managed device sessions + account lockout.
CREATE TABLE IF NOT EXISTS device_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sid VARCHAR(64) UNIQUE NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  ip VARCHAR(64), userAgent VARCHAR(256), uaHash VARCHAR(32),
  createdAt VARCHAR(40), lastSeenAt VARCHAR(40), revokedAt VARCHAR(40),
  INDEX idx_devsess_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE members ADD COLUMN failedLogins INT DEFAULT 0;
ALTER TABLE members ADD COLUMN lockedUntil VARCHAR(40);
ALTER TABLE members ADD COLUMN lastLoginAt VARCHAR(40);

-- Integration bus: destinations + outbox + deliveries (retry/backoff).
CREATE TABLE IF NOT EXISTS integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  integrationId VARCHAR(48) UNIQUE NOT NULL,
  kind VARCHAR(24) NOT NULL,
  name VARCHAR(160),
  config TEXT,
  events TEXT,
  status VARCHAR(16) DEFAULT 'active',
  createdAt VARCHAR(40), updatedAt VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS outbox (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(48) UNIQUE NOT NULL,
  kind VARCHAR(64) NOT NULL,
  payload MEDIUMTEXT,
  createdAt VARCHAR(40),
  INDEX idx_outbox_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(48) NOT NULL,
  integrationId VARCHAR(48) NOT NULL,
  status VARCHAR(16) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  nextAttemptAt VARCHAR(40),
  lastError TEXT,
  deliveredAt VARCHAR(40),
  createdAt VARCHAR(40),
  INDEX idx_deliveries_due (status, nextAttemptAt),
  INDEX idx_deliveries_event (eventId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registration stack: versioned forms, gated links, parent consents.
CREATE TABLE IF NOT EXISTS form_defs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formId VARCHAR(48) NOT NULL,
  version INT NOT NULL,
  name VARCHAR(160),
  fields MEDIUMTEXT,
  status VARCHAR(16) DEFAULT 'live',
  publishedBy VARCHAR(64),
  createdAt VARCHAR(40),
  UNIQUE KEY idx_formdefs_ver (formId, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gate_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gateId VARCHAR(48) UNIQUE NOT NULL,
  name VARCHAR(160),
  cohortId VARCHAR(48),
  status VARCHAR(16) DEFAULT 'active',
  createdBy VARCHAR(64),
  expiresAt VARCHAR(40),
  usedCount INT DEFAULT 0,
  createdAt VARCHAR(40),
  revokedAt VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS consents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  studentId VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  method VARCHAR(24),
  actorName VARCHAR(160),
  createdAt VARCHAR(40),
  INDEX idx_consents_student (studentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE summer_students ADD COLUMN parentEmail VARCHAR(190);
ALTER TABLE summer_students ADD COLUMN regStatus VARCHAR(24) DEFAULT 'verified';
ALTER TABLE summer_students ADD COLUMN verifyToken VARCHAR(64);
ALTER TABLE summer_students ADD COLUMN verifyExpiresAt VARCHAR(40);
ALTER TABLE summer_students ADD COLUMN verifiedAt VARCHAR(40);
ALTER TABLE summer_students ADD COLUMN remindedAt VARCHAR(40);
ALTER TABLE summer_students ADD COLUMN formVersion INT;
ALTER TABLE summer_students ADD COLUMN formData MEDIUMTEXT;

-- Behaviour monitor: AI-categorised staff observations + review workflow.
CREATE TABLE IF NOT EXISTS behaviour_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  logId VARCHAR(48) UNIQUE NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  subjectName VARCHAR(190),
  cohortId VARCHAR(48),
  observerId VARCHAR(64), observerName VARCHAR(190),
  note TEXT,
  category VARCHAR(24),
  severity VARCHAR(16),
  sentiment VARCHAR(16),
  aiSource VARCHAR(16),
  status VARCHAR(16) DEFAULT 'open',
  reviewedBy VARCHAR(64), reviewedAt VARCHAR(40),
  createdAt VARCHAR(40),
  INDEX idx_blog_subject (subjectId),
  INDEX idx_blog_status (status),
  INDEX idx_blog_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ID cards: centres (code + color) + printed display IDs.
CREATE TABLE IF NOT EXISTS centres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  centreId VARCHAR(48) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  code VARCHAR(8) NOT NULL,
  color VARCHAR(16) DEFAULT '#76B043',
  status VARCHAR(16) DEFAULT 'active',
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  UNIQUE KEY idx_centres_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE summer_students ADD COLUMN displayId VARCHAR(24);

-- Mark schema current (keep in lockstep with NGG_SCHEMA_TARGET).
INSERT INTO schema_version (version) VALUES (14) ON DUPLICATE KEY UPDATE version = version;

CREATE TABLE IF NOT EXISTS volunteers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  volunteerId VARCHAR(32) NOT NULL UNIQUE,
  applicationId INT,
  memberId VARCHAR(64) DEFAULT '',
  fullName VARCHAR(255), email VARCHAR(200), phone VARCHAR(24) DEFAULT '',
  firstName VARCHAR(80) DEFAULT '', lastName VARCHAR(80) DEFAULT '',
  otherName VARCHAR(80) DEFAULT '', dob VARCHAR(40) DEFAULT '',
  role VARCHAR(24), courses TEXT,
  token VARCHAR(64) DEFAULT '', photoUrl VARCHAR(512) DEFAULT '',
  status VARCHAR(24) DEFAULT 'active',
  safeguarding VARCHAR(16) DEFAULT 'pending',
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_vol_email (email),
  INDEX idx_vol_token (token),
  INDEX idx_vol_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS volunteer_certs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  certId VARCHAR(32) NOT NULL UNIQUE,
  volunteerId VARCHAR(32) NOT NULL,
  milestone INT, hours INT,
  issuedAt VARCHAR(40),
  INDEX idx_certs_vol (volunteerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Attendance-taker rotation: one volunteer per centre on attendance duty each
-- day (auto round-robin, admin-overridable), plus a per-volunteer points ledger
-- that drives gamified levels + awards.
CREATE TABLE IF NOT EXISTS attendance_duty (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date VARCHAR(12) NOT NULL,
  centre VARCHAR(48) NOT NULL,
  volunteerId VARCHAR(32) NOT NULL,
  source VARCHAR(16) DEFAULT 'auto',
  assignedById VARCHAR(48) DEFAULT '',
  completedAt VARCHAR(40) DEFAULT '',
  takenCount INT DEFAULT 0,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_duty_unique (date, centre),
  INDEX idx_duty_vol (volunteerId),
  INDEX idx_duty_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS volunteer_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  volunteerId VARCHAR(32) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  points INT DEFAULT 0,
  date VARCHAR(12) DEFAULT '',
  note VARCHAR(255) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_vpoints_vol (volunteerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Volunteer hierarchy tiers — the volunteer analogue of centres. code → the
-- VOL-CODE-YY-serial ID prefix; color → the full-bleed volunteer card bg.
CREATE TABLE IF NOT EXISTS vol_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tierId VARCHAR(48) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  code VARCHAR(8) NOT NULL,
  color VARCHAR(16) DEFAULT '#00225F',
  rank INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'active',
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  UNIQUE KEY idx_vol_tiers_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO vol_tiers (tierId, name, code, color, rank) VALUES
  ('VT-admin',      'Admin / Ops', 'ADM', '#00225F', 1),
  ('VT-mentor',     'Mentor',      'MEN', '#1B7F5A', 2),
  ('VT-instructor', 'Instructor',  'INS', '#B0143C', 3)
ON DUPLICATE KEY UPDATE tierId = tierId;

-- Mark schema current (keep in lockstep with NGG_SCHEMA_TARGET).
INSERT INTO schema_version (version) VALUES (18) ON DUPLICATE KEY UPDATE version = version;

-- Photo pipeline: governed image asset with its own lifecycle (migration 19).
CREATE TABLE IF NOT EXISTS photo_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assetId VARCHAR(48) UNIQUE NOT NULL,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(48) NOT NULL,
  version INT DEFAULT 1,
  status VARCHAR(24) DEFAULT 'captured',
  sourceUrl VARCHAR(512) DEFAULT '',
  editedUrl VARCHAR(512) DEFAULT '',
  aiScore INT NULL,
  aiProvider VARCHAR(24) DEFAULT '',
  aiFindings TEXT,
  transforms TEXT,
  autoApproved TINYINT DEFAULT 0,
  claimedBy VARCHAR(48) DEFAULT '', claimedAt VARCHAR(40) DEFAULT '',
  reviewedBy VARCHAR(48) DEFAULT '', reviewedAt VARCHAR(40) DEFAULT '',
  decisionNote TEXT,
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_photo_subject (subjectType, subjectId),
  INDEX idx_photo_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (19) ON DUPLICATE KEY UPDATE version = version;

-- Gate kiosk password + optional centre pin (migration 20).
ALTER TABLE gate_links ADD COLUMN passHash VARCHAR(255) DEFAULT '';
ALTER TABLE gate_links ADD COLUMN centreId VARCHAR(48) DEFAULT '';
ALTER TABLE gate_links ADD COLUMN passSetAt VARCHAR(40) DEFAULT '';
ALTER TABLE gate_links ADD COLUMN passRotateDays INT DEFAULT 0;
ALTER TABLE gate_links ADD COLUMN passNotify VARCHAR(190) DEFAULT '';
ALTER TABLE gate_links ADD COLUMN passExpiryDays INT DEFAULT 0;
ALTER TABLE gate_links ADD COLUMN passExpiresAt VARCHAR(40) DEFAULT '';

INSERT INTO schema_version (version) VALUES (20) ON DUPLICATE KEY UPDATE version = version;

-- Geo-fence mapped to a centre + the location a student was registered at
-- (migration 21).
ALTER TABLE centres ADD COLUMN lat DOUBLE NULL;
ALTER TABLE centres ADD COLUMN lng DOUBLE NULL;
ALTER TABLE centres ADD COLUMN radiusM INT DEFAULT 150;
ALTER TABLE centres ADD COLUMN geofence TINYINT DEFAULT 0;
ALTER TABLE centres ADD COLUMN mapSource VARCHAR(16) DEFAULT '';
ALTER TABLE centres ADD COLUMN mapAccuracyM INT NULL;
ALTER TABLE centres ADD COLUMN mappedAt VARCHAR(40) DEFAULT '';

ALTER TABLE summer_students ADD COLUMN regLat DOUBLE NULL;
ALTER TABLE summer_students ADD COLUMN regLng DOUBLE NULL;
ALTER TABLE summer_students ADD COLUMN regGeoOk TINYINT NULL;
ALTER TABLE summer_students ADD COLUMN regGeoDist INT NULL;

INSERT INTO schema_version (version) VALUES (21) ON DUPLICATE KEY UPDATE version = version;

-- Guardian photo re-shoot token (migration 22).
ALTER TABLE summer_students ADD COLUMN photoToken VARCHAR(64) DEFAULT '';

INSERT INTO schema_version (version) VALUES (22) ON DUPLICATE KEY UPDATE version = version;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations 23–33 parity — the items the SQLite migrations add that this
-- mirror was missing. Declared as trailing ALTER/CREATE so the runtime
-- auto-migrator (db_apply_mysql_schema) applies them to EXISTING databases by
-- replaying this file (a CREATE would skip an already-present table). Every
-- future post-baseline column MUST be added here as a trailing ALTER too.
-- ═══════════════════════════════════════════════════════════════════════════

-- 24: broadcast audience targeting
ALTER TABLE notifications ADD COLUMN audience VARCHAR(64) DEFAULT '';

-- 25: 2FA one-time backup codes (hashed JSON)
ALTER TABLE members ADD COLUMN totpBackup TEXT;

-- 26: student completion certificates + revocation on both cert kinds
ALTER TABLE volunteer_certs ADD COLUMN revokedAt VARCHAR(40) DEFAULT '';
CREATE TABLE IF NOT EXISTS student_certs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  certId VARCHAR(64) UNIQUE NOT NULL, studentId VARCHAR(64) NOT NULL, cohortId VARCHAR(64) DEFAULT '',
  daysPresent INT DEFAULT 0, attendanceRate INT DEFAULT 0,
  issuedAt VARCHAR(40), revokedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_stucert_student (studentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 27: attendance check-out
ALTER TABLE attendance ADD COLUMN checkOutAt VARCHAR(40) DEFAULT '';

-- 28: per-centre capacity (0 = unlimited)
ALTER TABLE centres ADD COLUMN capacity INT DEFAULT 0;

-- 29: verified self-service email change
ALTER TABLE members ADD COLUMN pendingEmail VARCHAR(200) DEFAULT '';
ALTER TABLE members ADD COLUMN emailChangeToken VARCHAR(191) DEFAULT '';
ALTER TABLE members ADD COLUMN emailChangeExpiresAt VARCHAR(40) DEFAULT '';

-- 30: peer interaction — reactions + moderated comments
CREATE TABLE IF NOT EXISTS post_reactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  postId VARCHAR(64) NOT NULL, memberId VARCHAR(64) NOT NULL, emoji VARCHAR(16) NOT NULL,
  createdAt VARCHAR(40),
  UNIQUE KEY uq_reaction (postId, memberId),
  INDEX idx_reactions_post (postId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  commentId VARCHAR(64) UNIQUE NOT NULL,
  postId VARCHAR(64) NOT NULL, memberId VARCHAR(64) NOT NULL, memberName VARCHAR(255) DEFAULT '',
  body TEXT NOT NULL, status VARCHAR(24) DEFAULT 'pending',
  createdAt VARCHAR(40), moderatedBy VARCHAR(64) DEFAULT '', moderatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_comments_post (postId, status), INDEX idx_comments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 31: donations (Paystack) + per-member extra capabilities
CREATE TABLE IF NOT EXISTS donations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  reference VARCHAR(191) UNIQUE NOT NULL,
  email VARCHAR(200), name VARCHAR(255), amount BIGINT DEFAULT 0, currency VARCHAR(8) DEFAULT 'NGN',
  status VARCHAR(24) DEFAULT 'pending', channel VARCHAR(32) DEFAULT '', message TEXT,
  createdAt VARCHAR(40), paidAt VARCHAR(40) DEFAULT '',
  INDEX idx_donations_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE members ADD COLUMN capsExtra TEXT;

INSERT INTO schema_version (version) VALUES (33) ON DUPLICATE KEY UPDATE version = version;

-- 34: sex on every intake (applications + volunteers + summer students)
ALTER TABLE applications ADD COLUMN sex VARCHAR(24) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN sex VARCHAR(24) DEFAULT '';
ALTER TABLE summer_students ADD COLUMN sex VARCHAR(24) DEFAULT '';

INSERT INTO schema_version (version) VALUES (34) ON DUPLICATE KEY UPDATE version = version;

-- 35: punctuality — check-in status + minutes late (vs per-type resumption time)
ALTER TABLE attendance ADD COLUMN status VARCHAR(16) DEFAULT '';
ALTER TABLE attendance ADD COLUMN lateMinutes INT DEFAULT 0;

INSERT INTO schema_version (version) VALUES (35) ON DUPLICATE KEY UPDATE version = version;

-- 36: scoped admins (centre allow-list) + mentor department tag
ALTER TABLE members ADD COLUMN centreScope TEXT;
ALTER TABLE mentors ADD COLUMN department VARCHAR(80) DEFAULT '';

INSERT INTO schema_version (version) VALUES (36) ON DUPLICATE KEY UPDATE version = version;

-- 37: mentor stars (behaviour recognition ledger)
CREATE TABLE IF NOT EXISTS member_stars (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(24) NOT NULL DEFAULT 'student',
  givenById VARCHAR(64) NOT NULL,
  stars INT NOT NULL,
  category VARCHAR(48) DEFAULT '',
  note TEXT,
  centre VARCHAR(80) DEFAULT '',
  date VARCHAR(16) NOT NULL,
  createdAt VARCHAR(40),
  UNIQUE KEY uniq_stars_subject_date (subjectId, date),
  INDEX idx_stars_centre_date (centre, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (37) ON DUPLICATE KEY UPDATE version = version;

-- 38: V3 (Verbal/Vocal/Visual) weekly rating + awards ledger
CREATE TABLE IF NOT EXISTS v3_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subjectId VARCHAR(64) NOT NULL,
  givenById VARCHAR(64) NOT NULL,
  verbal INT NOT NULL, vocal INT NOT NULL, visual INT NOT NULL,
  period VARCHAR(16) NOT NULL,
  note TEXT, centre VARCHAR(80) DEFAULT '',
  createdAt VARCHAR(40),
  UNIQUE KEY uniq_v3_subject_period (subjectId, period),
  INDEX idx_v3_centre_period (centre, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS awards (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  awardId VARCHAR(48) UNIQUE NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(24) NOT NULL DEFAULT 'student',
  name VARCHAR(120) NOT NULL,
  tier INT DEFAULT 0,
  valueNaira BIGINT DEFAULT 0,
  period VARCHAR(24) DEFAULT '',
  centre VARCHAR(80) DEFAULT '',
  note TEXT,
  eligibilityStatus VARCHAR(24) DEFAULT 'eligible',
  mintedAt VARCHAR(40), createdBy VARCHAR(64) DEFAULT '',
  INDEX idx_awards_subject (subjectId),
  INDEX idx_awards_period (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (38) ON DUPLICATE KEY UPDATE version = version;

-- 39: analytics dimensions — self-reported gender + first-class activities
-- ledger with donor-grade evidence attachments (JSON).
ALTER TABLE summer_students ADD COLUMN gender VARCHAR(24) DEFAULT '';

CREATE TABLE IF NOT EXISTS activities (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  activityId VARCHAR(48) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(40) DEFAULT 'lesson',
  centre VARCHAR(80) DEFAULT '',
  department VARCHAR(80) DEFAULT '',
  date VARCHAR(20) NOT NULL,
  facilitatorId VARCHAR(64) DEFAULT '',
  facilitatorName VARCHAR(120) DEFAULT '',
  notes TEXT,
  evidence TEXT,
  participants INT DEFAULT 0,
  createdBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_activities_centre_date (centre, date),
  INDEX idx_activities_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (39) ON DUPLICATE KEY UPDATE version = version;

-- 40: volunteer deployment planning — centre + faculty on intake/roster, and a
-- volunteer_needs ledger (admin target headcount per centre × role × faculty).
ALTER TABLE volunteers ADD COLUMN centre VARCHAR(80) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN faculty VARCHAR(80) DEFAULT '';
ALTER TABLE applications ADD COLUMN faculty VARCHAR(80) DEFAULT '';

CREATE TABLE IF NOT EXISTS volunteer_needs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  centreId VARCHAR(48) NOT NULL,
  role VARCHAR(24) NOT NULL,
  faculty VARCHAR(80) DEFAULT '',
  needCount INT DEFAULT 0,
  updatedAt VARCHAR(40),
  updatedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY idx_vneeds_unique (centreId, role, faculty),
  INDEX idx_vneeds_centre (centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (40) ON DUPLICATE KEY UPDATE version = version;

-- 41: site-visibility consent (feature photo + first name publicly).
ALTER TABLE applications ADD COLUMN visibilityConsent TINYINT DEFAULT 0;
ALTER TABLE volunteers ADD COLUMN visibilityConsent TINYINT DEFAULT 0;

INSERT INTO schema_version (version) VALUES (41) ON DUPLICATE KEY UPDATE version = version;

-- 42: real centre management — address, area, lead volunteer, contacts,
-- meeting schedule, notes. Also feeds the public "find us" board cards.
ALTER TABLE centres ADD COLUMN address VARCHAR(240) DEFAULT '';
ALTER TABLE centres ADD COLUMN area VARCHAR(120) DEFAULT '';
ALTER TABLE centres ADD COLUMN leadVolunteerId VARCHAR(32) DEFAULT '';
ALTER TABLE centres ADD COLUMN phone VARCHAR(40) DEFAULT '';
ALTER TABLE centres ADD COLUMN email VARCHAR(160) DEFAULT '';
ALTER TABLE centres ADD COLUMN meetDays VARCHAR(120) DEFAULT '';
ALTER TABLE centres ADD COLUMN meetTime VARCHAR(60) DEFAULT '';
ALTER TABLE centres ADD COLUMN notes VARCHAR(400) DEFAULT '';

INSERT INTO schema_version (version) VALUES (42) ON DUPLICATE KEY UPDATE version = version;

-- 43: material (item) needs — a centre's non-headcount needs (laptops, chairs,
-- instruments, data, …). Received count is tracked directly (no roster).
CREATE TABLE IF NOT EXISTS item_needs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  centreId VARCHAR(48) NOT NULL,
  item VARCHAR(80) NOT NULL,
  needCount INT DEFAULT 0,
  filledCount INT DEFAULT 0,
  unit VARCHAR(24) DEFAULT '',
  note VARCHAR(240) DEFAULT '',
  updatedAt VARCHAR(40),
  updatedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY idx_ineeds_unique (centreId, item),
  INDEX idx_ineeds_centre (centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (43) ON DUPLICATE KEY UPDATE version = version;

-- 44: per-centre WhatsApp group invite link (shown after submission).
ALTER TABLE centres ADD COLUMN whatsappUrl VARCHAR(240) DEFAULT '';

INSERT INTO schema_version (version) VALUES (44) ON DUPLICATE KEY UPDATE version = version;

-- 45: public profile enrichment — member projects + mentor notes (isPublic gates
-- what leaves the server). Keyed by (subjectType, subjectId) for students + volunteers.
CREATE TABLE IF NOT EXISTS profile_projects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(48) NOT NULL,
  title VARCHAR(120) NOT NULL,
  kind VARCHAR(48) DEFAULT '',
  url VARCHAR(400) DEFAULT '',
  imageUrl VARCHAR(400) DEFAULT '',
  sortOrder INT DEFAULT 0,
  createdBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  updatedAt VARCHAR(40),
  INDEX idx_pproj_subject (subjectType, subjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS profile_notes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(48) NOT NULL,
  author VARCHAR(80) DEFAULT '',
  note VARCHAR(2000) NOT NULL,
  isPublic TINYINT DEFAULT 0,
  createdBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_pnote_subject (subjectType, subjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 46: public centre pages — the immersive, publicly-addressable landing page
-- for each Summer School centre (/centres/<slug>). slug drives the URL;
-- pageStatus gates public visibility; the rest is page content (a giant hero
-- image of a model, a tagline/headline, a story, and an image gallery).
ALTER TABLE centres ADD COLUMN slug VARCHAR(64) DEFAULT '';
ALTER TABLE centres ADD COLUMN pageStatus VARCHAR(16) DEFAULT 'draft';
ALTER TABLE centres ADD COLUMN tagline VARCHAR(200) DEFAULT '';
ALTER TABLE centres ADD COLUMN headline VARCHAR(200) DEFAULT '';
ALTER TABLE centres ADD COLUMN heroImageUrl TEXT;
ALTER TABLE centres ADD COLUMN heroImageMobileUrl TEXT;
ALTER TABLE centres ADD COLUMN story TEXT;
ALTER TABLE centres ADD COLUMN gallery TEXT;
ALTER TABLE centres ADD COLUMN pageUpdatedAt VARCHAR(40) DEFAULT '';
CREATE INDEX idx_centres_slug ON centres (slug);

INSERT INTO schema_version (version) VALUES (46) ON DUPLICATE KEY UPDATE version = version;

-- 47: hero image focal position for the public centre page (CSS object-position).
ALTER TABLE centres ADD COLUMN heroPosition VARCHAR(32) DEFAULT 'center bottom';

INSERT INTO schema_version (version) VALUES (47) ON DUPLICATE KEY UPDATE version = version;

-- 48: Community 2.0 — social feed with channels (courses + Commons), media,
-- reactions, moderated comments, bookmarks. All UGC AI-screened + moderatable.
CREATE TABLE IF NOT EXISTS community_channels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  channelId VARCHAR(48) UNIQUE NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  kind VARCHAR(16) DEFAULT 'course',
  faculty VARCHAR(120) DEFAULT '',
  icon VARCHAR(16) DEFAULT '',
  color VARCHAR(16) DEFAULT '#3b5bdb',
  description VARCHAR(400) DEFAULT '',
  sortOrder INT DEFAULT 0,
  pinned TINYINT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'active',
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_cchan_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_posts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  postId VARCHAR(48) UNIQUE NOT NULL,
  channelId VARCHAR(48) NOT NULL,
  authorId VARCHAR(48) NOT NULL,
  authorName VARCHAR(120) DEFAULT '',
  authorCentre VARCHAR(80) DEFAULT '',
  body TEXT,
  mediaType VARCHAR(16) DEFAULT 'none',
  mediaUrl VARCHAR(512) DEFAULT '',
  mediaPoster VARCHAR(512) DEFAULT '',
  mediaFormat VARCHAR(16) DEFAULT '',
  mediaBytes BIGINT DEFAULT 0,
  mediaPages INT DEFAULT 0,
  altText VARCHAR(400) DEFAULT '',
  status VARCHAR(16) DEFAULT 'published',
  pinned TINYINT DEFAULT 0,
  moderation TEXT,
  viewCount INT DEFAULT 0,
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_cpost_chan (channelId, status),
  INDEX idx_cpost_author (authorId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_reactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  postId VARCHAR(48) NOT NULL,
  memberId VARCHAR(48) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_creact_unique (postId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_comments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  commentId VARCHAR(48) UNIQUE NOT NULL,
  postId VARCHAR(48) NOT NULL,
  memberId VARCHAR(48) NOT NULL,
  memberName VARCHAR(120) DEFAULT '',
  body VARCHAR(1200) NOT NULL,
  status VARCHAR(16) DEFAULT 'published',
  moderation TEXT,
  createdAt VARCHAR(40),
  moderatedBy VARCHAR(48) DEFAULT '',
  moderatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_ccomment_post (postId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_bookmarks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  postId VARCHAR(48) NOT NULL,
  memberId VARCHAR(48) NOT NULL,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_cbook_unique (postId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (48) ON DUPLICATE KEY UPDATE version = version;

-- 49: Community public Showcase (admin-featured posts) + member reporting.
ALTER TABLE community_posts ADD COLUMN featured TINYINT DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN reportCount INT DEFAULT 0;
CREATE TABLE IF NOT EXISTS community_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  targetType VARCHAR(16) DEFAULT 'post',
  targetId VARCHAR(48) NOT NULL,
  memberId VARCHAR(48) NOT NULL,
  reason VARCHAR(400) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_creport_target (targetType, targetId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (49) ON DUPLICATE KEY UPDATE version = version;

-- 50: Community polls (a post kind) + one-vote-per-member ballots.
ALTER TABLE community_posts ADD COLUMN kind VARCHAR(16) DEFAULT 'post';
ALTER TABLE community_posts ADD COLUMN pollOptions TEXT;
CREATE TABLE IF NOT EXISTS community_poll_votes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  postId VARCHAR(48) NOT NULL,
  memberId VARCHAR(48) NOT NULL,
  choice INT NOT NULL,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_cpoll_unique (postId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (50) ON DUPLICATE KEY UPDATE version = version;

-- 51: Community per-member per-channel read state (Slack-style unreads).
CREATE TABLE IF NOT EXISTS community_reads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  memberId VARCHAR(48) NOT NULL,
  channelId VARCHAR(48) NOT NULL,
  lastReadAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40),
  UNIQUE KEY idx_cread_unique (memberId, channelId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (51) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS community_stars (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  postId VARCHAR(48) NOT NULL,
  memberId VARCHAR(48) NOT NULL,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_cstar_unique (postId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 52: admin-settable channel rules.
ALTER TABLE community_channels ADD COLUMN rules TEXT;
INSERT INTO schema_version (version) VALUES (52) ON DUPLICATE KEY UPDATE version = version;
-- 53: Genius Stars (community_stars, created above).
INSERT INTO schema_version (version) VALUES (53) ON DUPLICATE KEY UPDATE version = version;
-- 54: stored link previews on posts.
ALTER TABLE community_posts ADD COLUMN linkPreview TEXT;
INSERT INTO schema_version (version) VALUES (54) ON DUPLICATE KEY UPDATE version = version;

-- 55: gate desk-password rotation metadata.
ALTER TABLE gate_links ADD COLUMN passSetAt VARCHAR(40) DEFAULT '';
ALTER TABLE gate_links ADD COLUMN passRotateDays INT DEFAULT 0;
ALTER TABLE gate_links ADD COLUMN passNotify VARCHAR(190) DEFAULT '';
INSERT INTO schema_version (version) VALUES (55) ON DUPLICATE KEY UPDATE version = version;

-- 56: gate desk-password expiry (kills a password on schedule; rotation replaces it).
ALTER TABLE gate_links ADD COLUMN passExpiryDays INT DEFAULT 0;
ALTER TABLE gate_links ADD COLUMN passExpiresAt VARCHAR(40) DEFAULT '';
INSERT INTO schema_version (version) VALUES (56) ON DUPLICATE KEY UPDATE version = version;

-- 57: Institutional Policy enforcement — infractions (facts) and sanctions
-- (consequences). The unique indexes are load-bearing: one infraction per
-- person per kind per day, one sanction per person per kind per tier.
CREATE TABLE IF NOT EXISTS infractions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  personId VARCHAR(48) NOT NULL,
  personType VARCHAR(16) DEFAULT 'student',
  kind VARCHAR(32) NOT NULL,
  date VARCHAR(12) NOT NULL,
  note VARCHAR(255) DEFAULT '',
  byId VARCHAR(64) DEFAULT '',
  voidedAt VARCHAR(40) DEFAULT '',
  voidedBy VARCHAR(64) DEFAULT '',
  voidReason VARCHAR(255) DEFAULT '',
  createdAt VARCHAR(40),
  UNIQUE KEY idx_infr_unique (personId, kind, date),
  KEY idx_infr_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sanctions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  personId VARCHAR(48) NOT NULL,
  personType VARCHAR(16) DEFAULT 'student',
  kind VARCHAR(24) NOT NULL,
  tier INT DEFAULT 0,
  reason VARCHAR(255) DEFAULT '',
  amount INT DEFAULT 0,
  startsAt VARCHAR(40) DEFAULT '',
  endsAt VARCHAR(40) DEFAULT '',
  status VARCHAR(16) DEFAULT 'active',
  note VARCHAR(255) DEFAULT '',
  issuedBy VARCHAR(64) DEFAULT '',
  issuedAt VARCHAR(40) DEFAULT '',
  clearedAt VARCHAR(40) DEFAULT '',
  clearedBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  UNIQUE KEY idx_sanc_unique (personId, kind, tier),
  KEY idx_sanc_person (personId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (57) ON DUPLICATE KEY UPDATE version = version;

-- 58: punctuality gained a third state (present|tardy|late) plus the Part VI
-- redline flag that actually accrues an infraction, and the Musing half-day.
ALTER TABLE attendance ADD COLUMN redline INT DEFAULT 0;
ALTER TABLE attendance ADD COLUMN halfDay INT DEFAULT 0;
INSERT INTO schema_version (version) VALUES (58) ON DUPLICATE KEY UPDATE version = version;

-- 59: community sign-in stamp for card-holders (students + the Vanguard), who
-- have no row in `members` and so were invisible to the community headcount.
ALTER TABLE summer_students ADD COLUMN communityAt VARCHAR(40) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN communityAt VARCHAR(40) DEFAULT '';
INSERT INTO schema_version (version) VALUES (59) ON DUPLICATE KEY UPDATE version = version;

-- 60: structured child name, matching applications/volunteers (migration 32).
-- One "Full name" box made everything downstream guess: the ID card split on
-- spaces and took the last word as the surname, so a double-barrelled name
-- printed wrong and a surname-first entry printed backwards. `fullName` stays
-- authoritative and composed; these are the parts, backfilled on the same
-- split the card was already using.
ALTER TABLE summer_students ADD COLUMN firstName VARCHAR(120) DEFAULT '';
ALTER TABLE summer_students ADD COLUMN lastName VARCHAR(120) DEFAULT '';
-- The split itself runs from NGG_MYSQL_ROW_FIXUPS in api/_lib/db.php: this
-- file's replay executes only CREATE / ALTER / INSERT, so an UPDATE here is
-- read and skipped.
INSERT INTO schema_version (version) VALUES (60) ON DUPLICATE KEY UPDATE version = version;

-- 61: the parent's actual signature. A consent record with no signature is a
-- note that someone ticked a box; these make the printed record evidence.
ALTER TABLE consents ADD COLUMN signatureUrl TEXT;
ALTER TABLE summer_students ADD COLUMN consentSignatureUrl TEXT;
ALTER TABLE summer_students ADD COLUMN consentSignedName VARCHAR(160) DEFAULT '';
ALTER TABLE summer_students ADD COLUMN consentSignedAt VARCHAR(40) DEFAULT '';
INSERT INTO schema_version (version) VALUES (61) ON DUPLICATE KEY UPDATE version = version;

-- 62: ID cards expire. A summer card is a season pass, not a life membership.
ALTER TABLE qr_codes ADD COLUMN expiresAt VARCHAR(20) DEFAULT '';
-- The expiry backfill runs from NGG_MYSQL_ROW_FIXUPS in api/_lib/db.php.
INSERT INTO schema_version (version) VALUES (62) ON DUPLICATE KEY UPDATE version = version;

-- 63: which programme a mentor serves. `source` means where they came from,
-- not who they supervise. Defaults to 'summer' — what every mentor sees today.
ALTER TABLE mentors ADD COLUMN programme VARCHAR(16) DEFAULT 'summer';
INSERT INTO schema_version (version) VALUES (63) ON DUPLICATE KEY UPDATE version = version;

-- 64: The Arcade — server-graded mini games in the community. The answer key
-- lives on the round row and never reaches the client, `startedMs` is what the
-- speed bonus is timed from (a client-reported duration would be the first
-- thing edited), and `submittedAt` closes a round so nobody submits, reads
-- their mistakes and submits again. `programme` on the score row keeps the
-- Club and the Summer School off each other's boards.
CREATE TABLE IF NOT EXISTS arcade_rounds (
  roundId VARCHAR(32) PRIMARY KEY,
  playerId VARCHAR(64) NOT NULL,
  game VARCHAR(32) NOT NULL,
  tier INT DEFAULT 1,
  answerKey MEDIUMTEXT NOT NULL,
  seconds INT NOT NULL,
  startedAt VARCHAR(40) NOT NULL,
  startedMs BIGINT NOT NULL DEFAULT 0,
  submittedAt VARCHAR(40) DEFAULT '',
  INDEX idx_arcade_rounds_player (playerId, game),
  INDEX idx_arcade_rounds_started (startedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS arcade_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roundId VARCHAR(32) NOT NULL,
  playerId VARCHAR(64) NOT NULL,
  playerType VARCHAR(16) DEFAULT '',
  programme VARCHAR(16) DEFAULT '',
  game VARCHAR(32) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  correct INT DEFAULT 0,
  total INT DEFAULT 0,
  ms INT DEFAULT 0,
  centre VARCHAR(120) DEFAULT '',
  date VARCHAR(20) NOT NULL,
  createdAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_arcade_score_round (roundId),
  INDEX idx_arcade_score_board (programme, game, date),
  INDEX idx_arcade_score_player (playerId, game)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (64) ON DUPLICATE KEY UPDATE version = version;

-- 65: indexes for the queries a hundred centres make. `attendance` was indexed
-- on (cohortId, date) and (studentId, date), neither of which a bare
-- `WHERE date = ?` can seek on — and "what happened today" is the most-asked
-- question in the system. `centre` had no index, so every per-centre figure on
-- the public board scanned the whole student table.
CREATE INDEX idx_attend_date ON attendance(date);
CREATE INDEX idx_sstu_centre ON summer_students(centre);
CREATE INDEX idx_sstu_status_centre ON summer_students(status, centre);
CREATE INDEX idx_sstu_cohort_reg ON summer_students(cohortId, regStatus);
-- 66: the instructor's record of teaching — session log, per-child remarks,
-- and named skill marks per course. See the migration in api/_lib/db.php for
-- why remarks are not behaviour_logs and why the log stores only attendance
-- exceptions rather than the roll.
CREATE TABLE IF NOT EXISTS course_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sessionLogId VARCHAR(48) NOT NULL UNIQUE,
  course VARCHAR(80) NOT NULL,
  centre VARCHAR(80) NOT NULL,
  date VARCHAR(12) NOT NULL,
  instructorId VARCHAR(64) NOT NULL,
  instructorName VARCHAR(190) DEFAULT '',
  covered TEXT,
  roomScore INT DEFAULT 0,
  presentCount INT DEFAULT 0,
  absentCount INT DEFAULT 0,
  markedPresent TEXT,
  markedAbsent TEXT,
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  UNIQUE KEY idx_csess_slot (course, centre, date),
  INDEX idx_csess_instructor (instructorId, date),
  INDEX idx_csess_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_remarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  remarkId VARCHAR(48) NOT NULL UNIQUE,
  subjectId VARCHAR(64) NOT NULL,
  subjectName VARCHAR(190) DEFAULT '',
  subjectType VARCHAR(16) DEFAULT 'student',
  course VARCHAR(80) DEFAULT '',
  centre VARCHAR(80) DEFAULT '',
  authorId VARCHAR(64) NOT NULL,
  authorName VARCHAR(190) DEFAULT '',
  authorRole VARCHAR(24) DEFAULT '',
  kind VARCHAR(24) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(24) DEFAULT '',
  severity VARCHAR(16) DEFAULT '',
  aiSource VARCHAR(16) DEFAULT '',
  safeguarding TINYINT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'open',
  acknowledgedBy VARCHAR(64) DEFAULT '',
  acknowledgedAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_remark_subject (subjectId, id),
  INDEX idx_remark_author (authorId, createdAt),
  INDEX idx_remark_flag (safeguarding, status),
  INDEX idx_remark_centre (centre, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skill_marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectId VARCHAR(64) NOT NULL,
  course VARCHAR(80) NOT NULL,
  skill VARCHAR(120) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  markedById VARCHAR(64) DEFAULT '',
  markedByName VARCHAR(190) DEFAULT '',
  centre VARCHAR(80) DEFAULT '',
  updatedAt VARCHAR(40),
  UNIQUE KEY idx_skill_one (subjectId, course, skill),
  INDEX idx_skill_course (course, centre),
  INDEX idx_skill_marker (markedById, updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 67: the operations journal. Rolled up by (kind, source, message) so a
-- broken endpoint is one row with a count rather than one row per request —
-- an append-per-occurrence log turns an outage into a second outage.
CREATE TABLE IF NOT EXISTS ops_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  source VARCHAR(120) NOT NULL,
  message VARCHAR(255) NOT NULL DEFAULT '',
  detail VARCHAR(255) DEFAULT '',
  hits INT NOT NULL DEFAULT 1,
  firstAt VARCHAR(40) NOT NULL,
  lastAt VARCHAR(40) NOT NULL,
  clearedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_ops_sig (kind, source, message),
  INDEX idx_ops_recent (kind, lastAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 68: lead mentors, and the link from a mentor record back to the account or
-- card the person actually signs in with. Email-only matching breaks the
-- moment somebody signs in with an ID card, which carries no email.
ALTER TABLE mentors ADD COLUMN rank VARCHAR(16) DEFAULT 'mentor';
ALTER TABLE mentors ADD COLUMN memberId VARCHAR(64) DEFAULT '';
ALTER TABLE mentors ADD COLUMN volunteerId VARCHAR(64) DEFAULT '';
CREATE INDEX idx_mentors_member ON mentors(memberId);
CREATE INDEX idx_mentors_volunteer ON mentors(volunteerId);
CREATE INDEX idx_mentors_centre_rank ON mentors(centre, rank);

-- 69: self-registration, and the desk that checks it. `kind` splits one link
-- type into three doors — desk, self (public, no password) and review (its own
-- password) — because sharing a password between them is how a public link
-- ends up opening a staff desk.
ALTER TABLE gate_links ADD COLUMN kind VARCHAR(16) DEFAULT 'desk';
CREATE INDEX idx_gate_kind ON gate_links(kind, status);

ALTER TABLE summer_students ADD COLUMN submittedVia VARCHAR(48) DEFAULT '';
ALTER TABLE summer_students ADD COLUMN photoCheck TEXT;
ALTER TABLE summer_students ADD COLUMN reviewedById VARCHAR(64) DEFAULT '';
ALTER TABLE summer_students ADD COLUMN reviewedAt VARCHAR(40) DEFAULT '';
ALTER TABLE summer_students ADD COLUMN reviewNote TEXT;
CREATE INDEX idx_sstu_reg_centre ON summer_students(regStatus, centre);

INSERT INTO schema_version (version) VALUES (69) ON DUPLICATE KEY UPDATE version = version;

-- 70: idempotent intake. A client-minted submissionId, carried on every attempt,
-- so a retry after a timeout replays the original result instead of registering
-- a second child. The UNIQUE index is the lock: a request claims the key before
-- doing the work. Only success is retained — a refusal releases the key, because
-- a family fixing a validation error resubmits with the same id.
CREATE TABLE IF NOT EXISTS intake_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submissionId VARCHAR(64) UNIQUE NOT NULL,
  op VARCHAR(48) DEFAULT '',
  status VARCHAR(16) DEFAULT 'pending',
  resultJson TEXT,
  createdAt VARCHAR(40) DEFAULT '',
  completedAt VARCHAR(40) DEFAULT '',
  INDEX idx_intake_status (status, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (70) ON DUPLICATE KEY UPDATE version = version;

-- 71: the Programme Journal. The community holds conversation, which is fast and
-- gone; this holds the durable record — advice given, contributions made, issues
-- raised and how they resolved. visibility defaults to 'staff' so an entry naming
-- a child never becomes member- or world-readable by forgetting a dropdown, and a
-- shareToken is resolved against the CURRENT visibility, so narrowing an entry
-- kills every link already sent.
CREATE TABLE IF NOT EXISTS program_journal (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  entryId VARCHAR(48) UNIQUE NOT NULL,
  title VARCHAR(240) DEFAULT '',
  body TEXT,
  kind VARCHAR(24) DEFAULT 'note',
  status VARCHAR(16) DEFAULT 'open',
  visibility VARCHAR(16) DEFAULT 'staff',
  authorId VARCHAR(64) DEFAULT '',
  authorName VARCHAR(120) DEFAULT '',
  centreId VARCHAR(48) DEFAULT '',
  occurredAt VARCHAR(40) DEFAULT '',
  mediaJson TEXT,
  shareToken VARCHAR(64) DEFAULT '',
  pinned TINYINT DEFAULT 0,
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  archivedAt VARCHAR(40) DEFAULT '',
  INDEX idx_pj_vis (visibility, occurredAt),
  INDEX idx_pj_kind (kind, status),
  INDEX idx_pj_share (shareToken)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS program_journal_tags (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  entryId VARCHAR(48) NOT NULL,
  personId VARCHAR(64) NOT NULL,
  personKind VARCHAR(16) DEFAULT 'member',
  personName VARCHAR(120) DEFAULT '',
  role VARCHAR(32) DEFAULT 'involved',
  createdAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_pjt_unique (entryId, personId),
  INDEX idx_pjt_person (personId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (71) ON DUPLICATE KEY UPDATE version = version;

-- 72: date of birth, asked instead of age. An age typed into a box is wrong within
-- months and cannot be corrected without asking the family again, while every age
-- band and cohort comparison downstream is computed from it. `age` is kept and
-- still populated (derived from dob on the way in) because it is read in a dozen
-- places.
ALTER TABLE summer_students ADD COLUMN dob VARCHAR(12) DEFAULT '';

-- 73: when we last ASKED a family for a photo we do not have. Registrations from
-- before the image store lost their headshot at submit time and cannot be
-- recovered, so those families have to be asked again — a bounded, resumable
-- operation, which needs a marker. Its own column rather than reusing
-- remindedAt (which means "we chased the consent"): one would silently reset the
-- other and the roster's waiting-time column would start lying.
ALTER TABLE summer_students ADD COLUMN photoAskedAt VARCHAR(40) DEFAULT '';

INSERT INTO schema_version (version) VALUES (73) ON DUPLICATE KEY UPDATE version = version;

-- 74: the analyst chat — a thread per conversation, a row per turn.
--
-- Persisted rather than kept in the browser for three reasons that all matter
-- here: the answer cost real money to produce and should not evaporate on a
-- refresh; a question one coordinator asked is usually a question the next one
-- has too; and an answer that was acted on has to stay auditable — with the
-- evidence fingerprint it was grounded in, so "the numbers have moved since" is
-- something the screen can state rather than guess.
--
-- No column here holds a child. The question is scrubbed before it is stored, on
-- the same gate that scrubs it before it is sent to a provider.
CREATE TABLE IF NOT EXISTS insight_threads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  threadId VARCHAR(48) NOT NULL UNIQUE,
  title VARCHAR(200) DEFAULT '',
  ownerId VARCHAR(64) NOT NULL,
  centre VARCHAR(80) DEFAULT '',
  rangeLabel VARCHAR(80) DEFAULT '',
  turns INT DEFAULT 0,
  createdAt VARCHAR(40), updatedAt VARCHAR(40), archivedAt VARCHAR(40) DEFAULT '',
  INDEX idx_ithreads_owner (ownerId, updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS insight_turns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  threadId VARCHAR(48) NOT NULL,
  seq INT NOT NULL,
  askedById VARCHAR(64) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  planJson TEXT,
  claimsJson TEXT,
  checksJson TEXT,
  evidenceFp VARCHAR(32) DEFAULT '',
  rangeLabel VARCHAR(80) DEFAULT '',
  status VARCHAR(24) DEFAULT 'ok',
  error VARCHAR(200) DEFAULT '',
  providers VARCHAR(200) DEFAULT '',
  tokens INT DEFAULT 0,
  ms INT DEFAULT 0,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_iturns_seq (threadId, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (74) ON DUPLICATE KEY UPDATE version = version;

-- 75: which member of staff recorded a consent.
--
-- A consent given on paper at a desk and one a parent clicked in an email are
-- not the same evidence, and the ledger already separates them by `method`. What
-- it could not say was WHO took the paper one — the first question a
-- safeguarding review asks, because an in-person consent is only as good as the
-- person who witnessed it. Empty for rows written by the parent link, where the
-- actor is the parent and is already named.
ALTER TABLE consents ADD COLUMN recordedById VARCHAR(64) DEFAULT '';

INSERT INTO schema_version (version) VALUES (75) ON DUPLICATE KEY UPDATE version = version;

-- 76: ID card designs, as data.
--
-- The card artwork was code — the layout lived in JSX and only the data varied
-- per child, so changing where the QR sits meant a deploy. A template is the
-- same document with the layout moved into the row.
--
-- schemaJson is the whole design in one column rather than a table of elements,
-- because a design is only ever read and written whole; an element table would
-- buy joins we never make. version increments on publish and a print run records
-- the version it used, so a card can be reproduced exactly a year later — the
-- difference between a design tool and a credential system.
CREATE TABLE IF NOT EXISTS card_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  templateId VARCHAR(64) UNIQUE,
  name VARCHAR(160),
  kind VARCHAR(24) DEFAULT 'student',
  status VARCHAR(24) DEFAULT 'draft',
  version INT DEFAULT 1,
  schemaJson MEDIUMTEXT,
  publishedJson MEDIUMTEXT,
  createdById VARCHAR(64) DEFAULT '',
  updatedById VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  updatedAt VARCHAR(40),
  publishedAt VARCHAR(40) DEFAULT '',
  KEY idx_ctpl_kind (kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (76) ON DUPLICATE KEY UPDATE version = version;

-- 77: the design asset library.
--
-- Placed images were data: URLs written into the design itself, and a design is
-- capped at 512KB — so a 1600px photograph, 400KB of JPEG and 548KB once
-- base64-encoded, could not be saved AT ALL. A poster with a photo on it failed
-- with `too_large` and the work was lost. This is that bug's fix and the right
-- architecture regardless: bytes live once, designs reference them, and the same
-- logo used on ten posters is stored once rather than ten times.
--
-- `sha` is the content hash, so re-uploading the same file finds the existing
-- row instead of making a second copy. `storeId` is set when the bytes are on
-- this server and empty when they are in the cloud — both are just a URL to a
-- design, which is what lets a deployment switch between them without touching
-- a single template.
CREATE TABLE IF NOT EXISTS design_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assetId VARCHAR(64) UNIQUE,
  name VARCHAR(200) DEFAULT '',
  url TEXT,
  storeId VARCHAR(64) DEFAULT '',
  sha VARCHAR(64) DEFAULT '',
  mime VARCHAR(40) DEFAULT '',
  width INT DEFAULT 0,
  height INT DEFAULT 0,
  bytes INT DEFAULT 0,
  folder VARCHAR(64) DEFAULT '',
  uploadedById VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  archivedAt VARCHAR(40) DEFAULT '',
  KEY idx_dasset_sha (sha),
  KEY idx_dasset_folder (folder, archivedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (77) ON DUPLICATE KEY UPDATE version = version;

-- 78: one sex column for a child, and an index to disaggregate on it.
-- summer_students grew `sex` (34) and `gender` (39) for the same fact, and
-- nothing ever wrote either — the registration form did not ask — while the
-- analytics workspace read `gender` and reported every child as "Not recorded".
-- `sex` is now the single fact; `gender` stays in place (dropping a column on a
-- live host is the larger risk) and is copied across where `sex` is empty.
-- The gender → sex copy runs from NGG_MYSQL_ROW_FIXUPS in api/_lib/db.php.
CREATE INDEX idx_sstu_sex ON summer_students(sex);
CREATE INDEX idx_vol_sex ON volunteers(sex);

INSERT INTO schema_version (version) VALUES (78) ON DUPLICATE KEY UPDATE version = version;

-- 79: the analyst's answer as data (tiles, table, chart) beside its prose.
-- Stored, not derived on read: the blocks are grounded against the evidence as
-- it stood, and re-checking a turn against next week's figures would silently
-- change its mind about what was verified.
ALTER TABLE insight_turns ADD COLUMN dataJson TEXT;

INSERT INTO schema_version (version) VALUES (79) ON DUPLICATE KEY UPDATE version = version;

-- 80: school grade, and with it the transition window.
-- Stored as a number on the international ladder (Primary 1-6 = 1-6, JSS 1-3 =
-- 7-9, SSS 1-3 = 10-12) while the form asks in the words a Lagos parent uses:
-- a funder's eligibility rule reads "grades 7 to 9", and a VARCHAR holding
-- "JSS2", "Jss 2" and "J.S.S 2" is something somebody maps by hand the week a
-- proposal is due. gradeAsAt because a grade ages and a date of birth does not.
ALTER TABLE summer_students ADD COLUMN gradeLevel INT DEFAULT 0;
ALTER TABLE summer_students ADD COLUMN gradeAsAt VARCHAR(12) DEFAULT '';
CREATE INDEX idx_sstu_grade ON summer_students(gradeLevel);

INSERT INTO schema_version (version) VALUES (80) ON DUPLICATE KEY UPDATE version = version;

-- 81: a real learning measurement — the same instrument, twice, per child.
-- Coursework grades are different tasks marked by different people at different
-- difficulty; a trend across them is not a learning gain and cannot be defended
-- as one. An instrument outlives a cohort and is LOCKED once results exist,
-- because a revised instrument makes every existing pair incomparable. Scores
-- are stored raw with the max beside them, never as a percentage — a percentage
-- cannot be re-based when the paper turns out to have been marked out of 40.
-- `absent` is its own column, not a zero: a child who did not sit scored
-- nothing, and recording that as 0 turns an attendance problem into a learning
-- finding.
CREATE TABLE IF NOT EXISTS assessment_instruments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  instrumentId VARCHAR(48) UNIQUE NOT NULL,
  name VARCHAR(160) DEFAULT '',
  domain VARCHAR(32) DEFAULT 'literacy',
  maxScore INT DEFAULT 100,
  items INT DEFAULT 0,
  version INT DEFAULT 1,
  notes TEXT,
  gradeFrom INT DEFAULT 0,
  gradeTo INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'draft',
  lockedAt VARCHAR(40) DEFAULT '',
  createdById VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  archivedAt VARCHAR(40) DEFAULT '',
  -- Provenance (migration 82): what this instrument is, and where it came from.
  unit VARCHAR(64) DEFAULT '',
  scale VARCHAR(16) DEFAULT 'points',
  source VARCHAR(255) DEFAULT '',
  sourceUrl VARCHAR(255) DEFAULT '',
  licence VARCHAR(255) DEFAULT '',
  citation TEXT,
  adaptNote TEXT,
  catalogueKey VARCHAR(64) DEFAULT '',
  higherIsBetter TINYINT DEFAULT 1,
  INDEX idx_ainst_cat (catalogueKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assessment_windows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  windowId VARCHAR(48) UNIQUE NOT NULL,
  cohortId VARCHAR(48) DEFAULT '',
  instrumentId VARCHAR(48) DEFAULT '',
  phase VARCHAR(16) DEFAULT 'baseline',
  label VARCHAR(120) DEFAULT '',
  opensAt VARCHAR(12) DEFAULT '',
  closesAt VARCHAR(12) DEFAULT '',
  status VARCHAR(16) DEFAULT 'open',
  createdById VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_awin_instr (instrumentId, phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assessment_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resultId VARCHAR(48) UNIQUE NOT NULL,
  windowId VARCHAR(48) DEFAULT '',
  instrumentId VARCHAR(48) DEFAULT '',
  studentId VARCHAR(48) DEFAULT '',
  score INT DEFAULT 0,
  absent TINYINT DEFAULT 0,
  note VARCHAR(255) DEFAULT '',
  recordedById VARCHAR(64) DEFAULT '',
  recordedAt VARCHAR(40),
  UNIQUE KEY idx_ares_unique (windowId, studentId),
  INDEX idx_ares_student (studentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (81) ON DUPLICATE KEY UPDATE version = version;

INSERT INTO schema_version (version) VALUES (82) ON DUPLICATE KEY UPDATE version = version;

CREATE TABLE IF NOT EXISTS member_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entryId VARCHAR(64) UNIQUE NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  direction VARCHAR(12) NOT NULL DEFAULT 'charge',
  amount INT NOT NULL DEFAULT 0,
  periodKey VARCHAR(32) DEFAULT '',
  sessionId VARCHAR(64) DEFAULT '',
  note VARCHAR(255) DEFAULT '',
  method VARCHAR(32) DEFAULT '',
  reference VARCHAR(120) DEFAULT '',
  voidedAt VARCHAR(40) DEFAULT '',
  voidedBy VARCHAR(64) DEFAULT '',
  voidReason VARCHAR(255) DEFAULT '',
  createdAt VARCHAR(40),
  createdBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY idx_mledg_accrual (memberId, kind, periodKey),
  INDEX idx_mledg_member (memberId, createdAt),
  INDEX idx_mledg_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (83) ON DUPLICATE KEY UPDATE version = version;

-- Weekly engagement snapshots — one row per person per ISO week, carrying their
-- centre, so trends read per member and group per centre. Written weekly
-- (idempotent via the unique index); read by admin.engagement.trends.
CREATE TABLE IF NOT EXISTS engagement_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  weekStart VARCHAR(12) NOT NULL,
  role VARCHAR(16) NOT NULL,
  personId VARCHAR(64) NOT NULL,
  name VARCHAR(190) DEFAULT '',
  centre VARCHAR(80) DEFAULT '',
  engagement INT NOT NULL DEFAULT 0,
  band VARCHAR(12) DEFAULT '',
  windowDays INT NOT NULL DEFAULT 7,
  stats TEXT,
  createdAt VARCHAR(40),
  UNIQUE KEY idx_engsnap_unique (weekStart, role, personId),
  INDEX idx_engsnap_week (weekStart),
  INDEX idx_engsnap_centre (centre, weekStart),
  INDEX idx_engsnap_person (role, personId, weekStart)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (84) ON DUPLICATE KEY UPDATE version = version;

-- v85 — NGV promotion: two-way link between an NGG member and their volunteer
-- record (was added to the SQLite ladder but not mirrored here).
ALTER TABLE volunteers ADD COLUMN memberId VARCHAR(64) DEFAULT '';
ALTER TABLE members ADD COLUMN ngvVolunteerId VARCHAR(64) DEFAULT '';
ALTER TABLE members ADD COLUMN ngvAt VARCHAR(40) DEFAULT '';
CREATE INDEX idx_vol_member ON volunteers (memberId);
INSERT INTO schema_version (version) VALUES (85) ON DUPLICATE KEY UPDATE version = version;

-- v86 — seasonal nudges: one row per (message, recipient) sent. The UNIQUE index
-- makes the periodic campaign idempotent (api/_lib/nudges.php).
CREATE TABLE IF NOT EXISTS nudge_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  messageKey VARCHAR(64) NOT NULL,
  recipient VARCHAR(200) NOT NULL,
  channel VARCHAR(16) DEFAULT 'email',
  sentAt VARCHAR(40),
  UNIQUE KEY idx_nudge_once (messageKey, recipient)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (86) ON DUPLICATE KEY UPDATE version = version;

-- v87 — NGGC member ID redesign: printed display id + up to two disciplines.
ALTER TABLE members ADD COLUMN displayId VARCHAR(24) DEFAULT '';
ALTER TABLE members ADD COLUMN disciplines VARCHAR(120) DEFAULT '';
INSERT INTO schema_version (version) VALUES (87) ON DUPLICATE KEY UPDATE version = version;

-- v88 — a volunteer can be granted a portal capability per person.
-- "Admin / Ops" volunteers are not console staff and hold no role capability,
-- so the mentor portal had no way to admit them. Granting is explicit and
-- per-person; registering on a self-service form still grants nothing.
ALTER TABLE volunteers ADD COLUMN capsExtra TEXT;
INSERT INTO schema_version (version) VALUES (88) ON DUPLICATE KEY UPDATE version = version;

-- v89 — turn-based matches between two players (chess first).
-- Deliberately carries NO free-text column anywhere: the only thing a player
-- can send is one of a fixed set of reactions. Every match is readable by
-- staff at the centre and can be reported.
CREATE TABLE IF NOT EXISTS match_games (
  matchId VARCHAR(32) PRIMARY KEY,
  game VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'invited',
  programme VARCHAR(16) DEFAULT '',
  centre VARCHAR(120) DEFAULT '',
  playerA VARCHAR(64) NOT NULL,
  playerAName VARCHAR(120) DEFAULT '',
  playerAType VARCHAR(16) DEFAULT '',
  playerB VARCHAR(64) NOT NULL,
  playerBName VARCHAR(120) DEFAULT '',
  playerBType VARCHAR(16) DEFAULT '',
  turnPlayer VARCHAR(64) DEFAULT '',
  state MEDIUMTEXT,
  ply INT DEFAULT 0,
  result VARCHAR(16) DEFAULT '',
  winnerId VARCHAR(64) DEFAULT '',
  reason VARCHAR(32) DEFAULT '',
  tournamentId VARCHAR(32) DEFAULT '',
  flagged TINYINT DEFAULT 0,
  createdAt VARCHAR(40) NOT NULL,
  updatedAt VARCHAR(40) DEFAULT '',
  lastMoveAt VARCHAR(40) DEFAULT '',
  INDEX idx_match_players (playerA, playerB),
  INDEX idx_match_status (status, updatedAt),
  INDEX idx_match_centre (centre, game),
  INDEX idx_match_tournament (tournamentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS match_moves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(32) NOT NULL,
  ply INT NOT NULL,
  playerId VARCHAR(64) NOT NULL,
  move VARCHAR(16) NOT NULL,
  san VARCHAR(16) DEFAULT '',
  stateAfter MEDIUMTEXT,
  createdAt VARCHAR(40) NOT NULL,
  UNIQUE KEY idx_match_move_ply (matchId, ply),
  INDEX idx_match_move_match (matchId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS match_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(32) NOT NULL,
  ply INT DEFAULT 0,
  playerId VARCHAR(64) NOT NULL,
  reaction VARCHAR(24) NOT NULL,
  createdAt VARCHAR(40) NOT NULL,
  INDEX idx_match_react (matchId, ply)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (89) ON DUPLICATE KEY UPDATE version = version;

-- v90 — admin-hosted tournaments, centre rounds through to a final.
CREATE TABLE IF NOT EXISTS tournaments (
  tournamentId VARCHAR(32) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  game VARCHAR(24) NOT NULL DEFAULT 'chess',
  programme VARCHAR(16) DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  stage VARCHAR(16) NOT NULL DEFAULT 'centre',
  round INT DEFAULT 0,
  winnerId VARCHAR(64) DEFAULT '',
  winnerName VARCHAR(120) DEFAULT '',
  createdBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40) NOT NULL,
  updatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_trn_status (status, updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tournament_entrants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournamentId VARCHAR(32) NOT NULL,
  playerId VARCHAR(64) NOT NULL,
  playerName VARCHAR(120) DEFAULT '',
  playerType VARCHAR(16) DEFAULT '',
  centre VARCHAR(120) DEFAULT '',
  stage VARCHAR(16) DEFAULT 'centre',
  status VARCHAR(16) DEFAULT 'active',
  centreChampion TINYINT DEFAULT 0,
  eliminatedRound INT DEFAULT 0,
  createdAt VARCHAR(40) NOT NULL,
  UNIQUE KEY idx_trn_entrant (tournamentId, playerId),
  INDEX idx_trn_entrant_t (tournamentId, centre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE match_games ADD COLUMN tournamentRound INT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN tournamentStage VARCHAR(16) DEFAULT '';
INSERT INTO schema_version (version) VALUES (90) ON DUPLICATE KEY UPDATE version = version;

-- v91 — Math Lab: a level ladder from JSS number work to Further Maths.
CREATE TABLE IF NOT EXISTS math_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  playerId VARCHAR(64) NOT NULL,
  level INT NOT NULL,
  bestScore INT DEFAULT 0,
  bestCorrect INT DEFAULT 0,
  attempts INT DEFAULT 0,
  clearedAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_mathprog (playerId, level),
  INDEX idx_mathprog_player (playerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (91) ON DUPLICATE KEY UPDATE version = version;

-- v92 — the mentoring record: what was said, and what was agreed.
-- Staff writing about a child, read by staff, never served to the child's own
-- portal. Every write audited; every read gated by the roster's own scope.
-- metOn is separate from createdAt because a conversation is written up after
-- it happens, and a record that insists otherwise is a false record.
CREATE TABLE IF NOT EXISTS mentor_meetings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(16) NOT NULL DEFAULT 'member',
  mentorId VARCHAR(64) NOT NULL,
  mentorName VARCHAR(120) DEFAULT '',
  metOn VARCHAR(12) NOT NULL,
  kind VARCHAR(24) DEFAULT 'one-to-one',
  discussed TEXT,
  agreed TEXT,
  concern TINYINT NOT NULL DEFAULT 0,
  centre VARCHAR(120) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_mm_subject (subjectId, metOn),
  INDEX idx_mm_mentor (mentorId, metOn),
  INDEX idx_mm_concern (centre, concern)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mentor_goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(16) NOT NULL DEFAULT 'member',
  goal TEXT NOT NULL,
  setById VARCHAR(64) NOT NULL,
  setByName VARCHAR(120) DEFAULT '',
  dueOn VARCHAR(12) DEFAULT '',
  status VARCHAR(16) DEFAULT 'open',
  closedOn VARCHAR(12) DEFAULT '',
  closedById VARCHAR(64) DEFAULT '',
  centre VARCHAR(120) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_mg_subject (subjectId, status),
  INDEX idx_mg_due (status, dueOn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (92) ON DUPLICATE KEY UPDATE version = version;

-- v93 — what a shared document actually is, recorded rather than guessed from
-- its url. See the migration note in api/_lib/db.php.
ALTER TABLE community_posts ADD COLUMN mediaFormat VARCHAR(16) DEFAULT '';
ALTER TABLE community_posts ADD COLUMN mediaBytes BIGINT DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN mediaPages INT DEFAULT 0;

INSERT INTO schema_version (version) VALUES (93) ON DUPLICATE KEY UPDATE version = version;

-- v94 — a brute-force ceiling keyed on the SUBJECT under attack rather than on
-- the attacker's self-declared IP. See the migration note in api/_lib/db.php.
CREATE TABLE IF NOT EXISTS attempt_guard (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope VARCHAR(40) NOT NULL,
  subject VARCHAR(190) NOT NULL,
  fails INT NOT NULL DEFAULT 0,
  lockedUntil VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_attempt_key (scope, subject),
  INDEX idx_attempt_stale (updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (94) ON DUPLICATE KEY UPDATE version = version;

-- v95 — a notification that can be FOLLOWED: the id of the thing it is about.
-- See the migration note in api/_lib/db.php.
ALTER TABLE notifications ADD COLUMN linkRef VARCHAR(64) DEFAULT '';

INSERT INTO schema_version (version) VALUES (95) ON DUPLICATE KEY UPDATE version = version;

-- v96 — how long a clip runs, kept rather than only validated.
-- See the migration note in api/_lib/db.php.
ALTER TABLE community_posts ADD COLUMN mediaDuration INT DEFAULT 0;

INSERT INTO schema_version (version) VALUES (96) ON DUPLICATE KEY UPDATE version = version;

-- v97 — chess as a club fixture: ratings, challenges that are not yet games,
-- and a head-to-head counter. See the migration note in api/_lib/db.php.
CREATE TABLE IF NOT EXISTS chess_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  playerId VARCHAR(64) NOT NULL,
  rating INT NOT NULL DEFAULT 1200,
  games INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  peak INT NOT NULL DEFAULT 1200,
  lastPlayedAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_chess_rating_player (playerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chess_challenges (
  challengeId VARCHAR(64) PRIMARY KEY,
  fromId VARCHAR(64) NOT NULL, fromName VARCHAR(190) DEFAULT '',
  toId VARCHAR(64) DEFAULT '', toName VARCHAR(190) DEFAULT '',
  timeControl VARCHAR(16) DEFAULT '1day',
  colourPref VARCHAR(8) DEFAULT 'random',
  rated TINYINT DEFAULT 1,
  channelSlug VARCHAR(64) DEFAULT '',
  status VARCHAR(16) DEFAULT 'open',
  matchId VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40) NOT NULL,
  expiresAt VARCHAR(40) DEFAULT '',
  INDEX idx_chess_ch_to (toId, status),
  INDEX idx_chess_ch_open (status, expiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chess_head2head (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pairKey VARCHAR(140) NOT NULL,
  playerId VARCHAR(64) NOT NULL,
  opponentId VARCHAR(64) NOT NULL,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_chess_h2h (playerId, opponentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE match_games ADD COLUMN timeControl VARCHAR(16) DEFAULT '1day';
ALTER TABLE match_games ADD COLUMN rated TINYINT DEFAULT 1;
ALTER TABLE match_games ADD COLUMN channelSlug VARCHAR(64) DEFAULT '';
ALTER TABLE match_games ADD COLUMN ratingDelta INT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN settledAt VARCHAR(40) DEFAULT '';

INSERT INTO schema_version (version) VALUES (97) ON DUPLICATE KEY UPDATE version = version;

-- 98: the community audit — safeguarding records, comment reports, and the
-- indexes the feed's own ORDER BY needs.
--
-- `community_safeguarding` exists because the crisis gate used to decide
-- correctly and then throw the decision away: a child writing about self-harm
-- had their post refused, was shown a helpline, and no adult was ever told.
-- The refusal is the moment the disclosure becomes something to act on, not
-- the moment it stops mattering — so it is kept here, and an event is raised.
CREATE TABLE IF NOT EXISTS community_safeguarding (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  caseId VARCHAR(48) UNIQUE NOT NULL,
  authorId VARCHAR(48) NOT NULL,
  authorName VARCHAR(120) DEFAULT '',
  surface VARCHAR(16) DEFAULT 'post',      -- post | comment
  channelSlug VARCHAR(64) DEFAULT '',
  body TEXT,                               -- what the child actually wrote
  status VARCHAR(16) DEFAULT 'open',       -- open | acknowledged
  acknowledgedBy VARCHAR(48) DEFAULT '',
  acknowledgedAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40),
  INDEX idx_csafe_status (status, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reported comments had nowhere to surface: the queue selected them by
-- `status = 'reported'`, which the moderation map never writes, so a child
-- reporting a bullying reply reached no human at all.
ALTER TABLE community_comments ADD COLUMN reportCount INT DEFAULT 0;

-- Stamped the first time a post goes live, so approving a held post fires its
-- @mentions exactly once — approve used to fire them never, and a re-approval
-- after a hide would otherwise fire them twice.
ALTER TABLE community_posts ADD COLUMN notifiedAt VARCHAR(40) DEFAULT '';
ALTER TABLE community_comments ADD COLUMN notifiedAt VARCHAR(40) DEFAULT '';
-- Everything already live has had whatever notifications it was going to get.
-- Backfilled so a hide-and-reapprove on an old post cannot suddenly notify
-- people about a conversation from months ago.
-- Both stamps run from NGG_MYSQL_ROW_FIXUPS in api/_lib/db.php.

-- The feed's main ordering (pinned first, then newest) had no index that could
-- serve it — every page was a filesort over the whole table.
CREATE INDEX idx_cpost_feed ON community_posts (status, pinned, createdAt);
CREATE INDEX idx_cpost_featured ON community_posts (featured, status);
-- `WHERE memberId = ?` for the Saved count; the unique key leads with postId.
CREATE INDEX idx_cbook_member ON community_bookmarks (memberId);
CREATE INDEX idx_creport_reporter ON community_reports (memberId);

INSERT INTO schema_version (version) VALUES (98) ON DUPLICATE KEY UPDATE version = version;

-- 99: Tournaments 2.0 — real formats, real clocks, real ratings.
--
-- The old shape was one format (centre knockout → final), no clock, and
-- alphabetical pairing. This adds the three things a chess club actually
-- needs: a choice of format, time that really runs out, and a rating the
-- pairing is built from.
ALTER TABLE tournaments ADD COLUMN format VARCHAR(16) DEFAULT 'centre';
  -- centre | knockout | swiss | roundrobin | arena
ALTER TABLE tournaments ADD COLUMN timeControl VARCHAR(16) DEFAULT '10+0';
ALTER TABLE tournaments ADD COLUMN rated TINYINT DEFAULT 1;
ALTER TABLE tournaments ADD COLUMN totalRounds INT DEFAULT 0;
  -- Swiss/round-robin: how many rounds are planned. 0 = derive from entrants.
ALTER TABLE tournaments ADD COLUMN description VARCHAR(600) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN centres TEXT;
  -- JSON array. Empty/absent = every centre.
ALTER TABLE tournaments ADD COLUMN eligibility TEXT;
  -- JSON: which kinds of person may enter (member/student/volunteer/staff),
  -- plus optional rating floor/ceiling and age band.
ALTER TABLE tournaments ADD COLUMN startsAt VARCHAR(40) DEFAULT '';
ALTER TABLE tournaments ADD COLUMN endsAt VARCHAR(40) DEFAULT '';
  -- Arena only: the window the arena runs for.
ALTER TABLE tournaments ADD COLUMN settings TEXT;
  -- JSON, format-specific knobs kept out of the column list.

-- Standings live on the entrant: one row per player per tournament, which is
-- what every format needs and what the old knockout-only shape had no room for.
ALTER TABLE tournament_entrants ADD COLUMN seed INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN ratingAtEntry INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN score DECIMAL(5,1) DEFAULT 0;
  -- Win 1, draw 0.5, loss 0. Decimal because half points are the whole point.
ALTER TABLE tournament_entrants ADD COLUMN played INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN wins INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN draws INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN losses INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN byes INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN whiteCount INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN blackCount INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN lastColour VARCHAR(1) DEFAULT '';
  -- Swiss colour balance: alternate, and never give three of one colour.
ALTER TABLE tournament_entrants ADD COLUMN opponents TEXT;
  -- JSON array of playerIds already faced — Swiss must not repeat a pairing.
ALTER TABLE tournament_entrants ADD COLUMN tiebreak1 DECIMAL(7,2) DEFAULT 0;
  -- Buchholz (sum of opponents' scores).
ALTER TABLE tournament_entrants ADD COLUMN tiebreak2 DECIMAL(7,2) DEFAULT 0;
  -- Sonneborn-Berger.
ALTER TABLE tournament_entrants ADD COLUMN performance INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN ratingDelta INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN withdrawn TINYINT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN arenaStreak INT DEFAULT 0;
ALTER TABLE tournament_entrants ADD COLUMN arenaPoints INT DEFAULT 0;

-- One row per round, so a round has a state of its own rather than being
-- inferred from "are any games still open".
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournamentId VARCHAR(32) NOT NULL,
  round INT NOT NULL,
  stage VARCHAR(16) DEFAULT '',
  status VARCHAR(16) DEFAULT 'pending',   -- pending | live | complete
  pairedAt VARCHAR(40) DEFAULT '',
  closedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_trn_round (tournamentId, stage, round)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A pairing is not a match. A bye has no match, and a pairing exists the
-- moment the round is drawn — before anybody has moved a piece.
CREATE TABLE IF NOT EXISTS tournament_pairings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournamentId VARCHAR(32) NOT NULL,
  round INT NOT NULL,
  stage VARCHAR(16) DEFAULT '',
  board INT DEFAULT 0,
  centre VARCHAR(120) DEFAULT '',
  whiteId VARCHAR(64) DEFAULT '',
  whiteName VARCHAR(120) DEFAULT '',
  blackId VARCHAR(64) DEFAULT '',
  blackName VARCHAR(120) DEFAULT '',
  matchId VARCHAR(32) DEFAULT '',
  isBye TINYINT DEFAULT 0,
  result VARCHAR(8) DEFAULT '',           -- '' | '1-0' | '0-1' | '0.5-0.5' | 'bye'
  scoredAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40) NOT NULL,
  INDEX idx_trn_pair (tournamentId, stage, round, board),
  INDEX idx_trn_pair_match (matchId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Real clocks. A time control was a LABEL — '3+2' was stored and nothing ever
-- counted down. The server now holds the remaining time, applies the increment
-- on each move, and is the only thing allowed to decide that somebody flagged.
-- timeControl / rated / ratingDelta / settledAt already exist (migration 97);
-- what was missing is the time itself.
ALTER TABLE match_games ADD COLUMN initialMs INT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN incrementMs INT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN whiteMs INT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN blackMs INT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN clockRunning TINYINT DEFAULT 0;
ALTER TABLE match_games ADD COLUMN turnStartedAt VARCHAR(40) DEFAULT '';
  -- When the clock for the player to move started. Elapsed = now - this.
ALTER TABLE match_games ADD COLUMN board INT DEFAULT 0;
CREATE INDEX idx_match_clock ON match_games (status, clockRunning);

INSERT INTO schema_version (version) VALUES (99) ON DUPLICATE KEY UPDATE version = version;

-- 100: the board — idempotent moves, variants, and programme promotions.
--
-- IDEMPOTENCY. A move was identified only by its ply, so a client that sent a
-- move, lost the response and retried had two outcomes and no way to tell them
-- apart: the retry either collided with UNIQUE(matchId, ply) and surfaced as a
-- failure for a move that HAD landed, or — if the opponent had replied in the
-- meantime — applied a second time at a new ply. On a 3G handset at a centre
-- that is not a rare case. The client now names each move once.
-- NULL, not ''. Both MySQL and SQLite treat NULLs in a UNIQUE index as
-- distinct, so a move with no client id (an old row, or a caller that does not
-- send one) does not collide with the next one — while two arrivals carrying
-- the SAME id collide exactly as intended.
ALTER TABLE match_moves ADD COLUMN clientMoveId VARCHAR(40) DEFAULT NULL;
CREATE UNIQUE INDEX idx_match_move_client ON match_moves (matchId, clientMoveId);
ALTER TABLE match_moves ADD COLUMN msSpent INT DEFAULT 0;
  -- How long the mover actually thought. The clock already knows; keeping it
  -- per move is what makes a time graph and "you spent 4 minutes on move 12"
  -- possible without replaying the whole game.

-- VARIANTS. The rules engine now answers to more than one set of rules.
ALTER TABLE match_games ADD COLUMN variant VARCHAR(24) DEFAULT 'standard';
  -- standard | chess960 | kingofthehill | threecheck
ALTER TABLE match_games ADD COLUMN variantData TEXT;
  -- JSON. Chess960 keeps its start position id; three-check keeps the counts.
ALTER TABLE match_games ADD COLUMN startFen VARCHAR(120) DEFAULT '';
  -- Chess960 does not start from the standard position, so a game can no
  -- longer be replayed from a constant.
ALTER TABLE tournaments ADD COLUMN variant VARCHAR(24) DEFAULT 'standard';
ALTER TABLE chess_challenges ADD COLUMN variant VARCHAR(24) DEFAULT 'standard';

-- PROMOTIONS. First-party only: NGG promoting NGG's own programmes to its own
-- members. There is no third-party ad network here and there must not be one —
-- these are children, and behavioural advertising to minors is a different
-- product with a different legal footing.
CREATE TABLE IF NOT EXISTS promos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  promoId VARCHAR(32) UNIQUE NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(400) DEFAULT '',
  kind VARCHAR(24) DEFAULT 'programme',   -- programme | event | tournament | notice
  placement VARCHAR(32) DEFAULT 'chess',  -- chess | community | dashboard | arcade
  ctaLabel VARCHAR(48) DEFAULT '',
  ctaPage VARCHAR(64) DEFAULT '',         -- an in-app page id, never a raw url
  ctaRef VARCHAR(64) DEFAULT '',
  imageUrl VARCHAR(512) DEFAULT '',
  accent VARCHAR(16) DEFAULT '',
  priority INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'draft',     -- draft | live | ended
  startsAt VARCHAR(40) DEFAULT '',
  endsAt VARCHAR(40) DEFAULT '',
  audience TEXT,                          -- JSON: kinds, centres, programme
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  dismissals INT DEFAULT 0,
  createdBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40) NOT NULL,
  updatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_promo_live (status, placement, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per person per promo, so a dismissal sticks and an impression is not
-- counted forty times by one member refreshing a screen.
CREATE TABLE IF NOT EXISTS promo_seen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  promoId VARCHAR(32) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  seenAt VARCHAR(40) DEFAULT '',
  clickedAt VARCHAR(40) DEFAULT '',
  dismissedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_promo_seen (promoId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (100) ON DUPLICATE KEY UPDATE version = version;

-- ---------------------------------------------------------------------------
-- 101: game review, the tournament ladder, and promotions that carry a picture
--      and can belong to one event.
-- ---------------------------------------------------------------------------

-- One review per game, not one per viewer.
--
-- The analysis runs in the browser — there is no engine on shared hosting and
-- there is not going to be one — so this is a cache of a client's work rather
-- than a server's own finding. Two things follow, and both are enforced below:
-- the row records WHAT computed it (engine depth and budget), and the first
-- writer wins. A second player opening the same game reads the review the
-- first one produced rather than replacing it, so the numbers two children
-- discuss are the same numbers.
--
-- Deliberately not used for anything competitive. It is a coaching record: a
-- client could lie about it, and nothing that matters is downstream of it.
CREATE TABLE IF NOT EXISTS match_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(32) NOT NULL,
  -- Per side, from the review that produced them.
  whiteAccuracy INT DEFAULT 0,
  blackAccuracy INT DEFAULT 0,
  whiteAvgLoss INT DEFAULT 0,
  blackAvgLoss INT DEFAULT 0,
  whiteBlunders INT DEFAULT 0,
  blackBlunders INT DEFAULT 0,
  whiteMistakes INT DEFAULT 0,
  blackMistakes INT DEFAULT 0,
  whiteInaccuracies INT DEFAULT 0,
  blackInaccuracies INT DEFAULT 0,
  -- The move where the game turned, and what was available instead.
  turningPly INT DEFAULT 0,
  turningSan VARCHAR(16) DEFAULT '',
  turningBest VARCHAR(16) DEFAULT '',
  turningLoss INT DEFAULT 0,
  -- The evaluation after every ply, from White's side, as a compact JSON list.
  -- Read by the graph; small enough to store whole (200 plies of small ints).
  evals TEXT,
  -- What produced it, so a review computed by a phone that managed depth 6 is
  -- not silently compared with one computed by a laptop at depth 14.
  engineDepth INT DEFAULT 0,
  engineMs INT DEFAULT 0,
  byId VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(40) NOT NULL,
  UNIQUE KEY idx_review_match (matchId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Where each entrant stood before the current round was paired. The ladder's
-- movement arrows compare against this rather than against a guess.
ALTER TABLE tournament_entrants ADD COLUMN lastRank INT DEFAULT 0;

-- A promotion can belong to one tournament, and can carry a picture.
ALTER TABLE promos ADD COLUMN tournamentId VARCHAR(32) DEFAULT '';
-- 'card' is the strip already in use; 'popup' is the one that appears once
-- before or after a game and then not again.
ALTER TABLE promos ADD COLUMN shape VARCHAR(16) DEFAULT 'card';
CREATE INDEX idx_promo_trn ON promos (tournamentId);

INSERT INTO schema_version (version) VALUES (101) ON DUPLICATE KEY UPDATE version = version;

-- ─────────────────────────────────────────────────────────────────────────────
-- v102 — Who was ASKED to a tournament, as distinct from who entered it.
--
-- A director could add entrants one at a time and nothing else, so the only way
-- to fill a field was to sign children up without asking, which is not an
-- invitation. This table is the ask. It also makes the obvious question
-- answerable — 40 invited, 11 joined — which nothing could answer before,
-- because nobody recorded the 40.
CREATE TABLE IF NOT EXISTS tournament_invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tournamentId VARCHAR(32) NOT NULL,
  playerId VARCHAR(64) NOT NULL,
  playerName VARCHAR(120) DEFAULT '',
  centre VARCHAR(120) DEFAULT '',
  invitedBy VARCHAR(64) DEFAULT '',
  invitedAt VARCHAR(40) NOT NULL,
  -- Written by the join path, so invite→entry conversion is a fact rather than
  -- an inference from two timestamps that happen to be close together.
  joinedAt VARCHAR(40) DEFAULT '',
  declinedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_trn_invite_unique (tournamentId, playerId),
  INDEX idx_trn_invite_player (playerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (102) ON DUPLICATE KEY UPDATE version = version;

-- ── 103 · Homework ──────────────────────────────────────────────────────────
-- Three tables rather than a status column: the task outlives the term, a
-- submission is a fact about one child, and a nudge is an event that has to be
-- counted per day to be limited.

CREATE TABLE IF NOT EXISTS community_homework (
  id INT AUTO_INCREMENT PRIMARY KEY,
  homeworkId VARCHAR(32) NOT NULL,
  channelId VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  detail TEXT,
  dueAt VARCHAR(40) DEFAULT '',
  createdBy VARCHAR(64) DEFAULT '',
  createdByName VARCHAR(120) DEFAULT '',
  createdAt VARCHAR(40) NOT NULL,
  -- active | archived. Never deleted: a child who submitted work should not
  -- find the task it belonged to has vanished.
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  UNIQUE KEY idx_hw_id (homeworkId),
  INDEX idx_hw_channel (channelId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The cohort is SNAPSHOT at creation — one row per child asked. The
-- denominator in "14 of 24" is a fact about who was asked, not a live count of
-- who happens to be in the channel today.
CREATE TABLE IF NOT EXISTS community_homework_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  homeworkId VARCHAR(32) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  memberName VARCHAR(120) DEFAULT '',
  centre VARCHAR(120) DEFAULT '',
  -- "Has opened the task" — what separates "has not got round to it" from
  -- "does not know about it", the only distinction that makes a nudge fair.
  seenAt VARCHAR(40) DEFAULT '',
  submittedAt VARCHAR(40) DEFAULT '',
  submittedRef VARCHAR(64) DEFAULT '',
  reviewedAt VARCHAR(40) DEFAULT '',
  reviewedBy VARCHAR(64) DEFAULT '',
  note VARCHAR(400) DEFAULT '',
  UNIQUE KEY idx_hws_unique (homeworkId, memberId),
  INDEX idx_hws_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every nudge, kept. The daily limit is enforced by reading this rather than by
-- a counter that can drift, and it lets a child be shown "Nudged Tue" truthfully.
CREATE TABLE IF NOT EXISTS community_homework_nudge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  homeworkId VARCHAR(32) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  nudgedBy VARCHAR(64) DEFAULT '',
  nudgedAt VARCHAR(40) NOT NULL,
  -- The UTC date of nudgedAt, so one-per-day is an index lookup.
  nudgedDay VARCHAR(10) NOT NULL,
  UNIQUE KEY idx_hwn_daily (homeworkId, memberId, nudgedDay),
  INDEX idx_hwn_member (memberId, nudgedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (103) ON DUPLICATE KEY UPDATE version = version;

-- ── 104 · Typing ────────────────────────────────────────────────────────────
-- One row per person per channel, overwritten in place and read back only for
-- the last few seconds. A table rather than a socket because this runs on
-- shared hosting, which cannot hold a persistent connection open.
--
-- Nothing here is history. A read ignores anything older than the TTL and
-- deletes it on the way past, so a keystroke by a child is never a record.
CREATE TABLE IF NOT EXISTS community_typing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channelId VARCHAR(32) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  memberName VARCHAR(120) DEFAULT '',
  staff TINYINT NOT NULL DEFAULT 0,
  atIso VARCHAR(40) NOT NULL,
  UNIQUE KEY idx_typing_unique (channelId, memberId),
  INDEX idx_typing_at (channelId, atIso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (104) ON DUPLICATE KEY UPDATE version = version;

-- ── 105 · The personal journal, widened to §8a/§8b ──────────────────────────
-- Every column is ADDED rather than replaced: `journal` is also written by the
-- anchor reflection flow, which knows about mood, body and isPrivate and
-- nothing else, and must keep working untouched. `visibility` supersedes
-- isPrivate for the new writer; isPrivate is kept in step on every write so
-- there is one fact with two spellings rather than two that can disagree.
ALTER TABLE journal ADD COLUMN title TEXT;
-- private | mentor | programme. Defaulting to private is the design's rule and
-- a safeguarding one: a child's journal is private unless they choose otherwise.
ALTER TABLE journal ADD COLUMN visibility VARCHAR(16) DEFAULT 'private';
-- Space-separated, lower-case, no leading #. Counted in PHP over one member's
-- own entries — cheaper to keep correct than a join table nothing else needs.
ALTER TABLE journal ADD COLUMN tags TEXT;
ALTER TABLE journal ADD COLUMN wordCount INT DEFAULT 0;
ALTER TABLE journal ADD COLUMN mediaJson TEXT;
-- The DAY the entry is about, not when it was typed: somebody writing up
-- Saturday on Sunday morning should see it on Saturday in the week strip.
ALTER TABLE journal ADD COLUMN occurredOn VARCHAR(10) DEFAULT '';
ALTER TABLE journal ADD COLUMN promptText TEXT;
ALTER TABLE journal ADD COLUMN updatedAt VARCHAR(40) DEFAULT '';
CREATE INDEX idx_journal_day ON journal (memberId, occurredOn);

INSERT INTO schema_version (version) VALUES (105) ON DUPLICATE KEY UPDATE version = version;

-- ── 106 · Draw offers ───────────────────────────────────────────────────────
-- Columns on the game rather than a table: an offer is a fact about the CURRENT
-- position and only one is ever live. drawOfferBy/At are the live offer and are
-- cleared the moment it is answered — accepted, declined, or met with a move.
--
-- drawOfferLastBy/drawOfferPly outlive the answer: they remember who offered
-- last and in which position, and they are the anti-nuisance rule. Repeatedly
-- offering a draw is how a losing player badgers a winning one, and in a
-- service for children that is not a quirk of etiquette. Kept apart from the
-- live offer so a decline cannot wipe the record of what was declined, and kept
-- per player so the opponent changing their mind is not treated as badgering.
ALTER TABLE match_games ADD COLUMN drawOfferBy VARCHAR(64) DEFAULT '';
ALTER TABLE match_games ADD COLUMN drawOfferAt VARCHAR(40) DEFAULT '';
ALTER TABLE match_games ADD COLUMN drawOfferLastBy VARCHAR(64) DEFAULT '';
ALTER TABLE match_games ADD COLUMN drawOfferPly INT DEFAULT -1;

INSERT INTO schema_version (version) VALUES (106) ON DUPLICATE KEY UPDATE version = version;

-- ── 107 · The Programme record (§8c) ────────────────────────────────────────
-- The journal already held what happened; §8c is about what happened NEXT — an
-- issue's updates, who is following it, what a decision follows from, what a
-- contribution actually raised. All of it was being narrated in prose in the
-- body, where nothing can count it and a summary tile cannot be honest.
--
-- Everything countable stays derivable: "receipts attached (2)" and "12 photos"
-- are the media already on the entry, and "kept by 14 members" is a row count.
-- A stored tally beside a list of the things it counts is two records of one
-- fact, and they drift.
ALTER TABLE program_journal ADD COLUMN ownerId VARCHAR(64) DEFAULT '';
ALTER TABLE program_journal ADD COLUMN ownerName VARCHAR(120) DEFAULT '';
-- The back-reference §8c draws as "↳ Follows the hall double-booking issue".
ALTER TABLE program_journal ADD COLUMN parentEntryId VARCHAR(48) DEFAULT '';
-- Money in the smallest unit. Naira has kobo, and a float here is how a funding
-- total ends in .00000001.
ALTER TABLE program_journal ADD COLUMN amountMinor BIGINT DEFAULT 0;
ALTER TABLE program_journal ADD COLUMN targetMinor BIGINT DEFAULT 0;
ALTER TABLE program_journal ADD COLUMN currency VARCHAR(8) DEFAULT 'NGN';
ALTER TABLE program_journal ADD COLUMN contributors INT DEFAULT 0;
-- A milestone's headline: "41" "of 46" "finished twelve weeks".
ALTER TABLE program_journal ADD COLUMN countValue INT DEFAULT 0;
ALTER TABLE program_journal ADD COLUMN countTotal INT DEFAULT 0;
ALTER TABLE program_journal ADD COLUMN countUnit VARCHAR(80) DEFAULT '';
-- "agreed with 2 mentors · 18 members notified". Provenance is the reason a
-- decision is trusted a year later, and it cannot be reconstructed after.
ALTER TABLE program_journal ADD COLUMN agreedWith INT DEFAULT 0;
ALTER TABLE program_journal ADD COLUMN notified INT DEFAULT 0;
-- Proposed by somebody without the journal capability, waiting for a mentor.
-- §8c promises "a mentor reviews it before it appears here", and a promise
-- printed on the screen that makes it has to be enforced by the screen behind.
ALTER TABLE program_journal ADD COLUMN proposedBy VARCHAR(64) DEFAULT '';
ALTER TABLE program_journal ADD COLUMN proposedName VARCHAR(120) DEFAULT '';
ALTER TABLE program_journal ADD COLUMN publishedAt VARCHAR(40) DEFAULT '';

CREATE TABLE IF NOT EXISTS program_journal_updates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  updateId VARCHAR(48) UNIQUE NOT NULL,
  entryId VARCHAR(48) NOT NULL,
  authorId VARCHAR(64) DEFAULT '',
  authorName VARCHAR(120) DEFAULT '',
  body TEXT,
  createdAt VARCHAR(40) DEFAULT '',
  INDEX idx_pju_entry (entryId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One table for two words. "Follow this" on an issue and the bookmark on a
-- piece of advice are the same act — this member marked this entry — and two
-- tables would be two answers to "how many people are holding on to this".
CREATE TABLE IF NOT EXISTS program_journal_follows (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  entryId VARCHAR(48) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  createdAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_pjf_unique (entryId, memberId),
  INDEX idx_pjf_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (107) ON DUPLICATE KEY UPDATE version = version;

-- ── 108 · An application's reference stops being its row id ─────────────────
-- NGG-A-00412 told anybody holding it how many applications the programme had
-- received and — with a guessable email — let the status of a named person be
-- found by walking the numbers. The lookup is throttled at 20 per 5 minutes,
-- which is an afternoon.
--
-- Rows that already exist keep NO stored ref on purpose: their reference has
-- been emailed to a family and printed on a success screen, so it goes on
-- resolving by id. Only new applications get a random one.
ALTER TABLE applications ADD COLUMN ref VARCHAR(24) DEFAULT '';
CREATE INDEX idx_apps_ref ON applications(ref);

INSERT INTO schema_version (version) VALUES (108) ON DUPLICATE KEY UPDATE version = version;

-- ── 109 · A member's NGG level gets a column of its own ─────────────────────
-- It is the first thing a centre lead asks about a child and the roster has
-- always carried it, but until now the only place to put it on import was the
-- free-text note — where nothing can filter, count or sort by it. Existing rows
-- are backfilled from that note in the same breath, so the column is populated
-- the moment it exists rather than whenever somebody next re-runs the import.
--
-- The pattern is the one members-import.php writes: a line reading "Level B" as
-- the first segment of the fenced block. Anything that does not match is left
-- blank rather than guessed at.
-- The backfill itself is NOT here. db_apply_mysql_schema() executes only
-- CREATE / ALTER / INSERT from this file, so an UPDATE placed here is read and
-- skipped. It lives in api/_lib/db.php as NGG_BACKFILL_MEMBER_LEVELS, run from
-- both the SQLite ladder and NGG_MYSQL_ROW_FIXUPS.
ALTER TABLE members ADD COLUMN level VARCHAR(16) DEFAULT '';

INSERT INTO schema_version (version) VALUES (109) ON DUPLICATE KEY UPDATE version = version;

-- ── 110 · Member self-service requests ──────────────────────────────────────
-- One table for everything a member ASKS the desk for. Four kinds today — a
-- payment they say they have made, an appeal against a fine, a leave of
-- absence, a replacement ID — sharing a shape because they share a life:
-- raised by the member, read by an admin, decided once, decision kept.
--
-- A payment claim is deliberately NOT a ledger row. fees.php is explicit that
-- "a member confirming their own payment is not a thing this ledger will ever
-- accept", and that is right: the ledger records money the desk has seen. A
-- claim is the member telling the desk to go and look. Approving one posts the
-- payment through the ordinary admin path, so money enters the account one way.
CREATE TABLE IF NOT EXISTS member_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  requestId VARCHAR(48) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  subject VARCHAR(200) DEFAULT '',
  body TEXT,
  amount INT DEFAULT 0,
  reference VARCHAR(120) DEFAULT '',
  proofUrl TEXT,
  paidAt VARCHAR(40) DEFAULT '',
  fromDate VARCHAR(40) DEFAULT '',
  toDate VARCHAR(40) DEFAULT '',
  refEntryId VARCHAR(48) DEFAULT '',
  decision TEXT,
  decidedBy VARCHAR(64) DEFAULT '',
  decidedAt VARCHAR(40) DEFAULT '',
  ledgerEntryId VARCHAR(48) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_mreq_member (memberId, createdAt),
  INDEX idx_mreq_open (status, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (110) ON DUPLICATE KEY UPDATE version = version;

-- Which roster file was loaded, when, by whom, and what it did. `digest` is
-- members_import_digest() — a hash of the OUTCOME, so it survives key order,
-- row order and re-serialisation. Not unique on purpose: re-applying a roster
-- is legal and this table exists to say it happened, not to forbid it.
-- CHAR(64), not VARCHAR: a sha256 hex string is always exactly 64.
CREATE TABLE IF NOT EXISTS member_import_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  digest CHAR(64) NOT NULL,
  fileSha VARCHAR(64) DEFAULT '',
  source VARCHAR(255) DEFAULT '',
  actorId VARCHAR(64) DEFAULT '',
  overwrite TINYINT DEFAULT 0,
  created INT DEFAULT 0,
  updated INT DEFAULT 0,
  unchanged INT DEFAULT 0,
  failed INT DEFAULT 0,
  rowCount INT DEFAULT 0,
  at VARCHAR(40) DEFAULT '',
  INDEX idx_mirun_digest (digest, id),
  INDEX idx_mirun_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (111) ON DUPLICATE KEY UPDATE version = version;

-- ── Summer School: editions, and groups within an edition ───────────────────
--
-- THE VOCABULARY, because it was the problem. Three different things were all
-- called a "cohort" somewhere in this product:
--
--   EDITION  one season of Summer School — "Summer School 2026". Stored in
--            `summer_cohorts`; its id is the `cohortId` that summer_students,
--            attendance and qr_codes already carry. That column means EDITION,
--            everywhere, with no exceptions. The table keeps its historical
--            name rather than gaining a translation layer over it — this
--            schema deliberately has none.
--   GROUP    a class WITHIN an edition — "Egbeda · Music · Morning". This
--            table. New concept, new name, its own id. When a coordinator says
--            "cohort" out loud, this is what they mean, so the UI calls it a
--            group and never a cohort.
--   CENTRE   a PLACE. `centres`. Belongs to NGG the organisation, not to
--            Summer School: NGG members are posted to one all year and its
--            code is the printed ID prefix on their cards. Summer School RUNS
--            AT centres; it does not own them.
--
-- `cohortId` below is the EDITION a group belongs to, named to match the
-- column it points at. Codes are unique within an edition, never globally.
CREATE TABLE IF NOT EXISTS summer_groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  groupId VARCHAR(48) NOT NULL UNIQUE,
  cohortId VARCHAR(48) NOT NULL,
  name VARCHAR(160) NOT NULL,
  code VARCHAR(32) NOT NULL,
  centreId VARCHAR(48) DEFAULT '',
  faculty VARCHAR(80) DEFAULT '',
  track VARCHAR(80) DEFAULT '',
  leadId VARCHAR(48) DEFAULT '',
  capacity INT DEFAULT 0,
  meetDays VARCHAR(32) DEFAULT '',
  meetTime VARCHAR(32) DEFAULT '',
  startDate VARCHAR(40) DEFAULT '',
  endDate VARCHAR(40) DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  notes TEXT,
  createdAt VARCHAR(40) DEFAULT '', createdBy VARCHAR(64) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '', updatedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY idx_sgrp_code (cohortId, code),
  INDEX idx_sgrp_edition (cohortId, status),
  INDEX idx_sgrp_centre (centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE summer_students ADD COLUMN groupId VARCHAR(48) DEFAULT '';
CREATE INDEX idx_sstu_group ON summer_students(groupId);

-- Edition lifecycle. `status` already held 'active' | 'archived' and those keep
-- their meaning — 'active' is the one edition being run, and only one may be
-- active at a time. 'planning' and 'closed' are the two states a coordinator
-- previously had to fake by archiving early or leaving an old edition active.
ALTER TABLE summer_cohorts ADD COLUMN code VARCHAR(24) DEFAULT '';
ALTER TABLE summer_cohorts ADD COLUMN applyOpensAt VARCHAR(40) DEFAULT '';
ALTER TABLE summer_cohorts ADD COLUMN applyClosesAt VARCHAR(40) DEFAULT '';
ALTER TABLE summer_cohorts ADD COLUMN notes TEXT;
ALTER TABLE summer_cohorts ADD COLUMN updatedAt VARCHAR(40) DEFAULT '';
CREATE INDEX idx_scoh_status ON summer_cohorts(status, id);

INSERT INTO schema_version (version) VALUES (112) ON DUPLICATE KEY UPDATE version = version;

-- ── ID cards: two faces, and a record of what was printed ───────────────────
--
-- `face` + `pairId` are what let a design have a BACK. A card has two sides; a
-- template was one document, so a back either did not exist or was a second
-- unrelated design nobody could tell was the pair. A front names its back and
-- the batch renders both per person, in order, so a duplex run cannot come out
-- mismatched.
--
-- card_runs / card_issues are the issuance record. The template system already
-- froze a published version and bumped it on republish, and promised that "a
-- print run stores the version it used" — except nothing stored it. Print runs
-- left an audit line and no rows, so a first issue could not be told from a
-- reprint, "which design is the card in this member's hand" had no answer, and
-- a half-printed batch left nothing to resume from.
--
-- The template version is denormalised onto both tables on purpose: it is the
-- fact being preserved, and it must survive the template being republished,
-- renamed or deleted afterwards.
ALTER TABLE card_templates ADD COLUMN face VARCHAR(16) DEFAULT 'single';
ALTER TABLE card_templates ADD COLUMN pairId VARCHAR(64) DEFAULT '';
CREATE INDEX idx_ctpl_pair ON card_templates(pairId);

CREATE TABLE IF NOT EXISTS card_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  runId VARCHAR(48) NOT NULL UNIQUE,
  kind VARCHAR(24) NOT NULL DEFAULT 'member',
  mode VARCHAR(16) NOT NULL DEFAULT 'print',
  templateId VARCHAR(64) DEFAULT '',
  templateName VARCHAR(160) DEFAULT '',
  templateVersion INT DEFAULT 0,
  backTemplateId VARCHAR(64) DEFAULT '',
  backTemplateVersion INT DEFAULT 0,
  output VARCHAR(16) DEFAULT '',
  dpi INT DEFAULT 0,
  sheet VARCHAR(16) DEFAULT '',
  requested INT DEFAULT 0,
  issued INT DEFAULT 0,
  failed INT DEFAULT 0,
  reprintOf VARCHAR(48) DEFAULT '',
  reason VARCHAR(255) DEFAULT '',
  actorId VARCHAR(64) DEFAULT '',
  startedAt VARCHAR(40) DEFAULT '',
  finishedAt VARCHAR(40) DEFAULT '',
  INDEX idx_crun_at (startedAt),
  INDEX idx_crun_kind (kind, startedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_issues (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  runId VARCHAR(48) NOT NULL,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  displayId VARCHAR(48) DEFAULT '',
  templateId VARCHAR(64) DEFAULT '',
  templateVersion INT DEFAULT 0,
  reprint TINYINT DEFAULT 0,
  ok TINYINT DEFAULT 1,
  note VARCHAR(255) DEFAULT '',
  at VARCHAR(40) DEFAULT '',
  INDEX idx_ciss_run (runId),
  INDEX idx_ciss_subject (subjectType, subjectId, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (113) ON DUPLICATE KEY UPDATE version = version;

-- ── 114 · The Courage Index (NGGC 2040 brief §14) ───────────────────────────
-- The one instrument in the brief with nothing behind it: musing lives in the
-- journal, dues and fines in the fees ledger, the NGV rung on members.level —
-- courage was recorded nowhere.
--
-- `evidence` carries what the mentor actually watched happen. The domain
-- rejects an empty one, because the brief's constraint is that a score is
-- given for an observed instance and not for an impression of a child; storing
-- the instance beside the number is what makes that enforceable rather than
-- aspirational.
--
-- No UNIQUE on (subjectId, observedOn) on purpose. A star is one per child per
-- day to stop inflation; two genuinely separate acts of courage in one
-- afternoon are two observations, and the evidence requirement is what bounds
-- this rather than the calendar.
--
-- No aggregate column: the index is computed on read, so correcting one entry
-- cannot leave a stale total on a child's record.
CREATE TABLE IF NOT EXISTS courage_marks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(24) NOT NULL DEFAULT 'member',
  score INT NOT NULL,
  prompt VARCHAR(160) DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  markedById VARCHAR(64) NOT NULL,
  markedByName VARCHAR(190) DEFAULT '',
  centre VARCHAR(80) DEFAULT '',
  observedOn VARCHAR(16) NOT NULL,
  createdAt VARCHAR(40) DEFAULT '',
  INDEX idx_courage_subject (subjectId, observedOn),
  INDEX idx_courage_marker (markedById, observedOn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (114) ON DUPLICATE KEY UPDATE version = version;

-- ── 115 · A member belongs to a division (NGGC 2040 brief §5) ───────────────
-- The brief assigns every member to one of four professional divisions, each
-- with a mandate, and the programme had no column for it — so it could not
-- answer "how many members are in Technology & Applied Engineering", could not
-- report per division, and could not see that chess is taken across all four,
-- which is §6's whole point.
--
-- NOT the academy catalogue's `faculty`, and the two must not be merged. A
-- faculty is what a Summer School edition happens to teach this season and an
-- admin edits it; a division is what an NGG member belongs to for years and the
-- brief fixes it. Same shape, different owners, different lifetimes.
--
-- Stored as the id ('arts'|'media'|'tech'|'business'), not the display name, so
-- renaming a division does not rewrite every row. Blank is legitimate: a member
-- nobody has placed yet.
--
-- The backfill from `track` is NOT here. db_apply_mysql_schema() executes only
-- CREATE / ALTER / INSERT, so an UPDATE in this file is read and skipped; it
-- lives in api/_lib/db.php as NGG_BACKFILL_MEMBER_DIVISION and runs from both
-- the SQLite ladder and NGG_MYSQL_ROW_FIXUPS.
ALTER TABLE members ADD COLUMN division VARCHAR(24) DEFAULT '';
CREATE INDEX idx_members_division ON members(division);

INSERT INTO schema_version (version) VALUES (115) ON DUPLICATE KEY UPDATE version = version;

-- ── 116 · The mentor's weekly review (NGGC 2040 brief §18) ──────────────────
-- Twelve questions a mentor should be able to answer for every assigned member,
-- every week. Nothing prompted them and nothing recorded the answers, so a
-- mentor's only trace was a star for today, a V3 for this week and whatever
-- meetings they happened to write up. The brief's point is the CADENCE: a child
-- nobody reviewed for three weeks is the finding, and it was invisible.
--
-- One row per (subjectId, period), like v3_scores — a review is a weekly
-- artefact and a second one for the same week is an edit of the first. That is
-- what makes "who has not been reviewed this week" one query instead of a scan.
--
-- `answers` is JSON keyed by nggc_weekly_review_keys() rather than twelve
-- columns: a thirteenth question would otherwise be a migration and a deploy,
-- and twelve column names would be a second list of the questions, free to
-- drift from domain/formation.php. The keys are validated on the way in.
CREATE TABLE IF NOT EXISTS mentor_reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(24) NOT NULL DEFAULT 'member',
  period VARCHAR(16) NOT NULL,
  answers TEXT,
  answered INT DEFAULT 0,
  concern TINYINT DEFAULT 0,
  mentorId VARCHAR(64) NOT NULL,
  mentorName VARCHAR(190) DEFAULT '',
  centre VARCHAR(80) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_mrev_one (subjectId, period),
  INDEX idx_mrev_period (period, centre),
  INDEX idx_mrev_mentor (mentorId, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (116) ON DUPLICATE KEY UPDATE version = version;

-- ── 117 · Why a member was promoted (NGGC 2040 brief §20) ──────────────────
-- "A member should not become an NGV merely because they have been around for a
-- certain amount of time. Progression should be based on evidence of formation."
--
-- The promotion already existed and is thorough: admin_member_promote_ngv
-- provisions the volunteer record, the ID and the two-way link, idempotently.
-- What it recorded was that a promotion happened and who pressed the button —
-- not why. So the one question §20 cares about, whether a child was promoted on
-- evidence or on tenure, had no answer six months later.
--
-- `evidence` is the promoter's own sentence and the domain requires it.
-- `readiness` is a JSON snapshot of the formation record AS IT STOOD at the
-- moment of promotion — courage index, weeks reviewed out of the last eight,
-- attendance, stars, dues standing. Snapshotted rather than recomputed on read:
-- the question is what they knew when they decided, and a figure recomputed in
-- March answers a different one.
--
-- Append-only. A demotion writes its own row rather than deleting this one.
CREATE TABLE IF NOT EXISTS member_promotions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  memberId VARCHAR(64) NOT NULL,
  fromStage VARCHAR(24) NOT NULL DEFAULT 'NGG',
  toStage VARCHAR(24) NOT NULL DEFAULT 'NGV',
  evidence TEXT NOT NULL DEFAULT '',
  readiness TEXT,
  volunteerId VARCHAR(40) DEFAULT '',
  byId VARCHAR(64) NOT NULL,
  byName VARCHAR(190) DEFAULT '',
  at VARCHAR(40) DEFAULT '',
  INDEX idx_mprom_member (memberId, id),
  INDEX idx_mprom_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (117) ON DUPLICATE KEY UPDATE version = version;

-- ── 118 · Quote of the week ─────────────────────────────────────────────
-- Hausa riddles, Igbo and Yoruba proverbs rotated weekly on the home page.
-- Rows are seeded by api/_lib/domain/wisdom.php on first read.
CREATE TABLE IF NOT EXISTS wisdom_sayings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  wisdomId VARCHAR(40) NOT NULL UNIQUE,
  language VARCHAR(16) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'proverb',
  text TEXT NOT NULL,
  translation TEXT,
  answer TEXT,
  answerTranslation TEXT,
  meaning TEXT,
  position INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'live',
  audioFile VARCHAR(80) DEFAULT '',
  audioSource VARCHAR(16) DEFAULT '',
  voice VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  INDEX idx_wisdom_lang (language, status, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (118) ON DUPLICATE KEY UPDATE version = version;

-- ── 119 · Quote of the week: English clip + TTS retry stamp ──────────────
ALTER TABLE wisdom_sayings ADD COLUMN audioFileEn VARCHAR(80) DEFAULT '';
ALTER TABLE wisdom_sayings ADD COLUMN voiceEn VARCHAR(80) DEFAULT '';
ALTER TABLE wisdom_sayings ADD COLUMN ttsTriedAt VARCHAR(40) DEFAULT '';

INSERT INTO schema_version (version) VALUES (119) ON DUPLICATE KEY UPDATE version = version;

-- ── 120 · Quote of the week: generate-once clip store + listen-back ──────
CREATE TABLE IF NOT EXISTS wisdom_tts_clips (
  cacheKey CHAR(64) PRIMARY KEY,
  file VARCHAR(80) NOT NULL,
  language VARCHAR(16) NOT NULL,
  voice VARCHAR(80) NOT NULL,
  script TEXT NOT NULL,
  score DOUBLE NULL,
  heard TEXT,
  createdAt VARCHAR(40) DEFAULT '',
  INDEX idx_wtts_file (file)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE wisdom_sayings ADD COLUMN spokenText TEXT;
ALTER TABLE wisdom_sayings ADD COLUMN ttsScore DOUBLE NULL;
ALTER TABLE wisdom_sayings ADD COLUMN ttsScoreEn DOUBLE NULL;

-- ── 121 · Member cards: secure MEMQR- cards and printed formats, for the gate ──
CREATE TABLE IF NOT EXISTS member_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'secure',
  code VARCHAR(120) NOT NULL,
  format VARCHAR(40) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  source VARCHAR(24) DEFAULT '',
  issuedBy VARCHAR(64) DEFAULT '',
  issuedAt VARCHAR(40) DEFAULT '',
  voidedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY uq_member_cards_code (kind, format, code),
  INDEX idx_member_cards_member (memberId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (121) ON DUPLICATE KEY UPDATE version = version;

-- ── 122 · Printed IDs are claimed: one record per id, by primary key ──
CREATE TABLE IF NOT EXISTS member_display_ids (
  displayKey VARCHAR(48) NOT NULL PRIMARY KEY,
  displayId VARCHAR(48) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  claimedAt VARCHAR(40) DEFAULT '',
  INDEX idx_mdi_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO member_display_ids (displayKey, displayId, memberId, claimedAt)
  SELECT UPPER(TRIM(displayId)), TRIM(displayId), memberId, COALESCE(createdAt, '')
    FROM members WHERE TRIM(COALESCE(displayId, '')) <> '' AND COALESCE(type, 'NGG') <> 'Summer'
   ORDER BY id;
ALTER TABLE applications ADD COLUMN importKey VARCHAR(80) DEFAULT '';
CREATE INDEX idx_apps_importkey ON applications (importKey);

INSERT INTO schema_version (version) VALUES (122) ON DUPLICATE KEY UPDATE version = version;

-- 123: approvals for a club admin's sensitive actions; volunteers' programme
CREATE TABLE IF NOT EXISTS admin_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  approvalId VARCHAR(40) NOT NULL UNIQUE,
  op VARCHAR(80) NOT NULL,
  args MEDIUMTEXT NOT NULL DEFAULT '',
  summary VARCHAR(500) NOT NULL DEFAULT '',
  requesterId VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  decidedBy VARCHAR(64) DEFAULT '',
  decidedAt VARCHAR(40) DEFAULT '',
  reason VARCHAR(500) DEFAULT '',
  result MEDIUMTEXT,
  createdAt VARCHAR(40) DEFAULT '',
  INDEX idx_appr_status (status, id),
  INDEX idx_appr_requester (requesterId, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE volunteers ADD COLUMN programme VARCHAR(16) DEFAULT 'summer';
ALTER TABLE applications ADD COLUMN programme VARCHAR(16) DEFAULT '';

INSERT INTO schema_version (version) VALUES (123) ON DUPLICATE KEY UPDATE version = version;

-- 124: a centre's Summer School venue, when it is not where the Club meets.
ALTER TABLE centres ADD COLUMN summerAddress VARCHAR(240) DEFAULT '';
ALTER TABLE centres ADD COLUMN summerArea VARCHAR(120) DEFAULT '';
ALTER TABLE centres ADD COLUMN summerLat DOUBLE NULL;
ALTER TABLE centres ADD COLUMN summerLng DOUBLE NULL;


-- 125: the NGG Club curriculum.
CREATE TABLE IF NOT EXISTS curriculum_units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unitId VARCHAR(40) NOT NULL UNIQUE,
  course VARCHAR(120) NOT NULL DEFAULT '',
  level VARCHAR(60) NOT NULL DEFAULT '',
  week INT NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 1,
  title VARCHAR(200) NOT NULL DEFAULT '',
  summary TEXT,
  objectives TEXT,
  body MEDIUMTEXT,
  durationMins INT DEFAULT 0,
  passMark INT DEFAULT 60,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  source VARCHAR(16) DEFAULT 'manual',
  createdBy VARCHAR(40) DEFAULT '', updatedBy VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '', updatedAt VARCHAR(32) DEFAULT '', publishedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_cunit_key (course, level, week, position),
  KEY idx_cunit_status (status, course)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS curriculum_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  materialId VARCHAR(40) NOT NULL UNIQUE,
  unitId VARCHAR(40) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'link',
  title VARCHAR(200) DEFAULT '',
  url VARCHAR(1000) NOT NULL DEFAULT '',
  position INT DEFAULT 1,
  createdAt VARCHAR(32) DEFAULT '',
  KEY idx_cmat_unit (unitId, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS curriculum_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  checkId VARCHAR(40) NOT NULL UNIQUE,
  unitId VARCHAR(40) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'mcq',
  prompt TEXT,
  options TEXT,
  answer TEXT,
  rubric TEXT,
  points INT DEFAULT 1,
  position INT DEFAULT 1,
  source VARCHAR(16) DEFAULT 'manual',
  videoUrl TEXT,
  KEY idx_ccheck_unit (unitId, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS curriculum_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unitId VARCHAR(40) NOT NULL,
  memberId VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'started',
  unitVersion INT DEFAULT 1,
  score DOUBLE DEFAULT 0,
  maxScore DOUBLE DEFAULT 0,
  bestPct INT DEFAULT 0,
  attempts INT DEFAULT 0,
  answers MEDIUMTEXT,
  marks TEXT,
  feedback TEXT,
  pending TINYINT DEFAULT 0,
  markedBy VARCHAR(40) DEFAULT '',
  startedAt VARCHAR(32) DEFAULT '', completedAt VARCHAR(32) DEFAULT '', updatedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_cprog_key (unitId, memberId),
  KEY idx_cprog_member (memberId),
  KEY idx_cprog_pending (pending, unitId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (125) ON DUPLICATE KEY UPDATE version = version;

-- 126: materials instructors submit wait for approval; members see only approved.
ALTER TABLE curriculum_materials
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'approved',
  ADD COLUMN note TEXT,
  ADD COLUMN submittedBy VARCHAR(64) DEFAULT '',
  ADD COLUMN reviewedBy VARCHAR(64) DEFAULT '',
  ADD COLUMN reviewedAt VARCHAR(40) DEFAULT '',
  ADD COLUMN reviewNote TEXT,
  ADD KEY idx_cmat_status (status, unitId);

INSERT INTO schema_version (version) VALUES (126) ON DUPLICATE KEY UPDATE version = version;

-- 127: the companion's weekly assessment of each NGG member.
CREATE TABLE IF NOT EXISTS member_assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  period VARCHAR(10) NOT NULL,
  rating VARCHAR(16) NOT NULL DEFAULT 'on_track',
  reasons TEXT,
  metrics TEXT,
  summary TEXT,
  strengths TEXT,
  focus TEXT,
  source VARCHAR(16) DEFAULT 'rules',
  mailedAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_massess_key (memberId, period),
  KEY idx_massess_period (period, rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (127) ON DUPLICATE KEY UPDATE version = version;

-- 128: family accounts — a parent's or guardian's own sign-in and their wards.
CREATE TABLE IF NOT EXISTS guardians (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guardianId VARCHAR(32) NOT NULL,
  email VARCHAR(190) NOT NULL,
  fullName VARCHAR(160) DEFAULT '',
  phone VARCHAR(40) DEFAULT '',
  status VARCHAR(16) DEFAULT 'active',
  sessionEpoch INT DEFAULT 1,
  weeklySentFor VARCHAR(10) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  lastSeenAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_guardians_gid (guardianId),
  UNIQUE KEY idx_guardians_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS guardian_wards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  linkId VARCHAR(32) NOT NULL,
  guardianId VARCHAR(32) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  relationship VARCHAR(16) DEFAULT 'parent',
  status VARCHAR(16) DEFAULT 'active',
  via VARCHAR(16) DEFAULT '',
  notify VARCHAR(255) DEFAULT '',
  note TEXT,
  decidedBy VARCHAR(64) DEFAULT '',
  decidedAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_gwards_link (linkId),
  KEY idx_gwards_guardian (guardianId, status),
  KEY idx_gwards_member (memberId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE member_requests ADD COLUMN raisedBy VARCHAR(64) DEFAULT '';

INSERT INTO schema_version (version) VALUES (128) ON DUPLICATE KEY UPDATE version = version;

-- 129: the timetable — which course meets when, where and with whom, per centre.
CREATE TABLE IF NOT EXISTS timetable_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slotId VARCHAR(32) NOT NULL,
  centreId VARCHAR(64) NOT NULL,
  course VARCHAR(120) NOT NULL,
  level VARCHAR(60) DEFAULT '',
  weekday TINYINT NOT NULL,
  startTime VARCHAR(5) NOT NULL,
  endTime VARCHAR(5) NOT NULL,
  room VARCHAR(80) DEFAULT '',
  instructorId VARCHAR(64) DEFAULT '',
  note VARCHAR(400) DEFAULT '',
  status VARCHAR(16) DEFAULT 'active',
  createdAt VARCHAR(40) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '',
  updatedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY idx_tt_slot (slotId),
  KEY idx_tt_centre (centreId, weekday, status),
  KEY idx_tt_instructor (instructorId, weekday, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (129) ON DUPLICATE KEY UPDATE version = version;

-- 130: which programmes run at a centre ('ngg', 'summer', or both).
ALTER TABLE centres ADD COLUMN programmes VARCHAR(32) DEFAULT 'ngg,summer';

INSERT INTO schema_version (version) VALUES (130) ON DUPLICATE KEY UPDATE version = version;

-- 131: personal timetables (the public Timetable Maker).
CREATE TABLE IF NOT EXISTS member_timetables (
  memberId VARCHAR(64) NOT NULL PRIMARY KEY,
  doc MEDIUMTEXT NOT NULL,
  updatedAt VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS timetable_links (
  tokenHash CHAR(64) NOT NULL PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  doc MEDIUMTEXT NOT NULL,
  createdAt VARCHAR(32) NOT NULL,
  updatedAt VARCHAR(32) NOT NULL,
  expiresAt VARCHAR(32) NOT NULL,
  revokedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_timetable_links_email (email, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (131) ON DUPLICATE KEY UPDATE version = version;

-- 132 · ID Card Studio: the reprint queue and single-person photo asks.
CREATE TABLE IF NOT EXISTS id_reprints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  why VARCHAR(80) NOT NULL DEFAULT '',
  requestedBy VARCHAR(64) NOT NULL DEFAULT '',
  requestedAt VARCHAR(32) NOT NULL,
  doneRunId VARCHAR(40) NOT NULL DEFAULT '',
  doneAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_id_reprints_subject (subjectType, subjectId, doneAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS id_photo_asks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  askedBy VARCHAR(64) NOT NULL DEFAULT '',
  askedAt VARCHAR(32) NOT NULL,
  sent TINYINT NOT NULL DEFAULT 0,
  KEY idx_id_photo_asks_subject (subjectType, subjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (132) ON DUPLICATE KEY UPDATE version = version;

-- 133 · ID Card Studio: the design each card type prints with, and which channels a photo ask reached.
CREATE TABLE IF NOT EXISTS id_designs (
  kind VARCHAR(16) PRIMARY KEY,
  templateId VARCHAR(64) NOT NULL DEFAULT '',
  setBy VARCHAR(64) NOT NULL DEFAULT '',
  setAt VARCHAR(32) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE id_photo_asks ADD COLUMN channels VARCHAR(255) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (133) ON DUPLICATE KEY UPDATE version = version;

-- 134 · Replies to contact messages, sent from the Control Room inbox and kept on the record.
CREATE TABLE IF NOT EXISTS contact_replies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  messageId INT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sentBy VARCHAR(64) NOT NULL DEFAULT '',
  sentByName VARCHAR(255) NOT NULL DEFAULT '',
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  channel VARCHAR(16) NOT NULL DEFAULT 'email',
  INDEX idx_contact_replies_msg (messageId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_contact_email ON contact_messages (email);

INSERT INTO schema_version (version) VALUES (134) ON DUPLICATE KEY UPDATE version = version;

-- 135 · Paying to join: one invoice per accepted NGG applicant, and offline payments held as claims until verified against evidence.
CREATE TABLE IF NOT EXISTS membership_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoiceId VARCHAR(40) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL,
  applicationId INT NOT NULL DEFAULT 0,
  payToken VARCHAR(64) NOT NULL UNIQUE,
  items TEXT NOT NULL DEFAULT '[]',
  total INT NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  startDate VARCHAR(16) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  paystackRef VARCHAR(64) NOT NULL DEFAULT '',
  paidVia VARCHAR(16) NOT NULL DEFAULT '',
  paidAt VARCHAR(32) NOT NULL DEFAULT '',
  receiptNo VARCHAR(40) NOT NULL DEFAULT '',
  receiptToken VARCHAR(64) NOT NULL DEFAULT '',
  sentTo VARCHAR(255) NOT NULL DEFAULT '',
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  createdBy VARCHAR(64) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  voidReason VARCHAR(255) NOT NULL DEFAULT '',
  INDEX idx_minv_member (memberId),
  INDEX idx_minv_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS offline_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paymentId VARCHAR(40) NOT NULL UNIQUE,
  invoiceId VARCHAR(40) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  method VARCHAR(16) NOT NULL DEFAULT '',
  payerName VARCHAR(160) NOT NULL DEFAULT '',
  bankName VARCHAR(120) NOT NULL DEFAULT '',
  reference VARCHAR(120) NOT NULL DEFAULT '',
  referenceKey VARCHAR(120) NOT NULL DEFAULT '',
  paidOn VARCHAR(16) NOT NULL DEFAULT '',
  evidenceSha256 CHAR(64) NOT NULL UNIQUE,
  evidenceFile VARCHAR(255) NOT NULL DEFAULT '',
  evidenceType VARCHAR(40) NOT NULL DEFAULT '',
  evidenceBytes INT NOT NULL DEFAULT 0,
  note VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  recordedBy VARCHAR(64) NOT NULL DEFAULT '',
  recordedAt VARCHAR(32) NOT NULL DEFAULT '',
  verifiedBy VARCHAR(64) NOT NULL DEFAULT '',
  verifiedAt VARCHAR(32) NOT NULL DEFAULT '',
  rejectReason VARCHAR(500) NOT NULL DEFAULT '',
  INDEX idx_offpay_invoice (invoiceId),
  INDEX idx_offpay_ref (referenceKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (135) ON DUPLICATE KEY UPDATE version = version;

-- 136: the money rules held by the database (MySQL has no partial index, so a
-- generated column carries the value only while the rule applies — NULLs do
-- not collide), and the measured framing of each photograph.
ALTER TABLE membership_invoices ADD COLUMN receiptKey VARCHAR(40) AS (NULLIF(receiptNo, '')) STORED, ADD UNIQUE INDEX uq_minv_receipt (receiptKey);
ALTER TABLE offline_payments ADD COLUMN liveRefKey VARCHAR(120) AS (IF(status <> 'rejected', referenceKey, NULL)) STORED, ADD UNIQUE INDEX uq_offpay_live_ref (liveRefKey);
ALTER TABLE offline_payments ADD COLUMN pendingInvoice VARCHAR(40) AS (IF(status = 'pending', invoiceId, NULL)) STORED, ADD UNIQUE INDEX uq_offpay_one_pending (pendingInvoice);
CREATE TABLE IF NOT EXISTS photo_framing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  urlKey CHAR(40) NOT NULL UNIQUE,
  url VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'none',
  geomJson TEXT NOT NULL DEFAULT '',
  adjustJson TEXT NOT NULL DEFAULT '',
  model VARCHAR(80) NOT NULL DEFAULT '',
  error VARCHAR(80) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedBy VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (136) ON DUPLICATE KEY UPDATE version = version;

-- 137: Mentorship — Anchor Pods, phases, the choice of two, cadence, rules
-- R1–R8, interventions, safeguarding, the Mentor Academy and the NGGC
-- Mentorship Commitment & Conduct Policy (domain/mentorship-pods.php).
CREATE TABLE IF NOT EXISTS mentor_matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(191) NOT NULL UNIQUE,
  memberId VARCHAR(191) NOT NULL,
  mentorId VARCHAR(191) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  track VARCHAR(191) NOT NULL DEFAULT '',
  phase VARCHAR(191) NOT NULL DEFAULT 'match',
  status VARCHAR(191) NOT NULL DEFAULT 'offered',
  offeredAt VARCHAR(191) NOT NULL DEFAULT '',
  startedAt VARCHAR(191) NOT NULL DEFAULT '',
  chosenBy VARCHAR(191) NOT NULL DEFAULT '',
  agreementJson TEXT NULL,
  closingAt VARCHAR(191) NOT NULL DEFAULT '',
  closedAt VARCHAR(191) NOT NULL DEFAULT '',
  closeReason TEXT NULL,
  createdBy VARCHAR(191) NOT NULL DEFAULT '',
  updatedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mmatch_member ON mentor_matches(memberId, status);
CREATE INDEX idx_mmatch_mentor ON mentor_matches(mentorId, status);
CREATE TABLE IF NOT EXISTS mentor_match_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(191) NOT NULL,
  mentorId VARCHAR(191) NOT NULL,
  rank INT NOT NULL DEFAULT 1,
  fit INT NOT NULL DEFAULT 0,
  why TEXT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'open'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_moffer ON mentor_match_offers(matchId, mentorId);
CREATE TABLE IF NOT EXISTS mentor_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(191) NOT NULL DEFAULT '',
  memberId VARCHAR(191) NOT NULL DEFAULT '',
  mentorId VARCHAR(191) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  kind VARCHAR(191) NOT NULL,
  owner VARCHAR(191) NOT NULL DEFAULT 'mentor',
  dueOn VARCHAR(191) NOT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'open',
  doneAt VARCHAR(191) NOT NULL DEFAULT '',
  doneBy VARCHAR(191) NOT NULL DEFAULT '',
  note TEXT NULL,
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mtask_mentor ON mentor_tasks(mentorId, status, dueOn);
CREATE INDEX idx_mtask_match ON mentor_tasks(matchId, kind, status);
CREATE TABLE IF NOT EXISTS mentor_nudges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nudgeKey VARCHAR(191) NOT NULL UNIQUE,
  rule VARCHAR(191) NOT NULL,
  audience VARCHAR(191) NOT NULL,
  mentorId VARCHAR(191) NOT NULL DEFAULT '',
  memberId VARCHAR(191) NOT NULL DEFAULT '',
  matchId VARCHAR(191) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  title VARCHAR(191) NOT NULL DEFAULT '',
  body TEXT NULL,
  suggestion TEXT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'open',
  createdAt VARCHAR(191) NOT NULL DEFAULT '',
  resolvedAt VARCHAR(191) NOT NULL DEFAULT '',
  resolvedBy VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mnudge_open ON mentor_nudges(status, audience, centre);
CREATE TABLE IF NOT EXISTS mentor_interventions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(191) NOT NULL DEFAULT '',
  memberId VARCHAR(191) NOT NULL DEFAULT '',
  mentorId VARCHAR(191) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  rule VARCHAR(191) NOT NULL DEFAULT '',
  reason TEXT NULL,
  plan TEXT NULL,
  ownerId VARCHAR(191) NOT NULL DEFAULT '',
  ownerName VARCHAR(191) NOT NULL DEFAULT '',
  reviewOn VARCHAR(191) NOT NULL DEFAULT '',
  status VARCHAR(191) NOT NULL DEFAULT 'open',
  outcome TEXT NULL,
  createdBy VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT '',
  closedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_miv_open ON mentor_interventions(status, centre);
CREATE TABLE IF NOT EXISTS mentor_relationship_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matchId VARCHAR(191) NOT NULL,
  respondent VARCHAR(191) NOT NULL,
  term VARCHAR(191) NOT NULL,
  q1 INT NOT NULL,
  q2 INT NOT NULL,
  q3 INT NOT NULL,
  q4 INT NOT NULL,
  avg DOUBLE NOT NULL,
  note TEXT NULL,
  byId VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mrelchk ON mentor_relationship_checks(matchId, respondent, term);
CREATE TABLE IF NOT EXISTS mentor_observations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(191) NOT NULL,
  mentorId VARCHAR(191) NOT NULL,
  matchId VARCHAR(191) NOT NULL DEFAULT '',
  onDate VARCHAR(191) NOT NULL,
  indicator VARCHAR(191) NOT NULL,
  level INT NOT NULL DEFAULT 0,
  evidence TEXT NULL,
  strength TEXT NULL,
  growth TEXT NULL,
  nextChallenge TEXT NULL,
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mobs ON mentor_observations(memberId, onDate, indicator);
CREATE TABLE IF NOT EXISTS mentor_academy (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(191) NOT NULL,
  moduleId VARCHAR(191) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  passedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_macad ON mentor_academy(mentorId, moduleId);
CREATE TABLE IF NOT EXISTS mentor_policy (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(191) NOT NULL,
  policyVersion VARCHAR(191) NOT NULL,
  signedName VARCHAR(191) NOT NULL DEFAULT '',
  acceptedAt VARCHAR(191) NOT NULL DEFAULT '',
  ip VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mpolicy ON mentor_policy(mentorId, policyVersion);
CREATE TABLE IF NOT EXISTS mentor_obligations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(191) NOT NULL,
  kind VARCHAR(191) NOT NULL,
  onDate VARCHAR(191) NOT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'present',
  note TEXT NULL,
  recordedBy VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mobl ON mentor_obligations(mentorId, kind, onDate);
CREATE TABLE IF NOT EXISTS mentor_checkins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(191) NOT NULL,
  weekOf VARCHAR(191) NOT NULL,
  feeling VARCHAR(191) NOT NULL DEFAULT '',
  wins TEXT NULL,
  hard TEXT NULL,
  needSupport INT NOT NULL DEFAULT 0,
  createdAt VARCHAR(191) NOT NULL DEFAULT '',
  followedUpAt VARCHAR(191) NOT NULL DEFAULT '',
  followedUpBy VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mchk_mentor ON mentor_checkins(mentorId, weekOf);
CREATE TABLE IF NOT EXISTS safeguarding_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caseNo VARCHAR(191) NOT NULL UNIQUE,
  reporterId VARCHAR(191) NOT NULL,
  reporterName VARCHAR(191) NOT NULL DEFAULT '',
  subjectId VARCHAR(191) NOT NULL DEFAULT '',
  subjectName VARCHAR(191) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  category VARCHAR(191) NOT NULL DEFAULT '',
  body TEXT NULL,
  officerId VARCHAR(191) NOT NULL DEFAULT '',
  officerName VARCHAR(191) NOT NULL DEFAULT '',
  status VARCHAR(191) NOT NULL DEFAULT 'received',
  createdAt VARCHAR(191) NOT NULL DEFAULT '',
  updatedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_sgcase_centre ON safeguarding_cases(centre, status);
CREATE TABLE IF NOT EXISTS safeguarding_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caseNo VARCHAR(191) NOT NULL,
  byId VARCHAR(191) NOT NULL DEFAULT '',
  byName VARCHAR(191) NOT NULL DEFAULT '',
  note TEXT NULL,
  status VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mentee_profiles (
  memberId VARCHAR(64) NOT NULL PRIMARY KEY,
  interests TEXT NULL,
  wantsTo TEXT NULL,
  supportArea TEXT NULL,
  availability TEXT NULL,
  style TEXT NULL,
  updatedAt VARCHAR(191) NOT NULL DEFAULT '',
  updatedBy VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE mentors ADD COLUMN leavingAt VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE mentors ADD COLUMN leavingNote TEXT NULL;
ALTER TABLE mentors ADD COLUMN cimcAt VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE mentors ADD COLUMN anthemAt VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE mentor_reviews ADD COLUMN trend VARCHAR(64) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (137) ON DUPLICATE KEY UPDATE version = version;

-- 138: The Mentor Portal — WOOP goals and check-ins, session length, the NGG
-- Leadership Index (monthly scorecards), relationship checks by side and cycle,
-- Saturday (agenda, register, weekly review), messages, member check-ins,
-- supervision, retreats, the jobs' run log; mentor concerns join
-- community_safeguarding (domain/mentor-portal.php).
ALTER TABLE mentor_meetings ADD COLUMN minutes INT NOT NULL DEFAULT 0;
ALTER TABLE mentor_meetings ADD COLUMN goalId INT NOT NULL DEFAULT 0;
ALTER TABLE mentor_meetings ADD COLUMN sharedWithLead INT NOT NULL DEFAULT 0;
ALTER TABLE mentor_goals ADD COLUMN area VARCHAR(24) NOT NULL DEFAULT 'Character';
ALTER TABLE mentor_goals ADD COLUMN outcome TEXT NULL;
ALTER TABLE mentor_goals ADD COLUMN obstacle TEXT NULL;
ALTER TABLE mentor_goals ADD COLUMN plan TEXT NULL;
ALTER TABLE mentor_goals ADD COLUMN agreed INT NOT NULL DEFAULT 0;
ALTER TABLE mentor_goals ADD COLUMN reviewBy VARCHAR(191) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS mentor_goal_checkins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  goalId INT NOT NULL,
  subjectId VARCHAR(191) NOT NULL,
  progress INT NOT NULL,
  note TEXT NULL,
  byKind VARCHAR(191) NOT NULL DEFAULT 'mentor',
  byId VARCHAR(191) NOT NULL DEFAULT '',
  sessionId INT NOT NULL DEFAULT 0,
  checkedOn VARCHAR(191) NOT NULL,
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mgc_goal ON mentor_goal_checkins(goalId, checkedOn);
CREATE TABLE IF NOT EXISTS mentor_scorecards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectId VARCHAR(191) NOT NULL,
  month VARCHAR(191) NOT NULL,
  scores TEXT NULL,
  total INT NOT NULL,
  byKind VARCHAR(191) NOT NULL DEFAULT 'mentor',
  mentorId VARCHAR(191) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  locked INT NOT NULL DEFAULT 0,
  createdAt VARCHAR(191) NOT NULL DEFAULT '',
  updatedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_msc_one ON mentor_scorecards(subjectId, month, byKind);
CREATE INDEX idx_msc_centre ON mentor_scorecards(centre, month);
CREATE TABLE IF NOT EXISTS mentor_rel_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectId VARCHAR(191) NOT NULL,
  side VARCHAR(191) NOT NULL,
  answers TEXT NULL,
  score INT NOT NULL,
  cycle VARCHAR(191) NOT NULL,
  byId VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mrc_one ON mentor_rel_checks(subjectId, side, cycle);
ALTER TABLE mentor_reviews ADD COLUMN effort VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE mentor_reviews ADD COLUMN characterLevel VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE mentor_reviews ADD COLUMN wellbeing VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE mentor_reviews ADD COLUMN line TEXT NULL;
CREATE TABLE IF NOT EXISTS mentor_saturdays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(191) NOT NULL,
  onDate VARCHAR(191) NOT NULL,
  agendaJson TEXT NULL,
  oneToOnesJson TEXT NULL,
  registerClosedAt VARCHAR(191) NOT NULL DEFAULT '',
  sharedAt VARCHAR(191) NOT NULL DEFAULT '',
  updatedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_msat_one ON mentor_saturdays(mentorId, onDate);
CREATE TABLE IF NOT EXISTS mentor_register (
  id INT AUTO_INCREMENT PRIMARY KEY,
  onDate VARCHAR(191) NOT NULL,
  subjectId VARCHAR(191) NOT NULL,
  mentorId VARCHAR(191) NOT NULL,
  here INT NOT NULL DEFAULT 0,
  observed TEXT NULL,
  updatedAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mreg_one ON mentor_register(onDate, subjectId);
CREATE TABLE IF NOT EXISTS mentor_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  threadId VARCHAR(191) NOT NULL,
  kind VARCHAR(191) NOT NULL,
  subjectId VARCHAR(191) NOT NULL DEFAULT '',
  fromId VARCHAR(191) NOT NULL DEFAULT '',
  fromName VARCHAR(191) NOT NULL DEFAULT '',
  toId VARCHAR(191) NOT NULL DEFAULT '',
  channel VARCHAR(191) NOT NULL DEFAULT 'portal',
  body TEXT NULL,
  status VARCHAR(191) NOT NULL DEFAULT 'sent',
  sendAfter VARCHAR(191) NOT NULL DEFAULT '',
  readAt VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mmsg_to ON mentor_messages(toId, readAt);
CREATE INDEX idx_mmsg_thread ON mentor_messages(threadId, createdAt);
CREATE TABLE IF NOT EXISTS member_checkins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(191) NOT NULL,
  week VARCHAR(191) NOT NULL,
  wellbeing VARCHAR(191) NOT NULL,
  sleep INT NOT NULL DEFAULT 0,
  stress INT NOT NULL DEFAULT 0,
  energy INT NOT NULL DEFAULT 0,
  note TEXT NULL,
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mchkin_one ON member_checkins(memberId, week);
CREATE TABLE IF NOT EXISTS mentor_supervision (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(191) NOT NULL,
  leadId VARCHAR(191) NOT NULL DEFAULT '',
  onDate VARCHAR(191) NOT NULL DEFAULT '',
  prepJson TEXT NULL,
  agreedJson TEXT NULL,
  feedback TEXT NULL,
  feedbackAt VARCHAR(191) NOT NULL DEFAULT '',
  status VARCHAR(191) NOT NULL DEFAULT 'booked',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_msup_mentor ON mentor_supervision(mentorId, onDate);
CREATE TABLE IF NOT EXISTS mentor_retreats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  retreatId VARCHAR(191) NOT NULL UNIQUE,
  title VARCHAR(191) NOT NULL DEFAULT '',
  onDate VARCHAR(191) NOT NULL,
  place VARCHAR(191) NOT NULL DEFAULT '',
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mentor_retreat_bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  retreatId VARCHAR(191) NOT NULL,
  mentorId VARCHAR(191) NOT NULL,
  createdAt VARCHAR(191) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE UNIQUE INDEX uq_mrb_one ON mentor_retreat_bookings(retreatId, mentorId);
CREATE TABLE IF NOT EXISTS mentor_job_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job VARCHAR(191) NOT NULL,
  ranAt VARCHAR(191) NOT NULL,
  found INT NOT NULL DEFAULT 0,
  detail TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_mjl_job ON mentor_job_log(job, ranAt);
ALTER TABLE mentors ADD COLUMN kind VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE mentors ADD COLUMN leadId VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN subjectId VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN subjectName VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN category VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN centre VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN officerId VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN officerName VARCHAR(191) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (138) ON DUPLICATE KEY UPDATE version = version;

-- 139: the Academy recorded by hand (mentors.academyClearedAt / academyClearedBy).
ALTER TABLE mentors ADD COLUMN academyClearedAt VARCHAR(40) DEFAULT '';
ALTER TABLE mentors ADD COLUMN academyClearedBy VARCHAR(64) DEFAULT '';
INSERT INTO schema_version (version) VALUES (139) ON DUPLICATE KEY UPDATE version = version;

-- 140: card snapshots, idempotent run logs, reprint causes.
ALTER TABLE card_issues ADD COLUMN photoUrl VARCHAR(512) DEFAULT '';
ALTER TABLE card_issues ADD COLUMN fullName VARCHAR(160) DEFAULT '';
ALTER TABLE card_issues ADD COLUMN secureCode VARCHAR(64) DEFAULT '';
ALTER TABLE card_issues ADD COLUMN faceSig VARCHAR(64) DEFAULT '';
ALTER TABLE card_runs ADD COLUMN clientToken VARCHAR(64) DEFAULT '';
CREATE INDEX idx_crun_token ON card_runs(clientToken);
ALTER TABLE id_reprints ADD COLUMN cause VARCHAR(16) DEFAULT '';
INSERT INTO schema_version (version) VALUES (140) ON DUPLICATE KEY UPDATE version = version;

-- 141: Club application v2026.10 — every answer kept as JSON; the policy version a consent was given against.
ALTER TABLE applications ADD COLUMN details MEDIUMTEXT;
ALTER TABLE applications ADD COLUMN updatedAt VARCHAR(32) DEFAULT '';
CREATE INDEX idx_apps_email_dob ON applications(email, dob);
ALTER TABLE consents ADD COLUMN policyVersion VARCHAR(16) DEFAULT '';
INSERT INTO schema_version (version) VALUES (141) ON DUPLICATE KEY UPDATE version = version;

-- 142: Schools for the Club application — GRID3 Nigeria open data (Lagos, Ogun), loaded once from api/_lib/seeds; families' schools added on acceptance.
CREATE TABLE IF NOT EXISTS schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL, nameKey VARCHAR(200) NOT NULL,
  lga VARCHAR(80) DEFAULT '', state VARCHAR(40) DEFAULT '', ward VARCHAR(80) DEFAULT '',
  level VARCHAR(4) DEFAULT '', management VARCHAR(4) DEFAULT '',
  lat DOUBLE NULL, lng DOUBLE NULL,
  source VARCHAR(16) DEFAULT 'grid3', addedAt VARCHAR(40) DEFAULT '',
  INDEX idx_schools_key (nameKey), INDEX idx_schools_place (state, lga)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (142) ON DUPLICATE KEY UPDATE version = version;

-- ---------------------------------------------------------------------------
-- Reconcile: columns the SQLite ladder adds with ALTER that this mirror only
-- ever declared inside a CREATE TABLE. CREATE TABLE IF NOT EXISTS skips a
-- table that already exists, so a database created before the column was
-- added never got it — "Unknown column 'duesRemindOff'" on a live host. Each
-- ALTER is a no-op where the column exists (1060, ignored by the replay).
-- api/tests/run.php fails if a migration's ALTER has no mirror here again.
-- ---------------------------------------------------------------------------
ALTER TABLE applications ADD COLUMN courses TEXT;
ALTER TABLE applications ADD COLUMN dob VARCHAR(40) DEFAULT '';
ALTER TABLE applications ADD COLUMN firstName VARCHAR(80) DEFAULT '';
ALTER TABLE applications ADD COLUMN lastName VARCHAR(80) DEFAULT '';
ALTER TABLE applications ADD COLUMN otherName VARCHAR(80) DEFAULT '';
ALTER TABLE applications ADD COLUMN phone VARCHAR(24) DEFAULT '';
ALTER TABLE applications ADD COLUMN photoUrl VARCHAR(512) DEFAULT '';
ALTER TABLE applications ADD COLUMN program VARCHAR(16) DEFAULT '';
ALTER TABLE assessment_instruments ADD COLUMN adaptNote TEXT;
ALTER TABLE assessment_instruments ADD COLUMN catalogueKey VARCHAR(64) DEFAULT '';
ALTER TABLE assessment_instruments ADD COLUMN citation TEXT;
ALTER TABLE assessment_instruments ADD COLUMN higherIsBetter TINYINT DEFAULT 1;
ALTER TABLE assessment_instruments ADD COLUMN licence VARCHAR(255) DEFAULT '';
ALTER TABLE assessment_instruments ADD COLUMN scale VARCHAR(16) DEFAULT 'points';
ALTER TABLE assessment_instruments ADD COLUMN source VARCHAR(255) DEFAULT '';
ALTER TABLE assessment_instruments ADD COLUMN sourceUrl VARCHAR(255) DEFAULT '';
ALTER TABLE assessment_instruments ADD COLUMN unit VARCHAR(64) DEFAULT '';
ALTER TABLE auth_sessions ADD COLUMN purpose VARCHAR(16) DEFAULT 'login';
ALTER TABLE curriculum_materials ADD COLUMN note TEXT;
ALTER TABLE curriculum_materials ADD COLUMN reviewNote TEXT;
ALTER TABLE curriculum_materials ADD COLUMN reviewedAt TEXT;
ALTER TABLE curriculum_materials ADD COLUMN reviewedBy TEXT;
ALTER TABLE curriculum_materials ADD COLUMN submittedBy TEXT;
ALTER TABLE members ADD COLUMN anchorCode VARCHAR(12);
ALTER TABLE members ADD COLUMN duesRemindOff TINYINT DEFAULT 0;
ALTER TABLE members ADD COLUMN duesRemindedAt VARCHAR(40) DEFAULT '';
ALTER TABLE members ADD COLUMN mouAt VARCHAR(40) DEFAULT '';
ALTER TABLE members ADD COLUMN mouBy VARCHAR(64) DEFAULT '';
ALTER TABLE members ADD COLUMN passwordHash VARCHAR(255) DEFAULT '';
ALTER TABLE mentors ADD COLUMN afrovanguardRef VARCHAR(255) DEFAULT '';
ALTER TABLE mentors ADD COLUMN linkedin VARCHAR(255) DEFAULT '';
ALTER TABLE mentors ADD COLUMN program VARCHAR(64) DEFAULT '';
ALTER TABLE mentors ADD COLUMN skills TEXT;
ALTER TABLE mentors ADD COLUMN source VARCHAR(24) DEFAULT 'ngg';
ALTER TABLE summer_students ADD COLUMN archivedAt VARCHAR(40);
ALTER TABLE summer_students ADD COLUMN attendanceRate INT;
ALTER TABLE summer_students ADD COLUMN daysPresent INT;
ALTER TABLE summer_students ADD COLUMN firstSeen VARCHAR(12);
ALTER TABLE summer_students ADD COLUMN lastSeen VARCHAR(12);
ALTER TABLE volunteers ADD COLUMN dob VARCHAR(40) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN firstName VARCHAR(80) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN lastName VARCHAR(80) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN otherName VARCHAR(80) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN safeguarding VARCHAR(16) DEFAULT 'pending';
CREATE UNIQUE INDEX idx_members_anchorcode ON members(anchorCode);

-- 143: the member record drive — answers a member row has no column for (sex, class, address, LGA, state), as JSON.
ALTER TABLE members ADD COLUMN profileJson MEDIUMTEXT;
INSERT INTO schema_version (version) VALUES (143) ON DUPLICATE KEY UPDATE version = version;

-- 144: School results and the growth plan (domain/school-results.php); skill-mark evidence.
CREATE TABLE IF NOT EXISTS results_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uploadId VARCHAR(40) NOT NULL, memberId VARCHAR(64) NOT NULL, term VARCHAR(16) NOT NULL,
  fileUrl VARCHAR(600) DEFAULT '', fileMime VARCHAR(80) DEFAULT '', fileBytes INT DEFAULT 0,
  status VARCHAR(12) DEFAULT 'draft', ocrJson MEDIUMTEXT, ocrBy VARCHAR(40) DEFAULT '',
  confirmedAt VARCHAR(40) DEFAULT '', sentAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '', updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_ru_upload (uploadId), UNIQUE KEY idx_ru_one (memberId, term)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS results_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uploadId VARCHAR(40) NOT NULL, subject VARCHAR(60) NOT NULL, score INT NULL,
  ocrScore INT NULL, confidence DOUBLE NULL, lastScore INT NULL, position INT DEFAULT 0,
  INDEX idx_rs_upload (uploadId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS growth_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  planId VARCHAR(40) NOT NULL, uploadId VARCHAR(40) NOT NULL, memberId VARCHAR(64) NOT NULL, term VARCHAR(16) NOT NULL,
  summary TEXT, flagsJson TEXT, habit VARCHAR(240) DEFAULT '',
  aiModel VARCHAR(80) DEFAULT '', aiPromptVersion VARCHAR(16) DEFAULT '',
  status VARCHAR(12) DEFAULT 'draft', committed TINYINT DEFAULT 0, recipientsJson VARCHAR(255) DEFAULT '',
  returnNote TEXT, approvedBy VARCHAR(64) DEFAULT '', approvedByName VARCHAR(160) DEFAULT '', approvedAt VARCHAR(40) DEFAULT '',
  sentAt VARCHAR(40) DEFAULT '', familySentAt VARCHAR(40) DEFAULT '', createdAt VARCHAR(40) DEFAULT '', updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_gp_plan (planId), UNIQUE KEY idx_gp_one (memberId, term), INDEX idx_gp_status (status, sentAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS growth_plan_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  itemId VARCHAR(40) NOT NULL, planId VARCHAR(40) NOT NULL, subject VARCHAR(60) NOT NULL,
  current INT NULL, target INT NULL, method VARCHAR(16) DEFAULT 'retrieval',
  what TEXT, whenWhere VARCHAR(240) DEFAULT '', sessionsPerWeek INT DEFAULT 3,
  helper VARCHAR(16) DEFAULT 'self', position INT DEFAULT 0,
  UNIQUE KEY idx_gpi_item (itemId), INDEX idx_gpi_plan (planId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS plan_checkins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  itemId VARCHAR(40) NOT NULL, memberId VARCHAR(64) NOT NULL, weekStart VARCHAR(12) NOT NULL,
  done INT DEFAULT 0, planned INT DEFAULT 0, updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_pc_one (itemId, weekStart), INDEX idx_pc_member (memberId, weekStart)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS plan_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  planId VARCHAR(40) NOT NULL, authorId VARCHAR(64) NOT NULL, authorName VARCHAR(160) DEFAULT '', authorRole VARCHAR(24) DEFAULT '',
  text TEXT NOT NULL, createdAt VARCHAR(40) DEFAULT '',
  INDEX idx_pn_plan (planId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS plan_acks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  planId VARCHAR(40) NOT NULL, userId VARCHAR(64) NOT NULL, at VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_pa_one (planId, userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS results_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL, term VARCHAR(16) NOT NULL, actorId VARCHAR(64) DEFAULT '', actorName VARCHAR(160) DEFAULT '',
  actorRole VARCHAR(24) DEFAULT '', what VARCHAR(400) NOT NULL, kind VARCHAR(24) DEFAULT '', at VARCHAR(40) DEFAULT '',
  INDEX idx_rl_member (memberId, term, at), INDEX idx_rl_kind (kind, memberId, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE skill_marks ADD COLUMN evidence TEXT;
ALTER TABLE skill_marks ADD COLUMN prevLevel INT NULL;
INSERT INTO schema_version (version) VALUES (144) ON DUPLICATE KEY UPDATE version = version;

-- 145: The Club class's Saturday — roll, plan, hinge, exit ticket, log (domain/club-class.php).
CREATE TABLE IF NOT EXISTS club_class_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sessionId VARCHAR(40) NOT NULL, course VARCHAR(120) NOT NULL, centre VARCHAR(120) NOT NULL, date VARCHAR(12) NOT NULL,
  instructorId VARCHAR(64) DEFAULT '', instructorName VARCHAR(160) DEFAULT '',
  rollJson MEDIUMTEXT, rollClosedAt VARCHAR(40) DEFAULT '',
  planJson MEDIUMTEXT, planAt VARCHAR(40) DEFAULT '',
  hingeJson TEXT, exitJson MEDIUMTEXT, exitAt VARCHAR(40) DEFAULT '',
  logJson MEDIUMTEXT, filedAt VARCHAR(40) DEFAULT '',
  createdAt VARCHAR(40) DEFAULT '', updatedAt VARCHAR(40) DEFAULT '',
  UNIQUE KEY idx_ccs_session (sessionId), UNIQUE KEY idx_ccs_slot (course, centre, date), INDEX idx_ccs_instr (instructorId, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (145) ON DUPLICATE KEY UPDATE version = version;

-- 146 · one active mentor per child. Data only: the UPDATE is in
-- NGG_MYSQL_ROW_FIXUPS (api/_lib/db.php), which the replay runs.
INSERT INTO schema_version (version) VALUES (146) ON DUPLICATE KEY UPDATE version = version;

-- 147 · cover: a mentor opening another mentor's mentee's record, with a reason
CREATE TABLE IF NOT EXISTS mentor_record_cover (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mentorMemberId VARCHAR(64) NOT NULL, mentorName VARCHAR(190) DEFAULT '',
  subjectId VARCHAR(64) NOT NULL, centre VARCHAR(120) DEFAULT '', reason TEXT NOT NULL,
  grantedAt VARCHAR(40) NOT NULL, expiresAt VARCHAR(40) NOT NULL, endedAt VARCHAR(40) DEFAULT '',
  INDEX idx_mrc_mentor (mentorMemberId, subjectId, expiresAt), INDEX idx_mrc_centre (centre, grantedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (147) ON DUPLICATE KEY UPDATE version = version;

-- 148: the Saturday Formation Schedule and its send ledger.
CREATE TABLE IF NOT EXISTS saturday_formation (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blockKey VARCHAR(40) NOT NULL UNIQUE, sort INT DEFAULT 0, startTime VARCHAR(5) NOT NULL, endTime VARCHAR(5) NOT NULL,
  title VARCHAR(160) NOT NULL, flow VARCHAR(80) DEFAULT '', purpose TEXT, quote TEXT, forJson MEDIUMTEXT,
  status VARCHAR(16) DEFAULT 'active', updatedAt VARCHAR(40) DEFAULT '', updatedBy VARCHAR(64) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS saturday_formation_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  onDate VARCHAR(10) NOT NULL, slot VARCHAR(40) NOT NULL, recipient VARCHAR(190) NOT NULL, channel VARCHAR(16) NOT NULL, sentAt VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_sfs (onDate, slot, recipient, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (148) ON DUPLICATE KEY UPDATE version = version;

-- 149: the Saturday register's mentor duties.
ALTER TABLE mentor_register ADD COLUMN checks TEXT;
INSERT INTO schema_version (version) VALUES (149) ON DUPLICATE KEY UPDATE version = version;

-- 150: the Saturday register's detail line (what the mentor saw).
ALTER TABLE mentor_register ADD COLUMN note TEXT;
INSERT INTO schema_version (version) VALUES (150) ON DUPLICATE KEY UPDATE version = version;

-- 151: what an invoice is for — 'joining', or 'balance' (the ledger's outstanding amount, paid online).
ALTER TABLE membership_invoices ADD COLUMN purpose VARCHAR(16) NOT NULL DEFAULT 'joining';
INSERT INTO schema_version (version) VALUES (151) ON DUPLICATE KEY UPDATE version = version;

-- 152: every Academy quiz attempt (the retry limit reads it).
CREATE TABLE IF NOT EXISTS mentor_academy_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mentorId VARCHAR(64) NOT NULL,
  moduleId VARCHAR(64) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  passed TINYINT NOT NULL DEFAULT 0,
  at VARCHAR(32) NOT NULL DEFAULT '',
  INDEX idx_macad_att (mentorId, moduleId, at)
);
INSERT INTO schema_version (version) VALUES (152) ON DUPLICATE KEY UPDATE version = version;

-- 153: the Saturday evaluation (formation criteria, strength, next step) on the week's review.
ALTER TABLE mentor_reviews ADD COLUMN evalJson TEXT;
INSERT INTO schema_version (version) VALUES (153) ON DUPLICATE KEY UPDATE version = version;

-- 154: an assignment's lesson, and when its audience was last reminded.
ALTER TABLE assignments ADD COLUMN unitId VARCHAR(64) DEFAULT '';
ALTER TABLE assignments ADD COLUMN remindedAt VARCHAR(32) DEFAULT '';
CREATE INDEX idx_sub_member ON assignment_submissions(memberId);
INSERT INTO schema_version (version) VALUES (154) ON DUPLICATE KEY UPDATE version = version;

-- 155: assignment hand-ins collect links, several files and ticked success-criteria steps.
ALTER TABLE assignments ADD COLUMN steps TEXT;
ALTER TABLE assignment_submissions ADD COLUMN linkUrl VARCHAR(1000) DEFAULT '';
ALTER TABLE assignment_submissions ADD COLUMN filesJson TEXT;
ALTER TABLE assignment_submissions ADD COLUMN stepsJson TEXT;
INSERT INTO schema_version (version) VALUES (155) ON DUPLICATE KEY UPDATE version = version;

-- 156: emails stored the way the sign-in door compares them — a data fix-up,
-- so it lives in NGG_MYSQL_ROW_FIXUPS (api/_lib/db.php), which the replay runs.
INSERT INTO schema_version (version) VALUES (156) ON DUPLICATE KEY UPDATE version = version;

-- 157: texts by Telegram — a shared, Telegram-verified phone number and its chat.
CREATE TABLE IF NOT EXISTS telegram_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  chatId VARCHAR(32) NOT NULL,
  tgUserId VARCHAR(32) DEFAULT '',
  tgName VARCHAR(120) DEFAULT '',
  linkedAt VARCHAR(32) DEFAULT '',
  lastSentAt VARCHAR(32) DEFAULT '',
  sent INT DEFAULT 0,
  UNIQUE KEY idx_tg_phone (phone),
  KEY idx_tg_chat (chatId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (157) ON DUPLICATE KEY UPDATE version = version;

-- 158: files in the storage bucket — stored once (verified sha256), swept when nothing uses them.
CREATE TABLE IF NOT EXISTS media_objects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storeKey VARCHAR(300) NOT NULL,
  url VARCHAR(600) NOT NULL,
  sha256 VARCHAR(64) DEFAULT '',
  bytes BIGINT DEFAULT 0,
  mediaKind VARCHAR(16) DEFAULT '',
  kind VARCHAR(40) DEFAULT '',
  ownerId VARCHAR(64) DEFAULT '',
  status VARCHAR(16) DEFAULT 'signed',
  reuses INT DEFAULT 0,
  createdAt VARCHAR(32) DEFAULT '',
  verifiedAt VARCHAR(32) DEFAULT '',
  checkedAt VARCHAR(32) DEFAULT '',
  deletedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_mo_key (storeKey),
  KEY idx_mo_sha (sha256, status),
  KEY idx_mo_status (status, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (158) ON DUPLICATE KEY UPDATE version = version;

-- 159: study tools — flashcard decks and cards (spaced repetition), focus and typing sessions.
CREATE TABLE IF NOT EXISTS study_decks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deckId VARCHAR(40) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  source VARCHAR(120) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  updatedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_sd_deck (deckId),
  KEY idx_sd_member (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS study_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cardId VARCHAR(40) NOT NULL,
  deckId VARCHAR(40) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease DOUBLE DEFAULT 2.5,
  intervalDays INT DEFAULT 0,
  reps INT DEFAULT 0,
  lapses INT DEFAULT 0,
  dueAt VARCHAR(32) DEFAULT '',
  reviewedAt VARCHAR(32) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_sc_card (cardId),
  KEY idx_sc_due (memberId, deckId, dueAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS study_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  tool VARCHAR(16) NOT NULL,
  label VARCHAR(120) DEFAULT '',
  minutes INT DEFAULT 0,
  wpm INT DEFAULT 0,
  accuracy INT DEFAULT 0,
  cards INT DEFAULT 0,
  at VARCHAR(32) DEFAULT '',
  day VARCHAR(10) DEFAULT '',
  KEY idx_ss_member (memberId, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (159) ON DUPLICATE KEY UPDATE version = version;

-- 160: one lead per programme (leadVolunteerId = NGG centre lead).
-- NULL until set; the backfill is NGG_MYSQL_ROW_FIXUPS 'centres.summerLead' (db.php).
ALTER TABLE centres ADD COLUMN summerLeadVolunteerId VARCHAR(64) NULL;
INSERT INTO schema_version (version) VALUES (160) ON DUPLICATE KEY UPDATE version = version;

-- 161: Club portal v3 — announcements with approval, check-in follow-up, fine rules, shift times.
CREATE TABLE IF NOT EXISTS club_announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  annId VARCHAR(64) NOT NULL,
  title VARCHAR(200) DEFAULT '',
  body TEXT,
  aud VARCHAR(16) DEFAULT 'guardians',
  centre VARCHAR(120) DEFAULT 'all',
  channels VARCHAR(64) DEFAULT '["app"]',
  status VARCHAR(16) DEFAULT 'draft',
  sendAt VARCHAR(32) DEFAULT '',
  byId VARCHAR(64) DEFAULT '',
  byName VARCHAR(160) DEFAULT '',
  approvedById VARCHAR(64) DEFAULT '',
  approvedByName VARCHAR(160) DEFAULT '',
  note TEXT,
  sentAt VARCHAR(32) DEFAULT '',
  stats TEXT,
  createdAt VARCHAR(32) DEFAULT '',
  updatedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_cann_id (annId),
  KEY idx_cann_status (status, sendAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS club_checkin_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  checkinKey VARCHAR(120) NOT NULL,
  toldAt VARCHAR(32) DEFAULT '',
  toldBy VARCHAR(64) DEFAULT '',
  seenAt VARCHAR(32) DEFAULT '',
  seenBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY idx_ccs_key (checkinKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS conduct_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ruleId VARCHAR(64) NOT NULL,
  reason VARCHAR(32) DEFAULT '',
  name VARCHAR(160) DEFAULT '',
  whenText VARCHAR(200) DEFAULT '',
  amount INT DEFAULT 0,
  capTerm INT DEFAULT 0,
  active INT DEFAULT 1,
  createdBy VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  updatedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_crule_id (ruleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE attendance_duty ADD COLUMN startTime VARCHAR(5) DEFAULT '';
ALTER TABLE attendance_duty ADD COLUMN endTime VARCHAR(5) DEFAULT '';
INSERT INTO schema_version (version) VALUES (161) ON DUPLICATE KEY UPDATE version = version;

-- 162: Community v3 — answers, homework posts, video meta and progress, code posts, review timing, safeguarding severity/lead.
ALTER TABLE community_posts ADD COLUMN answerId VARCHAR(40) DEFAULT '';
ALTER TABLE community_posts ADD COLUMN homeworkId VARCHAR(40) DEFAULT '';
ALTER TABLE community_posts ADD COLUMN mediaMeta MEDIUMTEXT;
ALTER TABLE community_posts ADD COLUMN mediaCode MEDIUMTEXT;
ALTER TABLE community_posts ADD COLUMN reviewedAt VARCHAR(32) DEFAULT '';
ALTER TABLE community_posts ADD COLUMN reviewedBy VARCHAR(64) DEFAULT '';
ALTER TABLE community_comments ADD COLUMN reviewedAt VARCHAR(32) DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN severity VARCHAR(10) DEFAULT 'high';
ALTER TABLE community_safeguarding ADD COLUMN leadId VARCHAR(64) DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN leadName VARCHAR(160) DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN postId VARCHAR(40) DEFAULT '';
ALTER TABLE community_safeguarding ADD COLUMN source VARCHAR(20) DEFAULT 'screen';
ALTER TABLE community_safeguarding ADD COLUMN note TEXT;
CREATE TABLE IF NOT EXISTS community_video_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  postId VARCHAR(40) NOT NULL,
  pos INT DEFAULT 0,
  dur INT DEFAULT 0,
  updatedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY idx_cvp_member_post (memberId, postId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (162) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS guardian_notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  noticeId VARCHAR(40) NOT NULL UNIQUE,
  guardianId VARCHAR(64) NOT NULL,
  kind VARCHAR(30) DEFAULT 'announcement',
  refId VARCHAR(64) DEFAULT '',
  title VARCHAR(255) DEFAULT '',
  body TEXT,
  fromName VARCHAR(160) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  readAt VARCHAR(32) DEFAULT '',
  KEY idx_gnotice_guardian (guardianId, createdAt),
  UNIQUE KEY idx_gnotice_ref (guardianId, kind, refId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE club_announcements ADD COLUMN smsBody TEXT;
INSERT INTO schema_version (version) VALUES (163) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS academy_passes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  track VARCHAR(20) NOT NULL,
  personId VARCHAR(64) NOT NULL,
  moduleId VARCHAR(20) NOT NULL,
  score INT DEFAULT 0,
  passedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY uq_acpass (track, personId, moduleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS academy_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  track VARCHAR(20) NOT NULL,
  personId VARCHAR(64) NOT NULL,
  moduleId VARCHAR(20) NOT NULL,
  score INT DEFAULT 0,
  passed TINYINT DEFAULT 0,
  at VARCHAR(32) DEFAULT '',
  KEY idx_acatt (track, personId, moduleId, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (164) ON DUPLICATE KEY UPDATE version = version;
ALTER TABLE mentors ADD COLUMN honorific VARCHAR(20) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN honorific VARCHAR(20) DEFAULT '';
ALTER TABLE members ADD COLUMN honorific VARCHAR(20) DEFAULT '';
INSERT INTO schema_version (version) VALUES (165) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  projectId VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  detail TEXT,
  startOn VARCHAR(10) DEFAULT '',
  dueOn VARCHAR(10) DEFAULT '',
  centre VARCHAR(120) DEFAULT '',
  status VARCHAR(16) DEFAULT 'open',
  createdBy VARCHAR(64) DEFAULT '',
  createdByName VARCHAR(200) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  updatedAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY uq_projects_id (projectId),
  KEY idx_projects_by (createdBy, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS project_people (
  id INT AUTO_INCREMENT PRIMARY KEY,
  projectId VARCHAR(32) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  personId VARCHAR(64) NOT NULL,
  groupName VARCHAR(60) DEFAULT '',
  status VARCHAR(16) DEFAULT 'assigned',
  note TEXT,
  doneAt VARCHAR(32) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  UNIQUE KEY uq_project_person (projectId, kind, personId),
  KEY idx_project_people_who (kind, personId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (166) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS ai_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  at VARCHAR(32) NOT NULL,
  month VARCHAR(7) NOT NULL,
  profile VARCHAR(40) DEFAULT '',
  job VARCHAR(10) DEFAULT '',
  provider VARCHAR(20) DEFAULT '',
  model VARCHAR(120) DEFAULT '',
  tier VARCHAR(6) DEFAULT '',
  inTokens INT DEFAULT 0,
  outTokens INT DEFAULT 0,
  costMicros BIGINT DEFAULT 0,
  estimated TINYINT DEFAULT 0,
  ok TINYINT DEFAULT 1,
  error VARCHAR(60) DEFAULT '',
  KEY idx_ai_usage_month (month, tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (167) ON DUPLICATE KEY UPDATE version = version;
ALTER TABLE members ADD COLUMN feesSettledThrough VARCHAR(10) DEFAULT '';
INSERT INTO schema_version (version) VALUES (168) ON DUPLICATE KEY UPDATE version = version;
ALTER TABLE member_requests ADD COLUMN topic VARCHAR(12) DEFAULT '';
ALTER TABLE member_requests ADD COLUMN centre VARCHAR(120) DEFAULT '';
ALTER TABLE member_requests ADD COLUMN passedAt VARCHAR(32) DEFAULT '';
INSERT INTO schema_version (version) VALUES (169) ON DUPLICATE KEY UPDATE version = version;
ALTER TABLE member_requests ADD COLUMN rating TINYINT DEFAULT 0;
INSERT INTO schema_version (version) VALUES (170) ON DUPLICATE KEY UPDATE version = version;
ALTER TABLE mentor_messages ADD COLUMN mediaJson TEXT;
INSERT INTO schema_version (version) VALUES (171) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS mentor_supports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(40) NOT NULL,
  mentorId VARCHAR(40) NOT NULL,
  focus VARCHAR(60) DEFAULT '',
  endsOn VARCHAR(10) DEFAULT '',
  status VARCHAR(12) DEFAULT 'active',
  startedAt VARCHAR(32) DEFAULT '',
  endedAt VARCHAR(32) DEFAULT '',
  createdBy VARCHAR(40) DEFAULT '',
  KEY idx_mentor_supports_member (memberId, status),
  KEY idx_mentor_supports_mentor (mentorId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (172) ON DUPLICATE KEY UPDATE version = version;
CREATE TABLE IF NOT EXISTS id_photo_campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaignId VARCHAR(40) NOT NULL,
  askedBy VARCHAR(40) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL,
  total INT NOT NULL DEFAULT 0,
  status VARCHAR(12) NOT NULL DEFAULT 'sending',
  summaryAt VARCHAR(32) NOT NULL DEFAULT '',
  remindedAt VARCHAR(32) NOT NULL DEFAULT '',
  remindedBy VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE KEY uq_id_photo_campaigns (campaignId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE id_photo_asks ADD COLUMN campaignId VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE id_photo_asks ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT 'sent';
ALTER TABLE id_photo_asks ADD COLUMN sentAt VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE id_photo_asks ADD COLUMN reminders INT NOT NULL DEFAULT 0;
ALTER TABLE id_photo_asks ADD KEY idx_id_photo_asks_campaign (campaignId, status);
ALTER TABLE id_photo_asks ADD KEY idx_id_photo_asks_status (status);
INSERT INTO schema_version (version) VALUES (173) ON DUPLICATE KEY UPDATE version = version;

-- 174: a member's chosen courses; photo changes as requests
ALTER TABLE members ADD COLUMN courses TEXT NULL;
CREATE TABLE IF NOT EXISTS photo_change_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requestId VARCHAR(40) NOT NULL,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  centre VARCHAR(120) NOT NULL DEFAULT '',
  photoUrl TEXT NOT NULL,
  oldPhotoUrl TEXT NULL,
  reason VARCHAR(400) NOT NULL DEFAULT '',
  via VARCHAR(16) NOT NULL DEFAULT '',
  requestedBy VARCHAR(64) NOT NULL DEFAULT '',
  requestedAt VARCHAR(32) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  decidedBy VARCHAR(64) NOT NULL DEFAULT '',
  decidedAt VARCHAR(32) NOT NULL DEFAULT '',
  note VARCHAR(400) NOT NULL DEFAULT '',
  UNIQUE KEY uq_pcr_request (requestId),
  KEY idx_pcr_subject (subjectType, subjectId, status),
  KEY idx_pcr_status (status, requestedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (174) ON DUPLICATE KEY UPDATE version = version;

-- 175: a reply quotes the reply it answers; reactions on replies
ALTER TABLE community_comments ADD COLUMN replyTo VARCHAR(40) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS community_comment_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  commentId VARCHAR(40) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  createdAt VARCHAR(32) NOT NULL,
  UNIQUE KEY uq_ccr (commentId, memberId),
  KEY idx_ccr_comment (commentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (175) ON DUPLICATE KEY UPDATE version = version;

-- 176: time on the portal (heartbeat while visible and in use)
CREATE TABLE IF NOT EXISTS portal_time (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  day VARCHAR(10) NOT NULL,
  portal VARCHAR(24) NOT NULL,
  seconds INT NOT NULL DEFAULT 0,
  beats INT NOT NULL DEFAULT 0,
  firstAt VARCHAR(32) NOT NULL,
  lastAt VARCHAR(32) NOT NULL,
  UNIQUE KEY uq_pt (memberId, day, portal),
  KEY idx_pt_day (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (176) ON DUPLICATE KEY UPDATE version = version;

-- 177: an instructor cleared of the online Academy by hand
ALTER TABLE volunteers ADD COLUMN academyClearedAt VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE volunteers ADD COLUMN academyClearedBy VARCHAR(64) NOT NULL DEFAULT '';
INSERT INTO schema_version (version) VALUES (177) ON DUPLICATE KEY UPDATE version = version;

-- Migration 178: phase 1 of the centre-key migration — a centreId beside the
-- centre NAME in every table that carries one. Columns only; no reads change.

ALTER TABLE activities ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_activities_centreid ON activities(centreId);
ALTER TABLE arcade_scores ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_arcade_scores_centreid ON arcade_scores(centreId);
ALTER TABLE attendance_duty ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_attendance_duty_centreid ON attendance_duty(centreId);
ALTER TABLE awards ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_awards_centreid ON awards(centreId);
ALTER TABLE club_announcements ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_club_announcements_centreid ON club_announcements(centreId);
ALTER TABLE community_homework_state ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_community_homework_state_centreid ON community_homework_state(centreId);
ALTER TABLE community_safeguarding ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_community_safeguarding_centreid ON community_safeguarding(centreId);
ALTER TABLE courage_marks ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_courage_marks_centreid ON courage_marks(centreId);
ALTER TABLE course_sessions ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_course_sessions_centreid ON course_sessions(centreId);
ALTER TABLE engagement_snapshots ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_engagement_snapshots_centreid ON engagement_snapshots(centreId);
ALTER TABLE insight_threads ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_insight_threads_centreid ON insight_threads(centreId);
ALTER TABLE match_games ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_match_games_centreid ON match_games(centreId);
ALTER TABLE member_requests ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_member_requests_centreid ON member_requests(centreId);
ALTER TABLE member_stars ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_member_stars_centreid ON member_stars(centreId);
ALTER TABLE members ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_members_centreid ON members(centreId);
ALTER TABLE mentor_goals ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_goals_centreid ON mentor_goals(centreId);
ALTER TABLE mentor_interventions ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_interventions_centreid ON mentor_interventions(centreId);
ALTER TABLE mentor_matches ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_matches_centreid ON mentor_matches(centreId);
ALTER TABLE mentor_meetings ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_meetings_centreid ON mentor_meetings(centreId);
ALTER TABLE mentor_nudges ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_nudges_centreid ON mentor_nudges(centreId);
ALTER TABLE mentor_reviews ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_reviews_centreid ON mentor_reviews(centreId);
ALTER TABLE mentor_scorecards ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_scorecards_centreid ON mentor_scorecards(centreId);
ALTER TABLE mentor_tasks ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_tasks_centreid ON mentor_tasks(centreId);
ALTER TABLE photo_change_requests ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_photo_change_requests_centreid ON photo_change_requests(centreId);
ALTER TABLE projects ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_projects_centreid ON projects(centreId);
ALTER TABLE safeguarding_cases ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_safeguarding_cases_centreid ON safeguarding_cases(centreId);
ALTER TABLE skill_marks ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_skill_marks_centreid ON skill_marks(centreId);
ALTER TABLE student_remarks ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_student_remarks_centreid ON student_remarks(centreId);
ALTER TABLE tournament_entrants ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_tournament_entrants_centreid ON tournament_entrants(centreId);
ALTER TABLE tournament_invites ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_tournament_invites_centreid ON tournament_invites(centreId);
ALTER TABLE tournament_pairings ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_tournament_pairings_centreid ON tournament_pairings(centreId);
ALTER TABLE volunteers ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_volunteers_centreid ON volunteers(centreId);
ALTER TABLE applications ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_applications_centreid ON applications(centreId);
ALTER TABLE assignments ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_assignments_centreid ON assignments(centreId);
ALTER TABLE club_class_sessions ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_club_class_sessions_centreid ON club_class_sessions(centreId);
ALTER TABLE events ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_events_centreid ON events(centreId);
ALTER TABLE mentor_record_cover ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentor_record_cover_centreid ON mentor_record_cover(centreId);
ALTER TABLE mentors ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_mentors_centreid ON mentors(centreId);
ALTER TABLE summer_students ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_summer_students_centreid ON summer_students(centreId);
ALTER TABLE v3_scores ADD COLUMN centreId VARCHAR(48) NOT NULL DEFAULT '';
CREATE INDEX idx_v3_scores_centreid ON v3_scores(centreId);
-- Two width changes that ADD COLUMN can never make.
--
-- The mirror repeats `ALTER TABLE … ADD COLUMN` on purpose so it can be
-- replayed over an existing schema, and db_apply_mysql_schema() swallows the
-- resulting "Duplicate column name" errors (docs/SETUP.md). That works for
-- ADDING a column. It does NOT work for changing one: the ADD errors, the
-- error is swallowed, and the column keeps the type its CREATE TABLE gave it.
--
-- So `ALTER TABLE volunteers ADD COLUMN memberId VARCHAR(64)` has never once
-- taken effect — volunteers.memberId is VARCHAR(40) on every MySQL deployment
-- there has ever been, while members.memberId is VARCHAR(64). Two widths for
-- one key, which is also why no foreign key can be declared between them.
--
-- MODIFY is the statement for a type change, and it is idempotent: re-running
-- it against a column that is already VARCHAR(64) is a no-op, not an error.
ALTER TABLE volunteers MODIFY COLUMN memberId VARCHAR(64) DEFAULT '';
ALTER TABLE members MODIFY COLUMN ngvVolunteerId VARCHAR(64) DEFAULT '';

-- 179: a 'watch' question carries the video it is about, so the learner
-- watches it inside the exam instead of being sent off to find it.
ALTER TABLE curriculum_checks ADD COLUMN videoUrl TEXT;

-- 180: what a member says about a session, asked at the end of every one.
-- Private until a person decides otherwise (domain/testimonials.php).
CREATE TABLE IF NOT EXISTS testimonials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tid VARCHAR(40) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL DEFAULT '',
  unitId VARCHAR(40) NOT NULL DEFAULT '',
  course VARCHAR(120) NOT NULL DEFAULT '',
  centre VARCHAR(120) NOT NULL DEFAULT '',
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  body TEXT,
  showAs VARCHAR(16) NOT NULL DEFAULT 'initials',
  status VARCHAR(16) NOT NULL DEFAULT 'new',
  decidedBy VARCHAR(64) NOT NULL DEFAULT '',
  decidedAt VARCHAR(32) NOT NULL DEFAULT '',
  note TEXT,
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_testi_status (status, createdAt),
  KEY idx_testi_member (memberId, unitId),
  KEY idx_testi_centreid (centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (180) ON DUPLICATE KEY UPDATE version = version;

-- 181: Family Portal v3 — inbox categories and signatures, family RSVPs,
-- mentor meeting slots, and the centre's list of who may collect a child.
ALTER TABLE guardian_notices ADD COLUMN cat VARCHAR(16) NOT NULL DEFAULT 'centre';
ALTER TABLE guardian_notices ADD COLUMN memberId VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE guardian_notices ADD COLUMN sign TINYINT NOT NULL DEFAULT 0;
ALTER TABLE guardian_notices ADD COLUMN signedAt VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN familiesExpected TINYINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS guardian_rsvps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guardianId VARCHAR(64) NOT NULL, eventId VARCHAR(64) NOT NULL, answer VARCHAR(8) NOT NULL DEFAULT 'yes',
  reminded TINYINT NOT NULL DEFAULT 0, updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_grsvp_one (guardianId, eventId)
);
CREATE TABLE IF NOT EXISTS mentor_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slotId VARCHAR(48) NOT NULL UNIQUE, mentorId VARCHAR(64) NOT NULL, startAt VARCHAR(32) NOT NULL, mode VARCHAR(16) NOT NULL DEFAULT 'centre',
  bookedBy VARCHAR(64) NOT NULL DEFAULT '', memberId VARCHAR(64) NOT NULL DEFAULT '', bookedAt VARCHAR(32) NOT NULL DEFAULT '',
  reminded TINYINT NOT NULL DEFAULT 0, createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_mslot_mentor (mentorId, startAt), KEY idx_mslot_member (memberId, startAt)
);
CREATE TABLE IF NOT EXISTS member_collectors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL, relation VARCHAR(60) NOT NULL DEFAULT '', phone VARCHAR(32) NOT NULL DEFAULT '',
  createdBy VARCHAR(64) NOT NULL DEFAULT '', createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_mcoll_member (memberId)
);

INSERT INTO schema_version (version) VALUES (181) ON DUPLICATE KEY UPDATE version = version;

-- 182: Summer School Portal v3 — deferred bulk actions (the undo window),
-- each staff member's recent children, the promoted member's Summer link,
-- incidents and guardian messages.
CREATE TABLE IF NOT EXISTS pending_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pendingId VARCHAR(48) NOT NULL UNIQUE, op VARCHAR(80) NOT NULL, args MEDIUMTEXT,
  requesterId VARCHAR(64) NOT NULL, label VARCHAR(160) NOT NULL DEFAULT '', n INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', commitAt VARCHAR(32) NOT NULL,
  result MEDIUMTEXT, createdAt VARCHAR(32) NOT NULL DEFAULT '', doneAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_pend_due (status, commitAt)
);
CREATE TABLE IF NOT EXISTS summer_recent (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staffId VARCHAR(64) NOT NULL, studentId VARCHAR(64) NOT NULL, at VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_srecent_one (staffId, studentId)
);
ALTER TABLE members ADD COLUMN fromSummerId VARCHAR(64) NOT NULL DEFAULT '';
CREATE INDEX idx_members_fromsummer ON members(fromSummerId);
CREATE TABLE IF NOT EXISTS summer_incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  incidentId VARCHAR(48) NOT NULL UNIQUE, cohortId VARCHAR(48) NOT NULL DEFAULT '', studentId VARCHAR(64) NOT NULL DEFAULT '',
  childName VARCHAR(255) NOT NULL DEFAULT '', centre VARCHAR(120) NOT NULL DEFAULT '', centreId VARCHAR(48) NOT NULL DEFAULT '', kind VARCHAR(32) NOT NULL DEFAULT '',
  severity VARCHAR(16) NOT NULL DEFAULT 'low', note TEXT,
  byId VARCHAR(64) NOT NULL DEFAULT '', byName VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'open', toldAt VARCHAR(32) NOT NULL DEFAULT '', toldBy VARCHAR(64) NOT NULL DEFAULT '',
  closedAt VARCHAR(32) NOT NULL DEFAULT '', createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_sinc_edition (cohortId, status)
);
CREATE TABLE IF NOT EXISTS summer_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  messageId VARCHAR(48) NOT NULL UNIQUE, cohortId VARCHAR(48) NOT NULL DEFAULT '', template VARCHAR(32) NOT NULL DEFAULT '',
  title VARCHAR(160) NOT NULL DEFAULT '', body TEXT, audience VARCHAR(32) NOT NULL DEFAULT '',
  channel VARCHAR(16) NOT NULL DEFAULT 'email', recipients INT NOT NULL DEFAULT 0,
  delivered INT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0,
  byId VARCHAR(64) NOT NULL DEFAULT '', byName VARCHAR(160) NOT NULL DEFAULT '', createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_smsg_edition (cohortId, createdAt)
);

INSERT INTO schema_version (version) VALUES (182) ON DUPLICATE KEY UPDATE version = version;

-- 183: one email, several member accounts — the accounts a verified challenge may open.
ALTER TABLE auth_sessions ADD COLUMN pickIds TEXT;
INSERT INTO schema_version (version) VALUES (183) ON DUPLICATE KEY UPDATE version = version;

-- 184: notifications a person can act on — per-person read/dismiss state,
-- one live item per running thing (groupKey), and a named action.
CREATE TABLE IF NOT EXISTS notification_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL, notifId VARCHAR(64) NOT NULL,
  readAt VARCHAR(32) NOT NULL DEFAULT '', dismissedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_nstate_one (memberId, notifId)
);
ALTER TABLE notifications ADD COLUMN groupKey VARCHAR(96) NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN actionLabel VARCHAR(60) NOT NULL DEFAULT '';
CREATE INDEX idx_notif_group ON notifications(memberId, groupKey);

INSERT INTO schema_version (version) VALUES (184) ON DUPLICATE KEY UPDATE version = version;

-- 185: support cases — one problem a person brought, by priority and category,
-- with its thread of messages (domain/support.php).
CREATE TABLE IF NOT EXISTS support_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caseNo INT NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'new', priority VARCHAR(4) NOT NULL DEFAULT 'P3',
  category VARCHAR(32) NOT NULL DEFAULT 'other', subcategory VARCHAR(80) NOT NULL DEFAULT '',
  subject VARCHAR(200) NOT NULL DEFAULT '',
  requesterKind VARCHAR(16) NOT NULL DEFAULT 'visitor', requesterId VARCHAR(64) NOT NULL DEFAULT '',
  name VARCHAR(160) NOT NULL DEFAULT '', email VARCHAR(190) NOT NULL DEFAULT '', phone VARCHAR(40) NOT NULL DEFAULT '',
  memberId VARCHAR(64) NOT NULL DEFAULT '', centre VARCHAR(120) NOT NULL DEFAULT '', centreId VARCHAR(48) NOT NULL DEFAULT '',
  assigneeId VARCHAR(64) NOT NULL DEFAULT '', source VARCHAR(16) NOT NULL DEFAULT 'web',
  pageUrl VARCHAR(500) NOT NULL DEFAULT '', userAgent VARCHAR(300) NOT NULL DEFAULT '',
  ipHash VARCHAR(64) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT '', lastActivityAt VARCHAR(32) NOT NULL DEFAULT '',
  lastReplyBy VARCHAR(16) NOT NULL DEFAULT 'requester', respondBy VARCHAR(32) NOT NULL DEFAULT '',
  firstResponseAt VARCHAR(32) NOT NULL DEFAULT '', solvedAt VARCHAR(32) NOT NULL DEFAULT '', closedAt VARCHAR(32) NOT NULL DEFAULT '',
  rating INT NOT NULL DEFAULT 0, ratingNote VARCHAR(600) NOT NULL DEFAULT '', followUpOf INT NOT NULL DEFAULT 0,
  KEY idx_scase_status (status, respondBy), KEY idx_scase_requester (requesterKind, requesterId), KEY idx_scase_assignee (assigneeId, status)
);
CREATE TABLE IF NOT EXISTS support_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caseNo INT NOT NULL, authorKind VARCHAR(16) NOT NULL DEFAULT 'requester', authorId VARCHAR(64) NOT NULL DEFAULT '',
  authorName VARCHAR(160) NOT NULL DEFAULT '', body TEXT, internal TINYINT NOT NULL DEFAULT 0,
  files TEXT, createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_smsgs_case (caseNo, id)
);

INSERT INTO schema_version (version) VALUES (185) ON DUPLICATE KEY UPDATE version = version;

-- 186 (was 181 on the community-audit branch): two questions, two rhythms. "How did today go?" after every LESSON —
-- a tap, for the person teaching, never published. "What did this term give
-- you?" after every SESSION, the twelve-week block — and that is the
-- testimonial. testimonials.unitId stays, unread, so a deployment that
-- already ran 180 keeps resolving.
ALTER TABLE testimonials ADD COLUMN sessionId VARCHAR(40) NOT NULL DEFAULT '';
CREATE INDEX idx_testi_session ON testimonials(memberId, sessionId);

CREATE TABLE IF NOT EXISTS lesson_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fid VARCHAR(40) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL DEFAULT '',
  unitId VARCHAR(40) NOT NULL DEFAULT '',
  course VARCHAR(120) NOT NULL DEFAULT '',
  centre VARCHAR(120) NOT NULL DEFAULT '',
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  `signal` VARCHAR(16) NOT NULL DEFAULT '',
  body TEXT,
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_lfb_one (memberId, unitId),
  KEY idx_lfb_unit (unitId, `signal`),
  KEY idx_lfb_centreid (centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (186) ON DUPLICATE KEY UPDATE version = version;

-- 187 (was 182 on the community-audit branch): studying for school in the Learn app (domain/study-drill.php). The
-- growth plan already said WHAT to work on; a drill is one of its sessions,
-- actually done — marked with reasons, ticking the week's check-in, and
-- turning what was got wrong into spaced-repetition cards.
CREATE TABLE IF NOT EXISTS study_drills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  drillId VARCHAR(40) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL DEFAULT '',
  itemId VARCHAR(40) NOT NULL DEFAULT '',
  subject VARCHAR(120) NOT NULL DEFAULT '',
  topic VARCHAR(190) NOT NULL DEFAULT '',
  level INT NOT NULL DEFAULT 2,
  source VARCHAR(16) NOT NULL DEFAULT '',
  asked INT NOT NULL DEFAULT 0,
  correct INT NOT NULL DEFAULT 0,
  questionsJson MEDIUMTEXT,
  answersJson MEDIUMTEXT,
  startedAt VARCHAR(32) NOT NULL DEFAULT '',
  markedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_drill_member (memberId, subject, startedAt),
  KEY idx_drill_marked (memberId, markedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (187) ON DUPLICATE KEY UPDATE version = version;

-- 188: the Learn app's note, save and last-opened per member per lesson (domain/learn.php).
CREATE TABLE IF NOT EXISTS learn_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  unitId VARCHAR(40) NOT NULL,
  note MEDIUMTEXT,
  noteAt VARCHAR(32) NOT NULL DEFAULT '',
  saved TINYINT NOT NULL DEFAULT 0,
  savedAt VARCHAR(32) NOT NULL DEFAULT '',
  openedAt VARCHAR(32) NOT NULL DEFAULT '',
  opens INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_learn_state (memberId, unitId),
  KEY idx_learn_state_opened (memberId, openedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (188) ON DUPLICATE KEY UPDATE version = version;

-- 189: Wi-Fi accounts and the centres' gateways (any platform) (domain/wifi.php). Access is
-- derived (wifi_access_for), never stored; the PIN is sealed, not hashed,
-- because the router must be handed it.
CREATE TABLE IF NOT EXISTS wifi_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  username VARCHAR(64) NOT NULL,
  pinSealed VARCHAR(255) NOT NULL DEFAULT '',
  pinSetAt VARCHAR(32) NOT NULL DEFAULT '',
  pinResetDay VARCHAR(10) NOT NULL DEFAULT '',
  pinResets INT NOT NULL DEFAULT 0,
  override VARCHAR(16) NOT NULL DEFAULT '',
  overrideWhy VARCHAR(255) NOT NULL DEFAULT '',
  overrideBy VARCHAR(64) NOT NULL DEFAULT '',
  overrideAt VARCHAR(32) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_subject (subjectType, subjectId),
  UNIQUE KEY uq_wifi_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wifi_gateways (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gatewayId VARCHAR(40) NOT NULL,
  platform VARCHAR(16) NOT NULL DEFAULT 'mikrotik',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  label VARCHAR(120) NOT NULL DEFAULT '',
  keyHash VARCHAR(64) NOT NULL DEFAULT '',
  keyTail VARCHAR(8) NOT NULL DEFAULT '',
  keySetAt VARCHAR(32) NOT NULL DEFAULT '',
  lastSeenAt VARCHAR(32) NOT NULL DEFAULT '',
  lastFullAt VARCHAR(32) NOT NULL DEFAULT '',
  osVersion VARCHAR(64) NOT NULL DEFAULT '',
  lastError VARCHAR(255) NOT NULL DEFAULT '',
  lastVersion INT NOT NULL DEFAULT 0,
  lastChangeAt VARCHAR(32) NOT NULL DEFAULT '',
  ackedJson MEDIUMTEXT,
  pendingJson MEDIUMTEXT,
  pendingVersion INT NOT NULL DEFAULT 0,
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  createdBy VARCHAR(64) NOT NULL DEFAULT '',
  removedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_gateway (gatewayId),
  KEY idx_wifi_gateways_centre (centre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (189) ON DUPLICATE KEY UPDATE version = version;

-- 190: Wi-Fi diagnosis: what gateways report (hourly summaries, never browsing),
-- and speed tests from a gateway or a staff device at a centre.
ALTER TABLE wifi_gateways ADD COLUMN testAsked INT NOT NULL DEFAULT 0;
ALTER TABLE wifi_gateways ADD COLUMN lastStatsJson TEXT;
CREATE TABLE IF NOT EXISTS wifi_gateway_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gatewayId VARCHAR(40) NOT NULL,
  hour VARCHAR(13) NOT NULL,
  samples INT NOT NULL DEFAULT 0,
  activeMax INT NOT NULL DEFAULT 0,
  activeSum INT NOT NULL DEFAULT 0,
  cpuMax INT NOT NULL DEFAULT 0,
  memFreeMin INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_wifi_stats (gatewayId, hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wifi_speed_tests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  centre VARCHAR(191) NOT NULL DEFAULT '',
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  gatewayId VARCHAR(40) NOT NULL DEFAULT '',
  source VARCHAR(16) NOT NULL DEFAULT 'device',
  downMbps DOUBLE NOT NULL DEFAULT 0,
  upMbps DOUBLE NOT NULL DEFAULT 0,
  rttMs INT NOT NULL DEFAULT 0,
  byId VARCHAR(64) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  at VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_wifi_speed_centre (centre, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (190) ON DUPLICATE KEY UPDATE version = version;

-- 191: Wi-Fi regions (a Wi-Fi grouping of centres, not a change to centres),
-- their leads, speed/hours overrides per region or centre, and daily rollups.
CREATE TABLE IF NOT EXISTS wifi_regions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  regionId VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  code VARCHAR(16) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  createdBy VARCHAR(64) NOT NULL DEFAULT '',
  removedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_region (regionId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wifi_region_centres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  centre VARCHAR(191) NOT NULL,
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  regionId VARCHAR(40) NOT NULL,
  assignedAt VARCHAR(32) NOT NULL DEFAULT '',
  assignedBy VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_rc_centre (centre),
  KEY idx_wifi_rc_region (regionId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wifi_region_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  regionId VARCHAR(40) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  addedAt VARCHAR(32) NOT NULL DEFAULT '',
  addedBy VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_lead (regionId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wifi_profile_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  regionId VARCHAR(40) NOT NULL DEFAULT '',
  centre VARCHAR(191) NOT NULL DEFAULT '',
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  profilesJson TEXT,
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedBy VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_override (regionId, centre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wifi_gateway_daily (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gatewayId VARCHAR(40) NOT NULL,
  date VARCHAR(10) NOT NULL,
  samples INT NOT NULL DEFAULT 0,
  hoursUp INT NOT NULL DEFAULT 0,
  activePeak INT NOT NULL DEFAULT 0,
  activeSum INT NOT NULL DEFAULT 0,
  activeSamples INT NOT NULL DEFAULT 0,
  cpuMax INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_wifi_daily (gatewayId, date),
  KEY idx_wifi_daily_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_wifi_stats_hour ON wifi_gateway_stats (hour);
ALTER TABLE wifi_gateway_stats ADD COLUMN activeSamples INT NOT NULL DEFAULT 0;

INSERT INTO schema_version (version) VALUES (191) ON DUPLICATE KEY UPDATE version = version;

-- 192: Wi-Fi silence alerts and the feed's measured cost.
ALTER TABLE wifi_gateways ADD COLUMN silentAlertAt VARCHAR(32) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS wifi_feed_load (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hour VARCHAR(13) NOT NULL,
  fetches INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  msTotal BIGINT NOT NULL DEFAULT 0,
  msMax INT NOT NULL DEFAULT 0,
  bytesTotal BIGINT NOT NULL DEFAULT 0,
  memMaxKb INT NOT NULL DEFAULT 0,
  b25 INT NOT NULL DEFAULT 0,
  b50 INT NOT NULL DEFAULT 0,
  b100 INT NOT NULL DEFAULT 0,
  b250 INT NOT NULL DEFAULT 0,
  b500 INT NOT NULL DEFAULT 0,
  bOver INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_wifi_feed_load_hour (hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (192) ON DUPLICATE KEY UPDATE version = version;

-- 193: Anchor Circle joins the family account and the mentor portal.
-- (the old circle_links are marked 'moved' by NGG_MYSQL_ROW_FIXUPS in api/_lib/db.php)

INSERT INTO schema_version (version) VALUES (193) ON DUPLICATE KEY UPDATE version = version;

-- 194: Wi-Fi data used per person, and each gateway's sessions.
CREATE TABLE IF NOT EXISTS wifi_usage_daily (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectType VARCHAR(16) NOT NULL,
  subjectId VARCHAR(64) NOT NULL,
  centre VARCHAR(191) NOT NULL DEFAULT '',
  centreId VARCHAR(48) NOT NULL DEFAULT '',
  date VARCHAR(10) NOT NULL,
  bytesDown BIGINT NOT NULL DEFAULT 0,
  bytesUp BIGINT NOT NULL DEFAULT 0,
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_usage (subjectType, subjectId, date, centre),
  KEY idx_wifi_usage_centre (centre, date),
  KEY idx_wifi_usage_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wifi_usage_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gatewayId VARCHAR(40) NOT NULL,
  sessionKey VARCHAR(96) NOT NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  bytesIn BIGINT NOT NULL DEFAULT 0,
  bytesOut BIGINT NOT NULL DEFAULT 0,
  seenAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_wifi_usess (gatewayId, sessionKey),
  KEY idx_wifi_usess_seen (seenAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE wifi_gateways ADD COLUMN usageAt VARCHAR(32) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (194) ON DUPLICATE KEY UPDATE version = version;

-- 195: a router that now runs from CACENTRE (domain/wifi-cacentre.php).
ALTER TABLE wifi_gateways ADD COLUMN movedAt VARCHAR(32) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (195) ON DUPLICATE KEY UPDATE version = version;

-- 196: a member's courses as a stored fact (proposal, why, flag, inputs, confirmation)
ALTER TABLE members ADD COLUMN coursesProposed TEXT NULL;
ALTER TABLE members ADD COLUMN coursesFlag VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN coursesReason TEXT NULL;
ALTER TABLE members ADD COLUMN coursesInputs VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN coursesConfirmedAt VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN coursesConfirmedBy VARCHAR(64) NOT NULL DEFAULT '';
CREATE INDEX idx_members_courses_flag ON members (coursesFlag);
INSERT INTO schema_version (version) VALUES (196) ON DUPLICATE KEY UPDATE version = version;

-- 197: where a course leads (providers, awards, credentials), from the community-audit session's 183
CREATE TABLE IF NOT EXISTS providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  providerId VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL DEFAULT '',
  slug VARCHAR(190) NOT NULL DEFAULT '',
  country VARCHAR(80) NOT NULL DEFAULT '',
  url VARCHAR(500) NOT NULL DEFAULT '',
  free TINYINT NOT NULL DEFAULT 0,
  costNote VARCHAR(255) NOT NULL DEFAULT '',
  notes TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  position INT NOT NULL DEFAULT 0,
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_prv_status (status, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS provider_awards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  awardId VARCHAR(40) NOT NULL UNIQUE,
  providerId VARCHAR(40) NOT NULL DEFAULT '',
  title VARCHAR(255) NOT NULL DEFAULT '',
  kind VARCHAR(24) NOT NULL DEFAULT 'certificate',
  level VARCHAR(80) NOT NULL DEFAULT '',
  courses TEXT,
  url VARCHAR(500) NOT NULL DEFAULT '',
  examNote VARCHAR(500) NOT NULL DEFAULT '',
  costNote VARCHAR(255) NOT NULL DEFAULT '',
  free TINYINT NOT NULL DEFAULT 0,
  validMonths INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  position INT NOT NULL DEFAULT 0,
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_paw_provider (providerId, status, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  credId VARCHAR(40) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL DEFAULT '',
  providerId VARCHAR(40) NOT NULL DEFAULT '',
  awardId VARCHAR(40) NOT NULL DEFAULT '',
  state VARCHAR(16) NOT NULL DEFAULT 'aiming',
  grade VARCHAR(80) NOT NULL DEFAULT '',
  credentialRef VARCHAR(190) NOT NULL DEFAULT '',
  evidenceUrl VARCHAR(500) NOT NULL DEFAULT '',
  awardedOn VARCHAR(32) NOT NULL DEFAULT '',
  expiresOn VARCHAR(32) NOT NULL DEFAULT '',
  centre VARCHAR(120) NOT NULL DEFAULT '',
  centreId VARCHAR(40) NOT NULL DEFAULT '',
  note TEXT,
  recordedBy VARCHAR(64) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_mcr_one (memberId, awardId),
  KEY idx_mcr_state (state, awardedOn),
  KEY idx_mcr_centre (centre, state),
  KEY idx_mcr_centreid (centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (197) ON DUPLICATE KEY UPDATE version = version;

-- 198: one line telling the learner what to do with a lesson material
ALTER TABLE curriculum_materials ADD COLUMN guide TEXT;
INSERT INTO schema_version (version) VALUES (198) ON DUPLICATE KEY UPDATE version = version;

-- 199: the training fee's terms frozen per member; when a member's status changed
ALTER TABLE members ADD COLUMN feeTerms TEXT;
CREATE TABLE IF NOT EXISTS member_status_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  since VARCHAR(10) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT '',
  recordedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_msl_member (memberId, since, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (199) ON DUPLICATE KEY UPDATE version = version;

-- 200: powers that may be used once (every active member's fines cleared once)
CREATE TABLE IF NOT EXISTS fees_once_locks (
  lockKey VARCHAR(64) NOT NULL PRIMARY KEY,
  usedAt VARCHAR(32) NOT NULL,
  usedBy VARCHAR(64) NOT NULL,
  members INT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  digest VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (200) ON DUPLICATE KEY UPDATE version = version;

-- 201: one thank-you per volunteer per Summer School season (summer-editions.php)
CREATE TABLE IF NOT EXISTS volunteer_thanks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cohortId VARCHAR(64) NOT NULL,
  volunteerId VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  sessions INT NOT NULL DEFAULT 0,
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL,
  UNIQUE KEY idx_volthanks (cohortId, volunteerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (201) ON DUPLICATE KEY UPDATE version = version;

-- 202: a payment claim, one line per way it was paid (member-self.php)
ALTER TABLE member_requests ADD COLUMN parts TEXT NULL;
ALTER TABLE member_requests ADD COLUMN comments TEXT NULL;
INSERT INTO schema_version (version) VALUES (202) ON DUPLICATE KEY UPDATE version = version;

-- 203: push notifications (domain/push.php)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subId VARCHAR(32) NOT NULL,
  subjectKey VARCHAR(96) NOT NULL,
  endpoint TEXT NOT NULL,
  endpointHash CHAR(64) NOT NULL,
  p256dh VARCHAR(128) NOT NULL,
  auth VARCHAR(64) NOT NULL,
  surface VARCHAR(16) NOT NULL DEFAULT 'member',
  userAgent VARCHAR(255) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  lastOkAt VARCHAR(32) NOT NULL DEFAULT '',
  failCount INT NOT NULL DEFAULT 0,
  lastError VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY idx_pushsub_ep (endpointHash),
  KEY idx_pushsub_subject (subjectKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notify_prefs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectKey VARCHAR(96) NOT NULL,
  prefs TEXT NULL,
  lastActiveAt VARCHAR(32) NOT NULL DEFAULT '',
  lastSurface VARCHAR(16) NOT NULL DEFAULT '',
  mailed TEXT NULL,
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_notifyprefs_subject (subjectKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS push_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subjectKey VARCHAR(96) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  body TEXT NULL,
  url VARCHAR(512) NOT NULL DEFAULT '',
  tag VARCHAR(64) NOT NULL DEFAULT '',
  kind VARCHAR(32) NOT NULL DEFAULT '',
  topic VARCHAR(16) NOT NULL DEFAULT '',
  surface VARCHAR(16) NOT NULL DEFAULT '',
  urgent TINYINT NOT NULL DEFAULT 0,
  held TINYINT NOT NULL DEFAULT 0,
  deliverAfter VARCHAR(32) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_pushq_due (status, deliverAfter),
  KEY idx_pushq_subject (subjectKey, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE notifications ADD COLUMN groupCount INT NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN messages TEXT NULL;
INSERT INTO schema_version (version) VALUES (203) ON DUPLICATE KEY UPDATE version = version;

-- 204 (was 199 on the parallel branch): CACENTRE's locations decide NGG's centres (domain/cac-locations.php), and
-- a check-in through the gate records which location it was at.
ALTER TABLE centres ADD COLUMN cacLocationId VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE centres ADD COLUMN cacCalendar TEXT NULL;
ALTER TABLE centres ADD COLUMN cacSyncedAt VARCHAR(32) NOT NULL DEFAULT '';
CREATE INDEX idx_centres_cac ON centres (cacLocationId);
ALTER TABLE attendance ADD COLUMN centre VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE attendance ADD COLUMN centreId VARCHAR(64) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (204) ON DUPLICATE KEY UPDATE version = version;

-- 205 (was 200 on the parallel branch): the processes that wait on a person (domain/make.php) — the question
-- asked about each absence and the guardian's answer, each safeguarding flag
-- and who took it, and which Summer School dates have been announced.
CREATE TABLE IF NOT EXISTS absence_asks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(24) NOT NULL UNIQUE,
  infractionId INT NOT NULL,
  personId VARCHAR(64) NOT NULL,
  personType VARCHAR(16) NOT NULL DEFAULT 'student',
  date VARCHAR(10) NOT NULL,
  centre VARCHAR(80) NOT NULL DEFAULT '',
  centreId VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'asked',
  reason VARCHAR(16) NOT NULL DEFAULT '',
  note VARCHAR(300) NOT NULL DEFAULT '',
  channel VARCHAR(24) NOT NULL DEFAULT '',
  messageId VARCHAR(120) NOT NULL DEFAULT '',
  askedAt VARCHAR(32) NOT NULL DEFAULT '',
  answeredAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE INDEX uq_absask_infraction (infractionId),
  INDEX idx_absask_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS safeguarding_flags (
  ref VARCHAR(64) NOT NULL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT '',
  category VARCHAR(24) NOT NULL DEFAULT '',
  severity VARCHAR(16) NOT NULL DEFAULT '',
  centre VARCHAR(80) NOT NULL DEFAULT '',
  centreId VARCHAR(64) NOT NULL DEFAULT '',
  flaggedAt VARCHAR(32) NOT NULL DEFAULT '',
  ackAt VARCHAR(32) NOT NULL DEFAULT '',
  ackBy VARCHAR(80) NOT NULL DEFAULT '',
  ackChannel VARCHAR(24) NOT NULL DEFAULT '',
  ackMessageId VARCHAR(120) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS edition_milestones (
  cohortId VARCHAR(64) NOT NULL,
  milestone VARCHAR(24) NOT NULL,
  firedAt VARCHAR(32) NOT NULL DEFAULT '',
  PRIMARY KEY (cohortId, milestone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_version (version) VALUES (205) ON DUPLICATE KEY UPDATE version = version;

-- 206 (was 201 on the parallel branch) — volunteer pay (domain/volunteer-pay.php)
CREATE TABLE IF NOT EXISTS volunteer_pay (
  id INT AUTO_INCREMENT PRIMARY KEY,
  volunteerId VARCHAR(64) NOT NULL,
  day VARCHAR(10) NOT NULL,
  centre VARCHAR(120) NOT NULL DEFAULT '',
  centreId VARCHAR(64) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'earned',
  amount INT NOT NULL DEFAULT 0,
  rate INT NOT NULL DEFAULT 0,
  reason VARCHAR(40) NOT NULL DEFAULT '',
  activity VARCHAR(80) NOT NULL DEFAULT '',
  periodKey VARCHAR(16) NOT NULL DEFAULT '',
  payoutId VARCHAR(40) NOT NULL DEFAULT '',
  decidedAt VARCHAR(32) NOT NULL DEFAULT '',
  overrideBy VARCHAR(64) NOT NULL DEFAULT '',
  overrideReason VARCHAR(300) NOT NULL DEFAULT '',
  overrideAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE INDEX uq_volpay_day (volunteerId, day),
  INDEX idx_volpay_period (periodKey, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS volunteer_payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payoutId VARCHAR(40) NOT NULL,
  volunteerId VARCHAR(64) NOT NULL,
  periodKey VARCHAR(16) NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  days INT NOT NULL DEFAULT 0,
  method VARCHAR(24) NOT NULL DEFAULT '',
  reference VARCHAR(120) NOT NULL DEFAULT '',
  paidAt VARCHAR(32) NOT NULL DEFAULT '',
  paidBy VARCHAR(64) NOT NULL DEFAULT '',
  voidedAt VARCHAR(32) NOT NULL DEFAULT '',
  voidedBy VARCHAR(64) NOT NULL DEFAULT '',
  voidReason VARCHAR(300) NOT NULL DEFAULT '',
  UNIQUE INDEX uq_volpayout (payoutId),
  INDEX idx_volpayout_vol (volunteerId, periodKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_version (version) VALUES (206) ON DUPLICATE KEY UPDATE version = version;

-- ── 207 (was 202 on the parallel branch) · Volunteer programme: when it was set, and an index (from gate-lookup, where it was 122; backfill in NGG_MYSQL_ROW_FIXUPS) ──
ALTER TABLE volunteers ADD COLUMN programmeAt VARCHAR(40) DEFAULT '';
CREATE INDEX idx_vol_programme ON volunteers(programme);

INSERT INTO schema_version (version) VALUES (207) ON DUPLICATE KEY UPDATE version = version;

-- ── 208 (was 203 on the parallel branch) · Volunteer pay: bank details, and what each payout took off for fines ──
ALTER TABLE volunteers ADD COLUMN bankName VARCHAR(80) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN bankAccountNumber VARCHAR(20) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN bankAccountName VARCHAR(120) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN bankUpdatedAt VARCHAR(40) DEFAULT '';
ALTER TABLE volunteers ADD COLUMN bankUpdatedBy VARCHAR(64) DEFAULT '';
ALTER TABLE volunteer_payouts ADD COLUMN gross INT NOT NULL DEFAULT 0;
ALTER TABLE volunteer_payouts ADD COLUMN fineNgg INT NOT NULL DEFAULT 0;
ALTER TABLE volunteer_payouts ADD COLUMN fineAv INT NOT NULL DEFAULT 0;
ALTER TABLE volunteer_payouts ADD COLUMN bankLine VARCHAR(200) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (208) ON DUPLICATE KEY UPDATE version = version;

-- 209: when the attendance feed fails, nobody is punished for it (policy.php, hooks.php)
CREATE TABLE IF NOT EXISTS attendance_unmatched (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(48) NOT NULL DEFAULT '',
  refKey VARCHAR(120) NOT NULL,
  ref VARCHAR(120) NOT NULL DEFAULT '',
  token VARCHAR(120) NOT NULL DEFAULT '',
  format VARCHAR(40) NOT NULL DEFAULT '',
  value VARCHAR(120) NOT NULL DEFAULT '',
  name VARCHAR(120) NOT NULL DEFAULT '',
  date VARCHAR(10) NOT NULL,
  scannedAt VARCHAR(32) NOT NULL DEFAULT '',
  centre VARCHAR(80) NOT NULL DEFAULT '',
  centreId VARCHAR(64) NOT NULL DEFAULT '',
  action VARCHAR(8) NOT NULL DEFAULT 'in',
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  matchedId VARCHAR(64) NOT NULL DEFAULT '',
  decidedBy VARCHAR(64) NOT NULL DEFAULT '',
  decidedAt VARCHAR(32) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_attunm_ref_day (refKey, date),
  KEY idx_attunm_status (status, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS attendance_held_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date VARCHAR(10) NOT NULL,
  centre VARCHAR(80) NOT NULL DEFAULT '',
  centreId VARCHAR(64) NOT NULL DEFAULT '',
  personType VARCHAR(16) NOT NULL DEFAULT 'member',
  expected INT NOT NULL DEFAULT 0,
  present INT NOT NULL DEFAULT 0,
  why VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'held',
  logged INT NOT NULL DEFAULT 0,
  decidedBy VARCHAR(64) NOT NULL DEFAULT '',
  decidedAt VARCHAR(32) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_atthold_day (date, centre, personType),
  KEY idx_atthold_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (209) ON DUPLICATE KEY UPDATE version = version;

-- ── 210 · A held day says what did not arrive: the check-ins, or the sign-outs ──
ALTER TABLE attendance_held_days ADD COLUMN cause VARCHAR(16) NOT NULL DEFAULT 'checkin';

INSERT INTO schema_version (version) VALUES (210) ON DUPLICATE KEY UPDATE version = version;

-- ── 211 · Official notices: letterhead, subject, a WhatsApp-formatted body, sign-off; who read and acknowledged; the email queue ──
CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  noticeId VARCHAR(40) NOT NULL,
  org VARCHAR(160) NOT NULL DEFAULT '',
  kind VARCHAR(160) NOT NULL DEFAULT '',
  subject VARCHAR(300) NOT NULL DEFAULT '',
  body MEDIUMTEXT NULL,
  signoff VARCHAR(160) NOT NULL DEFAULT '',
  audience VARCHAR(80) NOT NULL DEFAULT 'all',
  reach VARCHAR(16) NOT NULL DEFAULT 'both',
  needsAck TINYINT NOT NULL DEFAULT 0,
  emailOn TINYINT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  stats TEXT NULL,
  createdBy VARCHAR(64) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  publishedBy VARCHAR(64) NOT NULL DEFAULT '',
  publishedAt VARCHAR(32) NOT NULL DEFAULT '',
  correctedBy VARCHAR(64) NOT NULL DEFAULT '',
  correctedAt VARCHAR(32) NOT NULL DEFAULT '',
  correctionNote VARCHAR(255) NOT NULL DEFAULT '',
  withdrawnBy VARCHAR(64) NOT NULL DEFAULT '',
  withdrawnAt VARCHAR(32) NOT NULL DEFAULT '',
  withdrawReason VARCHAR(255) NOT NULL DEFAULT '',
  remindedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_notices_id (noticeId),
  KEY idx_notices_status (status, publishedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notice_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  noticeId VARCHAR(40) NOT NULL,
  readerKey VARCHAR(80) NOT NULL,
  memberId VARCHAR(64) NOT NULL DEFAULT '',
  readAt VARCHAR(32) NOT NULL DEFAULT '',
  ackAt VARCHAR(32) NOT NULL DEFAULT '',
  ackName VARCHAR(160) NOT NULL DEFAULT '',
  UNIQUE KEY uq_notice_reads (noticeId, readerKey),
  KEY idx_notice_reads_member (noticeId, memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notice_mail (
  id INT AUTO_INCREMENT PRIMARY KEY,
  noticeId VARCHAR(40) NOT NULL,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_notice_mail (noticeId, email),
  KEY idx_notice_mail_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (211) ON DUPLICATE KEY UPDATE version = version;

-- ── 212 · A notice published later: when, and who set it ──
ALTER TABLE notices ADD COLUMN scheduledAt VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE notices ADD COLUMN scheduledBy VARCHAR(64) NOT NULL DEFAULT '';
CREATE INDEX idx_notices_sched ON notices (status, scheduledAt);

INSERT INTO schema_version (version) VALUES (212) ON DUPLICATE KEY UPDATE version = version;

-- ── 213 · The Saturday Formation Schedule an hour later (9:00 to 3:00) ──
-- The shift is a row change, which this file cannot carry (the replay runs only
-- CREATE / ALTER / INSERT): it is NGG_MYSQL_ROW_FIXUPS 'saturday_formation.hour_later.*'
-- in api/_lib/db.php, guarded by a marker so it moves each site's schedule once.
INSERT INTO schema_version (version) VALUES (213) ON DUPLICATE KEY UPDATE version = version;

-- ── 214 · An appeal can be against a sanction, not only a charge ──
ALTER TABLE member_requests ADD COLUMN refSanctionId INT NOT NULL DEFAULT 0;

INSERT INTO schema_version (version) VALUES (214) ON DUPLICATE KEY UPDATE version = version;

-- ── 215 · Learning outside NGG, and the kind of a recognition ──
CREATE TABLE IF NOT EXISTS learning_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entryId VARCHAR(40) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  centre VARCHAR(120) NOT NULL DEFAULT '',
  centreId VARCHAR(40) NOT NULL DEFAULT '',
  platform VARCHAR(120) NOT NULL DEFAULT '',
  providerId VARCHAR(64) NOT NULL DEFAULT '',
  title VARCHAR(200) NOT NULL DEFAULT '',
  progress VARCHAR(120) NOT NULL DEFAULT '',
  hours DECIMAL(7,2) NOT NULL DEFAULT 0,
  doneOn VARCHAR(10) NOT NULL DEFAULT '',
  link VARCHAR(500) NOT NULL DEFAULT '',
  mediaJson TEXT,
  notes TEXT,
  source VARCHAR(16) NOT NULL DEFAULT 'member',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reviewedBy VARCHAR(64) NOT NULL DEFAULT '',
  reviewedAt VARCHAR(32) NOT NULL DEFAULT '',
  reviewNote VARCHAR(500) NOT NULL DEFAULT '',
  createdBy VARCHAR(64) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_llog_entry (entryId),
  KEY idx_llog_member (memberId, doneOn),
  KEY idx_llog_status (status, centre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE awards ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT '';

INSERT INTO schema_version (version) VALUES (215) ON DUPLICATE KEY UPDATE version = version;

-- 216: dues and payment notices — what a family or the fees desk was told, and by which channels.
CREATE TABLE IF NOT EXISTS dues_notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL DEFAULT '',
  kind VARCHAR(24) NOT NULL,
  refKey VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  amount INT NOT NULL DEFAULT 0,
  dueOn VARCHAR(10) NOT NULL DEFAULT '',
  channelsJson TEXT,
  reached INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'sending',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_dues_notices (memberId, kind, refKey),
  KEY idx_dues_notices_at (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (216) ON DUPLICATE KEY UPDATE version = version;

-- 217 — Paystack's charge, borne by the family, recorded beside the invoice's own total.
ALTER TABLE membership_invoices ADD COLUMN processingFee INT NOT NULL DEFAULT 0;
INSERT INTO schema_version (version) VALUES (217) ON DUPLICATE KEY UPDATE version = version;

-- 218 — staff broadcasts shown in Community: one post per source message; a notice's Community choice.
ALTER TABLE community_posts ADD COLUMN sourceRef VARCHAR(80) NOT NULL DEFAULT '', ADD INDEX idx_community_posts_source (sourceRef);
ALTER TABLE notices ADD COLUMN communityOn TINYINT NOT NULL DEFAULT 0;
INSERT INTO schema_version (version) VALUES (218) ON DUPLICATE KEY UPDATE version = version;

-- 219 — Maths Lab: map state, profile, sessions, course enrolments.
CREATE TABLE IF NOT EXISTS mlab_state (
  id INT AUTO_INCREMENT PRIMARY KEY, memberId VARCHAR(64) NOT NULL, comp VARCHAR(16) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'none',
  p DOUBLE NOT NULL DEFAULT 0.15, attempts INT NOT NULL DEFAULT 0, correct INT NOT NULL DEFAULT 0, fast TINYINT NOT NULL DEFAULT 0,
  nextReview VARCHAR(10) NOT NULL DEFAULT '', masteredAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_mlab_state (memberId, comp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mlab_profile (
  memberId VARCHAR(64) PRIMARY KEY, xp INT NOT NULL DEFAULT 0, streak INT NOT NULL DEFAULT 0, lastDay VARCHAR(10) NOT NULL DEFAULT '',
  freezes INT NOT NULL DEFAULT 0, climbStage INT NOT NULL DEFAULT 1, climbDone TINYINT NOT NULL DEFAULT 0, momentum INT NOT NULL DEFAULT 0,
  xpDay VARCHAR(10) NOT NULL DEFAULT '', xpToday INT NOT NULL DEFAULT 0, bosses TEXT, createdAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mlab_sessions (
  sessionId VARCHAR(32) PRIMARY KEY, memberId VARCHAR(64) NOT NULL, mode VARCHAR(16) NOT NULL, ref VARCHAR(16) NOT NULL DEFAULT '',
  items MEDIUMTEXT, resp MEDIUMTEXT, startedAt VARCHAR(32) NOT NULL DEFAULT '', finishedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_mlab_sessions_member (memberId, startedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mlab_enrol (memberId VARCHAR(64) NOT NULL, courseId VARCHAR(40) NOT NULL, enrolledAt VARCHAR(32) NOT NULL DEFAULT '', UNIQUE KEY uq_mlab_enrol (memberId, courseId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (219) ON DUPLICATE KEY UPDATE version = version;

-- 220: the ledger read by date (Transactions), and periodKey wide enough for
-- the keys the code writes (fees_post shortens anything over 96 to fit).
-- MODIFY is idempotent; the index is created once by name.
ALTER TABLE member_ledger MODIFY COLUMN periodKey VARCHAR(96) DEFAULT '';
CREATE INDEX idx_mledg_created ON member_ledger (createdAt);
INSERT INTO schema_version (version) VALUES (220) ON DUPLICATE KEY UPDATE version = version;

-- 221: money that arrived and could not be applied, resolved by a person.
CREATE TABLE IF NOT EXISTS unapplied_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(120) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'paystack',
  cause VARCHAR(32) NOT NULL DEFAULT 'unapplied',
  invoiceId VARCHAR(64) DEFAULT '',
  memberId VARCHAR(64) DEFAULT '',
  amount INT NOT NULL DEFAULT 0,
  currency VARCHAR(8) DEFAULT 'NGN',
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  note VARCHAR(255) DEFAULT '',
  ledgerEntryId VARCHAR(64) DEFAULT '',
  createdAt VARCHAR(32) DEFAULT '',
  resolvedAt VARCHAR(32) DEFAULT '',
  resolvedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY uq_unapplied_ref (reference),
  KEY idx_unapplied_status (status, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (221) ON DUPLICATE KEY UPDATE version = version;

-- ── 222 · Saturday formation, versioned: main day, a centre's own, one Saturday; and Saturdays off ──
CREATE TABLE IF NOT EXISTS saturday_formation_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope VARCHAR(80) NOT NULL DEFAULT '', blockKey VARCHAR(40) NOT NULL, sort INT DEFAULT 0,
  startTime VARCHAR(5) NOT NULL, endTime VARCHAR(5) NOT NULL, title VARCHAR(160) NOT NULL, flow VARCHAR(80) DEFAULT '',
  purpose TEXT, quote TEXT, forJson MEDIUMTEXT, kind VARCHAR(16) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '', updatedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY uq_sfb (scope, blockKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO saturday_formation_blocks (scope, blockKey, sort, startTime, endTime, title, flow, purpose, quote, forJson, kind, updatedAt, updatedBy)
  SELECT '', blockKey, sort, startTime, endTime, title, flow, purpose, quote, forJson,
         CASE blockKey WHEN 'checkin' THEN 'checkin' WHEN 'musing' THEN 'mentor' WHEN 'division' THEN 'classes' WHEN 'break' THEN 'break' WHEN 'close' THEN 'close' ELSE '' END,
         updatedAt, updatedBy
    FROM saturday_formation WHERE status = 'active';
CREATE TABLE IF NOT EXISTS saturday_formation_dates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  onDate VARCHAR(10) NOT NULL, centreId VARCHAR(64) NOT NULL DEFAULT '', off TINYINT NOT NULL DEFAULT 0, note VARCHAR(300) DEFAULT '',
  updatedAt VARCHAR(40) DEFAULT '', updatedBy VARCHAR(64) DEFAULT '',
  UNIQUE KEY uq_sfd (onDate, centreId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (222) ON DUPLICATE KEY UPDATE version = version;

-- ── 223 · The registration checklist: admin-defined items, one checklist per member, verdicts, evidence and the reminder ledger ──
CREATE TABLE IF NOT EXISTS reg_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  itemId VARCHAR(40) NOT NULL, title VARCHAR(160) NOT NULL, help VARCHAR(600) NOT NULL DEFAULT '',
  evidence VARCHAR(16) NOT NULL DEFAULT 'none', presence TINYINT NOT NULL DEFAULT 0, maxAgeDays INT NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'active',
  createdAt VARCHAR(40) NOT NULL DEFAULT '', createdBy VARCHAR(64) NOT NULL DEFAULT '', updatedAt VARCHAR(40) NOT NULL DEFAULT '', updatedBy VARCHAR(64) NOT NULL DEFAULT '',
  retiredAt VARCHAR(40) NOT NULL DEFAULT '', retiredBy VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uq_rcl_item (itemId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reg_checklists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'open', done INT NOT NULL DEFAULT 0, total INT NOT NULL DEFAULT 0,
  supervisorId VARCHAR(64) NOT NULL DEFAULT '', supervisorKind VARCHAR(16) NOT NULL DEFAULT '', supervisorName VARCHAR(160) NOT NULL DEFAULT '',
  assignedAt VARCHAR(40) NOT NULL DEFAULT '', assignedBy VARCHAR(64) NOT NULL DEFAULT '', startedAt VARCHAR(40) NOT NULL DEFAULT '', startedBy VARCHAR(64) NOT NULL DEFAULT '',
  completedAt VARCHAR(40) NOT NULL DEFAULT '', updatedAt VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE KEY uq_rcl_member (memberId),
  KEY idx_rcl_sup (supervisorId, status),
  KEY idx_rcl_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reg_checklist_state (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId VARCHAR(64) NOT NULL, itemId VARCHAR(40) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'verified',
  submissionId VARCHAR(40) NOT NULL DEFAULT '', at VARCHAR(40) NOT NULL DEFAULT '', byId VARCHAR(64) NOT NULL DEFAULT '', reason VARCHAR(400) NOT NULL DEFAULT '',
  UNIQUE KEY uq_rcl_state (memberId, itemId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reg_checklist_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submissionId VARCHAR(40) NOT NULL, memberId VARCHAR(64) NOT NULL, itemKey VARCHAR(60) NOT NULL, supervisorId VARCHAR(64) NOT NULL,
  url VARCHAR(600) NOT NULL DEFAULT '', ext VARCHAR(10) NOT NULL DEFAULT '', mime VARCHAR(120) NOT NULL DEFAULT '', bytes INT NOT NULL DEFAULT 0,
  capturedOn VARCHAR(10) NOT NULL DEFAULT '', note VARCHAR(500) NOT NULL DEFAULT '', verdict VARCHAR(20) NOT NULL, reason VARCHAR(400) NOT NULL DEFAULT '',
  centreId VARCHAR(64) NOT NULL DEFAULT '', createdAt VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE KEY uq_rcl_sub (submissionId),
  KEY idx_rcl_sub (memberId, itemKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reg_checklist_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sendKey VARCHAR(160) NOT NULL, channel VARCHAR(16) NOT NULL DEFAULT '', recipient VARCHAR(190) NOT NULL DEFAULT '',
  memberId VARCHAR(64) NOT NULL DEFAULT '', sentAt VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE KEY uq_rcl_send (sendKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (223) ON DUPLICATE KEY UPDATE version = version;

-- ── 224 · NGG's printed documents: one counter per series, and every document issued ──
CREATE TABLE IF NOT EXISTS doc_serials (
  series VARCHAR(32) NOT NULL PRIMARY KEY,
  last INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  docNo VARCHAR(40) NOT NULL, kind VARCHAR(16) NOT NULL, memberId VARCHAR(64) NOT NULL DEFAULT '', sourceKey VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'issued', supersededBy VARCHAR(40) NOT NULL DEFAULT '', data MEDIUMTEXT NULL,
  token VARCHAR(40) NOT NULL, irn VARCHAR(120) NOT NULL DEFAULT '', issuedAt VARCHAR(40) NOT NULL DEFAULT '', updatedAt VARCHAR(40) NOT NULL DEFAULT '',
  UNIQUE KEY uq_doc_no (docNo), UNIQUE KEY uq_doc_source (sourceKey), UNIQUE KEY uq_doc_token (token),
  KEY idx_documents_member (memberId, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (224) ON DUPLICATE KEY UPDATE version = version;

-- ── 225 · Written rules carry frog jumps and repeat escalation, like the rulebook's own ──
ALTER TABLE conduct_rules ADD COLUMN jumps INT NOT NULL DEFAULT 0;
ALTER TABLE conduct_rules ADD COLUMN escalateAfter INT NOT NULL DEFAULT 0;
ALTER TABLE conduct_rules ADD COLUMN escalateTo VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE conduct_rules ADD COLUMN suspendDays INT NOT NULL DEFAULT 7;
ALTER TABLE conduct_rules ADD COLUMN reentryFee INT NOT NULL DEFAULT 0;

INSERT INTO schema_version (version) VALUES (225) ON DUPLICATE KEY UPDATE version = version;

-- 226: a lesson's questions answered from memory on a later day (the opening review).
ALTER TABLE curriculum_progress ADD COLUMN reviewedAt VARCHAR(32) NOT NULL DEFAULT '';
INSERT INTO schema_version (version) VALUES (226) ON DUPLICATE KEY UPDATE version = version;

-- 227: Maths Lab — a topic's lesson must be studied before practice, and a failed check or boss is owed practice before a retake.
ALTER TABLE mlab_state ADD COLUMN studiedAt VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE mlab_state ADD COLUMN owed INT NOT NULL DEFAULT 0;
INSERT INTO schema_version (version) VALUES (227) ON DUPLICATE KEY UPDATE version = version;

-- 228: the member an application became (convert claims the row; a converted application cannot be declined).
ALTER TABLE applications ADD COLUMN convertedMemberId VARCHAR(40) NOT NULL DEFAULT '';
INSERT INTO schema_version (version) VALUES (228) ON DUPLICATE KEY UPDATE version = version;

-- 229: the Labs — the climb and bosses per member per Lab; every session records its Lab.
CREATE TABLE IF NOT EXISTS mlab_track (
  memberId VARCHAR(64) NOT NULL, lab VARCHAR(16) NOT NULL, climbStage INT NOT NULL DEFAULT 1, climbDone TINYINT NOT NULL DEFAULT 0,
  momentum INT NOT NULL DEFAULT 0, bosses TEXT, createdAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_mlab_track (memberId, lab)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO mlab_track (memberId, lab, climbStage, climbDone, momentum, bosses, createdAt, updatedAt)
  SELECT memberId, 'maths', climbStage, climbDone, momentum, COALESCE(bosses, '{}'), createdAt, updatedAt FROM mlab_profile;
ALTER TABLE mlab_sessions ADD COLUMN lab VARCHAR(16) NOT NULL DEFAULT 'maths';
INSERT INTO schema_version (version) VALUES (229) ON DUPLICATE KEY UPDATE version = version;

-- 230: the Learn exam — named slips on multiple-choice options, and one row per exam sitting.
ALTER TABLE curriculum_checks ADD COLUMN whys TEXT;
CREATE TABLE IF NOT EXISTS curriculum_sittings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sittingId VARCHAR(40) NOT NULL UNIQUE,
  memberId VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'session',
  unitId VARCHAR(40) NOT NULL DEFAULT '',
  course VARCHAR(191) NOT NULL DEFAULT '',
  items MEDIUMTEXT,
  answers MEDIUMTEXT,
  confidence TEXT,
  marks MEDIUMTEXT,
  integrity TEXT,
  viva MEDIUMTEXT,
  score DOUBLE NOT NULL DEFAULT 0,
  maxScore DOUBLE NOT NULL DEFAULT 0,
  pct INT NOT NULL DEFAULT 0,
  band VARCHAR(24) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  timeLimitSec INT NOT NULL DEFAULT 0,
  startedAt VARCHAR(32) NOT NULL DEFAULT '',
  deadline VARCHAR(32) NOT NULL DEFAULT '',
  submittedAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_csit_member (memberId, kind, unitId),
  KEY idx_csit_course (course, kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (230) ON DUPLICATE KEY UPDATE version = version;

-- 231 — formal family reports and the daily attendance mail (domain/parent-reports.php)
CREATE TABLE IF NOT EXISTS parent_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reportId VARCHAR(40) NOT NULL UNIQUE,
  subjectId VARCHAR(64) NOT NULL,
  subjectType VARCHAR(16) NOT NULL DEFAULT 'member',
  kind VARCHAR(16) NOT NULL,
  period VARCHAR(32) NOT NULL,
  periodFrom VARCHAR(10) NOT NULL DEFAULT '',
  periodTo VARCHAR(10) NOT NULL DEFAULT '',
  data MEDIUMTEXT,
  issuedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_preport_key (subjectId, kind, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS report_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(24) NOT NULL,
  refKey VARCHAR(120) NOT NULL,
  recipient VARCHAR(191) NOT NULL,
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY idx_rsend_key (kind, refKey, recipient)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (231) ON DUPLICATE KEY UPDATE version = version;

-- 232: a leave request sent less than 24 hours before the day it excuses (domain/member-self.php).
ALTER TABLE member_requests ADD COLUMN shortNotice INT NOT NULL DEFAULT 0;
INSERT INTO schema_version (version) VALUES (232) ON DUPLICATE KEY UPDATE version = version;

-- 233: WhatsApp through Kapso (domain/kapso.php).
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  wamid VARCHAR(191) NOT NULL PRIMARY KEY,
  direction VARCHAR(8) NOT NULL DEFAULT 'out',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  body TEXT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT '',
  error VARCHAR(255) NOT NULL DEFAULT '',
  createdAt VARCHAR(32) NOT NULL DEFAULT '',
  updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  KEY idx_wa_phone (phone, direction, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (233) ON DUPLICATE KEY UPDATE version = version;
-- ── 234 · Who was told about an assignment, and of what ──
-- One row per assignment, member and kind; the UNIQUE key is the claim, so a
-- re-publish tells only those not yet told and a due reminder goes once.
CREATE TABLE IF NOT EXISTS assignment_notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignmentId VARCHAR(64) NOT NULL,
  memberId VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  sentAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_asg_notice (assignmentId, memberId, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_version (version) VALUES (234) ON DUPLICATE KEY UPDATE version = version;

-- ── 235 · A lesson's homework is issued once ──
-- autoKey = the lesson's unitId on an auto-issued row, NULL on a hand-set one,
-- so the UNIQUE key binds only what the curriculum issues. The backfill of
-- existing rows is NGG_MYSQL_ROW_FIXUPS 'assignments.autoKey' (api/_lib/db.php).
ALTER TABLE assignments ADD COLUMN autoKey VARCHAR(64) DEFAULT NULL;
CREATE UNIQUE INDEX uq_assign_autokey ON assignments(autoKey);
-- And the widths save keeps (ASG_CENTRE_MAX / ASG_TRACK_MAX, 80 each): the
-- columns were 32 and 64, so strict MySQL refused a longer centre or course
-- name that save accepted. MODIFY, because ADD COLUMN cannot change a width
-- (see migration 178 above); it is idempotent on a replay.
ALTER TABLE assignments MODIFY COLUMN centre VARCHAR(80);
ALTER TABLE assignments MODIFY COLUMN track VARCHAR(80);

INSERT INTO schema_version (version) VALUES (235) ON DUPLICATE KEY UPDATE version = version;

-- ── 236 · Online membership: the "NGG Online" home (docs/ONLINE-MEMBERS-PLAN.md) ──
-- A real centres row marked online, NGG only, never linked to CACENTRE. Never named "Online": that word
-- means "every member" on events.
ALTER TABLE centres ADD COLUMN online TINYINT NOT NULL DEFAULT 0;
INSERT IGNORE INTO centres (centreId, name, code, color, status, programmes, online, pageStatus, meetDays, notes, createdAt, updatedAt)
  VALUES ('CTR-ONLINE', 'NGG Online', 'ONL', '#2E6BE6', 'active', 'ngg', 1, 'draft', '', 'Online members: no building, no gate, no meeting days.', NOW(), NOW());
INSERT INTO schema_version (version) VALUES (236) ON DUPLICATE KEY UPDATE version = version;

-- ── 237 · The NGG shop: souvenirs and merchandise (domain/shop.php) ──
CREATE TABLE IF NOT EXISTS shop_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId VARCHAR(24) NOT NULL, slug VARCHAR(120) NOT NULL, name VARCHAR(120) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'Other', description TEXT, price INT NOT NULL DEFAULT 0,
  imageUrl VARCHAR(500) NOT NULL DEFAULT '', options TEXT, stock TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'draft', sort INT NOT NULL DEFAULT 100,
  createdAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT '', updatedBy VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uq_shop_product (productId), UNIQUE KEY uq_shop_slug (slug), KEY idx_shop_products_status (status, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS shop_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId VARCHAR(32) NOT NULL, token VARCHAR(64) NOT NULL,
  buyerName VARCHAR(160) NOT NULL DEFAULT '', email VARCHAR(200) NOT NULL DEFAULT '', phone VARCHAR(24) NOT NULL DEFAULT '',
  items MEDIUMTEXT, subtotal INT NOT NULL DEFAULT 0, delivery INT NOT NULL DEFAULT 0, total INT NOT NULL DEFAULT 0,
  processingFee INT NOT NULL DEFAULT 0, currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  fulfil VARCHAR(16) NOT NULL DEFAULT 'collect', centre VARCHAR(160) NOT NULL DEFAULT '', centreId VARCHAR(48) NOT NULL DEFAULT '', address VARCHAR(400) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'pending', paystackRef VARCHAR(40) NOT NULL DEFAULT '',
  paidAt VARCHAR(32) NOT NULL DEFAULT '', readyAt VARCHAR(32) NOT NULL DEFAULT '', completedAt VARCHAR(32) NOT NULL DEFAULT '',
  note VARCHAR(600) NOT NULL DEFAULT '', createdAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_shop_order (orderId), UNIQUE KEY uq_shop_token (token), KEY idx_shop_orders_status (status, id), KEY idx_shop_orders_ref (paystackRef)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (237) ON DUPLICATE KEY UPDATE version = version;

-- ── 238 · The Membership Agreement (MoU), signed online (domain/mou.php) ──
CREATE TABLE IF NOT EXISTS mou_agreements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mouId VARCHAR(32) NOT NULL, memberId VARCHAR(48) NOT NULL, version VARCHAR(16) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'awaiting_family',
  tokenHash VARCHAR(64) NOT NULL DEFAULT '', tokenExp VARCHAR(32) NOT NULL DEFAULT '', docTokenHash VARCHAR(64) NOT NULL DEFAULT '',
  termsJson TEXT, prefillJson TEXT, familyJson TEXT, memberJson TEXT,
  tripsChoice VARCHAR(12) NOT NULL DEFAULT '', quizPassedAt VARCHAR(32) NOT NULL DEFAULT '', quizAttempts INT NOT NULL DEFAULT 0,
  sentAt VARCHAR(32) NOT NULL DEFAULT '', sentTo VARCHAR(600) NOT NULL DEFAULT '', viewedAt VARCHAR(32) NOT NULL DEFAULT '',
  clientName VARCHAR(160) NOT NULL DEFAULT '', clientRel VARCHAR(16) NOT NULL DEFAULT '', clientSignature MEDIUMTEXT, clientSignedAt VARCHAR(32) NOT NULL DEFAULT '', clientIp VARCHAR(64) NOT NULL DEFAULT '',
  witnessName VARCHAR(160) NOT NULL DEFAULT '', witnessPhone VARCHAR(32) NOT NULL DEFAULT '', witnessSignature MEDIUMTEXT, witnessSignedAt VARCHAR(32) NOT NULL DEFAULT '', witnessBy VARCHAR(16) NOT NULL DEFAULT '',
  nggName VARCHAR(160) NOT NULL DEFAULT '', nggRole VARCHAR(120) NOT NULL DEFAULT '', nggById VARCHAR(48) NOT NULL DEFAULT '', nggSignature MEDIUMTEXT, nggSignedAt VARCHAR(32) NOT NULL DEFAULT '',
  docHash VARCHAR(64) NOT NULL DEFAULT '', familyMailedAt VARCHAR(32) NOT NULL DEFAULT '', finalMailedAt VARCHAR(32) NOT NULL DEFAULT '',
  voidReason VARCHAR(400) NOT NULL DEFAULT '', voidedAt VARCHAR(32) NOT NULL DEFAULT '', voidedBy VARCHAR(48) NOT NULL DEFAULT '',
  createdBy VARCHAR(48) NOT NULL DEFAULT '', createdAt VARCHAR(32) NOT NULL DEFAULT '', updatedAt VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY uq_mou (mouId), KEY idx_mou_member (memberId, status), KEY idx_mou_status (status), KEY idx_mou_token (tokenHash), KEY idx_mou_doc (docTokenHash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_version (version) VALUES (238) ON DUPLICATE KEY UPDATE version = version;
