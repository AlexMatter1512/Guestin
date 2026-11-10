import { chromium, expect, type Page } from "@playwright/test";
import {
  existsSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { openDatabase } from "../server/db";
import { createApp } from "../server/app";

// Render the untouched legacy visual sources from a disposable copy. Only its
// server loader is replaced with fake data; original repositories are read-only.
const referencePath = process.env.GUESTIN_LEGACY_GUEST_ROOT;
if (!referencePath) {
  console.log(
    "SKIP: legacy guest parity is optional. Set GUESTIN_LEGACY_GUEST_ROOT to a local BnBFrontend checkout with dependencies installed.",
  );
  process.exit(0);
}
const originalRoot = resolve(referencePath);
for (const name of [
  "src",
  "static",
  "package.json",
  "svelte.config.js",
  "vite.config.ts",
  "tsconfig.json",
  "node_modules",
]) {
  if (!existsSync(join(originalRoot, name)))
    throw Error(`Legacy guest reference is missing ${name}: ${originalRoot}`);
}
const directory = mkdtempSync(join(tmpdir(), "guestin-guest-parity-"));
const referenceRoot = join(directory, "reference");
mkdirSync(referenceRoot);
for (const name of [
  "src",
  "static",
  "package.json",
  "svelte.config.js",
  "vite.config.ts",
  "tsconfig.json",
])
  cpSync(join(originalRoot, name), join(referenceRoot, name), {
    recursive: true,
  });
symlinkSync(
  join(originalRoot, "node_modules"),
  join(referenceRoot, "node_modules"),
  "dir",
);
const viteConfig = await Bun.file(join(referenceRoot, "vite.config.ts")).text();
await Bun.write(
  join(referenceRoot, "vite.config.ts"),
  viteConfig.replace(
    "allowedHosts: true,",
    "allowedHosts: true, fs: {allow: " +
      JSON.stringify([referenceRoot, originalRoot]) +
      "},",
  ),
);
const referenceOrigin = "http://localhost:3106",
  origin = "http://localhost:3107";
const now = new Date(),
  start =
    new Date(now.getTime() - 86400000).toISOString().slice(0, 10) +
    "T15:00:00.000Z",
  end =
    new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10) +
    "T10:00:00.000Z";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(now);
