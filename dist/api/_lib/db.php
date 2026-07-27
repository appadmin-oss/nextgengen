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

const NGG_SCHEMA_TARGET = 60;

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
            db_run_seeds($pdo);
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
    db_run_seeds($pdo);
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

    // Run additive structural DDL AND the seed INSERTs. The mirror's INSERTs are
    // all idempotent (ON DUPLICATE KEY UPDATE), so replaying them is safe —
    // excluding them previously meant no-SSH MySQL hosts never got the seed rows
    // (e.g. vol_tiers) the SQLite path installs. Statement splitting and the
    // "already applied" test are shared with the SQLite migrator (see below).
    $allOk = true;
    foreach (db_split_sql($sql) as $stmt) {
        if (!preg_match('/^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE|INSERT)\b/i', $stmt)) continue;
        try {
            $db->exec($stmt);
        } catch (Throwable $e) {
            if (!db_ddl_already_applied($db, $e)) {
                $allOk = false;
                error_log('[db] mysql schema stmt failed (' . (int)($e->errorInfo[1] ?? 0) . '): ' . substr($stmt, 0, 100) . ' — ' . $e->getMessage());
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

// ── Migration engine: shared, driver-aware, idempotent ────────────────────
//
// One set of primitives powers BOTH the SQLite auto-migrator and the MySQL
// mirror replay, so "already applied" is handled identically everywhere and a
// re-run can never error. Everything here is additive DDL only — nothing drops
// or rewrites data.

/** Split a SQL script into individual statements. Comments are stripped and
 *  blank fragments dropped. Our migrations contain no semicolons inside string
 *  literals or trigger bodies (verified), so a plain split on ';' is correct
 *  and keeps the splitter dependency-free. */
function db_split_sql(string $sql): array {
    $sql = preg_replace('#/\*.*?\*/#s', '', $sql);        // block comments
    $sql = preg_replace('#--[^\n]*#', '', (string)$sql);   // line comments
    $out = [];
    foreach (explode(';', (string)$sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt !== '') $out[] = $stmt;
    }
    return $out;
}

/** True when a DDL error just means "this change is already in place" — the
 *  benign re-run of an additive migration, not a real failure. Recognises both
 *  MySQL numeric codes and SQLite's message text so the two drivers behave the
 *  same. */
function db_ddl_already_applied(PDO $db, Throwable $e): bool {
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        // 1050 table exists · 1060 dup column · 1061 dup key · 1062 dup entry
        // · 1091 no such column/key to drop · 1826 dup FK.
        return in_array((int)($e->errorInfo[1] ?? 0), [1050, 1060, 1061, 1062, 1091, 1826], true);
    }
    // SQLite reports these as message text. "unique constraint failed" covers a
    // seed INSERT whose row is already present — the exact analogue of MySQL's
    // 1062 (dup entry) above, so a migration that also seeds rows replays clean.
    $m = strtolower($e->getMessage());
    foreach (['duplicate column name', 'already exists', 'unique constraint failed'] as $frag) {
        if (strpos($m, $frag) !== false) return true;
    }
    return false;
}

/** Does a column already exist? Powers the idempotent DDL helpers below so a
 *  new migration can guard its own ALTERs. Identifiers come from our own
 *  migrations (never user input) but are validated regardless. */
function db_column_exists(PDO $db, string $table, string $col): bool {
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) return false;
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        foreach ($db->query("PRAGMA table_info(\"$table\")") as $r) if (($r['name'] ?? '') === $col) return true;
        return false;
    }
    $st = $db->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    $st->execute([$table, $col]);
    return (bool)$st->fetchColumn();
}

/** Does a table already exist? */
function db_table_exists(PDO $db, string $table): bool {
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) return false;
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $st = $db->prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1");
    } else {
        $st = $db->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    }
    $st->execute([$table]);
    return (bool)$st->fetchColumn();
}

