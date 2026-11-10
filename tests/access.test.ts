import { test, expect } from "bun:test";
import { openDatabase } from "../server/db";
import { createApp } from "../server/app";
import { localDate } from "../shared/schema";
import { vault } from "../server/security";
const origin = "http://localhost:3000",
  key = "a".repeat(64);
async function fixture(
  result: any = { status: "accepted", detail: "Accepted" },
) {
  const db = openDatabase(":memory:");
  let calls = 0;
  const app = createApp(db, {
    key,
    origin,
    setupToken: "setup",
    device: async () => {
      calls++;
      if (typeof result === "function") return result();
      return result;
    },
  });
  let cookie = "",
    csrf = "";
  async function req(
    path: string,
    body?: any,
    options: {
      method?: string;
      guest?: string;
      id?: string;
      auth?: boolean;
      origin?: string;
    } = {},
  ) {
    const r = await app.request("/api/v1/" + path, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: options.origin ?? origin,
        "Content-Type": "application/json",
        ...(options.auth === false
          ? {}
          : { Cookie: cookie, "X-CSRF-Token": csrf }),
        ...(options.guest ? { Authorization: "Bearer " + options.guest } : {}),
        ...(options.id ? { "Idempotency-Key": options.id } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await r.json()) as any;
    return { r, data };
  }
  const setup = await req("auth/setup", {
    setupToken: "setup",
    name: "Owner",
    email: "owner@example.com",
    password: "secure-password!",
  });
  expect(setup.r.status).toBe(200);
  cookie = setup.r.headers.get("set-cookie")!.split(";")[0];
  csrf = setup.data.csrf;
  const p = await req("properties", {
    name: "Athena",
    timezone: "Europe/Rome",
  });
  expect(p.r.status).toBe(201);
  const door = await req("doors", {
    propertyId: p.data.id,
    name: "Room",
    common: false,
    singleUse: true,
    integration: "ewelink",
    config: { webhook_code: "secret-device" },
  });
  expect(door.r.status).toBe(201);
  const today = localDate("Europe/Rome");
  const draft = {
    propertyId: p.data.id,
    label: "Guest",
    notes: "private",
    grants: [
      {
        doorId: door.data.id,
        start: new Date(Date.now() - 60000).toISOString(),
        end: new Date(Date.now() + 86400000).toISOString(),
        singleUse: true,
      },
    ],
    breakfast: { total: 2, start: today, end: today },
  };
  const code = await req("codes", draft);
  expect(code.r.status).toBe(201);
  const guest = new URL(code.data.link).hash.slice(6);
  return {
    db,
    app,
    req,
    draft,
    property: p.data,
    door: door.data,
    code: code.data,
    guest,
    calls: () => calls,
    setAuth: (c: string, s: string) => {
      cookie = c;
      csrf = s;
    },
  };
}
test("manual access needs no connection or booking tables", async () => {
  const f = await fixture();
  expect(
    f.db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%booking%'",
      )
      .all(),
  ).toEqual([]);
  expect((await f.req("guest", undefined, { guest: f.guest })).data.label).toBe(
    "Guest",
  );
  expect((await f.req("connections")).data).toEqual([]);
  f.db.close();
});
test("single use, duplicate idempotency, and breakfast independence", async () => {
  const f = await fixture(),
    id = crypto.randomUUID();
  const a = await f.req(
    `guest/doors/${f.door.id}/open`,
    {},
    { guest: f.guest, id },
  );
  expect(a.data.status).toBe("accepted");
  expect(
    (await f.req(`guest/doors/${f.door.id}/open`, {}, { guest: f.guest, id }))
      .data.status,
  ).toBe("accepted");
  expect(f.calls()).toBe(1);
  expect(
    (
      await f.req(
        `guest/doors/${f.door.id}/open`,
        {},
        { guest: f.guest, id: crypto.randomUUID() },
      )
    ).r.status,
  ).toBe(403);
  expect(
    (
      await f.req(
        "guest/breakfast",
        { quantity: 1 },
        { guest: f.guest, id: crypto.randomUUID() },
      )
    ).data.remaining,
  ).toBe(1);
  expect(
    (
      f.db
        .query("SELECT count(*) n FROM events WHERE type='access.denied'")
        .get() as any
    ).n,
  ).toBe(1);
  f.db.close();
});
test("concurrent breakfast requests cannot overspend", async () => {
  const f = await fixture();
  const responses = await Promise.all(
    [1, 2, 3].map(() =>
      f.req(
        "guest/breakfast",
        { quantity: 1 },
        { guest: f.guest, id: crypto.randomUUID() },
      ),
    ),
  );
  expect(responses.filter((x) => x.r.ok)).toHaveLength(2);
  expect(
    (f.db.query("SELECT SUM(quantity) n FROM redemptions").get() as any).n,
  ).toBe(2);
  f.db.close();
});
test("breakfast duplicate request and allocation floor", async () => {
  const f = await fixture(),
    id = crypto.randomUUID();
  await f.req("guest/breakfast", { quantity: 2 }, { guest: f.guest, id });
  expect(
    (await f.req("guest/breakfast", { quantity: 2 }, { guest: f.guest, id }))
      .data.remaining,
  ).toBe(0);
  expect(
    (
      await f.req(
        "codes/" + f.code.id,
        { ...f.draft, breakfast: { ...f.draft.breakfast, total: 1 } },
        { method: "PUT" },
      )
    ).r.status,
  ).toBe(400);
  expect(
    (await f.req("guest/breakfast", { quantity: 1 }, { guest: f.guest, id })).r
      .status,
  ).toBe(409);
  f.db.close();
});
test("uncertain unlock blocks retries until host resolution", async () => {
  const f = await fixture({ status: "uncertain", detail: "Timeout" });
  expect(
    (
      await f.req(
        `guest/doors/${f.door.id}/open`,
        {},
        { guest: f.guest, id: crypto.randomUUID() },
      )
    ).data.status,
  ).toBe("uncertain");
  expect(
    (
      await f.req(
        `guest/doors/${f.door.id}/open`,
        {},
        { guest: f.guest, id: crypto.randomUUID() },
      )
    ).r.status,
  ).toBe(403);
  expect(f.calls()).toBe(1);
  expect(
    (
      await f.req("codes/" + f.code.id + "/resolve", {
        doorId: f.door.id,
        consumed: true,
      })
    ).r.ok,
  ).toBe(true);
  expect(
    (await f.req("guest", undefined, { guest: f.guest })).data.doors[0].used,
  ).toBe(1);
  f.db.close();
});
test("concurrent unlocks claim single-use permission once", async () => {
  let finish!: (v: any) => void;
  const waiting = new Promise((r) => (finish = r));
  const f = await fixture(() => waiting);
  const first = f.req(
    `guest/doors/${f.door.id}/open`,
    {},
    { guest: f.guest, id: crypto.randomUUID() },
  );
  await new Promise((r) => setTimeout(r, 10));
  const second = await f.req(
    `guest/doors/${f.door.id}/open`,
    {},
    { guest: f.guest, id: crypto.randomUUID() },
  );
  expect(second.r.status).toBe(403);
  finish({ status: "accepted", detail: "Accepted" });
  await first;
  expect(f.calls()).toBe(1);
  f.db.close();
});
test("revocation and replacement invalidate links", async () => {
  const f = await fixture();
  await f.req("codes/" + f.code.id + "/regenerate", {});
  expect((await f.req("guest", undefined, { guest: f.guest })).r.status).toBe(
    403,
  );
  const updated = (await f.req("codes")).data[0];
  const guest = new URL(updated.link).hash.slice(6);
  await f.req("codes/" + f.code.id + "/revoke", {});
  expect((await f.req("guest", undefined, { guest })).r.status).toBe(403);
  f.db.close();
});
test("CSRF, origin, and unauthenticated writes are rejected", async () => {
  const f = await fixture();
  expect(
    (
      await f.req(
        "properties",
        { name: "X", timezone: "UTC" },
        { origin: "https://evil.example" },
      )
    ).r.status,
  ).toBe(403);
  expect(
    (await f.req("properties", { name: "X", timezone: "UTC" }, { auth: false }))
      .r.status,
  ).toBe(401);
  f.setAuth("", "");
  expect((await f.req("codes")).r.status).toBe(401);
  f.db.close();
});
test("authorized collaborators can manage codes but cannot manage credentials or properties", async () => {
  const f = await fixture();
  const invite = (await f.req("invites", {})).data.link.split("=")[1];
  const signup = await f.req("auth/accept-invite", {
    invite,
    name: "Collaborator",
    email: "staff@example.com",
    password: "another-password!",
  });
  await f.req(
    `users/${signup.data.user.id}`,
    { permissions: { createAccessCodes: true } },
    { method: "PATCH" },
  );
  f.setAuth(
    signup.r.headers.get("set-cookie")!.split(";")[0],
    signup.data.csrf,
  );
  expect(
    (await f.req("codes", { ...f.draft, label: "Collaborator draft" })).r
      .status,
  ).toBe(201);
  expect(
    (
      await f.req("connections", {
        propertyId: f.property.id,
        kind: "kross",
        name: "X",
        secret: {},
      })
    ).r.status,
  ).toBe(403);
  expect(
    (await f.req("properties", { name: "X", timezone: "UTC" })).r.status,
  ).toBe(403);
  f.db.close();
});
test("public endpoint exposes aggregate totals only", async () => {
  const f = await fixture();
  await f.req(
    "guest/breakfast",
    { quantity: 1 },
    { guest: f.guest, id: crypto.randomUUID() },
  );
  const r = await f.req("public/breakfast/" + f.property.id, undefined, {
    auth: false,
  });
  expect(r.data.today).toBe(1);
  expect(Object.keys(r.data).sort()).toEqual(
    [
      "property",
      "timezone",
      "today",
      "thisMonth",
      "lastMonth",
      "from",
      "to",
      "total",
    ].sort(),
  );
  expect(JSON.stringify(r.data)).not.toContain(f.guest);
  f.db.close();
});
test("breakfast totals count used quantities independently of assigned allowances", async () => {
  const f = await fixture();
  try {
    const today = f.draft.breakfast.start;
    const month = today.slice(0, 7) + "-01";
    const last = new Date(month + "T12:00:00Z");
    last.setUTCMonth(last.getUTCMonth() - 1);
    const lastDate = last.toISOString().slice(0, 10);
    await f.req("codes", {
      ...f.draft,
      label: "Unused allowance",
      breakfast: { total: 95, start: lastDate, end: today },
    });
    const read = async (query = "") =>
      (
        await f.req("public/breakfast/" + f.property.id + query, undefined, {
          auth: false,
        })
      ).data;
    const unused = await read();
    expect([
      unused.today,
      unused.thisMonth,
      unused.lastMonth,
      unused.total,
    ]).toEqual([0, 0, 0, 0]);
    const id = crypto.randomUUID();
    expect(
      (await f.req("guest/breakfast", { quantity: 1 }, { guest: f.guest, id }))
        .r.status,
    ).toBe(200);
    await f.req("guest/breakfast", { quantity: 1 }, { guest: f.guest, id });
    await f.req(
      "codes/" + f.code.id,
      { ...f.draft, breakfast: { total: 20, start: lastDate, end: today } },
      { method: "PUT" },
    );
    f.db
      .query("INSERT INTO redemptions VALUES(?,?,?,?,?)")
      .run(crypto.randomUUID(), f.code.id, 3, lastDate, last.toISOString());
    const otherProperty = (
      await f.req("properties", { name: "Other", timezone: "UTC" })
    ).data;
    const otherCode = (
      await f.req("codes", {
        propertyId: otherProperty.id,
        label: "Other guest",
        grants: [],
        breakfast: { total: 200, start: today, end: today },
      })
    ).data;
    f.db
      .query("INSERT INTO redemptions VALUES(?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        otherCode.id,
        7,
        today,
        new Date().toISOString(),
      );
    const used = await read();
    expect([used.today, used.thisMonth, used.lastMonth]).toEqual([1, 1, 3]);
    const custom = await read("?from=" + lastDate + "&to=" + today);
    expect(custom.total).toBe(4);
  } finally {
    f.db.close();
  }
});

