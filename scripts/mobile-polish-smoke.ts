import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, extname } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { localDate } from "../shared/schema";

// Isolated SQLite, fake device acceptance and no push delivery.
const directory = mkdtempSync(join(tmpdir(), "oshost-mobile-polish-"));
const origin = "http://localhost:3110",
  db = openDatabase(join(directory, "test.sqlite"));
let deviceCalls = 0;
const app = createApp(db, {
  key: "d".repeat(64),
  setupToken: "polish-setup",
  origin,
  device: async () => {
    deviceCalls++;
    return {
      status: "accepted",
      detail:
        "Provider accepted the unlock request; physical state is not confirmed",
    };
  },
});
app.get("*", async (c) => {
  const guest = c.req.path.startsWith("/guest/"),
    prefix = guest ? "/guest/" : "/host/";
  const root = resolve(guest ? "apps/guest/build" : "apps/host/build");
  const path = resolve(root, c.req.path.slice(prefix.length));
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
  port: 3110,
  fetch: app.fetch,
});
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const host = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const setup = await host.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      name: "Demo Host",
      email: "demo@example.test",
      password: "polish-password",
      setupToken: "polish-setup",
    },
  });
  const auth = await setup.json();
  async function api(
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
  ) {
    const r = await host.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": auth.csrf },
      data,
    });
    if (!r.ok()) throw Error(path + ": " + (await r.text()));
    return r.json();
  }
  await api(
    "me/preferences",
    { language: "en", theme: "light", tour: "completed" },
    "PATCH",
  );
  const property = await api("properties", {
    name: "Casa Aurora",
    timezone: "Europe/Rome",
  });
  const entrance = await api("doors", {
    propertyId: property.id,
    name: "Main entrance",
    integration: "ewelink",
    config: { webhook_code: "fixture-only" },
    common: true,
  });
  const room = await api("doors", {
    propertyId: property.id,
    name: "Suite 1",
    integration: "none",
    config: {},
  });
  const today = localDate("Europe/Rome"),
    future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const payload = {
    propertyId: property.id,
    grants: [
      {
        doorId: entrance.id,
        start: new Date(Date.now() - 60000).toISOString(),
        end: new Date(Date.now() + 86400000).toISOString(),
        singleUse: false,
      },
    ],
    breakfast: { total: 4, start: today, end: today },
  };
  const first = await api("codes", { ...payload, label: "Elena Rossi" });
  const second = await api("codes", { ...payload, label: "Jamie Taylor" });
  await api("codes", {
    ...payload,
    label: "Future guest",
    grants: [
      {
        doorId: entrance.id,
        start: future + "T12:00:00Z",
        end: future + "T15:00:00Z",
        singleUse: false,
      },
    ],
    breakfast: null,
  });
  const page = await host.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/");
  await expect(page.locator(".code-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "New code", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "All dates", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Search codes", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".date-picker-trigger")).toContainText(
    String(new Date(today + "T12:00:00Z").getUTCDate()),
  );
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.locator(".date-picker-trigger").click();
    const calendar = page.locator('[data-slot="popover-content"]');
    await expect(calendar).toBeVisible();
    const bounds = (await calendar.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const firstRow = page.locator(`[data-code-id="${first.id}"]`);
  await expect(
    firstRow.getByLabel("Successful requests: 0", { exact: true }),
  ).toBeVisible();
  const popupEvent = page.waitForEvent("popup");
  await firstRow.getByRole("link", { name: "Open link", exact: true }).click();
  const popup = await popupEvent;
  await expect(popup).toHaveURL(first.link);
  await popup.close();
  await page.getByRole("button", { name: "Search codes", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search codes", exact: true })
    .fill("Jamie");
  await page.keyboard.press("Escape");
  await expect(page.locator(".code-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Search codes", exact: true }).click();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator(".date-picker-trigger").click();
  const day = (date: string) =>
    page.locator(`[data-value="${date}"] [data-bits-day]`).first();
  await expect(day(today).locator("[data-code-dot]")).toBeVisible();
  // Future date may be in next month. Navigate via the calendar's own next-month control.
  while (!(await day(future).count()))
    await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(day(future).locator("[data-code-dot]")).toBeVisible();
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: join(directory, "host-calendar-mobile.png") });
  await day(future).click();
  await expect(page.locator(".code-row")).toHaveCount(1);
  await expect(page.locator(".code-row")).toContainText("Future guest");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".code-row")).toHaveCount(2);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: join(directory, "host-codes-mobile.png") });
  await firstRow.locator(".code-summary").click();
  await expect(
    page.getByRole("heading", { name: "Elena Rossi", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".code-detail [data-slot=card]")).toHaveCount(0);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({
    path: join(directory, "host-code-detail-mobile.png"),
  });
  await page.locator('[data-tour="nav-doors"]').click();
  await expect(
    page.getByRole("button", { name: "Add door", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reorder doors", exact: true })
    .click();
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  const handle = page.getByRole("button", {
    name: "Drag to reorder: Suite 1",
    exact: true,
  });
  const from = (await handle.boundingBox())!,
    target = (await page
      .locator(`[data-door-order="${entrance.id}"]`)
      .boundingBox())!;
  const cdp = await host.newCDPSession(page),
    x = from.x + from.width / 2,
    y = from.y + from.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((target.y + target.height / 3 - y) * i) / 8 }],
    });
    await page.waitForTimeout(25);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".door-list > li").first()).toContainText(
    "Suite 1",
  );
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await page.reload();
  await expect(page.locator(".door-list > li").first()).toContainText(
    "Suite 1",
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path: join(directory, "host-doors-mobile.png") });
  // URL-only sessions, including navigation, language switches, reload and a second tab with no token.
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const gp = await guest.newPage();
  gp.on("pageerror", (e) => errors.push(e.message));
  await gp.goto(first.link + "&lang=en");
  await expect(gp.getByText("Elena Rossi", { exact: true })).toBeVisible();
  const token = new URL(first.link).hash.slice(6);
  await gp.getByRole("link", { name: /Breakfast/ }).click();
  expect(new URLSearchParams(new URL(gp.url()).hash.slice(1)).get("code")).toBe(
    token,
  );
  await gp
    .getByRole("button", { name: "Select language", exact: true })
    .click();
  await gp.getByRole("button", { name: "Switch to it", exact: true }).click();
  await gp.reload();
  await expect(gp.getByText("Elena Rossi", { exact: true })).toBeVisible();
  expect(gp.url()).toContain("code=" + token);
  const storage = await gp.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(storage)).not.toContain(token);
  expect(Object.keys(storage.local)).toEqual(["oshost.guest.visit"]);
  expect(
    Object.keys(JSON.parse(storage.local["oshost.guest.visit"])).sort(),
  ).toEqual(["date", "label"]);
  await gp.goto(origin + "/guest/#code=wrong-browser-test&lang=it");
  await expect(
    gp.getByText("Il codice non è valido o è scaduto.", { exact: true }),
  ).toBeVisible();
  // Host history shares Italian translations and code names. Invalid page loads include prior-visit hints.
  await api("me/preferences", { language: "it" }, "PATCH");
  await page.reload();
  await page.getByRole("button", { name: "Notifiche", exact: true }).click();
  await expect(page.locator(".notification-history")).toContainText(
    "Tentativo con codice non valido",
  );
  await expect(page.locator(".notification-history")).toContainText(
    "Elena Rossi",
  );
  await expect(page.locator(".notification-history")).toContainText(
    "non verificata",
  );
  await expect(page.locator(".notification-history")).not.toContainText(
    "Access code created",
  );
  await expect(page.locator(".notification-history")).toContainText(
    "Elena Rossi · Codice di accesso creato",
  );
  // Removing the fragment cannot reuse a token from an earlier valid session.
  await gp.goto(first.link + "&lang=en");
  await expect(gp.getByText("Elena Rossi", { exact: true })).toBeVisible();
  await gp.evaluate(() => {
    location.hash = "code=" + "bad-after-change";
  });
  await expect(
    gp.getByText("The code is invalid or expired.", { exact: true }),
  ).toBeVisible();
  await gp.goto(origin + "/guest/?lang=en");
  await expect(
    gp.getByText("The code is invalid or expired.", { exact: true }),
  ).toBeVisible();
  // Legacy session credentials must be erased, and cannot rescue a URL without a token.
  await gp.evaluate((token) => {
    sessionStorage.setItem("oshost.guest.code", token);
    sessionStorage.setItem(
      "oshost.breakfast.pending",
      JSON.stringify({ code: token, quantity: 1, id: "legacy" }),
    );
  }, token);
  await gp.reload();
  await expect(
    gp.getByText("The code is invalid or expired.", { exact: true }),
  ).toBeVisible();
  expect(
    await gp.evaluate(() => JSON.stringify({ ...sessionStorage })),
  ).not.toContain(token);
  // An old response must not restore an earlier code after the URL changes.
  let release!: () => void, sawRequest!: () => void, completed!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (sawRequest = r)),
    fulfilled = new Promise<void>((r) => (completed = r));
  await gp.route("**/api/v1/guest", async (route) => {
    if (route.request().headers().authorization === "Bearer " + token) {
      const response = await route.fetch();
      sawRequest();
      await held;
      await route.fulfill({ response });
      completed();
    } else await route.continue();
  });
  await gp.goto(first.link + "&lang=en");
  await requested;
  await gp.evaluate(() => {
    location.hash = "code=race-invalid";
  });
  await expect(
    gp.getByText("The code is invalid or expired.", { exact: true }),
  ).toBeVisible();
  release();
  await fulfilled;
  await gp.waitForTimeout(100);
  await expect(gp.getByText("Elena Rossi", { exact: true })).toHaveCount(0);
  await gp.unroute("**/api/v1/guest");
  // Exercise a fake adapter only, then verify the successful-request counter.
  const accepted = await guest.request.post(
    origin + `/api/v1/guest/doors/${entrance.id}/open`,
    {
      headers: {
        Origin: origin,
        Authorization: "Bearer " + token,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: {},
    },
  );
  expect(accepted.ok()).toBe(true);
  await api("me/preferences", { language: "en" }, "PATCH");
  await page.goto(origin + "/host/");
  await expect(
    page
      .locator(`[data-code-id="${first.id}"]`)
      .getByLabel("Successful requests: 1", { exact: true }),
  ).toBeVisible();
  expect(deviceCalls).toBe(1);
  expect(errors).toEqual([]);
  console.log(
    "PASS mobile controls, marked calendar, touch sorting, code details, translated history and URL-only guest sessions. Screenshots: " +
      directory,
  );
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
