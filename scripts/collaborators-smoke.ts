import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3113";
const directory = mkdtempSync(join(tmpdir(), "guestin-collaborator-ui-"));
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
  port: 3113,
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, server) =>
    app.fetch(request, { server, clientIP: "127.0.0.1" }),
});
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const options = {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block" as const,
    reducedMotion: "reduce" as const,
  };
  const owner = await browser.newContext(options),
    collaborator = await browser.newContext(options);
  const setup = await owner.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "staff-ui",
      name: "Owner Alex",
      email: "owner@example.test",
      password: "fixture-password",
    },
  });
  expect(setup.ok()).toBe(true);
  const ownerAuth = await setup.json();
  async function request(
    context: any,
    csrf: string,
    path: string,
    data?: any,
    method = data === undefined ? "GET" : "POST",
  ) {
    const response = await context.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const api = (path: string, data?: any, method?: string) =>
    request(owner, ownerAuth.csrf, path, data, method);
  await api("me/preferences", { language: "en", tour: "skipped" }, "PATCH");
  const property = await api("properties", {
    name: "Team house",
    timezone: "UTC",
  });
  await api("doors", {
    propertyId: property.id,
    name: "Entrance",
    common: true,
    integration: "none",
    config: {},
  });
  const invitation = await api("invites", {});
  const invite = new URLSearchParams(
    new URL(invitation.link).hash.slice(1),
  ).get("invite");
  const auth = await request(collaborator, "", "auth/accept-invite", {
    invite,
    name: "Nina",
    email: "nina@example.test",
    password: "fixture-password",
  });
  await request(
    collaborator,
    auth.csrf,
    "me/preferences",
    { language: "en", tour: "skipped" },
    "PATCH",
  );
  const ownerPage = await owner.newPage(),
    page = await collaborator.newPage(),
    errors: string[] = [];
  for (const p of [ownerPage, page])
    p.on("pageerror", (e) => errors.push(e.message));
  await ownerPage.goto(origin + "/host/#/settings/team");
  const nina = ownerPage.getByRole("region", { name: "Nina", exact: true });
  await expect(nina).toBeVisible();
  await expect(nina.getByRole("switch")).toHaveCount(4);
  await page.goto(origin + "/host/#/codes");
  await expect(page.locator('[data-tour="new-code"]')).toBeDisabled();
  await nina
    .getByRole("switch", { name: "Create access codes", exact: true })
    .click();
  await expect(page.locator('[data-tour="new-code"]')).toBeEnabled();
  await page.locator('[data-tour="new-code"]').click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /Create access code/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /Add door/ }),
  ).toHaveCount(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Create access code/ })
    .click();
  await expect(
    page.getByRole("switch", { name: "Staff access code", exact: true }),
  ).toBeDisabled();
  await nina
    .getByRole("switch", { name: "Create staff access codes", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Staff access code", exact: true }),
  ).toBeEnabled();
  await nina
    .getByRole("switch", { name: "Create new doors", exact: true })
    .click();
  await page.goto(origin + "/host/#/codes");
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Add door/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Add door", exact: true, level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: join(directory, "collaborator-door-form.png"),
    animations: "disabled",
  });
  await page.goto(origin + "/host/#/settings");
  await expect(
    page.getByRole("button", { name: /Connectors KrossBooking/ }),
  ).toHaveCount(0);
  await nina
    .getByRole("switch", { name: "Use booking connectors", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Connectors KrossBooking/ }),
  ).toBeVisible();
  await ownerPage.screenshot({
    path: join(directory, "collaborator-permissions.png"),
    animations: "disabled",
  });
  await nina
    .getByRole("button", { name: "Promote to owner", exact: true })
    .click();
  await ownerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm promotion", exact: true })
    .click();
  await expect(nina.getByRole("switch")).toHaveCount(0);
  await expect(nina).toContainText("Owner / Admin");
  await expect(
    nina.getByRole("button", { name: "Delete account", exact: true }),
  ).toHaveCount(0);
  await page.goto(origin + "/host/#/settings/team");
  const ownAccount = page.getByRole("region", { name: "Nina", exact: true });
  await ownAccount
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  const deletion = page.getByRole("dialog");
  await deletion.getByLabel(/Type to confirm/).fill("DELETE ACCOUNT");
  await deletion
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    ownerPage
      .getByRole("region", { name: "Owner Alex", exact: true })
      .getByRole("button", { name: "Delete my account", exact: true }),
  ).toBeDisabled();
  expect((await api("users")).some((u: any) => u.id === auth.user.id)).toBe(
    false,
  );
  // The merged password form keeps the owner/admin label and signs out all sessions.
  await ownerPage.goto(origin + "/host/#/profile");
  await expect(
    ownerPage.getByText("Role: Owner / Admin", { exact: true }),
  ).toBeVisible();
  await ownerPage
    .getByLabel("Current password", { exact: true })
    .fill("fixture-password");
  await ownerPage
    .getByLabel("New password", { exact: true })
    .fill("updated-fixture-password");
  await ownerPage
    .getByLabel("Confirm new password", { exact: true })
    .fill("updated-fixture-password");
  await ownerPage
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    ownerPage.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  const previous = await owner.request.post(origin + "/api/v1/auth/login", {
    headers: { Origin: origin },
    data: { email: "owner@example.test", password: "fixture-password" },
  });
  expect(previous.status()).toBe(401);
  const changed = await owner.request.post(origin + "/api/v1/auth/login", {
    headers: { Origin: origin },
    data: { email: "owner@example.test", password: "updated-fixture-password" },
  });
  expect(changed.status()).toBe(200);
  expect((await changed.json()).user.role).toBe("owner");
  expect(errors).toEqual([]);
  console.log(`Collaborator UI checks passed. Screenshots: ${directory}`);
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
