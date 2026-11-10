import { test, expect } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { vault } from "../server/security";
import { localDate } from "../shared/schema";
import { backupSchema, MAX_BACKUP_BYTES } from "../shared/backup";
import { guestLinkDefaults, breakfastDefaults } from "../shared/draft-defaults";

const origin = "http://localhost:3000";
async function host(key: string, name: string) {
  const db = openDatabase(":memory:");
  let calls = 0;
  const app = createApp(db, {
    key,
    origin,
    setupToken: "setup",
    device: async () => {
      calls++;
      return calls === 1
        ? { status: "accepted", detail: "Fixture accepted" }
        : { status: "uncertain", detail: "Fixture timeout" };
    },
  });
  let cookie = "",
    csrf = "";
  async function req(
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
    headers: Record<string, string> = {},
  ) {
    const r = await app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { r, data: (await r.json()) as any };
  }
  const setup = await req("auth/setup", {
    setupToken: "setup",
    name,
    email: name.replaceAll(" ", "") + "@example.test",
    password: "backup-fixture-password",
  });
  cookie = setup.r.headers.get("set-cookie")!.split(";")[0];
  csrf = setup.data.csrf;
  return { db, app, req, calls: () => calls, key };
}
async function source() {
  const f = await host("a".repeat(64), "Source owner");
  const p = (
    await f.req("properties", {
      name: "Casa",
      timezone: "Europe/Rome",
      defaultCheckinLink: "https://example.test/checkin",
      defaultInstructionsLink: "https://example.test/instructions",
    })
  ).data;
  const doors = [];
  for (const name of ["Entrance", "Suite"])
    doors.push(
      (
        await f.req("doors", {
          propertyId: p.id,
          name,
          integration: "ewelink",
          config: { webhook_code: "private-door-credential" },
          photos: [
            {
              id: "photo",
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkAAAAABJRU5ErkJggg==",
              alt: "Example",
            },
          ],
          primaryPhotoId: "photo",
        })
      ).data,
    );
  const today = localDate("Europe/Rome"),
    start = new Date(Date.now() - 60000).toISOString(),
    end = new Date(Date.now() + 86400000).toISOString();
  const draft = {
    propertyId: p.id,
    label: "Ada Guest",
    notes: "Keep this note",
    checkinLink: "https://example.test/guest-checkin",
    instructionsLink: "https://example.test/instructions",
    grants: doors.map((d, i) => ({
      doorId: d.id,
      start,
      end,
      singleUse: i === 0,
    })),
    breakfast: { total: 4, start: today, end: today },
  };
  const code = (await f.req("codes", draft)).data;
  const token = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
    "code",
  )!;
  for (const d of doors)
    await f.req(`guest/doors/${d.id}/open`, {}, "POST", {
      Authorization: "Bearer " + token,
      "Idempotency-Key": crypto.randomUUID(),
    });
  const redemptionId = crypto.randomUUID();
  expect(
    (
      await f.req("guest/breakfast", { quantity: 2 }, "POST", {
        Authorization: "Bearer " + token,
        "Idempotency-Key": redemptionId,
      })
    ).r.status,
  ).toBe(200);
  await f.req(`doors/${doors[1].id}/test`, { confirm: true }, "POST", {
    "Idempotency-Key": crypto.randomUUID(),
  });
  const revoked = (await f.req("codes", { ...draft, label: "Revoked guest" }))
    .data;
  await f.req(`codes/${revoked.id}/revoke`, {});
  await f.req(
    `properties/${p.id}/breakfast-settings`,
    { enabled: true, password: "breakfast-private" },
    "PUT",
  );
  await f.req(
    `properties/${p.id}/notifications`,
    { retentionMonths: 5 },
    "PATCH",
  );
  const exported = await f.req("admin/export");
  expect(exported.r.status).toBe(200);
  expect(exported.r.headers.get("cache-control")).toBe("no-store");
  expect(exported.r.headers.get("content-disposition")).toContain(
    "attachment;",
  );
  return {
    ...f,
    p,
    doors,
    code,
    revoked,
    token,
    draft,
    redemptionId,
    backup: exported.data,
  };
}

