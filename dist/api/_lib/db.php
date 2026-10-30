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

const NGG_SCHEMA_TARGET = 203;
/** The one-time NGG/Summer centre split (domain/centres-ngg.php). A database
 *  created fresh records it as done: there is nothing to split. */
const CENTRES_SPLIT_SEED = 'ngg-centres-2026-10';

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
/* 115 — a member's division, derived from the free-text `track` they already
 * carry. Only the unambiguous ones: "Leadership", "Community Intelligence" and
 * "Public Speaking" belong to no single division and are left blank, because a
 * member in NO division is a question a centre lead will ask, and a member in
 * the WRONG one is a wrong answer nobody thinks to check. The full mapping,
 * including the synonyms, is nggc_division_for_track() in
 * domain/formation.php; this is the SQL subset that can run as one statement.
 *
 * LOWER() on both sides: rosters have arrived with "Tech", "tech" and "TECH". */
const NGG_BACKFILL_MEMBER_DIVISION = "
    UPDATE members SET division = CASE
        WHEN LOWER(track) IN ('music','arts','art','creative','drama','dance','fashion','craft') THEN 'arts'
        WHEN LOWER(track) IN ('media','film','photography','design','graphics','content') THEN 'media'
        WHEN LOWER(track) IN ('tech','technology','coding','code','robotics','ai','engineering','builder') THEN 'tech'
        WHEN LOWER(track) IN ('business','admin','operations','finance','strategy') THEN 'business'
        ELSE division END
     WHERE (division IS NULL OR division = '') AND track IS NOT NULL AND track <> ''
";

const NGG_BACKFILL_MEMBER_LEVELS = "
    UPDATE members SET level = UPPER(SUBSTR(notes, INSTR(notes, 'Level ') + 6, 1))
     WHERE (level IS NULL OR level = '')
       AND INSTR(notes, '[roster-import]') > 0
       AND INSTR(notes, 'Level ') > 0
";

/**
 * 122 — which programme a volunteer serves. NGG when they came in through an
 * NGG (anchor) application, or were made a volunteer straight from an NGG
 * member record; Summer otherwise. Fills blanks only.
 */
const NGG_BACKFILL_VOLUNTEER_PROGRAMME = "
    UPDATE volunteers SET programme = 'ngg'
     WHERE (programme IS NULL OR programme = '')
       AND ( applicationId IN (SELECT id FROM applications WHERE program = 'anchor')
          OR ( (applicationId IS NULL OR applicationId = 0)
               AND memberId IN (SELECT memberId FROM members WHERE UPPER(type) = 'NGG') ) );
    UPDATE volunteers SET programme = 'summer' WHERE programme IS NULL OR programme = '';
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
    /* 193 — Anchor Circle joined the family account: the old code-and-token
     * links stop opening anything; their days and notes stay on the record. */
    'circle_links.moved' => "UPDATE circle_links SET status = 'moved' WHERE status = 'active'",
    /* 160 — the Summer School lead starts as the centre's existing lead. NULL
     * marks "never set", so a lead somebody cleared ('') is not refilled. */
    'centres.summerLead' => "
        UPDATE centres SET summerLeadVolunteerId = CASE
            WHEN COALESCE(programmes, '') = '' OR programmes LIKE '%summer%' THEN COALESCE(leadVolunteerId, '') ELSE '' END
         WHERE summerLeadVolunteerId IS NULL
    ",
    /* A member could once write "MFA.bypass" / "STAFF.…" / "AI.…" (the guard was
     * case-sensitive, MySQL's collation is not). Server-written keys are always
     * lower case, so any such key not in lower case was forged: remove it. */
    'member_state.forged_case' => "DELETE FROM member_state WHERE BINARY stateKey <> BINARY LOWER(stateKey) AND (LOWER(stateKey) LIKE 'mfa%' OR LOWER(stateKey) LIKE 'staff.%' OR LOWER(stateKey) LIKE 'ai.%')",
    /* 156 — emails stored the way the sign-in door compares them (BINARY: the
     * default collation would call 'Ada@X' and 'ada@x' equal and skip it). */
    'volunteers.email_norm' => "UPDATE volunteers SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND BINARY email <> BINARY LOWER(TRIM(email))",
    'mentors.email_norm'    => "UPDATE mentors SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND BINARY email <> BINARY LOWER(TRIM(email))",
    'members.email_trim'    => "UPDATE members SET email = TRIM(email) WHERE email IS NOT NULL AND email <> TRIM(email)",
    /* 146 — one active mentor per child: end duplicate active pairings,
     * keeping each child's newest. Matches nothing once they are gone. */
    'mentor_assignments.one_active' => "
        UPDATE mentor_assignments a
          JOIN (SELECT memberId, MAX(id) keepId FROM mentor_assignments WHERE status = 'active' GROUP BY memberId) k ON k.memberId = a.memberId
           SET a.status = 'ended', a.endedAt = '2026-10-16T00:00:00Z'
         WHERE a.status = 'active' AND a.id <> k.keepId
    ",
    /* 138 — goal statuses become draft | active | achieved | paused. */
    'mentor_goals.status' => "
        UPDATE mentor_goals SET status = CASE status WHEN 'open' THEN 'active' WHEN 'done' THEN 'achieved' WHEN 'dropped' THEN 'paused' ELSE status END
         WHERE status IN ('open', 'done', 'dropped')
    ",
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
    /* 115 — the member's division, out of their track. */
    'members.division' => NGG_BACKFILL_MEMBER_DIVISION,
    /* 122 — Summer or NGG, for every volunteer. */
    'volunteers.programme.ngg' => "
        UPDATE volunteers SET programme = 'ngg'
         WHERE (programme IS NULL OR programme = '')
           AND ( applicationId IN (SELECT id FROM applications WHERE program = 'anchor')
              OR ( (applicationId IS NULL OR applicationId = 0)
                   AND memberId IN (SELECT memberId FROM members WHERE UPPER(type) = 'NGG') ) )
    ",
    'volunteers.programme.summer' => "
        UPDATE volunteers SET programme = 'summer' WHERE programme IS NULL OR programme = ''
    ",
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
/**
 * Every table in ONE collation — the one `members` was created with.
 *
 * The mirror's older tables take the server's default (utf8mb4_general_ci on
 * most shared hosts); twenty-odd newer ones named utf8mb4_unicode_ci. MySQL
 * refuses to compare a column of one with a column of the other ("1267
 * Illegal mix of collations"), so any join between an old table and a new one
 * — members with mentor_matches, say — failed the whole request. The fix is
 * not to pick a collation in the mirror but to make the database agree with
 * itself: whatever `members` uses, every other table is converted to.
 *
 * Runs with the mirror (once per deploy). A table whose conversion fails is
 * logged and skipped; the rest still convert. Returns false if any failed.
 */
function db_mysql_unify_collation(PDO $db): bool {
    try {
        $st = $db->query("SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members'");
        $target = $st ? (string)($st->fetchColumn() ?: '') : '';
        if (!preg_match('/^utf8mb4_[a-z0-9_]+$/', $target)) return true;   // nothing to anchor on
        $st = $db->prepare("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_COLLATION <> ?
                            UNION SELECT DISTINCT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME <> ?");
        $st->execute([$target, $target]);
        $tables = $st->fetchAll(PDO::FETCH_COLUMN) ?: [];
    } catch (Throwable $e) {
        error_log('[db] collation check: ' . $e->getMessage());
        return false;
    }
    $ok = true;
    foreach ($tables as $t) {
        if (!preg_match('/^[A-Za-z0-9_]+$/', (string)$t)) continue;
        try {
            $db->exec("ALTER TABLE `$t` CONVERT TO CHARACTER SET utf8mb4 COLLATE $target");
            error_log("[db] collation: $t converted to $target");
        } catch (Throwable $e) {
            $ok = false;
            error_log("[db] collation: $t not converted — " . $e->getMessage());
        }
    }
    return $ok;
}

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
    if (!db_mysql_unify_collation($db)) $allOk = false;
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
        /* The bundled curricula, into the live lessons, one file per request.
         * A fresh install shipped 336 written lessons and showed a member an
         * empty Learn screen until an admin found the import and pressed it
         * four times. See curriculum_seed_bundled_once() for what it refuses
         * to do — it never touches a lesson somebody else put there. */
        if (function_exists('curriculum_seed_bundled_once') && db_table_exists($db, 'curriculum_units')) {
            curriculum_seed_bundled_once();
        }
        /* Phase 1 of the centre-key migration: fill centreId from the centre
           name once, wherever it resolves. A name that resolves to nothing is
           left empty on purpose — those rows are the inventory that
           admin.centres.idaudit reports. */
        if (function_exists('centre_ids_backfill_once') && db_table_exists($db, 'centres')) {
            centre_ids_backfill_once();
        }
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
        /* NGG centres apart from Summer School's, the defaults Egbeda and Ayobo
           in place, members connected (domain/centres-ngg.php). Once. */
        if (function_exists('centres_split_seed_once') && db_table_exists($db, 'centres') && db_table_exists($db, 'members')
            && setting_raw('centres_split_seed') !== CENTRES_SPLIT_SEED) {
            centres_split_seed_once();
        }
    } catch (Throwable $e) {
        error_log('[db] seed: ' . $e->getMessage());
    }
}

