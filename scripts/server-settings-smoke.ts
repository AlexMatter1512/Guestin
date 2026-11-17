import { chromium, expect, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { websocket } from "../server/realtime";
import build from "../shared/build.json";
import type { ServerInfo } from "../shared/server-updates";

// Real built UI and service workers, disposable database, no external providers.
const directory = mkdtempSync(join(tmpdir(), "guestin-server-ui-"));
const db = openDatabase(join(directory, "test.sqlite"));
for (const role of ["owner", "collaborator"]) {
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    role,
    role,
    `${role}@example.test`,
    "unused",
    role,
  );
  db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest(role),
    role,
    "csrf",
    Date.now() + 600000,
  );
  db.query("INSERT INTO user_preferences VALUES(?,?)").run(
    role,
    JSON.stringify({ language: "en", tour: "skipped" }),
  );
}
let workerVersion = 1;
let app: ReturnType<typeof createApp>;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  websocket,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, { server });
    const root = resolve("apps/host/build");
    const path = resolve(root, "." + url.pathname.replace(/^\/host/, ""));
    if (path !== root && !path.startsWith(root + "/"))
      return new Response(null, { status: 404 });
    if (url.pathname === "/host/service-worker.js") {
      const source = await Bun.file(join(root, "service-worker.js")).text();
      return new Response(
        source +
          `\nself.addEventListener('message',e=>{if(e.data?.type==='GUESTIN_TEST_VERSION')e.ports[0]?.postMessage(${workerVersion})});\n`,
        {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        },
      );
    }
    let file = Bun.file(path);
    if (!(await file.exists())) file = Bun.file(join(root, "200.html"));
    return new Response(file, { headers: { "Cache-Control": "no-cache" } });
  },
});
const origin = `http://127.0.0.1:${server.port}`;
app = createApp(db, {
  key: "a".repeat(64),
  origin,
  setupToken: "unused",
  device: async () => {
    throw Error("Unexpected device request");
  },
  updates: {
    fetcher: async () => {
      throw Error("Unexpected external update request");
    },
  },
});
let browser;
const errors: string[] = [];
let currentId = "older-installed-server",
  available = true,
  reads = 0;
function info(): ServerInfo {
  const row = db
    .query("SELECT update_channel FROM server_settings WHERE id=1")
    .get() as { update_channel?: "latest" | "edge" } | null;
  return {
    channel: row?.update_channel ?? "latest",
    current: { ...build, id: currentId },
    published: {
      ...build,
      id: "published-image",
      version: "v0.5.0",
      digest: "sha256:" + "a".repeat(64),
    },
    status: available ? "available" : "current",
    checkedAt: new Date().toISOString(),
    nextCheckAt: new Date(Date.now() + 3600000).toISOString(),
    error: "",
  };
}
async function workerNumber(page: Page) {
  return page
    .evaluate(
      () =>
        new Promise<number>((resolve) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => {
            channel.port1.close();
            resolve(-1);
          }, 2000);
          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(event.data);
          };
          navigator.serviceWorker.controller?.postMessage(
            { type: "GUESTIN_TEST_VERSION" },
            [channel.port2],
          );
        }),
    )
    .catch(() => -1);
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([
    { name: "guestin_session", value: "owner", url: origin, httpOnly: true },
  ]);
  await context.route("**/api/v1/admin/server*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    return route.fulfill({ json: info() });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/#/settings");
  await expect(
    page.getByRole("button", {
      name: "Server Installed version and update channel",
    }),
  ).toBeVisible();
  expect(reads).toBe(0);
  await expect(
    page.getByRole("dialog", { name: "Server update available" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Server Installed version and update channel",
    })
    .click();
  const popup = page.getByRole("dialog", { name: "Server update available" });
  await expect(popup).toBeVisible();
  async function settledPopup() {
    await expect
      .poll(() =>
        popup.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.top >= 0 &&
            box.bottom <= innerHeight + 1 &&
            Number(getComputedStyle(element).opacity) >= 0.99
          );
        }),
      )
      .toBe(true);
  }
  await settledPopup();
  await page.screenshot({
    path: join(directory, "server-desktop-popup.png"),
    animations: "disabled",
  });
  await popup
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Update channel")).toHaveValue("latest");
  await page.getByLabel("Update channel").selectOption("edge");
  await page.getByRole("button", { name: "Save channel", exact: true }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("alexmatter/guestin:edge");
  await popup
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await page.reload();
  await expect(popup).toBeVisible();
  await popup
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Update channel")).toHaveValue("edge");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "View update", exact: true }).click();
  await expect(popup).toBeVisible();
  await expect(
    popup.getByRole("heading", {
      name: "Server update available",
      exact: true,
    }),
  ).toBeInViewport();
  await settledPopup();
  await page.screenshot({
    path: join(directory, "server-mobile-popup.png"),
    animations: "disabled",
  });
  await popup
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  // Exercise the production activation handler against a real waiting worker.
  currentId = build.id;
  available = false;
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh app", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => workerNumber(page)).toBe(1);
  await page.evaluate(() =>
    localStorage.setItem("guestin.refresh-canary", "preserved"),
  );
  const other = await context.newPage();
  await other.goto(origin + "/host/#/settings");
  workerVersion = 2;
  await page.getByRole("button", { name: "Refresh app", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Close other GuestIn host windows",
  );
  await other.close();
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.getByRole("button", { name: "Refresh app", exact: true }).click(),
  ]);
  await expect.poll(() => workerNumber(page)).toBe(2);
  await expect(page.locator("[data-server-settings]")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("guestin.refresh-canary")),
  ).toBe("preserved");
  expect(page.url().endsWith("#/settings/server")).toBe(true);

  // A failed refresh is explained after one reload, without a reload loop.
  currentId = "still-unmatched";
  await page.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(
    page.getByText(
      "The server has changed. Refresh this app to load its current version.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh app", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "remove the installed shortcut",
  );
  await page.screenshot({
    path: join(directory, "server-mobile-recovery.png"),
  });
  const collab = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await collab.addCookies([
    {
      name: "guestin_session",
      value: "collaborator",
      url: origin,
      httpOnly: true,
    },
  ]);
  const collaborator = await collab.newPage();
  await collaborator.goto(origin + "/host/#/settings");
  await expect(
    collaborator.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    collaborator.getByRole("button", {
      name: "Server Installed version and update channel",
    }),
  ).toHaveCount(0);
  await collaborator.goto(origin + "/host/#/settings/server");
  await expect(collaborator.locator("[data-server-settings]")).toHaveCount(0);
  await expect(
    collaborator.getByRole("dialog", { name: "Server update available" }),
  ).toHaveCount(0);
  expect(db.query("SELECT * FROM events").all()).toHaveLength(0);
  expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
  expect(errors).toEqual([]);
  console.log(
    "Server settings, owner-only popup, channel persistence, mobile layout, worker activation and recovery passed. Screenshots: " +
      directory,
  );
} catch (e) {
  console.error("Browser artifacts: " + directory);
  throw e;
} finally {
  await browser?.close();
  await server.stop(true);
  db.close();
  // Keep screenshots; remove only the disposable database and its sidecars.
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(join(directory, "test.sqlite" + suffix), { force: true });
}
