import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
const source = await Bun.file(
  new URL("../apps/host/src/service-worker.ts", import.meta.url),
).text();
const script = new Bun.Transpiler({ loader: "ts" }).transformSync(
  source.replace(
    /import \{ build, files, version \} from "\$service-worker";/,
    'const build=[],files=[],version="test";',
  ),
);
function fixture(href: string | null, authenticated = true) {
  const handlers: Record<string, (event: any) => void> = {},
    requests: { url: string; options: any }[] = [],
    navigations: string[] = [],
    opened: string[] = [],
    notifications: any[] = [];
  let focused = 0;
  const worker = {
    location: { origin: "https://host.example" },
    addEventListener: (type: string, fn: any) => (handlers[type] = fn),
    registration: {
      showNotification: async (title: string, options: any) =>
        notifications.push({ title, ...options }),
    },
    clients: {
      matchAll: async () => [
        {
          url: "https://host.example/host/#/codes/existing",
          navigate: async (url: string) => navigations.push(url),
          focus: async () => focused++,
        },
      ],
      openWindow: async (url: string) => opened.push(url),
    },
  };
  runInNewContext(script, {
    self: worker,
    URL,
    fetch: async (url: string, options: any) => {
      requests.push({ url, options });
      if (url === "/api/v1/me")
        return new Response(JSON.stringify({ csrf: "fixture-csrf" }), {
          status: authenticated ? 200 : 401,
        });
      if (url.startsWith("/api/v1/events/") && url !== "/api/v1/events/read")
        return new Response(JSON.stringify({ href }));
      return new Response(JSON.stringify({ ok: true }));
    },
  });
  return {
    handlers,
    requests,
    navigations,
    opened,
    notifications,
    focused: () => focused,
  };
}
async function click(f: ReturnType<typeof fixture>, url: string | null) {
  let done: Promise<any> | undefined;
  const id = "12345678-1234-4123-8123-123456789abc";
  f.handlers.notificationclick({
    notification: { data: { id, url }, close() {} },
    waitUntil: (promise: Promise<any>) => (done = promise),
  });
  await done;
  return id;
}
test("native push clicks refresh their destination and mark the event read using the current session and CSRF", async () => {
  const f = fixture("/host/#/codes/current");
  const id = await click(f, "/host/#/codes/stale");
  expect(f.navigations).toEqual(["https://host.example/host/#/codes/current"]);
  expect(f.focused()).toBe(1);
  const read = f.requests.find((r) => r.url === "/api/v1/events/read")!;
  expect(read.options).toMatchObject({
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": "fixture-csrf" },
  });
  expect(JSON.parse(read.options.body)).toEqual({ eventIds: [id] });
});
test("an invalid-attempt push click marks it read and focuses the current page without navigating", async () => {
  const f = fixture(null);
  await click(f, null);
  expect(f.navigations).toEqual([]);
  expect(f.focused()).toBe(1);
  expect(f.opened).toEqual([]);
  expect(f.requests.some((r) => r.url === "/api/v1/events/read")).toBe(true);
});
test("push icons/thumbnails are used and expired sessions cannot mark notifications read", async () => {
  const f = fixture(null, false);
  let done: Promise<any> | undefined;
  f.handlers.push({
    data: {
      json: () => ({
        id: "notice",
        title: "Door used",
        body: "Opened",
        icon: "data:image/svg+xml,fixture",
        thumbnail: "/api/v1/doors/door/thumbnail",
        url: null,
      }),
    },
    waitUntil: (promise: Promise<any>) => (done = promise),
  });
  await done;
  expect(f.notifications[0]).toMatchObject({
    title: "Door used",
    icon: "/api/v1/doors/door/thumbnail",
    data: { id: "notice", url: null },
  });
  await click(f, "https://untrusted.example/");
  expect(f.requests.some((r) => r.url === "/api/v1/events/read")).toBe(false);
  expect(f.navigations).toEqual([]);
});
