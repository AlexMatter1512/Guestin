import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3112";
const directory = mkdtempSync(join(tmpdir(), "oshost-staff-ui-"));
const db = openDatabase(":memory:");
let calls = 0;
const app = createApp(db, {
  origin,
  key: "b".repeat(64),
  setupToken: "staff-ui",
  device: async () => {
    calls++;
    return { status: "accepted", detail: "Fixture accepted" };
  },
});
app.get("*", async (c) => {
  const name = c.req.path.startsWith("/guest/") ? "guest" : "host";
  const root = resolve("apps", name, "build"),
    path = resolve(root, c.req.path.slice(name.length + 2));
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  let file = Bun.file(path);
  if (path === root || !(await file.exists())) {
    if (extname(path)) return c.notFound();
    file = Bun.file(join(root, "200.html"));
  }
  return new Response(file);
});
const server = Bun.serve({
  port: 3112,
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, server) =>
    app.fetch(request, { server, clientIP: "127.0.0.1" }),
});
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const response = await context.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "staff-ui",
      name: "Owner",
      email: "owner@example.test",
      password: "fixture-password",
    },
  });
  expect(response.ok()).toBe(true);
  const auth = await response.json();
  async function api(
    path: string,
    data?: unknown,
    method = data === undefined ? "GET" : "POST",
  ) {
    const r = await context.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": auth.csrf },
      data,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  }
  await api("me/preferences", { language: "en", tour: "skipped" }, "PATCH");
  const property = await api("properties", {
    name: "Staff house",
    timezone: "UTC",
  });
  const door = await api("doors", {
    propertyId: property.id,
    name: "Entrance",
    common: true,
    integration: "ewelink",
    config: { webhook_code: "fixture-only" },
  });
  const grant = { doorId: door.id, singleUse: false };
  const guestDraft = {
    propertyId: property.id,
    grants: [
      {
        ...grant,
        start: new Date(Date.now() - 60000).toISOString(),
        end: new Date(Date.now() + 86400000).toISOString(),
      },
    ],
  };
  const active = await api("codes", { ...guestDraft, label: "Guest active" });
  const revoked = await api("codes", { ...guestDraft, label: "Guest revoked" });
  await api(`codes/${revoked.id}/revoke`, {});
  const cleaner = await api("codes", {
    propertyId: property.id,
    staff: true,
    label: "Cleaner",
    grants: [grant],
  });
  const laundry = await api("codes", {
    propertyId: property.id,
    staff: true,
    label: "Laundry",
    grants: [grant],
  });
  await api(`codes/${laundry.id}/revoke`, {});
  // Deliberately dated in the past: the staff flag must control both UI and server authorization.
  db.query("UPDATE grants SET start=?,end=? WHERE code_id=?").run(
    "2000-01-01T00:00:00.000Z",
    "2001-01-01T00:00:00.000Z",
    cleaner.id,
  );
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function dismissToasts() {
    await page.mouse.move(0, 0);
    for (let n = 0; n < 5; n++) {
      const close = page.locator(
        '[data-sonner-toast][data-front="true"] [data-close-button]',
      );
      if (!(await close.count())) break;
      const button = await close.elementHandle();
      if (!button) break;
      await button.click();
      await expect
        .poll(() => button.evaluate((element) => element.isConnected))
        .toBe(false);
      await button.dispose();
    }
  }
  async function saveForm() {
    await dismissToasts();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    const save = page.getByRole("button", {
      name: "Save access code",
      exact: true,
    });
    await save.evaluate((button) => {
      (document.activeElement as HTMLElement)?.blur();
      button.scrollIntoView({ block: "center" });
    });
    await page.screenshot({ path: join(directory, "form-save-visible.png") });
    await save.click();
  }

  await page.goto(origin + "/host/#/codes");
  await expect(page.locator(".code-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Non revoked");
  await expect(page.locator(".code-row")).toHaveCount(1);
  await expect(page.locator(`[data-code-id="${active.id}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Staff codes", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-row")).toHaveCount(1);
  await expect(page.locator(`[data-code-id="${cleaner.id}"]`)).toContainText(
    "No time limit",
  );
  await expect(
    page.getByRole("button", { name: "Previous day", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Today", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Staff", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Revoked");
  await expect(page.locator(".code-row")).toHaveCount(1);
  await expect(page.locator(".code-row")).toContainText("Laundry");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("all");
  await expect(page.locator(".code-row")).toHaveCount(2);
  const guest = await context.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(cleaner.link + "&lang=en");
  await expect(guest.getByText("No time limit", { exact: true })).toBeVisible();
  await expect(
    guest.getByRole("button", { name: /Click here to open/ }),
  ).toBeEnabled();
  await guest.getByRole("button", { name: /Click here to open/ }).click();
  await expect(
    page
      .locator(`[data-code-id="${cleaner.id}"]`)
      .getByLabel("Successful requests: 1", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page.screenshot({ path: join(directory, "staff-list-mobile.png") });
  await page.locator(`[data-code-id="${cleaner.id}"] .code-summary`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Staff access code", exact: true }),
  ).toBeChecked();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await page
    .getByRole("switch", { name: "Staff access code", exact: true })
    .click();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(2);
  await page
    .getByRole("switch", { name: "Staff access code", exact: true })
    .click();
  await saveForm();
  await expect(
    page.getByRole("heading", { name: "Staff codes", exact: true }),
  ).toBeVisible();
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Create access code/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Staff access code", exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("Staff name / label", { exact: true })
    .fill("New cleaner");
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await expect(page.getByLabel("Notes", { exact: true })).toHaveCount(0);
  await dismissToasts();
  const additionalDetails = page.getByText("Additional details", {
    exact: true,
  });
  await additionalDetails.evaluate((summary) =>
    summary.scrollIntoView({ block: "center" }),
  );
  await additionalDetails.click();
  await page
    .getByRole("switch", { name: "Internal notes", exact: true })
    .click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Laundry arrives at noon");
  await page
    .getByRole("switch", { name: "Internal notes", exact: true })
    .click();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: join(directory, "staff-form-mobile.png") });
  await saveForm();
  await expect(
    page.locator(".code-row").filter({ hasText: "New cleaner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guests", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous day", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-row")).toHaveCount(2);
  // Notes remain opt-in when editing, and a hidden form preserves stored notes.
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  const newCleaner = (await api("codes")).find(
    (c: any) => c.label === "New cleaner",
  );
  await page.locator(`[data-code-id="${newCleaner.id}"]`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("switch", {
      name: "Internal notes",
      exact: true,
      includeHidden: true,
    }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveCount(0);
  await saveForm();
  expect(
    (await api("codes")).find((c: any) => c.id === newCleaner.id).notes,
  ).toBe("Laundry arrives at noon");
  await page.locator(`[data-code-id="${newCleaner.id}"]`).click();
  await page.getByText("Manage access", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  const deletion = page.getByRole("dialog");
  await expect(
    deletion.getByRole("button", { name: "Delete permanently", exact: true }),
  ).toBeDisabled();
  await deletion.getByLabel(/Type to confirm/).fill("DELETE CODE");
  await deletion
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(deletion).toHaveCount(0);
  expect((await api("codes")).some((c: any) => c.id === newCleaner.id)).toBe(
    false,
  );

  await page.goto(origin + "/host/#/settings/properties");
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reactivate", exact: true }),
  ).toBeVisible();
  expect(await api("properties")).toEqual([]);
  await page.screenshot({
    path: join(directory, "inactive-structure-mobile.png"),
  });
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    deletion.getByRole("button", { name: "Delete permanently", exact: true }),
  ).toBeDisabled();
  await deletion.getByLabel(/Type to confirm/).fill("DELETE STRUCTURE");
  await page.screenshot({
    path: join(directory, "delete-structure-mobile.png"),
  });
  await deletion
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(deletion).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Add your property first", exact: true }),
  ).toBeVisible();
  expect(await api("codes")).toEqual([]);
  expect(await api("doors")).toEqual([]);
  expect(errors).toEqual([]);
  console.log(`Staff code UI checks passed. Screenshots: ${directory}`);
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
