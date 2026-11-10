import { expect, test } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest, token, vault } from "../server/security";
import {
  headerPairsJSON,
  joinWebhookURL,
  splitWebhookURL,
} from "../shared/key-value";

async function fixture(key = "c".repeat(64), device?: () => Promise<any>) {
  const db = openDatabase(":memory:"),
    origin = "http://localhost:3000",
    owner = crypto.randomUUID(),
    collaborator = crypto.randomUUID();
  for (const [id, role] of [
    [owner, "owner"],
    [collaborator, "collaborator"],
  ]) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      id,
      role,
      `${role}@example.test`,
      "unused",
      role,
    );
    db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest(role),
      id,
      "csrf",
      Date.now() + 600000,
    );
  }
  db.query("INSERT INTO user_permissions VALUES(?,?)").run(
    collaborator,
    JSON.stringify({
      createDoors: true,
      createAccessCodes: true,
      createStaffCodes: true,
      useBookingConnectors: true,
    }),
  );
  const app = createApp(db, {
    origin,
    key,
    setupToken: "setup",
    device: device ?? (async () => ({ status: "accepted", detail: "Fixture" })),
  });
  async function req(
    path: string,
    body?: any,
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
    return {
      status: r.status,
      data: (await r.json()) as any,
      headers: r.headers,
    };
  }
  const property = (await req("properties", { name: "House", timezone: "UTC" }))
      .data,
    other = (await req("properties", { name: "Other", timezone: "UTC" })).data;
  async function door(name: string, propertyId = property.id) {
    return (
      await req("doors", {
        propertyId,
        name,
        integration: "webhook",
        config: {
          url: "https://example.test/unlock?token=fixture",
          method: "POST",
          body: "fixture",
        },
      })
    ).data;
  }
  const d1 = await door("Entrance"),
    d2 = await door("Room"),
    otherDoor = await door("Other door", other.id);
  async function code(label: string, doorId: string, propertyId = property.id) {
    return (
      await req("codes", {
        propertyId,
        label,
        staff: true,
        grants: [{ doorId, singleUse: true }],
      })
    ).data;
  }
  const c1 = await code("Cleaner", d1.id),
    c2 = await code("Laundry", d2.id),
    otherCode = await code("Other code", otherDoor.id, other.id);
  const exported = async (kind: "doors" | "codes") =>
    (await req(`admin/records/${kind}/export?propertyId=${property.id}`)).data;
  const imported = (
    kind: "doors" | "codes",
    data: any,
    mode = "append",
    confirmation?: string,
    role = "owner",
  ) =>
    req(
      `admin/records/${kind}/import`,
      {
        propertyId: property.id,
        data,
        mode,
        ...(confirmation ? { confirmation } : {}),
      },
      "POST",
      role,
    );
  return {
    db,
    app,
    req,
    key,
    origin,
    owner,
    property,
    other,
    d1,
    d2,
    c1,
    c2,
    otherDoor,
    otherCode,
    exported,
    imported,
  };
}

test("webhook pairs retain query encoding and repeated parameters, and reject incomplete or duplicate headers", () => {
  const split = splitWebhookURL(
    "https://example.test/unlock?id=a%2Bb&channel=1&channel=2",
  );
  expect(split).toEqual({
    url: "https://example.test/unlock",
    query: [
      { key: "id", value: "a+b" },
      { key: "channel", value: "1" },
      { key: "channel", value: "2" },
    ],
  });
  expect(joinWebhookURL(split.url, split.query)).toBe(
    "https://example.test/unlock?id=a%2Bb&channel=1&channel=2",
  );
  expect(
    JSON.parse(
      headerPairsJSON([
        { key: "Content-Type", value: "application/json" },
        { key: "Authorization", value: "Bearer fixture" },
        { key: "", value: "" },
      ]),
    ),
  ).toEqual({
    "Content-Type": "application/json",
    Authorization: "Bearer fixture",
  });
  expect(() =>
    headerPairsJSON([
      { key: "A", value: "1" },
      { key: "a", value: "2" },
    ]),
  ).toThrow("Duplicate header");
  expect(() => joinWebhookURL(split.url, [{ key: "id", value: "" }])).toThrow(
    "Fill in both",
  );
  expect(
    splitWebhookURL("https://example.test/unlock?id=1#fragment").url,
  ).toEndWith("#fragment");
});

