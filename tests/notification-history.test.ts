import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { exportRecords, restoreRecords } from "../server/portable-backup";

const origin = "http://localhost:3000",
  key = "c".repeat(64);
const photo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZ0AAAAASUVORK5CYII=";
async function fixture() {
  const db = openDatabase(":memory:"),
    user = crypto.randomUUID();
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    user,
    "Owner",
    "owner@example.test",
    "unused",
    "owner",
  );
  db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest("owner"),
    user,
    "csrf",
    Date.now() + 600000,
  );
  const app = createApp(db, {
    origin,
    key,
    setupToken: "setup",
    device: async () => ({ status: "accepted", detail: "Fixture accepted" }),
  });
  async function req(
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
    authenticated = true,
  ) {
    const r = await app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        ...(authenticated
          ? { Cookie: "oshost_session=owner", "X-CSRF-Token": "csrf" }
          : {}),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: (await r.json()) as any };
  }
  const property = (await req("properties", { name: "House", timezone: "UTC" }))
    .data;
  const other = (await req("properties", { name: "Other", timezone: "UTC" }))
    .data;
  const door = (
    await req("doors", {
      propertyId: property.id,
      name: "Front door",
      integration: "ewelink",
      config: { webhook_code: "fixture" },
      photos: [{ id: "primary", url: photo, alt: "Door" }],
      primaryPhotoId: "primary",
    })
  ).data;
  const code = (
    await req("codes", {
      propertyId: property.id,
      staff: true,
      label: "Cleaner",
      grants: [{ doorId: door.id, singleUse: false }],
    })
  ).data;
  return { db, app, req, user, property, other, door, code };
}

test("history defaults to 20 with stable cursor pagination; loading never creates read receipts", async () => {
  const f = await fixture();
  try {
    f.db.query("DELETE FROM events").run();
    const stamp = new Date().toISOString();
    for (let i = 0; i < 45; i++)
      f.db
        .query("INSERT INTO events VALUES(?,?,?,?,?,?)")
        .run(
          crypto.randomUUID(),
          f.property.id,
          null,
          "access.invalid",
          "Fixture",
          stamp,
        );
    const first = (await f.req(`events?propertyId=${f.property.id}`)).data;
    expect(first.events).toHaveLength(20);
    expect(first.nextCursor).toBeString();
    f.db
      .query("INSERT INTO events VALUES(?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        f.property.id,
        null,
        "access.invalid",
        "New arrival",
        new Date(Date.now() + 1000).toISOString(),
      );
    const second = (
      await f.req(
        `events?propertyId=${f.property.id}&cursor=${first.nextCursor}`,
      )
    ).data;
    const third = (
      await f.req(
        `events?propertyId=${f.property.id}&cursor=${second.nextCursor}`,
      )
    ).data;
    expect(second.events).toHaveLength(20);
    expect(third.events).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    const all = [...first.events, ...second.events, ...third.events];
    expect(new Set(all.map((e) => e.id)).size).toBe(45);
    expect(all.some((e) => e.message === "New arrival")).toBe(false);
    expect(f.db.query("SELECT * FROM event_reads").all()).toEqual([]);
    expect((await f.req("events/unread")).data.total).toBe(46);
    expect((await f.req("events?pageSize=0")).status).toBe(400);
    expect((await f.req("events?cursor=invalid")).status).toBe(400);
    await f.req("events/read", { eventIds: [first.events[0].id] });
    expect((await f.req(`events/${first.events[0].id}`)).data.read).toBe(true);
    expect((await f.req("events/unread")).data.total).toBe(45);
    await f.req("events/read-all", { propertyId: f.property.id });
    expect((await f.req("events/unread")).data.total).toBe(0);
  } finally {
    f.db.close();
  }
});

