import { describe, expect, test, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLogger,
  withLogContext,
  setLogActor,
  sanitizeLogFields,
  logRoute,
} from "../server/log";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
describe("structured backend logging", () => {
  test("API request IDs correlate successful and rejected authentication without credentials", async () => {
    const rows: any[] = [];
    const spy = spyOn(console, "log").mockImplementation((line) => {
      try {
        rows.push(JSON.parse(String(line)));
      } catch {}
    });
    const db = openDatabase(":memory:");
    try {
      const app = createApp(db, {
        key: "a".repeat(64),
        setupToken: "private-setup-token",
        origin: "http://localhost",
      });
      const response = await app.request("/api/v1/auth/setup", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Alice Host",
          email: "alice@example.com",
          password: "private-password-value",
          setupToken: "private-setup-token",
        }),
      });
      expect(response.status).toBe(200);
      const requestId = response.headers.get("X-Request-ID");
      expect(requestId).toBeTruthy();
      const success = rows.find(
        (r) => r.event === "auth.succeeded" && r.requestId === requestId,
      );
      expect(success.actor.name).toBe("Alice Host");
      expect(success.actor.role).toBe("owner");
      await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "incorrect-private-value",
        }),
      });
      expect(rows.some((r) => r.event === "auth.rejected")).toBe(true);
      expect(
        rows.some((r) => r.event === "request.completed" && r.status === 401),
      ).toBe(true);
      const output = JSON.stringify(rows);
      expect(output).not.toContain("private-password-value");
      expect(output).not.toContain("private-setup-token");
      expect(output).not.toContain("incorrect-private-value");
    } finally {
      spy.mockRestore();
      db.close();
    }
  });
  test("request context remains isolated between concurrent users", async () => {
    const lines: string[] = [];
    const write = createLogger({
      file: false,
      stdout: (line) => lines.push(line),
    });
    await Promise.all(
      [1, 2].map((id) =>
        withLogContext(
          { requestId: String(id), method: "POST", route: "/api/v1/codes" },
          async () => {
            setLogActor({
              id: String(id),
              name: "Host " + id,
              role: id === 1 ? "owner" : "staff",
            });
            await Bun.sleep(id === 1 ? 15 : 1);
            write("info", "code.saved");
          },
        ),
      ),
    );
    expect(lines.length).toBe(2);
    for (const line of lines) {
      const row = JSON.parse(line);
      expect(row.timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(row.actor.id).toBe(row.requestId);
      expect(row.actor.name).toBe("Host " + row.requestId);
      expect(row.method).toBe("POST");
    }
  });
  test("raw secrets and arbitrary payloads cannot enter records", () => {
    const secret = "sensitive-value";
    const safe = sanitizeLogFields({
      password: secret,
      otp: secret,
      token: secret,
      cookie: secret,
      authorization: secret,
      body: { password: secret },
      url: "https://example.com/?token=" + secret,
      config: { key: secret },
      actor: { id: "a", name: "Owner", role: "owner", password: secret },
      status: 401,
    });
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(safe.actor).toEqual({ id: "a", name: "Owner", role: "owner" });
    expect(logRoute("/api/v1/codes/" + secret)).toBe("/api/v1/codes/:id");
    expect(logRoute("/api/v1/auth/" + secret)).toBe("/api/[unmatched]");
  });
  test("rotates bounded persistent files and honors levels", () => {
    const dir = mkdtempSync(join(tmpdir(), "oshost-logs-")),
      file = join(dir, "server.jsonl"),
      lines: string[] = [];
    const write = createLogger({
      file,
      maxBytes: 1024,
      rotations: 2,
      level: "warn",
      stdout: (line) => lines.push(line),
    });
    write("debug", "ignored");
    for (let i = 0; i < 30; i++)
      write("warn", "provider.rejected", {
        attempt: i,
        reason: "x".repeat(120),
      });
    expect(lines.length).toBe(30);
    expect(readdirSync(dir).sort()).toEqual([
      "server.jsonl",
      "server.jsonl.1",
      "server.jsonl.2",
    ]);
    for (const name of readdirSync(dir))
      for (const line of readFileSync(join(dir, name), "utf8")
        .trim()
        .split("\n"))
        expect(JSON.parse(line).level).toBe("warn");
  });
  test("broken log destinations never change operational outcomes", () => {
    const write = createLogger({
      file: "/dev/null/not-a-directory",
      stdout: () => {
        throw Error("sink failure");
      },
    });
    expect(() => write("info", "safe.operation")).not.toThrow();
  });
});
