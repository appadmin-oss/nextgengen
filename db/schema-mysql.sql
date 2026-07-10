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
  createdAt VARCHAR(40), updatedAt VARCHAR(40),
  INDEX idx_members_email (email), INDEX idx_members_centre (centre), INDEX idx_members_status (status),
  UNIQUE KEY idx_members_anchorcode (anchorCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
  title VARCHAR(255), instructions TEXT, track VARCHAR(64), sessionId VARCHAR(64),
  week INT DEFAULT 0, dueAt VARCHAR(40), points INT DEFAULT 0,
  attachmentUrl TEXT, proof VARCHAR(16) DEFAULT 'text', centre VARCHAR(32),
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
