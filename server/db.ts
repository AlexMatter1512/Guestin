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
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
