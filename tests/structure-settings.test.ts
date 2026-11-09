import { expect, test } from "bun:test";
import { openDatabase } from "../server/db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import webpush from "web-push";
import { deliverPush } from "../server/push";
import { createApp } from "../server/app";
import { pruneNotifications, retentionCutoff } from "../server/notifications";
const origin = "http://localhost:3000";
type Session = { cookie: string; csrf: string; id: string };
async function fixture() {
  const db = openDatabase(":memory:");
  const app = createApp(db, {
    key: "e".repeat(64),
    origin,
    setupToken: "setup",
    device: async () => ({ status: "accepted", detail: "Fixture accepted" }),
  });
  const owner: Session = { cookie: "", csrf: "", id: "" };
  async function req(
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
    session: Session | null = owner,
    extra: Record<string, string> = {},
  ) {
    const r = await app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(session
          ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
          : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { r, data: (await r.json()) as any };
  }
  const setup = await req("auth/setup", {
    setupToken: "setup",
    name: "Owner",
    email: "owner@fixture.test",
    password: "fixture-password",
  });
  Object.assign(owner, {
    cookie: setup.r.headers.get("set-cookie")!.split(";")[0],
    csrf: setup.data.csrf,
    id: setup.data.user.id,
  });
  const p1 = (await req("properties", { name: "One", timezone: "UTC" })).data;
  const p2 = (await req("properties", { name: "Two", timezone: "UTC" })).data;
  const invite = (await req("invites", {})).data.link;
  const accepted = await req("auth/accept-invite", {
    invite: new URLSearchParams(new URL(invite).hash.slice(1)).get("invite"),
    name: "Staff",
    email: "staff@fixture.test",
    password: "fixture-password",
  });
  const staff: Session = {
    cookie: accepted.r.headers.get("set-cookie")!.split(";")[0],
    csrf: accepted.data.csrf,
    id: accepted.data.user.id,
  };
  return { db, app, req, owner, staff, p1, p2 };
}

test("shared per-structure history paginates without hiding older retained notifications", async () => {
  const { db, req, p1, p2, staff } = await fixture();
  try {
    const stamp = new Date().toISOString();
    for (let i = 0; i < 105; i++)
      db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
        crypto.randomUUID(),
        p1.id,
        null,
        "access.accepted",
        "Shared " + i,
        stamp,
      );
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      crypto.randomUUID(),
      p2.id,
      null,
      "access.accepted",
      "Other structure",
      stamp,
    );
    const first = await req(`events?propertyId=${p1.id}&pageSize=50`);
    expect(first.data.events).toHaveLength(50);
    const staffFirst = await req(
      `events?propertyId=${p1.id}&pageSize=50`,
      undefined,
      "GET",
      staff,
    );
    expect(staffFirst.data).toEqual(first.data);
    const second = await req(
      `events?propertyId=${p1.id}&pageSize=50&cursor=${first.data.nextCursor}`,
    );
    const third = await req(
      `events?propertyId=${p1.id}&pageSize=50&cursor=${second.data.nextCursor}`,
    );
    expect(third.data.events).toHaveLength(5);
    expect(third.data.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.data.events, ...second.data.events, ...third.data.events].map(
          (e) => e.id,
        ),
      ).size,
    ).toBe(105);
    expect(
      (await req(`events?propertyId=${p2.id}&pageSize=50`)).data.events,
    ).toHaveLength(1);
    expect((await req("events?pageSize=50&cursor=invalid")).r.status).toBe(400);
    expect((await req("events", undefined, "GET", null)).r.status).toBe(401);
  } finally {
    db.close();
  }
});