test("door expiry and future access fail without calling provider", async () => {
  const f = await fixture();
  for (const offset of [-86400000, 86400000]) {
    await f.req(
      "codes/" + f.code.id,
      {
        ...f.draft,
        grants: [
          {
            ...f.draft.grants[0],
            start: new Date(Date.now() + offset - 60000).toISOString(),
            end: new Date(Date.now() + offset + 60000).toISOString(),
          },
        ],
      },
      { method: "PUT" },
    );
    expect(
      (
        await f.req(
          `guest/doors/${f.door.id}/open`,
          {},
          { guest: f.guest, id: crypto.randomUUID() },
        )
      ).r.status,
    ).toBe(403);
  }
  expect(f.calls()).toBe(0);
  f.db.close();
});
test("encrypted tokens and provider secrets never appear in plaintext database fields", async () => {
  const f = await fixture();
  const row = f.db.query("SELECT * FROM codes").get() as any;
  expect(row.secret).not.toContain(f.guest);
  expect(vault(key).open(row.secret)).toBe(f.guest);
  expect(JSON.stringify((await f.req("doors")).data)).not.toContain(
    "secret-device",
  );
  f.db.close();
});

test("example door can be saved unconnected, then connected without consuming its grant", async () => {
  const f = await fixture();
  try {
    const payload = {
      propertyId: f.property.id,
      name: "Example door",
      common: true,
      singleUse: true,
      integration: "none",
      config: {},
    };
    const create = await f.req("doors", payload);
    expect(create.r.status).toBe(201);
    const doorId = create.data.id;
    const code = await f.req("codes", {
      ...f.draft,
      label: "Example guest",
      grants: [{ ...f.draft.grants[0], doorId }],
    });
    expect(code.r.status).toBe(201);
    const guest = new URL(code.data.link).hash.slice(6);
    const list = (await f.req("doors")).data;
    expect(list.find((d: any) => d.id === doorId).configured).toBe(false);
    expect(
      (await f.req("guest", undefined, { guest })).data.doors[0].configured,
    ).toBe(false);
    const denied = await f.req(
      `guest/doors/${doorId}/open`,
      {},
      { guest, id: crypto.randomUUID() },
    );
    expect(denied.r.status).toBe(403);
    expect(denied.data.error).toContain("no device connector yet");
    expect(f.calls()).toBe(0);
    const grant = f.db
      .query("SELECT used,claim FROM grants WHERE code_id=?")
      .get(code.data.id) as any;
    expect(grant.used).toBe(0);
    expect(grant.claim).toBeNull();
    expect(
      (
        f.db
          .query("SELECT COUNT(*) n FROM actions WHERE code_id=?")
          .get(code.data.id) as any
      ).n,
    ).toBe(0);
    expect(
      (
        await f.req("doors", {
          ...payload,
          config: { api_key: "must-not-be-stored" },
        })
      ).r.status,
    ).toBe(400);
    const connected = await f.req(
      `doors/${doorId}`,
      {
        ...payload,
        integration: "ewelink",
        config: { webhook_code: "example-secret" },
      },
      { method: "PUT" },
    );
    expect(connected.r.status).toBe(200);
    expect(
      (await f.req("guest", undefined, { guest })).data.doors[0].configured,
    ).toBe(true);
    const accepted = await f.req(
      `guest/doors/${doorId}/open`,
      {},
      { guest, id: crypto.randomUUID() },
    );
    expect(accepted.data.status).toBe("accepted");
    expect(f.calls()).toBe(1);
    expect(JSON.stringify((await f.req("doors")).data)).not.toContain(
      "example-secret",
    );
    expect(
      JSON.stringify((await f.req("guest", undefined, { guest })).data),
    ).not.toContain("example-secret");
    expect(
      (await f.req(`doors/${doorId}`, payload, { method: "PUT" })).r.status,
    ).toBe(200);
    const row = f.db
      .query("SELECT secret FROM doors WHERE id=?")
      .get(doorId) as any;
    expect(vault(key).open(row.secret)).toEqual({});
  } finally {
    f.db.close();
  }
});

