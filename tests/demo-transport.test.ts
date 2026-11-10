import { test, expect } from "bun:test";
import { demoTransport } from "../apps/host/src/lib/transport";
test("demo code changes stay in memory and unsupported operations fail closed", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw Error("Demo attempted network access");
  }) as unknown as typeof fetch;
  try {
    const before = await demoTransport("codes");
    const c = await demoTransport("codes", {
      label: "Sample test",
      propertyId: "demo-0",
      grants: [],
    });
    await demoTransport("codes/" + c.id, { label: "Edited" }, "PUT");
    expect(
      (await demoTransport("codes")).find((x: any) => x.id === c.id).label,
    ).toBe("Edited");
    await demoTransport("codes/" + c.id + "/revoke", {});
    expect(
      (await demoTransport("codes")).find((x: any) => x.id === c.id).revoked,
    ).toBe(true);
    expect((await demoTransport("codes")).length).toBe(before.length + 1);
    await expect(demoTransport("unknown/operation", {})).rejects.toThrow(
      "unavailable",
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("demo owner settings and portable backup are functional without delivery", async () => {
  expect((await demoTransport("me")).user.role).toBe("owner");
  await demoTransport("settings", { dateFormat: "yyyy-mm-dd" }, "PUT");
  expect((await demoTransport("settings")).dateFormat).toBe("yyyy-mm-dd");
  await demoTransport(
    "admin/smtp",
    {
      host: "smtp.sample.invalid",
      port: 587,
      security: "starttls",
      from: "demo@example.invalid",
    },
    "PUT",
  );
  expect((await demoTransport("admin/smtp")).host).toBe("smtp.sample.invalid");
  const backup = await demoTransport("admin/export");
  expect(backup.format).toBe("guestin-json");
  expect(backup.doors.length).toBeGreaterThan(0);
  expect(backup.codes.length).toBeGreaterThan(0);
  await expect(demoTransport("admin/smtp/test", {})).resolves.toEqual({
    ok: true,
  });
});

test("host and guest share saved edits, revocation and breakfast accounting", async () => {
  const { demoGuestRequest, demoCafeTotals } =
    await import("../shared/demo-guest");
  const now = new Date();
  const later = new Date(Date.now() + 86400000);
  const code = await demoTransport("codes", {
    propertyId: "demo-0",
    label: "Connected guest",
    staff: false,
    grants: [
      {
        doorId: "demo-0-0",
        start: new Date(Date.now() - 60000).toISOString(),
        end: later.toISOString(),
        active: true,
        singleUse: false,
      },
    ],
    breakfast: {
      total: 3,
      start: now.toISOString().slice(0, 10),
      end: later.toISOString().slice(0, 10),
    },
  });
  expect(code.link).toContain(encodeURIComponent(code.token));
  await demoTransport(
    "codes/" + code.id,
    { label: "Edited connected guest" },
    "PUT",
  );
  expect((await demoGuestRequest("", undefined, code.token)).label).toBe(
    "Edited connected guest",
  );
  const before = demoCafeTotals().today;
  await demoGuestRequest("/breakfast", { quantity: 1 }, code.token);
  expect(demoCafeTotals().today).toBe(before + 1);
  expect(
    (await demoGuestRequest("", undefined, code.token)).breakfastUsed,
  ).toBe(1);
  await demoTransport("codes/" + code.id + "/revoke", {});
  await expect(demoGuestRequest("", undefined, code.token)).rejects.toThrow(
    "revoked",
  );
});

test("simulated notifications populate unread counts and can be marked read", async () => {
  const { appendDemoNotification } =
    await import("../shared/demo-notifications");
  const before = (await demoTransport("events/unread")).total;
  const event = appendDemoNotification("demo-0", () => 0)!;
  expect((await demoTransport("events/unread")).total).toBe(before + 1);
  expect(
    (await demoTransport("events?propertyId=demo-0")).events.some(
      (e: any) => e.id === event.id,
    ),
  ).toBe(true);
  await demoTransport("events/read", { eventIds: [event.id] });
  expect((await demoTransport("events/unread")).total).toBe(before);
});
