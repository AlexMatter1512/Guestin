import { chromium, expect } from "@playwright/test";
async function replayTour(page: any) {
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="app-tour"]').click();
}
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "oshost-ui-"));
const origin = "http://localhost:3099";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3099",
    ORIGIN: origin,
    DB_PATH: join(dir, "test.sqlite"),
    APP_KEY: "b".repeat(64),
    SETUP_TOKEN: "browser-test-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/");
  await page.getByLabel("Your name").fill("Test Host");
  await page.getByLabel("Setup token").fill("browser-test-setup");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const languageChoice = page.getByRole("dialog", {
    name: /Choose your language/,
  });
  await expect(languageChoice).toBeVisible();
  await languageChoice
    .getByRole("radio", { name: "English", exact: true })
    .check();
  await languageChoice
    .getByRole("button", { name: "Continue / Continua", exact: true })
    .click();

  await page
    .getByRole("heading", { name: "Access codes", exact: true })
    .waitFor();
  const tour = page.getByRole("region", { name: "Guided setup" });
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading")).toHaveText(
    "Create your first property",
  );
  await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Access codes", exact: true }),
  ).toBeVisible();
  await expect(tour).not.toBeVisible();
  await replayTour(page);
  await expect(tour).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).not.toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('[data-tour="nav-properties"]').click();
  await page.locator('[data-tour="add-property"]').click();
  const propertyForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Add property", exact: true }),
  });
  await propertyForm.getByLabel("Name", { exact: true }).fill("Athena");
  await propertyForm
    .getByRole("button", { name: "Add property", exact: true })
    .click();
  await expect(page.locator(".property-switch select")).toHaveValue(/.+/);
  await expect(
    page.getByRole("heading", { name: "Add door", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Doors", exact: true }).click();
  await page.getByRole("button", { name: "Add door", exact: true }).click();
  const doorForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Add door", exact: true }),
  });
  await doorForm.getByLabel("Name", { exact: true }).fill("Entrance");
  await doorForm
    .getByRole("combobox", { name: "Integration", exact: true })
    .selectOption("ewelink");
  await doorForm.getByLabel("Common door").check();
  await doorForm.getByLabel("eWeLink webhook code").fill("fake-not-used");
  await doorForm.getByRole("button", { name: "Save door" }).click();
  await page.locator(".door-summary").filter({ hasText: "Entrance" }).waitFor();
  await page.getByRole("button", { name: "Codes", exact: true }).click();
  await page.getByRole("button", { name: "New code" }).click();
  await page.getByLabel("Guest name / label").fill("Maria Rossi");
  await page.getByLabel("Include breakfast").check();
  await page.getByLabel("Total breakfasts").fill("3");
  await page.getByRole("button", { name: "Save access code" }).click();
  await page
    .locator(".code-summary")
    .filter({ hasText: "Maria Rossi" })
    .waitFor();
  await page.screenshot({ path: join(dir, "host.png"), fullPage: true });
  const codes = await page.evaluate(
    async () => await (await fetch("/api/v1/codes")).json(),
  );
  const link = codes[0].link;
  const guest = await context.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(link);
  await guest.getByText("Maria Rossi", { exact: true }).waitFor();
  await guest.getByRole("link", { name: /Breakfast/ }).click();
  await guest
    .getByRole("button", { name: "Increase amount", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Use 1 breakfasts", exact: true })
    .click();
  await guest.getByRole("button", { name: "Confirm", exact: true }).click();
  await guest.getByText(/Used 1 breakfasts successfully/).waitFor();
  await guest.screenshot({ path: join(dir, "guest.png"), fullPage: true });
  const manifestHost = (await (
    await fetch(origin + "/host/manifest.webmanifest")
  ).json()) as any;
  const manifestGuest = (await (
    await fetch(origin + "/guest/manifest.webmanifest")
  ).json()) as any;
  expect(manifestHost.scope).toBe("/host/");
  expect(manifestGuest.scope).toBe("/guest/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await guest.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const scopes = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map(
      (r) => new URL(r.scope).pathname,
    ),
  );
  expect(scopes.sort()).toEqual(["/guest/", "/host/"]);
  await page.getByRole("button", { name: "New code" }).click();
  await page.getByLabel("Guest name / label").fill("Offline draft");
  await replayTour(page);
  await tour.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByLabel("Guest name / label")).toHaveValue(
    "Offline draft",
  );
  await page.waitForTimeout(200);
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Guest name / label").waitFor();
  await expect(page.getByLabel("Guest name / label")).toHaveValue(
    "Offline draft",
  );
  await context.setOffline(false);
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const phone = await mobile.newPage();
  await phone.goto(link);
  await phone.getByText("Maria Rossi", { exact: true }).waitFor();
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByLabel("Guest name / label").waitFor();
  await expect(tour).not.toBeVisible();
  await page.getByRole("button", { name: "Doors", exact: true }).click();
  await page.locator(".door-summary").filter({ hasText: "Entrance" }).waitFor();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: join(dir, "host-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /^App tour / }).click();
  await expect(tour).toBeVisible();
  await page.screenshot({ path: join(dir, "tour-mobile.png"), fullPage: true });
  await tour.getByRole("button", { name: "Skip tour" }).click();
  // Rasterize the authored SVG icon; no external image service needed.
  if (process.env.GENERATE_ICONS === "1") {
    const iconPage = await context.newPage();
    for (const size of [192, 512]) {
      await iconPage.setViewportSize({ width: size, height: size });
      await iconPage.goto(origin + "/host/icon.svg");
      await iconPage.evaluate((size) => {
        const svg = document.querySelector("svg")!;
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
      }, size);
      await iconPage
        .locator("svg")
        .screenshot({ path: `apps/host/static/icon-${size}.png` });
      await Bun.write(
        `apps/guest/static/icon-${size}.png`,
        Bun.file(`apps/host/static/icon-${size}.png`),
      );
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "Browser smoke passed: setup, property/door, manual code, guest breakfast, PWA scopes, offline draft, mobile layout. Screenshots: " +
      dir,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
