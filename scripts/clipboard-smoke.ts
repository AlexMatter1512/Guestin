import { chromium, expect } from "@playwright/test";

// Disposable page and invented values. No database, existing tokens, real device,
// external provider, or operating-system clipboard is used by this test.
const bundle = await Bun.build({
  entrypoints: ["apps/host/src/lib/browser.ts"],
  target: "browser",
  format: "esm",
});
if (!bundle.success) throw Error("Browser helper bundle failed");
const script = await bundle.outputs[0]!.text();
const html = `<!doctype html><html><body>
<input id="before" value="typing here"><button id="copy">Copy link</button><button id="code">Copy code</button><button id="uuid">Create request</button><output id="result"></output>
<dialog id="dialog"><button id="modal-copy">Copy in dialog</button></dialog>
<script type="module">
import {copyText,randomUUID,guestToken} from '/browser.js';
const fixture='http://example.test/guest/#code=fixture_only&lang=it';
const result=document.querySelector('#result');
for(const id of ['copy','code','modal-copy']) document.querySelector('#'+id).onclick=async()=>{
result.textContent=await copyText(id==='code'?guestToken(fixture):fixture)?'copied':'manual';
};
document.querySelector('#uuid').onclick=()=>result.textContent=randomUUID();
window.helpersReady=true;
</script></body></html>`;
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 3093,
  fetch(request) {
    return new Response(
      new URL(request.url).pathname === "/browser.js" ? script : html,
      {
        headers: {
          "Content-Type":
            new URL(request.url).pathname === "/browser.js"
              ? "application/javascript"
              : "text/html",
        },
      },
    );
  },
});
let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--host-resolver-rules=MAP oshost-lan.test 127.0.0.1",
      "--no-proxy-server",
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://oshost-lan.test:3093/");
  await page.waitForFunction(() => (window as any).helpersReady);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  expect(await page.evaluate(() => typeof navigator.clipboard)).toBe(
    "undefined",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value(command: string) {
        const field = document.activeElement as HTMLTextAreaElement;
        (window as any).copiedValue = field.value.slice(
          field.selectionStart,
          field.selectionEnd,
        );
        return command === "copy";
      },
    });
  });
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator("#result")).toHaveText("copied");
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    "http://example.test/guest/#code=fixture_only&lang=it",
  );
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    "fixture_only",
  );
  await expect(
    page.getByRole("button", { name: "Copy code", exact: true }),
  ).toBeFocused();
  expect(await page.locator("textarea").count()).toBe(0);
  await page
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await expect(page.locator("#result")).toHaveText(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  await page.evaluate(() =>
    (document.querySelector("dialog") as HTMLDialogElement).showModal(),
  );
  await page
    .getByRole("button", { name: "Copy in dialog", exact: true })
    .click();
  await expect(page.locator("#result")).toHaveText("copied");
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    "http://example.test/guest/#code=fixture_only&lang=it",
  );
  await page.evaluate(() =>
    (document.querySelector("dialog") as HTMLDialogElement).close(),
  );
  await page.evaluate(() =>
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    }),
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator("#result")).toHaveText("manual");
  // Secure-context fallback succeeds only if the Clipboard API resolves.
  await page.goto("http://localhost:3093/");
  await page.waitForFunction(() => (window as any).helpersReady);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as any).copiedValue = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(page.locator("#result")).toHaveText("copied");
  expect(await page.evaluate(() => (window as any).copiedValue)).toBe(
    "fixture_only",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator("#result")).toHaveText("manual");
  expect(errors).toEqual([]);
  console.log(
    "Clipboard smoke passed: actual HTTP insecure context, exact link/code selection, native-modal focus, UUID fallback, missing/denied APIs and explicit manual-copy result. No OS clipboard writes.",
  );
} finally {
  await browser?.close();
  server.stop(true);
}