const reservation = {
  numero: "fixture",
  guest_name: "Nora Rossi",
  arrival_date: start.slice(0, 10),
  departure_date: end.slice(0, 10),
  nights: 3,
  rooms: "building",
  guests: "2",
  booking_channel: null,
  phone: null,
  status: null,
  checkin_message: null,
  info_message: null,
};
const fixture = {
  code: "fixture-only",
  codeInfo: {
    valid: true,
    doors: [
      {
        name: "building",
        single_use: false,
        used: false,
        times: { from: start, to: end },
        code: "fixture-only",
        translations: { it: "palazzo" },
      },
    ],
    reservation,
  },
  colazioniInfo: { remaining_colazioni: 3 },
};
await Bun.write(
  join(referenceRoot, "src/routes/guest/+layout.server.ts"),
  "export const load = async () => (" + JSON.stringify(fixture) + ");\n",
);
const reference = Bun.spawn(
  [
    "bun",
    join(originalRoot, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "3106",
    "--strictPort",
  ],
  {
    cwd: referenceRoot,
    env: { ...process.env, PUBLIC_USE_BREAKFAST_KEYWORD: "" },
    stdout: "pipe",
    stderr: "pipe",
  },
);
const db = openDatabase(join(directory, "test.sqlite"));
let deviceCalls = 0,
  deviceOutcome: "accepted" | "uncertain" = "accepted";
const app = createApp(db, {
  key: "d".repeat(64),
  setupToken: "parity-setup",
  origin,
  device: async () => {
    deviceCalls++;
    return { status: deviceOutcome, detail: "Fake provider result" };
  },
});
app.get("*", async (c) => {
  const root = resolve("apps/guest/build"),
    path = resolve(root, c.req.path.replace(/^\/guest\/?/, ""));
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  let file = Bun.file(path);
  if (!(await file.exists())) {
    if (extname(path)) return c.notFound();
    file = Bun.file(join(root, "200.html"));
  }
  return new Response(file);
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3107,
  fetch: app.fetch,
});
let cookie = "",
  csrf = "",
  browser;
async function api(
  path: string,
  body?: any,
  method = body === undefined ? "GET" : "POST",
) {
  const r = await app.request("/api/v1/" + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw Error(path + " " + r.status + " " + (await r.text()));
  return { data: (await r.json()) as any, response: r };
}
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
}
async function bounds(page: Page, selectors: Record<string, string>) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const e = document.querySelector(selector);
          if (!e) throw Error("Missing parity element " + key + " " + selector);
          const b = e.getBoundingClientRect(),
            s = getComputedStyle(e);
          return [
            key,
            {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              fontSize: s.fontSize,
              fontWeight: s.fontWeight,
              borderRadius: s.borderRadius,
              backgroundImage: s.backgroundImage,
            },
          ];
        }),
      ),
    selectors,
  );
}
function equalGeometry(reference: any, current: any, label: string) {
  for (const key of Object.keys(reference)) {
    for (const value of ["x", "y", "width", "height"])
      expect(
        Math.abs(reference[key][value] - current[key][value]),
        label + " " + key + "." + value,
      ).toBeLessThanOrEqual(1);
    for (const value of [
      "fontSize",
      "fontWeight",
      "borderRadius",
      "backgroundImage",
    ])
      expect(current[key][value], label + " " + key + "." + value).toBe(
        reference[key][value],
      );
  }
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (
          await fetch(
            referenceOrigin + "/guest/doors?code=fixture-only&lang=en",
          )
        ).ok
      )
        break;
    } catch {}
    if (reference.exitCode !== null)
      throw Error(
        "Reference Vite failed: " +
          (await new Response(reference.stderr).text()),
      );
    await Bun.sleep(100);
  }
  const setup = await api("auth/setup", {
    setupToken: "parity-setup",
    name: "Parity host",
    email: "parity@example.com",
    password: "fixture-password",
  });
  cookie = setup.response.headers.get("Set-Cookie")!.split(";")[0];
  csrf = setup.data.csrf;
  const property = (
    await api("properties", { name: "Parity house", timezone: "Europe/Rome" })
  ).data;
  const door = (
    await api("doors", {
      propertyId: property.id,
      name: "building",
      integration: "ewelink",
      config: { webhook_code: "fake-never-sent" },
      translations: { it: "palazzo" },
    })
  ).data;
  const code = (
    await api("codes", {
      propertyId: property.id,
      label: "Nora Rossi",
      grants: [{ doorId: door.id, start, end, singleUse: false }],
      breakfast: { total: 3, start: today, end: end.slice(0, 10) },
    })
  ).data;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-GB",
    timezoneId: "Europe/Rome",
    serviceWorkers: "block",
  });
  const oldPage = await context.newPage(),
    page = await context.newPage();
  const errors: string[] = [];
  for (const p of [page, oldPage]) {
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return [origin, referenceOrigin].includes(u.origin) ||
        u.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
  }
  oldPage.on("requestfailed", (r) =>
    console.error("REFERENCE FAILED", r.url(), r.failure()?.errorText),
  );
  oldPage.on("console", (m) => {
    if (m.type() === "error") console.error("REFERENCE CONSOLE", m.text());
  });
  await oldPage.goto(
    referenceOrigin + "/guest/doors?code=fixture-only&lang=en",
  );
  await page.goto(code.link + "&lang=en");
  await expect(page.getByText("Nora Rossi", { exact: true })).toBeVisible();
  await expect(
    oldPage.getByRole("heading", { name: "building door", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  for (const [name, width, height] of [
    ["mobile", 390, 844],
    ["desktop", 1100, 900],
  ] as const) {
    for (const p of [page, oldPage]) {
      await p.setViewportSize({ width, height });
      await settle(p);
    }
    const selectors = {
      header: "header",
      nav: "nav",
      main: "main",
      title: "main section > div:first-child h2",
      image: "main img",
      action: "main section button",
    };
    await Bun.write(
      join(directory, name + "-door-bounds.json"),
      JSON.stringify(
        {
          reference: await bounds(oldPage, selectors),
          guestin: await bounds(page, selectors),
        },
        null,
        2,
      ),
    );
    await oldPage.screenshot({
      path: join(directory, name + "-doors-original.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(directory, name + "-doors-guestin.png"),
      fullPage: true,
    });
    equalGeometry(
      await bounds(oldPage, selectors),
      await bounds(page, selectors),
      name + " doors",
    );
    await oldPage.screenshot({
      path: join(directory, name + "-doors-original.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(directory, name + "-doors-guestin.png"),
      fullPage: true,
    });
    await oldPage.getByRole("link", { name: /Breakfast/ }).click();
    await page.getByRole("link", { name: /Breakfast/ }).click();
    await settle(oldPage);
    await settle(page);
    const breakfastSelectors = {
      header: "header",
      nav: "nav",
      main: "main",
      title: "main h3",
      action: "main section button",
      counter: 'main section button[aria-label="Decrease amount"]',
    };
    equalGeometry(
      await bounds(oldPage, breakfastSelectors),
      await bounds(page, breakfastSelectors),
      name + " breakfast",
    );
    await oldPage.screenshot({
      path: join(directory, name + "-breakfast-original.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: join(directory, name + "-breakfast-guestin.png"),
      fullPage: true,
    });
    await oldPage.getByRole("link", { name: /Doors/ }).click();
    await page.getByRole("link", { name: /Doors/ }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Select language", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Switch to / })).toHaveCount(4);
  await page.getByRole("button", { name: "Switch to it", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Porta palazzo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select language", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch to en", exact: true }).click();
  await page.getByRole("link", { name: /Breakfast/ }).click();
  const increase = page.getByRole("button", {
      name: "Increase amount",
      exact: true,
    }),
    decrease = page.getByRole("button", {
      name: "Decrease amount",
      exact: true,
    });
  await expect(decrease).toBeDisabled();
  await increase.click();
  await increase.click();
  await expect(
    page.getByRole("button", { name: "Use 2 breakfasts", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(decrease).toBeDisabled();
  await page.getByRole("button", { name: "Max", exact: true }).click();
  await expect(increase).toBeDisabled();
  await page
    .getByRole("button", { name: "Use 3 breakfasts", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirm Use", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((db.query("SELECT COUNT(*) n FROM redemptions").get() as any).n).toBe(
    0,
  );
  await page
    .getByRole("button", { name: "Use 3 breakfasts", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/Used 3 breakfasts successfully/)).toBeVisible();
  expect(
    (db.query("SELECT SUM(quantity) n FROM redemptions").get() as any).n,
  ).toBe(3);
  await page.getByRole("link", { name: /Doors/ }).click();
  await page
    .getByRole("button", { name: "Click here to open 🔓", exact: true })
    .click();
  await expect(
    page.getByText("Request accepted", { exact: false }),
  ).toBeVisible();
  expect(deviceCalls).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 6000 });
  deviceOutcome = "uncertain";
  await page
    .getByRole("button", { name: "Click here to open 🔓", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/result is uncertain/i),
  ).toBeVisible();
  expect(deviceCalls).toBe(2);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Click here to open 🔓", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Click here to open 🔓", exact: true }),
  ).toBeDisabled();
  expect(deviceCalls).toBe(2);
  const single = (
    await api("codes", {
      propertyId: property.id,
      label: "Single-use guest",
      grants: [{ doorId: door.id, start, end, singleUse: true }],
      breakfast: null,
    })
  ).data;
  deviceOutcome = "accepted";
  await page.goto(single.link + "&lang=en");
  await expect(page.locator("nav")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Click here to open 🔓", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 6000 });
  await expect(
    page.getByRole("button", { name: "Click here to open 🔓", exact: true }),
  ).toBeDisabled();
  expect(deviceCalls).toBe(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Original BnB visual geometry and styles match on mobile/desktop doors+breakfast. Five-language menu, original controls, confirmation/cancel, live server accounting and fake device acceptance passed. Screenshots: " +
      directory,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  reference.kill();
  await reference.exited;
  server.stop(true);
  db.close();
}
