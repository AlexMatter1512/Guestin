import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, extname } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { websocket } from "../server/realtime";
import { formatDate } from "../shared/date-format";
const dir = mkdtempSync(join(tmpdir(), "guestin-connectors-")),
  origin = "http://localhost:3092";
const db = openDatabase(join(dir, "test.sqlite"));
const originalFetch = globalThis.fetch;
let providerState = "normal",
  aiState = "normal";
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
    if (url.pathname.endsWith("/app/get-planner")) {
      const start = body.date_start;
      const size = Number(body.days);
      const first = Date.parse(start + "T00:00:00Z");
      const dates = Array.from({ length: size }, (_, i) => {
        const date = new Date(first + i * 86400000);
        const iso = date.toISOString().slice(0, 10);
        return {
          timestamp: date.getTime() / 1000,
          date: iso.slice(8) + "/" + iso.slice(5, 7),
          w: date.toLocaleDateString("en", {
            weekday: "short",
            timeZone: "UTC",
          }),
        };
      });
      return Response.json({
        data: {
          result: true,
          start,
          end: new Date(first + size * 86400000).toISOString().slice(0, 10),
          start_timestamp: first / 1000,
          dates,
          rooms: [
            {
              id_room: 7,
              label_room: "Suite 1 [001]",
              number: "Suite 1",
              height: 1,
            },
            { id_room: 8, label_room: "Garden loft", number: "8", height: 1 },
          ],
          planner: {
            7: [
              {
                [dates[0].timestamp]: {
                  available: false,
                  id_reservation: 93,
                  reservation: "Planner Guest",
                  size: 4,
                  bg_color: "#314f67",
                  text_color: "#fff",
                },
              },
            ],
          },
        },
      });
    }
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
            label:
              body.id_reservation === 93 ? "Planner Guest" : "Fixture Guest",
            arrival: "2030-04-03",
            departure: "2030-04-05",
            rooms:
              body.id_reservation === 93
                ? [{ number: "1A" }, { number: "1B" }]
                : [{ number: "Suite 1" }],
            email: "fixture-guest@example.test",
            tel: "+39 000 000 000",
            notes: "Arrival by train",
            link_guest_portal: "https://example.com/checkin",
            link_check_in_instructions: "https://example.com/instructions",
          },
        },
      });
    throw Error("Unexpected fixture provider operation");
  }
  const aiHost = {
    "generativelanguage.googleapis.com": "google",
    "api.openai.com": "openai",
    "api.anthropic.com": "anthropic",
  }[url.hostname];
  if (aiHost) {
    const headers = new Headers(init?.headers);
    const prefix = aiHost === "google" ? "/v1beta/openai/" : "/v1/";
    if (url.pathname === prefix + "models") {
      const key =
        aiHost === "anthropic"
          ? headers.get("x-api-key")
          : headers.get("authorization")?.replace(/^Bearer /, "");
      if (key === "bad-token") return Response.json({}, { status: 401 });
      expect(key).toBe("fixture-key");
      expect(init?.method ?? "GET").toBe("GET");
      if (aiHost === "anthropic") {
        expect(headers.get("anthropic-version")).toBe("2023-06-01");
        return url.searchParams.get("after_id") === "claude-fixture"
          ? Response.json({
              data: [{ id: "claude-second", display_name: "Claude Second" }],
              has_more: false,
            })
          : Response.json({
              data: [{ id: "claude-fixture" }],
              has_more: true,
              last_id: "claude-fixture",
            });
      }
      return Response.json({
        data: [
          { id: aiHost === "google" ? "models/gemini-fixture" : "gpt-fixture" },
        ],
      });
    }
    expect(url.pathname).toBe(prefix + "chat/completions");
    expect(init?.method).toBe("POST");
    expect(headers.get("authorization")).toBe("Bearer fixture-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe(
      {
        google: "gemini-fixture",
        openai: "gpt-fixture",
        anthropic: "claude-second",
      }[aiHost],
    );
    expect(body.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) },
    });
    return Response.json({
      choices: [
        {
          message: {
            content:
              aiState === "malformed"
                ? "not-json"
                : JSON.stringify({
                    label: "Extracted Guest",
                    doors: ["Suite 1"],
                    ...(aiState === "complete"
                      ? {
                          start: "2030-04-03T13:00:00Z",
                          end: "2030-04-05T09:00:00Z",
                          breakfastTotal: 3,
                        }
                      : {}),
                  }),
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
  websocket,
  fetch: (request, server) => app.fetch(request, { server }),
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
    defaultCheckinLink: "https://example.com/default-checkin",
    defaultInstructionsLink: "https://example.com/default-instructions",
  });
  const door = await api("doors", {
    propertyId: property.id,
    name: "Suite 1",
    integration: "none",
    config: {},
    common: false,
    singleUse: false,
  });
  await api("doors", {
    propertyId: property.id,
    name: "Room 1A",
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
      name: "guestin_session",
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
  await page.goto(origin + "/host/#/connectors");
  await page
    .getByRole("button", { name: /^KrossBooking Find a reservation/ })
    .click();
  await expect(page).toHaveURL(/#\/connectors\/kross$/);
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
  await page.getByRole("button", { name: "Contact settings" }).click();
  await page.getByLabel("Contact name format").fill("{name} - {rooms}");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const planner = page.getByRole("region", {
    name: "Room planner",
    exact: true,
  });
  await expect(planner.getByText("Garden loft", { exact: true })).toBeVisible();
  const grid = planner.getByRole("region", { name: "Room availability by day" });
  expect(await grid.evaluate(element => {
    const card = element.closest('[data-slot="card"]')!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return Math.max(Math.abs(bounds.left - card.left), Math.abs(bounds.right - card.right));
  })).toBeLessThan(1);
  const today = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: property.timezone,
  }).format(new Date());
  const monthStart = today.slice(0, 7) + "-01";
  const nextMonth = new Date(monthStart + "T12:00:00Z");
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const nextMonthStart = nextMonth.toISOString().slice(0, 10);
  const lastPlannerCall = () =>
    providerCalls.filter((c) => c.path.includes("/app/get-planner")).at(-1)
      ?.body;
  expect(lastPlannerCall()).toMatchObject({
    id_property: 42,
    date_start: today,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await planner.getByRole("button", { name: "Next month" }).click();
  await expect.poll(() => lastPlannerCall()?.date_start).toBe(nextMonthStart);
  await planner.getByRole("button", { name: "Choose date range" }).click();
  const picker = page.getByRole("dialog", { name: "Choose date range" });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const theme = width === 390 ? "dark" : "light";
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(picker).toBeVisible();
    const calendar = picker.locator("[data-range-calendar-root]");
    await expect(calendar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(calendar).toHaveCSS("border-top-width", "1px");
    const radius = await calendar.evaluate(el => getComputedStyle(el).borderTopLeftRadius);
    expect(parseFloat(radius)).toBeGreaterThan(0);
    const start = calendar.locator("[data-bits-day][data-range-start]").first();
    const middle = calendar.locator("[data-bits-day][data-range-middle]").first();
    const startColor = await start.evaluate(el => getComputedStyle(el).backgroundColor);
    await expect(middle).not.toHaveCSS("background-color", startColor);
    await expect
      .poll(async () => {
        const rect = await picker.boundingBox();
        return (
          rect &&
          Math.max(
            Math.abs(rect.x + rect.width / 2 - width / 2),
            Math.abs(rect.y + rect.height / 2 - 422),
          )
        );
      })
      .toBeLessThan(2);
    await picker.screenshot({
      path: join(dir, `range-calendar-${theme}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const selectedDay = nextMonthStart.slice(0, 8) + "10";
  await picker
    .locator('[data-value="' + selectedDay + '"]')
    .getByRole("button")
    .click();
  await picker
    .locator('[data-value="' + nextMonthStart.slice(0, 8) + '14"]')
    .getByRole("button")
    .click();
  await expect(picker).toHaveCount(0);
  await expect
    .poll(lastPlannerCall)
    .toMatchObject({ date_start: selectedDay, days: 5 });
  await expect(
    planner.getByRole("button", { name: "Choose date range" }),
  ).toContainText("10");
  const bar = planner.getByRole("button", { name: /Planner Guest.*Suite 1/ });
  await expect(bar).toBeInViewport();
  await planner.screenshot({
    path: join(dir, "kross-room-planner-mobile.png"),
    animations: "disabled",
  });
  await bar.click();
  const imported = page.getByRole("dialog", {
    name: "Review imported details",
    exact: true,
  });
  await expect(imported).toContainText("Planner Guest");
  await expect(imported).toContainText("1A, 1B");
  await expect(imported).toContainText("Suite 1 [001]");
  await expect(imported.getByText("Suite 1", { exact: true })).toHaveCount(0);
  await expect(imported.getByText("Room 1A", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await imported.getByRole("button", { name: "Save contact" }).click();
  const exported = await download;
  const vcard = await Bun.file((await exported.path())!).text();
  expect(vcard).toContain("TEL;TYPE=CELL:+39 000 000 000");
  expect(vcard).toContain("FN:Planner Guest - 1A\\, 1B");
  expect(exported.suggestedFilename()).toBe("Planner Guest - 1A_ 1B.vcf");
  await expect(imported).toContainText("fixture-guest@example.test");
  await expect(imported).toContainText(formatDate("2030-04-03"));
  expect((await api("codes")).length).toBe(0);
  await imported.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/#\/connectors$/);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose favourite", exact: true })
    .click();
  const favouriteConnector = page.getByRole("combobox", {
    name: "Choose favourite connector",
  });
  await expect(favouriteConnector.locator("option")).toHaveText([
    "Connectors",
    "All connectors page",
    "KrossBooking",
  ]);
  await favouriteConnector.selectOption("connectors");
  await page.locator('[data-tour="nav-favourite"]').click();
  await expect(page).toHaveURL(/#\/connectors$/);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose favourite", exact: true })
    .click();
  await favouriteConnector.selectOption("connectors/kross");
  await page.reload();
  await expect(page.locator('[data-tour="nav-favourite"]')).toHaveText(
    "KrossBooking",
  );
  await page.getByRole("button", { name: /^Connectors/ }).click();
  await expect(page).toHaveURL(/#\/connectors$/);
  await page.locator('[data-tour="nav-favourite"]').click();
  await expect(page).toHaveURL(/#\/connectors\/kross$/);
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
  await expect(imported).toBeVisible();
  await expect(imported).toContainText("Source rooms");
  await expect(imported).toContainText("fixture-guest@example.test");
  await expect(imported).toContainText("Arrival by train");
  await expect(imported).toContainText("Suite 1");
  expect((await api("codes")).length).toBe(0);
  await imported.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByLabel("Guest name / label", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Fixture Guest.*Review draft/ })
    .click();
  await imported
    .getByRole("button", { name: "Use details in access code", exact: true })
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
  await expect(imported).toBeVisible();
  await expect(imported).toContainText("calendar end is exclusive");
  expect((await api("codes")).length).toBe(0);
  await imported
    .getByRole("button", { name: "Use details in access code", exact: true })
    .click();
  await expect(
    page.getByLabel("Guest name / label", { exact: true }),
  ).toHaveValue("Calendar Guest");
  await expect(
    page.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://example.com/default-checkin");
  await expect(
    page.getByRole("switch", { name: "Suite 1", exact: true }),
  ).toBeChecked();
  const calendarStart = start
    .replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
    .slice(0, 10);
  const calendarEnd = end
    .replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
    .slice(0, 10);
  await expect(
    page.getByRole("button", { name: "Valid from", exact: true }),
  ).toHaveText(formatDate(calendarStart));
  await expect(
    page.getByRole("button", { name: "Valid until", exact: true }),
  ).toHaveText(formatDate(calendarEnd));
  await expect(
    page.getByLabel("Valid from · Time", { exact: true }),
  ).toHaveValue("15:00");
  await expect(
    page.getByLabel("Valid until · Time", { exact: true }),
  ).toHaveValue("11:00");
  expect((await api("codes")).length).toBe(0);
  for (const [provider, model] of [
    ["google", "gemini-fixture"],
    ["openai", "gpt-fixture"],
  ]) {
    const result = await api("connections/ai-models", {
      provider,
      key: "fixture-key",
    });
    expect(result.models).toEqual([{ id: model, name: model }]);
    const saved = await api("connections", {
      propertyId: property.id,
      kind: "ai",
      name: provider,
      data: { provider, model },
      secret: { key: "fixture-key" },
    });
    expect(JSON.stringify(await api("connections"))).not.toContain(
      "fixture-key",
    );
    expect(
      JSON.parse(
        (
          db.query("SELECT data FROM connections WHERE id=?").get(saved.id) as {
            data: string;
          }
        ).data,
      ),
    ).toEqual({ provider, model });
    expect(
      (
        db.query("SELECT secret FROM connections WHERE id=?").get(saved.id) as {
          secret: string;
        }
      ).secret,
    ).not.toContain("fixture-key");
    expect(
      (
        await api(`connections/${saved.id}/request`, {
          image: "aW1hZ2U=",
          mime: "image/jpeg",
          prompt: "Read the fixture",
        })
      ).text,
    ).toContain("Extracted Guest");
    await api(`connections/${saved.id}`, undefined, "DELETE");
  }

  const legacy = await api("connections", {
    propertyId: property.id,
    kind: "gemini",
    name: "AI",
    data: { model: "gemini-fixture" },
    secret: { key: "fixture-key" },
  });
  await page.goto(origin + "/host/#/connectors/gemini");
  await page.reload();
  await expect(page).toHaveURL(/#\/connectors\/ai$/);
  await expect(
    page.getByText("Google (Gemini) · gemini-fixture"),
  ).toBeVisible();
  expect(
    (
      await api(`connections/${legacy.id}/request`, {
        image: "aW1hZ2U=",
        mime: "image/jpeg",
        prompt: "Read the fixture",
      })
    ).text,
  ).toContain("Extracted Guest");
  await api(`connections/${legacy.id}`, undefined, "DELETE");

  await page.goto(origin + "/host/#/connectors");
  await page.reload();
  await page.getByRole("button", { name: /^AI Read guest details/ }).click();
  await expect(page).toHaveURL(/#\/connectors\/ai$/);
  const provider = page.getByLabel("Provider", { exact: true });
  const token = page.getByLabel("API token", { exact: true });
  const model = page.getByLabel("Model", { exact: true });
  const fetchModels = page.getByRole("button", {
    name: "Fetch models",
    exact: true,
  });
  await provider.selectOption("openai");
  await token.fill("bad-token");
  await fetchModels.click();
  await expect(page.getByRole("alert")).toContainText("rejected the token");
  await token.fill("fixture-key");
  await fetchModels.click();
  await expect(model.locator("option")).toHaveText([
    "Choose a model",
    "gpt-fixture",
  ]);
  await model.selectOption("gpt-fixture");
  await provider.selectOption("anthropic");
  await expect(model).toHaveCount(0);
  await fetchModels.click();
  await expect(model.locator("option")).toHaveCount(3);
  await model.selectOption("claude-second");
  await page.screenshot({ path: join(dir, "ai-model-selection.png") });
  await page.getByRole("button", { name: "Connect AI", exact: true }).click();
  await expect(page.getByLabel("Screenshot", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Anthropic (Claude) · claude-second"),
  ).toBeVisible();
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
  aiState = "malformed";
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await api("codes")).length).toBe(0);
  aiState = "normal";
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(
    page.getByText("Extracted Guest", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(imported).toBeVisible();
  await expect(imported).toContainText("Source image");
  await expect(imported).toContainText(
    "No doors could be mapped with valid dates",
  );
  await imported.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Extracted Guest", { exact: true })).toHaveCount(
    0,
  );
  expect((await api("codes")).length).toBe(0);
  aiState = "complete";
  await page
    .getByLabel("Screenshot", { exact: true })
    .setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: png });
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(imported).toContainText(formatDate("2030-04-04"));
  await imported
    .getByRole("button", { name: "Use details in access code", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Include breakfast", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "First breakfast date", exact: true }),
  ).toHaveText(formatDate("2030-04-04"));
  await expect(
    page.getByLabel("Total breakfasts", { exact: true }),
  ).toHaveValue("3");
  expect((await api("codes")).length).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Connector UI smoke passed: HTTP-safe identity, automatic setup, 2FA, properties, search/pagination/details, persisted login, 403 retention/401 expiry, calendar upload, live model selection and image extraction for all three AI providers, draft-only imports. " +
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
