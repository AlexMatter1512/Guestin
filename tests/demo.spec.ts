import { expect, test, type Page } from "@playwright/test";

function watchDemoTraffic(page: Page) {
  const apiRequests: string[] = [];
  const sockets: string[] = [];
  const errors: string[] = [];
  const missingAssets: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/")) apiRequests.push(request.url());
  });
  page.on("websocket", (socket) => sockets.push(socket.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() === 404 && response.url().startsWith(new URL(page.url()).origin)) {
      missingAssets.push(response.url());
    }
  });
  return () => {
    expect(apiRequests).toEqual([]);
    expect(sockets).toEqual([]);
    expect(errors).toEqual([]);
    expect(missingAssets).toEqual([]);
  };
}

async function revealDemo(page: Page) {
  await page.locator("iframe").evaluate((iframe) => {
    iframe.scrollIntoView({ block: "center", behavior: "instant" });
  });
}

test("host edits are shared with guest and café views and reset on reload", async ({ page }) => {
  const checkTraffic = watchDemoTraffic(page);
  await page.goto("./");
  await expect(page.locator("#demo")).toHaveAttribute("data-ready", "true");
  await revealDemo(page);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Create access code", exact: true }).click();
  await frame
    .getByRole("button", { name: "Create access code Choose doors and share a guest link" })
    .click();
  await frame.getByLabel("Guest name / label").fill("Shared memory guest");
  await frame.getByRole("button", { name: "Save access code", exact: true }).click();
  await expect(frame.getByRole("link", { name: "Visit guest page", exact: true })).toBeVisible();
  await revealDemo(page);
  await frame.getByRole("button", { name: "Codes", exact: true }).click();
  await revealDemo(page);
  await frame.getByRole("button", { name: /^Shared memory guest/ }).click();
  await expect(frame.getByLabel("Guest name / label")).toHaveValue("Shared memory guest");
  await frame.getByLabel("Guest name / label").fill("Edited memory guest");
  await frame.getByRole("button", { name: "Save access code", exact: true }).click();
  await frame.getByRole("link", { name: "Visit guest page", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Guest view Guests see/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(frame.getByText("Edited memory guest", { exact: true })).toBeVisible();
  await expect(frame.getByText("Main entrance door", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Host view Create/ }).click();
  await revealDemo(page);
  await frame.getByRole("button", { name: "Settings", exact: true }).click();
  await frame.getByRole("button", { name: /Breakfast.*Breakfast page/ }).click();
  await frame.getByRole("link", { name: "Open breakfast page", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Café partner view/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(frame.getByText("Breakfasts used", { exact: true })).toBeVisible();
  await page.reload();
  await revealDemo(page);
  await expect(frame.getByRole("heading", { name: "Access codes", exact: true })).toBeVisible();
  await expect(frame.getByText("Edited memory guest", { exact: true })).toHaveCount(0);
  checkTraffic();
});

test("mobile demos, animation and documentation work at the configured deployment path", async ({
  page,
}) => {
  const checkTraffic = watchDemoTraffic(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("#demo")).toHaveAttribute("data-ready", "true");
  const animation = page.locator(".problem-animation");
  await animation.scrollIntoViewIfNeeded();
  await expect(animation).toBeVisible();
  await expect
    .poll(() => animation.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(508);
  await revealDemo(page);
  await expect(page.getByRole("switch", { name: "Mobile view" })).toHaveCount(0);
  await expect(page.locator(".demo-frame")).toHaveClass(/mobile/);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: "Access codes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Guest view Guests see/ }).click();
  await expect(frame.getByText("Main entrance door", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Café partner view/ }).click();
  await expect(frame.getByText("Breakfasts used", { exact: true })).toBeVisible();
  await page.goto("get-started/");
  await expect(
    page.getByRole("heading", { name: "Get started with Guestin", exact: true }),
  ).toBeVisible();
  const download = page.getByRole("link", { name: "compose.local.yaml ↓", exact: true });
  await expect(download).toHaveAttribute(
    "href",
    `${process.env.LANDING_BASE_PATH || "/"}compose.local.yaml`,
  );
  checkTraffic();
});

for (const width of [1440, 390]) {
  test(`manual door control resets after leaving the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("./");
    await expect(page.locator("#demo")).toHaveAttribute("data-ready", "true");
    const scene = page.locator(".door-render");
    const card = page.locator(".floating-guest");
    await scene.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: "Open door", exact: true }).click();
    await expect(card.getByRole("button", { name: "Close door", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(async () => {
      const canvasBox = await scene.locator("canvas").boundingBox();
      const artBox = await scene.locator(".door-interior-art").boundingBox();
      expect(artBox).not.toBeNull();
      expect(
        Math.abs(artBox!.x + artBox!.width / 2 - canvasBox!.x - canvasBox!.width / 2),
      ).toBeLessThan(1);
      expect(
        Math.abs(artBox!.y + artBox!.height / 2 - canvasBox!.y - canvasBox!.height / 2),
      ).toBeLessThan(1);
    }).toPass({ timeout: 15000 });
    await page.locator("#demo").scrollIntoViewIfNeeded();
    expect(
      await scene.evaluate((element) => element.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(0);
    await expect(card.getByRole("button", { name: "Open door", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await scene.scrollIntoViewIfNeeded();
    await expect(card.getByRole("button", { name: "Open door", exact: true })).toBeVisible();
    if (width === 390) {
      const sceneBox = await scene.boundingBox();
      const cardBox = await card.boundingBox();
      expect(cardBox!.y).toBeGreaterThanOrEqual(sceneBox!.y + sceneBox!.height);
    }
  });
}
