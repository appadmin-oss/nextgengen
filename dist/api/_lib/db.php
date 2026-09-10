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

const NGG_SCHEMA_TARGET = 112;

/**
 * Backfill for migration 109 — recover a member's level from the note the
 * importer wrote before `level` was a column.
 *
 * Named separately from the fixup table below because the SQLite ladder needs
 * it too (step 109); everything else in that table is MySQL-only, because
 * SQLite already ran the equivalent through its own versioned migration.
 *
 * INSTR/SUBSTR/UPPER mean the same thing in SQLite and MySQL. The pattern is
 * the one members-import.php writes: "Level B" opening the fenced block.
 */
const NGG_BACKFILL_MEMBER_LEVELS = "
    UPDATE members SET level = UPPER(SUBSTR(notes, INSTR(notes, 'Level ') + 6, 1))
     WHERE (level IS NULL OR level = '')
       AND INSTR(notes, '[roster-import]') > 0
       AND INSTR(notes, 'Level ') > 0
";

/**
 * Migrations that have to touch existing ROWS, for MySQL.
 *
 * db_apply_mysql_schema() replays db/schema-mysql.sql but executes only
 * CREATE / ALTER / INSERT. An UPDATE placed in that file is therefore read,
 * skipped and silently never applied — while the SAME migration does run on
 * SQLite through the versioned ladder. Seven had accumulated there, so on
 * every MySQL deployment these columns were added and left empty:
 *
 *   60  the summer_students name split          → firstName / lastName blank
 *   62  the ID-card 90-day expiry               → expiresAt blank (never expires)
 *   78  sex, unified from the older `gender`    → sex blank, analytics "Not recorded"
 *   93  notifiedAt on published community rows  → blank
 *   109 the member level backfill               → level blank
 *
 * They live here instead, where the replay cannot drop them. Three rules for
 * anything added to this table:
 *
 *  1. **Guarded.** Every one matches only rows that have not had it applied,
 *     because this runs once per deploy (whenever the mirror's hash changes)
 *     rather than once ever. There is no version bookkeeping to lean on.
 *  2. **Ordered.** They run top to bottom; the lastName split reads the
 *     firstName the statement above it wrote.
 *  3. **Additive.** Filling a blank, never rewriting a value somebody set.
 *
 * The key is what it touches, and is used in the log line when a statement
 * changes rows — so a deploy that finally applies a years-old backfill says so
 * rather than doing it silently.
 */
