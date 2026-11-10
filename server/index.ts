import { log, logError } from "./log";
import { openDatabase } from "./db";
import { createApp } from "./app";
import { deliverPush } from "./push";
import { realtime, websocket } from "./realtime";
import { pruneNotifications } from "./notifications";
import { resolve, extname } from "node:path";
import {
  initializeRuntimeSecrets,
  printSetupInstructions,
} from "./runtime-secrets";
process.umask(0o077);
const { secrets } = initializeRuntimeSecrets();
const db = openDatabase(process.env.DB_PATH ?? "data/oshost.sqlite");
log("info", "database.ready", { schema: 5 });
const app = createApp(db, {
  key: secrets.APP_KEY,
  setupToken: secrets.SETUP_TOKEN,
  origin: process.env.ORIGIN ?? "http://localhost:3000",
});
app.get("/breakfast/:property", async (c) =>
  c.html(await Bun.file("server/breakfast.html").text()),
);
app.get("/", (c) => c.redirect("/host/"));
app.get("/host/manifest.webmanifest", async (c) => {
  const manifest = await Bun.file(
    "apps/host/build/manifest.webmanifest",
  ).json();
  const color = c.req.query("theme") === "dark" ? "#0a0a0a" : "#ffffff";
  c.header("Cache-Control", "no-cache");
  c.header("Content-Type", "application/manifest+json");
  return c.body(
    JSON.stringify({
      ...manifest,
      theme_color: color,
      background_color: color,
    }),
  );
});
app.get("*", async (c) => {
  const appName = c.req.path.split("/")[1];
  if (!["host", "guest"].includes(appName)) return c.notFound();
  const root = resolve("apps", appName, "build"),
    path = resolve(
      root,
      decodeURIComponent(c.req.path.slice(appName.length + 2)),
    );
  if (path !== root && !path.startsWith(root + "/")) return c.notFound();
  let file = Bun.file(path);
  if (!(await file.exists())) {
    if (extname(path)) return c.notFound();
    file = Bun.file(root + "/200.html");
  }
  if (!(await file.exists()))
    return c.text("Build the PWAs with bun run build", 503);
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
  );
  c.header(
    "Cache-Control",
    path.includes("/_app/immutable/")
      ? "public,max-age=31536000,immutable"
      : "no-cache",
  );
  return new Response(file, { headers: c.res.headers });
});
let sending = false;
let nextPrune = 0;
const interval = setInterval(async () => {
  if (sending) return;
  sending = true;
  try {
    if (Date.now() >= nextPrune) {
      pruneNotifications(db);
      nextPrune = Date.now() + 3600000;
    }
    await deliverPush(db);
  } catch (e) {
    logError("push.worker_failed", e);
  } finally {
    sending = false;
  }
}, 10000);
const tls =
  process.env.TLS_CERT && process.env.TLS_KEY
    ? {
        cert: Bun.file(process.env.TLS_CERT),
        key: Bun.file(process.env.TLS_KEY),
      }
    : undefined;
const heartbeat = setInterval(() => realtime(db).heartbeat(), 25000);
const server = Bun.serve({
  websocket,
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  fetch(request, server) {
    return app.fetch(request, {
      server,
      clientIP:
        process.env.TRUST_PROXY === "1"
          ? (request.headers.get("x-real-ip") ??
            server.requestIP(request)?.address)
          : server.requestIP(request)?.address,
    });
  },
  tls,
  maxRequestBodySize: 32 * 1024 * 1024,
});
log("info", "server.started", { port: server.port, tls: !!tls, schema: 5 });
printSetupInstructions(db, secrets.SETUP_TOKEN);
const stop = () => {
  log("info", "server.stopping");
  clearInterval(interval);
  clearInterval(heartbeat);
  server.stop();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("uncaughtException", (error) => {
  logError("process.uncaught_exception", error);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  logError("process.unhandled_rejection", error);
  process.exit(1);
});
