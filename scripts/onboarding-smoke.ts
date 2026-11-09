import { chromium, expect, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every record lives in a disposable database. This test never opens a door
// or sends provider requests; it creates a deliberately unconnected example.
const dir = mkdtempSync(join(tmpdir(), "oshost-onboarding-"));
const origin = "http://localhost:3098";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3098",
    ORIGIN: origin,
    DB_PATH: join(dir, "test.sqlite"),
    APP_KEY: "e".repeat(64),
    SETUP_TOKEN: "onboarding-test-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
  stdout: "pipe",
  stderr: "pipe",
});

let browser;
const errors: string[] = [];
const externalRequests: string[] = [];
async function records(page: Page) {
  return page.evaluate(async () => {
    const entries = await Promise.all(
      ["properties", "doors", "codes", "events"].map(async (path) => {
        const response = await fetch("/api/v1/" + path);
        if (!response.ok) throw Error("Could not read " + path);
        return [path, await response.json()];
      }),
    );
    return Object.fromEntries(entries) as Record<string, any[]>;
  });
}
async function noSideEffects(page: Page, counts: [number, number, number]) {
  const current = await records(page);
  expect(current.properties).toHaveLength(counts[0]);
  expect(current.doors).toHaveLength(counts[1]);
  expect(current.codes).toHaveLength(counts[2]);
  expect(
    current.events.filter((event) => event.type.startsWith("access.")),
  ).toHaveLength(0);
  return current;
}

