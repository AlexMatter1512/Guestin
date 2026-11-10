import { test, expect } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { notificationText } from "../shared/notifications";

async function fixture() {
  const db = openDatabase(":memory:");
  let calls = 0;
  for (const role of ["owner", "collaborator"]) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      role,
      role === "owner" ? "Alice" : "Bob",
      role + "@example.test",
      "unused",
      role,
    );
    db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest(role),
      role,
      "csrf",
      Date.now() + 600000,
    );
  }
  const origin = "http://localhost:3000";
  const app = createApp(db, {
    origin,
    key: "a".repeat(64),
    setupToken: "unused",
    device: async () => {
      calls++;
      return { status: "accepted", detail: "Fixture accepted" };
    },
  });
  async function req(
    path: string,
    body?: any,
    options: {
      role?: string;
      method?: string;
      token?: string;
      id?: string;
      extra?: Record<string, string>;
    } = {},
  ) {
    const r = await app.request("/api/v1/" + path, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: `oshost_session=${options.role ?? "owner"}`,
        "X-CSRF-Token": "csrf",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.id ? { "Idempotency-Key": options.id } : {}),
        ...options.extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { r, data: (await r.json()) as any };
  }
  const property = (await req("properties", { name: "House", timezone: "UTC" }))
    .data;
  const config = {
    url: "https://example.test/unlock?id=fixture-secret",
    method: "POST",
    headers: '{"Authorization":"Bearer fixture-secret"}',
    body: '{"relay":1}',
    response_mode: "http",
  };
  const door = (
    await req("doors", {
      propertyId: property.id,
      name: "Entrance",
      integration: "webhook",
      config,
    })
  ).data;
  const code = (
    await req("codes", {
      propertyId: property.id,
      label: "Guest",
      grants: [
        {
          doorId: door.id,
          singleUse: false,
          start: new Date(Date.now() - 60000).toISOString(),
          end: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    })
  ).data;
  const token = new URL(code.link).hash.slice(6);
  const open = (
    role: string,
    extra?: Record<string, string>,
    id = crypto.randomUUID(),
  ) => req(`guest/doors/${door.id}/open`, {}, { role, token, id, extra });
  const events = async () => (await req("events")).data.events;
  return {
    db,
    req,
    property,
    config,
    door,
    code,
    token,
    open,
    events,
    calls: () => calls,
  };
}

test("owners can test a disabled door without enabling guest access or consuming grants", async () => {
  const f = await fixture();
  try {
    expect(
      (
        await f.req(
          `doors/${f.door.id}`,
          { enabled: false, config: {} },
          { method: "PUT" },
        )
      ).r.status,
    ).toBe(200);
    const path = `doors/${f.door.id}/test`,
      id = crypto.randomUUID();
    expect(
      (await f.req(path, { confirm: true }, { id, role: "collaborator" })).r
        .status,
    ).toBe(403);
    expect((await f.req(path, { confirm: true }, { id })).data.status).toBe(
      "accepted",
    );
    expect((await f.req(path, { confirm: true }, { id })).data.status).toBe(
      "accepted",
    );
    expect(f.calls()).toBe(1);
    expect((await f.open("owner")).data.error).toBe("Door disabled");
    expect((await f.open("collaborator")).data.error).toBe("Door disabled");
    expect(f.calls()).toBe(1);
    expect((await f.req("doors")).data[0].enabled).toBe(false);
    expect(
      (
        f.db
          .query("SELECT used FROM grants WHERE code_id=?")
          .get(f.code.id) as any
      ).used,
    ).toBe(0);
    const testEvent = (await f.events()).find(
      (e: any) => e.type === "device.test.accepted",
    );
    expect(testEvent.context.actor).toBe("Alice");
  } finally {
    f.db.close();
  }
});

test("saved device configuration is readable only by owners, uncached and absent from general and guest reads", async () => {
  const f = await fixture();
  try {
    const path = `doors/${f.door.id}/config`;
    const read = await f.req(path);
    expect(read.r.status).toBe(200);
    expect(read.r.headers.get("cache-control")).toBe("no-store");
    expect(read.data.config).toEqual(f.config);
    expect(
      (await f.req(path, undefined, { role: "collaborator" })).r.status,
    ).toBe(403);
    expect((await f.req(path, undefined, { role: "invalid" })).r.status).toBe(
      401,
    );
    expect((await f.req(`doors/${crypto.randomUUID()}/config`)).r.status).toBe(
      404,
    );
    expect(JSON.stringify((await f.req("doors")).data)).not.toContain(
      "fixture-secret",
    );
    expect(
      JSON.stringify(
        (await f.req("guest", undefined, { token: f.token })).data,
      ),
    ).not.toContain("fixture-secret");
    await f.req(
      `doors/${f.door.id}`,
      { name: "Renamed", config: {} },
      { method: "PUT" },
    );
    expect((await f.req(path)).data.config).toEqual(f.config);
    await f.req(
      `properties/${f.property.id}/status`,
      { active: false },
      { method: "PATCH" },
    );
    expect((await f.req(path)).r.status).toBe(403);
    expect(f.calls()).toBe(0);
  } finally {
    f.db.close();
  }
});

test("door updates notify with actor, door destination and push job, without exposing credentials", async () => {
  const f = await fixture();
  try {
    f.db
      .query("INSERT INTO subscriptions VALUES(?,?,?,?)")
      .run("subscription", "owner", "{}", "{}");
    const path = `doors/${f.door.id}`;
    expect(
      (
        await f.req(
          path,
          { name: "Updated entrance", config: {} },
          { method: "PUT" },
        )
      ).r.status,
    ).toBe(200);
    const events = (await f.events()).filter(
      (e: any) => e.type === "door.updated",
    );
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.context).toMatchObject({
      actor: "Alice",
      doorId: f.door.id,
      doorName: "Updated entrance",
    });
    expect(event.icon).toBe("door");
    expect(event.href).toBe(`/host/#/doors/${f.door.id}`);
    expect(notificationText(event).body).toBe(
      "Alice updated door Updated entrance.",
    );
    expect(notificationText(event, "it").body).toBe(
      "Alice ha aggiornato la porta Updated entrance.",
    );
    expect(JSON.stringify(event)).not.toContain("fixture-secret");
    expect(
      f.db.query("SELECT 1 FROM jobs WHERE event_id=?").get(event.id),
    ).not.toBeNull();
    expect(
      (await f.req(path, { config: { url: "bad" } }, { method: "PUT" })).r
        .status,
    ).toBe(400);
    expect(
      (await f.events()).filter((e: any) => e.type === "door.updated"),
    ).toHaveLength(1);
    expect((await f.req("doors")).data[0].name).toBe("Updated entrance");
  } finally {
    f.db.close();
  }
});

