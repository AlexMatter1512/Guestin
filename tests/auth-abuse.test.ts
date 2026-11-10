import { expect, spyOn, test } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";

const origin = "http://localhost:3000";
function fixture() {
  const db = openDatabase(":memory:");
  const app = createApp(db, {
    key: "a".repeat(64),
    setupToken: "setup",
    origin,
  });
  const post = (path: string, input: Record<string, unknown>) =>
    app.request(`/api/v1/auth/${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Fixture",
        email: "fixture@example.test",
        password: "fixture-password",
        ...input,
      }),
    });
  return { db, app, post };
}
async function waitFor(predicate: () => boolean) {
  for (let n = 0; n < 100 && !predicate(); n++) await Bun.sleep(1);
  expect(predicate()).toBe(true);
}

test("invalid, expired, consumed and completed bootstrap requests do not hash passwords", async () => {
  const f = fixture(),
    hash = spyOn(Bun.password, "hash");
  try {
    expect((await f.post("setup", { setupToken: "wrong" })).status).toBe(403);
    expect((await f.post("accept-invite", { invite: "missing" })).status).toBe(
      403,
    );
    f.db
      .query("INSERT INTO invites VALUES(?,?)")
      .run(digest("expired"), Date.now() - 1);
    expect((await f.post("accept-invite", { invite: "expired" })).status).toBe(
      403,
    );
    f.db
      .query("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("owner", "Owner", "owner@example.test", "fixture-hash", "owner");
    expect((await f.post("setup", { setupToken: "setup" })).status).toBe(403);
    expect(hash).not.toHaveBeenCalled();
  } finally {
    hash.mockRestore();
    f.db.close();
  }
});

for (const kind of ["setup", "accept-invite"] as const) {
  test(`concurrent ${kind} requests can consume eligibility only once`, async () => {
    const f = fixture(),
      release: Array<(value: string) => void> = [];
    const hash = spyOn(Bun.password, "hash").mockImplementation(
      () => new Promise<string>((resolve) => release.push(resolve)),
    );
    try {
      if (kind === "accept-invite")
        f.db
          .query("INSERT INTO invites VALUES(?,?)")
          .run(digest("invite"), Date.now() + 60000);
      const input =
        kind === "setup" ? { setupToken: "setup" } : { invite: "invite" };
      const first = f.post(kind, { ...input, email: "first@example.test" });
      const second = f.post(kind, { ...input, email: "second@example.test" });
      await waitFor(() => release.length === 2);
      for (const done of release) done("fixture-hash");
      expect(
        (await Promise.all([first, second])).map((r) => r.status).sort(),
      ).toEqual([200, 403]);
      expect((f.db.query("SELECT COUNT(*) n FROM users").get() as any).n).toBe(
        1,
      );
      expect(
        (f.db.query("SELECT COUNT(*) n FROM sessions").get() as any).n,
      ).toBe(1);
    } finally {
      for (const done of release) done("fixture-hash");
      hash.mockRestore();
      f.db.close();
    }
  });
}

test("queued setup checks eligibility again before hashing", async () => {
  const f = fixture(),
    release: Array<(value: string) => void> = [];
  const hash = spyOn(Bun.password, "hash").mockImplementation(
    () => new Promise<string>((resolve) => release.push(resolve)),
  );
  try {
    const requests = Array.from({ length: 3 }, (_, n) =>
      f.post("setup", { setupToken: "setup", email: `host${n}@example.test` }),
    );
    await waitFor(() => release.length === 2);
    // Another request commits while these operations are waiting.
    f.db
      .query("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("owner", "Owner", "owner@example.test", "fixture-hash", "owner");
    for (const done of release) done("fixture-hash");
    expect((await Promise.all(requests)).map((r) => r.status)).toEqual([
      403, 403, 403,
    ]);
    expect(hash).toHaveBeenCalledTimes(2);
  } finally {
    for (const done of release) done("fixture-hash");
    hash.mockRestore();
    f.db.close();
  }
});

test("random invalid tokens cannot flood history or push jobs, including across many clients", async () => {
  const f = fixture();
  try {
    f.db
      .query("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("owner", "Owner", "owner@example.test", "fixture-hash", "owner");
    f.db
      .query("INSERT INTO subscriptions VALUES(?,?,?,?)")
      .run(
        "sub",
        "owner",
        "{}",
        JSON.stringify({ events: ["access.invalid"] }),
      );
    for (let n = 0; n < 40; n++) {
      const r = await f.app.request(
        "/api/v1/guest",
        { headers: { Authorization: `Bearer invalid-${n}` } },
        { clientIP: "192.0.2.1" },
      );
      expect(r.status).toBe(403);
    }
    expect((f.db.query("SELECT COUNT(*) n FROM events").get() as any).n).toBe(
      1,
    );
    for (let n = 2; n < 42; n++)
      await f.app.request(
        "/api/v1/guest",
        { headers: { Authorization: `Bearer random-${n}` } },
        { clientIP: `192.0.2.${n}` },
      );
    expect((f.db.query("SELECT COUNT(*) n FROM events").get() as any).n).toBe(
      20,
    );
    expect((f.db.query("SELECT COUNT(*) n FROM jobs").get() as any).n).toBe(20);
    const clock = spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
    try {
      await f.app.request("/api/v1/guest", {}, { clientIP: "192.0.2.99" });
      const contexts = f.db
        .query("SELECT data FROM event_context")
        .all() as any[];
      expect(
        contexts
          .map((row) => JSON.parse(row.data))
          .find((c) => c.suppressedAttempts),
      ).toEqual({ suppressedAttempts: 60 });
    } finally {
      clock.mockRestore();
    }
  } finally {
    f.db.close();
  }
});
