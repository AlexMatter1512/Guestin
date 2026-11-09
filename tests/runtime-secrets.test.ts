import { expect, test, spyOn } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initializeRuntimeSecrets,
  printSetupInstructions,
} from "../server/runtime-secrets";
import { openDatabase } from "../server/db";
import { vault } from "../server/security";

function temporary(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "oshost-secrets-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("first startup generates private stable secrets and preserves encrypted credentials", () =>
  temporary((dir) => {
    const env: Record<string, string> = { DB_PATH: join(dir, "oshost.sqlite") };
    const first = initializeRuntimeSecrets(env);
    expect(first.secrets.APP_KEY).toMatch(/^[a-f0-9]{64}$/);
    expect(first.secrets.SETUP_TOKEN.length).toBeGreaterThanOrEqual(43);
    expect(statSync(first.path).mode & 0o777).toBe(0o600);
    expect(env.VAPID_PUBLIC_KEY).toBe(first.secrets.VAPID_PUBLIC_KEY);
    const encrypted = vault(first.secrets.APP_KEY).seal({
      credential: "stored",
    });
    const second = initializeRuntimeSecrets({ DB_PATH: env.DB_PATH });
    expect(second.secrets).toEqual(first.secrets);
    expect(vault(second.secrets.APP_KEY).open(encrypted)).toEqual({
      credential: "stored",
    });
  }));

test("existing environment keys are adopted without changing encryption identity", () =>
  temporary((dir) => {
    const dbPath = join(dir, "oshost.sqlite");
    const db = openDatabase(dbPath);
    db.close();
    const result = initializeRuntimeSecrets({
      DB_PATH: dbPath,
      APP_KEY: "c".repeat(64),
      SETUP_TOKEN: "legacy-token",
    });
    expect(result.secrets.APP_KEY).toBe("c".repeat(64));
    expect(result.secrets.SETUP_TOKEN).toBe("legacy-token");
  }));

test("missing, corrupt, and conflicting secrets fail without overwriting identity", () =>
  temporary((dir) => {
    const dbPath = join(dir, "oshost.sqlite");
    const db = openDatabase(dbPath);
    db.close();
    expect(() => initializeRuntimeSecrets({ DB_PATH: dbPath })).toThrow(
      "Existing database has no encryption key",
    );
    const first = initializeRuntimeSecrets({
      DB_PATH: dbPath,
      APP_KEY: "c".repeat(64),
    });
    const original = readFileSync(first.path, "utf8");
    expect(() =>
      initializeRuntimeSecrets({ DB_PATH: dbPath, APP_KEY: "d".repeat(64) }),
    ).toThrow("differs");
    expect(readFileSync(first.path, "utf8")).toBe(original);
    writeFileSync(first.path, "corrupt");
    expect(() => initializeRuntimeSecrets({ DB_PATH: dbPath })).toThrow(
      "No keys were replaced",
    );
    expect(readFileSync(first.path, "utf8")).toBe("corrupt");
  }));

test("setup token is output only before an owner exists", () =>
  temporary((dir) => {
    const db = openDatabase(join(dir, "oshost.sqlite"));
    const output = spyOn(console, "log").mockImplementation(() => {});
    try {
      printSetupInstructions(db, "bootstrap-only");
      expect(output).toHaveBeenCalledTimes(1);
      expect(JSON.parse(output.mock.calls[0][0]).setupToken).toBe(
        "bootstrap-only",
      );
      db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
        "owner",
        "Owner",
        "owner@example.test",
        "hash",
        "owner",
      );
      printSetupInstructions(db, "bootstrap-only");
      expect(output).toHaveBeenCalledTimes(1);
    } finally {
      output.mockRestore();
      db.close();
    }
  }));
