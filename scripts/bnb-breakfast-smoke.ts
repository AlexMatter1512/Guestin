import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDate } from "../shared/schema";
const directory = mkdtempSync(join(tmpdir(), "guestin-bnb-breakfast-"));
const origin = "http://localhost:3089";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3089",
    ORIGIN: origin,
    DB_PATH: join(directory, "test.sqlite"),
    APP_KEY: "c".repeat(64),
    SETUP_TOKEN: "bnb-breakfast-setup",
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
  const host = await browser.newContext();
  const setup = await host.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      name: "Breakfast host",
      email: "breakfast@example.com",
      password: "breakfast-test-password",
      setupToken: "bnb-breakfast-setup",
    },
  });
  expect(setup.ok()).toBe(true);
  const { csrf } = await setup.json();
  async function create(path: string, data: unknown) {
    const response = await host.request.post(origin + "/api/v1/" + path, {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data,
    });
    if (!response.ok()) throw Error(path + ": " + (await response.text()));
    return response.json();
  }
  async function codes() {
    return (await host.request.get(origin + "/api/v1/codes")).json();
  }
  const property = await create("properties", {
    name: "Breakfast house",
    timezone: "Europe/Rome",
  });
  const today = localDate("Europe/Rome");
  const code = await create("codes", {
    propertyId: property.id,
    label: "Breakfast guest",
    grants: [],
    breakfast: { total: 3, start: today, end: today },
  });
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-GB",
  });
  const page = await guest.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/v1/guest/breakfast"))
      requests.push(r.url());
  });
  await page.goto(code.link + "&lang=en");
  await page.getByRole("link", { name: /Breakfast/ }).click();
  await expect(
    page.getByRole("heading", { name: "3 breakfasts available", exact: true }),
  ).toBeVisible();
  const increase = page.getByRole("button", {
    name: "Increase amount",
    exact: true,
  });
  const decrease = page.getByRole("button", {
    name: "Decrease amount",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "Select amount to use", exact: true }),
  ).toBeDisabled();
  await increase.click();
  await increase.click();
  await decrease.click();
  await expect(
    page.getByRole("button", { name: "Use 1 breakfasts", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(decrease).toBeDisabled();
  await page.getByRole("button", { name: "Max", exact: true }).click();
  await expect(increase).toBeDisabled();
  await page
    .getByRole("button", { name: "Use 3 breakfasts", exact: true })
    .click();
  let confirmation = page.getByRole("dialog", {
    name: "Confirm Use",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  expect(
    await confirmation.evaluate((dialog) => {
      const box = dialog.firstElementChild!.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }),
  ).toBe(true);
  await page.screenshot({
    path: join(directory, "breakfast-confirm.png"),
    fullPage: true,
  });
  expect(requests).toHaveLength(0);
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect((await codes())[0].breakfastUsed).toBe(0);
  expect(requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Use 3 breakfasts", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByText("✅ Used 3 breakfasts successfully", { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect((await codes())[0].breakfastUsed).toBe(3);
  await page.screenshot({
    path: join(directory, "breakfast-success.png"),
    fullPage: true,
  });
  await expect(
    page.getByText(
      "You have used all your available breakfast services for this stay.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 6000 });
  const tomorrow = new Date(Date.parse(today + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const future = await create("codes", {
    propertyId: property.id,
    label: "Future breakfast guest",
    grants: [],
    breakfast: { total: 2, start: tomorrow, end: tomorrow },
  });
  await page.goto(future.link + "&lang=en");
  await page.getByRole("link", { name: /Breakfast/ }).click();
  await expect(
    page.getByText("Breakfast usage is currently not available", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Increase amount", exact: true }),
  ).toHaveCount(0);
  const [y, m, d] = tomorrow.split("-");
  await expect(page.getByText(`${d}/${m}/${y}`, { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(directory, "breakfast-period.png"),
    fullPage: true,
  });
  console.log(
    "BnB breakfast smoke passed: exact selector/confirmation flow, no writes before confirmation/cancel, final-credit success, inclusive allowance dates and mobile layout. " +
      directory,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