test("tour and appearance preferences persist per account across sessions", async () => {
  const f = await fixture();
  try {
    const me = (await f.req("me")).data.user;
    expect(me.email).toBe("owner@example.com");
    expect(me.preferences).toEqual({
      tour: "pending",
      language: null,
      theme: "system",
    });
    expect(
      (
        await f.req(
          "me/preferences",
          { tour: "completed", language: "it", theme: "dark" },
          { method: "PATCH" },
        )
      ).r.ok,
    ).toBe(true);
    const login = await f.req("auth/login", {
      email: me.email,
      password: "secure-password!",
    });
    expect(login.data.user.preferences).toEqual({
      tour: "completed",
      language: "it",
      theme: "dark",
    });
    const invite = (await f.req("invites", {})).data.link.split("=")[1];
    const staff = await f.req("auth/accept-invite", {
      invite,
      name: "Staff",
      email: "tour@example.com",
      password: "another-password!",
    });
    expect(staff.data.user.preferences.tour).toBe("pending");
    f.setAuth(
      staff.r.headers.get("set-cookie")!.split(";")[0],
      staff.data.csrf,
    );
    await f.req("me/preferences", { tour: "skipped" }, { method: "PATCH" });
    expect((await f.req("me")).data.user.preferences.tour).toBe("skipped");
    const stored = f.db
      .query("SELECT data FROM user_preferences WHERE user_id=?")
      .get(me.id) as any;
    expect(JSON.parse(stored.data).tour).toBe("completed");
    expect(
      (
        await f.req(
          "me/preferences",
          { theme: "arbitrary" },
          { method: "PATCH" },
        )
      ).r.status,
    ).toBe(400);
  } finally {
    f.db.close();
  }
});

