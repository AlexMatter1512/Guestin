import { chromium, expect } from "@playwright/test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "oshost-structures-")),
  origin = "http://localhost:3097",
  path = join(directory, "test.sqlite");
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3097",
    ORIGIN: origin,
    DB_PATH: path,
    APP_KEY: "f".repeat(64),
    SETUP_TOKEN: "structure-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    LOG_FILE: "-",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const setup = await context.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "structure-setup",
      name: "Demo Host",
      email: "structure@fixture.test",
      password: "structure-password",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  async function api(
    route: string,
    data?: any,
    method = data === undefined ? "GET" : "POST",
  ) {
    const r = await context.request.fetch(origin + "/api/v1/" + route, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": auth.csrf },
      data,
    });
    if (!r.ok()) throw Error(route + " failed " + r.status());
    return r.json();
  }
  await api(
    "me/preferences",
    { language: "en", tour: "completed", theme: "light" },
    "PATCH",
  );
  const one = await api("properties", {
      name: "Casa Aurora",
      timezone: "Europe/Rome",
    }),
    two = await api("properties", { name: "Garden House", timezone: "UTC" });
  const door = await api("doors", {
    propertyId: one.id,
    name: "Main entrance",
    integration: "none",
    config: {},
    common: true,
  });
  const breakfastDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const code = await api("codes", {
    propertyId: one.id,
    label: "Example guest",
    breakfast: { total: 12, start: breakfastDay, end: breakfastDay },
    grants: [
      {
        doorId: door.id,
        start: new Date(Date.now() - 60000).toISOString(),
        end: new Date(Date.now() + 86400000).toISOString(),
        singleUse: false,
      },
    ],
  });
  const db = new Database(path);
  for (let i = 0; i < 55; i++)
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      crypto.randomUUID(),
      one.id,
      null,
      "access.accepted",
      "Shared fixture history " + i,
      new Date(Date.now() - i * 1000).toISOString(),
    );
  db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
    crypto.randomUUID(),
    two.id,
    null,
    "access.accepted",
    "Garden-only history",
    new Date().toISOString(),
  );
  db.close();
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/browser-fixture",
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "fixture-key", auth: "fixture-auth" },
        };
      },
      unsubscribe: async () => true,
    };
    const registration = {
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async () => subscription,
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: async () => registration,
        ready: Promise.resolve(registration),
        register: async () => registration,
      },
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "granted",
        requestPermission: async () => "granted",
      },
    });
  });
  // Mock only push registration: no subscription jobs or external delivery are created.
  const pushRequests: any[] = [];
  await page.route("**/api/v1/push/subscriptions", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    pushRequests.push({
      method: route.request().method(),
      ...route.request().postDataJSON(),
    });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(origin + "/host/");
  const structure = page.getByRole("combobox", {
    name: "Structure",
    exact: true,
  });
  await expect(structure).toHaveValue(one.id);
  await expect(page.locator(".page-heading h1")).toHaveText("Access codes");
  await expect(page.locator(".app-header h1")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Take the app tour", exact: true }),
  ).toHaveCount(0);
  const selectorBox = await structure.boundingBox(),
    bell = page.getByRole("button", { name: "Notifications", exact: true }),
    bellBox = await bell.boundingBox();
  expect(selectorBox!.x + selectorBox!.width).toBeLessThanOrEqual(
    bellBox!.x + 1,
  );
  expect(bellBox!.x - selectorBox!.x - selectorBox!.width).toBeLessThan(28);
  await bell.click();
  await expect(page.locator(".page-heading h1")).toHaveText("Notifications");
  await expect(
    page.locator(".notification-history [data-slot=card]"),
  ).toHaveCount(50);
  await page
    .getByRole("button", { name: "Load older notifications", exact: true })
    .click();
  await expect(
    page.locator(".notification-history [data-slot=card]"),
  ).toHaveCount(56);
  await structure.selectOption(two.id);
  await expect(
    page.locator(".notification-history [data-slot=card]"),
  ).toHaveCount(1);
  await expect(
    page.getByText("Garden-only history", { exact: true }),
  ).toBeVisible();
  await structure.selectOption(one.id);
  await page.locator('[data-tour="nav-reports"]').click();
  await expect(page.locator(".page-heading h1")).toHaveText("Statistics");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator('[data-tour="nav-settings"]')).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="nav-notifications"]').click();
  await expect(
    page.getByLabel("Keep notifications for (months)", { exact: true }),
  ).toHaveValue("3");
  await page
    .getByLabel("Keep notifications for (months)", { exact: true })
    .fill("6");
  await page
    .getByRole("button", { name: "Save retention", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "All structures", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Garden House", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "All activity types", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Access accepted", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Enable / update notifications", exact: true })
    .click();
  await expect.poll(() => pushRequests.length).toBe(1);
  expect(pushRequests[0].properties).toEqual([two.id]);
  expect(pushRequests[0].events).toEqual(["access.accepted"]);
  await page.reload();
  await expect(page.getByLabel("Keep notifications for (months)")).toHaveValue(
    "6",
  );
  await expect(
    page.getByRole("checkbox", { name: "Garden House", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Access accepted", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Disable notifications", exact: true })
    .click();
  await expect.poll(() => pushRequests.length).toBe(2);
  expect(pushRequests[1].method).toBe("DELETE");
  expect(pushRequests[1].endpoint).toContain("browser-fixture");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-tour="nav-breakfast"]').click();
  await expect(
    page.getByRole("link", { name: "Open breakfast page", exact: true }),
  ).toHaveAttribute("href", "/breakfast/" + one.id);
  await page
    .getByRole("switch", { name: "Require a password", exact: true })
    .check();
  await page
    .getByLabel("Breakfast page password", { exact: true })
    .fill("cafe-password");
  await page
    .getByRole("button", { name: "Save breakfast settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  const cafe = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    breakfast = await cafe.newPage();
  await breakfast.goto(origin + "/breakfast/" + one.id);
  await expect(
    breakfast.getByLabel("Breakfast page password", { exact: true }),
  ).toBeVisible();
  await expect(breakfast.locator("#totals")).toBeHidden();
  await breakfast
    .getByLabel("Breakfast page password", { exact: true })
    .fill("incorrect");
  await breakfast
    .getByRole("button", { name: "Open breakfast totals", exact: true })
    .click();
  await expect(
    breakfast.getByText("Incorrect password", { exact: true }),
  ).toBeVisible();
  await breakfast
    .getByLabel("Breakfast page password", { exact: true })
    .fill("cafe-password");
  await breakfast
    .getByRole("button", { name: "Open breakfast totals", exact: true })
    .click();
  await expect(breakfast.locator("#totals")).toBeVisible();
  await expect(
    breakfast.getByRole("heading", { name: "Breakfasts used", exact: true }),
  ).toBeVisible();
  await expect(breakfast.locator("#today")).toHaveText("0");
  const redeemed = await context.request.post(
    origin + "/api/v1/guest/breakfast",
    {
      headers: {
        Origin: origin,
        Authorization:
          "Bearer " +
          new URLSearchParams(new URL(code.link).hash.slice(1)).get("code"),
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { quantity: 2 },
    },
  );
  expect(redeemed.ok()).toBe(true);
  await breakfast.reload();
  await expect(breakfast.locator("#today")).toHaveText("2");
  await expect(breakfast.locator("#month")).toHaveText("2");
  const [hostBreakfast] = await Promise.all([
    context.waitForEvent("page"),
    page
      .getByRole("link", { name: "Open breakfast page", exact: true })
      .click(),
  ]);
  await expect(hostBreakfast.locator("#totals")).toBeVisible();
  await hostBreakfast.close();
  await page
    .getByLabel("New password (leave empty to keep it)", { exact: true })
    .fill("new-cafe-password");
  await page
    .getByRole("button", { name: "Save breakfast settings", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        ((await api("properties")) as any[]).find((p) => p.id === one.id)
          .breakfastProtected,
    )
    .toBe(true);
  // Wait for server confirmation before reopening the cafe session.
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await breakfast.reload();
  await expect(breakfast.locator("#unlock")).toBeVisible();
  await page
    .getByRole("switch", { name: "Require a password", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save breakfast settings", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        ((await api("properties")) as any[]).find((p) => p.id === one.id)
          .breakfastProtected,
    )
    .toBe(false);
  await breakfast.reload();
  await expect(breakfast.locator("#totals")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // A late save for one structure must not clear a draft for another.
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const intercepted = new Promise<void>((resolve) => (started = resolve));
  await page.route(
    "**/api/v1/properties/" + one.id + "/breakfast-settings",
    async (route) => {
      const response = await route.fetch();
      started();
      await held;
      await route.fulfill({ response });
    },
  );
  await page
    .getByRole("switch", { name: "Require a password", exact: true })
    .check();
  await page
    .getByLabel("Breakfast page password", { exact: true })
    .fill("first-structure-password");
  await page
    .getByRole("button", { name: "Save breakfast settings", exact: true })
    .click();
  await intercepted;
  await structure.selectOption(two.id);
  await expect(
    page.getByRole("switch", { name: "Require a password", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("switch", { name: "Require a password", exact: true })
    .check();
  await page
    .getByLabel("Breakfast page password", { exact: true })
    .fill("second-structure-draft");
  release();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByLabel("Breakfast page password", { exact: true }),
  ).toHaveValue("second-structure-draft");
  await expect(page.getByText("Settings saved.", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Save breakfast settings", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        ((await api("properties")) as any[]).find((p) => p.id === two.id)
          .breakfastProtected,
    )
    .toBe(true);
  expect(errors).toEqual([]);
  await cafe.close();
  console.log(
    "Structure selector/header, shared paged history, stats navigation, local push filters, retention and protected breakfast browser flow passed. " +
      directory,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
