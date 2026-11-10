import { expect, test } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import type { MailMessage } from "../server/mail";
const origin = "http://localhost:3000";
const smtp = {
  host: "smtp.example.test",
  port: 587,
  security: "starttls",
  username: "test",
  password: "smtp-secret",
  from: "app@example.test",
  fromName: "guestin",
};
async function fixture() {
  const db = openDatabase(":memory:"),
    messages: MailMessage[] = [];
  let deliveryFails = false;
  const app = createApp(db, {
    origin,
    key: "a".repeat(64),
    setupToken: "setup",
    device: async () => {
      throw Error("No device calls allowed");
    },
    mail: async (_settings, message) => {
      if (deliveryFails) throw Error("secret SMTP failure");
      messages.push(message);
    },
  });
  const call = (
    path: string,
    body?: any,
    method = body ? "POST" : "GET",
    auth?: any,
  ) =>
    app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(auth ? { Cookie: auth.cookie, "x-csrf-token": auth.csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const response = await call("auth/setup", {
    name: "Owner",
    email: "owner@example.test",
    password: "original-password",
    setupToken: "setup",
  });
  const owner = {
    ...((await response.json()) as any),
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    "collab",
    "Colleague",
    "collab@example.test",
    await Bun.password.hash("original-password"),
    "collaborator",
  );
  const login = await call("auth/login", {
    email: "collab@example.test",
    password: "original-password",
  });
  const collab = {
    ...((await login.json()) as any),
    cookie: login.headers.get("set-cookie")!.split(";")[0],
  };
  return {
    db,
    app,
    call,
    owner,
    collab,
    messages,
    failDelivery: () => {
      deliveryFails = true;
    },
  };
}
const tokenFrom = (url: string) => url.split("/").at(-1)!;

test("owner recovery: private notification, pending account, single-use 10-minute link, session revocation", async () => {
  const f = await fixture();
  try {
    const known = await f.call("auth/password-reset-request", {
      email: "collab@example.test",
      method: "owner",
    });
    const unknown = await f.call("auth/password-reset-request", {
      email: "missing@example.test",
      method: "owner",
    });
    expect(await known.json()).toEqual(await unknown.json());
    const users = (await (
      await f.call("users", undefined, "GET", f.owner)
    ).json()) as any[];
    expect(
      users.find((u) => u.id === "collab").passwordResetRequestedAt,
    ).toBeNumber();
    const events = (await (
      await f.call("events", undefined, "GET", f.owner)
    ).json()) as any;
    expect(events.events).toHaveLength(1);
    expect(events.events[0].href).toBe("/host/#/settings/team");
    expect(
      (
        (await (
          await f.call("events", undefined, "GET", f.collab)
        ).json()) as any
      ).events,
    ).toHaveLength(0);
    expect(
      (
        (await (
          await f.call("events/unread", undefined, "GET", f.collab)
        ).json()) as any
      ).total,
    ).toBe(0);
    expect(
      (
        await f.call(
          "events/" + events.events[0].id,
          undefined,
          "GET",
          f.collab,
        )
      ).status,
    ).toBe(404);
    expect(
      (await f.call("users/collab/password-reset-link", {}, "POST", f.collab))
        .status,
    ).toBe(403);
    const start = Date.now();
    const link = (await (
      await f.call("users/collab/password-reset-link", {}, "POST", f.owner)
    ).json()) as any;
    expect(link.expires).toBeGreaterThanOrEqual(start + 600000);
    expect(link.expires).toBeLessThanOrEqual(Date.now() + 600000);
    const raw = tokenFrom(link.url);
    expect(f.db.query("SELECT digest FROM account_tokens").get()).toEqual({
      digest: digest(raw),
    });
    expect(
      (await f.call("auth/reset-password", { token: raw, password: "short" }))
        .status,
    ).toBe(400);
    expect(
      (
        await f.call("auth/reset-password", {
          token: raw,
          password: "replacement-password",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await f.call("auth/reset-password", {
          token: raw,
          password: "replacement-password-2",
        })
      ).status,
    ).toBe(400);
    expect((await f.call("me", undefined, "GET", f.collab)).status).toBe(401);
    expect(
      (
        await f.call("auth/login", {
          email: "collab@example.test",
          password: "replacement-password",
        })
      ).status,
    ).toBe(200);
    expect(
      f.db.query("SELECT 1 FROM password_reset_requests").get(),
    ).toBeNull();
  } finally {
    f.db.close();
  }
});

test("SMTP is encrypted and owner-only; verification gates email recovery and tokens have separate purposes", async () => {
  const f = await fixture();
  try {
    expect((await f.call("admin/smtp", smtp, "PUT", f.collab)).status).toBe(
      403,
    );
    expect((await f.call("admin/smtp", smtp, "PUT", f.owner)).status).toBe(200);
    const stored = f.db.query("SELECT secret FROM smtp_settings").get() as any;
    expect(stored.secret).not.toContain("smtp-secret");
    expect(
      (
        (await (
          await f.call("admin/smtp", undefined, "GET", f.owner)
        ).json()) as any
      ).password,
    ).toBe("");
    expect(
      ((await (await f.call("auth/status")).json()) as any).smtpConfigured,
    ).toBe(true);
    await f.call("auth/password-reset-request", {
      email: "collab@example.test",
      method: "email",
    });
    expect(f.messages).toHaveLength(0);
    expect((await f.call("me/verify-email", {}, "POST", f.collab)).status).toBe(
      200,
    );
    expect(f.messages).toHaveLength(1);
    const verification = tokenFrom(
      f.messages[0].text.match(/http:\/\/\S+/)![0],
    );
    expect(
      (
        await f.call("auth/reset-password", {
          token: verification,
          password: "new-password-123",
        })
      ).status,
    ).toBe(400);
    expect(
      (await f.call("auth/verify-email", { token: verification })).status,
    ).toBe(200);
    expect(
      (await f.call("auth/verify-email", { token: verification })).status,
    ).toBe(400);
    expect(
      ((await (await f.call("me", undefined, "GET", f.collab)).json()) as any)
        .user.emailVerified,
    ).toBe(true);
    f.db.query("DELETE FROM account_backoff WHERE identity != ''").run();
    await f.call("auth/password-reset-request", {
      email: "collab@example.test",
      method: "email",
    });
    expect(f.messages).toHaveLength(2);
    const reset = tokenFrom(f.messages[1].text.match(/http:\/\/\S+/)![0]);
    expect((await f.call("auth/verify-email", { token: reset })).status).toBe(
      400,
    );
    expect(
      (
        await f.call("auth/reset-password", {
          token: reset,
          password: "new-password-123",
        })
      ).status,
    ).toBe(200);
    await f.call("admin/smtp", { ...smtp, password: "" }, "PUT", f.owner);
    f.failDelivery();
    expect((await f.call("admin/smtp/test", {}, "POST", f.owner)).status).toBe(
      502,
    );
    await f.call("admin/smtp", undefined, "DELETE", f.owner);
    expect(
      ((await (await f.call("auth/status")).json()) as any).smtpConfigured,
    ).toBe(false);
  } finally {
    f.db.close();
  }
});

test("expired, superseded, and password-invalidated links are rejected", async () => {
  const f = await fixture();
  try {
    const issue = async () =>
      (
        (await (
          await f.call("users/collab/password-reset-link", {}, "POST", f.owner)
        ).json()) as any
      ).url;
    const old = tokenFrom(await issue()),
      current = tokenFrom(await issue());
    expect(
      (
        await f.call("auth/reset-password", {
          token: old,
          password: "replacement-password",
        })
      ).status,
    ).toBe(400);
    f.db.query("UPDATE account_tokens SET expires=?").run(Date.now() - 1);
    expect(
      (
        await f.call("auth/reset-password", {
          token: current,
          password: "replacement-password",
        })
      ).status,
    ).toBe(400);
    const rotated = tokenFrom(await issue());
    await f.call(
      "me/password",
      { currentPassword: "original-password", newPassword: "rotated-password" },
      "POST",
      f.collab,
    );
    expect(
      (
        await f.call("auth/reset-password", {
          token: rotated,
          password: "replacement-password",
        })
      ).status,
    ).toBe(400);
  } finally {
    f.db.close();
  }
});

test("concurrent reset submissions consume the token once and recovery requests are deduplicated", async () => {
  const f = await fixture();
  try {
    for (let n = 0; n < 3; n++)
      await f.call("auth/password-reset-request", {
        email: "collab@example.test",
        method: "owner",
      });
    expect(
      f.db
        .query(
          "SELECT COUNT(*) n FROM events WHERE type='account.reset_requested'",
        )
        .get(),
    ).toEqual({ n: 1 });
    const result = (await (
      await f.call("users/collab/password-reset-link", {}, "POST", f.owner)
    ).json()) as any;
    const responses = await Promise.all(
      ["first-password-123", "second-password-123"].map((password) =>
        f.call("auth/reset-password", {
          token: tokenFrom(result.url),
          password,
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  } finally {
    f.db.close();
  }
});

test("verification and reset emails have independent persistent cooldowns; failed delivery stays generic", async () => {
  const f = await fixture();
  try {
    await f.call("admin/smtp", smtp, "PUT", f.owner);
    await f.call("me/verify-email", {}, "POST", f.collab);
    expect((await f.call("me/verify-email", {}, "POST", f.collab)).status).toBe(
      429,
    );
    const verification = tokenFrom(
      f.messages[0]!.text.match(/http:\/\/\S+/)![0],
    );
    await f.call("auth/verify-email", { token: verification });
    const request = () =>
      f.call("auth/password-reset-request", {
        email: "collab@example.test",
        method: "email",
      });
    await request();
    await request();
    expect(f.messages).toHaveLength(2);
    f.db.query("UPDATE account_mail_attempts SET last_sent=0").run();
    f.failDelivery();
    const failed = await request();
    const unknown = await f.call("auth/password-reset-request", {
      email: "missing@example.test",
      method: "email",
    });
    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual(await unknown.json());
  } finally {
    f.db.close();
  }
});