test("disabled doors and paused permissions retain credentials and enforce access", async () => {
  const f = await fixture();
  try {
    const putDoor = (extra: any) =>
      f.req(
        `doors/${f.door.id}`,
        { ...f.door, config: {}, ...extra },
        { method: "PUT" },
      );
    expect((await putDoor({ enabled: false })).r.ok).toBe(true);
    const open = () =>
      f.req(
        `guest/doors/${f.door.id}/open`,
        {},
        { guest: f.guest, id: crypto.randomUUID() },
      );
    expect((await open()).data.error).toBe("Door disabled");
    expect(
      (await f.req("guest", undefined, { guest: f.guest })).data.doors[0]
        .enabled,
    ).toBe(false);
    expect((await putDoor({ enabled: true })).r.ok).toBe(true);
    expect(
      vault(key).open(
        (
          f.db
            .query("SELECT secret FROM doors WHERE id=?")
            .get(f.door.id) as any
        ).secret,
      ),
    ).toEqual({ webhook_code: "secret-device" });
    await f.req(
      `codes/${f.code.id}/grants/${f.door.id}`,
      { active: false },
      { method: "PATCH" },
    );
    expect((await open()).data.error).toBe("Door permission paused");
    expect((await f.req("codes")).data[0].grants[0].active).toBe(false);
    expect(f.calls()).toBe(0);
    await f.req(
      `codes/${f.code.id}/grants/${f.door.id}`,
      { active: true },
      { method: "PATCH" },
    );
    expect((await open()).data.status).toBe("accepted");
    expect(
      (await f.req(`doors/${f.door.id}`, undefined, { method: "DELETE" })).r
        .status,
    ).toBe(409);
    expect((await f.req("codes")).data[0].grants[0].used).toBe(1);
  } finally {
    f.db.close();
  }
});

