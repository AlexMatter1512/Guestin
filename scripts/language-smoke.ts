import { chromium, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "oshost-language-")),
  origin = "http://localhost:3097";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3097",
    ORIGIN: origin,
    DB_PATH: join(dir, "test.sqlite"),
    APP_KEY: "f".repeat(64),
    SETUP_TOKEN: "language-test-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "it-IT",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/host/");
  await page.getByLabel("Your name").fill("Host italiano");
  await page.getByLabel("Setup token").fill("language-test-setup");
  await page.getByLabel("Email", { exact: true }).fill("it@example.com");
  await page.getByLabel("Password", { exact: true }).fill("language-password");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const chooser = page.getByRole("dialog", { name: /Choose your language/ });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("radio")).toHaveCount(2);
  await expect(
    chooser.getByRole("radio", { name: "Italiano", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await expect(page.locator("[data-tour-highlighted]")).toHaveCount(0);
  await page.screenshot({ path: join(dir, "language-choice.png") });
  await chooser.getByRole("radio", { name: "Italiano", exact: true }).check();
  await chooser.getByRole("button", { name: "Continue / Continua" }).click();
  await expect(chooser).not.toBeVisible();
  const tour = page.getByRole("region", {
    name: "Configurazione guidata",
    exact: true,
  });
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading")).toHaveText(
    "Crea la tua prima struttura",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page.locator('[data-tour="nav-settings"]')).toHaveText(
    "Impostazioni",
  );
  await page.screenshot({
    path: join(dir, "italian-guide.png"),
    fullPage: true,
  });
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
  const property = page.locator('[data-tour="property-form"]');
  await property.getByLabel("Nome", { exact: true }).fill("Athena");
  await property
    .getByRole("button", { name: "Aggiungi struttura", exact: true })
    .click();
  await expect(tour.getByRole("heading")).toHaveText(
    "Aggiungi la tua prima porta",
  );
  await page.locator('[data-tour="nav-doors"]').click();
  await page.locator('[data-tour="add-door"]').click();
  const door = page.locator('[data-tour="door-form"]');
  await door.getByLabel("Nome", { exact: true }).fill("Ingresso di esempio");
  await expect(
    door.getByRole("combobox", { name: "Integrazione", exact: true }),
  ).toHaveValue("none");
  await expect(tour).toContainText("connettore per il dispositivo più tardi");
  await door.getByRole("button", { name: "Salva porta", exact: true }).click();
  await page.locator('[data-tour="new-code"]').click();
  await page
    .getByLabel("Nome ospite / etichetta", { exact: true })
    .fill("Primo ospite");
  await page.getByRole("checkbox", { name: /Ingresso di esempio/ }).check();
  await page
    .getByRole("button", { name: "Salva codice di accesso", exact: true })
    .click();
  await expect(tour.getByRole("heading")).toHaveText(
    "Il tuo primo codice di accesso è pronto",
  );
  await tour
    .getByRole("button", { name: "Termina configurazione", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await (await fetch("/api/v1/me")).json()).user.preferences.tour,
      ),
    )
    .toBe("completed");
  await page.reload();
  await expect(page.locator("header h1")).toHaveText("Codici di accesso");
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await expect(chooser).not.toBeVisible();
  await page.locator('[data-tour="nav-settings"]').click();
  await page.locator('[data-tour="nav-language"]').click();
  const language = page.getByRole("radiogroup", {
    name: "Lingua dell’app",
    exact: true,
  });
  await expect(language.getByRole("radio")).toHaveCount(2);
  await language.getByRole("radio", { name: /English/ }).click();
  await expect(page.locator("header h1")).toHaveText("App language");
  await expect(
    page
      .getByRole("radiogroup", { name: "App language", exact: true })
      .getByRole("radio", { name: /English/ }),
  ).toBeChecked();
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await (await fetch("/api/v1/me")).json()).user.preferences.language,
      ),
    )
    .toBe("en");
  await page.reload();
  await expect(page.locator("header h1")).toHaveText("App language");
  await expect(page).toHaveURL(/#\/settings\/language$/);
  await expect(chooser).not.toBeVisible();
  // Server preferences survive a fresh browser with no local-storage flags.
  const secondContext = await browser.newContext({ locale: "it-IT" });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(origin + "/host/");
  await secondPage.getByLabel("Email", { exact: true }).fill("it@example.com");
  await secondPage
    .getByLabel("Password", { exact: true })
    .fill("language-password");
  await secondPage
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(secondPage.locator("header h1")).toHaveText("Access codes");
  await expect(secondPage.locator("html")).toHaveAttribute("lang", "en");
  await expect(secondPage.locator(".guided-setup")).toHaveCount(0);
  await expect(
    secondPage.getByRole("dialog", { name: /Choose your language/ }),
  ).not.toBeVisible();
  const savedPreferences = await secondPage.evaluate(
    async () => (await (await fetch("/api/v1/me")).json()).user.preferences,
  );
  expect(savedPreferences).toMatchObject({ language: "en", tour: "completed" });
  await secondContext.close();
  // Completion is independent of a missing language preference. Replaying
  // explicitly asks for a language when the saved preference is null.
  await page.evaluate(async () => {
    const { csrf } = await (await fetch("/api/v1/me")).json();
    const response = await fetch("/api/v1/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ language: null }),
    });
    if (!response.ok) throw Error("Could not clear language fixture");
    localStorage.clear();
  });
  await page.reload();
  await expect(page.locator("header h1")).toHaveText("App language");
  await expect(chooser).not.toBeVisible();
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Take the app tour", exact: true })
    .click();
  await expect(chooser).toBeVisible();
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await chooser.getByRole("radio", { name: "English", exact: true }).check();
  await chooser
    .getByRole("button", { name: "Skip tour / Salta il tour", exact: true })
    .click();
  await expect(chooser).not.toBeVisible();
  await expect(page.locator(".guided-setup")).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await (await fetch("/api/v1/me")).json()).user.preferences.tour,
      ),
    )
    .toBe("skipped");
  const records = await page.evaluate(
    async () =>
      await Promise.all(
        ["properties", "doors", "codes"].map(
          async (p) => (await (await fetch("/api/v1/" + p)).json()).length,
        ),
      ),
  );
  expect(records).toEqual([1, 1, 1]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Language smoke passed: explicit EN/IT choice before tour, Italian guided setup, core labels, persistence, Settings changes, completed-user replay, and mobile layout. Screenshots: " +
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