test("default guest links allow provider overrides and survive structure edits; only owners change them", async () => {
  const f = await host("c".repeat(64), "Defaults owner");
  try {
    const p = (
      await f.req("properties", { name: "Default place", timezone: "UTC" })
    ).data;
    const links = {
      defaultCheckinLink: "https://example.test/in",
      defaultInstructionsLink: "https://example.test/help",
    };
    expect(
      (await f.req(`properties/${p.id}/links`, links, "PATCH")).r.status,
    ).toBe(200);
    await f.req(
      `properties/${p.id}`,
      { name: "Renamed", timezone: "UTC" },
      "PUT",
    );
    const saved = (await f.req("properties")).data[0];
    expect(saved.defaultCheckinLink).toBe(links.defaultCheckinLink);
    expect(
      guestLinkDefaults(saved, {
        checkinLink: "https://provider.test/personal",
        instructionsLink: "",
      }),
    ).toEqual({
      checkinLink: "https://provider.test/personal",
      instructionsLink: links.defaultInstructionsLink,
    });
    expect(
      (
        await f.req(
          `properties/${p.id}/links`,
          { ...links, defaultInstructionsLink: "javascript:alert(1)" },
          "PATCH",
        )
      ).r.status,
    ).toBe(400);
    const invite = (await f.req("invites", {})).data.link;
    const staff = await f.req("auth/accept-invite", {
      invite: new URLSearchParams(new URL(invite).hash.slice(1)).get("invite"),
      name: "Staff",
      email: "staff@example.test",
      password: "staff-backup-password",
    });
    const headers = {
      Cookie: staff.r.headers.get("set-cookie")!.split(";")[0],
      "X-CSRF-Token": staff.data.csrf,
    };
    expect(
      (await f.req(`properties/${p.id}/links`, links, "PATCH", headers)).r
        .status,
    ).toBe(403);
    expect(
      (await f.req("admin/export", undefined, "GET", headers)).r.status,
    ).toBe(403);
    expect(
      (
        await f.req(
          "admin/import",
          { confirmation: "RESTORE", backup: {} },
          "POST",
          headers,
        )
      ).r.status,
    ).toBe(403);
  } finally {
    f.db.close();
  }
});

test("breakfast defaults start the next local day across DST and never end before the start", () => {
  for (const [arrival, expected] of [
    ["2026-03-28T22:30:00Z", "2026-03-29"],
    ["2026-10-24T22:30:00Z", "2026-10-26"],
  ]) {
    const value = breakfastDefaults(
      {
        grants: [
          {
            doorId: "d",
            start: arrival,
            end: new Date(Date.parse(arrival) + 3600000).toISOString(),
            singleUse: false,
          },
        ],
      },
      "Europe/Rome",
    );
    expect(value.start).toBe(expected);
    expect(value.end >= value.start).toBe(true);
  }
  expect(
    breakfastDefaults({}, "Pacific/Auckland", new Date("2026-11-09T20:00:00Z"))
      .start,
  ).toBe("2026-11-11");
});

