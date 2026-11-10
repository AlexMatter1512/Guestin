import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3197";
const directory = mkdtempSync(join(tmpdir(), "guestin-mobile-layout-"));
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
  port: 3197,
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
    name: "Casa Aurora",
    timezone: "UTC",
  });
  // Mobile interaction and layout coverage. The device adapter above is fake.
  const entrance = await api("doors", {
    propertyId: property.id,
    name: "Main entrance",
    integration: "ewelink",
    config: { webhook_code: "fixture-only" },
    common: true,
  });
  const room = await api("doors", {
    propertyId: property.id,
    name: "Suite 1",
    integration: "none",
    config: {},
  });
  const start = new Date(Date.now() - 3600000).toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();
  const code = await api("codes", {
    propertyId: property.id,
    label: "Elena Rossi",
    notes: "Keep this private note",
    checkinLink: "https://example.test/checkin",
    instructionsLink: "https://example.test/guide",
    grants: [{ doorId: entrance.id, start, end, singleUse: false }],
    breakfast: { total: 4, start: start.slice(0, 10), end: end.slice(0, 10) },
  });
  await api("codes", {
    propertyId: property.id,
    label: "Cleaning team",
    staff: true,
    grants: [{ doorId: entrance.id, singleUse: false }],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function capture(name: string) {
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: join(directory, name + ".png") });
  }
  async function route(hash: string, heading: string) {
    await page.goto(origin + "/host/#/" + hash);
    await expect(page.locator(".page-heading h1")).toHaveText(heading);
  }
  async function fits() {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await route("codes", "Access codes");
  await expect(page.locator(".code-row")).toHaveCount(1);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await fits();
    await capture("codes-" + width);
    const firstRow = await page.locator(".code-row").boundingBox();
    expect(firstRow!.y).toBeLessThan(291);
    for (const button of await page.locator(".code-row-actions button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Access codes JSON", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page
    .getByRole("button", { name: "Access codes JSON", exact: true })
    .click();
  const transfer = page.getByRole("dialog", {
    name: "Access codes JSON",
    exact: true,
  });
  await expect(
    transfer.getByRole("button", { name: "Download JSON", exact: true }),
  ).toBeVisible();
  await expect(
    transfer.getByLabel("Upload JSON", { exact: true }),
  ).toBeVisible();
  await transfer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(transfer).toBeHidden();
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/#\/codes\/staff$/);
  await expect(page.locator(".code-row")).toHaveText(/Cleaning team/);
  await expect(
    page.getByRole("button", { name: "Previous day", exact: true }),
  ).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Staff", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Guests", exact: true }).click();
  await expect(page.locator(".code-row")).toHaveText(/Elena Rossi/);
  await page
    .getByRole("button", { name: "More actions for Elena Rossi", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open link", exact: true }),
  ).toHaveAttribute("href", code.link);
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Prepare message", exact: true })
    .click();
  const share = page.getByRole("dialog", {
    name: "Prepare message",
    exact: true,
  });
  await expect(share.getByLabel("Message preview")).toHaveValue(/Elena Rossi/);
  await share.getByRole("button", { name: "Close", exact: true }).click();
  await route("codes/" + code.id + "/edit", "Edit access code");
  const form = page.locator('form[data-tour="code-form"]');
  await expect(
    form.locator("h2").filter({ hasText: "Edit access code" }),
  ).toHaveCount(0);
  await expect(page.locator(".app-nav")).toBeHidden();
  const saveCode = form.getByRole("button", {
    name: "Save access code",
    exact: true,
  });
  const bar = page.locator(".mobile-form-actions");
  await expect(bar).toBeInViewport();
  const before = (await bar.boundingBox())!;
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  expect(Math.abs((await bar.boundingBox())!.y - before.y)).toBeLessThan(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture("edit-code");
  await expect(
    form.getByLabel("Online check-in link", { exact: true }),
  ).toBeHidden();
  const optional = form
    .locator("details")
    .filter({ hasText: "Additional details" });
  await optional.locator("summary").click();
  await expect(
    form.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://example.test/checkin");
  await form
    .getByLabel("Online check-in link", { exact: true })
    .fill("invalid-url");
  await optional.locator("summary").click();
  await saveCode.click();
  await expect(optional).toHaveAttribute("open", "");
  await expect(form).toBeVisible();
  await form
    .getByLabel("Online check-in link", { exact: true })
    .fill("https://example.test/updated");
  await optional.locator("summary").click();
  await saveCode.click();
  await expect(form).toHaveCount(0);
  const saved = (await api("codes")).find((item: any) => item.id === code.id);
  expect(saved.checkinLink).toBe("https://example.test/updated");
  expect(saved.instructionsLink).toBe("https://example.test/guide");
  expect(saved.notes).toBe("Keep this private note");
  expect(saved.grants).toHaveLength(1);
  expect(saved.breakfast.total).toBe(4);
  await expect(page.locator(".app-nav")).toBeVisible();
  await route("codes/" + code.id + "/edit", "Edit access code");
  await form
    .getByLabel("Guest name / label", { exact: true })
    .fill("Unsaved name");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(
    (await api("codes")).find((item: any) => item.id === code.id).label,
  ).toBe("Elena Rossi");
  await route("doors", "Doors");
  await expect(page.locator(".door-list > li")).toHaveCount(2);
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("button", { name: "Doors JSON", exact: true }).click();
  const doorsTransfer = page.getByRole("dialog", {
    name: "Doors JSON",
    exact: true,
  });
  await expect(
    doorsTransfer.getByRole("button", { name: "Download JSON", exact: true }),
  ).toBeVisible();
  await doorsTransfer
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const chevrons = await page
    .locator(".door-list button[aria-label] svg.lucide-chevron-right")
    .all();
  expect(chevrons).toHaveLength(2);
  if (chevrons.length === 2)
    expect(
      Math.abs(
        (await chevrons[0].boundingBox())!.x -
          (await chevrons[1].boundingBox())!.x,
      ),
    ).toBeLessThan(1);
  await capture("doors");
  await page
    .getByRole("button", { name: "Main entrance", exact: true })
    .click();
  await expect(page.locator(".page-heading h1")).toHaveText("Main entrance");
  await expect(
    page.getByRole("heading", { name: "Main entrance", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Delete door", exact: true }),
  ).toBeHidden();
  await page.locator("summary").filter({ hasText: "Manage door" }).click();
  await expect(
    page.getByRole("button", { name: "Delete door", exact: true }),
  ).toBeVisible();
  await capture("door-detail");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Edit door");
  await expect(
    page.getByRole("heading", { name: "Edit door", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".app-nav")).toBeHidden();
  await expect(page.locator(".mobile-form-actions")).toBeInViewport();
  await capture("edit-door");
  await page.getByLabel("Name", { exact: true }).fill("Main entrance updated");
  await page.getByRole("button", { name: "Save door", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Doors");
  expect(
    (await api("doors")).find((item: any) => item.id === entrance.id).name,
  ).toBe("Main entrance updated");
  await route("reports", "Statistics");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".statistics-card")).toHaveCount(1);
    await expect(page.locator(".statistics-table")).toBeHidden();
    for (const label of ["Created", "Used", "Attempts", "Accepted"])
      await expect(
        page
          .locator(".statistics-card dt")
          .filter({ hasText: new RegExp("^" + label + "$") }),
      ).toBeVisible();
    await fits();
    await capture("statistics-" + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".statistics-table")).toBeVisible();
  await expect(page.locator(".statistics-cards")).toBeHidden();
  await route("codes/" + code.id + "/edit", "Edit access code");
  await expect(page.locator(".app-nav")).toBeVisible();
  await fits();
  await capture("edit-desktop");
  await api("me/preferences", { language: "it", theme: "dark" }, "PATCH");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(origin + "/host/#/codes");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Ospiti", exact: true }),
  ).toBeVisible();
  await fits();
  // Theme changes animate text color; wait for foreground inheritance to settle.
  const darkForeground = await page.evaluate(
    () => getComputedStyle(document.documentElement).color,
  );
  await expect(page.locator(".page-heading h1")).toHaveCSS(
    "color",
    darkForeground,
  );
  await expect(page.locator(".code-summary")).toHaveCSS(
    "color",
    darkForeground,
  );
  await capture("codes-italian-dark");
  console.log(JSON.stringify({ directory, deviceCalls: calls, errors }));
  expect(errors).toEqual([]);
  expect(calls).toBe(0);
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
