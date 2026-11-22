import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

// One SQLite file holds accounts, sessions, flights and imports. It lives in
// FLYPRINT_DATA_DIR (a volume in the container), never in the release.
export const dataDir = () => resolve(process.env.FLYPRINT_DATA_DIR || join(process.cwd(), "data", "app"));

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password TEXT NOT NULL,
     name TEXT NOT NULL,
     label TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE imports (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     status TEXT NOT NULL,
     sources TEXT NOT NULL,
     draft TEXT,
     added INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX imports_user ON imports(user_id, created_at);
   CREATE TABLE flights (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     id TEXT NOT NULL,
     date TEXT NOT NULL,
     flight TEXT NOT NULL,
     airline TEXT NOT NULL,
     origin TEXT NOT NULL,
     destination TEXT NOT NULL,
     depart TEXT NOT NULL,
     arrive TEXT NOT NULL,
     arrival_day_offset INTEGER NOT NULL,
     duration_minutes INTEGER NOT NULL,
     time_source TEXT NOT NULL,
     km INTEGER NOT NULL,
     seat TEXT NOT NULL DEFAULT '',
     cabin TEXT NOT NULL DEFAULT '',
     aircraft TEXT,
     operation TEXT,
     import_id TEXT REFERENCES imports(id) ON DELETE SET NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, id)
   );
   CREATE INDEX flights_date ON flights(user_id, date);
   CREATE INDEX flights_import ON flights(import_id);
   CREATE TABLE companions (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     companion_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, companion_id)
   );
   CREATE TABLE names (
     kind TEXT NOT NULL,
     code TEXT NOT NULL,
     value TEXT NOT NULL,
     PRIMARY KEY (kind, code)
   );
   CREATE TABLE usage (
     scope TEXT NOT NULL,
     day TEXT NOT NULL,
     calls INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (scope, day)
   );`,
  // Each account keeps its own flights; a link lets two accounts see the
  // flights they both logged, and each side chooses whether the other may
  // also see the rest. Existing links keep seeing everything, as before.
  `ALTER TABLE users ADD COLUMN tone INTEGER NOT NULL DEFAULT 0;
   UPDATE users SET tone = (SELECT COUNT(*) FROM users earlier WHERE earlier.created_at < users.created_at OR (earlier.created_at = users.created_at AND earlier.id < users.id)) % 6;
   ALTER TABLE companions ADD COLUMN shares TEXT NOT NULL DEFAULT 'together';
   UPDATE companions SET shares = 'all' WHERE status = 'linked';
   CREATE TABLE invites (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX invites_user ON invites(user_id);`,
  // A public link to someone's flown routes, off until they turn it on.
  `ALTER TABLE users ADD COLUMN share TEXT;
   CREATE UNIQUE INDEX users_share ON users(share) WHERE share IS NOT NULL;`,
  // A link by mail to choose a new password; only its digest is kept.
  `CREATE TABLE resets (
     token TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX resets_user ON resets(user_id);`,
  // How many readers each tagged link (?ref=) sent, and how many of them
  // signed up, per day. Counts only: nothing here points at an account.
  `CREATE TABLE arrivals (
     day TEXT NOT NULL,
     ref TEXT NOT NULL,
     visits INTEGER NOT NULL DEFAULT 0,
     signups INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, ref)
   );`,
  // A trial: someone imports before making an account. Their flights live
  // under a guest account for a week; signing up keeps them, else they go.
  `ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;
   CREATE INDEX users_guest ON users(created_at) WHERE guest = 1;
   ALTER TABLE arrivals ADD COLUMN trials INTEGER NOT NULL DEFAULT 0;`,
];

let handle: DatabaseSync | null = null;
const opened: (() => void)[] = [];

export function database() {
  if (handle) return handle;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  // The file keeps its name from before the rename: live volumes already hold it.
  const db = new DatabaseSync(join(dir, "waypoint.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000; PRAGMA synchronous = NORMAL;");
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let index = version; index < MIGRATIONS.length; index++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[index]);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  handle = db;
  for (const run of opened) run();
  keepBackups(db);
  return db;
}

// A copy of the database each day in the data directory, the last week kept,
// so a bad import, a mistaken delete or a broken migration can be undone.
// It shares the volume with the database, so it is no substitute for a copy
// kept elsewhere.
const BACKUPS = 7;
const BACKUP = /^waypoint-\d{4}-\d{2}-\d{2}\.db$/;
function backUp(db: DatabaseSync) {
  const dir = join(dataDir(), "backups");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `waypoint-${new Date().toISOString().slice(0, 10)}.db`);
  if (existsSync(target)) return;
  const partial = `${target}.partial`;
  for (const name of readdirSync(dir).filter((name) => name.endsWith(".partial"))) rmSync(join(dir, name), { force: true });
  try {
    db.exec(`VACUUM INTO '${partial.replaceAll("'", "''")}'`);
    renameSync(partial, target);
  } catch (error) {
    // A disk that filled up mid-copy gets its space back at once.
    rmSync(partial, { force: true });
    throw error;
  }
  for (const name of readdirSync(dir).filter((name) => BACKUP.test(name)).sort().slice(0, -BACKUPS)) rmSync(join(dir, name));
}

function keepBackups(db: DatabaseSync) {
  const run = () => { try { backUp(db); } catch (error) { console.error("backup failed", error); } };
  // The first copy waits a minute, so a process that opens the database
  // briefly (a test, a script) leaves none behind.
  setTimeout(run, 60_000).unref();
  setInterval(run, 3_600_000).unref();
}

// Work that needs the database as soon as it exists (the first-run seed, the
// reset of imports a restart cut short). A module loaded after the database
// opened runs its work at once.
export function whenOpened(run: () => void) {
  if (handle) run();
  else opened.push(run);
}

export function transaction<T>(work: (db: DatabaseSync) => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newId(prefix: string, length = 12) {
  const bytes = randomBytes(length);
  let id = prefix;
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

export const now = () => Date.now();