/** Add a column only if it isn't already there — the clean primitive for future
 *  migrations. Self-healing whether the DB is fresh, half-migrated or already
 *  current. $def is the definition minus the name (e.g. "TEXT DEFAULT ''"). */
function db_add_column(PDO $db, string $table, string $col, string $def): void {
    if (!preg_match('/^[A-Za-z0-9_]+$/', $table) || !preg_match('/^[A-Za-z0-9_]+$/', $col)) {
        throw new InvalidArgumentException("db_add_column: bad identifier ($table.$col)");
    }
    if (db_column_exists($db, $table, $col)) return;
    $db->exec("ALTER TABLE $table ADD COLUMN $col $def");
}

/** Fail fast on a malformed migration ladder: keys must be a contiguous 1..N
 *  and N must equal NGG_SCHEMA_TARGET. Catches the two classic mistakes — a
 *  duplicate array key silently dropping a migration, and forgetting to bump
 *  the target after adding one. Loud in dev/CLI/tests; logged in prod so a live
 *  site degrades gracefully instead of 500ing on a mismatched constant. */
function db_assert_migration_ladder(array $migrations): void {
    global $CONFIG;
    $keys = array_keys($migrations);
    $n = count($keys);
    if ($keys === range(1, max(1, $n)) && $n === NGG_SCHEMA_TARGET) return;
    $msg = '[db] invalid migration ladder: keys=[' . implode(',', $keys) . '] count=' . $n
         . ' target=' . NGG_SCHEMA_TARGET . ' — keys must be contiguous 1..N and N must equal NGG_SCHEMA_TARGET.';
    if (!empty($CONFIG['debug']) || PHP_SAPI === 'cli') throw new RuntimeException($msg);
    error_log($msg);
}

/**
 * One-time, driver-agnostic DATA seeds — settings-gated so each runs once per
 * database, on both SQLite and MySQL (the schema DDL paths only do structural
 * changes; this touches data). Kept tiny, idempotent and non-fatal.
 *
 * Seed `academy_v1`: drop the auto-generated (never human-edited) public forms
 * so they re-create from the CURRENT code defaults on next use. This is how a
 * refreshed course/faculty catalogue reaches a deployment whose forms were
 * already lazily initialised from the old defaults. Admin-published forms
 * (publishedBy != 'system') are untouched.
 */
