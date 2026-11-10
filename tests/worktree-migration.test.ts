import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../server/db";

for (const previous of ["collaborators", "password-backoff"] as const)
  test(`merged migration upgrades the ${previous} worktree's version 6 database`, () => {
    const directory = mkdtempSync(join(tmpdir(), "oshost-worktree-migration-")),
      path = join(directory, "db.sqlite");
    let db = openDatabase(path);
    try {
      db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
        "u",
        "Colleague",
        "colleague@example.test",
        "hash",
        "collaborator",
      );
      db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
        "session",
        "u",
        "csrf",
        Date.now() + 60000,
      );
      db.query("INSERT INTO user_permissions VALUES(?,?)").run(
        "u",
        JSON.stringify({ createDoors: true }),
      );
      db.query("INSERT INTO properties VALUES(?,?)").run("p", "{}");
      db.query("INSERT INTO codes VALUES(?,?,?,?,?,?,?,?)").run(
        "c",
        "p",
        "u",
        "digest",
        "secret",
        "{}",
        0,
        new Date().toISOString(),
      );
      db.exec("ALTER TABLE property_settings DROP COLUMN notification_limit;");
      if (previous === "collaborators") {
        db.exec(
          "DROP TABLE account_backoff; DELETE FROM migrations WHERE version>=7;",
        );
      } else {
        db.query("INSERT INTO account_backoff VALUES(?,?,?,?)").run(
          "identity",
          5,
          Date.now() + 30000,
          Date.now() + 86400000,
        );
        db.exec(`PRAGMA foreign_keys=OFF;
          CREATE TABLE previous_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','staff')));
          INSERT INTO previous_users SELECT id,name,email,password,CASE role WHEN 'collaborator' THEN 'staff' ELSE role END FROM users;
          DROP TABLE user_permissions;
          DROP TABLE users;
          ALTER TABLE previous_users RENAME TO users;
          DELETE FROM migrations WHERE version>=7;`);
      }
      db.close();
      db = openDatabase(path);
      expect(
        (db.query("SELECT MAX(version) n FROM migrations").get() as any).n,
      ).toBe(8);
      expect(
        (db.query("SELECT role FROM users WHERE id='u'").get() as any).role,
      ).toBe("collaborator");
      expect(
        (db.query("SELECT creator FROM codes WHERE id='c'").get() as any)
          .creator,
      ).toBe("u");
      expect(
        db.query("SELECT * FROM sessions WHERE user_id='u'").all(),
      ).toHaveLength(1);
      const permissions = JSON.parse(
        (
          db
            .query("SELECT data FROM user_permissions WHERE user_id='u'")
            .get() as any
        ).data,
      );
      expect(permissions.createDoors).toBe(previous === "collaborators");
      if (previous === "password-backoff") {
        expect(permissions.createAccessCodes).toBe(true);
        expect(
          (
            db
              .query(
                "SELECT attempts FROM account_backoff WHERE identity='identity'",
              )
              .get() as any
          ).attempts,
        ).toBe(5);
      } else
        expect(db.query("SELECT * FROM account_backoff").all()).toEqual([]);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      expect((db.query("PRAGMA foreign_keys").get() as any).foreign_keys).toBe(
        1,
      );
      db.close();
      db = openDatabase(path);
      expect(db.query("SELECT id FROM users").all()).toHaveLength(1);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
