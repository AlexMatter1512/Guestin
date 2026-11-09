import { test, expect, afterEach } from "bun:test";
import { openDevice } from "../server/devices";
import { openDatabase } from "../server/db";
import { createApp } from "../server/app";
import { vault } from "../server/security";
import { deliverPush } from "../server/push";
import webpush from "web-push";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
test("device adapters require explicit acceptance and never retry transport errors", async () => {
  for (const [body, status] of [
    [{}, "uncertain"],
    [{ error: 0 }, "accepted"],
    [{ error: 100 }, "failed"],
  ] as const) {
    globalThis.fetch = (async () => Response.json(body)) as any;
    expect((await openDevice("ewelink", { webhook_code: "fake" })).status).toBe(
      status,
    );
  }
  let n = 0;
  globalThis.fetch = (async () => {
    n++;
    throw Error("timeout");
  }) as any;
  expect((await openDevice("ewelink", { webhook_code: "fake" })).status).toBe(
    "uncertain",
  );
  expect(n).toBe(1);
  globalThis.fetch = (async () => Response.json({ isok: true })) as any;
  expect(
    (
      await openDevice("shelly", {
        host: "shelly-196-eu.shelly.cloud",
        device_id: "fake",
        api_key: "fake",
      })
    ).status,
  ).toBe("accepted");
  expect((await openDevice("shelly", { host: "127.0.0.1" })).status).toBe(
    "failed",
  );
});
test("Kross relay persists tokens without exposing them and retains them on transient errors", async () => {
  const db = openDatabase(":memory:"),
    key = "c".repeat(64),
    crypto = vault(key),
    origin = "http://localhost:3000";
  const app = createApp(db, { key, origin, setupToken: "setup" });
  let cookie = "",
    csrf = "";
  const req = async (path: string, body?: any) => {
    const r = await app.request("/api/v1/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { r, data: (await r.json()) as any };
  };
  const setup = await req("auth/setup", {
    setupToken: "setup",
    name: "Owner",
    email: "owner@example.com",
    password: "strong-password",
  });
  cookie = setup.r.headers.get("set-cookie")!.split(";")[0];
  csrf = setup.data.csrf;
  const property = (await req("properties", { name: "Test", timezone: "UTC" }))
    .data;
  const connection = (
    await req("connections", {
      name: "Kross",
      propertyId: property.id,
      kind: "kross",
      secret: {},
    })
  ).data;
  globalThis.fetch = (async () =>
    Response.json({ "2fa": true, devices: [{ "2fa_type": "email" }] })) as any;
  expect(
    (
      await req(`connections/${connection.id}/request`, {
        path: "/auth/get-token",
        body: { password: "not-persisted" },
      })
    ).data["2fa"],
  ).toBe(true);
  globalThis.fetch = (async () =>
    Response.json({
      auth_token: "provider-secret",
      auth_token_expire: "tomorrow",
    })) as any;
  const login = await req(`connections/${connection.id}/request`, {
    path: "/auth/get-token",
    body: { password: "not-persisted" },
  });
  expect(login.data.authenticated).toBe(true);
  expect(JSON.stringify(login.data)).not.toContain("provider-secret");
  const stored = db
    .query("SELECT secret FROM connections WHERE id=?")
    .get(connection.id) as any;
  expect(stored.secret).not.toContain("provider-secret");
  expect(crypto.open(stored.secret).token).toBe("provider-secret");
  const listed = await req("connections");
  expect(JSON.stringify(listed.data)).not.toContain("provider-secret");
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer provider-secret",
    );
    return Response.json({
      data: [{ id: 1, auth_token: "provider-secret" }],
      auth_token: "provider-secret",
    });
  }) as any;
  const echoed = await req(`connections/${connection.id}/request`, {
    path: "/properties/get-list",
    body: {},
  });
  expect(JSON.stringify(echoed.data)).not.toContain("provider-secret");

  for (const status of [403, 503]) {
    globalThis.fetch = (async () =>
      Response.json({ error: "fail" }, { status })) as any;
    await req(`connections/${connection.id}/request`, {
      path: "/properties/get-list",
      body: {},
    });
    expect(
      crypto.open(
        (db.query("SELECT secret FROM connections").get() as any).secret,
      ).token,
    ).toBe("provider-secret");
  }
  // A failed OTP is a verification rejection, not proof that a saved token expired.
  globalThis.fetch = (async () =>
    Response.json(
      { error_code: 5, error_message: "Authentication failed" },
      { status: 401 },
    )) as any;
  const otp = await req(`connections/${connection.id}/request`, {
    path: "/auth/get-token",
    body: {
      "2fa_type": "email",
      "2fa_code": "001234",
      password: "not-persisted",
    },
  });
  expect(otp.r.status).toBe(401);
  expect(otp.data.code).toBe("KROSS_OTP_REJECTED");
  expect(otp.data.providerCode).toBe(5);
  expect(
    crypto.open(
      (db.query("SELECT secret FROM connections").get() as any).secret,
    ).token,
  ).toBe("provider-secret");
  // The real provider can reject a client with plain text, not JSON.
  globalThis.fetch = (async () =>
    new Response("UNF ERR check your client", { status: 403 })) as any;
  const forbidden = await req(`connections/${connection.id}/request`, {
    path: "/properties/get-list",
    body: {},
  });
  expect(forbidden.r.status).toBe(502);
  expect(forbidden.data.providerStatus).toBe(403);
  expect(forbidden.data.error).toContain("saved login has been kept");
  globalThis.fetch = (async () => {
    throw Error("network timeout");
  }) as any;
  const network = await req(`connections/${connection.id}/request`, {
    path: "/properties/get-list",
    body: {},
  });
  expect(network.data.code).toBe("KROSS_NETWORK");
  expect(
    crypto.open(
      (db.query("SELECT secret FROM connections").get() as any).secret,
    ).token,
  ).toBe("provider-secret");
  globalThis.fetch = (async () =>
    Response.json({
      error_code: 1,
      error_message: "not-persisted",
      password: "not-persisted",
    })) as any;
  const rejected = await req(`connections/${connection.id}/request`, {
    path: "/auth/get-token",
    body: {},
  });
  expect(rejected.r.status).toBe(422);
  expect(JSON.stringify(rejected.data)).not.toContain("not-persisted");
  expect((await req("connections")).data[0].data.authenticated).toBe(true);
  expect(
    (
      await req("connections", {
        name: "Bad",
        propertyId: property.id,
        kind: "kross",
        secret: {},
        data: { password: "forbidden" },
      })
    ).r.status,
  ).toBe(400);
  // An old read returning 401 after a new login must not erase the new token.
  let rejectOld!: (r: Response) => void;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => (rejectOld = resolve))) as any;
  const oldRead = req(`connections/${connection.id}/request`, {
    path: "/properties/get-list",
    body: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  globalThis.fetch = (async (_url: any, init: any) => {
    expect(init.headers.Accept).toBe("application/json");
    return Response.json({
      auth_token: "new-provider-secret",
      auth_token_expire: "2030-01-01",
      password: "not-persisted",
    });
  }) as any;
  const reauth = await req(`connections/${connection.id}/request`, {
    path: "/auth/get-token",
    body: { hotel_id: "athena", device_id: "stable-device" },
  });
  expect(reauth.data.authenticated).toBe(true);
  expect(JSON.stringify(reauth.data)).not.toContain("not-persisted");
  rejectOld(Response.json({ error: "expired" }, { status: 401 }));
  expect((await oldRead).r.status).toBe(401);
  expect(
    crypto.open(
      (db.query("SELECT secret FROM connections").get() as any).secret,
    ).token,
  ).toBe("new-provider-secret");
  const saved = (await req("connections")).data[0];
  expect(saved.data).toEqual({
    hotelId: "athena",
    deviceId: "stable-device",
    expiry: "2030-01-01",
    authenticated: true,
  });
  expect(
    (
      await req(`connections/${connection.id}/request`, {
        path: "/app/cancel-reservation",
        body: {},
      })
    ).r.status,
  ).toBe(400);
  expect(JSON.stringify((await req("connections")).data)).not.toContain(
    "provider-secret",
  );
  globalThis.fetch = (async () =>
    Response.json({ error: "unauthorized" }, { status: 401 })) as any;
  expect(
    (
      await req(`connections/${connection.id}/request`, {
        path: "/properties/get-list",
        body: {},
      })
    ).r.status,
  ).toBe(401);
  expect(
    crypto.open(
      (db.query("SELECT secret FROM connections").get() as any).secret,
    ).token,
  ).toBeNull();
  expect((db.query("SELECT COUNT(*) n FROM codes").get() as any).n).toBe(0);
  let finish!: (response: Response) => void;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => (finish = resolve))) as any;
  const inFlight = req(`connections/${connection.id}/request`, {
    path: "/auth/get-token",
    body: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const wipe = { password: "strong-password", confirmation: "WIPE ALL DATA" };
  expect((await req("admin/wipe", wipe)).r.status).toBe(409);
  finish(Response.json({ auth_token: "late-token" }));
  expect((await inFlight).data.authenticated).toBe(true);
  expect((await req("admin/wipe", wipe)).r.ok).toBe(true);
  expect(db.query("SELECT * FROM connections").all()).toHaveLength(0);
  db.close();
});
test("calendar validation gives actionable errors without returning URLs or credentials", async () => {
  const db = openDatabase(":memory:"),
    origin = "http://localhost:3000",
    app = createApp(db, { key: "e".repeat(64), origin, setupToken: "setup" });
  const setup = await app.request("/api/v1/auth/setup", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      setupToken: "setup",
      name: "Owner",
      email: "calendar@example.com",
      password: "strong-password",
    }),
  });
  const identity = (await setup.json()) as any;
  const headers = {
    Origin: origin,
    Cookie: setup.headers.get("set-cookie")!.split(";")[0],
    "X-CSRF-Token": identity.csrf,
    "Content-Type": "application/json",
  };
  const property = (await (
    await app.request("/api/v1/properties", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Calendar", timezone: "UTC" }),
    })
  ).json()) as any;
  for (const [url, message] of [
    ["not a URL", "valid public HTTPS"],
    ["http://example.com/private-token", "must use HTTPS"],
    ["https://secret-password@example.com/calendar", "embedded credentials"],
    ["https://127.0.0.1/private-calendar", "Private and reserved"],
  ]) {
    const result = await app.request("/api/v1/connections", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Calendar",
        kind: "ical",
        propertyId: property.id,
        secret: { url },
      }),
    });
    const body = (await result.json()) as any;
    expect(result.status).toBe(400);
    expect(body.error).toContain(message);
    expect(JSON.stringify(body)).not.toContain("secret-password");
    expect(JSON.stringify(body)).not.toContain("private-token");
    expect(JSON.stringify(body)).not.toContain("private-calendar");
  }
  expect(db.query("SELECT * FROM connections").all()).toHaveLength(0);
  db.close();
});
test("push jobs retry with bounds and remove expired subscriptions", async () => {
  const db = openDatabase(":memory:");
  const keys = webpush.generateVAPIDKeys();
  const previous = {
    public: process.env.VAPID_PUBLIC_KEY,
    private: process.env.VAPID_PRIVATE_KEY,
  };
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  try {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      "u",
      "Host",
      "host@example.com",
      "hash",
      "owner",
    );
    db.query("INSERT INTO subscriptions VALUES(?,?,?,?)").run(
      "s",
      "u",
      "{}",
      "{}",
    );
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      "e",
      null,
      null,
      "access.accepted",
      "Accepted",
      new Date().toISOString(),
    );
    db.query(
      "INSERT INTO jobs(event_id,subscription_id,next) VALUES(?,?,?)",
    ).run("e", "s", 0);
    const failing = (async () => {
      throw { statusCode: 503 };
    }) as any;
    await deliverPush(db, failing);
    expect((db.query("SELECT attempts FROM jobs").get() as any).attempts).toBe(
      1,
    );
    db.query("UPDATE jobs SET next=0,attempts=4").run();
    await deliverPush(db, failing);
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    db.query(
      "INSERT INTO jobs(event_id,subscription_id,next) VALUES(?,?,?)",
    ).run("e", "s", 0);
    await deliverPush(db, (async () => {
      throw { statusCode: 410 };
    }) as any);
    expect(db.query("SELECT * FROM subscriptions").all()).toHaveLength(0);
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
  } finally {
    if (previous.public) process.env.VAPID_PUBLIC_KEY = previous.public;
    else delete process.env.VAPID_PUBLIC_KEY;
    if (previous.private) process.env.VAPID_PRIVATE_KEY = previous.private;
    else delete process.env.VAPID_PRIVATE_KEY;
    db.close();
  }
});