test("door photos, translations and explicit order are durable and validated", async () => {
  const f = await fixture();
  try {
    const photo = {
      id: "front",
      alt: "Entrance",
      url: "data:image/png;base64,iVBORw0KGgo=",
    };
    const updated = {
      ...f.door,
      config: {},
      description: "Ground floor",
      descriptionTranslations: { it: "Piano terra" },
      photos: [photo],
      primaryPhotoId: "front",
    };
    expect(
      (await f.req(`doors/${f.door.id}`, updated, { method: "PUT" })).r.ok,
    ).toBe(true);
    const guest = (await f.req("guest", undefined, { guest: f.guest })).data
      .doors[0];
    expect(guest.photos).toEqual([photo]);
    expect(guest.descriptionTranslations.it).toBe("Piano terra");
    expect(
      (
        await f.req(
          `doors/${f.door.id}`,
          {
            ...updated,
            photos: [{ ...photo, url: "data:image/png;base64,PHNjcmlwdD4=" }],
          },
          { method: "PUT" },
        )
      ).r.status,
    ).toBe(400);
    const second = (
      await f.req("doors", {
        ...f.door,
        name: "Another",
        integration: "none",
        config: {},
      })
    ).data;
    expect(
      (
        await f.req(
          "doors/order",
          { propertyId: f.property.id, doorIds: [second.id, f.door.id] },
          { method: "PUT" },
        )
      ).r.ok,
    ).toBe(true);
    expect((await f.req("doors")).data.map((d: any) => d.id)).toEqual([
      second.id,
      f.door.id,
    ]);
    expect(
      (
        await f.req(
          "doors/order",
          { propertyId: f.property.id, doorIds: [second.id, second.id] },
          { method: "PUT" },
        )
      ).r.status,
    ).toBe(400);
    expect(
      (await f.req(`doors/${second.id}`, undefined, { method: "DELETE" })).r.ok,
    ).toBe(true);
  } finally {
    f.db.close();
  }
});