function db_migrate(PDO $db): void {
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') return; // MySQL: manual schema file

    $db->exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)");
    $current = (int)($db->query('SELECT IFNULL(MAX(version),0) FROM schema_version')->fetchColumn() ?: 0);
    /* Two branches once both numbered a 137 and a 138: one for CACENTRE's
     * locations and Make.com (now 199 and 200), one for Mentorship. A database
     * that ran the first pair has a 138 and no mentor_matches, and reading only
     * MAX(version) would skip the Mentorship pair for ever. Step it back so
     * 137 onward run again; every statement tolerates "already applied". */
    if ($current >= 137 && $current < 199
        && $db->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='absence_asks'")->fetchColumn()
        && !$db->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='mentor_matches'")->fetchColumn()) {
        $current = 136;
    }
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

        /* ── ID cards: two faces, and a record of what was printed ──────────
         *
         * The design system could express the student and volunteer cards but
         * not the NGG MEMBER card, which is the one every year-round member
         * carries. That card was hand-coded JSX (MemberIDCard / NggcMemberCard)
         * and printed by a batch drawer, so moving a line two millimetres on
         * the credential the organisation issues most was a deploy — the exact
         * problem the template system was built to end, left in place for the
         * one card it mattered most for.
         *
         * `face` + `pairId` are what let a design have a BACK. A card has two
         * sides; a template was one document, so a back either did not exist
         * or was a second unrelated design nobody could tell was the pair. A
         * front names its back and the batch renders both per person, in
         * order, so a duplex run cannot come out mismatched.
         *
         * `card_runs` / `card_issues` are the issuance record. card-templates
         * already froze a published version and bumped it on republish, and
         * its own docblock promised that "a print run stores the version it
         * used, so 'reprint card 147 exactly as it was in July' is answerable
         * a year later" — except nothing stored it. Print runs left an audit
         * line and no rows, so:
         *
         *   · nobody could tell a FIRST issue from a reprint, or count either;
         *   · "which design is the card in this member's hand" had no answer,
         *     so a reprint silently used whatever the current version is;
         *   · a batch that half-printed left nothing to resume from.
         *
         * The template version is denormalised onto both tables on purpose: it
         * is the fact being preserved, and it must survive the template being
         * republished, renamed or deleted afterwards.
         */
        113 => "
            ALTER TABLE card_templates ADD COLUMN face TEXT DEFAULT 'single';   -- front | back | single
            ALTER TABLE card_templates ADD COLUMN pairId TEXT DEFAULT '';       -- the other face's templateId
            CREATE INDEX IF NOT EXISTS idx_ctpl_pair ON card_templates(pairId);

            CREATE TABLE IF NOT EXISTS card_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              runId TEXT NOT NULL UNIQUE,
              kind TEXT NOT NULL DEFAULT 'member',      -- member | student | volunteer | graphic
              mode TEXT NOT NULL DEFAULT 'print',       -- print | reprint | proof
              templateId TEXT DEFAULT '',               -- '' = the built-in hand-coded card
              templateName TEXT DEFAULT '',             -- as it was called at the time
              templateVersion INTEGER DEFAULT 0,        -- the FROZEN version this run used
              backTemplateId TEXT DEFAULT '',
              backTemplateVersion INTEGER DEFAULT 0,
              output TEXT DEFAULT '',                   -- pdf | png | zip | sheet
              dpi INTEGER DEFAULT 0,
              sheet TEXT DEFAULT '',                    -- e.g. 'A4' for an imposed sheet
              requested INTEGER DEFAULT 0,
              issued INTEGER DEFAULT 0,
              failed INTEGER DEFAULT 0,
              reprintOf TEXT DEFAULT '',                -- the runId being reprinted, if any
              reason TEXT DEFAULT '',                   -- why a reprint (creased, lost, name change)
              actorId TEXT DEFAULT '',
              startedAt TEXT DEFAULT '',
              finishedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_crun_at ON card_runs(startedAt);
            CREATE INDEX IF NOT EXISTS idx_crun_kind ON card_runs(kind, startedAt);

            CREATE TABLE IF NOT EXISTS card_issues (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              runId TEXT NOT NULL,
              subjectType TEXT NOT NULL,                -- member | student | volunteer
              subjectId TEXT NOT NULL,
              displayId TEXT DEFAULT '',                -- what was printed on it
              templateId TEXT DEFAULT '',
              templateVersion INTEGER DEFAULT 0,
              reprint INTEGER DEFAULT 0,                -- 1 = this person had one before
              ok INTEGER DEFAULT 1,
              note TEXT DEFAULT '',
              at TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ciss_run ON card_issues(runId);
            CREATE INDEX IF NOT EXISTS idx_ciss_subject ON card_issues(subjectType, subjectId, at);
        ",

        /* 114 — the Courage Index (NGGC 2040 brief §14).
         *
         * The brief names courage as "one of the most important things NGGC
         * should measure" and gives it a 1–5 ladder, and it was the one
         * instrument in the whole brief with nothing behind it: musing lives
         * in the journal, dues and fines in the fees ledger, the NGV rung on
         * members.level, but courage was recorded nowhere.
         *
         * `evidence` is NOT NULL-ish by contract (the domain rejects an empty
         * one) because of the brief's own constraint: courage is scored
         * against something a mentor watched happen, not against an
         * impression of a child. A score with no instance behind it is the
         * failure this table exists to prevent, so the instance is stored
         * beside the number rather than in a note somebody may or may not fill.
         *
         * No UNIQUE on (subjectId, observedOn), deliberately — unlike a star,
         * which is one per child per day to stop inflation, two genuinely
         * separate acts of courage in one afternoon are two observations. The
         * evidence requirement is what bounds this, not the calendar.
         *
         * There is no aggregate column. The index is computed on read from the
         * marks in the window, so a correction to one entry cannot leave a
         * stale total sitting on the child's record. */
        114 => "
            CREATE TABLE IF NOT EXISTS courage_marks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              subjectType TEXT NOT NULL DEFAULT 'member',
              score INTEGER NOT NULL,             -- 1..5, the ladder in the brief
              prompt TEXT DEFAULT '',             -- which of the ten observations, if named
              evidence TEXT NOT NULL DEFAULT '',  -- what the mentor actually saw
              markedById TEXT NOT NULL,
              markedByName TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              observedOn TEXT NOT NULL,           -- YYYY-MM-DD, the day it happened
              createdAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_courage_subject ON courage_marks(subjectId, observedOn);
            CREATE INDEX IF NOT EXISTS idx_courage_marker ON courage_marks(markedById, observedOn);
        ",

        /* 115 — a member belongs to a division (NGGC 2040 brief §5).
         *
         * The brief assigns every member to one of four professional
         * divisions, each with a mandate, and the programme had no column for
         * it — so it could not answer "how many members are in Technology &
         * Applied Engineering", could not report per division, and could not
         * see that chess is taken across all four, which is §6's whole point.
         *
         * NOT the same thing as the academy catalogue's `faculty`, and the two
         * must not be merged. A faculty is what a Summer School edition
         * happens to teach this season and an admin edits it; a division is
         * what an NGG member belongs to for years and the brief fixes it. Same
         * shape, different owners, different lifetimes — see CLAUDE.md §5 on
         * the two programmes being separate.
         *
         * Stored as the id ('arts'|'media'|'tech'|'business'), not the display
         * name, so renaming a division in the brief does not rewrite every row.
         * Blank is a legitimate value: a member nobody has placed yet. */
        115 => "
            ALTER TABLE members ADD COLUMN division TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_members_division ON members(division);
        " . NGG_BACKFILL_MEMBER_DIVISION . ";",

        /* 116 — the mentor's weekly review (NGGC 2040 brief §18).
         *
         * Twelve questions a mentor should be able to answer for every
         * assigned member, every week. Nothing prompted them and nothing
         * recorded the answers, so the only trace a mentor left was a star for
         * today, a V3 for this week, and whatever meetings they happened to
         * write up. The brief's point is the CADENCE: a child nobody reviewed
         * for three weeks is the finding, and it was invisible.
         *
         * ONE ROW PER (subject, period), like v3_scores — a review is a weekly
         * artefact, and a second one for the same week is an edit of the first,
         * not a new review. That is what makes 'who has not been reviewed this
         * week' a single query instead of a scan.
         *
         * `answers` is JSON keyed by nggc_weekly_review_keys(), not twelve
         * columns. The twelve are the brief's and the brief can be amended;
         * twelve columns would make a thirteenth question a migration and a
         * deploy, and would leave the twelve column names as a second list of
         * the questions that could drift from formation.php. The keys are
         * validated on the way in, so the flexibility does not cost the closed
         * set.
         *
         * `concern` mirrors mentor_meetings: the one flag that puts a child in
         * front of a lead. It is stored rather than derived from the text,
         * because a mentor deciding to raise something is a different act from
         * a mentor writing a worried sentence. */
        116 => "
            CREATE TABLE IF NOT EXISTS mentor_reviews (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              subjectType TEXT NOT NULL DEFAULT 'member',
              period TEXT NOT NULL,              -- ISO week, e.g. 2026-W38
              answers TEXT,                      -- JSON, keys from nggc_weekly_review_keys()
              answered INTEGER DEFAULT 0,        -- how many of the twelve carry text
              concern INTEGER DEFAULT 0,
              mentorId TEXT NOT NULL,
              mentorName TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mrev_one ON mentor_reviews(subjectId, period);
            CREATE INDEX IF NOT EXISTS idx_mrev_period ON mentor_reviews(period, centre);
            CREATE INDEX IF NOT EXISTS idx_mrev_mentor ON mentor_reviews(mentorId, period);
        ",

        /* 117 — why a member was promoted (NGGC 2040 brief §20).
         *
         * "A member should not become an NGV merely because they have been
         * around for a certain amount of time. Progression should be based on
         * evidence of formation."
         *
         * The promotion itself already existed and is thorough —
         * admin_member_promote_ngv provisions the volunteer record, the ID and
         * the two-way link, idempotently. What it recorded was that a
         * promotion happened and who pressed the button. Not why. So the one
         * question §20 cares about — was this child promoted on evidence or on
         * tenure — had no answer six months later, and the audit line could
         * not supply one.
         *
         * `evidence` is the promoter's own sentence and is required by the
         * domain. `readiness` is a JSON snapshot of the formation record AS IT
         * STOOD at the moment of promotion: the courage index, how many of the
         * last eight weeks carried a mentor review, attendance, stars, dues
         * standing. Snapshotted rather than recomputed on read, because the
         * question is "what did they know when they decided", and a figure
         * recomputed in March answers a different question.
         *
         * Append-only. A demotion writes its own row rather than deleting
         * this one: a member promoted, revoked and re-promoted has a history,
         * and that history is the formation record §20 is asking for. */
        117 => "
            CREATE TABLE IF NOT EXISTS member_promotions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              fromStage TEXT NOT NULL DEFAULT 'NGG',
              toStage TEXT NOT NULL DEFAULT 'NGV',
              evidence TEXT NOT NULL DEFAULT '',
              readiness TEXT,
              volunteerId TEXT DEFAULT '',
              byId TEXT NOT NULL,
              byName TEXT DEFAULT '',
              at TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mprom_member ON member_promotions(memberId, id);
            CREATE INDEX IF NOT EXISTS idx_mprom_at ON member_promotions(at);
        ",

        /* Quote of the week — Hausa riddles, Igbo and Yoruba proverbs, shown on
         * the home page one a week in a fixed language rotation. The rows are
         * seeded by domain/wisdom.php (not here: the sayings contain `;`,
         * which the migration splitter would cut on). `position` orders a
         * language's own list; the rotation interleaves the languages.
         * audioFile is a stored clip — a staff voice-over (`custom`) or one
         * generated once by the TTS provider (`tts`) — never a per-play call. */
        118 => "
            CREATE TABLE IF NOT EXISTS wisdom_sayings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              wisdomId TEXT UNIQUE NOT NULL,
              language TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'proverb',
              text TEXT NOT NULL,
              translation TEXT DEFAULT '',
              answer TEXT DEFAULT '',
              answerTranslation TEXT DEFAULT '',
              meaning TEXT DEFAULT '',
              position INTEGER DEFAULT 0,
              status TEXT DEFAULT 'live',
              audioFile TEXT DEFAULT '',
              audioSource TEXT DEFAULT '',
              voice TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_wisdom_lang ON wisdom_sayings(language, status, position);
        ",

        /* Quote of the week, second clip: the English translation read after
         * the saying, and the stamp that stops a failing automatic voice from
         * being retried on every visit. */
        119 => "
            ALTER TABLE wisdom_sayings ADD COLUMN audioFileEn TEXT DEFAULT '';
            ALTER TABLE wisdom_sayings ADD COLUMN voiceEn TEXT DEFAULT '';
            ALTER TABLE wisdom_sayings ADD COLUMN ttsTriedAt TEXT DEFAULT '';
        ",

        /* Quote of the week, generate-once: every TTS clip ever made, keyed by
         * what determines it (language|voice|speed|script), so the same audio
         * is never paid for twice. `score`/`heard` are the listen-back — the
         * provider's own transcript of the clip and how well it matched.
         * `spokenText` is staff's "how it should be read" spelling. */
        120 => "
            CREATE TABLE IF NOT EXISTS wisdom_tts_clips (
              cacheKey TEXT PRIMARY KEY,
              file TEXT NOT NULL,
              language TEXT NOT NULL,
              voice TEXT NOT NULL,
              script TEXT NOT NULL,
              score REAL,
              heard TEXT DEFAULT '',
              createdAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_wtts_file ON wisdom_tts_clips(file);
            ALTER TABLE wisdom_sayings ADD COLUMN spokenText TEXT DEFAULT '';
            ALTER TABLE wisdom_sayings ADD COLUMN ttsScore REAL;
            ALTER TABLE wisdom_sayings ADD COLUMN ttsScoreEn REAL;
        ",

        /* Member cards — what the CACENTRE gate reads (domain/member-cards.php).
         * A secure MEMQR- card per NGG member, and the printed cards members
         * already hold, by the format that reads them. */
        121 => "
            CREATE TABLE IF NOT EXISTS member_cards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'secure',
              code TEXT NOT NULL,
              format TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'active',
              source TEXT DEFAULT '',
              issuedBy TEXT DEFAULT '',
              issuedAt TEXT DEFAULT '',
              voidedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_member_cards_code ON member_cards(kind, format, code);
            CREATE INDEX IF NOT EXISTS idx_member_cards_member ON member_cards(memberId, status);
        ",
        /* Printed IDs are CLAIMED: one row per id, the id its primary key, so
           two records can never hold one id — enforced by the database, not by
           every writer remembering to check. A unique index on members would
           fail to build on any deployment that already has a duplicate and
           take the site down with it; this cannot. The backfill gives each id
           to its EARLIEST holder and leaves the rest for the duplicates
           report. Claims are permanent: a retired or merged record's id stays
           claimed, because it is still printed on somebody's card. */
        122 => "
            CREATE TABLE IF NOT EXISTS member_display_ids (
              displayKey TEXT PRIMARY KEY,
              displayId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              claimedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mdi_member ON member_display_ids(memberId);
            INSERT OR IGNORE INTO member_display_ids (displayKey, displayId, memberId, claimedAt)
              SELECT UPPER(TRIM(displayId)), TRIM(displayId), memberId, COALESCE(createdAt, '')
                FROM members WHERE TRIM(COALESCE(displayId, '')) <> '' AND COALESCE(type, 'NGG') <> 'Summer'
               ORDER BY id;
            ALTER TABLE applications ADD COLUMN importKey TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_apps_importkey ON applications(importKey);
        ",
        /* 123 — a club admin's sensitive actions wait for a second admin
         * (domain/approvals.php), and volunteers say which programme they
         * serve: Summer School, the year-round Club, or both. */
        123 => "
            CREATE TABLE IF NOT EXISTS admin_approvals (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              approvalId TEXT UNIQUE NOT NULL,
              op TEXT NOT NULL,
              args TEXT NOT NULL DEFAULT '',
              summary TEXT NOT NULL DEFAULT '',
              requesterId TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              decidedBy TEXT DEFAULT '',
              decidedAt TEXT DEFAULT '',
              reason TEXT DEFAULT '',
              result TEXT DEFAULT '',
              createdAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_appr_status ON admin_approvals(status, id);
            CREATE INDEX IF NOT EXISTS idx_appr_requester ON admin_approvals(requesterId, id);
            ALTER TABLE volunteers ADD COLUMN programme TEXT DEFAULT 'summer';
            ALTER TABLE applications ADD COLUMN programme TEXT DEFAULT '';
        ",

        /* A centre is one identity for both programmes — its name, code, colour
         * and printed prefix — but Summer School often runs at a different
         * VENUE from the year-round Club. The address and map point were the
         * Club's, so a Summer family was sent to the wrong building and the
         * registration desk's fence was drawn round the wrong one. The Summer
         * venue is its own optional address and point; blank means the Summer
         * School meets where the Club does (centre_point()). */
        124 => "
            ALTER TABLE centres ADD COLUMN summerAddress TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN summerArea TEXT DEFAULT '';
            ALTER TABLE centres ADD COLUMN summerLat REAL;
            ALTER TABLE centres ADD COLUMN summerLng REAL;
        ",

        /* The NGG Club curriculum (domain/curriculum.php). A unit is one
         * lesson: course → level → week → position is its natural key, so a
         * re-import of the same sheet updates rather than duplicates. Materials
         * and checks hang off a unit; progress is one row per member per unit,
         * carrying the unit VERSION it was marked against, because changing a
         * lesson's checks after somebody sat them makes the old score answer a
         * different question. */
        125 => "
            CREATE TABLE IF NOT EXISTS curriculum_units (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              unitId TEXT UNIQUE NOT NULL,
              course TEXT NOT NULL DEFAULT '',
              level TEXT NOT NULL DEFAULT '',
              week INTEGER NOT NULL DEFAULT 1,
              position INTEGER NOT NULL DEFAULT 1,
              title TEXT NOT NULL DEFAULT '',
              summary TEXT DEFAULT '',
              objectives TEXT DEFAULT '',
              body TEXT DEFAULT '',
              durationMins INTEGER DEFAULT 0,
              passMark INTEGER DEFAULT 60,
              status TEXT NOT NULL DEFAULT 'draft',
              version INTEGER NOT NULL DEFAULT 1,
              source TEXT DEFAULT 'manual',
              createdBy TEXT DEFAULT '', updatedBy TEXT DEFAULT '',
              createdAt TEXT DEFAULT '', updatedAt TEXT DEFAULT '', publishedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cunit_key ON curriculum_units(course, level, week, position);
            CREATE INDEX IF NOT EXISTS idx_cunit_status ON curriculum_units(status, course);
            CREATE TABLE IF NOT EXISTS curriculum_materials (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              materialId TEXT UNIQUE NOT NULL,
              unitId TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'link',
              title TEXT DEFAULT '',
              url TEXT NOT NULL DEFAULT '',
              position INTEGER DEFAULT 1,
              createdAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_cmat_unit ON curriculum_materials(unitId, position);
            CREATE TABLE IF NOT EXISTS curriculum_checks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              checkId TEXT UNIQUE NOT NULL,
              unitId TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'mcq',
              prompt TEXT NOT NULL DEFAULT '',
              options TEXT DEFAULT '',
              answer TEXT DEFAULT '',
              rubric TEXT DEFAULT '',
              points INTEGER DEFAULT 1,
              position INTEGER DEFAULT 1,
              source TEXT DEFAULT 'manual',
              videoUrl TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ccheck_unit ON curriculum_checks(unitId, position);
            CREATE TABLE IF NOT EXISTS curriculum_progress (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              unitId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'started',
              unitVersion INTEGER DEFAULT 1,
              score REAL DEFAULT 0,
              maxScore REAL DEFAULT 0,
              bestPct INTEGER DEFAULT 0,
              attempts INTEGER DEFAULT 0,
              answers TEXT DEFAULT '',
              marks TEXT DEFAULT '',
              feedback TEXT DEFAULT '',
              pending INTEGER DEFAULT 0,
              markedBy TEXT DEFAULT '',
              startedAt TEXT DEFAULT '', completedAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cprog_key ON curriculum_progress(unitId, memberId);
            CREATE INDEX IF NOT EXISTS idx_cprog_member ON curriculum_progress(memberId);
            CREATE INDEX IF NOT EXISTS idx_cprog_pending ON curriculum_progress(pending, unitId);
        ",
        // Materials instructors submit wait for approval; members see only approved.
        126 => "
            ALTER TABLE curriculum_materials ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
            ALTER TABLE curriculum_materials ADD COLUMN note TEXT DEFAULT '';
            ALTER TABLE curriculum_materials ADD COLUMN submittedBy TEXT DEFAULT '';
            ALTER TABLE curriculum_materials ADD COLUMN reviewedBy TEXT DEFAULT '';
            ALTER TABLE curriculum_materials ADD COLUMN reviewedAt TEXT DEFAULT '';
            ALTER TABLE curriculum_materials ADD COLUMN reviewNote TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_cmat_status ON curriculum_materials(status, unitId);
        ",
        // The companion's weekly assessment of each NGG member (domain/companion.php).
        127 => "
            CREATE TABLE IF NOT EXISTS member_assessments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              period TEXT NOT NULL,
              rating TEXT NOT NULL DEFAULT 'on_track',
              reasons TEXT DEFAULT '',
              metrics TEXT DEFAULT '',
              summary TEXT DEFAULT '',
              strengths TEXT DEFAULT '',
              focus TEXT DEFAULT '',
              source TEXT DEFAULT 'rules',
              mailedAt TEXT DEFAULT '',
              createdAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_massess_key ON member_assessments(memberId, period);
            CREATE INDEX IF NOT EXISTS idx_massess_period ON member_assessments(period, rating);
        ",

        /* Family accounts — a parent's or guardian's own sign-in, holding the
         * NGG members they look after. A guardian is NOT a member: separate
         * table, separate cookie, no capability, and a ward is reached only
         * through an active link. `sessionEpoch` is the "sign out everywhere"
         * switch — the cookie carries it, and bumping it ends every copy.
         * `raisedBy` marks a member request a guardian raised, so the desk
         * knows who to answer and the guardian sees only their own. */
        128 => "
            CREATE TABLE IF NOT EXISTS guardians (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              guardianId TEXT UNIQUE NOT NULL,
              email TEXT NOT NULL,
              fullName TEXT DEFAULT '',
              phone TEXT DEFAULT '',
              status TEXT DEFAULT 'active',
              sessionEpoch INTEGER DEFAULT 1,
              weeklySentFor TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT '',
              lastSeenAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_guardians_email ON guardians(email);
            CREATE TABLE IF NOT EXISTS guardian_wards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              linkId TEXT UNIQUE NOT NULL,
              guardianId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              relationship TEXT DEFAULT 'parent',
              status TEXT DEFAULT 'active',
              via TEXT DEFAULT '',
              notify TEXT DEFAULT '',
              note TEXT DEFAULT '',
              decidedBy TEXT DEFAULT '',
              decidedAt TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_gwards_guardian ON guardian_wards(guardianId, status);
            CREATE INDEX IF NOT EXISTS idx_gwards_member ON guardian_wards(memberId, status);
            ALTER TABLE member_requests ADD COLUMN raisedBy TEXT DEFAULT '';
        ",

        /* The timetable — which course meets when, where, and with whom, per
         * centre. Keyed to the centre by centreId, not its name, so renaming a
         * centre carries its timetable with it. Times are 'HH:MM', 24-hour, on
         * a weekday 1 (Monday) … 7 (Sunday). Clashes are refused on the way in
         * (domain/timetable.php), not stored and flagged later. */
        129 => "
            CREATE TABLE IF NOT EXISTS timetable_slots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              slotId TEXT UNIQUE NOT NULL,
              centreId TEXT NOT NULL,
              course TEXT NOT NULL,
              level TEXT DEFAULT '',
              weekday INTEGER NOT NULL,
              startTime TEXT NOT NULL,
              endTime TEXT NOT NULL,
              room TEXT DEFAULT '',
              instructorId TEXT DEFAULT '',
              note TEXT DEFAULT '',
              status TEXT DEFAULT 'active',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT '',
              updatedBy TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_tt_centre ON timetable_slots(centreId, weekday, status);
            CREATE INDEX IF NOT EXISTS idx_tt_instructor ON timetable_slots(instructorId, weekday, status);
        ",
        /* 130 — which programmes run at a centre. One centres table serves the
         * year-round Club and Summer School, and with no marker every centre
         * list offered every centre to both. 'ngg,summer' keeps today's
         * behaviour for every existing row; a centre is narrowed on purpose. */
        130 => "ALTER TABLE centres ADD COLUMN programmes TEXT DEFAULT 'ngg,summer';",
        // 131: personal timetables (the public Timetable Maker). A member's own week,
        // and the weeks kept behind an emailed link (token stored as its sha256).
        131 => "CREATE TABLE IF NOT EXISTS member_timetables (memberId TEXT PRIMARY KEY, doc TEXT NOT NULL, updatedAt TEXT NOT NULL);"
             . "CREATE TABLE IF NOT EXISTS timetable_links (tokenHash TEXT PRIMARY KEY, email TEXT NOT NULL, doc TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, expiresAt TEXT NOT NULL, revokedAt TEXT NOT NULL DEFAULT '');"
             . "CREATE INDEX IF NOT EXISTS idx_timetable_links_email ON timetable_links(email, createdAt);",
        // ID Card Studio: the reprint queue and single-person photo asks (domain/id-studio.php).
        132 => "CREATE TABLE IF NOT EXISTS id_reprints (id INTEGER PRIMARY KEY AUTOINCREMENT, subjectType TEXT NOT NULL, subjectId TEXT NOT NULL, why TEXT NOT NULL DEFAULT '', requestedBy TEXT NOT NULL DEFAULT '', requestedAt TEXT NOT NULL, doneRunId TEXT NOT NULL DEFAULT '', doneAt TEXT NOT NULL DEFAULT '');"
             . "CREATE INDEX IF NOT EXISTS idx_id_reprints_subject ON id_reprints(subjectType, subjectId, doneAt);"
             . "CREATE TABLE IF NOT EXISTS id_photo_asks (id INTEGER PRIMARY KEY AUTOINCREMENT, subjectType TEXT NOT NULL, subjectId TEXT NOT NULL, askedBy TEXT NOT NULL DEFAULT '', askedAt TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);"
             . "CREATE INDEX IF NOT EXISTS idx_id_photo_asks_subject ON id_photo_asks(subjectType, subjectId);",
        // ID Card Studio: the design each card type prints with, and which channels a photo ask reached.
        133 => "CREATE TABLE IF NOT EXISTS id_designs (kind TEXT PRIMARY KEY, templateId TEXT NOT NULL DEFAULT '', setBy TEXT NOT NULL DEFAULT '', setAt TEXT NOT NULL DEFAULT '');"
             . "ALTER TABLE id_photo_asks ADD COLUMN channels TEXT NOT NULL DEFAULT '';",
        /* 134 — replies to contact messages, sent from the Control Room inbox
           rather than from somebody's own mail app, so the conversation is on
           the record and the next person to open it can see what was said. */
        134 => "CREATE TABLE IF NOT EXISTS contact_replies (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  messageId INTEGER NOT NULL,
                  body TEXT NOT NULL DEFAULT '',
                  sentBy TEXT NOT NULL DEFAULT '',
                  sentByName TEXT NOT NULL DEFAULT '',
                  sentAt TEXT NOT NULL DEFAULT '',
                  channel TEXT NOT NULL DEFAULT 'email'
                );
                CREATE INDEX IF NOT EXISTS idx_contact_replies_msg ON contact_replies(messageId);
                CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_messages(email);",
        /* 135 — paying to join (domain/membership-pay.php). An accepted NGG
           applicant is sent ONE invoice: the membership fee and the joining
           month's commitment fee, pro-rated to the day they start. It is paid
           through Paystack, or offline — and an offline payment is a claim
           until a second member of staff has checked it against its evidence.
           The evidence's hash and the bank reference are unique, so one
           transfer slip cannot settle two invoices. */
        135 => "CREATE TABLE IF NOT EXISTS membership_invoices (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  invoiceId TEXT NOT NULL UNIQUE,
                  memberId TEXT NOT NULL,
                  applicationId INTEGER NOT NULL DEFAULT 0,
                  payToken TEXT NOT NULL UNIQUE,
                  items TEXT NOT NULL DEFAULT '[]',
                  total INTEGER NOT NULL DEFAULT 0,
                  currency TEXT NOT NULL DEFAULT 'NGN',
                  startDate TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'open',
                  paystackRef TEXT NOT NULL DEFAULT '',
                  paidVia TEXT NOT NULL DEFAULT '',
                  paidAt TEXT NOT NULL DEFAULT '',
                  receiptNo TEXT NOT NULL DEFAULT '',
                  receiptToken TEXT NOT NULL DEFAULT '',
                  sentTo TEXT NOT NULL DEFAULT '',
                  sentAt TEXT NOT NULL DEFAULT '',
                  createdBy TEXT NOT NULL DEFAULT '',
                  createdAt TEXT NOT NULL DEFAULT '',
                  voidReason TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_minv_member ON membership_invoices(memberId);
                CREATE INDEX IF NOT EXISTS idx_minv_status ON membership_invoices(status);
                CREATE TABLE IF NOT EXISTS offline_payments (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  paymentId TEXT NOT NULL UNIQUE,
                  invoiceId TEXT NOT NULL,
                  memberId TEXT NOT NULL,
                  amount INTEGER NOT NULL DEFAULT 0,
                  method TEXT NOT NULL DEFAULT '',
                  payerName TEXT NOT NULL DEFAULT '',
                  bankName TEXT NOT NULL DEFAULT '',
                  reference TEXT NOT NULL DEFAULT '',
                  referenceKey TEXT NOT NULL DEFAULT '',
                  paidOn TEXT NOT NULL DEFAULT '',
                  evidenceSha256 TEXT NOT NULL UNIQUE,
                  evidenceFile TEXT NOT NULL DEFAULT '',
                  evidenceType TEXT NOT NULL DEFAULT '',
                  evidenceBytes INTEGER NOT NULL DEFAULT 0,
                  note TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'pending',
                  recordedBy TEXT NOT NULL DEFAULT '',
                  recordedAt TEXT NOT NULL DEFAULT '',
                  verifiedBy TEXT NOT NULL DEFAULT '',
                  verifiedAt TEXT NOT NULL DEFAULT '',
                  rejectReason TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_offpay_invoice ON offline_payments(invoiceId);
                CREATE INDEX IF NOT EXISTS idx_offpay_ref ON offline_payments(referenceKey);",
        // 136 — what the money rules say, held by the database too, so two
        // requests racing past the checks in membership-pay.php still cannot
        // mint one receipt number twice, accept one bank reference twice, or
        // hold two claims waiting on one invoice. And the measured framing of
        // each photograph (domain/photo-framing.php).
        136 => "CREATE UNIQUE INDEX IF NOT EXISTS uq_minv_receipt ON membership_invoices(receiptNo) WHERE receiptNo <> '';
                CREATE UNIQUE INDEX IF NOT EXISTS uq_offpay_live_ref ON offline_payments(referenceKey) WHERE status <> 'rejected';
                CREATE UNIQUE INDEX IF NOT EXISTS uq_offpay_one_pending ON offline_payments(invoiceId) WHERE status = 'pending';
                CREATE TABLE IF NOT EXISTS photo_framing (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  urlKey TEXT NOT NULL UNIQUE,
                  url TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'none',
                  geomJson TEXT NOT NULL DEFAULT '',
                  adjustJson TEXT NOT NULL DEFAULT '',
                  model TEXT NOT NULL DEFAULT '',
                  error TEXT NOT NULL DEFAULT '',
                  createdAt TEXT NOT NULL DEFAULT '',
                  updatedAt TEXT NOT NULL DEFAULT '',
                  updatedBy TEXT NOT NULL DEFAULT ''
                );",

        /* 137 — Mentorship: Anchor Pods, the five phases, a choice of two
         * mentors, cadence, the adaptive rules R1–R8, interventions,
         * safeguarding cases, the Mentor Academy and the NGGC Mentorship
         * Commitment & Conduct Policy (domain/mentorship-pods.php).
         *
         * mentor_assignments stays the pairing every older screen reads; a
         * match that becomes active writes one, so nothing downstream forks. */
        137 => "
            CREATE TABLE IF NOT EXISTS mentor_matches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL UNIQUE,
              memberId TEXT NOT NULL,
              mentorId TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              track TEXT NOT NULL DEFAULT '',
              phase TEXT NOT NULL DEFAULT 'match',
              status TEXT NOT NULL DEFAULT 'offered',
              offeredAt TEXT NOT NULL DEFAULT '',
              startedAt TEXT NOT NULL DEFAULT '',
              chosenBy TEXT NOT NULL DEFAULT '',
              agreementJson TEXT NOT NULL DEFAULT '',
              closingAt TEXT NOT NULL DEFAULT '',
              closedAt TEXT NOT NULL DEFAULT '',
              closeReason TEXT NOT NULL DEFAULT '',
              createdBy TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mmatch_member ON mentor_matches(memberId, status);
            CREATE INDEX IF NOT EXISTS idx_mmatch_mentor ON mentor_matches(mentorId, status);
            CREATE TABLE IF NOT EXISTS mentor_match_offers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL,
              mentorId TEXT NOT NULL,
              rank INTEGER NOT NULL DEFAULT 1,
              fit INTEGER NOT NULL DEFAULT 0,
              why TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'open'
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_moffer ON mentor_match_offers(matchId, mentorId);
            CREATE TABLE IF NOT EXISTS mentor_tasks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL DEFAULT '',
              memberId TEXT NOT NULL DEFAULT '',
              mentorId TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              kind TEXT NOT NULL,
              owner TEXT NOT NULL DEFAULT 'mentor',
              dueOn TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open',
              doneAt TEXT NOT NULL DEFAULT '',
              doneBy TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mtask_mentor ON mentor_tasks(mentorId, status, dueOn);
            CREATE INDEX IF NOT EXISTS idx_mtask_match ON mentor_tasks(matchId, kind, status);
            CREATE TABLE IF NOT EXISTS mentor_nudges (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nudgeKey TEXT NOT NULL UNIQUE,
              rule TEXT NOT NULL,
              audience TEXT NOT NULL,
              mentorId TEXT NOT NULL DEFAULT '',
              memberId TEXT NOT NULL DEFAULT '',
              matchId TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL DEFAULT '',
              body TEXT NOT NULL DEFAULT '',
              suggestion TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'open',
              createdAt TEXT NOT NULL DEFAULT '',
              resolvedAt TEXT NOT NULL DEFAULT '',
              resolvedBy TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mnudge_open ON mentor_nudges(status, audience, centre);
            CREATE TABLE IF NOT EXISTS mentor_interventions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL DEFAULT '',
              memberId TEXT NOT NULL DEFAULT '',
              mentorId TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              rule TEXT NOT NULL DEFAULT '',
              reason TEXT NOT NULL DEFAULT '',
              plan TEXT NOT NULL DEFAULT '',
              ownerId TEXT NOT NULL DEFAULT '',
              ownerName TEXT NOT NULL DEFAULT '',
              reviewOn TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'open',
              outcome TEXT NOT NULL DEFAULT '',
              createdBy TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT '',
              closedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_miv_open ON mentor_interventions(status, centre);
            CREATE TABLE IF NOT EXISTS mentor_relationship_checks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              matchId TEXT NOT NULL,
              respondent TEXT NOT NULL,
              term TEXT NOT NULL,
              q1 INTEGER NOT NULL, q2 INTEGER NOT NULL, q3 INTEGER NOT NULL, q4 INTEGER NOT NULL,
              avg REAL NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              byId TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mrelchk ON mentor_relationship_checks(matchId, respondent, term);
            CREATE TABLE IF NOT EXISTS mentor_observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              mentorId TEXT NOT NULL,
              matchId TEXT NOT NULL DEFAULT '',
              onDate TEXT NOT NULL,
              indicator TEXT NOT NULL,
              level INTEGER NOT NULL DEFAULT 0,
              evidence TEXT NOT NULL DEFAULT '',
              strength TEXT NOT NULL DEFAULT '',
              growth TEXT NOT NULL DEFAULT '',
              nextChallenge TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mobs ON mentor_observations(memberId, onDate, indicator);
            CREATE TABLE IF NOT EXISTS mentor_academy (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT NOT NULL,
              moduleId TEXT NOT NULL,
              score INTEGER NOT NULL DEFAULT 0,
              passedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_macad ON mentor_academy(mentorId, moduleId);
            CREATE TABLE IF NOT EXISTS mentor_policy (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT NOT NULL,
              policyVersion TEXT NOT NULL,
              signedName TEXT NOT NULL DEFAULT '',
              acceptedAt TEXT NOT NULL DEFAULT '',
              ip TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mpolicy ON mentor_policy(mentorId, policyVersion);
            CREATE TABLE IF NOT EXISTS mentor_obligations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT NOT NULL,
              kind TEXT NOT NULL,
              onDate TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'present',
              note TEXT NOT NULL DEFAULT '',
              recordedBy TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mobl ON mentor_obligations(mentorId, kind, onDate);
            CREATE TABLE IF NOT EXISTS mentor_checkins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT NOT NULL,
              weekOf TEXT NOT NULL,
              feeling TEXT NOT NULL DEFAULT '',
              wins TEXT NOT NULL DEFAULT '',
              hard TEXT NOT NULL DEFAULT '',
              needSupport INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL DEFAULT '',
              followedUpAt TEXT NOT NULL DEFAULT '',
              followedUpBy TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mchk_mentor ON mentor_checkins(mentorId, weekOf);
            CREATE TABLE IF NOT EXISTS safeguarding_cases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              caseNo TEXT NOT NULL UNIQUE,
              reporterId TEXT NOT NULL,
              reporterName TEXT NOT NULL DEFAULT '',
              subjectId TEXT NOT NULL DEFAULT '',
              subjectName TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              category TEXT NOT NULL DEFAULT '',
              body TEXT NOT NULL,
              officerId TEXT NOT NULL DEFAULT '',
              officerName TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'received',
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_sgcase_centre ON safeguarding_cases(centre, status);
            CREATE TABLE IF NOT EXISTS safeguarding_notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              caseNo TEXT NOT NULL,
              byId TEXT NOT NULL DEFAULT '',
              byName TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS mentee_profiles (
              memberId TEXT PRIMARY KEY,
              interests TEXT NOT NULL DEFAULT '',
              wantsTo TEXT NOT NULL DEFAULT '',
              supportArea TEXT NOT NULL DEFAULT '',
              availability TEXT NOT NULL DEFAULT '',
              style TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT '',
              updatedBy TEXT NOT NULL DEFAULT ''
            );
            ALTER TABLE mentors ADD COLUMN leavingAt TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN leavingNote TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN cimcAt TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN anthemAt TEXT DEFAULT '';
            ALTER TABLE mentor_reviews ADD COLUMN trend TEXT DEFAULT '';",

        /* 138 — The Mentor Portal (design handoff: mentor portal v14):
         * WOOP goals with check-ins, sessions with a length, the NGG
         * Leadership Index scored monthly, the relationship check by side
         * and cycle, Saturday (agenda, register, weekly review), messages
         * and family updates, supervision and the retreat, the member's own
         * weekly check-in, the role a mentor plays, and the background jobs'
         * run log. One safeguarding queue: mentor concerns join
         * community_safeguarding. (domain/mentor-portal.php) */
        138 => "
            ALTER TABLE mentor_meetings ADD COLUMN minutes INTEGER DEFAULT 0;
            ALTER TABLE mentor_meetings ADD COLUMN goalId INTEGER DEFAULT 0;
            ALTER TABLE mentor_meetings ADD COLUMN sharedWithLead INTEGER DEFAULT 0;
            ALTER TABLE mentor_goals ADD COLUMN area TEXT DEFAULT 'Character';
            ALTER TABLE mentor_goals ADD COLUMN outcome TEXT DEFAULT '';
            ALTER TABLE mentor_goals ADD COLUMN obstacle TEXT DEFAULT '';
            ALTER TABLE mentor_goals ADD COLUMN plan TEXT DEFAULT '';
            ALTER TABLE mentor_goals ADD COLUMN agreed INTEGER DEFAULT 0;
            ALTER TABLE mentor_goals ADD COLUMN reviewBy TEXT DEFAULT '';
            UPDATE mentor_goals SET status = 'active' WHERE status = 'open';
            UPDATE mentor_goals SET status = 'achieved' WHERE status = 'done';
            UPDATE mentor_goals SET status = 'paused' WHERE status = 'dropped';
            CREATE TABLE IF NOT EXISTS mentor_goal_checkins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              goalId INTEGER NOT NULL,
              subjectId TEXT NOT NULL,
              progress INTEGER NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              byKind TEXT NOT NULL DEFAULT 'mentor',
              byId TEXT NOT NULL DEFAULT '',
              sessionId INTEGER NOT NULL DEFAULT 0,
              checkedOn TEXT NOT NULL,
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mgc_goal ON mentor_goal_checkins(goalId, checkedOn);
            CREATE TABLE IF NOT EXISTS mentor_scorecards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              month TEXT NOT NULL,
              scores TEXT NOT NULL,
              total INTEGER NOT NULL,
              byKind TEXT NOT NULL DEFAULT 'mentor',
              mentorId TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              locked INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_msc_one ON mentor_scorecards(subjectId, month, byKind);
            CREATE INDEX IF NOT EXISTS idx_msc_centre ON mentor_scorecards(centre, month);
            CREATE TABLE IF NOT EXISTS mentor_rel_checks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectId TEXT NOT NULL,
              side TEXT NOT NULL,
              answers TEXT NOT NULL,
              score INTEGER NOT NULL,
              cycle TEXT NOT NULL,
              byId TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mrc_one ON mentor_rel_checks(subjectId, side, cycle);
            ALTER TABLE mentor_reviews ADD COLUMN effort TEXT DEFAULT '';
            ALTER TABLE mentor_reviews ADD COLUMN characterLevel TEXT DEFAULT '';
            ALTER TABLE mentor_reviews ADD COLUMN wellbeing TEXT DEFAULT '';
            ALTER TABLE mentor_reviews ADD COLUMN line TEXT DEFAULT '';
            CREATE TABLE IF NOT EXISTS mentor_saturdays (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT NOT NULL,
              onDate TEXT NOT NULL,
              agendaJson TEXT NOT NULL DEFAULT '',
              oneToOnesJson TEXT NOT NULL DEFAULT '',
              registerClosedAt TEXT NOT NULL DEFAULT '',
              sharedAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_msat_one ON mentor_saturdays(mentorId, onDate);
            CREATE TABLE IF NOT EXISTS mentor_register (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              onDate TEXT NOT NULL,
              subjectId TEXT NOT NULL,
              mentorId TEXT NOT NULL,
              here INTEGER NOT NULL DEFAULT 0,
              observed TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mreg_one ON mentor_register(onDate, subjectId);
            CREATE TABLE IF NOT EXISTS mentor_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              threadId TEXT NOT NULL,
              kind TEXT NOT NULL,
              subjectId TEXT NOT NULL DEFAULT '',
              fromId TEXT NOT NULL DEFAULT '',
              fromName TEXT NOT NULL DEFAULT '',
              toId TEXT NOT NULL DEFAULT '',
              channel TEXT NOT NULL DEFAULT 'portal',
              body TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'sent',
              sendAfter TEXT NOT NULL DEFAULT '',
              readAt TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mmsg_to ON mentor_messages(toId, readAt);
            CREATE INDEX IF NOT EXISTS idx_mmsg_thread ON mentor_messages(threadId, createdAt);
            CREATE TABLE IF NOT EXISTS member_checkins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              week TEXT NOT NULL,
              wellbeing TEXT NOT NULL,
              sleep INTEGER NOT NULL DEFAULT 0,
              stress INTEGER NOT NULL DEFAULT 0,
              energy INTEGER NOT NULL DEFAULT 0,
              note TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mchkin_one ON member_checkins(memberId, week);
            CREATE TABLE IF NOT EXISTS mentor_supervision (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorId TEXT NOT NULL,
              leadId TEXT NOT NULL DEFAULT '',
              onDate TEXT NOT NULL DEFAULT '',
              prepJson TEXT NOT NULL DEFAULT '',
              agreedJson TEXT NOT NULL DEFAULT '',
              feedback TEXT NOT NULL DEFAULT '',
              feedbackAt TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'booked',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_msup_mentor ON mentor_supervision(mentorId, onDate);
            CREATE TABLE IF NOT EXISTS mentor_retreats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              retreatId TEXT NOT NULL UNIQUE,
              title TEXT NOT NULL DEFAULT '',
              onDate TEXT NOT NULL,
              place TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS mentor_retreat_bookings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              retreatId TEXT NOT NULL,
              mentorId TEXT NOT NULL,
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_mrb_one ON mentor_retreat_bookings(retreatId, mentorId);
            CREATE TABLE IF NOT EXISTS mentor_job_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              job TEXT NOT NULL,
              ranAt TEXT NOT NULL,
              found INTEGER NOT NULL DEFAULT 0,
              detail TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mjl_job ON mentor_job_log(job, ranAt);
            ALTER TABLE mentors ADD COLUMN kind TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN leadId TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN subjectId TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN subjectName TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN category TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN centre TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN officerId TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN officerName TEXT DEFAULT '';
            INSERT OR IGNORE INTO community_safeguarding (caseId, authorId, authorName, surface, channelSlug, body, status, acknowledgedBy, acknowledgedAt, createdAt, subjectId, subjectName, category, centre, officerId, officerName)
              SELECT caseNo, reporterId, reporterName, 'mentor', '', body, CASE status WHEN 'resolved' THEN 'acknowledged' ELSE 'open' END, '', '', createdAt, subjectId, subjectName, category, centre, officerId, officerName FROM safeguarding_cases;",
        /* 139 — the Academy recorded by hand: a mentor trained in person (or by
         * an earlier programme) is cleared by an admin, who is named. Counts
         * as every required module passed; clearing it puts the modules back.
         * It also removes the copies 138 made of safeguarding cases into the
         * community queue: the officer's queue is safeguarding_cases, and a
         * second copy is a second place a case can be marked handled. */
        139 => "
            ALTER TABLE mentors ADD COLUMN academyClearedAt TEXT DEFAULT '';
            ALTER TABLE mentors ADD COLUMN academyClearedBy TEXT DEFAULT '';
            DELETE FROM community_safeguarding WHERE surface = 'mentor' AND caseId IN (SELECT caseNo FROM safeguarding_cases);",
        /* 140 — what each card carried, so "does the card in their hand still
         * match the record" has an answer: the photo, name and secure code
         * printed (and one signature over them); a client token that makes a
         * replayed run log idempotent; and WHY a reprint was asked for as a
         * code (lost, damaged, photo, name, design, qr, failed, asked), because
         * a lost card needs a new QR and a damaged one does not. */
        140 => "
            ALTER TABLE card_issues ADD COLUMN photoUrl TEXT DEFAULT '';
            ALTER TABLE card_issues ADD COLUMN fullName TEXT DEFAULT '';
            ALTER TABLE card_issues ADD COLUMN secureCode TEXT DEFAULT '';
            ALTER TABLE card_issues ADD COLUMN faceSig TEXT DEFAULT '';
            ALTER TABLE card_runs ADD COLUMN clientToken TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_crun_token ON card_runs(clientToken);
            ALTER TABLE id_reprints ADD COLUMN cause TEXT DEFAULT '';",
        /* The Club application (v2026.10): everything the old Google Form
         * collected that has no column of its own — school and class, home and
         * origin, both parents, hobbies, areas of influence, how they heard —
         * as one JSON object, so an application keeps every answer without a
         * column per question. And the policy version a consent was given
         * against, because "agreed" means nothing without "to which text". */
        141 => "
            ALTER TABLE applications ADD COLUMN details TEXT DEFAULT '';
            ALTER TABLE applications ADD COLUMN updatedAt TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_apps_email_dob ON applications(email, dob);
            ALTER TABLE consents ADD COLUMN policyVersion TEXT DEFAULT '';",
        /* Schools a family can pick on the Club application, from GRID3
         * Nigeria's open education-facilities data (Lagos and Ogun, primary
         * and secondary), loaded once from api/_lib/seeds; plus the schools
         * families typed in, added when their child is accepted. nameKey is
         * the name lower-cased with punctuation removed, for matching. */
        142 => "
            CREATE TABLE IF NOT EXISTS schools (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL, nameKey TEXT NOT NULL,
              lga TEXT DEFAULT '', state TEXT DEFAULT '', ward TEXT DEFAULT '',
              level TEXT DEFAULT '', management TEXT DEFAULT '',
              lat REAL, lng REAL,
              source TEXT DEFAULT 'grid3', addedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_schools_key ON schools(nameKey);
            CREATE INDEX IF NOT EXISTS idx_schools_place ON schools(state, lga);",
        /* The member record drive (domain/profile-drive.php): the answers a
         * member row has no column for — sex, class, home address, LGA and
         * state, origin — under the Club application's own keys, so an
         * accepted application fills them and a member completes the rest. */
        143 => "
            ALTER TABLE members ADD COLUMN profileJson TEXT DEFAULT '';",
        /* School results and the growth plan (domain/school-results.php): a
         * member uploads a term's report, confirms what was read off it,
         * writes a plan, and the mentor approves it before a family sees it.
         * results_log is the append-only history the member and staff read
         * ("Nothing is deleted"). skill_marks gains the evidence a level-up
         * now needs, and the level it moved from. */
        144 => "
            CREATE TABLE IF NOT EXISTS results_uploads (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              uploadId TEXT NOT NULL UNIQUE, memberId TEXT NOT NULL, term TEXT NOT NULL,
              fileUrl TEXT DEFAULT '', fileMime TEXT DEFAULT '', fileBytes INTEGER DEFAULT 0,
              status TEXT DEFAULT 'draft', ocrJson TEXT DEFAULT '', ocrBy TEXT DEFAULT '',
              confirmedAt TEXT DEFAULT '', sentAt TEXT DEFAULT '',
              createdAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ru_one ON results_uploads(memberId, term);
            CREATE TABLE IF NOT EXISTS results_subjects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              uploadId TEXT NOT NULL, subject TEXT NOT NULL, score INTEGER,
              ocrScore INTEGER, confidence REAL, lastScore INTEGER, position INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_rs_upload ON results_subjects(uploadId);
            CREATE TABLE IF NOT EXISTS growth_plans (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              planId TEXT NOT NULL UNIQUE, uploadId TEXT NOT NULL, memberId TEXT NOT NULL, term TEXT NOT NULL,
              summary TEXT DEFAULT '', flagsJson TEXT DEFAULT '', habit TEXT DEFAULT '',
              aiModel TEXT DEFAULT '', aiPromptVersion TEXT DEFAULT '',
              status TEXT DEFAULT 'draft', committed INTEGER DEFAULT 0, recipientsJson TEXT DEFAULT '',
              returnNote TEXT DEFAULT '', approvedBy TEXT DEFAULT '', approvedByName TEXT DEFAULT '', approvedAt TEXT DEFAULT '',
              sentAt TEXT DEFAULT '', familySentAt TEXT DEFAULT '', createdAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_gp_one ON growth_plans(memberId, term);
            CREATE INDEX IF NOT EXISTS idx_gp_status ON growth_plans(status, sentAt);
            CREATE TABLE IF NOT EXISTS growth_plan_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              itemId TEXT NOT NULL UNIQUE, planId TEXT NOT NULL, subject TEXT NOT NULL,
              current INTEGER, target INTEGER, method TEXT DEFAULT 'retrieval',
              what TEXT DEFAULT '', whenWhere TEXT DEFAULT '', sessionsPerWeek INTEGER DEFAULT 3,
              helper TEXT DEFAULT 'self', position INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_gpi_plan ON growth_plan_items(planId);
            CREATE TABLE IF NOT EXISTS plan_checkins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              itemId TEXT NOT NULL, memberId TEXT NOT NULL, weekStart TEXT NOT NULL,
              done INTEGER DEFAULT 0, planned INTEGER DEFAULT 0, updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_one ON plan_checkins(itemId, weekStart);
            CREATE INDEX IF NOT EXISTS idx_pc_member ON plan_checkins(memberId, weekStart);
            CREATE TABLE IF NOT EXISTS plan_notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              planId TEXT NOT NULL, authorId TEXT NOT NULL, authorName TEXT DEFAULT '', authorRole TEXT DEFAULT '',
              text TEXT NOT NULL, createdAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_pn_plan ON plan_notes(planId);
            CREATE TABLE IF NOT EXISTS plan_acks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              planId TEXT NOT NULL, userId TEXT NOT NULL, at TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_one ON plan_acks(planId, userId);
            CREATE TABLE IF NOT EXISTS results_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL, term TEXT NOT NULL, actorId TEXT DEFAULT '', actorName TEXT DEFAULT '',
              actorRole TEXT DEFAULT '', what TEXT NOT NULL, kind TEXT DEFAULT '', at TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_rl_member ON results_log(memberId, term, at);
            CREATE INDEX IF NOT EXISTS idx_rl_kind ON results_log(kind, memberId, at);
            ALTER TABLE skill_marks ADD COLUMN evidence TEXT DEFAULT '';
            ALTER TABLE skill_marks ADD COLUMN prevLevel INTEGER;",
        /* The Club class's Saturday (domain/club-class.php): the roll, the
         * plan, the hinge question, the exit ticket and the filed log — one
         * row per course, centre and date. The Summer School's course_sessions
         * stays as it is; that one keys on participants, this one on members. */
        145 => "
            CREATE TABLE IF NOT EXISTS club_class_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sessionId TEXT NOT NULL UNIQUE, course TEXT NOT NULL, centre TEXT NOT NULL, date TEXT NOT NULL,
              instructorId TEXT DEFAULT '', instructorName TEXT DEFAULT '',
              rollJson TEXT DEFAULT '', rollClosedAt TEXT DEFAULT '',
              planJson TEXT DEFAULT '', planAt TEXT DEFAULT '',
              hingeJson TEXT DEFAULT '', exitJson TEXT DEFAULT '', exitAt TEXT DEFAULT '',
              logJson TEXT DEFAULT '', filedAt TEXT DEFAULT '',
              createdAt TEXT DEFAULT '', updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_slot ON club_class_sessions(course, centre, date);
            CREATE INDEX IF NOT EXISTS idx_ccs_instr ON club_class_sessions(instructorId, date);",

        /* One mentor per child. admin_assign_mentor ended only the current
         * session's link, so a pairing from an earlier term could stay active
         * beside the new one — the child in two caseloads. Both write paths
         * now end every active link first; this ends the duplicates already
         * there, keeping each child's newest. Data only, no DDL. */
        146 => "
            UPDATE mentor_assignments SET status = 'ended', endedAt = '2026-10-16T00:00:00Z'
             WHERE status = 'active'
               AND id NOT IN (SELECT keep FROM (SELECT MAX(id) keep FROM mentor_assignments WHERE status = 'active' GROUP BY memberId) k);",

        /* A mentor opening the record of a child who is not their mentee:
         * who, which child, why, and until when (mentoring_cover). */
        147 => "
            CREATE TABLE IF NOT EXISTS mentor_record_cover (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              mentorMemberId TEXT NOT NULL, mentorName TEXT DEFAULT '',
              subjectId TEXT NOT NULL, centre TEXT DEFAULT '', reason TEXT NOT NULL,
              grantedAt TEXT NOT NULL, expiresAt TEXT NOT NULL, endedAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mrc_mentor ON mentor_record_cover(mentorMemberId, subjectId, expiresAt);
            CREATE INDEX IF NOT EXISTS idx_mrc_centre ON mentor_record_cover(centre, grantedAt);",
        /* 148 — the Saturday Formation Schedule (domain/saturday-formation.php):
         * the day's blocks with each audience's part, and the ledger of what the
         * day's reminders and family messages have already sent. */
        148 => "
            CREATE TABLE IF NOT EXISTS saturday_formation (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              blockKey TEXT UNIQUE NOT NULL, sort INTEGER DEFAULT 0, startTime TEXT NOT NULL, endTime TEXT NOT NULL,
              title TEXT NOT NULL, flow TEXT DEFAULT '', purpose TEXT DEFAULT '', quote TEXT DEFAULT '', forJson TEXT DEFAULT '',
              status TEXT DEFAULT 'active', updatedAt TEXT DEFAULT '', updatedBy TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS saturday_formation_sends (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              onDate TEXT NOT NULL, slot TEXT NOT NULL, recipient TEXT NOT NULL, channel TEXT NOT NULL, sentAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_sfs ON saturday_formation_sends(onDate, slot, recipient, channel);
        ",
        /* 149 — the Saturday register's mentor duties (Saturday Formation
         * Schedule): on time at 8:00, assignment handed in, checked out at the close. */
        149 => "ALTER TABLE mentor_register ADD COLUMN checks TEXT DEFAULT '';",
        /* 150 — the register's detail: what the mentor saw, written on the
         * Saturday itself, so the weekly review starts from evidence. */
        150 => "ALTER TABLE mentor_register ADD COLUMN note TEXT DEFAULT '';",
        // What an invoice is for: 'joining' (the fee and first month, posted on
        // settlement) or 'balance' (money already on the ledger, paid online).
        151 => "ALTER TABLE membership_invoices ADD COLUMN purpose TEXT NOT NULL DEFAULT 'joining';",
        // Every Academy quiz attempt, pass or fail: the retry limit reads it (ms_academy_attempt_gate).
        152 => "CREATE TABLE IF NOT EXISTS mentor_academy_attempts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mentorId TEXT NOT NULL,
                  moduleId TEXT NOT NULL,
                  score INTEGER NOT NULL DEFAULT 0,
                  passed INTEGER NOT NULL DEFAULT 0,
                  at TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_macad_att ON mentor_academy_attempts(mentorId, moduleId, at);",
        /* 153 — the Saturday evaluation: each child, each Saturday, on the
         * formation day's criteria (Not yet · Emerging · Demonstrated · Strong),
         * a strength and a next step, beside the week's three ratings. */
        153 => "ALTER TABLE mentor_reviews ADD COLUMN evalJson TEXT DEFAULT '';",
        /* 154 — assignments that work for the instructor who sets them: the
         * lesson an assignment belongs to, and when its audience was last
         * reminded (a quiet period, so a press cannot spam a class). */
        154 => "
            ALTER TABLE assignments ADD COLUMN unitId TEXT DEFAULT '';
            ALTER TABLE assignments ADD COLUMN remindedAt TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_sub_member ON assignment_submissions(memberId);
        ",
        /* 155 — assignments collect more than a paragraph: the success-criteria
         * steps a member ticks before handing in, and on a hand-in, a link
         * (a Google Doc, a Canva design, a GitHub repo), several files, and
         * which steps were ticked. `fileUrl` stays the first file, so every
         * older reader keeps working. */
        155 => "
            ALTER TABLE assignments ADD COLUMN steps TEXT DEFAULT '';
            ALTER TABLE assignment_submissions ADD COLUMN linkUrl TEXT DEFAULT '';
            ALTER TABLE assignment_submissions ADD COLUMN filesJson TEXT DEFAULT '';
            ALTER TABLE assignment_submissions ADD COLUMN stepsJson TEXT DEFAULT '';
        ",
        /* 156 — the sign-in door compares emails trimmed and lower-cased; a
         * volunteer or mentor saved as "Tunde@Example.org " could never match.
         * Lookups now tolerate it too; this cleans what is already stored.
         * Member emails are only trimmed (their case is shown back to them). */
        156 => "
            UPDATE volunteers SET email = lower(trim(email)) WHERE email IS NOT NULL AND email <> lower(trim(email));
            UPDATE mentors SET email = lower(trim(email)) WHERE email IS NOT NULL AND email <> lower(trim(email));
            UPDATE members SET email = trim(email) WHERE email IS NOT NULL AND email <> trim(email);
        ",
        /* 157 — texts by Telegram, free. A person opens the programme's bot and
         * shares their phone number (Telegram verifies it is theirs); every
         * text this site would send that number then goes to that chat
         * instead (api/_lib/telegram.php). Keyed by the E.164 number, so no
         * record type needs to know about it. */
        157 => "
            CREATE TABLE IF NOT EXISTS telegram_links (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              chatId TEXT NOT NULL,
              tgUserId TEXT DEFAULT '',
              tgName TEXT DEFAULT '',
              linkedAt TEXT DEFAULT '',
              lastSentAt TEXT DEFAULT '',
              sent INTEGER DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_phone ON telegram_links(phone);
            CREATE INDEX IF NOT EXISTS idx_tg_chat ON telegram_links(chatId);
        ",
        /* 158 — every file uploaded to the storage bucket, so the same file is
         * stored once (sha256, verified by the server reading the object back,
         * never taken from the browser's word), and a file nothing points at
         * any more is found and deleted (domain/media-objects.php). */
        158 => "
            CREATE TABLE IF NOT EXISTS media_objects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              storeKey TEXT NOT NULL,
              url TEXT NOT NULL,
              sha256 TEXT DEFAULT '',
              bytes INTEGER DEFAULT 0,
              mediaKind TEXT DEFAULT '',
              kind TEXT DEFAULT '',
              ownerId TEXT DEFAULT '',
              status TEXT DEFAULT 'signed',
              reuses INTEGER DEFAULT 0,
              createdAt TEXT DEFAULT '',
              verifiedAt TEXT DEFAULT '',
              checkedAt TEXT DEFAULT '',
              deletedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mo_key ON media_objects(storeKey);
            CREATE INDEX IF NOT EXISTS idx_mo_sha ON media_objects(sha256, status);
            CREATE INDEX IF NOT EXISTS idx_mo_status ON media_objects(status, createdAt);
        ",
        /* 159 — Study tools (domain/study-tools.php): a member's flashcard decks
         * and cards, scheduled by spaced repetition, and the focus and typing
         * sessions they log. Theirs alone: no other member sees them. */
        159 => "
            CREATE TABLE IF NOT EXISTS study_decks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              deckId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              name TEXT NOT NULL,
              source TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sd_deck ON study_decks(deckId);
            CREATE INDEX IF NOT EXISTS idx_sd_member ON study_decks(memberId);
            CREATE TABLE IF NOT EXISTS study_cards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              cardId TEXT NOT NULL,
              deckId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              front TEXT NOT NULL,
              back TEXT NOT NULL,
              ease REAL DEFAULT 2.5,
              intervalDays INTEGER DEFAULT 0,
              reps INTEGER DEFAULT 0,
              lapses INTEGER DEFAULT 0,
              dueAt TEXT DEFAULT '',
              reviewedAt TEXT DEFAULT '',
              createdAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_card ON study_cards(cardId);
            CREATE INDEX IF NOT EXISTS idx_sc_due ON study_cards(memberId, deckId, dueAt);
            CREATE TABLE IF NOT EXISTS study_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              tool TEXT NOT NULL,
              label TEXT DEFAULT '',
              minutes INTEGER DEFAULT 0,
              wpm INTEGER DEFAULT 0,
              accuracy INTEGER DEFAULT 0,
              cards INTEGER DEFAULT 0,
              at TEXT DEFAULT '',
              day TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ss_member ON study_sessions(memberId, day);
        ",
        /* One lead per programme. leadVolunteerId is the NGG centre lead; a
           centre that also hosts Summer School names its Summer lead
           separately, because they are different people. Existing rows that
           serve Summer start with the same person, so nothing changes until
           somebody sets it. */
        160 => "
            ALTER TABLE centres ADD COLUMN summerLeadVolunteerId TEXT;
            UPDATE centres SET summerLeadVolunteerId = CASE
                WHEN COALESCE(programmes, '') = '' OR programmes LIKE '%summer%' THEN COALESCE(leadVolunteerId, '') ELSE '' END
              WHERE summerLeadVolunteerId IS NULL;
        ",
        /* Club portal v3 (domain/club-portal.php). Announcements wait for an
           admin before they reach a family; a check-in a coordinator passed to
           a mentor, or marked seen, stays that way; a fine rule is on or off
           and never goes over its cap per term; a duty shift has its times. */
        161 => "
            CREATE TABLE IF NOT EXISTS club_announcements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              annId TEXT NOT NULL,
              title TEXT DEFAULT '',
              body TEXT DEFAULT '',
              aud TEXT DEFAULT 'guardians',
              centre TEXT DEFAULT 'all',
              channels TEXT DEFAULT '[\"app\"]',
              status TEXT DEFAULT 'draft',
              sendAt TEXT DEFAULT '',
              byId TEXT DEFAULT '',
              byName TEXT DEFAULT '',
              approvedById TEXT DEFAULT '',
              approvedByName TEXT DEFAULT '',
              note TEXT DEFAULT '',
              sentAt TEXT DEFAULT '',
              stats TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cann_id ON club_announcements(annId);
            CREATE INDEX IF NOT EXISTS idx_cann_status ON club_announcements(status, sendAt);
            CREATE TABLE IF NOT EXISTS club_checkin_state (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              checkinKey TEXT NOT NULL,
              toldAt TEXT DEFAULT '',
              toldBy TEXT DEFAULT '',
              seenAt TEXT DEFAULT '',
              seenBy TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_key ON club_checkin_state(checkinKey);
            CREATE TABLE IF NOT EXISTS conduct_rules (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ruleId TEXT NOT NULL,
              reason TEXT DEFAULT '',
              name TEXT DEFAULT '',
              whenText TEXT DEFAULT '',
              amount INTEGER DEFAULT 0,
              capTerm INTEGER DEFAULT 0,
              active INTEGER DEFAULT 1,
              createdBy TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_crule_id ON conduct_rules(ruleId);
            ALTER TABLE attendance_duty ADD COLUMN startTime TEXT DEFAULT '';
            ALTER TABLE attendance_duty ADD COLUMN endTime TEXT DEFAULT '';
        ",
        /* Community v3 (domain/community-v3.php). A question can have an
           accepted answer; a homework post names its task; a video carries its
           chapters, captions and summary points, and a code post its source;
           a moderator's decision is timed so the median review time is real;
           a safeguarding case has a severity and a lead; a member's place in a
           video is kept on the server, not in one browser. */
        162 => "
            ALTER TABLE community_posts ADD COLUMN answerId TEXT DEFAULT '';
            ALTER TABLE community_posts ADD COLUMN homeworkId TEXT DEFAULT '';
            ALTER TABLE community_posts ADD COLUMN mediaMeta TEXT DEFAULT '';
            ALTER TABLE community_posts ADD COLUMN mediaCode TEXT DEFAULT '';
            ALTER TABLE community_posts ADD COLUMN reviewedAt TEXT DEFAULT '';
            ALTER TABLE community_posts ADD COLUMN reviewedBy TEXT DEFAULT '';
            ALTER TABLE community_comments ADD COLUMN reviewedAt TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN severity TEXT DEFAULT 'high';
            ALTER TABLE community_safeguarding ADD COLUMN leadId TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN leadName TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN postId TEXT DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN source TEXT DEFAULT 'screen';
            ALTER TABLE community_safeguarding ADD COLUMN note TEXT DEFAULT '';
            CREATE TABLE IF NOT EXISTS community_video_progress (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              postId TEXT NOT NULL,
              pos INTEGER DEFAULT 0,
              dur INTEGER DEFAULT 0,
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cvp_member_post ON community_video_progress(memberId, postId);
        ",
        /* Announcements reach guardians in their family account, not only by
         * email: guardian_notices is the family inbox (one row per guardian per
         * announcement, read when they open it). smsBody is the short SMS
         * version an announcement carries when its text is too long for a
         * text — written or AI-shortened, approved with the rest. */
        163 => "
            CREATE TABLE IF NOT EXISTS guardian_notices (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              noticeId TEXT UNIQUE NOT NULL,
              guardianId TEXT NOT NULL,
              kind TEXT DEFAULT 'announcement',
              refId TEXT DEFAULT '',
              title TEXT DEFAULT '',
              body TEXT DEFAULT '',
              fromName TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              readAt TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_gnotice_guardian ON guardian_notices(guardianId, createdAt);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_gnotice_ref ON guardian_notices(guardianId, kind, refId);
            ALTER TABLE club_announcements ADD COLUMN smsBody TEXT DEFAULT '';
        ",
        /* The Instructor Academy's record (domain/academy.php): passes and
         * every attempt, keyed by track and person so another portal's
         * Academy is a seed file, not a table. Mentors keep mentor_academy. */
        164 => "
            CREATE TABLE IF NOT EXISTS academy_passes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              track TEXT NOT NULL,
              personId TEXT NOT NULL,
              moduleId TEXT NOT NULL,
              score INTEGER DEFAULT 0,
              passedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_acpass ON academy_passes(track, personId, moduleId);
            CREATE TABLE IF NOT EXISTS academy_attempts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              track TEXT NOT NULL,
              personId TEXT NOT NULL,
              moduleId TEXT NOT NULL,
              score INTEGER DEFAULT 0,
              passed INTEGER DEFAULT 0,
              at TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_acatt ON academy_attempts(track, personId, moduleId, at);
        ",
        /* 165 — how a child addresses an adult: a title (Mr, Mrs, Dr, Coach…)
         * and the surname, never the first name. Kept on the person's every
         * staff record so whichever one a screen reads has it; staff_public_name()
         * in util.php is the one reader. Blank means "Coach". */
        165 => "
            ALTER TABLE mentors ADD COLUMN honorific TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN honorific TEXT DEFAULT '';
            ALTER TABLE members ADD COLUMN honorific TEXT DEFAULT '';
        ",
        /* 166 — projects and activities (domain/projects.php): staff in the
         * mentor portal assign one to mentors, to children or both, split
         * into named groups, from a start date to a finish date. One row per
         * person on it: kind mentor (personId = mentorId) or member
         * (personId = memberId), their group, and their part's status. */
        166 => "
            CREATE TABLE IF NOT EXISTS projects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              projectId TEXT NOT NULL,
              title TEXT NOT NULL,
              detail TEXT DEFAULT '',
              startOn TEXT DEFAULT '',
              dueOn TEXT DEFAULT '',
              centre TEXT DEFAULT '',
              status TEXT DEFAULT 'open',
              createdBy TEXT DEFAULT '',
              createdByName TEXT DEFAULT '',
              createdAt TEXT DEFAULT '',
              updatedAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_id ON projects(projectId);
            CREATE INDEX IF NOT EXISTS idx_projects_by ON projects(createdBy, status);
            CREATE TABLE IF NOT EXISTS project_people (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              projectId TEXT NOT NULL,
              kind TEXT NOT NULL,
              personId TEXT NOT NULL,
              groupName TEXT DEFAULT '',
              status TEXT DEFAULT 'assigned',
              note TEXT DEFAULT '',
              doneAt TEXT DEFAULT '',
              createdAt TEXT DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_project_person ON project_people(projectId, kind, personId);
            CREATE INDEX IF NOT EXISTS idx_project_people_who ON project_people(kind, personId, status);
        ",
        /* 167 — every AI call, with its tokens and estimated cost
         * (api/_lib/ai.php ai_log_usage), so the monthly limit on paid
         * models is enforced against what was actually spent. costMicros is
         * USD × 1,000,000; `estimated` = 1 when the provider gave no counts. */
        167 => "
            CREATE TABLE IF NOT EXISTS ai_usage (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              at TEXT NOT NULL,
              month TEXT NOT NULL,
              profile TEXT DEFAULT '',
              job TEXT DEFAULT '',
              provider TEXT DEFAULT '',
              model TEXT DEFAULT '',
              tier TEXT DEFAULT '',
              inTokens INTEGER DEFAULT 0,
              outTokens INTEGER DEFAULT 0,
              costMicros INTEGER DEFAULT 0,
              estimated INTEGER DEFAULT 0,
              ok INTEGER DEFAULT 1,
              error TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_ai_usage_month ON ai_usage(month, tier);
        ",
        /* 168 — "settled up to": the last day a member's membership and dues
         * are known to be paid outside this system (an imported member who
         * had paid, or a family the programme decided owes nothing to that
         * date). fees_accrue_member never charges a period on or before it,
         * and fees_settle_through() clears what was already charged. */
        168 => "
            ALTER TABLE members ADD COLUMN feesSettledThrough TEXT DEFAULT '';
        ",
        /* Feedback is its own request kind (member_feedback_create): what it is
           about, the centre it came from (an anonymous one has no member to
           read it from), and when the desk passed it to that centre's lead. */
        169 => "
            ALTER TABLE member_requests ADD COLUMN topic TEXT DEFAULT '';
            ALTER TABLE member_requests ADD COLUMN centre TEXT DEFAULT '';
            ALTER TABLE member_requests ADD COLUMN passedAt TEXT DEFAULT '';
        ",
        /* How a member rates their time at NGG, 1 (bad) to 5 (great), on an
           "experience" feedback row; 0 everywhere else. */
        170 => "
            ALTER TABLE member_requests ADD COLUMN rating INTEGER DEFAULT 0;
        ",
        /* A voice note on a message between a child and their mentor:
           journal_media_clean's shape, audio only. */
        171 => "
            ALTER TABLE mentor_messages ADD COLUMN mediaJson TEXT DEFAULT '';
        ",
        /* Supporting mentors (domain/mentor-supports.php): beside the primary
           in mentor_assignments, never in it. */
        172 => "
            CREATE TABLE IF NOT EXISTS mentor_supports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              mentorId TEXT NOT NULL,
              focus TEXT DEFAULT '',
              endsOn TEXT DEFAULT '',
              status TEXT DEFAULT 'active',
              startedAt TEXT DEFAULT '',
              endedAt TEXT DEFAULT '',
              createdBy TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mentor_supports_member ON mentor_supports(memberId, status);
            CREATE INDEX IF NOT EXISTS idx_mentor_supports_mentor ON mentor_supports(mentorId, status);
        ",
        /* Photo requests at any size (id-studio.php): one press is a campaign,
           its people queued on id_photo_asks and sent a batch at a time by the
           web-cron, with ONE summary to staff when it is done and at most one
           reminder. Rows from before this are sent (`status` defaults so). */
        173 => "
            CREATE TABLE IF NOT EXISTS id_photo_campaigns (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              campaignId TEXT NOT NULL UNIQUE,
              askedBy TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL,
              total INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'sending',
              summaryAt TEXT NOT NULL DEFAULT '',
              remindedAt TEXT NOT NULL DEFAULT '',
              remindedBy TEXT NOT NULL DEFAULT ''
            );
            ALTER TABLE id_photo_asks ADD COLUMN campaignId TEXT NOT NULL DEFAULT '';
            ALTER TABLE id_photo_asks ADD COLUMN status TEXT NOT NULL DEFAULT 'sent';
            ALTER TABLE id_photo_asks ADD COLUMN sentAt TEXT NOT NULL DEFAULT '';
            ALTER TABLE id_photo_asks ADD COLUMN reminders INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_id_photo_asks_campaign ON id_photo_asks(campaignId, status);
            CREATE INDEX IF NOT EXISTS idx_id_photo_asks_status ON id_photo_asks(status);
        ",
        /* 174 — a member's courses, chosen from the catalogue (a JSON list),
           instead of guessed from free text in `track`; and a photo change as
           a request with the new photo, decided by staff, never a direct swap. */
        174 => "
            ALTER TABLE members ADD COLUMN courses TEXT NOT NULL DEFAULT '';
            CREATE TABLE IF NOT EXISTS photo_change_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              requestId TEXT NOT NULL UNIQUE,
              subjectType TEXT NOT NULL,
              subjectId TEXT NOT NULL,
              centre TEXT NOT NULL DEFAULT '',
              photoUrl TEXT NOT NULL,
              oldPhotoUrl TEXT NOT NULL DEFAULT '',
              reason TEXT NOT NULL DEFAULT '',
              via TEXT NOT NULL DEFAULT '',
              requestedBy TEXT NOT NULL DEFAULT '',
              requestedAt TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              decidedBy TEXT NOT NULL DEFAULT '',
              decidedAt TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_pcr_subject ON photo_change_requests(subjectType, subjectId, status);
            CREATE INDEX IF NOT EXISTS idx_pcr_status ON photo_change_requests(status, requestedAt);
        ",
        /* A reply can quote the reply it answers, and carry reactions of its own,
           as in a chat: the thread is a conversation, not a list of comments. */
        175 => "
            ALTER TABLE community_comments ADD COLUMN replyTo TEXT NOT NULL DEFAULT '';
            CREATE TABLE IF NOT EXISTS community_comment_reactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              commentId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              emoji TEXT NOT NULL,
              createdAt TEXT NOT NULL,
              UNIQUE(commentId, memberId)
            );
            CREATE INDEX IF NOT EXISTS idx_ccr_comment ON community_comment_reactions(commentId);
        ",
        /* Time on the portal: one row per person, day and portal, added to by
           a heartbeat the page sends only while it is visible and in use. */
        176 => "
            CREATE TABLE IF NOT EXISTS portal_time (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              day TEXT NOT NULL,
              portal TEXT NOT NULL,
              seconds INTEGER NOT NULL DEFAULT 0,
              beats INTEGER NOT NULL DEFAULT 0,
              firstAt TEXT NOT NULL,
              lastAt TEXT NOT NULL,
              UNIQUE(memberId, day, portal)
            );
            CREATE INDEX IF NOT EXISTS idx_pt_day ON portal_time(day);
        ",
        /* An instructor who did the Academy in person (or needs none) is
           cleared by hand, as a mentor already can be. */
        177 => "
            ALTER TABLE volunteers ADD COLUMN academyClearedAt TEXT NOT NULL DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN academyClearedBy TEXT NOT NULL DEFAULT '';
        ",
        /* Phase 1 of the centre-key migration (domain/centres-ngg.php).
           A centreId beside the centre NAME in all 32 tables that carry one.
           Adds columns only: nothing reads centreId this release, so nothing
           behaves differently. The backfill is centre_ids_backfill_once(),
           run from db_run_seeds so it is idempotent and does not sit inside
           the DDL transaction. */
        178 => "
            ALTER TABLE activities ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE arcade_scores ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE attendance_duty ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE awards ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE club_announcements ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE community_homework_state ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE community_safeguarding ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE courage_marks ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE course_sessions ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE engagement_snapshots ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE insight_threads ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE match_games ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE member_requests ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE member_stars ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_goals ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_interventions ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_matches ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_meetings ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_nudges ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_reviews ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_scorecards ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_tasks ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE photo_change_requests ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE projects ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE safeguarding_cases ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE skill_marks ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE student_remarks ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE tournament_entrants ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE tournament_invites ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE tournament_pairings ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_activities_centreid ON activities(centreId);
            CREATE INDEX IF NOT EXISTS idx_arcade_scores_centreid ON arcade_scores(centreId);
            CREATE INDEX IF NOT EXISTS idx_attendance_duty_centreid ON attendance_duty(centreId);
            CREATE INDEX IF NOT EXISTS idx_awards_centreid ON awards(centreId);
            CREATE INDEX IF NOT EXISTS idx_club_announcements_centreid ON club_announcements(centreId);
            CREATE INDEX IF NOT EXISTS idx_community_homework_state_centreid ON community_homework_state(centreId);
            CREATE INDEX IF NOT EXISTS idx_community_safeguarding_centreid ON community_safeguarding(centreId);
            CREATE INDEX IF NOT EXISTS idx_courage_marks_centreid ON courage_marks(centreId);
            CREATE INDEX IF NOT EXISTS idx_course_sessions_centreid ON course_sessions(centreId);
            CREATE INDEX IF NOT EXISTS idx_engagement_snapshots_centreid ON engagement_snapshots(centreId);
            CREATE INDEX IF NOT EXISTS idx_insight_threads_centreid ON insight_threads(centreId);
            CREATE INDEX IF NOT EXISTS idx_match_games_centreid ON match_games(centreId);
            CREATE INDEX IF NOT EXISTS idx_member_requests_centreid ON member_requests(centreId);
            CREATE INDEX IF NOT EXISTS idx_member_stars_centreid ON member_stars(centreId);
            CREATE INDEX IF NOT EXISTS idx_members_centreid ON members(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_goals_centreid ON mentor_goals(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_interventions_centreid ON mentor_interventions(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_matches_centreid ON mentor_matches(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_meetings_centreid ON mentor_meetings(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_nudges_centreid ON mentor_nudges(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_reviews_centreid ON mentor_reviews(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_scorecards_centreid ON mentor_scorecards(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_tasks_centreid ON mentor_tasks(centreId);
            CREATE INDEX IF NOT EXISTS idx_photo_change_requests_centreid ON photo_change_requests(centreId);
            CREATE INDEX IF NOT EXISTS idx_projects_centreid ON projects(centreId);
            CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_centreid ON safeguarding_cases(centreId);
            CREATE INDEX IF NOT EXISTS idx_skill_marks_centreid ON skill_marks(centreId);
            CREATE INDEX IF NOT EXISTS idx_student_remarks_centreid ON student_remarks(centreId);
            CREATE INDEX IF NOT EXISTS idx_tournament_entrants_centreid ON tournament_entrants(centreId);
            CREATE INDEX IF NOT EXISTS idx_tournament_invites_centreid ON tournament_invites(centreId);
            CREATE INDEX IF NOT EXISTS idx_tournament_pairings_centreid ON tournament_pairings(centreId);
            CREATE INDEX IF NOT EXISTS idx_volunteers_centreid ON volunteers(centreId);
            ALTER TABLE applications ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE assignments ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE club_class_sessions ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE events ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentor_record_cover ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE mentors ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE summer_students ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            ALTER TABLE v3_scores ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_applications_centreid ON applications(centreId);
            CREATE INDEX IF NOT EXISTS idx_assignments_centreid ON assignments(centreId);
            CREATE INDEX IF NOT EXISTS idx_club_class_sessions_centreid ON club_class_sessions(centreId);
            CREATE INDEX IF NOT EXISTS idx_events_centreid ON events(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentor_record_cover_centreid ON mentor_record_cover(centreId);
            CREATE INDEX IF NOT EXISTS idx_mentors_centreid ON mentors(centreId);
            CREATE INDEX IF NOT EXISTS idx_summer_students_centreid ON summer_students(centreId);
            CREATE INDEX IF NOT EXISTS idx_v3_scores_centreid ON v3_scores(centreId);
        ",
        /* A question of kind 'watch' carries the video it is about, so the
           learner watches it inside the exam rather than being sent off to
           find it. It is the check's own column and not a material: a lesson
           may carry several videos, and "the one this question is about" is
           not a thing a list of materials can say. */
        179 => "
            ALTER TABLE curriculum_checks ADD COLUMN videoUrl TEXT NOT NULL DEFAULT '';
        ",
        /* What a member says about a session, in their own words, asked at
           the end of every one. PRIVATE until a person decides otherwise —
           see domain/testimonials.php for why every column here exists. */
        180 => "
            CREATE TABLE IF NOT EXISTS testimonials (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tid TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL DEFAULT '',
              unitId TEXT NOT NULL DEFAULT '',
              course TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              body TEXT NOT NULL DEFAULT '',
              showAs TEXT NOT NULL DEFAULT 'initials',
              status TEXT NOT NULL DEFAULT 'new',
              decidedBy TEXT NOT NULL DEFAULT '',
              decidedAt TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_testi_status ON testimonials(status, createdAt);
            CREATE INDEX IF NOT EXISTS idx_testi_member ON testimonials(memberId, unitId);
            CREATE INDEX IF NOT EXISTS idx_testi_centreid ON testimonials(centreId);
        ",
        /* Family Portal v3 (domain/family.php). The inbox learns what a notice
         * is (a report, an alert, a word from the centre), which child it is
         * about and whether it asks for a signature; a family answers an event
         * on its own row, not as a member's RSVP; a mentor publishes times a
         * family may book; and the centre keeps the list of who may collect a
         * child, which a family reads but cannot write. */
        181 => "
            ALTER TABLE guardian_notices ADD COLUMN cat TEXT NOT NULL DEFAULT 'centre';
            ALTER TABLE guardian_notices ADD COLUMN memberId TEXT NOT NULL DEFAULT '';
            ALTER TABLE guardian_notices ADD COLUMN sign INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE guardian_notices ADD COLUMN signedAt TEXT NOT NULL DEFAULT '';
            ALTER TABLE events ADD COLUMN familiesExpected INTEGER NOT NULL DEFAULT 0;
            CREATE TABLE IF NOT EXISTS guardian_rsvps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              guardianId TEXT NOT NULL, eventId TEXT NOT NULL, answer TEXT NOT NULL DEFAULT 'yes',
              reminded INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_grsvp_one ON guardian_rsvps(guardianId, eventId);
            CREATE TABLE IF NOT EXISTS mentor_slots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              slotId TEXT NOT NULL UNIQUE, mentorId TEXT NOT NULL, startAt TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'centre',
              bookedBy TEXT NOT NULL DEFAULT '', memberId TEXT NOT NULL DEFAULT '', bookedAt TEXT NOT NULL DEFAULT '',
              reminded INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mslot_mentor ON mentor_slots(mentorId, startAt);
            CREATE INDEX IF NOT EXISTS idx_mslot_member ON mentor_slots(memberId, startAt);
            CREATE TABLE IF NOT EXISTS member_collectors (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL, name TEXT NOT NULL, relation TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
              createdBy TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_mcoll_member ON member_collectors(memberId);
        ",

        /* Summer School Portal v3. `pending_actions` holds a bulk act for its
           undo window: nothing is promoted, invoiced or sent until the row is
           committed (domain/pending.php). `summer_recent` is each staff
           member's last children opened, for the command palette.
           `members.fromSummerId` links a promoted member to the participant
           they were, which until now lived only in a free-text note. Incidents
           and guardian messages are the coordinator's day-to-day record. */
        182 => "
            CREATE TABLE IF NOT EXISTS pending_actions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              pendingId TEXT NOT NULL UNIQUE, op TEXT NOT NULL, args TEXT NOT NULL DEFAULT '{}',
              requesterId TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'pending', commitAt TEXT NOT NULL,
              result TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT '', doneAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_pend_due ON pending_actions(status, commitAt);
            CREATE TABLE IF NOT EXISTS summer_recent (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              staffId TEXT NOT NULL, studentId TEXT NOT NULL, at TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_srecent_one ON summer_recent(staffId, studentId);
            ALTER TABLE members ADD COLUMN fromSummerId TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_members_fromsummer ON members(fromSummerId);
            CREATE TABLE IF NOT EXISTS summer_incidents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              incidentId TEXT NOT NULL UNIQUE, cohortId TEXT NOT NULL DEFAULT '', studentId TEXT NOT NULL DEFAULT '',
              childName TEXT NOT NULL DEFAULT '', centre TEXT NOT NULL DEFAULT '', centreId TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '',
              severity TEXT NOT NULL DEFAULT 'low', note TEXT NOT NULL DEFAULT '',
              byId TEXT NOT NULL DEFAULT '', byName TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'open', toldAt TEXT NOT NULL DEFAULT '', toldBy TEXT NOT NULL DEFAULT '',
              closedAt TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_sinc_edition ON summer_incidents(cohortId, status);
            CREATE TABLE IF NOT EXISTS summer_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              messageId TEXT NOT NULL UNIQUE, cohortId TEXT NOT NULL DEFAULT '', template TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '',
              channel TEXT NOT NULL DEFAULT 'email', recipients INTEGER NOT NULL DEFAULT 0,
              delivered INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
              byId TEXT NOT NULL DEFAULT '', byName TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_smsg_edition ON summer_messages(cohortId, createdAt);
        ",
        /* 183 — one email, several member accounts (siblings on a parent's
         * address). A sign-in code for such an address proves the inbox, not a
         * person, so the verified challenge keeps the accounts it may open
         * (comma-separated memberIds) and the browser picks one (auth_pick). */
        183 => "
            ALTER TABLE auth_sessions ADD COLUMN pickIds TEXT DEFAULT '';
        ",

        /* Notifications a person can act on. `notification_state` holds each
           person's read and dismissed marks — a broadcast row is shared, so
           marking it read on the row marked it read for everybody. `groupKey`
           lets a running thing (Saturday's timetable) keep ONE live item that
           is updated, instead of a new alert every block. `actionLabel` names
           the button when the default for the kind is not right. */
        184 => "
            CREATE TABLE IF NOT EXISTS notification_state (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL, notifId TEXT NOT NULL,
              readAt TEXT NOT NULL DEFAULT '', dismissedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_nstate_one ON notification_state(memberId, notifId);
            ALTER TABLE notifications ADD COLUMN groupKey TEXT NOT NULL DEFAULT '';
            ALTER TABLE notifications ADD COLUMN actionLabel TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_notif_group ON notifications(memberId, groupKey);
        ",

        /* Support cases (domain/support.php). A case, not a ticket: one problem
           a person brought, its priority by impact (P1–P4), its category, and a
           lifecycle (new → open → pending → solved → closed). Messages are rows,
           so an author, a time and the internal/visible line survive. Cases
           are opened inside the member and family portals, never publicly. */
        185 => "
            CREATE TABLE IF NOT EXISTS support_cases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              caseNo INTEGER NOT NULL UNIQUE,
              status TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'P3',
              category TEXT NOT NULL DEFAULT 'other', subcategory TEXT NOT NULL DEFAULT '',
              subject TEXT NOT NULL DEFAULT '',
              requesterKind TEXT NOT NULL DEFAULT 'visitor', requesterId TEXT NOT NULL DEFAULT '',
              name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
              memberId TEXT NOT NULL DEFAULT '', centre TEXT NOT NULL DEFAULT '', centreId TEXT NOT NULL DEFAULT '',
              assigneeId TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'web',
              pageUrl TEXT NOT NULL DEFAULT '', userAgent TEXT NOT NULL DEFAULT '',
              ipHash TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL DEFAULT '', lastActivityAt TEXT NOT NULL DEFAULT '',
              lastReplyBy TEXT NOT NULL DEFAULT 'requester', respondBy TEXT NOT NULL DEFAULT '',
              firstResponseAt TEXT NOT NULL DEFAULT '', solvedAt TEXT NOT NULL DEFAULT '', closedAt TEXT NOT NULL DEFAULT '',
              rating INTEGER NOT NULL DEFAULT 0, ratingNote TEXT NOT NULL DEFAULT '', followUpOf INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_scase_status ON support_cases(status, respondBy);
            CREATE INDEX IF NOT EXISTS idx_scase_requester ON support_cases(requesterKind, requesterId);
            CREATE INDEX IF NOT EXISTS idx_scase_assignee ON support_cases(assigneeId, status);
            CREATE TABLE IF NOT EXISTS support_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              caseNo INTEGER NOT NULL, authorKind TEXT NOT NULL DEFAULT 'requester', authorId TEXT NOT NULL DEFAULT '',
              authorName TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', internal INTEGER NOT NULL DEFAULT 0,
              files TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_smsgs_case ON support_messages(caseNo, id);
        ",

        /* 186–187 came from the community-audit branch as 181–182; renumbered
           when it was merged, because this branch had already used 181–185. */
        /* Two different questions, asked at two different rhythms — they were
           one, and one was wrong (domain/lesson-feedback.php).

           HOW DID TODAY GO is asked after every LESSON: a tap, for the person
           teaching. It is never published and never leaves the staff.

           WHAT DID THIS TERM GIVE YOU is asked after every SESSION — the
           twelve-week block, four a year — and that is the testimonial.
           `testimonials.unitId` is left in place and unread rather than
           dropped: SQLite cannot drop a column on older builds, and a
           deployment that already ran 180 keeps resolving. */
        186 => "
            ALTER TABLE testimonials ADD COLUMN sessionId TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_testi_session ON testimonials(memberId, sessionId);
            CREATE TABLE IF NOT EXISTS lesson_feedback (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              fid TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL DEFAULT '',
              unitId TEXT NOT NULL DEFAULT '',
              course TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              signal TEXT NOT NULL DEFAULT '',
              body TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_lfb_one ON lesson_feedback(memberId, unitId);
            CREATE INDEX IF NOT EXISTS idx_lfb_unit ON lesson_feedback(unitId, signal);
            CREATE INDEX IF NOT EXISTS idx_lfb_centreid ON lesson_feedback(centreId);
        ",
        /* STUDYING FOR SCHOOL, in the Learn app (domain/study-drill.php).
           The growth plan from a member's school results already said WHAT to
           work on — Maths 62 → 70, retrieval practice, three sessions a week
           — and there has never been anywhere to actually DO one. A drill is
           one of those sessions: a short adaptive set on that subject, marked
           with reasons, which ticks the week's check-in and turns what they
           got wrong into spaced-repetition cards.

           One table. The member's LEVEL in a subject is not stored twice: it
           is the level of their most recent drill in it, which is also what
           makes it auditable — you can see the ladder they climbed. */
        187 => "
            CREATE TABLE IF NOT EXISTS study_drills (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              drillId TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL DEFAULT '',
              itemId TEXT NOT NULL DEFAULT '',
              subject TEXT NOT NULL DEFAULT '',
              topic TEXT NOT NULL DEFAULT '',
              level INTEGER NOT NULL DEFAULT 2,
              source TEXT NOT NULL DEFAULT '',
              asked INTEGER NOT NULL DEFAULT 0,
              correct INTEGER NOT NULL DEFAULT 0,
              questionsJson TEXT NOT NULL DEFAULT '[]',
              answersJson TEXT NOT NULL DEFAULT '[]',
              startedAt TEXT NOT NULL DEFAULT '',
              markedAt TEXT NOT NULL DEFAULT ''
            );
            /* `idx_sd_*` is taken: study_decks already owns idx_sd_deck and
               idx_sd_member, and an index name is global in SQLite — so
               CREATE INDEX IF NOT EXISTS would have silently skipped these
               and left the table unindexed. */
            CREATE INDEX IF NOT EXISTS idx_drill_member ON study_drills(memberId, subject, startedAt);
            CREATE INDEX IF NOT EXISTS idx_drill_marked ON study_drills(memberId, markedAt);
        ",
        /* The Learn app's own record of a member and a lesson (domain/learn.php):
           their private note on it, whether they saved it for later, and when
           they last opened it — what "pick up where you left off" reads.
           One row per member per lesson. Never read by staff. */
        188 => "
            CREATE TABLE IF NOT EXISTS learn_state (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memberId TEXT NOT NULL,
              unitId TEXT NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              noteAt TEXT NOT NULL DEFAULT '',
              saved INTEGER NOT NULL DEFAULT 0,
              savedAt TEXT NOT NULL DEFAULT '',
              openedAt TEXT NOT NULL DEFAULT '',
              opens INTEGER NOT NULL DEFAULT 0,
              UNIQUE (memberId, unitId)
            );
            CREATE INDEX IF NOT EXISTS idx_learn_state_opened ON learn_state(memberId, openedAt);
        ",
        189 => "
            CREATE TABLE IF NOT EXISTS wifi_accounts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectType TEXT NOT NULL,
              subjectId TEXT NOT NULL,
              username TEXT NOT NULL,
              pinSealed TEXT NOT NULL DEFAULT '',
              pinSetAt TEXT NOT NULL DEFAULT '',
              pinResetDay TEXT NOT NULL DEFAULT '',
              pinResets INTEGER NOT NULL DEFAULT 0,
              override TEXT NOT NULL DEFAULT '',
              overrideWhy TEXT NOT NULL DEFAULT '',
              overrideBy TEXT NOT NULL DEFAULT '',
              overrideAt TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT '',
              UNIQUE (subjectType, subjectId),
              UNIQUE (username)
            );
            CREATE TABLE IF NOT EXISTS wifi_gateways (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              gatewayId TEXT NOT NULL UNIQUE,
              platform TEXT NOT NULL DEFAULT 'mikrotik',
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              label TEXT NOT NULL DEFAULT '',
              keyHash TEXT NOT NULL DEFAULT '',
              keyTail TEXT NOT NULL DEFAULT '',
              keySetAt TEXT NOT NULL DEFAULT '',
              lastSeenAt TEXT NOT NULL DEFAULT '',
              lastFullAt TEXT NOT NULL DEFAULT '',
              osVersion TEXT NOT NULL DEFAULT '',
              lastError TEXT NOT NULL DEFAULT '',
              lastVersion INTEGER NOT NULL DEFAULT 0,
              lastChangeAt TEXT NOT NULL DEFAULT '',
              ackedJson TEXT NOT NULL DEFAULT '',
              pendingJson TEXT NOT NULL DEFAULT '',
              pendingVersion INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL DEFAULT '',
              createdBy TEXT NOT NULL DEFAULT '',
              removedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_gateways_centre ON wifi_gateways(centre);
        ",
        190 => "
            ALTER TABLE wifi_gateways ADD COLUMN testAsked INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE wifi_gateways ADD COLUMN lastStatsJson TEXT NOT NULL DEFAULT '';
            CREATE TABLE IF NOT EXISTS wifi_gateway_stats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              gatewayId TEXT NOT NULL,
              hour TEXT NOT NULL,
              samples INTEGER NOT NULL DEFAULT 0,
              activeMax INTEGER NOT NULL DEFAULT 0,
              activeSum INTEGER NOT NULL DEFAULT 0,
              cpuMax INTEGER NOT NULL DEFAULT 0,
              memFreeMin INTEGER NOT NULL DEFAULT 0,
              UNIQUE (gatewayId, hour)
            );
            CREATE TABLE IF NOT EXISTS wifi_speed_tests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              gatewayId TEXT NOT NULL DEFAULT '',
              source TEXT NOT NULL DEFAULT 'device',
              downMbps REAL NOT NULL DEFAULT 0,
              upMbps REAL NOT NULL DEFAULT 0,
              rttMs INTEGER NOT NULL DEFAULT 0,
              byId TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              at TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_speed_centre ON wifi_speed_tests(centre, at);
        ",
        191 => "
            CREATE TABLE IF NOT EXISTS wifi_regions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              regionId TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL DEFAULT '',
              code TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT '',
              createdBy TEXT NOT NULL DEFAULT '',
              removedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS wifi_region_centres (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              centre TEXT NOT NULL UNIQUE,
              centreId TEXT NOT NULL DEFAULT '',
              regionId TEXT NOT NULL,
              assignedAt TEXT NOT NULL DEFAULT '',
              assignedBy TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_rc_region ON wifi_region_centres(regionId);
            CREATE TABLE IF NOT EXISTS wifi_region_leads (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              regionId TEXT NOT NULL,
              memberId TEXT NOT NULL,
              addedAt TEXT NOT NULL DEFAULT '',
              addedBy TEXT NOT NULL DEFAULT '',
              UNIQUE (regionId, memberId)
            );
            CREATE TABLE IF NOT EXISTS wifi_profile_overrides (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              regionId TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              profilesJson TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT '',
              updatedBy TEXT NOT NULL DEFAULT '',
              UNIQUE (regionId, centre)
            );
            CREATE TABLE IF NOT EXISTS wifi_gateway_daily (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              gatewayId TEXT NOT NULL,
              date TEXT NOT NULL,
              samples INTEGER NOT NULL DEFAULT 0,
              hoursUp INTEGER NOT NULL DEFAULT 0,
              activePeak INTEGER NOT NULL DEFAULT 0,
              activeSum INTEGER NOT NULL DEFAULT 0,
              activeSamples INTEGER NOT NULL DEFAULT 0,
              cpuMax INTEGER NOT NULL DEFAULT 0,
              UNIQUE (gatewayId, date)
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_daily_date ON wifi_gateway_daily(date);
            CREATE INDEX IF NOT EXISTS idx_wifi_stats_hour ON wifi_gateway_stats(hour);
            ALTER TABLE wifi_gateway_stats ADD COLUMN activeSamples INTEGER NOT NULL DEFAULT 0;
        ",
        /* Wi-Fi: a silent gateway is told to its region lead once per silence
           (silentAlertAt, cleared by its next fetch), and what the feed costs
           this host is measured per hour before more than one pilot region
           goes live (wifi_feed_load; time buckets in milliseconds). */
        192 => "
            ALTER TABLE wifi_gateways ADD COLUMN silentAlertAt TEXT NOT NULL DEFAULT '';
            CREATE TABLE IF NOT EXISTS wifi_feed_load (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              hour TEXT NOT NULL UNIQUE,
              fetches INTEGER NOT NULL DEFAULT 0,
              failed INTEGER NOT NULL DEFAULT 0,
              msTotal INTEGER NOT NULL DEFAULT 0,
              msMax INTEGER NOT NULL DEFAULT 0,
              bytesTotal INTEGER NOT NULL DEFAULT 0,
              memMaxKb INTEGER NOT NULL DEFAULT 0,
              b25 INTEGER NOT NULL DEFAULT 0,
              b50 INTEGER NOT NULL DEFAULT 0,
              b100 INTEGER NOT NULL DEFAULT 0,
              b250 INTEGER NOT NULL DEFAULT 0,
              b500 INTEGER NOT NULL DEFAULT 0,
              bOver INTEGER NOT NULL DEFAULT 0
            );
        ",
        /* Anchor Circle joins the family account and the mentor portal: the old
           code-and-token links stop opening anything. Their days and remarks
           stay on the child's record and keep counting. */
        193 => "
            UPDATE circle_links SET status = 'moved' WHERE status = 'active';
        ",
        /* Wi-Fi data used, per person per day per centre (wifi_usage_*), and
           each gateway's last word on each session, so a counter that keeps
           climbing is only counted once. */
        194 => "
            CREATE TABLE IF NOT EXISTS wifi_usage_daily (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subjectType TEXT NOT NULL,
              subjectId TEXT NOT NULL,
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              date TEXT NOT NULL,
              bytesDown INTEGER NOT NULL DEFAULT 0,
              bytesUp INTEGER NOT NULL DEFAULT 0,
              updatedAt TEXT NOT NULL DEFAULT '',
              UNIQUE (subjectType, subjectId, date, centre)
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_usage_centre ON wifi_usage_daily(centre, date);
            CREATE INDEX IF NOT EXISTS idx_wifi_usage_date ON wifi_usage_daily(date);
            CREATE TABLE IF NOT EXISTS wifi_usage_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              gatewayId TEXT NOT NULL,
              sessionKey TEXT NOT NULL,
              username TEXT NOT NULL DEFAULT '',
              bytesIn INTEGER NOT NULL DEFAULT 0,
              bytesOut INTEGER NOT NULL DEFAULT 0,
              seenAt TEXT NOT NULL DEFAULT '',
              UNIQUE (gatewayId, sessionKey)
            );
            CREATE INDEX IF NOT EXISTS idx_wifi_usess_seen ON wifi_usage_sessions(seenAt);
            ALTER TABLE wifi_gateways ADD COLUMN usageAt TEXT NOT NULL DEFAULT '';
        ",
        /* A centre's router that now runs from CACENTRE (domain/wifi-cacentre.php):
           NGG stops calling it silent, its members' PINs come from CACENTRE at
           once, and an old script still asking NGG is told it has moved. */
        195 => "
            ALTER TABLE wifi_gateways ADD COLUMN movedAt TEXT NOT NULL DEFAULT '';
        ",
        /* A member's courses as a stored fact (course-placement.php): the
           proposal for an unplaced member, why, whether a person should look,
           what it was computed from, and who confirmed the placement. */
        196 => "
            ALTER TABLE members ADD COLUMN coursesProposed TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN coursesFlag TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN coursesReason TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN coursesInputs TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN coursesConfirmedAt TEXT NOT NULL DEFAULT '';
            ALTER TABLE members ADD COLUMN coursesConfirmedBy TEXT NOT NULL DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_members_courses_flag ON members(coursesFlag);
        ",
        197 => "
            /* WHERE A COURSE LEADS. The curriculum already names its routes
               out — freeCodeCamp, Trinity, ABRSM, NBTE, Cisco, Google — but
               only in lesson prose and loose links, so a child finished a
               course and nothing told them there was a recognised credential
               at the end of it, and the programme could not say how many of
               its members hold one. Three tables, because the domain has
               three things: the organisation, the thing it awards, and the
               person who holds it. */
            CREATE TABLE IF NOT EXISTS providers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              providerId TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL DEFAULT '',
              slug TEXT NOT NULL DEFAULT '',
              country TEXT NOT NULL DEFAULT '',
              url TEXT NOT NULL DEFAULT '',
              free INTEGER NOT NULL DEFAULT 0,
              costNote TEXT NOT NULL DEFAULT '',
              notes TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'active',
              position INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_prv_status ON providers(status, position);
            CREATE TABLE IF NOT EXISTS provider_awards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              awardId TEXT UNIQUE NOT NULL,
              providerId TEXT NOT NULL DEFAULT '',
              title TEXT NOT NULL DEFAULT '',
              kind TEXT NOT NULL DEFAULT 'certificate',
              level TEXT NOT NULL DEFAULT '',
              courses TEXT NOT NULL DEFAULT '[]',
              url TEXT NOT NULL DEFAULT '',
              examNote TEXT NOT NULL DEFAULT '',
              costNote TEXT NOT NULL DEFAULT '',
              free INTEGER NOT NULL DEFAULT 0,
              validMonths INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'active',
              position INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_paw_provider ON provider_awards(providerId, status, position);
            CREATE TABLE IF NOT EXISTS member_credentials (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              credId TEXT UNIQUE NOT NULL,
              memberId TEXT NOT NULL DEFAULT '',
              providerId TEXT NOT NULL DEFAULT '',
              awardId TEXT NOT NULL DEFAULT '',
              state TEXT NOT NULL DEFAULT 'aiming',
              grade TEXT NOT NULL DEFAULT '',
              credentialRef TEXT NOT NULL DEFAULT '',
              evidenceUrl TEXT NOT NULL DEFAULT '',
              awardedOn TEXT NOT NULL DEFAULT '',
              expiresOn TEXT NOT NULL DEFAULT '',
              centre TEXT NOT NULL DEFAULT '',
              centreId TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              recordedBy TEXT NOT NULL DEFAULT '',
              createdAt TEXT NOT NULL DEFAULT '',
              updatedAt TEXT NOT NULL DEFAULT ''
            );
            /* One row per member per award: re-recording is a correction, not
               a second credential. */
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mcr_one ON member_credentials(memberId, awardId);
            CREATE INDEX IF NOT EXISTS idx_mcr_state ON member_credentials(state, awardedOn);
            CREATE INDEX IF NOT EXISTS idx_mcr_centre ON member_credentials(centre, state);
            CREATE INDEX IF NOT EXISTS idx_mcr_centreid ON member_credentials(centreId);
        ",
        198 => "
            /* WHAT TO DO WITH A MATERIAL. A lesson's links reached a learner
               as a title and the word LINK, so nothing said whether to read
               it now, practise on it, or keep it for later. One line per
               material, written by whoever attaches it, shown under its
               title. */
            ALTER TABLE curriculum_materials ADD COLUMN guide TEXT DEFAULT '';
        ",
        /* 199 — CACENTRE's locations decide NGG's centres (domain/cac-locations.php).
         * A centre is linked to its location by the location's id, which stays
         * when the name changes; the location's calendar is kept for reading.
         * And a check-in through the gate records which location it was at. */
        199 => "ALTER TABLE centres ADD COLUMN cacLocationId TEXT NOT NULL DEFAULT '';
                ALTER TABLE centres ADD COLUMN cacCalendar TEXT NOT NULL DEFAULT '';
                ALTER TABLE centres ADD COLUMN cacSyncedAt TEXT NOT NULL DEFAULT '';
                ALTER TABLE attendance ADD COLUMN centre TEXT NOT NULL DEFAULT '';
                ALTER TABLE attendance ADD COLUMN centreId TEXT NOT NULL DEFAULT '';
                CREATE INDEX IF NOT EXISTS idx_centres_cac ON centres(cacLocationId);",
        /* 200 — the processes that wait on a person (domain/make.php): the
         * question asked about each absence and the guardian's answer, each
         * safeguarding flag and who took it, and which Summer School dates
         * have already been announced. */
        200 => "CREATE TABLE IF NOT EXISTS absence_asks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ref TEXT UNIQUE NOT NULL,
                  infractionId INTEGER NOT NULL,
                  personId TEXT NOT NULL, personType TEXT NOT NULL DEFAULT 'student',
                  date TEXT NOT NULL, centre TEXT NOT NULL DEFAULT '', centreId TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'asked',
                  reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
                  channel TEXT NOT NULL DEFAULT '', messageId TEXT NOT NULL DEFAULT '',
                  askedAt TEXT NOT NULL DEFAULT '', answeredAt TEXT NOT NULL DEFAULT ''
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_absask_infraction ON absence_asks(infractionId);
                CREATE INDEX IF NOT EXISTS idx_absask_date ON absence_asks(date);
                CREATE TABLE IF NOT EXISTS safeguarding_flags (
                  ref TEXT PRIMARY KEY,
                  source TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', severity TEXT NOT NULL DEFAULT '',
                  centre TEXT NOT NULL DEFAULT '', centreId TEXT NOT NULL DEFAULT '', flaggedAt TEXT NOT NULL DEFAULT '',
                  ackAt TEXT NOT NULL DEFAULT '', ackBy TEXT NOT NULL DEFAULT '',
                  ackChannel TEXT NOT NULL DEFAULT '', ackMessageId TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS edition_milestones (
                  cohortId TEXT NOT NULL, milestone TEXT NOT NULL, firedAt TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (cohortId, milestone)
                );",
        /* 201 — volunteer pay (domain/volunteer-pay.php): one row per volunteer
         * per programme day they were present, decided once with the rate then
         * in force — earned, or excluded with the reason — and the payouts that
         * settle a pay period. Whole naira, like member_ledger. */
        201 => "CREATE TABLE IF NOT EXISTS volunteer_pay (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  volunteerId TEXT NOT NULL, day TEXT NOT NULL, centre TEXT NOT NULL DEFAULT '', centreId TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL DEFAULT 'earned', amount INTEGER NOT NULL DEFAULT 0, rate INTEGER NOT NULL DEFAULT 0,
                  reason TEXT NOT NULL DEFAULT '', activity TEXT NOT NULL DEFAULT '', periodKey TEXT NOT NULL DEFAULT '',
                  payoutId TEXT NOT NULL DEFAULT '', decidedAt TEXT NOT NULL DEFAULT '',
                  overrideBy TEXT NOT NULL DEFAULT '', overrideReason TEXT NOT NULL DEFAULT '', overrideAt TEXT NOT NULL DEFAULT ''
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_volpay_day ON volunteer_pay(volunteerId, day);
                CREATE INDEX IF NOT EXISTS idx_volpay_period ON volunteer_pay(periodKey, status);
                CREATE TABLE IF NOT EXISTS volunteer_payouts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  payoutId TEXT NOT NULL UNIQUE, volunteerId TEXT NOT NULL, periodKey TEXT NOT NULL,
                  amount INTEGER NOT NULL DEFAULT 0, days INTEGER NOT NULL DEFAULT 0,
                  method TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
                  paidAt TEXT NOT NULL DEFAULT '', paidBy TEXT NOT NULL DEFAULT '',
                  voidedAt TEXT NOT NULL DEFAULT '', voidedBy TEXT NOT NULL DEFAULT '', voidReason TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_volpayout_vol ON volunteer_payouts(volunteerId, periodKey);",
        /* 202 — from the gate-lookup branch, where it was 122: when a
         * volunteer's programme was last set (promotion from Summer to NGG), an
         * index on programme, and the programme of any volunteer row that has
         * none (an anchor application or an NGG member ⇒ ngg, else summer). */
        202 => "
            ALTER TABLE volunteers ADD COLUMN programmeAt TEXT DEFAULT '';
            CREATE INDEX IF NOT EXISTS idx_vol_programme ON volunteers(programme);
        " . NGG_BACKFILL_VOLUNTEER_PROGRAMME,
        /* 203 — volunteer pay, part two: where a volunteer is paid (their own
         * bank details, set by them or the fees desk), and what each payout
         * took off for fines — NGG's own and Afrovanguard's — so the gross,
         * the deductions and the money sent are each on the record. */
        203 => "
            ALTER TABLE volunteers ADD COLUMN bankName TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN bankAccountNumber TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN bankAccountName TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN bankUpdatedAt TEXT DEFAULT '';
            ALTER TABLE volunteers ADD COLUMN bankUpdatedBy TEXT DEFAULT '';
            ALTER TABLE volunteer_payouts ADD COLUMN gross INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE volunteer_payouts ADD COLUMN fineNgg INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE volunteer_payouts ADD COLUMN fineAv INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE volunteer_payouts ADD COLUMN bankLine TEXT NOT NULL DEFAULT '';
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
    /* A database built from nothing has no shared centres to split, so the
       one-time split is recorded as done — it is for deployments that existed
       before it, and must never run over a fresh install's first centres. */
    if ($current === 0) {
        try {
            $st = $db->prepare('INSERT OR IGNORE INTO settings (settingKey, settingValue, updatedAt, updatedBy) VALUES (?, ?, ?, ?)');
            $st->execute(['centres_split_seed', CENTRES_SPLIT_SEED, gmdate('Y-m-d\TH:i:s\Z'), 'install']);
        } catch (Throwable $e) { /* settings missing: the seed's own empty check covers it */ }
    }
}

// ── Query helpers ────────────────────────────────────────────────────────

/**
 * Mirror a centre NAME into centreId on the way in.
 *
 * Phase 1 of the centre-key migration writes both columns while reads still
 * use the name (domain/centres-ngg.php). Doing it here rather than at the 288
 * call sites means a table joins the migration by being in CENTRE_NAME_TABLES,
 * not by someone remembering — which is the failure the migration exists to
 * end, so it would be a poor way to run it.
 *
 * A name that resolves to NOTHING is left alone, so the column keeps its ''
 * default. That is deliberate: the empty rows are the inventory that
 * admin.centres.idaudit reports, and filling them with a guess would move a
 * child's record to the wrong centre with nothing to say it happened.
 */
function db_centre_mirror(string $table, array $data): array {
    if (!isset($data['centre']) || isset($data['centreId'])) return $data;
    if (!function_exists('centre_table_tracked') || !centre_table_tracked($table)) return $data;
    $id = centre_id_for_name((string)$data['centre']);
    if ($id !== '') $data['centreId'] = $id;
    return $data;
}

/* A column whose name MySQL reserves (`signal`, on lesson_feedback) is a syntax
   error there unquoted, while SQLite takes it either way — so it was only ever
   found on MySQL. Backticks quote it on both drivers. Only listed names are
   quoted, so every other statement stays exactly as it was. */
const DB_RESERVED_COLUMNS = ['signal'];
function db_ident(string $col): string { return in_array(strtolower($col), DB_RESERVED_COLUMNS, true) ? '`' . $col . '`' : $col; }

/* A counter every write moves. A derived value computed in a read-only
   request (a member's courses, the course list) can be reused until it moves,
   so a list never rebuilds it per row. */
function db_write_gen(): int { return (int)($GLOBALS['__db_wgen'] ?? 0); }
function db_wrote(): void { $GLOBALS['__db_wgen'] = (int)($GLOBALS['__db_wgen'] ?? 0) + 1; }

function db_insert(string $table, array $data): int {
    db_wrote();
    $data = db_centre_mirror($table, $data);
    if ($table === 'centres' && function_exists('centre_id_cache_clear')) centre_id_cache_clear();
    $cols = array_map('db_ident', array_keys($data));
    $ph = array_fill(0, count($cols), '?');
    $sql = 'INSERT INTO ' . $table . ' (' . implode(',', $cols) . ') VALUES (' . implode(',', $ph) . ')';
    db_conn()->prepare($sql)->execute(array_values($data));
    return (int)db_conn()->lastInsertId();
}

function db_update(string $table, array $data, array $where): int {
    db_wrote();
    $data = db_centre_mirror($table, $data);
    if ($table === 'centres' && function_exists('centre_id_cache_clear')) centre_id_cache_clear();
    $set = []; $vals = [];
    foreach ($data as $k => $v) { $set[] = db_ident($k) . ' = ?'; $vals[] = $v; }
    $wh = []; foreach ($where as $k => $v) { $wh[] = db_ident($k) . ' = ?'; $vals[] = $v; }
    $sql = 'UPDATE ' . $table . ' SET ' . implode(',', $set) . ' WHERE ' . implode(' AND ', $wh);
    $stmt = db_conn()->prepare($sql);
    $stmt->execute($vals);
    return $stmt->rowCount();
}

/** Cross-driver insert-or-update. $conflict = unique/PK column(s). */
function db_upsert(string $table, array $insert, array $conflict, array $update): void {
    db_wrote();
    $insert = db_centre_mirror($table, $insert);
    $update = db_centre_mirror($table, $update);
    if ($table === 'centres' && function_exists('centre_id_cache_clear')) centre_id_cache_clear();
    $cols = array_map('db_ident', array_keys($insert));
    $ph = implode(',', array_fill(0, count($cols), '?'));
    $vals = array_values($insert);
    $set = []; foreach ($update as $k => $v) { $set[] = db_ident($k) . ' = ?'; $vals[] = $v; }
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
    db_tick(); db_wrote();
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
