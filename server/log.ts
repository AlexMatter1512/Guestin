import { AsyncLocalStorage } from "node:async_hooks";
import {
  appendFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
export type LogLevel = "debug" | "info" | "warn" | "error";
type Actor = { id: string; name: string; role: string };
export type LogContext = {
  requestId?: string;
  method?: string;
  route?: string;
  clientIP?: string;
  actor?: Actor;
};
const context = new AsyncLocalStorage<LogContext>();
const priorities = { debug: 10, info: 20, warn: 30, error: 40 };
const keys = new Set([
  "provider",
  "operation",
  "providerStatus",
  "errorCode",
  "errorType",
  "durationMs",
  "connectionId",
  "propertyId",
  "codeId",
  "doorId",
  "outcome",
  "attempt",
  "status",
  "eventId",
  "eventType",
  "subscriptionId",
  "count",
  "port",
  "tls",
  "schema",
  "reason",
  "frames",
  "requestId",
  "method",
  "route",
  "clientIP",
  "actor",
]);
const safeString = (value: string) =>
  value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
export function sanitizeLogFields(fields: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!keys.has(key) || value === undefined) continue;
    if (key === "actor" && value && typeof value === "object") {
      const actor = value as Record<string, unknown>;
      safe.actor = Object.fromEntries(
        ["id", "name", "role"]
          .filter((k) => typeof actor[k] === "string")
          .map((k) => [k, safeString(actor[k] as string)]),
      );
    } else if (key === "frames" && Array.isArray(value))
      safe.frames = value
        .filter((v) => typeof v === "string" && /^\s*at /.test(v))
        .slice(0, 12)
        .map((v) => safeString(v));
    else if (typeof value === "string") safe[key] = safeString(value);
    else if (
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean" ||
      value === null
    )
      safe[key] = value;
  }
  return safe;
}
export function createLogger(
  options: {
    level?: LogLevel;
    file?: string | false;
    maxBytes?: number;
    rotations?: number;
    stdout?: (line: string) => void;
  } = {},
) {
  const level =
    options.level ??
    (Object.hasOwn(priorities, process.env.LOG_LEVEL ?? "")
      ? (process.env.LOG_LEVEL as LogLevel)
      : "info");
  const file =
    options.file ??
    (process.env.LOG_FILE === "-"
      ? false
      : process.env.LOG_FILE || "data/logs/server.jsonl");
  const maxBytes = Math.max(
    1024,
    options.maxBytes ?? (Number(process.env.LOG_MAX_BYTES) || 10 * 1024 * 1024),
  );
  const rotations = Math.max(
    1,
    Math.min(20, options.rotations ?? (Number(process.env.LOG_ROTATIONS) || 5)),
  );
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  return (
    levelName: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
  ) => {
    if (priorities[levelName] < priorities[level]) return;
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: levelName,
      event: safeString(event),
      ...sanitizeLogFields({ ...context.getStore(), ...fields }),
    });
    try {
      stdout(line);
    } catch {}
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      let size = 0;
      try {
        size = statSync(file).size;
      } catch {}
      if (size + Buffer.byteLength(line) + 1 > maxBytes) {
        rmSync(file + "." + rotations, { force: true });
        for (let i = rotations - 1; i >= 1; i--) {
          try {
            renameSync(file + "." + i, file + "." + (i + 1));
          } catch {}
        }
        try {
          renameSync(file, file + ".1");
        } catch {}
      }
      appendFileSync(file, line + "\n", { mode: 0o600 });
    } catch {
      try {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "error",
            event: "logging.file_unavailable",
          }),
        );
      } catch {}
    }
  };
}
export const log = createLogger();
export function withLogContext<T>(value: LogContext, fn: () => T): T {
  return context.run(value, fn);
}
export function setLogActor(user: { id: string; name: string; role: string }) {
  const current = context.getStore();
  if (current)
    current.actor = { id: user.id, name: user.name, role: user.role };
}
export function setLogResource(fields: Pick<Record<string, string>, string>) {
  const current = context.getStore();
  if (current) Object.assign(current, sanitizeLogFields(fields));
}
export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
) {
  const e = error as any;
  log("error", event, {
    ...fields,
    errorType: typeof e?.name === "string" ? e.name : "UnknownError",
    errorCode:
      typeof e?.code === "string" || typeof e?.code === "number"
        ? e.code
        : undefined,
    frames:
      typeof e?.stack === "string"
        ? e.stack
            .split("\n")
            .slice(1)
            .filter((v: string) => /^\s*at /.test(v))
        : [],
  });
}
// Log route patterns, never arbitrary client URLs, queries, fragments, or path tokens.
const routes = [
  /^\/api\/v1\/(health|me|logout|users|invites|properties|doors|codes|events|reports|connections)$/,
  /^\/api\/v1\/auth\/(status|setup|login|accept-invite)$/,
  /^\/api\/v1\/me\/preferences$/,
  /^\/api\/v1\/admin\/wipe$/,
  /^\/api\/v1\/doors\/order$/,
  /^\/api\/v1\/push\/(key|subscriptions)$/,
  /^\/api\/v1\/guest$/,
  /^\/api\/v1\/guest\/breakfast$/,
];
export function logRoute(path: string) {
  if (routes.some((re) => re.test(path))) return path;
  for (const [re, pattern] of [
    [
      /^\/api\/v1\/guest\/doors\/[^/]+\/open$/,
      "/api/v1/guest/doors/:door/open",
    ],
    [
      /^\/api\/v1\/public\/breakfast\/[^/]+$/,
      "/api/v1/public/breakfast/:property",
    ],
    [/^\/api\/v1\/templates\/[^/]+$/, "/api/v1/templates/:property"],
    [
      /^\/api\/v1\/codes\/[^/]+\/grants\/[^/]+$/,
      "/api/v1/codes/:id/grants/:doorId",
    ],
    [
      /^\/api\/v1\/codes\/[^/]+\/(revoke|regenerate|resolve)$/,
      "/api/v1/codes/:id/:action",
    ],
    [
      /^\/api\/v1\/doors\/[^/]+\/(test|resolve-test)$/,
      "/api/v1/doors/:id/:action",
    ],
    [
      /^\/api\/v1\/connections\/[^/]+\/request$/,
      "/api/v1/connections/:id/request",
    ],
    [
      /^\/api\/v1\/(users|properties|doors|codes|connections)\/[^/]+$/,
      "/api/v1/:resource/:id",
    ],
  ] as const)
    if (re.test(path)) {
      if (pattern === "/api/v1/:resource/:id")
        return "/api/v1/" + path.split("/")[3] + "/:id";
      if (pattern.endsWith("/:action"))
        return pattern.replace(":action", path.split("/").at(-1)!);
      return pattern;
    }
  return "/api/[unmatched]";
}
