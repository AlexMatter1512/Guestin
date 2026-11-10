/// <reference lib="webworker" />
import { build, files, version } from "$service-worker";
const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "oshost-host-" + version;
const ASSETS = [...build, ...files, "/host/200.html"];
worker.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
worker.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("oshost-host-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  ),
);
worker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== worker.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  // Theme-specific manifests must not inherit the cached light installation color.
  if (url.pathname === "/host/manifest.webmanifest") {
    event.respondWith(
      fetch(event.request).catch(
        async () =>
          (await caches.match("/host/manifest.webmanifest")) ??
          Response.error(),
      ),
    );
    return;
  }
  if (ASSETS.includes(url.pathname))
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(event.request)) ?? fetch(event.request),
        ),
    );
  else if (
    event.request.mode === "navigate" &&
    url.pathname.startsWith("/host/")
  )
    event.respondWith(
      fetch(event.request).catch(async () => {
        const response = await caches.match("/host/200.html");
        return response ?? Response.error();
      }),
    );
});
worker.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    worker.registration.showNotification(data.title, {
      body: data.body,
      tag: data.id,
      icon: data.thumbnail ?? data.icon,
      data: { url: data.url ?? null, id: data.id },
    }),
  );
});
worker.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const raw = event.notification.data?.url
        ? new URL(event.notification.data.url, worker.location.origin)
        : null;
      let url =
        raw &&
        raw.origin === worker.location.origin &&
        raw.pathname === "/host/"
          ? raw.href
          : null;
      const id = event.notification.data?.id;
      if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) {
        try {
          const session = await fetch("/api/v1/me", { credentials: "include" });
          if (session.ok) {
            const { csrf } = await session.json();
            const record = await fetch("/api/v1/events/" + id, {
              credentials: "include",
            });
            if (record.ok) {
              const notification = await record.json();
              url = notification.href
                ? new URL(notification.href, worker.location.origin).href
                : null;
            } else url = null;
            await fetch("/api/v1/events/read", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
              },
              body: JSON.stringify({ eventIds: [id] }),
            });
          }
        } catch {
          /* The click still opens the app when the network is unavailable. */
        }
      }
      const clients = await worker.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients)
        if (new URL(client.url).pathname.startsWith("/host/")) {
          if (url) await client.navigate(url);
          await client.focus();
          return;
        }
      await worker.clients.openWindow(url ?? "/host/");
    })(),
  );
});