test("retention clamps calendar months, removes queued jobs and preserves scope boundaries", async () => {
  expect(retentionCutoff(3, new Date("2026-05-31T12:34:00Z"))).toBe(
    "2026-02-28T12:34:00.000Z",
  );
  const { db, req, p1, p2, staff, owner } = await fixture();
  try {
    expect((await req("properties")).data[0].notificationRetentionMonths).toBe(
      3,
    );
    expect(
      (
        await req(
          `properties/${p2.id}/notifications`,
          { retentionMonths: 6 },
          "PATCH",
          staff,
        )
      ).r.status,
    ).toBe(200);
    const now = new Date(),
      cutoff = retentionCutoff(3, now),
      before = new Date(Date.parse(cutoff) - 1).toISOString();
    const old = crypto.randomUUID(),
      boundary = crypto.randomUUID(),
      other = crypto.randomUUID();
    for (const [id, property, created] of [
      [old, p1.id, before],
      [boundary, p1.id, cutoff],
      [other, p2.id, before],
    ])
      db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
        id,
        property,
        null,
        "access.accepted",
        "Fixture",
        created,
      );
    db.query("INSERT INTO subscriptions VALUES(?,?,?,?)").run(
      "fixture-sub",
      owner.id,
      "{}",
      "{}",
    );
    db.query(
      "INSERT INTO jobs(event_id,subscription_id,next) VALUES(?,?,?)",
    ).run(old, "fixture-sub", 0);
    pruneNotifications(db, now);
    expect(db.query("SELECT 1 FROM events WHERE id=?").get(old)).toBeNull();
    expect(
      db.query("SELECT 1 FROM events WHERE id=?").get(boundary),
    ).not.toBeNull();
    expect(
      db.query("SELECT 1 FROM events WHERE id=?").get(other),
    ).not.toBeNull();
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    expect(
      (
        await req(
          `properties/${p1.id}/notifications`,
          { retentionMonths: 0 },
          "PATCH",
          staff,
        )
      ).r.status,
    ).toBe(400);
    expect(
      (
        await req(
          `properties/${p1.id}/notifications`,
          { retentionMonths: 121 },
          "PATCH",
          staff,
        )
      ).r.status,
    ).toBe(400);
  } finally {
    db.close();
  }
});

test("notification cleanup does not erase lifetime access statistics", async () => {
  const { db, req, p1 } = await fixture();
  try {
    const door = (
      await req("doors", {
        propertyId: p1.id,
        name: "Door",
        integration: "ewelink",
        config: { webhook_code: "fixture-only" },
      })
    ).data;
    const code = (
      await req("codes", {
        propertyId: p1.id,
        label: "Fixture guest",
        grants: [
          {
            doorId: door.id,
            start: new Date(Date.now() - 60000).toISOString(),
            end: new Date(Date.now() + 86400000).toISOString(),
            singleUse: false,
          },
        ],
      })
    ).data;
    const guest = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
      "code",
    )!;
    expect(
      (
        await req(`guest/doors/${door.id}/open`, {}, "POST", null, {
          Authorization: "Bearer " + guest,
          "Idempotency-Key": crypto.randomUUID(),
        })
      ).r.status,
    ).toBe(200);
    db.query("UPDATE events SET created=?").run("2000-01-01T00:00:00.000Z");
    pruneNotifications(db);
    expect(db.query("SELECT * FROM events").all()).toHaveLength(0);
    const stats = (await req("reports")).data.find(
      (r: any) => r.id === code.id,
    );
    expect(stats.attempts).toBe(1);
    expect(stats.accepted).toBe(1);
  } finally {
    db.close();
  }
});