test("host tests need confirmation, are idempotent, and uncertain tests require resolution", async () => {
  const f = await fixture({ status: "uncertain", detail: "Timed out" });
  try {
    const path = `doors/${f.door.id}/test`,
      id = crypto.randomUUID();
    expect((await f.req(path, { confirm: false }, { id })).r.status).toBe(400);
    expect((await f.req(path, { confirm: true }, { id })).data.status).toBe(
      "uncertain",
    );
    expect((await f.req(path, { confirm: true }, { id })).data.id).toBe(id);
    expect(f.calls()).toBe(1);
    expect(
      (await f.req(path, { confirm: true }, { id: crypto.randomUUID() })).r
        .status,
    ).toBe(409);
    expect((await f.req("doors")).data[0].testAction.id).toBe(id);
    expect((await f.req("codes")).data[0].grants[0].used).toBe(0);
    expect(
      (
        await f.req(`doors/${f.door.id}/resolve-test`, {
          actionId: id,
          confirm: true,
        })
      ).r.ok,
    ).toBe(true);
    expect((await f.req("doors")).data[0].testAction).toBeNull();
    expect(
      (await f.req(path, { confirm: true }, { id: crypto.randomUUID() })).data
        .status,
    ).toBe("uncertain");
    expect(f.calls()).toBe(2);
    const tests = (await f.req("events")).data.filter(
      (e: any) => e.type === "device.test.uncertain",
    );
    expect(tests).toHaveLength(2);
  } finally {
    f.db.close();
  }
});

test("wipe requires owner, exact phrase and password; destroys records and sessions but retains schema", async () => {
  const f = await fixture();
  try {
    const wipe = {
      password: "secure-password!",
      confirmation: "WIPE ALL DATA",
    };
    expect(
      (await f.req("admin/wipe", { ...wipe, confirmation: "wipe" })).r.status,
    ).toBe(400);
    expect(
      (await f.req("admin/wipe", { ...wipe, password: "wrong" })).r.status,
    ).toBe(403);
    expect(
      (await f.req("admin/wipe", wipe, { origin: "http://evil.example" })).r
        .status,
    ).toBe(403);
    const invite = (await f.req("invites", {})).data.link.split("=")[1];
    const staff = await f.req("auth/accept-invite", {
      invite,
      name: "Staff",
      email: "wipe@example.com",
      password: "another-password!",
    });
    f.setAuth(
      staff.r.headers.get("set-cookie")!.split(";")[0],
      staff.data.csrf,
    );
    expect((await f.req("admin/wipe", wipe)).r.status).toBe(403);
    const login = await f.req("auth/login", {
      email: "owner@example.com",
      password: wipe.password,
    });
    f.setAuth(
      login.r.headers.get("set-cookie")!.split(";")[0],
      login.data.csrf,
    );
    await f.req("me/preferences", { tour: "completed" }, { method: "PATCH" });
    expect((await f.req("admin/wipe", wipe)).data.needsSetup).toBe(true);
    expect((await f.req("me")).r.status).toBe(401);
    expect((await f.req("auth/status")).data.needsSetup).toBe(true);
    for (const row of f.db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name!='migrations'",
      )
      .all() as any[])
      expect(
        (f.db.query(`SELECT COUNT(*) n FROM ${row.name}`).get() as any).n,
      ).toBe(0);
    expect(
      (f.db.query("SELECT MAX(version) n FROM migrations").get() as any).n,
    ).toBe(7);
    expect(
      (
        await f.req("auth/setup", {
          setupToken: "setup",
          name: "New owner",
          email: "new@example.com",
          password: "a-new-password!",
        })
      ).r.ok,
    ).toBe(true);
  } finally {
    f.db.close();
  }
});