test("guest openings attribute valid owner and collaborator sessions and keep idempotent actions single", async () => {
  const f = await fixture();
  try {
    for (const [role, name] of [
      ["owner", "Alice"],
      ["collaborator", "Bob"],
    ]) {
      const id = crypto.randomUUID();
      expect((await f.open(role, undefined, id)).data.status).toBe("accepted");
      expect((await f.open(role, undefined, id)).data.status).toBe("accepted");
      const event = (await f.events()).find(
        (e: any) => e.type === "access.accepted" && e.context.actor === name,
      );
      expect(event.context).toMatchObject({
        actor: name,
        doorName: "Entrance",
        codeLabel: "Guest",
        detail: "Fixture accepted",
      });
      expect(notificationText(event).body).toBe(
        `${name} · Entrance: Fixture accepted`,
      );
      expect(notificationText(event, "it").body).toContain(name);
    }
    expect(f.calls()).toBe(2);
    expect(
      (await f.events()).filter((e: any) => e.type === "access.accepted"),
    ).toHaveLength(2);
  } finally {
    f.db.close();
  }
});

test("missing, forged, expired and deleted host sessions neither attribute nor block guest actions", async () => {
  const f = await fixture();
  try {
    for (const [role, extra] of [
      ["missing", { Cookie: "" }],
      ["forged", { "X-Oshost-Username": "Alice" }],
      ["owner", {}],
      ["collaborator", {}],
    ] as [string, Record<string, string>][]) {
      if (role === "owner")
        f.db.query("UPDATE sessions SET expires=0 WHERE user_id=?").run(role);
      if (role === "collaborator")
        f.db.query("DELETE FROM users WHERE id=?").run(role);
      expect((await f.open(role, extra)).data.status).toBe("accepted");
    }
    const events = f.db
      .query(
        "SELECT c.data FROM events e JOIN event_context c ON c.event_id=e.id WHERE e.type='access.accepted'",
      )
      .all() as any[];
    expect(events).toHaveLength(4);
    for (const row of events)
      expect(JSON.parse(row.data).actor).toBeUndefined();
    expect(f.calls()).toBe(4);
  } finally {
    f.db.close();
  }
});
