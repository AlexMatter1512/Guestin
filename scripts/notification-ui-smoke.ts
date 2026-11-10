import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "guestin-notification-ui-"));
const origin = "http://localhost:3109";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3109",
    ORIGIN: origin,
    DB_PATH: join(directory, "test.sqlite"),
    APP_KEY: "b".repeat(64),
    SETUP_TOKEN: "ui-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    LOG_FILE: "-",
  },
  stdout: "ignore",
  stderr: "pipe",
});
let browser;
try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const owner = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const staff = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const setup = await owner.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "ui-setup",
      name: "Owner",
      email: "owner@example.test",
      password: "fixture-password",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  async function api(
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
  ) {
    const response = await owner.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": auth.csrf },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  await api(
    "me/preferences",
    { language: "en", theme: "light", tour: "skipped" },
    "PATCH",
  );
  const invitation = await api("invites", {});
  const invite = new URL(invitation.link).hash.slice("#invite=".length);
  const joined = await staff.request.post(
    origin + "/api/v1/auth/accept-invite",
    {
      headers: { Origin: origin },
      data: {
        invite,
        name: "Staff",
        email: "staff@example.test",
        password: "fixture-password",
      },
    },
  );
  expect(joined.ok()).toBe(true);
  const staffAuth = await joined.json();
  await staff.request.patch(origin + "/api/v1/me/preferences", {
    headers: { Origin: origin, "X-CSRF-Token": staffAuth.csrf },
    data: { language: "en", theme: "light", tour: "skipped" },
  });
  const property = await api("properties", {
    name: "Only property",
    timezone: "UTC",
  });
  const draft = (label: string) => ({
    propertyId: property.id,
    label,
    grants: [],
  });
  await api("codes", draft("First arrival"));
  async function settleMotion(page: import("@playwright/test").Page) {
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  }
  const page = await owner.newPage(),
    secondDevice = await owner.newPage(),
    staffPage = await staff.newPage();
  const errors: string[] = [];
  for (const p of [page, secondDevice, staffPage]) {
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/host/#/codes");
    await expect(p.getByTestId("notification-badge")).toHaveText("1");
  }
  await expect(page.getByTestId("structure-title")).toHaveText("Only property");
  await expect(
    page.getByRole("combobox", { name: "Structure", exact: true }),
  ).toHaveCount(0);
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).toContain("user-scalable=no");
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).touchAction),
  ).toBe("pan-x pan-y");
  const guest = await owner.request.get(origin + "/guest/");
  expect(await guest.text()).toContain("user-scalable=no");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(page.locator(".notification-history")).toContainText(
    "First arrival",
  );
  await expect(page.getByTestId("notification-badge")).toHaveText("1");
  await page.locator("[data-notification-id]").click();
  await expect(page.getByTestId("notification-badge")).toHaveCount(0);
  await expect(secondDevice.getByTestId("notification-badge")).toHaveCount(0);
  await expect(staffPage.getByTestId("notification-badge")).toHaveText("1");
  const history = await api("events?pageSize=50");
  expect(history.events[0].readBy).toEqual([auth.user.id]);
  await page.goto(origin + "/host/#/settings/appearance");
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0a0a0a",
  );
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute(
    "content",
    "dark",
  );
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(10, 10, 10)");
  const darkManifest = await page.evaluate(async () =>
    (
      await fetch(
        document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href,
      )
    ).json(),
  );
  expect(darkManifest.theme_color).toBe("#0a0a0a");
  await settleMotion(page);
  await page.screenshot({ path: join(directory, "dark-mobile.png") });
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#ffffff",
  );
  await page.goto(origin + "/host/#/codes");
  await api("codes", draft("Live arrival"));
  await expect(page.getByTestId("notification-badge")).toHaveText("1");
  await expect(staffPage.getByTestId("notification-badge")).toHaveText("2");
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Live arrival" }),
  ).toBeVisible();
  await settleMotion(page);
  await page.screenshot({ path: join(directory, "sonner-badge-mobile.png") });
  await api("properties", { name: "Second property", timezone: "UTC" });
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Structure", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    `Notification/mobile UI checks passed. Screenshots: ${directory}`,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