test("granular export/import is owner-only even with every collaborator flag, and append skips existing records", async () => {
  const f = await fixture();
  try {
    for (const kind of ["doors", "codes"] as const) {
      const result = await f.req(
        `admin/records/${kind}/export?propertyId=${f.property.id}`,
      );
      expect(result.status).toBe(200);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(
        (
          await f.req(
            `admin/records/${kind}/export?propertyId=${f.property.id}`,
            undefined,
            "GET",
            "collaborator",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await f.imported(
            kind,
            result.data,
            "append",
            undefined,
            "collaborator",
          )
        ).status,
      ).toBe(403);
      const before =
        kind === "doors"
          ? (
              f.db
                .query("SELECT data FROM doors WHERE id=?")
                .get(f.d1.id) as any
            ).data
          : (
              f.db
                .query("SELECT data FROM codes WHERE id=?")
                .get(f.c1.id) as any
            ).data;
      result.data[kind][0].data[kind === "doors" ? "name" : "label"] =
        "Changed in file";
      expect((await f.imported(kind, result.data)).data).toMatchObject({
        added: 0,
        skipped: 2,
        replaced: 0,
        removed: 0,
      });
      const after =
        kind === "doors"
          ? (
              f.db
                .query("SELECT data FROM doors WHERE id=?")
                .get(f.d1.id) as any
            ).data
          : (
              f.db
                .query("SELECT data FROM codes WHERE id=?")
                .get(f.c1.id) as any
            ).data;
      expect(after).toBe(before);
      expect(
        (await f.imported(kind, result.data, "replace", "wrong")).status,
      ).toBe(400);
    }
  } finally {
    f.db.close();
  }
});

test("replacing doors removes omitted doors and grants, updates matching configs, and leaves codes, usage and other structures intact", async () => {
  const f = await fixture();
  try {
    f.db.query("UPDATE grants SET used=1 WHERE code_id=?").run(f.c1.id);
    const data = await f.exported("doors"),
      kept = data.doors.find((d: any) => d.id === f.d1.id);
    kept.data.name = "Updated entrance";
    kept.config.url = "https://example.test/new";
    const added = structuredClone(kept);
    added.id = crypto.randomUUID();
    added.data.name = "New door";
    data.doors = [kept, added];
    const r = await f.imported("doors", data, "replace", "REPLACE DOORS");
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ added: 1, replaced: 1, removed: 1, skipped: 0 });
    expect(
      f.db.query("SELECT 1 FROM doors WHERE id=?").get(f.d2.id),
    ).toBeNull();
    expect(
      f.db.query("SELECT 1 FROM grants WHERE door_id=?").get(f.d2.id),
    ).toBeNull();
    expect(
      (
        f.db
          .query("SELECT used FROM grants WHERE code_id=?")
          .get(f.c1.id) as any
      ).used,
    ).toBe(1);
    expect(
      f.db.query("SELECT 1 FROM codes WHERE id=?").get(f.c2.id),
    ).not.toBeNull();
    const secret = (
      f.db.query("SELECT secret FROM doors WHERE id=?").get(f.d1.id) as any
    ).secret;
    expect(secret).not.toContain("example.test");
    expect(vault(f.key).open(secret).url).toBe("https://example.test/new");
    expect(
      f.db.query("SELECT 1 FROM doors WHERE id=?").get(f.otherDoor.id),
    ).not.toBeNull();
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("replacing codes replaces the entire list and saved state, with atomic rollback on missing doors or token collisions", async () => {
  const f = await fixture();
  try {
    const original = await f.exported("codes"),
      data = structuredClone(original),
      kept = data.codes.find((c: any) => c.id === f.c1.id);
    data.codes = [kept];
    data.events = data.events.filter((e: any) => e.codeId === kept.id);
    await f.req(`codes/${f.c1.id}/revoke`, {});
    f.db.query("UPDATE grants SET used=1 WHERE code_id=?").run(f.c1.id);
    const invalid = structuredClone(data);
    invalid.codes[0].grants[0].doorId = crypto.randomUUID();
    expect(
      (await f.imported("codes", invalid, "replace", "REPLACE ACCESS CODES"))
        .status,
    ).toBe(409);
    expect(
      f.db.query("SELECT id FROM codes WHERE property_id=?").all(f.property.id),
    ).toHaveLength(2);
    const conflict = structuredClone(data);
    conflict.codes[0].token = vault(f.key).open(
      (
        f.db
          .query("SELECT secret FROM codes WHERE id=?")
          .get(f.otherCode.id) as any
      ).secret,
    );
    expect(
      (await f.imported("codes", conflict, "replace", "REPLACE ACCESS CODES"))
        .status,
    ).toBe(409);
    expect(
      f.db.query("SELECT id FROM codes WHERE property_id=?").all(f.property.id),
    ).toHaveLength(2);
    expect(
      (f.db.query("SELECT revoked FROM codes WHERE id=?").get(f.c1.id) as any)
        .revoked,
    ).toBe(1);
    expect(
      (
        f.db
          .query("SELECT used FROM grants WHERE code_id=?")
          .get(f.c1.id) as any
      ).used,
    ).toBe(1);
    kept.data.label = "Imported cleaner";
    const result = await f.imported(
      "codes",
      data,
      "replace",
      "REPLACE ACCESS CODES",
    );
    expect(result.status).toBe(200);
    expect(result.data).toEqual({
      added: 0,
      replaced: 1,
      removed: 1,
      skipped: 0,
    });
    expect(
      f.db.query("SELECT id FROM codes WHERE property_id=?").all(f.property.id),
    ).toHaveLength(1);
    expect(
      f.db.query("SELECT 1 FROM codes WHERE id=?").get(f.c2.id),
    ).toBeNull();
    expect(
      (f.db.query("SELECT revoked FROM codes WHERE id=?").get(f.c1.id) as any)
        .revoked,
    ).toBe(0);
    expect(
      (
        f.db
          .query("SELECT used FROM grants WHERE code_id=?")
          .get(f.c1.id) as any
      ).used,
    ).toBe(0);
    expect(
      f.db.query("SELECT 1 FROM codes WHERE id=?").get(f.otherCode.id),
    ).not.toBeNull();
    expect(f.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});

test("door and code files transfer to another installation, remapping only the selected structure and re-encrypting secrets", async () => {
  const source = await fixture(),
    target = await fixture("d".repeat(64));
  try {
    const doors = await source.exported("doors"),
      codes = await source.exported("codes");
    expect((await target.imported("codes", codes)).status).toBe(409);
    expect((await target.imported("doors", doors)).data.added).toBe(2);
    expect((await target.imported("codes", codes)).data.added).toBe(2);
    expect(
      (
        target.db
          .query("SELECT property_id FROM doors WHERE id=?")
          .get(source.d1.id) as any
      ).property_id,
    ).toBe(target.property.id);
    expect(
      (
        target.db
          .query("SELECT property_id FROM codes WHERE id=?")
          .get(source.c1.id) as any
      ).property_id,
    ).toBe(target.property.id);
    const encrypted = (
      target.db
        .query("SELECT secret FROM doors WHERE id=?")
        .get(source.d1.id) as any
    ).secret;
    expect(vault(target.key).open(encrypted).url).toContain("example.test");
    expect(() => vault(source.key).open(encrypted)).toThrow();
    expect(
      target.db
        .query("SELECT id FROM codes WHERE property_id=?")
        .all(target.property.id),
    ).toHaveLength(4);
    const token = codes.codes.find((c: any) => c.id === source.c1.id).token;
    const guest = await target.app.request("/api/v1/guest", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(guest.status).toBe(200);
    expect(target.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    source.db.close();
    target.db.close();
  }
});

test("replacing lists rejects unresolved and in-flight device work; empty replacement clears only the selected list", async () => {
  let started!: () => void, finish!: (r: any) => void;
  const ready = new Promise<void>((r) => (started = r)),
    done = new Promise((r) => (finish = r));
  const f = await fixture("c".repeat(64), async () => {
    started();
    return done;
  });
  try {
    const data = await f.exported("codes"),
      raw = new URLSearchParams(new URL(f.c1.link).hash.slice(1)).get("code")!;
    const opening = f.app.request(`/api/v1/guest/doors/${f.d1.id}/open`, {
      method: "POST",
      headers: {
        Origin: f.origin,
        Authorization: `Bearer ${raw}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    await ready;
    const snapshot = await f.exported("codes");
    const pending = snapshot.codes.find((c: any) => c.id === f.c1.id).actions[0]
      .result;
    expect(pending).toMatchObject({
      status: "pending",
      detail: "Device request in progress",
    });
    expect(
      (await f.imported("codes", data, "replace", "REPLACE ACCESS CODES"))
        .status,
    ).toBe(409);
    finish({ status: "uncertain", detail: "Fixture unresolved" });
    expect((await opening).status).toBe(200);
    expect(
      (await f.imported("codes", data, "replace", "REPLACE ACCESS CODES"))
        .status,
    ).toBe(409);
    await f.req(`codes/${f.c1.id}/resolve`, {
      doorId: f.d1.id,
      consumed: true,
    });
    data.codes = [];
    data.events = [];
    expect(
      (await f.imported("codes", data, "replace", "REPLACE ACCESS CODES"))
        .status,
    ).toBe(200);
    expect(
      f.db.query("SELECT id FROM codes WHERE property_id=?").all(f.property.id),
    ).toEqual([]);
    expect(
      f.db.query("SELECT id FROM doors WHERE property_id=?").all(f.property.id),
    ).toHaveLength(2);
    expect(
      f.db.query("SELECT 1 FROM codes WHERE id=?").get(f.otherCode.id),
    ).not.toBeNull();
  } finally {
    finish?.({ status: "failed", detail: "cleanup" });
    f.db.close();
  }
});
