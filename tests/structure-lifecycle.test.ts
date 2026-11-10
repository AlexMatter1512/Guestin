import { expect, test } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { exportRecords, restoreRecords } from "../server/portable-backup";

async function fixture(device?: () => Promise<any>) {
  const db = openDatabase(":memory:"),
    origin = "http://localhost:3000";
  const roleIds = {
    owner: crypto.randomUUID(),
    collaborator: crypto.randomUUID(),
  };
  for (const role of ["owner", "collaborator"] as const) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      roleIds[role],
      role,
      `${role}@example.test`,
      "unused",
      role,
    );
    db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest(role),
      roleIds[role],
      "csrf",
      Date.now() + 600000,
    );
  }
  const app = createApp(db, {
    key: "c".repeat(64),
    origin,
    setupToken: "setup",
    device,
  });
  async function req(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    role = "owner",
  ) {
    const r = await app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: `oshost_session=${role}`,
        "X-CSRF-Token": "csrf",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: (await r.json()) as any };
  }
  const property = (
    await req("properties", { name: "Main house", timezone: "UTC" })
  ).data;
  const door = (
    await req("doors", {
      propertyId: property.id,
      name: "Entrance",
      integration: "ewelink",
      config: { webhook_code: "fixture" },
    })
  ).data;
  const code = (
    await req("codes", {
      propertyId: property.id,
      label: "Cleaner",
      staff: true,
      notes: "private note",
      breakfast: { total: 3, start: "2026-11-10", end: "2026-11-10" },
      grants: [{ doorId: door.id, singleUse: false }],
    })
  ).data;
  const raw = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
    "code",
  )!;
  const guest = (open = false) =>
    app.request(`/api/v1/guest${open ? `/doors/${door.id}/open` : ""}`, {
      method: open ? "POST" : "GET",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${raw}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
  return { db, req, property, door, code, guest };
}

function history(f: Awaited<ReturnType<typeof fixture>>) {
  const { db, property, door, code } = f;
  const redemptionId = crypto.randomUUID();
  db.query("INSERT INTO redemptions VALUES(?,?,?,?,?)").run(
    redemptionId,
    code.id,
    1,
    "2026-11-10",
    new Date().toISOString(),
  );
  db.query("INSERT INTO actions VALUES(?,?,?,?,?)").run(
    crypto.randomUUID(),
    code.id,
    "door",
    door.id,
    '{"status":"accepted","detail":"Fixture accepted"}',
  );
  db.query("INSERT INTO actions VALUES(?,?,?,?,?)").run(
    redemptionId,
    code.id,
    "breakfast",
    "1",
    JSON.stringify({ remaining: 2 }),
  );
  db.query("INSERT INTO code_metrics VALUES(?,?,?)").run(code.id, 3, 2);
  db.query("INSERT INTO connections VALUES(?,?,?,?,?,?)").run(
    "connection",
    property.id,
    "ical",
    "Calendar",
    "unused",
    "{}",
  );
  db.query("INSERT INTO templates VALUES(?,?)").run(property.id, "{}");
  db.query("INSERT INTO property_settings VALUES(?,?,?)").run(
    property.id,
    3,
    null,
  );
  db.query("INSERT INTO breakfast_sessions VALUES(?,?,?)").run(
    "breakfast",
    property.id,
    Date.now() + 600000,
  );
  db.query("INSERT INTO door_tests VALUES(?,?,?,?,?,?)").run(
    crypto.randomUUID(),
    door.id,
    null,
    '{"status":"accepted","detail":"Fixture accepted"}',
    0,
    new Date().toISOString(),
  );
  db.query("INSERT INTO subscriptions VALUES(?,?,?,?)").run(
    "subscription",
    (db.query("SELECT id FROM users WHERE role='owner'").get() as any).id,
    "{}",
    JSON.stringify({ properties: [property.id], events: [] }),
  );
  const events = db
    .query("SELECT id FROM events WHERE property_id=?")
    .all(property.id) as { id: string }[];
  for (const { id } of events) {
    db.query("INSERT INTO event_reads VALUES(?,?,?)").run(
      id,
      (db.query("SELECT id FROM users WHERE role='owner'").get() as any).id,
      new Date().toISOString(),
    );
    db.query("INSERT INTO jobs VALUES(?,?,?,?)").run(id, "subscription", 0, 0);
  }
}

test("deactivation hides all everyday data and denies guest and connector access without removing history; owner can reactivate", async () => {
  const f = await fixture();
  try {
    history(f);
    expect(
      (
        await f.req(
          `properties/${f.property.id}/status`,
          { active: false },
          "PATCH",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.req(
          `properties/${f.property.id}/status`,
          { active: false },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    for (const path of [
      "properties",
      "doors",
      "codes",
      "connections",
      "reports",
      "events",
    ])
      expect((await f.req(path)).data).toEqual([]);
    expect((await f.req("events/unread")).data.total).toBe(0);
    expect(
      (
        await f.req(
          "properties?includeInactive=1",
          undefined,
          "GET",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    expect((await f.req("properties?includeInactive=1")).data[0].active).toBe(
      false,
    );
    expect((await f.guest()).status).toBe(403);
    expect((await f.guest(true)).status).toBe(403);
    expect((await f.req(`public/breakfast/${f.property.id}`)).status).toBe(403);
    expect((await f.req("connections/connection/request", {})).status).toBe(
      403,
    );
    expect((await f.req(`codes/${f.code.id}/revoke`, {})).status).toBe(403);
    expect(
      (
        await f.req("codes", {
          propertyId: f.property.id,
          label: "Hidden",
          staff: true,
          grants: [],
        })
      ).status,
    ).toBe(403);
    expect(
      (f.db.query("SELECT COUNT(*) n FROM events").get() as any).n,
    ).toBeGreaterThan(0);
    expect(
      (f.db.query("SELECT COUNT(*) n FROM redemptions").get() as any).n,
    ).toBe(1);
    const backup = exportRecords(f.db, "c".repeat(64));
    expect(backup.properties[0].data.active).toBe(false);
    const restored = openDatabase(":memory:");
    try {
      restoreRecords(restored, "c".repeat(64), backup, () => {});
      expect(
        JSON.parse(
          (restored.query("SELECT data FROM properties").get() as any).data,
        ).active,
      ).toBe(false);
    } finally {
      restored.close();
    }
    expect(
      (
        await f.req(
          `properties/${f.property.id}/status`,
          { active: true },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect((await f.req("codes")).data[0].notes).toBe("private note");
    expect((await f.guest()).status).toBe(200);
  } finally {
    f.db.close();
  }
});

test("owner-only confirmed code deletion clears all related usage, jobs and receipts, retaining structure and other codes", async () => {
  const f = await fixture();
  try {
    history(f);
    expect(
      (
        await f.req(
          `codes/${f.code.id}`,
          { confirmation: "DELETE CODE" },
          "DELETE",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.req(`codes/${f.code.id}`, { confirmation: "wrong" }, "DELETE"))
        .status,
    ).toBe(400);
    expect(
      (
        await f.req(
          `codes/${f.code.id}`,
          { confirmation: "DELETE CODE" },
          "DELETE",
        )
      ).status,
    ).toBe(200);
    for (const table of [
      "codes",
      "grants",
      "redemptions",
      "actions",
      "code_metrics",
      "events",
      "jobs",
      "event_reads",
      "event_context",
    ])
      expect(
        (f.db.query(`SELECT COUNT(*) n FROM ${table}`).get() as any).n,
      ).toBe(0);
    expect((await f.req("properties")).data).toHaveLength(1);
    expect((await f.req("doors")).data).toHaveLength(1);
    expect((await f.guest()).status).toBe(403);
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("structure deletion removes complete related graph and subscription scope without affecting another structure", async () => {
  const f = await fixture();
  try {
    history(f);
    const other = (
      await f.req("properties", { name: "Other", timezone: "UTC" })
    ).data;
    const otherCode = (
      await f.req("codes", {
        propertyId: other.id,
        label: "Other code",
        staff: true,
        grants: [],
      })
    ).data;
    expect(
      (
        await f.req(
          `properties/${f.property.id}`,
          { confirmation: "DELETE STRUCTURE" },
          "DELETE",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.req(`properties/${f.property.id}`, {}, "DELETE")).status,
    ).toBe(400);
    expect(
      (
        await f.req(
          `properties/${f.property.id}`,
          { confirmation: "DELETE STRUCTURE" },
          "DELETE",
        )
      ).status,
    ).toBe(200);
    for (const table of [
      "doors",
      "grants",
      "redemptions",
      "actions",
      "code_metrics",
      "jobs",
      "event_reads",
      "door_tests",
      "connections",
      "templates",
      "property_settings",
      "breakfast_sessions",
    ])
      expect(
        (f.db.query(`SELECT COUNT(*) n FROM ${table}`).get() as any).n,
      ).toBe(0);
    expect((await f.req("properties")).data.map((p: any) => p.id)).toEqual([
      other.id,
    ]);
    expect((await f.req("codes")).data.map((c: any) => c.id)).toEqual([
      otherCode.id,
    ]);
    expect(
      f.db
        .query("SELECT * FROM events WHERE property_id=? OR code_id=?")
        .all(f.property.id, f.code.id),
    ).toEqual([]);
    expect(
      JSON.parse(
        (f.db.query("SELECT preferences FROM subscriptions").get() as any)
          .preferences,
      ),
    ).toMatchObject({ properties: [], allProperties: false });
    expect(f.db.query("SELECT id FROM users").all()).toHaveLength(2);
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("destructive mutations cannot overlap an in-flight device request", async () => {
  let started!: () => void, finish!: (value: any) => void;
  const ready = new Promise<void>((r) => (started = r)),
    done = new Promise((r) => (finish = r));
  const f = await fixture(async () => {
    started();
    return done;
  });
  try {
    const opening = f.guest(true);
    await ready;
    expect(
      (
        await f.req(
          `codes/${f.code.id}`,
          { confirmation: "DELETE CODE" },
          "DELETE",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await f.req(
          `properties/${f.property.id}`,
          { confirmation: "DELETE STRUCTURE" },
          "DELETE",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await f.req(
          `properties/${f.property.id}/status`,
          { active: false },
          "PATCH",
        )
      ).status,
    ).toBe(409);
    finish({ status: "accepted", detail: "Fixture accepted" });
    expect((await opening).status).toBe(200);
    expect(
      (
        await f.req(
          `properties/${f.property.id}`,
          { confirmation: "DELETE STRUCTURE" },
          "DELETE",
        )
      ).status,
    ).toBe(200);
  } finally {
    finish?.({ status: "failed", detail: "Test cleanup" });
    f.db.close();
  }
});
