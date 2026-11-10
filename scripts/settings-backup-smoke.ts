import { chromium, expect, type Browser } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localDate } from "../shared/schema";
import { nextDate } from "../shared/draft-defaults";

const directory = mkdtempSync(join(tmpdir(), "guestin-settings-backup-"));
const instances = [3113, 3114].map((port, index) => {
  const origin = `http://localhost:${port}`;
  const process = Bun.spawn(["bun", "server/index.ts"], {
    env: {
      ...Bun.env,
      PORT: String(port),
      ORIGIN: origin,
      DB_PATH: join(directory, `instance-${index}`, "test.sqlite"),
      APP_KEY: (index ? "d" : "c").repeat(64),
      SETUP_TOKEN: "settings-backup-setup",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      LOG_FILE: "-",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { origin, process };
});
let browser: Browser | undefined;
try {
  for (const { origin } of instances)
    for (let n = 0; n < 80; n++) {
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) break;
      } catch {}
      await Bun.sleep(100);
    }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  async function account(index: number) {
    const origin = instances[index].origin;
    const context = await browser!.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: "block",
    });
    const setup = await context.request.post(origin + "/api/v1/auth/setup", {
      headers: { Origin: origin },
      data: {
        name: index ? "Restore host" : "Demo host",
        email: `host-${index}@example.test`,
        password: "settings-backup-password",
        setupToken: "settings-backup-setup",
      },
    });
    expect(setup.ok()).toBe(true);
    const auth = await setup.json();
    async function api(
      path: string,
      data?: unknown,
      method = data === undefined ? "GET" : "POST",
    ) {
      const r = await context.request.fetch(origin + "/api/v1/" + path, {
        method,
        headers: { Origin: origin, "X-CSRF-Token": auth.csrf },
        ...(data === undefined ? {} : { data }),
      });
      if (!r.ok()) throw Error(path + ": " + (await r.text()));
      return r.json();
    }
    await api(
      "me/preferences",
      { language: "en", tour: "completed", theme: "light" },
      "PATCH",
    );
    return { context, origin, api };
  }
  const source = await account(0),
    target = await account(1);
  const property = await source.api("properties", {
    name: "Casa Aurora",
    timezone: "Europe/Rome",
  });
  const other = await source.api("properties", {
    name: "Garden House",
    timezone: "Europe/Rome",
    defaultCheckinLink: "https://example.test/garden-in",
    defaultInstructionsLink: "https://example.test/garden-help",
  });
  const door = await source.api("doors", {
    propertyId: property.id,
    name: "Entrance",
    integration: "none",
    config: {},
    common: true,
    photos: [
      {
        id: "demo-photo",
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkAAAAABJRU5ErkJggg==",
        alt: "Demo",
      },
    ],
    primaryPhotoId: "demo-photo",
  });
  const page = await source.context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(source.origin + "/host/#/settings/guest-links");
  await page
    .getByLabel("Default check-in link", { exact: true })
    .fill("https://example.test/checkin");
  await page
    .getByLabel("Default instructions link", { exact: true })
    .fill("https://example.test/instructions");
  await page
    .getByRole("button", { name: "Save default links", exact: true })
    .click();
  await expect(
    page.getByText("Default links saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Default check-in link", { exact: true }),
  ).toHaveValue("https://example.test/checkin");
  await page.screenshot({ path: join(directory, "default-links-mobile.png") });
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("dialog", { name: "Create", exact: true })
    .getByRole("button", { name: /Create access code Choose doors/ })
    .click();
  await page
    .getByLabel("Guest name / label", { exact: true })
    .fill("Test guest");
  await expect(
    page.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://example.test/checkin");
  await page.getByLabel("Property", { exact: true }).selectOption(other.id);
  await expect(
    page.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://example.test/garden-in");
  await page
    .getByLabel("Online check-in link", { exact: true })
    .fill("https://guest.example.test/personal");
  await page.getByLabel("Property", { exact: true }).selectOption(property.id);
  await expect(
    page.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://guest.example.test/personal");
  await expect(
    page.getByLabel("Instructions link", { exact: true }),
  ).toHaveValue("https://example.test/instructions");
  expect(await page.getByRole("checkbox").count()).toBe(0);
  await page.getByRole("switch", { name: /Entrance/ }).check();
  const arrival = localDate("Europe/Rome", new Date(Date.now() + 2 * 86400000)),
    departure = nextDate(nextDate(nextDate(arrival)));
  await page.getByLabel("Valid from", { exact: true }).fill(arrival + "T15:00");
  await page.getByLabel("Valid from", { exact: true }).press("Tab");
  await page
    .getByLabel("Valid until", { exact: true })
    .fill(departure + "T11:00");
  await page.getByLabel("Valid until", { exact: true }).press("Tab");
  await page
    .getByRole("switch", { name: "Include breakfast", exact: true })
    .check();
  await expect(
    page.getByLabel("First breakfast date", { exact: true }),
  ).toHaveValue(nextDate(arrival));
  await expect(
    page.getByLabel("Last breakfast date", { exact: true }),
  ).toHaveValue(departure);
  await page.getByLabel("Total breakfasts", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await expect.poll(async () => (await source.api("codes")).length).toBe(1);
  const saved = (await source.api("codes"))[0];
  const today = localDate("Europe/Rome");
  await source.api(
    "codes/" + saved.id,
    { ...saved, breakfast: { total: 3, start: today, end: today } },
    "PUT",
  );
  const token = new URLSearchParams(new URL(saved.link).hash.slice(1)).get(
    "code",
  )!;
  const redeemed = await source.context.request.post(
    source.origin + "/api/v1/guest/breakfast",
    {
      headers: {
        Origin: source.origin,
        Authorization: "Bearer " + token,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { quantity: 2 },
    },
  );
  expect(redeemed.ok()).toBe(true);
  await page.goto(source.origin + "/host/#/settings/install");
  await expect(page.getByText("iPhone / iPad", { exact: true })).toBeVisible();
  await expect(page.getByText("Android", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Open this host app in Safari.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: join(directory, "install-app-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto(source.origin + "/host/#/settings/data");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON backup", exact: true })
    .click();
  const download = await downloadEvent,
    backupPath = join(directory, download.suggestedFilename());
  await download.saveAs(backupPath);
  const backup = await Bun.file(backupPath).json();
  expect(backup.codes[0].redemptions[0].quantity).toBe(2);
  expect(JSON.stringify(backup)).not.toContain("data:image");
  await page
    .getByLabel("Restore from JSON", { exact: true })
    .setInputFiles(backupPath);
  await expect(page.locator("[data-backup-preview]")).toContainText(
    "2 breakfasts already used",
  );
  await page
    .locator("[data-backup-preview]")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect((await source.api("codes")).length).toBe(1);
  const restoredPage = await target.context.newPage();
  restoredPage.on("pageerror", (e) => errors.push(e.message));
  let imports = 0;
  restoredPage.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/admin/import"))
      imports++;
  });
  await restoredPage.goto(target.origin + "/host/#/settings/data");
  await restoredPage
    .getByLabel("Restore from JSON", { exact: true })
    .setInputFiles(backupPath);
  const preview = restoredPage.locator("[data-backup-preview]");
  await expect(preview).toContainText(
    "2 structures · 1 doors · 1 access codes",
  );
  await expect(
    preview.getByRole("button", {
      name: "Restore missing records",
      exact: true,
    }),
  ).toBeDisabled();
  expect(imports).toBe(0);
  expect((await target.api("codes")).length).toBe(0);
  await preview.getByRole("switch", { name: /I trust this backup/ }).check();
  await preview
    .getByLabel("Type RESTORE to confirm", { exact: true })
    .fill("RESTORE");
  await preview
    .getByRole("button", { name: "Restore missing records", exact: true })
    .click();
  await expect(
    restoredPage.getByText(/Restored 2 structures, 1 doors and 1 access codes/),
  ).toBeVisible();
  expect(imports).toBe(1);
  const restoredCode = (await target.api("codes"))[0];
  expect(restoredCode.breakfastUsed).toBe(2);
  expect(restoredCode.checkinLink).toBe("https://guest.example.test/personal");
  expect(restoredCode.creatorName).toBe("Demo host");
  expect(restoredCode.link.startsWith(target.origin)).toBe(true);
  expect(new URL(restoredCode.link).hash).toBe(new URL(saved.link).hash);
  expect((await target.api("doors"))[0].photos).toEqual([]);
  expect((await target.api(`public/breakfast/${property.id}`)).today).toBe(2);
  // Same-file selection works after cancellation and a successful restore.
  await restoredPage
    .getByLabel("Restore from JSON", { exact: true })
    .setInputFiles(backupPath);
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await restoredPage
    .getByLabel("Restore from JSON", { exact: true })
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"not":"a backup"}'),
    });
  await expect(restoredPage.getByRole("alert")).toContainText(
    "No data was changed",
  );
  expect(imports).toBe(1);
  expect((await target.api("codes")).length).toBe(1);
  await target.api("me/preferences", { language: "it" }, "PATCH");
  await restoredPage.goto(target.origin + "/host/#/settings/install");
  await restoredPage.reload();
  await expect(
    restoredPage.getByText("Apri questa app host in Safari.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Settings defaults, next-day breakfast, iOS-style switches, install instructions and JSON download/restore passed. Screenshots: " +
      directory,
  );
} finally {
  await browser?.close();
  for (const instance of instances) instance.process.kill();
}