test("wipe refuses in-flight device work and cannot leave orphan events", async () => {
  let finish!: (value: any) => void;
  const waiting = new Promise((r) => (finish = r));
  const f = await fixture(() => waiting);
  try {
    const request = f.req(
      `doors/${f.door.id}/test`,
      { confirm: true },
      { id: crypto.randomUUID() },
    );
    await new Promise((r) => setTimeout(r, 5));
    const result = await f.req("admin/wipe", {
      password: "secure-password!",
      confirmation: "WIPE ALL DATA",
    });
    expect(result.r.status).toBe(409);
    expect((await f.req("auth/status")).data.needsSetup).toBe(false);
    finish({ status: "accepted", detail: "Accepted by provider" });
    expect((await request).data.status).toBe("accepted");
    expect(
      (
        await f.req("admin/wipe", {
          password: "secure-password!",
          confirmation: "WIPE ALL DATA",
        })
      ).r.ok,
    ).toBe(true);
    expect((f.db.query("SELECT COUNT(*) n FROM events").get() as any).n).toBe(
      0,
    );
  } finally {
    f.db.close();
  }
});

test("ordinary edits preserve paused grants, disabled doors, and creator attribution", async () => {
  const f = await fixture();
  try {
    await f.req(
      `codes/${f.code.id}/grants/${f.door.id}`,
      { active: false },
      { method: "PATCH" },
    );
    await f.req(
      `codes/${f.code.id}`,
      { ...f.draft, label: "Edited guest" },
      { method: "PUT" },
    );
    const updated = (await f.req("codes")).data[0];
    expect(updated.grants[0].active).toBe(false);
    expect(updated.creatorName).toBe("Owner");
    await f.req(
      `doors/${f.door.id}`,
      { ...f.door, config: {}, enabled: false },
      { method: "PUT" },
    );
    const {
      enabled,
      photos,
      description,
      descriptionTranslations,
      primaryPhotoId,
      order,
      ...oldClientDoor
    } = f.door;
    await f.req(
      `doors/${f.door.id}`,
      { ...oldClientDoor, config: {}, name: "Renamed door" },
      { method: "PUT" },
    );
    expect((await f.req("doors")).data[0].enabled).toBe(false);
    await Promise.all([
      f.req("me/preferences", { tour: "completed" }, { method: "PATCH" }),
      f.req("me/preferences", { theme: "dark" }, { method: "PATCH" }),
    ]);
    expect((await f.req("me")).data.user.preferences).toEqual({
      tour: "completed",
      theme: "dark",
      language: null,
    });
  } finally {
    f.db.close();
  }
});

test("owner door tests cannot resolve a request that is still running or dispatch it twice", async () => {
  let finish!: (value: any) => void;
  const f = await fixture(() => new Promise((resolve) => (finish = resolve)));
  try {
    const id = crypto.randomUUID(),
      path = `doors/${f.door.id}/test`;
    const first = f.req(path, { confirm: true }, { id });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await f.req(path, { confirm: true }, { id })).data.status).toBe(
      "pending",
    );
    expect(
      (await f.req(path, { confirm: true }, { id: crypto.randomUUID() })).r
        .status,
    ).toBe(409);
    expect(
      (
        await f.req(`doors/${f.door.id}/resolve-test`, {
          actionId: id,
          confirm: true,
        })
      ).r.status,
    ).toBe(409);
    expect(f.calls()).toBe(1);
    finish({ status: "accepted", detail: "Accepted" });
    expect((await first).data.status).toBe("accepted");
    expect((await f.req("doors")).data[0].testAction).toBeNull();
  } finally {
    f.db.close();
  }
});

test("device onboarding progress resumes per user across sessions without altering other preferences", async () => {
  const f = await fixture();
  try {
    const saved = await f.req(
      "me/preferences",
      {
        tour: "pending",
        tourStep: "install",
        tourCodeId: f.code.id,
        language: "it",
        theme: "dark",
      },
      { method: "PATCH" },
    );
    expect(saved.r.status).toBe(200);
    const login = await f.req("auth/login", {
      email: "owner@example.com",
      password: "secure-password!",
    });
    expect(login.data.user.preferences).toMatchObject({
      tour: "pending",
      tourStep: "install",
      tourCodeId: f.code.id,
      language: "it",
      theme: "dark",
    });
    const invalid = await f.req(
      "me/preferences",
      { tourStep: "automatic-permission" },
      { method: "PATCH" },
    );
    expect(invalid.r.status).toBe(400);
    const advanced = await f.req(
      "me/preferences",
      { tourStep: "notifications" },
      { method: "PATCH" },
    );
    expect(advanced.data.preferences).toMatchObject({
      tourStep: "notifications",
      language: "it",
      theme: "dark",
    });
    const finished = await f.req(
      "me/preferences",
      { tour: "completed", tourStep: null, tourCodeId: null },
      { method: "PATCH" },
    );
    expect(finished.data.preferences).toMatchObject({
      tour: "completed",
      tourStep: null,
      tourCodeId: null,
    });
  } finally {
    f.db.close();
  }
});

