import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3114";
const directory = mkdtempSync(join(tmpdir(), "oshost-history-ui-"));
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
  port: 3114,
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
    name: "History house",
    timezone: "UTC",
  });
  const artwork = await context.newPage();
  const fixturePhoto = await artwork.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const drawing = canvas.getContext("2d")!;
    drawing.fillStyle = "#a7c7dc";
    drawing.fillRect(0, 0, 96, 96);
    drawing.fillStyle = "#303d48";
    drawing.fillRect(19, 9, 58, 87);
    drawing.fillStyle = "#9d602f";
    drawing.fillRect(24, 13, 48, 83);
    drawing.fillStyle = "#c7905e";
    drawing.fillRect(30, 20, 36, 29);
    drawing.fillRect(30, 56, 36, 30);
    drawing.fillStyle = "#f4cd57";
    drawing.beginPath();
    drawing.arc(63, 52, 3, 0, Math.PI * 2);
    drawing.fill();
    return canvas.toDataURL("image/png");
  });
  await artwork.close();
  const door = await api("doors", {
    propertyId: property.id,
    name: "Front door",
    integration: "ewelink",
    config: { webhook_code: "fixture" },
    photos: [
      {
        id: "primary",
        url: fixturePhoto,
        alt: "Door",
      },
    ],
    primaryPhotoId: "primary",
  });
  const code = await api("codes", {
    propertyId: property.id,
    label: "Cleaner",
    staff: true,
    grants: [{ doorId: door.id, singleUse: false }],
  });
  const stamp = Date.now();
  for (let i = 0; i < 45; i++) {
    const id = crypto.randomUUID();
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      id,
      property.id,
      i < 2 ? code.id : null,
      i < 2 ? "code.updated" : "access.invalid",
      "Fixture",
      new Date(stamp - i * 1000).toISOString(),
    );
    db.query("INSERT INTO event_context VALUES(?,?)").run(
      id,
      JSON.stringify({ codeLabel: `History ${i}` }),
    );
  }
  const page = await context.newPage(),
    peer = await context.newPage(),
    errors: string[] = [],
    readRequests: string[] = [],
    pageRequests: string[] = [];
  for (const p of [page, peer])
    p.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/events/read") && r.method() === "POST")
      readRequests.push(r.url());
    if (r.url().includes("/events?")) pageRequests.push(r.url());
  });
  await peer.goto(origin + "/host/#/codes");
  await page.goto(origin + "/host/#/activity/" + property.id);
  const cards = page.locator("[data-notification-id]");
  await expect(cards).toHaveCount(20);
  expect(readRequests).toHaveLength(0);
  await expect(page.getByTestId("notification-badge")).toHaveText("46");
  expect(
    pageRequests.every(
      (url) => new URL(url).searchParams.get("pageSize") === "20",
    ),
  ).toBe(true);
  const invalid = page.locator("button[data-notification-id]").first(),
    invalidId = await invalid.getAttribute("data-notification-id");
  const initialURL = page.url();
  await invalid.click();
  await expect(
    page.locator(`[data-notification-id="${invalidId}"]`),
  ).toHaveAttribute("data-unread", "false");
  expect(page.url()).toBe(initialURL);
  await expect(peer.getByTestId("notification-badge")).toHaveText("45");
  await page.screenshot({
    path: join(directory, "history-icons-read-mobile.png"),
    animations: "disabled",
  });
  await page.locator("[data-notification-sentinel]").scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(40);
  await page.locator("[data-notification-sentinel]").scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(46);
  expect(readRequests).toHaveLength(1);
  expect(
    new Set(
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-notification-id")),
      ),
    ).size,
  ).toBe(46);
  await page
    .locator(`a[href="/host/#/codes/${code.id}"][data-notification-id]`)
    .first()
    .click();
  await expect(page).toHaveURL(origin + "/host/#/codes/" + code.id);
  const token = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
    "code",
  )!;
  const opened = await context.request.post(
    origin + `/api/v1/guest/doors/${door.id}/open`,
    {
      headers: {
        Origin: origin,
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    },
  );
  expect(opened.ok()).toBe(true);
  const toast = page.locator("[data-activity-toast]");
  await expect(toast).toBeVisible();
  await expect(toast.locator("img")).toBeVisible();
  await expect
    .poll(() =>
      toast
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: join(directory, "door-toast-mobile.png"),
    animations: "disabled",
  });
  await toast.getByRole("button").first().click();
  await expect(page).toHaveURL(origin + "/host/#/doors/" + door.id);
  await api(`codes/${code.id}/revoke`, {});
  const revoked = (await api("events")).events.find(
    (e: any) => e.type === "code.revoked",
  );
  const revokedToast = page.locator(`[data-activity-toast="${revoked.id}"]`);
  await expect(revokedToast.locator('[data-icon="key"]')).toBeVisible();
  await revokedToast.getByRole("button").first().click();
  await expect(page).toHaveURL(origin + "/host/#/codes/" + code.id);
  await page.goto(origin + "/host/#/activity/" + property.id);
  await expect(cards).toHaveCount(20);
  const accepted = (await api("events")).events.find(
    (e: any) => e.type === "access.accepted",
  );
  await expect(
    page.locator(`[data-notification-id="${accepted.id}"] img`),
  ).toBeVisible();
  await expect(
    page.locator(`[data-notification-id="${accepted.id}"]`),
  ).toHaveAttribute("data-unread", "false");
  await page.screenshot({
    path: join(directory, "door-history-mobile.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await expect(peer.getByTestId("notification-badge")).toHaveCount(0);
  expect((db.query("SELECT COUNT(*) n FROM event_reads").get() as any).n).toBe(
    48,
  );
  await page.goto(origin + "/host/#/settings/notifications");
  await page
    .getByLabel("Maximum notifications in this period", { exact: true })
    .fill("30");
  await page
    .getByLabel("Keep notifications for (months)", { exact: true })
    .fill("6");
  await page
    .getByRole("button", { name: "Save retention", exact: true })
    .click();
  await expect
    .poll(async () => (await api("properties"))[0].notificationRetentionLimit)
    .toBe(30);
  expect((db.query("SELECT COUNT(*) n FROM events").get() as any).n).toBe(30);
  await page.goto(origin + "/host/#/activity/" + property.id);
  await expect(cards).toHaveCount(20);
  await expect(
    page.getByText("Up to 30 notifications are kept for 6 months.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.locator("[data-notification-sentinel]").scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(30);
  expect(errors).toEqual([]);
  console.log(
    `Notification history UI checks passed. Screenshots: ${directory}`,
  );
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
