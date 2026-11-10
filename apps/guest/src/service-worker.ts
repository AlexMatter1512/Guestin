/// <reference lib="webworker" />
import { build, files, version } from "$service-worker";
const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "guestin-guest-" + version;
const ASSETS = [...build, ...files, "/guest/200.html"];
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
            .filter((key) => (key.startsWith("guestin-guest-") || key.startsWith("oshost-guest-")) && key !== CACHE)
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
    url.pathname.startsWith("/guest/")
  )
    event.respondWith(
      fetch(event.request).catch(async () => {
        const response = await caches.match("/guest/200.html");
        return response ?? Response.error();
      }),
    );
});
