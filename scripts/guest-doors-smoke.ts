import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "guestin-guest-doors-"));
const origin = "http://localhost:3095";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3095",
    ORIGIN: origin,
    DB_PATH: join(directory, "test.sqlite"),
    APP_KEY: "c".repeat(64),
    SETUP_TOKEN: "guest-doors-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const host = await browser.newContext();
  const setup = await host.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      name: "Gallery host",
      email: "gallery@example.com",
      password: "guest-gallery-password",
      setupToken: "guest-doors-setup",
    },
  });
  expect(setup.ok()).toBe(true);
  const { csrf } = await setup.json();
  async function create(path: string, data: unknown) {
    const response = await host.request.post(origin + "/api/v1/" + path, {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data,
    });
    if (!response.ok()) throw Error(path + ": " + (await response.text()));
    return response.json();
  }
  const property = await create("properties", {
    name: "Gallery house",
    timezone: "Europe/Rome",
  });
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVZsAAAAASUVORK5CYII=";
  const disabled = await create("doors", {
    propertyId: property.id,
    name: "Disabled entrance",
    enabled: false,
    order: 2,
    integration: "none",
    config: {},
  });
  const paused = await create("doors", {
    propertyId: property.id,
    name: "Paused entrance",
    order: 1,
    integration: "none",
    config: {},
    description: "The blue entrance.",
    translations: { it: "Ingresso blu" },
    descriptionTranslations: { it: "L’ingresso blu vicino al giardino." },
    photos: [
      { id: "front", url: png, alt: "Front entrance" },
      { id: "garden", url: png, alt: "Garden view" },
    ],
    primaryPhotoId: "garden",
  });
  const code = await create("codes", {
    propertyId: property.id,
    label: "Gallery guest",
    grants: [disabled, paused].map((door, index) => ({
      doorId: door.id,
      start: new Date(Date.now() - 3600000).toISOString(),
      end: new Date(Date.now() + 86400000).toISOString(),
      singleUse: false,
      active: index === 0,
    })),
    breakfast: null,
  });
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
  });
  const page = await guest.newPage();
  const errors: string[] = [];
  const actions: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/open")) actions.push(r.url());
  });
  await page.goto(code.link + "&lang=it");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  const cards = page.locator("article[data-door-id]");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-door-id", paused.id);
  await expect(cards.first().getByRole("heading")).toHaveText(
    "Porta Ingresso blu",
  );
  await expect(cards.first()).toContainText(
    "L’ingresso blu vicino al giardino.",
  );
  await expect(cards.first().locator("img.door-photo")).toHaveAttribute(
    "alt",
    "Garden view",
  );
  await cards
    .first()
    .getByRole("button", { name: "Foto: Front entrance", exact: true })
    .click();
  await expect(cards.first().locator("img.door-photo")).toHaveAttribute(
    "alt",
    "Front entrance",
  );
  await expect(
    cards.first().getByRole("button", {
      name: "Clicca qui per aprire 🔓",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    cards.last().getByRole("button", {
      name: "Clicca qui per aprire 🔓",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Select language", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch to en", exact: true }).click();
  await expect(cards.first()).toContainText("The blue entrance.");
  await expect(
    cards
      .first()
      .getByRole("button", { name: "Click here to open 🔓", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(cards).toHaveCount(2);
  expect(actions).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: join(directory, "guest-gallery.png"),
    fullPage: true,
  });
  console.log(
    "Guest door state, order, localized descriptions, gallery, language link, and disabled actions passed. Screenshot: " +
      directory,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