test("breakfast password gates aggregates, uses scoped sessions and rotates securely", async () => {
  const { db, req, p1, p2, staff } = await fixture();
  try {
    const path = `public/breakfast/${p1.id}`;
    expect((await req(path, undefined, "GET", null)).r.status).toBe(200);
    expect(
      (
        await req(
          `properties/${p1.id}/breakfast-settings`,
          { enabled: true, password: "breakfast-password" },
          "PUT",
          staff,
        )
      ).r.status,
    ).toBe(403);
    expect(
      (
        await req(
          `properties/${p1.id}/breakfast-settings`,
          { enabled: true, password: "short" },
          "PUT",
        )
      ).r.status,
    ).toBe(400);
    expect(
      (
        await req(
          `properties/${p1.id}/breakfast-settings`,
          { enabled: true, password: "breakfast-password" },
          "PUT",
        )
      ).r.status,
    ).toBe(200);
    const hash = (
      db
        .query(
          "SELECT breakfast_password FROM property_settings WHERE property_id=?",
        )
        .get(p1.id) as any
    ).breakfast_password;
    expect(hash).not.toBe("breakfast-password");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    const properties = (await req("properties")).data;
    expect(properties.find((p: any) => p.id === p1.id).breakfastProtected).toBe(
      true,
    );
    expect(JSON.stringify(properties)).not.toContain(hash);
    const blocked = await req(path, undefined, "GET", null);
    expect(blocked.r.status).toBe(401);
    expect(blocked.data.today).toBeUndefined();
    expect((await req(path, undefined, "GET", staff)).r.status).toBe(200);
    expect(
      (await req(path + "/auth", { password: "incorrect" }, "POST", null)).r
        .status,
    ).toBe(401);
    const login = await req(
      path + "/auth",
      { password: "breakfast-password" },
      "POST",
      null,
    );
    expect(login.r.status).toBe(200);
    expect(login.r.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = login.r.headers.get("set-cookie")!.split(";")[0];
    const totals = await req(path, undefined, "GET", null, { Cookie: cookie });
    expect(totals.r.status).toBe(200);
    expect(Object.keys(totals.data).sort()).toEqual([
      "from",
      "lastMonth",
      "property",
      "thisMonth",
      "timezone",
      "to",
      "today",
      "total",
    ]);
    await req(
      `properties/${p2.id}/breakfast-settings`,
      { enabled: true, password: "another-password" },
      "PUT",
    );
    expect(
      (
        await req(`public/breakfast/${p2.id}`, undefined, "GET", null, {
          Cookie: cookie,
        })
      ).r.status,
    ).toBe(401);
    await req(
      `properties/${p1.id}/breakfast-settings`,
      { enabled: true, password: "replacement-password" },
      "PUT",
    );
    expect(
      (await req(path, undefined, "GET", null, { Cookie: cookie })).r.status,
    ).toBe(401);
    await req(
      `properties/${p1.id}/breakfast-settings`,
      { enabled: false },
      "PUT",
    );
    expect((await req(path, undefined, "GET", null)).r.status).toBe(200);
  } finally {
    db.close();
  }
});

test("push filters belong to individual devices and disabling one leaves other devices intact", async () => {
  const { db, req, p1, p2, staff } = await fixture();
  try {
    const a = "https://fcm.googleapis.com/fcm/send/device-a",
      b = "https://fcm.googleapis.com/fcm/send/device-b";
    for (const [endpoint, propertyId] of [
      [a, p1.id],
      [b, p2.id],
    ])
      expect(
        (
          await req("push/subscriptions", {
            subscription: {
              endpoint,
              keys: { auth: "fixture-auth", p256dh: "fixture-key" },
            },
            properties: [propertyId],
            events: ["access.accepted"],
          })
        ).r.status,
      ).toBe(200);
    const filters = (await req("push/subscriptions")).data;
    expect(filters).toHaveLength(2);
    expect(JSON.stringify(filters)).not.toContain("fixture-auth");
    await req("push/subscriptions", { endpoint: a }, "DELETE");
    expect((await req("push/subscriptions")).data).toHaveLength(1);
    await req("push/subscriptions", { endpoint: b }, "DELETE", staff);
    expect((await req("push/subscriptions")).data).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("v2 migration backfills statistics before retention can delete old events", async () => {
  const { db, req, p1 } = await fixture();
  const directory = mkdtempSync(join(tmpdir(), "oshost-migration-")),
    path = join(directory, "upgrade.sqlite");
  try {
    const code = (
      await req("codes", {
        propertyId: p1.id,
        label: "Existing code",
        grants: [],
      })
    ).data;
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      crypto.randomUUID(),
      p1.id,
      code.id,
      "access.accepted",
      "Older accepted request",
      "2000-01-01T00:00:00.000Z",
    );
    db.exec(
      "DROP TABLE event_context; DROP TABLE breakfast_sessions; DROP TABLE property_settings; DROP TABLE code_metrics; DROP INDEX events_property_created; DELETE FROM migrations WHERE version>=3;",
    );
    db.query("VACUUM INTO ?").run(path);
    const upgraded = openDatabase(path);
    try {
      expect(
        (
          upgraded
            .query("SELECT MAX(version) version FROM migrations")
            .get() as any
        ).version,
      ).toBe(4);
      pruneNotifications(upgraded);
      expect(
        upgraded
          .query("SELECT * FROM events WHERE type='access.accepted'")
          .all(),
      ).toHaveLength(0);
      const metrics = upgraded
        .query("SELECT attempts,accepted FROM code_metrics WHERE code_id=?")
        .get(code.id) as any;
      expect(metrics).toEqual({ attempts: 1, accepted: 1 });
    } finally {
      upgraded.close();
    }
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("queued push delivery respects updated device filters without changing shared history", async () => {
  const { db, req, p1, p2 } = await fixture();
  const previous = {
    public: process.env.VAPID_PUBLIC_KEY,
    private: process.env.VAPID_PRIVATE_KEY,
  };
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  try {
    const endpoint = "https://fcm.googleapis.com/fcm/send/filtered-device";
    const subscription = {
      endpoint,
      keys: { auth: "fixture", p256dh: "fixture" },
    };
    await req("push/subscriptions", {
      subscription,
      properties: [p1.id],
      events: ["access.accepted"],
    });
    const door = (
      await req("doors", {
        propertyId: p1.id,
        name: "Fixture door",
        integration: "ewelink",
        config: { webhook_code: "fixture" },
      })
    ).data;
    const code = (
      await req("codes", {
        propertyId: p1.id,
        label: "Fixture",
        grants: [
          {
            doorId: door.id,
            start: new Date(Date.now() - 1000).toISOString(),
            end: new Date(Date.now() + 86400000).toISOString(),
            singleUse: false,
          },
        ],
      })
    ).data;
    const guest = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
      "code",
    )!;
    await req(`guest/doors/${door.id}/open`, {}, "POST", null, {
      Authorization: "Bearer " + guest,
      "Idempotency-Key": crypto.randomUUID(),
    });
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(1);
    await req("push/subscriptions", {
      subscription,
      properties: [p2.id],
      events: ["access.accepted"],
    });
    let sent = 0;
    await deliverPush(db, (async () => {
      sent++;
      return {} as any;
    }) as any);
    expect(sent).toBe(0);
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    expect(
      db.query("SELECT * FROM events WHERE type='access.accepted'").all(),
    ).toHaveLength(1);
  } finally {
    if (previous.public) process.env.VAPID_PUBLIC_KEY = previous.public;
    else delete process.env.VAPID_PUBLIC_KEY;
    if (previous.private) process.env.VAPID_PRIVATE_KEY = previous.private;
    else delete process.env.VAPID_PRIVATE_KEY;
    db.close();
  }
});

test("breakfast sessions expire and password guessing is rate limited", async () => {
  const { db, req, p1 } = await fixture();
  try {
    await req(
      `properties/${p1.id}/breakfast-settings`,
      { enabled: true, password: "breakfast-password" },
      "PUT",
    );
    const path = `public/breakfast/${p1.id}`;
    const login = await req(
      path + "/auth",
      { password: "breakfast-password" },
      "POST",
      null,
    );
    const cookie = login.r.headers.get("set-cookie")!.split(";")[0];
    db.query("UPDATE breakfast_sessions SET expires=0").run();
    expect(
      (await req(path, undefined, "GET", null, { Cookie: cookie })).r.status,
    ).toBe(401);
    pruneNotifications(db);
    expect(db.query("SELECT * FROM breakfast_sessions").all()).toHaveLength(0);
    for (let i = 0; i < 9; i++)
      expect(
        (await req(path + "/auth", { password: "incorrect" }, "POST", null)).r
          .status,
      ).toBe(401);
    expect(
      (await req(path + "/auth", { password: "incorrect" }, "POST", null)).r
        .status,
    ).toBe(429);
  } finally {
    db.close();
  }
});
