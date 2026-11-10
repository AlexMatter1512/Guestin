import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { notificationReads } from "../server/notification-reads";
import { pruneNotifications } from "../server/notifications";
import { realtime } from "../server/realtime";

function seed(db: ReturnType<typeof openDatabase>) {
  for (const id of ["owner", "collaborator"]) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      id,
      id,
      `${id}@example.test`,
      "unused",
      id,
    );
    db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest(id),
      id,
      "csrf",
      Date.now() + 60000,
    );
  }
  const propertyIds = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of propertyIds)
    db.query("INSERT INTO properties VALUES(?,?)").run(
      id,
      JSON.stringify({ name: id, timezone: "UTC" }),
    );
  const eventIds = Array.from({ length: 3 }, () => crypto.randomUUID());
  for (const [index, id] of eventIds.entries())
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      id,
      propertyIds[index] ?? null,
      null,
      "access.invalid",
      "Fixture",
      new Date().toISOString(),
    );
  return { propertyIds, eventIds };
}

test("notification readers and unread badges are per-user; reads are authenticated, idempotent and scoped", async () => {
  const db = openDatabase(":memory:");
  const { eventIds, propertyIds } = seed(db);
  const origin = "http://localhost:3000";
  const app = createApp(db, {
    origin,
    key: "a".repeat(64),
    setupToken: "setup",
  });
  const req = async (
    path: string,
    body?: unknown,
    user = "owner",
    csrf = "csrf",
  ) => {
    const response = await app.request(`/api/v1/events${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: `oshost_session=${user}`,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  try {
    expect((await req("/unread")).data.total).toBe(3);
    expect(
      (await req("/read", { eventIds: [eventIds[0]], userId: "collaborator" }))
        .status,
    ).toBe(400);
    expect((await req("/read", { eventIds }, "owner", "wrong")).status).toBe(
      403,
    );
    expect((await req("/read", { eventIds }, "missing")).status).toBe(401);
    expect(
      (
        await req("/read", {
          eventIds: [eventIds[0], eventIds[0], crypto.randomUUID()],
        })
      ).data.changed,
    ).toBe(1);
    expect((await req("/read", { eventIds: [eventIds[0]] })).data.changed).toBe(
      0,
    );
    const history = (await req("?pageSize=50")).data.events;
    expect(history.find((e: any) => e.id === eventIds[0])).toMatchObject({
      read: true,
      readBy: ["owner"],
    });
    expect((await req("/unread", undefined, "collaborator")).data.total).toBe(
      3,
    );
    expect(
      (await req("/read-all", { propertyId: propertyIds[0] })).data.unread,
    ).toMatchObject({
      total: 1,
      global: 0,
      properties: { [propertyIds[1]]: 1 },
    });
    expect((await req("/read-all", {})).data.unread.total).toBe(0);
    expect(
      (await req("/read", { eventIds: [eventIds[0]] }, "collaborator")).data
        .unread.total,
    ).toBe(2);
    expect(
      (await req("", undefined, "collaborator")).data
        .find((e: any) => e.id === eventIds[0])
        .readBy.sort(),
    ).toEqual(["collaborator", "owner"]);
  } finally {
    db.close();
  }
});

test("read receipts survive restart and cascade with notification retention and account deletion", () => {
  const directory = mkdtempSync(join(tmpdir(), "oshost-read-receipts-"));
  const path = join(directory, "db.sqlite");
  let db = openDatabase(path);
  try {
    const { eventIds } = seed(db);
    notificationReads(db).mark("owner", eventIds);
    notificationReads(db).mark("collaborator", eventIds);
    db.close();
    db = openDatabase(path);
    expect(notificationReads(db).unread("owner").total).toBe(0);
    db.query("DELETE FROM users WHERE id='collaborator'").run();
    expect(
      db.query("SELECT 1 FROM event_reads WHERE user_id='staff'").get(),
    ).toBeNull();
    db.query("UPDATE events SET created='2000-01-01T00:00:00.000Z'").run();
    pruneNotifications(db);
    expect(db.query("SELECT COUNT(*) n FROM event_reads").get()).toEqual({
      n: 0,
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("read updates synchronize all sessions of the reader without notifying other users", () => {
  const db = openDatabase(":memory:");
  try {
    seed(db);
    db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest("owner-second"),
      "owner",
      "csrf",
      Date.now() + 60000,
    );
    const hub = realtime(db);
    const messages: any[][] = [[], [], []];
    for (const [index, session] of [
      "owner",
      "owner-second",
      "collaborator",
    ].entries()) {
      hub.connect(
        {
          send: (message: string) => messages[index].push(JSON.parse(message)),
          close() {},
          raw: {},
        } as any,
        digest(session),
      );
      messages[index].length = 0;
    }
    hub.notificationReads("owner");
    expect(messages).toEqual([
      [{ type: "notifications.read" }],
      [{ type: "notifications.read" }],
      [],
    ]);
  } finally {
    db.close();
  }
});
