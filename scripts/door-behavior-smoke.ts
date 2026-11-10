import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3116";
const directory = mkdtempSync(join(tmpdir(), "guestin-door-ui-"));
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
  port: 3116,
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
  context.setDefaultTimeout(15000);
  const setup = await context.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "staff-ui",
      name: "Owner",
      email: "owner@example.test",
      password: "fixture-password",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  async function api(
    path: string,
    data?: any,
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
    name: "Transfer house",
    timezone: "UTC",
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const config = {
    url: "https://example.test/unlock?id=fixture-only",
    method: "POST",
    headers: JSON.stringify({ Authorization: "Bearer fixture-only" }),
    body: "relay=1",
    response_mode: "http",
  };
  const door = await api("doors", {
    propertyId: property.id,
    name: "Disabled entrance",
    enabled: false,
    integration: "webhook",
    config,
  });
  await page.goto(origin + "/host/#/doors/" + door.id);
  const saved = page.getByRole("region", {
    name: "Saved device configuration",
    exact: true,
  });
  await expect(saved).toContainText(config.url);
  await expect(saved).toContainText("Bearer fixture-only");
  await expect(saved).toContainText("relay=1");
  await expect(
    page.getByRole("button", { name: "Test opening", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: join(directory, "disabled-door-config-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Test opening", exact: true }).click();
  const confirm = page.getByRole("region", { name: "Confirm door action" });
  await confirm
    .getByRole("switch", { name: "I understand and confirm" })
    .click();
  await confirm.getByRole("button", { name: "Send unlock request" }).click();
  await expect(
    page.getByText("Fixture accepted", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect((await api("doors"))[0].enabled).toBe(false);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(saved).toContainText(config.url);
  await page.getByLabel("Name", { exact: true }).fill("Updated entrance");
  await page.getByRole("button", { name: "Save door", exact: true }).click();
  await expect(page.locator(".door-row")).toHaveCount(1);
  expect((await api(`doors/${door.id}/config`)).config).toEqual(config);
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByText("Owner updated door Updated entrance.", { exact: true }),
  ).toBeVisible();
  const updated = (await api("events")).events.find(
    (e: any) => e.type === "door.updated",
  );
  expect(updated.context.actor).toBe("Owner");
  expect(updated.href).toBe("/host/#/doors/" + door.id);
  await api(`doors/${door.id}`, { enabled: true, config: {} }, "PUT");
  const code = await api("codes", {
    propertyId: property.id,
    label: "Door browser fixture",
    grants: [
      {
        doorId: door.id,
        singleUse: false,
        start: new Date(Date.now() - 60000).toISOString(),
        end: new Date(Date.now() + 600000).toISOString(),
      },
    ],
  });
  const guest = await context.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(code.link + "&lang=en");
  await guest
    .getByRole("button", { name: "Click here to open 🔓", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api("events")).events.filter(
          (e: any) => e.type === "access.accepted",
        ).length,
    )
    .toBe(1);
  const opened = (await api("events")).events.find(
    (e: any) => e.type === "access.accepted",
  );
  expect(opened.context.actor).toBe("Owner");
  expect(calls).toBe(2);
  await page.reload();
  await expect(
    page.getByText("Owner · Updated entrance: Fixture accepted", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: join(directory, "door-notifications-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(`Door behavior UI passed. Screenshots: ${directory}`);
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
