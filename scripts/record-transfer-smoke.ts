import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3115";
const directory = mkdtempSync(join(tmpdir(), "oshost-transfer-ui-"));
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
  port: 3115,
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
    name: "Transfer house",
    timezone: "UTC",
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/#/doors");
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Add door/ })
    .click();
  const form = page.locator('form[data-tour="door-form"]');
  await form.getByLabel("Name", { exact: true }).fill("Entrance");
  await form.getByLabel("Integration", { exact: true }).selectOption("webhook");
  await expect(
    form.getByRole("button", { name: "Add Headers", exact: true }),
  ).toBeDisabled();
  await expect(
    form.getByRole("button", { name: "Add Query parameters", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Webhook preset").selectOption("ewelink");
  await expect(form.getByLabel("Webhook URL", { exact: true })).toHaveValue(
    /webhooks\/execute$/,
  );
  await expect(
    form.getByLabel("Query parameters key 1", { exact: true }),
  ).toHaveValue("id");
  await expect(
    form.getByLabel("Query parameters value 1", { exact: true }),
  ).toHaveValue("YOUR_WEBHOOK_CODE");
  await expect(
    form.getByRole("button", { name: "Add Query parameters", exact: true }),
  ).toBeEnabled();
  await form
    .getByLabel("Query parameters value 1", { exact: true })
    .fill("fixture-only");
  await form
    .getByRole("button", { name: "Add Query parameters", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Add Query parameters", exact: true }),
  ).toBeDisabled();
  await form
    .getByLabel("Query parameters key 2", { exact: true })
    .fill("channel");
  await expect(
    form.getByRole("button", { name: "Add Query parameters", exact: true }),
  ).toBeDisabled();
  await form
    .getByLabel("Query parameters value 2", { exact: true })
    .fill("a+b c");
  await expect(
    form.getByRole("button", { name: "Add Query parameters", exact: true }),
  ).toBeEnabled();
  await form.getByLabel("Headers key 1", { exact: true }).fill("Authorization");
  await expect(
    form.getByRole("button", { name: "Add Headers", exact: true }),
  ).toBeDisabled();
  await form
    .getByLabel("Headers value 1", { exact: true })
    .fill("Bearer fixture-only");
  await expect(
    form.getByRole("button", { name: "Add Headers", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: join(directory, "webhook-pairs-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await form.getByRole("button", { name: "Save door", exact: true }).click();
  await expect(page.locator(".door-row")).toHaveCount(1);
  expect(calls).toBe(0);
  const door = (await api("doors"))[0];
  const exported = await api(
    `admin/records/doors/export?propertyId=${property.id}`,
  );
  expect(exported.doors[0].config.url).toContain(
    "id=fixture-only&channel=a%2Bb+c",
  );
  expect(JSON.parse(exported.doors[0].config.headers)).toEqual({
    Authorization: "Bearer fixture-only",
  });
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("button", { name: "Doors JSON", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toContain(
    "oshost-doors-Transfer-house-",
  );
  const json = JSON.parse(await Bun.file((await downloaded.path())!).text());
  expect(json.doors).toHaveLength(1);
  const incoming = structuredClone(exported);
  incoming.doors[0].data.name = "Replaced entrance";
  const extra = structuredClone(incoming.doors[0]);
  extra.id = crypto.randomUUID();
  extra.data.name = "New room";
  incoming.doors.push(extra);
  async function uploadFile(kind: string, value: any) {
    await dialog.getByLabel("Upload JSON", { exact: true }).setInputFiles({
      name: `${kind}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  }
  await uploadFile("doors", incoming);
  await expect(
    dialog.getByRole("switch", { name: "Override current list", exact: true }),
  ).not.toBeChecked();
  expect(await api("doors")).toHaveLength(1); // Preview never writes.
  await dialog
    .getByRole("button", { name: "Append records", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(await api("doors")).toHaveLength(2);
  expect((await api("doors")).find((d: any) => d.id === door.id).name).toBe(
    "Entrance",
  );
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("button", { name: "Doors JSON", exact: true }).click();
  await uploadFile("doors", { ...incoming, doors: [incoming.doors[0]] });
  await dialog
    .getByRole("switch", { name: "Override current list", exact: true })
    .click();
  await expect(
    dialog.getByText(/Doors omitted from the file are deleted/),
  ).toBeVisible();
  const replace = dialog.getByRole("button", {
    name: "Replace list",
    exact: true,
  });
  await expect(replace).toBeDisabled();
  await dialog
    .getByRole("switch", {
      name: "I understand the entire current list will be replaced",
      exact: true,
    })
    .click();
  await expect(replace).toBeDisabled();
  await dialog.getByLabel(/Type to confirm/).fill("REPLACE DOORS");
  await expect(replace).toBeEnabled();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await page.screenshot({
    path: join(directory, "replace-doors-warning-mobile.png"),
    animations: "disabled",
  });
  await replace.click();
  await expect(dialog).toHaveCount(0);
  expect(await api("doors")).toHaveLength(1);
  expect((await api("doors"))[0].name).toBe("Replaced entrance");
  const first = await api("codes", {
    propertyId: property.id,
    label: "Guest file code",
    staff: true,
    grants: [{ doorId: door.id, singleUse: false }],
  });
  const codeFile = await api(
    `admin/records/codes/export?propertyId=${property.id}`,
  );
  await api("codes", {
    propertyId: property.id,
    label: "Code to remove",
    staff: true,
    grants: [],
  });
  await page.goto(origin + "/host/#/codes");
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page
    .getByRole("button", { name: "Access codes JSON", exact: true })
    .click();
  await uploadFile("codes", codeFile);
  await dialog
    .getByRole("switch", { name: "Override current list", exact: true })
    .click();
  await expect(
    dialog
      .getByRole("alert")
      .getByText(/including guest, staff and revoked codes/),
  ).toBeVisible();
  await expect(
    dialog.getByText(/An older file can reactivate revoked codes/),
  ).toBeVisible();
  await dialog
    .getByRole("switch", {
      name: "I understand the entire current list will be replaced",
      exact: true,
    })
    .click();
  await dialog.getByLabel(/Type to confirm/).fill("REPLACE ACCESS CODES");
  await dialog
    .getByRole("button", { name: "Replace list", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect((await api("codes")).map((c: any) => c.id)).toEqual([first.id]);
  const invite = (await api("invites", {})).link.split("=")[1],
    collaborator = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
  const joined = await collaborator.request.post(
    origin + "/api/v1/auth/accept-invite",
    {
      headers: { Origin: origin },
      data: {
        invite,
        name: "Collaborator",
        email: "collaborator@example.test",
        password: "fixture-password",
      },
    },
  );
  const collab = await joined.json();
  await api(
    `users/${collab.user.id}`,
    {
      permissions: {
        createDoors: true,
        createAccessCodes: true,
        createStaffCodes: true,
        useBookingConnectors: true,
      },
    },
    "PATCH",
  );
  await collaborator.request.patch(origin + "/api/v1/me/preferences", {
    headers: { Origin: origin, "X-CSRF-Token": collab.csrf },
    data: { language: "en", tour: "skipped" },
  });
  const restricted = await collaborator.newPage();
  await restricted.goto(origin + "/host/#/doors");
  await expect(restricted.locator(".door-row")).toHaveCount(1);
  await expect(
    restricted.getByRole("button", { name: "List actions", exact: true }),
  ).toHaveCount(0);
  await restricted.goto(origin + "/host/#/codes");
  await expect(
    restricted.getByRole("heading", { name: "Access codes", exact: true }),
  ).toBeVisible();
  await expect(
    restricted.getByRole("button", { name: "List actions", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(calls).toBe(0);
  console.log(
    `Record transfer and webhook pair UI passed. Screenshots: ${directory}`,
  );
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
