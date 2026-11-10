import { chromium, expect } from "@playwright/test";
async function replayTour(page: any) {
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="app-tour"]').click();
}
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "guestin-host-features-")),
  origin = "http://localhost:3094";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3094",
    ORIGIN: origin,
    DB_PATH: join(dir, "test.sqlite"),
    APP_KEY: "c".repeat(64),
    SETUP_TOKEN: "feature-setup",
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
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    serviceWorkers: "block",
  });
  const auth = await (
    await context.request.post(origin + "/api/v1/auth/setup", {
      headers: { Origin: origin },
      data: {
        name: "Feature Host",
        email: "host@example.com",
        password: "feature-password",
        setupToken: "feature-setup",
      },
    })
  ).json();
  const headers = { Origin: origin, "X-CSRF-Token": auth.csrf };
  async function api(
    path: string,
    data?: any,
    method = data === undefined ? "GET" : "POST",
  ) {
    const r = await context.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers,
      data,
    });
    if (!r.ok()) throw Error(path + ": " + (await r.text()));
    return r.json();
  }
  await api("me/preferences", { tour: "skipped", language: "en" }, "PATCH");
  const p = await api("properties", {
    name: "Feature property",
    timezone: "Europe/Rome",
  });
  const door = await api("doors", {
    propertyId: p.id,
    name: "Entrance",
    integration: "none",
    config: {},
  });
  const start = new Date(Date.now() - 3600000).toISOString(),
    end = new Date(Date.now() + 86400000).toISOString();
  const payload = {
    propertyId: p.id,
    label: "Feature Guest",
    notes: "Arrival note",
    grants: [{ doorId: door.id, start, end, singleUse: false }],
    breakfast: null,
  };
  const code = await api("codes", payload);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/");
  await expect(page.locator(".page-heading h1")).toHaveText("Access codes");
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await page.locator(".code-summary").click();
  await expect(page).toHaveURL(new RegExp("/host/#/codes/" + code.id + "$"));
  await expect(page.getByText("Successful requests: 0")).toBeVisible();
  await page
    .getByRole("button", { name: "Pause permission", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume permission", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Resume permission", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/edit$"));
  await page
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await expect(page.locator('form[data-tour="code-form"]')).toHaveCount(0);
  expect((await api("codes"))[0].grants[0].active).toBe(false);
  await page.locator(".code-summary").click();
  await page
    .getByRole("button", { name: "Resume permission", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Expired");
  await expect(page.locator("[data-code-id]")).toHaveCount(0);
  await page
    .locator(".filter-panel")
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(page.locator("[data-code-id]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Prepare message", exact: true })
    .click();
  const share = page.getByRole("dialog", {
    name: "Prepare message",
    exact: true,
  });
  await share.getByLabel("Language", { exact: true }).selectOption("it");
  await expect(share.getByLabel("Message preview")).toHaveValue(
    /Ciao Feature Guest/,
  );
  await expect(share.getByLabel("Message preview")).toHaveValue(/&lang=it/);
  await share.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="nav-appearance"]').click();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: join(dir, "dark-settings.png") });
  await page.reload();
  await expect(page.locator(".page-heading h1")).toHaveText("Appearance");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-tour="nav-messages"]').click();
  await page.getByLabel("Message template", { exact: true }).fill("Hello ");
  await page.getByRole("button", { name: "{{guest}}", exact: true }).click();
  await expect(page.locator(".message-preview")).toHaveText(
    "Hello Maria Rossi",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  await expect(
    page.getByLabel("Message template", { exact: true }),
  ).toHaveValue(/door access link/);
  await page.goBack();
  await expect(page.locator(".page-heading h1")).toHaveText("Settings");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "host@example.com",
  );
  await page.locator('[data-tour="nav-codes"]').click();
  await page.locator('[data-tour="new-code"]').click();
  await expect(
    page.getByRole("dialog", { name: "Create", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Create", exact: true })
    .getByRole("button", { name: /Add door Connect an entrance/ })
    .click();
  await expect(page.locator('[data-tour="door-form"]')).toBeVisible();
  await expect(page).toHaveURL(/#\/doors\/new$/);
  // History and reload preserve unpublished drafts.
  await page.locator('[data-tour="nav-codes"]').click();
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("button", { name: /Create access code Choose doors/ })
    .click();
  await page
    .getByLabel("Guest name / label", { exact: true })
    .fill("History draft");
  await page.locator('[data-tour="nav-settings"]').click();
  await page.goBack();
  await expect(
    page.getByLabel("Guest name / label", { exact: true }),
  ).toHaveValue("History draft");
  await page.reload();
  await expect(
    page.getByLabel("Guest name / label", { exact: true }),
  ).toHaveValue("History draft");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  // Duplicate warnings do not create or publish data after cancellation.
  await api("codes", payload);
  await page.reload();
  await page.locator(`[data-code-id="${code.id}"] .code-summary`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByText(
      "An identical access code already exists. Saving requires confirmation.",
      { exact: true },
    ),
  ).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await expect(page.locator('[data-tour="code-form"]')).toBeVisible();
  expect((await api("codes")).length).toBe(2);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  // Completing another account must not inherit the owner's replayed tour/draft.
  const invitation = await api("invites", {});
  const inviteToken = new URLSearchParams(
    new URL(invitation.link).hash.slice(1),
  ).get("invite");
  const staffContext = await browser.newContext();
  const staffAuth = await (
    await staffContext.request.post(origin + "/api/v1/auth/accept-invite", {
      headers: { Origin: origin },
      data: {
        name: "Completed Staff",
        email: "staff@example.com",
        password: "staff-password",
        invite: inviteToken,
      },
    })
  ).json();
  await staffContext.request.patch(origin + "/api/v1/me/preferences", {
    headers: { Origin: origin, "X-CSRF-Token": staffAuth.csrf },
    data: { tour: "completed", language: "en" },
  });
  await staffContext.close();
  await replayTour(page);
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByLabel("Guest name / label", { exact: true })
    .fill("Owner private draft");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("staff@example.com");
  await page.getByLabel("Password", { exact: true }).fill("staff-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Access codes");
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await expect(page.locator('[data-tour="code-form"]')).toHaveCount(0);
  await page.locator('[data-tour="nav-settings"]').click();
  await expect(
    page.getByRole("button", { name: "Wipe database…", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("host@example.com");
  await page.getByLabel("Password", { exact: true }).fill("feature-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Access codes");
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="nav-data"]').click();
  await page
    .getByRole("button", { name: "Wipe database…", exact: true })
    .click();
  const wipe = page.getByRole("button", {
    name: "Permanently wipe database",
    exact: true,
  });
  await expect(wipe).toBeDisabled();
  await page.getByRole("switch", { name: /I have a backup/ }).check();
  await page
    .getByLabel("Current password", { exact: true })
    .fill("wrong-password");
  await page
    .getByLabel("Type WIPE ALL DATA to confirm", { exact: true })
    .fill("WIPE ALL DATA");
  await wipe.click();
  await expect(page.getByRole("alert")).toContainText(
    "Current password is incorrect",
  );
  expect((await api("codes")).length).toBe(2);
  await page
    .getByLabel("Current password", { exact: true })
    .fill("feature-password");
  await wipe.click();
  await expect(
    page.getByRole("heading", { name: "Set up your workspace", exact: true }),
  ).toBeVisible();
  expect(
    (await (await context.request.get(origin + "/api/v1/auth/status")).json())
      .needsSetup,
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Host feature smoke passed: deep links/back, permissions, filters, translated sharing, templates, theme persistence, account, quick-create and guarded wipe in a disposable database. " +
      dir,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
