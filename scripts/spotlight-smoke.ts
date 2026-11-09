import { chromium, expect, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A fresh, disposable workspace; never invokes a device or provider.
const directory = mkdtempSync(join(tmpdir(), "oshost-spotlight-"));
const origin = "http://localhost:3096";
const server = Bun.spawn(["bun", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "3096",
    ORIGIN: origin,
    DB_PATH: join(directory, "test.sqlite"),
    APP_KEY: "f".repeat(64),
    SETUP_TOKEN: "spotlight-test-setup",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let browser;
const errors: string[] = [];
async function aligned(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(
          '[data-tour-highlighted="true"]',
        );
        const spotlight = document.querySelector<HTMLElement>(
          "[data-tour-spotlight]",
        );
        if (!target || !spotlight) return false;
        const a = target.getBoundingClientRect(),
          b = spotlight.getBoundingClientRect();
        const style = getComputedStyle(spotlight);
        return (
          Math.abs(a.x - b.x - 9) < 1 &&
          Math.abs(a.y - b.y - 9) < 1 &&
          Math.abs(a.width - b.width + 18) < 1 &&
          Math.abs(a.height - b.height + 18) < 1 &&
          style.pointerEvents === "none" &&
          style.boxShadow !== "none"
        );
      }),
    )
    .toBe(true);
}
async function readable(page: Page, selector: string) {
  const contrasts = await page.locator(selector).evaluateAll((elements) => {
    // getComputedStyle can return oklch() for the neutral theme tokens. Let
    // the browser convert every supported color space to sRGB before WCAG math.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const values = Array.from(context.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    return elements.map((element) => {
      let parent: Element | null = element;
      let background = "rgb(255, 255, 255)";
      while (parent) {
        const value = getComputedStyle(parent).backgroundColor;
        if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
          background = value;
          break;
        }
        parent = parent.parentElement;
      }
      const a = luminance(getComputedStyle(element).color),
        b = luminance(background);
      return {
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        text: element.textContent?.trim(),
        color: getComputedStyle(element).color,
        background,
      };
    });
  });
  expect(contrasts.length).toBeGreaterThan(0);
  for (const contrast of contrasts)
    expect(contrast.ratio, JSON.stringify(contrast)).toBeGreaterThanOrEqual(
      4.5,
    );
}

try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin + "/api/v1/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/host/");
  await page.getByLabel("Your name").fill("Spotlight Host");
  await page.getByLabel("Setup token").fill("spotlight-test-setup");
  await page.getByLabel("Email", { exact: true }).fill("spotlight@example.com");
  await page.getByLabel("Password", { exact: true }).fill("spotlight-password");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const language = page.getByRole("dialog", { name: /Choose your language/ });
  await expect(language).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await readable(
    page,
    "dialog[open] h2, dialog[open] h2 span, dialog[open] p, dialog[open] legend, dialog[open] label, dialog[open] button",
  );
  await page.screenshot({ path: join(directory, "dark-language-choice.png") });
  await language.getByRole("radio", { name: "English", exact: true }).check();
  await language
    .getByRole("button", { name: "Continue / Continua", exact: true })
    .click();
  await aligned(page);
  await readable(
    page,
    ".guided-setup h2, .guided-setup p, .guided-setup small, .guide-top span, .guide-top button",
  );
  await page.screenshot({ path: join(directory, "dark-spotlight.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: join(directory, "desktop-spotlight.png") });
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
  await expect(page.locator('[data-tour="property-form"]')).toHaveAttribute(
    "data-tour-highlighted",
    "true",
  );
  await aligned(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await aligned(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await aligned(page);
  const guide = page.getByRole("region", { name: "Guided setup" });
  await expect(
    guide.getByRole("button", { name: "Skip tour", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: join(directory, "mobile-form-spotlight.png") });
  await guide.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0);
  await expect(page.locator("[data-tour-highlighted]")).toHaveCount(0);
  await expect(page.locator('[data-tour="property-form"]')).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Spotlight dark contrast, desktop/mobile alignment, scroll, resize, target clicks and skip cleanup passed. Screenshots: " +
      directory,
  );
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
