import { chromium, expect } from "@playwright/test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { websocket } from "../server/realtime";
import type { MailMessage } from "../server/mail";
import { resolve } from "node:path";

// In-memory accounts, injected mail capture and a device adapter that must never run.
const db = openDatabase(":memory:");
const origin = "http://127.0.0.1:3097";
const messages: MailMessage[] = [];
const app = createApp(db, {
  key: "f".repeat(64),
  origin,
  setupToken: "test",
  mail: async (_settings, message) => {
    messages.push(message);
  },
  device: async () => {
    throw Error("Unexpected device request");
  },
});
for (const [id, role] of [
  ["owner", "owner"],
  ["colleague", "collaborator"],
]) {
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    id!,
    id!,
    `${id}@example.test`,
    await Bun.password.hash("original-password"),
    role!,
  );
  db.query("INSERT INTO user_preferences VALUES(?,?)").run(
    id!,
    JSON.stringify({ tour: "skipped", language: "en" }),
  );
}
const root = resolve("apps/host/build");
app.get("/host/*", async (c) => {
  const path = resolve(root, c.req.path.slice("/host/".length));
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  const file = Bun.file(path === root ? root + "/index.html" : path);
  return new Response(
    (await file.exists()) ? file : Bun.file(root + "/200.html"),
  );
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3097,
  websocket,
  fetch: (request, server) => app.fetch(request, { server }),
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [];
try {
  const ownerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ownerContext.newPage(),
    guest = await guestContext.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  guest.on("pageerror", (e) => errors.push(e.message));
  const login = await ownerContext.request.post(origin + "/api/v1/auth/login", {
    headers: { Origin: origin },
    data: { email: "owner@example.test", password: "original-password" },
  });
  expect(login.ok()).toBe(true);
  await guest.goto(origin + "/host/");
  await guest
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await expect(
    guest.getByRole("button", {
      name: "Send reset email (verified addresses only)",
      exact: true,
    }),
  ).toHaveCount(0);
  await guest
    .getByLabel("Email", { exact: true })
    .fill("colleague@example.test");
  await guest
    .getByRole("button", { name: "Ask for a password reset link", exact: true })
    .click();
  await expect(guest.getByRole("status")).toContainText("owners can now see");
  await page.goto(origin + "/host/#/settings/team");
  const colleague = page.getByRole("region", {
    name: "colleague",
    exact: true,
  });
  await expect(colleague).toContainText("Password reset requested");
  await colleague
    .getByRole("button", { name: "Generate password reset link", exact: true })
    .click();
  const url = await colleague
    .getByRole("textbox", { name: "Password reset link", exact: true })
    .inputValue();
  await guest.goto(url);
  await guest
    .getByLabel("New password", { exact: true })
    .fill("replacement-password");
  await guest
    .getByLabel("Confirm new password", { exact: true })
    .fill("replacement-password");
  await guest
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(guest.getByRole("status")).toContainText("Password reset.");
  await guest
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await guest
    .getByLabel("Email", { exact: true })
    .fill("colleague@example.test");
  await guest
    .getByLabel("Password", { exact: true })
    .fill("replacement-password");
  await guest.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(guest.locator(".shell")).toBeVisible();
  await page.goto(origin + "/host/#/settings/smtp");
  await page.getByLabel("SMTP host", { exact: true }).fill("smtp.example.test");
  await page.getByLabel("SMTP username", { exact: true }).fill("smtp-user");
  await page.getByLabel("SMTP password", { exact: true }).fill("smtp-secret");
  await page
    .getByLabel("Sender email", { exact: true })
    .fill("app@example.test");
  await page
    .getByRole("button", { name: "Save SMTP settings", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "SMTP settings saved" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Send test email", exact: true })
    .click();
  await expect.poll(() => messages.length).toBe(1);
  await page
    .getByRole("button", { name: "Send verification email", exact: true })
    .click();
  await expect.poll(() => messages.length).toBe(2);
  const verifyURL = messages[1]!.text.match(/http:\/\/\S+/)![0];
  await page.goto(verifyURL);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Email verified.");
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(page.locator(".shell")).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("Email verified", { exact: true })).toBeVisible();
  const recoveryContext = await browser.newContext();
  const recoveryPage = await recoveryContext.newPage();
  recoveryPage.on("pageerror", (e) => errors.push(e.message));
  await recoveryPage.goto(origin + "/host/");
  await recoveryPage
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await recoveryPage
    .getByLabel("Email", { exact: true })
    .fill("owner@example.test");
  await recoveryPage
    .getByRole("button", {
      name: "Send reset email (verified addresses only)",
      exact: true,
    })
    .click();
  await expect.poll(() => messages.length).toBe(3);
  await recoveryPage.goto(messages[2]!.text.match(/http:\/\/\S+/)![0]);
  await recoveryPage
    .getByLabel("New password", { exact: true })
    .fill("owner-replacement-password");
  await recoveryPage
    .getByLabel("Confirm new password", { exact: true })
    .fill("owner-replacement-password");
  await recoveryPage
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(recoveryPage.getByRole("status")).toContainText(
    "Password reset.",
  );
  expect(errors).toEqual([]);
  console.log(
    "Recovery browser smoke passed: owner request, account link generation, password reset and login, SMTP settings/test, email verification with an existing session. No real mail or devices used.",
  );
} finally {
  await browser.close();
  server.stop(true);
  db.close();
}