test("portable JSON preserves credentials, tokens, grants, breakfast ledger, metrics, history and attribution across encryption keys", async () => {
  const f = await source(),
    target = await host("b".repeat(64), "Restore owner");
  try {
    expect(JSON.stringify(f.backup)).not.toContain("data:image");
    expect(f.backup.doors[0].config.webhook_code).toBe(
      "private-door-credential",
    );
    expect(f.backup).not.toHaveProperty("users");
    expect(f.backup).not.toHaveProperty("connections");
    // A snapshot of an in-flight request must become uncertain, never retry automatically.
    const pending = f.backup.codes
      .find((c: any) => c.id === f.code.id)
      .actions.find((a: any) => a.result.status === "uncertain");
    pending.result.status = "pending";
    f.backup.doorTests[0].result.status = "pending";
    const result = await target.req("admin/import", {
      confirmation: "RESTORE",
      backup: f.backup,
    });
    expect(result.r.status).toBe(200);
    expect(result.data).toMatchObject({ properties: 1, doors: 2, codes: 2 });
    expect(target.calls()).toBe(0);
    const restored = (await target.req("codes")).data.find(
      (c: any) => c.id === f.code.id,
    );
    expect(restored.creatorName).toBe("Source owner");
    expect(
      (await target.req("admin/export")).data.codes.find(
        (c: any) => c.id === f.code.id,
      ).creatorId,
    ).toBe(f.code.creator);
    expect(restored.breakfastUsed).toBe(2);
    expect(restored.notes).toBe("Keep this note");
    expect(new URL(restored.link).hash).toBe(new URL(f.code.link).hash);
    expect(
      restored.grants.find((g: any) => g.doorId === f.doors[0].id).used,
    ).toBe(1);
    expect(
      restored.grants.find((g: any) => g.doorId === f.doors[1].id).claim,
    ).toBe(pending.id);
    expect(
      JSON.parse(
        (
          target.db
            .query("SELECT result FROM actions WHERE id=?")
            .get(pending.id) as any
        ).result,
      ).status,
    ).toBe("uncertain");
    expect((await target.req("doors")).data[1].testAction.status).toBe(
      "uncertain",
    );
    for (const door of (await target.req("doors")).data) {
      expect(door.photos).toEqual([]);
      expect(door.primaryPhotoId).toBeNull();
    }
    const secret = (
      target.db
        .query("SELECT secret FROM doors WHERE id=?")
        .get(f.doors[0].id) as any
    ).secret;
    expect(vault(target.key).open(secret).webhook_code).toBe(
      "private-door-credential",
    );
    expect(() => vault(f.key).open(secret)).toThrow();
    expect(
      (await target.req("reports")).data.find((c: any) => c.id === f.code.id),
    ).toMatchObject({ attempts: 2, accepted: 1, name: "Source owner" });
    const guestHeaders = { Authorization: "Bearer " + f.token };
    expect(
      (await target.req("guest", undefined, "GET", guestHeaders)).data
        .breakfastUsed,
    ).toBe(2);
    const before = (
      target.db.query("SELECT COUNT(*) n FROM redemptions").get() as any
    ).n;
    await target.req("guest/breakfast", { quantity: 2 }, "POST", {
      ...guestHeaders,
      "Idempotency-Key": f.redemptionId,
    });
    expect(
      (target.db.query("SELECT COUNT(*) n FROM redemptions").get() as any).n,
    ).toBe(before);
    expect(
      (
        await target.req(`public/breakfast/${f.p.id}`, undefined, "GET", {
          Cookie: "",
        })
      ).r.status,
    ).toBe(401);
    expect(
      (
        await target.req(
          `public/breakfast/${f.p.id}/auth`,
          { password: "breakfast-private" },
          "POST",
          { Cookie: "" },
        )
      ).r.status,
    ).toBe(200);
    expect((await target.req("events")).data.length).toBeGreaterThan(0);
    expect(target.db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    await target.req(`codes/${f.code.id}/resolve`, {
      doorId: f.doors[1].id,
      consumed: false,
    });
    await target.req(
      `codes/${f.code.id}`,
      { ...f.draft, label: "Edited after restore" },
      "PUT",
    );
    expect(
      (await target.req("codes")).data.find((c: any) => c.id === f.code.id)
        .creatorName,
    ).toBe("Source owner");
    // Reimporting an older snapshot cannot rewind redeemed quantities or revocation.
    await target.req("guest/breakfast", { quantity: 1 }, "POST", {
      ...guestHeaders,
      "Idempotency-Key": crypto.randomUUID(),
    });
    await target.req(`codes/${f.code.id}/revoke`, {});
    const repeated = await target.req("admin/import", {
      confirmation: "RESTORE",
      backup: f.backup,
    });
    expect(repeated.data).toMatchObject({
      codes: 0,
      skippedCodes: 2,
      skippedDoors: 2,
    });
    const current = (await target.req("codes")).data.find(
      (c: any) => c.id === f.code.id,
    );
    expect(current.revoked).toBe(true);
    expect(current.breakfastUsed).toBe(3);
    expect(current.label).toBe("Edited after restore");
  } finally {
    f.db.close();
    target.db.close();
  }
});

test("malformed, inconsistent or colliding JSON restores fail atomically and require confirmation and CSRF", async () => {
  const f = await source(),
    target = await host("d".repeat(64), "Validation owner");
  try {
    const restore = (
      backup: any,
      confirmation = "RESTORE",
      headers: Record<string, string> = {},
    ) => target.req("admin/import", { backup, confirmation }, "POST", headers);
    expect((await restore(f.backup, "wrong")).r.status).toBe(400);
    expect(
      (await restore(f.backup, "RESTORE", { "X-CSRF-Token": "wrong" })).r
        .status,
    ).toBe(403);
    expect((await restore({ ...f.backup, version: 99 })).r.status).toBe(400);
    const invalid = structuredClone(f.backup);
    invalid.codes[0].data.breakfast.total = 0;
    expect((await restore(invalid)).r.status).toBe(400);
    const mismatch = structuredClone(f.backup);
    mismatch.codes[0].grants[0].doorId = crypto.randomUUID();
    expect(backupSchema.safeParse(mismatch).success).toBe(false);
    expect((await restore(mismatch)).r.status).toBe(400);
    const p = (
      await target.req("properties", { name: "Keep", timezone: "UTC" })
    ).data;
    const existing = (
      await target.req("codes", {
        propertyId: p.id,
        label: "Existing",
        grants: [],
      })
    ).data;
    target.db
      .query("INSERT INTO actions VALUES(?,?,?,?,?)")
      .run(
        f.backup.codes[0].actions[0].id,
        existing.id,
        "door",
        "existing",
        JSON.stringify({ status: "failed", detail: "Fixture" }),
      );
    expect((await restore(f.backup)).r.status).toBe(409);
    expect((await target.req("properties")).data).toHaveLength(1);
    expect((await target.req("doors")).data).toHaveLength(0);
    expect((await target.req("codes")).data).toHaveLength(1);
    const large = await target.app.request("/api/v1/admin/import", {
      method: "POST",
      headers: { "Content-Length": String(MAX_BACKUP_BYTES + 1) },
    });
    expect(large.status).toBe(413);
    const malformed = await target.req("admin/import", null);
    expect(malformed.r.status).toBe(400);
  } finally {
    f.db.close();
    target.db.close();
  }
});
