import { expect, spyOn, test } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { accountBackoff } from "../server/account-backoff";
import { digest } from "../server/security";

const origin = "https://access.example.test";
const oldPassword = "original-password!",
  newPassword = "replacement-password!";
function appFor(db: ReturnType<typeof openDatabase>) {
  return createApp(db, { key: "a".repeat(64), setupToken: "setup", origin });
}
async function fixture(role = "owner") {
  const db = openDatabase(":memory:");
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    "user",
    "Host",
    "host@example.test",
    await Bun.password.hash(oldPassword, { algorithm: "argon2id" }),
    role,
  );
  db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest("first"),
    "user",
    "csrf-first",
    Date.now() + 60000,
  );
  db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest("second"),
    "user",
    "csrf-second",
    Date.now() + 60000,
  );
  const app = appFor(db);
  return { db, app };
}
function post(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  ip = "192.0.2.1",
  headers: Record<string, string> = {},
) {
  return app.request(
    `/api/v1/${path}`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
    { clientIP: ip },
  );
}
const auth = { Cookie: "guestin_session=first", "X-CSRF-Token": "csrf-first" };

test("account backoff survives app recreation, email case and changing client IPs", async () => {
  const { db, app } = await fixture();
  try {
    for (let n = 0; n < 5; n++)
      expect(
        (
          await post(
            app,
            "auth/login",
            { email: "HOST@example.test", password: "wrong" },
            `192.0.2.${n}`,
          )
        ).status,
      ).toBe(401);
    const blocked = await post(
      appFor(db),
      "auth/login",
      { email: "host@example.test", password: oldPassword },
      "198.51.100.1",
    );
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(
      (
        await post(app, "auth/login", {
          email: "other@example.test",
          password: "wrong",
        })
      ).status,
    ).toBe(401);
  } finally {
    db.close();
  }
});

test("backoff doubles, caps, is not extended by blocked attempts, clears on success and expires", () => {
  const db = openDatabase(":memory:");
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    "user",
    "Host",
    "host@example.test",
    "unused",
    "owner",
  );
  let now = 1000;
  const budget = accountBackoff(db, () => now);
  try {
    for (let n = 0; n < 5; n++)
      expect(budget.take("host@example.test")).toBe(0);
    for (const seconds of [30, 60, 120, 240, 480, 900, 900]) {
      expect(budget.take("HOST@example.test")).toBe(seconds);
      now += 1000;
      expect(budget.take("host@example.test")).toBe(seconds - 1);
      now += (seconds - 1) * 1000;
      expect(budget.take("host@example.test")).toBe(0);
    }
    budget.clear("HOST@example.test");
    expect(budget.take("host@example.test")).toBe(0);
    now += 86400000;
    expect(budget.take("host@example.test")).toBe(0);
    expect(db.query("SELECT attempts FROM account_backoff").get()).toEqual({
      attempts: 1,
    });
  } finally {
    db.close();
  }
});

