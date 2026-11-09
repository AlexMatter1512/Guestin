import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, extname } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
const dir = mkdtempSync(join(tmpdir(), "oshost-connectors-")),
  origin = "http://localhost:3092";
const db = openDatabase(join(dir, "test.sqlite"));
const originalFetch = globalThis.fetch;
let providerState = "normal",
  geminiState = "normal";
const providerCalls: { path: string; body: any }[] = [];
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.hostname === "apiapp.krossbooking.com") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    providerCalls.push({ path: url.pathname + url.search, body });
    if (url.pathname.endsWith("/auth/get-token")) {
      // Match the proven krossApy defaults: unsupported mobile-profile fields
      // were the live-only cause of OTP rejection in the original client.
      expect(body).not.toHaveProperty("device_id");
      expect(body).not.toHaveProperty("deviceName");
      expect(body).not.toHaveProperty("deviceSystem");
      if (body["2fa_code"] && providerState === "otpRejected") {
        providerState = "normal";
        return Response.json(
          { error_code: 5, error_message: "Authentication failed" },
          { status: 401 },
        );
      }
      if (body["2fa_code"])
        return Response.json({
          auth_token: "fixture-secret-token",
          auth_token_expire: "2030-01-01",
        });
      if (body["2fa_type"]) return Response.json({ "2fa": true });
      return Response.json({
        "2fa": true,
        devices: [
          {
            "2fa_type": "email",
            "2fa_id": 7,
            "2fa_device": "g***@example.com",
          },
        ],
      });
    }
    if (providerState === "forbidden")
      return new Response("<h1>Forbidden</h1>", { status: 403 });
    if (providerState === "expired")
      return Response.json({ error: "expired" }, { status: 401 });
    if (url.pathname.endsWith("/properties/get-list"))
      return Response.json({
        data: {
          properties: [{ id_property: 42, name: "Kross fixture hotel" }],
        },
      });
    if (
      url.pathname.includes("/dashboard-arrivals") ||
      url.pathname.endsWith("/search-reservation")
    )
      return Response.json({
        data: [
          {
            id_reservation: 81 + (Number(body.page) || 0),
            label: Number(body.page) ? "Second guest" : "Fixture Guest",
            arrival: "2030-04-03",
            departure: "2030-04-05",
            name_room_type: '["Suite 1"]',
          },
        ],
        has_next_page: !Number(body.page),
      });
    if (url.pathname.endsWith("/get-reservation"))
      return Response.json({
        data: {
          reservation: {
            id_reservation: body.id_reservation,
            label: "Fixture Guest",
            arrival: "2030-04-03",
            departure: "2030-04-05",
            rooms: [{ number: "Suite 1" }],
            link_guest_portal: "https://example.com/checkin",
            link_check_in_instructions: "https://example.com/instructions",
          },
        },
      });
    throw Error("Unexpected fixture provider operation");
  }
  if (url.hostname === "generativelanguage.googleapis.com") {
    if (geminiState === "slow") await Bun.sleep(400);
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  geminiState === "malformed"
                    ? "not-json"
                    : JSON.stringify({
                        label: "Extracted Guest",
                        doors: ["Suite 1"],
                      }),
              },
            ],
          },
        },
      ],
    });
  }
  if (url.origin !== origin)
    throw Error("External request blocked by connector test");
  return originalFetch(input, init);
}) as typeof fetch;
const app = createApp(db, {
  key: "8".repeat(64),
  setupToken: "connector-fixture",
  origin,
  device: async () => {
    throw Error("No device actions allowed");
  },
});
app.get("*", async (c) => {
  const root = resolve("apps/host/build"),
    path = resolve(root, c.req.path.replace(/^\/host\/?/, ""));
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  let file = Bun.file(path);
  if (!(await file.exists()) || path === root) {
    if (extname(path)) return c.notFound();
    file = Bun.file(join(root, "200.html"));
  }
  return new Response(file);
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3092,
  fetch: app.fetch,
});
let browser;
try {
  const response = await fetch(origin + "/api/v1/auth/setup", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Connector Tester",
      email: "connector@example.com",
      password: "connector-password",
      setupToken: "connector-fixture",
    }),
  });
  const auth = (await response.json()) as any,
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  async function api(
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
  ) {
    const response = await fetch(origin + "/api/v1/" + path, {
      method,
      headers: {
        origin,
        cookie,
        "content-type": "application/json",
        "x-csrf-token": auth.csrf,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw Error(await response.text());
    return response.json() as Promise<any>;
  }
  await api("me/preferences", { language: "en", tour: "skipped" }, "PATCH");
  const property = await api("properties", {
    name: "Connector property",
    timezone: "Europe/Rome",
  });
  const door = await api("doors", {
    propertyId: property.id,
    name: "Suite 1",
    integration: "none",
    config: {},
    common: false,
    singleUse: false,
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addCookies([
    {
      name: "oshost_session",
      value: cookie.split("=")[1],
      domain: "localhost",
      path: "/api/",
    },
  ]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Connector page error:", e.message);
  });
  // Match phone testing: crypto.randomUUID may be missing on an HTTP LAN origin.
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto(origin + "/host/#/connectors/kross");
  await page.getByLabel("Hotel ID", { exact: true }).fill("hotel-fixture");
  await page.getByLabel("Username", { exact: true }).fill("fixture-user");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "Connect KrossBooking", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your identity", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send verification code", exact: true })
    .click();
  await page.getByLabel("Verification code", { exact: true }).fill("123456");
  providerState = "otpRejected";
  await page
    .getByRole("button", { name: "Verify and connect", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("newest code");

  await page
    .getByRole("button", { name: "Verify and connect", exact: true })
    .click();
  await expect(
    page.getByLabel("KrossBooking property", { exact: true }),
  ).toHaveValue("42");
  expect(
    new Set(
      providerCalls
        .filter((c) => c.path.includes("/auth/"))
        .map((c) => c.body.device_id),
    ).size,
  ).toBe(1);
  expect(providerCalls[1].body["2fa_id"]).toBe(7);
  expect(providerCalls[2].body["2fa_code"]).toBe("123456");
  expect(providerCalls[3].body.password).toBe("fixture-password");
  expect((await api("connections")).length).toBe(1);
  expect((await api("connections"))[0].data.authenticated).toBe(true);
  expect(JSON.stringify(await api("connections"))).not.toContain(
    "fixture-secret-token",
  );
  await page
    .getByRole("button", { name: "Find arrivals", exact: true })
    .click();
  await expect(page.getByText("Fixture Guest", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Second guest", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Search reservations", { exact: true }).fill("Fixture");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  expect(
    [...providerCalls]
      .reverse()
      .find((c) => c.path.endsWith("/search-reservation"))?.body.query,
  ).toBe("Fixture");
  await page
    .getByRole("button", { name: /Fixture Guest.*Review draft/ })
    .click();
  await expect(
    page.getByLabel("Guest name / label", { exact: true }),
  ).toHaveValue("Fixture Guest");
  await expect(
    page.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://example.com/checkin");
  expect((await api("codes")).length).toBe(0);
  await page.goto(origin + "/host/#/connectors/kross");
  await expect(
    page.getByLabel("KrossBooking property", { exact: true }),
  ).toHaveValue("42");
  await page.screenshot({ path: join(dir, "kross-mobile.png") });
  providerState = "forbidden";
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("403");
  expect((await api("connections"))[0].data.authenticated).toBe(true);
  providerState = "normal";
  await page
    .getByRole("button", { name: "Load properties", exact: true })
    .click();
  await expect(
    page.getByLabel("KrossBooking property", { exact: true }),
  ).toHaveValue("42");
  providerState = "expired";
  await page.reload();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  expect((await api("connections"))[0].data.authenticated).toBe(false);
  providerState = "normal";
  await page.goto(origin + "/host/#/connectors/ical");
  // Use relative dates so recurrence-window checks are independent of the test date.
  const start = new Date(Date.now() + 86400000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", ""),
    end = new Date(Date.now() + 3 * 86400000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
  await page.getByLabel("Calendar file (.ics)", { exact: true }).setInputFiles({
    name: "upcoming.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:upcoming\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:Calendar Guest\r\nEND:VEVENT\r\nEND:VCALENDAR`,
    ),
  });
  const calendarPreview = page.getByRole("button", {
    name: /Calendar Guest.*Review draft/,
  });
  await expect(calendarPreview).toBeVisible();
  await expect(calendarPreview).toBeDisabled();
  expect((await api("codes")).length).toBe(0);
  await page
    .getByLabel("Access door for these events", { exact: true })
    .selectOption(door.id);
  await expect(calendarPreview).toBeEnabled();
  await expect(page.getByText("upcoming.ics", { exact: true })).toBeVisible();
  await page
    .getByLabel("Access door for these events", { exact: true })
    .selectOption("");
  await expect(calendarPreview).toBeVisible();
  await expect(calendarPreview).toBeDisabled();
  await page
    .getByLabel("Access door for these events", { exact: true })
    .selectOption(door.id);
  await page
    .getByRole("button", { name: /Calendar Guest.*Review draft/ })
    .click();
  await expect(
    page.getByLabel("Guest name / label", { exact: true }),
  ).toHaveValue("Calendar Guest");
  await expect(
    page.getByRole("checkbox", { name: "Suite 1", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Valid from", { exact: true })).toHaveValue(
    `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T15:00`,
  );
  await expect(page.getByLabel("Valid until", { exact: true })).toHaveValue(
    `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T11:00`,
  );
  expect((await api("codes")).length).toBe(0);
  await page.goto(origin + "/host/#/connectors/gemini");
  await page.getByLabel("Gemini API key", { exact: true }).fill("fixture-key");
  await page
    .getByRole("button", { name: "Connect Gemini", exact: true })
    .click();
  await expect(page.getByLabel("Screenshot", { exact: true })).toBeVisible();
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await page
    .getByLabel("Screenshot", { exact: true })
    .setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: png });
  geminiState = "malformed";
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await api("codes")).length).toBe(0);
  geminiState = "normal";
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(
    page.getByText("Extracted Guest", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Extracted Guest", { exact: true })).toHaveCount(
    0,
  );
  expect((await api("codes")).length).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Connector UI smoke passed: HTTP-safe identity, automatic setup, 2FA, properties, search/pagination/details, persisted login, 403 retention/401 expiry, calendar upload, Gemini malformed/cancel, draft-only imports. " +
      dir,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
  globalThis.fetch = originalFetch;
}
