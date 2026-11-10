import { expect, test } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { exportRecords, restoreRecords } from "../server/portable-backup";
import { STAFF_ACCESS_START, STAFF_ACCESS_END } from "../shared/schema";
import { breakfastDefaults } from "../shared/draft-defaults";

const origin = "http://localhost:3000",
  key = "c".repeat(64);
async function fixture() {
  const db = openDatabase(":memory:");
  let calls = 0;
  const app = createApp(db, {
    key,
    origin,
    setupToken: "setup",
    device: async () => {
      calls++;
      return { status: "accepted", detail: "Fixture accepted" };
    },
  });
  const setup = await app.request("/api/v1/auth/setup", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      setupToken: "setup",
      name: "Owner",
      email: "owner@example.test",
      password: "fixture-password",
    }),
  });
  const auth = (await setup.json()) as any,
    cookie = setup.headers.get("set-cookie")!.split(";")[0];
  async function req(
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
  ) {
    const response = await app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": auth.csrf,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: (await response.json()) as any };
  }
  const property = (
    await req("properties", { name: "Fixture", timezone: "UTC" })
  ).data;
  const door = (
    await req("doors", {
      propertyId: property.id,
      name: "Entrance",
      integration: "ewelink",
      config: { webhook_code: "fixture-only" },
    })
  ).data;
  const draft = {
    propertyId: property.id,
    label: "Cleaner",
    staff: true,
    grants: [{ doorId: door.id, singleUse: false }],
  };
  const guest = async (code: any, open = false) => {
    const token = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
      "code",
    )!;
    const response = await app.request(
      "/api/v1/guest" + (open ? `/doors/${door.id}/open` : ""),
      {
        method: open ? "POST" : "GET",
        headers: {
          Origin: origin,
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      },
    );
    return { status: response.status, data: (await response.json()) as any };
  };
  return { db, app, req, property, door, draft, guest, calls: () => calls };
}

test("staff codes accept undated grants and bypass only the time window, retaining usage and controls", async () => {
  const f = await fixture();
  try {
    const created = await f.req("codes", f.draft);
    expect(created.status).toBe(201);
    const code = created.data;
    const ignoredDates = await f.req("codes", {
      ...f.draft,
      grants: [
        {
          ...f.draft.grants[0],
          start: "invalid old date",
          end: "invalid old date",
        },
      ],
    });
    expect(ignoredDates.status).toBe(201);
    expect(ignoredDates.data.grants[0]).toMatchObject({
      start: STAFF_ACCESS_START,
      end: STAFF_ACCESS_END,
    });
    expect(code.staff).toBe(true);
    expect(code.grants[0]).toMatchObject({
      start: STAFF_ACCESS_START,
      end: STAFF_ACCESS_END,
    });
    expect((await f.guest(code)).data).toMatchObject({
      staff: true,
      doors: [{ timeUnrestricted: true }],
    });
    for (const [start, end] of [
      ["2000-01-01T00:00:00.000Z", "2001-01-01T00:00:00.000Z"],
      ["2999-01-01T00:00:00.000Z", "3000-01-01T00:00:00.000Z"],
    ]) {
      f.db
        .query("UPDATE grants SET start=?,end=? WHERE code_id=?")
        .run(start, end, code.id);
      expect((await f.guest(code, true)).data.status).toBe("accepted");
    }
    expect(
      (await f.req("reports")).data.find((r: any) => r.id === code.id).accepted,
    ).toBe(2);
    expect(
      (
        await f.req(
          `codes/${code.id}/grants/${f.door.id}`,
          { active: false },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect((await f.guest(code, true)).data.error).toBe(
      "Door permission paused",
    );
    await f.req(
      `codes/${code.id}/grants/${f.door.id}`,
      { active: true },
      "PATCH",
    );
    await f.req(
      `doors/${f.door.id}`,
      { ...f.door, enabled: false, config: {} },
      "PUT",
    );
    expect((await f.guest(code, true)).data.error).toBe("Door disabled");
    await f.req(`codes/${code.id}/revoke`, {});
    expect((await f.guest(code, true)).status).toBe(403);
    expect(f.calls()).toBe(2);
    expect(
      (await f.req("codes")).data.find((c: any) => c.id === code.id).revoked,
    ).toBe(true);
  } finally {
    f.db.close();
  }
});

test("single-use staff codes stay single-use and guest codes still require and enforce dates", async () => {
  const f = await fixture();
  try {
    expect((await f.req("codes", { ...f.draft, staff: false })).status).toBe(
      400,
    );
    const staff = (
      await f.req("codes", {
        ...f.draft,
        grants: [{ ...f.draft.grants[0], singleUse: true }],
      })
    ).data;
    expect((await f.guest(staff, true)).status).toBe(200);
    expect((await f.guest(staff, true)).data.error).toBe(
      "Single-use access already consumed",
    );
    for (const [start, end, error] of [
      ["2000-01-01T00:00:00Z", "2001-01-01T00:00:00Z", "Access expired"],
      [
        "2999-01-01T00:00:00Z",
        "3000-01-01T00:00:00Z",
        "Access is not yet valid",
      ],
    ]) {
      const guest = (
        await f.req("codes", {
          ...f.draft,
          staff: false,
          grants: [{ ...f.draft.grants[0], start, end }],
        })
      ).data;
      expect(guest.staff).toBe(false);
      expect((await f.guest(guest, true)).data.error).toBe(error);
    }
    expect(f.calls()).toBe(1);
  } finally {
    f.db.close();
  }
});

test("staff flag survives edits and portable backups without resetting permissions or usage", async () => {
  const f = await fixture(),
    restored = openDatabase(":memory:");
  try {
    const code = (await f.req("codes", f.draft)).data;
    await f.guest(code, true);
    await f.req(
      `codes/${code.id}/grants/${f.door.id}`,
      { active: false },
      "PATCH",
    );
    await f.req(
      `codes/${code.id}`,
      {
        ...f.draft,
        label: "Laundry",
        grants: [
          {
            ...f.draft.grants[0],
            start: STAFF_ACCESS_START,
            end: STAFF_ACCESS_END,
          },
        ],
      },
      "PUT",
    );
    const updated = (await f.req("codes")).data.find(
      (c: any) => c.id === code.id,
    );
    expect(updated).toMatchObject({
      staff: true,
      label: "Laundry",
      grants: [{ used: 1, active: false }],
    });
    const backup = exportRecords(f.db, key),
      restoredKey = "d".repeat(64);
    restoreRecords(restored, restoredKey, backup, () => {});
    const roundTrip = exportRecords(restored, restoredKey);
    expect(roundTrip.codes[0]).toMatchObject({
      data: { staff: true },
      grants: [{ used: 1, active: false }],
      metrics: { accepted: 1 },
    });
    expect(roundTrip.codes[0].token).toBe(backup.codes[0].token);
    expect(
      breakfastDefaults(
        { staff: true, grants: updated.grants },
        "UTC",
        new Date("2026-11-10T12:00:00Z"),
      ),
    ).toEqual({ total: 1, start: "2026-11-11", end: "2026-11-11" });
    // Converting to a guest code restores time checks without erasing usage.
    await f.req(
      `codes/${code.id}`,
      {
        ...f.draft,
        staff: false,
        grants: [
          {
            ...f.draft.grants[0],
            active: true,
            start: "2000-01-01T00:00:00Z",
            end: "2001-01-01T00:00:00Z",
          },
        ],
      },
      "PUT",
    );
    expect((await f.guest(code, true)).data.error).toBe("Access expired");
    expect(f.calls()).toBe(1);
  } finally {
    f.db.close();
    restored.close();
  }
});
