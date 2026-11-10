import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { permissionLabels } from "../shared/permissions";

async function fixture(path = ":memory:") {
  const db = openDatabase(path),
    origin = "http://localhost:3000";
  for (const role of ["owner", "collaborator"]) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      role,
      role,
      `${role}@example.test`,
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
  const app = createApp(db, {
    key: "c".repeat(64),
    origin,
    setupToken: "setup",
    device: async () => ({ status: "accepted", detail: "Fixture" }),
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
        Cookie: `guestin_session=${role}`,
        "X-CSRF-Token": "csrf",
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: (await r.json()) as any };
  }
  const property = (await req("properties", { name: "Casa", timezone: "UTC" }))
    .data;
  const doorDraft = {
    propertyId: property.id,
    name: "Door",
    integration: "none",
    config: {},
  };
  const door = (await req("doors", doorDraft)).data;
  const draft = {
    propertyId: property.id,
    label: "Guest",
    grants: [
      {
        doorId: door.id,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 86400000).toISOString(),
        singleUse: false,
      },
    ],
  };
  const grant = (permissions: any) =>
    req("users/collaborator", { permissions }, "PATCH");
  return { db, req, property, door, doorDraft, draft, grant };
}

test("collaborator permissions are independent, checked on every request and cannot grant owner powers", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.req("me", undefined, "GET", "collaborator")).data.user,
    ).toMatchObject({
      role: "collaborator",
      permissions: {
        createAccessCodes: false,
        createStaffCodes: false,
        createDoors: false,
        useBookingConnectors: false,
      },
    });
    expect((await f.req("codes", f.draft, "POST", "collaborator")).status).toBe(
      403,
    );
    expect(
      (await f.req("doors", f.doorDraft, "POST", "collaborator")).status,
    ).toBe(403);
    expect(
      (await f.req("connections", undefined, "GET", "collaborator")).status,
    ).toBe(403);
    await f.grant({ createAccessCodes: true });
    const ordinary = await f.req("codes", f.draft, "POST", "collaborator");
    expect(ordinary.status).toBe(201);
    expect(
      (
        await f.req(
          "codes",
          { ...f.draft, staff: true },
          "POST",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.req(
          `codes/${ordinary.data.id}`,
          { ...f.draft, staff: true },
          "PUT",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    await f.grant({ createAccessCodes: false, createStaffCodes: true });
    const staff = await f.req(
      "codes",
      { ...f.draft, staff: true },
      "POST",
      "collaborator",
    );
    expect(staff.status).toBe(201);
    expect((await f.req("codes", f.draft, "POST", "collaborator")).status).toBe(
      403,
    );
    expect(
      (await f.req(`codes/${staff.data.id}`, f.draft, "PUT", "collaborator"))
        .status,
    ).toBe(403);
    expect(
      (
        await f.req(
          `codes/${ordinary.data.id}`,
          { ...f.draft, staff: true },
          "PUT",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.req(
          `codes/${ordinary.data.id}/revoke`,
          {},
          "POST",
          "collaborator",
        )
      ).status,
    ).toBe(403);
    await f.grant({ createDoors: true, useBookingConnectors: true });
    expect(
      (await f.req("me", undefined, "GET", "collaborator")).data.user
        .permissions,
    ).toEqual({
      createAccessCodes: false,
      createStaffCodes: true,
      createDoors: true,
      useBookingConnectors: true,
    });
    expect(
      (await f.req("doors", f.doorDraft, "POST", "collaborator")).status,
    ).toBe(201);
    expect(
      (await f.req("connections", undefined, "GET", "collaborator")).status,
    ).toBe(200);
    for (const [path, body, method] of [
      ["users", undefined, "GET"],
      ["users/owner", { confirmation: "DELETE ACCOUNT" }, "DELETE"],
      ["users/collaborator", { role: "owner" }, "PATCH"],
      ["invites", {}, "POST"],
      ["admin/wipe", {}, "POST"],
      ["connections", {}, "POST"],
      ["connections/missing", undefined, "DELETE"],
      [`doors/${f.door.id}/test`, { confirm: true }, "POST"],
      ["properties", { name: "Escalation", timezone: "UTC" }, "POST"],
      [`codes/${staff.data.id}`, { confirmation: "DELETE CODE" }, "DELETE"],
    ] as const)
      expect((await f.req(path, body, method, "collaborator")).status).toBe(
        403,
      );
    expect(
      (
        await f.req(
          "users/collaborator",
          { permissions: { wipeDatabase: true } },
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.req(
          "me/preferences",
          { permissions: { createAccessCodes: true } },
          "PATCH",
          "collaborator",
        )
      ).status,
    ).toBe(400);
    await f.grant({ useBookingConnectors: false });
    expect(
      (await f.req("connections", undefined, "GET", "collaborator")).status,
    ).toBe(403);
    expect(
      (await f.req("connections/missing/request", {}, "POST", "collaborator"))
        .status,
    ).toBe(403);
    expect(
      (await f.req("users/collaborator", { role: "owner" }, "PATCH")).status,
    ).toBe(200);
    expect(
      (await f.req("users", undefined, "GET", "collaborator")).status,
    ).toBe(200);
    expect(
      (await f.req("me", undefined, "GET", "collaborator")).data.user.role,
    ).toBe("owner");
  } finally {
    f.db.close();
  }
});

test("owners cannot delete or demote one another; self deletion preserves data and requires another owner", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.req("users/owner", { confirmation: "DELETE ACCOUNT" }, "DELETE"))
        .status,
    ).toBe(409);
    expect(
      (await f.req("users/collaborator", { role: "owner" }, "PATCH")).status,
    ).toBe(200);
    expect(
      (
        await f.req(
          "users/collaborator",
          { confirmation: "DELETE ACCOUNT" },
          "DELETE",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.req(
          "users/collaborator",
          { permissions: { createDoors: false } },
          "PATCH",
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.req("users/collaborator", { role: "collaborator" }, "PATCH"))
        .status,
    ).toBe(400);
    const code = (await f.req("codes", f.draft)).data;
    f.db
      .query("INSERT INTO subscriptions VALUES(?,?,?,?)")
      .run("subscription", "owner", "{}", "{}");
    f.db.query("INSERT INTO user_permissions VALUES(?,?)").run("owner", "{}");
    expect(
      (await f.req("users/owner", { confirmation: "wrong" }, "DELETE")).status,
    ).toBe(400);
    expect(
      (await f.req("users/owner", { confirmation: "DELETE ACCOUNT" }, "DELETE"))
        .status,
    ).toBe(200);
    expect((await f.req("me")).status).toBe(401);
    expect(
      (await f.req("users", undefined, "GET", "collaborator")).data,
    ).toHaveLength(1);
    expect(
      (f.db.query("SELECT creator FROM codes WHERE id=?").get(code.id) as any)
        .creator,
    ).toBeNull();
    for (const table of [
      "sessions",
      "subscriptions",
      "user_preferences",
      "user_permissions",
    ])
      expect(
        f.db.query(`SELECT * FROM ${table} WHERE user_id=?`).all("owner"),
      ).toEqual([]);
    expect(f.db.query("SELECT * FROM properties").all()).toHaveLength(1);
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("owners delete collaborators with all sessions and receipts, and invited accounts begin without permissions", async () => {
  const f = await fixture();
  try {
    const invited = (await f.req("invites", {})).data;
    const token = new URLSearchParams(new URL(invited.link).hash.slice(1)).get(
      "invite",
    );
    const joined = await f.req("auth/accept-invite", {
      invite: token,
      name: "New collaborator",
      email: "new@example.test",
      password: "fixture-password",
    });
    expect(joined.status).toBe(200);
    expect(joined.data.user.role).toBe("collaborator");
    for (const key of Object.keys(permissionLabels))
      expect(joined.data.user.permissions[key]).toBe(false);
    await f.grant({ createAccessCodes: true });
    const code = (await f.req("codes", f.draft, "POST", "collaborator")).data;
    expect(
      (
        await f.req(
          "users/collaborator",
          { confirmation: "DELETE ACCOUNT" },
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect((await f.req("me", undefined, "GET", "collaborator")).status).toBe(
      401,
    );
    expect(
      (f.db.query("SELECT creator FROM codes WHERE id=?").get(code.id) as any)
        .creator,
    ).toBeNull();
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("v5 staff migration preserves foreign keys, sessions and previous capabilities", async () => {
  const directory = mkdtempSync(join(tmpdir(), "guestin-roles-")),
    path = join(directory, "db.sqlite");
  const f = await fixture(path);
  try {
    await f.grant({ createAccessCodes: true });
    const code = (await f.req("codes", f.draft, "POST", "collaborator")).data;
    f.db.exec(`PRAGMA foreign_keys=OFF;
      CREATE TABLE legacy_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','staff')));
      INSERT INTO legacy_users SELECT id,name,email,password,CASE role WHEN 'collaborator' THEN 'staff' ELSE role END FROM users;
      DROP TABLE user_permissions;
      DROP TABLE users;
      ALTER TABLE legacy_users RENAME TO users;
      DELETE FROM migrations WHERE version=6;`);
    f.db.close();
    const db = openDatabase(path);
    try {
      expect(
        (
          db
            .query("SELECT role FROM users WHERE id='collaborator'")
            .get() as any
        ).role,
      ).toBe("collaborator");
      expect(
        JSON.parse(
          (
            db
              .query(
                "SELECT data FROM user_permissions WHERE user_id='collaborator'",
              )
              .get() as any
          ).data,
        ),
      ).toEqual({
        createAccessCodes: true,
        createDoors: false,
        useBookingConnectors: true,
        createStaffCodes: true,
      });
      expect(
        (db.query("SELECT creator FROM codes WHERE id=?").get(code.id) as any)
          .creator,
      ).toBe("collaborator");
      expect(db.query("SELECT * FROM sessions").all()).toHaveLength(2);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      expect((db.query("PRAGMA foreign_keys").get() as any).foreign_keys).toBe(
        1,
      );
      expect(() =>
        db
          .query("INSERT INTO users VALUES(?,?,?,?,?)")
          .run("bad", "bad", "bad@example.test", "unused", "staff"),
      ).toThrow();
    } finally {
      db.close();
    }
  } finally {
    try {
      f.db.close();
    } catch {}
    rmSync(directory, { recursive: true, force: true });
  }
});