try {
  let healthy = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await Bun.sleep(100);
  }
  if (!healthy) throw Error("Isolated onboarding server did not start");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("data:"))
      externalRequests.push(request.url());
  });
  await page.goto(origin + "/host/");
  await page.getByLabel("Your name").fill("First Host");
  await page.getByLabel("Setup token").fill("onboarding-test-setup");
  await page.getByLabel("Email", { exact: true }).fill("first@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("onboarding-password");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const languageChoice = page.getByRole("dialog", {
    name: /Choose your language/,
  });
  await expect(languageChoice).toBeVisible();
  await languageChoice
    .getByRole("radio", { name: "English", exact: true })
    .check();
  await languageChoice
    .getByRole("button", { name: "Continue / Continua", exact: true })
    .click();

  const tour = page.getByRole("region", { name: "Guided setup" });
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading")).toHaveText(
    "Create your first property",
  );
  await expect(
    tour.getByRole("button", { name: "Skip tour", exact: true }),
  ).toBeVisible();
  await expect(
    tour.getByRole("button", { name: "Next", exact: true }),
  ).toHaveCount(0);
  // Guidance points to a real navigation button rather than switching the page.
  await expect(page.locator("header h1")).toHaveText("Access codes");
  await noSideEffects(page, [0, 0, 0]);
  await expect(page.locator('[data-tour="nav-settings"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.locator('[data-tour="nav-settings"]').click();
  await expect(page.locator('[data-tour="nav-properties"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.locator('[data-tour="nav-properties"]').click();
  await expect(page.locator('[data-tour="add-property"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.locator('[data-tour="add-property"]').click();
  await expect(page.locator("header h1")).toHaveText("Add property");
  const property = page.locator('[data-tour="property-form"]');
  await expect(property).toBeVisible();
  await expect(property).toHaveAttribute("data-tour-highlighted", "true");
  // Native validation must not advance the tour or persist an empty property.
  await property
    .getByRole("button", { name: "Add property", exact: true })
    .click();
  await noSideEffects(page, [0, 0, 0]);
  await property.getByLabel("Name", { exact: true }).fill("Athena");
  await property
    .getByRole("button", { name: "Add property", exact: true })
    .click();
  await expect(tour.getByRole("heading")).toHaveText("Add your first door");
  await expect(page.locator("header h1")).toHaveText("Properties");
  await noSideEffects(page, [1, 0, 0]);

  await expect(page.locator('[data-tour="nav-doors"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.locator('[data-tour="nav-doors"]').click();
  await expect(page.locator('[data-tour="add-door"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.locator('[data-tour="add-door"]').click();
  const door = page.locator('[data-tour="door-form"]');
  await expect(door).toHaveAttribute("data-tour-highlighted", "true");
  await door.getByLabel("Name", { exact: true }).fill("Example entrance");
  await expect(
    door.getByRole("combobox", { name: "Integration", exact: true }),
  ).toHaveValue("none");
  await expect(tour).toContainText(/connector later/i);
  // Leaving the guide should not cancel or reset a form the user is filling.
  await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(tour).not.toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await (await fetch("/api/v1/me")).json()).user.preferences.tour,
      ),
    )
    .toBe("skipped");
  await expect(door.getByLabel("Name", { exact: true })).toHaveValue(
    "Example entrance",
  );
  const skippedReload = await context.newPage();
  await skippedReload.goto(origin + "/host/");
  await skippedReload
    .getByRole("heading", { name: "Access codes", exact: true })
    .waitFor();
  await expect(
    skippedReload.getByRole("region", { name: "Guided setup" }),
  ).not.toBeVisible();
  await noSideEffects(skippedReload, [1, 0, 0]);
  await skippedReload.close();
  await page
    .getByRole("button", { name: "Take the app tour", exact: true })
    .click();
  await expect(tour.getByRole("heading")).toHaveText("Add your first door");
  await expect(door.getByLabel("Name", { exact: true })).toHaveValue(
    "Example entrance",
  );
  await door.getByRole("button", { name: "Save door", exact: true }).click();
  const afterDoor = await noSideEffects(page, [1, 1, 0]);
  expect(afterDoor.doors[0].integration).toBe("none");
  expect(afterDoor.doors[0].configured).toBe(false);

  await expect(page.locator('[data-tour="new-code"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.locator('[data-tour="new-code"]').click();
  await expect(page.locator('[data-tour="code-form"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await page.getByLabel("Guest name / label").fill("First guest");
  const permission = page.getByRole("checkbox", { name: /Example entrance/ });
  await permission.check();
  await page
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await expect(tour.getByRole("heading")).toHaveText(
    "Your first access code is ready",
  );
  const complete = await noSideEffects(page, [1, 1, 1]);
  expect(complete.codes[0].label).toBe("First guest");
  expect(complete.codes[0].grants).toHaveLength(1);
  expect(complete.codes[0].grants[0].doorId).toBe(complete.doors[0].id);
  await page.screenshot({
    path: join(dir, "guided-setup-complete.png"),
    fullPage: true,
  });
  await tour.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(tour).not.toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await (await fetch("/api/v1/me")).json()).user.preferences.tour,
      ),
    )
    .toBe("completed");
  await page.reload();
  await page
    .getByRole("heading", { name: "Access codes", exact: true })
    .waitFor();
  await expect(tour).not.toBeVisible();

  // A replay in a configured workspace reuses existing records and leaves a
  // draft alone; it must not silently start over or create duplicate examples.
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("dialog", { name: "Create", exact: true })
    .getByRole("button", { name: /^Create access code/ })
    .click();
  await page.getByLabel("Guest name / label").fill("Keep my draft");
  await page
    .getByRole("button", { name: "Take the app tour", exact: true })
    .click();
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(page.getByLabel("Guest name / label")).toHaveValue(
    "Keep my draft",
  );
  await noSideEffects(page, [1, 1, 1]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Editing a saved code is not the guide's "create first code" action.
  await page.locator('[data-tour="nav-codes"]').click();
  await page
    .locator(`[data-code-id="${complete.codes[0].id}"]`)
    .getByRole("button", { name: /First guest/ })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Guest name / label").fill("An unsaved edit");
  await page
    .getByRole("button", { name: "Take the app tour", exact: true })
    .click();
  await expect(page.locator('[data-tour="new-code"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await expect(page.locator('[data-tour="code-form"]')).not.toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await expect(tour.getByRole("heading")).toHaveText(
    "Create your first access code",
  );
  await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(page.getByLabel("Guest name / label")).toHaveValue(
    "An unsaved edit",
  );
  await noSideEffects(page, [1, 1, 1]);

  // Add a second property using authenticated fixture APIs, then switch the
  // actual form and header selectors while guided creation is in progress.
  const second = await page.evaluate(async () => {
    const { csrf } = await (await fetch("/api/v1/me")).json();
    async function create(path: string, body: unknown) {
      const response = await fetch("/api/v1/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error("Fixture creation failed: " + path);
      return response.json();
    }
    const property = await create("properties", {
      name: "Second property",
      timezone: "UTC",
    });
    const door = await create("doors", {
      propertyId: property.id,
      name: "Second example door",
      integration: "none",
      config: {},
      common: false,
      singleUse: false,
    });
    return { property, door };
  });
  await page.reload();
  await page.getByLabel("Guest name / label").waitFor();
  await page.locator('[data-tour="nav-codes"]').click();
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByRole("dialog", { name: "Create", exact: true })
    .getByRole("button", { name: /^Create access code/ })
    .click();
  await page.getByLabel("Guest name / label").fill("Second guest");
  await page
    .getByRole("button", { name: "Take the app tour", exact: true })
    .click();
  const codeForm = page.locator('[data-tour="code-form"]');
  await expect(codeForm).toHaveAttribute("data-tour-highlighted", "true");
  // The redesign shows the property selector inside the form, avoiding two
  // competing selectors. Its changes still reconcile the tour's chosen door.
  await expect(page.locator(".property-switch")).toHaveCount(0);
  const draftProperty = codeForm.getByRole("combobox", {
    name: "Property",
    exact: true,
  });
  await draftProperty.selectOption(second.property.id);
  await expect(
    codeForm.getByRole("checkbox", { name: /Second example door/ }),
  ).toBeVisible();
  await expect(
    codeForm.getByRole("checkbox", { name: /Example entrance/ }),
  ).toHaveCount(0);
  await draftProperty.selectOption(complete.properties[0].id);
  await expect(
    codeForm.getByRole("checkbox", { name: /Example entrance/ }),
  ).toBeVisible();
  await draftProperty.selectOption(second.property.id);
  await codeForm.getByRole("checkbox", { name: /Second example door/ }).check();
  await codeForm
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await expect(tour.getByRole("heading")).toHaveText(
    "Your first access code is ready",
  );
  await expect(
    page
      .locator(".property-switch")
      .getByRole("combobox", { name: "Property", exact: true }),
  ).toHaveValue(second.property.id);
  const switched = await noSideEffects(page, [2, 2, 2]);
  const switchedCode = switched.codes.find(
    (code) => code.label === "Second guest",
  );
  expect(switchedCode.propertyId).toBe(second.property.id);
  expect(switchedCode.grants).toHaveLength(1);
  expect(switchedCode.grants[0].doorId).toBe(second.door.id);
  await tour.getByRole("button", { name: "Finish setup", exact: true }).click();
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  console.log(
    "Interactive onboarding passed: real navigation, property/example-door/code creation, validation, skip/replay, persistence, and mobile layout. Screenshots: " +
      dir,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
