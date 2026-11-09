import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use a real HTTP (non-localhost) browser origin to reproduce phone capabilities.
// API data lives in a temporary database; clipboard calls are mocked to avoid
// overwriting the user's clipboard. No device request is made.
const dir = mkdtempSync(join(tmpdir(), "oshost-redesign-"));
const origin = "http://oshost-lan.test:3092";
const transport = "http://localhost:3092";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3092",
    ORIGIN: origin,
    DB_PATH: join(dir, "test.sqlite"),
    APP_KEY: "a".repeat(64),
    SETUP_TOKEN: "redesign-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(transport + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  const setup = await fetch(transport + "/api/v1/auth/setup", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Demo Host",
      email: "redesign@example.com",
      password: "redesign-password",
      setupToken: "redesign-setup",
    }),
  });
  if (!setup.ok) throw Error("Disposable setup failed");
  const auth = (await setup.json()) as any;
  const cookie = setup.headers.get("set-cookie")!.split(";")[0]!;
  const headers = {
    Origin: origin,
    "Content-Type": "application/json",
    Cookie: cookie,
    "X-CSRF-Token": auth.csrf,
  };
  async function api(
    path: string,
    data?: any,
    method = data === undefined ? "GET" : "POST",
  ) {
    const response = await fetch(transport + "/api/v1/" + path, {
      method,
      headers,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (!response.ok) throw Error(path + " failed with " + response.status);
    return response.json() as Promise<any>;
  }
  await api("me/preferences", { tour: "completed", language: "en" }, "PATCH");
  const property = await api("properties", {
    name: "Casa Aurora",
    timezone: "Europe/Rome",
  });
  const door = await api("doors", {
    propertyId: property.id,
    name: "Main entrance",
    integration: "none",
    config: {},
  });
  const code = await api("codes", {
    propertyId: property.id,
    label: "Clara Rossi",
    notes: "Arrival after 18:00",
    grants: [
      {
        doorId: door.id,
        start: new Date(Date.now() - 3600000).toISOString(),
        end: new Date(Date.now() + 172800000).toISOString(),
        singleUse: false,
      },
    ],
    breakfast: null,
  });
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--host-resolver-rules=MAP oshost-lan.test 127.0.0.1",
      "--no-proxy-server",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.addCookies([
    {
      name: "oshost_session",
      value: cookie.split("=").slice(1).join("="),
      domain: "oshost-lan.test",
      path: "/api/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await context.addInitScript(() => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value(command: string) {
        if ((window as any).denyCopy) return false;
        const field = document.activeElement as HTMLTextAreaElement;
        (window as any).copiedValue = field.value.slice(
          field.selectionStart,
          field.selectionEnd,
        );
        return command === "copy";
      },
    });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const nativeRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/capacitor:|ionic:|cordova:/i.test(request.url()))
      nativeRequests.push(request.url());
  });
  await page.goto(origin + "/host/");
  await expect(page.locator(".app-header h1")).toHaveText("Access codes");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof navigator.clipboard)).toBe(
    "undefined",
  );
  expect(await page.evaluate(() => typeof (window as any).Capacitor)).toBe(
    "undefined",
  );
  const row = page.locator(`[data-code-id="${code.id}"]`);
  await expect(row).toHaveClass(/code-row/);
  await expect(row.getByRole("button")).toHaveCount(3);
  await row.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    code.link,
  );
  await row.locator(".code-summary").click();
  await expect(page).toHaveURL(new RegExp("#/codes/" + code.id + "$"));
  const expectedToken = new URLSearchParams(
    new URL(code.link).hash.slice(1),
  ).get("code");
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    expectedToken,
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    code.link,
  );
  await expect(
    page.getByLabel("Access code value", { exact: true }),
  ).toHaveValue(expectedToken!);
  await expect(
    page.getByLabel("Guest link value", { exact: true }),
  ).toHaveValue(code.link);
  await page.evaluate(() => ((window as any).denyCopy = true));
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  const manual = page.getByRole("dialog", {
    name: "Copy manually",
    exact: true,
  });
  await expect(manual).toBeVisible();
  await expect(manual.getByLabel("Text to copy", { exact: true })).toHaveValue(
    expectedToken!,
  );
  await manual
    .getByRole("button", { name: "Select text", exact: true })
    .click();
  expect(
    await manual
      .getByLabel("Text to copy")
      .evaluate(
        (element: HTMLTextAreaElement) =>
          element.selectionEnd - element.selectionStart,
      ),
  ).toBe(expectedToken!.length);
  await page.screenshot({ path: join(dir, "manual-copy-mobile.png") });
  await manual.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.screenshot({ path: join(dir, "codes-mobile.png") });
  await page.locator('[data-tour="nav-settings"]').click();
  await expect(page.locator(".app-header h1")).toHaveText("Settings");
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Permanently wipe database",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await page.screenshot({
    path: join(dir, "settings-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Appearance Light, dark/ }).click();
  await expect(page).toHaveURL(/#\/settings\/appearance$/);
  await expect(
    page.getByRole("radiogroup", { name: "Theme", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: join(dir, "appearance-mobile.png") });
  await page.goBack();
  await expect(page.locator(".app-header h1")).toHaveText("Settings");
  await page.getByRole("button", { name: /^App language Italiano/ }).click();
  await expect(page).toHaveURL(/#\/settings\/language$/);
  await expect(
    page
      .getByRole("radiogroup", { name: "App language", exact: true })
      .getByRole("radio"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: /^Properties Names, timezones/ })
    .click();
  await expect(page).toHaveURL(/#\/settings\/properties$/);
  await expect(page.locator("main form")).toHaveCount(0);
  await page.getByRole("button", { name: /^Casa Aurora Europe/ }).click();
  await expect(page.locator('[data-tour="property-form"]')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp("#/settings/properties/" + property.id + "$"),
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/settings\/properties$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: join(dir, "settings-desktop-dark.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(nativeRequests).toEqual([]);
  console.log(
    "Redesign smoke passed: GuestIn-style compact lists/settings, isolated settings pages/history, exact code/link copying on HTTP LAN, manual fallback, mobile layout and no native runtime. Screenshots: " +
      dir,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