test("invalid guest page loads notify with safe unverified prior-visit context, per-client deduplication and code titles", async () => {
  const f = await fixture();
  try {
    const ownerId = (f.db.query("SELECT id FROM users").get() as any).id;
    f.db.query("INSERT INTO subscriptions VALUES(?,?,?,?)").run(
      "invalid-option",
      ownerId,
      "{}",
      JSON.stringify({
        properties: [f.property.id],
        events: ["access.invalid"],
        language: "it",
      }),
    );
    const hint = encodeURIComponent(
      JSON.stringify({
        label: "Previous stay",
        date: "2026-10-01T12:00:00.000Z",
        token: "must-not-persist",
      }),
    );
    const load = (bearer: string, value = hint) =>
      f.app.request("/api/v1/guest", {
        headers: {
          Authorization: "Bearer " + bearer,
          "X-Oshost-Previous-Visit": value,
        },
      });
    expect((await load("wrong-link-one")).status).toBe(403);
    expect((await load("wrong-link-one")).status).toBe(403);
    expect((await load("wrong-link-two", "%bad")).status).toBe(403);
    const invalid = f.db
      .query("SELECT * FROM events WHERE type='access.invalid'")
      .all() as any[];
    expect(invalid).toHaveLength(1);
    expect(f.db.query("SELECT * FROM jobs").all()).toHaveLength(1);
    const context = JSON.parse(
      (
        f.db
          .query("SELECT data FROM event_context WHERE event_id=?")
          .get(invalid[0].id) as any
      ).data,
    );
    expect(context).toEqual({
      action: "page",
      previousVisit: {
        label: "Previous stay",
        date: "2026-10-01T12:00:00.000Z",
      },
    });
    expect(
      JSON.stringify(f.db.query("SELECT * FROM event_context").all()),
    ).not.toContain("must-not-persist");
    expect(JSON.stringify(invalid)).not.toContain("wrong-link");
    await f.req(`codes/${f.code.id}/revoke`, {});
    expect((await load(f.guest)).status).toBe(403);
    const history = (
      await f.req(`events?propertyId=${f.property.id}&pageSize=50`)
    ).data.events;
    const revoked = history.find(
      (event: any) =>
        event.type === "access.invalid" && event.code_id === f.code.id,
    );
    expect(revoked.context.codeLabel).toBe("Guest");
    expect(revoked.property_id).toBe(f.property.id);
    const created = history.find((event: any) => event.type === "code.created");
    expect(created.context.codeLabel).toBe("Guest");
    expect((await f.app.request("/api/v1/events")).status).toBe(401);
    expect(f.calls()).toBe(0);
  } finally {
    f.db.close();
  }
});

test("push event choices can explicitly select none or exclude invalid page attempts", async () => {
  const f = await fixture();
  try {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/explicit-filter-fixture",
      keys: { p256dh: "fixture", auth: "fixture" },
    };
    expect(
      (
        await f.req("push/subscriptions", {
          subscription,
          properties: [f.property.id],
          events: [],
          allEvents: false,
          language: "it",
        })
      ).r.status,
    ).toBe(200);
    await f.app.request("/api/v1/guest", {
      headers: { Authorization: "Bearer no-notifications" },
    });
    expect(f.db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    expect(
      f.db.query("SELECT * FROM events WHERE type='access.invalid'").all(),
    ).toHaveLength(1);
    await f.req("push/subscriptions", {
      subscription,
      properties: [f.property.id],
      events: ["access.accepted"],
      allEvents: false,
    });
    await f.app.request("/api/v1/guest", {
      headers: { Authorization: "Bearer excluded-invalid" },
    });
    expect(f.db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    await f.req("push/subscriptions", {
      subscription,
      properties: [f.property.id],
      events: ["access.invalid"],
      allEvents: false,
    });
    await f.app.request(
      "/api/v1/guest",
      {
        headers: { Authorization: "Bearer included-invalid" },
      },
      { clientIP: "192.0.2.2" },
    );
    expect(f.db.query("SELECT * FROM jobs").all()).toHaveLength(1);
  } finally {
    f.db.close();
  }
});
