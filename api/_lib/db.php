<?php
declare(strict_types=1);

/**
 * NGG — database layer. SQLite by default (auto-migrates), MySQL/MariaDB in
 * production (set `db.dsn` in config.php; apply db/schema-mysql.sql once).
 *
 * Column names are the SAME camelCase field names the SPA + serializers use
 * (memberId, fullName, …) so rows map straight to API payloads with no
 * translation layer. A handful of SQL-reserved words are renamed and mapped
 * back inside their domain handler (orderIndex→order, settingKey→key,
 * isPrivate→private, answerText→text).
 *
 * Bump NGG_SCHEMA_TARGET together with any new migration below AND the
 * mirrored statement in db/schema-mysql.sql.
 */

const NGG_SCHEMA_TARGET = 40;

function db_conn(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    global $CONFIG;

    $db = $CONFIG['db'] ?? [];
    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    $dsn = (string)($db['dsn'] ?? '');
    if ($dsn !== '') {
        // Production driver (MySQL/MariaDB/Postgres). Schema applied manually
        // from db/schema-mysql.sql; we don't auto-migrate non-SQLite.
        $pdo = new PDO($dsn, $db['username'] ?? null, $db['password'] ?? null, $opts);
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $pdo->exec("SET NAMES utf8mb4");
            $pdo->exec("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
            db_apply_mysql_schema($pdo);
        }
        return $pdo;
    }

    // Default: SQLite with auto-migrate.
    $path = (string)($db['sqlite_path'] ?? (__DIR__ . '/../storage/ngg.db'));
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $pdo = new PDO('sqlite:' . $path, null, null, $opts);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA synchronous = NORMAL');
    db_migrate($pdo);
    return $pdo;
}

function db_driver(): string {
    return db_conn()->getAttribute(PDO::ATTR_DRIVER_NAME);
}

/**
 * Auto-migrate MySQL by replaying db/schema-mysql.sql — the manually-maintained
 * mirror of the SQLite migrations. Hosts without SSH can't run migrations by
 * hand, so on each connection we bring the live schema up to the mirror:
 * missing tables are created and missing columns are added (the mirror declares
 * post-baseline columns as trailing `ALTER ... ADD COLUMN`, which re-run
 * harmlessly when the column already exists).
 *
 * Safety: only additive structural DDL runs (CREATE TABLE / CREATE INDEX /
 * ALTER TABLE) — never INSERT/DROP/UPDATE. Idempotency errors (table/column/key
 * already exists) are swallowed; anything unexpected is logged and does NOT
 * break the request. Gated by a content hash in schema_meta so the full replay
 * only runs when the mirror actually changes (steady state = two tiny queries).
 */
function db_apply_mysql_schema(PDO $db): void {
    global $CONFIG;
    $file = (string)($CONFIG['mysql_schema_path'] ?? (__DIR__ . '/../../db/schema-mysql.sql'));
    if (!is_file($file)) { error_log('[db] mysql schema mirror not found: ' . $file); return; }
    $sql = (string)@file_get_contents($file);
    if ($sql === '') return;
    $hash = hash('sha256', $sql);

    try {
        $db->exec("CREATE TABLE IF NOT EXISTS schema_meta (k VARCHAR(64) PRIMARY KEY, v VARCHAR(191)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $st = $db->query("SELECT v FROM schema_meta WHERE k = 'mysql_schema_hash'");
        if ($st && (string)($st->fetchColumn() ?: '') === $hash) return; // already current
    } catch (Throwable $e) {
        error_log('[db] schema_meta check: ' . $e->getMessage()); // fall through and try to apply
    }

    // Strip comments, split on ';', run additive structural DDL AND the seed
    // INSERTs. The mirror's INSERTs are all idempotent (ON DUPLICATE KEY UPDATE),
    // so replaying them is safe — excluding them previously meant no-SSH MySQL
    // hosts never got the seed rows (e.g. vol_tiers) the SQLite path installs.
    $clean = preg_replace('#/\*.*?\*/#s', '', $sql);
    $clean = preg_replace('#--[^\n]*#', '', (string)$clean);
    $allOk = true;
    foreach (explode(';', (string)$clean) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '' || !preg_match('/^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE|INSERT)\b/i', $stmt)) continue;
        try {
            $db->exec($stmt);
        } catch (Throwable $e) {
            // 1050 table exists · 1060 dup column · 1061 dup key · 1062 dup entry
            // · 1091 no such column · 1826 dup FK — all "already applied", benign.
            $code = (int)($e->errorInfo[1] ?? 0);
            if (!in_array($code, [1050, 1060, 1061, 1062, 1091, 1826], true)) {
                $allOk = false;
                error_log('[db] mysql schema stmt failed (' . $code . '): ' . substr($stmt, 0, 100) . ' — ' . $e->getMessage());
            }
        }
    }
    // Record the hash even on partial failure. The old "only on full success"
    // rule meant a single un-swallowed error (e.g. a missing ALTER privilege)
    // replayed the entire ~40-statement mirror on EVERY request forever — a
    // silent per-request performance cliff. Now a genuine failure is logged
    // loudly and flagged in schema_meta for ops, but does not loop; a fixed
    // mirror re-applies on the next deploy (its hash changes).
    try {
        $db->exec("INSERT INTO schema_meta (k, v) VALUES ('mysql_schema_hash', " . $db->quote($hash) . ") ON DUPLICATE KEY UPDATE v = VALUES(v)");
        $db->exec("INSERT INTO schema_meta (k, v) VALUES ('mysql_schema_status', " . $db->quote($allOk ? 'ok' : 'partial') . ") ON DUPLICATE KEY UPDATE v = VALUES(v)");
    } catch (Throwable $e) {
        error_log('[db] schema_meta write: ' . $e->getMessage());
    }
    if (!$allOk) error_log('[db] mysql schema applied with errors — see log; marked "partial" in schema_meta.');
}