function db_run_seeds(PDO $db): void {
    try {
        if (!function_exists('setting_raw') || !db_table_exists($db, 'form_defs') || !db_table_exists($db, 'settings')) return;
        if (setting_raw('seed_academy_v1') !== '1') {
            $db->exec("DELETE FROM form_defs WHERE status = 'live' AND publishedBy = 'system' AND formId IN ('summer-reg', 'volunteer')");
            setting_set('seed_academy_v1', '1', 'system');
        }
    } catch (Throwable $e) {
        error_log('[db] seed: ' . $e->getMessage());
    }
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

        // Site-visibility consent — explicit opt-in to feature a person's photo +
        // first name publicly (the status boards / website). For students this is
        // recorded in the `consents` ledger (type 'site_visibility') via the parent
        // verification flow; for volunteers it's a flag on the intake + roster.
        41 => "
            ALTER TABLE applications ADD COLUMN visibilityConsent INTEGER DEFAULT 0;
            ALTER TABLE volunteers ADD COLUMN visibilityConsent INTEGER DEFAULT 0;
        ",

        // Real centre management — the admin-facing detail an operator needs to
        // run a centre: where it is (address/area), who leads it (a volunteer),
        // how to reach it (phone/email), when it meets, and free-form notes.
        // Address + area + schedule also feed the public status boards' "find
        // us" cards; the lead shows PII-safe (handle unless they consented).
        42 => "
            ALTER TABLE centres ADD COLUMN address TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN area TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN leadVolunteerId TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN phone TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN email TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN meetDays TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN meetTime TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN notes TEXT DEFAULT '';
        ",

        // Material (item) needs — a centre's non-headcount needs: laptops,
        // instruments, chairs, data, etc. Unlike volunteer needs (filled from
        // the live roster), items have no roster, so the received count is
        // tracked directly. Powers the /v-status materials-needed section.
        43 => "
            CREATE TABLE item_needs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              centreId TEXT NOT NULL,
              item TEXT NOT NULL,
              needCount INTEGER DEFAULT 0,
              filledCount INTEGER DEFAULT 0,
              unit TEXT DEFAULT '',
              note TEXT DEFAULT '',
              updatedAt TEXT DEFAULT (datetime('now')),
              updatedBy TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_ineeds_unique ON item_needs(centreId, item);
            CREATE INDEX idx_ineeds_centre ON item_needs(centreId);
        ",

        // Per-centre WhatsApp group invite link — shown to an applicant right
        // after they submit, matched to the centre they picked.
        44 => "ALTER TABLE centres ADD COLUMN whatsappUrl TEXT DEFAULT '';",

        // Public profile enrichment: member projects (work put into the world)
        // and mentor notes (only isPublic=1 ever leaves the server). Keyed by
        // (subjectType, subjectId) so one model serves students AND volunteers.
        45 => "
            CREATE TABLE profile_projects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectType TEXT NOT NULL,
              subjectId TEXT NOT NULL,
              title TEXT NOT NULL,
              kind TEXT DEFAULT '',
              url TEXT DEFAULT '',
              imageUrl TEXT DEFAULT '',
              sortOrder INTEGER DEFAULT 0,
              createdBy TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_pproj_subject ON profile_projects(subjectType, subjectId);

            CREATE TABLE profile_notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectType TEXT NOT NULL,
              subjectId TEXT NOT NULL,
              author TEXT DEFAULT '',
              note TEXT NOT NULL,
              isPublic INTEGER DEFAULT 0,
              createdBy TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_pnote_subject ON profile_notes(subjectType, subjectId);
        ",

        // Public centre pages — the immersive, publicly-addressable landing
        // page for each Summer School centre (/centres/<slug>). slug drives the
        // URL; pageStatus gates public visibility; the rest is page content: a
        // giant hero image of a model, a tagline/headline, a story, a gallery.
        46 => "
            ALTER TABLE centres ADD COLUMN slug TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN pageStatus TEXT DEFAULT 'draft';
            ALTER TABLE centres ADD COLUMN tagline TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN headline TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN heroImageUrl TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN heroImageMobileUrl TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN story TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN gallery TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN pageUpdatedAt TEXT DEFAULT '';
            CREATE INDEX idx_centres_slug ON centres(slug);
        ",

        // Hero image focal position for the public centre page — a CSS
        // object-position string ('center bottom', '50% 20%', …) so admins can
        // position the giant hero image directly from the site.
        47 => "ALTER TABLE centres ADD COLUMN heroPosition TEXT DEFAULT 'center bottom';",

        // Community 2.0 — a social feed organised into channels (summer academy
        // courses + a Commons). Members post text with an optional image/video;
        // reactions, threaded comments, bookmarks. All UGC is AI-screened +
        // admin-moderatable (safeguarding for minors).
        48 => "
            CREATE TABLE community_channels (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              channelId TEXT UNIQUE NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL,
              kind TEXT DEFAULT 'course',
              faculty TEXT DEFAULT '',
              icon TEXT DEFAULT '',
              color TEXT DEFAULT '#3b5bdb',
              description TEXT DEFAULT '',
              sortOrder INTEGER DEFAULT 0,
              pinned INTEGER DEFAULT 0,
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_cchan_status ON community_channels(status);

            CREATE TABLE community_posts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT UNIQUE NOT NULL,
              channelId TEXT NOT NULL,
              authorId TEXT NOT NULL,
              authorName TEXT DEFAULT '',
              authorCentre TEXT DEFAULT '',
              body TEXT DEFAULT '',
              mediaType TEXT DEFAULT 'none',
              mediaUrl TEXT DEFAULT '',
              mediaPoster TEXT DEFAULT '',
              altText TEXT DEFAULT '',
              status TEXT DEFAULT 'published',
              pinned INTEGER DEFAULT 0,
              moderation TEXT DEFAULT '',
              viewCount INTEGER DEFAULT 0,
              createdAt TEXT DEFAULT (datetime('now')),
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_cpost_chan ON community_posts(channelId, status);
            CREATE INDEX idx_cpost_author ON community_posts(authorId);

            CREATE TABLE community_reactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              emoji TEXT NOT NULL,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_creact_unique ON community_reactions(postId, memberId);

            CREATE TABLE community_comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              commentId TEXT UNIQUE NOT NULL,
              postId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              memberName TEXT DEFAULT '',
              body TEXT NOT NULL,
              status TEXT DEFAULT 'published',
              moderation TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now')),
              moderatedBy TEXT DEFAULT '',
              moderatedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_ccomment_post ON community_comments(postId, status);

            CREATE TABLE community_bookmarks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_cbook_unique ON community_bookmarks(postId, memberId);
        ",

        // Community: public Showcase (admin-featured posts) + member reporting.
        49 => "
            ALTER TABLE community_posts ADD COLUMN featured INTEGER DEFAULT 0;
            ALTER TABLE community_posts ADD COLUMN reportCount INTEGER DEFAULT 0;
            CREATE TABLE community_reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              targetType TEXT DEFAULT 'post',
              targetId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              reason TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX idx_creport_target ON community_reports(targetType, targetId);
        ",

        // Community: polls (a post kind) + one-vote-per-member ballots.
        50 => "
            ALTER TABLE community_posts ADD COLUMN kind TEXT DEFAULT 'post';
            ALTER TABLE community_posts ADD COLUMN pollOptions TEXT DEFAULT '';
            CREATE TABLE community_poll_votes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              choice INTEGER NOT NULL,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_cpoll_unique ON community_poll_votes(postId, memberId);
        ",

        // Community: per-member per-channel read state (Slack-style unreads).
        51 => "
            CREATE TABLE community_reads (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              channelId TEXT NOT NULL,
              lastReadAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_cread_unique ON community_reads(memberId, channelId);
        ",
        52 => "
            ALTER TABLE community_channels ADD COLUMN rules TEXT DEFAULT '';
        ",
        53 => "
            CREATE TABLE community_stars (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              postId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_cstar_unique ON community_stars(postId, memberId);
        ",
        54 => "
            ALTER TABLE community_posts ADD COLUMN linkPreview TEXT DEFAULT '';
        ",
        // Desk-password lifecycle: when it was last set, how often it should
        // roll, and where to send the new one when it rolls unattended.
        55 => "
            ALTER TABLE gate_links ADD COLUMN passSetAt TEXT DEFAULT '';
            ALTER TABLE gate_links ADD COLUMN passRotateDays INTEGER DEFAULT 0;
            ALTER TABLE gate_links ADD COLUMN passNotify TEXT DEFAULT '';
        ",
        // Password expiry is a different policy from rotation: rotation
        // REPLACES a password on schedule, expiry KILLS it on schedule.
        56 => "
            ALTER TABLE gate_links ADD COLUMN passExpiryDays INTEGER DEFAULT 0;
            ALTER TABLE gate_links ADD COLUMN passExpiresAt TEXT DEFAULT '';
        ",

        // Institutional Policy enforcement. Two layers, deliberately separate:
        // infractions are FACTS (one per person per kind per day, hence the
        // unique index — a re-scan or a re-run of the nightly sweep must not
        // become a second strike), sanctions are CONSEQUENCES derived from
        // them. `tier` is the count that triggered a sanction, so issuing is
        // idempotent across re-evaluation.
        57 => "
            CREATE TABLE infractions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              personId TEXT NOT NULL, personType TEXT DEFAULT 'student',
              kind TEXT NOT NULL, date TEXT NOT NULL,
              note TEXT DEFAULT '', byId TEXT DEFAULT '',
              voidedAt TEXT DEFAULT '', voidedBy TEXT DEFAULT '', voidReason TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_infr_unique ON infractions(personId, kind, date);
            CREATE INDEX idx_infr_date ON infractions(date);

            CREATE TABLE sanctions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              personId TEXT NOT NULL, personType TEXT DEFAULT 'student',
              kind TEXT NOT NULL, tier INTEGER DEFAULT 0,
              reason TEXT DEFAULT '', amount INTEGER DEFAULT 0,
              startsAt TEXT DEFAULT '', endsAt TEXT DEFAULT '',
              status TEXT DEFAULT 'active', note TEXT DEFAULT '',
              issuedBy TEXT DEFAULT '', issuedAt TEXT DEFAULT '',
              clearedAt TEXT DEFAULT '', clearedBy TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_sanc_unique ON sanctions(personId, kind, tier);
            CREATE INDEX idx_sanc_person ON sanctions(personId, status);
        ",

        // Punctuality gained a third state. `status` was present|late measured
        // against the resumption time; the blueprint's Part VI redline is a
        // later, separate threshold, so status is now present|tardy|late and
        // `redline` records the breach that actually accrues an infraction.
        // Legacy rows keep redline = 0: nobody is retroactively sanctioned by
        // a deploy. halfDay marks a scan that missed the Musing Period.
        58 => "
            ALTER TABLE attendance ADD COLUMN redline INTEGER DEFAULT 0;
            ALTER TABLE attendance ADD COLUMN halfDay INTEGER DEFAULT 0;
        ",

        // Community sign-in stamp. Students and volunteers hold an ID card but
        // no member account, so the community's headcount had no way to see
        // them and reported the `members` table alone. Enrolment is not
        // membership: this records the people who actually turned up.
        59 => "
            ALTER TABLE summer_students ADD COLUMN communityAt TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN communityAt TEXT DEFAULT '';
        ",

        // Structured child name, matching what applications and volunteers
        // already carry (migration 32). Registration asked for one 'Full name'
        // box and everything downstream guessed: the ID card split on spaces
        // and took the LAST word as the surname, so 'Chidi Okonkwo-Eze Bello'
        // printed the wrong name, and a family that entered surname-first got
        // it backwards on a card that is expensive to reprint.
        // `fullName` stays populated and authoritative for existing rows and
        // for search; these are the parts, backfilled below on the same split
        // the card used, so nothing regresses and new intake is exact.
        60 => "
            ALTER TABLE summer_students ADD COLUMN firstName TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN lastName TEXT DEFAULT '';
            UPDATE summer_students
               SET firstName = CASE WHEN instr(trim(fullName), ' ') > 0
                                    THEN substr(trim(fullName), 1, instr(trim(fullName), ' ') - 1)
                                    ELSE trim(fullName) END
             WHERE firstName = '' AND trim(COALESCE(fullName, '')) != '';
            UPDATE summer_students
               SET lastName = trim(replace(trim(fullName), firstName, ''))
             WHERE lastName = '' AND firstName != '' AND trim(fullName) != firstName;
        ",
    ];

    // Guard the ladder before touching the DB (contiguous keys, target matches).
    db_assert_migration_ladder($migrations);

    foreach ($migrations as $v => $sql) {
        if ($v <= $current) continue;
        // SQLite has transactional DDL, so a migration applies all-or-nothing:
        // an interrupted run rolls back and simply replays next time. Each
        // statement tolerates "already applied", so a partially-applied or
        // pre-existing schema self-heals instead of throwing.
        $db->beginTransaction();
        try {
            foreach (db_split_sql($sql) as $stmt) {
                try {
                    $db->exec($stmt);
                } catch (Throwable $e) {
                    if (!db_ddl_already_applied($db, $e)) throw $e; // real error → bubble
                }
            }
            $db->exec("INSERT OR IGNORE INTO schema_version (version) VALUES ($v)");
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw new RuntimeException("migration $v failed: " . $e->getMessage(), (int)$e->getCode(), $e);
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
