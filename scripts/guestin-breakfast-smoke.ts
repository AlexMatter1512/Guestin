import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDate } from "../shared/schema";
import { formatDate } from "../shared/date-format";
const directory = mkdtempSync(join(tmpdir(), "guestin-breakfast-live-"));
const origin = "http://localhost:3190";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3190",
    ORIGIN: origin,
    DB_PATH: join(directory, "fixture.sqlite"),
    APP_KEY: "a".repeat(64),
    SETUP_TOKEN: "test",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    LOG_FILE: "-",
  },
  stdout: "ignore",
  stderr: "ignore",
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
  const host = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  host.setDefaultTimeout(15000);
  const setup = await host.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      name: "Owner",
      email: "owner@example.test",
      password: "fixture-password",
      setupToken: "test",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  const api = async (
    path: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
    headers: Record<string, string> = {},
  ) => {
    const r = await host.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": auth.csrf, ...headers },
      data: body,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  await api("me/preferences", { language: "en", tour: "skipped" }, "PATCH");
  const property = await api("properties", {
    name: "Guestin breakfast house",
    timezone: "UTC",
  });
  const today = localDate("UTC"),
    month = today.slice(0, 7) + "-01";
  const code = await api("codes", {
    propertyId: property.id,
    label: "Breakfast guest",
    grants: [],
    breakfast: { total: 4, start: today, end: today },
  });
  const token = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
    "code",
  )!;
  const redeem = () =>
    api("guest/breakfast", { quantity: 1 }, "POST", {
      Authorization: "Bearer " + token,
      "Idempotency-Key": crypto.randomUUID(),
    });
  await redeem();
  const page = await host.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/#/codes");
  await expect(
    page
      .locator(".code-row")
      .filter({ hasText: "Breakfast guest" })
      .getByText("1/4", { exact: true }),
  ).toBeVisible();
  const guest = await host.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(code.link + "&lang=en");
  await expect(
    guest.getByText(new RegExp(formatDate(today).replaceAll("/", "\\/"))),
  ).toBeVisible();
  const viewer = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  viewer.setDefaultTimeout(15000);
  await viewer.addInitScript(() => {
    (window as any).permissionRequests = 0;
    (window as any).nativeNotifications = [];
    class FixtureNotification {
      static permission = "default";
      static async requestPermission() {
        (window as any).permissionRequests++;
        FixtureNotification.permission = "granted";
        return "granted";
      }
      constructor(title: string, options: any) {
        (window as any).nativeNotifications.push({ title, ...options });
      }
    }
    Object.defineProperty(window, "Notification", {
      value: FixtureNotification,
      configurable: true,
    });
  });
  const totals = await viewer.newPage();
  totals.on("pageerror", (e) => errors.push(e.message));
  await totals.goto(origin + `/breakfast/${property.id}?lang=it`);
  await expect(totals).toHaveURL(new RegExp(`/host/breakfast/${property.id}`));
  await expect(totals.locator("#today")).toHaveText("1");
  await expect(
    totals.getByText("Aggiornamenti in tempo reale attivi", { exact: true }),
  ).toBeVisible();
  expect(await totals.evaluate(() => (window as any).permissionRequests)).toBe(
    0,
  );
  await totals
    .getByRole("button", { name: "Attiva notifiche", exact: true })
    .click();
  expect(await totals.evaluate(() => (window as any).permissionRequests)).toBe(
    1,
  );
  await redeem();
  await expect(totals.locator("#today")).toHaveText("2", { timeout: 5000 });
  await expect
    .poll(() =>
      totals.evaluate(() => (window as any).nativeNotifications.length),
    )
    .toBe(1);
  await expect(totals.locator("#total")).toContainText("2");
  await totals
    .getByRole("button", { name: "Scegli intervallo date", exact: true })
    .click();
  await expect(totals.getByRole("grid")).toBeVisible();
  // Select one day, then the end of the same month-to-today range.
  await totals
    .locator(`[data-value="${month}"] [role="button"]`)
    .first()
    .click();
  await totals
    .locator(`[data-value="${today}"] [role="button"]`)
    .first()
    .click();
  await expect(totals.getByRole("grid")).toHaveCount(0);
  await expect(totals.locator("#total")).toContainText("2");
  await totals.screenshot({
    path: join(directory, "breakfast-italian-mobile.png"),
    fullPage: true,
  });
  await page.goto(origin + "/host/#/settings/appearance");
  await page
    .getByLabel("Date format · all apps", { exact: true })
    .selectOption("mm/dd/yyyy");
  await expect
    .poll(async () => (await api("public/settings")).dateFormat)
    .toBe("mm/dd/yyyy");
  await expect(
    totals.getByRole("button", { name: "Scegli intervallo date", exact: true }),
  ).toContainText(formatDate(today, "mm/dd/yyyy"));
  await guest.bringToFront();
  await guest.reload();
  await expect(
    guest.getByText(
      new RegExp(formatDate(today, "mm/dd/yyyy").replaceAll("/", "\\/")),
    ),
  ).toBeVisible();
  await page.goto(origin + `/host/#/codes/${code.id}/edit`);
  await expect(
    page.getByRole("switch", { name: "Include breakfast", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("First breakfast date", { exact: true }),
  ).toHaveValue(formatDate(today, "mm/dd/yyyy"));
  await page
    .getByLabel("First breakfast date", { exact: true })
    .fill(formatDate(today, "mm/dd/yyyy"));
  await page
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  expect(
    (await api("codes")).find((entry: any) => entry.id === code.id).breakfast
      .start,
  ).toBe(today);
  await totals
    .getByRole("button", { name: "Disattiva notifiche", exact: true })
    .click();
  await redeem();
  await expect(totals.locator("#today")).toHaveText("3", { timeout: 5000 });
  expect(
    await totals.evaluate(() => (window as any).nativeNotifications.length),
  ).toBe(1);
  await totals
    .getByRole("button", { name: "Passa all’inglese", exact: true })
    .click();
  await expect(
    totals.getByRole("heading", { name: "Used today", exact: true }),
  ).toBeVisible();
  await api(
    `properties/${property.id}/breakfast-settings`,
    { enabled: true, password: "private-breakfast" },
    "PUT",
  );
  await expect(
    totals.getByRole("heading", { name: "Password required", exact: true }),
  ).toBeVisible();
  await expect(totals.locator("#today")).toHaveCount(0);
  await totals
    .getByLabel("Breakfast page password", { exact: true })
    .fill("private-breakfast");
  await totals
    .getByRole("button", { name: "Open breakfast totals", exact: true })
    .click();
  await expect(totals.locator("#today")).toHaveText("3");
  await expect(
    totals.getByText("Live updates connected", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    `Guestin breakfast live updates, optional notifications, Italian, shadcn range picker, shared date formats and 1/4 breakfast badges passed. Screenshots: ${directory}`,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