function db_migrate(PDO $db): void {
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') return; // MySQL: manual schema file

    $db->exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");
    $current = (int)($db->query('SELECT IFNULL(MAX(version),0) FROM schema_version')->fetchColumn() ?: 0);

    $migrations = [
        1 => "
            CREATE TABLE members (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT UNIQUE NOT NULL,
              fullName TEXT, email TEXT, phone TEXT,
              type TEXT, status TEXT DEFAULT 'active', role TEXT DEFAULT 'member',
              centre TEXT, photoUrl TEXT, track TEXT, cohort TEXT,
              joinDate TEXT, dob TEXT,
              parentName TEXT, parentEmail TEXT, parentPhone TEXT, school TEXT,
              bio TEXT, socials TEXT, totpSecret TEXT, notes TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_members_email ON members(email);
            CREATE INDEX idx_members_centre ON members(centre);
            CREATE INDEX idx_members_status ON members(status);

            CREATE TABLE mentors (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT UNIQUE NOT NULL,
              fullName TEXT, email TEXT, phone TEXT, status TEXT,
              tracks TEXT, centre TEXT, bio TEXT, photoUrl TEXT,
              maxMentees INTEGER, availability TEXT,
              checkedAt TEXT, joinedAt TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE mentor_assignments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT, mentorId TEXT, track TEXT, sessionId TEXT,
              status TEXT DEFAULT 'active', startedAt TEXT, endedAt TEXT
            );
            CREATE INDEX idx_ma_member ON mentor_assignments(memberId);

            CREATE TABLE sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sessionId TEXT UNIQUE NOT NULL,
              code TEXT, year INTEGER, name TEXT,
              startDate TEXT, endDate TEXT, theme TEXT,
              isActive INTEGER DEFAULT 0, coverUrl TEXT, notes TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE anchor_missions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              missionId TEXT UNIQUE NOT NULL,
              week INTEGER, orderIndex INTEGER DEFAULT 0, theme TEXT,
              title TEXT, prompt TEXT, proof TEXT DEFAULT 'text',
              xp INTEGER DEFAULT 0, type TEXT, estimatedMin INTEGER DEFAULT 0,
              bookPage INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_missions_week ON anchor_missions(week);

            CREATE TABLE member_progress (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT, missionId TEXT, sessionId TEXT,
              status TEXT DEFAULT 'started', proofUrl TEXT,
              verifiedBy TEXT, verifiedAt TEXT, xpAwarded INTEGER DEFAULT 0,
              note TEXT, startedAt TEXT, submittedAt TEXT
            );
            CREATE INDEX idx_progress_member ON member_progress(memberId);
            CREATE UNIQUE INDEX idx_progress_unique ON member_progress(memberId, missionId, sessionId);

            CREATE TABLE member_stats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT UNIQUE NOT NULL,
              xpTotal INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
              badgeCount INTEGER DEFAULT 0, badges TEXT,
              streak INTEGER DEFAULT 0, lastActiveAt TEXT,
              currentWeek INTEGER DEFAULT 1, completedThisSession INTEGER DEFAULT 0,
              updatedAt TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              eventId TEXT UNIQUE NOT NULL,
              title TEXT, kind TEXT, sessionId TEXT,
              startAt TEXT, endAt TEXT, centre TEXT, location TEXT,
              coverUrl TEXT, body TEXT, capacity INTEGER DEFAULT 0,
              isPublic INTEGER DEFAULT 0, status TEXT DEFAULT 'draft',
              createdBy TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_events_status ON events(status);

            CREATE TABLE event_rsvps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              eventId TEXT, memberId TEXT, status TEXT,
              rsvpAt TEXT, attendedAt TEXT
            );
            CREATE UNIQUE INDEX idx_rsvp_unique ON event_rsvps(eventId, memberId);

            CREATE TABLE posts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT UNIQUE NOT NULL,
              slug TEXT, kind TEXT, title TEXT, excerpt TEXT, body TEXT,
              coverUrl TEXT, category TEXT, authorId TEXT, tags TEXT,
              status TEXT DEFAULT 'draft', publishAt TEXT,
              featured INTEGER DEFAULT 0,
              promoCta TEXT, promoUrl TEXT, promoExpires TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_posts_slug ON posts(slug);
            CREATE INDEX idx_posts_status ON posts(status);

            CREATE TABLE notifications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              notifId TEXT UNIQUE NOT NULL,
              memberId TEXT, kind TEXT, title TEXT, body TEXT,
              linkPage TEXT, readAt TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_notif_member ON notifications(memberId);

            CREATE TABLE journal (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entryId TEXT UNIQUE NOT NULL,
              memberId TEXT, sessionId TEXT, week INTEGER,
              mood TEXT, body TEXT, isPrivate INTEGER DEFAULT 1,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_journal_member ON journal(memberId);

            CREATE TABLE auth_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              token TEXT, memberId TEXT, email TEXT, otp TEXT,
              attempts INTEGER DEFAULT 0,
              createdAt TEXT, expiresAt TEXT, verifiedAt TEXT,
              ip TEXT, userAgent TEXT
            );
            CREATE INDEX idx_auth_token ON auth_sessions(token);

            CREATE TABLE audit_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              at TEXT, actorId TEXT, event TEXT, subject TEXT, ip TEXT, meta TEXT
            );
            CREATE INDEX idx_audit_at ON audit_log(at);

            CREATE TABLE settings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              settingKey TEXT UNIQUE NOT NULL,
              settingValue TEXT, updatedAt TEXT, updatedBy TEXT
            );

            CREATE TABLE newsletter (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT UNIQUE NOT NULL, source TEXT,
              status TEXT DEFAULT 'subscribed',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now')), ip TEXT
            );
        ",
        2 => "
            CREATE TABLE assignments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              assignmentId TEXT UNIQUE NOT NULL,
              title TEXT, instructions TEXT, track TEXT, sessionId TEXT,
              week INTEGER DEFAULT 0, dueAt TEXT, points INTEGER DEFAULT 0,
              attachmentUrl TEXT, proof TEXT DEFAULT 'text', centre TEXT,
              status TEXT DEFAULT 'draft', createdBy TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_assign_status ON assignments(status);

            CREATE TABLE assignment_submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              submissionId TEXT UNIQUE NOT NULL,
              assignmentId TEXT, memberId TEXT, sessionId TEXT,
              answerText TEXT, fileUrl TEXT, status TEXT DEFAULT 'submitted',
              grade INTEGER, feedback TEXT, gradedBy TEXT, gradedAt TEXT,
              submittedAt TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_sub_assignment ON assignment_submissions(assignmentId);
            CREATE UNIQUE INDEX idx_sub_unique ON assignment_submissions(assignmentId, memberId);

            CREATE TABLE applications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT, name TEXT, age INTEGER, centre TEXT, track TEXT,
              role TEXT, why TEXT, email TEXT, status TEXT DEFAULT 'new',
              createdAt TEXT DEFAULT (datetime('now')), ip TEXT
            );
            CREATE INDEX idx_apps_email ON applications(email);
        ",
        3 => "
            CREATE TABLE member_state (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              stateKey TEXT NOT NULL,
              stateValue TEXT,
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_member_state ON member_state(memberId, stateKey);
        ",
        4 => "
            ALTER TABLE applications ADD COLUMN program TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN photoUrl TEXT DEFAULT '';

            CREATE TABLE contact_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ref TEXT UNIQUE NOT NULL,
              purpose TEXT DEFAULT 'general',
              name TEXT, email TEXT, phone TEXT, subject TEXT, message TEXT,
              status TEXT DEFAULT 'new',
              createdAt TEXT DEFAULT (datetime('now')), ip TEXT
            );
            CREATE INDEX idx_contact_status ON contact_messages(status);
        ",
        5 => "
            ALTER TABLE members ADD COLUMN passwordHash TEXT DEFAULT '';
        ",
        6 => "
            ALTER TABLE mentors ADD COLUMN source TEXT DEFAULT 'ngg';
            ALTER TABLE mentors ADD COLUMN program TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN skills TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN linkedin TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN afrovanguardRef TEXT DEFAULT '';
        ",
        7 => "
            CREATE TABLE summer_cohorts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              cohortId TEXT UNIQUE NOT NULL,
              year INTEGER, name TEXT, startDate TEXT, endDate TEXT,
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE qr_codes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              token TEXT UNIQUE NOT NULL,
              batch TEXT, cohortId TEXT,
              status TEXT DEFAULT 'blank',
              studentId TEXT, assignedName TEXT,
              createdAt TEXT DEFAULT (datetime('now')), assignedAt TEXT
            );
            CREATE INDEX idx_qr_status ON qr_codes(status);
            CREATE INDEX idx_qr_cohort ON qr_codes(cohortId);

            CREATE TABLE summer_students (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              studentId TEXT UNIQUE NOT NULL,
              cohortId TEXT, token TEXT, handle TEXT,
              fullName TEXT, age INTEGER, centre TEXT, track TEXT, photoUrl TEXT,
              guardianName TEXT, guardianPhone TEXT,
              status TEXT DEFAULT 'active', notes TEXT,
              enrolledAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_sstu_cohort ON summer_students(cohortId);
            CREATE INDEX idx_sstu_handle ON summer_students(handle);
            CREATE INDEX idx_sstu_token ON summer_students(token);

            CREATE TABLE attendance (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              cohortId TEXT, studentId TEXT, token TEXT,
              date TEXT, checkInAt TEXT, method TEXT DEFAULT 'qr',
              byId TEXT, device TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_attend_unique ON attendance(studentId, date);
            CREATE INDEX idx_attend_cohort_date ON attendance(cohortId, date);
        ",
        // Archival summary — when a cohort is archived (and its granular
        // attendance optionally compressed away), the per-student totals are
        // rolled up onto the student row so the data stays reusable for the
        // NGG Club without keeping every check-in. Nullable, NULL = not archived.
        8 => "
            ALTER TABLE summer_students ADD COLUMN daysPresent INTEGER;
            ALTER TABLE summer_students ADD COLUMN attendanceRate INTEGER;
            ALTER TABLE summer_students ADD COLUMN firstSeen TEXT;
            ALTER TABLE summer_students ADD COLUMN lastSeen TEXT;
            ALTER TABLE summer_students ADD COLUMN archivedAt TEXT;
        ",
        // Anchor Circle — the consent-based, read-only link between a member and
        // their parent / teacher / mentor. anchorCode is the 6-digit invite the
        // member reads out; links carry a signed portal token's identity.
        9 => "
            ALTER TABLE members ADD COLUMN anchorCode TEXT;
            CREATE UNIQUE INDEX idx_members_anchorcode ON members(anchorCode);

            CREATE TABLE circle_links (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              linkId TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL,
              role TEXT NOT NULL,
              guardianName TEXT,
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now')),
              lastSeenAt TEXT, revokedAt TEXT
            );
            CREATE INDEX idx_circle_member ON circle_links(memberId);

            CREATE TABLE circle_confirmations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              linkId TEXT NOT NULL, memberId TEXT NOT NULL, role TEXT,
              date TEXT NOT NULL, createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_circle_conf_unique ON circle_confirmations(linkId, date);
            CREATE INDEX idx_circle_conf_member ON circle_confirmations(memberId, date);

            CREATE TABLE circle_remarks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              linkId TEXT NOT NULL, memberId TEXT NOT NULL, role TEXT,
              weekStart TEXT, text TEXT, createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_circle_remark_member ON circle_remarks(memberId);
        ",
        // Identity & security core: server-side device sessions (list/revoke,
        // new-device alerts) + account-level lockout counters.
        10 => "
            CREATE TABLE device_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sid TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL,
              ip TEXT, userAgent TEXT, uaHash TEXT,
              createdAt TEXT DEFAULT (datetime('now')),
              lastSeenAt TEXT, revokedAt TEXT
            );
            CREATE INDEX idx_devsess_member ON device_sessions(memberId);

            ALTER TABLE members ADD COLUMN failedLogins INTEGER DEFAULT 0;
            ALTER TABLE members ADD COLUMN lockedUntil TEXT;
            ALTER TABLE members ADD COLUMN lastLoginAt TEXT;
        ",
        // Integration bus: admin-configured destinations (Google Chat, signed
        // webhooks, Apps Script Sheets bridge), an event outbox and per-
        // destination deliveries with retry/backoff + a readable log.
        11 => "
            CREATE TABLE integrations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              integrationId TEXT UNIQUE NOT NULL,
              kind TEXT NOT NULL,
              name TEXT,
              config TEXT,
              events TEXT,
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE outbox (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              eventId TEXT UNIQUE NOT NULL,
              kind TEXT NOT NULL,
              payload TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_outbox_kind ON outbox(kind);

            CREATE TABLE deliveries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              eventId TEXT NOT NULL,
              integrationId TEXT NOT NULL,
              status TEXT DEFAULT 'pending',
              attempts INTEGER DEFAULT 0,
              nextAttemptAt TEXT,
              lastError TEXT,
              deliveredAt TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_deliveries_due ON deliveries(status, nextAttemptAt);
            CREATE INDEX idx_deliveries_event ON deliveries(eventId);
        ",
        // Registration stack: versioned form definitions (the builder), gated
        // registration/attendance links, parent verification + typed consents.
        12 => "
            CREATE TABLE form_defs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              formId TEXT NOT NULL,
              version INTEGER NOT NULL,
              name TEXT,
              fields TEXT,
              status TEXT DEFAULT 'live',
              publishedBy TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_formdefs_ver ON form_defs(formId, version);

            CREATE TABLE gate_links (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              gateId TEXT UNIQUE NOT NULL,
              name TEXT,
              cohortId TEXT,
              status TEXT DEFAULT 'active',
              createdBy TEXT,
              expiresAt TEXT,
              usedCount INTEGER DEFAULT 0,
              createdAt TEXT DEFAULT (datetime('now')),
              revokedAt TEXT
            );

            CREATE TABLE consents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              studentId TEXT NOT NULL,
              type TEXT NOT NULL,
              status TEXT NOT NULL,
              method TEXT,
              actorName TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_consents_student ON consents(studentId);

            ALTER TABLE summer_students ADD COLUMN parentEmail TEXT;
            ALTER TABLE summer_students ADD COLUMN regStatus TEXT DEFAULT 'verified';
            ALTER TABLE summer_students ADD COLUMN verifyToken TEXT;
            ALTER TABLE summer_students ADD COLUMN verifyExpiresAt TEXT;
            ALTER TABLE summer_students ADD COLUMN verifiedAt TEXT;
            ALTER TABLE summer_students ADD COLUMN remindedAt TEXT;
            ALTER TABLE summer_students ADD COLUMN formVersion INTEGER;
            ALTER TABLE summer_students ADD COLUMN formData TEXT;
            CREATE INDEX idx_sstu_verify ON summer_students(verifyToken);
            CREATE INDEX idx_sstu_regstatus ON summer_students(regStatus);
        ",
        // Behaviour monitor: staff observations, AI-categorised, with a
        // review workflow and wellbeing flags.
        13 => "
            CREATE TABLE behaviour_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              logId TEXT UNIQUE NOT NULL,
              subjectId TEXT NOT NULL,
              subjectName TEXT,
              cohortId TEXT,
              observerId TEXT, observerName TEXT,
              note TEXT,
              category TEXT,
              severity TEXT,
              sentiment TEXT,
              aiSource TEXT,
              status TEXT DEFAULT 'open',
              reviewedBy TEXT, reviewedAt TEXT,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_blog_subject ON behaviour_logs(subjectId);
            CREATE INDEX idx_blog_status ON behaviour_logs(status);
            CREATE INDEX idx_blog_category ON behaviour_logs(category);
        ",
        // ID cards: admin-managed centres (code + accent color drive the card)
        // and the printed display ID (CODE-YY-serial) per student.
        14 => "
            CREATE TABLE centres (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              centreId TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL,
              code TEXT NOT NULL,
              color TEXT DEFAULT '#76B043',
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_centres_code ON centres(code);

            ALTER TABLE summer_students ADD COLUMN displayId TEXT;
            CREATE INDEX idx_sstu_displayid ON summer_students(displayId);
        ",

        // Volunteer registration: structured role taxonomy on applications
        // (kind='volunteer', role admin|mentor|instructor) — instructors
        // carry the courses they can teach; a phone makes NG follow-up real.
        15 => "
            ALTER TABLE applications ADD COLUMN phone TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN courses TEXT DEFAULT '';
        ",

        // The approved volunteer roster. Approval mints VOL-YY-serial,
        // binds a check-in QR token, and the row backs /q/<token> profiles.
        16 => "
            CREATE TABLE volunteers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              volunteerId TEXT UNIQUE NOT NULL,
              applicationId INTEGER,
              fullName TEXT, email TEXT, phone TEXT DEFAULT '',
              role TEXT, courses TEXT DEFAULT '',
              token TEXT DEFAULT '', photoUrl TEXT DEFAULT '',
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_vol_email ON volunteers(email);
            CREATE INDEX idx_vol_token ON volunteers(token);
        ",

        // Safeguarding status + the service ledger's milestone certificates.
        17 => "
            ALTER TABLE volunteers ADD COLUMN safeguarding TEXT DEFAULT 'pending';

            CREATE TABLE volunteer_certs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              certId TEXT UNIQUE NOT NULL,
              volunteerId TEXT NOT NULL,
              milestone INTEGER,
              hours INTEGER,
              issuedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_certs_vol ON volunteer_certs(volunteerId);
        ",

        // Volunteer hierarchy tiers — the volunteer analogue of centres.
        // Each tier carries a code (→ the VOL-CODE-YY-serial ID prefix) and a
        // colour (→ the full-bleed volunteer card background). tierId is a
        // stable slug (VT-<role>) so the public lane roles keep matching even
        // after an admin renames/recolours a tier.
        18 => "
            CREATE TABLE vol_tiers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tierId TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL,
              code TEXT NOT NULL,
              color TEXT DEFAULT '#00225F',
              rank INTEGER DEFAULT 0,
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_vol_tiers_code ON vol_tiers(code);
            INSERT INTO vol_tiers (tierId, name, code, color, rank) VALUES
              ('VT-admin',      'Admin / Ops', 'ADM', '#00225F', 1),
              ('VT-mentor',     'Mentor',      'MEN', '#1B7F5A', 2),
              ('VT-instructor', 'Instructor',  'INS', '#B0143C', 3);
        ",

        // Photo pipeline — a governed image asset with its own lifecycle,
        // versioned per subject (student|volunteer). Free vision-AI flags
        // problems; Cloudinary does the (credit-gated) editing; a human can
        // review any edit later. Issuance is gated on an approved asset.
        19 => "
            CREATE TABLE photo_assets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              assetId TEXT UNIQUE NOT NULL,
              subjectType TEXT NOT NULL,          -- student | volunteer
              subjectId TEXT NOT NULL,
              version INTEGER DEFAULT 1,
              status TEXT DEFAULT 'captured',      -- captured|analyzing|edited|pending_review|in_review|approved|changes_requested|rejected|superseded|expired
              sourceUrl TEXT DEFAULT '',
              editedUrl TEXT DEFAULT '',
              aiScore INTEGER,
              aiProvider TEXT DEFAULT '',
              aiFindings TEXT DEFAULT '',          -- JSON {score,issues[],flags[],recommend{}}
              transforms TEXT DEFAULT '',          -- Cloudinary transform chain applied
              autoApproved INTEGER DEFAULT 0,
              claimedBy TEXT DEFAULT '', claimedAt TEXT DEFAULT '',
              reviewedBy TEXT DEFAULT '', reviewedAt TEXT DEFAULT '',
              decisionNote TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_photo_subject ON photo_assets(subjectType, subjectId);
            CREATE INDEX idx_photo_status ON photo_assets(status);
        ",

        // Gate kiosk password — an optional shared secret an admin sets on a
        // gate so field staff WITHOUT an admin login can run the desk. Stored
        // as a bcrypt hash; verifying it mints a short-lived, gate-scoped kiosk
        // session (never an admin session). centreId optionally pins a gate to
        // one centre.
        20 => "
            ALTER TABLE gate_links ADD COLUMN passHash TEXT DEFAULT '';
            ALTER TABLE gate_links ADD COLUMN centreId TEXT DEFAULT '';
        ",

        // Geo-fence — a circle (lat/lng + radius metres) mapped to a CENTRE,
        // not a device. When the master toggle is on, a walk-up's captured
        // location auto-selects the matching centre and out-of-fence attempts
        // are blocked (anti-cheat). mapSource/mapAccuracyM/mappedAt record how
        // the point was captured (on-site GPS vs entered coordinate) for audit.
        // The student row keeps the location it was registered at + the result.
        21 => "
            ALTER TABLE centres ADD COLUMN lat REAL;
            ALTER TABLE centres ADD COLUMN lng REAL;
            ALTER TABLE centres ADD COLUMN radiusM INTEGER DEFAULT 150;
            ALTER TABLE centres ADD COLUMN geofence INTEGER DEFAULT 0;
            ALTER TABLE centres ADD COLUMN mapSource TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN mapAccuracyM INTEGER;
            ALTER TABLE centres ADD COLUMN mappedAt TEXT DEFAULT '';

            ALTER TABLE summer_students ADD COLUMN regLat REAL;
            ALTER TABLE summer_students ADD COLUMN regLng REAL;
            ALTER TABLE summer_students ADD COLUMN regGeoOk INTEGER;
            ALTER TABLE summer_students ADD COLUMN regGeoDist INTEGER;
        ",

        // Guardian photo re-shoot: a stable per-student token that opens a
        // no-account page to recapture a headshot after an editor asks for a
        // retake. Minted on the first retake request.
        22 => "
            ALTER TABLE summer_students ADD COLUMN photoToken TEXT DEFAULT '';
        ",

        // Attendance-taker rotation: one volunteer per centre is on attendance
        // duty each day. Rows are the resolved/overridable daily assignment
        // (auto round-robin when absent). Plus a per-volunteer attendance-duty
        // gamification ledger (points/streak drive levels + awards).
        23 => "
            CREATE TABLE attendance_duty (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date TEXT NOT NULL,
              centre TEXT NOT NULL,
              volunteerId TEXT NOT NULL,
              source TEXT DEFAULT 'auto',
              assignedById TEXT DEFAULT '',
              completedAt TEXT DEFAULT '',
              takenCount INTEGER DEFAULT 0,
              createdAt TEXT DEFAULT (datetime('now')),
              UNIQUE (date, centre)
            );
            CREATE INDEX idx_duty_vol ON attendance_duty(volunteerId);
            CREATE INDEX idx_duty_date ON attendance_duty(date);

            CREATE TABLE volunteer_points (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              volunteerId TEXT NOT NULL,
              kind TEXT NOT NULL,
              points INTEGER DEFAULT 0,
              date TEXT DEFAULT '',
              note TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_vpoints_vol ON volunteer_points(volunteerId);
        ",

        // Broadcast audience targeting: a '*' announcement can now be scoped to
        // a centre or member type so the in-app feed matches the emailed list.
        24 => "
            ALTER TABLE notifications ADD COLUMN audience TEXT DEFAULT '';
        ",

        // 2FA backup codes (hashed, one-time) so a lost authenticator isn't a
        // hard lockout.
        25 => "
            ALTER TABLE members ADD COLUMN totpBackup TEXT DEFAULT '';
        ",

        // Student completion certificates (verifiable, like the volunteer ones)
        // + revocation for BOTH cert kinds so the public 'revoked' state is real.
        26 => "
            ALTER TABLE volunteer_certs ADD COLUMN revokedAt TEXT DEFAULT '';
            CREATE TABLE student_certs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              certId TEXT UNIQUE NOT NULL,
              studentId TEXT NOT NULL,
              cohortId TEXT DEFAULT '',
              daysPresent INTEGER DEFAULT 0,
              attendanceRate INTEGER DEFAULT 0,
              issuedAt TEXT DEFAULT (datetime('now')),
              revokedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_stucert_student ON student_certs(studentId);
        ",

        // Attendance check-OUT (optional dwell tracking) + guardian absence alerts.
        27 => "
            ALTER TABLE attendance ADD COLUMN checkOutAt TEXT DEFAULT '';
        ",

        // Per-centre capacity (0 = unlimited) → waitlist when full.
        28 => "
            ALTER TABLE centres ADD COLUMN capacity INTEGER DEFAULT 0;
        ",

        // Verified self-service email change (pending address + signed token).
        29 => "
            ALTER TABLE members ADD COLUMN pendingEmail TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN emailChangeToken TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN emailChangeExpiresAt TEXT DEFAULT '';
        ",

        // Peer interaction on posts: emoji reactions + moderated comments.
        30 => "
            CREATE TABLE post_reactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT NOT NULL, memberId TEXT NOT NULL, emoji TEXT NOT NULL,
              createdAt TEXT DEFAULT (datetime('now')),
              UNIQUE (postId, memberId)
            );
            CREATE INDEX idx_reactions_post ON post_reactions(postId);
            CREATE TABLE post_comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              commentId TEXT UNIQUE NOT NULL,
              postId TEXT NOT NULL, memberId TEXT NOT NULL, memberName TEXT DEFAULT '',
              body TEXT NOT NULL, status TEXT DEFAULT 'pending',
              createdAt TEXT DEFAULT (datetime('now')), moderatedBy TEXT DEFAULT '', moderatedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_comments_post ON post_comments(postId, status);
            CREATE INDEX idx_comments_status ON post_comments(status);
        ",

        // Donations (Paystack) + per-member extra capabilities (RBAC editor).
        31 => "
            CREATE TABLE donations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reference TEXT UNIQUE NOT NULL,
              email TEXT, name TEXT, amount INTEGER DEFAULT 0, currency TEXT DEFAULT 'NGN',
              status TEXT DEFAULT 'pending', channel TEXT DEFAULT '', message TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now')), paidAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_donations_status ON donations(status);
            ALTER TABLE members ADD COLUMN capsExtra TEXT DEFAULT '';
        ",

        // Standardised intake: structured name (first/last/other) + date of
        // birth on public applications and the volunteers they convert into.
        // Legacy `name`/`fullName` stay populated (composed) for back-compat.
        32 => "
            ALTER TABLE applications ADD COLUMN firstName TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN lastName TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN otherName TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN dob TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN firstName TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN lastName TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN otherName TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN dob TEXT DEFAULT '';
        ",

        // Self-service password reset: reuse auth_sessions for reset challenges,
        // tagged by purpose so a reset token can't be used as a plain login.
        33 => "
            ALTER TABLE auth_sessions ADD COLUMN purpose TEXT DEFAULT 'login';
        ",

        // Standardised intake: sex on every intake (applications + the
        // volunteers/summer students they convert into).
        34 => "
            ALTER TABLE applications ADD COLUMN sex TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN sex TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN sex TEXT DEFAULT '';
        ",

        // Punctuality: stamp each check-in with a status ('present'|'late') and
        // how many minutes late, computed against the per-member-type resumption
        // time in attendance settings. Nullable so pre-feature rows read blank.
        35 => "
            ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT '';
            ALTER TABLE attendance ADD COLUMN lateMinutes INTEGER DEFAULT 0;
        ",

        // Scoped admins: a JSON array of centreIds a staff member is limited to
        // (empty/NULL = unscoped, i.e. all centres — today's behaviour). Plus a
        // mentor-department tag so summer mentors can be grouped by department.
        36 => "
            ALTER TABLE members ADD COLUMN centreScope TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN department TEXT DEFAULT '';
        ",

        // Mentor stars — behaviour recognition ledger. 1..3 stars, one rating
        // per subject per day (application-guarded, like volunteer_points).
        37 => "
            CREATE TABLE member_stars (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              subjectType TEXT NOT NULL DEFAULT 'student',
              givenById TEXT NOT NULL,
              stars INTEGER NOT NULL,
              category TEXT DEFAULT '',
              note TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              date TEXT NOT NULL,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_stars_subject_date ON member_stars(subjectId, date);
            CREATE INDEX idx_stars_centre_date ON member_stars(centre, date);
        ",

        // V3 (Verbal · Vocal · Visual) weekly mentor rating + the awards ledger
        // (supersedes the volunteer-only kind='award' rows; adds subjectType +
        // a non-monetary valueNaira the Governing Council can set later).
        38 => "
            CREATE TABLE v3_scores (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              givenById TEXT NOT NULL,
              verbal INTEGER NOT NULL,
              vocal INTEGER NOT NULL,
              visual INTEGER NOT NULL,
              period TEXT NOT NULL,
              note TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_v3_subject_period ON v3_scores(subjectId, period);
            CREATE INDEX idx_v3_centre_period ON v3_scores(centre, period);

            CREATE TABLE awards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              awardId TEXT UNIQUE NOT NULL,
              subjectId TEXT NOT NULL,
              subjectType TEXT NOT NULL DEFAULT 'student',
              name TEXT NOT NULL,
              tier INTEGER DEFAULT 0,
              valueNaira INTEGER DEFAULT 0,
              period TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              note TEXT DEFAULT '',
              eligibilityStatus TEXT DEFAULT 'eligible',
              mintedAt TEXT DEFAULT (datetime('now')),
              createdBy TEXT DEFAULT ''
            );
            CREATE INDEX idx_awards_subject ON awards(subjectId);
            CREATE INDEX idx_awards_period ON awards(period);
        ",

        // Analytics dimensions: a self-reported gender on the student record
        // (M&E gender analysis — nullable, never required) and a first-class
        // `activities` ledger that carries donor-grade supporting evidence
        // (photos / videos / lesson plans / worksheets / outputs / notes) as a
        // JSON attachment array. This is what turns the platform's activity feed
        // into an auditable, exportable evidence base for research & reporting.
        39 => "
            ALTER TABLE summer_students ADD COLUMN gender TEXT DEFAULT '';

            CREATE TABLE activities (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              activityId TEXT UNIQUE NOT NULL,
              title TEXT NOT NULL,
              category TEXT DEFAULT 'lesson',
              centre TEXT DEFAULT '',
              department TEXT DEFAULT '',
              date TEXT NOT NULL,
              facilitatorId TEXT DEFAULT '',
              facilitatorName TEXT DEFAULT '',
              notes TEXT DEFAULT '',
              evidence TEXT DEFAULT '[]',
              participants INTEGER DEFAULT 0,
              createdBy TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_activities_centre_date ON activities(centre, date);
            CREATE INDEX idx_activities_category ON activities(category);
        ",

        // Volunteer deployment planning: a required home `centre` and a `faculty`
        // (the teaching group a mentor/instructor belongs to) on both the intake
        // application and the approved volunteer record, plus a `volunteer_needs`
        // ledger — the admin-set target headcount per centre × role (optionally
        // per faculty) that powers the public /v-status fulfilment board.
        40 => "
            ALTER TABLE volunteers ADD COLUMN centre TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN faculty TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN faculty TEXT DEFAULT '';

            CREATE TABLE volunteer_needs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              centreId TEXT NOT NULL,
              role TEXT NOT NULL,
              faculty TEXT DEFAULT '',
              needCount INTEGER DEFAULT 0,
              updatedAt TEXT DEFAULT (datetime('now')),
              updatedBy TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_vneeds_unique ON volunteer_needs(centreId, role, faculty);
            CREATE INDEX idx_vneeds_centre ON volunteer_needs(centreId);
        ",
    ];

    foreach ($migrations as $v => $sql) {
        if ($v <= $current) continue;
        $db->beginTransaction();
        try {
            $db->exec($sql);
            $db->exec("INSERT INTO schema_version (version) VALUES ($v)");
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
}

// ── Query helpers ────────────────────────────────────────────────────────

function db_insert(string $table, array $data): int {
    $cols = array_keys($data);
    $ph = array_fill(0, count($cols), '?');
    $sql = 'INSERT INTO ' . $table . ' (' . implode(',', $cols) . ') VALUES (' . implode(',', $ph) . ')';
    db_conn()->prepare($sql)->execute(array_values($data));
    return (int)db_conn()->lastInsertId();
}

function db_update(string $table, array $data, array $where): int {
    $set = []; $vals = [];
    foreach ($data as $k => $v) { $set[] = "$k = ?"; $vals[] = $v; }
    $wh = []; foreach ($where as $k => $v) { $wh[] = "$k = ?"; $vals[] = $v; }
    $sql = 'UPDATE ' . $table . ' SET ' . implode(',', $set) . ' WHERE ' . implode(' AND ', $wh);
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($vals);
    return $stmt->rowCount();
}

/** Cross-driver insert-or-update. $conflict = unique/PK column(s). */
function db_upsert(string $table, array $insert, array $conflict, array $update): void {
    $cols = array_keys($insert);
    $ph = implode(',', array_fill(0, count($cols), '?'));
    $vals = array_values($insert);
    $set = []; foreach ($update as $k => $v) { $set[] = "$k = ?"; $vals[] = $v; }
    $head = 'INSERT INTO ' . $table . ' (' . implode(',', $cols) . ') VALUES (' . $ph . ') ';
    if (db_driver() === 'mysql') {
        $sql = $head . 'ON DUPLICATE KEY UPDATE ' . implode(', ', $set);
    } else {
        $sql = $head . 'ON CONFLICT(' . implode(',', $conflict) . ') DO UPDATE SET ' . implode(', ', $set);
    }
    db_conn()->prepare($sql)->execute($vals);
}

function db_row(string $sql, array $params = []): ?array {
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function db_all(string $sql, array $params = []): array {
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function db_exec(string $sql, array $params = []): int {
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}
