import { chromium, expect } from "@playwright/test";
import { openDatabase } from "../server/db";
import { formatDate } from "../shared/date-format";

import { websocket } from "../server/realtime";
import { resolve, extname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.LOG_FILE = "-";
const { createApp } = await import("../server/app");

const origin = "http://localhost:3197";
const directory = mkdtempSync(join(tmpdir(), "guestin-mobile-layout-"));
const db = openDatabase(":memory:");
let calls = 0;
const app = createApp(db, {
  origin,
  key: "b".repeat(64),
  setupToken: "staff-ui",
  device: async () => {
    calls++;
    return { status: "accepted", detail: "Fixture accepted" };
  },
});
app.get("*", async (c) => {
  const name = c.req.path.startsWith("/guest/") ? "guest" : "host";
  const root = resolve("apps", name, "build"),
    path = resolve(root, c.req.path.slice(name.length + 2));
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  let file = Bun.file(path);
  if (path === root || !(await file.exists())) {
    if (extname(path)) return c.notFound();
    file = Bun.file(join(root, "200.html"));
  }
  return new Response(file);
});
const server = Bun.serve({
  port: 3197,
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, server) =>
    app.fetch(request, { server, clientIP: "127.0.0.1" }),
});
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const setup = await context.request.post(origin + "/api/v1/auth/setup", {
    headers: { Origin: origin },
    data: {
      setupToken: "staff-ui",
      name: "Owner",
      email: "owner@example.test",
      password: "fixture-password",
    },
  });
  expect(setup.ok()).toBe(true);
  const auth = await setup.json();
  async function api(
    path: string,
    data?: any,
    method = data === undefined ? "GET" : "POST",
  ) {
    const r = await context.request.fetch(origin + "/api/v1/" + path, {
      method,
      headers: { Origin: origin, "X-CSRF-Token": auth.csrf },
      data,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  }
  await api("me/preferences", { language: "en", tour: "skipped" }, "PATCH");
  const property = await api("properties", {
    name: "Casa Aurora",
    timezone: "UTC",
  });
  // Mobile interaction and layout coverage. The device adapter above is fake.
  const entrance = await api("doors", {
    propertyId: property.id,
    name: "Main entrance",
    integration: "ewelink",
    config: { webhook_code: "fixture-only" },
    common: true,
  });
  const room = await api("doors", {
    propertyId: property.id,
    name: "Suite 1",
    integration: "none",
    config: {},
  });
  const start = new Date(Date.now() - 3600000).toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();
  const code = await api("codes", {
    propertyId: property.id,
    label: "Elena Rossi",
    notes: "Keep this private note",
    checkinLink: "https://example.test/checkin",
    instructionsLink: "https://example.test/guide",
    grants: [{ doorId: entrance.id, start, end, singleUse: false }],
    breakfast: { total: 4, start: start.slice(0, 10), end: end.slice(0, 10) },
  });
  await api("codes", {
    propertyId: property.id,
    label: "Cleaning team",
    staff: true,
    grants: [{ doorId: entrance.id, singleUse: false }],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function capture(name: string) {
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path: join(directory, name + ".png") });
  }
  async function route(hash: string, heading: string) {
    await page.goto(origin + "/host/#/" + hash);
    await expect(page.locator(".page-heading h1")).toHaveText(heading);
  }
  async function fits() {
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main *, nav")]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          right: element.getBoundingClientRect().right,
        })),
    );
    expect(overflow).toEqual([]);
  }
  await route("codes", "Access codes");
  await expect(page.locator(".code-row")).toHaveCount(1);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const searchBox = (await page
      .getByRole("button", { name: "Search codes", exact: true })
      .boundingBox())!;
    const overflowBox = (await page
      .getByRole("button", { name: "List actions", exact: true })
      .boundingBox())!;
    expect(searchBox.y).toBe(overflowBox.y);
    const tabsBox = (await page.locator(".code-view-tabs").boundingBox())!;
    const dateBox = (await page.locator(".code-toolbar").boundingBox())!;
    expect(
      Math.abs(tabsBox.y + tabsBox.height / 2 - dateBox.y - dateBox.height / 2),
    ).toBeLessThan(1);
    await fits();
    await capture("codes-" + width);
    await page.getByRole("button", { name: "Next day", exact: true }).click();
    const todayBox = (await page
      .getByRole("button", { name: "Go to today", exact: true })
      .boundingBox())!;
    const dateGroup = (await page
      .locator(".code-date-controls")
      .boundingBox())!;
    const updatedTabs = (await page.locator(".code-view-tabs").boundingBox())!;
    const updatedDate = (await page.locator(".code-toolbar").boundingBox())!;
    expect(todayBox.y).toBeGreaterThanOrEqual(
      updatedDate.y + updatedDate.height,
    );
    expect(
      Math.abs(
        updatedTabs.y +
          updatedTabs.height / 2 -
          dateGroup.y -
          dateGroup.height / 2,
      ),
    ).toBeLessThan(1);
    await fits();
    await capture("codes-future-" + width);
    await page
      .getByRole("button", { name: "Go to today", exact: true })
      .click();
    const firstRow = await page.locator(".code-row").boundingBox();
    expect(firstRow!.y).toBeLessThan(291);
    for (const button of await page.locator(".code-row-actions button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Search codes", exact: true }).click();
  const query = page.getByRole("searchbox", { name: "Search codes" });
  await expect(query).toBeFocused();
  const searchPosition = (await query.boundingBox())!;
  expect(searchPosition.y).toBeGreaterThan(
    (await page.locator(".page-heading").boundingBox())!.y,
  );
  expect(searchPosition.y).toBeLessThan(
    (await page.locator(".code-list-controls").boundingBox())!.y,
  );
  await query.fill("no matching guest");
  await expect(page.locator(".code-row")).toHaveCount(0);
  await query.press("Escape");
  await expect(query).toBeHidden();
  await expect(page.locator(".code-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Search codes", exact: true }).click();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".code-row")).toHaveCount(1);
  await query.press("Escape");
  await expect(
    page.getByRole("button", { name: "Access codes JSON", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page
    .getByRole("button", { name: "Access codes JSON", exact: true })
    .click();
  const transfer = page.getByRole("dialog", {
    name: "Access codes JSON",
    exact: true,
  });
  await expect(
    transfer.getByRole("button", { name: "Download JSON", exact: true }),
  ).toBeVisible();
  await expect(
    transfer.getByLabel("Upload JSON", { exact: true }),
  ).toBeVisible();
  await transfer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(transfer).toBeHidden();
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/#\/codes\/staff$/);
  await expect(page.locator(".code-row")).toHaveText(/Cleaning team/);
  await expect(
    page.getByRole("button", { name: "Previous day", exact: true }),
  ).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Staff", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Guests", exact: true }).click();
  await expect(page.locator(".code-row")).toHaveText(/Elena Rossi/);
  await page
    .getByRole("button", { name: "More actions for Elena Rossi", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open link", exact: true }),
  ).toHaveAttribute("href", code.link);
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Prepare message", exact: true })
    .click();
  const share = page.getByRole("dialog", {
    name: "Prepare message",
    exact: true,
  });
  await expect(share.getByLabel("Message preview")).toHaveValue(/Elena Rossi/);
  await share.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await expect(page).toHaveURL(/#\/other$/);
  const otherRows = page.locator("main .settings-row");
  await expect(otherRows.locator("strong")).toHaveText([
    "Properties",
    "Connectors",
    "Stats",
    "Breakfasts",
    "Guest Page",
    "Settings",
  ]);
  await page
    .getByRole("button", { name: "Choose favourite", exact: true })
    .click();
  await otherRows.filter({ hasText: "Breakfasts" }).click();
  await expect(
    page.locator(".quick-create + [data-tour='nav-favourite']"),
  ).toHaveText("Breakfasts");
  await page.reload();
  await page.locator("[data-tour='nav-favourite']").click();
  await expect(page.locator(".page-heading h1")).toHaveText("Breakfast");
  await expect(page.locator('[data-tour="nav-favourite"]')).toHaveClass(
    /(?:^|\s)active(?:\s|$)/,
  );
  await expect(page.locator('[data-tour="nav-other"]')).not.toHaveClass(
    /(?:^|\s)active(?:\s|$)/,
  );
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await otherRows.filter({ hasText: "Settings" }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Settings");
  for (const id of ["properties", "connectors", "reports", "breakfast"])
    await expect(page.locator(`main [data-tour="nav-${id}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Other");
  await page.reload();
  await expect(page.locator(".page-heading h1")).toHaveText("Other");
  for (const [path, title] of [
    ["settings/team", "Team"],
    ["settings/guest-links", "Guest links"],
    ["settings/smtp", "Email delivery (SMTP)"],
    ["reports", "Statistics"],
  ]) {
    await route(path, title);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(".view-content > [data-slot='card'], .view-content > .card"),
    ).toHaveCount(0);
    await fits();
    await capture(path.replaceAll("/", "-"));
  }
  await route("codes/" + code.id + "/edit", "Edit access code");
  const form = page.locator('form[data-tour="code-form"]');
  await expect(
    form.locator("h2").filter({ hasText: "Edit access code" }),
  ).toHaveCount(0);
  await expect(page.locator(".app-nav")).toBeHidden();
  const saveCode = form.getByRole("button", {
    name: "Save access code",
    exact: true,
  });
  const bar = page.locator(".mobile-form-actions");
  await expect(bar).toBeInViewport();
  const before = (await bar.boundingBox())!;
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  expect(Math.abs((await bar.boundingBox())!.y - before.y)).toBeLessThan(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture("edit-code");
  const validFrom = form.getByRole("button", {
    name: "Valid from",
    exact: true,
  });
  const originalTime = await form
    .getByLabel("Valid from · Time", { exact: true })
    .inputValue();
  const alternateDate =
    start.slice(0, 8) + (start.slice(8, 10) === "01" ? "02" : "01");
  await validFrom.click();
  await page
    .locator(`[data-value="${alternateDate}"] [data-bits-day]`)
    .first()
    .click();
  await expect(validFrom).toHaveText(formatDate(alternateDate));
  await expect(
    form.getByLabel("Valid from · Time", { exact: true }),
  ).toHaveValue(originalTime);
  await validFrom.click();
  const calendarDay = page
    .locator(`[data-value="${start.slice(0, 10)}"] [data-bits-day]`)
    .first();
  await expect(calendarDay).toBeVisible();
  await capture("date-input-calendar");
  await calendarDay.click();
  await expect(validFrom).toHaveText(formatDate(start.slice(0, 10)));
  await expect(
    form.getByLabel("Valid from · Time", { exact: true }),
  ).toHaveValue(originalTime);
  const breakfastDate = form.getByRole("button", {
    name: "First breakfast date",
    exact: true,
  });
  await breakfastDate.click();
  await page
    .locator(`[data-value="${start.slice(0, 10)}"] [data-bits-day]`)
    .first()
    .click();
  await expect(breakfastDate).toHaveText(formatDate(start.slice(0, 10)));
  await fits();
  await expect(
    form.getByLabel("Online check-in link", { exact: true }),
  ).toBeHidden();
  const optional = form
    .locator("details")
    .filter({ hasText: "Additional details" });
  await optional.locator("summary").click();
  await expect(
    form.getByLabel("Online check-in link", { exact: true }),
  ).toHaveValue("https://example.test/checkin");
  await form
    .getByLabel("Online check-in link", { exact: true })
    .fill("invalid-url");
  await optional.locator("summary").click();
  await saveCode.click();
  await expect(optional).toHaveAttribute("open", "");
  await expect(form).toBeVisible();
  await form
    .getByLabel("Online check-in link", { exact: true })
    .fill("https://example.test/updated");
  await optional.locator("summary").click();
  await saveCode.click();
  await expect(form).toHaveCount(0);
  const saved = (await api("codes")).find((item: any) => item.id === code.id);
  expect(saved.checkinLink).toBe("https://example.test/updated");
  expect(saved.instructionsLink).toBe("https://example.test/guide");
  expect(saved.notes).toBe("Keep this private note");
  expect(saved.grants).toHaveLength(1);
  expect(saved.breakfast.total).toBe(4);
  expect(saved.breakfast.start).toBe(start.slice(0, 10));
  expect(saved.grants[0].start).toBe(start.slice(0, 16) + ":00.000Z");
  await expect(page.locator(".app-nav")).toBeVisible();
  await route("codes/" + code.id + "/edit", "Edit access code");
  await form
    .getByLabel("Guest name / label", { exact: true })
    .fill("Unsaved name");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(
    (await api("codes")).find((item: any) => item.id === code.id).label,
  ).toBe("Elena Rossi");
  await route("doors", "Doors");
  await expect(page.locator(".door-list > li")).toHaveCount(2);
  await page.getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("button", { name: "Doors JSON", exact: true }).click();
  const doorsTransfer = page.getByRole("dialog", {
    name: "Doors JSON",
    exact: true,
  });
  await expect(
    doorsTransfer.getByRole("button", { name: "Download JSON", exact: true }),
  ).toBeVisible();
  await doorsTransfer
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const chevrons = await page
    .locator(".door-list button[aria-label] svg.lucide-chevron-right")
    .all();
  expect(chevrons).toHaveLength(2);
  if (chevrons.length === 2)
    expect(
      Math.abs(
        (await chevrons[0].boundingBox())!.x -
          (await chevrons[1].boundingBox())!.x,
      ),
    ).toBeLessThan(1);
  await capture("doors");
  await page
    .getByRole("button", { name: "Main entrance", exact: true })
    .click();
  await expect(page.locator(".page-heading h1")).toHaveText("Main entrance");
  await expect(
    page.getByRole("heading", { name: "Main entrance", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Delete door", exact: true }),
  ).toBeHidden();
  await page.locator("summary").filter({ hasText: "Manage door" }).click();
  await expect(
    page.getByRole("button", { name: "Delete door", exact: true }),
  ).toBeVisible();
  await capture("door-detail");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Edit door");
  await expect(
    page.getByRole("heading", { name: "Edit door", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".app-nav")).toBeHidden();
  await expect(page.locator(".mobile-form-actions")).toBeInViewport();
  await capture("edit-door");
  await page.getByLabel("Name", { exact: true }).fill("Main entrance updated");
  await page.getByRole("button", { name: "Save door", exact: true }).click();
  await expect(page.locator(".page-heading h1")).toHaveText("Doors");
  expect(
    (await api("doors")).find((item: any) => item.id === entrance.id).name,
  ).toBe("Main entrance updated");
  await route("reports", "Statistics");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".statistics-card")).toHaveCount(1);
    await expect(page.locator(".statistics-table")).toBeHidden();
    for (const label of ["Created", "Used", "Attempts", "Accepted"])
      await expect(
        page
          .locator(".statistics-card dt")
          .filter({ hasText: new RegExp("^" + label + "$") }),
      ).toBeVisible();
    await fits();
    await capture("statistics-" + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".statistics-table")).toBeVisible();
  await expect(page.locator(".statistics-cards")).toBeHidden();
  await page.setViewportSize({ width: 1650, height: 900 });
  const sidebar = page.locator(".app-nav");
  await expect(sidebar.locator(".quick-create")).toHaveCount(0);
  const other = sidebar.getByRole("button", { name: "Other", exact: true });
  await expect(other).toHaveAttribute("aria-expanded", "false");
  await other.click();
  await expect(page).toHaveURL(/#\/reports$/);
  await expect(sidebar.locator(".sidebar-other-items button")).toHaveText([
    "Properties",
    "Connectors",
    "Stats",
    "Breakfasts",
    "Guest Page",
    "Settings",
  ]);
  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await other.click();
  await expect(other).toHaveAttribute("aria-expanded", "false");
  await sidebar.getByRole("button", { name: "Codes", exact: true }).click();
  const mainBox = (await page.locator(".shell > main").boundingBox())!;
  const sideBox = (await sidebar.boundingBox())!;
  expect(
    Math.abs(mainBox.x - sideBox.width - (1650 - mainBox.x - mainBox.width)),
  ).toBeLessThan(1);
  await page
    .getByRole("button", { name: "Create access code", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/codes\/new$/);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await sidebar.getByRole("button", { name: "Doors", exact: true }).click();
  await page.getByRole("button", { name: "Add door", exact: true }).click();
  await expect(page).toHaveURL(/#\/doors\/new$/);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await route("codes/" + code.id + "/edit", "Edit access code");
  await expect(page.locator(".app-nav")).toBeVisible();
  await fits();
  await capture("edit-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  const branded = await api("codes", {
    propertyId: property.id,
    label: "Guest branding fixture",
    grants: [
      { doorId: entrance.id, start, end, singleUse: true },
      { doorId: room.id, start, end, singleUse: false },
    ],
  });
  const guest = await context.newPage();
  guest.on("pageerror", (error) => errors.push(error.message));
  await guest.goto(branded.link);
  await expect(guest.getByText(/This code is single-use/)).toBeVisible();
  await expect(
    guest.getByRole("img", { name: property.name, exact: true }),
  ).toHaveCount(0);

  await route("settings/properties/" + property.id, "Edit property");
  const logo = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#6b28a6";
      context.fillRect(6, 6, 18, 18);
      return canvas.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await page
    .getByLabel("Upload property logo")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await expect(page.getByRole("img", { name: "Property logo" })).toBeVisible();
  await page
    .getByRole("button", { name: "Save property", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/settings\/properties$/);
  await guest.reload();
  await expect(
    guest.getByRole("img", { name: property.name, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await page.getByRole("button", { name: /^Guest Page Logo/ }).click();
  await expect(page).toHaveURL(/#\/settings\/guest-page$/);

  await page.getByRole("switch", { name: "Show property logo" }).check();
  const accent = page.getByLabel("Accent color");
  await accent.fill("#6b28a6");
  const intro = page.getByRole("textbox", { name: "Intro text", exact: true });
  const introEditor = page.getByRole("group", {
    name: "Intro text",
    exact: true,
  });
  await expect(intro).toHaveValue(/If it is your first access/);
  const previewButton = page.getByRole("button", {
    name: "Open guest page",
    exact: true,
  });
  async function openBrandingPreview() {
    await previewButton.click();
    const picker = page.getByRole("dialog", { name: "Choose preview doors" });
    await picker.getByRole("checkbox", { name: "Main entrance" }).check();
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      picker.getByRole("button", { name: "Open preview" }).click(),
    ]);
    await expect(
      popup.getByText("Demo only. Clicking buttons will not open doors."),
    ).toBeVisible();
    await expect(popup.locator("[data-door-id]")).toHaveCount(1);
    return popup;
  }
  await intro.fill("Welcome to Casa Aurora");
  await introEditor
    .getByRole("button", { name: "Heading", exact: true })
    .click();
  await expect(intro).toHaveValue("## Welcome to Casa Aurora");
  await intro.fill("## Welcome to Casa Aurora\n\nKeep your key handy.");
  await intro.evaluate((node) => {
    const input = node as HTMLTextAreaElement;
    const start = input.value.indexOf("key");
    input.setSelectionRange(start, start + 3);
  });
  await introEditor.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(intro).toHaveValue(/\*\*key\*\*/);
  const single = page.getByRole("textbox", {
    name: "Single-use door message",
    exact: true,
  });
  await single.fill("Take the room keys with you.");
  await single.evaluate((node) => {
    const input = node as HTMLTextAreaElement;
    const start = input.value.indexOf("room keys");
    input.setSelectionRange(start, start + 9);
  });
  await page
    .getByRole("group", { name: "Single-use door message", exact: true })
    .getByRole("button", { name: "Underline", exact: true })
    .click();
  await expect(single).toHaveValue(/<u>room keys<\/u>/);
  await page.getByRole("switch", { name: "Preview: Intro text" }).check();
  await expect(intro).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Welcome to Casa Aurora" }),
  ).toBeVisible();
  await expect(introEditor.locator("strong")).toHaveText("key");
  await page
    .getByRole("switch", { name: "Preview: Single-use door message" })
    .check();
  await expect(page.locator(".guest-markdown u")).toHaveText("room keys");
  const introLanguage = page.getByLabel("Intro text · Language");
  await introLanguage.selectOption("it");
  await intro.fill("## Benvenuti a Casa Aurora");
  await page
    .getByRole("button", { name: "Set as default language", exact: true })
    .click();
  await introLanguage.selectOption("en");
  await expect(intro).toHaveValue(/Welcome to Casa Aurora/);
  const beforeSave = await openBrandingPreview();
  await expect(
    beforeSave.getByText(/If it is your first access/),
  ).toBeVisible();
  await expect(
    beforeSave.getByRole("heading", { name: "Welcome to Casa Aurora" }),
  ).toHaveCount(0);
  await beforeSave.close();
  await capture("guest-page-settings");
  await page.getByRole("button", { name: "Save guest page settings" }).click();
  await expect
    .poll(
      async () =>
        (await api("properties")).find((p: any) => p.id === property.id)
          .guestPage?.accentColor,
    )
    .toBe("#6b28a6");
  await guest.reload();
  await expect(
    guest.getByRole("img", { name: property.name, exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByRole("heading", { name: "Welcome to Casa Aurora" }),
  ).toBeVisible();
  await expect(guest.locator(".guest-markdown u")).toHaveCount(1);
  await expect(guest.locator(".guest-markdown u")).toHaveText("room keys");
  await expect(guest.locator("button.guest-primary").first()).toHaveCSS(
    "background-color",
    "rgb(107, 40, 166)",
  );
  const afterSave = await openBrandingPreview();
  await expect(
    afterSave.getByRole("heading", { name: "Welcome to Casa Aurora" }),
  ).toBeVisible();
  await afterSave.locator("button.guest-primary").click();
  await expect(afterSave.getByRole("status")).toHaveText(
    "Demo only. No door was opened.",
  );
  await afterSave.getByRole("button", { name: "Select language" }).click();
  await afterSave.getByRole("button", { name: "Switch to fr" }).click();
  await expect(
    afterSave.getByRole("heading", { name: "Benvenuti a Casa Aurora" }),
  ).toBeVisible();
  await afterSave.close();

  await page
    .getByRole("button", { name: "Previous versions", exact: true })
    .click();
  const history = page.getByRole("dialog", { name: "Previous versions" });
  await expect(history.getByText("Original settings")).toBeVisible();
  await history.getByRole("button", { name: "Load in editor" }).click();
  await expect(intro).toHaveValue(/If it is your first access/);
  await intro.fill("Temporary text");
  await page
    .getByRole("button", { name: "Restore default", exact: true })
    .first()
    .click();
  await expect(intro).toHaveValue(/If it is your first access/);
  await guest.screenshot({ path: join(directory, "guest-page-branded.png") });

  await page.reload();
  await expect(
    guest.getByRole("img", { name: property.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Show property logo" }),
  ).toBeChecked();
  await expect(intro).toHaveValue(/Welcome to Casa Aurora/);
  await guest.close();
  await page.goto(origin + "/host/#/codes/" + code.id + "/activity");
  await expect(
    page
      .locator(".timeline-event")
      .filter({ hasText: "Access code updated" })
      .first(),
  ).toContainText("Owner");
  await page.goto(origin + "/host/#/activity/" + property.id);
  await page.getByRole("tab", { name: "Staff", exact: true }).click();
  await expect(
    page
      .locator("[data-notification-id]")
      .filter({ hasText: "Door updated" })
      .first(),
  ).toContainText("Owner updated door Main entrance updated.");
  await api("me/preferences", { language: "it", theme: "dark" }, "PATCH");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(origin + "/host/#/codes");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Ospiti", exact: true }),
  ).toBeVisible();
  await fits();
  // Theme changes animate text color; wait for foreground inheritance to settle.
  const darkForeground = await page.evaluate(
    () => getComputedStyle(document.documentElement).color,
  );
  await expect(page.locator(".page-heading h1")).toHaveCSS(
    "color",
    darkForeground,
  );
  await expect(
    page.locator(".code-summary").filter({ hasText: "Elena Rossi" }),
  ).toHaveCSS("color", darkForeground);
  await capture("codes-italian-dark");
  console.log(JSON.stringify({ directory, deviceCalls: calls, errors }));
  expect(errors).toEqual([]);
  expect(calls).toBe(0);
} finally {
  await browser?.close();
  server.stop(true);
  db.close();
}