for (const role of ["owner", "collaborator"])
  test(`${role} can rotate a password and revoke every session`, async () => {
    const { db, app } = await fixture(role);
    try {
      const r = await post(
        app,
        "me/password",
        { currentPassword: oldPassword, newPassword },
        undefined,
        auth,
      );
      expect(r.status).toBe(200);
      expect(r.headers.get("Set-Cookie")).toContain("Max-Age=0; Secure");
      expect(db.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({
        n: 0,
      });
      for (const session of ["first", "second"])
        expect(
          (
            await app.request("/api/v1/me", {
              headers: { Cookie: `guestin_session=${session}` },
            })
          ).status,
        ).toBe(401);
      expect(
        (
          await post(app, "auth/login", {
            email: "host@example.test",
            password: oldPassword,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await post(app, "auth/login", {
            email: "host@example.test",
            password: newPassword,
          })
        ).status,
      ).toBe(200);
      expect(db.query("SELECT COUNT(*) n FROM account_backoff").get()).toEqual({
        n: 0,
      });
    } finally {
      db.close();
    }
  });

test("password change requires a session, CSRF, origin, current password and password policy", async () => {
  const { db, app } = await fixture();
  const input = { currentPassword: oldPassword, newPassword };
  try {
    expect((await post(app, "me/password", input)).status).toBe(401);
    expect(
      (
        await post(app, "me/password", input, undefined, {
          ...auth,
          "X-CSRF-Token": "wrong",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(app, "me/password", input, undefined, {
          ...auth,
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          app,
          "me/password",
          { ...input, currentPassword: "wrong" },
          undefined,
          auth,
        )
      ).status,
    ).toBe(403);
    for (const password of ["short", "x".repeat(201), oldPassword])
      expect(
        (
          await post(
            app,
            "me/password",
            { ...input, newPassword: password },
            undefined,
            auth,
          )
        ).status,
      ).toBe(400);
    expect(db.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 2 });
  } finally {
    db.close();
  }
});

test("password change guesses share the login account budget", async () => {
  const { db, app } = await fixture();
  try {
    for (let n = 0; n < 5; n++)
      expect(
        (
          await post(
            app,
            "me/password",
            { currentPassword: "wrong", newPassword },
            `192.0.2.${n}`,
            auth,
          )
        ).status,
      ).toBe(403);
    expect(
      (
        await post(
          app,
          "auth/login",
          { email: "host@example.test", password: oldPassword },
          "198.51.100.1",
        )
      ).status,
    ).toBe(429);
  } finally {
    db.close();
  }
});

test("concurrent login cannot establish a session using a password rotated during verification", async () => {
  const { db, app } = await fixture();
  let release!: (value: boolean) => void;
  const verify = spyOn(Bun.password, "verify").mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
  );
  try {
    const pending = post(app, "auth/login", {
      email: "host@example.test",
      password: oldPassword,
    });
    for (let i = 0; i < 100 && !release; i++) await Bun.sleep(1);
    expect(release).toBeDefined();
    db.query("UPDATE users SET password=? WHERE id='user'").run("rotated-hash");
    release(true);
    expect((await pending).status).toBe(401);
    expect(db.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 2 });
  } finally {
    verify.mockRestore();
    db.close();
  }
});

test("guest traffic cannot consume the authentication IP bucket", async () => {
  const { db, app } = await fixture();
  try {
    for (let n = 0; n < 101; n++)
      await app.request("/api/v1/guest", {}, { clientIP: "192.0.2.1" });
    expect(
      (
        await post(app, "auth/login", {
          email: "host@example.test",
          password: oldPassword,
        })
      ).status,
    ).toBe(200);
  } finally {
    db.close();
  }
});

test("concurrent guesses reserve the account budget before password verification completes", async () => {
  const { db, app } = await fixture();
  const releases: Array<(value: boolean) => void> = [];
  const verify = spyOn(Bun.password, "verify").mockImplementation(
    () => new Promise<boolean>((resolve) => releases.push(resolve)),
  );
  try {
    const requests = Array.from({ length: 6 }, (_, n) =>
      post(
        app,
        "auth/login",
        { email: "host@example.test", password: "wrong" },
        `192.0.2.${n}`,
      ),
    );
    for (let i = 0; i < 100 && releases.length < 2; i++) await Bun.sleep(1);
    expect(releases).toHaveLength(2);
    expect((await requests[5]!).status).toBe(429);
    // Two active workers and three queued workers account for all five guesses.
    for (let n = 0; n < 5; n++) {
      for (let i = 0; i < 100 && !releases[n]; i++) await Bun.sleep(1);
      releases[n]!(false);
    }
    expect((await Promise.all(requests)).map((r) => r.status)).toEqual([
      401, 401, 401, 401, 401, 429,
    ]);
  } finally {
    verify.mockRestore();
    db.close();
  }
});

test("a password change cannot commit after its session is revoked while hashing", async () => {
  const { db, app } = await fixture();
  let release!: (value: string) => void;
  const hash = spyOn(Bun.password, "hash").mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  try {
    const pending = post(
      app,
      "me/password",
      { currentPassword: oldPassword, newPassword },
      undefined,
      auth,
    );
    for (let i = 0; i < 200 && !release; i++) await Bun.sleep(1);
    expect(release).toBeDefined();
    db.query("DELETE FROM sessions").run();
    release("must-not-be-saved");
    expect((await pending).status).toBe(401);
    const saved = db
      .query("SELECT password FROM users WHERE id='user'")
      .get() as { password: string };
    expect(await Bun.password.verify(oldPassword, saved.password)).toBe(true);
  } finally {
    hash.mockRestore();
    db.close();
  }
});