const NGG_MYSQL_ROW_FIXUPS = [
    /* 60 — one "Full name" box, split into the parts the ID card needs. */
    'summer_students.firstName' => "
        UPDATE summer_students
           SET firstName = CASE WHEN LOCATE(' ', TRIM(fullName)) > 0
                                THEN SUBSTRING(TRIM(fullName), 1, LOCATE(' ', TRIM(fullName)) - 1)
                                ELSE TRIM(fullName) END
         WHERE firstName = '' AND TRIM(COALESCE(fullName, '')) != ''
    ",
    'summer_students.lastName' => "
        UPDATE summer_students
           SET lastName = TRIM(REPLACE(TRIM(fullName), firstName, ''))
         WHERE lastName = '' AND firstName != '' AND TRIM(fullName) != firstName
    ",
    /* 62 — a summer card is a season pass, not a life membership.
     *
     * The date is taken with SUBSTR before the arithmetic, and the shape is
     * checked in the WHERE. This project stores timestamps as ISO-8601 text in
     * VARCHAR columns ("2026-08-27T08:56:44Z" — see now_iso()). SQLite's
     * datetime() parses that; MySQL's DATE_ADD does not, and under
     * STRICT_ALL_TABLES it raises 1292 rather than returning NULL. The version
     * of this statement that sat in the mirror passed the whole string
     * straight to DATE_ADD, so it would have thrown on the first row had it
     * ever run — being skipped is the only reason nobody found out.
     *
     * The REGEXP guard is not belt-and-braces either: one unparseable
     * timestamp must not abort the fixup pass for every other table.
     *
     * Note what applying this late means: a card assigned more than 90 days
     * ago gets an expiry date in the past, and summer_scan_checkin() then
     * refuses it with `id_expired`. That is the migration doing what it says,
     * but on a host where it has never run it lands as a change in behaviour
     * rather than as a no-op. The log line below is how you see it happen. */
    'qr_codes.expiresAt' => "
        UPDATE qr_codes
           SET expiresAt = DATE_FORMAT(
                 DATE_ADD(SUBSTR(COALESCE(NULLIF(assignedAt,''), createdAt), 1, 10), INTERVAL 90 DAY), '%Y-%m-%d')
         WHERE expiresAt = '' AND status = 'assigned'
           AND SUBSTR(COALESCE(NULLIF(assignedAt,''), createdAt), 1, 10) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ",
    /* 78 — `sex` is the single fact; `gender` stays but is copied across. */
    'summer_students.sex' => "
        UPDATE summer_students SET sex = gender
         WHERE (sex IS NULL OR sex = '') AND gender IS NOT NULL AND gender != ''
    ",
    /* 93 — everything already live has had whatever notifications it was going
       to get. Stamping them is what stops a hide-and-reapprove on an old post
       notifying people about a conversation from months ago. */
    'community_posts.notifiedAt' => "
        UPDATE community_posts SET notifiedAt = createdAt
         WHERE status = 'published' AND (notifiedAt IS NULL OR notifiedAt = '')
    ",
    'community_comments.notifiedAt' => "
        UPDATE community_comments SET notifiedAt = createdAt
         WHERE status = 'published' AND (notifiedAt IS NULL OR notifiedAt = '')
    ",
    /* 109 — the member level, out of the importer's note. */
    'members.level' => NGG_BACKFILL_MEMBER_LEVELS,
];

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
    /* SQLite allows one writer at a time. WITHOUT a busy timeout, a writer that
     * finds the database locked fails INSTANTLY with SQLITE_BUSY — it does not
     * wait, it errors. With a hundred centres checking children in and out at
     * the same moment that is the single likeliest source of "it just failed"
     * during a busy morning, and it is a hard error in the middle of somebody's
     * registration rather than a slow one.
     *
     * Ten seconds is generous on purpose: every write here is milliseconds, so
     * the timeout is only ever reached if something is genuinely wedged, and
     * waiting is always better than failing a child's check-in. */
    $pdo->exec('PRAGMA busy_timeout = 10000');
    // Readers do not block the writer in WAL mode, but they do hold the shared
    // cache; a bigger page cache keeps a hot board off the disk entirely.
    $pdo->exec('PRAGMA cache_size = -20000');   // ~20MB, negative = KiB
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

    /* ONE request replays the mirror. The rest carry on.
     *
     * This is the deploy stampede, and it takes a site down rather than slowing
     * it. The moment the mirror's hash changes, EVERY in-flight request sees a
     * stale hash and every one of them starts replaying ~200 statements of DDL.
     * MySQL takes a metadata lock per ALTER, so they serialise: the first is slow,
     * the tenth waits for nine others, and PHP-FPM's pool fills with requests
     * that are all doing the same work. From the outside every page and every API
     * call simply hangs — which is exactly what a browser reports as "504
     * Offline and not cached" once a service worker gives up on it.
     *
     * GET_LOCK with a zero timeout: whoever gets it applies the schema, everybody
     * else returns immediately and runs against the schema as it is. That is safe
     * because this mirror is additive-only — a request that runs one deploy's
     * worth of statements behind is reading tables that already exist — and the
     * next request after the holder finishes sees the new hash and skips.
     *
     * Fails open. A host without GET_LOCK (or a permission problem) gets the old
     * behaviour rather than no schema at all. */
    $lockName = 'ngg_schema_' . substr($hash, 0, 16);
    $holdsLock = false;
    try {
        $q = $db->query("SELECT GET_LOCK(" . $db->quote($lockName) . ", 0)");
        $got = $q ? $q->fetchColumn() : null;
        // 1 = acquired, 0 = somebody else has it, NULL = error.
        if ($got !== null && (int)$got === 0) return;      // another request is applying it
        $holdsLock = ($got !== null);
    } catch (Throwable $e) {
        error_log('[db] schema lock unavailable, applying without it: ' . $e->getMessage());
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
    /* Data fixups the mirror cannot carry — see NGG_MYSQL_ROW_FIXUPS.
     *
     * Reached only when the mirror's hash changed, i.e. once per deploy, and
     * every statement is guarded so the runs after the first match nothing.
     * A statement that DID change rows is logged with its count: several of
     * these are years old and have never run on a MySQL host, so the first
     * deploy after this lands is the one where they finally apply. */
    foreach (NGG_MYSQL_ROW_FIXUPS as $what => $stmt) {
        try {
            $n = $db->exec($stmt);
            if ($n) error_log("[db] mysql row fixup {$what}: {$n} row(s) backfilled");
        } catch (Throwable $e) {
            $allOk = false;
            error_log("[db] mysql row fixup {$what} failed: " . $e->getMessage());
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
    if ($holdsLock) {
        // Released explicitly. A connection-scoped lock would be freed when the
        // request ends anyway, but a persistent PDO connection outlives it.
        try { $db->exec("DO RELEASE_LOCK(" . $db->quote($lockName) . ")"); } catch (Throwable $e) {}
    }
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
        /* Seed `dob_v1`: the intake form now asks for a date of birth instead of
         * an age. Auto-generated forms are dropped so they rebuild from the
         * current defaults — the same mechanism academy_v1 uses, and the only way
         * the change reaches a deployment whose form was lazily created from the
         * old defaults years ago.
         *
         * Admin-PUBLISHED forms are deliberately untouched: somebody edited those
         * on purpose, and silently rewriting their questions is not this seed's
         * business. Those keep asking for age, which still works — the record
         * derives age from dob when it is given and falls back to the typed age
         * when it is not. */
        if (setting_raw('seed_dob_v1') !== '1') {
            $db->exec("DELETE FROM form_defs WHERE status = 'live' AND publishedBy = 'system' AND formId = 'summer-reg'");
            setting_set('seed_dob_v1', '1', 'system');
        }
        /* Seed `fees_cap_v1`: the dues ledger used to gate on the `people` cap;
         * it now has its own `fees` capability so financial write is separable
         * from the member desk (audit M4). super_admin holds `fees` by role. To
         * avoid locking out anyone who administered fees BEFORE the split, grant
         * `fees` (as a capsExtra extra) to every existing non-super_admin account
         * whose effective caps already include `people`. Idempotent and driver-
         * agnostic; skips accounts that already have it. */
        if (setting_raw('seed_fees_cap_v1') !== '1'
            && db_table_exists($db, 'members')
            && function_exists('member_effective_caps')) {
            foreach (db_all("SELECT id, role, capsExtra FROM members") as $r) {
                if (strtolower((string)($r['role'] ?? '')) === 'super_admin') continue; // holds 'fees' by role
                $caps = member_effective_caps($r);
                if (!in_array('people', $caps, true)) continue; // only those who had fee access
                if (in_array('fees', $caps, true)) continue;    // already granted
                $extra = safe_json((string)($r['capsExtra'] ?? ''));
                if (!is_array($extra)) $extra = [];
                $extra[] = 'fees';
                $extra = array_values(array_unique(array_filter(array_map('strval', $extra))));
                db_update('members', ['capsExtra' => json_encode($extra, JSON_UNESCAPED_SLASHES), 'updatedAt' => now_iso()], ['id' => $r['id']]);
            }
            setting_set('seed_fees_cap_v1', '1', 'system');
        }
    } catch (Throwable $e) {
        error_log('[db] seed: ' . $e->getMessage());
    }
}

function db_migrate(PDO $db): void {
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') return; // MySQL: manual schema file

    $db->exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");
    $current = (int)($db->query('SELECT IFNULL(MAX(version),0) FROM schema_version')->fetchColumn() ?: 0);
    /* Nothing to do is the normal case — every request after the first deploy.
     * Returning here skips building sixty-odd migration strings, asserting the
     * ladder and looping over all of them, on every single request. */
    if ($current === NGG_SCHEMA_TARGET) return;

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

        // A consent record with no signature is a note that someone ticked a
        // box. These hold the drawn signature the parent actually made, the
        // name they signed under and when — so the printed record is evidence
        // rather than an assertion, which is the whole point of the document.
        61 => "
            ALTER TABLE consents ADD COLUMN signatureUrl TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN consentSignatureUrl TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN consentSignedName TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN consentSignedAt TEXT DEFAULT '';
        ",

        // ID cards expire. A summer card is a season pass, not a life
        // membership: a child who left in August must not still open a gate in
        // March. Set when the card is assigned, from the admin's validity
        // window, and backfilled here for cards already in circulation so the
        // rule applies to the whole estate rather than only to new issues.
        62 => "
            ALTER TABLE qr_codes ADD COLUMN expiresAt TEXT DEFAULT '';
            UPDATE qr_codes
               SET expiresAt = substr(datetime(COALESCE(NULLIF(assignedAt,''), createdAt), '+90 days'), 1, 10)
             WHERE expiresAt = '' AND status = 'assigned';
        ",

        // Which programme a mentor actually serves. `source` already existed
        // but means where the mentor CAME FROM (ngg / afrovanguard), not who
        // they supervise — using it to scope a roster would conflate the two.
        // Defaults to 'summer' because that is exactly what every existing
        // mentor already sees: mentor_roster only ever read summer_students,
        // so this preserves today's behaviour precisely rather than silently
        // handing anyone a cohort they did not have yesterday.
        63 => "ALTER TABLE mentors ADD COLUMN programme TEXT DEFAULT 'summer';",

        // The Arcade — server-graded mini games in the community.
        //
        // `arcade_rounds` holds the answer key, which is the whole point: the
        // client is sent questions and never answers, so a score cannot be
        // manufactured by editing the page. `startedMs` is what the speed
        // bonus is computed from — a client-reported duration would be the
        // first thing anyone changed. `submittedAt` closes a round for good,
        // so nobody submits, reads their mistakes, and submits again.
        //
        // `programme` on the score row is what keeps the Club and the Summer
        // School off each other's boards; they are different cohorts of
        // different ages and a shared ranking would be neither fair nor
        // meaningful.
        64 => "
            CREATE TABLE arcade_rounds (
              roundId TEXT PRIMARY KEY,
              playerId TEXT NOT NULL,
              game TEXT NOT NULL,
              tier INTEGER DEFAULT 1,
              answerKey TEXT NOT NULL,
              seconds INTEGER NOT NULL,
              startedAt TEXT NOT NULL,
              startedMs INTEGER NOT NULL DEFAULT 0,
              submittedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_arcade_rounds_player ON arcade_rounds(playerId, game);
            CREATE INDEX idx_arcade_rounds_started ON arcade_rounds(startedAt);

            CREATE TABLE arcade_scores (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              roundId TEXT NOT NULL,
              playerId TEXT NOT NULL,
              playerType TEXT DEFAULT '',
              programme TEXT DEFAULT '',
              game TEXT NOT NULL,
              score INTEGER NOT NULL DEFAULT 0,
              correct INTEGER DEFAULT 0,
              total INTEGER DEFAULT 0,
              ms INTEGER DEFAULT 0,
              centre TEXT DEFAULT '',
              date TEXT NOT NULL,
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX idx_arcade_score_round ON arcade_scores(roundId);
            CREATE INDEX idx_arcade_score_board ON arcade_scores(programme, game, date);
            CREATE INDEX idx_arcade_score_player ON arcade_scores(playerId, game);
        ",

        /* Indexes for the queries a hundred centres actually make.
         *
         * Measured on a 20k-student, 200k-attendance database, the query
         * planner was doing this:
         *
         *   per-centre enrolment   SCAN summer_students + temp b-tree
         *   per-centre attendance  SCAN the whole attendance index
         *
         * `attendance` was indexed on (cohortId, date) and (studentId, date),
         * neither of which a bare `WHERE date = ?` can seek on — and "what
         * happened today" is the most-asked question in the system. `centre`
         * had no index at all, so every per-centre figure on the public board
         * read the entire student table.
         *
         * Four indexes, all on read paths that run on every board refresh;
         * writes here are single rows and pay almost nothing for them. */
        65 => "
            CREATE INDEX IF NOT EXISTS idx_attend_date ON attendance(date);
            CREATE INDEX IF NOT EXISTS idx_sstu_centre ON summer_students(centre);
            CREATE INDEX IF NOT EXISTS idx_sstu_status_centre ON summer_students(status, centre);
            CREATE INDEX IF NOT EXISTS idx_sstu_cohort_reg ON summer_students(cohortId, regStatus);
        ",

        /* The instructor's record of teaching.
         *
         * A mentor observes character across a centre; an instructor observes
         * learning inside one course, with the same twenty children twice a
         * week. Stars answer "how did they behave today" and nothing in the
         * system answered "can this child do the thing I taught them".
         *
         * course_sessions — one row per course per centre per day. This is
         * what makes an instructor's screen a CLASS rather than a list of
         * children, and everything else hangs off it. Attendance is already
         * recorded at the gate, so the log stores only the EXCEPTIONS the
         * instructor corrected: a child the scanner missed, or one who left.
         * Storing the roll itself would fork the truth.
         *
         * student_remarks — a running thread per child. Deliberately not a
         * behaviour_log: those are one classified observation with a review
         * workflow, and stars are capped at one per child per day. A remark
         * has no cap because "she finally got recursion" and "he was quiet
         * again" are both worth writing on the same afternoon.
         *
         * skill_marks — one row per child per course per named competency,
         * latest level wins. Four levels, no numbers: a grade invites a
         * ranking, and this is meant to say what a child can now do.
         */
        66 => "
            CREATE TABLE course_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sessionLogId TEXT NOT NULL UNIQUE,
              course TEXT NOT NULL,
              centre TEXT NOT NULL,
              date TEXT NOT NULL,
              instructorId TEXT NOT NULL,
              instructorName TEXT DEFAULT '',
              covered TEXT DEFAULT '',
              roomScore INTEGER DEFAULT 0,
              presentCount INTEGER DEFAULT 0,
              absentCount INTEGER DEFAULT 0,
              markedPresent TEXT DEFAULT '',
              markedAbsent TEXT DEFAULT '',
              createdAt TEXT,
              updatedAt TEXT
            );
            CREATE UNIQUE INDEX idx_csess_slot ON course_sessions(course, centre, date);
            CREATE INDEX idx_csess_instructor ON course_sessions(instructorId, date);
            CREATE INDEX idx_csess_date ON course_sessions(date);

            CREATE TABLE student_remarks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              remarkId TEXT NOT NULL UNIQUE,
              subjectId TEXT NOT NULL,
              subjectName TEXT DEFAULT '',
              subjectType TEXT DEFAULT 'student',
              course TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              authorId TEXT NOT NULL,
              authorName TEXT DEFAULT '',
              authorRole TEXT DEFAULT '',
              kind TEXT NOT NULL,
              body TEXT NOT NULL,
              category TEXT DEFAULT '',
              severity TEXT DEFAULT '',
              aiSource TEXT DEFAULT '',
              safeguarding INTEGER DEFAULT 0,
              status TEXT DEFAULT 'open',
              acknowledgedBy TEXT DEFAULT '',
              acknowledgedAt TEXT DEFAULT '',
              createdAt TEXT
            );
            CREATE INDEX idx_remark_subject ON student_remarks(subjectId, id);
            CREATE INDEX idx_remark_author ON student_remarks(authorId, createdAt);
            CREATE INDEX idx_remark_flag ON student_remarks(safeguarding, status);
            CREATE INDEX idx_remark_centre ON student_remarks(centre, createdAt);

            CREATE TABLE skill_marks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              course TEXT NOT NULL,
              skill TEXT NOT NULL,
              level INTEGER NOT NULL DEFAULT 1,
              markedById TEXT DEFAULT '',
              markedByName TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              updatedAt TEXT
            );
            CREATE UNIQUE INDEX idx_skill_one ON skill_marks(subjectId, course, skill);
            CREATE INDEX idx_skill_course ON skill_marks(course, centre);
            CREATE INDEX idx_skill_marker ON skill_marks(markedById, updatedAt);
        ",

        /* The operations journal — what broke, and whether the background work
         * is still running.
         *
         * Both were invisible. Handler exceptions went to
         * api/logs/php-error.log, a file nobody at a youth programme is going
         * to SSH in and read, so the first report of anything failing came
         * from a centre phoning to say the desk was down. And the web-cron is
         * driven by ordinary traffic through a shutdown hook that swallows
         * everything — if it stopped, parent reminders and integration
         * deliveries simply stopped with it and nothing said so.
         *
         * ROLLED UP BY SIGNATURE, which is the whole design. An error journal
         * that appends a row per occurrence turns one broken endpoint into
         * tens of thousands of rows — the outage writes a second outage. One
         * row per (kind, source, message) with a count and a last-seen is
         * bounded by the number of DISTINCT faults, which is small even when
         * the fault count is not.
         */
        67 => "
            CREATE TABLE ops_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              source TEXT NOT NULL,
              message TEXT NOT NULL DEFAULT '',
              detail TEXT DEFAULT '',
              hits INTEGER NOT NULL DEFAULT 1,
              firstAt TEXT NOT NULL,
              lastAt TEXT NOT NULL,
              clearedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_ops_sig ON ops_events(kind, source, message);
            CREATE INDEX idx_ops_recent ON ops_events(kind, lastAt);
        ",

        /* Lead mentors, and the link back to the person's own account.
         *
         * `rank` — a lead mentor runs a centre rather than a class. A mentor
         * with a department sees that department; a lead sees every child at
         * the centre and the activity of the mentors working there, because
         * "who has gone quiet at Egbeda" is their job and not head office's.
         *
         * `memberId` / `volunteerId` — a mentor record was matched to the
         * signed-in person ONLY by email. That works until someone signs in
         * with an ID card, which carries no email at all, and it silently
         * pairs two different people who share a mailbox. Promoting a member
         * or a volunteer now records which record they are, and the email
         * match stays as the fallback for mentors who predate this.
         */
        68 => "
            ALTER TABLE mentors ADD COLUMN rank TEXT DEFAULT 'mentor';
            ALTER TABLE mentors ADD COLUMN memberId TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN volunteerId TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_mentors_member ON mentors(memberId);
            CREATE INDEX IF NOT EXISTS idx_mentors_volunteer ON mentors(volunteerId);
            CREATE INDEX IF NOT EXISTS idx_mentors_centre_rank ON mentors(centre, rank);
        ",

        /* Self-registration, and the desk that checks it.
         *
         * Until now a child could only be registered by staff standing at a
         * gate. That is one queue, at one table, at one centre, on one
         * morning — and it is why registration day is the bottleneck it is.
         *
         * `gate_links.kind` splits the one link type into three, because they
         * are three different doors and sharing a password between them is
         * how a public link ends up opening a staff desk:
         *   desk   — staff register on a child's behalf (today's behaviour)
         *   self   — the public link, no password, the family fills it in
         *   review — staff check what came in through the public link, with
         *            its OWN password
         *
         * A self-registration lands as regStatus 'self_pending': not yet a
         * registration, not yet rejected, and deliberately not counted as one
         * anywhere until a human has looked at it. Only on approval does it
         * become 'parent_pending' and trigger the guardian's email — so an
         * unreviewed submission can never send a family anything.
         */
        69 => "
            ALTER TABLE gate_links ADD COLUMN kind TEXT DEFAULT 'desk';
            CREATE INDEX IF NOT EXISTS idx_gate_kind ON gate_links(kind, status);

            ALTER TABLE summer_students ADD COLUMN submittedVia TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN photoCheck TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN reviewedById TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN reviewedAt TEXT DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN reviewNote TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_sstu_reg_centre ON summer_students(regStatus, centre);
        ",

        /* Idempotent intake — so a retry is safe.
         *
         * Nothing in the intake path carried a submission key, which made every
         * retry a gamble: either it created a second child, or it tripped the
         * name+parent-contact duplicate heuristic and stopped with a warning
         * about a registration that had in fact worked. That is why a timeout
         * was so expensive — the honest advice after one was "ask an admin
         * whether this went through", which is not advice a family can act on.
         *
         * The client mints a submissionId once, when the form is opened, and
         * carries it on every attempt. The UNIQUE index is the lock: a request
         * claims the key before doing the work, so two concurrent submissions
         * cannot both register. A completed row replays its stored result
         * verbatim, so retry #2 returns the same studentId retry #1 created
         * rather than a second child.
         *
         * Only SUCCESS is retained. A refusal releases the key, because a
         * family correcting a validation error resubmits with the SAME id and
         * must not be handed the old refusal forever.
         */
        70 => "
            CREATE TABLE IF NOT EXISTS intake_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                submissionId TEXT UNIQUE NOT NULL,
                op TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                resultJson TEXT DEFAULT '',
                createdAt TEXT DEFAULT '',
                completedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_intake_status ON intake_submissions(status, createdAt);
        ",

        /* The Programme Journal — the record of the programme's own story.
         *
         * The community has channels, posts, reactions and moderation, which is
         * conversation: fast, and gone. What it had no way to hold was the
         * durable record — the advice that was given, the contribution somebody
         * made, the issue that was raised and how it actually resolved. Those
         * were living in WhatsApp threads and in people's memory, which means
         * that when a coordinator leaves, so does the institutional history.
         *
         * `visibility` defaults to 'staff' on purpose. An entry naming a child
         * must not become member- or world-readable because somebody forgot a
         * dropdown; widening is an explicit, audited act.
         *
         * `shareToken` mints a public link, but resolution is checked against
         * the CURRENT visibility, so narrowing an entry kills every link already
         * sent — the same revocable-credential model as the gate links.
         *
         * `status` exists because an issue is not merely recorded, it is tracked
         * to a resolution; a journal of open problems nobody closed is a list,
         * not a record.
         */
        71 => "
            CREATE TABLE IF NOT EXISTS program_journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entryId TEXT UNIQUE NOT NULL,
                title TEXT DEFAULT '',
                body TEXT DEFAULT '',
                kind TEXT DEFAULT 'note',
                status TEXT DEFAULT 'open',
                visibility TEXT DEFAULT 'staff',
                authorId TEXT DEFAULT '',
                authorName TEXT DEFAULT '',
                centreId TEXT DEFAULT '',
                occurredAt TEXT DEFAULT '',
                mediaJson TEXT DEFAULT '',
                shareToken TEXT DEFAULT '',
                pinned INTEGER DEFAULT 0,
                createdAt TEXT DEFAULT '',
                updatedAt TEXT DEFAULT '',
                archivedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_pj_vis ON program_journal(visibility, occurredAt);
            CREATE INDEX IF NOT EXISTS idx_pj_kind ON program_journal(kind, status);
            CREATE INDEX IF NOT EXISTS idx_pj_share ON program_journal(shareToken);

            CREATE TABLE IF NOT EXISTS program_journal_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entryId TEXT NOT NULL,
                personId TEXT NOT NULL,
                personKind TEXT DEFAULT 'member',
                personName TEXT DEFAULT '',
                role TEXT DEFAULT 'involved',
                createdAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pjt_unique ON program_journal_tags(entryId, personId);
            CREATE INDEX IF NOT EXISTS idx_pjt_person ON program_journal_tags(personId);
        ",

        /* Date of birth, asked instead of age.
         *
         * An age typed into a box is wrong within months and cannot be
         * corrected without asking the family again — and every age band, every
         * cohort comparison and every safeguarding rule downstream is computed
         * from it. A date of birth is a fact that stays true; the age is derived
         * from it on the way in, so nothing downstream changes.
         *
         * `age` is kept and still populated. It is read in a dozen places, and
         * recomputing it everywhere would be a much larger change than this
         * needs to be.
         */
        72 => "
            ALTER TABLE summer_students ADD COLUMN dob TEXT DEFAULT '';
        ",
        /* When we last ASKED a family for a photo we do not have.
         *
         * Registrations that arrived before the image store existed lost their
         * headshot at submit time — the bytes were discarded and cannot be
         * recovered, so the only fix is to ask those families again. That has to
         * be a bounded, resumable operation: a coordinator with two hundred
         * affected children will press the button, lose the connection, and
         * press it again, and none of those families should be emailed twice.
         *
         * Its own column rather than reusing `remindedAt`, which means "we
         * chased the consent" — one would silently reset the other and the
         * roster's waiting-time column would start lying.
         */
        73 => "
            ALTER TABLE summer_students ADD COLUMN photoAskedAt TEXT DEFAULT '';
        ",
        /* 74: the analyst chat.
         *
         * A thread per conversation and a row per turn. Persisted rather than
         * kept in the browser for three reasons that all matter here: the answer
         * cost real money to produce and should not evaporate on a refresh; a
         * question one coordinator asked is usually a question the next one has
         * too; and an answer that was acted on has to remain auditable — with
         * the evidence fingerprint it was grounded in, so "the numbers have moved
         * since" is a statement the screen can make rather than a guess.
         *
         * No column here holds a child. The question is scrubbed before it is
         * stored, on the same gate that scrubs it before it is sent. */
        74 => "
            CREATE TABLE IF NOT EXISTS insight_threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                threadId TEXT NOT NULL UNIQUE,
                title TEXT DEFAULT '',
                ownerId TEXT NOT NULL,
                centre TEXT DEFAULT '',
                rangeLabel TEXT DEFAULT '',
                turns INTEGER DEFAULT 0,
                createdAt TEXT, updatedAt TEXT, archivedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ithreads_owner ON insight_threads (ownerId, updatedAt);
            CREATE TABLE IF NOT EXISTS insight_turns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                threadId TEXT NOT NULL,
                seq INTEGER NOT NULL,
                askedById TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT DEFAULT '',
                planJson TEXT DEFAULT '',
                claimsJson TEXT DEFAULT '',
                checksJson TEXT DEFAULT '',
                evidenceFp TEXT DEFAULT '',
                rangeLabel TEXT DEFAULT '',
                status TEXT DEFAULT 'ok',
                error TEXT DEFAULT '',
                providers TEXT DEFAULT '',
                tokens INTEGER DEFAULT 0,
                ms INTEGER DEFAULT 0,
                createdAt TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_iturns_seq ON insight_turns (threadId, seq);
        ",
        /* 75: which member of staff recorded a consent.
         *
         * A consent given on paper at a desk and a consent a parent clicked in
         * an email are not the same evidence, and the ledger already separates
         * them by `method`. What it could not say was WHO took the paper one —
         * and that is the first question a safeguarding review asks, because an
         * in-person consent is only as good as the person who witnessed it.
         * Empty for every row written by the parent link, where the actor is the
         * parent and is already named. */
        75 => "
            ALTER TABLE consents ADD COLUMN recordedById TEXT DEFAULT '';
        ",
        /* 76: ID card designs, as data.
         *
         * The card artwork was code — the layout lived in JSX and only the data
         * varied per child, so changing where the QR sits meant a deploy. A
         * template is the same document with the layout moved into the row.
         *
         * `schemaJson` is the whole design; it is deliberately one column rather
         * than a table of elements, because a design is only ever read and
         * written whole and an element table would buy joins we never make.
         *
         * `version` increments on publish and a print run records the version it
         * used, so a card can be reproduced exactly a year later — which is the
         * difference between a design tool and a credential system. */
        76 => "
            CREATE TABLE IF NOT EXISTS card_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                templateId TEXT UNIQUE,
                name TEXT,
                kind TEXT DEFAULT 'student',
                status TEXT DEFAULT 'draft',
                version INTEGER DEFAULT 1,
                schemaJson TEXT DEFAULT '',
                publishedJson TEXT DEFAULT '',
                createdById TEXT DEFAULT '',
                updatedById TEXT DEFAULT '',
                createdAt TEXT,
                updatedAt TEXT,
                publishedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ctpl_kind ON card_templates (kind, status);
        ",
        /* 77: the design asset library.
         *
         * Placed images were data: URLs written into the design itself, and a
         * design is capped at 512KB — so a 1600px photograph, which is 400KB of
         * JPEG and 548KB once base64-encoded, could not be saved AT ALL. A
         * poster with a photo on it failed with `too_large` and the work was
         * lost. This is that bug's fix and the right architecture regardless:
         * bytes live once, designs reference them, and the same logo used on ten
         * posters is stored once rather than ten times.
         *
         * `sha` is the content hash, so re-uploading the same file finds the
         * existing row instead of making a second copy. `storeId` is set when
         * the bytes are on this server and empty when they are in the cloud —
         * both are just a URL to a design, which is what lets a deployment
         * switch between them without touching a single template. */
        77 => "
            CREATE TABLE IF NOT EXISTS design_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assetId TEXT UNIQUE,
                name TEXT DEFAULT '',
                url TEXT DEFAULT '',
                storeId TEXT DEFAULT '',
                sha TEXT DEFAULT '',
                mime TEXT DEFAULT '',
                width INTEGER DEFAULT 0,
                height INTEGER DEFAULT 0,
                bytes INTEGER DEFAULT 0,
                folder TEXT DEFAULT '',
                uploadedById TEXT DEFAULT '',
                createdAt TEXT,
                archivedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_dasset_sha ON design_assets (sha);
            CREATE INDEX IF NOT EXISTS idx_dasset_folder ON design_assets (folder, archivedAt);
        ",
        /* 78 — one sex column for a child, and an index to disaggregate on it.
         *
         * THE BUG THIS FIXES, exactly: `summer_students` grew a `sex` column in
         * migration 34 and a `gender` column in migration 39, for the same fact.
         * Nothing in the product ever wrote either one — the registration form
         * did not ask — while the analytics workspace read `gender` and produced
         * a gender panel in which every child was "Not recorded", for every
         * cohort this system has ever run. It looked correct in the test suite
         * because the fixtures insert `gender` directly.
         *
         * That is not a cosmetic gap. Every serious education funder asks for
         * outcomes disaggregated by sex, and without it this programme cannot
         * answer whether girls and boys who attend the same centre learn the
         * same amount — which is the entire question a fund like the Gender and
         * Learning Evidence Fund exists to ask.
         *
         * `sex` becomes the single fact. `gender` is left in place rather than
         * dropped (a DROP COLUMN on a live shared host, against a column some
         * report may still name, is a worse risk than a dead column) and is
         * copied into `sex` where `sex` is empty, so no answer already given is
         * lost. person_sex() in util.php is the one reader from here on. */
        78 => "
            UPDATE summer_students SET sex = gender
             WHERE (sex IS NULL OR sex = '') AND gender IS NOT NULL AND gender != '';
            CREATE INDEX IF NOT EXISTS idx_sstu_sex ON summer_students (sex);
            CREATE INDEX IF NOT EXISTS idx_vol_sex ON volunteers (sex);
        ",
        /* 79 — the analyst's answer as DATA, not only as prose.
         *
         * "Attendance fell nine points at Ayobo" is a claim a reader takes on
         * trust. The same finding as three tiles, a four-point series and a
         * ranked table is one they can check at a glance and paste into a board
         * paper without retyping — and retyping is how a caveated finding
         * arrives without its caveat.
         *
         * Stored alongside the prose rather than derived on read, because the
         * blocks are grounded against the evidence AS IT STOOD, and a turn
         * re-checked against next week's figures would silently change its
         * mind about what was verified. */
        79 => "ALTER TABLE insight_turns ADD COLUMN dataJson TEXT",
        /* 80 — the school grade, and with it the transition window.
         *
         * Stored as a NUMBER on the international ladder (Primary 1–6 = 1–6,
         * JSS 1–3 = 7–9, SSS 1–3 = 10–12) while the form asks in the words a
         * Lagos parent uses. Ask locally, store globally: a funder's
         * eligibility rule is written "grades 7 to 9" and a VARCHAR holding
         * "JSS2", "Jss 2" and "J.S.S 2" is something somebody maps by hand the
         * week a proposal is due.
         *
         * `gradeAsAt` because a grade AGES and a date of birth does not. A
         * child registered in Primary 4 in June is in Primary 5 by September,
         * and reporting them as Primary 4 two years later is not a rounding
         * error — it is a false statement about eligibility to a funder. The
         * date it was recorded travels with it so every reader can say "as at
         * registration" rather than assume it.
         *
         * The index is on the level because every question this exists to serve
         * — how many children are at the transition point, and how do they
         * differ by sex — filters on a range of it. */
        80 => "
            ALTER TABLE summer_students ADD COLUMN gradeLevel INTEGER DEFAULT 0;
            ALTER TABLE summer_students ADD COLUMN gradeAsAt TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_sstu_grade ON summer_students (gradeLevel);
        ",
        /* 81 — a real learning measurement, with a baseline and an endline.
         *
         * Grades from `assignment_submissions` are coursework: different tasks,
         * different markers, different difficulty week to week. A trend across
         * them is not a learning gain and cannot be defended as one. What a
         * funder means by "we measured learning" is the same instrument
         * administered twice to the same children, and the difference computed
         * per child.
         *
         * Three tables because they are three different things with different
         * lifetimes. An INSTRUMENT is a test that outlives any cohort and must
         * not change once results exist — a revised instrument makes every
         * existing pair incomparable, so `lockedAt` is set the moment the first
         * score lands. A WINDOW is one administration of it: baseline in week
         * one, endline in the last week, with dates, so "when was this measured"
         * is a fact rather than a recollection. A RESULT is one child's raw
         * score, stored raw with the instrument's max beside it — never as a
         * percentage, because a percentage cannot be re-based when somebody
         * discovers the paper was marked out of 40 rather than 50.
         *
         * `absent` is its own column and not a zero. A child who did not sit the
         * test scored nothing; recording that as 0 drags the mean down and
         * turns an attendance problem into a learning finding. */
        81 => "
            CREATE TABLE IF NOT EXISTS assessment_instruments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instrumentId TEXT UNIQUE,
                name TEXT DEFAULT '',
                domain TEXT DEFAULT 'literacy',
                maxScore INTEGER DEFAULT 100,
                items INTEGER DEFAULT 0,
                version INTEGER DEFAULT 1,
                notes TEXT DEFAULT '',
                gradeFrom INTEGER DEFAULT 0,
                gradeTo INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft',
                lockedAt TEXT DEFAULT '',
                createdById TEXT DEFAULT '',
                createdAt TEXT,
                archivedAt TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS assessment_windows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                windowId TEXT UNIQUE,
                cohortId TEXT DEFAULT '',
                instrumentId TEXT DEFAULT '',
                phase TEXT DEFAULT 'baseline',
                label TEXT DEFAULT '',
                opensAt TEXT DEFAULT '',
                closesAt TEXT DEFAULT '',
                status TEXT DEFAULT 'open',
                createdById TEXT DEFAULT '',
                createdAt TEXT
            );
            CREATE TABLE IF NOT EXISTS assessment_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                resultId TEXT UNIQUE,
                windowId TEXT DEFAULT '',
                instrumentId TEXT DEFAULT '',
                studentId TEXT DEFAULT '',
                score INTEGER DEFAULT 0,
                absent INTEGER DEFAULT 0,
                note TEXT DEFAULT '',
                recordedById TEXT DEFAULT '',
                recordedAt TEXT,
                UNIQUE (windowId, studentId)
            );
            CREATE INDEX IF NOT EXISTS idx_ares_student ON assessment_results (studentId);
            CREATE INDEX IF NOT EXISTS idx_ares_window ON assessment_results (windowId);
            CREATE INDEX IF NOT EXISTS idx_awin_instr ON assessment_windows (instrumentId, phase);
        ",

        /* WHERE AN INSTRUMENT CAME FROM, AND WHAT ITS NUMBERS MEAN.
         *
         * Two gaps that only show up when somebody outside the programme reads
         * the result.
         *
         * A funder's first question about a gain is "measured with what?", and
         * "a test we wrote" is a worse answer than "EGRA oral reading fluency,
         * RTI/USAID, second edition". `source`, `licence`, `citation` and
         * `catalogueKey` carry the provenance so the report can answer it
         * without anyone reconstructing it from memory a year later.
         *
         * `unit` and `scale` exist because percent-of-maximum is not always a
         * number. Oral reading fluency is correct words per minute; there is no
         * maximum to be a percentage of, and "the mean rose 4.2% of the paper"
         * is a sentence with no meaning behind it. scale='points' keeps the
         * existing percent reporting, 'rate' and 'level' suppress it and report
         * in the instrument's own unit instead. */
        82 => "
            ALTER TABLE assessment_instruments ADD COLUMN unit TEXT DEFAULT '';
            ALTER TABLE assessment_instruments ADD COLUMN scale TEXT DEFAULT 'points';
            ALTER TABLE assessment_instruments ADD COLUMN source TEXT DEFAULT '';
            ALTER TABLE assessment_instruments ADD COLUMN sourceUrl TEXT DEFAULT '';
            ALTER TABLE assessment_instruments ADD COLUMN licence TEXT DEFAULT '';
            ALTER TABLE assessment_instruments ADD COLUMN citation TEXT DEFAULT '';
            ALTER TABLE assessment_instruments ADD COLUMN adaptNote TEXT DEFAULT '';
            ALTER TABLE assessment_instruments ADD COLUMN catalogueKey TEXT DEFAULT '';
            /* Not every instrument improves upwards. On the SDQ a FALL in the
             * total difficulties score is the good result, and a report that
             * prints '-3.1' under a heading called Gain has said the opposite
             * of what happened. */
            ALTER TABLE assessment_instruments ADD COLUMN higherIsBetter INTEGER DEFAULT 1;
            CREATE INDEX IF NOT EXISTS idx_ainst_cat ON assessment_instruments (catalogueKey);
        ",

        /* MEMBER OBLIGATIONS — one append-only ledger, not a balance column.
         *
         * A `balance` field on `members` would be the obvious shape and the wrong
         * one: money questions are always "how did it get to that?", and a single
         * mutable number cannot answer it. Every charge, payment and write-off is
         * a row here, and a balance is the sum of them. Corrections VOID a row
         * rather than editing it, the same way `infractions` and `sanctions`
         * already work, so the history stays readable after somebody fixes a
         * mistake.
         *
         * `periodKey` is what makes accrual safe to run twice. Monthly dues for
         * 2026-08 carry periodKey '2026-08', the session training charge carries
         * the sessionId, and the joining fee carries 'once' — with a UNIQUE index
         * across (memberId, kind, periodKey), a cron that fires twice, or an admin
         * who presses Run twice, cannot charge a family for the same month twice.
         * That is the defect this design exists to make impossible, because it is
         * the one nobody notices until a guardian complains.
         *
         * Amounts are whole naira, matching the existing policy fines. Signed by
         * `direction` rather than by the sign of `amount`, so a negative amount is
         * always a bug rather than a convention somebody has to remember. */
        83 => "
            CREATE TABLE IF NOT EXISTS member_ledger (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entryId TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL,
              kind TEXT NOT NULL,
              direction TEXT NOT NULL DEFAULT 'charge',
              amount INTEGER NOT NULL DEFAULT 0,
              periodKey TEXT DEFAULT '',
              sessionId TEXT DEFAULT '',
              note TEXT DEFAULT '',
              method TEXT DEFAULT '',
              reference TEXT DEFAULT '',
              voidedAt TEXT DEFAULT '',
              voidedBy TEXT DEFAULT '',
              voidReason TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now')),
              createdBy TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mledg_accrual ON member_ledger (memberId, kind, periodKey);
            CREATE INDEX IF NOT EXISTS idx_mledg_member ON member_ledger (memberId, createdAt);
            CREATE INDEX IF NOT EXISTS idx_mledg_kind ON member_ledger (kind);
            /* When the MOU was accomplished, and by whom. Recorded as a fact
             * rather than inferred from the training balance reaching zero:
             * a balance can reach zero because somebody paid it, and 'they
             * completed their service' is a different statement from 'nothing is
             * outstanding'. Reading one as the other would write off an
             * obligation on the strength of a payment. */
            ALTER TABLE members ADD COLUMN mouAt TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN mouBy TEXT DEFAULT '';
            /* Per-family reminder off-switch. A guardian who asks to stop being
             * chased must be able to be taken off the list without anyone
             * disabling reminders for the whole programme. */
            ALTER TABLE members ADD COLUMN duesRemindOff INTEGER DEFAULT 0;
            ALTER TABLE members ADD COLUMN duesRemindedAt TEXT DEFAULT '';
        ",
        /* Weekly engagement snapshots — one row per person per ISO week, carrying
         * their centre, so trends are readable per member AND groupable per
         * centre. Written by the weekly snapshot job (idempotent per week via the
         * UNIQUE index); read by admin.engagement.trends. `stats` is the same
         * JSON component breakdown the live view shows, kept for auditability. */
        84 => "
            CREATE TABLE IF NOT EXISTS engagement_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              weekStart TEXT NOT NULL,
              role TEXT NOT NULL,
              personId TEXT NOT NULL,
              name TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              engagement INTEGER NOT NULL DEFAULT 0,
              band TEXT DEFAULT '',
              windowDays INTEGER NOT NULL DEFAULT 7,
              stats TEXT DEFAULT '',
              createdAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_engsnap_unique ON engagement_snapshots (weekStart, role, personId);
            CREATE INDEX IF NOT EXISTS idx_engsnap_week ON engagement_snapshots (weekStart);
            CREATE INDEX IF NOT EXISTS idx_engsnap_centre ON engagement_snapshots (centre, weekStart);
            CREATE INDEX IF NOT EXISTS idx_engsnap_person ON engagement_snapshots (role, personId, weekStart);
        ",
        /* NGV promotion — an NGG member advancing up the chain of command
         * (Part III) into the volunteer tier gets a volunteer record provisioned
         * automatically, rather than filing a fresh volunteer application. The
         * link is two-way: the volunteer row remembers which member it belongs
         * to, and the member row remembers its NGV volunteer id + when it was
         * promoted, so the promotion is idempotent and reversible. */
        85 => "
            ALTER TABLE volunteers ADD COLUMN memberId TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN ngvVolunteerId TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN ngvAt TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_vol_member ON volunteers (memberId);
        ",
        /* Seasonal nudges — one row per (message, recipient) actually sent, so the
         * periodic campaign (api/_lib/nudges.php) can never double-send however
         * often the web-cron fires. The UNIQUE index is the idempotency guard. */
        86 => "
            CREATE TABLE IF NOT EXISTS nudge_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              messageKey TEXT NOT NULL,
              recipient TEXT NOT NULL,
              channel TEXT DEFAULT 'email',
              sentAt TEXT DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_nudge_once ON nudge_log (messageKey, recipient);
        ",
        /* NGGC member ID redesign (A5): a member carries a printed display id
         * (year-chapter-serial, e.g. 26-AM-135) and up to two disciplines
         * (e.g. TECH, MEDIA) shown on the card — both distinct from the raw
         * memberId and the single `track`. */
        87 => "
            ALTER TABLE members ADD COLUMN displayId TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN disciplines TEXT DEFAULT '';
        ",

        // A volunteer can be granted a portal capability per person. An
        // "Admin / Ops" volunteer holds no role capability, so the mentor
        // portal had no way to admit them at all. Granting is explicit and
        // per-person: filling in the self-service volunteer form still grants
        // nothing, which is the property that makes this safe to add.
        88 => "
            ALTER TABLE volunteers ADD COLUMN capsExtra TEXT DEFAULT '';
        ",

        /* Turn-based matches between two players. There is deliberately no
         * free-text column in any of these three tables: the only thing a
         * player can send their opponent is one of a fixed set of reactions,
         * so there is no message field to moderate in the first place. */
        89 => "
            CREATE TABLE match_games (
              matchId TEXT PRIMARY KEY,
              game TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'invited',
              programme TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              playerA TEXT NOT NULL, playerAName TEXT DEFAULT '', playerAType TEXT DEFAULT '',
              playerB TEXT NOT NULL, playerBName TEXT DEFAULT '', playerBType TEXT DEFAULT '',
              turnPlayer TEXT DEFAULT '',
              state TEXT,
              ply INTEGER DEFAULT 0,
              result TEXT DEFAULT '', winnerId TEXT DEFAULT '', reason TEXT DEFAULT '',
              tournamentId TEXT DEFAULT '',
              flagged INTEGER DEFAULT 0,
              createdAt TEXT NOT NULL, updatedAt TEXT DEFAULT '', lastMoveAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_match_players ON match_games(playerA, playerB);
            CREATE INDEX idx_match_status ON match_games(status, updatedAt);
            CREATE INDEX idx_match_centre ON match_games(centre, game);
            CREATE INDEX idx_match_tournament ON match_games(tournamentId);

            CREATE TABLE match_moves (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL, ply INTEGER NOT NULL, playerId TEXT NOT NULL,
              move TEXT NOT NULL, san TEXT DEFAULT '', stateAfter TEXT,
              createdAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX idx_match_move_ply ON match_moves(matchId, ply);
            CREATE INDEX idx_match_move_match ON match_moves(matchId);

            CREATE TABLE match_reactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL, ply INTEGER DEFAULT 0, playerId TEXT NOT NULL,
              reaction TEXT NOT NULL, createdAt TEXT NOT NULL
            );
            CREATE INDEX idx_match_react ON match_reactions(matchId, ply);
        ",

        /* Admin-hosted tournaments. Every centre plays its own knockout, the
         * centre champions meet in a final. Two tables plus two columns on the
         * match, because a tournament match IS a match — a parallel game table
         * would mean two places a game can be played and two places a
         * safeguarding review has to look. */
        90 => "
            CREATE TABLE tournaments (
              tournamentId TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              game TEXT NOT NULL DEFAULT 'chess',
              programme TEXT DEFAULT '',
              status TEXT NOT NULL DEFAULT 'draft',
              stage TEXT NOT NULL DEFAULT 'centre',
              round INTEGER DEFAULT 0,
              winnerId TEXT DEFAULT '', winnerName TEXT DEFAULT '',
              createdBy TEXT DEFAULT '',
              createdAt TEXT NOT NULL, updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_trn_status ON tournaments(status, updatedAt);

            CREATE TABLE tournament_entrants (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournamentId TEXT NOT NULL,
              playerId TEXT NOT NULL, playerName TEXT DEFAULT '', playerType TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              stage TEXT DEFAULT 'centre', status TEXT DEFAULT 'active',
              centreChampion INTEGER DEFAULT 0, eliminatedRound INTEGER DEFAULT 0,
              createdAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX idx_trn_entrant ON tournament_entrants(tournamentId, playerId);
            CREATE INDEX idx_trn_entrant_t ON tournament_entrants(tournamentId, centre);

            ALTER TABLE match_games ADD COLUMN tournamentRound INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN tournamentStage TEXT DEFAULT '';
        ",

        /* Math Lab. One row per player per level — the best they have done and
         * whether they have cleared it, which is what unlocks the next one. */
        91 => "
            CREATE TABLE math_progress (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              playerId TEXT NOT NULL, level INTEGER NOT NULL,
              bestScore INTEGER DEFAULT 0, bestCorrect INTEGER DEFAULT 0,
              attempts INTEGER DEFAULT 0, clearedAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_mathprog ON math_progress(playerId, level);
            CREATE INDEX idx_mathprog_player ON math_progress(playerId);
        ",

        /* The mentoring record — what was actually said, and what was agreed.
         *
         * Until now a mentor's only trace on a child was a star for today and a
         * V3 rating for this week. Both are scores. Neither records a
         * conversation, so nothing carried from one week to the next and a
         * mentor who took over a class inherited nothing but numbers.
         *
         * ON THE FREE TEXT. The two-player match tables in this codebase have
         * no free-text column at all, deliberately — that is child-to-child,
         * and no moderator can read every message between children in real
         * time. This is the opposite case: staff writing about a child, read by
         * staff, and a mentoring programme that cannot record "she said she is
         * being followed home" is not doing safeguarding, it is avoiding it.
         * So the text exists, and the controls are the ones that fit it — every
         * write audited, every read gated by the same scope that governs the
         * roster, `concern` to raise something to a lead, and NOTHING here is
         * ever served to the child's own portal.
         *
         * `metOn` is separate from createdAt because mentors write up a
         * conversation afterwards, often days later, and a record that insists
         * the meeting happened when the typing happened is a false record. */
        92 => "
            CREATE TABLE mentor_meetings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              subjectType TEXT NOT NULL DEFAULT 'member',
              mentorId TEXT NOT NULL,
              mentorName TEXT DEFAULT '',
              metOn TEXT NOT NULL,
              kind TEXT DEFAULT 'one-to-one',
              discussed TEXT DEFAULT '',
              agreed TEXT DEFAULT '',
              concern INTEGER NOT NULL DEFAULT 0,
              centre TEXT DEFAULT '',
              createdAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_mm_subject ON mentor_meetings(subjectId, metOn);
            CREATE INDEX idx_mm_mentor ON mentor_meetings(mentorId, metOn);
            CREATE INDEX idx_mm_concern ON mentor_meetings(centre, concern);

            CREATE TABLE mentor_goals (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              subjectType TEXT NOT NULL DEFAULT 'member',
              goal TEXT NOT NULL,
              setById TEXT NOT NULL, setByName TEXT DEFAULT '',
              dueOn TEXT DEFAULT '',
              status TEXT DEFAULT 'open',
              closedOn TEXT DEFAULT '', closedById TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              createdAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_mg_subject ON mentor_goals(subjectId, status);
            CREATE INDEX idx_mg_due ON mentor_goals(status, dueOn);
        ",

        /* What a shared document ACTUALLY is, recorded rather than guessed.
         *
         * The community stored a media url and nothing else about the file, so
         * everything downstream — the viewer, the doc card's type label, the
         * Drive mirror — re-derived the format by pattern-matching the url. That
         * is a question about a filename, not about a file, and it answered
         * wrongly for every document the upload path had re-encoded on the way
         * in (a PDF signed as an image came back a PNG, and the viewer that
         * keyed on `.pdf` therefore never appeared). The upload path is fixed;
         * this makes the answer a stored fact so nothing has to guess again.
         */
        93 => "
            ALTER TABLE community_posts ADD COLUMN mediaFormat TEXT DEFAULT '';
            ALTER TABLE community_posts ADD COLUMN mediaBytes INTEGER DEFAULT 0;
            ALTER TABLE community_posts ADD COLUMN mediaPages INTEGER DEFAULT 0;
        ",

        /* A brute-force ceiling that does not depend on the caller being honest
         * about who they are.
         *
         * The rate limiter keys on the client IP, and an IP is a claim from a
         * header until a trusted proxy vouches for it. Password sign-in and OTP
         * always had an account-level lockout underneath (members.failedLogins),
         * so they survived a spoofed header — but admin TOTP, the kiosk gate
         * password and the guardian invite-code lookup had nothing but the IP
         * bucket. Those three guard, respectively, the admin console's second
         * factor, a centre's check-in desk, and a six-digit code that resolves
         * to a child's name.
         *
         * Keyed on the SUBJECT being attacked (the admin, the gate, the code)
         * rather than on the attacker, because the subject is the thing we can
         * actually identify. */
        94 => "
            CREATE TABLE attempt_guard (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              scope TEXT NOT NULL,
              subject TEXT NOT NULL,
              fails INTEGER NOT NULL DEFAULT 0,
              lockedUntil TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_attempt_key ON attempt_guard(scope, subject);
            CREATE INDEX idx_attempt_stale ON attempt_guard(updatedAt);
        ",

        /* A notification that can be FOLLOWED.
         *
         * Notifications carried a `linkPage` ("community") and nothing else, so
         * "Ada mentioned you" could tell a member that something had happened
         * and then drop them at the top of a feed to hunt for it. The one
         * notification whose entire purpose is "somebody is talking to you,
         * here" was the one that could not say where. `linkRef` is the id of
         * the thing the notification is about — a post, today; anything with an
         * id, later. */
        95 => "
            ALTER TABLE notifications ADD COLUMN linkRef TEXT DEFAULT '';
        ",

        /* How long a clip runs.
         *
         * The post handler has always CHECKED the duration — a clip over three
         * minutes is refused — and then thrown the number away. So the Files
         * list could say how big a video is but not how long, which is the
         * figure a member on metered data actually decides on: "18 MB" and
         * "4:12" answer different questions and they need both. */
        96 => "
            ALTER TABLE community_posts ADD COLUMN mediaDuration INTEGER DEFAULT 0;
        ",

        /* Chess as a club fixture rather than a novelty (design turn 6A).
         *
         * Three things the match tables could not express:
         *
         *   A RATING. Without one, "find an opponent" is a list of names and a
         *   child has no way to tell whether they are about to be crushed. Elo,
         *   not Glicko — a club needs a number members recognise from every
         *   other chess app they have used, and the deviation term Glicko adds
         *   buys accuracy nobody here is going to read.
         *
         *   A CHALLENGE that is not yet a game. An invite created a match row
         *   immediately, so its terms (time control, colour, rated) had nowhere
         *   to live before it was accepted, an OPEN challenge — one anybody may
         *   take — had no representation at all, and nothing expired: an
         *   unanswered invite sat in a child's list forever.
         *
         *   HEAD-TO-HEAD. "You lead 3-2" is the single most useful thing on
         *   the search row, and counting it from match_games on every keystroke
         *   is a table scan per result.
         */
        97 => "
            CREATE TABLE chess_ratings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              playerId TEXT NOT NULL,
              rating INTEGER NOT NULL DEFAULT 1200,
              games INTEGER NOT NULL DEFAULT 0,
              wins INTEGER NOT NULL DEFAULT 0,
              losses INTEGER NOT NULL DEFAULT 0,
              draws INTEGER NOT NULL DEFAULT 0,
              peak INTEGER NOT NULL DEFAULT 1200,
              lastPlayedAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_chess_rating_player ON chess_ratings(playerId);

            CREATE TABLE chess_challenges (
              challengeId TEXT PRIMARY KEY,
              fromId TEXT NOT NULL, fromName TEXT DEFAULT '',
              toId TEXT DEFAULT '', toName TEXT DEFAULT '',
              timeControl TEXT DEFAULT '1day',
              colourPref TEXT DEFAULT 'random',
              rated INTEGER DEFAULT 1,
              channelSlug TEXT DEFAULT '',
              status TEXT DEFAULT 'open',
              matchId TEXT DEFAULT '',
              createdAt TEXT NOT NULL,
              expiresAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_chess_ch_to ON chess_challenges(toId, status);
            CREATE INDEX idx_chess_ch_open ON chess_challenges(status, expiresAt);

            CREATE TABLE chess_head2head (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              pairKey TEXT NOT NULL,
              playerId TEXT NOT NULL,
              opponentId TEXT NOT NULL,
              wins INTEGER NOT NULL DEFAULT 0,
              losses INTEGER NOT NULL DEFAULT 0,
              draws INTEGER NOT NULL DEFAULT 0,
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_chess_h2h ON chess_head2head(playerId, opponentId);

            ALTER TABLE match_games ADD COLUMN timeControl TEXT DEFAULT '1day';
            ALTER TABLE match_games ADD COLUMN rated INTEGER DEFAULT 1;
            ALTER TABLE match_games ADD COLUMN channelSlug TEXT DEFAULT '';
            ALTER TABLE match_games ADD COLUMN ratingDelta INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN settledAt TEXT DEFAULT '';
        ",

        /* 98 — the community audit.
         *
         *   SAFEGUARDING. The crisis gate used to decide correctly and then
         *   throw the decision away: a child writing about self-harm had the
         *   post refused, saw a helpline, and no adult was ever told. The
         *   refusal is the moment a disclosure becomes something to act on,
         *   not the moment it stops mattering — so it is kept, and raised.
         *
         *   COMMENT REPORTS. `reportCount` existed on posts only, and the
         *   queue looked for comments with status 'reported' — a status the
         *   moderation map never writes. Reporting a bullying reply reached
         *   nobody. Comments now carry the same counter posts do.
         *
         *   INDEXES. Nothing could serve the feed's own ORDER BY, so every
         *   page was a filesort over the whole table.
         */
        98 => "
            CREATE TABLE community_safeguarding (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              caseId TEXT NOT NULL UNIQUE,
              authorId TEXT NOT NULL,
              authorName TEXT DEFAULT '',
              surface TEXT DEFAULT 'post',
              channelSlug TEXT DEFAULT '',
              body TEXT,
              status TEXT DEFAULT 'open',
              acknowledgedBy TEXT DEFAULT '',
              acknowledgedAt TEXT DEFAULT '',
              createdAt TEXT
            );
            CREATE INDEX idx_csafe_status ON community_safeguarding(status, createdAt);

            ALTER TABLE community_comments ADD COLUMN reportCount INTEGER DEFAULT 0;
            ALTER TABLE community_posts ADD COLUMN notifiedAt TEXT DEFAULT '';
            ALTER TABLE community_comments ADD COLUMN notifiedAt TEXT DEFAULT '';
            UPDATE community_posts SET notifiedAt = createdAt WHERE status = 'published' AND (notifiedAt IS NULL OR notifiedAt = '');
            UPDATE community_comments SET notifiedAt = createdAt WHERE status = 'published' AND (notifiedAt IS NULL OR notifiedAt = '');

            CREATE INDEX idx_cpost_feed ON community_posts(status, pinned, createdAt);
            CREATE INDEX idx_cpost_featured ON community_posts(featured, status);
            CREATE INDEX idx_cbook_member ON community_bookmarks(memberId);
            CREATE INDEX idx_creport_reporter ON community_reports(memberId);
        ",

        /* 99 — Tournaments 2.0.
         *
         *   FORMATS. One shape (centre knockout → final) became five. Swiss is
         *   what a chess club actually runs: everybody plays every round,
         *   nobody is out after one loss, and pairing is by score then rating.
         *
         *   STANDINGS on the entrant row, because every format except knockout
         *   needs a running score, colour balance and an opponent history, and
         *   the knockout-only shape had nowhere to keep any of it.
         *
         *   CLOCKS. `timeControl` was a LABEL: '3+2' was stored and nothing
         *   ever counted down. The server now holds the remaining milliseconds,
         *   applies the Fischer increment on each move, and is the only thing
         *   allowed to decide somebody flagged.
         */
        99 => "
            ALTER TABLE tournaments ADD COLUMN format TEXT DEFAULT 'centre';
            ALTER TABLE tournaments ADD COLUMN timeControl TEXT DEFAULT '10+0';
            ALTER TABLE tournaments ADD COLUMN rated INTEGER DEFAULT 1;
            ALTER TABLE tournaments ADD COLUMN totalRounds INTEGER DEFAULT 0;
            ALTER TABLE tournaments ADD COLUMN description TEXT DEFAULT '';
            ALTER TABLE tournaments ADD COLUMN centres TEXT;
            ALTER TABLE tournaments ADD COLUMN eligibility TEXT;
            ALTER TABLE tournaments ADD COLUMN startsAt TEXT DEFAULT '';
            ALTER TABLE tournaments ADD COLUMN endsAt TEXT DEFAULT '';
            ALTER TABLE tournaments ADD COLUMN settings TEXT;

            ALTER TABLE tournament_entrants ADD COLUMN seed INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN ratingAtEntry INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN score REAL DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN played INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN wins INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN draws INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN losses INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN byes INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN whiteCount INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN blackCount INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN lastColour TEXT DEFAULT '';
            ALTER TABLE tournament_entrants ADD COLUMN opponents TEXT;
            ALTER TABLE tournament_entrants ADD COLUMN tiebreak1 REAL DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN tiebreak2 REAL DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN performance INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN ratingDelta INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN withdrawn INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN arenaStreak INTEGER DEFAULT 0;
            ALTER TABLE tournament_entrants ADD COLUMN arenaPoints INTEGER DEFAULT 0;

            CREATE TABLE tournament_rounds (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournamentId TEXT NOT NULL,
              round INTEGER NOT NULL,
              stage TEXT DEFAULT '',
              status TEXT DEFAULT 'pending',
              pairedAt TEXT DEFAULT '',
              closedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_trn_round ON tournament_rounds(tournamentId, stage, round);

            CREATE TABLE tournament_pairings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournamentId TEXT NOT NULL,
              round INTEGER NOT NULL,
              stage TEXT DEFAULT '',
              board INTEGER DEFAULT 0,
              centre TEXT DEFAULT '',
              whiteId TEXT DEFAULT '', whiteName TEXT DEFAULT '',
              blackId TEXT DEFAULT '', blackName TEXT DEFAULT '',
              matchId TEXT DEFAULT '',
              isBye INTEGER DEFAULT 0,
              result TEXT DEFAULT '',
              scoredAt TEXT DEFAULT '',
              createdAt TEXT NOT NULL
            );
            CREATE INDEX idx_trn_pair ON tournament_pairings(tournamentId, stage, round, board);
            CREATE INDEX idx_trn_pair_match ON tournament_pairings(matchId);

            ALTER TABLE match_games ADD COLUMN initialMs INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN incrementMs INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN whiteMs INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN blackMs INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN clockRunning INTEGER DEFAULT 0;
            ALTER TABLE match_games ADD COLUMN turnStartedAt TEXT DEFAULT '';
            ALTER TABLE match_games ADD COLUMN board INTEGER DEFAULT 0;
            CREATE INDEX idx_match_clock ON match_games(status, clockRunning);
        ",

        /* 100 — the board.
         *
         *   IDEMPOTENCY. A move was identified only by its ply. A client that
         *   sent a move, lost the response and retried either collided with
         *   UNIQUE(matchId, ply) — surfacing as a failure for a move that HAD
         *   landed — or, if the opponent had replied meanwhile, applied a
         *   second time at a new ply. On a 3G handset at a centre that is not
         *   rare. The client names each move once now.
         *
         *   VARIANTS. Chess960 does not start from a constant, so the start
         *   position has to be stored rather than assumed.
         *
         *   PROMOTIONS. First-party only — NGG promoting its own programmes to
         *   its own members. No third-party ad network, deliberately.
         */
        100 => "
            ALTER TABLE match_moves ADD COLUMN clientMoveId TEXT DEFAULT NULL;
            CREATE UNIQUE INDEX idx_match_move_client ON match_moves(matchId, clientMoveId);
            ALTER TABLE match_moves ADD COLUMN msSpent INTEGER DEFAULT 0;

            ALTER TABLE match_games ADD COLUMN variant TEXT DEFAULT 'standard';
            ALTER TABLE match_games ADD COLUMN variantData TEXT;
            ALTER TABLE match_games ADD COLUMN startFen TEXT DEFAULT '';
            ALTER TABLE tournaments ADD COLUMN variant TEXT DEFAULT 'standard';
            ALTER TABLE chess_challenges ADD COLUMN variant TEXT DEFAULT 'standard';

            CREATE TABLE promos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              promoId TEXT UNIQUE NOT NULL,
              title TEXT NOT NULL, body TEXT DEFAULT '',
              kind TEXT DEFAULT 'programme', placement TEXT DEFAULT 'chess',
              ctaLabel TEXT DEFAULT '', ctaPage TEXT DEFAULT '', ctaRef TEXT DEFAULT '',
              imageUrl TEXT DEFAULT '', accent TEXT DEFAULT '',
              priority INTEGER DEFAULT 0, status TEXT DEFAULT 'draft',
              startsAt TEXT DEFAULT '', endsAt TEXT DEFAULT '', audience TEXT,
              impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, dismissals INTEGER DEFAULT 0,
              createdBy TEXT DEFAULT '', createdAt TEXT NOT NULL, updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX idx_promo_live ON promos(status, placement, priority);

            CREATE TABLE promo_seen (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              promoId TEXT NOT NULL, memberId TEXT NOT NULL,
              seenAt TEXT DEFAULT '', clickedAt TEXT DEFAULT '', dismissedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_promo_seen ON promo_seen(promoId, memberId);
        ",
        101 => "
            CREATE TABLE match_reviews (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT UNIQUE NOT NULL,
              whiteAccuracy INTEGER DEFAULT 0, blackAccuracy INTEGER DEFAULT 0,
              whiteAvgLoss INTEGER DEFAULT 0,  blackAvgLoss INTEGER DEFAULT 0,
              whiteBlunders INTEGER DEFAULT 0, blackBlunders INTEGER DEFAULT 0,
              whiteMistakes INTEGER DEFAULT 0, blackMistakes INTEGER DEFAULT 0,
              whiteInaccuracies INTEGER DEFAULT 0, blackInaccuracies INTEGER DEFAULT 0,
              turningPly INTEGER DEFAULT 0, turningSan TEXT DEFAULT '',
              turningBest TEXT DEFAULT '', turningLoss INTEGER DEFAULT 0,
              evals TEXT,
              engineDepth INTEGER DEFAULT 0, engineMs INTEGER DEFAULT 0,
              byId TEXT DEFAULT '', createdAt TEXT NOT NULL
            );

            ALTER TABLE tournament_entrants ADD COLUMN lastRank INTEGER DEFAULT 0;

            ALTER TABLE promos ADD COLUMN tournamentId TEXT DEFAULT '';
            ALTER TABLE promos ADD COLUMN shape TEXT DEFAULT 'card';
            CREATE INDEX idx_promo_trn ON promos(tournamentId);
        ",
        102 => "
            /* Who was ASKED to a tournament, as distinct from who entered it.
               A director could add entrants one at a time and nothing else; the
               only way to fill a field was to sign children up without asking,
               which is not an invitation. This table is the ask. It also makes
               the obvious question answerable — 40 invited, 11 joined — which
               nothing could answer before, because nobody recorded the 40. */
            CREATE TABLE tournament_invites (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournamentId TEXT NOT NULL,
              playerId TEXT NOT NULL,
              playerName TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              invitedBy TEXT DEFAULT '',
              invitedAt TEXT NOT NULL,
              /* Set when they act on it. joinedAt is written by the join path,
                 so invite→entry conversion is a fact rather than an inference
                 from timestamps that happen to be close together. */
              joinedAt TEXT DEFAULT '',
              declinedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_trn_invite_unique ON tournament_invites(tournamentId, playerId);
            CREATE INDEX idx_trn_invite_player ON tournament_invites(playerId);
        ",
        103 => "
            /* Homework: the task, who was asked, and who has been chased.
               Three tables rather than a status column, because the three
               questions have different lifetimes — the task outlives the term,
               a submission is a fact about one child, and a nudge is an event
               that has to be counted per day to be limited. */
            CREATE TABLE community_homework (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              homeworkId TEXT NOT NULL,
              channelId TEXT NOT NULL,
              title TEXT NOT NULL,
              detail TEXT DEFAULT '',
              dueAt TEXT DEFAULT '',
              createdBy TEXT DEFAULT '',
              createdByName TEXT DEFAULT '',
              createdAt TEXT NOT NULL,
              /* active | archived. Never deleted: a child who submitted work
                 should not find the task it belonged to has vanished. */
              status TEXT NOT NULL DEFAULT 'active'
            );
            CREATE UNIQUE INDEX idx_hw_id ON community_homework(homeworkId);
            CREATE INDEX idx_hw_channel ON community_homework(channelId, status);

            /* The cohort is SNAPSHOT at creation — one row per child asked,
               written when the task is set. The denominator in '14 of 24' is
               then a fact about who was asked, not a live count of who happens
               to be in the channel today. Somebody joining next week does not
               retroactively become late. */
            CREATE TABLE community_homework_state (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              homeworkId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              memberName TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              /* seenAt is 'has opened the task', which is what separates
                 'has not got round to it' from 'does not know about it' —
                 the only distinction that makes a nudge fair. */
              seenAt TEXT DEFAULT '',
              submittedAt TEXT DEFAULT '',
              submittedRef TEXT DEFAULT '',
              reviewedAt TEXT DEFAULT '',
              reviewedBy TEXT DEFAULT '',
              note TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX idx_hws_unique ON community_homework_state(homeworkId, memberId);
            CREATE INDEX idx_hws_member ON community_homework_state(memberId);

            /* Every nudge, kept. The daily limit is enforced by reading this,
               not by a counter that can drift, and it means a child can be
               shown 'Nudged Tue' truthfully and a mentor can be held to it. */
            CREATE TABLE community_homework_nudge (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              homeworkId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              nudgedBy TEXT DEFAULT '',
              nudgedAt TEXT NOT NULL,
              /* The UTC date of nudgedAt, so the one-per-day rule is an index
                 lookup rather than a scan-and-parse. */
              nudgedDay TEXT NOT NULL
            );
            CREATE UNIQUE INDEX idx_hwn_daily ON community_homework_nudge(homeworkId, memberId, nudgedDay);
            CREATE INDEX idx_hwn_member ON community_homework_nudge(memberId, nudgedAt);
        ",
        104 => "
            /* Who is typing, right now. One row per person per channel,
               overwritten in place and read back only for the last few seconds.
               A table rather than a socket because this runs on shared hosting,
               which cannot hold a persistent connection open — see
               community_typing_*() for the polling budget that follows from it.

               Nothing here is history. The rows are ephemeral by construction:
               a read ignores anything older than the TTL and deletes it on the
               way past, so a keystroke by a child is never a record. */
            CREATE TABLE community_typing (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              channelId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              memberName TEXT DEFAULT '',
              staff INTEGER NOT NULL DEFAULT 0,
              atIso TEXT NOT NULL
            );
            CREATE UNIQUE INDEX idx_typing_unique ON community_typing(channelId, memberId);
            CREATE INDEX idx_typing_at ON community_typing(channelId, atIso);
        ",
        105 => "
            /* The personal journal, widened to what the design asks of it
               (handoff §8a and §8b). Every column is added rather than
               replaced: `journal` is also written by the anchor reflection
               flow, which knows about mood, body and isPrivate and nothing
               else, and must keep working untouched.

               `visibility` supersedes isPrivate for anything written through
               the new writer. isPrivate stays, is kept in step on every write,
               and remains the only thing the old flow reads — one fact, two
               spellings, rather than two facts that can disagree. */
            ALTER TABLE journal ADD COLUMN title TEXT DEFAULT '';
            /* private | mentor | programme. Defaulting to 'private' is the
               design's rule and a safeguarding one: a child\'s journal is
               private unless they choose otherwise, and a default that leaks
               is a default nobody would have chosen deliberately. */
            ALTER TABLE journal ADD COLUMN visibility TEXT DEFAULT 'private';
            /* Space-separated, lower-case, no leading #. Counted in PHP over
               one member\'s own entries — tens or hundreds of rows, not
               millions — which is cheaper to keep correct than a join table
               nothing else needs. */
            ALTER TABLE journal ADD COLUMN tags TEXT DEFAULT '';
            ALTER TABLE journal ADD COLUMN wordCount INTEGER DEFAULT 0;
            ALTER TABLE journal ADD COLUMN mediaJson TEXT DEFAULT '';
            /* The DAY the entry is about, which is not the same as when it was
               typed: somebody writing up Saturday on Sunday morning should see
               it on Saturday in the week strip. */
            ALTER TABLE journal ADD COLUMN occurredOn TEXT DEFAULT '';
            ALTER TABLE journal ADD COLUMN promptText TEXT DEFAULT '';
            ALTER TABLE journal ADD COLUMN updatedAt TEXT DEFAULT '';
            CREATE INDEX idx_journal_day ON journal(memberId, occurredOn);
        ",
        106 => "
            /* Draw offers (6A §4 puts \"Offer draw\" beside Resign).
               Columns on the game rather than a table: an offer is a fact
               about the CURRENT position and there is only ever one live at a
               time.

               drawOfferBy / drawOfferAt are the LIVE offer, cleared the moment
               it is answered — accepted, declined, or answered with a move.

               drawOfferLastBy / drawOfferPly outlive that: they remember who
               offered last and in which position, and they are the reason this
               is not just a button. Repeatedly offering a draw is how a losing
               player badgers a winning one, and in a service for children that
               is not a quirk of etiquette. Held separately from the live offer
               because a decline must not wipe the record of the offer that was
               declined — that would make the badgering free. Held per PLAYER
               because the opponent changing their mind in the same position is
               not badgering, and refusing them would be a lie. */
            ALTER TABLE match_games ADD COLUMN drawOfferBy TEXT DEFAULT '';
            ALTER TABLE match_games ADD COLUMN drawOfferAt TEXT DEFAULT '';
            ALTER TABLE match_games ADD COLUMN drawOfferLastBy TEXT DEFAULT '';
            ALTER TABLE match_games ADD COLUMN drawOfferPly INTEGER DEFAULT -1;
        ",
        107 => "
            /* The Programme record (handoff §8c).
               The journal already held what happened; §8c is about what
               happened NEXT — an issue's updates, who is following it, what a
               decision follows from, what a contribution actually raised. All
               of it was being narrated in prose in the body, where nothing can
               count it and a summary tile cannot be honest.

               Everything countable stays derivable: 'receipts attached (2)'
               and '12 photos' are the media already on the entry, and 'kept by
               14 members' is a row count. A stored tally beside a list of the
               things it counts is two records of one fact, and they drift. */
            ALTER TABLE program_journal ADD COLUMN ownerId TEXT DEFAULT '';
            ALTER TABLE program_journal ADD COLUMN ownerName TEXT DEFAULT '';
            /* The back-reference §8c draws as '↳ Follows the hall
               double-booking issue'. A decision that came out of an issue is
               most of the value of keeping the record at all. */
            ALTER TABLE program_journal ADD COLUMN parentEntryId TEXT DEFAULT '';
            /* Money in the smallest unit. Naira has kobo, and a float here is
               how a funding total ends in .00000001. */
            ALTER TABLE program_journal ADD COLUMN amountMinor INTEGER DEFAULT 0;
            ALTER TABLE program_journal ADD COLUMN targetMinor INTEGER DEFAULT 0;
            ALTER TABLE program_journal ADD COLUMN currency TEXT DEFAULT 'NGN';
            ALTER TABLE program_journal ADD COLUMN contributors INTEGER DEFAULT 0;
            /* A milestone's headline: '41' 'of 46' 'finished twelve weeks'. */
            ALTER TABLE program_journal ADD COLUMN countValue INTEGER DEFAULT 0;
            ALTER TABLE program_journal ADD COLUMN countTotal INTEGER DEFAULT 0;
            ALTER TABLE program_journal ADD COLUMN countUnit TEXT DEFAULT '';
            /* 'agreed with 2 mentors · 18 members notified'. Provenance is the
               reason a decision is trusted a year later, and it cannot be
               reconstructed after the fact. */
            ALTER TABLE program_journal ADD COLUMN agreedWith INTEGER DEFAULT 0;
            ALTER TABLE program_journal ADD COLUMN notified INTEGER DEFAULT 0;
            /* Proposed by somebody without the journal capability, waiting for
               a mentor. §8c promises 'a mentor reviews it before it appears
               here', and a promise printed on the screen that makes it has to
               be enforced by the screen behind it. */
            ALTER TABLE program_journal ADD COLUMN proposedBy TEXT DEFAULT '';
            ALTER TABLE program_journal ADD COLUMN proposedName TEXT DEFAULT '';
            ALTER TABLE program_journal ADD COLUMN publishedAt TEXT DEFAULT '';

            CREATE TABLE IF NOT EXISTS program_journal_updates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              updateId TEXT UNIQUE NOT NULL,
              entryId TEXT NOT NULL,
              authorId TEXT DEFAULT '',
              authorName TEXT DEFAULT '',
              body TEXT DEFAULT '',
              createdAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_pju_entry ON program_journal_updates(entryId, createdAt);

            /* One table for two words. 'Follow this' on an issue and the
               bookmark on a piece of advice are the same act — this member
               marked this entry — and two tables would be two answers to
               'how many people are holding on to this'. */
            CREATE TABLE IF NOT EXISTS program_journal_follows (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entryId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              createdAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pjf_unique ON program_journal_follows(entryId, memberId);
            CREATE INDEX IF NOT EXISTS idx_pjf_member ON program_journal_follows(memberId);
        ",
        108 => "
            /* An application's reference stops being its row id.
               NGG-A-00412 told anybody holding it how many applications the
               programme had received and — with a guessable email — let the
               status of a named person be found by walking the numbers. The
               lookup is throttled at 20 per 5 minutes, which is an afternoon.

               Rows that already exist keep NO stored ref on purpose: their
               reference has been emailed to a family and printed on a success
               screen, so it goes on resolving by id. Only new applications get
               a random one. */
            ALTER TABLE applications ADD COLUMN ref TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_apps_ref ON applications(ref);
        ",
        /* A member's NGG level (A, B, C, O) gets a column of its own.
           It is the first thing a centre lead asks about a child and the
           roster has always carried it, but until now the only place to put
           it on import was the free-text note — where nothing can filter,
           count or sort by it. Existing rows are backfilled from that note
           in the same breath, so the column is populated the moment it
           exists rather than on whenever somebody next re-runs the import.

           The pattern is the one members-import.php writes: a line reading
           "Level B" as the first segment of the fenced block. Anything that
           does not match is left blank rather than guessed at. */
        109 => "
            ALTER TABLE members ADD COLUMN level TEXT DEFAULT '';
        " . NGG_BACKFILL_MEMBER_LEVELS . ";",

        /* Member self-service: one table for everything a member ASKS the desk
         * for. Four kinds today — a payment they say they have made, an appeal
         * against a fine, a leave of absence, a replacement ID — and they share
         * a shape because they share a life: raised by the member, read by an
         * admin, decided once, with the decision and the reason kept.
         *
         * A payment claim is deliberately NOT a ledger row. fees.php is explicit
         * that "a member confirming their own payment is not a thing this ledger
         * will ever accept", and that is right: the ledger records money the
         * desk has seen. A claim is the member telling the desk to go and look.
         * Approving one posts the payment through the ordinary admin path, so
         * there is exactly one way money enters the account.
         */
        110 => "
            CREATE TABLE IF NOT EXISTS member_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              requestId TEXT NOT NULL UNIQUE,
              memberId TEXT NOT NULL,
              kind TEXT NOT NULL,                 -- payment | appeal | leave | idcard
              status TEXT NOT NULL DEFAULT 'open',-- open | approved | declined | withdrawn
              subject TEXT DEFAULT '',
              body TEXT DEFAULT '',
              amount INTEGER DEFAULT 0,           -- payment claims only
              reference TEXT DEFAULT '',          -- their bank/transfer reference
              proofUrl TEXT DEFAULT '',
              paidAt TEXT DEFAULT '',
              fromDate TEXT DEFAULT '',           -- leave requests
              toDate TEXT DEFAULT '',
              refEntryId TEXT DEFAULT '',         -- the fine an appeal is against
              decision TEXT DEFAULT '',
              decidedBy TEXT DEFAULT '',
              decidedAt TEXT DEFAULT '',
              ledgerEntryId TEXT DEFAULT '',      -- what approving it posted, if anything
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mreq_member ON member_requests(memberId, createdAt);
            CREATE INDEX IF NOT EXISTS idx_mreq_open ON member_requests(status, kind);
        ",

        /* Which roster file was loaded, when, by whom — and what it did.
         *
         * A roster import rewrites the membership table in one action, and
         * until now the only record it left was an audit row naming a FILENAME.
         * A filename is a thing a person renames; it cannot answer "is this the
         * same roster we loaded in March" or "did somebody already run this".
         *
         * `digest` is members_import_digest() — a hash of what the file would
         * DO, so it survives re-serialisation, key order and row order. It is
         * deliberately NOT unique: applying the same roster twice is legal (a
         * re-run after fixing four rows elsewhere is the normal workflow), and
         * the point of this table is to SAY so, not to prevent it.
         *
         * `fileSha` is the raw SHA-256 of the bytes on disk, computed by the
         * browser (or printed by extract.js) and carried along. It answers a
         * different question — "is this the file the extractor made" — and is
         * blank when nobody supplied one, which is why it is not the key.
         */
        111 => "
            CREATE TABLE IF NOT EXISTS member_import_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              digest TEXT NOT NULL,               -- members_import_digest(): what it would do
              fileSha TEXT DEFAULT '',            -- raw sha256 of the file's bytes, if known
              source TEXT DEFAULT '',             -- the filename, for humans only
              actorId TEXT DEFAULT '',
              overwrite INTEGER DEFAULT 0,
              created INTEGER DEFAULT 0,
              updated INTEGER DEFAULT 0,
              unchanged INTEGER DEFAULT 0,
              failed INTEGER DEFAULT 0,
              rowCount INTEGER DEFAULT 0,
              at TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mirun_digest ON member_import_runs(digest, id);
            CREATE INDEX IF NOT EXISTS idx_mirun_at ON member_import_runs(at);
        ",

        /* ── Summer School: editions, and groups within an edition ───────────
         *
         * THE VOCABULARY, because it was the problem. Three different things
         * were all called a \"cohort\" somewhere in this product:
         *
         *   EDITION   one season of Summer School — \"Summer School 2026\".
         *             Stored in `summer_cohorts`; its id is the `cohortId`
         *             that `summer_students`, `attendance` and `qr_codes`
         *             already carry. That column means EDITION, everywhere,
         *             with no exceptions. The table keeps its historical name
         *             rather than gaining a translation layer over it — this
         *             schema deliberately has none (see the file header).
         *   GROUP     a class WITHIN an edition — \"Egbeda · Music · Morning\".
         *             This table. New concept, new name, its own id. When a
         *             coordinator says \"cohort\" out loud, this is what they
         *             mean, so the UI calls it a group and never a cohort.
         *   CENTRE    a PLACE. `centres`. Belongs to NGG the organisation, not
         *             to Summer School: NGG members are posted to one all year
         *             and its code is the printed ID prefix on their cards.
         *             Summer School RUNS AT centres; it does not own them.
         *
         * A group is the unit an edition is actually run in: it has a place, a
         * course, a lead, a capacity, its own dates and its own lifecycle, and
         * a participant belongs to at most one of them. Before this, an
         * edition's 300 children were one undifferentiated list filtered by
         * centre and track — which cannot express two Music classes at one
         * centre, cannot be handed to a lead, and cannot be reported on.
         *
         * `cohortId` here is the EDITION the group belongs to, named to match
         * the column it points at. Codes are unique within an edition, never
         * globally: \"EG-MUS-AM\" is free to mean this year's class next year.
         */
        112 => "
            CREATE TABLE IF NOT EXISTS summer_groups (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              groupId TEXT NOT NULL UNIQUE,
              cohortId TEXT NOT NULL,             -- the EDITION (summer_cohorts.cohortId)
              name TEXT NOT NULL,
              code TEXT NOT NULL,                 -- unique within the edition
              centreId TEXT DEFAULT '',           -- centres.centreId — where it meets
              faculty TEXT DEFAULT '',            -- academy, from the catalogue
              track TEXT DEFAULT '',              -- course, from the catalogue
              leadId TEXT DEFAULT '',             -- volunteers.volunteerId of the lead
              capacity INTEGER DEFAULT 0,         -- 0 = uncapped
              meetDays TEXT DEFAULT '',           -- '1,3,6' — operational, never public
              meetTime TEXT DEFAULT '',
              startDate TEXT DEFAULT '',
              endDate TEXT DEFAULT '',
              status TEXT NOT NULL DEFAULT 'active', -- planning|active|closed|archived
              notes TEXT DEFAULT '',
              createdAt TEXT DEFAULT '', createdBy TEXT DEFAULT '',
              updatedAt TEXT DEFAULT '', updatedBy TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sgrp_code ON summer_groups(cohortId, code);
            CREATE INDEX IF NOT EXISTS idx_sgrp_edition ON summer_groups(cohortId, status);
            CREATE INDEX IF NOT EXISTS idx_sgrp_centre ON summer_groups(centreId);

            ALTER TABLE summer_students ADD COLUMN groupId TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_sstu_group ON summer_students(groupId);

            /* Edition lifecycle. `status` already held 'active' | 'archived'
               and those keep their meaning — 'active' is the one edition being
               run, and only one may be active at a time. 'planning' (being set
               up, not yet taking anyone) and 'closed' (finished, still being
               reported on, not yet archived) are the two states a coordinator
               previously had to fake by archiving early or leaving an old
               edition active. */
            ALTER TABLE summer_cohorts ADD COLUMN code TEXT DEFAULT '';
            ALTER TABLE summer_cohorts ADD COLUMN applyOpensAt TEXT DEFAULT '';
            ALTER TABLE summer_cohorts ADD COLUMN applyClosesAt TEXT DEFAULT '';
            ALTER TABLE summer_cohorts ADD COLUMN notes TEXT DEFAULT '';
            ALTER TABLE summer_cohorts ADD COLUMN updatedAt TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_scoh_status ON summer_cohorts(status, id);
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

/* Query counter, off unless a caller switches it on.
 *
 * Exists so a test can assert that an endpoint's query COUNT does not grow
 * with the number of centres. That is the bug class that made the public board
 * unservable — seven hundred queries at a hundred centres, fourteen at the two
 * a dev machine has, so it looked fine everywhere except production. Timing
 * cannot catch it (a fast machine hides it); counting can. */
function db_count_start(): void { $GLOBALS['__db_qcount'] = 0; }
function db_count_read(): int { return (int)($GLOBALS['__db_qcount'] ?? 0); }
function db_count_stop(): void { unset($GLOBALS['__db_qcount']); }
function db_tick(): void { if (isset($GLOBALS['__db_qcount'])) $GLOBALS['__db_qcount']++; }

function db_row(string $sql, array $params = []): ?array {
    db_tick();
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function db_all(string $sql, array $params = []): array {
    db_tick();
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function db_exec(string $sql, array $params = []): int {
    db_tick();
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/**
 * Run $fn inside a transaction. Commits on return, rolls back on throw.
 *
 * Until this existed the only transaction in the codebase wrapped schema
 * migrations, and every multi-row business write was a sequence of independent
 * statements: a chess move inserted into `match_moves` and then updated
 * `match_games`, a fee posted a ledger row and then touched the member. Each
 * pair is one fact recorded in two places, and anything that interrupts the
 * gap — a fatal, a timeout, a killed worker — leaves the halves disagreeing.
 * That is not a hypothetical on shared hosting, where PHP-FPM will happily
 * reap a request mid-write.
 *
 * Nested calls join the outer transaction rather than opening a second one
 * (PDO would throw), so a helper that wraps itself is safe to call from inside
 * another wrapped operation. Only the outermost frame commits.
 *
 * The return value of $fn is passed through, so this reads as an expression:
 *     $post = db_tx(fn() => community_write($d));
 */
function db_tx(callable $fn) {
    $db = db_conn();
    if ($db->inTransaction()) return $fn();   // already inside one — just run

    $db->beginTransaction();
    try {
        $out = $fn();
        $db->commit();
        return $out;
    } catch (Throwable $e) {
        // rollBack() itself throws if the driver already unwound the
        // transaction (a MySQL deadlock does this), and losing the original
        // exception to that would hide the actual fault.
        if ($db->inTransaction()) { try { $db->rollBack(); } catch (Throwable $_) {} }
        throw $e;
    }
}
