import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Disposable fixtures only: no external provider, actual unlock, or push delivery.
const directory = mkdtempSync(join(tmpdir(), "oshost-mobile-ui-"));
const origin = "http://localhost:3096";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3096",
    ORIGIN: origin,
    DB_PATH: join(directory, "test.sqlite"),
    APP_KEY: "b".repeat(64),
    SETUP_TOKEN: "mobile-ui-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    LOG_FILE: "-",
  },
  stdout: "pipe",
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
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    colorScheme: "light",
  });
  const setup = await context.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      name: "Demo Host",
      email: "demo@example.test",
      password: "mobile-ui-password",
      setupToken: "mobile-ui-setup",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  const headers = { Origin: origin, "X-CSRF-Token": auth.csrf };
  async function api(path: string, data: unknown, method = "POST") {
    const r = await context.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers,
      data,
    });
    if (!r.ok()) throw Error(path + " failed: " + r.status());
    return r.json();
  }
  await api(
    "me/preferences",
    { language: "en", tour: "completed", theme: "light" },
    "PATCH",
  );
  const property = await api("properties", {
    name: "Casa Aurora",
    timezone: "Europe/Rome",
  });
  const entrance = await api("doors", {
    propertyId: property.id,
    name: "Main entrance",
    integration: "none",
    config: {},
    common: true,
  });
  const room = await api("doors", {
    propertyId: property.id,
    name: "Suite 1",
    integration: "none",
    config: {},
  });
  const start = new Date(Date.now() - 3600000).toISOString();
  const end = new Date(Date.now() + 2 * 86400000).toISOString();
  for (const [index, name] of [
    "Elena Rossi",
    "Jamie Taylor",
    "Morgan Lee",
  ].entries())
    await api("codes", {
      label: name,
      propertyId: property.id,
      grants: [
        { doorId: entrance.id, start, end, singleUse: false },
        ...(index === 0
          ? [{ doorId: room.id, start, end, singleUse: false }]
          : []),
      ],
      breakfast:
        index === 0
          ? { total: 4, start: start.slice(0, 10), end: end.slice(0, 10) }
          : null,
    });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function settled() {
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  }
  async function screenshot(name: string) {
    await settled();
    await page.screenshot({ path: join(directory, name + ".png") });
  }
  await page.goto(origin + "/host/");
  await expect(page.locator(".code-row")).toHaveCount(3);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#ffffff",
  );
  await screenshot("host-codes-mobile");
  await page.locator('[data-tour="nav-doors"]').click();
  await expect(page.locator(".door-list")).toBeVisible();
  await screenshot("host-doors-mobile");
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="nav-appearance"]').click();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0a0a0a",
  );
  await page.getByRole("radio", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0a0a0a",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#ffffff",
  );
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await screenshot("host-settings-mobile-dark");

  for (const width of [375, 390, 640, 767, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('[data-tour="new-code"]').click();
    const modal = page.getByRole("dialog", { name: "Create", exact: true });
    await expect(modal).toBeVisible();
    await settled();
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(845);
    if (width < 768) {
      await expect(modal).toHaveAttribute("data-slot", "drawer-content");
      expect(Math.abs(box!.width - width)).toBeLessThan(2);
      expect(Math.abs(box!.y + box!.height - 844)).toBeLessThan(2);
    } else {
      await expect(modal).toHaveAttribute("data-slot", "dialog-content");
      expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
      expect(
        await modal.evaluate(
          (element) => getComputedStyle(element).animationName,
        ),
      ).not.toBe("none");
    }
    await expect(
      modal.getByRole("button", { name: /Create access code Choose doors/ }),
    ).toBeInViewport();
    await expect(
      modal.getByRole("button", { name: /Add door Connect an entrance/ }),
    ).toBeInViewport();
    if (width === 390) await screenshot("host-create-mobile-dark");
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(modal).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-tour="new-code"]').click();
  const create = page.getByRole("dialog", { name: "Create", exact: true });
  await create
    .getByRole("button", { name: /Create access code Choose doors/ })
    .click();
  await expect(create).toHaveCount(0);
  await expect(page.locator('[data-tour="code-form"]')).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.locator('[data-tour="new-code"]').click();
  await create
    .getByRole("button", { name: /Add door Connect an entrance/ })
    .click();
  await expect(page.locator('[data-tour="door-form"]')).toBeVisible();
  const enabled = page.getByRole("switch", {
    name: "Enabled for guest access",
    exact: true,
  });
  await expect(enabled).toHaveAttribute("data-state", "checked");
  await settled();
  const checkedColor = await enabled.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await enabled.uncheck();
  await settled();
  await expect(enabled).toHaveAttribute("data-state", "unchecked");
  expect(
    await enabled.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe(checkedColor);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-tour="new-code"]').click();
  await expect(create).toBeVisible();
  expect(
    await create.evaluate(
      (element) => parseFloat(getComputedStyle(element).animationDuration) || 0,
    ),
  ).toBeLessThanOrEqual(0.01);
  expect(
    await create.evaluate(
      (element) =>
        parseFloat(getComputedStyle(element).transitionDuration) || 0,
    ),
  ).toBeLessThanOrEqual(0.01);
  await page.keyboard.press("Escape");
  await expect(create).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Mobile drawer bounds/actions, desktop dialog, animations/reduced motion and Light/Dark/System browser colors passed. Screenshots: " +
      directory,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
