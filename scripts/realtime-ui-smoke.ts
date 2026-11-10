import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "oshost-realtime-"));
const origin = "http://localhost:3098";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3098",
    ORIGIN: origin,
    DB_PATH: join(directory, "test.sqlite"),
    APP_KEY: "c".repeat(64),
    SETUP_TOKEN: "realtime-setup",
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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  });
  const setup = await context.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "realtime-setup",
      name: "Alex",
      email: "alex@example.test",
      password: "realtime-password",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  const headers = { Origin: origin, "X-CSRF-Token": auth.csrf };
  async function api(path: string, data: unknown, method = "POST") {
    const response = await context.request.fetch(origin + "/api/v1/" + path, {
      headers,
      method,
      data,
    });
    expect(response.ok()).toBe(true);
    return await response.json();
  }
  await api("me/preferences", { language: "en", tour: "skipped" }, "PATCH");
  const property = await api("properties", {
    name: "Casa",
    timezone: "Europe/Rome",
  });
  const door = await api("doors", {
    propertyId: property.id,
    name: "Entrance",
    integration: "none",
    config: {},
  });
  const draft = (label: string) => ({
    propertyId: property.id,
    label,
    grants: [
      {
        doorId: door.id,
        start: "2026-11-10T12:00:00Z",
        end: "2026-11-12T10:00:00Z",
        singleUse: false,
      },
    ],
  });
  const baseline = await api("codes", draft("Baseline"));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/host/#/codes");
  await expect(page.locator(`[data-code-id="${baseline.id}"]`)).toBeVisible();
  const fresh = await api("codes", draft("Live arrival"));
  await expect(page.locator(`[data-code-id="${fresh.id}"]`)).toContainText(
    "Live arrival",
  );
  await expect(page.getByRole("status")).toContainText(
    "Alex created access code Live arrival valid from",
  );
  await api(`codes/${fresh.id}`, draft("Live renamed"), "PUT");
  await expect(page.locator(`[data-code-id="${fresh.id}"]`)).toContainText(
    "Live renamed",
  );
  await api(`codes/${fresh.id}/revoke`, {});
  await expect(page.locator(`[data-code-id="${fresh.id}"]`)).toContainText(
    "Revoked",
  );
  await page.goto(origin + `/host/#/activity/${property.id}`);
  await expect(page.locator(".notification-history")).toContainText(
    "Live arrival",
  );
  await api("codes", draft("History arrival"));
  await expect(page.locator(".notification-history")).toContainText(
    "Alex created access code History arrival valid from",
  );
  await page.screenshot({
    path: join(directory, "live-history.png"),
    fullPage: true,
  });
  await context.setOffline(true);
  await api("codes", draft("While disconnected"));
  await context.setOffline(false);
  await page.goto(origin + "/host/#/codes");
  await expect(page.locator(".code-list")).toContainText("While disconnected");
  await page.goto(origin + "/host/#/settings/notifications");
  await expect(
    page.getByText("Access code created", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save in-app preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "In-app preferences saved",
  );
  expect(errors).toEqual([]);
  console.log(
    `Realtime UI checks passed. Screenshot: ${directory}/live-history.png`,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
