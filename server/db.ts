import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);`,
  );
  if (!db.query("SELECT 1 FROM migrations WHERE version=1").get())
    db.transaction(() => {
      db.exec(`
 CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','staff')));
 CREATE TABLE sessions(digest TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE invites(digest TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE properties(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE doors(id TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id),data TEXT NOT NULL,secret TEXT NOT NULL);
 CREATE TABLE codes(id TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id),creator TEXT REFERENCES users(id) ON DELETE SET NULL,digest TEXT UNIQUE NOT NULL,secret TEXT NOT NULL,data TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
 CREATE TABLE grants(code_id TEXT REFERENCES codes(id),door_id TEXT REFERENCES doors(id),start TEXT NOT NULL,end TEXT NOT NULL,single_use INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,claim TEXT,PRIMARY KEY(code_id,door_id));
 CREATE TABLE redemptions(id TEXT PRIMARY KEY,code_id TEXT REFERENCES codes(id),quantity INTEGER NOT NULL,date TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE actions(id TEXT PRIMARY KEY,code_id TEXT REFERENCES codes(id),kind TEXT NOT NULL,target TEXT NOT NULL,result TEXT NOT NULL);
 CREATE TABLE connections(id TEXT PRIMARY KEY,property_id TEXT REFERENCES properties(id),kind TEXT NOT NULL,name TEXT NOT NULL,secret TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE templates(property_id TEXT PRIMARY KEY REFERENCES properties(id),data TEXT NOT NULL);
 CREATE TABLE events(id TEXT PRIMARY KEY,property_id TEXT,code_id TEXT,type TEXT NOT NULL,message TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE subscriptions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL,preferences TEXT NOT NULL);
 CREATE TABLE jobs(event_id TEXT REFERENCES events(id),subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next INTEGER NOT NULL,PRIMARY KEY(event_id,subscription_id));
 CREATE INDEX codes_property_created ON codes(property_id,created);
 CREATE INDEX redemptions_code_date ON redemptions(code_id,date);
 CREATE INDEX events_code_type ON events(code_id,type);
 CREATE INDEX jobs_due ON jobs(next);
 INSERT INTO migrations VALUES(1);`);
    })();
  if (!db.query("SELECT 1 FROM migrations WHERE version=2").get())
    db.transaction(() => {
      db.exec(`
        CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL);
        ALTER TABLE grants ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE door_tests(id TEXT PRIMARY KEY,door_id TEXT NOT NULL,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,result TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
        CREATE INDEX door_tests_pending ON door_tests(door_id,resolved);
        INSERT INTO migrations VALUES(2);
      `);
    })();
  if (!db.query("SELECT 1 FROM migrations WHERE version=3").get())
    db.transaction(() => {
      db.exec(`
        CREATE TABLE property_settings(property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,notification_months INTEGER NOT NULL DEFAULT 3 CHECK(notification_months BETWEEN 1 AND 120),breakfast_password TEXT);
        INSERT INTO property_settings(property_id) SELECT id FROM properties;
        CREATE TABLE breakfast_sessions(digest TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
        CREATE INDEX breakfast_sessions_expiry ON breakfast_sessions(expires);
        CREATE TABLE code_metrics(code_id TEXT PRIMARY KEY REFERENCES codes(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,accepted INTEGER NOT NULL DEFAULT 0);
        INSERT INTO code_metrics(code_id,attempts,accepted) SELECT c.id,(SELECT COUNT(*) FROM events e WHERE e.code_id=c.id AND e.type LIKE 'access.%'),(SELECT COUNT(*) FROM events e WHERE e.code_id=c.id AND e.type='access.accepted') FROM codes c;
        CREATE INDEX events_property_created ON events(property_id,created,id);
        INSERT INTO migrations VALUES(3);
      `);
    })();
  if (!db.query("SELECT 1 FROM migrations WHERE version=4").get())
    db.transaction(() => {
      db.exec(`CREATE TABLE event_context(event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,data TEXT NOT NULL);
        INSERT INTO migrations VALUES(4);`);
    })();
  if (!db.query("SELECT 1 FROM migrations WHERE version=5").get())
    db.transaction(() => {
      db.exec(`CREATE TABLE event_reads(
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TEXT NOT NULL,
        PRIMARY KEY(event_id,user_id)
      );
      CREATE INDEX event_reads_user ON event_reads(user_id,event_id);
      INSERT INTO migrations VALUES(5);`);
    })();
  // Both unreleased worktrees used version 6. Detect the account schema too,
  // so databases created by either worktree upgrade without losing data.
  if (
    !db.query("SELECT 1 FROM migrations WHERE version=6").get() ||
    !db
      .query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_permissions'",
      )
      .get()
  ) {
    // Rebuild the role CHECK constraint without firing cascades on child tables.
    db.exec("PRAGMA foreign_keys=OFF");
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE users_v6(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','collaborator')));
          INSERT INTO users_v6 SELECT id,name,email,password,CASE role WHEN 'staff' THEN 'collaborator' ELSE role END FROM users;
          DROP TABLE users;
          ALTER TABLE users_v6 RENAME TO users;
          CREATE TABLE user_permissions(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL);
          INSERT INTO user_permissions SELECT id,'{"createAccessCodes":true,"createDoors":false,"useBookingConnectors":true,"createStaffCodes":true}' FROM users WHERE role='collaborator';
          INSERT OR IGNORE INTO migrations VALUES(6);
        `);
        if (db.query("PRAGMA foreign_key_check").all().length)
          throw Error("Account migration would break foreign keys");
      })();
    } finally {
      db.exec("PRAGMA foreign_keys=ON");
    }
  }
  if (!db.query("SELECT 1 FROM migrations WHERE version=7").get())
    db.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS account_backoff(identity TEXT PRIMARY KEY,attempts INTEGER NOT NULL,next INTEGER NOT NULL,expires INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS account_backoff_expiry ON account_backoff(expires);
        INSERT INTO migrations VALUES(7);`);
    })();
  if (!db.query("SELECT 1 FROM migrations WHERE version=8").get())
    db.transaction(() => {
      db.exec(`ALTER TABLE property_settings ADD COLUMN notification_limit INTEGER NOT NULL DEFAULT 1000 CHECK(notification_limit BETWEEN 1 AND 100000);
        INSERT INTO migrations VALUES(8);`);
    })();
  if (!db.query("SELECT 1 FROM migrations WHERE version=9").get())
    db.transaction(() => {
      db.exec(`CREATE TABLE smtp_settings(id INTEGER PRIMARY KEY CHECK(id=1),secret TEXT NOT NULL);
        CREATE TABLE email_verifications(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL,verified_at INTEGER NOT NULL);
        CREATE TABLE account_tokens(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('reset','verify')),email TEXT NOT NULL,password_hash TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE INDEX account_tokens_user ON account_tokens(user_id,kind);
        CREATE TABLE account_mail_attempts(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,last_sent INTEGER NOT NULL,PRIMARY KEY(user_id,kind));
        CREATE TABLE password_reset_requests(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,requested_at INTEGER NOT NULL);
        INSERT INTO migrations VALUES(9);`);
    })();
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
