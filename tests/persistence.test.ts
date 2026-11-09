import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db";
import { vault } from "../server/security";
import { createApp } from "../server/app";
import { initializeRuntimeSecrets } from "../server/runtime-secrets";
test("versioned migrations, restart recovery, and backup/restore preserve encrypted data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oshost-db-")),
    path = join(dir, "live.sqlite"),
    backup = join(dir, "backup"),
    key = "d".repeat(64);
  try {
    let db = openDatabase(path);
    db.query("INSERT INTO properties VALUES(?,?)").run(
      "p",
      JSON.stringify({ name: "Test", timezone: "UTC" }),
    );
    db.query("INSERT INTO doors VALUES(?,?,?,?)").run(
      "d",
      "p",
      "{}",
      vault(key).seal({ webhook_code: "secret" }),
    );
    db.query(
      "INSERT INTO codes(id,property_id,digest,secret,data,created) VALUES(?,?,?,?,?,?)",
    ).run(
      "c",
      "p",
      "digest",
      vault(key).seal("guest-token"),
      "{}",
      new Date().toISOString(),
    );
    db.query(
      "INSERT INTO grants(code_id,door_id,start,end,single_use,claim) VALUES(?,?,?,?,?,?)",
    ).run("c", "d", "2026-01-01", "2027-01-01", 1, "action");
    db.query("INSERT INTO actions VALUES(?,?,?,?,?)").run(
      "action",
      "c",
      "door",
      "d",
      JSON.stringify({ status: "pending" }),
    );
    db.close();
    db = openDatabase(path);
    createApp(db, { key, origin: "http://localhost:3000", setupToken: "test" });
    expect(
      JSON.parse((db.query("SELECT result FROM actions").get() as any).result)
        .status,
    ).toBe("uncertain");
    expect((db.query("SELECT claim FROM grants").get() as any).claim).toBe(
      "action",
    );
    expect((db.query("SELECT COUNT(*) n FROM migrations").get() as any).n).toBe(
      3,
    );
    db.close();
    const proc = Bun.spawn(["bun", "scripts/backup.ts", backup], {
      env: { ...process.env, DB_PATH: path, APP_KEY: key },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
    const secrets = await Bun.file(join(backup, "secrets.json")).json();
    const restoredSecrets = initializeRuntimeSecrets({
      DB_PATH: join(backup, "oshost.sqlite"),
    });
    expect(restoredSecrets.secrets.APP_KEY).toBe(key);
    const restored = openDatabase(join(backup, "oshost.sqlite"));
    expect(
      vault(secrets.APP_KEY).open(
        (restored.query("SELECT secret FROM codes").get() as any).secret,
      ),
    ).toBe("guest-token");
    expect(
      vault(secrets.APP_KEY).open(
        (restored.query("SELECT secret FROM doors").get() as any).secret,
      ).webhook_code,
    ).toBe("secret");
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
