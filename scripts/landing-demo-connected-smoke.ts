import { chromium, expect } from "@playwright/test";
const base = process.env.LANDING_URL ?? "http://127.0.0.1:4175";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(12000);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/")) requests.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/");
  await expect(page.locator("#demo")).toHaveAttribute("data-ready", "true");
  await page.locator("iframe").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const frame = page.frameLocator("iframe");
  await frame
    .getByRole("button", { name: "Create access code", exact: true })
    .click();
  await frame
    .getByRole("button", {
      name: "Create access code Choose doors and share a guest link",
    })
    .click();
  await frame.getByLabel("Guest name / label").fill("Shared memory guest");
  await frame
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await expect(
    frame.getByRole("link", { name: "Visit guest page", exact: true }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "Codes", exact: true }).click();
  await frame.getByRole("button", { name: /^Shared memory guest/ }).click();
  await expect(frame.getByLabel("Guest name / label")).toHaveValue(
    "Shared memory guest",
  );
  await frame.getByLabel("Guest name / label").fill("Edited memory guest");
  await frame
    .getByRole("button", { name: "Save access code", exact: true })
    .click();
  await frame
    .getByRole("link", { name: "Visit guest page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Guest view Guests see/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    frame.getByText("Edited memory guest", { exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByText("Main entrance door", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Host view Create/ }).click();
  await frame.getByRole("button", { name: "Settings", exact: true }).click();
  await frame
    .getByRole("button", { name: /Breakfast.*Breakfast page/ })
    .click();
  await frame
    .getByRole("link", { name: "Open breakfast page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Café partner view/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    frame.getByText("Breakfasts used", { exact: true }),
  ).toBeVisible();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto(base + "/");
  await expect(mobile.locator("#demo")).toHaveAttribute("data-ready", "true");
  await mobile.locator("#demo").scrollIntoViewIfNeeded();
  await expect(mobile.getByRole("switch", { name: "Mobile view" })).toHaveCount(
    0,
  );
  await expect(mobile.locator(".demo-frame")).toHaveClass(/mobile/);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    "Embedded create/edit/guest/café navigation and native mobile checks passed",
  );
} finally {
  await browser.close();
}