test("code notices link to their code; successful door usage has the exact protected photo and door link; invalid attempts have no destination", async () => {
  const f = await fixture();
  try {
    const created = (await f.req("events")).data.events[0];
    expect(created).toMatchObject({
      icon: "key",
      href: `/host/#/codes/${f.code.id}`,
      thumbnail: null,
      read: false,
    });
    const raw = new URLSearchParams(new URL(f.code.link).hash.slice(1)).get(
      "code",
    )!;
    const r = await f.app.request(`/api/v1/guest/doors/${f.door.id}/open`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${raw}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    expect(r.status).toBe(200);
    const accepted = (await f.req("events")).data.events.find(
      (e: any) => e.type === "access.accepted",
    );
    expect(accepted).toMatchObject({
      icon: "door",
      href: `/host/#/doors/${f.door.id}`,
      thumbnail: `/api/v1/doors/${f.door.id}/thumbnail`,
      context: { doorId: f.door.id, doorName: "Front door" },
    });
    expect((await f.app.request(accepted.thumbnail)).status).toBe(401);
    const image = await f.app.request(accepted.thumbnail, {
      headers: { Cookie: "oshost_session=owner" },
    });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(20);
    await f.req(`codes/${f.code.id}/revoke`, {});
    const revoked = (await f.req("events")).data.events.find(
      (e: any) => e.type === "code.revoked",
    );
    expect(revoked).toMatchObject({
      icon: "key",
      href: `/host/#/codes/${f.code.id}`,
    });
    await f.app.request("/api/v1/guest", {
      headers: { Authorization: `Bearer ${raw}` },
    });
    const invalid = (await f.req("events")).data.events.find(
      (e: any) => e.type === "access.invalid",
    );
    expect(invalid).toMatchObject({
      icon: "danger",
      href: null,
      thumbnail: null,
    });
    expect(
      (await f.req(`events/${invalid.id}`, undefined, "GET", false)).status,
    ).toBe(401);
    expect(f.db.query("SELECT * FROM event_reads").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("count retention removes oldest rows and their jobs/contexts/read receipts per structure while preserving metrics and other scopes", async () => {
  const f = await fixture();
  try {
    f.db.query("DELETE FROM events").run();
    f.db.query("INSERT INTO code_metrics VALUES(?,?,?)").run(f.code.id, 9, 7);
    f.db
      .query("INSERT INTO subscriptions VALUES(?,?,?,?)")
      .run("s", f.user, "{}", "{}");
    for (let i = 0; i < 35; i++) {
      const id = crypto.randomUUID();
      f.db
        .query("INSERT INTO events VALUES(?,?,?,?,?,?)")
        .run(
          id,
          f.property.id,
          f.code.id,
          "code.created",
          "Fixture",
          new Date(Date.now() - i * 1000).toISOString(),
        );
      f.db.query("INSERT INTO event_context VALUES(?,?)").run(id, "{}");
      f.db
        .query("INSERT INTO event_reads VALUES(?,?,?)")
        .run(id, f.user, new Date().toISOString());
      f.db.query("INSERT INTO jobs VALUES(?,?,?,?)").run(id, "s", 0, 0);
    }
    const expected = (
      f.db
        .query("SELECT id FROM events ORDER BY created DESC,id DESC LIMIT 10")
        .all() as { id: string }[]
    ).map((r) => r.id);
    f.db
      .query("INSERT INTO events VALUES(?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        f.other.id,
        null,
        "access.invalid",
        "Other",
        new Date().toISOString(),
      );
    expect(
      (
        await f.req(
          `properties/${f.property.id}/notifications`,
          { maxNotifications: 10 },
          "PATCH",
        )
      ).data,
    ).toEqual({ retentionMonths: 3, maxNotifications: 10 });
    expect(
      (
        f.db
          .query(
            "SELECT id FROM events WHERE property_id=? ORDER BY created DESC,id DESC",
          )
          .all(f.property.id) as { id: string }[]
      ).map((r) => r.id),
    ).toEqual(expected);
    for (const table of ["event_context", "event_reads", "jobs"])
      expect(
        (f.db.query(`SELECT COUNT(*) n FROM ${table}`).get() as any).n,
      ).toBe(10);
    expect(
      (
        f.db
          .query("SELECT COUNT(*) n FROM events WHERE property_id=?")
          .get(f.other.id) as any
      ).n,
    ).toBe(1);
    expect(
      f.db.query("SELECT attempts,accepted FROM code_metrics").get(),
    ).toEqual({ attempts: 9, accepted: 7 });
    await f.req(
      `properties/${f.property.id}/notifications`,
      { retentionMonths: 6 },
      "PATCH",
    );
    expect(
      (await f.req("properties")).data.find((p: any) => p.id === f.property.id),
    ).toMatchObject({
      notificationRetentionMonths: 6,
      notificationRetentionLimit: 10,
    });
    for (const maxNotifications of [0, 100001, 1.5, "10", null])
      expect(
        (
          await f.req(
            `properties/${f.property.id}/notifications`,
            { maxNotifications },
            "PATCH",
          )
        ).status,
      ).toBe(400);
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("new events obey the count cap at insertion and portable backups preserve both retention settings", async () => {
  const f = await fixture();
  try {
    await f.req(
      `properties/${f.property.id}/notifications`,
      { retentionMonths: 6, maxNotifications: 2 },
      "PATCH",
    );
    for (let i = 0; i < 5; i++)
      await f.req("codes", {
        propertyId: f.property.id,
        label: `Code ${i}`,
        staff: true,
        grants: [],
      });
    expect(
      (
        f.db
          .query("SELECT COUNT(*) n FROM events WHERE property_id=?")
          .get(f.property.id) as any
      ).n,
    ).toBe(2);
    const backup = exportRecords(f.db, key),
      restored = openDatabase(":memory:");
    try {
      restoreRecords(restored, key, backup, () => {});
      expect(
        restored
          .query(
            "SELECT notification_months,notification_limit FROM property_settings WHERE property_id=?",
          )
          .get(f.property.id),
      ).toEqual({ notification_months: 6, notification_limit: 2 });
    } finally {
      restored.close();
    }
  } finally {
    f.db.close();
  }
});

test("schema 7 upgrades preserve existing retention settings and default the count to 1000", () => {
  const directory = mkdtempSync(join(tmpdir(), "oshost-notification-upgrade-")),
    path = join(directory, "db.sqlite");
  let db = openDatabase(path);
  try {
    db.query("INSERT INTO properties VALUES(?,?)").run(
      "p",
      '{"name":"House","timezone":"UTC"}',
    );
    db.query(
      "INSERT INTO property_settings(property_id,notification_months,breakfast_password) VALUES(?,?,?)",
    ).run("p", 9, "retained-hash");
    db.exec(
      "ALTER TABLE property_settings DROP COLUMN notification_limit; DELETE FROM migrations WHERE version=8;",
    );
    db.close();
    db = openDatabase(path);
    expect(
      db
        .query(
          "SELECT notification_months,notification_limit,breakfast_password FROM property_settings WHERE property_id='p'",
        )
        .get(),
    ).toEqual({
      notification_months: 9,
      notification_limit: 1000,
      breakfast_password: "retained-hash",
    });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
