import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, extname } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";

// Only this isolated fixture server is used. Its adapter never contacts a device.
const dir = mkdtempSync(join(tmpdir(), "oshost-doors-"));
const origin = "http://localhost:3096";
const db = openDatabase(join(dir, "test.sqlite"));
let deviceCalls = 0;
const app = createApp(db, {
  key: "a".repeat(64),
  setupToken: "door-smoke-setup",
  origin,
  device: async () => {
    deviceCalls++;
    return deviceCalls === 1
      ? {
          status: "uncertain",
          detail: "Fixture timeout; physical state unknown",
        }
      : { status: "accepted", detail: "Fixture provider accepted request" };
  },
});
app.get("*", async (c) => {
  const root = resolve("apps/host/build");
  const path = resolve(root, c.req.path.replace(/^\/host\/?/, ""));
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  let file = Bun.file(path);
  if (!(await file.exists()) || path === root) {
    if (extname(path)) return c.notFound();
    file = Bun.file(join(root, "200.html"));
  }
  return new Response(file);
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3096,
  fetch: app.fetch,
});
let browser;
try {
  const setup = await fetch(origin + "/api/v1/auth/setup", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Door Tester",
      email: "doors@example.com",
      password: "door-test-password",
      setupToken: "door-smoke-setup",
    }),
  });
  const session = (await setup.json()) as any;
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const request = async (
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const r = await fetch(origin + "/api/v1/" + path, {
      method,
      headers: {
        origin,
        cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrf,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = (await r.json()) as any;
    if (!r.ok) throw Error(JSON.stringify(result));
    return result;
  };
  await request("me/preferences", { tour: "skipped", language: "en" }, "PATCH");
  const property = await request("properties", {
    name: "Door test house",
    timezone: "Europe/Rome",
  });
  const connected = await request("doors", {
    propertyId: property.id,
    name: "Connected entrance",
    integration: "ewelink",
    config: { webhook_code: "fixture-only" },
    common: true,
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  await context.addCookies(
    [
      {
        name: "oshost_session",
        value: cookie.split("=")[1],
        url: origin,
        path: "/api/",
      },
    ].map(({ path, ...c }) => ({
      ...c,
      path,
      domain: "localhost",
      url: undefined,
    })),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/");
  // A saved locale removes the language gate; onboarding is already skipped in this fixture.
  const chooser = page.getByRole("dialog", { name: /Choose your language/ });
  if (await chooser.isVisible())
    await chooser
      .getByRole("button", { name: "Skip tour / Salta il tour" })
      .click();
  await page.locator('[data-tour="nav-doors"]').click();
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("button", { name: /Add door Connect an entrance/ })
    .click();
  const form = page.locator('[data-tour="door-form"]');
  await form.getByLabel("Name", { exact: true }).fill("Garden door");
  await form
    .getByLabel("Description", { exact: true })
    .fill("Beside the olive tree.");
  await form
    .getByText("Translated names and descriptions (optional)", { exact: true })
    .click();
  await form
    .getByLabel("IT · Description", { exact: true })
    .fill("Accanto all’ulivo.");
  await form.getByLabel("Add photos (up to 4)", { exact: true }).setInputFiles({
    name: "door.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 20;
        canvas.height = 20;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "green";
        ctx.fillRect(0, 0, 20, 20);
        return canvas.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    ),
  });
  await expect(form.locator(".photo-card")).toHaveCount(1);
  await form.getByRole("button", { name: "Save door", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Garden door", exact: true }),
  ).toBeVisible();
  const saved = (await request("doors")).find(
    (d: any) => d.name === "Garden door",
  );
  expect(saved.photos).toHaveLength(1);
  expect(saved.descriptionTranslations.it).toBe("Accanto all’ulivo.");
  await page.getByRole("button", { name: "Garden door", exact: true }).click();
  await expect(page.locator(".detail-photo")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await form.getByLabel("Enabled for guest access", { exact: true }).uncheck();
  await form.getByRole("button", { name: "Save door", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Show doors" })
    .selectOption("disabled");
  await expect(page.locator(".door-list > li")).toHaveCount(1);
  await expect(page.locator(".door-list")).toContainText("Garden door");
  await page.getByRole("combobox", { name: "Show doors" }).selectOption("all");
  await page
    .getByRole("button", { name: "Reorder doors", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move up: Garden door", exact: true })
    .click();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(page.locator(".door-list > li").first()).toContainText(
    "Garden door",
  );
  await page.reload();
  await expect(page.locator(".door-list > li").first()).toContainText(
    "Garden door",
  );
  const connectedCard = page.locator(".door-list > li").filter({
    has: page.getByRole("button", {
      name: "Connected entrance",
      exact: true,
    }),
  });
  await connectedCard
    .getByRole("button", { name: "Test opening", exact: true })
    .click();
  const confirm = page.getByRole("region", { name: "Confirm door action" });
  await expect(confirm).toContainText("real unlock request");
  await expect(
    confirm.getByRole("button", { name: "Send unlock request" }),
  ).toBeDisabled();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deviceCalls).toBe(0);
  await connectedCard
    .getByRole("button", { name: "Test opening", exact: true })
    .click();
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "Send unlock request" }).click();
  await expect(
    page.getByText("Uncertain result — check the door", { exact: true }),
  ).toBeVisible();
  expect(deviceCalls).toBe(1);
  await connectedCard
    .getByRole("button", { name: "Check uncertain test" })
    .click();
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    connectedCard.getByRole("button", { name: "Test opening", exact: true }),
  ).toBeEnabled();
  expect(deviceCalls).toBe(1);
  await connectedCard
    .getByRole("button", { name: "Test opening", exact: true })
    .click();
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "Send unlock request" }).click();
  await expect(
    page.getByText("Request accepted by device provider", { exact: true }),
  ).toBeVisible();
  expect(deviceCalls).toBe(2);
  // The example door can be deleted, while preserving the connected one.
  const gardenCard = page.locator(".door-list > li").filter({
    has: page.getByRole("button", { name: "Garden door", exact: true }),
  });
  await gardenCard
    .getByRole("button", { name: "Garden door", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toContainText("permanently deletes");
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".door-list > li")).toHaveCount(1);
  expect((await request("doors")).map((d: any) => d.id)).toEqual([
    connected.id,
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: join(dir, "doors-mobile.png"),
    fullPage: true,
  });
  console.log(
    "Door feature smoke passed: descriptions/translations/photos, details, disable/filter, saved ordering, confirmed fake tests/uncertainty resolution, safe deletion, mobile. " +
      dir,
  );
} finally {
  await browser?.close();
  server.stop();
  db.close();
}
